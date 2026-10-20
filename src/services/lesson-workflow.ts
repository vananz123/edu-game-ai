/**
 * Orchestrator for the AI lesson-to-game steps.
 *
 * `runStructuredStep` owns the shared policy for every step:
 *  - register the `requestId` so `ai:cancel` can abort it,
 *  - call the (injected) local AI client,
 *  - validate the parsed JSON,
 *  - repair once when the JSON is invalid or the shape is wrong,
 *  - translate provider failures into typed `LessonWorkflowError`s.
 *
 * The actual HTTP/llama.cpp call lives in `main.ts` behind `LessonChatClient`,
 * so this module stays unit-testable with plain mocks.
 */
import {
  AiRequestRegistry,
  AiTransportError,
  isCancelReason,
  type AiTransportCode,
  type ResponseSchemaRef
} from './ai-transport';
import {
  buildDraftPrompt,
  buildDraftRepairMessages,
  buildItemRegenerationPrompt,
  buildItemRegenerationRepairMessages,
  buildLessonAnalysisPrompt,
  buildRecommendationPrompt,
  buildRepairMessages,
  LESSON_ANALYSIS_SYSTEM_PROMPT,
  LESSON_GENERATION_SYSTEM_PROMPT,
  LESSON_ITEM_REGENERATION_SYSTEM_PROMPT,
  LESSON_RECOMMENDATION_SYSTEM_PROMPT,
  type ChatMessage
} from './lesson-prompts';
import {
  normalizeAnalysis,
  normalizeDraft,
  normalizeRecommendations
} from './lesson-normalize';
import {
  gameDraftJsonSchemas,
  lessonAnalysisJsonSchema,
  parseRegeneratedItem,
  recommendationsJsonSchema,
  regenerateItemJsonSchemas
} from './lesson-contracts';
import type {
  GameConfig,
  GameDraft,
  GameRecommendation,
  LessonAnalysis,
  WorkflowGameType
} from '../shared/lesson-types';

export type LessonWorkflowCode = AiTransportCode | 'AI_OUTPUT_INVALID';

export class LessonWorkflowError extends Error {
  readonly code: LessonWorkflowCode;

  constructor(code: LessonWorkflowCode, message: string) {
    // The `[CODE]` marker travels with the message across IPC (Electron only
    // serializes `message`), so the renderer can map failures to friendly text
    // and per-code recovery actions. `code` stays available in-process.
    super(`[${code}] ${message}`);
    this.name = 'LessonWorkflowError';
    this.code = code;
  }
}

export interface LessonChatRequest {
  requestId: string;
  messages: ChatMessage[];
  maxTokens: number;
  responseSchema?: ResponseSchemaRef | null;
  signal: AbortSignal;
}

export interface LessonChatClient {
  /** Returns the parsed JSON object produced by the model, or throws `AiTransportError`. */
  chatJson(request: LessonChatRequest): Promise<unknown>;
}

export interface StructuredStepOptions<T> {
  client: LessonChatClient;
  registry: AiRequestRegistry;
  requestId: string;
  messages: ChatMessage[];
  maxTokens: number;
  responseSchema?: ResponseSchemaRef | null;
  validate: (value: unknown) => T;
  repairMessages?: (info: {
    rawContent: string | null;
    errorMessage: string;
    messages: ChatMessage[];
  }) => ChatMessage[];
  /** Total attempts including the first; defaults to 2 (one repair). */
  maxAttempts?: number;
  /**
   * O7: called before each model attempt (1 = first, 2+ = a repair after an
   * invalid/truncated answer). Lets the UI say "đang sửa phần chưa đạt" only when
   * a repair really happens, instead of faking stages.
   */
  onAttempt?: (attempt: number) => void;
}

const REPAIRABLE_TRANSPORT_CODES: ReadonlySet<string> = new Set(['AI_INVALID_JSON', 'AI_EMPTY', 'AI_TRUNCATED']);

