// @ts-nocheck -- migrated legacy UI logic; new contracts are typed in src/shared/types.ts.
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
// #159: `settingsSection` is the Settings tab shown on the page (`''` was the accordion's
// "all collapsed" state and no longer exists). #158: `settingsAiTab` is the tab shown
// inside the AI panel. Both are UI state only and never saved; the first visit opens the
// AI tab on its local sub-tab.
// #209 task 4: `answerTurn` is the ONE answer turn currently open on the play screen
// (the machine in game-engine/answer-flow.js). UI state only — never saved, never scored.
const state = { db: { games: [], sessions: [] }, page: 'library', search: '', filter: 'all', projects: null, lessonLibrary: null, settings: {}, localAiModels: [], localAiMachine: {}, draft: null, importedDoc: null, selectedTemplate: 'scenario', currentGame: null, gameIndex: 0, gameAnswers: [], gameStart: 0, playStartedAt: 0, resultSession: null, answerLocked: false, answerTurn: null, answerExplanationShown: null, lastSummary: null, matchingPlay: null, memoryCards: null, treasurePlay: null, racePlay: null, teamPlay: null, pendingTeams: null, settingsSection: 'ai', settingsAiTab: 'local', connectionProgress: null,
  // #171: the constellation board's input state only — the card a tap selected
  // and the card a drag is carrying. Never saved, never scored.
  constellationSelected: null, constellationDragging: null };
const icons = { quiz: '🧠', scenario: '🚦', matching: '🧩', 'treasure-hunt': '🗺️', race: '🏁' };
const treasureMissionMeta = {
  'multiple-choice': { label: 'Trắc nghiệm', icon: '❓', short: 'Chọn đáp án đúng' },
  scenario: { label: 'Xử lý tình huống', icon: '🧭', short: 'Chọn cách xử lý phù hợp' },
  matching: { label: 'Ghép cặp', icon: '🧩', short: 'Ghép hai vế thành một cặp đúng' },
  decode: { label: 'Giải mã', icon: '🔐', short: 'Sắp xếp lại mật mã để tìm đáp án' },
  classification: { label: 'Phân loại', icon: '🗂️', short: 'Xếp mỗi mục vào đúng nhóm' }
};
function treasureMissionTypeOf(stage) {
  const type = stage && stage.mission && stage.mission.type;
  return Object.prototype.hasOwnProperty.call(treasureMissionMeta, String(type || '')) ? type : 'multiple-choice';
}
function treasureMissionIsChoice(stage) {
  const type = treasureMissionTypeOf(stage);
  return type === 'multiple-choice' || type === 'scenario';
}

/**
 * #132: the provider list is no longer duplicated here. Main owns the registry
 * (`src/services/ai/ai-providers.ts`) and ships it inside `settings.ai.providers`, so
 * Settings and the wizard picker render the same labels, defaults and states —
 * and the renderer never receives an API key. These helpers only read that view.
 */
function aiProviderView(id) {
  const ai = (state.settings && state.settings.ai) || {};
  const list = Array.isArray(ai.providers) ? ai.providers : [];
  return list.find(provider => provider && provider.id === id) || null;
}
/** The raw provider view main ships (array, never undefined) — the one source for Step 2. */
function aiProviderList() {
  const ai = (state.settings && state.settings.ai) || {};
  return Array.isArray(ai.providers) ? ai.providers.filter(Boolean) : [];
}
/** The provider the workflow would use now (requested ?: first usable). */
function aiActiveProvider() {
  const ai = (state.settings && state.settings.ai) || {};
  // #132: the card and the buttons name the provider the request will use, so a pick
  // in the wizard wins over the default. An unverified pick falls back to the provider
  // the policy would use, never to one that cannot run.
  const picked = typeof wizardState !== 'undefined' && wizardState.selectedProviderId
    ? aiProviderView(wizardState.selectedProviderId)
    : null;
  if (picked && picked.usable) return picked;
  return aiProviderView(ai.provider) || aiProviderList()[0] || null;
}
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/** Providers the teacher may pick in the wizard — only shown when more than one is usable (#132 §D7). */
function aiProviderPicker() {
  const picker = (state.settings.ai && state.settings.ai.picker) || { show: false, options: [] };
  return { show: Boolean(picker.show), options: Array.isArray(picker.options) ? picker.options : [], activeId: picker.activeId || '' };
}

