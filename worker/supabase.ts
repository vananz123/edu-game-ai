// supabase.ts — phần nói chuyện với Supabase của gateway chạy trên Cloudflare Workers (#360).
//
// Vì sao viết lại lớp này thay vì dùng `@supabase/supabase-js`: worker chỉ cần 6 phép
// REST (select/insert/update/delete trên 3 bảng), và mỗi thư viện thêm vào worker là thêm
// byte khởi động + thêm một chỗ có thể chứa lỗi. PostgREST là HTTP thường, `fetch` là đủ.
//
// Khoá: `SUPABASE_SERVICE_ROLE_KEY` chỉ sống ở đây (secret của Worker). Nó **không** được
// đi vào phản hồi, không được log, và không có đường nào để client hỏi nó.

import { effectivePlan } from '../server/billing.js';
import type { QuotaStore } from '../server/quota.js';
import type { UsageLogDb, UsageLogRow } from '../server/usage-log.js';

export interface WorkerEnv {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  GEMINI_API_KEY: string;
  GEMINI_MODEL?: string;
  GATEWAY_VERSION?: string;
  // #364 — thanh toán. Tất cả đều TUỲ CHỌN: thiếu thì `billingConfig().missing` nói ra tên
  // biến còn thiếu và nút Nâng cấp báo "chưa cấu hình", không phải im lặng.
  EDUGAME_BILLING_PROVIDER?: string;
  EDUGAME_PRO_PRICE_VND?: string;
  EDUGAME_PRO_PERIOD_DAYS?: string;
  EDUGAME_PRO_CREDITS?: string;
  EDUGAME_PUBLIC_URL?: string;
  EDUGAME_ALLOW_FAKE_PAYMENTS?: string;
  PAYOS_CLIENT_ID?: string;
  PAYOS_API_KEY?: string;
  PAYOS_CHECKSUM_KEY?: string;
  // #366 — VNPay.
  VNPAY_TMN_CODE?: string;
  VNPAY_HASH_SECRET?: string;
  VNPAY_URL?: string;
  [key: string]: string | undefined;
}

interface RestOptions {
  method?: string;
  body?: unknown;
  prefer?: string;
  headers?: Record<string, string>;
}

/** Gọi PostgREST bằng service_role. Ném lỗi có tên, để route quyết định mã trả về. */
export async function rest(env: WorkerEnv, path: string, options: RestOptions = {}): Promise<Response> {
  const headers: Record<string, string> = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY,
    ...(options.headers || {}),
  };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.prefer) headers.Prefer = options.prefer;
  return fetch(env.SUPABASE_URL.replace(/\/+$/u, '') + '/rest/v1' + path, {
    method: options.method || 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

async function rows<T>(response: Response): Promise<T[]> {
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error('postgrest_' + response.status + ': ' + text.slice(0, 200));
  }
  const data = await response.json().catch(() => []);
  return Array.isArray(data) ? (data as T[]) : [];
}

/**
 * Xác thực token của giáo viên bằng **anon key** (không phải service_role).
 *
 * Đây là chỗ quyết định "ai đang gọi": trả `userId` lấy từ token, nên mọi bảng bên dưới
 * được lọc theo `userId` đó. Service_role chỉ dùng sau bước này, không bao giờ thay nó.
 */
export async function verifyUser(env: WorkerEnv, authorization: string): Promise<string | null> {
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!token) return null;
  const response = await fetch(env.SUPABASE_URL.replace(/\/+$/u, '') + '/auth/v1/user', {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token },
  }).catch(() => null);
  if (!response || !response.ok) return null;
  const body = (await response.json().catch(() => null)) as { id?: string } | null;
  return body && typeof body.id === 'string' && body.id ? body.id : null;
}

