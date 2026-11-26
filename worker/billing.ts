// worker/billing.ts — ba đường HTTP của việc bán gói Pro (#364).
//
// Luật tiền nằm ở `server/billing.ts`, hình dạng nhà cung cấp nằm ở `server/billing-provider.ts`;
// ở đây chỉ có vận chuyển + ghi DB. Điều đó có nghĩa: nếu bản Express và bản Workers trả lời
// khác nhau về giá hay về hạn, lỗi nằm trong tệp này, không nằm trong luật.
//
// Ba đường:
//   GET  /v1/billing/status          — giáo viên xem: giá, gói đang dùng, hạn, đơn đang chờ
//   POST /v1/billing/checkout        — tạo (hoặc dùng lại) một đơn, trả `checkoutUrl`
//   POST /v1/billing/webhook/payos   — nhà cung cấp báo đã nhận tiền (KHÔNG cần token người dùng)
//
// Cộng thêm hai đường chỉ tồn tại để ĐO ĐƯỢC mà không cần tài khoản merchant:
//   POST /v1/billing/fake/pay        — chỉ khi provider là `fake`
//   GET  /v1/billing/done            — trang "xong rồi, quay lại ứng dụng" cho returnUrl
import {
  PAID_PLAN,
  applyPaidOrder,
  billingConfig,
  effectiveOrderStatus,
  effectivePlan,
  orderCodeFor,
  orderExpiry,
  orderMessage,
  payosSignData,
  signaturesEqual,
  webhookVerdict,
} from '../server/billing.js';
import {
  VNPAY_DEFAULT_URL,
  asciiDescription,
  payosLinkBody,
  payosWebhookFields,
  payosWebhookSignData,
  vnpayCheckoutUrl,
  vnpaySignatureOk,
  vnpaySignData,
  vnpayTime,
  vnpayWebhookFields,
} from '../server/billing-provider.js';
import { billingDb, hmacHex, hmacHexWith, verifyUser, type BillingDb, type WorkerEnv } from './supabase.js';

const PAYOS_API = 'https://api.payos.vn/v2/payment-requests';
/// Tên việc còn thiếu, viết như một việc người ta làm được — không phải mã lỗi.
const MIGRATION_MISSING = 'chạy migration server/migrations/2026-11-26-billing.sql';
const DEFAULT_PUBLIC_URL = 'https://ai-gateway.dovanan-bth2017.workers.dev';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/**
 * Bảng đơn đã có chưa. Một tính năng chưa chạy migration phải tự nói ra, chứ không được làm
 * `/v1/billing/status` ném 500 — và càng không được làm hỏng `/v1/usage`.
 */
async function ordersReady(db: BillingDb): Promise<boolean> {
  if (!db.billingReady) return true;
  try {
    return await db.billingReady();
  } catch {
    return false;
  }
}

function html(body: string): Response {
  return new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>EduGame Studio</title><body style="font:16px/1.6 system-ui,sans-serif;max-width:34rem;margin:12vh auto;padding:0 1.25rem;color:#111">' +
      body +
      '</body>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
  );
}

export interface BillingDeps {
  db?: (env: WorkerEnv) => BillingDb;
  auth?: (env: WorkerEnv, authorization: string) => Promise<string | null>;
  /** Cho test bơm PayOS giả: nhận body đã ký, trả `checkoutUrl`. */
  createLink?: (env: WorkerEnv, body: unknown) => Promise<{ ok: boolean; checkoutUrl?: string; error?: string }>;
  now?: () => Date;
}

/**
 * Số ngày được trao khi tiền về = số ngày ĐÃ BÁN trên đơn, không phải cấu hình lúc webhook tới.
 * Admin đổi 14 → 7 ngày trong khi một đơn cũ còn chờ là chuyện có thật, và người đã trả tiền cho
 * 14 ngày không được nhận 7. Đơn cũ (ghi trước #366) không có số ngày ⇒ lùi về cấu hình.
 */
