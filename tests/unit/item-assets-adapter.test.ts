/**
 * Phase 2 — optional item assets survive the draft -> game -> draft round trip
 * (docs/DECISIONS.md #60, #61, #62).
 *
 * Every realistic case below goes through `parseGameDraft`, the zod boundary
 * used by `toEducationalGame`. That matters: zod strips unknown keys silently,
 * so a field missing from the schema passes typecheck, survives a plain object
 * spread, and is still dropped in production. Testing the adapter alone would
 * have missed exactly that bug.
 *
 * Legacy compatibility is asserted first: items without the fields must produce
 * a game with no new keys at all, so existing `.egame` files stay unchanged.
 */
import assert from 'node:assert/strict';
import { fromEducationalGame, toEducationalGame } from '../../src/services/game-project-adapter';
import { parseGameDraft } from '../../src/services/lesson-contracts';
import { normalizeItemAssets, isIconName } from '../../src/shared/asset-validation';
import type { EducationalGame } from '../../src/shared/types';
import type { GameConfig, GameDraft, GameProject } from '../../src/shared/lesson-types';

const ISO = '2026-01-01T00:00:00.000Z';

function configFor(draft: GameDraft): GameConfig {
  const base = {
    title: `Trò chơi ${draft.gameType}`,
    subject: 'Toán',
    grade: 'Lớp 5',
    topic: 'Kiến thức chung',
    audience: 'child' as const,
    durationMinutes: 15,
    difficulty: 'trung bình' as const,
    playMode: 'individual' as const,
    style: 'fun' as const,
    focusObjectiveIds: [] as string[],
    generationMode: 'fast' as const
  };
  switch (draft.gameType) {
    case 'arena':
      return { ...base, gameType: 'arena', questionCount: draft.questions.length, scoringMode: 'basic', pointsPerCorrect: 100, timeBonus: 10 };
    case 'scenario':
      return { ...base, gameType: 'scenario', situationCount: draft.situations.length, scoringMode: 'quality' };
    case 'matching':
      return { ...base, gameType: 'matching', pairCount: draft.pairs.length, matchingMode: draft.mode, wrongPenalty: 0 };
    case 'treasure':
      return { ...base, gameType: 'treasure', stageCount: draft.stages.length, attemptsPerStage: 0, journeyBonus: draft.journeyBonus, hiddenItemBonus: draft.hiddenItemBonus };
    case 'race':
      return { ...base, gameType: 'race', trackLength: draft.trackLength, maxRounds: draft.maxRounds, teamCount: draft.teams.length, stepByDifficulty: draft.stepByDifficulty, luckEnabled: draft.luckEnabled };
    default:
      throw new Error('unknown draft');
  }
}

function projectFor(draft: GameDraft): GameProject {
  return {
    id: 'project-assets',
    schemaVersion: 1,
    status: 'draft',
    step: 'edit',
    title: 'Trò chơi kiểm thử tài sản',
    description: 'Mô tả kiểm thử.',
    tags: ['AI tạo'],
    sourceName: 'bai-giang.txt',
    lesson: { documentId: 'doc-1', name: 'bai-giang.txt', characters: 1200 },
    analysisId: 'analysis-1',
    recommendationId: 'rec-1',
    config: configFor(draft),
    draft,
    gameSnapshot: null,
    gameId: null,
    createdAt: ISO,
    updatedAt: ISO
  };
}

/** The production read path: zod validation, then adaptation. */
function draftToGame(draft: GameDraft): EducationalGame {
  return toEducationalGame(projectFor(parseGameDraft(draft)));
}

/**
 * Casts through `unknown` on purpose: the point is to feed the parser values the
 * type system forbids, so the lenient schema is actually exercised.
 */
function loose(value: unknown): GameDraft {
  return value as GameDraft;
}

/** Reads the parsed draft as a plain object tree (json shape) for assertions. */
function plain<T = Record<string, unknown>>(value: unknown): T {
  return value as T;
}

const assets = {
  contentCategory: 'animals',
  iconName: 'paw-print',
  illustrationAssetId: 'animals-farm-1'
} as const;

