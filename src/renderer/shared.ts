// @ts-nocheck -- migrated legacy UI logic; new contracts are typed in src/shared/types.ts.
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
// #157: `settingsSection` is the section open on the Settings accordion (`''` = all
// collapsed). It is UI state only and never saved; the first visit opens AI local.
const state = { db: { games: [], sessions: [] }, page: 'home', search: '', filter: 'all', projects: null, lessonLibrary: null, settings: {}, localAiModels: [], localAiMachine: {}, draft: null, importedDoc: null, selectedTemplate: 'scenario', currentGame: null, gameIndex: 0, gameAnswers: [], gameStart: 0, playStartedAt: 0, resultSession: null, answerLocked: false, lastSummary: null, matchingPlay: null, memoryCards: null, treasurePlay: null, racePlay: null, teamPlay: null, pendingTeams: null, settingsSection: 'aiLocal' };
const pageNames = { home: 'Tổng quan', library: 'Thư viện trò chơi', 'create-wizard': 'Tạo từ giáo án', create: 'Tạo trò chơi', 'lesson-plans': 'Giáo án', 'my-projects': 'Dự án của tôi', sessions: 'Lịch sử kết quả', settings: 'Cài đặt' };
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
      list.innerHTML = '<div class="text-center py-4 text-[#94a3b8] text-[11px]">Không có thông báo mới</div>';
      return;
    }
    list.innerHTML = systemNotifications.map(n => `
      <div class="p-2 rounded-lg bg-[#f8fafc] border border-[#f1f5f9] flex flex-col gap-0.5 text-left">
        <span class="text-[#334155] font-medium leading-snug">${escapeHtml(n.text)}</span>
        <span class="text-[9px] text-[#94a3b8]">${fmtDateTime(n.time)}</span>
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
function totalQuestions() { return state.db.games.reduce((n, g) => n + (g.questions?.length || 0), 0); }
/**
 * A game card in the library (DECISIONS #119/#120).
 *
 * Outside the menu the teacher sees exactly two actions — "Chơi ngay" and "Chơi toàn
 * màn hình" — plus the "•••" menu, which holds Chơi LAN, Chỉnh sửa, Xoá and Xuất game.
 * The menu is a real `role="menu"`, toggled by `wireGameMenus()` and closed by
 * `bootstrap.ts` on anything else (outside click, Escape, scroll, resize, page change).
 */
function gameCard(game, index = 0, deletable = false) {
  const template = game.template || 'quiz';
  const coverGrad = ['bg-[linear-gradient(135deg,#e9e7ff,#d6d1ff)]','bg-[linear-gradient(135deg,#ddf8ed,#bdeedb)]','bg-[linear-gradient(135deg,#fff0dc,#ffd8a7)]','bg-[linear-gradient(135deg,#e0efff,#c9e1ff)]','bg-[linear-gradient(135deg,#ffe4ed,#ffc9d9)]'][index % 5];
  const id = escapeHtml(game.id);
  const menuId = 'gameMenu-' + String(index + 1);
  const item = (action, label, extra = '') => `<button type="button" role="menuitem" class="w-full border-0 bg-transparent text-left px-[12px] py-[9px] text-[12px] font-semibold text-[#515c72] hover:bg-[#f5f6fa] focus:bg-[#f5f6fa] outline-0 ${extra}" data-action="${action}" data-id="${id}">${label}</button>`;
  // #155: the way the quiz is played belongs on the card — a teacher deciding what to
  // open at class time must see "Xây nhà" without opening the editor. Only quiz has a
  // play mode; absent `gameplayMode` is classic (editorGameplayMode).
  const playMode = template === 'quiz' ? ((game.gameSetup && game.gameSetup.gameplayMode === 'house') ? 'house' : 'classic') : '';
  const playModeChip = playMode === 'house'
    ? '<span class="px-[4px] py-[7px] bg-[#fff4e9] text-[#c9792b] rounded-[5px] text-[9px] font-bold" data-play-mode="house" title="Cách chơi: Xây nhà — mỗi câu đúng dựng thêm một phần của ngôi nhà 3D">🏗 Cách chơi: Xây nhà</span>'
    : playMode === 'classic'
      ? '<span class="px-[4px] py-[7px] bg-[#edf2ff] text-[#4565c9] rounded-[5px] text-[9px] font-semibold" data-play-mode="classic" title="Cách chơi: Cổ điển — trả lời câu hỏi nhận điểm">🎯 Cách chơi: Cổ điển</span>'
      : '';
  return `<article class="bg-white border border-line rounded-[14px] overflow-hidden min-w-0 transition-all duration-180 hover:-translate-y-[3px] hover:shadow-card hover:border-[#d8d5ff]" data-game-card="${id}">
    <div class="${coverGrad} h-[130px] relative flex items-center justify-center overflow-hidden">
      <div class="absolute [border:1px_solid_#ffffffaa] w-[130px] h-[130px] rounded-full -left-[15px] top-[40px]"></div>
      <div class="absolute [border:1px_solid_#ffffffaa] w-[95px] h-[95px] rounded-full right-[-5px] top-[-22px]"></div>
      <span class="absolute top-[12px] left-[12px] bg-white/[85%] text-[#5f58b8] text-[9px] font-extrabold px-[6px] py-[8px] rounded-[6px] z-[2]">${escapeHtml(templateLabel(template))}</span>
      <div class="text-[51px] [filter:drop-shadow(0_7px_5px_#4c50701c)] relative z-[1]">${icons[template] || '🎮'}</div>
    </div>
    <div class="p-[15px]">
      <div class="flex justify-between gap-[8px] items-start">
        <div class="text-[13px] font-semibold leading-[1.4]">${escapeHtml(game.title)}</div>
        <!-- The document-level "click outside" guard keys on this wrapper (bootstrap.ts). -->
        <div class="relative shrink-0" data-game-menu-root>
          <button type="button" class="border-0 bg-transparent text-[#a1a8b7] tracking-[2px] px-[4px] rounded-[6px] hover:bg-[#f5f6fa]"
            data-menu-toggle="${menuId}" aria-haspopup="menu" aria-expanded="false" aria-controls="${menuId}" title="Thêm lựa chọn">•••</button>
          <div id="${menuId}" role="menu" aria-label="Lựa chọn cho ${escapeHtml(game.title)}" hidden
            class="absolute right-0 top-[24px] z-[20] min-w-[168px] py-[4px] bg-white border border-[#e7eaf2] rounded-[10px] shadow-[0_10px_24px_#1e293b1f]">
            ${item('lan', '📱 Chơi LAN')}
            ${item('edit', '✎ Chỉnh sửa')}
            ${item('export-game', '⇩ Xuất game')}
            ${deletable ? item('delete', '🗑 Xoá', 'text-[#d84b5a] hover:bg-[#fff1f2] focus:bg-[#fff1f2]') : ''}
          </div>
        </div>
      </div>
      <p class="text-[11px] text-[#8b94a6] leading-[1.6] mt-[8px] mb-[13px] min-h-[35px]">${escapeHtml(game.description || 'Trò chơi học tập tương tác, có thể chơi ngoại tuyến.')}</p>
      <div class="flex gap-[5px] flex-wrap">${playModeChip}<span class="px-[4px] py-[7px] bg-[#f5f6fa] rounded-[5px] text-[#788196] text-[9px]">${escapeHtml(game.subject || 'Chưa phân môn')}</span><span class="px-[4px] py-[7px] bg-[#f5f6fa] rounded-[5px] text-[#788196] text-[9px]">${game.grade ? 'Lớp ' + escapeHtml(game.grade) : 'Mọi lớp'}</span><span class="px-[4px] py-[7px] bg-[#f5f6fa] rounded-[5px] text-[#788196] text-[9px]">${game.questions?.length || 0} câu</span></div>
      <div class="flex items-center justify-between border-t border-[#f0f1f6] pt-[12px] text-[#8b94a6] text-[10px]"><span>▣ ${escapeHtml(game.topic || 'Bài học')}</span><span>↻ ${fmtDate(game.updatedAt || game.createdAt)}</span></div>
      <div class="flex gap-[8px] mt-[13px]">
        <button class="border-0 rounded-[9px] px-[11px] py-[8px] inline-flex items-center justify-center gap-[8px] font-bold text-[11px] transition-transform duration-120 hover:-translate-y-[1px] bg-[#6258e8] text-white shadow-[0_6px_14px_#6258e82b]" data-action="play" data-id="${id}">▶ Chơi ngay</button>
        <button class="border-0 rounded-[9px] px-[11px] py-[8px] inline-flex items-center justify-center gap-[8px] font-bold text-[11px] transition-transform duration-120 hover:-translate-y-[1px] bg-[#2563eb] text-white shadow-[0_6px_14px_#2563eb2b]" data-action="play-fullscreen" data-id="${id}">⛶ Toàn màn hình</button>
      </div>
    </div>
  </article>`;
}
function templateLabel(template) { return ({ quiz: 'ĐẤU TRƯỜNG KIẾN THỨC', scenario: 'THỬ THÁCH TÌNH HUỐNG', matching: 'GHÉP CẶP KIẾN THỨC', 'treasure-hunt': 'GIẢI MÃ KHO BÁU', race: 'ĐƯỜNG ĐUA CHINH PHỤC' })[template] || 'TRÒ CHƠI HỌC TẬP'; }
function scoringModeHint(mode) {
  return ({
    'cơ bản': 'Cơ bản: đúng nhận điểm cố định, sai không có điểm.',
    'tốc độ': 'Tốc độ: trả lời đúng nhanh được cộng điểm thưởng (tối đa 50 điểm).',
    'theo độ khó': 'Theo độ khó: điểm từng câu theo bảng dưới đây (mặc định dễ 100 · trung bình 200 · khó 300).',
    'thi đấu đội': 'Thi đấu đội: điểm cộng tổng cho đội, có thể luân phiên người trả lời.',
    'luyện tập': 'Luyện tập: không áp lực thời gian, không cộng điểm tốc độ, ưu tiên giải thích và phản hồi.'
  })[mode] || 'Chọn một trong 5 chế độ tính điểm theo mục 2.3 yêu cầu sản phẩm.';
}

function emptyState(title, desc, button, page) { return `<div class="bg-white border border-dashed border-[#dfe2ed] rounded-[14px] p-[50px_20px] text-center text-[#929bad] flex flex-col items-center justify-center"><div class="text-[42px] mb-[12px]">🎮</div><h3 class="text-[#394256] mb-[8px] mt-0">${escapeHtml(title)}</h3><p class="max-w-[420px] mx-auto mb-[17px] leading-[1.7] text-[12px]">${escapeHtml(desc)}</p><button class="border-0 rounded-[9px] px-[15px] py-[11px] inline-flex items-center justify-center gap-[8px] font-bold text-[12px] transition-transform duration-120 hover:-translate-y-[1px] bg-[#6258e8] text-white shadow-[0_6px_14px_#6258e82b]" data-page="${page}">${escapeHtml(button)}</button></div>`; }
