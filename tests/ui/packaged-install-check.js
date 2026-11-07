// packaged-install-check.js — đo quitAndInstall() THẬT trên binary đóng gói (#212).
//
// Nốt nợ mà #188/#200/#202/#203/#206/#211 đều ghi lại bằng cùng một câu: cổng "tuyệt
// đối không bấm Tải về và cập nhật", "không bấm Khởi động lại để cài", vì chủ dự án
// không cho chạy bộ cài THẬT trên máy này. Kết quả là cả chuỗi cập nhật dừng đúng một
// bước trước bước duy nhất đổi hành vi của máy giáo viên.
//
// Phép đo vẫn dựng được tại chỗ, vì ba sự thật đã kiểm tra trong
// node_modules/electron-updater/out/:
//   - NsisUpdater.doInstall:127 chỉ sang nhánh elevate khi `isAdminRightsRequired ===
//     true`, và giá trị đó do FEED khai trong latest.yml (DownloadedUpdateHelper.js:61),
//     KHÔNG phải từ `quitAndInstall(false, true)` — tham số thứ hai là isForceRunAfter.
//   - verifySignature:95 trả null khi app-update.yml không khai `publisherName`, nên một
//     bộ cài không ký đi qua cổng đó; còn sha512 của latest.yml thì vẫn bị bắt buộc.
//   - electron-builder viết `win-unpacked` rồi mới đóng NSIS từ nó, nên thêm
//     `resources/app-update.yml` vào cây `--dir` là cây đó thành "bản đã cài" thật —
//     mà không phải chạy bộ cài thật.
// Sandbox: installer GIẢ do makensis trong cache của electron-builder compile, InstallDir
// nung vào một thư mục TEMP, `RequestExecutionLevel user` (không sinh UAC), `SilentInstall
// silent` (không wizard chờ người bấm), và Section của nó tự ghi `$CMDLINE` — tức argv
// nguyên văn electron-updater đã spawn — ra tệp log trong TEMP. elevate cũng là bản GIẢ,
// đúng vì nó không gọi ShellExecuteEx runas: bản THẬT sẽ bật một hộp UAC trên máy này,
// và chủ dự án chốt "giữ nguyên, chỉ đo và ghi".
//
// Bốn kịch bản, mỗi kịch bản một process + một hồ sơ Temp riêng (AppUpdater cache
// configOnDisk cả đời process — bài học ghi ở đầu ui-about-check.js):
//   direct     latest.yml không khai admin  -> spawn thẳng bộ cài. Đây là nhánh mà feed
//              ĐÃ PHÁT HÀNH của 0.4.1 đi (bài kiểm tra published-feed ở main chứng minh).
//   elevate    admin + elevate.exe bản GIẢ  -> đo đúng một lần spawn elevate với argv
//              = <bộ cài đã tải> --updated --force-run; install-log vắng mặt chứng minh
//              bản giả không forward (và chứng minh bộ cài không tự chạy song song).
//              Bài học dựng cổng: `isAdminRightsRequired` phải nằm TRONG entry của `files`
//              (DownloadedUpdateHelper.js:61 đọc `fileInfo.info`, Provider.js:132 đặt
//              `info` = một phần tử của `files`); khai ở top level thì YAML hợp lệ nhưng
//              electron-updater không thấy, và kịch bản âm thầm đi nhánh direct.
//   no-elevate admin + KHÔNG có elevate.exe  -> nhánh admin KHÔNG có đường về
//              shell.openPath: spawn lỗi ENOENT, app vẫn quit, không cài gì, không lời
//              báo lỗi nào tới mắt giáo viên.
//   badhash    sha512 trong latest.yml SAI có chủ đích -> chân không tích cực cho điều
//              kiện "downloaded nghĩa là đã xác minh": vẫn bấm Tải về, vẫn tải đủ byte,
//              nhưng không bao giờ tới downloaded và không mọc nút cài. Từ #218 kịch bản
//              này còn đo lỗi checksum mang kind riêng `checksum` (nợ #212 đã đóng).
//
// Chạy (gate TỰ bật và TỰ tắt app — khác các gate UI khác, vì mỗi kịch bản cần một
// process mới và app chết là một phần của phép đo):
//   npm run build
//   npm run check:packaged-install                  # cả bốn kịch bản
//   node tests/ui/packaged-install-check.js 9399 direct   # một kịch bản, cổng tự chọn
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { check, results } = require('../manual/lib/ui-check-lib');

const REPO = path.resolve(__dirname, '..', '..');
const CDP_PORT = Number(process.argv[2] || process.env.CDP_PORT || 9399);
const SCENARIOS = ['direct', 'elevate', 'no-elevate', 'badhash'];
const ONLY = SCENARIOS.includes(process.argv[3]) ? [process.argv[3]] : SCENARIOS;

/** Cây `--dir` của #211 — nội dung bộ cài đã phát hành, chưa có app-update.yml. */
const APP_DIR = process.env.EG_INSTALL_APP_DIR || path.join(REPO, 'release', '210', 'win-unpacked');
const APP_EXE = path.join(APP_DIR, 'EduGame Studio.exe');
const RESOURCES = path.join(APP_DIR, 'resources');
const APP_UPDATE_YML = path.join(RESOURCES, 'app-update.yml');
const RES_ELEVATE = path.join(RESOURCES, 'elevate.exe');
const NSIS_CACHE = path.join(process.env.LOCALAPPDATA || '', 'electron-builder', 'Cache', 'nsis', 'nsis-3.0.4.1');
const MAKENSIS = process.env.EG_MAKENSIS || path.join(NSIS_CACHE, 'makensis.exe');
/** elevate THẬT, chỉ để báo dung lượng của thứ mà phép đo thay bằng bản giả. */
const REAL_ELEVATE = path.join(NSIS_CACHE, 'elevate.exe');

