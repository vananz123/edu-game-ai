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
 * `COMPATIBILITY_GAME_ORDER` in `services/question-compatibility.ts` (pinned by
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

// #132: Step 2 / Step 5 show which provider they will use, without ever offering a
// configuration form (spec §1/§6). Everything here reads the key-free view main
// ships in `settings.ai` — no provider logic is duplicated in the renderer.

/** Label of the provider the workflow will use now ("AI local (llama.cpp)", "Gemini (Google)"…). */
function wizardProviderLabel() {
  const active = typeof aiActiveProvider === 'function' ? aiActiveProvider() : null;
  return active ? String(active.label || active.id) : 'AI';
}

/** " bằng AI local" / " bằng Gemini": the suffix both AI buttons carry. */
function wizardProviderSuffix(providerId) {
  const active = providerId && typeof aiProviderView === 'function'
    ? aiProviderView(providerId)
    : (typeof aiActiveProvider === 'function' ? aiActiveProvider() : null);
  if (!active) return '';
  return ` bằng ${active.id === 'local' ? 'AI local' : active.label}`;
}

/** The provider the teacher picked in the wizard; empty means "use the default". */
function wizardPickedProviderId() {
  return wizardState.selectedProviderId || '';
}

/**
 * The cloud provider the second button offers (DECISIONS #132 §D13): the provider the
 * teacher picked, or the first verified cloud provider. Only a provider that passed
 * its connection test can be offered — the step never advertises an untested key.
 */
/**
 * What the local button needs before it can run a real analysis (DECISIONS #132 §D14).
 * `ready` false means the step must open the AI-local window instead of starting a run
 * that could only fail with "AI local chưa chạy" a few seconds later.
 */
function wizardLocalAiLaunchState() {
  const machine = state.localAiMachine || {};
  const models = Array.isArray(state.localAiModels) ? state.localAiModels : [];
  const provider = typeof aiProviderView === 'function' ? aiProviderView('local') : null;
  const installed = models.filter(model => model && model.installed);
  const running = Boolean(machine.runtimeRunning) || Boolean(provider && provider.status === 'ready');
  if (!installed.length) {
    return { ready: false, need: 'model', message: 'Chưa có model AI local. Hãy mở cửa sổ AI local, tải một model rồi bấm “Bắt đầu chạy”.' };
  }
  if (!running) {
    return { ready: false, need: 'runtime', message: 'AI local đã có model nhưng chưa chạy. Hãy mở cửa sổ AI local và bấm “Bắt đầu chạy”.' };
  }
  return { ready: true, need: '', message: '' };
}

/** Red line above the buttons; does not run anything. */
function wizardLocalAiNoticeHtml() {
  const launch = wizardLocalAiLaunchState();
  if (launch.ready) return '';
  return `<div class="field-hint" data-wizard-local-notice="1" role="status" style="color:#dc2626">⚠ ${escapeHtml(launch.message)}</div>`;
}
// #132 D16: a page opened before a provider was verified keeps its old view. The wizard
// refreshes it on the step that shows the provider buttons, once at a time.
function wizardProvidersShouldSync() {
  return wizardState.providerSyncInFlight !== true;
}

async function wizardSyncProviders() {
  if (wizardState.providerSyncInFlight === true) return;
  wizardState.providerSyncInFlight = true;
  try {
    const view = await window.eduGame.getAiProviders();
    if (view && view.ai) {
      state.settings.ai = view.ai;
      render();
    }
  } catch (error) {
    // A failed refresh only means the step keeps what it had; a real failure shows
    // when the teacher runs the step.
  } finally {
    wizardState.providerSyncInFlight = false;
  }
}

function wizardCloudActionProvider() {
  const picked = wizardPickedProviderId();
  if (picked && picked !== 'local') return aiProviderView(picked);
  // The button exists for a provider that is configured, verified AND meant for the
  // lesson workflow (DECISIONS #132 D14). Both flags are required: `usable` alone would
  // also accept a provider the registry keeps out of the workflow.
  const cloud = aiProviderList().find(provider =>
    provider.id !== 'local' && provider.wizardEligible === true && provider.usable === true);
  return cloud || null;
}

/** A one-line privacy note that is true for the provider in use. */
function wizardProviderPrivacyText() {
  const active = typeof aiActiveProvider === 'function' ? aiActiveProvider() : null;
  if (!active || active.id === 'local') return 'AI local chạy trên máy này; giáo án không được gửi đi đâu. Có thể huỷ giữa chừng.';
  return `Giáo án và phần trả lời được gửi tới ${active.label} qua Internet. Không gửi dữ liệu học sinh; có thể huỷ giữa chừng.`;
}

/**
 * The provider the AI buttons will call: the teacher's pick while there is still
 * more than one usable provider, otherwise nothing (main applies the policy).
 * Sent on every request so a draft run and its per-item regenerations agree.
 */
function wizardProviderRequestPayload(explicitProviderId) {
  // An explicit button always wins over the picker. `localPreferred` tells main that
  // "AI local" was pressed on purpose: a running local runtime is used even when a
  // cloud provider is also ready, and a stopped one is an error, not a silent switch.
  if (explicitProviderId === 'local') return { providerId: 'local', localPreferred: true };
  if (explicitProviderId) return { providerId: explicitProviderId };
  const picker = typeof aiProviderPicker === 'function' ? aiProviderPicker() : { show: false };
  if (!picker.show || !wizardState.selectedProviderId) return {};
  return { providerId: wizardState.selectedProviderId };
}

/** Compact picker; it exists only when at least two providers are usable (#132 §D7). */
function wizardProviderPickerHtml() {
  const picker = typeof aiProviderPicker === 'function' ? aiProviderPicker() : { show: false, options: [] };
  if (!picker.show || !picker.options.length) return '';
  const selected = wizardState.selectedProviderId || picker.activeId || picker.options[0].id;
  return `<div class="field" data-wizard-provider-picker="1">
    <label>NHÀ CUNG CẤP AI CHO BƯỚC NÀY</label>
    <select id="wizardProviderSelect" data-wizard-provider-select>${picker.options.map(option =>
      `<option value="${escapeHtml(option.id)}"${option.id === selected ? ' selected' : ''}>${escapeHtml(option.label)}${option.model ? ` · ${escapeHtml(option.model)}` : ''}</option>`
    ).join('')}</select>
    <div class="field-hint">Dùng đúng nhà cung cấp này cho bước này; nếu lỗi, đổi ở đây hoặc mở Cài đặt AI. Ứng dụng không tự chuyển sang nhà cung cấp khác.</div>
  </div>`;
}

/**
 * Status strip + the way out when no provider can run: a short explanation and a
 * direct link to Settings, never a configuration form inside the wizard.
 */
function wizardProviderCard() {
  const ai = state.settings.ai || {};
  const active = typeof aiActiveProvider === 'function' ? aiActiveProvider() : null;
  const usable = (Array.isArray(ai.providers) ? ai.providers : []).filter(provider => provider.wizardEligible && provider.usable);
  if (usable.length) {
    const tone = 'border-[#ddf4e8] bg-[#effaf5] dark:bg-[#132d24] dark:border-[#1e4a3b]';
    // #132 D13: local is the default of the workflow; when a cloud provider is also
    // verified, say that the second button exists rather than hiding the choice.
    const cloud = typeof wizardCloudActionProvider === 'function' ? wizardCloudActionProvider() : null;
    const detail = active && active.id === 'local'
      ? (cloud ? 'AI local chạy trên máy này là mặc định; muốn dùng AI ngoài thì bấm nút thứ hai.' : 'AI local đang chạy trên máy này.')
      : 'Đã kiểm tra kết nối thành công.';
    return `<div class="flex gap-[12px] items-center border rounded-xl p-3 mb-4 ${tone}" data-wizard-provider="${escapeHtml(active ? active.id : '')}">
      <span class="text-[20px] shrink-0">🟢</span>
      <div class="min-w-0 flex-1">
        <strong class="text-[12px] block text-[#1e293b] dark:text-[#f8fafc]">Dùng ${escapeHtml(wizardProviderLabel())}</strong>
        <small class="block text-[11px] text-[#64748b] dark:text-[#94a3b8] mt-0.5 leading-snug">${escapeHtml(detail)}</small>
      </div>
      <button type="button" class="btn btn-secondary btn-small shrink-0" data-wizard-action="open-ai-settings">Cài đặt AI</button>
    </div>`;
  }
  const activeReason = active ? active.reason : 'Chưa có nhà cung cấp AI nào được cấu hình.';
  return `<div class="flex gap-[12px] items-center border rounded-xl p-3 mb-4 border-[#f2e3c8] bg-[#fdf7ec] dark:bg-[#2d2413] dark:border-[#4a3b1e]" data-wizard-provider="none" data-wizard-provider-empty="1">
    <span class="text-[20px] shrink-0">🟡</span>
    <div class="min-w-0 flex-1">
      <strong class="text-[12px] block text-[#1e293b] dark:text-[#f8fafc]">Chưa có nhà cung cấp AI sẵn sàng</strong>
      <small class="block text-[11px] text-[#64748b] dark:text-[#94a3b8] mt-0.5 leading-snug">${escapeHtml(activeReason)} Cấu hình khoá và kiểm tra kết nối một lần trong Cài đặt AI — không cần làm ở đây.</small>
    </div>
    <button type="button" class="btn btn-secondary btn-small shrink-0" data-wizard-action="open-ai-settings">Mở Cài đặt AI</button>
  </div>`;
}

/** #132: remembers the teacher's provider pick for this step; nothing is saved to disk. */
function wizardSelectProvider(providerId) {
  const wanted = String(providerId || '');
  // The select itself is the authority: it only exists while the picker is shown, so
  // a value coming from it is one of the offered providers.
  wizardState.selectedProviderId = wanted;
  render();
}
const wizardErrorMessages = {
  AI_NOT_RUNNING: 'AI local chưa chạy. Hãy mở cửa sổ AI local · llama.cpp, chọn model đã tải xong rồi nhấn “Bắt đầu chạy”.',
  AI_BUSY: 'AI local đang xử lý một yêu cầu khác. Hãy đợi yêu cầu hiện tại hoàn tất hoặc huỷ nó trước khi thử lại.',
  AI_CONFIG: 'Chưa cấu hình AI đúng cách. Hãy kiểm tra trong Cài đặt AI.',
  AI_CONNECTION: 'Không kết nối được tới AI local. Hãy kiểm tra cửa sổ AI local còn mở không rồi thử lại.',
  AI_TIMEOUT: 'AI local phản hồi quá lâu. Hãy thử lại với giáo án ngắn hơn hoặc model nhỏ hơn.',
  AI_CANCELLED: 'Bạn đã huỷ yêu cầu AI.',
  AI_HTTP: 'AI local báo lỗi khi xử lý. Hãy thử lại.',
  // #132: a cloud provider's own HTTP failure; keep it apart from AI_HTTP so the
  // message never blames the local model.
  AI_PROVIDER_HTTP: 'Nhà cung cấp AI trả lỗi khi xử lý. Hãy thử lại sau, hoặc kiểm tra model và endpoint trong Cài đặt AI.',
  AI_EMPTY: 'AI local không trả về nội dung. Hãy thử lại.',
  AI_TRUNCATED: 'Câu trả lời bị cắt do giới hạn độ dài. Hãy giảm yêu cầu hoặc thử lại.',
  AI_INVALID_JSON: 'AI local trả về dữ liệu không đọc được. Hãy thử lại.',
  AI_OUTPUT_INVALID: 'Nội dung AI trả về chưa đúng cấu trúc. Hãy thử lại hoặc chỉnh sửa thủ công ở bước sau.',
  // #132: provider selection and its failure modes, each with an actionable text.
  AI_NO_PROVIDER: 'Chưa có nhà cung cấp AI nào sẵn sàng. Hãy chạy AI local hoặc thêm API key của Gemini/ChatGPT trong Cài đặt AI, rồi kiểm tra kết nối một lần.',
  AI_PROVIDER_NOT_READY: 'Nhà cung cấp AI đã chọn chưa sẵn sàng. Hãy chọn nhà cung cấp khác hoặc mở Cài đặt AI để kiểm tra kết nối.',
  AI_PROVIDER_NOT_ELIGIBLE: 'Nhà cung cấp này chưa dùng được cho luồng tạo trò chơi. Hãy chọn AI local, Gemini hoặc ChatGPT.',
  AI_AUTH: 'API key của nhà cung cấp không hợp lệ hoặc bị thu hồi. Hãy nhập lại khoá trong Cài đặt AI.',
  AI_QUOTA: 'Tài khoản nhà cung cấp đã hết hạn mức. Hãy kiểm tra trang quản lý của nhà cung cấp hoặc chọn nhà cung cấp khác.',
  AI_RATE_LIMIT: 'Nhà cung cấp đang giới hạn số yêu cầu. Hãy đợi một lát rồi thử lại.',
  AI_MODEL_NOT_FOUND: 'Nhà cung cấp không có model đã chọn. Hãy kiểm tra tên model trong Cài đặt AI.',
  AI_NETWORK: 'Không kết nối được tới nhà cung cấp AI. Hãy kiểm tra mạng rồi thử lại.',
  AI_KEY_STORAGE_UNAVAILABLE: 'Máy này không lưu được khoá an toàn. Hãy nhập lại khoá trong Cài đặt AI trên máy này.'
};

function wizardErrorText(error = wizardState.error) {
  if (!error) return '';
  return wizardErrorMessages[error.code] || error.message || 'Đã xảy ra lỗi không xác định.';
}

/** Failures that mean the local runtime/model is unusable (offer the AI-local window). */
const wizardAiRecoveryCodes = ['AI_NOT_RUNNING', 'AI_CONFIG', 'AI_CONNECTION', 'AI_TIMEOUT', 'AI_NO_PROVIDER', 'AI_PROVIDER_NOT_READY', 'AI_PROVIDER_NOT_ELIGIBLE', 'AI_AUTH', 'AI_QUOTA', 'AI_RATE_LIMIT', 'AI_MODEL_NOT_FOUND', 'AI_NETWORK', 'AI_KEY_STORAGE_UNAVAILABLE', 'AI_PROVIDER_HTTP'];

function wizardNeedsAiRuntime(error = wizardState.error) {
  return Boolean(error && wizardAiRecoveryCodes.includes(error.code));
}

/** #132: failures that are fixed in Settings (keys, provider, model) rather than in the model window. */
const wizardProviderSettingCodes = ['AI_NO_PROVIDER', 'AI_PROVIDER_NOT_READY', 'AI_PROVIDER_NOT_ELIGIBLE', 'AI_AUTH', 'AI_QUOTA', 'AI_MODEL_NOT_FOUND', 'AI_KEY_STORAGE_UNAVAILABLE', 'AI_PROVIDER_HTTP'];
function wizardNeedsProviderSettings(error = wizardState.error) {
  // AI_CONFIG is the key/model/base-URL complaint and is fixed here; runtime codes
  // of the same name keep their own meaning (AI_NOT_RUNNING/AI_CONNECTION/AI_TIMEOUT).
  return Boolean(error && wizardProviderSettingCodes.includes(error.code))
    || Boolean(error && error.code === 'AI_CONFIG');
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

/**
 * update_quy_trinh (§2, §3 nhánh B, §5): which workflow path the pasted text takes.
 *
 * `auto` uses the rule classifier in the main process (`lesson:classify-input`),
 * which is pure and never starts the model. The two explicit choices let the
 * teacher overrule it.
 */
/**
 * The workflow path (two paths only). `outline` is a *label*, not a third path: an
 * outline still goes through lesson analysis, per update_quy_trinh_2 §2 ("assess
 * content sufficiency … lightweight analysis or optional AI-assisted development").
 * Keeping this function's return type at two values means no caller can accidentally
 * invent a third branch.
 */
function wizardResolveInputKind() {
  const override = wizardState.inputKind;
  if (override === 'questions') return 'questions';
  if (override === 'lesson' || override === 'outline') return 'lesson';
  const classification = wizardState.inputClassification;
  return classification && classification.kind === 'questions' ? 'questions' : 'lesson';
}

/** What the teacher sees in the verdict badge (may be `outline` or `ambiguous`). */
function wizardDetectedKind() {
  const override = wizardState.inputKind;
  if (override !== 'auto') return override;
  return wizardState.inputClassification ? wizardState.inputClassification.kind : null;
}

/**
 * Teacher picks the input type (or returns to auto-detect).
 */
async function wizardSetInputKind(kind) {
  if (wizardState.busy) return;
  if (kind !== 'auto' && kind !== 'lesson' && kind !== 'outline' && kind !== 'questions') return;
  wizardState.inputKind = kind;
  wizardClearMessages();
  if (kind === 'questions') await wizardClassifyInput();
  render();
}

/**
 * Debounced re-classification while the teacher types or pastes in step 1. The
 * verdict is shown in place (no full re-render) so typing keeps focus and caret.
 */
let wizardInputKindTimer = 0;
function wizardInputKindSchedule() {
  if (wizardInputKindTimer) clearTimeout(wizardInputKindTimer);
  wizardInputKindTimer = setTimeout(async () => {
    wizardInputKindTimer = 0;
    if (!wizardState.text || !String(wizardState.text).trim()) return;
    await wizardClassifyInput();
    // Patch just the picker block; re-rendering the whole page would drop the caret.
    if (wizardState.step !== 'input') return;
    const host = document.querySelector('[data-wizard-input-kind-picker]');
    if (host && typeof wizardInputKindPickerHtml === 'function') {
      host.outerHTML = wizardInputKindPickerHtml(wizardState);
    }
    if (typeof wizardSyncStepInputStats === 'function') wizardSyncStepInputStats();
  }, 450);
}

/**
 * Ask main to classify the text and (when it looks like a question bank) parse it.
 * Cheap enough to call on the debounced keystroke; no model, no disk write.
 */
async function wizardClassifyInput() {
  const text = String(wizardState.text || '');
  if (!text.trim()) {
    wizardState.inputClassification = null;
    wizardState.inputSemantic = null;
    wizardState.inputSemanticNote = '';
    wizardState.importedQuestions = [];
    wizardState.importIssues = [];
    wizardState.parsedQuestions = [];
    wizardState.questionCompatibility = [];
    return null;
  }
  // Sequence guard: classification can take ~250 ms with the semantic layer, so a
  // faster second paste could otherwise have its result overwritten by the first.
  // Only the newest request may write state.
  const requestId = (wizardState.classifySeq || 0) + 1;
  wizardState.classifySeq = requestId;
  try {
    const result = await window.eduGame.classifyLessonInput({ text });
    if (wizardState.classifySeq !== requestId) return null;
    wizardState.inputClassification = result.classification || null;
    wizardState.inputSemantic = result.semantic || null;
    wizardState.inputSemanticNote = result.semanticNote || '';
    wizardState.importedQuestions = result.import ? result.import.questions : [];
    wizardState.importIssues = result.import ? result.import.issues : [];
    // #115: per-question status + per-game scores travel with the verdict, so the
    // "ngân hàng câu hỏi" note and step 3 need no extra IPC round trip.
    wizardState.parsedQuestions = result.import && Array.isArray(result.import.parsed) ? result.import.parsed : [];
    wizardState.questionCompatibility = Array.isArray(result.compatibility) ? result.compatibility : [];
    return result;
  } catch {
    if (wizardState.classifySeq !== requestId) return null;
    // Classification is a convenience; failing it must never block step 1.
    wizardState.inputClassification = null;
    wizardState.inputSemantic = null;
    wizardState.inputSemanticNote = '';
    return null;
  }
}

/**
 * Default config for a question-bank project. Recommendations need a lesson
 * analysis, which branch B never produces, so the genre is chosen directly and the
 * config is built as if the teacher had accepted a question-heavy suggestion.
 */
function wizardConfigForImportedQuestions(gameType) {
  const count = wizardClamp((wizardState.importedQuestions || []).length || 5, 1, 30);
  const base = {
    gameType,
    title: wizardState.documentName || 'Trò chơi từ câu hỏi có sẵn',
    subject: '',
    grade: '',
    topic: '',
    audience: 'teen',
    durationMinutes: 10,
    difficulty: 'trung bình',
    playMode: gameType === 'race' ? 'team' : 'individual',
    style: 'fun',
    focusObjectiveIds: [],
    generationMode: 'fast'
  };
  if (gameType === 'arena') return { ...base, questionCount: count, scoringMode: 'basic', pointsPerCorrect: 100, timeBonus: 20, pointsEasy: 100, pointsMedium: 200, pointsHard: 300 };
  if (gameType === 'matching') return { ...base, pairCount: wizardClamp(count, 2, 30), matchingMode: 'columns', wrongPenalty: 0 };
  if (gameType === 'treasure') return { ...base, stageCount: wizardClamp(count, 2, 30), attemptsPerStage: 3, journeyBonus: 300, hiddenItemBonus: 100 };
  if (gameType === 'race') return { ...base, trackLength: 20, maxRounds: wizardClamp(count, 4, 7), teamCount: 2, stepByDifficulty: true, luckEnabled: true };
  return { ...base, situationCount: wizardClamp(count, 1, 30), scoringMode: 'quality' };
}

/** The game the scores point at, or `null` when no game can play one question. */
function wizardRecommendedGame() {
  const results = wizardState.questionCompatibility || [];
  if (!results.length) return null;
  const best = results.reduce((winner, current) => {
    if (current.score !== winner.score) return current.score > winner.score ? current : winner;
    // Same score: the shared game order decides (`recommendedGame` in the service).
    return wizardCompatGameOrder.indexOf(current.gameType) < wizardCompatGameOrder.indexOf(winner.gameType) ? current : winner;
  }, results[0]);
  return best && best.compatible > 0 && best.score > 0 ? best.gameType : null;
}

/** Scores for one genre; `null` when nothing was scored (e.g. a lesson, not a bank). */
function wizardCompatibilityFor(gameType) {
  const results = wizardState.questionCompatibility || [];
  return results.find(result => result.gameType === gameType) || null;
}

/** The parsed questions the chosen game can play, in source order (status `ready`). */
function wizardUsableParsed(gameType) {
  const parsed = wizardState.parsedQuestions || [];
  if (!parsed.length) {
    return (wizardState.importedQuestions || []).map(question => ({ question, kind: question.type || 'multiple-choice', status: 'ready', warnings: [], sourceLine: 0 }));
  }
  const accepted = gameType === 'race'
    ? ['multiple-choice']
    : ['multiple-choice', 'true-false', 'fill-in-blank', 'short-answer'];
  return parsed.filter(item => {
    if (!accepted.includes(item.kind)) return false;
    // A question whose only gap is the explanation the teacher must write stays usable
    // (#114/#116): the wizard saves it and blocks with "Còn N câu chưa có Giải thích",
    // instead of claiming that no question can be used at all.
    const onlyExplanation = item.status === 'needs-review' && item.warnings.length > 0
      && item.warnings.every(warning => /Giải thích/u.test(warning));
    if (item.status !== 'ready' && !onlyExplanation) return false;
    const options = Array.isArray(item.question.options) ? item.question.options.length : 0;
    return item.kind !== 'multiple-choice' || (options >= 2 && options <= 6);
  });
}

/** The parsed questions the chosen game can never play (excludes ones still in review). */
function wizardBlockedParsed(gameType) {
  const usable = new Set(wizardUsableParsed(gameType));
  return (wizardState.parsedQuestions || []).filter(item => item.status !== 'needs-review' && !usable.has(item));
}

/**
 * #116: the parser recognized at least one question, even when the classifier was not
 * confident enough to pick the `questions` path (`ambiguous` happens for a single
 * question). Those questions are still the teacher's own content and must not be sent
 * through the lesson pipeline.
 */
function wizardHasRecognizedQuestions() {
  const parsed = wizardState.parsedQuestions || [];
  return parsed.some(item => item.status === 'ready' || item.status === 'needs-review');
}

/** Counts shown in step 1 and step 3, all from the parser's own statuses. */
function wizardQuestionBankStats() {
  const parsed = wizardState.parsedQuestions || [];
  return {
    total: parsed.length || (wizardState.importedQuestions || []).length,
    needsReview: parsed.filter(item => item.status === 'needs-review').length,
    incompatible: parsed.filter(item => item.status === 'incompatible').length
  };
}

/** Turns the usable parsed questions into the arena-shaped draft a game converts from. */
function wizardImportedSourceDraft(usable) {
  return {
    gameType: 'arena',
    schemaVersion: 1,
    questions: usable.map(item => ({
      ...item.question,
      difficulty: item.question.difficulty || 'trung bình'
    }))
  };
}

/**
 * Branch B → configure. Skips `analyze` and `recommend` (both need a lesson
 * analysis), builds a draft straight from the teacher's questions, and saves it so
 * `lesson:generate` can convert it without any model call.
 *
 * `gameType` defaults to the game the scores recommend (#115); the teacher's pick in
 * step 3 is passed explicitly and recalculated there, never regenerated.
 */
async function wizardUseImportedQuestions(gameType) {
  if (wizardState.busy) return;
  if (!wizardState.importedQuestions.length) await wizardClassifyInput();
  const target = gameType || wizardRecommendedGame() || 'arena';
  // Only questions that are ready AND playable by the target; without this the
  // conversion failed for every question and the reason named the wrong field.
  const usable = wizardUsableParsed(target);
  if (!usable.length) {
    // Every row had a problem that stops it being a game question (no options, no
    // answer, a question shape no game supports, or no explanation — which the app
    // refuses to invent, §4.3).
    const issues = wizardState.importIssues || [];
    const first = issues[0];
    const stats = wizardQuestionBankStats();
    wizardSetError(new Error(first
      ? `Chưa có câu hỏi nào dùng được. ${first.message}`
      : stats.total
        ? `Không có câu nào phù hợp với thể loại đã chọn (${stats.needsReview} câu cần xem lại, ${stats.incompatible} câu không tương thích).`
        : 'Chưa nhận ra câu hỏi nào. Mỗi câu cần nội dung, ít nhất hai phương án A–D, một dòng “Đáp án:” và một dòng “Giải thích:”.'));
    render();
    return;
  }
  wizardState.busy = 'save';
  wizardClearMessages();
  render();
  try {
    // `importIssueSummary` counts by field from the same list the parser returned,
    // so the wizard and the importer cannot disagree about what is missing. Only the
    // questions actually going into the draft are checked: a bank row the teacher is
    // leaving out cannot block the game.
    const missingWhy = usable.filter(item => !String(item.question.explanation || '').trim()).length;
    if (missingWhy) {
      // The draft schema requires a non-empty explanation and the app must not invent
      // one, so the project cannot be saved in this state. Say exactly what is missing
      // instead of letting `saveProject` fail with a schema error.
      wizardState.busy = '';
      wizardSetError(new Error(
        `Còn ${missingWhy} câu chưa có “Giải thích:”. Thêm dòng “Giải thích: …” cho mỗi câu rồi thử lại — hệ thống không tự viết lời giải thay giáo viên.`
      ));
      render();
      return;
    }
    const config = wizardConfigForImportedQuestions(target);
    // Questions parsed from text are already `GameQuestion`s, which is exactly the
    // arena/subject shape, so arena needs no conversion at all.
    const source = wizardImportedSourceDraft(usable);
    let draft = target === 'arena' ? source : null;
    if (!draft) {
      const converted = await window.eduGame.convertLessonDraft({ draft: source, target, config });
      draft = converted && converted.draft ? converted.draft : null;
      if (draft && converted.gaps && converted.gaps.length) {
        wizardSetNotice(`Đã chuyển ${converted.converted} câu. Phần chưa chuyển được: ${converted.gaps.map(gap => gap.reason).join(' ')}`);
      }
    }
    if (!draft) {
      wizardState.busy = '';
      wizardSetError(new Error('Không chuyển được câu hỏi sang thể loại này. Ghép cặp và Tình huống cần nội dung khác; Giải mã kho báu cần bối cảnh và mô tả nhiệm vụ.'));
      render();
      return;
    }
    wizardState.config = wizardClampImportedConfig(draft, config);
    wizardState.draft = draft;
    wizardState.draftSource = 'imported-questions';
    wizardState.draftOrigin = 'source';
    // The genre is now part of the saved project, so step 3 (if the teacher goes back
    // there) shows it as chosen and the counts of that genre.
    wizardState.selectedGameType = target;
    wizardState.selectedRecommendationId = null;
    // #117 (teacher's request): the questions already are the game, so the run is
    // finished here — the content is built locally from the draft (no model, no
    // Fast/Thinking choice) and step 5 offers "Lưu vào thư viện" as its only
    // forward action. The project must be persisted first: the main process attaches
    // the game to the stored project.
    await wizardSaveProject('configure');
    const game = await wizardBuildGameAfterSave(target, draft, config);
    if (!game) {
      wizardState.busy = '';
      wizardSetError(new Error('Câu hỏi đã sẵn sàng nhưng hệ thống chưa tạo được trò chơi từ đó. Hãy thử lại hoặc báo lỗi kèm mã dự án.'));
      render();
      return;
    }
    wizardState.gameSnapshot = game;
    wizardState.gameId = game.id || null;
    wizardState.quality = null;
    wizardState.context = null;
    wizardState.step = 'generate';
    await wizardSaveProject('generate');
    // Missing explanations were rejected above, so reaching here means every question
    // is complete: no issue can remain.
    const skipped = (wizardState.parsedQuestions || []).length - usable.length;
    // #117: the game is built, so the wizard is already at the finishing step; the
    // teacher can save it right away or adjust the game information first.
    wizardSetNotice(`Đã tạo trò chơi từ ${usable.length} câu${skipped > 0 ? `, bỏ qua ${skipped} câu không tương thích hoặc đang xem lại` : ''} — không dùng AI. Kiểm tra thông tin rồi bấm “Lưu vào thư viện”.`);
  } catch (error) {
    wizardSetError(error);
  }
  wizardState.busy = '';
  render();
}

/**
 * #115 branch B in step 1 ("Phân tích & thêm câu hỏi"): the analyse pipeline runs as
 * usual on the document, and the recognized bank is kept next to it as the source of
 * truth for which genre fits. The genre is still the teacher's to change in step 3;
 * `draftOrigin` only records that the questions started from the bank.
 */
async function wizardKeepImportedAndAnalyze() {
  if (wizardState.busy) return;
  if (!(wizardState.parsedQuestions || []).length) await wizardClassifyInput();
  wizardState.draftOrigin = 'source';
  wizardState.importedMode = false;
  // #117: this run uses the model later, so the built-from-bank marker must not
  // survive here — it would hide the Fast/Thinking choice on a run that needs it.
  wizardState.draftSource = null;
  wizardState.gameSnapshot = null;
  wizardState.gameId = null;
  return wizardInputNextLesson();
}

/**
 * #117: builds the playable game from the draft already in state, through the same
 * local pipeline the model path uses (`lesson:generate` on a project whose draft is
 * `imported-questions`). No model is called; a grid question bank becomes a quiz
 * game (arena and race both play it), any other genre keeps its own template.
 */
async function wizardBuildGameAfterSave(target, draft, config) {
  // Kept in its own function so the conversion never runs inside the block that also
  // awaits the save: the call site reads "save, then build", and a failure here cannot
  // be mistaken for a failed save.
  if (!draft) return null;
  const saved = await window.eduGame.generateLessonDraft({
    projectId: wizardState.projectId,
    requestId: wizardNewRequestId('bank'),
    mode: config.generationMode || 'fast',
    regenerate: false,
    localOnly: true
  });
  if (saved && saved.project) {
    wizardState.projectId = saved.project.id;
    if (saved.project.draft) wizardState.draft = saved.project.draft;
  }
  if (draft.gameType === 'arena' && saved && saved.game) return saved.game;
  // Any other genre is a different template: build it from its converted draft with the
  // same pure converter the "change genre" path uses.
  const converted = await window.eduGame.convertLessonDraft({ draft, target: draft.gameType, config });
  return converted && converted.game ? converted.game : (saved && saved.game ? saved.game : null);
}

/**
 * #117: copies the teacher's game information from the configuration onto the game
 * built from the bank, so the library entry carries what they typed.
 */
function wizardApplyConfigToGame(game) {
  const config = wizardState.config;
  if (!game || !config) return game;
  const text = value => String(value === undefined || value === null ? '' : value);
  return {
    ...game,
    title: text(config.title).trim() || game.title,
    subject: text(config.subject).trim() || game.subject,
    grade: text(config.grade).trim() || game.grade,
    topic: text(config.topic).trim() || game.topic
  };
}

/** Branch A of #115: reuse the recognised bank for `gameType`, skipping the model. */
async function wizardStartGameFromBank(gameType) {
  wizardState.draftOrigin = 'source';
  wizardState.importedMode = true;
  return wizardUseImportedQuestions(gameType || wizardRecommendedGame() || 'arena');
}

/** Branch B of #115: analyse the document, keeping the recognised bank as the source. */
async function wizardAnalyzeWithBank() {
  return wizardKeepImportedAndAnalyze();
}

/** Marks one recognised question as teacher-written (`'source'`) or AI-added (`'ai'`). */
function wizardSetImportedOrigin(itemId, origin) {
  if (origin !== 'source' && origin !== 'ai') return;
  if (!itemId) return;
  const item = (wizardState.parsedQuestions || []).find(entry => entry.question && entry.question.id === itemId);
  if (!item) return;
  item.origin = origin;
  // A question the model wrote is complete by construction, so the source status no
  // longer applies to it.
  if (origin === 'ai') {
    item.status = 'ready';
    item.warnings = [];
  }
}

/** Questions by origin for the step-3 summary (`'source'` bank vs `'ai'` additions). */
function wizardQuestionOriginCounts() {
  const parsed = wizardState.parsedQuestions || [];
  return {
    source: parsed.filter(item => item.origin !== 'ai').length,
    ai: parsed.filter(item => item.origin === 'ai').length
  };
}

/** Match auto-generated counts to the number of imported items (no content change). */
function wizardClampImportedConfig(draft, config) {
  const count = Array.isArray(draft.questions) ? draft.questions.length : Array.isArray(draft.stages) ? draft.stages.length : 0;
  if (!count) return config;
  if (config.gameType === 'arena') return { ...config, questionCount: wizardClamp(count, 1, 30) };
  if (config.gameType === 'treasure') return { ...config, stageCount: wizardClamp(count, 2, 30) };
  if (config.gameType === 'race') return { ...config, maxRounds: wizardClamp(count, 4, 7) };
  return config;
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
    // Provenance: only a teacher-authored question bank may skip the model later.
    ...(s.draftSource ? { draftSource: s.draftSource } : {}),
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
  // Provenance goes with the draft: a stale flag would let an AI draft skip the model.
  wizardState.draftSource = null;
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
 * True when generated content exists that closing the window would destroy.
 *
 * Spec §4/§12: a teacher must not lose work by closing or navigating. Content
 * already in the library is redundant (the library row survives), so it does not
 * count as dirty — otherwise a teacher who finished correctly could not close.
 *
 * Deliberately narrower than "anything typed": in-flight text lives in the
 * wizard's own fields and is recoverable from the project row on reload, while
 * a generated draft costs minutes of AI/local work and cannot be reconstructed.
 */
function wizardHasUnsavedDraft() {
  return Boolean(wizardState.draft) && !wizardGameSavedToLibrary();
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
 * Change genre while keeping what can be kept (update_quy_trinh §4, §7.10).
 *
 * Before this, picking another genre discarded the whole draft and the next
 * "Tạo nội dung" regenerated everything from the model. Now the existing draft is
 * converted locally first: question-shaped content (arena ⇄ treasure ⇄ race) carries
 * over verbatim, and only what cannot be converted is reported. The teacher is asked
 * once, and only when there is a real gap — not for every genre click.
 *
 * Returns a discriminated outcome, NOT a draft-or-null, because "the teacher pressed
 * Cancel" and "there is a new draft" used to be indistinguishable: the old code
 * returned the *source* draft on cancel, the caller stored it against the new genre,
 * and the stale-content guard then deleted the teacher's work.
 *
 *   { kind: 'converted', draft }  use this draft for the new genre
 *   { kind: 'restart' }           discard and let the model regenerate
 *   { kind: 'cancelled' }         change nothing at all
 */
async function wizardConvertOrDiscardForGenre(target) {
  const source = wizardState.draft;
  if (!source || source.gameType === target) return { kind: 'converted', draft: source || null };
  if (wizardGameSavedToLibrary()) return { kind: 'converted', draft: source };
  const config = wizardState.config && wizardState.config.gameType === target
    ? wizardState.config
    : wizardConfigForImportedQuestions(target);
  let converted = null;
  try {
    converted = await window.eduGame.convertLessonDraft({ draft: source, target, config });
  } catch {
    // A failed conversion is treated like "cannot convert": never block the click.
    converted = null;
  }
  const targetLabel = wizardGameMeta(target).label;
  if (converted && converted.draft) {
    if (!converted.complete) {
      // One dialog, listing exactly what could not be carried over (§4.4) and — for
      // update_quy_trinh_2 §5 Path C — what AI would have to write if the teacher
      // chose to regenerate instead.
      const gaps = converted.gaps.map(gap => `• ${gap.item}: ${gap.reason}`).join('\n');
      const keep = window.confirm(
        `Đã chuyển ${converted.converted} mục sang “${targetLabel}” và giữ nguyên nội dung gốc.\n\n` +
        `Phần chưa chuyển được (AI sẽ phải viết thêm nếu chọn tạo mới):\n${gaps}\n\n` +
        'OK: dùng phần đã chuyển (phần thiếu bổ sung sau trong trình chỉnh sửa).\n' +
        'Cancel: giữ nguyên thể loại cũ, không mất nội dung nào.'
      );
      if (!keep) return { kind: 'cancelled' };
    }
    return { kind: 'converted', draft: converted.draft };
  }
  // Nothing convertible: ask whether to let AI write the whole thing. Cancel keeps the
  // old genre and the old draft untouched.
  const reasons = converted && converted.gaps.length
    ? `\n\nVì sao không chuyển được:\n${converted.gaps.map(gap => `• ${gap.reason}`).join('\n')}`
    : '';
  const restart = window.confirm(
    `Không chuyển trực tiếp được nội dung “${wizardGameMeta(source.gameType).label}” sang “${targetLabel}”.${reasons}\n\n` +
    `Tạo mới bằng AI sẽ khiến AI viết lại toàn bộ nội dung cho “${targetLabel}”. Nội dung gốc vẫn được giữ trong dự án trước khi thay bản nháp.\n\n` +
    'OK: để AI viết bản mới. Cancel: giữ nguyên như hiện tại.'
  );
  return restart ? { kind: 'restart' } : { kind: 'cancelled' };
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
