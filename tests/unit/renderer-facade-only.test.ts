import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Cổng của giai đoạn 2: renderer chỉ nói chuyện với lớp desktop qua façade.
//
// Vì sao phải là cổng chứ không chỉ là "đã grep một lần": `window.eduGame` vẫn
// tồn tại thật trong preload Electron. Một dòng `window.eduGame.getLibrary()`
// viết thêm vào một trang sẽ chạy đúng trên Electron và chết trên Tauri —
// nghĩa là lỗi chỉ lộ ra ở vỏ thứ hai, sau khi đã phát hành. Ở đây mọi tệp
// renderer đều bị quét, kể cả tệp mới thêm.
//
// Luật:
//   1. Ngoài `src/renderer/core/` (schema + hai adapter + façade + host), không
//      tệp renderer nào được nhắc `eduGame` như một biến — chỉ được nhắc trong
//      chú thích hoặc trong chuỗi.
//   2. Không ai tự viết `__TAURI__` ngoài adapter: đó là chi tiết của một vỏ,
//      nằm sau façade.
//   3. Bốn tệp lõi phải đứng TRƯỚC mọi tệp gọi `desktop.*` trong index.html —
//      đặt sai là ReferenceError lúc nạp, không phải lỗi khó gặp.
//   4. Gói Tauri không mang preload/main của Electron, và không sinh lại cầu
//      `window.eduGame` của giai đoạn 1.
//
// Test này chỉ đọc đĩa (không cần build), nên bắt lỗi được cả trước khi chạy
// `npm run build`.

function findRepoRoot(start: string): string {
  let current = start;
  for (let depth = 0; depth < 6; depth += 1) {
    if (fs.existsSync(path.join(current, 'package.json'))) return current;
    current = path.dirname(current);
  }
  throw new Error(`không tìm thấy gốc repo từ ${start}`);
}

const root = findRepoRoot(__dirname);
const RENDERER = path.join(root, 'src', 'renderer');
const CORE = path.join(RENDERER, 'core');

/** Bỏ chú thích dòng và khối để chỉ còn mã chạy được. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** Mọi tệp .ts dưới `src/renderer`, đường dẫn tương đối từ `src/renderer`. */
function rendererFiles(): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts')) found.push(path.relative(RENDERER, full).replace(/\\/g, '/'));
    }
  };
  walk(RENDERER);
  return found.sort();
}

