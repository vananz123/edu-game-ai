/**
 * Convert an existing draft into another game type *locally*, without the model.
 *
 * docs/archive/specs/update_quy_trinh.txt §4: "Không sinh lại toàn bộ câu hỏi chỉ vì
 * giáo viên thay đổi thể loại trò chơi." Each game type has its own draft shape, so
 * some pairs cannot be converted without inventing content:
 *
 *   arena ⇄ race      both are "question + options + answer + explanation" lists
 *   arena ⇄ treasure  each question becomes one journey stage (and back)
 *
 * Everything else (matching pairs, scenario branches) needs relationships or
 * situations the teacher never wrote, so it is reported as `missing` and the caller
 * asks the teacher whether to let the model fill the gap. This module never calls
 * the model and never mutates its input.
 *
 * Pure: no I/O, no clock, no Electron. Unit-tested as a 5×5 matrix.
 */
import {
  LESSON_SCHEMA_VERSION,
  WORKFLOW_GAME_TYPES,
  type ArenaChoiceQuestion,
  type ArenaDraft,
  type ArenaOption,
  type ArenaQuestion,
  type GameConfig,
  type GameDraft,
  type RaceDraft,
  type RaceQuestionDraft,
  type TreasureDraft,
  type TreasureStageDraft,
  type WorkflowGameType
} from '../../shared/lesson-types';

/** One thing that could not be carried over, phrased for the teacher. */
export interface ConversionGap {
  /** Stable key so the UI can group/summarise the list. */
  key: string;
  /** Short label of the source item ("Câu 2", "Cặp 3"). */
  item: string;
  reason: string;
}

export interface ConversionResult {
  /** `null` means "nothing usable could be converted" — do not save this draft. */
  draft: GameDraft | null;
  /** Items copied 1:1 (question text, options, answer, explanation). */
  converted: number;
  /** Items the target type needs but the source does not have. */
  gaps: ConversionGap[];
  /** True when `draft` is complete enough to use with no model call. */
  complete: boolean;
}

/** A choice question carrying everything arena/race/treasure all understand. */
interface CommonChoice {
  id: string;
  prompt: string;
  options: ArenaOption[];
  correctOptionId: string;
  explanation: string;
  difficulty?: 'dễ' | 'trung bình' | 'khó';
  points?: number;
}

function cloneOptions(options: ArenaOption[] | undefined): ArenaOption[] {
  return Array.isArray(options) ? options.map(option => ({ id: option.id, text: option.text })) : [];
}

/**
 * Read a question down to the fields all three question-based types share.
 * Returns `null` when the source item cannot be expressed as a choice question
 * (a fill-in-blank has no options; a scenario branch has no single right answer).
 */
