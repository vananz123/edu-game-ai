// @ts-nocheck -- unit tests share one global script scope (moduleDetection: legacy), as the other suites do.
// Tab "Giới thiệu" của trang Cài đặt (#188 → #204) — module thật, nạp trong jsdom,
// nói chuyện với một `window.eduGame` giả.
//
// Vì sao test ở đây thay vì chỉ nhìn bằng mắt: máy trạng thái nằm ở main, còn quy tắc
// "nút nào được bấm lúc nào" được panel vẽ lại. Panel vẽ sai — ví dụ để nút "Tải về"
// sáng khi chưa có bản mới, hay để thanh tiến trình tụt lại — là giáo viên bấm nhầm và
// mất bộ cài đang tải. Ngoài ra toàn bộ chữ tiếng Việt hiện ra ở đây (kể cả bảy nhánh
// lỗi) chỉ có suite này chạy hết được, vì một máy dev không thể tình cờ rơi vào lỗi
// chữ ký số.
//
// Khác bản #188: không còn `about.html` để parse. jsdom dựng đúng cái mà
// `renderSettings()` dựng: một `<section data-settings-panel="about">` chứa
// `aboutPanelHtml()`, rồi gọi `wireAboutPanel()` như controller gọi.
//
// Chạy sau `npm run build`:  node tests/unit/about-page.test.js
// Tự động được `node tests/run-unit.js` nạp như mọi suite khác.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const DIST = path.join(ROOT, 'dist', 'src');
const SHARED_JS = path.join(DIST, 'renderer', 'shared.js');
const PANEL_JS = path.join(DIST, 'renderer', 'features', 'about-panel.js');

let JSDOM;
try {
  ({ JSDOM } = require('jsdom'));
} catch (error) {
  console.log('about-page: SKIPPED (jsdom is not installed; run npm install)');
  process.exit(0);
}
for (const file of [SHARED_JS, PANEL_JS]) {
  assert.ok(fs.existsSync(file), `${file} is missing — run npm run build`);
}

const panelSource = fs.readFileSync(PANEL_JS, 'utf8');

/** Bản `UpdateState` hợp lệ, có thể ghi đè từng trường. */
function updateState(over = {}) {
  return Object.assign({
    phase: 'idle', currentVersion: '0.4.0', newVersion: '', progressPercent: 0,
    transferredBytes: 0, totalBytes: 0, bytesPerSecond: 0,
    errorKind: '', errorMessage: '', lastCheckedAt: 0, downloadStartedAt: 0
  }, over);
}

/** Bản `AboutAppInfo` hợp lệ — dữ liệu tổng hợp, không phải của máy thật. */
function appInfo(over = {}) {
  return Object.assign({
    name: 'EduGame Studio', version: '0.4.0', description: 'Ứng dụng Windows cho giáo viên.',
    author: 'EduGame Studio', license: 'MIT', packaged: true,
    electron: '33.4.11', chrome: '130.0.6723.191', node: '20.18.3',
    platform: 'win32', arch: 'x64', userDataPath: 'C:\\Synthetic\\AppData\\EduGame',
    releasePageUrl: 'https://github.com/vananz123/edu-game-ai/releases'
  }, over);
}

/**
 * Nạp panel thật với `window.eduGame` giả.
 *
 * `escapeHtml` đến từ `renderer/shared.js` — đúng hàm mà trang dùng, nên kiểm tra "chữ
 * của giáo viên không bao giờ là HTML" thử code của app chứ không thử stub. Hai tệp được
 * nạp bằng `<script>` cổ điển, ĐÚNG như index.html: `window.eval` đặt các binding top-level
 * vào scope riêng của lần eval, mà `escapeHtml`/`state` là `const` — panel sẽ không thấy
 * chúng và suite đỏ vì lý do không liên quan gì tới ứng dụng.
 */
