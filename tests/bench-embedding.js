#!/usr/bin/env node
/**
 * Retrieval quality + latency benchmark (O4 of docs/update-AI-local.txt).
 *
 * Compares the lexical scorer (`lexical-v1`, no model) with the embedding
 * scorer (`embeddings-v1`, MiniLM via llama-server --embedding) on the same
 * Vietnamese lesson corpus and the same retrieval budget the app uses.
 *
 * Usage (server must already be listening):
 *   node tests/bench-embedding.js --url http://127.0.0.1:9341
 *
 * The corpus is synthetic (no student data). Each case names a target phrase
 * that exists in exactly one chunk; a scorer "hits" when that chunk is selected
 * and "top-1" when it is the highest ranked selected chunk (document order is
 * returned, so top-1 is measured with the scorer's own scores).
 */
const path = require('node:path');
const { chunkLessonText } = require(path.join(__dirname, '..', 'dist', 'src', 'services', 'lesson-chunker.js'));
const {
  selectChunks,
  selectChunksByVectors,
  buildRetrievalQuery,
  DEFAULT_MAX_SELECTED_CHUNKS,
  DEFAULT_MAX_SELECTED_CHARS
} = require(path.join(__dirname, '..', 'dist', 'src', 'services', 'lesson-retrieval.js'));

const args = process.argv.slice(2);
const flag = name => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const BASE_URL = flag('--url') || 'http://127.0.0.1:9341';
const BATCH_SIZE = Number(flag('--batch') || 8);
// Ranking budget for the benchmark: smaller than the app budget (6) so the
// measurement is about *which* chunk wins, not about the prompt fitting budget.
// Budget behaviour itself is covered by tests/lesson-retrieval.test.ts.
const BENCH_BUDGET = Number(flag('--budget') || 1);
// Chunking for the benchmark: the app default is 900/240, which packs two topics
// into one chunk on these short synthetic lessons and makes every scorer "right".
// 450/150 gives retrieval a real choice; the selection code is identical.
const CHUNK_OPTIONS = { maxChars: 450, minChars: 150 };

