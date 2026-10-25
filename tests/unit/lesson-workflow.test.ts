import assert from 'node:assert/strict';
import {
  AiRequestRegistry,
  AiTransportError,
  createCancelError
} from '../../src/services/ai-transport';
import {
  LessonWorkflowError,
  analyzeLesson,
  generateGameDraft,
  recommendGames,
  regenerateGameItem,
  runStructuredStep,
  validateRecommendationsAgainstAnalysis,
  type LessonChatClient,
  type LessonChatRequest
} from '../../src/services/lesson-workflow';
import { normalizeAnalysis } from '../../src/services/lesson-normalize';
import type { LessonAnalysis } from '../../src/shared/lesson-types';

const NOW = '2026-01-01T00:00:00.000Z';

const analysisContent = {
  subject: 'Toán',
  grade: 5,
  topic: 'Phép cộng',
  objectives: [
    { description: 'Cộng hai số có nhớ.', cognitiveLevel: 'apply' },
    { description: 'Nhận biết tính chất giao hoán.', cognitiveLevel: 'understand' }
  ],
  keyConcepts: [{ term: 'Phép cộng', explanation: 'Gộp hai số lại.' }],
  uncertainties: ['Chưa rõ phạm vi số trong bài.']
};

const validAnalysis: LessonAnalysis = normalizeAnalysis(analysisContent, {
  id: 'analysis_1',
  documentId: 'doc_1',
  createdAt: NOW,
  sourceDocumentIds: ['doc_1']
});

type ScriptedResponse = { value?: unknown; error?: unknown };

class MockClient implements LessonChatClient {
  readonly calls: LessonChatRequest[] = [];

  constructor(private readonly script: ScriptedResponse[]) {}

  async chatJson(request: LessonChatRequest): Promise<unknown> {
    this.calls.push(request);
    const step = this.script[Math.min(this.calls.length - 1, this.script.length - 1)] || { value: {} };
    if (step.error) throw step.error;
    return step.value;
  }
}

async function expectWorkflowError(code: string, run: () => Promise<unknown>): Promise<LessonWorkflowError> {
  try {
    await run();
  } catch (error) {
    assert.ok(error instanceof LessonWorkflowError, `expected LessonWorkflowError, got ${String(error)}`);
    assert.equal(error.code, code);
    return error;
  }
  assert.fail(`expected LessonWorkflowError ${code}`);
  throw new Error('unreachable');
}