function asCommonChoice(question: ArenaQuestion | RaceQuestionDraft | TreasureStageDraft['question'], label: string): { choice: CommonChoice | null; gap: ConversionGap | null } {
  if (!question) return { choice: null, gap: { key: 'missing-question', item: label, reason: 'Không có nội dung câu hỏi.' } };
  const options = cloneOptions((question as { options?: ArenaOption[] }).options);
  const correctOptionId = String((question as { correctOptionId?: string }).correctOptionId || '');
  if (options.length < 2) {
    // Only race refuses a written-answer question by name; arena keeps it as an
    // option-free `fill-in-blank`/`short-answer`, so the generic "no options" wording
    // stays for every other target.
    const questionType = String((question as { type?: string }).type || '');
    if (label.startsWith('Đường đua') && (questionType === 'fill-in-blank' || questionType === 'short-answer')) {
      return { choice: null, gap: { key: 'race-text-only', item: label, reason: 'Đường đua chỉ nhận câu trắc nghiệm có phương án; câu điền khuyết hoặc trả lời ngắn không chuyển được.' } };
    }
    return { choice: null, gap: { key: 'no-options', item: label, reason: 'Câu này không có phương án để dùng cho thể loại mới (cần ít nhất hai phương án).' } };
  }
  if (options.length > 6) {
    return { choice: null, gap: { key: 'too-many-options', item: label, reason: 'Câu này có hơn 6 phương án; trò chơi chỉ nhận tối đa 6 phương án mỗi câu.' } };
  }
  if (!correctOptionId || !options.some(option => option.id === correctOptionId)) {
    return { choice: null, gap: { key: 'no-answer', item: label, reason: 'Câu này chưa có đáp án đúng khớp với phương án.' } };
  }
  // Every target schema requires a non-empty explanation (`nonEmpty`), and inventing
  // one would be writing content the teacher did not. Scenario situations carry no
  // explanation at all, so they are reported here rather than producing a draft the
  // store rejects later.
  const explanation = String((question as { explanation?: string }).explanation || '').trim();
  if (!explanation) {
    return { choice: null, gap: { key: 'no-explanation', item: label, reason: 'Câu này chưa có lời giải/giải thích cho đáp án.' } };
  }
  return {
    choice: {
      // `TreasureQuestionDraft` has no id of its own (the stage holds it), so read it
      // defensively and fall back to the label.
      id: String((question as { id?: string }).id || label),
      prompt: String((question as { prompt?: string }).prompt || ''),
      options,
      correctOptionId,
      explanation,
      ...((question as { difficulty?: CommonChoice['difficulty'] }).difficulty ? { difficulty: (question as { difficulty: CommonChoice['difficulty'] }).difficulty } : {}),
      ...(typeof (question as { points?: number }).points === 'number' ? { points: (question as { points: number }).points } : {})
    },
    gap: null
  };
}

function arenaQuestions(draft: ArenaDraft): { choices: CommonChoice[]; gaps: ConversionGap[] } {
  const choices: CommonChoice[] = [];
  const gaps: ConversionGap[] = [];
  draft.questions.forEach((question, index) => {
    const label = `Câu ${index + 1}`;
    const { choice, gap } = asCommonChoice(question, label);
    if (choice) choices.push(choice);
    else if (gap) gaps.push(gap);
  });
  return { choices, gaps };
}

function raceQuestions(draft: RaceDraft): { choices: CommonChoice[]; gaps: ConversionGap[] } {
  const choices: CommonChoice[] = [];
  const gaps: ConversionGap[] = [];
  draft.questions.forEach((question, index) => {
    const { choice, gap } = asCommonChoice(question, `Đường đua · Câu ${index + 1}`);
    if (choice) choices.push(choice);
    else if (gap) gaps.push(gap);
  });
  return { choices, gaps };
}

function treasureQuestions(draft: TreasureDraft): { choices: CommonChoice[]; gaps: ConversionGap[] } {
  const choices: CommonChoice[] = [];
  const gaps: ConversionGap[] = [];
  draft.stages.forEach((stage, index) => {
    const label = stage.name ? `Chặng ${index + 1} (${stage.name})` : `Chặng ${index + 1}`;
    const missionType = stage.mission && stage.mission.type ? stage.mission.type : 'multiple-choice';
    if (missionType !== 'multiple-choice' && missionType !== 'scenario') {
      gaps.push({ key: 'mission-unsupported', item: label, reason: `Nhiệm vụ “${missionType}” của chặng này không có dạng câu hỏi để đổi sang thể loại mới.` });
      return;
    }
    const { choice, gap } = asCommonChoice(stage.question, label);
    if (choice) {
      choices.push({ ...choice, ...(typeof stage.points === 'number' ? { points: stage.points } : {}) });
    } else if (gap) gaps.push(gap);
  });
  return { choices, gaps };
}

