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
import { convertDraft } from '../../../src/services/game/draft-convert';
import { toEducationalGame } from '../../../src/services/game/game-project-adapter';
import { applyItemAssetPatch } from '../../../src/shared/asset-validation';
import {
  analysisFingerprint,
  buildAnalysisCacheKey,
  buildGenerationCacheKey,
  configFingerprint,
  sha256Hex
} from '../../../src/services/lesson/lesson-cache';
import { parseGameDraft } from '../../../src/services/lesson/lesson-contracts';
import { buildLessonStructure } from '../../../src/services/lesson/lesson-structure';
import { chunkLessonText, normalizeLessonSource } from '../../../src/services/lesson/lesson-chunker';
import {
  itemAt,
  itemCount,
  itemLabel,
  patchDraftItemAssets,
  replaceDraftItem,
  resolveItemIndexes
} from '../../../src/services/lesson/lesson-item-repair';
import { checkDraftQuality } from '../../../src/services/lesson/lesson-quality';
import {
  DEEP_MAX_SELECTED_CHARS,
  DEEP_MAX_SELECTED_CHUNKS,
  DEFAULT_MAX_SELECTED_CHARS,
  DEFAULT_MAX_SELECTED_CHUNKS,
  buildRetrievalQuery,
  selectChunks,
  selectChunksForItem
} from '../../../src/services/lesson/lesson-retrieval';
import {
  LESSON_PROMPT_VERSIONS,
  formatRetrievedChunks
} from '../../../src/services/lesson/lesson-prompts';
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
  applyDraft,
  createProjectFromAnalysis
} from '../../../src/services/lesson/lesson-projects';
import {
  analyzeLesson,
  generateGameDraft,
  regenerateGameItem
} from '../../../src/services/lesson/lesson-workflow';
import { runLessonChatTurn } from '../../../src/services/lesson/lesson-chat';
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
 * Báo một mốc tiến trình thật (O7). Rust chỉ chuyển tiếp các mốc nằm trong danh
 * sách trắng; lỗi ở đây là chuyện trang trí, không bao giờ được làm hỏng lượt
 * tạo nội dung. `typeof` giữ op này tuỳ chọn để unit test Node vẫn nạp được slot.
 */
declare const __eg_progress: ((stage: string) => void) | undefined;

function report(stage: string): void {
  try {
    if (typeof __eg_progress === 'function') __eg_progress(stage);
  } catch {
    // cosmetic only
  }
}

/**
 * Một registry cho cả slot: khoá `requestId` của `analyzeLesson` và danh sách
 * controller huỷ phải là cùng một đối tượng trong suốt phiên V8.
 */
const registry = new AiRequestRegistry();

