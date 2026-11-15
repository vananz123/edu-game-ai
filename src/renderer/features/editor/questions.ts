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
      <button class="text-link danger-text inline-flex items-center gap-[5px]" data-remove-question>${uiIcon('trash', '', 13)} Xóa câu</button>
      <button class="text-link inline-flex items-center gap-[5px]" data-copy-question>${uiIcon('copy', '', 13)} Sao chép</button>
      <button class="text-link q-move" data-move-question-up>${uiIcon('arrow-up', '', 14)}</button>
      <button class="text-link q-move" data-move-question-down>${uiIcon('arrow-down', '', 14)}</button>
    </div>
    <textarea data-field="prompt" rows="2" placeholder="Nội dung câu hỏi">${escapeHtml(q.prompt||'')}</textarea>
    <div class="scenario-question-fields ${isScenario?'':'hidden'}">
      <label>BỐI CẢNH</label><textarea data-field="context" rows="2" placeholder="Nhân vật, bối cảnh, thông tin liên quan">${escapeHtml(q.context||'')}</textarea>
      <label>CÂU HỎI THẢO LUẬN</label><textarea data-field="discussion" rows="2" placeholder="Câu hỏi để cả lớp cùng thảo luận sau tình huống">${escapeHtml(q.discussionPrompt||'')}</textarea>
      <p class="field-hint">Chấm mỗi quyết định tối đa 100 điểm: an toàn 0–60, giải thích 0–25, giảm hậu quả 0–15. Chọn tình huống tiếp theo hoặc kết thúc nhánh.</p>
    </div>
    <div class="editor-options ${isMC?'':'hidden'}">
      ${options.map((o,j)=>editorOption(o,j,isScenario,q,allQuestions)).join('')}
      <button class="btn btn-secondary btn-small add-option" data-question-index="${i}">${uiIcon('plus', '', 13)} Thêm phương án</button>
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
/* #257: the 38 icons a scene may draw, with a Vietnamese name. A teacher picking
   "which object goes in this corner" cannot read `flask-conical`; the ids stay
   the stored value, this map is only the label. The list is filtered against
   `stageIsSceneIconId` at render time, so an id removed from the catalogue
   disappears from the picker instead of producing an undrawable blueprint. */
const EDITOR_SCENE_ICON_LABEL = {
  'paw-print': 'Dấu chân', 'leaf': 'Lá cây', 'rocket': 'Tên lửa', 'heart-pulse': 'Nhịp tim',
  'car': 'Ô tô', 'shield-check': 'Khiên an toàn', 'recycle': 'Tái chế', 'landmark': 'Công trình cổ',
  'map': 'Bản đồ', 'briefcase': 'Cặp đi làm', 'trophy': 'Cúp', 'file-music': 'Bản nhạc',
  'palette': 'Bảng màu', 'calculator': 'Máy tính', 'languages': 'Ngôn ngữ', 'flask-conical': 'Bình thí nghiệm',
  'cpu': 'Vi mạch', 'stethoscope': 'Ống nghe', 'users': 'Nhóm người', 'house': 'Ngôi nhà',
  'cloud-sun': 'Nắng có mây', 'apple': 'Quả táo', 'box': 'Cái hộp', 'waves-horizontal': 'Sóng nước',
  'user': 'Một người', 'graduation-cap': 'Học sinh', 'hard-hat': 'Người lao động',
  'book-open': 'Quyển sách', 'lightbulb': 'Bóng đèn', 'star': 'Ngôi sao', 'clock': 'Đồng hồ',
  'target': 'Bia ngắm', 'brain': 'Bộ não', 'zap': 'Tia sét', 'sparkles': 'Lấp lánh',
  'gift': 'Món quà', 'pencil': 'Bút chì', 'mountain': 'Ngọn núi', 'fish': 'Cá',
  'bird': 'Chim', 'bug': 'Con bọ'
};
/** The four corners in the order the editor shows them: bottom row, then top. */
const EDITOR_SCENE_SLOTS = [
  { position: 'left', label: 'Trái dưới' },
  { position: 'right', label: 'Phải dưới' },
  { position: 'top-left', label: 'Trái trên' },
  { position: 'top-right', label: 'Phải trên' }
];
/* #262: compare mode keeps only the two upper corners, because the lower ones sit
   exactly where the second subject now stands. The editor offers only what the
   engine can actually draw, so a teacher never picks something that gets moved. */
const EDITOR_SCENE_COMPARE_SLOTS = ['top-left', 'top-right'];
/* #267: process is a left-to-right sequence, and its left/right corner slots sit
   exactly on stage 1 and stage 3, so it keeps the same two upper corners. */
