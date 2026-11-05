// @ts-nocheck -- #209 task 3: the shared answer-turn machine (src/game-engine/answer-flow.ts).
const assert = require('node:assert/strict');

// answer-flow.js reads answer-mode.js as GLOBALS in the renderer (index.html loads it
// right before). Each unit test runs in its own `node` process (tests/run-unit.js), so
// publishing the law on globalThis here is contained — and it is the only way this test
// executes the same code the games execute, instead of a copy.
const law = require('../../src/game-engine/answer-mode');
Object.assign(globalThis, law);
const runtime = require('../../src/game-engine/runtime');

const {
  beginAnswerTurn,
  registerAnswer,
  endAnswerTurn,
  answerTurnRecord,
  commitAnswerRecord,
  answerTurnAward
} = require('../../src/game-engine/answer-flow');

const COMPETITIVE = { scoringMode: 'tra-loi:thi-dau' };
const PRACTICE = { scoringMode: 'tra-loi:luyen-tap' };
const CHALLENGE = { scoringMode: 'tra-loi:thu-thach' };
const LEGACY_SPEED = { scoringMode: 'tốc độ', timeBonus: 20 };
const QUESTION = { id: 'q1', points: 100, difficulty: 'dễ', correctOptionId: 'a' };

function turnFor(setup, context) {
  return beginAnswerTurn(QUESTION, setup, context);
}

// --- opening a turn: the ceiling is the question's own, and a game can override it ---
assert.equal(turnFor(COMPETITIVE).maxPoints, 100);
assert.equal(turnFor(COMPETITIVE).mode, 'competitive');
assert.equal(turnFor({}).mode, 'legacy', 'a game with no token plays by the old law');
assert.equal(turnFor(LEGACY_SPEED).mode, 'legacy');
assert.equal(turnFor(PRACTICE, { maxPoints: 250 }).maxPoints, 250,
  'Kho báu passes the CONTENT points of the stage, never stage.points + completionBonus');
assert.equal(turnFor(PRACTICE, { maxPoints: 0 }).maxPoints, 100, 'an override of 0 is not a ceiling');
assert.equal(turnFor(PRACTICE, { maxPoints: -5 }).maxPoints, 100);
// Ghép cặp keeps its own penalty law, so a turn opened for it must not inherit a mode.
assert.equal(beginAnswerTurn(QUESTION, PRACTICE, { template: 'matching' }).mode, 'legacy');
assert.equal(beginAnswerTurn(QUESTION, PRACTICE, { template: 'quiz' }).mode, 'practice');
// A fresh turn is playable, reveals nothing, and offers no explanation yet.
const fresh = turnFor(PRACTICE);
assert.equal(fresh.attempts, 0);
assert.equal(fresh.answered, false);
assert.equal(fresh.finished, false);
assert.equal(fresh.locked, false);
assert.equal(fresh.points, 0);
assert.equal(fresh.revealCorrect, false);
assert.equal(fresh.explanationAvailable, false);
assert.equal(fresh.retryAllowed, true);

// --- THÍ ĐẤU = hành vi hôm nay: một lượt, sai thì mở đáp án, không phạt ---
const competitive = turnFor(COMPETITIVE);
registerAnswer(competitive, { correct: false, points: 0 });
assert.equal(competitive.attempts, 1);
assert.equal(competitive.wrongAttempts, 1);
assert.equal(competitive.finished, true, 'one answer per question is the whole point of Thi đấu');
assert.equal(competitive.locked, true);
assert.equal(competitive.retryAllowed, false);
assert.equal(competitive.revealCorrect, true, 'a wrong answer still shows the key, like today');
assert.equal(competitive.explanationAvailable, true);
assert.equal(competitive.points, 0);
const second = registerAnswer(competitive, { correct: true, points: 100 });
assert.equal(second.rejected, true, 'a second click after the question ended is refused');
assert.equal(competitive.attempts, 1, 'and it does not count as another attempt');
assert.equal(competitive.correct, false, 'it cannot flip a finished question to correct');
assert.equal(competitive.points, 0, 'it cannot pay points for an answer that never happened');

