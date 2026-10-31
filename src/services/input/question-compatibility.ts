/**
 * Which game can a recognised question bank actually be played as? (DECISIONS #115)
 *
 * The wizard used to hard-code "arena" for every imported bank. That is wrong for
 * fill-in-the-blank and short-answer questions, and impossible for a bank with no
 * options at all — the conversion then fails with a gap the teacher did not ask for.
 * This module scores the *real* parsed questions against what each engine accepts,
 * so the suggested genre matches what would survive conversion.
 *
 * The rules mirror `draft-convert.ts` and the draft schemas, not wishes:
 *   - arena      multiple-choice (2–6), true-false, fill-in-blank, short-answer
 *   - race       multiple-choice (2–6) only
 *   - treasure   multiple-choice shaped stages, but every stage needs a story and a
 *                task the bank does not carry (`convertDraft` refuses it, #114)
 *   - matching   needs pairs; questions cannot become pairs
 *   - scenario   needs a situation, options and a consequence; questions have none
 *
 * Pure: no I/O, no clock, no Electron. Unit-tested as a 5 × 7 matrix.
 */
import type { WorkflowGameType } from '../../shared/lesson-types';
import type { ParsedQuestion, ParsedQuestionKind } from './question-import';

export interface GameCompatibility {
  gameType: WorkflowGameType;
  /** Questions this game could play as written. */
  compatible: number;
  /** Questions this game can never play (the teacher must edit or drop them). */
  incompatible: number;
  /** Questions the parser itself could not finish (missing answer, multi-answer…). */
  needsReview: number;
  /** Kinds of the questions this game could play, in source order, de-duplicated. */
  usableKinds: ParsedQuestionKind[];
  /** Short Vietnamese reason, shown next to "Được đề xuất". */
  reason: string;
  score: number;
}

/** The order the steps show games in; also breaks score ties (`arena` first). */
export const COMPATIBILITY_GAME_ORDER: WorkflowGameType[] = ['arena', 'race', 'treasure', 'matching', 'scenario'];

/** Game names as the teacher sees them in step 4. */
export const GAME_LABELS: Record<WorkflowGameType, string> = {
  arena: 'Đấu trường',
  race: 'Đường đua',
  treasure: 'Giải mã kho báu',
  matching: 'Ghép cặp',
  scenario: 'Tình huống'
};

/** Question kinds each engine can take from a bank, with no new content. */
const GAME_ACCEPTS: Record<WorkflowGameType, ParsedQuestionKind[]> = {
  arena: ['multiple-choice', 'true-false', 'fill-in-blank', 'short-answer'],
  race: ['multiple-choice'],
  // Treasure plays the same question shape, but its stages need narrative the bank
  // does not have; the reason below says so instead of pretending it fits.
  treasure: [],
  matching: [],
  scenario: []
};

/** Beyond this many options the draft schema (`answerOptionsSchema`) rejects the question. */
const MAX_OPTIONS = 6;

/**
 * Why a game cannot take the bank even when the kinds line up. `null` means it can.
 */
function structuralBlocker(gameType: WorkflowGameType): string | null {
  if (gameType === 'treasure') return 'Kho báu cần bối cảnh mở đầu và mô tả nhiệm vụ cho từng chặng, mà bộ câu hỏi không có.';
  if (gameType === 'matching') return 'Ghép cặp cần quan hệ hai chiều giữa hai nội dung, không suy ra được từ câu hỏi.';
  if (gameType === 'scenario') return 'Tình huống cần bối cảnh, lựa chọn và hệ quả, không suy ra được từ câu hỏi.';
  return null;
}

function optionCount(question: ParsedQuestion): number {
  return Array.isArray(question.question.options) ? question.question.options.length : 0;
}

/**
 * Score every game for one bank. O(N × 5): each question is read once per game, no
 * model, no conversion — safe to call on every genre click.
 */
