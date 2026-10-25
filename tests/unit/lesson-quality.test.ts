import assert from 'node:assert/strict';
import {
  checkDraftQuality,
  normalizeItemText,
  textSimilarity,
  type QualityIssueCode,
  type QualityReport
} from '../../src/services/lesson-quality';
import type {
  ArenaConfig,
  ArenaDraft,
  GameConfig,
  LessonAnalysis,
  MatchingConfig,
  MatchingDraft,
  RaceConfig,
  RaceDraft,
  ScenarioConfig,
  ScenarioDraft,
  TreasureConfig,
  TreasureDraft
} from '../../src/shared/lesson-types';

const NOW = '2026-04-04T00:00:00.000Z';

const base = {
  title: 'Trò chơi kiểm thử',
  subject: 'Sinh học',
  grade: '7',
  topic: 'Quang hợp',
  audience: 'teen' as const,
  durationMinutes: 10,
  difficulty: 'trung bình' as const,
  playMode: 'individual' as const,
  style: 'fun' as const,
  focusObjectiveIds: [] as string[],
  generationMode: 'fast' as const
};

const arenaConfig: ArenaConfig = {
  ...base,
  gameType: 'arena',
  questionCount: 2,
  scoringMode: 'basic',
  pointsPerCorrect: 10,
  timeBonus: 0
};
const scenarioConfig: ScenarioConfig = { ...base, gameType: 'scenario', situationCount: 1, scoringMode: 'quality' };
const matchingConfig: MatchingConfig = { ...base, gameType: 'matching', pairCount: 2, matchingMode: 'columns', wrongPenalty: 0 };
const treasureConfig: TreasureConfig = {
  ...base,
  gameType: 'treasure',
  stageCount: 2,
  attemptsPerStage: 2,
  journeyBonus: 20,
  hiddenItemBonus: 10
};
const raceConfig: RaceConfig = {
  ...base,
  gameType: 'race',
  trackLength: 20,
  maxRounds: 2,
  teamCount: 2,
  stepByDifficulty: false,
  luckEnabled: false
};

const analysis: LessonAnalysis = {
  id: 'analysis_1',
  schemaVersion: 1,
  documentId: 'doc_1',
  subject: 'Sinh học',
  grade: 7,
  topic: 'Quang hợp',
  objectives: [
    { id: 'obj_light', description: 'Nêu vai trò của ánh sáng trong quang hợp', cognitiveLevel: 'remember' }
  ],
  keyConcepts: [{ id: 'concept_1', term: 'Quang hợp', explanation: 'Tổng hợp chất hữu cơ nhờ ánh sáng.' }],
  uncertainties: [],
  sourceDocumentIds: ['doc_1'],
  createdAt: NOW
};

function cleanArena(): ArenaDraft {
  return {
    gameType: 'arena',
    schemaVersion: 1,
    questions: [
      {
        id: 'q1',
        type: 'multiple-choice',
        prompt: 'Quang hợp là gì?',
        options: [
          { id: 'a', text: 'Tổng hợp chất hữu cơ nhờ ánh sáng' },
          { id: 'b', text: 'Hô hấp tế bào' },
          { id: 'c', text: 'Tiêu hoá thức ăn' }
        ],
        correctOptionId: 'a',
        explanation: 'Quang hợp tổng hợp chất hữu cơ nhờ năng lượng ánh sáng.',
        difficulty: 'dễ',
        points: 10
      },
      {
        id: 'q2',
        type: 'fill-in-blank',
        prompt: 'Khí nào được thải ra trong quá trình quang hợp?',
        correctAnswer: 'Oxy',
        explanation: 'Quang hợp thải khí oxy ra môi trường.',
        difficulty: 'dễ',
        points: 10
      }
    ]
  };
}

function cleanScenario(): ScenarioDraft {
  return {
    gameType: 'scenario',
    schemaVersion: 1,
    situations: [
      {
        id: 's1',
        context: 'Trời nắng gắt, học sinh đi xe đạp.',
        prompt: 'Em nên làm gì?',
        options: [
          { id: 'o1', text: 'Đội mũ bảo hiểm và đi đúng làn', feedback: 'An toàn.', score: { safety: 3, reasoning: 2, harmReduction: 3 } },
          { id: 'o2', text: 'Đi hàng ba cho vui', feedback: 'Nguy hiểm.', score: { safety: 0, reasoning: 1, harmReduction: 0 } }
        ],
        discussionPrompt: 'Vì sao cần đội mũ bảo hiểm?'
      }
    ]
  };
}

