/**
 * Bước 5–6 của luồng giáo án trên vỏ Tauri: những op chạy trong V8.
 *
 * `src-tauri/src/embedded/lesson-ops.ts` giữ nguyên luật của Electron nhưng thay
 * HTTP bằng op `__eg_http` và SHA-256 bằng shim của `template.js`. Test này gọi
 * thẳng module TypeScript ấy, cài hai op đó bằng tay, rồi kiểm:
 *
 *   - các op tất định (chuyển đổi, chất lượng, minh hoạ, khoá cache);
 *   - cache hit chạy lại adapter thay vì tin ảnh chụp đã lưu;
 *   - nhánh câu hỏi giáo viên soạn sẵn không gọi model;
 *   - tạo mới / tạo lại một mục chỉ qua một "máy chủ" loopback giả, và không
 *     bao giờ chạy mã do model sinh ra.
 *
 * Không có mạng thật, không có khoá API, không có dữ liệu học sinh thật.
 */
import assert from 'node:assert/strict';
import type { GameConfig, GameDraft, GameProject } from '../../src/shared/lesson-types';
import {
  chat,
  convert,
  generate,
  generationCache,
  generationKey,
  generationOffline,
  patchAssets,
  quality,
  regenerate
} from '../../src-tauri/src/embedded/lesson-ops';

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

const arenaConfig: GameConfig = {
  gameType: 'arena',
  title: 'Trò chơi thử nghiệm',
  subject: 'Toán',
  grade: 'Lớp 5',
  topic: 'Kiến thức chung',
  audience: 'child',
  durationMinutes: 15,
  difficulty: 'trung bình',
  playMode: 'individual',
  style: 'fun',
  focusObjectiveIds: [],
  generationMode: 'fast',
  questionCount: 3,
  scoringMode: 'basic',
  pointsPerCorrect: 100,
  timeBonus: 10
};

const raceConfig: GameConfig = {
  ...arenaConfig,
  gameType: 'race',
  trackLength: 12,
  maxRounds: 6,
  teamCount: 2,
  stepByDifficulty: true,
  luckEnabled: true
};

const analysis = {
  id: 'analysis_test',
  schemaVersion: 1,
  documentId: 'doc-1',
  createdAt: ISO,
  subject: 'Toán',
  grade: 5,
  topic: 'Phép cộng và nước',
  objectives: [
    { id: 'o1', description: 'Cộng đúng trong phạm vi 10.', cognitiveLevel: 'apply' }
  ],
  keyConcepts: [
    { id: 'c1', term: 'Phép cộng', explanation: 'Gộp hai số.' }
  ]
};

type ArenaDraft = Extract<GameDraft, { gameType: 'arena' }>;

function asArenaDraft(draft: GameDraft): ArenaDraft {
  if (draft.gameType !== 'arena') throw new Error('draft phải là arena');
  return draft;
}

function projectFor(draft: GameDraft, config: GameConfig): GameProject {
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
    analysisId: 'analysis_test',
    recommendationId: 'rec-1',
    config,
    draft,
    gameSnapshot: null,
    gameId: null,
    createdAt: ISO,
    updatedAt: ISO
  };
}

/** Một body OpenAI-compatible tối thiểu mà `readAssistantContent` đọc được. */
function chatResponse(content: string, status = 200): string {
  return JSON.stringify({
    ok: true,
    status,
    body: JSON.stringify({
      choices: [{ finish_reason: 'stop', message: { content } }]
    })
  });
}

interface FakeCall {
  requestId: string;
  body: Record<string, unknown>;
}

const globals = globalThis as Record<string, unknown>;

let calls: FakeCall[] = [];
let nextContent = '';

