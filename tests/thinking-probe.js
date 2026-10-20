// tests/thinking-probe.js — §7 update_plan_3: xác minh model GGUF có bật thinking
// được không, trên đúng runtime/model mà app cài, KHÔNG qua app (HTTP thẳng).
//
// O6 (docs/BENCHMARKS.md §6.1) đo enable_thinking=true KHÔNG có --jinja → chỉ
// reasoning_content, không content trong 2.048 token. Đo này thêm biến thể CÓ
// --jinja (llama.cpp tự render chat template của model) theo đúng yêu cầu
// "Chat template/Jinja template đang sử dụng" của spec §7.
//
// Cách chạy (server phải được start tay, xem hai lệnh dưới):
//   llama-server.exe --model <qwen3.5-2b.gguf> --alias qwen3.5-2b ^
//     --host 127.0.0.1 --port 9342 --ctx-size 8192 --threads 4 ^
//     --n-gpu-layers 0 --parallel 1 --ctx-checkpoints 0 --jinja
//
//   node tests/thinking-probe.js --url http://127.0.0.1:9342 --max-tokens 900
//
// In ra JSON: { reasoningChars, contentChars, finish, ms, ... } — không tự
// kết luận "tốt hơn"; số đo để BENCHMARKS/DECISIONS dẫn chiếu.

'use strict';

const args = {};
for (let i = 2; i < process.argv.length; i += 1) {
  const key = process.argv[i];
  if (!key.startsWith('--')) continue;
  const next = process.argv[i + 1];
  if (next && !next.startsWith('--')) { args[key.slice(2)] = next; i += 1; } else { args[key.slice(2)] = true; }
}

const url = (args.url || 'http://127.0.0.1:9342').replace(/\/$/, '');
const maxTokens = Number(args['max-tokens']) || 900;
const enableThinking = args.thinking === undefined ? true : String(args.thinking) !== 'false';

// Prompt trả lời ngắn, KHÔNG schema — đúng kiểu probe O6 để so sánh trực tiếp.
const messages = [
  { role: 'system', content: 'Bạn là trợ lý dạy học. Trả lời ngắn gọn bằng tiếng Việt.' },
  { role: 'user', content: 'Mặt trời mọc phía nào? Trả lời trong một câu.' }
];

async function main() {
  const started = Date.now();
  const response = await fetch(`${url}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'qwen3.5-2b',
      messages,
      max_tokens: maxTokens,
      temperature: 0.2,
      chat_template_kwargs: { enable_thinking: enableThinking }
    }),
    signal: AbortSignal.timeout(Math.max(60_000, maxTokens * 60_000))
  });
  const ms = Date.now() - started;
  if (!response.ok) {
    console.error(JSON.stringify({ ok: false, status: response.status, body: (await response.text()).slice(0, 400) }));
    process.exit(1);
  }
  const data = await response.json();
  const message = (data.choices && data.choices[0] && data.choices[0].message) || {};
  const result = {
    ok: true,
    enableThinking,
    maxTokens,
    finish: data.choices && data.choices[0] ? data.choices[0].finish_reason : '',
    reasoningChars: String(message.reasoning_content || '').length,
    contentChars: String(message.content || '').length,
    contentPreview: String(message.content || '').slice(0, 200),
    completionTokens: data.usage ? data.usage.completion_tokens : null,
    ms
  };
  console.log(JSON.stringify(result, null, 2));
  // "usable" = có content trả về được (JSON/schema của app nằm ở content).
  process.exit(result.contentChars > 0 ? 0 : 2);
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: String(error && error.message ? error.message : error) }));
  process.exit(1);
});
