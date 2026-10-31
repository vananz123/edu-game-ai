// @ts-nocheck -- editor/race.ts — panel soạn Đường đua tri thức: đội, ô đặc biệt, ngân hàng câu hỏi, xem trước và kiểm dữ liệu (split từ features/game-editor.ts, DECISIONS #150).
const EDITOR_CELL_ICON = { boost: '⚡', penalty: '🪨', lucky: '🎁', challenge: '⚔️' };
/** #131: default team colours, dark enough for white text on top. */
const EDITOR_TEAM_COLORS = ['#2563eb', '#dc2626', '#059669', '#7c3aed', '#d97706', '#0891b2'];
const EDITOR_CELL_NAME = { boost: 'Tăng tốc', penalty: 'Chướng ngại', lucky: 'May mắn', challenge: 'Thử thách' };
let racePreviewTheme = 'editor';

function defaultRaceData() {
  return {
    trackLength: 12,
    maxRounds: 6,
    stepByDifficulty: true,
    luckEnabled: false,
    teams: [
      { id: 't1', name: 'Đội A', icon: '🏎️' },
      { id: 't2', name: 'Đội B', icon: '🚀' }
    ],
    cells: [{ cell: 6, type: 'boost', label: 'Tăng tốc' }],
    questions: [
      {
        id: 'rq1', prompt: 'Nhập câu hỏi ôn tập cho đường đua tại đây',
        options: [{ id: 'a', text: 'Đáp án A' }, { id: 'b', text: 'Đáp án B' }, { id: 'c', text: 'Đáp án C' }],
        correctOptionId: 'a', explanation: 'Giải thích đáp án.', difficulty: 'trung bình'
      }
    ]
  };
}
function raceTeamRow(team, index) {
  // #131: the colour was never editable (the editor only kept id/name/icon), so every
  // team fell back to the same default and the name could sit on a background of the same
  // tone. A colour picker per team makes it the teacher's choice and stores it.
  const color = /^#[0-9a-f]{6}$/iu.test(String((team && team.color) || '')) ? String(team.color) : EDITOR_TEAM_COLORS[index % EDITOR_TEAM_COLORS.length];
  return `<div class="race-team-row" data-team-id="${escapeHtml(team.id || `t${index + 1}`)}" style="--team-color:${escapeHtml(color)}">
    <span class="drag-handle" draggable="true" data-team-drag title="Kéo để sắp xếp đội">⠿</span>
    <input data-team-icon value="${escapeHtml(team.icon || '🏎️')}" class="w-[60px]" placeholder="🏎️" title="Biểu tượng đội">
    <input data-team-color type="color" value="${escapeHtml(color)}" class="race-team-color" title="Màu của đội">
    <input data-team-name value="${escapeHtml(team.name || '')}" placeholder="Tên đội ${index + 1}">
    <button type="button" class="text-link" data-team-up>↑</button>
    <button type="button" class="text-link" data-team-down>↓</button>
    <button type="button" class="text-link danger-text" data-team-remove>✕</button>
  </div>`;
}
function raceCellRow(cell, index) {
  const types = [['boost', 'Tăng tốc (+1 ô)'], ['penalty', 'Chướng ngại (−1 ô)'], ['lucky', 'May mắn (+1 ô)'], ['challenge', 'Thử thách (đúng +2 · sai −1 ô)']];
  return `<div class="race-team-row" data-cell-row>
    <span class="drag-handle" draggable="true" data-cell-drag title="Kéo lên đường đua để đổi vị trí">⠿</span>
    <input data-cell-number type="number" min="2" max="100" value="${Number(cell.cell) || 2 + index}" class="w-[74px]" title="Số ô">
    <select data-cell-type class="w-auto">${types.map(([v, l]) => `<option value="${v}" ${cell.type === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <input data-cell-label value="${escapeHtml(cell.label || '')}" placeholder="Nhãn hiển thị (không bắt buộc)">
    <button type="button" class="text-link danger-text" data-cell-remove>✕</button>
  </div>`;
}
function raceQuestionOptionRow(option, qid, correctId, index) {
  return `<div class="treasure-option-row" data-opt-id="${escapeHtml(option.id || `o${index + 1}`)}">
    <input data-opt-text value="${escapeHtml(option.text || '')}" placeholder="Đáp án ${index + 1}">
    <label class="opt-correct"><input type="radio" name="race-correct-${escapeHtml(qid)}" data-opt-correct ${option.id === correctId ? 'checked' : ''}> Đúng</label>
    <button type="button" class="text-link danger-text" data-opt-remove>✕</button>
  </div>`;
}
function raceQuestionCard(q, index) {
  const options = q.options || [];
  return `<div class="editor-question race-question-card" data-race-q-id="${escapeHtml(q.id || `rq${index + 1}`)}">
    <div class="editor-question-head"><span class="drag-handle" draggable="true" data-rq-drag title="Kéo để sắp xếp câu hỏi">⠿</span><strong>CÂU ${index + 1}</strong>
      <select data-rq-difficulty class="w-auto"><option value="dễ" ${q.difficulty === 'dễ' ? 'selected' : ''}>Dễ (+1 ô)</option><option value="trung bình" ${!q.difficulty || q.difficulty === 'trung bình' ? 'selected' : ''}>Trung bình (+2 ô)</option><option value="khó" ${q.difficulty === 'khó' ? 'selected' : ''}>Khó (+3 ô)</option></select>
      ${editorAiButton(q.id)}
      <button type="button" class="text-link" data-rq-copy>⧉ Nhân bản</button>
      <button type="button" class="text-link danger-text" data-rq-remove>✕ Xóa</button>
    </div>
    <textarea data-rq-prompt rows="2" placeholder="Nội dung câu hỏi">${escapeHtml(q.prompt || '')}</textarea>
    ${editorAssetFieldsHtml(q)}${editorItemArtHtml(q)}
    <div class="treasure-options" data-rq-options>${options.map((o, j) => raceQuestionOptionRow(o, q.id, q.correctOptionId, j)).join('')}<button type="button" class="btn btn-secondary btn-small" data-rq-add-option>＋ Thêm đáp án</button></div>
    <textarea data-rq-explanation rows="2" placeholder="Giải thích đáp án">${escapeHtml(q.explanation || '')}</textarea>
  </div>`;
}
function raceEditorHtml(race) {
  const r = race || defaultRaceData();
  return `<div id="raceEditor" class="hidden">
    <div class="section-head"><h3>Đường đua tri thức</h3></div>
    <div class="field-row">
      <div class="field"><label>CHIỀU DÀI ĐƯỜNG ĐUA (Ô)</label><input id="raceTrackLength" type="number" min="3" max="100" value="${r.trackLength}"></div>
      <div class="field"><label>SỐ VÒNG TỐI ĐA</label><input id="raceMaxRounds" type="number" min="1" max="50" value="${r.maxRounds}"></div>
    </div>
    <div class="correct-select flex gap-[18px] flex-wrap">
      <label><input type="checkbox" id="raceStepByDifficulty" ${r.stepByDifficulty ? 'checked' : ''}> Tiến theo độ khó (dễ +1 · trung bình +2 · khó +3 ô)</label>
      <label><input type="checkbox" id="raceLuckEnabled" ${r.luckEnabled ? 'checked' : ''}> Bật ô may mắn</label>
    </div>
    <div class="section-head mt-[12px]"><h3>Đội chơi <span class="tag" id="raceTeamCount">${r.teams.length}</span></h3><div><button type="button" class="btn btn-secondary btn-small" id="addRaceTeamBtn">＋ Thêm đội</button></div></div>
    <div id="raceTeams">${r.teams.map((t, i) => raceTeamRow(t, i)).join('')}</div>
    <div class="section-head mt-[12px]"><h3>Ô đặc biệt <span class="tag" id="raceCellCount">${r.cells.length}</span></h3><div><button type="button" class="btn btn-secondary btn-small" id="addRaceCellBtn">＋ Thêm ô đặc biệt</button></div></div>
    <p class="field-hint">Ô 1 là vạch xuất phát; ô có số bằng chiều dài đường đua là đích. Boost +1 · Chướng ngại −1 · May mắn +1 (chỉ khi bật may mắn) · Thử thách: đúng +2, sai −1. Kéo chip hiệu ứng ở phần “Xem trước đường đua” vào một ô để thêm nhanh.</p>
    <div id="raceCells">${r.cells.map((c, i) => raceCellRow(c, i)).join('')}</div>
    <div class="section-head mt-[12px]"><h3>Xem trước đường đua</h3><div><button type="button" class="btn btn-secondary btn-small" id="racePreviewTheme">🕹️ Xem như lúc chơi</button></div></div>
    <div id="raceTrackPreview" class="editor-race-preview" data-preview-theme="editor"></div>
    <div class="section-head mt-[12px]"><h3>Ngân hàng câu hỏi <span class="tag" id="raceQuestionCount">${r.questions.length}</span></h3><div><button type="button" class="btn btn-secondary btn-small" id="addRaceQuestionBtn">＋ Thêm câu hỏi</button></div></div>
    <p class="field-hint">Câu hỏi được bốc ngẫu nhiên theo lượt; độ khó quyết định số ô tiến (khi bật “Tiến theo độ khó”). Kéo biểu tượng ⠿ để sắp xếp thứ tự câu.</p>
    <div id="raceQuestions">${r.questions.map((q, i) => raceQuestionCard(q, i)).join('')}</div>
  </div>`;
}
function bindRaceEditor(root) {
  const teams = $('#raceTeams', root), cells = $('#raceCells', root), questions = $('#raceQuestions', root);
  $('#addRaceTeamBtn', root).addEventListener('click', () => {
    teams.insertAdjacentHTML('beforeend', raceTeamRow({ id: newPanelId('team'), name: '', icon: '🏎️' }, $$('.race-team-row', teams).length));
    $('#raceTeamCount', root).textContent = String($$('.race-team-row', teams).length);
    renderRaceTrackPreview(root);
  });
  $('#addRaceCellBtn', root).addEventListener('click', () => {
    cells.insertAdjacentHTML('beforeend', raceCellRow({ cell: 2, type: 'boost', label: '' }, $$('.race-team-row', cells).length));
    $('#raceCellCount', root).textContent = String($$('.race-team-row', cells).length);
    renderRaceTrackPreview(root);
  });
  $('#addRaceQuestionBtn', root).addEventListener('click', () => {
    questions.insertAdjacentHTML('beforeend', raceQuestionCard({
      id: newPanelId('rq'), prompt: '', options: [{ id: 'a', text: '' }, { id: 'b', text: '' }], correctOptionId: 'a', explanation: '', difficulty: 'trung bình'
    }, $$('.race-question-card', questions).length));
    // #131: a card inserted after the editor was wired has no listeners — its picture
    // upload silently did nothing. Wire the new card now.
    wireEditorItemArt(questions.lastElementChild);
    renumberRaceQuestions(root);
  });
  teams.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const row = b.closest('.race-team-row');
    if (b.matches('[data-team-remove]')) row.remove();
    if (b.matches('[data-team-up]') && row.previousElementSibling) teams.insertBefore(row, row.previousElementSibling);
    if (b.matches('[data-team-down]') && row.nextElementSibling) teams.insertBefore(row.nextElementSibling, row);
    $('#raceTeamCount', root).textContent = String($$('.race-team-row', teams).length);
  });
  cells.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || !b.matches('[data-cell-remove]')) return;
    b.closest('.race-team-row').remove();
    $('#raceCellCount', root).textContent = String($$('.race-team-row', cells).length);
    renderRaceTrackPreview(root);
  });
  questions.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const card = b.closest('.race-question-card');
    if (b.matches('[data-ai-cancel]')) { editorCancelAi(); return; }
    if (b.matches('[data-ai-regenerate]')) { editorRegenerateItem(b); return; }
    if (b.matches('[data-rq-add-option]')) {
      const rows = $$('.treasure-option-row', card);
      b.closest('[data-rq-options]').insertAdjacentHTML('beforeend',
        raceQuestionOptionRow({ id: String.fromCharCode(97 + rows.length), text: '' }, card.dataset.raceQId, null, rows.length));
      return;
    }
    if (b.matches('[data-opt-remove]')) { b.closest('.treasure-option-row').remove(); return; }
    if (b.matches('[data-rq-remove]')) {
      if ($$('.race-question-card', questions).length <= 1) return toast('Ngân hàng cần ít nhất 1 câu hỏi.');
      card.remove();
      renumberRaceQuestions(root);
      return;
    }
    if (b.matches('[data-rq-copy]')) {
      const html = raceQuestionCard({
        id: newPanelId('rq'),
        prompt: card.querySelector('[data-rq-prompt]').value,
        options: $$('.treasure-option-row', card).map(row => ({ id: row.dataset.optId, text: row.querySelector('[data-opt-text]').value })),
        correctOptionId: card.querySelector('[data-opt-correct]:checked')?.closest('.treasure-option-row')?.dataset.optId || 'a',
        explanation: card.querySelector('[data-rq-explanation]').value,
        difficulty: card.querySelector('[data-rq-difficulty]').value,
        ...readEditorItemAssets(card)
      }, $$('.race-question-card', questions).length);
      card.insertAdjacentHTML('afterend', html);
      // #131: the copy is new DOM, so its picture control needs binding too.
      wireEditorItemArt(card.nextElementSibling);
      renumberRaceQuestions(root);
    }
  });
  bindRacePreview(root);
}
function bindRacePreview(root) {
  const preview = $('#raceTrackPreview', root);
  const cells = $('#raceCells', root);
  const teams = $('#raceTeams', root);
  if (!preview) return;
  racePreviewTheme = 'editor';
  const themeBtn = $('#racePreviewTheme', root);
  if (themeBtn) {
    themeBtn.textContent = '🕹️ Xem như lúc chơi';
    themeBtn.addEventListener('click', () => {
      racePreviewTheme = racePreviewTheme === 'editor' ? 'play' : 'editor';
      preview.dataset.previewTheme = racePreviewTheme;
      themeBtn.textContent = racePreviewTheme === 'play' ? '📝 Xem kiểu soạn thảo' : '🕹️ Xem như lúc chơi';
    });
  }
  // Kéo-thả chip hiệu ứng vào một ô, hoặc kéo row ô đặc biệt sang ô khác.
  preview.addEventListener('dragstart', event => {
    const chip = event.target.closest('[data-effect-type]');
    if (chip) beginDrag(event, chip, 'effect-type', chip.dataset.effectType);
  });
  preview.addEventListener('dragover', event => {
    if (!dragState) return;
    const cell = event.target.closest('[data-track-cell]');
    if (!cell) return;
    event.preventDefault();
    clearDropHighlights(preview);
    cell.classList.add('drag-over');
  });
  preview.addEventListener('dragleave', event => {
    if (!preview.contains(event.relatedTarget)) clearDropHighlights(preview);
  });
  preview.addEventListener('drop', event => {
    const cell = event.target.closest('[data-track-cell]');
    if (!dragState || !cell) return;
    event.preventDefault();
    const cellNumber = Number(cell.dataset.trackNum);
    const dragged = dragState.element;
    const dragKind = dragState.kind;
    const dragValue = dragState.value;
    const isCellRow = !!(dragged && dragged.matches && dragged.matches('[data-cell-row]'));
    clearDropHighlights(preview);
    // KHÔNG cho ô số 1 (vạch xuất phát) mang hiệu ứng.
    if (!(cellNumber >= 2)) {
      endDrag(preview);
      toast('Ô 1 là vạch xuất phát, không thể đặt hiệu ứng.');
      return;
    }
    if (dragKind === 'effect-type') placeRaceEffect(root, cellNumber, dragValue);
    else if (isCellRow) moveRaceCellRow(root, dragged, cellNumber);
    endDrag(preview);
  });
  preview.addEventListener('dragend', () => endDrag(preview));
  // #131: an effect placed by dragging could only be removed by finding the matching row
  // far below — so clicking a cell with an effect removes it. Clicking an empty cell
  // (or the start/finish) explains why nothing happens instead of staying silent.
  preview.addEventListener('click', event => {
    const cell = event.target.closest('[data-track-cell]');
    if (!cell) return;
    const cellNumber = Number(cell.dataset.trackNum);
    const row = $$('#raceCells [data-cell-row]', root)
      .find(candidate => Number(candidate.querySelector('[data-cell-number]').value) === cellNumber);
    if (!row) {
      if (!(cellNumber >= 2)) toast('Ô 1 là vạch xuất phát, không có hiệu ứng để xoá.');
      return;
    }
    row.remove();
    const count = $('#raceCellCount', root);
    if (count) count.textContent = String($$('#raceCells [data-cell-row]', root).length);
    renderRaceTrackPreview(root);
    toast(`Đã xoá hiệu ứng ở ô ${cellNumber}.`);
  });

  // Re-render preview khi thầy/cô sửa tay (không đụng tới các <input> đang gõ).
  if (cells) {
    cells.addEventListener('input', () => renderRaceTrackPreview(root));
    cells.addEventListener('change', () => renderRaceTrackPreview(root));
  }
  if (teams) teams.addEventListener('input', () => renderRaceTrackPreview(root));
  $('#raceTrackLength', root).addEventListener('input', () => renderRaceTrackPreview(root));
  $('#raceLuckEnabled', root).addEventListener('change', () => renderRaceTrackPreview(root));

  bindDragList(teams, '.race-team-row', () => renderRaceTrackPreview(root));
  bindDragList(cells, '[data-cell-row]');
  bindDragList($('#raceQuestions', root), '.race-question-card', () => renumberRaceQuestions(root));

  renderRaceTrackPreview(root);
}
function raceCellMapFromEditor(root) {
  const map = {};
  $$('#raceCells [data-cell-row]', root).forEach(row => {
    const cellNumber = Number(row.querySelector('[data-cell-number]').value);
    if (!(cellNumber >= 2)) return;
    if (map[cellNumber]) return; // ô trùng số: hiệu ứng đầu tiên thắng, validator sẽ chặn khi lưu
    map[cellNumber] = {
      cell: cellNumber,
      type: row.querySelector('[data-cell-type]').value,
      label: row.querySelector('[data-cell-label]').value.trim()
    };
  });
  return map;
}
function renderRaceTrackPreview(root) {
  const host = $('#raceTrackPreview', root);
  if (!host) return;
  const trackLength = Math.min(100, Math.max(3, Number($('#raceTrackLength', root).value) || 12));
  const luckEnabled = $('#raceLuckEnabled', root).checked;
  const teamIcons = $$('#raceTeams .race-team-row', root).map(row => row.querySelector('[data-team-icon]').value.trim() || '🏎️');
  const map = raceCellMapFromEditor(root);
  const palette = ['boost', 'penalty', 'lucky', 'challenge'].map(type =>
    `<button type="button" class="btn btn-secondary btn-small race-effect-chip" data-effect-type="${type}" draggable="true" title="Kéo vào ô trên đường đua để thêm hiệu ứng">${EDITOR_CELL_ICON[type]} ${EDITOR_CELL_NAME[type]}</button>`
  ).join('');
  const track = Array.from({ length: trackLength }, (_, i) => {
    const n = i + 1;
    const effect = map[n];
    const dimmed = effect && effect.type === 'lucky' && !luckEnabled ? ' data-dimmed="1"' : '';
    const title = effect
      ? `${EDITOR_CELL_NAME[effect.type] || effect.type}${effect.label ? ' — ' + effect.label : ''} (ô ${n})`
      : `Ô ${n}`;
    const marker = n === 1 ? '<span class="race-cell-icon">🚩</span>' : (n === trackLength ? '<span class="race-cell-icon">🏁</span>' : `<span class="race-cell-icon">${effect ? EDITOR_CELL_ICON[effect.type] || '' : ''}</span>`);
    const tokens = n === 1 && teamIcons.length ? `<span class="race-tokens">${teamIcons.map(escapeHtml).join(' ')}</span>` : '';
    return `<div class="race-cell ${effect ? `race-cell-${effect.type}` : ''}" data-track-cell data-track-num="${n}" title="${escapeHtml(title)}"${dimmed}><span class="race-cell-num">${n}</span>${marker}${tokens}</div>`;
  }).join('');
  const outOfRange = Object.values(map).filter(effect => effect.cell > trackLength).map(effect => effect.cell).sort((a, b) => a - b);
  const warn = outOfRange.length
    ? `<p class="field-hint danger-text">Có ${outOfRange.length} hiệu ứng nằm ngoài đường đua (2–${trackLength}): ô ${outOfRange.join(', ')}. Hãy sửa số ô hoặc tăng “Chiều dài đường đua”.</p>`
    : '';
  const luckHint = !luckEnabled && Object.values(map).some(effect => effect.type === 'lucky')
    ? '<p class="field-hint">Ô may mắn đang mờ vì chưa bật “Bật ô may mắn”.</p>'
    : '';
  host.innerHTML = `<div class="race-palette" data-effect-palette>${palette}</div>
    <p class="field-hint">Kéo một loại hiệu ứng vào ô trên đường đua để thêm; kéo ô ⠿ của bảng “Ô đặc biệt” lên đường đua để đổi vị trí.</p>
    <div class="race-track is-preview">${track}</div>
    ${warn}${luckHint}`;
  host.dataset.previewTheme = racePreviewTheme;
}
function placeRaceEffect(root, cellNumber, type) {
  if (!EDITOR_CELL_NAME[type]) return;
  const cells = $('#raceCells', root);
  const duplicate = $$('#raceCells [data-cell-row]', root)
    .find(row => Number(row.querySelector('[data-cell-number]').value) === cellNumber);
  if (duplicate) {
    toast(`Ô ${cellNumber} đã có hiệu ứng. Hãy sửa ô hiện có hoặc chọn ô khác.`);
    return;
  }
  cells.insertAdjacentHTML('beforeend', raceCellRow({ cell: cellNumber, type, label: '' }, $$('[data-cell-row]', cells).length));
  const count = $('#raceCellCount', root);
  if (count) count.textContent = String($$('[data-cell-row]', cells).length);
  renderRaceTrackPreview(root);
  toast(`Đã thêm hiệu ứng ${EDITOR_CELL_NAME[type]} vào ô ${cellNumber}.`);
}
function moveRaceCellRow(root, row, cellNumber) {
  if (!row || !row.closest('#raceCells')) return;
  const conflict = $$('#raceCells [data-cell-row]', root)
    .find(other => other !== row && Number(other.querySelector('[data-cell-number]').value) === cellNumber);
  if (conflict) {
    toast(`Ô ${cellNumber} đã có hiệu ứng.`);
    return;
  }
  row.querySelector('[data-cell-number]').value = cellNumber;
  renderRaceTrackPreview(root);
}
function renumberRaceQuestions(root) {
  $$('#raceQuestions .race-question-card', root).forEach((card, i) => {
    const head = card.querySelector('.editor-question-head strong');
    if (head) head.textContent = `CÂU ${i + 1}`;
  });
  const count = $('#raceQuestionCount', root);
  if (count) count.textContent = String($$('#raceQuestions .race-question-card', root).length);
}
function readRaceEditor(root) {
  return {
    trackLength: Math.min(100, Math.max(3, Number($('#raceTrackLength', root).value) || 12)),
    maxRounds: Math.min(50, Math.max(1, Number($('#raceMaxRounds', root).value) || 6)),
    stepByDifficulty: $('#raceStepByDifficulty', root).checked,
    luckEnabled: $('#raceLuckEnabled', root).checked,
    teams: $$('#raceTeams .race-team-row', root).map((row, i) => ({
      id: row.dataset.teamId || `t${i + 1}`,
      name: row.querySelector('[data-team-name]').value.trim(),
      icon: row.querySelector('[data-team-icon]').value.trim() || '🏎️',
      // #131: keep the teacher's colour (normalised; a broken value falls back to the
      // default the row was created with).
      color: /^#[0-9a-f]{6}$/iu.test(row.querySelector('[data-team-color]') ? row.querySelector('[data-team-color]').value : '')
        ? String(row.querySelector('[data-team-color]').value).toLowerCase()
        : EDITOR_TEAM_COLORS[i % EDITOR_TEAM_COLORS.length]
    })),
    cells: $$('#raceCells .race-team-row', root).map(row => ({
      cell: Number(row.querySelector('[data-cell-number]').value) || 2,
      type: row.querySelector('[data-cell-type]').value,
      label: row.querySelector('[data-cell-label]').value.trim()
    })),
    questions: $$('#raceQuestions .race-question-card', root).map(card => {
      const correct = card.querySelector('[data-opt-correct]:checked');
      return {
        id: card.dataset.raceQId,
        prompt: card.querySelector('[data-rq-prompt]').value.trim(),
        options: $$('.treasure-option-row', card).map(row => ({ id: row.dataset.optId, text: row.querySelector('[data-opt-text]').value.trim() })),
        correctOptionId: correct ? correct.closest('.treasure-option-row').dataset.optId : '',
        explanation: card.querySelector('[data-rq-explanation]').value.trim(),
        difficulty: card.querySelector('[data-rq-difficulty]').value,
        ...readEditorItemAssets(card)
      };
    })
  };
}
function validateRaceData(race) {
  if (race.teams.length < 2) return 'Đường đua cần ít nhất 2 đội.';
  if (race.teams.some(t => !t.name)) return 'Mỗi đội cần có tên.';
  if (new Set(race.teams.map(t => t.name.toLowerCase())).size !== race.teams.length) return 'Tên các đội đang trùng nhau.';
  if (new Set(race.teams.map(t => t.id)).size !== race.teams.length) return 'Mỗi đội cần ID riêng.';
  if (new Set(race.cells.map(c => c.cell)).size !== race.cells.length) return 'Đang có nhiều hiệu ứng trên cùng một ô.';
  if (race.cells.some(c => c.cell < 2 || c.cell > race.trackLength)) return `Ô đặc biệt phải trong khoảng 2–${race.trackLength}.`;
  if (race.questions.length < 1) return 'Ngân hàng câu hỏi cần ít nhất 1 câu.';
  for (const q of race.questions) {
    if (!q.prompt) return 'Mỗi câu hỏi đường đua cần có nội dung.';
    if (q.options.length < 2 || q.options.some(o => !o.text)) return `Câu hỏi “${q.prompt.slice(0, 30)}…” cần ít nhất 2 đáp án đầy đủ.`;
    if (!q.options.some(o => o.id === q.correctOptionId)) return `Câu hỏi “${q.prompt.slice(0, 30)}…” chưa chọn đáp án đúng.`;
  }
  return null;
}
