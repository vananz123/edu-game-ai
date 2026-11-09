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
// chạy thêm phép lưu thật: ghi trò chơi và ba bản nháp dự án rồi ghi lại
// id/createdAt xuống tệp memo và THOÁT với mã 0. Pha hai (tham số `--reopen`) so
// tệp memo với thư viện đọc từ đĩa trên tiến trình MỚI, sửa rồi xoá. Tiến trình
// ứng dụng do script cha spawn/kill nên cổng không tự đóng mở nó được — vì vậy
// mới có hai pha.
const fs = require('node:fs');
const { check, connect, results } = require('../manual/lib/ui-check-lib');

const memoFile = process.env.EDUGAME_TAURI_MEMO;
const reopenPhase = process.argv.includes('--reopen');

/**
 * Bốn đường dẫn của cổng gói `.egame`. Tiến trình cha (`build-tauri-release.js`)
 * ĐẶT BIẾN MÔI TRƯỜNG CỦA CHÍNH NÓ trước khi mở binary — renderer không đặt được
 * biến của tiến trình, nên đường dẫn hộp thoại chỉ có thể đến từ vỏ. Khi chưa có
 * biến, ba phép đo gói bị bỏ qua (cùng cách `EDUGAME_TAURI_MEMO` bật phần lưu).
 */
const packagePaths = {
  save: process.env.EDUGAME_TAURI_PACKAGE_SAVE || '',
  open: process.env.EDUGAME_TAURI_PACKAGE_OPEN || '',
};
const packageGate = Boolean(process.env.EDUGAME_TAURI_PACKAGE_SAVE);

