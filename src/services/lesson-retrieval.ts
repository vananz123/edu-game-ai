/**
 * Lesson chunk retrieval (O3 of docs/archive/specs/update-AI-local.txt).
 *
 * Generation needs a *short, relevant* slice of the lesson, not its first 6000
 * characters. This module picks that slice. O3 ships the lexical scorer only —
 * a BM25-style ranker over Vietnamese syllable tokens — so the whole pipeline
 * can be built and tested before any embedding model is installed. O4 replaces
 * the scorer with MiniLM vectors behind the same `selectChunks` shape, which is
 * why the public API talks about chunks and scores rather than embeddings.
 *
 * Deliberately not here: any model call, any I/O, any random tie-break.
 */
import type { GameConfig, LessonAnalysis } from '../shared/lesson-types';
import type { LessonChunk } from './lesson-chunker';

export type ChunkScorerId = 'lexical-v1' | 'embeddings-v1';

export interface ChunkScore {
  chunk: LessonChunk;
  score: number;
}

export interface SelectChunkOptions {
  /** Maximum number of chunks sent to the model. */
  maxChunks?: number;
  /** Maximum total characters of the selected chunks. */
  maxChars?: number;
  /** Drop chunks below this score (0 keeps anything with a hit). */
  minScore?: number;
}

export interface ChunkSelection {
  /** Selected chunks, always in document order (the prompt should read naturally). */
  selected: LessonChunk[];
  /** Score per selected chunk, aligned with `selected`. */
  scores: number[];
  scorer: ChunkScorerId;
  /** True when no chunk matched and the start of the document was used instead. */
  fallback: boolean;
  characters: number;
  considered: number;
}

export const DEFAULT_MAX_SELECTED_CHUNKS = 6;
export const DEFAULT_MAX_SELECTED_CHARS = 4500;
/**
 * O6: "Deep" is the quality mode (docs/archive/specs/update-AI-local.txt §5.3). Thinking is
 * not usable on the shipped 2B model (see docs/BENCHMARKS.md), so Deep widens
 * what the model can see instead: more of the same lesson, still bounded.
 */
export const DEEP_MAX_SELECTED_CHUNKS = 8;
export const DEEP_MAX_SELECTED_CHARS = 6000;
/**
 * #54 follow-up: per-item budget for single-item regeneration. One item only
 * needs the passage it paraphrases, not the whole draft slice; a narrow slice
 * that does not fit this budget is not trimmed, the full selection is used.
 */
export const ITEM_MAX_SELECTED_CHARS = 1800;

const BM25_K1 = 1.5;
const BM25_B = 0.75;

/**
 * Common Vietnamese function words; dropping them *should* keep the ranking about
 * content.
 *
 * Known bug (pre-existing, not fixed here): this list is written without
 * diacritics while `tokenizeForRetrieval` preserves them, so `của`, `là`, `và`…
 * never match and no stop word is actually removed from the BM25 scorer. Fixing
 * it changes retrieval ranking for every lesson, which needs its own measurement;
 * the per-item filter works around it with `foldDiacritics`.
 */
const STOP_WORDS = new Set([
  'va', 'cua', 'la', 'co', 'cho', 'voi', 'trong', 'khi', 'de', 'mot', 'nhung', 'cac', 'nay', 'do', 'thi', 'ma',
  'nhu', 'nhung', 'hoac', 'neu', 'tu', 'den', 'theo', 've', 'ra', 'vao', 'len', 'xuong', 'duoc', 'bi', 'da',
  'dang', 'se', 'khong', 'cung', 'rat', 'hon', 'nhieu', 'it', 'moi', 'gi', 'nao', 'sao', 'tai', 'do', 'bang',
  'qua', 'sau', 'truoc', 'tren', 'duoi', 'giua', 'cung', 'hay', 'vi', 'nen', 'lai', 'chi', 'con', 'phai',
  'muon', 'can', 'em', 'chung', 'minh', 'ban', 'no', 'ho', 'day', 'vay', 'a', 'oi', 'nhe', 'ha'
]);

/**
 * Lowercase word tokens, diacritics preserved (they carry meaning in Vietnamese).
 * `\p{L}` keeps accented letters; digits are kept so "năm 1945" stays searchable.
 */
export function tokenizeForRetrieval(text: string): string[] {
  const normalized = String(text ?? '').toLowerCase().normalize('NFC');
  const raw = normalized.match(/[\p{L}\p{N}]+/gu) || [];
  return raw.filter(token => token.length >= 2);
}

