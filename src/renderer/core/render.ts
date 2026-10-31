// @ts-nocheck -- migrated legacy UI logic; new contracts are typed in src/shared/types.ts.
function render() {
  // Step 1 of the wizard re-renders the whole page on every tick, tab switch
  // and debounced preview; keep the structure tree's scroll offsets so it does
  // not jump back to its first row.
  if (state.page === 'create-wizard' && typeof wizardStructureCaptureView === 'function') wizardStructureCaptureView();
  $('#pageCrumb').textContent = pageNames[state.page] || 'EduGame Studio';
  $$('.nav-item[data-page]').forEach(el => el.classList.toggle('active', el.dataset.page === state.page));
  $('#navGameCount').textContent = state.db.games.length;
  // #129: the game editor is a page of the shell, not a modal over the library.
  const renderers = { home: renderHome, library: renderLibrary, 'create-wizard': renderCreateWizard, create: renderCreate, editor: renderEditorPage, 'lesson-plans': renderLessonPlans, 'my-projects': renderMyProjects, sessions: renderSessions, settings: renderSettings };
  const renderedPage = state.page;
  // The call must finish before the assignment: a renderer may open another page as a
  // side effect (`create` → editor), and writing its (old) markup afterwards replaced
  // the page that had just been opened — the literal string "undefined" in the
  // content, because the assignment string was computed before the switch. (#130)
  let html = '';
  try {
    html = (renderers[renderedPage] || renderHome)();
  } catch (error) {
    // The page could not be drawn; keep the shell usable and say so.
    try { console.error('[page] render failed on ' + renderedPage + ':', error && error.message ? error.message : error); } catch (e) {}
    html = '<section class="panel"><div class="section-head"><h3>Không hiển thị được trang này</h3></div>'
      + '<div class="panel-sub">Đã xảy ra lỗi khi vẽ trang. Hãy mở lại trang hoặc khởi động lại ứng dụng. Trang khác vẫn dùng được.</div></section>';
  }
  if (state.page !== renderedPage) { render(); return; }
  $('#pageContent').innerHTML = html;
  // The editor's pinned save bar sits flush under the top bar; other pages keep their
  // top padding.
  $('#pageContent').classList.toggle('editor-active', state.page === 'editor');
  try {
    wirePage();
  } catch (error) {
    // A page whose wiring throws must not take the shell down with it: the status bar
    // below is refreshed on every render and carries "stop llama.cpp" (DECISIONS #132
    // D15). Report once per page so the console still shows the real fault.
    if (window.__lastPageWireError !== state.page) {
      window.__lastPageWireError = state.page;
      try { console.error('[page] wiring failed on ' + state.page + ':', error && error.message ? error.message : error); } catch (e) {}
    }
  }
  // `innerHTML` cannot express `indeterminate`; re-apply the derived tristate.
  if (state.page === 'create-wizard' && wizardState.step === 'input' && typeof wizardSyncStructureCheckboxes === 'function') wizardSyncStructureCheckboxes();
  if (typeof window.refreshAiStatusBar === "function") window.refreshAiStatusBar();
}