function cleanMatching(): MatchingDraft {
  return {
    gameType: 'matching',
    schemaVersion: 1,
    mode: 'columns',
    pairs: [
      { id: 'p1', left: 'Quang hợp', right: 'Tổng hợp chất hữu cơ' },
      { id: 'p2', left: 'Hô hấp', right: 'Phân giải chất hữu cơ' }
    ],
    pointsPerPair: 10,
    completionBonus: 5,
    wrongPenalty: 0,
    timeBonus: 0,
    bonusUnderSeconds: 0,
    practiceMode: false
  };
}

function cleanTreasure(): TreasureDraft {
  return {
    gameType: 'treasure',
    schemaVersion: 1,
    character: 'Nhà thám hiểm nhí',
    intro: 'Hành trình tìm kho báu kiến thức.',
    journeyBonus: 20,
    hiddenItemBonus: 10,
    stages: [
      {
        id: 'st1',
        name: 'Chặng 1',
        story: 'Khu rừng ánh sáng',
        taskDescription: 'Trả lời để mở cổng',
        question: {
          prompt: 'Lá cây cần gì để quang hợp?',
          options: [
            { id: 'a', text: 'Ánh sáng' },
            { id: 'b', text: 'Bóng tối' },
            { id: 'c', text: 'Muối' }
          ],
          correctOptionId: 'a',
          explanation: 'Ánh sáng là điều kiện cần cho quang hợp.'
        },
        attempts: 2,
        points: 10,
        completionBonus: 5,
        nextStageId: 'st2'
      },
      {
        id: 'st2',
        name: 'Chặng 2',
        story: 'Hang đá',
        taskDescription: 'Câu đố cuối',
        question: {
          prompt: 'Sản phẩm của quang hợp là gì?',
          options: [
            { id: 'a', text: 'Chất hữu cơ và oxy' },
            { id: 'b', text: 'Khí CO2' },
            { id: 'c', text: 'Nước tiểu' }
          ],
          correctOptionId: 'a',
          explanation: 'Quang hợp tạo chất hữu cơ và thải oxy.'
        },
        attempts: 2,
        points: 10,
        completionBonus: 0
      }
    ]
  };
}

function cleanRace(): RaceDraft {
  return {
    gameType: 'race',
    schemaVersion: 1,
    trackLength: 20,
    maxRounds: 2,
    stepByDifficulty: false,
    luckEnabled: false,
    teams: [
      { id: 't1', name: 'Đội Đỏ' },
      { id: 't2', name: 'Đội Xanh' }
    ],
    cells: [{ cell: 5, type: 'boost', label: 'Tăng tốc' }],
    questions: [
      {
        id: 'q1',
        prompt: 'Quang hợp diễn ra ở đâu?',
        options: [
          { id: 'a', text: 'Lục lạp' },
          { id: 'b', text: 'Ti thể' },
          { id: 'c', text: 'Nhân' }
        ],
        correctOptionId: 'a',
        explanation: 'Quang hợp diễn ra trong lục lạp.',
        difficulty: 'dễ'
      },
      {
        id: 'q2',
        prompt: 'Sắc tố nào hấp thụ ánh sáng?',
        options: [
          { id: 'a', text: 'Diệp lục' },
          { id: 'b', text: 'Hemoglobin' },
          { id: 'c', text: 'Melanin' }
        ],
        correctOptionId: 'a',
        explanation: 'Diệp lục hấp thụ ánh sáng.',
        difficulty: 'trung bình'
      }
    ]
  };
}

const codes = (report: QualityReport): QualityIssueCode[] => report.issues.map(issue => issue.code);
const has = (report: QualityReport, code: QualityIssueCode): boolean => codes(report).includes(code);

// --- clean drafts ---------------------------------------------------------

const cleanArenaReport = checkDraftQuality({ draft: cleanArena(), config: arenaConfig, analysis });
assert.equal(cleanArenaReport.errors, 0, `unexpected errors: ${JSON.stringify(cleanArenaReport.issues)}`);
assert.equal(cleanArenaReport.canPublish, true);
assert.deepEqual(cleanArenaReport.counts, { requested: 2, found: 2, unit: 'câu hỏi' });

const cleanReports = [
  checkDraftQuality({ draft: cleanScenario(), config: scenarioConfig }),
  checkDraftQuality({ draft: cleanMatching(), config: matchingConfig }),
  checkDraftQuality({ draft: cleanTreasure(), config: treasureConfig }),
  checkDraftQuality({ draft: cleanRace(), config: raceConfig })
];
cleanReports.forEach(report => {
  assert.equal(report.errors, 0, `${report.gameType} should be clean: ${JSON.stringify(report.issues)}`);
});
assert.deepEqual(
  cleanReports.map(report => report.gameType),
  ['scenario', 'matching', 'treasure', 'race']
);

