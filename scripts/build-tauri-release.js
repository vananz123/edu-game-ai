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
const crypto = require('node:crypto');
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
// Bốn đường dẫn hộp thoại gói `.egame` mà cổng kiểm tra cần (xem `package.rs`,
// `GATE_ENV`). Chúng chỉ tồn tại trong tiến trình do script này mở: biến môi
// trường của tiến trình cha, nên renderer không tự chọn được tệp nào.
const packagePaths = {
  save: path.join(os.tmpdir(), 'eg-tauri-gate-package.egame'),
  open: path.join(os.tmpdir(), 'eg-tauri-gate-package.egame'),
  broken: path.join(os.tmpdir(), 'eg-tauri-gate-broken.egame'),
  empty: path.join(os.tmpdir(), 'eg-tauri-gate-empty.egame'),
  oversized: path.join(os.tmpdir(), 'eg-tauri-gate-oversized.egame'),
};
const PACKAGE_LIMIT = 20 * 1024 * 1024;
// Thư mục dữ liệu RIÊNG cho cổng. `paths::data_dir_path` chỉ chuyển hướng khi
// tiến trình cha đặt cả `EDUGAME_TAURI_GATE=1` lẫn `EDUGAME_TAURI_DATA_DIR`, nên
// cổng không bao giờ ghi vào profile thật của bản Tauri trên máy đang kiểm.
const gateDataDir = path.join(os.tmpdir(), 'eg-tauri-gate-data');
const migrationDataDir = path.join(os.tmpdir(), 'eg-tauri-gate-migration-data');
// Profile Electron TỔNG HỢP cho cổng Giai đoạn 4: không có dữ liệu học sinh thật.
// `EDUGAME_ELECTRON_PROFILE` trỏ vào chính thư mục `edugame-data` này.
const electronProfileRoot = path.join(os.tmpdir(), 'eg-tauri-gate-electron');
const electronProfile = path.join(electronProfileRoot, 'edugame-data');
const MIGRATION_SECRETS = ['SK-GATE-SECRET-1', 'SK-GATE-SECRET-2', 'SK-GATE-SECRET-3'];
const MIGRATION_LESSON = 'Giáo án tổng hợp: phân số bằng nhau.';
const MIGRATION_IMAGE = Buffer.from('gate-image-bytes');

/**
 * Cổng nhập tệp (#270): đường dẫn hộp thoại cho từng lượt của `document.rs`
 * (`GATE_DOCUMENT_TURNS` 8 lượt, `GATE_QUESTIONS_TURNS` 5, `GATE_ILLUSTRATION_TURNS` 3),
 * cùng thư mục nhận gói chẩn đoán. Thứ tự tài liệu phải khớp thứ tự gọi
 * `importDocument` trong `filesRunner` của cổng kiểm tra.
 */
const fixtures = path.join(root, 'tests', 'fixtures', 'tauri-import');
const diagnosticsDir = path.join(os.tmpdir(), 'eg-tauri-gate-diagnostics');
const filePaths = {
  documents: ['giao-an.txt', 'giao-an.md', 'bai-hoc.docx', 'bai-giang.pptx', 'giao-an.pdf', '', 'hong.pdf', 'bang-tinh.xls'],
  // Ba bảng tính thật, rồi `.xls` (đuôi lạ) và đường rỗng = Huỷ.
  questions: ['cau-hoi.csv', 'cau-hoi.tsv', 'cau-hoi.xlsx', 'bang-tinh.xls', ''],
  // PNG thật, rồi ảnh giả (đuôi .png, nội dung không phải ảnh), rồi đuôi lạ.
  illustrations: ['anh-minh-hoa.png', 'anh-gia.png', 'anh-minh-hoa.exe'],
  foreign: 'bang-tinh.xls',
};

/** Ghi ba gói xấu cổng dùng để đo đường từ chối. */
function writeGatePackages() {
  fs.rmSync(packagePaths.open, { force: true });
  fs.writeFileSync(packagePaths.broken, '{ "packageFormat": "edugame", "game": ', 'utf8');
  fs.writeFileSync(packagePaths.empty, JSON.stringify({ packageFormat: 'edugame', packageVersion: 1, game: { title: 'Thiếu câu hỏi' } }), 'utf8');
  // Chỉ lớn hơn trần một byte: cổng phải chặn bằng `metadata`, không đọc 20 MB.
  const fd = fs.openSync(packagePaths.oversized, 'w');
  fs.ftruncateSync(fd, PACKAGE_LIMIT + 1);
  fs.closeSync(fd);
}

