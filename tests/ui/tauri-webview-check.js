// tauri-webview-check.js — nghiệm thu vỏ Tauri (giai đoạn 1 + 2) trên binary THẬT.
//
// Chạy trên binary Tauri ĐÃ ĐÓNG GÓI (src-tauri/target/release/edugame-studio-tauri.exe)
// đang mở một cổng gỡ lỗi WebView2. Kiểm những gì cổng unit KHÔNG thấy được vì
// chúng chỉ đúng trong một WebView2 thật:
//   - UI nạp từ gói cục bộ, đúng thứ tự script của Electron, không nhúng main/preload;
//   - cổng chặn `edugame-guard.js` nạp TRƯỚC mọi script renderer, và cầu
//     `window.eduGame` của giai đoạn 1 KHÔNG còn trong gói;
//   - CSP trong tài liệu khớp tauri.conf.json (không bị nới thành null);
//   - không request mạng nào ra ngoài (file: + ipc chỉ là giao thức nội bộ);
//   - façade `desktop.*` nối được adapter Tauri và bốn lời gọi khởi động
//     (`appInfo`, `getLibrary`, `getSettings`, `getLocalAiModels`) đi qua
//     `invoke_channel` trả dữ liệu đúng hình dạng Electron đọc;
//   - lời gọi kênh chưa port vẫn bị từ chối với `not-supported`, không treo;
//   - thư mục dữ liệu nằm dưới định danh Tauri, KHÔNG phải thư mục của Electron.
//
//   node tests/ui/tauri-webview-check.js <port>
const { check, connect, results } = require('../manual/lib/ui-check-lib');

