// server/billing-provider.ts — phần "hình dạng" của nhà cung cấp, không phải phần gọi mạng.
//
// Cùng lý do với `server/billing.ts`: bản Express và bản Workers phải ký cùng một chuỗi và
// đọc cùng một webhook. Hàm ở đây đều THUẦN (nhận `fetch`/`hmac` từ môi trường) nên test
// được, và adapter chỉ còn là ba dòng nối dây ở mỗi gateway.
import { payosSignData } from './billing.js';

export interface PayosLinkInput {
  orderCode: number;
  amount: number;
  description: string;
  returnUrl: string;
  cancelUrl: string;
  /** HMAC-SHA256 hex của chuỗi đã ký. Môi trường cung cấp: WebCrypto hay `node:crypto`. */
  sign: (data: string) => Promise<string>;
}

export interface PayosLinkBody {
  orderCode: number;
  amount: number;
  description: string;
  items: { name: string; quantity: number; price: number }[];
  returnUrl: string;
  cancelUrl: string;
  signature: string;
}

/**
 * Body gửi PayOS. `description` bị cắt còn 25 ký tự theo giới hạn của họ, và **không dấu** —
 * PayOS từ chối nội dung có ký tự ngoài ASCII trong một số ngân hàng, và một đơn bị từ chối
 * vì dấu tiếng Việt là một lỗi không ai đoán được.
 */
export async function payosLinkBody(input: PayosLinkInput): Promise<PayosLinkBody> {
  const description = asciiDescription(input.description);
  const fields = {
    amount: input.amount,
    cancelUrl: input.cancelUrl,
    description,
    orderCode: input.orderCode,
    returnUrl: input.returnUrl,
  };
  const signature = await input.sign(payosSignData(fields));
  return {
    ...fields,
    items: [{ name: description, quantity: 1, price: input.amount }],
    signature,
  };
}

export function asciiDescription(text: string): string {
  const folded = String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/đ/giu, 'd')
    .replace(/[^\x20-\x7E]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  return folded.slice(0, 25) || 'EduGame Pro';
}

/** Các trường PayOS gửi trong webhook, chuẩn hoá về một hình dạng để luật tiền đọc được. */
export interface PayosWebhook {
  code: string;
  desc: string;
  orderCode: number | null;
  amount: number | null;
  signature: string;
  data: Record<string, string | number | null | undefined>;
  /** `PAID` khi PayOS báo thành công; mọi giá trị khác đều KHÔNG mở Pro. */
  providerStatus: string;
}

export function payosWebhookFields(body: unknown): PayosWebhook {
  const raw = (body || {}) as Record<string, unknown>;
  const data = (raw.data && typeof raw.data === 'object' ? raw.data : {}) as Record<string, string | number | null>;
  const orderCode = Number(data.orderCode ?? NaN);
  const amount = Number(data.amount ?? NaN);
  return {
    code: String(raw.code ?? ''),
    desc: String(raw.desc ?? ''),
    orderCode: Number.isFinite(orderCode) ? orderCode : null,
    amount: Number.isFinite(amount) ? amount : null,
    signature: String(raw.signature ?? ''),
    data,
    // PayOS: `code === '00'` là thành công. Webhook chỉ được gửi khi đã thanh toán, nhưng ta
    // vẫn đọc `code` thay vì tin vào việc "webhook tới là đã trả tiền".
    providerStatus: String(raw.code ?? '') === '00' ? 'PAID' : 'NOT_PAID',
  };
}

/** Chuỗi cần ký của webhook = chính `data` đã sắp xếp theo key. */
export function payosWebhookSignData(webhook: PayosWebhook): string {
  return payosSignData(webhook.data);
}

// ---------------------------------------------------------------------------
// VNPay — cổng thứ hai (#366). Khác PayOS ở ba điểm, và cả ba đều là chỗ dễ sai:
//   1. PayOS gọi API để lấy link; VNPay chỉ cần DỰNG URL có chữ ký ⇒ không có lời gọi mạng
//      nào khi tạo đơn, nên không có "nhà cung cấp đang lỗi" ở bước này.
//   2. Chữ ký là HMAC-SHA512 trên chuỗi `key=value` đã sắp xếp, và GIÁ TRỊ PHẢI ĐƯỢC
//      URL-ENCODE đúng như PHP `urlencode` (dấu cách thành `+`). Ký trên giá trị thô thì
//      VNPay từ chối mọi đơn có dấu cách — tức mọi đơn, vì mô tả luôn có dấu cách.
//   3. `vnp_Amount` là số tiền nhân 100. Quên nhân là bán gói 99.000đ với giá 990đ.
// ---------------------------------------------------------------------------