function isCore(file: string): boolean {
  return file.startsWith('core/');
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

test('không tệp renderer nào ngoài core/ đọc window.eduGame', () => {
  const offenders: string[] = [];
  for (const file of rendererFiles()) {
    if (isCore(file)) continue;
    const code = stripComments(fs.readFileSync(path.join(RENDERER, file), 'utf8'));
    // Bắt cả `window.eduGame` lẫn `eduGame.` trần; không bắt chuỗi tiếng Việt.
    if (/\beduGame\b/.test(code.replace(/'[^'\n]*'|"[^"\n]*"|`[^`]*`/g, ' '))) offenders.push(file);
  }
  assert.deepEqual(offenders, [],
    `tệp renderer còn gọi thẳng cầu Electron (phải dùng desktop.call/listen): ${offenders.join(', ')}`);
});

test('ngoài core/ không ai đọc __TAURI__, và chỉ adapter Tauri biết tên lệnh', () => {
  const outside: string[] = [];
  for (const file of rendererFiles()) {
    if (isCore(file)) continue;
    const code = stripComments(fs.readFileSync(path.join(RENDERER, file), 'utf8'));
    if (code.includes('__TAURI__')) outside.push(file);
  }
  assert.deepEqual(outside, [],
    `chỉ lớp desktop (core/) được biết tới __TAURI__: ${outside.join(', ')}`);

  // Trong core/, `desktop-host` chỉ NHÌN `__TAURI__` để chọn adapter; tên lệnh và
  // hình dạng `{ channel, args }` thuộc riêng adapter.
  const naming: string[] = [];
  for (const file of rendererFiles().filter(isCore)) {
    if (file === 'core/desktop-adapter-tauri.ts') continue;
    const code = stripComments(fs.readFileSync(path.join(RENDERER, file), 'utf8'));
    if (/invoke_channel|send_channel/.test(code)) naming.push(file);
  }
  assert.deepEqual(naming, [],
    `chỉ desktop-adapter-tauri.ts được biết invoke_channel/send_channel: ${naming.join(', ')}`);
});

test('bốn tệp lõi của façade đứng trước mọi tệp gọi desktop.*', () => {
  const html = fs.readFileSync(path.join(root, 'src', 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script[^>]*\bsrc="(renderer\/[^"]+)"/g)].map(match => match[1]);
  assert.ok(scripts.length > 40, 'index.html không đọc được danh sách script');
  // Khối façade là năm thẻ LIỀN NHAU ở đầu danh sách; `core/bootstrap.js` cũng là
  // `core/` nhưng nạp cuối nên không được dùng làm mốc.
  const lastCore = scripts.lastIndexOf('renderer/core/desktop-host.js');
  assert.ok(lastCore >= 0, 'index.html không nạp desktop-host.js');
  assert.ok(scripts.indexOf('renderer/core/desktop-facade-schema.js') >= 0, 'thiếu desktop-facade-schema.js');
  assert.ok(scripts.indexOf('renderer/core/desktop-facade-schema.js') < scripts.indexOf('renderer/core/desktop-adapter-electron.js')
    && scripts.indexOf('renderer/core/desktop-adapter-tauri.js') < scripts.indexOf('renderer/core/desktop-facade.js')
    && scripts.indexOf('renderer/core/desktop-facade.js') < lastCore,
    'thứ tự bốn tệp lõi phải là schema → hai adapter → façade → host');

  // Tệp đầu tiên có `desktop.call`/`desktop.listen` (hoặc `desktop.info`) phải
  // đứng SAU `desktop-host.js`. `desktop-host.js` tự nó là tệp lõi.
  const consumers = rendererFiles().filter(file => {
    if (isCore(file)) return false;
    const code = stripComments(fs.readFileSync(path.join(RENDERER, file), 'utf8'));
    return /\bdesktop\.(call|listen|info|attach)\b/.test(code);
  });
  assert.ok(consumers.length > 10, `chưa thấy tệp tiêu thụ façade nào (${consumers.length})`);
  for (const file of consumers) {
    const index = scripts.indexOf(`renderer/${file.replace(/\.ts$/, '.js')}`);
    assert.ok(index >= 0, `${file} không được index.html nạp`);
    assert.ok(index > lastCore, `${file} nạp trước tệp lõi của façade (index ${index} ≤ ${lastCore})`);
  }
});

test('gói Tauri không còn preload, main hay cầu eduGame', () => {
  const builder = fs.readFileSync(path.join(root, 'scripts', 'build-tauri-frontend.js'), 'utf8');
  const code = stripComments(builder);
  assert.ok(!/edugame-bridge\.js['"]\s*\)/.test(code) && !code.includes("'edugame-bridge.js'"),
    'build-tauri-frontend.js vẫn sinh edugame-bridge.js');
  assert.ok(code.includes('edugame-guard.js'), 'build-tauri-frontend.js thiếu cổng chặn edugame-guard.js');
  assert.ok(!/window\.eduGame\s*=/.test(code), 'build-tauri-frontend.js lại dựng window.eduGame');
  assert.ok(code.includes("'main.js'") && code.includes("'preload.js'"),
    'build-tauri-frontend.js không còn loại main.js/preload.js khỏi gói');
});

test('adapter Electron là đường duy nhất còn đọc cầu preload', () => {
  const adapter = fs.readFileSync(path.join(CORE, 'desktop-adapter-electron.ts'), 'utf8');
  const code = stripComments(adapter);
  assert.ok(code.includes('bridgeName') || code.includes('eduGame'),
    'adapter Electron không còn đọc cầu theo tên — kiểm tra bridgeName của desktop-host');
  const host = fs.readFileSync(path.join(CORE, 'desktop-host.ts'), 'utf8');
  assert.ok(stripComments(host).includes("createElectronDesktopAdapter('eduGame')"),
    'desktop-host không còn nối adapter Electron với tên cầu eduGame');
});