globals.__eg_http = (raw: string): string => {
  const request = JSON.parse(String(raw)) as { requestId?: unknown; body?: unknown };
  const body = JSON.parse(String(request.body ?? '{}')) as Record<string, unknown>;
  calls.push({ requestId: String(request.requestId ?? ''), body });
  const content = nextContent;
  if (content.startsWith('[send-error]')) {
    return JSON.stringify({
      ok: false,
      kind: 'timeout',
      message: content.slice('[send-error]'.length)
    });
  }
  return chatResponse(content);
};

let progress: string[] = [];
globals.__eg_progress = (stage: string): void => {
  progress.push(String(stage));
};

function resetFake(content: string): void {
  calls = [];
  progress = [];
  nextContent = content;
}

// ---------------------------------------------------------------------------
// Tất định: chuyển đổi, chất lượng, minh hoạ, khoá cache
// ---------------------------------------------------------------------------

const converted = convert({ draft: arenaDraft, target: 'race', config: raceConfig });
assert.equal(converted.draft?.gameType, 'race');
assert.equal(converted.converted, 2);
assert.equal(converted.draft?.questions.length, 2);
assert.equal(converted.gaps.length, 1);
assert.equal(converted.complete, false);

assert.throws(
  () => convert({ draft: arenaDraft, target: '__proto__', config: raceConfig }),
  /Thể loại trò chơi đích không hợp lệ\./
);
assert.throws(() => convert({ target: 'race', config: raceConfig }), /Chưa có bản nháp để chuyển đổi\./);

const report = quality({ draft: arenaDraft, config: arenaConfig, analysis });
assert.equal(report.gameType, 'arena');
assert.ok(Array.isArray(report.issues));
assert.equal(typeof report.canPublish, 'boolean');

const patched = patchAssets({
  project: projectFor(arenaDraft, arenaConfig),
  itemIndex: 1,
  patch: { iconName: 'star', contentCategory: 'math' }
});
assert.equal(patched.itemIndex, 1);
assert.equal(patched.applied.iconName, 'star');
assert.equal(asArenaDraft(patched.project.draft as GameDraft).questions[0].iconName, 'star');
assert.equal(asArenaDraft(patched.project.draft as GameDraft).questions[0].id, 'q1');
assert.equal(patched.game.questions[0].iconName, 'star');
assert.equal(patched.game.questions.length, 3);

assert.throws(
  () => patchAssets({
    project: projectFor(arenaDraft, arenaConfig),
    itemIndex: 1,
    patch: { prompt: 'không được đổi' }
  }),
  /Không có trường minh hoạ nào được gửi lên\./
);

const keyInput = {
  project: projectFor(arenaDraft, arenaConfig),
  analysis,
  modelId: 'gemini-2.5-flash',
  mode: 'fast',
  providerId: 'gemini'
};
const key = generationKey(keyInput);
assert.match(key, /^draft_v\d+_[0-9a-f]{64}$/);
assert.equal(key, generationKey(keyInput));
assert.notEqual(key, generationKey({ ...keyInput, modelId: 'gpt-4.1-mini' }));
assert.notEqual(key, generationKey({ ...keyInput, mode: 'deep' }));
assert.notEqual(key, generationKey({ ...keyInput, providerId: 'openai' }));
assert.notEqual(
  key,
  generationKey({
    ...keyInput,
    analysis: { ...analysis, topic: 'Chủ đề khác' }
  })
);

// ---------------------------------------------------------------------------
// Cache hit và nhánh câu hỏi soạn sẵn: không gọi model
// ---------------------------------------------------------------------------

resetFake('');
const cacheHit = generationCache({
  project: projectFor(arenaDraft, arenaConfig),
  analysis,
  payload: {
    draft: arenaDraft,
    mode: 'deep',
    context: { chunkCount: 2, scorer: 'lexical' }
  }
});
assert.equal(cacheHit.cached, true);
assert.equal(cacheHit.mode, 'deep');
assert.equal(cacheHit.game.questions.length, 3);
assert.equal(asArenaDraft(cacheHit.project.draft as GameDraft).questions[1].id, 'q2');
assert.equal(cacheHit.quality.gameType, 'arena');
assert.deepEqual(cacheHit.context, { chunkCount: 2, scorer: 'lexical' });
assert.equal(calls.length, 0);

