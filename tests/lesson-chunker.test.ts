import assert from 'node:assert/strict';
import {
  chunkLessonText,
  normalizeLessonSource,
  DEFAULT_MAX_CHUNK_CHARS
} from '../src/services/lesson-chunker';

const LESSON = [
  'Bài 21: Quang hợp ở thực vật',
  '',
  'Quang hợp là quá trình tổng hợp chất hữu cơ từ nước và khí carbon dioxide dưới tác dụng của ánh sáng, nhờ sắc tố diệp lục trong lục lạp. Quá trình này tạo ra oxy và chất hữu cơ, là nguồn sống của gần như toàn bộ sinh giới trên Trái Đất.',
  '',
  'Ánh sáng là điều kiện bắt buộc. Cây trong bóng tối không quang hợp được, lá sẽ vàng và cây chết dần. Nhiệt độ quá cao hoặc quá thấp cũng làm giảm hiệu suất quang hợp, nên cây thường quang hợp mạnh nhất vào buổi sáng.',
  '',
  'Phần 2: Hô hấp ở thực vật',
  '',
  'Hô hấp là quá trình phân giải chất hữu cơ để giải phóng năng lượng cho hoạt động sống. Hô hấp diễn ra ở ti thể, khác với quang hợp diễn ra ở lục lạp. Hai quá trình này ngược chiều nhau nhưng đều cần thiết cho cây.',
  '',
  'Phần 3: An toàn giao thông',
  '',
  'Khi đi xe đạp đến trường, học sinh phải đội mũ bảo hiểm, đi đúng làn đường và không dàn hàng ba. Những hành vi này giảm nguy cơ tai nạn và bảo vệ bản thân cũng như người khác.'
].join('\n');

// --- empty input -----------------------------------------------------------

assert.deepEqual(chunkLessonText(''), []);
assert.deepEqual(chunkLessonText('   \n\t\n  '), []);
assert.deepEqual(chunkLessonText(null as unknown as string), []);

// --- short input is a single chunk ----------------------------------------

const short = chunkLessonText('Quang hợp là gì?');
assert.equal(short.length, 1);
assert.equal(short[0].index, 0);
assert.equal(short[0].text, 'Quang hợp là gì?');
assert.equal(short[0].charStart, 0);
assert.equal(short[0].charEnd, 'Quang hợp là gì?'.length);

// --- the lesson chunks are ordered, bounded, and lossless ------------------

const chunks = chunkLessonText(LESSON);
assert.ok(chunks.length >= 3, `expected several chunks, got ${chunks.length}`);
assert.deepEqual(
  chunks.map(chunk => chunk.index),
  chunks.map((_, position) => position)
);
chunks.forEach(chunk => {
  assert.ok(chunk.text.trim().length > 0);
  assert.ok(chunk.text.length <= DEFAULT_MAX_CHUNK_CHARS, `chunk ${chunk.index} is ${chunk.text.length} chars`);
  assert.ok(chunk.charStart < chunk.charEnd);
});
for (let position = 1; position < chunks.length; position += 1) {
  assert.ok(chunks[position].charStart >= chunks[position - 1].charEnd, 'chunks must not overlap and must stay in order');
}

// No paragraph may be dropped: its opening words must appear in some chunk.
LESSON.split('\n')
  .map(line => line.trim())
  .filter(line => line.length > 40)
  .forEach(paragraph => {
    const probe = paragraph.slice(0, 30);
    assert.ok(
      chunks.some(chunk => chunk.text.includes(probe)),
      `paragraph lost: ${probe}`
    );
  });

// Offsets point at the chunk's own text in the normalized source (whitespace
// between blocks is collapsed in the chunk text, so compare collapsed forms).
const collapse = (value: string) => value.replace(/\s+/g, ' ').trim();
const normalized = normalizeLessonSource(LESSON);
chunks.forEach(chunk => {
  const slice = normalized.slice(chunk.charStart, chunk.charEnd);
  assert.equal(collapse(slice), collapse(chunk.text), `offsets wrong for chunk ${chunk.index}`);
});

// --- headings are attached -------------------------------------------------

const respiration = chunks.find(chunk => chunk.text.includes('Hô hấp là quá trình phân giải'));
assert.ok(respiration, 'respiration chunk missing');
assert.ok(
  String(respiration && respiration.heading).includes('Hô hấp'),
  `heading not attached: ${respiration && respiration.heading}`
);
const safety = chunks.find(chunk => chunk.text.includes('đội mũ bảo hiểm'));
assert.ok(String(safety && safety.heading).includes('An toàn giao thông'), `heading not attached: ${safety && safety.heading}`);

// --- budget option --------------------------------------------------------

const small = chunkLessonText(LESSON, { maxChars: 300, minChars: 80 });
small.forEach(chunk => assert.ok(chunk.text.length <= 300, `chunk ${chunk.index} is ${chunk.text.length} chars`));
assert.ok(small.length > chunks.length, 'smaller budget must produce more chunks');

// --- a single huge sentence is split on word boundaries -------------------

const longSentence = Array.from({ length: 240 }, (_, position) => `tu${position}`).join(' ');
const split = chunkLessonText(longSentence, { maxChars: 200 });
assert.ok(split.length > 1);
assert.equal(split.map(chunk => chunk.text).join(' '), longSentence, 'hard split must not lose or duplicate words');
split.forEach(chunk => assert.ok(chunk.text.length <= 200));

// --- CRLF produces the same chunks ---------------------------------------

assert.deepEqual(chunkLessonText(LESSON.replace(/\n/g, '\r\n')), chunks);
assert.equal(normalizeLessonSource('a\r\nb\rc'), 'a\nb\nc');

// --- determinism ---------------------------------------------------------

assert.deepEqual(chunkLessonText(LESSON), chunks);

console.log('Lesson chunker tests passed');
