import assert from 'node:assert/strict';
import {
  classifyInput,
  inputKindLabel,
  resolveInputKind,
  type InputClassification
} from '../../src/services/input-classifier';
import { parseQuestionsFromText } from '../../src/services/question-import';

// docs/archive/specs/update_quy_trinh.txt §2 + §5: the app must not call the model
// to classify input. These tests pin the *rules*, so a routing change can never
// silently start sending question banks through the lesson-analysis pipeline.
//
// Synthetic teaching material only (AGENTS.md): no real student data.

let passed = 0;
function it(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`ok   ${name}`);
}

const QUESTION_BANK = `Câu 1: Thủ đô của Việt Nam là gì?
A. Hà Nội
B. Huế
C. Đà Nẵng
D. Hải Phòng
Đáp án: A
Giải thích: Hà Nội là thủ đô từ năm 1010.

Câu 2: Nước nào có diện tích lớn nhất thế giới?
A. Trung Quốc
B. Nga
C. Canada
D. Mỹ
Đáp án: B

Câu 3: Hành tinh nào gần Mặt Trời nhất?
A. Sao Kim
B. Trái Đất
C. Sao Thủy
D. Sao Hỏa
Đáp án: C`;

const QUESTION_BANK_NUMBERED = `1. 2 + 2 = ?
A. 3
B. 4
C. 5
D. 6
Đáp án: B

2. 5 x 3 = ?
A. 15
B. 10
C. 20
D. 25
Đáp án: A

3. 10 - 4 = ?
A. 5
B. 6
C. 7
D. 8
Đáp án: B`;

const LESSON = `Bài 12: Quang hợp ở thực vật

I. Mục tiêu
Sau bài học, học sinh trình bày được khái niệm quang hợp và vai trò của ánh sáng đối với cây xanh.
Học sinh phân tích được mối quan hệ giữa ánh sáng, nước và khí cacbonic trong quá trình quang hợp.

II. Kiến thức trọng tâm
Quang hợp là quá trình thực vật sử dụng năng lượng ánh sáng để tổng hợp chất hữu cơ từ nước và khí cacbonic.
Diệp lục trong lá hấp thụ ánh sáng, chuyển hóa năng lượng ánh sáng thành năng lượng hóa học.

III. Hoạt động dạy học
Giáo viên giới thiệu bối cảnh và nêu vấn đề về nguồn thức ăn của thực vật trong tự nhiên.
Học sinh thảo luận nhóm và ghi lại những điểm chưa chắc chắn để trình bày trước lớp.

IV. Củng cố
Học sinh tóm tắt lại nội dung chính của bài bằng sơ đồ tư duy ngắn gọn và rõ ràng.`;

const SHORT_TEXT = 'Quang hợp là quá trình cây xanh tổng hợp chất hữu cơ.';

const QUESTION_BANK_WITH_HEADING = `PHIẾU BÀI TẬP MÔN SINH HỌC

Câu 1: Lục lạp có vai trò gì?
A. Hô hấp
B. Quang hợp
C. Thoát hơi nước
D. Vận chuyển
Đáp án: B

Câu 2: Khí nào được thải ra trong quang hợp?
A. Cacbonic
B. Nito
C. Oxy
D. Hidro
Đáp án: C`;

const LESSON_ENDING_WITH_QUESTIONS = `I. Mục tiêu
Học sinh phân tích được nguyên nhân và hệ quả của ô nhiễm nguồn nước ở địa phương mình đang sinh sống.

II. Hoạt động
Giáo viên tổ chức bốn nhóm nhỏ, mỗi nhóm đọc một đoạn tài liệu và ghi lại các nguyên nhân gây ô nhiễm nguồn nước.
Sau đó các nhóm trình bày nhanh và cả lớp cùng bổ sung, giáo viên tổng hợp lại thành sơ đồ chung trên bảng.

III. Củng cố
Cả lớp cùng nhắc lại các nguyên nhân chính và cách phòng tránh đã học trong tiết này.

Câu hỏi 1: Nguyên nhân gây ô nhiễm nguồn nước là gì?
A. Xả rác bừa bãi
B. Dùng nước tiết kiệm
Đáp án: A

Câu hỏi 2: Cách phòng tránh ô nhiễm nguồn nước là gì?
A. Xử lý nước thải
B. Vứt rác xuống sông
Đáp án: A`;

const OUTLINE = `I. Mục tiêu
II. Kiến thức trọng tâm
III. Hoạt động dạy học
IV. Củng cố
V. Dặn dò`;

