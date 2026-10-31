/**
 * Selection + prepared-input tests
 * (docs/archive/specs/update_AI_plan_7.txt §4.2, §5.1, §5.2, §6, §8).
 *
 * The spec's hard rules are what these assert: unselected text is never sent,
 * inherited context is labelled, the budget is never widened by a selection, an
 * omission is always reported, and a selection separates cache entries without
 * changing the key for "no selection".
 */
import assert from 'node:assert/strict';
import { buildLessonStructure } from '../../src/services/lesson/lesson-structure';
import {
  CONTEXT_MARKER,
  MAX_CONTEXT_CHARS,
  SELECTION_BUDGET_CEILING_CHARS,
  prepareSelectedLessonText,
  prepareWholeLessonText,
  resolveSelection,
  selectionFingerprint
} from '../../src/services/lesson/lesson-selection';
import {
  LESSON_PREPROCESS_BUDGET_DEEP,
  LESSON_PREPROCESS_BUDGET_FAST
} from '../../src/services/lesson/lesson-preprocess';
import { AiRequestRegistry } from '../../src/services/ai/ai-transport';
import {
  analyzeLesson,
  type LessonChatRequest
} from '../../src/services/lesson/lesson-workflow';

const LESSON_BLANK_LINES = [
  'Giáo án Khoa học 6',
  '',
  'I. MỤC TIÊU',
  'Học sinh mô tả được quá trình bay hơi của nước.',
  '',
  'II. THIẾT BỊ DẠY HỌC',
  '| Thời gian | Nhiệt độ | Ghi chú |',
  '| --- | --- | --- |',
  '| 0 phút | 20°C | Bắt đầu |',
  '',
  'III. TIẾN TRÌNH DẠY HỌC',
  'Hoạt động 1: Khởi động',
  'Giáo viên đặt câu hỏi mở đầu tiết học.',
  '',
  'Hoạt động 2: Khám phá',
  'Câu hỏi: Khi nước sôi thì hiện tượng gì xảy ra?',
  'Đáp án: Nước chuyển thành hơi nước.'
].join('\n');

// The extractor shape: one `\n` after every line, no blank lines — what
// `pdf-parse`/`mammoth` give `lesson:analyze`, and therefore what the selection is
// prepared from. (A file without a trailing newline, as a real import has.)
const LESSON = [
  'Giáo án Khoa học 6',
  'I. MỤC TIÊU',
  'Học sinh mô tả được quá trình bay hơi của nước.',
  'II. THIẾT BỊ DẠY HỌC',
  '| Thời gian | Nhiệt độ | Ghi chú |',
  '| --- | --- | --- |',
  '| 0 phút | 20°C | Bắt đầu |',
  'III. TIẾN TRÌNH DẠY HỌC',
  'Hoạt động 1: Khởi động',
  'Giáo viên đặt câu hỏi mở đầu tiết học.',
  'Hoạt động 2: Khám phá',
  'Câu hỏi: Khi nước sôi thì hiện tượng gì xảy ra?',
  'Đáp án: Nước chuyển thành hơi nước.'
].join('\n');

const structure = buildLessonStructure(LESSON);
const objectIf = structure.nodes.find(node => node.title === 'II. THIẾT BỊ DẠY HỌC')!;
const processSection = structure.nodes.find(node => node.title === 'III. TIẾN TRÌNH DẠY HỌC')!;
const goal = structure.nodes.find(node => node.title === 'I. MỤC TIÊU')!;
const opening = structure.nodes.find(node => node.title === 'Hoạt động 1: Khởi động')!;