// Guard: if a fixture name is not in the icon registry the adapter drops it and
// the "kept the icon" assertions below would silently pass for the wrong reason.
assert.ok(isIconName(assets.iconName), `fixture icon "${assets.iconName}" must exist in the icon registry`);

// ---------------------------------------------------------------------------
// 1. Legacy drafts must not gain any key (existing .egame files)
// ---------------------------------------------------------------------------

const legacyArena = draftToGame({
  gameType: 'arena',
  schemaVersion: 1,
  questions: [
    {
      id: 'q1', type: 'multiple-choice', prompt: '2 + 3 = ?',
      options: [{ id: 'a', text: '5' }, { id: 'b', text: '6' }],
      correctOptionId: 'a', explanation: 'Bằng 5.', difficulty: 'dễ', points: 100
    },
    {
      id: 'q2', type: 'fill-in-blank', prompt: 'Thủ đô Việt Nam là ...',
      correctAnswer: 'Hà Nội', explanation: 'Hà Nội.', difficulty: 'khó', points: 300
    }
  ]
});

/** The same legacy draft, unadapted, for parser-level assertions. */
const legacyDraftValue = {
  gameType: 'arena',
  schemaVersion: 1,
  questions: [{
    id: 'q1', type: 'multiple-choice', prompt: '2 + 3 = ?',
    options: [{ id: 'a', text: '5' }, { id: 'b', text: '6' }],
    correctOptionId: 'a', explanation: 'Bằng 5.', difficulty: 'dễ', points: 100
  }]
};
for (const question of legacyArena.questions) {
  assert.deepEqual(Object.keys(question).filter(key => key === 'contentCategory' || key === 'iconName' || key === 'illustrationAssetId'), [], `legacy question ${question.id} must not gain asset keys`);
}
// Byte-level proof: the serialised legacy question is unchanged.
assert.deepEqual(JSON.parse(JSON.stringify(legacyArena.questions[0])), {
  id: 'q1', type: 'multiple-choice', prompt: '2 + 3 = ?',
  options: [{ id: 'a', text: '5' }, { id: 'b', text: '6' }],
  correctOptionId: 'a', explanation: 'Bằng 5.', difficulty: 'dễ', points: 100
});

// A legacy game still opens in the wizard, and the draft carries only `general`.
const legacyProject = fromEducationalGame(legacyArena);
const legacyDraftQuestion = plain<{ questions: Array<Record<string, unknown>> }>(legacyProject.draft).questions[0];
assert.equal(legacyDraftQuestion.contentCategory, 'general');
assert.ok(!('iconName' in legacyDraftQuestion), 'unset iconName must stay absent in the draft');
assert.ok(!('illustrationAssetId' in legacyDraftQuestion), 'unset illustration must stay absent in the draft');

