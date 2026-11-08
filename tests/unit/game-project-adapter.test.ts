import assert from 'node:assert/strict';
import { GameAdapterError, fromEducationalGame, toEducationalGame } from '../../src/services/game/game-project-adapter';
import {
  validateMatchingGame,
  validateRaceGame,
  validateScenarioGame,
  validateTreasureHuntGame
} from '../../src/services/game/game-validation';
import type {
  EducationalGame,
  GameOption,
  GameQuestion
} from '../../src/shared/types';
import type {
  ArenaConfig,
  GameConfig,
  GameDraft,
  GameProject,
  MatchingConfig,
  MatchingDraft,
  RaceConfig,
  ScenarioConfig,
  TreasureConfig
} from '../../src/shared/lesson-types';

const ISO = '2026-01-01T00:00:00.000Z';

const arenaDraft: GameDraft = {
  gameType: 'arena',
  schemaVersion: 1,
  questions: [
    {
      id: 'q1', type: 'multiple-choice', prompt: '2 + 3 = ?',
      options: [{ id: 'a', text: '5' }, { id: 'b', text: '6' }],
      correctOptionId: 'a', explanation: 'Bằng 5.', difficulty: 'dễ', points: 100
    },
    {
      id: 'q2', type: 'true-false', prompt: 'Nước sôi ở 100°C.',
      options: [{ id: 'a', text: 'Đúng' }, { id: 'b', text: 'Sai' }],
      correctOptionId: 'a', explanation: 'Đúng.', difficulty: 'trung bình', points: 200
    },
    {
      id: 'q3', type: 'fill-in-blank', prompt: 'Thủ đô Việt Nam là ...',
      correctAnswer: 'Hà Nội', explanation: 'Hà Nội.', difficulty: 'khó', points: 300
    }
  ]
};

const scenarioDraft: GameDraft = {
  gameType: 'scenario',
  schemaVersion: 1,
  situations: [
    {
      id: 's1', context: 'Sân trường', prompt: 'Bạn bị ngã.',
      options: [
        { id: 'a', text: 'Giúp bạn', nextSituationId: 's2', feedback: 'Rất tốt.', score: { safety: 60, reasoning: 25, harmReduction: 15 } },
        { id: 'b', text: 'Đứng nhìn', nextSituationId: null, score: { safety: 0, reasoning: 0, harmReduction: 0 } }
      ],
      correctOptionId: 'a',
      discussionPrompt: 'Vì sao nên giúp bạn?'
    },
    {
      id: 's2', prompt: 'Bạn đau chân.',
      options: [
        { id: 'a', text: 'Đưa tới phòng y tế', nextSituationId: null },
        { id: 'b', text: 'Để bạn tự đi', nextSituationId: null }
      ]
    }
  ]
};

const matchingDraft: GameDraft = {
  gameType: 'matching',
  schemaVersion: 1,
  mode: 'columns',
  pairs: [
    { id: 'p1', left: 'Quang hợp', right: 'Tổng hợp chất hữu cơ' },
    { id: 'p2', left: 'Hô hấp', right: 'Giải phóng năng lượng' }
  ],
  pointsPerPair: 100, completionBonus: 200, wrongPenalty: 0, timeBonus: 50, bonusUnderSeconds: 60, practiceMode: false
};

const treasureDraft: GameDraft = {
  gameType: 'treasure',
  schemaVersion: 1,
  character: 'Nhà thám hiểm',
  intro: 'Tìm kho báu.',
  journeyBonus: 300,
  hiddenItemBonus: 50,
  backgroundId: 'forest',
  characterId: 'biologist',
  stages: [
    {
      id: 'st1', name: 'Cổng rừng', story: 'Cổng gỗ.', taskDescription: 'Mở cổng.',
      question: {
        prompt: 'Cây cần gì để quang hợp?',
        options: [{ id: 'a', text: 'Ánh sáng' }, { id: 'b', text: 'Bóng tối' }],
        correctOptionId: 'a', explanation: 'Cần ánh sáng.', hint: 'Mặt trời'
      },
      attempts: 0, points: 100, completionBonus: 200
    },
    {
      id: 'st2', name: 'Hang', story: 'Có kho báu.', taskDescription: 'Câu đố cuối.',
      question: {
        prompt: 'Nước đóng băng thành thể gì?',
        options: [{ id: 'a', text: 'Rắn' }, { id: 'b', text: 'Khí' }],
        correctOptionId: 'a', explanation: 'Thể rắn.', hint: 'Rất lạnh'
      },
      attempts: 2, points: 200, completionBonus: 300, nextStageId: null
    }
  ]
};

const raceDraft: GameDraft = {
  gameType: 'race',
  schemaVersion: 1,
  trackLength: 12,
  maxRounds: 6,
  stepByDifficulty: true,
  luckEnabled: true,
  teams: [{ id: 't1', name: 'Đội đỏ', icon: '🔴' }, { id: 't2', name: 'Đội xanh' }],
  cells: [{ cell: 6, type: 'boost', label: 'Tăng tốc' }],
  questions: [
    {
      id: 'rq1', prompt: 'Một tuần có bao nhiêu ngày?',
      options: [{ id: 'a', text: '7' }, { id: 'b', text: '8' }],
      correctOptionId: 'a', explanation: 'Bảy ngày.', difficulty: 'dễ'
    }
  ]
};

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

