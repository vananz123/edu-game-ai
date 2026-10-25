import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { importQuestionsFromFile } from '../../src/services/question-import';

async function run(): Promise<void> {
  const csv = '\uFEFFCâu hỏi;Phương án A;Phương án B;Phương án C;Đáp án đúng;Giải thích;Điểm;Độ khó\r\n' +
    '"Vì sao cây cần ánh sáng?";"Quang hợp; tạo chất hữu cơ";"Để bay";;A;"Ánh sáng hỗ trợ quang hợp";200;trung bình\r\n';
  const csvQuestions = await importQuestionsFromFile('questions.csv', Buffer.from(csv, 'utf8'));
  assert.equal(csvQuestions.length, 1);
  assert.equal(csvQuestions[0].prompt, 'Vì sao cây cần ánh sáng?');
  assert.equal(csvQuestions[0].options[0].text, 'Quang hợp; tạo chất hữu cơ');
  assert.equal(csvQuestions[0].correctOptionId, 'a');
  assert.equal(csvQuestions[0].points, 200);
  assert.equal(csvQuestions[0].difficulty, 'trung bình');

  const tsv = [
    'Question\tOption A\tOption B\tAnswer\tExplanation',
    'Chọn đáp án\tMột\tHai\tB\tĐáp án đúng'
  ].join('\n');
  const tsvQuestions = await importQuestionsFromFile('questions.tsv', Buffer.from(tsv));
  assert.equal(tsvQuestions[0].correctOptionId, 'b');

  const zip = new JSZip();
  zip.file('xl/workbook.xml', '<?xml version="1.0"?><workbook xmlns:r="r"><sheets><sheet name="Câu hỏi" sheetId="1" r:id="rId1"/></sheets></workbook>');
  zip.file('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml" Type="worksheet"/></Relationships>');
  zip.file('xl/sharedStrings.xml', '<sst><si><t>Câu hỏi</t></si><si><t>Phương án A</t></si><si><t>Phương án B</t></si><si><t>Đáp án</t></si><si><t>Giải thích</t></si><si><t>Cây cần ánh sáng?</t></si><si><t>Quang hợp</t></si><si><t>Bay</t></si><si><t>A</t></si><si><t>Giúp cây phát triển</t></si></sst>');
  zip.file('xl/worksheets/sheet1.xml', [
    '<worksheet><sheetData>',
    '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c><c r="E1" t="s"><v>4</v></c></row>',
    '<row r="2"><c r="A2" t="s"><v>5</v></c><c r="B2" t="s"><v>6</v></c><c r="C2" t="s"><v>7</v></c><c r="D2" t="s"><v>8</v></c><c r="E2" t="s"><v>9</v></c></row>',
    '</sheetData></worksheet>'
  ].join(''));
  const xlsx = await zip.generateAsync({ type: 'nodebuffer' });
  const xlsxQuestions = await importQuestionsFromFile('questions.xlsx', xlsx);
  assert.equal(xlsxQuestions.length, 1);
  assert.equal(xlsxQuestions[0].prompt, 'Cây cần ánh sáng?');
  assert.equal(xlsxQuestions[0].correctOptionId, 'a');
  assert.equal(xlsxQuestions[0].explanation, 'Giúp cây phát triển');

  await assert.rejects(
    importQuestionsFromFile('bad.csv', Buffer.from('Câu hỏi,Phương án A,Phương án B,Đáp án\nCâu hỏi,Một,Hai,Z')),
    /không khớp phương án/
  );
  await assert.rejects(importQuestionsFromFile('questions.pdf', Buffer.from('')), /Chỉ hỗ trợ/);

  // §2.4 mở rộng — cột "Dạng câu hỏi": đúng/sai, điền từ, trả lời ngắn.
  const mixedCsv = [
    'Câu hỏi;Dạng câu hỏi;Phương án A;Phương án B;Đáp án;Độ khó',
    'Trái Đất quay quanh Mặt Trời;đúng/sai;;;Đúng;dễ',
    'Cây xanh hô hấp nhờ khí gì?;điền từ;;;CO2 (hoặc carbon dioxide);trung bình',
    'Thủ đô của Việt Nam?;ngắn;;;Hà Nội;khó',
    '1 + 1 = ?;trắc nghiệm;2;3;A;'
  ].join('\n');
  const mixed = await importQuestionsFromFile('mixed.csv', Buffer.from(mixedCsv, 'utf8'));
  assert.equal(mixed.length, 4);
  assert.equal(mixed[0].type, 'true-false');
  assert.deepEqual(mixed[0].options.map(o => o.text), ['Đúng', 'Sai']);
  assert.equal(mixed[0].correctOptionId, 'a');
  assert.equal(mixed[1].type, 'fill-in-blank');
  assert.equal(mixed[1].correctAnswer, 'CO2 (hoặc carbon dioxide)');
  assert.deepEqual(mixed[1].options, []);
  assert.equal(mixed[1].difficulty, 'trung bình');
  assert.equal(mixed[2].type, 'short-answer');
  assert.equal(mixed[2].correctAnswer, 'Hà Nội');
  assert.equal(mixed[3].type, 'multiple-choice');
  assert.equal(mixed[3].correctOptionId, 'a');

  // Đúng/sai: đáp án Sai/False; nhiều đáp án hợp lệ cách nhau dấu chấm phẩy.
  const tfCsv = 'Câu hỏi,Loại câu hỏi,Đáp án\nMặt Trăng tự phát sáng?,đúng/sai,True\n2+2=5?,đúng sai,False\nSông dài nhất thế giới?,ngắn,"Mekong;Sông Nile"';
  const tf = await importQuestionsFromFile('tf.csv', Buffer.from(tfCsv, 'utf8'));
  assert.equal(tf[0].correctOptionId, 'a');
  assert.equal(tf[1].correctOptionId, 'b');
  assert.equal(tf[2].type, 'short-answer');
  assert.equal(tf[2].correctAnswer, 'Mekong');
  assert.deepEqual(tf[2].alternateAnswers, ['Sông Nile']);

  await assert.rejects(
    importQuestionsFromFile('bad-bool.csv', Buffer.from('Câu hỏi,Dạng,Đáp án\nCâu 1,đúng/sai,Có thể')),
    /Đúng\/Sai/
  );
  await assert.rejects(
    importQuestionsFromFile('bad-blank.csv', Buffer.from('Câu hỏi,Dạng,Đáp án\nCâu 1,điền từ,;\n')),
    /đáp án/
  );
  await assert.rejects(
    importQuestionsFromFile('bad-type.csv', Buffer.from('Câu hỏi,Phương án A,Phương án B,Đáp án,Dạng\nCâu 1,Một,Hai,A,âm thanh')),
    /không được hỗ trợ/
  );
  console.log('Question import tests passed');
}

void run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
