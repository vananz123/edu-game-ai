// tauri-webview-check.js — nghiệm thu vỏ Tauri (giai đoạn 1 + 2) trên binary THẬT.
//
// Chạy trên binary Tauri ĐÃ ĐÓNG GÓI (src-tauri/target/release/edugame-studio-tauri.exe)
// đang mở một cổng gỡ lỗi WebView2. Kiểm những gì cổng unit KHÔNG thấy được vì
// chúng chỉ đúng trong một WebView2 thật:
//   - UI nạp từ gói cục bộ, đúng thứ tự script của Electron, không nhúng main/preload;
//   - cổng chặn `edugame-guard.js` nạp TRƯỚC mọi script renderer, và cầu
//     `window.eduGame` của giai đoạn 1 KHÔNG còn trong gói;
//   - CSP trong tài liệu khớp tauri.conf.json (không bị nới thành null);
//   - không request mạng nào ra ngoài (file: + ipc chỉ là giao thức nội bộ);
//   - chơi trò chơi ĐÃ LƯU đi hết màn kết quả bằng đúng đường người dùng
//     (Chơi ngay → trả lời → tự lưu phiên) mà không request mạng (bước 6/6);
//   - façade `desktop.*` nối được adapter Tauri và bốn lời gọi khởi động
//     (`appInfo`, `getLibrary`, `getSettings`, `getLocalAiModels`) đi qua
//     `invoke_channel` trả dữ liệu đúng hình dạng Electron đọc;
//   - `setup:*` (wizard cài đặt lần đầu) trả status/preflight đúng hình dạng;
//     payload hỏng bị từ chối và id model lạ trả `blocked`
//     (bước cài thật chỉ chạy với `EDUGAME_TAURI_AI_INSTALL`);
//   - lời gọi kênh chưa port vẫn bị từ chối với `not-supported`, không treo;
//   - thư mục dữ liệu nằm dưới định danh Tauri, KHÔNG phải thư mục của Electron.
//
//   node tests/ui/tauri-webview-check.js <port>
//
// Khi `EDUGAME_TAURI_MEMO` có mặt (do `build-tauri-release.js --check` đặt), cổng
// chạy thêm phép lưu thật: ghi trò chơi và ba bản nháp dự án rồi ghi lại
// id/createdAt xuống tệp memo và THOÁT với mã 0. Pha hai (tham số `--reopen`) so
// tệp memo với thư viện đọc từ đĩa trên tiến trình MỚI, sửa rồi xoá. Tiến trình
// ứng dụng do script cha spawn/kill nên cổng không tự đóng mở nó được — vì vậy
// mới có hai pha.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { check, connect, results } = require('../manual/lib/ui-check-lib');
// Host mà WebView2 nạp được ảnh `edugame-file:` (wry đổi scheme sang host này).
// Đọc từ chính module renderer dùng, không gõ lại: đổi một bên là cổng thấy ngay.
const { TAURI_IMAGE_ORIGIN } = require('../../dist/src/services/storage/custom-illustration');

const memoFile = process.env.EDUGAME_TAURI_MEMO;
const reopenPhase = process.argv.includes('--reopen');
// Pha ba của Giai đoạn 4: profile Electron TỔNG HỢP + thư mục Tauri rỗng, chạy
// trên tiến trình mới. Pha này chỉ đo nhập dữ liệu, không chạy lại các phép đo
// giao diện của pha một — modal nhập sẽ đè lên màn hình khi có profile nguồn.
// Cổng AI local thật (tải model/runtime) chỉ chạy khi script cha đặt biến này.
// Mặc định cổng release không tải hàng GB; lượt kiểm riêng dùng thư mục tạm.
const aiInstallId = process.env.EDUGAME_TAURI_AI_INSTALL || '';
const migrationPhase = process.argv.includes('--migration');

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/**
 * Băm mọi tệp bền vững của một thư mục (đường dẫn tương đối dạng `/`).
 *
 * Bỏ `-wal`/`-shm`: SQLite có thể dựng lại hai tệp tạm này khi mở đọc, nên băm
 * chúng sẽ báo "nguồn bị sửa" dù dữ liệu giáo viên không đổi. `edugame.sqlite`,
 * ảnh, giáo án, cài đặt và `ai-local/` vẫn được băm đầy đủ.
 */
function stableHashes(dir) {
  const hashes = {};
  const walk = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (!/-wal$|-shm$/i.test(entry.name)) {
        const relative = path.relative(dir, full).split(path.sep).join('/');
        hashes[relative] = sha256File(full);
      }
    }
  };
  walk(dir);
  return hashes;
}

function filesContaining(dir, needles) {
  const hits = [];
  const walk = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      const bytes = fs.readFileSync(full);
      for (const needle of needles) {
        if (bytes.includes(Buffer.from(needle, 'utf8'))) {
          hits.push(`${path.relative(dir, full).split(path.sep).join('/')}: ${needle}`);
        }
      }
    }
  };
  walk(dir);
  return hits;
}

