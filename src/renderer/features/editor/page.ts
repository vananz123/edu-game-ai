// @ts-nocheck -- editor/page.ts — trang soạn thảo: nhập câu từ tệp, mở/đóng trang, markup, nối sự kiện và lưu (split từ features/game-editor.ts, DECISIONS #150).
/**
 * #317: after an import the teacher sees WHICH rows did not make it and why.
 *
 * A row that the strict reader would have thrown away used to vanish silently: the
 * teacher counted 12 rows in Excel, got 11 questions, and had nothing to look at.
 * The importer now reports each skipped row with the column it failed on.
 */
const IMPORT_FIELD_LABELS = {
  prompt: 'Câu hỏi',
  options: 'Phương án',
  answer: 'Đáp án',
  explanation: 'Giải thích',
  points: 'Điểm',
  difficulty: 'Độ khó',
  row: 'Cả dòng'
};

function importReportHtml(imported, added, duplicates) {
  const issues = Array.isArray(imported.issues) ? imported.issues : [];
  const source = imported.name ? `“${escapeHtml(imported.name)}”` : 'chữ đã dán';
  const head = added > 0
    ? `Đã nhập <strong>${added} câu</strong> từ ${source}.`
    : `Không nhập được câu nào từ ${source}.`;
  const dup = duplicates > 0 ? ` Bỏ qua ${duplicates} câu đã có trong trò chơi.` : '';
  const rows = issues.slice(0, 40).map(issue => `<tr>
        <td class="editor-import-line">Dòng ${Number(issue.line) || '?'}</td>
        <td class="editor-import-field">${escapeHtml(IMPORT_FIELD_LABELS[issue.field] || 'Cả dòng')}</td>
        <td class="editor-import-why">${escapeHtml(String(issue.message || '').replace(/^Dòng \d+:\s*/, ''))}
          <span class="editor-import-excerpt">${escapeHtml(String(issue.excerpt || '').slice(0, 120))}</span></td>
      </tr>`).join('');
  const more = issues.length > 40
    ? `<p class="editor-import-more">… và ${issues.length - 40} dòng nữa. Sửa các dòng trên trước rồi nhập lại.</p>`
    : '';
  return `<div class="editor-import-report" data-editor-import-report data-complete="${issues.length ? '0' : '1'}" role="status">
      <div class="editor-import-report-head">
        <span class="editor-import-report-title">${head}${dup}</span>
        <button type="button" class="btn btn-secondary btn-small" data-editor-import-report-close>Đóng</button>
      </div>
      ${issues.length ? `<p class="editor-import-report-note">${issues.length} dòng bị bỏ — sửa trong tệp (hoặc trong bảng đã dán) rồi nhập lại; các câu còn lại đã được thêm vào danh sách bên dưới.</p>
      <table class="editor-import-table"><thead><tr><th>Vị trí</th><th>Cột</th><th>Vì sao bị bỏ</th></tr></thead><tbody>${rows}</tbody></table>${more}` : ''}
    </div>`;
}

/** Replaces the previous report in place, above the question list. */
function showImportReport(root, imported, added, duplicates) {
  if (!imported) return;
  const list = $('#editorQuestions', root);
  if (!list) return;
  const existing = $('[data-editor-import-report]', root);
  if (existing) existing.remove();
  list.insertAdjacentHTML('beforebegin', importReportHtml(imported, added, duplicates));
  // The report lands below the paste box, which at 1366x768 puts it under the fold:
  // a report the teacher never sees is the same silent loss as no report at all.
  // `block: 'nearest'` scrolls the smallest amount that makes it visible.
  const panel = $('[data-editor-import-report]', root);
  if (panel && typeof panel.scrollIntoView === 'function') panel.scrollIntoView({ block: 'nearest' });
}