/**
 * Biến của cổng nhập tệp. Ba tệp cần có mặt TRƯỚC khi mở binary, và một bản sao
 * của "ảnh giả" đổi đuôi phải được ghi ra đĩa vì fixture `.exe` không được giữ
 * trong repo (nó trông như tệp đáng ngờ với công cụ quét mã nguồn).
 */
function writeFilesGate() {
  fs.rmSync(diagnosticsDir, { recursive: true, force: true });
  const foreign = path.join(os.tmpdir(), 'eg-tauri-gate-anh-minh-hoa.exe');
  fs.copyFileSync(path.join(fixtures, 'anh-minh-hoa.png'), foreign);
  // Tên khoá → 8 lượt tài liệu, 5 lượt bảng tính, 3 lượt ảnh; `''` giữa chừng là
  // lượt HUỶ, nên biến vẫn phải được đặt (rỗng), không bỏ qua.
  const numbered = (prefix, names) => names.map((name, index) =>
    [index === 0 ? prefix : `${prefix}_${index + 1}`, name ? path.join(fixtures, name) : '']);
  const env = {
    EDUGAME_TAURI_FILES: 'gate',
    EDUGAME_DIAGNOSTICS_DIR: diagnosticsDir,
    EDUGAME_TAURI_FILES_FOREIGN: path.join(fixtures, filePaths.foreign),
  };
  for (const [name, value] of numbered('EDUGAME_TAURI_FILES_DOCUMENT', filePaths.documents)) env[name] = value;
  for (const [name, value] of numbered('EDUGAME_TAURI_FILES_QUESTIONS', filePaths.questions)) env[name] = value;
  numbered('EDUGAME_TAURI_FILES_ILLUSTRATION', filePaths.illustrations)
    .forEach(([name, value], index) => { env[name] = index === 2 ? foreign : value; });
  return { env, foreign };
}

/**
 * Ghi một profile Electron TỔNG HỢP (không có dữ liệu thật) cho cổng Giai đoạn 4.
 *
 * `node:sqlite` của Node 22 dựng được tệp SQLite mà không cần `better-sqlite3`
 * (bản đã biên cho ABI Electron). Dùng đúng DDL của `src/db/` để cổng đo trên
 * schema thật, không phải một bản sao gõ tay. Mọi giá trị đều cố định, nên phép
 * so số dòng của cổng không phụ thuộc thời gian chạy.
 */
