// @ts-nocheck -- pure progression logic tests (DECISIONS #140, revised #141).
const assert = require('node:assert/strict');
const {
  houseCreate,
  houseApplyAnswer,
  houseSummary,
  houseStyleOptions,
  houseStyleLabel,
  houseStyleFor
} = require('../../src/game-engine/house-build');

// A fresh game starts with only the foundation: zero buildable parts.
assert.deepEqual(houseCreate(), { parts: 0, correct: 0, wrong: 0 });
assert.equal(houseSummary(houseCreate(), 7).parts, 0);
assert.equal(houseSummary(houseCreate(), 7).completed, false);
assert.equal(houseSummary(houseCreate(), 7).remaining, 7);

// One correct answer builds exactly one part.
let r = houseApplyAnswer(houseCreate(), 7, true);
assert.deepEqual(r.state, { parts: 1, correct: 1, wrong: 0 });
assert.equal(r.grew, true);
assert.equal(r.shrank, false);
assert.equal(r.completed, false);

// A wrong answer removes exactly one part (down to the foundation, never below).
r = houseApplyAnswer(r.state, 7, false);
assert.deepEqual(r.state, { parts: 0, correct: 1, wrong: 1 });
assert.equal(r.grew, false);
assert.equal(r.shrank, true);

// Wrong answers at the foundation floor at 0 (no negative parts).
r = houseApplyAnswer(r.state, 7, false);
assert.equal(r.state.parts, 0);
assert.equal(r.shrank, false, 'removing a part that is not there does not shrink');

// Parts cap at maxParts and completion fires on the answer that reaches the cap.
let st = houseCreate();
const results = [];
for (let i = 0; i < 10; i++) {
  const res = houseApplyAnswer(st, 7, true);
  results.push(res);
  st = res.state;
}
assert.equal(st.parts, 7, 'parts never exceed maxParts');
assert.equal(results[6].completed, true);
assert.equal(results[6].completedNow, true, 'the cap-reaching answer reports completedNow');
assert.equal(results[9].completedNow, false, 'staying complete does not re-fire');
// Complete again after a drop is not "completedNow" the first time back up? It is:
r = houseApplyAnswer({ parts: 6, correct: 6, wrong: 0 }, 7, true);
assert.equal(r.completedNow, true);
// Staying complete does not re-fire.
r = houseApplyAnswer({ parts: 7, correct: 7, wrong: 0 }, 7, true);
assert.equal(r.completed, true);
assert.equal(r.completedNow, false);

// A complete house can lose a part on a wrong answer and drop below completion.
r = houseApplyAnswer({ parts: 7, correct: 7, wrong: 0 }, 7, false);
assert.equal(r.state.parts, 6);
assert.equal(r.completed, false);
assert.equal(r.shrank, true);

// Walk a mixed sequence: +1 on correct, −1 on wrong.
const run = (answers, max = 7) => {
  let s = houseCreate();
  for (const ok of answers) s = houseApplyAnswer(s, max, ok).state;
  return s;
};
// 4 correct, 1 wrong, 2 correct → 4 - 1 + 2 = 5 parts.
assert.equal(run([true, true, true, true, false, true, true]).parts, 5);
// All wrong keeps the foundation only.
assert.equal(run([false, false, false]).parts, 0);
assert.equal(run([false, false, false]).wrong, 3);

// houseSummary mirrors the clamped state.
const done = houseSummary(run([true, true, true, true, true, true, true]), 7);
assert.equal(done.parts, 7);
assert.equal(done.completed, true);
assert.equal(done.remaining, 0);
const partial = houseSummary(run([true, true]), 7);
assert.equal(partial.parts, 2);
assert.equal(partial.completed, false);
assert.equal(partial.remaining, 5);

// #143: the target is the question count (the renderer caps it at the house's
// eight visual parts), so any quiz length can finish by answering everything.
const runTarget = (answers, target) => {
  let s = houseCreate();
  let last = null;
  for (const ok of answers) {
    last = houseApplyAnswer(s, target, ok);
    s = last.state;
  }
  return { state: s, last };
};
// 5 questions, all correct → 5 parts and completion on the last answer.
const five = runTarget([true, true, true, true, true], 5);
assert.equal(five.state.parts, 5);
assert.equal(five.last.completedNow, true, 'a 5-question quiz completes with all 5 answers');
assert.equal(houseSummary(five.state, 5).remaining, 0);
// 8 questions, all correct → 8 parts and completion on the last answer.
const eight = runTarget([true, true, true, true, true, true, true, true], 8);
assert.equal(eight.state.parts, 8);
assert.equal(eight.last.completedNow, true, 'an 8-question quiz completes with all 8 answers');
// A short quiz still needs every answer: 4/5 leaves the house unfinished.
const fourOfFive = runTarget([true, true, true, true, false], 5);
assert.equal(fourOfFive.state.parts, 3);
assert.equal(houseSummary(fourOfFive.state, 5).completed, false);
// A one-question quiz completes with its one correct answer.
const one = runTarget([true], 1);
assert.equal(one.state.parts, 1);
assert.equal(one.last.completedNow, true);
// The target never drops below the foundation's single part.
assert.equal(houseApplyAnswer(houseCreate(), 0, true).maxParts, 1);

// #144: house models. Four styles, each with a label, and a resolution rule that
// keeps one quiz on one model while different quizzes can differ.
const styles = houseStyleOptions();
assert.deepEqual(styles.map(style => style.id), ['nha-mai-do', 'nha-vuon', 'thap-canh', 'nha-go']);
assert.ok(styles.every(style => style.label && typeof style.label === 'string'));
assert.equal(houseStyleLabel('thap-canh'), 'Tháp canh');
assert.equal(houseStyleLabel('unknown'), '');
// An explicit valid style always wins, whatever the seed.
for (const style of styles) assert.equal(houseStyleFor(style.id, 'any-game'), style.id);
// Missing/auto/invalid falls back to a stable pick from the game id.
assert.equal(houseStyleFor('', 'ui-house-6'), houseStyleFor('auto', 'ui-house-6'));
assert.equal(houseStyleFor(undefined, 'ui-house-6'), houseStyleFor('nope', 'ui-house-6'));
assert.ok(styles.some(style => style.id === houseStyleFor(undefined, 'ui-house-6')));
assert.equal(houseStyleFor(undefined, ''), 'nha-mai-do', 'no seed resolves to the classic house');
// Replays of the same game keep the same house; a different game may change it.
assert.equal(houseStyleFor('auto', 'game-a'), houseStyleFor('auto', 'game-a'));
assert.notEqual(houseStyleFor(undefined, 'ui-house-5'), houseStyleFor(undefined, 'ui-house-8'));

console.log('house-build: per-part +1/-1 with a question-count target and four stable house styles verified');
