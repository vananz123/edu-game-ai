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
  // Real stage lists, updated in place by `lesson:progress` events (no
  // re-render, so the page does not jump and the elapsed clock keeps running).
  if (s.busy === 'analyze') parts.push(`<div data-wizard-analysis-progress-host="1">${renderWizardAnalysisProgress()}</div>`);
  if (s.busy === 'generate') parts.push(`<div data-wizard-progress-host="1">${renderWizardGenerationProgress()}</div>`);
  if (s.error) {
    parts.push(`<div class="wizard-status is-error" id="wizardError" data-error-code="${escapeHtml(s.error.code || '')}" role="alert">
      <strong>Không hoàn tất được bước này.</strong>
      <span>${escapeHtml(wizardErrorText())}</span>
      ${wizardNeedsAiRuntime() && !wizardNeedsProviderSettings() ? '<button class="btn btn-secondary btn-small" data-wizard-action="open-ai">Mở AI local</button>' : ''}
      ${wizardNeedsProviderSettings() ? '<button class="btn btn-secondary btn-small" data-wizard-action="open-ai-settings">Mở Cài đặt AI</button>' : ''}
      <button class="btn btn-secondary btn-small" data-wizard-action="dismiss-error">Đóng</button>
    </div>`);
  }
  if (s.notice && !s.error) parts.push(`<div class="wizard-status is-ok" id="wizardNotice">✓ ${escapeHtml(s.notice)}</div>`);
  return parts.join('');
}

function wizardBusyText(kind) {
  if (kind === 'analyze') return `${wizardProviderLabel()} đang phân tích giáo án… (thường 1–2 phút)`;
  if (kind === 'recommend') return `${wizardProviderLabel()} đang gợi ý trò chơi…`;
  if (kind === 'generate') return `${wizardProviderLabel()} đang soạn nội dung trò chơi… (giáo án dài có thể mất vài phút)`;
  if (kind === 'save') return 'Đang lưu dự án…';
  if (kind === 'prepare') return 'Đang chuẩn bị thể loại và số lượng phù hợp…';
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
        <span class="quick-copy"><strong class="block truncate">${escapeHtml(project.title || 'Dự án')}</strong><small class="block text-[10px] text-[#98a0b0]">Bước: ${escapeHtml(label)} · ${fmtDate(project.updatedAt)}</small></span>
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

/** O7: one listener for `lesson:progress`, registered on the first mount. */
let wizardProgressWired = false;

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
  if (typeof wireWizardStructureScrollCapture === 'function') wireWizardStructureScrollCapture();
  // #76: `innerHTML` cannot express `indeterminate`; `render()` (core/render.ts)
  // re-applies the derived tristate right after the markup is replaced.
  root.addEventListener('click', wizardHandleClick);
  root.addEventListener('input', wizardHandleInput);
  // Phase B: `<select>` in the artwork popover. `change` is used rather than
  // `input` so a keyboard user scrolling through options does not fire one
  // write per keystroke.
  root.addEventListener('change', wizardHandleChange);
  // O7: subscribe once. Events are filtered by requestId, so a cancelled run
  // cannot move the stages of the next one.
  if (!wizardProgressWired && window.eduGame && typeof window.eduGame.onLessonProgress === 'function') {
    wizardProgressWired = true;
    window.eduGame.onLessonProgress(progress => {
      if (!progress || progress.requestId !== wizardState.activeRequestId) return;
      const stage = String(progress.stage || '');
      if (!stage) return;
      wizardState.lessonStage = stage;
      if (stage === 'repair') wizardState.lessonRepaired = true;
      if (wizardState.busy === 'analyze') {
        const analysisHost = document.querySelector('[data-wizard-analysis-progress-host]');
        if (analysisHost) analysisHost.innerHTML = renderWizardAnalysisProgress();
      } else {
        const host = document.querySelector('[data-wizard-progress-host]');
        if (host) host.innerHTML = renderWizardGenerationProgress();
      }
      // Keep the global AI status bar on the same stage instead of waiting for
      // the next 2 s poll (the bar shows the Vietnamese stage + elapsed time).
      if (typeof window.refreshAiStatusBar === 'function') window.refreshAiStatusBar();
    });
  }
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
    // #76: the local analyzer walks the text off the keystroke (debounced), so
    // the tree and the preview describe the document the teacher is looking at.
    if (typeof wizardStructureSchedule === 'function') wizardStructureSchedule();
    // update_quy_trinh §2: keep the input-type verdict current while typing. Rules
    // only, never the model; debounced so pasting 50 KB does not run per keystroke.
    if (typeof wizardInputKindSchedule === 'function') wizardInputKindSchedule();
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
    return;
  }
  // O12: once the teacher types a count, keep it — auto-prediction and the
  // post-generation adjustment must not overwrite a deliberate choice.
  const configField = target.dataset.wizardConfig;
  if (configField && wizardState.config && configField === wizardCapacityCountKey(wizardState.config.gameType)) {
    wizardState.countTouched = true;
    if (typeof wizardUpdateCapacityUi === 'function') wizardUpdateCapacityUi();
  }
}

