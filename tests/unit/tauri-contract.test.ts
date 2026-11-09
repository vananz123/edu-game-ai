import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Cổng của vỏ Tauri giai đoạn 1. Chốt ba thứ mà một lần sửa tay có thể làm lệch:
//   1. `api.rs` khai đúng từng kênh invoke của preload.ts, không thừa không thiếu;
//   2. `lib.rs` đăng ký đúng các lệnh đó vào invoke_handler;
//   3. tauri.conf.json giữ định danh/thư mục dữ liệu tách khỏi Electron, và
//      index.html của dist-tauri nạp cầu eduGame TRƯỚC mọi script renderer.
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
// `hand_written()` trong api.rs — cũng là nguồn cầu eduGame dựng bảng `COMMANDS`.
// `shell:info` không thuộc preload Electron nên bị lọc khỏi phép so với contract.
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
  for (const [channel, name] of handWritten()) {
    assert.ok(apiSource.includes(`pub fn ${name}(`), `api.rs thiếu lệnh viết tay ${name}`);
    assert.ok(!channels.has(name), `api.rs khai ${name} hai lần`);
    assert.ok(![...channels.values()].includes(channel), `${channel} vừa viết tay vừa unsupported!`);
    channels.set(name, channel);
  }
  return channels;
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
  const declared = new Set([...rustChannels().values()].filter(channel => channel !== 'shell:info'));
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
  // Ghi nhận có chủ đích: send không qua invoke_handler, và ba kênh này là trình
  // chiếu — vòng 2 của #251 câu 1. Nếu preload thêm kênh send mới, hàng dưới đỏ
  // để buộc người sửa quyết định thay vì im lặng bỏ qua.
  assert.deepEqual(Object.keys(contract.send).sort(), [
    'requestPresentationState',
    'sendPresentationExit',
    'sendPresentationState',
  ]);
});

test('tauri.conf.json tách khỏi Electron', () => {
  assert.equal(conf.identifier, 'vn.edugame.studio.tauri');
  assert.notEqual(conf.productName, 'EduGame Studio', 'trùng productName với Electron');
  assert.equal(conf.build.frontendDist, '../dist-tauri');
  assert.equal(conf.app.withGlobalTauri, true, 'renderer cần __TAURI__ cho cầu eduGame');
});

test('CSP của vỏ Tauri không nới hơn CSP của index.html', () => {
  const html = fs.readFileSync(path.join(root, 'src', 'index.html'), 'utf8');
  const meta = /content="([^"]*default-src[^"]*)"/.exec(html);
  assert.ok(meta, 'index.html không có CSP');
  assert.equal(conf.app.security.csp, meta[1]);
});

test('dist-tauri nạp cầu eduGame trước mọi script renderer', () => {
  const distIndex = path.join(root, 'dist-tauri', 'index.html');
  if (!fs.existsSync(distIndex)) {
    // Chưa dựng `npm run build:tauri` — bỏ qua theo cách nói rõ, không im lặng.
    console.log('     (dist-tauri chưa dựng — bỏ qua kiểm HTML)');
    return;
  }
  const html = fs.readFileSync(distIndex, 'utf8');
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(match => match[1]);
  assert.equal(scripts[0], 'edugame-bridge.js', 'script đầu tiên phải là cầu eduGame');
  assert.equal(scripts.filter(src => src === 'edugame-bridge.js').length, 1);
  assert.ok(!scripts.some(src => src.startsWith('..') || src.includes('://')), 'script phải là đường dẫn tương đối');

  const bridge = fs.readFileSync(path.join(root, 'dist-tauri', 'edugame-bridge.js'), 'utf8');
  for (const key of [
    ...Object.keys(contract.invoke),
    ...Object.keys(contract.send),
    ...Object.keys(contract.event),
  ]) {
    assert.ok(bridge.includes(`    ${key}:`), `cầu thiếu khoá ${key}`);
  }
});
