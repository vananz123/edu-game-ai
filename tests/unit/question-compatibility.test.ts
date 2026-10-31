/**
 * DECISIONS #115 — the suggested game must come from what the questions really are,
 * not from a hard-coded genre. Each case below is a shape a teacher's bank can take;
 * the expected numbers are the ones `draft-convert.ts` would honour.
 */
import assert from 'node:assert/strict';
import { parseQuestionsFromText, type ParsedQuestion, type ParsedQuestionKind } from '../../src/services/question-import';
import {
  blockedQuestions,
  evaluateCompatibility,
  recommendedGame,
  usableQuestions
} from '../../src/services/question-compatibility';

function parsed(kind: ParsedQuestionKind, status: ParsedQuestion['status'] = 'ready', options = 4): ParsedQuestion {
  const optionList = Array.from({ length: options }, (_, index) => ({ id: String.fromCharCode(97 + index), text: `Phương án ${index + 1}` }));
  return {
    question: {
      id: `q-${kind}-${status}-${options}`,
      type: kind === 'true-false' ? 'true-false' : kind === 'fill-in-blank' ? 'fill-in-blank' : kind === 'short-answer' ? 'short-answer' : 'multiple-choice',
      prompt: `Câu ${kind}`,
      explanation: 'Giải thích.',
      points: 100,
      options: kind === 'multiple-choice' ? optionList : [],
      correctOptionId: kind === 'multiple-choice' ? 'a' : ''
    } as ParsedQuestion['question'],
    kind,
    status,
    warnings: [],
    sourceLine: 1
  };
}

function byGame(results: ReturnType<typeof evaluateCompatibility>) {
  return Object.fromEntries(results.map(result => [result.gameType, result]));
}

