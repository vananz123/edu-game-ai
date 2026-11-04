// ui-about-check.js — cửa sổ "Giới thiệu" + bộ cập nhật tự động (#188) chạy trên
// Electron THẬT, với một nguồn cập nhật giả trên vòng lặp trong nước.
//
// Vì sao phải đo thật: hai suite unit (`update-policy`, `about-page`) chứng minh
// máy trạng thái và trang vẽ đúng, nhưng không chứng minh được ba thứ chỉ có ở
// Electron: (1) cửa sổ thứ hai mở ra thật, sandbox + preload riêng; (2)
// `electron-updater` đọc `dev-app-update.yml`, bắn `update-available` →
// `download-progress` → `update-downloaded` — đúng chuỗi kiện mà máy trạng thái
// được thiết kế quanh nó; (3) `autoDownload = false` không tải gì trước khi giáo
// viên bấm. Trang này không có DOM nào khác để mượn nên nó tự nạp.
//
// Cơ chế: ghi `dev-app-update.yml` (đã .gitignore) với `provider: generic` trỏ về
// một HTTP server nội bộ phục vụ `latest.yml` phiên bản 9.9.9 + bộ cài giả 3,2 MB
// (sha512 thật, ghi chậm theo phần để tiến trình kịp bắn nhiều lần). Bản dev có
// file đó thì `forceDevUpdateConfig` bật lên, nên đi hết chu trình mà không phải
// phát hành thật.
//
// Bẫy đã học ở lượt chạy trước: `AppUpdater` cache `configOnDisk` và
// `clientPromise` trong cả đời process, nên đổi URL trong `dev-app-update.yml`
// giữa chừng là đổi không — mọi lần kiểm tra sau vẫn dùng URL đầu tiên. Vì vậy
// gate giữ MỘT URL cố định và đổi hành vi PHÍA SERVER: tắt listener là nhánh
// `offline` (ERR_CONNECTION_REFUSED), trả 404 là nhánh `feed`, trả `latest.yml`
// là nhánh thành công.
//
// KHÔNG bấm "Khởi động lại để cài": `quitAndInstall` spawn bộ cài và đóng ứng dụng.
// Chu trình đo tới mức "nút sáng, trang sáng, main nhận yêu cầu"; việc wizard chạy
// thật chỉ kiểm chứng được bằng bộ cài thật (nêu rõ khi bàn giao).
//
// Chạy:
//   npm run build
//   $env:EDUGAME_USER_DATA="$env:TEMP\qoder-aboutgate"
//   npx electron . --remote-debugging-port=9355
//   node tests/ui/ui-about-check.js 9355
const { check, results } = require('../manual/lib/ui-check-lib');
const { findTarget, listTargets } = require('./lib/screenshot-capture');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const PORT = Number(process.argv[2] || process.env.CDP_PORT || 9355);
const REPO = path.join(__dirname, '..', '..');
const DEV_FEED = path.join(REPO, 'dev-app-update.yml');
const NEW_VERSION = '9.9.9';
const INSTALLER_NAME = 'EduGameStudio-9.9.9-setup.exe';
const CACHE_DIR_NAME = 'edugame-studio-about-gate';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Nối CDP vào một target theo URL (thư viện dùng chung chỉ biết index.html). */
async function connectTo(matcher) {
  const target = await findTarget(PORT, matcher);
  if (!target) {
    const found = (await listTargets(PORT)).map(t => t.url).join('\n  ');
    throw new Error(`no target matching ${matcher} on port ${PORT}. Pages:\n  ` + found);
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  let id = 0;
  const pend = new Map();
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id && pend.has(message.id)) { pend.get(message.id)(message); pend.delete(message.id); }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const i = ++id;
    const timer = setTimeout(() => { pend.delete(i); reject(new Error(`CDP timeout: ${method}`)); }, 25000);
    pend.set(i, message => { clearTimeout(timer); resolve(message); });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const evaluate = async expression => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval error');
    return r.result?.result?.value;
  };
  await send('Runtime.enable');
  await send('Page.enable');
  return { ws, send, evaluate };
}

// --- nguồn cập nhật giả ---------------------------------------------------

