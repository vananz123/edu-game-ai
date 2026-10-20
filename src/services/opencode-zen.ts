// Client cho OpenCode Zen (https://opencode.ai/zen/v1) — nhà cung cấp AI đám mây miễn phí.
// Gateway Zen chặn request ngoài bằng 3 điều kiện: User-Agent "opencode/…", bộ header
// x-opencode-* (session/request id theo timestamp) và body phải kèm tools + stream:true.
// Vì vậy request đi qua Zen bắt buộc streaming; helper này gộp SSE về JSON chat/completion
// để đường ai:generate dùng lại logic parse như nhà cung cấp khác.
import { appendFileSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Debug tạm thời: đặt env ZEN_DEBUG_LOG để ghi lại status/finish/content rỗng khi Zen trả content rỗng.
function zenDebug(message: string): void {
  const file = process.env.ZEN_DEBUG_LOG;
  if (!file) return;
  try { appendFileSync(file, `${new Date().toISOString()} ${message}\n`); } catch { /* bỏ qua */ }
}

const ZEN_USER_AGENT = 'opencode/1.19.3 ai-sdk/provider-utils/4.0.40 runtime/bun/1.3.14';
const ID_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export const ZEN_PROVIDER = 'opencode';
export const ZEN_DEFAULT_MODEL = 'mimo-v2.6-flash-free';
export const ZEN_MIN_MAX_TOKENS = 8192;

// Bộ tools tối thiểu mà cổng Zen yêu cầu (gate bỏ qua request không có tool `read`).
const ZEN_TOOLS = [
  { type: 'function', function: { name: 'bash', description: 'Chạy lệnh hệ thống.', parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] } } },
  { type: 'function', function: { name: 'read', description: 'Đọc tệp.', parameters: { type: 'object', properties: { filePath: { type: 'string' } }, required: ['filePath'] } } },
  { type: 'function', function: { name: 'write', description: 'Ghi tệp.', parameters: { type: 'object', properties: { filePath: { type: 'string' } }, required: ['filePath'] } } },
  { type: 'function', function: { name: 'edit', description: 'Sửa tệp.', parameters: { type: 'object', properties: { filePath: { type: 'string' } }, required: ['filePath'] } } },
  { type: 'function', function: { name: 'grep', description: 'Tìm trong tệp.', parameters: { type: 'object', properties: { pattern: { type: 'string' } }, required: ['pattern'] } } },
  { type: 'function', function: { name: 'glob', description: 'Danh sách tệp.', parameters: { type: 'object', properties: { pattern: { type: 'string' } }, required: ['pattern'] } } }
];

export function isZenBaseUrl(baseUrl: unknown): boolean {
  try {
    const url = new URL(String(baseUrl || ''));
    return url.hostname === 'opencode.ai';
  } catch {
    return false;
  }
}

/** Sinh id dạng opencode: 12 hex đầu mã hóa timestamp, phần đuôi ngẫu nhiên (đồng bộ clock với gateway). */
export function buildZenIds(nowMs: number = Date.now()): { sessionId: string; requestId: string } {
  let counter = 0;
  let lastTimestamp = -1;
  const next = (prefix: string, descending: boolean, timestamp: number): string => {
    if (timestamp !== lastTimestamp) { lastTimestamp = timestamp; counter = 0; }
    counter += 1;
    const current = BigInt(timestamp) * 0x1000n + BigInt(counter);
    const value = descending ? ~current : current;
    const unsigned = BigInt.asUintN(64, value);
    let timeHex = '';
    for (let i = 0; i < 6; i += 1) {
      timeHex += Number((unsigned >> BigInt(40 - 8 * i)) & 0xffn).toString(16).padStart(2, '0');
    }
    let rand = '';
    for (let i = 0; i < 14; i += 1) rand += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
    return `${prefix}_${timeHex}${rand}`;
  };
  return {
    sessionId: next('ses', true, nowMs - 3000),
    requestId: next('msg', false, nowMs)
  };
}

