// @ts-nocheck -- unit tests share one global script scope (moduleDetection: legacy), as the other suites do.
/*
 * P3 của kế hoạch tối ưu hiệu năng: thanh trạng thái AI không được gọi IPC theo nhịp
 * cố định 2 giây nữa.
 *
 * Mỗi lần `refresh()` là hai vòng IPC (`ai:getStatus` + `aiTasks:list`) rồi render lại.
 * Chạy suốt buổi dạy là hàng chục nghìn lần, kể cả khi giáo viên đang chiếu trò chơi và
 * chẳng có tác vụ AI nào. Nay: nhàn rỗi 10 giây, có thứ gì đang chuyển động thì 2 giây,
 * cửa sổ ẩn thì tắt hẳn.
 *
 * Test nạp module thật (`dist/src/renderer/features/ai-status.js`) trong một realm vm cô
 * lập với DOM và IPC tối giản, rồi đọc nhịp đang thực sự được đặt — không suy luận từ
 * mã nguồn:
 *   1. khởi động, chưa có gì chạy    → 10000 ms
 *   2. có tác vụ queued/running      → 2000 ms
 *   3. hết tác vụ                    → về 10000 ms
 *   4. runtime STARTING              → 2000 ms
 *   5. cửa sổ ẩn                     → không còn hẹn giờ nào
 *   6. hiện lại                      → đặt lại nhịp, nhanh hay chậm tuỳ trạng thái
 * Hai kiểm tra tĩnh cuối giữ thiết kế: chỉ một chỗ đặt hẹn giờ và không còn
 * `setInterval(..., POLL_MS)` cứng.
 *
 * Chạy sau `npm run build`: node tests/unit/ai-status-poll.test.js
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RUN_DIR = path.join(__dirname, '..', '..');
const SOURCE_ROOT = path.basename(RUN_DIR) === 'dist' ? path.join(RUN_DIR, '..') : RUN_DIR;
const MODULE_FILE = path.join(SOURCE_ROOT, 'dist', 'src', 'renderer', 'features', 'ai-status.js');
const SOURCE_FILE = path.join(SOURCE_ROOT, 'src', 'renderer', 'features', 'ai-status.ts');

const suite = [];
function check(name, fn) { suite.push({ name, fn }); }

/**
 * Nạp module thật. Mọi thứ module chạm tới đều ở trong một realm riêng: hẹn giờ không
 * tự chạy (test tick thủ công), `document.visibilityState` đổi được, IPC trả về đúng
 * kịch bản test đặt.
 */
function loadModule() {
  const timers = { intervals: new Map(), nextId: 1, queued: [] };
  const visibilityListeners = [];
  const doc = {
    readyState: 'complete',
    visibilityState: 'visible',
    documentElement: {},
    getElementById() { return null; },
    addEventListener(name, handler) { if (name === 'visibilitychange') visibilityListeners.push(handler); },
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };

  const status = { current: { state: 'STOPPED', modelId: null, message: '' } };
  const tasks = { live: [] };
  const calls = [];
  const windowObject = {
    eduGame: {
      getLocalRuntimeStatus: async () => { calls.push('status'); return status.current; },
      getLocalAiModels: async () => { calls.push('models'); return { models: [], machine: {} }; },
      listAiTasks: async () => { calls.push('tasks'); return { live: tasks.live, history: [] }; }
    }
  };

  const sandbox = {
    console,
    window: windowObject,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    // `state` là biến cấp cao nhất của shared.js trong app thật.
    state: { page: 'library', localAiModels: [], localAiMachine: {} },
    toast: () => {},
    document: doc,
    setInterval(fn, ms) {
      const id = timers.nextId++;
      timers.intervals.set(id, { ms, fn });
      return id;
    },
    clearInterval(id) { timers.intervals.delete(id); },
    setTimeout(fn) { timers.queued.push(fn); return timers.queued.length; },
    clearTimeout() {}
  };
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(MODULE_FILE, 'utf8'), context, { filename: 'ai-status.js' });

  return {
    windowObject,
    status,
    tasks,
    calls,
    /** Nhịp thực sự đang được đặt, hoặc `null` khi không còn hẹn giờ nào. */
    armed() {
      const live = [...timers.intervals.values()];
      if (!live.length) return null;
      assert.equal(live.length, 1, 'thanh AI phải có đúng một hẹn giờ, thấy ' + live.length);
      return live[0].ms;
    },
    /** Chạy các callback `setTimeout(init, 0)` mà module tự xếp khi nạp. */
    drain() {
      const pending = timers.queued.splice(0, timers.queued.length);
      pending.forEach(fn => fn());
      return pending.length;
    },
    /** Cho hẹn giờ thật của nó chạy một nhịp, như trình duyệt sẽ làm. */
    tick() {
      const live = [...timers.intervals.values()];
      live.forEach(item => item.fn());
      return live.length;
    },
    /** Đổi trạng thái hiển thị của cửa sổ và báo cho các listener như trình duyệt. */
    setVisible(value) {
      doc.visibilityState = value;
      visibilityListeners.slice().forEach(handler => handler());
    }
  };
}

/** hai lượt microtask: đủ cho `refresh()` của hẹn giờ trong nhịp giả. */
async function flush() {
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setTimeout(resolve, 0));
}

async function refreshBar(harness) { await harness.windowObject.refreshAiStatusBar(); }

check('module thật tồn tại sau khi build', () => {
  assert.ok(fs.existsSync(MODULE_FILE), 'thiếu ' + MODULE_FILE + ' — chạy `npm run build` trước.');
});