function applyTheme(theme) {
  const preference = theme || (state.settings && state.settings.preferences && state.settings.preferences.theme) || 'light';
  let resolved = preference;
  if (preference === 'system') {
    resolved = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }
  document.documentElement.dataset.theme = resolved;
  if (window.matchMedia) {
    try {
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      if (!media.__edugameThemeListener) {
        media.__edugameThemeListener = () => {
          const current = state.settings && state.settings.preferences && state.settings.preferences.theme;
          if (current === 'system') applyTheme('system');
        };
        media.addEventListener('change', media.__edugameThemeListener);
      }
    } catch (e) {}
  }
} 
const systemNotifications = [
  { id: 'notif-init', text: 'Sẵn sàng ngoại tuyến: Trò chơi đã lưu có thể chơi không cần kết nối mạng.', time: Date.now(), read: true }
];
function addNotification(text) {
  if (!text) return;
  systemNotifications.unshift({ id: 'notif-' + Date.now(), text: String(text), time: Date.now(), read: false });
  if (systemNotifications.length > 25) systemNotifications.pop();
  updateNotificationUI();
}
function clearNotifications() {
  systemNotifications.length = 0;
  updateNotificationUI();
}
function updateNotificationUI() {
  const badge = $('#topbarNotificationBadge');
  const list = $('#topbarNotificationList');
  if (badge) {
    const unread = systemNotifications.some(n => !n.read);
    badge.classList.toggle('hidden', !unread);
  }
  if (list) {
    if (!systemNotifications.length) {
      list.innerHTML = '<div class="text-center py-4 text-[#5a6478] text-[12px]">Không có thông báo mới</div>';
      return;
    }
    list.innerHTML = systemNotifications.map(n => `
      <div class="p-2 rounded-lg bg-[#f8fafc] border border-[#f1f5f9] flex flex-col gap-0.5 text-left">
        <span class="text-[#334155] font-medium leading-snug">${escapeHtml(n.text)}</span>
        <span class="text-[11px] text-[#5a6478]">${fmtDateTime(n.time)}</span>
      </div>
    `).join('');
  }
}
function toast(message, duration = 3000) {
  const el = $('#toast');
  if (el) {
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove('show'), duration);
  }
  addNotification(message);
}
function fmtDate(value) { try { return new Date(value).toLocaleDateString('vi-VN', { day:'2-digit', month:'2-digit', year:'numeric' }); } catch { return '—'; } }
function fmtDateTime(value) { try { return new Date(value).toLocaleString('vi-VN', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }); } catch { return '—'; } }
function formatBytes(bytes) { return `${(bytes / 1024 ** 3).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} GB`; }
/**
 * A game card in the library (DECISIONS #119/#120).
 *
 * Outside the menu the teacher sees exactly two actions — "Chơi ngay" and "Chơi toàn
 * màn hình" — plus the menu, which holds Chơi LAN, Chỉnh sửa, Xoá and Xuất game.
 * The menu is a real `role="menu"`, toggled by `wireGameMenus()` and closed by
 * `bootstrap.ts` on anything else (outside click, Escape, scroll, resize, page change).
 */
