// @ts-nocheck -- migrated legacy UI logic; new contracts are typed in src/shared/types.ts.
const assert = require('node:assert/strict');
const {
  scoreAnswer, scoreTextAnswer, normalizeTextAnswer, isTextQuestion,
  questionFingerprint, dedupeImportedQuestions,
  calculateSummary, resolveScoring, questionPoints, SCORING_MODES,
  scoreScenarioDecision, calculateScenarioSummary, resolveScenarioTransition,
  calculateMatchingSummary
} = require('../src/game-engine/runtime');

const q = { correctOptionId: 'b', points: 100 };
assert.deepEqual(scoreAnswer(q, 'b', 4), { correct: true, points: 120, speedBonus: 20 });
assert.deepEqual(scoreAnswer(q, 'a', 4), { correct: false, points: 0, speedBonus: 0 });
const summary = calculateSummary([{ correct: true, points: 120 }, { correct: false, points: 0 }], [{ points: 100 }, { points: 100 }]);
assert.equal(summary.points, 120);
assert.equal(summary.correct, 1);
assert.equal(summary.total, 2);

// tasknight.docx §2.3 — 5 chế độ tính điểm.
assert.deepEqual(SCORING_MODES, ['cơ bản', 'tốc độ', 'theo độ khó', 'thi đấu đội', 'luyện tập']);

// Tốc độ: cộng điểm thưởng theo cấu hình, clamp tối đa 50, không cộng khi quá 8 giây.
const speedSetup = { scoringMode: 'tốc độ', timeBonus: '30' };
assert.deepEqual(scoreAnswer(q, 'b', 4, speedSetup), { correct: true, points: 130, speedBonus: 30 });
assert.deepEqual(scoreAnswer(q, 'b', 10, speedSetup), { correct: true, points: 100, speedBonus: 0 });
assert.equal(resolveScoring({ scoringMode: 'tốc độ', timeBonus: '999' }).timeBonus, 50);
assert.equal(resolveScoring({ scoringMode: 'tốc độ', timeBonus: '-5' }).timeBonus, 0);

// Cơ bản & Luyện tập: điểm cố định, không điểm thưởng tốc độ.
for (const mode of ['cơ bản', 'luyện tập', 'thi đấu đội']) {
  assert.deepEqual(scoreAnswer(q, 'b', 2, { scoringMode: mode }), { correct: true, points: 100, speedBonus: 0 }, mode);
  assert.deepEqual(scoreAnswer(q, 'b', 1, { scoringMode: mode, timeBonus: '50' }), { correct: true, points: 100, speedBonus: 0 }, mode);
}

// Theo độ khó: bảng điểm mặc định dễ 100 / trung bình 200 / khó 300.
const diffSetup = { scoringMode: 'theo độ khó', pointsEasy: '100', pointsMedium: '200', pointsHard: '300' };
const scoring = resolveScoring(diffSetup);
assert.equal(questionPoints({ points: 100, difficulty: 'dễ' }, scoring), 100);
assert.equal(questionPoints({ points: 100, difficulty: 'trung bình' }, scoring), 200);
assert.equal(questionPoints({ points: 100, difficulty: 'khó' }, scoring), 300);
assert.equal(questionPoints({ points: 100 }, scoring), 100); // câu chưa gắn độ khó dùng điểm của câu
assert.deepEqual(scoreAnswer({ correctOptionId: 'b', points: 100, difficulty: 'trung bình' }, 'b', 3, diffSetup), { correct: true, points: 200, speedBonus: 0 });

// Bảng điểm tùy chỉnh giáo viên + tính điểm tối đa theo chế độ.
const customDiff = resolveScoring({ scoringMode: 'theo độ khó', pointsEasy: '50', pointsMedium: '150', pointsHard: '250' });
assert.equal(questionPoints({ points: 999, difficulty: 'khó' }, customDiff), 250);
const diffSummary = calculateSummary([{ points: 250, correct: true }], [{ points: 100, difficulty: 'khó' }], diffSetup);
assert.equal(diffSummary.max, 300);
const practiceSummary = calculateSummary([{ points: 100, correct: true }], [{ points: 100 }], { scoringMode: 'luyện tập' });
assert.equal(practiceSummary.max, 100); // luyện tập không tính điểm thưởng tốc độ

