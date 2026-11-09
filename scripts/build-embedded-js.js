// Đóng gói các module TypeScript mà vỏ Tauri chạy TRONG tiến trình Rust.
//
// Vì sao không viết lại bằng Rust: luật lưu trò chơi (`library-ops.ts`), bộ kiểm
// dữ liệu bốn thể loại (`game-validation.ts`) và bảng cột (`game-fields.ts`) đã
// chạy bên Electron. Dịch tay sang Rust là hai bản cùng một luật, và bản thứ hai
// sẽ trôi ở lần sửa thứ ba — đúng loại lỗi #152 đã phải vá. Thay vào đó, Rust
// nhúng V8 (crate `deno_core`) và nạp chính bundle sinh ở đây; Rust giữ phần
// SQL, I/O và base64, JS giữ phần luật.
//
//   node scripts/build-embedded-js.js [--check]
//
//   --check  so tệp đang có với bản vừa dựng; lệch (kể cả chỉ một dòng) là lỗi.
//            `npm test` chạy cổng này, nên sửa `library-ops.ts` mà quên dựng lại
//            là đỏ ngay, không đợi tới lúc chạy app.
//
// Tệp ra `src-tauri/src/embedded/bundle.js`, được `src-tauri/src/embedded.rs`
// `include_str!`. Nó là mã sinh: đừng sửa tay.

const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const templatePath = path.join(root, 'src-tauri', 'src', 'embedded', 'template.js');
const outPath = path.join(root, 'src-tauri', 'src', 'embedded', 'bundle.js');

// Thứ tự không quan trọng (mỗi slot là một IIFE độc lập nối vào `available`),
// nhưng giữ cố định để tệp sinh ra ổn định giữa các lần dựng.
const SLOTS = [
  { slot: 'EGVALIDATE', entry: 'src/services/game/game-validation.ts' },
  { slot: 'EGFIELDS', entry: 'src/services/game/game-fields.ts' },
  { slot: 'EGOPS', entry: 'src/services/storage/library-ops.ts' }
];

/**
 * Bundle một entry thành CJS một dòng.
 *
 * Không dùng `external`: nếu một module lỡ `import` `node:fs`, esbuild phải
 * nhúng nó và V8 nhúng sẽ ném lúc nạp — đúng điều mình muốn biết ngay khi dựng,
 * thay vì lặng lẽ gọi ra ngoài. `platform: 'neutral'` tắt các polyfill Node mà
 * một trò chơi không nên có.
 */
function bundleModule(entry) {
  const result = esbuild.buildSync({
    entryPoints: [path.join(root, entry)],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'neutral',
    mainFields: ['module', 'main'],
    target: 'es2022',
    minify: true,
    legalComments: 'none',
    logLevel: 'silent'
  });
  const text = result.outputFiles[0].text.trim();
  if (/require\(["'](?:node:)?(?:fs|os|child_process|worker_threads|vm|module)["']\)/.test(text)) {
    throw new Error(`${entry}: bundle vẫn còn require() của module lõi Node — V8 nhúng không có module nào.`);
  }
  return text;
}

/**
 * Nối bundle vào đúng chỗ `/* @slot NAME *\/` của mẫu.
 *
 * Slot giữ nguyên dấu chú thích (đổi thành `/* @slot NAME (đã nối) *​/` sẽ làm
 * cổng Node khó hiểu); thay vào là một IIFE gán `available.NAME`. IIFE để biến
 * nội bộ của bundle không lọt ra ngoài và không đụng nhau.
 */
function fill(template, slot, code) {
  const marker = `  /* @slot ${slot} */`;
  const index = template.indexOf(marker);
  if (index < 0) throw new Error(`template.js thiếu dấu ${marker.trim()}`);
  const injected =
    `  available.${slot} = (function () {\n` +
    `    var module = { exports: {} };\n` +
    `    var exports = module.exports;\n` +
    `    ${code}\n` +
    `    return module.exports;\n` +
    `  })();`;
  return template.slice(0, index) + injected + template.slice(index + marker.length);
}

function build() {
  let source = fs.readFileSync(templatePath, 'utf8');
  for (const { slot, entry } of SLOTS) source = fill(source, slot, bundleModule(entry));
  const header = `// TỆP SINH TỰ ĐỘNG bởi scripts/build-embedded-js.js. Đừng sửa tay.\n` +
    `// Nguồn: src-tauri/src/embedded/template.js + ${SLOTS.map(entry => entry.entry).join(', ')}\n`;
  return header + source;
}

function main() {
  const check = process.argv.includes('--check');
  const next = build();
  if (check) {
    const current = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : '';
    if (current !== next) {
      console.error('src-tauri/src/embedded/bundle.js đã cũ — chạy `node scripts/build-embedded-js.js`.');
      process.exit(1);
    }
    console.log(`embedded bundle: khớp (${(Buffer.byteLength(next) / 1024).toFixed(1)} KiB)`);
    return;
  }
  fs.writeFileSync(outPath, next, 'utf8');
  console.log(`embedded bundle: ${outPath} (${(Buffer.byteLength(next) / 1024).toFixed(1)} KiB)`);
}

if (require.main === module) main();

module.exports = { build, SLOTS };
