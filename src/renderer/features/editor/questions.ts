// @ts-nocheck -- editor/questions.ts — hàng câu hỏi quiz/tình huống, đáp án, ảnh minh hoạ từng mục, tuỳ chọn minh hoạ/cách chơi/mẫu nhà (split từ features/game-editor.ts, DECISIONS #150).
function questionEditor(q, i, allQuestions = []) {
  const type = q.type || 'multiple-choice';
  const isScenario = type === 'scenario';
  const isMC = type === 'multiple-choice' || isScenario;
  const isText = type === 'fill-in-blank' || type === 'short-answer';
  const isTF = type === 'true-false';
  const options = isTF && (q.options || []).length < 2 ? [{ id: 'a', text: 'Đúng' }, { id: 'b', text: 'Sai' }] : (q.options || []);
  const timeLimit = q.timeLimit || '';
  const correctOptions = options.map((o,j) => `<option value="${escapeHtml(o.id)}" ${o.id===q.correctOptionId?'selected':''}>${String.fromCharCode(65+j)} — ${escapeHtml(o.text)}</option>`).join('');
  return `<div class="editor-question" data-question-index="${i}" data-question-id="${escapeHtml(q.id || `q${i+1}`)}">
    <div class="editor-question-head">
      <strong>CÂU ${i+1}</strong>
      <select data-field="type" class="w-auto [font:inherit] p-[4px]">
        <option value="multiple-choice" ${type==='multiple-choice'?'selected':''}>Trắc nghiệm</option>
        <option value="scenario" ${isScenario?'selected':''}>Tình huống phân nhánh</option>
        <option value="true-false" ${isTF?'selected':''}>Đúng/Sai</option>
        <option value="fill-in-blank" ${type==='fill-in-blank'?'selected':''}>Điền từ</option>
        <option value="short-answer" ${type==='short-answer'?'selected':''}>Trả lời ngắn</option>
      </select>
      ${editorAiButton(q.id)}
      <button class="text-link danger-text" data-remove-question>✕ Xóa câu</button>
      <button class="text-link" data-copy-question>📋 Sao chép</button>
      <button class="text-link q-move" data-move-question-up>↑</button>
      <button class="text-link q-move" data-move-question-down>↓</button>
    </div>
    <textarea data-field="prompt" rows="2" placeholder="Nội dung câu hỏi">${escapeHtml(q.prompt||'')}</textarea>
    <div class="scenario-question-fields ${isScenario?'':'hidden'}">
      <label>BỐI CẢNH</label><textarea data-field="context" rows="2" placeholder="Nhân vật, bối cảnh, thông tin liên quan">${escapeHtml(q.context||'')}</textarea>
      <label>CÂU HỎI THẢO LUẬN</label><textarea data-field="discussion" rows="2" placeholder="Câu hỏi để cả lớp cùng thảo luận sau tình huống">${escapeHtml(q.discussionPrompt||'')}</textarea>
      <p class="field-hint">Chấm mỗi quyết định tối đa 100 điểm: an toàn 0–60, giải thích 0–25, giảm hậu quả 0–15. Chọn tình huống tiếp theo hoặc kết thúc nhánh.</p>
    </div>
    <div class="editor-options ${isMC?'':'hidden'}">
      ${options.map((o,j)=>editorOption(o,j,isScenario,q,allQuestions)).join('')}
      <button class="btn btn-secondary btn-small add-option" data-question-index="${i}">＋ Thêm phương án</button>
    </div>
    <div class="text-answer-fields ${isText?'':'hidden'}">
      <label>ĐÁP ÁN ĐÚNG (VĂN BẢN)</label>
      <input data-field="correct-answer" value="${escapeHtml(q.correctAnswer||'')}" placeholder="${type==='fill-in-blank'?'Ví dụ: quang hợp — chấp nhận không phân biệt hoa/thường và dấu':'Nhập đáp án ngắn (tối đa 5 từ)'}">
      <p class="field-hint">Chấm không phân biệt hoa/thường, dấu tiếng Việt, khoảng trắng thừa và dấu câu cuối. Có thể nhập nhiều đáp án hợp lệ, cách nhau bằng dấu chấm phẩy (;). Đáp án nhiều ý cũng chấp nhận học sinh gõ bằng dấu phẩy.</p>
      <label class="text-answer-hint-label">GỢI Ý (HIỆN KHI HỌC SINH BẤM 💡)</label>
      <input data-field="hint" value="${escapeHtml(q.hint||'')}" maxlength="200" placeholder="Ví dụ: Đây là quá trình cây xanh tạo chất hữu cơ nhờ ánh sáng">
      <p class="field-hint">Gợi ý chỉ nên nhắc học sinh nhớ ra đáp án, không chứa chính đáp án. Để trống nếu không cần.</p>
    </div>
    <div class="correct-select ${(isScenario||isText)?'hidden':''}">
      <span>Đáp án đúng:</span>
      <select data-field="correct">${isTF?`<option value="a" ${q.correctOptionId!=='b'?'selected':''}>Đúng</option><option value="b" ${q.correctOptionId==='b'?'selected':''}>Sai</option>`:correctOptions}</select>
      <span>Điểm</span><input data-field="points" type="number" min="0" max="1000" value="${Number(q.points)||100}" class="w-[70px] m-0 p-[6px]">
      <span>Thời gian (giây)</span><input data-field="timelimit" type="number" min="0" value="${timeLimit}" placeholder="mặc định" class="w-[90px] m-0 p-[6px]">
    </div>
    <div class="correct-select"><span>Độ khó</span><select data-field="difficulty" class="w-auto"><option value="" ${!q.difficulty?'selected':''}>— Chưa đặt</option><option value="dễ" ${q.difficulty==='dễ'?'selected':''}>Dễ</option><option value="trung bình" ${q.difficulty==='trung bình'?'selected':''}>Trung bình</option><option value="khó" ${q.difficulty==='khó'?'selected':''}>Khó</option></select></div>
    ${editorAssetFieldsHtml(q)}${editorItemArtHtml(q)}
    <textarea data-field="explanation" rows="2" placeholder="Giải thích đáp án">${escapeHtml(q.explanation||'')}</textarea>
  </div>`;
}
function newQuestionId() { return `q-${Date.now()}-${Math.random().toString(36).slice(2,7)}`; }

