import assert from 'node:assert/strict';
import { AiRequestRegistry, AiTransportError } from '../../src/services/ai/ai-transport';
import {
  CHAT_DEFAULT_QUESTION_COUNT,
  CHAT_EVIDENCE_MAX_CHARS,
  buildChatAnswerPrompt,
  buildChatEvidence,
  buildChatHistoryMessages,
  buildQuestionSetPrompt,
  classifyLessonChatIntent,
  foldChatText,
  requestedQuestionCount,
  runLessonChatTurn,
  type LessonChatDocument
} from '../../src/services/lesson/lesson-chat';
import type { LessonChatClient, LessonChatRequest } from '../../src/services/lesson/lesson-workflow';
import type { LessonChatMessage } from '../../src/shared/lesson-types';

// Synthetic lesson text — no real school documents, no student data (AGENTS.md).
const DOC_A: LessonChatDocument = {
  id: 'doc_a',
  name: 'Giao an A — Quang hop.txt',
  text: [
    'Bài 12: Quang hợp ở thực vật.',
    'Mục tiêu: học sinh trình bày được khái niệm quang hợp và vai trò của ánh sáng.',
    'Quang hợp là quá trình thực vật sử dụng năng lượng ánh sáng để tổng hợp chất hữu cơ.',
    'Diệp lục trong lá hấp thụ ánh sáng và chuyển hóa năng lượng ánh sáng.'
  ].join('\n')
};
const DOC_B: LessonChatDocument = {
  id: 'doc_b',
  name: 'Giao an B — Ho hap.txt',
  text: [
    'Bài 13: Hô hấp ở thực vật.',
    'Hô hấp là quá trình phân giải chất hữu cơ thành nước và khí cacbonic, giải phóng năng lượng.',
    'Cây cần ánh sáng để quang hợp tạo chất hữu cơ cho hô hấp.',
    'Nhiệt độ và độ ẩm ảnh hưởng đến cường độ hô hấp ở thực vật.'
  ].join('\n')
};
const QUESTION = 'Hai bài nói gì về vai trò của ánh sáng?';

/** The arena shape the wizard contract already accepts (#182). */
function arenaQuestions(count: number) {
  const labels = ['Lá', 'Rễ', 'Hoa', 'Thân', 'Quả'];
  return Array.from({ length: count }, (unused, index) => ({
    type: 'multiple-choice',
    prompt: `Câu hỏi ôn tập số ${index + 1} về bài?`,
    options: [{ text: labels[index % labels.length] }, { text: 'Phương án sai' }],
    correctOptionId: 'a',
    explanation: `Giải thích cho câu ${index + 1}.`,
    difficulty: 'trung bình',
    points: 100
  }));
}

class RecordingClient implements LessonChatClient {
  readonly requests: LessonChatRequest[] = [];

  constructor(private readonly reply: (request: LessonChatRequest) => unknown) {}

  async chatJson(request: LessonChatRequest): Promise<unknown> {
    this.requests.push(request);
    const value = this.reply(request);
    if (value instanceof Error) throw value;
    return value;
  }
}

/** Answers like the cloud gate's mock: a set request gets a set, everything else an answer. */
function answeringClient(setCount = 0): RecordingClient {
  return new RecordingClient(request => {
    const system = request.messages.filter(message => message.role === 'system').map(message => message.content).join(' ');
    return /soạn câu hỏi/.test(system)
      ? { gameType: 'arena', questions: arenaQuestions(setCount || 2) }
      : { answer: 'Gợi ý: kiểm tra bài cũ bằng hai câu hỏi nhanh trong 3 phút.' };
  });
}

function textOf(request: LessonChatRequest, role: 'system' | 'user'): string {
  const list = request.messages.filter(message => message.role === role);
  return String((role === 'user' ? list[list.length - 1] : list[0])?.content || '');
}

