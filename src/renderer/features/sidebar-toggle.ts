// @ts-nocheck -- renderer chrome; `document`/`localStorage` are the browser's, as in
// every other file under src/renderer.
//
// #368 — ẩn/hiện thanh bên.
//
// Trạng thái nằm ở `document.documentElement.dataset.sidebar` (`shown` | `hidden`) chứ
// không phải một class trên `<aside>`: CSS quyết định hình dạng, JS chỉ nói ý định, và
// một lần vẽ lại (`render()`) không thể vô tình làm thanh bên hiện lại.
//
// Vì sao localStorage chứ không phải `settings.preferences` trong DB: đây là một lựa chọn
// của MÀN HÌNH NÀY (máy chiếu hẹp thì ẩn, máy để bàn thì hiện), và nó phải sống cả khi
// không có mạng — game đã lưu vẫn chơi offline, nên một tuỳ chọn giao diện không được phụ
// thuộc vào một lời gọi IPC.
const SIDEBAR_PREF_KEY = 'edugame.sidebar';
const SIDEBAR_STATES = ['shown', 'hidden'];

/** Trạng thái đang lưu. Giá trị lạ (hoặc localStorage bị chặn) ⇒ `shown`. */
function sidebarPrefRead() {
  try {
    const raw = String(localStorage.getItem(SIDEBAR_PREF_KEY) || '');
    return SIDEBAR_STATES.indexOf(raw) >= 0 ? raw : 'shown';
  } catch {
    return 'shown';
  }
}

/** Một chỗ duy nhất quyết định "ẩn" nghĩa là gì — CSS chỉ đọc `data-sidebar`. */
function sidebarIsHidden() {
  return document.documentElement.getAttribute('data-sidebar') === 'hidden';
}

/**
 * Vẽ trạng thái ra DOM: `data-sidebar`, nút ẩn (aria-expanded), và nút hiện (hidden).
 * Không đụng localStorage — nhờ vậy có thể áp trạng thái đã lưu mà không ghi lại nó.
 */
function applySidebarState(state) {
  const hidden = state === 'hidden';
  document.documentElement.setAttribute('data-sidebar', hidden ? 'hidden' : 'shown');
  const toggles = document.querySelectorAll('[data-sidebar-toggle]');
  for (let index = 0; index < toggles.length; index += 1) {
    toggles[index].setAttribute('aria-expanded', hidden ? 'false' : 'true');
  }
  // Nút "hiện" chỉ tồn tại khi thanh bên đã ẩn: một cái nút nói "hiện thanh bên" trong
  // lúc thanh bên đang hiện là một câu vô nghĩa.
  const reveals = document.querySelectorAll('[data-sidebar-show]');
  for (let index = 0; index < reveals.length; index += 1) {
    reveals[index].hidden = !hidden;
  }
  return hidden;
}

/** Đặt trạng thái + nhớ nó. */
function setSidebarHidden(hidden) {
  const state = hidden ? 'hidden' : 'shown';
  applySidebarState(state);
  try {
    localStorage.setItem(SIDEBAR_PREF_KEY, state);
  } catch {
    /* chế độ riêng tư: vẫn đổi được trong phiên này */
  }
  return state;
}

/** Đảo trạng thái hiện tại rồi trả về trạng thái MỚI. */
function toggleSidebar() {
  return setSidebarHidden(!sidebarIsHidden());
}

/** Nạp lại lựa chọn đã lưu. Gọi một lần lúc khởi động, trước lần vẽ đầu tiên. */
function initSidebarToggle() {
  applySidebarState(sidebarPrefRead());
  document.addEventListener('click', (event) => {
    const target = event.target && event.target.closest ? event.target.closest('[data-sidebar-toggle],[data-sidebar-show]') : null;
    if (!target) return;
    // Nút ẩn và nút hiện là hai nửa của CÙNG một công tắc, nên cả hai đều đảo trạng thái;
    // `data-sidebar-show` chỉ khác ở chỗ nó chỉ tồn tại khi thanh bên đang ẩn.
    event.preventDefault();
    toggleSidebar();
  });
  document.addEventListener('keydown', (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    if (String(event.key || '').toLowerCase() !== 'b') return;
    event.preventDefault();
    toggleSidebar();
  });
}
