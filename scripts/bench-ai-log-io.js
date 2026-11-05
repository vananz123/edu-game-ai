/**
 * P5 — đo I/O đồng bộ của log chẩn đoán trước khi async hoá.
 *
 * Kế hoạch hiệu năng (`docs/archive/specs/perf-optimization-plan.md`) đề nghị
 * chuyển **đọc** log (`readFileSync`) và **luân chuyển/ghi bundle**
 * (`writeFileSync` + `existsSync` + `statSync` + `unlinkSync`) sang async, vì mọi
 * thứ chạy trên main process. Bài học của P0/P3/P4: không sửa trước khi đo. Nên
 * harness này dựng **thư mục log thật** với kích cỡ thật (14 ngày, tệp hôm nay đầy
 * tới trần `maxFileBytes`), rồi đo thời gian chặn main process của từng thao tác.
 *
 * Harness gọi mọi thao tác qua `await Promise.resolve(...)` nên chạy được cả trên
 * bản **đồng bộ** (hiện tại) lẫn bản **async** (nếu số đo cho thấy nên sửa) —
 * không phải viết hai lần rồi so số của hai codebase khác nhau.
 *
 * Ngưỡng quyết định ĐẶT TRƯỚC KHI ĐO (µs):
 *   - `readRecent(200)` (bấm "Gói chẩn đoán" ở trang Cài đặt/Giới thiệu) ≥ 15.000 µs
 *   - `prune()` lúc khởi tạo writer, nằm trên đường mở app ≥ 5.000 µs — tính trên
 *     **median** của N lần dựng writer, ghép cặp N lần đường đồng bộ cũ ở cùng phiên
 *   - `writeDiagnosticBundle()` ≥ 15.000 µs
 * Dưới cả ba thì P5 chỉ là đổi signature + sửa caller + sửa test: BỎ.
 *
 * Chạy:  node tests/manual/run-electron-node.js scripts/bench-ai-log-io.js
 * Knob:  EDUGAME_BENCH_LOG_MB=<số>   kích cỡ tệp hôm nay, mặc định 2 (= trần maxFileBytes)
 *        EDUGAME_BENCH_LOG_DAYS=<n>   số ngày có mặt trên đĩa, mặc định 14 (trần retention)
 *        EDUGAME_BENCH_LOG_REPS=<n>   số lần lặp mỗi phép đo, mặc định 40
 *        EDUGAME_BENCH_BOOT_REPS=<n>  số lần dựng writer trên đĩa stale, mặc định 9
 *        EDUGAME_BENCH_SETTLE_MS=<n>  nghỉ trước khối boot, mặc định 3000
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createAiLogWriter, writeDiagnosticBundle, formatDiagnosticBundle } =
  require(path.join(__dirname, '..', 'dist', 'src', 'services', 'ai', 'ai-log.js'));

const LOG_MB = Math.max(1, Number(process.env.EDUGAME_BENCH_LOG_MB) || 2);
const DAYS = Math.min(31, Math.max(1, Number(process.env.EDUGAME_BENCH_LOG_DAYS) || 14));
const REPS = Math.max(5, Number(process.env.EDUGAME_BENCH_LOG_REPS) || 40);
// Dựng writer là một sự kiện duy nhất mỗi lần mở app, nhưng một mẫu thì không tách được
// công việc thật khỏi nhiễu OS/GC trong cùng cửa sổ đo — xem khối boot bên dưới.
const BOOT_REPS = Math.max(3, Number(process.env.EDUGAME_BENCH_BOOT_REPS) || 9);
// Nghỉ trước khối boot: vòng đo bundle ở trên vừa ghi hàng trăm tệp, anti-virus còn việc
// làm và mẫu đầu của khối boot ăn luôn phần đó (đã thấy 24 ms cho một cửa sổ chỉ còn
// mkdirSync). Mặc định 3 giây, chỉnh được bằng EDUGAME_BENCH_SETTLE_MS.
const SETTLE_MS = Math.max(0, Number(process.env.EDUGAME_BENCH_SETTLE_MS) || 3000);
const BATCHES = 5;
const READ_LIMIT = 200;

const THRESHOLD_READ_US = 15000;
const THRESHOLD_PRUNE_US = 5000;
const THRESHOLD_BUNDLE_US = 15000;

const DAY_MS = 24 * 60 * 60 * 1000;

function hrUs(start) {
  return Number(process.hrtime.bigint() - start) / 1000;
}

function fmt(value, digits = 1) {
  return value.toLocaleString('vi-VN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Một dòng log đúng hình dạng thật: time/level/event + data vài trường. */
