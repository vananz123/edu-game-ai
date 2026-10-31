/**
 * Provider-agnostic transport for chat completions.
 *
 * Everything here is pure or injectable so it can be unit-tested without
 * Electron, a model, or the network:
 *  - `buildChatRequestBody` / `readAssistantContent` / `parseModelJson` were
 *    extracted from `main.ts` so the old `ai:*` channels and the new lesson
 *    workflow share one implementation and one set of error messages.
 *  - `AiRequestRegistry` maps a renderer `requestId` to an `AbortController`
 *    so `ai:cancel` can stop an in-flight local request.
 *  - `requestChatJson` performs one HTTP round trip through an injected `send`
 *    function, so tests can mock the provider completely.
 */
import type { ChatMessage } from './lesson-prompts';

export type AiTransportCode =
  | 'AI_CONFIG'
  | 'AI_NOT_RUNNING'
  | 'AI_CONNECTION'
  | 'AI_NETWORK'
  | 'AI_TIMEOUT'
  | 'AI_CANCELLED'
  | 'AI_HTTP'
  | 'AI_PROVIDER_HTTP'
  | 'AI_AUTH'
  | 'AI_QUOTA'
  | 'AI_RATE_LIMIT'
  | 'AI_MODEL_NOT_FOUND'
  | 'AI_NO_PROVIDER'
  | 'AI_PROVIDER_NOT_READY'
  | 'AI_PROVIDER_NOT_ELIGIBLE'
  | 'AI_KEY_STORAGE_UNAVAILABLE'
  | 'AI_EMPTY'
  | 'AI_TRUNCATED'
  | 'AI_INVALID_JSON'
  | 'AI_BUSY';

export class AiTransportError extends Error {
  readonly code: AiTransportCode;
  readonly rawContent: string | null;
  readonly status: number | null;

  constructor(
    code: AiTransportCode,
    message: string,
    options: { rawContent?: string | null; status?: number | null; cause?: unknown } = {}
  ) {
    super(message);
    this.name = 'AiTransportError';
    this.code = code;
    this.rawContent = options.rawContent ?? null;
    this.status = options.status ?? null;
    if (options.cause !== undefined) (this as { cause?: unknown }).cause = options.cause;
  }
}

/** Name used as the abort reason when a teacher cancels a request. */
export const CANCEL_REASON_NAME = 'AiCancelledError';

export function createCancelError(message = 'Yêu cầu AI đã bị huỷ.'): Error {
  const error = new Error(message);
  error.name = CANCEL_REASON_NAME;
  return error;
}

export function isCancelReason(reason: unknown): boolean {
  return Boolean(reason) && (reason as { name?: string }).name === CANCEL_REASON_NAME;
}

// ---------------------------------------------------------------------------
// Payload building / response reading
// ---------------------------------------------------------------------------

export interface ResponseSchemaRef {
  name: string;
  schema: unknown;
}

export function buildChatRequestBody(options: {
  model: string;
  mode: 'local' | 'online';
  temperature: number;
  generation: Record<string, unknown>;
  messages: ChatMessage[];
  responseSchema?: ResponseSchemaRef | null;
}): Record<string, unknown> {
  const { model, mode, temperature, generation, messages, responseSchema } = options;
  return {
    model,
    temperature,
    ...(mode === 'local' ? { top_p: 1.0, top_k: 20, presence_penalty: 0.0 } : {}),
    ...generation,
    response_format: mode === 'local' && responseSchema
      ? {
        type: 'json_schema',
        json_schema: { name: responseSchema.name, strict: true, schema: responseSchema.schema }
      }
      : { type: 'json_object' },
    messages
  };
}

/** Strips the markdown fences small models like to wrap JSON in. */
export function cleanModelJson(content: string): string {
  return String(content ?? '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
}

export function parseModelJson(content: string): unknown {
  const cleaned = cleanModelJson(content);
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new AiTransportError(
      'AI_INVALID_JSON',
      'AI trả về JSON không hợp lệ. Hãy thử lại hoặc rút ngắn tài liệu.',
      { rawContent: cleaned }
    );
  }
}

/**
 * O6d: input-token count reported by the server, when it reports one. Used for
 * prefill metrics only — `null` is normal (older llama.cpp builds omit `usage`)
 * and must never be treated as a failure.
 */