function contentTokens(text: string): string[] {
  return tokenizeForRetrieval(text).filter(token => !STOP_WORDS.has(token));
}

function termFrequency(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  tokens.forEach(token => counts.set(token, (counts.get(token) || 0) + 1));
  return counts;
}

/** BM25 inverse document frequency. The one definition in this module. */
function bm25Idf(documentFrequency: number, documentCount: number): number {
  return Math.log(1 + (documentCount - documentFrequency + 0.5) / (documentFrequency + 0.5));
}

/**
 * BM25-lite ranking over chunks. The heading is indexed too, so a chunk under
 * "Quang hợp" is findable by that word even when the sentence omits it.
 */
export function scoreChunksLexically(query: string, chunks: LessonChunk[]): ChunkScore[] {
  if (!chunks.length) return [];
  const queryTokens = Array.from(new Set(contentTokens(query)));
  const documents = chunks.map(chunk => {
    const tokens = contentTokens(`${chunk.heading || ''} ${chunk.text}`);
    return { chunk, tf: termFrequency(tokens), length: tokens.length };
  });
  const totalLength = documents.reduce((sum, document) => sum + document.length, 0);
  const averageLength = totalLength / documents.length || 1;

  const documentFrequency = new Map<string, number>();
  queryTokens.forEach(token => {
    documentFrequency.set(token, documents.reduce((count, document) => count + (document.tf.has(token) ? 1 : 0), 0));
  });

  return documents
    .map(document => {
      let score = 0;
      queryTokens.forEach(token => {
        const frequency = document.tf.get(token);
        if (!frequency) return;
        const idf = documentFrequency.get(token) ? bm25Idf(documentFrequency.get(token), documents.length) : 0;
        const lengthNorm = 1 - BM25_B + BM25_B * (document.length / averageLength);
        score += (idf * (frequency * (BM25_K1 + 1))) / (frequency + BM25_K1 * lengthNorm);
      });
      return { chunk: document.chunk, score };
    })
    .sort((left, right) => right.score - left.score || left.chunk.index - right.chunk.index);
}

function takeInDocumentOrder(selected: ChunkScore[]): LessonChunk[] {
  return [...selected].sort((left, right) => left.chunk.index - right.chunk.index).map(entry => entry.chunk);
}

/** Cosine similarity of two equal-length vectors (0 for a zero vector). */
export function cosineSimilarity(left: Float32Array, right: Float32Array): number {
  if (left.length !== right.length) {
    throw new Error(`Không so sánh được vector ${left.length} chiều với ${right.length} chiều.`);
  }
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let position = 0; position < left.length; position += 1) {
    dot += left[position] * right[position];
    leftNorm += left[position] * left[position];
    rightNorm += right[position] * right[position];
  }
  const denominator = Math.sqrt(leftNorm) * Math.sqrt(rightNorm);
  return denominator > 0 ? dot / denominator : 0;
}

/**
 * Shared selection core: ranked candidates in, budget-respecting selection in
 * document order out. Both scorers (lexical now, embeddings next) go through
 * this so budgets, fallback and ordering can never drift apart.
 */
function buildSelection(
  chunks: LessonChunk[],
  ranked: ChunkScore[],
  options: SelectChunkOptions,
  scorer: ChunkScorerId
): ChunkSelection {
  const maxChunks = Math.max(1, Math.round(Number(options.maxChunks) || DEFAULT_MAX_SELECTED_CHUNKS));
  const maxChars = Math.max(200, Math.round(Number(options.maxChars) || DEFAULT_MAX_SELECTED_CHARS));
  const minScore = Number.isFinite(options.minScore) ? Number(options.minScore) : 0;

  if (!chunks.length) {
    return { selected: [], scores: [], scorer, fallback: false, characters: 0, considered: 0 };
  }

  const picked: ChunkScore[] = [];
  let characters = 0;
  for (const entry of ranked) {
    if (picked.length >= maxChunks) break;
    if (entry.score <= minScore) continue;
    if (characters + entry.chunk.text.length > maxChars) continue;
    picked.push(entry);
    characters += entry.chunk.text.length;
  }

  if (!picked.length) {
    for (const chunk of chunks) {
      if (picked.length >= maxChunks) break;
      if (characters + chunk.text.length > maxChars) continue;
      picked.push({ chunk, score: 0 });
      characters += chunk.text.length;
    }
    return {
      selected: takeInDocumentOrder(picked),
      scores: picked.map(() => 0),
      scorer,
      fallback: true,
      characters,
      considered: chunks.length
    };
  }

  const selected = takeInDocumentOrder(picked);
  const scoreByIndex = new Map(picked.map(entry => [entry.chunk.index, entry.score]));
  return {
    selected,
    scores: selected.map(chunk => scoreByIndex.get(chunk.index) || 0),
    scorer,
    fallback: false,
    characters,
    considered: chunks.length
  };
}