const LESSONS = {
  photosynthesis: {
    subject: 'Sinh học',
    text: [
      'Bài 21: Quang hợp ở thực vật',
      '',
      'I. Khái niệm quang hợp',
      '',
      'Quang hợp là quá trình tổng hợp chất hữu cơ từ nước và khí carbon dioxide dưới tác dụng của ánh sáng, nhờ sắc tố diệp lục trong lục lạp. Sản phẩm của quang hợp là chất hữu cơ và khí oxy.',
      '',
      'II. Vai trò của ánh sáng',
      '',
      'Ánh sáng là nguồn năng lượng duy nhất cho quang hợp. Cường độ ánh sáng quá yếu làm giảm hiệu suất quang hợp, còn ánh sáng quá mạnh có thể làm tổn thương bộ máy quang hợp.',
      '',
      'III. An toàn khi làm thí nghiệm',
      '',
      'Khi làm thí nghiệm với cây xanh, học sinh phải đeo kính bảo hộ và không ăn uống trong phòng thí nghiệm. Dụng cụ thủy tinh phải đặt xa mép bàn.'
    ].join('\n')
  },
  respiration: {
    subject: 'Sinh học',
    text: [
      'Bài 22: Hô hấp ở thực vật',
      '',
      'I. Khái niệm hô hấp',
      '',
      'Hô hấp là quá trình phân giải chất hữu cơ để giải phóng năng lượng cho hoạt động sống. Hô hấp diễn ra ở ti thể và không cần ánh sáng.',
      '',
      'II. Mối quan hệ với quang hợp',
      '',
      'Sản phẩm của quang hợp là nguyên liệu của hô hấp, và ngược lại khí carbon dioxide do hô hấp thải ra được dùng cho quang hợp.',
      '',
      'III. Ứng dụng trong bảo quản nông sản',
      '',
      'Muốn bảo quản nông sản lâu hơn, người ta giảm nhiệt độ và giảm nồng độ oxy để hạn chế hô hấp. Kho lạnh giúp rau củ tươi lâu và giảm hao hụt sau thu hoạch.'
    ].join('\n')
  },
  traffic: {
    subject: 'Giáo dục công dân',
    text: [
      'Bài 5: An toàn giao thông đường bộ',
      '',
      'I. Nguyên nhân tai nạn giao thông',
      '',
      'Tai nạn giao thông thường do chạy quá tốc độ, vượt đèn đỏ, uống rượu bia khi lái xe và không đội mũ bảo hiểm. Ùn tắc giao thông cũng làm tăng nguy cơ va chạm.',
      '',
      'II. Quy tắc dành cho người đi xe đạp',
      '',
      'Khi đi xe đạp đến trường, học sinh phải đội mũ bảo hiểm và đi đúng làn đường. Dàn hàng ba là hành vi nguy hiểm, dễ gây tai nạn giao thông.',
      '',
      'III. Văn hóa khi tham gia giao thông',
      '',
      'Người tham gia giao thông cần nhường đường cho người đi bộ, giúp đỡ người bị nạn và báo cho người lớn khi thấy tai nạn. Không xả rác ra đường.'
    ].join('\n')
  },
  waterCycle: {
    subject: 'Khoa học tự nhiên',
    text: [
      'Bài 12: Vòng tuần hoàn của nước trong tự nhiên',
      '',
      'I. Ba trạng thái của nước',
      '',
      'Nước tồn tại ở thể rắn, thể lỏng và thể khí. Nước đá tan thành nước lỏng ở 0 độ C, nước sôi và bay hơi ở 100 độ C dưới áp suất khí quyển.',
      '',
      'II. Sự bay hơi và ngưng tụ',
      '',
      'Ánh nắng mặt trời làm nước ở ao hồ bay hơi tạo thành hơi nước. Khi gặp lạnh, hơi nước ngưng tụ thành mây, rồi mưa rơi xuống bổ sung nước cho sông suối.',
      '',
      'III. Tiết kiệm nước',
      '',
      'Học sinh cần khóa vòi nước sau khi rửa tay, tận dụng nước mưa để tưới cây và nhắc bạn bè không lãng phí nước sạch.'
    ].join('\n')
  },
  fractions: {
    subject: 'Toán',
    text: [
      'Bài 9: Rút gọn phân số',
      '',
      'I. Tính chất cơ bản của phân số',
      '',
      'Nếu nhân cả tử số và mẫu số với cùng một số tự nhiên khác 0 thì giá trị phân số không đổi. Tính chất này là cơ sở để rút gọn và quy đồng phân số.',
      '',
      'II. Cách rút gọn phân số',
      '',
      'Muốn rút gọn một phân số, ta chia cả tử số và mẫu số cho ước chung lớn nhất của chúng. Ví dụ: mười hai phần mười tám rút gọn thành hai phần ba.',
      '',
      'III. So sánh phân số',
      '',
      'Để so sánh hai phân số khác mẫu, ta quy đồng mẫu số rồi so sánh tử số. Phân số nào có tử số lớn hơn thì phân số đó lớn hơn.'
    ].join('\n')
  }
};