const SANDBOX = path.join(os.tmpdir(), 'eg-install');
const CACHE_NOTE = path.join(SANDBOX, 'updater-cache-dir.txt');
const NEW_VERSION = '9.9.9';
const INSTALLER_NAME = `EduGame-Studio-Setup-${NEW_VERSION}.exe`;
const UPDATER_CACHE_NAME = 'eg-install-probe';
const RELEASE_OWNER = 'vananz123';
const RELEASE_REPO = 'edu-game-ai';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function rmrf(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 4, retryDelay: 120 });
    return true;
  } catch (error) {
    console.log(`  (dọn ${dir} không hết: ${error.message})`);
    return false;
  }
}

/** Template NSIS — gate chép ra TEMP rồi compile; không đụng build/installer.nsh. */
const NSI_TEMPLATE = `Name "EduGame Studio sandbox install probe"
OutFile "__OUT__"
InstallDir "__TARGET__"
RequestExecutionLevel user
SilentInstall silent
AutoCloseWindow true
ShowInstDetails nevershow
Section "Install"
  CreateDirectory "$INSTDIR"
  FileOpen $0 "$INSTDIR\\__LOGNAME__" a
  FileSeek $0 0 END
  FileWrite $0 "cmdline=$CMDLINE$\\r$\\n"
  FileWrite $0 "instdir=$INSTDIR$\\r$\\n"
  FileWrite $0 "exedir=$EXEDIR$\\r$\\n"
  FileWrite $0 "probe=__PROBE__$\\r$\\n"
  FileClose $0
__MARKER__SectionEnd
`;

/** Compile một bản giả; `kind` = 'installer' ghi install-log.txt, 'elevate' ghi elevate-log.txt. */
function compileProbe(kind, target, probeId) {
  const buildDir = path.join(SANDBOX, 'build', probeId, kind);
  fs.mkdirSync(buildDir, { recursive: true });
  const outFile = path.join(buildDir, kind === 'elevate' ? 'elevate.exe' : INSTALLER_NAME);
  const nsi = NSI_TEMPLATE
    .replace(/__OUT__/g, outFile)
    .replace(/__TARGET__/g, target)
    .replace(/__LOGNAME__/g, kind === 'elevate' ? 'elevate-log.txt' : 'install-log.txt')
    .replace(/__PROBE__/g, probeId)
    .replace('__MARKER__', kind === 'elevate'
      ? ''
      : `  FileOpen $1 "$INSTDIR\\installed-version.txt" w\n  FileWrite $1 "${NEW_VERSION}$\\r$\\n"\n  FileClose $1\n`);
  const nsiPath = path.join(buildDir, 'probe.nsi');
  fs.writeFileSync(nsiPath, nsi);
  const run = spawnSync(MAKENSIS, ['-V2', nsiPath], { encoding: 'utf8' });
  if (!fs.existsSync(outFile)) {
    throw new Error(`makensis không sinh ra ${outFile}: rc=${run.status} `
      + String((run.stdout || '') + (run.stderr || '')).slice(0, 400));
  }
  return { exe: outFile, bytes: fs.statSync(outFile).size };
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

/**
 * Feed `generic` giả trên vòng lặp: một latest.yml + một bộ cài, sha512 tự tính từ đúng
 * byte nó phục vụ (trừ kịch bản badhash), đếm mọi request và mọi byte. `admin` bật
 * isAdminRightsRequired — cái duy nhất đẩy electron-updater sang nhánh elevate.
 */
function startFeed({ installer, admin, bad, port }) {
  const buffer = fs.readFileSync(installer);
  const digest = crypto.createHash('sha512').update(buffer).digest('base64');
  const sha512 = bad ? crypto.createHash('sha512').update('khong-phai-bo-cai').digest('base64') : digest;
  const size = buffer.length;
  const latest = [
    `version: ${NEW_VERSION}`,
    'files:',
    `  - url: ${INSTALLER_NAME}`,
    `    sha512: ${sha512}`,
    `    size: ${size}`,
    // `isAdminRightsRequired` PHẢI nằm trong entry của `files`, không được đứng một mình
    // ở top level: DownloadedUpdateHelper.js:61 đọc `fileInfo.info.isAdminRightsRequired`
    // và `Provider.js:132` đặt `info` = đúng một phần tử của danh sách `files`. Đặt ở top
    // level thì YAML hợp lệ nhưng electron-updater không nhìn thấy, nên vẫn đi nhánh spawn
    // thẳng — chính là red mà lượt `elevate` đầu tiên đo được.
    ...(admin ? ['    isAdminRightsRequired: true'] : []),
    `path: ${INSTALLER_NAME}`,
    `sha512: ${sha512}`,
    `releaseDate: '${new Date().toISOString()}'`,
  ].join('\n') + '\n';
  const counts = { latest: 0, installer: 0, bytes: 0, sha512, digest, size, latestBody: latest };
  const server = http.createServer((request, response) => {
    const url = String(request.url || '').split('?')[0];
    if (url === '/latest.yml') {
      counts.latest += 1;
      response.writeHead(200, { 'content-type': 'text/yaml' });
      response.end(latest);
      return;
    }
    if (url === `/${INSTALLER_NAME}`) {
      counts.installer += 1;
      response.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': String(size) });
      const stream = fs.createReadStream(installer);
      stream.on('data', chunk => { counts.bytes += chunk.length; });
      stream.pipe(response);
      return;
    }
    response.writeHead(404, { 'content-type': 'text/plain' });
    response.end('nope');
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve({
      counts,
      stop: () => new Promise(done => {
        if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
        server.close(() => done());
      }),
    }));
  });
}