/**
 * Picks the chunks that fit the prompt budget using lexical (BM25-lite) scores.
 *
 * Ranking decides *which* chunks, document order decides *how they are shown*.
 * If nothing matches (a lesson with no overlap with the analysis), the first
 * chunks are returned instead of an empty excerpt — the model must always get
 * real source text, and `fallback` tells the caller/benchmark it happened.
 */
export function selectChunks(chunks: LessonChunk[], query: string, options: SelectChunkOptions = {}): ChunkSelection {
  return buildSelection(chunks, scoreChunksLexically(query, chunks), options, 'lexical-v1');
}

/**
 * Picks chunks by cosine similarity against a query vector (O4).
 *
 * Chunks without a vector for the current embedding model are not ranked (they
 * cannot be compared); when none of them has a vector the caller should fall
 * back to `selectChunks` instead. Ties break by chunk index for determinism.
 */
export function selectChunksByVectors(
  chunks: LessonChunk[],
  queryVector: Float32Array,
  vectors: Map<number, Float32Array>,
  options: SelectChunkOptions = {}
): ChunkSelection {
  const ranked: ChunkScore[] = [];
  chunks.forEach(chunk => {
    const vector = vectors.get(chunk.index);
    if (!vector) return;
    ranked.push({ chunk, score: cosineSimilarity(queryVector, vector) });
  });
  ranked.sort((left, right) => right.score - left.score || left.chunk.index - right.chunk.index);
  return buildSelection(chunks, ranked, options, 'embeddings-v1');
}

/**
 * Fold Vietnamese diacritics so `và`/`va` and `chất`/`chat` compare equal.
 * `STOP_WORDS` is written without diacritics, but `tokenizeForRetrieval` keeps
 * them (deliberately, for scoring), so the stop lists are matched folded —
 * otherwise none of their entries would ever match accented lesson text.
 */
function foldDiacritics(token: string): string {
  return token
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .normalize('NFC');
}

/** Tokens too common to prove that an item reuses a chunk (numbers are kept). */
const PER_ITEM_STOP_WORDS = new Set([
  'bao', 'nhieu', 'tren', 'duoi', 'noi', 'dung', 'sai', 'chon', 'cau', 'hoi',
  'dap', 'muc', 'viet', 'nhat', 'dau', 'tien', 'cach', 'nghia', 'hien', 'tuong',
  'thuc', 'nhan', 'biet', 'hieu', 'nho', 'nhom', 'tong', 'the', 'nhanh', 'gi', 'nao',
  'chinh', 'sau', 'truoc', 'moi', 'cung', 'vay', 'nay', 'do', 'neu'
]);

function distinctiveTokens(text: string): Set<string> {
  return new Set(
    tokenizeForRetrieval(text).filter(token => {
      if (token.length < 3) return false;
      const folded = foldDiacritics(token);
      return !STOP_WORDS.has(folded) && !PER_ITEM_STOP_WORDS.has(folded);
    })
  );
}

/** Share of the item a chunk must explain to count as its source. */
const ITEM_MATCH_COVERAGE = 0.5;

/**
 * How much of the item the retrieved chunks account for, per token: occurrence share
 * (how often the item uses the word) times BM25 IDF over the *item* (how many
 * chunks repeat it) — the same ranking term the lexical scorer uses.
 *
 * Two things make this a provenance test rather than a bag-of-words overlap:
 *  - repetition is neutral. A word the item's heading and option text both use is
 *    weighted by its two occurrences and divided by the same two, so repeating a
 *    word never buys a match;
 *  - a word the item shares with *every* chunk (`chất`, `nước`, `sản`) scores 0,
 *    because it cannot tell one section from another.
 */
function referenceWeights(reference: string, documentFrequency: Map<string, number>, chunkCount: number): Map<string, number> {
  const weights = new Map<string, number>();
  termFrequency(tokenizeForRetrieval(reference)).forEach((occurrences, token) => {
    const frequency = documentFrequency.get(token) || 0;
    if (frequency > 0 && frequency < chunkCount) weights.set(token, occurrences * bm25Idf(frequency, chunkCount));
  });
  return weights;
}