function line(index, date) {
  return JSON.stringify({
    time: date.toISOString(),
    level: index % 37 === 0 ? 'warn' : 'info',
    event: 'local.runtime.report',
    data: { projectId: `p-${index % 40}`, documentId: `d-${index % 60}`, count: index % 97, durationMs: 120 + (index % 900), modelId: 'qwen2.5-3b-instruct-q4' }
  });
}

function dayName(date) {
  const p = (v) => String(v).padStart(2, '0');
  return `ai-${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}.jsonl`;
}

/** Dựng thư mục log giống máy giáo viên dùng lâu năm: DAYS tệp, tệp hôm nay ~LOG_MB MB. */
function seedLog(directory) {
  fs.mkdirSync(directory, { recursive: true });
  const now = Date.now();
  let totalBytes = 0;
  for (let day = DAYS - 1; day >= 0; day -= 1) {
    const date = new Date(now - day * DAY_MS);
    const bytes = day === 0 ? LOG_MB * 1024 * 1024 : Math.round(LOG_MB * 1024 * 1024 * 0.35);
    const chunks = [];
    let written = 0;
    let index = 0;
    while (written < bytes) {
      const text = `${line(index, date)}\n`;
      chunks.push(text);
      written += Buffer.byteLength(text);
      index += 1;
    }
    const body = chunks.join('');
    fs.writeFileSync(path.join(directory, dayName(date)), body, 'utf8');
    totalBytes += Buffer.byteLength(body);
  }
  return { files: DAYS, totalBytes };
}

/**
 * `DAYS` tệp log đã quá hạn dùng, seed **một lần rồi để yên**: prune() so mtime nên
 * phải lùi mốc thời gian bằng utimesSync, và unlink một tệp vừa ghi không giống
 * unlink tệp đã nằm im trên đĩa (flush + anti-virus đội chi phí lên con số của app).
 */
function seedStale(directory) {
  fs.mkdirSync(directory, { recursive: true });
  const old = new Date(Date.now() - 40 * DAY_MS);
  for (let i = 0; i < DAYS; i += 1) {
    // hậu tố 9 chữ số cho khớp LOG_FILE (`ai-YYYY-MM-DD-<9 số>.jsonl`) — sai dạng thì
    // prune() không coi đó là log và phép đo thành rỗng mà vẫn in ra con số.
    const name = `ai-${old.getFullYear()}-${String(old.getMonth() + 1).padStart(2, '0')}-${String(old.getDate()).padStart(2, '0')}-${String(i).padStart(9, '0')}.jsonl`;
    const file = path.join(directory, name);
    fs.writeFileSync(file, `${line(i, old)}\n${line(i + 1, old)}\n`, 'utf8');
    const when = old.getTime() / 1000;
    fs.utimesSync(file, when, when);
  }
  return directory;
}

async function measure(run, label) {
  for (let i = 0; i < 3; i += 1) await run();
  let best = Infinity;
  let lastCount = 0;
  for (let batch = 0; batch < BATCHES; batch += 1) {
    const times = [];
    for (let i = 0; i < REPS; i += 1) {
      const start = process.hrtime.bigint();
      lastCount = await run();
      times.push(hrUs(start));
    }
    times.sort((a, b) => a - b);
    const batchMin = times[0];
    if (batchMin < best) best = batchMin;
    void label;
  }
  return { us: best, count: lastCount };
}

