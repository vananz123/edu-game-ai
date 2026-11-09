// measure-tauri-shell.js — đo ba hạn mức của #251 trên vỏ Tauri ĐÃ ĐÓNG GÓI.
//
//   node scripts/measure-tauri-shell.js [--runs 5] [--port 9561]
//
// Đo:
//   - kích thước binary (MiB) và bộ cài NSIS nếu đã dựng (MiB);
//   - thời gian boot: từ lúc spawn tới `document.readyState === 'complete'`
//     (đúng phép đo baseline Electron ở báo cáo giai đoạn 0, để hai số so được);
//     ghi kèm mốc renderer render xong lần đầu (`#pageContent` có nội dung).
//   - RAM riêng (private working set) khi nhàn rỗi sau 5 s, cộng tổng cả cây
//     tiến trình (WebView2 chạy trong tiến trình con).
//
// Hạn mức #251: bộ cài ≤ 25 MiB, boot ≤ 1.200 ms, nhàn rỗi ≤ 200 MiB private.
// Không đo bằng tasklist: nó chỉ báo working set, còn ngân sách nói "private".
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { WebSocket } = require('ws');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const takeValue = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const runs = Number(takeValue('--runs', '5'));
const port = Number(takeValue('--port', '9561'));

const binary = path.join(root, 'src-tauri', 'target', 'release', 'edugame-studio-tauri.exe');
const installerDir = path.join(root, 'src-tauri', 'target', 'release', 'bundle', 'nsis');
const MiB = (bytes) => (bytes / 1024 / 1024).toFixed(2);

function privateBytes(pid) {
  const script = `$p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if ($p) { "$($p.Id) $($p.PrivateMemorySize64)" }`;
  const text = execFileSync('powershell', ['-NoProfile', '-Command', script], { encoding: 'utf8' }).trim();
  if (!text) return null;
  const [, bytes] = text.split(/\s+/);
  return Number(bytes);
}

// Cây tiến trình: vỏ Tauri + các tiến trình WebView2 cùng tên/cha. Dùng
// ParentProcessId nên không phụ thuộc tên, và không bắt nhầm Electron.
function processTree(rootPid) {
  const script = [
    '$all = Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId',
    `$pids = @(${rootPid})`,
    'do { $added = @($all | Where-Object { $pids -contains $_.ParentProcessId -and $pids -notcontains $_.ProcessId } | ForEach-Object { $_.ProcessId }); $pids += $added } while ($added.Count -gt 0)',
    '$pids -join ","',
  ].join('; ');
  const text = execFileSync('powershell', ['-NoProfile', '-Command', script], { encoding: 'utf8' }).trim();
  return text ? text.split(',').map(Number) : [];
}

