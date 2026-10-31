/**
 * Offline document structure analyzer (docs/archive/specs/update_AI_plan_7.txt §3).
 *
 * Builds a section tree for a lesson document so the teacher can choose which
 * parts of it the AI may read. Everything here is deterministic and local:
 *
 *  - never calls AI, never touches the network, never reads or writes a file;
 *  - never throws: any failure returns one whole-document node with
 *    `degraded: true` and the reason, because a broken tree must not block a
 *    teacher (and a silently swallowed error must be visible in the log);
 *  - never drops text: every node stores offsets into the source instead of a
 *    copy of it (§3.2/§8);
 *  - ambiguous headings are *marked* (`confidence: 'low'`), never silently
 *    promoted or removed (§3.4).
 *
 * Heading signals, in order (§3.1):
 *   1. outline hints supplied by an extractor that knows real heading levels
 *      (DOCX heading styles);
 *   2. numbering that implies depth — Phần / Chương / Chủ đề / Bài / Tiết /
 *      Hoạt động / Mục — and title-shaped numbered lines such as "I. MỤC TIÊU";
 *   3. a short standalone line followed by a body block.
 * A line that carries content (table row, question, answer, formula, example,
 * figure caption) is never a heading, and neither is a line that repeats
 * identically through the document (a page header).
 *
 * Offsets refer to the normalized source (`\r\n` -> `\n`) — the same text the
 * chunker and the preprocessor use — so a selected range can be sliced from any
 * of them without an offset-translation step.
 */
import { normalizeLessonSource } from './lesson-chunker';

/**
 * Bump whenever the tree shape or node ids change for the same input. It is
 * stored next to a cached tree and mixed into the analysis cache key, so a bump
 * invalidates stored structures and cached analyses without a SQL migration.
 */
export const LESSON_STRUCTURE_VERSION = 1;

/** Above this many nodes the UI would be a wall of checkboxes. */
export const MAX_STRUCTURE_NODES = 500;
/**
 * The same cap for the flattened list a *parent* can carry: a heading with 500
 * children plus the 500 shared by every other level would still be thousands of
 * checkboxes, so the total is capped too, and the cap says so (`reason`).
 */
export const MAX_STRUCTURE_TOTAL_NODES = 2_000;
/** Below this many non-blank characters the document has no text layer (§3.5). */
export const NO_TEXT_LAYER_MIN_CHARS = 80;
/** Paragraph nodes in the no-heading fallback are packed up to this size. */
const FALLBACK_BLOCK_CHARS = 900;
/** A line longer than this is prose, never a heading. */
export const MAX_HEADING_CHARS = 80;
/** A heading has few words; a lead-in sentence has many. */
const MAX_HEADING_WORDS = 12;
/** A line this short is a fragment of a PDF table cell, not a paragraph. */
const SHORT_LINE_CHARS = 80;

export type SectionKind =
  | 'document'
  | 'section'
  | 'subsection'
  | 'table-row'
  | 'list-item'
  | 'question'
  | 'answer'
  | 'example'
  | 'formula'
  | 'figure-caption'
  | 'administrative';

export interface LessonSectionNode {
  /**
   * Stable id derived from the start offset (`sec_<charStart>`), so a selection
   * survives a re-render and can be validated against the source without
   * storing any text (§8: offsets, not duplicate copies).
   */
  id: string;
  title: string;
  /** 0 = whole document, 1..6 = heading depth. */
  level: number;
  kind: SectionKind;
  /** Inclusive start offset in the normalized source. */
  charStart: number;
  /** Exclusive end offset in the normalized source. */
  charEnd: number;
  children: LessonSectionNode[];
  /** Characters covered by this node's own range (children included). */
  characters: number;
  /** `low` = the line only *looked* like a heading; the UI must show that (§3.4). */
  confidence: 'high' | 'low';
  /** No text in its range at all — the UI cannot select it. */
  empty: boolean;
}

/** An outline entry supplied by an extractor that knows real heading levels. */
export interface OutlineHint {
  text: string;
  /** 1..6 (Word heading styles); anything else is treated as level 2. */
  level: number;
  /** Offset in the normalized source where this heading line starts. */
  charStart: number;
}

export interface LessonStructure {
  version: number;
  /** Normalized source length; a tree is only valid for text of this length. */
  textLength: number;
  /** Always one root of kind `document`. */
  root: LessonSectionNode;
  /** Depth-first flat view of `root`, parents before children. */
  nodes: LessonSectionNode[];
  /** Real headings found (outline + pattern + short-line fallback). */
  headingsFound: number;
  /** Headings the analyzer was not sure about (§3.4). */
  lowConfidence: number;
  /** The document has no usable text layer (§3.5). */
  empty: boolean;
  reason?: 'no_text' | 'too_many_nodes';
  /** The analyzer fell back to a whole-document node after an internal error. */
  degraded?: true;
  /** Error message behind `degraded`; logged, never shown to the teacher. */
  degradedReason?: string;
}

export interface BuildStructureOptions {
  /** Optional outline from a format that stores real heading levels (DOCX). */
  headings?: OutlineHint[];
}

