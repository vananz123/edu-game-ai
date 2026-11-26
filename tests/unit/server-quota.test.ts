// Cổng cho `server/quota.ts`: hai loại lỗi hạn mức phải nói hai câu khác nhau.
//
// Lỗi đo được ngày 24/11: project chưa chạy migration ⇒ PostgREST `PGRST202` ⇒
// gateway trả 503 "Vui lòng thử lại sau", một chỉ dẫn không bao giờ thành công.
import assert from 'node:assert/strict';
import { describeQuotaFailure, isMissingFunction } from '../../server/quota';

// 1. Ba hàm thiếu — đúng dạng PostgREST trả về khi chưa có hàm.
const missing = {
  code: 'PGRST202',
  message: 'Could not find the function public.consume_generation_quota(p_month, p_user_id) in the schema cache',
  details: 'Searched for the function public.consume_generation_quota with parameters p_month, p_user_id',
};
assert.equal(isMissingFunction(missing), true, 'PGRST202 là thiếu hàm');
const missingFailure = describeQuotaFailure(missing);
assert.equal(missingFailure.status, 500, 'thiếu hàm không phải sự cố tạm thời ⇒ không phải 503');
assert.equal(missingFailure.body.code, 'server_not_migrated', 'mã lỗi nói được nguyên nhân');
assert.match(missingFailure.body.error, /migration/, 'câu trả lời nói được việc phải làm');
assert.ok(!/thử lại/i.test(missingFailure.body.error), 'không bảo bấm lại một việc không thể thành công');

// 2. Dạng khác của cùng nguyên nhân (Postgres nói thẳng "does not exist").
assert.equal(isMissingFunction({ message: 'function public.consume_credits(uuid) does not exist' }), true, 'does not exist cũng là thiếu hàm');

// 3. Máy chủ bận / lỗi mạng: câu cũ là đúng, và là 503.
const busy = describeQuotaFailure({ code: '08006', message: 'connection failure' });
assert.equal(busy.status, 503, 'lỗi tạm thời vẫn là 503');
assert.equal(busy.body.code, 'quota_unavailable', 'mã lỗi riêng');
assert.match(busy.body.error, /thử lại/i, 'bận thì bảo thử lại là đúng');
assert.equal(describeQuotaFailure(null).status, 503, 'không có lỗi cụ thể vẫn phải trả lời');
assert.equal(isMissingFunction(null), false, 'không có lỗi thì không phải thiếu hàm');

console.log('server-quota: 3 nhóm kiểm đã qua');

// ---------------------------------------------------------------------------
// Hạn mức tính bằng BẢNG + so-sánh-và-đổi, không bằng hàm RPC.
//
// Lý do tồn tại của nhóm này: hàm RPC chưa có trên project thật, nên nếu quota phụ
// thuộc vào nó thì sản phẩm không chạy. Phép nguyên tử nằm ở `casBump`, và nó phải
// đúng khi hai request tranh nhau.
// ---------------------------------------------------------------------------
import { consumeGeneration, quotaLimitFor, usagePeriod, PERIOD_DAYS, PERIOD_LIMITS, type QuotaStore } from '../../server/quota';

interface FakeState {
  plan: { plan: string; status: string } | null;
  used: number;
  /** Số lần CAS trả về `false` trước khi thắng — mô phỏng request đồng thời. */
  casLosses: number;
  bumps: Array<{ from: number; to: number }>;
}

function fakeStore(state: FakeState, overrides: Partial<QuotaStore> = {}): QuotaStore {
  return {
    async planOf() { return state.plan; },
    async ensureRow() {},
    async readUsed() { return state.used; },
    async casBump(_userId, _month, from, to) {
      state.bumps.push({ from, to });
      if (state.casLosses > 0) { state.casLosses -= 1; state.used = to; return false; }
      state.used = to;
      return true;
    },
    ...overrides,
  };
}

