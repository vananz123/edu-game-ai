/**
 * O6d: lightweight, offline preprocessor for the lesson text that
 * `lesson:analyze` sends to the local model.
 *
 * Three independent layers, so each one can be rolled back on its own:
 *
 *   L1 (always on)  Unicode NFC, invalid control characters, BOM, CRLF, NBSP,
 *                   trailing spaces, runs of blank lines, and *safely*
 *                   detected repeated header/footer lines.
 *   L2 (always on)  Structure-aware excerpt: cut on a block boundary instead
 *                   of a raw character offset, with a per-mode budget.
 *   L3 (OFF by default, see `LESSON_PREPROCESS_RANKING_ENABLED`)  Block
 *                   ranking that keeps tables/numerals/formulas/questions/
 *                   answers and drops low-utility prose when the document
 *                   exceeds the budget.
 *
 * L3 is the only layer that changes *which* content the model reads, so it
 * must pass the O6 quality gate (docs/ROADMAP.md) before being enabled. While
 * it stays off, `preprocessLessonSource` still *measures* how much it would
 * save (`metrics.rankingSavingsChars`) without touching the text, so real
 * numbers are collected before a decision is made.
 *
 * Hard rules:
 *  - never calls AI, never touches the stored document, no dependencies;
 *  - preserves tables, numerals, formulas, examples, scenarios, questions,
 *    answers and explanations;
 *  - on any internal error, returns the input unchanged with `metrics.error`
 *    set: preprocessing must never be the reason an analysis fails.
 *
 * Pure and deterministic, so it is unit-tested directly.
 */

/**
 * Bump whenever L1/L2/L3 change what the model would read. It is mixed into
 * the analysis cache key (`lesson-cache.ts`), so a bump invalidates cached
 * analyses without a SQLite migration.
 */
export const LESSON_PREPROCESS_VERSION = 2;

/**
 * O6 gate: L3 block ranking stays off until 6/6 lessons and 8/8 items pass in
 * one attempt with the ranking enabled. See docs/DECISIONS.md.
 */
export const LESSON_PREPROCESS_RANKING_ENABLED = false;

/** Character budget for the excerpt, per analysis mode. */
export const LESSON_PREPROCESS_BUDGET_FAST = 12_000;
export const LESSON_PREPROCESS_BUDGET_DEEP = 18_000;

/** A repeated line is only removed when it is short enough to be a header. */
const MAX_REPEATED_LINE_LENGTH = 80;
/** ... and only when it occurs at least this many times in the document. */
const MIN_REPEATED_OCCURRENCES = 3;
/** Search window used to find a block boundary near the cut offset. */
const BOUNDARY_SEARCH_CHARS = 600;

const ELLIPSIS_MARKER = '\n\n[Đã lược bớt phần giữa của tài liệu để AI local xử lý nhanh hơn.]\n\n';
/** Marker used when L3 drops ranked-out blocks. */
const RANKED_OMIT_MARKER = '\n\n[Đã lược bớt một phần ít trọng tâm]\n';

/** C0/C1 controls except TAB (09) and LF (0A), plus BOM. */
const INVALID_CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\uFEFF]/g;
const BOM = /\uFEFF/g;
/** A line that starts a real section; never removed as a "repeated header". */
const STRUCTURED_LINE = /^(phần|chương|bài|hoạt động|mục|câu|bảng|hình|ví dụ|ghi nhớ|luyện tập|thực hành|đáp án|giải thích)\b/i;
/** `1.`, `2)`, `a.`, `I.`, `-` / `•` bullets: structure, not boilerplate. */
const NUMBERED_LINE = /^\s*(\d+|[ivxlcdm]+|[a-zđ])[.)]\s|^\s*[-•*+](\s|$)/i;
/**
 * A sentence ending in `;:.!?` is prose (a continuation line, a closing phrase),
 * never a page header or footer.
 */
