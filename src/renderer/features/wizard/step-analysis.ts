// @ts-nocheck -- renderer UI logic; workflow contracts are typed in src/shared/lesson-types.ts.
/** Wizard step 2 — run the local analysis and let the teacher review/edit it. */

const WIZARD_COGNITIVE_LEVELS = [
  { value: 'remember', label: 'Nhớ' },
  { value: 'understand', label: 'Hiểu' },
  { value: 'apply', label: 'Vận dụng' },
  { value: 'analyze', label: 'Phân tích' }
];

function wizardCognitiveLabel(level) {
  const found = WIZARD_COGNITIVE_LEVELS.find(item => item.value === level);
  return found ? found.label : 'Hiểu';
}

// Real boundaries from `lesson:analyze`: cache check → model attempt →
// repair-if-needed → stored. There is no token stream, so no fake percentage.
const WIZARD_ANALYSIS_STAGES = [
  ['prepare', 'Đọc giáo án và kiểm tra cache'],
  ['generate', 'AI local phân tích mục tiêu và kiến thức'],
  ['repair', 'Sửa phần chưa đạt (nếu cần)'],
  ['ready', 'Lưu kết quả phân tích']
];

function renderWizardAnalysisProgress() {
  const s = wizardState;
  if (s.busy !== 'analyze') return '';
  const currentIndex = Math.max(0, WIZARD_ANALYSIS_STAGES.findIndex(([id]) => id === s.lessonStage));
  const rows = WIZARD_ANALYSIS_STAGES.map(([id, initialLabel], index) => {
    let label = initialLabel;
    let status = index < currentIndex ? 'done' : index === currentIndex ? 'active' : 'todo';
    let mark = index < currentIndex ? '✓' : index === currentIndex ? '⏳' : '·';
    if (id === 'repair' && status === 'done' && !s.lessonRepaired) {
      status = 'skipped';
      mark = '–';
      label = `${label} · không cần`;
    }
    return `<li data-stage="${id}" data-status="${status}" class="text-[12px] ${status === 'active' ? 'font-bold text-[#3b3a63]' : status === 'skipped' ? 'text-[#98a0b0]' : 'text-[#5a6478]'}">${mark} ${escapeHtml(label)}</li>`;
  }).join('');
  return `<div class="field-hint mt-[8px]" data-wizard-analysis-progress="${escapeHtml(s.lessonStage || 'prepare')}">
    <ol class="space-y-[2px] pl-[2px]" role="list">${rows}</ol>
    <div class="mt-[5px] flex flex-wrap gap-x-[10px] gap-y-[2px]">
      <span data-wizard-analysis-elapsed>${escapeHtml(wizardAnalysisElapsedText())}</span>
      <span>Bạn có thể chuyển sang trang khác — AI vẫn chạy nền và kết quả sẽ được giữ.</span>
    </div>
    <span>AI local chạy trên máy này; giáo án không được gửi đi đâu. Có thể huỷ giữa chừng.</span>
  </div>`;
}

