import express, { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { requestGameJson } from './gemini.js';
import { consumeGeneration, describeQuotaFailure, refundGeneration, usagePeriod, usageSnapshot, type QuotaStore } from './quota.js';
import { claimUsageLog, normalizeIdempotencyKey, releaseUsageLog, settleUsageLog, usageLogRow, writeUsageLog, type UsageLogDb } from './usage-log.js';

const PORT = Number(process.env.PORT || 8787);
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
// 24/11: `gemini-2.5-flash-lite` trả 404 "no longer available to new users"; đo được
// `gemini-3.5-flash-lite` → 200 trên cả `:generateContent` và endpoint tương thích
// OpenAI. Đổi mặc định là việc của tệp này; đổi biến môi trường là việc của người chạy.
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false }));

const requestSchema = z.object({
  text: z.string().trim().min(40).max(60_000),
  sourceName: z.string().max(250).optional().default(''),
  questionCount: z.number().int().min(3).max(15).optional().default(8),
  template: z.enum(['quiz', 'scenario', 'matching']).optional().default('scenario'),
  grade: z.string().max(50).optional().default(''),
  subject: z.string().max(100).optional().default(''),
  // #357: khoá cho MỘT lần bấm, để lần thử lại không thành hai dòng sổ và hai lần trừ lượt.
  idempotencyKey: z.string().trim().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/u).optional()
});

let authClient: SupabaseClient | null = null;
let adminClient: SupabaseClient | null = null;
if (SUPABASE_URL && SUPABASE_ANON_KEY) authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

interface AuthenticatedRequest extends Request { userId?: string; accessToken?: string; }

function requireConfiguration(_req: Request, res: Response, next: NextFunction) {
  if (!authClient || !adminClient || !GEMINI_API_KEY) {
    res.status(503).json({ error: 'Cloud backend chưa được cấu hình đầy đủ.' });
    return;
  }
  next();
}

async function requireUser(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authorization = req.header('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token || !authClient) {
    res.status(401).json({ error: 'Vui lòng đăng nhập để tạo trò chơi.' });
    return;
  }
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' });
    return;
  }
  req.userId = data.user.id;
  req.accessToken = token;
  next();
}

/**
 * Adapter cho `consumeGeneration`: đọc/ghi bảng bằng service_role. Không có hàm RPC nào
 * ở đây — đó là chủ ý (xem đầu `quota.ts`): bảng đã tồn tại thì sản phẩm phải chạy.
 */
/**
 * Adapter sổ dùng AI (#357): ba thao tác mà `claimUsageLog` cần. `insertPending` chèn với
 * `ignoreDuplicates` để khoá trùng **không** phải lỗi — chính việc "không chèn được" là
 * thông tin (khoá đã tồn tại).
 */
function usageLogDb(admin: SupabaseClient): UsageLogDb {
  return {
    async insertPending(row) {
      const { data, error } = await admin
        .from('ai_usage_log')
        .upsert(row, { onConflict: 'idempotency_key', ignoreDuplicates: true })
        .select('id');
      if (error) return { inserted: false, id: null, reason: error.message };
      const rows = (data as { id: string }[] | null) || [];
      return { inserted: rows.length > 0, id: rows.length > 0 ? rows[0].id : null };
    },
    async findKey(userId, key) {
      const { data, error } = await admin
        .from('ai_usage_log')
        .select('id,status')
        .eq('user_id', userId)
        .eq('idempotency_key', key)
        .maybeSingle();
      if (error || !data) return null;
      return data as { id: string; status: string };
    },
    async finish(id, row) {
      const { error } = await admin
        .from('ai_usage_log')
        .update({
          model: row.model,
          credit_cost: row.credit_cost,
          status: row.status,
          completed_at: row.completed_at,
          metadata: row.metadata,
        })
        .eq('id', id);
      return error ? { ok: false, reason: error.message } : { ok: true };
    },
    async release(id) {
      const { error } = await admin.from('ai_usage_log').delete().eq('id', id);
      return error ? { ok: false, reason: error.message } : { ok: true };
    },
  };
}

