// measure-boot.js — đo thời gian mở app theo từng giai đoạn, trên máy thật.
//
// Vì sao cần script này: kế hoạch tối ưu hiệu năng (docs/archive/specs/perf-optimization-plan.md)
// đưa ra "300–600 ms" mà không có số đo; và `file://` thì KHÔNG sinh ra Resource Timing
// nào, nên không thể tách nhỏ 66 thẻ <script>. Cách đo được chấp nhận ở đây là một dòng
// log do chính main.ts ghi: `app.boot.phases` (markBoot/logBootPhases), tính từ
// `performance.now()` — tức từ lúc process khởi sinh, cộng thêm mốc `did-finish-load`
// của trang. Script này chỉ việc nạp lại N lần và đọc dòng đó.
//
// Chạy:  npm run build && node scripts/measure-boot.js [so_lan] [--fresh]
//   so_lan  : số lần nạp lại, mặc định 3
//   --fresh : xoá hồ sơ đo trước khi bắt đầu (lần đầu tiên còn gồm cả seeding DB)
// Đặt EDUGAME_BOOT_TRACE=1 để dòng log kèm theo 12 module `require` đắt nhất.
//
// Hồ sơ đo nằm trong %TEMP% và bị xoá khi kết thúc — không đụng tới dữ liệu của giáo viên.
'use strict';

const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const RUNS = Math.max(1, Number(process.argv.find(a => /^\d+$/.test(a)) || 3));
const FRESH = process.argv.includes('--fresh');
const PORT = Number(process.env.EDUGAME_BOOT_PORT || 9421);
const PROFILE = path.join(os.tmpdir(), 'edugame-boot-measure');
const MAIN_ENTRY = path.join(ROOT, 'dist', 'src', 'main.js');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function dayStamp(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function electronBinary() {
  // `require('electron')` từ node thường trả về đường dẫn binary. ELECTRON_RUN_AS_NODE
  // (agent Bash đặt sẵn) phải bị xoá, nếu không Electron chạy như node và không mở cửa sổ.
  if (process.env.ELECTRON_RUN_AS_NODE) delete process.env.ELECTRON_RUN_AS_NODE;
  const binary = require('electron');
  if (typeof binary !== 'string' || !fs.existsSync(binary)) throw new Error('Không tìm thấy Electron binary — chạy `npm install` trong repo.');
  return binary;
}

function killTree(pid) {
  if (process.platform === 'win32') {
    // `Stop-Process`/`taskkill` thường không đủ: tiến trình Electron là cả một cây.
    try { execFileSync('taskkill', ['/F', '/T', '/PID', String(pid)], { stdio: 'ignore' }); } catch {}
  } else {
    try { process.kill(-pid, 'SIGKILL'); } catch { try { process.kill(pid, 'SIGKILL'); } catch {} }
  }
}

function logFile() {
  return path.join(PROFILE, 'edugame-data', 'logs', `ai-${dayStamp(new Date())}.jsonl`);
}

/** Dòng `app.boot.phases` cuối cùng trong log, hoặc `null`. */
function readBootLine() {
  try {
    const found = fs.readFileSync(logFile(), 'utf8').split('\n').filter(Boolean).map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(entry => entry && entry.event === 'app.boot.phases');
    return found.length ? found[found.length - 1] : null;
  } catch {
    return null;
  }
}

async function runOnce(binary) {
  const env = { ...process.env, EDUGAME_USER_DATA: PROFILE };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(binary, ['.', `--remote-debugging-port=${PORT}`,
    // Cửa sổ không ở tiền cảnh khiến Chromium tạm dừng rAF và hẹn giờ ~1/s; các mốc
    // dưới đây cần vòng lặp chạy bình thường mới phản ánh máy của giáo viên.
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'],
  { cwd: ROOT, env, stdio: 'ignore' });
  const deadline = Date.now() + 90000;
  let entry = null;
  while (Date.now() < deadline && !entry) {
    await sleep(100);
    entry = readBootLine();
  }
  killTree(child.pid);
  await sleep(1200);
  // Xoá log để lần nạp sau không đọc lại dòng của lần này.
  try { fs.writeFileSync(logFile(), ''); } catch {}
  return entry;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
}

function table(runs) {
  const keys = [...new Set(runs.flatMap(run => Object.keys(run.phases)))];
  const head = ['lần', 'tổng', ...keys];
  const rows = runs.map((run, index) => [String(index + 1), String(run.totalMs), ...keys.map(key => String(run.phases[key] ?? '-'))]);
  const widths = head.map((title, column) => Math.max(title.length, ...rows.map(row => row[column].length)));
  const line = cells => cells.map((cell, column) => cell.padStart(widths[column])).join('  ');
  return [line(head), ...rows.map(line)].join('\n');
}

(async () => {
  if (!fs.existsSync(MAIN_ENTRY)) throw new Error('Thiếu dist/src/main.js — chạy `npm run build` trước.');
  const binary = electronBinary();
  if (FRESH) { try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {} await sleep(400); }
  console.log(`Đo ${RUNS} lần nạp, hồ sơ ${PROFILE}${FRESH ? ' (làm mới)' : ''}${process.env.EDUGAME_BOOT_TRACE ? ', có EDUGAME_BOOT_TRACE' : ''}`);
  const runs = [];
  for (let index = 0; index < RUNS; index += 1) {
    const entry = await runOnce(binary);
    if (!entry) {
      console.error(`Lần ${index + 1}: KHÔNG có dòng app.boot.phases trong ${logFile()} — app không nạp xong hoặc log bị giữ bởi instance khác.`);
      process.exitCode = 1;
      break;
    }
    runs.push({ totalMs: entry.data.totalMs, phases: entry.data.phases, topRequires: entry.data.topRequires });
    console.log(`lần ${index + 1}: ${entry.data.totalMs} ms`);
  }
  if (!runs.length) { process.exitCode = process.exitCode || 1; return; }
  console.log('\n' + table(runs));
  const numbers = runs.map(run => run.totalMs);
  console.log(`\nmedian tổng: ${median(numbers)} ms  (min ${Math.min(...numbers)}, max ${Math.max(...numbers)})`);
  console.log('Đơn vị: ms cho từng giai đoạn, cộng dồn theo thứ tự; "documentLoaded" là từ tạo cửa sổ tới khi trang chạy xong toàn bộ <script>.');
  const withTrace = runs.find(run => run.topRequires);
  if (withTrace) {
    console.log('\n12 module `require` đắt nhất (bao gồm cả thời gian của nhánh nó nạp theo):');
    for (const item of withTrace.topRequires) console.log(`  ${String(item.ms).padStart(5)}  ${item.request}`);
  } else {
    console.log('\n(đặt EDUGAME_BOOT_TRACE=1 để xem 12 module `require` đắt nhất)');
  }
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
})().catch(error => {
  console.error('measure-boot: ' + (error && error.message ? error.message : error));
  process.exitCode = 1;
});
