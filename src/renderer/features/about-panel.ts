// @ts-nocheck -- migrated legacy UI logic; new contracts are typed in src/shared/types.ts.
/*
 * Tab "Giới thiệu" của trang Cài đặt (#204, kế thừa cửa sổ riêng của #188).
 *
 * Ba lý do module này tồn tại thay vì một tệp HTML thứ hai:
 *  1. Giáo viên không cần biết "Giới thiệu" là cửa sổ khác — nó là một mục của Cài đặt
 *     giống "Tác vụ" hay "Chẩn đoán", và nó dùng đúng token màu/mực của ứng dụng nên
 *     chủ đề tối đúng mà không phải nuôi một bảng màu thứ hai (#160, #166, #202).
 *  2. Không còn cửa sổ thứ hai thì không còn preload thứ hai, không còn CSP thứ hai,
 *     không cònlogictập trung cửa sổ — ba tệp đã xoá.
 *  3. Máy trạng thái vẫn nằm nguyên ở main (src/services/update/update-policy.ts).
 *     Panel này KHÔNG suy diễn gì thêm: nó đổi bản trạng thái nhận được thành DOM, nên
 *     nút nào disabled ở main cũng disabled ở đây — không có cảnh "bấm được mà không
 *     thấy gì".
 *
 * Luật cập nhật phải giữ nguyên sau khi đổi chỗ ở:
 *  - không kiểm tra lúc khởi động (giờ vào lớp phải offline); chỉ kiểm tra khi tab
 *    hiện ra, và tối đa MỘT lần mỗi phiên — bấm qua bấm lại tab không được phát sinh
 *    thêm request ra ngoài. Muốn kiểm tra lại thì đã có nút "Kiểm tra cập nhật".
 *  - `autoDownload = false`: không tự tải gì trước khi giáo viên bấm (main giữ cờ này).
 *  - Bấm "Khởi động lại để cài" là một lần duy nhất.
 */

/** Kênh IPC trùng tên với ABOUT_CHANNELS ở src/shared/about-types.ts (renderer không import được). */
const ABOUT_PANEL_CHANNELS = Object.freeze({
  OPEN: 'about:open',
  INFO: 'about:info',
  STATE: 'about:state',
  STATE_PUSH: 'about:state-push',
  CHECK: 'about:check',
  DOWNLOAD: 'about:download',
  INSTALL: 'about:install',
  RELEASES: 'about:open-releases'
});

/**
 * Mực của năm sắc độ badge. Đây chính là bộ chip mà trang Cài đặt đang dùng
 * (`chipTone` trong pages/settings.ts và khối provider ở cùng tệp), nên panel không
 * tự phát minh màu mới — mỗi cặp đều đã qua cổng tương phản của #181/#164 ở cả hai
 * chủ đề: idle 5,06/5,84 · checking 5,62/8,02 · ok 4,91/8,44 · new 5,64/9,35 ·
 * error 6,01/9,11.
 */
const ABOUT_TONE_CLASSES = {
  idle: 'bg-[#f5f6fa] text-[#5f6a7d] dark:bg-[#1e2544] dark:text-[#94a3b8]',
  checking: 'bg-[#eef2ff] text-[#4f46e5] dark:bg-[#1e1b4b] dark:text-[#a5b4fc]',
  ok: 'bg-[#effaf5] text-[#0f7b5c] dark:bg-[#132d24] dark:text-[#4ade80]',
  new: 'bg-[#fef3c7] text-[#9c4808] dark:bg-[#2d2413] dark:text-[#fbbf24]',
  error: 'bg-[#fef2f2] text-[#b42318] dark:bg-[#2d1313] dark:text-[#fca5a5]'
};

/** Cùng luật với canCheck/canDownload/canInstall trong máy trạng thái ở main. */
function aboutCanCheck(state) { return state.phase !== 'checking' && state.phase !== 'downloading'; }
function aboutCanDownload(state) {
  return (state.phase === 'available' || (state.phase === 'error' && !!state.newVersion)) && !!state.newVersion;
}
function aboutCanInstall(state) { return state.phase === 'downloaded' && !!state.newVersion; }