(async () => {
  const { evaluate } = await connect();

  // Pha hai: ứng dụng vừa được script cha mở lại trên cùng profile. Không chạy
  // lại các phép đo giao diện — chỉ so dữ liệu trên đĩa.
  if (reopenPhase) {
    const memo = JSON.parse(fs.readFileSync(memoFile, 'utf8'));
    const out = await evaluate(reopenRunner(memo));
    const projects = memo.projects
      ? await evaluate(reopenProjectRunner(memo.projects))
      : { listOk: false, listMsg: 'memo không có dự án (pha một chưa ghi)' };
    Object.assign(out, projects);
    check('mở lại: trò chơi vẫn còn với id + createdAt cũ',
      out.found === true && out.sameCreatedAt === true && out.sameId === true, out.msg);
    check('mở lại: không seed thêm trò chơi mẫu lần hai', out.sampleTwice === false, out.sampleMsg);
    check('sửa giữ id, createdAt và tiêu đề mới đứng đầu', out.editOk === true, out.editMsg);
    check('xoá trò chơi, thư viện về lại như trước khi lưu', out.deleteOk === true, out.deleteMsg);
    check('lưu/xoá lượt chơi qua library:save-session/delete-sessions',
      out.sessionOk === true, out.sessionMsg);
    check('mở lại: ba bản nháp dự án còn, đúng thứ tự mới-sửa-trước', out.listOk === true, out.listMsg);
    check('dự án: sửa giữ id + createdAt, tiêu đề mới đứng đầu', out.projectEditOk === true, out.projectEditMsg);
    check('dự án: xoá lô trả {ok, deleted, missing} và trần 200', out.projectDeleteOk === true, out.projectDeleteMsg);
    if (memo.package && memo.package.importedId) {
      // Trò chơi nhập từ gói phải NẰM TRÊN ĐĨA: pha một chỉ chứng minh nó lưu
      // được qua cầu, pha hai chứng minh nó sống qua một tiến trình mới và xoá
      // được như mọi dòng khác.
      const pack = await evaluate(reopenPackageRunner(memo.package));
      check('mở lại: trò chơi nhập từ .egame còn với id + câu hỏi cũ, xoá được', pack.ok === true, pack.msg);
    }
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
    // Cổng chạy bằng `--check` LUÔN phải đo gói `.egame`; thiếu biến ở đây là
    // script cha quên truyền, không phải một cấu hình hợp lệ — bỏ qua im lặng
    // thì bốn phép đo gói không bao giờ chạy mà cổng vẫn xanh.
    if (!reopenPhase && !packageGate) {
      console.error('EDUGAME_TAURI_PACKAGE_SAVE thiếu: script cha phải truyền biến cổng gói cho tiến trình kiểm');
      process.exit(1);
    }
    // Ghi thật qua façade rồi để lại memo cho pha hai (tiến trình khác) so.
    const first = await evaluate(saveRunner('Kiểm tra lưu ' + Date.now()));
    check('lưu trò chơi qua library:save-game', first.ok === true, first.msg);
    const projects = await evaluate(projectSaveRunner('Kiểm tra dự án ' + Date.now()));
    check('lưu dự án qua project:save-draft (kiểm dữ liệu + dọn ảnh)', projects.ok === true, projects.msg);
    // Gói `.egame`: xuất tệp thật qua hộp thoại lưu của CỔNG, rồi nhập lại ngay
    // trong tiến trình này (một tệp, hai lượt) — pha hai chỉ đo phần cần tiến
    // trình mới.
    let imported = null;
    if (packageGate) {
      const exported = await evaluate(exportRunner('Gói qua cổng', packagePaths.save));
      check('xuất .egame qua files:export-game (tệp thật + {ok, path})', exported.ok === true, exported.msg);
      const onDisk = fs.existsSync(packagePaths.save);
      check('tệp .egame ghi xuống đĩa đúng hình dạng gói', onDisk && packageShape(fs.readFileSync(packagePaths.save, 'utf8')),
        onDisk ? fs.readFileSync(packagePaths.save, 'utf8').slice(0, 100) : 'không có tệp');
      imported = await evaluate(importRunner('Gói qua cổng'));
      check('nhập lại .egame: trò chơi + ngân hàng câu hỏi còn nguyên, id mới', imported.ok === true, imported.msg);
      const refused = await evaluate(hostileRunner());
      check('gói hỏng/độc hại bị từ chối với câu đọc được, không treo', refused.ok === true, refused.msg);
    }
    fs.writeFileSync(memoFile, JSON.stringify({
      id: first.gameId,
      createdAt: first.createdAt,
      title: first.title,
      projects,
      package: imported ? { path: packagePaths.save, importedId: imported.gameId } : null,
    }));
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
  // ipc.localhost là kênh gọi lệnh của Tauri (plugin:event|listen đi qua đây),
  // vẫn nằm trong máy — cùng loại giao thức nội bộ như tauri.localhost.
  const isIpcChannel = u => {
    const text = String(u || '');
    return text.startsWith('http://ipc.localhost/') || text === 'http://ipc.localhost';
  };
  // Mọi giao thức mạng khác máy chủ tài nguyên/kênh nội bộ của Tauri đều tính là ra ngoài.
  const isRemote = u => /^(https?|wss?|ftp):/i.test(String(u || '')) && !isTauriAsset(u) && !isIpcChannel(u);
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

/** Chữ của một gói `.egame` hợp lệ, đúng envelope `writeGamePackage` ghi. */
function packageShape(text) {
  try {
    const parsed = JSON.parse(text);
    return parsed.packageFormat === 'edugame' && parsed.packageVersion === 1 &&
      Boolean(parsed.game) && typeof parsed.game.title === 'string' &&
      Array.isArray(parsed.game.questions);
  } catch {
    return false;
  }
}

/**
 * Lượt xuất: qua ĐÚNG cửa renderer (`desktop.call('exportGame')` → adapter →
 * `invoke_channel` → `package::export`), hộp thoại lưu bị CỔNG thay bằng đường dẫn
 * trong biến môi trường của tiến trình. Kết quả phải nói đúng tệp đã ghi.
 */
const exportRunner = (title, target) => `(async () => {
  const out = {};
  const title = ${JSON.stringify(title)};
  const target = ${JSON.stringify(target)};
  // Trò chơi xuất đi là một trò CHƯA lưu: bản xuất không cần dòng trong thư viện.
  const game = ${JSON.stringify(scenario('__TITLE__')).replace('"__TITLE__"', 'title')};
  try {
    const result = await desktop.call('exportGame', game);
    out.ok = Boolean(result && result.ok === true && result.path === target);
    out.msg = JSON.stringify(result);
  } catch (error) {
    out.ok = false;
    out.msg = 'exportGame lỗi: ' + (error && error.code) + ': ' + (error && error.message);
  }
  return out;
})()`;

/**
 * Lượt nhập: `desktop.call('importGame')` mở hộp thoại nhập của cổng trên CÙNG
 * tệp vừa ghi, lưu trò chơi trả về, rồi đọc lại từ thư viện. Id phải KHÁC id tác
 * giả nếu gói mang id đã có trong thư viện; ở đây gói không mang id nên trò chơi
 * vẫn nhận id `imported_…` do máy này sinh.
 */
const importRunner = (title) => `(async () => {
  const out = {};
  const title = ${JSON.stringify(title)};
  try {
    const before = (await desktop.call('getLibrary')).games.length;
    // Lượt 1 = đường nhập thật của cổng (tệp vừa xuất); các lượt sau là gói xấu.
    await desktop.gate('setPackageGateTurn', 1);
    const game = await desktop.call('importGame');
    out.title = game && game.title;
    out.gameId = game && game.id;
    const saved = game ? await desktop.call('saveGame', game) : null;
    const after = (await desktop.call('getLibrary')).games;
    out.ok = Boolean(game && saved) &&
      game.title === title &&
      game.template === 'scenario' &&
      Array.isArray(game.questions) && game.questions.length === 1 &&
      game.questions[0].explanation === 'Dừng trước vạch.' &&
      /^imported_/.test(String(game.id)) &&
      after.length === before + 1 && after.some(g => g.id === saved.id) &&
      !('createdAt' in game);
    out.msg = 'id=' + (game && game.id) + ', câu hỏi=' + (game && game.questions && game.questions.length) +
      ', games ' + before + '→' + after.length;
  } catch (error) {
    out.ok = false;
    out.msg = 'importGame lỗi: ' + (error && error.code) + ': ' + (error && error.message);
  }
  return out;
})()`;

/**
 * Ba gói xấu, mỗi gói một đường dẫn mà tiến trình cha đã ghi sẵn: JSON hỏng, gói
 * đúng JSON nhưng thiếu câu hỏi, và tệp lớn hơn trần 20 MB. Cả ba phải ném lỗi
 * ĐỌC ĐƯỢC có mã `EG_…`, không được trả một trò chơi rỗng và không được treo.
 */
const hostileRunner = () => `(async () => {
  const out = { cases: [] };
  // Bộ đếm của cổng đọc lúc gọi. Lượt nhập thật vừa dùng giá trị 1; các lượt sau
  // là 2, 3, 4 (ba gói xấu theo thứ tự JSON hỏng → thiếu câu hỏi → quá 20 MB).
  // Renderer chỉ chọn được SỐ, không chọn được đường dẫn.
  const attempt = async (label, turn) => {
    await desktop.gate('setPackageGateTurn', turn);
    const before = (await desktop.call('getLibrary')).games.length;
    try {
      const game = await desktop.call('importGame');
      out.cases.push(label + ': TRẢ THÀNH CÔNG ' + JSON.stringify(game && game.id));
    } catch (error) {
      const after = (await desktop.call('getLibrary')).games.length;
      // Lỗi của vỏ Tauri tới renderer dưới dạng chuỗi, nên façade gói nó thành
      // 'host-error' với mã 'EG_…' ở ĐẦU message — đúng thứ giáo viên thấy. Cổng
      // đo mã đó ở message, không ở error.code (luôn là 'host-error').
      const message = String((error && error.message) || '');
      const code = (/^EG_[A-Z_]+/.exec(message) || [''])[0];
      if (!code || after !== before) out.cases.push(label + ': sai mã/đã ghi dòng — ' + message.slice(0, 40));
      else out.cases.push(label + ': ' + code + ' | ' + message.slice(0, 80));
    }
  };
  await attempt('JSON hỏng', 2);
  await attempt('thiếu câu hỏi', 3);
  await attempt('quá 20 MB', 4);
  out.ok = out.cases.length === 3 && out.cases.every(line => /^[^:]+: EG_[A-Z_]+ \\| /.test(line));
  out.msg = out.cases.join(' · ');
  return out;
})()`;

/**
 * Pha hai (gói nhập): trò chơi nhập từ `.egame` còn trên đĩa với đúng id và câu
 * hỏi, rồi xoá được như mọi dòng khác.
 */
const reopenPackageRunner = memo => `(async () => {
  const out = {};
  const memo = ${JSON.stringify(memo)};
  const games = async () => (await desktop.call('getLibrary')).games;
  const found = (await games()).find(g => g.id === memo.importedId);
  out.ok = Boolean(found) && found.title === 'Gói qua cổng' &&
    Array.isArray(found.questions) && found.questions.length === 1 &&
    found.questions[0].explanation === 'Dừng trước vạch.';
  if (out.ok) {
    const before = (await games()).length;
    const removed = await desktop.call('deleteGames', [memo.importedId]);
    out.ok = removed.deleted === 1 && (await games()).length === before - 1;
    out.msg = 'id=' + memo.importedId + ', xoá=' + removed.deleted;
  } else {
    out.msg = 'không thấy trò chơi nhập ' + memo.importedId;
  }
  return out;
})()`;

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
 * Bản nháp dự án tối giản — đúng những trường `validateProjectForWrite` bắt,
 * cùng hình dạng fixture `draft()` của `library.rs`. `updatedAt` lùi dần theo
 * `rank` để pha hai đo được `ORDER BY updated_at DESC` (dòng mới sửa đứng đầu).
 */
function projectDraft(id, title, rank) {
  const stamp = `2026-01-0${rank}T00:00:00.000Z`;
  return {
    id,
    schemaVersion: 1,
    status: 'draft',
    step: 'input',
    title,
    description: '',
    tags: [],
    sourceName: '',
    lesson: null,
    analysisId: null,
    recommendationId: null,
    config: null,
    draft: null,
    gameSnapshot: null,
    gameId: null,
    createdAt: stamp,
    updatedAt: stamp,
  };
}

/**
 * Lượt một (dự án): ghi ba bản nháp qua `saveProjectDraft`, kiểm chúng đọc lại
 * được qua `getProject` + `listProjects`, rồi để lại id để pha hai so.
 */
const projectSaveRunner = (title) => `(async () => {
  const out = {};
  const title = ${JSON.stringify(title)};
  const drafts = ${JSON.stringify([
    projectDraft('eg-check-p1', '__T1__', 1),
    projectDraft('eg-check-p2', '__T2__', 2),
    projectDraft('eg-check-p3', '__T3__', 3),
  ])}.map((draft, index) => Object.assign(draft, {
    title: title + ' ' + (index + 1),
    updatedAt: '2026-01-0' + (index + 1) + 'T00:00:00.000Z',
    createdAt: '2026-01-0' + (index + 1) + 'T00:00:00.000Z',
  }));
  try {
    for (const draft of drafts) await desktop.call('saveProjectDraft', draft);
    const listed = await desktop.call('listProjects');
    const ids = listed.map(project => project.id).filter(id => id.indexOf('eg-check-p') === 0);
    const one = await desktop.call('getProject', 'eg-check-p2');
    out.ok = ids.length === 3 && ids[0] === 'eg-check-p3' &&
      Boolean(one && one.id === 'eg-check-p2' && one.status === 'draft' && one.step === 'input');
    out.ids = ids;
    out.createdAt = {};
    for (const draft of drafts) out.createdAt[draft.id] = draft.createdAt;
    out.msg = 'ids=' + ids.join(',') + ', get=' + (one && one.title);
  } catch (error) {
    out.ok = false;
    out.msg = 'saveProjectDraft lỗi: ' + (error && error.code) + ': ' + (error && error.message);
  }
  return out;
})()`;

/**
 * Lượt hai (dự án, tiến trình mới, cùng profile): thứ tự còn đúng; sửa giữ
 * id + createdAt và đẩy dòng lên đầu; lô `delete-many` trả
 * `{ok, deleted, missing}` đúng luật Electron (bỏ id trùng/rỗng, đếm thiếu) và
 * chặn lô rỗng / quá 200 bằng CHÍNH câu của Electron.
 */
const reopenProjectRunner = memo => `(async () => {
  const out = {};
  const memo = ${JSON.stringify(memo)};
  const list = () => desktop.call('listProjects');
  const mine = list => list.filter(project => project.id.indexOf('eg-check-p') === 0);

  try {
    const reopened = mine(await list());
    out.listOk = reopened.length === 3 &&
      reopened.map(project => project.id).join(',') === memo.ids.join(',') &&
      reopened.every(project => project.createdAt === memo.createdAt[project.id]);
    out.listMsg = 'ids=' + reopened.map(project => project.id).join(',') +
      ', createdAt=' + reopened.map(project => project.createdAt).join('|');
  } catch (error) {
    out.listOk = false;
    out.listMsg = 'listProjects lỗi: ' + error.message;
  }

  try {
    const old = await desktop.call('getProject', 'eg-check-p1');
    const edited = await desktop.call('saveProjectDraft', Object.assign({}, old, {
      title: old.title + ' (sửa)',
      updatedAt: '2026-02-01T00:00:00.000Z',
    }));
    const after = mine(await list());
    out.projectEditOk = edited.id === 'eg-check-p1' &&
      edited.createdAt === memo.createdAt['eg-check-p1'] &&
      after.length === 3 && after[0].id === 'eg-check-p1' &&
      after[0].title === old.title + ' (sửa)' &&
      after.filter(project => project.id === 'eg-check-p1').length === 1;
    out.projectEditMsg = 'createdAt=' + edited.createdAt + ', đầu=' + (after[0] && after[0].id) +
      ', tiêu đề=' + (after[0] && after[0].title);
  } catch (error) {
    out.projectEditOk = false;
    out.projectEditMsg = 'sửa dự án lỗi: ' + (error && error.code) + ': ' + error.message;
  }

  try {
    const single = await desktop.call('deleteProject', 'eg-check-p2');
    const gone = await desktop.call('getProject', 'eg-check-p2');
    const batch = await desktop.call('deleteProjects', ['eg-check-p1', 'eg-check-p1', '', 'không-có']);
    const left = mine(await list());
    const noop = await desktop.call('deleteProjects', ['eg-check-p3']);
    const emptyError = await desktop.call('deleteProjects', []).then(() => '', error => error.message);
    const tooMany = Array.from({ length: 201 }, (_, index) => 'eg-check-x' + index);
    const capError = await desktop.call('deleteProjects', tooMany).then(() => '', error => error.message);
    out.projectDeleteOk = single && single.ok === true &&
      gone === null &&
      batch && batch.ok === true && batch.deleted === 1 && batch.missing === 1 &&
      left.length === 1 && noop.deleted === 1 && noop.missing === 0 &&
      /Chưa chọn dự án nào để xoá/.test(emptyError) &&
      /tối đa 200 dự án/.test(capError);
    out.projectDeleteMsg = 'một=' + JSON.stringify(single) + ', lô=' + JSON.stringify(batch) +
      ', còn=' + left.length + ', cuối=' + JSON.stringify(noop) +
      ', rỗng="' + emptyError + '", trần="' + capError + '"';
  } catch (error) {
    out.projectDeleteOk = false;
    out.projectDeleteMsg = 'xoá dự án lỗi: ' + (error && error.code) + ': ' + error.message;
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