export function readPromptTokens(data: unknown): number | null {
  const usage = (data as { usage?: { prompt_tokens?: unknown } } | undefined)?.usage;
  const value = usage?.prompt_tokens;
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? Math.round(numeric) : null;
}

/**
 * Maps a failed cloud response to the code the teacher can act on (DECISIONS #132
 * §D6). Status alone is not enough: OpenAI answers an exhausted balance with `429`,
 * and a Gemini key over its free allowance also arrives as `429`, so the body is
 * inspected for the provider's own error code before falling back to the status.
 *
 * `body` is the response text (already truncated by the caller is fine); it is only
 * pattern-matched, never stored in the error, because it may echo request details.
 */
export function classifyProviderHttpError(
  status: number,
  body = ''
): { code: AiTransportCode; message: string } {
  const text = String(body || '').toLowerCase();
  const modelMissing = /model[_ ]?not[_ ]?found|does not exist|not found|unsupported model|unknown model|invalid model/.test(text);
  // An exhausted balance outranks the status: OpenAI reports it as 429, and a 429
  // the teacher can only fix by topping up must not read "wait and retry".
  if (status === 402 || text.includes('insufficient_quota') || text.includes('billing') || text.includes('exceeded your current quota')) {
    return { code: 'AI_QUOTA', message: 'Tài khoản nhà cung cấp đã hết hạn mức hoặc chưa bật thanh toán. Hãy kiểm tra trang quản lý của nhà cung cấp.' };
  }
  if (status === 401 || status === 403) {
    return { code: 'AI_AUTH', message: 'API key không hợp lệ, bị thu hồi hoặc không có quyền dùng model này. Hãy nhập lại khoá trong Cài đặt.' };
  }
  if (status === 404 || (status === 400 && modelMissing)) {
    return { code: 'AI_MODEL_NOT_FOUND', message: 'Nhà cung cấp không có model này (hoặc điểm cuối sai). Hãy kiểm tra tên model và base URL trong Cài đặt.' };
  }
  if (status === 429) {
    return { code: 'AI_RATE_LIMIT', message: 'Nhà cung cấp đang giới hạn số yêu cầu. Hãy đợi một lát rồi thử lại.' };
  }
  if (status >= 500) {
    return { code: 'AI_PROVIDER_HTTP', message: `Nhà cung cấp báo lỗi máy chủ (HTTP ${status}). Hãy thử lại sau.` };
  }
  if (status === 400) {
    return { code: 'AI_PROVIDER_HTTP', message: 'Nhà cung cấp từ chối yêu cầu (HTTP 400). Hãy kiểm tra model và nội dung gửi đi.' };
  }
  return { code: 'AI_PROVIDER_HTTP', message: `Nhà cung cấp AI trả về lỗi HTTP ${status}. Kiểm tra endpoint, model và cấu hình xác thực.` };
}

export function readAssistantContent(data: unknown): string {
  const choice = (data as { choices?: Array<{ finish_reason?: string; message?: { content?: unknown; reasoning_content?: unknown } }> })?.choices?.[0];
  if (choice?.finish_reason === 'length') {
    throw new AiTransportError(
      'AI_TRUNCATED',
      'AI hết giới hạn token trước khi hoàn tất câu trả lời. Hãy rút ngắn tài liệu hoặc thử lại.'
    );
  }
  const content = choice?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    // update_plan_3 §7: measured on llama.cpp b11681 + Qwen3.5-2B Q4_0, an
    // `enable_thinking: true` turn can spend the whole budget on
    // `reasoning_content` and return no `content` (with or without `--jinja`).
    // Say so explicitly instead of a generic "empty" error.
    const reasoning = (choice?.message as { reasoning_content?: unknown } | undefined)?.reasoning_content;
    if (typeof reasoning === 'string' && reasoning.trim()) {
      throw new AiTransportError(
        'AI_EMPTY',
        'Model chỉ trả về suy luận ẩn (reasoning_content) mà không có nội dung chính. '
        + 'Chế độ Thinking chưa dùng được với model/runtime này — hãy chọn Fast và thử lại.'
      );
    }
    throw new AiTransportError(
      'AI_EMPTY',
      'AI không trả về nội dung. Hãy kiểm tra model và nhà cung cấp AI rồi thử lại.'
    );
  }
  return content;
}