/** Enables "next" and refreshes the counter hint as the teacher types. */
function wizardSyncDocAffordances() {
  const characters = String(wizardState.text || '').trim().length;
  const ready = characters >= WIZARD_MIN_CHARACTERS;
  const button = document.getElementById('wizardNextBtn');
  // #76: an empty scope blocks "next" as firmly as missing text does.
  const scopeError = typeof wizardStructureScopeError === 'function' ? wizardStructureScopeError() : '';
  if (button) button.disabled = !ready || Boolean(wizardState.busy) || Boolean(scopeError);
  const hint = document.getElementById('wizardDocHint');
  if (hint) {
    hint.textContent = ready
      ? `Đã có ${characters.toLocaleString('vi-VN')} ký tự. Tiếp tục để phân tích bằng AI.`
      : `Cần tối thiểu ${WIZARD_MIN_CHARACTERS} ký tự. Tài liệu scan không có chữ cần OCR trước khi nhập.`;
  }
  // The tabs render their counters into the page; typing only patched the hint,
  // so "0 ký tự" stuck on the content tab (and "N mục" on the structure tab)
  // until some later click happened to re-render.
  if (typeof wizardSyncStepInputStats === 'function') wizardSyncStepInputStats();
}

function wizardHandleClick(event) {
  const tabBtn = event.target.closest('[data-wizard-input-tab]');
  if (tabBtn) {
    wizardState.inputTab = tabBtn.dataset.wizardInputTab;
    render();
    return;
  }
  const goto = event.target.closest('[data-wizard-goto]');
  if (goto) return wizardGoto(goto.dataset.wizardGoto);
  const open = event.target.closest('[data-wizard-open]');
  if (open) return wizardOpenSaved(open.dataset.wizardOpen);
  const actionBtn = event.target.closest('[data-wizard-action]');
  if (!actionBtn || actionBtn.disabled) return;
  return wizardDispatch(actionBtn.dataset.wizardAction, actionBtn);
}

/**
 * Phase B (#72): `<select>`s in the artwork popover of step 5. Each write goes
 * through `wizardPatchItemAssets`, which sends exactly one whitelisted key, so a
 * category change can never clear a chosen picture and vice versa.
 */
function wizardHandleChange(event) {
  const target = event.target;
  if (!target || !target.closest) return undefined;
  // #76: a section checkbox in the step-1 tree. The checked value is derived
  // from the tree, so only the id is read from the DOM.
  const section = target.closest('[data-wizard-section]');
  if (section) return wizardStructureToggle(section.getAttribute('data-wizard-section'));
  const assetSelect = target.closest('[data-wizard-art-asset]');
  if (assetSelect) {
    return wizardPatchItemAssets(Number(assetSelect.dataset.itemIndex), { illustrationAssetId: assetSelect.value || '' });
  }
  const categorySelect = target.closest('[data-wizard-art-category]');
  if (categorySelect) {
    return wizardPatchItemAssets(Number(categorySelect.dataset.itemIndex), { contentCategory: categorySelect.value || '' });
  }
  return undefined;
}