// A correct answer pays exactly what the game scored, including the legacy speed bonus.
const won = turnFor(COMPETITIVE);
registerAnswer(won, { correct: true, points: 100 });
assert.equal(won.points, 100);
assert.equal(won.correct, true);
assert.equal(won.finished, true);
assert.equal(won.revealCorrect, true);
assert.equal(won.explanationAvailable, true);
const speed = turnFor(LEGACY_SPEED);
registerAnswer(speed, { correct: true, points: runtime.scoreAnswer(QUESTION, 'a', 3, LEGACY_SPEED).points });
assert.equal(speed.points, 120, 'a legacy 0.4.0 game keeps its speed bonus through this layer');
assert.equal(speed.mode, 'legacy', 'legacy is never penalised');
const speedWrong = turnFor(LEGACY_SPEED);
registerAnswer(speedWrong, { correct: false, points: 0 });
assert.equal(speedWrong.revealCorrect, true);
assert.equal(speedWrong.finished, true);

// --- LUYỆN TẬP: thử lại, mỗi lần sai -10% trần của CÂU đó, sàn 0 ---
const practice = turnFor(PRACTICE);
registerAnswer(practice, { correct: false, points: 0 });
assert.equal(practice.attempts, 1);
assert.equal(practice.wrongAttempts, 1);
assert.equal(practice.finished, false, 'the student may answer again');
assert.equal(practice.locked, false);
assert.equal(practice.retryAllowed, true);
assert.equal(practice.revealCorrect, false, 'revealing the key would make the retry worthless');
assert.equal(practice.explanationAvailable, false, 'the turn is not over yet');
assert.equal(practice.points, 0);
registerAnswer(practice, { correct: false, points: 0 });
assert.equal(practice.wrongAttempts, 2);
registerAnswer(practice, { correct: true, points: 100 });
assert.equal(practice.correct, true);
assert.equal(practice.points, 80, 'two misses cost 20% of THIS question, not 20% of the run total');
assert.equal(practice.finished, true);
assert.equal(practice.locked, true);
assert.equal(practice.retryAllowed, false);
assert.equal(practice.revealCorrect, true, 'the answer they reached is shown');
assert.equal(practice.explanationAvailable, true);

// The floor: ten misses empties the question, and further misses never go negative.
const drained = turnFor(PRACTICE);
for (let i = 0; i < 12; i++) registerAnswer(drained, { correct: false, points: 0 });
assert.equal(drained.wrongAttempts, 12);
assert.equal(drained.finished, false, 'Luyện tập without an attempt limit keeps the question open');
assert.equal(drained.retryAllowed, true);
registerAnswer(drained, { correct: true, points: 100 });
assert.equal(drained.points, 0, 'floor at zero, never a negative award');
assert.equal(drained.correct, true, 'and it is still counted as a correct answer');

// Wrong-then-correct on the FIRST miss, at a question whose ceiling is not 100.
const oneMiss = beginAnswerTurn({ id: 'q2', points: 250 }, PRACTICE);
registerAnswer(oneMiss, { correct: false, points: 0 });
registerAnswer(oneMiss, { correct: true, points: 250 });
assert.equal(oneMiss.points, 225, '10% of the ceiling, rounded');
// The penalty base is the ceiling the game declared: everything ABOVE it is a bonus the
// game folded into its own payout (Kho báu: completion + hidden item) and stays untaxed.
const withBonus = turnFor(PRACTICE, { maxPoints: 100 });
registerAnswer(withBonus, { correct: false, points: 0 });
registerAnswer(withBonus, { correct: true, points: 400 });
assert.equal(withBonus.points, 390, 'phạt 10% phần điểm nội dung, thưởng 300 giữ nguyên');
// Partial credit is taxed on the same rule, and never below zero.
const partial = turnFor(PRACTICE, { maxPoints: 100 });
registerAnswer(partial, { correct: false, points: 0 });
registerAnswer(partial, { correct: true, points: 60 });
assert.equal(partial.points, 50);
const wiped = turnFor(PRACTICE, { maxPoints: 100 });
for (let i = 0; i < 30; i++) registerAnswer(wiped, { correct: false, points: 0 });
registerAnswer(wiped, { correct: true, points: 400 });
assert.equal(wiped.points, 300, 'the content part is fully taxed, the bonus still pays');
// answerTurnAward lets a game print the score it WOULD get before the answer lands.
const preview = turnFor(PRACTICE);
assert.equal(answerTurnAward(preview, 100), 100);
registerAnswer(preview, { correct: false, points: 0 });
assert.equal(answerTurnAward(preview, 100), 90, 'the UI can show the live penalty without mutating the turn');
assert.equal(preview.attempts, 1);
assert.equal(answerTurnAward(turnFor(LEGACY_SPEED), 120), 120, 'no mode, no tax');

