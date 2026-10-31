// @ts-nocheck -- migrated legacy UI logic; new contracts are typed in src/shared/types.ts.
async function refreshDb() { state.db = await window.eduGame.getLibrary(); }

/**
 * Loads the project list independently from the game library. `state.projects =
 * null` means "loading", which is different from an empty list and prevents the
 * page from flashing a false empty state.
 */
async function refreshProjectsPage() {
  state.projects = null;
  if (state.page === 'my-projects') render();
  try {
    const projects = await window.eduGame.listProjects();
    state.projects = Array.isArray(projects) ? projects : [];
  } catch (error) {
    state.projects = [];
    toast(`Không tải được danh sách dự án: ${(error && error.message) || 'lỗi không xác định'}`);
  }
  if (state.page === 'my-projects') render();
}

async function refreshLessonLibraryPage() {
  state.lessonLibrary = null;
  // #122: a fresh list (import, delete, re-open) starts at page 1 with nothing ticked,
  // so ids from another workspace's list can never be acted on.
  state.lessonPage = 0;
  state.lessonSelection = new Set();
  if (state.page === 'lesson-plans') render();
  try {
    const documents = await window.eduGame.listLessonLibrary();
    state.lessonLibrary = Array.isArray(documents) ? documents : [];
  } catch (error) {
    state.lessonLibrary = [];
    toast(`Không tải được kho giáo án: ${(error && error.message) || 'lỗi không xác định'}`);
  }
  if (state.page === 'lesson-plans') render();
}
async function showHelp() {
  $('#modalRoot').innerHTML = `<div class="modal-backdrop"><div class="modal"><div class="modal-head"><h2>Bắt đầu với EduGame Studio</h2><button class="modal-close" data-close>✕</button></div><div class="modal-body"><div class="help-list"><div class="help-item"><div class="help-number">1</div><div><strong>Tạo trò chơi</strong><p>Vào Tạo trò chơi, dán nội dung hoặc nạp giáo án DOCX/PDF/PPTX/TXT. Chọn thể loại và tạo bản nháp.</p></div></div><div class="help-item"><div class="help-number">2</div><div><strong>Duyệt đáp án</strong><p>Chế độ offline tạo bản nháp theo quy tắc, không phải AI. Hãy kiểm tra kỹ từng câu trước khi lưu.</p></div></div><div class="help-item"><div class="help-number">3</div><div><strong>Chơi trong lớp</strong><p>Mở game, chọn đáp án, đọc phần giải thích rồi lưu điểm theo tên học sinh hoặc đội.</p></div></div><div class="help-item"><div class="help-number">4</div><div><strong>Dùng AI</strong><p>Vào Cài đặt để cấu hình API tương thích OpenAI hoặc endpoint local. API online có thể gửi nội dung tài liệu tới nhà cung cấp.</p></div></div></div><div class="info-box mt-[18px]">Mẹo: xuất gói .egame để sao chép trò chơi sang máy khác. Sau khi nhập vào thư viện, game có thể chạy không cần Internet.</div></div></div></div>`;
  $('#modalRoot').querySelector('[data-close]').onclick = () => $('#modalRoot').innerHTML = '';
}
/**
 * Unsaved-work guard (spec §4, §12): block closing the window while a generated
 * game exists only in memory. `wizardHasUnsavedDraft()` owns the decision and is
 * false once the game is in the library, so a finished wizard closes normally.
 *
 * Chromium turns a cancelled `beforeunload` into `will-prevent-unload` in main,
 * which is where the close is actually stopped; this handler cannot prevent the
 * close by itself. Both halves are required.
 */
window.addEventListener('beforeunload', event => {
  // A reload or window close must not leave the LAN server listening (Windows keeps
  // the port busy and the next launch trips Firewall again).
  if (typeof lanReleaseForNewGame === 'function') lanReleaseForNewGame();
  if (typeof wizardHasUnsavedDraft !== 'function' || !wizardHasUnsavedDraft()) return;
  // `preventDefault()` and `returnValue` are both set: Chromium and Electron
  // differ in which one they honour, and the cost of setting both is nil.
  event.preventDefault();
  event.returnValue = '';
});
document.addEventListener('click', e => {
  const activity = e.target.closest('[data-global-ai-activity]');
  if (activity) {
    if (wizardState.busy === 'analyze') {
      wizardState.step = 'analyze';
      navigate('create-wizard');
    } else if (wizardState.busy === 'generate') {
      wizardState.step = 'generate';
      navigate('create-wizard');
    }
    return;
  }
  const nav = e.target.closest('.nav-item[data-page]');
  if (nav) navigate(nav.dataset.page);
});
$('#helpBtn').addEventListener('click', showHelp);

