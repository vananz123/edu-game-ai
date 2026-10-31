// @ts-nocheck -- migrated legacy UI logic; new contracts are typed in src/shared/types.ts.
function navigate(page) {
  // #120: leaving the library always closes any open card menu, even though the
  // re-render would drop the nodes anyway (the next page may reuse the same ids).
  if (typeof closeGameMenus === 'function') closeGameMenus();
  state.page = page;
  state.search = '';
  render();
  if (page === 'my-projects') refreshProjectsPage();
  if (page === 'lesson-plans') refreshLessonLibraryPage();
}
/**
 * #119/#120: closes every open "•••" card menu and resets its toggle. Idempotent, and
 * never throws when the page has been re-rendered (the nodes are simply gone).
 */
function closeGameMenus() {
  document.querySelectorAll('[role="menu"]:not([hidden])').forEach(menu => menu.setAttribute('hidden', ''));
  document.querySelectorAll('[data-menu-toggle][aria-expanded="true"]').forEach(toggle => toggle.setAttribute('aria-expanded', 'false'));
}

/**
 * #119: the small "•••" menu on a game card. The toggle only opens/closes its own menu;
 * closing on "anything else" is handled in `bootstrap.ts` (outside click, Escape,
 * scroll, window resize, page change), because those events happen outside this page's
 * node list — a listener re-wired per render would miss them.
 */
function wireGameMenus() {
  const root = $('#pageContent');
  if (!root) return;
  root.querySelectorAll('[data-menu-toggle]').forEach(toggle => {
    toggle.addEventListener('click', event => {
      // The document-level "click outside" listener runs in the capture phase, before
      // this handler: it must see that the click is inside a card menu and stay out.
      event.stopPropagation();
      const menu = document.getElementById(toggle.dataset.menuToggle);
      if (!menu) return;
      const willOpen = menu.hasAttribute('hidden');
      // One menu at a time, and never leave a stale `aria-expanded` behind.
      closeGameMenus();
      if (willOpen) {
        menu.removeAttribute('hidden');
        toggle.setAttribute('aria-expanded', 'true');
      }
    });
  });
}

/**
 * #122: updates the lesson selection bar without re-rendering the list, so the
 * checkbox the teacher just clicked keeps focus. The "select all" box reflects only
 * the boxes on the current page.
 */
function updateLessonSelectionUi() {
  const selected = state.lessonSelection instanceof Set ? state.lessonSelection : new Set();
  document.querySelectorAll('#pageContent [data-lesson-id]').forEach(card => {
    const isSelected = selected.has(card.dataset.lessonId);
    card.classList.toggle('border-[#c8c3ff]', isSelected);
    card.classList.toggle('bg-[#faf9ff]', isSelected);
    card.classList.toggle('border-line', !isSelected);
    if (isSelected) card.setAttribute('data-selected', 'true');
    else card.removeAttribute('data-selected');
  });
  const count = document.querySelector('[data-lesson-selected-count]');
  if (count) count.textContent = selected.size ? `Đã chọn ${selected.size} giáo án` : 'Hoặc tick từng giáo án để xoá nhiều cùng lúc';
  const remove = document.querySelector('#lessonDeleteSelectedBtn');
  if (remove) {
    remove.disabled = selected.size === 0;
    remove.textContent = selected.size ? `🗑 Xoá đã chọn (${selected.size})` : '🗑 Xoá đã chọn';
  }
  const clear = document.querySelector('#lessonClearSelectionBtn');
  if (clear) clear.disabled = selected.size === 0;
  const boxes = [...document.querySelectorAll('#pageContent .lesson-check[data-action="lesson-select"]')];
  const all = document.querySelector('#lessonSelectAll');
  if (all) all.checked = boxes.length > 0 && boxes.every(box => box.checked);
}

/**
 * #123: updates the results selection bar without re-rendering the table, so the
 * checkbox just clicked keeps focus (same approach as #122 on the lesson page).
 */
