import type { CognitiveLevel, GameRecommendation, LessonAnalysis, WorkflowGameType } from '../../shared/lesson-types';
import { GAME_TYPE_ORDER, GAME_TYPE_RULES, getGameTypeRule, type ContentShape } from './game-type-rules';
import { estimateItemCapacity, type GenerationMode } from '../lesson/item-capacity';

/**
 * Rule-based genre recommender.
 *
 * The wizard used to spend one Qwen call only to choose between five genres it
 * already knows how to build. That step is deterministic, so it now runs in
 * TypeScript: zero model calls, instant, stable and explainable
 * (docs/archive/specs/update-AI-local.txt section 3, DECISIONS #20). The output shape is
 * unchanged, so the renderer, storage and project step machine keep working.
 *
 * The teacher can still pick any other genre; these are suggestions only.
 */

const MAX_TITLE = 160;
const MAX_DESCRIPTION = 500;
const MAX_REASON = 800;
const MAX_OBJECTIVE_IDS = 4;

/** Vietnamese signals extracted from the lesson analysis. */
const SHAPE_KEYWORDS: Record<ContentShape, readonly string[]> = {
  facts: ['khái niệm', 'định nghĩa', 'đặc điểm', 'vai trò', 'cấu tạo', 'thành phần', 'liệt kê'],
  decisions: [
    'tình huống',
    'xử lý',
    'quyết định',
    'lựa chọn',
    'nên làm',
    'vì sao',
    'giải thích',
    'vận dụng',
    'ứng dụng',
    'phân tích',
    'đánh giá',
    'hậu quả'
  ],
  pairs: ['ghép', 'tương ứng', 'phân loại', 'thuật ngữ', 'nghĩa là', 'ví dụ'],
  sequence: [
    'quy trình',
    'các bước',
    'từng bước',
    'giai đoạn',
    'chu trình',
    'trình tự',
    'đầu tiên',
    'tiếp theo',
    'sau đó',
    'cuối cùng',
    'vòng tuần hoàn',
    'diễn biến'
  ],
  competition: ['thi đua', 'đội', 'nhóm', 'tính điểm', 'tốc độ', 'nhanh', 'ôn tập', 'củng cố']
};

export interface LessonSignals {
  objectiveCount: number;
  conceptCount: number;
  rememberCount: number;
  understandCount: number;
  applyCount: number;
  analyzeCount: number;
  /** 0..1 share of objectives at remember/understand level. */
  basicRatio: number;
  /** 0..1 share of objectives at apply/analyze level. */
  advancedRatio: number;
  /** How many distinct keyword hits each content shape got. */
  shapeHits: Record<ContentShape, number>;
}

export interface ScoredGameType {
  gameType: WorkflowGameType;
  score: number;
  /** Shapes that actually matched lesson text, for the explanation. */
  matchedShapes: ContentShape[];
}

function clampInt(value: number, min: number, max: number): number {
  const rounded = Math.round(Number(value));
  if (!Number.isFinite(rounded)) return min;
  return Math.min(max, Math.max(min, rounded));
}

