import JSZip from 'jszip';
import type { GameQuestion, QuestionDifficulty } from '../shared/types';
import {
  ANSWER_VALUE_LINE,
  EXPLANATION_VALUE_LINE,
  MULTI_ANSWER_VALUE,
  OPTION_LINE as SHARED_OPTION_LINE,
  OPTION_NUMBER_LINE,
  OPTION_NUMBER_MIN_LETTERS,
  PAIR_LINE,
  QUESTION_BLOCK_START,
  TRUE_FALSE_VALUE
} from './input-classifier';
import { cleanQuestionLine, cleanQuestionText, normalizePromptKey } from './question-text';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_SHEET_XML_BYTES = 5 * 1024 * 1024;
const MAX_QUESTIONS = 100;
const MAX_COLUMNS = 32;
/** A bank option count no game accepts (`answerOptionsSchema` is 2–6). */
const MAX_COMPATIBLE_OPTIONS = 6;
const DIFFICULTIES = new Set<QuestionDifficulty>(['dễ', 'trung bình', 'khó']);

/**
 * A row that could not become a question. `field` names what is missing so the
 * wizard can tell the teacher exactly what to fix (update_quy_trinh §4.3), instead
 * of failing the whole import or, worse, inventing an answer.
 */
export interface QuestionImportIssue {
  /** 1-based line number in the teacher's text (not the array index). */
  line: number;
  field: 'prompt' | 'options' | 'answer' | 'explanation' | 'points' | 'difficulty' | 'row';
  message: string;
  /** The text as the teacher wrote it, so the UI can show it in context. */
  excerpt: string;
}

/**
 * What the question *is*, from the teacher's own markers (DECISIONS #115).
 *
 * `multi-answer` and `multi-tf` exist to name a shape the games cannot play. They
 * are recognised so the teacher is told, never split or rewritten into something
 * that changes what the question asks.
 */
export type ParsedQuestionKind =
  | 'multiple-choice'
  | 'true-false'
  | 'fill-in-blank'
  | 'short-answer'
  | 'multi-answer'
  | 'multi-tf'
  | 'matching';

/** `ready` may be played as is; `needs-review` / `incompatible` may not. */
export type ParsedQuestionStatus = 'ready' | 'needs-review' | 'incompatible';

/**
 * One question as the teacher wrote it, with everything the wizard needs to be
 * honest about it. `question` is still the only shape that reaches the adapter.
 */
export interface ParsedQuestion {
  question: GameQuestion;
  kind: ParsedQuestionKind;
  status: ParsedQuestionStatus;
  /** Teacher-facing Vietnamese notes, shown verbatim in the wizard. */
  warnings: string[];
  /** 1-based line number of the question's first line. */
  sourceLine: number;
  /** `sourceLine` of the earlier question with the same prompt, if any. */
  duplicateOf?: number;
  /** Matching pairs when `kind` is `matching` (not expressible as `GameQuestion`). */
  pairs?: Array<{ left: string; right: string }>;
}

export interface QuestionImportResult {
  questions: GameQuestion[];
  /** Rows that were skipped and need the teacher's attention. */
  issues: QuestionImportIssue[];
  /** True when every row became a question. */
  complete: boolean;
  /**
   * True when the rows are otherwise fine but some lack a required field the app
   * refuses to invent (an explanation). The caller may still proceed only if the
   * teacher explicitly chooses to complete them in the editor.
   */
  needsTeacherInput: boolean;
  /**
   * Every block that held content, in source order, each with its own status.
   * A question missing an answer or an explanation is here with `needs-review`
   * instead of vanishing. Added in #115; `questions` keeps its old meaning.
   */
  parsed: ParsedQuestion[];
}

export async function importQuestionsFromFile(
  fileName: string,
  file: Buffer
): Promise<GameQuestion[]> {
  if (file.length > MAX_FILE_BYTES) throw new Error('Tệp câu hỏi vượt quá giới hạn 10 MB.');
  const extension = fileName.toLowerCase().split('.').pop();
  let rows: string[][];
  if (extension === 'csv' || extension === 'tsv') {
    rows = parseDelimitedText(file.toString('utf8'), extension === 'tsv' ? '\t' : undefined);
  } else if (extension === 'xlsx') {
    rows = await parseXlsx(file);
  } else {
    throw new Error('Chỉ hỗ trợ tệp .csv, .tsv hoặc .xlsx.');
  }
  return rowsToQuestions(rows);
}

/**
 * Questions typed or pasted as plain text — the "câu hỏi soạn sẵn" branch of
 * update_quy_trinh §3 nhánh B.
 *
 * File import needs a header row (`rowsToQuestions`); pasted text has no columns, so
 * the block parser below is a separate reader. It shares the *rules* with
 * `rowsToQuestions` (option letters A–D, answer by letter or by exact text, same
 * `GameQuestion` shape), and `tests/unit/question-import.test.ts` asserts a question
 * pasted by hand and the same question in a CSV produce the same object.
 *
 * Unlike the file importer this never throws for a fixable row: a bad row becomes a
 * `QuestionImportIssue` and the rest are still returned (§4.3: tell the teacher which
 * field is missing and let them fix it).
 *
 * Deliberately does NOT call any model: the teacher wrote these questions.
 */