// --- arena: duplicates, options, answers, explanations --------------------

const duplicated = cleanArena();
duplicated.questions.push({
  id: 'q3',
  type: 'multiple-choice',
  prompt: '  Quang hợp là gì? ',
  options: [
    { id: 'a', text: 'Tổng hợp chất hữu cơ nhờ ánh sáng' },
    { id: 'b', text: 'tổng hợp chất hữu cơ nhờ ánh sáng.' },
    { id: 'c', text: 'Tất cả đều đúng' }
  ],
  correctOptionId: 'zzz',
  explanation: '',
  difficulty: 'dễ',
  points: 0
});
const duplicatedReport = checkDraftQuality({ draft: duplicated, config: { ...arenaConfig, questionCount: 3 } });
assert.ok(has(duplicatedReport, 'DUPLICATE_PROMPT'));
assert.ok(has(duplicatedReport, 'DUPLICATE_OPTION'));
assert.ok(has(duplicatedReport, 'MISSING_CORRECT_OPTION'));
assert.ok(has(duplicatedReport, 'GENERIC_OPTION'));
assert.ok(has(duplicatedReport, 'EMPTY_EXPLANATION'));
assert.ok(has(duplicatedReport, 'ZERO_POINTS'));
assert.equal(duplicatedReport.canPublish, false);
assert.ok(duplicatedReport.errors >= 3, JSON.stringify(duplicatedReport.issues));
// Duplicate findings point at the offending item.
const duplicateIssue = duplicatedReport.issues.find(issue => issue.code === 'DUPLICATE_PROMPT');
assert.equal(duplicateIssue && duplicateIssue.itemIndex, 3);

const twoOptions = cleanArena();
twoOptions.questions[0] = {
  ...twoOptions.questions[0],
  options: [
    { id: 'a', text: 'Ánh sáng' },
    { id: 'b', text: 'Bóng tối' }
  ]
} as never;
assert.ok(has(checkDraftQuality({ draft: twoOptions, config: arenaConfig }), 'ONLY_TWO_OPTIONS'));

// O6: a true/false question always has exactly two options — that is not a
// weakness of the question, so it must not produce the 2-option warning.
const trueFalseDraft = cleanArena();
trueFalseDraft.questions[0] = {
  ...trueFalseDraft.questions[0],
  type: 'true-false',
  options: [
    { id: 'a', text: 'Đúng' },
    { id: 'b', text: 'Sai' }
  ],
  correctOptionId: 'a'
} as never;
assert.ok(
  !has(checkDraftQuality({ draft: trueFalseDraft, config: arenaConfig }), 'ONLY_TWO_OPTIONS'),
  'true/false có đúng 2 lựa chọn nên không bị cảnh báo ONLY_TWO_OPTIONS'
);

const nearDuplicate: ArenaDraft = {
  gameType: 'arena',
  schemaVersion: 1,
  questions: [
    {
      id: 'n1',
      type: 'fill-in-blank',
      prompt: 'Quang hợp ở thực vật diễn ra chủ yếu ở bộ phận nào?',
      correctAnswer: 'Lá',
      explanation: 'Lá là cơ quan quang hợp chính.',
      difficulty: 'dễ',
      points: 10
    },
    {
      id: 'n2',
      type: 'fill-in-blank',
      prompt: 'Quang hợp ở thực vật diễn ra chủ yếu ở bộ phận nào vậy?',
      correctAnswer: 'Lá',
      explanation: 'Lá chứa nhiều lục lạp.',
      difficulty: 'dễ',
      points: 10
    }
  ]
};
const nearReport = checkDraftQuality({ draft: nearDuplicate, config: arenaConfig });
assert.ok(has(nearReport, 'NEAR_DUPLICATE_PROMPT'), JSON.stringify(codes(nearReport)));
assert.equal(has(nearReport, 'DUPLICATE_PROMPT'), false);

const missingAnswer = cleanArena();
missingAnswer.questions[1] = { ...missingAnswer.questions[1], correctAnswer: '   ' } as never;
assert.ok(has(checkDraftQuality({ draft: missingAnswer, config: arenaConfig }), 'MISSING_ANSWER'));

// --- counts ---------------------------------------------------------------

