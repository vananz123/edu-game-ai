import assert from 'node:assert/strict';
import { chunkLessonText } from '../../src/services/lesson/lesson-chunker';
import {
  buildRetrievalQuery,
  cosineSimilarity,
  selectChunks,
  selectChunksByVectors,
  selectChunksForItem,
  selectItemChunks,
  scoreChunksLexically,
  tokenizeForRetrieval,
  ITEM_SCOPING_ENABLED,
  DEFAULT_MAX_SELECTED_CHUNKS,
  DEFAULT_MAX_SELECTED_CHARS,
  DEEP_MAX_SELECTED_CHARS
} from '../../src/services/lesson/lesson-retrieval';
import type { ArenaConfig, LessonAnalysis } from '../../src/shared/lesson-types';

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

// --- vector selection (O4) -----------------------------------------------

const vector = (...values: number[]) => Float32Array.from(values);
assert.ok(Math.abs(cosineSimilarity(vector(1, 2), vector(1, 2)) - 1) < 1e-9);
assert.ok(Math.abs(cosineSimilarity(vector(1, 0), vector(0, 1))) < 1e-6);
assert.equal(cosineSimilarity(vector(0, 0), vector(1, 0)), 0, 'a zero vector cannot be similar to anything');
assert.throws(() => cosineSimilarity(vector(1, 0), vector(1, 0, 0)), /chiều/);

const vectors = new Map<number, Float32Array>();
chunks.forEach((chunk, position) => {
  vectors.set(chunk.index, position === photosynthesis ? vector(1, 0, 0) : vector(0.2, 1, 0));
});
const byMeaning = selectChunksByVectors(chunks, vector(1, 0, 0), vectors, { maxChunks: 1, maxChars: 1000 });
assert.equal(byMeaning.scorer, 'embeddings-v1');
assert.deepEqual(byMeaning.selected.map(chunk => chunk.index), [photosynthesis]);
assert.equal(byMeaning.fallback, false);
assert.equal(byMeaning.scores.length, 1);

// Identical scores keep document order (deterministic output, like lexical).
const flatVectors = new Map(chunks.map(chunk => [chunk.index, vector(1, 0, 0)]));
const flatSelection = selectChunksByVectors(chunks, vector(1, 0, 0), flatVectors, { maxChunks: 2, maxChars: 1000 });
assert.deepEqual(
  flatSelection.selected.map(chunk => chunk.index),
  [chunks[0].index, chunks[1].index]
);

// Chunks without a vector cannot be ranked; when none can, it reports fallback.
assert.equal(selectChunksByVectors(chunks, vector(1, 0, 0), new Map(), { maxChunks: 1 }).fallback, true);
const partialVectors = new Map([[chunks[1].index, vector(1, 0, 0)]]);
const partialSelection = selectChunksByVectors(chunks, vector(1, 0, 0), partialVectors, {
  maxChunks: 5,
  maxChars: 100000
});
assert.deepEqual(partialSelection.selected.map(chunk => chunk.index), [chunks[1].index]);

// Same budget rules as the lexical scorer.
const budgetVectors = new Map(chunks.map(chunk => [chunk.index, vector(1, 0, 0)]));
const budgetSelection = selectChunksByVectors(chunks, vector(1, 0, 0), budgetVectors, {
  maxChunks: DEFAULT_MAX_SELECTED_CHUNKS,
  maxChars: DEFAULT_MAX_SELECTED_CHARS
});
assert.ok(budgetSelection.selected.length <= DEFAULT_MAX_SELECTED_CHUNKS);
assert.ok(budgetSelection.characters <= DEFAULT_MAX_SELECTED_CHARS);

// --- per-item scoping (#54 follow-up) --------------------------------------

// The draft-wide slice: all three sections of the lesson.
const wideSelection = selectChunks(chunks, 'quang hợp hô hấp an toàn giao thông', {
  maxChunks: 8,
  maxChars: DEEP_MAX_SELECTED_CHARS
});
assert.ok(wideSelection.selected.length >= 3, `wide slice should hold >= 3 chunks, got ${wideSelection.selected.length}`);