function boot(behaviour = {}) {
  const calls = [];
  let pushState = null;
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://app.local/index.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.addEventListener('error', event => calls.push('page-error:' + event.message));
      window.eduGame = {
        // Cú kick `about:open` mặc định trả về ĐÚNG trạng thái mà bài test đã seed: main
        // đọc máy trạng thái ngay trong cú gọi đó, và các bài dưới đây đo phần VẼ của từng
        // trạng thái chứ không đo chuỗi chuyển trạng thái. Bài nào muốn thấy `checking` do
        // kick sinh ra thì khai báo `opened:` rõ ràng.
        openAbout: () => (calls.push('openAbout'), Promise.resolve({ ok: true, state: behaviour.opened !== undefined ? behaviour.opened : (behaviour.state || updateState()) })),
        aboutInfo: () => (calls.push('aboutInfo'), Promise.resolve(behaviour.info === undefined ? appInfo() : behaviour.info)),
        aboutState: () => (calls.push('aboutState'), Promise.resolve(behaviour.state === undefined ? updateState() : behaviour.state)),
        aboutCheck: () => (calls.push('aboutCheck'), Promise.resolve({ ok: true, state: behaviour.next || updateState({ phase: 'checking' }) })),
        aboutDownload: () => (calls.push('aboutDownload'), Promise.resolve({ ok: true, state: behaviour.next || updateState({ phase: 'downloading', newVersion: '0.5.0' }) })),
        aboutInstall: () => (calls.push('aboutInstall'), Promise.resolve({ ok: true, state: behaviour.next || updateState({ phase: 'downloaded', newVersion: '0.5.0' }) })),
        aboutOpenReleases: url => (calls.push('aboutOpenReleases:' + url), Promise.resolve({ ok: true })),
        onAboutState: callback => { pushState = callback; return () => { pushState = null; }; }
      };
      if (behaviour.noApi) delete window.eduGame;
    }
  });
  const win = dom.window;
  const doc = win.document;
  // Đúng thứ tự index.html: shared.js trước, panel sau — hai `<script>` cổ điển chia nhau
  // global lexical scope, nên `escapeHtml` và `state` panel đọc được như ngoài đời.
  for (const source of [fs.readFileSync(SHARED_JS, 'utf8'), panelSource]) {
    const tag = doc.createElement('script');
    tag.textContent = source;
    doc.head.appendChild(tag);
  }
  if (behaviour.mount !== false) {
    // Controller dựng trang Cài đặt, sau đó `wire()` gọi `wireAboutPanel()`. Panel ẩn
    // (tab khác đang mở) cho tới khi test yêu cầu hiện.
    doc.body.innerHTML = '<div id="pageContent"><section id="settingsPanel-about" data-settings-panel="about"'
      + (behaviour.visible ? '' : ' class="hidden"') + '><span data-about-tab-chip></span>'
      + win.aboutPanelHtml() + '</section></div>';
    win.wireAboutPanel();
  }
  const id = name => doc.getElementById(name);
  const hidden = name => id(name).classList.contains('hidden');
  return {
    dom, win, doc, calls, id, hidden,
    /** Main đẩy một trạng thái mới qua `about:state-push`. */
    push: next => { if (pushState) pushState(next); },
    show: () => { id('settingsPanel-about').classList.remove('hidden'); win.wireAboutPanel(); },
    /** jsdom cần vài vòng Promise để thông tin kịp vẽ. */
    flush: async () => { for (let i = 0; i < 4; i += 1) await new Promise(resolve => setTimeout(resolve, 0)); }
  };
}

let passed = 0;
async function it(name, fn) {
  await fn();
  passed += 1;
  console.log(`ok   ${name}`);
}