export function evaluateCompatibility(questions: ParsedQuestion[]): GameCompatibility[] {
  const list = Array.isArray(questions) ? questions : [];
  return COMPATIBILITY_GAME_ORDER.map(gameType => {
    const accepts = GAME_ACCEPTS[gameType];
    const blocker = structuralBlocker(gameType);
    const usableKinds: ParsedQuestionKind[] = [];
    let compatible = 0;
    let needsReview = 0;
    let incompatible = 0;

    for (const parsed of list) {
      // `multi-answer` / `multi-tf` could go to a game whose kinds overlap, but only
      // by silently dropping the second answer, so they are never "compatible".
      const shaped = accepts.includes(parsed.kind) && (parsed.kind !== 'multiple-choice' || optionCount(parsed) <= MAX_OPTIONS);
      if (parsed.status === 'ready' && shaped) {
        compatible += 1;
        if (!usableKinds.includes(parsed.kind)) usableKinds.push(parsed.kind);
      } else if (parsed.status === 'needs-review') {
        needsReview += 1;
      } else {
        incompatible += 1;
      }
    }

    // A structurally impossible game only loses points: it must never outrank a game
    // that can actually be played just because the bank happens to be large.
    const score = blocker ? -(needsReview + incompatible) : compatible * 10 - needsReview * 2 - incompatible;
    return {
      gameType,
      compatible,
      incompatible,
      needsReview,
      usableKinds,
      reason: compatibilityReason(gameType, compatible, needsReview, incompatible, usableKinds, blocker),
      score
    };
  });
}

function compatibilityReason(
  gameType: WorkflowGameType,
  compatible: number,
  needsReview: number,
  incompatible: number,
  usableKinds: ParsedQuestionKind[],
  blocker: string | null
): string {
  if (blocker) return blocker;
  if (!compatible) {
    if (needsReview) return `Chưa có câu nào sẵn sàng cho ${GAME_LABELS[gameType]}; ${needsReview} câu cần xem lại trước.`;
    return `${GAME_LABELS[gameType]} không dùng được dạng câu hỏi nào trong bộ này.`;
  }
  const kinds = usableKinds.map(kindLabel).join(', ');
  const parts = [`Dùng được cả ${compatible} câu ${kinds}, giữ nguyên đáp án và lời giải.`];
  if (needsReview) parts.push(`${needsReview} câu cần xem lại.`);
  if (incompatible) parts.push(`${incompatible} câu không dùng được.`);
  return parts.join(' ');
}

/** Teacher-facing name of a question kind. */
export function kindLabel(kind: ParsedQuestionKind): string {
  switch (kind) {
    case 'multiple-choice': return 'trắc nghiệm';
    case 'true-false': return 'đúng/sai';
    case 'fill-in-blank': return 'điền khuyết';
    case 'short-answer': return 'trả lời ngắn';
    case 'multi-answer': return 'nhiều đáp án';
    case 'multi-tf': return 'nhiều phát biểu đúng/sai';
    case 'matching': return 'ghép cặp';
    default: return String(kind);
  }
}

/**
 * The game to preselect. Highest score wins; ties keep the step order above, so
 * `arena` still wins a bank every game scores the same on. `null` when no game can
 * play a single question — the teacher must fix the bank, not pick a game that will
 * fail at save time.
 */
export function recommendedGame(results: GameCompatibility[]): WorkflowGameType | null {
  const list = Array.isArray(results) ? results : [];
  if (!list.length) return null;
  const best = list.reduce((winner, current) => {
    if (current.score !== winner.score) return current.score > winner.score ? current : winner;
    return COMPATIBILITY_GAME_ORDER.indexOf(current.gameType) < COMPATIBILITY_GAME_ORDER.indexOf(winner.gameType)
      ? current
      : winner;
  }, list[0]);
  return best && best.compatible > 0 && best.score > 0 ? best.gameType : null;
}

/**
 * The questions a game can play, in source order — the list the wizard converts.
 * Questions in `needs-review` are excluded: the teacher has not decided yet.
 */
export function usableQuestions(questions: ParsedQuestion[], gameType: WorkflowGameType): ParsedQuestion[] {
  const accepts = GAME_ACCEPTS[gameType] || [];
  const list = Array.isArray(questions) ? questions : [];
  return list.filter(parsed =>
    parsed.status === 'ready' &&
    accepts.includes(parsed.kind) &&
    (parsed.kind !== 'multiple-choice' || optionCount(parsed) <= MAX_OPTIONS)
  );
}

/** Questions the chosen game can never play, grouped by kind, for the inline notice. */
export function blockedQuestions(questions: ParsedQuestion[], gameType: WorkflowGameType): ParsedQuestion[] {
  const usable = new Set(usableQuestions(questions, gameType));
  const list = Array.isArray(questions) ? questions : [];
  return list.filter(parsed => !usable.has(parsed) && parsed.status !== 'needs-review');
}
