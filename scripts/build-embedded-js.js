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
  { slot: 'EGOPS', entry: 'src/services/storage/library-ops.ts' },
  // Nhóm `project:*`: luật bản nháp (`lesson-project-rules.ts`) và đường lưu/đọc/
  // xoá (`project-ops.ts`). `lesson-contracts.ts` đi kèm vì bộ kiểm dự án dùng
  // `parseGameConfig`/`parseGameDraft` của nó — cùng bộ Zod mà Electron chạy.
  { slot: 'EGCONTRACTS', entry: 'src/services/lesson/lesson-contracts.ts' },
  { slot: 'EGPROJECTS', entry: 'src/services/storage/project-ops.ts' },
  // Gói `.egame`: bộ đọc/ghi của Electron (`game-package.ts`) với `normalizeGame`
  // và bốn bộ kiểm thể loại đi kèm. Rust mở hộp thoại và đọc/ghi tệp; slot này
  // chỉ thấy chuỗi.
  { slot: 'EGPACKAGES', entry: 'src/services/game/game-package-ops.ts' },
  // Nhập tài liệu (`files:import-document`, `files:import-document-from-path`):
  // cùng năm định dạng và cùng thư viện của `main.ts`, nhưng chạy trong V8 nhúng.
  // Rust chọn tệp và đọc byte; slot này chỉ thấy `Uint8Array` cùng tên tệp.
  { slot: 'EGFILES', entry: 'src-tauri/src/embedded/files-ops.ts', neutral: true }
];

/**
 * UUID v4 dựng từ `Math.random`, dùng trong V8 nhúng thay cho `node:crypto`.
 * Cùng thứ `id()` của `main.ts` dựng id — không phải bí mật, chỉ cần khó trùng.
 */
const UUID_FALLBACK =
  '(function () { return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (ch) {' +
  ' var n = Math.floor(Math.random() * 16);' +
  ' return (ch === "x" ? n : (n & 3) | 8).toString(16); }); })()';

/**
 * Dạng esbuild ĐỂ LẠI trong kết quả cho câu `require('node:crypto').randomUUID()`
 * của `game-service.ts`, khi `node:crypto` được khai `external`.
 */
const UUID_REQUIRE = 'require("node:crypto").randomUUID()';

/**
 * Bundle một entry thành CJS một dòng.
 *
 * Không dùng `external` cho hầu hết thứ: nếu một module lỡ `import` `node:fs`,
 * esbuild phải nhúng nó và V8 nhúng sẽ ném lúc nạp — đúng điều mình muốn biết ngay
 * khi dựng, thay vì lặng lẽ gọi ra ngoài. `platform: 'neutral'` tắt các polyfill
 * Node mà một trò chơi không nên có, và cũng không phân giải được module lõi
 * Node. Ngoại lệ duy nhất là `crypto` (`UUID_REQUIRE`): để esbuild chuyển nó
 * thành `require("crypto")` bình thường, rồi thay ĐÚNG chuỗi đó bằng
 * `UUID_FALLBACK`. Câu require nào khác còn lại trong kết quả là lỗi.
 *
 * Slot `neutral: true` (chỉ slot nhập tài liệu) cần thêm ba thứ mà bundle của
 * luật không cần:
 *   • `require("node:crypto")` thay bằng `__eg_require` của `template.js` — nơi
 *     duy nhất có UUID cho id;
 *   • module lõi Node mà thư viện đọc tệp vẫn với tới (dù đã chọn bản trình
 *     duyệt) được thay bằng shim: `module` (createRequire), `zlib`
 *     (DecompressionStream), `fs` (chỉ ném câu đọc được);
 *   • `jszip` trỏ sang bản `dist/` — bản `lib/` của nó là cây stream của Node.
 *     Hai đường dẫn dưới đây đọc TÊN GÓI từ `node_modules` của chính repo, nên
 *     một slot vô tình dùng nhánh Node là hỏng ngay ở bước dựng.
 */
const SHIM_DIR = path.join(root, 'src-tauri', 'src', 'embedded', 'shims');
// `lib/` của jszip là cây stream của Node; không có chỗ trong V8 nhúng. Đổi sang
// bản `dist/` của chính nó ở mức GÓI, rồi mới tới các module lõi Node.
//
// `url`/`os`/`path` có shim riêng chứ không phải một shim ném lỗi: esbuild dịch
// lời gọi `require("url")` của UMD trong `dist/jszip.min.js` thành import, và
// nhánh Node của pdf.js 1.10.100 gọi `require("os").cpus()` ngay khi nạp
// (mammoth cũng vậy) — chúng cần một hàm thật, không phải một câu lỗi. Nhánh
// đọc/ghi tệp và nhánh nén đã có shim chạy được ở trên; `http`/`https` chưa
// thấy chỗ gọi nào trong nhánh đang chạy, nên giữ một câu lỗi có tên gói.
const THROWING_SHIM = path.join(SHIM_DIR, 'node-only.js');
const NEUTRAL_OVERRIDES = {
  module: path.join(SHIM_DIR, 'module.js'),
  zlib: path.join(SHIM_DIR, 'zlib.js'),
  fs: path.join(SHIM_DIR, 'fs.js'),
  url: path.join(SHIM_DIR, 'url.js'),
  os: path.join(SHIM_DIR, 'os.js'),
  path: path.join(SHIM_DIR, 'path.js'),
  http: THROWING_SHIM,
  https: THROWING_SHIM,
  jszip: path.join(root, 'node_modules', 'jszip', 'dist', 'jszip.min.js')
};

