// #364 — luật của đồng tiền: giá, hạn, và "webhook nào được mở Pro".
//
// Những khẳng định dưới đây là những câu ta KHÔNG được phép trả lời sai, vì mỗi câu sai là
// tiền của một giáo viên: mở Pro khi chưa có tiền, không mở Pro khi tiền đã tới, thu thiếu
// mà vẫn mở gói, hoặc đóng gói của người đang dùng.
import assert from 'node:assert/strict';
import {
  PAID_PLAN,
  DEFAULT_PRO_PRICE_VND,
  ORDER_TTL_MINUTES,
  applyPaidOrder,
  billingConfig,
  effectiveOrderStatus,
  effectivePlan,
  nextPeriodEnd,
  orderCodeFor,
  orderExpiry,
  orderMessage,
  payosSignData,
  periodLabel,
  signaturesEqual,
  webhookVerdict,
  type SubscriptionRow,
} from '../../server/billing.js';

const NOW = new Date('2026-11-26T09:00:00.000Z');
const inDays = (days: number) => new Date(NOW.getTime() + days * 86_400_000);

// 1. Một chỗ duy nhất nói giá và kỳ hạn.
{
  const bare = billingConfig({});
  assert.equal(bare.priceVnd, DEFAULT_PRO_PRICE_VND, 'không cấu hình thì vẫn có giá mặc định');
  assert.deepEqual(bare.missing, ['EDUGAME_BILLING_PROVIDER'], 'chưa chọn nhà cung cấp là một trạng thái có tên');

  const payos = billingConfig({ EDUGAME_BILLING_PROVIDER: 'payos', PAYOS_CLIENT_ID: 'c', PAYOS_API_KEY: 'a' });
  assert.equal(payos.provider, 'payos');
  assert.deepEqual(payos.missing, ['PAYOS_CHECKSUM_KEY'], 'thiếu khoá chữ ký thì phải nói đúng tên biến thiếu');

  const ready = billingConfig({
    EDUGAME_BILLING_PROVIDER: 'payos',
    PAYOS_CLIENT_ID: 'c',
    PAYOS_API_KEY: 'a',
    PAYOS_CHECKSUM_KEY: 'k',
    EDUGAME_PRO_PRICE_VND: '149000',
    EDUGAME_PRO_PERIOD_DAYS: '30',
  });
  assert.deepEqual(ready.missing, [], 'đủ cấu hình thì không còn gì thiếu');
  assert.equal(ready.priceVnd, 149000, 'giá đọc từ env khi có');
  assert.equal(ready.periodDays, 30, 'kỳ hạn đọc từ env khi có');

  const bogus = billingConfig({ EDUGAME_BILLING_PROVIDER: 'momo', EDUGAME_PRO_PRICE_VND: '-5' });
  // #364: chưa/không cấu hình thì provider là `none`. Trước đây là `fake`, nghĩa là một máy
  // chủ quên cấu hình lại tự nhận đang chạy chế độ giả lập — đúng cái không được xảy ra.
  assert.equal(bogus.provider, 'none', 'nhà cung cấp lạ KHÔNG được coi là đã cấu hình');
  assert.equal(bogus.priceVnd, DEFAULT_PRO_PRICE_VND, 'giá âm không được thành giá bán');
  assert.deepEqual(bogus.missing, ['EDUGAME_BILLING_PROVIDER']);
}

// 2. Đơn chờ quá hạn phải được ĐỌC là hết hạn, dù DB còn ghi `pending`.
{
  const created = NOW;
  const expires = orderExpiry(created);
  assert.equal(expires.getTime() - created.getTime(), ORDER_TTL_MINUTES * 60_000, 'hạn đơn đúng số phút đã hứa');
  assert.equal(effectiveOrderStatus({ status: 'pending', expiresAt: expires }, new Date(expires.getTime() - 1000)), 'pending');
  assert.equal(effectiveOrderStatus({ status: 'pending', expiresAt: expires }, expires), 'expired', 'chạm hạn là hết hạn');
  assert.equal(effectiveOrderStatus({ status: 'paid', expiresAt: expires }, inDays(3)), 'paid', 'đơn đã trả không bị đổi thành hết hạn');
  assert.equal(effectiveOrderStatus({ status: 'pending', expiresAt: null }, inDays(3)), 'pending', 'đơn không có hạn thì vẫn chờ');
}

// 3. Mua lần đầu: Pro bắt đầu từ LÚC TRẢ TIỀN, và hạn = now + kỳ.
{
  const sub = applyPaidOrder(null, { provider: 'payos', providerRef: 'REF1', amountVnd: 99000, paidAt: NOW }, 14);
  assert.equal(sub.plan, PAID_PLAN);
  assert.equal(sub.status, 'active');
  assert.equal(sub.periodEnd!.toISOString(), inDays(14).toISOString());
  assert.equal(sub.providerRef, 'REF1');
  assert.equal(sub.priceVnd, 99000);
}