async function connectCdp(port) {
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const target = list.find(entry => entry.type === 'page' && /index\.html/.test(entry.url));
  if (!target) throw new Error(`không có target index.html trên cổng ${port}`);
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const call = ++id;
    const timer = setTimeout(() => { pending.delete(call); reject(new Error(`CDP timeout: ${method}`)); }, 20000);
    pending.set(call, message => { clearTimeout(timer); resolve(message); });
    ws.send(JSON.stringify({ id: call, method, params }));
  });
  const evaluate = async expression => {
    const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (response.result?.exceptionDetails) {
      throw new Error(response.result.exceptionDetails.exception?.description || 'eval error');
    }
    return response.result?.result?.value;
  };
  await send('Runtime.enable');
  await send('Page.enable');
  return { ws, evaluate, close: () => { try { ws.close(); } catch { /* đã đóng */ } } };
}

async function cdpAlive(port) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function pidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code !== 'ESRCH';
  }
}

/** Bật bản đóng gói với hồ sơ Temp sạch. ELECTRON_RUN_AS_NODE phải xoá, không để undefined. */
function launchApp({ port, profile }) {
  fs.mkdirSync(profile, { recursive: true });
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  env.EDUGAME_USER_DATA = profile;
  const child = spawn(APP_EXE, [
    `--remote-debugging-port=${port}`,
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
  ], { env, detached: true, stdio: 'ignore' });
  child.unref();
  return child;
}

async function waitForCdp(port, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await cdpAlive(port)) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        if (list.some(entry => entry.type === 'page' && /index\.html/.test(entry.url))) {
          return { elapsedMs: Date.now() - started };
        }
      } catch { /* danh sách chưa đọc được */ }
    }
    await wait(400);
  }
  throw new Error(`CDP không dậy trên cổng ${port} sau ${timeoutMs} ms`);
}

const READ = `(async () => {
  const g = id => document.getElementById(id);
  const shown = id => {
    const el = g(id);
    return Boolean(el) && !el.classList.contains('hidden') && el.getClientRects().length > 0;
  };
  const state = await window.eduGame.aboutState();
  return {
    ready: document.readyState,
    panelOpen: shown('settingsPanel-about'),
    badge: g('aboutStatusText') ? g('aboutStatusText').textContent.trim() : '',
    tone: g('aboutStatusBadge') ? g('aboutStatusBadge').getAttribute('data-tone') : '',
    note: g('aboutStatusNote') ? g('aboutStatusNote').textContent.trim() : '',
    updateVisible: shown('aboutUpdateCard'),
    updateTitle: g('aboutUpdateTitle') ? g('aboutUpdateTitle').textContent.trim() : '',
    progressText: g('aboutProgressText') ? g('aboutProgressText').textContent.trim() : '',
    barVisible: shown('aboutProgressTrack'),
    downloadDisabled: g('aboutDownloadBtn') ? g('aboutDownloadBtn').disabled : null,
    downloadLabel: g('aboutDownloadBtn') ? g('aboutDownloadBtn').textContent.trim() : '',
    installVisible: shown('aboutInstallBtn'),
    installDisabled: g('aboutInstallBtn') ? g('aboutInstallBtn').disabled : null,
    installLabel: g('aboutInstallBtn') ? g('aboutInstallBtn').textContent.trim() : '',
    errorVisible: shown('aboutErrorCard'),
    errorTitle: g('aboutErrorTitle') ? g('aboutErrorTitle').textContent.trim() : '',
    errorText: g('aboutErrorText') ? g('aboutErrorText').textContent.trim() : '',
    version: g('aboutVersion') ? g('aboutVersion').textContent.trim() : '',
    state,
  };
})()`;

const phaseOf = dom => (dom && dom.state && dom.state.phase) || '';

