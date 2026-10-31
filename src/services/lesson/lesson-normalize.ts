/**
 * Normalization from raw model JSON to app-owned contracts.
 *
 * The model returns *content* (no `schemaVersion`; analysis/recommendation ids
 * are app-owned). Normalization fills only structural gaps — ids and
 * `schemaVersion` — and then hands the object to the zod parsers. It never
 * invents answers, scores or objective links: anything semantically missing is
 * left for validation (and the repair attempt) to report.
 */
import {
  formatContractIssues,
  parseGameDraft,
  parseGameRecommendation,
  parseLessonAnalysis,
  parseLessonAnalysisContent,
  parseRecommendationsContent
} from './lesson-contracts';
import {
  LESSON_SCHEMA_VERSION,
  type GameDraft,
  type GameRecommendation,
  type GameRecommendationContent,
  type LessonAnalysis,
  type WorkflowGameType
} from '../../shared/lesson-types';

export interface AnalysisIdentity {
  id: string;
  documentId: string;
  createdAt: string;
  sourceDocumentIds: string[];
}

export interface RecommendationIdentity {
  analysisId: string;
  createdAt: string;
  idPrefix?: string;
}

const OPTION_LETTERS = 'abcdefgh';

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Fills a missing `id` in place; leaves existing ids untouched. */
function withId(item: unknown, fallbackId: string): Record<string, unknown> | null {
  const object = asObject(item);
  if (!object) return null;
  if (typeof object.id !== 'string' || !object.id.trim()) object.id = fallbackId;
  return object;
}

function fillOptionIds(options: unknown): unknown[] {
  return asArray(options).map((option, index) => withId(option, OPTION_LETTERS[index] || `o${index + 1}`));
}

/** Adds ids where the model omitted them, then validates against the contract. */
export function normalizeDraft(gameType: WorkflowGameType, content: unknown): GameDraft {
  const object = asObject(content);
  if (!object) {
    throw new Error(`AI không trả về JSON cho trò chơi ${gameType}.`);
  }
  const draft: Record<string, unknown> = { ...object, gameType, schemaVersion: LESSON_SCHEMA_VERSION };

  switch (gameType) {
    case 'arena':
      draft.questions = asArray(object.questions).map((question, index) => {
        const item = withId(question, `q${index + 1}`);
        if (item && 'options' in item) item.options = fillOptionIds(item.options);
        return item;
      }).filter(Boolean);
      break;
    case 'scenario':
      draft.situations = asArray(object.situations).map((situation, index) => {
        const item = withId(situation, `s${index + 1}`);
        if (item && 'options' in item) item.options = fillOptionIds(item.options);
        return item;
      }).filter(Boolean);
      break;
    case 'matching':
      draft.pairs = asArray(object.pairs).map((pair, index) => withId(pair, `p${index + 1}`)).filter(Boolean);
      break;
    case 'treasure':
      draft.stages = asArray(object.stages).map((stage, index) => {
        const item = withId(stage, `st${index + 1}`);
        const question = item ? asObject(item.question) : null;
        if (item && question) {
          question.options = fillOptionIds(question.options);
          item.question = question;
        }
        return item;
      }).filter(Boolean);
      break;
    case 'race':
      draft.teams = asArray(object.teams).map((team, index) => withId(team, `t${index + 1}`)).filter(Boolean);
      draft.questions = asArray(object.questions).map((question, index) => {
        const item = withId(question, `q${index + 1}`);
        if (item && 'options' in item) item.options = fillOptionIds(item.options);
        return item;
      }).filter(Boolean);
      break;
    default:
      break;
  }

  return parseGameDraft(draft);
}

/** Model content for `lesson:analyze` → full `LessonAnalysis` with ids/timestamp. */
export function normalizeAnalysis(content: unknown, identity: AnalysisIdentity): LessonAnalysis {
  const parsed = parseLessonAnalysisContent(content);
  const analysis: LessonAnalysis = {
    id: identity.id,
    schemaVersion: LESSON_SCHEMA_VERSION,
    documentId: identity.documentId,
    subject: parsed.subject,
    grade: parsed.grade,
    topic: parsed.topic,
    objectives: parsed.objectives.map((objective, index) => ({ id: `o${index + 1}`, ...objective })),
    keyConcepts: parsed.keyConcepts.map((concept, index) => ({ id: `k${index + 1}`, ...concept })),
    uncertainties: parsed.uncertainties,
    sourceDocumentIds: identity.sourceDocumentIds,
    createdAt: identity.createdAt
  };
  return parseLessonAnalysis(analysis);
}

/** Model content for `lesson:recommend` → full `GameRecommendation[]`. */
export function normalizeRecommendations(content: unknown, identity: RecommendationIdentity): GameRecommendation[] {
  const parsed: GameRecommendationContent[] = parseRecommendationsContent(content);
  const prefix = identity.idPrefix || 'rec';
  return parsed.map((recommendation, index) => parseGameRecommendation({
    ...recommendation,
    id: `${prefix}${index + 1}`,
    schemaVersion: LESSON_SCHEMA_VERSION,
    analysisId: identity.analysisId,
    createdAt: identity.createdAt
  }));
}

/** Re-exported so workflow errors can show field paths in Vietnamese. */
export { formatContractIssues };
