// @ts-nocheck -- unit tests share one global script scope (moduleDetection: legacy), as the other suites do.
// Cài đặt → AI local → "Tùy chọn nâng cao": lựa chọn bộ xử lý phải được GỬI mỗi lần lưu.
//
// Vì sao phải thử bằng jsdom chứ không chỉ nhìn code: `settings:save` gộp `ai` theo kiểu
// "khoá nào gửi thì ghi đè", còn cả tệp cài đặt đi qua JSON.stringify — nên một trường
// `runtimeBackend: undefined` XOÁ lựa chọn đã lưu, trong khi một trường bị bỏ qua (như
// trước đây ở "Kiểm tra kết nối") thì để nguyên lựa chọn cũ. Hai cách sai đều im lặng.
// Giáo viên đã chọn GPU, bấm Kiểm tra kết nối, rồi thấy mọi tác vụ AI lại chạy CPU.
//
// Chạy sau `npm run build`: node tests/unit/settings-runtime-backend.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const DIST = path.join(ROOT, 'dist', 'src');
const SHARED_JS = path.join(DIST, 'renderer', 'shared.js');
const SETTINGS_JS = path.join(DIST, 'renderer', 'features', 'settings.js');

let JSDOM;
try {
  ({ JSDOM } = require('jsdom'));
} catch (error) {
  console.log('settings-runtime-backend: SKIPPED (jsdom is not installed; run npm install)');
  process.exit(0);
}
for (const file of [SHARED_JS, SETTINGS_JS]) {
  assert.ok(fs.existsSync(file), `${file} is missing — run npm run build`);
}

const settingsSource = fs.readFileSync(SETTINGS_JS, 'utf8');
const FACADE_FILES = ['desktop-facade-schema.js', 'desktop-facade.js'];
function readFacade(name) {
  const file = path.join(DIST, 'renderer', 'core', name);
  assert.ok(fs.existsSync(file), `${name} is missing — run npm run build`);
  return fs.readFileSync(file, 'utf8');
}

/** Trang Cài đặt tối thiểu: đúng những id mà `saveSettings`/`testAiProvider` đọc. */
function pageHtml(selectValue) {
  return '<div id="pageContent">'
    + '<input type="checkbox" id="settingLargeText" checked>'
    + '<input type="checkbox" id="settingSound" checked>'
    + '<select id="settingAudience"><option value="teen">teen</option></select>'
    + '<select id="settingTheme"><option value="light">light</option></select>'
    + '<select id="localRuntimeBackendSelect">'
    + ['auto', 'cpu', 'vulkan'].map(value => `<option value="${value}"${value === selectValue ? ' selected' : ''}>${value}</option>`).join('')
    + '</select>'
    + '<div data-ai-provider="gemini"><input data-ai-provider-baseurl="gemini" value="https://synthetic.local/v1">'
    + '<input data-ai-provider-model="gemini" value="test-model">'
    + '<input type="password" data-ai-key-input="gemini" value="">'
    + '<button data-ai-test="gemini">Kiểm tra kết nối</button></div>'
    + '</div>';
}

/**
 * Nạp `settings.js` thật với `window.eduGame` giả. Mỗi cú `saveSettings` được ghi lại
 * nguyên payload (sau JSON.stringify, đúng như IPC) để soát trường được gửi.
 */