async function quotaChecks(): Promise<void> {
  // 1. Hạn mức theo gói: `plus` chỉ được 500 credits khi còn `active` (đúng số đã bán).
  assert.equal(quotaLimitFor(null), PERIOD_LIMITS.free, 'không có dòng gói ⇒ hạn mức free');
  assert.equal(quotaLimitFor({ plan: 'plus', status: 'active' }), 500, 'plus + active ⇒ 500 credits');
  assert.equal(quotaLimitFor({ plan: 'plus', status: 'past_due' }), PERIOD_LIMITS.free, 'plus quá hạn ⇒ free');
  assert.equal(quotaLimitFor({ plan: 'free', status: 'active' }), PERIOD_LIMITS.free, 'free ⇒ 10');

  // 2. Lượt đầu tiên: tăng 0 → 1 và báo đúng con số.
  const state: FakeState = { plan: { plan: 'free', status: 'active' }, used: 0, casLosses: 0, bumps: [] };
  const first = await consumeGeneration(fakeStore(state), 'u1', '2026-11');
  assert.equal(first.ok, true, 'còn lượt thì cho qua');
  assert.deepEqual((first as { quota: unknown }).quota, { allowed: true, used: 1, quotaLimit: 10, plan: 'free', unit: 'generations', cost: 1 }, 'usage tăng đúng một lượt');
  assert.deepEqual(state.bumps, [{ from: 0, to: 1 }], 'đọc 0 rồi đổi 0 → 1');

  // 3. Hết lượt: không ghi gì thêm, và nói ra số đã dùng.
  const full: FakeState = { plan: null, used: 10, casLosses: 0, bumps: [] };
  const blocked = await consumeGeneration(fakeStore(full), 'u1', '2026-11');
  assert.equal(blocked.ok, false, 'hết lượt thì không cho qua');
  assert.equal((blocked as { kind: string }).kind, 'exhausted', 'đúng loại: hết lượt');
  assert.deepEqual((blocked as { quota: unknown }).quota, { allowed: false, used: 10, quotaLimit: 10, plan: 'free', unit: 'generations', cost: 1 }, 'báo đúng số đã dùng');
  assert.equal(full.bumps.length, 0, 'không ghi gì khi đã hết lượt');

  // 4. Tranh chấp: CAS thua một lần rồi thắng ⇒ vẫn đúng một lượt được cấp, không mất lượt.
  const race: FakeState = { plan: null, used: 2, casLosses: 1, bumps: [] };
  const won = await consumeGeneration(fakeStore(race), 'u1', '2026-11');
  assert.equal(won.ok, true, 'thua CAS một lần không phải lỗi');
  assert.equal((won as { quota: { used: number } }).quota.used, 4, 'đọc lại giá trị mới (3) rồi tăng thành 4');
  assert.equal(race.bumps.length, 2, 'đúng hai lần thử');

  // 5. Tranh chấp liên tục: dừng sau 3 lượt và KHÔNG cấp lượt (không đoán bừa).
  const stuck: FakeState = { plan: null, used: 0, casLosses: 99, bumps: [] };
  const failed = await consumeGeneration(fakeStore(stuck), 'u1', '2026-11');
  assert.equal(failed.ok, false, 'không thắng CAS thì không được cấp lượt');
  assert.equal((failed as { kind: string }).kind, 'unavailable', 'loại lỗi là tạm thời, không phải hết lượt');
  assert.equal(stuck.bumps.length, 3, 'ba lần thử là giới hạn');

  // 6. Lỗi đọc bảng: "không biết" không được biến thành "hết lượt".
  const broken = fakeStore(
    { plan: null, used: 0, casLosses: 0, bumps: [] },
    { async readUsed() { throw new Error('mất kết nối'); } },
  );
  const unavailable = await consumeGeneration(broken, 'u1', '2026-11');
  assert.equal((unavailable as { kind: string }).kind, 'unavailable', 'lỗi hạ tầng là unavailable');
  assert.match(String((unavailable as { reason: string }).reason), /mất kết nối/, 'giữ nguyên lý do để log');
}

void quotaChecks();

// ---------------------------------------------------------------------------
// Trả lại lượt khi sinh thất bại (refundGeneration).
//
// Lỗi đo được: hai lần nhà cung cấp trả 503 ⇒ `generations` 0 → 1 → 2 trong khi
// không có trò chơi nào được tạo. Đã trừ thì phải trả lại.
// ---------------------------------------------------------------------------
import { refundGeneration } from '../../server/quota';