// Game cũ không có gameSetup: giữ nguyên hành vi (mặc định chế độ tốc độ, +20).
const legacy = resolveScoring(undefined);
assert.equal(legacy.mode, 'tốc độ');
assert.equal(legacy.timeBonus, 20);

assert.deepEqual(scoreScenarioDecision({
  scenarioScore: { safety: 50, reasoning: 20, harmReduction: 15 }
}), {
  points: 85,
  max: 100,
  breakdown: { safety: 50, reasoning: 20, harmReduction: 15 }
});
assert.deepEqual(scoreScenarioDecision({
  scenarioScore: { safety: 80, reasoning: -3, harmReduction: 9 }
}).breakdown, { safety: 60, reasoning: 0, harmReduction: 9 });
assert.deepEqual(calculateScenarioSummary([
  { points: 85, correct: true },
  { points: 40, correct: false }
]), { points: 125, max: 200, percent: 63, correct: 1, total: 2 });
const branchQuestions = [{ id: 'first' }, { id: 'second' }];
assert.equal(resolveScenarioTransition({ nextQuestionId: 'second' }, 0, branchQuestions), 1);
// Generated scenarios often set null on every option; that means "continue",
// not "end after situation 1". An explicit editor end still stops the branch.
assert.equal(resolveScenarioTransition({ nextQuestionId: null }, 0, branchQuestions), 1);
assert.equal(resolveScenarioTransition({ endsScenario: true, nextQuestionId: null }, 0, branchQuestions), undefined);
assert.equal(resolveScenarioTransition({}, 0, branchQuestions), 1);
assert.equal(resolveScenarioTransition({}, 1, branchQuestions), undefined);
assert.throws(() => resolveScenarioTransition({ nextQuestionId: 'missing' }, 0, branchQuestions), /Không tìm thấy tình huống/);
// Sequential fallback must visit every situation for 1, 2 and 10 items.
for (const count of [1, 2, 10]) {
  const questions = Array.from({ length: count }, (_, index) => ({ id: `s${index + 1}` }));
  const visited = [];
  let index = 0;
  while (index !== undefined && visited.length <= count + 1) {
    visited.push(index);
    index = resolveScenarioTransition({ nextQuestionId: null }, index, questions);
  }
  assert.deepEqual(visited, Array.from({ length: count }, (_, position) => position));
}
// §4.2: trừ điểm sai theo cấu hình wrongPenalty (mặc định 0 = không trừ).
assert.deepEqual(calculateMatchingSummary(2, 2, 1, 30, {
  pointsPerPair: 100, completionBonus: 200, wrongPenalty: 10, timeBonus: 50, bonusUnderSeconds: 60
}), { points: 440, max: 450, percent: 98, correct: 2, total: 2, wrongAttempts: 1, elapsedSeconds: 30 });
assert.equal(calculateMatchingSummary(2, 2, 5, 30, {
  pointsPerPair: 100, completionBonus: 200, timeBonus: 50, bonusUnderSeconds: 60
}).points, 450); // sai nhiều lần vẫn full điểm khi giáo viên không bật penalty
assert.equal(calculateMatchingSummary(2, 1, 0, 30, {
  pointsPerPair: 100, completionBonus: 200, timeBonus: 50, bonusUnderSeconds: 60
}).points, 100); // thiếu cặp: chỉ điểm từng cặp, không có thưởng hoàn thành/thời gian
assert.equal(calculateMatchingSummary(2, 2, 3, 120, {
  pointsPerPair: 100, completionBonus: 200, wrongPenalty: 10, timeBonus: 50, bonusUnderSeconds: 60, practiceMode: true
}).points, 400);

