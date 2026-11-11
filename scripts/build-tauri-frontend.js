// Dựng `dist-tauri` — bản UI để Tauri nạp bằng WebView2.
//
// Vì sao không dùng thẳng `dist`: Electron cần `main.js`/`preload.js`, và
// `main.ts` gọi `app.getPath`, `ipcMain`, `safeStorage`… Nạp chúng vào một vỏ
// không có Electron sẽ hỏng ngay khi `require('electron')` trả về một chuỗi
// (Electron 28+ chỉ nạp được trong tiến trình Electron). Ở đây chỉ chép phần
// renderer: `index.html`, CSS, script renderer, engine game, vendor và asset.
//
// Từ giai đoạn 2 renderer KHÔNG còn đọc `window.eduGame`: mọi lời gọi đi qua
// façade `desktop.*`, và `desktop-adapter-tauri.js` nói thẳng với `__TAURI__`
// qua hai lệnh chung `invoke_channel` / `send_channel` (src-tauri/src/api.rs).
// Vì vậy giai đoạn 1 đã sinh `edugame-bridge.js` ở đây — bản sao 92 khoá của
// preload Electron — và giai đoạn 2 đã bỏ hẳn. Không còn khoá nào có thể lệch
// khỏi preload, vì không còn bảng khoá thứ hai.
//
// Thứ tự script trong `index.html` là luật (tests/unit/renderer-load-order), nên
// script này KHÔNG sửa thẻ script nào. Nó chỉ chèn một cổng chặn nhỏ ngay đầu
// <body>, trước mọi script renderer, để một `window.eduGame` sót lại — hoặc
// không có `__TAURI__` — hiện ra thành lỗi đọc được thay vì `undefined is not a
// function` ở giữa màn hình.

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const distSrc = path.join(root, 'dist', 'src');
const out = path.join(root, 'dist-tauri');

// Chỉ chép những thứ đường dẫn tĩnh trong index.html/CSS trỏ tới.
const ENTRIES = [
  'index.html',
  'renderer',
  'game-engine',
  'presentation',
];

// Tiến trình main/preload của Electron, không có đường tương đương ở vỏ Tauri:
// bỏ hẳn. Index.html không trỏ tới chúng, nên bản sao chỉ nằm im trong gói.
const SKIP = new Set(['main.js', 'main.js.map', 'preload.js', 'preload.js.map']);

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(source, target);
    else fs.copyFileSync(source, target);
  }
}

// Cổng chặn của vỏ Tauri, nạp TRƯỚC mọi script renderer.
//
// Hai điều kiện, cả hai đều là "vỏ này chưa chạy được", không phải lỗi dữ liệu:
//   • thiếu `__TAURI__` → `desktop-adapter-tauri.js` không nối được, mọi lời gọi
//     façade từ chối `not-supported`; cùng lắm giáo viên thấy lỗi từng nút.
//   • còn `window.eduGame` → có người đã chèn cầu giai đoạn 1 lại; renderer sẽ
//     thấy hai cửa desktop. Ghi rõ ra console để người dựng biết mà gỡ.
// Không ném lỗi: chặn trang là làm giáo viên mất cả giao diện vì một chi tiết
// vỏ, trong khi các nhánh "chưa hỗ trợ" của façade đã nói lý do rõ ràng.
function guardSource() {
  return `// TỆP SINH TỰ ĐỘNG bởi scripts/build-tauri-frontend.js. Đừng sửa tay.
// Renderer nói với vỏ qua façade \`desktop.*\` (adapter Tauri → __TAURI__ →
// invoke_channel/send_channel), không qua \`window.eduGame\`.
(function () {
  'use strict';
  if (!window.__TAURI__ || !window.__TAURI__.core) {
    console.error('Vỏ Tauri không expose __TAURI__ — kiểm tra app.withGlobalTauri trong tauri.conf.json');
  }
  if (window.eduGame) {
    console.error('window.eduGame còn tồn tại trong gói Tauri: renderer giai đoạn 2 chỉ dùng façade desktop.*');
  }
})();
`;
}

