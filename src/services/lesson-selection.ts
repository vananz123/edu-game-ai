/**
 * Teacher section selection and prepared analysis input
 * (docs/archive/specs/update_AI_plan_7.txt §4, §5, §6).
 *
 * The teacher picks sections in the structure tree; this module turns that pick
 * into the **one** text the model will read, and reports exactly what it did:
 *
 *  - unselected text is never sent (§4.2, §5.1);
 *  - ancestor context is added deliberately and labelled, so the model can tell
 *    a heading it inherited from text the teacher chose (§5.2);
 *  - the character budget still applies (decision A: selection narrows, it never
 *    enlarges), but an omission is always *reported*, never silent (§6);
 *  - table rows, answers, formulae and examples are never split by a boundary
 *    (§5.1) — a cut is moved to a line boundary instead.
 *
 * Pure and deterministic: no I/O, no model, so it is unit-tested directly. The
 * same function feeds both the prompt and the preview payload, which is why the
 * preview cannot drift from what is actually sent.
 */
import { normalizeLessonSource } from './lesson-chunker';
import {
  LESSON_PREPROCESS_BUDGET_FAST,
  cutAtBoundary,
  preprocessBudgetForMode,
  preprocessLessonSource
} from './lesson-preprocess';
import {
  classifyLine,
  detectHeadingStyle,
  isTableSeparator
} from './lesson-structure';
import type { LessonSectionNode, LessonStructure } from './lesson-structure';
import { sha256Hex } from './lesson-cache';

/**
 * Decision A (2026-10-24): a selection never raises the budget. This constant is
 * the single place a future, *measured* exception would be raised; it is pinned
 * by a test so raising it is a deliberate, reviewable one-line change.
 */
export const SELECTION_BUDGET_CEILING_CHARS = LESSON_PREPROCESS_BUDGET_FAST;

/** Context characters spent on ancestor headings before they are cut. */
export const MAX_CONTEXT_CHARS = 1_500;

/** Marker that introduces context the teacher did **not** select. */
export const CONTEXT_MARKER = '[Ngữ cảnh tự động: mục bao ngoài của phần đã chọn]';

export interface SelectionError extends Error {
  code: 'SELECTION_EMPTY' | 'SELECTION_UNKNOWN_ID' | 'SELECTION_STALE';
}

function selectionError(code: SelectionError['code'], message: string): SelectionError {
  const error = new Error(message) as SelectionError;
  error.code = code;
  return error;
}

export interface SelectedRange {
  /** Node ids in document order (all of them, selected or inherited). */
  id: string;
  title: string;
  charStart: number;
  charEnd: number;
  /** `false` for ancestor context the teacher did not tick. */
  selected: boolean;
}

export interface PrepareSelectionOptions {
  /** Excerpt budget; defaults to the fast-mode budget. */
  maxChars?: number;
  /** Analysis mode, used only when `maxChars` is absent. */
  mode?: string;
  /** Adds ancestor headings/lead sentences (§5.2). Default true. */
  includeContext?: boolean;
}

export interface PreparedSelection {
  /** The exact text the model will read. */
  text: string;
  /** Characters available to the model. */
  chars: number;
  /** Every range that produced `text`, in document order. */
  ranges: SelectedRange[];
  /** Files are named, never guessed: this is what was sent, for the preview. */
  textBeforeBudget: number;
  truncated: boolean;
  /** Ranges the budget dropped, so the UI can say which. */
  omitted: SelectedRange[];
  /** Ids of selected sections that only *partly* fit the budget (§5.4). */
  partialIds: string[];
  /** Tables/questions/answers kept verbatim, for the §5.1 badge. */
  preserved: { tables: number; questions: number; answers: number; formulas: number; examples: number };
  /** Honest token *estimate* (chars/3.23, the ratio measured in BENCHMARKS). */
  estimatedTokens: number;
  warnings: string[];
}