/**
 * How much of the item a chunk accounts for (0…1), i.e. modelled as
 * "this chunk explains that share of the item's words".
 *
 * An item rewritten from a single section is explained by that section alone, so
 * `ITEM_MATCH_COVERAGE` must be a majority. A mixed item spreads across sections
 * and is caught by the leader-share gate in `selectItemChunks`. Repetition is
 * neutral: a word counted twice in the item's weight is also counted twice on
 * both sides of the ratio.
 */
function itemCoverage(chunk: LessonChunk, referenceWeight: Map<string, number>): number {
  const chunkTokens = distinctiveTokens(`${chunk.heading || ''} ${chunk.text}`);
  let total = 0;
  let covered = 0;
  referenceWeight.forEach((weight, token) => {
    total += weight;
    if (chunkTokens.has(token)) covered += weight;
  });
  return total > 0 ? covered / total : 0;
}

/**
 * A chunk only "wins" the item when it accounts for most of what the matching
 * chunks explain *together*. Measured on the lesson used by the tests: a
 * single-section item gives its section 1.0 against 0.10 (share 0.91), while an
 * item mixing three sections gives 0.63 against 0.25 + 0.13 (share 0.63) — the
 * others still explain a third of the item, so narrowing would cut real source.
 */
const ITEM_MIN_SHARE = 0.75;

/**
 * Per-item narrowing. The lexical test alone ranked a multi-section item onto the
 * section that repeats its own heading words, so narrowing is gated: the leader
 * has to explain most of what all chunks explain together (`ITEM_MIN_SHARE`).
 * Otherwise the item is treated as multi-section and the caller keeps the full
 * slice.
 *
 * Measured on the lesson in `tests/unit/lesson-retrieval.test.ts`:
 *  - a photosynthesis item scores 1.0 / 0.10 / 0.0 → share 0.91 → narrows to the
 *    photosynthesis chunk;
 *  - an item mixing three sections scores 0.63 / 0.25 / 0.13 → share 0.63 → keeps
 *    every chunk.
 *
 * Word overlap measures similarity, not provenance, so this can only be enabled
 * as a gate that falls back on every ambiguous case. A future item that records
 * the objective or chunk it was generated from would make the question exact.
 */
export const ITEM_SCOPING_ENABLED = true;

/**
 * The list a single item is retrieved from: the chunks already retrieved for the
 * draft, plus the item's own text. Regeneration therefore never re-reads or
 * re-ranks the document — it only narrows a slice that already fits the budget.
 */
export interface ItemScopeInput {
  /** Chunks retrieved for the whole draft. */
  chunks: LessonChunk[];
  /** Text the item is built from (the current item, serialized by the caller). */
  reference: string;
  /** Per-item character budget; nothing is added just to fill it. */
  maxChars?: number;
}

/**
 * #54 follow-up: the prefill cost of "Tạo lại" is dominated by how many source
 * characters go into the prompt (~1,723 fast / ~2,196 deep tokens per item vs
 * ~771 for the whole analysis), so this keeps only the chunks that recur in the
 * item being rewritten.
 *
 * It is a *word overlap* test gated so it can only fire on an item that a single
 * section explains outright (`ITEM_MIN_SHARE`). An item may be right without
 * tagging its objective, so filtering by objective id would drop its evidence.
 * A chunk qualifies when it repeats words specific to the item; specificity is
 * measured against the retrieved chunk set, not a hand-written vocabulary.
 * Because the draft and the item were written from this same lesson, that
 * overlap is the item's provenance. `maxChars` is a budget, not a target:
 * nothing is added to fill it, and the result keeps document order.
 *
 * Returns `null` whenever narrowing is not safe or not useful — no chunks, a
 * single chunk, an item with no distinctive words, nothing quoting the item (the
 * item may paraphrase broadly), *every* chunk quoting it, no single section
 * dominating (no saving), or a match that does not fit `maxChars`. The caller
 * then keeps the full slice: a slower prefill is the acceptable failure, lost
 * grounding is not.
 */