// Bảng kênh → lệnh của `api.rs`, dùng cho phép so với hợp đồng desktop.
//
// Tauri đăng ký lệnh theo tên hàm Rust (`app_info`), không theo chuỗi kênh của
// Electron (`app:info`; Tauri còn cấm hai dấu `:` trong một tên). Bảng lấy từ
// hai nguồn trong api.rs: nhánh `hand_written()` và `unsupported!(…)`. Lệnh
// chung `invoke_channel`/`send_channel` khai kênh giả (`channel:invoke`,
// `channel:send`) — chúng KHÔNG phục vụ một kênh cụ thể nên bị loại khỏi phép
// so; cổng tests/unit/tauri-contract.test.ts chốt hai danh sách bên trong
// `INVOKE_CHANNELS`/`SEND_CHANNELS` thay cho việc này.
function commandMap(apiSource) {
  const map = {};
  for (const match of apiSource.matchAll(/^\s{8}"([a-z0-9_]+)" => \("([^"]+)", "([a-z0-9_]+)"\),/gm)) {
    if (match[1] !== match[3]) {
      throw new Error(`api.rs: nhánh hand_written() ${match[1]} trả về lệnh ${match[3]}`);
    }
    map[match[2]] = match[1];
  }
  if (!map['app:info'] || !map['library:get']) {
    throw new Error('api.rs: không đọc được bảng hand_written() — kiểm tra định dạng nhánh');
  }
  for (const match of apiSource.matchAll(/^\s{4}([a-z0-9_]+) => "([^"]+)"/gm)) {
    const [, name, channel] = match;
    if (map[channel] && map[channel] !== name) {
      throw new Error(`api.rs khai kênh ${channel} cho cả ${map[channel]} và ${name}`);
    }
    map[channel] = name;
  }
  return map;
}

// Kênh thuộc `INVOKE_CHANNELS` của api.rs — danh sách `invoke_channel` nhận.
function channelList(apiSource, constName) {
  const start = apiSource.indexOf(`const ${constName}: &[&str] = &[`);
  if (start < 0) throw new Error(`api.rs thiếu ${constName}`);
  const end = apiSource.indexOf('];', start);
  if (end < 0) throw new Error(`api.rs: ${constName} không đóng danh sách`);
  return [...apiSource.slice(start, end).matchAll(/"([^"]+)"/g)].map(match => match[1]);
}