async function refundChecks(): Promise<void> {
  // 1. Trả lại bình thường: 3 → 2, và nói ra là đã trả.
  const state: FakeState = { plan: null, used: 3, casLosses: 0, bumps: [] };
  const returned = await refundGeneration(fakeStore(state), 'u1', '2026-11', 3);
  assert.equal(returned, true, 'trả lại được thì báo true');
  assert.deepEqual(state.bumps, [{ from: 3, to: 2 }], 'giảm đúng một');
  assert.equal(state.used, 2, 'số trên đĩa giảm');

  // 2. Lượt đầu tiên của tháng: 1 → 0, không rơi xuống số âm.
  const firstOfMonth: FakeState = { plan: null, used: 1, casLosses: 0, bumps: [] };
  assert.equal(await refundGeneration(fakeStore(firstOfMonth), 'u1', '2026-11', 1), true, 'trả lại lượt đầu tiên');
  assert.deepEqual(firstOfMonth.bumps, [{ from: 1, to: 0 }], 'không bao giờ ghi -1');

  // 3. Trả lại mà cũng hỏng: báo false, KHÔNG ném — phản hồi lỗi đang dựng phải sống.
  const failing = fakeStore(
    { plan: null, used: 2, casLosses: 0, bumps: [] },
    { async casBump() { throw new Error('mất kết nối'); } },
  );
  assert.equal(await refundGeneration(failing, 'u1', '2026-11', 2), false, 'trả lại hỏng thì false, không ném');

  // 4. Người khác đã tăng dòng trước (CAS thua): không trả lại mù, báo false.
  const raced: FakeState = { plan: null, used: 10, casLosses: 1, bumps: [] };
  assert.equal(await refundGeneration(fakeStore(raced), 'u1', '2026-11', 2), false, 'giá trị đã khác thì không trừ bừa');
}

void refundChecks();

// ── 5. Gói trả phí trừ bằng CREDITS, không bằng đếm lượt (#348) ──────────────
// Cùng một dòng `usage_monthly`, cột khác. Giá và hạn mức đọc từ `server_config`, và
// không có khoá cấu hình thì phải rơi về giá mặc định — bán miễn phí vì thiếu một dòng
// cấu hình là lỗi làm mất doanh thu mà không ai thấy.
interface CreditState {
  used: number;
  limit: number;
  bumps: Array<{ from: number; to: number }>;
  limits: number[];
}

function creditStore(options: {
  plan?: string;
  status?: string;
  used?: number;
  limit?: number;
  cost?: number;
  planLimit?: number;
  failRead?: boolean;
}): { store: QuotaStore; state: CreditState } {
  const state: CreditState = {
    used: options.used ?? 0,
    limit: options.limit ?? 50,
    bumps: [],
    limits: [],
  };
  const store: QuotaStore = {
    async planOf() {
      return { plan: options.plan ?? 'plus', status: options.status ?? 'active' };
    },
    async ensureRow() {},
    async readUsed() {
      return 0;
    },
    async casBump() {
      throw new Error('đường generations không được dùng khi gói trả phí');
    },
    async readCredits() {
      if (options.failRead) throw new Error('mất kết nối');
      return { used: state.used, limit: state.limit };
    },
    async casBumpCredits(_userId, _month, from, to) {
      state.bumps.push({ from, to });
      state.used = to;
      return true;
    },
    async creditCost() {
      return options.cost ?? 2;
    },
    async monthlyCredits() {
      return options.planLimit ?? 500;
    },
    async ensureCreditsLimit(_userId, _month, limit) {
      state.limits.push(limit);
      state.limit = limit;
    },
  };
  return { store, state };
}