/* Phase 4 of update_plan_6: the per-item asset keys (`contentCategory`,
   `iconName`, `illustrationAssetId`) live in the DOM as hidden inputs, exactly
   like `data-option-id` does for option ids. Without them every read/save cycle
   would silently erase what the AI returned, because the editor rebuilds each
   item object field by field — a field that is not read is a field deleted.

   NOTE: the renderer is loaded as classic <script> tags (src/index.html) and
   never imports src/shared/*, which compile to CommonJS. So the constants below
   are local copies. They only drive display and a defensive re-normalisation;
   the authoritative validation is `itemAssetFieldsForSave` in src/shared/
   asset-validation.ts, which runs in the main process on save. The values read
   here are passed through untouched, so a copy drifting cannot corrupt data. */
const EDITOR_CONTENT_CATEGORY_IDS = ['general','animals','plants','space','human-body','transport','safety','environment','history','geography','jobs','sports','music','art','math','language','science','technology','health','family','community','weather','food','objects','water-world'];
/* Only ids that are `true` in src/shared/icon-registry.ts; anything else is
   hidden rather than rendered as a broken glyph. */
const EDITOR_ICON_NAMES = new Set(['paw-print','leaf','rocket','heart-pulse','car','shield-check','recycle','landmark','map','briefcase','trophy','file-music','palette','calculator','languages','flask-conical','cpu','stethoscope','users','house','cloud-sun','apple','box','waves-horizontal','layout-grid','book-open','lightbulb','star','check','x','arrow-right','arrow-left','play','pause','rotate-ccw','skip-forward','volume-2','volume-x','maximize','minimize','search','settings','library','pencil','trash','plus','download','upload','clock','target','brain','zap','sparkles','gift','shield-alert','mountain','fish','bird','bug','utility-pole']);
const EDITOR_CATEGORY_LABEL = {'general':"Tổng quát",'animals':"Động vật",'plants':"Thực vật",'space':"Vũ trụ",'human-body':"Cơ thể người",'transport':"Giao thông",'safety':"An toàn",'environment':"Môi trường",'history':"Lịch sử",'geography':"Địa lí",'jobs':"Nghề nghiệp",'sports':"Thể thao",'music':"Âm nhạc",'art':"Mỹ thuật",'math':"Toán",'language':"Tiếng Việt",'science':"Khoa học",'technology':"Công nghệ",'health':"Sức khỏe",'family':"Gia đình",'community':"Cộng đồng",'weather':"Thời tiết",'food':"Thực phẩm",'objects':"Đồ vật",'water-world':"Thế giới nước"};
function editorAssetFieldsHtml(item, options) {
  const source = item || {};
  const compact = !!(options && options.compact);
  const rawCategory = typeof source.contentCategory === 'string' ? source.contentCategory.trim() : '';
  const category = EDITOR_CONTENT_CATEGORY_IDS.includes(rawCategory) ? rawCategory : 'general';
  const rawIcon = typeof source.iconName === 'string' ? source.iconName.trim() : '';
  const iconName = EDITOR_ICON_NAMES.has(rawIcon) ? rawIcon : '';
  const illustration = typeof source.illustrationAssetId === 'string' ? source.illustrationAssetId.trim() : '';
  const chips = compact ? '' : `<span class="editor-asset-chip" title="Lĩnh vực nội dung của mục này">${escapeHtml(EDITOR_CATEGORY_LABEL[category] || category)}</span>
    ${illustration ? `<span class="editor-asset-chip" title="Minh họa đã gán">🖼 ${escapeHtml(illustration)}</span>` : ''}`;
  return `<div class="editor-item-assets${compact ? ' is-compact' : ''}">
    ${chips}
    <input type="hidden" data-field="contentCategory" value="${escapeHtml(category === 'general' ? '' : category)}">
    <input type="hidden" data-field="iconName" value="${escapeHtml(iconName)}">
    <input type="hidden" data-field="illustrationAssetId" value="${escapeHtml(illustration)}">
  </div>`;
}

