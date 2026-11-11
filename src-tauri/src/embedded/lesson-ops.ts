/**
 * Luồng giáo án của vỏ Tauri, chạy trong V8 nhúng (`deno_core`).
 *
 * Bản Electron đặt toàn bộ luật này trong `src/main.ts`: chọn provider, dựng
 * cache key, cắt đoạn giáo án, gọi model, sửa JSON, chuẩn hoá kết quả và lưu dự
 * án. Tệp này giữ NGUYÊN các hàm TypeScript ấy (`lesson-workflow.ts`,
 * `lesson-cache.ts`, `lesson-selection.ts`, `lesson-projects.ts`,
 * `game-recommender.ts`), chỉ thay đúng hai chỗ thuộc lớp chạy:
 *
 *   • HTTP đi qua op đồng bộ `__eg_http` của Rust. Rust giữ endpoint thật, API
 *     key, thời gian chờ, huỷ và khoá một-lượt; V8 chỉ thấy `requestId` + thân
 *     JSON, rồi dựng lại một `Response`-like để `requestChatJson` dùng nguyên
 *     logic phân loại lỗi của Electron.
 *   • Băm SHA-256 đi qua op `__eg_sha256` (Rust), vì `lesson-cache.ts` dùng
 *     `createHash('sha256')` của Node — `template.js` cài một shim cùng chữ ký.
 *
 * Mọi op ở đây đồng bộ với V8: `op_http` chặn tới khi có câu trả lời, còn các
 * `await` trong luồng TS chỉ là microtask nên một lượt checkpoint là đủ.
 */
import { buildGenerationOptions } from '../../../src/ai-core/generation-options';
import {
  AiRequestRegistry,
  requestChatJson,
  type ChatSendResult
} from '../../../src/services/ai/ai-transport';
import { getProviderDefinition } from '../../../src/services/ai/ai-providers';
import { recommendGamesForAnalysis } from '../../../src/services/game/game-recommender';
import {
  buildAnalysisCacheKey,
  sha256Hex
} from '../../../src/services/lesson/lesson-cache';
import { buildLessonStructure } from '../../../src/services/lesson/lesson-structure';
import { normalizeLessonSource } from '../../../src/services/lesson/lesson-chunker';
import {
  prepareSelectedLessonText,
  prepareWholeLessonText,
  selectionFingerprint
} from '../../../src/services/lesson/lesson-selection';
import { preprocessBudgetForProvider } from '../../../src/services/lesson/lesson-preprocess';
import { estimateItemCapacity } from '../../../src/services/lesson/item-capacity';
import {
  advanceAfterRecommendations,
  applyAnalysis,
  createProjectFromAnalysis
} from '../../../src/services/lesson/lesson-projects';
import { analyzeLesson } from '../../../src/services/lesson/lesson-workflow';
import { classifyInput, resolveInputKind } from '../../../src/services/input/input-classifier';
import { cleanQuestionText } from '../../../src/services/input/question-text';
import { parseQuestionsFromText } from '../../../src/services/input/question-import';
import { evaluateCompatibility } from '../../../src/services/input/question-compatibility';
import { WORKFLOW_GAME_TYPES } from '../../../src/shared/lesson-types';

/** Cùng trần với `SEMANTIC_CLASSIFY_MAX_CHARS` của `main.ts`. */
const SEMANTIC_CLASSIFY_MAX_CHARS = 6000;

/** Op HTTP đồng bộ do `embedded.rs` cài trước mỗi lượt chạy. */
declare const __eg_http: (payload: string) => string;

/**
 * Một registry cho cả slot: khoá `requestId` của `analyzeLesson` và danh sách
 * controller huỷ phải là cùng một đối tượng trong suốt phiên V8.
 */
const registry = new AiRequestRegistry();

interface WorkflowTarget {
  requestId: string;
  model: string;
  mode: 'local' | 'online';
}

interface SelectionPlan {
  text: string;
  truncated: boolean;
  fingerprint: string;
  sectionCount: number;
  chars: number;
  pickedChars: number;
  omittedCount: number;
  warnings: string[];
}

