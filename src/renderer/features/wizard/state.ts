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
  busy: '', // '' | 'analyze' | 'recommend' | 'save'
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
  const index = wizardSteps.findIndex(item => item.id === step);
  return index < 0 ? 0 : index;
}

function wizardNewRequestId(kind) {
  wizardState.requestNonce += 1;
  return `wizard-${kind}-${wizardState.requestNonce}`;
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
    busy: '',
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
  AI_CONFIG: 'Chưa cấu hình AI local đúng cách. Hãy kiểm tra trong Cài đặt.',
  AI_CONNECTION: 'Không kết nối được tới AI local. Hãy kiểm tra cửa sổ AI local còn mở không rồi thử lại.',
  AI_TIMEOUT: 'AI local phản hồi quá lâu. Hãy thử lại với giáo án ngắn hơn hoặc model nhỏ hơn.',
  AI_CANCELLED: 'Bạn đã huỷ yêu cầu AI.',
  AI_HTTP: 'AI local báo lỗi khi xử lý. Hãy thử lại.',
  AI_EMPTY: 'AI local không trả về nội dung. Hãy thử lại.',
  AI_TRUNCATED: 'Câu trả lời bị cắt do giới hạn độ dài. Hãy giảm yêu cầu hoặc thử lại.',
  AI_INVALID_JSON: 'AI local trả về dữ liệu không đọc được. Hãy thử lại.',
  AI_OUTPUT_INVALID: 'Nội dung AI trả về chưa đúng cấu trúc. Hãy thử lại hoặc chỉnh sửa thủ công ở bước sau.'
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
    status: s.analysis ? 'review' : 'draft',
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
  wizardState.analysisId = project.analysisId || null;
  wizardState.selectedRecommendationId = project.recommendationId || null;

  if (project.lesson) {
    const document = await window.eduGame.getLessonDocument(project.lesson.documentId);
    if (document) {
      wizardState.text = document.text || '';
      wizardState.documentMeta = { characters: document.characters, ext: document.ext, sizeBytes: document.sizeBytes };
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
