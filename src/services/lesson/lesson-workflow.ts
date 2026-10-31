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
} from '../ai/ai-transport';
import {
  buildDraftPrompt,
  buildDraftRepairMessages,
  buildDraftShortfallMessages,
  buildItemRegenerationPrompt,
  buildItemRegenerationRepairMessages,
  buildLessonAnalysisPrompt,
  buildRecommendationPrompt,
  buildRepairMessages,
  LESSON_ANALYSIS_SYSTEM_PROMPT,
  LESSON_GENERATION_SYSTEM_PROMPT,
  LESSON_ITEM_REGENERATION_SYSTEM_PROMPT,
  LESSON_RECOMMENDATION_SYSTEM_PROMPT,
  preprocessLessonContext,
  type ChatMessage
} from './lesson-prompts';
import type { PreprocessMetrics } from './lesson-preprocess';
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
import { itemCount } from './lesson-item-repair';
import { requestedItemCount } from './lesson-quality';
import { inferContentCategory } from '../../shared/content-categories';
import type {
  GameConfig,
  GameDraft,
  GameRecommendation,
  LessonAnalysis,
  WorkflowGameType
} from '../../shared/lesson-types';

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
  /**
   * O9: a structurally valid answer can still be unusable — e.g. the model
   * returned fewer items than the teacher configured. Returns a short reason, or
   * null when the answer is complete.
   */
  incompleteReason?: (value: T) => string | null;
  /** Higher wins when every attempt is incomplete; keeps the fullest answer. */
  completenessScore?: (value: T) => number;
  /** Follow-up turn for an incomplete answer (the model sees its own reply). */
  incompleteMessages?: (info: { validated: T; reason: string; attempt: number; messages: ChatMessage[] }) => ChatMessage[];
  /**
   * O10: called when a structurally valid answer is short. Diagnostics use it to
   * record what the model returned without ever storing the content itself.
   */
  onIncomplete?: (info: { reason: string; attempt: number; retrying: boolean }) => void;
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
    // O9: fullest structurally valid answer, kept in case no attempt is complete.
    let best: { value: T; score: number } | null = null;
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

      let validated: T;
      try {
        validated = options.validate(value);
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

      // O9: valid but short (fewer items than configured). Ask once more with the
      // previous answer attached; never fake a full result if the retry is short too.
      const incomplete = options.incompleteReason ? options.incompleteReason(validated) : null;
      if (!incomplete) return validated;
      const score = options.completenessScore ? options.completenessScore(validated) : 0;
      if (!best || score > best.score) best = { value: validated, score };
      const retrying = attempt < maxAttempts && Boolean(options.incompleteMessages);
      if (options.onIncomplete) options.onIncomplete({ reason: incomplete, attempt, retrying });
      if (retrying) {
        messages = options.incompleteMessages!({ validated, reason: incomplete, attempt, messages });
        continue;
      }
      return best ? best.value : validated;
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
  /** O6d: excerpt budget and ranking switch, forwarded to the preprocessor. */
  maxChars?: number;
  ranking?: boolean;
  /**
   * #58: supervised ranking query (topic / objectives / concepts). The analyse
   * step normally has none; it is here so the O6 gate and tests can run both
   * paths through the same function.
   */
  query?: string;
  /** O6d: receives the preprocessing metrics even when the step later fails. */
  onPreprocess?: (metrics: PreprocessMetrics) => void;
  /**
   * #76: the teacher's section scope from step 1. When present, the model reads
   * exactly this prepared selection (ancestor context included) instead of the
   * whole-document excerpt. Absent = today's behaviour, byte for byte.
   */
  preparedSelection?: { text: string; truncated: boolean };
  onAttempt?: (attempt: number) => void;
}

