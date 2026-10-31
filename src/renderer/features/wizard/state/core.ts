// @ts-nocheck -- wizard/state/core.ts — state dùng chung của wizard: bước, trạng thái, đồng hồ/ETA, thông báo và reset (split từ features/wizard/state.ts, DECISIONS #150).
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
  // update_quy_trinh §2/§3 nhánh B: the teacher's choice of input type, the rule-based
  // detection that backs it, and the questions parsed from the text. `inputKind`
  // `'auto'` means "use whatever the rules say"; anything else is an explicit choice.
  inputKind: 'auto',
  inputClassification: null,
  inputSemantic: null,
  inputSemanticNote: '',
  importedQuestions: [],
  importIssues: [],
  /**
   * #115: every recognised question with its kind, status and warnings
   * (`ParsedQuestion` from `question-import.ts`), the per-game scores main computed
   * (`GameCompatibility` from `question-compatibility.ts`), and where the questions
   * in the draft came from (`'source'` = teacher's bank, `'ai'` = the analyse
   * pipeline). All three are plain data on purpose: the renderer is a classic script
   * and cannot import those modules.
   */
  parsedQuestions: [],
  questionCompatibility: [],
  draftOrigin: null, // null | 'source' | 'ai'
  /** #115: this run skipped the model, so step 3 proposes immediately. */
  importedMode: false,
  /** Set only by branch B, so `lesson:generate` knows the draft needs no model. */
  draftSource: null,
  /** Monotonic id for in-flight classification requests (stale results are dropped). */
  classifySeq: 0,
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
  // #132: the provider the teacher picked in the wizard (empty = automatic policy).
  selectedProviderId: '',
  // #132 D14: the cloud provider whose last analysis attempt failed (red button only).
  cloudAnalysisFailed: '',
  // #132 D16: guard so the step's provider refresh runs once at a time.
  providerSyncInFlight: false,
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
/**
 * #115: tie-break order for imported banks, identical to
 * `COMPATIBILITY_GAME_ORDER` in `services/input/question-compatibility.ts` (pinned by
 * `tests/unit/question-compatibility.test.ts`). The renderer cannot import it.
 */
const wizardCompatGameOrder = ['arena', 'race', 'treasure', 'matching', 'scenario'];

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
 * (`wizard/state/core.ts`), so it lives here once. Labels stay in the renderer step file.
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

/** A cancelled run is not a failed provider (DECISIONS #132 §D14). */
function wizardErrorIsCancellation(error) {
  const parsed = wizardParseError(error);
  return Boolean(parsed && parsed.code === 'AI_CANCELLED');
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
    // Input-routing state must reset too: otherwise a new project inherits the
    // previous one's "Danh sách câu hỏi" choice and parsed questions, and its
    // "Tiếp tục" silently takes branch B with stale content.
    inputKind: 'auto',
    inputClassification: null,
    inputSemantic: null,
    inputSemanticNote: '',
    importedQuestions: [],
    importIssues: [],
    parsedQuestions: [],
    questionCompatibility: [],
    draftOrigin: null,
    importedMode: false,
    draftSource: null,
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
    activeRequestId: null,
    // #132: the provider the teacher picked in the wizard (empty = automatic policy).
    selectedProviderId: ''
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