// ---------------------------------------------------------------------------
// Timeouts + cancellation
// ---------------------------------------------------------------------------

export interface RequestSignal {
  signal: AbortSignal;
  /** The built-in timeout fired (not a teacher cancel). */
  timedOut(): boolean;
  /** The external signal (teacher cancel) fired. */
  cancelled(): boolean;
}

export function createRequestSignal(options: { timeoutMs?: number; signal?: AbortSignal } = {}): RequestSignal {
  const timeoutMs = Number.isFinite(options.timeoutMs) && (options.timeoutMs as number) > 0
    ? Math.floor(options.timeoutMs as number)
    : 0;
  const external = options.signal ?? null;
  const timeoutSignal = timeoutMs > 0 && typeof AbortSignal.timeout === 'function'
    ? AbortSignal.timeout(timeoutMs)
    : null;
  const anySignal = (AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal }).any;

  let signal: AbortSignal;
  if (external && timeoutSignal && typeof anySignal === 'function') signal = anySignal([external, timeoutSignal]);
  else if (external) signal = external;
  else if (timeoutSignal) signal = timeoutSignal;
  else signal = new AbortController().signal;

  return {
    signal,
    timedOut: () => Boolean(timeoutSignal?.aborted),
    cancelled: () => Boolean(external?.aborted)
  };
}

export interface AiRequestHandle {
  requestId: string;
  signal: AbortSignal;
  /** Must be called in a `finally` block; frees the requestId. */
  done(): void;
}

/**
 * Tracks in-flight AI requests by `requestId` so `ai:cancel` can abort them.
 * One registry lives for the whole main process.
 */
/**
 * Process-wide single-flight gate for local-model work.
 *
 * Request ids only protect a single renderer action from being submitted twice;
 * two different buttons/projects can still launch two llama.cpp generations at
 * the same time, doubling memory use and slowing both to a crawl. This gate
 * rejects any overlapping AI job (including a duplicate of the same logical job)
 * with `AI_BUSY`. The lock is always released in `finally`.
 */
export class AiSingleFlight {
  private active: { key: string; label: string; startedAt: number; providerId: string } | null = null;

  get busy(): boolean {
    return this.active !== null;
  }

  get activeLabel(): string {
    return this.active ? this.active.label : '';
  }

  /** Which provider the running task uses (empty when unknown). */
  get activeProviderId(): string {
    return this.active ? this.active.providerId : '';
  }

  get activeKey(): string {
    return this.active ? this.active.key : '';
  }

  async run<T>(key: string, label: string, task: () => Promise<T>, providerId = ''): Promise<T> {
    if (this.active) {
      const same = this.active.key === key;
      const message = same
        ? `${label} đang chạy. Hãy đợi yêu cầu hiện tại hoàn tất hoặc huỷ nó trước khi thử lại.`
        : `AI đang xử lý “${this.active.label}”. Không thể bắt đầu “${label}” cùng lúc; hãy đợi hoặc huỷ yêu cầu hiện tại.`;
      throw new AiTransportError('AI_BUSY', message);
    }
    const token = { key, label, startedAt: Date.now(), providerId: String(providerId || '') };
    this.active = token;
    try {
      return await task();
    } finally {
      if (this.active === token) this.active = null;
    }
  }
}

export class AiRequestRegistry {
  private readonly controllers = new Map<string, AbortController>();

  begin(requestId: string): AiRequestHandle {
    if (typeof requestId !== 'string' || !requestId.trim()) {
      throw new AiTransportError('AI_CONFIG', 'Thiếu mã yêu cầu AI.');
    }
    if (this.controllers.has(requestId)) {
      throw new AiTransportError('AI_CONFIG', `Yêu cầu AI ${requestId} đang chạy.`);
    }
    const controller = new AbortController();
    this.controllers.set(requestId, controller);
    return {
      requestId,
      signal: controller.signal,
      done: () => {
        if (this.controllers.get(requestId) === controller) this.controllers.delete(requestId);
      }
    };
  }