function updateSessionSelectionUi() {
  const selected = state.sessionSelection instanceof Set ? state.sessionSelection : new Set();
  document.querySelectorAll('#pageContent [data-session-id]').forEach(row => {
    const isSelected = selected.has(row.dataset.sessionId);
    row.classList.toggle('bg-[#faf9ff]', isSelected);
    if (isSelected) row.setAttribute('data-selected', 'true');
    else row.removeAttribute('data-selected');
  });
  const count = document.querySelector('[data-session-selected-count]');
  if (count) count.textContent = selected.size ? `Đã chọn ${selected.size} lượt chơi` : 'Hoặc tick từng lượt để xoá nhiều cùng lúc';
  const remove = document.querySelector('#sessionDeleteSelectedBtn');
  if (remove) {
    remove.disabled = selected.size === 0;
    remove.textContent = selected.size ? `🗑 Xoá đã chọn (${selected.size})` : '🗑 Xoá đã chọn';
  }
  const clear = document.querySelector('#sessionClearSelectionBtn');
  if (clear) clear.disabled = selected.size === 0;
  const boxes = [...document.querySelectorAll('#pageContent [data-action="session-select"]')];
  const all = document.querySelector('#sessionSelectAll');
  if (all) all.checked = boxes.length > 0 && boxes.every(box => box.checked);
}

