/**
 * Runtime contracts (zod) for the lesson-to-game workflow.
 *
 * The schemas validate both:
 *  - data returned by the local model (content schemas, before ids/timestamps), and
 *  - data persisted by the app (full schemas, including ids + schemaVersion).
 *
 * Validation never silently repairs data. Normalization assigns ids before these
 * schemas run; anything else that fails is surfaced to the teacher.
 */
import { z } from 'zod';
import type {
  ArenaDraft,
  GameConfig,
  GameDraft,
  GameRecommendation,
  GameRecommendationContent,
  LessonAnalysis,
  LessonAnalysisContent,
  WorkflowGameType
} from '../shared/lesson-types';

export class LessonContractError extends Error {
  readonly code: string;
  readonly issues: string[];

  constructor(code: string, message: string, issues: string[] = []) {
    super(message);
    this.name = 'LessonContractError';
    this.code = code;
    this.issues = issues;
  }
}

const difficultySchema = z.enum(['dễ', 'trung bình', 'khó']);
const cognitiveLevelSchema = z.enum(['remember', 'understand', 'apply', 'analyze']);
const gameTypeSchema = z.enum(['arena', 'scenario', 'matching', 'treasure', 'race']);
const nonEmpty = (max: number) => z.string().trim().min(1).max(max);
/** Optional text field: absent/blank becomes `undefined` instead of failing. */
const optionalText = (max: number) => z.string().trim().max(max).optional();

/**
 * Old/foreign data must never break a lesson over a decoration field. A value
 * that is not a string is treated as "not set"; a blank string is treated as
 * absent. A real string is still bounded, so a giant blob is rejected as
 * `too_big` rather than stored.
 *
 * Two zod v4 constraints shaped this:
 *  - `isOptional()` crashes `discriminatedUnion` ("Cannot read properties of
 *    undefined (reading 'values')"), which `arenaQuestionSchema` relies on.
 *  - `transform` / `preprocess` make `z.toJSONSchema()` throw unless it is asked
 *    for the input side, and that JSON schema is the `response_format` handed to
 *    llama.cpp. `toJSONSchema` must therefore be called with `{ io: 'input' }`
 *    for the constrained-decoding schemas to keep being emitted.
 */
const tolerantText = (max: number) =>
  z.preprocess(
    value => (typeof value === 'string' ? value : undefined),
    z.string().trim().max(max).transform(value => (value === '' ? undefined : value)).optional()
  );

/**
 * Optional per-item content metadata (docs/DECISIONS.md #60, #61, #62).
 *
 * Lenient on purpose, and deliberately NOT enums: these are presentation-only
 * fields, so an unknown category or icon must degrade (the adapter normalises it
 * to `general` / no icon) rather than refuse to open a saved lesson or reject a
 * whole AI draft.
 *
 * All three are plain strings for a second reason: `illustrationAssetId` needs
 * to round-trip a cleared value, and `nullable()` would emit
 * `"type": ["string", "null"]`, which llama.cpp's `response_format` subset does
 * not accept. An empty string already means "cleared", so nothing is lost.
 */
const itemAssetFieldsSchema = {
  contentCategory: tolerantText(40),
  iconName: tolerantText(60),
  illustrationAssetId: tolerantText(120)
};

const optionSchema = z.object({
  id: nonEmpty(40),
  text: nonEmpty(600)
});

const answerOptionsSchema = z.array(optionSchema).min(2).max(6);

// ---------------------------------------------------------------------------
// Lesson analysis
// ---------------------------------------------------------------------------

export const lessonAnalysisContentSchema = z.object({
  subject: z.string().trim().max(120).nullable(),
  grade: z.number().int().min(1).max(12).nullable(),
  topic: nonEmpty(250),
  objectives: z.array(z.object({
    description: nonEmpty(600),
    cognitiveLevel: cognitiveLevelSchema,
    sourceExcerpt: optionalText(600)
  })).min(1).max(10),
  keyConcepts: z.array(z.object({
    term: nonEmpty(160),
    explanation: nonEmpty(900),
    sourceExcerpt: optionalText(600)
  })).min(1).max(12),
  uncertainties: z.array(z.string().trim().min(1).max(600)).max(12)
});

export const lessonObjectiveSchema = z.object({
  id: nonEmpty(60),
  description: nonEmpty(600),
  cognitiveLevel: cognitiveLevelSchema,
  sourceExcerpt: optionalText(600)
});

export const keyConceptSchema = z.object({
  id: nonEmpty(60),
  term: nonEmpty(160),
  explanation: nonEmpty(900),
  sourceExcerpt: optionalText(600)
});