/** Whole line, optional numbering, then a short title — repeated per section. */
export const HEADING_STYLE_LINE = /^(?:\p{L}{1,12}\.?\s+)?[\p{Lu}\p{N}\p{P}\s]{3,80}$/u;
/** Minimum occurrences before a heading-like line counts as a document marker. */
/**
 * `MIN_MARKER_OCCURRENCES` is **3** on purpose. At 2, any section title used twice
 * in one document ("I. MỤC TIÊU" in two lessons, "Tổng kết" in every lesson) was
 * treated as a page header and vanished from the tree — i.e. text the teacher could
 * not select. A header/footer that repeats a *title* honestly now costs one extra
 * checkbox, which is the safe direction; a real page header repeats on every page.
 */
export const MIN_MARKER_OCCURRENCES = 3;

export interface SourceLine {
  /** The line including its own trailing `\n` (absent on the last line). */
  text: string;
  start: number;
  end: number;
}

/**
 * Splits into lines, each keeping its trailing `\n`. A blank line is therefore
 * `"\n"`, never the empty string: `String.split` drops the empty string after a
 * trailing newline, which silently merges a whole document into one block.
 */
export function splitSourceLines(source: string): SourceLine[] {
  const lines: SourceLine[] = [];
  if (!source) return lines;
  let offset = 0;
  for (const text of source.match(/[^\n]*\n|[^\n]+$/g) || []) {
    lines.push({ text, start: offset, end: offset + text.length });
    offset += text.length;
  }
  return lines;
}

export function isBlankLine(line: { text: string }): boolean {
  // The line keeps its own trailing `\n`, so a blank line is `"\n"`, not `""`.
  return /^[^\S\n]*\n?$/.test(line.text);
}

// ---------------------------------------------------------------------------
// Line shapes and classification
// ---------------------------------------------------------------------------

// A depth-implying keyword at the start of a line, followed by a numeral:
// "Hoạt động 1", "Bài 5", "Chương III". The separator is `(?![\p{L}\p{N}])`, NOT
// `\b`: `\b` is ASCII-only, and "ng" followed by " " is a word boundary with no
// keyword after it, so "Hoạt động 1: Khởi động" silently stopped being a heading
// and every subsection of a lesson vanished from the tree.
const HEADING_KEYWORD = /^(phần|chương|chủ đề|bài|tiết|hoạt động|mục)\s+[ivxlc\d]+(?![\p{L}\p{N}])/iu;

/** A line that opens a list item (`-`, `•`, `1.`, `a)`, `(2)`). */
const LIST_MARKER = /^\s*(?:[-–—•*+]|\(?\d{1,2}[.)]|[a-zđ][.)])\s/i;
/** `1.` / `(2)` / `2)` where the number may be a heading or a list item. */
const NUMBERED_START = /^\(?\d{1,2}[.)]\s+\p{L}/u;
const ROMAN_START = /^(?:i{1,3}|iv|vi{0,3}|ix|xi{0,3})[.)]\s+\p{L}/iu;
const ADMINISTRATIVE = /^(giáo án|trường|phòng gd|sở gd|tổ chuyên môn|họ và tên|ngày soạn|ngày dạy|tuần|tiết ppct|môn học|lớp)\b/i;
const QUESTION_LINE = /^[^?]{3,}\?$/u;
const ANSWER_LINE = /^(đáp án|lời giải|kết quả)\s*[:：]/iu;
const EXPLANATION_LINE = /^(giải thích|vì sao|lưu ý|ghi nhớ)\s*[:：]/iu;
const EXAMPLE_LINE = /^(ví dụ|thí nghiệm|tình huống)\s*[:：]/iu;
const FIGURE_LINE = /^(hình|bảng|sơ đồ|biểu đồ)\s+[0-9ivx]/iu;
const FORMULA_LINE = /[=→⇒√²³×÷℃≤≥]/u;
const TABLE_SHAPE = /\|/;
/** A line ending in these is prose or a lead-in, never a title. */
const TERMINAL = /[.!?;…]$/u;
const DIACRITICS = /[\u0300-\u036f]/g;

/** A Markdown table rule (`| --- | :--: |`) is table structure, not a title. */
export function isTableSeparator(text: string): boolean {
  return /^\|?\s*[-–—|:\s]+$/.test(text.trim());
}

export function isTableRow(line: string): boolean {
  return TABLE_SHAPE.test(line.trim());
}

export function isQuestionLine(line: string): boolean {
  return QUESTION_LINE.test(line.trim());
}

export function isAnswerLine(line: string): boolean {
  return ANSWER_LINE.test(line.trim());
}

export function isExplanationLine(line: string): boolean {
  return EXPLANATION_LINE.test(line.trim());
}

export function isExampleLine(line: string): boolean {
  return EXAMPLE_LINE.test(line.trim());
}

export function isFormulaLine(line: string): boolean {
  return FORMULA_LINE.test(line.trim());
}

export function isFigureLine(line: string): boolean {
  return FIGURE_LINE.test(line.trim());
}

