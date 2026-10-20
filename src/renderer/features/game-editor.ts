// @ts-nocheck -- migrated legacy UI logic; new contracts are typed in src/shared/types.ts.
/* P7 follow-up (2026-10-20): per-item AI regeneration inside the editor, but only
   for games opened from the wizard. The editor edits the EducationalGame snapshot;
   the model call still goes through lesson:regenerate-item on the stored project
   (typed draft + analysis + config), and only the returned item is merged back.
   Manual games and games reopened from the library have no project context and
   therefore no AI button (DECISIONS #15). */
let editorAiContext = null;
let editorAiBusy = false;
let editorAiRequestId = '';

const EDITOR_AI_TEMPLATES = { arena: 'quiz', scenario: 'scenario', matching: 'matching', treasure: 'treasure-hunt', race: 'race' };
const EDITOR_AI_KINDS = { arena: 'câu hỏi', scenario: 'tình huống', matching: 'cặp ghép', treasure: 'chặng', race: 'câu hỏi' };

function editorAiSupported(gameType) {
  return Object.prototype.hasOwnProperty.call(EDITOR_AI_TEMPLATES, String(gameType || ''));
}

function editorAiExpectedTemplate(gameType) {
  return EDITOR_AI_TEMPLATES[gameType] || '';
}

function editorAiKind(gameType) {
  return EDITOR_AI_KINDS[gameType] || 'mục';
}

function editorAiContainer(root, gameType) {
  const selector = {
    arena: '#editorQuestions', scenario: '#editorQuestions', matching: '#matchingPairs',
    treasure: '#treasureStages', race: '#raceQuestions'
  }[gameType];
  return selector ? $(selector, root) : null;
}

function editorAiItemSelector(gameType) {
  return {
    arena: '.editor-question', scenario: '.editor-question', matching: '.matching-pair-row',
    treasure: '.treasure-stage-card', race: '.race-question-card'
  }[gameType] || '';
}

function editorAiResultItem(game, gameType, position) {
  if (!game || !position) return null;
  if (gameType === 'arena' || gameType === 'scenario') return (game.questions || [])[position - 1] || null;
  if (gameType === 'matching') return ((game.matchingGame || {}).pairs || [])[position - 1] || null;
  if (gameType === 'treasure') return ((game.treasureHunt || {}).stages || [])[position - 1] || null;
  if (gameType === 'race') return ((game.race || {}).questions || [])[position - 1] || null;
  return null;
}

function editorAiRenderItem(item, index, root, gameType) {
  if (gameType === 'arena' || gameType === 'scenario') return questionEditor(item, index, currentEditorQuestions(root));
  if (gameType === 'matching') return matchingPairRow(item, index);
  if (gameType === 'treasure') return treasureStageHtml(item, index);
  if (gameType === 'race') return raceQuestionCard(item, index);
  return '';
}

function editorAiRefresh(root, gameType) {
  if (gameType === 'arena' || gameType === 'scenario') {
    renumberQuestions(root);
    refreshScenarioBranches(root);
    return;
  }
  if (gameType === 'matching') {
    const count = $('#matchingPairCount', root);
    if (count) count.textContent = String($$('#matchingPairs .matching-pair-row', root).length);
    return;
  }
  if (gameType === 'treasure') {
    refreshTreasureUi(root);
    return;
  }
  if (gameType === 'race') renumberRaceQuestions(root);
}

function editorAiButton(itemId) {
  if (!editorAiContext) return '';
  const position = editorAiContext.itemIds.indexOf(String(itemId || ''));
  if (position < 0) return '';
  return `<button class="text-link" data-ai-regenerate="${position + 1}" title="AI viết lại riêng mục này từ giáo án; các mục khác và chỉnh sửa chưa lưu vẫn giữ nguyên.">🔄 Tạo lại</button>`;
}

