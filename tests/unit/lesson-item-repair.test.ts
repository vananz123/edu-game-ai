import assert from 'node:assert/strict';
import {
  LessonItemError,
  itemAt,
  itemCount,
  itemLabel,
  replaceDraftItem,
  resolveItemIndexes
} from '../../src/services/lesson-item-repair';
import type { QualityReport } from '../../src/services/lesson-quality';
import type {
  ArenaDraft,
  MatchingDraft,
  RaceDraft,
  ScenarioDraft,
  TreasureDraft
} from '../../src/shared/lesson-types';

const arenaDraft: ArenaDraft = {
  gameType: 'arena',
  schemaVersion: 1,
  questions: [
    {
      id: 'q1', type: 'multiple-choice', prompt: 'Câu một?',
      options: [{ id: 'a', text: 'Đúng' }, { id: 'b', text: 'Sai' }],
      correctOptionId: 'a', explanation: 'Vì một.', difficulty: 'dễ', points: 100
    },
    {
      id: 'q2', type: 'fill-in-blank', prompt: 'Câu hai ...',
      correctAnswer: 'Hai', explanation: 'Vì hai.', difficulty: 'khó', points: 200
    }
  ]
};

const scenarioDraft: ScenarioDraft = {
  gameType: 'scenario',
  schemaVersion: 1,
  situations: [
    {
      id: 's1',
      prompt: 'Tình huống một?',
      options: [
        { id: 'a', text: 'Hành động an toàn', nextSituationId: 's2', score: { safety: 10, reasoning: 5, harmReduction: 5 } },
        { id: 'b', text: 'Hành động sai', nextSituationId: null }
      ],
      correctOptionId: 'a'
    },
    {
      id: 's2',
      prompt: 'Tình huống hai?',
      options: [
        { id: 'a', text: 'Kết thúc an toàn', nextSituationId: null },
        { id: 'b', text: 'Kết thúc khác', nextSituationId: null }
      ]
    }
  ]
};

const matchingDraft: MatchingDraft = {
  gameType: 'matching',
  schemaVersion: 1,
  mode: 'columns',
  pairs: [
    { id: 'p1', left: 'Quang hợp', right: 'Tổng hợp chất hữu cơ' },
    { id: 'p2', left: 'Hô hấp', right: 'Phân giải chất hữu cơ' }
  ],
  pointsPerPair: 100,
  completionBonus: 200,
  wrongPenalty: 0,
  timeBonus: 50,
  bonusUnderSeconds: 60,
  practiceMode: false
};

const treasureDraft: TreasureDraft = {
  gameType: 'treasure',
  schemaVersion: 1,
  character: 'Nhà thám hiểm',
  intro: 'Hành trình tìm kho báu.',
  journeyBonus: 300,
  hiddenItemBonus: 50,
  stages: [
    {
      id: 'st1',
      name: 'Chặng một',
      story: 'Bối cảnh một.',
      taskDescription: 'Nhiệm vụ một.',
      question: {
        prompt: 'Câu chặng một?',
        options: [{ id: 'a', text: 'Đúng' }, { id: 'b', text: 'Sai' }],
        correctOptionId: 'a',
        explanation: 'Vì một.'
      },
      attempts: 2,
      points: 100,
      completionBonus: 50,
      nextStageId: 'st2',
      branchLabel: 'Lối tắt',
      branchStageId: 'st2',
      hasHiddenItem: true
    },
    {
      id: 'st2',
      name: 'Chặng hai',
      story: 'Bối cảnh hai.',
      taskDescription: 'Nhiệm vụ hai.',
      question: {
        prompt: 'Câu chặng hai?',
        options: [{ id: 'a', text: 'Đúng' }, { id: 'b', text: 'Sai' }],
        correctOptionId: 'a',
        explanation: 'Vì hai.'
      },
      attempts: 2,
      points: 100,
      completionBonus: 50,
      nextStageId: null
    }
  ]
};

const raceDraft: RaceDraft = {
  gameType: 'race',
  schemaVersion: 1,
  trackLength: 12,
  maxRounds: 6,
  stepByDifficulty: true,
  luckEnabled: true,
  teams: [
    { id: 't1', name: 'Đội 1', icon: '🚀' },
    { id: 't2', name: 'Đội 2', icon: '🏎️' }
  ],
  cells: [{ cell: 5, type: 'boost', label: 'Tăng tốc' }],
  questions: [
    {
      id: 'q1', prompt: 'Câu đua một?',
      options: [{ id: 'a', text: 'Đúng' }, { id: 'b', text: 'Sai' }],
      correctOptionId: 'a', explanation: 'Vì một.', difficulty: 'dễ'
    }
  ]
};