export function isAdministrativeLine(line: string): boolean {
  const text = line.trim().normalize('NFD').replace(DIACRITICS, '').toLowerCase();
  return ADMINISTRATIVE.test(text);
}

export function isListItemLine(line: string): boolean {
  return LIST_MARKER.test(line.trim());
}

/**
 * Paragraph- or line-level classification used for both the tree and the
 * per-node `kind`. Returns `null` for plain prose.
 */
export function classifyLine(line: string): SectionKind | null {
  const text = line.trim();
  if (!text) return null;
  if (isTableRow(text)) return 'table-row';
  if (isQuestionLine(text)) return 'question';
  if (isAnswerLine(text)) return 'answer';
  if (isExplanationLine(text) || isAdministrativeLine(text)) return 'administrative';
  if (isExampleLine(text)) return 'example';
  if (isFigureLine(text)) return 'figure-caption';
  if (isFormulaLine(text)) return 'formula';
  if (isListItemLine(text)) return 'list-item';
  return null;
}

/**
 * A line that carries content and must never be promoted to a heading: a table
 * row, a question, an answer, a formula, an example or a figure caption.
 *
 * Deliberately *not* `lesson-preprocess.isProtectedLine`, which also protects
 * every numbered or bulleted line. That rule is right for "never delete this
 * text" and wrong for "is this a heading": "I. MỤC TIÊU" is a numbered heading.
 */
export function isContentLine(line: string): boolean {
  const kind = classifyLine(line);
  return kind !== null && kind !== 'administrative' && kind !== 'list-item';
}

// ---------------------------------------------------------------------------
// Heading detection
// ---------------------------------------------------------------------------

/**
 * Numbering that implies depth (§3.1). `high` = the keyword or the numeral style
 * proves it; `low` = plausible but the teacher should check.
 */
// NOTE on the separator after the keyword: `\b` is ASCII-only in JavaScript,
// and `ệ` / `ố` / `ạ` are *not* word characters for `\b`. `\b` also matches
// after a Vietnamese numeral (`một`, `hai`), which is why it is NOT used here.
// Use an explicit non-letter/end test instead, or "Hoạt động 1: Khởi động"
// silently stops being a heading and every subsection disappears from the tree.
const PATTERNS: ReadonlyArray<{ pattern: RegExp; level: number; kind: SectionKind; confidence: 'high' | 'low' }> = [
  { pattern: /^(phần)\s+([ivxlc\d]+)(?![\p{L}\p{N}])/iu, level: 1, kind: 'section', confidence: 'high' },
  { pattern: /^(chương)\s+([ivxlc\d]+)(?![\p{L}\p{N}])/iu, level: 1, kind: 'section', confidence: 'high' },
  { pattern: /^(chủ đề)\s+([ivxlc\d]+)(?![\p{L}\p{N}])/iu, level: 1, kind: 'section', confidence: 'high' },
  { pattern: /^(bài)\s+(\d+)(?![\p{L}\p{N}])/iu, level: 2, kind: 'section', confidence: 'high' },
  { pattern: /^(tiết)\s+(\d+)(?![\p{L}\p{N}])/iu, level: 2, kind: 'section', confidence: 'high' },
  // "Hoạt động" is a step *inside* a lesson step, so it sits one level deeper.
  { pattern: /^(hoạt động)\s+(\d+)(?![\p{L}\p{N}])/iu, level: 3, kind: 'subsection', confidence: 'high' },
  { pattern: /^(mục)\s+([ivxlc\d]+)(?![\p{L}\p{N}])/iu, level: 3, kind: 'subsection', confidence: 'high' },
  // "I. MỤC TIÊU", "IV. TỔNG KẾT" — Roman numerals are almost always outline levels.
  { pattern: ROMAN_START, level: 2, kind: 'section', confidence: 'low' },
  { pattern: NUMBERED_START, level: 2, kind: 'section', confidence: 'low' }
];

export interface HeadingMatch {
  title: string;
  level: number;
  confidence: 'high' | 'low';
  kind: SectionKind;
}

/** Cuts a title for display; the stored range always keeps the full text. */
export function renderTitle(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  return trimmed.length > MAX_HEADING_CHARS ? `${trimmed.slice(0, MAX_HEADING_CHARS - 1).trimEnd()}…` : trimmed;
}

/**
 * A lead-in line ends with `:` ("Mục tiêu:", "Chuẩn bị:") and is often followed
 * by a list; it is still a heading candidate.
 */
function isLeadIn(text: string): boolean {
  const trimmed = text.trim();
  if (!/[:：]$/.test(trimmed)) return false;
  return trimmed.length <= MAX_HEADING_CHARS && trimmed.split(/\s+/).filter(Boolean).length <= MAX_HEADING_WORDS;
}

/**
 * Can this line be a heading at all? Shape only — numbering is `detectHeadingStyle`,
 * and "is something below it" is decided by the caller.
 */
export function hasHeadingShape(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > MAX_HEADING_CHARS) return false;
  if (TERMINAL.test(trimmed) && !isLeadIn(trimmed)) return false;
  if (isTableRow(trimmed) || isTableSeparator(trimmed)) return false;
  return trimmed.split(/\s+/).filter(Boolean).length <= MAX_HEADING_WORDS;
}