export async function analyzeLesson(options: AnalyzeLessonOptions): Promise<LessonAnalysis> {
  const analysisId = options.analysisId || defaultId('analysis');
  const createdAt = options.now || new Date().toISOString();
  // Built once so the metrics are reported exactly once and the prompt uses the
  // same excerpt the metrics describe.
  const prepared = preprocessLessonContext(options.text, {
    maxChars: options.maxChars,
    ranking: options.ranking,
    query: options.query
  });
  if (options.onPreprocess) options.onPreprocess(prepared.metrics);
  // #76: a teacher selection is already prepared and budgeted, and it respects
  // section boundaries, so re-running the whole-document preprocessor over it
  // would only re-clean text that was sliced from the same normalized source.
  // The `[Đã lược bớt …]` note keeps the prompt honest when part of the pick did
  // not fit the budget.
  const selection = options.preparedSelection;
  const excerpt = selection
    ? `${selection.truncated ? '[Phần đã chọn đã được lược bớt để vừa hạn mức của model.]\n\n' : ''}${selection.text}`
    : prepared.excerpt;
  const truncated = selection ? selection.truncated : prepared.truncated;
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
          sourceName: options.sourceName,
          prepared: { excerpt, truncated }
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
  /** O10: diagnostics hook for a short (valid but incomplete) draft. */
  onIncomplete?: (info: { reason: string; attempt: number; retrying: boolean }) => void;
}

/**
 * Phase 3 of `update_plan_6` (docs/DECISIONS.md #63): fill `contentCategory`
 * when the model omitted it.
 *
 * The prompt asks for the field but explicitly allows omitting it, so a draft
 * must never lose content just because a small model skipped a decorative key.
 * Two properties matter:
 *  - **Never overwrite.** A value the model actually returned is kept, even if
 *    it is not one the app would have inferred; the adapter still normalises
 *    an unknown category to `general`.
 *  - **Never throw.** `inferContentCategory` is a keyword heuristic; if it ever
 *    misbehaves the draft must still be usable, so the failure falls back to
 *    leaving the field alone.
 *
 * The inference reads the item's own text plus the analysis topic, because a
 * question like "Con mèo kêu thế nào?" usually carries the topic itself while
 * the lesson topic ("Động vật") disambiguates short items.
 */
function fillMissingContentCategories(draft: GameDraft, analysis: LessonAnalysis): GameDraft {
  const withCategory = (item: Record<string, unknown>): Record<string, unknown> => {
    if (typeof item.contentCategory === 'string' && item.contentCategory.trim() !== '') return item;
    const texts = [item.prompt, item.question, item.context, item.left, item.right, item.term, item.name, item.story, item.taskDescription]
      .filter((value): value is string => typeof value === 'string')
      .concat(analysis.topic);
    try {
      return { ...item, contentCategory: inferContentCategory(...texts) };
    } catch {
      return item;
    }
  };
  const array = (value: unknown): Record<string, unknown>[] | null =>
    Array.isArray(value) ? value as Record<string, unknown>[] : null;

  const filled: GameDraft = { ...draft };
  for (const key of ['questions', 'situations', 'pairs', 'stages'] as const) {
    const items = array((draft as unknown as Record<string, unknown>)[key]);
    if (!items) continue;
    (filled as unknown as Record<string, unknown>)[key] = items.map(withCategory);
  }
  return filled;
}

export async function generateGameDraft(options: GenerateDraftOptions): Promise<GameDraft> {
  const schema = gameDraftJsonSchemas[options.gameType];
  // O9: the model sometimes stops at 1 of 4 items. Count what the teacher asked
  // for so a short (but structurally valid) draft triggers one explicit retry.
  const requested = requestedItemCount(options.config);
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
    validate: value => fillMissingContentCategories(normalizeDraft(options.gameType, value), options.analysis),
    repairMessages: info => buildDraftRepairMessages({
      gameType: options.gameType,
      messages: info.messages,
      rawContent: info.rawContent,
      errorMessage: info.errorMessage
    }),
    ...(requested.requested ? {
      incompleteReason: (draft: GameDraft) => {
        const found = itemCount(draft);
        return found < requested.requested!
          ? `Mới có ${found}/${requested.requested} ${requested.unit}`
          : null;
      },
      completenessScore: (draft: GameDraft) => itemCount(draft),
      incompleteMessages: info => buildDraftShortfallMessages({
        gameType: options.gameType,
        messages: info.messages,
        previous: info.validated,
        found: itemCount(info.validated),
        requested: requested.requested!,
        unit: requested.unit
      })
    } : {}),
    ...(options.onAttempt ? { onAttempt: options.onAttempt } : {}),
    ...(options.onIncomplete ? { onIncomplete: options.onIncomplete } : {})
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