// An item about photosynthesis only needs the photosynthesis chunk.
const photosynthesisItem = JSON.stringify({
  prompt: 'Sản phẩm của quang hợp là gì?',
  options: [{ id: 'a', text: 'Chất hữu cơ và khí oxy' }, { id: 'b', text: 'Khí carbon dioxide' }],
  correctOptionId: 'a',
  explanation: 'Quang hợp tạo chất hữu cơ và khí oxy nhờ diệp lục.'
});
const narrowSelection = selectItemChunks({ chunks: wideSelection.selected, reference: photosynthesisItem });
assert.ok(narrowSelection, 'an item quoting one section should narrow the slice');
assert.ok(narrowSelection.length < wideSelection.selected.length, 'narrowed slice must be smaller than the wide one');
assert.deepEqual(
  narrowSelection.map(chunk => chunk.index),
  [photosynthesis],
  'only the photosynthesis chunk quotes the item (a shared sentence-initial "là"/"và" must not count)'
);
assert.deepEqual(
  narrowSelection.map(chunk => chunk.index),
  [...narrowSelection.map(chunk => chunk.index)].sort((left, right) => left - right),
  'the item slice must stay in document order'
);

// No overlap at all: the item may paraphrase broadly, so keep the wide slice.
assert.equal(
  selectItemChunks({ chunks: wideSelection.selected, reference: JSON.stringify({ prompt: 'xyzzy' }) }),
  null,
  'an item that quotes nothing must not be narrowed'
);
// Every chunk quotes the item: narrowing would save nothing. The gate is the
// leader's *share* of what the retrieved chunks explain together: a mixed item
// gives 0.63 against 0.25 + 0.13 (share 0.63), so it is treated as multi-section
// and keeps the full slice.
assert.equal(
  selectItemChunks({
    chunks: wideSelection.selected,
    reference: 'quang hợp hô hấp an toàn giao thông mũ bảo hiểm'
  }),
  null,
  'an item quoting every chunk must not be narrowed'
);
assert.equal(
  selectChunksForItem(wideSelection, { reference: 'quang hợp hô hấp an toàn giao thông mũ bảo hiểm' }),
  wideSelection,
  'a mixed item must keep the full slice'
);
// Nothing to narrow from.
assert.equal(selectItemChunks({ chunks: [], reference: photosynthesisItem }), null);
assert.equal(selectItemChunks({ chunks: wideSelection.selected.slice(0, 1), reference: photosynthesisItem }), null);
// A degenerate item (only stop words) proves nothing about provenance.
assert.equal(
  selectItemChunks({ chunks: wideSelection.selected, reference: 'câu hỏi này có đáp án đúng không' }),
  null
);
// The per-item budget is a fallback, never a trim: a slice that does not fit is
// sent as the full selection instead of losing part of the item's source.
assert.equal(
  selectItemChunks({ chunks: wideSelection.selected, reference: photosynthesisItem, maxChars: 200 }),
  null,
  'an item slice over the per-item budget must fall back, not be trimmed'
);

// `selectChunksForItem` is what main.ts calls: it narrows a single-section item,
// never widens or empties the slice, and keeps scores aligned with the chunks.
assert.equal(ITEM_SCOPING_ENABLED, true, 'per-item narrowing is on: it cuts the prefill of one regeneration');
const scoped = selectChunksForItem({ ...wideSelection }, { reference: photosynthesisItem });
assert.deepEqual(scoped.selected.map(chunk => chunk.index), [photosynthesis], 'a single-section item narrows to its chunk');
assert.equal(scoped.scorer, wideSelection.scorer);
assert.equal(scoped.characters, scoped.selected.reduce((sum, chunk) => sum + chunk.text.length, 0));
assert.equal(scoped.scores.length, scoped.selected.length, 'scores must stay aligned with the selected chunks');
// A selection that cannot be narrowed comes back untouched (same object).
assert.equal(selectChunksForItem(wideSelection, { reference: 'xyzzy' }), wideSelection);
// No retrieval at all (no chunks / no document) still yields a usable empty slice.
assert.deepEqual(selectChunksForItem(null, { reference: photosynthesisItem }), {
  selected: [], scores: [], scorer: 'lexical-v1', fallback: false, characters: 0, considered: 0
});

// --- determinism ----------------------------------------------------------

assert.deepEqual(scoreChunksLexically('quang hợp', chunks), scoreChunksLexically('quang hợp', chunks));
assert.deepEqual(selectChunks(chunks, query, { maxChunks: 3 }), selectChunks(chunks, query, { maxChunks: 3 }));

console.log('Lesson retrieval tests passed');