// Invalid values degrade instead of throwing. This is the important half of the
// leniency: these fields are decoration, so bad data must not refuse the whole
// draft (which would mean "cannot open the lesson") or reject an AI draft.
const hostileDraft = parseGameDraft(loose({
  gameType: 'arena',
  schemaVersion: 1,
  questions: [
    {
      id: 'q1', type: 'multiple-choice', prompt: 'Câu hỏi?',
      options: [{ id: 'a', text: 'Có' }, { id: 'b', text: 'Không' }],
      correctOptionId: 'a', explanation: 'Vì vậy.', difficulty: 'dễ', points: 100,
      contentCategory: 'khong-ton-tai', iconName: 'khong-co-icon-nay', illustrationAssetId: '   '
    },
    {
      id: 'q2', type: 'multiple-choice', prompt: 'Câu hỏi 2?',
      options: [{ id: 'a', text: 'Có' }, { id: 'b', text: 'Không' }],
      correctOptionId: 'a', explanation: 'Vì vậy.', difficulty: 'dễ', points: 100,
      contentCategory: 42, iconName: null, illustrationAssetId: { nested: true }
    },
    {
      id: 'q3', type: 'fill-in-blank', prompt: 'Con ... kêu meo meo.',
      correctAnswer: 'mèo', explanation: 'Đó là con mèo.', difficulty: 'dễ', points: 100,
      contentCategory: null, iconName: 7, illustrationAssetId: []
    }
  ]
}));
const hostile = toEducationalGame(projectFor(hostileDraft));
assert.equal(hostile.questions.length, 3, 'wrong-typed asset values must never drop a question');
assert.equal(hostile.questions[0].contentCategory, undefined, 'unknown category normalises to "general", which is not stored');
// The readable view still reports it, so the UI has something to render.
assert.equal(normalizeItemAssets(hostile.questions[0]).contentCategory, 'general', 'unknown category reads back as general');
// Unknown-but-well-formed values are normalised away, never stored.
assert.equal(hostile.questions[0].iconName, undefined, 'unknown icon is dropped');
assert.equal(hostile.questions[0].illustrationAssetId, undefined, 'blank illustration id is dropped');
// Wrong-typed values are read as "not set".
assert.equal(hostile.questions[1].contentCategory, undefined, 'non-string category is dropped');
assert.equal(hostile.questions[1].iconName, undefined, 'null icon is dropped');
assert.equal(hostile.questions[1].illustrationAssetId, undefined, 'object illustration is dropped');
assert.equal(hostile.questions[2].contentCategory, undefined, 'null category on a text question is dropped');
assert.equal(hostile.questions[2].iconName, undefined, 'numeric icon is dropped');
assert.equal(hostile.questions[2].illustrationAssetId, undefined, 'array illustration is dropped');

// The parser keeps its previous key contract (no key set change for consumers).
const paddedQuestion = plain<{ questions: Array<Record<string, unknown>> }>(parseGameDraft(legacyDraftValue)).questions[0];
assert.ok('contentCategory' in paddedQuestion, 'parsed drafts keep the contentCategory key');
assert.ok('iconName' in paddedQuestion, 'parsed drafts keep the iconName key');
assert.ok('illustrationAssetId' in paddedQuestion, 'parsed drafts keep the illustrationAssetId key');

console.log('item-assets: legacy + hostile input ok');

// ---------------------------------------------------------------------------
// 2. Draft -> game for all five templates
// ---------------------------------------------------------------------------

const arenaAssets = draftToGame(loose({
  gameType: 'arena',
  schemaVersion: 1,
  questions: [
    {
      id: 'q1', type: 'multiple-choice', prompt: 'Con mèo kêu thế nào?',
      options: [{ id: 'a', text: 'Meo meo' }, { id: 'b', text: 'Gâu gâu' }],
      correctOptionId: 'a', explanation: 'Mèo kêu meo meo.', difficulty: 'dễ', points: 100,
      ...assets
    },
    {
      id: 'q2', type: 'fill-in-blank', prompt: 'Con ... kêu meo meo.',
      correctAnswer: 'mèo', explanation: 'Đó là con mèo.', difficulty: 'dễ', points: 100,
      ...assets
    }
  ]
}));
assert.equal(arenaAssets.questions[0].contentCategory, 'animals', 'arena choice question must keep contentCategory');
assert.equal(arenaAssets.questions[0].iconName, assets.iconName);
assert.equal(arenaAssets.questions[0].illustrationAssetId, 'animals-farm-1');
assert.equal(arenaAssets.questions[1].contentCategory, 'animals', 'arena text question must keep contentCategory');
assert.equal(arenaAssets.questions[1].iconName, assets.iconName);

const scenarioAssets = draftToGame(loose({
  gameType: 'scenario',
  schemaVersion: 1,
  situations: [{
    id: 's1', prompt: 'Em sẽ làm gì?',
    options: [
      { id: 'a', text: 'Nhặt rác', score: { safety: 1, reasoning: 1, harmReduction: 1 } },
      { id: 'b', text: 'Bỏ đi', score: { safety: 0, reasoning: 0, harmReduction: 0 } }
    ],
    ...assets
  }]
}));
assert.equal(scenarioAssets.questions[0].contentCategory, 'animals', 'scenario situation must keep contentCategory');
assert.equal(scenarioAssets.questions[0].iconName, assets.iconName);