/** Lỗi gửi của Rust, đổi về đúng tên mà `normalizeSendError` nhận ra. */
function sendFailure(result: Record<string, unknown>): Error {
  const message = String(result.message || 'Không kết nối được AI API.');
  if (result.kind === 'cancelled') {
    const error = new Error('Yêu cầu AI đã bị huỷ.');
    error.name = 'AiCancelledError';
    return error;
  }
  if (result.kind === 'timeout') {
    const error = new Error(message);
    error.name = 'TimeoutError';
    return error;
  }
  return new TypeError(message);
}

/**
 * Client chat của luồng giáo án. Cùng `sendChatJson` của `main.ts`, nhưng thay
 * `fetch` bằng op HTTP của Rust; `requestChatJson` vẫn là nơi duy nhất dựng body,
 * kiểm `response.ok`, phân loại lỗi nhà cung cấp và đọc JSON của model.
 */
function createClient(target: WorkflowTarget) {
  return {
    async chatJson(request: {
      messages: unknown;
      maxTokens: number;
      responseSchema?: unknown;
      signal: AbortSignal;
    }): Promise<unknown> {
      return requestChatJson({
        model: target.model,
        mode: target.mode,
        messages: request.messages as never,
        generation: buildGenerationOptions(target.mode, request.maxTokens),
        responseSchema: (request.responseSchema || null) as never,
        timeoutMs: target.mode === 'local' ? 300_000 : 90_000,
        signal: request.signal,
        send: async (body): Promise<ChatSendResult> => {
          const raw = __eg_http(
            JSON.stringify({ requestId: target.requestId, body: JSON.stringify(body) })
          );
          const result = JSON.parse(String(raw)) as Record<string, unknown>;
          if (!result.ok) throw sendFailure(result);
          const status = Number(result.status || 0);
          const text = String(result.body ?? '');
          return {
            ok: status >= 200 && status < 300,
            status,
            json: async () => JSON.parse(text),
            text: async () => text
          } as ChatSendResult;
        }
      });
    }
  };
}

/** `describeAnalyzeInput` của `main.ts` — cùng câu, cùng số đo. */
function describeAnalyzeInput(
  text: string,
  mode: 'fast' | 'deep',
  providerId: string,
  selection: SelectionPlan | null
) {
  const maxChars = preprocessBudgetForProvider(mode, providerId);
  const whole = selection ? null : prepareWholeLessonText(text, { maxChars });
  return {
    provider: providerId || 'local',
    providerLabel: (getProviderDefinition(providerId) || { label: 'AI local' }).label,
    documentChars: normalizeLessonSource(String(text ?? '')).length,
    sentChars: selection ? selection.chars : whole!.chars,
    pickedChars: selection ? selection.pickedChars : whole!.textBeforeBudget,
    truncated: selection ? Boolean(selection.truncated) : Boolean(whole!.truncated),
    scoped: Boolean(selection),
    omittedSections: selection ? selection.omittedCount : 0,
    budgetChars: Number.isFinite(maxChars) ? maxChars : null
  };
}

/** `prepareSelectionForAnalyze` của `main.ts`. */
function prepareSelection(
  text: string,
  selectedIds: unknown,
  mode: 'fast' | 'deep',
  providerId: string
): SelectionPlan | null {
  if (!Array.isArray(selectedIds)) return null;
  const ids = selectedIds.map(id => String(id || ''));
  const source = normalizeLessonSource(text ?? '');
  const structure = buildLessonStructure(source);
  const maxChars = preprocessBudgetForProvider(mode, providerId);
  const prepared = prepareSelectedLessonText(source, structure, ids, { maxChars });
  const fingerprint = selectionFingerprint(structure, ids, { maxChars });
  return {
    text: prepared.text,
    truncated: prepared.truncated,
    fingerprint: fingerprint || '',
    sectionCount: prepared.ranges.filter(range => range.selected).length,
    chars: prepared.chars,
    pickedChars: prepared.textBeforeBudget,
    omittedCount: prepared.omitted.length,
    warnings: prepared.warnings
  };
}

