// supabase.ts — phần nói chuyện với Supabase của gateway chạy trên Cloudflare Workers (#360).
//
// Vì sao viết lại lớp này thay vì dùng `@supabase/supabase-js`: worker chỉ cần 6 phép
// REST (select/insert/update/delete trên 3 bảng), và mỗi thư viện thêm vào worker là thêm
// byte khởi động + thêm một chỗ có thể chứa lỗi. PostgREST là HTTP thường, `fetch` là đủ.
//
// Khoá: `SUPABASE_SERVICE_ROLE_KEY` chỉ sống ở đây (secret của Worker). Nó **không** được
// đi vào phản hồi, không được log, và không có đường nào để client hỏi nó.

import type { QuotaStore } from '../server/quota.js';
import type { UsageLogDb, UsageLogRow } from '../server/usage-log.js';

export interface WorkerEnv {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  GEMINI_API_KEY: string;
  GEMINI_MODEL?: string;
  GATEWAY_VERSION?: string;
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
      const data = await rows<{ plan: string; status: string }>(
        await rest(env, '/subscriptions?user_id=eq.' + userId + '&select=plan,status&limit=1')
      );
      return data[0] || null;
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