function truncate(text: string, max: number): string {
  const value = String(text ?? '').trim();
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

function countKeywordHits(haystack: string, keywords: readonly string[]): number {
  let hits = 0;
  keywords.forEach(keyword => {
    if (haystack.includes(keyword)) hits += 1;
  });
  return hits;
}

/** Builds the searchable text blob from the analysis (topic + objectives + concepts). */
function buildLessonText(analysis: LessonAnalysis): string {
  const parts: string[] = [analysis.topic || ''];
  (analysis.objectives || []).forEach(objective => parts.push(objective.description || ''));
  (analysis.keyConcepts || []).forEach(concept => parts.push(concept.term || '', concept.explanation || ''));
  return parts.join(' ').toLowerCase();
}

export function analyzeLessonSignals(analysis: LessonAnalysis): LessonSignals {
  const objectives = analysis.objectives || [];
  const concepts = analysis.keyConcepts || [];
  const countLevel = (level: CognitiveLevel) => objectives.filter(item => item.cognitiveLevel === level).length;
  const total = objectives.length || 1;
  const text = buildLessonText(analysis);
  const shapeHits = {} as Record<ContentShape, number>;
  (Object.keys(SHAPE_KEYWORDS) as ContentShape[]).forEach(shape => {
    shapeHits[shape] = countKeywordHits(text, SHAPE_KEYWORDS[shape]);
  });
  const rememberCount = countLevel('remember');
  const understandCount = countLevel('understand');
  const applyCount = countLevel('apply');
  const analyzeCount = countLevel('analyze');
  return {
    objectiveCount: objectives.length,
    conceptCount: concepts.length,
    rememberCount,
    understandCount,
    applyCount,
    analyzeCount,
    basicRatio: (rememberCount + understandCount) / total,
    advancedRatio: (applyCount + analyzeCount) / total,
    shapeHits
  };
}

/**
 * Scores all five genres against the lesson. Pure function: the same analysis
 * always produces the same scores, so recommendations are reproducible.
 */
export function scoreGameTypes(analysis: LessonAnalysis): ScoredGameType[] {
  const signals = analyzeLessonSignals(analysis);
  const { shapeHits, conceptCount, objectiveCount, basicRatio, advancedRatio } = signals;
  // Cap keyword bonuses so one repeated word cannot dominate the ranking.
  const bonus = (hits: number, weight: number) => Math.min(36, hits * weight);

  const scores: Record<WorkflowGameType, number> = {
    arena: 30 + conceptCount * 4 + Math.round(basicRatio * 20) + (objectiveCount >= 2 ? 5 : 0),
    matching:
      20 +
      (conceptCount >= 4 ? 30 : conceptCount * 6) +
      bonus(shapeHits.pairs, 12) +
      Math.round(basicRatio * 10),
    scenario:
      15 +
      Math.round(advancedRatio * 40) +
      bonus(shapeHits.decisions, 14) +
      (objectiveCount >= 2 ? 6 : 0),
    treasure:
      15 +
      bonus(shapeHits.sequence, 16) +
      Math.round(advancedRatio * 12) +
      (objectiveCount >= 3 ? 8 : 0) +
      (conceptCount >= 4 ? 4 : 0),
    race:
      18 +
      bonus(shapeHits.competition, 12) +
      conceptCount * 3 +
      Math.round(basicRatio * 12) +
      (objectiveCount >= 3 ? 4 : 0)
  };

  return GAME_TYPE_ORDER.map(gameType => {
    const rule = getGameTypeRule(gameType);
    const matchedShapes = rule.shapes.filter(shape => shapeHits[shape] > 0);
    return { gameType, score: scores[gameType], matchedShapes };
  }).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return GAME_TYPE_ORDER.indexOf(a.gameType) - GAME_TYPE_ORDER.indexOf(b.gameType);
  });
}

/** Objectives that fit the genre's cognitive levels, capped and falling back to the first ones. */
function pickObjectiveIds(analysis: LessonAnalysis, gameType: WorkflowGameType): string[] {
  const objectives = analysis.objectives || [];
  if (!objectives.length) return [];
  const rule = getGameTypeRule(gameType);
  const preferred = objectives.filter(objective => rule.cognitiveLevels.includes(objective.cognitiveLevel));
  const ordered = preferred.length ? preferred : objectives;
  return ordered.slice(0, MAX_OBJECTIVE_IDS).map(objective => objective.id);
}

function buildReason(
  analysis: LessonAnalysis,
  gameType: WorkflowGameType,
  signals: LessonSignals,
  matchedShapes: ContentShape[]
): string {
  const rule = getGameTypeRule(gameType);
  const reasons: string[] = [];

  if (matchedShapes.length) {
    const texts = (analysis.objectives || [])
      .concat([])
      .map(objective => objective.description || '')
      .join(' ')
      .toLowerCase();
    const evidence = SHAPE_KEYWORDS[matchedShapes[0]].filter(keyword => texts.includes(keyword) || (analysis.topic || '').toLowerCase().includes(keyword));
    if (evidence.length) reasons.push(`giáo án có dấu hiệu về ${evidence.slice(0, 2).join(', ')}`);
  }

  if ((gameType === 'scenario' || gameType === 'treasure') && signals.advancedRatio >= 0.5) {
    reasons.push('phần lớn mục tiêu ở mức vận dụng/phân tích nên cần hoạt động ra quyết định');
  }
  if ((gameType === 'arena' || gameType === 'race' || gameType === 'matching') && signals.basicRatio >= 0.6) {
    reasons.push('mục tiêu chủ yếu ở mức ghi nhớ/hiểu nên hợp lối chơi hỏi đáp nhanh');
  }
  if (gameType === 'matching' && signals.conceptCount >= 4) {
    reasons.push(`${signals.conceptCount} kiến thức trọng tâm có thể ghép thành cặp`);
  }
  if (gameType === 'treasure' && signals.objectiveCount >= 3) {
    reasons.push(`${signals.objectiveCount} mục tiêu có thể trải thành chuỗi chặng`);
  }

  reasons.push(rule.reasonHint);
  const summary = `Phù hợp vì ${reasons.join('; ')}. Giáo viên vẫn có thể chọn thể loại khác nếu muốn.`;
  return truncate(summary, MAX_REASON);
}

