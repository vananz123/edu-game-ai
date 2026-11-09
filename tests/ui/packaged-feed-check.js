// packaged-feed-check.js — bấm "Kiểm tra cập nhật" trên bản ĐÓNG GÓI, chống feed
// GitHub THẬT (#201). Đây là nốt nợ (a) của #200: cổng #188 mới đi hết chu trình
// bằng một nguồn giả trên vòng lặp trong nước, còn "electron-updater + feed thật
// + binary đã phát hành" chưa bao giờ gặp nhau trong một process.
//
// Vì sao phải đo chỗ này: ba khả năng hỏng chỉ tồn tại ở giao điểm đó mà không
// mock nào thấy được — (1) `provider: github` vô danh bị GitHub chặn hoặc phân
// trang khác với cách electron-updater chọn bản; (2) `resources/app-update.yml`
// do electron-builder sinh ra không khớp với gì repo thật có; (3) `allowPrerelease
// = false` + cùng version 0.4.0 phải cho ra "đã mới nhất", chứ không phải
// `errorKind: 'feed'` như trước khi #200 phát hành.
//
// #204 đổi chỗ ngồi, không đổi nội dung đo: trang Giới thiệu không còn là cửa sổ thứ
// hai (`src/about/about.html`) mà là tab thứ sáu của Cài đặt, vẽ trong chính
// `index.html`. Nên cổng nối thẳng vào target `index.html`, bấm Cài đặt rồi bấm tab Giới
// thiệu thật — từ #205 đó là đường duy nhất, mục sidebar riêng đã bị bỏ — và
// chờ `#settingsPanel-about` hiện, đồng thời chứng minh cả lượt không từng sinh
// target `about.html` nào. Mọi lời gọi bridge đi `window.eduGame.*`, không còn
// `window.aboutAPI`.
//
// Ba chế độ, cùng một tệp, chọn bằng đối số thứ hai (hoặc `EDUGAME_FEED_EXPECT`):
//   up-to-date  bản đóng gói == bản mới nhất của feed -> phải lên "đã mới nhất".
//   available   bản đóng gói CŨ HƠN feed (0.4.0 chống feed đã có 0.4.1 — nốt nợ (a)
//               của #200, đo ở #166) -> phải MỜI cập nhật: badge "Có bản mới X", thẻ
//               cập nhật hiện, nút "Tải về và cập nhật" Bật nhưng tuyệt đối không bấm,
//               thanh tiến trình vẫn ẩn và 0 %.
//   error       đã cất `resources/app-update.yml` đi -> là chân không.
// Không hard-code phiên bản nào cho nhánh đúng: `up-to-date` và `available` suy ra từ
// chính `releases/latest` đọc vô danh trên máy này, nên cổng sống qua lần phát hành
// sau. `EDUGAME_APP_VERSION` chỉ tuỳ chọn khoá tên binary đang đo.
//
// CHÂN KHÔNG tiêu cực (proof rằng câu trả lời đến từ tệp feed, không phải từ
// `app.getVersion()`): chạy cổng này HAI LẦN trên hai process khác nhau. Lần một
// để nguyên `resources/app-update.yml` -> phải lên `up-to-date`. Lần hai đổi tên
// tệp đó đi -> phải ra LỖI, không được nói "đã mới nhất". `AppUpdater` cache
// `configOnDisk` cả đời process (bài học ghi ở đầu `ui-about-check.js`) nên mánh
// đổi tệp giữa chừng là không dùng được — buộc phải có hai lượt khởi động.
//
// KHÔNG bấm "Tải về và cập nhật", KHÔNG bấm "Khởi động lại để cài": `autoDownload
// = false` và `quitAndInstall()` spawn bộ cài + đóng ứng dụng (chủ dự án không
// cho chạy bộ cài trên máy này). Cổng chỉ đọc, và đo thêm một điều: sau lượt
// kiểm tra xanh thì phần trăm vẫn 0 và thanh tải vẫn ẩn.
//
// Chạy (mỗi lượt một hồ sơ Temp riêng, một process riêng — cổng KHÔNG tự bật app):
//   npm run build && npx electron-builder --win nsis      # trong worktree sạch tại HEAD
//   $env:EDUGAME_USER_DATA="$env:TEMP\eg-feed-041"
//   "release\win-unpacked\EduGame Studio.exe" --remote-debugging-port=9371
//   node tests/ui/packaged-feed-check.js 9371                # up-to-date
//   node tests/ui/packaged-feed-check.js 9371 available      # 0.4.0 chống feed có 0.4.1 (#166)
//   # lượt chân không: cất app-update.yml đi rồi mới bật app
//   node tests/ui/packaged-feed-check.js 9371 error
//   # khoá tên binary nếu muốn (tuỳ chọn): $env:EDUGAME_APP_VERSION="0.4.0"
const { check, results } = require('../manual/lib/ui-check-lib');
const { findTarget, listTargets } = require('./lib/screenshot-capture');

