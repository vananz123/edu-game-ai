/**
 * O6d measurement harness for the lesson preprocessor.
 *
 * Prints, for each synthetic fixture: original chars, cleaned chars, excerpt
 * chars, removed boilerplate lines, how many characters L3 *would* save, how
 * many JS milliseconds preprocessing costs, and the estimated model tokens
 * (same ~3.23 chars/token ratio used in docs/BENCHMARKS.md).
 *
 * Run: npm run build && node tests/manual/bench-preprocess.js
 * These are SYNTHETIC fixtures, not real lesson plans: they bound the
 * preprocessing cost and show which layers change the input, not the
 * end-to-end speed-up on a teacher's document.
 */
const path = require('node:path');
const {
  preprocessLessonSource,
  preprocessBudgetForMode,
  cleanLessonSource
} = require(path.join(__dirname, '..', '..', 'dist', 'src', 'services', 'lesson-preprocess.js'));

/** Measured on the pilot machine (docs/BENCHMARKS.md, Qwen3-4B Q4_K_M). */
const CHARS_PER_TOKEN = 3.23;

function tokens(chars) {
  return Math.round(chars / CHARS_PER_TOKEN);
}

function repeatedHeaderLesson(sections) {
  const blocks = [];
  for (let index = 1; index <= sections; index += 1) {
    blocks.push('Giáo án Tin học 8');
    blocks.push(`Hoạt động ${index}: Thực hành trên máy`);
    blocks.push(`Học sinh thực hiện bài tập số ${index} theo nhóm và ghi lại kết quả vào vở.`);
    blocks.push('');
  }
  return blocks.join('\n');
}

function tableLesson() {
  const rows = ['| Thời gian | Nhiệt độ | Ghi chú |', '| --- | --- | --- |'];
  for (let index = 1; index <= 40; index += 1) rows.push(`| ${index} phút | ${20 + index}°C | Mẫu ${index} |`);
  return [
    'Giáo án Khoa học 6',
    'Bài 12: Sự bay hơi và ngưng tụ',
    '',
    'Mục tiêu: Học sinh mô tả được quá trình bay hơi của nước.',
    '',
    rows.join('\n'),
    '',
    'Công thức: Q = m × c × Δt',
    '',
    'Câu hỏi: Khi nước sôi thì hiện tượng gì xảy ra?',
    'Đáp án: Nước chuyển thành hơi nước.',
    'Giải thích: Ở 100°C, áp suất hơi bão hoà bằng áp suất khí quyển.'
  ].join('\n');
}

function noisyPaste() {
  const body = [];
  for (let index = 1; index <= 60; index += 1) {
    body.push(`\t\tĐoạn ${index}:\u00A0học sinh   quan sát hiện tượng.\u0007`);
    body.push('');
    body.push('');
    body.push('');
  }
  return `\uFEFFNgày soạn: 12/09/2026\r\n${body.join('\r\n')}`;
}

function longMixedLesson() {
  const blocks = [
    'Giáo án Lịch sử 9',
    'Bài 16: Những hoạt động của Nguyễn Ái Quốc ở nước ngoài (1919-1925)',
    '',
    'Mục tiêu: Học sinh trình bày được các hoạt động chính của Nguyễn Ái Quốc.',
    '',
    'Hoạt động 1: Khởi động - giáo viên cho học sinh xem ảnh tư liệu và nêu nhận xét ban đầu về bối cảnh lịch sử, sau đó chia lớp thành bốn nhóm thảo luận.',
    '',
    'Hoạt động 2: Thảo luận nhóm - học sinh đọc sách giáo khoa, ghi lại ý kiến cá nhân, sau đó đại diện nhóm trình bày trước lớp về những khó khăn của dân tộc.',
    '',
    'Bảng tổng hợp:',
    '| Năm | Sự kiện | Ý nghĩa |',
    '| --- | --- | --- |',
    '| 1919 | Gửi bản yêu sách 8 điểm | Đòi quyền tự do cho dân tộc |',
    '| 1920 | Đọc Sơ thảo Luận cương | Tìm ra con đường giải phóng |',
    '| 1925 | Thành lập Hội Việt Nam cách mạng | Chuẩn bị lực lượng |',
    '',
    'Hoạt động 3: Luyện tập - học sinh làm bài tập trắc nghiệm và tự kiểm tra chéo kết quả trong nhóm, giáo viên quan sát và hỗ trợ những bạn còn lúng túng.',
    '',
    'Câu hỏi: Nguyễn Ái Quốc gửi bản yêu sách vào năm nào?',
    'Đáp án: Năm 1919.',
    'Giải thích: Bản yêu sách 8 điểm được gửi tới hội nghị Véc-xây.'
  ];
  // Long, low-value administrative prose that a real lesson plan carries a lot of.
  for (let index = 1; index <= 150; index += 1) {
    blocks.push('');
    blocks.push(`Ghi chú tổ chức lớp số ${index}: giáo viên chuẩn bị giáo cụ, sắp xếp chỗ ngồi cho học sinh, nhắc học sinh giữ trật tự và ghi bài đầy đủ trong giờ học.`);
  }
  return blocks.join('\n');
}