function gameCard(game, index = 0, deletable = false) {
  const template = game.template || 'quiz';
  const templateThemes = {
    quiz: { cover: 'bg-[linear-gradient(135deg,#fef3c7,#fde68a)] dark:bg-[linear-gradient(135deg,#382806,#261a03)]', badge: 'bg-white/[90%] text-[#b45309] dark:bg-[#261a03]/[90%] dark:text-[#fde68a]', border: 'border-l-[4px] border-l-[#f59e0b]' },
    scenario: { cover: 'bg-[linear-gradient(135deg,#d1fae5,#a7f3d0)] dark:bg-[linear-gradient(135deg,#063324,#032117)]', badge: 'bg-white/[90%] text-[#047857] dark:bg-[#032117]/[90%] dark:text-[#a7f3d0]', border: 'border-l-[4px] border-l-[#10b981]' },
    matching: { cover: 'bg-[linear-gradient(135deg,#ede9fe,#ddd6fe)] dark:bg-[linear-gradient(135deg,#251945,#170e30)]', badge: 'bg-white/[90%] text-[#6d28d9] dark:bg-[#170e30]/[90%] dark:text-[#ddd6fe]', border: 'border-l-[4px] border-l-[#8b5cf6]' },
    'treasure-hunt': { cover: 'bg-[linear-gradient(135deg,#ffe4e6,#fecdd3)] dark:bg-[linear-gradient(135deg,#3d0e19,#28080f)]', badge: 'bg-white/[90%] text-[#be123c] dark:bg-[#28080f]/[90%] dark:text-[#fecdd3]', border: 'border-l-[4px] border-l-[#f43f5e]' },
    race: { cover: 'bg-[linear-gradient(135deg,#dbeafe,#bfdbfe)] dark:bg-[linear-gradient(135deg,#0c234a,#08162f)]', badge: 'bg-white/[90%] text-[#1d4ed8] dark:bg-[#08162f]/[90%] dark:text-[#bfdbfe]', border: 'border-l-[4px] border-l-[#3b82f6]' }
  };
  const id = escapeHtml(game.id);
  const menuId = 'gameMenu-' + String(index + 1);
  const item = (action, label, extra = '') => `<button type="button" role="menuitem" class="w-full flex items-center gap-[9px] border-0 bg-transparent text-left px-[12px] py-[9px] text-[12px] font-semibold text-[#515c72] hover:bg-[#f5f6fa] focus:bg-[#f5f6fa] outline-0 ${extra}" data-action="${action}" data-id="${id}">${label}</button>`;
  // #155: the way the quiz is played belongs on the card — a teacher deciding what to
  // open at class time must see "Xây nhà" without opening the editor. Only quiz has a
  // play mode; absent `gameplayMode` is classic (editorGameplayMode).
  const playMode = template === 'quiz' ? ((game.gameSetup && game.gameSetup.gameplayMode === 'house') ? 'house' : 'classic') : '';
  const playModeChip = playMode === 'house'
    ? '<span class="px-[4px] py-[7px] bg-[#fff4e9] text-[#9c4808] rounded-[5px] text-[11px] font-bold" data-play-mode="house" title="Cách chơi: Xây nhà — mỗi câu đúng dựng thêm một phần của ngôi nhà 3D">🏗 Cách chơi: Xây nhà</span>'
    : playMode === 'classic'
      ? '<span class="px-[4px] py-[7px] bg-[#edf2ff] text-[#4565c9] rounded-[5px] text-[11px] font-semibold" data-play-mode="classic" title="Cách chơi: Cổ điển — trả lời câu hỏi nhận điểm">🎯 Cách chơi: Cổ điển</span>'
      : '';
  // #168/#171: the constellation board is a MATCHING style, so its chip sits
  // beside the matching label. Mặc định by absence: a board saved before it
  // existed is not a constellation board, and an unknown mode stays silent
  // instead of lying. The BETA badge is gone (#171): the name is the whole label.
  const connectionBoard = template === 'matching' && game.matchingGame && game.matchingGame.mode === 'connection';
  const connectionChip = connectionBoard
    ? `<span class="px-[4px] py-[7px] bg-[#e8f5ef] text-[#1c7a58] rounded-[5px] text-[11px] font-bold" data-play-mode="connection" title="Cách chơi: ${CONSTELLATION_GAME_NAME} — mỗi cặp ghép đúng thắp sáng thêm một ngôi sao của chòm sao">🌌 Cách chơi: ${CONSTELLATION_GAME_NAME}</span>`
    : '';
  const cardTheme = connectionBoard ? { cover: 'bg-[linear-gradient(135deg,#cffafe,#a5f3fc)] dark:bg-[linear-gradient(135deg,#082f38,#041e24)]', badge: 'bg-white/[90%] text-[#0e7490] dark:bg-[#041e24]/[90%] dark:text-[#a5f3fc]', border: 'border-l-[4px] border-l-[#06b6d4]' } : (templateThemes[template] || templateThemes.quiz);
  return `<article class="game-card bg-white dark:bg-[#171c32] border border-line ${cardTheme.border} rounded-[14px] overflow-hidden min-w-0 transition-all duration-180 hover:-translate-y-[3px] hover:shadow-card hover:border-[#d8d5ff] dark:hover:border-[#384266]" data-game-card="${id}" data-template="${escapeHtml(template)}">
    <div class="${cardTheme.cover} h-[130px] relative flex items-center justify-center overflow-hidden">
      <div class="absolute [border:1px_solid_#ffffffaa] w-[130px] h-[130px] rounded-full -left-[15px] top-[40px]"></div>
      <div class="absolute [border:1px_solid_#ffffffaa] w-[95px] h-[95px] rounded-full right-[-5px] top-[-22px]"></div>
      <span class="absolute top-[12px] left-[12px] ${cardTheme.badge} text-[11px] font-extrabold px-[8px] py-[4px] rounded-[6px] z-[2] shadow-sm">${escapeHtml(templateLabel(template))}</span>
      <div class="text-[51px] [filter:drop-shadow(0_7px_5px_#4c50701c)] relative z-[1]">${icons[template] || '🎮'}</div>
    </div>
    <div class="p-[15px]">
      <div class="flex justify-between gap-[8px] items-start">
        <div class="text-[13px] font-semibold leading-[1.4]">${escapeHtml(game.title)}</div>
        <!-- The document-level "click outside" guard keys on this wrapper (bootstrap.ts). -->
        <div class="relative shrink-0" data-game-menu-root>
          <button type="button" class="border-0 bg-transparent text-[#5f6a7d] inline-flex items-center justify-center w-[24px] h-[24px] rounded-[6px] hover:bg-[#f5f6fa]"
            data-menu-toggle="${menuId}" aria-haspopup="menu" aria-expanded="false" aria-controls="${menuId}" title="Thêm lựa chọn"><span data-icon="ellipsis-vertical" data-icon-size="15"></span></button>
          <div id="${menuId}" role="menu" aria-label="Lựa chọn cho ${escapeHtml(game.title)}" hidden
            class="absolute right-0 top-[24px] z-[20] min-w-[168px] py-[4px] bg-white border border-[#e7eaf2] rounded-[10px] shadow-[0_10px_24px_#1e293b1f]">
            ${item('lan', '<span data-icon="smartphone" data-icon-size="14"></span> Chơi LAN')}
            ${item('edit', '<span data-icon="pencil" data-icon-size="14"></span> Chỉnh sửa')}
            ${item('export-game', '<span data-icon="download" data-icon-size="14"></span> Xuất game')}
            ${deletable ? item('delete', '<span data-icon="trash" data-icon-size="14"></span> Xoá', 'text-[#b42318] hover:bg-[#fff1f2] focus:bg-[#fff1f2]') : ''}
          </div>
        </div>
      </div>
      <p class="text-[12px] text-[#5f6a7d] leading-[1.6] mt-[8px] mb-[13px] min-h-[35px]">${escapeHtml(game.description || 'Trò chơi học tập tương tác, có thể chơi ngoại tuyến.')}</p>
      <div class="flex gap-[5px] flex-wrap">${playModeChip}${connectionChip}<span class="px-[4px] py-[7px] bg-[#f5f6fa] rounded-[5px] text-[#5f6a7d] text-[11px]">${escapeHtml(game.subject || 'Chưa phân môn')}</span><span class="px-[4px] py-[7px] bg-[#f5f6fa] rounded-[5px] text-[#5f6a7d] text-[11px]">${game.grade ? 'Lớp ' + escapeHtml(game.grade) : 'Mọi lớp'}</span><span class="px-[4px] py-[7px] bg-[#f5f6fa] rounded-[5px] text-[#5f6a7d] text-[11px]">${game.questions?.length || 0} câu</span></div>
      <div class="flex items-center justify-between border-t border-[#f0f1f6] pt-[12px] text-[#5f6a7d] text-[12px]"><span class="inline-flex items-center gap-[5px]"><span data-icon="book-open" data-icon-size="12"></span> ${escapeHtml(game.topic || 'Bài học')}</span><span class="inline-flex items-center gap-[5px]"><span data-icon="clock" data-icon-size="12"></span> ${fmtDate(game.updatedAt || game.createdAt)}</span></div>
      <div class="flex gap-[8px] mt-[13px]">
        <button class="border-0 rounded-[9px] px-[11px] py-[8px] inline-flex items-center justify-center gap-[7px] font-bold text-[12px] transition-transform duration-120 hover:-translate-y-[1px] bg-[#6258e8] text-white shadow-[0_6px_14px_#6258e82b]" data-action="play" data-id="${id}"><span data-icon="play" data-icon-size="13"></span> Chơi ngay</button>
        <button class="border-0 rounded-[9px] px-[11px] py-[8px] inline-flex items-center justify-center gap-[7px] font-bold text-[12px] transition-transform duration-120 hover:-translate-y-[1px] bg-[#2563eb] text-white shadow-[0_6px_14px_#2563eb2b]" data-action="play-fullscreen" data-id="${id}"><span data-icon="maximize" data-icon-size="13"></span> Toàn màn hình</button>
      </div>
    </div>
  </article>`;
}
function templateLabel(template) { return ({ quiz: 'Đấu trường kiến thức', scenario: 'Thử thách tình huống', matching: 'Ghép cặp kiến thức', 'treasure-hunt': 'Giải mã kho báu', race: 'Đường đua chinh phục' })[template] || 'Trò chơi học tập'; }
function scoringModeHint(mode) {
  return ({
    'cơ bản': 'Cơ bản: đúng nhận điểm cố định, sai không có điểm.',
    'tốc độ': 'Tốc độ: trả lời đúng nhanh được cộng điểm thưởng (tối đa 50 điểm).',
    'theo độ khó': 'Theo độ khó: điểm từng câu theo bảng dưới đây (mặc định dễ 100 · trung bình 200 · khó 300).',
    'thi đấu đội': 'Thi đấu đội: điểm cộng tổng cho đội, có thể luân phiên người trả lời.',
    'luyện tập': 'Luyện tập: không áp lực thời gian, không cộng điểm tốc độ, ưu tiên giải thích và phản hồi.'
  })[mode] || 'Chọn một trong 5 chế độ tính điểm theo mục 2.3 yêu cầu sản phẩm.';
}

