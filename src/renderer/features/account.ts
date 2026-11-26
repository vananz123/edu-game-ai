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
  // #354/#362: đồng hồ hạn mức của kỳ 14 ngày ({plan, unit, used, limit, cost, month}) — null = chưa đọc.
  quota: null,
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

/** Vẽ lại chip ở đáy sidebar (tên, gói, đồng hồ hạn mức). Idempotent. */
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
  if (avatar) avatar.textContent = accountInitial();
  // #362: gói + đồng hồ ngay trên chip, vì đây là thứ giáo viên cần thấy TRƯỚC khi bấm tạo.
  const quota = accountState.quota;
  const planKey = accountQuotaPlanKey(quota);
  chip.dataset.plan = planKey;
  const plan = document.querySelector('[data-account-plan]');
  if (plan) {
    plan.textContent = accountQuotaBadgeText(quota);
    plan.hidden = planKey === 'none';
  }
  const meter = document.querySelector('[data-account-meter]');
  const fill = document.querySelector('[data-account-meter-fill]');
  const left = accountQuotaLeft(quota);
  if (meter && fill) {
    const share = accountQuotaShare(quota);
    if (share === null) {
      meter.hidden = true;
    } else {
      meter.hidden = false;
      fill.style.width = Math.round(share * 100) + '%';
      meter.dataset.tone = share <= 0.2 ? 'low' : (planKey === 'pro' ? 'pro' : 'free');
    }
  }
  // Câu trên chip phải NGẮN: sidebar rộng 232px, và một câu bị cắt ("Còn 10/10 lượt · k…") là
  // một câu không đọc được. Kỳ 2 tuần nói ở panel và ở `title` của chip.
  const roleText = document.querySelector('[data-account-role]');
  if (roleText && left && stateName === 'member') {
    roleText.textContent = 'Còn ' + left.left + '/' + left.limit + ' ' + left.unit;
    chip.title = accountQuotaLine(quota) + ' Bấm để mở Tài khoản.';
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
    // #362: đã đăng nhập thì đọc luôn hạn mức, để chip ở sidebar có số TRƯỚC khi bấm vào —
    // đây là phép đọc, không trừ lượt.
    if (accountState.status && accountState.status.loggedIn && accountState.quota === null) {
      void accountLoadQuota();
    }
  } catch (error) {
    accountState.status = null;
    accountState.session = null;
    accountState.error = (error && error.message) || 'lỗi không xác định';
  }
  renderAccountChip();
}

/** Ảnh đại diện lớn: ảnh Google nếu có, không thì chữ cái. */
function accountHeroAvatarHtml(size) {
  // Chỉ chữ cái, không chèn ảnh Google: đo bằng ảnh chụp ở #362, `<img>` từ googleusercontent
  // không tải được trong WebView2 và để lại biểu tượng ảnh vỡ ngay giữa khuôn mặt tài khoản.
  // Một chữ cái đúng lúc nào cũng đọc được; một ảnh vỡ thì luôn trông như ứng dụng hỏng.
  const cls = 'account-avatar ' + (size === 'lg' ? 'account-avatar-xl' : 'account-avatar-lg');
  return '<span class="' + cls + '">' + escapeHtml(accountInitial()) + '</span>';
}

/** Dòng đầu của panel: ai đang đăng nhập, và đang ở gói nào. */
function accountHeroHtml() {
  const quota = accountState.quota;
  const planKey = accountQuotaPlanKey(quota);
  const badge = accountQuotaBadgeText(quota);
  return '<div class="account-hero">'
    + accountHeroAvatarHtml('lg')
    + '<div class="account-hero-text">'
    + '<strong class="account-hero-name" data-account-hero-name>' + escapeHtml(accountDisplayName()) + '</strong>'
    + '<span class="account-hero-sub">Đăng nhập bằng Google'
    + (badge ? ' · <span class="account-badge" data-account-hero-badge="' + accountAttr(planKey) + '">' + escapeHtml(badge) + '</span>' : '')
    + '</span></div></div>';
}

/**
 * Thẻ mời đăng nhập — màn hình đầu tiên của người chưa có tài khoản.
 *
 * Không phải một bức tường: câu đầu tiên nói rõ ứng dụng vẫn chạy đầy đủ khi chưa đăng nhập,
 * câu thứ hai nói đăng nhập *mua thêm* gì. Một màn hình chặn sẽ vi phạm luật "Khách là mặc
 * định và hợp lệ" của tệp này.
 */