const CASES = [
  { kind: 'literal', lesson: 'photosynthesis', query: 'Vai trò của ánh sáng trong quang hợp', target: 'Ánh sáng là nguồn năng lượng' },
  { kind: 'literal', lesson: 'photosynthesis', query: 'Sản phẩm của quang hợp là gì', target: 'Sản phẩm của quang hợp là chất hữu cơ' },
  { kind: 'literal', lesson: 'respiration', query: 'Hô hấp diễn ra ở đâu, có cần ánh sáng không', target: 'Hô hấp là quá trình phân giải' },
  { kind: 'literal', lesson: 'respiration', query: 'Bảo quản nông sản bằng kho lạnh', target: 'Muốn bảo quản nông sản lâu hơn' },
  { kind: 'literal', lesson: 'traffic', query: 'Học sinh đi xe đạp phải đội mũ bảo hiểm', target: 'Khi đi xe đạp đến trường' },
  { kind: 'literal', lesson: 'traffic', query: 'nguyên nhân gây tai nạn giao thông', target: 'Tai nạn giao thông thường do chạy quá tốc độ' },
  { kind: 'literal', lesson: 'waterCycle', query: 'hơi nước ngưng tụ thành mây và mưa', target: 'Ánh nắng mặt trời làm nước' },
  { kind: 'literal', lesson: 'waterCycle', query: 'làm thế nào để tiết kiệm nước sạch', target: 'Học sinh cần khóa vòi nước' },
  { kind: 'literal', lesson: 'fractions', query: 'cách rút gọn phân số', target: 'Muốn rút gọn một phân số' },
  { kind: 'literal', lesson: 'fractions', query: 'quy đồng mẫu số để so sánh phân số', target: 'Để so sánh hai phân số khác mẫu' },
  // Paraphrases: a teacher/analysis may phrase the objective without using the
  // lesson's own words. This is the case lexical scoring cannot handle.
  { kind: 'paraphrase', lesson: 'photosynthesis', query: 'lá cây hấp thụ năng lượng mặt trời để tạo ra chất dinh dưỡng', target: 'Quang hợp là quá trình tổng hợp' },
  { kind: 'paraphrase', lesson: 'photosynthesis', query: 'bộ phận nào giúp cây bắt được ánh nắng', target: 'nhờ sắc tố diệp lục trong lục lạp' },
  { kind: 'paraphrase', lesson: 'respiration', query: 'tế bào lấy năng lượng từ thức ăn mà không cần ánh sáng', target: 'Hô hấp là quá trình phân giải' },
  { kind: 'paraphrase', lesson: 'traffic', query: 'ba bạn cùng đi hàng ngang trên đường rất nguy hiểm', target: 'Dàn hàng ba là hành vi nguy hiểm' },
  { kind: 'paraphrase', lesson: 'waterCycle', query: 'nước bốc lên trời rồi rơi xuống thành mưa', target: 'Ánh nắng mặt trời làm nước' },
  { kind: 'paraphrase', lesson: 'fractions', query: 'chia cả trên và dưới cho cùng một số để được phân số đơn giản hơn', target: 'Muốn rút gọn một phân số' }
];

