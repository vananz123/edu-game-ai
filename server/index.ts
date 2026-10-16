import express, { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

const PORT = Number(process.env.PORT || 8787);
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';

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
  subject: z.string().max(100).optional().default('')
});

const quotaSchema = z.object({
  allowed: z.boolean(),
  used: z.number(),
  quota_limit: z.number(),
  plan: z.string()
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

app.get('/health', (_req, res) => res.json({ ok: true, service: 'edugame-ai-gateway', version: '0.3.0' }));

app.post('/v1/generate', requireConfiguration, requireUser, async (req: AuthenticatedRequest, res: Response) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Dữ liệu đầu vào không hợp lệ.', details: parsed.error.flatten() });
    return;
  }
  const admin = adminClient!;
  const userId = req.userId!;
  const month = new Date().toISOString().slice(0, 7);
  const { data: quotaResult, error: quotaError } = await admin.rpc('consume_generation_quota', {
    p_user_id: userId,
    p_month: month
  }).single();
  if (quotaError) {
    console.error('Quota RPC error:', quotaError.message);
    res.status(503).json({ error: 'Không kiểm tra được hạn mức. Vui lòng thử lại sau.' });
    return;
  }
  const quota = quotaSchema.safeParse(quotaResult);
  if (!quota.success) {
    console.error('Quota RPC returned an invalid response:', quota.error.message);
    res.status(503).json({ error: 'Không đọc được kết quả hạn mức. Vui lòng thử lại sau.' });
    return;
  }
  if (!quota.data.allowed) {
    res.status(429).json({ error: 'Bạn đã sử dụng hết lượt tạo game của tháng.', usage: quota.data });
    return;
  }

  const input = parsed.data;
  const prompt = `Tạo trò chơi giáo dục bằng tiếng Việt. Chỉ trả về JSON, không markdown.
Schema: {"title":"","subject":"","grade":"","topic":"","template":"quiz|scenario|matching","description":"","questions":[{"id":"q1","type":"multiple-choice|scenario","prompt":"","options":[{"id":"a","text":""},{"id":"b","text":""},{"id":"c","text":""}],"correctOptionId":"a","explanation":"","points":100}]}
Tạo ${input.questionCount} câu. Mỗi câu có 3-4 phương án và đúng một đáp án. Giải thích ngắn. Không bịa điều luật, số tiền phạt hoặc dữ kiện không có trong tài liệu; ghi rõ nếu giáo viên cần xác minh. Mẫu: ${input.template}; lớp: ${input.grade || 'chưa rõ'}; môn: ${input.subject || 'chưa rõ'}; tên tài liệu: ${input.sourceName || 'không có'}.
Nội dung bài học:
${input.text}`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: 'Bạn là chuyên gia thiết kế trò chơi giáo dục tiếng Việt. Đảm bảo câu hỏi rõ ràng, đáp án nhất quán và không bịa dữ kiện.' }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, responseMimeType: 'application/json' }
      }),
      signal: AbortSignal.timeout(90_000)
    });
    if (!response.ok) {
      const providerBody = await response.text();
      console.error('Gemini API error:', response.status, providerBody.slice(0, 1000));
      res.status(502).json({ error: 'Dịch vụ AI đang gặp lỗi. Vui lòng thử lại sau.' });
      return;
    }
    const body = await response.json() as any;
    const text = body.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || '').join('') || '';
    const game = JSON.parse(text);
    if (!game || typeof game.title !== 'string' || !Array.isArray(game.questions) || game.questions.length === 0) {
      res.status(502).json({ error: 'AI trả về cấu trúc trò chơi không hợp lệ.' });
      return;
    }
    // Do not persist source lesson text or generated content on the backend.
    res.json({ game, provider: GEMINI_MODEL, usage: quota.data });
  } catch (error) {
    console.error('Generation failed:', error instanceof Error ? error.message : 'unknown');
    res.status(502).json({ error: 'Không thể tạo trò chơi lúc này. Hãy kiểm tra kết nối rồi thử lại.' });
  }
});

app.listen(PORT, () => {
  console.log(`EduGame AI Gateway listening on port ${PORT}`);
});
