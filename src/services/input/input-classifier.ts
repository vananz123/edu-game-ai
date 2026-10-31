/**
 * Which kind of material did the teacher paste?
 *
 * docs/archive/specs/update_quy_trinh.txt §2 and §5 are explicit: the app may ask
 * the teacher to pick the input type, may auto-detect it to *help*, but must
 * **never call the language model just to classify a data structure**. So this file
 * is pure text analysis: no clock, no disk, no network, no model. It is unit-tested
 * directly, and the wizard always shows its verdict so the teacher can overrule it.
 *
 * The two answers that change the workflow:
 *   - `questions`: the teacher already wrote the questions, so the lesson-analysis
 *     pipeline (and its model call) is skipped entirely (§3 nhánh B).
 *   - `lesson`: everything else, i.e. today's behaviour (§3 nhánh A).
 *
 * `ambiguous` exists so a wrong guess never costs a model run: it falls back to the
 * lesson pipeline, which is what the app did before this feature.
 */

import { cleanQuestionText, looksLikeQuestionBankText } from './question-text';

export type InputKind = 'lesson' | 'questions' | 'outline';

/** What the classifier concluded, plus enough detail for the UI to explain itself. */
export interface InputClassification {
  /** The verdict. `ambiguous` output resolves to `lesson` (see `resolveInputKind`). */
  kind: InputKind | 'ambiguous';
  /** 0..1 — how strongly the *rules* matched. Not a model probability. */
  confidence: number;
  /** Human-readable reasons, shown under the verdict. Vietnamese, teacher-facing. */
  reasons: string[];
  /** Question-looking lines / non-empty lines, for the UI and for tests. */
  questionLineRatio: number;
  /** Number of complete questions (prompt + at least one answer marker). */
  questionCount: number;
  /** Lesson-section markers found ("Mục tiêu", "Hoạt động", roman numerals…). */
  lessonMarkerCount: number;
}

/** Below this share of question-looking lines, never call it a question list. */
const QUESTIONS_MIN_RATIO = 0.8;
/** Above this share, the text is mostly questions even with a heading or two. */
const QUESTIONS_MAX_LESSON_RATIO = 0.4;
/** A single "Câu 1: … ?" is not a quiz; require at least this many complete ones. */
const MIN_QUESTIONS = 2;

/**
 * Shared line patterns for question banks.
 *
 * `question-import.ts` derives its block parser from these, because a text the
 * classifier calls "questions" must also parse into questions. They used to be
 * copied, and the copies drifted: `Đáp án - B` and `Câu hỏi 1:` were counted as
 * questions but produced zero parsed questions. Exported so there is one source.
 */
export const QUESTION_START = /^(?:#{1,6}\s*)?(?:\*\*)?\s*(?:câu|question|q)\s*\d+\s*[:.)\-]|^\s*\d{1,3}\s*[.)]\s+\S|^\s*[-*+]\s+\S/iu;

/**
 * Option block lines such as `A. …` / `A) …` / `- A. …`.
 *
 * Widened to A–H (DECISIONS #115): teacher banks do use five or more options, and
 * stopping at D meant the extra options silently became part of the previous
 * option's text. The optional digit captures the `A1. …` / `A2. …` sub-option form,
 * which is kept as its own label so `A1` and `A` never collide.
 */
export const OPTION_LINE = /^\s*(?:[-*+]\s*)?(?:\*\*)?([a-h])(\d{1,2})?\s*[.)]\s+(\S.*)$/iu;

/**
 * A bare `1. …` / `2) …` line. Only an option when the same question already holds
 * at least two letter-labelled options (`OPTION_NUMBER_MIN_LETTERS`); otherwise it is
 * the start of the next question, which is why the parser checks the block first.
 */
export const OPTION_NUMBER_LINE = /^\s*(\d{1,2})\s*[.)]\s+(\S.*)$/u;

/** Letter options needed before a numbered line counts as another option. */
export const OPTION_NUMBER_MIN_LETTERS = 2;