const ABOUT_BADGES = {
  idle: { text: 'Chưa kiểm tra cập nhật', tone: 'idle' },
  checking: { text: 'Đang kiểm tra…', tone: 'checking' },
  'up-to-date': { text: 'Ứng dụng đã mới nhất', tone: 'ok' },
  available: { text: 'Có bản mới', tone: 'new' },
  downloading: { text: 'Đang tải bản cập nhật…', tone: 'checking' },
  downloaded: { text: 'Cập nhật sẵn sàng!', tone: 'ok' },
  error: { text: 'Không kiểm tra được', tone: 'error' }
};

/** Một câu tiếng Việt cho mỗi loại lỗi — chữ hiện ra trước mắt giáo viên, không phải log. */
const ABOUT_ERRORS = {
  'dev-mode': 'Bản bạn đang chạy không phải bộ cài đặt (nó chạy từ mã nguồn), nên không thể tự cập nhật. Hãy tải bộ cài .exe từ trang phát hành và cài bình thường.',
  offline: 'Không kết nối được internet, nên chưa kiểm tra được bản mới. Mọi trò chơi đã lưu vẫn chơi bình thường — chỉ việc tìm bản cập nhật là cần mạng.',
  feed: 'Chưa tìm thấy bản phát hành nào trên GitHub. Có thể ứng dụng chưa đăng bản nào, hoặc máy đang chặn kết nối tới github.com.',
  checksum: 'Tệp cập nhật tải về không toàn vẹn (hỏng hoặc không khớp bản công bố) nên bị chặn trước khi cài. Hãy bấm “Tải về và cập nhật” để tải lại; nếu vẫn lỗi, tải bộ cài .exe từ trang phát hành.',
  signature: 'Bộ cài tải về không vượt qua kiểm tra chữ ký số nên không được cài. Đây là cơ chế bảo vệ: hãy tải bộ cài từ trang phát hành.',
  cancelled: 'Bạn đã dừng việc tải về. Có thể bấm “Tải về và cập nhật” để tải lại từ đầu.',
  install: 'Không mở được bộ cài vừa tải. Thường do thiếu quyền quản trị — hãy tải bộ cài từ trang phát hành và chạy nó bằng quyền Admin.',
  unknown: 'Có lỗi khi kiểm tra bản cập nhật. Bạn vẫn dùng app bình thường; thử lại sau, hoặc tải bộ cài từ trang phát hành.'
};

/** Bản `UpdateState` rỗng — cùng trường như máy trạng thái ở main khai báo. */
function aboutEmptyState() {
  return {
    phase: 'idle', currentVersion: '', newVersion: '', progressPercent: 0,
    transferredBytes: 0, totalBytes: 0, bytesPerSecond: 0,
    errorKind: '', errorMessage: '', lastCheckedAt: 0, downloadStartedAt: 0
  };
}

/** Bộ nhớ của panel: DOM bị render() dựng lại liên tục, còn trạng thái thì không. */
const aboutPanel = {
  state: aboutEmptyState(),
  info: null,
  subscribed: false,
  detach: null,
  /** `about:open` đã gửi chưa trong phiên này — xem luật "một lần mỗi phiên" ở đầu tệp. */
  kicked: false,
  /** Một cặp `about:info` + `about:state` đang chờ — chống render() gọi lặp khi IPC chưa về. */
  loading: false,
  installRequested: false,
  /** Cầu nối hỏng (preload không có kênh about:*): hiện lời thay vì để màn hình đứng. */
  bridgeBroken: false
};

function aboutEl(id) { return document.getElementById(id); }
function aboutShow(id, visible) {
  const node = aboutEl(id);
  if (node) node.classList.toggle('hidden', !visible);
  return node;
}

/** `3,2 MB` — khác `formatBytes` của thư viện (luôn ra GB, vô nghĩa với một bộ cài vài MB). */
function aboutBytes(value) {
  const size = Number(value) || 0;
  if (size <= 0) return '0 KB';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let shown = size;
  while (shown >= 1024 && i < units.length - 1) { shown /= 1024; i += 1; }
  const digits = shown >= 100 || i === 0 ? 0 : 1;
  return shown.toFixed(digits).replace('.', ',') + ' ' + units[i];
}

