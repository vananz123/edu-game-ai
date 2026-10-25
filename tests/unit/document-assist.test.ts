import assert from 'node:assert/strict';
import {
  deduplicateQuestions,
  isAnswerSupportedByEvidence,
  isQuestionSetRequest
} from '../../src/ai-core/document-assist';

assert.equal(isQuestionSetRequest('tạo bộ câu hỏi khác'), true);
assert.equal(isQuestionSetRequest('Hãy đổi bộ câu hỏi mới cho tôi'), true);
assert.equal(isQuestionSetRequest('Em hãy soạn danh sách câu hỏi ôn tập'), true);
assert.equal(isQuestionSetRequest('Bộ phận nào hút nước từ đất?'), false);

assert.equal(
  isAnswerSupportedByEvidence('Khi đèn đỏ, phương tiện phải dừng tại vạch.', [
    'Khi đèn đỏ, phương tiện phải dừng tại vạch.'
  ]),
  true
);
assert.equal(
  isAnswerSupportedByEvidence('Phương tiện phải dừng trước vạch khi đèn đỏ.', [
    'Khi đèn đỏ, phương tiện phải dừng tại vạch.'
  ]),
  true
);
assert.equal(
  isAnswerSupportedByEvidence('Thủ đô của quốc gia là Hà Nội.', [
    'Khi đèn đỏ, phương tiện phải dừng tại vạch.'
  ]),
  false
);
assert.equal(isAnswerSupportedByEvidence('Câu trả lời', []), false);

assert.deepEqual(
  deduplicateQuestions(
    ['Khi nào được phép đi theo chiều ngược lại?', 'Khi nào được phép đi theo chiều ngược lại? ', 'Đội mũ bảo hiểm thế nào cho đúng?', 'doi mu bao hiem the nao cho dung?', 'câu kể không dấu chấm'],
    ['Khi nào được phép đi theo chiều ngược lại?']
  ),
  ['Đội mũ bảo hiểm thế nào cho đúng?']
);
assert.deepEqual(deduplicateQuestions(['  ', 'ab', 'Câu mới ra sao?'], []), ['Câu mới ra sao?']);
assert.deepEqual(
  deduplicateQuestions(['Khi nào không được phép đi theo chiều ngược lại?'], ['Khi nào được phép đi theo chiều ngược lại?']),
  []
);

console.log('Document assist tests passed');