/** Collect the choice questions any convertible source holds. */
function collectChoices(source: GameDraft): { choices: CommonChoice[]; gaps: ConversionGap[] } {
  switch (source.gameType) {
    case 'arena':
      return arenaQuestions(source);
    case 'race':
      return raceQuestions(source);
    case 'treasure':
      return treasureQuestions(source);
    case 'matching':
      return {
        choices: [],
        gaps: [{
          key: 'matching-pairs',
          item: `${source.pairs.length} cặp ghép`,
          reason: 'Cặp ghép là quan hệ giữa hai nội dung; không thể biến thành câu hỏi có đáp án mà không tự viết thêm nội dung.'
        }]
      };
    case 'scenario':
      return {
        choices: [],
        gaps: [{
          key: 'scenario-branches',
          item: `${source.situations.length} tình huống`,
          reason: 'Tình huống có nhánh và hệ quả riêng; không thể biến thành câu hỏi trắc nghiệm mà không tự viết thêm nội dung.'
        }]
      };
    default:
      return { choices: [], gaps: [{ key: 'unknown-source', item: 'Nội dung hiện có', reason: 'Không nhận diện được thể loại nguồn.' }] };
  }
}

function toArena(choices: CommonChoice[]): ArenaDraft {
  return {
    gameType: 'arena',
    schemaVersion: LESSON_SCHEMA_VERSION,
    questions: choices.map((choice, index) => ({
      id: `q${index + 1}`,
      type: 'multiple-choice',
      prompt: choice.prompt,
      options: choice.options,
      correctOptionId: choice.correctOptionId,
      explanation: choice.explanation,
      difficulty: choice.difficulty || 'trung bình',
      points: choice.points || 100
    } as ArenaChoiceQuestion & ArenaQuestion))
  };
}

function toRace(choices: CommonChoice[], config: GameConfig): RaceDraft {
  const raceConfig = config && config.gameType === 'race' ? config : null;
  return {
    gameType: 'race',
    schemaVersion: LESSON_SCHEMA_VERSION,
    trackLength: raceConfig ? raceConfig.trackLength : 20,
    maxRounds: raceConfig ? raceConfig.maxRounds : 10,
    stepByDifficulty: raceConfig ? raceConfig.stepByDifficulty : true,
    luckEnabled: raceConfig ? raceConfig.luckEnabled : false,
    // Teams are game furniture, not teacher content: two defaults keep the race playable.
    teams: [{ id: 't1', name: 'Đội 1' }, { id: 't2', name: 'Đội 2' }],
    cells: [],
    questions: choices.map((choice, index) => ({
      id: `q${index + 1}`,
      prompt: choice.prompt,
      options: choice.options,
      correctOptionId: choice.correctOptionId,
      explanation: choice.explanation,
      difficulty: choice.difficulty || 'trung bình'
    }))
  };
}

function toTreasure(choices: CommonChoice[], config: GameConfig): TreasureDraft {
  const treasureConfig = config && config.gameType === 'treasure' ? config : null;
  const stages: TreasureStageDraft[] = choices.map((choice, index) => ({
    id: `s${index + 1}`,
    name: `Chặng ${index + 1}`,
    // Empty on purpose: inventing a story would be writing content the teacher did not.
    // `convertDraft` refuses this target unless the source actually carries this text
    // (see `treasureHasNarrative`), because the schema rejects empty stages.
    story: '',
    taskDescription: '',
    question: {
      prompt: choice.prompt,
      options: choice.options,
      correctOptionId: choice.correctOptionId,
      explanation: choice.explanation
    },
    attempts: treasureConfig ? treasureConfig.attemptsPerStage : 1,
    points: choice.points || 100,
    completionBonus: 0,
    nextStageId: null
  }));
  return {
    gameType: 'treasure',
    schemaVersion: LESSON_SCHEMA_VERSION,
    character: 'explorer',
    intro: '',
    journeyBonus: treasureConfig ? treasureConfig.journeyBonus : 300,
    hiddenItemBonus: treasureConfig ? treasureConfig.hiddenItemBonus : 50,
    stages
  };
}

/**
 * A treasure draft is only valid when every stage has a story and a task, and the
 * journey has an intro (`treasureStageSchema`: `nonEmpty` for all three). A source
 * draft that only holds questions has none of that, and inventing it would be
 * writing content on the teacher's behalf — so the conversion is refused instead of
 * producing a draft the store will reject mid-save.
 */