/** Môi trường sandbox của VNPay. URL production do merchant cấu hình qua `VNPAY_URL`. */
export const VNPAY_DEFAULT_URL = 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';

/** `urlencode` kiểu PHP: dấu cách thành `+`, và `!'()*` cũng bị mã hoá. */
export function vnpayEncode(value: string): string {
  return encodeURIComponent(String(value))
    .replace(/%20/gu, '+')
    .replace(/[!'()*]/gu, (char) => '%' + char.charCodeAt(0).toString(16).toUpperCase());
}

/** Chuỗi cần ký: bỏ `vnp_SecureHash*`, sắp xếp key a→z, mỗi cặp `key=value` đã encode. */
export function vnpaySignData(params: Record<string, string>): string {
  return Object.keys(params)
    .filter((key) => key.startsWith('vnp_') && key !== 'vnp_SecureHash' && key !== 'vnp_SecureHashType')
    .sort()
    .map((key) => vnpayEncode(key) + '=' + vnpayEncode(params[key]))
    .join('&');
}

/**
 * URL thanh toán đầy đủ. `sign` do môi trường cung cấp (WebCrypto ở Worker, `node:crypto` khi
 * test) để tệp này không phụ thuộc vào một runtime cụ thể.
 */
export async function vnpayCheckoutUrl(input: {
  base: string;
  params: Record<string, string>;
  secret: string;
  sign: (data: string, secret: string) => Promise<string>;
}): Promise<string> {
  const signature = await input.sign(vnpaySignData(input.params), input.secret);
  const query = Object.entries({ ...input.params, vnp_SecureHashType: 'HmacSHA512', vnp_SecureHash: signature })
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => vnpayEncode(key) + '=' + vnpayEncode(String(value)))
    .join('&');
  return input.base.replace(/\?.*$/u, '').replace(/\/+$/u, '') + '?' + query;
}

/** Chữ ký nhận được có khớp với chữ ký tự tính không. So sánh không thoát sớm. */
export function vnpaySignatureOk(params: Record<string, string>, expected: string): boolean {
  const given = String(params.vnp_SecureHash || '');
  if (!given || given.length !== expected.length) return false;
  let diff = 0;
  for (let index = 0; index < given.length; index += 1) diff |= given.charCodeAt(index) ^ expected.charCodeAt(index);
  return diff === 0;
}

/** `2026-11-26T09:00:00Z` → `20261126160000` (giờ Việt Nam, đúng định dạng VNPay đòi). */
export function vnpayTime(at: Date): string {
  const shifted = new Date(at.getTime() + 7 * 3_600_000);
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    shifted.getUTCFullYear().toString() +
    pad(shifted.getUTCMonth() + 1) +
    pad(shifted.getUTCDate()) +
    pad(shifted.getUTCHours()) +
    pad(shifted.getUTCMinutes()) +
    pad(shifted.getUTCSeconds())
  );
}

export interface VnpayWebhook {
  /** `vnp_TxnRef` của ta = `orderCode` đã ghi trong `billing_orders.provider_ref`. */
  providerRef: string;
  amountVnd: number | null;
  /** `00`/`00` mới là đã trả tiền. Xem `providerStatus`. */
  responseCode: string;
  transactionStatus: string;
  /** `PAID` chỉ khi CẢ HAI mã đều `00` — VNPay có trường hợp `ResponseCode=00` mà giao dịch
   *  chưa thanh toán xong (`TransactionStatus` khác `00`). */
  providerStatus: string;
  paidAt: Date | null;
}

/** Đọc IPN/Return của VNPay (query string) thành hình dạng luật tiền hiểu được. */
export function vnpayWebhookFields(params: Record<string, string>): VnpayWebhook {
  const amount = Math.trunc(Number(params.vnp_Amount || 0) / 100);
  const responseCode = String(params.vnp_ResponseCode || '');
  const transactionStatus = String(params.vnp_TransactionStatus || '');
  const paid = responseCode === '00' && transactionStatus === '00';
  // `vnp_PayDate` là `yyyyMMddHHmmss` theo giờ VN.
  const raw = String(params.vnp_PayDate || '');
  let paidAt: Date | null = null;
  if (/^\d{14}$/u.test(raw)) {
    const iso = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T${raw.slice(8, 10)}:${raw.slice(10, 12)}:${raw.slice(12, 14)}+07:00`;
    const parsed = new Date(iso);
    paidAt = Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return {
    providerRef: String(params.vnp_TxnRef || ''),
    amountVnd: Number.isFinite(amount) && amount > 0 ? amount : null,
    responseCode,
    transactionStatus,
    providerStatus: paid ? 'PAID' : 'NOT_PAID',
    paidAt,
  };
}
