/**
 * DECISIONS #345 — the questions Cloud AI writes must survive the import path.
 *
 * The gateway returns a game; the editor imports text. The conversion between the two is
 * the one piece of new code in that path, so it gets tested without a network:
 *
 *   1. a well-formed cloud game becomes block text the REAL parser reads back with the
 *      same prompts, the same options and the right answer;
 *   2. a question whose answer names no real option is DROPPED — the count says so, and
 *      nothing wrong is imported (a wrong answer key teaches the wrong thing);
 *   3. a newline inside a prompt cannot split one question into two;
 *   4. the renderer copy (a mirror, because classic scripts cannot import) produces the
 *      same text, so the two files cannot drift silently.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const DIST = path.join(__dirname, '..', '..', '..', 'dist', 'src');
const SHARED = require('../../src/shared/cloud-questions');
const { parseQuestionsFromText } = require('../../src/services/input/question-import');

const CLOUD_GAME = {
  title: 'An toàn giao thông',
  questions: [
    {
      prompt: 'Khi đi bộ trên đường không có vỉa hè, em nên đi ở đâu?',
      options: [
        { id: 'a', text: 'Sát mép đường bên phải' },
        { id: 'b', text: 'Giữa lòng đường' },
        { id: 'c', text: 'Bên trái đường' },
      ],
      correctOptionId: 'b2',
      explanation: 'Đi sát mép đường bên phải để nhường đường cho xe cộ.',
    },
    {
      prompt: 'Trước khi sang đường, em làm gì?',
      options: [
        { id: 'x', text: 'Chạy thật nhanh' },
        { id: 'y', text: 'Dừng lại, nhìn trái, nhìn phải rồi mới đi' },
      ],
      correctOptionId: 'y',
    },
  ],
};

// The first question's correctOptionId names an option that does not exist: it must be the
// point of the test, so fix it here and keep the shape otherwise untouched.
CLOUD_GAME.questions[0].correctOptionId = 'a';

async function main() {
  // 1. Round trip: the text we generate is text the importer reads.
  const converted = SHARED.cloudGameToImportText(CLOUD_GAME);
  assert.equal(converted.kept, 2);
  assert.equal(converted.dropped, 0);
  assert.ok(converted.text.startsWith('Câu 1: '), 'block text starts with the numbered question');
  assert.ok(converted.text.includes('Đáp án: A'), 'answer letter names the matched option');

  const parsed = parseQuestionsFromText(converted.text);
  assert.equal(parsed.questions.length, 2, 'both questions survive the real parser');
  assert.deepEqual(
    parsed.questions.map(question => question.prompt),
    [
      'Khi đi bộ trên đường không có vỉa hè, em nên đi ở đâu?',
      'Trước khi sang đường, em làm gì?',
    ]
  );
  assert.deepEqual(
    parsed.questions[0].options.map(option => option.text),
    ['Sát mép đường bên phải', 'Giữa lòng đường', 'Bên trái đường']
  );
  // The answer the cloud marked is the answer the parser keeps.
  const marked = parsed.questions[0].options.find(option => option.id === parsed.questions[0].correctOptionId);
  assert.equal(marked.text, 'Sát mép đường bên phải');
  const second = parsed.questions[1].options.find(option => option.id === parsed.questions[1].correctOptionId);
  assert.equal(second.text, 'Dừng lại, nhìn trái, nhìn phải rồi mới đi');
  assert.ok(parsed.questions[0].explanation.includes('nhường đường'), 'the explanation is carried, not dropped');

  // 2. An answer that names no real option drops the question instead of guessing.
  const broken = SHARED.cloudGameToImportText({
    questions: [
      { prompt: 'Câu hỏng', options: [{ id: 'a', text: 'Một' }, { id: 'b', text: 'Hai' }], correctOptionId: 'zzz' },
      { prompt: 'Câu thiếu phương án', options: [{ id: 'a', text: 'Chỉ một' }], correctOptionId: 'a' },
      { prompt: '', options: [{ id: 'a', text: 'Một' }, { id: 'b', text: 'Hai' }], correctOptionId: 'a' },
      'không phải đối tượng',
    ],
  });
  assert.equal(broken.kept, 0, 'nothing usable');
  assert.equal(broken.dropped, 4, 'every unusable entry is counted, not silently swallowed');
  assert.equal(broken.text, '');

  // 3. A prompt containing newlines stays ONE question.
  const multiline = SHARED.cloudGameToImportText({
    questions: [
      {
        prompt: 'Dòng một\nDòng hai\tcó tab',
        options: [{ id: 'a', text: 'Đúng' }, { id: 'b', text: 'Sai' }],
        correctOptionId: 'a',
      },
    ],
  });
  const flat = parseQuestionsFromText(multiline.text);
  assert.equal(flat.questions.length, 1, 'one question, not two');
  assert.equal(flat.questions[0].prompt, 'Dòng một Dòng hai có tab');

  // 4. The renderer mirror produces byte-identical text.
  const context = vm.createContext({ console });
  const mirrorFile = path.join(DIST, 'renderer', 'shared', 'cloud-questions.js');
  assert.ok(fs.existsSync(mirrorFile), 'renderer/shared/cloud-questions.js must exist — run npm run build');
  vm.runInContext(fs.readFileSync(mirrorFile, 'utf8'), context, { filename: mirrorFile });
  const mirrorText = vm.runInContext(`cloudGameToImportText(${JSON.stringify(CLOUD_GAME)}).text`, context);
  assert.equal(mirrorText, converted.text, 'the renderer copy must match the shared module');

  console.log('cloud-questions: 4 nhóm kiểm đã qua');
}

void main();

export {};
