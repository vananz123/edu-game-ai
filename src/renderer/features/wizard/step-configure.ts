// @ts-nocheck -- renderer UI logic; workflow contracts are typed in src/shared/lesson-types.ts.
/** Wizard step 4 — per-game-type configuration for generation. */

function wizardConfigNumber(key, label, value, min, max, step) {
  return `<div class="field"><label>${label}</label><input type="number" data-wizard-config="${key}" min="${min}" max="${max}"${step ? ` step="${step}"` : ''} value="${escapeHtml(String(value))}"></div>`;
}

const WIZARD_AUTO_COUNT_MIN = 4;
const WIZARD_AUTO_COUNT_MAX = 7;

/**
 * O12: explains the predicted count under the item-count field. The prediction
 * comes from the main process (document length + analysis + model + mode) and is
 * advisory: the teacher can always type another number, which then disables the
 * automatic adjustment for the rest of this generation.
 */
function wizardCapacityHintHtml(currentValue) {
  const s = wizardState;
  const config = s.config;
  if (!config) return '<div data-wizard-capacity-hint="1"></div>';
  const key = wizardCapacityCountKey(config.gameType);
  if (!key) return '<div data-wizard-capacity-hint="1"></div>';
  const unit = wizardItemUnit(config.gameType);
  const value = currentValue !== undefined ? Number(currentValue) : (Number(config[key]) || 0);
  const capacity = s.capacity;
  if (!capacity) {
    return `<div data-wizard-capacity-hint="1" class="field-hint">Đang ước lượng số ${escapeHtml(unit)} phù hợp với tài liệu và model…</div>`;
  }
  const material = capacity.material || {};
  const model = capacity.model || {};
  const chars = Number(material.documentCharacters) || 0;
  const details = `Gợi ý ${capacity.suggested} ${unit} · tài liệu ${chars.toLocaleString('vi-VN')} ký tự, ${material.objectiveCount || 0} mục tiêu, ${material.conceptCount || 0} khái niệm · model ${escapeHtml(model.label || 'chưa rõ')}`;
  const contentCapacity = Number(capacity.contentCapacity) || WIZARD_AUTO_COUNT_MIN;
  const over = value > contentCapacity + 1;
  return `<div data-wizard-capacity-hint="1" class="field-hint">
    <span>${details}.</span>
    ${value !== capacity.suggested ? ` <button type="button" class="btn btn-secondary btn-small" data-wizard-action="use-capacity">Dùng ${capacity.suggested} ${escapeHtml(unit)}</button>` : ''}
    ${over ? `<div class="mt-[4px] text-[#8a6d00]">Giáo án chỉ có khoảng ${contentCapacity} ý chính; ${value} ${escapeHtml(unit)} dễ tạo câu trùng lặp. Nên chọn ${capacity.suggested} hoặc bổ sung tài liệu.</div>` : ''}
  </div>`;
}

/** Applies a fresh prediction in place (no re-render, so the caret survives). */
function wizardApplyCapacity() {
  const s = wizardState;
  if (!s.config || !s.capacity) return;
  const key = wizardCapacityCountKey(s.config.gameType);
  if (!key) return;
  if (!s.countTouched) {
    const next = wizardClamp(s.capacity.suggested, WIZARD_AUTO_COUNT_MIN, WIZARD_AUTO_COUNT_MAX);
    s.config[key] = next;
    const input = document.querySelector(`[data-wizard-config="${key}"]`);
    if (input) input.value = String(next);
  }
  const host = document.querySelector('[data-wizard-capacity-hint]');
  if (host) {
    const input = document.querySelector(`[data-wizard-config="${key}"]`);
    host.outerHTML = wizardCapacityHintHtml(input ? Number(input.value) : undefined);
  }
}

/** Re-renders only the hint when the teacher types a different count. */
function wizardUpdateCapacityUi() {
  const s = wizardState;
  if (!s.config) return;
  const key = wizardCapacityCountKey(s.config.gameType);
  const host = document.querySelector('[data-wizard-capacity-hint]');
  if (!host || !key) return;
  const input = document.querySelector(`[data-wizard-config="${key}"]`);
  host.outerHTML = wizardCapacityHintHtml(input ? Number(input.value) : undefined);
}

