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
  // #352: sổ dùng AI của chính tài khoản này. null = chưa đọc lần nào (KHÔNG phải "rỗng").
  history: null,
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
      + '<p class="account-hint">Kiểm tra dùng 1 lượt tạo game thật của tháng: 3 câu từ một bài mẫu.</p>'
      + accountUsageHistoryHtml();
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
  const usage = root.querySelector('[data-account-usage-load]');
  if (usage) usage.onclick = () => accountLoadUsage();
  // Không đọc lại trạng thái mỗi lần mở: panel phải vẽ đúng thứ người dùng vừa thấy
  // trên chip, không phải một trạng thái khác đến sau.
}

// ---------------------------------------------------------------------------
// #352 — sổ dùng AI của chính tài khoản này (bảng `ai_usage_log`).
//
// Đọc sổ cần `Authorization`, nên phép đọc nằm ở Rust (`account:usage-history`) và
// renderer chỉ nhận `{status, cost, unit, questions, error, at}`. Hai điều luật:
//   1. Đơn vị đi cùng con số (#348): "1 lượt" khác "2 credits".
//   2. Sổ rỗng và "không đọc được" là HAI trạng thái khác nhau — một cái là chưa tiêu gì,
//      cái kia là chưa biết. Hiện giống nhau là nói dối giáo viên về tiền của họ.
// ---------------------------------------------------------------------------

/** `2026-11-25T04:00:00Z` → `25/11`. Sai/thiếu thì trả chuỗi rỗng, không bịa ngày. */
function accountUsageDay(at) {
  const text = String(at || '');
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? match[3] + '/' + match[2] : '';
}

/** Một dòng sổ thành một câu ngắn. Hàm thuần, được đo bằng unit test. */
function accountUsageLine(row) {
  if (!row || typeof row !== 'object') return '';
  const day = accountUsageDay(row.at);
  const unit = row.unit === 'credits' ? 'credits' : 'lượt';
  const cost = Number(row.cost);
  const safeCost = Number.isFinite(cost) && cost > 0 ? cost : 0;
  const questions = Number(row.questions);
  const parts = [];
  if (day) parts.push(day);
  if (row.status === 'failed') {
    parts.push('lần gọi hỏng');
    parts.push('không trừ');
    const reason = String(row.error || '').trim();
    if (reason) parts.push('(' + reason + ')');
  } else {
    if (Number.isFinite(questions) && questions > 0) parts.push(questions + ' câu');
    else parts.push('đã tạo');
    parts.push(safeCost > 0 ? '-' + safeCost + ' ' + unit : 'không trừ');
  }
  return parts.join(' · ');
}

/** Khối sổ trong panel. Chưa đọc thì mời bấm; đọc rồi thì hiện các dòng. */
function accountUsageHistoryHtml() {
  const history = accountState.history;
  const head = '<div class="account-usage-head"><strong>Lịch sử dùng AI</strong>'
    + (history && history.ok === true && history.rows && history.rows.length
      ? '<span class="account-role">' + history.rows.length + ' lần gần nhất</span>'
      : '')
    + '</div>';
  if (!history) {
    return '<div class="account-usage" data-account-usage="idle">' + head
      + '<button class="btn-ghost btn-small" data-account-usage-load type="button">Xem lịch sử dùng AI</button>'
      + '<p class="account-hint">Sổ chỉ ghi số lượt/credits và số câu — không lưu nội dung bài học của bạn.</p>'
      + '</div>';
  }
  if (history.ok !== true) {
    const detail = String(history.message || history.code || '').trim();
    return '<div class="account-usage" data-account-usage="error">' + head
      + '<p class="account-hint">Không đọc được sổ dùng AI' + (detail ? ': ' + escapeHtml(detail) : '.')
      + ' Đây là lỗi đọc sổ, không phải kết luận là tháng này bạn chưa dùng gì.</p>'
      + '<button class="btn-ghost btn-small" data-account-usage-load type="button">Thử đọc lại</button>'
      + '</div>';
  }
  const rows = Array.isArray(history.rows) ? history.rows : [];
  if (!rows.length) {
    return '<div class="account-usage" data-account-usage="empty">' + head
      + '<p class="account-hint">Tháng này chưa có lần gọi AI nào.</p>'
      + '<button class="btn-ghost btn-small" data-account-usage-load type="button">Đọc lại</button>'
      + '</div>';
  }
  const items = rows.map(row => '<li data-account-usage-row="' + escapeHtml(row.status || '') + '">'
    + escapeHtml(accountUsageLine(row)) + '</li>').join('');
  return '<div class="account-usage" data-account-usage="ready">' + head
    + '<ul class="account-usage-list">' + items + '</ul>'
    + '<button class="btn-ghost btn-small" data-account-usage-load type="button">Đọc lại</button>'
    + '</div>';
}

/** Đọc sổ. Lỗi cũng là một trạng thái được vẽ, không phải toast rồi biến mất. */
async function accountLoadUsage() {
  if (accountState.busy) return;
  accountState.busy = 'Đang đọc sổ dùng AI…';
  rerenderAccountPanel();
  try {
    const result = await desktop.call('accountUsageHistory', { limit: 10 });
    accountState.history = (result && typeof result === 'object')
      ? result
      : { ok: false, rows: [], code: 'bad_response', message: 'Máy trả về dữ liệu không đọc được.' };
  } catch (error) {
    accountState.history = {
      ok: false,
      rows: [],
      code: 'transport_error',
      message: (error && error.message) || 'Không gọi được kênh đọc sổ.',
    };
  } finally {
    accountState.busy = '';
    rerenderAccountPanel();
  }
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
