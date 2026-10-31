import assert from 'node:assert/strict';
import {
  ZEN_MIN_MAX_TOKENS,
  aggregateZenStream,
  buildZenIds,
  buildZenRequestPayload,
  isZenBaseUrl,
  sanitizeZenContent
} from '../../src/services/ai/opencode-zen';

function run(): void {
  // isZenBaseUrl — chỉ nhận đúng host opencode.ai
  assert.equal(isZenBaseUrl('https://opencode.ai/zen/v1'), true);
  assert.equal(isZenBaseUrl('https://opencode.ai/zen/v1/'), true);
  assert.equal(isZenBaseUrl('https://api.openai.com/v1'), false);
  assert.equal(isZenBaseUrl('https://console.opencode.ai/v1'), false);
  assert.equal(isZenBaseUrl('http://127.0.0.1:11434/v1'), false);
  assert.equal(isZenBaseUrl(''), false);
  assert.equal(isZenBaseUrl('not a url'), false);

  // buildZenIds — định dạng ses_/msg_ + 26 ký tự (12 hex timestamp + 14 ngẫu nhiên), không trùng lặp
  const ids = buildZenIds(1_700_000_000_000);
  assert.match(ids.sessionId, /^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/);
  assert.match(ids.requestId, /^msg_[0-9a-f]{12}[0-9A-Za-z]{14}$/);
  assert.notEqual(ids.sessionId, ids.requestId);
  const again = buildZenIds(1_700_000_000_000);
  assert.notEqual(ids.sessionId, again.sessionId);

  // buildZenRequestPayload — thêm stream + tools (gate của Zen), giữ nguyên payload gốc
  const payload = {
    model: 'mimo-v2.6-flash-free',
    temperature: 0.4,
    max_tokens: 2048,
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: 'JSON please' }],
    stream: false,
    tools: []
  };
  const zenBody = buildZenRequestPayload(payload);
  assert.equal(zenBody.stream, true);
  assert.ok(Array.isArray(zenBody.tools) && zenBody.tools.length > 0);
  assert.ok(zenBody.tools.some((tool: any) => tool.function?.name === 'read'));
  assert.equal(zenBody.model, 'mimo-v2.6-flash-free');
  // cap thấp bị nâng lên sàn ZEN_MIN_MAX_TOKENS vì reasoning_tokens tính vào max_tokens
  assert.equal(zenBody.max_tokens, ZEN_MIN_MAX_TOKENS);
  assert.equal(zenBody.reasoning_effort, 'minimal');
  assert.equal((zenBody.response_format as any).type, 'json_object');
  assert.equal((zenBody.messages as any).length, 1);
  assert.equal(payload.stream, false, 'payload gốc không bị chỉnh sửa');
  assert.equal(payload.tools.length, 0, 'payload gốc không bị chỉnh sửa');
  assert.equal(payload.max_tokens, 2048, 'payload gốc không bị chỉnh sửa');
  assert.equal(buildZenRequestPayload({ max_tokens: 512 }).max_tokens, ZEN_MIN_MAX_TOKENS);
  assert.equal(buildZenRequestPayload({ max_tokens: 16384 }).max_tokens, 16384, 'cap lớn hơn sàn được giữ');
  assert.equal(buildZenRequestPayload({}).max_tokens, ZEN_MIN_MAX_TOKENS, 'không có max_tokens vẫn đặt sàn');
  assert.equal(buildZenRequestPayload({ reasoning_effort: 'high' }).reasoning_effort, 'high', 'giữ reasoning_effort của người gọi');

  // aggregateZenStream — gộp nhiều chunk, CRLF, [DONE], ignore dòng rác
  const sse = [
    'data: {"choices":[{"index":0,"delta":{"role":"assistant","content":"{"}}]}',
    '',
    'data: {"choices":[{"index":0,"delta":{"content":"\\"ok\\":true}"}}]}',
    '',
    'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5}}',
    '',
    'data: [DONE]',
    ''
  ].join('\r\n');
  const aggregated = aggregateZenStream(sse);
  assert.equal(aggregated.content, '{"ok":true}');
  assert.equal(aggregated.finishReason, 'stop');
  assert.deepEqual(aggregated.usage, { prompt_tokens: 10, completion_tokens: 5 });
  assert.equal(aggregated.toolCalls.length, 0);

  // aggregateZenStream — tool_calls ghép theo index (id + name + arguments)
  const toolSse = [
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"read","arguments":"{\\"filePath\\":"}}]}}]}',
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"a.ts\\"}"}}]}}]}',
    'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}',
    'data: [DONE]'
  ].join('\n');
  const toolAgg = aggregateZenStream(toolSse);
  assert.equal(toolAgg.content, '');
  assert.equal(toolAgg.finishReason, 'tool_calls');
  assert.equal(toolAgg.toolCalls.length, 1);
  assert.equal(toolAgg.toolCalls[0].id, 'call_1');
  assert.equal(toolAgg.toolCalls[0].name, 'read');
  assert.equal(toolAgg.toolCalls[0].args, '{"filePath":"a.ts"}');

  // aggregateZenStream — văn bản rác/JSON hỏng không làm sập hàm
  const junk = aggregateZenStream('data: {broken\nnot-data: x\n');
  assert.equal(junk.content, '');
  assert.equal(junk.toolCalls.length, 0);

  // sanitizeZenContent - bo chat-template token (vi du endoftext) sau JSON, giu JSON con lai
  const LT = String.fromCharCode(60);
  const GT = String.fromCharCode(62);
  const BAR = String.fromCharCode(124);
  const token1 = LT + BAR + 'endoftext' + BAR + GT;
  const token2 = LT + BAR + 'end_of_text' + BAR + GT;
  const jsonOnly = '{"summary":"ok","keyPoints":["a"]}';
  assert.equal(sanitizeZenContent(jsonOnly), jsonOnly, 'JSON sach khong bi anh huong');
  assert.equal(sanitizeZenContent('{"a":1}' + token1 + token2), '{"a":1}', 'strip 2 token cuoi');
  assert.equal(sanitizeZenContent(token1 + '{"a":1}'), '{"a":1}', 'strip token dau chuoi');
  assert.equal(sanitizeZenContent('no token here'), 'no token here');
  assert.equal(sanitizeZenContent(''), '');
  assert.equal(sanitizeZenContent(null as any), '', 'null -> empty');
  assert.ok(sanitizeZenContent('{"a":' + LT + 'khong phai token}').length > 6, 'khong xoa chu thuong trong JSON');

  console.log('opencode-zen: OK');
}

run();