interface PlanInput {
  text?: unknown;
  name?: unknown;
  mode?: unknown;
  providerId?: unknown;
  modelId?: unknown;
  selectedIds?: unknown;
}

/**
 * Lượt rẻ: chỉ băm + cắt đoạn + dựng cache key. Rust gọi op này trước khi tra
 * cache; một cache hit không cần chạm tới model và cũng không cần `requestId`.
 */
export function plan(input: PlanInput) {
  const text = String(input?.text ?? '');
  const mode = input?.mode === 'deep' ? 'deep' : 'fast';
  const providerId = String(input?.providerId || 'local');
  const modelId = String(input?.modelId || '');
  const selection = prepareSelection(text, input?.selectedIds, mode, providerId);
  const cacheKey = buildAnalysisCacheKey({
    documentSha256: sha256Hex(text),
    modelId,
    provider: providerId,
    mode,
    sourceName: String(input?.name || ''),
    ...(selection ? { selectionFingerprint: selection.fingerprint } : {})
  });
  return {
    cacheKey,
    selection,
    sent: describeAnalyzeInput(text, mode, providerId, selection)
  };
}

interface AnalyzeInput extends PlanInput {
  documentId?: unknown;
  requestId?: unknown;
  analysisId?: unknown;
  now?: unknown;
  target?: WorkflowTarget;
  plan?: { selection?: SelectionPlan | null };
}

/** Lượt đắt: gọi model một lần (kèm một lượt sửa JSON của `analyzeLesson`). */
export async function analyze(input: AnalyzeInput) {
  if (!input?.target) throw new Error('Thiếu đích AI cho lượt phân tích.');
  const text = String(input.text ?? '');
  const mode = input.mode === 'deep' ? 'deep' : 'fast';
  const providerId = String(input.providerId || 'local');
  const maxChars = preprocessBudgetForProvider(mode, providerId);
  const selection = input.plan?.selection || null;
  const analysis = await analyzeLesson({
    client: createClient(input.target),
    registry,
    requestId: String(input.requestId || ''),
    documentId: String(input.documentId || ''),
    text,
    sourceName: String(input.name || ''),
    analysisId: input.analysisId ? String(input.analysisId) : undefined,
    now: input.now ? String(input.now) : new Date().toISOString(),
    // Cùng con số `main.ts` dùng cho hai chế độ.
    maxTokens: mode === 'deep' ? 2560 : 2048,
    maxChars,
    ...(selection
      ? { preparedSelection: { text: selection.text, truncated: selection.truncated } }
      : {})
  });
  return { analysis };
}

interface RecommendInput {
  analysis: { id: string };
  project?: unknown;
  modelId?: unknown;
  mode?: unknown;
  now?: unknown;
}

/** `lesson:recommend`: luật xếp hạng của `game-recommender.ts`, không gọi model. */
export function recommend(input: RecommendInput) {
  const analysis = input?.analysis;
  const project = input?.project && typeof input.project === 'object' ? input.project : null;
  const now = input?.now ? String(input.now) : new Date().toISOString();
  const recommendations = recommendGamesForAnalysis({
    analysis: analysis as never,
    idPrefix: `rec_${analysis.id}_`,
    now,
    documentCharacters:
      project && (project as { lesson?: { characters?: number } }).lesson
        ? Number((project as { lesson: { characters?: number } }).lesson.characters || 0)
        : 0,
    modelId: String(input?.modelId || ''),
    mode: input?.mode === 'deep' ? 'deep' : 'fast'
  });
  return {
    recommendations,
    project: project
      ? advanceAfterRecommendations(project as never, now)
      : null
  };
}

interface CapacityInput {
  gameType?: unknown;
  documentCharacters?: unknown;
  objectiveCount?: unknown;
  conceptCount?: unknown;
  modelId?: unknown;
  mode?: unknown;
}