async function main(): Promise<void> {
  const registry = new AiRequestRegistry();

  // --- evidence ------------------------------------------------------------

  // #183: zero attached lessons is a supported turn, so it must not look like a
  // retrieval that failed. `fallback` means "nothing matched, the opening slice was
  // sent instead" — with no lessons at all, nothing was sent and nothing was skimped.
  const none = buildChatEvidence({ documents: [], question: QUESTION });
  assert.equal(none.citations.length, 0);
  assert.equal(none.text, '');
  assert.equal(none.characters, 0);
  assert.equal(none.fallback, false, 'a lesson-free turn is not a skimped lesson');
  assert.equal(none.namesWithoutEvidence.length, 0);

  const merged = buildChatEvidence({ documents: [DOC_A, DOC_B], question: QUESTION });
  assert.ok(merged.citations.length >= 2, `expected quotes from both lessons, got ${merged.citations.length}`);
  assert.ok(merged.characters <= CHAT_EVIDENCE_MAX_CHARS, 'the global budget must hold');
  assert.ok(merged.text.startsWith('[1] ('), merged.text.slice(0, 40));
  assert.ok(/\[2\] \(/.test(merged.text), 'numbering continues across lessons, it restarts per lesson');
  assert.ok(merged.text.includes('(Giao an A'), merged.text.slice(0, 60));
  assert.ok(merged.text.includes('(Giao an B'), merged.text.slice(0, 60));
  assert.deepEqual(
    Array.from(new Set(merged.citations.map(citation => citation.documentId))).sort(),
    ['doc_a', 'doc_b'],
    'every quote keeps the lesson it came from'
  );

  // An attached lesson that holds no text did take part in the turn, so this *is* a
  // fallback — the state a lesson-free turn must never be confused with.
  const emptyDoc = buildChatEvidence({ documents: [{ id: 'doc_c', name: 'Trống.txt', text: '   ' }], question: QUESTION });
  assert.equal(emptyDoc.citations.length, 0);
  assert.equal(emptyDoc.fallback, true);

  // Nothing matched the wording, so the opening slice stands in and the turn is
  // marked as running on fallback quotes.
  const offTopic = buildChatEvidence({
    documents: [{ id: 'doc_d', name: 'Giao an D — Dung cu thi nghiem.txt', text: 'Học sinh chuẩn bị kính hiển vi, dao mổ và khay đựng mẫu vật cho tiết thực hành.' }],
    question: 'Nhiệt độ ảnh hưởng đến hô hấp ra sao?'
  });
  assert.equal(offTopic.fallback, true);
  assert.equal(offTopic.citations.length, 1, 'the opening slice is sent instead');
  assert.ok(offTopic.citations[0].quote.startsWith('Học sinh chuẩn bị'), offTopic.citations[0].quote.slice(0, 40));
  assert.equal(offTopic.namesWithoutEvidence.length, 0, 'a fallback still covered the lesson');

  // --- prompts --------------------------------------------------------------

  const groundedAnswer = buildChatAnswerPrompt({ question: QUESTION, evidence: merged });
  assert.ok(groundedAnswer.includes('Đoạn trích dẫn từ giáo án:'), 'undefined means grounded: old callers keep the quotes');
  assert.ok(groundedAnswer.includes('[1] ('));
  const ungroundedAnswer = buildChatAnswerPrompt({ question: QUESTION, evidence: none, grounded: false });
  assert.ok(ungroundedAnswer.includes('Không có giáo án nào được gắn kèm lượt này'), ungroundedAnswer.slice(0, 80));
  assert.ok(!ungroundedAnswer.includes('Đoạn trích dẫn từ giáo án:'), 'no quote block may be promised');
  assert.ok(!ungroundedAnswer.includes('[1] ('), 'and none may be sent');
  assert.ok(ungroundedAnswer.includes(QUESTION), 'the question still travels');

  const groundedSet = buildQuestionSetPrompt({ question: 'Soạn 3 câu hỏi', evidence: merged, count: 3 });
  assert.ok(/Hãy soạn đúng 3 câu hỏi từ giáo án/.test(groundedSet), groundedSet.slice(0, 60));
  assert.ok(groundedSet.includes('[1] ('));
  const ungroundedSet = buildQuestionSetPrompt({ question: 'Soạn 3 câu hỏi', evidence: none, count: 3, grounded: false });
  assert.ok(/Hãy soạn đúng 3 câu hỏi/.test(ungroundedSet), 'the count phrase the transport and UI both key on');
  assert.ok(ungroundedSet.includes('Không có đoạn trích giáo án nào kèm theo'), ungroundedSet.slice(0, 80));
  assert.ok(!ungroundedSet.includes('[1] ('));
  // Same predefined format either way: a set is still the arena contract, so the
  // handoff to the wizard needs no second model call (#182).
  for (const prompt of [groundedSet, ungroundedSet]) {
    assert.ok(prompt.includes('"gameType": "arena"'));
    assert.ok(prompt.includes('correctOptionId'));
    assert.ok(prompt.includes('Không được để trống "explanation"'));
  }

  // --- intent and count -----------------------------------------------------

  assert.equal(classifyLessonChatIntent('Mục tiêu của bài này là gì?'), 'answer');
  assert.equal(classifyLessonChatIntent('tạo 8 câu hỏi trắc nghiệm về quang hợp'), 'question_set');
  assert.equal(classifyLessonChatIntent('Trò chơi trong bài là gì?'), 'answer', 'a question about a game is still a question');
  assert.equal(classifyLessonChatIntent('Mục tiêu là gì?', 'question_set'), 'question_set', 'the composer switch always wins');
  assert.equal(classifyLessonChatIntent('soan bo cau hoi ve quang hop', 'answer'), 'answer');

  assert.equal(requestedQuestionCount('cho tôi 8 câu hỏi'), 8);
  assert.equal(requestedQuestionCount('Hãy soạn bộ câu hỏi về bài này'), CHAT_DEFAULT_QUESTION_COUNT);
  assert.equal(requestedQuestionCount('99 câu hỏi'), 30, 'the arena contract caps at 30');
  assert.equal(requestedQuestionCount('0 câu hỏi'), 1);
  assert.equal(foldChatText('Giáo án trò chơi'), 'giao an tro choi');

  // --- history --------------------------------------------------------------

  const historyMessages: LessonChatMessage[] = Array.from({ length: 9 }, (unused, index) => ({
    id: `msg_${index}`,
    chatId: 'chat_1',
    position: index,
    role: index % 2 === 0 ? 'user' : 'assistant',
    text: index === 3 ? 'Nhà cung cấp AI trả về lỗi nên lượt này chưa có câu trả lời.' : `Lời ${index}`,
    intent: 'answer',
    citations: [],
    questionSet: null,
    providerId: index % 2 === 0 ? '' : 'gemini',
    errorCode: index === 3 ? 'AI_TIMEOUT' : '',
    createdAt: '2026-01-01T00:00:00.000Z'
  }));
  const history = buildChatHistoryMessages(historyMessages);
  assert.equal(history.length, 6, 'only the newest turns are replayed');
  assert.ok(!history.some(message => /AI_TIMEOUT|chưa có câu trả lời/.test(message.content)), 'the model must not read its own error');
  assert.ok(history[history.length - 1].content.startsWith('Lời'), history[history.length - 1].content);

  // --- a turn with no lesson attached (#183) --------------------------------

  const freeClient = answeringClient();
  const free = await runLessonChatTurn({
    client: freeClient,
    registry,
    requestId: 'req-free',
    documents: [],
    question: 'Gợi ý cách kiểm tra bài cũ trong 3 phút ở lớp 10?',
    history: [],
    mode: 'answer'
  });
  assert.equal(free.grounded, false);
  assert.equal(free.evidenceCharacters, 0);
  assert.equal(free.evidenceFallback, false);
  assert.equal(free.citations.length, 0);
  assert.equal(free.errorCode, '');
  assert.equal(freeClient.requests.length, 1);
  assert.ok(/không gắn giáo án nào/.test(textOf(freeClient.requests[0], 'system')), freeClient.requests[0].messages[0].content.slice(0, 60));
  assert.ok(!/Chỉ được trả lời dựa trên các đoạn trích dẫn/.test(textOf(freeClient.requests[0], 'system')));
  assert.ok(!/\[\d\] \(/.test(textOf(freeClient.requests[0], 'user')));

  const grounded = await runLessonChatTurn({
    client: answeringClient(),
    registry,
    requestId: 'req-grounded',
    documents: [DOC_A, DOC_B],
    question: QUESTION,
    history: [],
    mode: 'answer'
  });
  assert.equal(grounded.grounded, true);
  assert.ok(grounded.citations.length >= 2);
  assert.equal(grounded.evidenceFallback, false);

  // The same turn asked for a question set: still the arena contract, still labelled.
  const freeSet = await runLessonChatTurn({
    client: answeringClient(2),
    registry,
    requestId: 'req-free-set',
    documents: [],
    question: 'Soạn 2 câu hỏi ôn tập',
    history: [],
    mode: 'question_set',
    questionCount: 2
  });
  assert.equal(freeSet.intent, 'question_set');
  assert.equal(freeSet.grounded, false);
  assert.equal(freeSet.questionSet?.questions.length, 2);
  assert.ok(/không có giáo án kèm theo/.test(freeSet.answer), freeSet.answer.slice(0, 120));
  assert.ok(/hãy đối chiếu với bài/.test(freeSet.answer), 'the reply tells the teacher to check it against the lesson');

  const groundedSetTurn = await runLessonChatTurn({
    client: answeringClient(2),
    registry,
    requestId: 'req-set',
    documents: [DOC_A],
    question: 'Soạn 2 câu hỏi ôn tập',
    history: [],
    mode: 'question_set',
    questionCount: 2
  });
  assert.equal(groundedSetTurn.grounded, true);
  assert.ok(!/không có giáo án kèm theo/.test(groundedSetTurn.answer), 'a grounded set is not labelled as a guess');

  // A provider failure on a lesson-free turn must not claim the lesson was at fault.
  const failing = new RecordingClient(() => new AiTransportError('AI_TIMEOUT', 'AI quá thời gian chờ.'));
  const failed = await runLessonChatTurn({
    client: failing,
    registry,
    requestId: 'req-fail',
    documents: [],
    question: 'Gợi ý kiểm tra bài cũ?',
    history: [],
    mode: 'answer'
  });
  assert.equal(failed.errorCode, 'AI_TIMEOUT');
  assert.equal(failed.grounded, false);
  assert.ok(/Lượt này không gắn giáo án nào/.test(failed.answer), failed.answer);
  assert.ok(!/Không tìm thấy đoạn nào liên quan trong các giáo án đã chọn/.test(failed.answer));

  assert.equal(registry.size, 0, 'every turn releases its requestId');
  console.log('Lesson chat tests passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
