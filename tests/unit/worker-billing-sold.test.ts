// #367 — ba con số trong đường tiền phải đến từ ĐÚNG nguồn.
//
//   * số NGÀY trao = số ngày ĐÃ BÁN trên đơn, không phải cấu hình lúc webhook tới
//     (admin đổi 14 → 7 trong khi một đơn cũ còn chờ: người đã trả 14 ngày không được nhận 7);
//   * `period_days` phải nằm trong danh sách cột được SELECT, nếu không mọi đơn đọc về đều 0 và
//     lỗi trên quay lại một cách âm thầm;
//   * số CREDITS quảng cáo trên thẻ Pro = hạn mức đang ÁP (`server_config.quota_pro_monthly_credits`),
//     không phải biến env — nếu lệch thì giáo viên mua 500 mà được 300.
import assert from 'node:assert/strict';

const HANDLER = '../../worker/index.js';
const SUPA = '../../worker/supabase.js';

type Order = { userId: string; providerRef: string; provider: string; amountVnd: number; periodDays: number; status: 'pending' | 'paid'; expiresAt: Date | null };

function fakeDb(seed: { proCredits?: number | (() => Promise<number>); order?: Order; plan?: string } = {}) {
  const orders: Order[] = seed.order ? [{ ...seed.order }] : [];
  let sub: { plan: string; status: string; periodEnd: Date | null; provider: string | null; providerRef: string | null; priceVnd: number | null } | null =
    seed.plan ? { plan: seed.plan, status: 'active', periodEnd: null, provider: null, providerRef: null, priceVnd: null } : null;
  const db = {
    async subscriptionOf() {
      return sub;
    },
    async saveSubscription(_userId: string, row: typeof sub) {
      sub = row;
    },
    async createOrder(order: { providerRef: string; provider: string; amountVnd: number; periodDays: number; checkoutUrl: string; expiresAt: Date; userId: string }) {
      orders.push({ ...order, status: 'pending' });
    },
    async orderByRef(ref: string) {
      return orders.find((o) => o.providerRef === ref) ?? null;
    },
    async latestOrder() {
      return orders[orders.length - 1] ?? null;
    },
    async markPaid(ref: string) {
      const found = orders.find((o) => o.providerRef === ref && o.status === 'pending');
      if (!found) return false;
      found.status = 'paid';
      return true;
    },
    async billingReady() {
      return true;
    },
    async proCredits() {
      if (typeof seed.proCredits === 'function') return seed.proCredits();
      return seed.proCredits ?? 0;
    },
  };
  return { db, orders, get sub() { return sub; } };
}

const NOW = new Date('2026-11-26T09:00:00.000Z');

function env(extra: Record<string, string> = {}) {
  return {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'anon',
    SUPABASE_SERVICE_ROLE_KEY: 'service',
    GEMINI_API_KEY: 'gemini',
    GATEWAY_VERSION: '0.5.6',
    EDUGAME_BILLING_PROVIDER: 'fake',
    EDUGAME_ALLOW_FAKE_PAYMENTS: '1',
    EDUGAME_PRO_PRICE_VND: '99000',
    EDUGAME_PRO_PERIOD_DAYS: '7',
    EDUGAME_PRO_CREDITS: '500',
    ...extra,
  } as never;
}

const daysBetween = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / 86_400_000);

async function main() {
  const { default: handler } = (await import(HANDLER)) as { default: { handle: Function } };
  const supa = (await import(SUPA)) as typeof import('../../worker/supabase.js');

  // 1. Danh sách cột đọc từ `billing_orders` phải có `period_days`.
  assert.match(supa.ORDER_COLUMNS, /(^|,)period_days(,|$)/u, 'thiếu period_days là mọi đơn đọc về 0 ngày');

  // 2. Đơn đã bán 14 ngày; cấu hình bây giờ là 7 — tiền về thì phải trao 14.
  const sold = fakeDb({ order: { userId: 'u1', providerRef: '1700000000', provider: 'fake', amountVnd: 99000, periodDays: 14, status: 'pending', expiresAt: new Date(NOW.getTime() + 600_000) } });
  const paid = await handler.handle(
    new Request('https://gateway.test/v1/billing/fake/pay', { method: 'POST', headers: { Authorization: 'Bearer t' } }),
    env(),
    { db: () => sold.db, auth: async () => 'u1', now: () => NOW }
  );
  const paidBody = await paid.json();
  assert.equal(paid.status, 200);
  assert.equal(paidBody.applied, true);
  assert.equal(daysBetween(NOW, new Date(paidBody.periodEnd)), 14, 'phải trao đúng 14 ngày đã bán, không phải 7 ngày trong cấu hình');

  // 3. Đơn cũ (ghi trước khi có cột) không có số ngày ⇒ lùi về cấu hình, không trao 0 ngày.
  const legacy = fakeDb({ order: { userId: 'u1', providerRef: '1600000000', provider: 'fake', amountVnd: 99000, periodDays: 0, status: 'pending', expiresAt: new Date(NOW.getTime() + 600_000) } });
  const legacyPaid = await handler.handle(
    new Request('https://gateway.test/v1/billing/fake/pay', { method: 'POST', headers: { Authorization: 'Bearer t' } }),
    env(),
    { db: () => legacy.db, auth: async () => 'u1', now: () => NOW }
  );
  const legacyBody = await legacyPaid.json();
  assert.equal(daysBetween(NOW, new Date(legacyBody.periodEnd)), 7, 'đơn không có số ngày thì phải dùng cấu hình');

  // 4. Thẻ Pro quảng cáo hạn mức ĐANG ÁP, không phải biến env.
  const enforced = fakeDb({ proCredits: 800 });
  const status = await handler.handle(
    new Request('https://gateway.test/v1/billing/status', { headers: { Authorization: 'Bearer t' } }),
    env(),
    { db: () => enforced.db, auth: async () => 'u1', now: () => NOW }
  );
  const statusBody = await status.json();
  assert.equal(statusBody.credits, 800, 'hạn mức đang áp là 800 thì thẻ phải ghi 800, không ghi 500 của env');

  // 5. Đọc hạn mức lỗi ⇒ vẫn phải có một con số (của env), không được in "NaN" hay 0.
  const broken = fakeDb({ proCredits: () => Promise.reject(new Error('boom')) });
  const fallback = await handler.handle(
    new Request('https://gateway.test/v1/billing/status', { headers: { Authorization: 'Bearer t' } }),
    env(),
    { db: () => broken.db, auth: async () => 'u1', now: () => NOW }
  );
  assert.equal((await fallback.json()).credits, 500, 'lỗi đọc thì lùi về cấu hình, không để trống');

  // 6. `server_config` trả 0 (chưa seed) ⇒ cũng lùi về cấu hình thay vì quảng cáo gói 0 credits.
  const zero = fakeDb({ proCredits: 0 });
  const zeroStatus = await handler.handle(
    new Request('https://gateway.test/v1/billing/status', { headers: { Authorization: 'Bearer t' } }),
    env(),
    { db: () => zero.db, auth: async () => 'u1', now: () => NOW }
  );
  assert.equal((await zeroStatus.json()).credits, 500);

  console.log('worker-billing-sold: 6 nhóm khẳng định đã qua');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

export {};