function projectFor(draft: GameDraft, overrides: Partial<GameProject> = {}): GameProject {
  return {
    id: 'project-1',
    schemaVersion: 1,
    status: 'draft',
    step: 'edit',
    title: 'Trò chơi thử nghiệm',
    description: 'Mô tả trò chơi.',
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
    updatedAt: ISO,
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// Draft -> EducationalGame
// ---------------------------------------------------------------------------

const arenaGame = toEducationalGame(projectFor(arenaDraft));
assert.equal(arenaGame.template, 'quiz');
assert.equal(arenaGame.questions.length, 3);
assert.equal(arenaGame.questions[2].type, 'fill-in-blank');
assert.equal(arenaGame.questions[2].correctAnswer, 'Hà Nội');
assert.equal(arenaGame.subject, 'Toán');
assert.deepEqual(arenaGame.tags, ['AI tạo']);
assert.equal(arenaGame.gameSetup?.difficulty, 'trung bình');

const scenarioGame = toEducationalGame(projectFor(scenarioDraft));
assert.equal(scenarioGame.template, 'scenario');
assert.equal(scenarioGame.questions.length, 2);
assert.equal(scenarioGame.questions[0].type, 'scenario');
assert.equal(scenarioGame.questions[0].options[0].nextQuestionId, 's2');
assert.equal(scenarioGame.questions[0].options[1].nextQuestionId, undefined);
assert.equal(scenarioGame.questions[0].correctOptionId, 'a');
assert.equal(scenarioGame.questions[1].options[0].nextQuestionId, undefined);
validateScenarioGame(scenarioGame);

const matchingGame = toEducationalGame(projectFor(matchingDraft));
assert.equal(matchingGame.template, 'matching');
assert.equal(matchingGame.matchingGame?.pairs.length, 2);
assert.deepEqual(matchingGame.questions, []);
validateMatchingGame(matchingGame);

const treasureGame = toEducationalGame(projectFor(treasureDraft));
assert.equal(treasureGame.template, 'treasure-hunt');
assert.equal(treasureGame.treasureHunt?.stages.length, 2);
assert.equal(treasureGame.treasureHunt?.stages[0].nextStageId, 'st2', 'omitted nextStageId should chain to the following stage');
assert.equal(treasureGame.treasureHunt?.stages[1].nextStageId, null);
assert.equal(treasureGame.treasureHunt?.backgroundId, 'forest');
assert.equal(treasureGame.treasureHunt?.characterId, 'biologist');
assert.equal(treasureGame.questions.length, 2);
validateTreasureHuntGame(treasureGame);
const roundTripArt = toEducationalGame(fromEducationalGame(treasureGame));
assert.equal(roundTripArt.treasureHunt?.backgroundId, 'forest', 'draft round-trip preserves the background');
assert.equal(roundTripArt.treasureHunt?.characterId, 'biologist', 'draft round-trip preserves the avatar');
validateTreasureHuntGame(roundTripArt);

const variantTreasureDraft: GameDraft = {
  ...treasureDraft,
  stages: [
    {
      ...treasureDraft.stages[0],
      mission: {
        type: 'matching',
        pairs: [
          { id: 'p1', left: 'Quang hợp', right: 'Tổng hợp chất hữu cơ' },
          { id: 'p2', left: 'Hô hấp', right: 'Giải phóng năng lượng' }
        ]
      },
      question: {
        prompt: 'Ghép các quá trình với mô tả đúng.',
        options: [],
        correctOptionId: '',
        explanation: 'Ghép đúng để mở cổng.',
        hint: 'Đọc kỹ hai vế.'
      }
    },
    {
      ...treasureDraft.stages[1],
      mission: { type: 'decode', answer: 'quang hợp', cipher: 'hợp quang' },
      question: {
        prompt: 'Giải mã từ khóa của chặng cuối.',
        options: [],
        correctOptionId: '',
        explanation: 'Đáp án là quang hợp.',
        hint: 'Đây là quá trình cây tạo chất hữu cơ.'
      }
    }
  ]
};
const variantTreasureGame = toEducationalGame(projectFor(variantTreasureDraft));
assert.equal(variantTreasureGame.treasureHunt?.stages[0].mission?.type, 'matching');
assert.equal(variantTreasureGame.treasureHunt?.stages[1].mission?.type, 'decode');
assert.equal(variantTreasureGame.questions.length, 2);
validateTreasureHuntGame(variantTreasureGame);
const roundTripVariant = toEducationalGame(fromEducationalGame(variantTreasureGame));
assert.deepEqual(roundTripVariant.treasureHunt?.stages[0].mission, variantTreasureGame.treasureHunt?.stages[0].mission);
assert.deepEqual(roundTripVariant.treasureHunt?.stages[1].mission, variantTreasureGame.treasureHunt?.stages[1].mission);
validateTreasureHuntGame(roundTripVariant);

const raceGame = toEducationalGame(projectFor(raceDraft));
assert.equal(raceGame.template, 'race');
assert.equal(raceGame.race?.questions.length, 1);
assert.equal(raceGame.race?.teams[1].icon, '🏁', 'missing icon should fall back to a default');
assert.equal(raceGame.questions[0].type, 'multiple-choice');
validateRaceGame(raceGame);

// --- Adapter errors --------------------------------------------------------
const expectAdapterError = (code: string, run: () => unknown): void => {
  try {
    run();
    assert.fail(`expected GameAdapterError ${code}`);
  } catch (error) {
    assert.ok(error instanceof GameAdapterError, `expected GameAdapterError, got ${String(error)}`);
    assert.equal((error as GameAdapterError).code, code);
  }
};

expectAdapterError('ADAPTER_MISSING_DRAFT', () => toEducationalGame(projectFor(arenaDraft, { draft: null })));
expectAdapterError('ADAPTER_MISSING_CONFIG', () => toEducationalGame(projectFor(arenaDraft, { config: null })));
expectAdapterError('PROJECT_VERSION_UNSUPPORTED', () => toEducationalGame(projectFor(arenaDraft, { schemaVersion: 2 as 1 })));
expectAdapterError('PROJECT_VERSION_UNSUPPORTED', () => toEducationalGame(projectFor({ ...arenaDraft, schemaVersion: 2 as 1 })));
expectAdapterError('ADAPTER_INVALID_DRAFT', () => toEducationalGame(projectFor({
  ...arenaDraft,
  questions: []
} as GameDraft)));
expectAdapterError('ADAPTER_INVALID_DRAFT', () => toEducationalGame(projectFor({
  ...arenaDraft,
  questions: [{ ...arenaDraft.questions[0], correctOptionId: 'z' }, arenaDraft.questions[1], arenaDraft.questions[2]]
} as GameDraft)));
expectAdapterError('ADAPTER_TYPE_MISMATCH', () => toEducationalGame(projectFor(arenaDraft, { config: configFor(matchingDraft) })));

// ---------------------------------------------------------------------------
// EducationalGame -> project -> EducationalGame (legacy compatibility)
// ---------------------------------------------------------------------------

const quizGame: EducationalGame = {
  id: 'g-quiz',
  title: 'Quiz cũ',
  subject: 'Toán',
  grade: 'Lớp 5',
  topic: 'Cộng trừ',
  template: 'quiz',
  description: 'Trò chơi cũ.',
  questions: [
    {
      id: 'q1', type: 'multiple-choice', prompt: '2 + 3 = ?',
      options: [{ id: 'a', text: '5' }, { id: 'b', text: '6' }],
      correctOptionId: 'a', explanation: 'Bằng 5.', points: 100, difficulty: 'dễ'
    },
    {
      id: 'q2', type: 'short-answer', prompt: 'Thủ đô Việt Nam?',
      options: [], correctOptionId: '', correctAnswer: 'Hà Nội', explanation: 'Hà Nội.', points: 200, difficulty: 'khó'
    }
  ],
  tags: ['Cũ'],
  sourceName: 'bai-cu.txt',
  createdAt: ISO,
  updatedAt: ISO,
  gameSetup: { difficulty: 'trung bình', duration: '20', scoringMode: 'cơ bản', players: 'cá nhân', pointsPerCorrect: '250', timeBonus: '5', style: 'trò chơi' }
};

const scenarioQuestion = (id: string, nextId: string | null): GameQuestion => ({
  id,
  type: 'scenario',
  prompt: 'Tình huống',
  context: 'Lớp học',
  options: [
    { id: 'a', text: 'Hành động tốt', feedback: 'Tốt lắm', nextQuestionId: nextId, scenarioScore: { safety: 60, reasoning: 25, harmReduction: 15 } } as GameOption,
    { id: 'b', text: 'Hành động chưa tốt', nextQuestionId: null }
  ],
  correctOptionId: 'a',
  explanation: 'Giải thích',
  points: 100,
  discussionPrompt: 'Thảo luận nhóm'
});

const scenarioGameOld: EducationalGame = {
  id: 'g-scenario',
  title: 'Tình huống cũ',
  subject: 'Kỹ năng sống',
  grade: 'Lớp 6',
  topic: 'An toàn',
  template: 'scenario',
  description: 'Mô tả',
  questions: [scenarioQuestion('s1', 's2'), scenarioQuestion('s2', null)],
  tags: ['Cũ'],
  sourceName: 'bai-cu.txt',
  createdAt: ISO,
  updatedAt: ISO
};

const matchingGameOld: EducationalGame = {
  id: 'g-matching',
  title: 'Ghép cặp cũ',
  subject: 'Sinh học',
  grade: 'Lớp 7',
  topic: 'Tế bào',
  template: 'matching',
  description: 'Mô tả',
  questions: [],
  tags: [],
  sourceName: 'bai-cu.txt',
  createdAt: ISO,
  matchingGame: {
    mode: 'columns',
    pairs: [
      { id: 'p1', left: 'Quang hợp', right: 'Tổng hợp chất hữu cơ' },
      { id: 'p2', left: 'Hô hấp', right: 'Giải phóng năng lượng' }
    ],
    pointsPerPair: 100, completionBonus: 200, wrongPenalty: 0, timeBonus: 50, bonusUnderSeconds: 60, practiceMode: false
  }
};

const treasureStage = (id: string, name: string, nextStageId: string | null) => ({
  id,
  name,
  story: 'Câu chuyện',
  taskDescription: 'Nhiệm vụ',
  question: {
    prompt: 'Câu đố?',
    options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }],
    correctOptionId: 'a',
    explanation: 'Vì A đúng.',
    hint: 'Gợi ý'
  },
  attempts: 0,
  points: 100,
  completionBonus: 200,
  nextStageId,
  hasHiddenItem: false
});

