import assert from 'node:assert/strict';
import {
  LESSON_PROMPT_VERSIONS,
  buildDraftRepairMessages,
  buildItemRegenerationRepairMessages,
  buildLessonAnalysisPrompt,
  buildRepairMessages
} from '../src/services/lesson-prompts';

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
