// worker-gateway.test.ts — đo gateway bản Workers bằng cách CHẠY NÓ (#360).
//
// Bản Express đã có test riêng, nhưng một bản viết lại cho Workers mà không chạy thì chỉ là
// một tệp văn bản: hợp đồng với app (`src-tauri/src/cloud.rs`) gồm bốn hình dạng phản hồi,
// và cả bốn đều phải đo được. Test này import **bản đã biên dịch** (`dist/worker/index.js`)
// và gọi `handle()` với kho giả, nên nó đo đúng tệp mà `wrangler deploy` sẽ đóng gói.
import assert from 'node:assert/strict';

// Đường dẫn tính từ tệp ĐÃ BIÊN DỊCH: `dist/tests/unit/` → `dist/worker/index.js`.
const HANDLER = '../../worker/index.js';

interface Row {
  id: string;
  status: 'pending' | 'completed' | 'failed';
  credit_cost: number;
  idempotency_key: string;
  metadata: Record<string, unknown>;
}

function makeWorld(overrides: { plan?: string; status?: string; used?: number; limit?: number } = {}) {
  const world = {
    used: overrides.used ?? 0,
    limit: overrides.limit ?? 10,
    plan: overrides.plan ?? 'free',
    status: overrides.status ?? 'active',
    creditsUsed: 0,
    creditsLimit: 50,
    rows: [] as Row[],
    bumps: 0,
  };
  const store = {
    async planOf() {
      return { plan: world.plan, status: world.status };
    },
    async ensureRow() {},
    async readUsed() {
      return world.used;
    },
    async casBump(_userId: string, _month: string, from: number, to: number) {
      if (world.used !== from) return false;
      world.used = to;
      world.bumps += 1;
      return true;
    },
    async readCredits() {
      return { used: world.creditsUsed, limit: world.creditsLimit };
    },
    async casBumpCredits(_userId: string, _month: string, from: number, to: number) {
      if (world.creditsUsed !== from) return false;
      world.creditsUsed = to;
      world.bumps += 1;
      return true;
    },
    async creditCost() {
      return 2;
    },
    async monthlyCredits() {
      return 500;
    },
    async ensureCreditsLimit() {},
  };
  const ledger = {
    async insertPending(row: Record<string, unknown>) {
      const key = String(row.idempotency_key);
      if (world.rows.some(entry => entry.idempotency_key === key)) return { inserted: false, id: null };
      // Kho giả phải tôn trọng `status`/`credit_cost` của dòng được ghi, nếu không nó tự tạo
      // ra một lỗi không có trong sản phẩm (PostgREST ghi đúng cột mà dòng gửi lên mang).
      const created = {
        id: 'row-' + (world.rows.length + 1),
        status: (String(row.status || 'pending') as Row['status']),
        credit_cost: Number(row.credit_cost || 0),
        idempotency_key: key,
        metadata: (row.metadata as Record<string, unknown>) || {},
      };
      world.rows.push(created);
      return { inserted: true, id: created.id };
    },
    async findKey(_userId: string, key: string) {
      const found = world.rows.find(entry => entry.idempotency_key === key);
      return found ? { id: found.id, status: found.status } : null;
    },
    async finish(id: string, row: { status: 'pending' | 'completed' | 'failed'; credit_cost: number; metadata: Record<string, unknown> }) {
      const found = world.rows.find(entry => entry.id === id);
      if (found) {
        found.status = row.status;
        found.credit_cost = row.credit_cost;
        found.metadata = row.metadata;
      }
      return { ok: true };
    },
    async release(id: string) {
      const index = world.rows.findIndex(entry => entry.id === id);
      if (index >= 0) world.rows.splice(index, 1);
      return { ok: true };
    },
  };
  return { world, deps: { store: () => store as never, ledger: () => ledger as never } };
}

function env(overrides: Record<string, string> = {}) {
  return {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'anon',
    SUPABASE_SERVICE_ROLE_KEY: 'service',
    GEMINI_API_KEY: 'gemini',
    GATEWAY_VERSION: '0.5.5',
    ...overrides,
  } as never;
}

const GOOD_TOKEN = 'good-token';
const auth = async (_env: unknown, authorization: string) => (authorization === 'Bearer ' + GOOD_TOKEN ? 'user-1' : null);

const LESSON = 'Bài học về an toàn giao thông đường bộ cho học sinh lớp 4. Đi bộ sát mép đường bên phải.';

