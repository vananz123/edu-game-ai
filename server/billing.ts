// server/billing.ts — luật của ĐỒNG TIỀN, viết một lần cho cả hai gateway (#364).
//
// Vì sao luật này nằm ở đây chứ không nằm trong `worker/` hay `server/index.ts`: bản Express
// và bản Workers phải nói **cùng một câu** với giáo viên về giá, về hạn, và về việc một đơn
// đã trả thì mở Pro. Hai bản gateway đã có lần lệch nhau về đơn vị hạn mức (#348); tiền thì
// không được phép có lần thứ hai.
//
// Ba điều luật, mỗi điều là một hàm thuần và có unit test:
//
//   1. **Tiền không đi qua ứng dụng.** Ứng dụng chỉ xin một `checkoutUrl` của nhà cung cấp và
//      mở nó bằng trình duyệt hệ thống. Không có số thẻ, không có mã PIN, không có gì phải
//      che trong binary — và cũng không có gì để rò rỉ.
//
//   2. **Chỉ WEBHOOK ĐÃ XÁC MINH mới mở Pro.** Một chữ ký sai, một số tiền khác giá, hay một
//      đơn đã `paid` đều KHÔNG được mở Pro — nhưng cũng không được trả 5xx, vì nhà cung cấp
//      sẽ gửi lại mãi. Đây là lý do `webhookVerdict()` trả về một *phán quyết*, không phải
//      một lỗi.
//
//   3. **Một `provider_ref` chỉ mở Pro một lần.** Cộng dồn thời hạn khi đơn mới trả trong lúc
//      gói đang còn hạn (`applyPaidOrder`), nên mua 2 kỳ liên tiếp không mất kỳ nào.

/** Gói trả phí. Chỉ một gói: Pro (`plus` trong DB, vì dữ liệu cũ đã dùng tên này). */
export const PAID_PLAN = 'plus';

/** Mốc thời gian của một kỳ trả phí, mặc định 14 ngày (khớp kỳ hạn mức #362). */
export const DEFAULT_PRO_PERIOD_DAYS = 14;

/** Giá mặc định một kỳ Pro, VND. Đổi giá là đổi `plan_pro_price_vnd` trong `server_config`. */
export const DEFAULT_PRO_PRICE_VND = 99_000;

/** Một kỳ Pro được 500 credits (250 lần soạn câu hỏi ở giá 2 credits/lần). */
export const DEFAULT_PRO_CREDITS = 500;

/** Đơn chờ thanh toán quá hạn thì đóng. VietQR hết hạn sau 15 phút; ta cho 20. */
export const ORDER_TTL_MINUTES = 20;

export type OrderStatus = 'pending' | 'paid' | 'expired' | 'failed';
// `none` = chưa cấu hình. Không có giá trị mặc định nào khác, vì một mặc định `fake` nghĩa là
// một máy chủ quên cấu hình lại tự nhận mình đang chạy chế độ giả lập.
export type ProviderId = 'payos' | 'fake' | 'none';

export interface BillingConfig {
  provider: ProviderId;
  priceVnd: number;
  periodDays: number;
  credits: number;
  /** Thiếu biến nào thì nút "Nâng cấp" phải NÓI RA là chưa cấu hình, không được giả vờ. */
  missing: string[];
}

export interface BillingEnv {
  [key: string]: string | undefined;
}

/**
 * Cấu hình thanh toán đọc từ env. `missing` là danh sách biến còn thiếu, và đó chính là câu
 * trả lời cho "vì sao nút Nâng cấp không chạy" — một cái nút im lặng là một cái nút hỏng.
 */
