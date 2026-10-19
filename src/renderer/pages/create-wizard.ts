// @ts-nocheck -- renderer UI logic; workflow contracts are typed in src/shared/lesson-types.ts.
/** Wizard shell: step router, stepper, status area and the saved-drafts sidebar. */

function wizardStepUnlocked(step) {
  const s = wizardState;
  if (step === 'input') return true;
  if (step === 'analyze') return Boolean(s.documentId || s.analysis);
  if (step === 'recommend') return Boolean(s.analysis);
  if (step === 'configure') return Boolean(s.selectedGameType || s.config);
  if (step === 'generate') return Boolean(s.config);
  return false;
}

function renderWizardStepper() {
  const current = wizardStepIndex(wizardState.step);
  return `<ol class="wizard-stepper" role="list">
    ${wizardSteps.map((step, index) => {
      const status = index === current ? 'active' : index < current ? 'done' : 'todo';
      const unlocked = wizardStepUnlocked(step.id);
      return `<li class="wizard-step" data-step="${step.id}" data-status="${status}">
        <button type="button" class="wizard-step-btn" data-wizard-goto="${step.id}"${unlocked ? '' : ' disabled'}>
          <span class="wizard-step-index">${index < current ? '✓' : index + 1}</span>
          <span class="wizard-step-label">${escapeHtml(step.label)}</span>
        </button>
      </li>`;
    }).join('')}
  </ol>`;
}

function renderWizardStepBody() {
  switch (wizardState.step) {
    case 'input': return renderWizardInput();
    case 'analyze': return renderWizardAnalysis();
    case 'recommend': return renderWizardRecommend();
    case 'configure': return renderWizardConfigure();
    default: return renderWizardGenerate();
  }
}

function renderWizardStatus() {
  const s = wizardState;
  const parts = [];
  if (s.busy) parts.push(`<div class="wizard-status is-busy" data-wizard-busy="${s.busy}">⏳ ${escapeHtml(wizardBusyText(s.busy))}</div>`);
  if (s.error) {
    parts.push(`<div class="wizard-status is-error" id="wizardError" data-error-code="${escapeHtml(s.error.code || '')}" role="alert">
      <strong>Không hoàn tất được bước này.</strong>
      <span>${escapeHtml(wizardErrorText())}</span>
      ${wizardNeedsAiRuntime() ? '<button class="btn btn-secondary btn-small" data-wizard-action="open-ai">Mở AI local</button>' : ''}
      <button class="btn btn-secondary btn-small" data-wizard-action="dismiss-error">Đóng</button>
    </div>`);
  }
  if (s.notice && !s.error) parts.push(`<div class="wizard-status is-ok" id="wizardNotice">✓ ${escapeHtml(s.notice)}</div>`);
  return parts.join('');
}

function wizardBusyText(kind) {
  if (kind === 'analyze') return 'AI local đang phân tích giáo án…';
  if (kind === 'recommend') return 'AI local đang gợi ý trò chơi…';
  if (kind === 'generate') return 'AI local đang soạn nội dung trò chơi… (giáo án dài có thể mất vài phút)';
  if (kind === 'save') return 'Đang lưu dự án…';
  return 'Đang xử lý…';
}

function renderWizardProjects() {
  const projects = (wizardState.projects || []).slice(0, 6);
  return `<section class="form-panel">
    <div class="section-head"><h3>Dự án đang làm</h3><button class="btn btn-secondary btn-small" data-wizard-action="new">+ Dự án mới</button></div>
    <div class="panel-sub">Mở lại bản nháp đã lưu — không cần chạy lại AI.</div>
    ${projects.length ? `<div class="grid gap-[8px]" id="wizardProjectList">${projects.map(project => {
      const stepIndex = wizardStepIndex(project.step);
      const label = (wizardSteps[stepIndex] || wizardSteps[0]).short;
      const active = project.id === wizardState.projectId;
      return `<button class="quick-action${active ? ' active' : ''}" data-wizard-open="${escapeHtml(project.id)}">
        <span class="quick-icon">📁</span>
        <span class="min-w-0"><strong class="block truncate">${escapeHtml(project.title || 'Dự án')}</strong><small class="block text-[10px] text-[#98a0b0]">Bước: ${escapeHtml(label)} · ${fmtDate(project.updatedAt)}</small></span>
        <span class="quick-arrow">→</span>
      </button>`;
    }).join('')}</div>` : '<div class="field-hint">Chưa có dự án nào. Nhập giáo án để bắt đầu.</div>'}
  </section>`;
}