// §2.4 text-answer questions (điền từ / trả lời ngắn): chấm không phân biệt hoa/thường, dấu và khoảng trắng.
assert.equal(normalizeTextAnswer('  Quang   Hợp '), 'quang hop');
assert.equal(normalizeTextAnswer('ĐÚNG'), 'dung');
assert.equal(isTextQuestion({ type: 'fill-in-blank' }), true);
assert.equal(isTextQuestion({ type: 'short-answer' }), true);
assert.equal(isTextQuestion({ type: 'multiple-choice' }), false);
const blankQ = { type: 'fill-in-blank', correctAnswer: 'Quang hợp', points: 100 };
assert.deepEqual(scoreTextAnswer(blankQ, 'quang hop', 4), { correct: true, points: 120, speedBonus: 20 });
assert.deepEqual(scoreTextAnswer(blankQ, '  QUANG   HỢP  ', 4), { correct: true, points: 120, speedBonus: 20 });
assert.deepEqual(scoreTextAnswer(blankQ, 'hô hấp', 4), { correct: false, points: 0, speedBonus: 0 });
assert.deepEqual(scoreTextAnswer(blankQ, '', 4), { correct: false, points: 0, speedBonus: 0 });
assert.deepEqual(scoreTextAnswer(blankQ, 'quang hop', 4, { scoringMode: 'cơ bản' }), { correct: true, points: 100, speedBonus: 0 });
const altQ = { type: 'short-answer', correctAnswer: 'thở', alternateAnswers: ['hô hấp'], points: 100 };
assert.equal(scoreTextAnswer(altQ, 'thở', 9).correct, true);
assert.equal(scoreTextAnswer(altQ, 'Hô Hấp', 9).correct, true);
assert.equal(scoreTextAnswer(altQ, 'ăn', 9).correct, false);

// Dedupe câu hỏi khi nhập file: so khớp prompt (bỏ dấu/khoảng trắng) + type + đáp án + phương án.
const mcA = { type: 'multiple-choice', prompt: 'Cây cần ánh sáng?', correctOptionId: 'a', options: [{ id: 'a', text: 'Đúng thế' }, { id: 'b', text: 'Không' }] };
const mcAImported = { type: 'multiple-choice', prompt: '  cây  CẦN   ánh SÁNG? ', correctOptionId: 'a', options: [{ id: 'a', text: 'Đúng   thế' }, { id: 'b', text: 'Không' }] };
assert.equal(questionFingerprint(mcA), questionFingerprint(mcAImported));
const mcOtherAnswer = { ...mcAImported, correctOptionId: 'b' };
assert.notEqual(questionFingerprint(mcA), questionFingerprint(mcOtherAnswer));
const mcOtherOptions = { ...mcAImported, options: [{ id: 'a', text: 'Khác hẳn' }, { id: 'b', text: 'Không' }] };
assert.notEqual(questionFingerprint(mcA), questionFingerprint(mcOtherOptions));
const dupResult = dedupeImportedQuestions([mcAImported, mcOtherAnswer, mcOtherOptions], [mcA]);
assert.equal(dupResult.unique.length, 2);
assert.equal(dupResult.skipped, 1);
const withinBatch = dedupeImportedQuestions([mcAImported, { ...mcAImported }], []);
assert.equal(withinBatch.unique.length, 1);
assert.equal(withinBatch.skipped, 1);
const textDup = dedupeImportedQuestions(
  [{ type: 'fill-in-blank', prompt: 'Quang hợp ở đâu?', correctAnswer: 'Lục lạp' }],
  [{ type: 'fill-in-blank', prompt: '  Quang hợp   ở đâu?', correctAnswer: '  lục   LẠP' }]
);
assert.equal(textDup.unique.length, 0);
assert.equal(textDup.skipped, 1);
const textDiffAnswer = dedupeImportedQuestions(
  [{ type: 'short-answer', prompt: 'Tế bào chứa nhân?', correctAnswer: 'Tế bào nhân' }],
  [{ type: 'short-answer', prompt: 'Tế bào chứa nhân?', correctAnswer: 'Tế bào thực vật' }]
);
assert.equal(textDiffAnswer.unique.length, 1);
assert.deepEqual(dedupeImportedQuestions([], [mcA]), { unique: [], skipped: 0 });

console.log('runtime tests passed');