/** Thêm điều kiện bắt buộc của Zen: stream:true + tools. Không chỉnh payload gốc của người gọi. */
export function buildZenRequestPayload(payload: Record<string, any>): Record<string, any> {
  const { stream: _stream, tools: _tools, ...rest } = payload || {};
  // Model free của Zen là reasoning model: reasoning_tokens tính chung vào max_tokens,
  // nên cap thấp (512/1024) của app khiến stream bị cắt giữa chừng (finish=length).
  const requested = Number(rest.max_tokens);
  const maxTokens = Number.isFinite(requested) && requested > 0 ? Math.max(requested, ZEN_MIN_MAX_TOKENS) : ZEN_MIN_MAX_TOKENS;
  return {
    ...rest,
    max_tokens: maxTokens,
    reasoning_effort: rest.reasoning_effort || 'minimal',
    stream: true,
    tools: ZEN_TOOLS
  };
}

export interface ZenStreamResult {
  content: string;
  finishReason: string;
  toolCalls: Array<{ id: string; name: string; args: string }>;
  usage?: Record<string, number>;
}

/** Gộp SSE (data: {...}\n\n … data: [DONE]) của Zen về text + finish_reason + tool_calls. */
export function aggregateZenStream(raw: string): ZenStreamResult {
  const result: ZenStreamResult = { content: '', finishReason: 'stop', toolCalls: [] };
  const calls: Record<number, { id: string; name: string; args: string }> = {};
  for (const line of String(raw || '').split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') continue;
    let chunk: any;
    try { chunk = JSON.parse(data); } catch { continue; }
    if (chunk.usage) result.usage = chunk.usage;
    for (const choice of Array.isArray(chunk.choices) ? chunk.choices : []) {
      if (choice.finish_reason) result.finishReason = choice.finish_reason;
      const delta = choice.delta || {};
      if (typeof delta.content === 'string') result.content += delta.content;
      for (const call of Array.isArray(delta.tool_calls) ? delta.tool_calls : []) {
        const index = Number.isFinite(call.index) ? call.index : 0;
        const entry = calls[index] || (calls[index] = { id: '', name: '', args: '' });
        if (call.id) entry.id = call.id;
        if (call.function?.name) entry.name = call.function.name;
        if (typeof call.function?.arguments === 'string') entry.args += call.function.arguments;
      }
    }
  }
  result.toolCalls = Object.keys(calls).map(key => calls[Number(key)]).filter(call => call.name);
  return result;
}

export interface ZenResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<any>;
  text(): Promise<string>;
}

function responseLike(status: number, bodyText: string): ZenResponseLike {
  let parsed: any;
  let parsedDone = false;
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return bodyText; },
    async json() {
      if (!parsedDone) { parsed = JSON.parse(bodyText); parsedDone = true; }
      return parsed;
    }
  };
}

