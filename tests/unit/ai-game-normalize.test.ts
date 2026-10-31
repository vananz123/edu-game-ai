import assert from 'node:assert/strict';
import { normalizeAiGame } from '../../src/services/game/ai-game-normalize';

const makeId = (prefix: string) => `${prefix}-test`;

function run(): void {
  const mixed = normalizeAiGame({
    title: 'Trò chơi hỗn hợp',
    subject: 'Khoa học',
    template: 'quiz',
    questions: [
      { id: 'q1', type: 'true-false', prompt: 'Cây cần ánh sáng để quang hợp?', correctOptionId: 'b', explanation: 'Cây cần ánh sáng nhưng câu này test đáp án Sai.' },
      { id: 'q2', type: 'fill-in-blank', prompt: 'Quang hợp diễn ra ở bộ phận nào của tế bào?', correctAnswer: 'Lục lạp', alternateAnswers: ['tế bào lục', 'chloroplast'] },
      { id: 'q3', type: 'short-answer', prompt: 'Hãy nêu một lợi ích của cây xanh?', correctAnswer: 'Cung cấp oxy' },
      { id: 'q4', type: 'multiple-choice', prompt: 'Chọn phát biểu đúng về quang hợp?', options: [{ id: 'a', text: 'Tạo oxy' }, { id: 'b', text: 'Tạo CO2' }], correctOptionId: 'a' }
    ]
  }, { template: 'quiz' }, makeId);

  assert.equal(mixed.id, 'game-test');
  assert.equal(mixed.subject, 'Khoa học');
  assert.equal(mixed.questions.length, 4);

  const trueFalse = mixed.questions[0];
  assert.equal(trueFalse.type, 'true-false');
  assert.deepEqual(trueFalse.options, [{ id: 'a', text: 'Đúng' }, { id: 'b', text: 'Sai' }]);
  assert.equal(trueFalse.correctOptionId, 'b');

  const fill = mixed.questions[1];
  assert.equal(fill.type, 'fill-in-blank');
  assert.equal(fill.options.length, 0);
  assert.equal(fill.correctOptionId, '');
  assert.equal(fill.correctAnswer, 'Lục lạp');
  assert.deepEqual(fill.alternateAnswers, ['tế bào lục', 'chloroplast']);

  const short = mixed.questions[2];
  assert.equal(short.type, 'short-answer');
  assert.equal(short.correctAnswer, 'Cung cấp oxy');
  assert.equal(short.alternateAnswers, undefined);

  const mc = mixed.questions[3];
  assert.equal(mc.type, 'multiple-choice');
  assert.equal(mc.correctOptionId, 'a');

  const tfStringAnswer = normalizeAiGame({
    questions: [{ prompt: 'Phát biểu này đúng hay sai?', type: 'true-false', correctAnswer: 'Sai' }]
  }, {}, makeId);
  assert.equal(tfStringAnswer.questions[0].correctOptionId, 'b');

  const tfDefaultIsA = normalizeAiGame({
    questions: [{ prompt: 'Mặt trời mọc phía đông?', type: 'true-false', correctOptionId: 'a' }]
  }, {}, makeId);
  assert.equal(tfDefaultIsA.questions[0].correctOptionId, 'a');

  const droppedAndCoerced = normalizeAiGame({
    template: 'scenario',
    questions: [
      { prompt: 'Câu điền từ thiếu đáp án phải được bỏ?', type: 'fill-in-blank' },
      { prompt: 'Câu thiếu đáp án nhưng còn phương án?', type: 'fill-in-blank', options: ['Đúng một', 'Sai hai'], correctOptionId: 'x' },
      { prompt: 'Câu không xác định type?', type: 'wat', options: [{ id: 'a', text: 'Một' }, { id: 'b', text: 'Hai' }], correctOptionId: 'b' }
    ]
  }, { template: 'scenario' }, makeId);
  assert.equal(droppedAndCoerced.questions.length, 2);
  assert.equal(droppedAndCoerced.questions[0].type, 'multiple-choice');
  assert.equal(droppedAndCoerced.questions[0].correctOptionId, 'a');
  assert.equal(droppedAndCoerced.questions[1].type, 'multiple-choice');
  assert.equal(droppedAndCoerced.questions[1].correctOptionId, 'b');
  assert.equal(droppedAndCoerced.template, 'scenario');

  const stringOptions = normalizeAiGame({
    questions: [{ prompt: 'Chọn đáp án đúng về nước?', options: ['Sôi ở 100°C', 'Đông ở 0°C', 'Không có H'], correctOptionId: 'b' }]
  }, {}, makeId);
  assert.equal(stringOptions.questions[0].options.length, 3);
  assert.equal(stringOptions.questions[0].options[0].id, 'a');
  assert.equal(stringOptions.questions[0].correctOptionId, 'b');

  assert.throws(() => normalizeAiGame({ questions: [] }, {}, makeId), /không tạo được câu hỏi/);
  assert.throws(() => normalizeAiGame({}, {}, makeId), /không tạo được câu hỏi/);

  // AI đôi khi tách đáp án điền từ thành câu nhiều từ; danh sách 4 ý dùng dấu phẩy (kiểu tiếng Việt) phải chấm đúng.
  const commaList = normalizeAiGame({
    questions: [{
      id: 'q1', type: 'short-answer',
      prompt: 'Liệt kê 4 bí quyết để tự rèn luyện tư duy phản biện theo giáo án.',
      correctAnswer: 'Mạnh dạn đặt câu hỏi, Thử lật ngược vấn đề, Trau dồi tri thức, Tự tin là chính mình'
    }]
  }, {}, makeId).questions[0];
  assert.equal(commaList.correctAnswer, 'Mạnh dạn đặt câu hỏi, Thử lật ngược vấn đề, Trau dồi tri thức, Tự tin là chính mình');
  assert.equal(commaList.alternateAnswers, undefined);

  // Câu nhập đáp án giữ gợi ý (cắt 200 ký tự); câu trắc nghiệm không mang hint.
  const hinted = normalizeAiGame({
    questions: [
      { id: 'q1', type: 'fill-in-blank', prompt: 'Quá trình cây tạo chất hữu cơ nhờ ánh sáng gọi là ...', correctAnswer: 'quang hợp', hint: '  Diễn ra ở lục lạp  ' },
      { id: 'q2', type: 'multiple-choice', prompt: 'Cây hút nước chủ yếu qua bộ phận nào?', options: ['Lá', 'Rễ'], correctOptionId: 'b', hint: 'Không dùng cho trắc nghiệm' },
      { id: 'q3', type: 'short-answer', prompt: 'Kể tên khí cây nhả ra khi quang hợp?', correctAnswer: 'oxy', hint: '   ' }
    ]
  }, {}, makeId).questions;
  assert.equal(hinted[0].hint, 'Diễn ra ở lục lạp');
  assert.equal(hinted[1].hint, undefined);
  assert.equal(hinted[2].hint, undefined);
  assert.equal(normalizeAiGame({
    questions: [{ type: 'short-answer', prompt: 'Khí nào cây nhả ra khi quang hợp?', correctAnswer: 'oxy', hint: 'x'.repeat(260) }]
  }, {}, makeId).questions[0].hint.length, 200);

  console.log('ai-game-normalize: OK');
}

run();
