// @ts-nocheck -- renderer UI logic; workflow contracts are typed in src/shared/lesson-types.ts.
/**
 * State + shared actions for the lesson-to-game wizard (P5).
 *
 * The wizard keeps its own store here instead of adding fields to the global
 * `state` object (only `state.page` is registered). Steps read `wizardState`
 * and call the helpers below; rendering is plain template strings like the rest
 * of the renderer.
 */
const wizardSteps = [
  { id: 'input', label: 'Nhập giáo án', short: 'Nhập' },
  { id: 'analyze', label: 'Phân tích giáo án', short: 'Phân tích' },
  { id: 'recommend', label: 'Chọn trò chơi', short: 'Gợi ý' },
  { id: 'configure', label: 'Cấu hình trò chơi', short: 'Cấu hình' },
  { id: 'generate', label: 'Tạo nội dung', short: 'Tạo nội dung' }
];

const wizardState = {
  step: 'input',
  projectId: null,
  createdAt: null,
  gameId: null,
  documentId: null,
  documentName: '',
  documentMeta: null, // { characters, ext, sizeBytes }
  text: '',
  analysis: null,
  analysisId: null,
  analysisOriginal: null, // AI output, kept so the teacher can restore edits
  recommendations: [],
  selectedGameType: null,
  selectedRecommendationId: null,
  config: null,
  draft: null, // P6
  gameSnapshot: null, // P6
  quality: null, // O2: advisory content-quality report for the draft
  context: null, // O3: which lesson chunks fed the prompt
  capacity: null, // O12: predicted item count for the current document + model + mode
  countTouched: false, // teacher edited the item count; auto-adjust must not override it
  quick: null, // O13: inline confirmation for "AI gợi ý & tạo ngay"
  busy: '', // '' | 'analyze' | 'recommend' | 'generate' | 'save'
  lessonStage: '', // O7: 'retrieve' | 'generate' | 'validate' | 'repair' | 'ready' | 'cached'
  lessonRepaired: false, // O7: true when the model actually had to repair an answer
  generationHistory: [], // #71: finished generation rows, used only for the ETA baseline
  generationHistoryLoadedAt: 0, // #71: throttle; the baseline is not re-read every second
  analysisStartedAt: 0, // timestamp of the running analysis; drives the elapsed indicator
  generationStartedAt: 0, // timestamp of the running generation; drives the elapsed indicator
  analysisFinishedMs: 0, // #75: frozen total of the last finished analysis (0 = none to show)
  generationFinishedMs: 0, // #75: frozen total of the last finished generation
  error: null, // { code, message }
  notice: null,
  requestNonce: 0,
  projects: [],
  projectsLoaded: false,
  activeRequestId: null,
  // Phase B (DECISIONS #72): which item's artwork popover is open in step 5,
  // keyed as `${gameType}:${position}` because the position alone changes
  // meaning when the genre changes. null = every popover closed.
  openArtItem: null,
  // True while one `lesson:patch-item-assets` call is in flight. Kept apart from
  // `busy` on purpose: `busy` blocks the generate toolbar, and picking a picture
  // must not look like (or block) content generation.
  artBusy: false,
  // #76: step-1 document structure + teacher selection. Created lazily by
  // `wizardStructureState()` in `step-structure.ts`; null = nothing reviewed yet,
  // which means "whole document".
  structure: null
};

const wizardGameMetaMap = {
  arena: { icon: '🧠', label: 'Đấu trường kiến thức', hint: 'Trắc nghiệm, tính điểm, thi đua cá nhân hoặc đội.' },
  scenario: { icon: '🚦', label: 'Thử thách tình huống', hint: 'Ra quyết định trong tình huống thực tế.' },
  matching: { icon: '🧩', label: 'Ghép cặp kiến thức', hint: 'Ghép thuật ngữ với định nghĩa hoặc ví dụ.' },
  treasure: { icon: '🗺️', label: 'Giải mã kho báu', hint: 'Chuỗi chặng, câu đố và manh mối.' },
  race: { icon: '🏁', label: 'Đường đua chinh phục', hint: 'Trả lời đúng để tiến ô, có ô đặc biệt.' }
};

/** All five genres, in a stable order (used to offer the ones not suggested). */
const wizardGameTypeOrder = ['arena', 'scenario', 'matching', 'treasure', 'race'];

function wizardGameMeta(gameType) {
  return wizardGameMetaMap[gameType] || { icon: '🎮', label: 'Trò chơi', hint: '' };
}

function wizardClamp(value, min, max) {
  const number = Math.round(Number(value));
  const low = Number.isFinite(Number(min)) ? Number(min) : 0;
  const high = Number.isFinite(Number(max)) ? Number(max) : Number.MAX_SAFE_INTEGER;
  if (!Number.isFinite(number)) return low;
  return Math.min(high, Math.max(low, number));
}

function wizardNow() {
  return new Date().toISOString();
}

function wizardStepIndex(step) {
  if (step === 'edit' || step === 'done') return wizardSteps.length - 1;
  const index = wizardSteps.findIndex(item => item.id === step);
  return index < 0 ? 0 : index;
}

function wizardNewRequestId(kind) {
  wizardState.requestNonce += 1;
  return `wizard-${kind}-${wizardState.requestNonce}`;
}