function writeElectronProfile() {
  fs.rmSync(electronProfileRoot, { recursive: true, force: true });
  fs.mkdirSync(path.join(electronProfile, 'images'), { recursive: true });
  fs.mkdirSync(path.join(electronProfile, 'lessons'), { recursive: true });
  fs.mkdirSync(path.join(electronProfile, 'ai-local'), { recursive: true });
  fs.writeFileSync(path.join(electronProfile, 'images', 'ci-gate.img'), MIGRATION_IMAGE);
  fs.writeFileSync(path.join(electronProfile, 'lessons', 'gate-lesson.txt'), MIGRATION_LESSON, 'utf8');
  fs.writeFileSync(path.join(electronProfile, 'ai-local', 'model.gguf'), 'gate-model', 'utf8');

  const lessonSha = crypto.createHash('sha256').update(MIGRATION_LESSON, 'utf8').digest('hex');
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(path.join(electronProfile, 'edugame.sqlite'));
  try {
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec(fs.readFileSync(path.join(root, 'src', 'db', 'library-schema.sql'), 'utf8'));
    db.exec(fs.readFileSync(path.join(root, 'src', 'db', 'lesson-store-schema.sql'), 'utf8'));
    const insertGame = db.prepare(
      'INSERT INTO games (id,title,subject,grade,topic,template,created_at,updated_at,data_json) VALUES (?,?,?,?,?,?,?,?,?)'
    );
    // `data_json` phải mang `id`/`title` như một trò chơi do engine lưu: danh
    // sách thư viện đọc từ JSON này (không ghép cột `id`), nên thiếu `id` sẽ
    // hiện một thẻ trống dù dòng DB đã nhập đúng.
    insertGame.run('gate-game-1', 'Trò chơi cổng 1', 'Toán', '4', 'Phân số', 'quiz',
      '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z',
      JSON.stringify({ id: 'gate-game-1', title: 'Trò chơi cổng 1', template: 'quiz', rounds: [] }));
    insertGame.run('gate-game-2', 'Trò chơi cổng 2', 'Toán', '4', 'Phân số', 'match',
      '2026-01-03T00:00:00Z', '2026-01-04T00:00:00Z',
      JSON.stringify({ id: 'gate-game-2', title: 'Trò chơi cổng 2', template: 'match', rounds: [] }));
    db.prepare('INSERT INTO sessions (id,created_at,data_json) VALUES (?,?,?)')
      .run('gate-session-1', '2026-01-05T00:00:00Z', '{"score":1}');
    db.prepare(
      'INSERT INTO lesson_documents (id,name,ext,size_bytes,characters,text_rel_path,sha256,schema_version,created_at) VALUES (?,?,?,?,?,?,?,?,?)'
    ).run('gate-doc-1', 'Giáo án cổng', 'txt', Buffer.byteLength(MIGRATION_LESSON), MIGRATION_LESSON.length,
      'lessons/gate-lesson.txt', lessonSha, 1, '2026-01-06T00:00:00Z');
    db.prepare(
      'INSERT INTO lesson_analyses (id,document_id,data_json,schema_version,cache_key,created_at,updated_at) VALUES (?,?,?,?,?,?,?)'
    ).run('gate-analysis-1', 'gate-doc-1', '{}', 1, 'gate-cache-1', '2026-01-07T00:00:00Z', '2026-01-07T00:00:00Z');
    db.prepare(
      'INSERT INTO game_recommendations (id,analysis_id,data_json,schema_version,created_at) VALUES (?,?,?,?,?)'
    ).run('gate-rec-1', 'gate-analysis-1', '{}', 1, '2026-01-07T00:00:00Z');
    db.prepare(
      'INSERT INTO game_projects (id,game_id,status,step,data_json,schema_version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)'
    ).run('gate-project-1', 'gate-game-1', 'draft', 'design', '{}', 1,
      '2026-01-08T00:00:00Z', '2026-01-08T00:00:00Z');
    const insertChunk = db.prepare(
      'INSERT INTO lesson_chunks (document_id,chunk_index,text,heading,char_start,char_end,token_count) VALUES (?,?,?,?,?,?,?)'
    );
    insertChunk.run('gate-doc-1', 0, 'phần một', 'Mở đầu', 0, 9, 3);
    insertChunk.run('gate-doc-1', 1, 'phần hai', null, 9, 18, 3);
    db.prepare(
      'INSERT INTO ai_generation_cache (cache_key,kind,game_type,analysis_id,model_id,prompt_version,payload_json,created_at) VALUES (?,?,?,?,?,?,?,?)'
    ).run('gate-cache-1', 'game', 'quiz', 'gate-analysis-1', 'gate-model', 'v1', '{}', '2026-01-09T00:00:00Z');
    db.prepare(
      'INSERT INTO ai_tasks (task_id,request_id,kind,project_id,document_id,label,state,progress,started_at) VALUES (?,?,?,?,?,?,?,?,?)'
    ).run('gate-task-1', 'gate-request-1', 'generate', 'gate-project-1', 'gate-doc-1', 'Sinh trò chơi',
      'done', 'done', '2026-01-09T00:00:00Z');
    db.prepare(
      'INSERT INTO lesson_chats (id,title,document_ids,message_count,last_intent,schema_version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)'
    ).run('gate-chat-1', 'Hỏi bài cổng', '["gate-doc-1"]', 2, 'ask', 1,
      '2026-01-10T00:00:00Z', '2026-01-10T00:00:00Z');
    const insertMessage = db.prepare(
      'INSERT INTO lesson_chat_messages (id,chat_id,position,role,text,intent,citations,provider_id,error_code,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)'
    );
    insertMessage.run('gate-message-1', 'gate-chat-1', 0, 'user', 'Hỏi', 'ask', '[]', '', '', '2026-01-10T00:00:00Z');
    insertMessage.run('gate-message-2', 'gate-chat-1', 1, 'assistant', 'Đáp', 'ask', '[]', 'openai', '', '2026-01-10T00:00:01Z');
  } finally {
    db.close();
  }

  fs.writeFileSync(path.join(electronProfile, 'settings.json'), JSON.stringify({
    theme: 'light',
    ai: {
      mode: 'cloud',
      providers: {
        openai: {
          baseUrl: 'https://gate.example/v1',
          model: 'gate-model',
          hasKey: true,
          keyMasked: 'sk-…',
          apiKeyEncrypted: MIGRATION_SECRETS[0],
        },
      },
      apiKeyEncrypted: MIGRATION_SECRETS[1],
      apiKey: MIGRATION_SECRETS[2],
    },
  }, null, 2), 'utf8');
}

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
  // Cổng Giai đoạn 4 dùng một thư mục dữ liệu Tauri và một profile Electron
  // tổng hợp RIÊNG; dọn trước mỗi lần chạy để số dòng đo được là cố định.
  fs.rmSync(gateDataDir, { recursive: true, force: true });
  fs.rmSync(migrationDataDir, { recursive: true, force: true });
  fs.rmSync(electronProfileRoot, { recursive: true, force: true });
  let child = null;
  // Đường dẫn hộp thoại của cổng nhập tệp phải có TRƯỚC lần mở binary đầu tiên:
  // chúng là biến môi trường của tiến trình, không đặt được từ renderer.
  const files = writeFilesGate();
  // Cổng `.egame` chỉ bật khi đang kiểm: một lần chạy tay (`--run`) mở hộp thoại
  // thật cho giáo viên, còn `--check` mở hộp thoại do biến môi trường quyết định.
  const gateEnv = check
    ? {
        EDUGAME_TAURI_PACKAGE: 'gate',
        EDUGAME_TAURI_PACKAGE_SAVE: packagePaths.save,
        EDUGAME_TAURI_PACKAGE_OPEN: packagePaths.open,
        EDUGAME_TAURI_PACKAGE_BROKEN: packagePaths.broken,
        EDUGAME_TAURI_PACKAGE_EMPTY: packagePaths.empty,
        EDUGAME_TAURI_PACKAGE_OVERSIZED: packagePaths.oversized,
        ...files.env,
        // Hai biến này bật thư mục dữ liệu riêng của cổng (`paths.rs`). Chỉ đặt
        // khi `--check`: chạy tay vẫn dùng profile thật của bản Tauri.
        EDUGAME_TAURI_GATE: '1',
        EDUGAME_TAURI_DATA_DIR: gateDataDir,
      }
    : {};
  const launch = (envExtra = {}) => {
    child = spawn(binary, [], {
      env: {
        ...process.env,
        ...gateEnv,
        ...envExtra,
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
  // Bản sao của `gateEnv` phải đi kèm: script cổng dựa vào chính các biến này
  // để biết đường dẫn hộp thoại, nên thiếu chúng là phần gói `.egame` bị bỏ
  // qua im lặng trong khi cổng vẫn xanh. `envExtra` đặt SAU để pha Giai đoạn 4
  // trỏ sang thư mục dữ liệu/profile Electron riêng của nó.
  const runCheck = (extra, envExtra = {}) => spawnSync(
    process.execPath,
    [path.join(root, 'tests', 'ui', 'tauri-webview-check.js'), port, ...extra],
    { stdio: 'inherit', env: { ...process.env, ...gateEnv, ...envExtra, EDUGAME_TAURI_MEMO: memo } },
  );
  launch();
  (async () => {
    await waitForPort(true);
    if (!check) {
      console.log(`WebView2 CDP tại cổng ${port}, profile ${profile}. Ctrl+C để dừng.`);
      return;
    }
    fs.rmSync(memo, { force: true });
    writeGatePackages();
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
    await waitForPort(false);
    // Tệp gói của cổng là thứ do chính script này ghi, nên dọn được.
    for (const target of Object.values(packagePaths)) fs.rmSync(target, { force: true });
    fs.rmSync(files.foreign, { force: true });
    if (second.status !== 0) process.exit(second.status || 1);

    // Pha ba (Giai đoạn 4): profile Electron tổng hợp + thư mục Tauri rỗng, trên
    // một tiến trình MỚI. Cổng bấm đúng nút "Nhập vào bản mới" của modal, rồi
    // kiểm báo cáo, bản sao lưu và tệp đã chép. `EDUGAME_ELECTRON_PROFILE` chỉ
    // được đặt trong tiến trình này; pha một/hai không thấy profile nên không
    // có modal nhập dữ liệu đè lên phép đo giao diện.
    writeElectronProfile();
    launch({ EDUGAME_TAURI_DATA_DIR: migrationDataDir, EDUGAME_ELECTRON_PROFILE: electronProfile });
    await waitForPort(true);
    const third = runCheck(['--migration'], {
      EDUGAME_TAURI_DATA_DIR: migrationDataDir,
      EDUGAME_ELECTRON_PROFILE: electronProfile,
    });
    stop();
    await waitForPort(false);
    if (third.status === 0) {
      fs.rmSync(gateDataDir, { recursive: true, force: true });
      fs.rmSync(migrationDataDir, { recursive: true, force: true });
      fs.rmSync(electronProfileRoot, { recursive: true, force: true });
    }
    process.exit(third.status || 0);
  })();
}

build();
if (run || check) startAndCheck();
