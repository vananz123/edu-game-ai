// ui-about-check.js — tab "Giới thiệu" TRONG trang Cài đặt + bộ cập nhật tự động
// (#188, #204 dời vào cửa sổ chính) chạy trên Electron THẬT, với một nguồn cập nhật
// giả trên vòng lặp trong nước.
//
// Vì sao phải đo thật: hai suite unit (`update-policy`, `about-page`) chứng minh máy
// trạng thái và panel vẽ đúng, nhưng không chứng minh được năm thứ chỉ có ở ứng dụng
// đang chạy: (1) đường Cài đặt -> tab thứ sáu đưa giáo viên đến ĐÚNG TAB của ĐÚNG cửa sổ
// đang mở — #204 xoá `about.html`, `about-preload.js`, `about-manager.ts` (không còn cửa sổ
// thứ hai), #205 xoá luôn mục "Giới thiệu" ở sidebar vì nó là đường thứ hai tới cùng một chỗ;
// (2) `electron-updater` đọc `dev-app-update.yml` và bắn
// `update-available` → `download-progress` → `update-downloaded`, đúng chuỗi kiện mà máy
// trạng thái được thiết kế quanh nó; (3) `autoDownload = false` không tải byte nào trước
// khi giáo viên bấm; (4) một lần mở tab chỉ hỏi feed MỘT lần — luật mới của #204, đo bằng
// số request thực nhận chứ không bằng lời gọi IPC; (5) panel chỉ vẽ những gì main đã
// quyết, nên trạng thái IPC và trạng thái panel đang giữ phải khớp nhau sau mỗi push.
//
// Cơ chế: ghi `dev-app-update.yml` (đã .gitignore) với `provider: generic` trỏ về một
// HTTP server nội bộ phục vụ `latest.yml` phiên bản 9.9.9 + bộ cài giả 3,2 MB (sha512
// thật, ghi chậm theo phần để tiến trình kịp bắn nhiều lần). Bản dev có file đó thì
// `forceDevUpdateConfig` bật lên, nên đi hết chu trình mà không phải phát hành thật.
//
// Bẫy đã học ở lượt chạy trước: `AppUpdater` cache `configOnDisk` và `clientPromise`
// trong cả đời process, nên đổi URL trong `dev-app-update.yml` giữa chừng là đổi không —
// mọi lần kiểm tra sau vẫn dùng URL đầu tiên. Vì vậy gate giữ MỘT URL cố định và đổi
// hành vi PHÍA SERVER: tắt listener là nhánh `offline` (ERR_CONNECTION_REFUSED), trả 404
// là nhánh `feed`, trả `latest.yml` là nhánh thành công. Riêng nhánh `dev-mode` thì xoá
// chính sự tồn tại của file: `isUpdaterActive()` đọc cờ đó ở MỖI lần kiểm tra, không cache,
// nên cất file đi giữa lượt chạy vẫn ra `dev-mode` đúng như lúc mới bật app.
//
// Instance phải mới: khoá "một lần mỗi phiên" nằm trong module renderer, nên chạy gate
// hai lần trên cùng một process thì lần sau không còn cú Kick nào để đo và các con số
// request sẽ đỏ. Bật lại app với hồ sơ sạch trước khi nghi ngờ mã.
//
// KHÔNG bấm "Khởi động lại để cài": `quitAndInstall` spawn bộ cài và đóng ứng dụng.
// Chu trình đo tới mức "nút sáng, panel sáng, main nhận yêu cầu"; việc wizard chạy thật
// chỉ kiểm chứng được bằng bộ cài thật (nêu rõ khi bàn giao).
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
const RELEASE_PAGE = 'https://github.com/vananz123/edu-game-ai/releases';

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
/**
 * Bộ đếm đặt ở phía nhận. "Mở tab chỉ hỏi feed một lần" là luật của #204 mà một lời gọi
 * IPC không chứng minh được (main có thể gộp request, renderer có thể gọi hai lần mà màn
 * hình không hiện gì), nên đếm ngay tại server: `latest` là số lượt `latest.yml` được hỏi,
 * `installer` là số lần bộ cài được xin, `bytes` là số byte đã phát ra.
 */