function aboutEta(state) {
  if (state.phase !== 'downloading' || !(state.bytesPerSecond > 0)) return '';
  const left = state.totalBytes - state.transferredBytes;
  if (!(left > 0)) return '';
  const seconds = Math.round(left / state.bytesPerSecond);
  if (seconds < 20) return ' · vài giây nữa';
  if (seconds < 120) return ' · ~' + seconds + ' giây nữa';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return ' · ~' + minutes + ' phút nữa';
  return ' · ~' + Math.round(minutes / 60) + ' giờ nữa';
}

function aboutClock(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const hh = ('0' + date.getHours()).slice(-2);
  const mm = ('0' + date.getMinutes()).slice(-2);
  return ' · kiểm tra lúc ' + hh + ':' + mm;
}

/**
 * Mực của badge chỉ đi qua đúng một chỗ, nên cổng UI đo được cả năm sắc độ mà không
 * phải tự chép bảng màu (chép tay là cách một màu lệch AA lọt qua).
 */
function aboutBadgeTone(badge, tone) {
  const known = ABOUT_TONE_CLASSES[tone] ? tone : 'idle';
  badge.classList.remove(...Object.values(ABOUT_TONE_CLASSES).flatMap(group => group.split(' ')));
  badge.classList.add(...ABOUT_TONE_CLASSES[known].split(' '));
  badge.setAttribute('data-tone', known);
  return known;
}

