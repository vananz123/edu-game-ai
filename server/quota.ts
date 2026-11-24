// server/quota.ts — hạn mức tạo game, tính bằng BẢNG chứ không bằng hàm RPC.
//
// Lịch sử: bản đầu gọi `rpc('consume_generation_quota')`. Hàm đó (và `consume_credits`)
// chưa hề tồn tại trên project thật, nên `/v1/generate` không thể chạy — trong khi
// **bảng** đã có và ghi được bằng service_role. Một bước triển khai mà người vận hành
// không chạy được thì không được là điều kiện để sản phẩm hoạt động.
//
// Cách làm ở đây: đọc hạn mức từ `subscriptions`, giữ dòng `usage_monthly`, rồi tăng
// bằng **so-sánh-và-đổi** (`update ... where generations = <giá trị vừa đọc>`). Đó là
// phép nguyên tử ở mức dòng của Postgres: hai request đồng thời không thể cùng thắng
// một dòng, nên không cần `for update` cũng không cần hàm.

export interface PlanRow {
  plan: string;
  status: string;
}

export interface QuotaStore {
  planOf(userId: string): Promise<PlanRow | null>;
  ensureRow(userId: string, month: string): Promise<void>;
  /** `null` = không đọc được dòng hạn mức (lỗi máy chủ, không phải "hết lượt"). */
  readUsed(userId: string, month: string): Promise<number | null>;
  /** Đổi `from` → `to` chỉ khi giá trị trên đĩa VẪN là `from`. Trả về `true` nếu thắng. */
  casBump(userId: string, month: string, from: number, to: number): Promise<boolean>;
}

export const MONTH_LIMITS: Record<string, number> = { free: 5, plus: 100 };

/** Hạn mức theo gói: chỉ `plus` **và** đang `active` mới được 100. */
export function quotaLimitFor(plan: PlanRow | null): number {
  if (!plan) return MONTH_LIMITS.free;
  if (plan.plan === 'plus' && plan.status === 'active') return MONTH_LIMITS.plus;
  return MONTH_LIMITS.free;
}

export interface QuotaGrant {
  allowed: true;
  used: number;
  quotaLimit: number;
  plan: string;
}

export type QuotaOutcome =
  | { ok: true; quota: QuotaGrant }
  | { ok: false; kind: 'exhausted'; quota: { allowed: false; used: number; quotaLimit: number; plan: string } }
  | { ok: false; kind: 'unavailable'; reason: string };

const MAX_CAS_ATTEMPTS = 3;

export async function consumeGeneration(
  store: QuotaStore,
  userId: string,
  month: string,
): Promise<QuotaOutcome> {
  let plan: PlanRow | null;
  try {
    plan = await store.planOf(userId);
    await store.ensureRow(userId, month);
  } catch (error) {
    return { ok: false, kind: 'unavailable', reason: messageOf(error) };
  }
  const quotaLimit = quotaLimitFor(plan);
  const planName = plan && plan.status === 'active' && plan.plan === 'plus' ? 'plus' : 'free';

  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
    let used: number | null;
    try {
      used = await store.readUsed(userId, month);
    } catch (error) {
      return { ok: false, kind: 'unavailable', reason: messageOf(error) };
    }
    if (used === null) {
      return { ok: false, kind: 'unavailable', reason: 'không đọc được dòng usage_monthly' };
    }
    if (used >= quotaLimit) {
      return { ok: false, kind: 'exhausted', quota: { allowed: false, used, quotaLimit, plan: planName } };
    }
    let won: boolean;
    try {
      won = await store.casBump(userId, month, used, used + 1);
    } catch (error) {
      return { ok: false, kind: 'unavailable', reason: messageOf(error) };
    }
    if (won) {
      return { ok: true, quota: { allowed: true, used: used + 1, quotaLimit, plan: planName } };
    }
    // Thua CAS = một request khác vừa tăng cùng dòng; đọc lại giá trị mới rồi thử.
  }
  return { ok: false, kind: 'unavailable', reason: 'tranh chấp hạn mức quá số lần thử' };
}

/**
 * Trả lại lượt khi sinh nội dung THẤT BẠI.
 *
 * Đo được ngày 24/11: nhà cung cấp trả `503` hai lần liên tiếp, và mỗi lần như vậy
 * giáo viên mất một lượt trong 5 lượt của tháng — cho một trò chơi không hề tồn tại.
 * Đã trừ thì phải trả lại khi không có kết quả. Trả lại là best-effort: nếu nó cũng
 * hỏng thì ghi log, không làm hỏng thêm phản hồi lỗi đang có.
 */
export async function refundGeneration(
  store: QuotaStore,
  userId: string,
  month: string,
  grantedUsed: number,
): Promise<boolean> {
  if (grantedUsed <= 1) {
    // Lượt vừa cấp là 1 nghĩa là trước đó 0; trả lại thành 0 vẫn hợp lệ.
    try {
      return await store.casBump(userId, month, 1, 0);
    } catch {
      return false;
    }
  }
  try {
    return await store.casBump(userId, month, grantedUsed, grantedUsed - 1);
  } catch {
    return false;
  }
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'lỗi không rõ';
}

export interface RpcError {
  code?: string;
  message?: string;
  details?: string;
}

/** Hàm RPC chưa được cài (migration chưa chạy) — không phải sự cố tạm thời. */
export function isMissingFunction(error: RpcError | null | undefined): boolean {
  if (!error) return false;
  const text = [error.code, error.message, error.details].filter(Boolean).join(' ');
  return (
    text.includes('PGRST202') ||
    /could not find the function/i.test(text) ||
    /function .* does not exist/i.test(text)
  );
}

export interface QuotaFailure {
  status: number;
  body: { error: string; code: string };
}

export function describeQuotaFailure(error: RpcError | null | undefined): QuotaFailure {
  if (isMissingFunction(error)) {
    return {
      status: 500,
      body: {
        error: 'Máy chủ AI chưa được cài đặt đầy đủ (thiếu hàm hạn mức). Quản trị viên cần chạy tệp migration của máy chủ.',
        code: 'server_not_migrated',
      },
    };
  }
  return {
    status: 503,
    body: { error: 'Không kiểm tra được hạn mức. Vui lòng thử lại sau.', code: 'quota_unavailable' },
  };
}
