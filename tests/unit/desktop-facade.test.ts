// @ts-nocheck -- unit tests share one global script scope (moduleDetection: legacy), as the other suites do.
// Façade desktop (giai đoạn 2 của kế hoạch Tauri): hợp đồng, kết quả, lỗi, luồng sự kiện.
//
// Vì sao test ở đây: sau giai đoạn 2, renderer không còn gọi `window.eduGame`. Mọi
// lỗi của vỏ (Electron từ chối một IPC, Tauri trả chuỗi lỗi, nhóm trình chiếu chưa
// có) phải đi ra dưới CÙNG một hình dạng `DesktopError` có `code`; nếu không, mỗi
// tệp renderer sẽ tự đoán lỗi theo chuỗi tiếng Việt và hỏng khác nhau ở hai vỏ.
//
// Ba adapter được nạp bằng vm, đúng cách index.html nạp chúng (script cổng thường,
// chia nhau một phạm vi). `window` giả chỉ có thứ tệp cần: `__TAURI__` hoặc `eduGame`.
//
// Chạy sau `npm run build`:  node tests/unit/desktop-facade.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..', '..');
const DIST = path.join(ROOT, 'dist', 'src', 'renderer', 'core');
const CONTRACT = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'shared', 'desktop-contract.json'), 'utf8'));
const { createFakeDesktopAdapter } = require(path.join(ROOT, 'dist', 'tests', 'unit', 'support', 'desktop-fake-adapter'));

const SCRIPTS = [
  'desktop-facade-schema.js',
  'desktop-adapter-electron.js',
  'desktop-adapter-tauri.js',
  'desktop-facade.js',
  'desktop-host.js',
];

for (const file of SCRIPTS) {
  assert.ok(fs.existsSync(path.join(DIST, file)), `${file} is missing — run npm run build`);
}

let passed = 0;
const failures = [];
async function it(name, fn) {
  try {
    await fn();
    passed += 1;
  } catch (error) {
    failures.push({ name, error });
  }
}

/** Dựng một context như `<script defer>`: cùng phạm vi, không module, không import. */
function boot(globals = {}) {
  const window = Object.assign({}, globals);
  const sandbox = {
    console,
    window,
    setTimeout,
    clearTimeout,
    Promise,
    Object,
    Array,
    Error,
    JSON,
    String,
  };
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox);
  for (const file of SCRIPTS) {
    vm.runInContext(fs.readFileSync(path.join(DIST, file), 'utf8'), context, { filename: file });
  }
  return {
    window,
    context,
    run: code => vm.runInContext(code, context),
    desktop: vm.runInContext('desktop', context),
    host: vm.runInContext('desktopHost', context),
    schema: vm.runInContext('DESKTOP_FACADE_SCHEMA', context),
  };
}

/** Cầu Electron giả: mỗi khoá của preload là một hàm ghi lại lời gọi. */
function fakeBridge(overrides = {}) {
  const calls = [];
  const listeners = new Map();
  const bridge = {};
  const record = name => (...args) => {
    calls.push({ name, args });
    const handler = overrides[name];
    if (typeof handler === 'function') return handler(...args);
    return Promise.resolve({ name });
  };
  for (const key of Object.keys(CONTRACT.invoke)) bridge[key] = record(key);
  for (const key of Object.keys(CONTRACT.send)) bridge[key] = record(key);
  for (const key of Object.keys(CONTRACT.event)) {
    bridge[key] = callback => {
      calls.push({ name: key, args: [callback] });
      const set = listeners.get(key) || new Set();
      set.add(callback);
      listeners.set(key, set);
      return () => set.delete(callback);
    };
  }
  return {
    bridge,
    calls,
    emit(key, payload) {
      let delivered = 0;
      // `onPresentationExit` dùng chung chuỗi kênh `presentation:exit` với kênh gửi
      // `sendPresentationExit`, nên lời gọi gửi đi cũng nằm trong `calls`. Ở đây chỉ
      // đếm và gọi ĐÚNG hàm đã đăng ký qua kênh sự kiện (không phải lần gửi).
      for (const callback of listeners.get(key) || []) {
        if (typeof callback === 'function') {
          callback(payload);
          delivered += 1;
        }
      }
      return delivered;
    },
    open(key) {
      return (listeners.get(key) || new Set()).size;
    },
  };
}