export function selectItemChunks(input: ItemScopeInput): LessonChunk[] | null {
  const chunks = Array.isArray(input.chunks) ? input.chunks.filter(chunk => chunk && chunk.text) : [];
  if (chunks.length <= 1) return null;

  const rawReference = String(input.reference ?? '');
  if (!distinctiveTokens(rawReference).size) return null;

  // One pass to know how many chunks each token appears in, so a word that
  // recurs across the whole lesson cannot pretend to identify one section.
  const documentFrequency = new Map<string, number>();
  chunks.forEach(chunk => {
    distinctiveTokens(`${chunk.heading || ''} ${chunk.text}`).forEach(token => {
      documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1);
    });
  });
  const referenceWeight = referenceWeights(rawReference, documentFrequency, chunks.length);
  if (!referenceWeight.size) return null;

  // Ranked coverage, not a boolean filter: the chunks that best explain the item
  // are the ones it was written from. A chunk must explain at least
  // `ITEM_MATCH_COVERAGE` of it, and *every* chunk qualifying means no narrowing is
  // possible (a mixed item), so the caller keeps the full slice.
  const coverages = chunks.map(chunk => itemCoverage(chunk, referenceWeight));
  const matching = chunks.filter((_chunk, position) => coverages[position] >= ITEM_MATCH_COVERAGE);
  if (!matching.length || matching.length === chunks.length) return null;

  // The winning chunk must account for most of what *all* the retrieved chunks
  // explain together. A single-section item leaves its section at 1.0 against
  // near-zero elsewhere; an item that draws on three sections gives 0.63 against
  // 0.25 + 0.13, i.e. a share of 0.63 — the other sections still explain a third
  // of the item, so narrowing to the leader would cut off two thirds of its
  // source. Keeping the full slice costs prefill, sending a wrong slice costs
  // correctness.
  const explained = coverages.reduce((sum, coverage) => sum + coverage, 0);
  const leaderCoverage = Math.max(...coverages);
  if (explained > 0 && leaderCoverage / explained < ITEM_MIN_SHARE) return null;

  // Keep the per-item slice inside the budget. Dropping an arbitrary matching
  // chunk would silently remove part of the item's source, so a slice that does
  // not fit falls back to the full selection instead of being trimmed.
  const characters = matching.reduce((sum, chunk) => sum + chunk.text.length, 0);
  const limit = Math.max(200, Math.round(Number(input.maxChars) || ITEM_MAX_SELECTED_CHARS));
  if (characters > limit) return null;

  return [...matching].sort((left, right) => left.index - right.index);
}

/**
 * Narrows a `ChunkSelection` to one item, returning it unchanged when
 * `selectItemChunks` declines. Callers never special-case grounding.
 */
export function selectChunksForItem(
  selection: ChunkSelection | null,
  input: Omit<ItemScopeInput, 'chunks'>
): ChunkSelection {
  if (!selection) {
    return { selected: [], scores: [], scorer: 'lexical-v1', fallback: false, characters: 0, considered: 0 };
  }
  if (!ITEM_SCOPING_ENABLED) return selection;
  const narrowed = selectItemChunks({ chunks: selection.selected, ...input });
  if (!narrowed) return selection;
  const scoreByIndex = new Map(selection.selected.map((chunk, position) => [chunk.index, selection.scores[position] || 0]));
  return {
    selected: narrowed,
    scores: narrowed.map(chunk => scoreByIndex.get(chunk.index) || 0),
    scorer: selection.scorer,
    fallback: selection.fallback,
    characters: narrowed.reduce((sum, chunk) => sum + chunk.text.length, 0),
    considered: selection.considered
  };
}

/**
 * The query used for retrieval: the lesson topic (weighted), the focus
 * objectives, and the key concepts. The whole analysis is not used on purpose —
 * an objective the teacher did not select must not drag unrelated chunks in.
 *
 * #58: it is also the supervised ranking signal of the preprocessor
 * (`preprocessLessonSource(..., { query })`), because it is exactly "what the
 * teacher asked for" — one query, one meaning, no second vocabulary to maintain.
 */
export function buildRetrievalQuery(input: { analysis: LessonAnalysis; config?: GameConfig | null }): string {
  const { analysis } = input;
  const config = input.config || null;
  const parts: string[] = [];

  const topic = String(analysis.topic || '').trim();
  if (topic) parts.push(topic, topic, topic);
  if (config && config.topic && config.topic.trim() && config.topic.trim() !== topic) {
    parts.push(config.topic.trim(), config.topic.trim());
  }
  if (analysis.subject) parts.push(analysis.subject);
  if (config && config.title) parts.push(config.title);

  const focusIds =
    config && Array.isArray(config.focusObjectiveIds) && config.focusObjectiveIds.length
      ? config.focusObjectiveIds
      : analysis.objectives.map(objective => objective.id);
  analysis.objectives
    .filter(objective => focusIds.includes(objective.id))
    .forEach(objective => parts.push(objective.description));

  analysis.keyConcepts.forEach(concept => {
    parts.push(concept.term, concept.term);
    if (concept.explanation) parts.push(concept.explanation);
  });

  return parts.filter(part => Boolean(part && part.trim())).join('\n');
}
