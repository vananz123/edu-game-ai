// @ts-nocheck -- unit tests share one global script scope (moduleDetection: legacy), as the other suites do.
// Façade desktop (giai đoạn 2 của kế hoạch Tauri): hợp đồng, kết quả, lỗi, luồng sự kiện.
//
// Vì sao test ở đây: renderer không còn gọi `window.eduGame`. Mọi lỗi của vỏ
// (Tauri trả chuỗi lỗi, nhóm trình chiếu chưa có) phải đi ra dưới CÙNG một hình
// dạng `DesktopError` có `code`; nếu không, mỗi tệp renderer sẽ tự đoán lỗi theo
// chuỗi tiếng Việt và hỏng khác nhau.
//
// Adapter Tauri được nạp bằng vm, đúng cách index.html nạp chúng (script cổng thường,
// chia nhau một phạm vi). `window` giả chỉ có thứ tệp cần: `__TAURI__`.
//
// Chạy sau `npm run build`:  node tests/unit/desktop-facade.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..', '..');
const DIST = path.join(ROOT, 'dist', 'src', 'renderer', 'core');
const { createFakeDesktopAdapter } = require(path.join(ROOT, 'dist', 'tests', 'unit', 'support', 'desktop-fake-adapter'));

// desktop-adapter-electron.js đã bị xóa — chỉ còn Tauri adapter
const SCRIPTS = [
  'desktop-facade-schema.js',
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

/**
 * Bridge tối giản: dùng để test đăng ký trước adapter và chuyển adapter,
 * KHÔNG phải Electron adapter — chỉ là custom adapter thủ công.
 */
function fakeManualAdapter(overrides = {}) {
  const listeners = new Map();
  const calls = [];
  const record = name => (...args) => {
    calls.push({ name, args });
    const handler = overrides[name];
    if (typeof handler === 'function') return handler(...args);
    return Promise.resolve({ name });
  };
  return {
    calls,
    listeners,
    adapter: {
      name: 'manual',
      invoke: record('invoke'),
      listen: (call, handler) => {
        const set = listeners.get(call) || new Set();
        set.add(handler);
        listeners.set(call, set);
        return () => set.delete(handler);
      },
    },
    emit(key, payload) {
      let delivered = 0;
      for (const callback of listeners.get(key) || []) {
        callback(payload);
        delivered += 1;
      }
      return delivered;
    },
    open(key) {
      return (listeners.get(key) || new Set()).size;
    },
  };
}

const GROUP_COUNTS = { app: 8, data: 19, files: 7, ai: 30, diagnostics: 4, presentation: 9, lan: 7, update: 8 };

(async function main() {
  // ── 1. Hợp đồng: schema đủ 92 lời gọi ───────────────────────────────────
  await it('façade có đủ 92 lời gọi theo schema', () => {
    const { schema } = boot();
    const calls = schema.calls;
    assert.equal(Object.keys(calls).length, 92, 'façade phải có đúng 92 lời gọi');
    assert.equal(schema.callCount, 92);
    // Mỗi lời gọi phải có channel, group, kind
    for (const [key, spec] of Object.entries(calls)) {
      assert.ok(spec.channel, `${key} thiếu channel`);
      assert.ok(spec.group, `${key} thiếu group`);
      assert.ok(['value', 'send', 'stream'].includes(spec.kind), `${key} có kind không hợp lệ`);
    }
  });

  await it('phân nhóm theo kế hoạch giai đoạn 2, không nhóm nào rỗng', () => {
    const { schema } = boot();
    const seen = {};
    for (const spec of Object.values(schema.calls)) seen[spec.group] = (seen[spec.group] || 0) + 1;
    assert.deepEqual(seen, GROUP_COUNTS, '8 nhóm chức năng, đủ số lời gọi');
    assert.ok(!Object.values(schema.calls).some(spec => spec.optional), 'giai đoạn 2 không có lời gọi tuỳ chọn');
  });

  // ── 2. Đăng ký trước khi nối adapter (bootstrap chạy sau) ───────────────
  await it('listen trước khi attach: đăng ký chờ, nối adapter xong mới nhận', () => {
    const { desktop } = boot();
    const seen = [];
    desktop.listen('onFullscreenChanged', enabled => seen.push(enabled));

    const first = fakeManualAdapter();
    desktop.attach(first.adapter);
    desktop.detach();
    assert.equal(seen.length, 0, 'chưa có sự kiện nào được phát');

    const second = fakeManualAdapter();
    desktop.attach(second.adapter);
    second.emit('onFullscreenChanged', true);
    assert.deepEqual(seen, [true], 'đăng ký được chuyển sang adapter mới');
    assert.equal(first.open('onFullscreenChanged'), 0, 'không còn đăng ký trên adapter cũ');
  });

  await it('đổi adapter không nhân đôi sự kiện', () => {
    const first = fakeManualAdapter();
    const { desktop } = boot();
    desktop.attach(first.adapter);
    const seen = [];
    desktop.listen('onPresentationState', state => seen.push(state.seq));

    const second = fakeManualAdapter();
    desktop.attach({
      name: 'second',
      invoke: () => Promise.resolve(undefined),
      listen: (call, handler) => {
        const result = second.adapter.listen(call, handler);
        return result;
      },
    });
    assert.equal(first.open('onPresentationState'), 0, 'adapter cũ phải được gỡ');
    second.emit('onPresentationState', { seq: 7 });
    assert.deepEqual(seen, [7]);
  });

  // ── 3. Lỗi hợp đồng: gọi sai tên, sai loại, chưa nối ─────────────────────
  await it('gọi tên không có trong hợp đồng → unknown-call', async () => {
    const tauri = fakeTauri();
    const { desktop } = boot({ __TAURI__: tauri.api });
    await assert.rejects(desktop.call('khongCoThat'), error => {
      assert.equal(error.code, 'unknown-call');
      assert.equal(error.call, 'khongCoThat');
      return true;
    });
  });

  await it('gọi sự kiện như lời gọi giá trị, và ngược lại → invalid-argument', async () => {
    const tauri = fakeTauri();
    const { desktop } = boot({ __TAURI__: tauri.api });
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

  // ── 4. Adapter Tauri: lệnh, chuẩn hoá lỗi, sự kiện, nhóm thiếu ───────────
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

  await it('Tauri: adapter tường minh với supportsSend:false → kênh gửi presentation bị từ chối', async () => {
    const tauri = fakeTauri();
    const { desktop, run } = boot({ __TAURI__: tauri.api });
    // Giả lập vỏ chưa có send_channel: `supportsSend: false` chặn ba kênh gửi,
    // nhưng sự kiện (listen) cùng nhóm presentation vẫn được phép.
    desktop.detach();
    desktop.attach(run("createTauriDesktopAdapter(window.__TAURI__, { missingGroups: [], supportsSend: false })"));
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

  // ── 5. Không còn cửa CHỈ Tauri: lời mời nhập profile Electron đã bị xoá ── ───────────────
  await it('façade không còn host()/hostCalls, kênh migration:* không gọi được', async () => {
    const tauri = fakeTauri();
    const { desktop, schema } = boot({ __TAURI__: tauri.api });
    assert.equal('host' in schema, false, 'schema không được còn hostCalls');
    assert.equal(typeof desktop.host, 'undefined', 'façade không được còn desktop.host');
    await assert.rejects(desktop.call('migrationDetect'), error => error.code === 'unknown-call',
      'kênh migration:* không được lọt vào call() của hợp đồng');
    assert.equal(tauri.invokes.length, 0, 'lời gọi sai không qua ranh giới IPC');
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
