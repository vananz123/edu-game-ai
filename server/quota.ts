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

  // ── đường credits (gói trả phí, #348) ────────────────────────────────────
  // Năm hàm dưới đây là TUỲ CHỌN, và đó là chủ ý: một kho không giữ được credits thì
  // không được bán credits. Thiếu chúng, mọi gói chạy bằng đếm lượt như free — nói
  // thẳng ra thay vì bán một thứ không đếm được.
  readCredits?(userId: string, month: string): Promise<{ used: number; limit: number } | null>;
  casBumpCredits?(userId: string, month: string, from: number, to: number): Promise<boolean>;
  /** Giá một lần sinh theo `server_config` (`credit_cost_<kind>`). Mặc định 2. */
  creditCost?(kind: string): Promise<number>;
  /** Hạn mức credits/tháng theo gói (`quota_<free|pro>_monthly_credits`). Mặc định 50/500. */
  monthlyCredits?(plan: 'free' | 'pro'): Promise<number>;
  /** Đặt `credits_limit` của dòng tháng khi gói đổi. Chỉ NÂNG, không bao giờ hạ. */
  ensureCreditsLimit?(userId: string, month: string, limit: number): Promise<void>;
}

/** Đơn vị bị trừ. Trả về cho UI, để câu "còn N" không nói sai đơn vị. */
export type ChargeUnit = 'generations' | 'credits';

export const DEFAULT_CREDIT_COST = 2;
export const DEFAULT_MONTHLY_CREDITS = { free: 50, pro: 500 } as const;

export const MONTH_LIMITS: Record<string, number> = { free: 5, plus: 100 };

/** Hạn mức theo gói: chỉ `plus` **và** đang `active` mới được 100. */
export function quotaLimitFor(plan: PlanRow | null): number {
  if (!plan) return MONTH_LIMITS.free;
  if (plan.plan === 'plus' && plan.status === 'active') return MONTH_LIMITS.plus;
  return MONTH_LIMITS.free;
}

export interface UsageSnapshot {
  plan: string;
  status: string;
  month: string;
  unit: ChargeUnit;
  used: number;
  limit: number;
  /** Giá của một lần sinh, theo `unit`. Cần để câu "còn bao nhiêu" đi kèm giá. */
  cost: number;
}

/**
 * Ảnh chụp hạn mức tháng của một người (#354): "tháng này dùng bao nhiêu / còn bao nhiêu",
 * KHÔNG trừ gì. Đây là phép ĐỌC, nên nó phải dùng đúng bộ quy tắc của phép trừ:
 * gói `plus` **và** `active` thì đếm bằng credits, còn lại đếm bằng lượt.
 *
 * `row` là hàng `usage_monthly` của tháng đó (null = chưa có hàng, tức là 0).
 */
export function usageSnapshot(
  plan: PlanRow | null,
  month: string,
  row: { generations?: number; creditsUsed?: number; creditsLimit?: number } | null,
  creditCost: number | null,
  planCreditsLimit: number | null = null
): UsageSnapshot {
  const isPlus = Boolean(plan && plan.plan === 'plus' && plan.status === 'active');
  const unit: ChargeUnit = isPlus ? 'credits' : 'generations';
  const fallbackCost = creditCost && creditCost > 0 ? creditCost : DEFAULT_CREDIT_COST;
  if (!isPlus) {
    return {
      plan: 'free',
      status: (plan && plan.status) || 'inactive',
      month,
      unit,
      used: Math.max(0, Math.trunc(Number(row && row.generations) || 0)),
      limit: MONTH_LIMITS.free,
      cost: 1,
    };
  }
  // Hàng `usage_monthly` có thể còn hạn mức của tháng trước (hoặc của gói cũ). Hiện "còn 50
  // credits" cho một tài khoản được 500 là nói sai tiền của người ta, nên lấy số CAO HƠN
  // giữa hàng và cấu hình của gói.
  const rowLimit = Math.max(0, Math.trunc(Number(row && row.creditsLimit) || 0));
  const configured = Math.max(0, Math.trunc(Number(planCreditsLimit) || 0));
  const limit = Math.max(rowLimit, configured) || DEFAULT_MONTHLY_CREDITS.pro;
  return {
    plan: 'plus',
    status: plan!.status,
    month,
    unit,
    used: Math.max(0, Math.trunc(Number(row && row.creditsUsed) || 0)),
    limit,
    cost: fallbackCost,
  };
}

export interface QuotaGrant {
  allowed: true;
  used: number;
  quotaLimit: number;
  plan: string;
  /** `generations` (free) hay `credits` (plus) — số `used` chỉ có nghĩa kèm đơn vị. */
  unit: ChargeUnit;
  /** Số đã trừ cho lần này: 1 lượt, hoặc giá credits của một lần sinh. */
  cost: number;
}

export type QuotaOutcome =
  | { ok: true; quota: QuotaGrant }
  | {
      ok: false;
      kind: 'exhausted';
      quota: { allowed: false; used: number; quotaLimit: number; plan: string; unit: ChargeUnit; cost: number };
    }
  | { ok: false; kind: 'unavailable'; reason: string };

const MAX_CAS_ATTEMPTS = 3;

