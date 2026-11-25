/**
 * DECISIONS #352 — the log a teacher can read, in their own unit.
 *
 * Two things can go wrong here and both are about money:
 *   - "1 lượt" and "2 credits" are different prices (#348), so the unit must travel with
 *     the number all the way into the sentence;
 *   - an EMPTY log and an UNREADABLE log are different states. If both render "no rows",
 *     the app tells a teacher they spent nothing when it simply does not know.
 *
 * Measured on the COMPILED file (classic script, no import), so the test and the app read
 * the same artefact.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const DIST = path.join(__dirname, '..', '..', '..', 'dist', 'src');

async function main() {
  const file = path.join(DIST, 'renderer', 'features', 'account.js');
  assert.ok(fs.existsSync(file), 'renderer/features/account.js must exist — run npm run build');
  // `escapeHtml`/`uiIcon` come from other classic scripts in the app; the panel under test
  // needs only the escaping one, so the harness supplies the same semantics (not a copy of
  // the function under test).
  const escapeHtml = value => String(value == null ? '' : value)
    .replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;');
  const context = vm.createContext({
    console,
    escapeHtml,
    document: { querySelector: () => null },
    desktop: { call: async () => null },
  });
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });

  const line = row => vm.runInContext(`accountUsageLine(${JSON.stringify(row)})`, context);
  const day = at => vm.runInContext(`accountUsageDay(${JSON.stringify(at)})`, context);

  // 1. A successful free-tier call: date, count, unit.
  assert.equal(
    line({ status: 'completed', unit: 'generations', cost: 1, questions: 3, at: '2026-11-25T04:00:00.000Z' }),
    '25/11 · 3 câu · -1 lượt'
  );
  // 2. A paid call is priced in credits, and never relabelled as turns.
  assert.equal(
    line({ status: 'completed', unit: 'credits', cost: 2, questions: 5, at: '2026-11-25T04:00:00.000Z' }),
    '25/11 · 5 câu · -2 credits'
  );
  // 3. A failed call says it was not charged — that is the whole point of logging it.
  assert.equal(
    line({ status: 'failed', unit: 'generations', cost: 0, questions: 0, error: 'gemini_404', at: '2026-11-25T04:10:00.000Z' }),
    '25/11 · lần gọi hỏng · không trừ · (gemini_404)'
  );
  // 4. Zero cost on a completed row is still said out loud, not silently dropped.
  assert.equal(
    line({ status: 'completed', unit: 'generations', cost: 0, questions: 1, at: '2026-11-25T04:00:00.000Z' }),
    '25/11 · 1 câu · không trừ'
  );
  // 5. Garbage never prints NaN/undefined; a missing date is simply absent.
  assert.equal(line({ status: 'completed', cost: Number.NaN, questions: 'x' }), 'đã tạo · không trừ');
  assert.equal(line(null), '');
  assert.equal(line({}), 'đã tạo · không trừ');
  // 6. Dates: only a real ISO prefix becomes a day.
  assert.equal(day('2026-11-25T04:00:00Z'), '25/11');
  assert.equal(day(''), '');
  assert.equal(day('25/11'), '');
  assert.equal(day(null), '');

  // 7. Empty log vs unreadable log must render differently.
  vm.runInContext('accountState.history = { ok: true, rows: [] }', context);
  const empty = vm.runInContext('accountUsageHistoryHtml()', context);
  assert.match(empty, /data-account-usage="empty"/u);
  assert.match(empty, /chưa có lần gọi AI nào/u);
  vm.runInContext(`accountState.history = { ok: false, rows: [], code: 'network_error', message: 'timeout' }`, context);
  const broken = vm.runInContext('accountUsageHistoryHtml()', context);
  assert.match(broken, /data-account-usage="error"/u);
  assert.match(broken, /không phải kết luận là tháng này bạn chưa dùng gì/u);
  assert.ok(!/chưa có lần gọi AI nào/u.test(broken), 'an unreadable log must not claim zero usage');

  // 8. Rows render in order, each carrying its own status.
  vm.runInContext(`accountState.history = { ok: true, rows: [
    { status: 'completed', unit: 'generations', cost: 1, questions: 3, at: '2026-11-25T04:00:00.000Z' },
    { status: 'failed', unit: 'generations', cost: 0, questions: 0, error: 'gemini_503', at: '2026-11-24T04:00:00.000Z' }
  ] }`, context);
  const ready = vm.runInContext('accountUsageHistoryHtml()', context);
  assert.match(ready, /data-account-usage="ready"/u);
  assert.match(ready, /2 lần gần nhất/u);
  assert.equal((ready.match(/data-account-usage-row="completed"/gu) || []).length, 1);
  assert.equal((ready.match(/data-account-usage-row="failed"/gu) || []).length, 1);
  assert.ok(ready.indexOf('25/11') < ready.indexOf('24/11'), 'newest first');
  // 9. Nothing from the lesson can appear: the row has no field for it.
  assert.ok(!/nội dung bài|prompt/iu.test(ready), 'no lesson text in the log UI');

  console.log('account-usage: 22 khẳng định đã qua');
}

void main();

export {};
