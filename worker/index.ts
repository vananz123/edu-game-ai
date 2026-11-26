// index.ts — gateway Cloud AI chạy trên Cloudflare Workers (#360).
//
// Vì sao có tệp này: bản `server/` (Express) chạy tốt trên máy nhưng phải có một máy bật
// 24/7. Workers không cần máy nào, và **giữ khoá ở phía máy chủ** đúng như thiết kế đòi:
// app chỉ mang token của giáo viên, không bao giờ mang `GEMINI_API_KEY` hay service_role.
//
// Hợp đồng với app là **bắt buộc**, không phải tuỳ chọn (`src-tauri/src/cloud.rs`):
//   GET  /health       → { ok, service: 'edugame-ai-gateway', version }
//   GET  /v1/usage     → { plan, status, month, unit, used, limit, cost }        (đọc, không trừ)
//   POST /v1/generate  → 200 { game, provider, usage } · 429 { error, usage }
//                        · 409 { error, code: 'duplicate_request' } · 400 · 401
//
// Xác thực: `Authorization: Bearer <token của giáo viên>`, kiểm với Supabase bằng anon key.
// **Không** có `GATEWAY_TOKEN` dùng chung: một khoá chung nằm trong bộ cài là khoá công khai.
//
// Luật hạn mức/sổ KHÔNG viết lại ở đây: `consumeGeneration`, `usageSnapshot`,
// `claimUsageLog`… được import từ `server/` để bản Express và bản Workers không thể lệch
// nhau về đơn vị, về giá, hay về "một lần bấm là một dòng sổ".

import { z } from 'zod';
import {
  consumeGeneration,
  describeQuotaFailure,
  refundGeneration,
  usagePeriod,
  usageSnapshot,
  type QuotaStore,
} from '../server/quota.js';
import {
  claimUsageLog,
  normalizeIdempotencyKey,
  releaseUsageLog,
  settleUsageLog,
  usageLogRow,
  type UsageLogDb,
} from '../server/usage-log.js';
import { requestGameJson } from '../server/gemini.js';
import { quotaStore, usageLogDb, verifyUser, type WorkerEnv } from './supabase.js';
import { handleBilling, type BillingDeps } from './billing.js';

const SERVICE = 'edugame-ai-gateway';
const DEFAULT_VERSION = '0.5.6';
const DEFAULT_MODEL = 'gemini-3.5-flash-lite';

