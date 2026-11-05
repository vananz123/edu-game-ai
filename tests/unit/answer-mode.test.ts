// @ts-nocheck -- the shared "cách trả lời" law (DECISIONS #209).
const assert = require('node:assert/strict');
const {
  ANSWER_MODE_PREFIX,
  ANSWER_MODE_COMPETITIVE,
  ANSWER_MODE_PRACTICE,
  ANSWER_MODE_CHALLENGE,
  isAnswerModeValue,
  answerModeKey,
  answerModeForGame,
  answerModeSupportsTemplate,
  legacyScoringModeOf,
  answerRules,
  questionMaxPoints,
  practiceAward,
  explanationAllowed,
  answerModeOptions,
  answerModeLabel,
  answerModeHint
} = require('../../src/game-engine/answer-mode');

// Every stored value carries the prefix, so one key (gameSetup.scoringMode) can
// hold either a legacy scoring mode or a new answer mode without ambiguity.
assert.equal(ANSWER_MODE_PREFIX, 'tra-loi:');
for (const value of [ANSWER_MODE_COMPETITIVE, ANSWER_MODE_PRACTICE, ANSWER_MODE_CHALLENGE]) {
  assert.ok(value.startsWith(ANSWER_MODE_PREFIX), `${value} is namespaced`);
  assert.equal(isAnswerModeValue(value), true);
}
assert.notEqual(ANSWER_MODE_COMPETITIVE, ANSWER_MODE_PRACTICE);
assert.notEqual(ANSWER_MODE_PRACTICE, ANSWER_MODE_CHALLENGE);

// THE COMPATIBILITY GUARD: the five Vietnamese scoring modes a saved game may
// already hold must never read as a new answer mode, or #209 would silently
// re-rule every game created before it.
for (const legacy of ['cơ bản', 'tốc độ', 'theo độ khó', 'thi đấu đội', 'luyện tập']) {
  assert.equal(isAnswerModeValue(legacy), false, `${legacy} stays a scoring mode`);
  assert.equal(answerModeKey({ scoringMode: legacy }), 'legacy');
}
assert.equal(answerModeKey({}), 'legacy', 'a game with no setup at all is a legacy game');
assert.equal(answerModeKey(undefined), 'legacy');
assert.equal(answerModeKey({ scoringMode: 'tra-loi:' }), 'legacy', 'the bare prefix is not a mode');
assert.equal(answerModeKey({ scoringMode: 'khong-ro' }), 'legacy');

assert.equal(answerModeKey({ scoringMode: ANSWER_MODE_COMPETITIVE }), 'competitive');
assert.equal(answerModeKey({ scoringMode: ANSWER_MODE_PRACTICE }), 'practice');
assert.equal(answerModeKey({ scoringMode: ANSWER_MODE_CHALLENGE }), 'challenge');

// Matching keeps its own penalty law, so it never inherits an answer mode.
assert.equal(answerModeForGame({ template: 'matching', gameSetup: { scoringMode: ANSWER_MODE_PRACTICE } }), 'legacy');
assert.equal(answerModeForGame({ template: 'quiz', gameSetup: { scoringMode: ANSWER_MODE_PRACTICE } }), 'practice');
assert.equal(answerModeForGame({ template: 'treasure-hunt', gameSetup: { scoringMode: ANSWER_MODE_CHALLENGE } }), 'challenge');
assert.equal(answerModeForGame({ template: 'race', gameSetup: {} }), 'legacy');
assert.equal(answerModeForGame(undefined), 'legacy');

// The four games are the whole allow-list; editor, wizard and adapter all ask this
// one function instead of listing templates themselves.
for (const template of ['quiz', 'scenario', 'treasure-hunt', 'race']) {
  assert.equal(answerModeSupportsTemplate(template), true, `${template} has answer modes`);
}
assert.equal(answerModeSupportsTemplate('matching'), false, 'Ghép cặp keeps its own pairing penalty law');
assert.equal(answerModeSupportsTemplate(''), false);
assert.equal(answerModeSupportsTemplate(undefined), false);
assert.equal(answerModeSupportsTemplate('gibberish'), false);
// A template outside the list is legacy even when a token was somehow stored on it.
assert.equal(answerModeForGame({ template: 'matching', gameSetup: { scoringMode: ANSWER_MODE_COMPETITIVE } }), 'legacy');

// "Giữ hành vi hiện tại" has to restore the EXACT mode the game was made with, including
// the one that pays a speed bonus, so the value being replaced is kept beside the token.
assert.equal(legacyScoringModeOf({ scoringMode: 'tốc độ' }), 'tốc độ', 'a legacy game returns its own value');
assert.equal(legacyScoringModeOf({ scoringMode: 'thi đấu đội' }), 'thi đấu đội');
assert.equal(legacyScoringModeOf({}), '', 'a game that never stored a mode stays without one');
assert.equal(legacyScoringModeOf({ scoringMode: ANSWER_MODE_PRACTICE, legacyScoringMode: 'tốc độ' }), 'tốc độ');
assert.equal(legacyScoringModeOf({ scoringMode: ANSWER_MODE_PRACTICE }), '', 'no stash means no mode to go back to');
assert.equal(legacyScoringModeOf(undefined), '');
assert.equal(legacyScoringModeOf('scoringMode'), '');
// While a token is stored the stash wins; once the legacy value is back the stash is inert.
assert.equal(legacyScoringModeOf({ scoringMode: 'cơ bản', legacyScoringMode: 'tốc độ' }), 'cơ bản');