const SENTENCE_END = /[;:.!?…]["'”’)\]]?$/u;
/**
 * A line that can plausibly be a page header/footer: mostly uppercase (the
 * decision is case-insensitive, diacritics preserved), or short and without
 * sentence punctuation. A lowercase word like `kiến thức` is real content.
 */
const HEADER_SHAPE = /^[\p{Lu}\p{N}\p{P}\p{Zs}]+$/u;
/** A lone bullet/dash left on its own line by PDF text extraction. */
const LONE_BULLET = /^\s*[-–—•*+]$/u;
/** Definition-ish wording: a block carrying it is pedagogically useful. */
const DEFINITION_HINT = /(?:^|[^\p{L}])(?:là|gồm|có nghĩa|được gọi|bao gồm|khái niệm)(?!\p{L})/iu;
/** Answers/explanations: always kept. Unicode-safe (no `\b` before `Đ`). */
const ANSWER_HINT = /(?:^|[^\p{L}])(?:đáp án|giải thích|lời giải)(?!\p{L})/iu;
/** Units that make a number a *fact* worth keeping. */
const NUMERIC_UNIT = /\d+\s*(%|°|cm|mm|km|kg|mg|ml|lít|m²|km²|giây|phút|giờ|năm|triệu|tỉ|nghìn|đồng|vôn|ampe|watt|°c|celsius)/i;

export interface PreprocessOptions {
  /**
   * Excerpt budget in characters. Defaults to the fast-mode budget. Always pass
   * a number (`preprocessBudgetForMode(mode)`); `PreprocessOptions` has no
   * `mode` field on purpose — see the note on `preprocessLessonSource`.
   */
  maxChars?: number;
  /**
   * Overrides `LESSON_PREPROCESS_RANKING_ENABLED`; used by tests and the O6 gate.
   *
   * Since #58 leaving it `undefined` means "rank when a `query` is given, else
   * keep head+tail": a ranking without a query is unsupervised, and at analysis
   * time there is no query yet.
   */
  ranking?: boolean;
  /**
   * #58: supervised ranking signal (topic, focus objectives, key concepts of an
   * existing analysis, or the retrieval query of one item). When present and
   * ranking is not explicitly disabled, the excerpt is chosen by relevance to
   * this text inside the same character budget.
   *
   * Because the ranked excerpt differs from head+tail, the query of every call
   * ends up in the prompt: a lesson plan hero and a lesson plan summary must not
   * share cached content.
   */
  query?: string;
}

export type ExcerptReason = 'fits' | 'head-tail' | 'ranked' | 'ranked-query';

export interface PreprocessMetrics {
  version: number;
  /** Wall-clock time spent in preprocessing. */
  ms: number;
  originalChars: number;
  /** Length after L1 (no excerpt applied). */
  cleanedChars: number;
  /** Length the model will actually receive. */
  excerptChars: number;
  removedControl: number;
  removedBlankRuns: number;
  removedRepeatedLines: number;
  truncated: boolean;
  excerptReason: ExcerptReason;
  /** Characters L3 would have saved. Measured even while L3 is disabled. */
  rankingSavingsChars: number;
  /** Set when the input was returned unchanged because preprocessing failed. */
  error?: string;
}

export interface PreprocessResult {
  /** Final text for the prompt (L1 + L2, plus L3 when enabled). */
  text: string;
  /** L1 output, before any excerpt step. */
  cleaned: string;
  /** True when `text` differs from the raw input. */
  changed: boolean;
  metrics: PreprocessMetrics;
}

interface Block {
  text: string;
  heading: boolean;
}

// ---------------------------------------------------------------------------
// L1: normalisation
// ---------------------------------------------------------------------------

/**
 * Unicode/whitespace/control-character normalisation plus safe removal of
 * repeated header/footer lines. Keeps every meaningful character, including
 * Vietnamese diacritics (NFC is requested, never NFD-and-strip).
 */
export function cleanLessonSource(raw: string): {
  text: string;
  removedControl: number;
  removedBlankRuns: number;
  removedRepeatedLines: number;
} {
  const source = String(raw ?? '');
  const controlMatches = source.match(INVALID_CONTROL);
  const removedControl = controlMatches ? controlMatches.length : 0;

  let text = source
    .normalize('NFC')
    .replace(BOM, '')
    .replace(INVALID_CONTROL, '')
    .replace(/\r\n?/g, '\n')
    // NBSP / narrow NBSP / figure space -> ordinary space.
    .replace(/[\u00A0\u202F\u2007]/g, ' ')
    .replace(/\t/g, ' ');

  // Collapse intra-line runs of spaces but never touch line breaks: Markdown
  // tables, question/answer lines and formula blocks depend on them. A
  // whitespace-only line becomes empty so blank-line runs collapse properly.
  text = text
    .split('\n')
    .map(line => (line.trim() ? line.replace(/ {2,}/g, ' ').trim() : ''))
    .join('\n');

  let removedBlankRuns = 0;
  text = text.replace(/\n{3,}/g, () => {
    removedBlankRuns += 1;
    return '\n\n';
  });

  const repeated = removeRepeatedHeaders(text.split('\n'));
  return {
    text: repeated.lines.join('\n').trim(),
    removedControl,
    removedBlankRuns,
    removedRepeatedLines: repeated.removed
  };
}

/**
 * Removes only lines that are provably boilerplate: short, identical, seen at
 * least `MIN_REPEATED_OCCURRENCES` times, shaped like a page header/footer
 * (uppercase or a short fragment without sentence punctuation), and not
 * structural (no section heading, no numbering, no question/answer/formula/
 * number, no prose).
 *
 * Two real-document failures shaped these rules (see docs/BENCHMARKS.md §O6e):
 * a 2-column PDF repeats every cell, and a PDF splits a bullet from its text, so
 * "repeated" alone must never be enough to delete a line, and a lone "-" must be
 * re-joined rather than dropped.
 *
 * The first occurrence is kept, so a document with a genuine repeated section
 * title still reads correctly.
 */
function removeRepeatedHeaders(lines: string[]): { lines: string[]; removed: number } {
  const counts = new Map<string, number>();
  for (const line of lines) {
    const key = line.trim();
    if (!key || key.length > MAX_REPEATED_LINE_LENGTH) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const seen = new Set<string>();
  const kept: string[] = [];
  let removed = 0;
  let pendingBullet = '';
  for (const line of lines) {
    const key = line.trim();
    if (LONE_BULLET.test(key)) {
      // A PDF often puts the dash on its own line; keep it and put it in front
      // of the text it belongs to (deleting it would glue words together).
      pendingBullet += key;
      continue;
    }
    if (pendingBullet) {
      kept.push(`${pendingBullet}${line}`);
      pendingBullet = '';
      continue;
    }
    const count = key ? counts.get(key) ?? 0 : 0;
    const isCandidate =
      key.length > 0 &&
      key.length <= MAX_REPEATED_LINE_LENGTH &&
      count >= MIN_REPEATED_OCCURRENCES &&
      !isProtectedLine(key) &&
      isHeaderLike(key);
    if (!isCandidate) {
      kept.push(line);
      continue;
    }
    if (seen.has(key)) {
      removed += 1;
      continue;
    }
    seen.add(key);
    kept.push(line);
  }
  return { lines: kept, removed };
}

/**
 * True when a short repeated line could be a page header/footer:
 * - uppercase-dominant (`TÀI LIỆU CHƯƠNG TRÌNH…`);
 * - or mostly title case without a sentence end (`Giáo án Khoa học 6` — the
 *   "án" word starts with a lowercase tone-marked letter, so a 50% threshold
 *   would reject real headers);
 * - or a very short stamp (`Trang`, `12`).
 *
 * Lowercase words and multi-word fragments come from 2-column PDFs splitting
 * cells ("kiến thức", "mới") and are content, not headers.
 *
 * Capitalisation is tested by comparing against the lowercase form after
 * stripping diacritics: `toUpperCase()` of a tone-marked syllable returns a
 * decomposed (NFD) capital, so `'Á'.toLowerCase() !== 'á'` for Vietnamese input.
 */
export function isHeaderLike(key: string): boolean {
  if (HEADER_SHAPE.test(key)) return true;
  if (SENTENCE_END.test(key)) return false;
  const words = key.split(/\s+/).filter(Boolean);
  const capitalised = words.filter(isCapitalisedWord).length;
  // At least two capitalised words AND a decent share: "Khám phá" (1 of 2) is a
  // content heading repeated per activity, "Giáo án Khoa học 6" (2 of 5) is a page header.
  if (capitalised >= 2 && capitalised / words.length >= 0.4) return true;
  if (words.length > 1) return false;
  return key.length <= 12 && capitalised === 1;
}

const DIACRITICS = /[\u0300-\u036f]/g;
const fold = text => text.normalize('NFD').replace(DIACRITICS, '').toLowerCase();

/**
 * `Giáo` -> true, `án` -> false, `6` -> false, `Khoa` -> true, `THCS` -> true.
 *
 * A word counts as capitalised when its first letter is already uppercase and
 * the rest is lowercase. Folding to NFD+lowercase makes this work for
 * Vietnamese: `'á'` folds to `'a'`, `'Á'` also folds to `'a'`, but `'á'` is a
 * fixed point of `toUpperCase()` while `'Á'` is not — `\p{Lu}` alone cannot be
 * used because tone-marked Vietnamese capitals decompose.
 */
function isCapitalisedWord(word: string): boolean {
  const letters = word.match(/\p{L}/gu);
  if (!letters || !letters.length) return false;
  const [first, ...rest] = letters;
  const firstIsUppercase = fold(first.toUpperCase()) === fold(first) && first.toUpperCase() !== first.toLowerCase()
    && first === first.toUpperCase();
  if (!firstIsUppercase) return false;
  return rest.every(letter => letter === letter.toLowerCase());
}

/**
 * A line must never be dropped as boilerplate when it could carry content.
 * Erring towards "keep" is deliberate: missing source is a content bug,
 * extra characters are only a speed cost.
 */
export function isProtectedLine(line: string): boolean {
  if (STRUCTURED_LINE.test(line) || NUMBERED_LINE.test(line)) return true;
  if (line.includes('|')) return true; // table row
  if (/[?？]/.test(line)) return true; // question
  if (/[=→⇒√²³×÷℃≤≥]/.test(line)) return true; // formula
  if (NUMERIC_UNIT.test(line)) return true; // measured fact
  if (/\d[.,]\d/.test(line)) return true; // decimal number
  if (ANSWER_HINT.test(line)) return true;
  if (/[a-zà-ỹ]{4,}/u.test(line) && SENTENCE_END.test(line)) return true; // prose sentence
  if (/\b(ví dụ|kết luận|nhận xét)\b/i.test(line)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// L2 / L3: excerpt selection
// ---------------------------------------------------------------------------

/** Splits on blank lines; each block keeps its inner line breaks. */
function splitBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of text.split(/\n[ \t]*\n/)) {
    const block = raw.replace(/\n+$/, '').trim();
    if (!block) continue;
    const lines = block.split('\n');
    const single = lines.length === 1;
    blocks.push({
      text: block,
      heading: single && block.length <= MAX_REPEATED_LINE_LENGTH && !/[.!?…:;]$/.test(block)
    });
  }
  return blocks;
}

/**
 * How strongly a block must be kept. `Infinity` means "never drop": tables,
 * formulas, questions, answers/explanations and measured numbers.
 */
export function blockValue(block: string): number {
  const lines = block.split('\n');
  const isTable = lines.length >= 2 && lines.some(line => line.includes('|'));
  if (isTable) return Number.POSITIVE_INFINITY;
  if (/[=→⇒√²³×÷℃≤≥]/.test(block)) return Number.POSITIVE_INFINITY;
  if (/[?？]/.test(block)) return Number.POSITIVE_INFINITY;
  if (ANSWER_HINT.test(block)) return Number.POSITIVE_INFINITY;
  if (NUMERIC_UNIT.test(block)) return Number.POSITIVE_INFINITY;

  let value = 0;
  if (lines.length === 1 && block.length <= MAX_REPEATED_LINE_LENGTH && !/[.!?…:;]$/.test(block)) value += 3;
  if (block.length >= 80 && block.length <= 1_200) value += 2;
  if (DEFINITION_HINT.test(block)) value += 1;
  if (/\b(ví dụ|tình huống|bài tập|luyện tập|thực hành)\b/i.test(block)) value += 1;
  return value;
}

/**
 * L3: keeps the highest-value blocks in original order until the budget is
 * reached. Protected blocks are always kept; a protected block larger than the
 * remaining budget is split on its own line boundaries so a table keeps at
 * least its header row.
 */
export function rankBlocksForExcerpt(text: string, maxChars: number): string {
  const blocks = splitBlocks(text);
  if (!blocks.length) return text;

  const budget = Math.max(200, Math.floor(maxChars));
  const scored = blocks.map((block, index) => ({ ...block, index, value: blockValue(block.text) }));
  const chosen = new Set<number>();
  let used = 0;

  for (const block of scored) {
    if (block.value !== Number.POSITIVE_INFINITY) continue;
    const cost = block.text.length + 2;
    if (used + cost <= budget) {
      chosen.add(block.index);
      used += cost;
    }
  }

  const optional = scored
    .filter(block => block.value !== Number.POSITIVE_INFINITY)
    .sort((left, right) => right.value - left.value || left.index - right.index);
  for (const block of optional) {
    const cost = block.text.length + 2;
    if (used + cost > budget) continue;
    chosen.add(block.index);
    used += cost;
  }

  const parts: string[] = [];
  let droppedAny = false;
  for (const block of scored) {
    if (chosen.has(block.index)) {
      parts.push(block.text);
      continue;
    }
    droppedAny = true;
    // A protected block that did not fit keeps its leading lines rather than
    // vanishing entirely (a table without its header row is unusable).
    if (block.value !== Number.POSITIVE_INFINITY) continue;
    const room = budget - used;
    if (room <= 120) continue;
    let slice = '';
    for (const line of block.text.split('\n')) {
      if (slice.length + line.length + 1 > room) break;
      slice += (slice ? '\n' : '') + line;
    }
    if (slice.length >= 60) {
      parts.push(slice);
      used += slice.length + 2;
    }
  }

  const kept = parts.join('\n\n');
  const body = kept.length > budget ? cutAtBoundary(kept, budget).text : kept;
  return droppedAny ? `${body}${RANKED_OMIT_MARKER}`.trimEnd() : body;
}

/**
 * Query tokens for ranking. Reuses the NFD fold used for header detection so
 * `Đ`/`đ` and tone-marked forms compare equal, strips a small stop-word list and
 * single characters (`-`, `:`) that carry no topic.
 */
const QUERY_STOP_WORDS = new Set([
  'và', 'của', 'các', 'cho', 'với', 'là', 'một', 'những', 'được', 'trong',
  'khi', 'để', 'có', 'này', 'đó', 'thì', 'người', 'học', 'sinh', 'giáo', 'viên'
]);

export function queryTokensForRanking(query: string): Set<string> {
  const tokens = String(query ?? '')
    .normalize('NFC')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map(token => fold(token))
    .filter(token => token.length >= 2 && !QUERY_STOP_WORDS.has(token));
  return new Set(tokens);
}

/**
 * #58: supervised L3 — relevance to a teacher-side query (topic / objectives /
 * key concepts / the query of one draft item) inside the same budget.
 *
 * Scoring is deliberately simple and explainable, in the style of
 * `lesson-retrieval.ts#scoreChunksLexically`: count distinct query tokens found
 * in the block, weight them by field the query came from (topic repeats, so it
 * weighs more automatically), then add the structural prior from `blockValue`
 * divided by a small constant. `blockValue === Infinity` blocks (tables,
 * formulas, questions, answers, measured numbers) are kept unconditionally, as
 * in the unsupervised path: dropping a lesson's question list is never right.
 *
 * Returns `null` when no query block matches at all — the caller then falls back
 * to head+tail instead of shipping a "ranked" excerpt that is really arbitrary.
 */
export function rankBlocksForQuery(text: string, maxChars: number, query: string): string | null {
  const queryTokens = queryTokensForRanking(query);
  if (!queryTokens.size) return null;

  const blocks = splitBlocks(text);
  if (!blocks.length) return null;
  const budget = Math.max(200, Math.floor(maxChars));
  const scored = blocks.map((block, index) => ({
    ...block,
    index,
    value: blockValue(block.text),
    hits: countQueryHits(block.text, queryTokens)
  }));

  // No block mentions anything the teacher asked for: relevance ranking has no
  // signal here, so head+tail (which at least keeps the lesson statement) wins.
  if (!scored.some(block => block.hits > 0)) return null;

  const chosen = new Set<number>();
  let used = 0;

  for (const block of scored) {
    if (block.value !== Number.POSITIVE_INFINITY) continue;
    const cost = block.text.length + 2;
    if (used + cost <= budget) {
      chosen.add(block.index);
      used += cost;
    }
  }

  const optional = scored
    .filter(block => block.value !== Number.POSITIVE_INFINITY)
    .sort((left, right) => {
      const leftRank = rankingScore(left.hits, left.value);
      const rightRank = rankingScore(right.hits, right.value);
      return rightRank - leftRank || left.index - right.index;
    });
  for (const block of optional) {
    const cost = block.text.length + 2;
    if (used + cost > budget) continue;
    chosen.add(block.index);
    used += cost;
  }

  const kept = scored.filter(block => chosen.has(block.index)).map(block => block.text);
  if (!kept.length) return null;
  const body = kept.join('\n\n');
  const cut = body.length > budget ? cutAtBoundary(body, budget).text : body;
  return `${cut}${RANKED_OMIT_MARKER}`.trimEnd();
}

/** Relevance first, structural prior as a tie-breaker. */
function rankingScore(hits: number, value: number): number {
  return hits * 10 + (Number.isFinite(value) ? value : 0) / 4;
}

function countQueryHits(text: string, queryTokens: Set<string>): number {
  const found = new Set<string>();
  for (const token of text.normalize('NFC').toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    const folded = fold(token);
    if (queryTokens.has(folded)) found.add(folded);
  }
  return found.size;
}

/**
 * L2: cuts on a block/line boundary near `maxChars`, never in the middle of a
 * line. Falls back to the exact offset when no boundary is close enough.
 */
export function cutAtBoundary(text: string, maxChars: number): { text: string; cut: boolean } {
  const budget = Math.max(1, Math.floor(maxChars));
  if (text.length <= budget) return { text, cut: false };
  const floor = Math.max(0, budget - BOUNDARY_SEARCH_CHARS);
  const window = text.slice(floor, budget);
  const newline = window.lastIndexOf('\n');
  if (newline >= 0) {
    const offset = floor + newline;
    if (offset > budget * 0.5) return { text: text.slice(0, offset).trimEnd(), cut: true };
  }
  const sentenceEnd = Math.max(window.lastIndexOf('. '), window.lastIndexOf('? '), window.lastIndexOf('! '));
  if (sentenceEnd >= 0) {
    const offset = floor + sentenceEnd + 1;
    if (offset > budget * 0.5) return { text: text.slice(0, offset).trimEnd(), cut: true };
  }
  return { text: text.slice(0, budget), cut: true };
}

/** Mirror of `cutAtBoundary` that keeps the end of the text. */
function tailAtBoundary(text: string, maxChars: number): string {
  const budget = Math.max(1, Math.floor(maxChars));
  if (text.length <= budget) return text;
  const from = Math.max(0, text.length - budget);
  const window = text.slice(from, Math.min(text.length, from + BOUNDARY_SEARCH_CHARS));
  const newline = window.indexOf('\n');
  if (newline >= 0) return text.slice(from + newline + 1).trim();
  const sentenceEnd = window.indexOf('. ');
  if (sentenceEnd >= 0) return text.slice(from + sentenceEnd + 2).trim();
  return text.slice(from).trim();
}

/**
 * Budget when the document does not fit: keep the head (topic, objectives,
 * context) and the tail (summary, exercises), drop only the middle — the same
 * trade-off the previous implementation made, now on block boundaries.
 *
 * Why head+tail rather than "most relevant": at analysis time there is no
 * teacher query yet, so any relevance ranking here would be unsupervised.
 * Head+tail is the conservative choice that keeps the part of a lesson plan
 * that states what the lesson teaches.
 */
export function buildHeadTailExcerpt(text: string, maxChars: number): { text: string; cut: boolean } {
  const budget = Math.max(1, Math.floor(maxChars) - ELLIPSIS_MARKER.length);
  if (text.length <= Math.floor(maxChars)) return { text, cut: false };
  const startLength = Math.floor(budget * 0.67);
  const head = cutAtBoundary(text, startLength);
  const tail = tailAtBoundary(text, budget - head.text.length);
  return { text: `${head.text}${ELLIPSIS_MARKER}${tail}`, cut: true };
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

/**
 * Full pipeline. Never throws: on failure the raw text is returned unchanged
 * and `metrics.error` explains why.
 *
 * NOTE: there is no `mode` option. A caller that passes `{ mode: 'deep' }` by
 * mistake gets the fast budget silently (`Number(undefined)` is `NaN`), which
 * is exactly the kind of quiet truncation this module exists to prevent, so
 * tests assert the resulting `excerptChars` for both budgets instead.
 *
 * #58 selection order:
 *  1. the document fits — nothing to choose, `fits`;
 *  2. a `query` was given and some block mentions it — supervised ranking
 *     (`ranked-query`), same character budget;
 *  3. otherwise head+tail (`head-tail`): at analysis time no query exists, and
 *     an unsupervised ranking of a lesson plan is a guess, not a decision.
 *     `ranking: true` without a query still forces the unsupervised L3 path for
 *     the O6 gate (`ranked`).
 */
export function preprocessLessonSource(raw: string, options: PreprocessOptions = {}): PreprocessResult {
  const startedAt = Date.now();
  const source = String(raw ?? '');
  const requestedBudget = Number(options.maxChars);
  const maxChars = Number.isFinite(requestedBudget)
    ? Math.max(200, Math.round(requestedBudget))
    : LESSON_PREPROCESS_BUDGET_FAST;
  const query = String(options.query ?? '').trim();
  const rankingExplicit = options.ranking === undefined ? null : Boolean(options.ranking);
  // An explicit `ranking: false` always wins; an explicit `true` keeps the gate
  // behaviour (unsupervised when no query); `undefined` ranks only with a query.
  const ranking = rankingExplicit === false
    ? 'off'
    : query && rankingExplicit !== true && queryTokensForRanking(query).size
      ? 'query'
      : rankingExplicit === true || LESSON_PREPROCESS_RANKING_ENABLED
        ? 'unsupervised'
        : 'off';

  try {
    const cleanedResult = cleanLessonSource(source);
    const cleaned = cleanedResult.text;

    // L3 is measured even while disabled, so real savings can be reported
    // before the gate opens. The query path is measured with the same query.
    const byQuery = ranking === 'query' ? rankBlocksForQuery(cleaned, maxChars, query) : null;
    const ranked = byQuery ?? rankBlocksForExcerpt(cleaned, maxChars);
    const rankingSavingsChars = Math.max(0, cleaned.length - ranked.length);

    let text = cleaned;
    let excerptReason: ExcerptReason = 'fits';
    let truncated = false;

    if (cleaned.length <= maxChars) {
      // `fits` — nothing is cut, whichever ranking is configured.
    } else if (ranking === 'query') {
      if (byQuery) {
        text = byQuery;
        excerptReason = 'ranked-query';
      } else {
        // Nothing in the document mentions the query: fall back rather than
        // ship an excerpt chosen by a signal that matched nothing.
        const headTail = buildHeadTailExcerpt(cleaned, maxChars);
        text = headTail.text;
        excerptReason = headTail.cut ? 'head-tail' : 'fits';
      }
      truncated = text.length < cleaned.length;
    } else if (ranking === 'unsupervised') {
      text = ranked;
      truncated = text.length < cleaned.length;
      excerptReason = truncated ? 'ranked' : 'fits';
    } else {
      const headTail = buildHeadTailExcerpt(cleaned, maxChars);
      text = headTail.text;
      truncated = headTail.cut;
      excerptReason = headTail.cut ? 'head-tail' : 'fits';
    }

    return {
      text,
      cleaned,
      changed: text !== source,
      metrics: {
        version: LESSON_PREPROCESS_VERSION,
        ms: Date.now() - startedAt,
        originalChars: source.length,
        cleanedChars: cleaned.length,
        excerptChars: text.length,
        removedControl: cleanedResult.removedControl,
        removedBlankRuns: cleanedResult.removedBlankRuns,
        removedRepeatedLines: cleanedResult.removedRepeatedLines,
        truncated,
        excerptReason,
        rankingSavingsChars
      }
    };
  } catch (error) {
    return {
      text: source,
      cleaned: source,
      changed: false,
      metrics: {
        version: LESSON_PREPROCESS_VERSION,
        ms: Date.now() - startedAt,
        originalChars: source.length,
        cleanedChars: source.length,
        excerptChars: source.length,
        removedControl: 0,
        removedBlankRuns: 0,
        removedRepeatedLines: 0,
        truncated: false,
        excerptReason: 'fits',
        rankingSavingsChars: 0,
        error: error instanceof Error ? error.message : 'PREPROCESS_FAILED'
      }
    };
  }
}

/** Per-mode excerpt budget used by `lesson:analyze`. */
export function preprocessBudgetForMode(mode: string | undefined): number {
  return mode === 'deep' ? LESSON_PREPROCESS_BUDGET_DEEP : LESSON_PREPROCESS_BUDGET_FAST;
}
