// @ts-nocheck -- unit tests share one global script scope (moduleDetection: legacy), as the other suites do.
/*
 * P0 của kế hoạch tối ưu hiệu năng: ba module nặng phải nằm NGOÀI đường khởi động.
 *
 * Đo trên Electron thật (`app.boot.phases`, máy dev): `lan-server` (kèm express +
 * socket.io) ~190 ms, `update-electron-adapter` (kèm electron-updater) ~123 ms và
 * `mammoth` ~118 ms — ~431 ms thời gian nạp, tương ứng ~330 ms trên tổng thời gian
 * mở app ~1540 ms. Cả ba chỉ cần khi giáo viên mở phòng LAN, mở trang Giới thiệu
 * hoặc nạp file .docx, nhưng `require` tĩnh ở đầu file khiến mọi lần mở app đều trả
 * đủ.
 *
 * Test này chạy hai chiều:
 *  - chiều âm: gọi `registerLanIpc()` / `registerAboutIpc()` với `electron` giả và
 *    xác nhận không có yêu cầu `express`, `socket.io`, `electron-updater`, `mammoth`
 *    nào được đưa lên trình nạp module;
 *  - chiều dương: cùng bản nạp đó phải thật sự tải được adapter khi có người mở
 *    trang Giới thiệu — hoãn lại mà làm tính năng chết thì còn tệ hơn chậm.
 *
 * Chạy sau `npm run build`: node tests/unit/boot-lazy-requires.test.js
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const RUN_DIR = path.join(__dirname, '..', '..');
const SOURCE_ROOT = path.basename(RUN_DIR) === 'dist' ? path.join(RUN_DIR, '..') : RUN_DIR;
const DIST = path.join(SOURCE_ROOT, 'dist', 'src');

const HEAVY = ['express', 'express-rate-limit', 'socket.io', 'electron-updater', 'mammoth'];

const suite = [];
/** `fn` có thể trả về promise (mở phòng LAN thật) — bộ chạy bên dưới chờ nó xong. */
function check(name, fn) { suite.push({ name, fn }); }

function readSource(relative) {
  return fs.readFileSync(path.join(SOURCE_ROOT, 'src', relative), 'utf8');
}