/** Mở Cài đặt -> tab Giới thiệu; hồ sơ sạch bị wizard first-run che một nhịp. */
async function openAbout(page) {
  await page.evaluate(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 60 && !document.querySelector('#modalRoot .setup-fullscreen'); i += 1) await sleep(100);
    if (typeof closeSetupWizard === 'function') closeSetupWizard('close');
    for (let i = 0; i < 20 && document.querySelector('#modalRoot .setup-fullscreen'); i += 1) await sleep(100);
    const tab = document.querySelector('[data-settings-section="about"]');
    return { wizard: Boolean(document.querySelector('#modalRoot .setup-fullscreen')), hasTab: Boolean(tab) };
  })()`);
  await page.evaluate(`document.querySelector('[data-page="settings"]').click()`);
  await wait(300);
  await page.evaluate(`(() => { const tab = document.querySelector('[data-settings-section="about"]'); if (tab) tab.click(); })()`);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const dom = await page.evaluate(READ);
    if (dom.panelOpen && dom.ready === 'complete') return dom;
    await wait(200);
  }
  throw new Error('tab Giới thiệu không mở được');
}

async function waitForPhase(page, wanted, timeoutMs) {
  const started = Date.now();
  let dom = null;
  while (Date.now() - started < timeoutMs) {
    dom = await page.evaluate(READ);
    if (wanted.includes(phaseOf(dom))) return { dom, elapsedMs: Date.now() - started };
    await wait(250);
  }
  return { dom, elapsedMs: Date.now() - started, timedOut: true };
}

/** Nhật ký electron-updater mà app ghi ra hồ sơ (log sink = aiLogWrite -> JSONL). */
function readUpdaterLog(profile) {
  const dir = path.join(profile, 'edugame-data', 'logs');
  const lines = [];
  let names = [];
  try {
    names = fs.readdirSync(dir).filter(name => name.endsWith('.jsonl'));
  } catch {
    return { dir, lines, files: 0 };
  }
  for (const name of names) {
    let text = '';
    try {
      text = fs.readFileSync(path.join(dir, name), 'utf8');
    } catch {
      continue;
    }
    for (const raw of text.split(/\r?\n/)) {
      if (!raw.trim()) continue;
      let entry = null;
      try {
        entry = JSON.parse(raw);
      } catch {
        continue;
      }
      if (entry && entry.event === 'updater.event') lines.push(String((entry.data && entry.data.message) || ''));
    }
  }
  return { dir, lines, files: names.length };
}

function argvFlags(cmdline) {
  return {
    updated: /(^|\s)--updated(\s|$)/.test(cmdline),
    forceRun: /(^|\s)--force-run(\s|$)/.test(cmdline),
    silent: /(^|\s)\/S(\s|$)/.test(cmdline),
    packageFile: /--package-file=/.test(cmdline),
    installDir: /(^|\s)\/D=/.test(cmdline),
  };
}

/** Token đầu của một dòng command line Windows, bỏ dấu ngoặc bao quanh. */
function firstToken(cmdline) {
  const text = String(cmdline || '').trim();
  if (text.startsWith('"')) {
    const end = text.indexOf('"', 1);
    return end < 0 ? text : text.slice(1, end);
  }
  const space = text.indexOf(' ');
  return space < 0 ? text : text.slice(0, space);
}

function fieldOf(text, key) {
  const line = String(text || '').split(/\r?\n/).find(entry => entry.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1) : '';
}

/** `updater cache dir: <X>` là dòng AppUpdater.js:550 log ra trước khi tải bất cứ gì. */
function cacheDirFromLog(lines) {
  for (const line of lines || []) {
    const match = /updater cache dir:\s*(.+?)\s*$/i.exec(String(line));
    if (match) return match[1];
  }
  return '';
}

/** Chỉ nhận đường cache mang tên probe — cái khóa để xoá cache không bao giờ thành xoá app. */
function isProbeCacheDir(dir) {
  return typeof dir === 'string' && dir !== ''
    && path.basename(dir).toLowerCase() === UPDATER_CACHE_NAME.toLowerCase();
}

/**
 * Một kịch bản = một process. Trả về mọi số đo được; check() diễn giải theo kịch bản.
 */
async function runScenario(name, probeId) {
  const target = path.join(SANDBOX, 'target', name);
  const profile = path.join(SANDBOX, 'profile', name);
  rmrf(target);
  rmrf(profile);
  fs.mkdirSync(target, { recursive: true });
  fs.mkdirSync(profile, { recursive: true });

  const facts = { name, probeId, target, profile };
  console.log(`\n=== ${name} (${probeId}) ===`);

  // Xóa cache updater của lượt TRƯỚC nếu biết đường (từ ghi chú), để mỗi kịch bản
  // buộc phải tải lại từ feed giả của chính nó. Khoá bằng tên: một ghi chú trỏ vào
  // nơi khác (đặc biệt là resources/ của cây win-unpacked) tuyệt đối không được xoá.
  try {
    const known = fs.readFileSync(CACHE_NOTE, 'utf8').trim();
    if (isProbeCacheDir(known)) {
      if (fs.existsSync(known)) rmrf(known);
    } else if (known) {
      console.log(`  (bỏ qua ghi chú cache nghi ngờ: ${known})`);
      fs.rmSync(CACHE_NOTE, { force: true });
    }
  } catch { /* lượt đầu tiên, chưa có ghi chú */ }

  const built = compileProbe('installer', target, probeId);
  facts.installerBytes = built.bytes;
  facts.builtInstaller = built.exe;
  const wantsElevate = name === 'elevate';
  if (wantsElevate) {
    const fake = compileProbe('elevate', target, probeId);
    fs.copyFileSync(fake.exe, RES_ELEVATE);
    facts.elevateBytes = fake.bytes;
  }

  const feedPort = await freePort();
  const feed = await startFeed({
    installer: built.exe,
    admin: name === 'elevate' || name === 'no-elevate',
    bad: name === 'badhash',
    port: feedPort,
  });
  facts.feedPort = feedPort;
  fs.writeFileSync(APP_UPDATE_YML, [
    'provider: generic',
    `url: http://127.0.0.1:${feedPort}/`,
    `updaterCacheDirName: ${UPDATER_CACHE_NAME}`,
    '',
  ].join('\n'));

  const child = launchApp({ port: CDP_PORT, profile });
  facts.pid = child.pid;
  let page = null;
  try {
    facts.bootMs = (await waitForCdp(CDP_PORT, 60000)).elapsedMs;
    page = await connectCdp(CDP_PORT);
    const info = await page.evaluate(`(async () => await window.eduGame.aboutInfo())()`);
    facts.version = info.version;
    facts.packaged = info.packaged;
    facts.userData = info.userDataPath;
    await openAbout(page);

    const answered = await waitForPhase(page, ['available', 'error'], 45000);
    facts.check = answered.dom;
    facts.checkMs = answered.elapsedMs;
    facts.checkTimedOut = Boolean(answered.timedOut);
    // Bằng chứng cho "một lượt kiểm tra không tải gì" phải lấy NGAY lúc đó, không lấy
    // cuối lượt — cuối lượt thì bộ cài đã được tải (và đã được spawn) nên số đếm khác.
    facts.countsAfterCheck = { ...feed.counts };

    if (phaseOf(facts.check) === 'available') {
      await page.evaluate(`document.getElementById('aboutDownloadBtn').click()`);
      // badhash được mời tải một cách CHÍNH danh: kịch bản này đo lỗi nổi ở bước kiểm
      // sha512 sau khi tải, nên phải bấm tải và chờ `error`, không được bỏ qua.
      const wanted = name === 'badhash' ? ['error'] : ['downloaded', 'error'];
      const done = await waitForPhase(page, wanted, 150000);
      facts.download = done.dom;
      facts.downloadMs = done.elapsedMs;
      facts.downloadTimedOut = Boolean(done.timedOut);
    }

    const clickedAt = Date.now();
    let clicked = false;
    if (facts.download && facts.download.installVisible === true && facts.download.installDisabled === false) {
      await page.evaluate(`document.getElementById('aboutInstallBtn').click()`);
      clicked = true;
    }
    facts.installClicked = clicked;
    facts.installState = facts.download
      ? { visible: facts.download.installVisible, disabled: facts.download.installDisabled, label: facts.download.installLabel }
      : null;

    // Ứng dụng phải TỰ CHẾT: BaseUpdater.quitAndInstall -> install() -> setImmediate(app.quit()).
    facts.quitWithinMs = -1;
    if (clicked) {
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline) {
        if (!await cdpAlive(CDP_PORT) && !pidAlive(facts.pid)) { facts.quitWithinMs = Date.now() - clickedAt; break; }
        await wait(250);
      }
    }

    // Bộ cài (hoặc elevate giả) phải THẬT SỰ chạy, và để lại argv nguyên văn của nó.
    facts.logName = wantsElevate ? 'elevate-log.txt' : 'install-log.txt';
    facts.logPath = path.join(target, facts.logName);
    const pollMs = wantsElevate || name === 'direct' ? 45000 : 6000;
    const logDeadline = Date.now() + pollMs;
    while (Date.now() < logDeadline) {
      if (fs.existsSync(facts.logPath)) break;
      await wait(300);
    }
    facts.logText = fs.existsSync(facts.logPath) ? fs.readFileSync(facts.logPath, 'utf8') : '';
    facts.markerPath = path.join(target, 'installed-version.txt');
    facts.markerWritten = fs.existsSync(facts.markerPath)
      ? fs.readFileSync(facts.markerPath, 'utf8').trim() : '';

    const cmdline = fieldOf(facts.logText, 'cmdline');
    facts.cmdline = cmdline;
    facts.spawned = firstToken(cmdline);
    facts.instdir = fieldOf(facts.logText, 'instdir');

    const updater = readUpdaterLog(profile);
    facts.updaterLines = updater.lines;
    // Đường cache LẤY TỪ NHẬT KÝ của chính electron-updater ("updater cache dir: ..."),
    // không suy từ `spawned`: ở nhánh elevate, token đầu là resources/elevate.exe nên
    // `dirname(spawned)` trỏ vào resources của cây win-unpacked — ghi cái đó vào ghi chú
    // thì lượt kế tiếp sẽ XOÁ RỖNG app.asar. Ghi chú chỉ được nhận một đường mà tên thư
    // mục đúng là UPDATER_CACHE_NAME của probe.
    facts.cacheDir = cacheDirFromLog(facts.updaterLines);
    if (isProbeCacheDir(facts.cacheDir)) fs.writeFileSync(CACHE_NOTE, facts.cacheDir);
    facts.feedCounts = { ...feed.counts };
    facts.countsAfterDownload = facts.download ? { ...feed.counts } : null;
    // Hồ sơ Temp sẽ bị xoá ngay dưới đây, nên rời bằng chứng ra một tệp báo cáo bền.
    const reportDir = path.join(SANDBOX, 'report');
    fs.mkdirSync(reportDir, { recursive: true });
    const reportPath = path.join(reportDir, `${probeId}.json`);
    const slim = { ...facts };
    delete slim.check;
    delete slim.download;
    fs.writeFileSync(reportPath, JSON.stringify({ ...slim, check: facts.check, download: facts.download }, null, 1));
    facts.reportPath = reportPath;
    console.log(`  nhật ký updater (${updater.lines.length} dòng): `
      + updater.lines.filter(line => /Install|Executing|elevate|checksum|sha512|downloaded|available/i.test(line)).join(' | ').slice(0, 500));
    return facts;
  } finally {
    await feed.stop();
    if (facts.pid && pidAlive(facts.pid)) {
      try { process.kill(facts.pid); } catch { /* đã thoát */ }
    }
    if (page) page.close();
    fs.rmSync(APP_UPDATE_YML, { force: true });
    fs.rmSync(RES_ELEVATE, { force: true });
    rmrf(profile);
  }
}