const OUTLINE_SHORT_BULLETS = `I. Mục tiêu
- Nêu được khái niệm
- Kể tên các bộ phận

II. Kiến thức trọng tâm
- Quang hợp
- Diệp lục

III. Hoạt động
- Thảo luận nhóm
- Trình bày`;

function expectKind(classification: InputClassification, kind: InputClassification['kind']): void {
  assert.equal(classification.kind, kind, `expected ${kind}, got ${classification.kind} (${classification.reasons.join('; ')})`);
}

it('a plain question bank is classified as questions', () => {
  const classification = classifyInput(QUESTION_BANK);
  expectKind(classification, 'questions');
  assert.equal(classification.questionCount, 3, 'three complete questions');
  assert.ok(classification.confidence >= 0.6);
  assert.match(classification.reasons[0], /câu hỏi/i);
});

it('a numbered question bank is classified as questions', () => {
  expectKind(classifyInput(QUESTION_BANK_NUMBERED), 'questions');
});

it('a question bank with a worksheet heading is still questions', () => {
  // A heading is a lesson marker, but it must not outweigh a text that is 95% questions.
  expectKind(classifyInput(QUESTION_BANK_WITH_HEADING), 'questions');
});

it('a lesson document is classified as lesson', () => {
  const classification = classifyInput(LESSON);
  expectKind(classification, 'lesson');
  assert.ok(classification.lessonMarkerCount >= 2, `lesson markers: ${classification.lessonMarkerCount}`);
  assert.equal(classification.questionCount, 0);
});

it('a lesson that ends with two questions stays on the lesson path', () => {
  // The trap this rule exists for: adding a short check to a lesson must not send the
  // whole lesson down the question-import path.
  expectKind(classifyInput(LESSON_ENDING_WITH_QUESTIONS), 'lesson');
});

it('a fragment is ambiguous, and ambiguous resolves to the old lesson path', () => {
  const classification = classifyInput(SHORT_TEXT);
  expectKind(classification, 'ambiguous');
  assert.equal(resolveInputKind(classification), 'lesson', 'an unsure verdict must never skip the lesson pipeline silently');
  assert.match(classification.reasons[0], /giáo án/i);
});

it('empty input is ambiguous, never a question bank', () => {
  for (const value of ['', '   ', '\n\n\t']) {
    const classification = classifyInput(value);
    expectKind(classification, 'ambiguous');
    assert.equal(classification.questionCount, 0);
    assert.equal(resolveInputKind(classification), 'lesson');
  }
});

it('hostile input does not throw', () => {
  const hostile = [null, undefined, 42, {}, [], 'A'.repeat(200_000), '\u0000\u0001\uFFFD'] as unknown as string[];
  for (const value of hostile) {
    const classification = classifyInput(value);
    assert.ok(typeof classification.questionLineRatio === 'number' && Number.isFinite(classification.questionLineRatio));
    assert.ok(classification.kind === 'lesson' || classification.kind === 'questions' || classification.kind === 'ambiguous');
    assert.equal(resolveInputKind(classification), classification.kind === 'questions' ? 'questions' : 'lesson');
  }
});

it('one question plus a lot of prose is not a question bank', () => {
  const mixed = `Câu 1: Điều gì xảy ra khi bỏ muối vào nước?
A. Tan ra
B. Đông lại
Đáp án: A

${LESSON}`;
  expectKind(classifyInput(mixed), 'lesson');
});

it('resolveInputKind only ever returns lesson or questions', () => {
  for (const classification of [classifyInput(QUESTION_BANK), classifyInput(LESSON), classifyInput(''), null, undefined]) {
    const kind = resolveInputKind(classification as InputClassification | null | undefined);
    assert.ok(kind === 'lesson' || kind === 'questions', `unexpected ${String(kind)}`);
  }
});

it('labels are teacher-facing Vietnamese', () => {
  assert.equal(inputKindLabel('questions'), 'Danh sách câu hỏi');
  assert.equal(inputKindLabel('lesson'), 'Giáo án / tài liệu');
  assert.equal(inputKindLabel('ambiguous'), 'Chưa xác định');
});

it('classification is deterministic and pure (same input, same output, no mutation)', () => {
  const first = classifyInput(QUESTION_BANK);
  const second = classifyInput(QUESTION_BANK);
  assert.deepEqual(first, second);
  const before = QUESTION_BANK;
  classifyInput(QUESTION_BANK);
  assert.equal(QUESTION_BANK, before);
});