export function estimateTokens(chars: number): number {
  return Math.max(1, Math.round((Number(chars) || 0) / 3.23));
}

// ---------------------------------------------------------------------------
// Selection resolution
// ---------------------------------------------------------------------------

/** Every descendant id of `node` (excluding the node itself). */
export function descendantIds(node: LessonSectionNode): string[] {
  const ids: string[] = [];
  const walk = (current: LessonSectionNode) => current.children.forEach(child => {
    ids.push(child.id);
    walk(child);
  });
  walk(node);
  return ids;
}

/**
 * Expands a teacher's tick into concrete ranges.
 *
 * Ticking a section selects it *including* its subsections; a selection whose
 * parent is also selected is merged so no text is sent twice. Ancestors that
 * were not ticked contribute only their heading line plus the first sentence of
 * their own body (§5.2) — never their whole content.
 *
 * Throws `SELECTION_EMPTY` for an empty selection and `SELECTION_UNKNOWN_ID` for
 * an id that is not in the tree: silently analysing the whole document would be
 * exactly the "use content the teacher excluded" failure §10.12 forbids.
 */
export function resolveSelection(
  structure: LessonStructure,
  selectedIds: readonly string[],
  options: { includeContext?: boolean } = {}
): SelectedRange[] {
  const byId = new Map(structure.nodes.map(node => [node.id, node]));
  const ids = Array.from(new Set((selectedIds || []).map(id => String(id || '').trim()).filter(Boolean)));
  // The document root is not a section: selecting it would mean "send everything",
  // which this function must never infer from a section id (decision A, §10.12).
  if (ids.includes(structure.root.id)) {
    throw selectionError('SELECTION_UNKNOWN_ID', `Phần "${structure.root.id}" là toàn bộ tài liệu, không phải một mục để chọn.`);
  }
  if (!ids.length) {
    throw selectionError('SELECTION_EMPTY', 'Hãy chọn ít nhất một phần của tài liệu, hoặc chọn "Phân tích toàn bộ tài liệu".');
  }
  for (const id of ids) {
    if (!byId.has(id)) throw selectionError('SELECTION_UNKNOWN_ID', `Phần "${id}" không còn trong cấu trúc tài liệu. Hãy mở lại bước chọn nội dung.`);
  }

  const wanted = new Set<string>(ids);
  const includeContext = options.includeContext !== false;
  if (includeContext) {
    for (const id of ids) {
      const ancestors = ancestorIds(structure, id);
      ancestors.forEach(ancestorId => wanted.add(ancestorId));
    }
  }

  const selected = new Set(ids);
  const ranges: SelectedRange[] = [];
  // Document order, skipping any node whose selected ancestor already covers it.
  const covered: SelectedRange[] = [];
  for (const node of structure.nodes) {
    if (node.id === structure.root.id) continue;
    if (!wanted.has(node.id)) continue;
    if (covered.some(range => range.charStart <= node.charStart && range.charEnd >= node.charEnd)) continue;
    const range: SelectedRange = {
      id: node.id,
      title: node.title,
      charStart: node.charStart,
      charEnd: node.charEnd,
      selected: selected.has(node.id)
    };
    ranges.push(range);
    if (selected.has(node.id)) covered.push(range);
  }
  return ranges;
}

/** Ancestor ids of `id`, outermost first (the document root excluded). */
export function ancestorIds(structure: LessonStructure, id: string): string[] {
  const path: string[] = [];
  const walk = (node: LessonSectionNode, trail: LessonSectionNode[]): boolean => {
    if (node.id === id) {
      path.push(...trail.filter(item => item.id !== structure.root.id).map(item => item.id));
      return true;
    }
    return node.children.some(child => walk(child, [...trail, node]));
  };
  walk(structure.root, []);
  return path;
}

// ---------------------------------------------------------------------------
// Text assembly
// ---------------------------------------------------------------------------