/**
 * `__TAURI__` giả: `core.invoke` và `event.listen`. `listen` trả Promise đúng như
 * Tauri v2, để test được đường huỷ-đăng-ký-khi-còn-đang-chờ.
 */
function fakeTauri(options = {}) {
  const invokes = [];
  const listeners = new Map();
  const api = {
    core: {
      invoke(command, payload) {
        invokes.push({ command, payload });
        const handler = options.commands && options.commands[command];
        if (typeof handler === 'function') return Promise.resolve(handler(payload));
        if (options.rejectWith) return Promise.reject(options.rejectWith);
        return Promise.resolve(undefined);
      },
    },
    event: {
      listen(name, callback) {
        const set = listeners.get(name) || new Set();
        set.add(callback);
        listeners.set(name, set);
        if (options.listenFails) return Promise.reject(new Error(`listen ${name} thất bại`));
        return Promise.resolve(() => set.delete(callback));
      },
    },
  };
  return {
    api,
    invokes,
    emit(name, payload) {
      let delivered = 0;
      for (const callback of listeners.get(name) || []) {
        callback({ payload });
        delivered += 1;
      }
      return delivered;
    },
    open(name) {
      return name ? (listeners.get(name) || new Set()).size : [...listeners.values()].reduce((sum, set) => sum + set.size, 0);
    },
  };
}

const GROUP_COUNTS = { app: 8, data: 19, files: 7, ai: 30, diagnostics: 4, presentation: 9, lan: 7, update: 8 };