/**
 * Bộ cài giả 3,2 MB. Nội dung đổi theo từng lần chạy để `validateDownloadedPath`
 * của electron-updater thấy file đệm không khớp sha512 mới và tải lại từ đầu — nếu
 * không, chạy lần hai sẽ "thành công" mà không tải gì và không có tiến trình để đo.
 */
function makePayload() {
  const secret = `${Date.now()}-${process.pid}`;
  const size = 3_200_000;
  const buffer = Buffer.alloc(size);
  for (let i = 0; i < size; i += 1) buffer[i] = (i * 31 + secret.charCodeAt(i % secret.length)) & 0xff;
  return buffer;
}

/**
 * Nhịp ghi của server: 100 KB mỗi 250 ms ~ 8 giây tải. `ProgressCallbackTransform`
 * chỉ bắn một event tiến trình mỗi 1000 ms, nên một lần tải dưới 1 giây chỉ ra đúng
 * một sự kiện 100% (lượt chạy trước đo được đúng hai mẫu 0%) — phải trải tải ra
 * vài giây thì phần trăm giữa đường mới tồn tại để mà đo.
 */
const CHUNK_BYTES = 100_000;
const CHUNK_DELAY_MS = 250;

const payload = makePayload();
const sha512 = crypto.createHash('sha512').update(payload).digest('base64');
const feed = { mode: 'ok' };

function latestYml() {
  return [
    `version: ${NEW_VERSION}`,
    'files:',
    `  - url: ${INSTALLER_NAME}`,
    `    sha512: ${sha512}`,
    `    size: ${payload.length}`,
    `path: ${INSTALLER_NAME}`,
    `sha512: ${sha512}`,
    `releaseDate: '${new Date().toISOString()}'`,
    'releaseNotes: "Ban test noi dung, khong phai phat hanh that."',
    'releaseName: "about gate"'
  ].join('\n');
}

const server = http.createServer((request, response) => {
  const url = String(request.url || '/');
  if (url.startsWith('/latest.yml')) {
    if (feed.mode === '404') { response.writeHead(404, { 'content-type': 'text/plain' }); response.end('gone'); return; }
    response.writeHead(200, { 'content-type': 'text/yaml', 'cache-control': 'no-store' });
    response.end(latestYml());
    return;
  }
  if (url.includes(INSTALLER_NAME)) {
    response.writeHead(200, {
      'content-type': 'application/octet-stream',
      'content-length': String(payload.length),
      'cache-control': 'no-store'
    });
    let offset = 0;
    const pump = () => {
      if (offset >= payload.length) { response.end(); return; }
      const part = payload.subarray(offset, Math.min(offset + CHUNK_BYTES, payload.length));
      offset += CHUNK_BYTES;
      response.write(part);
      setTimeout(pump, CHUNK_DELAY_MS);
    };
    pump();
    return;
  }
  response.writeHead(404, { 'content-type': 'text/plain' });
  response.end('not found');
});

/** Cấp một cổng tạm rồi nhả ngay: gate cần cổng cố định cho cả lượt chạy. */
async function occupyPort() {
  const probe = http.createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  return port;
}

function listenOnce(port) {
  return new Promise((resolve, reject) => {
    const onError = error => { server.removeListener('listening', onListening); reject(error); };
    const onListening = () => { server.removeListener('error', onError); resolve(); };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '127.0.0.1');
  });
}

/** Windows có thể còn giữ cổng một nhịp sau khi close — thử lại vài lần. */
async function startFeed(port) {
  for (let attempt = 0; ; attempt += 1) {
    if (server.listening) return;
    try {
      await listenOnce(port);
      return;
    } catch (error) {
      if (error.code !== 'EADDRINUSE' || attempt >= 20) throw error;
      await wait(300);
    }
  }
}

/** Ngắt listener là cách gate gây ra lỗi mạng thật: mọi request sau đó là refused. */
async function stopFeed() {
  if (!server.listening) return;
  if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
  await new Promise(resolve => server.close(() => resolve()));
}

function writeFeed(url) {
  fs.writeFileSync(DEV_FEED, `provider: generic\nurl: ${url}\nupdaterCacheDirName: ${CACHE_DIR_NAME}\n`, 'utf8');
}

function removeFeed() {
  try { fs.unlinkSync(DEV_FEED); } catch { /* chưa có gì để xoá */ }
}