function applyImportedQuestions(root, game, imported) {
  if (!imported) return false;
  const { unique, skipped } = dedupeImportedQuestions(imported.questions, game.questions);
  if (!unique.length) {
    toast(`Tất cả ${imported.questions.length} câu trong “${imported.name}” đã trùng với câu hiện có — không thêm câu nào.`);
    return false;
  }
  if (game.questions.length + unique.length > 200) {
    toast('Trò chơi chỉ hỗ trợ tối đa 200 câu hỏi.');
    return false;
  }
  const startIndex = game.questions.length;
  const questions = unique.map(question => ({
    ...question,
    id: newQuestionId(),
    options: question.options.map(option => ({ ...option }))
  }));
  game.questions.push(...questions);
  $('#editorQuestions', root).insertAdjacentHTML(
    'beforeend',
    questions.map((question, index) => questionEditor(question, startIndex + index, game.questions)).join('')
  );
  renumberQuestions(root);
  refreshScenarioBranches(root);
  toast(skipped
    ? `Đã nhập ${questions.length} câu từ “${imported.name}” (bỏ qua ${skipped} câu trùng). Hãy kiểm tra trước khi lưu.`
    : `Đã nhập ${questions.length} câu từ “${imported.name}”. Hãy kiểm tra trước khi lưu.`);
  return true;
}
function renumberQuestions(root){ $$('.editor-question', $('#editorQuestions', root) || root).forEach((el,i)=>{ const h=el.querySelector('.editor-question-head strong'); if(h) h.textContent=`CÂU ${i+1}`; }); }
function currentEditorQuestions(root) {
  return $$('.editor-question', $('#editorQuestions', root) || root).map(el=>({
    id:el.dataset.questionId,
    prompt:el.querySelector('[data-field="prompt"]').value,
    type:el.querySelector('[data-field="type"]').value
  }));
}
function refreshScenarioBranches(root) {
  const questions=currentEditorQuestions(root);
  $$('.editor-question', $('#editorQuestions', root) || root).forEach(question=>{
    const currentId=question.dataset.questionId;
    const options=questions.filter(item=>item.id!==currentId && item.type==='scenario');
    question.querySelectorAll('[data-option-next]').forEach(select=>{
      const selected=select.value;
      select.innerHTML=`<option value="__next__">Tiếp tục theo thứ tự</option>`
        + options.map(item=>`<option value="${escapeHtml(item.id)}">${escapeHtml(item.prompt||item.id)}</option>`).join('')
        + '<option value="__end__">Kết thúc nhánh</option>';
      if([...select.options].some(option=>option.value===selected)) select.value=selected;
      else select.value='__next__';
    });
  });
}
function createBlankGame() {  const p = collectDraft();  const t = p.template || 'quiz';
  const sample = ({
    quiz: { prompt:'Nhập câu hỏi trắc nghiệm tại đây', options:[{id:'a',text:'Phương án A'},{id:'b',text:'Phương án B'},{id:'c',text:'Phương án C'},{id:'d',text:'Phương án D'}], correctOptionId:'a', explanation:'Nhập giải thích đáp án.', points:100 },
    scenario: { prompt:'Nhập tình huống thực tế tại đây', options:[{id:'a',text:'Cách xử lý A'},{id:'b',text:'Cách xử lý B'},{id:'c',text:'Cách xử lý C'}], correctOptionId:'a', explanation:'Giải thích vì sao lựa chọn này đúng/sai.', points:100 },
    matching: { prompt:'Ghép thuật ngữ với định nghĩa đúng', options:[{id:'a',text:'Thuật ngữ A'},{id:'b',text:'Thuật ngữ B'},{id:'c',text:'Thuật ngữ C'}], correctOptionId:'a', explanation:'Giải thích mối quan hệ ghép cặp.', points:100 },
    'treasure-hunt': { prompt:'Giải câu đố để nhận chìa khóa màn này', options:[{id:'a',text:'Đáp án A'},{id:'b',text:'Đáp án B'},{id:'c',text:'Đáp án C'}], correctOptionId:'a', explanation:'Gợi ý manh mối cho màn tiếp theo.', points:100 },
    race: { prompt:'Trả lời đúng để tiến thêm ô trên đường đua', options:[{id:'a',text:'Đáp án A'},{id:'b',text:'Đáp án B'},{id:'c',text:'Đáp án C'}], correctOptionId:'a', explanation:'Giải thích đáp án đúng.', points:100 }
  })[t];
  const isMatching = t === 'matching';
  const isTreasure = t === 'treasure-hunt';
  const isRace = t === 'race';
  const usesPanel = isMatching || isTreasure || isRace;
  const game = { id: '', title: p.title || 'Trò chơi mới', subject: p.subject, grade: p.grade, topic: '', template: t, description: 'Trò chơi được tạo trong EduGame Studio.', sourceName: p.sourceName, gameSetup: p.gameSetup, questions: usesPanel ? [] : [{ id:'q1', type:t, ...sample }], matchingGame: isMatching ? defaultMatchingGame() : undefined, ...(isTreasure ? { treasureHunt: defaultTreasureHunt() } : {}), ...(isRace ? { race: defaultRaceData() } : {}) };  openEditor(game, true, 'Bạn đang tạo trò chơi mới theo cách nhập thủ công. Hãy điền đầy đủ câu hỏi, phương án và đáp án đúng.');  toast('Đã mở trò chơi trống. Hãy nhập câu hỏi, phương án và đáp án đúng rồi nhấn Lưu vào thư viện.');}function editGame(game) { if (!game) return; openEditor(JSON.parse(JSON.stringify(game)), false, 'Chỉnh sửa nội dung trò chơi.'); }/**
 * #129: the game editor is a **page**, not a modal.
 *
 * A full-screen dialog was the wrong container for a screen a teacher works in for
 * minutes: the backdrop hid the library, Escape and backdrop clicks could throw away
 * typing, the page behind still scrolled, and it read as a pop-up rather than a
 * workspace. It is now `state.page === 'editor'`, rendered into `#pageContent` like any
 * other page, with a sticky header (back, title, save) and the same body markup — every
 * field binding below reads `root` and keeps working unchanged.
 *
 * `editGame`/`openEditor` keep their names so every caller (library card, wizard, the new
 * game flow) needs no change.
 */
function editorPageRoot() {
  return document.getElementById('pageContent');
}

/**
 * Markup of the editor page from `editorPageState`.
 *
 * A *pure* page renderer: the shell assigns what this returns to `#pageContent` and
 * then wires the fields. Rendering into the DOM here instead made the shell write
 * `undefined` over the page (#130).
 */
// DECISIONS #161: editor rows/panels are appended with insertAdjacentHTML *between* page renders, and paintUiIcons() only runs in core/render.ts, so this surface calls uiIcon() directly instead of the `data-icon` hooks used everywhere else.
function renderEditorPage() {
  const page = editorPageState;
  if (!page) {
    return `<section class="editor-page-empty"><h1>Chưa chọn trò chơi</h1>
      <p>Mở một trò chơi trong Thư viện để chỉnh sửa, hoặc tạo trò chơi mới.</p>
      <button class="btn btn-primary" data-page="library">${uiIcon('arrow-left', '', 13)} Về Thư viện</button></section>`;
  }
  return editorPageHtml(page.game, page.isNew, page.note);
}

/** The single entry point: every caller opens the editor page through this. */
function openEditor(game, isNew, note = '', aiContext = null) {
  editorCancelPending();
  editorAiContext = aiContext && aiContext.projectId && editorAiSupported(aiContext.gameType)
    ? {
      projectId: String(aiContext.projectId),
      gameType: aiContext.gameType,
      itemIds: (Array.isArray(aiContext.itemIds) ? aiContext.itemIds : []).map(id => String(id))
    }
    : null;
  editorAiBusy = false;
  editorAiRequestId = '';
  editorPicturesBeforeSave = null;
  editorPageState = { game, isNew: Boolean(isNew), note };
  navigate('editor');
}