export const lessonAnalysisSchema = z.object({
  id: nonEmpty(80),
  schemaVersion: z.literal(1),
  documentId: nonEmpty(80),
  subject: z.string().trim().max(120).nullable(),
  grade: z.number().int().min(1).max(12).nullable(),
  topic: nonEmpty(250),
  objectives: z.array(lessonObjectiveSchema).min(1).max(10),
  keyConcepts: z.array(keyConceptSchema).min(1).max(12),
  uncertainties: z.array(z.string().trim().min(1).max(600)).max(12),
  sourceDocumentIds: z.array(nonEmpty(80)).min(1).max(10),
  createdAt: nonEmpty(40)
});

// ---------------------------------------------------------------------------
// Recommendations
// ---------------------------------------------------------------------------

const recommendationContentSchema = z.object({
  gameType: gameTypeSchema,
  title: nonEmpty(160),
  description: nonEmpty(500),
  reason: nonEmpty(800),
  learningObjectiveIds: z.array(nonEmpty(60)).max(10),
  suggestedDurationMinutes: z.number().int().min(3).max(60),
  suggestedQuestionCount: z.number().int().min(3).max(30).optional()
});

export const recommendationsContentSchema = z.object({
  recommendations: z.array(recommendationContentSchema).min(1).max(3)
}).superRefine((value, ctx) => {
  const seen = new Set<string>();
  value.recommendations.forEach((item, index) => {
    if (seen.has(item.gameType)) {
      ctx.addIssue({
        code: 'custom',
        path: ['recommendations', index, 'gameType'],
        message: 'Mỗi thể loại chỉ được đề xuất một lần.'
      });
    }
    seen.add(item.gameType);
  });
});

export const gameRecommendationSchema = recommendationContentSchema.extend({
  id: nonEmpty(80),
  schemaVersion: z.literal(1),
  analysisId: nonEmpty(80),
  createdAt: nonEmpty(40)
});

// ---------------------------------------------------------------------------
// Arena
// ---------------------------------------------------------------------------

/**
 * Canonical "Đúng/Sai" answers. Some local models emit three options, lowercase
 * labels or "Đúng." for a true/false question. Only the labels are normalised;
 * the teacher's/model's actual answer choice is preserved. Questions that merely
 * mention "đúng/sai" are never reclassified here.
 */
const TRUE_FALSE_TRUE = new Set(['đúng', 'dung', 'true', 'phải', 'phai']);
const TRUE_FALSE_FALSE = new Set(['sai', 'false', 'không', 'khong']);

function trueFalseLabel(text: unknown): 'true' | 'false' | null {
  const key = String(text ?? '')
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(/[.!?;:,]+$/g, '')
    .replace(/\s+/g, ' ');
  if (TRUE_FALSE_TRUE.has(key)) return 'true';
  if (TRUE_FALSE_FALSE.has(key)) return 'false';
  return null;
}

export function canonicalizeTrueFalseQuestion(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const question = value as Record<string, unknown>;
  if (question.type !== 'true-false' || !Array.isArray(question.options)) return value;
  const options = question.options.filter(option => option && typeof option === 'object' && !Array.isArray(option)) as Record<string, unknown>[];
  // Only relabel an already two-option question. A third option is a real
  // contract failure and must go through repair, not be silently dropped.
  if (options.length !== 2) return value;
  const trueOption = options.find(option => trueFalseLabel(option.text) === 'true');
  const falseOption = options.find(option => trueFalseLabel(option.text) === 'false');
  if (!trueOption || !falseOption || trueOption === falseOption) return value;
  const correct = options.find(option => option.id === question.correctOptionId);
  const correctLabel = correct ? trueFalseLabel(correct.text) : null;
  if (!correctLabel) return value;
  return {
    ...question,
    options: [
      { id: trueOption.id, text: 'Đúng' },
      { id: falseOption.id, text: 'Sai' }
    ],
    correctOptionId: correctLabel === 'true' ? trueOption.id : falseOption.id
  };
}

const arenaChoiceQuestionSchema = (type: 'multiple-choice' | 'true-false') => z.object({
  id: nonEmpty(60),
  type: z.literal(type),
  prompt: nonEmpty(1000),
  options: answerOptionsSchema,
  correctOptionId: nonEmpty(40),
  explanation: nonEmpty(1200),
  difficulty: difficultySchema,
  points: z.number().int().min(0).max(1000),
  ...itemAssetFieldsSchema
});

const arenaTextQuestionSchema = (type: 'fill-in-blank' | 'short-answer') => z.object({
  id: nonEmpty(60),
  type: z.literal(type),
  prompt: nonEmpty(1000),
  correctAnswer: nonEmpty(300),
  alternateAnswers: z.array(nonEmpty(300)).max(8).optional(),
  explanation: nonEmpty(1200),
  difficulty: difficultySchema,
  points: z.number().int().min(0).max(1000),
  ...itemAssetFieldsSchema
});

