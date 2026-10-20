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
  busy: '', // '' | 'analyze' | 'recommend' | 'generate' | 'save'
  lessonStage: '', // O7: 'retrieve' | 'generate' | 'validate' | 'repair' | 'ready' | 'cached'
  lessonRepaired: false, // O7: true when the model actually had to repair an answer
  analysisStartedAt: 0, // timestamp of the running analysis; drives the elapsed indicator
  error: null, // { code, message }
  notice: null,
  requestNonce: 0,
  projects: [],
  projectsLoaded: false,
  activeRequestId: null
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
let wizardAnalysisClockTimer = null;

function wizardFormatDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(Number(milliseconds) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function wizardAnalysisElapsedText() {
  const startedAt = Number(wizardState.analysisStartedAt) || 0;
  const elapsed = startedAt ? wizardFormatDuration(Date.now() - startedAt) : '0:00';
  return `Đã chờ ${elapsed} · thường mất 1–2 phút`;
}

function wizardSyncAnalysisClock() {
  const active = wizardState.busy === 'analyze' && Boolean(wizardState.analysisStartedAt);
  const chip = document.getElementById('globalAiActivity');
  if (chip) chip.hidden = !active;
  if (!active) return;
  const text = wizardAnalysisElapsedText();
  document.querySelectorAll('[data-wizard-analysis-elapsed]').forEach(node => { node.textContent = text; });
  const chipElapsed = chip && chip.querySelector('[data-global-ai-elapsed]');
  if (chipElapsed) chipElapsed.textContent = wizardFormatDuration(Date.now() - wizardState.analysisStartedAt);
}

function wizardStartAnalysisClock() {
  wizardStopAnalysisClock();
  wizardState.analysisStartedAt = Date.now();
  wizardSyncAnalysisClock();
  wizardAnalysisClockTimer = window.setInterval(wizardSyncAnalysisClock, 1000);
}

function wizardStopAnalysisClock() {
  if (wizardAnalysisClockTimer !== null) {
    window.clearInterval(wizardAnalysisClockTimer);
    wizardAnalysisClockTimer = null;
  }
  const chip = document.getElementById('globalAiActivity');
  if (chip) chip.hidden = true;
}

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
    busy: '',
    lessonStage: '',
    lessonRepaired: false,
    analysisStartedAt: 0,
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
  const suggestedCount = Number(recommendation.suggestedQuestionCount) || 8;
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
    return { ...base, trackLength: 20, maxRounds: 12, teamCount: 2, stepByDifficulty: true, luckEnabled: true };
  }
  return base;
}

/** Turns the current wizard state into a `GameProject` row for `project:save-draft`. */
function wizardBuildProject(step) {
  const s = wizardState;
  const config = s.config || null;
  const title = (config && config.title) || (s.analysis && s.analysis.topic) || s.documentName || 'Dự án mới';
  return {
    id: s.projectId,
    schemaVersion: 1,
    status: step === 'done' ? 'ready' : s.analysis ? 'review' : 'draft',
    step: step || s.step,
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
    draft: s.draft || null,
    gameSnapshot: s.gameSnapshot || null,
    gameId: s.gameId || null,
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
  } catch (error) {
    wizardSetError(error);
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
    const savedInLibrary = Boolean(wizardState.gameId)
      && Array.isArray(state.db.games)
      && state.db.games.some(game => game.id === wizardState.gameId);
    const step = savedInLibrary ? 'done' : wizardState.step === 'edit' ? 'generate' : wizardState.step;
    await wizardSaveProject(step);
    wizardSetNotice(`Đã lưu tiến trình dự án lúc ${new Date().toLocaleTimeString('vi-VN')}.`);
  } catch (error) {
    wizardSetError(error);
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
  } catch (error) {
    wizardSetError(error);
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