function editorAiErrorText(error) {
  const raw = String((error && error.message) || '');
  const match = raw.match(/\[([A-Z0-9_]+)\]/);
  const code = match ? match[1] : '';
  const messages = {
    AI_NOT_RUNNING: 'AI local chưa chạy. Hãy mở cửa sổ AI local, chọn model đã tải xong rồi bấm “Bắt đầu chạy”.',
    AI_CONFIG: 'Chưa cấu hình AI local đúng cách. Hãy kiểm tra trong Cài đặt.',
    AI_CONNECTION: 'Không kết nối được tới AI local. Hãy kiểm tra cửa sổ AI local còn mở không rồi thử lại.',
    AI_TIMEOUT: 'AI local phản hồi quá lâu. Hãy thử lại với giáo án ngắn hơn hoặc model nhỏ hơn.',
    AI_CANCELLED: 'Đã huỷ yêu cầu AI.',
    AI_HTTP: 'AI local báo lỗi khi xử lý. Hãy thử lại.',
    AI_EMPTY: 'AI local không trả về nội dung. Hãy thử lại.',
    AI_TRUNCATED: 'Câu trả lời bị cắt do giới hạn độ dài. Hãy thử lại.',
    AI_INVALID_JSON: 'AI local trả về dữ liệu không đọc được. Hãy thử lại.',
    AI_OUTPUT_INVALID: 'Nội dung AI trả về chưa đúng cấu trúc. Hãy thử lại hoặc sửa thủ công.',
    GENERATION_INVALID: 'Nội dung AI trả về chưa hợp lệ. Hãy thử lại hoặc sửa thủ công.',
    ITEM_INDEX_INVALID: 'Mục cần tạo lại không còn khớp với bản nháp. Hãy tạo lại trong wizard.'
  };
  return messages[code] || raw.replace(/^\[[^\]]+\]\s*/, '') || 'Không tạo lại được mục này.';
}

function editorSetBusyUi(root, activeButton, busy) {
  $$('[data-ai-regenerate]', root).forEach(btn => {
    if (!busy) {
      btn.disabled = false;
      btn.removeAttribute('data-ai-cancel');
      btn.textContent = '🔄 Tạo lại';
      return;
    }
    if (btn === activeButton) {
      btn.disabled = false;
      btn.dataset.aiCancel = '1';
      btn.textContent = '✕ Huỷ';
    } else {
      btn.disabled = true;
    }
  });
  const save = $('#saveGameBtn', root);
  const saveExport = $('#saveExportBtn', root);
  if (save) save.disabled = busy;
  if (saveExport) saveExport.disabled = busy;
}

function editorCancelPending() {
  if (!editorAiRequestId) return;
  const id = editorAiRequestId;
  editorAiRequestId = '';
  editorAiBusy = false;
  window.eduGame.cancelAi(id).catch(() => {});
}

async function editorCancelAi() {
  if (!editorAiRequestId) return;
  toast('Đang huỷ yêu cầu AI…');
  try {
    await window.eduGame.cancelAi(editorAiRequestId);
  } catch (error) {
    /* the pending call reports the typed cancellation */
  }
}