const treasureAssets = draftToGame(loose({
  gameType: 'treasure',
  schemaVersion: 1,
  character: 'Nhà thám hiểm', intro: 'Lên đường!', journeyBonus: 50, hiddenItemBonus: 20,
  stages: [{
    id: 'st1', name: 'Trạm 1', story: 'Câu chuyện.', taskDescription: 'Nhiệm vụ.',
    question: {
      prompt: 'Con mèo kêu thế nào?',
      options: [{ id: 'a', text: 'Meo meo' }, { id: 'b', text: 'Gâu gâu' }],
      correctOptionId: 'a', explanation: 'Meo meo.', hint: 'Nó là con mèo.',
      ...assets
    },
    attempts: 0, points: 100, completionBonus: 0, nextStageId: 'st2'
  }, {
    id: 'st2', name: 'Trạm 2', story: 'Câu chuyện cuối.', taskDescription: 'Nhiệm vụ cuối.',
    question: {
      prompt: 'Con chó kêu thế nào?',
      options: [{ id: 'a', text: 'Gâu gâu' }, { id: 'b', text: 'Meo meo' }],
      correctOptionId: 'a', explanation: 'Gâu gâu.'
    },
    attempts: 0, points: 100, completionBonus: 0, nextStageId: null
  }]
}));
assert.equal(treasureAssets.treasureHunt?.stages[0].question.contentCategory, 'animals', 'treasure stage question must keep contentCategory');
assert.equal(treasureAssets.treasureHunt?.stages[0].question.iconName, assets.iconName);
assert.equal(treasureAssets.questions[0].contentCategory, 'animals', 'flattened treasure question must keep contentCategory');

const raceAssets = draftToGame(loose({
  gameType: 'race',
  schemaVersion: 1,
  trackLength: 20, maxRounds: 10, stepByDifficulty: false, luckEnabled: false,
  teams: [{ id: 't1', name: 'Đội 1', icon: '⚡' }, { id: 't2', name: 'Đội 2', icon: '🔥' }],
  cells: [{ cell: 5, type: 'boost', label: 'Tăng tốc' }],
  questions: [{
    id: 'rq1', prompt: 'Con mèo kêu thế nào?',
    options: [{ id: 'a', text: 'Meo meo' }, { id: 'b', text: 'Gâu gâu' }],
    correctOptionId: 'a', explanation: 'Meo meo.', difficulty: 'dễ',
    ...assets
  }]
}));
assert.equal(raceAssets.questions[0].contentCategory, 'animals', 'race question must keep contentCategory');
assert.equal(raceAssets.race?.questions[0].contentCategory, 'animals', 'race payload question must keep contentCategory');
assert.equal(raceAssets.race?.questions[0].iconName, assets.iconName);

// Matching has no per-item question shape; it must still convert cleanly.
const matchingAssets = draftToGame(loose({
  gameType: 'matching',
  schemaVersion: 1,
  mode: 'columns',
  pairs: [{ id: 'p1', left: 'Mèo', right: 'Meo meo' }, { id: 'p2', left: 'Chó', right: 'Gâu gâu' }],
  pointsPerPair: 10, completionBonus: 0, wrongPenalty: 0, timeBonus: 0, bonusUnderSeconds: 0, practiceMode: false
}));
assert.equal(matchingAssets.matchingGame?.pairs.length, 2);
assert.ok(!('contentCategory' in (matchingAssets.matchingGame?.pairs[0] ?? {})), 'matching pairs carry no item assets');

console.log('item-assets: draft -> game ok for all 5 templates');

// ---------------------------------------------------------------------------
// 3. Game -> draft (the wizard re-open path)
// ---------------------------------------------------------------------------