/** Vẽ lại máy trạng thái lên DOM. Called after every render() and every push from main. */
function paintAboutPanel() {
  const badge = aboutEl('aboutStatusBadge');
  const current = aboutPanel.state;
  if (!badge) return;

  const badgeInfo = ABOUT_BADGES[current.phase] || ABOUT_BADGES.error;
  let label = badgeInfo.text;
  // Badge nói thẳng tên bản mới khi đã biết — giáo viên hỏi "có bản mới chưa", câu
  // trả lời phải có con số chứ không phải "có".
  if (current.newVersion) {
    if (current.phase === 'available') label = 'Có bản mới ' + current.newVersion;
    else if (current.phase === 'downloading') label = 'Đang tải ' + current.newVersion + '…';
    else if (current.phase === 'downloaded') label = 'Cập nhật ' + current.newVersion + ' sẵn sàng!';
  }
  aboutEl('aboutStatusText').textContent = label;
  aboutBadgeTone(badge, badgeInfo.tone);
  // Vòng quay chỉ vẽ khi thực sự đang chờ — không có animation giả.
  aboutShow('aboutStatusSpinner', current.phase === 'checking' || current.phase === 'downloading');

  let note = '';
  if (current.phase === 'up-to-date') note = 'Bản ' + current.currentVersion + ' là bản mới nhất đã công bố' + aboutClock(current.lastCheckedAt) + '.';
  else if (current.phase === 'available') note = 'Sẽ tải về khi bạn bấm nút — ứng dụng không tự tải' + aboutClock(current.lastCheckedAt) + '.';
  else if (current.phase === 'downloaded') note = 'Bộ cài đã nằm trên máy bạn. Cài lúc nào tùy bạn' + aboutClock(current.lastCheckedAt) + '.';
  else if (current.phase === 'idle') note = 'Bấm “Kiểm tra cập nhật” để tìm bản mới.';
  else if (current.phase === 'checking') note = 'Đang hỏi trang phát hành… ứng dụng vẫn dùng bình thường trong lúc chờ.';
  aboutEl('aboutStatusNote').textContent = note;

  const busy = current.phase === 'checking' || current.phase === 'downloading';
  const checkBtn = aboutEl('aboutCheckBtn');
  checkBtn.disabled = !aboutCanCheck(current);
  aboutEl('aboutCheckLabel').textContent = current.phase === 'checking' ? 'Đang kiểm tra…' : 'Kiểm tra cập nhật';
  if (busy) checkBtn.setAttribute('aria-busy', 'true');
  else checkBtn.removeAttribute('aria-busy');

  // Thẻ cập nhật: hiện từ lúc có bản mới cho tới lúc tải xong.
  const updateVisible = current.phase === 'available' || current.phase === 'downloading' || current.phase === 'downloaded';
  aboutShow('aboutUpdateCard', updateVisible);
  if (updateVisible) {
    aboutEl('aboutUpdateTitle').textContent = current.phase === 'downloaded'
      ? 'Cập nhật sẵn sàng!'
      : (current.phase === 'downloading' ? 'Đang tải bản cập nhật' : 'Có bản cập nhật mới');
    // `newVersion` đến từ nguồn cập nhật, không phải từ lập trình viên — nó là dữ liệu
    // bên ngoài và không bao giờ được thành HTML.
    aboutEl('aboutUpdateDiff').innerHTML = 'EduGame Studio <b>' + escapeHtml(current.newVersion)
      + '</b> · bản đang dùng <b>' + escapeHtml(current.currentVersion) + '</b>';
    const percent = Math.max(0, Math.min(100, Math.round(Number(current.progressPercent) || 0)));
    const barVisible = current.phase === 'downloading' || current.phase === 'downloaded';
    aboutShow('aboutProgressTrack', barVisible);
    aboutShow('aboutProgressText', barVisible);
    if (barVisible) {
      const fill = aboutEl('aboutProgressFill');
      fill.style.width = percent + '%';
      fill.setAttribute('aria-valuenow', String(percent));
      aboutEl('aboutProgressText').textContent = current.phase === 'downloaded'
        ? '100% · ' + aboutBytes(current.totalBytes) + ' · đã tải xong'
        : percent + '% · ' + aboutBytes(current.transferredBytes) + ' / ' + aboutBytes(current.totalBytes) + aboutEta(current);
    }
  }
  const downloadBtn = aboutEl('aboutDownloadBtn');
  downloadBtn.disabled = !aboutCanDownload(current);
  downloadBtn.textContent = current.phase === 'downloading' ? 'Đang tải…' : 'Tải về và cập nhật';
  aboutShow('aboutInstallBtn', current.phase === 'downloaded');
  const installBtn = aboutEl('aboutInstallBtn');
  installBtn.disabled = aboutPanel.installRequested || !aboutCanInstall(current);
  installBtn.textContent = aboutPanel.installRequested ? 'Đang khởi động bộ cài…' : 'Khởi động lại để cài';

  // Thẻ lỗi.
  const errorVisible = current.phase === 'error';
  aboutShow('aboutErrorCard', errorVisible);
  if (errorVisible) {
    const kind = ABOUT_ERRORS[current.errorKind] ? current.errorKind : 'unknown';
    aboutEl('aboutErrorText').textContent = ABOUT_ERRORS[kind];
    aboutEl('aboutErrorTitle').textContent = kind === 'install'
      ? 'Không cài được bản cập nhật'
      : (kind === 'signature' || kind === 'checksum' ? 'Bản cập nhật không hợp lệ' : 'Không kiểm tra được bản cập nhật');
    // Chi tiết kỹ thuật chỉ để đối chiếu khi giáo viên gửi ảnh báo lỗi.
    const detail = String(current.errorMessage || '').slice(0, 240);
    aboutShow('aboutErrorDetail', !!detail);
    if (detail) aboutEl('aboutErrorDetail').textContent = 'Chi tiết: ' + detail;
    aboutEl('aboutRetryBtn').disabled = !aboutCanCheck(current);
    // Nút "tải thủ công" luôn có sẵn khi lỗi, kể cả lỗi dev-mode.
    aboutEl('aboutErrorReleasesLink').setAttribute('href', (aboutPanel.info && aboutPanel.info.releasePageUrl) || '#');
  }

  aboutPaintTabChip();
  if (typeof paintUiIcons === 'function') paintUiIcons(aboutEl('aboutPanelBody'));
}

/** Thông tin ứng dụng — phần tĩnh của tab, chỉ đổi khi main trả về bản mới. */
function paintAboutInfo(info) {
  if (!info) return;
  aboutPanel.info = info;
  const appName = aboutEl('aboutAppName');
  if (!appName) return;
  appName.textContent = info.name || 'EduGame Studio';
  aboutEl('aboutDescription').textContent = info.description || '';
  aboutEl('aboutVersion').textContent = 'Phiên bản ' + (info.version || '—');
  aboutEl('aboutAuthor').textContent = info.author ? '· ' + info.author : '';
  aboutEl('factVersion').textContent = info.version || '—';
  aboutEl('factPackaged').textContent = info.packaged
    ? 'Bộ cài trên máy (tự cập nhật được)'
    : 'Mã nguồn đang phát triển (không tự cập nhật được)';
  aboutEl('factElectron').textContent = info.electron || '—';
  aboutEl('factChrome').textContent = info.chrome || '—';
  aboutEl('factNode').textContent = info.node || '—';
  aboutEl('factPlatform').textContent = (info.platform || '?') + ' / ' + (info.arch || '?');
  aboutEl('factLicense').textContent = info.license || '—';
  aboutEl('factUserData').textContent = info.userDataPath || '—';
  // Ảnh logo nằm trong resources của app; thiếu thì ẩn đi chứ không để vỡ ảnh.
  const icon = aboutEl('aboutAppIcon');
  if (icon && !icon.dataset.aboutIconGuarded) {
    icon.dataset.aboutIconGuarded = '1';
    icon.addEventListener('error', () => { icon.classList.add('hidden'); });
  }
}