function renderCreateWizard() {
  return `<div id="wizardRoot">
    <div class="flex justify-between items-start gap-[20px] mb-[22px]"><div>
      <div class="text-[10px] text-[#6258e8] font-extrabold tracking-[1.3px] uppercase mb-[8px]">LESSON → GAME · AI TRÊN MÁY</div>
      <h1 class="text-[27px] tracking-[-0.9px] m-0 font-[780]">Tạo trò chơi từ giáo án</h1>
      <p class="mt-[9px] text-[#788196] text-[13px] leading-[1.6]">Nhập giáo án → AI local phân tích → chọn và cấu hình trò chơi → giáo viên duyệt và lưu. Dữ liệu giáo án chỉ nằm trên máy.</p>
    </div>
    <button class="border-0 rounded-[9px] px-[15px] py-[11px] inline-flex items-center justify-center gap-[8px] font-bold text-[12px] transition-transform duration-120 hover:-translate-y-[1px] bg-white border border-[#e7eaf2] text-[#515c72]" data-wizard-action="new">✳ Dự án mới</button></div>
    ${renderWizardStepper()}
    ${renderWizardStatus()}
    <div class="grid grid-cols-[minmax(0,1.7fr)_minmax(280px,.8fr)] gap-[18px] items-start">
      <div class="min-w-0">${renderWizardStepBody()}</div>
      <aside class="min-w-0">${renderWizardProjects()}</aside>
    </div>
  </div>`;
}

// ---------------------------------------------------------------------------
// Wiring (delegated so re-renders don't need re-binding)
// ---------------------------------------------------------------------------

function wizardSyncDocFromDom() {
  const text = document.getElementById('wizardDocText');
  if (text) wizardState.text = text.value;
  const name = document.getElementById('wizardDocName');
  if (name) wizardState.documentName = name.value.trim();
}

function wizardSyncCurrentStepFromDom() {
  if (wizardState.step === 'input') wizardSyncDocFromDom();
  if (wizardState.step === 'analyze') wizardSyncAnalysisFromDom();
  if (wizardState.step === 'configure' || wizardState.step === 'generate') wizardSyncConfigFromDom();
}

function wireCreateWizard() {
  const root = document.getElementById('wizardRoot');
  if (!root) return;
  root.addEventListener('click', wizardHandleClick);
  root.addEventListener('input', wizardHandleInput);
  if (!wizardState.projectsLoaded) {
    wizardState.projectsLoaded = true;
    wizardRefreshProjects().then(() => {
      if (document.getElementById('wizardRoot')) render();
    });
  }
}

/**
 * Live-syncs lightweight fields (no re-render, so the caret and focus survive).
 * Heavier forms are read on demand by `wizardSyncCurrentStepFromDom`.
 */
function wizardHandleInput(event) {
  const target = event.target;
  if (!target) return;
  if (target.id === 'wizardDocText') {
    wizardState.text = target.value;
    wizardSyncDocAffordances();
    return;
  }
  if (target.id === 'wizardDocName') {
    wizardState.documentName = target.value.trim();
    return;
  }
  const analysisField = target.dataset.wizardAnalysis;
  if (analysisField && wizardState.analysis) {
    const value = target.value;
    if (analysisField === 'grade') {
      const grade = Number(value);
      wizardState.analysis.grade = Number.isFinite(grade) && grade >= 1 && grade <= 12 ? Math.round(grade) : null;
    } else if (analysisField === 'subject') {
      wizardState.analysis.subject = value.trim() || null;
    } else {
      wizardState.analysis[analysisField] = value;
    }
  }
}

/** Enables "next" and refreshes the counter hint as the teacher types. */
function wizardSyncDocAffordances() {
  const characters = String(wizardState.text || '').trim().length;
  const ready = characters >= WIZARD_MIN_CHARACTERS;
  const button = document.getElementById('wizardNextBtn');
  if (button) button.disabled = !ready || Boolean(wizardState.busy);
  const hint = document.getElementById('wizardDocHint');
  if (hint) {
    hint.textContent = ready
      ? `Đã có ${characters.toLocaleString('vi-VN')} ký tự. Tiếp tục để phân tích bằng AI local.`
      : `Cần tối thiểu ${WIZARD_MIN_CHARACTERS} ký tự. Tài liệu scan không có chữ cần OCR trước khi nhập.`;
  }
}