const feed = { mode: 'ok', counts: { latest: 0, installer: 0, bytes: 0 } };

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
    feed.counts.latest += 1;
    if (feed.mode === '404') { response.writeHead(404, { 'content-type': 'text/plain' }); response.end('gone'); return; }
    response.writeHead(200, { 'content-type': 'text/yaml', 'cache-control': 'no-store' });
    response.end(latestYml());
    return;
  }
  if (url.includes(INSTALLER_NAME)) {
    feed.counts.installer += 1;
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
      feed.counts.bytes += part.length;
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

// --- đọc tab Giới thiệu ---------------------------------------------------

/**
 * DOM đang vẽ + trạng thái của main + trạng thái panel đang giữ, lấy trong cùng một
 * lượt. Hai bản trạng thái phải khớp nhau: panel chỉ vẽ điều main đã quyết, nên `state`
 * (IPC) lệch `view.state` nghĩa là một `about:state-push` đã rơi.
 *
 * Trong phạm vi biểu thức này không được đặt tên biến là `state`: đó là binding lexical
 * toàn cục của renderer (const ở đầu shared.js), nên nó là `state` chứ KHÔNG phải
 * `window.state`, và ghi đè nó thì cả ứng dụng hỏng ngay giữa lượt đo.
 */
const READ = `(async () => {
  const g = id => document.getElementById(id);
  const shown = el => Boolean(el) && !el.classList.contains('hidden') && el.getClientRects().length > 0;
  const app = state;
  const bar = g('aboutProgressFill');
  const update = await window.eduGame.aboutState();
  const view = window.aboutPanelSnapshot();
  const chipSlot = document.querySelector('[data-about-tab-chip]');
  return {
    page: app.page,
    section: app.settingsSection,
    panelOpen: shown(g('settingsPanel-about')),
    tabSelected: g('settingsTabBtn-about') ? g('settingsTabBtn-about').getAttribute('aria-selected') : '',
    chip: chipSlot ? chipSlot.textContent.replace(/\\s+/g, ' ').trim() : '',
    badge: g('aboutStatusText') && g('aboutStatusText').textContent.trim(),
    tone: g('aboutStatusBadge') && g('aboutStatusBadge').getAttribute('data-tone'),
    spinning: shown(g('aboutStatusSpinner')),
    note: g('aboutStatusNote') && g('aboutStatusNote').textContent.trim(),
    checkDisabled: g('aboutCheckBtn') && g('aboutCheckBtn').disabled,
    checkLabel: g('aboutCheckLabel') && g('aboutCheckLabel').textContent.trim(),
    updateVisible: shown(g('aboutUpdateCard')),
    updateTitle: g('aboutUpdateTitle') && g('aboutUpdateTitle').textContent.trim(),
    updateDiff: g('aboutUpdateDiff') && g('aboutUpdateDiff').textContent.trim(),
    barVisible: shown(g('aboutProgressTrack')),
    width: bar ? bar.style.width : '',
    aria: bar ? bar.getAttribute('aria-valuenow') : '',
    progressText: g('aboutProgressText') && g('aboutProgressText').textContent.trim(),
    downloadDisabled: g('aboutDownloadBtn') && g('aboutDownloadBtn').disabled,
    downloadLabel: g('aboutDownloadBtn') && g('aboutDownloadBtn').textContent.trim(),
    installVisible: shown(g('aboutInstallBtn')),
    installDisabled: g('aboutInstallBtn') && g('aboutInstallBtn').disabled,
    installLabel: g('aboutInstallBtn') && g('aboutInstallBtn').textContent.trim(),
    errorVisible: shown(g('aboutErrorCard')),
    errorTitle: g('aboutErrorTitle') && g('aboutErrorTitle').textContent.trim(),
    errorText: g('aboutErrorText') && g('aboutErrorText').textContent.trim(),
    errorDetail: g('aboutErrorDetail') && g('aboutErrorDetail').textContent.trim(),
    releasesHref: g('aboutErrorReleasesLink') && g('aboutErrorReleasesLink').getAttribute('href'),
    version: g('aboutVersion') && g('aboutVersion').textContent.trim(),
    description: g('aboutDescription') && g('aboutDescription').textContent.trim(),
    packaged: g('factPackaged') && g('factPackaged').textContent.trim(),
    foot: g('aboutFoot') && g('aboutFoot').textContent.replace(/\\s+/g, ' ').trim(),
    state: update,
    view
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
    const update = await page.evaluate(`(async () => await window.eduGame.aboutState())()`);
    if (update.phase !== 'checking' || Date.now() > deadline) return update;
    await wait(200);
  }
}

/** Chờ panel đạt một trạng thái nào đó, trả về bản đọc cuối cùng trước hạn. */
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

/** Bấm thật một mục của trang Cài đặt — không đi tắt bằng `render()`. */
async function clickSettingsTab(page, sectionId) {
  await page.evaluate(`(() => {
    const tab = document.querySelector('[data-settings-section="${sectionId}"]');
    if (tab) tab.click();
  })()`);
  await wait(250);
}

/** Bấm thật nút "Kiểm tra cập nhật" của panel. */
async function clickCheck(page) {
  await page.evaluate(`document.getElementById('aboutCheckBtn').click()`);
}

/**
 * Đếm từng run chữ của panel: cỡ thật và tương phản thật, nền lấy từ cả chuỗi tổ tiên
 * (nền thẻ Cài đặt != nền badge). Canvas 1x1 là bắt buộc: Chromium tuần tự hoá màu hiện
 * đại thành `oklab(...)`, regex không đọc lại được (#160, #181).
 */
const MEASURE = `(() => {
  const root = document.getElementById('settingsPanel-about');
  if (!root) return { runs: [], tones: {}, missing: true };
  const swatch = document.createElement('canvas');
  swatch.width = swatch.height = 1;
  const ctx = swatch.getContext('2d', { willReadFrequently: true });
  const pixelOf = value => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
  };
  const lum = c => {
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => Math.round(((Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05)) * 100) / 100;
  const backOf = el => {
    for (let node = el; node; node = node.parentElement) {
      const c = pixelOf(getComputedStyle(node).backgroundColor);
      if (c.a > 0.95) return c;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };
  const runs = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = (node.textContent || '').trim();
    if (!text || !/[\\p{L}\\p{N}]/u.test(text)) continue;
    const el = node.parentElement;
    if (!el || el.closest('style, script') || !el.getClientRects().length) continue;
    const cs = getComputedStyle(el);
    runs.push({
      px: Math.round(parseFloat(cs.fontSize) * 10) / 10,
      contrast: ratio(pixelOf(cs.color), backOf(el)),
      button: Boolean(el.closest('.btn')),
      // Trường text bị cắt còn 28 ký tự để in ra không tràn dòng, nên nó KHÔNG dùng để
      // nhận diện thẻ nào đang nói — câu dev-mode dài hơn 28 ký tự trước cụm cần tìm.
      // err lấy theo cây DOM, chính xác hơn một regex trên đoạn chữ cụt.
      err: Boolean(el.closest('#aboutErrorCard')),
      text: text.slice(0, 28),
      tag: el.tagName + '.' + (typeof el.className === 'string' ? el.className : '').slice(0, 44)
    });
  }
  const badge = document.getElementById('aboutStatusBadge');
  const tones = {};
  for (const tone of ['idle', 'checking', 'ok', 'new', 'error']) {
    window.aboutBadgeTone(badge, tone);
    const cs = getComputedStyle(badge);
    tones[tone] = ratio(pixelOf(cs.color), pixelOf(cs.backgroundColor));
  }
  window.paintAboutPanel();
  return { runs, tones, theme: document.documentElement.getAttribute('data-theme') };
})()`;

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

  // 0. Hồ sơ mới mở trang setup vào `#modalRoot` một nhịp sau khi cửa sổ nạp; nó sẽ che
  //    mất trang Cài đặt mà gate này điều khiển. Cùng cảnh báo các gate Settings đã gặp.
  const guard = await main.evaluate(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 40 && !document.querySelector('#modalRoot .setup-fullscreen'); i += 1) await sleep(100);
    if (typeof closeSetupWizard === 'function') closeSetupWizard('close');
    await sleep(250);
    return { wizard: Boolean(document.querySelector('#modalRoot .setup-fullscreen')) };
  })()`);
  check('the first-run wizard is out of the way', guard.wizard === false, JSON.stringify(guard));

  // 1. Cửa sổ thứ hai đã chết thật: không file trong src, không asset trong dist,
  //    không `window.aboutAPI` trong cửa sổ đang mở.
  const retired = {
    source: ['src/about/about.html', 'src/about/about-preload.js', 'src/about/about-manager.ts']
      .filter(rel => fs.existsSync(path.join(REPO, rel))),
    built: ['dist/src/about/about.html', 'dist/src/about/about-preload.js']
      .filter(rel => fs.existsSync(path.join(REPO, rel)))
  };
  check('the standalone About files are deleted from src', retired.source.length === 0, retired.source.join(', '));
  check('the build emits no About window assets', retired.built.length === 0, retired.built.join(', '));

  const bridge = await main.evaluate(`(() => {
    const api = window.eduGame || {};
    return {
      aboutAPI: typeof window.aboutAPI,
      names: ['openAbout', 'aboutInfo', 'aboutState', 'aboutCheck', 'aboutDownload', 'aboutInstall',
        'aboutOpenReleases', 'onAboutState'].filter(name => typeof api[name] === 'function'),
      panel: typeof window.aboutPanelHtml,
      snapshot: typeof window.aboutPanelSnapshot
    };
  })()`);
  check('the About bridge now lives on window.eduGame', bridge.names.length === 8, JSON.stringify(bridge.names));
  check('the retired second-window preload is not loaded anywhere',
    bridge.aboutAPI === 'undefined', String(bridge.aboutAPI));
  check('the panel module is reachable as a renderer global',
    bridge.panel === 'function' && bridge.snapshot === 'function',
    JSON.stringify({ panel: bridge.panel, snapshot: bridge.snapshot }));

  // 2. Trước khi tab hiện ra thì chưa được hỏi feed — "vào lớp phải offline" đo tại
  //    phía nhận, không suy từ log.
  const before = await main.evaluate(READ);
  check('nothing has asked the loopback feed before the tab opens', feed.counts.latest === 0,
    JSON.stringify(feed.counts));
  check('the updater is idle until the tab is opened', before.state.phase === 'idle',
    JSON.stringify({ phase: before.state.phase, kicked: before.view.kicked, section: before.section }));

  // 3. Tab hiện ra bằng những cú bấm THẬT, trong CÙNG cửa sổ: bug #187 là "chuyện gì xảy
  //    ra sau khi bấm", #204 là "sau khi bấm thì cửa sổ nào hiện ra". #205 bỏ mục
  //    "Giới thiệu" khỏi sidebar, nên đường đi thật của giáo viên là Cài đặt -> tab, và
  //    cổng phải đi đúng đường đó thay vì bấm một nút không còn tồn tại.
  writeFeed(baseUrl);
  const targetsBefore = (await listTargets(PORT)).length;
  await main.evaluate(`document.querySelector('[data-page="settings"]').click()`);
  await wait(400);
  await clickSettingsTab(main, 'about');
  await wait(400);
  const targetsAfter = (await listTargets(PORT)).length;
  const chrome = await main.evaluate(`(() => {
    const ghosts = [...document.querySelectorAll('[data-action="about-open"]')];
    const nav = [...document.querySelectorAll('.sidebar .nav-item')];
    const tab = document.querySelector('[data-settings-section="about"]');
    const hook = tab ? tab.querySelector('[data-icon="info"]') : null;
    return {
      ghosts: ghosts.length,
      navLabels: nav.map(node => node.textContent.replace(/\\s+/g, ' ').trim()),
      tabLabel: tab ? tab.textContent.replace(/\\s+/g, ' ').trim() : '',
      icon: hook && hook.querySelector('svg.lucide') ? 'info' : 'missing'
    };
  })()`);
  const opened = await main.evaluate(READ);
  check('#205: the sidebar no longer carries a second route to Giới thiệu',
    chrome.ghosts === 0 && chrome.navLabels.every(label => !/Giới thiệu/u.test(label))
    && chrome.navLabels.some(label => /Cài đặt/u.test(label)),
    JSON.stringify({ ghosts: chrome.ghosts, navLabels: chrome.navLabels }));
  check('the tab strip is that one route: Vietnamese label, painted info icon',
    /Giới thiệu/u.test(chrome.tabLabel) && chrome.icon === 'info', JSON.stringify(chrome));
  check('Cài đặt rồi bấm tab lands on the open about panel',
    opened.page === 'settings' && opened.section === 'about' && opened.panelOpen === true && opened.tabSelected === 'true',
    JSON.stringify({ page: opened.page, section: opened.section, panelOpen: opened.panelOpen, tabSelected: opened.tabSelected }));
  check('and it opens no second window',
    targetsAfter === targetsBefore && (await listTargets(PORT)).filter(t => /about\.html/.test(t.url)).length === 0,
    JSON.stringify({ targetsBefore, targetsAfter }));
  check('the about tab is the sixth tab and its icon is painted',
    await main.evaluate(`[...document.querySelectorAll('[data-settings-section]')].map(node => node.dataset.settingsSection).join(',')`)
      === 'ai,teaching,interface,tasks,diagnostics,about'
    && await main.evaluate(`(() => {
      const hook = document.querySelector('[data-settings-section="about"] [data-icon="info"]');
      return Boolean(hook) && Boolean(hook.querySelector('svg.lucide'));
    })()`) === true,
    await main.evaluate(`[...document.querySelectorAll('[data-settings-section]')].map(node => node.dataset.settingsSection).join(',')`));
  check('the panel heading is Vietnamese and never prints a raw icon id',
    await main.evaluate(`(() => {
      const h3 = document.querySelector('#settingsPanel-about h3');
      const text = h3 ? h3.textContent.replace(/\\s+/g, ' ').trim() : '';
      return /Giới thiệu và cập nhật/u.test(text) && !/\\b(info|bot|palette|settings|list-checks|stethoscope|monitor|cloud)\\b/.test(text);
    })()`) === true,
    await main.evaluate(`(document.querySelector('#settingsPanel-about h3') || {}).textContent || ''`));

  // 4. Mở tab là kiểm tra, và CHỈ một lần.
  let afterKick;
  try {
    afterKick = await waitFor(main, entry => phaseOf(entry) === 'available', 'the kick to reach the feed', 45000);
  } catch (error) {
    check('opening the tab asks the feed once and answers', false, error.message);
    afterKick = error.last || await main.evaluate(READ);
  }
  check('the first tab open produced exactly one feed request', feed.counts.latest === 1,
    JSON.stringify({ latest: feed.counts.latest, note: 'instance phải mới — xem đầu tệp' }));
  check('the kick lands on the mock version', afterKick.badge === `Có bản mới ${NEW_VERSION}`, afterKick.badge);
  check('the kick is recorded in the panel, not only in main',
    afterKick.view.kicked === true && afterKick.state.phase === afterKick.view.state.phase,
    JSON.stringify({ kicked: afterKick.view.kicked, ipc: afterKick.state.phase, panel: afterKick.view.state.phase }));

  await clickSettingsTab(main, 'ai');
  await clickSettingsTab(main, 'about');
  await clickSettingsTab(main, 'interface');
  await clickSettingsTab(main, 'about');
  await wait(1200);
  const afterReopen = await main.evaluate(READ);
  check('reopening the tab four more times asks the feed zero extra times',
    feed.counts.latest === 1 && afterReopen.view.kicked === true,
    JSON.stringify({ latest: feed.counts.latest, kicked: afterReopen.view.kicked }));
  check('a hidden-then-reopened panel repaints the live state, not a stale one',
    afterReopen.panelOpen === true && afterReopen.state.phase === afterReopen.view.state.phase,
    JSON.stringify({ ipc: afterReopen.state.phase, panel: afterReopen.view.state.phase }));

  const beforeManual = feed.counts.latest;
  await settleBeforeClick(main);
  await clickCheck(main);
  await wait(3000);
  const manual = await main.evaluate(READ);
  check('the button still re-checks on demand — the once-per-session lock is only for the kick',
    feed.counts.latest === beforeManual + 1 && phaseOf(manual) === 'available',
    JSON.stringify({ before: beforeManual, after: feed.counts.latest, phase: manual.state.phase }));

  // 5. Thông tin ứng dụng qua `about:info` — cùng hộ chiếu dữ liệu như cửa sổ cũ.
  const info = await main.evaluate(`(async () => await window.eduGame.aboutInfo())()`);
  const ALLOWLIST = ['name', 'version', 'description', 'author', 'license', 'packaged', 'electron', 'chrome',
    'node', 'platform', 'arch', 'userDataPath', 'releasePageUrl'];
  check('about:info carries nothing beyond the allowlist',
    Object.keys(info).every(key => ALLOWLIST.includes(key)), JSON.stringify(Object.keys(info)));
  check('info reports the running version', /^\d+\.\d+\.\d+/u.test(info.version), info.version);
  check('a source build reports itself as source, not as an installer',
    info.packaged === false && /Mã nguồn đang phát triển/u.test(manual.packaged),
    JSON.stringify({ packaged: info.packaged, shown: manual.packaged }));
  check('release page is the public releases URL', info.releasePageUrl === RELEASE_PAGE, info.releasePageUrl);
  check('the static info block is filled', manual.version.startsWith('Phiên bản '), manual.version);
  check('the fine print still promises the two things teachers worry about',
    /chỉ tải về khi bạn bấm nút/u.test(manual.foot) && /offline/u.test(manual.foot), manual.foot.slice(0, 120));
  check('no mojibake reaches the panel', !/[ÂÃ][»¡º£¥]/u.test(`${manual.description} ${manual.badge} ${manual.note}`), manual.description);
  const leaked = /GEMINI|service_role|Bearer |eyJ[A-Za-z0-9_-]{8}/u.test(JSON.stringify(manual));
  check('no secret-shaped text on the page', !leaked, leaked ? 'found a token-shaped string' : '');

  // 6. Chữ và màu. Panel nằm trong thẻ Cài đặt nên không còn bảng màu riêng — nhưng năm
  //    sắc độ badge chỉ hiện ra theo từng pha của một bộ cập nhật thật, mà cổng
  //    typography (#181) không đi tới được. Quét qua `window.aboutBadgeTone` để không
  //    phải chép bảng màu vào gate (chép tay là cách một màu lệch AA lọt qua).
  const savedTheme = await main.evaluate(`((state.settings || {}).preferences || {}).theme || 'light'`);
  const light = await main.evaluate(MEASURE);
  const lightText = light.runs.filter(run => !run.button);
  check('the panel paints a real crowd of text runs', light.runs.length >= 20, `${light.runs.length} runs`);
  check('light: read text is at least 13px', lightText.length > 0 && Math.min(...lightText.map(run => run.px)) >= 13,
    JSON.stringify(lightText.slice().sort((a, b) => a.px - b.px)[0] || null));
  check('light: shared .btn labels keep the app-wide 12px floor',
    light.runs.filter(run => run.button).every(run => run.px >= 12),
    JSON.stringify(light.runs.filter(run => run.button).map(run => run.px)));
  check('light: every run in the panel reaches 4.5:1',
    light.runs.every(run => run.contrast >= 4.5),
    JSON.stringify(light.runs.filter(run => run.contrast < 4.5).slice(0, 4)));
  for (const [tone, ratio] of Object.entries(light.tones)) {
    check(`light: badge tone "${tone}" contrast >= 4.5`, ratio >= 4.5, String(ratio));
  }
  const badgeAfterSweep = await main.evaluate(`document.getElementById('aboutStatusText').textContent.trim()`);
  check('measuring tones did not damage the badge', badgeAfterSweep === manual.badge, badgeAfterSweep);

  await main.evaluate(`applyTheme('dark')`);
  await wait(400);
  const dark = await main.evaluate(MEASURE);
  check('the panel follows the app theme', dark.theme === 'dark', String(dark.theme));
  check('dark: every run in the panel reaches 4.5:1',
    dark.runs.length >= 20 && dark.runs.every(run => run.contrast >= 4.5),
    JSON.stringify(dark.runs.filter(run => run.contrast < 4.5).slice(0, 4)));
  for (const [tone, ratio] of Object.entries(dark.tones)) {
    check(`dark: badge tone "${tone}" contrast >= 4.5`, ratio >= 4.5, String(ratio));
  }
  await main.evaluate(`applyTheme(${JSON.stringify(savedTheme)})`);
  await wait(300);

  // 7. Nhánh dev-mode: cất `dev-app-update.yml` đi thì bản chạy từ mã nguồn phải nói
  //    thẳng, không để vòng "đang kiểm tra…" quay mãi.
  removeFeed();
  await settleBeforeClick(main);
  await clickCheck(main);
  let devMode;
  try {
    devMode = await waitFor(main, entry => entry.state.errorKind === 'dev-mode', 'the dev-mode answer', 40000);
  } catch (error) {
    check('checking without a dev feed answers with the dev-mode message', false, error.message);
    devMode = error.last || await main.evaluate(READ);
  }
  check('the badge reads "Không kiểm tra được"', devMode.badge === 'Không kiểm tra được', devMode.badge);
  check('the dev-mode card says this is not an installed build', /bộ cài đặt/u.test(devMode.errorText), devMode.errorText.slice(0, 80));
  check('the dev-mode card links to the release page', devMode.releasesHref === RELEASE_PAGE, String(devMode.releasesHref));
  check('the panel is not stuck on "đang kiểm tra"', devMode.spinning === false && devMode.checkDisabled === false,
    JSON.stringify({ spinning: devMode.spinning, checkDisabled: devMode.checkDisabled }));
  check('the tab chip stays quiet on an error', devMode.chip === '', devMode.chip);
  const errorRuns = await main.evaluate(MEASURE);
  check('the error card is measured too — its runs reach 4.5:1',
    errorRuns.runs.some(run => run.err)
    && errorRuns.runs.every(run => run.contrast >= 4.5),
    `${errorRuns.runs.filter(run => run.err).length} runs inside #aboutErrorCard / low: `
    + JSON.stringify(errorRuns.runs.filter(run => run.contrast < 4.5).slice(0, 3)));

  // 8. Hai nhánh lỗi mạng, đo trước khi có bộ cài nào trên đĩa. URL giữ nguyên (đã
  //    cache), chỉ server đổi: tắt listener -> `offline`, trả 404 -> `feed`.
  const errorScenarios = [
    { name: 'offline', serve: false, mode: 'ok', hint: /internet/u },
    { name: 'feed', serve: true, mode: '404', hint: /chưa tìm thấy|phát hành/u }
  ];
  writeFeed(baseUrl);
  for (const scenario of errorScenarios) {
    feed.mode = scenario.mode;
    if (scenario.serve) await startFeed(feedPort); else await stopFeed();
    await settleBeforeClick(main);
    await clickCheck(main);
    let answer;
    try {
      answer = await waitFor(main, entry => entry.state.errorKind === scenario.name, `${scenario.name} classification`, 40000);
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

  // 9. Có nguồn -> bản mới, và KHÔNG tự tải.
  feed.mode = 'ok';
  await startFeed(feedPort);
  await settleBeforeClick(main);
  await clickCheck(main);
  let available;
  try {
    available = await waitFor(main, entry => phaseOf(entry) === 'available', 'update-available', 45000);
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
  check('the tab chip advertises the new version', available.chip === `↑ ${NEW_VERSION}`, available.chip);
  await wait(2500);
  const untouched = await main.evaluate(READ);
  check('autoDownload=false really downloads nothing on its own',
    untouched.barVisible === false && untouched.state.progressPercent === 0 && untouched.state.phase === 'available'
    && feed.counts.installer === 0,
    JSON.stringify({ phase: untouched.state.phase, percent: untouched.state.progressPercent, installer: feed.counts.installer }));

  // 10. Bấm tải: tiến trình thật, phần trăm tăng một chiều, rồi sẵn sàng cài.
  const samples = [];
  await main.evaluate(`document.getElementById('aboutDownloadBtn').click()`);
  let downloaded = null;
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    const sample = await main.evaluate(READ);
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
    check('the spinner runs while bytes move', mid.spinning === true, String(mid.spinning));
  } else {
    check('the bar and its number agree', false, 'no mid-flight sample to measure');
    check('the progress line shows bytes and an estimate', false, 'no mid-flight sample');
    check('the check button is locked while bytes move', false, 'no mid-flight sample');
    check('the download button reads "Đang tải…"', false, 'no mid-flight sample');
    check('the badge names the version being downloaded', false, 'no mid-flight sample');
    check('the spinner runs while bytes move', false, 'no mid-flight sample');
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
    check('the tab chip switches to "Cài được"', downloaded.chip === '✓ Cài được', downloaded.chip);
    check('the bytes the server sent match what main reported',
      feed.counts.bytes >= payload.length && downloaded.state.transferredBytes > 0,
      JSON.stringify({ served: feed.counts.bytes, transferred: downloaded.state.transferredBytes, expected: payload.length }));
    const cacheDir = findCacheDir();
    const pending = cacheDir ? pendingDirOf(cacheDir) : null;
    const installer = pending ? fs.readdirSync(pending).find(name => name.includes('EduGameStudio')) : null;
    const installerBytes = installer ? fs.statSync(path.join(pending, installer)).size : 0;
    check('the installer really landed on disk',
      Boolean(installer) && installerBytes === payload.length,
      JSON.stringify({ cacheDir, installer, installerBytes, expected: payload.length }));
  }

  // 11. Chip nhãn tab phải theo được một push khi panel đang bị giấu — nghĩa là không có
  //     `render()` nào giúp nó. Đổi tab bằng click thật: wiring của tab chỉ lật class.
  await clickSettingsTab(main, 'ai');
  const chipWhileHidden = await main.evaluate(`(() => {
    const slot = document.querySelector('[data-about-tab-chip]');
    const view = window.aboutPanelSnapshot();
    return {
      chip: slot ? slot.textContent.trim() : '',
      panelHidden: document.getElementById('settingsPanel-about').classList.contains('hidden'),
      phase: view.state.phase
    };
  })()`);
  check('the tab chip keeps talking while the panel is hidden',
    chipWhileHidden.panelHidden === true && chipWhileHidden.chip === '✓ Cài được' && chipWhileHidden.phase === 'downloaded',
    JSON.stringify(chipWhileHidden));
  await clickSettingsTab(main, 'about');

  // 12. Luật 6 đo tận nơi: lỗi của lần kiểm tra sau không lấy đi quyền cài.
  await stopFeed();
  await settleBeforeClick(main);
  await clickCheck(main);
  await wait(6000);
  const afterLateError = await main.evaluate(READ);
  check('a failed later check cannot revoke the ready installer',
    phaseOf(afterLateError) === 'downloaded' && afterLateError.installDisabled === false,
    JSON.stringify({ phase: afterLateError.state.phase, installDisabled: afterLateError.installDisabled }));
  check('and the panel shows no error card for it', afterLateError.errorVisible === false, afterLateError.errorTitle);
  check('the panel still mirrors main after the late failure',
    afterLateError.state.phase === afterLateError.view.state.phase && afterLateError.view.bridgeBroken === false,
    JSON.stringify({ ipc: afterLateError.state.phase, panel: afterLateError.view.state.phase, bridgeBroken: afterLateError.view.bridgeBroken }));

  // Dọn dẹp: bỏ feed, trả trang, xoá bộ nhớ đệm của gate, tắt server.
  removeFeed();
  const cleanup = await main.evaluate(`(() => {
    navigate('library');
    return { page: state.page };
  })()`);
  check('the app leaves the Settings page cleanly', cleanup.page === 'library', JSON.stringify(cleanup));
  const cacheDir = findCacheDir();
  if (cacheDir) { try { fs.rmSync(cacheDir, { recursive: true, force: true }); } catch { } }
  await stopFeed();
  console.log(`  feed served ${feed.counts.latest} latest.yml reads, ${feed.counts.installer} installer GETs, `
    + `${feed.counts.bytes} bytes`);
  report();
})().catch(error => {
  removeFeed();
  try { server.close(); } catch { }
  console.error('ui-about-check crashed: ' + ((error && error.stack) || error));
  process.exit(1);
});