export const arenaQuestionSchema = z.discriminatedUnion('type', [
  arenaChoiceQuestionSchema('multiple-choice'),
  arenaChoiceQuestionSchema('true-false'),
  arenaTextQuestionSchema('fill-in-blank'),
  arenaTextQuestionSchema('short-answer')
]);

const arenaDraftBase = z.object({
  gameType: z.literal('arena'),
  schemaVersion: z.literal(1),
  // 1 is allowed so legacy quizzes can still be opened in the wizard; the
  // generator config enforces a higher minimum for newly created games.
  questions: z.array(arenaQuestionSchema).min(1).max(30)
});

export const arenaDraftSchema = arenaDraftBase.superRefine((draft: z.infer<typeof arenaDraftBase>, ctx) => {
  assertUnique(draft.questions.map(question => question.id), ctx, ['questions'], 'Mỗi câu hỏi cần có ID riêng.');
  draft.questions.forEach((question, index) => {
    if (question.type !== 'multiple-choice' && question.type !== 'true-false') return;
    assertUnique(question.options.map(option => option.id), ctx, ['questions', index, 'options'], 'Mỗi phương án cần có ID riêng.');
    if (!question.options.some(option => option.id === question.correctOptionId)) {
      ctx.addIssue({
        code: 'custom',
        path: ['questions', index, 'correctOptionId'],
        message: 'Đáp án đúng phải nằm trong danh sách phương án.'
      });
    }
    if (question.type === 'true-false') {
      if (question.options.length !== 2) {
        ctx.addIssue({
          code: 'custom',
          path: ['questions', index, 'options'],
          message: 'Câu đúng/sai phải có đúng hai phương án Đúng và Sai.'
        });
      } else {
        const labels = question.options.map(option => trueFalseLabel(option.text));
        if (!labels.includes('true') || !labels.includes('false')) {
          ctx.addIssue({
            code: 'custom',
            path: ['questions', index, 'options'],
            message: 'Hai phương án của câu đúng/sai phải là “Đúng” và “Sai”.'
          });
        }
      }
    }
  });
});

export const arenaDraftContentSchema = arenaDraftBase.omit({ schemaVersion: true });

// ---------------------------------------------------------------------------
// Scenario
// ---------------------------------------------------------------------------

export const scenarioOptionSchema = z.object({
  id: nonEmpty(40),
  text: nonEmpty(600),
  feedback: optionalText(1200),
  consequence: optionalText(1200),
  nextSituationId: z.string().trim().min(1).max(60).nullable().optional(),
  score: z.object({
    safety: z.number().int().min(0).max(60),
    reasoning: z.number().int().min(0).max(25),
    harmReduction: z.number().int().min(0).max(15)
  }).optional()
});

export const scenarioSituationSchema = z.object({
  id: nonEmpty(60),
  context: optionalText(900),
  prompt: nonEmpty(1000),
  options: z.array(scenarioOptionSchema).min(2).max(6),
  correctOptionId: z.string().trim().min(1).max(40).optional(),
  discussionPrompt: optionalText(900),
  ...itemAssetFieldsSchema
});

const scenarioDraftBase = z.object({
  gameType: z.literal('scenario'),
  schemaVersion: z.literal(1),
  situations: z.array(scenarioSituationSchema).min(1).max(30)
});

export const scenarioDraftSchema = scenarioDraftBase.superRefine((draft, ctx) => {
  assertUnique(draft.situations.map(situation => situation.id), ctx, ['situations'], 'Mỗi tình huống cần có ID riêng.');
  const ids = new Set(draft.situations.map(situation => situation.id));
  draft.situations.forEach((situation, index) => {
    assertUnique(situation.options.map(option => option.id), ctx, ['situations', index, 'options'], 'Mỗi hành động cần có ID riêng.');
    if (situation.correctOptionId && !situation.options.some(option => option.id === situation.correctOptionId)) {
      ctx.addIssue({
        code: 'custom',
        path: ['situations', index, 'correctOptionId'],
        message: 'Đáp án đúng phải nằm trong danh sách hành động.'
      });
    }
    situation.options.forEach((option, optionIndex) => {
      if (!option.nextSituationId) return;
      if (option.nextSituationId === situation.id) {
        ctx.addIssue({
          code: 'custom',
          path: ['situations', index, 'options', optionIndex, 'nextSituationId'],
          message: 'Một tình huống không được trỏ tới chính nó.'
        });
      } else if (!ids.has(option.nextSituationId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['situations', index, 'options', optionIndex, 'nextSituationId'],
          message: 'Nhánh trỏ tới tình huống không tồn tại.'
        });
      }
    });
  });
});