it('a large lesson stays fast (no model, no regex blow-up)', () => {
  const big = Array.from({ length: 400 }, (_, index) => `Đoạn văn số ${index} mô tả một nội dung bài học khá dài để kiểm tra tốc độ xử lý văn bản lớn.`).join('\n');
  const started = Date.now();
  const classification = classifyInput(big);
  const elapsed = Date.now() - started;
  expectKind(classification, 'lesson');
  assert.ok(elapsed < 500, `took ${elapsed}ms`);
});

it('a bare outline of section headings is classified as outline', () => {
  // update_quy_trinh_2 §2: headings but no prose and no questions.
  const classification = classifyInput(OUTLINE);
  expectKind(classification, 'outline');
  assert.ok(classification.lessonMarkerCount >= 2, `markers: ${classification.lessonMarkerCount}`);
  assert.match(classification.reasons[0], /dàn ý/i);
});

it('an outline written as short bullet items is still an outline', () => {
  expectKind(classifyInput(OUTLINE_SHORT_BULLETS), 'outline');
});

it('an outline never takes the AI-free question path', () => {
  // The safe property: outline must keep the existing lesson analysis route, so a
  // skeleton is never mistaken for a ready question bank.
  const classification = classifyInput(OUTLINE);
  assert.equal(resolveInputKind(classification), 'lesson');
  assert.equal(inputKindLabel(classification.kind), 'Dàn ý / khung sườn');
});

it('an outline with real paragraphs is a lesson, not an outline', () => {
  // One heading plus prose must not be downgraded to "outline": the teacher wrote it out.
  const written = `I. Mục tiêu
Sau bài học, học sinh trình bày được khái niệm quang hợp và vai trò của ánh sáng đối với cây xanh.
Học sinh phân tích được mối quan hệ giữa ánh sáng, nước và khí cacbonic trong quá trình quang hợp.`;
  expectKind(classifyInput(written), 'lesson');
});

it('a single heading is not enough to call it an outline', () => {
  expectKind(classifyInput('Mục tiêu\nNắm được bài.'), 'lesson');
});

it('an outline that also carries questions stays on the safe path, not the AI-free one', () => {
  const withQuestions = `${OUTLINE}

Câu 1: Quang hợp là gì?
A. Tổng hợp chất hữu cơ
B. Hô hấp
Đáp án: A
Giải thích: Nhờ ánh sáng.

Câu 2: Khí nào thải ra?
A. Oxy
B. Cacbonic
Đáp án: A
Giải thích: Oxy được thải ra.`;
  // A mix of outline headings and questions is exactly what §2 calls "ambiguous or
  // mixed content". The question ratio is diluted by the headings, so it deliberately
  // does NOT take the question-only path: the teacher gets the full lesson pipeline
  // rather than an import that silently drops the outline.
  const classification = classifyInput(withQuestions);
  expectKind(classification, 'lesson');
  assert.equal(resolveInputKind(classification), 'lesson');
});

it('every text the rules call a question bank actually parses into questions', () => {
  // The classifier and the parser must agree: the wizard offers "Dùng câu hỏi có sẵn"
  // based on the classifier, so a text it calls `questions` that parses to zero
  // questions is a dead end for the teacher. Measured before the shared patterns:
  // `Đáp án - B` and `Câu hỏi 1:` were "questions" with 0 parsed.
  const banks = [
    QUESTION_BANK,
    QUESTION_BANK_NUMBERED,
    QUESTION_BANK_WITH_HEADING,
    // Variants that used to drift apart.
    'Câu 1: 2 + 2 = ?\nA. 3\nB. 4\nĐáp án - B\nGiải thích: bốn.\n\nCâu 2: 3 + 3 = ?\nA. 5\nB. 6\nĐáp án - B\nGiải thích: sáu.',
    'Câu hỏi 1: 2 + 2 = ?\nA. 3\nB. 4\nĐáp án: B\nGiải thích: bốn.\n\nCâu hỏi 2: 3 + 3 = ?\nA. 5\nB. 6\nĐáp án: B\nGiải thích: sáu.',
    'Câu 1: 2 + 2 = ?\nA. 3\nB. 4\nĐáp án = B\nGiải thích: bốn.\n\nCâu 2: 3 + 3 = ?\nA. 5\nB. 6\nĐáp án = B\nGiải thích: sáu.'
  ];
  for (const bank of banks) {
    const classification = classifyInput(bank);
    if (classification.kind !== 'questions') continue;
    const parsed = parseQuestionsFromText(bank);
    assert.ok(
      parsed.questions.length >= 1,
      `classifier said questions but the importer found none:\n${bank.slice(0, 80)}`
    );
  }
});

console.log(`input-classifier: ${passed} checks passed`);