const belowRequest = checkDraftQuality({ draft: cleanArena(), config: { ...arenaConfig, questionCount: 6 } });
assert.ok(has(belowRequest, 'COUNT_BELOW_REQUEST'));
assert.equal(belowRequest.counts.found, 2);
assert.equal(belowRequest.counts.requested, 6);
assert.equal(belowRequest.errors, 0, 'a shorter set is a warning, not an error');

const noItems = checkDraftQuality({
  draft: { gameType: 'arena', schemaVersion: 1, questions: [] },
  config: arenaConfig
});
assert.ok(has(noItems, 'NO_ITEMS'));
assert.equal(noItems.canPublish, false);

// --- scenario -------------------------------------------------------------

const flatScores = cleanScenario();
flatScores.situations[0].options = [
  { id: 'o1', text: 'Phương án A', score: { safety: 1, reasoning: 1, harmReduction: 1 } },
  { id: 'o2', text: 'Phương án B', score: { safety: 1, reasoning: 1, harmReduction: 1 } }
];
const flatReport = checkDraftQuality({ draft: flatScores, config: scenarioConfig });
assert.ok(has(flatReport, 'SITUATION_NO_BEST_OPTION'));
assert.ok(has(flatReport, 'SITUATION_NO_SCORE_DIFFERENCE'));

const brokenScenario = cleanScenario();
brokenScenario.situations[0].options[0].nextSituationId = 'khong_ton_tai';
assert.ok(has(checkDraftQuality({ draft: brokenScenario, config: scenarioConfig }), 'BROKEN_LINK'));

const singleOption = cleanScenario();
singleOption.situations[0].options = [singleOption.situations[0].options[0]];
assert.ok(has(checkDraftQuality({ draft: singleOption, config: scenarioConfig }), 'TOO_FEW_OPTIONS'));

const noFeedback = cleanScenario();
noFeedback.situations[0].options.forEach(option => {
  delete option.feedback;
  delete option.consequence;
});
assert.ok(has(checkDraftQuality({ draft: noFeedback, config: scenarioConfig }), 'SITUATION_NO_FEEDBACK'));

// --- matching -------------------------------------------------------------

const duplicatePair = cleanMatching();
duplicatePair.pairs.push({ id: 'p3', left: 'Quang hợp', right: 'Một đáp án khác' });
assert.ok(has(checkDraftQuality({ draft: duplicatePair, config: matchingConfig }), 'DUPLICATE_PAIR'));

const emptySide = cleanMatching();
emptySide.pairs[1] = { id: 'p2', left: 'Hô hấp', right: '  ' };
assert.ok(has(checkDraftQuality({ draft: emptySide, config: matchingConfig }), 'EMPTY_PAIR_SIDE'));

const identicalSides = cleanMatching();
identicalSides.pairs[0] = { id: 'p1', left: 'Quang hợp', right: 'Quang hợp' };
assert.ok(has(checkDraftQuality({ draft: identicalSides, config: matchingConfig }), 'MATCHING_IDENTICAL_SIDES'));

const genericSide = cleanMatching();
genericSide.pairs[1] = { id: 'p2', left: 'Có', right: 'Giải phóng năng lượng' };
assert.ok(has(checkDraftQuality({ draft: genericSide, config: matchingConfig }), 'MATCHING_GENERIC_SIDE'));

// --- treasure -------------------------------------------------------------

const brokenChain = cleanTreasure();
brokenChain.stages[0].nextStageId = 'st_khong_co';
const brokenChainReport = checkDraftQuality({ draft: brokenChain, config: treasureConfig });
assert.ok(has(brokenChainReport, 'BROKEN_LINK'));
assert.ok(has(brokenChainReport, 'UNREACHABLE_STAGE'));

const cycle = cleanTreasure();
cycle.stages[1].nextStageId = 'st1';
assert.ok(has(checkDraftQuality({ draft: cycle, config: treasureConfig }), 'CHAIN_CYCLE'));

const duplicateStage = cleanTreasure();
duplicateStage.stages[1].id = 'st1';
assert.ok(has(checkDraftQuality({ draft: duplicateStage, config: treasureConfig }), 'DUPLICATE_STAGE_ID'));

const weakStage = cleanTreasure();
weakStage.stages[0].attempts = 0;
assert.ok(has(checkDraftQuality({ draft: weakStage, config: treasureConfig }), 'STAGE_NO_ATTEMPTS'));

