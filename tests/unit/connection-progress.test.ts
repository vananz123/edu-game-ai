// @ts-nocheck -- pure progression tests (DECISIONS #168).
const assert = require('node:assert/strict');
const { CONNECTION_TEMPLATES, connectionTemplate } = require('../../src/shared/connection-templates');
const {
  planConnectionStages,
  resetConnectionProgress,
  applyConnectionAnswer,
  isConnectionComplete,
  connectionSummary,
  clampStageCount
} = require('../../src/shared/connection-progress');

// One played item is one matching PAIR (Object Connection is a matching play
// style, DECISIONS #168); only its id matters to the plan.
const pairs = n => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}` }));
const bridge = connectionTemplate('bridge'); // 4 stages
const network = connectionTemplate('knowledge-network'); // 6 stages

// ---- plan: length, determinism, idempotent content -------------------------
let checkedPairs = 0;
for (const template of CONNECTION_TEMPLATES) {
  for (let n = 1; n <= 30; n += 1) {
    const plan = planConnectionStages(template, pairs(n));
    assert.equal(plan.length, n, `${template.id}: plan length = pair count (${n})`);
    assert.deepEqual(planConnectionStages(template, pairs(n)), plan, `${template.id}: plan is deterministic for ${n}`);
    const earned = plan.filter(Boolean);
    assert.equal(new Set(earned).size, earned.length, `${template.id}: no stage planned twice (${n})`);
    checkedPairs += 1;
  }
}
assert.ok(checkedPairs >= 7 * 30, 'every template was checked against 1..30 pairs');

// n === k: one answer per stage in order.
assert.deepEqual(planConnectionStages(bridge, pairs(4)), ['bridge-1', 'bridge-2', 'bridge-3', 'bridge-4']);
assert.deepEqual(planConnectionStages(network, pairs(6)), ['net-1', 'net-2', 'net-3', 'net-4', 'net-5', 'net-6']);

// n > k: the first k pairs earn a stage, the rest earn nothing.
assert.deepEqual(planConnectionStages(bridge, pairs(6)), ['bridge-1', 'bridge-2', 'bridge-3', 'bridge-4', '', '']);

// n < k: spread evenly and every earned stage is distinct.
assert.deepEqual(planConnectionStages(bridge, pairs(2)), ['bridge-1', 'bridge-3']);
assert.deepEqual(planConnectionStages(network, pairs(3)), ['net-1', 'net-3', 'net-5']);
// Two pairs over six stages is floor(i·6/2) = 0 and 3 — the gap the last answer
// then closes, which is the "unfinished run keeps what it earned" case below.
assert.deepEqual(planConnectionStages(network, pairs(2)), ['net-1', 'net-4']);
assert.deepEqual(planConnectionStages(network, pairs(1)), ['net-1']);

// Empty inputs are safe.
assert.deepEqual(planConnectionStages(bridge, []), []);
assert.deepEqual(planConnectionStages(bridge, null), []);
assert.deepEqual(planConnectionStages('not-a-template', pairs(3)).length, 3, 'unknown template still plans (default)');

// The matching board knows its pair COUNT before it has ids, so a bare number is
// accepted and produces exactly the same plan as the id list.
assert.deepEqual(planConnectionStages(bridge, 4), planConnectionStages(bridge, pairs(4)));
assert.deepEqual(planConnectionStages(network, 2), ['net-1', 'net-4']);
assert.deepEqual(planConnectionStages(bridge, 0), []);
assert.deepEqual(planConnectionStages(bridge, -3), []);
assert.deepEqual(planConnectionStages(bridge, 2.6).length, 3, 'a fractional count rounds');

// ---- reset ----------------------------------------------------------------
const fresh = resetConnectionProgress(network);
assert.equal(fresh.templateId, 'knowledge-network');
assert.deepEqual(fresh.connectedStageIds, []);
assert.deepEqual(fresh.appliedQuestionIds, []);
assert.equal(fresh.missed, 0);
assert.equal(resetConnectionProgress(undefined).templateId, 'knowledge-network');

// ---- apply: correct earns, wrong does not remove --------------------------
const plan = planConnectionStages(network, pairs(6));
let state = resetConnectionProgress(network);
let result = applyConnectionAnswer(state, network, plan, 0, 'q1', true);
assert.equal(result.stageId, 'net-1');
assert.deepEqual(result.progress.connectedStageIds, ['net-1']);
state = result.progress;

result = applyConnectionAnswer(state, network, plan, 1, 'q2', false);
assert.equal(result.stageId, null);
assert.deepEqual(result.progress.connectedStageIds, ['net-1'], 'a wrong answer must not erase progress');
assert.equal(result.progress.missed, 1);
state = result.progress;

result = applyConnectionAnswer(state, network, plan, 1, 'q2', true);
assert.equal(result.stageId, 'net-2');
assert.deepEqual(result.progress.connectedStageIds, ['net-1', 'net-2']);
state = result.progress;

// ---- idempotency: the same question evaluated twice changes nothing -------
const before = JSON.stringify(state);
const repeated = applyConnectionAnswer(state, network, plan, 1, 'q2', true);
assert.equal(repeated.stageId, null, 'a repeated answer earns nothing');
assert.equal(JSON.stringify(repeated.progress), before, 'a repeated answer changes no field');
assert.equal(state.appliedQuestionIds.length, 2, 'applying results does not mutate the input state');
assert.deepEqual(state.connectedStageIds, ['net-1', 'net-2'], 'input state is not mutated');

// A retry after a wrong answer is not a "repeat": it earns its own stage (the
// play surface lets the player correct themselves instead of locking them out).
const bridgePlan = planConnectionStages(bridge, pairs(4));
const wrongFirst = applyConnectionAnswer(resetConnectionProgress(bridge), bridge, bridgePlan, 0, 'x', false);
assert.equal(wrongFirst.stageId, null);
assert.deepEqual(wrongFirst.progress.wrongQuestionIds, ['x'], 'a wrong question is remembered for feedback');
const retried = applyConnectionAnswer(wrongFirst.progress, bridge, bridgePlan, 0, 'x', true);
assert.equal(retried.stageId, 'bridge-1', 'a retry after a wrong answer still earns the stage');
assert.deepEqual(retried.progress.wrongQuestionIds, ['x'], 'the retry keeps the earlier miss on record');

// ---- counters never exceed the total -------------------------------------
let run = resetConnectionProgress(bridge);
for (let i = 0; i < 4; i += 1) {
  run = applyConnectionAnswer(run, bridge, bridgePlan, i, `p${i + 1}`, true).progress;
}
assert.equal(run.connectedStageIds.length, 4);
const extra = applyConnectionAnswer(run, bridge, bridgePlan, 4, 'q5', true);
assert.equal(extra.alreadyComplete, true, 'a correct answer after completion is flagged, not counted');
assert.equal(extra.progress.connectedStageIds.length, 4, 'the counter never exceeds its total');
assert.equal(connectionSummary(extra.progress, bridge).percent, 100);

// ---- 100 % run always finishes; 0 % run never does ----------------------
for (const template of CONNECTION_TEMPLATES) {
  for (let n = 1; n <= 12; n += 1) {
    const p = planConnectionStages(template, pairs(n));
    let all = resetConnectionProgress(template);
    for (let i = 0; i < n; i += 1) all = applyConnectionAnswer(all, template, p, i, `p${i + 1}`, true).progress;
    assert.equal(isConnectionComplete(all, template), true, `${template.id} with ${n} pairs: all-correct finishes the picture`);
    assert.equal(connectionSummary(all, template).connected, template.stages.length);

    let none = resetConnectionProgress(template);
    for (let i = 0; i < n; i += 1) none = applyConnectionAnswer(none, template, p, i, `p${i + 1}`, false).progress;
    assert.equal(isConnectionComplete(none, template), false, `${template.id} with ${n} pairs: all-wrong leaves it empty`);
    assert.equal(connectionSummary(none, template).connected, 0);
  }
}

// ---- short quiz: leftover stages open only on the last answer ------------
let short = resetConnectionProgress(network);
const shortPlan = planConnectionStages(network, pairs(2)); // net-1, net-4
short = applyConnectionAnswer(short, network, shortPlan, 0, 'a', true).progress;
assert.deepEqual(short.connectedStageIds, ['net-1'], 'the first of two answers opens only its own stage');
const finish = applyConnectionAnswer(short, network, shortPlan, 1, 'b', true);
assert.equal(finish.completedNow, true, 'the last answer completes the picture');
assert.equal(connectionSummary(finish.progress, network).connected, 6, 'a 100 % short run shows every stage');

// A half-finished short run keeps its real progress (update_game.txt §4).
let half = resetConnectionProgress(network);
half = applyConnectionAnswer(half, network, shortPlan, 0, 'a', true).progress;
half = applyConnectionAnswer(half, network, shortPlan, 1, 'b', false).progress;
assert.equal(connectionSummary(half, network).connected, 1, 'an unfinished run keeps exactly what was earned');

// A wrong-then-retried pair must NOT complete a short board. Regression for the
// sweep that counted the plan's length (which includes the '' padding slots), so
// 2 pairs over a 4-stage bridge with one mistake reported an unearned 4/4.
let mistake = resetConnectionProgress(bridge);
const twoPairPlan = planConnectionStages(bridge, 2); // ['bridge-1', 'bridge-3']
mistake = applyConnectionAnswer(mistake, bridge, twoPairPlan, 0, 'a', true).progress;
mistake = applyConnectionAnswer(mistake, bridge, twoPairPlan, 1, 'b', false).progress;
const retry = applyConnectionAnswer(mistake, bridge, twoPairPlan, 1, 'b', true);
assert.equal(retry.completedNow, false, 'a retried pair after a mistake must not complete the board');
assert.equal(connectionSummary(retry.progress, bridge).connected < 4, true,
  `a mistake leaves the picture unfinished (got ${connectionSummary(retry.progress, bridge).connected}/4)`);
// The same run with no mistake still finishes, so the rule did not overcorrect.
let clean = resetConnectionProgress(bridge);
clean = applyConnectionAnswer(clean, bridge, twoPairPlan, 0, 'a', true).progress;
clean = applyConnectionAnswer(clean, bridge, twoPairPlan, 1, 'b', true).progress;
assert.equal(connectionSummary(clean, bridge).connected, 4, 'a clean short run still completes the picture');

// ---- long quiz: the picture finishes before the last question -----------
let long = resetConnectionProgress(bridge);
const longPlan = planConnectionStages(bridge, pairs(6));
let completedAt = -1;
for (let i = 0; i < 6; i += 1) {
  const step = applyConnectionAnswer(long, bridge, longPlan, i, `p${i + 1}`, true);
  long = step.progress;
  if (step.completedNow && completedAt === -1) completedAt = i;
}
assert.equal(completedAt, 3, 'a 6-question bridge finishes on question 4');

// ---- no duplicate event when the same answer is re-evaluated -----------
let dup = resetConnectionProgress(bridge);
let events = 0;
for (let i = 0; i < 4; i += 1) {
  const step = applyConnectionAnswer(dup, bridge, bridgePlan, i, `p${i + 1}`, true);
  dup = step.progress;
  // Same question evaluated again (e.g. a double click or a LAN re-lock).
  const again = applyConnectionAnswer(dup, bridge, bridgePlan, i, `p${i + 1}`, true);
  if (step.stageId) events += 1;
  if (again.stageId) events += 1;
}
assert.equal(events, 4, 'four pairs produce exactly four connection events');

// ---- helpers ------------------------------------------------------------
assert.equal(clampStageCount(99), 8);
assert.equal(clampStageCount(0), 2);
assert.equal(clampStageCount('abc'), 2);
assert.equal(clampStageCount(undefined), 2);

assert.deepEqual(connectionSummary(null, bridge), { connected: 0, total: 4, remaining: 4, completed: false, missed: 0, percent: 0 });
assert.equal(connectionSummary(fresh, 'not-a-template').total, 6, 'an unknown template summarises the default');

console.log('connection-progress: all checks passed');