const GAME = {
  title: 'An toàn giao thông',
  questions: [
    { id: 'q1', prompt: 'Đi bộ ở đâu?', options: [{ id: 'a', text: 'Sát mép phải' }, { id: 'b', text: 'Giữa đường' }], correctOptionId: 'a' },
    { id: 'q2', prompt: 'Trước khi sang đường?', options: [{ id: 'a', text: 'Nhìn hai phía' }, { id: 'b', text: 'Chạy' }], correctOptionId: 'a' },
  ],
};

function generateOk(text: string) {
  return async () => ({ ok: true as const, text, attempts: 1 });
}
function generateFail() {
  return async () => ({ ok: false as const, status: 503, body: 'high demand', attempts: 4 });
}

async function main(): Promise<void> {
  const { handle } = require(HANDLER);

  const post = (path: string, body: unknown, token = GOOD_TOKEN) =>
    new Request('https://gw.example' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: JSON.stringify(body),
    });
  const get = (path: string, token = GOOD_TOKEN) =>
    new Request('https://gw.example' + path, {
      headers: token ? { Authorization: 'Bearer ' + token } : {},
    });

  // 1. `/health` nói đúng tên và bản — cổng `smoke:gateway` kiểm cả hai trường này.
  const health = await handle(new Request('https://gw.example/health'), env());
  const healthBody = await health.json();
  assert.equal(health.status, 200);
  assert.equal(healthBody.ok, true);
  assert.equal(healthBody.service, 'edugame-ai-gateway');
  assert.equal(healthBody.version, '0.5.5');

  // 2. Không token ⇒ 401, cả hai cửa.
  assert.equal((await handle(get('/v1/usage', ''), env(), { auth })).status, 401);
  assert.equal((await handle(post('/v1/generate', { text: LESSON }, ''), env(), { auth })).status, 401);
  assert.equal((await handle(get('/v1/usage', 'wrong'), env(), { auth })).status, 401);

  // 3. ĐỌC hạn mức: gói free ⇒ đơn vị là lượt, hạn mức 10 của kỳ 14 ngày, không trừ gì.
  const worldA = makeWorld({ used: 1 });
  const usageResponse = await handle(get('/v1/usage'), env(), { auth, ...worldA.deps });
  const usageBody = await usageResponse.json();
  assert.equal(usageResponse.status, 200);
  assert.equal(usageBody.plan, 'free');
  assert.equal(usageBody.unit, 'generations');
  assert.equal(usageBody.used, 1);
  assert.equal(usageBody.limit, 10);
  assert.equal(worldA.world.used, 1, 'đọc hạn mức không được trừ');
  assert.equal(worldA.world.bumps, 0);

  // 4. Gói plus đang active ⇒ đơn vị là credits, và hạn mức không nhỏ hơn cấu hình.
  const worldPlus = makeWorld({ plan: 'plus', status: 'active' });
  const plusBody = await (await handle(get('/v1/usage'), env(), { auth, ...worldPlus.deps })).json();
  assert.equal(plusBody.unit, 'credits');
  assert.equal(plusBody.limit, 500);
  assert.equal(plusBody.cost, 2);

  // 5. Dữ liệu xấu bị từ chối Ở ĐÂY, trước khi trừ lượt nào.
  const worldBad = makeWorld();
  const bad = await handle(post('/v1/generate', { text: 'ngắn quá' }), env(), { auth, generate: generateOk(JSON.stringify(GAME)), ...worldBad.deps });
  assert.equal(bad.status, 400);
  assert.equal(worldBad.world.used, 0);
  assert.equal(worldBad.world.rows.length, 0);

  // 6. Thành công: 200 { game, provider, usage }, trừ đúng 1 lượt, đúng 1 dòng sổ completed.
  const worldOk = makeWorld();
  const okResponse = await handle(post('/v1/generate', { text: LESSON, questionCount: 3, idempotencyKey: 'click-worker-001' }), env(), {
    auth,
    generate: generateOk(JSON.stringify(GAME)),
    ...worldOk.deps,
  });
  const okBody = await okResponse.json();
  assert.equal(okResponse.status, 200);
  assert.equal(okBody.game.title, 'An toàn giao thông');
  assert.equal(okBody.game.questions.length, 2);
  assert.equal(okBody.provider, 'gemini-3.5-flash-lite');
  assert.equal(okBody.usage.used, 1);
  assert.equal(worldOk.world.used, 1);
  assert.equal(worldOk.world.rows.length, 1);
  assert.equal(worldOk.world.rows[0].status, 'completed');
  assert.equal(worldOk.world.rows[0].credit_cost, 1);

  // 7. Cùng khoá ⇒ 409, KHÔNG trừ thêm, KHÔNG thêm dòng (đây là toàn bộ giá trị của #357).
  const dup = await handle(post('/v1/generate', { text: LESSON, questionCount: 3, idempotencyKey: 'click-worker-001' }), env(), {
    auth,
    generate: generateOk(JSON.stringify(GAME)),
    ...worldOk.deps,
  });
  const dupBody = await dup.json();
  assert.equal(dup.status, 409);
  assert.equal(dupBody.code, 'duplicate_request');
  assert.equal(worldOk.world.used, 1, 'không trừ lượt thứ hai');
  assert.equal(worldOk.world.rows.length, 1, 'không thêm dòng thứ hai');
  assert.match(String(dupBody.error), /Thư viện/u);

  // 8. Hết lượt: 429 + câu đúng đơn vị + `usage` để UI tắt nút, và nhả chỗ đã giữ.
  const worldSpent = makeWorld({ used: 10 });
  const spent = await handle(post('/v1/generate', { text: LESSON, questionCount: 3, idempotencyKey: 'click-worker-002' }), env(), {
    auth,
    generate: generateOk(JSON.stringify(GAME)),
    ...worldSpent.deps,
  });
  const spentBody = await spent.json();
  assert.equal(spent.status, 429);
  assert.match(String(spentBody.error), /lượt/u);
  assert.equal(spentBody.usage.quotaLimit, 10);
  assert.equal(worldSpent.world.rows.length, 0, 'chỗ đã giữ phải được nhả');
  assert.equal(worldSpent.world.used, 10);

  // 9. Nhà cung cấp hỏng: 502, hoàn đúng lượt, dòng sổ là failed giá 0.
  const worldFail = makeWorld();
  const failed = await handle(post('/v1/generate', { text: LESSON, questionCount: 3, idempotencyKey: 'click-worker-003' }), env(), {
    auth,
    generate: generateFail(),
    ...worldFail.deps,
  });
  assert.equal(failed.status, 502);
  assert.equal(worldFail.world.used, 0, 'hoàn đúng lượt đã trừ');
  assert.equal(worldFail.world.rows.length, 1);
  assert.equal(worldFail.world.rows[0].status, 'failed');
  assert.equal(worldFail.world.rows[0].credit_cost, 0, 'lần gọi hỏng có giá 0');
  assert.equal(worldFail.world.rows[0].metadata.error, 'gemini_503');

  // 10. JSON trò chơi hỏng: 502 + hoàn lượt, không ghi completed.
  const worldInvalid = makeWorld();
  const invalid = await handle(post('/v1/generate', { text: LESSON, questionCount: 3 }), env(), {
    auth,
    generate: generateOk('{"title": 5}'),
    ...worldInvalid.deps,
  });
  assert.equal(invalid.status, 502);
  assert.equal(worldInvalid.world.used, 0);
  assert.equal(worldInvalid.world.rows[0].status, 'failed');
  assert.equal(worldInvalid.world.rows[0].metadata.error, 'invalid_game_json');

  // 11. Đường cũ `/ai/generate` không tồn tại: app không gọi nó, và không được để ai tưởng nó chạy.
  assert.equal((await handle(post('/ai/generate', { text: LESSON }), env(), { auth })).status, 404);
  assert.equal((await handle(get('/whatever'), env(), { auth })).status, 404);

  // 12. Thiếu cấu hình ⇒ 503 có mã, và `/health` vẫn trả lời (nơi chạy cần biết nó sống).
  const missing = { SUPABASE_URL: '', SUPABASE_ANON_KEY: '', SUPABASE_SERVICE_ROLE_KEY: '', GEMINI_API_KEY: '' } as never;
  const missingResponse = await handle(post('/v1/generate', { text: LESSON }), missing, { auth });
  assert.equal(missingResponse.status, 503);
  assert.equal((await missingResponse.json()).code, 'server_not_configured');
  assert.equal((await handle(new Request('https://gw.example/health'), missing)).status, 200);

  console.log('worker gateway: 45 khẳng định đã qua');
}

void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

export {};