/** Leaves the editor page; `cancel` also stops a pending per-item AI request. */
function closeEditorPage(options = {}) {
  if (options.cancel) {
    editorCancelPending();
    editorAiContext = null;
    editorPicturesBeforeSave = null;
  }
  editorPageState = null;
  navigate('library');
}

/** Markup of the editor page (the shell assigns it to `#pageContent`). */
function editorPageHtml(game, isNew, note) {
  return `<section class="editor-page" data-editor-page="1">
    <header class="editor-page-head">
      <button class="btn btn-secondary btn-small" data-editor-back>${uiIcon('arrow-left', '', 13)} Thư viện</button>
      <div class="editor-page-title"><h1>${isNew ? 'Duyệt và hoàn thiện trò chơi' : 'Chỉnh sửa trò chơi'}</h1>
        <div class="small muted">${escapeHtml(note)}</div></div>
    </header>
    <div class="editor-save-bar" data-editor-save-bar data-dirty="0">
      <span class="editor-save-hint" data-editor-save-hint></span>
      <div class="editor-save-actions">
        <button class="btn btn-secondary" id="editorCancelBtn">Hủy</button>
        <button class="btn btn-secondary" id="saveExportBtn">Lưu và xuất</button>
        <button class="btn btn-primary" id="saveGameBtn">${uiIcon('save', '', 13)} Lưu vào thư viện</button>
      </div>
    </div>
    <div class="editor-page-body"><details class="editor-card editor-setup"><summary class="editor-card-head"><h2>Thông tin trò chơi</h2><span class="editor-card-note">Tên, môn, lớp, cách chơi và minh họa</span><span class="editor-card-toggle">Mở để sửa</span></summary><div class="editor-field-grid">      <div class="field-row"><div class="field"><label>Tên trò chơi</label><input id="editTitle" value="${escapeHtml(game.title)}"></div><div class="field"><label>Thể loại</label><select id="editTemplate">${[['quiz','Đấu trường kiến thức'],['scenario','Thử thách tình huống'],['matching','Ghép cặp kiến thức'],['treasure-hunt','Giải mã kho báu'],['race','Đường đua chinh phục']].map(([v,l])=>`<option value="${v}" ${game.template===v?'selected':''}>${l}</option>`).join('')}</select></div></div>    <div class="field-row"><div class="field"><label>Môn học</label><input id="editSubject" value="${escapeHtml(game.subject||'')}"></div><div class="field"><label>Lớp</label><input id="editGrade" value="${escapeHtml(game.grade||'')}"></div></div>    <div class="field"><label>Mô tả</label><input id="editDescription" value="${escapeHtml(game.description||'')}"></div>    <div class="field"><label>Minh họa</label><select id="editIllustrationMode"><option value="auto" ${editorIllustrationMode(game)==='auto'?'selected':''}>Tự động theo lĩnh vực nội dung</option><option value="manual" ${editorIllustrationMode(game)==='manual'?'selected':''}>Chọn thủ công từng mục</option><option value="off" ${editorIllustrationMode(game)==='off'?'selected':''}>Tắt minh họa</option></select><p class="field-hint">Giáo viên luôn kiểm soát hình minh họa. Tắt minh họa chỉ ẩn hình nội dung; icon chức năng của giao diện vẫn hoạt động.</p></div>    <div class="field ${answerModeSupportsTemplate(game.template) ? '' : 'hidden'}" id="answerModeField"><label>Cách trả lời</label><select id="editAnswerMode">${editorAnswerModeOptionMarkup(game)}</select><p class="field-hint">${escapeHtml(answerModeHint(editorAnswerMode(game)))} Điểm mỗi câu vẫn lấy từ “Điểm / câu” của câu hỏi.</p></div>    <div class="field ${game.template === 'quiz' ? '' : 'hidden'}" id="gameplayModeField"><label>Cách chơi</label><select id="editGameplayMode"><option value="classic" ${editorGameplayMode(game)==='classic'?'selected':''}>Cổ điển — trả lời câu hỏi nhận điểm</option><option value="house" ${editorGameplayMode(game)==='house'?'selected':''}>Xây nhà — câu đúng dần dựng ngôi nhà 3D</option></select><p class="field-hint">Chế độ Xây nhà biến mỗi câu trả lời đúng thành vật liệu dựng nhà (tường → mái → cửa sổ → vườn). Ngôi nhà chia đều theo số câu hỏi (tối đa 8 phần): trả lời đúng tất cả sẽ hoàn thiện ngôi nhà. Chế độ Cổ điển giữ nguyên cách chơi hiện tại.</p></div>    <div class="field ${game.template === 'quiz' ? '' : 'hidden'}" id="houseStyleField"><label>Mẫu nhà 3D</label><select id="editHouseStyle"><option value="auto" ${editorHouseStyle(game)==='auto'?'selected':''}>Tự động — mỗi trò một mẫu riêng</option>${houseStyleOptions().map(option=>`<option value="${option.id}" ${editorHouseStyle(game)===option.id?'selected':''}>${escapeHtml(option.label)}</option>`).join('')}</select><p class="field-hint">Chỉ dùng ở chế độ Xây nhà. “Tự động” chọn mẫu cố định theo trò chơi để ngôi nhà không đổi giữa các lần chơi; chọn tay để hợp chủ đề bài học.</p></div>      </div></details><div class="section-head editor-questions-head"><h3>Câu hỏi / tình huống <span class="tag">${game.questions.length}</span></h3><div><button class="btn btn-secondary btn-small" id="downloadQuestionsTemplateBtn" title="Tải tệp CSV mẫu: mở bằng Excel, điền theo 4 dòng ví dụ rồi lưu lại">${uiIcon('download', '', 13)} Tải tệp mẫu</button> <button class="btn btn-secondary btn-small" id="importQuestionsBtn" title="Nhập câu hỏi từ tệp CSV, TSV hoặc XLSX có dòng tiêu đề">${uiIcon('upload', '', 13)} Nhập CSV/XLSX</button> <button class="btn btn-secondary btn-small" id="addQuestionBtn">${uiIcon('plus', '', 13)} Thêm câu hỏi</button></div></div>
    <details class="editor-paste" data-editor-paste>
      <summary>Dán trực tiếp từ Excel hoặc từ tài liệu — không cần lưu tệp</summary>
      <div class="editor-paste-body">
        <textarea class="editor-paste-text" data-editor-paste-text rows="5" spellcheck="false"
          placeholder="Bấm vào đây rồi Ctrl+V. Dán cả bảng (kèm dòng tiêu đề Câu hỏi / Đáp án …) hoặc dán danh sách câu hỏi dạng chữ (Câu 1: … A. … B. … Đáp án: A)."></textarea>
        <div class="editor-paste-actions">
          <button type="button" class="btn btn-primary btn-small" data-editor-paste-import>Nhập câu hỏi đã dán</button>
          <button type="button" class="btn btn-secondary btn-small" data-editor-paste-clear>Xoá ô</button>
          <span class="editor-paste-hint">Bảng dán từ Excel phải có dòng tiêu đề; cột “Câu hỏi” và “Đáp án” là bắt buộc.</span>
        </div>
      </div>
    </details>
    <details class="editor-paste" data-editor-cloud>
      <summary>Cloud AI viết câu hỏi từ bài học — cần đăng nhập</summary>
      <div class="editor-paste-body">
        <textarea class="editor-paste-text" data-editor-cloud-lesson rows="5" spellcheck="false"
          placeholder="Dán nội dung bài học (ít nhất 40 ký tự). Cloud AI đọc bài rồi viết câu hỏi cho trò chơi này."></textarea>
        <div class="editor-paste-actions">
          <button type="button" class="btn btn-primary btn-small" data-editor-cloud-generate>${uiIcon('sparkles', '', 13)} Viết câu hỏi bằng Cloud AI</button>
          <span class="editor-paste-hint" data-editor-cloud-status>Mỗi lần viết dùng 1 lượt tạo game của tháng. Câu hỏi sinh ra đi qua đúng đường nhập đã kiểm, nên câu nào thiếu đáp án sẽ bị bỏ.</span>
        </div>
      </div>
    </details>
    <p class="editor-import-hint" id="editorImportHint">Chưa có tệp? Bấm <strong>Tải tệp mẫu</strong> — tệp CSV mở bằng Excel, có sẵn 4 dòng ví dụ (trắc nghiệm, đúng/sai, điền từ, trả lời ngắn). Điền tiếp bên dưới rồi bấm <strong>Nhập CSV/XLSX</strong>. Tối đa 100 câu mỗi tệp; ô “Đáp án” của câu điền từ có thể chứa nhiều đáp án đúng, cách nhau bằng dấu chấm phẩy trong ngoặc kép.</p>    <div id="editorQuestions">${game.questions.map((q,i)=>questionEditor(q,i,game.questions)).join('')}</div>      </div></section>`;
}