export async function runStructuredStep<T>(options: StructuredStepOptions<T>): Promise<T> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 2);
  let handle;
  try {
    handle = options.registry.begin(options.requestId);
  } catch (error) {
    throw toWorkflowError(error);
  }

  try {
    let messages = options.messages;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (handle.signal.aborted) {
        throw new LessonWorkflowError('AI_CANCELLED', 'Yêu cầu AI đã bị huỷ.');
      }
      if (options.onAttempt) options.onAttempt(attempt);

      let value: unknown;
      let transportError: unknown = null;
      try {
        value = await options.client.chatJson({
          requestId: options.requestId,
          messages,
          maxTokens: options.maxTokens,
          responseSchema: options.responseSchema ?? null,
          signal: handle.signal
        });
      } catch (error) {
        transportError = error;
      }

      if (transportError) {
        if (isCancellation(transportError, handle.signal)) {
          throw new LessonWorkflowError('AI_CANCELLED', 'Yêu cầu AI đã bị huỷ.');
        }
        const canRepair = transportError instanceof AiTransportError
          && REPAIRABLE_TRANSPORT_CODES.has(transportError.code)
          && attempt < maxAttempts
          && Boolean(options.repairMessages);
        if (canRepair) {
          messages = options.repairMessages!({
            rawContent: (transportError as AiTransportError).rawContent,
            errorMessage: (transportError as AiTransportError).message,
            messages
          });
          continue;
        }
        throw toWorkflowError(transportError);
      }

      try {
        return options.validate(value);
      } catch (validationError) {
        if (attempt < maxAttempts && options.repairMessages) {
          messages = options.repairMessages({
            rawContent: safeStringify(value),
            errorMessage: messageOf(validationError),
            messages
          });
          continue;
        }
        throw new LessonWorkflowError('AI_OUTPUT_INVALID', messageOf(validationError));
      }
    }
    // Unreachable: the loop either returns or throws.
    throw new LessonWorkflowError('AI_OUTPUT_INVALID', 'AI chưa trả về kết quả hợp lệ.');
  } finally {
    handle.done();
  }
}

// ---------------------------------------------------------------------------
// Step flows
// ---------------------------------------------------------------------------

export interface AnalyzeLessonOptions {
  client: LessonChatClient;
  registry: AiRequestRegistry;
  requestId: string;
  documentId: string;
  text: string;
  subject?: string;
  grade?: string;
  sourceName?: string;
  analysisId?: string;
  now?: string;
  maxTokens?: number;
  onAttempt?: (attempt: number) => void;
}

export async function analyzeLesson(options: AnalyzeLessonOptions): Promise<LessonAnalysis> {
  const analysisId = options.analysisId || defaultId('analysis');
  const createdAt = options.now || new Date().toISOString();
  return runStructuredStep({
    client: options.client,
    registry: options.registry,
    requestId: options.requestId,
    maxTokens: options.maxTokens ?? 1024,
    responseSchema: lessonAnalysisJsonSchema ? { name: 'lesson_analysis', schema: lessonAnalysisJsonSchema } : null,
    messages: [
      { role: 'system', content: LESSON_ANALYSIS_SYSTEM_PROMPT },
      {
        role: 'user',
        content: buildLessonAnalysisPrompt({
          text: options.text,
          subject: options.subject,
          grade: options.grade,
          sourceName: options.sourceName
        })
      }
    ],
    validate: value => normalizeAnalysis(value, {
      id: analysisId,
      documentId: options.documentId,
      createdAt,
      sourceDocumentIds: [options.documentId]
    }),
    repairMessages: buildRepairMessages,
    ...(options.onAttempt ? { onAttempt: options.onAttempt } : {})
  });
}

export interface RecommendGamesOptions {
  client: LessonChatClient;
  registry: AiRequestRegistry;
  requestId: string;
  analysis: LessonAnalysis;
  now?: string;
  idPrefix?: string;
  maxTokens?: number;
}

export async function recommendGames(options: RecommendGamesOptions): Promise<GameRecommendation[]> {
  const createdAt = options.now || new Date().toISOString();
  return runStructuredStep({
    client: options.client,
    registry: options.registry,
    requestId: options.requestId,
    maxTokens: options.maxTokens ?? 1024,
    responseSchema: recommendationsJsonSchema ? { name: 'game_recommendations', schema: recommendationsJsonSchema } : null,
    messages: [
      { role: 'system', content: LESSON_RECOMMENDATION_SYSTEM_PROMPT },
      { role: 'user', content: buildRecommendationPrompt({ analysis: options.analysis }) }
    ],
    validate: value => validateRecommendationsAgainstAnalysis(
      normalizeRecommendations(value, {
        analysisId: options.analysis.id,
        createdAt,
        idPrefix: options.idPrefix
      }),
      options.analysis
    ),
    repairMessages: buildRepairMessages
  });
}

/**
 * Cross-check the parsed recommendations against the analysis: every
 * `learningObjectiveIds` entry must exist. Unknown ids are treated as invalid
 * output so the repair attempt (and then the teacher) sees the real problem
 * instead of a silently broken objective link.
 */