export const scenarioDraftContentSchema = scenarioDraftBase.omit({ schemaVersion: true });

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

export const matchingPairSchema = z.object({
  id: nonEmpty(60),
  left: nonEmpty(400),
  right: nonEmpty(400),
  // A pair is an item like any other: the editor has always written these three
  // keys (DECISIONS #65), but the schema did not declare them, so zod stripped
  // them before the adapter ever saw them. Declared here so the promise "every
  // item can carry its own artwork" holds for matching too.
  ...itemAssetFieldsSchema
});

const matchingDraftBase = z.object({
  gameType: z.literal('matching'),
  schemaVersion: z.literal(1),
  mode: z.enum(['columns', 'memory', 'categorize']),
  pairs: z.array(matchingPairSchema).min(2).max(30),
  pointsPerPair: z.number().int().min(0).max(1000),
  completionBonus: z.number().int().min(0).max(10000),
  wrongPenalty: z.number().int().min(0).max(1000),
  timeBonus: z.number().int().min(0).max(10000),
  bonusUnderSeconds: z.number().int().min(0).max(86400),
  practiceMode: z.boolean()
});

export const matchingDraftSchema = matchingDraftBase.superRefine((draft, ctx) => {
  assertUnique(draft.pairs.map(pair => pair.id), ctx, ['pairs'], 'Mỗi cặp ghép cần có ID riêng.');
  const lefts = draft.pairs.map(pair => pair.left.trim().toLowerCase());
  const rights = draft.pairs.map(pair => pair.right.trim().toLowerCase());
  if (new Set(lefts).size !== lefts.length) {
    ctx.addIssue({ code: 'custom', path: ['pairs'], message: 'Cột A đang có nội dung trùng lặp.' });
  }
  if (new Set(rights).size !== rights.length) {
    ctx.addIssue({ code: 'custom', path: ['pairs'], message: 'Cột B đang có nội dung trùng lặp.' });
  }
});

export const matchingDraftContentSchema = matchingDraftBase.omit({ schemaVersion: true });

// ---------------------------------------------------------------------------
// Treasure
// ---------------------------------------------------------------------------

const treasureMatchingPairSchema = z.object({
  id: nonEmpty(40),
  left: nonEmpty(300),
  right: nonEmpty(300)
});

const treasureClassificationGroupSchema = z.object({
  id: nonEmpty(40),
  name: nonEmpty(160)
});

const treasureClassificationItemSchema = z.object({
  id: nonEmpty(40),
  text: nonEmpty(300),
  groupId: nonEmpty(40)
});

const treasureMissionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('multiple-choice') }),
  z.object({ type: z.literal('scenario') }),
  z.object({
    type: z.literal('matching'),
    pairs: z.array(treasureMatchingPairSchema).min(2).max(10)
  }),
  z.object({
    type: z.literal('decode'),
    answer: nonEmpty(120),
    cipher: optionalText(200)
  }),
  z.object({
    type: z.literal('classification'),
    groups: z.array(treasureClassificationGroupSchema).min(2).max(4),
    items: z.array(treasureClassificationItemSchema).min(2).max(12)
  })
]);

export const treasureStageSchema = z.object({
  id: nonEmpty(60),
  name: nonEmpty(160),
  story: nonEmpty(1600),
  taskDescription: nonEmpty(900),
  question: z.object({
    prompt: nonEmpty(1000),
    // Variant missions keep a prompt/explanation but may omit choice options.
    options: z.array(optionSchema).max(6),
    correctOptionId: z.string().trim().max(40),
    explanation: nonEmpty(1200),
    hint: optionalText(500),
    ...itemAssetFieldsSchema
  }),
  mission: treasureMissionSchema.optional(),
  attempts: z.number().int().min(0).max(99),
  points: z.number().int().min(0).max(1000),
  completionBonus: z.number().int().min(0).max(10000),
  nextStageId: z.string().trim().min(1).max(60).nullable().optional(),
  branchLabel: optionalText(160),
  branchStageId: z.string().trim().min(1).max(60).optional(),
  hasHiddenItem: z.boolean().optional()
});

const treasureBackgroundSchema = z.enum(['temple', 'forest', 'ice', 'desert', 'ocean', 'space']);
const treasureCharacterSchema = z.enum(['explorer', 'scientist', 'biologist', 'astronaut', 'diver']);