function wizardUseCapacity() {
  const s = wizardState;
  if (s.busy || !s.config || !s.capacity) return undefined;
  const key = wizardCapacityCountKey(s.config.gameType);
  if (!key) return undefined;
  s.config[key] = wizardClamp(s.capacity.suggested, WIZARD_AUTO_COUNT_MIN, WIZARD_AUTO_COUNT_MAX);
  s.countTouched = false;
  const input = document.querySelector(`[data-wizard-config="${key}"]`);
  if (input) input.value = String(s.config[key]);
  wizardUpdateCapacityUi();
  return undefined;
}

/** Item-count field + the predicted-count hint that belongs underneath it. */
function wizardConfigCount(key, label, value, min, max, step) {
  return wizardConfigNumber(key, label, value, min, max, step) + wizardCapacityHintHtml(value);
}

function wizardConfigSelect(key, label, value, options) {
  return `<div class="field"><label>${label}</label><select data-wizard-config="${key}">${options.map(option => `<option value="${option.value}"${String(value) === String(option.value) ? ' selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}</select></div>`;
}

function wizardConfigToggle(key, label, checked) {
  return `<label class="switch-row"><span class="switch-copy"><strong>${label}</strong></span><input type="checkbox" data-wizard-config-toggle="${key}"${checked ? ' checked' : ''}></label>`;
}

/**
 * Fast/Thinking is the most consequential choice on this screen (how much of the
 * lesson is sent + the output cap), so it is a pair of visible cards instead of a
 * dropdown that hides one of the two options. The click is handled in place, so
 * the other fields keep their focus and caret.
 */
/**
 * #117: true when this run started from the teacher's question bank. Such a run has no
 * model step at all, so the Fast/Thinking buttons and the "Tạo nội dung" button would
 * be controls that do nothing — they are replaced by a short explanation instead.
 * #182: a set the teacher accepted from the lesson chat is the same situation for step
 * 3 (this run calls no model either), so it joins the list — the wording below still
 * tells the two sources apart.
 */
function wizardIsBankRun() {
  return wizardState.draftOrigin === 'source' && wizardNoModelDraftSources.includes(wizardState.draftSource);
}

/** Explains why there is no Fast/Thinking choice on a question-bank run. */
function wizardBankConfigureNote() {
  const fromChat = wizardState.draftSource === 'chat-questions';
  return `<div class="wizard-mode-block" data-wizard-bank-no-ai="1" data-wizard-run-source="${escapeHtml(wizardState.draftSource || '')}">
    <div class="wizard-mode-head">
      <div>
        <div class="wizard-mode-title">${fromChat ? 'KHÔNG GỌI AI LẦN NỮA' : 'KHÔNG DÙNG AI'}</div>
        <div class="wizard-mode-sub">${fromChat
          ? 'Bộ câu hỏi AI vừa soạn trong khung chat đã qua kiểm tra cấu trúc, nên bước này không cần chọn Fast/Thinking. Chỉ chỉnh thông tin trò chơi rồi bấm “Xong”.'
          : 'Trò chơi dùng đúng câu hỏi và đáp án giáo viên đã cung cấp, nên không có chế độ Fast/Thinking. Chỉ cần chỉnh thông tin trò chơi rồi bấm “Xong”.'}</div>
      </div>
      <span class="tag">${escapeHtml(wizardNoModelRunLabel(wizardState.draftSource))}</span>
    </div>
  </div>`;
}

function wizardModeChoice(config) {
  const value = config.generationMode === 'deep' ? 'deep' : 'fast';
  const card = (mode, icon, title, note, description) => `<button type="button" role="radio" class="wizard-mode-card" data-wizard-mode="${mode}" data-wizard-action="set-mode" data-mode="${mode}" aria-checked="${value === mode ? 'true' : 'false'}" title="${escapeHtml(description)}">
      <span class="wizard-mode-icon" aria-hidden="true">${icon}</span>
      <span class="wizard-mode-copy"><strong>${title} <small>· ${note}</small></strong><span>${description}</span></span>
      <span class="wizard-mode-check" aria-hidden="true">✓</span>
    </button>`;
  return `<div class="wizard-mode-block" data-wizard-mode-block="1">
    <div class="wizard-mode-head">
      <div>
        <div class="wizard-mode-title" id="wizardModeLabel">Chế độ tạo</div>
        <div class="wizard-mode-sub">Chọn tốc độ và mức độ chi tiết khi AI tạo câu hỏi.</div>
      </div>
      <span class="tag" data-wizard-mode-badge>${value === 'deep' ? 'Thinking' : 'Fast'}</span>
    </div>
    <div class="wizard-mode-choice" role="radiogroup" aria-labelledby="wizardModeLabel">
      ${card('fast', '⚡', 'Fast', 'Nhanh', 'Phản hồi nhanh. Phù hợp giáo án ngắn hoặc cần tạo nhanh trong lớp.')}
      ${card('deep', '🧠', 'Thinking', 'Kỹ lưỡng', 'Phân tích sâu hơn, câu hỏi chi tiết. Phù hợp giáo án dài hoặc nội dung nâng cao.')}
    </div>
    <div class="field-hint flex items-center gap-1.5 mt-2">
      <span>Mẹo: Chế độ Nhanh phù hợp cho hầu hết bài học; chọn Kỹ lưỡng khi giáo án dài nhiều phần.</span>
      <span class="inline-flex items-center text-[#64748b] dark:text-[#94a3b8] cursor-help" title="Model Qwen 3.5 trên CPU chưa trả nội dung suy luận dùng được — ứng dụng không giả lập suy luận. Fast/Thinking chỉ đổi ngữ cảnh và trần token, không đổi model." data-icon="info" data-icon-size="13"></span>
    </div>
  </div>`;
}

/** In-place switch so typed fields are not lost while choosing a mode. */
function wizardSetGenerationMode(mode) {
  if (wizardState.busy) return undefined;
  const next = mode === 'deep' ? 'deep' : 'fast';
  wizardSyncConfigFromDom();
  if (!wizardState.config) return undefined;
  wizardState.config.generationMode = next;
  document.querySelectorAll('[data-wizard-mode]').forEach(node => {
    node.setAttribute('aria-checked', node.dataset.wizardMode === next ? 'true' : 'false');
  });
  const badge = document.querySelector('[data-wizard-mode-badge]');
  if (badge) badge.textContent = next === 'deep' ? 'Thinking' : 'Fast';
  // More context/output budget can support one more item, so re-predict.
  wizardState.capacity = null;
  void wizardEnsureCapacity();
  return undefined;
}

function renderWizardConfigure() {
  const s = wizardState;
  const config = s.config;
  const analysis = s.analysis;
  if (!config) {
    return `<section class="form-panel" data-wizard-step-body="configure">
      <div class="section-head"><h3>Bước 4 · Cấu hình trò chơi</h3></div>
      <div class="field-hint">Chưa chọn thể loại trò chơi. Hãy quay lại bước chọn trò chơi.</div>
      <div class="publish-actions"><button class="btn btn-secondary" data-wizard-action="back"><span data-icon="arrow-left" data-icon-size="13"></span> Chọn trò chơi</button></div>
    </section>`;
  }
  const meta = wizardGameMeta(config.gameType);
  const objectives = (analysis && analysis.objectives) || [];
  // Fetch the prediction after this render (never during it), then patch the
  // count field/hint in place when it arrives.
  if (typeof wizardEnsureCapacity === 'function') {
    setTimeout(() => {
      if (wizardState.step === 'configure' && wizardState.config === config) wizardEnsureCapacity();
    }, 0);
  }

  return `<section class="form-panel" data-wizard-step-body="configure">
    <div class="section-head"><h3>Bước 4 · Cấu hình ${escapeHtml(meta.label)}</h3><span class="tag">${meta.icon} ${escapeHtml(config.gameType)}</span></div>
    <div class="panel-sub">${escapeHtml(meta.hint)} Giáo viên có thể chỉnh lại toàn bộ trong trình soạn thảo sau khi tạo nội dung.</div>

    ${wizardIsBankRun() ? wizardBankConfigureNote() : wizardModeChoice(config)}

    <div class="field-row">
      <div class="field"><label>Tên trò chơi *</label><input data-wizard-config="title" value="${escapeHtml(config.title || '')}"></div>
      <div class="field"><label>Chủ đề</label><input data-wizard-config="topic" value="${escapeHtml(config.topic || '')}"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Môn học</label><input data-wizard-config="subject" value="${escapeHtml(config.subject || '')}"></div>
      <div class="field"><label>Lớp</label><input data-wizard-config="grade" value="${escapeHtml(config.grade || '')}"></div>
    </div>

    <!-- Cấu hình chính -->
    <div class="setup-grid mb-3">
      ${wizardConfigCoreTypeFields(config)}
      ${wizardConfigSelect('difficulty', 'Độ khó', config.difficulty, wizardDifficultyOptions.map(value => ({ value, label: value.charAt(0).toUpperCase() + value.slice(1) })))}
      ${wizardConfigNumber('durationMinutes', 'Thời lượng (phút)', config.durationMinutes, 1, 120)}
    </div>

    <!-- Tuỳ chọn nâng cao (Progressive Disclosure) -->
    <details class="create-advanced-options border border-[#e2e8f0] dark:border-[#2a324b] rounded-xl bg-[#f8fafc] dark:bg-[#151a30] p-3 text-[#1e293b] dark:text-[#f1f5f9] transition-all mb-4">
      <summary class="cursor-pointer text-[12px] font-bold text-[#4f46e5] dark:text-[#818cf8] flex items-center justify-between select-none list-none">
        <span class="flex items-center gap-2">
          <span data-icon="sliders-horizontal" data-icon-size="14"></span>
          Tuỳ chọn nâng cao (Luật chơi, tính điểm, thi đấu)
        </span>
        <span class="text-[11px] text-[#5f6a7d] dark:text-[#94a3b8] font-normal">Mở rộng / thu gọn ▾</span>
      </summary>
      <div class="mt-3 pt-3 border-t border-[#e2e8f0] dark:border-[#2a324b] flex flex-col gap-3">
        <div class="setup-grid">
          ${wizardConfigSelect('audience', 'Đối tượng', config.audience, wizardAudienceOptions)}
          ${wizardConfigSelect('playMode', 'Hình thức', config.playMode, [{ value: 'individual', label: 'Cá nhân' }, { value: 'team', label: 'Đội nhóm' }])}
          ${wizardConfigSelect('style', 'Phong cách', config.style, wizardStyleOptions)}
          ${wizardConfigAdvancedTypeFields(config)}
        </div>
      </div>
    </details>

    ${objectives.length ? `<div class="section-head mt-[14px]"><h4>Mục tiêu trọng tâm</h4><small class="text-[12px] text-[#5f6a7d]">Bỏ chọn mục tiêu không muốn đưa vào trò chơi.</small></div>
    <div class="grid gap-[6px]">${objectives.map(objective => `<label class="switch-row"><span class="switch-copy"><strong class="text-[12px]">${escapeHtml(objective.description)}</strong></span><input type="checkbox" data-wizard-focus="${escapeHtml(objective.id)}"${(config.focusObjectiveIds || []).includes(objective.id) ? ' checked' : ''}></label>`).join('')}</div>` : ''}

    <div class="publish-actions flex items-center justify-between gap-2 flex-wrap">
      <div class="flex items-center gap-2">
        <button class="btn btn-secondary" data-wizard-action="back"><span data-icon="arrow-left" data-icon-size="13"></span> Chọn trò chơi</button>
        <button class="btn btn-secondary" data-wizard-action="save"${s.busy ? ' disabled' : ''}>${s.busy === 'save' ? 'Đang lưu…' : 'Lưu dự án'}</button>
      </div>
      ${wizardIsBankRun()
        ? `<button class="btn btn-primary" id="wizardNextBtn" data-wizard-action="next"${s.busy ? ' disabled' : ''}>Xong · ${s.gameSnapshot ? 'Mở bước lưu' : 'Lưu vào thư viện'} <span data-icon="arrow-right" data-icon-size="13"></span></button>`
        : `<button class="btn btn-primary" id="wizardNextBtn" data-wizard-action="next"${s.busy ? ' disabled' : ''}>Tiếp tục · Tạo nội dung <span data-icon="arrow-right" data-icon-size="13"></span></button>`}
    </div>
  </section>`;
}

/**
 * Constellation picker (DECISIONS #168/#171), for the MATCHING game only: the
 * style is `matchingMode: 'connection'`, so the gallery and the drag direction
 * show once that style is chosen. The radios stay in the DOM either way and
 * `wizardSyncConfigFromDom` keeps the chosen id, so switching styles back and
 * forth never loses the pick.
 */
function wizardConnectionFields(config) {
  if (!config || config.gameType !== 'matching') return '';
  const mode = config.matchingMode || 'columns';
  const picked = constellationResolve(config.connectionTemplate).id;
  const direction = constellationResolveDragDirection(config.dragDirection);
  return `<div class="field connection-field${mode === 'connection' ? '' : ' hidden'}" data-connection-field>
    <label>Chòm sao</label>
    ${constellationPreviewHtml(picked)}
    ${constellationGalleryHtml(picked, 'connectionTemplate')}
    <div class="field connection-direction">
      <label>Chiều kéo</label>
      <select data-wizard-config="dragDirection">
        ${CONSTELLATION_DRAG_DIRECTIONS.map(value => `<option value="${value}"${value === direction ? ' selected' : ''}>${escapeHtml(CONSTELLATION_DRAG_LABELS[value])}</option>`).join('')}
      </select>
    </div>
    <p class="field-hint">Mỗi sao đích mang một vế của cặp; kéo thẻ chứa vế còn lại vào đúng sao. Cặp ghép đúng thắp sáng thêm một sao và nối thêm một đường; ghép sai không gỡ sao đã sáng.</p>
  </div>`;
}

function wizardConfigCoreTypeFields(config) {
  switch (config.gameType) {
    case 'arena':
      return wizardConfigCount('questionCount', 'Số câu hỏi', config.questionCount, 1, 30);
    case 'scenario':
      return wizardConfigCount('situationCount', 'Số tình huống', config.situationCount, 1, 30);
    case 'matching':
      return wizardConfigCount('pairCount', 'Số cặp ghép', config.pairCount, 2, 30);
    case 'treasure':
      return wizardConfigCount('stageCount', 'Số chặng', config.stageCount, 2, 30);
    case 'race':
      return wizardConfigCount('maxRounds', 'Số lượt tối đa', config.maxRounds, 1, 50);
    default:
      return '';
  }
}

/* "Cách trả lời" (DECISIONS #209) replaces the old "Tính điểm" pick on the four templates that
   answer questions. `keep` = "Giữ hành vi hiện tại" and only appears for a project that really is
   still running on a pre-#209 rule (opened from the library), because a brand-new game has nothing
   to keep. The pick is stored as a 'tra-loi:' token in gameSetup.scoringMode by the adapter. */
function wizardAnswerModeSelect(config) {
  const current = config.answerMode || 'competitive';
  const options = [
    { value: 'competitive', label: 'Thi đấu — trả lời một lần, sai thì hiện đáp án đúng' },
    { value: 'practice', label: 'Luyện tập — sai được thử lại, mỗi lần sai bớt 10% điểm của câu' },
    { value: 'challenge', label: 'Thử thách — sai thì KHÔNG hiện đáp án, phải tự sang câu' }
  ];
  if (current === 'keep') options.unshift({ value: 'keep', label: 'Giữ hành vi hiện tại — theo cách chấm của trò này' });
  return wizardConfigSelect('answerMode', 'Cách trả lời', current, options)
    + `<p class="field-hint">${escapeHtml(answerModeHint(current === 'keep' ? 'legacy' : current))}</p>`;
}

function wizardConfigAdvancedTypeFields(config) {
  switch (config.gameType) {
    case 'arena':
      return wizardAnswerModeSelect(config)
        + wizardConfigSelect('gameplayMode', 'Cách chơi', config.gameplayMode || 'classic', [
          { value: 'classic', label: 'Cổ điển' }, { value: 'house', label: 'Xây nhà 3D (theo số câu)' }
        ])
        + wizardConfigSelect('houseStyle', 'Mẫu nhà 3D', config.houseStyle || 'auto', [
          { value: 'auto', label: 'Tự động theo trò chơi' },
          ...houseStyleOptions().map(option => ({ value: option.id, label: option.label }))
        ])
        + wizardConfigNumber('pointsPerCorrect', 'Điểm / câu', config.pointsPerCorrect, 10, 1000, 10);
    case 'scenario':
      return wizardAnswerModeSelect(config)
        + wizardConfigSelect('scoringMode', 'Tính điểm', config.scoringMode, [
          { value: 'quality', label: 'Theo chất lượng quyết định' }, { value: 'simple', label: 'Đơn giản' }
        ]);
    case 'matching':
      return wizardConfigSelect('matchingMode', 'Kiểu ghép', config.matchingMode, [
          { value: 'columns', label: 'Hai cột' }, { value: 'memory', label: 'Lật thẻ' },
          { value: 'categorize', label: 'Phân loại' },
          { value: 'connection', label: `${CONSTELLATION_GAME_NAME} (kéo thẻ vào sao)` }
        ])
        + wizardConfigNumber('wrongPenalty', 'Trừ điểm sai', config.wrongPenalty, 0, 1000, 10)
        + wizardConnectionFields(config);
    case 'treasure':
      return wizardAnswerModeSelect(config)
        + wizardConfigNumber('attemptsPerStage', 'Lượt thử mỗi chặng', config.attemptsPerStage, 0, 99)
        + wizardConfigNumber('journeyBonus', 'Thưởng hành trình', config.journeyBonus, 0, 10000, 50)
        + wizardConfigNumber('hiddenItemBonus', 'Thưởng vật phẩm ẩn', config.hiddenItemBonus, 0, 1000, 50);
    case 'race':
      return wizardAnswerModeSelect(config)
        + wizardConfigNumber('trackLength', 'Độ dài đường đua', config.trackLength, 3, 100)
        + wizardConfigNumber('teamCount', 'Số đội', config.teamCount, 2, 6)
        + wizardConfigToggle('stepByDifficulty', 'Bước tiến theo độ khó', config.stepByDifficulty)
        + wizardConfigToggle('luckEnabled', 'Bật ô may mắn', config.luckEnabled);
    default:
      return '';
  }
}

function wizardConfigTypeFields(config) {
  return wizardConfigCoreTypeFields(config) + wizardConfigAdvancedTypeFields(config);
}

function wizardNumberInput(el, fallback, min, max) {
  const raw = Number(el.value);
  if (!Number.isFinite(raw)) return fallback;
  const minAttr = el.hasAttribute('min') ? Number(el.getAttribute('min')) : NaN;
  const maxAttr = el.hasAttribute('max') ? Number(el.getAttribute('max')) : NaN;
  return wizardClamp(raw, Number.isFinite(minAttr) ? minAttr : min, Number.isFinite(maxAttr) ? maxAttr : max);
}

/** Reads the config form (including type-specific fields) into `wizardState.config`. */
function wizardSyncConfigFromDom() {
  const config = wizardState.config;
  if (!config) return;
  document.querySelectorAll('[data-wizard-config]').forEach(el => {
    const key = el.dataset.wizardConfig;
    if (el.tagName === 'SELECT') { config[key] = el.value; return; }
    if (el.type === 'number') { config[key] = wizardNumberInput(el, config[key]); return; }
    config[key] = el.value.trim();
  });
  document.querySelectorAll('[data-wizard-config-toggle]').forEach(el => {
    config[el.dataset.wizardConfigToggle] = el.checked;
  });
  if (document.querySelector('[data-wizard-focus]')) {
    config.focusObjectiveIds = [...document.querySelectorAll('[data-wizard-focus]')]
      .filter(el => el.checked)
      .map(el => el.dataset.wizardFocus);
  }
  // Constellation (#168/#171): the gallery is a radio group, not a form field,
  // so it is read here. The pick is kept even while another matching style is
  // selected, so switching to Hai cột and back does not lose it. The drag
  // direction is an ordinary `data-wizard-config` select and was read above.
  if (config.gameType === 'matching') {
    const picked = readConstellationGallery(document, 'connectionTemplate');
    if (picked) config.connectionTemplate = picked;
    config.dragDirection = constellationResolveDragDirection(
      document.querySelector('[data-wizard-config="dragDirection"]')?.value || config.dragDirection
    );
  }
}

function wizardConfigValid() {
  const config = wizardState.config;
  if (!config) return false;
  if (!config.title || !config.title.trim()) return false;
  if (!Number.isFinite(Number(config.durationMinutes))) return false;
  return true;
}

async function wizardConfigureSave(advance) {
  wizardSyncConfigFromDom();
  if (!wizardConfigValid()) {
    wizardSetError(new Error('Cần có tên trò chơi và thời lượng hợp lệ trước khi lưu cấu hình.'));
    render();
    return;
  }
  if (wizardState.busy) return;
  wizardState.busy = 'save';
  wizardClearMessages();
  render();
  try {
    const step = advance ? 'generate' : 'configure';
    await wizardSaveProject(step);
    // #117: on a bank run the title/topic/subject/grade edits belong to the game the
    // teacher is about to save, so apply them to the built snapshot too — otherwise the
    // library would keep the placeholder title while the wizard shows the new one.
    if (advance && wizardIsBankRun() && wizardState.gameSnapshot && typeof wizardApplyConfigToGame === 'function') {
      wizardState.gameSnapshot = wizardApplyConfigToGame(wizardState.gameSnapshot);
    }
    if (advance) wizardState.step = 'generate';
    // #117: a bank run is already built, so there is no model step to announce.
    if (advance && wizardIsBankRun()) {
      wizardSetNotice('Đã lưu cấu hình. Trò chơi đã sẵn sàng — bấm “Lưu vào thư viện” để có thể chơi.');
    } else {
      wizardSetNotice(advance ? 'Đã lưu cấu hình. Bước tiếp theo: tạo nội dung bằng AI.' : 'Đã lưu cấu hình dự án.');
    }
  } catch (error) {
    wizardSetError(error);
  }
  wizardState.busy = '';
  render();
}