const treasureGameOld: EducationalGame = {
  id: 'g-treasure',
  title: 'Hành trình cũ',
  subject: 'Tự nhiên',
  grade: 'Lớp 3',
  topic: 'Nước',
  template: 'treasure-hunt',
  description: 'Mô tả',
  questions: [],
  tags: [],
  sourceName: 'bai-cu.txt',
  createdAt: ISO,
  treasureHunt: {
    character: 'Nhà thám hiểm',
    intro: 'Bắt đầu',
    journeyBonus: 300,
    hiddenItemBonus: 50,
    stages: [treasureStage('s1', 'Chặng một', 's2'), treasureStage('s2', 'Chặng hai', null)]
  }
};

const raceGameOld: EducationalGame = {
  id: 'g-race',
  title: 'Đường đua cũ',
  subject: 'Tiếng Anh',
  grade: 'Lớp 8',
  topic: 'Từ vựng',
  template: 'race',
  description: 'Mô tả',
  questions: [],
  tags: [],
  sourceName: 'bai-cu.txt',
  createdAt: ISO,
  race: {
    trackLength: 12,
    maxRounds: 6,
    stepByDifficulty: true,
    luckEnabled: true,
    teams: [{ id: 't1', name: 'Đội đỏ', icon: '🔴' }, { id: 't2', name: 'Đội xanh', icon: '🔵' }],
    cells: [{ cell: 6, type: 'boost', label: 'Tăng tốc' }],
    questions: [
      { id: 'rq1', prompt: 'Một tuần có mấy ngày?', options: [{ id: 'a', text: '7' }, { id: 'b', text: '8' }], correctOptionId: 'a', explanation: 'Bảy ngày.', difficulty: 'dễ' }
    ]
  }
};

