import assert from 'node:assert/strict';
import {
  analyzeLessonSignals,
  recommendGamesForAnalysis,
  scoreGameTypes
} from '../src/services/game-recommender';
import { GAME_TYPE_RULES, getGameTypeRule } from '../src/services/game-type-rules';
import { gameRecommendationSchema } from '../src/services/lesson-contracts';
import { normalizeAnalysis } from '../src/services/lesson-normalize';
import { WORKFLOW_GAME_TYPES, type LessonAnalysis } from '../src/shared/lesson-types';

const NOW = '2026-03-03T00:00:00.000Z';

let seq = 0;
function analysis(content: Record<string, unknown>) {
  seq += 1;
  return normalizeAnalysis(content as never, {
    id: `analysis_${seq}`,
    documentId: 'doc_1',
    createdAt: NOW,
    sourceDocumentIds: ['doc_1']
  });
}

// --- fixtures -------------------------------------------------------------

const recall = analysis({
  subject: 'Sinh học',
  grade: 7,
  topic: 'Quang hợp',
  objectives: [
    { description: 'Nêu khái niệm quang hợp.', cognitiveLevel: 'remember' },
    { description: 'Trình bày vai trò của ánh sáng.', cognitiveLevel: 'understand' }
  ],
  keyConcepts: [
    { term: 'Quang hợp', explanation: 'Tổng hợp chất hữu cơ nhờ ánh sáng.' },
    { term: 'Diệp lục', explanation: 'Sắc tố hấp thụ ánh sáng.' },
    { term: 'Khí khổng', explanation: 'Nơi trao đổi khí.' }
  ],
  uncertainties: []
});

const safety = analysis({
  subject: 'Giáo dục công dân',
  grade: 8,
  topic: 'An toàn giao thông',
  objectives: [
    { description: 'Xử lý tình huống khi tham gia giao thông.', cognitiveLevel: 'apply' },
    { description: 'Phân tích hậu quả của việc không đội mũ bảo hiểm.', cognitiveLevel: 'analyze' }
  ],
  keyConcepts: [{ term: 'An toàn giao thông', explanation: 'Tuân thủ quy định khi đi đường.' }],
  uncertainties: []
});

const process = analysis({
  subject: 'Sinh học',
  grade: 7,
  topic: 'Quang hợp',
  objectives: [
    { description: 'Nêu các bước của quá trình quang hợp.', cognitiveLevel: 'understand' },
    { description: 'Trình bày quy trình hình thành tinh bột.', cognitiveLevel: 'apply' },
    { description: 'Phân tích vai trò của ánh sáng.', cognitiveLevel: 'analyze' }
  ],
  keyConcepts: [
    { term: 'Pha sáng', explanation: 'Diễn ra đầu tiên ở màng tilacôit.' },
    { term: 'Pha tối', explanation: 'Diễn ra sau đó ở chất nền.' },
    { term: 'Chu trình Canvin', explanation: 'Chu trình cố định CO2 theo trình tự.' },
    { term: 'Ánh sáng', explanation: 'Điều kiện cần cho cả hai giai đoạn.' }
  ],
  uncertainties: []
});

const terms = analysis({
  subject: 'Tiếng Anh',
  grade: 9,
  topic: 'Từ vựng chủ đề môi trường',
  objectives: [
    { description: 'Hiểu định nghĩa của các thuật ngữ môi trường.', cognitiveLevel: 'understand' },
    { description: 'Ghép thuật ngữ với ví dụ tương ứng.', cognitiveLevel: 'understand' }
  ],
  keyConcepts: [
    { term: 'Pollution', explanation: 'Ô nhiễm.' },
    { term: 'Recycle', explanation: 'Tái chế.' },
    { term: 'Renewable', explanation: 'Có thể tái tạo.' },
    { term: 'Habitat', explanation: 'Môi trường sống.' },
    { term: 'Climate', explanation: 'Khí hậu.' },
    { term: 'Conserve', explanation: 'Bảo tồn.' }
  ],
  uncertainties: []
});

const competition = analysis({
  subject: 'Toán',
  grade: 6,
  topic: 'Ôn tập cuối kì - thi đua theo đội',
  objectives: [
    { description: 'Nhắc lại quy tắc cộng trừ số nguyên.', cognitiveLevel: 'remember' },
    { description: 'Nhắc lại quy tắc nhân chia số nguyên.', cognitiveLevel: 'remember' },
    { description: 'Ghi nhớ thứ tự thực hiện phép tính.', cognitiveLevel: 'remember' }
  ],
  keyConcepts: [
    { term: 'Số nguyên', explanation: 'Số âm, số 0 và số dương.' },
    { term: 'Giá trị tuyệt đối', explanation: 'Khoảng cách tới 0.' },
    { term: 'Quy tắc dấu', explanation: 'Nhân chia hai số cùng dấu.' },
    { term: 'Thứ tự phép tính', explanation: 'Nhân chia trước, cộng trừ sau.' }
  ],
  uncertainties: []
});

