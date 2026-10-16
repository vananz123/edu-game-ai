// @ts-nocheck -- migrated legacy UI logic; new contracts are typed in src/shared/types.ts.
const assert = require('node:assert/strict');
const { scoreAnswer, calculateSummary } = require('../src/game-engine/runtime');

const q = { correctOptionId: 'b', points: 100 };
assert.deepEqual(scoreAnswer(q, 'b', 4), { correct: true, points: 120, speedBonus: 20 });
assert.deepEqual(scoreAnswer(q, 'a', 4), { correct: false, points: 0, speedBonus: 0 });
const summary = calculateSummary([{ correct: true, points: 120 }, { correct: false, points: 0 }], [{ points: 100 }, { points: 100 }]);
assert.equal(summary.points, 120);
assert.equal(summary.correct, 1);
assert.equal(summary.total, 2);
console.log('runtime tests passed');