/** `lesson:capacity`: ước lượng tất định, không ghi gì. */
export function capacity(input: CapacityInput) {
  const gameType = String(input?.gameType || '');
  if (!WORKFLOW_GAME_TYPES.includes(gameType as never)) {
    throw new Error('Thể loại trò chơi không hợp lệ.');
  }
  return estimateItemCapacity({
    gameType: gameType as never,
    documentCharacters: Number(input?.documentCharacters || 0),
    objectiveCount: Number(input?.objectiveCount || 0),
    conceptCount: Number(input?.conceptCount || 0),
    modelId: String(input?.modelId || ''),
    mode: input?.mode === 'deep' ? 'deep' : 'fast'
  });
}

/** `lesson:get-structure`: cây mục lục offline của bước 1. */
export function structure(text: unknown) {
  return buildLessonStructure(String(text ?? ''));
}

interface PreviewInput {
  text?: unknown;
  mode?: unknown;
  providerId?: unknown;
  structure?: unknown;
  selectedIds?: unknown;
}

/** `lesson:preview-selection`: đúng phép chuẩn bị mà `analyze` sẽ dùng. */
export function preview(input: PreviewInput) {
  const text = String(input?.text ?? '');
  if (!text.trim()) throw new Error('Thiếu nội dung tài liệu để dựng bản xem trước.');
  const mode = input?.mode === 'deep' ? 'deep' : 'fast';
  const maxChars = preprocessBudgetForProvider(mode, String(input?.providerId || '') || 'local');
  const tree =
    input?.structure && typeof input.structure === 'object'
      ? input.structure
      : buildLessonStructure(text);
  const selectedIds = Array.isArray(input?.selectedIds)
    ? input.selectedIds.map(id => String(id || ''))
    : null;
  if (!selectedIds || !selectedIds.length) {
    return prepareWholeLessonText(text, { maxChars });
  }
  return prepareSelectedLessonText(text, tree as never, selectedIds, { maxChars });
}

/**
 * `lesson:classify-input`: luật + bộ đọc câu hỏi, không gọi model.
 *
 * Lớp ngữ nghĩa (MiniLM) chưa có trong vỏ Tauri, nên kết quả nói thẳng
 * `semantic: 'unavailable'` thay vì giả vờ đã xác nhận. Văn bản rỗng giữ
 * `'skipped'` y như Electron.
 */
export function classify(input: { text?: unknown }) {
  const raw = typeof input?.text === 'string' ? input.text : '';
  const text = raw.length > SEMANTIC_CLASSIFY_MAX_CHARS ? raw.slice(0, SEMANTIC_CLASSIFY_MAX_CHARS) : raw;
  const cleanedText = cleanQuestionText(text);
  const classification = classifyInput(cleanedText);
  let semantic = 'skipped';
  let semanticNote = '';
  if (text.trim()) {
    semantic = 'unavailable';
    semanticNote = 'Bộ đọc hiểu chưa sẵn sàng — phân loại bằng quy tắc.';
  }
  const kind = resolveInputKind(classification);
  const parsed = kind === 'questions' ? parseQuestionsFromText(cleanedText) : null;
  const compatibility = parsed && parsed.parsed.length ? evaluateCompatibility(parsed.parsed) : [];
  return { classification, kind, import: parsed, semantic, semanticNote, compatibility };
}

interface ProjectInput {
  action?: unknown;
  projectId?: unknown;
  project?: unknown;
  document?: unknown;
  analysis?: unknown;
  now?: unknown;
}

/**
 * Ghép kết quả phân tích vào dự án. Rust gọi op này rồi lưu bằng
 * `project:save-draft` (cùng bộ kiểm Zod của Electron).
 */
export function projectStep(input: ProjectInput) {
  const now = input?.now ? String(input.now) : new Date().toISOString();
  if (input?.action === 'apply-analysis') {
    if (!input.project) throw new Error('Không tìm thấy dự án để cập nhật kết quả phân tích.');
    return applyAnalysis(input.project as never, {
      document: input.document as never,
      analysis: input.analysis as never,
      now
    });
  }
  if (input?.action === 'create') {
    const projectId = input.projectId
      ? String(input.projectId)
      : `project_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    return createProjectFromAnalysis({
      projectId,
      document: input.document as never,
      analysis: input.analysis as never,
      now
    });
  }
  throw new Error('Thao tác dự án không hợp lệ.');
}