export function billingConfig(env: BillingEnv): BillingConfig {
  const provider = String(env.EDUGAME_BILLING_PROVIDER || '').trim();
  const price = Math.trunc(Number(env.EDUGAME_PRO_PRICE_VND || DEFAULT_PRO_PRICE_VND));
  const period = Math.trunc(Number(env.EDUGAME_PRO_PERIOD_DAYS || DEFAULT_PRO_PERIOD_DAYS));
  const credits = Math.trunc(Number(env.EDUGAME_PRO_CREDITS || DEFAULT_PRO_CREDITS));
  const missing: string[] = [];
  if (provider !== 'payos' && provider !== 'fake') missing.push('EDUGAME_BILLING_PROVIDER');
  if (provider === 'payos') {
    if (!env.PAYOS_CLIENT_ID) missing.push('PAYOS_CLIENT_ID');
    if (!env.PAYOS_API_KEY) missing.push('PAYOS_API_KEY');
    if (!env.PAYOS_CHECKSUM_KEY) missing.push('PAYOS_CHECKSUM_KEY');
  }
  return {
    provider: provider === 'payos' ? 'payos' : provider === 'fake' ? 'fake' : 'none',
    priceVnd: price > 0 ? price : DEFAULT_PRO_PRICE_VND,
    periodDays: period > 0 ? period : DEFAULT_PRO_PERIOD_DAYS,
    credits: credits > 0 ? credits : DEFAULT_PRO_CREDITS,
    missing,
  };
}

/** `orderCode` của PayOS là số nguyên dương; ta dùng mili-giây và bỏ 3 số cuối cho ngắn. */
export function orderCodeFor(now: Date, salt = 0): number {
  return Math.floor(now.getTime() / 1000) * 1000 + (Math.abs(Math.trunc(salt)) % 1000);
}

/** Hạn của một đơn chờ thanh toán. */
export function orderExpiry(createdAt: Date): Date {
  return new Date(createdAt.getTime() + ORDER_TTL_MINUTES * 60_000);
}

/** `20/11 – 03/12` để câu "Pro tới ngày…" không phải tự đoán định dạng. */
export function periodLabel(start: Date, end: Date): string {
  const day = (d: Date) => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  return `${day(start)} – ${day(end)}`;
}

/**
 * Một đơn còn "chờ" nhưng đã quá hạn thì phải được đọc là đã hết hạn, kể cả khi chưa ai đóng
 * nó trong DB. Nếu không, giáo viên mở link cũ và ứng dụng vẫn nói "đang chờ thanh toán" mãi.
 */
export function effectiveOrderStatus(order: { status: OrderStatus; expiresAt: Date | null }, now: Date): OrderStatus {
  if (order.status !== 'pending') return order.status;
  if (order.expiresAt && order.expiresAt.getTime() <= now.getTime()) return 'expired';
  return 'pending';
}

/** Hạn mới của gói sau khi một đơn `paid` được áp. Cộng dồn nếu gói đang còn hạn. */
export function nextPeriodEnd(sub: { plan: string; status: string; periodEnd: Date | null } | null, now: Date, days: number): Date {
  const active = sub && sub.plan === PAID_PLAN && sub.status === 'active' && sub.periodEnd;
  const base = active && sub!.periodEnd!.getTime() > now.getTime() ? sub!.periodEnd!.getTime() : now.getTime();
  return new Date(base + days * 86_400_000);
}

/**
 * Hàng `subscriptions` sau khi một đơn đã trả được áp.
 *
 * Hàm thuần: nhận hàng hiện tại (có thể null) và trả hàng mới, nên test đo được cả hai nhánh
 * "mua lần đầu" và "gia hạn khi đang còn hạn" mà không cần database.
 */
export interface SubscriptionRow {
  plan: string;
  status: string;
  periodEnd: Date | null;
  provider: string | null;
  providerRef: string | null;
  priceVnd: number | null;
}

export function applyPaidOrder(
  current: SubscriptionRow | null,
  order: { provider: string; providerRef: string; amountVnd: number; paidAt: Date },
  days: number
): SubscriptionRow {
  return {
    plan: PAID_PLAN,
    status: 'active',
    periodEnd: nextPeriodEnd(current, order.paidAt, days),
    provider: order.provider,
    providerRef: order.providerRef,
    priceVnd: order.amountVnd,
  };
}

/** Gói đang thật sự có hiệu lực tại `now` — hết hạn thì là free, dù cột `plan` còn ghi `plus`. */
export function effectivePlan(
  sub: { plan: string; status: string; periodEnd: Date | null } | null,
  now: Date
): { plan: 'free' | 'plus'; status: string } {
  if (!sub) return { plan: 'free', status: 'inactive' };
  if (sub.plan !== PAID_PLAN || sub.status !== 'active') return { plan: 'free', status: sub.status || 'inactive' };
  // Hàng cũ (trước #364) không có `period_end`: coi như còn hiệu lực theo `status`, để một
  // khách Pro đang dùng không bị hạ gói chỉ vì ta thêm cột.
  if (sub.periodEnd && sub.periodEnd.getTime() <= now.getTime()) return { plan: 'free', status: 'expired' };
  return { plan: 'plus', status: 'active' };
}