// 4. Gia hạn khi đang còn hạn: cộng dồn, không mất phần còn lại.
{
  const current: SubscriptionRow = {
    plan: 'plus',
    status: 'active',
    periodEnd: inDays(5),
    provider: 'payos',
    providerRef: 'REF1',
    priceVnd: 99000,
  };
  const renewed = applyPaidOrder(current, { provider: 'payos', providerRef: 'REF2', amountVnd: 99000, paidAt: NOW }, 14);
  assert.equal(renewed.periodEnd!.toISOString(), inDays(19).toISOString(), 'kỳ mới nối tiếp kỳ cũ, không ghi đè');
  assert.equal(renewed.providerRef, 'REF2');

  const late = applyPaidOrder(
    { ...current, periodEnd: inDays(-3) },
    { provider: 'payos', providerRef: 'REF3', amountVnd: 99000, paidAt: NOW },
    14
  );
  assert.equal(late.periodEnd!.toISOString(), inDays(14).toISOString(), 'gói đã hết hạn thì tính lại từ hôm nay');

  assert.equal(nextPeriodEnd({ plan: 'free', status: 'active', periodEnd: null }, NOW, 14).toISOString(), inDays(14).toISOString());
}

// 5. Gói đang có hiệu lực: hết hạn thì là free, kể cả khi cột `plan` còn ghi `plus`.
{
  assert.deepEqual(effectivePlan(null, NOW), { plan: 'free', status: 'inactive' });
  assert.deepEqual(effectivePlan({ plan: 'plus', status: 'active', periodEnd: inDays(1) }, NOW), { plan: 'plus', status: 'active' });
  assert.deepEqual(effectivePlan({ plan: 'plus', status: 'active', periodEnd: inDays(-1) }, NOW), { plan: 'free', status: 'expired' });
  assert.deepEqual(effectivePlan({ plan: 'plus', status: 'past_due', periodEnd: inDays(9) }, NOW), { plan: 'free', status: 'past_due' });
  assert.deepEqual(
    effectivePlan({ plan: 'plus', status: 'active', periodEnd: null }, NOW),
    { plan: 'plus', status: 'active' },
    'hàng Pro cũ (chưa có period_end) không bị hạ gói bởi một cột mới'
  );
}

// 6. Webhook: chỉ đúng chữ ký, đúng tiền, đúng trạng thái mới mở Pro.
{
  const ok = {
    signatureOk: true,
    providerStatus: 'PAID',
    paidAmount: 99000,
    orderAmount: 99000,
    providerRef: 'REF1',
    paidAt: NOW,
  };
  const verdict = webhookVerdict(ok);
  assert.equal(verdict.kind, 'activate');
  assert.equal(verdict.kind === 'activate' ? verdict.providerRef : '', 'REF1');

  const reasons = [
    [{ ...ok, signatureOk: false }, 'signature'],
    [{ ...ok, providerStatus: 'PENDING' }, 'not_paid'],
    [{ ...ok, providerStatus: 'CANCELLED' }, 'not_paid'],
    [{ ...ok, paidAmount: 9900 }, 'amount_mismatch'],
    [{ ...ok, paidAmount: 199000 }, 'amount_mismatch'],
    [{ ...ok, paidAmount: null }, 'amount_mismatch'],
    [{ ...ok, providerRef: null }, 'unknown_order'],
    [{ ...ok, orderAmount: null }, 'unknown_order'],
  ] as const;
  for (const [input, expected] of reasons) {
    const got = webhookVerdict(input as Parameters<typeof webhookVerdict>[0]);
    assert.equal(got.kind, 'ignore', `phải bỏ qua: ${expected}`);
    assert.equal(got.kind === 'ignore' ? got.reason : '', expected);
  }
}

// 7. Chuỗi ký của PayOS: sắp theo key, bỏ rỗng, và so sánh không thoát sớm.
{
  const data = payosSignData({ amount: 99000, orderCode: 1732600000, description: 'Pro 1 ky', cancelUrl: '', extra: undefined });
  assert.equal(data, 'amount=99000&description=Pro 1 ky&orderCode=1732600000', 'key sắp xếp, giá trị rỗng bị bỏ');
  assert.equal(payosSignData({}), '', 'không có trường nào thì chuỗi rỗng');

  assert.equal(signaturesEqual('ABCD', 'abcd'), true);
  assert.equal(signaturesEqual('abcd', 'abce'), false);
  assert.equal(signaturesEqual('', ''), false, 'hai chữ ký rỗng không phải là một chữ ký hợp lệ');
  assert.equal(signaturesEqual('abc', 'abcd'), false, 'độ dài khác là khác');
}

// 8. Câu nói với giáo viên, và số đơn.
{
  assert.match(orderMessage('pending', 99000, null), /99\.000đ/u);
  assert.match(orderMessage('pending', 99000, null), /Đang chờ/u);
  assert.match(orderMessage('expired', 99000, null), /hết hạn/u);
  assert.match(orderMessage('failed', 99000, null), /Chưa có khoản nào bị trừ/u);

  const a = orderCodeFor(NOW, 1);
  const b = orderCodeFor(NOW, 2);
  assert.equal(Number.isInteger(a), true);
  assert.notEqual(a, b, 'hai đơn trong cùng một giây phải khác mã');
  assert.equal(periodLabel(new Date('2026-11-20T00:00:00Z'), new Date('2026-12-03T00:00:00Z')), '20/11 – 03/12');
}

console.log('server-billing: 8 nhóm khẳng định đã qua');
