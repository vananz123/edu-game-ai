// build-tauri-release.js — dựng binary release của vỏ Tauri đúng thứ tự.
//
// `tauri::generate_context!()` nhúng `frontendDist` vào binary LÚC BIÊN DỊCH, nên
// dựng `dist-tauri` sau `cargo build --release` sẽ để binary phục vụ bản frontend
// CŨ — UI vẫn mở nhưng thiếu script hoặc thiếu cửa chung mới. Script này chỉ chạy
// công cụ, còn frontend đã được `npm run build:tauri` dựng xong trước đó.
//
//   node scripts/build-tauri-release.js [--debug] [--run] [--check] [--port <n>] [--profile <dir>]
//
//   --run    chạy binary với cổng gỡ lỗi WebView2 và profile riêng (không đụng
//            profile Electron, không đụng phiên WebView2 của giáo viên).
//   --check  sau khi chạy, chạy luôn tests/ui/tauri-webview-check.js.
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const debug = args.includes('--debug');
const run = args.includes('--run');
const check = args.includes('--check');
const takeValue = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const port = takeValue('--port', '9557');
const profile = takeValue('--profile', path.join(os.tmpdir(), 'eg-tauri-fresh'));
// Tệp bàn giao giữa hai pha của cổng kiểm tra (xem `startAndCheck`).
const memo = path.join(os.tmpdir(), 'eg-tauri-check-memo.json');

const isWindows = process.platform === 'win32';
const exeName = isWindows ? 'edugame-studio-tauri.exe' : 'edugame-studio-tauri';
// `CARGO_TARGET_DIR` đổi thư mục đích của cargo; bỏ qua nó thì script chạy lại
// binary CŨ nằm ở `src-tauri/target` và cổng kiểm tra báo nhầm.
const targetDir = process.env.CARGO_TARGET_DIR
  ? path.resolve(root, process.env.CARGO_TARGET_DIR)
  : path.join(root, 'src-tauri', 'target');
const binary = path.join(targetDir, debug ? 'debug' : 'release', exeName);

function cargo() {
  const onPath = spawnSync('cargo', ['--version'], { encoding: 'utf8', shell: isWindows });
  if (onPath.status === 0) return 'cargo';
  const local = path.join(os.homedir(), '.cargo', 'bin', isWindows ? 'cargo.exe' : 'cargo');
  if (fs.existsSync(local)) return local;
  console.error('Không tìm thấy cargo. Cài Rust toolchain hoặc thêm ~/.cargo/bin vào PATH.');
  process.exit(1);
}

function assertFreshFrontend() {
  // Mốc là tệp cuối cùng `build-tauri-frontend.js` ghi: có nó nghĩa là gói mới.
  const dist = path.join(root, 'dist-tauri', 'edugame-guard.js');
  if (!fs.existsSync(dist)) {
    console.error('Chưa có dist-tauri — chạy `npm run build:tauri` trước.');
    process.exit(1);
  }
  const built = fs.statSync(dist).mtimeMs;
  const api = fs.statSync(path.join(root, 'src-tauri', 'src', 'api.rs')).mtimeMs;
  if (built < api) {
    // Cảnh báo chứ không chặn: sửa comment trong api.rs cũng làm mốc này cũ.
    console.warn(`dist-tauri cũ hơn api.rs — nên chạy lại \`npm run build:tauri\` (${Math.round((api - built) / 1000)} s)`);
  }
}

function build() {
  assertFreshFrontend();
  const result = spawnSync(cargo(), ['build', ...(debug ? [] : ['--release'])], {
    cwd: path.join(root, 'src-tauri'),
    stdio: 'inherit',
    shell: isWindows,
  });
  if (result.status !== 0) process.exit(result.status || 1);
  if (!fs.existsSync(binary)) {
    console.error(`Không thấy binary sau khi dựng: ${binary}`);
    process.exit(1);
  }
  console.log(`tauri binary: ${binary} (${(fs.statSync(binary).size / 1024 / 1024).toFixed(2)} MiB)`);
}

function startAndCheck() {
  fs.rmSync(profile, { recursive: true, force: true });
  let child = null;
  const launch = () => {
    child = spawn(binary, [], {
      env: {
        ...process.env,
        WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
        WEBVIEW2_USER_DATA_FOLDER: profile,
      },
      stdio: 'ignore',
    });
  };
  const stop = () => { try { child && child.kill(); } catch {} };
  process.on('exit', stop);
  // Chờ cổng VÀ trang ứng dụng: cổng mở sớm khi WebView2 mới có `about:blank`,
  // nên chỉ nhìn cổng là chạy phép đo trên một DOM rỗng.
  const isAppPage = x => x.type === 'page' && /^(http:\/\/tauri\.localhost\/?|file:.*index\.html)/.test(x.url);
  const waitForPort = async (want) => {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      let open = false;
      try {
        const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        open = Array.isArray(list) && list.some(isAppPage);
      } catch {}
      if (open === want) return true;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    return false;
  };
  const runCheck = (extra) => spawnSync(
    process.execPath,
    [path.join(root, 'tests', 'ui', 'tauri-webview-check.js'), port, ...extra],
    { stdio: 'inherit', env: { ...process.env, EDUGAME_TAURI_MEMO: memo } },
  );
  launch();
  (async () => {
    await waitForPort(true);
    if (!check) {
      console.log(`WebView2 CDP tại cổng ${port}, profile ${profile}. Ctrl+C để dừng.`);
      return;
    }
    fs.rmSync(memo, { force: true });
    const first = runCheck([]);
    // Pha một ghi trò chơi + memo. Mở lại trên CÙNG profile để pha hai chứng minh
    // dòng nằm trên đĩa; `child.kill()` phải xong trước khi tiến trình mới chạy,
    // nếu không hai tiến trình cùng mở một tệp SQLite và khoá ghi.
    stop();
    await waitForPort(false);
    if (first.status !== 0) process.exit(first.status || 1);
    launch();
    await waitForPort(true);
    const second = runCheck(['--reopen']);
    stop();
    process.exit(second.status || 0);
  })();
}

build();
if (run || check) startAndCheck();