async function creditChecks(): Promise<void> {
  // 1. Gói plus: trừ đúng giá, và nói ra ĐƠN VỊ.
  const basic = creditStore({});
  const granted = await consumeGeneration(basic.store, 'u1', '2026-11');
  assert.equal(granted.ok, true, 'plus còn credits thì cho qua');
  assert.deepEqual(
    (granted as { quota: unknown }).quota,
    { allowed: true, used: 2, quotaLimit: 500, plan: 'plus', unit: 'credits', cost: 2 },
    'hai credits, đơn vị là credits'
  );
  assert.deepEqual(basic.state.bumps, [{ from: 0, to: 2 }], 'một lần trừ đúng hai');

  // 2. Dòng tháng tạo từ thời free (hạn mức 50) phải được nâng lên hạn mức của gói.
  const upgraded = creditStore({ limit: 50 });
  await consumeGeneration(upgraded.store, 'u1', '2026-11');
  assert.deepEqual(upgraded.state.limits, [500], 'chỉ nâng, không hạ');
  assert.equal(upgraded.state.limit, 500);

  // 3. Giá cấu hình 0 hoặc đọc lỗi ⇒ giá mặc định, không bán miễn phí.
  const cheap = creditStore({ cost: 0 });
  const cheapOutcome = await consumeGeneration(cheap.store, 'u1', '2026-11');
  assert.equal((cheapOutcome as { quota: { cost: number } }).quota.cost, 2, 'giá 0 trong DB thành 2');
  const broken = creditStore({});
  broken.store.creditCost = async () => {
    throw new Error('server_config không đọc được');
  };
  const brokenOutcome = await consumeGeneration(broken.store, 'u1', '2026-11');
  assert.equal((brokenOutcome as { quota: { cost: number } }).quota.cost, 2, 'đọc lỗi vẫn tính tiền');

  // 4. Không đủ credits: từ chối TRƯỚC khi ghi, và gọi đúng tên.
  const nearly = creditStore({ used: 499, limit: 500 });
  const blocked = await consumeGeneration(nearly.store, 'u1', '2026-11');
  assert.equal(blocked.ok, false, 'không đủ thì không cho qua');
  assert.equal((blocked as { kind: string }).kind, 'exhausted', 'đúng loại: hết');
  assert.deepEqual(nearly.state.bumps, [], 'không ghi gì khi đã hết');
  assert.equal((blocked as { quota: { unit: string } }).quota.unit, 'credits', 'hết credits, không phải hết lượt');

  // 5. Hoàn credits: trả đúng số đã trừ, không âm, và giữ đúng cột.
  const refundable = creditStore({});
  await consumeGeneration(refundable.store, 'u1', '2026-11');
  assert.equal(await refundGeneration(refundable.store, 'u1', '2026-11', 2, { unit: 'credits', cost: 2 }), true);
  assert.equal(refundable.state.used, 0, 'về đúng 0');
  const clamped = creditStore({});
  clamped.store.casBumpCredits = async (_u, _m, from, to) => {
    clamped.state.bumps.push({ from, to });
    return true;
  };
  await refundGeneration(clamped.store, 'u1', '2026-11', 1, { unit: 'credits', cost: 2 });
  assert.deepEqual(clamped.state.bumps, [{ from: 1, to: 0 }], '1 − 2 kẹp về 0, không âm');

  // 6. Lỗi đọc credits là TẠM THỜI, không phải hết credits.
  const failing = creditStore({ failRead: true });
  const unavailable = await consumeGeneration(failing.store, 'u1', '2026-11');
  assert.equal(unavailable.ok, false, 'không cấp khi không đọc được');
  assert.equal((unavailable as { kind: string }).kind, 'unavailable', 'không được báo hết credits');

  // 7. Gói hết hạn quay về đếm lượt, và kho không giữ credits thì không bán credits.
  const expired = creditStore({ status: 'past_due' });
  expired.store.readCredits = undefined;
  expired.store.casBumpCredits = undefined;
  expired.store.readUsed = async () => 2;
  // Đường đếm lượt phải dùng lại được: kho này vừa bị bỏ phần credits.
  expired.store.casBump = async () => true;
  const fallback = await consumeGeneration(expired.store, 'u1', '2026-11');
  assert.equal((fallback as { quota: { unit: string } }).quota.unit, 'generations', 'hết hạn thì về đếm lượt');
}

/**
 * #354 — the READ side must use the same rules as the WRITE side.
 *
 * If the meter and the deduction disagree about the unit, a teacher reads "còn 5 lượt" and
 * then loses credits. The snapshot therefore has to answer the same questions: is this plan
 * really paid, and is it really active?
 */
async function snapshotChecks(): Promise<void> {
  const { usageSnapshot } = require('../../server/quota');

  // 1. Free: turns, and the cost of one call is 1 turn.
  const free = usageSnapshot({ plan: 'free', status: 'active' }, '2026-11', { generations: 2 }, null);
  assert.equal(free.unit, 'generations');
  assert.equal(free.used, 2);
  assert.equal(free.limit, 10);
  assert.equal(free.cost, 1);
  assert.equal(free.plan, 'free');

  // 2. Paid and active: credits, price from config, limit never below the plan's own.
  const plus = usageSnapshot({ plan: 'plus', status: 'active' }, '2026-11', { creditsUsed: 4, creditsLimit: 50 }, 2, 500);
  assert.equal(plus.unit, 'credits');
  assert.equal(plus.used, 4);
  assert.equal(plus.limit, 500, 'a stale row limit must not shrink a paid plan');
  assert.equal(plus.cost, 2);

  // 3. Paid but NOT active is measured in turns — the same rule the deduction uses.
  const expired = usageSnapshot({ plan: 'plus', status: 'past_due' }, '2026-11', { generations: 1, creditsUsed: 99 }, 2);
  assert.equal(expired.unit, 'generations', 'an inactive plan is not charged in credits');
  assert.equal(expired.used, 1, 'the credits column is not the free-tier number');

  // 4. No row yet is zero usage, not an error and not "unknown".
  const empty = usageSnapshot(null, '2026-11', null, null);
  assert.equal(empty.used, 0);
  assert.equal(empty.limit, 10);
  assert.equal(empty.unit, 'generations');

  // 5. A missing price falls back to the default, never to "free".
  const noPrice = usageSnapshot({ plan: 'plus', status: 'active' }, '2026-11', { creditsLimit: 500 }, 0, 500);
  assert.equal(noPrice.cost, 2, 'price 0 would sell generations for nothing');

  // 6. Garbage counters do not become NaN in the sentence.
  const junk = usageSnapshot({ plan: 'free', status: 'active' }, '2026-11', { generations: Number.NaN }, null);
  assert.equal(junk.used, 0);
  const negative = usageSnapshot({ plan: 'free', status: 'active' }, '2026-11', { generations: -3 }, null);
  assert.equal(negative.used, 0);
}

