/**
 * DECISIONS #351 — the log line is a receipt, not a quota.
 *
 * Quota is counted from `usage_monthly` with compare-and-swap (#343/#348). `ai_usage_log` is
 * the OTHER thing: one line per call, so a teacher who asks "what did this month cost me"
 * can be answered. The two must not be computed from each other.
 *
 * Three rules under test:
 *   - a failed call costs 0 (it was refunded) — logging the deducted number makes the ledger
 *     add up to money nobody paid;
 *   - nothing from the lesson or the generated questions is ever written down;
 *   - writing the log can never break a call the teacher already paid for.
 */
const assert = require('node:assert/strict');
const path = require('node:path');

const DIST = path.join(__dirname, '..', '..', '..', 'dist', 'server');
const { usageLogRow, writeUsageLog } = require(path.join(DIST, 'usage-log.js'));

async function main() {
  const now = new Date('2026-11-25T03:00:00.000Z');

  // 1. Success: the receipt carries the price in the plan's own unit.
  const done = usageLogRow({
    userId: 'u-1',
    status: 'completed',
    kind: 'question_generation',
    model: 'gemini-3.5-flash-lite',
    cost: 2,
    unit: 'credits',
    plan: 'plus',
    questions: 5,
    now,
  });
  assert.equal(done.user_id, 'u-1');
  assert.equal(done.feature, 'question_generation');
  assert.equal(done.model, 'gemini-3.5-flash-lite');
  assert.equal(done.credit_cost, 2);
  assert.equal(done.status, 'completed');
  assert.equal(done.completed_at, '2026-11-25T03:00:00.000Z');
  assert.deepEqual(done.metadata, { unit: 'credits', plan: 'plus', questions: 5 });

  // 2. Failure: cost 0 because the money came back, and the reason is kept.
  const failed = usageLogRow({ userId: 'u-1', status: 'failed', cost: 2, unit: 'credits', plan: 'plus', error: 'gemini_503', now });
  assert.equal(failed.credit_cost, 0, 'a refunded call must not be logged as paid');
  assert.equal(failed.metadata.error, 'gemini_503');
  assert.equal(failed.status, 'failed');

  // 3. Defaults: free tier counts turns, and a missing error is not an empty string.
  const bare = usageLogRow({ userId: 'u-2', status: 'failed', now });
  assert.equal(bare.feature, 'question_generation');
  assert.equal(bare.model, null);
  assert.deepEqual(bare.metadata.unit, 'generations');
  assert.equal(bare.metadata.plan, null);
  assert.equal(bare.metadata.error, 'unknown');

  // 4. Garbage in, sane out: negatives and NaN never reach the column.
  assert.equal(usageLogRow({ userId: 'u', status: 'completed', cost: -3, now }).credit_cost, 0);
  assert.equal(usageLogRow({ userId: 'u', status: 'completed', cost: Number.NaN, now }).credit_cost, 0);
  assert.equal(usageLogRow({ userId: 'u', status: 'completed', questions: -1, now }).metadata.questions, 0);

  // 5. Nothing from the content is in the row — the only free text is a short error code.
  const serialized = JSON.stringify(done);
  assert.ok(!/bài học|Bài học|prompt|options|explanation/u.test(serialized), 'no lesson text in the log');
  assert.ok(serialized.length < 400, `row must stay small, got ${serialized.length}`);

  // 6. A broken sink reports, it does not throw: the paid call has already happened.
  const brokenSink = { from: () => ({ insert: async () => ({ error: { message: 'relation does not exist' } }) }) };
  const reported = await writeUsageLog(brokenSink, done);
  assert.equal(reported.ok, false);
  assert.match(String(reported.reason), /relation does not exist/u);

  const throwingSink = { from: () => ({ insert: async () => { throw new Error('socket hang up'); } }) };
  const caught = await writeUsageLog(throwingSink, done);
  assert.equal(caught.ok, false);
  assert.match(String(caught.reason), /socket hang up/u);

  // 7. A working sink writes exactly the row it was given, to the right table.
  let seen = null;
  const goodSink = {
    from(table) {
      seen = { table };
      return { insert: async row => { seen.row = row; return { error: null }; } };
    },
  };
  const ok = await writeUsageLog(goodSink, done);
  assert.deepEqual(ok, { ok: true });
  assert.equal(seen.table, 'ai_usage_log');
  assert.deepEqual(seen.row, done);

  console.log('server-usage-log: 24 khẳng định đã qua');
}

void main();

export {};