function buildDescription(analysis: LessonAnalysis, gameType: WorkflowGameType, itemCount: number): string {
  const rule = getGameTypeRule(gameType);
  const topic = (analysis.topic || '').trim();
  const scope = topic ? ` cho chủ đề “${topic}”` : '';
  return truncate(`${rule.description} Dự kiến ${itemCount} ${rule.itemNoun}${scope}.`, MAX_DESCRIPTION);
}

function suggestedItemCount(
  analysis: LessonAnalysis,
  gameType: WorkflowGameType,
  signals: LessonSignals,
  options: Pick<RecommendGamesOptions, 'documentCharacters' | 'modelId' | 'mode'>
): number {
  // O12: the same estimator the config step uses, so the card's "Dự kiến N"
  // matches the count the wizard starts from. Automatic counts are 4..7 and
  // capped by the model tier; the teacher can still edit the number later.
  return estimateItemCapacity({
    gameType,
    documentCharacters: options.documentCharacters || 0,
    objectiveCount: signals.objectiveCount,
    conceptCount: signals.conceptCount,
    modelId: options.modelId,
    mode: options.mode
  }).suggested;
}

export interface RecommendGamesOptions {
  analysis: LessonAnalysis;
  /** Recommendation ids are a global primary key, so scope them to the analysis. */
  idPrefix?: string;
  now?: string;
  /** How many genres to offer (2 or 3). Defaults from how rich the lesson is. */
  limit?: number;
  /** Document length, when known, so suggested counts respect the material. */
  documentCharacters?: number;
  /** Model used for generation (affects the suggested count ceiling). */
  modelId?: string;
  mode?: GenerationMode;
}

/**
 * Produces 2-3 genre suggestions without calling a model.
 * The result satisfies `gameRecommendationSchema` from lesson-contracts.
 */
export function recommendGamesForAnalysis(options: RecommendGamesOptions): GameRecommendation[] {
  const { analysis } = options;
  const signals = analyzeLessonSignals(analysis);
  const defaultLimit = signals.objectiveCount >= 4 && signals.conceptCount >= 5 ? 3 : 2;
  const limit = clampInt(options.limit ?? defaultLimit, 1, GAME_TYPE_RULES.length);
  const now = options.now || new Date().toISOString();
  const idPrefix = options.idPrefix || `rec_${analysis.id}_`;
  const ranked = scoreGameTypes(analysis).slice(0, limit);

  return ranked.map(item => {
    const rule = getGameTypeRule(item.gameType);
    const itemCount = suggestedItemCount(analysis, item.gameType, signals, options);
    const topic = (analysis.topic || '').trim();
    return {
      id: `${idPrefix}${item.gameType}`,
      schemaVersion: 1 as const,
      analysisId: analysis.id,
      gameType: item.gameType,
      title: truncate(topic ? `${rule.label} — ${topic}` : rule.label, MAX_TITLE),
      description: buildDescription(analysis, item.gameType, itemCount),
      reason: buildReason(analysis, item.gameType, signals, item.matchedShapes),
      learningObjectiveIds: pickObjectiveIds(analysis, item.gameType),
      suggestedDurationMinutes: clampInt(rule.defaultDurationMinutes, 3, 60),
      suggestedQuestionCount: itemCount,
      createdAt: now
    };
  });
}