/* --- điều Task 4 (Đấu trường + Tình huống) thực sự dựa vào ---
   `registerAnswer` đặt `turn.points = 0` sau một đáp án sai. Ở Tình huống một quyết
   định KHÔNG tối ưu vẫn ra điểm (rubric 60/25/15 của scoreScenarioDecision), nên
   trò ghi dòng điểm bằng CHÍNH điểm nó chấm, qua answerTurnAward + extra của
   commitAnswerRecord. Bốn kiểm tra dưới đây chốt rằng làm thế không phá luật nào. */
const rubricTurn = turnFor(LEGACY_SPEED);
registerAnswer(rubricTurn, { correct: false, points: 40 });
assert.equal(rubricTurn.points, 0, 'một vòng sai thì máy không tự thưởng điểm');
assert.equal(answerTurnAward(rubricTurn, 40), 40,
  'nhưng phần thưởng do rubric chấm vẫn được trả đủ: legacy không có phạt');
assert.equal(rubricTurn.revealCorrect, true, 'game cũ vẫn mở đáp án sau câu sai');
const rubricPractice = turnFor(PRACTICE);
registerAnswer(rubricPractice, { correct: false, points: 0 });
assert.equal(answerTurnAward(rubricPractice, 40), 30,
  'Luyện tập phạt điểm của rubric ĐÚNG bằng luật 10% trần điểm câu');
const wonCompetitive = turnFor(COMPETITIVE);
registerAnswer(wonCompetitive, { correct: true, points: 100 });
assert.equal(answerTurnAward(wonCompetitive, 100), wonCompetitive.points,
  'đáp án đúng: con số UI báo trước và con số máy đã tính là MỘT, không trừ hai lần');
const rubricRows = [];
const rubricCommit = commitAnswerRecord(rubricRows, rubricTurn, { points: 40, selectedOptionId: 'b' });
assert.equal(rubricCommit.committed, true);
assert.equal(rubricRows.length, 1);
assert.equal(rubricRows[0].points, 40, 'điểm của extra THẮNG điểm của vòng: dòng bảng điểm là điểm rubric');
assert.equal(rubricRows[0].correct, false);
assert.equal(rubricRows[0].mode, 'legacy');
assert.equal(rubricRows[0].wrongAttempts, 1, 'số lần sai vẫn xuống bảng điểm dù vòng ghi điểm của trò');
// "Bỏ qua câu này" ở Luyện tập: MC thoát khỏi một câu đang chờ thử lại, vòng khép lại.
const giveUpRows = [];
const giveUp = turnFor(PRACTICE);
registerAnswer(giveUp, { correct: false, points: 0 });
assert.equal(giveUp.retryAllowed, true);
const giveUpPoints = answerTurnAward(giveUp, 0);
endAnswerTurn(giveUp, { skipped: true });
assert.equal(commitAnswerRecord(giveUpRows, giveUp, { points: giveUpPoints }).committed, true);
assert.equal(giveUpRows[0].points, 0, 'một vòng bỏ giữa chừng không kiếm được điểm nào');
assert.equal(giveUpRows[0].correct, false);
assert.equal(giveUpRows[0].skipped, undefined, '`skipped` sống trên vòng, không phải trên dòng điểm');
// Phần rubric ĐÃ kiếm được trước đó thì một cú "bỏ qua" không claw back được.
const partialGiveUp = turnFor(PRACTICE, { maxPoints: 100 });
registerAnswer(partialGiveUp, { correct: false, points: 0 });
endAnswerTurn(partialGiveUp, { skipped: true });
assert.equal(answerTurnAward(partialGiveUp, 40), 30, 'phạt vẫn là 10% trần, dù vòng đã khép');