function main() {
  if (!fs.existsSync(distSrc)) {
    console.error('Chưa có dist/src — chạy `npm run build` trước.');
    process.exit(1);
  }
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });

  for (const entry of ENTRIES) {
    const source = path.join(distSrc, entry);
    if (!fs.existsSync(source)) {
      console.error(`Thiếu dist/src/${entry} — chạy lại \`npm run build\`.`);
      process.exit(1);
    }
    const target = path.join(out, entry);
    if (fs.statSync(source).isDirectory()) copyDir(source, target);
    else fs.copyFileSync(source, target);
  }

  const facadeSchema = fs.readFileSync(
    path.join(root, 'src', 'renderer', 'core', 'desktop-facade-schema.ts'),
    'utf8',
  );
  const facadeChannels = { invoke: [], send: [] };
  for (const match of facadeSchema.matchAll(
    /^\s{2}[a-zA-Z0-9_]+: \{ channel: '([^']+)', group: '[^']+', kind: '(value|send)'/gm,
  )) {
    facadeChannels[match[2] === 'send' ? 'send' : 'invoke'].push(match[1]);
  }
  if (!facadeChannels.invoke.length || !facadeChannels.send.length) {
    console.error('desktop-facade-schema.ts: không đọc được danh sách kênh Tauri.');
    process.exit(1);
  }
  const apiSource = fs.readFileSync(path.join(root, 'src-tauri', 'src', 'api.rs'), 'utf8');
  const commands = commandMap(apiSource);

  // `invoke_channel` là cửa duy nhất cho kênh có trả lời; kênh nào façade khai
  // mà danh sách này không có thì bản Tauri sẽ từ chối nó ở cửa — dừng build để
  // danh sách được sửa cùng hợp đồng, không để giáo viên gặp lúc chạy.
  const invokeChannels = new Set(channelList(apiSource, 'INVOKE_CHANNELS'));
  const uncovered = facadeChannels.invoke.filter(channel => !invokeChannels.has(channel));
  if (uncovered.length) {
    console.error(`Kênh chưa có trong INVOKE_CHANNELS của api.rs: ${uncovered.join(', ')}`);
    process.exit(1);
  }
  const sendChannels = new Set(channelList(apiSource, 'SEND_CHANNELS'));
  const missingSend = facadeChannels.send.filter(channel => !sendChannels.has(channel));
  if (missingSend.length) {
    console.error(`Kênh send chưa có trong SEND_CHANNELS của api.rs: ${missingSend.join(', ')}`);
    process.exit(1);
  }
  // Bảng lệnh vẫn phải đọc được (đăng ký lệnh thật), kể cả khi renderer không
  // còn gọi thẳng tên lệnh: `tests/unit/tauri-contract.test.ts` dựa vào nó để
  // chốt lib.rs đăng ký đủ lệnh.
  if (!commands['app:info'] || !commands['about:check']) {
    console.error('api.rs: bảng lệnh đọc được nhưng thiếu kênh bắt buộc — kiểm tra lại');
    process.exit(1);
  }

  fs.writeFileSync(path.join(out, 'edugame-guard.js'), guardSource(), 'utf8');

  // CSP của index.html là `script-src 'self'` — thẻ script ngoài là hợp lệ, không
  // cần 'unsafe-inline'. Chèn NGAY đầu <body> để cổng chặn có trước mọi script
  // renderer; thứ tự các thẻ còn lại không đổi.
  const htmlPath = path.join(out, 'index.html');
  let html = fs.readFileSync(htmlPath, 'utf8');
  if (/preload\.js|main\.js|edugame-bridge\.js/.test(html)) {
    console.error('index.html nhắc tới preload.js/main.js/edugame-bridge.js — bản Tauri không có các tệp này.');
    process.exit(1);
  }
  if (!html.includes('<body>')) {
    console.error('index.html không có thẻ <body> để chèn cổng chặn.');
    process.exit(1);
  }
  // Ảnh minh hoạ (#270): WebView2 không nạp được scheme tự đặt, nên wry trả
  // `edugame-file:` trên host `http://edugame-file.tauri.localhost`. Tauri tiêm
  // CSP từ tauri.conf.json, nhưng thẻ meta trong index.html vẫn là bản sao renderer
  // đọc được — hai bản phải trùng nhau, nên bản này cũng nới img-src y như bản kia.
  // Electron không đi qua cổng này nên giữ nguyên thẻ meta của `src/index.html`.
  // Thiếu chuỗi phải thay là lỗi im lặng (CSP không nới, ảnh chết), nên dừng build.
  const tauriImgSrc = "img-src 'self' data: edugame-file: http://edugame-file.tauri.localhost;";
  if (!html.includes("img-src 'self' data: edugame-file:;") && !html.includes(tauriImgSrc)) {
    console.error('index.html: không tìm thấy img-src của CSP để nới cho host ảnh Tauri.');
    process.exit(1);
  }
  html = html.split("img-src 'self' data: edugame-file:;").join(tauriImgSrc);
  if (!html.includes(tauriImgSrc)) {
    console.error('index.html: CSP sau khi nới không còn img-src của host ảnh Tauri.');
    process.exit(1);
  }
  fs.writeFileSync(
    htmlPath,
    html.replace('<body>', '<body>\n  <script src="edugame-guard.js"></script>'),
    'utf8',
  );

  let count = 0;
  const walk = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else count += 1;
    }
  };
  walk(out);
  console.log(`dist-tauri: ${count} tệp`);
}

if (require.main === module) main();

module.exports = { commandMap, channelList };
