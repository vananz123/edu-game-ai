// #364 — đường thanh toán chạy trong gateway THẬT (bản đã biên dịch), với kho giả.
//
// Đo những câu không được phép sai, vì mỗi câu sai là tiền của một giáo viên:
//   * chưa cấu hình => 503 có tên biến còn thiếu, KHÔNG phải 500 và không phải im lặng;
//   * bấm hai lần => cùng một đơn (không tạo hai QR);
//   * đã trả tiền => gói lên `plus`, có `periodEnd`, và `/v1/usage` đổi sang credits;
//   * webhook sai chữ ký => 401 và KHÔNG mở gói;
//   * trả lại lần hai => không cộng thêm kỳ.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

const HANDLER = '../../worker/index.js';

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

function fakeDb(seed: { plan?: string; periodEnd?: Date | null } = {}) {
  const orders: Order[] = [];
  let sub: { plan: string; status: string; periodEnd: Date | null; provider: string | null; providerRef: string | null; priceVnd: number | null } | null =
    seed.plan
      ? { plan: seed.plan, status: 'active', periodEnd: seed.periodEnd ?? null, provider: null, providerRef: null, priceVnd: null }
      : null;
  return {
    orders,
    get sub() {
      return sub;
    },
    db: {
      async subscriptionOf() {
        return sub;
      },
      async saveSubscription(_userId: string, row: typeof sub) {
        sub = row;
      },
      async createOrder(order: Omit<Order, 'status' | 'createdAt' | 'checkoutUrl'> & { checkoutUrl: string; periodDays: number }) {
        orders.push({
          userId: order.userId,
          providerRef: order.providerRef,
          provider: order.provider,
          amountVnd: order.amountVnd,
          status: 'pending',
          checkoutUrl: order.checkoutUrl,
          expiresAt: order.expiresAt,
          createdAt: new Date(),
        });
      },
      async orderByRef(ref: string) {
        return orders.find((o) => o.providerRef === ref) ?? null;
      },
      async latestOrder(userId: string) {
        return [...orders].reverse().find((o) => o.userId === userId) ?? null;
      },
      async markPaid(ref: string, paidAt: Date) {
        const found = orders.find((o) => o.providerRef === ref && o.status === 'pending');
        if (!found) return false;
        found.status = 'paid';
        void paidAt;
        return true;
      },
    },
  };
}

function env(extra: Record<string, string> = {}) {
  return {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'anon',
    SUPABASE_SERVICE_ROLE_KEY: 'service',
    GEMINI_API_KEY: 'gemini',
    GATEWAY_VERSION: '0.5.6',
    ...extra,
  } as never;
}

const USER = 'user-1';
const OK_AUTH = async () => USER;
const NOW = new Date('2026-11-26T09:00:00.000Z');