async function wizardDispatch(action, button) {
  // #132 D13: both analysis buttons are blocked too — `wizardAnalyzeRun` already refuses
  // a second run, but the cloud button must not scroll away/text-swap mid-run.
  if (wizardState.busy && ['back', 'new', 'save', 'save-project', 'save-game', 'generate', 'regenerate', 'regenerate-item', 'open-editor', 'quick-generate', 'quick-confirm', 'quick-cancel', 'analyze', 'analyze-cloud'].includes(action)) return undefined;
  switch (action) {
    case 'import-file': return wizardInputImportFile();
    case 'insert-sample': return wizardInputInsertSample();
    case 'open-ai': return openLocalAiModal();
    // #132: Settings owns every provider configuration; the wizard only links there.
    case 'open-ai-settings': return navigate('settings');
    // #132 D13: both analysis buttons name their provider on the element, so a stale
    // page cannot point a run at something else. The primary one is AI local.
    case 'analyze': return wizardAnalyzeRun(false, (button && button.dataset && button.dataset.providerId) || 'local');
    case 'analyze-cloud': return wizardAnalyzeRun(false, button && button.dataset ? button.dataset.providerId : undefined);
    case 'rerun': return wizardAnalyzeRun(true);
    case 'cancel': return wizardState.busy === 'generate' ? wizardCancelGenerate() : wizardAnalyzeCancel();
    case 'recommend':
    case 'rerun-recommend': return wizardRecommendRun();
    case 'select': return wizardRecommendSelect(button.dataset.id);
    // O1: the teacher may pick a genre the rule-based recommender did not list.
    case 'select-type': return wizardRecommendSelectType(button.dataset.gameType);
    case 'set-mode': return wizardSetGenerationMode(button.dataset.mode);
    case 'use-capacity': return wizardUseCapacity();
    case 'quick-generate': return wizardQuickGenerate();
    case 'quick-confirm': return wizardQuickGenerateConfirm();
    case 'quick-cancel': return wizardQuickGenerateCancel();
    case 'add-objective': return wizardEditAnalysis('add-objective');
    case 'remove-objective': return wizardEditAnalysis('remove-objective', Number(button.dataset.index));
    case 'add-concept': return wizardEditAnalysis('add-concept');
    case 'remove-concept': return wizardEditAnalysis('remove-concept', Number(button.dataset.index));
    case 'add-uncertainty': return wizardEditAnalysis('add-uncertainty');
    case 'remove-uncertainty': return wizardEditAnalysis('remove-uncertainty', Number(button.dataset.index));
    case 'dismiss-error': wizardState.error = null; return render();
    case 'select-provider': return wizardSelectProvider(button.value);
    // update_quy_trinh §2: pick the input type explicitly, or go back to auto-detect.
    case 'input-kind': return wizardSetInputKind(button.dataset.inputKind);
    // #115: a recognised question bank offers two explicit choices (plan §2.4a).
    case 'bank-create-now': return wizardStartGameFromBank(wizardRecommendedGame() || 'arena');
    case 'bank-analyze': return wizardAnalyzeWithBank();
    case 'bank-drop-blocked': return wizardDropBlockedQuestions(button.dataset.gameType);
    case 'back': return wizardGoBack();
    case 'save': return wizardConfigureSave(false);
    case 'save-project': return wizardSaveCurrentProject();
    case 'save-game': return wizardSaveGameToLibrary();
    case 'next': return wizardNext();
    case 'new': return wizardNewProject();
    case 'generate': return wizardGenerateRun();
    case 'regenerate': return wizardGenerateRegenerate();
    case 'regenerate-item': return wizardRegenerateItem(Number(button.dataset.itemIndex));
    // Phase B (#72): per-item artwork. Kept out of the `busy` guard above on
    // purpose — picking a picture is a local write, so it stays usable while a
    // generation is running and never blocks the generate toolbar. The other
    // direction is guarded inside `wizardPatchItemAssets` (`artBusy`).
    case 'toggle-art': return wizardToggleArtItem(Number(button.dataset.itemIndex));
    // #124: a picture picked by the teacher, copied into the app folder by main.
    case 'upload-art': return wizardUploadArt(Number(button.dataset.itemIndex));
    case 'reset-art': return wizardPatchItemAssets(Number(button.dataset.itemIndex), { contentCategory: '', illustrationAssetId: '' });
    // #76: the structure tree in step 1. Local writes only — no AI, no disk.
    case 'toggle-section': return wizardStructureToggleCollapse(button.dataset.sectionId);
    case 'structure-select-all': return wizardStructureSelectAll();
    case 'structure-clear-all': return wizardStructureClearAll();
    case 'another-game': return wizardStartAnotherGame();
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
  // Opening a different draft while an analysis is running would let the late
  // result overwrite the newly opened project. The analysis stays cancellable.
  if (wizardState.busy) {
    toast(`${wizardProviderLabel()} đang phân tích giáo án. Hãy đợi hoặc bấm Huỷ trước khi mở dự án khác.`);
    return undefined;
  }
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