const PORT = Number(process.argv[2] || process.env.CDP_PORT || 9371);
/**
 * Nhánh kỳ vọng: `up-to-date` | `available` | `error` (chân không — đã cất
 * app-update.yml). Chọn bằng đối số thứ hai (để `npm run` chạy được trên Windows,
 * nơi `VAR=x node …` trong script không có hiệu lực) hoặc bằng biến môi trường.
 */
const MODES = ['up-to-date', 'available', 'error'];
const EXPECT = MODES.includes(process.argv[3]) ? process.argv[3]
  : (MODES.includes(process.env.EDUGAME_FEED_EXPECT) ? process.env.EDUGAME_FEED_EXPECT : 'up-to-date');
/** Tuỳ chọn khoá tên binary đang đo, ví dụ `EDUGAME_APP_VERSION=0.4.0`. */
const APP_VERSION = String(process.env.EDUGAME_APP_VERSION || '');
/** Repo công bố feed — `app-update.yml` của bản đóng gói trỏ đúng vào đây. */
const RELEASE_OWNER = 'vananz123';
const RELEASE_REPO = 'edu-game-ai';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const escRe = text => String(text == null ? '' : text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * So sánh ĐỘC LẬP với ứng dụng: chỉ số học trên ba nhóm số, không gọi
 * `compareVersions` của `update-policy.ts` (so bằng chính hàm bị nghi thì cổng
 * không bao giờ đỏ được), và không cần thư viện semver.
 */
function cmpVersions(candidate, current) {
  const parse = value => {
    const match = /^v?(\d+)\.(\d+)(?:\.(\d+))?/.exec(String(value == null ? '' : value).trim());
    return match ? [Number(match[1]), Number(match[2]), Number(match[3] || 0)] : null;
  };
  const a = parse(candidate);
  const b = parse(current);
  if (!a || !b) return null;
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

/** Nối CDP vào một target theo URL (thư viện dùng chung chỉ biết index.html). */
async function connectTo(matcher) {
  const target = await findTarget(PORT, matcher);
  if (!target) {
    const found = (await listTargets(PORT)).map(entry => entry.url).join('\n  ');
    throw new Error(`no target matching ${matcher} on port ${PORT}. Pages:\n  ${found}`);
  }
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
    const timer = setTimeout(() => { pending.delete(call); reject(new Error(`CDP timeout: ${method}`)); }, 25000);
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
  return { ws, send, evaluate };
}

const READ = `(async () => {
  const g = id => document.getElementById(id);
  // #204: tab "Giới thiệu" nằm trong trang Cài đặt nên phần tử "biến mất" là phần tử
  // bị gắn class hidden của Tailwind hoặc bị che bởi một tab khác — không còn
  // lớp about-hidden riêng của cửa sổ cũ.
  const shown = el => Boolean(el) && !el.classList.contains('hidden') && el.getClientRects().length > 0;
  const panel = g('settingsPanel-about');
  const state = await desktop.call('aboutState');
  return {
    panelOpen: shown(panel),
    badge: g('aboutStatusText') ? g('aboutStatusText').textContent.trim() : '',
    tone: g('aboutStatusBadge') ? g('aboutStatusBadge').getAttribute('data-tone') : '',
    spinning: shown(g('aboutStatusSpinner')),
    note: g('aboutStatusNote') ? g('aboutStatusNote').textContent.trim() : '',
    checkDisabled: g('aboutCheckBtn') ? g('aboutCheckBtn').disabled : null,
    updateVisible: shown(g('aboutUpdateCard')),
    updateTitle: g('aboutUpdateTitle') ? g('aboutUpdateTitle').textContent.trim() : '',
    updateDiff: g('aboutUpdateDiff') ? g('aboutUpdateDiff').textContent.trim() : '',
    barVisible: shown(g('aboutProgressTrack')),
    progressText: g('aboutProgressText') ? g('aboutProgressText').textContent.trim() : '',
    downloadDisabled: g('aboutDownloadBtn') ? g('aboutDownloadBtn').disabled : null,
    downloadLabel: g('aboutDownloadBtn') ? g('aboutDownloadBtn').textContent.trim() : '',
    installVisible: shown(g('aboutInstallBtn')),
    errorVisible: shown(g('aboutErrorCard')),
    errorTitle: g('aboutErrorTitle') ? g('aboutErrorTitle').textContent.trim() : '',
    errorText: g('aboutErrorText') ? g('aboutErrorText').textContent.trim() : '',
    errorKindShown: g('aboutErrorDetail') ? g('aboutErrorDetail').textContent.trim() : '',
    releasesHref: g('aboutErrorReleasesLink') ? g('aboutErrorReleasesLink').getAttribute('href') : '',
    version: g('aboutVersion') ? g('aboutVersion').textContent.trim() : '',
    packaged: g('factPackaged') ? g('factPackaged').textContent.trim() : '',
    state
  };
})()`;

const phaseOf = dom => (dom && dom.state && dom.state.phase) || '';

/** Chờ trang rời `checking`, trả { dom, elapsedMs }. */
async function waitForAnswer(page, timeoutMs = 60000) {
  const started = Date.now();
  const deadline = started + timeoutMs;
  let dom = null;
  while (Date.now() < deadline) {
    dom = await page.evaluate(READ);
    if (phaseOf(dom) !== 'checking' && phaseOf(dom) !== 'idle') {
      return { dom, elapsedMs: Date.now() - started };
    }
    await wait(150);
  }
  const error = new Error(`timeout waiting for an answer; last=${JSON.stringify({
    phase: phaseOf(dom), kind: dom && dom.state.errorKind, badge: dom && dom.badge,
  })}`);
  error.last = dom;
  throw error;
}

function report() {
  const failed = results.filter(entry => !entry.ok);
  console.log(`\npackaged-feed-check (${EXPECT}): ${results.length - failed.length}/${results.length} passed`);
  for (const failure of failed) console.log('  FAIL ' + failure.name + (failure.detail ? ' — ' + failure.detail : ''));
  process.exit(failed.length ? 1 : 0);
}

(async () => {
  // Nguồn tham chiếu đọc TỪ MÁY NÀY, độc lập với app: chính là hai lời gọi vô danh
  // mà electron-updater sẽ đi. Nếu app và phép đọc này bất đồng thì một trong hai
  // bên đang nói sai, và cổng phải thấy.
  let feedTruth = null;
  try {
    feedTruth = await new Promise((resolve, reject) => {
      const request = require('node:https').get(
        { host: 'api.github.com', path: `/repos/${RELEASE_OWNER}/${RELEASE_REPO}/releases/latest`,
          headers: { 'user-agent': 'edugame-packaged-feed-check', accept: 'application/vnd.github+json' } },
        response => {
          let body = '';
          response.on('data', chunk => { body += chunk; });
          response.on('end', () => resolve({ status: response.statusCode, json: body ? JSON.parse(body) : null }));
        });
      request.setTimeout(15000, () => request.destroy(new Error('feed read timed out')));
      request.on('error', reject);
    });
  } catch (error) {
    feedTruth = { status: 0, json: null, error: String((error && error.message) || error) };
  }
  const feedTag = feedTruth.json && feedTruth.json.tag_name ? feedTruth.json.tag_name : '';
  const feedVersion = feedTag.replace(/^v/, '');

  const main = await connectTo(/index\.html/);
  const isPackagedApp = await main.evaluate(`location.protocol`);
  check('the instance under test is the packaged build (file:// + asar)',
    isPackagedApp === 'file:', isPackagedApp);

  // Trang Cài đặt của bản đóng gói cũng bị trang setup của hồ sơ mới che mất một nhịp —
  // cùng cảnh báo mà `ui-about-check.js` và các gate Settings đã xử lý.
  await main.evaluate(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 40 && !document.querySelector('#modalRoot .setup-fullscreen'); i += 1) await sleep(100);
    if (typeof closeSetupWizard === 'function') closeSetupWizard('close');
    await sleep(250);
  })()`);

  // #205: mục "Giới thiệu" ở sidebar đã bị bỏ, nên đường đi của giáo viên là Cài đặt -> tab
  // thứ sáu. Cổng bấm thật hai lần đó, và mọi đo đạc sau diễn ra trong CÙNG cửa sổ — không
  // còn target `about.html` nào để chờ.
  const targetsBefore = (await listTargets(PORT)).length;
  await main.evaluate(`document.querySelector('[data-page="settings"]').click()`);
  await wait(400);
  await main.evaluate(`(() => {
    const tab = document.querySelector('[data-settings-section="about"]');
    if (tab) tab.click();
  })()`);
  let opened = null;
  for (let attempt = 0; attempt < 40 && !opened; attempt += 1) {
    const settled = await main.evaluate(`(() => {
      const panel = document.getElementById('settingsPanel-about');
      // state là binding lexical toàn cục của renderer (const ở đầu shared.js) — không
      // phải window.state, và không được đặt tên biến local là state trong biểu thức này.
      return { open: Boolean(panel) && !panel.classList.contains('hidden'), section: state.settingsSection };
    })()`);
    if (settled.open && settled.section === 'about') opened = settled;
    if (!opened) await wait(250);
  }
  check('Cài đặt rồi tab Giới thiệu opens the panel in the same window (#205 route)',
    Boolean(opened) && (await listTargets(PORT)).length === targetsBefore,
    JSON.stringify({ opened, targetsBefore, targetsAfter: (await listTargets(PORT)).length }));
  if (!opened) report();

  const about = main;
  const info = await about.evaluate(`(async () => await desktop.call('aboutInfo'))()`);

  // 1. Đúng binary đã phát hành, không phải bản dev đội lốt.
  check('the app reports itself packaged', info.packaged === true, JSON.stringify({ packaged: info.packaged }));
  check('the running version is the binary this mode is about',
    APP_VERSION ? info.version === APP_VERSION : /^\d+\.\d+\.\d+$/u.test(String(info.version)),
    JSON.stringify({ version: info.version, pinned: APP_VERSION, mode: EXPECT }));
  check('the release page points at this repo',
    info.releasePageUrl === `https://github.com/${RELEASE_OWNER}/${RELEASE_REPO}/releases`, info.releasePageUrl);

  // 2. Mở trang là kiểm tra — câu trả lời PHẢI đến từ mạng.
  let answer;
  let elapsedMs = 0;
  try {
    const settled = await waitForAnswer(about);
    answer = settled.dom;
    elapsedMs = settled.elapsedMs;
  } catch (error) {
    check('the packaged About page gets an answer from the feed', false, error.message);
    report();
  }
  const state = answer.state;
  console.log(`  answer: phase=${state.phase} kind="${state.errorKind}" in ${elapsedMs} ms`
    + ` | current=${state.currentVersion} new="${state.newVersion}"`);

  // 3. Hai nguồn phải nói cùng một điều — cả ba chế độ đều đọc feed thật trên máy này.
  check('the GitHub feed is reachable from this machine for an anonymous read',
    feedTruth.status === 200, JSON.stringify({ status: feedTruth.status, error: feedTruth.error }));
  check('the feed names a plain release version', /^\d+\.\d+\.\d+$/u.test(feedVersion),
    JSON.stringify({ feedTag, feedVersion }));

  if (EXPECT === 'up-to-date') {
    // 4a. Nhánh xanh: đúng những gì giáo viên thấy khi máy đã cài bản mới nhất.
    check('the real feed answers up-to-date (not errorKind "feed")',
      state.phase === 'up-to-date' && state.errorKind === '',
      JSON.stringify({ phase: state.phase, kind: state.errorKind, message: String(state.errorMessage).slice(0, 90) }));
    check('the app agrees with an independent read of releases/latest',
      feedVersion === state.currentVersion && cmpVersions(feedVersion, state.currentVersion) === 0,
      JSON.stringify({ feedTag, feedVersion, currentVersion: state.currentVersion, phase: state.phase }));
    check('the badge reads "Ứng dụng đã mới nhất"', answer.badge === 'Ứng dụng đã mới nhất', answer.badge);
    check('the badge is the ok tone, not spinning', answer.tone === 'ok' && answer.spinning === false,
      JSON.stringify({ tone: answer.tone, spinning: answer.spinning }));
    check('the note names the running version',
      new RegExp('Bản ' + escRe(state.currentVersion) + ' là bản mới nhất', 'u').test(answer.note), answer.note);
    check('no error card is painted', answer.errorVisible === false, answer.errorTitle);
    check('the retry button is usable', answer.checkDisabled === false, String(answer.checkDisabled));
    check('the check really happened', state.lastCheckedAt > 0, String(state.lastCheckedAt));
    check('no update was invented', state.newVersion === '', JSON.stringify({ newVersion: state.newVersion }));
    // autoDownload = false: một lượt kiểm tra xanh không được tải gì.
    check('nothing downloaded on its own', state.progressPercent === 0 && answer.barVisible === false
      && answer.updateVisible === false && answer.installVisible === false,
      JSON.stringify({ percent: state.progressPercent, barVisible: answer.barVisible,
        updateVisible: answer.updateVisible, installVisible: answer.installVisible }));
  } else if (EXPECT === 'available') {
    // 4b. Nhánh "có bản mới": binary cũ chống feed đã phát hành bản mới hơn (#166).
    check('the real feed answers available (not up-to-date, not errorKind "feed")',
      state.phase === 'available' && state.errorKind === '',
      JSON.stringify({ phase: state.phase, kind: state.errorKind, message: String(state.errorMessage).slice(0, 90) }));
    check('the running binary really is older than the feed',
      cmpVersions(feedVersion, state.currentVersion) === 1,
      JSON.stringify({ feedVersion, currentVersion: state.currentVersion }));
    check('the app names exactly the feed version as the new one',
      state.newVersion === feedVersion,
      JSON.stringify({ newVersion: state.newVersion, feedVersion, feedTag }));
    check('the badge reads "Có bản mới <version>"',
      answer.badge === `Có bản mới ${state.newVersion}`, answer.badge);
    check('the badge is the "new" tone, not spinning', answer.tone === 'new' && answer.spinning === false,
      JSON.stringify({ tone: answer.tone, spinning: answer.spinning }));
    check('the note promises no silent download', /Sẽ tải về khi bạn bấm nút/u.test(answer.note), answer.note);
    check('the update card is painted', answer.updateVisible === true, answer.updateTitle);
    check('the update card titles itself as a new update',
      answer.updateTitle === 'Có bản cập nhật mới', answer.updateTitle);
    check('the update card names both versions',
      new RegExp(escRe(state.newVersion) + '.*' + escRe(state.currentVersion), 'u').test(answer.updateDiff),
      answer.updateDiff);
    check('the download button is offered, never pressed by the gate',
      answer.downloadDisabled === false && answer.downloadLabel === 'Tải về và cập nhật',
      JSON.stringify({ disabled: answer.downloadDisabled, label: answer.downloadLabel }));
    check('no error card is painted', answer.errorVisible === false, answer.errorTitle);
    check('the retry button is usable', answer.checkDisabled === false, String(answer.checkDisabled));
    check('the check really happened', state.lastCheckedAt > 0, String(state.lastCheckedAt));
    // autoDownload = false: được MỜI tải, nhưng không một byte nào đã chuyển.
    check('nothing downloaded before the teacher clicked',
      state.progressPercent === 0 && state.transferredBytes === 0 && state.totalBytes === 0
      && answer.barVisible === false,
      JSON.stringify({ percent: state.progressPercent, transferred: state.transferredBytes,
        total: state.totalBytes, barVisible: answer.barVisible, progressText: answer.progressText }));
    check('install stays hidden until a download finishes', answer.installVisible === false,
      String(answer.installVisible));
  } else {
    // 4c. Chân không: cất `resources/app-update.yml` đi thì KHÔNG được nói "đã mới nhất".
    check('without app-update.yml the page refuses instead of claiming up-to-date',
      state.phase === 'error' && state.errorKind !== '',
      JSON.stringify({ phase: state.phase, kind: state.errorKind, message: String(state.errorMessage).slice(0, 90) }));
    check('the refusal is painted as an error card', answer.errorVisible === true, answer.errorText.slice(0, 80));
    check('the refusal is not the feed-not-found sentence the old build showed',
      !/chưa tìm thấy bản phát hành/u.test(answer.errorText), answer.errorText.slice(0, 80));
    check('retry stays usable after the refusal', answer.checkDisabled === false, String(answer.checkDisabled));
    check('nothing downloaded during the refusal',
      state.progressPercent === 0 && answer.barVisible === false,
      JSON.stringify({ percent: state.progressPercent, barVisible: answer.barVisible }));
  }

  // 5. Bấm thật, lần thứ hai — hai nhánh xanh phải lặp lại được, không phải ăn may.
  //    Chỉ bấm "Kiểm tra cập nhật"; "Tải về và cập nhật" tuyệt đối không được chạm.
  if (EXPECT !== 'error') {
    await about.evaluate(`document.getElementById('aboutCheckBtn').click()`);
    const again = await waitForAnswer(about);
    check(`a manual re-check answers ${EXPECT} again`,
      phaseOf(again.dom) === EXPECT && again.dom.state.errorKind === '',
      JSON.stringify({ phase: phaseOf(again.dom), kind: again.dom.state.errorKind,
        message: String(again.dom.state.errorMessage).slice(0, 90) }));
    check('the second check is recorded later than the first',
      again.dom.state.lastCheckedAt > state.lastCheckedAt,
      JSON.stringify({ first: state.lastCheckedAt, second: again.dom.state.lastCheckedAt }));
    check('the second answer took network time too', again.elapsedMs > 20, `${again.elapsedMs} ms`);
    if (EXPECT === 'available') {
      check('the re-check names the same new version', again.dom.state.newVersion === state.newVersion,
        JSON.stringify({ first: state.newVersion, second: again.dom.state.newVersion }));
      check('the re-check did not quietly start a download',
        again.dom.state.phase !== 'downloading' && again.dom.state.progressPercent === 0
        && again.dom.barVisible === false,
        JSON.stringify({ phase: again.dom.state.phase, percent: again.dom.state.progressPercent,
          barVisible: again.dom.barVisible }));
    }
  }

  // 7. Ba chế độ dùng chung: không có gì nhạy cảm rò ra trang, chữ không broken.
  const dom = answer;
  const leaked = /GEMINI|service_role|Bearer |eyJ[A-Za-z0-9_-]{8}|gh[pousr]_[A-Za-z0-9]{8}/u.test(JSON.stringify(dom));
  check('no secret-shaped text on the page', !leaked, leaked ? 'found a token-shaped string' : '');
  check('no mojibake in the sentences the teacher reads',
    !/[ÂÃ][»¡º£¥]/u.test(`${dom.badge} ${dom.note} ${dom.version} ${dom.packaged}`),
    JSON.stringify({ badge: dom.badge, note: dom.note.slice(0, 60) }));
  // #204: không còn cửa sổ thứ hai để đóng, nên hai điều phải chứng minh thay thế là
  // "cả lượt chạy chưa từng có target `about.html`" và "rời Cài đặt thì tab ẩn lại"
  // (trạng thái cập nhật vẫn sống trong main, chỉ painting là tắt theo tab ẩn).
  const stray = (await listTargets(PORT)).filter(entry => /about\.html/.test(entry.url));
  check('no second window appeared at any point in the run', stray.length === 0,
    JSON.stringify(stray.map(entry => entry.url)));
  await main.evaluate(`(() => { if (typeof navigate === 'function') navigate('library'); })()`);
  await wait(600);
  const afterLeave = await main.evaluate(`(() => {
    const panel = document.getElementById('settingsPanel-about');
    return { page: state.page, hidden: !panel || panel.classList.contains('hidden') };
  })()`);
  check('leaving Settings hides the About tab again',
    afterLeave.page === 'library' && afterLeave.hidden === true, JSON.stringify(afterLeave));

  report();
})().catch(error => {
  console.error('packaged-feed-check crashed: ' + ((error && error.stack) || error));
  process.exit(1);
});