// ---------------------------------------------------------------- kiểm tra theo kịch bản
function checkCommon(facts) {
  const n = facts.name;
  check(`${n}: feed vòng lặp mời đúng bản ${NEW_VERSION} và app nhận ra`,
    !facts.checkTimedOut && phaseOf(facts.check) === 'available'
      && facts.check.state.newVersion === NEW_VERSION,
    JSON.stringify({ phase: phaseOf(facts.check), kind: facts.check.state.errorKind, new: facts.check.state.newVersion, ms: facts.checkMs }));
  check(`${n}: một lượt kiểm tra chỉ gõ đúng một cửa latest.yml, không tải gì`,
    facts.countsAfterCheck.latest >= 1 && facts.countsAfterCheck.installer === 0
      && facts.countsAfterCheck.bytes === 0,
    JSON.stringify({ ...facts.countsAfterCheck, phase: phaseOf(facts.check) }));
  check(`${n}: bản được đo là binary đóng gói chứ không phải dev đội lốt`,
    facts.packaged === true && /^\d+\.\d+\.\d+$/u.test(String(facts.version)),
    JSON.stringify({ packaged: facts.packaged, version: facts.version, bootMs: facts.bootMs }));
  check(`${n}: app mời tải bằng nút "Tải về và cập nhật" ở trạng thái bật`,
    facts.check.downloadDisabled === false && facts.check.updateVisible === true
      && facts.check.downloadLabel === 'Tải về và cập nhật',
    JSON.stringify({ disabled: facts.check.downloadDisabled, label: facts.check.downloadLabel }));
  check(`${n}: autoDownload=false nên chưa byte nào đi trước cú bấm`,
    facts.check.state.progressPercent === 0 && facts.check.state.transferredBytes === 0
      && facts.check.installVisible === false && facts.check.barVisible === false,
    JSON.stringify({ percent: facts.check.state.progressPercent, installVisible: facts.check.installVisible }));
}

