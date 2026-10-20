import type { CognitiveLevel, WorkflowGameType } from '../shared/lesson-types';

/**
 * The kind of lesson content a game format turns into gameplay well.
 * Used by the rule-based recommender so that choosing a genre never costs a
 * model call (see docs/archive/specs/update-AI-local.txt, section 3 and DECISIONS #20).
 */
export type ContentShape = 'facts' | 'decisions' | 'pairs' | 'sequence' | 'competition';

export interface GameTypeRule {
  gameType: WorkflowGameType;
  /** Teacher-facing Vietnamese name. Keep in sync with the wizard's game meta map. */
  label: string;
  description: string;
  /** Content shapes this format handles well. */
  shapes: readonly ContentShape[];
  /** Cognitive levels this format exercises best. */
  cognitiveLevels: readonly CognitiveLevel[];
  defaultDurationMinutes: number;
  defaultItemCount: number;
  /** Vietnamese phrase used when explaining why the format fits. */
  reasonHint: string;
  /** What a single generated item is called, for human-readable summaries. */
  itemNoun: string;
}

/**
 * Declarative capability table for the five workflow genres. Everything the
 * recommender knows about a genre lives here; the recommender itself only
 * scores lesson features against it.
 */
export const GAME_TYPE_RULES: readonly GameTypeRule[] = [
  {
    gameType: 'arena',
    label: 'Đấu trường kiến thức',
    description: 'Trắc nghiệm tính điểm, thi đua cá nhân hoặc theo đội.',
    shapes: ['facts', 'competition'],
    cognitiveLevels: ['remember', 'understand'],
    defaultDurationMinutes: 10,
    defaultItemCount: 8,
    reasonHint: 'giáo án có nhiều kiến thức rời rạc để hỏi đáp nhanh',
    itemNoun: 'câu hỏi'
  },
  {
    gameType: 'matching',
    label: 'Ghép cặp kiến thức',
    description: 'Ghép thuật ngữ với định nghĩa, ví dụ hoặc phân loại.',
    shapes: ['pairs'],
    cognitiveLevels: ['remember', 'understand'],
    defaultDurationMinutes: 8,
    defaultItemCount: 6,
    reasonHint: 'giáo án có nhiều thuật ngữ gắn với định nghĩa hoặc ví dụ',
    itemNoun: 'cặp ghép'
  },
  {
    gameType: 'scenario',
    label: 'Thử thách tình huống',
    description: 'Ra quyết định trong tình huống thực tế, có phản hồi.',
    shapes: ['decisions'],
    cognitiveLevels: ['apply', 'analyze'],
    defaultDurationMinutes: 15,
    defaultItemCount: 4,
    reasonHint: 'mục tiêu thiên về vận dụng, xử lý tình huống và ra quyết định',
    itemNoun: 'tình huống'
  },
  {
    gameType: 'treasure',
    label: 'Giải mã kho báu',
    description: 'Chuỗi chặng nối tiếp, câu đố và manh mối.',
    shapes: ['sequence'],
    cognitiveLevels: ['understand', 'apply'],
    defaultDurationMinutes: 20,
    defaultItemCount: 4,
    reasonHint: 'kiến thức có trình tự, quy trình hoặc diễn ra theo từng bước',
    itemNoun: 'chặng'
  },
  {
    gameType: 'race',
    label: 'Đường đua chinh phục',
    description: 'Trả lời đúng để tiến ô, có ô đặc biệt và thi đua theo đội.',
    shapes: ['competition', 'facts'],
    cognitiveLevels: ['remember', 'understand'],
    defaultDurationMinutes: 12,
    defaultItemCount: 10,
    reasonHint: 'phù hợp ôn tập nhanh, thi đua nhiều đội và giữ nhịp hứng thú',
    itemNoun: 'câu hỏi'
  }
];

/** Stable order used for deterministic tie-breaking. */
export const GAME_TYPE_ORDER: readonly WorkflowGameType[] = GAME_TYPE_RULES.map(rule => rule.gameType);

export function getGameTypeRule(gameType: WorkflowGameType): GameTypeRule {
  const rule = GAME_TYPE_RULES.find(item => item.gameType === gameType);
  if (!rule) throw new Error(`Thể loại trò chơi không được hỗ trợ: ${gameType}`);
  return rule;
}