(async () => {
  const { evaluate } = await connect();
  const out = await evaluate(RUNNER);
  if (!out || typeof out !== 'object') throw new Error('runner returned nothing');

  check('trang được nạp từ gói cục bộ (không http)', out.local === true, out.url);
  check('tiêu đề và shell của Electron còn nguyên', out.shell === true, out.shellMsg);
  check('script nạp đúng thứ tự, không có main.js/preload.js', out.scripts === true, out.scriptsMsg);
  check('cổng chặn edugame-guard.js đứng đầu, không còn cầu eduGame', out.guard === true, out.guardMsg);
  check('CSS cục bộ đã áp (sidebar 252px)', out.css === true, out.cssMsg);
  check('CSP trong tài liệu khớp tauri.conf.json', out.csp === true, out.cspMsg);
  check('không có request mạng ra ngoài', out.network === true, out.networkMsg);
  check('façade nối adapter Tauri (desktop.info().adapter)', out.facade === true, out.facadeMsg);
  check('appInfo trả version/platform/userData qua invoke_channel', out.appInfo === true, out.appInfoMsg);
  check('getLibrary trả {version, games, sessions} thật', out.library === true, out.libraryMsg);
  check('getSettings trả theme + ai.mode', out.settings === true, out.settingsMsg);
  check('getLocalAiModels trả {models, machine}', out.localAi === true, out.localAiMsg);
  check('kênh chưa port bị từ chối not-supported (không treo)', out.unsupported === true, out.unsupportedMsg);
  check('lỗi khởi động không che UI (không có trang lỗi nào)', out.boot === true, out.bootMsg);
  check('thư mục dữ liệu dưới vn.edugame.studio.tauri', out.dataDir === true, out.dataDirMsg);

  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(error => {
  console.error('tauri-webview-check failed to run:', error && error.message);
  process.exit(1);
});

const RUNNER = `(async () => {
  const out = {};
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // Bộ đếm mạng phải bật TRƯỚC khi đọc mạng — nhưng trang đã nạp xong. Nên đo
  // bằng Performance API: liệt kê tài nguyên đã tải, cộng thêm bộ đếm cho lúc chạy.
  const attempts = [];
  // Không dùng regex có \\/ trong chuỗi này: RUNNER là template literal, nên mỗi
  // dấu \\ phải viết đôi. startsWith tránh hẳn cái bẫy đó.
  const isTauriAsset = u => {
    const text = String(u || '');
    return text.startsWith('http://tauri.localhost/') || text === 'http://tauri.localhost';
  };
  // Mọi giao thức mạng khác máy chủ tài nguyên của Tauri đều tính là ra ngoài.
  const isRemote = u => /^(https?|wss?|ftp):/i.test(String(u || '')) && !isTauriAsset(u);
  const origFetch = window.fetch;
  window.fetch = function (input) {
    const u = typeof input === 'string' ? input : (input && input.url);
    if (isRemote(u)) attempts.push('fetch:' + u);
    return origFetch.apply(this, arguments);
  };
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, u) {
    if (isRemote(u)) attempts.push('xhr:' + u);
    return origOpen.apply(this, arguments);
  };

  out.url = location.href;
  // Tauri phục vụ tài nguyên đóng gói qua giao thức riêng http://tauri.localhost/.
  // "Cục bộ" nghĩa là máy chủ đó, không phải một máy chủ từ xa.
  out.local = location.protocol === 'file:' || isTauriAsset(location.href);

  const shell = document.querySelector('.app-shell aside') && document.querySelector('nav [data-page="library"]');
  out.shell = Boolean(shell);
  out.shellMsg = shell ? 'có sidebar + nav' : 'không thấy shell';

  const loaded = [...document.querySelectorAll('script[src]')].map(s => s.getAttribute('src'));
  const forbidden = loaded.filter(src => /(^|\\/)(main|preload)\\.js$/.test(src));
  out.scripts = forbidden.length === 0 && loaded.length > 60;
  out.scriptsMsg = forbidden.length ? 'nạp: ' + forbidden.join(', ') : 'đầu tiên=' + loaded[0] + ', tổng=' + loaded.length;

  // Giai đoạn 2: gói Tauri chỉ có cổng chặn, không dựng lại cầu 92 khoá.
  const guardFirst = loaded[0] === 'edugame-guard.js';
  const bridgeGone = loaded.indexOf('edugame-bridge.js') < 0 && typeof window.eduGame === 'undefined';
  out.guard = guardFirst && bridgeGone;
  out.guardMsg = 'đầu tiên=' + loaded[0] + ', eduGame=' + typeof window.eduGame +
    ', bridge trong danh sách=' + (loaded.indexOf('edugame-bridge.js') >= 0);

  const aside = document.querySelector('.app-shell aside');
  const width = aside ? Math.round(aside.getBoundingClientRect().width) : 0;
  out.css = width === 252;
  out.cssMsg = 'sidebar=' + width + 'px';

  const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
  const policy = meta ? meta.getAttribute('content') : '';
  // Tauri tiêm CSP qua chính sách của nó; nếu policy thật đã nới (thiếu script-src)
  // thì đó là cờ đỏ. So đúng nguyên văn với thứ index.html khai là phép so mạnh nhất.
  out.csp = Boolean(policy) && /script-src 'self'/.test(policy) && !/'unsafe-eval'/.test(policy);
  out.cspMsg = policy ? policy.slice(0, 120) : 'không có CSP';

  const resources = performance.getEntriesByType('resource').map(entry => entry.name);
  const remote = resources.filter(isRemote);
  await sleep(300);
  out.network = remote.length + attempts.length === 0;
  out.networkMsg = 'resources=' + resources.length + ' ngoài=' + [...remote, ...attempts].join(',');

  // Façade phải nối adapter Tauri: thiếu bước này mọi nút trong app trả
  // "not-supported" dù vỏ đã chạy đúng.
  // desktop là const ở phạm vi script cổ điển nên KHÔNG có trên window; đọc thẳng
  // tên trong biểu thức này mới thấy nó (cùng cách renderer gọi).
  let facade = null;
  try { facade = typeof desktop === 'undefined' ? null : desktop; } catch (error) { facade = null; }
  let info = null;
  try { info = facade && facade.info(); } catch (error) { info = { adapter: 'error:' + (error && error.message) }; }
  out.facade = Boolean(info && info.adapter === 'tauri' && info.pendingListeners === 0);
  out.facadeMsg = JSON.stringify(info) + ', typeof desktop=' + (facade ? 'object' : 'undefined');

  // Bốn kênh khởi động đi đúng đường của renderer thật: desktop.call → adapter →
  // invoke('invoke_channel', {channel}). Kiểm hình dạng thay vì "có trả lời": vỏ
  // trả {} cho có cũng phải đỏ ở đây.
  try {
    const appInfo = await facade.call('appInfo');
    out.appInfo = Boolean(appInfo && appInfo.version && appInfo.platform && appInfo.userData);
    out.appInfoMsg = JSON.stringify(appInfo);
    out.dataDir = /vn\\.edugame\\.studio\\.tauri/i.test(String(appInfo && appInfo.userData)) &&
      !/AppData[\\\\/]Roaming[\\\\/]EduGame Studio[\\\\/]/.test(String(appInfo && appInfo.userData));
    out.dataDirMsg = String(appInfo && appInfo.userData);
  } catch (error) {
    out.appInfo = false;
    out.appInfoMsg = 'appInfo lỗi: ' + (error && error.message);
    out.dataDir = false;
    out.dataDirMsg = 'không có';
  }

  try {
    const library = await facade.call('getLibrary');
    out.library = Boolean(library && library.version === 1 &&
      Array.isArray(library.games) && Array.isArray(library.sessions));
    out.libraryMsg = JSON.stringify(library && {
      version: library.version,
      games: Array.isArray(library.games) ? library.games.length : typeof library.games,
      sessions: Array.isArray(library.sessions) ? library.sessions.length : typeof library.sessions,
    });
  } catch (error) {
    out.library = false;
    out.libraryMsg = 'library:get lỗi: ' + (error && error.message);
  }

  try {
    const settings = await facade.call('getSettings');
    const theme = settings && settings.preferences && settings.preferences.theme;
    out.settings = Boolean(settings && settings.ai && settings.ai.mode === 'offline' && typeof theme === 'string');
    out.settingsMsg = JSON.stringify({ aiMode: settings && settings.ai && settings.ai.mode, theme });
  } catch (error) {
    out.settings = false;
    out.settingsMsg = 'settings:get lỗi: ' + (error && error.message);
  }

  try {
    const models = await facade.call('getLocalAiModels');
    out.localAi = Boolean(models && Array.isArray(models.models) && models.machine &&
      typeof models.machine.runtimeState === 'string');
    out.localAiMsg = JSON.stringify({ models: models && models.models && models.models.length,
      state: models && models.machine && models.machine.runtimeState });
  } catch (error) {
    out.localAi = false;
    out.localAiMsg = 'ai:local-models lỗi: ' + (error && error.message);
  }

  // Một kênh có trả lời nhưng chưa port (ví dụ lưu trò chơi) phải từ chối ĐỌC
  // ĐƯỢC. Câu lỗi đi qua cửa chung nên nó phải nêu tên kênh, không được treo.
  try {
    await facade.call('saveGame', { title: 'synthetic' });
    out.unsupported = false;
    out.unsupportedMsg = 'saveGame lại trả thành công';
  } catch (error) {
    const message = String((error && error.message) || '');
    out.unsupported = Boolean(error && error.code) && /library:save-game/.test(message);
    out.unsupportedMsg = (error && error.code) + ': ' + message;
  }

  // Trang lỗi khởi tạo của bootstrap là dấu hiệu vỏ chưa nối được cầu.
  await sleep(500);
  const content = document.getElementById('pageContent');
  const body = content ? content.innerText : '';
  out.boot = !/Không thể khởi tạo ứng dụng/.test(body);
  out.bootMsg = body.replace(/\\s+/g, ' ').trim().slice(0, 120);
  return out;
})()`;