const variantTreasureQuality = cleanTreasure();
variantTreasureQuality.stages[0].mission = {
  type: 'matching',
  pairs: [{ id: 'p1', left: 'Quang hợp', right: 'Tổng hợp chất hữu cơ' }, { id: 'p2', left: 'Hô hấp', right: 'Giải phóng năng lượng' }]
};
variantTreasureQuality.stages[0].question.options = [];
variantTreasureQuality.stages[0].question.correctOptionId = '';
variantTreasureQuality.stages[1].mission = { type: 'decode', answer: 'quang hợp' };
variantTreasureQuality.stages[1].question.options = [];
variantTreasureQuality.stages[1].question.correctOptionId = '';
const variantTreasureReport = checkDraftQuality({ draft: variantTreasureQuality, config: treasureConfig });
assert.ok(!has(variantTreasureReport, 'TOO_FEW_OPTIONS'));
assert.ok(!has(variantTreasureReport, 'MISSING_CORRECT_OPTION'));
assert.ok(!has(variantTreasureReport, 'MISSING_ANSWER'));

// --- race -----------------------------------------------------------------

const offTrack = cleanRace();
offTrack.cells.push({ cell: 99, type: 'penalty', label: 'Ngoài đường' });
assert.ok(has(checkDraftQuality({ draft: offTrack, config: raceConfig }), 'RACE_CELL_OUT_OF_TRACK'));

const oneTeam = cleanRace();
oneTeam.teams = [{ id: 't1', name: 'Đội Đỏ' }];
const oneTeamReport = checkDraftQuality({ draft: oneTeam, config: raceConfig });
assert.ok(has(oneTeamReport, 'RACE_TOO_FEW_TEAMS'));
assert.ok(has(oneTeamReport, 'RACE_TEAM_COUNT_MISMATCH'));

const mismatchedQuestions = checkDraftQuality({ draft: cleanRace(), config: { ...raceConfig, maxRounds: 6 } });
assert.ok(has(mismatchedQuestions, 'COUNT_BELOW_REQUEST'));

// --- objective coverage (hedged warning) ----------------------------------

// An objective about light/photosynthesis is not exercised by a respiration-only set.
const respirationOnly = cleanMatching();
respirationOnly.pairs = [
  { id: 'p1', left: 'Hô hấp', right: 'Phân giải chất hữu cơ' },
  { id: 'p2', left: 'Ti thể', right: 'Bào quan hô hấp' }
];
const uncovered = checkDraftQuality({
  draft: respirationOnly,
  config: { ...matchingConfig, focusObjectiveIds: ['obj_light'] },
  analysis
});
assert.ok(has(uncovered, 'OBJECTIVE_UNCOVERED'), JSON.stringify(codes(uncovered)));
assert.deepEqual(uncovered.uncoveredObjectiveIds, ['obj_light']);

const covered = checkDraftQuality({
  draft: cleanArena(),
  config: { ...arenaConfig, focusObjectiveIds: ['obj_light'] },
  analysis
});
assert.equal(has(covered, 'OBJECTIVE_UNCOVERED'), false, JSON.stringify(codes(covered)));
assert.deepEqual(covered.uncoveredObjectiveIds, []);

// No focus list => no coverage guessing.
assert.deepEqual(checkDraftQuality({ draft: cleanMatching(), config: matchingConfig, analysis }).uncoveredObjectiveIds, []);
// Unknown objective ids are ignored rather than reported.
assert.deepEqual(
  checkDraftQuality({ draft: cleanMatching(), config: { ...matchingConfig, focusObjectiveIds: ['missing'] }, analysis }).uncoveredObjectiveIds,
  []
);

// --- text helpers ---------------------------------------------------------

assert.equal(normalizeItemText('  Quang Hợp, là GÌ? '), 'quang hợp là gì');
assert.equal(normalizeItemText('A   B\n C'), 'a b c');
assert.ok(textSimilarity('Quang hợp là gì?', 'Quang hợp là gì') === 1);
assert.ok(textSimilarity('Quang hợp là gì?', 'Hô hấp là gì?') < 0.85);

// --- determinism ----------------------------------------------------------

const twice = [
  checkDraftQuality({ draft: duplicated, config: { ...arenaConfig, questionCount: 3 } }),
  checkDraftQuality({ draft: duplicated, config: { ...arenaConfig, questionCount: 3 } })
];
assert.deepEqual(twice[0], twice[1]);

// Report shape is JSON-serialisable (it crosses IPC).
assert.deepEqual(JSON.parse(JSON.stringify(cleanArenaReport)), cleanArenaReport);

console.log('Lesson quality tests passed');
