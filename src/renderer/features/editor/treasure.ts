// @ts-nocheck -- editor/treasure.ts — panel soạn Kho báu tri thức: cặp ghép, chặng, nhiệm vụ, nhánh và kiểm dữ liệu (split từ features/game-editor.ts, DECISIONS #150).
function newPanelId(prefix) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }

function treasurePairRow(pair, index) {
  return `<div class="treasure-match-pair" data-match-pair data-pair-id="${escapeHtml(pair.id || newPanelId('pair'))}">
    <input data-pair-left value="${escapeHtml(pair.left || '')}" placeholder="Vế trái ${index + 1}">
    <span class="pair-arrow">↔</span>
    <input data-pair-right value="${escapeHtml(pair.right || '')}" placeholder="Vế phải ${index + 1}">
    <button type="button" class="text-link danger-text" data-pair-remove>✕</button>
  </div>`;
}
function treasureClassGroupRow(group, index) {
  return `<div class="treasure-class-group-row" data-class-group-row data-group-id="${escapeHtml(group.id || newPanelId('group'))}">
    <input data-group-name value="${escapeHtml(group.name || '')}" placeholder="Tên nhóm ${index + 1}">
    <button type="button" class="text-link danger-text" data-group-remove>✕</button>
  </div>`;
}
function treasureClassItemRow(item, index, groups) {
  const selected = groups.some(group => group.id === item.groupId) ? item.groupId : (groups[0]?.id || '');
  return `<div class="treasure-class-item-row" data-class-item-row data-item-id="${escapeHtml(item.id || newPanelId('item'))}">
    <input data-item-text value="${escapeHtml(item.text || '')}" placeholder="Nội dung mục ${index + 1}">
    <select data-item-group>${groups.map(group => `<option value="${escapeHtml(group.id)}" ${group.id === selected ? 'selected' : ''}>${escapeHtml(group.name || 'Nhóm chưa đặt tên')}</option>`).join('')}</select>
    <button type="button" class="text-link danger-text" data-item-remove>✕</button>
  </div>`;
}
function treasureMissionPanel(stage) {
  const type = treasureMissionTypeOf(stage);
  const mission = stage.mission || {};
  const choices = type === 'multiple-choice' || type === 'scenario';
  const options = stage.question?.options || [];
  const correctId = stage.question?.correctOptionId;
  const pairs = type === 'matching' && Array.isArray(mission.pairs) && mission.pairs.length
    ? mission.pairs
    : [{ id: newPanelId('pair'), left: '', right: '' }, { id: newPanelId('pair'), left: '', right: '' }];
  const groups = type === 'classification' && Array.isArray(mission.groups) && mission.groups.length
    ? mission.groups
    : [{ id: newPanelId('group'), name: '' }, { id: newPanelId('group'), name: '' }];
  const items = type === 'classification' && Array.isArray(mission.items) && mission.items.length
    ? mission.items
    : [{ id: newPanelId('item'), text: '', groupId: groups[0].id }, { id: newPanelId('item'), text: '', groupId: groups[1].id }];
  return `
    <div class="treasure-mission-panel ${choices ? '' : 'hidden'}" data-mission-panel="choice">
      <div class="treasure-options" data-stage-options>${options.map((o, j) => treasureOptionRow(o, stage.id, correctId, j)).join('')}<button type="button" class="btn btn-secondary btn-small" data-stage-add-option>＋ Thêm đáp án</button></div>
    </div>
    <div class="treasure-mission-panel ${type === 'matching' ? '' : 'hidden'}" data-mission-panel="matching">
      <label>CÁC CẶP GHÉP</label>
      <div class="treasure-mission-rows" data-match-pairs>${pairs.map((pair, i) => treasurePairRow(pair, i)).join('')}</div>
      <button type="button" class="btn btn-secondary btn-small" data-add-pair>＋ Thêm cặp</button>
    </div>
    <div class="treasure-mission-panel ${type === 'decode' ? '' : 'hidden'}" data-mission-panel="decode">
      <div class="field-row"><div class="field"><label>ĐÁP ÁN CẦN GIẢI MÃ</label><input data-decode-answer value="${escapeHtml(mission.answer || '')}" placeholder="Ví dụ: quang hợp"></div><div class="field"><label>MẬT MÃ HIỂN THỊ (ĐỂ TRỐNG = TỰ XÁO)</label><input data-decode-cipher value="${escapeHtml(mission.cipher || '')}" placeholder="Ví dụ: hợp quang"></div></div>
    </div>
    <div class="treasure-mission-panel ${type === 'classification' ? '' : 'hidden'}" data-mission-panel="classification">
      <label>NHÓM PHÂN LOẠI</label>
      <div class="treasure-mission-rows" data-class-groups>${groups.map((group, i) => treasureClassGroupRow(group, i)).join('')}</div>
      <button type="button" class="btn btn-secondary btn-small" data-add-group>＋ Thêm nhóm</button>
      <label>CÁC MỤC CẦN PHÂN LOẠI</label>
      <div class="treasure-mission-rows" data-class-items>${items.map((item, i) => treasureClassItemRow(item, i, groups)).join('')}</div>
      <button type="button" class="btn btn-secondary btn-small" data-add-item>＋ Thêm mục</button>
    </div>`;
}