export function parseQuestionsFromText(text: string): QuestionImportResult {
  const source = typeof text === 'string' ? text : '';
  // Clean first (#116), then split: a bank pasted from a slide carries `👉 Đáp án: B`
  // and often the options on the prompt's own line, and neither the block splitter
  // nor the line readers can see a label that is not at the start of its line.
  // Blank lines are kept because the blank-line fallback in `splitQuestionBlocks`
  // needs them; dropping them here would merge its groups.
  const lines = cleanQuestionText(source).replace(/^\uFEFF/, '').split(/\r?\n/);
  const blocks = splitQuestionBlocks(lines);
  const questions: GameQuestion[] = [];
  const issues: QuestionImportIssue[] = [];
  const parsedQuestions: ParsedQuestion[] = [];
  const seenPrompts = new Map<string, number>();

  blocks.forEach((block, blockIndex) => {
    const line = block.line;
    const excerpt = block.lines.join(' ').slice(0, 160);
    if (parsedQuestions.length >= MAX_QUESTIONS) {
      issues.push({ line, field: 'row', message: `Mỗi lần chỉ nhập tối đa ${MAX_QUESTIONS} câu hỏi.`, excerpt });
      return;
    }
    const parsed = readQuestionBlock(block, blockIndex);
    // A line that is neither a question, an option nor a marker (a heading, the
    // teacher's note) is not a question and used to be reported as one missing
    // options. Only a block that claims to be a question is reported.
    if (!parsed) return;
    const originalStatus = parsed.status;
    const promptKey = normalizePromptKey(parsed.question.prompt);
    const duplicateOf = promptKey ? seenPrompts.get(promptKey) : undefined;
    if (promptKey && duplicateOf === undefined) seenPrompts.set(promptKey, line);
    if (duplicateOf !== undefined) {
      parsed.duplicateOf = duplicateOf;
      parsed.warnings.push(`Câu này trùng nội dung với câu ở dòng ${duplicateOf}. Giữ cả hai để giáo viên tự quyết định.`);
    }
    parsedQuestions.push(parsed);
    for (const warning of parsed.warnings) {
      const field = warningField(warning);
      if (field) issues.push({ line, field, message: warning, excerpt });
    }
    if (parsed.status === 'incompatible' && !parsed.warnings.length) {
      issues.push({ line, field: 'options', message: 'Câu này không tương thích với thể loại trò chơi nào.', excerpt });
    }
    // Only a question the games can actually play joins `questions`: multi-answer,
    // multi-tf and 7+ option questions stay in `parsed` with `needs-review` /
    // `incompatible`, because handing them to the adapter would change their meaning.
    // The explanation warning is the one exception (DECISIONS #114): that question is
    // complete apart from the text the teacher must write, so it is kept for the
    // editor and gated by `needsTeacherInput` at save time.
    if (originalStatus === 'ready' || (explanationOnly(parsed) && parsed.question.options.length >= 2)) {
      questions.push(parsed.question);
    }
  });

  return {
    questions,
    issues,
    complete: issues.length === 0 && questions.length > 0,
    needsTeacherInput: issues.some(issue => issue.field === 'explanation'),
    parsed: parsedQuestions
  };
}

/**
 * True when the only thing missing is the explanation the teacher must write
 * (#114 kept these questions so they can be completed in the editor).
 */
function explanationOnly(parsed: ParsedQuestion): boolean {
  if (parsed.status !== 'needs-review' || !parsed.warnings.length) return false;
  return parsed.warnings.every(warning => /Giải thích/u.test(warning)) && Boolean(parsed.question.correctOptionId || parsed.question.correctAnswer);
}

/** `needs-review` questions still add a `QuestionImportIssue` under the field the warning names. */
function warningField(message: string): QuestionImportIssue['field'] | null {
  if (/Giải thích/u.test(message)) return 'explanation';
  if (/[Đđ]áp án/u.test(message)) return 'answer';
  if (/phương án/u.test(message)) return 'options';
  if (/nội dung/u.test(message)) return 'prompt';
  return null;
}

/** One teacher-written question: its first line plus the lines that follow it. */
interface QuestionBlock {
  /** 1-based line number of the question's first line. */
  line: number;
  lines: string[];
}

/** `Câu 1: …` / `1. …` / `Q1) …` — the same shapes the classifier counts. */
// Shared with the classifier on purpose: a text it calls "questions" must also
// parse into questions. Copies of these patterns drifted once already (`Đáp án -`,
// `Câu hỏi 1:`), which sent teachers to an import that found nothing.
const BLOCK_START = QUESTION_BLOCK_START;
const OPTION_LINE = SHARED_OPTION_LINE;
const ANSWER_LINE = ANSWER_VALUE_LINE;
const EXPLANATION_LINE = EXPLANATION_VALUE_LINE;
/** `Điền` / `Điền vào chỗ trống` as a lead-in or an instruction. */
const FILL_IN_MARKER = /^\s*(?:điền|điền\s+vào|điền\s+khuyết)/iu;
/** An instruction line that asks for a written answer rather than a choice. */
const SHORT_ANSWER_MARKER = /^\s*(?:trả\s*lời|nêu|trình\s*bày|vì\s*sao|hãy\s+(?:nêu|cho\s*biết|trình\s*bày|viết|kể))\b/iu;
/** A blank inside a prompt: `___`, `……`, `...` (three or more). */
const BLANK_MARKER = /_{2,}|…{2,}|\.{3,}/u;
/** `(Đ)`, `(S)`, `D/S:`, `Đ/S:` — the true/false shorthand. */
const TRUE_FALSE_SHORTHAND = /\(\s*[đds]\s*\)|[đd]\s*\/\s*s(?![\p{L}])/iu;
/** A trailing `Đ` / `S` / `(Đ)` marker of one statement in a multi-tf list. */
const STATEMENT_TF_SUFFIX = /[\s.).]\s*(?:[-–—:]\s*)?\(?\s*[đds]\s*\)?\s*$/iu;

/**
 * Split pasted text into question blocks, keeping original line numbers.
 *
 * Primary rule: a block starts at `QUESTION_BLOCK_START`, the same pattern the
 * classifier counts with. Fallback (plan §2.1e): when *no* line is numbered but at
 * least two blank-line-separated groups each hold an option, those groups are the
 * questions — that is how a teacher pastes a bank copied out of a slide deck.
 */