const roundTripArena = toEducationalGame(fromEducationalGame(quizGame));
assert.equal(roundTripArena.template, 'quiz');
assert.equal(roundTripArena.questions.length, 2);
assert.equal(roundTripArena.questions[1].type, 'short-answer');
assert.equal(roundTripArena.gameSetup?.pointsPerCorrect, '250');
assert.deepEqual(roundTripArena.tags, ['Cũ']);
assert.equal(roundTripArena.title, quizGame.title);

// House Building Mode (#140/#144): the setup the 3D layer reads must survive the
// project round trip, and an unknown legacy style must not leak through.
const houseArenaConfig: ArenaConfig = {
  ...(configFor(arenaDraft) as ArenaConfig),
  gameplayMode: 'house',
  houseStyle: 'nha-vuon'
};
const houseArenaGame = toEducationalGame(projectFor(arenaDraft, { config: houseArenaConfig }));
assert.equal(houseArenaGame.gameSetup?.gameplayMode, 'house');
assert.equal(houseArenaGame.gameSetup?.houseStyle, 'nha-vuon');
const houseArenaProject = fromEducationalGame(houseArenaGame);
assert.equal(houseArenaProject.config?.gameType, 'arena');
assert.equal(houseArenaProject.config?.gameType === 'arena' ? houseArenaProject.config.houseStyle : null, 'nha-vuon');
const houseArenaRoundTrip = toEducationalGame(houseArenaProject);
assert.equal(houseArenaRoundTrip.gameSetup?.gameplayMode, 'house');
assert.equal(houseArenaRoundTrip.gameSetup?.houseStyle, 'nha-vuon');
const legacyUnknownProject = fromEducationalGame({
  ...houseArenaGame,
  gameSetup: { ...houseArenaGame.gameSetup, houseStyle: 'khong-co' as never }
});
assert.equal(legacyUnknownProject.config?.gameType === 'arena' ? legacyUnknownProject.config.houseStyle : 'x', undefined);