  cancel(requestId: string): boolean {
    const controller = this.controllers.get(requestId);
    if (!controller) return false;
    this.controllers.delete(requestId);
    controller.abort(createCancelError());
    return true;
  }

  cancelAll(): void {
    for (const requestId of [...this.controllers.keys()]) this.cancel(requestId);
  }

  has(requestId: string): boolean {
    return this.controllers.has(requestId);
  }

  get size(): number {
    return this.controllers.size;
  }
}

// ---------------------------------------------------------------------------
// One HTTP round trip
// ---------------------------------------------------------------------------

export interface ChatSendResult {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export type ChatSend = (body: Record<string, unknown>, signal: AbortSignal) => Promise<ChatSendResult>;

export interface ChatJsonOptions {
  model: string;
  mode: 'local' | 'online';
  messages: ChatMessage[];
  /** Output token budget + provider options (see `ai-core/generation-options`). */
  generation: Record<string, unknown>;
  responseSchema?: ResponseSchemaRef | null;
  temperature?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  send: ChatSend;
}

export async function requestChatJson(options: ChatJsonOptions): Promise<unknown> {
  const request = createRequestSignal({
    timeoutMs: options.timeoutMs ?? (options.mode === 'local' ? 300_000 : 90_000),
    signal: options.signal
  });
  const body = buildChatRequestBody({
    model: options.model,
    mode: options.mode,
    temperature: options.temperature ?? (options.mode === 'local' ? 0.2 : 0.3),
    generation: options.generation,
    messages: options.messages,
    responseSchema: options.responseSchema
  });

  let response: ChatSendResult;
  try {
    response = await options.send(body, request.signal);
  } catch (error) {
    throw normalizeSendError(error, request);
  }

  if (!response.ok) {
    const body = typeof response.text === 'function' ? (await response.text()).slice(0, 2_000) : '';
    if (options.mode === 'local') {
      const detail = body.slice(0, 500).trim();
      throw new AiTransportError(
        'AI_HTTP',
        `AI API trả về lỗi HTTP ${response.status}.${detail ? ` ${detail}` : ' Kiểm tra endpoint, model và cấu hình xác thực.'}`,
        { status: response.status }
      );
    }
    // #132: a cloud provider's failure is classified (auth/quota/rate limit/model)
    // so Settings can show what to fix instead of one generic HTTP error.
    const classified = classifyProviderHttpError(response.status, body);
    throw new AiTransportError(classified.code, classified.message, { status: response.status });
  }

  const data = await response.json();
  return parseModelJson(readAssistantContent(data));
}

function normalizeSendError(error: unknown, request: RequestSignal): AiTransportError {
  if (error instanceof AiTransportError) return error;
  if (request.cancelled() || isCancelReason(error)) {
    return new AiTransportError('AI_CANCELLED', 'Yêu cầu AI đã bị huỷ.', { cause: error });
  }
  const name = (error as { name?: string })?.name;
  if (name === 'TimeoutError' || request.timedOut()) {
    return new AiTransportError(
      'AI_TIMEOUT',
      'Yêu cầu AI quá thời gian chờ. Kiểm tra dịch vụ/model hoặc thử lại với tài liệu ngắn hơn.',
      { cause: error }
    );
  }
  if ((error as { cause?: { code?: string } })?.cause?.code === 'ECONNREFUSED') {
    return new AiTransportError(
      'AI_CONNECTION',
      'Không kết nối được AI API. Kiểm tra endpoint, kết nối mạng và chứng thư HTTPS.',
      { cause: error }
    );
  }
  if (name === 'AbortError') {
    return new AiTransportError(
      'AI_TIMEOUT',
      'Yêu cầu AI quá thời gian chờ. Kiểm tra dịch vụ/model hoặc thử lại với tài liệu ngắn hơn.',
      { cause: error }
    );
  }
  if (error instanceof TypeError) {
    return new AiTransportError(
      'AI_CONNECTION',
      'Không kết nối được AI API. Kiểm tra endpoint, kết nối mạng và chứng thư HTTPS.',
      { cause: error }
    );
  }
  return new AiTransportError(
    'AI_CONNECTION',
    error instanceof Error ? error.message : 'Lỗi không xác định khi gọi AI.',
    { cause: error }
  );
}