function wirePage() {
  if (state.page === 'create-wizard') wireCreateWizard();
  // #129/#130: the editor page markup is inserted by the shell, so its fields are bound
  // here, after insertion (same contract as every other page).
  if (state.page === 'editor' && typeof wireEditorPage === 'function') wireEditorPage($('#pageContent'));
  wireGameMenus();
  $('#pageContent').querySelectorAll('[data-page]').forEach(el => el.addEventListener('click', () => navigate(el.dataset.page)));
  $('#pageContent').querySelectorAll('[data-action]').forEach(el => el.addEventListener('click', () => {
    // #120: picking a feature from a card menu closes it first, so the action (play,
    // LAN, edit, export, delete) never leaves the menu floating above the new screen.
    if (typeof closeGameMenus === 'function') closeGameMenus();
    handleAction(el.dataset.action, el.dataset.id, el);
  }));
  $('#pageContent').querySelectorAll('[data-template]').forEach(el => el.addEventListener('click', () => { state.draft = { ...collectDraft() }; state.selectedTemplate = el.dataset.template; render(); }));
  ['#setupDifficulty', '#setupDuration', '#setupPoints', '#setupTimeBonus', '#setupStyle', '#setupPlayers', '#setupCompetition', '#setupPointsEasy', '#setupPointsMedium', '#setupPointsHard'].forEach(sel => $(sel)?.addEventListener('change', () => { state.draft = { ...collectDraft() }; }));
  $('#setupScoringMode')?.addEventListener('change', () => { updateScoringVisibility(); state.draft = { ...collectDraft() }; });
  if ($('#setupScoringMode')) updateScoringVisibility();
  // `#librarySearch` (games) and `#lessonSearch` (lesson plans) share the search state
  // but have separate ids (#122): the old shared id let both pages' listeners attach
  // to whichever input existed and restored the caret into the wrong field.
  ['#librarySearch', '#lessonSearch'].forEach(selector => {
    const search = $(selector);
    if (!search) return;
    search.addEventListener('input', event => {
      state.search = event.target.value;
      // Typing a filter always starts at the first page of the new result set.
      state.lessonPage = 0;
      const pos = event.target.selectionStart;
      render();
      const next = $(selector);
      if (!next) return;
      next.focus();
      next.setSelectionRange(pos, pos);
    });
  });
  const filter = $('#templateFilter'); if (filter) filter.addEventListener('change', e => { state.filter = e.target.value; render(); });
  // #123: "Chọn tất cả trang này" for the results table — only the rendered rows.
  const sessionSelectAll = $('#sessionSelectAll');
  if (sessionSelectAll) {
    sessionSelectAll.addEventListener('change', () => {
      if (!(state.sessionSelection instanceof Set)) state.sessionSelection = new Set();
      document.querySelectorAll('#pageContent [data-action="session-select"]').forEach(box => {
        const sessionId = box.dataset.id;
        if (!sessionId) return;
        box.checked = sessionSelectAll.checked;
        if (sessionSelectAll.checked) state.sessionSelection.add(sessionId);
        else state.sessionSelection.delete(sessionId);
      });
      updateSessionSelectionUi();
    });
  }
  // #122: "Chọn tất cả trang này" ticks only the boxes currently rendered, so it never
  // selects documents the teacher cannot see.
  const selectAll = $('#lessonSelectAll');
  if (selectAll) {
    selectAll.addEventListener('change', () => {
      if (!(state.lessonSelection instanceof Set)) state.lessonSelection = new Set();
      document.querySelectorAll('#pageContent .lesson-check[data-action="lesson-select"]').forEach(box => {
        const docId = box.dataset.id;
        if (!docId) return;
        box.checked = selectAll.checked;
        if (selectAll.checked) state.lessonSelection.add(docId);
        else state.lessonSelection.delete(docId);
      });
      updateLessonSelectionUi();
    });
  }
  $('#generateBtn')?.addEventListener('click', generateGame);
  // #132: every AI provider control lives in Settings (spec §1). Each button names
  // its provider in a data attribute, so the handlers never guess which one.
  $$('[data-ai-test]').forEach(button => {
    button.addEventListener('click', () => testAiProvider(button.dataset.aiTest));
  });
  $$('[data-ai-key-save]').forEach(button => {
    button.addEventListener('click', () => saveAiProviderKey(button.dataset.aiKeySave));
  });
  // #132: the wizard's compact provider picker (only present with 2+ usable providers).
  $('#wizardProviderSelect')?.addEventListener('change', event => wizardSelectProvider(event.target.value));
  $$('[data-ai-key-clear]').forEach(button => {
    button.addEventListener('click', () => markAiProviderKeyClear(button.dataset.aiKeyClear));
  });
  $('#localModelSelect')?.addEventListener('change', async event => {
    const localModelId = event.target.value;
    const draft = state.page === 'create' ? collectDraft() : state.draft;
    const settings = {
      ...state.settings,
      ai: { ...state.settings.ai, localModelId }
    };
    try {
      await window.eduGame.saveSettings(settings);
      state.settings = await window.eduGame.getSettings();
      if (draft) state.draft = { ...draft, localModelId };
      render();
    } catch (error) {
      toast(`Không lưu được model đã chọn: ${error.message}`);
    }
  });
  $('#installLocalModelBtn')?.addEventListener('click', () => installLocalModel());
  $('#openLocalAiSettingsModalBtn')?.addEventListener('click', () => openLocalAiModal());
  // Trang "Tạo trò chơi" chỉ tạo thủ công: cả hai nút đều mở trình chỉnh sửa trống.
  $('#previewManualBtn')?.addEventListener('click', () => window.createBlankGame?.());
  $('#saveSettingsBtn')?.addEventListener('click', saveSettings);
  // #132: the old single-provider test button is gone; each provider has its own.
  // update_plan_3 §8: task manager + CPU-only runtime verification panel.
  if (state.page === 'settings' && typeof wireSettingsAiTasks === 'function') wireSettingsAiTasks();
}
async function handleLessonDrop(event) {
  try {
    if (event && event.preventDefault) event.preventDefault();
    const zone = document.getElementById('lessonDropzone');
    if (zone) zone.classList.remove('border-[#6258e8]', 'bg-[#f4f3ff]');
    const file = event && event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
    const filePath = file && file.path;
    if (!filePath) {
      toast('Không lấy được đường dẫn tệp. Hãy dùng nút nhập giáo án.');
      return;
    }
    const doc = await window.eduGame.importDocumentFromPath(filePath);
    if (doc) {
      const stored = await window.eduGame.saveLessonDocument({
        name: doc.name,
        ext: (doc.name || '').split('.').pop() || 'txt',
        text: doc.text,
        characters: doc.characters,
        sizeBytes: Number(doc.sizeBytes) || 0
      });
      state.importedDoc = { ...doc, id: stored.id };
      const old = state.draft || {};
      state.draft = { ...old, text: doc.text, sourceName: doc.name };
      state.lessonLibrary = null;
      if (state.page === 'lesson-plans') await refreshLessonLibraryPage(); else render();
      toast(`Đã lưu giáo án “${doc.name}” (${Number(doc.characters || 0).toLocaleString('vi-VN')} ký tự).`);
    }
  } catch (error) {
    toast(`Không nhập được tệp: ${(error && error.message) || 'lỗi không xác định'}`);
  }
}
window.handleLessonDrop = handleLessonDrop;