function renderWizardAnalysis() {
  const s = wizardState;
  const analyzing = s.busy === 'analyze';
  if (!s.analysis) {
    return `<section class="form-panel" data-wizard-step-body="analyze">
      <div class="section-head"><h3>Bước 2 · Phân tích giáo án</h3><span class="tag">AI local · llama.cpp</span></div>
      <div class="panel-sub">AI local sẽ đọc giáo án và rút ra mục tiêu, kiến thức trọng tâm và những điểm chưa chắc chắn. Bạn xem lại và chỉnh sửa trước khi chọn trò chơi.</div>
      ${wizardAiReadinessHint()}
      <div class="publish-actions">
        <button class="btn btn-primary" id="wizardAnalyzeBtn" data-wizard-action="analyze"${analyzing ? ' disabled' : ''}>${analyzing ? 'AI đang phân tích…' : '✦ Phân tích bằng AI local'}</button>
        ${analyzing ? '<button class="btn btn-secondary" data-wizard-action="cancel">Huỷ</button>' : ''}
        <button class="btn btn-secondary" data-wizard-action="back">← Quay lại</button>
      </div>
      ${analyzing ? '<div class="field-hint" data-wizard-loading="analyze">Đang đọc giáo án trên máy. Quá trình có thể mất vài chục giây tuỳ cấu hình.</div>' : ''}
    </section>`;
  }
  const analysis = s.analysis;
  return `<section class="form-panel" data-wizard-step-body="analyze">
    <div class="section-head"><h3>Bước 2 · Xem lại phân tích</h3><span class="tag">Giáo viên duyệt</span></div>
    <div class="panel-sub">Đây là kết quả do AI local tạo. Hãy sửa cho chính xác — mọi chỉnh sửa được dùng cho bước chọn và cấu hình trò chơi.</div>
    <div class="field-row">
      <div class="field"><label>CHỦ ĐỀ</label><input id="wizardTopic" data-wizard-analysis="topic" value="${escapeHtml(analysis.topic || '')}"></div>
      <div class="field"><label>MÔN HỌC</label><input id="wizardSubject" data-wizard-analysis="subject" value="${escapeHtml(analysis.subject || '')}"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>LỚP</label><input id="wizardGrade" type="number" min="1" max="12" data-wizard-analysis="grade" value="${analysis.grade ? escapeHtml(String(analysis.grade)) : ''}"></div>
      <div class="field"><label>SỐ MỤC TIÊU</label><input value="${analysis.objectives.length}" disabled></div>
    </div>

    <div class="section-head mt-[8px]"><h4>Mục tiêu học tập</h4><button class="btn btn-secondary btn-small" data-wizard-action="add-objective">+ Thêm mục tiêu</button></div>
    <div class="grid gap-[8px]" id="wizardObjectives">
      ${analysis.objectives.map((objective, index) => `<div class="flex gap-[8px] items-center" data-wizard-objective-row="${index}">
        <input class="flex-1" data-wizard-objective="${index}" data-field="description" placeholder="Mô tả mục tiêu" value="${escapeHtml(objective.description || '')}">
        <select data-wizard-objective="${index}" data-field="cognitiveLevel">${WIZARD_COGNITIVE_LEVELS.map(level => `<option value="${level.value}"${objective.cognitiveLevel === level.value ? ' selected' : ''}>${level.label}</option>`).join('')}</select>
        <button class="btn btn-secondary btn-small" data-wizard-action="remove-objective" data-index="${index}" title="Xoá mục tiêu"${analysis.objectives.length <= 1 ? ' disabled' : ''}>✕</button>
      </div>`).join('')}
    </div>

    <div class="section-head mt-[16px]"><h4>Kiến thức trọng tâm</h4><button class="btn btn-secondary btn-small" data-wizard-action="add-concept">+ Thêm khái niệm</button></div>
    <div class="grid gap-[8px]" id="wizardConcepts">
      ${analysis.keyConcepts.map((concept, index) => `<div class="flex gap-[8px] items-center" data-wizard-concept-row="${index}">
        <input class="w-[200px]" data-wizard-concept="${index}" data-field="term" placeholder="Thuật ngữ" value="${escapeHtml(concept.term || '')}">
        <input class="flex-1" data-wizard-concept="${index}" data-field="explanation" placeholder="Giải thích ngắn" value="${escapeHtml(concept.explanation || '')}">
        <button class="btn btn-secondary btn-small" data-wizard-action="remove-concept" data-index="${index}" title="Xoá khái niệm">✕</button>
      </div>`).join('')}
    </div>

    <div class="section-head mt-[16px]"><h4>Điểm chưa chắc chắn</h4><button class="btn btn-secondary btn-small" data-wizard-action="add-uncertainty">+ Thêm ghi chú</button></div>
    <div class="grid gap-[8px]" id="wizardUncertainties">
      ${analysis.uncertainties.length ? analysis.uncertainties.map((note, index) => `<div class="flex gap-[8px] items-center">
        <input class="flex-1" data-wizard-uncertainty="${index}" value="${escapeHtml(note)}">
        <button class="btn btn-secondary btn-small" data-wizard-action="remove-uncertainty" data-index="${index}" title="Xoá ghi chú">✕</button>
      </div>`).join('') : '<div class="field-hint" data-wizard-empty="uncertainties">Không có điểm chưa chắc chắn nào được ghi nhận.</div>'}
    </div>

    <div class="publish-actions">
      <button class="btn btn-secondary" data-wizard-action="rerun"${analyzing ? ' disabled' : ''}>↻ Phân tích lại</button>
      <button class="btn btn-secondary" data-wizard-action="back">← Nhập giáo án</button>
      <button class="btn btn-primary" id="wizardNextBtn" data-wizard-action="next">Tiếp tục · Chọn trò chơi →</button>
    </div>
    <div class="field-hint">“Phân tích lại” sẽ thay thế nội dung đang sửa bằng kết quả mới từ AI local.</div>
  </section>`;
}

