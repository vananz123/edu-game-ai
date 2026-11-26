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