/* #129: the editor page state. `null` means "no game in hand" — opening the page then
   shows an empty state instead of an editor over nothing. */
let editorPageState = null;

/**
 * #128: the teacher's own picture on every item of the manual editor.
 *
 * The manual path only carried `illustrationAssetId` in hidden inputs, so a game created
 * here could neither get a picture nor change one. This control is the one step 5 uses
 * (#124): thumb, source badge, "📷 Tải ảnh lên", the built-in choices and "Tự động". It
 * writes into the same hidden input the save path already reads, so saving is unchanged.
 */
function editorItemArtHtml(item) {
  const source = item || {};
  const assetId = typeof source.illustrationAssetId === 'string' ? source.illustrationAssetId.trim() : '';
  const rawCategory = typeof source.contentCategory === 'string' ? source.contentCategory.trim() : '';
  const category = EDITOR_CONTENT_CATEGORY_IDS.includes(rawCategory) ? rawCategory : 'general';
  const isCustom = /^ci-[a-f0-9]{32}$/u.test(assetId);
  const builtIn = !isCustom && /-scene$/u.test(assetId) && EDITOR_CONTENT_CATEGORY_IDS.includes(assetId.replace(/-scene$/u, ''))
    ? assetId
    : '';
  const badge = isCustom
    ? 'Ảnh tự tải lên'
    : builtIn
      ? `Hình có sẵn: ${EDITOR_CATEGORY_LABEL[builtIn.replace(/-scene$/u, '')] || builtIn}`
      : `Theo chủ đề: ${EDITOR_CATEGORY_LABEL[category] || 'Tổng quát'}`;
  // The preview is the play-surface renderer itself, so the editor shows exactly what
  // the class will see.
  const previewItem = Object.assign({}, source, { illustrationAssetId: assetId });
  const preview = typeof stageIllustrationHtml === 'function'
    ? stageIllustrationHtml(previewItem, { template: 'quiz', gameSetup: { illustrationMode: 'auto' } }, 'is-editor-preview')
    : '';
  const options = [
    `<option value="">Tự động (theo chủ đề)</option>`,
    ...EDITOR_CONTENT_CATEGORY_IDS.map(id => `<option value="${escapeHtml(id)}-scene"${builtIn === `${id}-scene` ? ' selected' : ''}>${escapeHtml(EDITOR_CATEGORY_LABEL[id] || id)}</option>`),
    ...(isCustom ? [`<option value="${escapeHtml(assetId)}" selected>Ảnh tự tải lên (giữ nguyên)</option>`] : [])
  ].join('');
  return `<div class="editor-item-art" data-editor-art>
    <div class="editor-art-thumb${preview ? '' : ' is-empty'}" data-editor-art-thumb>${preview || '<span>Chưa có hình</span>'}</div>
    <div class="editor-art-controls">
      <div class="editor-art-badge" data-editor-art-badge>${escapeHtml(badge)}</div>
      <div class="editor-art-buttons">
        <button type="button" class="btn btn-secondary btn-small" data-editor-art-upload title="Chọn ảnh PNG/JPG/WEBP/GIF từ máy">📷 Tải ảnh lên</button>
        <select data-editor-art-pick data-art-picker title="Chọn hình minh hoạ có sẵn">${options}</select>
        <button type="button" class="btn btn-secondary btn-small" data-editor-art-reset>↺ Tự động</button>
      </div>
      <div class="editor-art-hint">Minh hoạ đi kèm câu hỏi này. Ảnh tải lên được lưu trên máy và chơi được khi không có mạng.</div>
    </div>
  </div>`;
}

