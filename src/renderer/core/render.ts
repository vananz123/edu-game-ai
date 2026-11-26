// @ts-nocheck -- migrated legacy UI logic; new contracts are typed in src/shared/types.ts.
function render() {
  // Step 1 of the wizard re-renders the whole page on every tick, tab switch
  // and debounced preview; keep the structure tree's scroll offsets so it does
  // not jump back to its first row.
  if (state.page === 'create-wizard' && typeof wizardStructureCaptureView === 'function') wizardStructureCaptureView();
  // #369: ở trang con thì mục sidebar của CHA phải sáng, nếu không người dùng mất chỗ đứng
  // khi mở trình soạn thảo (sidebar không có mục "Chỉnh sửa trò chơi").
  const activePage = typeof pageTrailRoot === 'function' ? pageTrailRoot(state.page, state.pageParent) : state.page;
  $$('.nav-item[data-page]').forEach(el => el.classList.toggle('active', el.dataset.page === activePage));
  $('#navGameCount').textContent = state.db.games.length;
  // DECISIONS #161: the sidebar block is chrome, not page content, so it refreshes
  // here — a game saved from the editor must appear in "Gần đây" without a reload.
  if (typeof renderSidebarShortcuts === 'function') renderSidebarShortcuts();
  // Chip tài khoản ở đáy sidebar cũng là chrome: nó phải đổi ngay sau khi đăng nhập/ra,
  // không đợi lần vẽ trang tiếp theo.
  if (typeof renderAccountChip === 'function') renderAccountChip();
  // #129: the game editor is a page of the shell, not a modal over the library.
  const renderers = { library: renderLibrary, 'create-wizard': renderCreateWizard, create: renderCreate, editor: renderEditorPage, 'lesson-plans': renderLessonPlans, 'my-projects': renderMyProjects, sessions: renderSessions, settings: renderSettings };
  const renderedPage = state.page;
  // The call must finish before the assignment: a renderer may open another page as a
  // side effect (`create` → editor), and writing its (old) markup afterwards replaced
  // the page that had just been opened — the literal string "undefined" in the
  // content, because the assignment string was computed before the switch. (#130)
  let html = '';
  try {
    html = (renderers[renderedPage] || renderLibrary)();
  } catch (error) {
    // The page could not be drawn; keep the shell usable and say so.
    try { console.error('[page] render failed on ' + renderedPage + ':', error && error.message ? error.message : error); } catch (e) {}
    html = '<section class="panel"><div class="section-head"><h3>Không hiển thị được trang này</h3></div>'
      + '<div class="panel-sub">Đã xảy ra lỗi khi vẽ trang. Hãy mở lại trang hoặc khởi động lại ứng dụng. Trang khác vẫn dùng được.</div></section>';
  }
  if (state.page !== renderedPage) { render(); return; }
  const pageContainer = $('#pageContent');
  if (pageContainer) {
    pageContainer.innerHTML = html;
    // #369: breadcrumb đứng trên đầu trang. Một chỗ duy nhất (đây) thay vì sửa 8 tệp page —
    // `pageTrailHtml` trả '' cho trang cấp 1 nên không có `<nav>` rỗng.
    // Trình soạn thảo tự vẽ đường dẫn NGAY TRONG header (cạnh `<h1>`), nên ở đây bỏ qua nó:
    // chèn thêm một dòng phía trên nữa là ba dòng chữ trước nội dung — chỗ bị chê là rối.
    if (typeof pageTrailHtml === 'function' && state.page !== 'editor') {
      const trail = pageTrailHtml(state.page, state.pageParent);
      if (trail) pageContainer.insertAdjacentHTML('afterbegin', trail);
    }
    if (window.__lastRenderedPage !== renderedPage) {
      window.__lastRenderedPage = renderedPage;
      pageContainer.classList.remove('page-fade-enter');
      void pageContainer.offsetWidth;
      pageContainer.classList.add('page-fade-enter');
    }
  }
  // DECISIONS #161: markup injected through `innerHTML` cannot call uiIcon(), so the
  // `data-icon` hooks it carries are filled here. Idempotent, and cheap: it only
  // touches elements that do not already hold the icon they ask for.
  if (typeof paintUiIcons === 'function') paintUiIcons(document);
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