function checkDirect(facts) {
  const flags = argvFlags(facts.cmdline);
  check('direct: bấm Tải về là tới downloaded',
    !facts.downloadTimedOut && phaseOf(facts.download) === 'downloaded',
    JSON.stringify({ phase: phaseOf(facts.download), kind: facts.download.state.errorKind, message: String(facts.download.state.errorMessage || '').slice(0, 80), ms: facts.downloadMs }));
  check('direct: downloaded mở đúng một nút "Khởi động lại để cài" và nó BẬT',
    facts.installState && facts.installState.visible === true && facts.installState.disabled === false
      && /Kh/i.test(facts.installState.label),
    JSON.stringify(facts.installState));
  check('direct: đủ số byte của bộ cài đi qua feed, đúng một request',
    facts.feedCounts.installer === 1 && facts.feedCounts.bytes === facts.installerBytes
      && facts.download.state.transferredBytes === facts.installerBytes,
    JSON.stringify({ requests: facts.feedCounts.installer, served: facts.feedCounts.bytes, state: facts.download.state.transferredBytes, size: facts.installerBytes }));
  check('direct: sha512 feed khai KHỚP với byte đã phục vụ (điều kiện của downloaded)',
    facts.feedCounts.sha512 === facts.feedCounts.digest, JSON.stringify({ sha512: facts.feedCounts.sha512.slice(0, 16) }));
  check('direct: quitAndInstall() spawn THẬT và ứng dụng tự chết sau cú bấm',
    facts.installClicked === true && facts.quitWithinMs >= 0, `quitMs=${facts.quitWithinMs} bootMs=${facts.bootMs}`);
  check('direct: bộ cài giả THẬT SỰ chạy, tự ghi argv nó nhận được',
    facts.cmdline !== '', JSON.stringify({ logPath: facts.logPath }));
  check('direct: argv = <bộ cài trong cache> --updated --force-run, không /S, không --package-file, không /D=',
    flags.updated && flags.forceRun && !flags.silent && !flags.packageFile && !flags.installDir,
    JSON.stringify({ ...flags, cmdline: facts.cmdline }));
  check('direct: tệp được spawn là chính bộ cài feed vừa phục vụ, lấy từ cache updater chứ không từ repo',
    path.basename(facts.spawned) === INSTALLER_NAME
      && facts.spawned.split(path.sep).includes(UPDATER_CACHE_NAME)
      && !facts.spawned.startsWith(REPO) && !facts.spawned.startsWith(APP_DIR),
    JSON.stringify({ spawned: facts.spawned, cacheRoot: process.env.LOCALAPPDATA, repo: REPO }));
  check('direct: thư mục spawn thật là <cache>/pending — ghi lại để các phép đo sau tìm đúng chỗ',
    path.basename(path.dirname(facts.spawned)).toLowerCase() === 'pending',
    JSON.stringify({ cacheDir: facts.cacheDir }));
  check('direct: không có elevate.exe nào trong chuỗi spawn của nhánh không-admin',
    !/elevate/i.test(facts.cmdline), facts.cmdline);
  check('direct: InstallDir là TEMP mà gate nung sẵn, không phải Program Files',
    facts.instdir === facts.target, JSON.stringify({ instdir: facts.instdir, target: facts.target }));
  check('direct: một tệp của "bản mới" thực sự rơi xuống InstallDir',
    facts.markerWritten === NEW_VERSION, JSON.stringify({ marker: facts.markerWritten, path: facts.markerPath }));
  // Nhật ký electron-updater là lời tự thuật của chính thư viện, ghi ra hồ sơ qua log
  // sink aiLogWrite — nó nói THAM SỐ nào đã thực sự tới install(), không phải suy đoán.
  const selfReport = facts.updaterLines.join('\n');
  check('direct: tự thuật "Install on explicit quitAndInstall" rồi "Install: isSilent: false, isForceRunAfter: true"',
    /Install on explicit quitAndInstall/.test(selfReport)
      && /isSilent: false, isForceRunAfter: true/.test(selfReport),
    JSON.stringify(facts.updaterLines.filter(line => /Install/.test(line))));
  check('direct: tham số thứ hai của quitAndInstall là isForceRunAfter CHỨ KHÔNG phải quyền admin',
    /Executing: .*Setup-9\.9\.9\.exe with args: --updated,--force-run/.test(selfReport)
      && !/elevate/i.test(selfReport),
    JSON.stringify(facts.updaterLines.filter(line => /Executing/.test(line))));
}

function checkElevate(facts) {
  const flags = argvFlags(facts.cmdline);
  check('elevate: bấm cài vẫn tải xong và spawn đúng nhánh (downloaded -> clicked)',
    phaseOf(facts.download) === 'downloaded' && facts.installClicked === true,
    JSON.stringify({ phase: phaseOf(facts.download), clicked: facts.installClicked, state: facts.installState }));
  check('elevate: resources/elevate.exe ĐƯỢC chọn làm đường spawn',
    facts.cmdline !== '' && path.basename(facts.spawned).toLowerCase() === 'elevate.exe',
    JSON.stringify({ cmdline: facts.cmdline, logPath: facts.logPath }));
  check('elevate: elevate nhận argv = <bộ cài đã tải> + --updated --force-run, không /S',
    facts.cmdline.includes(INSTALLER_NAME) && flags.updated && flags.forceRun && !flags.silent,
    JSON.stringify({ ...flags, cmdline: facts.cmdline }));
  check('elevate: elevate được spawn ĐÚNG MỘT lần — tức tối đa một hộp UAC với elevate thật',
    (String(facts.logText).match(/cmdline=/g) || []).length === 1,
    JSON.stringify({ times: (String(facts.logText).match(/cmdline=/g) || []).length, realElevateBytes: facts.elevateBytes }));
  check('elevate: bộ cài không tự chạy song song (install-log vắng mặt vì bản giả không forward)',
    !fs.existsSync(path.join(facts.target, 'install-log.txt')), facts.target);
  check('elevate: ứng dụng vẫn quit đúng như nhánh thường',
    facts.quitWithinMs >= 0, `quitMs=${facts.quitWithinMs}`);
}