// Object Connection (#168) is a MATCHING play style: `matchingGame.mode` becomes
// 'connection' and the template rides on the board. It survives the round trip,
// a non-connection board never carries a stale template, and an unknown template
// id is dropped (the renderer then falls back to the default).
const connectionDraft: GameDraft = {
  ...matchingDraft,
  mode: 'connection',
  connectionTemplate: 'solar-system'
};
const connectionConfig: MatchingConfig = {
  ...(configFor(connectionDraft) as MatchingConfig),
  matchingMode: 'connection',
  connectionTemplate: 'solar-system'
};
const connectionGame = toEducationalGame(projectFor(connectionDraft, { config: connectionConfig }));
assert.equal(connectionGame.template, 'matching');
assert.equal(connectionGame.matchingGame?.mode, 'connection');
assert.equal(connectionGame.matchingGame?.connectionTemplate, 'solar-system');
const connectionProject = fromEducationalGame(connectionGame);
assert.equal(connectionProject.config?.gameType, 'matching');
assert.equal(connectionProject.config?.gameType === 'matching' ? connectionProject.config.matchingMode : 'x', 'connection');
assert.equal(connectionProject.config?.gameType === 'matching' ? connectionProject.config.connectionTemplate : 'x', 'solar-system');
assert.equal(connectionProject.draft?.gameType === 'matching' ? connectionProject.draft.connectionTemplate : 'x', 'solar-system');
const connectionRoundTrip = toEducationalGame(connectionProject);
assert.equal(connectionRoundTrip.matchingGame?.mode, 'connection');
assert.equal(connectionRoundTrip.matchingGame?.connectionTemplate, 'solar-system');

// The draft wins over the config because the editor writes the draft last.
const draftWins = toEducationalGame(projectFor(connectionDraft, {
  config: { ...connectionConfig, connectionTemplate: 'bridge' }
}));
assert.equal(draftWins.matchingGame?.connectionTemplate, 'solar-system');

// A non-connection board drops a stale template instead of storing it.
const columnsWithTemplate: GameDraft = { ...matchingDraft, mode: 'columns' };
const staleTemplate = toEducationalGame(projectFor(columnsWithTemplate, {
  config: { ...(configFor(columnsWithTemplate) as MatchingConfig), matchingMode: 'columns', connectionTemplate: 'bridge' }
}));
assert.equal(staleTemplate.matchingGame?.connectionTemplate, undefined, 'a template never leaks onto columns');

// An unknown template id is not persisted anywhere.
const unknownDraft: GameDraft = { ...matchingDraft, mode: 'connection', connectionTemplate: 'khong-co' };
const unknownTemplate = toEducationalGame(projectFor(unknownDraft, {
  config: { ...(configFor(unknownDraft) as MatchingConfig), matchingMode: 'connection', connectionTemplate: 'khong-co' }
}));
assert.equal(unknownTemplate.matchingGame?.mode, 'connection');
assert.equal(unknownTemplate.matchingGame?.connectionTemplate, undefined, 'an unknown template id is dropped, not stored');
const unknownBack = fromEducationalGame({
  ...connectionGame,
  matchingGame: { ...connectionGame.matchingGame, connectionTemplate: 'khong-co' as never }
});
assert.equal(unknownBack.config?.gameType === 'matching' ? unknownBack.config.connectionTemplate : 'stored', undefined);
assert.equal(unknownBack.draft?.gameType === 'matching' ? unknownBack.draft.connectionTemplate : 'stored', undefined);

// Constellation board (DECISIONS #171): a constellation id is a valid template,
// and an OLD connection id is kept as is (mapped at render time, never rewritten
// behind the teacher's back).
const constellationDraft: GameDraft = { ...matchingDraft, mode: 'connection', connectionTemplate: 'orion' };
const constellationGame = toEducationalGame(projectFor(constellationDraft, {
  config: { ...(configFor(constellationDraft) as MatchingConfig), matchingMode: 'connection', connectionTemplate: 'orion' }
}));
assert.equal(constellationGame.matchingGame?.connectionTemplate, 'orion', 'a constellation id is stored');
const legacyDraft: GameDraft = { ...matchingDraft, mode: 'connection', connectionTemplate: 'solar-system' };
const legacyGame = toEducationalGame(projectFor(legacyDraft, {
  config: { ...(configFor(legacyDraft) as MatchingConfig), matchingMode: 'connection', connectionTemplate: 'solar-system' }
}));
assert.equal(legacyGame.matchingGame?.connectionTemplate, 'solar-system', 'an old picture id survives untouched');

