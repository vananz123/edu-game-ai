// @ts-nocheck -- editor/matching.ts — panel soạn trò ghép cặp và bật/tắt các khối theo mẫu trò chơi (split từ features/game-editor.ts, DECISIONS #150).
function defaultMatchingGame() {
  return {
    mode: 'columns',
    pairs: [
      { id: 'p1', left: 'Thuật ngữ A', right: 'Định nghĩa A' },
      { id: 'p2', left: 'Thuật ngữ B', right: 'Định nghĩa B' }
    ],
    pointsPerPair: 100,
    completionBonus: 200,
    wrongPenalty: 0,
    timeBonus: 50,
    bonusUnderSeconds: 60,
    practiceMode: false
  };
}
function matchingPairRow(pair, index) {
  return `<div class="matching-pair-row" data-pair-id="${escapeHtml(pair.id || `p${index + 1}`)}">
    <span class="drag-handle" draggable="true" data-pair-drag title="Kéo để sắp xếp cặp">⠿</span>
    <input data-pair-left value="${escapeHtml(pair.left || '')}" placeholder="Thuật ngữ / nội dung cột A">
    <input data-pair-right value="${escapeHtml(pair.right || '')}" placeholder="Định nghĩa / nội dung cột B">
    ${editorAssetFieldsHtml(pair, { compact: true })}
    ${editorAiButton(pair.id)}
    <button type="button" class="text-link" data-pair-up title="Lên">${uiIcon('arrow-up', '', 14)}</button>
    <button type="button" class="text-link" data-pair-down title="Xuống">${uiIcon('arrow-down', '', 14)}</button>
    <button type="button" class="text-link danger-text" data-pair-remove>${uiIcon('x', '', 14)}</button>
  </div>`;
}
function matchingEditorHtml(matching) {
  const m = matching || defaultMatchingGame();
  return `<div id="matchingEditor" class="hidden">
    <div class="section-head"><h3>Cặp ghép kiến thức <span class="tag" id="matchingPairCount">${m.pairs.length}</span></h3><div><button type="button" class="btn btn-secondary btn-small" id="addMatchingPairBtn">${uiIcon('plus', '', 13)} Thêm cặp</button></div></div>
    <p class="field-hint">Mỗi dòng gồm nội dung cột A và nội dung tương ứng ở cột B. Kéo biểu tượng ⠿ để sắp xếp lại thứ tự cặp (hoặc dùng nút mũi tên). Ghép đúng: cộng điểm từng cặp; hoàn thành tất cả: cộng thưởng; sai: chỉ trừ điểm khi giáo viên đặt “Phạt mỗi lần sai” lớn hơn 0.</p>
    <div id="matchingPairs">${m.pairs.map((pair, i) => matchingPairRow(pair, i)).join('')}</div>
    <div class="field-row mt-[12px]">
      <div class="field"><label>CÁCH CHƠI</label><select id="matchingMode">
        <option value="columns" ${m.mode === 'columns' ? 'selected' : ''}>Ghép hai cột</option>
        <option value="memory" ${m.mode === 'memory' ? 'selected' : ''}>Lật thẻ ghi nhớ</option>
        <option value="categorize" ${m.mode === 'categorize' ? 'selected' : ''}>Phân loại kiến thức</option>
        <option value="connection" ${m.mode === 'connection' ? 'selected' : ''}>${CONSTELLATION_GAME_NAME} — kéo thẻ vào đúng ngôi sao</option>
      </select></div>
      <div class="field"><label>ĐIỂM MỖI CẶP</label><input id="matchingPointsPerPair" type="number" min="0" max="1000" value="${Number(m.pointsPerPair) || 100}"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>THƯỞNG HOÀN THÀNH</label><input id="matchingCompletionBonus" type="number" min="0" max="10000" value="${Number(m.completionBonus) || 0}"></div>
      <div class="field"><label>PHẠT MỖI LẦN SAI</label><input id="matchingWrongPenalty" type="number" min="0" max="1000" value="${Number(m.wrongPenalty) || 0}"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>THƯỞNG THỜI GIAN</label><input id="matchingTimeBonus" type="number" min="0" max="10000" value="${Number(m.timeBonus) || 0}"></div>
      <div class="field"><label>HOÀN THÀNH TRONG (GIÂY)</label><input id="matchingBonusUnderSeconds" type="number" min="0" max="86400" value="${Number(m.bonusUnderSeconds) || 0}"></div>
    </div>
    <div class="correct-select"><label><input type="checkbox" id="matchingPracticeMode" ${m.practiceMode ? 'checked' : ''}> Chế độ luyện tập — hiển thị gợi ý, không trừ điểm</label></div>
    <div class="field connection-field${m.mode === 'connection' ? '' : ' hidden'}" data-connection-field>
      <label>CHÒM SAO</label>
      ${constellationPreviewHtml(constellationResolve(m.connectionTemplate).id)}
      ${constellationGalleryHtml(constellationResolve(m.connectionTemplate).id, 'matchingConnectionTemplate')}
      <div class="field connection-direction">
        <label>CHIỀU KÉO</label>
        <select id="matchingDragDirection">
          ${CONSTELLATION_DRAG_DIRECTIONS.map(value => `<option value="${value}"${value === constellationResolveDragDirection(m.dragDirection) ? ' selected' : ''}>${escapeHtml(CONSTELLATION_DRAG_LABELS[value])}</option>`).join('')}
        </select>
      </div>
      <p class="field-hint">Chỉ dùng ở cách chơi ${CONSTELLATION_GAME_NAME}. Sao đích mang một vế của cặp, thẻ kéo mang vế còn lại; ghép đúng thắp sáng thêm một sao, ghép sai không gỡ sao đã sáng.</p>
    </div>
    <p class="field-hint" id="matchingModeHint"></p>
  </div>`;
}
function matchingModeHint(mode) {
  return ({
    columns: 'Ghép hai cột: chọn một mục ở cột A rồi chọn mục tương ứng ở cột B. Phù hợp bài học nhiều khái niệm.',
    memory: 'Lật thẻ ghi nhớ: lật từng thẻ để tìm hai nội dung tương ứng. Phù hợp ghi nhớ từ vựng và thuật ngữ.',
    categorize: 'Phân loại kiến thức: nội dung cột A là nhóm, nội dung cột B là các thẻ cần đưa vào đúng nhóm.',
    // #171: no BETA disclaimer any more — the hint explains the interaction.
    connection: `${CONSTELLATION_GAME_NAME}: bảng thẻ được giữ nguyên làm nội dung, còn màn chơi dựng một chòm sao 3D — kéo thẻ vào đúng sao để thắp sáng từng ngôi sao và nối các đường sao. Phù hợp hệ thống hoá kiến thức.`
  })[mode] || '';
}
function bindMatchingEditor(root) {
  const list = $('#matchingPairs', root);
  const refreshCount = () => {
    const count = $$('.matching-pair-row', list).length;
    const tag = $('#matchingPairCount', root);
    if (tag) tag.textContent = String(count);
  };
  const syncHints = () => {
    const value = $('#matchingMode', root).value;
    const hint = $('#matchingModeHint', root);
    if (hint) hint.textContent = matchingModeHint(value);
    // #168: the template gallery belongs to the connection style only; the
    // radios stay in the DOM so switching styles never loses the pick.
    const field = $('[data-connection-field]', root);
    if (field) field.classList.toggle('hidden', value !== 'connection');
  };
  $('#addMatchingPairBtn', root).addEventListener('click', () => {
    list.insertAdjacentHTML('beforeend', matchingPairRow({ id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }, $$('.matching-pair-row', list).length));
    refreshCount();
  });
  list.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const row = b.closest('.matching-pair-row');
    if (b.matches('[data-ai-cancel]')) { editorCancelAi(); return; }
    if (b.matches('[data-ai-regenerate]')) { editorRegenerateItem(b); return; }
    if (b.matches('[data-pair-remove]')) { row.remove(); refreshCount(); return; }
    if (b.matches('[data-pair-up]') && row.previousElementSibling) list.insertBefore(row, row.previousElementSibling);
    if (b.matches('[data-pair-down]') && row.nextElementSibling) list.insertBefore(row.nextElementSibling, row);
  });
  $('#matchingMode', root).addEventListener('change', syncHints);
  // #168: picking a template redraws the preview and the selected card in place.
  root.querySelector('[data-connection-field]')?.addEventListener('change', event => {
    const card = event.target.closest('[data-connection-template]');
    if (!card) return;
    card.closest('[data-connection-gallery]')?.querySelectorAll('[data-connection-template]')
      .forEach(node => node.classList.toggle('is-selected', node === card));
    const preview = $('[data-connection-field] [data-connection-preview]', root);
    if (preview) preview.outerHTML = constellationPreviewHtml(event.target.value);
  });
  bindDragList(list, '.matching-pair-row');
  syncHints();
}
function readMatchingEditor(root) {
  const pairs = $$('#matchingPairs .matching-pair-row', root).map((row, index) => ({
    id: row.dataset.pairId || `p${index + 1}`,
    left: row.querySelector('[data-pair-left]').value.trim(),
    right: row.querySelector('[data-pair-right]').value.trim(),
    ...readEditorItemAssets(row)
  }));
  const mode = $('#matchingMode', root).value;
  return {
    mode,
    // #168/#171: the constellation and the drag direction ride on the board and
    // only with the style that reads them, mirroring the adapter:
    // columns/memory/categorize never carry a stale choice.
    ...(mode === 'connection' ? {
      connectionTemplate: readConstellationGallery(root, 'matchingConnectionTemplate'),
      dragDirection: constellationResolveDragDirection($('#matchingDragDirection', root)?.value)
    } : {}),
    pairs,
    pointsPerPair: Math.max(0, Number($('#matchingPointsPerPair', root).value) || 100),
    completionBonus: Math.max(0, Number($('#matchingCompletionBonus', root).value) || 0),
    wrongPenalty: Math.max(0, Number($('#matchingWrongPenalty', root).value) || 0),
    timeBonus: Math.max(0, Number($('#matchingTimeBonus', root).value) || 0),
    bonusUnderSeconds: Math.max(0, Number($('#matchingBonusUnderSeconds', root).value) || 0),
    practiceMode: $('#matchingPracticeMode', root).checked
  };
}
function toggleEditorSections(root) {
  const t = $('#editTemplate', root).value;
  const set = (sel, on) => { const el = $(sel, root); if (el) el.classList.toggle('hidden', !on); };
  set('#matchingEditor', t === 'matching');
  set('#treasureEditor', t === 'treasure-hunt');
  set('#raceEditor', t === 'race');
  set('#gameplayModeField', t === 'quiz');
  set('#houseStyleField', t === 'quiz');
  set('#answerModeField', answerModeSupportsTemplate(t));
  const usesQuestions = t === 'quiz' || t === 'scenario';
  const sectionHead = $('#importQuestionsBtn', root)?.closest('.section-head');
  if (sectionHead) sectionHead.classList.toggle('hidden', !usesQuestions);
  set('#editorQuestions', usesQuestions);
}