/** A section that begins mid-table is widened to whole table rows (§5.1). */
export function expandToLineBoundary(
  source: string,
  charStart: number,
  charEnd: number
): { charStart: number; charEnd: number; widened: boolean } {
  let start = Math.max(0, Math.min(charStart, source.length));
  let end = Math.max(start, Math.min(charEnd, source.length));
  let widened = false;
  if (start > 0) {
    const lineStart = source.lastIndexOf('\n', start - 1) + 1;
    const lineEnd = source.indexOf('\n', start);
    const line = source.slice(lineStart, lineEnd === -1 ? source.length : lineEnd);
    // Only widen when the cut lands *inside* a line, i.e. the selected range
    // starts after that line's first character.
    if (start > lineStart && line.trim()) {
      start = lineStart;
      widened = true;
    }
  }
  if (end > 0 && end < source.length) {
    const lineStart = source.lastIndexOf('\n', end - 1) + 1;
    const lineEnd = source.indexOf('\n', end);
    const line = source.slice(lineStart, lineEnd === -1 ? source.length : lineEnd);
    if (end > lineStart && line.trim()) {
      end = lineEnd === -1 ? source.length : lineEnd;
      widened = true;
    }
  }
  return { charStart: start, charEnd: end, widened };
}

/**
 * One ancestor's contribution: its heading line plus the first sentence of its own
 * body — never its whole content (§5.2). The heading lines are what make a selected
 * subsection intelligible on its own; the rest of an un-ticked ancestor is text the
 * teacher did not select.
 *
 * A body line is only eligible when it looks like prose (`Sentence.`), not a heading
 * and not a table row: an ancestor whose body starts with a *sibling's* title would
 * otherwise send that sibling's name, which is exactly the "a sibling section leaked
 * in" failure the tests pin.
 *
 * The cap applies to the whole snippet, so a long first paragraph can never turn
 * context into the bulk of the prompt.
 */
export function contextSnippet(source: string, node: LessonSectionNode, budget = 160): string {
  const body = source.slice(node.charStart, node.charEnd);
  const lines = body.split('\n').map(line => line.trim()).filter(Boolean);
  // Line 0 is the node's own heading (its range starts at it).
  const heading = lines[0] || '';
  const sentences: string[] = [];
  for (const line of lines.slice(1)) {
    if (isTableSeparator(line) || line.includes('|')) break;
    if (detectHeadingStyle(line)) break;
    const sentence = /^(.{20,}?[.!?…])(\s|$)/u.exec(line)?.[1];
    if (sentence) {
      sentences.push(sentence);
      break;
    }
  }
  const snippet = [heading, ...sentences].filter(Boolean).join(': ');
  return snippet.length > budget ? `${snippet.slice(0, budget - 1).trimEnd()}…` : snippet;
}

// ---------------------------------------------------------------------------
// Preparation — the single source of truth for what the model reads
// ---------------------------------------------------------------------------

function countPreserved(lines: string[]): PreparedSelection['preserved'] {
  const preserved = { tables: 0, questions: 0, answers: 0, formulas: 0, examples: 0 };
  for (const line of lines) {
    const text = line.trim();
    if (!text) continue;
    switch (classifyLine(text)) {
      case 'table-row':
        preserved.tables += 1;
        break;
      case 'question':
        preserved.questions += 1;
        break;
      case 'answer':
        preserved.answers += 1;
        break;
      case 'example':
        preserved.examples += 1;
        break;
      case 'formula':
        preserved.formulas += 1;
        break;
      default:
        break;
    }
  }
  return preserved;
}