const notifBtn = $('#topbarNotificationBtn');
const notifPopover = $('#topbarNotificationPopover');
if (notifBtn && notifPopover) {
  notifBtn.addEventListener('click', e => {
    e.stopPropagation();
    notifPopover.classList.toggle('hidden');
    if (!notifPopover.classList.contains('hidden')) {
      if (typeof systemNotifications !== 'undefined') {
        systemNotifications.forEach(n => n.read = true);
      }
      const badge = $('#topbarNotificationBadge');
      if (badge) badge.classList.add('hidden');
    }
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('#topbarNotificationContainer')) {
      notifPopover.classList.add('hidden');
    }
  });
  const clearBtn = $('#clearNotificationsBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (typeof clearNotifications === 'function') clearNotifications();
    });
  }
}
if (typeof updateNotificationUI === 'function') updateNotificationUI();

const topbarFs = $('#topbarFullscreenBtn');
if (topbarFs) {
  topbarFs.addEventListener('click', async () => {
    const isFs = document.documentElement.dataset.fullscreen === '1';
    try { await window.eduGame.setFullscreen(!isFs); } catch {}
  });
}
window.addEventListener('keydown', async e => {
  if (e.key === 'F11' && !Boolean($('#modalRoot')?.children.length)) {
    e.preventDefault();
    const isFs = document.documentElement.dataset.fullscreen === '1';
    try { await window.eduGame.setFullscreen(!isFs); } catch {}
  }
  // #119/#120: Escape closes an open card menu.
  if (e.key === 'Escape' && typeof closeGameMenus === 'function') closeGameMenus();
});
// The card menu is a popover: a click anywhere outside it, a scroll of any ancestor,
// or a window resize closes it. `capture` so the outside click is seen before the
// page's own listeners (a click on another "•••" must close the first menu).
document.addEventListener('click', event => {
  const target = event.target;
  if (!target || !target.closest) return;
  // The toggle handles its own open/close; a click inside an open menu picks an item,
  // which the action handler closes.
  if (target.closest('[data-game-menu-root]')) return;
  if (typeof closeGameMenus === 'function') closeGameMenus();
}, true);
// `scroll` does not bubble: listen in the capture phase so a scroll of the page
// content (or any ancestor) closes the menu too.
window.addEventListener('scroll', () => {
  if (typeof closeGameMenus === 'function') closeGameMenus();
}, true);
window.addEventListener('resize', () => {
  if (typeof closeGameMenus === 'function') closeGameMenus();
});
(async function init() {
  try {
    state.db = await window.eduGame.getLibrary();
    state.settings = await window.eduGame.getSettings();
    applyTheme(state.settings && state.settings.preferences && state.settings.preferences.theme);
    // Chơi LAN: subscribes to `lan:state` so a room opened before a reload (or on a
    // second window) is drawn again. Never throws when the bridge is absent.
    if (typeof lanInit === 'function') lanInit();
    const localAi = await window.eduGame.getLocalAiModels();
    state.localAiModels = localAi.models;
    state.localAiMachine = localAi.machine;
    render();
    if (typeof window.initAiStatusBar === 'function') window.initAiStatusBar();
    // §3 steps 2–3: after startup, ask whether AI setup is done and open the
    // wizard only when it is not. Deliberately not awaited before `render()`:
    // saved games must open immediately, and a teacher whose AI is already
    // installed must never see a flash of the wizard. A failure here (older
    // build, missing IPC) resolves to "don't show" inside the wizard module.
    if (typeof window.openSetupWizard === 'function') {
      window.openSetupWizard({ probe: true }).catch(() => {});
    }
  } catch(e) { $('#pageContent').innerHTML = `<div class="empty-state"><div class="big">⚠️</div><h3>Không thể khởi tạo ứng dụng</h3><p>${escapeHtml(e.message)}</p></div>`; }
})();