// Drag direction (#171): `right-to-left` is stored; the default is stored as
// ABSENT so the disk has one representation per meaning.
const reversedDraft: GameDraft = { ...matchingDraft, mode: 'connection', connectionTemplate: 'orion', dragDirection: 'right-to-left' };
const reversedConfig: MatchingConfig = {
  ...(configFor(reversedDraft) as MatchingConfig),
  matchingMode: 'connection',
  connectionTemplate: 'orion',
  dragDirection: 'right-to-left'
};
const reversedGame = toEducationalGame(projectFor(reversedDraft, { config: reversedConfig }));
assert.equal(reversedGame.matchingGame?.dragDirection, 'right-to-left', 'the reversed direction is stored');
const reversedProject = fromEducationalGame(reversedGame);
assert.equal(reversedProject.config?.gameType === 'matching' ? reversedProject.config.dragDirection : 'x', 'right-to-left');
assert.equal(reversedProject.draft?.gameType === 'matching' ? reversedProject.draft.dragDirection : 'x', 'right-to-left');
assert.equal(toEducationalGame(reversedProject).matchingGame?.dragDirection, 'right-to-left', 'the direction round-trips');
const defaultDirection = toEducationalGame(projectFor(constellationDraft, {
  config: { ...(configFor(constellationDraft) as MatchingConfig), matchingMode: 'connection', connectionTemplate: 'orion', dragDirection: 'left-to-right' }
}));
assert.equal(defaultDirection.matchingGame?.dragDirection, undefined, 'the default direction is absent, not spelled out');
const plainProject = fromEducationalGame(constellationGame);
assert.equal(plainProject.draft?.gameType === 'matching' ? plainProject.draft.dragDirection : 'x', undefined, 'absent reads back as absent');
const columnsWithDirection = toEducationalGame(projectFor({ ...matchingDraft, mode: 'columns' }, {
  config: { ...(configFor(matchingDraft) as MatchingConfig), matchingMode: 'columns', dragDirection: 'right-to-left' }
}));
assert.equal(columnsWithDirection.matchingGame?.dragDirection, undefined, 'a direction never leaks onto columns');

const roundTripScenario = toEducationalGame(fromEducationalGame(scenarioGameOld));
assert.equal(roundTripScenario.template, 'scenario');
assert.equal(roundTripScenario.questions.length, 2);
assert.equal(roundTripScenario.questions[0].options[0].scenarioScore?.safety, 60);
assert.equal(roundTripScenario.questions[0].discussionPrompt, 'Thảo luận nhóm');
validateScenarioGame(roundTripScenario);

const roundTripMatching = toEducationalGame(fromEducationalGame(matchingGameOld));
assert.equal(roundTripMatching.template, 'matching');
assert.deepEqual(roundTripMatching.matchingGame, matchingGameOld.matchingGame);
validateMatchingGame(roundTripMatching);

const roundTripTreasure = toEducationalGame(fromEducationalGame(treasureGameOld));
assert.equal(roundTripTreasure.template, 'treasure-hunt');
assert.equal(roundTripTreasure.treasureHunt?.stages[0].nextStageId, 's2');
assert.equal(roundTripTreasure.treasureHunt?.stages[1].nextStageId, null);
assert.equal(roundTripTreasure.treasureHunt?.backgroundId, undefined, 'legacy treasure keeps no art field');
assert.equal(roundTripTreasure.treasureHunt?.characterId, undefined, 'legacy treasure keeps no avatar field');
validateTreasureHuntGame(roundTripTreasure);

const roundTripRace = toEducationalGame(fromEducationalGame(raceGameOld));
assert.equal(roundTripRace.template, 'race');
assert.deepEqual(roundTripRace.race?.teams, raceGameOld.race?.teams);
assert.deepEqual(roundTripRace.race?.questions, raceGameOld.race?.questions);
assert.equal(roundTripRace.race?.cells.length, 1);
validateRaceGame(roundTripRace);

// Legacy games that cannot be represented in a draft fail with a clear code.
expectAdapterError('ADAPTER_LEGACY_DATA_UNSUPPORTED', () => fromEducationalGame({
  ...quizGame,
  questions: [{ ...quizGame.questions[1], correctAnswer: '' }]
}));
expectAdapterError('ADAPTER_LEGACY_DATA_UNSUPPORTED', () => fromEducationalGame({
  ...matchingGameOld,
  matchingGame: { ...matchingGameOld.matchingGame!, pairs: [matchingGameOld.matchingGame!.pairs[0]] }
}));
expectAdapterError('ADAPTER_UNKNOWN_TYPE', () => fromEducationalGame({
  ...quizGame,
  template: 'unknown' as EducationalGame['template']
}));

// ---------------------------------------------------------------------------
// Answer modes (DECISIONS #209, #223): the pick shares the ONE stored key with
// the legacy scoring mode. `gameSetup.scoringMode` holds a 'tra-loi:' token.
// "Giữ hành vi hiện tại" is gone: a game made before #209 opens on "Thi đấu"
// and is saved as that token; its old scoring mode is only read, never stashed.
// ---------------------------------------------------------------------------

const TOKEN = {
  competitive: 'tra-loi:thi-dau',
  practice: 'tra-loi:luyen-tap',
  challenge: 'tra-loi:thu-thach'
};

// --- Đấu trường ----------------------------------------------------------
const arenaPracticeConfig: ArenaConfig = { ...(configFor(arenaDraft) as ArenaConfig), answerMode: 'practice' };
const arenaPracticeGame = toEducationalGame(projectFor(arenaDraft, { config: arenaPracticeConfig }));
assert.equal(arenaPracticeGame.gameSetup?.scoringMode, TOKEN.practice, 'a wizard pick is stored as a token');
assert.equal(arenaPracticeGame.gameSetup?.legacyScoringMode, undefined, 'nothing is parked beside the token any more');
assert.equal(arenaPracticeGame.gameSetup?.pointsPerCorrect, '100', 'the per-question points still ride on the same setup');
const arenaPracticeProject = fromEducationalGame(arenaPracticeGame);
assert.equal(arenaPracticeProject.config?.gameType === 'arena' ? arenaPracticeProject.config.answerMode : 'x', 'practice');
assert.equal(arenaPracticeProject.config?.gameType === 'arena' ? arenaPracticeProject.config.scoringMode : 'x', 'basic', 'the scoring select keeps a value of its own');
assert.equal(toEducationalGame(arenaPracticeProject).gameSetup?.scoringMode, TOKEN.practice, 'save/reopen keeps the pick');