/** `QuotaStore` trên `subscriptions` + `usage_monthly`, giữ nguyên luật CAS của `server/quota.ts`. */
export function quotaStore(env: WorkerEnv): QuotaStore {
  const month = (value: string) => encodeURIComponent(value);
  return {
    async planOf(userId) {
      // #364: gói trả phí có NGÀY HẾT HẠN. Đọc `period_end` rồi trả về gói đang thật sự có
      // hiệu lực, để một dòng `plus` còn nằm trong DB sau khi hết hạn không mở credits mãi.
      // Cùng lý do với `subscriptionOf`: một cột chưa có (migration billing chưa chạy) không
      // được phép làm hỏng việc ĐỌC HẠN MỨC của mọi người dùng.
      type PlanRow = { plan: string; status: string; period_end?: string | null };
      let data: PlanRow[];
      try {
        data = await rows<PlanRow>(await rest(env, '/subscriptions?user_id=eq.' + userId + '&select=plan,status,period_end&limit=1'));
      } catch {
        data = await rows<PlanRow>(await rest(env, '/subscriptions?user_id=eq.' + userId + '&select=plan,status&limit=1'));
      }
      if (!data.length) return null;
      const effective = effectivePlan(
        {
          plan: data[0].plan,
          status: data[0].status,
          periodEnd: data[0].period_end ? new Date(data[0].period_end) : null,
        },
        new Date()
      );
      return { plan: effective.plan, status: effective.status };
    },
    async ensureRow(userId, value) {
      await rest(env, '/usage_monthly?on_conflict=user_id,month', {
        method: 'POST',
        body: { user_id: userId, month: value, generations: 0 },
        prefer: 'resolution=ignore-duplicates,return=minimal',
      });
    },
    async readUsed(userId, value) {
      const data = await rows<{ generations: number }>(
        await rest(env, '/usage_monthly?user_id=eq.' + userId + '&month=eq.' + month(value) + '&select=generations&limit=1')
      );
      return data.length ? Number(data[0].generations) : null;
    },
    async casBump(userId, value, from, to) {
      const data = await rows<{ generations: number }>(
        await rest(
          env,
          '/usage_monthly?user_id=eq.' + userId + '&month=eq.' + month(value) + '&generations=eq.' + from + '&select=generations',
          {
            method: 'PATCH',
            body: { generations: to, updated_at: new Date().toISOString() },
            prefer: 'return=representation',
          }
        )
      );
      return data.length === 1;
    },
    async readCredits(userId, value) {
      const data = await rows<{ credits_used: number; credits_limit: number }>(
        await rest(
          env,
          '/usage_monthly?user_id=eq.' + userId + '&month=eq.' + month(value) + '&select=credits_used,credits_limit&limit=1'
        )
      );
      if (!data.length) return null;
      return { used: Number(data[0].credits_used), limit: Number(data[0].credits_limit) };
    },
    async casBumpCredits(userId, value, from, to) {
      const data = await rows<{ credits_used: number }>(
        await rest(
          env,
          '/usage_monthly?user_id=eq.' + userId + '&month=eq.' + month(value) + '&credits_used=eq.' + from + '&select=credits_used',
          {
            method: 'PATCH',
            body: { credits_used: to, updated_at: new Date().toISOString() },
            prefer: 'return=representation',
          }
        )
      );
      return data.length === 1;
    },
    async creditCost(kind) {
      const data = await rows<{ value: unknown }>(
        await rest(env, '/server_config?key=eq.credit_cost_' + encodeURIComponent(kind) + '&select=value&limit=1')
      );
      if (!data.length) return 0;
      const raw = data[0].value;
      const number = typeof raw === 'number' ? raw : Number(String(raw).replace(/"/gu, ''));
      return Number.isFinite(number) ? number : 0;
    },
    async monthlyCredits(plan) {
      const key = plan === 'pro' ? 'quota_pro_monthly_credits' : 'quota_free_monthly_credits';
      const data = await rows<{ value: unknown }>(
        await rest(env, '/server_config?key=eq.' + key + '&select=value&limit=1')
      );
      if (!data.length) return 0;
      const raw = data[0].value;
      const number = typeof raw === 'number' ? raw : Number(String(raw).replace(/"/gu, ''));
      return Number.isFinite(number) ? number : 0;
    },
    async ensureCreditsLimit(userId, value, limit) {
      // Chỉ NÂNG: hạ hạn mức của tháng đang chạy là lấy lại tiền đã hứa.
      await rest(
        env,
        '/usage_monthly?user_id=eq.' + userId + '&month=eq.' + month(value) + '&credits_limit=lt.' + limit,
        { method: 'PATCH', body: { credits_limit: limit }, prefer: 'return=minimal' }
      );
    },
  };
}

/** `UsageLogDb` trên `ai_usage_log` — cùng luật với `server/index.ts` (#357). */
export function usageLogDb(env: WorkerEnv): UsageLogDb {
  return {
    async insertPending(row) {
      const response = await rest(env, '/ai_usage_log?on_conflict=idempotency_key&select=id', {
        method: 'POST',
        body: row,
        prefer: 'resolution=ignore-duplicates,return=representation',
      });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        return { inserted: false, id: null, reason: 'postgrest_' + response.status + ': ' + text.slice(0, 200) };
      }
      const data = (await response.json().catch(() => [])) as { id: string }[];
      return { inserted: data.length > 0, id: data.length ? data[0].id : null };
    },
    async findKey(userId, key) {
      const data = await rows<{ id: string; status: string }>(
        await rest(
          env,
          '/ai_usage_log?user_id=eq.' + userId + '&idempotency_key=eq.' + encodeURIComponent(key) + '&select=id,status&limit=1'
        )
      );
      return data[0] || null;
    },
    async finish(id, row: UsageLogRow) {
      const response = await rest(env, '/ai_usage_log?id=eq.' + id, {
        method: 'PATCH',
        body: {
          model: row.model,
          credit_cost: row.credit_cost,
          status: row.status,
          completed_at: row.completed_at,
          metadata: row.metadata,
        },
        prefer: 'return=minimal',
      });
      return response.ok ? { ok: true } : { ok: false, reason: 'postgrest_' + response.status };
    },
    async release(id) {
      const response = await rest(env, '/ai_usage_log?id=eq.' + id, { method: 'DELETE', prefer: 'return=minimal' });
      return response.ok ? { ok: true } : { ok: false, reason: 'postgrest_' + response.status };
    },
  };
}

// ---------------------------------------------------------------------------
// #364 — sổ đơn thanh toán. Ba phép ghi, và cả ba đều là "ghi rồi thôi":
// không có phép nào cho client gọi, không có phép nào trả về khoá.
// ---------------------------------------------------------------------------
export interface OrderRow {
  userId: string;
  providerRef: string;
  provider: string;
  amountVnd: number;
  status: 'pending' | 'paid' | 'expired' | 'failed';
  checkoutUrl: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  /** Số ngày ĐÃ BÁN cho đơn này. Trao đúng số này, không trao cấu hình lúc webhook tới. */
  periodDays: number;
}

export interface BillingDb {
  subscriptionOf(userId: string): Promise<{
    plan: string;
    status: string;
    periodEnd: Date | null;
    provider: string | null;
    providerRef: string | null;
    priceVnd: number | null;
  } | null>;
  saveSubscription(
    userId: string,
    row: { plan: string; status: string; periodEnd: Date | null; provider: string | null; providerRef: string | null; priceVnd: number | null }
  ): Promise<void>;
  createOrder(order: {
    userId: string;
    provider: string;
    providerRef: string;
    amountVnd: number;
    periodDays: number;
    checkoutUrl: string;
    expiresAt: Date;
  }): Promise<void>;
  orderByRef(providerRef: string): Promise<OrderRow | null>;
  latestOrder(userId: string): Promise<OrderRow | null>;
  markPaid(providerRef: string, paidAt: Date): Promise<boolean>;
  /** Hạn mức credits mà máy chủ này THẬT SỰ áp cho gói trả phí (`server_config`). */
  proCredits?(): Promise<number>;
  /** Bảng `billing_orders` đã có trên máy chủ này chưa (migration đã chạy chưa). */
  billingReady?(): Promise<boolean>;
}

interface OrderRest {
  user_id: string;
  provider: string;
  provider_ref: string;
  amount_vnd: number;
  period_days: number | null;
  status: OrderRow['status'];
  checkout_url: string | null;
  expires_at: string | null;
  created_at: string;
}

function orderFromRest(row: OrderRest): OrderRow {
  return {
    userId: row.user_id,
    provider: row.provider,
    providerRef: row.provider_ref,
    amountVnd: Number(row.amount_vnd),
    status: row.status,
    checkoutUrl: row.checkout_url,
    expiresAt: row.expires_at ? new Date(row.expires_at) : null,
    createdAt: new Date(row.created_at),
    periodDays: Number(row.period_days || 0),
  };
}

/**
 * Cột đọc từ `billing_orders`. `period_days` PHẢI có trong danh sách này: thiếu nó thì mọi đơn
 * đọc về đều `periodDays: 0`, và số ngày trao khi tiền về lại lấy từ cấu hình lúc webhook tới —
 * đúng cái bug "#367" sửa. Có test đọc hằng này.
 */
export const ORDER_COLUMNS =
  'user_id,provider,provider_ref,amount_vnd,period_days,status,checkout_url,expires_at,created_at';

export function billingDb(env: WorkerEnv): BillingDb {
  return {
    // Hạn mức credits đang được ÁP là `server_config.quota_pro_monthly_credits` (đường
    // `/v1/generate` đọc đúng khoá đó). Thẻ Pro phải quảng cáo chính con số này, nếu không
    // giáo viên mua 500 mà được 300 (hoặc ngược lại) và cả hai đều đúng ở tệp của nó.
    async proCredits() {
      const store = quotaStore(env);
      return store.monthlyCredits ? store.monthlyCredits('pro') : 0;
    },
    async subscriptionOf(userId) {
      // Database có thể chưa chạy migration billing (#364). Khi đó cột `period_end` chưa
      // tồn tại, PostgREST trả 400 và — nếu không xử lý — cả `/v1/usage` sẽ hỏng cho MỌI
      // người dùng chỉ vì một tính năng chưa bật. Vậy nên đọc được gì thì đọc: hụt cột
      // thì lùi về đúng hình dạng cũ, coi như "chưa có ngày hết hạn".
      const full = '/subscriptions?user_id=eq.' + userId + '&select=plan,status,period_end,provider,provider_ref,price_vnd&limit=1';
      const legacyShape = '/subscriptions?user_id=eq.' + userId + '&select=plan,status&limit=1';
      type Row = {
        plan: string;
        status: string;
        period_end?: string | null;
        provider?: string | null;
        provider_ref?: string | null;
        price_vnd?: number | null;
      };
      let data: Row[];
      try {
        data = await rows<Row>(await rest(env, full));
      } catch {
        data = await rows<Row>(await rest(env, legacyShape));
      }
      if (!data.length) return null;
      const row = data[0];
      return {
        plan: row.plan,
        status: row.status,
        periodEnd: row.period_end ? new Date(row.period_end) : null,
        provider: row.provider || null,
        providerRef: row.provider_ref || null,
        priceVnd: typeof row.price_vnd === 'number' ? row.price_vnd : null,
      };
    },
    async saveSubscription(userId, row) {
      // `merge-duplicates` = upsert theo khoá chính `user_id`. Ghi lại cùng một webhook hai
      // lần cho ra cùng một hàng, không nhân đôi người dùng.
      await rest(env, '/subscriptions?on_conflict=user_id', {
        method: 'POST',
        body: {
          user_id: userId,
          plan: row.plan,
          status: row.status,
          period_end: row.periodEnd ? row.periodEnd.toISOString() : null,
          provider: row.provider,
          provider_ref: row.providerRef,
          price_vnd: row.priceVnd,
          updated_at: new Date().toISOString(),
        },
        prefer: 'resolution=merge-duplicates,return=minimal',
      });
    },
    async createOrder(order) {
      await rest(env, '/billing_orders?on_conflict=provider_ref', {
        method: 'POST',
        body: {
          user_id: order.userId,
          plan: 'plus',
          provider: order.provider,
          provider_ref: order.providerRef,
          amount_vnd: order.amountVnd,
          period_days: order.periodDays,
          status: 'pending',
          checkout_url: order.checkoutUrl,
          expires_at: order.expiresAt.toISOString(),
        },
        prefer: 'resolution=ignore-duplicates,return=minimal',
      });
    },
    async orderByRef(providerRef) {
      const data = await rows<OrderRest>(
        await rest(
          env,
          '/billing_orders?provider_ref=eq.' + encodeURIComponent(providerRef) + '&select=' + ORDER_COLUMNS + '&limit=1'
        )
      );
      return data.length ? orderFromRest(data[0]) : null;
    },
    async latestOrder(userId) {
      const data = await rows<OrderRest>(
        await rest(
          env,
          '/billing_orders?user_id=eq.' + userId + '&select=' + ORDER_COLUMNS + '&order=created_at.desc&limit=1'
        )
      );
      return data.length ? orderFromRest(data[0]) : null;
    },
    async markPaid(providerRef, paidAt) {
      // CAS trên `status`: chỉ đơn còn `pending` mới thành `paid`. Nhờ vậy hai webhook song
      // song không cùng "mở Pro" — dòng thứ hai trả về 0 hàng và bị coi là đã xử lý.
      const data = await rows<{ provider_ref: string }>(
        await rest(
          env,
          '/billing_orders?provider_ref=eq.' + encodeURIComponent(providerRef) + '&status=eq.pending&select=provider_ref',
          { method: 'PATCH', body: { status: 'paid', paid_at: paidAt.toISOString() }, prefer: 'return=representation' }
        )
      );
      return data.length === 1;
    },
    async billingReady() {
      // Hỏi bảng đơn có thật không, bằng một truy vấn rẻ nhất có thể. `false` ở đây là câu
      // "chưa chạy migration", và người dùng sẽ đọc được đúng câu đó thay vì một trang lỗi.
      try {
        await rows(await rest(env, '/billing_orders?select=provider_ref&limit=1'));
        return true;
      } catch {
        return false;
      }
    },
  };
}

/**
 * HMAC-SHA256 hex bằng WebCrypto — môi trường của Worker không có `node:crypto`.
 * Chữ ký PayOS là HMAC trên chuỗi `key=value&…`, khoá là `PAYOS_CHECKSUM_KEY`.
 */
export async function hmacHex(secret: string, data: string): Promise<string> {
  return hmacHexWith('SHA-256', secret, data);
}

/**
 * VNPay ký bằng HMAC-SHA512 (#366), PayOS bằng SHA-256. Hai thuật toán, cùng một khoá API của
 * WebCrypto — tham số hoá thay vì chép hai lần một hàm gần giống hệt.
 */
export async function hmacHexWith(algo: 'SHA-256' | 'SHA-512', secret: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: algo }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
