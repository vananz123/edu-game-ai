#!/usr/bin/env node
/**
 * Dụng cụ đo P3 (#197): nhịp poll **thật** của thanh trạng thái AI trong Electron thật.
 *
 * `tests/unit/ai-status-poll.test.ts` đã chứng minh cơ chế đặt nhịp (đọc `ms` mà module
 * truyền vào `setInterval`). File này trả lời câu hỏi còn lại mà unit test không với tới:
 * **trong app thật** trình duyệt có đặt đúng nhịp đó và có fire đúng số lần không — vì
 * ở đó còn `visibilityState` thật, `render()` của cả trang, và các lần poke
 * `window.refreshAiStatusBar()` từ wizard/chat.
 *
 * Cách đo: `src/renderer/features/ai-status.ts` chạy trong IIFE nên không móc được vào
 * hàm của nó, và `window.eduGame` do contextBridge expose thì **bất biến** (không record
 * được lời gọi IPC ở đó). Vì vậy shim `setInterval` được tiêm **trước** script của trang
 * bằng `Page.addScriptToEvaluateOnNewDocument` + `Page.reload`: module sẽ gọi đúng shim
 * này khi đặt hẹn giờ, và ta đếm số lần fire thật.
 *
 * Chạy:  npm run build
 *        node scripts/measure-idle-poll.js [giây đo] [port]
 * Mặc định 30 s, port 9431, hồ sơ `%TEMP%/edugame-boot-measure` (hồ sơ ấm của
 * `measure-boot.js`, để không bị màn hình cài đặt lần đầu chắn mất thanh trạng thái).
 *
 * Ý nghĩa số: mỗi lượt `refresh()` = hai vòng IPC (`ai:getStatus` + `aiTasks:list`).
 * Nhàn rỗi phải ra ~1 nhịp/10 s; nhịp cũ 2 s cho 15 lượt trên cửa sổ 30 s.
 */
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const WINDOW_MS = Math.max(5000, Number(process.argv[2] || 30) * 1000);
const PORT = Number(process.argv[3] || process.env.CDP_PORT || 9431);
const PROFILE = process.env.EDUGAME_USER_DATA || path.join(os.tmpdir(), 'edugame-boot-measure');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Chạy trong trang, trước mọi script của app. Ghi lại **từng** hẹn giờ được đặt:
 * nhịp bao nhiêu, đặt lúc nào, còn chạy hay đã bị huỷ, và đã fire bao nhiêu lần.
 */
const SHIM = `(() => {
  const realSet = window.setInterval, realClear = window.clearInterval;
  const list = [];
  window.__intervals = () => list.map(e => ({ ms: e.ms, fires: e.fires, created: e.created, live: e.live }));
  window.setInterval = function (fn, ms) {
    const entry = { ms: Number(ms) || 0, fires: 0, created: Math.round(performance.now()), live: true, id: null };
    list.push(entry);
    const wrapped = function () {
      entry.fires++;
      return typeof fn === 'function' ? fn.apply(this, arguments) : undefined;
    };
    entry.id = realSet.call(window, wrapped, ms);
    return entry.id;
  };
  window.clearInterval = function (id) {
    for (const e of list) if (e.id === id) e.live = false;
    return realClear.apply(window, arguments);
  };
})()`;

function electronBinary() {
  // ELECTRON_RUN_AS_NODE do shell của agent đặt sẵn phải bị xoá, nếu không Electron chạy
  // như node và không mở cửa sổ.
  if (process.env.ELECTRON_RUN_AS_NODE) delete process.env.ELECTRON_RUN_AS_NODE;
  const binary = require('electron');
  if (typeof binary !== 'string' || !fs.existsSync(binary)) throw new Error('Không tìm thấy Electron binary — chạy `npm install` trong repo.');
  return binary;
}

function killTree(pid) {
  if (process.platform === 'win32') {
    try { execFileSync('taskkill', ['/F', '/T', '/PID', String(pid)], { stdio: 'ignore' }); } catch {}
  } else {
    try { process.kill(-pid, 'SIGKILL'); } catch { try { process.kill(pid, 'SIGKILL'); } catch {} }
  }
}

