/**
 * The "Giáo án" chat (#182).
 *
 * Everything here is Electron-free: the main process hands in a `LessonChatClient`
 * (the same shape the wizard steps use), the documents the teacher picked, and the
 * stored history, and this module returns the turn. That keeps the whole chat
 * testable with a plain mock client — and keeps `main.ts` from growing a second
 * prompt-and-repair pipeline.
 *
 * Two rules shape the design:
 *  - **Quotes come from the attached lessons, when there are any.** `buildChatEvidence`
 *    pulls them from the documents the teacher attached and the model is told to say
 *    it does not know rather than invent. Attaching **nothing** is a supported turn
 *    (#183): the prompt then says so explicitly and the answer is labelled a general
 *    pedagogical suggestion instead of pretending to be grounded.
 *  - **A question set is already a game draft.** The "predefined format" is the
 *    existing arena contract (`gameDraftJsonSchemas.arena` + `normalizeDraft`), so
 *    a set the teacher accepts goes straight into the wizard with no converter and
 *    no second model call.
 */
import { isQuestionSetRequest, selectRelevantEvidence } from '../../ai-core/document-assist';
import { gameDraftJsonSchemas } from './lesson-contracts';
import { normalizeDraft } from './lesson-normalize';
import {
  buildDraftRepairMessages,
  buildDraftShortfallMessages,
  buildRepairMessages,
  type ChatMessage
} from './lesson-prompts';
import { itemCount } from './lesson-item-repair';
import { isCancelReason, type AiRequestRegistry } from '../ai/ai-transport';
import { runStructuredStep, type LessonChatClient } from './lesson-workflow';
import type {
  ArenaDraft,
  LessonChatCitation,
  LessonChatComposerMode,
  LessonChatIntent,
  LessonChatMessage
} from '../../shared/lesson-types';

/** How many quotes one lesson contributes before the global budget is applied. */
export const CHAT_QUOTES_PER_DOCUMENT = 3;
/** Total characters of lesson text the chat will put in front of the model. */
export const CHAT_EVIDENCE_MAX_CHARS = 3200;
/** Fallback slice per lesson when nothing matched the question's words. */
export const CHAT_FALLBACK_CHARS_PER_DOCUMENT = 500;
/** Previous turns replayed so "ngắn hơn nữa" works (#182 is a chat, not a form). */
export const CHAT_HISTORY_MAX_MESSAGES = 6;
/** Characters kept from each stored turn when replaying history. */
export const CHAT_HISTORY_MAX_CHARS_PER_MESSAGE = 700;
export const CHAT_DEFAULT_QUESTION_COUNT = 5;
/** The arena contract caps a draft at 30 items. */
export const CHAT_MAX_QUESTION_COUNT = 30;

const CHAT_ANSWER_SYSTEM_PROMPT =
  'Bạn là trợ lý sư phạm tiếng Việt của giáo viên. Chỉ được trả lời dựa trên các đoạn trích dẫn của giáo án được cung cấp; nếu đoạn trích không đủ căn cứ, hãy nói rõ là giáo án không nêu điều đó và không bịa thêm. Trả lời ngắn gọn, xuống dòng theo ý, tối đa 6 câu. Chỉ trả về DUY NHẤT một đối tượng JSON hợp lệ có dạng {"answer":"..."}, không kèm markdown.';

const QUESTION_SET_SYSTEM_PROMPT =
  'Bạn là trợ lý soạn câu hỏi trắc nghiệm tiếng Việt cho giáo viên. Chỉ được dùng nội dung giáo án trong các đoạn trích dẫn; mỗi câu phải có một đáp án đúng duy nhất, giải thích 1 câu và độ khó. Chỉ trả về DUY NHẤT một đối tượng JSON hợp lệ, không kèm markdown.';

/**
 * #183: a turn with **no** lesson attached is legal, so it needs its own system
 * prompt. The difference is not cosmetic — telling the model "chỉ được trả lời dựa
 * trên các đoạn trích dẫn" when there are no quotes invites either a refusal or a
 * fabrication about a document it never saw.
 */
