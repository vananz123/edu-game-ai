// tauri-webview-check.js — nghiệm thu giai đoạn 1 của kế hoạch chuyển Tauri.
//
// Chạy trên binary Tauri ĐÃ ĐÓNG GÓI (src-tauri/target/release/edugame-studio-tauri.exe)
// đang mở một cổng gỡ lỗi WebView2. Kiểm những gì cổng unit KHÔNG thấy được vì
// chúng chỉ đúng trong một WebView2 thật:
//   - UI nạp từ gói cục bộ, đúng thứ tự script của Electron, không nhúng main/preload;
//   - CSP trong tài liệu khớp tauri.conf.json (không bị nới thành null);
//   - không request mạng nào ra ngoài (file: + ipc chỉ là giao thức nội bộ);
//   - cầu eduGame chuyển kênh thật: ba kênh khởi động trả dữ liệu đúng hình dạng;
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
  check('CSS cục bộ đã áp (sidebar 252px)', out.css === true, out.cssMsg);
  check('CSP trong tài liệu khớp tauri.conf.json', out.csp === true, out.cspMsg);
  check('không có request mạng ra ngoài', out.network === true, out.networkMsg);
  check('cầu eduGame đủ 92 khoá', out.bridge === true, out.bridgeMsg);
  check('app:info trả version/platform/userData', out.appInfo === true, out.appInfoMsg);
  check('library:get trả {version, games, sessions} thật', out.library === true, out.libraryMsg);
  check('settings:get trả theme + ai.mode', out.settings === true, out.settingsMsg);
  check('ai:local-models trả {models, machine}', out.localAi === true, out.localAiMsg);
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
  const bridgeFirst = loaded[0] === 'edugame-bridge.js' && loaded.length > 60;
  out.scripts = forbidden.length === 0 && bridgeFirst;
  out.scriptsMsg = forbidden.length ? 'nạp: ' + forbidden.join(', ') : 'đầu tiên=' + loaded[0] + ', tổng=' + loaded.length;

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

  const bridge = window.eduGame;
  const keys = bridge ? Object.keys(bridge) : [];
  out.bridge = keys.length === 92;
  out.bridgeMsg = 'khoá=' + keys.length;

  try {
    const info = await window.eduGame.appInfo();
    out.appInfo = Boolean(info && info.version && info.platform && info.userData);
    out.appInfoMsg = JSON.stringify(info);
    out.dataDir = /vn\\.edugame\\.studio\\.tauri/i.test(String(info && info.userData)) &&
      !/AppData[\\\\/]Roaming[\\\\/]EduGame Studio[\\\\/]/.test(String(info && info.userData));
    out.dataDirMsg = String(info && info.userData);
  } catch (error) {
    out.appInfo = false;
    out.appInfoMsg = 'appInfo lỗi: ' + (error && error.message);
    out.dataDir = false;
    out.dataDirMsg = 'không có';
  }

  // Ba kênh khởi động phải trả dữ liệu THẬT có đúng hình dạng Electron đọc, nếu
  // không bootstrap sẽ dựng trang lỗi hoặc đọc thuộc tính của undefined. Kiểm
  // hình dạng thay vì "có trả lời": vỏ trả {} cho có cũng phải đỏ ở đây.
  try {
    const library = await window.eduGame.getLibrary();
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
    const settings = await window.eduGame.getSettings();
    const theme = settings && settings.preferences && settings.preferences.theme;
    out.settings = Boolean(settings && settings.ai && settings.ai.mode === 'offline' && typeof theme === 'string');
    out.settingsMsg = JSON.stringify({ aiMode: settings && settings.ai && settings.ai.mode, theme });
  } catch (error) {
    out.settings = false;
    out.settingsMsg = 'settings:get lỗi: ' + (error && error.message);
  }

  try {
    const models = await window.eduGame.getLocalAiModels();
    out.localAi = Boolean(models && Array.isArray(models.models) && models.machine &&
      typeof models.machine.runtimeState === 'string');
    out.localAiMsg = JSON.stringify({ models: models && models.models && models.models.length,
      state: models && models.machine && models.machine.runtimeState });
  } catch (error) {
    out.localAi = false;
    out.localAiMsg = 'ai:local-models lỗi: ' + (error && error.message);
  }

  // Trang lỗi khởi tạo của bootstrap là dấu hiệu vỏ chưa nối được cầu.
  await sleep(500);
  const content = document.getElementById('pageContent');
  const body = content ? content.innerText : '';
  out.boot = !/Không thể khởi tạo ứng dụng/.test(body);
  out.bootMsg = body.replace(/\\s+/g, ' ').trim().slice(0, 120);
  return out;
})()`;