/**
 * `app.baseCachePath` trên Windows là `%LOCALAPPDATA%` (xem `ElectronAppAdapter`
 * → `getAppCacheDir`), nên thư mục đệm của gate nằm thẳng ở
 * `<LOCALAPPDATA>\<updaterCacheDirName>`. Không quét toàn bộ `%LOCALAPPDATA%`:
 * ở đó có các junction kiểu `Application Data` trỏ lại chính nó, quét là lạc.
 */
function findCacheDir() {
  const bases = [process.env.LOCALAPPDATA, path.join(os.homedir(), 'AppData', 'Local'), os.tmpdir()]
    .filter(Boolean);
  for (const base of bases) {
    const candidate = path.join(base, CACHE_DIR_NAME);
    if (isDirectory(candidate)) return candidate;
  }
  return null;
}

/** electron-updater để bộ cài vừa tải trong `<cacheDir>\pending`, không phải ngay ở gốc. */
function pendingDirOf(cacheDir) {
  const pending = path.join(cacheDir, 'pending');
  return isDirectory(pending) ? pending : null;
}

function isDirectory(candidate) {
  try { return fs.statSync(candidate).isDirectory(); } catch { return false; }
}

// --- đọc trang Giới thiệu ------------------------------------------------

/** DOM đang vẽ + bản trạng thái mới nhất của main, lấy trong cùng một lượt. */
const READ = `(async () => {
  const g = id => document.getElementById(id);
  const hidden = id => !g(id) || g(id).classList.contains('about-hidden');
  const bar = g('aboutProgressFill');
  const state = await window.aboutAPI.getState();
  return {
    badge: g('aboutStatusText') && g('aboutStatusText').textContent.trim(),
    tone: g('aboutStatusBadge') && g('aboutStatusBadge').getAttribute('data-tone'),
    spinning: g('aboutStatusBadge') && g('aboutStatusBadge').classList.contains('about-spin'),
    note: g('aboutStatusNote') && g('aboutStatusNote').textContent.trim(),
    checkDisabled: g('aboutCheckBtn') && g('aboutCheckBtn').disabled,
    checkLabel: g('aboutCheckLabel') && g('aboutCheckLabel').textContent.trim(),
    updateVisible: !hidden('aboutUpdateCard'),
    updateTitle: g('aboutUpdateTitle') && g('aboutUpdateTitle').textContent.trim(),
    updateDiff: g('aboutUpdateDiff') && g('aboutUpdateDiff').textContent.trim(),
    barVisible: !hidden('aboutProgressTrack'),
    width: bar ? bar.style.width : '',
    aria: bar ? bar.getAttribute('aria-valuenow') : '',
    progressText: g('aboutProgressText') && g('aboutProgressText').textContent.trim(),
    downloadDisabled: g('aboutDownloadBtn') && g('aboutDownloadBtn').disabled,
    downloadLabel: g('aboutDownloadBtn') && g('aboutDownloadBtn').textContent.trim(),
    installVisible: !hidden('aboutInstallBtn'),
    installDisabled: g('aboutInstallBtn') && g('aboutInstallBtn').disabled,
    installLabel: g('aboutInstallBtn') && g('aboutInstallBtn').textContent.trim(),
    errorVisible: !hidden('aboutErrorCard'),
    errorTitle: g('aboutErrorTitle') && g('aboutErrorTitle').textContent.trim(),
    errorText: g('aboutErrorText') && g('aboutErrorText').textContent.trim(),
    errorDetail: g('aboutErrorDetail') && g('aboutErrorDetail').textContent.trim(),
    releasesHref: g('aboutErrorReleasesLink') && g('aboutErrorReleasesLink').getAttribute('href'),
    version: g('aboutVersion') && g('aboutVersion').textContent.trim(),
    description: g('aboutDescription') && g('aboutDescription').textContent.trim(),
    packaged: g('factPackaged') && g('factPackaged').textContent.trim(),
    theme: document.documentElement.getAttribute('data-theme'),
    bodyBg: getComputedStyle(document.body).backgroundColor,
    bodyColor: getComputedStyle(document.body).color,
    state
  };
})()`;

const phaseOf = dom => (dom && dom.state && dom.state.phase) || '';