/**
 * Một cú gọi IPC từ panel phải trả lời bằng DOM, kể cả khi cầu nối hỏng. Cầu nối
 * chỉ hỏng vì một lý do: preload không còn kênh `about:*` — mà khi đó giáo viên
 * bấm nút và không thấy gì, đúng cái lỗi #187 đã sửa.
 */
function aboutCall(name) {
  const api = window.eduGame || {};
  const fn = api[name];
  if (typeof fn !== 'function') {
    aboutBridgeFailure('the update bridge is not available in this window');
    return Promise.resolve({ ok: false, error: 'Bộ cập nhật không khả dụng trong cửa sổ này.' });
  }
  return Promise.resolve(fn()).then(function (result) {
    if (result && result.state) {
      aboutPanel.state = result.state;
      paintAboutPanel();
    }
    return result;
  }, function (error) {
    // invoke() từ chối khi handler phía main ném lỗi: phải hiện lời, không được để
    // màn hình đứng nguyên chỗ cũ.
    aboutBridgeFailure(String((error && error.message) || error || 'the update request failed'));
    return { ok: false, error: String((error && error.message) || error || '') };
  });
}

/**
 * Cầu nối hỏng thì nói thật, nhưng không được xoá mất quyền cài: đã tải xong là bộ
 * cài đã nằm trên đĩa (luật 6 của máy trạng thái ở main).
 */
function aboutBridgeFailure(message) {
  if (aboutPanel.state.phase === 'downloaded') {
    aboutPanel.bridgeBroken = true;
    return;
  }
  aboutPanel.state = Object.assign({}, aboutPanel.state, {
    phase: 'error', errorKind: 'unknown', errorMessage: message
  });
  paintAboutPanel();
}

/**
 * Thông tin ứng dụng + trạng thái cập nhật. `loading` là khoá chống spam: `render()` có
 * thể chạy nhiều lần trong lúc IPC còn đang chờ, và mỗi lần lại gọi cặp kênh này.
 */
function aboutLoad() {
  if (aboutPanel.loading) return Promise.resolve();
  const api = window.eduGame || {};
  if (typeof api.aboutInfo !== 'function' && typeof api.aboutState !== 'function') return Promise.resolve();
  aboutPanel.loading = true;
  const jobs = [];
  if (typeof api.aboutInfo === 'function') jobs.push(api.aboutInfo().then(paintAboutInfo, () => {}));
  if (typeof api.aboutState === 'function') {
    jobs.push(api.aboutState().then(state => {
      if (state) { aboutPanel.state = state; paintAboutPanel(); }
    }, () => {}));
  }
  return Promise.all(jobs).then(function (value) {
    aboutPanel.loading = false;
    return value;
  }, function () { aboutPanel.loading = false; });
}

/**
 * `about:open` = "tab Giới thiệu vừa hiện ra" (#204). Main nhân dịp này mới nạp
 * `electron-updater` (~123 ms, P0 đo khởi động) và hỏi nguồn cập nhật một lượt.
 * Tối đa một lần mỗi phiên: đổi tab qua lại không được thành nhiều request ra ngoài.
 */
function aboutKickCheck() {
  if (aboutPanel.kicked) return;
  const api = window.eduGame || {};
  if (typeof api.openAbout !== 'function') return;
  aboutPanel.kicked = true;
  // Không chờ: một nguồn chậm mà chặn thì tab hiện ra trắng xoá vài chục giây.
  aboutCall('openAbout').then(result => {
    if (result && result.state) { aboutPanel.state = result.state; paintAboutPanel(); }
  });
}