/**
 * A pair-list item: `A. Nội dung – 1. Nội dung` or `1. Nội dung - a) Nội dung`.
 * Matching columns are written either way round, so both are accepted and the
 * separator must be a dash/arrow rather than any punctuation.
 */
export const PAIR_LINE = /^\s*(?:(\d{1,2})\s*[.)]|([a-h])\s*[.)])?\s*(\S.*?)\s*(?:[-–—→>]+|->)\s*(?:(\d{1,2})\s*[.)]|([a-h])\s*[.)])\s*(\S.*)$/iu;

/** `Cột A` / `Cột B` / `A` / `B` headings of a two-column matching table. */
export const MATCHING_COLUMN_HEADING = /^\s*(?:cột\s*)?(?:a|b|1|2|trái|phải)\s*[:：]?\s*$/iu;

/** `Đúng` / `Sai` used as an option label (or standalone answer value). */
export const TRUE_FALSE_VALUE = /^(?:đúng|sai|đ|s|true|false|t|f|yes|no)$/iu;

/**
 * An explicit answer marker on its own line or after the options.
 *
 * Accepts the short `ĐA:`, the HTML-escaped `Đ&aacute;p &aacute;n:`, and a marker that
 * starts a line after `**bold**` decoration. The parser sees a line at a time, so it
 * trims the line and re-tests instead of relying on the `(?:^|\n)` prefix; those tests
 * used to need a `\n`, which a single-line caller can never produce.
 */
const ANSWER_MARKER =
  '(?:\\*\\*)?\\s*(?:đ(?:áp|\\s*&aacute;p|&aacute;p)\\s*(?:án|&aacute;n)|dap\\s*an|answer|key|đ\\s*\\/\\s*á|đa|da)' +
  '\\s*(?:đúng|dung|correct)?\\s*(?:\\*\\*)?\\s*';
const ANSWER_SEPARATOR = '[:：\\-=]';

export const ANSWER_LINE = new RegExp(`^${ANSWER_MARKER}${ANSWER_SEPARATOR}(?:\\s|$)`, 'iu');

/** The answer marker with its value captured, for readers that need the value. */
export const ANSWER_VALUE_LINE = new RegExp(`^${ANSWER_MARKER}(?:${ANSWER_SEPARATOR})\\s*(.*)$`, 'iu');

/** `Đáp án A, C` / `A và C` / `A;C` — more than one labelled option. */
export const MULTI_ANSWER_VALUE =
  /\b(?:và|and|hoặc|or|&)\s*[a-h](?:\s*\d{1,2})?\b|\b[a-h]\s*\d{0,2}\s*[,;/+]\s*[a-h]\s*\d{0,2}(?!\w)/iu;

/** The explanation marker with its value captured. */
export const EXPLANATION_VALUE_LINE = /^\s*(?:\*\*)?\s*(?:giải\s*thích|giai\s*thich|explanation|lời\s*giải|loi\s*giai)\s*[:：\-=]\s*(.*)$/iu;

/** True/false style answer, common in teacher question banks. */
export const TRUE_FALSE_ANSWER = /(?:^|\n)\s*(?:\*\*)?\s*(?:đáp\s*án\s*)?[:：\-]?\s*(?:đúng|sai|true|false)\s*(?:\*\*)?\s*(?:\n|$)/iu;

/**
 * A question line that also accepts `Câu hỏi 1:` / `Câu số 1:` — the classifier
 * and the parser previously disagreed here.
 */