async function embed(texts) {
  const started = Date.now();
  const response = await fetch(`${BASE_URL}/v1/embeddings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'minilm', input: texts })
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const payload = await response.json();
  const vectors = payload.data.map(row => Float32Array.from(row.embedding));
  return { vectors, ms: Date.now() - started };
}

function rankOf(selection, targetChunk, scores) {
  if (!selection.selected.some(chunk => chunk.index === targetChunk.index)) return null;
  const scoreByIndex = new Map(selection.selected.map((chunk, position) => [chunk.index, scores[position]]));
  const ordered = selection.selected
    .map(chunk => ({ index: chunk.index, score: scoreByIndex.get(chunk.index) }))
    .sort((left, right) => right.score - left.score);
  return ordered.findIndex(entry => entry.index === targetChunk.index) + 1;
}

(async () => {
  const chunksByLesson = new Map();
  const allChunks = [];
  for (const [name, lesson] of Object.entries(LESSONS)) {
    const chunks = chunkLessonText(lesson.text, CHUNK_OPTIONS);
    chunksByLesson.set(name, chunks);
    chunks.forEach(chunk => allChunks.push({ lesson: name, chunk }));
  }

  // Embed every chunk once (same work the app caches in `lesson_chunks`).
  const vectorsByLesson = new Map();
  let embedMs = 0;
  let embedCalls = 0;
  for (const [name, chunks] of chunksByLesson) {
    const vectors = new Map();
    for (let index = 0; index < chunks.length; index += BATCH_SIZE) {
      const batch = chunks.slice(index, index + BATCH_SIZE);
      const { vectors: embedded, ms } = await embed(batch.map(chunk => `${chunk.heading ? `${chunk.heading}\n` : ''}${chunk.text}`));
      embedMs += ms;
      embedCalls += 1;
      batch.forEach((chunk, position) => vectors.set(chunk.index, embedded[position]));
    }
    vectorsByLesson.set(name, vectors);
  }

  const results = [];
  const stats = {
    literal: { total: 0, lexicalHits: 0, embeddingHits: 0, lexicalTop1: 0, embeddingTop1: 0 },
    paraphrase: { total: 0, lexicalHits: 0, embeddingHits: 0, lexicalTop1: 0, embeddingTop1: 0 }
  };
  let queryMs = 0;

  for (const testCase of CASES) {
    const chunks = chunksByLesson.get(testCase.lesson);
    const vectors = vectorsByLesson.get(testCase.lesson);
    const targetChunk = chunks.find(chunk => chunk.text.includes(testCase.target));
    if (!targetChunk) throw new Error(`target not found: ${testCase.target}`);
    const queryText = buildRetrievalQuery({
      analysis: { subject: LESSONS[testCase.lesson].subject, topic: testCase.query, objectives: [], keyConcepts: [] },
      config: null
    });
    const options = { maxChunks: BENCH_BUDGET, maxChars: DEFAULT_MAX_SELECTED_CHARS };

    const lexical = selectChunks(chunks, queryText, options);
    const embeddedQuery = await embed([queryText]);
    queryMs += embeddedQuery.ms;
    const vectorSelection = selectChunksByVectors(chunks, embeddedQuery.vectors[0], vectors, options);

    const bucket = stats[testCase.kind];
    bucket.total += 1;
    const lexicalRank = rankOf(lexical, targetChunk, lexical.scores);
    const vectorRank = rankOf(vectorSelection, targetChunk, vectorSelection.scores);
    if (lexicalRank) bucket.lexicalHits += 1;
    if (vectorRank) bucket.embeddingHits += 1;
    if (lexicalRank === 1) bucket.lexicalTop1 += 1;
    if (vectorRank === 1) bucket.embeddingTop1 += 1;
    results.push({
      kind: testCase.kind,
      case: testCase.query,
      lexical: lexicalRank || 'miss',
      embedding: vectorRank || 'miss',
      lexicalFallback: lexical.fallback,
      embeddingFallback: vectorSelection.fallback
    });
  }

  const percent = (value, total) => `${Math.round((value / Math.max(1, total)) * 100)}%`;
  console.log(
    `\nRetrieval benchmark — ${CASES.length} Vietnamese cases, budget ${BENCH_BUDGET} chunk(s) / ${DEFAULT_MAX_SELECTED_CHARS} chars\n`
  );
  for (const kind of ['literal', 'paraphrase']) {
    const rows = results.filter(row => row.kind === kind);
    console.log(`### ${kind} queries (${rows.length})\n`);
    console.log('| Case | lexical-v1 | embeddings-v1 |');
    console.log('| --- | --- | --- |');
    rows.forEach(row => console.log(`| ${row.case} | ${row.lexical} | ${row.embedding} |`));
    const bucket = stats[kind];
    console.log(
      `\nTop-1 accuracy: lexical ${percent(bucket.lexicalTop1, bucket.total)} · embeddings ${percent(bucket.embeddingTop1, bucket.total)}\n`
    );
  }
  console.log(`Corpus: ${allChunks.length} chunks; embedding ${embedCalls} batched request(s) in ${embedMs} ms (${Math.round(embedMs / allChunks.length)} ms/chunk at batch ${BATCH_SIZE})`);
  console.log(`Chunks per lesson: ${[...chunksByLesson].map(([name, chunks]) => `${name}=${chunks.length}`).join(', ')}`);
  console.log(`Query embedding: ${CASES.length} requests in ${queryMs} ms (${Math.round(queryMs / CASES.length)} ms/query)`);
})().catch(error => {
  console.error('bench-embedding failed:', error.message);
  process.exitCode = 1;
});