const EDITOR_SCENE_PROCESS_SLOTS = ['top-left', 'top-right'];
/** Stages after the first one; mirrors `SCENE_PROCESS_MAX_EXTRA_STEPS` (#267). */
const EDITOR_SCENE_MAX_EXTRA_STEPS = 2;
/** "Bậc 2", "Bậc 3" — `mainIcon` is stage 1, which the subject picker already owns. */
const EDITOR_SCENE_STEP_LABELS = ['Bậc 2', 'Bậc 3'];
/** The comparison signs a `compare` scene may show (#262). */
const EDITOR_SCENE_SIGNS = [
  { id: '', label: 'Không dấu' },
  { id: 'greater-than', label: 'Lớn hơn (>)' },
  { id: 'less-than', label: 'Nhỏ hơn (<)' },
  { id: 'equal', label: 'Bằng (=)' }
];
/* #252: a blueprint is stored as compact JSON. The editor keeps it in a hidden
   input like the other asset fields; this turns either a stored object or the
   raw string back into a string safe for an attribute. */
function editorBlueprintJson(value) {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object') {
    try { return JSON.stringify(value); } catch (error) { return ''; }
  }
  return '';
}
function editorAssetFieldsHtml(item, options) {
  const source = item || {};
  const compact = !!(options && options.compact);
  const rawCategory = typeof source.contentCategory === 'string' ? source.contentCategory.trim() : '';
  const category = EDITOR_CONTENT_CATEGORY_IDS.includes(rawCategory) ? rawCategory : 'general';
  const rawIcon = typeof source.iconName === 'string' ? source.iconName.trim() : '';
  const iconName = EDITOR_ICON_NAMES.has(rawIcon) ? rawIcon : '';
  const illustration = typeof source.illustrationAssetId === 'string' ? source.illustrationAssetId.trim() : '';
  const blueprint = editorBlueprintJson(source.sceneBlueprint);
  const chips = compact ? '' : `<span class="editor-asset-chip" title="Lĩnh vực nội dung của mục này">${escapeHtml(EDITOR_CATEGORY_LABEL[category] || category)}</span>
    ${illustration === 'none' ? `<span class="editor-asset-chip" title="Câu hỏi này không dùng ảnh minh hoạ">${uiIcon('ban', '', 11)} Không ảnh</span>` : ''}
    ${blueprint && illustration !== 'none' && !illustration ? `<span class="editor-asset-chip" title="Cảnh do máy dựng từ chủ đề của câu hỏi">${uiIcon('sparkles', '', 11)} Cảnh thử</span>` : ''}
    ${illustration && illustration !== 'none' ? `<span class="editor-asset-chip" title="Minh họa đã gán">${uiIcon('image', '', 11)} ${escapeHtml(illustration)}</span>` : ''}`;
  return `<div class="editor-item-assets${compact ? ' is-compact' : ''}">
    ${chips}
    <input type="hidden" data-field="contentCategory" value="${escapeHtml(category === 'general' ? '' : category)}">
    <input type="hidden" data-field="iconName" value="${escapeHtml(iconName)}">
    <input type="hidden" data-field="illustrationAssetId" value="${escapeHtml(illustration)}">
    <input type="hidden" data-field="sceneBlueprint" value="${escapeHtml(blueprint)}">
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
 * (#124): thumb, source badge, "Tải ảnh lên", the built-in choices and "Tự động". It
 * writes into the same hidden input the save path already reads, so saving is unchanged.
 */
function editorItemArtHtml(item) {
  const source = item || {};
  const assetId = typeof source.illustrationAssetId === 'string' ? source.illustrationAssetId.trim() : '';
  const rawCategory = typeof source.contentCategory === 'string' ? source.contentCategory.trim() : '';
  const category = EDITOR_CONTENT_CATEGORY_IDS.includes(rawCategory) ? rawCategory : 'general';
  const isCustom = /^ci-[a-f0-9]{32}$/u.test(assetId);
  // #153: 'none' is the teacher's explicit "no picture on this question". It is not
  // an asset id, so neither the custom nor the built-in branch may claim it.
  const isNone = assetId === 'none';
  const builtIn = !isCustom && !isNone && /-scene$/u.test(assetId) && EDITOR_CONTENT_CATEGORY_IDS.includes(assetId.replace(/-scene$/u, ''))
    ? assetId
    : '';
  const blueprint = editorBlueprintJson(source.sceneBlueprint);
  // #257: the blueprint's sub icons, read through the same total normaliser the
  // game uses, so the picker shows exactly what will be drawn (and an old
  // string-form blueprint shows up in its upgraded corner form).
  const normalized = blueprint && typeof stageNormalizeBlueprint === 'function'
    ? stageNormalizeBlueprint(blueprint)
    : null;
  const placedSubs = normalized && Array.isArray(normalized.subIcons) ? normalized.subIcons : [];
  // #262: a compare scene has a second subject, so only the upper corners exist.
  const isCompare = !!normalized && normalized.layout === 'compare';
  // #267: a process scene draws stage 1 and stage 3 exactly where the left/right
  // corner icons would sit, so it keeps the same two upper corners as compare.
  const isProcess = !!normalized && normalized.layout === 'process';
  const layoutKind = isCompare ? 'compare' : isProcess ? 'process' : 'single';
  const activeSlots = isCompare || isProcess
    ? EDITOR_SCENE_SLOTS.filter(slot => EDITOR_SCENE_PROCESS_SLOTS.indexOf(slot.position) >= 0)
    : EDITOR_SCENE_SLOTS;
  const placedSteps = normalized && Array.isArray(normalized.steps) ? normalized.steps : [];
  const slotsLabel = isCompare
    ? 'Vật thể phụ (2 góc trên)'
    : isProcess
      ? 'Vật thể phụ (2 góc trên)'
      : 'Vật thể phụ ở 4 góc';
  const slotsHint = isCompare
    ? 'Bố cục so sánh chỉ còn 2 góc trên; hai góc dưới là chỗ của hai hình chính.'
    : isProcess
      ? 'Bố cục quy trình chỉ còn 2 góc trên; hai góc dưới là chỗ của bậc đầu và bậc cuối.'
      : 'Chọn tối đa 4 vật thể để cảnh kể đúng câu chuyện. Không bao giờ đè lên hình chính.';
  const slotsHtml = normalized
    ? `<div class="editor-art-slots" data-editor-art-slots>
        <span class="editor-art-slots-label">${slotsLabel}</span>
        ${activeSlots.map(slot => {
          const current = placedSubs.filter(sub => sub.position === slot.position)[0];
          const iconOptions = Object.keys(EDITOR_SCENE_ICON_LABEL)
            .filter(id => typeof stageIsSceneIconId !== 'function' || stageIsSceneIconId(id))
            .map(id => `<option value="${escapeHtml(id)}"${current && current.icon === id ? ' selected' : ''}>${escapeHtml(EDITOR_SCENE_ICON_LABEL[id])}</option>`)
            .join('');
          return `<label class="editor-art-slot" title="Chọn vật thể cho góc ${escapeHtml(slot.label.toLowerCase())} của cảnh">
            <span>${escapeHtml(slot.label)}</span>
            <select data-editor-art-slot="${escapeHtml(slot.position)}">
              <option value="">— trống —</option>${iconOptions}
            </select>
          </label>`;
        }).join('')}
        <span class="editor-art-slots-hint">${slotsHint}</span>
      </div>`
    : '';
  // #260: two ground props. A prop that repeats the subject or a corner icon is
  // dropped by the normaliser, so those ids are left out of the list instead of
  // being offered and then silently ignored.
  const placedProps = normalized && Array.isArray(normalized.props) ? normalized.props : [];
  const usedIcons = [normalized && normalized.mainIcon]
    .concat(isCompare && normalized && normalized.compareIcon ? [normalized.compareIcon] : [])
    .concat(placedSteps)
    .concat(placedSubs.map(sub => sub.icon))
    .concat(placedProps)
    .filter(Boolean);
  const propsHtml = normalized
    ? `<div class="editor-art-slots" data-editor-art-props>
        <span class="editor-art-slots-label">Vật thể đứng ở mặt đất</span>
        ${[0, 1].map(index => {
          const current = placedProps[index] || '';
          const iconOptions = Object.keys(EDITOR_SCENE_ICON_LABEL)
            .filter(id => typeof stageIsSceneIconId !== 'function' || stageIsSceneIconId(id))
            .filter(id => id === current || usedIcons.indexOf(id) < 0)
            .map(id => `<option value="${escapeHtml(id)}"${current === id ? ' selected' : ''}>${escapeHtml(EDITOR_SCENE_ICON_LABEL[id])}</option>`)
            .join('');
          return `<label class="editor-art-slot" title="Vật thể đứng trên mặt đất, ${index === 0 ? 'bên trái' : 'bên phải'} hình chính">
            <span>${index === 0 ? 'Đất trái' : 'Đất phải'}</span>
            <select data-editor-art-prop="${index}">
              <option value="">— trống —</option>${iconOptions}
            </select>
          </label>`;
        }).join('')}
        <span class="editor-art-slots-hint">Tối đa 2. Nhỏ và mờ hơn vật thể phụ để không tranh với hình chính.</span>
      </div>`
    : '';
  // #262: layout + second subject + sign. The block is always rendered so the
  // teacher can switch layout; the two extra selects appear only in compare, where
  // they mean something. Lists exclude icons the normaliser would drop (the subject,
  // a corner icon, a ground prop), so nothing is offered and then silently lost.
  const compareIconValue = isCompare && normalized && normalized.compareIcon ? normalized.compareIcon : '';
  const signValue = isCompare && normalized && normalized.compareSign ? normalized.compareSign : '';
  const compareIconOptions = Object.keys(EDITOR_SCENE_ICON_LABEL)
    .filter(id => typeof stageIsSceneIconId !== 'function' || stageIsSceneIconId(id))
    .filter(id => id === compareIconValue || usedIcons.indexOf(id) < 0)
    .map(id => `<option value="${escapeHtml(id)}"${compareIconValue === id ? ' selected' : ''}>${escapeHtml(EDITOR_SCENE_ICON_LABEL[id])}</option>`)
    .join('');
  const compareHtml = normalized
    ? `<div class="editor-art-slots" data-editor-art-compare>
        <span class="editor-art-slots-label">Bố cục cảnh</span>
        <label class="editor-art-slot" title="Một hình, hai hình để so sánh, hay một chuỗi bậc nối tiếp">
          <span>Kiểu</span>
          <select data-editor-art-layout>
            <option value="single"${layoutKind === 'single' ? ' selected' : ''}>Một hình</option>
            <option value="compare"${layoutKind === 'compare' ? ' selected' : ''}>So sánh hai hình</option>
            <option value="process"${layoutKind === 'process' ? ' selected' : ''}>Quy trình nhiều bậc</option>
          </select>
        </label>
        ${isCompare
          ? `<label class="editor-art-slot" title="Hình thứ hai, đứng bên phải hình chính">
          <span>Hình phải</span>
          <select data-editor-art-compare-icon>
            <option value="">— trống —</option>${compareIconOptions}
          </select>
        </label>
        <label class="editor-art-slot" title="Dấu giữa hai hình: lớn hơn, nhỏ hơn hay bằng">
          <span>Dấu</span>
          <select data-editor-art-sign>
            ${EDITOR_SCENE_SIGNS.map(sign => `<option value="${escapeHtml(sign.id)}"${signValue === sign.id ? ' selected' : ''}>${escapeHtml(sign.label)}</option>`).join('')}
          </select>
        </label>`
          : ''}
        ${isProcess
          ? EDITOR_SCENE_STEP_LABELS.map((label, index) => {
            const current = placedSteps[index] || '';
            /* A stage that repeats the subject, another stage, a corner icon or a
               prop is dropped by the normaliser, so those ids are not offered. */
            const stepOptions = Object.keys(EDITOR_SCENE_ICON_LABEL)
              .filter(id => typeof stageIsSceneIconId !== 'function' || stageIsSceneIconId(id))
              .filter(id => id === current || usedIcons.indexOf(id) < 0)
              .map(id => `<option value="${escapeHtml(id)}"${current === id ? ' selected' : ''}>${escapeHtml(EDITOR_SCENE_ICON_LABEL[id])}</option>`)
              .join('');
            return `<label class="editor-art-slot" title="Bậc ${index + 2} của quy trình, vẽ bên phải bậc trước">
              <span>${escapeHtml(label)}</span>
              <select data-editor-art-step="${index}">
                <option value="">— trống —</option>${stepOptions}
              </select>
            </label>`;
          }).join('')
          : ''}
        <span class="editor-art-slots-hint">${isProcess
          ? 'Quy trình vẽ các bậc từ trái sang phải, mũi tên ở giữa. Hình chính là bậc 1; điền Bậc 2/Bậc 3 theo đúng thứ tự.'
          : 'So sánh đặt hai hình cạnh nhau kèm dấu ở giữa — dùng cho câu "con nào lớn hơn?" hay "5 ... 3".'}</span>
      </div>`
    : '';
  const badge = isNone
    ? 'Không dùng ảnh'
    : isCustom
      ? 'Ảnh tự tải lên'
      : builtIn
        ? `Hình có sẵn: ${EDITOR_CATEGORY_LABEL[builtIn.replace(/-scene$/u, '')] || builtIn}`
        : blueprint
          ? 'Cảnh thử'
          : `Theo chủ đề: ${EDITOR_CATEGORY_LABEL[category] || 'Tổng quát'}`;
  // The preview is the play-surface renderer itself, so the editor shows exactly what
  // the class will see.
  const previewItem = Object.assign({}, source, { illustrationAssetId: assetId });
  const preview = typeof stageIllustrationHtml === 'function'
    ? stageIllustrationHtml(previewItem, { template: 'quiz', gameSetup: { illustrationMode: 'auto' } }, 'is-editor-preview')
    : '';
  const options = [
    `<option value="">Tự động (theo chủ đề)</option>`,
    `<option value="none"${isNone ? ' selected' : ''}>Không dùng ảnh</option>`,
    ...EDITOR_CONTENT_CATEGORY_IDS.map(id => `<option value="${escapeHtml(id)}-scene"${builtIn === `${id}-scene` ? ' selected' : ''}>${escapeHtml(EDITOR_CATEGORY_LABEL[id] || id)}</option>`),
    ...(isCustom ? [`<option value="${escapeHtml(assetId)}" selected>Ảnh tự tải lên (giữ nguyên)</option>`] : [])
  ].join('');
  return `<div class="editor-item-art" data-editor-art>
    <div class="editor-art-thumb${preview ? '' : ' is-empty'}" data-editor-art-thumb>${preview || `<span>${isNone ? 'Không dùng ảnh' : 'Chưa có hình'}</span>`}</div>
    <div class="editor-art-controls">
      <div class="editor-art-badge" data-editor-art-badge>${escapeHtml(badge)}</div>
      <div class="editor-art-buttons">
        <button type="button" class="btn btn-secondary btn-small" data-editor-art-upload title="Chọn ảnh PNG/JPG/WEBP/GIF từ máy">${uiIcon('camera', '', 13)} Tải ảnh lên</button>
        <select data-editor-art-pick data-art-picker title="Chọn hình minh hoạ có sẵn">${options}</select>
        <button type="button" class="btn btn-secondary btn-small" data-editor-art-blueprint title="Dựng cảnh thử từ chủ đề của câu hỏi — không cần mạng">${uiIcon('sparkles', '', 13)} Cảnh thử</button>
        <button type="button" class="btn btn-secondary btn-small" data-editor-art-suggest title="Nhờ AI chọn cảnh từ chính nội dung câu hỏi — cần mạng hoặc AI trên máy">${uiIcon('wand-sparkles', '', 13)} Gợi ý cảnh</button>
        <button type="button" class="btn btn-secondary btn-small" data-editor-art-reset>${uiIcon('rotate-ccw', '', 13)} Tự động</button>
        <button type="button" class="btn btn-secondary btn-small" data-editor-art-remove title="Bỏ hẳn ảnh minh hoạ của riêng câu hỏi này"${isNone ? ' disabled' : ''}>${uiIcon('ban', '', 13)} Bỏ ảnh</button>
      </div>
      <div class="editor-art-hint">Minh hoạ đi kèm câu hỏi này. Ảnh tải lên được lưu trên máy và chơi được khi không có mạng. “Cảnh thử” dựng một cảnh từ chủ đề (chưa dùng AI); “Gợi ý cảnh” nhờ AI đọc câu hỏi và chọn cảnh — hỏng thì tự rơi về cảnh theo chủ đề; “Bỏ ảnh” tắt hình riêng câu hỏi này; “Tự động” trả lại hình theo chủ đề.</div>
      ${compareHtml}
      ${slotsHtml}
      ${propsHtml}
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
  const blueprint = scope ? scope.querySelector('[data-field="sceneBlueprint"]') : null;
  return {
    illustrationAssetId: field ? field.value : '',
    contentCategory: category ? category.value : '',
    sceneBlueprint: blueprint ? blueprint.value : ''
  };
}

