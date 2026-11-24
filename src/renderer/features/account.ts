// @ts-nocheck -- legacy UI module (plain global script); contracts live in src/shared/types.ts.
//
// Tài khoản (Phase 1 của docs/archive/specs/cloud-auth-plan.md).
//
// Hai điều luật của tệp này:
//   1. Chế độ **Khách là mặc định và hợp lệ**. Không đăng nhập thì mọi thứ vẫn
//      chạy: game đã lưu vẫn chơi offline, AI local vẫn dùng được. Không có màn
//      hình chặn nào ("bạn phải đăng nhập để tiếp tục").
//   2. Không giữ token trong JS. Renderer chỉ nhận `{configured, loggedIn, email}`
//      và tên/ảnh đại diện — token sống trong tiến trình Rust và trên đĩa chỉ có
//      blob DPAPI. Vì vậy `authSession` KHÔNG được dùng để vẽ UI (xem ghi chú
//      dưới); nó chỉ dành cho phần Cloud AI (Phase 2).
const accountState = {
  status: null, // { configured, loggedIn, email } — null = chưa đọc được
  session: null, // { displayName, avatarUrl } — chỉ để vẽ, không có token
  error: '',
  busy: '',
};

function accountAttr(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

/** Chữ trên chip: email nếu đã đăng nhập, "Khách" nếu chưa. */
function accountDisplayName() {
  const status = accountState.status;
  if (!status || !status.loggedIn) return 'Khách';
  const email = String(status.email || '');
  return email || 'Đã đăng nhập';
}

/** Một ký tự cho avatar khi không có ảnh Google. */
function accountInitial() {
  const status = accountState.status;
  if (!status || !status.loggedIn) return 'GV';
  const source = String((status.email || '').trim());
  return source ? source[0].toUpperCase() : '?';
}

/** Một trong bốn trạng thái mà cổng UI đo được, không phải một class CSS. */
function accountUiState() {
  if (accountState.error) return 'unknown';
  const status = accountState.status;
  if (!status) return 'unknown';
  // `problem`: tệp phiên có nhưng không đọc được. Nói "Khách" lúc đó là nói dối —
  // giáo viên sẽ tưởng mình chưa đăng nhập trong khi phiên chỉ hỏng.
  if (status.problem) return 'unknown';
  if (!status.configured) return 'unconfigured';
  return status.loggedIn ? 'member' : 'guest';
}

const ACCOUNT_ROLE_TEXT = {
  member: 'Đã đăng nhập',
  guest: 'Chưa đăng nhập',
  unconfigured: 'Cloud AI chưa cấu hình',
  unknown: 'Không đọc được trạng thái',
};

/** Vẽ lại chip ở đáy sidebar. Idempotent: `render()` gọi nó ở mỗi lần vẽ trang. */
function renderAccountChip() {
  const chip = document.querySelector('[data-account-chip]');
  if (!chip) return;
  const stateName = accountUiState();
  chip.dataset.state = stateName;
  const name = document.querySelector('[data-account-name]');
  if (name) name.textContent = accountDisplayName();
  const role = document.querySelector('[data-account-role]');
  if (role) role.textContent = ACCOUNT_ROLE_TEXT[stateName] || '';
  const avatar = document.querySelector('[data-account-avatar]');
  if (avatar) {
    const url = accountState.session && accountState.session.avatarUrl;
    // Ảnh Google có thể 404 (tài khoản đã đổi ảnh): chip phải vẫn đọc được chữ cái.
    avatar.innerHTML = url
      ? '<img src="' + accountAttr(url) + '" alt="" referrerpolicy="no-referrer" onerror="this.remove()">'
      : escapeHtml(accountInitial());
  }
}

/** Đọc trạng thái tài khoản từ vỏ. Lỗi không được làm gãy vỏ. */
async function refreshAccount() {
  try {
    accountState.status = await desktop.call('authStatus');
    accountState.error = '';
    // Tên/ảnh đại diện chỉ có trong phiên; lỗi ở đây là bình thường khi là Khách.
    accountState.session = accountState.status && accountState.status.loggedIn
      ? await desktop.call('authSession').catch(() => null)
      : null;
  } catch (error) {
    accountState.status = null;
    accountState.session = null;
    accountState.error = (error && error.message) || 'lỗi không xác định';
  }
  renderAccountChip();
}

function accountPanelHtml() {
  const stateName = accountUiState();
  const status = accountState.status || {};
  const head = '<div class="modal-head"><h2>Tài khoản</h2>'
    + '<button class="modal-close" data-close aria-label="Đóng">' + uiIcon('x', '', 16) + '</button></div>';
  const guestNote = '<div class="info-box">Bạn đang dùng ở chế độ <strong>Khách</strong>. '
    + 'Trò chơi, giáo án và kết quả vẫn lưu trên máy này và vẫn chơi được khi không có Internet. '
    + 'Đăng nhập chỉ cần cho Cloud AI.</div>';
  let body = '';
  if (stateName === 'member') {
    body = '<div class="account-panel-who"><span class="account-avatar account-avatar-lg">' + escapeHtml(accountInitial()) + '</span>'
      + '<div><strong class="block">' + escapeHtml(accountDisplayName()) + '</strong>'
      + '<span class="account-role">Đã đăng nhập bằng Google</span></div></div>'
      + '<div class="info-box mt-[14px]">Dữ liệu học tập nằm trên máy này, không tự tải lên đám mây. '
      + 'Đăng xuất không xoá trò chơi hay giáo án nào.</div>'
      + '<div class="account-actions"><button class="btn-ghost" data-account-cloud-test type="button">'
      + uiIcon('sparkles', '', 15) + ' Kiểm tra Cloud AI</button>'
      + '<button class="btn-ghost" data-account-signout type="button">Đăng xuất</button></div>'
      + accountCloudResultHtml()
      + '<p class="account-hint">Kiểm tra dùng 1 lượt tạo game thật của tháng: 3 câu từ một bài mẫu.</p>';
  } else if (stateName === 'guest') {
    body = guestNote
      + '<div class="account-actions"><button class="btn-primary" data-account-signin type="button">'
      + uiIcon('log-in', '', 15) + ' Đăng nhập với Google</button></div>'
      + '<p class="account-hint">Trình duyệt sẽ mở để bạn chọn tài khoản, rồi tự quay về ứng dụng.</p>';
  } else if (stateName === 'unconfigured') {
    body = '<div class="info-box">Cloud AI chưa được cấu hình trên máy này, nên chưa có đăng nhập. '
      + 'Bạn vẫn dùng được AI local và mọi tính năng khác.</div>';
  } else {
    const detail = accountState.error || (status && status.problem) || '';
    body = '<div class="info-box">Không đọc được phiên đăng nhập trên máy này.'
      + (detail ? ' Chi tiết: ' + escapeHtml(detail) : '')
      + ' Bạn vẫn dùng được ứng dụng ở chế độ Khách; hãy đăng nhập lại nếu muốn dùng Cloud AI.</div>'
      + '<div class="account-actions"><button class="btn-ghost" data-account-reset type="button">Xoá phiên cũ</button></div>';
  }
  const busy = accountState.busy
    ? '<p class="account-hint" data-account-busy>' + escapeHtml(accountState.busy) + '</p>'
    : '';
  return '<div class="modal-backdrop"><div class="modal" data-account-panel data-account-panel-state="'
    + accountAttr(stateName) + '">' + head + '<div class="modal-body">' + body + busy + '</div></div></div>';
}

function closeAccountPanel() {
  const root = $('#modalRoot');
  if (root) root.innerHTML = '';
}

function openAccountPanel() {
  const root = $('#modalRoot');
  if (!root) return;
  root.innerHTML = accountPanelHtml();
  if (typeof paintUiIcons === 'function') paintUiIcons(root);
  root.querySelectorAll('[data-close]').forEach(button => { button.onclick = closeAccountPanel; });
  const signIn = root.querySelector('[data-account-signin]');
  if (signIn) signIn.onclick = () => accountSignIn();
  const cloudTest = root.querySelector('[data-account-cloud-test]');
  if (cloudTest) cloudTest.onclick = () => accountCloudTest();
  const signOut = root.querySelector('[data-account-signout]');
  if (signOut) signOut.onclick = () => accountSignOut();
  // Phiên hỏng: chỉ xoá phiên, không phải "đăng xuất" một phiên đang sống.
  const reset = root.querySelector('[data-account-reset]');
  if (reset) reset.onclick = () => accountSignOut();
  // Không đọc lại trạng thái mỗi lần mở: panel phải vẽ đúng thứ người dùng vừa thấy
  // trên chip, không phải một trạng thái khác đến sau.
}

/** Kết quả lần kiểm Cloud AI gần nhất — hiện ngay trong panel, không toast. */
let accountCloudResult = null;

function accountCloudResultHtml() {
  if (!accountCloudResult) return '';
  const ok = accountCloudResult.ok === true;
  const questions = ok && accountCloudResult.game && Array.isArray(accountCloudResult.game.questions)
    ? accountCloudResult.game.questions.length
    : 0;
  const text = ok
    ? 'Cloud AI hoạt động: đã tạo ' + questions + ' câu hỏi từ bài mẫu.'
    : 'Cloud AI chưa dùng được: ' + (accountCloudResult.message || accountCloudResult.code || 'không rõ lý do');
  return '<div class="info-box mt-[10px]" data-account-cloud-result="' + (ok ? 'ok' : 'fail') + '">'
    + escapeHtml(text) + '</div>';
}

function rerenderAccountPanel() {
  const root = $('#modalRoot');
  if (root && root.querySelector('[data-account-panel]')) root.innerHTML = accountPanelHtml();
}

/**
 * Kiểm Cloud AI trên máy này bằng MỘT lượt thật (#132 §D7: nhà cung cấp chỉ "dùng được"
 * sau một lần gọi thành công). Không dùng để sinh nội dung cho lớp — chỉ để biết đường
 * cloud có thông không, trước khi giáo viên tin nó.
 */
async function accountCloudTest() {
  if (accountState.busy) return;
  accountState.busy = 'Đang gọi Cloud AI… (có thể mất 10–30 giây)';
  accountCloudResult = null;
  rerenderAccountPanel();
  try {
    accountCloudResult = await cloudSelfTest();
  } finally {
    accountState.busy = '';
    rerenderAccountPanel();
  }
}

async function accountSignIn() {
  if (accountState.busy) return;
  accountState.busy = 'Đang chờ bạn đăng nhập trong trình duyệt…';
  const root = $('#modalRoot');
  if (root) { root.innerHTML = accountPanelHtml(); }
  try {
    await desktop.call('authSignIn');
    await refreshAccount();
    closeAccountPanel();
    toast('Đã đăng nhập.');
  } catch (error) {
    // Lời từ chối từ Google/Supabase đã là câu tiếng Việt; không bọc thêm lần nữa.
    toast('Không đăng nhập được: ' + ((error && error.message) || 'lỗi không xác định'));
    accountState.busy = '';
    if (root) { root.innerHTML = accountPanelHtml(); }
  }
  accountState.busy = '';
  renderAccountChip();
}

async function accountSignOut() {
  if (accountState.busy) return;
  accountState.busy = 'Đang đăng xuất…';
  try {
    await desktop.call('authSignOut');
    accountState.session = null;
    await refreshAccount();
    closeAccountPanel();
    toast('Đã đăng xuất. Trò chơi và giáo án vẫn ở trên máy này.');
  } catch (error) {
    toast('Không đăng xuất được: ' + ((error && error.message) || 'lỗi không xác định'));
  }
  accountState.busy = '';
  renderAccountChip();
}

/**
 * Một listener uỷ nhiệm duy nhất cho cả chip lẫn các nút trong panel: panel được vẽ
 * lại sau mỗi lần đổi trạng thái, nên listener gắn trực tiếp lên nút sẽ chết theo
 * lần vẽ trước (bài học #122: một delegated listener, không phải một listener mỗi nút).
 */
function initAccount() {
  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest('[data-account-chip]')) {
      event.preventDefault();
      openAccountPanel();
    }
  });
  // Sự kiện từ Rust: phiên có thể đổi ngoài panel (đăng nhập/ra ở đường khác, lần
  // làm mới token). Chip phải theo, nếu không nó nói sai trạng thái của chính app.
  try { desktop.listen('onAuthSessionChanged', () => { refreshAccount().catch(() => {}); }); } catch (error) { /* vỏ cũ: không có sự kiện */ }
  try { desktop.listen('onAuthLoggedOut', () => { accountState.session = null; refreshAccount().catch(() => {}); }); } catch (error) { /* vỏ cũ */ }
  refreshAccount().catch(() => {});
}

if (typeof window !== 'undefined') {
  window.initAccount = initAccount;
  window.renderAccountChip = renderAccountChip;
}