// Hồ sơ WebView2 mới cho mỗi lần chạy: trình duyệt còn giữ vài tệp `.log`/khoá
// vài trăm ms sau khi tiến trình vỏ thoát, nên xoá-và-dùng-lại cùng thư mục sẽ
// gặp EBUSY trên Windows.
let runIndex = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function bootOnce() {
  runIndex += 1;
  const profile = path.join(os.tmpdir(), `eg-tauri-measure-${process.pid}-${runIndex}`);
  fs.rmSync(profile, { recursive: true, force: true });
  const started = Date.now();
  const child = spawn(binary, [], {
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
      WEBVIEW2_USER_DATA_FOLDER: profile,
    },
    stdio: 'ignore',
  });

  let pageTarget = null;
  for (let attempt = 0; attempt < 200 && !pageTarget; attempt += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      pageTarget = Array.isArray(list) ? list.find((x) => x.type === 'page') : null;
    } catch {}
    if (!pageTarget) await sleep(25);
  }
  if (!pageTarget) throw new Error('CDP không lên trong 5 s');
  const cdpMs = Date.now() - started;

  // Hai mốc: `complete` là chỉ số #251 (cùng định nghĩa với baseline Electron);
  // `painted` ghi thêm để thấy renderer còn mất bao lâu sau khi tài liệu xong.
  let complete = null;
  let painted = null;
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  const evaluate = (expression, id) =>
    new Promise((resolve) => {
      const onMessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.id === id) {
          ws.removeEventListener('message', onMessage);
          resolve(data.result && data.result.result && data.result.result.value);
        }
      };
      ws.addEventListener('message', onMessage);
      ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
    });
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const state = await evaluate(
      "document.readyState + '|' + Boolean(document.getElementById('pageContent') && document.getElementById('pageContent').innerText.trim().length > 0)",
      1000 + attempt,
    );
    const [phase, hasContent] = String(state).split('|');
    const now = Date.now();
    if (phase === 'complete' && complete === null) complete = now;
    if (hasContent === 'true' && painted === null) painted = now;
    if (complete !== null && painted !== null) break;
    await sleep(25);
  }
  if (complete === null) throw new Error('tài liệu không đạt readyState=complete trong 10 s');
  const bootMs = complete - started;
  const paintedMs = painted === null ? null : painted - started;

  await sleep(5000);
  const pids = processTree(child.pid);
  let idle = 0;
  for (const pid of pids) idle += privateBytes(pid) || 0;
  ws.close();
  child.kill();
  // Diệt cả cây: `child.kill()` chỉ hạ tiến trình vỏ, WebView2 con vẫn sống.
  const stragglers = processTree(child.pid);
  for (const pid of stragglers) {
    try {
      execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {}
  }
  await sleep(800);
  // Dọn là tuỳ nghi: WebView2 có thể còn giữ tệp vài giây sau taskkill. Hồ sơ nằm
  // trong thư mục tạm và mỗi lần chạy một thư mục mới, nên bỏ sót không ảnh hưởng số đo.
  try {
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  } catch {}
  return { bootMs, paintedMs, cdpMs, idle, pids: pids.length };
}

(async () => {
  if (!fs.existsSync(binary)) {
    console.error(`Không thấy binary: ${binary} — chạy \`npm run tauri:check\` trước.`);
    process.exit(1);
  }
  console.log(`binary: ${MiB(fs.statSync(binary).size)} MiB`);
  if (fs.existsSync(installerDir)) {
    for (const name of fs.readdirSync(installerDir)) {
      if (name.endsWith('.exe')) console.log(`installer: ${MiB(fs.statSync(path.join(installerDir, name)).size)} MiB (${name})`);
    }
  } else {
    console.log('installer: chưa dựng (bundle.targets = nsis; cần tauri-bundler)');
  }

  const boots = [];
  const paints = [];
  const idles = [];
  for (let run = 1; run <= runs; run += 1) {
    const { bootMs, paintedMs, cdpMs, idle, pids } = await bootOnce();
    boots.push(bootMs);
    paints.push(paintedMs === null ? bootMs : paintedMs);
    idles.push(idle);
    const paint = paintedMs === null ? 'n/a' : paintedMs;
    console.log(`run ${run}: boot ${bootMs} ms (CDP lên ở ${cdpMs} ms, render xong ${paint} ms) · idle ${MiB(idle)} MiB private (${pids} tiến trình)`);
  }
  const median = (values) => values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const bootMedian = median(boots);
  const paintMedian = median(paints);
  const idleMedian = median(idles);
  console.log('');
  console.log(`boot trung vị: ${bootMedian} ms  (hạn mức 1200 ms, spawn → readyState=complete) → ${bootMedian <= 1200 ? 'ĐẠT' : 'VƯỢT'}`);
  console.log(`render xong trung vị: ${paintMedian} ms  (thông tin thêm, không phải chỉ số #251)`);
  console.log(`idle trung vị: ${MiB(idleMedian)} MiB private (hạn mức 200 MiB) → ${idleMedian <= 200 * 1024 * 1024 ? 'ĐẠT' : 'VƯỢT'}`);
})();