function accountSignInCardHtml() {
  return '<div class="account-signin">'
    + '<span class="account-signin-mark">' + uiIcon('sparkles', '', 22) + '</span>'
    + '<h3 class="account-signin-title">Đăng nhập để soạn câu hỏi bằng Cloud AI</h3>'
    + '<ul class="account-perks">'
    + '<li>' + uiIcon('check', '', 14) + ' Soạn cả bộ câu hỏi từ giáo án, có giải thích từng câu</li>'
    + '<li>' + uiIcon('check', '', 14) + ' 10 lượt miễn phí mỗi kỳ 2 tuần</li>'
    + '<li>' + uiIcon('check', '', 14) + ' Trò chơi, giáo án và điểm vẫn nằm trên máy bạn</li>'
    + '</ul>'
    + '<button class="account-google-btn" data-account-signin type="button">'
    + '<span class="account-google-g" aria-hidden="true">G</span>'
    + '<span>Đăng nhập với Google</span></button>'
    + '<p class="account-hint">Trình duyệt sẽ mở để bạn chọn tài khoản, rồi tự quay về ứng dụng. '
    + 'Không đăng nhập vẫn tạo và chơi game bình thường bằng AI local.</p>'
    + '</div>';
}

function accountPanelHtml() {
  const stateName = accountUiState();
  const status = accountState.status || {};
  const head = '<div class="modal-head"><h2>Tài khoản</h2>'
    + '<button class="modal-close" data-close aria-label="Đóng">' + uiIcon('x', '', 16) + '</button></div>';
  let body = '';
  if (stateName === 'member') {
    body = accountHeroHtml()
      + accountQuotaHtml()
      + '<div class="account-actions">'
      + '<button class="btn-ghost" data-account-cloud-test type="button">'
      + '<span class="account-btn-inner">' + uiIcon('sparkles', '', 15) + ' Kiểm tra Cloud AI</span></button>'
      + '<button class="btn-ghost" data-account-signout type="button">Đăng xuất</button></div>'
      + accountCloudResultHtml()
      + accountUsageHistoryHtml()
      + '<p class="account-hint">Dữ liệu học tập nằm trên máy này, không tự tải lên đám mây. '
      + 'Đăng xuất không xoá trò chơi hay giáo án nào. Kiểm tra Cloud AI dùng 1 lượt thật.</p>';
  } else if (stateName === 'guest') {
    body = accountSignInCardHtml()
      + '<div class="account-guest-note">' + uiIcon('shield', '', 15)
      + ' <span>Bạn đang dùng ở chế độ <strong>Khách</strong> — mọi thứ vẫn lưu trên máy này.</span></div>';
  } else if (stateName === 'unconfigured') {
    body = '<div class="account-card"><div class="account-card-top">'
      + '<span class="account-card-label">Cloud AI</span></div>'
      + '<p class="account-plan-line">Cloud AI chưa được cấu hình trên bản cài này, nên chưa có đăng nhập. '
      + 'Bạn vẫn dùng được AI local và mọi tính năng khác.</p></div>';
  } else {
    const detail = accountState.error || (status && status.problem) || '';
    body = '<div class="account-card"><div class="account-card-top">'
      + '<span class="account-card-label">Phiên đăng nhập</span></div>'
      + '<p class="account-plan-line">Không đọc được phiên trên máy này.'
      + (detail ? ' Chi tiết: ' + escapeHtml(detail) : '')
      + ' Bạn vẫn dùng được ứng dụng ở chế độ Khách.</p>'
      + '<div class="account-actions"><button class="btn-ghost" data-account-reset type="button">Xoá phiên cũ</button></div></div>';
  }
  const busy = accountState.busy
    ? '<p class="account-hint" data-account-busy>' + escapeHtml(accountState.busy) + '</p>'
    : '';
  return '<div class="modal-backdrop"><div class="modal modal-account" data-account-panel data-account-panel-state="'
    + accountAttr(stateName) + '">' + head + '<div class="modal-body account-body">' + body + busy + '</div></div></div>';
}

function closeAccountPanel() {
  const root = $('#modalRoot');
  if (root) root.innerHTML = '';
}

/**
 * Gắn lại handler cho MỌI nút trong panel.
 *
 * Phải là một hàm riêng vì `rerenderAccountPanel()` thay `innerHTML` — mà thay HTML là mất
 * toàn bộ `onclick` đã gắn. Trước #354 chỉ `openAccountPanel` gắn handler, nên sau một lần
 * vẽ lại (ví dụ đọc xong đồng hồ) nút "Đăng xuất" và "Kiểm tra Cloud AI" thành nút chết.
 */