const treasureDraftBase = z.object({
  gameType: z.literal('treasure'),
  schemaVersion: z.literal(1),
  character: nonEmpty(160),
  intro: nonEmpty(1600),
  journeyBonus: z.number().int().min(0).max(10000),
  hiddenItemBonus: z.number().int().min(0).max(1000),
  backgroundId: treasureBackgroundSchema.optional(),
  characterId: treasureCharacterSchema.optional(),
  stages: z.array(treasureStageSchema).min(2).max(30)
});

export const treasureDraftSchema = treasureDraftBase.superRefine((draft, ctx) => {
  assertUnique(draft.stages.map(stage => stage.id), ctx, ['stages'], 'Mỗi chặng cần có ID riêng.');
  const ids = new Set(draft.stages.map(stage => stage.id));
  let endingCount = 0;
  draft.stages.forEach((stage, index) => {
    const missionType = stage.mission?.type || 'multiple-choice';
    if (missionType === 'multiple-choice' || missionType === 'scenario') {
      assertUnique(stage.question.options.map(option => option.id), ctx, ['stages', index, 'question', 'options'], 'Mỗi đáp án cần có ID riêng.');
      if (stage.question.options.length < 2) {
        ctx.addIssue({
          code: 'custom',
          path: ['stages', index, 'question', 'options'],
          message: 'Câu đố của chặng cần ít nhất 2 đáp án.'
        });
      }
      if (!stage.question.correctOptionId ||
          !stage.question.options.some(option => option.id === stage.question.correctOptionId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['stages', index, 'question', 'correctOptionId'],
          message: 'Đáp án đúng của chặng phải nằm trong danh sách đáp án.'
        });
      }
    }
    if (stage.mission?.type === 'matching') {
      assertUnique(stage.mission.pairs.map(pair => pair.id), ctx, ['stages', index, 'mission', 'pairs'], 'Mỗi cặp ghép cần có ID riêng.');
    }
    if (stage.mission?.type === 'classification') {
      assertUnique(stage.mission.groups.map(group => group.id), ctx, ['stages', index, 'mission', 'groups'], 'Mỗi nhóm phân loại cần có ID riêng.');
      assertUnique(stage.mission.items.map(item => item.id), ctx, ['stages', index, 'mission', 'items'], 'Mỗi mục phân loại cần có ID riêng.');
      const groupIds = new Set(stage.mission.groups.map(group => group.id));
      stage.mission.items.forEach((item, itemIndex) => {
        if (!groupIds.has(item.groupId)) {
          ctx.addIssue({
            code: 'custom',
            path: ['stages', index, 'mission', 'items', itemIndex, 'groupId'],
            message: 'Mục phân loại trỏ tới nhóm không tồn tại.'
          });
        }
      });
    }
    if (!stage.nextStageId) {
      endingCount += 1;
    } else if (!ids.has(stage.nextStageId)) {
      ctx.addIssue({
        code: 'custom',
        path: ['stages', index, 'nextStageId'],
        message: 'Chặng trỏ tới chặng không tồn tại.'
      });
    } else if (stage.nextStageId === stage.id) {
      ctx.addIssue({
        code: 'custom',
        path: ['stages', index, 'nextStageId'],
        message: 'Một chặng không được trỏ tới chính nó.'
      });
    }
    if (stage.branchStageId) {
      if (!stage.branchLabel) {
        ctx.addIssue({
          code: 'custom',
          path: ['stages', index, 'branchLabel'],
          message: 'Nhánh phụ cần có nhãn để học sinh lựa chọn.'
        });
      }
      if (!ids.has(stage.branchStageId) || stage.branchStageId === stage.id) {
        ctx.addIssue({
          code: 'custom',
          path: ['stages', index, 'branchStageId'],
          message: 'Nhánh phụ trỏ tới chặng không hợp lệ.'
        });
      }
    }
  });
  if (endingCount === 0) {
    ctx.addIssue({ code: 'custom', path: ['stages'], message: 'Hành trình cần ít nhất một chặng kết thúc.' });
  }
});

export const treasureDraftContentSchema = treasureDraftBase.omit({ schemaVersion: true });

// ---------------------------------------------------------------------------
// Race
// ---------------------------------------------------------------------------

const raceCellTypes = z.enum(['boost', 'penalty', 'lucky', 'challenge']);

export const raceQuestionSchema = z.object({
  id: nonEmpty(60),
  prompt: nonEmpty(1000),
  options: answerOptionsSchema,
  correctOptionId: nonEmpty(40),
  explanation: nonEmpty(1200),
  difficulty: difficultySchema,
  ...itemAssetFieldsSchema
});