function splitQuestionBlocks(rawLines: string[]): QuestionBlock[] {
  // One-line questions (`Câu 1: … A. … B. … 👉 Đáp án: B`) become real lines before
  // anything else looks at them: every reader below works a line at a time.
  const expanded = rawLines.flatMap((line, index) => splitInlineQuestion(line, index + 1));
  // `line` here is the teacher's own line (cleaning happens in `parseQuestionsFromText`),
  // so every cut offset below refers to the text the offset was measured on.
  const lines = expanded.map(entry => entry.line);
  // Generated lines still point at the line the teacher wrote.
  const sourceLineOf = new Map<number, number>();
  expanded.forEach((entry, index) => sourceLineOf.set(index, entry.sourceLine));
  const numbered: QuestionBlock[] = [];
  let current: QuestionBlock | null = null;
  let sawBlockStart = false;
  // A question holding >= 2 letter options may continue with `1. …` / `2. …` option
  // labels. Those lines also match the numbered-question start, so a number inside
  // such a question is not treated as the next question.
  let letterOptions = 0;
  let answerSeen = false;
  lines.forEach((line, index) => {
    // A number only continues the option list while the options are being written:
    // at or after `Đáp án:` the question is over, so `2. Câu kế tiếp` always starts a
    // new question there (otherwise the next question's options became this one's).
    if (letterOptions >= OPTION_NUMBER_MIN_LETTERS && !answerSeen && OPTION_NUMBER_LINE.test(line)) {
      if (current) current.lines.push(line);
      return;
    }
    const sourceLine = sourceLineOf.get(index) || index + 1;
    if (BLOCK_START.test(line)) {
      sawBlockStart = true;
      current = { line: sourceLine, lines: [stripQuestionNumber(line)] };
      numbered.push(current);
      letterOptions = 0;
      answerSeen = false;
      return;
    }
    if (ANSWER_LINE.test(line)) answerSeen = true;
    // Only a letter label counts here (`matchOptionLine` needs the running count, so
    // the letter pattern is tested directly).
    if (OPTION_LINE.test(line)) letterOptions += 1;
    if (!current) {
      // Text before the first numbered question is not part of any question.
      current = { line: sourceLine, lines: [] };
    }
    if (current) current.lines.push(line);
  });
  const trimmed = numbered
    .map(block => ({ line: block.line, lines: block.lines.filter(Boolean) }))
    .filter(block => block.lines.length > 0);
  if (sawBlockStart && trimmed.length) return trimmed;

  // No numbering at all: fall back to blank-line groups, and only when the result
  // looks like a question bank (>= 2 groups, each with an option line).
  const groupQueues = splitBlankLineGroups(lines, sourceLineOf);
  const withOptions = groupQueues.filter(group => group.lines.some(line => OPTION_LINE.test(line)));
  return withOptions.length >= 2 ? withOptions : [];
}

/** Groups of lines separated by one or more blank lines, keeping original line numbers. */
function splitBlankLineGroups(lines: string[], sourceLineOf: Map<number, number>): QuestionBlock[] {
  const groups: QuestionBlock[] = [];
  let current: QuestionBlock | null = null;
  lines.forEach((line, index) => {
    if (!line) {
      current = null;
      return;
    }
    if (!current) {
      current = { line: sourceLineOf.get(index) || index + 1, lines: [] };
      groups.push(current);
    }
    current.lines.push(line);
  });
  return groups;
}

/**
 * A label the teacher wrote mid-line: an option letter, an answer or an explanation.
 * Only used to split a question written on one line (#116), never to read values.
 */
const INLINE_LABEL = /[\p{S}\s]\s*((?:\*\*)?\s*(?:[a-h])(?:\d{1,2})?\s*[.)]\s+\S|(?:\*\*)?\s*(?:đ(?:áp|\s*&aacute;p|&aacute;p)\s*(?:án|&aacute;n)|dap\s*an|answer|key|đ\s*\/\s*á|đa)\s*(?:đúng|correct)?\s*(?:\*\*)?\s*[:：\-=]|(?:\*\*)?\s*(?:giải\s*thích|giai\s*thich|explanation|lời\s*giải|loi\s*giai)\s*[:：\-=])/giu;
const INLINE_OPTION_LABEL = /^[\p{S}\s]*([a-h])(\d{1,2})?\s*[.)]\s+\S/iu;
/** The first `A. …` on a line, wherever it starts: the option right after the prompt. */
/** An explanation label, used with the same guard as the answer label. */
const INLINE_EXPLANATION_LABEL = /^[\p{S}\s]*(?:giải\s*thích|giai\s*thich|explanation|lời\s*giải|loi\s*giai)\s*[:：\-=]/iu;
const INLINE_ANSWER_LABEL = /^[\p{S}\s]*(?:đ\s*áp\s*(?:án|&aacute;n)|dap\s*an|answer|key|đ\s*\/\s*á|đa)\s*(?:đúng|correct)?\s*(?:\*\*)?\s*[:：\-=]/iu;

/**
 * Split a question written on a single line into separate lines (plan §2.1e / #116):
 *
 *   `Câu 1: … ? A. … B. … C. … 👉 Đáp án: B`
 *
 * becomes a prompt line, one line per option and one answer line, so the existing
 * line readers apply unchanged. Two guards keep prose intact:
 *   - a split at option labels needs **at least two** labels on the line, so
 *     "Học sinh A. đạt giải" and a sentence quoting one letter are never cut;
 *   - an answer/explanation label is only split off a line that also holds an option
 *     label or a question mark, i.e. when the line is clearly a question.
 * The source line number is kept for every generated line.
 */
function splitInlineQuestion(line: string, sourceLine = 0): Array<{ line: string; sourceLine: number }> {
  // Line-wise cleaning first: the cut offsets below must refer to the same text the
  // label pattern is matched on.
  const text = cleanQuestionLine(String(line || '')).trim();
  const keep = [{ line, sourceLine }];
  if (!text) return keep;

  // A question pasted on one line hides its first option: it follows the prompt, so it
  // has no line start to be found at. Find every label first, then decide whether the
  // first one belongs to a prompt (something question-shaped before it) or starts the
  // line itself.
  const labels: Array<{ index: number; kind: 'option' | 'tail' }> = [];
  const scanning = new RegExp(INLINE_LABEL.source, 'giu');
  let match: RegExpExecArray | null;
  while ((match = scanning.exec(text))) {
    const label = match[1];
    // The pattern may begin on a space; the label's own column is inside the match.
    const index = match.index + match[0].indexOf(label);
    labels.push({ index, kind: INLINE_OPTION_LABEL.test(label) ? 'option' : 'tail' });
    scanning.lastIndex = match.index + match[0].length;
  }
  const optionLabels = labels.filter(entry => entry.kind === 'option');
  // Only a list of at least two options is split: one `A.` inside a sentence is text,
  // not an option, and prose never carries two labelled options on one line.
  if (optionLabels.length < 2) return keep;
  // The prompt and its first option share the line when the option does not start it:
  // the prompt becomes its own item and every label is a cut. When the line starts
  // with an option, that option is simply the first item.
  const cuts = labels.map(entry => entry.index);
  const parts: string[] = [];
  let cursor = 0;
  for (const cut of cuts) {
    if (cut <= cursor) continue;
    const piece = text.slice(cursor, cut).trim();
    if (piece) parts.push(piece);
    cursor = cut;
  }
  const last = text.slice(cursor).trim();
  if (last) parts.push(last);
  if (parts.length < 2) return keep;
  return parts.map(part => ({ line: part, sourceLine }));
}

