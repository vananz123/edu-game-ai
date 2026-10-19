import assert from 'node:assert/strict';
import { chunkLessonText } from '../src/services/lesson-chunker';
import {
  buildRetrievalQuery,
  selectChunks,
  scoreChunksLexically,
  tokenizeForRetrieval,
  DEFAULT_MAX_SELECTED_CHUNKS,
  DEFAULT_MAX_SELECTED_CHARS
} from '../src/services/lesson-retrieval';
import type { ArenaConfig, LessonAnalysis } from '../src/shared/lesson-types';

const LESSON = [
  'Bài 21: Quang hợp ở thực vật',
  '',
  'Quang hợp là quá trình tổng hợp chất hữu cơ từ nước và khí carbon dioxide dưới tác dụng của ánh sáng, nhờ sắc tố diệp lục trong lục lạp. Sản phẩm của quang hợp là chất hữu cơ và khí oxy.',
  '',
  'Phần 2: Hô hấp ở thực vật',
  '',
  'Hô hấp là quá trình phân giải chất hữu cơ để giải phóng năng lượng cho hoạt động sống. Hô hấp diễn ra ở ti thể và không cần ánh sáng.',
  '',
  'Phần 3: An toàn giao thông',
  '',
  'Khi đi xe đạp đến trường, học sinh phải đội mũ bảo hiểm và đi đúng làn đường. Dàn hàng ba là hành vi nguy hiểm, dễ gây tai nạn giao thông.'
].join('\n');

const chunks = chunkLessonText(LESSON, { maxChars: 300, minChars: 80 });
assert.ok(chunks.length >= 3, `expected >= 3 chunks, got ${chunks.length}`);

const indexOfChunkContaining = (needle: string): number => {
  const found = chunks.findIndex(chunk => chunk.text.includes(needle));
  assert.ok(found >= 0, `no chunk contains ${needle}`);
  return found;
};
const photosynthesis = indexOfChunkContaining('Quang hợp là quá trình tổng hợp');
const respiration = indexOfChunkContaining('Hô hấp là quá trình phân giải');
const safety = indexOfChunkContaining('đội mũ bảo hiểm');

// --- tokenizer ------------------------------------------------------------

assert.deepEqual(tokenizeForRetrieval('Quang hợp, ánh sáng!'), ['quang', 'hợp', 'ánh', 'sáng']);
assert.deepEqual(tokenizeForRetrieval('Năm 1945 có 2 sự kiện'), ['năm', '1945', 'có', 'sự', 'kiện']);
assert.deepEqual(tokenizeForRetrieval('   '), []);

// --- ranking --------------------------------------------------------------

const ranked = scoreChunksLexically('quang hợp ánh sáng lục lạp diệp lục', chunks);
assert.equal(ranked.length, chunks.length);
assert.equal(ranked[0].chunk.index, photosynthesis, 'photosynthesis chunk must rank first');
assert.ok(ranked[0].score > 0);
// Every chunk gets a score and the list is sorted descending, ties by index.
ranked.forEach((entry, position) => {
  assert.ok(Number.isFinite(entry.score));
  if (position > 0) {
    assert.ok(
      ranked[position - 1].score > entry.score ||
        (ranked[position - 1].score === entry.score && ranked[position - 1].chunk.index < entry.chunk.index),
      'ranking must be sorted with a stable tie-break'
    );
  }
});

const respirationRank = scoreChunksLexically('hô hấp ti thể năng lượng', chunks);
assert.equal(respirationRank[0].chunk.index, respiration);

// --- selection ------------------------------------------------------------

const selection = selectChunks(chunks, 'quang hợp ánh sáng diệp lục', { maxChunks: 2, maxChars: DEFAULT_MAX_SELECTED_CHARS });
assert.equal(selection.scorer, 'lexical-v1');
assert.equal(selection.fallback, false);
assert.ok(selection.selected.length >= 1 && selection.selected.length <= 2);
assert.equal(selection.considered, chunks.length);
// Selected chunks are returned in document order, not score order.
assert.deepEqual(
  selection.selected.map(chunk => chunk.index),
  [...selection.selected.map(chunk => chunk.index)].sort((left, right) => left - right)
);
assert.ok(selection.characters <= DEFAULT_MAX_SELECTED_CHARS);
assert.ok(selection.selected.some(chunk => chunk.index === photosynthesis));
assert.equal(selection.scores.length, selection.selected.length);