function wizardHandleClick(event) {
  const goto = event.target.closest('[data-wizard-goto]');
  if (goto) return wizardGoto(goto.dataset.wizardGoto);
  const open = event.target.closest('[data-wizard-open]');
  if (open) return wizardOpenSaved(open.dataset.wizardOpen);
  const actionBtn = event.target.closest('[data-wizard-action]');
  if (!actionBtn || actionBtn.disabled) return;
  return wizardDispatch(actionBtn.dataset.wizardAction, actionBtn);
}

async function wizardDispatch(action, button) {
  if (wizardState.busy && ['back', 'new', 'save', 'generate', 'regenerate', 'open-editor'].includes(action)) return undefined;
  switch (action) {
    case 'import-file': return wizardInputImportFile();
    case 'open-ai': return openLocalAiModal();
    case 'analyze':
    case 'rerun': return wizardAnalyzeRun();
    case 'cancel': return wizardAnalyzeCancel();
    case 'recommend':
    case 'rerun-recommend': return wizardRecommendRun();
    case 'select': return wizardRecommendSelect(button.dataset.id);
    // O1: the teacher may pick a genre the rule-based recommender did not list.
    case 'select-type': return wizardRecommendSelectType(button.dataset.gameType);
    case 'add-objective': return wizardEditAnalysis('add-objective');
    case 'remove-objective': return wizardEditAnalysis('remove-objective', Number(button.dataset.index));
    case 'add-concept': return wizardEditAnalysis('add-concept');
    case 'remove-concept': return wizardEditAnalysis('remove-concept', Number(button.dataset.index));
    case 'add-uncertainty': return wizardEditAnalysis('add-uncertainty');
    case 'remove-uncertainty': return wizardEditAnalysis('remove-uncertainty', Number(button.dataset.index));
    case 'dismiss-error': wizardState.error = null; return render();
    case 'back': return wizardGoBack();
    case 'save': return wizardConfigureSave(false);
    case 'next': return wizardNext();
    case 'new': return wizardNewProject();
    case 'generate': return wizardGenerateRun();
    case 'regenerate': return wizardGenerateRegenerate();
    case 'open-editor': return wizardGenerateOpenEditor();
    case 'go-library': navigate('library'); return undefined;
    default: return undefined;
  }
}

function wizardNext() {
  wizardSyncCurrentStepFromDom();
  if (wizardState.step === 'input') return wizardInputNext();
  if (wizardState.step === 'analyze') return wizardAnalyzeNext();
  if (wizardState.step === 'recommend') return wizardRecommendNext();
  if (wizardState.step === 'configure') return wizardConfigureSave(true);
  return undefined;
}

function wizardGoBack() {
  if (wizardState.busy) return;
  wizardSyncCurrentStepFromDom();
  const index = wizardStepIndex(wizardState.step);
  if (index > 0) wizardState.step = wizardSteps[index - 1].id;
  wizardClearMessages();
  render();
}

function wizardGoto(step) {
  if (wizardState.busy || !wizardStepUnlocked(step)) return;
  wizardSyncCurrentStepFromDom();
  wizardState.step = step;
  wizardClearMessages();
  render();
}

function wizardNewProject() {
  wizardReset();
  wizardClearMessages();
  render();
  toast('Đã tạo dự án mới. Hãy nhập giáo án.');
}

async function wizardOpenSaved(projectId) {
  wizardState.busy = 'save';
  wizardClearMessages();
  render();
  try {
    await wizardOpenProject(projectId);
    wizardSetNotice('Đã mở lại dự án đã lưu. Không cần chạy lại AI.');
  } catch (error) {
    wizardSetError(error);
  }
  wizardState.busy = '';
  render();
}

function wizardEditAnalysis(action, index) {
  wizardSyncAnalysisFromDom();
  const analysis = wizardState.analysis;
  if (!analysis) return undefined;
  if (action === 'add-objective') analysis.objectives.push({ id: `obj_${Date.now().toString(36)}`, description: '', cognitiveLevel: 'understand' });
  if (action === 'remove-objective' && analysis.objectives.length > 1) analysis.objectives.splice(index, 1);
  if (action === 'add-concept') analysis.keyConcepts.push({ id: `concept_${Date.now().toString(36)}`, term: '', explanation: '' });
  if (action === 'remove-concept') analysis.keyConcepts.splice(index, 1);
  if (action === 'add-uncertainty') analysis.uncertainties.push('');
  if (action === 'remove-uncertainty') analysis.uncertainties.splice(index, 1);
  render();
  return undefined;
}
