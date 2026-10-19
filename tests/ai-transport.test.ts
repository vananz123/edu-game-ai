import assert from 'node:assert/strict';
import {
  AiRequestRegistry,
  AiTransportError,
  buildChatRequestBody,
  cleanModelJson,
  createCancelError,
  createRequestSignal,
  isCancelReason,
  parseModelJson,
  readAssistantContent,
  requestChatJson,
  type ChatSendResult
} from '../src/services/ai-transport';
import type { ChatMessage } from '../src/services/lesson-prompts';

const messages: ChatMessage[] = [
  { role: 'system', content: 'system' },
  { role: 'user', content: 'user' }
];

function chatResponse(content: unknown, options: { status?: number; finishReason?: string; bodyText?: string } = {}): ChatSendResult {
  const status = options.status ?? 200;
  const ok = status >= 200 && status < 300;
  return {
    ok,
    status,
    async json() {
      return {
        choices: [{ finish_reason: options.finishReason ?? 'stop', message: { role: 'assistant', content } }]
      };
    },
    async text() {
      return options.bodyText ?? (typeof content === 'string' ? content : JSON.stringify(content));
    }
  };
}

async function expectAiError(code: string, run: () => Promise<unknown>): Promise<AiTransportError> {
  try {
    await run();
  } catch (error) {
    assert.ok(error instanceof AiTransportError, `expected AiTransportError, got ${String(error)}`);
    assert.equal(error.code, code);
    return error;
  }
  assert.fail(`expected AiTransportError ${code}`);
  throw new Error('unreachable');
}

async function main(): Promise<void> {
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // --- cleanModelJson / parseModelJson -------------------------------------
  assert.equal(cleanModelJson('```json\n{"a":1}\n```'), '{"a":1}');
  assert.equal(cleanModelJson('  {"a":1}  '), '  {"a":1}  ');
  assert.deepEqual(parseModelJson('```json\n{"a":1}\n```'), { a: 1 });

  const invalid = await expectAiError('AI_INVALID_JSON', async () => parseModelJson('oops not json'));
  assert.equal(invalid.rawContent, 'oops not json');

  // --- readAssistantContent ------------------------------------------------
  assert.equal(readAssistantContent({ choices: [{ finish_reason: 'stop', message: { content: 'hi' } }] }), 'hi');
  await expectAiError('AI_TRUNCATED', async () => readAssistantContent({ choices: [{ finish_reason: 'length', message: { content: 'x' } }] }));
  await expectAiError('AI_EMPTY', async () => readAssistantContent({ choices: [{ finish_reason: 'stop', message: { content: '   ' } }] }));
  await expectAiError('AI_EMPTY', async () => readAssistantContent({}));

  // --- buildChatRequestBody ------------------------------------------------
  const localBody = buildChatRequestBody({
    model: 'qwen', mode: 'local', temperature: 0.2,
    generation: { max_tokens: 512, chat_template_kwargs: { enable_thinking: false } },
    messages,
    responseSchema: { name: 'x', schema: { type: 'object' } }
  });
  assert.equal(localBody.model, 'qwen');
  assert.equal(localBody.temperature, 0.2);
  assert.equal(localBody.top_p, 1.0);
  assert.equal(localBody.max_tokens, 512);
  assert.deepEqual(localBody.response_format, {
    type: 'json_schema',
    json_schema: { name: 'x', strict: true, schema: { type: 'object' } }
  });
  assert.deepEqual(localBody.messages, messages);

  const onlineBody = buildChatRequestBody({
    model: 'gpt', mode: 'online', temperature: 0.3,
    generation: { max_tokens: 256 }, messages, responseSchema: { name: 'x', schema: {} }
  });
  assert.deepEqual(onlineBody.response_format, { type: 'json_object' });
  assert.equal('top_p' in onlineBody, false);

  // --- createRequestSignal -------------------------------------------------
  const controller = new AbortController();
  controller.abort(createCancelError());
  const cancelledRequest = createRequestSignal({ signal: controller.signal });
  assert.equal(cancelledRequest.cancelled(), true);
  assert.equal(isCancelReason(controller.signal.reason), true);

  const timeoutRequest = createRequestSignal({ timeoutMs: 10 });
  assert.equal(timeoutRequest.timedOut(), false);
  await sleep(30);
  assert.equal(timeoutRequest.timedOut(), true);
  assert.equal(timeoutRequest.signal.aborted, true);

  // --- AiRequestRegistry ---------------------------------------------------
  const registry = new AiRequestRegistry();
  const handle = registry.begin('req-1');
  assert.equal(registry.has('req-1'), true);
  assert.equal(registry.size, 1);
  assert.throws(() => registry.begin('req-1'), (error: unknown) => error instanceof AiTransportError && (error as AiTransportError).code === 'AI_CONFIG');
  assert.equal(registry.cancel('missing'), false);
  assert.equal(registry.cancel('req-1'), true);
  assert.equal(handle.signal.aborted, true);
  assert.equal(isCancelReason(handle.signal.reason), true);
  assert.equal(registry.size, 0);
  registry.begin('req-2');
  registry.begin('req-3');
  registry.cancelAll();
  assert.equal(registry.size, 0);
  assert.throws(() => registry.begin(''), (error: unknown) => error instanceof AiTransportError);

  // --- requestChatJson -----------------------------------------------------
  let sentBody: Record<string, unknown> | null = null;
  const happy = await requestChatJson({
    model: 'qwen', mode: 'local', messages,
    generation: { max_tokens: 128 },
    responseSchema: { name: 'x', schema: { type: 'object' } },
    send: async (body) => { sentBody = body; return chatResponse('```json\n{"ok":true}\n```'); }
  });
  assert.deepEqual(happy, { ok: true });
  assert.equal(sentBody!.model, 'qwen');
  assert.equal(sentBody!.temperature, 0.2);

  await expectAiError('AI_INVALID_JSON', () => requestChatJson({
    model: 'qwen', mode: 'local', messages, generation: {},
    send: async () => chatResponse('not json')
  }));

  const httpError = await expectAiError('AI_HTTP', () => requestChatJson({
    model: 'qwen', mode: 'local', messages, generation: {},
    send: async () => chatResponse('', { status: 500, bodyText: 'model lỗi' })
  }));
  assert.match(httpError.message, /HTTP 500/);
  assert.match(httpError.message, /model lỗi/);
  assert.equal(httpError.status, 500);

  await expectAiError('AI_TIMEOUT', () => requestChatJson({
    model: 'qwen', mode: 'local', messages, generation: {},
    send: async () => { const error = new Error('timed out'); error.name = 'TimeoutError'; throw error; }
  }));

  const aborter = new AbortController();
  aborter.abort(createCancelError());
  await expectAiError('AI_CANCELLED', () => requestChatJson({
    model: 'qwen', mode: 'local', messages, generation: {},
    signal: aborter.signal,
    send: async (_body, signal) => { throw signal.reason; }
  }));

  await expectAiError('AI_CONNECTION', () => requestChatJson({
    model: 'qwen', mode: 'local', messages, generation: {},
    send: async () => {
      const error = new TypeError('fetch failed');
      (error as { cause?: unknown }).cause = { code: 'ECONNREFUSED' };
      throw error;
    }
  }));

  // Online default temperature stays 0.3 (behaviour preserved from main.ts).
  let onlineTemperature = -1;
  await requestChatJson({
    model: 'gpt', mode: 'online', messages, generation: {},
    send: async (body) => { onlineTemperature = Number(body.temperature); return chatResponse('{"ok":1}'); }
  });
  assert.equal(onlineTemperature, 0.3);

  console.log('AI transport tests passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
