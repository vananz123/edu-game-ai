import assert from 'node:assert/strict';
import {
  LessonContractError,
  gameDraftSchema,
  gameConfigSchema,
  lessonAnalysisContentSchema,
  parseGameConfig,
  parseGameDraft,
  parseLessonAnalysisContent,
  parseRecommendationsContent,
  recommendationsContentSchema
} from '../src/services/lesson-contracts';
import type { ArenaDraft, GameConfig, MatchingDraft, RaceDraft, ScenarioDraft, TreasureDraft } from '../src/shared/lesson-types';

const arenaDraft: ArenaDraft = {
  gameType: 'arena',
  schemaVersion: 1,
  questions: [
    {
      id: 'q1',
      type: 'multiple-choice',
      prompt: '2 + 3 bằng bao nhiêu?',
      options: [{ id: 'a', text: '5' }, { id: 'b', text: '6' }],
      correctOptionId: 'a',
      explanation: '2 + 3 = 5.',
      difficulty: 'dễ',
      points: 100
    },
    {
      id: 'q2',
      type: 'true-false',
      prompt: 'Nước sôi ở 100°C ở áp suất chuẩn.',
      options: [{ id: 'a', text: 'Đúng' }, { id: 'b', text: 'Sai' }],
      correctOptionId: 'a',
      explanation: 'Đúng ở áp suất 1 atm.',
      difficulty: 'trung bình',
      points: 200
    },
    {
      id: 'q3',
      type: 'fill-in-blank',
      prompt: 'Thủ đô của Việt Nam là ...',
      correctAnswer: 'Hà Nội',
      alternateAnswers: ['Ha Noi'],
      explanation: 'Hà Nội là thủ đô.',
      difficulty: 'khó',
      points: 300
    }
  ]
};

const scenarioDraft: ScenarioDraft = {
  gameType: 'scenario',
  schemaVersion: 1,
  situations: [
    {
      id: 's1',
      context: 'Sân trường',
      prompt: 'Em thấy bạn bị ngã.',
      options: [
        { id: 'a', text: 'Đỡ bạn dậy và gọi thầy cô', nextSituationId: 's2', score: { safety: 60, reasoning: 25, harmReduction: 15 } },
        { id: 'b', text: 'Đứng nhìn', nextSituationId: null, score: { safety: 0, reasoning: 0, harmReduction: 0 } }
      ],
      correctOptionId: 'a',
      discussionPrompt: 'Vì sao cần giúp bạn?'
    },
    {
      id: 's2',
      prompt: 'Bạn bị đau chân.',
      options: [
        { id: 'a', text: 'Đưa bạn tới phòng y tế', nextSituationId: null },
        { id: 'b', text: 'Để bạn tự đi', nextSituationId: null }
      ]
    }
  ]
};