const requestSchema = z.object({
  text: z.string().trim().min(40).max(60_000),
  sourceName: z.string().max(250).optional().default(''),
  questionCount: z.number().int().min(3).max(15).optional().default(8),
  template: z.enum(['quiz', 'scenario', 'matching']).optional().default('scenario'),
  grade: z.string().max(50).optional().default(''),
  subject: z.string().max(100).optional().default(''),
  idempotencyKey: z.string().trim().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/u).optional(),
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function configured(env: WorkerEnv): boolean {
  return Boolean(env && env.SUPABASE_URL && env.SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY && env.GEMINI_API_KEY);
}

function monthNow(): string {
  // Kỳ 14 ngày (#362): cùng hàm với bản Express, nên hai bản không thể chia kỳ khác nhau.
  return usagePeriod().key;
}

export interface HandlerDeps extends BillingDeps {
  /** Cho test bơm bản giả; mặc định là các adapter thật ở `supabase.ts`. */
  store?: (env: WorkerEnv) => QuotaStore;
  ledger?: (env: WorkerEnv) => UsageLogDb;
  auth?: (env: WorkerEnv, authorization: string) => Promise<string | null>;
  generate?: typeof requestGameJson;
}

export async function handle(
  request: Request,
  env: WorkerEnv,
  deps: HandlerDeps = {}
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/u, '') || '/';

  // `/health` KHÔNG cần cấu hình và KHÔNG lộ gì: nó chỉ nói "tôi là gateway nào, bản nào".
  if (path === '/health' && request.method === 'GET') {
    return json({ ok: true, service: SERVICE, version: env.GATEWAY_VERSION || DEFAULT_VERSION });
  }

  // #364 — thanh toán đi trước mọi kiểm tra khác: webhook của nhà cung cấp KHÔNG có token
  // người dùng, và `/v1/billing/status` phải trả lời được cả khi AI chưa cấu hình (một giáo
  // viên muốn mua gói không nên đọc "máy chủ AI chưa cấu hình").
  const billing = await handleBilling(request, env, {
    db: deps.db,
    auth: deps.auth,
    createLink: deps.createLink,
    now: deps.now,
  });
  if (billing) return billing;

  if (path !== '/v1/usage' && path !== '/v1/generate') {
    return json({ error: 'Không có đường này.', code: 'not_found' }, 404);
  }
  if (!configured(env)) {
    return json({ error: 'Máy chủ AI chưa được cấu hình đầy đủ.', code: 'server_not_configured' }, 503);
  }

  const getUser = deps.auth || verifyUser;
  const userId = await getUser(env, request.headers.get('authorization') || '');
  if (!userId) {
    return json({ error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' }, 401);
  }

  const makeStore = deps.store || quotaStore;
  const makeLedger = deps.ledger || usageLogDb;
  const month = monthNow();

  // ── ĐỌC hạn mức: không trừ gì, và `userId` đến từ token ────────────────────
  if (path === '/v1/usage') {
    if (request.method !== 'GET') return json({ error: 'Chỉ nhận GET.' }, 405);
    try {
      const store = makeStore(env);
      const plan = await store.planOf(userId);
      const usedRow = await store.readUsed(userId, month);
      const credits = typeof store.readCredits === 'function' ? await store.readCredits(userId, month) : null;
      const snapshot = usageSnapshot(
        plan,
        month,
        {
          generations: usedRow ?? 0,
          creditsUsed: credits ? credits.used : 0,
          creditsLimit: credits ? credits.limit : 0,
        },
        typeof store.creditCost === 'function' ? await store.creditCost('question_generation') : null,
        typeof store.monthlyCredits === 'function' ? await store.monthlyCredits('pro') : null
      );
      return json(snapshot);
    } catch (error) {
      console.error('Usage read failed:', error instanceof Error ? error.message : 'unknown');
      return json({ error: 'Chưa đọc được hạn mức kỳ này. Thử lại sau ít phút.' }, 503);
    }
  }

  // ── SINH nội dung ─────────────────────────────────────────────────────────
  if (request.method !== 'POST') return json({ error: 'Chỉ nhận POST.' }, 405);
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Dữ liệu gửi lên không phải JSON.' }, 400);
  }
  const parsed = requestSchema.safeParse(payload);
  if (!parsed.success) {
    return json({ error: 'Dữ liệu đầu vào không hợp lệ.', details: parsed.error.flatten() }, 400);
  }
  const input = parsed.data;
  const ledger = makeLedger(env);

  // Giữ chỗ TRƯỚC khi trừ lượt (#357): cùng một lần bấm gửi lại thì không trừ hai lần.
  const key = normalizeIdempotencyKey(input.idempotencyKey);
  let claimId: string | null = null;
  if (key) {
    const claim = await claimUsageLog(ledger, { userId, key });
    // `strict` đang tắt nên union theo `ok` không tự thu hẹp kiểu (cùng lý do ở `server/index.ts`).
    const claimView = claim as { ok: boolean; duplicate?: boolean; id?: string | null; reason?: string };
    if (!claimView.ok) {
      console.error('Usage log claim failed:', claimView.reason || 'unknown');
    } else if (claimView.duplicate) {
      return json(
        {
          error:
            'Lần tạo này đã hoàn tất trước đó nên không trừ lượt lần hai. Mở Thư viện để xem trò chơi vừa tạo; nếu chưa thấy, hãy bấm tạo lại.',
          code: 'duplicate_request',
        },
        409
      );
    } else {
      claimId = claimView.id || null;
    }
  }

  const store = makeStore(env);
  const outcome = (await consumeGeneration(store, userId, month)) as {
    ok: boolean;
    kind?: 'exhausted' | 'unavailable';
    reason?: string;
    quota?: { allowed: boolean; used: number; quotaLimit: number; plan: string; unit?: 'generations' | 'credits'; cost?: number };
  };

  if (!outcome.ok) {
    await releaseUsageLog(ledger, claimId);
    if (outcome.kind === 'exhausted' && outcome.quota) {
      const exhausted =
        outcome.quota.unit === 'credits'
          ? 'Bạn đã dùng hết credits tạo game của tháng.'
          : 'Bạn đã sử dụng hết lượt tạo game của tháng.';
      return json({ error: exhausted, usage: outcome.quota }, 429);
    }
    const described = describeQuotaFailure({ message: outcome.reason || '' });
    console.error('Quota error:', described.body.code, outcome.reason || '');
    return json(described.body, described.status);
  }

  const quota = outcome.quota!;
  const model = env.GEMINI_MODEL || DEFAULT_MODEL;
  // Sổ là "biên lai", không phải điều kiện: `writeUsageLog` không ném, và một sổ hỏng không
  // được làm hỏng lần gọi mà giáo viên đã trả lượt (#351).
  const sink = {
    from: () => ({
      insert: async (row: unknown) => {
        const inserted = await ledger.insertPending(row as never);
        return { error: inserted.id ? null : { message: inserted.reason || 'insert_failed' } };
      },
    }),
  };
  const settle = async (state: { status: 'completed' | 'failed'; questions?: number; error?: string | null }) => {
    const row = usageLogRow({
      userId,
      status: state.status,
      kind: 'question_generation',
      model,
      cost: quota.cost,
      unit: quota.unit,
      plan: quota.plan,
      questions: state.questions,
      error: state.error,
    });
    const written = await settleUsageLog(ledger, sink, claimId, row);
    if (!written.ok) console.error('Usage log failed:', written.reason || 'unknown');
  };
  const refund = async () => {
    const returned = await refundGeneration(store, userId, month, quota.used, { unit: quota.unit, cost: quota.cost });
    if (!returned) console.error('Refund failed:', quota.unit, quota.used, quota.cost, userId);
  };

  const prompt = `Tạo trò chơi giáo dục bằng tiếng Việt. Chỉ trả về JSON, không markdown.
Schema: {"title":"","subject":"","grade":"","topic":"","template":"quiz|scenario|matching","description":"","questions":[{"id":"q1","type":"multiple-choice|scenario","prompt":"","options":[{"id":"a","text":""},{"id":"b","text":""},{"id":"c","text":""}],"correctOptionId":"a","explanation":"","points":100}]}
Tạo ${input.questionCount} câu. Mỗi câu có 3-4 phương án và đúng một đáp án. Giải thích ngắn. Không bịa điều luật, số tiền phạt hoặc dữ kiện không có trong tài liệu; ghi rõ nếu giáo viên cần xác minh. Mẫu: ${input.template}; lớp: ${input.grade || 'chưa rõ'}; môn: ${input.subject || 'chưa rõ'}; tên tài liệu: ${input.sourceName || 'không có'}.
Nội dung bài học:
${input.text}`;

  const generate = deps.generate || requestGameJson;
  try {
    const result = await generate(prompt, { apiKey: env.GEMINI_API_KEY, model });
    if (!result.ok) {
      const failure = result as { status: number; body: string; attempts: number };
      console.error('Gemini API error:', failure.status, 'sau', failure.attempts, 'lượt:', failure.body.slice(0, 500));
      await refund();
      await settle({ status: 'failed', error: `gemini_${failure.status}` });
      return json({ error: 'Dịch vụ AI đang gặp lỗi. Vui lòng thử lại sau.' }, 502);
    }
    let game: unknown;
    try {
      game = JSON.parse(result.text);
    } catch {
      await refund();
      await settle({ status: 'failed', error: 'invalid_game_json' });
      return json({ error: 'AI trả về cấu trúc trò chơi không hợp lệ.' }, 502);
    }
    const candidate = game as { title?: unknown; questions?: unknown };
    if (!candidate || typeof candidate.title !== 'string' || !Array.isArray(candidate.questions) || candidate.questions.length === 0) {
      await refund();
      await settle({ status: 'failed', error: 'invalid_game_json' });
      return json({ error: 'AI trả về cấu trúc trò chơi không hợp lệ.' }, 502);
    }
    await settle({ status: 'completed', questions: candidate.questions.length });
    return json({ game, provider: model, usage: quota });
  } catch (error) {
    console.error('Generation failed:', error instanceof Error ? error.message : 'unknown');
    await refund();
    await settle({ status: 'failed', error: 'exception' });
    return json({ error: 'Không thể tạo trò chơi lúc này. Hãy kiểm tra kết nối rồi thử lại.' }, 502);
  }
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    return handle(request, env);
  },
};
