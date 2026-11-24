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
import { consumeGeneration, quotaLimitFor, MONTH_LIMITS, type QuotaStore } from '../../server/quota';

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
  // 1. Hạn mức theo gói: `plus` chỉ được 100 khi còn `active`.
  assert.equal(quotaLimitFor(null), MONTH_LIMITS.free, 'không có dòng gói ⇒ hạn mức free');
  assert.equal(quotaLimitFor({ plan: 'plus', status: 'active' }), 100, 'plus + active ⇒ 100');
  assert.equal(quotaLimitFor({ plan: 'plus', status: 'past_due' }), MONTH_LIMITS.free, 'plus quá hạn ⇒ free');
  assert.equal(quotaLimitFor({ plan: 'free', status: 'active' }), MONTH_LIMITS.free, 'free ⇒ 5');

  // 2. Lượt đầu tiên: tăng 0 → 1 và báo đúng con số.
  const state: FakeState = { plan: { plan: 'free', status: 'active' }, used: 0, casLosses: 0, bumps: [] };
  const first = await consumeGeneration(fakeStore(state), 'u1', '2026-11');
  assert.equal(first.ok, true, 'còn lượt thì cho qua');
  assert.deepEqual((first as { quota: unknown }).quota, { allowed: true, used: 1, quotaLimit: 5, plan: 'free' }, 'usage tăng đúng một');
  assert.deepEqual(state.bumps, [{ from: 0, to: 1 }], 'đọc 0 rồi đổi 0 → 1');

  // 3. Hết lượt: không ghi gì thêm, và nói ra số đã dùng.
  const full: FakeState = { plan: null, used: 5, casLosses: 0, bumps: [] };
  const blocked = await consumeGeneration(fakeStore(full), 'u1', '2026-11');
  assert.equal(blocked.ok, false, 'hết lượt thì không cho qua');
  assert.equal((blocked as { kind: string }).kind, 'exhausted', 'đúng loại: hết lượt');
  assert.deepEqual((blocked as { quota: unknown }).quota, { allowed: false, used: 5, quotaLimit: 5, plan: 'free' }, 'báo đúng số đã dùng');
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
  const raced: FakeState = { plan: null, used: 5, casLosses: 1, bumps: [] };
  assert.equal(await refundGeneration(fakeStore(raced), 'u1', '2026-11', 2), false, 'giá trị đã khác thì không trừ bừa');
}

void refundChecks();