async function findTarget() {
  for (let i = 0; i < 90; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await response.json();
      const target = list.find(item => item.type === 'page' && /index\.html/.test(item.url));
      if (target) return target;
    } catch {}
    await sleep(1000);
  }
  throw new Error('Không thấy trang index.html trên CDP port ' + PORT);
}

(async () => {
  const binary = electronBinary();
  const env = { ...process.env, EDUGAME_USER_DATA: PROFILE };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(binary, ['.', `--remote-debugging-port=${PORT}`,
    // Window không ở tiền cảnh khiến Chromium throttling hẹn giờ; số nhịp ở đây cần
    // vòng lặp chạy bình thường mới phản ánh máy giáo viên.
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'],
    { cwd: ROOT, env, stdio: 'ignore' });

  let ws;
  let nextId = 1;
  const pending = new Map();
  const send = (method, params = {}) => new Promise(resolve => {
    const id = nextId++;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result && result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception && result.exceptionDetails.exception.description
        ? result.exceptionDetails.exception.description : JSON.stringify(result.exceptionDetails).slice(0, 200));
    }
    return result && result.result && result.result.value;
  };

  try {
    console.log(`Đo nhịp poll ${WINDOW_MS / 1000} s · hồ sơ ${PROFILE} · CDP ${PORT}`);
    const target = await findTarget();
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', reject, { once: true });
    });
    ws.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id && pending.has(message.id)) { pending.get(message.id)(message.result); pending.delete(message.id); }
    });
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: SHIM });
    await send('Page.reload');
    // Trang vừa nạp lại: chờ script của app chạy xong và thanh AI kịp đặt hẹn giờ đầu.
    await sleep(6000);
    const status = await evaluate('document.readyState + " · bar=" + Boolean(document.getElementById("aiStatusBar"))'
      + ' + " · runtime=" + ((document.getElementById("aiStatusRuntime")||{}).textContent||"")');
    console.log('Trạng thái: ' + status);
    const before = await evaluate('window.__intervals()');
    await sleep(WINDOW_MS);
    const after = await evaluate('window.__intervals()');
    console.log('Cửa sổ đo: ' + await evaluate('document.visibilityState + " (focused=" + document.hasFocus() + ")"'));

    const rows = after.map(entry => {
      const old = before.find(item => item.created === entry.created && item.ms === entry.ms);
      return { ms: entry.ms, createdMs: entry.created, live: entry.live, fires: entry.fires - (old ? old.fires : 0) };
    });
    const poll = rows.filter(row => row.ms === 2000 || row.ms === 10000);
    for (const row of rows) console.log('  hẹn giờ ' + row.ms + ' ms · đặt lúc ' + row.createdMs + ' ms · ' + (row.live ? 'còn chạy' : 'đã huỷ') + ' · ' + row.fires + ' lần fire');

    const fires = poll.reduce((sum, row) => sum + row.fires, 0);
    const seconds = WINDOW_MS / 1000;
    const oldFires = Math.round(WINDOW_MS / 2000);
    console.log('');
    console.log(`Nhịp poll trong ${seconds} s nhàn rỗi: ${fires} lượt refresh`
      + ` (${poll.map(row => row.ms + 'ms').join(' + ') || 'không có'}) = ${(fires / seconds).toFixed(3)} Hz`);
    console.log(`So với nhịp cứng 2 s của bản cũ: ~${oldFires} lượt ⇒ ${fires === 0 ? 'tắt hẳn' : Math.round((1 - fires / oldFires) * 100) + ' % ít hơn'}.`);
    if (!poll.length) {
      console.error('Không thấy hẹn giờ 2000/10000 ms nào — module đã không đặt nhịp, kiểm tra lại.');
      process.exitCode = 1;
    }
  } finally {
    try { if (ws) ws.close(); } catch {}
    killTree(child.pid);
  }
})().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
