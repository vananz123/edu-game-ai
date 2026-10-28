#!/usr/bin/env node
/**
 * Runner cho bộ unit test (`npm test`).
 *
 * Vì sao có file này: `package.json` từng chứa một chuỗi 55 lệnh `node
 * dist/tests/unit/....test.js` nối bằng `&&`. Mỗi lần thêm một test phải sửa
 * chuỗi dài đó, và quên sửa thì test mới không bao giờ chạy ("silently rots" —
 * xem tests/README.md).
 *
 * Cách dùng:
 *   node tests/run-unit.js             # chạy toàn bộ tests/unit/*.test.ts đã biên dịch
 *   node tests/run-unit.js lesson      # chỉ chạy các file khớp "lesson"
 *
 * Thứ tự chạy: đọc các `require('./x.test.js')` trong bản dịch để phát hiện test
 * nào phụ thuộc test nào, rồi sắp xếp theo phụ thuộc (fallback: theo tên file).
 * Lý do: `ai-manager.test.js` gán stub cho module con trước khi test khác dùng,
 * và thứ tự cũ trong `package.json` đã được kiểm chứng; sắp xếp theo phụ thuộc
 * cho lại đúng thứ tự đó mà không phải viết tay.
 *
 * Lưu ý: test nạp module từ `dist/src/...`, nên phải chạy `npm run build` trước.
 */
'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const unitDir = path.join(__dirname, '..', 'dist', 'tests', 'unit');
if (!fs.existsSync(unitDir)) {
  console.error('Không tìm thấy dist/tests/unit — chạy `npm run build` trước.');
  process.exit(1);
}

const filter = process.argv[2] || '';

/** @type {string[]} */
const files = fs.readdirSync(unitDir).filter(name => name.endsWith('.test.js')).sort();

if (files.length === 0) {
  console.error('dist/tests/unit không có *.test.js nào.');
  process.exit(1);
}

/**
 * Suite cần native module không tải được bằng Node thuần.
 * `lesson-store.test.js` mở better-sqlite3, nhưng bản dựng cho Electron không
 * nạp được trong `node`: ERR_DLOPEN_FAILED. Suite này chạy bằng Electron runner
 * (`tests/manual/run-electron-node.js`). Danh sách test cũ cũng đã bỏ nó vì lý
 * do này.
 */
const NODE_INCOMPATIBLE = ['lesson-store.test.js'];
const usable = files.filter(name => !NODE_INCOMPATIBLE.includes(name));

const NODE_RUNNER = { command: process.execPath, args: target => [target] };
const ELECTRON_RUNNER = {
  command: require('electron'),
  args: target => [path.join(__dirname, 'manual', 'run-electron-node.js'), target]
};

const selected = usable.filter(name => name.includes(filter));
// `node tests/run-unit.js lesson-store` targets the native suite below.
const nativeSelected = filter
  ? files.filter(name => NODE_INCOMPATIBLE.includes(name) && name.includes(filter))
  : [];
if (selected.length === 0 && nativeSelected.length === 0) {
  console.error(`Không có suite nào khớp "${filter}".`);
  process.exit(1);
}

/** test file -> các test file khác mà nó `require` (chỉ trong cùng thư mục). */
const dependencies = new Map();
for (const name of selected) {
  const source = fs.readFileSync(path.join(unitDir, name), 'utf8');
  const deps = [];
  const pattern = /require\((['"])\.\/([^'"]+\.test\.js)\1\)/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    if (match[2] !== name) deps.push(match[2]);
  }
  dependencies.set(name, deps);
}

const ordered = [];
const state = new Map();
const visit = (name, trail) => {
  if (state.get(name) === 'done') return;
  if (state.get(name) === 'visiting') {
    // Có vòng phụ thuộc giữa test: giữ nguyên thứ tự tên, không chặn build.
    return;
  }
  state.set(name, 'visiting');
  for (const dep of dependencies.get(name) || []) {
    if (selected.includes(dep)) visit(dep, trail.concat(name));
  }
  state.set(name, 'done');
  ordered.push(name);
};
for (const name of selected) visit(name, []);

const started = Date.now();
const failures = [];
const runOne = (name, runner) => {
  const result = spawnSync(runner.command, runner.args(path.join(unitDir, name)), {
    stdio: 'inherit',
    env: { ...process.env, NODE_OPTIONS: '' }
  });
  if (result.status !== 0) failures.push(name);
};
for (const name of ordered) runOne(name, NODE_RUNNER);

// Native-module suites: only when explicitly requested (they need Electron's ABI).
for (const name of nativeSelected) runOne(name, ELECTRON_RUNNER);
const ran = ordered.length + nativeSelected.length;

const seconds = ((Date.now() - started) / 1000).toFixed(1);
if (failures.length) {
  console.error(`\n${failures.length}/${ran} suite thất bại sau ${seconds}s:`);
  for (const name of failures) console.error('  - ' + name);
  process.exit(1);
}
console.log(`\n${ran}/${ran} suite unit đã qua (${seconds}s).`);