const single = selectChunks(chunks, 'quang hợp ánh sáng diệp lục', { maxChunks: 1 });
assert.equal(single.selected.length, 1);
assert.equal(single.selected[0].index, photosynthesis);

// A tiny character budget still returns something instead of an empty excerpt
// as long as one chunk fits.
const tight = selectChunks(chunks, 'quang hợp', { maxChunks: DEFAULT_MAX_SELECTED_CHUNKS, maxChars: 260 });
assert.ok(tight.selected.length >= 1);
assert.ok(tight.characters <= 260);

// --- fallback -------------------------------------------------------------

const noMatch = selectChunks(chunks, 'zzz qqq xxx', { maxChunks: 2 });
assert.equal(noMatch.fallback, true);
assert.ok(noMatch.selected.length >= 1);
assert.equal(noMatch.selected[0].index, chunks[0].index, 'fallback starts at the beginning of the document');
assert.deepEqual(noMatch.scores, noMatch.selected.map(() => 0));

const empty = selectChunks([], 'quang hợp');
assert.deepEqual(empty.selected, []);
assert.equal(empty.fallback, false);
assert.equal(empty.characters, 0);
assert.equal(empty.considered, 0);

// --- query building -------------------------------------------------------

const analysis: LessonAnalysis = {
  id: 'analysis_1',
  schemaVersion: 1,
  documentId: 'doc_1',
  subject: 'Sinh học',
  grade: 7,
  topic: 'Quang hợp',
  objectives: [
    { id: 'obj_light', description: 'Nêu vai trò của ánh sáng trong quang hợp', cognitiveLevel: 'remember' },
    { id: 'obj_safety', description: 'Đội mũ bảo hiểm khi đi xe đạp', cognitiveLevel: 'apply' }
  ],
  keyConcepts: [
    { id: 'concept_1', term: 'Diệp lục', explanation: 'Sắc tố hấp thụ ánh sáng trong lục lạp.' },
    { id: 'concept_2', term: 'Ti thể', explanation: 'Bào quan hô hấp.' }
  ],
  uncertainties: [],
  sourceDocumentIds: ['doc_1'],
  createdAt: '2026-04-04T00:00:00.000Z'
};

const config: ArenaConfig = {
  gameType: 'arena',
  title: 'Đấu trường quang hợp',
  subject: 'Sinh học',
  grade: '7',
  topic: 'Quang hợp',
  audience: 'teen',
  durationMinutes: 10,
  difficulty: 'trung bình',
  playMode: 'individual',
  style: 'fun',
  focusObjectiveIds: ['obj_light'],
  generationMode: 'fast',
  questionCount: 6,
  scoringMode: 'basic',
  pointsPerCorrect: 10,
  timeBonus: 0
};

const query = buildRetrievalQuery({ analysis, config });
assert.ok(query.includes('Quang hợp'), 'topic must be in the query');
assert.ok(query.includes('Nêu vai trò của ánh sáng'), 'focus objective must be in the query');
assert.equal(query.includes('Đội mũ bảo hiểm'), false, 'non-focus objectives must not drag chunks in');
assert.ok(query.includes('Diệp lục') && query.includes('Ti thể'), 'key concepts must be in the query');
assert.ok(query.split('\n').filter(line => line === 'Quang hợp').length >= 2, 'topic should be weighted');

// Without a config the query still describes the analysis (all objectives).
const bare = buildRetrievalQuery({ analysis });
assert.ok(bare.includes('Đội mũ bảo hiểm'));
assert.ok(bare.includes('Sinh học'));

// The focus-aware query retrieves the photosynthesis chunk, not the safety one.
const focusSelection = selectChunks(chunks, query, { maxChunks: 2, maxChars: 600 });
assert.ok(focusSelection.selected.some(chunk => chunk.index === photosynthesis));
assert.equal(focusSelection.selected.some(chunk => chunk.index === safety), false);

// --- determinism ----------------------------------------------------------

assert.deepEqual(scoreChunksLexically('quang hợp', chunks), scoreChunksLexically('quang hợp', chunks));
assert.deepEqual(selectChunks(chunks, query, { maxChunks: 3 }), selectChunks(chunks, query, { maxChunks: 3 }));

console.log('Lesson retrieval tests passed');
