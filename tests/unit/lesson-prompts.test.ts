import assert from 'node:assert/strict';
import {
  LESSON_PROMPT_VERSIONS,
  buildDraftPrompt,
  buildDraftRepairMessages,
  buildItemRegenerationRepairMessages,
  buildLessonAnalysisPrompt,
  buildRepairMessages
} from '../../src/services/lesson-prompts';

// ---------------------------------------------------------------------------
// O6: the analysis prompt must produce JSON that fits the output budget.
// Measured before this change: a ~2,400-character lesson needed 2,041 completion
// tokens with the 10-objective/12-concept ask, while `lesson:analyze` allowed
// 1,024 -> `AI_TRUNCATED` twice (both attempts) and no analysis. The prompt now
// asks for the smaller, game-sized subset and for short fields.
// ---------------------------------------------------------------------------

const analysisPrompt = buildLessonAnalysisPrompt({
  text: 'Bài 21: Quang hợp ở cây xanh. Quang hợp là quá trình lá cây tổng hợp chất hữu cơ từ nước và khí carbon dioxide nhờ ánh sáng và diệp lục, giải phóng oxygen.',
  subject: 'Sinh học',
  grade: '7',
  sourceName: 'quang-hop.txt'
});

assert.match(analysisPrompt, /1 đến 6 mục tiêu/, 'analysis prompt caps objectives at 6');
assert.match(analysisPrompt, /1 đến 8 khái niệm/, 'analysis prompt caps key concepts at 8');
assert.match(analysisPrompt, /tối đa 25 từ/, 'analysis prompt asks for short descriptions');
assert.match(analysisPrompt, /tối đa 20 từ/, 'analysis prompt asks for short source excerpts');
assert.equal(LESSON_PROMPT_VERSIONS.analysis, 2, 'analysis prompt version bumped so old cached analyses are not reused');

const arenaDraftPrompt = buildDraftPrompt({
  gameType: 'arena',
  config: {
    gameType: 'arena', title: 'Kiểm tra', subject: 'Sinh học', grade: '6', topic: 'Quang hợp',
    audience: 'teen', durationMinutes: 10, difficulty: 'trung bình', playMode: 'individual',
    style: 'fun', focusObjectiveIds: [], generationMode: 'fast', questionCount: 4,
    scoringMode: 'basic', pointsPerCorrect: 100, timeBonus: 10
  },
  analysis: {
    id: 'a1', schemaVersion: 1, documentId: 'd1', subject: 'Sinh học', grade: 6,
    topic: 'Quang hợp', objectives: [{ id: 'o1', description: 'Hiểu quang hợp.', cognitiveLevel: 'understand' }],
    keyConcepts: [{ id: 'k1', term: 'Quang hợp', explanation: 'Tổng hợp chất hữu cơ.' }],
    uncertainties: [], sourceDocumentIds: ['d1'], createdAt: new Date().toISOString()
  }
});
assert.match(arenaDraftPrompt, /không viết sẵn “Đúng”, “Sai” hay lời giải/i, 'true/false prompt does not reveal the answer');
assert.equal(LESSON_PROMPT_VERSIONS.draft, 3, 'draft prompt version bumped after wording changes');

// ---------------------------------------------------------------------------
// Phase 3 of update_plan_6: the optional per-item asset keys.
//
// The keys are optional, so the prompt must (a) offer the real category list and
// (b) say that omitting them is allowed. A prompt that demanded them would trade
// question quality for decoration; a prompt that never mentioned them would give
// the app nothing to work with.
// ---------------------------------------------------------------------------

for (const category of ['general', 'animals', 'space', 'water-world']) {
  assert.ok(arenaDraftPrompt.includes(category), `draft prompt offers the real content category "${category}"`);
}
assert.match(arenaDraftPrompt, /contentCategory/, 'draft prompt names the contentCategory key');
assert.match(arenaDraftPrompt, /iconName/, 'draft prompt names the iconName key');
assert.match(arenaDraftPrompt, /BỎ QUA/, 'draft prompt says the keys may be omitted');
assert.doesNotMatch(arenaDraftPrompt, /illustrationAssetId/, 'the model is not asked to choose an illustration asset');
assert.ok(
  arenaDraftPrompt.indexOf('contentCategory') < arenaDraftPrompt.indexOf('Thiết lập của giáo viên'),
  'the optional-key rule sits with the shape/rules, before the teacher settings'
);

// ---------------------------------------------------------------------------
// O6: a repair after truncation must ask for a shorter answer; a repair after a
// shape error must not change the content length (nothing was cut).
// ---------------------------------------------------------------------------

const baseMessages = [{ role: 'user' as const, content: 'Tạo JSON.' }];
const TRUNCATED = 'AI hết giới hạn token trước khi hoàn tất câu trả lời. Hãy rút ngắn tài liệu hoặc thử lại.';

function lastContent(messages: Array<{ role: string; content: string }>): string {
  return messages[messages.length - 1].content;
}

const truncatedAnalysisRepair = buildRepairMessages({
  messages: baseMessages,
  rawContent: null,
  errorMessage: TRUNCATED
});
assert.match(lastContent(truncatedAnalysisRepair), /rút gọn/i);
assert.match(lastContent(truncatedAnalysisRepair), /ít mục hơn/i);

const shapeAnalysisRepair = buildRepairMessages({
  messages: baseMessages,
  rawContent: '{"subject": 1}',
  errorMessage: 'subject: Expected string, received number'
});
assert.doesNotMatch(lastContent(shapeAnalysisRepair), /rút gọn/i);

const truncatedDraftRepair = buildDraftRepairMessages({
  gameType: 'arena',
  messages: baseMessages,
  rawContent: null,
  errorMessage: TRUNCATED
});
assert.match(lastContent(truncatedDraftRepair), /giữ đủ số mục/i);
assert.match(lastContent(truncatedDraftRepair), /ngắn hơn/i);

const truncatedItemRepair = buildItemRegenerationRepairMessages({
  gameType: 'matching',
  messages: baseMessages,
  rawContent: null,
  errorMessage: TRUNCATED
});
assert.match(lastContent(truncatedItemRepair), /ngắn hơn/i);

const shapeItemRepair = buildItemRegenerationRepairMessages({
  gameType: 'matching',
  messages: baseMessages,
  rawContent: '{}',
  errorMessage: 'pairs: Too small'
});
assert.doesNotMatch(lastContent(shapeItemRepair), /ngắn hơn/i);

console.log('Lesson prompts tests passed');