/**
 * Nối vào trang Cài đặt sau mỗi lần `render()` dựng lại DOM.
 *
 * Listener gắn trực tiếp lên nút vì `render()` thay toàn bộ cây con của trang; đăng ký
 * `onAboutState` thì chỉ một lần (module-level), callback vẽ vào cây đang sống nên
 * không bao giờ vẽ vào nút đã bị bỏ.
 */
function wireAboutPanel() {
  const panel = aboutEl('settingsPanel-about');
  if (!panel) return;

  if (!aboutPanel.subscribed && window.eduGame && typeof window.eduGame.onAboutState === 'function') {
    aboutPanel.detach = window.eduGame.onAboutState(state => {
      if (!state) return;
      aboutPanel.state = state;
      paintAboutPanel();
    });
    aboutPanel.subscribed = true;
  }

  aboutEl('aboutCheckBtn').addEventListener('click', () => aboutCall('aboutCheck'));
  aboutEl('aboutRetryBtn').addEventListener('click', () => aboutCall('aboutCheck'));
  aboutEl('aboutDownloadBtn').addEventListener('click', () => aboutCall('aboutDownload'));
  aboutEl('aboutInstallBtn').addEventListener('click', () => {
    aboutPanel.installRequested = true;
    paintAboutPanel();
    aboutCall('aboutInstall');
  });
  aboutEl('aboutErrorReleasesLink').addEventListener('click', event => {
    event.preventDefault();
    const api = window.eduGame || {};
    if (typeof api.aboutOpenReleases === 'function') {
      void api.aboutOpenReleases((aboutPanel.info && aboutPanel.info.releasePageUrl) || '');
    }
  });

  paintAboutPanel();
  if (aboutPanel.info) paintAboutInfo(aboutPanel.info); else void aboutLoad();
  if (!panel.classList.contains('hidden')) {
    if (!aboutPanel.kicked) void aboutLoad().then(aboutKickCheck);
    else aboutKickCheck();
  }
}

/**
 * Markup của tab. Màu nào cũng có cặp `dark:` — chủ đề tối của ứng dụng khoá theo
 * `[data-theme="dark"]` (#160) và một khối nền sáng không đổi mực là "hòn đảo" mà
 * #202 đã liệt kê. Cỡ chữ thấp nhất ở đây là 13px (sàn #181), trừ các nút
 * `.btn-small` dùng chung với cả trang Cài đặt.
 */