function expectItemError(code: string, run: () => unknown): void {
  try {
    run();
    assert.fail(`expected LessonItemError ${code}`);
  } catch (error) {
    assert.ok(error instanceof LessonItemError, `expected LessonItemError, got ${String(error)}`);
    assert.equal((error as LessonItemError).code, code);
  }
}

function run(): void {
  // --- Counting + labels ----------------------------------------------------
  assert.equal(itemCount(arenaDraft), 2);
  assert.equal(itemCount(scenarioDraft), 2);
  assert.equal(itemCount(matchingDraft), 2);
  assert.equal(itemCount(treasureDraft), 2);
  assert.equal(itemCount(raceDraft), 1);
  assert.equal(itemLabel('arena', 3), 'Câu hỏi 3');
  assert.equal(itemLabel('scenario', 1), 'Tình huống 1');
  assert.equal(itemLabel('matching', 2), 'Cặp ghép 2');
  assert.equal(itemLabel('treasure', 5), 'Chặng 5');
  assert.equal(itemLabel('race', 4), 'Câu hỏi 4');

  // --- Positions ------------------------------------------------------------
  assert.equal((itemAt(arenaDraft, 2) as { id: string }).id, 'q2');
  expectItemError('ITEM_INDEX_INVALID', () => itemAt(arenaDraft, 0));
  expectItemError('ITEM_INDEX_INVALID', () => itemAt(arenaDraft, 3));
  expectItemError('ITEM_INDEX_INVALID', () => itemAt(arenaDraft, 1.5));
  expectItemError('ITEM_INDEX_INVALID', () => replaceDraftItem(arenaDraft, 9, {}));

  // --- Arena: content replaced, id + siblings preserved ---------------------
  const arenaReplaced = replaceDraftItem(arenaDraft, 1, {
    id: 'model-invented',
    type: 'multiple-choice',
    prompt: 'Câu một mới?',
    options: [{ id: 'x', text: 'Mới đúng' }, { id: 'y', text: 'Mới sai' }],
    correctOptionId: 'x',
    explanation: 'Giải thích mới.',
    difficulty: 'trung bình',
    points: 150
  });
  assert.equal(arenaReplaced.gameType, 'arena');
  const arenaQuestions = (arenaReplaced as ArenaDraft).questions;
  assert.equal(arenaQuestions.length, 2, 'no item is added or removed');
  assert.equal(arenaQuestions[0].id, 'q1', 'app-owned id is kept');
  assert.equal(arenaQuestions[0].prompt, 'Câu một mới?');
  assert.equal(arenaQuestions[1].id, 'q2');
  assert.equal(arenaQuestions[1].prompt, 'Câu hai ...', 'the other item is unchanged');

  // --- Matching: same rule, and a duplicate pair is rejected ----------------
  const matchingReplaced = replaceDraftItem(matchingDraft, 1, {
    id: 'zzz', left: 'Ánh sáng', right: 'Nguồn năng lượng'
  }) as MatchingDraft;
  assert.equal(matchingReplaced.pairs[0].id, 'p1');
  assert.equal(matchingReplaced.pairs[0].left, 'Ánh sáng');
  assert.equal(matchingReplaced.pairs[1].left, 'Hô hấp');
  assert.throws(
    () => replaceDraftItem(matchingDraft, 2, { id: 'zzz', left: 'Quang hợp', right: 'Khác' }),
    /trùng/i,
    'a duplicate left column must fail validation instead of being saved'
  );

  // --- Treasure: chain/structure fields stay app-owned ----------------------
  const treasureReplaced = replaceDraftItem(treasureDraft, 1, {
    id: 'invented',
    name: 'Chặng một mới',
    story: 'Bối cảnh mới.',
    taskDescription: 'Nhiệm vụ mới.',
    question: {
      prompt: 'Câu mới?',
      options: [{ id: 'x', text: 'Đúng' }, { id: 'y', text: 'Sai' }],
      correctOptionId: 'x',
      explanation: 'Vì mới.'
    },
    attempts: 9,
    points: 300,
    completionBonus: 100,
    nextStageId: 'st-does-not-exist',
    branchLabel: 'Nhãn model tự đổi',
    branchStageId: 'st-other'
  }) as TreasureDraft;
  assert.equal(treasureReplaced.stages.length, 2);
  assert.equal(treasureReplaced.stages[0].id, 'st1');
  assert.equal(treasureReplaced.stages[0].name, 'Chặng một mới');
  assert.equal(treasureReplaced.stages[0].nextStageId, 'st2', 'chain link comes from the old stage');
  assert.equal(treasureReplaced.stages[0].attempts, 2, 'attempt count comes from the config-driven old stage');
  assert.equal(treasureReplaced.stages[0].branchStageId, 'st2');
  assert.equal(treasureReplaced.stages[0].branchLabel, 'Lối tắt');
  assert.equal(treasureReplaced.stages[1].name, 'Chặng hai', 'the other stage is unchanged');

  // A regenerated final stage keeps its "ending" status.
  const endingReplaced = replaceDraftItem(treasureDraft, 2, {
    name: 'Chặng hai mới',
    story: 'Bối cảnh hai mới.',
    taskDescription: 'Nhiệm vụ hai mới.',
    question: {
      prompt: 'Câu hai mới?',
      options: [{ id: 'x', text: 'Đúng' }, { id: 'y', text: 'Sai' }],
      correctOptionId: 'x',
      explanation: 'Vì hai mới.'
    },
    attempts: 1,
    points: 100,
    completionBonus: 50,
    nextStageId: 'st1'
  }) as TreasureDraft;
  assert.equal(endingReplaced.stages[1].nextStageId, null, 'the ending stage must not gain a loop');

  // A regenerated scenario mission keeps its app-owned mission type even though
  // the model response does not echo the optional `mission` field.
  const scenarioMissionDraft: TreasureDraft = {
    ...treasureDraft,
    stages: [
      { ...treasureDraft.stages[0], mission: { type: 'scenario' } },
      treasureDraft.stages[1]
    ]
  };
  const scenarioMissionReplaced = replaceDraftItem(scenarioMissionDraft, 1, {
    name: 'Chặng tình huống mới',
    story: 'Bối cảnh mới.',
    taskDescription: 'Nhiệm vụ mới.',
    question: {
      prompt: 'Tình huống mới?',
      options: [{ id: 'x', text: 'Đúng' }, { id: 'y', text: 'Sai' }],
      correctOptionId: 'x',
      explanation: 'Vì mới.'
    },
    attempts: 1,
    points: 100,
    completionBonus: 50,
    nextStageId: null
  }) as TreasureDraft;
  assert.deepEqual(scenarioMissionReplaced.stages[0].mission, { type: 'scenario' });

  // --- Scenario: option ids + branch links are remapped, not invented -------
  const scenarioReplaced = replaceDraftItem(scenarioDraft, 1, {
    id: 'invented',
    prompt: 'Tình huống một mới?',
    options: [
      { id: 'new-a', text: 'Hành động mới an toàn', nextSituationId: 'ghost' },
      { id: 'new-b', text: 'Hành động mới sai', nextSituationId: 's1' }
    ],
    correctOptionId: 'new-a'
  }) as ScenarioDraft;
  const situation = scenarioReplaced.situations[0];
  assert.equal(situation.id, 's1');
  assert.equal(situation.options[0].id, 'a', 'option ids are remapped positionally');
  assert.equal(situation.options[1].id, 'b');
  assert.equal(situation.options[0].nextSituationId, 's2', 'an unknown branch falls back to the old link');
  assert.equal(situation.options[1].nextSituationId, null, 'a self-link falls back to the old link (none)');
  assert.equal(situation.correctOptionId, 'a', 'the correct answer follows the option, not the model id');
  assert.equal(scenarioReplaced.situations[1].prompt, 'Tình huống hai?');

  // --- Race: content replaced, id preserved ---------------------------------
  const raceReplaced = replaceDraftItem(raceDraft, 1, {
    id: 'invented',
    prompt: 'Câu đua mới?',
    options: [{ id: 'x', text: 'Đúng' }, { id: 'y', text: 'Sai' }],
    correctOptionId: 'x',
    explanation: 'Vì mới.',
    difficulty: 'khó'
  }) as RaceDraft;
  assert.equal(raceReplaced.questions[0].id, 'q1');
  assert.equal(raceReplaced.questions[0].prompt, 'Câu đua mới?');
  assert.equal(raceReplaced.teams.length, 2, 'teams are untouched');

  // --- Which positions to regenerate ---------------------------------------
  assert.deepEqual(resolveItemIndexes(arenaDraft, [2, 1, 2, 0, 99, Number.NaN]), [1, 2]);
  assert.deepEqual(resolveItemIndexes(arenaDraft, []), []);
  const quality: QualityReport = {
    gameType: 'arena',
    issues: [
      { severity: 'error', code: 'EMPTY_EXPLANATION', message: 'Câu 2 thiếu giải thích.', itemIndex: 2 },
      { severity: 'warning', code: 'DUPLICATE_PROMPT', message: 'Câu 1 trùng.', itemIndex: 1 },
      { severity: 'error', code: 'COUNT_BELOW_REQUEST', message: 'Thiếu câu.' }
    ],
    errors: 2,
    warnings: 1,
    canPublish: false,
    counts: { requested: 8, found: 2, unit: 'câu hỏi' },
    uncoveredObjectiveIds: []
  };
  assert.deepEqual(resolveItemIndexes(arenaDraft, [], quality), [1, 2], 'falls back to the quality report');
  assert.deepEqual(resolveItemIndexes(arenaDraft, [2], quality), [2], 'an explicit position wins');

  console.log('Lesson item repair tests passed');
}

run();
