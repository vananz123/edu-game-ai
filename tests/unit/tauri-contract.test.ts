import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Cổng của vỏ Tauri. Chốt bốn thứ mà một lần sửa tay có thể làm lệch:
//   1. `api.rs` khai đúng từng kênh invoke của preload.ts, không thừa không thiếu;
//   2. `lib.rs` đăng ký đúng các lệnh đó vào invoke_handler;
//   3. giai đoạn 2: `invoke_channel`/`send_channel` là cửa chung của façade, và
//      danh sách kênh của chúng khớp desktop-contract.json — renderer không còn
//      `window.eduGame`, nên đây là đường duy nhất để một kênh tới được vỏ;
//   4. tauri.conf.json giữ định danh/thư mục dữ liệu tách khỏi Electron, và
//      index.html của dist-tauri nạp cổng `edugame-guard.js` TRƯỚC mọi script,
//      KHÔNG còn `edugame-bridge.js` của giai đoạn 1.
// Test này chỉ đọc đĩa, không chạy cargo: nó chạy trong `npm test` trên máy
// không có Rust.

function findRepoRoot(start: string): string {
  let current = start;
  for (let depth = 0; depth < 6; depth += 1) {
    if (fs.existsSync(path.join(current, 'package.json'))) return current;
    current = path.dirname(current);
  }
  throw new Error(`không tìm thấy gốc repo từ ${start}`);
}

const root = findRepoRoot(__dirname);
const contract = JSON.parse(
  fs.readFileSync(path.join(root, 'src', 'shared', 'desktop-contract.json'), 'utf8'),
);
const apiSource = fs.readFileSync(path.join(root, 'src-tauri', 'src', 'api.rs'), 'utf8');
const libSource = fs.readFileSync(path.join(root, 'src-tauri', 'src', 'lib.rs'), 'utf8');
const conf = JSON.parse(
  fs.readFileSync(path.join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'),
);

// Lệnh viết tay (không qua `unsupported!`) và kênh của chúng, đọc thẳng từ bảng
// `hand_written()` trong api.rs. Hai dòng `channel:*` là kênh GIẢ của hai cửa
// chung giai đoạn 2 (chúng không thuộc preload Electron, chỉ giữ hình dạng bảng)
// nên bị bỏ khỏi mọi phép so với contract. `shell:info` cũng không thuộc preload.
const PSEUDO_CHANNELS = new Set(['channel:invoke', 'channel:send']);
// Kênh ĐIỀU KHIỂN của cổng kiểm tra: không có trong preload Electron, không
// renderer nào gọi (`desktop.gate(...)`, chỉ `tests/ui/tauri-webview-check.js`),
// và `package.rs` từ chối khi `EDUGAME_TAURI_PACKAGE` chưa bật.
const GATE_CHANNELS = new Set(['package:gate-turn']);

function handWritten(): Map<string, string> {
  const table = new Map<string, string>();
  // "command" => ("channel", "command"), — nhóm 3 lặp lại đúng tên nhóm 1.
  for (const match of apiSource.matchAll(/^\s{8}"([a-z0-9_]+)" => \("([^"]+)", "([a-z0-9_]+)"\),/gm)) {
    if (match[1] !== match[3]) {
      throw new Error(`hand_written(): nhánh ${match[1]} lại trả về lệnh ${match[3]}`);
    }
    assert.ok(!table.has(match[2]), `api.rs khai kênh ${match[2]} hai lần`);
    table.set(match[2], match[1]);
  }
  assert.ok(table.size >= 5, `không đọc được hand_written() trong api.rs (${table.size} dòng)`);
  return table;
}

function rustChannels(): Map<string, string> {
  const channels = new Map<string, string>();
  for (const match of apiSource.matchAll(/^\s{4}([a-z0-9_]+) => "([^"]+)"/gm)) {
    assert.ok(!channels.has(match[1]), `api.rs khai trùng hàm ${match[1]}`);
    assert.ok(![...channels.values()].includes(match[2]), `api.rs khai trùng kênh ${match[2]}`);
    channels.set(match[1], match[2]);
  }
  // Lệnh sinh bởi `library_channel!` cũng là lệnh thật: hàm do macro viết ra,
  // nên tìm tên ở dòng `save_game(game: …) => "library:save-game",` trong khối macro.
  const generated = macroGenerated();
  for (const [channel, name] of handWritten()) {
    assert.ok(
      apiSource.includes(`pub fn ${name}(`) || generated.has(name),
      `api.rs thiếu lệnh viết tay ${name}`
    );
    assert.ok(!channels.has(name), `api.rs khai ${name} hai lần`);
    assert.ok(![...channels.values()].includes(channel), `${channel} vừa viết tay vừa unsupported!`);
    channels.set(name, channel);
  }
  return channels;
}