/** Copies the edited analysis form back into `wizardState.analysis`. */
function wizardSyncAnalysisFromDom() {
  const analysis = wizardState.analysis;
  if (!analysis) return;
  const topic = document.getElementById('wizardTopic');
  if (topic) analysis.topic = topic.value.trim();
  const subject = document.getElementById('wizardSubject');
  if (subject) analysis.subject = subject.value.trim() || null;
  const grade = document.getElementById('wizardGrade');
  if (grade) {
    const value = Number(grade.value);
    analysis.grade = Number.isFinite(value) && value >= 1 && value <= 12 ? Math.round(value) : null;
  }
  analysis.objectives.forEach((objective, index) => {
    const description = document.querySelector(`[data-wizard-objective="${index}"][data-field="description"]`);
    if (description) objective.description = description.value.trim();
    const level = document.querySelector(`[data-wizard-objective="${index}"][data-field="cognitiveLevel"]`);
    if (level) objective.cognitiveLevel = level.value;
  });
  analysis.keyConcepts.forEach((concept, index) => {
    const term = document.querySelector(`[data-wizard-concept="${index}"][data-field="term"]`);
    if (term) concept.term = term.value.trim();
    const explanation = document.querySelector(`[data-wizard-concept="${index}"][data-field="explanation"]`);
    if (explanation) concept.explanation = explanation.value.trim();
  });
  analysis.uncertainties = analysis.uncertainties.map((_, index) => {
    const input = document.querySelector(`[data-wizard-uncertainty="${index}"]`);
    return input ? input.value.trim() : '';
  }).filter(Boolean);
}

function wizardAnalysisValid() {
  const analysis = wizardState.analysis;
  if (!analysis) return false;
  if (!analysis.topic || !analysis.topic.trim()) return false;
  const objectives = analysis.objectives.filter(objective => objective.description && objective.description.trim());
  return objectives.length >= 1;
}

async function wizardAnalyzeRun(force) {
  if (wizardState.busy) return;
  if (!wizardState.documentId) {
    wizardSetError(new Error('Chưa có giáo án đã lưu. Hãy quay lại bước 1 và nhập giáo án.'));
    render();
    return;
  }
  wizardState.busy = 'analyze';
  wizardState.lessonStage = 'prepare';
  wizardState.lessonRepaired = false;
  wizardClearMessages();
  const requestId = wizardNewRequestId('analyze');
  wizardState.activeRequestId = requestId;
  render();
  wizardStartAnalysisClock();
  let result = null;
  let failure = null;
  try {
    result = await window.eduGame.analyzeLesson({
      documentId: wizardState.documentId,
      projectId: wizardState.projectId || undefined,
      analysisId: wizardState.analysisId || undefined,
      mode: 'fast',
      // O5: only the explicit "Phân tích lại" button bypasses the cache; the
      // automatic call reuses a stored analysis when the lesson is unchanged.
      force: Boolean(force),
      requestId
    });
    wizardState.analysis = result.analysis;
    wizardState.analysisOriginal = JSON.parse(JSON.stringify(result.analysis));
    wizardState.analysisId = result.analysis.id;
    if (result.project) {
      wizardState.projectId = result.project.id;
      wizardState.createdAt = result.project.createdAt || wizardState.createdAt;
    }
    wizardState.recommendations = [];
    wizardState.selectedGameType = null;
    wizardState.selectedRecommendationId = null;
    await wizardRefreshProjects();
    wizardSetNotice(result.cached
      ? 'Giáo án không đổi nên đã dùng lại kết quả phân tích trước đó (không gọi AI).'
      : 'AI local đã phân tích xong. Hãy xem lại và chỉnh sửa nếu cần.');
  } catch (error) {
    failure = error;
    wizardSetError(error);
  }
  wizardStopAnalysisClock();
  wizardState.busy = '';
  wizardState.lessonStage = '';
  wizardState.analysisStartedAt = 0;
  wizardState.activeRequestId = null;
  const visible = state.page === 'create-wizard' && Boolean(document.getElementById('wizardRoot'));
  if (visible) {
    render();
  } else if (failure) {
    toast(wizardErrorText());
  } else if (result) {
    toast(result.cached
      ? 'Đã dùng lại kết quả phân tích trước đó (không gọi AI).'
      : 'AI local đã phân tích xong giáo án.');
  }
}

async function wizardAnalyzeNext() {
  wizardSyncAnalysisFromDom();
  if (!wizardAnalysisValid()) {
    wizardSetError(new Error('Cần ít nhất một mục tiêu học tập và một chủ đề trước khi chọn trò chơi.'));
    render();
    return;
  }
  wizardState.busy = 'save';
  wizardClearMessages();
  render();
  try {
    wizardState.analysis = await window.eduGame.saveLessonAnalysis(wizardState.analysis);
    wizardState.step = 'recommend';
    await wizardSaveProject('recommend');
    wizardSetNotice('Đã lưu phân tích. Bước tiếp theo: chọn thể loại trò chơi.');
  } catch (error) {
    wizardSetError(error);
  }
  wizardState.busy = '';
  render();
}

async function wizardAnalyzeCancel() {
  const requestId = wizardState.activeRequestId;
  if (!requestId) return;
  try {
    await window.eduGame.cancelAi(requestId);
  } catch {
    /* cancelling is best-effort */
  }
}