function emptyStateIllustrationSvg() {
  return `<svg width="100" height="88" viewBox="0 0 100 88" fill="none" class="mb-[14px]" aria-hidden="true"><ellipse cx="50" cy="80" rx="36" ry="6" fill="#e2e8f0" class="opacity-70 dark:fill-[#252c48]" /><path d="M22 74 C35 70, 48 72, 50 76 C52 72, 65 70, 78 74 L75 80 C63 76, 52 78, 50 82 C48 78, 37 76, 25 80 Z" fill="#6258e8" opacity="0.85" /><path d="M24 71 C36 67, 48 69, 50 73 C52 69, 64 67, 76 71 L74 74 C63 70, 52 72, 50 76 C48 72, 37 70, 26 74 Z" fill="#ffffff" class="dark:fill-[#e2e8f0]" /><ellipse cx="50" cy="48" rx="22" ry="24" fill="#6258e8" /><ellipse cx="50" cy="52" rx="15" ry="17" fill="#ede9fe" class="dark:fill-[#3b357d]" /><path d="M46 48 Q50 51 54 48 M44 54 Q50 57 56 54 M46 60 Q50 63 54 60" stroke="#8b5cf6" stroke-width="1.5" stroke-linecap="round" fill="none" /><circle cx="42" cy="40" r="7" fill="#ffffff" /><circle cx="58" cy="40" r="7" fill="#ffffff" /><circle cx="42" cy="40" r="8" stroke="#f59e0b" stroke-width="1.8" fill="none" /><circle cx="58" cy="40" r="8" stroke="#f59e0b" stroke-width="1.8" fill="none" /><circle cx="43" cy="40" r="3.5" fill="#1e1b4b" /><circle cx="57" cy="40" r="3.5" fill="#1e1b4b" /><circle cx="44.5" cy="38.5" r="1.2" fill="#ffffff" /><circle cx="58.5" cy="38.5" r="1.2" fill="#ffffff" /><polygon points="50,44 47,49 53,49" fill="#f59e0b" /><polygon points="50,18 28,26 50,32 72,26" fill="#1e1b4b" class="dark:fill-[#0f172a]" /><polygon points="50,19 32,26 50,31 68,26" fill="#312e81" class="dark:fill-[#1e293b]" /><rect x="42" y="30" width="16" height="5" rx="2" fill="#1e1b4b" class="dark:fill-[#0f172a]" /><path d="M50 25 L65 29 L65 37" stroke="#f59e0b" stroke-width="1.5" stroke-linecap="round" fill="none" /><circle cx="65" cy="38" r="1.5" fill="#f59e0b" /><path d="M28 44 C26 52, 30 62, 35 66 C32 60, 31 52, 32 46 Z" fill="#4f46e5" /><path d="M72 44 C74 52, 70 62, 65 66 C68 60, 69 52, 68 46 Z" fill="#4f46e5" /><path d="M18 30 L20 25 L22 30 L27 32 L22 34 L20 39 L18 34 L13 32 Z" fill="#fbbf24" opacity="0.85" /><path d="M80 34 L81.5 30 L83 34 L87 35.5 L83 37 L81.5 41 L80 37 L76 35.5 Z" fill="#fbbf24" opacity="0.85" /></svg>`;
}

function emptyState(title, desc, button, page) {
  const buttonHtml = button && page ? `<button class="border-0 rounded-[9px] px-[16px] py-[10px] inline-flex items-center justify-center gap-[8px] font-bold text-[12px] transition-transform duration-120 hover:-translate-y-[1px] bg-[#6258e8] text-white shadow-[0_6px_14px_#6258e82b]" data-page="${page}"><span data-icon="circle-plus" data-icon-size="14"></span> ${escapeHtml(button)}</button>` : '';
  return `<div class="empty-state bg-white dark:bg-[#171c32] border border-dashed border-[#dfe2ed] dark:border-[#2a324b] rounded-[16px] p-[44px_20px] text-center text-[#5f6a7d] flex flex-col items-center justify-center">${emptyStateIllustrationSvg()}<h3 class="text-[#1e293b] dark:text-[#f1f5f9] text-[15px] font-bold mb-[6px] mt-0">${escapeHtml(title)}</h3><p class="max-w-[420px] mx-auto mb-[18px] leading-[1.65] text-[12.5px] text-[#5f6a7d] dark:text-[#94a3b8]">${escapeHtml(desc)}</p>${buttonHtml}</div>`;
}