export async function consumeGeneration(
  store: QuotaStore,
  userId: string,
  month: string,
  kind: string = 'question_generation',
): Promise<QuotaOutcome> {
  let plan: PlanRow | null;
  try {
    plan = await store.planOf(userId);
    await store.ensureRow(userId, month);
  } catch (error) {
    return { ok: false, kind: 'unavailable', reason: messageOf(error) };
  }
  const isPlus = Boolean(plan && plan.status === 'active' && plan.plan === 'plus');
  if (isPlus && store.readCredits && store.casBumpCredits) {
    return consumeCredits(store, userId, month, kind);
  }
  const quotaLimit = quotaLimitFor(plan);
  const planName = isPlus ? 'plus' : 'free';

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
      return {
        ok: false,
        kind: 'exhausted',
        quota: { allowed: false, used, quotaLimit, plan: planName, unit: 'generations', cost: 1 },
      };
    }
    let won: boolean;
    try {
      won = await store.casBump(userId, month, used, used + 1);
    } catch (error) {
      return { ok: false, kind: 'unavailable', reason: messageOf(error) };
    }
    if (won) {
      return {
        ok: true,
        quota: { allowed: true, used: used + 1, quotaLimit, plan: planName, unit: 'generations', cost: 1 },
      };
    }
    // Thua CAS = một request khác vừa tăng cùng dòng; đọc lại giá trị mới rồi thử.
  }
  return { ok: false, kind: 'unavailable', reason: 'tranh chấp hạn mức quá số lần thử' };
}

/**
 * Gói trả phí bị trừ bằng CREDITS, không bằng đếm lượt (#348).
 *
 * Vì sao không chỉ nâng số lượt: một lần sinh 3 câu và một lần sinh 15 câu không đáng
 * cùng một số tiền, và nhà cung cấp cũng không tính cùng giá. Đếm lượt là đơn vị của bản
 * miễn phí (đủ để thử); credits là đơn vị của bản trả phí (đủ để trả tiền).
 *
 * Nguyên tắc giữ nguyên từ đường generations: từ chối TRƯỚC khi trừ, dùng so-sánh-và-đổi
 * để hai request đồng thời không cùng trừ một dòng, và "không thắng CAS" là *tạm thời*
 * chứ không phải *hết credits*.
 */
async function consumeCredits(
  store: QuotaStore,
  userId: string,
  month: string,
  kind: string,
): Promise<QuotaOutcome> {
  let cost = DEFAULT_CREDIT_COST;
  try {
    const configured = store.creditCost ? await store.creditCost(kind) : DEFAULT_CREDIT_COST;
    // Giá 0/âm/không đọc được thì dùng giá mặc định: bán miễn phí vì một khoá cấu hình
    // thiếu là lỗi làm mất doanh thu mà không ai thấy.
    cost = Number.isFinite(configured) && configured >= 1 ? Math.round(configured) : DEFAULT_CREDIT_COST;
  } catch {
    cost = DEFAULT_CREDIT_COST;
  }
  let limit: number = DEFAULT_MONTHLY_CREDITS.pro;
  try {
    const row = (await store.readCredits!(userId, month)) ?? null;
    if (!row) {
      return { ok: false, kind: 'unavailable', reason: 'không đọc được dòng credits của tháng' };
    }
    limit = Number(row.limit);
    // Dòng tháng tạo trước khi nâng gói còn `credits_limit` của free (50). Nâng lên hạn
    // mức của gói, nhưng không bao giờ hạ — một lần đọc hụt không được làm mất credits.
    const planLimit = store.monthlyCredits ? await store.monthlyCredits('pro') : DEFAULT_MONTHLY_CREDITS.pro;
    if (planLimit > limit) {
      if (store.ensureCreditsLimit) await store.ensureCreditsLimit(userId, month, planLimit);
      limit = planLimit;
    }
  } catch (error) {
    return { ok: false, kind: 'unavailable', reason: messageOf(error) };
  }
  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
    let current: { used: number; limit: number } | null;
    try {
      current = await store.readCredits!(userId, month);
    } catch (error) {
      return { ok: false, kind: 'unavailable', reason: messageOf(error) };
    }
    if (!current) {
      return { ok: false, kind: 'unavailable', reason: 'không đọc được dòng credits của tháng' };
    }
    const used = Number(current.used);
    if (used + cost > limit) {
      return {
        ok: false,
        kind: 'exhausted',
        quota: { allowed: false, used, quotaLimit: limit, plan: 'plus', unit: 'credits', cost },
      };
    }
    let won: boolean;
    try {
      won = await store.casBumpCredits!(userId, month, used, used + cost);
    } catch (error) {
      return { ok: false, kind: 'unavailable', reason: messageOf(error) };
    }
    if (won) {
      return {
        ok: true,
        quota: { allowed: true, used: used + cost, quotaLimit: limit, plan: 'plus', unit: 'credits', cost },
      };
    }
  }
  return { ok: false, kind: 'unavailable', reason: 'tranh chấp credits quá số lần thử' };
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
  options?: { unit?: ChargeUnit; cost?: number },
): Promise<boolean> {
  const unit = (options && options.unit) || 'generations';
  const cost = Math.max(1, Math.round((options && options.cost) || 1));
  if (unit === 'credits') {
    // Credits bị trừ đúng `cost`; trả lại đúng `cost`, và không bao giờ xuống dưới 0.
    if (!store.casBumpCredits) return false;
    try {
      return await store.casBumpCredits(userId, month, grantedUsed, Math.max(0, grantedUsed - cost));
    } catch {
      return false;
    }
  }
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