function budgetFrom(options: PrepareSelectionOptions): number {
  const explicit = Number(options.maxChars);
  if (Number.isFinite(explicit) && explicit > 0) return Math.floor(explicit);
  return options.mode ? preprocessBudgetForMode(options.mode) : SELECTION_BUDGET_CEILING_CHARS;
}
/** Joins the selected ranges and applies the budget, reporting every omission. */
export function prepareSelectedLessonText(
  rawText: string,
  structure: LessonStructure,
  selectedIds: readonly string[],
  options: PrepareSelectionOptions = {}
): PreparedSelection {
  const source = normalizeLessonSource(rawText ?? '');
  const maxChars = budgetFrom(options);
  const ranges = resolveSelection(structure, selectedIds, { includeContext: options.includeContext });
  const warnings: string[] = [];
  if (structure.textLength !== source.length) {
    warnings.push('Cấu trúc được lưu cho một phiên bản khác của tài liệu; hãy phân tích lại cấu trúc.');
  }

  const byId = new Map(structure.nodes.map(node => [node.id, node]));
  const selectedRanges = ranges.filter(range => range.selected);
  const contextRanges = ranges.filter(range => !range.selected);
  const parts: string[] = [];
  const keptLines: string[] = [];
  // Kept parallel to `parts` so a cut can name the section it happened in.
  const sentRanges: SelectedRange[] = [];
  /** How many characters of each `sentRanges[i]` were actually kept. */
  const keptChars: number[] = [];
  for (const range of selectedRanges) {
    const bounded = expandToLineBoundary(source, range.charStart, range.charEnd);
    const body = source.slice(bounded.charStart, bounded.charEnd).trim();
    if (!body) continue;
    parts.push(body);
    sentRanges.push(range);
    keptChars.push(body.length);
    keptLines.push(...body.split('\n'));
  }

  // Context is capped and labelled so it can never masquerade as selected text.
  const context = buildContextBlock(contextRanges, byId, source);
  const textBeforeBudget = context.text.length + parts.join('\n\n').length;
  const omitted: SelectedRange[] = [];
  const partialIds = new Set<string>();
  let text = '';
  let truncated = false;

  // §6: cut on a block boundary and *say* what was dropped. Context is reserved
  // first so a huge first section cannot push the teacher's own pick out.
  if (context.text.length >= maxChars) {
    text = context.text.slice(0, maxChars);
    truncated = true;
    omitted.push(...selectedRanges);
    warnings.push('Ngữ cảnh tự động chiếm toàn bộ hạn mức; hãy chọn phần hẹp hơn.');
  } else {
    let remaining = maxChars - context.text.length;
    const chunks: string[] = [];
    for (const [index, part] of parts.entries()) {
      const separator = chunks.length ? 2 : 0;
      if (part.length + separator <= remaining) {
        chunks.push(part);
        remaining -= part.length + separator;
        continue;
      }
      truncated = true;
      // The cut happens inside `part`, so this section is only *partly* sent. It is
      // reported as omitted too: §6 forbids a cut that the UI cannot show, and a
      // section whose body was shortened must appear in the omission panel with the
      // rest of everything that did not fit (§5.4).
      const dropped = sentRanges.slice(index + 1);
      const cut = cutAtBoundary(part, remaining);
      const keptText = cut.text.trim() ? cut.text : '';
      const keptCount = keptText.length;
      const partial = keptCount > 0 && keptCount < (keptChars[index] ?? part.length);
      omitted.push(...dropped);
      if (partial || !keptText) {
        omitted.push(sentRanges[index]);
        partialIds.add(sentRanges[index].id);
      }
      if (keptText) chunks.push(keptText);
      warnings.push(`Hạn mức ${maxChars.toLocaleString('vi-VN')} ký tự chỉ đủ cho một phần nội dung đã chọn.`);
      break;
    }
    text = `${context.text}${chunks.join('\n\n')}`;
  }

  if (context.dropped.length) warnings.push(`Bỏ ${context.dropped.length} mục ngữ cảnh vì quá dài.`);

  return {
    text,
    chars: text.length,
    ranges,
    textBeforeBudget,
    truncated,
    omitted,
    partialIds: Array.from(partialIds),
    preserved: countPreserved(keptLines),
    estimatedTokens: estimateTokens(text.length),
    warnings
  };
}