assert.throws(
  () => generationCache({
    project: projectFor(arenaDraft, arenaConfig),
    payload: { draft: { gameType: 'arena', schemaVersion: 1, questions: [] } }
  }),
  (error: Error & { code?: string }) => {
    // The cache row is ours, not model output; Rust deletes an unusable row and
    // falls through to a fresh generation. The V8 op itself must still refuse it.
    assert.equal(error.code, 'DRAFT_INVALID');
    return true;
  }
);

resetFake('');
const offline = generationOffline({
  project: projectFor(arenaDraft, arenaConfig),
  sourceDraft: arenaDraft,
  fromChat: true
});
assert.equal(offline.cached, true);
assert.equal(offline.mode, 'fast');
assert.equal(offline.source, 'chat-questions');
assert.equal(offline.game.questions.length, 3);
assert.equal(offline.context, null);
assert.equal(calls.length, 0);

assert.throws(
  () => generationOffline({
    project: projectFor(arenaDraft, arenaConfig),
    sourceDraft: { gameType: 'arena', schemaVersion: 1, questions: [] },
    fromChat: true
  }),
  error => {
    assert.match(String((error as Error).message), /^\[GENERATION_INVALID\] Dữ liệu trò chơi không hợp lệ/);
    return true;
  }
);

// ---------------------------------------------------------------------------
// Tạo mới qua "máy chủ" loopback giả
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  resetFake(JSON.stringify(arenaDraft));
  const generated = await generate({
    project: projectFor(arenaDraft, arenaConfig),
    analysis,
    text: 'Quang hợp là quá trình cây xanh dùng ánh sáng để tạo chất hữu cơ. Lá cây có chất diệp lục.',
    mode: 'fast',
    requestId: 'gen_test_1',
    target: { requestId: 'gen_test_1', model: 'gemini-2.5-flash', mode: 'online' }
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].requestId, 'gen_test_1');
  assert.equal(generated.cached, false);
  assert.equal(generated.mode, 'fast');
  assert.equal(asArenaDraft(generated.draft).questions.length, 3);
  assert.equal(generated.game.questions.length, 3);
  assert.match(generated.promptVersion, /^draft-v\d+$/);
  assert.ok(generated.context.chunkCount > 0);
  assert.ok(generated.context.characters > 0);
  assert.deepEqual(progress, ['retrieve', 'generate', 'validate']);

  const messages = calls[0].body.messages as Array<{ role?: string; content?: unknown }>;
  const system = messages.find(message => message.role === 'system');
  assert.ok(system && typeof system.content === 'string' && system.content.length > 0);

  // Một lỗi tải lên phải thành mã AI_* ổn định, vì IPC của Tauri chỉ giữ câu lỗi.
  resetFake('[send-error]Máy chủ AI không phản hồi.');
  await assert.rejects(
    () => generate({
      project: projectFor(arenaDraft, arenaConfig),
      analysis,
      text: 'Bài giảng ngắn.',
      requestId: 'gen_test_2',
      target: { requestId: 'gen_test_2', model: 'gemini-2.5-flash', mode: 'online' }
    }),
    (error: Error & { code?: string }) => {
      assert.equal(error.code, 'AI_TIMEOUT');
      assert.match(error.message, /Yêu cầu AI quá thời gian chờ/);
      return true;
    }
  );
  assert.deepEqual(progress, ['retrieve', 'generate']);

  // Tạo lại đúng một mục: id của mục cũ được giữ, mục khác không đổi.
  resetFake(JSON.stringify({
    gameType: 'arena',
    questions: [{
      id: 'ai_invented',
      type: 'multiple-choice',
      prompt: '3 + 4 = ?',
      options: [{ id: 'x', text: '7' }, { id: 'y', text: '8' }],
      correctOptionId: 'x',
      explanation: 'Bằng 7.',
      difficulty: 'dễ',
      points: 100
    }]
  }));
  const regenerated = await regenerate({
    project: projectFor(arenaDraft, arenaConfig),
    analysis,
    text: 'Bài giảng ngắn.',
    itemIndex: 2,
    requestId: 'regen_test_1',
    target: { requestId: 'regen_test_1', model: 'gemini-2.5-flash', mode: 'online' }
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].requestId, 'regen_test_1');
  assert.deepEqual(regenerated.itemIndexes, [2]);
  assert.equal(regenerated.cached, false);
  assert.equal(regenerated.itemContext.items, 1);
  assert.equal(regenerated.itemContext.narrowed >= 0, true);
  assert.deepEqual(progress, ['retrieve', 'generate', 'validate']);
  const draft = regenerated.project.draft as GameDraft;
  if (draft.gameType !== 'arena') throw new Error('draft phải là arena');
  assert.equal(draft.questions[0].prompt, '2 + 3 = ?');
  assert.equal(draft.questions[1].id, 'q2');
  assert.equal(draft.questions[1].prompt, '3 + 4 = ?');
  if (draft.questions[1].type !== 'multiple-choice') throw new Error('câu mới phải là multiple-choice');
  assert.equal(draft.questions[1].options[0].id, 'x');
  assert.equal(draft.questions[1].options[1].id, 'y');
  assert.equal(draft.questions[2].prompt, 'Thủ đô Việt Nam là ...');
  assert.equal(draft.questions[2].id, 'q3');
  assert.equal(regenerated.game.questions.length, 3);

  // Lượt chat ghi nguồn trả lời vào lịch sử: `runLessonChatTurn` đọc
  // `client.providerId`, nên client của Tauri phải mang provider đã chọn như
  // `createChatClientForProvider` của Electron. Thiếu nó thì mọi lượt mất
  // providerId (cổng ui-lesson-chat bắt đúng lỗi này).
  resetFake(JSON.stringify({ answer: 'Quang hợp tạo chất hữu cơ từ ánh sáng.' }));
  const chatTurn = await chat({
    target: { requestId: 'chat_test_1', model: 'gemini-2.5-flash', mode: 'online', providerId: 'custom' },
    requestId: 'chat_test_1',
    question: 'Quang hợp là gì?',
    documents: [],
    mode: 'auto'
  });
  assert.equal(calls.length, 1);
  assert.equal(chatTurn.providerId, 'custom');
  assert.equal(chatTurn.intent, 'answer');
  assert.equal(chatTurn.errorCode, '');
  assert.equal(chatTurn.answer, 'Quang hợp tạo chất hữu cơ từ ánh sáng.');

  // Provider khác cũng được giữ nguyên, không hard-code; thiếu providerId thì
  // lượt chat để rỗng (đúng phần fallback `|| ''` của runLessonChatTurn).
  resetFake(JSON.stringify({ answer: 'Trả lời bằng gemini.' }));
  const geminiTurn = await chat({
    target: { requestId: 'chat_test_2', model: 'gemini-2.5-flash', mode: 'online', providerId: 'gemini' },
    requestId: 'chat_test_2',
    question: 'Nước sôi ở bao nhiêu độ?',
    documents: [],
    mode: 'auto'
  });
  assert.equal(geminiTurn.providerId, 'gemini');
  resetFake(JSON.stringify({ answer: 'Không rõ provider.' }));
  const autoTurn = await chat({
    target: { requestId: 'chat_test_3', model: 'gemini-2.5-flash', mode: 'online' },
    requestId: 'chat_test_3',
    question: 'Một câu hỏi tự do?',
    documents: [],
    mode: 'auto'
  });
  assert.equal(autoTurn.providerId, '');

  console.log('Tauri lesson generation tests passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