async function editorRegenerateItem(button) {
  if (editorAiBusy || !editorAiContext) return;
  const context = editorAiContext;
  const root = $('#modalRoot');
  const position = Number(button.dataset.aiRegenerate);
  const template = $('#editTemplate', root)?.value || '';
  const expected = editorAiExpectedTemplate(context.gameType);
  if (template !== expected) {
    toast('Không thể tạo lại bằng AI sau khi đổi thể loại. Hãy quay lại wizard để tạo lại toàn bộ nội dung.');
    return;
  }
  if (!Number.isInteger(position) || position < 1 || position > context.itemIds.length) {
    toast('Mục này không còn khớp với bản nháp đã lưu. Hãy tạo lại trong wizard.');
    return;
  }
  const kind = editorAiKind(context.gameType);
  if (!window.confirm(`Tạo lại ${kind} ${position} bằng AI? Nội dung hiện tại của mục này trong trình chỉnh sửa sẽ được thay bằng bản AI viết lại từ giáo án (dựa trên bản nháp đã lưu). Các mục khác giữ nguyên.`)) {
    return;
  }
  const selector = editorAiItemSelector(context.gameType);
  const container = editorAiContainer(root, context.gameType);
  const qEl = selector ? button.closest(selector) : null;
  if (!qEl || !container) return;
  const requestId = `editor-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  editorAiBusy = true;
  editorAiRequestId = requestId;
  editorSetBusyUi(root, button, true);
  toast(`Đang nhờ AI viết lại ${kind} ${position}. Có thể mất 1–2 phút; bấm “Huỷ” trên nút để dừng.`);
  try {
    const result = await window.eduGame.regenerateLessonItem({
      projectId: context.projectId,
      requestId,
      itemIndex: position
    });
    if (editorAiContext !== context) return;
    const regenerated = editorAiResultItem(result && result.game, context.gameType, position);
    if (!regenerated) throw new Error('AI không trả về nội dung cho mục này.');
    // Keep the wizard (mounted behind the modal) in sync with the project the
    // regeneration just saved, so closing without saving and reopening the
    // editor does not show the pre-regeneration snapshot.
    if (typeof wizardState !== 'undefined' && wizardState && wizardState.projectId === context.projectId) {
      wizardState.draft = (result.project && result.project.draft) || wizardState.draft;
      wizardState.gameSnapshot = result.game || wizardState.gameSnapshot;
      wizardState.quality = result.quality || wizardState.quality;
      wizardState.context = result.context || wizardState.context;
      wizardState.gameId = result.game && result.game.id ? result.game.id : wizardState.gameId;
    }
    const cards = $$(selector, container);
    const index = cards.indexOf(qEl);
    if (index < 0) {
      toast(`Đã tạo lại ${kind} ${position} trong dự án, nhưng mục này đã bị xoá khỏi trình chỉnh sửa.`);
      return;
    }
    const replacement = editorAiRenderItem(regenerated, index, root, context.gameType);
    if (!replacement) throw new Error('Không dựng được nội dung mới cho mục này.');
    qEl.insertAdjacentHTML('afterend', replacement);
    qEl.remove();
    editorAiRefresh(root, context.gameType);
    const quality = result.quality || null;
    const advisory = quality && (quality.errors || quality.warnings)
      ? ` Còn ${quality.errors || 0} lỗi, ${quality.warnings || 0} cảnh báo chất lượng (tư vấn, không chặn lưu).`
      : '';
    toast(`Đã tạo lại ${kind} ${position}. Các mục khác giữ nguyên.${advisory}`);
  } catch (error) {
    if (editorAiContext !== context) return;
    const message = String((error && error.message) || '');
    if (message.includes('AI_CANCELLED')) toast(`Đã huỷ tạo lại ${kind}. Mục hiện tại được giữ nguyên.`);
    else toast(editorAiErrorText(error));
  } finally {
    if (editorAiContext === context) {
      editorAiBusy = false;
      editorAiRequestId = '';
      editorSetBusyUi(root, button, false);
    }
  }
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
  const game = { id: '', title: p.title || 'Trò chơi mới', subject: p.subject, grade: p.grade, topic: '', template: t, description: 'Trò chơi được tạo trong EduGame Studio.', sourceName: p.sourceName, gameSetup: p.gameSetup, questions: usesPanel ? [] : [{ id:'q1', type:t, ...sample }], matchingGame: isMatching ? defaultMatchingGame() : undefined, ...(isTreasure ? { treasureHunt: defaultTreasureHunt() } : {}), ...(isRace ? { race: defaultRaceData() } : {}) };  openEditor(game, true, 'Bạn đang tạo trò chơi mới theo cách nhập thủ công. Hãy điền đầy đủ câu hỏi, phương án và đáp án đúng.');  toast('Đã mở trò chơi trống. Hãy nhập câu hỏi, phương án và đáp án đúng rồi nhấn Lưu vào thư viện.');}function editGame(game) { if (!game) return; openEditor(JSON.parse(JSON.stringify(game)), false, 'Chỉnh sửa nội dung trò chơi.'); }function openEditor(game, isNew, note = '', aiContext = null) {  editorCancelPending();  editorAiContext = aiContext && aiContext.projectId && editorAiSupported(aiContext.gameType) ? { projectId: String(aiContext.projectId), gameType: aiContext.gameType, itemIds: (Array.isArray(aiContext.itemIds) ? aiContext.itemIds : []).map(id => String(id)) } : null;  editorAiBusy = false;  editorAiRequestId = '';  const root = $('#modalRoot');  root.innerHTML = `<div class="modal-backdrop"><div class="modal"><div class="modal-head"><div><h2>${isNew ? 'Duyệt và hoàn thiện trò chơi' : 'Chỉnh sửa trò chơi'}</h2><div class="small muted mt-[5px]">${escapeHtml(note)}</div></div><button class="modal-close" data-close>✕</button></div><div class="modal-body">      <div class="field-row"><div class="field"><label>TÊN TRÒ CHƠI</label><input id="editTitle" value="${escapeHtml(game.title)}"></div><div class="field"><label>THỂ LOẠI</label><select id="editTemplate">${[['quiz','Đấu trường kiến thức'],['scenario','Thử thách tình huống'],['matching','Ghép cặp kiến thức'],['treasure-hunt','Giải mã kho báu'],['race','Đường đua chinh phục']].map(([v,l])=>`<option value="${v}" ${game.template===v?'selected':''}>${l}</option>`).join('')}</select></div></div>    <div class="field-row"><div class="field"><label>MÔN HỌC</label><input id="editSubject" value="${escapeHtml(game.subject||'')}"></div><div class="field"><label>LỚP</label><input id="editGrade" value="${escapeHtml(game.grade||'')}"></div></div>    <div class="field"><label>MÔ TẢ</label><input id="editDescription" value="${escapeHtml(game.description||'')}"></div>      <div class="section-head"><h3>Câu hỏi / tình huống <span class="tag">${game.questions.length}</span></h3><div><button class="btn btn-secondary btn-small" id="importQuestionsBtn">⇧ Nhập CSV/XLSX</button> <button class="btn btn-secondary btn-small" id="addQuestionBtn">＋ Thêm câu hỏi</button></div></div>    <div id="editorQuestions">${game.questions.map((q,i)=>questionEditor(q,i,game.questions)).join('')}</div>    </div><div class="modal-foot"><button class="btn btn-secondary" data-close>Hủy</button><button class="btn btn-secondary" id="saveExportBtn">Lưu và xuất</button><button class="btn btn-primary" id="saveGameBtn">✓ Lưu vào thư viện</button></div></div></div>`;  root.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', () => { editorCancelPending(); editorAiContext = null; root.innerHTML = ''; }));  const editorQuestions = $('#editorQuestions', root);
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
      + `<button class="btn btn-secondary btn-small add-option">＋ Thêm phương án</button>`;
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
  if(b.matches('[data-copy-question]')){ const i=$$('.editor-question', $('#editorQuestions', root) || root).length; const src=qEl; const opts=[...src.querySelectorAll('[data-option-id]')].map(o=>readEditorOption(o.closest('.editor-option'))); const html=questionEditor({id:newQuestionId(),prompt:src.querySelector('[data-field="prompt"]').value,type:src.querySelector('[data-field="type"]').value,context:src.querySelector('[data-field="context"]')?.value,discussionPrompt:src.querySelector('[data-field="discussion"]')?.value,options:opts,correctOptionId:src.querySelector('[data-field="correct"]')?.value,correctAnswer:src.querySelector('[data-field="correct-answer"]')?.value,points:Number(src.querySelector('[data-field="points"]')?.value)||100,explanation:src.querySelector('[data-field="explanation"]').value},i,currentEditorQuestions(root)); $('#editorQuestions',root).insertAdjacentHTML('beforeend',html); renumberQuestions(root); refreshScenarioBranches(root); return; }
  if(b.matches('[data-move-question-up]')){ if(qEl.previousElementSibling){qEl.parentNode.insertBefore(qEl,qEl.previousElementSibling); renumberQuestions(root);} return; }
  if(b.matches('[data-move-question-down]')){ if(qEl.nextElementSibling){qEl.parentNode.insertBefore(qEl.nextElementSibling,qEl); renumberQuestions(root);} return; }
  if(b.matches('[data-remove-question]')){ qEl.remove(); renumberQuestions(root); refreshScenarioBranches(root); return; }
});
$('#importQuestionsBtn', root).addEventListener('click', async () => {
  try {
    applyImportedQuestions(root, game, await window.eduGame.importQuestions());
  } catch (error) {
    toast(error.message || 'Không nhập được câu hỏi.');
  }
});  $('#addQuestionBtn', root).addEventListener('click', () => { const i = $$('.editor-question', $('#editorQuestions', root) || root).length; const type=$('#editTemplate',root).value==='scenario'?'scenario':'multiple-choice'; const existing=currentEditorQuestions(root); $('#editorQuestions', root).insertAdjacentHTML('beforeend', questionEditor({id:newQuestionId(),type,prompt:type==='scenario'?'Tình huống mới':'Câu hỏi mới',options:[{id:'a',text:'Phương án A'},{id:'b',text:'Phương án B'},{id:'c',text:'Phương án C'}],correctOptionId:'a',explanation:'',points:100},i,existing)); refreshScenarioBranches(root); });  $('#saveGameBtn', root).addEventListener('click', () => saveEditedGame(game, false));  $('#saveExportBtn', root).addEventListener('click', () => saveEditedGame(game, true));
  $('#editTemplate', root).addEventListener('change', () => toggleEditorSections(root));
  if (!game.matchingGame) game.matchingGame = defaultMatchingGame();
  if (!game.treasureHunt) game.treasureHunt = defaultTreasureHunt();
  if (!game.race) game.race = defaultRaceData();
  $('.modal-body', root).insertAdjacentHTML('beforeend',
    matchingEditorHtml(game.matchingGame) + treasureEditorHtml(game.treasureHunt) + raceEditorHtml(game.race));
  bindMatchingEditor(root);
  bindTreasureEditor(root);
  bindRaceEditor(root);
  toggleEditorSections(root);
}function questionEditor(q, i, allQuestions = []) {
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
      <input data-field="correct-answer" value="${escapeHtml(q.correctAnswer||'')}" placeholder="${type==='fill-in-blank'?'Ví dụ: quang hợp — chấp nhận không phân biệt hoa/thường và dấu':'Nhập đáp án học sinh cần nhập'}">
      <p class="field-hint">Chấm không phân biệt hoa/thường, dấu tiếng Việt và khoảng trắng thừa. Có thể nhập nhiều đáp án hợp lệ, cách nhau bằng dấu chấm phẩy (;).</p>
    </div>
    <div class="correct-select ${(isScenario||isText)?'hidden':''}">
      <span>Đáp án đúng:</span>
      <select data-field="correct">${isTF?`<option value="a" ${q.correctOptionId!=='b'?'selected':''}>Đúng</option><option value="b" ${q.correctOptionId==='b'?'selected':''}>Sai</option>`:correctOptions}</select>
      <span>Điểm</span><input data-field="points" type="number" min="0" max="1000" value="${Number(q.points)||100}" class="w-[70px] m-0 p-[6px]">
      <span>Thời gian (giây)</span><input data-field="timelimit" type="number" min="0" value="${timeLimit}" placeholder="mặc định" class="w-[90px] m-0 p-[6px]">
    </div>
    <div class="correct-select"><span>Độ khó</span><select data-field="difficulty" class="w-auto"><option value="" ${!q.difficulty?'selected':''}>— Chưa đặt</option><option value="dễ" ${q.difficulty==='dễ'?'selected':''}>Dễ</option><option value="trung bình" ${q.difficulty==='trung bình'?'selected':''}>Trung bình</option><option value="khó" ${q.difficulty==='khó'?'selected':''}>Khó</option></select></div>
    <textarea data-field="explanation" rows="2" placeholder="Giải thích đáp án">${escapeHtml(q.explanation||'')}</textarea>
  </div>`;
}
function newQuestionId() { return `q-${Date.now()}-${Math.random().toString(36).slice(2,7)}`; }
function editorOption(option, index, isScenario, question, allQuestions) {
  const nextValue = option.nextQuestionId === undefined ? '__next__' : option.nextQuestionId === null ? '__end__' : option.nextQuestionId;
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
    if (next.value === '__end__') option.nextQuestionId = null;
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
async function saveEditedGame(original, exportAfter) {
  if (editorAiBusy) return toast('AI đang viết lại một mục. Hãy chờ hoặc bấm “Huỷ” trước khi lưu.');
  const root = $('#modalRoot');
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
      const saved = await window.eduGame.saveGame(game);
      if (exportAfter) await window.eduGame.exportGame(saved);
      root.innerHTML = '';
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
      const saved = await window.eduGame.saveGame(game);
      if (exportAfter) await window.eduGame.exportGame(saved);
      root.innerHTML = '';
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
      const saved = await window.eduGame.saveGame(game);
      if (exportAfter) await window.eduGame.exportGame(saved);
      root.innerHTML = '';
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
      explanation: $('[data-field="explanation"]', el).value.trim()
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
    const saved = await window.eduGame.saveGame(game);
    if (exportAfter) await window.eduGame.exportGame(saved);
    root.innerHTML = '';
    await refreshDb();
    navigate('library');
    toast(`Đã lưu “${saved.title}”.`);
  } catch (e) { toast(e.message || 'Không lưu được trò chơi.'); }
}