function verifyBackupManifest(backupDir) {
  const manifestPath = path.join(backupDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return { ok: false, msg: 'thiếu manifest.json' };
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const files = Array.isArray(manifest.files) ? manifest.files : [];
  const bad = [];
  for (const entry of files) {
    if (!entry || typeof entry.path !== 'string' || typeof entry.sha256 !== 'string') {
      bad.push('mục manifest sai hình dạng');
      continue;
    }
    const file = path.join(backupDir, ...entry.path.split('/'));
    if (!fs.existsSync(file)) {
      bad.push(`${entry.path}: thiếu tệp`);
      continue;
    }
    if (sha256File(file) !== entry.sha256) bad.push(`${entry.path}: sai SHA-256`);
  }
  return {
    ok: bad.length === 0 && files.length > 0,
    msg: bad.length ? bad.join(' · ') : `${files.length} tệp khớp SHA-256`,
    manifest,
  };
}

/** SHA-256 theo luồng: model GGUF hơn 1 GB, không đọc cả tệp vào RAM. */
function sha256FileStream(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(file);
    stream.on('error', reject);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

/**
 * Cổng AI local THẬT (tuỳ chọn): tải model nhỏ nhất + runtime qua đúng lệnh
 * `installLocalAiModel`, kiểm tệp trên đĩa bằng kích thước/SHA-256, rồi khởi
 * động `llama-server` tới READY và dừng. Chỉ chạy khi `EDUGAME_TAURI_AI_INSTALL`
 * có id model; mặc định cổng release không tải hàng GB.
 */
async function aiLocalDownloadChecks(evaluate, modelId, dataDir) {
  const waitMs = ms => new Promise(resolve => setTimeout(resolve, ms));
  const modelLiteral = JSON.stringify(modelId);
  const started = await evaluate(`(async () => {
    const facade = typeof desktop === 'undefined' ? null : desktop;
    if (!facade) return { started: false, error: 'desktop facade không có' };
    const previous = window.__aiDownload;
    if (previous && previous.unlisten) { try { previous.unlisten(); } catch {} }
    const state = window.__aiDownload = {
      done: false, error: '', stages: [], last: null, result: null
    };
    state.unlisten = facade.listen('onLocalAiProgress', value => {
      state.last = value || null;
      if (value && typeof value.stage === 'string' && !state.stages.includes(value.stage)) {
        state.stages.push(value.stage);
      }
    });
    facade.call('installLocalAiModel', ${modelLiteral})
      .then(result => { state.result = result; state.done = true; })
      .catch(error => { state.error = String((error && error.message) || error); state.done = true; });
    return { started: true };
  })()`);
  if (!started || started.started !== true) {
    check('AI local thật: bắt đầu tải model', false, JSON.stringify(started));
    return;
  }

  const deadline = Date.now() + 45 * 60 * 1000;
  let logAt = 0;
  let state = null;
  while (Date.now() < deadline) {
    await waitMs(3000);
    state = await evaluate(`(() => {
      const s = window.__aiDownload || {};
      return {
        done: Boolean(s.done), error: s.error || '',
        stages: Array.isArray(s.stages) ? s.stages : [],
        last: s.last || null,
      };
    })()`);
    if (state.last && state.last.receivedBytes && Date.now() - logAt > 30000) {
      logAt = Date.now();
      const percent = state.last.totalBytes
        ? Math.floor((state.last.receivedBytes * 100) / state.last.totalBytes)
        : 0;
      console.log(`   AI local ${state.last.stage}: ${percent}% ` +
        `(${state.last.receivedBytes}/${state.last.totalBytes} byte)`);
    }
    if (state.done) break;
  }

  const finished = await evaluate(`(() => {
    const s = window.__aiDownload || {};
    if (s.unlisten) { try { s.unlisten(); } catch {} }
    return {
      done: Boolean(s.done), error: s.error || '',
      stages: Array.isArray(s.stages) ? s.stages : [],
      last: s.last || null, result: s.result || null,
    };
  })()`);
  const result = finished.result || null;
  const models = result && result.models && Array.isArray(result.models.models)
    ? result.models.models
    : [];
  const model = models.find(entry => entry && entry.id === modelId) || null;
  const shapeOk = Boolean(result && result.ok === true && result.models && result.models.machine);
  check('AI local thật: tải runtime + model xong, có tiến độ runtime/model',
    finished.done === true && !finished.error && shapeOk && Boolean(model && model.installed === true) &&
      finished.stages.includes('runtime') && finished.stages.includes('model'),
    JSON.stringify({
      done: finished.done, error: finished.error, shapeOk,
      installed: model && model.installed, stages: finished.stages,
      last: finished.last && finished.last.stage,
    }));
  if (!(finished.done === true && !finished.error && model)) return;

  const modelFile = dataDir
    ? path.join(dataDir, 'ai-local', 'models', `${model.id}-${model.version}.gguf`)
    : '';
  const modelBytes = modelFile && fs.existsSync(modelFile) ? fs.statSync(modelFile).size : -1;
  const modelSha = modelFile && fs.existsSync(modelFile) ? await sha256FileStream(modelFile) : '';
  const runtimeRoot = dataDir ? path.join(dataDir, 'ai-local', 'runtime') : '';
  const runtimeDirs = runtimeRoot && fs.existsSync(runtimeRoot)
    ? fs.readdirSync(runtimeRoot).map(name => path.join(runtimeRoot, name))
    : [];
  const runtimeDir = runtimeDirs.find(dir =>
    fs.existsSync(path.join(dir, 'llama-server.exe'))) || '';
  const supportNames = ['msvcp140.dll', 'vcruntime140.dll', 'vcruntime140_1.dll'];
  const supportOk = Boolean(runtimeDir) &&
    supportNames.every(name => fs.existsSync(path.join(runtimeDir, name)));
  check('AI local thật: model đúng byte/SHA-256, runtime + DLL VC++ cạnh llama-server.exe',
    modelBytes === model.sizeBytes &&
      String(modelSha).toLowerCase() === String(model.sha256).toLowerCase() &&
      Boolean(runtimeDir) && supportOk,
    JSON.stringify({
      modelBytes, expectedBytes: model.sizeBytes,
      shaOk: String(modelSha).toLowerCase() === String(model.sha256).toLowerCase(),
      runtime: runtimeDir, support: supportOk,
    }));

  const startStarted = await evaluate(`(async () => {
    const facade = typeof desktop === 'undefined' ? null : desktop;
    if (!facade) return { started: false, error: 'desktop facade không có' };
    const previous = window.__aiStart;
    if (previous && previous.unlisten) { try { previous.unlisten(); } catch {} }
    const state = window.__aiStart = {
      done: false, error: '', stages: [], last: null, result: null
    };
    state.unlisten = facade.listen('onLocalAiProgress', value => {
      state.last = value || null;
      if (value && typeof value.stage === 'string' && !state.stages.includes(value.stage)) {
        state.stages.push(value.stage);
      }
    });
    facade.call('startLocalRuntime', ${modelLiteral})
      .then(result => { state.result = result; state.done = true; })
      .catch(error => { state.error = String((error && error.message) || error); state.done = true; });
    return { started: true };
  })()`);
  if (!startStarted || startStarted.started !== true) {
    check('AI local thật: bắt đầu chạy llama-server', false, JSON.stringify(startStarted));
    return;
  }
  const startDeadline = Date.now() + 10 * 60 * 1000;
  do {
    await waitMs(2000);
    state = await evaluate(`(() => {
      const s = window.__aiStart || {};
      return {
        done: Boolean(s.done), error: s.error || '',
        stages: Array.isArray(s.stages) ? s.stages : [],
        last: s.last || null,
      };
    })()`);
  } while (!state.done && Date.now() < startDeadline);

  const runtime = await evaluate(`(async () => {
    const s = window.__aiStart || {};
    if (s.unlisten) { try { s.unlisten(); } catch {} }
    const before = await desktop.call('getLocalRuntimeStatus');
    const stopped = await desktop.call('stopLocalRuntime');
    const after = await desktop.call('getLocalRuntimeStatus');
    const startResult = s.result || null;
    return {
      done: Boolean(s.done), error: s.error || '',
      stages: Array.isArray(s.stages) ? s.stages : [], last: s.last || null,
      startOk: Boolean(startResult && startResult.ok === true &&
        startResult.models && Array.isArray(startResult.models.models)),
      startBaseUrl: startResult && startResult.baseUrl ? startResult.baseUrl : '',
      before,
      stoppedOk: Boolean(stopped && stopped.ok === true &&
        stopped.models && Array.isArray(stopped.models.models)),
      stoppedModels: stopped && stopped.models && Array.isArray(stopped.models.models)
        ? stopped.models.models.length : 0,
      after,
    };
  })()`);
  check('AI local thật: llama-server lên READY trên loopback, stop trả STOPPED',
    runtime.done === true && !runtime.error && runtime.startOk === true &&
      typeof runtime.startBaseUrl === 'string' &&
      runtime.startBaseUrl.startsWith('http://127.0.0.1:') &&
      Number(runtime.startBaseUrl.split(':').pop()) > 0 &&
      runtime.before && runtime.before.state === 'READY' &&
      runtime.after && runtime.after.state === 'STOPPED' && runtime.stoppedOk === true &&
      runtime.stoppedModels === 3 && runtime.stages.includes('starting'),
    JSON.stringify(runtime));
}

/**
 * Cổng wizard THẬT (tuỳ chọn): sau khi AI local thật đã cài xong, `startSetup`
 * phải chạm tới `complete` nhờ bước khởi động + smoke-test sinh nội dung thật
 * (model/runtime đã có, nên không tải lại hàng GB), và `setup-state.json` phải
 * được ghi bền vững dưới `ai-local/`. Kết thúc bằng `stopLocalRuntime` để không
 * bỏ lại tiến trình llama-server chạy sau cổng.
 */
async function setupRealChecks(evaluate, modelId, dataDir) {
  const finished = await evaluate(`(async () => {
    const started = await desktop.call('startSetup', { modelId: ${JSON.stringify(modelId)} });
    const after = await desktop.call('getSetupStatus');
    await desktop.call('stopLocalRuntime');
    return { started, after };
  })()`);
  const status = finished && finished.started ? finished.started : null;
  const after = finished && finished.after ? finished.after : null;
  check('setup thật: startSetup chạy tới complete (khởi động + smoke-test thật)',
    Boolean(status && status.complete === true && after && after.complete === true),
    JSON.stringify({
      step: status && status.step,
      complete: status && status.complete,
      afterStep: after && after.step,
      error: status && status.error && status.error.message,
    }));

  const statePath = dataDir ? path.join(dataDir, 'ai-local', 'setup-state.json') : '';
  if (statePath) {
    let state = null;
    try { state = JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch {}
    const steps = state && Array.isArray(state.completedSteps) ? state.completedSteps : [];
    check('setup-state.json: step complete, đủ completedSteps, có completedAt',
      Boolean(state && state.step === 'complete' &&
        steps.includes('starting') && steps.includes('smoke-test') &&
        typeof state.completedAt === 'string' && state.schemaVersion === 1),
      state ? `${statePath}: step=${state.step} steps=${steps.join(',')}` : `${statePath}: không đọc được`);
  }
}

/**
 * Bốn đường dẫn của cổng gói `.egame`. Tiến trình cha (`build-tauri-release.js`)
 * ĐẶT BIẾN MÔI TRƯỜNG CỦA CHÍNH NÓ trước khi mở binary — renderer không đặt được
 * biến của tiến trình, nên đường dẫn hộp thoại chỉ có thể đến từ vỏ. Khi chưa có
 * biến, ba phép đo gói bị bỏ qua (cùng cách `EDUGAME_TAURI_MEMO` bật phần lưu).
 */
const packagePaths = {
  save: process.env.EDUGAME_TAURI_PACKAGE_SAVE || '',
  open: process.env.EDUGAME_TAURI_PACKAGE_OPEN || '',
};
const packageGate = Boolean(process.env.EDUGAME_TAURI_PACKAGE_SAVE);

/**
 * Cổng nhập tệp (giai đoạn 3, #270): đường dẫn hộp thoại cho tài liệu, bảng câu
 * hỏi và ảnh — ĐÚNG tám lượt của `GATE_DOCUMENT_TURNS` trong `document.rs`, cộng
 * hai hộp thoại một lượt còn lại — cùng thư mục nhận gói chẩn đoán. Cùng nguyên
 * tắc với cổng gói: biến do tiến trình cha đặt, renderer chỉ chọn được SỐ lượt.
 *
 * Thứ tự `documents` phải khớp thứ tự gọi `importDocument` trong `filesRunner`;
 * một tệp lệch chỗ là phép đo so nhầm định dạng, không phải hỏng.
 */
const documentTurns = Array.from({ length: 8 }, (_, index) => index + 1);
const filePaths = {
  documents: documentTurns.map(turn => process.env[turn === 1 ? 'EDUGAME_TAURI_FILES_DOCUMENT' : `EDUGAME_TAURI_FILES_DOCUMENT_${turn}`] || ''),
  // Tám lượt tài liệu: năm định dạng thật, đường rỗng = Huỷ, PDF hỏng, rồi `.xls`.
  // Năm lượt bảng tính: ba định dạng thật, `.xls` bị từ chối, đường rỗng = Huỷ.
  questions: Array.from({ length: 5 }, (_, index) => process.env[index === 0 ? 'EDUGAME_TAURI_FILES_QUESTIONS' : `EDUGAME_TAURI_FILES_QUESTIONS_${index + 1}`] || ''),
  illustrations: Array.from({ length: 3 }, (_, index) => process.env[index === 0 ? 'EDUGAME_TAURI_FILES_ILLUSTRATION' : `EDUGAME_TAURI_FILES_ILLUSTRATION_${index + 1}`] || ''),
  // Tệp không phải tài liệu, dùng cho kênh "theo đường dẫn" (kéo thả) — đường
  // dẫn đi qua ĐỐI SỐ của lời gọi, nên chạy THẬT sự, không cần bộ đếm hộp thoại.
  foreignDocument: process.env.EDUGAME_TAURI_FILES_FOREIGN || '',
};
const diagnosticsDir = process.env.EDUGAME_DIAGNOSTICS_DIR || '';
const filesGate = Boolean(process.env.EDUGAME_TAURI_FILES_DOCUMENT);

(async () => {
  const { evaluate } = await connect();

  // Pha hai: ứng dụng vừa được script cha mở lại trên cùng profile. Không chạy
  // lại các phép đo giao diện — chỉ so dữ liệu trên đĩa.
  if (reopenPhase) {
    const memo = JSON.parse(fs.readFileSync(memoFile, 'utf8'));
    // Phiên của lượt chơi offline phải sống qua tiến trình mới. Đo và xoá TRƯỚC
    // reopenRunner: phép đo phiên ở đó tìm theo gameId, để lại dòng này thì nó
    // có thể nhặt nhầm phiên của lượt chơi thay vì phiên nó vừa lưu.
    if (memo.play && memo.play.sessionId) {
      const play = await evaluate(reopenPlayRunner(memo));
      check('mở lại: phiên của lượt chơi offline còn trên đĩa đúng điểm, xoá được', play.ok === true, play.msg);
    }
    const out = await evaluate(reopenRunner(memo));
    const projects = memo.projects
      ? await evaluate(reopenProjectRunner(memo.projects))
      : { listOk: false, listMsg: 'memo không có dự án (pha một chưa ghi)' };
    Object.assign(out, projects);
    check('mở lại: trò chơi vẫn còn với id + createdAt cũ',
      out.found === true && out.sameCreatedAt === true && out.sameId === true, out.msg);
    check('mở lại: không seed thêm trò chơi mẫu lần hai', out.sampleTwice === false, out.sampleMsg);
    check('sửa giữ id, createdAt và tiêu đề mới đứng đầu', out.editOk === true, out.editMsg);
    check('xoá trò chơi, thư viện về lại như trước khi lưu', out.deleteOk === true, out.deleteMsg);
    check('lưu/xoá lượt chơi qua library:save-session/delete-sessions',
      out.sessionOk === true, out.sessionMsg);
    check('mở lại: ba bản nháp dự án còn, đúng thứ tự mới-sửa-trước', out.listOk === true, out.listMsg);
    check('dự án: sửa giữ id + createdAt, tiêu đề mới đứng đầu', out.projectEditOk === true, out.projectEditMsg);
    check('dự án: xoá lô trả {ok, deleted, missing} và trần 200', out.projectDeleteOk === true, out.projectDeleteMsg);
    if (memo.package && memo.package.importedId) {
      // Trò chơi nhập từ gói phải NẰM TRÊN ĐĨA: pha một chỉ chứng minh nó lưu
      // được qua cầu, pha hai chứng minh nó sống qua một tiến trình mới và xoá
      // được như mọi dòng khác.
      const pack = await evaluate(reopenPackageRunner(memo.package));
      check('mở lại: trò chơi nhập từ .egame còn với id + câu hỏi cũ, xoá được', pack.ok === true, pack.msg);
    }
    const failedReopen = results.filter(r => !r.ok).length;
    console.log(`\n${results.length - failedReopen}/${results.length} checks passed`);
    process.exit(failedReopen ? 1 : 0);
  }

  // Pha ba (Giai đoạn 4): app tự thấy profile Electron tổng hợp, hiện modal, và
  // cổng bấm đúng nút "Nhập vào bản mới". Kiểm cả phía UI (số dòng, đường dẫn
  // nguồn, nút) lẫn phía đĩa (bản sao lưu + manifest, tệp đã chép, settings đã
  // tước khoá) — không chỉ tin báo cáo JSON của Rust.
  if (migrationPhase) {
    const source = process.env.EDUGAME_ELECTRON_PROFILE || '';
    const target = process.env.EDUGAME_TAURI_DATA_DIR || '';
    if (!source || !target) {
      console.error('EDUGAME_ELECTRON_PROFILE/EDUGAME_TAURI_DATA_DIR thiếu: script cha phải truyền pha Giai đoạn 4');
      process.exit(1);
    }
    const sourceBefore = stableHashes(source);
    const out = await evaluate(MIGRATION_RUNNER);
    if (!out || typeof out !== 'object') throw new Error('migration runner returned nothing');

    check('Giai đoạn 4: detect thấy profile tổng hợp, đúng số dòng/tệp',
      out.detect && out.detect.found === true && out.detect.alreadyMigrated === false &&
      out.detect.sourcePath && path.resolve(out.detect.sourcePath) === path.resolve(source) &&
      out.detect.source && out.detect.source.counts &&
      out.detect.source.counts.games === 2 && out.detect.source.counts.sessions === 1 &&
      out.detect.source.counts.lessonDocuments === 1 && out.detect.source.counts.lessonAnalyses === 1 &&
      out.detect.source.counts.gameRecommendations === 1 && out.detect.source.counts.gameProjects === 1 &&
      out.detect.source.counts.lessonChunks === 2 && out.detect.source.counts.aiGenerationCache === 1 &&
      out.detect.source.counts.aiTasks === 1 && out.detect.source.counts.lessonChats === 1 &&
      out.detect.source.counts.lessonChatMessages === 2,
      JSON.stringify(out.detect && out.detect.source && out.detect.source.counts));

    check('Giai đoạn 4: modal mời nhập hiện đúng đường dẫn nguồn, không tự nhập',
      out.offer === true && out.clicked === true && out.sourcePath &&
      path.resolve(out.sourcePath) === path.resolve(source),
      `offer=${out.offer}, clicked=${out.clicked}, source=${out.sourcePath}`);

    check('Giai đoạn 4: bấm "Nhập vào bản mới" báo xong, đủ 14 dòng và 3 khoá bị bỏ',
      out.done === true && out.failed === false && out.inserted === 14 && out.keys === 3,
      `done=${out.done}, failed=${out.failed}, inserted=${out.inserted}, keys=${out.keys}` +
        (out.failedText ? ` · ${out.failedText.slice(0, 200)}` : ''));

    const backup = out.backup || '';
    const backupInsideTarget = backup && path.resolve(backup).startsWith(path.resolve(target) + path.sep);
    check('Giai đoạn 4: bản sao lưu nằm dưới backups/electron-* của thư mục Tauri',
      backupInsideTarget && fs.existsSync(path.join(backup, 'edugame.sqlite')) &&
      fs.existsSync(path.join(backup, 'db', 'edugame.sqlite')),
      backup || '(không có đường dẫn)');

    const manifest = backup ? verifyBackupManifest(backup) : { ok: false, msg: 'không có bản sao lưu', manifest: null };
    check('Giai đoạn 4: manifest.json băm đúng từng tệp, ghi 3 khoá đã bỏ, loại ai-local/',
      manifest.ok === true && manifest.manifest &&
      manifest.manifest.settings && manifest.manifest.settings.sanitized === true &&
      manifest.manifest.settings.keysRemoved === 3 &&
      Array.isArray(manifest.manifest.excluded) && manifest.manifest.excluded.includes('ai-local/'),
      manifest.msg);

    const secrets = backup ? filesContaining(backup, ['SK-GATE-SECRET']) : ['không có bản sao lưu'];
    check('Giai đoạn 4: không có chuỗi khoá nào trong bản sao lưu (kể cả DB thô)',
      secrets.length === 0, secrets.join(' · '));

    const sourceAfter = stableHashes(source);
    const changed = Object.keys({ ...sourceBefore, ...sourceAfter })
      .filter(relative => sourceBefore[relative] !== sourceAfter[relative]);
    check('Giai đoạn 4: profile nguồn không bị sửa (DB, ảnh, giáo án, cài đặt)',
      changed.length === 0, changed.join(', '));

    const targetImage = path.join(target, 'images', 'ci-gate.img');
    const targetLesson = path.join(target, 'lessons', 'gate-lesson.txt');
    check('Giai đoạn 4: ảnh + giáo án được chép sang đúng thư mục đích',
      fs.existsSync(targetImage) && fs.existsSync(targetLesson) &&
      fs.readFileSync(targetImage).equals(fs.readFileSync(path.join(source, 'images', 'ci-gate.img'))) &&
      fs.readFileSync(targetLesson, 'utf8') === fs.readFileSync(path.join(source, 'lessons', 'gate-lesson.txt'), 'utf8'),
      `${targetImage} / ${targetLesson}`);

    check('Giai đoạn 4: không chép ai-local/ sang bản mới', !fs.existsSync(path.join(target, 'ai-local')),
      path.join(target, 'ai-local'));

    let targetSettings = null;
    try {
      targetSettings = JSON.parse(fs.readFileSync(path.join(target, 'settings.json'), 'utf8'));
    } catch {}
    const provider = targetSettings && targetSettings.ai && targetSettings.ai.providers &&
      targetSettings.ai.providers.openai;
    check('Giai đoạn 4: settings đích giữ base URL/model, bỏ khoá và hasKey/keyMasked',
      Boolean(provider) && provider.baseUrl === 'https://gate.example/v1' &&
      provider.model === 'gate-model' && provider.hasKey === false && provider.keyMasked === '' &&
      !('apiKeyEncrypted' in provider) &&
      !('apiKeyEncrypted' in targetSettings.ai) && !('apiKey' in targetSettings.ai),
      JSON.stringify(targetSettings));

    check('Giai đoạn 4: thư viện đích có 2 trò chơi nhập + trò chơi mẫu, đúng id',
      out.games === 3 && out.gameIds.includes('gate-game-1') && out.gameIds.includes('gate-game-2') &&
      out.gameIds.includes('sample-traffic-001'),
      `games=${out.games}, ids=${(out.gameIds || []).join(',')}`);

    check('Giai đoạn 4: detect lần hai trả alreadyMigrated, không mời nhập lại',
      out.again && out.again.found === true && out.again.alreadyMigrated === true &&
      !out.again.source, JSON.stringify(out.again));

    const failedMigration = results.filter(result => !result.ok).length;
    console.log(`\n${results.length - failedMigration}/${results.length} checks passed`);
    process.exit(failedMigration ? 1 : 0);
  }

  const out = await evaluate(RUNNER);
  if (!out || typeof out !== 'object') throw new Error('runner returned nothing');


  check('trang được nạp từ gói cục bộ (không http)', out.local === true, out.url);
  check('tiêu đề và shell của Electron còn nguyên', out.shell === true, out.shellMsg);
  check('script nạp đúng thứ tự, không có main.js/preload.js', out.scripts === true, out.scriptsMsg);
  check('cổng chặn edugame-guard.js đứng đầu, không còn cầu eduGame', out.guard === true, out.guardMsg);
  check('CSS cục bộ đã áp (sidebar 252px)', out.css === true, out.cssMsg);
  check('CSP trong tài liệu khớp tauri.conf.json', out.csp === true, out.cspMsg);
  check('không có request mạng ra ngoài', out.network === true, out.networkMsg);
  check('façade nối adapter Tauri (desktop.info().adapter)', out.facade === true, out.facadeMsg);
  check('appInfo trả version/platform/userData qua invoke_channel', out.appInfo === true, out.appInfoMsg);
  check('getLibrary trả {version, games, sessions} thật', out.library === true, out.libraryMsg);
  check('getSettings trả theme + ai.mode', out.settings === true, out.settingsMsg);
  check('getLocalAiModels trả {models, machine}', out.localAi === true, out.localAiMsg);
  check('AI local: 3 model đã xác minh, máy thật, có model đề xuất',
    out.localAiCatalog === true, out.localAiMsg);
  check('AI local: id lạ bị từ chối, status STOPPED, stop trả danh mục',
    out.localAiControl === true, out.localAiControlMsg);
  check('setup: status/preflight đúng hình dạng, id lạ trả blocked, payload hỏng bị từ chối',
    out.setup === true, out.setupMsg);
  check('kênh chưa port bị từ chối not-supported (không treo)', out.unsupported === true, out.unsupportedMsg);
  check('lỗi khởi động không che UI (không có trang lỗi nào)', out.boot === true, out.bootMsg);
  const gateDataDir = process.env.EDUGAME_TAURI_DATA_DIR || '';
  // Khi cổng chạy với thư mục tạm (Giai đoạn 4), đường dẫn KHÔNG còn chứa
  // identifier mà phải đúng thư mục cha đã đặt. Nếu không có biến, giữ nguyên
  // phép đo cũ: dữ liệu thật phải nằm dưới identifier của bản Tauri.
  check('thư mục dữ liệu đúng (identifier hoặc thư mục cổng đã đặt)',
    out.dataDir === true || (gateDataDir && path.resolve(out.dataDirMsg) === path.resolve(gateDataDir)),
    out.dataDirMsg);

  // Tuỳ chọn: tải model/runtime AI local THẬT trên thư mục cổng tạm. Không bật
  // trong cổng release thường vì model nhỏ nhất đã 1,19 GiB.
  if (aiInstallId && !reopenPhase && !migrationPhase) {
    console.log('… tải và chạy AI local thật (' + aiInstallId + ')');
    await aiLocalDownloadChecks(evaluate, aiInstallId, gateDataDir);
    await setupRealChecks(evaluate, aiInstallId, gateDataDir);
  }

  // Giai đoạn 5: settings.json chỉ được có blob DPAPI. Phép đọc đĩa nằm ở Node vì
  // trang không có quyền đọc tệp; `out.settingsSave` đã chứng minh vòng IPC.
  const gateSettingsPath = gateDataDir ? path.join(gateDataDir, 'settings.json') : '';
  let gateSettingsText = '';
  let gateSettings = {};
  try {
    gateSettingsText = gateSettingsPath && fs.existsSync(gateSettingsPath)
      ? fs.readFileSync(gateSettingsPath, 'utf8')
      : '';
    gateSettings = gateSettingsText ? JSON.parse(gateSettingsText) : {};
  } catch {
    gateSettings = {};
  }
  const gateGemini = gateSettings && gateSettings.ai && gateSettings.ai.providers &&
    gateSettings.ai.providers.gemini || {};
  check('settings:save chỉ ghi blob DPAPI, không có plaintext trong settings.json',
    out.settingsSave === true &&
      typeof gateGemini.apiKeyEncrypted === 'string' && gateGemini.apiKeyEncrypted.length > 20 &&
      !gateSettingsText.includes('AIza-synthetic-gate-1234') && !('apiKey' in gateGemini),
    out.settingsSaveMsg + ' · tệp=' + (gateSettingsText ? gateSettingsText.length + ' ký tự' : 'không có'));

  const cleared = await evaluate(`(async () => {
    const facade = typeof desktop === 'undefined' ? null : desktop;
    const before = await facade.call('getSettings');
    const saved = await facade.call('saveSettings', {
      ai: { provider: 'local', providers: { gemini: { clearKey: true } } },
      preferences: before.preferences || {}
    });
    const settings = await facade.call('getSettings');
    const gemini = (settings && settings.ai && settings.ai.providers || [])
      .find(provider => provider && provider.id === 'gemini') || {};
    return {
      ok: Boolean(saved && saved.ok === true && gemini.hasKey === false && gemini.keyMasked === ''),
      msg: JSON.stringify({ ok: saved && saved.ok, hasKey: gemini.hasKey, keyMasked: gemini.keyMasked })
    };
  })()`);
  check('settings:save clearKey xoá khoá đã lưu, view không còn hasKey', cleared.ok === true, cleared.msg);

  // Cổng nhập tệp (#270): cùng lý do với cổng gói — thiếu biến là script cha quên
  // truyền, không phải một cấu hình hợp lệ.
  if (!reopenPhase && !filesGate) {
    console.error('EDUGAME_TAURI_FILES_DOCUMENT thiếu: script cha phải truyền cổng nhập tệp cho tiến trình kiểm');
    process.exit(1);
  }
  console.log('… đo nhập tệp (#270)');
  if (filesGate) {
    console.time('files');
    const files = await evaluate(filesRunner(filePaths, filePaths.foreignDocument));
    const docs = files.docs || [];
    // Bảng 8 lượt: 5 định dạng thật + Huỷ (đo riêng bên dưới) + PDF hỏng và .xls
    // bị từ chối. Năm lượt đầu phải đọc ra chữ; hai lượt cuối phải ném EG_DOCUMENT.
    const realDocs = docs.filter(entry => entry.kind === 'doc');
    check('importDocument đọc .txt/.md/.docx/.pptx/.pdf trong V8 nhúng',
      docs.length === 8 && realDocs.length === 5 && realDocs.every(entry => entry.ok === true) &&
      docs.filter(entry => entry.kind === 'refuse').every(entry => entry.ok === true),
      docs.map(entry => (entry.ok ? 'ok ' : 'LỖI ') + (entry.name || '').split(/[\\/]/).pop() +
        ' (' + entry.characters + ' ký tự) ' + (entry.ok ? String(entry.text).slice(0, 24) : entry.error)).join(' · '));
    check('Huỷ hộp thoại nhập tài liệu trả null', files.cancel === true, files.cancelMsg);
    check('importDocumentFromPath mang sizeBytes + name, không qua hộp thoại',
      files.byPath === true, files.byPathMsg);
    check('kênh theo đường dẫn từ chối .xls TRƯỚC đĩa, câu của main.ts',
      files.foreign === true, files.foreignMsg);
    check('kênh theo đường dẫn với đường rỗng = Huỷ', files.foreignEmpty === true,
      String(files.foreignEmpty));
    const sheets = files.sheets || [];
    // Ba định dạng đều đọc ra CÙNG bộ câu hỏi, nên câu đầu được so CHUNG giữa ba
    // bảng: một bảng đọc lệch là đỏ ngay, còn chuỗi cứng thì không cần gõ lại.
    check('importQuestions đọc .csv/.tsv/.xlsx ra {name, questions[]}',
      sheets.length === 5 && sheets.slice(0, 3).every(entry => entry.ok === true) &&
      new Set(sheets.slice(0, 3).map(entry => entry.first)).size === 1,
      sheets.filter(entry => entry.kind === 'sheet')
        .map(entry => (entry.ok ? 'ok ' : 'LỖI ') + (entry.name || '').split(/[\\/]/).pop() +
          ' (' + entry.count + ' câu: ' + String(entry.first || entry.error).slice(0, 24) + ')').join(' · '));
    check('bảng tính: đuôi lạ bị từ chối, đường rỗng = Huỷ',
      sheets.length === 5 && sheets[3].ok === true && sheets[4].ok === true,
      JSON.stringify(sheets.slice(3)));
    const images = files.images || [];
    check('importIllustration ghi PNG thật thành ci-<32 hex>, trả {id, bytes, format}',
      Boolean(images[0]) && images[0].ok === true, JSON.stringify(images[0] || null));
    check('ảnh đuôi lạ và "ảnh" chỉ mang tên ảnh bị từ chối',
      images.length === 3 && images.slice(1).every(entry => entry.ok === true),
      images.slice(1).map(entry => String(entry.error || entry.got)).join(' · '));
    check('ảnh nạp được trong <img> qua host edugame-file.tauri.localhost (CSP img-src cho phép)',
      files.served === true, files.servedMsg);
    check('scheme thật edugame-file:// không nạp được trong WebView2 (lý do đổi host)',
      files.realScheme === true, 'edugame-file:// bị từ chối=' + files.realScheme);
    check('deleteIllustration: id lạ → {ok:false}, id thật → {ok:true}, tệp thôi phục vụ',
      files.deleteForeign === true && files.deleteOk === true && files.servedAfterDelete === true,
      'id lạ=' + files.deleteForeign + ', xoá=' + files.deleteOk + ', 404 sau xoá=' + files.servedAfterDelete);
    check('setFullscreen bật/tắt trả {ok:true}', files.fullscreen === true, files.fullscreenMsg);
    console.timeEnd('files');
    await diagnosticsChecks(evaluate, diagnosticsDir, files);
  }

  console.log('… lưu trò chơi + .egame, ghi memo');
  if (memoFile) {
    // Cổng chạy bằng `--check` LUÔN phải đo gói `.egame`; thiếu biến ở đây là
    // script cha quên truyền, không phải một cấu hình hợp lệ — bỏ qua im lặng
    // thì bốn phép đo gói không bao giờ chạy mà cổng vẫn xanh.
    if (!reopenPhase && !packageGate) {
      console.error('EDUGAME_TAURI_PACKAGE_SAVE thiếu: script cha phải truyền biến cổng gói cho tiến trình kiểm');
      process.exit(1);
    }
    // Ghi thật qua façade rồi để lại memo cho pha hai (tiến trình khác) so.
    const first = await evaluate(saveRunner('Kiểm tra lưu ' + Date.now()));
    check('lưu trò chơi qua library:save-game', first.ok === true, first.msg);
    const projects = await evaluate(projectSaveRunner('Kiểm tra dự án ' + Date.now()));
    check('lưu dự án qua project:save-draft (kiểm dữ liệu + dọn ảnh)', projects.ok === true, projects.msg);
    // Gói `.egame`: xuất tệp thật qua hộp thoại lưu của CỔNG, rồi nhập lại ngay
    // trong tiến trình này (một tệp, hai lượt) — pha hai chỉ đo phần cần tiến
    // trình mới.
    let imported = null;
    if (packageGate) {
      const exported = await evaluate(exportRunner('Gói qua cổng', packagePaths.save));
      check('xuất .egame qua files:export-game (tệp thật + {ok, path})', exported.ok === true, exported.msg);
      const onDisk = fs.existsSync(packagePaths.save);
      check('tệp .egame ghi xuống đĩa đúng hình dạng gói', onDisk && packageShape(fs.readFileSync(packagePaths.save, 'utf8')),
        onDisk ? fs.readFileSync(packagePaths.save, 'utf8').slice(0, 100) : 'không có tệp');
      imported = await evaluate(importRunner('Gói qua cổng'));
      check('nhập lại .egame: trò chơi + ngân hàng câu hỏi còn nguyên, id mới', imported.ok === true, imported.msg);
      const refused = await evaluate(hostileRunner());
      check('gói hỏng/độc hại bị từ chối với câu đọc được, không treo', refused.ok === true, refused.msg);
    }
    // Chơi offline (#271): trò chơi VỪA LƯU ở trên được chơi bằng đúng đường
    // người dùng — bấm "Chơi ngay" trên thẻ thư viện, chọn đáp án, màn kết quả
    // tự lưu phiên qua library:save-session. Bộ đếm mạng bọc đúng bốn cửa
    // fetch/XHR/WebSocket/sendBeacon + tài nguyên mới, cùng đối chứng dương
    // của cổng offline Electron. Pha hai so phiên này trên tiến trình mới.
    console.log('… chơi offline trò chơi vừa lưu (#271)');
    const play = await evaluate(offlinePlayRunner(first.gameId));
    check('chơi offline: Chơi ngay trên thẻ → trả lời → kết quả tự lưu', play.played === true, play.msg);
    check('chơi offline: phiên đúng trò chơi, 100/100 điểm, 1 quyết định', play.sessionOk === true, JSON.stringify(play.session));
    check('chơi offline: 0 request mạng trong lượt chơi, đối chứng dương có ghi',
      play.networkOk === true && play.control === true, 'đối chứng=' + play.control + ', ' + play.networkMsg);
    check('chơi offline: minh hoạ SVG nội tuyến, không ảnh từ xa, đóng màn sạch',
      Array.isArray(play.remoteArt) && play.remoteArt.length === 0 && play.svgCount >= 1 && play.closed === true,
      'svg=' + play.svgCount + ', xa=' + JSON.stringify(play.remoteArt) + ', đóng=' + play.closed);
    fs.writeFileSync(memoFile, JSON.stringify({
      id: first.gameId,
      createdAt: first.createdAt,
      title: first.title,
      projects,
      package: imported ? { path: packagePaths.save, importedId: imported.gameId } : null,
      play: play.sessionOk ? { sessionId: play.sessionId, points: play.session.points, percent: play.session.percent } : null,
    }));
  }

  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(error => {
  console.error('tauri-webview-check failed to run:', error && error.message);
  process.exit(1);
});

const RUNNER = `(async () => {
  const out = {};
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // Bộ đếm mạng phải bật TRƯỚC khi đọc mạng — nhưng trang đã nạp xong. Nên đo
  // bằng Performance API: liệt kê tài nguyên đã tải, cộng thêm bộ đếm cho lúc chạy.
  const attempts = [];
  // Không dùng regex có \\/ trong chuỗi này: RUNNER là template literal, nên mỗi
  // dấu \\ phải viết đôi. startsWith tránh hẳn cái bẫy đó.
  const isTauriAsset = u => {
    const text = String(u || '');
    return text.startsWith('http://tauri.localhost/') || text === 'http://tauri.localhost';
  };
  // ipc.localhost là kênh gọi lệnh của Tauri (plugin:event|listen đi qua đây),
  // vẫn nằm trong máy — cùng loại giao thức nội bộ như tauri.localhost.
  const isIpcChannel = u => {
    const text = String(u || '');
    return text.startsWith('http://ipc.localhost/') || text === 'http://ipc.localhost';
  };
  // Mọi giao thức mạng khác máy chủ tài nguyên/kênh nội bộ của Tauri đều tính là ra ngoài.
  const isRemote = u => /^(https?|wss?|ftp):/i.test(String(u || '')) && !isTauriAsset(u) && !isIpcChannel(u);
  const origFetch = window.fetch;
  window.fetch = function (input) {
    const u = typeof input === 'string' ? input : (input && input.url);
    if (isRemote(u)) attempts.push('fetch:' + u);
    return origFetch.apply(this, arguments);
  };
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, u) {
    if (isRemote(u)) attempts.push('xhr:' + u);
    return origOpen.apply(this, arguments);
  };

  out.url = location.href;
  // Tauri phục vụ tài nguyên đóng gói qua giao thức riêng http://tauri.localhost/.
  // "Cục bộ" nghĩa là máy chủ đó, không phải một máy chủ từ xa.
  out.local = location.protocol === 'file:' || isTauriAsset(location.href);

  const shell = document.querySelector('.app-shell aside') && document.querySelector('nav [data-page="library"]');
  out.shell = Boolean(shell);
  out.shellMsg = shell ? 'có sidebar + nav' : 'không thấy shell';

  const loaded = [...document.querySelectorAll('script[src]')].map(s => s.getAttribute('src'));
  const forbidden = loaded.filter(src => /(^|\\/)(main|preload)\\.js$/.test(src));
  out.scripts = forbidden.length === 0 && loaded.length > 60;
  out.scriptsMsg = forbidden.length ? 'nạp: ' + forbidden.join(', ') : 'đầu tiên=' + loaded[0] + ', tổng=' + loaded.length;

  // Giai đoạn 2: gói Tauri chỉ có cổng chặn, không dựng lại cầu 92 khoá.
  const guardFirst = loaded[0] === 'edugame-guard.js';
  const bridgeGone = loaded.indexOf('edugame-bridge.js') < 0 && typeof window.eduGame === 'undefined';
  out.guard = guardFirst && bridgeGone;
  out.guardMsg = 'đầu tiên=' + loaded[0] + ', eduGame=' + typeof window.eduGame +
    ', bridge trong danh sách=' + (loaded.indexOf('edugame-bridge.js') >= 0);

  const aside = document.querySelector('.app-shell aside');
  const width = aside ? Math.round(aside.getBoundingClientRect().width) : 0;
  out.css = width === 252;
  out.cssMsg = 'sidebar=' + width + 'px';

  const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
  const policy = meta ? meta.getAttribute('content') : '';
  // Tauri tiêm CSP qua chính sách của nó; nếu policy thật đã nới (thiếu script-src)
  // thì đó là cờ đỏ. So đúng nguyên văn với thứ index.html khai là phép so mạnh nhất.
  out.csp = Boolean(policy) && /script-src 'self'/.test(policy) && !/'unsafe-eval'/.test(policy);
  out.cspMsg = policy ? policy.slice(0, 120) : 'không có CSP';

  const resources = performance.getEntriesByType('resource').map(entry => entry.name);
  const remote = resources.filter(isRemote);
  await sleep(300);
  out.network = remote.length + attempts.length === 0;
  out.networkMsg = 'resources=' + resources.length + ' ngoài=' + [...remote, ...attempts].join(',');

  // Façade phải nối adapter Tauri: thiếu bước này mọi nút trong app trả
  // "not-supported" dù vỏ đã chạy đúng.
  // desktop là const ở phạm vi script cổ điển nên KHÔNG có trên window; đọc thẳng
  // tên trong biểu thức này mới thấy nó (cùng cách renderer gọi).
  let facade = null;
  try { facade = typeof desktop === 'undefined' ? null : desktop; } catch (error) { facade = null; }
  let info = null;
  try { info = facade && facade.info(); } catch (error) { info = { adapter: 'error:' + (error && error.message) }; }
  out.facade = Boolean(info && info.adapter === 'tauri' && info.pendingListeners === 0);
  out.facadeMsg = JSON.stringify(info) + ', typeof desktop=' + (facade ? 'object' : 'undefined');

  // Bốn kênh khởi động đi đúng đường của renderer thật: desktop.call → adapter →
  // invoke('invoke_channel', {channel}). Kiểm hình dạng thay vì "có trả lời": vỏ
  // trả {} cho có cũng phải đỏ ở đây.
  try {
    const appInfo = await facade.call('appInfo');
    out.appInfo = Boolean(appInfo && appInfo.version && appInfo.platform && appInfo.userData);
    out.appInfoMsg = JSON.stringify(appInfo);
    out.dataDir = /vn\\.edugame\\.studio\\.tauri/i.test(String(appInfo && appInfo.userData)) &&
      !/AppData[\\\\/]Roaming[\\\\/]EduGame Studio[\\\\/]/.test(String(appInfo && appInfo.userData));
    out.dataDirMsg = String(appInfo && appInfo.userData);
  } catch (error) {
    out.appInfo = false;
    out.appInfoMsg = 'appInfo lỗi: ' + (error && error.message);
    out.dataDir = false;
    out.dataDirMsg = 'không có';
  }

  try {
    const library = await facade.call('getLibrary');
    out.library = Boolean(library && library.version === 1 &&
      Array.isArray(library.games) && Array.isArray(library.sessions));
    out.libraryMsg = JSON.stringify(library && {
      version: library.version,
      games: Array.isArray(library.games) ? library.games.length : typeof library.games,
      sessions: Array.isArray(library.sessions) ? library.sessions.length : typeof library.sessions,
    });
  } catch (error) {
    out.library = false;
    out.libraryMsg = 'library:get lỗi: ' + (error && error.message);
  }
  try {
    const settings = await facade.call('getSettings');
    const theme = settings && settings.preferences && settings.preferences.theme;
    out.settings = Boolean(settings && settings.ai && settings.ai.mode === 'offline' && typeof theme === 'string');
    out.settingsMsg = JSON.stringify({ aiMode: settings && settings.ai && settings.ai.mode, theme });
  } catch (error) {
    out.settings = false;
    out.settingsMsg = 'settings:get lỗi: ' + (error && error.message);
  }

  // Giai đoạn 5: lưu một khoá tổng hợp qua ĐÚNG façade rồi đọc lại. Khoá chỉ
  // được trả về dưới dạng hasKey/keyMasked; phép đọc đĩa ở phía Node mới chứng
  // minh settings.json có blob DPAPI mà không có plaintext.
  try {
    const before = await facade.call('getSettings');
    const saved = await facade.call('saveSettings', {
      ai: {
        provider: 'gemini',
        providers: {
          gemini: {
            baseUrl: 'https://synthetic.example/v1',
            model: 'synthetic-gate-model',
            apiKey: 'AIza-synthetic-gate-1234'
          }
        }
      },
      preferences: before.preferences || {}
    });
    const after = await facade.call('getSettings');
    const pick = value => (value && value.ai && value.ai.providers || [])
      .find(provider => provider && provider.id === 'gemini') || {};
    const gemini = pick(saved && saved.settings);
    const again = pick(after);
    out.settingsSave = Boolean(saved && saved.ok === true && gemini.hasKey === true &&
      gemini.keyMasked === '••••1234' && again.hasKey === true &&
      !('apiKeyEncrypted' in gemini) && !('apiKey' in gemini));
    out.settingsSaveMsg = JSON.stringify({
      ok: saved && saved.ok,
      hasKey: gemini.hasKey,
      keyMasked: gemini.keyMasked,
      againHasKey: again.hasKey,
      visibleKeyFields: Object.keys(gemini).filter(key => /apiKey/i.test(key))
    });
  } catch (error) {
    out.settingsSave = false;
    out.settingsSaveMsg = 'settings:save lỗi: ' + (error && error.message);
  }

  try {
    const models = await facade.call('getLocalAiModels');
    const catalog = models && Array.isArray(models.models) ? models.models : [];
    out.localAi = Boolean(models && Array.isArray(models.models) && models.machine &&
      typeof models.machine.runtimeState === 'string');
    out.localAiCatalog = catalog.length === 3 &&
      catalog.every(model => typeof model.id === 'string' && model.sizeBytes > 0 &&
        typeof model.installed === 'boolean') &&
      models.machine.runtimeSupported === true &&
      catalog.some(model => model.id === models.machine.recommendedModelId);
    out.localAiMsg = JSON.stringify({ models: catalog.length,
      state: models && models.machine && models.machine.runtimeState,
      recommended: models && models.machine && models.machine.recommendedModelId });
  } catch (error) {
    out.localAi = false;
    out.localAiCatalog = false;
    out.localAiMsg = 'ai:local-models lỗi: ' + (error && error.message);
  }

  // AI local: một id lạ phải bị từ chối trước khi chạm mạng/đĩa; trạng thái và
  // lệnh dừng phải trả lời được khi chưa có tiến trình nào chạy.
  try {
    let refused = false;
    try {
      await facade.call('installLocalAiModel', 'not-a-real-model');
    } catch (error) {
      refused = /danh mục/.test(String((error && error.message) || ''));
    }
    const status = await facade.call('getLocalRuntimeStatus');
    const stopped = await facade.call('stopLocalRuntime');
    const stoppedModels = stopped && stopped.models && Array.isArray(stopped.models.models)
      ? stopped.models.models.length : 0;
    out.localAiControl = refused && status && status.state === 'STOPPED' &&
      Boolean(stopped && stopped.ok === true && stoppedModels === 3);
    out.localAiControlMsg = JSON.stringify({
      refused,
      state: status && status.state,
      stoppedOk: Boolean(stopped && stopped.ok === true),
      stoppedModels,
    });
  } catch (error) {
    out.localAiControl = false;
    out.localAiControlMsg = 'AI local control lỗi: ' + (error && error.message);
  }

  // Wizard cài đặt lần đầu (setup:*): status/preflight chỉ đọc. Payload hỏng
  // phải bị từ chối, id model lạ phải trả blocked — không rejected promise —
  // đúng hợp đồng Electron.
  try {
    const status = await facade.call('getSetupStatus');
    const preflight = await facade.call('preflightSetup');
    const blocked = await facade.call('preflightSetup', { modelId: 'not-a-real-model' });
    let rejected = false;
    try {
      await facade.call('startSetup', 42);
    } catch (error) {
      rejected = true;
    }
    out.setup = Boolean(status && typeof status.step === 'string' &&
      typeof status.complete === 'boolean' && typeof status.running === 'boolean' &&
      preflight && preflight.hardware && typeof preflight.hardware.logicalCpuCount === 'number' &&
      preflight.plan && typeof preflight.plan.remainingBytes === 'number' &&
      typeof preflight.plan.enoughDiskSpace === 'boolean' &&
      preflight.plan.runtime && typeof preflight.plan.runtime.id === 'string' &&
      preflight.plan.runtime.id.indexOf('llama.cpp-b11681-') === 0 &&
      preflight.plan.model && typeof preflight.plan.model.id === 'string' &&
      preflight.plan.model.id.length > 0 &&
      blocked && blocked.blocked && blocked.blocked.code === 'incomplete-configuration' &&
      rejected);
    out.setupMsg = JSON.stringify({
      step: status && status.step,
      running: status && status.running,
      runtimeId: preflight && preflight.plan && preflight.plan.runtime && preflight.plan.runtime.id,
      modelId: preflight && preflight.plan && preflight.plan.model && preflight.plan.model.id,
      blockedCode: blocked && blocked.blocked && blocked.blocked.code,
      rejected,
    });
  } catch (error) {
    out.setup = false;
    out.setupMsg = 'setup:* lỗi: ' + (error && error.message);
  }

  // Một kênh có trả lời nhưng chưa port (ví dụ lưu tài liệu giáo án) phải từ
  // chối ĐỌC ĐƯỢC. Câu lỗi đi qua cửa chung nên nó phải nêu tên kênh, không
  // được treo. Giai đoạn 3 đã port nhóm library:*, nên chọn kênh còn trống.
  try {
    await facade.call('saveLessonDocument', { title: 'synthetic' });
    out.unsupported = false;
    out.unsupportedMsg = 'saveLessonDocument lại trả thành công';
  } catch (error) {
    const message = String((error && error.message) || '');
    out.unsupported = Boolean(error && error.code) && /lesson:save-document/.test(message);
    out.unsupportedMsg = (error && error.code) + ': ' + message;
  }

  // Trang lỗi khởi tạo của bootstrap là dấu hiệu vỏ chưa nối được cầu.
  await sleep(500);
  const content = document.getElementById('pageContent');
  const body = content ? content.innerText : '';
  out.boot = !/Không thể khởi tạo ứng dụng/.test(body);
  out.bootMsg = body.replace(/\\s+/g, ' ').trim().slice(0, 120);
  return out;
})()`;

// Trò chơi hợp lệ tối giản, cùng hình dạng mà test Rust `library.rs` dùng:
// bốn bộ kiểm của `library-ops.ts` phải nhận thì mới đo được đường lưu thật.
// Dựng bằng `JSON.stringify` thay vì viết thẳng trong template để không phải
// nhân đôi dấu `\\` trong chuỗi lồng.
function scenario(title) {
  return {
    title,
    template: 'scenario',
    questions: [{
      id: 'q1',
      type: 'scenario',
      prompt: 'Đèn đỏ thì dừng?',
      options: [{ id: 'a', text: 'Đi tiếp' }, { id: 'b', text: 'Dừng lại' }],
      correctOptionId: 'b',
      explanation: 'Dừng trước vạch.',
    }],
  };
}

/** Chữ của một gói `.egame` hợp lệ, đúng envelope `writeGamePackage` ghi. */
function packageShape(text) {
  try {
    const parsed = JSON.parse(text);
    return parsed.packageFormat === 'edugame' && parsed.packageVersion === 1 &&
      Boolean(parsed.game) && typeof parsed.game.title === 'string' &&
      Array.isArray(parsed.game.questions);
  } catch {
    return false;
  }
}

/**
 * Lượt xuất: qua ĐÚNG cửa renderer (`desktop.call('exportGame')` → adapter →
 * `invoke_channel` → `package::export`), hộp thoại lưu bị CỔNG thay bằng đường dẫn
 * trong biến môi trường của tiến trình. Kết quả phải nói đúng tệp đã ghi.
 */
/**
 * Pha ba (Giai đoạn 4): đọc modal thật do bootstrap mở, bấm nút nhập, rồi trả
 * về cả báo cáo JSON của vỏ lẫn các thuộc tính `data-migration-*` của modal.
 * Node phía ngoài kiểm đĩa (bản sao lưu, manifest, tệp đích) — runner không được
 * tự tuyên bố thành công chỉ vì nút đã bấm.
 */
const MIGRATION_RUNNER = `(async () => {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitFor = async (probe, timeout) => {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const value = probe();
      if (value) return value;
      await sleep(50);
    }
    return null;
  };
  const out = { detect: null, offer: false, clicked: false, sourcePath: '', done: false, failed: false };
  out.detect = await desktop.host('migrationDetect');
  const offer = await waitFor(() => document.querySelector('[data-migration-phase="offer"]'), 15000);
  out.offer = Boolean(offer);
  out.sourcePath = offer ? offer.getAttribute('data-migration-source') || '' : '';
  const button = offer && offer.querySelector('[data-migration-action="import"]');
  out.clicked = Boolean(button);
  if (button) button.click();
  const terminal = await waitFor(
    () => document.querySelector('[data-migration-phase="done"], [data-migration-phase="failed"]'),
    180000
  );
  const phase = terminal ? terminal.getAttribute('data-migration-phase') : '';
  out.done = phase === 'done';
  out.failed = phase === 'failed';
  out.backup = out.done ? terminal.getAttribute('data-migration-backup') || '' : '';
  out.inserted = out.done ? Number(terminal.getAttribute('data-migration-inserted')) : 0;
  out.keys = out.done ? Number(terminal.getAttribute('data-migration-keys')) : 0;
  out.doneText = terminal ? String(terminal.textContent || '') : '';
  out.failedText = out.failed ? String(terminal.textContent || '') : '';
  out.again = await desktop.host('migrationDetect');
  const library = await desktop.call('getLibrary');
  out.games = Array.isArray(library && library.games) ? library.games.length : -1;
  out.gameIds = Array.isArray(library && library.games) ? library.games.map(game => game.id).sort() : [];
  return out;
})()`;

const exportRunner = (title, target) => `(async () => {
  const out = {};
  const title = ${JSON.stringify(title)};
  const target = ${JSON.stringify(target)};
  // Trò chơi xuất đi là một trò CHƯA lưu: bản xuất không cần dòng trong thư viện.
  const game = ${JSON.stringify(scenario('__TITLE__')).replace('"__TITLE__"', 'title')};
  try {
    const result = await desktop.call('exportGame', game);
    out.ok = Boolean(result && result.ok === true && result.path === target);
    out.msg = JSON.stringify(result);
  } catch (error) {
    out.ok = false;
    out.msg = 'exportGame lỗi: ' + (error && error.code) + ': ' + (error && error.message);
  }
  return out;
})()`;

/**
 * Lượt nhập: `desktop.call('importGame')` mở hộp thoại nhập của cổng trên CÙNG
 * tệp vừa ghi, lưu trò chơi trả về, rồi đọc lại từ thư viện. Id phải KHÁC id tác
 * giả nếu gói mang id đã có trong thư viện; ở đây gói không mang id nên trò chơi
 * vẫn nhận id `imported_…` do máy này sinh.
 */
const importRunner = (title) => `(async () => {
  const out = {};
  const title = ${JSON.stringify(title)};
  try {
    const before = (await desktop.call('getLibrary')).games.length;
    // Lượt 1 = đường nhập thật của cổng (tệp vừa xuất); các lượt sau là gói xấu.
    await desktop.gate('setPackageGateTurn', 1);
    const game = await desktop.call('importGame');
    out.title = game && game.title;
    out.gameId = game && game.id;
    const saved = game ? await desktop.call('saveGame', game) : null;
    const after = (await desktop.call('getLibrary')).games;
    out.ok = Boolean(game && saved) &&
      game.title === title &&
      game.template === 'scenario' &&
      Array.isArray(game.questions) && game.questions.length === 1 &&
      game.questions[0].explanation === 'Dừng trước vạch.' &&
      /^imported_/.test(String(game.id)) &&
      after.length === before + 1 && after.some(g => g.id === saved.id) &&
      !('createdAt' in game);
    out.msg = 'id=' + (game && game.id) + ', câu hỏi=' + (game && game.questions && game.questions.length) +
      ', games ' + before + '→' + after.length;
  } catch (error) {
    out.ok = false;
    out.msg = 'importGame lỗi: ' + (error && error.code) + ': ' + (error && error.message);
  }
  return out;
})()`;

/**
 * Ba gói xấu, mỗi gói một đường dẫn mà tiến trình cha đã ghi sẵn: JSON hỏng, gói
 * đúng JSON nhưng thiếu câu hỏi, và tệp lớn hơn trần 20 MB. Cả ba phải ném lỗi
 * ĐỌC ĐƯỢC có mã `EG_…`, không được trả một trò chơi rỗng và không được treo.
 */
const hostileRunner = () => `(async () => {
  const out = { cases: [] };
  // Bộ đếm của cổng đọc lúc gọi. Lượt nhập thật vừa dùng giá trị 1; các lượt sau
  // là 2, 3, 4 (ba gói xấu theo thứ tự JSON hỏng → thiếu câu hỏi → quá 20 MB).
  // Renderer chỉ chọn được SỐ, không chọn được đường dẫn.
  const attempt = async (label, turn) => {
    await desktop.gate('setPackageGateTurn', turn);
    const before = (await desktop.call('getLibrary')).games.length;
    try {
      const game = await desktop.call('importGame');
      out.cases.push(label + ': TRẢ THÀNH CÔNG ' + JSON.stringify(game && game.id));
    } catch (error) {
      const after = (await desktop.call('getLibrary')).games.length;
      // Lỗi của vỏ Tauri tới renderer dưới dạng chuỗi, nên façade gói nó thành
      // 'host-error' với mã 'EG_…' ở ĐẦU message — đúng thứ giáo viên thấy. Cổng
      // đo mã đó ở message, không ở error.code (luôn là 'host-error').
      const message = String((error && error.message) || '');
      const code = (/^EG_[A-Z_]+/.exec(message) || [''])[0];
      if (!code || after !== before) out.cases.push(label + ': sai mã/đã ghi dòng — ' + message.slice(0, 40));
      else out.cases.push(label + ': ' + code + ' | ' + message.slice(0, 80));
    }
  };
  await attempt('JSON hỏng', 2);
  await attempt('thiếu câu hỏi', 3);
  await attempt('quá 20 MB', 4);
  out.ok = out.cases.length === 3 && out.cases.every(line => /^[^:]+: EG_[A-Z_]+ \\| /.test(line));
  out.msg = out.cases.join(' · ');
  return out;
})()`;

/**
 * Phần đo cần ĐĨA của cổng (Node), tách khỏi `evaluate` vì trang không đọc được
 * tệp: gói chẩn đoán vừa ghi, rồi `diagnostics:clear`/`open-folder` ở trong trang.
 *
 * Tên tệp gói mang giờ hệ thống, nên so bằng MẪU cộng dòng "Tạo lúc" của nội
 * dung, không so tên chính xác.
 */
async function diagnosticsChecks(evaluate, dir, summary) {
  const exported = summary.diagnostics;
  const ok = Boolean(exported && exported.path && fs.existsSync(exported.path));
  check('exportDiagnostics ghi tệp .txt vào thư mục chẩn đoán của cổng', ok,
    ok ? exported.path : (summary.diagnosticsError || JSON.stringify(exported)));
  if (!ok) return;
  const name = path.basename(exported.path);
  const text = fs.readFileSync(exported.path, 'utf8');
  const inside = path.resolve(exported.path).startsWith(path.resolve(dir) + path.sep);
  check('tên gói theo mẫu, tệp nằm ĐÚNG thư mục cổng (không rơi về thư mục log)',
    /^EduGame-Studio-chan-doan-\d{4}-\d{2}-\d{2}-\d{9}\.txt$/.test(name) && inside,
    name + ' @ ' + exported.path);
  const head = text.split('\r\n');
  check('gói mở đầu bằng tiêu đề + phiên bản + thư mục log, xuống dòng CRLF',
    head[0] === 'EduGame Studio — gói chẩn đoán AI' &&
    /^Tạo lúc: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(head[1] || '') &&
    /^Phiên bản ứng dụng: \d/.test(head[2] || '') &&
    /^Thư mục log: .+ \(giữ 14 ngày\)$/.test(head.find(line => line.startsWith('Thư mục log: ')) || '') &&
    head.includes('Lưu ý quyền riêng tư: log chỉ chứa id dự án/tài liệu, số lượng mục, thời gian, model/runtime và mã lỗi.') &&
    head.some(line => /^--- log \(\d+ dòng gần nhất\) ---$/.test(line)) &&
    !/\n/.test(text.replace(/\r\n/g, '')) &&
    exported.bytes === Buffer.byteLength(text, 'utf8'),
    head.slice(0, 4).join(' | '));
  check('gói có dòng log của chính lượt này (clear trước export)',
    /"event":"diagnostics\.clear"/.test(text),
    (text.match(/"event":"diagnostics\.clear"[^\r\n]*/) || ['(không thấy)'])[0].slice(0, 120));
  const info = summary.diagnosticsInfo;
  check('diagnosticsInfo trả {folder, files, bytes, retentionDays:14}',
    Boolean(info) && info.retentionDays === 14 && typeof info.folder === 'string' &&
    Number(info.files) >= 1 && Number(info.bytes) > 0,
    JSON.stringify(info));

  // Xoá log rồi mở thư mục: xoá phải xoá TỆP LOG và để lại đúng một dòng về
  // lượt xoá; mở thư mục trả đúng đường của thư mục log.
  const after = await evaluate(`(async () => {
    const out = {};
    out.cleared = await desktop.call('clearDiagnostics');
    out.info = await desktop.call('diagnosticsInfo');
    out.folder = await desktop.call('openDiagnosticsFolder');
    try { out.last = (await desktop.call('exportDiagnostics')).path; } catch (error) { out.last = ''; }
    return out;
  })()`);
  check('clearDiagnostics trả {removed, bytes, folder} và xoá hết tệp log',
    Boolean(after.cleared) && Number(after.cleared.removed) >= 1 &&
    after.cleared.folder === exported.folder &&
    after.info && after.info.files === 1,
    JSON.stringify(after.cleared) + ' → info=' + JSON.stringify(after.info));
  // Thư mục xuất của cổng là riêng (`EDUGAME_DIAGNOSTICS_DIR`), không phải
  // Desktop: đếm tệp trong đó để chứng minh clear không chạm gói giáo viên.
  const kept = fs.readdirSync(dir).map(name => path.join(dir, name));
  check('gói vừa xuất vẫn còn sau khi xoá log (gói là của giáo viên)',
    fs.existsSync(exported.path) && kept.length >= 1 && Boolean(after.last) && fs.existsSync(after.last),
    exported.path + ' · thư mục cổng: ' + kept.length + ' tệp');
  check('openDiagnosticsFolder trả {ok, path} của thư mục log',
    Boolean(after.folder) && after.folder.ok === true &&
    after.folder.path === (summary.diagnosticsInfo && summary.diagnosticsInfo.folder),
    JSON.stringify(after.folder));
}

/**
 * Năm định dạng tài liệu + Huỷ, rồi kênh "theo đường dẫn" (kéo thả). Mỗi lượt
 * chọn đúng SỐ hộp thoại, còn đường dẫn do tiến trình cha đặt — y như bộ đếm của
 * cổng gói. Thứ tự `paths` phải khớp thứ tự `calls` ở phía Node: lệch một chỗ là
 * phép đo so nhầm định dạng.
 *
 * Lượt Huỷ dùng đường dẫn RỖNG: `pick` coi đường rỗng là Huỷ, không phải lỗi
 * đọc tệp. Kênh theo đường dẫn kiểm đuôi TRƯỚC đĩa, nên tệp bịa vẫn ra đúng câu
 * "chưa hỗ trợ" của `main.ts`.
 */
const filesRunner = (paths, foreign) => `(async () => {
  const out = {};
  const paths = ${JSON.stringify(paths)};
  const foreign = ${JSON.stringify(foreign)};
  const documentBytes = ${JSON.stringify(PATHS_SIZE_BYTES)};
  const illustrationBytes = ${JSON.stringify(ILLUSTRATION_BYTES)};
  const tauriImageOrigin = ${JSON.stringify(TAURI_IMAGE_ORIGIN)};
  const turn = async value => { await desktop.gate('setFilesGateTurn', value); };

  // 1) Năm định dạng: chữ đọc trong V8 nhúng, cùng chuỗi xử lý của Electron.
  // Bảng có 8 lượt, xen lẫn trường hợp lỗi: 0..4 là năm định dạng THẬT, 5 là
  // đường rỗng = Huỷ, 6 là PDF hỏng, 7 là đuôi .xls bị từ chối trước khi đọc.
  out.docs = [];
  for (let index = 0; index < paths.documents.length; index += 1) {
    // Kết quả trả TÊN TỆP (basename như Electron), không trả đường dẫn. Trong
    // template này mỗi dấu nháy ngược phải viết đôi: [\\\\/] sinh ra [\\/] khớp
    // cả \ của Windows lẫn / — viết hai dấu thì chỉ còn khớp / và tên không bao giờ tách.
    const expected = paths.documents[index].split(/[\\\\/]/).pop();
    const kind = index < 5 ? 'doc' : (index === 5 ? 'cancel' : 'refuse');
    await turn(index + 1);
    try {
      const doc = await desktop.call('importDocument');
      const text = doc && typeof doc.text === 'string' ? doc.text : '';
      // characters đếm chuỗi CHƯA trim (đúng main.ts), còn text đã che phần
      // đầu khoảng trắng — nên chỉ so phần chữ, không so độ dài hai bên.
      const ok = Boolean(doc) && kind === 'doc' && doc.name === expected &&
        !/^EG_/.test(text) &&
        Number(doc.characters) > 0 && text.length > 0 && text.trim().length > 0;
      out.docs.push({ kind, name: doc && doc.name, characters: doc && doc.characters,
        text: text.slice(0, 40), error: text.slice(0, 90), ok });
    } catch (error) {
      const message = String((error && error.message) || error);
      // Cùng câu lỗi, cùng mã ở đầu message như bản Electron.
      out.docs.push({ kind, name: expected, characters: 0, ok: kind === 'refuse' && /^EG_DOCUMENT/.test(message),
        error: message.slice(0, 90) });
    }
  }

  // 2) Huỷ hộp thoại: trả về null, không phải một tài liệu rỗng. Lượt 6 là lượt
  // đường rỗng của bảng tài liệu (lượt 8 là đuôi .xls).
  await turn(6);
  try {
    out.cancel = (await desktop.call('importDocument')) === null;
    out.cancelMsg = 'importDocument → null';
  } catch (error) {
    out.cancel = false;
    out.cancelMsg = 'Huỷ lại ném: ' + String((error && error.message) || error).slice(0, 80);
  }

  // 3) Kênh theo đường dẫn: tệp hợp lệ đi qua ĐỐI SỐ, không qua hộp thoại.
  try {
    const doc = await desktop.call('importDocumentFromPath', paths.documents[0]);
    // sizeBytes là cỡ TỆP trên đĩa; characters đếm chuỗi CHƯA trim còn text đã
    // trim, nên chỉ so "có chữ" — không so độ dài hai bên.
    out.byPath = Boolean(doc) && doc.name === paths.documents[0].split(/[\\\\/]/).pop() &&
      Number(doc.sizeBytes) === documentBytes &&
      Number(doc.characters) > 0 && String(doc.text).trim().length > 0;
    out.byPathMsg = 'name=' + (doc && doc.name) + ', sizeBytes=' + (doc && doc.sizeBytes) +
      ' (đĩa ' + documentBytes + '), characters=' + (doc && doc.characters);
  } catch (error) {
    out.byPath = false;
    out.byPathMsg = 'importDocumentFromPath lỗi: ' + String((error && error.message) || error).slice(0, 90);
  }

  // 4) Kênh theo đường dẫn với đuôi lạ: từ chối TRƯỚC đĩa, câu của main.ts.
  try {
    await desktop.call('importDocumentFromPath', foreign);
    out.foreign = false;
    out.foreignMsg = 'tệp .xls lại được nhận';
  } catch (error) {
    const message = String((error && error.message) || '');
    out.foreign = /Định dạng này chưa được hỗ trợ\\./.test(message) && /^EG_DOCUMENT/.test(message);
    out.foreignMsg = message.slice(0, 90);
  }
  // 5) Đường rỗng = Huỷ ở kênh theo đường dẫn, giống Electron.
  try {
    out.foreignEmpty = (await desktop.call('importDocumentFromPath', '')) === null;
  } catch (error) {
    out.foreignEmpty = false;
  }

  // 6) Bảng câu hỏi: ba định dạng, huỷ, rồi hai đường từ chối.
  out.sheets = [];
  for (let index = 0; index < paths.questions.length; index += 1) {
    const expected = paths.questions[index].split(/[\\\\/]/).pop();
    // Ba lượt đầu là ba định dạng THẬT; lượt 3 của bảng là tệp .xls (đuôi lạ),
    // lượt 4 là đường rỗng = Huỷ. Cùng thứ tự filePaths.questions bên Node.
    const kind = index < 3 ? 'sheet' : (index === 3 ? 'refuse' : 'cancel');
    // Ba khoá riêng: bảng câu hỏi KHÔNG đánh số theo lượt tài liệu.
    await turn(index + 1);
    try {
      const answer = await desktop.call('importQuestions');
      if (kind === 'sheet') {
        const questions = answer && Array.isArray(answer.questions) ? answer.questions : [];
        const ok = Boolean(answer) && answer.name === expected && questions.length > 0 &&
          typeof questions[0].prompt === 'string' && questions[0].prompt.length > 0;
        out.sheets.push({ kind, name: answer && answer.name, count: questions.length, ok,
          first: questions[0] && questions[0].prompt });
      } else if (kind === 'cancel') {
        out.sheets.push({ kind, ok: answer === null, got: JSON.stringify(answer) });
      } else {
        out.sheets.push({ kind, ok: false, got: 'TRẢ THÀNH CÔNG ' + JSON.stringify(answer).slice(0, 60) });
      }
    } catch (error) {
      const message = String((error && error.message) || '');
      out.sheets.push({ kind, ok: kind === 'refuse' && /Chỉ hỗ trợ tệp CSV, TSV hoặc XLSX\\./.test(message),
        error: message.slice(0, 90) });
    }
  }

  // 7) Ảnh: PNG thật được ghi vào images/, đọc lại qua giao thức edugame-file:,
  // rồi xoá. Đuôi lạ và tệp không phải ảnh bị từ chối mà không ghi gì.
  out.images = [];
  for (let index = 0; index < paths.illustrations.length; index += 1) {
    const kind = index === 0 ? 'png' : 'refuse';
    // Ảnh cũng có bộ khoá riêng: lượt 1..3 của EDUGAME_TAURI_FILES_ILLUSTRATION*.
    await turn(index + 1);
    try {
      const image = await desktop.call('importIllustration');
      if (kind === 'png') {
        out.image = image;
        out.images.push({ kind, ok: Boolean(image) && /^ci-[a-f0-9]{32}$/.test(String(image.id)) &&
          image.format === '.png' && Number(image.bytes) === illustrationBytes, got: image && image.id });
      } else {
        out.images.push({ kind, ok: false, got: 'TRẢ THÀNH CÔNG ' + JSON.stringify(image).slice(0, 60) });
      }
    } catch (error) {
      out.images.push({ kind, ok: kind === 'refuse', error: String((error && error.message) || error).slice(0, 90) });
    }
  }

  if (out.image && out.image.id) {
    // Đo ĐÚNG URL renderer dựng (stage với ảnh của giáo viên): trong WebView2,
    // scheme edugame-file: được wry trả trên host này — scheme tự đặt thì WebView2
    // không nạp được (ERR_UNKNOWN_URL_SCHEME). Host lấy từ module renderer dùng,
    // gán vào một biến ở tệp này trước.
    const url = tauriImageOrigin + '/img/' + encodeURIComponent(out.image.id);
    // Đo ĐÚNG đường renderer dùng: một thẻ <img>. Electron khai báo giao thức
    // edugame-file: với supportFetchAPI false, nên fetch không phải cửa
    // của sản phẩm — <img> mới là (và CSP img-src là thứ cho phép nó).
    const loadImage = src => new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve({ ok: true, width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => resolve({ ok: false });
      img.src = src;
    });
    const loaded = await loadImage(url);
    out.served = loaded.ok && loaded.width > 0 && loaded.height > 0;
    out.servedMsg = url + ' → <img> ' + (loaded.ok ? loaded.width + 'x' + loaded.height : 'không nạp');
    // Cùng ảnh, đúng địa chỉ Electron dùng: WebView2 không biết scheme này, nên đỏ
    // ở đây là DẤU HIỆU ĐÚNG — nó chứng minh vì sao renderer phải đổi host.
    out.realScheme = !(await loadImage('edugame-file://img/' + encodeURIComponent(out.image.id))).ok;
    // Id không do module này sinh ra không bao giờ được xoá (và không bao giờ được ghép đường dẫn).
    try {
      out.deleteForeign = JSON.stringify(await desktop.call('deleteIllustration', '../../edugame.sqlite')) === '{"ok":false}';
    } catch (error) {
      out.deleteForeign = false;
    }
    try {
      out.deleteOk = JSON.stringify(await desktop.call('deleteIllustration', out.image.id)) === '{"ok":true}';
    } catch (error) {
      out.deleteOk = false;
    }
    // Sau khi xoá, ảnh phải KHÔNG nạp được nữa. WebView2 giữ ảnh trong bộ nhớ
    // đệm nên cùng URL nguyên văn có thể trả ảnh cũ; thêm query (đường dẫn tệp
    // không đổi, handler chỉ đọc path) để buộc nó hỏi lại giao thức.
    out.servedAfterDelete = !(await loadImage(url + '?after-delete=' + Date.now())).ok;
  }

  // 8) Toàn màn hình: cửa sổ thật của tiến trình.
  try {
    const on = await desktop.call('setFullscreen', true);
    const off = await desktop.call('setFullscreen', false);
    out.fullscreen = on && on.ok === true && off && off.ok === true;
    out.fullscreenMsg = 'bật=' + JSON.stringify(on) + ', tắt=' + JSON.stringify(off);
  } catch (error) {
    out.fullscreen = false;
    out.fullscreenMsg = String((error && error.message) || error).slice(0, 90);
  }

  // 9) Chẩn đoán: xuất gói .txt ra thư mục cổng (script cha đã đặt
  // EDUGAME_DIAGNOSTICS_DIR), rồi đọc lại chính tệp đó ở phía Node. Gọi qua
  // ĐÚNG cửa renderer như nút "Xuất gói chẩn đoán" của trang Cài đặt.
  //
  // Thư mục dữ liệu của cổng là MỚI, nên trước khi xuất phải tạo một dòng log;
  // nếu không gói đầu tiên có 0 dòng và phép đo "gói mang log của lượt này" chỉ
  // may mắn xanh nhờ log còn sót từ lần chạy trước trên profile thật.
  try {
    await desktop.call('clearDiagnostics');
    out.diagnostics = await desktop.call('exportDiagnostics');
    out.diagnosticsInfo = await desktop.call('diagnosticsInfo');
  } catch (error) {
    out.diagnostics = null;
    out.diagnosticsError = String((error && error.message) || error).slice(0, 120);
  }
  return out;
})()`;

/** Kích thước tệp mẫu — đọc từ đĩa, không gõ lại số. */
function sizeOf(file) {
  try { return fs.statSync(file || '').size; } catch { return -1; }
}
// Đọc theo `filePaths` của TIẾN TRÌNH NÀY, không theo biến môi trường còn sót lại
// trong lúc dev: nếu đọc `process.env` trực tiếp thì cổng có thể so với một tệp
// mà app chưa từng mở.
const PATHS_SIZE_BYTES = sizeOf(filePaths.documents[0]);
const ILLUSTRATION_BYTES = sizeOf(filePaths.illustrations[0]);

/**
 * Pha hai (gói nhập): trò chơi nhập từ `.egame` còn trên đĩa với đúng id và câu
 * hỏi, rồi xoá được như mọi dòng khác.
 */
const reopenPackageRunner = memo => `(async () => {
  const out = {};
  const memo = ${JSON.stringify(memo)};
  const games = async () => (await desktop.call('getLibrary')).games;
  const found = (await games()).find(g => g.id === memo.importedId);
  out.ok = Boolean(found) && found.title === 'Gói qua cổng' &&
    Array.isArray(found.questions) && found.questions.length === 1 &&
    found.questions[0].explanation === 'Dừng trước vạch.';
  if (out.ok) {
    const before = (await games()).length;
    const removed = await desktop.call('deleteGames', [memo.importedId]);
    out.ok = removed.deleted === 1 && (await games()).length === before - 1;
    out.msg = 'id=' + memo.importedId + ', xoá=' + removed.deleted;
  } else {
    out.msg = 'không thấy trò chơi nhập ' + memo.importedId;
  }
  return out;
})()`;

/**
 * Lượt một: ghi qua ĐÚNG cửa renderer (`desktop.call` → adapter Tauri →
 * `invoke_channel`), rồi đọc lại để chốt id/createdAt mà lượt mở lại sẽ so.
 */
const saveRunner = (title) => `(async () => {
  const out = {};
  const title = ${JSON.stringify(title)};
  const before = await desktop.call('getLibrary');
  out.title = title;
  try {
    const game = await desktop.call('saveGame', ${JSON.stringify(scenario('__TITLE__')).replace('"__TITLE__"', 'title')});
    const after = await desktop.call('getLibrary');
    out.ok = Boolean(game && game.id && game.createdAt && game.updatedAt) &&
      after.games.length === before.games.length + 1 &&
      after.games.some(g => g.id === game.id);
    out.gameId = game && game.id;
    out.createdAt = game && game.createdAt;
    out.msg = 'id=' + (game && game.id) + ', games ' + before.games.length + '→' + after.games.length;
  } catch (error) {
    out.ok = false;
    out.msg = 'saveGame lỗi: ' + (error && error.code) + ': ' + (error && error.message);
  }
  return out;
})()`;

/**
 * Bản nháp dự án tối giản — đúng những trường `validateProjectForWrite` bắt,
 * cùng hình dạng fixture `draft()` của `library.rs`. `updatedAt` lùi dần theo
 * `rank` để pha hai đo được `ORDER BY updated_at DESC` (dòng mới sửa đứng đầu).
 */
function projectDraft(id, title, rank) {
  const stamp = `2026-01-0${rank}T00:00:00.000Z`;
  return {
    id,
    schemaVersion: 1,
    status: 'draft',
    step: 'input',
    title,
    description: '',
    tags: [],
    sourceName: '',
    lesson: null,
    analysisId: null,
    recommendationId: null,
    config: null,
    draft: null,
    gameSnapshot: null,
    gameId: null,
    createdAt: stamp,
    updatedAt: stamp,
  };
}

/**
 * Lượt một (dự án): ghi ba bản nháp qua `saveProjectDraft`, kiểm chúng đọc lại
 * được qua `getProject` + `listProjects`, rồi để lại id để pha hai so.
 */
const projectSaveRunner = (title) => `(async () => {
  const out = {};
  const title = ${JSON.stringify(title)};
  const drafts = ${JSON.stringify([
    projectDraft('eg-check-p1', '__T1__', 1),
    projectDraft('eg-check-p2', '__T2__', 2),
    projectDraft('eg-check-p3', '__T3__', 3),
  ])}.map((draft, index) => Object.assign(draft, {
    title: title + ' ' + (index + 1),
    updatedAt: '2026-01-0' + (index + 1) + 'T00:00:00.000Z',
    createdAt: '2026-01-0' + (index + 1) + 'T00:00:00.000Z',
  }));
  try {
    for (const draft of drafts) await desktop.call('saveProjectDraft', draft);
    const listed = await desktop.call('listProjects');
    const ids = listed.map(project => project.id).filter(id => id.indexOf('eg-check-p') === 0);
    const one = await desktop.call('getProject', 'eg-check-p2');
    out.ok = ids.length === 3 && ids[0] === 'eg-check-p3' &&
      Boolean(one && one.id === 'eg-check-p2' && one.status === 'draft' && one.step === 'input');
    out.ids = ids;
    out.createdAt = {};
    for (const draft of drafts) out.createdAt[draft.id] = draft.createdAt;
    out.msg = 'ids=' + ids.join(',') + ', get=' + (one && one.title);
  } catch (error) {
    out.ok = false;
    out.msg = 'saveProjectDraft lỗi: ' + (error && error.code) + ': ' + (error && error.message);
  }
  return out;
})()`;

/**
 * Lượt hai (dự án, tiến trình mới, cùng profile): thứ tự còn đúng; sửa giữ
 * id + createdAt và đẩy dòng lên đầu; lô `delete-many` trả
 * `{ok, deleted, missing}` đúng luật Electron (bỏ id trùng/rỗng, đếm thiếu) và
 * chặn lô rỗng / quá 200 bằng CHÍNH câu của Electron.
 */
const reopenProjectRunner = memo => `(async () => {
  const out = {};
  const memo = ${JSON.stringify(memo)};
  const list = () => desktop.call('listProjects');
  const mine = list => list.filter(project => project.id.indexOf('eg-check-p') === 0);

  try {
    const reopened = mine(await list());
    out.listOk = reopened.length === 3 &&
      reopened.map(project => project.id).join(',') === memo.ids.join(',') &&
      reopened.every(project => project.createdAt === memo.createdAt[project.id]);
    out.listMsg = 'ids=' + reopened.map(project => project.id).join(',') +
      ', createdAt=' + reopened.map(project => project.createdAt).join('|');
  } catch (error) {
    out.listOk = false;
    out.listMsg = 'listProjects lỗi: ' + error.message;
  }

  try {
    const old = await desktop.call('getProject', 'eg-check-p1');
    const edited = await desktop.call('saveProjectDraft', Object.assign({}, old, {
      title: old.title + ' (sửa)',
      updatedAt: '2026-02-01T00:00:00.000Z',
    }));
    const after = mine(await list());
    out.projectEditOk = edited.id === 'eg-check-p1' &&
      edited.createdAt === memo.createdAt['eg-check-p1'] &&
      after.length === 3 && after[0].id === 'eg-check-p1' &&
      after[0].title === old.title + ' (sửa)' &&
      after.filter(project => project.id === 'eg-check-p1').length === 1;
    out.projectEditMsg = 'createdAt=' + edited.createdAt + ', đầu=' + (after[0] && after[0].id) +
      ', tiêu đề=' + (after[0] && after[0].title);
  } catch (error) {
    out.projectEditOk = false;
    out.projectEditMsg = 'sửa dự án lỗi: ' + (error && error.code) + ': ' + error.message;
  }

  try {
    const single = await desktop.call('deleteProject', 'eg-check-p2');
    const gone = await desktop.call('getProject', 'eg-check-p2');
    const batch = await desktop.call('deleteProjects', ['eg-check-p1', 'eg-check-p1', '', 'không-có']);
    const left = mine(await list());
    const noop = await desktop.call('deleteProjects', ['eg-check-p3']);
    const emptyError = await desktop.call('deleteProjects', []).then(() => '', error => error.message);
    const tooMany = Array.from({ length: 201 }, (_, index) => 'eg-check-x' + index);
    const capError = await desktop.call('deleteProjects', tooMany).then(() => '', error => error.message);
    out.projectDeleteOk = single && single.ok === true &&
      gone === null &&
      batch && batch.ok === true && batch.deleted === 1 && batch.missing === 1 &&
      left.length === 1 && noop.deleted === 1 && noop.missing === 0 &&
      /Chưa chọn dự án nào để xoá/.test(emptyError) &&
      /tối đa 200 dự án/.test(capError);
    out.projectDeleteMsg = 'một=' + JSON.stringify(single) + ', lô=' + JSON.stringify(batch) +
      ', còn=' + left.length + ', cuối=' + JSON.stringify(noop) +
      ', rỗng="' + emptyError + '", trần="' + capError + '"';
  } catch (error) {
    out.projectDeleteOk = false;
    out.projectDeleteMsg = 'xoá dự án lỗi: ' + (error && error.code) + ': ' + error.message;
  }
  return out;
})()`;

/**
 * Lượt hai (tiến trình mới, cùng profile): dòng phải còn; sửa giữ id/createdAt;
 * xoá trả thư viện về số trò chơi trước khi lưu; lượt chơi lưu rồi xoá không
 * đụng trò chơi. `memo` do phía Node ghi xuống tệp sau lượt một (sessionStorage
 * không sống qua tiến trình mới).
 */
const reopenRunner = memo => `(async () => {
  const out = {};
  const memo = ${JSON.stringify(memo)};
  const games = async () => (await desktop.call('getLibrary')).games;

  const reopened = await games();
  const mine = reopened.find(g => g.id === memo.id);
  out.found = Boolean(mine);
  out.sameId = Boolean(mine && mine.id === memo.id);
  out.sameCreatedAt = Boolean(mine && mine.createdAt === memo.createdAt);
  out.msg = 'id=' + memo.id + ', thấy=' + out.found + ', createdAt=' + (mine && mine.createdAt);
  const samples = reopened.filter(g => g.id === 'sample-traffic-001').length;
  out.sampleTwice = samples > 1;
  out.sampleMsg = 'trò chơi mẫu: ' + samples;

  try {
    const edited = await desktop.call('saveGame', Object.assign({}, mine, { title: memo.title + ' (sửa)' }));
    const afterEdit = await games();
    out.editOk = edited.id === memo.id && edited.createdAt === memo.createdAt &&
      afterEdit.filter(g => g.id === memo.id).length === 1 &&
      afterEdit[0].id === memo.id && afterEdit[0].title === memo.title + ' (sửa)';
    out.editMsg = 'id=' + edited.id + ', đầu danh sách=' + (afterEdit[0] && afterEdit[0].title);
  } catch (error) {
    out.editOk = false;
    out.editMsg = 'sửa lỗi: ' + (error && error.code) + ': ' + (error && error.message);
  }

  try {
    await desktop.call('saveSession', { gameId: memo.id, score: 70, playerName: 'Bạn A' });
    const withSession = await desktop.call('getLibrary');
    const saved = withSession.sessions.find(s => s.gameId === memo.id);
    const removed = await desktop.call('deleteSessions', [saved && saved.id]);
    const final = await desktop.call('getLibrary');
    out.sessionOk = Boolean(saved && saved.id) && removed.deleted === 1 &&
      !final.sessions.some(s => s.id === saved.id) && final.games.some(g => g.id === memo.id);
    out.sessionMsg = 'phiên=' + (saved && saved.id) + ', xoá=' + (removed && removed.deleted) +
      ', trò chơi còn=' + final.games.length;
  } catch (error) {
    out.sessionOk = false;
    out.sessionMsg = 'phiên lỗi: ' + (error && error.code) + ': ' + (error && error.message);
  }

  try {
    const before = (await games()).length;
    const removed = await desktop.call('deleteGames', [memo.id]);
    const after = await games();
    out.deleteOk = removed.deleted === 1 && after.length === before - 1 && !after.some(g => g.id === memo.id);
    out.deleteMsg = 'trước=' + before + ', sau=' + after.length + ', xoá=' + removed.deleted;
  } catch (error) {
    out.deleteOk = false;
    out.deleteMsg = 'xoá lỗi: ' + (error && error.code) + ': ' + (error && error.message);
  }
  return out;
})()`;

/**
 * Chơi offline (#271): trò chơi ĐÃ LƯU (id do saveRunner ghi) được mở bằng đúng
 * đường người dùng — thư viện nạp lại từ vỏ, bấm "Chơi ngay" trên thẻ, chọn đáp
 * án đúng, bấm tiếp tới màn kết quả và đợi phiên TỰ LƯU xong. Trong suốt lượt
 * chơi, bốn cửa mạng (fetch/XHR/WebSocket/sendBeacon) bị bọc để ghi mọi URL ra
 * ngoài, cộng tài nguyên mới trong Performance API; đối chứng dương fetch một
 * URL .invalid để chứng minh bộ đếm không câm. Ba host nội bộ của vỏ
 * (tauri.localhost, ipc.localhost, edugame-file.tauri.localhost) không phải mạng:
 * hai host đầu là tài nguyên đóng gói/kênh lệnh, host thứ ba phục vụ ảnh TRÊN
 * ĐĨA của ứng dụng (bước 5/6 đã đo vòng đời ảnh đó).
 */
const offlinePlayRunner = (gameId) => `(async () => {
  const out = {};
  const gameId = ${JSON.stringify(gameId)};
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const waitFor = async (fn, timeoutMs) => {
    const end = Date.now() + (timeoutMs || 10000);
    while (Date.now() < end) { const value = fn(); if (value) return value; await sleep(100); }
    return null;
  };
  const isLocalHost = u => {
    const text = String(u || '');
    return ['http://tauri.localhost', 'http://ipc.localhost', 'http://edugame-file.tauri.localhost']
      .some(origin => text === origin || text.startsWith(origin + '/'));
  };
  const isRemote = u => /^(https?|wss?|ftp):/i.test(String(u || '')) && !isLocalHost(u);
  const attempts = [];
  const origFetch = window.fetch;
  const origOpen = XMLHttpRequest.prototype.open;
  const OrigWebSocket = window.WebSocket;
  const origBeacon = navigator.sendBeacon;
  window.fetch = function (input) {
    const u = typeof input === 'string' ? input : (input && input.url);
    if (isRemote(u)) attempts.push('fetch:' + u);
    return origFetch.apply(this, arguments);
  };
  XMLHttpRequest.prototype.open = function (method, u) {
    if (isRemote(u)) attempts.push('xhr:' + u);
    return origOpen.apply(this, arguments);
  };
  window.WebSocket = function (url, protocols) {
    if (isRemote(url)) attempts.push('ws:' + url);
    return protocols === undefined ? new OrigWebSocket(url) : new OrigWebSocket(url, protocols);
  };
  window.WebSocket.prototype = OrigWebSocket.prototype;
  navigator.sendBeacon = function (url, data) {
    if (isRemote(url)) attempts.push('beacon:' + url);
    return origBeacon.apply(this, arguments);
  };
  // Buffer mặc định 250 entry có thể tràn khi trang nạp ~200 tài nguyên; nới để
  // phần cắt theo mốc không mất entry mới.
  performance.setResourceTimingBufferSize(2000);
  const resourceBaseline = performance.getEntriesByType('resource').length;
  const control = 'https://example.invalid/edugame-offline-control';

  try {
    // Đối chứng dương phải đi qua ĐÚNG cửa đã bọc; cuộc gọi thật sẽ thất bại
    // (tên miền .invalid) nhưng bản ghi phải xuất hiện, nếu không "0 request"
    // chỉ là bộ đếm hỏng. Race với sleep để DNS đen không treo cổng.
    await Promise.race([window.fetch(control).catch(() => {}), sleep(3000)]);
    out.control = attempts.some(line => line.indexOf(control) >= 0);

    await refreshDb();
    navigate('library');
    const playBtn = await waitFor(() => document.querySelector('[data-library-item="' + gameId + '"] [data-action="play"]'));
    out.card = Boolean(playBtn);
    if (playBtn) playBtn.click();
    const option = await waitFor(() => document.querySelector('#playBody .game-stage[data-game="scenario"] .answer-option[data-answer="b"]'));
    out.stage = Boolean(option);
    // Minh hoạ của câu hỏi: SVG nội tuyến, không img/image nào trỏ ra ngoài.
    out.remoteArt = [...document.querySelectorAll('#playBody .game-stage img, #playBody .game-stage image')]
      .map(node => node.getAttribute('src') || node.getAttribute('href') || '')
      .filter(isRemote);
    out.svgCount = document.querySelectorAll('#playBody .game-stage svg.stage-illustration-svg').length;
    if (option) option.click();
    const next = await waitFor(() => {
      const btn = document.getElementById('nextQuestionBtn');
      return btn && !btn.classList.contains('hidden') ? btn : null;
    });
    out.answered = Boolean(next);
    if (next) next.click();
    const status = await waitFor(() => {
      const node = document.getElementById('resultSaveStatus');
      return node && /^✓ Đã tự lưu/.test(node.textContent) ? node : null;
    }, 15000);
    out.result = Boolean(document.querySelector('#playBody .result-screen'));
    out.saved = Boolean(status);
    out.sessionId = status ? String(status.dataset.sessionId || '') : '';
    out.played = out.card && out.stage && out.answered && out.result && out.saved;

    // Phiên phải đọc lại được từ vỏ (đĩa), đúng trò chơi và đúng điểm của một
    // quyết định đúng: 100/100, 1/1 (calculateScenarioSummary).
    const library = await desktop.call('getLibrary');
    const session = library.sessions.find(s => s.id === out.sessionId);
    out.session = session ? { id: session.id, gameId: session.gameId, points: session.points,
      max: session.max, percent: session.percent, correct: session.correct, total: session.total } : null;
    out.sessionOk = Boolean(session && session.gameId === gameId &&
      session.points === 100 && session.max === 100 && session.percent === 100 &&
      session.correct === 1 && session.total === 1);

    const close = document.getElementById('closeResultBtn');
    if (close) close.click();
    await sleep(300);
    out.closed = document.getElementById('modalRoot').children.length === 0;

    // Đối chứng dương cũng để lại một entry resource; loại nó khỏi cả hai nguồn
    // (attempts lẫn resource timing) để "0 request" chỉ đếm lượt chơi thật.
    const newResources = performance.getEntriesByType('resource').slice(resourceBaseline)
      .map(entry => entry.name).filter(u => isRemote(u) && u.indexOf(control) < 0);
    const real = attempts.filter(line => line.indexOf(control) < 0);
    out.networkOk = real.length === 0 && newResources.length === 0;
    out.networkMsg = 'ngoài=' + (real.concat(newResources).join(',') || '(không)');
    out.msg = 'thẻ=' + out.card + ', sân khấu=' + out.stage + ', trả lời=' + out.answered +
      ', kết quả=' + out.result + ', tự lưu=' + out.saved + ', phiên=' + out.sessionId;
  } finally {
    window.fetch = origFetch;
    XMLHttpRequest.prototype.open = origOpen;
    window.WebSocket = OrigWebSocket;
    navigator.sendBeacon = origBeacon;
  }
  return out;
})()`;

/**
 * Pha hai (lượt chơi offline): phiên của lượt chơi phải còn trên đĩa với đúng
 * trò chơi và điểm, rồi xoá được. Chạy TRƯỚC reopenRunner để phép đo phiên ở đó
 * không nhặt nhầm dòng này (nó tìm phiên theo gameId).
 */
const reopenPlayRunner = memo => `(async () => {
  const out = {};
  const memo = ${JSON.stringify(memo)};
  const library = await desktop.call('getLibrary');
  const session = library.sessions.find(s => s.id === memo.play.sessionId);
  out.found = Boolean(session);
  out.same = Boolean(session && session.gameId === memo.id &&
    session.points === memo.play.points && session.percent === memo.play.percent);
  out.deleted = false;
  if (session) {
    const removed = await desktop.call('deleteSessions', [session.id]);
    const after = await desktop.call('getLibrary');
    out.deleted = removed.deleted === 1 && !after.sessions.some(s => s.id === session.id);
  }
  out.ok = out.found && out.same && out.deleted;
  out.msg = 'phiên=' + memo.play.sessionId + ', thấy=' + out.found + ', khớp=' + out.same + ', xoá=' + out.deleted;
  return out;
})()`;