/** The one call that opens the file dialog for the editor (a seam for the UI check). */
function editorImportIllustration() {
  return desktop.call('importIllustration');
}

/** Writes the choice to the hidden input, then redraws the control from that input. */
function applyEditorItemArt(row, assetId) {
  if (!row) return;
  const scope = row.parentElement;
  const field = scope ? scope.querySelector('[data-field="illustrationAssetId"]') : null;
  if (field) field.value = assetId || '';
  redrawEditorArtRow(row);
}

/**
 * #252 "Cảnh thử": builds a blueprint from the item's content category, with
 * no network call. It also clears an explicit pick so the generated scene is
 * actually visible — a teacher who wants the built-in picture back picks it
 * again (the blueprint stays stored, hidden, as designed).
 */
function applyEditorBlueprint(row) {
  if (!row || typeof stageBlueprintForCategory !== 'function') return;
  const scope = row.parentElement;
  const categoryField = scope ? scope.querySelector('[data-field="contentCategory"]') : null;
  const blueprintField = scope ? scope.querySelector('[data-field="sceneBlueprint"]') : null;
  if (!blueprintField) return;
  const category = categoryField && categoryField.value ? categoryField.value : 'general';
  const blueprint = stageBlueprintForCategory(category);
  blueprintField.value = blueprint ? JSON.stringify(blueprint) : '';
  const artField = scope ? scope.querySelector('[data-field="illustrationAssetId"]') : null;
  if (artField) artField.value = '';
  redrawEditorArtRow(row);
}