/** Binds the editor page once it is in the DOM. */
function wireEditorPage(root) {
  if (!root) root = editorPageRoot();
  if (!root) return;
  // The fields belong to the page the shell just inserted; `game` is the one the markup
  // was built from.
  const game = editorPageState ? editorPageState.game : null;
  if (!game) return;
  /* #304: "chữ quá nhiều" — a paragraph under every field made the form read as a wall.
     The sentence is not deleted: it moves to the label's tooltip, which is where a
     teacher looks when a field is unclear, and screen readers still read the label. */
  root.querySelectorAll('.field-hint').forEach(hint => {
    const field = hint.closest('.field') || hint.parentElement;
    const label = field ? field.querySelector('label') : null;
    const text = (hint.textContent || '').trim();
    if (label && text && !label.getAttribute('title')) label.setAttribute('title', text);
    hint.hidden = true;
  });
  const editorQuestions = $('#editorQuestions', root);
// #128: picture control (upload / built-in / auto) for every item row.
if (typeof wireEditorItemArt === 'function') wireEditorItemArt(root);
// The picker's own event: the options box calls `stopPropagation` on `change` and would
// swallow a delegated listener, so the control listens on itself (`art-change`).
root.addEventListener('change', e => {
  const picker = e.target && e.target.closest ? e.target.closest('[data-art-picker]') : null;
  if (picker) picker.dispatchEvent(new CustomEvent('art-change', { bubbles: false }));
});
editorQuestions.addEventListener('change', e => {
  const target=e.target;
  if(!target.matches('[data-field="type"]')) return;
  const question=target.closest('.editor-question');
  const isScenario=target.value==='scenario';
  const isText=['fill-in-blank','short-answer'].includes(target.value);
  const isTF=target.value==='true-false';
  const box=question.querySelector('.editor-options');
  if(box){
    const opts=$$('.editor-option',question).map(readEditorOption);
    box.classList.toggle('hidden', !['multiple-choice','scenario'].includes(target.value));
    const seed=isTF?[{id:'a',text:'Đúng'},{id:'b',text:'Sai'}]:opts;
    box.innerHTML=seed.map((option,index)=>editorOption(option,index,isScenario,{id:question.dataset.questionId},currentEditorQuestions(root))).join('')
      + `<button class="btn btn-secondary btn-small add-option">${uiIcon('plus', '', 13)} Thêm phương án</button>`;
  }
  const fields=question.querySelector('.scenario-question-fields');
  if(fields) fields.classList.toggle('hidden', !isScenario);
  const textFields=question.querySelector('.text-answer-fields');
  if(textFields) textFields.classList.toggle('hidden', !isText);
  const correct=question.querySelector('.correct-select');
  if(correct){
    correct.classList.toggle('hidden', !!(isScenario||isText));
    const select=correct.querySelector('[data-field="correct"]');
    if(select && isTF){
      select.innerHTML=`<option value="a">Đúng</option><option value="b">Sai</option>`;
    } else if(select && !isScenario){
      const opts=$$('.editor-option',question).map(readEditorOption).filter(o=>o.text);
      select.innerHTML=opts.map((o,index)=>`<option value="${escapeHtml(o.id)}">${String.fromCharCode(65+index)} — ${escapeHtml(o.text)}</option>`).join('') || '<option value="a">A</option>';
    }
  }
  refreshScenarioBranches(root);
});
editorQuestions.addEventListener('click', e => {
  const b=e.target.closest('button');
  if(!b) return;
  if(b.matches('[data-ai-cancel]')){ editorCancelAi(); return; }
  if(b.matches('[data-ai-regenerate]')){ editorRegenerateItem(b); return; }
  const qEl=b.closest('.editor-question');
  if(b.matches('[data-remove-option]')){ b.closest('.editor-option').remove(); return; }
  if(b.matches('.add-option')){ const opts=qEl.querySelectorAll('[data-option-id]'); const j=opts.length; const id=String.fromCharCode(97+j); const question=qEl.querySelector('[data-field="prompt"]').value; const isScenario=qEl.querySelector('[data-field="type"]').value==='scenario'; qEl.querySelector('.editor-options').insertAdjacentHTML('beforeend',editorOption({id,text:''},j,isScenario,{id:qEl.dataset.questionId,prompt:question},currentEditorQuestions(root))); return; }
  if(b.matches('[data-copy-question]')){ const i=$$('.editor-question', $('#editorQuestions', root) || root).length; const src=qEl; const opts=[...src.querySelectorAll('[data-option-id]')].map(o=>readEditorOption(o.closest('.editor-option'))); const html=questionEditor({id:newQuestionId(),prompt:src.querySelector('[data-field="prompt"]').value,type:src.querySelector('[data-field="type"]').value,context:src.querySelector('[data-field="context"]')?.value,discussionPrompt:src.querySelector('[data-field="discussion"]')?.value,options:opts,correctOptionId:src.querySelector('[data-field="correct"]')?.value,correctAnswer:src.querySelector('[data-field="correct-answer"]')?.value,hint:src.querySelector('[data-field="hint"]')?.value,points:Number(src.querySelector('[data-field="points"]')?.value)||100,explanation:src.querySelector('[data-field="explanation"]').value,...readEditorItemAssets(src)},i,currentEditorQuestions(root)); $('#editorQuestions',root).insertAdjacentHTML('beforeend',html); renumberQuestions(root); refreshScenarioBranches(root); return; }
  if(b.matches('[data-move-question-up]')){ if(qEl.previousElementSibling){qEl.parentNode.insertBefore(qEl,qEl.previousElementSibling); renumberQuestions(root);} return; }
  if(b.matches('[data-move-question-down]')){ if(qEl.nextElementSibling){qEl.parentNode.insertBefore(qEl.nextElementSibling,qEl); renumberQuestions(root);} return; }
  if(b.matches('[data-remove-question]')){ qEl.remove(); renumberQuestions(root); refreshScenarioBranches(root); return; }
});
$('#downloadQuestionsTemplateBtn', root).addEventListener('click', () => {
  // #316: the teacher may have no file yet. Hand them the exact file the importer
  // accepts instead of describing its columns in prose.
  try {
    const blob = new Blob([questionTemplateCsv()], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = QUESTION_TEMPLATE_FILE_NAME;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast('Đã tải tệp mẫu ' + QUESTION_TEMPLATE_FILE_NAME + '.');
  } catch (error) {
    toast((error && error.message) || 'Không tải được tệp mẫu.');
  }
});
$('#importQuestionsBtn', root).addEventListener('click', async () => {
  try {
    const imported = await desktop.call('importQuestions');
    if (!imported) return;
    // Count the duplicates BEFORE the questions are pushed — afterwards every imported
    // question is already in `game.questions` and the count would be "all of them".
    const duplicates = dedupeImportedQuestions(imported.questions, game.questions).skipped;
    const before = game.questions.length;
    applyImportedQuestions(root, game, imported);
    showImportReport(root, imported, game.questions.length - before, duplicates);
  } catch (error) {
    toast(error.message || 'Không nhập được câu hỏi.');
  }
});
// #317: dán thẳng từ Excel/tài liệu. Cùng đường dẫn dữ liệu với nhập tệp — cùng luật
// đọc (question-import.ts) và cùng bảng báo cáo dòng bị bỏ, chỉ khác nguồn chữ.
$('[data-editor-paste-import]', root).addEventListener('click', async () => {
  const box = $('[data-editor-paste-text]', root);
  const text = box ? box.value : '';
  if (!text.trim()) {
    toast('Chưa có chữ nào trong ô dán.');
    if (box) box.focus();
    return;
  }
  try {
    const imported = await desktop.call('parseQuestionsText', text);
    const duplicates = dedupeImportedQuestions(imported.questions, game.questions).skipped;
    const before = game.questions.length;
    const applied = applyImportedQuestions(root, game, imported);
    showImportReport(root, imported, game.questions.length - before, duplicates);
    if (applied && box) box.value = '';
  } catch (error) {
    toast(error.message || 'Không nhập được câu hỏi đã dán.');
  }
});
// #345: Cloud AI viết câu hỏi từ CHÍNH bài học giáo viên dán. Kết quả không đi thẳng vào
// trò chơi: nó được đổi thành văn bản rồi qua `parseQuestionsText`, tức là qua đúng đường
// nhập đã có kiểm tra, trùng lặp và báo cáo. Một đường thứ hai để ghi câu hỏi sẽ là một
// đường thứ hai để sai.
$('[data-editor-cloud-generate]', root).addEventListener('click', async () => {
  const box = $('[data-editor-cloud-lesson]', root);
  const status = $('[data-editor-cloud-status]', root);
  const text = box ? box.value.trim() : '';
  const say = message => { if (status) status.textContent = message; };
  if (text.length < 40) {
    say('Bài học quá ngắn — cần ít nhất 40 ký tự. Hãy dán thêm nội dung.');
    if (box) box.focus();
    return;
  }
  const button = $('[data-editor-cloud-generate]', root);
  if (button) button.disabled = true;
  say('Đang gọi Cloud AI… (có thể mất 10–30 giây)');
  try {
    const outcome = await cloudGenerateGame({
      text,
      sourceName: (game.title || 'bai-hoc') + '.txt',
      // Số câu giáo viên đã có + 5, tối thiểu 3 và tối đa 15 — cùng giới hạn gateway nhận.
      questionCount: Math.max(3, Math.min(15, game.questions.length + 5)),
      template: game.template === 'scenario' ? 'scenario' : (game.template === 'matching' ? 'matching' : 'quiz'),
      grade: game.grade || '',
      subject: game.subject || '',
    });
    if (!outcome || outcome.ok !== true) {
      // Mã lỗi có tên quyết định lời nhắn; "thử lại sau" chỉ dùng khi thử lại có ích.
      const code = outcome && outcome.code;
      const advice = code === 'not_signed_in' ? 'Hãy đăng nhập bằng chip tài khoản ở thanh bên.'
        : (code === 'quota_exhausted' ? 'Tháng này đã hết lượt tạo game.'
          : (code === 'quota_busy' || code === 'provider_unavailable' ? 'Dịch vụ AI đang bận — thử lại sau ít phút.'
            : 'Không dùng được Cloud AI lúc này.'));
      say((outcome && outcome.message ? outcome.message + ' ' : '') + advice);
      return;
    }
    const converted = cloudGameToImportText(outcome.game);
    if (!converted.kept) {
      say('Cloud AI không trả về câu hỏi nào dùng được. Hãy thử lại với bài học rõ hơn.');
      return;
    }
    const imported = await desktop.call('parseQuestionsText', converted.text);
    const duplicates = dedupeImportedQuestions(imported.questions, game.questions).skipped;
    const before = game.questions.length;
    const applied = applyImportedQuestions(root, game, imported);
    showImportReport(root, imported, game.questions.length - before, duplicates);
    const dropped = converted.dropped ? ` Bỏ ${converted.dropped} câu thiếu đáp án.` : '';
    say(applied
      ? `Đã thêm ${game.questions.length - before} câu hỏi từ bài học.${dropped} Hãy đọc lại trước khi lưu.`
      : `Không thêm được câu nào.${dropped}`);
  } catch (error) {
    say((error && error.message) || 'Không gọi được Cloud AI.');
  } finally {
    if (button) button.disabled = false;
  }
});
$('[data-editor-paste-clear]', root).addEventListener('click', () => {
  const box = $('[data-editor-paste-text]', root);
  if (box) box.value = '';
});
// The report does not exist yet when this page is wired, so its close button cannot be
// bound by id — one DELEGATED listener on the page (lesson #309: one listener, not one
// per button). Binding it directly threw at wire time and silently killed every
// handler after it (the cancel button stopped working).
root.addEventListener('click', event => {
  const closeButton = event.target.closest('[data-editor-import-report-close]');
  if (!closeButton) return;
  const panel = closeButton.closest('[data-editor-import-report]');
  if (panel) panel.remove();
});  $('#addQuestionBtn', root).addEventListener('click', () => { const i = $$('.editor-question', $('#editorQuestions', root) || root).length; const type=$('#editTemplate',root).value==='scenario'?'scenario':'multiple-choice'; const existing=currentEditorQuestions(root); $('#editorQuestions', root).insertAdjacentHTML('beforeend', questionEditor({id:newQuestionId(),type,prompt:type==='scenario'?'Tình huống mới':'Câu hỏi mới',options:[{id:'a',text:'Phương án A'},{id:'b',text:'Phương án B'},{id:'c',text:'Phương án C'}],correctOptionId:'a',explanation:'',points:100},i,existing)); refreshScenarioBranches(root); });  $('#saveGameBtn', root).addEventListener('click', () => saveEditedGame(game, false));  $('#saveExportBtn', root).addEventListener('click', () => saveEditedGame(game, true));
  $('#editTemplate', root).addEventListener('change', () => toggleEditorSections(root));
  // The three hidden panels exist so the teacher can switch template on this page,
  // but their defaults belong to the panel, not to the game: writing them onto the
  // edited object made `saveEditedGame` persist a full matching/treasure/race
  // payload on every quiz game, and the play surface then named the wrong world
  // (#152). Keep the fallbacks local.
  const matchingPanel = game.matchingGame || defaultMatchingGame();
  const treasurePanel = game.treasureHunt || defaultTreasureHunt();
  const racePanel = game.race || defaultRaceData();
  // #129/#130: the hidden template editors (ghép cặp / kho báu / đường đua) append to
  // the page body that replaced `.modal-body`; guarding keeps a later class rename from
  // throwing here and killing the whole editor page.
  const editorBody = $('.editor-page-body', root) || $('.modal-body', root);
  if (editorBody) {
    editorBody.insertAdjacentHTML('beforeend',
      matchingEditorHtml(matchingPanel) + treasureEditorHtml(treasurePanel) + raceEditorHtml(racePanel));
    // #131: these panels are inserted *after* the editor page was wired, so their picture
    // controls (race questions and treasure stages) had no listeners and the upload
    // button did nothing. Bind them now that they are in the DOM.
    if (typeof wireEditorItemArt === 'function') wireEditorItemArt(root);
  }
  bindMatchingEditor(root);
  bindTreasureEditor(root);
  bindRaceEditor(root);
  toggleEditorSections(root);

  // #129: leaving the page. Back and Hủy both cancel a pending per-item AI request;
  // they no longer blank a modal, which never discarded the teacher's typing silently
  // because the page keeps the draft in the DOM until it is replaced by the library.
  // #130: ask only when there is something to lose; a clean editor leaves at once.
  root.querySelectorAll('[data-editor-back], #editorCancelBtn').forEach(el => el.addEventListener('click', () => {
    const dirty = $('[data-editor-save-bar]', root);
    if (!dirty || dirty.dataset.dirty !== '1' || window.confirm('Rời trình chỉnh sửa? Thay đổi chưa lưu sẽ mất.')) closeEditorPage({ cancel: true });
  }));
  // The pinned bar tracks work in progress: any edit in the form marks it dirty.
  const markDirty = () => {
    const bar = $('[data-editor-save-bar]', root);
    if (!bar) return;
    bar.dataset.dirty = '1';
    const hint = $('[data-editor-save-hint]', bar);
    if (hint) hint.textContent = 'Có thay đổi chưa lưu';
  };
  root.addEventListener('input', markDirty);
  root.addEventListener('change', markDirty);
  root.addEventListener('click', event => {
    const target = event.target;
    // Adding/removing/reordering rows is a change too; the buttons that only *save*
    // are excluded so the hint does not flip right before the page closes.
    if (target && target.closest && target.closest('[id^="save"], [data-editor-back], #editorCancelBtn')) return;
    if (target && target.closest && target.closest('button, [data-rq-remove], [data-ai-regenerate]')) markDirty();
  });
}

/**
 * #130: turns the bindings of `editorPageHtml` into one function the shell calls after
 * it inserted the markup. The body below is the former tail of `renderEditorInto`; each
 * line is bound to `root` (the `#pageContent` holder) and to `game`.
 */
function bindEditorPageFields(root, game) {
  bindMatchingEditor(root);
  bindTreasureEditor(root);
  bindRaceEditor(root);
  toggleEditorSections(root);
}

async function saveEditedGame(original, exportAfter) {
  if (editorAiBusy) return toast('AI đang viết lại một mục. Hãy chờ hoặc bấm “Huỷ” trước khi lưu.');
  const root = editorPageRoot();
  // Applied once here so every template's save path persists the teacher's
  // "Minh họa" choice without each branch remembering to repeat it.
  original = withEditorIllustrationMode(original, root);
  original = withEditorAnswerMode(original, root);
  original = withEditorGameplayMode(original, root);
  original = withEditorHouseStyle(original, root);
  if ($('#editTemplate', root).value === 'matching') {
    const matching = readMatchingEditor(root);
    if (!$('#editTitle', root).value.trim()) return toast('Tên trò chơi không được để trống.');
    if (matching.pairs.length < 2) return toast('Trò chơi ghép cặp cần ít nhất 2 cặp.');
    if (matching.pairs.some(p => !p.left || !p.right)) return toast('Mỗi cặp cần có nội dung ở cả cột A và cột B.');
    const rights = matching.pairs.map(p => p.right.toLowerCase());
    if (new Set(rights).size !== rights.length) return toast('Cột B đang có nội dung trùng lặp. Hãy làm rõ từng định nghĩa.');
    const lefts = matching.pairs.map(p => p.left.toLowerCase());
    if (matching.mode !== 'categorize' && new Set(lefts).size !== lefts.length) return toast('Cột A đang có nội dung trùng lặp. Mỗi thuật ngữ chỉ nên ghép với một đáp án.');
    const game = {
      ...original,
      title: $('#editTitle', root).value.trim(),
      template: 'matching',
      subject: $('#editSubject', root).value.trim(),
      grade: $('#editGrade', root).value.trim(),
      description: $('#editDescription', root).value.trim(),
      matchingGame: matching
    };
    try {
      const saved = await desktop.call('saveGame', game);
      if (exportAfter) await desktop.call('exportGame', saved);
      editorPageState = null;
      await refreshDb();
      navigate('library');
      toast(`Đã lưu “${saved.title}”.`);
    } catch (e) { toast(e.message || 'Không lưu được trò chơi.'); }
    return;
  }
  if ($('#editTemplate', root).value === 'treasure-hunt') {
    const hunt = readTreasureEditor(root);
    if (!$('#editTitle', root).value.trim()) return toast('Tên trò chơi không được để trống.');
    const err = validateTreasureData(hunt);
    if (err) return toast(err);
    const game = {
      ...original,
      title: $('#editTitle', root).value.trim(),
      template: 'treasure-hunt',
      subject: $('#editSubject', root).value.trim(),
      grade: $('#editGrade', root).value.trim(),
      description: $('#editDescription', root).value.trim(),
      treasureHunt: hunt
    };
    try {
      const saved = await desktop.call('saveGame', game);
      if (exportAfter) await desktop.call('exportGame', saved);
      editorPageState = null;
      await refreshDb();
      navigate('library');
      toast(`Đã lưu “${saved.title}”.`);
    } catch (e) { toast(e.message || 'Không lưu được trò chơi.'); }
    return;
  }
  if ($('#editTemplate', root).value === 'race') {
    const race = readRaceEditor(root);
    if (!$('#editTitle', root).value.trim()) return toast('Tên trò chơi không được để trống.');
    const err = validateRaceData(race);
    if (err) return toast(err);
    const game = {
      ...original,
      title: $('#editTitle', root).value.trim(),
      template: 'race',
      subject: $('#editSubject', root).value.trim(),
      grade: $('#editGrade', root).value.trim(),
      description: $('#editDescription', root).value.trim(),
      race
    };
    try {
      const saved = await desktop.call('saveGame', game);
      if (exportAfter) await desktop.call('exportGame', saved);
      editorPageState = null;
      await refreshDb();
      navigate('library');
      toast(`Đã lưu “${saved.title}”.`);
    } catch (e) { toast(e.message || 'Không lưu được trò chơi.'); }
    return;
  }
  const questions = $$('.editor-question', $('#editorQuestions', root) || root).map((el,i) => {
    const type = $('[data-field="type"]', el).value;
    const opts = $$('.editor-option', el).map(readEditorOption);
    const difficulty = $('[data-field="difficulty"]', el)?.value || '';
    const timelimit = Number($('[data-field="timelimit"]', el).value) || 0;
    const q = {
      id: el.dataset.questionId || original.questions[i]?.id || `q${i+1}`,
      type,
      prompt: $('[data-field="prompt"]', el).value.trim(),
      points: Number($('[data-field="points"]', el).value) || 100,
      explanation: $('[data-field="explanation"]', el).value.trim(),
      ...readEditorItemAssets(el)
    };
    if (timelimit) q.timeLimit = timelimit;
    if (difficulty) q.difficulty = difficulty;
    if (type === 'scenario') {
      q.options = opts;
      q.correctOptionId = $('[data-field="correct"]', el)?.value || opts[0]?.id || '';
      q.context = $('[data-field="context"]', el)?.value.trim() || '';
      q.discussionPrompt = $('[data-field="discussion"]', el)?.value.trim() || '';
    }
    else if (type === 'multiple-choice') { q.options = opts; q.correctOptionId = $('[data-field="correct"]', el).value; }
    else if (type === 'true-false') { q.options = [{ id:'a', text:'Đúng' }, { id:'b', text:'Sai' }]; q.correctOptionId = $('[data-field="correct"]', el).value || 'a'; }
    else if (type === 'fill-in-blank' || type === 'short-answer') {
      q.options = []; q.correctOptionId = '';
      const raw = ($('[data-field="correct-answer"]', el)?.value || '').trim();
      const accepted = raw.split(';').map(v => v.trim()).filter(Boolean);
      q.correctAnswer = accepted[0] || '';
      if (accepted.length > 1) q.alternateAnswers = accepted.slice(1);
      const hint = ($('[data-field="hint"]', el)?.value || '').trim();
      if (hint) q.hint = hint;
    }
    else { q.options = opts.length ? opts : [{ id: 'a', text: '' }]; q.correctOptionId = 'a'; }
    return q;
  });
  if (!$('#editTitle', root).value.trim()) return toast('Tên trò chơi không được để trống.');
  if (!questions.length) return toast('Thêm ít nhất một câu hỏi.');
  if (questions.some(q => !q.prompt)) return toast('Mỗi câu cần nội dung.');
  if (questions.some(q => q.type === 'multiple-choice' && (q.options.length < 2 || q.options.some(o => !o.text)))) return toast('Câu trắc nghiệm cần ít nhất 2 phương án đầy đủ.');
  if (questions.some(q => q.type === 'scenario' && (q.options.length < 2 || q.options.some(o => !o.text)))) return toast('Mỗi tình huống cần ít nhất hai hành động đầy đủ.');
  if (questions.some(q => (q.type === 'fill-in-blank' || q.type === 'short-answer') && !q.correctAnswer)) return toast('Câu điền từ hoặc trả lời ngắn cần có đáp án đúng (mục ĐÁP ÁN ĐÚNG).');
  const tooLong = questions.find(q => (q.type === 'fill-in-blank' || q.type === 'short-answer') && typeof textAnswerTooLong === 'function' && textAnswerTooLong(q.correctAnswer));
  if (tooLong) return toast(`Đáp án “${tooLong.correctAnswer}” dài hơn ${typeof TEXT_ANSWER_WORD_LIMIT === 'number' ? TEXT_ANSWER_WORD_LIMIT : 5} từ. Câu nhập đáp án chỉ nên có đáp án ngắn — hãy rút gọn hoặc đổi câu này sang trắc nghiệm.`);
  const scenarioIds = new Set(questions.filter(question => question.type === 'scenario').map(question => question.id));
  if (questions.some(question => question.type === 'scenario' && question.options.some(option =>
    option.nextQuestionId && !scenarioIds.has(option.nextQuestionId)
  ))) return toast('Có nhánh dẫn tới tình huống đã bị xóa. Hãy chọn lại nhánh trước khi lưu.');
  if (questions.some(question => question.type === 'scenario' && question.options.some(option => {
    const score = option.scenarioScore;
    return score && (score.safety < 0 || score.safety > 60 || score.reasoning < 0 || score.reasoning > 25 || score.harmReduction < 0 || score.harmReduction > 15);
  }))) return toast('Điểm tình huống vượt giới hạn (an toàn 60, giải thích 25, giảm hậu quả 15).');
  const game = {
    ...original,
    title: $('#editTitle', root).value.trim(),
    template: $('#editTemplate', root).value,
    subject: $('#editSubject', root).value.trim(),
    grade: $('#editGrade', root).value.trim(),
    description: $('#editDescription', root).value.trim(),
    questions
  };
  try {
    const saved = await desktop.call('saveGame', game);
    if (exportAfter) await desktop.call('exportGame', saved);
    root.innerHTML = '';
    await refreshDb();
    navigate('library');
    toast(`Đã lưu “${saved.title}”.`);
  } catch (e) { toast(e.message || 'Không lưu được trò chơi.'); }
}