/**
 * Style of a numbered heading, if this line has one. Numbering alone is not
 * enough — the rest of the line must still be title-shaped, so
 * "1. Học sinh đọc bài, trả lời câu hỏi rồi ghi vào vở" stays a list item.
 */
export function detectHeadingStyle(line: string): HeadingMatch | null {
  if (!hasHeadingShape(line)) return null;
  const title = renderTitle(line);
  for (const candidate of PATTERNS) {
    if (!candidate.pattern.test(title)) continue;
    return {
      title,
      level: candidate.level,
      // The pattern proves numbering, not that the line is a title (§3.4).
      confidence: candidate.confidence,
      kind: candidate.kind
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Blocks: a paragraph never spans a blank line
// ---------------------------------------------------------------------------

export interface TextBlock {
  index: number;
  start: number;
  end: number;
  lines: SourceLine[];
}

export function buildBlocks(lines: SourceLine[]): TextBlock[] {
  const blocks: TextBlock[] = [];
  let group: SourceLine[] = [];
  // A sentinel closes the last group instead of a `flush()` callback: a `void`
  // flush handed to `Array.prototype.filter` silently drops every block.
  for (const line of [...lines, { text: '\n', start: -1, end: -1 }]) {
    if (!isBlankLine(line)) {
      group.push(line);
      continue;
    }
    if (group.length) {
      blocks.push({ index: blocks.length, start: group[0].start, end: group[group.length - 1].end, lines: group });
      group = [];
    }
  }
  return blocks;
}

function lineKey(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Headings that repeat identically — a page header, or a table header row a PDF
 * emits once per page — are document markers, not sections (§3.2). Otherwise the
 * tree becomes thirty copies of the school's name.
 */
/**
 * Line keys that occur at least `MIN_MARKER_OCCURRENCES` times **anywhere** in the
 * document (not only as one-line blocks). A page header, a footer, or a table
 * header row repeated by a PDF extractor is such a line; a title that merely opens
 * a section appears once.
 *
 * Counting single-line blocks only was wrong for exactly the format this feature
 * is for: `pdf-parse`/`mammoth` separate every line with one `\n`, so a repeated
 * header is never a one-line block and the school's name became the first section of
 * every page. A repeated line is *not* dropped from the text — it is only not a
 * heading (§3.2), and the frequency test is what keeps a legitimately repeated
 * heading ("MỤC TIÊU" in three lessons of one file) from disappearing.
 */
export function repeatedMarkers(blocks: TextBlock[]): Set<string> {
  const counts = new Map<string, number>();
  for (const block of blocks) {
    for (const line of block.lines) {
      const key = lineKey(line.text);
      if (!key || key.length > MAX_HEADING_CHARS || !/^[\p{Lu}\p{N}]/u.test(key)) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  const markers = new Set<string>();
  for (const [key, count] of counts) if (count >= MIN_MARKER_OCCURRENCES) markers.add(key);
  return markers;
}

export interface DetectedHeading extends HeadingMatch {
  /** Offset where the heading line starts. */
  lineStart: number;
}

/**
 * A single-word numbered line ("4. Bỏ rác", "5. Phân loại") is a list item far
 * more often than a section heading; a real heading carries a few words. Roman
 * numerals are exempt because `ROMAN_START` already requires a following letter
 * and "I. X" is a legitimate one-word outline entry.
 */
function isThinNumberedItem(text: string): boolean {
  const trimmed = text.trim();
  if (ROMAN_START.test(trimmed)) return false;
  if (!NUMBERED_START.test(trimmed)) return false;
  return trimmed.replace(NUMBERED_START, '').split(/\s+/).filter(Boolean).length < 2;
}

/**
 * A standalone short label a teacher would recognise as a section title:
 * title-case words only (`Khởi động`, `Mục tiêu:`, `Luyện tập`), at least two
 * words, and not a sentence — a line ending in `.` / `?` is prose. A line that
 * ends with `:` is a lead-in label even when it is a single word (`Chuẩn bị:`).
 *
 * Deliberately strict: this rule only *adds* low-confidence nodes, and a wrong
 * node is one more checkbox the teacher must clear (§3.4).
 */
export function titleCaseLabel(text: string): boolean {
  const trimmed = text.trim();
  if (!hasHeadingShape(trimmed)) return false;
  if (/[?!;]$/u.test(trimmed)) return false;
  if (/\d/u.test(trimmed) || LIST_MARKER.test(trimmed) || TABLE_SHAPE.test(trimmed)) return false;
  const leadIn = /[:：]$/.test(trimmed);
  const words = trimmed.replace(/[:：]$/, '').replace(/[.,:;!?…]/g, ' ').split(/\s+/).filter(Boolean);
  if (!words.length) return false;
  // Title case: every word starts uppercase, or all-caps ("MỤC TIÊU"). A name
  // ("Nguyễn An") is shape-identical to a label, so that case is accepted and
  // marked low-confidence like every other inferred heading.
  const upperFirst = /^[\p{Lu}\p{N}]/u;
  if (!words.every(word => upperFirst.test(word))) return false;
  // `Chuẩn bị:` / `Mục tiêu:` is a label even with one word.
  return leadIn || words.length >= 2;
}

/** The block right after `block` opens with a list marker (`-`, `•`, `1.`). */
function startsList(blocks: TextBlock[], block: TextBlock): boolean {
  const next = blocks[block.index + 1];
  const first = next && next.lines[0];
  return Boolean(first && LIST_MARKER.test(first.text.trim()));
}

/**
 * Collects headings.
 *
 * The general rules below only look at the **first line of a block**: a line that
 * is merely the first line of a multi-line paragraph is part of that paragraph,
 * which is what keeps line-wrapped prose out of the tree.
 *
 * Rule 2 is the exception, and it has to be: `pdf-parse` and `mammoth` return the
 * text with every non-empty line separated by a single `\n`, so a whole section —
 * heading, lead-in and body — arrives as ONE block. Requiring "starts a block"
 * there threw away every subsection of a real lesson (found on 2026-10-24 when a
 * nested "Hoạt động 1" vanished while "Hoạt động 2" survived). Numbering plus a
 * title shape spans tens of thousands of characters of text and cannot occur
 * inside one sentence, so it is checked on every line.
 */
export function detectHeadings(
  blocks: TextBlock[],
  hints: Map<number, OutlineHint>,
  markers: Set<string>,
  source?: string
): DetectedHeading[] {
  const headings: DetectedHeading[] = [];
  for (const block of blocks) {
    collectBlockHeadings(block, blocks, hints, markers, headings);
  }
  // `source` is optional so a caller that only wants the raw list (tests, tooling)
  // can skip the page-break pass; `buildLessonStructure` always passes it.
  const text = typeof source === 'string' ? source : '';
  return finalizeHeadings(text, headings);
}

/**
 * A line whose numbering is real but whose wording is one word is ambiguous: "4. Bỏ
 * rác" is a list item, "5. Phân loại" is not. A NUMBERED RUN is the deciding signal —
 * if the block opens with a run of small numbers (1, 2, 3…), the whole block is a
 * list, and a numbered line inside it is never a section heading, however many words
 * it carries. A lesson whose first heading is "1. MỤC TIÊU" starts at 1 too, so the
 * run only counts when at least `MIN_LIST_RUN` consecutive numbers are present.
 */
const MIN_LIST_RUN = 3;

/** `2`, `(2)`, `2.` / `2)` → 2, else null. */
function leadingListItemNumber(text: string): number | null {
  const match = /^(?:\()?(\d{1,2})[.)]\s+\p{L}/u.exec(text.trim());
  return match ? Number(match[1]) : null;
}

export function isNumberedListBlock(lines: Array<{ text: string }>): boolean {
  let expected = 1;
  let run = 0;
  for (const line of lines) {
    const number = leadingListItemNumber(line.text);
    if (number === null) {
      if (line.text.trim()) break;
      continue;
    }
    if (number !== expected) break;
    run += 1;
    expected += 1;
  }
  return run >= MIN_LIST_RUN;
}

/**
 * Collects the headings inside one block.
 *
 * Rule 2 (numbering) runs on every line; rules 1, 3 and 4 only on the first line
 * of a block (see the doc comment above). This lives in its own function because a
 * `return` inside a `forEach` callback only ends that callback — an early version
 * used `return` to mean "this line is done" and silently stopped collecting.
 */
function collectBlockHeadings(
  block: TextBlock,
  blocks: TextBlock[],
  hints: Map<number, OutlineHint>,
  markers: Set<string>,
  headings: DetectedHeading[]
): void {
  const listBlock = isNumberedListBlock(block.lines);
  for (const [position, line] of block.lines.entries()) {
    const firstLineOnly = position > 0;
    const text = line.text.trim();
    const hint = firstLineOnly ? undefined : hints.get(line.start);
    if (hint) {
      headings.push({
        title: renderTitle(hint.text || text),
        level: hint.level,
        confidence: 'high',
        kind: hint.level <= 1 ? 'section' : 'subsection',
        lineStart: line.start
      });
      continue;
    }
    if (!text || markers.has(lineKey(text))) continue;
    const hasFollowingParagraph = block.index < blocks.length - 1 || position < block.lines.length - 1;

    // 2. Numbering that implies depth. Checked *before* the content-line rule, so a
    //    numbered heading ("I. MỤC TIÊU", "Hoạt động 1: Khởi động") is not lost to
    //    `LIST_MARKER` or to the example-line heuristic.
    //
    //    NOTE: the numbering check is NOT limited to the first line of a block.
    //    `pdf-parse` and `mammoth` put a `\n` after every non-empty line, so a
    //    whole lesson section (heading + lead-in + body) is ONE block; requiring
    //    "starts a block" silently dropped every subsection of a real lesson.
    //    Numbering plus a title shape cannot occur inside one sentence, so checking
    //    every line is safe. Inside a run of one-line list items ("4. Bỏ rác",
    //    "5. Phân loại") the block is a list (`listBlock`), so nothing in it is a
    //    heading: that is what keeps a numbered list out of the tree.
    const keywordLine = HEADING_KEYWORD.test(text);
    const numbered = detectHeadingStyle(text);
    const listLine = listBlock && !keywordLine;
    if (numbered && !listLine && (keywordLine || !isThinNumberedItem(text))) {
      if (hasFollowingParagraph || numbered.confidence === 'high' || ROMAN_START.test(text)) {
        headings.push({ ...numbered, title: renderTitle(text), lineStart: line.start });
        continue;
      }
    }
    // A line inside a numbered run is a list item: never a heading, and never a
    // label either (rules 3/4 would promote "3. Ôn tập kiến thức cũ").
    if (listLine) continue;
    if (firstLineOnly) continue;
    if (isContentLine(text)) continue;

    // 3. A standalone title-case label that opens one or more paragraphs:
    //    "Khởi động" / "Mục tiêu:", or a label followed by a list
    //    ("Chuẩn bị:" then "- Giấy"). Without this the teacher loses the only
    //    structure a slide deck or a plain handout has (§3.2).
    if (titleCaseLabel(text) && (hasFollowingParagraph || startsList(blocks, block))) {
      headings.push({ title: renderTitle(text), level: 3, confidence: 'low', kind: 'subsection', lineStart: line.start });
      continue;
    }

    // 4. A short standalone line followed by a body paragraph. A short line at the
    //    very end of the document is a tail sentence, not a heading.
    if (!hasFollowingParagraph) continue;
    if (block.lines.length !== 1) continue;
    if (!hasHeadingShape(text) || LIST_MARKER.test(text)) continue;
    headings.push({ title: renderTitle(text), level: 3, confidence: 'low', kind: 'subsection', lineStart: line.start });
  }
}

/**
 * Builds the tree from the heading list: drops page-boundary repeats, then nests
 * by level. Split out of `detectHeadings` so the line loop above can live in its
 * own function.
 */
function finalizeHeadings(source: string, headings: DetectedHeading[]): DetectedHeading[] {
  // A heading that reappears *immediately* with the same title is a page boundary
  // (a PDF repeating its row header), not a new section: keep the first one so the
  // section spans both pages. A genuinely repeated title further down (a second
  // "Hoạt động 1" of the next lesson) is a real section and is kept.
  const deduped: DetectedHeading[] = [];
  for (const [index, heading] of headings.entries()) {
    const previous = deduped[deduped.length - 1];
    if (previous && previous.title === heading.title && isPageRepeat(source, previous, heading, headings[index + 1])) continue;
    deduped.push(heading);
  }
  return deduped;
}

/**
 * How far a page-boundary repeat may sit from the heading it repeats, and how much
 * text may sit between them. A PDF that repeats a section title after a page break
 * repeats it at the very top of the next page, and nothing else changes: the body
 * just continues. Two "IV. Tổng kết" that are separated by their own bodies are two
 * real sections.
 */
const MAX_PAGE_REPEAT_LINES = 1;
const MAX_PAGE_REPEAT_CHARS = 400;

/**
 * Are these two identical titles ONE section split by a page break? True only when
 * the repeat follows the previous one almost immediately — no other heading, no
 * paragraph of its own in between. A repeated title further down is a second,
 * separate section and must stay selectable: dropping it removed every "Hoạt động 1"
 * after the first one in a real lesson (measured 2026-10-24).
 *
 * Without `source` the gap can only be measured in the heading list itself, which
 * is still enough: two consecutive identical titles with nothing between them are a
 * page break, two identical titles with any other heading between them are not.
 */
/**
 * Whole-document view of a heading's section for the page-break decision: how many
 * non-blank lines lie between the two identical titles. 1 means they are adjacent
 * (one title follows the other line by line), 2 means the first section already has
 * one line of its own body — two sections, not one split by a page break.
 */
function nonBlankLinesBetween(source: string, from: number, to: number): number {
  return source.slice(from, to).split('\n').filter(line => line.trim()).length;
}

/**
 * Are these two identical titles ONE section split by a page break? True only when
 * the repeat sits immediately after the previous title — nothing but the title line
 * (and, with a page number, one more line) in between. A repeated title further down
 * is a second, separate section and must stay selectable: dropping it removed every
 * "Hoạt động 1" after the first one in a real lesson (measured 2026-10-24).
 *
 * Without `source` the gap can only be measured in the heading list itself: two
 * consecutive identical titles with no other heading between them are one section.
 */
function isPageRepeat(
  source: string,
  previous: DetectedHeading,
  heading: DetectedHeading,
  neighbour?: DetectedHeading
): boolean {
  const gap = heading.lineStart - previous.lineStart;
  if (gap <= 0) return true;
  if (gap > MAX_PAGE_REPEAT_CHARS) return false;
  if (!source) return !neighbour || neighbour.lineStart >= heading.lineStart;
  return nonBlankLinesBetween(source, previous.lineStart, heading.lineStart) <= MAX_PAGE_REPEAT_LINES;
}

// ---------------------------------------------------------------------------
// Tree assembly
// ---------------------------------------------------------------------------

function makeNode(input: Omit<LessonSectionNode, 'children' | 'characters' | 'empty'>): LessonSectionNode {
  return {
    ...input,
    children: [],
    characters: Math.max(0, input.charEnd - input.charStart),
    empty: input.charEnd <= input.charStart
  };
}

/** Depth-first flat view of a tree, parents before children. */
export function flatten(root: LessonSectionNode): LessonSectionNode[] {
  const nodes: LessonSectionNode[] = [];
  const walk = (node: LessonSectionNode): void => {
    nodes.push(node);
    node.children.forEach(walk);
  };
  walk(root);
  return nodes;
}

/**
 * Builds the structure of `rawText`. Never throws (§3.5): any failure returns one
 * whole-document node plus `degradedReason`, so the teacher can still analyze and
 * the log can explain what happened.
 */
export function buildLessonStructure(rawText: string, options: BuildStructureOptions = {}): LessonStructure {
  const source = normalizeLessonSource(rawText ?? '');
  try {
    const blocks = buildBlocks(splitSourceLines(source));
    const markers = repeatedMarkers(blocks);
    const hints = new Map<number, OutlineHint>();
    for (const hint of options.headings || []) {
      const charStart = Math.max(0, Math.round(Number(hint.charStart) || 0));
      const level = Number(hint.level);
      hints.set(charStart, {
        text: String(hint.text ?? ''),
        level: level >= 1 && level <= 6 ? Math.round(level) : 2,
        charStart
      });
    }

    const root = makeNode({
      id: 'sec_0',
      title: 'Toàn bộ tài liệu',
      level: 0,
      kind: 'document',
      charStart: 0,
      charEnd: source.length,
      confidence: 'high'
    });

    const headings = detectHeadings(blocks, hints, markers, source);
    if (headings.length) attachHeadings(root, headings, source.length);
    else root.children = fallbackNodes(blocks, markers);

    return finalize(source, root, headings.length);
  } catch (error) {
    return degradedStructure(source, error);
  }
}

/**
 * Ranges for a heading list, as a stack of enclosing headings.
 *
 * A section runs from its own title line to the end of its last descendant, so it
 * always CONTAINS its children — ticking "III. TIẾN TRÌNH" sends the activity
 * subsections. Two headings that are not each other's ancestor never overlap, and the
 * last section reaches the end of the source, so no paragraph is unselectable.
 */
export function headingRanges(headings: DetectedHeading[], sourceLength: number): Array<{ end: number; depth: number }> {
  const stack: DetectedHeading[] = [];
  const ends = new Map<DetectedHeading, number>();
  const depths = new Map<DetectedHeading, number>();
  // A new heading closes every open heading at the same or deeper level, and it
  // EXTENDS every ancestor still open: "Hoạt động 2" moves the end of its parent
  // "III. TIẾN TRÌNH DẠY HỌC" too. Extending only the innermost open heading was the
  // bug: a parent then ended at its first child's start and ticking it sent just its
  // title. A heading never extends itself, so a parent's first child starts *after*
  // the parent's own title line (character 261 vs 285 in the fixture).
  const close = (heading: DetectedHeading, end: number) => ends.set(heading, Math.max(end, heading.lineStart));
  for (const heading of headings) {
    while (stack.length && stack[stack.length - 1].level >= heading.level) close(stack.pop() as DetectedHeading, heading.lineStart);
    for (const open of stack) close(open, heading.lineStart);
    depths.set(heading, stack.length);
    stack.push(heading);
  }
  for (const heading of stack) close(heading, sourceLength);
  return headings.map(heading => ({ end: ends.get(heading) as number, depth: depths.get(heading) as number }));
}

function attachHeadings(root: LessonSectionNode, headings: DetectedHeading[], sourceLength: number): void {
  const stack: LessonSectionNode[] = [root];
  const ranges = headingRanges(headings, sourceLength);
  headings.forEach((heading, index) => {
    const { end: charEnd } = ranges[index];
    const node = makeNode({
      // `sec_0` would collide with the document root: a lesson whose FIRST line is
      // already its heading (no title block) then resolved to the root, and the
      // selection produced empty text. Heading ids are always distinguishable.
      id: heading.lineStart === 0 ? 'sec_0h' : `sec_${heading.lineStart}`,
      title: heading.title,
      level: Math.max(1, Math.min(6, heading.level)),
      kind: heading.kind,
      charStart: heading.lineStart,
      charEnd,
      confidence: heading.confidence
    });
    while (stack.length > 1 && stack[stack.length - 1].level >= node.level) stack.pop();
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  });
}

/**
 * Paragraph nodes for a document with no detectable heading (§3.2).
 *
 * Consecutive *short* blocks are packed into one node first: a multi-column or
 * tabular PDF emits one fragment per line ("20 phút", "Khởi", "động", …), so
 * without packing each node would be a few words from unrelated cells.
 */
function fallbackNodes(blocks: TextBlock[], markers: Set<string>): LessonSectionNode[] {
  const isFragmented = (block: TextBlock): boolean =>
    block.lines.every(line => line.text.trim().length <= SHORT_LINE_CHARS);

  const runs: TextBlock[][] = [];
  for (const block of blocks) {
    const last = runs[runs.length - 1];
    if (isFragmented(block) && last && last.every(isFragmented)) last.push(block);
    else runs.push([block]);
  }

  const nodes: LessonSectionNode[] = [];
  let group: TextBlock[] = [];
  const flush = (): void => {
    if (!group.length) return;
    const lines = group.flatMap(block => block.lines);
    const kinds = lines.map(line => classifyLine(line.text)).filter(Boolean) as SectionKind[];
    const kind: SectionKind = kinds.includes('table-row') ? 'table-row'
      : kinds.includes('question') ? 'question'
        : kinds.includes('list-item') ? 'list-item'
          : 'section';
    nodes.push(makeNode({
      id: `sec_${group[0].start}`,
      title: paragraphTitle(lines[0], nodes.length, markers),
      level: 1,
      kind,
      charStart: group[0].start,
      charEnd: group[group.length - 1].end,
      confidence: 'low'
    }));
    group = [];
  };

  for (const run of runs) {
    // A fragmented run is never split: cutting it would separate two halves of
    // one table cell without the teacher seeing that they belong together.
    const collapsed: TextBlock = {
      index: run[0].index,
      start: run[0].start,
      end: run[run.length - 1].end,
      lines: run.flatMap(block => block.lines)
    };
    if (group.length && collapsed.end - group[0].start > FALLBACK_BLOCK_CHARS) flush();
    group.push(collapsed);
  }
  flush();
  return nodes;
}

function paragraphTitle(line: SourceLine, index: number, markers: Set<string>): string {
  const text = line.text.trim();
  // A repeated page header is always the first line of the node it lands in, so
  // it must never become the node's title.
  if (text && !markers.has(lineKey(text)) && !isAdministrativeLine(text)) return renderTitle(text);
  return `Đoạn ${index + 1}`;
}

function finalize(source: string, root: LessonSectionNode, headingsFound: number): LessonStructure {
  let lowConfidence = 0;
  const walk = (node: LessonSectionNode): void => {
    if (node !== root && node.confidence === 'low') lowConfidence += 1;
    // A parent's range covers its children, so it is never "empty" merely
    // because it holds no prose of its own.
    node.empty = !node.children.length && !source.slice(node.charStart, node.charEnd).trim();
    node.children.forEach(walk);
  };
  walk(root);

  // §3.4: a tree the UI cannot render is not a structure. Two caps, both reported:
  //  - per level: no heading gets more than `MAX_STRUCTURE_NODES` children (that is
  //    the wall of checkboxes a teacher has to scan);
  //  - in total: no more than `MAX_STRUCTURE_TOTAL_NODES`, because depth can add up.
  // The root is always kept, so nothing is orphaned.
  let truncated = false;
  const capLevel = (node: LessonSectionNode): void => {
    if (node.children.length > MAX_STRUCTURE_NODES) {
      node.children = node.children.slice(0, MAX_STRUCTURE_NODES);
      truncated = true;
    }
    node.children.forEach(capLevel);
  };
  capLevel(root);
  if (flatten(root).length > MAX_STRUCTURE_TOTAL_NODES) {
    truncated = true;
    const parents = new Map<string, string>();
    const indexParents = (node: LessonSectionNode): void => node.children.forEach(child => {
      parents.set(child.id, node.id);
      indexParents(child);
    });
    indexParents(root);
    const keep = new Set<string>([root.id]);
    for (const node of flatten(root)) {
      if (keep.size >= MAX_STRUCTURE_TOTAL_NODES) break;
      for (let id: string | undefined = node.id; id && !keep.has(id); id = parents.get(id)) keep.add(id);
    }
    const prune = (node: LessonSectionNode): void => {
      node.children = node.children.filter(child => keep.has(child.id));
      node.children.forEach(prune);
    };
    prune(root);
  }

  const empty = source.trim().length < NO_TEXT_LAYER_MIN_CHARS;
  return {
    version: LESSON_STRUCTURE_VERSION,
    textLength: source.length,
    root,
    nodes: flatten(root),
    headingsFound,
    lowConfidence,
    empty,
    ...(empty ? { reason: 'no_text' as const } : truncated ? { reason: 'too_many_nodes' as const } : {})
  };
}

function degradedStructure(source: string, error?: unknown): LessonStructure {
  const root = makeNode({
    id: 'sec_0',
    title: 'Toàn bộ tài liệu',
    level: 0,
    kind: 'document',
    charStart: 0,
    charEnd: source.length,
    confidence: 'low'
  });
  const empty = source.trim().length < NO_TEXT_LAYER_MIN_CHARS;
  return {
    version: LESSON_STRUCTURE_VERSION,
    textLength: source.length,
    root,
    nodes: [root],
    headingsFound: 0,
    lowConfidence: 1,
    empty,
    ...(empty ? { reason: 'no_text' as const } : {}),
    degraded: true,
    degradedReason: error instanceof Error ? `${error.name}: ${error.message}` : String(error ?? 'UNKNOWN')
  };
}