const UNGROUNDED_ANSWER_SYSTEM_PROMPT =
  'Bạn là trợ lý sư phạm tiếng Việt của giáo viên. Lượt này giáo viên không gắn giáo án nào, nên hãy trả lời bằng kiến thức sư phạm chung và nói rõ đó là gợi ý chung chứ không trích từ giáo án của họ; không được bịa rằng mình đang đọc một tài liệu cụ thể. Trả lời ngắn gọn, xuống dòng theo ý, tối đa 6 câu. Chỉ trả về DUY NHẤT một đối tượng JSON hợp lệ có dạng {"answer":"..."}, không kèm markdown.';

const UNGROUNDED_QUESTION_SET_SYSTEM_PROMPT =
  'Bạn là trợ lý soạn câu hỏi trắc nghiệm tiếng Việt cho giáo viên. Lượt này không có giáo án kèm theo, nên hãy soạn theo đúng yêu cầu của giáo viên bằng kiến thức của bậc học được nêu; mỗi câu phải có một đáp án đúng duy nhất, giải thích 1 câu và độ khó. Chỉ trả về DUY NHẤT một đối tượng JSON hợp lệ, không kèm markdown.';

/** The schema the model must answer into for an in-chat reply. */
export const lessonChatAnswerJsonSchema = {
  name: 'lesson_chat_answer',
  schema: {
    type: 'object',
    properties: { answer: { type: 'string' } },
    required: ['answer'],
    additionalProperties: false
  }
};

/**
 * The predefined question format is the arena draft, reused verbatim from the
 * wizard contract. The ref has its own name so a fixture or a mock can answer the
 * chat without shadowing the wizard's `game_draft_arena` responses.
 */
export function lessonQuestionSetSchemaRef(): { name: string; schema: unknown } | null {
  const schema = gameDraftJsonSchemas.arena;
  return schema ? { name: 'lesson_question_set', schema } : null;
}

/** One lesson the chat may read: what `lesson_documents` holds plus its text. */
export interface LessonChatDocument {
  id: string;
  name: string;
  text: string;
}

export interface ChatEvidenceInput {
  documents: LessonChatDocument[];
  question: string;
  quotesPerDocument?: number;
  maxChars?: number;
}

export interface ChatEvidence {
  citations: LessonChatCitation[];
  /** The passage block pasted into the prompt, numbered from 1 across lessons. */
  text: string;
  characters: number;
  /** True when nothing matched and the opening of each lesson was sent instead. */
  fallback: boolean;
  /** Lessons that contributed nothing — unreadable, empty, or out of budget. */
  namesWithoutEvidence: string[];
}

export interface LessonChatTurnInput {
  client: LessonChatClient;
  registry: AiRequestRegistry;
  requestId: string;
  documents: LessonChatDocument[];
  question: string;
  /** Stored turns of this conversation, oldest first (may be empty). */
  history: LessonChatMessage[];
  /** What the composer's mode switch says; `'auto'` trusts the local classifier. */
  mode?: LessonChatComposerMode;
  /** Overrides the count parsed from the question (the composer's stepper). */
  questionCount?: number;
  onStage?: (stage: 'retrieve' | 'generate' | 'validate') => void;
}

export interface LessonChatTurnResult {
  intent: LessonChatIntent;
  answer: string;
  citations: LessonChatCitation[];
  questionSet: ArenaDraft | null;
  /** Set when the model failed: the answer is the honest fallback, not a reply. */
  errorCode: string;
  providerId: string;
  evidenceCharacters: number;
  evidenceFallback: boolean;
  /** False when the teacher attached **no** lesson (#183) — the turn is a general suggestion. */
  grounded: boolean;
  namesWithoutEvidence: string[];
  requestedCount: number;
}

/**
 * Folds Vietnamese text for keyword matching: the intent patterns are written
 * without diacritics so `giáo án`, `game` and `trò chơi` all match whichever way
 * the teacher typed them. (`document-assist` folds the same way internally.)
 */