function stripQuestionNumber(line: string): string {
  return line
    .replace(/^\s*(?:#{1,6}\s*)?(?:\*\*)?\s*(?:câu|question|q)\s*\d+\s*[:.)\-]\s*/iu, '')
    .replace(/^\s*\d{1,3}\s*[.)]\s+/, '')
    .trim();
}

/** One option line matched against the label patterns, in priority order. */
interface OptionMatch {
  /** `a`…`h`, `a1`…, or the number as written (`1`). */
  id: string;
  text: string;
  /** Leading spaces before the label, used to decide multi-line continuations. */
  indent: number;
}

function matchOptionLine(line: string, letterCount: number): OptionMatch | null {
  const indent = line.length - line.trimStart().length;
  const letter = line.match(OPTION_LINE);
  if (letter) {
    // `D. Bốn ✅ Đáp án: D`: the marker after the text is a separate segment, so it must
    // not become part of the option (BUG #117).
    const text = stripTrailingAnswer(letter[3]);
    return { id: (letter[1] + (letter[2] || '')).toLowerCase(), text, indent };
  }
  // A bare number is only an option once the question already reads as a lettered
  // option list (`OPTION_NUMBER_MIN_LETTERS`); before that it is the next question.
  if (letterCount >= OPTION_NUMBER_MIN_LETTERS) {
    const numbered = line.match(OPTION_NUMBER_LINE);
    if (numbered) return { id: numbered[1], text: numbered[2].trim(), indent };
  }
  return null;
}

/** The answer marker as it appears mid-line, e.g. "B. Huế  Đáp án: B". */
const TRAILING_ANSWER = /\s+(?:\*\*)?\s*(?:đ(?:áp|\s*&aacute;p|&aacute;p)\s*(?:án|&aacute;n)|dap\s*an|answer|key|đ\s*\/\s*á|đa)\s*(?:đúng|correct)?\s*(?:\*\*)?\s*[:：\-=]\s*(.*)$/iu;

/**
 * Split a line that is an option with an answer marker appended:
 *
 *   `B. Huế  Đáp án: B`  ->  option `B. Huế`, answer `B`
 *
 * Applied to option lines only; elsewhere the marker keeps its own line path.
 */
function splitTrailingAnswer(line: string): { option: string; answer: string } {
  if (!OPTION_LINE.test(line)) return { option: line, answer: '' };
  const match = line.match(TRAILING_ANSWER);
  if (!match || match.index === undefined) return { option: line, answer: '' };
  const answer = stripTrailingAnswer(match[1]);
  // An empty value is not an answer: leave the line whole so it is reported missing.
  if (!answer) return { option: line, answer: '' };
  return { option: line.slice(0, match.index).trim(), answer };
}

/** Drop decoration and a second marker from an answer value: `D ✅` -> `D`. */
function stripTrailingAnswer(value: string): string {
  return String(value || '')
    .replace(/[\p{S}\s]+$/u, '')
    .replace(/\s+(?:\*\*)?\s*(?:đ(?:áp|\s*&aacute;p|&aacute;p)\s*(?:án|&aacute;n)|dap\s*an|answer|key|đa)\s*(?:đúng|correct)?\s*(?:\*\*)?\s*[:：\-=].*$/iu, '')
    .trim();
}

/** "C (Ba)" / "C. Ba" / "Đáp án C - Ba" -> "C": the letters before the teacher's note. */
function answerLetters(rawAnswer: string): string {
  // The letter must stand alone ("B", "A, C"); "Ba" / "Có" are words, not labels.
  const match = String(rawAnswer || '').match(/^\s*([a-h](?:\d{1,2})?(?![a-zà-ỹ])(?:\s*[,;/+&]\s*[a-h](?:\d{1,2})?(?![a-zà-ỹ]))*)/iu);
  return match ? match[1].trim() : '';
}

/** True when the answer names the option text verbatim ("Ba" for option "C. Ba"). */
function answerMatchesText(rawAnswer: string, option: { id: string; text: string }): boolean {
  const value = String(rawAnswer || '').trim();
  if (!value) return false;
  const text = option.text.trim();
  if (!text || text.length < 2) return false;
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(text)}(?![\\p{L}\\p{N}])`, 'iu').test(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

/**
 * Read one block into a `ParsedQuestion`. Returns `null` for a block that is not a
 * question at all (plain text with no options, no answer and no fill/short marker),
 * so a heading above the bank is not reported as a broken question.
 *
 * Rules (plan §2.1), all marker-based, never a guess:
 *   - letter options `a`–`h`, plus `A1`-style sub-labels; numbered options only after
 *     two letter options exist in the same question;
 *   - a deeper-indented non-marker line continues the previous option;
 *   - the *first* answer/explanation line wins, so a later question's markers cannot
 *     attach to this one;
 *   - nothing is invented: a missing answer or explanation is a `needs-review`
 *     warning, a copied question keeps both copies.
 */
function readQuestionBlock(block: QuestionBlock, index: number): ParsedQuestion | null {
  const prompt = block.lines[0] || '';
  if (!prompt) return null;

  const options: Array<{ id: string; text: string; indent: number }> = [];
  const pairs: Array<{ left: string; right: string }> = [];
  const statementAnswers: string[] = [];
  const warnings: string[] = [];
  let rawAnswer = '';
  let answerSeen = false;
  let explanation = '';
  let sawMarker = false;
  let fillInstruction = false;
  let shortInstruction = false;

  for (const line of block.lines.slice(1)) {
    // Pairs first: `A. Quang hợp – 1. Tạo chất hữu cơ` also looks like a plain option.
    const pair = line.match(PAIR_LINE);
    if (pair && pair[6] && pair[3]) {
      pairs.push({ left: pair[3].trim(), right: pair[6].trim() });
      sawMarker = true;
      continue;
    }
    // An option line may carry the answer marker after its text (`B. Huế  Đáp án: B`):
    // the answer belongs to the question, never to option B (BUG #117, where the
    // marker was read as part of that option's text).
    const splitAnswer = splitTrailingAnswer(line);
    const option = matchOptionLine(splitAnswer.option, options.length);
    if (option) {
      options.push(option);
      sawMarker = true;
      if (splitAnswer.answer && !answerSeen) {
        rawAnswer = splitAnswer.answer;
        answerSeen = true;
      }
      continue;
    }
    const answer = line.match(ANSWER_LINE);
    if (answer) {
      sawMarker = true;
      if (!answerSeen) {
        rawAnswer = answer[1].trim();
        answerSeen = true;
      }
      continue;
    }
    const note = line.match(EXPLANATION_LINE);
    if (note) {
      sawMarker = true;
      if (!explanation) {
        explanation = note[1].trim();
        // An explanation line that continues on the next, deeper-indented line.
      }
      continue;
    }
    if (FILL_IN_MARKER.test(line)) {
      fillInstruction = true;
      sawMarker = true;
      continue;
    }
    if (SHORT_ANSWER_MARKER.test(line) && !options.length) {
      shortInstruction = true;
      sawMarker = true;
      continue;
    }
    // Multi-line content: only a deeper-indented line continues what came before it.
    const indent = line.length - line.trimStart().length;
    const last = options[options.length - 1];
    if (last && indent > last.indent) {
      last.text = `${last.text} ${line.trim()}`.replace(/\s+/g, ' ').trim();
      continue;
    }
    if (explanation && indent > 0) {
      explanation = `${explanation} ${line.trim()}`.replace(/\s+/g, ' ').trim();
      continue;
    }
    if (STATEMENT_TF_SUFFIX.test(line) && !options.length) {
      statementAnswers.push(line.trim());
      sawMarker = true;
      continue;
    }
    // BUG #117: an answer that is also an option's *text* (`Đáp án: Ba` with option
    // `C. Ba`, or a bare `C (Ba)`) was read as the question's next text, so the answer
    // was lost. Only an option's exact text counts, and only once the options exist —
    // this never turns prose into an answer.
    // A line that is just an option's text ("Ba") is the answer only when the answer
    // line has not already named that option ("Đáp án: C" then "Ba" is a repeated
    // marker or prose, not a second answer).
    const answerNamesOption = Boolean(rawAnswer)
      && options.filter(option => answerMatchesText(rawAnswer, option)).length === 1;
    if (options.length >= 2 && !answerNamesOption && line.trim().length >= 2) {
      const matched = options.filter(option => option.text.trim().toLocaleLowerCase() === line.trim().toLocaleLowerCase());
      if (matched.length === 1) {
        rawAnswer = line.trim();
        answerSeen = true;
        sawMarker = true;
        continue;
      }
    }
  }

  const promptHasBlank = BLANK_MARKER.test(prompt);
  const hasOptions = options.length >= 2;
  const kind = detectKind({ prompt, options, rawAnswer, pairs, statementAnswers, fillInstruction, shortInstruction, promptHasBlank });
  if (kind === 'short-answer' && !hasOptions && !sawMarker && !rawAnswer) return null;
  if (kind === 'multiple-choice' && !hasOptions && !sawMarker && !rawAnswer) return null;

  const base: GameQuestion = {
    id: `imported-${index + 1}`,
    type: 'multiple-choice',
    prompt,
    explanation,
    points: 100,
    options: [],
    correctOptionId: ''
  } as GameQuestion;

  // The draft schema requires a non-empty explanation and update_quy_trinh §4.3 is
  // explicit that the app must not invent one: the question is kept with an empty
  // explanation, and the teacher is told exactly what to add. Only a question that
  // is otherwise playable gets this warning — an unanswered question already says
  // what it needs, and two warnings per line made the list unreadable.
  const explanationMissing = !explanation;

  let question = base;
  let status: ParsedQuestionStatus = 'ready';

  switch (kind) {
    case 'multi-tf': {
      // Several True/False statements: one `GameQuestion` holds one statement and one
      // answer, so splitting would change what the question asks.
      question = { ...base, type: 'true-false', options: [{ id: 'a', text: 'Đúng' }, { id: 'b', text: 'Sai' }] } as GameQuestion;
      warnings.push('Câu có nhiều phát biểu Đúng/Sai gộp trong một câu. Trò chơi chỉ hỗ trợ một phát biểu mỗi câu — hãy tách thành các câu riêng nếu muốn dùng.');
      status = 'needs-review';
      break;
    }
    case 'multi-answer': {
      // Keep the first answer so the question is not lost, but never silently play a
      // question whose second correct answer disappeared.
      const first = resolveCorrectOption(rawAnswer, options);
      if (!hasOptions) {
        warnings.push('Câu này chưa có ít nhất hai phương án (A, B…).');
        status = 'needs-review';
      } else if (!first) {
        warnings.push(`Đáp án “${rawAnswer}” không khớp phương án nào.`);
        status = 'needs-review';
      } else {
        question = { ...base, options: options.map(toOption), correctOptionId: first.id } as GameQuestion;
      }
      warnings.push(`Câu có nhiều đáp án đúng (“${rawAnswer}”). Trò chơi chỉ chấm được một đáp án mỗi câu — hãy tách thành nhiều câu hỏi nếu cần.`);
      status = 'needs-review';
      break;
    }
    case 'true-false': {
      const correct = resolveTrueFalse(rawAnswer);
      if (!correct) {
        warnings.push(rawAnswer ? `Đáp án “${rawAnswer}” không phải Đúng/Sai.` : 'Câu Đúng/Sai này chưa có đáp án “Đúng” hoặc “Sai”.');
        status = 'needs-review';
      }
      question = { ...base, type: 'true-false', options: [{ id: 'a', text: 'Đúng' }, { id: 'b', text: 'Sai' }], correctOptionId: correct || '' } as GameQuestion;
      break;
    }
    case 'fill-in-blank': {
      if (!rawAnswer) {
        warnings.push('Câu điền khuyết này chưa có dòng “Đáp án:”.');
        status = 'needs-review';
      } else if (MULTI_ANSWER_VALUE.test(rawAnswer)) {
        warnings.push(`Câu điền khuyết có nhiều đáp án (“${rawAnswer}”). Trò chơi chỉ chấm được một đáp án mỗi câu.`);
        status = 'needs-review';
      }
      question = toTextQuestion(base, 'fill-in-blank', rawAnswer);
      break;
    }
    case 'short-answer': {
      question = toTextQuestion(base, 'short-answer', rawAnswer);
      if (!rawAnswer) warnings.push('Câu trả lời ngắn này chưa có dòng “Đáp án:” mẫu.');
      break;
    }
    case 'matching': {
      question = base;
      warnings.push('Câu ghép cặp đã nhận diện, nhưng trò chơi câu hỏi chỉ nhận phương án A–H. Hãy dùng thể loại Ghép cặp.');
      status = 'incompatible';
      break;
    }
    default: {
      if (!hasOptions) {
        warnings.push('Câu này chưa có ít nhất hai phương án (A, B…).');
        status = 'needs-review';
        break;
      }
      if (options.length > MAX_COMPATIBLE_OPTIONS) {
        warnings.push(`Câu có ${options.length} phương án; trò chơi chỉ nhận tối đa ${MAX_COMPATIBLE_OPTIONS} phương án mỗi câu. Đã giữ nguyên đủ phương án.`);
        status = 'incompatible';
        question = { ...base, options: options.map(toOption), correctOptionId: '' } as GameQuestion;
        break;
      }
      if (!rawAnswer) {
        warnings.push('Câu này chưa có dòng “Đáp án:”.');
        status = 'needs-review';
      }
      const correct = rawAnswer ? resolveCorrectOption(rawAnswer, options) : undefined;
      if (rawAnswer && !correct) {
        warnings.push(`Đáp án “${rawAnswer}” không khớp phương án nào.`);
        status = 'needs-review';
      }
      question = { ...base, options: options.map(toOption), correctOptionId: correct ? correct.id : '' } as GameQuestion;
    }
  }

  if (status === 'ready' && explanationMissing) {
    warnings.push('Câu này chưa có dòng “Giải thích:”. Hãy bổ sung trước khi lưu trò chơi.');
  }

  return {
    question,
    kind,
    status,
    warnings,
    sourceLine: block.line,
    // Plan §4: a question has a status, never only an issue row.
    ...(warnings.length && status === 'ready' ? { status: 'needs-review' as ParsedQuestionStatus } : {}),
    ...(pairs.length >= 2 ? { pairs } : {})
  };
}

function toOption(option: OptionMatch): { id: string; text: string } {
  return { id: option.id, text: option.text };
}

/** A written-answer question carries the teacher's answer in `correctAnswer`, not options. */
function toTextQuestion(base: GameQuestion, type: GameQuestion['type'], rawAnswer: string): GameQuestion {
  const accepted = rawAnswer.split(';').map(value => value.trim()).filter(Boolean);
  return {
    ...base,
    type,
    options: [],
    correctOptionId: '',
    correctAnswer: accepted[0] || '',
    ...(accepted.length > 1 ? { alternateAnswers: accepted.slice(1) } : {})
  } as GameQuestion;
}

/**
 * The kind of question a block is, from its markers only (plan §2.1c). Order matters:
 * the shapes games cannot play are named before the shapes they resemble.
 */
function detectKind(input: {
  prompt: string;
  options: OptionMatch[];
  rawAnswer: string;
  pairs: Array<{ left: string; right: string }>;
  statementAnswers: string[];
  fillInstruction: boolean;
  shortInstruction: boolean;
  promptHasBlank: boolean;
}): ParsedQuestionKind {
  const optionTexts = input.options.map(option => option.text);
  const tfOption = input.options.length >= 2 && optionTexts.every(text => TRUE_FALSE_VALUE.test(text.trim()));
  if (tfOption || TRUE_FALSE_SHORTHAND.test(input.prompt)) return 'true-false';
  if (input.statementAnswers.length >= 2 || isMultiTfOptions(input.options)) return 'multi-tf';
  if (input.rawAnswer && MULTI_ANSWER_VALUE.test(input.rawAnswer) && input.options.length >= 2) return 'multi-answer';
  if (input.pairs.length >= 2) return 'matching';
  if (input.promptHasBlank || input.fillInstruction) return 'fill-in-blank';
  // `Đ/S:` on the prompt with a bare `Đúng`/`Sai` answer is a true/false question in
  // shorthand; anything else with one option is a choice question missing an option
  // (calling it short-answer would hide that).
  if (input.options.length >= 1) return 'multiple-choice';
  if (TRUE_FALSE_SHORTHAND.test(input.prompt) && TRUE_FALSE_VALUE.test(input.rawAnswer.trim())) return 'true-false';
  // A written-answer question only when the teacher asked for one (a `Trả lời:`/`Nêu`
  // instruction or a blank to fill). A lone `Đáp án:` means a choice question whose
  // options are missing, which needs saying, not a new question type.
  if (input.shortInstruction) return 'short-answer';
  return 'multiple-choice';
}

/**
 * `a) Việt Nam nằm ở châu Á — Đ` / `b) … — S`: options that each end in a True/False
 * marker are statements of one question, not choices of one answer.
 */
function isMultiTfOptions(options: OptionMatch[]): boolean {
  if (options.length < 2) return false;
  const marked = options.filter(option => STATEMENT_TF_SUFFIX.test(option.text));
  return marked.length === options.length;
}

function resolveTrueFalse(rawAnswer: string): string | null {
  const value = rawAnswer.trim().replace(/^\(|\)$/g, '').trim();
  if (!value) return null;
  if (/^(?:đúng|đ|true|t|yes|1)$/iu.test(value)) return 'a';
  if (/^(?:sai|s|false|f|no|0)$/iu.test(value)) return 'b';
  if (/^(?:a)$/iu.test(value)) return 'a';
  if (/^(?:b)$/iu.test(value)) return 'b';
  return null;
}

function parseDelimitedText(input: string, forcedDelimiter?: string): string[][] {
  const text = input.replace(/^\uFEFF/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const delimiter = forcedDelimiter || [',', ';', '\t']
    .map(candidate => ({ candidate, count: countOutsideQuotes(firstLine, candidate) }))
    .sort((left, right) => right.count - left.count)[0].candidate;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (!quoted && character === delimiter) {
      row.push(cell.trim());
      cell = '';
    } else if (!quoted && (character === '\n' || character === '\r')) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell.trim());
      if (row.some(value => value.length > 0)) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }
  if (quoted) throw new Error('Tệp bảng tính có dấu ngoặc kép chưa được đóng.');
  row.push(cell.trim());
  if (row.some(value => value.length > 0)) rows.push(row);
  return rows;
}

function countOutsideQuotes(line: string, delimiter: string): number {
  let quoted = false;
  let count = 0;
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '"') {
      if (quoted && line[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && line[index] === delimiter) {
      count += 1;
    }
  }
  return count;
}

async function parseXlsx(buffer: Buffer): Promise<string[][]> {
  let archive: JSZip;
  try {
    archive = await JSZip.loadAsync(buffer);
  } catch (error) {
    throw new Error(`Không đọc được tệp XLSX: ${error instanceof Error ? error.message : String(error)}`);
  }
  const workbook = archive.file('xl/workbook.xml');
  const relationships = archive.file('xl/_rels/workbook.xml.rels');
  if (!workbook || !relationships) throw new Error('Tệp XLSX thiếu thông tin bảng tính.');

  const workbookXml = await readZipText(workbook);
  const relationshipsXml = await readZipText(relationships);
  const firstSheet = workbookXml.match(/<sheet\b[^>]*\br:id="([^"]+)"/);
  if (!firstSheet) throw new Error('Tệp XLSX không có trang tính.');
  const relationPattern = /<Relationship\b([^>]*)\/?>/g;
  let relationMatch: RegExpExecArray | null;
  let target: string | undefined;
  while ((relationMatch = relationPattern.exec(relationshipsXml))) {
    const attributes = parseXmlAttributes(relationMatch[1]);
    if (attributes.Id === firstSheet[1]) {
      target = attributes.Target;
      break;
    }
  }
  if (!target || target.includes('\\') || target.startsWith('/') && !target.startsWith('/xl/')) {
    throw new Error('Đường dẫn trang tính XLSX không hợp lệ.');
  }
  const sheetPath = target.startsWith('/xl/')
    ? target.slice(1)
    : resolveWorkbookTarget(target);
  const sheetFile = archive.file(sheetPath);
  if (!sheetFile) throw new Error('Không tìm thấy trang tính đầu tiên trong XLSX.');

  const sharedStringsFile = archive.file('xl/sharedStrings.xml');
  const sharedStrings = sharedStringsFile
    ? parseSharedStrings(await readZipText(sharedStringsFile))
    : [];
  return parseWorksheet(await readZipText(sheetFile), sharedStrings);
}

async function readZipText(file: JSZip.JSZipObject): Promise<string> {
  const internalData = Object.getOwnPropertyDescriptor(file, '_data')?.value;
  if (typeof internalData === 'object' && internalData !== null &&
      'uncompressedSize' in internalData && typeof internalData.uncompressedSize === 'number' &&
      internalData.uncompressedSize > MAX_SHEET_XML_BYTES) {
    throw new Error('Trang tính XLSX vượt quá giới hạn kích thước.');
  }
  const text = await file.async('text');
  if (Buffer.byteLength(text, 'utf8') > MAX_SHEET_XML_BYTES) {
    throw new Error('Trang tính XLSX vượt quá giới hạn kích thước.');
  }
  return text;
}

function resolveWorkbookTarget(target: string): string {
  const parts = ['xl'];
  for (const part of target.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (parts.length <= 1) throw new Error('Đường dẫn trang tính XLSX không hợp lệ.');
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return parts.join('/');
}

function parseWorksheet(xml: string, sharedStrings: string[]): string[][] {
  const rows: string[][] = [];
  const rowPattern = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowPattern.exec(xml))) {
    const row: string[] = [];
    const cellPattern = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellPattern.exec(rowMatch[1]))) {
      const attributes = parseXmlAttributes(cellMatch[1]);
      const reference = attributes.r || '';
      const column = columnIndex(reference);
      if (column < 0 || column >= MAX_COLUMNS) continue;
      const content = cellMatch[2] || '';
      const type = attributes.t;
      let value = '';
      if (type === 'inlineStr') {
        value = [...content.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
          .map(match => decodeXml(match[1])).join('');
      } else {
        const raw = content.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1] || '';
        const decoded = decodeXml(raw);
        if (type === 's') {
          const sharedIndex = Number(decoded);
          value = Number.isInteger(sharedIndex) ? sharedStrings[sharedIndex] || '' : '';
        } else {
          value = decoded;
        }
      }
      row[column] = value;
    }
    rows.push(Array.from({ length: Math.min(MAX_COLUMNS, row.length) }, (_, index) => row[index] || ''));
  }
  return rows;
}

function parseSharedStrings(xml: string): string[] {
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(item =>
    [...item[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
      .map(match => decodeXml(match[1])).join('')
  );
}

function parseXmlAttributes(raw: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of raw.matchAll(/([^\s=]+)="([^"]*)"/g)) {
    attributes[match[1]] = decodeXml(match[2]);
  }
  return attributes;
}

function columnIndex(reference: string): number {
  const letters = reference.match(/^[A-Z]+/i)?.[0].toUpperCase();
  if (!letters) return -1;
  let index = 0;
  for (const letter of letters) index = index * 26 + letter.charCodeAt(0) - 64;
  return index - 1;
}

function decodeXml(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, token: string) => {
    const normalized = token.toLowerCase();
    if (normalized === 'amp') return '&';
    if (normalized === 'lt') return '<';
    if (normalized === 'gt') return '>';
    if (normalized === 'quot') return '"';
    if (normalized === 'apos') return "'";
    const codePoint = normalized.startsWith('#x')
      ? Number.parseInt(normalized.slice(2), 16)
      : Number.parseInt(normalized.slice(1), 10);
    return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
      ? String.fromCodePoint(codePoint)
      : entity;
  });
}

function rowsToQuestions(rows: string[][]): GameQuestion[] {
  const headerRow = rows.findIndex(row => row.some(value => ['question', 'cauhoi'].includes(normalizeHeader(value))));
  if (headerRow < 0) {
    throw new Error('Không tìm thấy cột “Câu hỏi”. Dùng các cột: Câu hỏi, Dạng câu hỏi (tùy chọn), Phương án A-D, Đáp án, Giải thích, Điểm, Độ khó.');
  }
  const headers = rows[headerRow].map(normalizeHeader);
  const questionColumn = findColumn(headers, ['question', 'cauhoi']);
  const typeColumn = findColumn(headers, ['type', 'questiontype', 'hinhthuc', 'loaicauhoi', 'dangcauhoi', 'dang', 'kind']);
  const optionColumns = [
    findColumn(headers, ['optiona', 'phuongana', 'dapana', 'option1']),
    findColumn(headers, ['optionb', 'phuonganb', 'dapanb', 'option2']),
    findColumn(headers, ['optionc', 'phuonganc', 'dapanc', 'option3']),
    findColumn(headers, ['optiond', 'phuongand', 'dapand', 'option4'])
  ];
  const answerColumn = findColumn(headers, ['answer', 'correct', 'correctanswer', 'correctoption', 'dapandung', 'dapan']);
  if (questionColumn < 0 || answerColumn < 0) {
    throw new Error('Thiếu cột bắt buộc. Cần “Câu hỏi” và “Đáp án”. Câu trắc nghiệm cần thêm “Phương án A” và “Phương án B”.');
  }
  const explanationColumn = findColumn(headers, ['explanation', 'giaithich', 'loigiai']);
  const pointsColumn = findColumn(headers, ['points', 'diem']);
  const difficultyColumn = findColumn(headers, ['difficulty', 'dokho']);
  const questions: GameQuestion[] = [];
  for (let rowIndex = headerRow + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    if (!row.some(value => value.trim())) continue;
    if (questions.length >= MAX_QUESTIONS) {
      throw new Error(`Mỗi lần chỉ nhập tối đa ${MAX_QUESTIONS} câu hỏi.`);
    }
    const prompt = row[questionColumn]?.trim() || '';
    if (!prompt) throw new Error(`Dòng ${rowIndex + 1}: thiếu nội dung câu hỏi.`);
    const type = resolveQuestionType(typeColumn >= 0 ? row[typeColumn]?.trim() || '' : '');
    const rawAnswer = row[answerColumn]?.trim() || '';
    const pointsValue = pointsColumn >= 0 && row[pointsColumn]?.trim()
      ? Number(row[pointsColumn])
      : 100;
    if (!Number.isInteger(pointsValue) || pointsValue < 0 || pointsValue > 1000) {
      throw new Error(`Dòng ${rowIndex + 1}: điểm phải là số nguyên từ 0 đến 1000.`);
    }
    const difficultyRaw = difficultyColumn >= 0 ? row[difficultyColumn]?.trim().toLowerCase() : '';
    const difficulty = difficultyRaw
      ? [...DIFFICULTIES].find(value => normalizeHeader(value) === normalizeHeader(difficultyRaw))
      : undefined;
    if (difficultyRaw && !difficulty) throw new Error(`Dòng ${rowIndex + 1}: độ khó phải là dễ, trung bình hoặc khó.`);
    const base = {
      id: `imported-${questions.length + 1}`,
      type,
      prompt,
      explanation: explanationColumn >= 0 ? row[explanationColumn]?.trim() || '' : '',
      points: pointsValue,
      ...(difficulty ? { difficulty } : {})
    } as GameQuestion;
    if (type === 'fill-in-blank' || type === 'short-answer') {
      const accepted = rawAnswer.split(';').map(value => value.trim()).filter(Boolean);
      if (!accepted.length) throw new Error(`Dòng ${rowIndex + 1}: câu ${type === 'fill-in-blank' ? 'điền từ' : 'trả lời ngắn'} cần cột “Đáp án” (có thể cách nhiều đáp án hợp lệ bằng dấu chấm phẩy).`);
      base.options = [];
      base.correctOptionId = '';
      base.correctAnswer = accepted[0];
      if (accepted.length > 1) base.alternateAnswers = accepted.slice(1);
    } else if (type === 'true-false') {
      base.options = [{ id: 'a', text: 'Đúng' }, { id: 'b', text: 'Sai' }];
      base.correctOptionId = resolveBooleanAnswer(rawAnswer, rowIndex + 1);
    } else {
      const options = optionColumns
        .map((column, index) => ({ id: String.fromCharCode(97 + index), text: row[column]?.trim() || '' }))
        .filter(option => option.text);
      if (options.length < 2) throw new Error(`Dòng ${rowIndex + 1}: câu trắc nghiệm cần ít nhất hai phương án.`);
      const correct = resolveCorrectOption(rawAnswer, options);
      if (!correct) throw new Error(`Dòng ${rowIndex + 1}: đáp án “${rawAnswer}” không khớp phương án.`);
      base.options = options;
      base.correctOptionId = correct.id;
    }
    questions.push(base);
  }
  if (!questions.length) throw new Error('Tệp không có câu hỏi nào để nhập.');
  return questions;
}

function resolveQuestionType(raw: string): GameQuestion['type'] {
  const normalized = normalizeHeader(raw);
  if (!normalized || ['tracnghiem', 'multiplechoice', 'mc', 'choice'].includes(normalized)) return 'multiple-choice';
  if (['dungsai', 'truefalse', 'boolean', 'tf'].includes(normalized)) return 'true-false';
  if (['dientu', 'fillblank', 'fillinblank', 'blanks', 'fill'].includes(normalized)) return 'fill-in-blank';
  if (['ngan', 'traloingan', 'shortanswer', 'short', 'open', 'essay'].includes(normalized)) return 'short-answer';
  throw new Error(`Dòng dạng câu hỏi “${raw}” không được hỗ trợ. Dùng: trắc nghiệm, đúng/sai, điền từ, trả lời ngắn.`);
}

function resolveBooleanAnswer(answer: string, lineNumber: number): string {
  const normalized = normalizeHeader(answer);
  if (['a', 'dung', 'true', 'yes', 'y', '1', 'dung/true'].includes(normalized)) return 'a';
  if (['b', 'sai', 'false', 'no', 'n', '0'].includes(normalized)) return 'b';
  throw new Error(`Dòng ${lineNumber}: đáp án đúng/sai phải là Đúng/Sai (hoặc True/False).`);
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]/g, '');
}

function findColumn(headers: string[], aliases: string[]): number {
  return headers.findIndex(header => aliases.includes(header));
}

function resolveCorrectOption(
  answer: string,
  options: Array<{ id: string; text: string }>
): { id: string; text: string } | undefined {
  // The letters first: `C (Ba)`, `C. Ba` and `Đáp án C - Ba` all mean option C.
  const normalizedAnswer = normalizeHeader(answerLetters(answer) || answer);
  const byId = options.find(option =>
    normalizedAnswer === option.id || normalizedAnswer === `option${option.id}` ||
    normalizedAnswer === `phuongan${option.id}` || normalizedAnswer === `dapan${option.id}`
  );
  if (byId) return byId;
  const byText = options.filter(option => option.text.trim().toLocaleLowerCase() === answer.trim().toLocaleLowerCase());
  return byText.length === 1 ? byText[0] : undefined;
}