// Hết lượt (Kho báu): the game's own attempt limit closes the turn.
const out = turnFor(PRACTICE);
registerAnswer(out, { correct: false, points: 0 }, { attemptsLeft: 2 });
assert.equal(out.finished, false);
registerAnswer(out, { correct: false, points: 0 }, { attemptsLeft: 1 });
assert.equal(out.finished, false);
registerAnswer(out, { correct: false, points: 0 }, { attemptsLeft: 0 });
assert.equal(out.finished, true, 'the limit the game already had still decides');
assert.equal(out.locked, true);
assert.equal(out.retryAllowed, false);
assert.equal(out.points, 0);
assert.equal(out.revealCorrect, false, 'out of attempts does not expose the key either');
assert.equal(out.explanationAvailable, true, 'but the stage is over, so the explanation may be offered');
assert.equal(registerAnswer(out, { correct: true, points: 100 }).rejected, true,
  'a click that arrives after the last attempt is refused, so no attempt is ever double counted');

// --- THỬ THÁCH: một lượt, sai thì KHÔNG mở đáp án, phải tự sang câu ---
const challenge = turnFor(CHALLENGE);
registerAnswer(challenge, { correct: false, points: 0 });
assert.equal(challenge.finished, true);
assert.equal(challenge.locked, true);
assert.equal(challenge.retryAllowed, false);
assert.equal(challenge.revealCorrect, false, 'the plan: a wrong answer does not reveal the answer');
assert.equal(challenge.explanationAvailable, false, 'and it does not earn an explanation either');
assert.equal(challenge.points, 0);
const challengeWon = turnFor(CHALLENGE);
registerAnswer(challengeWon, { correct: true, points: 100 });
assert.equal(challengeWon.revealCorrect, true);
assert.equal(challengeWon.explanationAvailable, true);
assert.equal(challengeWon.points, 100);

// --- endAnswerTurn: phía trò khép vòng (hết giờ, bỏ lượt) ---
const timedOut = turnFor(CHALLENGE);
endAnswerTurn(timedOut);
assert.equal(timedOut.finished, true);
assert.equal(timedOut.locked, true);
assert.equal(timedOut.points, 0);
assert.equal(timedOut.revealCorrect, false, 'nobody answered, so nothing was earned');
const skipped = turnFor(COMPETITIVE);
endAnswerTurn(skipped, { skipped: true });
assert.equal(skipped.skipped, true);
assert.equal(skipped.attempts, 0, 'a skipped turn is not an attempt');
const alreadyWon = turnFor(PRACTICE);
registerAnswer(alreadyWon, { correct: true, points: 100 });
endAnswerTurn(alreadyWon);
assert.equal(alreadyWon.points, 100, 'closing a won turn never claws the points back');
assert.equal(alreadyWon.correct, true);
const practiceRetrying = turnFor(PRACTICE);
registerAnswer(practiceRetrying, { correct: false, points: 0 });
endAnswerTurn(practiceRetrying);
assert.equal(practiceRetrying.finished, true, 'the MC moving on ends the retry');
assert.equal(practiceRetrying.retryAllowed, false);
assert.equal(practiceRetrying.points, 0);