function treasureNarrativeComplete(source: GameDraft): boolean {
  if (source.gameType !== 'treasure') return false;
  const hasText = (value: unknown) => String(value ?? '').trim().length > 0;
  if (!hasText(source.intro)) return false;
  return source.stages.every(stage => hasText(stage.story) && hasText(stage.taskDescription));
}

/**
 * Convert `source` into `target`. Never mutates `source`; returns `draft: null` when
 * nothing could be converted (the caller must then either call the model or stop).
 */
export function convertDraft(source: GameDraft | null | undefined, target: WorkflowGameType, config: GameConfig): ConversionResult {
  if (!source) {
    return { draft: null, converted: 0, gaps: [{ key: 'no-source', item: 'Nội dung hiện có', reason: 'Chưa có bản nháp để chuyển đổi.' }], complete: false };
  }
  // Fail closed: an unknown target used to fall through the ternary below into
  // `toTreasure`, silently producing a treasure draft for e.g. `'__proto__'`.
  if (!WORKFLOW_GAME_TYPES.includes(target)) {
    return { draft: null, converted: 0, gaps: [{ key: 'unknown-target', item: String(target), reason: 'Thể loại đích không hợp lệ.' }], complete: false };
  }
  if (source.gameType === target) {
    // Same type: nothing to convert, and nothing to call the model for.
    return { draft: source, converted: 0, gaps: [], complete: true };
  }

  const { choices, gaps } = collectChoices(source);

  if (target === 'matching' || target === 'scenario') {
    return {
      draft: null,
      converted: 0,
      gaps: [
        ...(choices.length ? [{
          key: 'needs-relationships',
          item: `${choices.length} câu hỏi`,
          reason: target === 'matching'
            ? 'Ghép cặp cần quan hệ hai chiều giữa hai nội dung, không suy ra được từ câu hỏi trắc nghiệm.'
            : 'Thử thách tình huống cần bối cảnh, lựa chọn và hệ quả, không suy ra được từ câu hỏi trắc nghiệm.'
        }] : []),
        ...gaps
      ],
      complete: false
    };
  }

  if (!choices.length) {
    return { draft: null, converted: 0, gaps, complete: false };
  }

  // Each target has a minimum the schema enforces (`treasureDraftBase` wants >= 2
  // stages). Producing fewer used to return `complete: true`, saving a draft that
  // only failed later at generation with an opaque GENERATION_INVALID. Report it
  // here instead, so the wizard can tell the teacher what is missing.
  const targetMinimums: Partial<Record<WorkflowGameType, { min: number; reason: string }>> = {
    treasure: { min: 2, reason: 'Giải mã kho báu cần ít nhất 2 chặng; nội dung hiện có chưa đủ để chuyển.' },
    matching: { min: 2, reason: 'Ghép cặp cần ít nhất 2 cặp.' }
  };
  const minimum = targetMinimums[target];
  if (minimum && choices.length < minimum.min) {
    return {
      draft: null,
      converted: 0,
      gaps: [...gaps, { key: 'too-few-items', item: `${choices.length} mục`, reason: minimum.reason }],
      complete: false
    };
  }

  // Treasure additionally needs narrative the source draft may not have. Producing a
  // draft with empty `intro`/`story`/`taskDescription` used to look complete and then
  // fail at `parseGameDraft` inside `saveProject` (measured: STORE_INVALID_PROJECT).
  if (target === 'treasure' && !treasureNarrativeComplete(source)) {
    return {
      draft: null,
      converted: 0,
      gaps: [...gaps, {
        key: 'needs-narrative',
        item: `${choices.length} câu hỏi`,
        reason: 'Kho báu cần bối cảnh mở đầu và mô tả nhiệm vụ cho từng chặng; nội dung hiện có chưa có. Hãy để AI viết phần này.'
      }],
      complete: false
    };
  }

  const draft = target === 'arena' ? toArena(choices) : target === 'race' ? toRace(choices, config) : toTreasure(choices, config);
  return { draft, converted: choices.length, gaps, complete: gaps.length === 0 };
}
