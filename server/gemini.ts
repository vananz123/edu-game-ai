// server/gemini.ts — một lượt gọi Gemini để lấy JSON trò chơi, có thử lại.
//
// Tách khỏi `index.ts` để đo được: ngày 24/11 nhà cung cấp trả `503 UNAVAILABLE`
// ("high demand") cho đúng model vừa trả `200` vài giây trước. Không thử lại thì
// một giáo viên bấm "Tạo" sẽ nhận "Dịch vụ AI đang gặp lỗi" vì một sự cố 2 giây
// của Google. Thử lại là hành vi phải có test, không phải một vòng `for` tin được.

export interface GeminiConfig {
  apiKey: string;
  model: string;
  /** Cho test bơm hàm giả; mặc định là `fetch` toàn cục. */
  fetchImpl?: typeof fetch;
  /** Cho test khỏi phải chờ thật. */
  sleep?: (milliseconds: number) => Promise<void>;
  timeoutMs?: number;
}

export type GeminiResult =
  | { ok: true; text: string; attempts: number }
  | { ok: false; status: number; body: string; attempts: number };

/** Mã trạng thái đáng thử lại: nhà cung cấp bận, không phải yêu cầu sai. */
export const RETRYABLE_STATUS = [429, 500, 502, 503, 504];
// Bốn lượt, tổng ~9 giây chờ. Đo trên máy thật (#344): những đợt "high demand" của
// Gemini kéo dài HÀNG PHÚT, và ba lượt trong 1,2 giây chỉ đủ để biến một đợt bận thành
// một lần hỏng chắc chắn. Giáo viên bấm "Tạo" thì đáng để chờ thêm vài giây — nhưng vẫn
// phải có trần, vì một yêu cầu treo vô hạn còn tệ hơn một câu "thử lại sau".
const DELAYS_MS = [600, 2000, 5000];

export function shouldRetry(status: number): boolean {
  return RETRYABLE_STATUS.includes(status);
}

export async function requestGameJson(prompt: string, config: GeminiConfig): Promise<GeminiResult> {
  const fetchImpl = config.fetchImpl || fetch;
  const sleep = config.sleep || (ms => new Promise<void>(resolve => setTimeout(resolve, ms)));
  const url =
    'https://generativelanguage.googleapis.com/v1beta/models/' +
    encodeURIComponent(config.model) +
    ':generateContent?key=' +
    encodeURIComponent(config.apiKey);
  const request = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: 'Bạn là chuyên gia thiết kế trò chơi giáo dục tiếng Việt. Đảm bảo câu hỏi rõ ràng, đáp án nhất quán và không bịa dữ kiện.' }],
      },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, responseMimeType: 'application/json' },
    }),
    signal: AbortSignal.timeout(config.timeoutMs ?? 90_000),
  } as const;

  let attempts = 0;
  let status = 0;
  let body = '';
  for (let round = 0; round <= DELAYS_MS.length; round += 1) {
    attempts += 1;
    const response = await fetchImpl(url, request as RequestInit);
    status = response.status;
    if (response.ok) {
      const payload = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = (payload.candidates?.[0]?.content?.parts || []).map(part => part.text || '').join('');
      return { ok: true, text, attempts };
    }
    body = (await response.text()).slice(0, 1000);
    if (!shouldRetry(status) || round === DELAYS_MS.length) break;
    await sleep(DELAYS_MS[round]);
  }
  return { ok: false, status, body, attempts };
}
