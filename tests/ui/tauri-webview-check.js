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
//
// Khi `EDUGAME_TAURI_MEMO` có mặt (do `build-tauri-release.js --check` đặt), cổng
// chạy thêm phép lưu thật: ghi trò chơi rồi ghi lại id/createdAt xuống tệp memo
// và THOÁT với mã 0. Pha hai (tham số `--reopen`) so tệp memo với thư viện đọc
// từ đĩa trên tiến trình MỚI, sửa rồi xoá. Tiến trình ứng dụng do script cha
// spawn/kill nên cổng không tự đóng mở nó được — vì vậy mới có hai pha.
const fs = require('node:fs');
const { check, connect, results } = require('../manual/lib/ui-check-lib');

const memoFile = process.env.EDUGAME_TAURI_MEMO;
const reopenPhase = process.argv.includes('--reopen');

(async () => {
  const { evaluate } = await connect();

  // Pha hai: ứng dụng vừa được script cha mở lại trên cùng profile. Không chạy
  // lại các phép đo giao diện — chỉ so dữ liệu trên đĩa.
  if (reopenPhase) {
    const memo = JSON.parse(fs.readFileSync(memoFile, 'utf8'));
    const out = await evaluate(reopenRunner(memo));
    check('mở lại: trò chơi vẫn còn với id + createdAt cũ',
      out.found === true && out.sameCreatedAt === true && out.sameId === true, out.msg);
    check('mở lại: không seed thêm trò chơi mẫu lần hai', out.sampleTwice === false, out.sampleMsg);
    check('sửa giữ id, createdAt và tiêu đề mới đứng đầu', out.editOk === true, out.editMsg);
    check('xoá trò chơi, thư viện về lại như trước khi lưu', out.deleteOk === true, out.deleteMsg);
    check('lưu/xoá lượt chơi qua library:save-session/delete-sessions',
      out.sessionOk === true, out.sessionMsg);
    const failedReopen = results.filter(r => !r.ok).length;
    console.log(`\n${results.length - failedReopen}/${results.length} checks passed`);
    process.exit(failedReopen ? 1 : 0);
  }

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

  if (memoFile) {
    // Ghi thật qua façade rồi để lại memo cho pha hai (tiến trình khác) so.
    const first = await evaluate(saveRunner('Kiểm tra lưu ' + Date.now()));
    check('lưu trò chơi qua library:save-game', first.ok === true, first.msg);
    fs.writeFileSync(memoFile, JSON.stringify({ id: first.gameId, createdAt: first.createdAt, title: first.title }));
  }

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

  // Một kênh có trả lời nhưng chưa port (ví dụ lưu tài liệu giáo án) phải từ
  // chối ĐỌC ĐƯỢC. Câu lỗi đi qua cửa chung nên nó phải nêu tên kênh, không
  // được treo. Giai đoạn 3 đã port nhóm library:*, nên chọn kênh còn trống.
  try {
    await facade.call('saveLessonDocument', { title: 'synthetic' });
    out.unsupported = false;
    out.unsupportedMsg = 'saveLessonDocument lại trả thành công';
  } catch (error) {
    const message = String((error && error.message) || '');
    out.unsupported = Boolean(error && error.code) && /lesson:save-document/.test(message);
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

// Trò chơi hợp lệ tối giản, cùng hình dạng mà test Rust `library.rs` dùng:
// bốn bộ kiểm của `library-ops.ts` phải nhận thì mới đo được đường lưu thật.
// Dựng bằng `JSON.stringify` thay vì viết thẳng trong template để không phải
// nhân đôi dấu `\\` trong chuỗi lồng.
function scenario(title) {
  return {
    title,
    template: 'scenario',
    questions: [{
      id: 'q1',
      type: 'scenario',
      prompt: 'Đèn đỏ thì dừng?',
      options: [{ id: 'a', text: 'Đi tiếp' }, { id: 'b', text: 'Dừng lại' }],
      correctOptionId: 'b',
      explanation: 'Dừng trước vạch.',
    }],
  };
}

/**
 * Lượt một: ghi qua ĐÚNG cửa renderer (`desktop.call` → adapter Tauri →
 * `invoke_channel`), rồi đọc lại để chốt id/createdAt mà lượt mở lại sẽ so.
 */
const saveRunner = (title) => `(async () => {
  const out = {};
  const title = ${JSON.stringify(title)};
  const before = await desktop.call('getLibrary');
  out.title = title;
  try {
    const game = await desktop.call('saveGame', ${JSON.stringify(scenario('__TITLE__')).replace('"__TITLE__"', 'title')});
    const after = await desktop.call('getLibrary');
    out.ok = Boolean(game && game.id && game.createdAt && game.updatedAt) &&
      after.games.length === before.games.length + 1 &&
      after.games.some(g => g.id === game.id);
    out.gameId = game && game.id;
    out.createdAt = game && game.createdAt;
    out.msg = 'id=' + (game && game.id) + ', games ' + before.games.length + '→' + after.games.length;
  } catch (error) {
    out.ok = false;
    out.msg = 'saveGame lỗi: ' + (error && error.code) + ': ' + (error && error.message);
  }
  return out;
})()`;

/**
 * Lượt hai (tiến trình mới, cùng profile): dòng phải còn; sửa giữ id/createdAt;
 * xoá trả thư viện về số trò chơi trước khi lưu; lượt chơi lưu rồi xoá không
 * đụng trò chơi. `memo` do phía Node ghi xuống tệp sau lượt một (sessionStorage
 * không sống qua tiến trình mới).
 */
const reopenRunner = memo => `(async () => {
  const out = {};
  const memo = ${JSON.stringify(memo)};
  const games = async () => (await desktop.call('getLibrary')).games;

  const reopened = await games();
  const mine = reopened.find(g => g.id === memo.id);
  out.found = Boolean(mine);
  out.sameId = Boolean(mine && mine.id === memo.id);
  out.sameCreatedAt = Boolean(mine && mine.createdAt === memo.createdAt);
  out.msg = 'id=' + memo.id + ', thấy=' + out.found + ', createdAt=' + (mine && mine.createdAt);
  const samples = reopened.filter(g => g.id === 'sample-traffic-001').length;
  out.sampleTwice = samples > 1;
  out.sampleMsg = 'trò chơi mẫu: ' + samples;

  try {
    const edited = await desktop.call('saveGame', Object.assign({}, mine, { title: memo.title + ' (sửa)' }));
    const afterEdit = await games();
    out.editOk = edited.id === memo.id && edited.createdAt === memo.createdAt &&
      afterEdit.filter(g => g.id === memo.id).length === 1 &&
      afterEdit[0].id === memo.id && afterEdit[0].title === memo.title + ' (sửa)';
    out.editMsg = 'id=' + edited.id + ', đầu danh sách=' + (afterEdit[0] && afterEdit[0].title);
  } catch (error) {
    out.editOk = false;
    out.editMsg = 'sửa lỗi: ' + (error && error.code) + ': ' + (error && error.message);
  }

  try {
    await desktop.call('saveSession', { gameId: memo.id, score: 70, playerName: 'Bạn A' });
    const withSession = await desktop.call('getLibrary');
    const saved = withSession.sessions.find(s => s.gameId === memo.id);
    const removed = await desktop.call('deleteSessions', [saved && saved.id]);
    const final = await desktop.call('getLibrary');
    out.sessionOk = Boolean(saved && saved.id) && removed.deleted === 1 &&
      !final.sessions.some(s => s.id === saved.id) && final.games.some(g => g.id === memo.id);
    out.sessionMsg = 'phiên=' + (saved && saved.id) + ', xoá=' + (removed && removed.deleted) +
      ', trò chơi còn=' + final.games.length;
  } catch (error) {
    out.sessionOk = false;
    out.sessionMsg = 'phiên lỗi: ' + (error && error.code) + ': ' + (error && error.message);
  }

  try {
    const before = (await games()).length;
    const removed = await desktop.call('deleteGames', [memo.id]);
    const after = await games();
    out.deleteOk = removed.deleted === 1 && after.length === before - 1 && !after.some(g => g.id === memo.id);
    out.deleteMsg = 'trước=' + before + ', sau=' + after.length + ', xoá=' + removed.deleted;
  } catch (error) {
    out.deleteOk = false;
    out.deleteMsg = 'xoá lỗi: ' + (error && error.code) + ': ' + (error && error.message);
  }
  return out;
})()`;