const arenaProject = fromEducationalGame(arenaAssets);
const arenaDraftQuestions = plain<{ questions: Array<Record<string, unknown>> }>(arenaProject.draft).questions;
assert.equal(arenaDraftQuestions[0].contentCategory, 'animals', 'reopened arena choice question must keep its category');
assert.equal(arenaDraftQuestions[0].iconName, assets.iconName, 'reopened arena question must keep its icon');
assert.equal(arenaDraftQuestions[0].illustrationAssetId, 'animals-farm-1');
assert.equal(arenaDraftQuestions[1].contentCategory, 'animals', 'reopened arena text question must keep its category');

const scenarioProject = fromEducationalGame(scenarioAssets);
assert.equal(
  plain<{ situations: Array<Record<string, unknown>> }>(scenarioProject.draft).situations[0].contentCategory,
  'animals',
  'reopened scenario must keep its category'
);

const treasureProject = fromEducationalGame(treasureAssets);
const treasureDraftStage = plain<{ stages: Array<{ question: Record<string, unknown> }> }>(treasureProject.draft).stages[0];
assert.equal(treasureDraftStage.question.contentCategory, 'animals', 'reopened treasure stage must keep its category');
assert.equal(treasureDraftStage.question.iconName, assets.iconName);

const raceProject = fromEducationalGame(raceAssets);
const raceDraftQuestion = plain<{ questions: Array<Record<string, unknown>> }>(raceProject.draft).questions[0];
assert.equal(raceDraftQuestion.contentCategory, 'animals', 'reopened race question must keep its category');
assert.equal(raceDraftQuestion.iconName, assets.iconName);
assert.equal(raceDraftQuestion.illustrationAssetId, 'animals-farm-1');

console.log('item-assets: game -> draft ok');

// ---------------------------------------------------------------------------
// 4. Full cycle: draft -> game -> draft -> game keeps the same values
// ---------------------------------------------------------------------------

const secondGame = draftToGame(arenaProject.draft);
assert.equal(secondGame.questions[0].contentCategory, 'animals', 'second cycle must not lose the category');
assert.equal(secondGame.questions[0].iconName, assets.iconName);
assert.equal(secondGame.questions[0].illustrationAssetId, 'animals-farm-1');
assert.equal(secondGame.questions[0].prompt, arenaAssets.questions[0].prompt);

// Everything except the asset fields must be identical across cycles.
const strip = (question: Record<string, unknown>) => {
  const { contentCategory, iconName, illustrationAssetId, ...rest } = question as Record<string, unknown> & { contentCategory?: unknown; iconName?: unknown; illustrationAssetId?: unknown };
  void contentCategory; void iconName; void illustrationAssetId;
  return rest;
};
assert.deepEqual(
  strip(secondGame.questions[0] as unknown as Record<string, unknown>),
  strip(arenaAssets.questions[0] as unknown as Record<string, unknown>),
  'a re-saved game must not drift outside the asset fields'
);

// ---------------------------------------------------------------------------
// 5. .egame package: JSON round trip preserves the new fields
// ---------------------------------------------------------------------------

const packaged = JSON.parse(JSON.stringify({ packageFormat: 'edugame', packageVersion: 1, game: raceAssets }));
assert.equal(packaged.game.race.questions[0].contentCategory, 'animals', '.egame JSON must keep race question category');
assert.equal(packaged.game.race.questions[0].iconName, assets.iconName);
assert.equal(packaged.game.questions[0].illustrationAssetId, 'animals-farm-1');

// Explicit `general` survives reopening (the editor can show "General").
const generalGame = draftToGame(loose({
  gameType: 'arena',
  schemaVersion: 1,
  questions: [{
    id: 'g1', type: 'multiple-choice', prompt: 'Câu hỏi chung?',
    options: [{ id: 'a', text: 'Có' }, { id: 'b', text: 'Không' }],
    correctOptionId: 'a', explanation: 'Vì vậy.', difficulty: 'dễ', points: 100,
    contentCategory: 'general'
  }]
}));
const generalDraft = fromEducationalGame(generalGame);
assert.equal(
  plain<{ questions: Array<Record<string, unknown>> }>(generalDraft.draft).questions[0].contentCategory,
  'general',
  'an explicit general category must survive reopening'
);

console.log('item-assets-adapter tests passed');
