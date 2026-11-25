#!/usr/bin/env node
/**
 * smoke-gateway (#359) — một gateway vừa dựng có phục vụ được BẢN CÀI không?
 *
 * Ba câu hỏi, đúng ba câu mà app sẽ hỏi, và không câu nào cần token thật:
 *   1. `/health` trả 200 + `ok:true` + đúng phiên bản  → nơi chạy đã nhận traffic.
 *   2. `/v1/usage` không token trả 401                  → có cửa, và cửa có khoá.
 *   3. `/v1/generate` không token trả 401               → cửa sinh nội dung cũng có khoá.
 *
 * Cách dùng:
 *   node scripts/smoke-gateway.js https://ai.example.com
 *   node scripts/smoke-gateway.js https://ai.example.com --expect-version 0.5.5
 *
 * Cổng này CỐ Ý không gọi AI: một lần smoke test không được tiêu tiền của giáo viên.
 */
const url = (process.argv[2] || '').trim().replace(/\/+$/u, '');
const versionIndex = process.argv.indexOf('--expect-version');
const expectVersion = versionIndex > 0 ? String(process.argv[versionIndex + 1] || '') : '';

if (!url || !/^https?:\/\//u.test(url)) {
  console.error('smoke-gateway: cần một URL, ví dụ: node scripts/smoke-gateway.js https://ai.example.com');
  process.exit(2);
}
if (process.argv.includes('--pilot') && !/^https:\/\//u.test(url)) {
  console.error('smoke-gateway: FAIL — bản phát cho giáo viên phải dùng https.');
  process.exit(1);
}

let failed = 0;
function report(name, ok, detail) {
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + ' — ' + detail);
  if (!ok) failed += 1;
}

async function main() {
  const started = Date.now();
  let health;
  try {
    health = await fetch(url + '/health', { signal: AbortSignal.timeout(15_000) });
  } catch (error) {
    report('gateway trả lời ở /health', false, 'không kết nối được: ' + (error && error.message));
    console.log('smoke-gateway: 1/1 lỗi — chưa có gì để kiểm tiếp.');
    process.exit(1);
  }
  const healthMs = Date.now() - started;
  const healthBody = await health.json().catch(() => ({}));
  report(
    'gateway trả lời ở /health',
    health.status === 200 && healthBody.ok === true && healthBody.service === 'edugame-ai-gateway',
    'status=' + health.status + ' service=' + (healthBody.service || '?') + ' sau ' + healthMs + 'ms'
  );
  report(
    'phiên bản gateway là bản đang phát hành',
    !expectVersion || healthBody.version === expectVersion,
    'version=' + (healthBody.version || '?') + (expectVersion ? ' (mong đợi ' + expectVersion + ')' : '')
  );

  for (const [path, name] of [['/v1/usage', 'đọc hạn mức'], ['/v1/generate', 'sinh nội dung']]) {
    const response = await fetch(url + path, {
      method: path === '/v1/generate' ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: path === '/v1/generate' ? JSON.stringify({ text: 'x'.repeat(60), questionCount: 3 }) : undefined,
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
    report(
      name + ' từ chối người không có token',
      Boolean(response) && response.status === 401,
      response ? 'status=' + response.status : 'không kết nối được'
    );
  }

  if (failed) {
    console.log('smoke-gateway: ' + failed + ' dòng hỏng — CHƯA dùng được cho bản cài.');
    process.exit(1);
  }
  console.log('smoke-gateway: 4/4 dòng qua — gateway ' + url + ' dùng được cho bản cài.');
}

void main();