/** min = giá thật của phép đo; median/max = điều giáo viên có thể gặp trên máy thật. */
function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  return { min: sorted[0], median: sorted[Math.floor(sorted.length / 2)], max: sorted[sorted.length - 1], samples: sorted };
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'edugame-bench-log-'));
  const dir = path.join(root, 'logs');
  const seed = seedLog(dir);
  const todayFile = path.join(dir, dayName(new Date()));
  console.log(`Thư mục log mô phỏng: ${seed.files} tệp, ${fmt(seed.totalBytes / 1024 / 1024, 2)} MB tổng,`);
  console.log(`  tệp hôm nay ${fmt(fs.statSync(todayFile).size / 1024, 0)} KB, ${fmt(REPS, 0)} lần/phép đo, ${BATCHES} batch, lấy batch nhanh nhất.\n`);

  // prune() thật sự có việc: log quá hạn dùng. Dựng **ngay từ đầu** rồi đo ở cuối,
  // vì unlink một tệp vừa ghi xong không giống unlink tệp đã nằm im trên đĩa — phép
  // đo cũ (seed xong xoá liền) đội chi phí flush/anti-virus vào con số của app.
  // 2N bản sao: N cho đường dựng writer, N cho đường đồng bộ tham chiếu (mỗi phép đo
  // cần một thư mục còn nguyên 14 tệp quá hạn, vì đo xong là sạch).
  const staleDirs = [];
  const syncDirs = [];
  for (let i = 0; i < BOOT_REPS; i += 1) {
    staleDirs.push(seedStale(path.join(root, `stale-new-${i}`)));
    syncDirs.push(seedStale(path.join(root, `stale-old-${i}`)));
  }

  const writer = createAiLogWriter({ directory: dir, retentionDays: 14, maxFileBytes: LOG_MB * 1024 * 1024 });

  console.log('Phép đo (µs, batch nhanh nhất):');
  const read = await measure(() => Promise.resolve(writer.readRecent(READ_LIMIT)).then((lines) => lines.length), 'readRecent');
  console.log(`  readRecent(${READ_LIMIT})            ${fmt(read.us, 1).padStart(10)} µs   → ${read.count} dòng`);

  // readRecent phải đọc cả tệp hôm nay để lấy 200 dòng gần nhất: đo đúng phần đó.
  const rawRead = await measure(() => Promise.resolve(fs.readFileSync(todayFile, 'utf8')).then((t) => t.length), 'rawRead');
  console.log(`  readFileSync( tệp hôm nay)         ${fmt(rawRead.us, 1).padStart(10)} µs   → ${fmt(fs.statSync(todayFile).size / 1024, 0)} KB, chưa tính split/filter`);

  const prune = await measure(() => Promise.resolve(writer.prune()).then(() => writer.files().length), 'prune');
  console.log(`  prune()                          ${fmt(prune.us, 1).padStart(10)} µs   → ${prune.count} tệp còn lại (không xoá gì vì log đang hạn dùng)`);

  const text = formatDiagnosticBundle({
    generatedAt: new Date().toISOString(), appVersion: '0.4.0', electronVersion: '33.4.11',
    platform: process.platform, arch: process.arch, cpuModel: 'Intel i5-10210U', logicalCpuCount: 8,
    totalRamBytes: 8 * 1024 * 1024 * 1024, models: [{ id: 'qwen2.5-3b-instruct-q4', displayName: 'Qwen2.5 3B', installed: true }],
    runtime: { installed: true, state: 'RUNNING', modelId: 'qwen2.5-3b-instruct-q4' },
    logDirectory: dir, retentionDays: 14
  }, writer.readRecent(READ_LIMIT));
  // Mỗi lần lặp ghi vào một thư mục riêng: nếu ghi cùng chỗ, vòng `while (existsSync)`
  // của chính writeDiagnosticBundle sẽ phồng lên theo số lần đo và đo nhầm vòng đó.
  let bundleSlot = 0;
  const bundle = await measure(() => {
    bundleSlot += 1;
    return Promise.resolve(writeDiagnosticBundle(path.join(root, 'export', String(bundleSlot)), text)).then((w) => w.bytes);
  }, 'bundle');
  console.log(`  writeDiagnosticBundle(${fmt(text.length / 1024, 0)} KB)  ${fmt(bundle.us, 1).padStart(10)} µs   → ${fmt(bundle.count / 1024, 0)} KB trên đĩa`);

  // prune() chạy ngay trong createAiLogWriter (đường mở app, main.ts:830) trên các tệp
  // đã nằm im từ đầu. Đây là thao tác một lần trong đời app, nên bản đầu của dụng cụ chỉ
  // đo một mẫu — và một mẫu đã nói dối theo cả hai hướng: có lần cửa sổ chỉ còn `mkdirSync`
  // in ra 24 ms. Lý do: cửa sổ là hrtime quanh một tick đồng bộ, nên GC và anti-virus rơi
  // vào đúng đó được. Nên đo **ghép cặp**: mỗi vòng i dựng writer trên `stale-new-i`, rồi
  // đo ngay đường cũ (mkdirSync + readdirSync + statSync/unlinkSync, tất cả đồng bộ) trên
  // `stale-old-i`. Hai số cùng chịu điều kiện môi trường tại cùng thời điểm, nhiễu không
  // lệch về một phía; đọc phân phối, không đọc mẫu lẻ.
  const isLog = (name) => /^ai-.*\.jsonl$/.test(name);
  const first = staleDirs[0];
  const scanned = fs.readdirSync(first).filter(isLog).length;
  // Tham chiếu tách giá thành: chỉ quét (readdirSync + statSync), không xoá — để thấy
  // phần nào của bản đồng bộ là stat và phần nào là unlink. Chạy trước construction.
  const scanStart = process.hrtime.bigint();
  for (const name of fs.readdirSync(first).filter(isLog)) fs.statSync(path.join(first, name));
  const scanUs = hrUs(scanStart);
  await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
  const coldSamples = [];
  const syncSamples = [];
  let pruneAsync = false;
  let remainingAll = 0;
  const cutoffFor = () => Date.now() - 14 * DAY_MS;
  for (let i = 0; i < staleDirs.length; i += 1) {
    const staleDir = staleDirs[i];
    const coldStart = process.hrtime.bigint();
    const staleWriter = createAiLogWriter({ directory: staleDir, retentionDays: 14 });
    coldSamples.push(hrUs(coldStart));
    // coldUs = thời gian **main process bị chặn** lúc mở app. await lượt prune() trả về
    // chỉ để chắc chắn việc dọn đã kết thúc trước khi đếm tệp còn lại (bản đồng bộ trả
    // undefined, Promise.resolve vô hại).
    const pruneReturn = staleWriter.prune();
    pruneAsync = Boolean(pruneReturn && typeof pruneReturn.then === 'function');
    await Promise.resolve(pruneReturn);
    remainingAll += fs.readdirSync(staleDir).filter(isLog).length;
    // Đường cũ, trên thư mục của riêng nó: đúng công việc đồng bộ mà prune() từng làm
    // ngay trên tick dựng writer (stat để so mtime, unlink cho tệp quá hạn).
    const oldDir = syncDirs[i];
    const syncStart = process.hrtime.bigint();
    fs.mkdirSync(oldDir, { recursive: true });
    for (const name of fs.readdirSync(oldDir).filter(isLog)) {
      const file = path.join(oldDir, name);
      try {
        if (fs.statSync(file).mtimeMs < cutoffFor()) fs.unlinkSync(file);
      } catch {
        // best-effort, giống hệt prune() trước #199
      }
    }
    syncSamples.push(hrUs(syncStart));
  }
  const cold = stats(coldSamples);
  const old = stats(syncSamples);
  const staleTotal = scanned * staleDirs.length * 2;
  const list = (s) => s.samples.map((v) => fmt(v, 0)).join(' / ');
  console.log(`  chỉ quét ${scanned} tệp quá hạn (readdirSync + statSync, không xoá):  ${fmt(scanUs, 1).padStart(9)} µs`);
  console.log(`  đường cũ: mkdirSync + statSync + unlinkSync đồng bộ (${staleDirs.length} mẫu):  ${fmt(old.median, 1).padStart(9)} µs median`);
  console.log(`      min ${fmt(old.min, 1)} · max ${fmt(old.max, 1)} · ${list(old)}`);
  console.log(`  bản đang nạp: main process bị chặn lúc dựng writer (${staleDirs.length} mẫu):  ${fmt(cold.median, 1).padStart(9)} µs median`);
  console.log(`      min ${fmt(cold.min, 1)} · max ${fmt(cold.max, 1)} · ${list(cold)}`);
  console.log(`     (prune() ${pruneAsync ? 'async' : 'đỒNG BỘ'} · đĩa còn ${remainingAll}/${staleTotal} tệp **sau khi await** lượt dọn · tiết kiệm median ${fmt(old.median - cold.median, 1)} µs)`);

  const readOver = read.us >= THRESHOLD_READ_US;
  const bundleOver = bundle.us >= THRESHOLD_BUNDLE_US;
  const pruneOver = cold.median >= THRESHOLD_PRUNE_US;
  const oldOver = old.median >= THRESHOLD_PRUNE_US;
  console.log(`Ngưỡng đặt trước khi đo: readRecent ≥ ${THRESHOLD_READ_US} µs, prune lúc mở app ≥ ${THRESHOLD_PRUNE_US} µs, bundle ≥ ${THRESHOLD_BUNDLE_US} µs.`);
  console.log(`  readRecent ${fmt(read.us, 1)} µs ${readOver ? 'VƯỢT' : 'dưới'} · bundle ${fmt(bundle.us, 1)} µs ${bundleOver ? 'VƯỢT' : 'dưới'} · chặn lúc mở app (median) ${fmt(cold.median, 1)} µs ${pruneOver ? 'VƯỢT' : 'dưới'}; đường cũ cùng máy ${fmt(old.median, 1)} µs ${oldOver ? 'VƯỢT' : 'dưới'} (bản ${pruneAsync ? 'async' : 'đồng bộ'}).`);
  const problems = [];
  if (readOver) problems.push(`readRecent ${fmt(read.us, 0)} µs chặn main process cho một cú nhấp — đáng async hoá (kèm sửa caller + test).`);
  if (bundleOver) problems.push(`writeDiagnosticBundle ${fmt(bundle.us, 0)} µs — đáng async hoá.`);
  if (pruneOver) problems.push(`prune lúc mở app median ${fmt(cold.median, 0)} µs ${pruneAsync ? 'VẪN chặn dù đã async — còn việc đồng bộ nào đó trong construction (mkdirSync?).' : '— async hoá prune là đáng.'}`);
  console.log(`  Kết luận: ${problems.length
    ? `Đáng làm P5:\n  - ${problems.join('\n  - ')}\n`
    : `Không ngưỡng nào bị vượt nữa — prune đã chạy nền (đường chặn còn ${fmt(cold.min, 1)} µs min / ${fmt(cold.median, 1)} µs median trên ${staleDirs.length} mẫu, chủ yếu mkdirSync + dựng lời hứa; max ${fmt(cold.max, 1)} µs), trong khi **cùng máy, cùng phiên** đường cũ ${pruneAsync ? `đồng bộ mất ${fmt(old.median, 1)} µs median (tiết kiệm ${fmt(old.median - cold.median, 1)} µs) và bản thân nó cũng có max ${fmt(old.max, 1)} µs — nên max cao bất thường là nhiễu môi trường, không phải tín hiệu của việc sửa` : '(bản này chính là đường cũ)'}; còn readRecent ${fmt(read.us, 1)} µs và bundle ${fmt(bundle.us, 1)} µs thì **giữ đồng bộ**: đổi signature hai chỗ đó chỉ kéo theo sửa caller + sửa test mà không nhả thêm ms nào cho giáo viên.\n`}`);

  fs.rmSync(root, { recursive: true, force: true });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