function wireAccountPanel(root) {
  if (!root) return;
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
  const quotaRetry = root.querySelector('[data-account-quota-load]');
  if (quotaRetry) quotaRetry.onclick = () => accountLoadQuota();
}

function openAccountPanel() {
  const root = $('#modalRoot');
  if (!root) return;
  root.innerHTML = accountPanelHtml();
  wireAccountPanel(root);
  // Mở panel là đọc đồng hồ: đây là phép ĐỌC, không trừ lượt, nên không cần mời bấm.
  if (accountState.quota === null && !accountState.busy) accountLoadQuota();
  // Không đọc lại trạng thái mỗi lần mở: panel phải vẽ đúng thứ người dùng vừa thấy
  // trên chip, không phải một trạng thái khác đến sau.
}

// ---------------------------------------------------------------------------
// #354/#362 — đồng hồ hạn mức của KỲ 14 NGÀY. Đọc từ gateway (`GET /v1/usage`), KHÔNG trừ gì,
// và `userId` bên máy chủ luôn đến từ token nên không có đường đọc hạn mức của người khác.
// ---------------------------------------------------------------------------

/** 'pro' | 'free' | 'none'. 'none' = chưa đọc được hạn mức (KHÔNG phải "miễn phí"). */
function accountQuotaPlanKey(quota) {
  if (!quota || typeof quota !== 'object' || quota.ok !== true) return 'none';
  return quota.plan === 'plus' && quota.status === 'active' ? 'pro' : 'free';
}

/** Nhãn ngắn để in trên chip: "Pro" / "Free". Rỗng khi chưa biết. */
function accountQuotaBadgeText(quota) {
  const key = accountQuotaPlanKey(quota);
  return key === 'pro' ? 'Pro' : (key === 'free' ? 'Free' : '');
}

/** {used, limit, left, unit} hoặc null khi số không đọc được. */
function accountQuotaLeft(quota) {
  if (!quota || typeof quota !== 'object' || quota.ok !== true) return null;
  const used = Number(quota.used);
  const limit = Number(quota.limit);
  if (!Number.isFinite(used) || !Number.isFinite(limit) || limit <= 0) return null;
  return {
    used: Math.max(0, Math.trunc(used)),
    limit: Math.trunc(limit),
    left: Math.max(0, Math.trunc(limit - used)),
    unit: quota.unit === 'credits' ? 'credits' : 'lượt',
  };
}

/** Phần đã dùng (0..1) để vẽ thanh. null = không vẽ thanh (không biết số). */
function accountQuotaShare(quota) {
  const view = accountQuotaLeft(quota);
  if (!view) return null;
  return Math.min(1, Math.max(0, view.used / view.limit));
}

/** '2026-11-19' → '19/11'. Sai dạng thì trả chuỗi rỗng, không bịa ngày. */
function accountDayMonth(iso) {
  const match = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/u);
  return match ? match[3] + '/' + match[2] : '';
}

/**
 * Kỳ 14 ngày mà dòng hạn mức đang nằm trong: `19/11 – 02/12`.
 *
 * `quota.month` là NGÀY BẮT ĐẦU KỲ (#362), nên ngày kết thúc tính được ở đây mà không cần
 * máy chủ gửi thêm trường — và không cần migration cột nào.
 */
function accountPeriodText(month) {
  const start = accountDayMonth(month);
  if (!start) return '';
  const match = String(month).match(/^(\d{4})-(\d{2})-(\d{2})/u);
  const end = new Date(Date.parse(match[0] + 'T00:00:00Z') + 13 * 86_400_000).toISOString().slice(0, 10);
  return start + ' – ' + accountDayMonth(end);
}

/** "Còn 1/5 lượt tạo game (kỳ 2 tuần)." — đơn vị đi cùng con số (#348). Hàm thuần. */
function accountQuotaLine(quota) {
  const view = accountQuotaLeft(quota);
  if (!view) return '';
  if (view.left <= 0) return 'Đã hết ' + view.unit + ' tạo game của kỳ này (' + view.used + '/' + view.limit + ').';
  return 'Còn ' + view.left + '/' + view.limit + ' ' + view.unit + ' tạo game (kỳ 2 tuần).';
}

/** Gói, để giáo viên biết mình đang được đo bằng gì. */
function accountQuotaPlanText(quota) {
  if (!quota || typeof quota !== 'object' || quota.ok !== true) return '';
  if (quota.plan === 'plus' && quota.status === 'active') return 'Gói Plus';
  return 'Gói miễn phí';
}

