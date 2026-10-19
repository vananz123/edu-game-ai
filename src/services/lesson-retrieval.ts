/**
 * Lesson chunk retrieval (O3 of docs/update-AI-local.txt).
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

const BM25_K1 = 1.5;
const BM25_B = 0.75;

/** Common Vietnamese function words; dropping them keeps the ranking about content. */
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
        const df = documentFrequency.get(token) || 0;
        const idf = Math.log(1 + (documents.length - df + 0.5) / (df + 0.5));
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
 * The query used for retrieval: the lesson topic (weighted), the focus
 * objectives, and the key concepts. The whole analysis is not used on purpose —
 * an objective the teacher did not select must not drag unrelated chunks in.
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
