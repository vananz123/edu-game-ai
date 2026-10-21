// @ts-nocheck -- renderer UI logic; workflow contracts are typed in src/shared/lesson-types.ts.
/** Wizard step 4 — per-game-type configuration for generation. */

function wizardConfigNumber(key, label, value, min, max, step) {
  return `<div class="field"><label>${label}</label><input type="number" data-wizard-config="${key}" min="${min}" max="${max}"${step ? ` step="${step}"` : ''} value="${escapeHtml(String(value))}"></div>`;
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
        <div class="wizard-mode-title" id="wizardModeLabel">CHẾ ĐỘ TẠO</div>
        <div class="wizard-mode-sub">Chọn cách AI local đọc giáo án — khác biệt thật nằm ở lượng ngữ cảnh và giới hạn độ dài câu trả lời.</div>
      </div>
      <span class="tag" data-wizard-mode-badge>${value === 'deep' ? 'Thinking' : 'Fast'}</span>
    </div>
    <div class="wizard-mode-choice" role="radiogroup" aria-labelledby="wizardModeLabel">
      ${card('fast', '⚡', 'Fast', 'Nhanh (mặc định)', 'Ít ngữ cảnh hơn, phản hồi nhanh. Phù hợp giáo án ngắn hoặc khi cần tạo nhanh trong lớp.')}
      ${card('deep', '🧠', 'Thinking', 'Kỹ, nhiều ngữ cảnh', 'Gửi nhiều đoạn giáo án hơn và cho phép câu trả lời dài hơn. Phù hợp giáo án dài, cần nội dung chi tiết.')}
    </div>
    <div class="field-hint">Model Qwen 3.5 trên CPU chưa trả nội dung suy luận dùng được — ứng dụng không giả lập suy luận. Fast/Thinking chỉ đổi ngữ cảnh và trần token, không đổi model.</div>
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
      <div class="publish-actions"><button class="btn btn-secondary" data-wizard-action="back">← Chọn trò chơi</button></div>
    </section>`;
  }
  const meta = wizardGameMeta(config.gameType);
  const objectives = (analysis && analysis.objectives) || [];

  return `<section class="form-panel" data-wizard-step-body="configure">
    <div class="section-head"><h3>Bước 4 · Cấu hình ${escapeHtml(meta.label)}</h3><span class="tag">${meta.icon} ${escapeHtml(config.gameType)}</span></div>
    <div class="panel-sub">${escapeHtml(meta.hint)} Giáo viên có thể chỉnh lại toàn bộ trong trình soạn thảo sau khi tạo nội dung.</div>

    ${wizardModeChoice(config)}

    <div class="field-row">
      <div class="field"><label>TÊN TRÒ CHƠI *</label><input data-wizard-config="title" value="${escapeHtml(config.title || '')}"></div>
      <div class="field"><label>CHỦ ĐỀ</label><input data-wizard-config="topic" value="${escapeHtml(config.topic || '')}"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>MÔN HỌC</label><input data-wizard-config="subject" value="${escapeHtml(config.subject || '')}"></div>
      <div class="field"><label>LỚP</label><input data-wizard-config="grade" value="${escapeHtml(config.grade || '')}"></div>
    </div>

    <div class="setup-grid">
      ${wizardConfigSelect('audience', 'ĐỐI TƯỢNG', config.audience, wizardAudienceOptions)}
      ${wizardConfigSelect('difficulty', 'ĐỘ KHÓ', config.difficulty, wizardDifficultyOptions.map(value => ({ value, label: value.charAt(0).toUpperCase() + value.slice(1) })))}
      ${wizardConfigNumber('durationMinutes', 'THỜI LƯỢNG (PHÚT)', config.durationMinutes, 1, 120)}
      ${wizardConfigSelect('playMode', 'HÌNH THỨC', config.playMode, [{ value: 'individual', label: 'Cá nhân' }, { value: 'team', label: 'Đội nhóm' }])}
      ${wizardConfigSelect('style', 'PHONG CÁCH', config.style, wizardStyleOptions)}
      ${wizardConfigTypeFields(config)}
    </div>

    ${objectives.length ? `<div class="section-head mt-[14px]"><h4>Mục tiêu trọng tâm</h4><small class="text-[11px] text-[#788196]">Bỏ chọn mục tiêu không muốn đưa vào trò chơi.</small></div>
    <div class="grid gap-[6px]">${objectives.map(objective => `<label class="switch-row"><span class="switch-copy"><strong class="text-[11px]">${escapeHtml(objective.description)}</strong></span><input type="checkbox" data-wizard-focus="${escapeHtml(objective.id)}"${(config.focusObjectiveIds || []).includes(objective.id) ? ' checked' : ''}></label>`).join('')}</div>` : ''}

    <div class="publish-actions">
      <button class="btn btn-secondary" data-wizard-action="back">← Chọn trò chơi</button>
      <button class="btn btn-secondary" data-wizard-action="save"${s.busy ? ' disabled' : ''}>${s.busy === 'save' ? 'Đang lưu…' : 'Lưu dự án'}</button>
      <button class="btn btn-primary" id="wizardNextBtn" data-wizard-action="next"${s.busy ? ' disabled' : ''}>Tiếp tục · Tạo nội dung →</button>
    </div>
  </section>`;
}

function wizardConfigTypeFields(config) {
  switch (config.gameType) {
    case 'arena':
      return wizardConfigNumber('questionCount', 'SỐ CÂU HỎI', config.questionCount, 1, 30)
        + wizardConfigSelect('scoringMode', 'TÍNH ĐIỂM', config.scoringMode, [
          { value: 'basic', label: 'Cơ bản' }, { value: 'speed', label: 'Tốc độ' },
          { value: 'difficulty', label: 'Theo độ khó' }, { value: 'team', label: 'Thi đấu đội' },
          { value: 'practice', label: 'Luyện tập' }
        ])
        + wizardConfigNumber('pointsPerCorrect', 'ĐIỂM / CÂU', config.pointsPerCorrect, 10, 1000, 10)
        + wizardConfigNumber('timeBonus', 'THƯỞNG NHANH', config.timeBonus, 0, 50, 5);
    case 'scenario':
      return wizardConfigNumber('situationCount', 'SỐ TÌNH HUỐNG', config.situationCount, 1, 30)
        + wizardConfigSelect('scoringMode', 'TÍNH ĐIỂM', config.scoringMode, [
          { value: 'quality', label: 'Theo chất lượng quyết định' }, { value: 'simple', label: 'Đơn giản' }
        ]);
    case 'matching':
      return wizardConfigNumber('pairCount', 'SỐ CẶP GHÉP', config.pairCount, 2, 30)
        + wizardConfigSelect('matchingMode', 'KIỂU GHÉP', config.matchingMode, [
          { value: 'columns', label: 'Hai cột' }, { value: 'memory', label: 'Lật thẻ' }, { value: 'categorize', label: 'Phân loại' }
        ])
        + wizardConfigNumber('wrongPenalty', 'TRỪ ĐIỂM SAI', config.wrongPenalty, 0, 1000, 10);
    case 'treasure':
      return wizardConfigNumber('stageCount', 'SỐ CHẶNG', config.stageCount, 2, 30)
        + wizardConfigNumber('attemptsPerStage', 'LƯỢT THỬ MỖI CHẶNG', config.attemptsPerStage, 0, 99)
        + wizardConfigNumber('journeyBonus', 'THƯỞNG HÀNH TRÌNH', config.journeyBonus, 0, 10000, 50)
        + wizardConfigNumber('hiddenItemBonus', 'THƯỞNG VẬT PHẨM ẨN', config.hiddenItemBonus, 0, 1000, 50);
    case 'race':
      return wizardConfigNumber('trackLength', 'ĐỘ DÀI ĐƯỜNG ĐUA', config.trackLength, 3, 100)
        + wizardConfigNumber('maxRounds', 'SỐ LƯỢT TỐI ĐA', config.maxRounds, 1, 50)
        + wizardConfigNumber('teamCount', 'SỐ ĐỘI', config.teamCount, 2, 6)
        + wizardConfigToggle('stepByDifficulty', 'Bước tiến theo độ khó', config.stepByDifficulty)
        + wizardConfigToggle('luckEnabled', 'Bật ô may mắn', config.luckEnabled);
    default:
      return '';
  }
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
    if (advance) wizardState.step = 'generate';
    wizardSetNotice(advance ? 'Đã lưu cấu hình. Bước tiếp theo: tạo nội dung bằng AI local.' : 'Đã lưu cấu hình dự án.');
  } catch (error) {
    wizardSetError(error);
  }
  wizardState.busy = '';
  render();
}