// The three modes differ in exactly three properties; legacy = today's behaviour.
const legacy = answerRules('legacy');
const competitive = answerRules('competitive');
const practice = answerRules('practice');
const challenge = answerRules('challenge');
assert.equal(legacy.retryOnWrong, false);
assert.equal(legacy.revealOnWrong, true, 'today a wrong answer already reveals the right one');
assert.deepEqual(competitive, legacy, 'Thi đấu is the current law, that is why it is the new default');
assert.equal(practice.retryOnWrong, true);
assert.equal(practice.revealOnWrong, false, 'a retry is worthless if the wrong answer exposes the key');
assert.equal(practice.lockOnWrong, false);
assert.equal(challenge.retryOnWrong, false);
assert.equal(challenge.revealOnWrong, false);
assert.equal(challenge.lockOnWrong, true);
assert.deepEqual(answerRules('gibberish'), legacy, 'an unknown mode must not invent rules');
assert.deepEqual(answerRules(undefined), legacy);

// Base points of ONE question: the question's own value, then the setup's, then 100.
assert.equal(questionMaxPoints({ points: 250 }, { pointsPerCorrect: '100' }), 250);
assert.equal(questionMaxPoints({}, { pointsPerCorrect: '120' }), 120);
assert.equal(questionMaxPoints({ points: '80' }, {}), 80);
assert.equal(questionMaxPoints({}, {}), 100);
assert.equal(questionMaxPoints({ points: -5 }, { pointsPerCorrect: 0 }), 100, 'a negative never wins');
assert.equal(questionMaxPoints(undefined, undefined), 100);

// Practice penalty: 10% of the question's own maximum per wrong answer, floor 0,
// and never a subtraction from the run total.
assert.equal(practiceAward(100, 0), 100);
assert.equal(practiceAward(100, 1), 90);
assert.equal(practiceAward(100, 2), 80);
assert.equal(practiceAward(100, 9), 10);
assert.equal(practiceAward(100, 10), 0);
assert.equal(practiceAward(100, 40), 0, 'floor at zero, never negative');
assert.equal(practiceAward(250, 1), 225);
assert.equal(practiceAward(300, 7), 90);
assert.equal(practiceAward(0, 3), 0);
assert.equal(practiceAward(100, undefined), 100, 'no wrong answers yet means no penalty');
assert.equal(practiceAward(100, -1), 100);
assert.equal(practiceAward(95, 1), 86, 'rounded, never a fraction of a point');
assert.equal(practiceAward(100, 3), 70);
assert.ok(practiceAward(100, 3) < practiceAward(100, 2), 'the penalty only ever shrinks the award');

// Explanation gating is the visible difference between the modes.
assert.equal(explanationAllowed('competitive', { correct: false, finished: true }), true);
assert.equal(explanationAllowed('competitive', { correct: true, finished: true }), true);
assert.equal(explanationAllowed('competitive', { correct: false, finished: false }), false);
assert.equal(explanationAllowed('challenge', { correct: false, finished: true }), false, 'a lost challenge stays sealed');
assert.equal(explanationAllowed('challenge', { correct: true, finished: true }), true);
assert.equal(explanationAllowed('practice', { correct: false, finished: true }), true, 'out of attempts: the stage is over');
assert.equal(explanationAllowed('practice', { correct: true, finished: true }), true);
assert.equal(explanationAllowed('practice', { correct: false, finished: false }), false);
assert.equal(explanationAllowed('legacy', { correct: false, finished: true }), true);
assert.equal(explanationAllowed(undefined, {}), false);
assert.equal(explanationAllowed('challenge', undefined), false);

// The pickers: three new modes, and the legacy entry only where an old game is shown.
const fresh = answerModeOptions(false);
assert.deepEqual(fresh.map(option => option.value), [ANSWER_MODE_COMPETITIVE, ANSWER_MODE_PRACTICE, ANSWER_MODE_CHALLENGE]);
assert.deepEqual(fresh.map(option => option.label), ['Thi đấu', 'Luyện tập', 'Thử thách']);
const withLegacy = answerModeOptions(true);
assert.equal(withLegacy.length, 4);
assert.equal(withLegacy[0].value, '', 'the legacy entry stores nothing new');
assert.equal(withLegacy[0].label, 'Giữ hành vi hiện tại');
for (const option of withLegacy) {
  assert.ok(option.label, `${option.value} has a label`);
  assert.ok(option.hint, `${option.value} tells the teacher what changes`);
}
assert.equal(answerModeLabel('practice'), 'Luyện tập');
assert.equal(answerModeLabel('legacy'), 'Giữ hành vi hiện tại');
assert.equal(answerModeLabel('khong-biet'), 'Giữ hành vi hiện tại');
assert.ok(answerModeHint('challenge').includes('KHÔNG'), 'the challenge hint says the answer stays hidden');
assert.ok(answerModeHint('practice').includes('10%'), 'the practice hint states the penalty the teacher is buying');

console.log('answer-mode: one key holds either a legacy scoring mode or one of three answer modes, with the practice penalty and explanation gates verified');