(async function main() {
  // ── 1. Hợp đồng: giống hệt preload Electron ─────────────────────────────
  await it('façade phủ đủ 92 khoá của preload, đúng kênh, đúng loại', () => {
    const { schema } = boot();
    const calls = schema.calls;
    assert.equal(Object.keys(calls).length, 92, 'façade phải có đúng 92 lời gọi');
    const invokeKeys = Object.keys(CONTRACT.invoke).sort();
    const sendKeys = Object.keys(CONTRACT.send).sort();
    const eventKeys = Object.keys(CONTRACT.event).sort();

    for (const key of invokeKeys) {
      assert.ok(calls[key], `façade thiếu lời gọi ${key}`);
      assert.equal(calls[key].kind, 'value', `${key} phải là lời gọi giá trị`);
      assert.equal(calls[key].channel, CONTRACT.invoke[key], `${key} sai kênh`);
    }
    for (const key of sendKeys) {
      assert.ok(calls[key], `façade thiếu kênh gửi ${key}`);
      assert.equal(calls[key].kind, 'send', `${key} phải là kênh gửi (ipcRenderer.send)`);
      assert.equal(calls[key].channel, CONTRACT.send[key], `${key} sai kênh gửi`);
    }
    for (const key of eventKeys) {
      assert.ok(calls[key], `façade thiếu sự kiện ${key}`);
      assert.equal(calls[key].kind, 'stream', `${key} phải là sự kiện`);
      assert.equal(calls[key].channel, CONTRACT.event[key], `${key} sai kênh sự kiện`);
    }
    assert.equal(schema.eventCount, eventKeys.length, 'số sự kiện phải bằng preload');
    assert.equal(schema.callCount, 92);
  });

  await it('phân nhóm theo kế hoạch giai đoạn 2, không nhóm nào rỗng', () => {
    const { schema } = boot();
    const seen = {};
    for (const spec of Object.values(schema.calls)) seen[spec.group] = (seen[spec.group] || 0) + 1;
    assert.deepEqual(seen, GROUP_COUNTS, '8 nhóm chức năng, đủ số lời gọi');
    assert.ok(!Object.values(schema.calls).some(spec => spec.optional), 'giai đoạn 2 không có lời gọi tuỳ chọn');
  });

  // ── 2. Adapter Electron: kết quả đi thẳng qua cầu ───────────────────────
  await it('Electron: mọi lời gọi tới đúng khoá cầu, đối số giữ nguyên', async () => {
    const bridge = fakeBridge({ getLibrary: () => Promise.resolve({ version: 1, games: [], sessions: [] }) });
    const { desktop, host, run } = boot({ eduGame: bridge.bridge });
    assert.equal(host.shell, 'electron');
    assert.equal(run('desktop.info().adapter'), 'electron');

    for (const [key, channel] of Object.entries(CONTRACT.invoke)) {
      await desktop.call(key, { probe: key });
    }
    for (const [key, channel] of Object.entries(CONTRACT.send)) {
      await desktop.call(key, { probe: key });
    }
    // Adapter Electron là đồng bộ: `listen` trả hàm huỷ ngay, nên sau `attach`
    // trong cùng lượt chạy, mọi đăng ký đã nối xong.
    for (const key of Object.keys(CONTRACT.event)) {
      const off = desktop.listen(key, () => {});
      off();
    }
    for (const { name, args } of bridge.calls) {
      if (CONTRACT.invoke[name] || CONTRACT.send[name]) assert.deepEqual(args, [{ probe: name }], `${name} mất đối số`);
      else assert.equal(args.length, 1, `${name} phải được đăng ký với đúng một callback`);
    }
    assert.equal(bridge.calls.length, 84 + Object.keys(CONTRACT.event).length, '81 invoke + 3 send + 8 sự kiện');
  });

  await it('Electron: lỗi IPC đi ra dưới dạng DesktopError kèm mã lỗi gốc', async () => {
    const bridge = fakeBridge({
      getLibrary: () => Promise.reject(new Error('Không đọc được thư viện: EBUSY')),
    });
    const { desktop } = boot({ eduGame: bridge.bridge });
    await assert.rejects(desktop.call('getLibrary'), error => {
      assert.equal(error.name, 'DesktopError');
      assert.equal(error.code, 'host-error');
      assert.equal(error.call, 'getLibrary');
      assert.match(error.message, /EBUSY/, 'giữ nguyên lời tiếng Việt của vỏ');
      return true;
    });
  });

  await it('Electron: sự kiện giao tới handler, huỷ đăng ký hai lần vô hại', async () => {
    const bridge = fakeBridge();
    const { desktop } = boot({ eduGame: bridge.bridge });
    const seen = [];
    const off = desktop.listen('onLessonProgress', progress => seen.push(progress));
    assert.equal(bridge.emit('onLessonProgress', { requestId: 'r1', stage: 'generate' }), 1);
    off();
    off();
    assert.equal(bridge.emit('onLessonProgress', { requestId: 'r1', stage: 'validate' }), 0, 'handler phải được gỡ');
    assert.deepEqual(seen, [{ requestId: 'r1', stage: 'generate' }]);
  });

  await it('Electron: handler hỏng không cắt chuỗi sự kiện của các đăng ký khác', async () => {
    const bridge = fakeBridge();
    const { desktop } = boot({ eduGame: bridge.bridge });
    const seen = [];
    const errors = [];
    const originalError = console.error;
    console.error = (...args) => errors.push(args);
    try {
      desktop.listen('onLanState', () => { throw new Error('renderer lỗi'); });
      desktop.listen('onLanState', snapshot => seen.push(snapshot.clients));
      bridge.emit('onLanState', { clients: 3 });
    } finally {
      console.error = originalError;
    }
    assert.deepEqual(seen, [3], 'đăng ký thứ hai vẫn nhận sự kiện');
    assert.equal(errors.length, 1, 'lỗi của handler được báo, không nuốt');
  });

  // ── 3. Đăng ký trước khi nối adapter (bootstrap chạy sau) ───────────────
  await it('listen trước khi attach: đăng ký chờ, nối adapter xong mới nhận', () => {
    const { desktop } = boot();
    const seen = [];
    desktop.listen('onFullscreenChanged', enabled => seen.push(enabled));

    const bridge = fakeBridge();
    desktop.attach({
      name: 'late',
      invoke: () => Promise.resolve(undefined),
      listen: (call, handler) => bridge.bridge[call](handler),
    });
    desktop.detach();
    assert.equal(seen.length, 0, 'chưa có sự kiện nào được phát');

    const second = fakeBridge();
    desktop.attach({
      name: 'second',
      invoke: () => Promise.resolve(undefined),
      listen: (call, handler) => second.bridge[call](handler),
    });
    second.emit('onFullscreenChanged', true);
    assert.deepEqual(seen, [true], 'đăng ký được chuyển sang adapter mới');
    assert.equal(bridge.open('onFullscreenChanged'), 0, 'không còn đăng ký trên adapter cũ');
  });

  await it('đổi adapter không nhân đôi sự kiện', () => {
    const first = fakeBridge();
    const { desktop } = boot({ eduGame: first.bridge });
    const seen = [];
    desktop.listen('onPresentationState', state => seen.push(state.seq));

    const second = fakeBridge();
    desktop.attach({
      name: 'second',
      invoke: () => Promise.resolve(undefined),
      listen: (call, handler) => second.bridge[call](handler),
    });
    assert.equal(first.open('onPresentationState'), 0, 'adapter cũ phải được gỡ');
    assert.equal(second.open('onPresentationState'), 1, 'adapter mới nhận đúng một đăng ký');
    second.emit('onPresentationState', { seq: 7 });
    assert.deepEqual(seen, [7]);
  });

  // ── 4. Lỗi hợp đồng: gọi sai tên, sai loại, chưa nối ─────────────────────
  await it('gọi tên không có trong hợp đồng → unknown-call', async () => {
    const { desktop } = boot({ eduGame: fakeBridge().bridge });
    await assert.rejects(desktop.call('khongCoThat'), error => {
      assert.equal(error.code, 'unknown-call');
      assert.equal(error.call, 'khongCoThat');
      return true;
    });
  });

  await it('gọi sự kiện như lời gọi giá trị, và ngược lại → invalid-argument', async () => {
    const { desktop } = boot({ eduGame: fakeBridge().bridge });
    await assert.rejects(desktop.call('onLanState'), error => {
      assert.equal(error.code, 'invalid-argument');
      return true;
    });
    assert.throws(() => desktop.listen('getLibrary', () => {}), error => {
      assert.equal(error.code, 'invalid-argument');
      return true;
    });
  });

  await it('chưa nối adapter → not-supported, không phải TypeError', async () => {
    const { desktop, host } = boot();
    assert.equal(host.shell, 'none');
    await assert.rejects(desktop.call('appInfo'), error => {
      assert.equal(error.code, 'not-supported');
      return true;
    });
  });

  // ── 5. Adapter Tauri: lệnh, chuẩn hoá lỗi, sự kiện, nhóm thiếu ───────────
  await it('Tauri: lời gọi đi qua invoke_channel với đúng kênh hợp đồng + đối số', async () => {
    const tauri = fakeTauri();
    const { desktop, host } = boot({ __TAURI__: tauri.api });
    assert.equal(host.shell, 'tauri');
    await desktop.call('getLibrary');
    await desktop.call('deleteGames', ['g1', 'g2']);
    await desktop.call('appInfo');
    // `tauri.invokes` được ghi bằng mảng của context vm, nên so qua JSON để khỏi
    // vướng khác prototype giữa hai realm. Chuỗi kênh là kênh hợp đồng, không phải
    // tên khoá façade: `dispatch()` của Rust đánh khoá theo kênh IPC Electron.
    assert.deepEqual(JSON.parse(JSON.stringify(tauri.invokes)), [
      { command: 'invoke_channel', payload: { channel: 'library:get' } },
      { command: 'invoke_channel', payload: { channel: 'library:delete-games', args: [['g1', 'g2']] } },
      { command: 'invoke_channel', payload: { channel: 'app:info' } },
    ]);
  });

  await it('Tauri: lỗi chuỗi của vỏ thành DesktopError, giữ nguyên lời tiếng Việt', async () => {
    const tauri = fakeTauri({ rejectWith: 'Kênh `about:check` chưa có trong vỏ Tauri giai đoạn 1' });
    const { desktop } = boot({ __TAURI__: tauri.api });
    await assert.rejects(desktop.call('aboutCheck'), error => {
      assert.equal(error.code, 'host-error');
      assert.equal(error.call, 'aboutCheck');
      assert.match(error.message, /about:check/);
      return true;
    });
  });

  await it('Tauri: sự kiện đi qua event.listen theo đúng tên khoá', async () => {
    const tauri = fakeTauri();
    const { desktop } = boot({ __TAURI__: tauri.api });
    const seen = [];
    desktop.listen('onSetupProgress', progress => seen.push(progress.step));
    await Promise.resolve();
    assert.equal(tauri.open('setup:progress'), 1, 'Tauri nghe theo kênh hợp đồng, không theo tên khoá façade');
    assert.equal(tauri.emit('setup:progress', { step: 'downloading' }), 1);
    assert.deepEqual(seen, ['downloading']);
  });

  await it('Tauri: huỷ đăng ký ngay khi listen còn đang chờ vẫn gỡ được', async () => {
    const tauri = fakeTauri();
    const { desktop } = boot({ __TAURI__: tauri.api });
    const seen = [];
    const off = desktop.listen('onLocalAiProgress', progress => seen.push(progress.percent));
    off();
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(tauri.emit('ai:local-progress', { percent: 50 }), 0, 'không còn handler nào được nối');
    assert.equal(seen.length, 0);
  });

  await it('Tauri giai đoạn 1: kênh gửi trình chiếu chưa nối → not-supported, không chạm IPC', async () => {
    const tauri = fakeTauri();
    const { desktop } = boot({ __TAURI__: tauri.api });
    for (const call of ['sendPresentationExit', 'sendPresentationState', 'requestPresentationState']) {
      await assert.rejects(desktop.call(call, {}), error => {
        assert.equal(error.code, 'not-supported');
        assert.equal(error.call, call);
        return true;
      });
    }
    // Sự kiện cùng chuỗi kênh (`presentation:exit`) vẫn đăng ký được: adapter chỉ
    // khai kênh GỬI là chưa nối, không cấm cả nhóm theo tên kênh dùng chung.
    const off = desktop.listen('onPresentationExit', () => {});
    assert.equal(tauri.open('presentation:exit'), 1, 'đăng ký đi qua event.listen theo kênh hợp đồng');
    off();
    assert.equal(tauri.invokes.length, 0, 'façade phải từ chối trước khi qua ranh giới IPC');
    await desktop.call('lanStop');
    assert.equal(tauri.invokes.length, 1, 'nhóm khác vẫn chạy bình thường');
  });

  await it('Tauri: khi vỏ có send_channel, kênh gửi đi qua send_channel', async () => {
    const tauri = fakeTauri();
    const { desktop, run } = boot({ __TAURI__: tauri.api });
    // Vỏ đã làm xong nhóm trình chiếu: `missingGroups: []` + `supportsSend: true`.
    desktop.detach();
    desktop.attach(run("createTauriDesktopAdapter(window.__TAURI__, { missingGroups: [], supportsSend: true })"));
    await desktop.call('sendPresentationState', { seq: 3 });
    await desktop.call('getLibrary');
    // Chuỗi kênh Rust kiểm tra, KHÔNG phải tên khoá của façade: `dispatch()` đánh
    // khoá theo kênh IPC Electron (`presentation:state-update`, `library:get`), nên
    // gửi `sendPresentationState` sang sẽ bị `invoke_channel` từ chối.
    assert.deepEqual(JSON.parse(JSON.stringify(tauri.invokes)), [
      { command: 'send_channel', payload: { channel: 'presentation:state-update', args: [{ seq: 3 }] } },
      { command: 'invoke_channel', payload: { channel: 'library:get' } },
    ]);
  });

  await it('onPresentationExit không nhận payload', async () => {
    const bridge = fakeBridge();
    const { desktop } = boot({ eduGame: bridge.bridge });
    const argumentsSeen = [];
    desktop.listen('onPresentationExit', (...args) => argumentsSeen.push(args));
    bridge.emit('onPresentationExit', { rooms: [] });
    const lengths = [];
    desktop.listen('onPresentationExit', (...args) => lengths.push(args.length));
    bridge.emit('onPresentationExit', { rooms: [] });
    assert.deepEqual(lengths, [0], 'handler được gọi với 0 đối số');
  });

  // ── 6. Adapter giả: dùng được cho test của tầng renderer ─────────────────
  await it('adapter giả ghi lời gọi, phát sự kiện và đếm đăng ký còn mở', async () => {
    const fake = createFakeDesktopAdapter({
      respond: (call, args) => (call === 'getLibrary' ? { version: 1, games: args[0] } : { call }),
    });
    const { desktop } = boot();
    desktop.attach(fake.adapter);
    assert.deepEqual(await desktop.call('getLibrary', ['g']), { version: 1, games: ['g'] });
    const seen = [];
    const off = desktop.listen('onAboutState', state => seen.push(state.phase));
    assert.equal(fake.openListeners('onAboutState'), 1);
    fake.emit('onAboutState', { phase: 'checking' });
    off();
    assert.equal(fake.openListeners(), 0);
    assert.deepEqual(seen, ['checking']);
    assert.deepEqual(fake.calls.map(entry => entry.call), ['getLibrary']);
  });

  // ── 7. Thay một lời gọi (chỉ cổng UI dùng) ──────────────────────────────
  await it('stub thay phản hồi, vẫn giữ mã lỗi của façade, gỡ được bằng null', async () => {
    const fake = createFakeDesktopAdapter({ respond: () => ({ real: true }) });
    const { desktop } = boot();
    desktop.attach(fake.adapter);

    const argumentsSeen: unknown[][] = [];
    desktop.stub('getLibrary', (...args: unknown[]) => {
      argumentsSeen.push(args);
      return { version: 1, games: [], sessions: [] };
    });
    assert.deepEqual(await desktop.call('getLibrary', { cursor: 'x' }), { version: 1, games: [], sessions: [] });
    assert.deepEqual(argumentsSeen, [[{ cursor: 'x' }]], 'lời gọi thay thế nhận đúng đối số façade nhận');
    assert.equal(fake.calls.length, 0, 'lời gọi thay thế không chạm adapter');

    desktop.stub('getLibrary', () => {
      throw new Error('boom');
    });
    await assert.rejects(desktop.call('getLibrary'), (error: any) => {
      assert.equal(error.code, 'host-error', 'lỗi từ lời gọi thay thế vẫn thành DesktopError');
      assert.equal(error.call, 'getLibrary');
      return true;
    });

    assert.throws(() => desktop.stub('nope' as any, () => null), (error: any) => error.code === 'unknown-call',
      'chỉ thay được một lời gọi có trong hợp đồng');

    desktop.stub('getLibrary', null);
    assert.deepEqual(await desktop.call('getLibrary'), { real: true }, 'gỡ stub thì đi lại adapter thật');
    assert.equal(fake.calls.length, 1);
  });

  // ── Báo cáo ─────────────────────────────────────────────────────────────
  for (const { name, error } of failures) {
    console.error(`✗ ${name}\n  ${(error && error.stack) || error}`);
  }
  console.log(`desktop-facade: ${passed}/${passed + failures.length} qua`);
  if (failures.length) process.exit(1);
})();