/** Dòng `require(...)` nằm ở cột 0 là dòng cấp cao nhất của file: nó chạy lúc mở app. */
function topLevelLines(text, specifier) {
  return text.split('\n').filter(line => {
    const at = line.indexOf(specifier);
    if (at < 0) return false;
    if (!/(require\(|from\s+['"])/.test(line)) return false;
    return /^[^\s]/.test(line);
  });
}

// ---------------------------------------------------------------- nguồn: cấm nạp sớm

check('src/main.ts không require(\'mammoth\') ở cấp cao nhất', () => {
  const lines = topLevelLines(readSource('main.ts'), "'mammoth'");
  assert.equal(lines.length, 0, 'mammoth phải nằm trong loadMammoth(): ' + lines.join(' | '));
});

check('src/main.ts không require(\'./mammoth\') ở cấp cao nhất', () => {
  const text = readSource('main.ts');
  assert.match(text, /function loadMammoth\(\)[\s\S]{0,120}require\('mammoth'\)/);
});

check('src/main.ts không nạp ./lan/lan-server trực tiếp', () => {
  const text = readSource('main.ts');
  assert.ok(!text.includes("require('./lan/lan-server')"), 'main.ts phải hỏi lan-ipc (lanSessionActive)');
  assert.match(text, /const \{[^}]*lanSessionActive[^}]*\} = require\('\.\/lan\/lan-ipc'\)/);
});

check('src/lan/lan-ipc.ts chỉ import type từ ./lan-server', () => {
  const text = readSource('lan/lan-ipc.ts');
  const valueImports = text.split('\n').filter(line =>
    /^(import|export)\b/.test(line) && /from '\.\/lan-server'/.test(line) && !/^import type/.test(line) && !/import \{ type/.test(line)
  );
  assert.equal(valueImports.length, 0, 'import giá trị làm ./lan-server chạy lúc mở app: ' + valueImports.join(' | '));
  assert.match(text, /function lanServer\(\)[\s\S]{0,160}require\('\.\/lan-server'\)/);
});

check('src/about/about-ipc.ts không import adapter ở cấp cao nhất', () => {
  const text = readSource('about/about-ipc.ts');
  const eager = text.split('\n').filter(line => /^(import|export)\b/.test(line) && /update-electron-adapter/.test(line));
  assert.equal(eager.length, 0, 'adapter phải nạp trong updater(): ' + eager.join(' | '));
  assert.match(text, /function updater\(\)[\s\S]{0,160}require\('\.\.\/services\/update\/update-electron-adapter'\)/);
});

check('registerAboutIpc không gọi initUpdater lúc đăng ký', () => {
  const body = readSource('about/about-ipc.ts').split('export function registerAboutIpc')[1] || '';
  assert.ok(!body.slice(0, 400).includes('initUpdater('), 'initUpdater phải chạy ở lần dùng đầu tiên');
});

// --------------------------------------------------------- hành vi: nạp chậm thật sự

/** Electron tối giản: đủ cho phần đăng ký IPC, không mở cửa sổ, không ràng buộc gì. */
function installElectronStub(handlers) {
  const stub = {
    app: {
      getVersion: () => '0.0.0-test',
      getPath: () => DIST,
      isPackaged: false,
      on: () => {},
      whenReady: () => Promise.resolve(),
      quit: () => {}
    },
    BrowserWindow: class {
      static getAllWindows() { return []; }
    },
    ipcMain: {
      handle: (channel, handler) => { handlers.set(channel, handler); },
      removeHandler: channel => { handlers.delete(channel); }
    },
    shell: { openExternal: async () => {} },
    dialog: { showMessageBox: async () => ({ response: 0 }) },
    Menu: { buildFromTemplate: () => ({}), setApplicationMenu: () => {} },
    safeStorage: { isEncryptionAvailable: () => false },
    ipcRenderer: { invoke: async () => ({}), on: () => {}, send: () => {} }
  };
  const originalLoad = Module._load;
  const requested = [];
  Module._load = function (request, parent, isMain) {
    if (request === 'electron') return stub;
    if (HEAVY.includes(request)) requested.push(request);
    return originalLoad.apply(this, arguments);
  };
  return {
    requested,
    restore: () => { Module._load = originalLoad; }
  };
}

function requireFresh(absolute) {
  delete require.cache[require.resolve(absolute)];
  return require(absolute);
}

check('registerLanIpc() không nạp express/socket.io', () => {
  const handlers = new Map();
  const spy = installElectronStub(handlers);
  try {
    const lanIpc = requireFresh(path.join(DIST, 'lan', 'lan-ipc.js'));
    lanIpc.registerLanIpc();
    assert.deepEqual(spy.requested, [], 'toàn bộ express + socket.io đã bị nạp lúc đăng ký: ' + spy.requested.join(', '));
    assert.equal(lanIpc.lanSessionActive(), false, 'chưa mở phòng thì trước khi thoát không được chờ socket');
    lanIpc.unregisterLanIpc();
  } finally {
    spy.restore();
  }
});

check('mở phòng LAN thật: nạp lan-server ở đó và `lanSessionActive()` phải báo đúng', async () => {
  const handlers = new Map();
  const spy = installElectronStub(handlers);
  try {
    const lanIpc = requireFresh(path.join(DIST, 'lan', 'lan-ipc.js'));
    lanIpc.registerLanIpc();
    const { LAN_CHANNELS } = requireFresh(path.join(DIST, 'shared', 'lan-types.js'));
    const game = {
      id: 'lazy-boot-game',
      title: 'Phòng kiểm tra',
      template: 'quiz',
      questions: [{ question: 'Thủ đô của Việt Nam?', options: ['Hà Nội', 'Huế'], answer: 0 }]
    };
    const result = await handlers.get(LAN_CHANNELS.START)(null, { game });
    assert.equal(result.ok, true, 'mở phòng thất bại: ' + (result && result.message));
    // Đây chính là nhánh `main.ts` đổi từ `lanServerIsRunning()` sang
    // `lanSessionActive()`: phòng đang mở mà báo false thì lúc thoát app bỏ qua
    // teardown socket, Windows giữ cổng ở TIME_WAIT và lần mở sau vướng Firewall.
    assert.equal(lanIpc.lanSessionActive(), true, 'phòng đang mở mà `lanSessionActive()` báo false');
    assert.ok(spy.requested.includes('express'), 'START phải kéo theo express đúng lúc cần');
    assert.ok(spy.requested.includes('socket.io'), 'START phải kéo theo socket.io đúng lúc cần');
    await lanIpc.stopLanSession('test-end');
    assert.equal(lanIpc.lanSessionActive(), false, 'đóng phòng rồi thì `lanSessionActive()` phải về false');
    lanIpc.unregisterLanIpc();
  } finally {
    spy.restore();
  }
});

check('registerAboutIpc() không nạp electron-updater', () => {
  const handlers = new Map();
  const spy = installElectronStub(handlers);
  try {
    const aboutIpc = requireFresh(path.join(DIST, 'about', 'about-ipc.js'));
    aboutIpc.registerAboutIpc({ log: () => {} });
    assert.equal(spy.requested.includes('electron-updater'), false, 'electron-updater bị nạp lúc đăng ký');
    assert.ok(handlers.size >= 7, 'các kênh IPC của trang Giới thiệu phải đăng ký đủ, thấy ' + handlers.size);
    aboutIpc.unregisterAboutIpc();
  } finally {
    spy.restore();
  }
});

check('handler STATE vẫn tải được adapter (hoãn không làm tính năng chết)', () => {
  const handlers = new Map();
  const spy = installElectronStub(handlers);
  try {
    const aboutIpc = requireFresh(path.join(DIST, 'about', 'about-ipc.js'));
    aboutIpc.registerAboutIpc({ log: () => {} });
    const { ABOUT_CHANNELS } = requireFresh(path.join(DIST, 'shared', 'about-types.js'));
    const state = handlers.get(ABOUT_CHANNELS.STATE)();
    assert.equal(spy.requested.includes('electron-updater'), true, 'lần dùng đầu tiên phải nạp adapter');
    assert.ok(state && typeof state.phase === 'string', 'trạng thái cập nhật phải trả về được máy trạng thái');
    aboutIpc.unregisterAboutIpc();
  } finally {
    spy.restore();
  }
});

check('main.ts giữ đủ dấu vết đo khởi động app.boot.phases', () => {
  const text = readSource('main.ts');
  assert.match(text, /aiLog\.info\('app\.boot\.phases'/);
  assert.match(text, /markBoot\('documentLoaded'\)/);
  assert.match(text, /EDUGAME_BOOT_TRACE/);
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
    console.log('\nAll boot lazy-require checks passed.');
  }
})();