function boot(selectValue) {
  const saves = [];
  const dom = new JSDOM(`<!doctype html><html><body>${pageHtml(selectValue)}</body></html>`, {
    url: 'http://app.local/index.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.state = {
        settings: { ai: { mode: 'local', provider: 'gemini', runtimeBackend: 'vulkan', providers: [] }, preferences: { theme: 'light' } },
        page: 'settings',
        draft: null
      };
      // `render()` của controller nằm ngoài phạm vi suite này: mục đích là payload, không phải DOM.
      window.render = () => {};
      window.applyTheme = () => {};
      window.toast = () => {};
      window.__testCalls = {
        saveSettings: payload => { saves.push(JSON.parse(JSON.stringify(payload))); return Promise.resolve({ ok: true, settings: window.state.settings }); },
        getSettings: () => Promise.resolve(window.state.settings),
        testAiProvider: () => Promise.resolve({ durationMs: 1, settings: window.state.settings })
      };
      window.__testAdapter = {
        name: 'test',
        invoke(call, args) {
          const handler = window.__testCalls[call];
          if (typeof handler !== 'function') throw new Error(`unexpected desktop call: ${call}`);
          return Promise.resolve(handler(...args));
        },
        listen() { return () => {}; }
      };
    }
  });
  const doc = dom.window.document;
  // jsdom chạy mỗi thẻ `<script>` bằng `eval` riêng, trong khi ngoài đời mọi tệp
  // renderer chia nhau MỘT phạm vi lệnh — nên façade + shared.js phải nằm chung.
  const head = [...FACADE_FILES.map(readFacade), fs.readFileSync(SHARED_JS, 'utf8')].join('\n');
  const tag = doc.createElement('script');
  tag.textContent = head + '\n' + settingsSource;
  doc.head.appendChild(tag);
  dom.window.eval('desktop.attach(window.__testAdapter);');
  return { dom, win: dom.window, doc, saves };
}

let passed = 0;
async function it(name, fn) {
  await fn();
  passed += 1;
  console.log(`ok   ${name}`);
}

(async () => {
  await it('"Lưu cài đặt" gửi đúng lựa chọn đang hiển thị', async () => {
    const page = boot('vulkan');
    await page.win.saveSettings();
    assert.equal(page.saves.length, 1);
    assert.equal(page.saves[0].ai.runtimeBackend, 'vulkan', 'the saved backend must reach main');
  });

  await it('"Kiểm tra kết nối" không làm mất lựa chọn GPU của giáo viên', async () => {
    const page = boot('vulkan');
    await page.win.testAiProvider('gemini');
    assert.equal(page.saves.length, 1, 'the connection test saves the form once');
    assert.equal(page.saves[0].ai.runtimeBackend, 'vulkan',
      'a connection test used to omit runtimeBackend, which erased a saved GPU choice');
  });

  await it('"Lưu khoá" gửi đúng lựa chọn đang hiển thị', async () => {
    const page = boot('cpu');
    page.doc.querySelector('[data-ai-key-input="gemini"]').value = 'synthetic-key';
    await page.win.saveAiProviderKey('gemini');
    assert.equal(page.saves.length, 1);
    assert.equal(page.saves[0].ai.runtimeBackend, 'cpu');
    assert.equal(page.saves[0].ai.providers.gemini.apiKey, 'synthetic-key', 'the key path still works');
  });

  await it('"Tự động" gửi "auto", không gửi undefined (undefined bị JSON xoá khỏi tệp)', async () => {
    const page = boot('auto');
    await page.win.saveSettings();
    assert.equal(page.saves[0].ai.runtimeBackend, 'auto');
    const page2 = boot('cpu');
    assert.equal(page2.win.readRuntimeBackendSelection(), 'cpu');
    page2.doc.getElementById('localRuntimeBackendSelect').value = 'auto';
    assert.equal(page2.win.readRuntimeBackendSelection(), 'auto');
  });

  await it('không có select trên DOM: vẫn gửi "auto", không gửi undefined', async () => {
    const page = boot('vulkan');
    page.doc.getElementById('localRuntimeBackendSelect').remove();
    assert.equal(page.win.readRuntimeBackendSelection(), 'auto',
      'a missing select must not erase the saved choice with undefined');
    await page.win.saveSettings();
    assert.equal(page.saves[0].ai.runtimeBackend, 'auto');
  });

  console.log(`settings-runtime-backend.test.ts: all ${passed} assertions passed`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