function buildContextBlock(
  ranges: SelectedRange[],
  byId: Map<string, LessonSectionNode>,
  source: string
): { text: string; dropped: SelectedRange[] } {
  if (!ranges.length) return { text: '', dropped: [] };
  const header = `${CONTEXT_MARKER}\n`;
  let budget = MAX_CONTEXT_CHARS - header.length;
  const lines: string[] = [];
  const dropped: SelectedRange[] = [];
  for (const range of ranges) {
    const node = byId.get(range.id);
    const snippet = node ? contextSnippet(source, node) : '';
    if (!snippet) continue;
    if (budget <= 0) {
      dropped.push(range);
      continue;
    }
    const line = snippet.length > budget ? `${snippet.slice(0, Math.max(0, budget - 1)).trimEnd()}…` : snippet;
    lines.push(line);
    budget -= line.length + 1;
  }
  return { text: lines.length ? `${header}${lines.join('\n')}\n\n` : '', dropped };
}

/**
 * Prepares exactly what the model will read when the teacher did not pick
 * sections (whole-document path). Routes through `preprocessLessonContext`, the
 * same L1+L2 preprocessor `lesson:analyze` used before this feature, so a
 * whole-document analysis is byte-identical to the old behaviour.
 *
 * `budgetExceeded` is the §6 signal: the selected content was longer than the
 * budget and only part of it is being sent. It is never silently dropped.
 */
export function prepareWholeLessonText(
  rawText: string,
  options: PrepareSelectionOptions = {}
): PreparedSelection & { budgetExceeded: boolean } {
  const source = normalizeLessonSource(rawText ?? '');
  const maxChars = budgetFrom(options);
  const prepared = preprocessLessonSource(source, { maxChars });
  const warnings: string[] = [];
  if (prepared.metrics.truncated) {
    warnings.push(
      `Tài liệu dài ${source.length.toLocaleString('vi-VN')} ký tự; chỉ ${prepared.text.length.toLocaleString('vi-VN')} ký tự vừa hạn mức được gửi. Hãy chọn phần nội dung để dùng đúng đoạn cần thiết.`
    );
  }
  return {
    text: prepared.text,
    chars: prepared.text.length,
    ranges: [],
    textBeforeBudget: source.length,
    truncated: prepared.metrics.truncated,
    omitted: [],
    partialIds: [],
    preserved: countPreserved(prepared.text.split('\n')),
    estimatedTokens: estimateTokens(prepared.text.length),
    warnings,
    budgetExceeded: prepared.metrics.truncated
  };
}

/**
 * Fingerprint of a selection, mixed into the analysis cache key so two different
 * picks on the same document never share a cached analysis (decision A).
 * Returns `null` for "no selection", which keeps today's cache key
 * byte-for-byte (docs/DECISIONS.md, backward compatibility).
 *
 * `maxChars` is part of the fingerprint because it decides which ranges fit: the
 * same pick under a smaller budget produces different text, and reusing the
 * cached analysis of the larger one would claim the model read text it never saw.
 */
export function selectionFingerprint(
  structure: LessonStructure | null,
  selectedIds: readonly string[] | undefined | null,
  options: { maxChars?: number; includeContext?: boolean } = {}
): string | null {
  const ids = Array.from(new Set((selectedIds || []).map(id => String(id || '').trim()).filter(Boolean))).sort();
  if (!structure || !ids.length) return null;
  const known = new Set(structure.nodes.map(node => node.id));
  const parts: string[] = [];
  for (const id of ids) {
    if (!known.has(id)) {
      parts.push(`${id}:stale`);
      continue;
    }
    for (const range of resolveSelection(structure, [id])) {
      parts.push(`${range.id}:${range.selected ? 1 : 0}`);
    }
  }
  const budget = budgetFrom({ maxChars: options.maxChars });
  const context = options.includeContext === false ? 'nocontext' : 'context';
  return sha256Hex(
    `${structure.version}\u001f${structure.textLength}\u001f${budget}\u001f${context}\u001f${parts.join(',')}`
  );
}