function aboutPanelHtml() {
  const card = 'rounded-xl border border-[#e2e8f0] dark:border-[#2a324b] bg-[#f8fafc] dark:bg-[#151a30] p-4';
  const hint = 'text-[13px] text-[#4f5a6e] dark:text-[#94a3b8] leading-relaxed';
  // Cặp mực của chính thẻ Cài đặt (`#1e293b` / `#f1f5f9`) — panel nằm trong thẻ đó nên
  // dùng mực riêng là một "hòn đảo" theo #202.
  const ink = 'text-[#1e293b] dark:text-[#f1f5f9]';
  return `
  <div class="flex items-start gap-4 flex-wrap">
    <img id="aboutAppIcon" class="w-[56px] h-[56px] rounded-[14px] object-cover bg-[#eeeefe] dark:bg-[#1e2544] border border-[#e2e8f0] dark:border-[#2a324b]" src="renderer/assets/app-icon.png" alt="" />
    <div class="min-w-0 flex-1">
      <strong id="aboutAppName" class="text-[15px] font-bold ${ink} block">EduGame Studio</strong>
      <p id="aboutDescription" class="${hint} mt-1">Ứng dụng Windows tạo và chơi game giáo dục.</p>
      <div class="flex items-center gap-2 flex-wrap mt-2">
        <span id="aboutVersion" class="inline-flex items-center rounded-full px-3 py-1 text-[13px] font-bold bg-[#eef2ff] text-[#4f46e5] dark:bg-[#1e1b4b] dark:text-[#a5b4fc]">Phiên bản —</span>
        <span id="aboutAuthor" class="${hint}"></span>
      </div>
    </div>
  </div>

  <div id="aboutPanelBody" class="mt-4 flex flex-col gap-3">
    <section class="${card}" aria-label="Trạng thái cập nhật">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <span id="aboutStatusBadge" role="status" aria-live="polite" data-tone="idle"
              class="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-bold bg-[#f5f6fa] text-[#5f6a7d] dark:bg-[#1e2544] dark:text-[#94a3b8]">
          <span id="aboutStatusSpinner" class="hidden animate-spin" data-icon="loader-circle" data-icon-size="13" aria-hidden="true"></span>
          <span id="aboutStatusText">Đang tải thông tin…</span>
        </span>
        <button type="button" id="aboutCheckBtn" class="btn btn-secondary btn-small">
          <span data-icon="refresh-cw" data-icon-size="13"></span> <span id="aboutCheckLabel">Kiểm tra cập nhật</span>
        </button>
      </div>
      <p id="aboutStatusNote" class="${hint} mt-3">Đang chuẩn bị kiểm tra bản cập nhật…</p>
    </section>

    <section id="aboutUpdateCard" class="${card} hidden" aria-live="polite">
      <h4 id="aboutUpdateTitle" class="m-0 text-[14px] font-bold ${ink}">Có bản cập nhật mới</h4>
      <p id="aboutUpdateDiff" class="${hint} mt-1 mb-0"></p>
      <div id="aboutProgressTrack" class="hidden h-[10px] rounded-full overflow-hidden mt-3 bg-[#e2e8f0] dark:bg-[#2a324b]">
        <div id="aboutProgressFill" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"
             class="h-full w-0 rounded-full bg-[#4f46e5] dark:bg-[#a5b4fc]" style="transition:width 250ms ease-out"></div>
      </div>
      <p id="aboutProgressText" class="${hint} mt-2 mb-0 tabular-nums hidden"></p>
      <div class="flex items-center gap-2 flex-wrap mt-3">
        <button type="button" id="aboutDownloadBtn" class="btn btn-primary btn-small">Tải về và cập nhật</button>
        <button type="button" id="aboutInstallBtn" class="btn btn-primary btn-small hidden">Khởi động lại để cài</button>
      </div>
    </section>

    <section id="aboutErrorCard" class="rounded-xl border border-[#fecaca] dark:border-[#4a1b1b] bg-[#fef2f2] dark:bg-[#2d1313] p-4 hidden" aria-live="polite">
      <h4 id="aboutErrorTitle" class="m-0 text-[14px] font-bold text-[#b42318] dark:text-[#fca5a5]">Không kiểm tra được bản cập nhật</h4>
      <p id="aboutErrorText" class="text-[13px] ${ink} mt-2 mb-0"></p>
      <p id="aboutErrorDetail" class="${hint} mt-2 mb-0 break-words hidden"></p>
      <div class="flex items-center gap-2 flex-wrap mt-3">
        <button type="button" id="aboutRetryBtn" class="btn btn-primary btn-small">
          <span data-icon="refresh-cw" data-icon-size="13"></span> <span>Thử lại</span>
        </button>
        <a class="text-[13px] font-semibold text-[#4f46e5] dark:text-[#a5b4fc] underline" href="#" id="aboutErrorReleasesLink">
          Tải bộ cài từ trang phát hành
        </a>
      </div>
    </section>

    <section class="${card}" aria-label="Thông tin hệ thống">
      <h4 class="m-0 text-[14px] font-bold ${ink}">Thông tin chi tiết</h4>
      <dl class="grid grid-cols-[minmax(0,180px)_minmax(0,1fr)] gap-[6px_14px] mt-3 mb-0">
        <dt class="${hint}">Phiên bản đang chạy</dt><dd id="factVersion" class="text-[13px] ${ink} m-0 break-all">—</dd>
        <dt class="${hint}">Chạy từ</dt><dd id="factPackaged" class="text-[13px] ${ink} m-0 break-all">—</dd>
        <dt class="${hint}">Electron</dt><dd id="factElectron" class="text-[13px] ${ink} m-0 break-all">—</dd>
        <dt class="${hint}">Chrome nhân</dt><dd id="factChrome" class="text-[13px] ${ink} m-0 break-all">—</dd>
        <dt class="${hint}">Node</dt><dd id="factNode" class="text-[13px] ${ink} m-0 break-all">—</dd>
        <dt class="${hint}">Hệ điều hành</dt><dd id="factPlatform" class="text-[13px] ${ink} m-0 break-all">—</dd>
        <dt class="${hint}">Giấy phép</dt><dd id="factLicense" class="text-[13px] ${ink} m-0 break-all">—</dd>
        <dt class="${hint}">Nơi lưu giáo án và trò chơi</dt><dd id="factUserData" class="text-[13px] ${ink} m-0 break-all">—</dd>
      </dl>
      <p id="aboutFoot" class="${hint} mt-3 mb-0">
        Bản cập nhật chỉ tải về khi bạn bấm nút, và chỉ cài khi bạn bấm
        “Khởi động lại để cài”. Giáo án, trò chơi đã lưu và lịch sử chơi không bị xoá
        khi cập nhật; các trò chơi đã lưu vẫn chơi được offline.
      </p>
    </section>
  </div>`;
}