/// Tên hàm khai trong thân `library_channel! { … }` — cả dòng có tham số
/// (`save_game(game: …)`) lẫn dòng không tham số (`list_projects()`).
function macroGenerated(): Set<string> {
  const start = apiSource.indexOf('library_channel! {');
  if (start < 0) return new Set();
  const end = apiSource.indexOf('\n}', start);
  const body = apiSource.slice(start, end);
  return new Set([...body.matchAll(/^\s{4}([a-z0-9_]+)\([^)]*\) => "[^"]+",?;?$/gm)].map(match => match[1]));
}

function registeredCommands(): Set<string> {
  const start = libSource.indexOf('tauri::generate_handler![');
  assert.ok(start >= 0, 'lib.rs không có generate_handler!');
  const end = libSource.indexOf('])', start);
  const body = libSource.slice(start, end);
  return new Set([...body.matchAll(/api::([a-z0-9_]+)/g)].map(match => match[1]));
}

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('api.rs khai được mọi kênh invoke của desktop-contract.json', () => {
  const declared = new Set([...rustChannels().values()]
    .filter(channel => channel !== 'shell:info' && !PSEUDO_CHANNELS.has(channel) && !GATE_CHANNELS.has(channel)));
  const expected = new Set(Object.values(contract.invoke));
  const missing = [...expected].filter(channel => !declared.has(channel as string)).sort();
  const extra = [...declared].filter(channel => !expected.has(channel as string)).sort();
  assert.deepEqual(missing, [], `kênh chưa có lệnh trong api.rs: ${missing.join(', ')}`);
  assert.deepEqual(extra, [], `api.rs khai kênh không có trong preload: ${extra.join(', ')}`);
});

test('mỗi lệnh trong api.rs được đăng ký đúng một lần', () => {
  const handlers = registeredCommands();
  const declared = new Set(rustChannels().keys());
  const missing = [...declared].filter(name => !handlers.has(name)).sort();
  const extra = [...handlers].filter(name => !declared.has(name)).sort();
  assert.deepEqual(missing, [], `lệnh chưa đăng ký: ${missing.join(', ')}`);
  assert.deepEqual(extra, [], `đăng ký lệnh không tồn tại: ${extra.join(', ')}`);
  assert.equal(libSource.split('api::about_check,').length - 1, 1, 'about_check đăng ký trùng');
});

test('ba kênh dữ liệu khởi động có lệnh thật, không phải lệnh báo lỗi', () => {
  // Bootstrap đọc ba kênh này trước lần render đầu tiên; trả lỗi ở đây là màn
  // hình "không thể khởi tạo" che mất UI dù vỏ đã chạy đúng.
  const unsupported = new Set(
    [...apiSource.matchAll(/^\s{4}([a-z0-9_]+) => "/gm)].map(match => match[1]),
  );
  for (const name of ['get_library', 'get_settings', 'get_local_ai_models']) {
    assert.ok(!unsupported.has(name), `${name} vẫn còn trong unsupported!`);
    assert.ok(
      new RegExp(`#\\[tauri::command\\]\\s*\\npub fn ${name}\\(`).test(apiSource),
      `api.rs thiếu lệnh thật ${name}`,
    );
  }
});

test('ba kênh send thuộc trình chiếu chưa mở trong vỏ Tauri', () => {
  // Ghi nhận có chủ đích: ba kênh này là trình chiếu — vòng 2 của #251 câu 1.
  // Giai đoạn 2 mở cửa `send_channel` cho đúng ba kênh đó, nhưng mỗi kênh vẫn
  // trả lỗi "chưa có thân" cho tới khi port thật. Nếu preload thêm kênh send
  // mới, hàng dưới đỏ để buộc người sửa quyết định thay vì im lặng bỏ qua.
  assert.deepEqual(Object.keys(contract.send).sort(), [
    'requestPresentationState',
    'sendPresentationExit',
    'sendPresentationState',
  ]);
  assert.deepEqual(channelList('SEND_CHANNELS').slice().sort(), (Object.values(contract.send) as string[]).sort(),
    'SEND_CHANNELS của api.rs phải khớp đúng ba kênh send của hợp đồng');
});

// Hai danh sách kênh của api.rs là cửa DUY NHẤT để renderer tới được vỏ Tauri
// (adapter `invoke('invoke_channel', { channel })`). Lệch một kênh ở đây nghĩa
// là một nút trong app Tauri trả "không thuộc hợp đồng desktop" dù đã port.
function channelList(constName: string): string[] {
  const start = apiSource.indexOf(`const ${constName}: &[&str] = &[`);
  assert.ok(start >= 0, `api.rs thiếu ${constName}`);
  const end = apiSource.indexOf('];', start);
  const body = apiSource.slice(start, end);
  const channels = [...body.matchAll(/"([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(channels).size, channels.length, `${constName} khai trùng kênh`);
  return channels;
}

test('invoke_channel nhận đúng mọi kênh invoke của hợp đồng, không thừa không thiếu', () => {
  const channels = channelList('INVOKE_CHANNELS');
  const expected = Object.values(contract.invoke) as string[];
  const missing = expected.filter(channel => !channels.includes(channel)).sort();
  const extra = channels.filter(channel => !expected.includes(channel) && !GATE_CHANNELS.has(channel)).sort();
  assert.deepEqual(missing, [], `INVOKE_CHANNELS thiếu: ${missing.join(', ')}`);
  assert.deepEqual(extra, [], `INVOKE_CHANNELS thừa: ${extra.join(', ')}`);
});

test('invoke_channel/send_channel được đăng ký và lọc kênh trước khi chạy', () => {
  const handlers = registeredCommands();
  assert.ok(handlers.has('invoke_channel'), 'invoke_channel chưa đăng ký');
  assert.ok(handlers.has('send_channel'), 'send_channel chưa đăng ký');
  // Cửa chung phải từ chối trước khi tới `dispatch()`: nếu không, frontend gửi
  // một chuỗi kênh tuỳ ý và tự chọn nhánh nào chạy. Tham số `args` là dữ liệu
  // của KÊNH ĐÃ LỌC (một trò chơi, một id), nên hợp đồng chốt đúng ba tham số:
  // một chuỗi kênh, một danh sách giá trị, và không gì khác.
  assert.match(
    apiSource,
    /pub fn invoke_channel\(\s*app: AppHandle,\s*channel: String,\s*args: Option<Vec<Value>>,\s*\) -> Result<Value, String>/,
    'invoke_channel không được nhận thêm tham số tuỳ ý từ frontend'
  );
  assert.ok(apiSource.includes('!INVOKE_CHANNELS.contains(&channel.as_str())'),
    'invoke_channel thiếu bước lọc theo INVOKE_CHANNELS');
  assert.ok(apiSource.includes('!SEND_CHANNELS.contains(&channel.as_str())'),
    'send_channel thiếu bước lọc theo SEND_CHANNELS');
});

test('không cấp quyền filesystem cho frontend', () => {
  // Kế hoạch giai đoạn 2 câu 6: cửa chung không được thành đường vòng để đọc
  // tệp tuỳ ý. Cửa sổ chính chỉ có `core:default`; thêm bất kỳ quyền fs/dialog
  // vào là đỏ, kể cả `fs:default`.
  const dir = path.join(root, 'src-tauri', 'capabilities');
  const files = fs.readdirSync(dir).filter(name => name.endsWith('.json'));
  assert.ok(files.length >= 1, 'không có capability nào');
  for (const file of files) {
    const cap = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    for (const permission of cap.permissions || []) {
      const name = typeof permission === 'string' ? permission : permission.identifier;
      assert.ok(!/^(fs|dialog|path|shell):/.test(name),
        `${file} cấp quyền ${name} — frontend Tauri không được chạm tệp trực tiếp`);
    }
  }
});

test('tauri.conf.json tách khỏi Electron', () => {
  assert.equal(conf.identifier, 'vn.edugame.studio.tauri');
  assert.notEqual(conf.productName, 'EduGame Studio', 'trùng productName với Electron');
  assert.equal(conf.build.frontendDist, '../dist-tauri');
  assert.equal(conf.app.withGlobalTauri, true, 'adapter Tauri đọc __TAURI__ từ window');
});

test('CSP của vỏ Tauri không nới hơn CSP của index.html', () => {
  const html = fs.readFileSync(path.join(root, 'src', 'index.html'), 'utf8');
  const meta = /content="([^"]*default-src[^"]*)"/.exec(html);
  assert.ok(meta, 'index.html không có CSP');
  assert.equal(conf.app.security.csp, meta[1]);
});

test('dist-tauri nạp cổng chặn trước mọi script renderer và không còn cầu eduGame', () => {
  const distIndex = path.join(root, 'dist-tauri', 'index.html');
  if (!fs.existsSync(distIndex)) {
    // Chưa dựng `npm run build:tauri` — bỏ qua theo cách nói rõ, không im lặng.
    console.log('     (dist-tauri chưa dựng — bỏ qua kiểm HTML)');
    return;
  }
  const html = fs.readFileSync(distIndex, 'utf8');
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(match => match[1]);
  assert.equal(scripts[0], 'edugame-guard.js', 'script đầu tiên phải là cổng chặn của vỏ Tauri');
  assert.equal(scripts.filter(src => src === 'edugame-guard.js').length, 1);
  assert.ok(!scripts.includes('edugame-bridge.js'), 'cầu eduGame của giai đoạn 1 không được quay lại');
  assert.ok(!fs.existsSync(path.join(root, 'dist-tauri', 'edugame-bridge.js')),
    'dist-tauri còn edugame-bridge.js — bản dựng cũ hoặc script sinh lại cầu');
  assert.ok(!scripts.some(src => src.startsWith('..') || src.includes('://')), 'script phải là đường dẫn tương đối');
});