// The analysis contract requires a topic + at least one objective/concept, so a
// "thin" analysis is built directly: it stands for an old or hand-edited row the
// recommender must still survive without throwing.
const thin = {
  id: 'analysis_thin',
  schemaVersion: 1,
  documentId: 'doc_1',
  subject: null,
  grade: null,
  topic: '',
  objectives: [],
  keyConcepts: [],
  uncertainties: [],
  sourceDocumentIds: ['doc_1'],
  createdAt: NOW
} as unknown as LessonAnalysis;

const topTypes = (lesson: ReturnType<typeof analysis>, count = 2) =>
  scoreGameTypes(lesson).slice(0, count).map(item => item.gameType);

// --- rule table -----------------------------------------------------------

assert.equal(GAME_TYPE_RULES.length, 5);
WORKFLOW_GAME_TYPES.forEach(gameType => {
  const rule = getGameTypeRule(gameType);
  assert.equal(rule.gameType, gameType);
  assert.ok(rule.label.length > 0);
  assert.ok(rule.defaultItemCount >= 3 && rule.defaultItemCount <= 30);
  assert.ok(rule.defaultDurationMinutes >= 3 && rule.defaultDurationMinutes <= 60);
});
assert.throws(() => getGameTypeRule('khong-co' as never), /không được hỗ trợ/i);

// --- signals --------------------------------------------------------------

const processSignals = analyzeLessonSignals(process);
assert.equal(processSignals.objectiveCount, 3);
assert.equal(processSignals.conceptCount, 4);
assert.ok(processSignals.shapeHits.sequence >= 3, 'sequence keywords should be detected');
assert.ok(processSignals.advancedRatio > 0 && processSignals.advancedRatio < 1);
assert.ok(processSignals.basicRatio > 0 && processSignals.basicRatio < 1);

const safetySignals = analyzeLessonSignals(safety);
assert.equal(safetySignals.advancedRatio, 1);
assert.ok(safetySignals.shapeHits.decisions >= 2);

// --- routing --------------------------------------------------------------

assert.deepEqual(topTypes(recall), ['arena', 'matching']);
assert.equal(scoreGameTypes(safety)[0].gameType, 'scenario');
assert.ok(topTypes(terms).includes('matching'), `expected matching in ${topTypes(terms).join(',')}`);
assert.ok(topTypes(process).includes('treasure'), `expected treasure in ${topTypes(process).join(',')}`);
assert.ok(topTypes(competition).includes('race'), `expected race in ${topTypes(competition).join(',')}`);

// --- output shape, contract and determinism -------------------------------

const recommendations = recommendGamesForAnalysis({ analysis: recall, idPrefix: 'rec_analysis_1_', now: NOW });
assert.ok(Array.isArray(recommendations), 'recommender must be synchronous (no model call)');
assert.equal(typeof (recommendations as unknown as { then?: unknown }).then, 'undefined', 'must not return a promise');

const rich = recommendGamesForAnalysis({ analysis: process, idPrefix: 'rec_analysis_3_', now: NOW });
assert.ok(rich.length >= 2 && rich.length <= 3, `expected 2-3 suggestions, got ${rich.length}`);
assert.equal(new Set(rich.map(item => item.gameType)).size, rich.length, 'genres must be unique');

[...recommendations, ...rich].forEach(item => {
  // Must satisfy the same contract the AI path was validated against.
  gameRecommendationSchema.parse(item);
  assert.ok(item.id.length <= 80);
  assert.equal(item.schemaVersion, 1);
  assert.equal(item.analysisId, item.analysisId);
  assert.ok(item.title.length <= 160);
  assert.ok(item.description.length <= 500);
  assert.ok(item.reason.length <= 800);
  assert.ok(item.learningObjectiveIds.length <= 10);
  assert.ok(item.suggestedQuestionCount !== undefined);
  assert.ok(item.suggestedQuestionCount! >= 3 && item.suggestedQuestionCount! <= 30);
  assert.ok(item.suggestedDurationMinutes >= 3 && item.suggestedDurationMinutes <= 60);
});

recommendations.forEach(item => {
  assert.ok(item.id.startsWith('rec_analysis_1_'), `id should be analysis-scoped: ${item.id}`);
  const lesson = recall as { objectives: Array<{ id: string }> };
  const ids = new Set(lesson.objectives.map(objective => objective.id));
  item.learningObjectiveIds.forEach(id => assert.ok(ids.has(id), `unknown objective id ${id}`));
});

// Same input + same clock => identical output (reproducible, no model temperature).
assert.deepEqual(
  recommendGamesForAnalysis({ analysis: recall, idPrefix: 'rec_analysis_1_', now: NOW }),
  recommendations
);
assert.notDeepEqual(
  recommendGamesForAnalysis({ analysis: recall, idPrefix: 'rec_other_', now: NOW }).map(item => item.id),
  recommendations.map(item => item.id)
);

// --- thin / empty analysis still yields usable cards ----------------------

const fallback = recommendGamesForAnalysis({ analysis: thin, idPrefix: 'rec_thin_', now: NOW });
assert.ok(fallback.length >= 1 && fallback.length <= 3);
assert.deepEqual(fallback[0].learningObjectiveIds, []);
assert.ok(fallback[0].title.length > 0);
assert.ok(fallback[0].reason.length > 0);
fallback.forEach(item => gameRecommendationSchema.parse(item));

console.log('Game recommender tests passed');
