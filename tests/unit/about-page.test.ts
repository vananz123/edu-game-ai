// @ts-nocheck -- unit tests share one global script scope (moduleDetection: legacy), as the other suites do.
// Trang Giới thiệu (#188) — trang thật, nạp trong jsdom, nói chuyện với một `aboutAPI` giả.
//
// Vì sao test ở đây thay vì chỉ nhìn bằng mắt: `about.html` là giao diện của một
// process không có DOM để test, còn quy tắc "nút nào được bấm lúc nào" thì nằm ở
// cả main lẫn trang. Trang chỉ vẽ, nhưng nếu nó vẽ sai (để nút "Tải về" sáng khi
// chưa có bản mới, hay thanh tiến trình tụt lại) thì giáo viên bấm nhầm và mất
// bộ cài đang tải. Ngoài ra toàn bộ chữ tiếng Việt hiện ra ở đây — kể cả các
// nhánh lỗi — chỉ có test này là chạy hết được, vì một máy dev không thể tình cờ
// rơi vào lỗi chữ ký số.
//
// Chạy sau `npm run build`:  node tests/unit/about-page.test.js
// Tự động được `node tests/run-unit.js` nạp như mọi suite khác.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const SOURCE_ROOT = path.basename(ROOT) === 'dist' ? path.join(ROOT, '..') : ROOT;
const PAGE = path.join(SOURCE_ROOT, 'src', 'about', 'about.html');

let JSDOM;
try {
  ({ JSDOM } = require('jsdom'));
} catch (error) {
  console.log('about-page: SKIPPED (jsdom is not installed; run npm install)');
  process.exit(0);
}

const html = fs.readFileSync(PAGE, 'utf8');

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
 * Nạp trang thật với `window.aboutAPI` giả. `beforeParse` là bắt buộc: trang đọc
 * `window.aboutAPI` ngay khi script chạy, nên stub phải có mặt trước khi parse.
 */
