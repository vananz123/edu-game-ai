// Dựng `dist-tauri` — bản UI để Tauri nạp bằng WebView2.
//
// Vì sao không dùng thẳng `dist`: Electron cần `main.js`/`preload.js`, và
// `main.ts` gọi `app.getPath`, `ipcMain`, `safeStorage`… Nạp chúng vào một vỏ
// không có Electron sẽ hỏng ngay khi `require('electron')` trả về một chuỗi
// (Electron 28+ chỉ nạp được trong tiến trình Electron). Ở đây chỉ chép phần
// renderer: `index.html`, CSS, script renderer, engine game, vendor và asset.
//
// Thứ tự script trong `index.html` là luật (tests/unit/renderer-load-order), nên
// HTML chỉ được sửa ĐÚNG MỘT chỗ: chèn thẻ cầu `edugame-bridge.js` ngay đầu
// <body>. Mọi thẻ cũ giữ nguyên thứ tự. Cổng tests/unit/tauri-contract.test.ts
// đọc lại `dist-tauri/index.html` để chốt điều đó.

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

// Cầu `window.eduGame` cho WebView2.
//
// Renderer được viết cho một preload Electron đã expose `window.eduGame`. Vỏ
// Tauri không có preload đó, nên cầu này dựng cùng hình dạng API từ
// `src/shared/desktop-contract.json` — bản ghi 92 khoá đã được cổng
// tests/unit/desktop-contract.test.ts chốt với preload.ts. Sinh từ JSON thay vì
// gõ tay để danh sách khoá không thể lệch khỏi Electron mà không ai thấy.
//
// Mã sinh ra là script cổng thường nạp TRƯỚC mọi script trong index.html, và
// dùng toàn bộ global của Tauri (__TAURI__), không import module.
function bridgeSource(contract, commands) {
  const invokes = Object.entries(contract.invoke)
    .map(([key, channel]) => `    ${key}: (...args) => call(${JSON.stringify(channel)}, args),`)
    .join('\n');
  const sends = Object.entries(contract.send)
    .map(([key, channel]) => `    ${key}: (...args) => call(${JSON.stringify(channel)}, args),`)
    .join('\n');
  const events = Object.entries(contract.event)
    .map(
      ([key, channel]) => `    ${key}: callback => {
      const stopping = listen(${JSON.stringify(channel)}, event => callback(event.payload));
      stopping.catch(() => {});
      return () => stopping.then(stop => stop()).catch(() => {});
    },`,
    )
    .join('\n');

  return `// TỆP SINH TỰ ĐỘNG bởi scripts/build-tauri-frontend.js từ src/shared/desktop-contract.json.
// Đừng sửa tay: chạy \`npm run build:tauri\` để sinh lại.
(function () {
  'use strict';
  const api = window.__TAURI__;
  if (!api || !api.core) {
    // Không có với Tauri: để renderer báo lỗi rõ ràng thay vì "undefined is not a function".
    window.__eduGameBridgeError = 'Vỏ Tauri không expose __TAURI__ — kiểm tra app.withGlobalTauri trong tauri.conf.json';
    return;
  }
  const invoke = api.core.invoke;
  const listen = api.event.listen;
  const COMMANDS = ${JSON.stringify(commands, null, 2)};

  // Tauri đăng ký lệnh theo tên hàm Rust; bảng này dịch kênh Electron sang lệnh.
  // Tauri từ chối bằng chuỗi; renderer đọc \`error.message\`, nên chuẩn hóa về Error
  // và giữ nguyên văn lý do của vỏ (ví dụ "Kênh \`library:get\` chưa có…").
  const call = (channel, args) => {
    const command = COMMANDS[channel];
    if (!command) {
      return Promise.reject(new Error('Kênh ' + channel + ' không có lệnh trong vỏ Tauri'));
    }
    return invoke(command, args[0] === undefined ? {} : { args }).catch(error => {
      if (error instanceof Error) throw error;
      throw new Error(typeof error === 'string' ? error : JSON.stringify(error));
    });
  };

  window.eduGame = Object.freeze({
${invokes}
${sends}
${events}
  });
})();
`;
}

// Bảng kênh IPC → tên lệnh Tauri.
//
// Tauri đăng ký lệnh theo TÊN HÀM Rust (`app_info`), không theo chuỗi kênh của
// Electron (`app:info`; Tauri còn cấm hai dấu `:` trong một tên). Bảng này là
// cầu nối duy nhất, lấy từ hai nguồn trong `api.rs`: `hand_written()` (lệnh có
// thân thật) và `unsupported!(x => "channel")` — nên không thể lệch khỏi những
// gì thực sự được đăng ký.
function commandMap(apiSource) {
  const map = {};
  // Mỗi nhánh `"name" => ("channel", "name"),` trong `hand_written`. Ba nhóm tách
  // rời (không backreference) để cổng Node và script đọc giống hệt nhau.
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

  const contract = JSON.parse(
    fs.readFileSync(path.join(root, 'src', 'shared', 'desktop-contract.json'), 'utf8'),
  );
  const commands = commandMap(
    fs.readFileSync(path.join(root, 'src-tauri', 'src', 'api.rs'), 'utf8'),
  );
  const uncovered = Object.values(contract.invoke).filter(channel => !commands[channel]);
  if (uncovered.length) {
    console.error(`Kênh chưa có lệnh Tauri: ${uncovered.join(', ')}`);
    process.exit(1);
  }
  fs.writeFileSync(path.join(out, 'edugame-bridge.js'), bridgeSource(contract, commands), 'utf8');

  // CSP của index.html là `script-src 'self'` — thẻ script ngoài là hợp lệ, không
  // cần 'unsafe-inline'. Chèn NGAY đầu <body> để `window.eduGame` có trước mọi
  // script renderer; thứ tự các thẻ còn lại không đổi.
  const htmlPath = path.join(out, 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  if (/preload\.js|main\.js/.test(html)) {
    console.error('index.html nhắc tới preload.js/main.js — bản Tauri không có hai tệp này.');
    process.exit(1);
  }
  if (!html.includes('<body>')) {
    console.error('index.html không có thẻ <body> để chèn cầu eduGame.');
    process.exit(1);
  }
  fs.writeFileSync(
    htmlPath,
    html.replace('<body>', '<body>\n  <script src="edugame-bridge.js"></script>'),
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

main();