export function validateRecommendationsAgainstAnalysis(
  recommendations: GameRecommendation[],
  analysis: LessonAnalysis
): GameRecommendation[] {
  const known = new Set(analysis.objectives.map(objective => objective.id));
  for (const recommendation of recommendations) {
    const unknown = recommendation.learningObjectiveIds.filter(id => !known.has(id));
    if (unknown.length) {
      throw new Error(
        `Đề xuất "${recommendation.title}" tham chiếu mục tiêu không tồn tại: ${unknown.join(', ')}.`
      );
    }
  }
  return recommendations;
}

export interface GenerateDraftOptions {
  client: LessonChatClient;
  registry: AiRequestRegistry;
  requestId: string;
  gameType: WorkflowGameType;
  config: GameConfig;
  analysis: LessonAnalysis;
  sourceExcerpt?: string;
  maxTokens?: number;
  onAttempt?: (attempt: number) => void;
}

export async function generateGameDraft(options: GenerateDraftOptions): Promise<GameDraft> {
  const schema = gameDraftJsonSchemas[options.gameType];
  const baseMessages: ChatMessage[] = [
    { role: 'system', content: LESSON_GENERATION_SYSTEM_PROMPT },
    {
      role: 'user',
      content: buildDraftPrompt({
        gameType: options.gameType,
        config: options.config,
        analysis: options.analysis,
        sourceExcerpt: options.sourceExcerpt
      })
    }
  ];
  return runStructuredStep({
    client: options.client,
    registry: options.registry,
    requestId: options.requestId,
    maxTokens: options.maxTokens ?? 2048,
    responseSchema: schema ? { name: `game_draft_${options.gameType}`, schema } : null,
    messages: baseMessages,
    validate: value => normalizeDraft(options.gameType, value),
    repairMessages: info => buildDraftRepairMessages({
      gameType: options.gameType,
      messages: info.messages,
      rawContent: info.rawContent,
      errorMessage: info.errorMessage
    }),
    ...(options.onAttempt ? { onAttempt: options.onAttempt } : {})
  });
}

export interface RegenerateItemOptions {
  client: LessonChatClient;
  registry: AiRequestRegistry;
  requestId: string;
  gameType: WorkflowGameType;
  config: GameConfig;
  analysis: LessonAnalysis;
  /** 1-based position and total (matches `lesson-item-repair`). */
  position: number;
  total: number;
  itemLabel: string;
  currentItem: unknown;
  issues?: string[];
  sourceExcerpt?: string;
  maxTokens?: number;
  onAttempt?: (attempt: number) => void;
}

/**
 * O5: rewrites exactly one draft item (docs/archive/specs/update-AI-local.txt §5.5). The caller
 * merges the result with `replaceDraftItem`, which keeps ids/links and re-validates
 * the whole draft. No cache: "Tạo lại" must always produce new content.
 */
export async function regenerateGameItem(options: RegenerateItemOptions): Promise<unknown> {
  const schema = regenerateItemJsonSchemas[options.gameType];
  return runStructuredStep({
    client: options.client,
    registry: options.registry,
    requestId: options.requestId,
    maxTokens: options.maxTokens ?? 1024,
    responseSchema: schema ? { name: `game_item_${options.gameType}`, schema } : null,
    messages: [
      { role: 'system', content: LESSON_ITEM_REGENERATION_SYSTEM_PROMPT },
      {
        role: 'user',
        content: buildItemRegenerationPrompt({
          gameType: options.gameType,
          config: options.config,
          analysis: options.analysis,
          itemLabel: options.itemLabel,
          position: options.position,
          total: options.total,
          currentItem: options.currentItem,
          issues: options.issues,
          sourceExcerpt: options.sourceExcerpt
        })
      }
    ],
    validate: value => parseRegeneratedItem(options.gameType, value),
    repairMessages: info => buildItemRegenerationRepairMessages({
      gameType: options.gameType,
      messages: info.messages,
      rawContent: info.rawContent,
      errorMessage: info.errorMessage
    }),
    ...(options.onAttempt ? { onAttempt: options.onAttempt } : {})
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isCancellation(error: unknown, signal: AbortSignal): boolean {
  if (error instanceof AiTransportError && error.code === 'AI_CANCELLED') return true;
  return isCancelReason(error);
}

function toWorkflowError(error: unknown): LessonWorkflowError {
  if (error instanceof LessonWorkflowError) return error;
  if (error instanceof AiTransportError) return new LessonWorkflowError(error.code, error.message);
  return new LessonWorkflowError('AI_OUTPUT_INVALID', messageOf(error));
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function safeStringify(value: unknown): string | null {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function defaultId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