async function main(): Promise<void> {
  const registry = new AiRequestRegistry();

  // --- Happy path: analyze -------------------------------------------------
  const analyzeClient = new MockClient([{ value: analysisContent }]);
  const analysis = await analyzeLesson({
    client: analyzeClient,
    registry,
    requestId: 'req-happy',
    documentId: 'doc_1',
    text: 'Nội dung bài học về phép cộng hai số.',
    subject: 'Toán',
    grade: 'Lớp 5',
    analysisId: 'analysis_1',
    now: NOW
  });
  assert.equal(analysis.id, 'analysis_1');
  assert.equal(analysis.schemaVersion, 1);
  assert.equal(analysis.documentId, 'doc_1');
  assert.deepEqual(analysis.sourceDocumentIds, ['doc_1']);
  assert.equal(analysis.objectives[0].id, 'o1');
  assert.equal(analysis.keyConcepts[0].id, 'k1');
  assert.equal(analyzeClient.calls.length, 1);
  assert.equal(analyzeClient.calls[0].messages[0].role, 'system');
  assert.match(analyzeClient.calls[0].messages[1].content, /Phân tích giáo án/);
  assert.equal(registry.size, 0, 'requestId is released after the step');

  // --- Repair after invalid JSON from the provider -------------------------
  const repairJsonClient = new MockClient([
    { error: new AiTransportError('AI_INVALID_JSON', 'AI trả về JSON không hợp lệ.', { rawContent: 'not json' }) },
    { value: analysisContent }
  ]);
  const repaired = await analyzeLesson({
    client: repairJsonClient,
    registry,
    requestId: 'req-repair-json',
    documentId: 'doc_1',
    text: 'Nội dung.',
    analysisId: 'analysis_repaired',
    now: NOW
  });
  assert.equal(repaired.id, 'analysis_repaired');
  assert.equal(repairJsonClient.calls.length, 2, 'invalid JSON triggers exactly one repair');
  const repairMessages = repairJsonClient.calls[1].messages;
  assert.equal(repairMessages.length, 4);
  assert.equal(repairMessages[2].role, 'assistant');
  assert.equal(repairMessages[2].content, 'not json');
  assert.match(repairMessages[3].content, /JSON/);

  // --- Repair after valid JSON but wrong shape -----------------------------
  const repairShapeClient = new MockClient([
    { value: { subject: null, grade: null, topic: 'Thiếu mục tiêu', objectives: [], keyConcepts: [{ term: 'a', explanation: 'b' }], uncertainties: [] } },
    { value: analysisContent }
  ]);
  await analyzeLesson({
    client: repairShapeClient,
    registry,
    requestId: 'req-repair-shape',
    documentId: 'doc_1',
    text: 'Nội dung.',
    analysisId: 'analysis_shape',
    now: NOW
  });
  assert.equal(repairShapeClient.calls.length, 2);
  assert.equal(repairShapeClient.calls[1].messages[2].role, 'assistant', 'raw JSON is echoed back for repair');

  // --- Give up after the repair attempt ------------------------------------
  const alwaysBroken = new MockClient([
    { value: { subject: null, grade: null, topic: 'x', objectives: [], keyConcepts: [{ term: 'a', explanation: 'b' }], uncertainties: [] } }
  ]);
  await expectWorkflowError('AI_OUTPUT_INVALID', () => analyzeLesson({
    client: alwaysBroken,
    registry,
    requestId: 'req-give-up',
    documentId: 'doc_1',
    text: 'Nội dung.',
    analysisId: 'analysis_bad',
    now: NOW
  }));
  assert.equal(alwaysBroken.calls.length, 2, 'only one repair attempt');

  // --- Timeout is not retried ---------------------------------------------
  const timeoutClient = new MockClient([{ error: new AiTransportError('AI_TIMEOUT', 'AI quá thời gian chờ.') }]);
  await expectWorkflowError('AI_TIMEOUT', () => analyzeLesson({
    client: timeoutClient, registry, requestId: 'req-timeout', documentId: 'doc_1', text: 'x', analysisId: 'a', now: NOW
  }));
  assert.equal(timeoutClient.calls.length, 1);
  assert.equal(registry.size, 0);

  // --- Cancel --------------------------------------------------------------
  const cancelClient: LessonChatClient = {
    async chatJson(request) {
      registry.cancel(request.requestId);
      throw createCancelError();
    }
  };
  await expectWorkflowError('AI_CANCELLED', () => analyzeLesson({
    client: cancelClient, registry, requestId: 'req-cancel', documentId: 'doc_1', text: 'x', analysisId: 'a', now: NOW
  }));
  assert.equal(registry.size, 0);

  // --- Model not running ---------------------------------------------------
  const notRunningClient = new MockClient([{ error: new AiTransportError('AI_NOT_RUNNING', 'AI local chưa chạy.') }]);
  const notRunningError = await expectWorkflowError('AI_NOT_RUNNING', () => analyzeLesson({
    client: notRunningClient, registry, requestId: 'req-offline', documentId: 'doc_1', text: 'x', analysisId: 'a', now: NOW
  }));
  assert.equal(notRunningClient.calls.length, 1);
  // The `[CODE]` marker must survive in `message` so the renderer (which only
  // receives `message` over IPC) can map failures to friendly text.
  assert.ok(notRunningError.message.startsWith('[AI_NOT_RUNNING] '), `unexpected message: ${notRunningError.message}`);

  // --- Recommendations -----------------------------------------------------
  const recommendationContent = {
    recommendations: [
      { gameType: 'arena', title: 'Đấu trường', description: 'Trả lời nhanh.', reason: 'Luyện phản xạ.', learningObjectiveIds: ['o1'], suggestedDurationMinutes: 15 },
      { gameType: 'matching', title: 'Ghép cặp', description: 'Ghép khái niệm.', reason: 'Củng cố khái niệm.', learningObjectiveIds: ['o2'], suggestedDurationMinutes: 10 }
    ]
  };
  const recommendClient = new MockClient([{ value: recommendationContent }]);
  const recommendations = await recommendGames({
    client: recommendClient,
    registry,
    requestId: 'req-recommend',
    analysis: validAnalysis,
    now: NOW
  });
  assert.equal(recommendations.length, 2);
  assert.equal(recommendations[0].id, 'rec1');
  assert.equal(recommendations[0].analysisId, 'analysis_1');
  assert.equal(recommendations[0].schemaVersion, 1);
  assert.equal(recommendations[1].gameType, 'matching');

  const duplicateType = new MockClient([{
    value: { recommendations: [recommendationContent.recommendations[0], recommendationContent.recommendations[0]] }
  }]);
  await expectWorkflowError('AI_OUTPUT_INVALID', () => recommendGames({
    client: duplicateType, registry, requestId: 'req-dup', analysis: validAnalysis, now: NOW
  }));
  assert.equal(duplicateType.calls.length, 2);

  // Recommendations pointing at a non-existent objective are rejected.
  const unknownObjective = new MockClient([{
    value: {
      recommendations: [
        { ...recommendationContent.recommendations[0], learningObjectiveIds: ['o1', 'o99'] }
      ]
    }
  }]);
  await expectWorkflowError('AI_OUTPUT_INVALID', () => recommendGames({
    client: unknownObjective, registry, requestId: 'req-unknown-obj', analysis: validAnalysis, now: NOW
  }));
  assert.equal(unknownObjective.calls.length, 2, 'objective link failure triggers the repair attempt');

  // Direct cross-check helper: valid links pass, unknown links throw.
  const validRecommendations = await recommendGames({
    client: new MockClient([{ value: recommendationContent }]),
    registry,
    requestId: 'req-cross-ok',
    analysis: validAnalysis,
    now: NOW
  });
  assert.equal(validateRecommendationsAgainstAnalysis(validRecommendations, validAnalysis).length, 2);
  assert.throws(
    () => validateRecommendationsAgainstAnalysis(
      [{ ...validRecommendations[0], learningObjectiveIds: ['missing'] }],
      validAnalysis
    ),
    /không tồn tại/
  );

  // Invalid cognitive level in the analysis is rejected and repaired.
  const badCognitive = new MockClient([
    { value: { ...analysisContent, objectives: [{ description: 'x', cognitiveLevel: 'memorize' }] } },
    { value: analysisContent }
  ]);
  const repairedAnalysis = await analyzeLesson({
    client: badCognitive, registry, requestId: 'req-cognitive', documentId: 'doc_1', text: 'Nội dung.', analysisId: 'analysis_cog', now: NOW
  });
  assert.equal(repairedAnalysis.objectives[0].cognitiveLevel, 'apply');
  assert.equal(badCognitive.calls.length, 2);

  // --- Generation: normalizes missing ids ----------------------------------
  const raceContent = {
    trackLength: 10,
    maxRounds: 5,
    stepByDifficulty: true,
    luckEnabled: false,
    teams: [{ name: 'Đội Mặt Trời', icon: '🚀' }, { name: 'Đội Mặt Trăng' }],
    cells: [{ cell: 5, type: 'boost', label: 'Tăng tốc' }],
    questions: [{
      prompt: 'Nước sôi ở bao nhiêu độ?',
      options: [{ text: '90' }, { text: '100' }, { text: '110' }],
      correctOptionId: 'b',
      explanation: 'Ở áp suất tiêu chuẩn nước sôi ở 100°C.',
      difficulty: 'dễ'
    }]
  };
  const raceConfig = {
    gameType: 'race' as const, title: 'Đường đua', subject: 'Khoa học', grade: 'Lớp 4', topic: 'Nhiệt độ',
    audience: 'child' as const, durationMinutes: 15, difficulty: 'dễ' as const, playMode: 'team' as const,
    style: 'competition' as const, focusObjectiveIds: [], generationMode: 'fast' as const,
    trackLength: 10, maxRounds: 5, teamCount: 2, stepByDifficulty: true, luckEnabled: false
  };
  const raceClient = new MockClient([{ value: raceContent }]);
  const raceDraft = await generateGameDraft({
    client: raceClient, registry, requestId: 'req-race', gameType: 'race', config: raceConfig, analysis: validAnalysis
  });
  assert.equal(raceDraft.gameType, 'race');
  assert.equal(raceDraft.schemaVersion, 1);
  if (raceDraft.gameType !== 'race') throw new Error('expected race draft');
  assert.equal(raceDraft.teams[0].id, 't1');
  assert.equal(raceDraft.teams[1].id, 't2');
  assert.equal(raceDraft.questions[0].id, 'q1');
  assert.equal(raceDraft.questions[0].options[0].id, 'a');
  assert.equal(raceDraft.questions[0].correctOptionId, 'b');

  // --- Generation: repair when the answer key is inconsistent --------------
  const invalidArena = {
    gameType: 'arena',
    questions: [{
      id: 'q1', type: 'true-false', prompt: 'Nước sôi ở 100°C?',
      options: [{ id: 'a', text: 'Đúng' }, { id: 'b', text: 'Sai' }],
      correctOptionId: 'z', explanation: 'Đúng.', difficulty: 'dễ', points: 100
    }]
  };
  const validArena = { ...invalidArena, questions: [{ ...invalidArena.questions[0], correctOptionId: 'a' }] };
  const arenaConfig = {
    gameType: 'arena' as const, title: 'Đấu trường', subject: 'Khoa học', grade: 'Lớp 4', topic: 'Nhiệt độ',
    audience: 'child' as const, durationMinutes: 10, difficulty: 'dễ' as const, playMode: 'individual' as const,
    style: 'fun' as const, focusObjectiveIds: [], generationMode: 'fast' as const,
    questionCount: 1, scoringMode: 'basic' as const, pointsPerCorrect: 100, timeBonus: 10
  };
  const arenaClient = new MockClient([{ value: invalidArena }, { value: validArena }]);
  const arenaDraft = await generateGameDraft({
    client: arenaClient, registry, requestId: 'req-arena', gameType: 'arena', config: arenaConfig, analysis: validAnalysis
  });
  assert.equal(arenaClient.calls.length, 2);
  assert.equal(arenaDraft.gameType, 'arena');
  if (arenaDraft.gameType !== 'arena') throw new Error('expected arena draft');
  const firstArenaQuestion = arenaDraft.questions[0];
  if (firstArenaQuestion.type === 'multiple-choice' || firstArenaQuestion.type === 'true-false') {
    assert.equal(firstArenaQuestion.correctOptionId, 'a');
  } else {
    throw new Error(`expected a choice question, got ${firstArenaQuestion.type}`);
  }

  // --- O7: progress hook sees the first attempt and the repair ------------
  const attempts: number[] = [];
  const attemptClient = new MockClient([{ value: invalidArena }, { value: validArena }]);
  await generateGameDraft({
    client: attemptClient,
    registry,
    requestId: 'req-arena-attempts',
    gameType: 'arena',
    config: arenaConfig,
    analysis: validAnalysis,
    onAttempt: attempt => attempts.push(attempt)
  });
  assert.deepEqual(attempts, [1, 2], 'onAttempt reports the initial call and the repair');

  // --- O9: a valid but short draft is retried once, then kept honest ------
  const shortConfig = { ...arenaConfig, questionCount: 2 };
  const shortQuestion = (id: string, prompt: string) => ({
    id, type: 'true-false' as const, prompt,
    options: [{ id: 'a', text: 'Đúng' }, { id: 'b', text: 'Sai' }],
    correctOptionId: 'a', explanation: 'Đúng theo bài.', difficulty: 'dễ', points: 100
  });
  const shortDraft = { gameType: 'arena', questions: [shortQuestion('q1', 'Nước sôi ở 100°C?')] };
  const fullDraft = {
    gameType: 'arena',
    questions: [
      shortQuestion('q1', 'Nước sôi ở 100°C?'),
      shortQuestion('q2', 'Nước đóng băng ở 0°C?')
    ]
  };
  const shortfallClient = new MockClient([{ value: shortDraft }, { value: fullDraft }]);
  const shortfallAttempts: number[] = [];
  // O10: the diagnostics hook sees the reason and whether a retry follows.
  const shortfallEvents: { reason: string; attempt: number; retrying: boolean }[] = [];
  const completedDraft = await generateGameDraft({
    client: shortfallClient, registry, requestId: 'req-shortfall', gameType: 'arena',
    config: shortConfig, analysis: validAnalysis,
    onAttempt: attempt => shortfallAttempts.push(attempt),
    onIncomplete: info => shortfallEvents.push(info)
  });
  assert.equal(shortfallClient.calls.length, 2, 'a short but valid draft triggers exactly one retry');
  if (completedDraft.gameType !== 'arena') throw new Error('expected arena draft');
  assert.equal(completedDraft.questions.length, 2, 'the retried answer is used');
  const followUp = shortfallClient.calls[1].messages;
  assert.equal(followUp[followUp.length - 2].role, 'assistant', 'the model sees its own short answer');
  assert.match(String(followUp[followUp.length - 1].content), /1\/2 câu hỏi/, 'the follow-up names the shortfall');
  assert.deepEqual(shortfallAttempts, [1, 2]);
  assert.deepEqual(shortfallEvents, [{ reason: 'Mới có 1/2 câu hỏi', attempt: 1, retrying: true }]);

  // Both attempts short: return the fullest answer and never invent items.
  const stillShortClient = new MockClient([{ value: shortDraft }, { value: shortDraft }]);
  const stillShortEvents: { reason: string; attempt: number; retrying: boolean }[] = [];
  const stillShort = await generateGameDraft({
    client: stillShortClient, registry, requestId: 'req-shortfall-2', gameType: 'arena',
    config: shortConfig, analysis: validAnalysis,
    onIncomplete: info => stillShortEvents.push(info)
  });
  assert.equal(stillShortClient.calls.length, 2, 'one retry, then stop');
  if (stillShort.gameType !== 'arena') throw new Error('expected arena draft');
  assert.equal(stillShort.questions.length, 1, 'a draft that stays short is returned as-is');
  assert.deepEqual(stillShortEvents.map(event => event.retrying), [true, false], 'the second short answer reports no further retry');

  // A complete draft is never retried.
  const completeClient = new MockClient([{ value: fullDraft }]);
  await generateGameDraft({
    client: completeClient, registry, requestId: 'req-complete', gameType: 'arena',
    config: shortConfig, analysis: validAnalysis
  });
  assert.equal(completeClient.calls.length, 1, 'complete drafts cost one model call');

  // --- O5: single-item regeneration ---------------------------------------
  const currentQuestion = {
    id: 'q1', type: 'multiple-choice', prompt: 'Câu cũ?',
    options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }],
    correctOptionId: 'a', explanation: 'Cũ.', difficulty: 'dễ', points: 100
  };
  const regeneratedQuestion = {
    id: 'q9', type: 'multiple-choice', prompt: 'Câu mới?',
    options: [{ id: 'x', text: 'X' }, { id: 'y', text: 'Y' }],
    correctOptionId: 'x', explanation: 'Mới.', difficulty: 'trung bình', points: 100
  };
  const itemClient = new MockClient([{ value: { gameType: 'arena', questions: [regeneratedQuestion] } }]);
  const regenerated = await regenerateGameItem({
    client: itemClient,
    registry,
    requestId: 'req-item',
    gameType: 'arena',
    config: arenaConfig,
    analysis: validAnalysis,
    position: 2,
    total: 5,
    itemLabel: 'Câu hỏi 2',
    currentItem: currentQuestion,
    issues: ['Câu hỏi 2 thiếu giải thích.'],
    sourceExcerpt: 'Trích tài liệu.'
  });
  assert.deepEqual(regenerated, regeneratedQuestion);
  assert.equal(itemClient.calls.length, 1);
  assert.equal(itemClient.calls[0].responseSchema?.name, 'game_item_arena');
  const itemPrompt = itemClient.calls[0].messages[1].content;
  assert.match(itemPrompt, /Viết lại DUY NHẤT một mục/);
  assert.match(itemPrompt, /Câu hỏi 2 \(mục 2\/5\)/);
  assert.match(itemPrompt, /ĐÚNG MỘT phần tử/);
  assert.match(itemPrompt, /Câu hỏi 2 thiếu giải thích/);
  assert.ok(itemPrompt.includes('Câu cũ?'), 'the current item is shown to the model');
  assert.equal(registry.size, 0);

  // A bare item (no one-element wrapper) is accepted: small models drop it.
  const bareClient = new MockClient([{ value: regeneratedQuestion }]);
  const bareItem = await regenerateGameItem({
    client: bareClient, registry, requestId: 'req-item-bare', gameType: 'arena',
    config: arenaConfig, analysis: validAnalysis, position: 1, total: 2,
    itemLabel: 'Câu hỏi 1', currentItem: currentQuestion
  });
  assert.deepEqual(bareItem, regeneratedQuestion);

  // Wrong cardinality triggers exactly one repair, then succeeds.
  const twoItemsClient = new MockClient([
    { value: { gameType: 'arena', questions: [regeneratedQuestion, currentQuestion] } },
    { value: { gameType: 'arena', questions: [regeneratedQuestion] } }
  ]);
  const repairedItem = await regenerateGameItem({
    client: twoItemsClient, registry, requestId: 'req-item-repair', gameType: 'arena',
    config: arenaConfig, analysis: validAnalysis, position: 1, total: 2,
    itemLabel: 'Câu hỏi 1', currentItem: currentQuestion
  });
  assert.deepEqual(repairedItem, regeneratedQuestion);
  assert.equal(twoItemsClient.calls.length, 2);
  assert.equal(twoItemsClient.calls[1].messages[2].role, 'assistant');
  assert.match(twoItemsClient.calls[1].messages[3].content, /đúng MỘT phần tử/);

  // Missing required fields fail after the repair attempt (never silently saved).
  const badItemClient = new MockClient([{ value: { gameType: 'arena', questions: [{ prompt: 'Thiếu hết.' }] } }]);
  await expectWorkflowError('AI_OUTPUT_INVALID', () => regenerateGameItem({
    client: badItemClient, registry, requestId: 'req-item-bad', gameType: 'arena',
    config: arenaConfig, analysis: validAnalysis, position: 1, total: 2,
    itemLabel: 'Câu hỏi 1', currentItem: currentQuestion
  }));
  assert.equal(badItemClient.calls.length, 2);

  // --- Duplicate requestId is rejected before calling the model ------------
  const held = registry.begin('req-held');
  const shouldNotRun = new MockClient([{ value: analysisContent }]);
  await expectWorkflowError('AI_CONFIG', () => runStructuredStep({
    client: shouldNotRun,
    registry,
    requestId: 'req-held',
    messages: [{ role: 'user', content: 'x' }],
    maxTokens: 16,
    validate: value => value
  }));
  assert.equal(shouldNotRun.calls.length, 0);
  held.done();
  assert.equal(registry.size, 0);

  console.log('Lesson workflow tests passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