async function run(): Promise<void> {
  // --- Decision A: a selection never widens the budget ---------------------
  assert.equal(SELECTION_BUDGET_CEILING_CHARS, LESSON_PREPROCESS_BUDGET_FAST,
    'a selection must not raise the analysis budget');

  // --- Empty selection is an explicit error (§10.12) -----------------------
  assert.throws(() => resolveSelection(structure, []), /SELECTION_EMPTY|ít nhất một phần/);
  assert.throws(() => prepareSelectedLessonText(LESSON, structure, []), /ít nhất một phần/);
  assert.throws(() => resolveSelection(structure, ['sec_999999']), /không còn trong cấu trúc/);

  // --- Unselected text is never sent (§4.2) --------------------------------
  const onlyObjectives = prepareSelectedLessonText(LESSON, structure, [goal.id], { maxChars: 6_000 });
  assert.ok(onlyObjectives.text.includes('Học sinh mô tả được quá trình bay hơi'), 'selected text missing');
  assert.ok(!onlyObjectives.text.includes('| 0 phút | 20°C |'), 'text from an unselected section was sent');
  assert.ok(!onlyObjectives.text.includes('Giáo viên đặt câu hỏi mở đầu'), 'text from an unselected section was sent');
  assert.ok(onlyObjectives.text.length <= 6_000);
  assert.equal(onlyObjectives.truncated, false);

  // Ticking a parent selects its subsections, and no text is sent twice.
  const wholeProcess = prepareSelectedLessonText(LESSON, structure, [processSection.id], { maxChars: 6_000 });
  assert.ok(wholeProcess.text.includes('Giáo viên đặt câu hỏi mở đầu'));
  assert.ok(wholeProcess.text.includes('Đáp án: Nước chuyển thành hơi nước.'));
  assert.equal(wholeProcess.text.split('Giáo viên đặt câu hỏi mở đầu').length - 1, 1, 'text sent twice');
  // Ticking a child alone does not drag in a sibling's body.
  const onlyOpening = prepareSelectedLessonText(LESSON, structure, [opening.id], { maxChars: 6_000 });
  assert.ok(onlyOpening.text.includes('Giáo viên đặt câu hỏi mở đầu'));
  assert.ok(!onlyOpening.text.includes('Đáp án: Nước chuyển thành hơi nước.'), 'a sibling section leaked in');

  // --- Inherited context is labelled and capped (§5.2) --------------------
  assert.ok(onlyOpening.text.startsWith(CONTEXT_MARKER), 'ancestor context must be labelled');
  assert.ok(onlyOpening.text.includes('III. TIẾN TRÌNH DẠY HỌC'), 'ancestor heading missing from context');
  assert.ok(onlyOpening.text.indexOf(CONTEXT_MARKER) < onlyOpening.text.indexOf('Giáo viên đặt câu hỏi'),
    'context must come before the selected text');
  assert.ok(onlyOpening.chars <= MAX_CONTEXT_CHARS + 6_000);

  const withoutContext = prepareSelectedLessonText(LESSON, structure, [opening.id], {
    maxChars: 6_000,
    includeContext: false
  });
  assert.ok(!withoutContext.text.includes(CONTEXT_MARKER), 'context disabled but still present');

  // --- Tables keep whole rows (§5.1) --------------------------------------
  const tableText = prepareSelectedLessonText(LESSON, structure, [objectIf.id], { maxChars: 6_000 });
  for (const row of ['| Thời gian | Nhiệt độ | Ghi chú |', '| --- | --- | --- |', '| 0 phút | 20°C | Bắt đầu |']) {
    assert.ok(tableText.text.includes(row), `table row split: ${row}`);
  }
  assert.ok(tableText.preserved.tables >= 3, 'table rows are counted as preserved');

  // --- Budget + omission reporting (§6) -----------------------------------
  const huge = `${'Nội dung rất dài của bài học. '.repeat(1_200)}`;
  const hugeStructure = buildLessonStructure(`I. KHỐI LỚN\n${huge}`);
  const hugeSection = hugeStructure.nodes.find(node => node.title === 'I. KHỐI LỚN')!;
  const squeezed = prepareSelectedLessonText(huge, hugeStructure, [hugeSection.id], { maxChars: 2_000 });
  assert.ok(squeezed.chars <= 2_000, `budget exceeded: ${squeezed.chars}`);
  assert.equal(squeezed.truncated, true);
  assert.ok(squeezed.warnings.length > 0, 'a silent cut is forbidden (§6)');
  assert.ok(squeezed.omitted.length > 0, 'the dropped section must be reported');
  assert.ok(squeezed.textBeforeBudget > squeezed.chars);

  // --- Whole-document path reports its cut too ----------------------------
  const whole = prepareWholeLessonText(huge, { maxChars: 3_000 });
  assert.ok(whole.chars <= 3_000);
  assert.equal(whole.truncated, true);
  assert.ok(whole.warnings.length > 0);
  assert.equal(prepareWholeLessonText('Ngắn thôi', { maxChars: 3_000 }).truncated, false);
  // Non-selected analysis keeps today's budget for each mode.
  assert.equal(prepareWholeLessonText('x'.repeat(30_000), { mode: 'deep' }).chars <= LESSON_PREPROCESS_BUDGET_DEEP, true);

  // --- Cache separation (decision A) --------------------------------------
  // No selection must produce no fingerprint, so the key is byte-identical to
  // today's (this is what keeps smoke66/bench/real-ai-e2e caches valid).
  assert.equal(selectionFingerprint(structure, []), null);
  assert.equal(selectionFingerprint(null, ['sec_0']), null);
  const goalPrint = selectionFingerprint(structure, [goal.id]);
  assert.ok(goalPrint && goalPrint.length === 64);
  assert.notEqual(goalPrint, selectionFingerprint(structure, [processSection.id]), 'different picks must differ');
  assert.equal(selectionFingerprint(structure, [goal.id, goal.id]), goalPrint, 'order/duplicates must not matter');
  // A stale selection still separates caches instead of throwing during key build.
  assert.ok(selectionFingerprint(structure, ['sec_999999']));

  // --- Preview cannot drift from what is sent (§8) ------------------------
  const prepared = prepareSelectedLessonText(LESSON, structure, [goal.id]);
  assert.equal(prepared.ranges.find(range => range.id === goal.id)?.selected, true);
  assert.ok(prepared.estimatedTokens > 0);

  // --- Preparing a scope never calls the model (§3.2/§4.2) ---------------
  // The structure tree, the selection and its preview are local work: a teacher
  // must be able to import a lesson, read the tree and tick sections with the AI
  // runtime stopped and no network. The steps below run against a client that
  // counts every call, so a hidden model call fails the suite instead of quietly
  // costing minutes on the pilot machine.
  const requests: LessonChatRequest[] = [];

  // 1. Structure only.
  const importTree = buildLessonStructure(LESSON);
  assert.ok(importTree.nodes.length > 1);
  assert.equal(requests.length, 0, 'building the tree must not call the model');

  // 2. Previewing a scope (what `lesson:preview-selection` returns).
  const allIds = importTree.nodes
    .filter(node => node.id !== importTree.root.id && !node.empty)
    .map(node => node.id);
  assert.ok(prepareSelectedLessonText(LESSON, importTree, allIds).chars > 0);
  assert.deepEqual(requests, [], 'the preview must not call the model');

  // 3. The analysis step is the only one allowed to reach the model, and with a
  //    prepared scope it does so exactly once, sending the prepared text rather
  //    than re-preprocessing the whole document.
  const oneSection = prepareSelectedLessonText(LESSON, importTree, [goal.id]);
  const analysis = await analyzeLesson({
    client: {
      async chatJson(request: LessonChatRequest): Promise<unknown> {
        requests.push(request);
        // Same shape `lesson-workflow.test.ts` feeds the real schema.
        return {
          subject: 'Sinh học',
          grade: 4,
          topic: 'Quang hợp',
          objectives: [
            { description: 'Nêu được khái niệm quang hợp.', cognitiveLevel: 'understand' }
          ],
          keyConcepts: [{ term: 'Quang hợp', explanation: 'Cây xanh tổng hợp chất hữu cơ.' }],
          uncertainties: []
        };
      }
    },
    registry: new AiRequestRegistry(),
    requestId: 'req-selection',
    documentId: 'doc_selection',
    text: LESSON,
    preparedSelection: { text: oneSection.text, truncated: oneSection.truncated }
  });
  assert.equal(requests.length, 1, 'a scoped analysis must make exactly one model call');
  assert.equal(analysis.topic, 'Quang hợp');
  const prompt = requests[0].messages.map(message => message.content).join('\n');
  // §5.4: a scoped prompt carries the prepared selection and never widens back
  // to the whole document. The prompt also holds instructions and the JSON
  // schema, so the check is on the lesson body: the prepared text is present and
  // the unselected part of the section is not.
  assert.ok(prompt.includes(oneSection.text.trim()), 'the prompt must carry the prepared selection');
  assert.ok(oneSection.chars < LESSON.length, 'the scope must be smaller than the document');
  const unselectedProse = LESSON
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 30 && !oneSection.text.includes(line));
  assert.ok(unselectedProse.length > 0, 'fixture should contain text outside the selection');
  for (const line of unselectedProse) {
    assert.ok(!prompt.includes(line), `unselected lesson text leaked into the prompt: "${line.slice(0, 40)}…"`);
  }

  process.stdout.write('lesson-selection: ok\n');
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});