function call(handler: { handle: Function }, path: string, init: { method?: string; body?: unknown; token?: string } = {}, e = env(), deps: Record<string, unknown> = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (init.token !== '') headers.Authorization = 'Bearer ' + (init.token || 'token');
  const method = init.method || 'GET';
  const request = new Request('https://gateway.test' + path, {
    method,
    headers,
    // GET/HEAD không được có body: `new Request` của undici ném lỗi, và đó là lỗi của TEST
    // chứ không phải của sản phẩm.
    body: method === 'GET' || method === 'HEAD' || init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  return handler.handle(request, e, { auth: OK_AUTH, now: () => NOW, ...deps });
}

async function main() {
  const { default: handler } = (await import(HANDLER)) as { default: { handle: Function } };

  // 1. Chưa cấu hình nhà cung cấp: 503 + tên biến còn thiếu (không phải 500).
  {
    const store = fakeDb();
    const status = await call(handler, '/v1/billing/status', {}, env(), { db: () => store.db });
    const body = await status.json();
    assert.equal(status.status, 200, 'trạng thái thanh toán trả lời được cả khi chưa cấu hình');
    assert.equal(body.configured, false);
    assert.deepEqual(body.missing, ['EDUGAME_BILLING_PROVIDER']);
    assert.equal(body.priceVnd, 99000, 'giá mặc định vẫn đọc được');

    const checkout = await call(handler, '/v1/billing/checkout', { method: 'POST', body: {} }, env(), { db: () => store.db });
    assert.equal(checkout.status, 503, 'chưa cấu hình thì không được giả vờ tạo đơn');
    assert.equal((await checkout.json()).code, 'billing_not_configured');
  }

  // 2. Không token: 401 ở cả hai đường cần biết "ai đang gọi".
  {
    const store = fakeDb();
    const e = env({ EDUGAME_BILLING_PROVIDER: 'fake' });
    for (const path of ['/v1/billing/status', '/v1/billing/checkout']) {
      const response = await call(handler, path, { method: path.endsWith('checkout') ? 'POST' : 'GET', token: '', body: {} }, e, {
        auth: async () => null,
        db: () => store.db,
      });
      assert.equal(response.status, 401, path + ' phải từ chối người không có token');
    }
  }

  // 3. Luồng đầy đủ với nhà cung cấp `fake`: tạo đơn, dùng lại đơn, trả tiền, gói lên plus.
  {
    const store = fakeDb();
    const e = env({ EDUGAME_BILLING_PROVIDER: 'fake', EDUGAME_ALLOW_FAKE_PAYMENTS: '1', EDUGAME_PRO_PRICE_VND: '99000' });
    const deps = { db: () => store.db };

    const first = await call(handler, '/v1/billing/checkout', { method: 'POST', body: {} }, e, deps);
    const firstBody = await first.json();
    assert.equal(first.status, 200);
    assert.equal(firstBody.ok, true);
    assert.equal(firstBody.reused, false);
    assert.match(String(firstBody.checkoutUrl), /fake/u);
    assert.equal(firstBody.amountVnd, 99000);
    assert.match(String(firstBody.message), /Đang chờ chuyển khoản/u);
    assert.equal(store.orders.length, 1, 'một lần bấm là một đơn');

    const again = await call(handler, '/v1/billing/checkout', { method: 'POST', body: {} }, e, deps);
    const againBody = await again.json();
    assert.equal(againBody.reused, true, 'bấm lần hai phải dùng lại đơn đang chờ');
    assert.equal(againBody.checkoutUrl, firstBody.checkoutUrl);
    assert.equal(store.orders.length, 1, 'không được tạo QR thứ hai khi đơn cũ còn hiệu lực');

    const beforePay = await (await call(handler, '/v1/billing/status', {}, e, deps)).json();
    assert.equal(beforePay.plan, 'free');
    assert.equal(beforePay.order.status, 'pending');

    const paid = await call(handler, '/v1/billing/fake/pay', { method: 'POST', body: {} }, e, deps);
    const paidBody = await paid.json();
    assert.equal(paid.status, 200);
    assert.equal(paidBody.applied, true, 'trả tiền phải mở gói');
    assert.equal(paidBody.plan, 'plus');
    assert.equal(new Date(paidBody.periodEnd).toISOString(), '2026-12-10T09:00:00.000Z', 'hạn = hôm nay + 14 ngày');
    assert.equal(store.sub?.plan, 'plus');
    assert.equal(store.sub?.priceVnd, 99000);

    const afterPay = await (await call(handler, '/v1/billing/status', {}, e, deps)).json();
    assert.equal(afterPay.plan, 'plus');
    assert.equal(afterPay.order.status, 'paid');
    assert.equal(afterPay.order.checkoutUrl, null, 'đơn đã trả không được mời thanh toán lại');

    const twice = await (await call(handler, '/v1/billing/fake/pay', { method: 'POST', body: {} }, e, deps)).json();
    assert.equal(twice.applied, false, 'trả lần hai không được cộng thêm kỳ');
    assert.equal(store.orders[0].status, 'paid');
  }

  // 4. Webhook PayOS: sai chữ ký => 401 và gói KHÔNG đổi; đúng chữ ký + đúng tiền => mở gói.
  {
    const store = fakeDb();
    const checksum = 'checksum-key';
    const e = env({
      EDUGAME_BILLING_PROVIDER: 'payos',
      PAYOS_CLIENT_ID: 'client',
      PAYOS_API_KEY: 'api',
      PAYOS_CHECKSUM_KEY: checksum,
    });
    const deps = { db: () => store.db };
    // Tạo một đơn rồi mới có `provider_ref` để webhook nhắc tới.
    store.orders.push({
      userId: USER,
      providerRef: '1732600000',
      provider: 'payos',
      amountVnd: 99000,
      status: 'pending',
      checkoutUrl: 'https://pay.payos.vn/web/abc',
      expiresAt: new Date(NOW.getTime() + 900_000),
      createdAt: NOW,
    });

    const data = { orderCode: 1732600000, amount: 99000, description: 'EduGame Pro 14 ngay', reference: 'FT1' };
    const signFor = (payload: Record<string, unknown>) => {
      const signData = Object.keys(payload).sort().map((k) => `${k}=${payload[k]}`).join('&');
      return createHmac('sha256', checksum).update(signData).digest('hex');
    };
    const good = signFor(data);
    // Chữ ký phải ký CHÍNH payload đã sửa: một chữ ký đúng cho payload khác là chữ ký sai,
    // và như vậy phép đo "thiếu tiền" sẽ đo nhầm nhánh (signature thay vì amount_mismatch).
    const goodButCheap = signFor({ ...data, amount: 9900 });

    const bad = await call(handler, '/v1/billing/webhook/payos', { method: 'POST', token: '', body: { code: '00', signature: 'deadbeef', data } }, e, deps);
    assert.equal(bad.status, 401, 'chữ ký sai là lỗi cấu hình, không được coi là đã trả tiền');
    assert.equal(store.sub, null, 'chữ ký sai không được mở gói');

    const wrongMoney = await call(
      handler,
      '/v1/billing/webhook/payos',
      { method: 'POST', token: '', body: { code: '00', signature: goodButCheap, data: { ...data, amount: 9900 } } },
      e,
      deps
    );
    const wrongMoneyBody = await wrongMoney.json();
    assert.equal(wrongMoney.status, 200, 'thiếu tiền không phải lỗi 5xx: nhà cung cấp sẽ gửi lại mãi');
    assert.equal(wrongMoneyBody.applied, false);
    assert.equal(wrongMoneyBody.reason, 'amount_mismatch');
    assert.equal(store.sub, null);

    const ok = await call(handler, '/v1/billing/webhook/payos', { method: 'POST', token: '', body: { code: '00', signature: good, data } }, e, deps);
    const okBody = await ok.json();
    assert.equal(ok.status, 200);
    assert.equal(okBody.applied, true, 'chữ ký đúng + đủ tiền thì phải mở gói');
    assert.equal(store.sub?.plan, 'plus');
    assert.equal(store.sub?.providerRef, '1732600000');
    assert.equal(store.orders[0].status, 'paid');

    const replay = await (await call(handler, '/v1/billing/webhook/payos', { method: 'POST', token: '', body: { code: '00', signature: good, data } }, e, deps)).json();
    assert.equal(replay.applied, false, 'webhook gửi lại không được cộng thêm kỳ');
    assert.equal(replay.reason, 'already_paid');
  }

  // 5. Đường giả không tồn tại khi đang chạy nhà cung cấp thật.
  {
    const store = fakeDb();
    const e = env({ EDUGAME_BILLING_PROVIDER: 'payos', PAYOS_CLIENT_ID: 'c', PAYOS_API_KEY: 'a', PAYOS_CHECKSUM_KEY: 'k' });
    const response = await call(handler, '/v1/billing/fake/pay', { method: 'POST', body: {} }, e, { db: () => store.db });
    assert.equal(response.status, 404, 'không được để một đường "trả tiền miễn phí" sống trong bản chạy thật');
  }

  // 6. Trang quay về sau khi thanh toán: HTML, không có dữ liệu người dùng.
  {
    const response = await call(handler, '/v1/billing/done', {}, env(), {});
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') || '', /text\/html/u);
    const body = await response.text();
    assert.match(body, /quay lại|Quay lại/u);
    assert.equal(/user-1|token|99000/u.test(body), false, 'trang công khai không được chứa dữ liệu hay giá của người khác');
  }

  console.log('worker-billing: 6 nhóm khẳng định đã qua');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

export {};
