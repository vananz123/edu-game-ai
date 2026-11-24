// Cổng cho `server/gemini.ts`: thử lại là hành vi, không phải một vòng `for` tin được.
//
// Ngày 24/11 nhà cung cấp trả `503 UNAVAILABLE` cho đúng model vừa trả `200`, nên
// luật "thử lại khi bận, không thử lại khi yêu cầu sai" phải có test.
import assert from 'node:assert/strict';
import { requestGameJson, shouldRetry } from '../../server/gemini';

interface Call {
  url: string;
  body: string;
}

function fakeFetch(statuses: number[], text = '{"title":"T","questions":[{"id":"q1"}]}'): { fetchImpl: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: { body: string }) => {
    calls.push({ url: String(url), body: String(init.body) });
    const status = statuses[Math.min(calls.length - 1, statuses.length - 1)];
    if (status === 200) {
      return {
        ok: true,
        status,
        json: async () => ({ candidates: [{ content: { parts: [{ text }, { text: '' }] } }] }),
        text: async () => '',
      };
    }
    return { ok: false, status, json: async () => ({}), text: async () => '{"error":{"status":"UNAVAILABLE"}}' };
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

async function run(): Promise<void> {
  // 1. Một lượt 503 rồi thành công: kết quả đúng, đã thử lại đúng một lần, có chờ.
  const waits: number[] = [];
  const flaky = fakeFetch([503, 200]);
  const recovered = await requestGameJson('prompt', {
    apiKey: 'k', model: 'gemini-3.5-flash-lite',
    fetchImpl: flaky.fetchImpl, sleep: async ms => { waits.push(ms); },
  });
  assert.equal(recovered.ok, true, 'một 503 thoáng qua phải được cứu');
  assert.equal(recovered.attempts, 2, 'đúng hai lượt gọi');
  assert.deepEqual(waits, [600], 'chờ 600ms trước lượt thứ hai');
  assert.equal((recovered as { text: string }).text, '{"title":"T","questions":[{"id":"q1"}]}', 'hai part được nối, không có chỗ trống');
  assert.match(flaky.calls[0].url, /gemini-3\.5-flash-lite:generateContent/, 'model đi vào URL');
  assert.match(flaky.calls[0].url, /key=k$/, 'khoá đi vào URL, không vào thân');
  assert.ok(!flaky.calls[0].body.includes('"k"'), 'thân request không chứa khoá');
  assert.match(flaky.calls[0].body, /responseMimeType/, 'vẫn đòi JSON');

  // 2. Yêu cầu SAI thì không thử lại: 400 là lỗi của mình, thử lại chỉ tốn tiền.
  const wrong = fakeFetch([400]);
  const rejected = await requestGameJson('prompt', { apiKey: 'k', model: 'm', fetchImpl: wrong.fetchImpl, sleep: async () => {} });
  assert.equal(rejected.ok, false, '400 là hỏng thật');
  assert.equal(rejected.attempts, 1, 'không thử lại 400');
  assert.equal(wrong.calls.length, 1, 'chỉ một request ra ngoài');

  // 3. Bận liên tục: bốn lượt rồi trả lỗi, không quay vô hạn.
  const down = fakeFetch([503]);
  const failed = await requestGameJson('prompt', { apiKey: 'k', model: 'm', fetchImpl: down.fetchImpl, sleep: async () => {} });
  assert.equal(failed.ok, false, 'vẫn báo lỗi sau khi thử lại');
  assert.equal(failed.attempts, 4, 'bốn lượt là giới hạn: ngắn hơn thì một đợt bận thành một lần hỏng');
  assert.equal(down.calls.length, 4, 'bốn request ra ngoài, không hơn');

  // 4. Danh sách mã đáng thử lại là hợp đồng: 408 và 502 tuỳ nhà cung cấp.
  assert.deepEqual([408, 502, 429].filter(shouldRetry), [502, 429], 'chỉ 429/5xx mới thử lại');
  assert.equal(shouldRetry(200), false, 'thành công không cần thử lại');

  console.log('server-gemini: 4 nhóm kiểm đã qua');
}

void run();