/**
 * #128: reads the picture choice of one row from the hidden input the editor saves.
 *
 * The control is drawn from this value and nothing else, so the thumb, the badge, the
 * picker and the saved game can never disagree.
 */
function editorItemArtValue(row) {
  const scope = row && row.parentElement;
  const field = scope ? scope.querySelector('[data-field="illustrationAssetId"]') : null;
  const category = scope ? scope.querySelector('[data-field="contentCategory"]') : null;
  return { illustrationAssetId: field ? field.value : '', contentCategory: category ? category.value : '' };
}

/** The one call that opens the file dialog for the editor (a seam for the UI check). */
function editorImportIllustration() {
  return window.eduGame.importIllustration();
}

/** Writes the choice to the hidden input, then redraws the control from that input. */
function applyEditorItemArt(row, assetId) {
  if (!row) return;
  const scope = row.parentElement;
  const field = scope ? scope.querySelector('[data-field="illustrationAssetId"]') : null;
  if (field) field.value = assetId || '';
  redrawEditorArtRow(row);
}

/** Replaces one control with a fresh one drawn from the hidden input. */
function redrawEditorArtRow(row) {
  if (!row) return;
  const fresh = document.createElement('div');
  fresh.innerHTML = editorItemArtHtml(editorItemArtValue(row));
  const next = fresh.firstElementChild;
  if (!next) return;
  // The listeners live on the *old* node, so the replacement is bound from scratch. The
  // `data-art-bound` marker must not be copied: it means "already bound", and copying it
  // made every control dead after its first redraw (#128).
  next.removeAttribute('data-art-bound');
  row.replaceWith(next);
  wireEditorItemArtRow(next);
}