// 'tốc độ' pays a bonus: reopening such a game must show "Thi đấu" and saving it
// writes the token without touching the bonus it already pays.
const speedGame: EducationalGame = {
  ...quizGame,
  gameSetup: { ...quizGame.gameSetup, scoringMode: 'tốc độ' }
};
const speedProject = fromEducationalGame(speedGame);
const speedArenaConfig = speedProject.config as ArenaConfig;
assert.equal(speedArenaConfig.answerMode, 'competitive', 'a game made before #209 opens on Thi đấu');
assert.equal(speedArenaConfig.scoringMode, 'speed', 'and the speed law is still read');
const speedResaved = toEducationalGame(speedProject);
assert.equal(speedResaved.gameSetup?.scoringMode, TOKEN.competitive, 'saving writes the answer token');
assert.equal(speedResaved.gameSetup?.timeBonus, speedGame.gameSetup?.timeBonus, 'the bonus it pays is untouched');
assert.equal(speedResaved.gameSetup?.legacyScoringMode, undefined, 'the old value is not parked');
assert.equal(fromEducationalGame(speedResaved).config?.gameType === 'arena' ? (fromEducationalGame(speedResaved).config as ArenaConfig).answerMode : 'x', 'competitive');

// A legacy game gains the token on its next save, whichever mode it shipped with.
for (const legacyMode of ['cơ bản', 'tốc độ', 'theo độ khó', 'thi đấu đội', 'luyện tập']) {
  const legacyRoundTrip = toEducationalGame(fromEducationalGame({
    ...quizGame,
    gameSetup: { ...quizGame.gameSetup, scoringMode: legacyMode }
  }));
  assert.equal(legacyRoundTrip.gameSetup?.scoringMode, TOKEN.competitive, `${legacyMode} is saved as Thi đấu`);
  assert.equal(legacyRoundTrip.gameSetup?.legacyScoringMode, undefined, `${legacyMode} stores no stash`);
}

// --- Tình huống: only the reveal/lock law moves, the rubric select does not ----
const scenarioChallengeConfig: ScenarioConfig = { ...(configFor(scenarioDraft) as ScenarioConfig), answerMode: 'challenge' };
const scenarioChallengeGame = toEducationalGame(projectFor(scenarioDraft, { config: scenarioChallengeConfig }));
assert.equal(scenarioChallengeGame.gameSetup?.scoringMode, TOKEN.challenge);
assert.equal(scenarioChallengeGame.gameSetup?.legacyScoringMode, undefined);
validateScenarioGame(scenarioChallengeGame);
const scenarioProject = fromEducationalGame(scenarioChallengeGame);
assert.equal(scenarioProject.config?.gameType === 'scenario' ? scenarioProject.config.answerMode : 'x', 'challenge');
assert.equal(scenarioProject.config?.gameType === 'scenario' ? scenarioProject.config.scoringMode : 'x', 'quality', 'the score rubric select is untouched by the answer mode');
const scenarioCompetitiveGame = toEducationalGame(projectFor(scenarioDraft, { gameSetup: scenarioChallengeGame.gameSetup }));
assert.equal(scenarioCompetitiveGame.gameSetup?.scoringMode, TOKEN.competitive, 'a project with no pick saves as Thi đấu');
assert.equal(scenarioCompetitiveGame.gameSetup?.legacyScoringMode, undefined);

// --- Kho báu: the answer token is now the only mode it stores ----------------
const treasureFreshGame = toEducationalGame(projectFor(treasureDraft));
assert.equal(treasureFreshGame.gameSetup?.scoringMode, TOKEN.competitive, 'a treasure game now stores the token too');
assert.equal(fromEducationalGame(treasureFreshGame).config?.gameType === 'treasure' ? (fromEducationalGame(treasureFreshGame).config as TreasureConfig).answerMode : 'x', 'competitive');
const treasureCompetitiveConfig: TreasureConfig = { ...(configFor(treasureDraft) as TreasureConfig), answerMode: 'competitive' };
const treasureCompetitiveGame = toEducationalGame(projectFor(treasureDraft, { config: treasureCompetitiveConfig }));
assert.equal(treasureCompetitiveGame.gameSetup?.scoringMode, TOKEN.competitive);
assert.equal(Object.prototype.hasOwnProperty.call(treasureCompetitiveGame.gameSetup, 'legacyScoringMode'), false, 'no parked key is written');
// A treasure game saved before #223 carries no mode at all; it opens on Thi đấu.
const treasureOldProject = fromEducationalGame({ ...treasureFreshGame, gameSetup: {} });
assert.equal(treasureOldProject.config?.gameType === 'treasure' ? (treasureOldProject.config as TreasureConfig).answerMode : 'x', 'competitive', 'a mode-less treasure game reads as Thi đấu');
assert.equal(toEducationalGame(treasureOldProject).gameSetup?.scoringMode, TOKEN.competitive, 'and is saved with the token');