/** Chip gọn ở nhãn tab: chỉ nói khi có điều đáng nói. */
function aboutTabChip() {
  const current = aboutPanel.state;
  if (current.phase === 'available') {
    return { text: '↑ ' + current.newVersion, ok: false, title: 'Có bản mới ' + current.newVersion + ' — vào tab để tải' };
  }
  if (current.phase === 'downloaded') {
    return { text: '✓ Cài được', ok: true, title: 'Bộ cài ' + current.newVersion + ' đã nằm trên máy' };
  }
  return null;
}

/**
 * Hai sắc độ còn lại của ô chip tab lấy nguyên từ `chipTone` của trang Cài đặt, nên
 * tab này không thêm họ màu mới vào danh sách "đảo màu" mà #202 phải theo dõi.
 */
const ABOUT_CHIP_TONE = {
  ok: 'bg-[#effaf5] dark:bg-[#132d24] text-[#0f7b5c] dark:text-[#4ade80]',
  new: 'bg-[#fef3c7] dark:bg-[#2d2413] text-[#9c4808] dark:text-[#fbbf24]'
};

/**
 * Markup chip của nhãn tab. `newVersion` đến từ nguồn cập nhật — dữ liệu ngoài — nên
 * nó chỉ được đi qua `escapeHtml` trước khi thành HTML.
 */
function aboutTabChipHtml() {
  const chip = aboutTabChip();
  if (!chip) return '';
  return '<span class="px-1 py-0.5 rounded text-[11px] font-semibold shrink-0 inline-flex items-center gap-[4px] '
    + (chip.ok ? ABOUT_CHIP_TONE.ok : ABOUT_CHIP_TONE.new) + '" title="' + escapeHtml(chip.title)
    + '">' + escapeHtml(chip.text) + '</span>';
}

/**
 * Trang Cài đặt để lại một ô trống `[data-about-tab-chip]` trong nhãn tab; main đẩy trạng
 * thái bất cứ lúc nào, nên chip vẽ lại ở đây thay vì chờ `render()` — không có cảnh "đã tải
 * xong mà nhãn tab vẫn im".
 */
function aboutPaintTabChip() {
  const html = aboutTabChipHtml();
  document.querySelectorAll('[data-about-tab-chip]').forEach(function (slot) {
    if (slot.innerHTML !== html) slot.innerHTML = html;
  });
}

/** Bản sao cho gate/cổng kiểm tra — không suy diễn, chỉ đọc lại những gì panel đang giữ. */
function aboutPanelSnapshot() {
  return {
    state: aboutPanel.state,
    info: aboutPanel.info,
    kicked: aboutPanel.kicked,
    installRequested: aboutPanel.installRequested,
    bridgeBroken: aboutPanel.bridgeBroken
  };
}

window.aboutPanelHtml = aboutPanelHtml;
window.wireAboutPanel = wireAboutPanel;
window.paintAboutPanel = paintAboutPanel;
window.paintAboutInfo = paintAboutInfo;
window.aboutBadgeTone = aboutBadgeTone;
window.aboutPanelSnapshot = aboutPanelSnapshot;
window.aboutTabChip = aboutTabChip;
window.aboutTabChipHtml = aboutTabChipHtml;
window.aboutPaintTabChip = aboutPaintTabChip;
window.aboutKickCheck = aboutKickCheck;