/**
 * Binds one control.
 *
 * The change is a custom `art-change` event dispatched by the control itself: the
 * editor's own change handler on the question list starts with `if (!target.matches(
 * '[data-field="type"]')) return;`, and the options box stops propagation, so a shared
 * `change` listener is not a reliable path for this control.
 */
function wireEditorItemArtRow(row) {
  if (!row || row.dataset.artBound === '1') return;
  row.dataset.artBound = '1';
  // The handlers resolve the *current* row from the clicked node each time: a redraw
  // replaces the control, and a closure over the old node would write into a detached
  // element (the "second click does nothing" bug).
  const picker = row.querySelector('[data-editor-art-pick]');
  if (picker) picker.addEventListener('art-change', () => {
    const live = picker.closest('[data-editor-art]');
    applyEditorItemArt(live, picker.value);
  });
  const reset = row.querySelector('[data-editor-art-reset]');
  if (reset) reset.addEventListener('click', () => {
    const live = reset.closest('[data-editor-art]');
    applyEditorItemArt(live, '');
  });
  const upload = row.querySelector('[data-editor-art-upload]');
  if (upload) {
    upload.addEventListener('click', async () => {
      if (typeof editorImportIllustration !== 'function') return;
      const control = upload.closest('[data-editor-art]');
      upload.disabled = true;
      try {
        const picked = await editorImportIllustration();
        // A cancelled dialog changes nothing and reports nothing.
        if (picked && picked.id) {
          // The control may have been redrawn while the dialog was open: write into the
          // row that holds the button now, falling back to the original one.
          const live = (upload.isConnected ? upload.closest('[data-editor-art]') : null) || control;
          applyEditorItemArt(live, picked.id);
        }
      } catch (error) {
        // Same rule as step 5: an upload that did not save must not look saved.
        toast('Không tải được ảnh: ' + String((error && error.message) || 'lỗi không xác định'));
      } finally {
        if (upload.isConnected) upload.disabled = false;
      }
    });
  }
}

/** Binds every control in the editor modal (called when the modal is built). */
function wireEditorItemArt(root) {
  if (!root) return;
  root.querySelectorAll('[data-editor-art]').forEach(row => wireEditorItemArtRow(row));
}

function readEditorItemAssets(scope) {
  const category = scope?.querySelector('[data-field="contentCategory"]');
  const icon = scope?.querySelector('[data-field="iconName"]');
  const illustration = scope?.querySelector('[data-field="illustrationAssetId"]');
  if (!category && !icon && !illustration) return {};
  const fields = {};
  const categoryValue = (category?.value || '').trim();
  if (categoryValue && categoryValue !== 'general') fields.contentCategory = categoryValue;
  const iconValue = (icon?.value || '').trim();
  if (iconValue) fields.iconName = iconValue;
  const illustrationValue = (illustration?.value || '').trim();
  if (illustrationValue) fields.illustrationAssetId = illustrationValue;
  return fields;
}
/* "Minh họa" is a game-level choice (docs/DECISIONS.md #62, #65), stored in
   `gameSetup.illustrationMode` so it survives the project adapter unchanged.
   Anything unrecognised reads as 'auto', which is what a game with no setting
   already means — so old saved games keep working untouched. */
function editorIllustrationMode(game) {
  const mode = game && game.gameSetup ? game.gameSetup.illustrationMode : '';
  return mode === 'manual' || mode === 'off' ? mode : 'auto';
}
function withEditorIllustrationMode(game, root) {
  const select = $('#editIllustrationMode', root);
  const mode = select && (select.value === 'manual' || select.value === 'off') ? select.value : 'auto';
  return { ...game, gameSetup: { ...(game.gameSetup || {}), illustrationMode: mode } };
}
/* "Cách chơi" (Classic vs House Building) is a quiz-only choice (DECISIONS #140),
   stored in `gameSetup.gameplayMode`. Absent = Classic, which keeps every saved
   game working untouched. Cleared when the template is not quiz so a house mode
   can never leak onto the other four game types. */