// --- Đường đua: teams stay, the mode rides on the same key ------------------
const racePracticeConfig: RaceConfig = { ...(configFor(raceDraft) as RaceConfig), answerMode: 'practice' };
const racePracticeGame = toEducationalGame(projectFor(raceDraft, { config: racePracticeConfig }));
assert.equal(racePracticeGame.gameSetup?.scoringMode, TOKEN.practice);
assert.equal(racePracticeGame.gameSetup?.legacyScoringMode, undefined);
assert.equal(racePracticeGame.gameSetup?.competition, 'đội', 'team play is not lost by the new key');
assert.equal(racePracticeGame.gameSetup?.players, 'cá nhân', 'the "Số người chơi" select stays the team gate');
validateRaceGame(racePracticeGame);
const raceProject = fromEducationalGame(racePracticeGame);
assert.equal(raceProject.config?.gameType === 'race' ? raceProject.config.answerMode : 'x', 'practice');
assert.equal(toEducationalGame({
  ...raceProject,
  gameSetup: racePracticeGame.gameSetup
}).gameSetup?.scoringMode, TOKEN.practice, 'reopening a race game keeps its pick');
assert.equal(fromEducationalGame({ ...racePracticeGame, gameSetup: { scoringMode: 'thi đấu đội' } }).config?.gameType === 'race'
  ? ((fromEducationalGame({ ...racePracticeGame, gameSetup: { scoringMode: 'thi đấu đội' } }).config) as RaceConfig).answerMode
  : 'x', 'competitive', 'an old race game opens on Thi đấu');

// --- Ghép cặp is out of scope: it keeps its own pairing penalty law ----------
const matchingForcedGame = toEducationalGame(projectFor(matchingDraft, {
  config: { ...configFor(matchingDraft), answerMode: 'practice' } as unknown as MatchingConfig
}));
assert.equal(matchingForcedGame.gameSetup?.scoringMode, 'cơ bản', 'a pick never lands on a matching game');
assert.equal(matchingForcedGame.gameSetup?.legacyScoringMode, undefined);
assert.deepEqual(matchingForcedGame.matchingGame, toEducationalGame(projectFor(matchingDraft)).matchingGame, 'the pairing law is byte-for-byte unchanged');
const matchingProject = fromEducationalGame(matchingGameOld);
assert.equal((matchingProject.config as { answerMode?: unknown }).answerMode, undefined, 'matching configs carry no answer mode');
assert.equal(matchingProject.draft?.gameType === 'matching' ? (matchingProject.draft as { answerMode?: unknown }).answerMode : 'x', undefined);

// A hand-edited or half-saved token without a stash must not crash the editor read.
const bareTokenProject = fromEducationalGame({ ...arenaPracticeGame, gameSetup: { scoringMode: TOKEN.challenge } });
assert.equal(bareTokenProject.config?.gameType === 'arena' ? bareTokenProject.config.answerMode : 'x', 'challenge');
assert.equal(bareTokenProject.config?.gameType === 'arena' ? bareTokenProject.config.scoringMode : 'x', 'basic', 'no stash falls back to base points');

// ---------------------------------------------------------------------------
// .egame package compatibility (JSON must survive save/import unchanged)
// ---------------------------------------------------------------------------

const packageGame = toEducationalGame(projectFor(raceDraft));
const packageJson = JSON.parse(JSON.stringify({ packageFormat: 'edugame', packageVersion: 1, game: packageGame }));
assert.equal(packageJson.packageFormat, 'edugame');
assert.equal(packageJson.packageVersion, 1);
assert.deepEqual(packageJson.game, packageGame, '.egame JSON round-trip must not change the adapted game');
validateRaceGame(packageJson.game);

// The mode a teacher picked must survive export/import as plain text: the token rides in
// `gameSetup`, which the package copies verbatim.
const packagePractice = toEducationalGame(projectFor(raceDraft, { config: racePracticeConfig }));
const packagePracticeJson = JSON.parse(JSON.stringify({ packageFormat: 'edugame', packageVersion: 1, game: packagePractice }));
assert.deepEqual(packagePracticeJson.game, packagePractice, 'a token game survives the package round-trip unchanged');
assert.equal(packagePracticeJson.game.gameSetup.scoringMode, TOKEN.practice, 'the pick survives .egame export');
assert.equal(packagePracticeJson.game.gameSetup.legacyScoringMode, undefined, 'no mode to go back to is exported');
validateRaceGame(packagePracticeJson.game);
const importedPracticeProject = fromEducationalGame(packagePracticeJson.game);
assert.equal(importedPracticeProject.config?.gameType === 'race' ? importedPracticeProject.config.answerMode : 'x', 'practice', 'an imported game reopens on the same pick');

console.log('Game project adapter tests passed');
