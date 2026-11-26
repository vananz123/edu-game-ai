/**
 * #366 — cổng VNPay. Ba chỗ sai đều nói về TIỀN, nên mỗi chỗ có một khẳng định riêng:
 *   1. chữ ký phải ký trên giá trị ĐÃ URL-ENCODE (dấu cách → `+`); ký trên giá trị thô thì
 *      VNPay từ chối mọi đơn, vì mô tả đơn nào cũng có dấu cách;
 *   2. `vnp_Amount` là số tiền NHÂN 100 — quên nhân là bán 99.000đ với giá 990đ;
 *   3. chỉ `vnp_ResponseCode` VÀ `vnp_TransactionStatus` cùng `00` mới là đã trả tiền.
 *
 * Đo trên tệp đã biên dịch, nên test và gateway chạy cùng một mã.
 */
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

const PROVIDER = '../../server/billing-provider.js';
const BILLING = '../../server/billing.js';
const HANDLER = '../../worker/index.js';

const SECRET = 'vnpay-secret-for-tests';
const sign512 = (data: string, secret = SECRET) => createHmac('sha512', secret).update(data).digest('hex');

function queryOf(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of new URL(url).searchParams.entries()) out[key] = value;
  return out;
}

function ipnQuery(params: Record<string, string>, secret = SECRET): string {
  const { vnpaySignData } = require(PROVIDER);
  const data = vnpaySignData(params);
  const signature = sign512(data, secret);
  return new URLSearchParams({ ...params, vnp_SecureHashType: 'HmacSHA512', vnp_SecureHash: signature }).toString();
}

type Order = {
  userId: string;
  providerRef: string;
  provider: string;
  amountVnd: number;
  status: 'pending' | 'paid' | 'expired' | 'failed';
  checkoutUrl: string | null;
  expiresAt: Date | null;
  createdAt: Date;
};

function fakeDb(order: Order | null) {
  const state = { order, sub: null as null | { plan: string; status: string; periodEnd: Date | null; provider: string | null; providerRef: string | null; priceVnd: number | null } };
  return {
    state,
    db: {
      async subscriptionOf() {
        return state.sub;
      },
      async saveSubscription(_userId: string, row: typeof state.sub) {
        state.sub = row;
      },
      async createOrder() {},
      async orderByRef(ref: string) {
        return state.order && state.order.providerRef === ref ? state.order : null;
      },
      async latestOrder() {
        return state.order;
      },
      async markPaid(ref: string) {
        if (!state.order || state.order.providerRef !== ref || state.order.status !== 'pending') return false;
        state.order.status = 'paid';
        return true;
      },
    },
  };
}

function workerEnv(extra: Record<string, string> = {}) {
  return {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'anon',
    SUPABASE_SERVICE_ROLE_KEY: 'service',
    GEMINI_API_KEY: 'gemini',
    GATEWAY_VERSION: '0.5.6',
    EDUGAME_BILLING_PROVIDER: 'vnpay',
    VNPAY_TMN_CODE: 'EDUGAME01',
    VNPAY_HASH_SECRET: SECRET,
    EDUGAME_PUBLIC_URL: 'https://gateway.test',
    ...extra,
  } as never;
}

const NOW = new Date('2026-11-26T09:00:00.000Z');