const matchingDraft: MatchingDraft = {
  gameType: 'matching',
  schemaVersion: 1,
  mode: 'columns',
  pairs: [
    { id: 'p1', left: 'Quang hợp', right: 'Tổng hợp chất hữu cơ nhờ ánh sáng' },
    { id: 'p2', left: 'Hô hấp', right: 'Giải phóng năng lượng' }
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
  intro: 'Hãy tìm kho báu.',
  journeyBonus: 300,
  hiddenItemBonus: 50,
  stages: [
    {
      id: 'st1',
      name: 'Cổng rừng',
      story: 'Một cánh cổng gỗ.',
      taskDescription: 'Trả lời để mở cổng.',
      question: {
        prompt: 'Cây xanh cần gì để quang hợp?',
        options: [{ id: 'a', text: 'Ánh sáng' }, { id: 'b', text: 'Bóng tối' }],
        correctOptionId: 'a',
        explanation: 'Quang hợp cần ánh sáng.',
        hint: 'Nghĩ về mặt trời'
      },
      attempts: 0,
      points: 100,
      completionBonus: 200,
      nextStageId: 'st2'
    },
    {
      id: 'st2',
      name: 'Hang bí mật',
      story: 'Trong hang có kho báu.',
      taskDescription: 'Giải câu đố cuối.',
      question: {
        prompt: 'Nước ở thể nào khi đóng băng?',
        options: [{ id: 'a', text: 'Rắn' }, { id: 'b', text: 'Khí' }],
        correctOptionId: 'a',
        explanation: 'Nước đóng băng thành thể rắn.',
        hint: 'Rất lạnh'
      },
      attempts: 2,
      points: 200,
      completionBonus: 300,
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
    { id: 't1', name: 'Đội đỏ', icon: '🔴' },
    { id: 't2', name: 'Đội xanh' }
  ],
  cells: [{ cell: 6, type: 'boost', label: 'Tăng tốc' }],
  questions: [
    {
      id: 'rq1',
      prompt: 'Một tuần có bao nhiêu ngày?',
      options: [{ id: 'a', text: '7' }, { id: 'b', text: '8' }],
      correctOptionId: 'a',
      explanation: 'Một tuần có 7 ngày.',
      difficulty: 'dễ'
    }
  ]
};

const validConfigs: GameConfig[] = [
  {
    gameType: 'arena', title: 'Đấu trường', subject: 'Toán', grade: 'Lớp 5', topic: 'Cộng trừ',
    audience: 'child', durationMinutes: 15, difficulty: 'trung bình', playMode: 'individual',
    style: 'fun', focusObjectiveIds: [], generationMode: 'fast',
    questionCount: 10, scoringMode: 'basic', pointsPerCorrect: 100, timeBonus: 10
  },
  {
    gameType: 'scenario', title: 'Tình huống', subject: 'Kỹ năng sống', grade: 'Lớp 6', topic: 'An toàn',
    audience: 'teen', durationMinutes: 20, difficulty: 'trung bình', playMode: 'team',
    style: 'realistic', focusObjectiveIds: [], generationMode: 'deep',
    situationCount: 5, scoringMode: 'quality'
  },
  {
    gameType: 'matching', title: 'Ghép cặp', subject: 'Sinh học', grade: 'Lớp 7', topic: 'Tế bào',
    audience: 'teen', durationMinutes: 10, difficulty: 'dễ', playMode: 'individual',
    style: 'minimal', focusObjectiveIds: [], generationMode: 'fast',
    pairCount: 6, matchingMode: 'columns', wrongPenalty: 0
  },
  {
    gameType: 'treasure', title: 'Kho báu', subject: 'Tự nhiên', grade: 'Lớp 3', topic: 'Nước',
    audience: 'child', durationMinutes: 25, difficulty: 'khó', playMode: 'team',
    style: 'exploration', focusObjectiveIds: [], generationMode: 'fast',
    stageCount: 4, attemptsPerStage: 0, journeyBonus: 300, hiddenItemBonus: 50
  },
  {
    gameType: 'race', title: 'Đường đua', subject: 'Tiếng Anh', grade: 'Lớp 8', topic: 'Từ vựng',
    audience: 'teen', durationMinutes: 30, difficulty: 'trung bình', playMode: 'team',
    style: 'competition', focusObjectiveIds: [], generationMode: 'deep',
    trackLength: 20, maxRounds: 10, teamCount: 4, stepByDifficulty: true, luckEnabled: false
  }
];

const typedIssue = (error: unknown, code: string): void => {
  assert.ok(error instanceof LessonContractError, `expected LessonContractError, got ${String(error)}`);
  assert.equal((error as LessonContractError).code, code);
};

// --- Valid drafts parse into the union -------------------------------------
for (const draft of [arenaDraft, scenarioDraft, matchingDraft, treasureDraft, raceDraft]) {
  const parsed = parseGameDraft(JSON.parse(JSON.stringify(draft)));
  assert.equal(parsed.gameType, draft.gameType);
}
assert.equal(gameDraftSchema.safeParse(arenaDraft).success, true);

// True/false questions are canonicalised only by their explicit type. The
// correct choice is preserved; arbitrary text mentioning "đúng/sai" is not
// reclassified.
const canonicalTrueFalse = parseGameDraft({
  ...arenaDraft,
  questions: [{
    ...arenaDraft.questions[1],
    options: [{ id: 'a', text: 'đúng.' }, { id: 'b', text: 'SAI' }],
    correctOptionId: 'b'
  }]
}) as ArenaDraft;
const tfQuestion = canonicalTrueFalse.questions[0] as unknown as { options: Array<{ id: string; text: string }>; correctOptionId: string };
assert.deepEqual(tfQuestion.options, [{ id: 'a', text: 'Đúng' }, { id: 'b', text: 'Sai' }]);
assert.equal(tfQuestion.correctOptionId, 'b');
const notTrueFalse = parseGameDraft({
  ...arenaDraft,
  questions: [{ ...arenaDraft.questions[0], prompt: 'Câu nào dùng từ đúng hoặc sai?' }]
}) as ArenaDraft;
assert.equal(notTrueFalse.questions[0].type, 'multiple-choice');
assert.throws(() => parseGameDraft({
  ...arenaDraft,
  questions: [{
    ...arenaDraft.questions[1],
    options: [{ id: 'a', text: 'Đúng' }, { id: 'b', text: 'Sai' }, { id: 'c', text: 'Không rõ' }]
  }]
}), /đúng\/sai phải có đúng hai phương án/i);

const variantTreasureDraft: TreasureDraft = {
  ...treasureDraft,
  stages: [
    {
      ...treasureDraft.stages[0],
      mission: {
        type: 'classification',
        groups: [{ id: 'g1', name: 'Thực vật' }, { id: 'g2', name: 'Động vật' }],
        items: [{ id: 'i1', text: 'Có diệp lục', groupId: 'g1' }, { id: 'i2', text: 'Có hệ thần kinh', groupId: 'g2' }]
      },
      question: {
        prompt: 'Phân loại các đặc điểm.',
        options: [],
        correctOptionId: '',
        explanation: 'Mỗi đặc điểm thuộc một nhóm.',
        hint: 'Đọc tên nhóm.'
      }
    },
    {
      ...treasureDraft.stages[1],
      mission: { type: 'decode', answer: 'quang hợp' }
    }
  ]
};
const parsedVariant = parseGameDraft(JSON.parse(JSON.stringify(variantTreasureDraft)));
assert.equal(parsedVariant.gameType, 'treasure');
assert.equal(parsedVariant.gameType === 'treasure' ? parsedVariant.stages[0].mission?.type : '', 'classification');
assert.equal(parsedVariant.gameType === 'treasure' ? parsedVariant.stages[1].mission?.type : '', 'decode');

// --- Invalid drafts are rejected -------------------------------------------
try {
  parseGameDraft({ ...arenaDraft, questions: [{ ...arenaDraft.questions[0] }, { ...arenaDraft.questions[0] }] });
  assert.fail('duplicate question ids should fail');
} catch (error) {
  typedIssue(error, 'DRAFT_INVALID');
}
try {
  parseGameDraft({
    ...arenaDraft,
    questions: [{ ...arenaDraft.questions[0], correctOptionId: 'z' }]
  });
  assert.fail('correctOptionId outside options should fail');
} catch (error) {
  typedIssue(error, 'DRAFT_INVALID');
}
try {
  parseGameDraft({
    ...scenarioDraft,
    situations: [{ ...scenarioDraft.situations[0], options: [
      { id: 'a', text: 'A', nextSituationId: 'missing' },
      { id: 'b', text: 'B' }
    ] }]
  });
  assert.fail('dangling scenario branch should fail');
} catch (error) {
  typedIssue(error, 'DRAFT_INVALID');
}
try {
  parseGameDraft({
    ...matchingDraft,
    pairs: [
      { id: 'p1', left: 'A', right: 'Giống nhau' },
      { id: 'p2', left: 'B', right: 'giống nhau' }
    ]
  });
  assert.fail('duplicate right column should fail');
} catch (error) {
  typedIssue(error, 'DRAFT_INVALID');
}
try {
  parseGameDraft({
    ...treasureDraft,
    stages: [
      { ...treasureDraft.stages[0], nextStageId: 'st2' },
      { ...treasureDraft.stages[1], nextStageId: 'st1' }
    ]
  });
  assert.fail('treasure loop without ending should fail');
} catch (error) {
  typedIssue(error, 'DRAFT_INVALID');
}
try {
  parseGameDraft({
    ...variantTreasureDraft,
    stages: [
      {
        ...variantTreasureDraft.stages[0],
        mission: {
          type: 'classification',
          groups: [{ id: 'g1', name: 'Nhóm 1' }, { id: 'g2', name: 'Nhóm 2' }],
          items: [{ id: 'i1', text: 'Mục 1', groupId: 'missing' }, { id: 'i2', text: 'Mục 2', groupId: 'g2' }]
        }
      },
      variantTreasureDraft.stages[1]
    ]
  });
  assert.fail('classification item pointing at a missing group should fail');
} catch (error) {
  typedIssue(error, 'DRAFT_INVALID');
}
try {
  parseGameDraft({ ...raceDraft, cells: [{ cell: 99, type: 'boost', label: 'Ngoài đường đua' }] });
  assert.fail('cell outside track should fail');
} catch (error) {
  typedIssue(error, 'DRAFT_INVALID');
}
try {
  parseGameDraft({ ...arenaDraft, schemaVersion: 2 });
  assert.fail('unknown schema version should fail');
} catch (error) {
  typedIssue(error, 'DRAFT_INVALID');
}
try {
  parseGameDraft({ gameType: 'unknown', schemaVersion: 1, questions: [] });
  assert.fail('unknown game type should fail');
} catch (error) {
  typedIssue(error, 'DRAFT_INVALID');
}

// --- Config schemas --------------------------------------------------------
for (const config of validConfigs) {
  const parsed = parseGameConfig(JSON.parse(JSON.stringify(config)));
  assert.equal(parsed.gameType, config.gameType);
}
try {
  parseGameConfig({ ...validConfigs[0], questionCount: 0 });
  assert.fail('zero question count should fail');
} catch (error) {
  typedIssue(error, 'CONFIG_INVALID');
}
try {
  parseGameConfig({ ...validConfigs[4], teamCount: 1 });
  assert.fail('one race team should fail');
} catch (error) {
  typedIssue(error, 'CONFIG_INVALID');
}
assert.equal(gameConfigSchema.safeParse(validConfigs[2]).success, true);

// --- Lesson analysis + recommendations -------------------------------------
const analysisContent = {
  subject: 'Toán',
  grade: 5,
  topic: 'Phép cộng phân số',
  objectives: [
    { description: 'Cộng hai phân số cùng mẫu.', cognitiveLevel: 'apply' as const, sourceExcerpt: 'Cộng hai phân số cùng mẫu...' }
  ],
  keyConcepts: [
    { term: 'Phân số', explanation: 'Biểu diễn phần của một tổng thể.', sourceExcerpt: 'Phân số gồm tử số và mẫu số.' }
  ],
  uncertainties: []
};
const parsedAnalysis = parseLessonAnalysisContent(analysisContent);
assert.equal(parsedAnalysis.objectives[0].cognitiveLevel, 'apply');
assert.equal(lessonAnalysisContentSchema.safeParse(analysisContent).success, true);
try {
  parseLessonAnalysisContent({ ...analysisContent, objectives: [{ description: 'X', cognitiveLevel: 'ghi nhớ' }] });
  assert.fail('invalid cognitive level should fail');
} catch (error) {
  typedIssue(error, 'ANALYSIS_INVALID');
}

const recommendations = parseRecommendationsContent({
  recommendations: [
    {
      gameType: 'arena',
      title: 'Đấu trường phân số',
      description: 'Trả lời nhanh các câu hỏi cộng phân số.',
      reason: 'Phù hợp để luyện phản xạ tính toán.',
      learningObjectiveIds: ['o1'],
      suggestedDurationMinutes: 15,
      suggestedQuestionCount: 10
    },
    {
      gameType: 'matching',
      title: 'Ghép phân số',
      description: 'Ghép phép tính với kết quả.',
      reason: 'Giúp nhận diện kết quả đúng.',
      learningObjectiveIds: ['o1'],
      suggestedDurationMinutes: 10
    }
  ]
});
assert.equal(recommendations.length, 2);
assert.equal(recommendationsContentSchema.safeParse({ recommendations }).success, true);
try {
  parseRecommendationsContent({
    recommendations: [recommendations[0], { ...recommendations[0], title: 'Trùng thể loại' }]
  });
  assert.fail('duplicate game type should fail');
} catch (error) {
  typedIssue(error, 'RECOMMENDATION_INVALID');
}
try {
  parseRecommendationsContent({ recommendations: [] });
  assert.fail('empty recommendations should fail');
} catch (error) {
  typedIssue(error, 'RECOMMENDATION_INVALID');
}

console.log('Lesson contracts tests passed');