export type WebhookVerdict =
  | { kind: 'activate'; providerRef: string; amountVnd: number; paidAt: Date }
  | { kind: 'ignore'; reason: 'signature' | 'not_paid' | 'amount_mismatch' | 'unknown_order' | 'malformed' };

/**
 * Phán quyết cho một webhook. KHÔNG ném lỗi: mỗi nhánh trả về một lý do đọc được, vì
 * "webhook hỏng" không phải là một câu trả lời cho người vận hành.
 *
 * `signatureOk` do adapter tính (HMAC), hàm này chỉ quyết định.
 */
export function webhookVerdict(input: {
  signatureOk: boolean;
  /** Trạng thái nhà cung cấp báo: chỉ `PAID` mới có nghĩa. */
  providerStatus: string;
  /** Số tiền THỰC NHẬN, không phải số tiền ta xin. */
  paidAmount: number | null;
  /** Số tiền của đơn trong DB. */
  orderAmount: number | null;
  providerRef: string | null;
  paidAt: Date | null;
}): WebhookVerdict {
  if (!input.signatureOk) return { kind: 'ignore', reason: 'signature' };
  if (!input.providerRef || input.orderAmount === null) return { kind: 'ignore', reason: 'unknown_order' };
  if (String(input.providerStatus).toUpperCase() !== 'PAID') return { kind: 'ignore', reason: 'not_paid' };
  if (input.paidAmount === null || input.paidAmount !== input.orderAmount) {
    // Thiếu tiền / thừa tiền đều không mở gói: một đơn 99.000đ trả 9.900đ mà vẫn mở Pro là
    // bán lỗ, còn thừa tiền thì giáo viên cần được hoàn chứ không phải bị đoán ý.
    return { kind: 'ignore', reason: 'amount_mismatch' };
  }
  return {
    kind: 'activate',
    providerRef: input.providerRef,
    amountVnd: input.paidAmount,
    paidAt: input.paidAt || new Date(),
  };
}

/**
 * Chuỗi để ký/kiểm chữ ký của PayOS: các cặp `key=value`, **sắp xếp theo key**, nối bằng `&`,
 * bỏ qua `undefined`/`null`/chuỗi rỗng. Đây là hàm thuần để test được mà không cần khoá thật;
 * HMAC nằm ở adapter (`hmacHex` do môi trường cung cấp: WebCrypto hay `node:crypto`).
 */
export function payosSignData(fields: Record<string, string | number | null | undefined>): string {
  return Object.keys(fields)
    .filter((key) => {
      const value = fields[key];
      return value !== undefined && value !== null && String(value) !== '';
    })
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join('&');
}

/** So sánh hai chữ ký hex mà không thoát ra ở byte đầu tiên khác nhau. */
export function signaturesEqual(a: string, b: string): boolean {
  const left = String(a || '').trim().toLowerCase();
  const right = String(b || '').trim().toLowerCase();
  if (left.length !== right.length || left.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

/** Câu nói với giáo viên về trạng thái một đơn. Dùng cho UI và cho thông báo lỗi. */
export function orderMessage(status: OrderStatus, priceVnd: number, end: Date | null): string {
  const price = `${Math.round(priceVnd).toLocaleString('vi-VN')}đ`;
  if (status === 'pending') return `Đang chờ chuyển khoản ${price}. Gói Pro mở ngay khi tiền tới.`;
  if (status === 'paid') return end ? `Đã thanh toán. Pro có hiệu lực tới ${periodLabel(new Date(), end)}.` : 'Đã thanh toán.';
  if (status === 'expired') return `Đơn ${price} đã hết hạn thanh toán. Bấm nâng cấp để tạo đơn mới.`;
  return `Đơn ${price} chưa hoàn tất. Chưa có khoản nào bị trừ.`;
}