const fixtures = [
  { name: 'repeated-headers (60 sections)', text: repeatedHeaderLesson(60) },
  { name: 'long mixed lesson (23k chars)', text: longMixedLesson() },
  { name: 'table + formula (long)', text: tableLesson() },
  { name: 'noisy paste (control chars)', text: noisyPaste() },
  { name: 'short lesson (< budget)', text: 'Giáo án Ngữ văn 9\n\nMục tiêu: Đọc hiểu văn bản.\n\nCâu hỏi: Nhân vật chính là ai?' }
];

// The repo's own synthetic lesson corpus (`tests/fixtures/bench/lessons.json`,
// used by the O4 retrieval benchmark) — still synthetic, but already reviewed.
try {
  const corpus = require(path.join(__dirname, '..', 'fixtures', 'bench', 'lessons.json'));
  for (const lesson of Array.isArray(corpus) ? corpus : []) {
    if (typeof lesson?.text === 'string') fixtures.push({ name: `corpus: ${lesson.id}`, text: lesson.text });
  }
} catch (error) {
  process.stdout.write(`(corpus fixtures unavailable: ${error.message})\n`);
}

const WIDTH = 34;
const header = ['fixture', 'orig', 'clean', 'excerpt', 'dLines', 'L3save', 'ms', 'tokOld', 'tokNew'];
process.stdout.write(`${header.map(cell => cell.padEnd(WIDTH === 34 && cell.length < 10 ? 10 : 12)).join('')}\n`);

let totals = { old: 0, new: 0 };
for (const fixture of fixtures) {
  const budget = preprocessBudgetForMode('fast');
  const result = preprocessLessonSource(fixture.text, { maxChars: budget });
  // Before O6d the prompt received the first 8,000 + last ~3,900 characters of
  // the raw text (document-assist.getLocalDocumentAnalysisExcerpt).
  const previousChars = fixture.text.length <= budget ? fixture.text.length : budget;
  totals.old += tokens(previousChars);
  totals.new += tokens(result.metrics.excerptChars);
  const cells = [
    fixture.name,
    String(fixture.text.length),
    String(result.metrics.cleanedChars),
    String(result.metrics.excerptChars),
    String(result.metrics.removedRepeatedLines),
    String(result.metrics.rankingSavingsChars),
    String(result.metrics.ms),
    String(tokens(previousChars)),
    String(tokens(result.metrics.excerptChars))
  ];
  process.stdout.write(`${cells.map((cell, index) => cell.padEnd(index === 0 ? WIDTH : 10)).join('')}\n`);
}

process.stdout.write(`\nTOTAL estimated tokens: before=${totals.old} after=${totals.new}\n`);
const cleanOnly = cleanLessonSource(noisyPaste());
process.stdout.write(`noisy paste: ${noisyPaste().length} -> ${cleanOnly.text.length} chars after L1 only\n`);

// Preprocessing cost per call: it must stay far below one model round trip
// (~36 s prefill for the analysis prompt, docs/BENCHMARKS.md §O6).
const heavy = longMixedLesson();
const startedAt = process.hrtime.bigint();
const runs = 20;
for (let index = 0; index < runs; index += 1) preprocessLessonSource(heavy, { maxChars: 12_000 });
const perCallMs = Number(process.hrtime.bigint() - startedAt) / 1e6 / runs;
process.stdout.write(`preprocess cost: ${perCallMs.toFixed(2)} ms/call on ${heavy.length} chars\n`);
