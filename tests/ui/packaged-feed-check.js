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
// Chạy (hai lượt, mỗi lượt một hồ sơ Temp riêng):
//   npm run build && npx electron-builder --win nsis      # trong worktree sạch tại HEAD
//   $env:EDUGAME_USER_DATA="$env:TEMP\eg-feed-041"
//   "release\win-unpacked\EduGame Studio.exe" --remote-debugging-port=9371
//   node tests/ui/packaged-feed-check.js 9371
//   # lượt chân không:
//   $env:EDUGAME_FEED_EXPECT="error";  rename app-update.yml -> app-update.yml.off ; bật lại app
//   node tests/ui/packaged-feed-check.js 9371
const { check, results } = require('../manual/lib/ui-check-lib');
const { findTarget, listTargets } = require('./lib/screenshot-capture');

const PORT = Number(process.argv[2] || process.env.CDP_PORT || 9371);
/** `up-to-date` = bản đóng gói với feed thật. `error` = chân không (đã cất app-update.yml). */
const EXPECT = process.env.EDUGAME_FEED_EXPECT === 'error' ? 'error' : 'up-to-date';
/** Bản đã phát hành (#200) — đọc thẳng từ `latest.yml` của repo, không hard-code. */
const RELEASE_OWNER = 'vananz123';
const RELEASE_REPO = 'edu-game-ai';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

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
  const hidden = id => !g(id) || g(id).classList.contains('about-hidden');
  const state = await window.aboutAPI.getState();
  return {
    badge: g('aboutStatusText') ? g('aboutStatusText').textContent.trim() : '',
    tone: g('aboutStatusBadge') ? g('aboutStatusBadge').getAttribute('data-tone') : '',
    spinning: g('aboutStatusBadge') ? g('aboutStatusBadge').classList.contains('about-spin') : null,
    note: g('aboutStatusNote') ? g('aboutStatusNote').textContent.trim() : '',
    checkDisabled: g('aboutCheckBtn') ? g('aboutCheckBtn').disabled : null,
    updateVisible: !hidden('aboutUpdateCard'),
    updateTitle: g('aboutUpdateTitle') ? g('aboutUpdateTitle').textContent.trim() : '',
    barVisible: !hidden('aboutProgressTrack'),
    downloadDisabled: g('aboutDownloadBtn') ? g('aboutDownloadBtn').disabled : null,
    installVisible: !hidden('aboutInstallBtn'),
    errorVisible: !hidden('aboutErrorCard'),
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

  await main.evaluate(`document.querySelector('[data-action="about-open"]').click()`);
  let opened = null;
  for (let attempt = 0; attempt < 80 && !opened; attempt += 1) {
    opened = (await listTargets(PORT)).find(entry => /about\.html/.test(entry.url));
    if (!opened) await wait(250);
  }
  check('clicking the sidebar opens the About window', Boolean(opened), opened ? 'target found' : 'no about.html target');
  if (!opened) report();

  const about = await connectTo(/about\.html/);
  const info = await about.evaluate(`(async () => await window.aboutAPI.getAppInfo())()`);

  // 1. Đúng binary đã phát hành, không phải bản dev đội lốt.
  check('the app reports itself packaged', info.packaged === true, JSON.stringify({ packaged: info.packaged }));
  check('the running version is the released one', info.version === '0.4.0', info.version);
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

  if (EXPECT === 'up-to-date') {
    // 3. Nhánh xanh: đúng những gì giáo viên thấy khi #200 đã phát hành 0.4.0.
    check('the real feed answers up-to-date (not errorKind "feed")',
      state.phase === 'up-to-date' && state.errorKind === '',
      JSON.stringify({ phase: state.phase, kind: state.errorKind, message: String(state.errorMessage).slice(0, 90) }));
    check('the badge reads "Ứng dụng đã mới nhất"', answer.badge === 'Ứng dụng đã mới nhất', answer.badge);
    check('the badge is the ok tone, not spinning', answer.tone === 'ok' && answer.spinning === false,
      JSON.stringify({ tone: answer.tone, spinning: answer.spinning }));
    check('the note names the running version', /Bản 0\.4\.0 là bản mới nhất/u.test(answer.note), answer.note);
    check('no error card is painted', answer.errorVisible === false, answer.errorTitle);
    check('the retry button is usable', answer.checkDisabled === false, String(answer.checkDisabled));
    check('the check really happened', state.lastCheckedAt > 0, String(state.lastCheckedAt));
    check('no update was invented', state.newVersion === '', JSON.stringify({ newVersion: state.newVersion }));
    // autoDownload = false: một lượt kiểm tra xanh không được tải gì.
    check('nothing downloaded on its own', state.progressPercent === 0 && answer.barVisible === false
      && answer.updateVisible === false && answer.installVisible === false,
      JSON.stringify({ percent: state.progressPercent, barVisible: answer.barVisible,
        updateVisible: answer.updateVisible, installVisible: answer.installVisible }));

    // 4. Hai nguồn phải nói cùng một điều.
    check('the GitHub feed is reachable from this machine for an anonymous read',
      feedTruth.status === 200, JSON.stringify({ status: feedTruth.status, error: feedTruth.error }));
    check('the app agrees with an independent read of releases/latest',
      feedVersion === state.currentVersion,
      JSON.stringify({ feedTag, feedVersion, currentVersion: state.currentVersion, phase: state.phase }));

    // 5. Bấm thật, lần thứ hai — nhánh xanh phải lặp lại được, không phải ăn may.
    await about.evaluate(`document.getElementById('aboutCheckBtn').click()`);
    const again = await waitForAnswer(about);
    check('a manual re-check answers up-to-date again',
      phaseOf(again.dom) === 'up-to-date' && again.dom.state.errorKind === '',
      JSON.stringify({ phase: phaseOf(again.dom), kind: again.dom.state.errorKind,
        message: String(again.dom.state.errorMessage).slice(0, 90) }));
    check('the second check is recorded later than the first',
      again.dom.state.lastCheckedAt > state.lastCheckedAt,
      JSON.stringify({ first: state.lastCheckedAt, second: again.dom.state.lastCheckedAt }));
    check('the second answer took network time too', again.elapsedMs > 20, `${again.elapsedMs} ms`);
  } else {
    // 6. Chân không: cất `resources/app-update.yml` đi thì KHÔNG được nói "đã mới nhất".
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

  // 7. Hai nhánh dùng chung: không có gì nhạy cảm rò ra trang, chữ không broken.
  const dom = answer;
  const leaked = /GEMINI|service_role|Bearer |eyJ[A-Za-z0-9_-]{8}|gh[pousr]_[A-Za-z0-9]{8}/u.test(JSON.stringify(dom));
  check('no secret-shaped text on the page', !leaked, leaked ? 'found a token-shaped string' : '');
  check('no mojibake in the sentences the teacher reads',
    !/[ÂÃ][»¡º£¥]/u.test(`${dom.badge} ${dom.note} ${dom.version} ${dom.packaged}`),
    JSON.stringify({ badge: dom.badge, note: dom.note.slice(0, 60) }));
  await about.evaluate(`window.close()`).catch(() => { });
  await wait(800);
  const remaining = (await listTargets(PORT)).filter(entry => /about\.html/.test(entry.url)).length;
  check('the About window closes cleanly', remaining === 0, String(remaining));

  report();
})().catch(error => {
  console.error('packaged-feed-check crashed: ' + ((error && error.stack) || error));
  process.exit(1);
});
