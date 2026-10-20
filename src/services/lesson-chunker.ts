/**
 * Deterministic lesson chunker (O3 of docs/archive/specs/update-AI-local.txt).
 *
 * Generation used to send `document.text.slice(0, 6000)` — the first 6000
 * characters regardless of whether they were relevant to the configured game.
 * Chunking the lesson once and retrieving only the useful parts keeps the prompt
 * short (fewer tokens, less truncation risk) without losing the ability to show
 * the model real source text.
 *
 * Rules:
 *  - pure function, no I/O, no model, stable output for the same input;
 *  - never drops text: chunks cover the source in order with no overlap;
 *  - paragraph-aware first (blank line), then sentence, then a word-boundary
 *    hard split for pathological single sentences;
 *  - a short standalone line (<= 80 chars, no terminal punctuation) is treated
 *    as a heading and attached to the following chunks, which gives retrieval
 *    and the prompt a little context ("Chặng 1 — Quang hợp").
 *
 * Offsets refer to the **normalized** text (`\r\n` -> `\n`), not the raw file.
 */

export interface LessonChunk {
  /** 0-based position inside the document; stable for a given text + options. */
  index: number;
  text: string;
  /** Inclusive start offset in the normalized source. */
  charStart: number;
  /** Exclusive end offset in the normalized source. */
  charEnd: number;
  /** Nearest heading line above the chunk, when the document has one. */
  heading: string | null;
}

export interface ChunkLessonOptions {
  /** Maximum characters per chunk (hard upper bound). */
  maxChars?: number;
  /** Soft minimum; smaller paragraphs are packed together up to `maxChars`. */
  minChars?: number;
}

export const DEFAULT_MAX_CHUNK_CHARS = 900;
export const DEFAULT_MIN_CHUNK_CHARS = 240;
const MAX_HEADING_LENGTH = 80;
const HEADING_TERMINAL = /[.!?…:;]$/;
const SENTENCE_PATTERN = /[^.!?…\n]+[.!?…]*/g;
const HARD_SPLIT_MIN_RATIO = 0.5;

interface SourceLine {
  text: string;
  start: number;
  end: number;
}

interface Block {
  text: string;
  texts: string[];
  start: number;
  end: number;
  heading: string | null;
}

interface Segment {
  text: string;
  start: number;
  end: number;
  heading: string | null;
  blockId: number;
}

/** `\r\n`/`\r` -> `\n`, so offsets are consistent on Windows files. */
export function normalizeLessonSource(text: string): string {
  return String(text ?? '').replace(/\r\n?/g, '\n');
}

function splitLines(source: string): SourceLine[] {
  const lines: SourceLine[] = [];
  let offset = 0;
  source.split('\n').forEach(text => {
    lines.push({ text, start: offset, end: offset + text.length });
    offset += text.length + 1;
  });
  return lines;
}

function buildBlocks(lines: SourceLine[]): Block[] {
  const blocks: Block[] = [];
  let texts: string[] = [];
  let start = 0;
  let end = 0;

  const flush = () => {
    if (!texts.length) return;
    blocks.push({ text: texts.join('\n').trim(), texts, start, end, heading: null });
    texts = [];
  };

  lines.forEach(line => {
    if (!line.text.trim()) {
      flush();
      return;
    }
    if (!texts.length) start = line.start;
    texts.push(line.text);
    end = line.start + line.text.length;
  });
  flush();

  // Attach the most recent heading-looking block to the blocks below it.
  let heading: string | null = null;
  blocks.forEach(block => {
    const firstLine = block.texts[0].trim();
    const looksLikeHeading =
      block.texts.length === 1 && firstLine.length > 0 && firstLine.length <= MAX_HEADING_LENGTH && !HEADING_TERMINAL.test(firstLine);
    if (looksLikeHeading) heading = firstLine;
    block.heading = heading;
  });

  return blocks;
}

function sentenceSegments(block: Block, blockId: number): Segment[] {
  const segments: Segment[] = [];
  SENTENCE_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SENTENCE_PATTERN.exec(block.text))) {
    const raw = match[0];
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const leading = raw.length - raw.trimStart().length;
    const start = block.start + match.index + leading;
    segments.push({ text: trimmed, start, end: start + trimmed.length, heading: block.heading, blockId });
  }
  return segments;
}

function splitLongSegment(segment: Segment, maxChars: number): Segment[] {
  if (segment.text.length <= maxChars) return [segment];
  const pieces: Segment[] = [];
  let cursor = 0;
  while (cursor < segment.text.length) {
    let end = Math.min(cursor + maxChars, segment.text.length);
    if (end < segment.text.length) {
      const lastSpace = segment.text.lastIndexOf(' ', end);
      if (lastSpace > cursor + Math.floor(maxChars * HARD_SPLIT_MIN_RATIO)) end = lastSpace;
    }
    const raw = segment.text.slice(cursor, end);
    const trimmed = raw.trim();
    const leading = raw.length - raw.trimStart().length;
    if (trimmed) {
      pieces.push({ ...segment, text: trimmed, start: segment.start + cursor + leading, end: segment.start + cursor + leading + trimmed.length });
    }
    cursor = end;
  }
  return pieces;
}

function joinSegments(segments: Segment[]): string {
  return segments.reduce((text, segment, position) => {
    if (position === 0) return segment.text;
    return text + (segment.blockId === segments[position - 1].blockId ? ' ' : '\n') + segment.text;
  }, '');
}

/**
 * Splits a lesson into ordered, non-overlapping chunks.
 * Returns `[]` for empty/whitespace-only input.
 */
export function chunkLessonText(text: string, options: ChunkLessonOptions = {}): LessonChunk[] {
  const source = normalizeLessonSource(text);
  if (!source.trim()) return [];

  const maxChars = Math.max(120, Math.round(Number(options.maxChars) || DEFAULT_MAX_CHUNK_CHARS));
  const minChars = Math.max(0, Math.min(maxChars, Math.round(Number(options.minChars) || DEFAULT_MIN_CHUNK_CHARS)));

  const blocks = buildBlocks(splitLines(source));
  const segments: Segment[] = [];
  blocks.forEach((block, blockId) => {
    sentenceSegments(block, blockId).forEach(segment => {
      splitLongSegment(segment, maxChars).forEach(piece => segments.push(piece));
    });
  });
  if (!segments.length) return [];

  const chunks: LessonChunk[] = [];
  let buffer: Segment[] = [];
  let length = 0;

  const flush = () => {
    if (!buffer.length) return;
    const chunkText = joinSegments(buffer);
    chunks.push({
      index: chunks.length,
      text: chunkText,
      charStart: buffer[0].start,
      charEnd: buffer[buffer.length - 1].end,
      heading: buffer[0].heading
    });
    buffer = [];
    length = 0;
  };

  segments.forEach(segment => {
    if (buffer.length) {
      const wouldBe = length + 1 + segment.text.length;
      const headingChanged = buffer[0].heading !== segment.heading && length >= minChars;
      if (wouldBe > maxChars || headingChanged) flush();
    }
    length = buffer.length ? length + 1 + segment.text.length : segment.text.length;
    buffer.push(segment);
  });
  flush();

  return chunks;
}