function boot(behaviour = {}) {
  const calls = [];
  let pushState = null;
  const dom = new JSDOM(html, {
    url: 'http://about.local/index.html' + (behaviour.dark ? '?theme=dark' : ''),
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.addEventListener('error', event => calls.push('page-error:' + event.message));
      if (behaviour.noApi) return;
      window.aboutAPI = {
        getAppInfo: () => (calls.push('getAppInfo'), Promise.resolve(behaviour.info === undefined ? appInfo() : behaviour.info)),
        getState: () => (calls.push('getState'), Promise.resolve(behaviour.state === undefined ? updateState() : behaviour.state)),
        checkForUpdates: () => (calls.push('checkForUpdates'), Promise.resolve({ ok: true, state: behaviour.next || updateState({ phase: 'checking' }) })),
        startDownload: () => (calls.push('startDownload'), Promise.resolve({ ok: true, state: behaviour.next || updateState({ phase: 'downloading', newVersion: '0.5.0' }) })),
        installAndRestart: () => (calls.push('installAndRestart'), Promise.resolve({ ok: true, state: behaviour.next || updateState({ phase: 'downloaded', newVersion: '0.5.0' }) })),
        openReleases: url => (calls.push('openReleases:' + url), Promise.resolve({ ok: true })),
        onUpdateState: callback => { pushState = callback; return () => { pushState = null; }; },
        onUpdateAvailable: callback => { calls.push('sub:onUpdateAvailable'); return () => callback; },
        onDownloadProgress: () => (calls.push('sub:onDownloadProgress'), () => {}),
        onUpdateDownloaded: () => (calls.push('sub:onUpdateDownloaded'), () => {}),
        onUpdateError: () => (calls.push('sub:onUpdateError'), () => {})
      };
    }
  });
  const doc = dom.window.document;
  const id = name => doc.getElementById(name);
  const hidden = name => id(name).classList.contains('about-hidden');
  return {
    dom, doc, calls, id, hidden,
    /** Main đẩy một trạng thái mới qua `about:state-push`. */
    push: next => { if (pushState) pushState(next); },
    /** jsdom cần vài vòng Promise để `boot()` kịp vẽ. */
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
  // --- trang mở ra và tự nạp thông tin ----------------------------------
  await it('the page boots by asking main for info and the current state', async () => {
    const page = boot({ state: updateState({ phase: 'up-to-date', lastCheckedAt: Date.now() }) });
    await page.flush();
    assert.ok(page.calls.includes('getAppInfo'), 'getAppInfo was never called');
    assert.ok(page.calls.includes('getState'), 'getState was never called');
    assert.equal(page.id('aboutVersion').textContent, 'Phiên bản 0.4.0');
    assert.equal(page.id('aboutAppName').textContent, 'EduGame Studio');
    assert.equal(page.id('aboutDescription').textContent, 'Ứng dụng Windows cho giáo viên.');
    assert.equal(page.id('factVersion').textContent, '0.4.0');
    assert.equal(page.id('factLicense').textContent, 'MIT');
    assert.match(page.id('factPackaged').textContent, /Bộ cài trên máy/);
    assert.equal(page.id('factUserData').textContent, 'C:\\Synthetic\\AppData\\EduGame');
    assert.equal(page.calls.filter(c => c === 'page-error:ReferenceError: aboutAPI is not defined').length, 0);
  });

  await it('a development build says so instead of pretending it can update', async () => {
    const page = boot({ info: appInfo({ packaged: false }) });
    await page.flush();
    assert.match(page.id('factPackaged').textContent, /không tự cập nhật được/);
  });

  await it('the window title follows the app name', async () => {
    const page = boot();
    await page.flush();
    assert.equal(page.doc.title, 'EduGame Studio — Giới thiệu');
  });

  await it('?theme=dark switches the page to the dark palette', async () => {
    assert.equal(boot().doc.documentElement.getAttribute('data-theme'), null, 'light by default');
    assert.equal(boot({ dark: true }).doc.documentElement.getAttribute('data-theme'), 'dark');
  });

  // --- từng trạng thái vẽ đúng một --------------------------------------
  await it('idle invites the teacher to press the button', async () => {
    const page = boot();
    await page.flush();
    assert.equal(page.id('aboutStatusText').textContent, 'Chưa kiểm tra cập nhật');
    assert.match(page.id('aboutStatusNote').textContent, /Bấm “Kiểm tra cập nhật”/);
    assert.equal(page.id('aboutCheckBtn').disabled, false);
    assert.equal(page.hidden('aboutUpdateCard'), true, 'no update card before a check');
    assert.equal(page.hidden('aboutErrorCard'), true);
  });

  await it('checking disables the button and labels it in the present tense', async () => {
    const page = boot({ state: updateState({ phase: 'checking' }) });
    await page.flush();
    assert.equal(page.id('aboutStatusText').textContent, 'Đang kiểm tra…');
    assert.equal(page.id('aboutCheckLabel').textContent, 'Đang kiểm tra…');
    assert.equal(page.id('aboutCheckBtn').disabled, true, 'two checks must not stack up');
    assert.equal(page.id('aboutCheckBtn').getAttribute('aria-busy'), 'true');
    assert.equal(page.id('aboutStatusBadge').classList.contains('about-spin'), true, 'the spinner only runs while waiting');
  });

  await it('up-to-date shows the running version and hides the update card', async () => {
    const page = boot({ state: updateState({ phase: 'up-to-date', lastCheckedAt: new Date(2026, 10, 4, 9, 5).getTime() }) });
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
    const page = boot({ state: updateState({ phase: 'available', newVersion: '0.5.0' }) });
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
    assert.equal(page.id('aboutDownloadBtn').textContent, 'Đang tải…');
    assert.equal(page.id('aboutDownloadBtn').disabled, true);
    assert.equal(page.id('aboutCheckBtn').disabled, true);
    // Mạng nhanh thì hứa "vài giây", không hứa một con số sẽ nhảy liên tục.
    page.push(updateState({ phase: 'downloading', newVersion: '0.5.0', progressPercent: 90, transferredBytes: 9_000_000, totalBytes: 10_000_000, bytesPerSecond: 2_000_000 }));
    assert.match(page.id('aboutProgressText').textContent, /vài giây nữa/);
  });

  await it('downloaded swaps the call to action for the installer', async () => {
    const page = boot({ state: updateState({ phase: 'downloaded', newVersion: '0.5.0', totalBytes: 10_000_000, progressPercent: 100 }) });
    await page.flush();
    assert.equal(page.id('aboutStatusText').textContent, 'Cập nhật 0.5.0 sẵn sàng!');
    assert.equal(page.id('aboutUpdateTitle').textContent, 'Cập nhật sẵn sàng!');
    assert.equal(page.hidden('aboutInstallBtn'), false, 'the install button must appear');
    assert.equal(page.id('aboutInstallBtn').disabled, false);
    assert.equal(page.id('aboutDownloadBtn').disabled, true, 'and re-downloading is off');
    assert.match(page.id('aboutProgressText').textContent, /100% · .*đã tải xong/);
    assert.match(page.id('aboutStatusNote').textContent, /Bộ cài đã nằm trên máy bạn/);
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
      const page = boot({ state: updateState({ phase: 'error', errorKind: kind, errorMessage: 'synthetic detail' }) });
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
    const page = boot({ state: updateState({ phase: 'error', errorKind: 'from-a-newer-electron', errorMessage: '???' }) });
    await page.flush();
    assert.equal(page.id('aboutErrorText').textContent.length > 40, true);
    assert.match(page.id('aboutErrorText').textContent, /lỗi/i);
  });

  await it('dev-mode points at the release page instead of leaving the teacher stuck', async () => {
    const page = boot({ state: updateState({ phase: 'error', errorKind: 'dev-mode' }) });
    await page.flush();
    assert.match(page.id('aboutErrorText').textContent, /bộ cài đặt/);
    assert.equal(page.id('aboutErrorReleasesLink').getAttribute('href'), 'https://github.com/vananz123/edu-game-ai/releases');
  });

  // --- chữ của giáo viên không bao giờ là HTML --------------------------
  await it('a hostile version string is escaped, never injected', async () => {
    const page = boot({ state: updateState({ phase: 'available', newVersion: '<img src=x onerror=alert(1)>' }) });
    await page.flush();
    assert.equal(page.doc.querySelectorAll('#aboutUpdateDiff img').length, 0, 'markup in a version must not create elements');
    assert.match(page.id('aboutUpdateDiff').textContent, /<img src=x onerror=alert\(1\)>/);
  });

  await it('a malformed info object cannot take the page down', async () => {
    const page = boot({ info: { name: '', version: null } });
    await page.flush();
    assert.equal(page.id('aboutVersion').textContent, 'Phiên bản —');
    assert.equal(page.id('aboutAuthor').textContent, '');
    assert.equal(page.id('factElectron').textContent, '—');
    assert.ok(page.calls.filter(call => String(call).startsWith('page-error')).length === 0, 'the page threw');
  });

  await it('garbage percents are clamped instead of drawn off-screen', async () => {
    const page = boot({ state: updateState({ phase: 'downloading', newVersion: '0.5.0', progressPercent: 137 }) });
    await page.flush();
    assert.equal(page.id('aboutProgressFill').style.width, '100%');
    assert.equal(page.id('aboutProgressFill').getAttribute('aria-valuenow'), '100');
  });

  // --- nút bấm gọi đúng IPC ----------------------------------------------
  await it('the check button calls checkForUpdates and paints what comes back', async () => {
    const page = boot({ next: updateState({ phase: 'available', newVersion: '0.5.0' }) });
    await page.flush();
    page.id('aboutCheckBtn').click();
    await page.flush();
    assert.ok(page.calls.includes('checkForUpdates'));
    assert.equal(page.hidden('aboutUpdateCard'), false, 'the answer must show up without a reload');
  });

  await it('retry on the error card re-checks', async () => {
    const page = boot({ state: updateState({ phase: 'error', errorKind: 'offline' }) });
    await page.flush();
    page.id('aboutRetryBtn').click();
    await page.flush();
    assert.ok(page.calls.includes('checkForUpdates'));
    assert.equal(page.id('aboutStatusText').textContent, 'Đang kiểm tra…');
  });

  await it('download and install call the updater, and install locks itself', async () => {
    const page = boot({ state: updateState({ phase: 'available', newVersion: '0.5.0' }) });
    await page.flush();
    page.id('aboutDownloadBtn').click();
    await page.flush();
    assert.ok(page.calls.includes('startDownload'));
    page.push(updateState({ phase: 'downloaded', newVersion: '0.5.0' }));
    page.id('aboutInstallBtn').click();
    await page.flush();
    assert.ok(page.calls.includes('installAndRestart'));
    assert.equal(page.id('aboutInstallBtn').disabled, true, 'a double click must not open two wizards');
    assert.match(page.id('aboutInstallBtn').textContent, /đang khởi động/i);
  });

  await it('the release link opens the browser through main, not a navigation', async () => {
    const page = boot({ state: updateState({ phase: 'error', errorKind: 'feed' }) });
    await page.flush();
    page.id('aboutErrorReleasesLink').click();
    await page.flush();
    assert.ok(page.calls.includes('openReleases:https://github.com/vananz123/edu-game-ai/releases'));
    assert.ok(page.dom.window.location.href.startsWith('http://about.local/'), 'the window must not navigate away');
  });

  await it('main pushing a state repaints the page', async () => {
    const page = boot();
    await page.flush();
    assert.equal(page.id('aboutStatusText').textContent, 'Chưa kiểm tra cập nhật');
    page.push(updateState({ phase: 'available', newVersion: '0.5.0' }));
    assert.equal(page.id('aboutStatusText').textContent, 'Có bản mới 0.5.0');
    page.push(updateState({ phase: 'downloaded', newVersion: '0.5.0' }));
    assert.equal(page.id('aboutStatusText').textContent, 'Cập nhật 0.5.0 sẵn sàng!');
    assert.equal(page.hidden('aboutInstallBtn'), false);
  });

  await it('a page without aboutAPI still renders, and a press says so', async () => {
    const page = boot({ noApi: true });
    await page.flush();
    assert.equal(page.id('aboutStatusText').textContent, 'Đang tải thông tin…', 'the static shell stays honest');
    assert.equal(page.hidden('aboutErrorCard'), true, 'nothing is broken until the teacher presses');
    page.id('aboutCheckBtn').click();
    await page.flush();
    assert.equal(page.hidden('aboutErrorCard'), false, 'a dead bridge must answer, not sit silent');
    assert.match(page.id('aboutErrorText').textContent, /Có lỗi khi kiểm tra/);
    assert.equal(page.id('aboutRetryBtn').disabled, false);
    assert.ok(page.calls.filter(call => String(call).startsWith('page-error')).length === 0, 'the page threw');
  });

  await it('a rejected IPC call surfaces instead of freezing the screen', async () => {
    const page = boot({ state: updateState({ phase: 'available', newVersion: '0.5.0' }) });
    await page.flush();
    page.dom.window.aboutAPI.checkForUpdates = () => Promise.reject(new Error('No handler registered for about:check'));
    page.id('aboutCheckBtn').click();
    await page.flush();
    assert.equal(page.hidden('aboutErrorCard'), false);
    assert.match(page.id('aboutErrorDetail').textContent, /No handler registered/);
    // Luật 6: đã tải xong thì lỗi của một lần bấm sau không được lấy đi quyền cài.
    const ready = boot({ state: updateState({ phase: 'downloaded', newVersion: '0.5.0' }) });
    await ready.flush();
    ready.dom.window.aboutAPI.checkForUpdates = () => Promise.reject(new Error('feed went away'));
    ready.id('aboutCheckBtn').click();
    await ready.flush();
    assert.equal(ready.id('aboutStatusText').textContent, 'Cập nhật 0.5.0 sẵn sàng!');
    assert.equal(ready.id('aboutInstallBtn').disabled, false, 'the installer is still on disk');
  });

  // --- chữ nghĩa / accessibility ----------------------------------------
  await it('the fine print promises the two things teachers worry about', async () => {
    const page = boot();
    await page.flush();
    const foot = page.id('aboutFoot').textContent;
    assert.match(foot, /chỉ tải về khi bạn bấm nút/);
    assert.match(foot, /vẫn chơi được không cần internet|offline/i);
  });

  await it('live regions and roles are in place for a screen reader', async () => {
    const page = boot();
    await page.flush();
    assert.equal(page.id('aboutStatusBadge').getAttribute('aria-live'), 'polite');
    assert.equal(page.id('aboutProgressFill').getAttribute('role'), 'progressbar');
    assert.equal(page.id('aboutProgressFill').getAttribute('aria-valuemax'), '100');
    assert.equal(page.id('aboutErrorCard').getAttribute('aria-live'), 'polite');
  });

  await it('nothing user-facing is left in English or as a placeholder', async () => {
    const page = boot();
    await page.flush();
    const texts = ['aboutStatusText', 'aboutStatusNote', 'aboutUpdateTitle', 'aboutDownloadBtn', 'aboutInstallBtn', 'aboutErrorTitle', 'aboutRetryBtn']
      .map(name => page.id(name).textContent.replace(/\s+/g, ' ').trim());
    for (const text of texts) {
      assert.ok(text.length > 0, 'empty label');
      assert.doesNotMatch(text, /TODO|placeholder|lorem/i);
      assert.doesNotMatch(text, /\b(click|download|update|checking)\b/i, `English leaked: ${text}`);
    }
  });

  await it('the page carries a CSP and no remote resource', () => {
    const meta = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/);
    assert.ok(meta, 'about.html must pin its own CSP');
    assert.match(meta[1], /default-src 'self'/);
    assert.doesNotMatch(html, /https?:\/\/(?!github\.com\/vananz123)[a-z0-9.-]+/i, 'no third-party URL may be loaded');
    assert.doesNotMatch(html, /<script[^>]+src=/i, 'the page loads no external script');
    assert.doesNotMatch(html, /require\(|process\.|nodeIntegration/i, 'the renderer must not reach for Node');
  });

  console.log(`about-page: ${passed} checks passed`);
})().catch(error => {
  console.error('about-page FAILED: ' + (error && error.stack || error));
  process.exit(1);
});