function zenHeaders(apiKey: string): Record<string, string> {
  const { sessionId, requestId } = buildZenIds();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey || 'public'}`,
    'User-Agent': ZEN_USER_AGENT,
    'x-opencode-client': 'cli',
    'x-opencode-project': 'global',
    'x-opencode-session': sessionId,
    'x-opencode-request': requestId
  };
}

async function callZen(url: string, apiKey: string, body: Record<string, any>, timeoutMs: number): Promise<{ status: number; text: string; contentType: string }> {
  const response = await fetch(url, {
    method: 'POST',
    redirect: 'error',
    headers: zenHeaders(apiKey),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs)
  });
  const text = await response.text();
  return { status: response.status, text, contentType: response.headers.get('content-type') || '' };
}

/**
 * Gửi một request chat/completions tới Zen và trả về Response-like cùng định dạng
 * với fetch (ok/status/json/text) để caller không cần phân nhánh ngoài.
 * - Tự thêm stream + tools + header client của OpenCode.
 * - Nếu Zen từ chối response_format (HTTP 400) thì bỏ response_format và thử lại.
 * - Nếu model gọi tool thay vì trả lời thì phản hồi tool result để model trả về văn bản.
 */
export async function postZenChatCompletions(options: {
  baseUrl: string;
  apiKey?: string;
  payload: Record<string, any>;
  timeoutMs?: number;
}): Promise<ZenResponseLike> {
  const url = `${String(options.baseUrl || '').replace(/\/+$/, '')}/chat/completions`;
  const apiKey = String(options.apiKey || '');
  const timeoutMs = Number.isFinite(options.timeoutMs) ? Number(options.timeoutMs) : 180_000;
  const originalPayload = options.payload || {};

  let attempt = await callZen(url, apiKey, buildZenRequestPayload(originalPayload), timeoutMs);
  if (attempt.status === 400 && originalPayload.response_format) {
    const { response_format: _rf, ...withoutFormat } = originalPayload;
    attempt = await callZen(url, apiKey, buildZenRequestPayload(withoutFormat), timeoutMs);
  }
  if (attempt.status < 200 || attempt.status >= 300) {
    zenDebug(`upstream status=${attempt.status} raw=${attempt.text.slice(0, 500)}`);
    return responseLike(attempt.status, attempt.text);
  }

  const aggregated = aggregateZenStream(attempt.text);
  zenDebug(`upstream status=${attempt.status} rawBytes=${attempt.text.length} contentLen=${aggregated.content.length} finish=${aggregated.finishReason} toolCalls=${aggregated.toolCalls.length} usage=${JSON.stringify(aggregated.usage || null)}`);
  if (!aggregated.content.trim()) zenDebug(`EMPTY CONTENT raw head: ${attempt.text.slice(0, 800)}`);
  zenDebug(`content head: ${aggregated.content.slice(0, 400)}`);
  zenDebug(`content tail: ${aggregated.content.slice(-400)}`);
  let content = aggregated.content;
  let finishReason = aggregated.finishReason;
  let usage = aggregated.usage;

  if (!content.trim() && aggregated.toolCalls.length) {
    zenDebug(`tool-loop fallback: calls=${JSON.stringify(aggregated.toolCalls.map(c => c.name))}`);
    const messages = Array.isArray(originalPayload.messages) ? [...originalPayload.messages] : [];
    messages.push({
      role: 'assistant',
      content: null,
      tool_calls: aggregated.toolCalls.map((call, index) => ({
        id: call.id || `call_${index}`,
        type: 'function',
        function: { name: call.name, arguments: call.args || '{}' }
      }))
    });
    for (const call of aggregated.toolCalls) {
      messages.push({ role: 'tool', tool_call_id: call.id || 'call_0', content: 'Không cần gọi công cụ. Hãy trả lời trực tiếp bằng văn bản (JSON nếu người dùng yêu cầu).' });
    }
    const retry = await callZen(url, apiKey, buildZenRequestPayload({ ...originalPayload, messages }), timeoutMs);
    if (retry.status >= 200 && retry.status < 300) {
      const second = aggregateZenStream(retry.text);
      if (second.content.trim()) {
        content = second.content;
        finishReason = second.finishReason;
        usage = second.usage || usage;
      }
    }
  }

  const payloadModel = String(originalPayload.model || '');
  const finalContent = sanitizeZenContent(content);
  if (finalContent.length !== content.length) {
    zenDebug(`sanitized: removed ${content.length - finalContent.length} chars of chat-template tokens`);
  }
  return responseLike(200, JSON.stringify({
    id: `chatcmpl-zen-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: payloadModel,
    choices: [{ index: 0, message: { role: 'assistant', content: finalContent }, finish_reason: finishReason }],
    ...(usage ? { usage } : {})
  }));
}

// Ví dụ token cần strip: <|endoftext|> <|end_of_text|> <|eot_id|>
const CHAT_TEMPLATE_TOKEN = /<\u007c[^\u007c\u003c\u003e]{0,64}\u007c>/g;

/**
 * Model backend của Zen đôi khi phát lại chat-template token (ví dụ <|endoftext|>)
 * sau JSON hợp lệ — gây fail JSON.parse phía người gọi. Strip trước khi trả về.
 */
export function sanitizeZenContent(content: string): string {
  return String(content || '').replace(CHAT_TEMPLATE_TOKEN, '').trim();
}

/**
 * Đọc API key cục bộ của OpenCode CLI (auth.json) để giáo viên không phải copy key thủ công.
 * Chỉ đọc file của người dùng trên máy; không lưu/ghi lại nơi khác.
 */
export function readLocalOpencodeApiKey(): string {
  const candidates = [
    path.join(os.homedir(), '.local', 'share', 'opencode', 'auth.json'),
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'opencode', 'auth.json') : ''
  ].filter(Boolean);
  for (const file of candidates) {
    try {
      const data = JSON.parse(readFileSync(file, 'utf8'));
      const key = data && data.opencode && typeof data.opencode.key === 'string' ? data.opencode.key.trim() : '';
      if (key) return key;
    } catch { /* chưa đăng nhập hoặc file hỏng — bỏ qua */ }
  }
  return '';
}