function checkNoElevate(facts) {
  const report = facts.updaterLines.join('\n');
  const execCount = facts.updaterLines.filter(line => /Executing:/.test(line)).length;
  check('no-elevate: log tự thuật nói rõ chọn elevate rồi ENOENT, và chỉ có một lệnh Executing',
    /isAdminRightsRequired is set to true/.test(report) && /elevate\.exe ENOENT/.test(report) && execCount === 1,
    JSON.stringify({ execCount, tail: facts.updaterLines.slice(-3).map(line => line.slice(0, 120)) }));
  check('no-elevate: không elevate.exe thì KHÔNG có cài đặt nào xảy ra',
    facts.cmdline === '' && !fs.existsSync(facts.markerPath),
    JSON.stringify({ cmdline: facts.cmdline, marker: facts.markerWritten }));
  check('no-elevate: nhánh admin không có đường về shell.openPath — không bộ cài nào được chạy bằng cửa sau',
    !fs.existsSync(path.join(facts.target, 'install-log.txt')), facts.target);
  check('no-elevate: ứng dụng VẪN quit dù cài thất bại (giáo viên mất cửa sổ, không mất bản mới)',
    facts.quitWithinMs >= 0, `quitMs=${facts.quitWithinMs} clicked=${facts.installClicked}`);
}

function checkBadhash(facts) {
  check('badhash: sha512 SAI bị chặn, không bao giờ tới downloaded',
    !facts.downloadTimedOut && phaseOf(facts.download) === 'error',
    JSON.stringify({ phase: phaseOf(facts.download), message: String(facts.download.state.errorMessage || '').slice(0, 90) }));
  check('badhash: tệp vẫn được tải đủ byte xuống đĩa, rồi bị từ chối',
    facts.feedCounts.installer === 1 && facts.feedCounts.bytes === facts.installerBytes,
    JSON.stringify({ requests: facts.feedCounts.installer, served: facts.feedCounts.bytes, size: facts.installerBytes }));
  check('badhash: không mọc nút cài cho một tệp không khớp dấu vết',
    facts.installState === null || facts.installState.visible === false,
    JSON.stringify({ installState: facts.installState, installClicked: facts.installClicked }));
  check('badhash: thẻ lỗi được vẽ cho giáo viên thấy',
    facts.download.errorVisible === true, JSON.stringify({ title: facts.download.errorTitle, text: String(facts.download.errorText).slice(0, 90) }));
  // #218 đóng nợ #212: "sha512 checksum mismatch" nay là kind `checksum` riêng, đứng
  // trước nhánh feed (mẫu 5\d\d của feed từng khớp chữ "512" trong "sha512", khiến
  // giáo viên đọc "Chưa tìm thấy bản phát hành nào trên GitHub" cho một tệp hỏng).
  // Check này đo cả phân loại lẫn câu tiếng Việt + tiêu đề thẻ lỗi trên binary.
  check('badhash: errorKind là "checksum", không còn nhận nhầm là "feed" (#218 đóng nợ #212)',
    facts.download.state.errorKind === 'checksum' && /sha512/i.test(String(facts.download.state.errorMessage)),
    JSON.stringify({ kind: facts.download.state.errorKind, message: String(facts.download.state.errorMessage).slice(0, 70) }));
  check('badhash: thẻ lỗi nói đúng sự thật — tệp không toàn vẹn, không phải "không tìm thấy bản phát hành"',
    /không toàn vẹn/u.test(String(facts.download.errorText)) && facts.download.errorTitle === 'Bản cập nhật không hợp lệ',
    JSON.stringify({ title: facts.download.errorTitle, text: String(facts.download.errorText).slice(0, 90) }));
  check('badhash: không một tiến trình cài đặt nào được spawn',
    facts.cmdline === '' && facts.quitWithinMs === -1,
    JSON.stringify({ cmdline: facts.cmdline, quitMs: facts.quitWithinMs }));
}

const CHECKS = { direct: checkDirect, elevate: checkElevate, 'no-elevate': checkNoElevate, badhash: checkBadhash };

/**
 * `git status --porcelain=v1` của cả cây, đã sort.
 *
 * Phép đo so với **điểm bắt đầu**, không đòi cây sạch tuyệt đối: một lượt đo hợp lệ được
 * phép để lại chính sản phẩm của nó (gate mới, script đăng ký, gói đo P7). Thứ không được
 * phép xuất hiện là byte **lạ** do bộ cài giả rơi vào repo.
 */
function gitDirty() {
  return String(spawnSync('git', ['status', '--porcelain=v1'], { cwd: REPO, encoding: 'utf8' }).stdout || '')
    .split(/\r?\n/).map(line => line.trim()).filter(Boolean).sort();
}

