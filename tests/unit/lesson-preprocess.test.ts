/**
 * O6d tests: the offline preprocessor must shrink the analysis input WITHOUT
 * losing anything a teacher would grade against — tables, numerals, formulas,
 * examples, scenarios, questions, answers, explanations — and its version must
 * participate in the analysis cache key.
 */
import assert from 'node:assert/strict';
import {
  LESSON_PREPROCESS_BUDGET_DEEP,
  LESSON_PREPROCESS_BUDGET_FAST,
  LESSON_PREPROCESS_RANKING_ENABLED,
  LESSON_PREPROCESS_VERSION,
  blockValue,
  buildHeadTailExcerpt,
  cleanLessonSource,
  cutAtBoundary,
  isProtectedLine,
  preprocessBudgetForMode,
  preprocessLessonSource,
  rankBlocksForExcerpt
} from '../../src/services/lesson-preprocess';
import { buildAnalysisCacheKey, sha256Hex } from '../../src/services/lesson-cache';
import { prepareLessonExcerpt, buildLessonAnalysisPrompt } from '../../src/services/lesson-prompts';

const TABLE = [
  '| Thời gian | Nhiệt độ | Ghi chú |',
  '| --- | --- | --- |',
  '| 0 phút | 20°C | Bắt đầu |',
  '| 5 phút | 45°C | Sôi nhẹ |'
].join('\n');