export const QUESTION_BLOCK_START = /^\s*(?:#{1,6}\s*)?(?:\*\*)?\s*(?:câu(?:\s*hỏi|\s*so|số)?|question|q)\s*\d+\s*[:.)\-]|^\s*\d{1,3}\s*[.)]\s+\S/iu;

/**
 * Lesson-document section markers. Kept narrow on purpose: a teacher's question
 * bank can contain the word "kiến thức" inside a prompt, so only *line-start*
 * headings count, and they must look like a heading rather than prose.
 */
const LESSON_HEADING =
  /^\s*(?:#{1,6}\s*)?(?:\*\*)?\s*(?:i{1,3}|iv|v|vi{0,3})\s*[.)]\s+\S|^\s*(?:mục\s*tiêu|muc\s*tieu|kiến\s*thức\s*trọng\s*tâm|kien\s*thuc\s*trong\s*tam|nội\s*dung\s*bài|noi\s*dung\s*bai|hoạt\s*động|hoat\s*dong|các\s*bước|phương\s*pháp|thiết\s*bị|chuẩn\s*bị|tiến\s*trình\s*dạy|đánh\s*gia|ghi\s*chú|củng\s*cố|dặn\s*dò|bài\s*giảng)\b/iu;

/**
 * Prose detection: a paragraph of at least 40 characters that ends with sentence
 * punctuation. Three of these in a row is a lesson body, not a question list.
 */
const PROSE_MIN_LENGTH = 40;

function nonEmptyLines(text: string): string[] {
  return text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
}

/** Lines as this classifier reads them: cleaned when the text is a question bank (#116). */
function classifiedLines(text: string): string[] {
  return nonEmptyLines(looksLikeQuestionBankText(text) ? cleanQuestionText(text) : text);
}

function looksLikeQuestion(line: string): boolean {
  return QUESTION_BLOCK_START.test(line) || QUESTION_START.test(line) || /\?\s*(?:\*\*)?\s*$/.test(line);
}

function looksLikeOption(line: string): boolean {
  return OPTION_LINE.test(line);
}

/**
 * One pass over the lines. `questionCount` counts complete questions, and
 * `questionBlockLines` counts every line that belongs to some question block
 * (prompt + options + answer/explanation). A question bank is mostly block lines;
 * a lesson is mostly prose lines.
 *
 * A block ends at the next question line or after `MAX_BLOCK_LINES` continuation
 * lines, so a lesson whose last section happens to use "A." list markers cannot
 * swallow the whole document into one block.
 */
const MAX_BLOCK_LINES = 12;

function scanBlocks(lines: string[]): { questionCount: number; questionBlockLines: number } {
  let questionCount = 0;
  let questionBlockLines = 0;
  let inBlock = false;
  let satisfied = false;
  let blockLines = 0;

  const close = () => {
    if (inBlock && satisfied) questionCount += 1;
    inBlock = false;
    satisfied = false;
    blockLines = 0;
  };

  for (const line of lines) {
    if (looksLikeQuestion(line)) {
      close();
      inBlock = true;
      blockLines = 1;
      questionBlockLines += 1;
      continue;
    }
    if (!inBlock) continue;
    const strong = looksLikeOption(line) || ANSWER_LINE.test(line) || TRUE_FALSE_ANSWER.test(line);
    // A continuation line only belongs while the block is still short; a long prose
    // line is a different paragraph, so it closes the block and counts as lesson text.
    const continuation = line.length <= 200 && blockLines < MAX_BLOCK_LINES;
    if (!strong && !continuation) {
      close();
      continue;
    }
    blockLines += 1;
    questionBlockLines += 1;
    if (strong) satisfied = true;
  }
  close();
  return { questionCount, questionBlockLines };
}

/**
 * Marks the line indexes that belong to a question block (the prompt plus its option,
 * answer and explanation lines), so prose counting can ignore them (#116).
 */
function markBlockLines(lines: string[], into: Set<number>): void {
  let inBlock = false;
  lines.forEach((line, index) => {
    if (looksLikeQuestion(line)) {
      inBlock = true;
      into.add(index);
      return;
    }
    if (!inBlock) return;
    const strong = looksLikeOption(line) || ANSWER_LINE.test(line) || TRUE_FALSE_ANSWER.test(line)
      || EXPLANATION_VALUE_LINE.test(line);
    if (strong) {
      into.add(index);
      return;
    }
    // A non-marker continuation is part of the block only while it is short; a long
    // paragraph after a question is separate text and stays prose.
    if (line.length > 200) inBlock = false;
  });
}

function countLessonMarkers(lines: string[]): number {
  return lines.filter(line => LESSON_HEADING.test(line)).length;
}

function countProseBlocks(lines: string[]): number {
  return lines.filter(line => line.length >= PROSE_MIN_LENGTH && /[.!?…]\s*$/.test(line) && !looksLikeQuestion(line)).length;
}

/**
 * update_quy_trinh_2 §2: "lesson outline or incomplete question framework".
 *
 * An outline has the *shape* of a lesson (section headings: "I. Mục tiêu",
 * "Hoạt động 1"…) but almost none of its substance: no long prose paragraphs and no
 * real questions. Recognising it separately means the wizard can tell the teacher
 * "this is an outline, you can use it or ask AI to develop it" instead of silently
 * treating a bare skeleton as a complete lesson.
 *
 * Thresholds are named constants so the tests can pin each boundary.
 */
const OUTLINE_MIN_MARKERS = 2;
/** Prose blocks allowed while still calling it an outline. */
const OUTLINE_MAX_PROSE_BLOCKS = 1;
/** Characters per line below which the text reads as short list items. */
const OUTLINE_MAX_CHARS_PER_LINE = 90;

function looksLikeOutline(
  lessonMarkerCount: number,
  proseBlocks: number,
  questionCount: number,
  lines: string[]
): boolean {
  if (lessonMarkerCount < OUTLINE_MIN_MARKERS) return false;
  if (proseBlocks > OUTLINE_MAX_PROSE_BLOCKS) return false;
  if (questionCount >= MIN_QUESTIONS) return false;
  const characters = lines.reduce((sum, line) => sum + line.length, 0);
  const charsPerLine = characters / Math.max(1, lines.length);
  return charsPerLine <= OUTLINE_MAX_CHARS_PER_LINE;
}

/**
 * Classify pasted material. Pure and synchronous; safe to call on every debounced
 * keystroke (same budget as the offline structure reader, `lesson:get-structure`).
 */
export function classifyInput(text: string): InputClassification {
  const raw = typeof text === 'string' ? text : '';
  // #116: a bank pasted from a slide carries decorative symbols in front of the labels
  // (`👉 Đáp án đúng: B`). Cleaning happens here, on the same rules the parser uses, so
  // an answer line the teacher can read is also one the classifier counts. Prose is
  // left exactly as written.
  const lines = classifiedLines(raw);
  const reasons: string[] = [];

  if (!lines.length) {
    return {
      kind: 'ambiguous',
      confidence: 0,
      reasons: ['Chưa có nội dung.'],
      questionLineRatio: 0,
      questionCount: 0,
      lessonMarkerCount: 0
    };
  }

  const questionLines = lines.filter(looksLikeQuestion).length;
  const optionLines = lines.filter(looksLikeOption).length;
  // Ratio of *question-block* lines, not just prompt lines: a bank is ~1 prompt line
  // per 5 block lines, so counting prompts alone would call every bank "mostly prose".
  const { questionCount, questionBlockLines } = scanBlocks(lines);
  const questionLineRatio = questionBlockLines / lines.length;
  const lessonMarkerCount = countLessonMarkers(lines);
  // #116: only lines outside a question block count as prose. A block's own lines are
  // long by nature ("Việc sử dụng các lập luận sai lầm…" reads as a paragraph), and
  // counting them made a one-question bank look like a lesson.
  const blockLines = new Set<number>();
  markBlockLines(lines, blockLines);
  const proseBlocks = countProseBlocks(lines.filter((_line, index) => !blockLines.has(index)));
  // Tested per line: `ANSWER_LINE` is anchored, so joining lines would only ever match
  // the first one (and the joined string has no trailing newline to satisfy `$`).
  const hasAnswerMarker = lines.some(line => ANSWER_LINE.test(line)) || TRUE_FALSE_ANSWER.test(lines.join('\n'));

  if (questionLines) reasons.push(`${questionCount || questionLines} câu hỏi nhận ra`);
  if (optionLines) reasons.push(`${optionLines} dòng phương án A–D`);
  if (hasAnswerMarker) reasons.push('có dòng đáp án');
  if (lessonMarkerCount) reasons.push(`${lessonMarkerCount} tiêu đề mục của giáo án`);
  if (proseBlocks >= 2) reasons.push('có đoạn văn dài liền mạch');

  // Nhánh B: the text is a question bank. Require both enough questions *and* a
  // high share of question lines, so a lesson that happens to end with two
  // questions stays on the lesson path.
  const mostlyQuestions = questionLineRatio >= QUESTIONS_MIN_RATIO;
  const lessonDominated = lessonMarkerCount >= 2 || proseBlocks >= 3;
  if (questionCount >= MIN_QUESTIONS && mostlyQuestions && questionLineRatio > QUESTIONS_MAX_LESSON_RATIO) {
    const confidence = Math.min(0.99, 0.6 + questionLineRatio * 0.25 + (hasAnswerMarker ? 0.1 : 0) + (lessonDominated ? -0.25 : 0));
    if (confidence >= 0.6) {
      reasons.unshift('Đầu vào giống danh sách câu hỏi soạn sẵn.');
      return { kind: 'questions', confidence, reasons, questionLineRatio, questionCount, lessonMarkerCount };
    }
  }

  // #116: one question is a bank too. A teacher who pastes a single question expects
  // the question path, not an AI analysis of it; the budget below would send a short,
  // complete question block to the lesson branch. Complete means an answer line plus
  // at least two options, so a lesson that merely quotes one question stays a lesson.
  const blockOnly = hasAnswerMarker && optionLines >= 2 && !lessonMarkerCount && proseBlocks === 0;
  if (questionCount >= 1 && blockOnly && mostlyQuestions) {
    reasons.unshift('Đầu vào là một câu hỏi soạn sẵn.');
    return { kind: 'questions', confidence: 0.62, reasons, questionLineRatio, questionCount, lessonMarkerCount };
  }

  // Nhánh A: a lesson/document. This is also the safe default when the rules
  // disagree, because it is the behaviour the app had before routing existed.
  if (lessonMarkerCount >= 1 || proseBlocks >= 2 || lines.length >= 8) {
    // update_quy_trinh_2 §2: an *outline* looks like a lesson (it has section
    // headings) but carries little prose — the teacher listed the sections without
    // writing them out. Recognise it before calling the text a full lesson.
    if (looksLikeOutline(lessonMarkerCount, proseBlocks, questionCount, lines)) {
      reasons.unshift('Đầu vào giống dàn ý: có tiêu đề mục nhưng ít nội dung chi tiết.');
      return {
        kind: 'outline',
        confidence: Math.min(0.85, 0.55 + Math.min(lessonMarkerCount, 4) * 0.06),
        reasons,
        questionLineRatio,
        questionCount,
        lessonMarkerCount
      };
    }
    reasons.unshift('Đầu vào giống giáo án hoặc tài liệu bài học.');
    const confidence = Math.min(0.95, 0.5 + Math.min(lessonMarkerCount, 4) * 0.08 + Math.min(proseBlocks, 4) * 0.06);
    return { kind: 'lesson', confidence, reasons, questionLineRatio, questionCount, lessonMarkerCount };
  }

  reasons.unshift('Chưa chắc chắn — sẽ xử lý như giáo án (cách cũ).');
  return {
    kind: 'ambiguous',
    confidence: Math.min(0.55, 0.3 + lines.length * 0.02),
    reasons,
    questionLineRatio,
    questionCount,
    lessonMarkerCount
  };
}

/**
 * The workflow only has two paths, so an unsure verdict must resolve to the old
 * one (`lesson`). Keeping the resolution in one place means the UI and the
 * step logic can never disagree about what `ambiguous` means.
 */
export function resolveInputKind(classification: InputClassification | null | undefined): InputKind {
  return classification && classification.kind === 'questions' ? 'questions' : 'lesson';
}

/** Teacher-facing label for the step-1 badge. */
export function inputKindLabel(kind: InputClassification['kind']): string {
  if (kind === 'questions') return 'Danh sách câu hỏi';
  if (kind === 'outline') return 'Dàn ý / khung sườn';
  if (kind === 'lesson') return 'Giáo án / tài liệu';
  return 'Chưa xác định';
}