function defaultTreasureHunt() {
  const s1 = 'stage-1', s2 = 'stage-2';
  return {
    character: 'Nhà thám hiểm',
    intro: 'Bắt đầu hành trình khám phá kho tàng kiến thức!',
    journeyBonus: 300,
    hiddenItemBonus: 50,
    backgroundId: 'temple',
    characterId: 'explorer',
    stages: [
      {
        id: s1, name: 'Chặng 1 — Cổng đền', story: 'Bạn đứng trước cổng đền cổ, cần giải câu đố mở cửa.',
        taskDescription: 'Trả lời đúng để tìm chìa khóa đầu tiên.',
        question: { prompt: 'Nhập câu đố của chặng đầu tại đây', options: [{ id: 'a', text: 'Đáp án A' }, { id: 'b', text: 'Đáp án B' }, { id: 'c', text: 'Đáp án C' }], correctOptionId: 'a', explanation: 'Giải thích đáp án.', hint: 'Gợi ý cho học sinh khi thử sai.' },
        attempts: 0, points: 100, completionBonus: 200, nextStageId: s2, hasHiddenItem: true
      },
      {
        id: s2, name: 'Chặng cuối — Kho báu', story: 'Cánh cửa cuối cùng mở ra kho tàng kiến thức.',
        taskDescription: 'Trả lời câu đố tổng hợp để nhận kho báu.',
        question: { prompt: 'Nhập câu đố tổng hợp của chặng cuối', options: [{ id: 'a', text: 'Đáp án A' }, { id: 'b', text: 'Đáp án B' }], correctOptionId: 'a', explanation: 'Giải thích đáp án.', hint: '' },
        attempts: 0, points: 100, completionBonus: 200, nextStageId: null, hasHiddenItem: false
      }
    ]
  };
}
function treasureOptionRow(option, stageId, correctId, index) {
  return `<div class="treasure-option-row" data-opt-id="${escapeHtml(option.id || `o${index + 1}`)}">
    <input data-opt-text value="${escapeHtml(option.text || '')}" placeholder="Đáp án ${index + 1}">
    <label class="opt-correct"><input type="radio" name="treasure-correct-${escapeHtml(stageId)}" data-opt-correct ${option.id === correctId ? 'checked' : ''}> Đúng</label>
    <button type="button" class="text-link danger-text" data-opt-remove>✕</button>
  </div>`;
}
function treasureStageHtml(stage, index) {
  const missionType = treasureMissionTypeOf(stage);
  const aiAllowed = missionType === 'multiple-choice' || missionType === 'scenario';
  return `<div class="treasure-stage-card" data-stage-id="${escapeHtml(stage.id)}">
    <div class="treasure-stage-head"><strong>CHẶNG <span data-stage-num>${index + 1}</span></strong>
      <input data-stage-name value="${escapeHtml(stage.name || '')}" placeholder="Tên chặng">
      <span class="tag ${stage.nextStageId ? 'hidden' : ''}" data-ending-tag>KẾT THÚC</span>
      ${editorAiButton(stage.id, !aiAllowed)}
      <button type="button" class="text-link" data-stage-toggle>Ẩn/hiện</button>
      <button type="button" class="text-link" data-stage-copy>⧉ Nhân bản</button>
      <button type="button" class="text-link" data-stage-up>↑</button>
      <button type="button" class="text-link" data-stage-down>↓</button>
      <button type="button" class="text-link danger-text" data-stage-remove>✕</button>
    </div>
    <div class="treasure-stage-body">
      <label>CỐT TRUYỆN / LỜI DẪN</label><textarea data-stage-story rows="2" placeholder="Bối cảnh, lời dẫn của nhân vật">${escapeHtml(stage.story || '')}</textarea>
      <label>MÔ TẢ NHIỆM VỤ</label><textarea data-stage-task rows="2" placeholder="Học sinh cần làm gì ở chặng này">${escapeHtml(stage.taskDescription || '')}</textarea>
      <div class="field"><label>KIỂU NHIỆM VỤ</label><select data-stage-mission data-stage-select>${Object.entries(treasureMissionMeta).map(([value, meta]) => `<option value="${value}" ${missionType === value ? 'selected' : ''}>${meta.icon} ${meta.label}</option>`).join('')}</select></div>
      <label>CÂU ĐỐ / LỜI DẪN NHIỆM VỤ</label><textarea data-stage-prompt rows="2" placeholder="Nội dung câu đố hoặc lời dẫn nhiệm vụ">${escapeHtml(stage.question?.prompt || '')}</textarea>
      ${treasureMissionPanel(stage)}
      ${editorAssetFieldsHtml(stage.question)}${editorItemArtHtml(stage.question)}
      <div class="field-row"><div class="field"><label>GIẢI THÍCH</label><textarea data-stage-explanation rows="2">${escapeHtml(stage.question?.explanation || '')}</textarea></div><div class="field"><label>GỢI Ý KHI THỬ SAI</label><textarea data-stage-hint rows="2" placeholder="Hiển thị khi hết lượt thử">${escapeHtml(stage.question?.hint || '')}</textarea></div></div>
      <div class="field-row"><div class="field"><label>LƯỢT THỬ (0 = KHÔNG GIỚI HẠN)</label><input data-stage-attempts type="number" min="0" max="99" value="${Number(stage.attempts) || 0}"></div><div class="field"><label>ĐIỂM GIẢI CÂU ĐỐ</label><input data-stage-points type="number" min="0" max="1000" value="${Number(stage.points) || 100}"></div><div class="field"><label>THƯỞNG HOÀN THÀNH CHẶNG</label><input data-stage-bonus type="number" min="0" max="10000" value="${Number(stage.completionBonus) || 200}"></div></div>
      <div class="field-row"><div class="field"><label>ĐI TỚI SAU KHI XONG CHẶNG</label><select data-stage-next data-stage-select>${stage.nextStageId ? `<option value="${escapeHtml(stage.nextStageId)}">Chặng liên kết</option>` : '<option value="__ending__">🏠 Kết thúc tại đây — nhận kho báu</option>'}</select></div><div class="field"><label>NHÁNH PHỤ — LỰA CHỌN CỦA HỌC SINH</label><input data-stage-branch-label value="${escapeHtml(stage.branchLabel || '')}" placeholder="Tên nhánh (để trống nếu không dùng)"><select data-stage-branch data-stage-select><option value="">— Không có nhánh phụ —</option>${stage.branchStageId ? `<option value="${escapeHtml(stage.branchStageId)}">Nhánh liên kết</option>` : ''}</select></div></div>
      <div class="correct-select"><label><input type="checkbox" data-stage-item ${stage.hasHiddenItem ? 'checked' : ''}> Chặng này có vật phẩm ẩn (+${50} điểm khi tìm thấy)</label></div>
    </div>
  </div>`;
}
function treasureEditorHtml(hunt) {
  const h = hunt || defaultTreasureHunt();
  return `<div id="treasureEditor" class="hidden">
    <div class="section-head"><h3>Hành trình khám phá <span class="tag" id="treasureStageCount">${h.stages.length}</span></h3><div><button type="button" class="btn btn-secondary btn-small" id="addTreasureStageBtn">＋ Thêm chặng</button></div></div>
    <div class="field-row"><div class="field"><label>NHÂN VẬT CỦA HỌC SINH</label><input id="treasureCharacter" value="${escapeHtml(h.character || '')}" placeholder="Nhà thám hiểm / Nhà khoa học…"></div><div class="field"><label>THƯỞNG HOÀN THÀNH HÀNH TRÌNH</label><input id="treasureJourneyBonus" type="number" min="0" max="10000" value="${Number(h.journeyBonus) || 300}"></div></div>
    <div class="field-row"><div class="field"><label>HÌNH NỀN HÀNH TRÌNH</label><select id="treasureBackground">${Object.entries(TREASURE_BACKGROUNDS).map(([id, meta]) => `<option value="${id}" ${treasureBackgroundId(h.backgroundId) === id ? 'selected' : ''}>${escapeHtml(meta.label)}</option>`).join('')}</select></div><div class="field"><label>NHÂN VẬT MINH HỌA</label><select id="treasureCharacterStyle">${Object.entries(TREASURE_CHARACTERS).map(([id, meta]) => `<option value="${id}" ${treasureCharacterId(h.characterId) === id ? 'selected' : ''}>${escapeHtml(meta.label)}</option>`).join('')}</select></div></div>
    <div data-treasure-preview-slot>${treasureThemePreviewHtml(h.backgroundId, h.characterId)}</div>
    <div class="field"><label>MỞ ĐẦU HÀNH TRÌNH</label><textarea id="treasureIntro" rows="2">${escapeHtml(h.intro || '')}</textarea></div>
    <div class="field"><label>ĐIỂM MỖI VẬT PHẨM ẨN</label><input id="treasureHiddenItemBonus" type="number" min="0" max="1000" value="${Number(h.hiddenItemBonus) || 50}" class="w-[120px]"></div>
    <p class="field-hint">Mỗi chặng gồm cốt truyện, nhiệm vụ và một câu đố. Chọn “Kết thúc tại đây” cho chặng cuối để tạo kết thúc; dùng nhánh phụ nếu muốn học sinh tự chọn đường đi — mỗi nhánh có thể dẫn tới một kết thúc khác.</p>
    <div id="treasureStages">${h.stages.map((s, i) => treasureStageHtml(s, i)).join('')}</div>
  </div>`;
}
function refreshTreasureUi(root) {
  const stages = $$('#treasureStages .treasure-stage-card', root);
  const items = stages.map(card => ({ id: card.dataset.stageId, name: card.querySelector('[data-stage-name]').value.trim() }));
  stages.forEach((card, i) => {
    const num = card.querySelector('[data-stage-num]');
    if (num) num.textContent = String(i + 1);
    const currentId = card.dataset.stageId;
    const nextSel = card.querySelector('[data-stage-next]');
    const branchSel = card.querySelector('[data-stage-branch]');
    const nextVal = nextSel.value;
    const branchVal = branchSel.value;
    const options = items.filter(item => item.id !== currentId)
      .map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name || item.id)}</option>`).join('');
    nextSel.innerHTML = options + `<option value="__ending__">🏠 Kết thúc tại đây — nhận kho báu</option>`;
    branchSel.innerHTML = `<option value="">— Không có nhánh phụ —</option>` + options;
    if ([...nextSel.options].some(o => o.value === nextVal)) nextSel.value = nextVal; else nextSel.value = '__ending__';
    if ([...branchSel.options].some(o => o.value === branchVal)) branchSel.value = branchVal; else branchSel.value = '';
    const tag = card.querySelector('[data-ending-tag]');
    if (tag) tag.classList.toggle('hidden', nextSel.value !== '__ending__');
  });
  const count = $('#treasureStageCount', root);
  if (count) count.textContent = String(stages.length);
}
function newTreasureStageHtml(index) {
  const id = newPanelId('stage');
  return treasureStageHtml({
    id, name: `Chặng ${index + 1}`, story: '', taskDescription: '',
    question: { prompt: '', options: [{ id: 'a', text: '' }, { id: 'b', text: '' }], correctOptionId: 'a', explanation: '', hint: '' },
    attempts: 0, points: 100, completionBonus: 200, nextStageId: null, hasHiddenItem: false
  }, index);
}
function refreshTreasureClassGroups(card) {
  const groups = $$('[data-class-group-row]', card).map(row => ({
    id: row.dataset.groupId,
    name: row.querySelector('[data-group-name]').value.trim()
  }));
  $$('[data-class-item-row]', card).forEach(row => {
    const select = row.querySelector('[data-item-group]');
    const current = select.value;
    select.innerHTML = groups.map(group => `<option value="${escapeHtml(group.id)}">${escapeHtml(group.name || 'Nhóm chưa đặt tên')}</option>`).join('');
    if (groups.some(group => group.id === current)) select.value = current;
    else if (groups[0]) select.value = groups[0].id;
  });
}
function refreshTreasureMissionUi(card) {
  const type = card.querySelector('[data-stage-mission]').value;
  const choice = type === 'multiple-choice' || type === 'scenario';
  $$('[data-mission-panel]', card).forEach(panel => {
    panel.classList.toggle('hidden', panel.dataset.missionPanel !== (choice ? 'choice' : type));
  });
  const ai = card.querySelector('[data-ai-regenerate]');
  if (ai) ai.classList.toggle('hidden', !choice);
  if (type === 'classification') refreshTreasureClassGroups(card);
}
function readTreasureMission(card) {
  const type = card.querySelector('[data-stage-mission]').value;
  if (type === 'matching') {
    return {
      type,
      pairs: $$('[data-match-pair]', card).map(row => ({
        id: row.dataset.pairId,
        left: row.querySelector('[data-pair-left]').value.trim(),
        right: row.querySelector('[data-pair-right]').value.trim()
      }))
    };
  }
  if (type === 'decode') {
    const answer = card.querySelector('[data-decode-answer]').value.trim();
    const cipher = card.querySelector('[data-decode-cipher]').value.trim();
    return { type, answer, ...(cipher ? { cipher } : {}) };
  }
  if (type === 'classification') {
    return {
      type,
      groups: $$('[data-class-group-row]', card).map(row => ({
        id: row.dataset.groupId,
        name: row.querySelector('[data-group-name]').value.trim()
      })),
      items: $$('[data-class-item-row]', card).map(row => ({
        id: row.dataset.itemId,
        text: row.querySelector('[data-item-text]').value.trim(),
        groupId: row.querySelector('[data-item-group]').value
      }))
    };
  }
  if (type === 'scenario') return { type: 'scenario' };
  return undefined;
}
function readTreasureStageCard(card, nextStageId) {
  const type = card.querySelector('[data-stage-mission]').value;
  const choice = type === 'multiple-choice' || type === 'scenario';
  const branch = card.querySelector('[data-stage-branch]').value;
  const correct = card.querySelector('[data-opt-correct]:checked');
  const mission = readTreasureMission(card);
  return {
    id: card.dataset.stageId,
    name: card.querySelector('[data-stage-name]').value.trim(),
    story: card.querySelector('[data-stage-story]').value.trim(),
    taskDescription: card.querySelector('[data-stage-task]').value.trim(),
    question: {
      prompt: card.querySelector('[data-stage-prompt]').value.trim(),
      options: choice ? $$('.treasure-option-row', card).map(row => ({ id: row.dataset.optId, text: row.querySelector('[data-opt-text]').value.trim() })) : [],
      correctOptionId: choice && correct ? correct.closest('.treasure-option-row').dataset.optId : '',
      explanation: card.querySelector('[data-stage-explanation]').value.trim(),
      hint: card.querySelector('[data-stage-hint]').value.trim(),
      ...readEditorItemAssets(card)
    },
    ...(mission ? { mission } : {}),
    attempts: Math.max(0, Number(card.querySelector('[data-stage-attempts]').value) || 0),
    points: Math.max(0, Number(card.querySelector('[data-stage-points]').value) || 100),
    completionBonus: Math.max(0, Number(card.querySelector('[data-stage-bonus]').value) || 200),
    nextStageId,
    ...(branch ? { branchLabel: card.querySelector('[data-stage-branch-label]').value.trim(), branchStageId: branch } : {}),
    hasHiddenItem: card.querySelector('[data-stage-item]').checked
  };
}

function bindTreasureEditor(root) {
  const list = $('#treasureStages', root);
  $('#addTreasureStageBtn', root).addEventListener('click', () => {
    list.insertAdjacentHTML('beforeend', newTreasureStageHtml($$('.treasure-stage-card', list).length));
    refreshTreasureUi(root);
  });
  list.addEventListener('input', e => {
    if (e.target.matches('[data-stage-name]')) refreshTreasureUi(root);
    if (e.target.matches('[data-group-name]')) refreshTreasureClassGroups(e.target.closest('.treasure-stage-card'));
  });
  list.addEventListener('change', e => {
    if (e.target.matches('[data-stage-next]')) {
      const card = e.target.closest('.treasure-stage-card');
      const tag = card.querySelector('[data-ending-tag]');
      if (tag) tag.classList.toggle('hidden', e.target.value !== '__ending__');
    }
    if (e.target.matches('[data-stage-mission]')) {
      refreshTreasureMissionUi(e.target.closest('.treasure-stage-card'));
    }
  });
  list.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const card = b.closest('.treasure-stage-card');
    if (b.matches('[data-ai-cancel]')) { editorCancelAi(); return; }
    if (b.matches('[data-ai-regenerate]')) { editorRegenerateItem(b); return; }
    if (b.matches('[data-stage-toggle]')) {
      const body = card.querySelector('.treasure-stage-body');
      body.classList.toggle('hidden');
      return;
    }
    if (b.matches('[data-stage-add-option]')) {
      const rows = $$('.treasure-option-row', card);
      const optId = String.fromCharCode(97 + rows.length);
      b.closest('.treasure-options').insertAdjacentHTML('beforeend',
        treasureOptionRow({ id: optId, text: '' }, card.dataset.stageId, null, rows.length));
      return;
    }
    if (b.matches('[data-opt-remove]')) { b.closest('.treasure-option-row').remove(); return; }
    if (b.matches('[data-add-pair]')) {
      const rows = $$('[data-match-pair]', card);
      card.querySelector('[data-match-pairs]').insertAdjacentHTML('beforeend', treasurePairRow({ id: newPanelId('pair'), left: '', right: '' }, rows.length));
      return;
    }
    if (b.matches('[data-pair-remove]')) { b.closest('[data-match-pair]').remove(); return; }
    if (b.matches('[data-add-group]')) {
      const rows = $$('[data-class-group-row]', card);
      card.querySelector('[data-class-groups]').insertAdjacentHTML('beforeend', treasureClassGroupRow({ id: newPanelId('group'), name: '' }, rows.length));
      refreshTreasureClassGroups(card);
      return;
    }
    if (b.matches('[data-group-remove]')) {
      const groups = $$('[data-class-group-row]', card);
      if (groups.length <= 1) return toast('Cần ít nhất một nhóm phân loại.');
      b.closest('[data-class-group-row]').remove();
      refreshTreasureClassGroups(card);
      return;
    }
    if (b.matches('[data-add-item]')) {
      const groups = $$('[data-class-group-row]', card).map(row => ({ id: row.dataset.groupId, name: row.querySelector('[data-group-name]').value.trim() }));
      if (!groups.length) return toast('Hãy thêm nhóm phân loại trước.');
      const rows = $$('[data-class-item-row]', card);
      card.querySelector('[data-class-items]').insertAdjacentHTML('beforeend', treasureClassItemRow({ id: newPanelId('item'), text: '', groupId: groups[0].id }, rows.length, groups));
      return;
    }
    if (b.matches('[data-item-remove]')) { b.closest('[data-class-item-row]').remove(); return; }
    if (b.matches('[data-stage-copy]')) {
      const copied = readTreasureStageCard(card, null);
      copied.id = newPanelId('stage');
      copied.name = `${copied.name || 'Chặng'} (bản sao)`;
      delete copied.branchLabel;
      delete copied.branchStageId;
      card.insertAdjacentHTML('afterend', treasureStageHtml(copied, $$('.treasure-stage-card', list).length));
      refreshTreasureUi(root);
      return;
    }
    if (b.matches('[data-stage-up]') && card.previousElementSibling) list.insertBefore(card, card.previousElementSibling);
    if (b.matches('[data-stage-down]') && card.nextElementSibling) list.insertBefore(card.nextElementSibling, card);
    if (b.matches('[data-stage-remove]')) {
      if ($$('.treasure-stage-card', list).length <= 1) return toast('Hành trình cần ít nhất một chặng.');
      card.remove();
    }
    refreshTreasureUi(root);
  });
  const syncThemePreview = () => {
    const slot = $('[data-treasure-preview-slot]', root);
    if (!slot) return;
    slot.innerHTML = treasureThemePreviewHtml(
      $('#treasureBackground', root).value,
      $('#treasureCharacterStyle', root).value
    );
  };
  $('#treasureBackground', root).addEventListener('change', syncThemePreview);
  $('#treasureCharacterStyle', root).addEventListener('change', syncThemePreview);
  refreshTreasureUi(root);
}
function readTreasureEditor(root) {
  const stages = $$('#treasureStages .treasure-stage-card', root).map(card => {
    const next = card.querySelector('[data-stage-next]').value;
    return readTreasureStageCard(card, next === '__ending__' ? null : next);
  });
  return {
    character: $('#treasureCharacter', root).value.trim() || 'Nhà thám hiểm',
    intro: $('#treasureIntro', root).value.trim(),
    journeyBonus: Math.max(0, Number($('#treasureJourneyBonus', root).value) || 300),
    hiddenItemBonus: Math.max(0, Number($('#treasureHiddenItemBonus', root).value) || 50),
    backgroundId: treasureBackgroundId($('#treasureBackground', root).value),
    characterId: treasureCharacterId($('#treasureCharacterStyle', root).value),
    stages
  };
}
function validateTreasureData(hunt) {
  if (hunt.stages.length < 2) return 'Hành trình cần ít nhất 2 chặng.';
  const ids = hunt.stages.map(s => s.id);
  if (new Set(ids).size !== ids.length) return 'Mỗi chặng đang có ID trùng lặp.';
  for (const s of hunt.stages) {
    if (!s.name) return 'Mỗi chặng cần có tên.';
    if (!s.question.prompt) return `Chặng “${s.name}” cần có nội dung câu đố hoặc lời dẫn nhiệm vụ.`;
    const type = s.mission?.type || 'multiple-choice';
    if (type === 'multiple-choice' || type === 'scenario') {
      if (s.question.options.length < 2 || s.question.options.some(o => !o.text)) return `Câu đố chặng “${s.name}” cần ít nhất 2 đáp án đầy đủ.`;
      if (new Set(s.question.options.map(o => o.id)).size !== s.question.options.length) return `Đáp án chặng “${s.name}” đang có ID trùng.`;
      if (!s.question.options.some(o => o.id === s.question.correctOptionId)) return `Chặng “${s.name}” chưa chọn đáp án đúng.`;
    } else if (type === 'matching') {
      const pairs = s.mission.pairs || [];
      if (pairs.length < 2 || pairs.length > 10) return `Chặng “${s.name}” cần từ 2 đến 10 cặp ghép.`;
      if (new Set(pairs.map(pair => pair.id)).size !== pairs.length) return `Cặp ghép chặng “${s.name}” đang có ID trùng.`;
      if (pairs.some(pair => !pair.left || !pair.right)) return `Mỗi cặp ghép của chặng “${s.name}” cần đủ hai vế.`;
    } else if (type === 'decode') {
      if (!s.mission.answer) return `Chặng “${s.name}” cần đáp án giải mã.`;
    } else if (type === 'classification') {
      const groups = s.mission.groups || [];
      const items = s.mission.items || [];
      if (groups.length < 2 || groups.length > 4) return `Chặng “${s.name}” cần từ 2 đến 4 nhóm phân loại.`;
      if (items.length < 2 || items.length > 12) return `Chặng “${s.name}” cần từ 2 đến 12 mục phân loại.`;
      if (new Set(groups.map(group => group.id)).size !== groups.length) return `Nhóm phân loại chặng “${s.name}” đang có ID trùng.`;
      if (new Set(items.map(item => item.id)).size !== items.length) return `Mục phân loại chặng “${s.name}” đang có ID trùng.`;
      if (groups.some(group => !group.name)) return `Mỗi nhóm phân loại của chặng “${s.name}” cần có tên.`;
      if (items.some(item => !item.text || !groups.some(group => group.id === item.groupId))) return `Mỗi mục phân loại của chặng “${s.name}” cần nội dung và nhóm hợp lệ.`;
    }
    if (s.nextStageId !== null && !ids.includes(s.nextStageId)) return `Chặng “${s.name}” trỏ tới chặng không tồn tại.`;
    if (s.branchStageId && (!s.branchLabel || s.branchStageId === s.id || !ids.includes(s.branchStageId))) return `Nhánh phụ của chặng “${s.name}” không hợp lệ (cần nhãn và đích khác chính nó).`;
  }
  if (!hunt.stages.some(s => s.nextStageId === null)) return 'Cần ít nhất một chặng đánh dấu “Kết thúc tại đây”.';
  return null;
}