/**
 * Nhấn nút khi lượt kiểm tra trước còn đang chạy thì main bỏ qua click đó
 * (`checkInFlight`) — mà một cú click bị bỏ qua không để lại dấu vết nào trên
 * trạng thái. Nên trước mỗi kịch bản, chờ cho máy trạng thái rời `checking`.
 */
async function settleBeforeClick(page, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const state = await page.evaluate(`(async () => await window.aboutAPI.getState())()`);
    if (state.phase !== 'checking' || Date.now() > deadline) return state;
    await wait(200);
  }
}

/** Chờ trang đạt một trạng thái nào đó, trả về bản đọc cuối cùng trước hạn. */
async function waitFor(page, predicate, label, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await page.evaluate(READ);
    if (predicate(last)) return last;
    await wait(200);
  }
  const error = new Error(`timeout waiting for ${label}; last=${JSON.stringify({ badge: last && last.badge, state: last && last.state })}`);
  error.last = last;
  throw error;
}

function report() {
  const failed = results.filter(entry => !entry.ok);
  console.log(`\nui-about-check: ${results.length - failed.length}/${results.length} passed`);
  for (const failure of failed) console.log('  FAIL ' + failure.name + (failure.detail ? ' — ' + failure.detail : ''));
  process.exit(failed.length ? 1 : 0);
}