/** Một câu giải thích giá của một lần soạn, theo đơn vị đang dùng. */
function accountQuotaCostText(quota) {
  const view = accountQuotaLeft(quota);
  if (!view) return '';
  const cost = Number(quota.cost);
  const price = Number.isFinite(cost) && cost > 0 ? Math.trunc(cost) : 1;
  return 'Mỗi lần soạn câu hỏi: ' + price + ' ' + view.unit
    + ' · đã dùng ' + view.used + '/' + view.limit;
}

/** Thẻ hạn mức trong panel: tên gói, thanh, số còn lại, kỳ. */
function accountQuotaHtml() {
  const quota = accountState.quota;
  if (!quota) {
    return '<div class="account-card account-quota" data-account-quota="loading">'
      + '<div class="account-card-top"><span class="account-card-label">Gói của bạn</span></div>'
      + '<p class="account-plan-line">Đang đọc hạn mức kỳ này…</p>'
      + '<div class="account-meter account-meter-lg"><i style="width:0%"></i></div></div>';
  }
  if (quota.ok !== true) {
    const detail = String(quota.message || quota.code || '').trim();
    return '<div class="account-card account-quota" data-account-quota="error">'
      + '<div class="account-card-top"><span class="account-card-label">Gói của bạn</span></div>'
      + '<p class="account-plan-line">Chưa đọc được hạn mức kỳ này'
      + (detail ? ': ' + escapeHtml(detail) : '.')
      + ' Đây là lỗi đọc số, không phải kết luận là bạn còn đủ lượt.</p>'
      + '<button class="btn-ghost btn-small" data-account-quota-load type="button">Thử lại</button></div>';
  }
  const line = accountQuotaLine(quota);
  const view = accountQuotaLeft(quota);
  if (!line || !view) {
    return '<div class="account-card account-quota" data-account-quota="error">'
      + '<div class="account-card-top"><span class="account-card-label">Gói của bạn</span></div>'
      + '<p class="account-plan-line">Máy trả về hạn mức không đọc được. Thử lại sau.</p>'
      + '<button class="btn-ghost btn-small" data-account-quota-load type="button">Thử lại</button></div>';
  }
  const planKey = accountQuotaPlanKey(quota);
  const share = accountQuotaShare(quota);
  const percent = Math.round(share * 100);
  const period = accountPeriodText(quota.month);
  const low = view.left <= Math.max(1, Math.floor(view.limit * 0.2));
  return '<div class="account-card account-quota" data-account-quota="ready" data-plan="' + accountAttr(planKey) + '">'
    + '<div class="account-card-top"><span class="account-card-label">Gói của bạn</span>'
    + '<span class="account-badge" data-account-badge="' + accountAttr(planKey) + '">'
    + escapeHtml(accountQuotaBadgeText(quota)) + '</span></div>'
    + '<p class="account-plan-name">' + escapeHtml(accountQuotaPlanText(quota)) + '</p>'
    + '<p class="account-plan-line' + (low ? ' is-low' : '') + '">' + escapeHtml(line) + '</p>'
    + '<div class="account-meter account-meter-lg" data-tone="' + accountAttr(low ? 'low' : planKey) + '">'
    + '<i style="width:' + percent + '%"></i></div>'
    + '<p class="account-plan-foot">' + escapeHtml(accountQuotaCostText(quota))
    + (period ? ' · kỳ ' + escapeHtml(period) : '') + '</p></div>';
}

async function accountLoadQuota() {
  accountState.quota = null;
  rerenderAccountPanel();
  try {
    const result = await desktop.call('accountQuota');
    accountState.quota = (result && typeof result === 'object')
      ? result
      : { ok: false, code: 'bad_response', message: 'Máy trả về dữ liệu không đọc được.' };
  } catch (error) {
    accountState.quota = {
      ok: false,
      code: 'transport_error',
      message: (error && error.message) || 'Không gọi được kênh đọc hạn mức.',
    };
  } finally {
    rerenderAccountPanel();
    // Panel và chip là hai chỗ đọc cùng một con số; vẽ lại cả hai để chúng không lệch nhau.
    renderAccountChip();
  }
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
  if (!root || !root.querySelector('[data-account-panel]')) return;
  root.innerHTML = accountPanelHtml();
  // Vẽ lại là mất handler: phải gắn lại, nếu không các nút trong panel thành nút chết.
  wireAccountPanel(root);
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
