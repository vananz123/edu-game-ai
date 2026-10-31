/**
 * Cache keys for the AI lesson-to-game workflow (O5 of docs/archive/specs/update-AI-local.txt).
 *
 * docs/archive/specs/update-AI-local.txt §4 and §9: never analyze the same document twice when
 * the document fingerprint, model and analysis configuration are unchanged, and
 * cache generated content with the same versioning rules. The key is a SHA-256
 * over an explicit, ordered list of inputs; anything that changes what the model
 * would see (or which model would answer) produces a different key:
 *
 *   analysis:   document text hash + model id + mode + source name + prompt version
 *               + preprocessor version (O6d)
 *   generation: document id + analysis content fingerprint + game type +
 *               config fingerprint + model id + mode + prompt version
 *
 * Teacher edits therefore invalidate exactly what they touch: editing the
 * analysis changes the generation key but keeps the analysis cached; changing
 * the game type or config changes the generation key; touching the lesson text
 * changes both. A newer schema version invalidates everything.
 *
 * Everything here is pure and deterministic, so it is unit-tested directly.
 */
import { createHash } from 'node:crypto';
import {
  LESSON_SCHEMA_VERSION,
  type GameConfig,
  type LessonAnalysis
} from '../../shared/lesson-types';
import { LESSON_PROMPT_VERSIONS } from './lesson-prompts';
import { LESSON_PREPROCESS_VERSION } from './lesson-preprocess';

export function sha256Hex(value: string): string {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

/** JSON with object keys sorted, so semantically equal inputs hash identically. */
export function stableJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) sorted[key] = sortValue(source[key]);
    return sorted;
  }
  return value;
}

/**
 * `kind` keeps analysis/draft/item keys in separate namespaces. Parts are joined
 * with a unit separator (never present in ids/labels) to avoid collisions when a
 * free-text field happens to contain the joining character.
 */
export function cacheKey(kind: string, parts: Array<string | number | boolean | null | undefined>): string {
  const payload = parts
    .map(part => (part === null || part === undefined ? '' : String(part)))
    .join('\u001f');
  return `${kind}_v${LESSON_SCHEMA_VERSION}_${sha256Hex(`${kind}\u001f${payload}`)}`;
}

export interface AnalysisCacheKeyInput {
  /** SHA-256 of the lesson text the model will read. */
  documentSha256: string;
  modelId: string;
  mode: string;
  /**
   * #132: the provider that runs the model. Two providers can serve an identically
   * named model (`gemini-2.5-flash` behind two gateways), and their analyses must
   * not share a cache row. Appended empty when absent, which keeps every pre-#132
   * key byte-identical.
   */
  provider?: string;
  sourceName?: string;
  /**
   * O6d: version of the offline preprocessor that produced the excerpt. It
   * changes what the model reads without changing the document hash, so it must
   * be part of the key; a bump invalidates cached analyses automatically.
   */
  preprocessVersion?: number;
  /**
   * #76: fingerprint of the teacher's section scope (`selectionFingerprint`).
   * Two different picks on the same document produce different text and must not
   * share an analysis. Absent keeps the key byte-identical to the pre-#76 one, so
   * every analysis cached for a whole-document run still hits.
   */
  selectionFingerprint?: string;
}

export function buildAnalysisCacheKey(input: AnalysisCacheKeyInput): string {
  return cacheKey('analysis', [
    LESSON_PROMPT_VERSIONS.analysis,
    // O6d: the preprocessor changes what the model reads, so its version is part
    // of the key; `input.preprocessVersion` lets a caller pin a specific one.
    input.preprocessVersion === undefined ? LESSON_PREPROCESS_VERSION : input.preprocessVersion,
    input.documentSha256,
    input.modelId,
    input.mode,
    input.sourceName || '',
    // #76: appended last and empty when absent. NOTE: this changes the hash of
    // every whole-document key by one separator (`…\u001f`), so each document is
    // analysed once more after the upgrade; no stored analysis is *mis*-reused,
    // which is the property that matters (a stale hit would be a wrong answer).
    input.selectionFingerprint || '',
    // #132: same lesson analysed by another provider is a different analysis.
    input.provider || ''
  ]);
}

/**
 * update_quy_trinh_2 §6: a classification is derived from the selected text and the
 * rule/embedding versions, so the cache key includes both. Bumping
 * `CLASSIFIER_VERSION` after changing the rules invalidates every stored verdict.
 */
export const CLASSIFIER_VERSION = 1;

export interface ClassificationCacheKeyInput {
  /** Exact text the classifier saw (the prepared selection, not the whole document). */
  text: string;
  /** Embedding model id when the semantic layer was available; `''` for rules only. */
  embeddingModelId?: string;
  /** Classifier version; defaults to the current one. */
  classifierVersion?: number;
}

export function buildClassificationCacheKey(input: ClassificationCacheKeyInput): string {
  return cacheKey('classify', [
    input.classifierVersion === undefined ? CLASSIFIER_VERSION : input.classifierVersion,
    input.embeddingModelId || '',
    // A hash, not the text: the key must not carry lesson content into logs or rows.
    sha256Hex(String(input.text ?? '')),
    String(input.text ?? '').length
  ]);
}

/**
 * Hash of the analysis content the draft prompt actually uses. Objectives and
 * concepts are the pedagogical input; `uncertainties` are shown to the teacher
 * but never sent to the generation prompt, so editing them must not throw away
 * cached content.
 */
export function analysisFingerprint(analysis: LessonAnalysis): string {
  return sha256Hex(stableJson({
    topic: analysis.topic,
    subject: analysis.subject,
    grade: analysis.grade,
    objectives: analysis.objectives.map(objective => ({
      id: objective.id,
      description: objective.description,
      cognitiveLevel: objective.cognitiveLevel
    })),
    keyConcepts: analysis.keyConcepts.map(concept => ({
      id: concept.id,
      term: concept.term,
      explanation: concept.explanation
    }))
  }));
}

/** Every config field is part of the draft prompt, so all of them are part of the key. */
export function configFingerprint(config: GameConfig): string {
  return sha256Hex(stableJson(config));
}

export interface GenerationCacheKeyInput {
  documentId: string;
  analysisFingerprint: string;
  gameType: string;
  configFingerprint: string;
  modelId: string;
  mode: string;
  /**
   * #132: who produced the draft. A draft made by the explicit cloud button must not
   * be reused when the teacher goes back to AI local, even with the same model id.
   * Appended empty when absent, so every pre-#132 key stays byte-identical.
   */
  provider?: string;
}

export function buildGenerationCacheKey(input: GenerationCacheKeyInput): string {
  return cacheKey('draft', [
    LESSON_PROMPT_VERSIONS.draft,
    input.documentId,
    input.analysisFingerprint,
    input.gameType,
    input.configFingerprint,
    input.modelId,
    input.mode,
    input.provider || ''
  ]);
}