const raceDraftBase = z.object({
  gameType: z.literal('race'),
  schemaVersion: z.literal(1),
  trackLength: z.number().int().min(3).max(100),
  maxRounds: z.number().int().min(1).max(50),
  stepByDifficulty: z.boolean(),
  luckEnabled: z.boolean(),
  teams: z.array(z.object({
    id: nonEmpty(60),
    name: nonEmpty(120),
    icon: z.string().trim().min(1).max(16).optional()
  })).min(2).max(6),
  cells: z.array(z.object({
    cell: z.number().int().min(2).max(100),
    type: raceCellTypes,
    label: nonEmpty(160)
  })).max(30),
  questions: z.array(raceQuestionSchema).min(1).max(30)
});

export const raceDraftSchema = raceDraftBase.superRefine((draft, ctx) => {
  assertUnique(draft.teams.map(team => team.id), ctx, ['teams'], 'Mỗi đội cần có ID riêng.');
  assertUnique(draft.teams.map(team => team.name.trim().toLowerCase()), ctx, ['teams'], 'Tên các đội đang trùng nhau.');
  assertUnique(draft.questions.map(question => question.id), ctx, ['questions'], 'Mỗi câu hỏi cần có ID riêng.');
  const cellNumbers = draft.cells.map(cell => cell.cell);
  assertUnique(cellNumbers.map(String), ctx, ['cells'], 'Đường đua đang có nhiều hiệu ứng trên cùng một ô.');
  draft.cells.forEach((cell, index) => {
    if (cell.cell > draft.trackLength) {
      ctx.addIssue({
        code: 'custom',
        path: ['cells', index, 'cell'],
        message: 'Ô đặc biệt phải nằm trong khoảng 2 đến hết đường đua.'
      });
    }
  });
  draft.questions.forEach((question, index) => {
    assertUnique(question.options.map(option => option.id), ctx, ['questions', index, 'options'], 'Mỗi đáp án cần có ID riêng.');
    if (!question.options.some(option => option.id === question.correctOptionId)) {
      ctx.addIssue({
        code: 'custom',
        path: ['questions', index, 'correctOptionId'],
        message: 'Đáp án đúng phải nằm trong danh sách đáp án.'
      });
    }
  });
});

export const raceDraftContentSchema = raceDraftBase.omit({ schemaVersion: true });

// ---------------------------------------------------------------------------
// Draft union + config
// ---------------------------------------------------------------------------

export const gameDraftSchema = z.discriminatedUnion('gameType', [
  arenaDraftSchema,
  scenarioDraftSchema,
  matchingDraftSchema,
  treasureDraftSchema,
  raceDraftSchema
]);

const configBase = z.object({
  title: nonEmpty(200),
  subject: z.string().trim().max(120),
  grade: z.string().trim().max(60),
  topic: z.string().trim().max(250),
  audience: z.enum(['child', 'teen', 'adult']),
  durationMinutes: z.number().int().min(1).max(120),
  difficulty: difficultySchema,
  playMode: z.enum(['individual', 'team']),
  style: z.enum(['fun', 'exploration', 'competition', 'realistic', 'minimal']),
  focusObjectiveIds: z.array(nonEmpty(60)).max(30),
  generationMode: z.enum(['fast', 'deep'])
});

export const gameConfigSchema = z.discriminatedUnion('gameType', [
  configBase.extend({
    gameType: z.literal('arena'),
    questionCount: z.number().int().min(1).max(30),
    scoringMode: z.enum(['basic', 'speed', 'difficulty', 'team', 'practice']),
    pointsPerCorrect: z.number().int().min(10).max(1000),
    timeBonus: z.number().int().min(0).max(50),
    pointsEasy: z.number().int().min(0).max(1000).optional(),
    pointsMedium: z.number().int().min(0).max(1000).optional(),
    pointsHard: z.number().int().min(0).max(1000).optional()
  }),
  configBase.extend({
    gameType: z.literal('scenario'),
    situationCount: z.number().int().min(1).max(30),
    scoringMode: z.enum(['quality', 'simple'])
  }),
  configBase.extend({
    gameType: z.literal('matching'),
    pairCount: z.number().int().min(2).max(30),
    matchingMode: z.enum(['columns', 'memory', 'categorize']),
    wrongPenalty: z.number().int().min(0).max(1000)
  }),
  configBase.extend({
    gameType: z.literal('treasure'),
    stageCount: z.number().int().min(2).max(30),
    attemptsPerStage: z.number().int().min(0).max(99),
    journeyBonus: z.number().int().min(0).max(10000),
    hiddenItemBonus: z.number().int().min(0).max(1000)
  }),
  configBase.extend({
    gameType: z.literal('race'),
    trackLength: z.number().int().min(3).max(100),
    maxRounds: z.number().int().min(1).max(50),
    teamCount: z.number().int().min(2).max(6),
    stepByDifficulty: z.boolean(),
    luckEnabled: z.boolean()
  })
]);

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

