// usage-log.ts — một dòng cho mỗi lần gọi AI, để biết lượt/credits đã đi đâu (#351).
//
// Bảng `public.ai_usage_log` đã có từ migration `2026-11-24-account-credits.sql` nhưng chưa
// ai ghi vào. Ghi ở đây KHÔNG phải để tính hạn mức (hạn mức tính bằng bảng `usage_monthly` +
// CAS, xem DECISIONS #343/#348) — đây là sổ: một dòng một lần gọi, đọc được khi giáo viên hỏi
// "tháng này tôi mất gì".
//
// Không bao giờ ghi nội dung bài học hay câu hỏi sinh ra: sổ chỉ giữ số và mã trạng thái.

export type UsageStatus = 'completed' | 'failed';
export type ChargeUnitName = 'generations' | 'credits';

export interface UsageLogRow {
  user_id: string;
  feature: string;
  model: string | null;
  credit_cost: number;
  status: UsageStatus;
  completed_at: string;
  metadata: Record<string, unknown>;
}

export interface UsageLogInput {
  userId: string;
  status: UsageStatus;
  /** Loại việc; mặc định là sinh câu hỏi. */
  kind?: string;
  model?: string | null;
  /** Số đã trừ theo đơn vị của gói — 0 khi lần gọi hỏng và đã được hoàn. */
  cost?: number;
  unit?: ChargeUnitName;
  plan?: string;
  /** Số câu hỏi dùng được trong phản hồi (chỉ có khi thành công). */
  questions?: number;
  /** Mã lỗi của gateway (chỉ có khi hỏng). */
  error?: string | null;
  now?: Date;
}

/** Một dòng sổ từ một lần gọi. Hàm thuần: mọi quy tắc nằm ở đây, không nằm trong route. */
export function usageLogRow(input: UsageLogInput): UsageLogRow {
  const status: UsageStatus = input.status === 'completed' ? 'completed' : 'failed';
  const cost = Number.isFinite(input.cost) ? Math.max(0, Math.trunc(input.cost as number)) : 0;
  const metadata: Record<string, unknown> = {
    unit: input.unit === 'credits' ? 'credits' : 'generations',
    plan: input.plan || null,
    // Sổ KHÔNG giữ nội dung: chỉ số câu dùng được.
    questions: Number.isFinite(input.questions) ? Math.max(0, Math.trunc(input.questions as number)) : 0,
  };
  if (status === 'failed') metadata.error = input.error || 'unknown';
  return {
    user_id: input.userId,
    feature: input.kind || 'question_generation',
    model: input.model || null,
    // Một lần gọi hỏng đã được hoàn ⇒ giá của nó là 0. Ghi số đã trừ rồi trả lại sẽ làm sổ
    // cộng ra một con số không ai thực sự bị trừ.
    credit_cost: status === 'completed' ? cost : 0,
    status,
    completed_at: (input.now || new Date()).toISOString(),
    metadata,
  };
}

export interface UsageLogSink {
  from(table: string): {
    insert(row: UsageLogRow): PromiseLike<{ error: { message: string } | null }>;
  };
}

/**
 * Ghi sổ. KHÔNG ném: sổ hỏng không được làm hỏng một lần gọi mà giáo viên đã trả tiền.
 * Trả về lý do để người vận hành đọc được trong log của máy chủ.
 */
export async function writeUsageLog(
  admin: UsageLogSink,
  row: UsageLogRow
): Promise<{ ok: boolean; reason?: string }> {
  try {
    const { error } = await admin.from('ai_usage_log').insert(row);
    if (error) return { ok: false, reason: error.message };
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'unknown' };
  }
}

// ---------------------------------------------------------------------------
// #357 — một lần bấm là một dòng sổ, kể cả khi mạng đứt rồi thử lại.
//
// Trước đây `POST /v1/generate` chỉ ghi sổ SAU khi trừ lượt, nên một lần thử lại (Rust làm
// mới token rồi gửi lại; hoặc người dùng bấm lại sau khi mạng rớt) thành HAI dòng và HAI lần
// trừ. Cột `idempotency_key` đã có sẵn (unique) từ migration 003, nên cách sửa không cần SQL
// mới: **giữ chỗ trước khi trừ** bằng một dòng `pending`, và từ chối nếu chỗ đó đã `completed`.
// ---------------------------------------------------------------------------