/**
 * Mở pdf.js `v1.10.100` — bản duy nhất `pdf-parse` chạy.
 *
 * `pdf-parse` viết `require(\`./pdf.js/${options.version}/build/pdf.js\`)` với
 * `options.version` mặc định `v1.10.100`. esbuild không tĩnh hoá được chuỗi đó,
 * nên các bản dựng còn lại (v1.9.426, v1.10.88, v2.0.550 — thư mục trong gói,
 * không phải gói riêng) cũng bị gom vào cùng một `require`, kéo theo ba bản
 * `pdf.js` nữa với những câu `require('zlib')`/`require('http')`/… khác nhau.
 * Trỏ MỌI đường `pdf.js/<bản>/build/pdf.js` về bản 1.10.100 thì nhánh chết đó
 * biến mất, và bundle giữ đúng một bản pdf.js.
 */
const PDF_BUILD = path.join(root, 'node_modules', 'pdf-parse', 'lib', 'pdf.js');
const PDFJS_ENTRY = path.join(PDF_BUILD, 'v1.10.100', 'build', 'pdf.js');
const pdfPathsPlugin = {
  name: 'eg-pdf-paths',
  setup(build) {
    build.onResolve({ filter: /pdf\.js\/v\d+\.\d+\.\d+\/build\/pdf\.js$/ }, () => ({ path: PDFJS_ENTRY }));
  }
};

async function bundleModule(entry, neutral = false) {
  const result = await esbuild.build({
    entryPoints: [path.join(root, entry)],
    external: ['node:crypto'],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'neutral',
    // Bản TRÌNH DUYỆT của mammoth/jszip nằm sau `browser` của từng gói; thiếu nó
    // thì mammoth mở zip bằng luồng Node. Chỉ slot `neutral` mới cần (bundle của
    // luật đọc đúng như cũ), nên khai theo điều kiện cùng các thứ dưới.
    mainFields: neutral ? ['browser', 'module', 'main'] : ['module', 'main'],
    target: 'es2022',
    minify: true,
    legalComments: 'none',
    logLevel: 'silent',
    ...(neutral
      ? {
          alias: NEUTRAL_OVERRIDES,
          plugins: [pdfPathsPlugin],
          nodePaths: [path.join(root, 'node_modules')]
        }
      : {})
  });
  let text = result.outputFiles[0].text.trim();
  // Đúng một lần: nhiều hơn nghĩa là một module khác cũng gọi crypto, và thay
  // hết sẽ giấu mất chỗ cần xem lại.
  const uses = text.split(UUID_REQUIRE).length - 1;
  if (uses > 1) throw new Error(`${entry}: ${uses} chỗ gọi UUID — chỉ chấp nhận một.`);
  text = uses === 1 ? text.split(UUID_REQUIRE).join(UUID_FALLBACK) : text;
  if (neutral) {
    // Hàm `require` GỐC của bundle là chỗ thư viện đọc tệp vẫn gọi vào. Thay nó
    // bằng một hàm báo lỗi CÓ TÊN GÓI, để bundle thiếu một mảnh là hỏng lúc dựng
    // (phép so ngay dưới) chứ không hỏng lúc giáo viên bấm nút.
    //
    // Thay hai lời gọi `__eg_require` TRƯỚC khi chèn: `neutral-globals.js` (tệp
    // nguồn) cũng nhắc đúng hai chuỗi đó trong chú thích, và một lần thay sau khi
    // chèn sẽ biến chú thích thành lời gọi — chính nó làm cổng báo còn `require`.
    text = text
      .replace(/require\(\s*["']module["']\s*\)/g, '__eg_require("module")')
      .replace(/require\(\s*["']node:crypto["']\s*\)/g, '__eg_require("node:crypto")');
    const injected = fs.readFileSync(path.join(SHIM_DIR, 'neutral-globals.js'), 'utf8');
    text = injected + '\n' + text;
  }
  const leftover = /require\(["'](?:node:)?(?:fs|os|child_process|worker_threads|vm|module|crypto|zlib|http|https|url|stream|util|events|buffer|path)["']\)/.exec(text);
  if (leftover) {
    throw new Error(`${entry}: bundle vẫn còn ${leftover[0]} của module lõi Node — V8 nhúng không có module nào.`);
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

async function build() {
  let source = fs.readFileSync(templatePath, 'utf8');
  for (const { slot, entry, neutral } of SLOTS) {
    source = fill(source, slot, await bundleModule(entry, Boolean(neutral)));
  }
  const header = `// TỆP SINH TỰ ĐỘNG bởi scripts/build-embedded-js.js. Đừng sửa tay.\n` +
    `// Nguồn: src-tauri/src/embedded/template.js + ${SLOTS.map(entry => entry.entry).join(', ')}\n`;
  return header + source;
}

async function main() {
  const check = process.argv.includes('--check');
  const next = await build();
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

if (require.main === module) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

module.exports = { build, SLOTS };
