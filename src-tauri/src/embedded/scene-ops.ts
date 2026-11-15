/**
 * Gợi ý cảnh minh hoạ (`scene:suggest`), chạy trong V8 nhúng (`deno_core`).
 *
 * Phần LUẬT nằm ở `src/services/ai/scene-suggest.ts` (đã có 12 ca kiểm đơn vị):
 * dựng prompt từ `scene-asset-catalog.ts`, trích khối JSON cân bằng, và cho phản
 * hồi đi qua đúng `normalizeSceneBlueprint` như dữ liệu đọc từ SQLite. Tệp này
 * chỉ làm hai việc thuộc lớp chạy, y như `lesson-ops.ts`:
 *
 *   • HTTP đi qua op đồng bộ `__eg_http` của Rust. Rust giữ endpoint thật, API
 *     key, thời gian chờ, huỷ và khoá một-lượt; V8 chỉ thấy `requestId` + thân
 *     JSON, rồi dựng lại một `Response`-like để `requestChatJson` dùng nguyên
 *     logic phân loại lỗi của bản Electron.
 *   • Không bao giờ trả về `null`: model hỏng, JSON hỏng hay mạng hỏng đều rơi
 *     về cảnh theo `contentCategory` (`sceneBlueprintFromCategory`) kèm `issues`
 *     để lớp trên ghi log. Một khung rỗng là thứ tệ nhất có thể xảy ra với một
 *     câu hỏi đã có ảnh.
 */
import { buildGenerationOptions } from '../../../src/ai-core/generation-options';
import { requestChatJson, type ChatSendResult } from '../../../src/services/ai/ai-transport';
import { suggestSceneBlueprint } from '../../../src/services/ai/scene-suggest';

declare const __eg_http: (payload: string) => string;

/** Đích AI do Rust dựng (endpoint + khoá chỉ sống ở Rust). */
interface SceneTarget {
  requestId?: string;
  model?: string;
  mode?: 'local' | 'online';
}

/** Trần token cho một blueprint: cả cảnh gọn nhất cũng dưới 200 token. */
const SCENE_MAX_TOKENS = 700;

function sendFailure(result: Record<string, unknown>): Error {
  const message = String(result.message || 'Không kết nối được AI API.');
  if (result.kind === 'cancelled') {
    const error = new Error('Yêu cầu AI đã bị huỷ.');
    error.name = 'AiCancelledError';
    return error;
  }
  if (result.kind === 'timeout') {
    const error = new Error(message);
    error.name = 'TimeoutError';
    return error;
  }
  return new TypeError(message);
}

/**
 * Một lượt gợi ý cảnh. `input` = `{ target, question }`.
 *
 * Trả về `{ blueprint, source, issues, acceptedJson }`; `source` là `model` khi
 * phản hồi qua được cổng, `fallback` khi phải dùng cảnh theo danh mục.
 */
export async function suggest(input: Record<string, unknown>) {
  const target = (input?.target || {}) as SceneTarget;
  const question = (input?.question || {}) as Record<string, unknown>;
  const mode = target.mode === 'local' ? 'local' : 'online';

  const result = await suggestSceneBlueprint(
    {
      prompt: String(question.prompt || ''),
      answers: Array.isArray(question.answers) ? (question.answers as string[]) : [],
      category: typeof question.category === 'string' ? question.category : undefined,
      iconName: typeof question.iconName === 'string' ? question.iconName : undefined,
      subject: typeof question.subject === 'string' ? question.subject : undefined,
      grade: typeof question.grade === 'string' ? question.grade : undefined
    },
    async (prompt: string) => {
      const parsed = await requestChatJson({
        model: String(target.model || ''),
        mode,
        messages: [{ role: 'user', content: prompt }],
        generation: buildGenerationOptions(mode, SCENE_MAX_TOKENS),
        responseSchema: null,
        timeoutMs: mode === 'local' ? 120_000 : 45_000,
        send: async (body): Promise<ChatSendResult> => {
          const raw = __eg_http(
            JSON.stringify({ requestId: target.requestId || '', body: JSON.stringify(body) })
          );
          const answer = JSON.parse(String(raw)) as Record<string, unknown>;
          if (!answer.ok) throw sendFailure(answer);
          return {
            ok: true,
            status: Number(answer.status || 200),
            body: String(answer.body ?? ''),
            json: async () => JSON.parse(String(answer.body ?? '{}'))
          } as ChatSendResult;
        }
      });
      // `requestChatJson` đã bóc JSON khỏi phản hồi; đưa lại dạng chuỗi để cổng
      // trong `scene-suggest.ts` là chỗ DUY NHẤT phán xét nội dung.
      return typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
    }
  );

  return {
    blueprint: result.blueprint,
    source: result.source,
    issues: result.issues,
    // Blueprint JSON đã làm sạch, để renderer ghi thẳng vào ô ẩn.
    json: JSON.stringify(result.blueprint)
  };
}