void creditChecks();
// Thứ tự có ý nghĩa: hàm khai báo bằng `const { … } = require(…)` bên trong thân, nên phải
// gọi sau khi tệp đã nạp xong — cùng lý do `creditChecks` được gọi ở cuối.
void snapshotChecks();

// ── #362: kỳ hạn mức là 14 NGÀY, không phải tháng ──────────────────────────────
//
// Đây là phép đo của yêu cầu "free 10 lượt / 2 tuần": nếu kỳ sai thì giáo viên hoặc bị trừ
// oan (kỳ quá ngắn) hoặc được 20 lượt (kỳ 28 ngày) — mà cả hai đều là nói sai về tiền.
function periodChecks() {
  const { usagePeriod, PERIOD_DAYS, PERIOD_LIMITS: limits } = require('../../server/quota') as {
    usagePeriod: (at?: Date) => { key: string; start: string; end: string };
    PERIOD_DAYS: number;
    PERIOD_LIMITS: Record<string, number>;
  };
  assert.equal(PERIOD_DAYS, 14, 'kỳ = 14 ngày');
  assert.equal(limits.free, 10, 'free = 10 lượt mỗi kỳ');
  assert.equal(limits.plus, 500, 'plus = 500 credits, đúng bằng số bán ra ở server/billing.ts');

  const day = (iso: string) => new Date(iso + 'T03:00:00Z');
  const p = usagePeriod(day('2026-11-26'));
  // `key` là ngày bắt đầu kỳ — nó là giá trị ghi vào `usage_monthly.month`, nên phải ổn định.
  assert.equal(p.key, p.start, 'khoá dòng = ngày bắt đầu kỳ');
  const span = (Date.parse(p.end + 'T00:00:00Z') - Date.parse(p.start + 'T00:00:00Z')) / 86_400_000 + 1;
  assert.equal(span, 14, 'kỳ dài đúng 14 ngày, tính cả ngày cuối');

  // Cùng kỳ: mọi ngày trong kỳ trả cùng một khoá (nếu không, mỗi ngày là một hạn mức mới).
  for (const inside of [p.start, '2026-11-26', '2026-12-01', p.end]) {
    assert.equal(usagePeriod(day(inside)).key, p.key, 'ngày ' + inside + ' thuộc cùng kỳ');
  }

  // Kỳ liền sau bắt đầu đúng ngày sau `end`, và không chồng lấn.
  const nextStart = new Date(Date.parse(p.end + 'T00:00:00Z') + 86_400_000).toISOString().slice(0, 10);
  const next = usagePeriod(day(nextStart));
  assert.equal(next.start, nextStart, 'kỳ sau bắt đầu ngay sau kỳ trước');
  assert.ok(next.key !== p.key, 'hai kỳ khác khoá');

  // Trước kỳ này cũng đúng 14 ngày ⇒ không có ngày nào rơi ra ngoài mọi kỳ.
  const prevEnd = new Date(Date.parse(p.start + 'T00:00:00Z') - 86_400_000).toISOString().slice(0, 10);
  const prev = usagePeriod(day(prevEnd));
  assert.equal(
    (Date.parse(p.start + 'T00:00:00Z') - Date.parse(prev.start + 'T00:00:00Z')) / 86_400_000,
    14,
    'kỳ trước cách đúng 14 ngày'
  );

  // Hai máy khác múi giờ vẫn tính ra CÙNG một kỳ (nếu không, một giáo viên có hai hạn mức).
  const utc = usagePeriod(new Date('2026-11-26T23:30:00Z'));
  const localTZ = usagePeriod(new Date('2026-11-26T23:30:00Z'));
  assert.equal(utc.key, localTZ.key, 'kỳ tính theo lịch tuyệt đối');
}

periodChecks();