interface WorkflowTarget {
  requestId: string;
  model: string;
  mode: 'local' | 'online';
  /** Provider đã chọn (kể cả khi lượt chạy bằng chính sách). `runLessonChatTurn`
   *  đọc `client.providerId` để ghi nguồn trả lời vào lịch sử; thiếu nó thì mọi
   *  lượt chat mất providerId, khác bản Electron (`createChatClientForProvider`). */
  providerId?: string;
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
    providerId: target.providerId || '',
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

// ---------------------------------------------------------------------------
// Bước 5–6: chuyển đổi, chất lượng, minh hoạ, tạo nội dung và tạo lại một mục
// ---------------------------------------------------------------------------

interface ConvertInput {
  draft?: unknown;
  target?: unknown;
  config?: unknown;
}

/** `lesson:convert-draft` — đúng ba phép kiểm biên của `main.ts`. */
export function convert(input: ConvertInput) {
  const draft = input?.draft;
  if (!draft || typeof draft !== 'object') {
    throw new Error('Chưa có bản nháp để chuyển đổi.');
  }
  const target = String(input?.target || '');
  if (!WORKFLOW_GAME_TYPES.includes(target as never)) {
    throw new Error('Thể loại trò chơi đích không hợp lệ.');
  }
  const config = input?.config;
  if (!config || typeof config !== 'object') {
    throw new Error('Chưa có cấu hình trò chơi để chuyển đổi.');
  }
  return convertDraft(draft as never, target as never, config as never);
}

interface QualityInput {
  draft?: unknown;
  config?: unknown;
  analysis?: unknown;
}

/** `lesson:quality` — báo cáo tư vấn, không gọi model và không ghi đĩa. */
export function quality(input: QualityInput) {
  return checkDraftQuality({
    draft: input?.draft as never,
    config: input?.config as never,
    analysis: (input?.analysis ?? null) as never
  });
}

interface PatchAssetsInput {
  project?: unknown;
  itemIndex?: unknown;
  patch?: unknown;
}

/**
 * `lesson:patch-item-assets`: chỉ ba trường minh hoạ, rồi adapter + `applyDraft`.
 * Rust đã kiểm hình dạng `patch`; ở đây `applyItemAssetPatch` vẫn là nơi duy
 * nhất quyết định trường nào được đổi.
 */
export function patchAssets(input: PatchAssetsInput) {
  const project = input?.project;
  if (!project || typeof project !== 'object') {
    throw new Error('Không tìm thấy dự án. Hãy lưu dự án trước khi đổi minh hoạ.');
  }
  const draft = (project as { draft?: unknown }).draft;
  if (!draft) {
    throw new Error('Dự án chưa có nội dung. Hãy tạo nội dung trước khi đổi minh hoạ.');
  }
  const patch = input?.patch;
  const applied = applyItemAssetPatch({}, patch as never);
  if (!applied.changed) {
    throw new Error(
      'Không có trường minh hoạ nào được gửi lên. Chỉ đổi được chủ đề, biểu tượng và hình minh hoạ.'
    );
  }
  const position = Number(input?.itemIndex);
  let nextDraft;
  try {
    nextDraft = patchDraftItemAssets(draft as never, position, patch as never);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Không đổi được minh hoạ cho mục này.');
  }
  let game;
  try {
    game = toEducationalGame({ ...(project as object), draft: nextDraft } as never);
  } catch (error) {
    throw new Error(
      `[GENERATION_INVALID] ${error instanceof Error ? error.message : 'Nội dung sau khi đổi minh hoạ chưa hợp lệ.'}`
    );
  }
  const now = new Date().toISOString();
  return {
    project: applyDraft(project as never, { draft: nextDraft as never, game, now }),
    game,
    itemIndex: position,
    applied: applied.applied
  };
}

interface GenerationKeyInput {
  project?: unknown;
  analysis?: unknown;
  modelId?: unknown;
  mode?: unknown;
  providerId?: unknown;
}

/** Khoá cache O5 — Rust tính trước khi tra cache và trước khi chọn provider. */
export function generationKey(input: GenerationKeyInput) {
  const project = input?.project as
    | { lesson?: { documentId?: string }; config?: { gameType?: string } }
    | undefined;
  const analysis = input?.analysis;
  const config = (project?.config || {}) as never;
  return buildGenerationCacheKey({
    documentId: String(project?.lesson?.documentId || ''),
    analysisFingerprint: analysisFingerprint(analysis as never),
    gameType: String(project?.config?.gameType || ''),
    configFingerprint: configFingerprint(config),
    modelId: String(input?.modelId || ''),
    mode: input?.mode === 'deep' ? 'deep' : 'fast',
    provider: input?.providerId ? String(input.providerId) : 'auto'
  });
}

interface GenerationContextInput {
  text?: unknown;
  analysis?: unknown;
  config?: unknown;
  mode?: unknown;
}

/**
 * `buildLessonGenerationContext` của `main.ts`, không có embedding/chunk cache.
 * Truy xuất từ vựng vẫn là cùng `selectChunks` mà Electron dùng khi MiniLM không
 * sẵn sàng; `selection` được trả về để bước tạo lại một mục thu hẹp đúng đoạn.
 */
function generationContext(input: GenerationContextInput) {
  const text = String(input?.text ?? '');
  let sourceExcerpt: string | undefined;
  let context = {
    chunkCount: 0,
    selectedChunkCount: 0,
    characters: 0,
    scorer: 'none',
    fallback: false
  };
  if (!text) return { sourceExcerpt, context, selection: null };
  const mode = input?.mode === 'deep' ? 'deep' : 'fast';
  const chunks = chunkLessonText(text);
  const query = buildRetrievalQuery({
    analysis: input?.analysis as never,
    config: input?.config as never
  });
  const options =
    mode === 'deep'
      ? { maxChunks: DEEP_MAX_SELECTED_CHUNKS, maxChars: DEEP_MAX_SELECTED_CHARS }
      : { maxChunks: DEFAULT_MAX_SELECTED_CHUNKS, maxChars: DEFAULT_MAX_SELECTED_CHARS };
  const selection = selectChunks(chunks, query, options);
  sourceExcerpt = selection.selected.length
    ? formatRetrievedChunks(selection.selected)
    : text.slice(0, 6000);
  context = {
    chunkCount: chunks.length,
    selectedChunkCount: selection.selected.length,
    characters: sourceExcerpt.length,
    scorer: selection.scorer,
    fallback: selection.fallback
  };
  return { sourceExcerpt, context, selection };
}

interface CacheDraftInput {
  project?: unknown;
  analysis?: unknown;
  payload?: unknown;
}

/** Cache hit: chạy lại adapter thay vì tin ảnh chụp đã lưu. */
export function generationCache(input: CacheDraftInput) {
  const project = input?.project;
  if (!project || typeof project !== 'object') {
    throw new Error('Không tìm thấy dự án. Hãy lưu dự án trước khi tạo nội dung.');
  }
  const payload = (input?.payload || {}) as { draft?: unknown; context?: unknown };
  const draft = parseGameDraft(payload.draft);
  let game;
  try {
    game = toEducationalGame({ ...(project as object), draft } as never);
  } catch (error) {
    throw new Error(
      `[GENERATION_INVALID] ${error instanceof Error ? error.message : 'Nội dung AI tạo ra chưa hợp lệ.'}`
    );
  }
  const now = new Date().toISOString();
  return {
    project: applyDraft(project as never, { draft, game, now }),
    game,
    mode: String((payload as { mode?: unknown }).mode || 'fast'),
    quality: checkDraftQuality({
      draft,
      config: (project as { config?: unknown }).config as never,
      analysis: input?.analysis as never
    }),
    context: payload.context || null,
    cached: true
  };
}

interface OfflineDraftInput {
  project?: unknown;
  sourceDraft?: unknown;
  fromChat?: unknown;
}

/** Nhánh B của §3: câu hỏi giáo viên đã soạn, chuyển đổi + kiểm + lưu, không AI. */
export function generationOffline(input: OfflineDraftInput) {
  const project = input?.project;
  if (!project || typeof project !== 'object') {
    throw new Error('Không tìm thấy dự án. Hãy lưu dự án trước khi tạo nội dung.');
  }
  const sourceDraft = input?.sourceDraft;
  const fromChat = Boolean(input?.fromChat);
  const invalidCopy = fromChat
    ? 'Bộ câu hỏi AI vừa soạn chưa hợp lệ cho thể loại này.'
    : 'Câu hỏi soạn sẵn chưa hợp lệ cho thể loại này.';
  let game;
  try {
    game = toEducationalGame({ ...(project as object), draft: sourceDraft } as never);
  } catch (error) {
    throw new Error(
      `[GENERATION_INVALID] ${error instanceof Error ? error.message : invalidCopy}`
    );
  }
  const now = new Date().toISOString();
  return {
    project: applyDraft(project as never, { draft: sourceDraft as never, game, now }),
    game,
    mode: 'fast',
    quality: checkDraftQuality({
      draft: sourceDraft as never,
      config: (project as { config?: unknown }).config as never,
      analysis: null
    }),
    context: null,
    cached: true,
    source: fromChat ? 'chat-questions' : 'imported-questions'
  };
}

interface GenerateInput {
  project?: unknown;
  analysis?: unknown;
  text?: unknown;
  mode?: unknown;
  requestId?: unknown;
  target?: WorkflowTarget;
}

/** Lượt đắt của bước 5: một op V8, một hoặc vài lượt HTTP qua Rust. */
export async function generate(input: GenerateInput) {
  const project = input?.project as
    | { config?: { gameType?: string }; draft?: unknown }
    | undefined;
  if (!project) throw new Error('Không tìm thấy dự án. Hãy lưu dự án trước khi tạo nội dung.');
  const mode = input?.mode === 'deep' ? 'deep' : 'fast';
  const requestId = String(input?.requestId || '');
  const target = input?.target as WorkflowTarget;
  report('retrieve');
  const { sourceExcerpt, context } = generationContext({
    text: input?.text,
    analysis: input?.analysis,
    config: project.config,
    mode
  });
  const draft = await generateGameDraft({
    client: createClient(target),
    registry,
    requestId,
    gameType: project.config?.gameType as never,
    config: project.config as never,
    analysis: input?.analysis as never,
    sourceExcerpt,
    maxTokens: mode === 'deep' ? 4096 : 2048,
    onAttempt: attempt => report(attempt === 1 ? 'generate' : 'repair')
  });
  report('validate');
  let game;
  try {
    game = toEducationalGame({ ...(project as object), draft } as never);
  } catch (error) {
    throw new Error(
      `[GENERATION_INVALID] ${error instanceof Error ? error.message : 'Nội dung AI tạo ra chưa hợp lệ.'}`
    );
  }
  const now = new Date().toISOString();
  return {
    project: applyDraft(project as never, { draft, game, now }),
    game,
    draft,
    mode,
    quality: checkDraftQuality({
      draft,
      config: project.config as never,
      analysis: input?.analysis as never
    }),
    context,
    promptVersion: `draft-v${LESSON_PROMPT_VERSIONS.draft}`,
    cached: false
  };
}

interface RegenerateInput {
  project?: unknown;
  analysis?: unknown;
  text?: unknown;
  mode?: unknown;
  itemIndex?: unknown;
  itemIndexes?: unknown;
  requestId?: unknown;
  target?: WorkflowTarget;
}

/** O5: tạo lại đúng các mục được chọn, giữ nguyên phần còn lại. */
export async function regenerate(input: RegenerateInput) {
  const project = input?.project as
    | { config?: { gameType?: string }; draft?: unknown }
    | undefined;
  if (!project) throw new Error('Không tìm thấy dự án. Hãy lưu dự án trước khi tạo lại nội dung.');
  const draftSource = project.draft as never;
  const mode = input?.mode === 'deep' ? 'deep' : 'fast';
  const requestId = String(input?.requestId || '');
  report('retrieve');
  const { sourceExcerpt, context, selection } = generationContext({
    text: input?.text,
    analysis: input?.analysis,
    config: project.config,
    mode
  });
  const qualityBefore = checkDraftQuality({
    draft: draftSource,
    config: project.config as never,
    analysis: input?.analysis as never
  });
  const requested = Array.isArray(input?.itemIndexes)
    ? input.itemIndexes.map(value => Number(value))
    : [Number(input?.itemIndex)];
  const indexes = resolveItemIndexes(draftSource, requested, qualityBefore);
  if (!indexes.length) {
    throw new Error('Không xác định được mục cần tạo lại. Hãy chọn một mục cụ thể.');
  }
  const issuesByIndex = new Map<number, string[]>();
  for (const issue of qualityBefore.issues) {
    if (!issue.itemIndex) continue;
    const list = issuesByIndex.get(issue.itemIndex) || [];
    list.push(issue.message);
    issuesByIndex.set(issue.itemIndex, list);
  }
  const total = itemCount(draftSource);
  let draft = draftSource as Parameters<typeof replaceDraftItem>[0];
  let itemsNarrowed = 0;
  for (const position of indexes) {
    const currentItem = itemAt(draft, position);
    const itemSelection = selectChunksForItem(selection, {
      reference: currentItem ? JSON.stringify(currentItem) : ''
    });
    const itemExcerpt = itemSelection.selected.length
      ? formatRetrievedChunks(itemSelection.selected)
      : sourceExcerpt;
    if (itemExcerpt !== sourceExcerpt) itemsNarrowed += 1;
    const item = await regenerateGameItem({
      client: createClient(input?.target as WorkflowTarget),
      registry,
      requestId,
      gameType: project.config?.gameType as never,
      config: project.config as never,
      analysis: input?.analysis as never,
      position,
      total,
      itemLabel: itemLabel(project.config?.gameType as never, position),
      currentItem,
      issues: issuesByIndex.get(position) || [],
      sourceExcerpt: itemExcerpt,
      maxTokens: mode === 'deep' ? 1536 : 1024,
      onAttempt: attempt => report(attempt === 1 ? 'generate' : 'repair')
    });
    try {
      draft = replaceDraftItem(draft, position, item);
    } catch (error) {
      throw new Error(
        `[GENERATION_INVALID] ${itemLabel(project.config?.gameType as never, position)} mới chưa hợp lệ: ${
          error instanceof Error ? error.message : 'không đọc được nội dung AI trả về.'
        }`
      );
    }
  }
  report('validate');
  let game;
  try {
    game = toEducationalGame({ ...(project as object), draft } as never);
  } catch (error) {
    throw new Error(
      `[GENERATION_INVALID] ${error instanceof Error ? error.message : 'Nội dung mới chưa hợp lệ.'}`
    );
  }
  const now = new Date().toISOString();
  return {
    project: applyDraft(project as never, { draft, game, now }),
    game,
    quality: checkDraftQuality({
      draft,
      config: project.config as never,
      analysis: input?.analysis as never
    }),
    context,
    mode,
    itemIndexes: indexes,
    cached: false,
    itemContext: { items: indexes.length, narrowed: itemsNarrowed }
  };
}

/**
 * Lượt hỏi đáp giáo án (`lesson:chat-send`, #182).
 *
 * Tái sử dụng `runLessonChatTurn` nguyên văn của Electron. Model được gọi qua
 * `createClient(target)` (dùng `__eg_http` đồng bộ của Rust). Mốc tiến trình
 * được chuyển tiếp qua `report(stage)`.
 */
export async function chat(input: Record<string, unknown>) {
  const target = input?.target as WorkflowTarget;
  const client = createClient(target);
  const registry = new AiRequestRegistry();
  const requestId = String(input?.requestId || target?.requestId || '');
  report('retrieve');
  return runLessonChatTurn({
    client,
    registry,
    requestId,
    documents: (input?.documents || []) as never,
    question: String(input?.question || ''),
    history: (input?.history || []) as never,
    mode: input?.mode as never,
    questionCount: typeof input?.questionCount === 'number' ? input.questionCount : undefined,
    localOnGpu: input?.localOnGpu === true,
    contextTokens: typeof input?.contextTokens === 'number' ? input.contextTokens : undefined,
    onStage: stage => report(stage)
  });
}
