/**
 * DECISIONS #118 — importing a `.egame` package.
 *
 * The library exported packages with no way to read one back. These checks pin what
 * the reader accepts, what it refuses, and the two safety rules: a fresh id per
 * import (never overwrite) and no external resource URL (offline, classroom-safe).
 */
import assert from 'node:assert/strict';
import {
  GamePackageError,
  readGamePackage,
  stripImportedAssetUrls
} from '../../src/services/game-package';

let counter = 0;
const newId = () => `imported-${++counter}`;

const quiz = {
  id: 'game-original',
  title: 'Thủ đô Việt Nam',
  subject: 'Địa lý',
  grade: '4',
  topic: 'Thủ đô',
  template: 'quiz',
  description: 'Trò chơi mẫu.',
  sourceName: 'thu-do.docx',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-02-02T00:00:00.000Z',
  questions: [
    {
      id: 'q1',
      type: 'multiple-choice',
      prompt: 'Thủ đô Việt Nam là gì?',
      explanation: 'Hà Nội là thủ đô.',
      points: 100,
      options: [{ id: 'a', text: 'Hà Nội' }, { id: 'b', text: 'Huế' }],
      correctOptionId: 'a',
      illustrationAssetId: 'ho-guom',
      imageUrl: 'https://example.com/ho-guom.png'
    }
  ]
};

const pack = (game: unknown) => JSON.stringify({ packageFormat: 'edugame', packageVersion: 1, game });

async function run(): Promise<void> {
  // --- accepted shapes ---------------------------------------------------------
  const wrapped = readGamePackage(pack(JSON.parse(JSON.stringify(quiz))), newId);
  assert.equal(wrapped.title, 'Thủ đô Việt Nam');
  assert.equal(wrapped.questions.length, 1);
  assert.equal(wrapped.questions[0].correctOptionId, 'a');

  // A bare game object (an old export) is accepted too.
  const bare = readGamePackage(JSON.stringify(quiz), newId);
  assert.equal(bare.title, 'Thủ đô Việt Nam');

  // --- a fresh identity on every import ---------------------------------------
  assert.match(wrapped.id, /^imported-\d+$/u);
  assert.notEqual(wrapped.id, quiz.id, 'the author id is replaced');
  assert.equal(wrapped.createdAt, undefined, 'the import becomes a new row');
  assert.equal(wrapped.updatedAt, undefined);
  const second = readGamePackage(pack(quiz), newId);
  assert.notEqual(second.id, wrapped.id, 'importing twice keeps both games');

  // --- external resource URLs are dropped, built-in ids are kept --------------
  assert.equal((wrapped.questions[0] as { imageUrl?: string }).imageUrl, undefined, 'remote image removed');
  assert.equal(wrapped.questions[0].illustrationAssetId, 'ho-guom', 'built-in illustration kept');
  for (const url of ['http://a/b.png', 'https://a/b.png', 'file:///C:/Windows/x.png', 'data:image/png;base64,AAA', '//cdn.example/x.png']) {
    const item = { imageUrl: url, src: url, nested: { illustration: url } };
    stripImportedAssetUrls(item);
    assert.deepEqual(item, { nested: {} }, `strips ${url.slice(0, 12)}…`);
  }
  // A relative asset id or ordinary text is not a resource load and stays.
  const kept = { imageUrl: 'ho-guom', description: 'Xem thêm tại https://example.com' };
  stripImportedAssetUrls(kept);
  assert.equal(kept.imageUrl, 'ho-guom');
  assert.match(kept.description, /https:\/\/example\.com/u, 'text that mentions a URL is just text');

  // --- refused packages --------------------------------------------------------
  assert.throws(() => readGamePackage('{not json', newId), (error: unknown) => error instanceof GamePackageError && /JSON/u.test(error.message));
  assert.throws(() => readGamePackage('null', newId), /gói trò chơi hợp lệ/u);
  assert.throws(() => readGamePackage(JSON.stringify({ packageFormat: 'edugame', game: { title: 'x' } }), newId), /thiếu tên trò chơi hoặc danh sách câu hỏi/u);
  // A quiz question with no usable options is refused. (A wrong answer id is repaired
  // to the first option by `normalizeGame`, the same repair the editor and store do, so
  // that one is deliberately not a rejection.)
  const brokenQuiz = { ...JSON.parse(JSON.stringify(quiz)), questions: [{ ...quiz.questions[0], options: [{ id: 'a', text: 'A' }] }] };
  assert.throws(() => readGamePackage(pack(brokenQuiz), newId), /ít nhất hai phương án/u);
  const answered = readGamePackage(pack({ ...JSON.parse(JSON.stringify(quiz)), questions: [{ ...quiz.questions[0], correctOptionId: 'zzz' }] }), newId);
  assert.equal(answered.questions[0].correctOptionId, 'a', 'a broken answer id is repaired, as on save');
  // A race package missing a team is refused, not silently repaired.
  const race = {
    title: 'Đường đua', template: 'race', questions: [],
    race: {
      trackLength: 10, teamCount: 2, maxRounds: 5, stepByDifficulty: true, luckEnabled: true,
      teams: [{ id: 't1', name: 'Đội 1', color: '#111111' }],
      questions: [{ id: 'r1', difficulty: 'dễ', prompt: 'A?', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correctOptionId: 'a', explanation: 'A.' }]
    }
  };
  assert.throws(() => readGamePackage(pack(race), newId), /Gói trò chơi không hợp lệ/u);

  // --- what `files:export-game` actually writes, read back by `files:import-game` ---
  // The export handler writes `{ packageFormat, packageVersion, game }`; this is the
  // exact wrapper the import reads, so the two handlers cannot drift.
  const exported = JSON.parse(pack(JSON.parse(JSON.stringify(quiz))));
  assert.equal(exported.packageFormat, 'edugame');
  assert.equal(exported.packageVersion, 1);
  const roundTrip = readGamePackage(pack(exported.game), newId);
  assert.equal(roundTrip.title, quiz.title);
  assert.equal(roundTrip.questions[0].prompt, quiz.questions[0].prompt);
  assert.equal(roundTrip.questions[0].correctOptionId, quiz.questions[0].correctOptionId);
  assert.equal(roundTrip.questions[0].explanation, quiz.questions[0].explanation);

  console.log('Game package tests passed');
}

void run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