async function main() {
  const provider = (await import(PROVIDER)) as typeof import('../../server/billing-provider.js');
  const billing = (await import(BILLING)) as typeof import('../../server/billing.js');
  const { default: handler } = (await import(HANDLER)) as { default: { handle: Function } };

  // 1. Encode kiểu PHP: dấu cách thành `+`.
  assert.equal(provider.vnpayEncode('EduGame Pro 14 ngay'), 'EduGame+Pro+14+ngay');
  assert.equal(provider.vnpayEncode('a(b)'), 'a%28b%29');

  // 2. Chuỗi ký: sắp xếp a→z, bỏ `vnp_SecureHash`, encode cả key lẫn value.
  const signData = provider.vnpaySignData({ vnp_B: 'x y', vnp_A: '1', vnp_SecureHash: 'zzz', other: 'bỏ qua' });
  assert.equal(signData, 'vnp_A=1&vnp_B=x+y');

  // 3. URL thanh toán: đủ tham số, tiền nhân 100, và chữ ký tự kiểm lại được.
  const url = await provider.vnpayCheckoutUrl({
    base: provider.VNPAY_DEFAULT_URL,
    secret: SECRET,
    sign: async (data, secret) => sign512(data, secret),
    params: {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: 'EDUGAME01',
      vnp_Locale: 'vn',
      vnp_CurrCode: 'VND',
      vnp_TxnRef: '1732600000',
      vnp_OrderInfo: 'EduGame Pro 14 ngay',
      vnp_OrderType: 'other',
      vnp_Amount: '9900000',
      vnp_ReturnUrl: 'https://gateway.test/v1/billing/done',
      vnp_CreateDate: provider.vnpayTime(NOW),
    },
  });
  assert.match(url, /^https:\/\/sandbox\.vnpayment\.vn\/paymentv2\/vpcpay\.html\?/u);
  const params = queryOf(url);
  assert.equal(params.vnp_Amount, '9900000', '99.000đ phải được gửi là 9.900.000');
  assert.equal(params.vnp_TxnRef, '1732600000');
  assert.equal(params.vnp_CreateDate, '20261126160000', 'giờ Việt Nam, không phải UTC');
  assert.equal(params.vnp_OrderInfo, 'EduGame Pro 14 ngay');
  assert.ok(provider.vnpaySignatureOk(params, sign512(provider.vnpaySignData(params))), 'chữ ký trong URL phải tự kiểm được');
  assert.equal(provider.vnpaySignatureOk(params, sign512(provider.vnpaySignData(params), 'khoá-khác')), false, 'khoá sai phải bị từ chối');

  // 4. Sửa một chữ số tiền là chữ ký hỏng — đây là toàn bộ lý do có chữ ký.
  //
  // Cách đo phải giống cách kẻ tấn công: giữ NGUYÊN `vnp_SecureHash` cũ, chỉ đổi `vnp_Amount`.
  // Bên nhận tự tính lại chữ ký từ chính tham số nhận được, nên hai bên lệch nhau.
  const tampered = { ...params, vnp_Amount: '990000' };
  const recomputedFromTampered = sign512(provider.vnpaySignData(tampered));
  assert.notEqual(recomputedFromTampered, params.vnp_SecureHash, 'chữ ký tự tính phải khác chữ ký cũ');
  assert.equal(provider.vnpaySignatureOk(tampered, recomputedFromTampered), false, 'chữ ký cũ không được khớp với dữ liệu đã sửa');
  assert.equal(provider.vnpaySignatureOk(params, sign512(provider.vnpaySignData(params))), true, 'bản không sửa vẫn phải khớp');

  // 5. IPN: hai mã phải cùng `00`; thiếu `TransactionStatus` là CHƯA trả tiền.
  const paid = provider.vnpayWebhookFields({
    vnp_TxnRef: '1732600000', vnp_Amount: '9900000', vnp_ResponseCode: '00', vnp_TransactionStatus: '00', vnp_PayDate: '20261126161500',
  });
  assert.equal(paid.providerStatus, 'PAID');
  assert.equal(paid.amountVnd, 99000, 'amount phải được chia 100 về đồng');
  assert.equal(paid.paidAt && paid.paidAt.toISOString(), '2026-11-26T09:15:00.000Z');
  for (const [code, status] of [['00', '02'], ['24', '01'], ['', ''], ['00', '']] as const) {
    const hook = provider.vnpayWebhookFields({ vnp_TxnRef: '1', vnp_Amount: '9900000', vnp_ResponseCode: code, vnp_TransactionStatus: status });
    assert.equal(hook.providerStatus, 'NOT_PAID', `ResponseCode=${code} TransactionStatus=${status} không được coi là đã trả`);
  }

  // 6. Cấu hình: thiếu hai biến thì tên chúng xuất hiện, và provider vẫn là `vnpay`.
  const partial = billing.billingConfig({ EDUGAME_BILLING_PROVIDER: 'vnpay' });
  assert.deepEqual(partial.missing, ['VNPAY_TMN_CODE', 'VNPAY_HASH_SECRET']);
  assert.equal(partial.provider, 'vnpay');
  const ready = billing.billingConfig({ EDUGAME_BILLING_PROVIDER: 'vnpay', VNPAY_TMN_CODE: 'X', VNPAY_HASH_SECRET: 'Y' });
  assert.deepEqual(ready.missing, []);
  assert.equal(billing.billingConfig({}).provider, 'none');

  // 7. IPN chạy qua HANDLER THẬT (không có token người dùng): tốt → 00 + gói lên plus.
  const order: Order = {
    userId: 'user-1',
    providerRef: '1732600000',
    provider: 'vnpay',
    amountVnd: 99000,
    status: 'pending',
    checkoutUrl: 'https://sandbox.vnpayment.vn/x',
    expiresAt: new Date(NOW.getTime() + 900_000),
    createdAt: NOW,
  };
  const good = { vnp_TxnRef: '1732600000', vnp_Amount: '9900000', vnp_ResponseCode: '00', vnp_TransactionStatus: '00', vnp_PayDate: '20261126161500' };
  const store = fakeDb(order);
  const callIpn = (search: string, db = store.db) =>
    handler.handle(
      new Request('https://gateway.test/v1/billing/webhook/vnpay?' + search, { method: 'GET' }),
      workerEnv(),
      { db: () => db, now: () => NOW }
    );

  const accepted = await callIpn(ipnQuery(good));
  assert.equal(accepted.status, 200);
  assert.deepEqual(await accepted.json(), { RspCode: '00', Message: 'Confirm Success' });
  assert.equal(store.state.sub && store.state.sub.plan, 'plus', 'IPN hợp lệ phải mở gói');
  assert.equal(order.status, 'paid');

  // Gửi lại: không cộng thêm kỳ, và báo đúng mã "đã xác nhận".
  const replay = await callIpn(ipnQuery(good));
  assert.deepEqual(await replay.json(), { RspCode: '02', Message: 'Order already confirmed' });

  // Chữ ký sai: 97 và KHÔNG mở gói.
  const tamperedStore = fakeDb({ ...order, status: 'pending' });
  const badSearch = new URLSearchParams({ ...good, vnp_SecureHash: 'deadbeef' }).toString();
  const rejected = await callIpn(badSearch, tamperedStore.db);
  assert.deepEqual(await rejected.json(), { RspCode: '97', Message: 'Invalid signature' });
  assert.equal(tamperedStore.state.sub, null, 'chữ ký sai không được mở gói');

  // Sai số tiền: 04, không mở gói.
  const cheapStore = fakeDb({ ...order, status: 'pending' });
  const cheap = await callIpn(ipnQuery({ ...good, vnp_Amount: '990000' }), cheapStore.db);
  assert.deepEqual(await cheap.json(), { RspCode: '04', Message: 'Invalid amount' });
  assert.equal(cheapStore.state.sub, null);

  // Đơn lạ: 01.
  const unknown = await callIpn(ipnQuery({ ...good, vnp_TxnRef: '999999' }), fakeDb(null).db);
  assert.deepEqual(await unknown.json(), { RspCode: '01', Message: 'Order not found' });

  // Chưa trả tiền (khách huỷ): 00 nhưng KHÔNG mở gói.
  const cancelledStore = fakeDb({ ...order, status: 'pending' });
  const cancelled = await callIpn(ipnQuery({ ...good, vnp_ResponseCode: '24', vnp_TransactionStatus: '02' }), cancelledStore.db);
  assert.deepEqual(await cancelled.json(), { RspCode: '00', Message: 'Confirm Success' });
  assert.equal(cancelledStore.state.sub, null, 'huỷ đơn không mở gói');

  // Sai cấu hình (thiếu khoá): 99, để VNPay gọi lại thay vì bỏ.
  const unconfigured = await handler.handle(
    new Request('https://gateway.test/v1/billing/webhook/vnpay?' + ipnQuery(good), { method: 'GET' }),
    workerEnv({ VNPAY_HASH_SECRET: '' }),
    { db: () => fakeDb(order).db, now: () => NOW }
  );
  assert.deepEqual(await unconfigured.json(), { RspCode: '99', Message: 'Merchant not configured' });

  // 8. Checkout qua handler: URL VNPay có chữ ký, không gọi mạng, đơn được ghi.
  const checkoutStore = fakeDb(null);
  let created: Record<string, unknown> | null = null;
  const fakeDbWithCreate = {
    ...checkoutStore.db,
    async createOrder(row: Record<string, unknown>) {
      created = row;
    },
    async latestOrder() {
      return null;
    },
  };
  const checkout = await handler.handle(
    new Request('https://gateway.test/v1/billing/checkout', {
      method: 'POST',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: '{}',
    }),
    workerEnv({ VNPAY_URL: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html' }),
    { db: () => fakeDbWithCreate as never, auth: async () => 'user-1', now: () => NOW }
  );
  const checkoutBody = await checkout.json();
  assert.equal(checkout.status, 200);
  assert.match(String(checkoutBody.checkoutUrl), /vpcpay\.html\?/u);
  assert.equal(checkoutBody.amountVnd, 99000);
  assert.ok(created, 'phải ghi một đơn vào sổ trước khi mời trả tiền');
  assert.equal((created as Record<string, unknown>).provider, 'vnpay');
  const createdAmount = queryOf(String(checkoutBody.checkoutUrl)).vnp_Amount;
  assert.equal(createdAmount, '9900000');

  console.log('server-billing-vnpay: 8 nhóm khẳng định đã qua');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

export {};