(async () => {
  // ---- tiền đề: những thứ phép đo này đứng trên đó ----
  check('cây binary đóng gói có thật (bản --dir của #211)', fs.existsSync(APP_EXE), APP_EXE);
  check('makensis trong cache electron-builder có thật', fs.existsSync(MAKENSIS), MAKENSIS);
  check('cây win-unpacked CHƯA có app-update.yml (đúng chất một bản --dir)',
    !fs.existsSync(APP_UPDATE_YML), APP_UPDATE_YML);
  check('cây win-unpacked CHƯA có elevate.exe (đúng chất một bản --dir)',
    !fs.existsSync(RES_ELEVATE), RES_ELEVATE);
  check('elevate THẬT tồn tại, để biết rõ thứ phép đo thay bằng bản giả',
    fs.existsSync(REAL_ELEVATE), `${fs.existsSync(REAL_ELEVATE) ? fs.statSync(REAL_ELEVATE).size : 0} byte tại ${REAL_ELEVATE}`);
  fs.mkdirSync(SANDBOX, { recursive: true });
  // Chụp cây TRƯỚC khi động tới bất cứ gì: mọi check "repo không bị bôi bẩn" phía sau so
  // với ảnh chụp này chứ không so với "sạch", nên một gate chưa commit vẫn đo đúng.
  const dirtyAtStart = gitDirty();

  // ---- feed ĐÃ PHÁT HÀNH: đời thật có bật nhánh admin không? ----
  let published = null;
  try {
    published = await new Promise((resolve, reject) => {
      const get = (url, depth) => {
        const req = require('node:https').get(url,
          { headers: { 'user-agent': 'edugame-install-probe', 'accept-encoding': 'identity' } }, res => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && depth < 3) {
              res.resume();
              return get(res.headers.location, depth + 1);
            }
            let body = '';
            res.on('data', chunk => { body += chunk; });
            res.on('end', () => resolve({ status: res.statusCode, body }));
          });
        req.setTimeout(15000, () => req.destroy(new Error('timeout đọc feed')));
        req.on('error', reject);
      };
      get(`https://github.com/${RELEASE_OWNER}/${RELEASE_REPO}/releases/latest/download/latest.yml`, 0);
    });
  } catch (error) {
    published = { status: 0, body: '', error: String((error && error.message) || error) };
  }
  // `^\s*` vì electron-updater đọc cờ này từ entry TRONG `files` (khai ở top level thì bị
  // bỏ qua — xem startFeed), nên một feed khai đúng cách sẽ có nó nằm lùi đầu dòng.
  const publishedAdmin = /^\s*isAdminRightsRequired:\s*true/m.test(String(published.body || ''));
  const publishedVersion = (/^version:\s*([0-9.]+)/m.exec(String(published.body || '')) || [])[1] || '';
  const publishedBytes = (/^\s*size:\s*(\d+)/m.exec(String(published.body || '')) || [])[1] || '';
  check('feed đã phát hành đọc được từ máy này',
    published.status === 200, JSON.stringify({ status: published.status, error: published.error, version: publishedVersion }));
  check('feed đã phát HÀNH không khai isAdminRightsRequired -> đời thật đi nhánh spawn thẳng, 0 UAC từ bộ cập nhật',
    publishedAdmin === false && publishedVersion !== '',
    JSON.stringify({ publishedAdmin, publishedVersion, publishedBytes }));

  const ran = [];
  for (const name of ONLY) {
    const probeId = `${name}-${new Date().toISOString().slice(11, 19).replace(/:/g, '')}`;
    const facts = await runScenario(name, probeId);
    ran.push(facts);
    if (facts.name === 'badhash' && phaseOf(facts.check) !== 'available') {
      check('badhash: lượt kiểm tra vẫn phải ra available (lỗi nằm ở bước tải)', false,
        JSON.stringify({ phase: phaseOf(facts.check), kind: facts.check.state.errorKind }));
      continue;
    }
    checkCommon(facts);
    if (facts.download) CHECKS[name](facts);
    else check(`${name}: không tới được bước tải, nên không có gì để đo ở bước cài`, false,
      JSON.stringify({ phase: phaseOf(facts.check), kind: facts.check.state.errorKind, message: String(facts.check.state.errorMessage || '').slice(0, 90) }));
    console.log(`  updater log: ${facts.updaterLines.length} dòng | cache=${facts.cacheDir} | quitMs=${facts.quitWithinMs}`);
  }

  // ---- bất biến toàn cục của cả bốn lượt ----
  const dirtyNow = gitDirty();
  const added = dirtyNow.filter(line => !dirtyAtStart.includes(line));
  const gone = dirtyAtStart.filter(line => !dirtyNow.includes(line));
  check('cây làm việc giữ NGUYÊN trạng thái git sau khi chạy bộ cài giả (không byte lạ nào lọt vào repo)',
    added.length === 0 && gone.length === 0, JSON.stringify({ added, gone }));
  check('win-unpacked trả về đúng tình trạng ban đầu: không app-update.yml, không elevate.exe',
    !fs.existsSync(APP_UPDATE_YML) && !fs.existsSync(RES_ELEVATE),
    JSON.stringify({ appUpdate: fs.existsSync(APP_UPDATE_YML), elevate: fs.existsSync(RES_ELEVATE) }));
  const strays = fs.readdirSync(APP_DIR).filter(name => /Setup-9\.9\.9/i.test(name));
  check('không một bản sao bộ cài 9.9.9 nào nằm lại trong cây app',
    strays.length === 0 && !fs.existsSync(path.join(RESOURCES, INSTALLER_NAME)),
    JSON.stringify({ strays, resources: RESOURCES }));
  check('hồ sơ Temp của từng kịch bản đã bị xoá sạch',
    ran.every(facts => !fs.existsSync(facts.profile)),
    JSON.stringify(ran.map(facts => ({ name: facts.name, left: fs.existsSync(facts.profile) }))));
  console.log(`\n(kịch bản: ${ran.map(facts => facts.name).join(', ')} | sandbox ${SANDBOX})`);

  const failed = results.filter(entry => !entry.ok);
  console.log(`\npackaged-install-check: ${results.length - failed.length}/${results.length} passed`);
  for (const failure of failed) console.log('  FAIL ' + failure.name + (failure.detail ? ' — ' + failure.detail : ''));
  process.exit(failed.length ? 1 : 0);
})().catch(error => {
  console.error('packaged-install-check crashed: ' + ((error && error.stack) || error));
  process.exit(1);
});
