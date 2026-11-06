/**
 * DECISIONS #118 — importing a `.egame` package.
 *
 * The library exported packages with no way to read one back. These checks pin what
 * the reader accepts, what it refuses, and the two safety rules: a fresh id per
 * import (never overwrite) and no external resource URL (offline, classroom-safe).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { EducationalGame } from '../../src/shared/types';
import {
  GamePackageError,
  readGamePackage,
  stripImportedAssetUrls,
  writeGamePackage
} from '../../src/services/game/game-package';

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

// #209 task 8: chữ của tệp do CHÍNH `writeGamePackage` sinh ra — đúng thứ
// `files:export-game` ghi xuống đĩa. Test tự viết lại envelope thì vẫn xanh mãi kể cả
// khi người ta đổi serializer, tức không chứng minh được điều gì.
const pack = (game: unknown) => writeGamePackage(game as EducationalGame);

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

  // --- #209: the answer mode has to survive the file, not just the database ---
  // `scoringMode` now carries either a Vietnamese scoring mode or a 'tra-loi:' token, plus
  // the value the token replaced. `normalizeGame` copies gameSetup generically, so this is
  // the check that proves it does not whitelist the old vocabulary and drop the new one.
  const modeGame = {
    ...JSON.parse(JSON.stringify(quiz)),
    gameSetup: { scoringMode: 'tra-loi:luyen-tap', legacyScoringMode: 'tốc độ', pointsPerCorrect: '100' }
  };
  const modeRoundTrip = readGamePackage(pack(modeGame), newId);
  assert.equal(modeRoundTrip.gameSetup?.scoringMode, 'tra-loi:luyen-tap', 'the token survives export/import');
  assert.equal(modeRoundTrip.gameSetup?.legacyScoringMode, 'tốc độ', 'and so does the value it parked');

  // --- #209 task 8: cùng đường đó nhưng qua TỆP THẬT trên đĩa -----------------
  // Học trò mang bài sang máy khác bằng một tệp `.egame`, nên bằng chứng phải là byte
  // thật: serializer của main ghi xuống đĩa, rồi đúng reader của main đọc lên.
  const file = path.join(os.tmpdir(), `egame-roundtrip-${process.pid}.egame`);
  try {
    const bytes = writeGamePackage(modeGame as EducationalGame);
    fs.writeFileSync(file, bytes, 'utf8');
    const raw = fs.readFileSync(file, 'utf8');
    // Tìm trong CHỮ THÔ, không tìm trong object đã parse: di sản của #209 nằm ở đúng
    // ký tự giáo viên nhìn thấy khi mở tệp bằng Notepad.
    assert.match(raw, /"packageFormat":\s*"edugame"/u, 'the file declares the package format');
    assert.match(raw, /"packageVersion":\s*1/u, 'and a version');
    assert.ok(raw.indexOf('tra-loi:luyen-tap') !== -1, 'the token is on disk, not only in the row');
    assert.ok(raw.indexOf('tốc độ') !== -1, 'and the parked Vietnamese value survives the encoding');
    const fromDisk = readGamePackage(raw, newId);
    assert.equal(fromDisk.gameSetup?.scoringMode, 'tra-loi:luyen-tap');
    assert.equal(fromDisk.gameSetup?.legacyScoringMode, 'tốc độ');
    assert.equal(fromDisk.questions[0].explanation, quiz.questions[0].explanation, 'the explanation the button will open survives too');

    // Kho báu cất CHUỖI RỖNG cho "chưa từng có mode nào"; marker của #209 xét SỰ CÓ MẶT
    // của khóa nên giá trị rỗng phải đi qua tệp mà không bị biến mất.
    const emptySetup = { ...JSON.parse(JSON.stringify(quiz)), gameSetup: { scoringMode: '', legacyScoringMode: '', duration: '20' } };
    const emptyRound = readGamePackage(pack(emptySetup), newId);
    assert.ok('scoringMode' in (emptyRound.gameSetup || {}), 'an empty stored mode keeps its key');
    assert.equal(emptyRound.gameSetup?.scoringMode, '');

    // Một giá trị parked `null` thì `normalizeGame` bỏ (nó chỉ giữ string/number/boolean).
    // Không mất gì: key đó chỉ có tác dụng hoàn nguyên một giá trị từng tồn tại, và null
    // thì không có gì để hoàn nguyên. Ghim lại để hành vi này không đổi âm thầm.
    const nullParked = { ...JSON.parse(JSON.stringify(quiz)), gameSetup: { scoringMode: 'tra-loi:thu-thach', legacyScoringMode: null } };
    const nullRound = readGamePackage(pack(nullParked), newId);
    assert.equal(nullRound.gameSetup?.scoringMode, 'tra-loi:thu-thach');
    assert.equal('legacyScoringMode' in (nullRound.gameSetup || {}), false, 'a parked null carries nothing to restore and is dropped');

    // Một game ĐƯỜNG ĐUA có token: thể loại thứ hai mà `scoringMode` không còn là bảng
    // điểm cũ, và cả ngân hàng câu riêng (`race.questions`) phải đi qua nguyên vẹn.
    const raceMode = {
      title: 'Đường đua', template: 'race', questions: [],
      gameSetup: { scoringMode: 'tra-loi:thi-dau' },
      race: {
        trackLength: 8, teamCount: 2, maxRounds: 3, stepByDifficulty: false, luckEnabled: false,
        teams: [{ id: 't1', name: 'Đội 1', color: '#111111' }, { id: 't2', name: 'Đội 2', color: '#222222' }],
        questions: [{ id: 'r1', difficulty: 'dễ', prompt: 'Mấy?', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correctOptionId: 'a', explanation: 'A.' }]
      }
    };
    const raceRound = readGamePackage(pack(raceMode), newId);
    assert.equal(raceRound.gameSetup?.scoringMode, 'tra-loi:thi-dau', 'a race keeps its answer mode through the file');
    assert.equal(raceRound.race?.questions?.[0]?.explanation, 'A.', 'and its own question bank');
  } finally {
    fs.rmSync(file, { force: true });
  }

  console.log('Game package tests passed');
}

void run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