/**
 * #265: writes the blueprint the AI channel returned, then redraws.
 *
 * The reply is DATA from Rust (`scene:suggest`), and it is re-normalised here even
 * though Rust already ran the same gate: the hidden input is the only thing that
 * gets saved, so the renderer must never store a blueprint it cannot draw. When
 * the channel degraded (`source !== 'model'`) the blueprint is still a valid
 * category scene, so the button never leaves the row empty.
 */
function applyEditorSuggestedBlueprint(row, response) {
  if (!row) return false;
  const scope = row.parentElement;
  const blueprintField = scope ? scope.querySelector('[data-field="sceneBlueprint"]') : null;
  if (!blueprintField) return false;
  const raw = response && typeof response.json === 'string' ? response.json : '';
  const blueprint = typeof stageNormalizeBlueprint === 'function' ? stageNormalizeBlueprint(raw) : null;
  if (!blueprint) return false;
  blueprintField.value = JSON.stringify(blueprint);
  // Same rule as "Cảnh thử": an explicit pick would hide the new scene entirely.
  const artField = scope ? scope.querySelector('[data-field="illustrationAssetId"]') : null;
  if (artField) artField.value = '';
  redrawEditorArtRow(row);
  return true;
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
 * #257: writes the four corner choices into the blueprint, then redraws.
 *
 * The blueprint is rebuilt from the normalised copy, so unknown ids and a
 * duplicate of the main icon are dropped here exactly as they would be on load.
 * An emptied choice keeps `mainIcon`; only `subIcons` disappears.
 */
function applyEditorSceneSlots(row) {
  if (!row) return;
  const live = row.closest('[data-editor-art]') || row;
  const scope = live.parentElement;
  const field = scope ? scope.querySelector('[data-field="sceneBlueprint"]') : null;
  if (!field || typeof stageNormalizeBlueprint !== 'function') return;
  const current = stageNormalizeBlueprint(field.value);
  if (!current) return;
  const picks = [];
  EDITOR_SCENE_SLOTS.forEach(slot => {
    const select = live.querySelector('[data-editor-art-slot="' + slot.position + '"]');
    const icon = select && select.value ? select.value.trim() : '';
    if (icon) picks.push({ icon: icon, position: slot.position });
  });
  const next = Object.assign({}, current);
  delete next.subIcons;
  delete next.props;
  delete next.compareIcon;
  delete next.compareSign;
  delete next.steps;
  if (picks.length) next.subIcons = picks;
  const props = [];
  [0, 1].forEach(index => {
    const select = live.querySelector('[data-editor-art-prop="' + index + '"]');
    const icon = select && select.value ? select.value.trim() : '';
    if (icon) props.push(icon);
  });
  if (props.length) next.props = props;
  /* #262: layout, second subject and sign.
     Switching to `compare` with no second subject chosen yet would be refused by
     the normaliser (it falls back to `single`), so the first free icon is picked
     here — one click must produce a valid compare scene, not a control that
     snaps back. */
  const layoutSelect = live.querySelector('[data-editor-art-layout]');
  const wanted = layoutSelect && layoutSelect.value ? layoutSelect.value.trim() : 'single';
  const wantCompare = wanted === 'compare';
  const wantProcess = wanted === 'process';
  next.layout = wantCompare ? 'compare' : wantProcess ? 'process' : 'single';
  if (wantCompare) {
    const compareSelect = live.querySelector('[data-editor-art-compare-icon]');
    let second = compareSelect && compareSelect.value ? compareSelect.value.trim() : '';
    if (!second) {
      const taken = [current.mainIcon].concat(picks.map(pick => pick.icon)).concat(props);
      second = Object.keys(EDITOR_SCENE_ICON_LABEL).filter(id =>
        (typeof stageIsSceneIconId !== 'function' || stageIsSceneIconId(id)) && taken.indexOf(id) < 0
      )[0] || '';
    }
    if (second) next.compareIcon = second;
    const signSelect = live.querySelector('[data-editor-art-sign]');
    const sign = signSelect && signSelect.value ? signSelect.value.trim() : '';
    if (sign) next.compareSign = sign;
  }
  /* #267: a sequence that lost its stages is refused by the normaliser (it falls
     back to `single`), so switching to `process` picks a free icon for stage 2 by
     itself — one click must produce a valid strip, not a control that snaps back. */
  if (wantProcess) {
    const stages = [];
    for (let index = 0; index < EDITOR_SCENE_MAX_EXTRA_STEPS; index += 1) {
      const select = live.querySelector('[data-editor-art-step="' + index + '"]');
      const icon = select && select.value ? select.value.trim() : '';
      if (icon && stages.indexOf(icon) < 0 && icon !== current.mainIcon) stages.push(icon);
    }
    if (!stages.length) {
      const taken = [current.mainIcon].concat(picks.map(pick => pick.icon)).concat(props);
      const free = Object.keys(EDITOR_SCENE_ICON_LABEL).filter(id =>
        (typeof stageIsSceneIconId !== 'function' || stageIsSceneIconId(id)) && taken.indexOf(id) < 0
      )[0] || '';
      if (free) stages.push(free);
    }
    if (stages.length) next.steps = stages.slice(0, EDITOR_SCENE_MAX_EXTRA_STEPS);
  }
  const normalized = stageNormalizeBlueprint(next);
  if (!normalized) return;
  field.value = JSON.stringify(normalized);
  // A topic picture would win over the blueprint on the play surface, so editing
  // the scene clears it — the two are already mutually exclusive (#252). An
  // explicit "no picture" sentinel is left alone: that is the teacher's choice.
  const artField = scope.querySelector('[data-field="illustrationAssetId"]');
  if (artField && artField.value && artField.value !== 'none') artField.value = '';
  redrawEditorArtRow(live);
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
  const blueprintButton = row.querySelector('[data-editor-art-blueprint]');
  if (blueprintButton) blueprintButton.addEventListener('click', () => {
    const live = blueprintButton.closest('[data-editor-art]');
    applyEditorBlueprint(live);
  });
  // #265 "Gợi ý cảnh": the channel owns the prompt and the gate; this handler only
  // moves data. It stays enabled-looking on failure: a teacher who sees a disabled
  // button with no message cannot tell an offline laptop from a broken feature.
  const suggestButton = row.querySelector('[data-editor-art-suggest]');
  if (suggestButton) {
    suggestButton.addEventListener('click', async () => {
      const control = suggestButton.closest('[data-editor-art]');
      if (!control) return;
      const scope = control.parentElement;
      const promptField = scope ? scope.querySelector('[data-field="prompt"]') : null;
      const promptText = promptField && promptField.value ? promptField.value.trim() : '';
      if (!promptText) {
        toast('Hãy viết nội dung câu hỏi trước khi nhờ AI gợi ý cảnh.');
        return;
      }
      // Answers live on inputs tagged with `data-option-id` (the option text is the
      // value; the id is the attribute). `data-field="optionText"` does not exist.
      const answers = Array.from(scope.querySelectorAll('input[data-option-id]'))
        .map(input => String(input.value || '').trim())
        .filter(Boolean);
      const categoryField = scope.querySelector('[data-field="contentCategory"]');
      const iconField = scope.querySelector('[data-field="iconName"]');
      suggestButton.disabled = true;
      const originalHtml = suggestButton.innerHTML;
      suggestButton.textContent = 'Đang gợi ý…';
      try {
        const response = await desktop.call('suggestScene', {
          requestId: 'scene-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
          prompt: promptText,
          answers,
          category: categoryField && categoryField.value ? categoryField.value : undefined,
          iconName: iconField && iconField.value ? iconField.value : undefined,
          subject: typeof game !== 'undefined' && game ? game.subject : undefined,
          grade: typeof game !== 'undefined' && game ? game.grade : undefined
        });
        // The row may have been redrawn while the call was in flight.
        const live = (suggestButton.isConnected ? suggestButton.closest('[data-editor-art]') : null) || control;
        const ok = applyEditorSuggestedBlueprint(live, response);
        if (!ok) {
          toast('AI trả về cảnh không dùng được — chưa thay đổi hình của câu hỏi này.');
        } else if (response && response.source !== 'model') {
          toast('AI chưa trả về cảnh dùng được — đã dùng cảnh theo chủ đề của câu hỏi.');
        }
      } catch (error) {
        toast('Không gợi ý được cảnh: ' + String((error && error.message) || 'lỗi không xác định'));
      } finally {
        if (suggestButton.isConnected) {
          suggestButton.disabled = false;
          suggestButton.innerHTML = originalHtml;
        }
      }
    });
  }
  // #257: one listener per corner. A redraw replaces these selects, so the
  // handler re-resolves the live row from the changed node instead of closing
  // over the old one (the "second click does nothing" bug of #128).
  row.querySelectorAll('[data-editor-art-slot]').forEach(select => {
    select.addEventListener('change', () => {
      const live = select.isConnected ? select.closest('[data-editor-art]') : null;
      if (live) applyEditorSceneSlots(live);
    });
  });
  // #260: the two ground-prop selects go through the same writer.
  row.querySelectorAll('[data-editor-art-prop]').forEach(select => {
    select.addEventListener('change', () => {
      const live = select.isConnected ? select.closest('[data-editor-art]') : null;
      if (live) applyEditorSceneSlots(live);
    });
  });
  // #262: layout, second subject and sign all rebuild the same blueprint. Resolve
  // the live row from the changed node, never from a closure over the old one.
  row.querySelectorAll('[data-editor-art-layout], [data-editor-art-compare-icon], [data-editor-art-sign], [data-editor-art-step]').forEach(select => {
    select.addEventListener('change', () => {
      const live = select.isConnected ? select.closest('[data-editor-art]') : null;
      if (live) applyEditorSceneSlots(live);
    });
  });
  // #153: "Bỏ ảnh" writes the opt-out sentinel, not '' — '' would let `auto` draw the
  // topic picture again, which is the opposite of what the teacher asked for.
  const remove = row.querySelector('[data-editor-art-remove]');
  if (remove) remove.addEventListener('click', () => {
    const live = remove.closest('[data-editor-art]');
    applyEditorItemArt(live, 'none');
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
  const blueprint = scope?.querySelector('[data-field="sceneBlueprint"]');
  if (!category && !icon && !illustration && !blueprint) return {};
  const fields = {};
  const categoryValue = (category?.value || '').trim();
  if (categoryValue && categoryValue !== 'general') fields.contentCategory = categoryValue;
  const iconValue = (icon?.value || '').trim();
  if (iconValue) fields.iconName = iconValue;
  const illustrationValue = (illustration?.value || '').trim();
  if (illustrationValue) fields.illustrationAssetId = illustrationValue;
  // #252: only a blueprint the renderer can actually draw is persisted. The
  // hidden input is app-generated, but the same total check guards a hand-edited
  // DOM as it guards `.egame` import.
  const blueprintValue = (blueprint?.value || '').trim();
  if (blueprintValue && typeof stageNormalizeBlueprint === 'function') {
    const normalized = stageNormalizeBlueprint(blueprintValue);
    if (normalized) fields.sceneBlueprint = normalized;
  }
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
/* "Cách trả lời" (DECISIONS #209) writes into the SAME key the old scoring modes used:
   `scoringMode` holds a 'tra-loi:' token. #223 dropped the "Giữ hành vi hiện tại" entry, so
   saving always writes one of the three modes; a saved game's old scoring mode is still
   read (see configFromGame) but never stored as a stash. Templates that don't answer
   questions (Ghép cặp) never keep a token. */
function editorAnswerMode(game) {
  return answerModeKey(game && game.gameSetup);
}
function withEditorAnswerMode(game, root) {
  const field = $('#editAnswerMode', root);
  if (!field) return game;
  const template = $('#editTemplate', root)?.value || game.template;
  const value = String(field.value || '');
  const setup = { ...(game.gameSetup || {}) };
  if (answerModeSupportsTemplate(template) && isAnswerModeValue(value)) setup.scoringMode = value;
  else delete setup.scoringMode;
  delete setup.legacyScoringMode;
  return { ...game, gameSetup: setup };
}
/* A legacy game (#209 and older) has no token, so it opens with "Thi đấu" selected — the
   law it already played by — and is saved as that token (#223). */
function editorAnswerModeOptionMarkup(game) {
  const key = editorAnswerMode(game);
  const currentValue = ANSWER_MODE_VALUES[key] || ANSWER_MODE_VALUES.competitive;
  return answerModeOptions()
    .map(option => `<option value="${option.value}" ${option.value === currentValue ? 'selected' : ''}>${escapeHtml(option.label)}</option>`)
    .join('');
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
    <button class="text-link danger-text" data-remove-option>${uiIcon('x', '', 14)}</button>
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