/* G6 — kéo-thả trong trình soạn thảo (matching + race). DOM (#matchingPairs,
   #raceTeams, #raceCells, #raceQuestions) vẫn là nguồn dữ liệu duy nhất; kéo-thả
   chỉ đổi thứ tự/tham chiếu trong DOM rồi vẽ lại preview. Handle có draggable
   riêng vì row chứa <input> (draggable cả row sẽ chặn chọn/sửa chữ). */
const EDITOR_CELL_ICON = { boost: '⚡', penalty: '🪨', lucky: '🎁', challenge: '⚔️' };
const EDITOR_CELL_NAME = { boost: 'Tăng tốc', penalty: 'Chướng ngại', lucky: 'May mắn', challenge: 'Thử thách' };
let racePreviewTheme = 'editor';
let dragState = null;

function beginDrag(event, element, kind, value) {
  dragState = { element, kind, value };
  if (element) element.classList.add('dragging');
  if (event && event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    try { event.dataTransfer.setData('text/plain', kind || 'move'); } catch (error) { /* synthetic DragEvent has no usable DataTransfer */ }
  }
}
function clearDropHighlights(scope) {
  if (!scope) return;
  $$('.drag-over', scope).forEach(el => el.classList.remove('drag-over'));
}
function endDrag(scope) {
  if (dragState && dragState.element) dragState.element.classList.remove('dragging');
  dragState = null;
  clearDropHighlights(scope);
}
function reorderByDrop(list, dragged, target, clientY) {
  if (!dragged || !target || dragged === target || !list.contains(dragged)) return;
  const rect = target.getBoundingClientRect();
  const after = clientY > rect.top + rect.height / 2;
  list.insertBefore(dragged, after ? target.nextElementSibling : target);
}
function bindDragList(list, itemSelector, onReorder) {
  if (!list) return;
  list.addEventListener('dragstart', event => {
    const handle = event.target.closest('[draggable="true"]');
    if (!handle || !list.contains(handle)) return;
    const item = handle.closest(itemSelector);
    if (!item) return;
    beginDrag(event, item, 'reorder');
  });
  list.addEventListener('dragover', event => {
    if (!dragState || dragState.kind !== 'reorder') return;
    const item = event.target.closest(itemSelector);
    if (!item || item === dragState.element) return;
    event.preventDefault();
    clearDropHighlights(list);
    item.classList.add('drag-over');
  });
  list.addEventListener('dragleave', event => {
    if (!list.contains(event.relatedTarget)) clearDropHighlights(list);
  });
  list.addEventListener('drop', event => {
    if (!dragState || dragState.kind !== 'reorder') return;
    const item = event.target.closest(itemSelector);
    if (!item) return;
    event.preventDefault();
    reorderByDrop(list, dragState.element, item, event.clientY);
    endDrag(list);
    if (typeof onReorder === 'function') onReorder();
  });
  list.addEventListener('dragend', () => endDrag(list));
}

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
    ${editorAiButton(pair.id)}
    <button type="button" class="text-link" data-pair-up title="Lên">↑</button>
    <button type="button" class="text-link" data-pair-down title="Xuống">↓</button>
    <button type="button" class="text-link danger-text" data-pair-remove>✕</button>
  </div>`;
}
function matchingEditorHtml(matching) {
  const m = matching || defaultMatchingGame();
  return `<div id="matchingEditor" class="hidden">
    <div class="section-head"><h3>Cặp ghép kiến thức <span class="tag" id="matchingPairCount">${m.pairs.length}</span></h3><div><button type="button" class="btn btn-secondary btn-small" id="addMatchingPairBtn">＋ Thêm cặp</button></div></div>
    <p class="field-hint">Mỗi dòng gồm nội dung cột A và nội dung tương ứng ở cột B. Kéo biểu tượng ⠿ để sắp xếp lại thứ tự cặp (hoặc dùng ↑/↓). Ghép đúng: cộng điểm từng cặp; hoàn thành tất cả: cộng thưởng; sai: chỉ trừ điểm khi giáo viên đặt “Phạt mỗi lần sai” lớn hơn 0.</p>
    <div id="matchingPairs">${m.pairs.map((pair, i) => matchingPairRow(pair, i)).join('')}</div>
    <div class="field-row mt-[12px]">
      <div class="field"><label>CÁCH CHƠI</label><select id="matchingMode">
        <option value="columns" ${m.mode === 'columns' ? 'selected' : ''}>Ghép hai cột</option>
        <option value="memory" ${m.mode === 'memory' ? 'selected' : ''}>Lật thẻ ghi nhớ</option>
        <option value="categorize" ${m.mode === 'categorize' ? 'selected' : ''}>Phân loại kiến thức</option>
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
    <p class="field-hint" id="matchingModeHint"></p>
  </div>`;
}
function matchingModeHint(mode) {
  return ({
    columns: 'Ghép hai cột: chọn một mục ở cột A rồi chọn mục tương ứng ở cột B. Phù hợp bài học nhiều khái niệm.',
    memory: 'Lật thẻ ghi nhớ: lật từng thẻ để tìm hai nội dung tương ứng. Phù hợp ghi nhớ từ vựng và thuật ngữ.',
    categorize: 'Phân loại kiến thức: nội dung cột A là nhóm, nội dung cột B là các thẻ cần đưa vào đúng nhóm.'
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
    const hint = $('#matchingModeHint', root);
    if (hint) hint.textContent = matchingModeHint($('#matchingMode', root).value);
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
  bindDragList(list, '.matching-pair-row');
  syncHints();
}
function readMatchingEditor(root) {
  const pairs = $$('#matchingPairs .matching-pair-row', root).map((row, index) => ({
    id: row.dataset.pairId || `p${index + 1}`,
    left: row.querySelector('[data-pair-left]').value.trim(),
    right: row.querySelector('[data-pair-right]').value.trim()
  }));
  return {
    mode: $('#matchingMode', root).value,
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
  const usesQuestions = t === 'quiz' || t === 'scenario';
  const sectionHead = $('#importQuestionsBtn', root)?.closest('.section-head');
  if (sectionHead) sectionHead.classList.toggle('hidden', !usesQuestions);
  set('#editorQuestions', usesQuestions);
}

function newPanelId(prefix) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }

function defaultTreasureHunt() {
  const s1 = 'stage-1', s2 = 'stage-2';
  return {
    character: 'Nhà thám hiểm',
    intro: 'Bắt đầu hành trình khám phá kho tàng kiến thức!',
    journeyBonus: 300,
    hiddenItemBonus: 50,
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
  const options = stage.question?.options || [];
  const correctId = stage.question?.correctOptionId;
  return `<div class="treasure-stage-card" data-stage-id="${escapeHtml(stage.id)}">
    <div class="treasure-stage-head"><strong>CHẶNG <span data-stage-num>${index + 1}</span></strong>
      <input data-stage-name value="${escapeHtml(stage.name || '')}" placeholder="Tên chặng">
      <span class="tag ${stage.nextStageId ? 'hidden' : ''}" data-ending-tag>KẾT THÚC</span>
      ${editorAiButton(stage.id)}
      <button type="button" class="text-link" data-stage-toggle>Ẩn/hiện</button>
      <button type="button" class="text-link" data-stage-copy>⧉ Nhân bản</button>
      <button type="button" class="text-link" data-stage-up>↑</button>
      <button type="button" class="text-link" data-stage-down>↓</button>
      <button type="button" class="text-link danger-text" data-stage-remove>✕</button>
    </div>
    <div class="treasure-stage-body">
      <label>CỐT TRUYỆN / LỜI DẪN</label><textarea data-stage-story rows="2" placeholder="Bối cảnh, lời dẫn của nhân vật">${escapeHtml(stage.story || '')}</textarea>
      <label>MÔ TẢ NHIỆM VỤ</label><textarea data-stage-task rows="2" placeholder="Học sinh cần làm gì ở chặng này">${escapeHtml(stage.taskDescription || '')}</textarea>
      <label>CÂU ĐỐ</label><textarea data-stage-prompt rows="2" placeholder="Nội dung câu đố">${escapeHtml(stage.question?.prompt || '')}</textarea>
      <div class="treasure-options" data-stage-options>${options.map((o, j) => treasureOptionRow(o, stage.id, correctId, j)).join('')}<button type="button" class="btn btn-secondary btn-small" data-stage-add-option>＋ Thêm đáp án</button></div>
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
function bindTreasureEditor(root) {
  const list = $('#treasureStages', root);
  $('#addTreasureStageBtn', root).addEventListener('click', () => {
    list.insertAdjacentHTML('beforeend', newTreasureStageHtml($$('.treasure-stage-card', list).length));
    refreshTreasureUi(root);
  });
  list.addEventListener('input', e => {
    if (e.target.matches('[data-stage-name]')) refreshTreasureUi(root);
  });
  list.addEventListener('change', e => {
    if (e.target.matches('[data-stage-next]')) {
      const card = e.target.closest('.treasure-stage-card');
      const tag = card.querySelector('[data-ending-tag]');
      if (tag) tag.classList.toggle('hidden', e.target.value !== '__ending__');
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
    if (b.matches('[data-stage-copy]')) {
      const html = treasureStageHtml({
        id: newPanelId('stage'),
        name: (card.querySelector('[data-stage-name]').value || 'Chặng') + ' (bản sao)',
        story: card.querySelector('[data-stage-story]').value,
        taskDescription: card.querySelector('[data-stage-task]').value,
        question: {
          prompt: card.querySelector('[data-stage-prompt]').value,
          options: $$('.treasure-option-row', card).map(row => ({ id: row.dataset.optId, text: row.querySelector('[data-opt-text]').value })),
          correctOptionId: card.querySelector('[data-opt-correct]:checked')?.closest('.treasure-option-row')?.dataset.optId || 'a',
          explanation: card.querySelector('[data-stage-explanation]').value,
          hint: card.querySelector('[data-stage-hint]').value
        },
        attempts: Number(card.querySelector('[data-stage-attempts]').value) || 0,
        points: Number(card.querySelector('[data-stage-points]').value) || 100,
        completionBonus: Number(card.querySelector('[data-stage-bonus]').value) || 200,
        nextStageId: null,
        hasHiddenItem: card.querySelector('[data-stage-item]').checked
      }, $$('.treasure-stage-card', list).length);
      card.insertAdjacentHTML('afterend', html);
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
  refreshTreasureUi(root);
}
function readTreasureEditor(root) {
  const stages = $$('#treasureStages .treasure-stage-card', root).map(card => {
    const next = card.querySelector('[data-stage-next]').value;
    const branch = card.querySelector('[data-stage-branch]').value;
    const correct = card.querySelector('[data-opt-correct]:checked');
    return {
      id: card.dataset.stageId,
      name: card.querySelector('[data-stage-name]').value.trim(),
      story: card.querySelector('[data-stage-story]').value.trim(),
      taskDescription: card.querySelector('[data-stage-task]').value.trim(),
      question: {
        prompt: card.querySelector('[data-stage-prompt]').value.trim(),
        options: $$('.treasure-option-row', card).map(row => ({ id: row.dataset.optId, text: row.querySelector('[data-opt-text]').value.trim() })),
        correctOptionId: correct ? correct.closest('.treasure-option-row').dataset.optId : '',
        explanation: card.querySelector('[data-stage-explanation]').value.trim(),
        hint: card.querySelector('[data-stage-hint]').value.trim()
      },
      attempts: Math.max(0, Number(card.querySelector('[data-stage-attempts]').value) || 0),
      points: Math.max(0, Number(card.querySelector('[data-stage-points]').value) || 100),
      completionBonus: Math.max(0, Number(card.querySelector('[data-stage-bonus]').value) || 200),
      nextStageId: next === '__ending__' ? null : next,
      ...(branch ? { branchLabel: card.querySelector('[data-stage-branch-label]').value.trim(), branchStageId: branch } : {}),
      hasHiddenItem: card.querySelector('[data-stage-item]').checked
    };
  });
  return {
    character: $('#treasureCharacter', root).value.trim() || 'Nhà thám hiểm',
    intro: $('#treasureIntro', root).value.trim(),
    journeyBonus: Math.max(0, Number($('#treasureJourneyBonus', root).value) || 300),
    hiddenItemBonus: Math.max(0, Number($('#treasureHiddenItemBonus', root).value) || 50),
    stages
  };
}
function validateTreasureData(hunt) {
  if (hunt.stages.length < 2) return 'Hành trình cần ít nhất 2 chặng.';
  const ids = hunt.stages.map(s => s.id);
  if (new Set(ids).size !== ids.length) return 'Mỗi chặng đang có ID trùng lặp.';
  for (const s of hunt.stages) {
    if (!s.name) return 'Mỗi chặng cần có tên.';
    if (!s.question.prompt) return `Chặng “${s.name}” cần có nội dung câu đố.`;
    if (s.question.options.length < 2 || s.question.options.some(o => !o.text)) return `Câu đố chặng “${s.name}” cần ít nhất 2 đáp án đầy đủ.`;
    if (new Set(s.question.options.map(o => o.id)).size !== s.question.options.length) return `Đáp án chặng “${s.name}” đang có ID trùng.`;
    if (!s.question.options.some(o => o.id === s.question.correctOptionId)) return `Chặng “${s.name}” chưa chọn đáp án đúng.`;
    if (s.nextStageId !== null && !ids.includes(s.nextStageId)) return `Chặng “${s.name}” trỏ tới chặng không tồn tại.`;
    if (s.branchStageId && (!s.branchLabel || s.branchStageId === s.id || !ids.includes(s.branchStageId))) return `Nhánh phụ của chặng “${s.name}” không hợp lệ (cần nhãn và đích khác chính nó).`;
  }
  if (!hunt.stages.some(s => s.nextStageId === null)) return 'Cần ít nhất một chặng đánh dấu “Kết thúc tại đây”.';
  return null;
}

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
  return `<div class="race-team-row" data-team-id="${escapeHtml(team.id || `t${index + 1}`)}">
    <span class="drag-handle" draggable="true" data-team-drag title="Kéo để sắp xếp đội">⠿</span>
    <input data-team-icon value="${escapeHtml(team.icon || '🏎️')}" class="w-[60px]" placeholder="🏎️" title="Biểu tượng đội">
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
        difficulty: card.querySelector('[data-rq-difficulty]').value
      }, $$('.race-question-card', questions).length);
      card.insertAdjacentHTML('afterend', html);
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
      icon: row.querySelector('[data-team-icon]').value.trim() || '🏎️'
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
        difficulty: card.querySelector('[data-rq-difficulty]').value
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