export function parseLessonAnalysisContent(value: unknown): LessonAnalysisContent {
  return parseOrThrow(lessonAnalysisContentSchema, value, 'ANALYSIS_INVALID', 'Kết quả phân tích giáo án') as LessonAnalysisContent;
}

/** Full analysis object (ids + timestamp added by `lesson-normalize`). */
export function parseLessonAnalysis(value: unknown): LessonAnalysis {
  return parseOrThrow(lessonAnalysisSchema, value, 'ANALYSIS_INVALID', 'Kết quả phân tích giáo án') as LessonAnalysis;
}

export function parseGameRecommendation(value: unknown): GameRecommendation {
  return parseOrThrow(gameRecommendationSchema, value, 'RECOMMENDATION_INVALID', 'Đề xuất trò chơi') as GameRecommendation;
}

export function parseRecommendationsContent(value: unknown): GameRecommendationContent[] {
  const parsed = parseOrThrow(recommendationsContentSchema, value, 'RECOMMENDATION_INVALID', 'Danh sách đề xuất trò chơi') as { recommendations: GameRecommendationContent[] };
  return parsed.recommendations;
}

export function canonicalizeDraftAnswers(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const draft = value as Record<string, unknown>;
  if (draft.gameType !== 'arena' || !Array.isArray(draft.questions)) return value;
  return { ...draft, questions: draft.questions.map(canonicalizeTrueFalseQuestion) };
}

/**
 * Restores the asset keys that `isOptional` dropped.
 *
 * Because the asset schemas are `isOptional`, an absent key is removed from the
 * parsed output instead of being preserved as `undefined`. Padding it back here
 * keeps the parsed draft's key set identical to the previous contract, so
 * existing consumers that enumerate keys are unaffected.
 */
function padItemAssetKeys<T>(item: T): T {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
  const record = item as Record<string, unknown>;
  return {
    ...record,
    contentCategory: record.contentCategory,
    iconName: record.iconName,
    illustrationAssetId: record.illustrationAssetId
  } as T;
}

function padDraftAssetKeys(draft: GameDraft): GameDraft {
  if (!draft || typeof draft !== 'object') return draft;
  switch (draft.gameType) {
    case 'arena':
      return { ...draft, questions: draft.questions.map(padItemAssetKeys) };
    case 'scenario':
      return { ...draft, situations: draft.situations.map(padItemAssetKeys) };
    case 'matching':
      return { ...draft, pairs: draft.pairs.map(padItemAssetKeys) };
    case 'treasure':
      return {
        ...draft,
        stages: draft.stages.map(stage => ({
          ...stage,
          question: padItemAssetKeys(stage.question)
        }))
      };
    case 'race':
      return { ...draft, questions: draft.questions.map(padItemAssetKeys) };
    default:
      return draft;
  }
}

export function parseGameDraft(value: unknown): GameDraft {
  const parsed = parseOrThrow(gameDraftSchema, canonicalizeDraftAnswers(value), 'DRAFT_INVALID', 'Dữ liệu trò chơi') as GameDraft;
  return padDraftAssetKeys(parsed);
}

export function parseGameConfig(value: unknown): GameConfig {
  return parseOrThrow(gameConfigSchema, value, 'CONFIG_INVALID', 'Cấu hình trò chơi') as GameConfig;
}

// ---------------------------------------------------------------------------
// O5: one regenerated item
// ---------------------------------------------------------------------------

/**
 * The model is asked for a one-element wrapper so the item keeps the same shape
 * as the full draft (no second contract to drift). A bare item is accepted too:
 * small models often drop the wrapper, and the item schema is unambiguous.
 */
export const regeneratedItemWrapperSchemas: Record<WorkflowGameType, z.ZodTypeAny> = {
  arena: z.object({ gameType: z.literal('arena'), questions: z.array(arenaQuestionSchema).length(1) }),
  scenario: z.object({ gameType: z.literal('scenario'), situations: z.array(scenarioSituationSchema).length(1) }),
  matching: z.object({ gameType: z.literal('matching'), pairs: z.array(matchingPairSchema).length(1) }),
  treasure: z.object({ gameType: z.literal('treasure'), stages: z.array(treasureStageSchema).length(1) }),
  race: z.object({ gameType: z.literal('race'), questions: z.array(raceQuestionSchema).length(1) })
};

const singleItemSchemas: Record<WorkflowGameType, z.ZodTypeAny> = {
  arena: arenaQuestionSchema,
  scenario: scenarioSituationSchema,
  matching: matchingPairSchema,
  treasure: treasureStageSchema,
  race: raceQuestionSchema
};

