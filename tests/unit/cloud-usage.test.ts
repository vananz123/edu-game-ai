/**
 * DECISIONS #350 — the sentence a teacher reads BEFORE pressing a button that spends money.
 *
 * `cloudUsageText()` and `cloudUsageExhausted()` are renderer globals (classic script, no
 * import), so they are measured here by running the COMPILED file in a `vm` — the same
 * artefact the app loads, not a copy.
 *
 * Three rules:
 *   - a correct number with the wrong unit is still the wrong sentence (credits ≠ lượt);
 *   - an exhausted month is said plainly, and the button must not invite a refusal;
 *   - an unreadable `usage` prints NOTHING — "còn NaN lượt" is worse than silence.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const DIST = path.join(__dirname, '..', '..', '..', 'dist', 'src');

async function main() {
  const file = path.join(DIST, 'renderer', 'features', 'cloud-generation.js');
  assert.ok(fs.existsSync(file), 'renderer/features/cloud-generation.js must exist — run npm run build');
  const context = vm.createContext({ console, desktop: { call: async () => ({ ok: true }) } });
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });

  const text = usage => vm.runInContext(`cloudUsageText(${JSON.stringify(usage)})`, context);
  const exhausted = usage => vm.runInContext(`cloudUsageExhausted(${JSON.stringify(usage)})`, context);

  // 1. Free tier: turns.
  assert.equal(
    text({ allowed: true, used: 4, quotaLimit: 5, unit: 'generations' }),
    'Còn 1/5 lượt tạo game trong tháng.'
  );
  // 2. Paid tier: credits, and the number is NOT relabelled as turns.
  assert.equal(
    text({ allowed: true, used: 498, quotaLimit: 500, unit: 'credits' }),
    'Còn 2/500 credits tạo game trong tháng.'
  );
  assert.ok(!/lượt/u.test(text({ allowed: true, used: 1, quotaLimit: 500, unit: 'credits' })), 'credits are not lượt');
  // 3. Exhausted: plain, with the numbers, and the button is disabled.
  assert.equal(
    text({ allowed: false, used: 5, quotaLimit: 5, unit: 'generations' }),
    'Đã hết lượt tạo game của tháng (5/5).'
  );
  assert.equal(exhausted({ allowed: false, used: 5, quotaLimit: 5 }), true);
  // Reaching the limit on the numbers alone is also "done" — the gateway may omit `allowed`.
  assert.equal(exhausted({ used: 5, quotaLimit: 5 }), true);
  assert.equal(exhausted({ used: 4, quotaLimit: 5 }), false);
  // 4. Unreadable input: silence, never a number made of nothing.
  assert.equal(text(null), '');
  assert.equal(text({}), '');
  assert.equal(text({ used: 'x', quotaLimit: null }), '');
  assert.equal(text({ used: 0, quotaLimit: 0 }), '');
  assert.equal(exhausted(null), false, 'no data is not "exhausted"');
  assert.equal(exhausted({ used: 'x', quotaLimit: null }), false, 'unreadable data must not disable the button');

  console.log('cloud-usage: 12 khẳng định đã qua');
}

void main();

export {};
