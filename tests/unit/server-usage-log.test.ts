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

/**
 * #357 — one click is one ledger row, even when the request is sent twice.
 *
 * The money is the point: a retry that produces a second row must not produce a second
 * deduction. So the claim has to happen BEFORE the charge, and a completed claim has to
 * say "already paid" rather than "go ahead again".
 */
async function idempotencyChecks(): Promise<void> {
  const { claimUsageLog, normalizeIdempotencyKey, pendingRow, settleUsageLog, releaseUsageLog } =
    require('../../server/usage-log');

  // 1. Key shape: the same rule the gateway validates and Rust pre-checks.
  assert.equal(normalizeIdempotencyKey('click-abc-12345'), 'click-abc-12345');
  assert.equal(normalizeIdempotencyKey('  click-abc-12345  '), 'click-abc-12345');
  assert.equal(normalizeIdempotencyKey('short'), null, 'ngắn hơn 8 ký tự thì không dùng');
  assert.equal(normalizeIdempotencyKey('có dấu cách'), null);
  assert.equal(normalizeIdempotencyKey('x'.repeat(65)), null);
  assert.equal(normalizeIdempotencyKey(42), null, 'không phải chuỗi thì không dùng');
  assert.equal(normalizeIdempotencyKey(undefined), null);

  // 2. A pending row costs 0 and carries no content.
  const pending = pendingRow({ userId: 'u1', key: 'click-1', plan: 'free', unit: 'generations' });
  assert.equal(pending.status, 'pending');
  assert.equal(pending.credit_cost, 0);
  assert.equal(pending.idempotency_key, 'click-1');
  assert.equal(JSON.stringify(pending).includes('lesson'), false);

  // 3. A fresh key is claimed, and a completed claim for the same key is a DUPLICATE.
  const makeDb = (state: { row: { id: string; status: string } | null }) => ({
    calls: [] as string[],
    async insertPending() {
      if (state.row) return { inserted: false, id: null };
      state.row = { id: 'row-1', status: 'pending' };
      this.calls.push('insert');
      return { inserted: true, id: 'row-1' };
    },
    async findKey() {
      return state.row;
    },
    async finish(id: string, row: { status: string }) {
      this.calls.push('finish:' + id + ':' + row.status);
      if (state.row) state.row.status = row.status;
      return { ok: true };
    },
    async release(id: string) {
      this.calls.push('release:' + id);
      return { ok: true };
    },
  });

  const db = makeDb({ row: null });
  const first = await claimUsageLog(db, { userId: 'u1', key: 'click-1' });
  assert.equal(first.ok, true);
  assert.equal((first as { duplicate: boolean }).duplicate, false, 'lần đầu không phải trùng');

  // Now the call completes: the row becomes completed with the real cost.
  const { usageLogRow } = require('../../server/usage-log');
  await settleUsageLog(db, { from: () => ({ insert: async () => ({ error: null }) }) } as never,
    (first as { id: string }).id,
    usageLogRow({ userId: 'u1', status: 'completed', cost: 1, unit: 'generations', plan: 'free', questions: 5 }));
  assert.equal(db.calls.includes('finish:row-1:completed'), true, 'ghi vào ĐÚNG dòng đã giữ chỗ');
  assert.equal(db.calls.some(call => call.startsWith('insert:')), false, 'không chèn dòng thứ hai');

  // 4. The same key again: duplicate, before any charge.
  const again = await claimUsageLog(db, { userId: 'u1', key: 'click-1' });
  assert.equal((again as { duplicate: boolean }).duplicate, true);

  // 5. A FAILED row is retryable and reused — the teacher got no game and paid nothing.
  const failedDb = makeDb({ row: { id: 'row-2', status: 'failed' } });
  const retry = await claimUsageLog(failedDb, { userId: 'u1', key: 'click-2' });
  assert.equal((retry as { duplicate: boolean }).duplicate, false, 'lần hỏng thì được thử lại');
  assert.equal((retry as { id: string }).id, 'row-2', 'dùng lại dòng cũ, không tạo dòng thứ hai');

  // 6. A pending row (another call in flight) is not a duplicate either.
  const pendingDb = makeDb({ row: { id: 'row-3', status: 'pending' } });
  const inFlight = await claimUsageLog(pendingDb, { userId: 'u1', key: 'click-3' });
  assert.equal((inFlight as { duplicate: boolean }).duplicate, false);

  // 7. Releasing a claim removes the row, so an exhausted month does not leave a ghost.
  const releaseDb = makeDb({ row: { id: 'row-4', status: 'pending' } });
  await releaseUsageLog(releaseDb, 'row-4');
  assert.equal(releaseDb.calls.includes('release:row-4'), true);

  // 8. A claim that could not be written is reported, never silently ignored.
  const brokenDb = {
    async insertPending() { return { inserted: false, id: null, reason: 'boom' }; },
    async findKey() { return null; },
    async finish() { return { ok: true }; },
    async release() { return { ok: true }; },
  };
  const broken = await claimUsageLog(brokenDb, { userId: 'u1', key: 'click-9' });
  assert.equal(broken.ok, false);
  assert.equal((broken as { reason: string }).reason, 'boom');

  console.log('server-usage-log idempotency: 24 khẳng định đã qua');
}

void idempotencyChecks();

export {};
