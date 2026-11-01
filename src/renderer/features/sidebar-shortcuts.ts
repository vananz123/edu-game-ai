// @ts-nocheck -- renderer chrome; globals (`state`, `escapeHtml`, `navigate`) are
// provided by sibling classic scripts, as in every other file under src/renderer.
//
// Sidebar shortcuts (docs/DECISIONS.md #161).
//
// The "Tổng quan" page used to be where a teacher landed: four counters, a hero,
// the three most recent games and a "Lối tắt" card. Deleting it (the request was
// one less place to start) must not delete the two things it was actually for —
// replaying a recent game and starting a new one — so both move into the sidebar,
// which is on screen from every page.
//
// Markup only: the buttons reuse the hooks the shell already understands
// (`data-page` navigates, `data-action="play"` starts a game), so no new wiring
// and no new IPC path. core/render.js repaints this block on every render, so the
// module only declares functions; it loads just before that file in index.html.
const SIDEBAR_RECENT_GAME_COUNT = 3;

const SIDEBAR_QUICK_ACTIONS = [
  { page: 'create-wizard', icon: 'wand-sparkles', title: 'Tạo từ giáo án', hint: 'AI local phân tích rồi gợi ý trò chơi' },
  { page: 'my-projects', icon: 'folder-open', title: 'Mở dự án đang làm', hint: 'Tiếp tục từ giáo án và bản nháp đã lưu' }
];

/** Most recently saved games — the same order the library list uses. */
function sidebarRecentGames() {
  const games = (state.db && state.db.games) || [];
  return games.slice(0, SIDEBAR_RECENT_GAME_COUNT);
}

function sidebarShortcutsHtml() {
  const recent = sidebarRecentGames();
  const rows = recent.length
    ? recent.map(game => {
        const id = escapeHtml(game.id);
        const when = fmtDate(game.updatedAt || game.createdAt);
        return `<button type="button" class="shortcut-item" data-action="play" data-id="${id}" title="Chơi lại: ${escapeHtml(game.title)}">
          <span class="shortcut-icon" data-icon="play" data-icon-size="12"></span>
          <span class="shortcut-text"><strong>${escapeHtml(game.title)}</strong><small>${escapeHtml(game.subject || 'Không phân môn')} · ${when}</small></span>
        </button>`;
      }).join('')
    : '<p class="shortcut-empty">Chưa có trò chơi nào. Tạo một trò chơi để nó xuất hiện ở đây.</p>';
  const actions = SIDEBAR_QUICK_ACTIONS.map(action =>
    `<button type="button" class="shortcut-item" data-page="${action.page}">
      <span class="shortcut-icon" data-icon="${action.icon}" data-icon-size="14"></span>
      <span class="shortcut-text"><strong>${escapeHtml(action.title)}</strong><small>${escapeHtml(action.hint)}</small></span>
      <span class="shortcut-go" data-icon="chevron-right" data-icon-size="14"></span>
    </button>`).join('');
  return `<div class="shortcut-head"><span data-icon="zap" data-icon-size="13"></span><span>Lối tắt</span></div>
    <div class="shortcut-group">
      <div class="shortcut-label">Gần đây</div>
      ${rows}
    </div>
    <div class="shortcut-group shortcut-group-actions">
      <div class="shortcut-label">Thao tác nhanh</div>
      ${actions}
    </div>`;
}

/** Fills the sidebar block. Returns false when the shell has no host to fill. */
function renderSidebarShortcuts() {
  const host = document.querySelector('[data-sidebar-shortcuts]');
  if (!host) return false;
  host.innerHTML = sidebarShortcutsHtml();
  return true;
}
