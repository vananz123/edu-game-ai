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
