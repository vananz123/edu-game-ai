#!/usr/bin/env node
/**
 * P4 (docs/ROADMAP.md) — đo chi phí thật của `db.prepare()` trước khi sửa 69 chỗ gọi nó.
 *
 * Kế hoạch cũ đoán "cache prepared statements" tiết kiệm được đáng kể. Đo mới có quyền kết
 * luận, nên script này không sửa source: nó dựng một Database thật (schema thật của
 * `LessonStore`, dữ liệu tổng hợp), chạy các đường đọc mà giáo viên thật sự kích hoạt, và
 * so sánh hai chế độ ngay trên cùng một hoạt động:
 *
 *   raw    — mỗi lần đọc lại `db.prepare(sql)` như code hiện tại (không cache).
 *   cached — `db.prepare(sql)` memo theo đúng chuỗi SQL. Đây **chính là** cải tiến P4,
 *            viết bằng 5 dòng trong benchmark, nên số before/after là của thao tác thật,
 *            không phải của một vòng lặp vô nghĩa.
 *
 * Chạy bằng ABI của Electron vì better-sqlite3 không tải được bằng Node thuần:
 *   node tests/manual/run-electron-node.js scripts/bench-db-prepare.js
 *   EDUGAME_BENCH_REPS=400 node tests/manual/run-electron-node.js scripts/bench-db-prepare.js
 *
 * Dữ liệu: chỉ giáo án/câu hỏi tự sinh ("Giáo án tổng hợp …"). Không dùng dữ liệu học sinh.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { LessonStore } = require(path.join(__dirname, '..', 'dist', 'src', 'services', 'storage', 'lesson-store.js'));

const ISO = '2026-01-01T00:00:00.000Z';
// `run-electron-node.js` chỉ truyền một tham số (tệp cần chạy), nên số lần lặp lấy từ biến
// môi trường chứ không từ argv.
const REPS = Math.max(5, Number(process.env.EDUGAME_BENCH_REPS) || 200);
const BATCHES = 7;

// P4 chỉ đáng đụng vào 69 site khi nó tiết kiệm được một khoản mà giáo viên cảm nhận được,
// hoặc tích luỹ thành phần trăm giây trên một nhịp poll chạy liên tục.
const THRESHOLD_OP_US = 2000;
const THRESHOLD_POLL_US = 200;
// Cả phiên làm việc mới là nơi một khoản nhỏ tích luỹ thành thứ giáo viên cảm nhận được.
const THRESHOLD_SESSION_US = 50000;

const SCALE = { documents: 12, chunksPerDoc: 40, chats: 6, turnsPerChat: 10, tasks: 60, recsPerAnalysis: 4 };

function hrUs(start) {
  return Number(process.hrtime.bigint() - start) / 1000;
}

function fmt(value, digits = 1) {
  return value.toFixed(digits);
}

function pad(text, width) {
  return `${text}${' '.repeat(Math.max(0, width - text.length))}`;
}

async function seed(db, store, lessonsDir) {
  const chunker = require(path.join(__dirname, '..', 'dist', 'src', 'services', 'lesson', 'lesson-chunker.js'));
  const docIds = [];
  for (let d = 0; d < SCALE.documents; d += 1) {
    const text = Array.from({ length: 120 }, (_, line) => `Mục ${line}: giáo án tổng hợp mô tả hoạt động dạy và học.`).join('\n');
    const document = await store.saveDocument({ name: `giao-an-${d}.txt`, ext: '.txt', text, sizeBytes: text.length, characters: text.length });
    docIds.push(document.id);
    const chunks = chunker.chunkLessonText(text, { maxChars: 400 }).slice(0, SCALE.chunksPerDoc);
    if (chunks.length) store.replaceChunks(document.id, chunks);
    const analysis = {
      id: `analysis-${d}`, schemaVersion: 1, documentId: document.id, sourceDocumentIds: [document.id],
      subject: 'Toán', grade: 5, topic: `Chủ đề ${d}`,
      objectives: [{ id: 'o1', description: 'Thực hiện phép tính.', cognitiveLevel: 'apply' }],
      keyConcepts: [{ id: 'k1', term: 'Phép cộng', explanation: 'Gộp hai số.' }],
      uncertainties: [], createdAt: ISO, updatedAt: ISO
    };
    store.saveAnalysis(analysis, { cacheKey: `ck-${d}` });
    store.saveRecommendations(analysis.id, Array.from({ length: SCALE.recsPerAnalysis }, (_, r) => ({
      id: `rec-${d}-${r}`, schemaVersion: 1, analysisId: analysis.id, gameType: 'arena',
      title: `Đấu trường ${r}`, description: 'Mô tả', reason: 'Phù hợp',
      learningObjectiveIds: ['o1'], suggestedDurationMinutes: 15, createdAt: ISO
    })));
    store.saveProject(projectFor(document.id, analysis.id, d));
  }

  const arenaDraft = {
    gameType: 'arena', schemaVersion: 1,
    questions: [{ id: 'q1', type: 'multiple-choice', prompt: '2 + 3 = ?', options: [{ id: 'a', text: '5' }, { id: 'b', text: '6' }], correctOptionId: 'a', explanation: 'Bằng 5.', difficulty: 'dễ', points: 100 }]
  };
  let lastChatId;
  for (let c = 0; c < SCALE.chats; c += 1) {
    let chatId;
    for (let t = 0; t < SCALE.turnsPerChat; t += 1) {
      const turn = store.appendChatTurn({
        chatId, documentIds: [docIds[c % docIds.length]],
        question: `Câu hỏi ${t} của cuộc trò chuyện ${c}`, answer: `Câu trả lời ${t}.`,
        intent: t === SCALE.turnsPerChat - 1 ? 'question_set' : 'answer',
        citations: [{ documentId: docIds[c % docIds.length], documentName: `giao-an-${c}.txt`, quote: 'Giáo án tổng hợp.' }],
        questionSet: t === SCALE.turnsPerChat - 1 ? arenaDraft : null,
        providerId: 'openai', errorCode: '',
        evidence: { characters: 1800, totalCharacters: 1800, quotes: 1, mode: 'whole', trimmed: false, fallback: false }
      });
      chatId = turn.id;
      lastChatId = turn.id;
    }
  }

  for (let k = 0; k < SCALE.tasks; k += 1) {
    store.saveAiTask({
      taskId: `task_${k}`, requestId: `req-${k}`, kind: k % 3 === 0 ? 'generate' : 'analyze',
      projectId: `project-${k}`, documentId: docIds[k % docIds.length], label: 'phân tích giáo án',
      state: k % 4 === 0 ? 'running' : 'completed', progress: k % 4 === 0 ? 'generate' : 'ready',
      resultSummary: '3 mục tiêu', startedAt: new Date(Date.UTC(2026, 0, 1 + (k % 28))).toISOString(),
      finishedAt: k % 4 === 0 ? undefined : ISO
    });
  }
  return { docIds, firstDoc: docIds[0], chatId: lastChatId };
}

function projectFor(documentId, analysisId, index) {
  const config = {
    gameType: 'arena', title: `Đấu trường ${index}`, subject: 'Toán', grade: 'Lớp 5', topic: 'Cộng',
    audience: 'child', durationMinutes: 15, difficulty: 'trung bình', playMode: 'individual',
    style: 'fun', focusObjectiveIds: [], generationMode: 'fast', questionCount: 3,
    scoringMode: 'basic', pointsPerCorrect: 100, timeBonus: 10
  };
  const draft = {
    gameType: 'arena', schemaVersion: 1,
    questions: [1, 2, 3].map(n => ({
      id: `q${n}`, type: 'multiple-choice', prompt: `${n} + 3 = ?`,
      options: [{ id: 'a', text: String(n + 3) }, { id: 'b', text: String(n + 4) }],
      correctOptionId: 'a', explanation: 'Đáp án A.', difficulty: 'dễ', points: 100
    }))
  };
  return {
    id: `project-${index}`, schemaVersion: 1, status: 'draft', step: 'configure',
    title: `Đấu trường ${index}`, description: 'Mô tả', tags: ['AI tạo'], sourceName: `giao-an-${index}.txt`,
    lesson: { documentId, name: `giao-an-${index}.txt`, characters: 1200 },
    analysisId, recommendationId: null, config, draft, gameSnapshot: null, gameId: null,
    createdAt: ISO, updatedAt: ISO
  };
}

async function main() {
  if (!fs.existsSync(path.join(__dirname, '..', 'dist', 'src', 'services', 'storage', 'lesson-store.js'))) {
    console.error('Thiếu dist/ — chạy `npm run build` trước.');
    process.exit(1);
  }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'edugame-p4-bench-'));
  const lessonsDir = path.join(root, 'lessons');
  fs.mkdirSync(lessonsDir, { recursive: true });

  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  // Hai bảng legacy mà `src/main.ts` vẫn prepare mỗi lượt lưu/thư viện — P4 tính cả chúng.
  db.exec(`
    CREATE TABLE games (id TEXT PRIMARY KEY, title TEXT, data_json TEXT);
    CREATE TABLE sessions (id TEXT PRIMARY KEY, data_json TEXT);
  `);
  const store = new LessonStore({ db, lessonsDir });
  store.ensureSchema();
  const seeded = await seed(db, store, lessonsDir);

  // --- Instrument: one seam, two modes ----------------------------------------------
  const original = db.prepare.bind(db);
  const cache = new Map();
  let mode = 'raw';
  let prepares = 0;
  let prepareUs = 0;
  let hits = 0;
  db.prepare = function (sql) {
    if (mode === 'cached' && cache.has(sql)) { hits += 1; return cache.get(sql); }
    const start = process.hrtime.bigint();
    const statement = original(sql);
    prepareUs += hrUs(start);
    prepares += 1;
    if (mode === 'cached') cache.set(sql, statement);
    return statement;
  };

  const ops = [
    ['nhịp poll ai-status: listAiTasks + countAiTasks', false, () => { store.listAiTasks(50, 0); store.countAiTasks(); }],
    ['mở trang Giáo án: listDocumentLibrary', true, () => store.listDocumentLibrary()],
    ['mở trang Dự án: listProjects', false, () => store.listProjects()],
    ['mở một dự án: getProject', false, () => store.getProject('project-3')],
    ['mở một giáo án: listAnalyses', false, () => store.listAnalyses(seeded.firstDoc)],
    ['bước đề xuất: listRecommendations', false, () => store.listRecommendations('analysis-3')],
    ['sidebar chat: listLessonChats', false, () => store.listLessonChats()],
    ['mở một cuộc trò chuyện: getLessonChat', false, () => store.getLessonChat(seeded.chatId)],
    ['retrieval lúc chat: countChunks + listChunks', false, () => { store.countChunks(seeded.firstDoc); store.listChunks(seeded.firstDoc); }],
    ['wizard tái sử dụng: getGenerationCache', false, () => store.getGenerationCache('ck-3')],
    // Chỗ duy nhất trong app prepare nằm TRONG vòng lặp: `deleteDocument` chạy một
    // DELETE recommendation cho mỗi phân tích của giáo án. Phép đo tạo hẳn một giáo án
    // có 2 phân tích rồi xoá, nên cả hai chế độ trả đúng cùng một công việc và hiệu số
    // chính xác là phần vòng lặp biên dịch lại.
    ['xoá giáo án (cascade, có prepare trong vòng lặp)', true, async () => {
      const doc = await store.saveDocument({ name: `scratch-${Date.now()}.txt`, ext: '.txt', text: 'Giáo án tự sinh để đo vòng lặp xoá.' });
      store.saveAnalysis({
        id: `scratch-a-${doc.id}`, schemaVersion: 1, documentId: doc.id, sourceDocumentIds: [doc.id],
        subject: 'Toán', grade: 5, topic: 'Đo', objectives: [{ id: 'o1', description: 'Mục tiêu.', cognitiveLevel: 'apply' }],
        keyConcepts: [], uncertainties: [], createdAt: ISO
      });
      store.saveAnalysis({
        id: `scratch-b-${doc.id}`, schemaVersion: 1, documentId: doc.id, sourceDocumentIds: [doc.id],
        subject: 'Toán', grade: 5, topic: 'Đo', objectives: [{ id: 'o1', description: 'Mục tiêu.', cognitiveLevel: 'apply' }],
        keyConcepts: [], uncertainties: [], createdAt: ISO
      });
      for (const analysisId of [`scratch-a-${doc.id}`, `scratch-b-${doc.id}`]) {
        store.saveRecommendations(analysisId, [{
          id: `rec-${analysisId}`, schemaVersion: 1, analysisId, gameType: 'arena', title: 'Đấu trường',
          description: 'Mô tả', reason: 'Phù hợp', learningObjectiveIds: ['o1'], suggestedDurationMinutes: 15, createdAt: ISO
        }]);
      }
      await store.deleteDocument(doc.id);
    }]
  ];

  async function measure(run, isAsync, measureMode) {
    mode = measureMode;
    if (measureMode === 'raw') cache.clear();
    for (let i = 0; i < 5; i += 1) await invoke(run, isAsync);
    let best = Infinity;
    let bestPrepares = 0;
    let bestPrepareUs = 0;
    for (let b = 0; b < BATCHES; b += 1) {
      prepares = 0; prepareUs = 0; hits = 0;
      const start = process.hrtime.bigint();
      for (let i = 0; i < REPS; i += 1) await invoke(run, isAsync);
      const totalUs = hrUs(start);
      if (totalUs < best) { best = totalUs; bestPrepares = prepares; bestPrepareUs = prepareUs; }
    }
    return { us: best / REPS, prepares: bestPrepares / REPS, prepareUs: bestPrepareUs / REPS, hits };
  }

  // A/B/A: hai lượt raw ôm một lượt cached. Nếu chỉ chạy raw rồi cached, mọi cơn trôi
  // nhiệt/nhiễu của máy trong 30 giây đó sẽ bị ghi thành "lợi thế" của chế độ chạy sau.
  const results = [];
  for (const [name, isAsync, run] of ops) {
    const first = await measure(run, isAsync, 'raw');
    const cached = await measure(run, isAsync, 'cached');
    const second = await measure(run, isAsync, 'raw');
    results.push({ name, raw: first.us <= second.us ? first : second, cached });
  }

  // --- Pure compile cost, independent of any operation ------------------------------
  const shapes = [
    ['SELECT 1 điểm (get)', 'SELECT * FROM ai_tasks WHERE task_id = ?'],
    ['SELECT có ORDER BY + LIMIT (all)', 'SELECT * FROM ai_tasks ORDER BY started_at DESC LIMIT ? OFFSET ?'],
    ['INSERT nhiều cột (named params)', `INSERT INTO games (id,title,data_json) VALUES (@id,@title,@data_json)`]
  ];
  const compile = shapes.map(([label, sql]) => {
    for (let i = 0; i < 200; i += 1) original(sql);
    const before = process.memoryUsage().rss;
    const start = process.hrtime.bigint();
    const loops = 2000;
    for (let i = 0; i < loops; i += 1) original(sql);
    const us = hrUs(start) / loops;
    return { label, us, rssGrowthMb: (process.memoryUsage().rss - before) / 1048576 };
  });

  console.log(`Quy mô DB: ${SCALE.documents} giáo án × ${SCALE.chunksPerDoc} đoạn, ${SCALE.chats} cuộc trò chuyện × ${SCALE.turnsPerChat} lượt, ${SCALE.tasks} tác vụ AI, ${SCALE.documents} dự án.`);
  console.log(`Mỗi đường đọc lặp ${REPS} lần một batch, lấy batch nhanh nhất; bố cục A/B/A (raw – cached – raw) để trôi nhiệt không thành "lợi thế" của chế độ chạy sau.\n`);

  console.log(pad('đường đọc', 52) + pad('raw µs', 10) + pad('cached µs', 11) + pad('prepare/lần', 13) + pad('trong prepare', 15) + pad('tiết kiệm µs', 14) + pad('% thao tác', 12) + '% prepare');
  console.log('-'.repeat(140));
  let bestOpSavingUs = 0;
  for (const { name, raw, cached } of results) {
    const savedUs = raw.us - cached.us;
    if (savedUs > bestOpSavingUs) bestOpSavingUs = savedUs;
    const pct = raw.us > 0 ? (savedUs / raw.us) * 100 : 0;
    const prepareShare = raw.us > 0 ? (raw.prepareUs / raw.us) * 100 : 0;
    console.log(
      pad(name, 52) +
      pad(fmt(raw.us, 1), 10) +
      pad(fmt(cached.us, 1), 11) +
      pad(fmt(raw.prepares, 1), 13) +
      pad(fmt(raw.prepareUs, 1), 15) +
      pad(fmt(savedUs, 1).padStart(9), 14) +
      pad(`${fmt(pct, 1)} %`, 12) +
      `${fmt(prepareShare, 1)} %`
    );
  }

  const pollSavingUs = results[0].raw.us - results[0].cached.us;
  console.log(`\nChi phí tự thân của db.prepare() (2000 lần biên dịch, không chạy câu hỏi):`);
  for (const c of compile) console.log(`  ${pad(c.label, 40)} ${fmt(c.us, 2)} µs/lần biên dịch   RSS +${fmt(c.rssGrowthMb, 1)} MB khi 2000 stmt chưa GC`);

  // Con số của chính vòng lặp đó, đo ở dòng cuối bảng trên (không suy từ số nhân).
  const cascade = results[results.length - 1];
  console.log(`\nVòng lặp duy nhất có prepare bên trong (lesson-store.ts:1198, xoá giáo án 2 phân tích):`);
  console.log(`  ${fmt(cascade.raw.prepares, 0)} lần db.prepare() cho một lượt xoá, ${fmt(cascade.raw.prepareUs, 1)} µs bên trong prepare, tiết kiệm ${fmt(cascade.raw.us - cascade.cached.us, 1)} µs.`);

  console.log(`\nMột phiên giáo viên thường (mở app → Giáo án → Dự án → mở 3 dự án → sidebar chat → 60 nhịp 10 s của thanh trạng thái):`);
  const perCall = index => results[index].raw.us - results[index].cached.us;
  const sessionSteps = [[1, 1], [2, 1], [3, 3], [6, 1], [0, 60]];
  const sessionPrepares = sessionSteps.reduce((sum, [i, times]) => sum + results[i].raw.prepares * times, 0);
  const sessionPrepareUs = sessionSteps.reduce((sum, [i, times]) => sum + results[i].raw.prepareUs * times, 0);
  const sessionRealSavedUs = sessionSteps.reduce((sum, [i, times]) => sum + perCall(i) * times, 0);
  console.log(`  ${fmt(sessionPrepares, 0)} lần db.prepare(); thời gian bên trong prepare ≈ ${fmt(sessionPrepareUs / 1000, 2)} ms.`);
  console.log(`  Tiết kiệm thật đo được trên cùng phiên (raw − cached, tính trên toàn thao tác): ${fmt(sessionRealSavedUs / 1000, 2)} ms.`);

  console.log(`\nNgưỡng quyết định (đặt trước khi đo): một thao tác tương tác phải tiết kiệm ≥ ${THRESHOLD_OP_US} µs, hoặc một nhịp thanh trạng thái ≥ ${THRESHOLD_POLL_US} µs, hoặc cả phiên ≥ ${THRESHOLD_SESSION_US} µs.`);
  console.log(`  Thao tác tiết kiệm nhất: ${fmt(bestOpSavingUs, 0)} µs.  Nhịp 10 s của thanh trạng thái: ${fmt(pollSavingUs, 0)} µs.  Cả phiên: ${fmt(sessionRealSavedUs, 0)} µs.`);
  const worth = bestOpSavingUs >= THRESHOLD_OP_US || pollSavingUs >= THRESHOLD_POLL_US || sessionRealSavedUs >= THRESHOLD_SESSION_US;
  console.log(`  Kết luận: ${worth
    ? 'Đáng cache prepared statements — làm P4.'
    : 'Không đáng — P4 tiết kiệm cỡ µs trên mỗi thao tác và cỡ µs trên cả phiên, trong khi 69 site đang đọc thẳng là chỗ dễ hiểu nhất của kho dữ liệu. BỎ P4.'}\n`);

  db.close();
  fs.rmSync(root, { recursive: true, force: true });
}

async function invoke(run, isAsync) {
  const value = run();
  if (isAsync) await value;
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