function soldPeriodDays(order: { periodDays?: number } | null, config: { periodDays: number }): number {
  const sold = Math.trunc(Number((order && order.periodDays) || 0));
  return sold > 0 ? sold : config.periodDays;
}

function publicBase(env: WorkerEnv): string {
  return String(env.EDUGAME_PUBLIC_URL || DEFAULT_PUBLIC_URL).replace(/\/+$/u, '');
}

async function enforcedCredits(db: BillingDb, config: { credits: number }): Promise<number> {
  if (!db.proCredits) return config.credits;
  try {
    const value = Math.trunc(Number(await db.proCredits()));
    return value > 0 ? value : config.credits;
  } catch {
    return config.credits;
  }
}

async function payosCreateLink(env: WorkerEnv, body: unknown): Promise<{ ok: boolean; checkoutUrl?: string; error?: string }> {
  const response = await fetch(PAYOS_API, {
    method: 'POST',
    headers: {
      'x-client-id': String(env.PAYOS_CLIENT_ID || ''),
      'x-api-key': String(env.PAYOS_API_KEY || ''),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }).catch((error: unknown) => ({ ok: false, status: 0, json: async () => ({}) }) as unknown as Response);
  const payload = (await (response as Response).json().catch(() => ({}))) as {
    code?: string;
    desc?: string;
    data?: { checkoutUrl?: string };
  };
  const checkoutUrl = payload.data && payload.data.checkoutUrl;
  if (!(response as Response).ok || payload.code !== '00' || !checkoutUrl) {
    // Không bao giờ ghi `PAYOS_API_KEY` vào log; chỉ mã lỗi của họ.
    console.error('payos link failed:', String(payload.code || (response as Response).status), String(payload.desc || '').slice(0, 80));
    return { ok: false, error: 'payos_' + String(payload.code || (response as Response).status) };
  }
  return { ok: true, checkoutUrl };
}

/**
 * Trả `null` khi đường này không phải của thanh toán, để `worker/index.ts` xử lý tiếp.
 */
export async function handleBilling(
  request: Request,
  env: WorkerEnv,
  deps: BillingDeps = {}
): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/u, '') || '/';
  if (!path.startsWith('/v1/billing')) return null;

  const now = (deps.now || (() => new Date()))();
  const config = billingConfig(env);
  const makeDb = deps.db || billingDb;

  // ── Trang quay về sau khi thanh toán. Không có token, không có dữ liệu. ────
  if (path === '/v1/billing/done' && request.method === 'GET') {
    return html(
      '<h2 style="margin:0 0 .5rem">Đã xong bước thanh toán</h2>' +
        '<p>Quay lại <strong>EduGame Studio</strong> — ứng dụng sẽ tự cập nhật gói khi ngân hàng báo tiền về, ' +
        'thường trong vài giây.</p><p style="color:#666">Bạn có thể đóng tab này.</p>'
    );
  }

  // ── VNPay gọi IPN (GET, query string) và đọc `RspCode` trong JSON trả về để biết có phải gọi
  //    lại hay không. Vì vậy đường này KHÔNG dùng mã lỗi HTTP của ta: 401 nghĩa là "đừng gọi lại
  //    nữa", mà chữ ký hỏng thì lại đúng là phải gọi lại khi ta sửa cấu hình hoặc khi họ đổi khoá.
  if (path === '/v1/billing/webhook/vnpay') {
    if (request.method !== 'GET' && request.method !== 'POST') return json({ RspCode: '99', Message: 'Unknown error' }, 405);
    if (config.provider !== 'vnpay' || config.missing.includes('VNPAY_HASH_SECRET')) {
      return json({ RspCode: '99', Message: 'Merchant not configured' }, 503);
    }
    const params: Record<string, string> = {};
    for (const [key, value] of url.searchParams.entries()) params[key] = value;
    const secret = String(env.VNPAY_HASH_SECRET || '');
    const expected = await hmacHexWith('SHA-512', secret, vnpaySignData(params));
    if (!vnpaySignatureOk(params, expected)) {
      console.warn('vnpay ipn ignored: bad signature');
      return json({ RspCode: '97', Message: 'Invalid signature' });
    }
    const hook = vnpayWebhookFields(params);
    const db = makeDb(env);
    const order = hook.providerRef ? await db.orderByRef(hook.providerRef) : null;
    if (!order) return json({ RspCode: '01', Message: 'Order not found' });
    if (hook.amountVnd !== null && hook.amountVnd !== order.amountVnd) {
      console.warn('vnpay ipn ignored: amount_mismatch');
      return json({ RspCode: '04', Message: 'Invalid amount' });
    }
    if (hook.providerStatus !== 'PAID') {
      // Huỷ/quá hạn: không mở gói, nhưng cũng không phải lỗi của họ — trả 00 để họ thôi gọi lại.
      console.warn('vnpay ipn ignored: not_paid', hook.responseCode, hook.transactionStatus);
      return json({ RspCode: '00', Message: 'Confirm Success' });
    }
    const paidAt = hook.paidAt || now;
    const won = await db.markPaid(order.providerRef, paidAt);
    if (!won) return json({ RspCode: '02', Message: 'Order already confirmed' });
    // `user_id` lấy từ ĐƠN trong DB, không từ query string của nhà cung cấp.
    const next = applyPaidOrder(
      await db.subscriptionOf(order.userId),
      { provider: order.provider, providerRef: order.providerRef, amountVnd: order.amountVnd, paidAt },
      soldPeriodDays(order, config)
    );
    await db.saveSubscription(order.userId, next);
    return json({ RspCode: '00', Message: 'Confirm Success' });
  }

  // ── Webhook: KHÔNG dùng token người dùng; nó phải chạy cả khi giáo viên đã đóng app.
  if (path === '/v1/billing/webhook/payos') {
    if (request.method !== 'POST') return json({ error: 'Chỉ nhận POST.' }, 405);
    if (config.provider !== 'payos' || config.missing.includes('PAYOS_CHECKSUM_KEY')) {
      return json({ ok: false, code: 'billing_not_configured' }, 503);
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, code: 'malformed' }, 400);
    }
    const hook = payosWebhookFields(body);
    const expected = await hmacHex(String(env.PAYOS_CHECKSUM_KEY || ''), payosWebhookSignData(hook));
    const db = makeDb(env);
    const order = hook.orderCode === null ? null : await db.orderByRef(String(hook.orderCode));
    const verdict = webhookVerdict({
      signatureOk: signaturesEqual(expected, hook.signature),
      providerStatus: hook.providerStatus,
      paidAmount: hook.amount,
      orderAmount: order ? order.amountVnd : null,
      providerRef: order ? order.providerRef : null,
      paidAt: hook.data.paymentLinkId ? now : now,
    });
    if (verdict.kind === 'ignore') {
      // 200 cho mọi trường hợp "không mở gói", trừ chữ ký sai: chữ ký sai là lỗi cấu hình của
      // TA, và một 401 sẽ làm PayOS dừng gửi lại thay vì nhấn chìm ta trong một vòng lặp.
      if (verdict.reason === 'signature') return json({ ok: false, code: 'bad_signature' }, 401);
      console.warn('payos webhook ignored:', verdict.reason);
      return json({ ok: true, applied: false, reason: verdict.reason });
    }
    // CAS trên `status` của đơn: webhook thứ hai cho cùng một đơn không mở Pro lần nữa.
    const won = await db.markPaid(verdict.providerRef, verdict.paidAt);
    if (!won) return json({ ok: true, applied: false, reason: 'already_paid' });
    // `user_id` lấy từ ĐƠN trong DB, không từ payload: một webhook không được phép nói nó
    // thuộc về ai. Đơn đã được đối chiếu ở `webhookVerdict` (chữ ký + số tiền) trước đó.
    const next = applyPaidOrder(
      await db.subscriptionOf(order!.userId),
      { provider: order!.provider, providerRef: verdict.providerRef, amountVnd: verdict.amountVnd, paidAt: verdict.paidAt },
      soldPeriodDays(order, config)
    );
    await db.saveSubscription(order!.userId, next);
    return json({ ok: true, applied: true, periodEnd: next.periodEnd!.toISOString() });
  }

  // ── Từ đây cần biết "ai đang gọi". ────────────────────────────────────────
  const getUser = deps.auth || verifyUser;
  const userId = await getUser(env, request.headers.get('authorization') || '');
  if (!userId) return json({ error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' }, 401);
  const db = makeDb(env);

  if (path === '/v1/billing/status') {
    if (request.method !== 'GET') return json({ error: 'Chỉ nhận GET.' }, 405);
    const ready = await ordersReady(db);
    const sub = await db.subscriptionOf(userId);
    const plan = effectivePlan(sub, now);
    const order = ready ? await db.latestOrder(userId) : null;
    const orderStatus = order ? effectiveOrderStatus({ status: order.status, expiresAt: order.expiresAt }, now) : null;
    return json({
      ok: true,
      configured: config.missing.length === 0 && ready,
      missing: ready ? config.missing : config.missing.concat([MIGRATION_MISSING]),
      provider: config.provider,
      priceVnd: config.priceVnd,
      periodDays: config.periodDays,
      // Đọc hạn mức đang ÁP từ `server_config` (cùng khoá mà `/v1/generate` dùng). Lỗi đọc thì
      // lùi về giá trị cấu hình để thẻ Pro vẫn có một con số, nhưng ưu tiên luôn là con số thật.
      credits: await enforcedCredits(db, config),
      plan: plan.plan,
      status: plan.status,
      periodEnd: sub && sub.periodEnd ? sub.periodEnd.toISOString() : null,
      order: order
        ? {
            status: orderStatus,
            amountVnd: order.amountVnd,
            checkoutUrl: orderStatus === 'pending' ? order.checkoutUrl : null,
            expiresAt: order.expiresAt ? order.expiresAt.toISOString() : null,
            message: orderMessage(orderStatus || 'pending', order.amountVnd, sub && sub.periodEnd),
          }
        : null,
    });
  }

  if (path === '/v1/billing/checkout') {
    if (request.method !== 'POST') return json({ error: 'Chỉ nhận POST.' }, 405);
    const ready = await ordersReady(db);
    if (config.missing.length > 0 || !ready) {
      return json(
        {
          error: 'Thanh toán chưa được cấu hình trên máy chủ này.',
          code: 'billing_not_configured',
          missing: ready ? config.missing : config.missing.concat([MIGRATION_MISSING]),
        },
        503
      );
    }
    // Đã có đơn còn hiệu lực thì trả lại đơn đó: bấm hai lần không được tạo hai QR.
    const latest = await db.latestOrder(userId);
    if (latest) {
      const status = effectiveOrderStatus({ status: latest.status, expiresAt: latest.expiresAt }, now);
      if (status === 'pending' && latest.checkoutUrl) {
        return json({
          ok: true,
          reused: true,
          checkoutUrl: latest.checkoutUrl,
          amountVnd: latest.amountVnd,
          expiresAt: latest.expiresAt ? latest.expiresAt.toISOString() : null,
          message: orderMessage('pending', latest.amountVnd, null),
        });
      }
    }
    const orderCode = orderCodeFor(now, Math.random() * 1000);
    const expiresAt = orderExpiry(now);
    const returnUrl = publicBase(env) + '/v1/billing/done';
    let checkoutUrl: string;
    if (config.provider === 'vnpay') {
      // Không gọi API: VNPay nhận một URL đã ký. Nghĩa là bước tạo đơn không thể hỏng vì
      // "nhà cung cấp đang bảo trì" — chỉ có webhook/IPN mới cần họ sống.
      checkoutUrl = await vnpayCheckoutUrl({
        base: String(env.VNPAY_URL || VNPAY_DEFAULT_URL),
        secret: String(env.VNPAY_HASH_SECRET || ''),
        sign: (data, secret) => hmacHexWith('SHA-512', secret, data),
        params: {
          vnp_Version: '2.1.0',
          vnp_Command: 'pay',
          vnp_TmnCode: String(env.VNPAY_TMN_CODE || ''),
          vnp_Locale: 'vn',
          vnp_CurrCode: 'VND',
          vnp_TxnRef: String(orderCode),
          vnp_OrderInfo: asciiDescription('EduGame Pro ' + config.periodDays + ' ngay'),
          vnp_OrderType: 'other',
          // VNPay nhận SỐ TIỀN NHÂN 100. Quên nhân là bán 99.000đ với giá 990đ.
          vnp_Amount: String(config.priceVnd * 100),
          vnp_ReturnUrl: returnUrl,
          vnp_CreateDate: vnpayTime(now),
          vnp_ExpireDate: vnpayTime(expiresAt),
        },
      });
    } else if (config.provider === 'payos') {
      const body = await payosLinkBody({
        orderCode,
        amount: config.priceVnd,
        description: 'EduGame Pro ' + config.periodDays + ' ngay',
        returnUrl,
        cancelUrl: returnUrl,
        sign: (data) => hmacHex(String(env.PAYOS_CHECKSUM_KEY || ''), data),
      });
      const created = await (deps.createLink || payosCreateLink)(env, body);
      if (!created.ok || !created.checkoutUrl) {
        return json({ error: 'Chưa tạo được đường link thanh toán. Thử lại sau ít phút.', code: 'provider_error' }, 502);
      }
      checkoutUrl = created.checkoutUrl;
    } else {
      checkoutUrl = publicBase(env) + '/v1/billing/fake/' + orderCode;
    }
    await db.createOrder({
      userId,
      provider: config.provider,
      providerRef: String(orderCode),
      amountVnd: config.priceVnd,
      periodDays: config.periodDays,
      checkoutUrl,
      expiresAt,
    });
    return json({
      ok: true,
      reused: false,
      checkoutUrl,
      amountVnd: config.priceVnd,
      expiresAt: expiresAt.toISOString(),
      message: orderMessage('pending', config.priceVnd, null),
    });
  }

  // ── Chỉ để ĐO: chỉ tồn tại khi provider là `fake`, và chỉ khi bật rõ bằng env. ──
  if (path === '/v1/billing/fake/pay') {
    if (config.provider !== 'fake' || String(env.EDUGAME_ALLOW_FAKE_PAYMENTS || '') !== '1') {
      return json({ error: 'Không có đường này.', code: 'not_found' }, 404);
    }
    if (request.method !== 'POST') return json({ error: 'Chỉ nhận POST.' }, 405);
    const latest = await db.latestOrder(userId);
    if (!latest) return json({ error: 'Chưa có đơn nào để trả.', code: 'no_order' }, 409);
    const status = effectiveOrderStatus({ status: latest.status, expiresAt: latest.expiresAt }, now);
    if (status !== 'pending') return json({ ok: true, applied: false, reason: status });
    const won = await db.markPaid(latest.providerRef, now);
    if (!won) return json({ ok: true, applied: false, reason: 'already_paid' });
    const next = applyPaidOrder(await db.subscriptionOf(userId), {
      provider: latest.provider,
      providerRef: latest.providerRef,
      amountVnd: latest.amountVnd,
      paidAt: now,
    }, soldPeriodDays(latest, config));
    await db.saveSubscription(userId, next);
    return json({ ok: true, applied: true, plan: PAID_PLAN, periodEnd: next.periodEnd!.toISOString() });
  }

  if (path === '/v1/billing/fake/' + path.split('/').pop()) {
    return html(
      '<h2 style="margin:0 0 .5rem">Thanh toán thử (chưa phải tiền thật)</h2>' +
        '<p>Máy chủ này đang chạy nhà cung cấp <code>fake</code> để đo luồng mở gói. ' +
        'Không có khoản tiền nào bị trừ.</p>'
    );
  }

  return json({ error: 'Không có đường này.', code: 'not_found' }, 404);
}