async function handleAction(action, id, element) { try {
    if (action === 'play') playGame(findGame(id));
    if (action === 'play-fullscreen') await playGameFullscreen(findGame(id));
    // 📱 Chơi LAN from a library card: open the game the normal way, then host a
    // room for it. `lanOpenRoom` reads `state.currentGame`, which `playGame` sets.
    if (action === 'lan') {
      const game = findGame(id);
      if (game && playGame(game) && typeof lanOpenRoom === 'function') await lanOpenRoom();
    }
    if (action === 'edit') editGame(findGame(id));
    if (action === 'import-document') {
      const doc = await window.eduGame.importDocument();
      if (doc) {
        const stored = await window.eduGame.saveLessonDocument({
          name: doc.name,
          ext: (doc.name || '').split('.').pop() || 'txt',
          text: doc.text,
          characters: doc.characters,
          sizeBytes: Number(doc.sizeBytes) || 0
        });
        state.importedDoc = { ...doc, id: stored.id };
        const old = state.draft || {};
        state.draft = { ...old, text: doc.text, sourceName: doc.name };
        // Keep the source immediately, not only when a game is generated.
        state.lessonLibrary = null;
        if (state.page === 'lesson-plans') await refreshLessonLibraryPage(); else render();
        toast(`Đã lưu giáo án “${doc.name}” (${Number(doc.characters || 0).toLocaleString('vi-VN')} ký tự).`);
      }
    }
    if (action === 'import-game') {
      // #118: the export existed but nothing could read a package back. The main
      // process validates the file and assigns a fresh id, so a re-import never
      // overwrites the original game.
      try {
        const game = await window.eduGame.importGame();
        if (!game) return; // the teacher cancelled the file dialog
        const saved = await window.eduGame.saveGame(game);
        await refreshDb();
        render();
        toast(`Đã nhập “${saved.title}” vào Thư viện trò chơi.`);
      } catch (error) {
        toast(`Không nhập được gói .egame: ${(error && error.message) || 'tệp không hợp lệ'}`);
      }
    }
    if (action === 'open-project') {
      navigate('create-wizard');
      await wizardOpenProject(id);
    }
    if (action === 'rename-project') {
      const project = (state.projects || []).find(item => item.id === id);
      const currentTitle = project ? (project.title || '') : '';
      const nextTitle = window.prompt('Đổi tên dự án:', currentTitle);
      if (nextTitle === null) return;
      const trimmed = String(nextTitle).trim();
      if (!trimmed) return toast('Tên dự án không được để trống.');
      if (!project) return toast('Không tìm thấy dự án.');
      const updated = { ...project, title: trimmed, updatedAt: new Date().toISOString() };
      await window.eduGame.saveProjectDraft(updated);
      await refreshProjectsPage();
      toast('Đã đổi tên dự án.');
    }
    if (action === 'delete-project') {
      const project = (state.projects || []).find(item => item.id === id);
      if (confirm(`Xoá dự án “${project ? project.title : 'này'}”?\nTrò chơi đã lưu trong Thư viện trò chơi vẫn được giữ lại.`)) {
        await window.eduGame.deleteProject(id);
        await refreshProjectsPage();
        toast('Đã xoá dự án.');
      }
    }
    // #122: lesson list paging and batch selection. Selection lives in
    // `state.lessonSelection` (a Set of ids), so it survives moving between pages.
    // #123: results history — paging and batch delete, mirroring #122 on the lesson page.
    if (action === 'session-page') {
      const target = Number(element && element.dataset ? element.dataset.pageIndex : 0);
      state.sessionPage = Number.isFinite(target) && target >= 0 ? Math.floor(target) : 0;
      render();
      return;
    }
    if (action === 'session-select') {
      if (!(state.sessionSelection instanceof Set)) state.sessionSelection = new Set();
      if (element && element.checked) state.sessionSelection.add(id);
      else state.sessionSelection.delete(id);
      updateSessionSelectionUi();
      return;
    }
    if (action === 'session-clear-selection') {
      state.sessionSelection = new Set();
      render();
      return;
    }
    if (action === 'session-delete-selected') {
      const ids = state.sessionSelection instanceof Set ? [...state.sessionSelection] : [];
      if (!ids.length) return;
      // Deleting a result is irreversible but narrow: it never touches the game, the
      // lesson document or another player's result. The wording says so, because a
      // teacher may expect "xoá" to mean more.
      if (!confirm(`Xoá ${ids.length} lượt chơi đã chọn khỏi lịch sử?\nKết quả này không thể khôi phục. Trò chơi và giáo án vẫn được giữ nguyên.`)) return;
      try {
        const result = await window.eduGame.deleteSessions(ids);
        state.sessionSelection = new Set();
        state.db = await window.eduGame.getLibrary();
        render();
        const parts = [`Đã xoá ${result.deleted} lượt chơi`];
        if (result.missing) parts.push(`${result.missing} không còn tồn tại`);
        toast(`${parts.join(', ')}.`);
      } catch (error) {
        toast(`Không xoá được lượt chơi: ${(error && error.message) || 'lỗi không xác định'}`);
      }
      return;
    }
    if (action === 'lesson-page') {
      const target = Number(element && element.dataset ? element.dataset.pageIndex : 0);
      state.lessonPage = Number.isFinite(target) && target >= 0 ? Math.floor(target) : 0;
      render();
      return;
    }
    if (action === 'lesson-select') {
      if (!(state.lessonSelection instanceof Set)) state.lessonSelection = new Set();
      const checked = Boolean(element && element.checked);
      if (checked) state.lessonSelection.add(id);
      else state.lessonSelection.delete(id);
      // Re-render only the count and the delete button: a full render would rebuild
      // the checkbox the teacher just clicked and lose keyboard focus.
      updateLessonSelectionUi();
      return;
    }
    if (action === 'lesson-clear-selection') {
      state.lessonSelection = new Set();
      render();
      return;
    }
    if (action === 'lesson-delete-selected') {
      const ids = state.lessonSelection instanceof Set ? [...state.lessonSelection] : [];
      if (!ids.length) return;
      const library = Array.isArray(state.lessonLibrary) ? state.lessonLibrary : [];
      const names = ids.map(lessonId => (library.find(document => document.id === lessonId) || {}).name || 'giáo án');
      const analysisCount = ids.reduce((sum, lessonId) => {
        const doc = library.find(document => document.id === lessonId);
        return sum + (doc && Array.isArray(doc.analyses) ? doc.analyses.length : 0);
      }, 0);
      const preview = names.slice(0, 5).map(name => `• ${name}`).join('\n') + (names.length > 5 ? `\n• … và ${names.length - 5} tệp khác` : '');
      const detail = analysisCount ? `\n${analysisCount} kết quả phân tích và phần trích dẫn của các tài liệu này cũng bị xoá.` : '';
      if (!confirm(`Xoá ${ids.length} giáo án đã chọn?\n${preview}${detail}\nTrò chơi đã lưu trong Thư viện vẫn được giữ lại.`)) return;
      try {
        const result = await window.eduGame.deleteLessonDocuments(ids);
        state.lessonSelection = new Set();
        state.lessonLibrary = null;
        await refreshLessonLibraryPage();
        const parts = [`Đã xoá ${result.deleted} giáo án`];
        if (result.missing) parts.push(`${result.missing} không còn tồn tại`);
        if (result.failed) parts.push(`${result.failed} lỗi`);
        toast(`${parts.join(', ')}.`);
      } catch (error) {
        toast(`Không xoá được giáo án: ${(error && error.message) || 'lỗi không xác định'}`);
      }
      return;
    }
    if (action === 'delete-lesson') {
      // `state.lessonLibrary` is the array `listLessonLibrary` returns (the page reads
      // it the same way); the `.documents` form is kept for older payloads.
      const docs = Array.isArray(state.lessonLibrary)
        ? state.lessonLibrary
        : ((state.lessonLibrary && state.lessonLibrary.documents) || []);
      const doc = docs.find(item => item.id === id);
      const name = doc ? doc.name : 'giáo án này';
      const analysisCount = doc && Array.isArray(doc.analyses) ? doc.analyses.length : 0;
      const detail = analysisCount ? `\n${analysisCount} kết quả phân tích và phần trích dẫn của tài liệu cũng bị xoá.` : '';
      if (!confirm(`Xoá “${name}” khỏi kho giáo án?${detail}\nTrò chơi đã lưu trong Thư viện vẫn được giữ lại.`)) return;
      try {
                // The IPC answers `true`/`false` (see `LessonStore.deleteDocument`).
                const deleted = await window.eduGame.deleteLessonDocument(id);
                state.lessonLibrary = null;
                await refreshLessonLibraryPage();
                toast(deleted ? `Đã xoá “${name}”.` : 'Không tìm thấy giáo án để xoá.');
      } catch (error) {
        toast(`Không xoá được giáo án: ${(error && error.message) || 'lỗi không xác định'}`);
      }
    }
    if (action === 'open-lesson') {
      navigate('create-wizard');
      await wizardOpenSavedLesson(id, element && element.dataset ? element.dataset.analysis : '');
    }
    if (action === 'create-from-lesson') {
      navigate('create-wizard');
      await wizardCreateGameFromSavedLesson(id, element && element.dataset ? element.dataset.analysis : '');
    }
    if (action === 'export-first') {
      const game = state.db.games[0];
      if (!game) return toast('Thư viện chưa có trò chơi để xuất.');
      const result = await window.eduGame.exportGame(game);
      if (result?.ok) toast('Đã xuất gói trò chơi.');
    }
    if (action === 'export-game') {
      const game = findGame(id);
      if (!game) return toast('Không tìm thấy trò chơi.');
      const result = await window.eduGame.exportGame(game);
      if (result?.ok) toast('Đã xuất gói trò chơi ra tệp .egame.');
    }
    if (action === 'clear-lesson') { state.importedDoc = null; render(); toast('Đã xóa giáo án đã nhập.'); }
    if (action === 'delete') {
      const target = findGame(id);
      if (confirm('Xóa vĩnh viễn “' + (target?.title || 'trò chơi này') + '” khỏi máy?\nKhông thể hoàn tác — hãy xuất gói .egame trước nếu muốn giữ bản sao.')) { await window.eduGame.deleteGame(id); await refreshDb(); render(); toast('Đã xóa “' + (target?.title || 'trò chơi') + '”.'); }
    }
    if (action === 'qa-ask') {
      const docId = $('#qaDocSelect')?.value;
      const question = String($('#qaQuestion')?.value || '').trim();
      const answerBox = $('#qaAnswer');
      if (!docId) { toast('Chọn giáo án để hỏi.'); return; }
      if (!question) { toast('Nhập câu hỏi.'); return; }
      if (answerBox) { answerBox.classList.remove('hidden'); answerBox.textContent = 'Đang trả lời...'; }
      try {
        const result = await window.eduGame.answerLessonQuestion({ documentId: docId, question });
        if (answerBox) answerBox.innerHTML = `<div class="font-semibold mb-[6px]">${escapeHtml(result?.answer || '')}</div>` + (Array.isArray(result?.citations) ? result.citations : []).map((c, i) => `<div class="mt-[8px] text-[11px] text-[#6f7890]"><strong>[${i + 1}]</strong> ${escapeHtml(c)}</div>`).join('');
      } catch (e) { if (answerBox) answerBox.textContent = (e && e.message) || 'Lỗi hỏi đáp.'; }
      return;
    }
    if (action === 'export-results') exportResults();
  } catch (e) { toast(e.message || 'Đã xảy ra lỗi.'); }
}
function findGame(id) { return state.db.games.find(g => g.id === id); }
function updateScoringVisibility() {
  const mode = $('#setupScoringMode')?.value || 'tốc độ';
  const timeBonusField = $('#timeBonusField');
  if (timeBonusField) timeBonusField.classList.toggle('hidden', mode !== 'tốc độ');
  ['pointsEasyField', 'pointsMediumField', 'pointsHardField'].forEach(id => {
    const field = document.getElementById(id);
    if (field) field.classList.toggle('hidden', mode !== 'theo độ khó');
  });
  // "Trung bình"/"Khó" sit in their own grid row; the row must follow the same
  // mode or it leaves an empty band (and now the row is the only container).
  const difficultyGrid = document.getElementById('pointsDifficultyGrid');
  if (difficultyGrid) difficultyGrid.classList.toggle('hidden', mode !== 'theo độ khó');
  const hint = $('#scoringModeHint');
  if (hint) hint.textContent = scoringModeHint(mode);
}
function collectDraft() {
  const bonusRaw = Number($('#setupTimeBonus')?.value ?? state.draft?.gameSetup?.timeBonus ?? 20);
  return {
    text: $('#sourceText')?.value || state.draft?.text || state.importedDoc?.text || '',
    title: $('#gameTitle')?.value || '',
    subject: $('#gameSubject')?.value || '',
    grade: $('#gameGrade')?.value || '',
    questionCount: $('#questionCount')?.value || '8',
    template: state.selectedTemplate,
    mode: $('#generationMode')?.value || state.settings.ai?.mode || 'offline',
    localModelId: $('#localModelSelect')?.value || state.settings.ai?.localModelId || '',
    analysis: state.draft?.analysis || null,
    qaEntries: state.draft?.qaEntries || [],
    assistMode: state.draft?.assistMode || '',
    useSuggestedQuestions: Boolean(state.draft?.useSuggestedQuestions),
    qaQuestion: $('#documentQuestion')?.value || state.draft?.qaQuestion || '',
    sourceName: state.importedDoc?.name || state.draft?.sourceName || '',
    contentSource: state.draft?.contentSource || ($('#sourceText') ? 'ai' : 'manual'),
    gameSetup: {
      scoringMode: $('#setupScoringMode')?.value || state.draft?.gameSetup?.scoringMode || 'tốc độ',
      difficulty: $('#setupDifficulty')?.value || state.draft?.gameSetup?.difficulty || 'trung bình',
      duration: $('#setupDuration')?.value || state.draft?.gameSetup?.duration || '10',
      pointsPerCorrect: $('#setupPoints')?.value || state.draft?.gameSetup?.pointsPerCorrect || '100',
      pointsEasy: $('#setupPointsEasy')?.value || state.draft?.gameSetup?.pointsEasy || '100',
      pointsMedium: $('#setupPointsMedium')?.value || state.draft?.gameSetup?.pointsMedium || '200',
      pointsHard: $('#setupPointsHard')?.value || state.draft?.gameSetup?.pointsHard || '300',
      timeBonus: String(Number.isFinite(bonusRaw) ? Math.min(50, Math.max(0, bonusRaw)) : 20),
      style: $('#setupStyle')?.value || state.draft?.gameSetup?.style || 'giáo dục',
      players: $('#setupPlayers')?.value || state.draft?.gameSetup?.players || 'cá nhân',
      competition: $('#setupCompetition')?.value || state.draft?.gameSetup?.competition || 'không'
    }
  };
}