(async () => {
  const feedPort = await occupyPort();
  await startFeed(feedPort);
  const baseUrl = `http://127.0.0.1:${feedPort}/`;
  removeFeed();

  const main = await connectTo(/index\.html/);

  // 1. Mục sidebar mở được cửa sổ thứ hai — bằng một cú bấm thật, vì bug #187 chính
  //    là "chuyện gì xảy ra sau khi bấm", chứ không phải "API có tồn tại không".
  const sidebar = await main.evaluate(`(() => {
    const items = [...document.querySelectorAll('[data-action="about-open"]')];
    return {
      count: items.length,
      label: items[0] ? items[0].textContent.trim() : '',
      icon: items[0] && items[0].querySelector('.nav-icon[data-icon="info"]') ? 'info' : 'missing'
    };
  })()`);
  check('sidebar has exactly one Gioi thieu entry', sidebar.count === 1, JSON.stringify(sidebar));
  check('the entry is labelled in Vietnamese', /Giới thiệu/u.test(sidebar.label), sidebar.label);
  check('the entry carries the info icon', sidebar.icon === 'info', sidebar.icon);

  await main.evaluate(`document.querySelector('[data-action="about-open"]').click()`);
  let opened = null;
  for (let attempt = 0; attempt < 60 && !opened; attempt += 1) {
    opened = (await listTargets(PORT)).find(t => /about\.html/.test(t.url));
    if (!opened) await wait(250);
  }
  check('clicking the sidebar opens the About window', Boolean(opened), opened ? 'target found' : 'no about.html target');
  if (!opened) report();

  let about = await connectTo(/about\.html/);

  // 2. An ninh của cửa sổ thứ hai.
  const security = await about.evaluate(`(() => ({
    api: window.aboutAPI ? Object.keys(window.aboutAPI) : null,
    frozen: (() => { try { window.aboutAPI.checkForUpdates = 1; return window.aboutAPI.checkForUpdates !== 1; } catch { return true; } })(),
    require: typeof window.require,
    process: typeof window.process,
    module: typeof window.module,
    eduGame: typeof window.eduGame,
    csp: (document.querySelector('meta[http-equiv="Content-Security-Policy"]') || {}).content || '',
    scripts: [...document.querySelectorAll('script[src]')].map(el => el.getAttribute('src')),
    links: [...document.querySelectorAll('link[href], img[src]')].map(el => el.getAttribute('href') || el.getAttribute('src'))
  }))()`);
  const EXPECTED_API = ['getAppInfo', 'getState', 'checkForUpdates', 'startDownload', 'installAndRestart',
    'openReleases', 'onUpdateState', 'onUpdateAvailable', 'onDownloadProgress', 'onUpdateDownloaded', 'onUpdateError'];
  check('aboutAPI exposes the whole bridge', Array.isArray(security.api)
    && EXPECTED_API.every(name => security.api.includes(name)), JSON.stringify(security.api));
  check('aboutAPI cannot be overwritten from the page', security.frozen === true, String(security.frozen));
  check('no Node in the About renderer (sandbox + contextIsolation)',
    security.require === 'undefined' && security.process === 'undefined' && security.module === 'undefined',
    JSON.stringify({ require: security.require, process: security.process, module: security.module }));
  check('the About window does not get the main window bridge', security.eduGame === 'undefined', String(security.eduGame));
  check('the About page pins its own CSP', /default-src 'self'/u.test(security.csp), security.csp.slice(0, 80));
  check('the About page loads no external script', security.scripts.length === 0, JSON.stringify(security.scripts));
  check('the About page loads only its own assets',
    security.links.every(src => /^(\.\.\/|file:|data:)/u.test(src)), JSON.stringify(security.links));

  // 3. Thông tin ứng dụng.
  const info = await about.evaluate(`(async () => await window.aboutAPI.getAppInfo())()`);
  const ALLOWLIST = ['name', 'version', 'description', 'author', 'license', 'packaged', 'electron', 'chrome',
    'node', 'platform', 'arch', 'userDataPath', 'releasePageUrl'];
  check('about:info carries nothing beyond the allowlist',
    Object.keys(info).every(key => ALLOWLIST.includes(key)), JSON.stringify(Object.keys(info)));
  check('info reports the running version', /^\d+\.\d+\.\d+/u.test(info.version), info.version);
  check('dev build is reported as not packaged', info.packaged === false, String(info.packaged));
  check('release page is the public releases URL',
    info.releasePageUrl === 'https://github.com/vananz123/edu-game-ai/releases', info.releasePageUrl);

  // 4. Mở trang là kiểm tra; bản dev không có feed phải nói thẳng thay vì quay mãi.
  let dom;
  try {
    dom = await waitFor(about, entry => phaseOf(entry) === 'error' && entry.state.errorKind === 'dev-mode', 'the dev-mode answer');
  } catch (error) {
    check('opening the page answers with the dev-mode message', false, error.message);
    dom = error.last || await about.evaluate(READ);
  }
  check('the badge reads "Không kiểm tra được"', dom.badge === 'Không kiểm tra được', dom.badge);
  check('the dev-mode card says this is not an installed build', /bộ cài đặt/u.test(dom.errorText), dom.errorText.slice(0, 80));
  check('the dev-mode card links to the release page', dom.releasesHref === info.releasePageUrl, String(dom.releasesHref));
  check('the page is not stuck on "đang kiểm tra"', dom.spinning === false && dom.checkDisabled === false,
    JSON.stringify({ spinning: dom.spinning, checkDisabled: dom.checkDisabled }));
  check('the static info block is filled', dom.version.startsWith('Phiên bản ') && dom.packaged.length > 10,
    JSON.stringify({ version: dom.version, packaged: dom.packaged }));
  check('no mojibake reaches the About page', !/[ÂÃ][»¡º£¥]/u.test(`${dom.description} ${dom.badge} ${dom.note}`), dom.description);
  const leaked = /GEMINI|service_role|Bearer |eyJ[A-Za-z0-9_-]{8}/u.test(JSON.stringify(dom));
  check('no secret-shaped text on the page', !leaked, leaked ? 'found a token-shaped string' : '');

  // 5. Chữ và màu: trang này không nạp app.css nên không gate nào khác đo nó.
  const reading = await about.evaluate(`(() => {
    const sizes = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = (node.textContent || '').trim();
      if (!text) continue;
      const el = node.parentElement;
      if (!el || el.closest('style, script')) continue;
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      sizes.push({ px: parseFloat(getComputedStyle(el).fontSize), tag: el.tagName + '#' + (el.id || el.className) });
    }
    const channels = value => (String(value).match(/\\d+(?:\\.\\d+)?/g) || []).slice(0, 3).map(Number);
    const luminance = ([r, g, b]) => {
      const f = v => (v <= 0.03928 ? v / 255 / 12.92 : Math.pow((v / 255 + 0.055) / 1.055, 2.4));
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const ratio = (fg, bg) => {
      const a = luminance(channels(fg)), b = luminance(channels(bg));
      const hi = Math.max(a, b), lo = Math.min(a, b);
      return Number(((hi + 0.05) / (lo + 0.05)).toFixed(2));
    };
    const badge = document.getElementById('aboutStatusBadge');
    const restore = { tone: badge.getAttribute('data-tone'), html: badge.innerHTML };
    const toneRatios = {};
    for (const tone of ['idle', 'checking', 'ok', 'new', 'error']) {
      badge.setAttribute('data-tone', tone);
      badge.innerHTML = '<span id="aboutStatusText">mẫu đo</span>';
      const cs = getComputedStyle(badge);
      toneRatios[tone] = ratio(cs.color, cs.backgroundColor);
    }
    badge.setAttribute('data-tone', restore.tone);
    badge.innerHTML = restore.html;
    const body = getComputedStyle(document.body);
    const muted = getComputedStyle(document.querySelector('.about-note')).color;
    return {
      min: sizes.length ? Number(Math.min(...sizes.map(entry => entry.px)).toFixed(1)) : 0,
      smallest: sizes.sort((a, b) => a.px - b.px)[0] || null,
      bodyRatio: ratio(body.color, body.backgroundColor),
      mutedRatio: ratio(muted, body.backgroundColor),
      toneRatios
    };
  })()`);
  check('smallest painted text is at least 13px', reading.min >= 13,
    `${reading.min}px${reading.smallest ? ` (${reading.smallest.tag})` : ''}`);
  check('body text contrast >= 4.5', reading.bodyRatio >= 4.5, String(reading.bodyRatio));
  check('muted text contrast >= 4.5', reading.mutedRatio >= 4.5, String(reading.mutedRatio));
  for (const [tone, ratio] of Object.entries(reading.toneRatios)) {
    check(`badge tone "${tone}" contrast >= 4.5`, ratio >= 4.5, String(ratio));
  }
  const stillPainted = await about.evaluate(`document.getElementById('aboutStatusText').textContent.trim()`);
  check('measuring tones did not damage the badge', stillPainted === dom.badge, stillPainted);

  // 6. Chủ đề tối đi theo ứng dụng, kể cả khi cửa sổ đã mở sẵn.
  await main.evaluate(`window.eduGame.openAbout('dark')`);
  await wait(1500);
  about = await connectTo(/about\.html/);
  const dark = await about.evaluate(READ);
  check('an already-open window follows the dark theme', dark.theme === 'dark', String(dark.theme));
  check('the dark theme really repaints the page', dark.bodyBg !== 'rgb(245, 247, 251)', `${dark.bodyBg} / ${dark.bodyColor}`);
  const darkReading = await about.evaluate(`(() => {
    const channels = value => (String(value).match(/\\d+(?:\\.\\d+)?/g) || []).slice(0, 3).map(Number);
    const luminance = ([r, g, b]) => {
      const f = v => (v <= 0.03928 ? v / 255 / 12.92 : Math.pow((v / 255 + 0.055) / 1.055, 2.4));
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const cs = getComputedStyle(document.body);
    const muted = getComputedStyle(document.querySelector('.about-note')).color;
    const a = luminance(channels(cs.color)), b = luminance(channels(cs.backgroundColor));
    const m = luminance(channels(muted));
    const ratio = (x, y) => Number(((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)).toFixed(2));
    return { body: ratio(a, b), muted: ratio(m, b) };
  })()`);
  check('dark body text contrast >= 4.5', darkReading.body >= 4.5, String(darkReading.body));
  check('dark muted text contrast >= 4.5', darkReading.muted >= 4.5, String(darkReading.muted));
  const windowCount = (await listTargets(PORT)).filter(t => /about\.html/.test(t.url)).length;
  check('re-opening focuses the existing window instead of stacking', windowCount === 1, String(windowCount));
  await main.evaluate(`window.eduGame.openAbout('light')`);
  await wait(1500);
  about = await connectTo(/about\.html/);

  // 7. Hai nhánh lỗi đo trước, khi chưa có bộ cài nào trên đĩa. URL giữ nguyên,
  //    chỉ server đổi: tắt listener -> `offline`, trả 404 -> `feed`.
  const errorScenarios = [
    { name: 'offline', serve: false, mode: 'ok', hint: /internet/u },
    { name: 'feed', serve: true, mode: '404', hint: /chưa tìm thấy|phát hành/u }
  ];
  writeFeed(baseUrl);
  for (const scenario of errorScenarios) {
    feed.mode = scenario.mode;
    if (scenario.serve) await startFeed(feedPort); else await stopFeed();
    await settleBeforeClick(about);
    await about.evaluate(`document.getElementById('aboutCheckBtn').click()`);
    let answer;
    try {
      answer = await waitFor(about,
        entry => entry.state.errorKind === scenario.name, `${scenario.name} classification`, 40000);
    } catch (error) {
      check(`${scenario.name}: main classifies the failure`, false, error.message);
      continue;
    }
    check(`${scenario.name}: main classifies the failure`, answer.state.errorKind === scenario.name,
      JSON.stringify({ kind: answer.state.errorKind, message: String(answer.state.errorMessage).slice(0, 70) }));
    check(`${scenario.name}: the card shows a Vietnamese sentence`,
      answer.errorVisible && scenario.hint.test(answer.errorText), answer.errorText.slice(0, 70));
    check(`${scenario.name}: retry stays usable`, answer.checkDisabled === false, String(answer.checkDisabled));
    check(`${scenario.name}: the bar never lies`, answer.state.progressPercent === 0 && answer.barVisible === false,
      JSON.stringify({ percent: answer.state.progressPercent, barVisible: answer.barVisible }));
  }

  // 8. Có nguồn -> bản mới, và KHÔNG tự tải.
  feed.mode = 'ok';
  await startFeed(feedPort);
  await settleBeforeClick(about);
  await about.evaluate(`document.getElementById('aboutCheckBtn').click()`);
  let available;
  try {
    available = await waitFor(about, entry => phaseOf(entry) === 'available', 'update-available', 45000);
  } catch (error) {
    check('the mock feed produces update-available', false, error.message);
    removeFeed();
    await stopFeed().catch(() => { });
    report();
  }
  check('the feed version is announced as new', available.badge === `Có bản mới ${NEW_VERSION}`, available.badge);
  check('the update card opens', available.updateVisible && available.updateTitle === 'Có bản cập nhật mới', available.updateTitle);
  check('the card names both versions',
    available.updateDiff.includes(NEW_VERSION) && available.updateDiff.includes(available.state.currentVersion), available.updateDiff);
  check('the download button waits for the teacher', available.downloadDisabled === false && available.barVisible === false,
    JSON.stringify({ downloadDisabled: available.downloadDisabled, barVisible: available.barVisible }));
  await wait(2500);
  const untouched = await about.evaluate(READ);
  check('autoDownload=false really downloads nothing on its own',
    untouched.barVisible === false && untouched.state.progressPercent === 0 && untouched.state.phase === 'available',
    JSON.stringify({ phase: untouched.state.phase, percent: untouched.state.progressPercent }));

  // 9. Bấm tải: tiến trình thật, phần trăm tăng một chiều, rồi sẵn sàng cài.
  const samples = [];
  await about.evaluate(`document.getElementById('aboutDownloadBtn').click()`);
  let downloaded = null;
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    const sample = await about.evaluate(READ);
    samples.push(sample);
    if (phaseOf(sample) === 'downloaded') { downloaded = sample; break; }
    if (phaseOf(sample) === 'error') break;
    await wait(150);
  }
  const percents = samples.filter(sample => sample.state.phase === 'downloading').map(sample => sample.state.progressPercent);
  check('download finished with update-downloaded', Boolean(downloaded),
    downloaded ? '' : `last state ${JSON.stringify(samples.length ? samples[samples.length - 1].state : null)}`);
  check('progress was published while downloading', percents.length >= 2, `${percents.length} mẫu: ${percents.slice(0, 8).join(',')}`);
  const forward = percents.every((value, index) => index === 0 || value >= percents[index - 1]);
  const grew = percents.some((value, index) => index > 0 && value > percents[index - 1]);
  check('the percentage never runs backwards', forward, percents.slice(0, 10).join(','));
  check('the bar really moved', grew, percents.slice(0, 10).join(','));
  const mid = samples.find(sample => sample.state.phase === 'downloading' && sample.state.progressPercent > 0 && sample.state.progressPercent < 100);
  if (mid) {
    check('the bar and its number agree',
      mid.width === `${mid.state.progressPercent}%` && mid.aria === String(mid.state.progressPercent),
      JSON.stringify({ width: mid.width, aria: mid.aria, percent: mid.state.progressPercent }));
    check('the progress line shows bytes and an estimate',
      /MB|KB/u.test(mid.progressText) && /%/.test(mid.progressText), mid.progressText);
    check('the check button is locked while bytes move', mid.checkDisabled === true, String(mid.checkDisabled));
    check('the download button reads "Đang tải…"', /Đang tải/u.test(mid.downloadLabel), mid.downloadLabel);
    check('the badge names the version being downloaded', mid.badge === `Đang tải ${NEW_VERSION}…`, mid.badge);
  } else {
    check('the bar and its number agree', false, 'no mid-flight sample to measure');
    check('the progress line shows bytes and an estimate', false, 'no mid-flight sample');
    check('the check button is locked while bytes move', false, 'no mid-flight sample');
    check('the download button reads "Đang tải…"', false, 'no mid-flight sample');
    check('the badge names the version being downloaded', false, 'no mid-flight sample');
  }
  if (downloaded) {
    check('the badge announces the ready update', downloaded.badge === `Cập nhật ${NEW_VERSION} sẵn sàng!`, downloaded.badge);
    check('the card title switches to "sẵn sàng"', downloaded.updateTitle === 'Cập nhật sẵn sàng!', downloaded.updateTitle);
    check('the bar ends at 100%', downloaded.width === '100%' && downloaded.aria === '100',
      JSON.stringify({ width: downloaded.width, aria: downloaded.aria }));
    check('the install button appears and is enabled',
      downloaded.installVisible === true && downloaded.installDisabled === false,
      JSON.stringify({ visible: downloaded.installVisible, disabled: downloaded.installDisabled, label: downloaded.installLabel }));
    check('the install button invites a restart, not a download', /Khởi động lại để cài/u.test(downloaded.installLabel), downloaded.installLabel);
    check('re-downloading is off once the file is on disk', downloaded.downloadDisabled === true, String(downloaded.downloadDisabled));
    check('the note says the installer is on this machine', /đã nằm trên máy/u.test(downloaded.note), downloaded.note);
    const cacheDir = findCacheDir();
    const pending = cacheDir ? pendingDirOf(cacheDir) : null;
    const installer = pending ? fs.readdirSync(pending).find(name => name.includes('EduGameStudio')) : null;
    const installerBytes = installer ? fs.statSync(path.join(pending, installer)).size : 0;
    check('the installer really landed on disk',
      Boolean(installer) && installerBytes === payload.length,
      JSON.stringify({ cacheDir, installer, installerBytes, expected: payload.length }));
  }

  // 10. Luật 6 đo tận nơi: lỗi của lần kiểm tra sau không lấy đi quyền cài.
  await stopFeed();
  await settleBeforeClick(about);
  await about.evaluate(`document.getElementById('aboutCheckBtn').click()`);
  await wait(6000);
  const afterLateError = await about.evaluate(READ);
  check('a failed later check cannot revoke the ready installer',
    phaseOf(afterLateError) === 'downloaded' && afterLateError.installDisabled === false,
    JSON.stringify({ phase: afterLateError.state.phase, installDisabled: afterLateError.installDisabled }));
  check('and the page shows no error card for it', afterLateError.errorVisible === false, afterLateError.errorTitle);

  // Dọn dẹp: đóng cửa sổ, bỏ feed, xoá bộ nhớ đệm của gate, tắt server.
  removeFeed();
  await about.evaluate(`window.close()`).catch(() => { });
  await wait(1000);
  const remaining = (await listTargets(PORT)).filter(t => /about\.html/.test(t.url)).length;
  check('the About window closes cleanly', remaining === 0, String(remaining));
  const cacheDir = findCacheDir();
  if (cacheDir) { try { fs.rmSync(cacheDir, { recursive: true, force: true }); } catch { } }
  await stopFeed();
  report();
})().catch(error => {
  removeFeed();
  try { server.close(); } catch { }
  console.error('ui-about-check crashed: ' + ((error && error.stack) || error));
  process.exit(1);
});