(async () => {
  // --- panel mount và tự nạp thông tin -----------------------------------
  await it('the panel boots by asking main for info and the current state', async () => {
    const page = boot({ visible: true, state: updateState({ phase: 'up-to-date', lastCheckedAt: Date.now() }) });
    await page.flush();
    assert.ok(page.calls.includes('aboutInfo'), 'aboutInfo was never called');
    assert.ok(page.calls.includes('aboutState'), 'aboutState was never called');
    assert.equal(page.id('aboutVersion').textContent, 'Phiên bản 0.4.0');
    assert.equal(page.id('aboutAppName').textContent, 'EduGame Studio');
    assert.equal(page.id('aboutDescription').textContent, 'Ứng dụng Windows cho giáo viên.');
    assert.equal(page.id('factVersion').textContent, '0.4.0');
    assert.equal(page.id('factLicense').textContent, 'MIT');
    assert.match(page.id('factPackaged').textContent, /Bộ cài trên máy/);
    assert.equal(page.id('factUserData').textContent, 'C:\\Synthetic\\AppData\\EduGame');
    assert.equal(page.calls.filter(call => String(call).startsWith('page-error')).length, 0, 'the panel threw');
  });

  await it('a development build says so instead of pretending it can update', async () => {
    const page = boot({ visible: true, info: appInfo({ packaged: false }) });
    await page.flush();
    assert.match(page.id('factPackaged').textContent, /không tự cập nhật được/);
  });

  await it('the panel is markup, not a document: no html/head/script/CSP inside', () => {
    const html = panelSource.match(/function aboutPanelHtml\(\)[\s\S]*?\n}/)[0];
    for (const banned of ['<html', '<head', '<body', '<script', '<meta', 'window.addEventListener', 'document.title']) {
      assert.ok(!html.includes(banned), `aboutPanelHtml() must not emit ${banned}`);
    }
  });

  await it('mounting nothing is safe: wireAboutPanel bails instead of throwing', () => {
    const page = boot({ mount: false });
    assert.equal(page.id('settingsPanel-about'), null);
    page.win.wireAboutPanel();
    assert.equal(page.calls.filter(call => String(call).startsWith('page-error')).length, 0);
  });

  // --- luật "một lần mỗi phiên" -------------------------------------------
  await it('a hidden panel does not ask the feed, opening it does — exactly once', async () => {
    const page = boot({ state: updateState() });
    await page.flush();
    assert.equal(page.calls.filter(call => call === 'openAbout').length, 0, 'hidden must stay silent');
    page.show();
    await page.flush();
    assert.equal(page.calls.filter(call => call === 'openAbout').length, 1);
    // Bấm qua bấm lại tab không được thành nhiều request ra ngoài.
    page.show();
    page.win.wireAboutPanel();
    page.win.wireAboutPanel();
    await page.flush();
    assert.equal(page.calls.filter(call => call === 'openAbout').length, 1, 'about:open is once per session');
  });

  await it('a panel without the bridge never sends anything and never throws', async () => {
    const page = boot({ noApi: true, visible: true });
    await page.flush();
    assert.equal(page.calls.filter(call => call === 'openAbout').length, 0);
    assert.equal(page.calls.filter(call => String(call).startsWith('page-error')).length, 0);
  });

  // --- từng trạng thái vẽ đúng một --------------------------------------
  await it('idle invites the teacher to press the button', async () => {
    const page = boot({ visible: true });
    await page.flush();
    assert.equal(page.id('aboutStatusText').textContent, 'Chưa kiểm tra cập nhật');
    assert.match(page.id('aboutStatusNote').textContent, /Bấm “Kiểm tra cập nhật”/);
    assert.equal(page.id('aboutCheckBtn').disabled, false);
    assert.equal(page.hidden('aboutUpdateCard'), true, 'no update card before a check');
    assert.equal(page.hidden('aboutErrorCard'), true);
    assert.equal(page.hidden('aboutStatusSpinner'), true, 'no spinner while nothing waits');
  });

  await it('checking disables the button and labels it in the present tense', async () => {
    const page = boot({ visible: true, state: updateState({ phase: 'checking' }) });
    await page.flush();
    assert.equal(page.id('aboutStatusText').textContent, 'Đang kiểm tra…');
    assert.equal(page.id('aboutCheckLabel').textContent, 'Đang kiểm tra…');
    assert.equal(page.id('aboutCheckBtn').disabled, true, 'two checks must not stack up');
    assert.equal(page.id('aboutCheckBtn').getAttribute('aria-busy'), 'true');
    assert.equal(page.hidden('aboutStatusSpinner'), false, 'the spinner only runs while waiting');
    assert.equal(page.id('aboutStatusBadge').getAttribute('data-tone'), 'checking');
  });

  await it('up-to-date shows the running version and hides the update card', async () => {
    const page = boot({ visible: true, state: updateState({ phase: 'up-to-date', lastCheckedAt: new Date(2026, 10, 4, 9, 5).getTime() }) });
    await page.flush();
    assert.equal(page.id('aboutStatusText').textContent, 'Ứng dụng đã mới nhất');
    assert.equal(page.id('aboutStatusBadge').getAttribute('data-tone'), 'ok');
    assert.match(page.id('aboutStatusNote').textContent, /Bản 0\.4\.0 là bản mới nhất/);
    assert.match(page.id('aboutStatusNote').textContent, /09:05/, 'the check time reassures the teacher it just ran');
    assert.equal(page.hidden('aboutUpdateCard'), true);
    assert.equal(page.id('aboutDownloadBtn').disabled, true);
    assert.equal(page.hidden('aboutInstallBtn'), true);
  });

  await it('available opens the update card but downloads nothing on its own', async () => {
    const page = boot({ visible: true, state: updateState({ phase: 'available', newVersion: '0.5.0' }) });
    await page.flush();
    assert.equal(page.hidden('aboutUpdateCard'), false);
    assert.equal(page.id('aboutUpdateTitle').textContent, 'Có bản cập nhật mới');
    assert.equal(page.id('aboutStatusText').textContent, 'Có bản mới 0.5.0');
    assert.match(page.id('aboutUpdateDiff').textContent, /0\.5\.0/);
    assert.match(page.id('aboutUpdateDiff').textContent, /0\.4\.0/);
    assert.equal(page.id('aboutDownloadBtn').disabled, false);
    assert.equal(page.hidden('aboutProgressTrack'), true, 'no bar before the teacher presses anything');
    assert.match(page.id('aboutStatusNote').textContent, /Sẽ tải về khi bạn bấm nút/);
  });

  await it('downloading paints the bar, the percent and the ETA', async () => {
    const page = boot({
      visible: true,
      state: updateState({
        phase: 'downloading', newVersion: '0.5.0', progressPercent: 45,
        transferredBytes: 4_500_000, totalBytes: 10_000_000, bytesPerSecond: 100_000
      })
    });
    await page.flush();
    assert.equal(page.id('aboutStatusText').textContent, 'Đang tải 0.5.0…');
    assert.equal(page.hidden('aboutProgressTrack'), false);
    assert.equal(page.id('aboutProgressFill').style.width, '45%');
    assert.equal(page.id('aboutProgressFill').getAttribute('aria-valuenow'), '45');
    assert.match(page.id('aboutProgressText').textContent, /^45% · /);
    assert.match(page.id('aboutProgressText').textContent, /~55 giây nữa/);
    // `aboutBytes` chia theo 1024: 4 500 000 byte là 4,3 MB chứ không phải 4,5 MB. Điều bài
    // này chốt là bộ đếm MB và dấu phẩy kiểu Việt, không phải một bộ đếm GB/MB rời rạc.
    assert.match(page.id('aboutProgressText').textContent, /4,3 MB \/ 9,5 MB/, 'a few-MB installer must not read as 0 GB');
    assert.equal(page.id('aboutDownloadBtn').textContent, 'Đang tải…');
    assert.equal(page.id('aboutDownloadBtn').disabled, true);
    assert.equal(page.id('aboutCheckBtn').disabled, true);
    assert.equal(page.hidden('aboutStatusSpinner'), false, 'the bar is not the only busy cue');
    // Mạng nhanh thì hứa "vài giây", không hứa một con số sẽ nhảy liên tục.
    page.push(updateState({ phase: 'downloading', newVersion: '0.5.0', progressPercent: 90, transferredBytes: 9_000_000, totalBytes: 10_000_000, bytesPerSecond: 2_000_000 }));
    assert.match(page.id('aboutProgressText').textContent, /vài giây nữa/);
  });

  await it('downloaded swaps the call to action for the installer', async () => {
    const page = boot({ visible: true, state: updateState({ phase: 'downloaded', newVersion: '0.5.0', totalBytes: 10_000_000, progressPercent: 100 }) });
    await page.flush();
    assert.equal(page.id('aboutStatusText').textContent, 'Cập nhật 0.5.0 sẵn sàng!');
    assert.equal(page.id('aboutUpdateTitle').textContent, 'Cập nhật sẵn sàng!');
    assert.equal(page.hidden('aboutInstallBtn'), false, 'the install button must appear');
    assert.equal(page.id('aboutInstallBtn').disabled, false);
    assert.equal(page.id('aboutDownloadBtn').disabled, true, 'and re-downloading is off');
    assert.equal(page.hidden('aboutStatusSpinner'), true, 'nothing is in flight any more');
    assert.match(page.id('aboutProgressText').textContent, /100% · .*đã tải xong/);
    assert.match(page.id('aboutStatusNote').textContent, /Bộ cài đã nằm trên máy bạn/);
  });

  await it('every phase paints exactly one of the five badge tones', async () => {
    const expected = {
      idle: 'idle', checking: 'checking', 'up-to-date': 'ok', available: 'new',
      downloading: 'checking', downloaded: 'ok', error: 'error'
    };
    for (const [phase, tone] of Object.entries(expected)) {
      const page = boot({ visible: true, state: updateState({ phase, newVersion: '0.5.0', errorKind: 'offline' }) });
      await page.flush();
      assert.equal(page.id('aboutStatusBadge').getAttribute('data-tone'), tone, `${phase} tone`);
      const classes = [...page.id('aboutStatusBadge').classList];
      // Đếm lớp MÀU (text-[#…]), không đếm mọi text-[…] : badge còn text-[13px] là cỡ
      // chữ, và một bộ lọc rộng sẽ tố nhầm cỡ chữ thành "mực thứ hai".
      assert.equal(classes.filter(name => name.startsWith('bg-[#')).length, 1, `${phase} leaves one background`);
      assert.equal(classes.filter(name => name.startsWith('text-[#')).length, 1, `${phase} leaves one ink`);
      assert.equal(classes.filter(name => name.startsWith('dark:bg-[#')).length, 1, `${phase} leaves one dark background`);
      assert.equal(classes.filter(name => name.startsWith('dark:text-[#')).length, 1, `${phase} leaves one dark ink`);
    }
  });

  // --- chip của nhãn tab --------------------------------------------------
  await it('the tab chip only speaks when there is something to say', async () => {
    const quiet = boot({ visible: true, state: updateState({ phase: 'up-to-date' }) });
    await quiet.flush();
    assert.equal(quiet.id('settingsPanel-about').querySelector('[data-about-tab-chip]').innerHTML, '');
    assert.equal(quiet.win.aboutTabChip(), null);

    const fresh = boot({ visible: true, state: updateState({ phase: 'available', newVersion: '0.5.0' }) });
    await fresh.flush();
    const chip = fresh.id('settingsPanel-about').querySelector('[data-about-tab-chip]').textContent;
    assert.match(chip, /0\.5\.0/, 'the chip names the version');
    assert.equal(fresh.win.aboutTabChip().ok, false, 'an available build reads amber, not green');
    assert.equal(fresh.id('aboutStatusBadge').getAttribute('data-tone'), 'new');

    const ready = boot({ visible: true, state: updateState({ phase: 'downloaded', newVersion: '0.5.0' }) });
    await ready.flush();
    assert.match(ready.id('settingsPanel-about').querySelector('[data-about-tab-chip]').textContent, /Cài được/);
    assert.equal(ready.win.aboutTabChip().ok, true);
  });

  await it('a hostile version stays out of the tab chip too', async () => {
    const page = boot({ visible: true, state: updateState({ phase: 'available', newVersion: '<img src=x onerror=alert(1)>' }) });
    await page.flush();
    const slot = page.id('settingsPanel-about').querySelector('[data-about-tab-chip]');
    assert.equal(slot.querySelectorAll('img').length, 0, 'markup in a version must not create elements');
    assert.match(slot.textContent, /<img src=x onerror=alert\(1\)>/);
  });

  // --- từng loại lỗi một câu tiếng Việt riêng ---------------------------
  const errorTitles = {
    signature: 'Bản cập nhật không hợp lệ',
    install: 'Không cài được bản cập nhật'
  };
  await it('every error kind has its own Vietnamese sentence', async () => {
    const kinds = ['dev-mode', 'offline', 'feed', 'signature', 'cancelled', 'install', 'unknown'];
    const seen = new Set();
    for (const kind of kinds) {
      const page = boot({ visible: true, state: updateState({ phase: 'error', errorKind: kind, errorMessage: 'synthetic detail' }) });
      await page.flush();
      const text = page.id('aboutErrorText').textContent;
      assert.ok(text.length > 40, `${kind} has no message`);
      assert.notEqual(seen.has(text), true, `${kind} reuses another kind's sentence`);
      seen.add(text);
      assert.equal(page.hidden('aboutErrorCard'), false);
      assert.match(page.id('aboutErrorDetail').textContent, /synthetic detail/);
      assert.equal(page.id('aboutRetryBtn').disabled, false, 'an error always allows a retry');
      assert.equal(page.id('aboutCheckBtn').disabled, false);
      if (errorTitles[kind]) assert.equal(page.id('aboutErrorTitle').textContent, errorTitles[kind]);
    }
    assert.equal(seen.size, kinds.length, 'all seven kinds differ');
  });

  await it('an unclassified error still says something useful', async () => {
    const page = boot({ visible: true, state: updateState({ phase: 'error', errorKind: 'from-a-newer-electron', errorMessage: '???' }) });
    await page.flush();
    assert.equal(page.id('aboutErrorText').textContent.length > 40, true);
    assert.match(page.id('aboutErrorText').textContent, /lỗi/i);
  });

  await it('dev-mode points at the release page instead of leaving the teacher stuck', async () => {
    const page = boot({ visible: true, state: updateState({ phase: 'error', errorKind: 'dev-mode' }) });
    await page.flush();
    assert.match(page.id('aboutErrorText').textContent, /bộ cài đặt/);
    assert.equal(page.id('aboutErrorReleasesLink').getAttribute('href'), 'https://github.com/vananz123/edu-game-ai/releases');
  });

  // --- chữ của giáo viên không bao giờ là HTML --------------------------
  await it('a hostile version string is escaped, never injected', async () => {
    const page = boot({ visible: true, state: updateState({ phase: 'available', newVersion: '<img src=x onerror=alert(1)>' }) });
    await page.flush();
    assert.equal(page.doc.querySelectorAll('#aboutUpdateDiff img').length, 0, 'markup in a version must not create elements');
    assert.match(page.id('aboutUpdateDiff').textContent, /<img src=x onerror=alert\(1\)>/);
  });

  await it('a malformed info object cannot take the page down', async () => {
    const page = boot({ visible: true, info: { name: '', version: null } });
    await page.flush();
    assert.equal(page.id('aboutVersion').textContent, 'Phiên bản —');
    assert.equal(page.id('aboutAuthor').textContent, '');
    assert.equal(page.id('factElectron').textContent, '—');
    assert.ok(page.calls.filter(call => String(call).startsWith('page-error')).length === 0, 'the page threw');
  });

  await it('garbage percents are clamped instead of drawn off-screen', async () => {
    const page = boot({ visible: true, state: updateState({ phase: 'downloading', newVersion: '0.5.0', progressPercent: 137 }) });
    await page.flush();
    assert.equal(page.id('aboutProgressFill').style.width, '100%');
    assert.equal(page.id('aboutProgressFill').getAttribute('aria-valuenow'), '100');
  });

  // --- nút bấm gọi đúng IPC ----------------------------------------------
  await it('the check button calls about:check and paints what comes back', async () => {
    const page = boot({ visible: true, next: updateState({ phase: 'available', newVersion: '0.5.0' }) });
    await page.flush();
    page.id('aboutCheckBtn').click();
    await page.flush();
    assert.ok(page.calls.includes('aboutCheck'));
    assert.equal(page.hidden('aboutUpdateCard'), false, 'the answer must show up without a reload');
  });

  await it('retry on the error card re-checks', async () => {
    const page = boot({ visible: true, state: updateState({ phase: 'error', errorKind: 'offline' }) });
    await page.flush();
    page.id('aboutRetryBtn').click();
    await page.flush();
    assert.ok(page.calls.includes('aboutCheck'));
    assert.equal(page.id('aboutStatusText').textContent, 'Đang kiểm tra…');
  });

  await it('download and install call the updater, and install locks itself', async () => {
    const page = boot({ visible: true, state: updateState({ phase: 'available', newVersion: '0.5.0' }) });
    await page.flush();
    page.id('aboutDownloadBtn').click();
    await page.flush();
    assert.ok(page.calls.includes('aboutDownload'));
    page.push(updateState({ phase: 'downloaded', newVersion: '0.5.0' }));
    page.id('aboutInstallBtn').click();
    await page.flush();
    assert.ok(page.calls.includes('aboutInstall'));
    assert.equal(page.id('aboutInstallBtn').disabled, true, 'a double click must not open two wizards');
    assert.match(page.id('aboutInstallBtn').textContent, /đang khởi động/i);
    page.id('aboutInstallBtn').click();
    assert.equal(page.calls.filter(call => call === 'aboutInstall').length, 1, 'the second press never reaches main');
  });

  await it('the release link opens the browser through main, not a navigation', async () => {
    const page = boot({ visible: true, state: updateState({ phase: 'error', errorKind: 'feed' }) });
    await page.flush();
    page.id('aboutErrorReleasesLink').click();
    await page.flush();
    assert.ok(page.calls.includes('aboutOpenReleases:https://github.com/vananz123/edu-game-ai/releases'));
    assert.ok(page.dom.window.location.href.startsWith('http://app.local/'), 'the window must not navigate away');
  });

  await it('main pushing a state repaints the panel', async () => {
    const page = boot({ visible: true });
    await page.flush();
    assert.equal(page.id('aboutStatusText').textContent, 'Chưa kiểm tra cập nhật');
    page.push(updateState({ phase: 'available', newVersion: '0.5.0' }));
    assert.equal(page.id('aboutStatusText').textContent, 'Có bản mới 0.5.0');
    page.push(updateState({ phase: 'downloaded', newVersion: '0.5.0' }));
    assert.equal(page.id('aboutStatusText').textContent, 'Cập nhật 0.5.0 sẵn sàng!');
    assert.equal(page.hidden('aboutInstallBtn'), false);
  });

  await it('a panel without window.eduGame still renders, and a press says so', async () => {
    const page = boot({ noApi: true, visible: true });
    await page.flush();
    // Nhãn "Đang tải thông tin…" chỉ là vỏ tĩnh trước lần vẽ đầu. Không có bridge thì
    // không gì đến được máy trạng thái, nên panel vẽ đúng nhãn trung tính của `idle` —
    // thành thật hơn là để mãi một dòng "đang tải" sẽ không bao giờ xong.
    assert.equal(page.id('aboutStatusText').textContent, 'Chưa kiểm tra cập nhật', 'a dead bridge must not leave the shell pretending to load');
    assert.equal(page.hidden('aboutStatusSpinner'), true, 'and it must not spin');
    assert.equal(page.hidden('aboutErrorCard'), true, 'nothing is broken until the teacher presses');
    page.id('aboutCheckBtn').click();
    await page.flush();
    assert.equal(page.hidden('aboutErrorCard'), false, 'a dead bridge must answer, not sit silent');
    assert.match(page.id('aboutErrorText').textContent, /Có lỗi khi kiểm tra/);
    assert.equal(page.id('aboutRetryBtn').disabled, false);
    assert.ok(page.calls.filter(call => String(call).startsWith('page-error')).length === 0, 'the page threw');
  });

  await it('a rejected IPC call surfaces instead of freezing the screen', async () => {
    const page = boot({ visible: true, state: updateState({ phase: 'available', newVersion: '0.5.0' }) });
    await page.flush();
    page.win.eduGame.aboutCheck = () => Promise.reject(new Error('No handler registered for about:check'));
    page.id('aboutCheckBtn').click();
    await page.flush();
    assert.equal(page.hidden('aboutErrorCard'), false);
    assert.match(page.id('aboutErrorDetail').textContent, /No handler registered/);
    // Luật 6: đã tải xong thì lỗi của một lần bấm sau không được lấy đi quyền cài.
    const ready = boot({ visible: true, state: updateState({ phase: 'downloaded', newVersion: '0.5.0' }) });
    await ready.flush();
    ready.win.eduGame.aboutCheck = () => Promise.reject(new Error('feed went away'));
    ready.id('aboutCheckBtn').click();
    await ready.flush();
    assert.equal(ready.id('aboutStatusText').textContent, 'Cập nhật 0.5.0 sẵn sàng!');
    assert.equal(ready.id('aboutInstallBtn').disabled, false, 'the installer is still on disk');
  });

  // --- chữ nghĩa / accessibility ----------------------------------------
  await it('the fine print promises the two things teachers worry about', async () => {
    const page = boot({ visible: true });
    await page.flush();
    const foot = page.id('aboutFoot').textContent;
    assert.match(foot, /chỉ tải về khi bạn bấm nút/);
    assert.match(foot, /vẫn chơi được offline|không cần internet|offline/i);
  });

  await it('live regions and roles are in place for a screen reader', async () => {
    const page = boot({ visible: true });
    await page.flush();
    assert.equal(page.id('aboutStatusBadge').getAttribute('aria-live'), 'polite');
    assert.equal(page.id('aboutProgressFill').getAttribute('role'), 'progressbar');
    assert.equal(page.id('aboutProgressFill').getAttribute('aria-valuemax'), '100');
    assert.equal(page.id('aboutErrorCard').getAttribute('aria-live'), 'polite');
  });

  await it('nothing user-facing is left in English or as a placeholder', async () => {
    const page = boot({ visible: true });
    await page.flush();
    const texts = ['aboutStatusText', 'aboutStatusNote', 'aboutUpdateTitle', 'aboutDownloadBtn', 'aboutInstallBtn', 'aboutErrorTitle', 'aboutRetryBtn']
      .map(name => page.id(name).textContent.replace(/\s+/g, ' ').trim());
    for (const text of texts) {
      assert.ok(text.length > 0, 'empty label');
      assert.doesNotMatch(text, /TODO|placeholder|lorem/i);
      assert.doesNotMatch(text, /\b(click|download|update|checking)\b/i, `English leaked: ${text}`);
    }
  });

  await it('the panel invents no colour: every hex it paints is one Cài đặt already uses', () => {
    const settings = fs.readFileSync(path.join(DIST, 'renderer', 'pages', 'settings.js'), 'utf8');
    const styles = ['components', 'shell', 'base'].map(name => {
      const file = path.join(DIST, 'renderer', 'styles', name + '.css');
      return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    }).join(' ');
    const palette = (settings + styles).toLowerCase();
    // #202: một khối nền sáng giữ nguyên mực của trang cũ là "đảo màu". Trang Giới thiệu
    // cũ (#188) có bảng màu riêng; panel này phải dùng lại đúng bộ của Cài đặt.
    for (const hex of new Set(panelSource.toLowerCase().match(/#[0-9a-f]{6}/g) || [])) {
      assert.ok(palette.includes(hex), `${hex} is used by the panel but by nothing else in the app`);
    }
  });

  console.log(`about-page: ${passed} checks passed`);
})().catch(error => {
  console.error('about-page FAILED: ' + (error && error.stack || error));
  process.exit(1);
});
