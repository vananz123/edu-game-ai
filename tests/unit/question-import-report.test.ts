// @ts-nocheck -- #317: a skipped row must be REPORTED, never swallowed.
/*
 * Two ways in, one report out.
 *
 * Before #317 the file reader threw on the first bad row (the whole file was lost),
 * and the pasted-text reader reported problems that the editor never displayed. A
 * teacher who counted 12 rows in Excel and got 11 questions had nothing to look at.
 *
 * These tests pin the contract the editor's table is built on:
 *   - a bad row is skipped, named by line and column, and the good rows still import;
 *   - the strict reader keeps throwing the exact same message (no silent behaviour
 *     change for anything that already relied on it);
 *   - pasted Excel text (TAB separated, header row) goes through the row reader, while
 *     pasted prose goes through the block reader.
 */
const assert = require('node:assert/strict');
const {
  importQuestionsFromFile,
  importQuestionsFromFileReport,
  importQuestionsFromPastedText
} = require('../../src/services/input/question-import');

const FIELD_LABELS = { prompt: 'Câu hỏi', options: 'Phương án', answer: 'Đáp án', row: 'Cả dòng' };

async function main() {
  // 1. File with two good rows and two broken ones: both good rows survive.
  const csv = [
    'Câu hỏi;Dạng câu hỏi;Phương án A;Phương án B;Đáp án;Điểm',
    'Câu tốt một?;trắc nghiệm;Một;Hai;A;100',
    ';trắc nghiệm;Một;Hai;A;100',
    'Câu tốt hai?;trắc nghiệm;Ba;Bốn;B;100',
    'Câu sai?;trắc nghiệm;Một;Hai;Z;100'
  ].join('\n');
  const report = await importQuestionsFromFileReport('lop-4.csv', Buffer.from(csv, 'utf8'));
  assert.equal(report.questions.length, 2, 'the two good rows import');
  assert.deepEqual(report.questions.map(question => question.prompt), ['Câu tốt một?', 'Câu tốt hai?']);
  assert.equal(report.issues.length, 2, 'two rows are reported');
  assert.deepEqual(report.issues.map(issue => issue.line), [3, 5], 'lines are the spreadsheet lines');
  assert.deepEqual(report.issues.map(issue => issue.field), ['prompt', 'answer']);
  assert.ok(/thiếu nội dung câu hỏi/u.test(report.issues[0].message));
  assert.ok(/không khớp phương án/u.test(report.issues[1].message));
  assert.ok(report.issues.every(issue => issue.excerpt.length > 0), 'each row keeps the text the teacher wrote');
  assert.equal(report.complete, false, 'incomplete as soon as one row was skipped');

  // 2. Every row broken: no questions, but no throw either — the table IS the answer.
  const allBad = await importQuestionsFromFileReport(
    'hong.csv',
    Buffer.from('Câu hỏi;Phương án A;Phương án B;Đáp án\nChỉ một phương án;Một;;A\n;;;', 'utf8')
  );
  assert.equal(allBad.questions.length, 0);
  assert.equal(allBad.issues.length, 1, 'the blank row is not reported, the one-option row is');
  assert.equal(allBad.issues[0].field, 'options');

  // 3. The strict reader is unchanged: same file, same throw, same message.
  await assert.rejects(
    importQuestionsFromFile('lop-4.csv', Buffer.from(csv, 'utf8')),
    /Dòng 3: thiếu nội dung câu hỏi\./
  );

  // 4. File-level problems still throw in the report reader (nothing was read at all).
  await assert.rejects(importQuestionsFromFileReport('x.pdf', Buffer.from('')), /Chỉ hỗ trợ/);
  await assert.rejects(
    importQuestionsFromFileReport('x.csv', Buffer.from('A;B\n1;2')),
    /Không tìm thấy cột “Câu hỏi”/
  );

  // 5. Pasted Excel TABLE: TAB separated with a header row → the row reader.
  const pastedTable = [
    'Câu hỏi\tDạng câu hỏi\tPhương án A\tPhương án B\tĐáp án',
    'Nước sôi ở bao nhiêu độ?\ttrắc nghiệm\t90\t100\tB',
    'Sai đáp án?\ttrắc nghiệm\tMột\tHai\tZ',
    'Thủ đô Việt Nam?\ttrả lời ngắn\t\t\tHà Nội'
  ].join('\n');
  const fromTable = importQuestionsFromPastedText(pastedTable);
  assert.equal(fromTable.questions.length, 2, 'a bad pasted row does not kill the paste');
  assert.equal(fromTable.questions[1].type, 'short-answer');
  assert.equal(fromTable.issues.length, 1);
  assert.equal(fromTable.issues[0].line, 3);
  assert.equal(fromTable.name, '', 'pasted questions have no file name');

  // 6. Pasted PROSE: no header row → the block reader teachers already know.
  const fromProse = importQuestionsFromPastedText([
    'Câu 1: Vì sao cây cần ánh sáng?',
    'A. Để quang hợp',
    'B. Để bay',
    'Đáp án: A',
    'Giải thích: Nhờ quang hợp tạo chất hữu cơ.'
  ].join('\n'));
  assert.equal(fromProse.questions.length, 1);
  assert.equal(fromProse.questions[0].correctOptionId, 'a');
  assert.equal(fromProse.issues.length, 0);

  // 7. A tab inside prose is not a table: no header row means the block reader.
  const proseWithTab = importQuestionsFromPastedText('Câu 1: Bốn + bốn bằng mấy?\tA. 8\tB. 9\tĐáp án: A');
  assert.equal(proseWithTab.questions.length, 1, 'one tabbed line is still a question block');

  // 8. Nothing pasted: a sentence the teacher can act on, not an empty result.
  assert.throws(() => importQuestionsFromPastedText('   '), /Chưa có chữ nào để nhập/);

  // 9. The table labels the editor renders are the fields the reader reports — every
  //    field name here has a Vietnamese label, so the table can never show "undefined".
  const fields = new Set([...report.issues, ...fromTable.issues].map(issue => issue.field));
  for (const field of fields) assert.ok(FIELD_LABELS[field], `field ${field} needs a label in the editor`);

  console.log('question-import-report: dòng bị bỏ được báo kèm cột và lý do, các dòng tốt vẫn nhập');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