function quotaStore(admin: SupabaseClient): QuotaStore {
  return {
    async planOf(userId) {
      const { data, error } = await admin
        .from('subscriptions')
        .select('plan,status')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as { plan: string; status: string } | null) ?? null;
    },
    async ensureRow(userId, month) {
      const { error } = await admin
        .from('usage_monthly')
        .upsert({ user_id: userId, month, generations: 0 }, { onConflict: 'user_id,month', ignoreDuplicates: true });
      if (error) throw new Error(error.message);
    },
    async readUsed(userId, month) {
      const { data, error } = await admin
        .from('usage_monthly')
        .select('generations')
        .eq('user_id', userId)
        .eq('month', month)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ? Number((data as { generations: number }).generations) : null;
    },
    async casBump(userId, month, from, to) {
      const { data, error } = await admin
        .from('usage_monthly')
        .update({ generations: to, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('month', month)
        .eq('generations', from)
        .select('generations');
      if (error) throw new Error(error.message);
      return Array.isArray(data) && data.length === 1;
    },
    // ── credits (#348): cùng một dòng `usage_monthly`, cột khác ──────────────
    async readCredits(userId, month) {
      const { data, error } = await admin
        .from('usage_monthly')
        .select('credits_used,credits_limit')
        .eq('user_id', userId)
        .eq('month', month)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      const row = data as { credits_used: number; credits_limit: number };
      return { used: Number(row.credits_used), limit: Number(row.credits_limit) };
    },
    async casBumpCredits(userId, month, from, to) {
      const { data, error } = await admin
        .from('usage_monthly')
        .update({ credits_used: to, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('month', month)
        .eq('credits_used', from)
        .select('credits_used');
      if (error) throw new Error(error.message);
      return Array.isArray(data) && data.length === 1;
    },
    async creditCost(kind) {
      const { data, error } = await admin
        .from('server_config')
        .select('value')
        .eq('key', 'credit_cost_' + kind)
        .maybeSingle();
      // Không có khoá cấu hình KHÔNG phải lỗi: rơi về giá mặc định trong quota.ts.
      if (error || !data) return 0;
      const raw = (data as { value: unknown }).value;
      const number = typeof raw === 'number' ? raw : Number(String(raw).replace(/"/g, ''));
      return Number.isFinite(number) ? number : 0;
    },
    async monthlyCredits(plan) {
      const { data, error } = await admin
        .from('server_config')
        .select('value')
        .eq('key', plan === 'pro' ? 'quota_pro_monthly_credits' : 'quota_free_monthly_credits')
        .maybeSingle();
      if (error || !data) return 0;
      const raw = (data as { value: unknown }).value;
      const number = typeof raw === 'number' ? raw : Number(String(raw).replace(/"/g, ''));
      return Number.isFinite(number) ? number : 0;
    },
    async ensureCreditsLimit(userId, month, limit) {
      const { error } = await admin
        .from('usage_monthly')
        .update({ credits_limit: limit, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('month', month)
        .lt('credits_limit', limit);
      if (error) throw new Error(error.message);
    },
  };
}

app.get('/health', (_req, res) => res.json({ ok: true, service: 'edugame-ai-gateway', version: '0.5.6' }));

/**
 * `GET /v1/usage` (#354) — "tháng này tôi còn bao nhiêu", KHÔNG trừ gì.
 *
 * Vì sao ở gateway chứ ở app: bảng `usage_monthly`/`subscriptions` chưa có policy đọc cho
 * chính chủ (đo được: token thật + anon key ⇒ 0 dòng), nên renderer không tự đọc được. Đặt
 * phép đọc sau `requireUser` nghĩa là `userId` LUÔN đến từ token, không bao giờ từ tham số
 * của người gọi — không có đường nào để đọc hạn mức của người khác.
 */
app.get('/v1/usage', requireConfiguration, requireUser, async (req: AuthenticatedRequest, res: Response) => {
  const admin = adminClient!;
  const userId = req.userId!;
  const month = usagePeriod().key;
  try {
    const store = quotaStore(admin);
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
    res.json(snapshot);
  } catch (error) {
    console.error('Usage read failed:', error instanceof Error ? error.message : 'unknown');
    res.status(503).json({ error: 'Chưa đọc được hạn mức kỳ này. Thử lại sau ít phút.' });
  }
});

app.post('/v1/generate', requireConfiguration, requireUser, async (req: AuthenticatedRequest, res: Response) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Dữ liệu đầu vào không hợp lệ.', details: parsed.error.flatten() });
    return;
  }
  const admin = adminClient!;
  const userId = req.userId!;
  const month = usagePeriod().key;
  const ledger = usageLogDb(admin);
  // #357: giữ chỗ TRƯỚC khi trừ lượt. Khoá trùng đã `completed` ⇒ trả lời ngay, chưa trừ gì.
  const key = normalizeIdempotencyKey(parsed.data.idempotencyKey);
  let claimId: string | null = null;
  if (key) {
    const claim = await claimUsageLog(ledger, { userId, key });
    // `strict` đang tắt: union theo `ok` không tự thu hẹp kiểu, nên nhánh lỗi được nói ra.
    const claimFailure = claim as { ok: boolean; duplicate?: boolean; id?: string | null; reason?: string };
    if (!claimFailure.ok) {
      console.error('Usage log claim failed:', claimFailure.reason || 'unknown');
    } else if (claimFailure.duplicate) {
      // Lần gọi này đã thành công và đã trừ lượt rồi. Không trừ lần hai, và câu trả lời phải
      // nói giáo viên nên làm gì tiếp — không phải "lỗi 409" trần trụi.
      res.status(409).json({
        error: 'Lần tạo này đã hoàn tất trước đó nên không trừ lượt lần hai. Mở Thư viện để xem trò chơi vừa tạo; nếu chưa thấy, hãy bấm tạo lại.',
        code: 'duplicate_request',
      });
      return;
    } else {
      claimId = claimFailure.id || null;
    }
  }
  const outcome = await consumeGeneration(quotaStore(admin), userId, month);
  // `strict` đang tắt nên union theo `ok` không tự thu hẹp kiểu; nhánh lỗi được nói ra
  // bằng một kiểu riêng thay vì dựa vào suy luận của compiler.
  const failure = outcome as {
    ok: boolean;
    kind?: 'exhausted' | 'unavailable';
    reason?: string;
    quota?: {
      allowed: boolean;
      used: number;
      quotaLimit: number;
      plan: string;
      unit?: 'generations' | 'credits';
      cost?: number;
    };
  };
  if (!failure.ok) {
    // Chưa trừ gì và chưa gọi AI ⇒ nhả chỗ, để lần bấm sau (cùng khoá hay khoá mới) không
    // bị một dòng `pending` vô nghĩa chặn đường.
    await releaseUsageLog(ledger, claimId);
    if (failure.kind === 'exhausted' && failure.quota) {
      // Câu phải nói đúng đơn vị: hết CREDITS không phải "hết lượt", và giáo viên trả phí
      // cần biết mình đang bị trừ bằng gì để quyết định nâng gói hay chờ tháng sau.
      const exhausted = failure.quota && failure.quota.unit === 'credits'
        ? 'Bạn đã dùng hết credits tạo game của tháng.'
        : 'Bạn đã sử dụng hết lượt tạo game của tháng.';
      res.status(429).json({ error: exhausted, usage: failure.quota });
      return;
    }
    const described = describeQuotaFailure({ message: failure.reason || '' });
    console.error('Quota error:', described.body.code, failure.reason || '');
    res.status(described.status).json(described.body);
    return;
  }
  const quota = failure.quota!;
  // #351: sổ dùng chung cho cả ba nhánh (thành công / AI hỏng / cấu trúc hỏng). Ghi sổ KHÔNG
  // được làm hỏng một lần gọi đã trừ tiền, nên hàm này không ném.
  const logUsage = async (
    input: { status: 'completed' | 'failed'; questions?: number; error?: string | null }
  ): Promise<void> => {
    const row = usageLogRow({
      userId,
      status: input.status,
      kind: 'question_generation',
      model: GEMINI_MODEL,
      cost: quota.cost,
      unit: quota.unit,
      plan: quota.plan,
      questions: input.questions,
      error: input.error,
    });
    const written = await settleUsageLog(ledger, admin, claimId, row);
    if (!written.ok) console.error('Usage log failed:', written.reason || 'unknown');
  };
  // Đã trừ một lượt ⇒ mọi nhánh hỏng phía dưới phải trả lại. Một lượt bị trừ cho trò
  // chơi không tồn tại là lỗi của sản phẩm, không phải của Google.
  const refund = async (): Promise<void> => {
    // Trả lại ĐÚNG đơn vị và ĐÚNG số đã trừ: hoàn 1 "lượt" cho một lần trừ 2 credits là
    // giáo viên mất tiền trong khi hệ thống báo đã hoàn.
    const returned = await refundGeneration(quotaStore(admin), userId, month, quota.used, {
      unit: quota.unit,
      cost: quota.cost,
    });
    if (!returned) console.error('Refund failed:', quota.unit, quota.used, quota.cost, userId);
  };

  const input = parsed.data;
  const prompt = `Tạo trò chơi giáo dục bằng tiếng Việt. Chỉ trả về JSON, không markdown.
Schema: {"title":"","subject":"","grade":"","topic":"","template":"quiz|scenario|matching","description":"","questions":[{"id":"q1","type":"multiple-choice|scenario","prompt":"","options":[{"id":"a","text":""},{"id":"b","text":""},{"id":"c","text":""}],"correctOptionId":"a","explanation":"","points":100}]}
Tạo ${input.questionCount} câu. Mỗi câu có 3-4 phương án và đúng một đáp án. Giải thích ngắn. Không bịa điều luật, số tiền phạt hoặc dữ kiện không có trong tài liệu; ghi rõ nếu giáo viên cần xác minh. Mẫu: ${input.template}; lớp: ${input.grade || 'chưa rõ'}; môn: ${input.subject || 'chưa rõ'}; tên tài liệu: ${input.sourceName || 'không có'}.
Nội dung bài học:
${input.text}`;

  try {
    // Ba lượt tối đa: nhà cung cấp trả `503 high demand` cho chính model vừa trả
    // `200` vài giây trước, nên một lượt duy nhất là mất một giáo viên.
    const result = await requestGameJson(prompt, { apiKey: GEMINI_API_KEY, model: GEMINI_MODEL });
    if (!result.ok) {
      // `strict` đang tắt nên union theo `ok` không tự thu hẹp kiểu; ép kiểu nói ra
      // rằng nhánh này chỉ còn dạng lỗi.
      const failure = result as { status: number; body: string; attempts: number };
      console.error('Gemini API error:', failure.status, 'sau', failure.attempts, 'lượt:', failure.body.slice(0, 500));
      await refund();
      await logUsage({ status: 'failed', error: `gemini_${failure.status}` });
      res.status(502).json({ error: 'Dịch vụ AI đang gặp lỗi. Vui lòng thử lại sau.' });
      return;
    }
    const text = result.text;
    const game = JSON.parse(text);
    if (!game || typeof game.title !== 'string' || !Array.isArray(game.questions) || game.questions.length === 0) {
      await refund();
      await logUsage({ status: 'failed', error: 'invalid_game_json' });
      res.status(502).json({ error: 'AI trả về cấu trúc trò chơi không hợp lệ.' });
      return;
    }
    // Do not persist source lesson text or generated content on the backend.
    await logUsage({ status: 'completed', questions: game.questions.length });
    res.json({ game, provider: GEMINI_MODEL, usage: quota });
  } catch (error) {
    console.error('Generation failed:', error instanceof Error ? error.message : 'unknown');
    await refund();
    await logUsage({ status: 'failed', error: 'exception' });
    res.status(502).json({ error: 'Không thể tạo trò chơi lúc này. Hãy kiểm tra kết nối rồi thử lại.' });
  }
});

app.listen(PORT, () => {
  console.log(`EduGame AI Gateway listening on port ${PORT}`);
});