function editorGameplayMode(game) {
  return game && game.gameSetup && game.gameSetup.gameplayMode === 'house' ? 'house' : 'classic';
}
function withEditorGameplayMode(game, root) {
  const template = $('#editTemplate', root)?.value || game.template;
  const setup = { ...(game.gameSetup || {}) };
  if (template === 'quiz' && $('#editGameplayMode', root)?.value === 'house') setup.gameplayMode = 'house';
  else delete setup.gameplayMode;
  return { ...game, gameSetup: setup };
}
/* "Mẫu nhà" (DECISIONS #144) is a quiz-only presentation choice stored in
   `gameSetup.houseStyle`. Absent/'auto' keeps a stable model per game id, so a
   saved game never reshuffles its house between replays. Cleared for non-quiz
   templates just like `gameplayMode`. */
function editorHouseStyle(game) {
  const style = game && game.gameSetup ? String(game.gameSetup.houseStyle || '') : '';
  return houseStyleOptions().some(option => option.id === style) ? style : 'auto';
}
function withEditorHouseStyle(game, root) {
  const template = $('#editTemplate', root)?.value || game.template;
  const setup = { ...(game.gameSetup || {}) };
  const value = $('#editHouseStyle', root)?.value;
  if (template === 'quiz' && value && value !== 'auto') setup.houseStyle = value;
  else delete setup.houseStyle;
  return { ...game, gameSetup: setup };
}
function editorOption(option, index, isScenario, question, allQuestions) {
  const nextValue = option.endsScenario === true || option.nextQuestionId === null
    ? '__end__'
    : option.nextQuestionId === undefined ? '__next__' : option.nextQuestionId;
  const targets = allQuestions.filter(item => item.id !== question.id)
    .map(item => `<option value="${escapeHtml(item.id)}" ${nextValue===item.id?'selected':''}>${escapeHtml(item.prompt || item.id)}</option>`)
    .join('');
  const score = option.scenarioScore || {};
  return `<div class="editor-option">
    <input data-option-id="${escapeHtml(option.id)}" value="${escapeHtml(option.text||'')}" placeholder="Hành động ${index+1}">
    <button class="text-link danger-text" data-remove-option>✕</button>
    ${isScenario ? `<div class="scenario-option-fields">
      <input data-option-feedback value="${escapeHtml(option.feedback||'')}" placeholder="Phản hồi và hậu quả của lựa chọn">
      <label>Nhánh</label><select data-option-next><option value="__next__" ${nextValue==='__next__'?'selected':''}>Tiếp tục theo thứ tự</option>${targets}<option value="__end__" ${nextValue==='__end__'?'selected':''}>Kết thúc nhánh</option></select>
      <label>An toàn /60</label><input data-option-score="safety" type="number" min="0" max="60" value="${Number(score.safety)||0}">
      <label>Giải thích /25</label><input data-option-score="reasoning" type="number" min="0" max="25" value="${Number(score.reasoning)||0}">
      <label>Giảm hậu quả /15</label><input data-option-score="harmReduction" type="number" min="0" max="15" value="${Number(score.harmReduction)||0}">
    </div>` : ''}
  </div>`;
}
function readEditorOption(container) {
  const option = {
    id: container.querySelector('[data-option-id]').dataset.optionId,
    text: container.querySelector('[data-option-id]').value.trim()
  };
  const feedback = container.querySelector('[data-option-feedback]');
  const next = container.querySelector('[data-option-next]');
  if (feedback) option.feedback = feedback.value.trim();
  if (next) {
    if (next.value === '__end__') option.endsScenario = true;
    else if (next.value !== '__next__') option.nextQuestionId = next.value;
  }
  const scoreFields = [...container.querySelectorAll('[data-option-score]')];
  if (scoreFields.length) {
    option.scenarioScore = Object.fromEntries(scoreFields.map(field => [
      field.dataset.optionScore,
      Number(field.value) || 0
    ]));
  }
  return option;
}