const REGENERATED_LIST_KEYS: Record<WorkflowGameType, 'questions' | 'situations' | 'pairs' | 'stages'> = {
  arena: 'questions',
  scenario: 'situations',
  matching: 'pairs',
  treasure: 'stages',
  race: 'questions'
};

/** Returns the validated single item (unknown keys stripped), without app-owned ids. */
export function parseRegeneratedItem(gameType: WorkflowGameType, value: unknown): unknown {
  const wrapper = value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
  if (!wrapper) {
    throw new LessonContractError('ITEM_INVALID', 'AI không trả về JSON cho mục cần tạo lại.');
  }
  const listKey = REGENERATED_LIST_KEYS[gameType];
  let candidate: unknown = wrapper;
  if (Array.isArray(wrapper[listKey])) {
    const list = wrapper[listKey] as unknown[];
    if (list.length !== 1) {
      throw new LessonContractError(
        'ITEM_INVALID',
        `Mục cần tạo lại phải nằm trong mảng có đúng 1 phần tử (AI trả về ${list.length}).`
      );
    }
    candidate = list[0];
  }
  const normalized = gameType === 'arena' ? canonicalizeTrueFalseQuestion(candidate) : candidate;
  return parseOrThrow(singleItemSchemas[gameType], normalized, 'ITEM_INVALID', 'Mục cần tạo lại') as unknown;
}

export function formatContractIssues(error: z.ZodError): string[] {
  return error.issues.slice(0, 8).map(issue => {
    const path = issue.path.length ? issue.path.map(String).join('.') : '(root)';
    return `${path}: ${issue.message}`;
  });
}

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown, code: string, label: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const issues = formatContractIssues(parsed.error);
    throw new LessonContractError(code, `${label} không hợp lệ: ${issues.join('; ')}`, issues);
  }
  return parsed.data;
}

function assertUnique(values: string[], ctx: z.RefinementCtx, path: (string | number)[], message: string): void {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (seen.has(value)) {
      ctx.addIssue({ code: 'custom', path: [...path, index], message });
    }
    seen.add(value);
  });
}

// ---------------------------------------------------------------------------
// JSON schemas for llama.cpp `response_format`
// ---------------------------------------------------------------------------

type JsonSchema = Record<string, unknown>;
const toJsonSchema = (z as unknown as { toJSONSchema?: (schema: unknown, options?: { io?: 'input' | 'output' }) => unknown }).toJSONSchema;

/**
 * `response_format` describes what the MODEL must emit, so the input side of the
 * schema is the correct projection. It is also required: zod v4 throws
 * "Transforms cannot be represented in JSON Schema" for any `.trim()` /
 * `.transform()` by default, which would silently blank out constrained
 * decoding (this used to return null for every game draft).
 */
function safeJsonSchema(schema: unknown): JsonSchema | null {
  if (typeof toJsonSchema !== 'function') return null;
  try {
    return toJsonSchema(schema, { io: 'input' }) as JsonSchema;
  } catch {
    return null;
  }
}

/**
 * Content schemas omit `schemaVersion`; ids are still part of the model output.
 * The normalizer fills missing ids before `parseGameDraft` runs.
 */
export const lessonAnalysisJsonSchema = safeJsonSchema(lessonAnalysisContentSchema);
export const recommendationsJsonSchema = safeJsonSchema(recommendationsContentSchema);
export const gameDraftJsonSchemas: Record<GameDraft['gameType'], JsonSchema | null> = {
  arena: safeJsonSchema(arenaDraftContentSchema),
  scenario: safeJsonSchema(scenarioDraftContentSchema),
  matching: safeJsonSchema(matchingDraftContentSchema),
  treasure: safeJsonSchema(treasureDraftContentSchema),
  race: safeJsonSchema(raceDraftContentSchema)
};

/** `response_format` for `lesson:regenerate-item` (one-element wrapper per type). */
export const regenerateItemJsonSchemas: Record<WorkflowGameType, JsonSchema | null> = {
  arena: safeJsonSchema(regeneratedItemWrapperSchemas.arena),
  scenario: safeJsonSchema(regeneratedItemWrapperSchemas.scenario),
  matching: safeJsonSchema(regeneratedItemWrapperSchemas.matching),
  treasure: safeJsonSchema(regeneratedItemWrapperSchemas.treasure),
  race: safeJsonSchema(regeneratedItemWrapperSchemas.race)
};

/** Convenience alias for the inferred arena draft shape. */
export type ArenaDraftFromSchema = z.infer<typeof arenaDraftSchema>;