async function run(): Promise<void> {
  // --- The 5 × 7 matrix, from the real parser where possible --------------------

  const bank = parseQuestionsFromText(`Câu 1: Vì sao cây cần ánh sáng?
A. Quang hợp
B. Để bay
C. Để ngủ
Đáp án: A
Giải thích: Ánh sáng hỗ trợ quang hợp.

Câu 2: Mặt Trăng tự phát sáng.
A. Đúng
B. Sai
Đáp án: B
Giải thích: Mặt Trăng phản chiếu ánh sáng.

Câu 3: Điền vào chỗ trống: 6CO2 + 6H2O → C6H12O6 + ___.
Đáp án: 6O2
Giải thích: Quang hợp thải oxy.

Câu 4: Nêu vai trò của diệp lục.
Trả lời:
Đáp án: Hấp thụ ánh sáng
Giải thích: Diệp lục hấp thụ năng lượng ánh sáng.`);
  assert.deepEqual(bank.parsed.map(question => question.kind), ['multiple-choice', 'true-false', 'fill-in-blank', 'short-answer']);
  assert.ok(bank.parsed.every(question => question.status === 'ready'), 'all four are playable as written');

  const matrix = byGame(evaluateCompatibility(bank.parsed));
  assert.equal(matrix.arena.compatible, 4, 'arena takes all four kinds');
  assert.deepEqual(matrix.arena.usableKinds, ['multiple-choice', 'true-false', 'fill-in-blank', 'short-answer']);
  assert.equal(matrix.race.compatible, 1, 'race takes the multiple-choice question only');
  assert.equal(matrix.race.incompatible, 3);
  assert.deepEqual(matrix.race.usableKinds, ['multiple-choice']);
  assert.equal(matrix.treasure.compatible, 0, 'a question bank carries no stage story');
  assert.match(matrix.treasure.reason, /bối cảnh|nhiệm vụ/u);
  assert.equal(matrix.matching.compatible, 0);
  assert.equal(matrix.scenario.compatible, 0);
  assert.equal(recommendedGame(evaluateCompatibility(bank.parsed)), 'arena');

  // A bank of only written answers: arena is still the only game that can play it.
  const textOnly = bank.parsed.filter(question => question.kind === 'fill-in-blank' || question.kind === 'short-answer');
  const textMatrix = byGame(evaluateCompatibility(textOnly));
  assert.equal(textMatrix.arena.compatible, 2);
  assert.equal(textMatrix.race.compatible, 0);
  assert.equal(recommendedGame(evaluateCompatibility(textOnly)), 'arena');

  // --- Shapes the games cannot play never win --------------------------------

  const multiAnswer = parsed('multi-answer', 'needs-review');
  const multiTf = parsed('multi-tf', 'needs-review');
  const seven = parsed('multiple-choice', 'incompatible', 7);
  const unplayable = byGame(evaluateCompatibility([multiAnswer, multiTf, seven]));
  for (const gameType of ['arena', 'race', 'treasure', 'matching', 'scenario'] as const) {
    assert.equal(unplayable[gameType].compatible, 0, `${gameType} cannot play review/incompatible questions`);
    assert.equal(unplayable[gameType].score <= 0, true);
  }
  assert.equal(unplayable.arena.needsReview, 2);
  assert.equal(unplayable.arena.incompatible, 1);
  assert.equal(unplayable.treasure.score, -3, 'an impossible game is scored only down, never up');
  assert.equal(recommendedGame(evaluateCompatibility([multiAnswer, multiTf, seven])), null, 'no game fits, so nothing is suggested');

  // Six options fit; seven do not (`answerOptionsSchema` is max(6)).
  assert.equal(recommendedGame(evaluateCompatibility([parsed('multiple-choice', 'ready', 6)])), 'arena');
  assert.equal(recommendedGame(evaluateCompatibility([parsed('multiple-choice', 'ready', 7)])), null);

  // --- Scoring rules -----------------------------------------------------------

  // More usable questions must beat a smaller bank: a game that cannot use a
  // question is not rescued by the question count.
  const mixed = [parsed('multiple-choice'), parsed('multiple-choice'), parsed('fill-in-blank'), parsed('fill-in-blank')];
  const mixedMatrix = byGame(evaluateCompatibility(mixed));
  assert.equal(mixedMatrix.arena.score, 40);
  assert.equal(mixedMatrix.race.score, 18, '2 × 10 + 2 incompatible');
  assert.ok(mixedMatrix.arena.score > mixedMatrix.race.score);
  assert.match(mixedMatrix.arena.reason, /Dùng được cả 4 câu/u);
  assert.match(mixedMatrix.race.reason, /2 câu không dùng được/u);

  // Empty or absent input: no recommendation, no crash.
  assert.deepEqual(evaluateCompatibility([]).map(result => result.compatible), [0, 0, 0, 0, 0]);
  assert.equal(recommendedGame([]), null);
  assert.equal(recommendedGame(evaluateCompatibility([])), null);

  // Ties keep the step order, so a bank every game scores the same on still proposes arena.
  const one = evaluateCompatibility([parsed('multiple-choice')]);
  assert.equal(recommendedGame(one), 'arena');
  assert.equal(one[0].gameType, 'arena', 'results follow the step order');

  // --- What the wizard converts vs. what it reports ---------------------------

  const usable = usableQuestions(bank.parsed, 'race');
  assert.equal(usable.length, 1, 'race converts only the multiple-choice question');
  assert.equal(usable[0].kind, 'multiple-choice');
  const blocked = blockedQuestions(bank.parsed, 'race');
  assert.deepEqual(blocked.map(question => question.kind), ['true-false', 'fill-in-blank', 'short-answer']);
  assert.equal(blockedQuestions(bank.parsed, 'arena').length, 0);
  assert.deepEqual(usableQuestions([multiAnswer, seven], 'arena'), [], 'needs-review and 7-option questions are never converted');
  // usableQuestions keeps source order even when called repeatedly.
  assert.deepEqual(usableQuestions(bank.parsed, 'arena').map(question => question.kind), ['multiple-choice', 'true-false', 'fill-in-blank', 'short-answer']);

  console.log('Question compatibility tests passed');
}

void run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