// ---------------------------------------------------------------------------
// Analysis clock (elapsed time + global activity chip)
// ---------------------------------------------------------------------------
// The model call has no token stream, so a percentage would be invented. The
// elapsed clock is real, survives page navigation, and is the only progress the
// UI claims while the request is in flight.
let wizardActivityClockTimer = null;

function wizardFormatDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(Number(milliseconds) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function wizardAnalysisElapsedText() {
  const startedAt = Number(wizardState.analysisStartedAt) || 0;
  const elapsed = startedAt ? wizardFormatDuration(Date.now() - startedAt) : '0:00';
  // #75: the only claim is the real elapsed time; step 2 has no measured
  // baseline for an ETA, so the old constant guess is gone for good.
  return `⏱ Đã chạy ${elapsed}`;
}

/**
 * #75: the finished total, shown after the run instead of the running clock.
 * Returns '' when there is nothing frozen (never ran, or cancelled), so callers
 * can drop the line entirely rather than print "0:00".
 */
function wizardAnalysisTotalText() {
  const total = wizardFormatStopwatch(wizardState.analysisFinishedMs);
  return total ? `Tổng thời gian phân tích: ${total}` : '';
}

function wizardGenerationTotalText() {
  const total = wizardFormatStopwatch(wizardState.generationFinishedMs);
  return total ? `Tổng thời gian tạo nội dung: ${total}` : '';
}

/**
 * Generation is slower than analysis and the real time depends on the model and
 * the CPU, so the UI shows an honest range derived from the mode and the number
 * of items — never a fake countdown or a made-up percentage.
 */
function wizardGenerationEstimateText() {
  const config = wizardState.config || {};
  const deep = config.generationMode === 'deep';
  const itemCount = Number(
    config.questionCount || config.situationCount || config.pairCount || config.stageCount || 0
  ) || 0;
  const low = (deep ? 2 : 1) + Math.floor(itemCount / 12);
  const high = low + (deep ? 3 : 2);
  return `dự kiến ${low}–${high} phút`;
}

/**
 * #71: remaining-time estimate built from this machine's own finished
 * generations, never from a constant.
 *
 * The renderer is a flat set of classic scripts (no bundler, nothing imports
 * `src/shared`), so the maths has to live here. `src/shared/generation-eta.ts`
 * holds the identical pure logic for the main process and the unit tests; the
 * `generation-eta-drift` test keeps the two in step.
 */
function wizardGenerationEtaMs(elapsedMs, stageIndex, stageCount, samples) {
  const order = WIZARD_GENERATION_STAGES_ORDER;
  const index = Math.max(0, Math.min(Number(stageIndex) || 0, order.length - 1));
  const stage = order[index] || null;
  const medianMs = wzEtaBaselineMs(samples);
  if (medianMs === null) return null;

  const elapsed = Math.max(0, Number(elapsedMs) || 0);
  const fraction = wzEtaStageFraction(stage) || 1 / Math.max(1, Number(stageCount) || order.length);
  const expectedTotal = medianMs / fraction;
  const remaining = expectedTotal - elapsed;
  const sampleCount = wzEtaSampleCount(samples);
  if (remaining <= 0) return { remainingMs: 0, overrunMs: -remaining, medianMs, sampleCount };
  return { remainingMs: remaining, overrunMs: 0, medianMs, sampleCount };
}

/** Spans outside this window are clock skew or abandoned rows, not a baseline. */
const WZ_ETA_MIN_SAMPLE_MS = 1000;
const WZ_ETA_MAX_SAMPLE_MS = 3 * 60 * 60 * 1000;

function wzEtaDurations(samples) {
  return (Array.isArray(samples) ? samples : [])
    .map(sample => {
      const started = Date.parse(String((sample && sample.startedAt) || ''));
      const finished = Date.parse(String((sample && sample.finishedAt) || ''));
      if (!Number.isFinite(started) || !Number.isFinite(finished)) return 0;
      const span = finished - started;
      return span >= WZ_ETA_MIN_SAMPLE_MS && span <= WZ_ETA_MAX_SAMPLE_MS ? span : 0;
    })
    .filter(span => span > 0)
    .sort((a, b) => a - b);
}

/** Median total duration, or null when there is nothing to learn from. */
function wzEtaBaselineMs(samples) {
  const durations = wzEtaDurations(samples);
  if (!durations.length) return null;
  return durations[Math.floor(durations.length / 2)];
}

function wzEtaSampleCount(samples) {
  return wzEtaDurations(samples).length;
}

/**
 * Stage fraction. `ready` is always 1 so a skipped repair stage cannot leave the
 * bar stuck below done; unknown stages report 0.
 */
function wzEtaStageFraction(stage) {
  const order = WIZARD_GENERATION_STAGES_ORDER;
  if (stage === 'ready') return 1;
  const index = order.indexOf(stage);
  if (index < 0) return 0;
  return Math.min(1, (index + 1) / order.length);
}

/** Compact Vietnamese duration for an ETA: "45 giây", "3 phút", "1 phút 20 giây". */
function wizardFormatEta(milliseconds) {
  const totalSeconds = Math.max(0, Math.round((Number(milliseconds) || 0) / 1000));
  if (totalSeconds < 60) return `${totalSeconds} giây`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  // Past half an hour the seconds are noise, so they are dropped.
  if (minutes >= 30) return `${minutes} phút`;
  return seconds ? `${minutes} phút ${seconds} giây` : `${minutes} phút`;
}


function wizardGenerationElapsedText() {
  const startedAt = Number(wizardState.generationStartedAt) || 0;
  const elapsed = startedAt ? wizardFormatDuration(Date.now() - startedAt) : '0:00';
  return `Đã chạy ${elapsed} · ${wizardGenerationEstimateText()}`;
}

/**
 * #71: read finished lesson generations once per generation run so the ETA has a
 * measured baseline. Failures are swallowed: a missing baseline only costs the
 * estimate, never the generation.
 *
 * Only rows with a real `finishedAt` and a matching kind are used, and the
 * currently running task is excluded by construction (it has no `finishedAt`).
 */
async function wizardLoadGenerationHistory(force) {
  const now = Date.now();
  if (!force && wizardState.generationHistory.length && now - (wizardState.generationHistoryLoadedAt || 0) < 60000) {
    return wizardState.generationHistory;
  }
  try {
    const result = await window.eduGame.listAiTasks({ limit: 50 });
    const history = (result && result.history) || [];
    wizardState.generationHistory = history.filter(row => row && row.kind === 'generate-lesson' && row.finishedAt);
    wizardState.generationHistoryLoadedAt = now;
  } catch (error) {
    wizardState.generationHistory = [];
    wizardState.generationHistoryLoadedAt = now;
  }
  return wizardState.generationHistory;
}

/**
 * #71: the stage order drives both the checklist (`step-generate.ts`) and the ETA
 * (`state.ts`), so it lives here once. Labels stay in the renderer step file.
 */
const WIZARD_GENERATION_STAGES_ORDER = ['retrieve', 'generate', 'validate', 'repair', 'ready'];

/**
 * #75: the same contract for step 2 (`lesson:analyze`), mirroring
 * `ANALYSIS_STAGE_ORDER` in `src/shared/generation-eta.ts`. Kept as a plain
 * renderer copy for the same reason as the generation order: the renderer has no
 * bundler and cannot import `src/shared` at runtime.
 */
const WIZARD_ANALYSIS_STAGES_ORDER = ['prepare', 'generate', 'repair', 'ready'];

/**
 * #75: stage fraction for step 2 — a stage counter, not a timer. `ready` is
 * always 1 so a skipped repair stage cannot leave the bar stuck at 75%.
 */
function wizardAnalysisProgressFraction(stage) {
  const order = WIZARD_ANALYSIS_STAGES_ORDER;
  if (stage === 'ready') return 1;
  const index = order.indexOf(stage);
  if (index < 0) return 0;
  return Math.min(1, (index + 1) / order.length);
}

/**
 * #75: total elapsed time of a finished run as "mm:ss" (or "h:mm:ss" past the
 * hour), or '' when nothing was frozen. Mirrors `formatStopwatch` in
 * `src/shared/generation-eta.ts`; the `generation-eta` test keeps them in step.
 */
function wizardFormatStopwatch(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor((Number(milliseconds) || 0) / 1000));
  if (totalSeconds <= 0) return '';
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes}:${String(seconds).padStart(2, '0')}`;
  const hours = Math.floor(minutes / 60);
  return `${hours}:${String(minutes % 60).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * #71: the honest ETA line under the stage list.
 *
 * Three states, in order of honesty:
 *   - no measured baseline  -> "Đang chạy…" (no number is invented)
 *   - projected finish      -> "Còn khoảng X"
 *   - already past it       -> "Đã lâu hơn lần trước" (no false countdown)
 */
function wizardGenerationEtaText() {
  const s = wizardState;
  const startedAt = Number(s.generationStartedAt) || 0;
  const elapsed = startedAt ? Date.now() - startedAt : 0;
  const stages = WIZARD_GENERATION_STAGES_ORDER;
  const index = Math.max(0, stages.indexOf(s.lessonStage));
  const estimate = wizardGenerationEtaMs(elapsed, index, stages.length, s.generationHistory, Date.now());
  if (!estimate) return '';
  if (estimate.overrunMs > 0) return 'Đã lâu hơn lần tạo trước — vẫn đang chạy.';
  return `Còn khoảng ${wizardFormatEta(estimate.remainingMs)}`;
}


/** Which long-running wizard job owns the shared top-bar activity chip. */
function wizardActivityKind() {
  if (wizardState.busy === 'analyze' && wizardState.analysisStartedAt) return 'analyze';
  if (wizardState.busy === 'generate' && wizardState.generationStartedAt) return 'generate';
  return '';
}

function wizardSyncActivityClock() {
  const kind = wizardActivityKind();
  const chip = document.getElementById('globalAiActivity');
  if (chip) {
    chip.hidden = !kind;
    chip.title = kind === 'generate' ? 'Mở tiến trình tạo nội dung' : 'Mở tiến trình phân tích';
    const label = chip.querySelector('[data-global-ai-label]');
    if (label) label.textContent = kind === 'generate' ? 'AI đang tạo nội dung' : 'AI đang phân tích';
    const chipElapsed = chip.querySelector('[data-global-ai-elapsed]');
    if (chipElapsed && kind) {
      const startedAt = kind === 'generate' ? wizardState.generationStartedAt : wizardState.analysisStartedAt;
      chipElapsed.textContent = wizardFormatDuration(Date.now() - startedAt);
    }
  }
  if (!kind) return;
  if (kind === 'analyze') {
    const text = wizardAnalysisElapsedText();
    document.querySelectorAll('[data-wizard-analysis-elapsed]').forEach(node => { node.textContent = text; });
  } else {
    const text = wizardGenerationElapsedText();
    document.querySelectorAll('[data-wizard-generate-elapsed]').forEach(node => { node.textContent = text; });
    // #71: the ETA is a separate element from the elapsed clock because it can be
    // absent (no baseline yet) while the clock is always present.
    const eta = wizardGenerationEtaText();
    document.querySelectorAll('[data-wizard-generate-eta]').forEach(node => { node.textContent = eta; });
  }
}

function wizardStartActivityClock(kind) {
  wizardStopActivityClock();
  if (kind === 'generate') {
    wizardState.generationStartedAt = Date.now();
    wizardState.analysisStartedAt = 0;
    wizardState.generationFinishedMs = 0;
  } else {
    wizardState.analysisStartedAt = Date.now();
    wizardState.generationStartedAt = 0;
    wizardState.analysisFinishedMs = 0;
  }
  wizardSyncActivityClock();
  wizardActivityClockTimer = window.setInterval(wizardSyncActivityClock, 1000);
}

function wizardStartAnalysisClock() { wizardStartActivityClock('analyze'); }
function wizardStartGenerationClock() { wizardStartActivityClock('generate'); }

/**
 * #75: stops the ticking clock and, when the caller says the run finished, keeps
 * its total so the step can print it after the panel is gone.
 *
 * Only a finished run is frozen: a cancelled or failed one stores nothing, so the
 * UI can never show a total for work that was thrown away. The span is clamped at
 * zero because a clock adjusted backwards mid-run would otherwise print a
 * negative duration.
 */
function wizardStopActivityClock(options) {
  if (wizardActivityClockTimer !== null) {
    window.clearInterval(wizardActivityClockTimer);
    wizardActivityClockTimer = null;
  }
  const chip = document.getElementById('globalAiActivity');
  if (chip) chip.hidden = true;
  if (!options || !options.finished) return;
  const now = Date.now();
  const analysisStartedAt = Number(wizardState.analysisStartedAt) || 0;
  const generationStartedAt = Number(wizardState.generationStartedAt) || 0;
  if (analysisStartedAt) wizardState.analysisFinishedMs = Math.max(0, now - analysisStartedAt);
  if (generationStartedAt) wizardState.generationFinishedMs = Math.max(0, now - generationStartedAt);
}

/** Kept as an alias so the analysis step keeps one obvious start/stop pair. */
function wizardStopAnalysisClock(options) { wizardStopActivityClock(options); }
/** Step 5 equivalent of `wizardStopAnalysisClock`. */
function wizardStopGenerationClock(options) { wizardStopActivityClock(options); }

function wizardClearMessages() {
  wizardState.error = null;
  wizardState.notice = null;
}

function wizardSetError(error) {
  wizardState.error = wizardParseError(error);
  wizardState.notice = null;
}

function wizardSetNotice(message) {
  wizardState.notice = message;
  wizardState.error = null;
}

function wizardReset() {
  wizardStopActivityClock();
  Object.assign(wizardState, {
    step: 'input',
    projectId: null,
    createdAt: null,
    gameId: null,
    documentId: null,
    documentName: '',
    documentMeta: null,
    text: '',
    analysis: null,
    analysisId: null,
    analysisOriginal: null,
    recommendations: [],
    selectedGameType: null,
    selectedRecommendationId: null,
    config: null,
    draft: null,
    gameSnapshot: null,
    quality: null,
    context: null,
    capacity: null,
    countTouched: false,
    quick: null,
    busy: '',
    lessonStage: '',
    lessonRepaired: false,
    analysisStartedAt: 0,
    generationStartedAt: 0,
    analysisFinishedMs: 0,
    generationFinishedMs: 0,
    // #76: a new project has no reviewed scope yet.
    structure: null,
    error: null,
    notice: null,
    activeRequestId: null
  });
}

/** Extracts a stable `[CODE]` marker from IPC errors so the UI can react per code. */
function wizardParseError(error) {
  const raw = String((error && error.message) || error || '').trim();
  const match = raw.match(/\[([A-Z_]{3,})\]\s*([\s\S]*)$/);
  if (match) return { code: match[1], message: match[2].trim() || raw };
  const cleaned = raw
    .replace(/^Error invoking remote method '[^']*':\s*/, '')
    .replace(/^[A-Za-z]*Error:\s*/, '')
    .trim();
  return { code: '', message: cleaned || 'Đã xảy ra lỗi không xác định.' };
}

const wizardErrorMessages = {
  AI_NOT_RUNNING: 'AI local chưa chạy. Hãy mở cửa sổ AI local · llama.cpp, chọn model đã tải xong rồi nhấn “Bắt đầu chạy”.',
  AI_BUSY: 'AI local đang xử lý một yêu cầu khác. Hãy đợi yêu cầu hiện tại hoàn tất hoặc huỷ nó trước khi thử lại.',
  AI_CONFIG: 'Chưa cấu hình AI local đúng cách. Hãy kiểm tra trong Cài đặt.',
  AI_CONNECTION: 'Không kết nối được tới AI local. Hãy kiểm tra cửa sổ AI local còn mở không rồi thử lại.',
  AI_TIMEOUT: 'AI local phản hồi quá lâu. Hãy thử lại với giáo án ngắn hơn hoặc model nhỏ hơn.',
  AI_CANCELLED: 'Bạn đã huỷ yêu cầu AI.',
  AI_HTTP: 'AI local báo lỗi khi xử lý. Hãy thử lại.',
  AI_EMPTY: 'AI local không trả về nội dung. Hãy thử lại.',
  AI_TRUNCATED: 'Câu trả lời bị cắt do giới hạn độ dài. Hãy giảm yêu cầu hoặc thử lại.',
  AI_INVALID_JSON: 'AI local trả về dữ liệu không đọc được. Hãy thử lại.',
  AI_OUTPUT_INVALID: 'Nội dung AI trả về chưa đúng cấu trúc. Hãy thử lại hoặc chỉnh sửa thủ công ở bước sau.',
  GENERATION_INVALID: 'Nội dung AI tạo ra chưa vượt qua kiểm tra của trò chơi (thiếu đáp án đúng, chặng bị lệch…). Hãy tạo lại, hoặc giảm số lượng câu/chặng rồi thử lại.'
};

function wizardErrorText(error = wizardState.error) {
  if (!error) return '';
  return wizardErrorMessages[error.code] || error.message || 'Đã xảy ra lỗi không xác định.';
}

/** Failures that mean the local runtime/model is unusable (offer the AI-local window). */
const wizardAiRecoveryCodes = ['AI_NOT_RUNNING', 'AI_CONFIG', 'AI_CONNECTION', 'AI_TIMEOUT'];

function wizardNeedsAiRuntime(error = wizardState.error) {
  return Boolean(error && wizardAiRecoveryCodes.includes(error.code));
}

const wizardDifficultyOptions = ['dễ', 'trung bình', 'khó'];
const wizardAudienceOptions = [
  { value: 'child', label: 'Học sinh nhỏ' },
  { value: 'teen', label: 'Học sinh phổ thông' },
  { value: 'adult', label: 'Người lớn' }
];
const wizardStyleOptions = [
  { value: 'fun', label: 'Vui nhộn' },
  { value: 'exploration', label: 'Khám phá' },
  { value: 'competition', label: 'Thi đua' },
  { value: 'realistic', label: 'Thực tế' },
  { value: 'minimal', label: 'Tối giản' }
];

/** Builds a schema-valid default config for a recommended game type. */
function wizardDefaultConfig(recommendation, analysis) {
  const gameType = recommendation.gameType;
  // O12: automatic counts live in 4..7 (content/time guard). The capacity
  // endpoint refines this with document length + the model actually in use.
  const suggestedCount = wizardClamp(Number(recommendation.suggestedQuestionCount) || 5, 4, 7);
  const base = {
    gameType,
    title: recommendation.title || (analysis && analysis.topic) || 'Trò chơi mới',
    subject: (analysis && analysis.subject) || '',
    grade: analysis && analysis.grade ? String(analysis.grade) : '',
    topic: (analysis && analysis.topic) || '',
    audience: 'teen',
    durationMinutes: wizardClamp(recommendation.suggestedDurationMinutes || 10, 1, 120),
    difficulty: 'trung bình',
    playMode: gameType === 'race' ? 'team' : 'individual',
    style: 'fun',
    focusObjectiveIds: Array.isArray(recommendation.learningObjectiveIds) ? recommendation.learningObjectiveIds.slice() : [],
    generationMode: 'fast'
  };
  if (gameType === 'arena') {
    return { ...base, questionCount: wizardClamp(suggestedCount, 1, 30), scoringMode: 'speed', pointsPerCorrect: 100, timeBonus: 20, pointsEasy: 100, pointsMedium: 200, pointsHard: 300 };
  }
  if (gameType === 'scenario') {
    return { ...base, situationCount: wizardClamp(suggestedCount, 1, 30), scoringMode: 'quality' };
  }
  if (gameType === 'matching') {
    return { ...base, pairCount: wizardClamp(suggestedCount, 2, 30), matchingMode: 'columns', wrongPenalty: 0 };
  }
  if (gameType === 'treasure') {
    return { ...base, stageCount: wizardClamp(suggestedCount, 2, 30), attemptsPerStage: 3, journeyBonus: 300, hiddenItemBonus: 100 };
  }
  if (gameType === 'race') {
    return { ...base, trackLength: 20, maxRounds: wizardClamp(suggestedCount, 4, 7), teamCount: 2, stepByDifficulty: true, luckEnabled: true };
  }
  return base;
}

/** Turns the current wizard state into a `GameProject` row for `project:save-draft`. */
function wizardBuildProject(step) {
  const s = wizardState;
  const config = s.config || null;
  // The store requires `config.gameType === draft.gameType` and rejects the whole
  // project otherwise. Changing genre clears the draft (see
  // `wizardDiscardGeneratedContent`); this is the last-resort guard so a stale
  // pair can never block a save.
  const staleContent = Boolean(config && s.draft && config.gameType !== s.draft.gameType);
  const effectiveStep = staleContent && step === 'done' ? 'generate' : step;
  const title = (config && config.title) || (s.analysis && s.analysis.topic) || s.documentName || 'Dự án mới';
  return {
    id: s.projectId,
    schemaVersion: 1,
    status: effectiveStep === 'done' ? 'ready' : s.analysis ? 'review' : 'draft',
    step: effectiveStep || s.step,
    title,
    description: (s.analysis && s.analysis.topic) || '',
    tags: ['AI local'],
    sourceName: s.documentName || '',
    lesson: s.documentId
      ? { documentId: s.documentId, name: s.documentName || '', characters: (s.documentMeta && s.documentMeta.characters) || 0 }
      : null,
    analysisId: s.analysisId || null,
    recommendationId: s.selectedRecommendationId || null,
    config,
    draft: staleContent ? null : s.draft || null,
    gameSnapshot: staleContent ? null : s.gameSnapshot || null,
    gameId: staleContent ? null : s.gameId || null,
    createdAt: s.createdAt || wizardNow(),
    updatedAt: wizardNow()
  };
}

function wizardNewProjectId() {
  return `project_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Persists the wizard as a draft. Returns the stored project (or null on failure). */
async function wizardSaveProject(step) {
  if (!wizardState.projectId) {
    wizardState.projectId = wizardNewProjectId();
    wizardState.createdAt = wizardNow();
  }
  const project = wizardBuildProject(step);
  const saved = await window.eduGame.saveProjectDraft(project);
  wizardState.projectId = saved.id;
  wizardState.createdAt = saved.createdAt || wizardState.createdAt;
  wizardState.projects = await window.eduGame.listProjects();
  wizardState.projectsLoaded = true;
  return saved;
}

/**
 * True when the generated game is already a row in the library, so the copy in
 * the project can be dropped without losing the teacher's work. Generation sets
 * `gameId` before anything is saved, so the library is the only reliable check.
 */
function wizardGameSavedToLibrary() {
  return Boolean(wizardState.gameId)
    && Array.isArray(state.db.games)
    && state.db.games.some(game => game.id === wizardState.gameId);
}

/**
 * Drops the generated content (draft, snapshot, quality report, retrieval
 * summary). Used when the teacher switches genre: content belongs to one genre
 * and the store refuses a project whose config and draft disagree.
 */
function wizardDiscardGeneratedContent() {
  wizardState.draft = null;
  wizardState.gameSnapshot = null;
  wizardState.gameId = null;
  wizardState.quality = null;
  wizardState.context = null;
  wizardState.lessonStage = '';
  wizardState.lessonRepaired = false;
}

// ---------------------------------------------------------------------------
// O12 — predicted item count (document length + analysis richness + model/mode)
// ---------------------------------------------------------------------------

/** Config key that holds the item count for each genre, or '' for none. */
function wizardCapacityCountKey(gameType) {
  return {
    arena: 'questionCount',
    scenario: 'situationCount',
    matching: 'pairCount',
    treasure: 'stageCount',
    race: 'maxRounds'
  }[gameType] || '';
}

/** Vietnamese unit used by the count hints/warnings for each genre. */
function wizardItemUnit(gameType) {
  return {
    arena: 'câu hỏi',
    scenario: 'tình huống',
    matching: 'cặp ghép',
    treasure: 'chặng',
    race: 'câu hỏi'
  }[gameType] || 'mục';
}

let wizardCapacityInflight = '';

/**
 * Asks the main process to predict a sensible item count for the current
 * document + analysis + model + mode (no AI call). The result is advisory and
 * cached per project/genre/mode; `countTouched` keeps a teacher's own number.
 */
async function wizardEnsureCapacity() {
  const s = wizardState;
  const config = s.config;
  if (!config || !s.projectId || typeof window.eduGame.estimateLessonCapacity !== 'function') return;
  const key = `${s.projectId}|${config.gameType}|${config.generationMode}`;
  if (s.capacity && s.capacity.key === key) return;
  if (wizardCapacityInflight === key) return;
  wizardCapacityInflight = key;
  try {
    const estimate = await window.eduGame.estimateLessonCapacity({
      projectId: s.projectId,
      gameType: config.gameType,
      mode: config.generationMode
    });
    if (!estimate) return;
    if (!wizardState.config || `${wizardState.projectId}|${wizardState.config.gameType}|${wizardState.config.generationMode}` !== key) return;
    wizardState.capacity = { ...estimate, key };
    if (typeof wizardApplyCapacity === 'function') wizardApplyCapacity();
  } catch {
    // Prediction is an optimisation; never block configuration or generation.
  } finally {
    if (wizardCapacityInflight === key) wizardCapacityInflight = '';
  }
}

/**
 * Genre changes invalidate the draft. Saved-to-library content is redundant (the
 * game stays playable in the library) and is dropped silently; an unsaved draft
 * costs minutes of generation, so ask first.
 */
function wizardConfirmGenreChange() {
  if (!wizardState.draft) return true;
  if (wizardGameSavedToLibrary()) return true;
  const label = wizardGameMeta(wizardState.draft.gameType).label;
  return window.confirm(
    `Nội dung “${label}” chưa được lưu vào Thư viện trò chơi. Đổi thể loại sẽ bỏ nội dung này. Tiếp tục?`
  );
}

/**
 * Starts a second project from the same lesson without touching the model.
 *
 * The lesson document and its analysis are carried over by id, while the
 * game-specific fields are cleared. The teacher therefore lands on the genre
 * step with the previous analysis/recommendations already available; changing
 * genre or config only affects generation, not analysis.
 */
async function wizardStartAnotherGame() {
  if (wizardState.busy) return undefined;
  if (!wizardState.analysisId || !wizardState.analysis) {
    wizardSetError(new Error('Chưa có kết quả phân tích để dùng lại. Hãy phân tích giáo án trước.'));
    if (state.page === 'create-wizard') render();
    return undefined;
  }
  const lesson = {
    documentId: wizardState.documentId,
    documentName: wizardState.documentName,
    documentMeta: wizardState.documentMeta,
    text: wizardState.text,
    analysis: wizardState.analysis,
    analysisOriginal: wizardState.analysisOriginal,
    analysisId: wizardState.analysisId,
    recommendations: (wizardState.recommendations || []).slice()
  };
  wizardReset();
  Object.assign(wizardState, {
    documentId: lesson.documentId,
    documentName: lesson.documentName,
    documentMeta: lesson.documentMeta,
    text: lesson.text,
    analysis: lesson.analysis,
    analysisOriginal: lesson.analysisOriginal,
    analysisId: lesson.analysisId,
    recommendations: lesson.recommendations,
    step: 'recommend',
    busy: 'save'
  });
  wizardClearMessages();
  if (state.page === 'create-wizard') render();
  try {
    await wizardSaveProject('recommend');
    // Recommendations are deterministic (no model call). Rebuild them only if
    // this analysis has never produced a set, so the teacher still sees genres.
    if (!wizardState.recommendations.length) {
      try {
        // No projectId: this only fills the deterministic suggestion list. The
        // new project stays at `recommend` until the teacher picks a genre.
        const result = await window.eduGame.recommendGames({
          analysisId: wizardState.analysisId,
          requestId: wizardNewRequestId('recommend')
        });
        wizardState.recommendations = result.recommendations || [];
      } catch {
        // The recommendation step has its own retry button.
      }
    }
    wizardSetNotice('Đã tạo dự án mới từ cùng giáo án. Phân tích được dùng lại — không gọi AI phân tích lại.');
    toast('Đã tạo dự án mới từ cùng giáo án.');
  } catch (error) {
    wizardSetError(error);
    toast(wizardErrorText());
  }
  wizardState.busy = '';
  if (state.page === 'create-wizard') render();
  return undefined;
}

/**
 * Step-5 save. It must save the *current* step, not `configure`: the old button
 * reused the configure-save helper, which rewound the persisted project every
 * time the teacher saved after generating.
 */
async function wizardSaveCurrentProject() {
  if (wizardState.busy) return undefined;
  wizardState.busy = 'save';
  wizardClearMessages();
  render();
  try {
    // Do not rewind a project whose game was already saved to the library.
    const savedInLibrary = wizardGameSavedToLibrary();
    const step = savedInLibrary ? 'done' : wizardState.step === 'edit' ? 'generate' : wizardState.step;
    await wizardSaveProject(step);
    wizardSetNotice(`Đã lưu tiến trình dự án lúc ${new Date().toLocaleTimeString('vi-VN')}.`);
    // The status area is above the long step-5 body, so the teacher may not see
    // the inline notice from the bottom action row. Confirm with a toast too.
    toast('Đã lưu tiến trình dự án.');
  } catch (error) {
    wizardSetError(error);
    toast(wizardErrorText());
  }
  wizardState.busy = '';
  render();
  return undefined;
}

/**
 * Explicit step-5 "save to library". The adapter-validated snapshot is the only
 * object written; the project row keeps its id and points at the library game so
 * reopening the project can continue from the same content.
 */
async function wizardSaveGameToLibrary() {
  if (wizardState.busy) return undefined;
  const game = wizardState.gameSnapshot;
  if (!game) {
    toast('Chưa có nội dung trò chơi để lưu. Hãy tạo nội dung trước.');
    return undefined;
  }
  wizardState.busy = 'save-game';
  wizardClearMessages();
  render();
  try {
    const saved = await window.eduGame.saveGame(game);
    wizardState.gameSnapshot = saved;
    wizardState.gameId = saved.id;
    await wizardSaveProject('done');
    if (typeof refreshDb === 'function') await refreshDb();
    wizardSetNotice(`Đã lưu “${saved.title}” vào Thư viện trò chơi lúc ${new Date().toLocaleTimeString('vi-VN')}. Bạn có thể chơi thử hoặc quay lại chỉnh sửa.`);
    toast(`Đã lưu “${saved.title}” vào Thư viện trò chơi.`);
  } catch (error) {
    wizardSetError(error);
    toast(wizardErrorText());
  }
  wizardState.busy = '';
  render();
  return undefined;
}

async function wizardRefreshProjects() {
  try {
    wizardState.projects = await window.eduGame.listProjects();
  } catch {
    wizardState.projects = [];
  }
  wizardState.projectsLoaded = true;
}

/** Reopens a draft from the store without calling AI. */
async function wizardOpenProject(projectId) {
  const project = await window.eduGame.getProject(projectId);
  if (!project) throw new Error('Không tìm thấy dự án để mở.');
  wizardReset();
  wizardState.projectId = project.id;
  wizardState.createdAt = project.createdAt;
  wizardState.gameId = project.gameId || null;
  wizardState.documentId = project.lesson ? project.lesson.documentId : null;
  wizardState.documentName = project.lesson ? project.lesson.name : (project.sourceName || '');
  wizardState.documentMeta = project.lesson ? { characters: project.lesson.characters, ext: '', sizeBytes: 0 } : null;
  wizardState.config = project.config || null;
  wizardState.draft = project.draft || null;
  wizardState.gameSnapshot = project.gameSnapshot || null;
  // O2: recompute the advisory quality report locally (no model call).
  wizardState.quality = null;
  // O3: the retrieval summary belongs to the last generation, not the project.
  wizardState.context = null;
  wizardState.capacity = null;
  // Reopened projects are already settled: a saved draft means the teacher
  // accepted its item count, so never rewrite it automatically.
  wizardState.countTouched = Boolean(project.draft || project.gameSnapshot);
  wizardState.quick = null;
  if (project.draft && project.config && typeof window.eduGame.checkLessonQuality === 'function') {
    try {
      wizardState.quality = await window.eduGame.checkLessonQuality({ projectId: project.id });
    } catch {
      wizardState.quality = null;
    }
  }
  wizardState.analysisId = project.analysisId || null;
  wizardState.selectedRecommendationId = project.recommendationId || null;

  if (project.lesson) {
    try {
      const document = await window.eduGame.getLessonDocument(project.lesson.documentId);
      if (document) {
        wizardState.text = document.text || '';
        wizardState.documentMeta = { characters: document.characters, ext: document.ext, sizeBytes: document.sizeBytes };
      }
    } catch {
      // The project/draft/game snapshot is still usable even when the source file
      // was moved or deleted; explain that instead of failing the whole open.
      wizardState.text = '';
      wizardState.documentMeta = { characters: project.lesson.characters || 0, ext: '', sizeBytes: 0 };
      wizardSetNotice('Không đọc được tệp giáo án nguồn (có thể đã bị di chuyển hoặc xoá). Bạn vẫn có thể xem bản nháp đã lưu, nhưng cần nhập lại tệp nếu muốn phân tích lại.');
    }
  }
  if (project.analysisId) {
    wizardState.analysis = await window.eduGame.getLessonAnalysis(project.analysisId);
    wizardState.analysisOriginal = wizardState.analysis;
    wizardState.recommendations = await window.eduGame.getLessonRecommendations(project.analysisId);
    if (project.recommendationId) {
      const chosen = wizardState.recommendations.find(item => item.id === project.recommendationId);
      wizardState.selectedGameType = chosen ? chosen.gameType : (project.config ? project.config.gameType : null);
    }
  }
  wizardState.step = project.step === 'done' || project.step === 'edit' ? 'generate' : project.step;
  return project;
}

/**
 * Loads a saved lesson source (and optionally one of its analyses) without
 * creating a project or calling AI. This is the shared path for "Mở lại" in the
 * Giáo án page; the teacher can review the cached analysis and then start another
 * game from it.
 */
async function wizardLoadSavedLesson(documentId, analysisId) {
  const document = await window.eduGame.getLessonDocument(documentId);
  if (!document) throw new Error('Không tìm thấy tệp giáo án đã lưu. Hãy nhập lại tài liệu nguồn.');
  const analysis = analysisId ? await window.eduGame.getLessonAnalysis(analysisId) : null;
  if (analysisId && (!analysis || analysis.documentId !== document.id)) {
    throw new Error('Không tìm thấy kết quả phân tích của giáo án này.');
  }
  wizardReset();
  wizardState.documentId = document.id;
  wizardState.documentName = document.name || 'giao-an.txt';
  wizardState.documentMeta = {
    characters: document.characters || String(document.text || '').length,
    ext: document.ext || 'txt',
    sizeBytes: document.sizeBytes || 0
  };
  wizardState.text = document.text || '';
  if (analysis) {
    wizardState.analysis = analysis;
    wizardState.analysisOriginal = analysis;
    wizardState.analysisId = analysis.id;
    wizardState.recommendations = await window.eduGame.getLessonRecommendations(analysis.id);
    wizardState.step = 'analyze';
  } else {
    wizardState.step = 'input';
  }
  return { document, analysis };
}

async function wizardOpenSavedLesson(documentId, analysisId) {
  if (wizardState.busy) return undefined;
  wizardState.busy = 'open';
  wizardClearMessages();
  render();
  try {
    const { analysis } = await wizardLoadSavedLesson(documentId, analysisId);
    wizardSetNotice(analysis
      ? 'Đã mở lại giáo án và kết quả phân tích đã lưu. Bạn có thể xem lại rồi chọn thể loại trò chơi.'
      : 'Đã mở lại giáo án đã lưu. Hãy phân tích hoặc tiếp tục tạo trò chơi.');
  } catch (error) {
    wizardSetError(error);
  }
  wizardState.busy = '';
  render();
  return undefined;
}

/**
 * Starts a new game from an already-analysed lesson. A new project row is created
 * at the category step; the analysis is reused exactly as-is (zero AI calls).
 */
async function wizardCreateGameFromSavedLesson(documentId, analysisId) {
  if (wizardState.busy) return undefined;
  wizardState.busy = 'open';
  wizardClearMessages();
  render();
  try {
    const { analysis } = await wizardLoadSavedLesson(documentId, analysisId);
    if (!analysis) throw new Error('Giáo án này chưa có kết quả phân tích. Hãy phân tích trước khi tạo trò chơi.');
    if (!wizardState.recommendations.length) {
      await window.eduGame.recommendGames({ analysisId: analysis.id });
      wizardState.recommendations = await window.eduGame.getLessonRecommendations(analysis.id);
    }
    wizardState.step = 'recommend';
    wizardState.projectId = wizardNewProjectId();
    wizardState.createdAt = wizardNow();
    await wizardSaveProject('recommend');
    wizardSetNotice('Đã tạo dự án mới từ kết quả phân tích cũ (không gọi AI). Hãy chọn thể loại trò chơi.');
  } catch (error) {
    wizardSetError(error);
  }
  wizardState.busy = '';
  render();
  return undefined;
}