export function foldChatText(value: string): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

const GAME_NOUN = /\b(tro choi|game|quiz|thi dua|duong dua|o an chu|nha mau|khach tham du)\b/;
const MAKE_VERB = /\b(tao|lam|soan|viet|doi|ghi|nho|giup)\b/;

/**
 * Decides whether a turn wants an answer or a question set — offline, in a few
 * microseconds, because a second model call for intent would cost more than the
 * answer itself on the shipped local model.
 *
 * The composer's switch always wins (`mode !== 'auto'`): a teacher who pressed
 * "Bộ câu hỏi" must not be talked out of it by a heuristic. In `'auto'`, a request
 * ending in `?` is treated as a question even when it mentions games, because
 * "trò chơi trong bài là gì?" asks *about* the lesson.
 */
export function classifyLessonChatIntent(question: string, mode: LessonChatComposerMode = 'auto'): LessonChatIntent {
  if (mode === 'question_set') return 'question_set';
  if (mode === 'answer') return 'answer';
  const raw = String(question ?? '').trim();
  if (!raw) return 'answer';
  if (isQuestionSetRequest(raw)) return 'question_set';
  const folded = foldChatText(raw);
  if (/["?]\s*$/.test(raw)) return 'answer';
  return GAME_NOUN.test(folded) && MAKE_VERB.test(folded) ? 'question_set' : 'answer';
}

const COUNT_BEFORE_ITEM = /\b(\d{1,2})\b[^.\n]{0,15}\b(cau hoi|cau|hoi)\b/;
const COUNT_AFTER_ITEM = /\b(cau hoi|cau)\b[^.\n]{0,15}\b(\d{1,2})\b/;

/**
 * Reads the count out of the teacher's own words ("cho 8 câu hỏi"). Only digits:
 * spelling out "tám" is a language trap the heuristic would get wrong more often
 * than right, and the composer shows the number it is about to ask for.
 */
export function requestedQuestionCount(question: string, fallback = CHAT_DEFAULT_QUESTION_COUNT): number {
  const folded = foldChatText(question);
  const before = COUNT_BEFORE_ITEM.exec(folded);
  const digits = before ? Number(before[1]) : (() => {
    const after = COUNT_AFTER_ITEM.exec(folded);
    return after ? Number(after[2]) : NaN;
  })();
  return clampQuestionCount(Number.isFinite(digits) ? digits : fallback);
}

function clampQuestionCount(value: number): number {
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.min(Math.round(value), CHAT_MAX_QUESTION_COUNT);
}

/**
 * Merges retrieval across every lesson the teacher attached.
 *
 * Quotes stay tagged with their document so a merged answer can still be checked
 * against the right lesson, and the numbering the prompt uses matches the
 * `[n]` markers the UI shows. When nothing matches — a broad request like
 * "tóm tắt cả hai giáo án" — the opening of each lesson is sent instead and the
 * turn is marked `fallback` so the UI can say so.
 */
export function buildChatEvidence(input: ChatEvidenceInput): ChatEvidence {
  const quotesPerDocument = Math.max(1, Number(input.quotesPerDocument) || CHAT_QUOTES_PER_DOCUMENT);
  const maxChars = Math.max(200, Number(input.maxChars) || CHAT_EVIDENCE_MAX_CHARS);
  const documents = Array.isArray(input.documents) ? input.documents.filter(document => document && document.id) : [];

  const citations: LessonChatCitation[] = [];
  let characters = 0;
  for (const document of documents) {
    const text = String(document.text ?? '').trim();
    if (!text) continue;
    const quotes = selectRelevantEvidence(text, input.question, quotesPerDocument) as string[];
    for (const quote of quotes) {
      const remaining = maxChars - characters;
      if (remaining <= 0) break;
      const kept = quote.slice(0, Math.min(quote.length, remaining));
      if (!kept.trim()) continue;
      characters += kept.length;
      citations.push({ documentId: document.id, documentName: document.name || document.id, quote: kept });
    }
  }

  const namesWithoutEvidence = new Set(
    citations.length
      ? documents
        .filter(document => !citations.some(citation => citation.documentId === document.id))
        .map(document => document.name || document.id)
      : documents.map(document => document.name || document.id)
  );
  // "fallback" means *nothing matched, so the opening slice was sent*. With zero
  // attached lessons nothing was sent at all, and calling that a fallback would
  // tell the teacher their lesson was skimped when they attached none (#183).
  const fallback = citations.length === 0 && documents.length > 0;
  if (fallback) {
    for (const document of documents) {
      const text = String(document.text ?? '').trim();
      if (!text || characters >= maxChars) continue;
      const kept = text.slice(0, Math.min(CHAT_FALLBACK_CHARS_PER_DOCUMENT, maxChars - characters));
      characters += kept.length;
      citations.push({ documentId: document.id, documentName: document.name || document.id, quote: kept });
    }
    namesWithoutEvidence.clear();
  }

  return {
    citations,
    text: citations.map((citation, index) => `[${index + 1}] (${citation.documentName}) ${citation.quote}`).join('\n\n'),
    characters,
    fallback,
    namesWithoutEvidence: Array.from(namesWithoutEvidence)
  };
}

/**
 * Replays the conversation, oldest first, skipping the turns that were only a
 * failure notice: feeding the model its own error text teaches it to answer like
 * an error.
 */
export function buildChatHistoryMessages(messages: LessonChatMessage[]): ChatMessage[] {
  const usable = (Array.isArray(messages) ? messages : [])
    .filter(message => message && message.text && !message.errorCode)
    .slice(-CHAT_HISTORY_MAX_MESSAGES);
  return usable.map(message => ({
    role: message.role === 'user' ? ('user' as const) : ('assistant' as const),
    content: message.text.slice(0, CHAT_HISTORY_MAX_CHARS_PER_MESSAGE)
  }));
}

export function buildChatAnswerPrompt(input: { question: string; evidence: ChatEvidence; grounded?: boolean }): string {
  if (input.grounded === false) {
    return `Câu hỏi của giáo viên: ${input.question}

Không có giáo án nào được gắn kèm lượt này, nên đây là gợi ý từ kiến thức sư phạm chung.

Trả về JSON: {"answer":"..."} và nhắc rõ trong "answer" rằng gợi ý này không trích từ giáo án của giáo viên.`;
  }
  return `Câu hỏi của giáo viên: ${input.question}

Đoạn trích dẫn từ giáo án:
${input.evidence.text || '(không có đoạn nào)'}

Trả về JSON: {"answer":"..."}. Nếu đoạn trích không đủ để trả lời, hãy nói rõ điều đó trong "answer".`;
}

export function buildQuestionSetPrompt(input: {
  question: string;
  evidence: ChatEvidence;
  count: number;
  grounded?: boolean;
}): string {
  const types = '"multiple-choice" | "true-false" | "fill-in-blank" | "short-answer"';
  const format = `Định dạng trả về (DUY NHẤT một đối tượng JSON, không markdown):
{
  "gameType": "arena",
  "questions": [
    {
      "type": "multiple-choice",
      "prompt": "Câu hỏi",
      "options": [{ "text": "Phương án A" }, { "text": "Phương án B" }],
      "correctOptionId": "a",
      "explanation": "Giải thích 1 câu.",
      "difficulty": "trung bình",
      "points": 100
    }
  ]
}
Quy tắc:
- "type" phải là một trong: ${types}.
- Với "multiple-choice": 2 đến 6 phương án, id là "a", "b", "c"… theo thứ tự; "correctOptionId" là id của phương án đúng.
- Với "true-false": đúng hai phương án "Đúng" và "Sai".
- Với "fill-in-blank" hoặc "short-answer": bỏ "options"/"correctOptionId", thay bằng "correctAnswer" (kèm "alternateAnswers" nếu có cách trả lời khác).
- "difficulty": "dễ" | "trung bình" | "khó". "points": số điểm, ví dụ 100.`;
  if (input.grounded === false) {
    return `Yêu cầu của giáo viên: ${input.question}

Hãy soạn đúng ${input.count} câu hỏi tiếng Việt cho yêu cầu trên. Không có đoạn trích giáo án nào kèm theo, nên hãy bám sát đúng chủ đề và bậc học giáo viên nêu.

${format}
- Không được để trống "explanation". Đừng dẫn chiếu tới một giáo án cụ thể nào.`;
  }
  return `Yêu cầu của giáo viên: ${input.question}

Hãy soạn đúng ${input.count} câu hỏi từ giáo án, tiếng Việt, bám sát đoạn trích dẫn bên dưới.

Đoạn trích dẫn từ giáo án:
${input.evidence.text || '(không có đoạn nào)'}

${format}
- Không được để trống "explanation" và không bịa nội dung ngoài giáo án.`;
}

/**
 * Runs one chat turn end to end: retrieve → (answer | question set) → validate.
 *
 * A provider failure is *not* thrown to the caller (except a cancel, which main
 * must record as cancelled): the turn is returned with `errorCode` and an honest
 * fallback answer so it can be stored as part of the conversation, exactly like
 * the wizard keeps a failed generation visible in the project.
 */
export async function runLessonChatTurn(input: LessonChatTurnInput): Promise<LessonChatTurnResult> {
  const documents = Array.isArray(input.documents) ? input.documents : [];
  const evidence = buildChatEvidence({ documents, question: input.question });
  const intent = classifyLessonChatIntent(input.question, input.mode || 'auto');
  const count = clampQuestionCount(Number(input.questionCount) || requestedQuestionCount(input.question));
  const history = buildChatHistoryMessages(input.history);
  // `documents.length`, not `citations.length`: a lesson that exists but matched no
  // quote still took part in the turn (the fallback slice is sent), whereas zero
  // attached lessons is the state the prompt has to describe honestly.
  const grounded = documents.length > 0;
  const base: Omit<LessonChatTurnResult, 'answer' | 'intent' | 'questionSet' | 'errorCode'> = {
    citations: evidence.citations,
    providerId: (input.client as { providerId?: string }).providerId || '',
    evidenceCharacters: evidence.characters,
    evidenceFallback: evidence.fallback,
    grounded,
    namesWithoutEvidence: evidence.namesWithoutEvidence,
    requestedCount: intent === 'question_set' ? count : 0
  };
  const messages: ChatMessage[] = intent === 'question_set'
    ? [
      { role: 'system', content: grounded ? QUESTION_SET_SYSTEM_PROMPT : UNGROUNDED_QUESTION_SET_SYSTEM_PROMPT },
      ...history,
      { role: 'user', content: buildQuestionSetPrompt({ question: input.question, evidence, count, grounded }) }
    ]
    : [
      { role: 'system', content: grounded ? CHAT_ANSWER_SYSTEM_PROMPT : UNGROUNDED_ANSWER_SYSTEM_PROMPT },
      ...history,
      { role: 'user', content: buildChatAnswerPrompt({ question: input.question, evidence, grounded }) }
    ];

  try {
    if (intent === 'question_set') {
      input.onStage?.('generate');
      const draft = await runStructuredStep<ArenaDraft>({
        client: input.client,
        registry: input.registry,
        requestId: input.requestId,
        maxTokens: 2048,
        responseSchema: lessonQuestionSetSchemaRef(),
        messages,
        validate: value => {
          input.onStage?.('validate');
          return normalizeDraft('arena', value) as ArenaDraft;
        },
        repairMessages: info => buildDraftRepairMessages({
          gameType: 'arena',
          messages: info.messages,
          rawContent: info.rawContent,
          errorMessage: info.errorMessage
        }),
        incompleteReason: draft => {
          const found = itemCount(draft);
          return found < count ? `Mới có ${found}/${count} câu hỏi` : null;
        },
        completenessScore: draft => itemCount(draft),
        incompleteMessages: info => buildDraftShortfallMessages({
          gameType: 'arena',
          messages: info.messages,
          previous: info.validated,
          found: itemCount(info.validated),
          requested: count,
          unit: 'câu hỏi'
        })
      });
      return {
        ...base,
        intent,
        answer: questionSetReply(draft, count, grounded),
        questionSet: draft,
        errorCode: ''
      };
    }

    input.onStage?.('generate');
    const answer = await runStructuredStep<string>({
      client: input.client,
      registry: input.registry,
      requestId: input.requestId,
      maxTokens: 512,
      responseSchema: lessonChatAnswerJsonSchema,
      messages,
      validate: value => {
        const record = value && typeof value === 'object' && !Array.isArray(value)
          ? (value as Record<string, unknown>)
          : null;
        const text = typeof record?.answer === 'string' ? record.answer.trim() : '';
        if (!text) throw new Error('Thiếu trường "answer" trong JSON trả về.');
        return text;
      },
      repairMessages: info => buildRepairMessages({
        messages: info.messages,
        rawContent: info.rawContent,
        errorMessage: info.errorMessage
      })
    });
    return { ...base, intent, answer, questionSet: null, errorCode: '' };
  } catch (error) {
    if (isCancelReason(error)) throw error;
    const code = /\[([A-Z_]+)\]/.exec(String((error as Error)?.message || ''))?.[1] || 'AI_OUTPUT_INVALID';
    return {
      ...base,
      intent,
      answer: fallbackAnswer(code, intent, evidence, grounded),
      questionSet: null,
      errorCode: code
    };
  }
}

function questionSetReply(draft: ArenaDraft, requested: number, grounded = true): string {
  const found = (draft.questions || []).length;
  const list = (draft.questions || [])
    .map((question, index) => `${index + 1}. ${question.prompt}`)
    .join('\n');
  const note = grounded
    ? ''
    : '\n\nBộ câu hỏi này soạn khi không có giáo án kèm theo, nên hãy đối chiếu với bài trước khi cho học sinh chơi.';
  return `Bộ câu hỏi đã sẵn sàng (${found}/${requested} câu). Xem danh sách dưới đây rồi bấm “Tạo trò chơi” nếu muốn đưa vào trò chơi.${note}\n\n${list}`;
}

/**
 * What the teacher reads when the model did not answer. Never a shrug: the code
 * says which part of the chain failed, and the quotes are still shown — a chat
 * that quietly returns "AI không trả lời được" while hiding the evidence is worse
 * than no chat at all.
 */
function fallbackAnswer(code: string, intent: LessonChatIntent, evidence: ChatEvidence, grounded = true): string {
  const reason = code === 'AI_NOT_RUNNING'
    ? 'AI local chưa chạy. Mở Cài đặt AI · AI local, chọn model đã tải rồi nhấn “Bắt đầu chạy”, hoặc chọn AI đám mây.'
    : code === 'AI_CONFIG'
      ? 'Nhà cung cấp AI chưa được cấu hình đủ (thiếu base URL, tên model hoặc API key).'
      : code === 'AI_TIMEOUT'
        ? 'Nhà cung cấp AI phản hồi quá lâu nên lượt này bị dừng.'
        : code === 'AI_OUTPUT_INVALID'
          ? 'AI trả về nội dung chưa đúng định dạng câu hỏi. Hãy hỏi lại hoặc chọn chế độ khác.'
          : 'Nhà cung cấp AI trả về lỗi nên lượt này chưa có câu trả lời.';
  const quotes = evidence.citations.length
    ? `\n\nĐoạn liên quan trong giáo án vẫn được trích ra ở dưới (${evidence.citations.length} đoạn).`
    : grounded
      ? '\n\nKhông tìm thấy đoạn nào liên quan trong các giáo án đã chọn.'
      : '\n\nLượt này không gắn giáo án nào, nên lẽ ra chỉ cần nhà cung cấp trả lời là có kết quả.';
  return `${reason}${intent === 'question_set' ? ' Vì vậy chưa tạo được bộ câu hỏi.' : ''}${quotes}`;
}
