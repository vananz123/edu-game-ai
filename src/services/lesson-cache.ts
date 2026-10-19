/**
 * Cache keys for the AI lesson-to-game workflow (O5 of docs/update-AI-local.txt).
 *
 * docs/update-AI-local.txt §4 and §9: never analyze the same document twice when
 * the document fingerprint, model and analysis configuration are unchanged, and
 * cache generated content with the same versioning rules. The key is a SHA-256
 * over an explicit, ordered list of inputs; anything that changes what the model
 * would see (or which model would answer) produces a different key:
 *
 *   analysis:   document text hash + model id + mode + source name + prompt version
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
} from '../shared/lesson-types';
import { LESSON_PROMPT_VERSIONS } from './lesson-prompts';

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
  sourceName?: string;
}

export function buildAnalysisCacheKey(input: AnalysisCacheKeyInput): string {
  return cacheKey('analysis', [
    LESSON_PROMPT_VERSIONS.analysis,
    input.documentSha256,
    input.modelId,
    input.mode,
    input.sourceName || ''
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
}

export function buildGenerationCacheKey(input: GenerationCacheKeyInput): string {
  return cacheKey('draft', [
    LESSON_PROMPT_VERSIONS.draft,
    input.documentId,
    input.analysisFingerprint,
    input.gameType,
    input.configFingerprint,
    input.modelId,
    input.mode
  ]);
}