/** Khoá do client sinh cho MỘT lần bấm. Rỗng/sai dạng ⇒ không dùng (hành vi như cũ). */
export function normalizeIdempotencyKey(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const key = raw.trim();
  if (key.length < 8 || key.length > 64) return null;
  return /^[A-Za-z0-9_-]+$/u.test(key) ? key : null;
}

export interface UsageLogClaim {
  userId: string;
  key: string;
  feature?: string;
  unit?: ChargeUnitName;
  plan?: string;
}

/** Dòng `pending`: chưa biết giá, vì lượt chưa bị trừ. */
export function pendingRow(claim: UsageLogClaim, now?: Date): Record<string, unknown> {
  return {
    user_id: claim.userId,
    feature: claim.feature || 'question_generation',
    model: null,
    credit_cost: 0,
    status: 'pending',
    idempotency_key: claim.key,
    created_at: (now || new Date()).toISOString(),
    metadata: { unit: claim.unit === 'credits' ? 'credits' : 'generations', plan: claim.plan || null },
  };
}

export type ClaimOutcome =
  | { ok: true; id: string | null; duplicate: false }
  | { ok: true; id: string; duplicate: true }
  | { ok: false; duplicate: false; reason: string };

/** Nơi lưu sổ — tách khỏi Supabase để luật ở trên test được mà không cần mạng. */
export interface UsageLogDb {
  /** Chèn dòng `pending`; `inserted: false` nghĩa là khoá đã tồn tại. */
  insertPending(row: Record<string, unknown>): Promise<{ inserted: boolean; id: string | null; reason?: string }>;
  findKey(userId: string, key: string): Promise<{ id: string; status: string } | null>;
  finish(id: string, row: UsageLogRow): Promise<{ ok: boolean; reason?: string }>;
  release(id: string): Promise<{ ok: boolean; reason?: string }>;
}

/**
 * Giữ chỗ cho một lần gọi.
 *
 * Luật, và lý do:
 *  - Chỗ đã `completed` ⇒ **trùng**: lần gọi này đã thành công và đã trừ lượt. Trả lời
 *    409 trước khi trừ, nên không bao giờ có lần trừ thứ hai.
 *  - Chỗ đang `pending` hoặc `failed` ⇒ **được thử lại** và DÙNG LẠI dòng đó: lần trước
 *    không sinh ra trò chơi nào (hoặc đã hoàn tiền), nên chặn ở đây là chặn oan.
 *  - Không có chỗ nào ⇒ chèn `pending` và đi tiếp.
 */
export async function claimUsageLog(db: UsageLogDb, claim: UsageLogClaim): Promise<ClaimOutcome> {
  const inserted = await db.insertPending(pendingRow(claim));
  if (inserted.reason) return { ok: false, duplicate: false, reason: inserted.reason };
  if (inserted.inserted) return { ok: true, id: inserted.id, duplicate: false };
  // Khoá đã tồn tại (kể cả khi một lần gọi khác đang chen ngang): đọc trạng thái của nó.
  const existing = await db.findKey(claim.userId, claim.key);
  if (!existing) return { ok: true, id: inserted.id, duplicate: false };
  if (existing.status === 'completed') return { ok: true, id: existing.id, duplicate: true };
  return { ok: true, id: existing.id, duplicate: false };
}

/** Ghi kết quả vào đúng dòng đã giữ chỗ; không có id (không khoá) thì chèn dòng mới. */
export async function settleUsageLog(
  db: UsageLogDb,
  admin: UsageLogSink,
  id: string | null,
  row: UsageLogRow
): Promise<{ ok: boolean; reason?: string }> {
  if (!id) return writeUsageLog(admin, row);
  return db.finish(id, row);
}

/** Nhả chỗ khi chưa trừ gì và cũng chưa gọi AI (ví dụ bị từ chối vì hết lượt). */
export async function releaseUsageLog(db: UsageLogDb, id: string | null): Promise<void> {
  if (!id) return;
  await db.release(id);
}