check('khởi động, chưa có gì chạy: nhịp 10 giây chứ không phải 2 giây', async () => {
  const harness = loadModule();
  assert.equal(harness.drain(), 1, 'module phải tự xếp lịch init khi readyState đã complete');
  assert.equal(harness.armed(), 10000, 'lúc nhàn rỗi phải đặt POLL_IDLE_MS');
  await refreshBar(harness);
  assert.equal(harness.armed(), 10000, 'refresh lúc nhàn rỗi không được đổi nhịp');
});

check('có tác vụ running: nhịp về 2 giây; hết tác vụ: về 10 giây', async () => {
  const harness = loadModule();
  harness.drain();
  harness.tasks.live = [{ requestId: 'r-1', state: 'running', progress: 'generate', startedAt: '2026-11-04T00:00:00Z' }];
  await refreshBar(harness);
  assert.equal(harness.armed(), 2000, 'tác vụ đang chạy phải được theo sát mỗi 2 giây');
  harness.tasks.live = [];
  await refreshBar(harness);
  assert.equal(harness.armed(), 10000, 'tác vụ xong rồi thì quay về nhịp nhàn rỗi');
});

check('tác vụ queued cũng tính là đang chạy', async () => {
  const harness = loadModule();
  harness.drain();
  harness.tasks.live = [{ requestId: 'r-2', state: 'queued', startedAt: '' }];
  await refreshBar(harness);
  assert.equal(harness.armed(), 2000);
});

check('llama.cpp đang khởi động: theo sát 2 giây', async () => {
  const harness = loadModule();
  harness.drain();
  harness.status.current = { state: 'STARTING', modelId: 'qwen', message: 'đang nạp model' };
  await refreshBar(harness);
  assert.equal(harness.armed(), 2000, 'STARTING là trạng thái giáo viên đang chờ');
});

check('cửa sổ ẩn: tắt hẳn hẹn giờ; hiện lại: nối đúng nhịp của trạng thái', async () => {
  const harness = loadModule();
  harness.drain();
  harness.tasks.live = [{ requestId: 'r-3', state: 'running', startedAt: '' }];
  await refreshBar(harness);
  assert.equal(harness.armed(), 2000);

  harness.setVisible('hidden');
  await refreshBar(harness);
  assert.equal(harness.armed(), null, 'cửa sổ ẩn mà vẫn giữ hẹn giờ thì IPC thừa vẫn chạy');

  harness.setVisible('visible');
  await refreshBar(harness);
  assert.equal(harness.armed(), 2000, 'hiện lại phải nối lại nhịp nhanh cho tác vụ còn đang chạy');

  harness.tasks.live = [];
  harness.setVisible('hidden');
  harness.setVisible('visible');
  await refreshBar(harness);
  assert.equal(harness.armed(), 10000, 'hiện lại lúc không có tác vụ thì về nhịp chậm');
});

check('chính nhịp tự chạy cũng đổi tốc độ, không chỉ khi refresh từ ngoài', async () => {
  const harness = loadModule();
  harness.drain();
  await refreshBar(harness);
  assert.equal(harness.armed(), 10000);
  harness.tasks.live = [{ requestId: 'r-4', state: 'running', startedAt: '' }];
  assert.equal(harness.tick(), 1, 'phải còn đúng một hẹn giờ để tick');
  await flush();
  assert.equal(harness.armed(), 2000, 'tác vụ xuất hiện giữa hai nhịp vẫn phải được nhận ra');
});

// ----------------------------------------------------------------- thiết kế: giữ nguyên

check('chỉ một chỗ đặt hẹn giờ và không còn nhịp cứng POLL_MS', () => {
  const text = fs.readFileSync(SOURCE_FILE, 'utf8');
  const sites = text.split('\n').filter(line => /setInterval\(/.test(line));
  assert.equal(sites.length, 1, 'phải có đúng một chỗ đặt hẹn giờ: ' + sites.join(' | '));
  assert.match(sites[0], /refresh\(\)\.catch/, 'hẹn giờ duy nhất phải là nhịp poll: ' + sites[0]);
  assert.doesNotMatch(text, /setInterval\([^)]*POLL_MS\)/, 'không còn `setInterval(…, POLL_MS)`');
});

check('reschedulePoll() được gọi từ init, refresh, lúc ẩn cửa sổ và lúc mở menu', () => {
  const text = fs.readFileSync(SOURCE_FILE, 'utf8');
  const callSites = text.split('\n').filter(line => /reschedulePoll\(\)/.test(line) && !/function reschedulePoll/.test(line));
  assert.ok(callSites.length >= 4, 'cần ≥4 chỗ gọi lại nhịp (init, refresh×2, ẩn cửa sổ, mở menu), thấy ' + callSites.length);
  assert.match(text, /async function refresh\(\)[\s\S]{0,400}reschedulePoll\(\);\s*\}/);
});

check('nhịp nhanh vẫn 2 giây, nhịp chậm 10 giây', () => {
  const text = fs.readFileSync(SOURCE_FILE, 'utf8');
  assert.match(text, /const POLL_MS = 2000;/);
  assert.match(text, /const POLL_IDLE_MS = 10000;/);
});

(async () => {
  let failures = 0;
  for (const item of suite) {
    try {
      await item.fn();
      console.log('PASS  ' + item.name);
    } catch (error) {
      failures++;
      console.log('FAIL  ' + item.name + ' — ' + (error && error.message ? error.message : error));
    }
  }
  if (failures) {
    console.error('\n' + failures + ' kiểm tra thất bại.');
    process.exitCode = 1;
  } else {
    console.log('\nAll ai-status poll checks passed.');
  }
})();