const LESSON = [
  'Giáo án Khoa học 6',
  'Bài 12: Sự bay hơi và ngưng tụ',
  '',
  'Mục tiêu: Học sinh mô tả được quá trình bay hơi và ngưng tụ của nước.',
  '',
  'Thí nghiệm: đun nước trong cốc thuỷ tinh, quan sát hơi nước.',
  '',
  TABLE,
  '',
  'Công thức: Q = m × c × Δt',
  '',
  'Ví dụ: 100 g nước bay hơi ở 100°C cần 226 kJ.',
  '',
  'Câu hỏi: Khi nước sôi thì hiện tượng gì xảy ra?',
  'Đáp án: Nước chuyển thành hơi nước.',
  'Giải thích: Ở 100°C, áp suất hơi bão hoà bằng áp suất khí quyển.',
  '',
  'Giáo án Khoa học 6',
  'Giáo án Khoa học 6'
].join('\n');

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function run(): void {
  // --- L1: normalisation ----------------------------------------------------
  const dirty = 'Giáo \tán\r\n\r\n\r\n  Khoa học\u00A0lớp 6\u0000\u0007\uFEFF';
  const cleaned = cleanLessonSource(dirty);
  assert.equal(cleaned.text, 'Giáo án\n\nKhoa học lớp 6');
  assert.equal(cleaned.removedControl, 3, 'NUL + BEL + BOM counted');
  assert.equal(cleaned.removedBlankRuns, 1, 'CRLF run collapsed');
  assert.ok(!/[\u0000\u0007\uFEFF\u00A0\r\t]/.test(cleaned.text), 'no control/NBSP/CR/TAB left');

  // NFC is requested, diacritics are never stripped.
  const decomposed = 'Khoa\u0323 ho\u0323c';
  assert.equal(cleanLessonSource(decomposed).text, 'Khoa\u0323 ho\u0323c'.normalize('NFC'));
  assert.ok(cleanLessonSource('Giáo án').text.includes('á'));

  // Idempotent: cleaning clean text changes nothing.
  const once = cleanLessonSource(LESSON).text;
  assert.equal(cleanLessonSource(once).text, once);

  // --- L1: repeated header/footer removal -----------------------------------
  const repeated = cleanLessonSource(LESSON);
  assert.equal(repeated.removedRepeatedLines, 2, 'kept the first header, dropped 2 repeats');
  assert.equal(occurrences(repeated.text, 'Giáo án Khoa học 6'), 1);

  const structural = cleanLessonSource(['Hoạt động 2', 'Nội dung A.', '', 'Hoạt động 2', 'Nội dung B.', '', 'Hoạt động 2', 'Nội dung C.'].join('\n'));
  assert.equal(structural.removedRepeatedLines, 0, 'section headings are never removed');
  assert.equal(occurrences(structural.text, 'Hoạt động 2'), 3);

  // Protected lines: tables, questions, formulas, numbers, answers.
  assert.ok(isProtectedLine('| 0 phút | 20°C |'));
  assert.ok(isProtectedLine('Khi nước sôi thì hiện tượng gì xảy ra?'));
  assert.ok(isProtectedLine('Q = m × c × Δt'));
  assert.ok(isProtectedLine('Đáp án: Nước chuyển thành hơi nước.'));
  assert.ok(isProtectedLine('Nhiệt độ sôi là 100°C'));
  assert.ok(isProtectedLine('1. Mở nắp cốc'));
  assert.ok(!isProtectedLine('Giáo án Khoa học 6'));

  // --- L1 on real 2-column PDFs (docs/BENCHMARKS.md §O6e) --------------------
  // A 2-column PDF repeats every table cell and splits bullets from their text.
  // Version 1 deleted all of it; these are the regression cases.
  const twoColumn = cleanLessonSource([
    'BƯỚC MỤC TIÊU CÁCH TIẾN HÀNH THỜI GIAN',
    'Trò chơi:',
    'Khám phá',
    'kiến thức',
    'mới',
    'BƯỚC MỤC TIÊU CÁCH TIẾN HÀNH THỜI GIAN',
    'Trò chơi:',
    'Khám phá',
    'kiến thức',
    'mới',
    'BƯỚC MỤC TIÊU CÁCH TIẾN HÀNH THỜI GIAN',
    'Trò chơi:',
    'Khám phá',
    'kiến thức',
    'mới'
  ].join('\n'));
  assert.equal(occurrences(twoColumn.text, 'BƯỚC MỤC TIÊU CÁCH TIẾN HÀNH THỜI GIAN'), 1, 'repeated uppercase table header is boilerplate');
  assert.equal(occurrences(twoColumn.text, 'kiến thức'), 3, 'lowercase cell fragments are content, never dropped');
  assert.equal(occurrences(twoColumn.text, 'mới'), 3);
  assert.equal(twoColumn.removedRepeatedLines, 2);

  // A dash alone on a line is a bullet split from its text: re-join, don't delete.
  const splitBullet = cleanLessonSource(['gồm:', '-', 'Thời gian 20 giây', '–', 'Nhóm thắng cuộc', '-', 'Thời gian 20 giây'].join('\n'));
  assert.equal(splitBullet.text, ['gồm:', '-Thời gian 20 giây', '–Nhóm thắng cuộc', '-Thời gian 20 giây'].join('\n'));

  // Repeated short content fragments inside a lesson plan must survive.
  const repeatedContent = cleanLessonSource([
    '- Nhận biết được các bước phản biện hiệu quả.',
    'A',
    '- Nhận biết được các bước phản biện hiệu quả.',
    'B',
    '- Nhận biết được các bước phản biện hiệu quả.'
  ].join('\n'));
  assert.equal(occurrences(repeatedContent.text, 'các bước phản biện hiệu quả'), 3, 'content sentences are never boilerplate');

  // Page-header shapes stay removable, including per-page footers.
  const pageHeaders = cleanLessonSource([
    'TÀI LIỆU CHƯƠNG TRÌNH GIÁO DỤC KỸ NĂNG SỐNG THCS',
    'Nội dung một.',
    '12',
    'TÀI LIỆU CHƯƠNG TRÌNH GIÁO DỤC KỸ NĂNG SỐNG THCS',
    'Nội dung hai.',
    '12',
    'TÀI LIỆU CHƯƠNG TRÌNH GIÁO DỤC KỸ NĂNG SỐNG THCS',
    'Nội dung ba.',
    '12'
  ].join('\n'));
  assert.equal(occurrences(pageHeaders.text, 'TÀI LIỆU CHƯƠNG TRÌNH GIÁO DỤC KỸ NĂNG SỐNG THCS'), 1);
  assert.equal(occurrences(pageHeaders.text, 'Nội dung ba.'), 1, 'body text untouched');

  // --- L2: boundaries -------------------------------------------------------
  const longLine = 'x'.repeat(400);
  const cut = cutAtBoundary(`${longLine}\n${longLine}\n${longLine}`, 500);
  assert.ok(cut.cut);
  assert.ok(cut.text.length <= 500);
  assert.ok(!cut.text.endsWith('x ') && cut.text.split('\n').every(line => line === longLine || line === ''), 'cut on a line boundary');

  const fits = cutAtBoundary('short text', 1_000);
  assert.equal(fits.text, 'short text');
  assert.equal(fits.cut, false);

  const headTail = buildHeadTailExcerpt(`${'a'.repeat(500)}\n${'b'.repeat(5_000)}\n${'c'.repeat(500)}`, 1_200);
  assert.ok(headTail.cut);
  assert.ok(headTail.text.length <= 1_200, `head-tail within budget (${headTail.text.length})`);
  assert.ok(headTail.text.includes('lược bớt phần giữa'), 'old marker wording preserved');

  // --- L3: block ranking ----------------------------------------------------
  assert.equal(blockValue(TABLE), Number.POSITIVE_INFINITY, 'table is protected');
  assert.equal(blockValue('Q = m × c × Δt'), Number.POSITIVE_INFINITY, 'formula is protected');
  assert.equal(blockValue('Khi nước sôi thì hiện tượng gì xảy ra?'), Number.POSITIVE_INFINITY, 'question is protected');
  assert.equal(blockValue('Đáp án: Nước chuyển thành hơi nước.'), Number.POSITIVE_INFINITY, 'answer is protected');
  assert.ok(Number.isFinite(blockValue('Học sinh thảo luận theo nhóm đôi trong lớp về bài học hôm nay và ghi lại ý kiến.')));

  const ranked = rankBlocksForExcerpt(LESSON, 260);
  assert.ok(ranked.length <= 260 + 200, `ranked respects budget (${ranked.length})`);
  assert.ok(!ranked.includes('Học sinh thảo luận'), 'low-value prose dropped');
  assert.ok(ranked.includes('| Thời gian'), 'table kept');

  // --- Pipeline -------------------------------------------------------------
  assert.equal(LESSON_PREPROCESS_RANKING_ENABLED, false, 'L3 must stay off until the O6 gate passes');
  assert.equal(preprocessBudgetForMode('fast'), LESSON_PREPROCESS_BUDGET_FAST);
  assert.equal(preprocessBudgetForMode('deep'), LESSON_PREPROCESS_BUDGET_DEEP);
  assert.equal(preprocessBudgetForMode(undefined), LESSON_PREPROCESS_BUDGET_FAST);

  const small = preprocessLessonSource(LESSON);
  assert.equal(small.metrics.version, LESSON_PREPROCESS_VERSION);
  assert.equal(small.metrics.excerptReason, 'fits');
  assert.equal(small.metrics.truncated, false);
  assert.equal(small.metrics.removedRepeatedLines, 2);
  assert.ok(small.metrics.ms >= 0);
  for (const fragment of [
    '| 0 phút | 20°C | Bắt đầu |',
    'Q = m × c × Δt',
    '100°C cần 226 kJ',
    'Khi nước sôi thì hiện tượng gì xảy ra?',
    'Đáp án: Nước chuyển thành hơi nước.',
    'Giải thích: Ở 100°C'
  ]) {
    assert.ok(small.text.includes(fragment), `preserved: ${fragment}`);
  }
  assert.equal(preprocessLessonSource(small.text).text, small.text, 'idempotent');

  // A larger budget must never produce a shorter excerpt (found while running
  // the real PDFs: passing `{ mode: 'deep' }` silently fell back to the fast
  // budget because `maxChars` was NaN).
  const longDoc = Array.from({ length: 400 }, (_, index) => `Dòng nội dung số ${index} của giáo án minh hoạ.`).join('\n');
  const fastExcerpt = preprocessLessonSource(longDoc, { maxChars: LESSON_PREPROCESS_BUDGET_FAST });
  const deepExcerpt = preprocessLessonSource(longDoc, { maxChars: LESSON_PREPROCESS_BUDGET_DEEP });
  assert.ok(fastExcerpt.metrics.excerptChars <= LESSON_PREPROCESS_BUDGET_FAST);
  assert.ok(deepExcerpt.metrics.excerptChars > fastExcerpt.metrics.excerptChars, 'deep budget keeps strictly more');
  const wrongOption = preprocessLessonSource(longDoc, { mode: 'deep' } as unknown as { maxChars?: number });
  assert.equal(wrongOption.metrics.excerptChars, fastExcerpt.metrics.excerptChars, 'unknown options fall back to fast, they never truncate to nothing');

  // Ranking disabled → text is only cleaned, and savings are still measured.
  const big = Array.from({ length: 40 }, (_, index) => `Đoạn thảo luận số ${index}: học sinh làm việc nhóm và trình bày trước lớp.`).join('\n\n');
  const unranked = preprocessLessonSource(big, { maxChars: 800 });
  const rankedBig = preprocessLessonSource(big, { maxChars: 800, ranking: true });
  assert.equal(unranked.cleaned, cleanLessonSource(big).text, 'ranking off leaves cleaned content intact');
  assert.equal(unranked.metrics.excerptReason, 'head-tail', 'only the excerpt step shortens it');
  assert.ok(unranked.metrics.rankingSavingsChars > 0, 'savings measured anyway');
  assert.ok(rankedBig.text.length <= 800 + 200);

  // --- Never throws ---------------------------------------------------------
  const empty = preprocessLessonSource('');
  assert.equal(empty.text, '');
  assert.equal(empty.metrics.excerptChars, 0);

  const weird = preprocessLessonSource(LESSON, { maxChars: Number.NaN });
  assert.equal(weird.metrics.originalChars, LESSON.length, 'NaN budget falls back to the fast budget');

  // --- Prompt helper keeps the old contract ---------------------------------
  const prepared = prepareLessonExcerpt(LESSON);
  assert.equal(typeof prepared.excerpt, 'string');
  assert.equal(typeof prepared.truncated, 'boolean');
  assert.equal(prepared.metrics.version, LESSON_PREPROCESS_VERSION);

  // --- Cache invalidation ---------------------------------------------------
  const base = { documentSha256: sha256Hex(LESSON), modelId: 'qwen', mode: 'fast', sourceName: 'bai.txt' };
  const keyNow = buildAnalysisCacheKey(base);
  const keyOtherVersion = buildAnalysisCacheKey({ ...base, preprocessVersion: LESSON_PREPROCESS_VERSION + 1 });
  assert.notEqual(keyNow, keyOtherVersion, 'preprocessor version invalidates the key');
  assert.equal(buildAnalysisCacheKey({ ...base, preprocessVersion: LESSON_PREPROCESS_VERSION }), keyNow);
  assert.equal(buildAnalysisCacheKey(base), keyNow, 'stable for identical input');
  assert.notEqual(keyNow, buildAnalysisCacheKey({ ...base, mode: 'deep' }));
  assert.notEqual(keyNow, buildAnalysisCacheKey({ ...base, documentSha256: sha256Hex('khác') }));

  // --- #58: supervised L3 (query) ------------------------------------------
  // A long plan whose middle is the only place that discusses "quang hợp".
  const filler = index => `Đoạn ${index}: học sinh thảo luận nhóm và ghi chép vào vở.`;
  const withMiddle = [
    ...Array.from({ length: 8 }, (_, index) => filler(index)),
    'Cây xanh quang hợp nhờ ánh sáng mặt trời và diệp lục.',
    'Quá trình quang hợp tạo ra khí ô-xi cho không khí.',
    ...Array.from({ length: 8 }, (_, index) => filler(index + 100))
  ].join('\n\n');
  const middleBudget = 400;

  const tailOnly = preprocessLessonSource(withMiddle, { maxChars: middleBudget });
  assert.equal(tailOnly.metrics.excerptReason, 'head-tail', 'no query at analysis time');
  assert.ok(!tailOnly.text.includes('quang hợp'), 'head+tail drops the middle');

  const queried = preprocessLessonSource(withMiddle, { maxChars: middleBudget, query: 'quang hợp ánh sáng' });
  assert.equal(queried.metrics.excerptReason, 'ranked-query');
  assert.ok(queried.text.includes('quang hợp'), 'query-based ranking reaches the middle');
  assert.ok(queried.text.length <= middleBudget + 200, 'ranking respects the same budget');

  // The document fits: nothing to rank, whichever signal is configured.
  const fitsWithQuery = preprocessLessonSource(LESSON, { query: 'bay hơi' });
  assert.equal(fitsWithQuery.metrics.excerptReason, 'fits');
  assert.equal(fitsWithQuery.text, cleanLessonSource(LESSON).text, 'a fitting document is never re-ordered');

  // A query that matches nothing must fall back, not ship an arbitrary excerpt.
  const noMatch = preprocessLessonSource(withMiddle, { maxChars: middleBudget, query: 'tích phân từng phần' });
  assert.equal(noMatch.metrics.excerptReason, 'head-tail', 'unmatched query degrades to head+tail');
  assert.equal(noMatch.text, tailOnly.text);

  // A punctuation-only query carries no topic and must not disable the budget.
  const tokensQuery = preprocessLessonSource(withMiddle, { maxChars: middleBudget, query: ' - : ' });
  assert.equal(tokensQuery.metrics.excerptReason, 'head-tail');

  // Explicit opt-outs always win over the presence of a query.
  const explicitlyUnranked = preprocessLessonSource(withMiddle, { maxChars: middleBudget, query: 'quang hợp', ranking: false });
  assert.equal(explicitlyUnranked.metrics.excerptReason, 'head-tail');
  assert.equal(explicitlyUnranked.text, tailOnly.text, 'ranking:false keeps the O6-gate behaviour');

  // Protected blocks (questions, answers, tables) survive query ranking.
  const withQuestions = [
    ...Array.from({ length: 6 }, (_, index) => filler(index)),
    'Quang hợp diễn ra ở đâu trong lá?',
    'Đáp án: Ở lục lạp.',
    TABLE,
    'Quang hợp là quá trình cây xanh tổng hợp chất hữu cơ.'
  ].join('\n\n');
  const keptQuestions = preprocessLessonSource(withQuestions, { maxChars: 300, query: 'quang hợp' });
  assert.ok(keptQuestions.text.includes('Đáp án: Ở lục lạp.'), 'answers are never ranked out');
  assert.ok(keptQuestions.text.includes('| 0 phút | 20°C | Bắt đầu |'), 'tables are never ranked out');

  // #58: the analysis prompt must reuse the prepared excerpt instead of
  // preprocessing the document a second time with different options.
  const preparedForPrompt = preprocessLessonSource(withMiddle, { maxChars: middleBudget, query: 'quang hợp' });
  const promptText = buildLessonAnalysisPrompt({
    text: withMiddle,
    prepared: { excerpt: preparedForPrompt.text, truncated: preparedForPrompt.metrics.truncated }
  });
  assert.ok(promptText.includes('quang hợp'), 'prompt carries the excerpt the metrics describe');
  assert.ok(promptText.includes('đã được rút gọn'), 'truncation is still announced to the model');
  // Without `prepared` the prompt preprocesses on its own, still inside the budget.
  const promptUnprepared = buildLessonAnalysisPrompt({ text: withMiddle, maxChars: middleBudget });
  assert.ok(promptUnprepared.includes('đã được rút gọn'), 'a budget-only prompt announces truncation too');
  assert.ok(promptUnprepared.length < promptText.length + 2_000, 'both paths stay near the budget');

  process.stdout.write('lesson-preprocess: ok\n');
}

run();