// --- một vòng = một dòng điểm, không hơn ---
const records = [];
const q1 = turnFor(PRACTICE);
registerAnswer(q1, { correct: false, points: 0 });
registerAnswer(q1, { correct: true, points: 100 });
let commit = commitAnswerRecord(records, q1);
assert.equal(commit.committed, true);
assert.equal(records.length, 1);
assert.equal(records[0].points, 90);
assert.equal(records[0].correct, true);
assert.equal(records[0].attempts, 2, 'the record carries the retries for the results screen');
assert.equal(records[0].wrongAttempts, 1);
assert.equal(records[0].questionId, 'q1');
assert.equal(records[0].mode, 'practice');
commit = commitAnswerRecord(records, q1);
assert.equal(commit.committed, false, 'committing the same turn twice is refused');
assert.equal(records.length, 1, 'so a question can only ever pay once');
const q2 = beginAnswerTurn({ id: 'q2', points: 100 }, PRACTICE);
registerAnswer(q2, { correct: true, points: 100 });
commit = commitAnswerRecord(records, q2, { selectedOptionId: 'a' });
assert.equal(commit.committed, true);
assert.equal(records.length, 2, 'a different question is a different row');
assert.equal(records[1].selectedOptionId, 'a', 'the game may add its own fields');
// A turn that somehow carries the id of a question already on the board is still blocked.
const dupe = beginAnswerTurn({ id: 'q1', points: 100 }, COMPETITIVE);
registerAnswer(dupe, { correct: true, points: 100 });
assert.equal(dupe.committed, false);
commit = commitAnswerRecord(records, dupe);
assert.equal(commit.committed, false, 'one row per questionId');
assert.equal(records.length, 2);
assert.equal(commit.records, records, 'the caller keeps the same array it passed in');
// Garbage in, no crash and no row: the games drive this from click handlers.
assert.equal(commitAnswerRecord(undefined, undefined).committed, false);
assert.equal(commitAnswerRecord(records, undefined).records, records);
assert.equal(registerAnswer(undefined, { correct: true }), undefined);
assert.equal(endAnswerTurn(undefined), undefined);
const bare = answerTurnRecord(undefined);
assert.equal(bare.points, 0);
assert.equal(bare.correct, false);
assert.equal(bare.mode, 'legacy', 'an unknown turn reports the old law, not a new one');

// --- tổng kết ván: tầng này phải khớp đúng calculateSummary của runtime.js ---
const board = [];
[0, 1, 2].forEach(index => {
  const one = beginAnswerTurn({ id: `s${index}`, points: 100 }, PRACTICE);
  registerAnswer(one, { correct: false, points: 0 });
  registerAnswer(one, { correct: true, points: 100 });
  commitAnswerRecord(board, one);
});
assert.deepEqual(board.map(row => row.points), [90, 90, 90]);
const summary = runtime.calculateSummary(board, [
  { id: 's0', points: 100 }, { id: 's1', points: 100 }, { id: 's2', points: 100 }
], PRACTICE);
assert.equal(summary.points, 270, 'the penalty is per question, so the run total is 3 × 90');
assert.equal(summary.max, 300, 'the ceiling stays the ceiling — a penalty is not a smaller exam');
assert.equal(summary.percent, 90);
assert.equal(summary.correct, 3, 'wrong-then-correct counts ONCE');
assert.equal(summary.total, 3);
// Three misses on the same question must not read as three answered questions.
const single = [];
const retry = beginAnswerTurn({ id: 'only', points: 100 }, PRACTICE);
registerAnswer(retry, { correct: false, points: 0 });
registerAnswer(retry, { correct: false, points: 0 });
registerAnswer(retry, { correct: false, points: 0 });
registerAnswer(retry, { correct: true, points: 100 });
commitAnswerRecord(single, retry);
assert.equal(single.length, 1);
const retrySummary = runtime.calculateSummary(single, [{ id: 'only', points: 100 }], PRACTICE);
assert.equal(retrySummary.points, 70);
assert.equal(retrySummary.correct, 1);
assert.equal(retrySummary.total, 1);
assert.equal(retrySummary.max, 100);

console.log('answer-flow: one turn per question — retry, lock, per-question penalty floor 0, explanation gate and a once-only score row, verified against calculateSummary');
