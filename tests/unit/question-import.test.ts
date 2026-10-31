import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { importQuestionsFromFile, parseQuestionsFromText } from '../../src/services/input/question-import';

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

  // --- Câu hỏi soạn sẵn dán dạng văn bản (update_quy_trinh §3 nhánh B) ----------

  const pasted = `Câu 1: Vì sao cây cần ánh sáng?
A. Quang hợp
B. Để bay
C. Để ngủ
D. Để rụng lá
Đáp án: A
Giải thích: Ánh sáng hỗ trợ quang hợp.

2. Nước sôi ở bao nhiêu độ C?
A. 50
B. 100
C. 150
D. 200
Đáp án: B
Giải thích: Ở áp suất khí quyển, nước sôi ở 100 độ C.`;
  const fromText = parseQuestionsFromText(pasted);
  assert.equal(fromText.complete, true);
  assert.equal(fromText.issues.length, 0);
  assert.equal(fromText.questions.length, 2);
  assert.equal(fromText.questions[0].prompt, 'Vì sao cây cần ánh sáng?');
  assert.deepEqual(fromText.questions[0].options.map(option => option.text), ['Quang hợp', 'Để bay', 'Để ngủ', 'Để rụng lá']);
  assert.equal(fromText.questions[0].correctOptionId, 'a');
  assert.equal(fromText.questions[0].explanation, 'Ánh sáng hỗ trợ quang hợp.');
  assert.equal(fromText.questions[1].correctOptionId, 'b', 'numbered questions work too');

  // Same question, pasted vs. in a CSV: the two readers must agree.
  const csvOne = await importQuestionsFromFile('one.csv', Buffer.from(
    'Câu hỏi,Phương án A,Phương án B,Phương án C,Phương án D,Đáp án,Giải thích\n' +
    'Vì sao cây cần ánh sáng?,Quang hợp,Để bay,Để ngủ,Để rụng lá,A,Ánh sáng hỗ trợ quang hợp.\n', 'utf8'
  ));
  const pastedOne = parseQuestionsFromText(`Câu 1: Vì sao cây cần ánh sáng?
A. Quang hợp
B. Để bay
C. Để ngủ
D. Để rụng lá
Đáp án: A
Giải thích: Ánh sáng hỗ trợ quang hợp.`);
  const strip = (question: typeof csvOne[0]) => ({
    prompt: question.prompt,
    options: question.options,
    correctOptionId: question.correctOptionId,
    explanation: question.explanation,
    points: question.points
  });
  assert.deepEqual(strip(pastedOne.questions[0]), strip(csvOne[0]), 'pasted text and CSV must produce the same question');

  // A missing answer is reported, not invented (update_quy_trinh §4.3).
  const missingAnswer = parseQuestionsFromText(`Câu 1: Thủ đô Việt Nam?
A. Hà Nội
B. Huế

Câu 2: 2 + 2?
A. 3
B. 4
Đáp án: B
Giải thích: Hai cộng hai bằng bốn.`);
  assert.equal(missingAnswer.questions.length, 1, 'the complete question is still usable');
  assert.equal(missingAnswer.questions[0].prompt, '2 + 2?');
  assert.equal(missingAnswer.issues.length, 1);
  assert.equal(missingAnswer.issues[0].field, 'answer');
  assert.equal(missingAnswer.issues[0].line, 1);
  assert.match(missingAnswer.issues[0].message, /Đáp án/);
  assert.equal(missingAnswer.complete, false);

  // A missing explanation is reported too: the app must not invent one (§4.3), and
  // the draft schema requires a non-empty explanation.
  const missingWhy = parseQuestionsFromText('Câu 1: Câu hỏi?\nA. Một\nB. Hai\nĐáp án: A');
  // The question is KEPT (so the teacher can add the explanation in the editor) and
  // reported separately. Dropping it used to make the question vanish with no way to
  // fix it, while the notice claimed it could be completed later.
  assert.equal(missingWhy.questions.length, 1);
  assert.equal(missingWhy.questions[0].explanation, '', 'nothing is invented');
  assert.equal(missingWhy.issues[0].field, 'explanation');
  assert.equal(missingWhy.needsTeacherInput, true, 'the UI can offer "complete it in the editor"');
  assert.match(missingWhy.issues[0].message, /Giải thích/);
  assert.equal(missingWhy.complete, false, 'still needs the teacher before it can be saved');

  // Two options missing is reported as `options`, not as a wrong answer.
  const missingOptions = parseQuestionsFromText('Câu 1: Câu chỉ có một phương án?\nA. Một\nĐáp án: A');
  assert.equal(missingOptions.questions.length, 0);
  assert.equal(missingOptions.issues[0].field, 'options');

  // An answer that matches no option is reported, and no answer is guessed.
  const badAnswer = parseQuestionsFromText('Câu 1: Câu hỏi?\nA. Một\nB. Hai\nĐáp án: Z');
  assert.equal(badAnswer.questions.length, 0);
  assert.equal(badAnswer.issues[0].field, 'answer');

  // An answer written as the option text (not a letter) still resolves.
  const textAnswer = parseQuestionsFromText('Câu 1: Câu hỏi?\nA. Một\nB. Hai\nĐáp án: Hai\nGiải thích: Vì là hai.');
  assert.equal(textAnswer.questions.length, 1);
  assert.equal(textAnswer.questions[0].correctOptionId, 'b');

  // --- DECISIONS #115: flexible recognition ------------------------------------

  // 2 / 3 / 4 / 5 options, A–H labels, lower case and `A1`-style sub-labels.
  for (const count of [2, 3, 4, 5]) {
    const labels = 'ABCDEFGH'.slice(0, count).split('');
    const body = [`Câu 1: Câu có ${count} phương án?`, ...labels.map((label, index) => `${label}. Phương án ${index + 1}`), `Đáp án: ${labels[count - 1]}`, 'Giải thích: Lời giải.'].join('\n');
    const result = parseQuestionsFromText(body);
    assert.equal(result.parsed.length, 1, `${count} options parse`);
    assert.equal(result.parsed[0].status, 'ready');
    assert.equal(result.parsed[0].kind, 'multiple-choice');
    assert.equal(result.questions[0].options.length, count);
    assert.equal(result.questions[0].correctOptionId, labels[count - 1].toLowerCase());
  }
  const eight = parseQuestionsFromText(`Câu 1: Tám phương án?
${['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((label, index) => `${label}. Phương án ${index + 1}`).join('\n')}
Đáp án: H
Giải thích: Lời giải.`);
  assert.equal(eight.parsed[0].question.options.length, 8, 'nothing is dropped, even past 6');
  assert.equal(eight.parsed[0].status, 'incompatible', '7+ options do not fit any game');
  assert.match(eight.parsed[0].warnings.join(' '), /tối đa 6/u);
  assert.equal(eight.questions.length, 0, 'an incompatible question is not handed to the adapter');

  const subLabels = parseQuestionsFromText(`Câu 1: Hai ý con?
A1. Ý một
A2. Ý hai
Đáp án: A2
Giải thích: Lời giải.`);
  assert.deepEqual(subLabels.parsed[0].question.options.map(option => option.id), ['a1', 'a2']);

  const lower = parseQuestionsFromText(`Câu 1: Chữ thường?
a) Một
b) Hai
Đáp án: b
Giải thích: Lời giải.`);
  assert.equal(lower.parsed[0].status, 'ready');
  assert.equal(lower.parsed[0].question.correctOptionId, 'b');

  // Numbered options only count once the question already reads as a lettered list,
  // so `2. Câu kế tiếp` is never swallowed as an option.
  const numbered = parseQuestionsFromText(`Câu 1: Chọn số đúng?
A. Một
B. Hai
1. Bốn
2. Năm
Đáp án: B
Giải thích: Lời giải.`);
  assert.equal(numbered.parsed.length, 1);
  assert.deepEqual(numbered.parsed[0].question.options.map(option => option.text), ['Một', 'Hai', 'Bốn', 'Năm']);

  // Multi-line option: a deeper-indented line continues the option above it.
  const multiline = parseQuestionsFromText(`Câu 1: Câu nhiều dòng?
A. Phương án một
   vẫn là phương án một
B. Phương án hai
Đáp án: A
Giải thích: Lời giải.`);
  assert.deepEqual(multiline.parsed[0].question.options.map(option => option.text), ['Phương án một vẫn là phương án một', 'Phương án hai']);

  // True/false: Đúng/Sai options, normalised; shorthand `Đ/S:`; one statement is fine,
  // several statements are kept for review and never split.
  const tfOptions = parseQuestionsFromText('Câu 1: Trái Đất quay quanh Mặt Trời.\nA. Đúng\nB. Sai\nĐáp án: Đúng\nGiải thích: Lời giải.');
  assert.equal(tfOptions.parsed[0].kind, 'true-false');
  assert.equal(tfOptions.parsed[0].status, 'ready');
  assert.deepEqual(tfOptions.parsed[0].question.options.map(option => option.text), ['Đúng', 'Sai']);
  assert.equal(tfOptions.parsed[0].question.correctOptionId, 'a');
  assert.equal(tfOptions.questions[0].type, 'true-false');

  const tfShorthand = parseQuestionsFromText('Câu 1: Nước sôi ở 100°C. Đ/S:\nĐáp án: Sai\nGiải thích: Lời giải.');
  assert.equal(tfShorthand.parsed[0].kind, 'true-false');
  assert.equal(tfShorthand.parsed[0].question.correctOptionId, 'b');

  const multiTf = parseQuestionsFromText(`Câu 1: Chọn phát biểu đúng?
a) Trái Đất tròn — Đ
b) Mặt Trăng phát sáng — S
Giải thích: Lời giải.`);
  assert.equal(multiTf.parsed[0].kind, 'multi-tf');
  assert.equal(multiTf.parsed[0].status, 'needs-review');
  assert.equal(multiTf.parsed.length, 1, 'a multi-statement question is not split');
  assert.equal(multiTf.questions.length, 0, 'it never reaches the draft');

  // Several correct answers: named, kept whole, never silently reduced to one.
  const multiAnswer = parseQuestionsFromText('Câu 1: Chọn các đáp án đúng?\nA. Một\nB. Hai\nC. Ba\nĐáp án: A, C\nGiải thích: Lời giải.');
  assert.equal(multiAnswer.parsed[0].kind, 'multi-answer');
  assert.equal(multiAnswer.parsed[0].status, 'needs-review');
  assert.equal(multiAnswer.questions.length, 0);
  assert.match(multiAnswer.parsed[0].warnings.join(' '), /nhiều đáp án/u);
  assert.equal(parseQuestionsFromText('Câu 1: Chọn?\nA. Một\nB. Hai\nC. Ba\nĐáp án: A và C\nGiải thích: X.').parsed[0].kind, 'multi-answer');
  assert.equal(parseQuestionsFromText('Câu 1: Chọn?\nA. Một\nB. Hai\nC. Ba\nĐáp án: A;C\nGiải thích: X.').parsed[0].kind, 'multi-answer');

  // Fill-in-the-blank and short answer carry `correctAnswer` and no options.
  const fill = parseQuestionsFromText('Câu 1: Điền vào chỗ trống: 6CO2 + 6H2O → C6H12O6 + ___.\nĐáp án: 6O2\nGiải thích: Lời giải.');
  assert.equal(fill.parsed[0].kind, 'fill-in-blank');
  assert.deepEqual(fill.parsed[0].question.options, []);
  assert.equal(fill.parsed[0].question.correctAnswer, '6O2');
  assert.equal(fill.questions[0].type, 'fill-in-blank');

  const short = parseQuestionsFromText('Câu 1: Nêu vai trò của diệp lục.\nTrả lời:\nĐáp án: Hấp thụ ánh sáng\nGiải thích: Lời giải.');
  assert.equal(short.parsed[0].kind, 'short-answer');
  assert.equal(short.parsed[0].question.correctAnswer, 'Hấp thụ ánh sáng');

  // Matching: enough pairs are recognised and marked as not a question, too few are
  // still a matching attempt — and neither is converted into a wrong question.
  const matching = parseQuestionsFromText('Câu 1: Ghép cặp.\nA. Quang hợp – 1. Tạo chất hữu cơ\nB. Hô hấp – 2. Giải phóng CO2\nGiải thích: Lời giải.');
  assert.equal(matching.parsed[0].kind, 'matching');
  assert.equal(matching.parsed[0].pairs.length, 2);
  assert.equal(matching.parsed[0].status, 'incompatible');
  assert.equal(matching.questions.length, 0);

  // Mixed bank: six questions, four kinds — each keeps its own kind.
  const mixedBank = parseQuestionsFromText(`Câu 1: Trắc nghiệm?
A. Một
B. Hai
Đáp án: A
Giải thích: Lời giải.

Câu 2: Đúng hay sai?
A. Đúng
B. Sai
Đáp án: Sai
Giải thích: Lời giải.

Câu 3: Điền khuyết: nước sôi ở ___ độ C.
Đáp án: 100
Giải thích: Lời giải.

Câu 4: Vì sao trời mưa?
Trả lời:
Đáp án: Hơi nước ngưng tụ
Giải thích: Lời giải.

Câu 5: Trắc nghiệm 2?
A. Ba
B. Bốn
Đáp án: B
Giải thích: Lời giải.

Câu 6: Nêu khái niệm quang hợp.
Trả lời:
Đáp án: Quá trình tổng hợp chất hữu cơ
Giải thích: Lời giải.`);
  assert.deepEqual(mixedBank.parsed.map(question => question.kind),
    ['multiple-choice', 'true-false', 'fill-in-blank', 'short-answer', 'multiple-choice', 'short-answer']);
  assert.ok(mixedBank.parsed.every(question => question.status === 'ready'), 'a complete mixed bank is ready');

  // Answer marker spellings: `Đáp án -`, `Đáp án =`, `ĐA:`, and the HTML `&aacute;`.
  for (const marker of ['Đáp án: ', 'Đáp án - ', 'Đáp án = ', 'ĐA: ', '&#272;&aacute;p &aacute;n: ']) {
    const spelled = parseQuestionsFromText(`Câu 1: Chọn?\nA. Một\nB. Hai\n${marker}B\nGiải thích: Lời giải.`);
    assert.equal(spelled.parsed[0].question.correctOptionId, 'b', `answer marker “${marker.trim()}”`);
    assert.equal(spelled.parsed[0].status, 'ready');
  }

  // Unicode + HTML entities: decoded to the same text the teacher meant.
  const entities = parseQuestionsFromText('Câu 1: Vì sao&#x20;cây cần &#225;nh s&#225;ng?\nA. Quang h&#7907;p\nB. Âm thanh\nĐáp án: A\nGiải thích: Lời giải.');
  assert.equal(entities.parsed[0].question.prompt, 'Vì sao cây cần ánh sáng?');
  assert.equal(entities.parsed[0].question.options[0].text, 'Quang hợp');

  // A missing explanation is a warning on a question that is still kept (#114),
  // and it never carries onto the next question: the explanation after an `Đáp án`
  // belongs to that question (see `pasted` above, where each explanation is distinct).
  const keptMissingWhy = parseQuestionsFromText('Câu 1: Chọn?\nA. Một\nB. Hai\nĐáp án: A\n\nCâu 2: Chọn?\nA. Một\nB. Hai\nĐáp án: B\nGiải thích: Giải thích của câu 2.');
  assert.equal(keptMissingWhy.parsed[0].question.explanation, '');
  assert.equal(keptMissingWhy.parsed[0].status, 'needs-review');
  assert.equal(keptMissingWhy.parsed[1].question.explanation, 'Giải thích của câu 2.');
  assert.equal(keptMissingWhy.questions.length, 2, 'both stay usable for the editor, gated at save time');

  // A duplicated question keeps both copies and says which line it repeats.
  const duplicate = parseQuestionsFromText('Câu 1: Chọn?\nA. Một\nB. Hai\nĐáp án: A\nGiải thích: X.\n\nCâu 2: chọn?\nA. Một\nB. Hai\nĐáp án: A\nGiải thích: X.');
  assert.equal(duplicate.parsed.length, 2);
  assert.equal(duplicate.parsed[1].duplicateOf, duplicate.parsed[0].sourceLine);
  assert.equal(duplicate.questions.length, 2, 'a duplicate is flagged, not deleted');

  // Blank-line grouping: a bank copied without numbering is still split into questions,
  // and a single question written over several paragraphs is not.
  const unnumbered = parseQuestionsFromText(`Vì sao cây cần ánh sáng?
A. Quang hợp
B. Để bay
Đáp án: A
Giải thích: Lời giải.

Nước sôi ở bao nhiêu độ?
A. 50
B. 100
Đáp án: B
Giải thích: Lời giải.`);
  assert.equal(unnumbered.parsed.length, 2);
  assert.deepEqual(unnumbered.parsed.map(question => question.sourceLine), [1, 7]);
  const oneQuestionTwoParagraphs = parseQuestionsFromText(`Câu 1: Đọc đoạn văn sau.

Đoạn văn thứ hai vẫn thuộc câu hỏi này.
A. Một
B. Hai
Đáp án: A
Giải thích: Lời giải.`);
  assert.equal(oneQuestionTwoParagraphs.parsed.length, 1, 'a paragraph break inside one question does not split it');

  // Every block with content has a status — nothing disappears silently.
  const ragged = parseQuestionsFromText(`Câu 1: Thiếu đáp án?
A. Một
B. Hai

Câu 2: Thiếu phương án?
Đáp án: X
Giải thích: Lời giải.

Câu 3: Hoàn chỉnh?
A. Một
B. Hai
Đáp án: B
Giải thích: Lời giải.`);
  assert.equal(ragged.parsed.length, 3, 'all three blocks are reported');
  assert.deepEqual(ragged.parsed.map(question => question.status), ['needs-review', 'needs-review', 'ready']);
  assert.deepEqual(ragged.parsed.map(question => question.sourceLine), [1, 5, 9]);

  // --- DECISIONS #116: a bank pasted from a slide --------------------------------

  // The teacher's own two questions, exactly as pasted: options on the prompt's line,
  // `👉 Đáp án đúng: B` on the next, no explanation line yet.
  const slideBank = `Câu 1: Bản chất của ngụy biện là gì? A. Khả năng nhìn nhận thế giới đa chiều dựa trên luận cứ minh bạch. 
B. Việc sử dụng các lập luận sai lầm, vi phạm quy tắc logic để đánh lạc hướng người nghe. 
C. Lắng nghe và tiếp thu các ý kiến trái chiều để tìm ra chân lý. 
D. Quá trình phân tích thông tin theo phương pháp khoa học 5W1H. 
👉 Đáp án đúng: B 
Câu 2: Điểm khác biệt cơ bản giữa tư duy phản biện và tư duy ngụy biện/tranh cãi là gì? A. Tư duy phản biện mang bản tính tự phát, còn ngụy biện cần qua rèn luyện. 
B. Ngụy biện dựa trên luận chứng rõ ràng, còn phản biện nói theo cảm tính. 
C. Tư duy phản biện hướng tới thuyết phục và lắng nghe, còn ngụy biện mang tư duy thắng thua và phản bác. 
D. Cả hai đều hướng tới việc phản bác người đối thoại bằng mọi giá. 
👉 Đáp án đúng: C`;
  const slide = parseQuestionsFromText(slideBank);
  assert.equal(slide.parsed.length, 2, 'both questions are recognized');
  assert.equal(slide.parsed[0].kind, 'multiple-choice');
  // The pasted line ends right after option A ("… minh bạch. " then a newline), so A
  // is a lone label with no second one to prove it: it stays part of the prompt rather
  // than cutting the option's text into a stray line. B–D are real options.
  assert.equal(slide.parsed[0].question.options.length, 3, 'later options are recognized');
  assert.deepEqual(slide.parsed[0].question.options.map(option => option.id), ['b', 'c', 'd']);
  assert.equal(slide.parsed[0].question.correctOptionId, 'b');
  assert.equal(slide.parsed[1].question.correctOptionId, 'c');
  assert.match(slide.parsed[0].question.prompt, /Bản chất của ngụy biện là gì\?/u);
  // The fully inline form (all options on the prompt's line) loses nothing.
  const inlineSlide = parseQuestionsFromText(slideBank.replace('A. Khả năng nhìn nhận thế giới đa chiều dựa trên luận cứ minh bạch. \nB.', 'A. Khả năng nhìn nhận thế giới đa chiều dựa trên luận cứ minh bạch. B.'));
  assert.equal(inlineSlide.parsed[0].question.options.length, 4, 'the option on the prompt line is not lost');
  assert.match(inlineSlide.parsed[0].question.prompt, /^Bản chất của ngụy biện là gì\?$/u, 'the prompt no longer carries option A');
  assert.ok(!slide.parsed[0].question.prompt.includes('👉'), 'the emoji is not content');
  // Only the explanation is missing; no answer/option warning is raised for it.
  assert.deepEqual(slide.parsed[0].warnings.filter(warning => !/Giải thích/u.test(warning)), []);
  assert.equal(slide.parsed[0].status, 'needs-review');
  assert.equal(slide.questions.length, 2, 'kept for the editor (explanation gated at save)');

  // With explanations, the same bank is ready.
  const withWhy = parseQuestionsFromText(slideBank
    .replace('👉 Đáp án đúng: B', 'Đáp án: B\nGiải thích: Ngụy biện là lập luận sai lầm.')
    .replace('👉 Đáp án đúng: C', 'Đáp án: C\nGiải thích: Phản biện hướng tới chân lý.'));
  assert.equal(withWhy.questions.length, 2);
  assert.ok(withWhy.parsed.every(question => question.status === 'ready'));

  // True one-line questions: everything on one line, answer included.
  const oneLine = parseQuestionsFromText('Câu 1: Bản chất của ngụy biện là gì? A. Khả năng nhìn nhận. B. Lập luận sai lầm. C. Lắng nghe. D. Phân tích. 👉 Đáp án đúng: B');
  assert.equal(oneLine.parsed.length, 1);
  assert.deepEqual(oneLine.parsed[0].question.options.map(option => option.id), ['a', 'b', 'c', 'd']);
  assert.equal(oneLine.parsed[0].question.correctOptionId, 'b');

  // The answer marker may be decorated several ways.
  for (const mark of ['✅ Đáp án: B', '📌 Đáp án: B', '**Đáp án:** B', 'Đáp án: B ✅']) {
    const decorated = parseQuestionsFromText(`Câu 1: Chọn?\nA. Một\nB. Hai\n${mark}\nGiải thích: Lời giải.`);
    assert.equal(decorated.parsed[0].question.correctOptionId, 'b', `marker “${mark}”`);
    assert.equal(decorated.parsed[0].status, 'ready', `marker “${mark}” leaves the question ready`);
  }

  // Symbols inside content survive; only the edges are cleaned.
  const arrows = parseQuestionsFromText('Câu 1: Quang hợp?\nA. Việt Nam → châu Á\nB. 6CO2 + 6H2O → C6H12O6\nĐáp án: B\nGiải thích: Lời giải.');
  assert.deepEqual(arrows.parsed[0].question.options.map(option => option.text), ['Việt Nam → châu Á', '6CO2 + 6H2O → C6H12O6']);

  // A lesson that quotes "A." and has a decorative heading is not cut into questions.
  const decoratedLesson = `✅ I. Mục tiêu\nSau bài học, học sinh trình bày được khái niệm quang hợp và vai trò của ánh sáng đối với cây xanh.\n\nII. Kiến thức trọng tâm\nHọc sinh A. đạt giải nhất trong kỳ thi; quang hợp là quá trình tổng hợp chất hữu cơ.\n\nIII. Hoạt động\nGiáo viên giới thiệu bối cảnh và nêu vấn đề về nguồn thức ăn của thực vật.`;
  assert.equal(parseQuestionsFromText(decoratedLesson).parsed.length, 0, 'prose stays prose');

  // --- BUG #117: the answer is not content -----------------------------------------

  // `Đáp án đúng: C (Ba)` — the answer repeats the option's text; it must stay an
  // answer, not become part of option C or be lost.
  const answerRepeatsText = parseQuestionsFromText('Câu 1: Chọn đáp án đúng\nA. Một\nB. Hai\nC. Ba\nD. Bốn\nĐáp án đúng: C (Ba)\nGiải thích: Ba.');
  assert.equal(answerRepeatsText.parsed[0].question.correctOptionId, 'c');
  assert.equal(answerRepeatsText.parsed[0].status, 'ready');
  assert.deepEqual(answerRepeatsText.parsed[0].question.options.map(option => option.text), ['Một', 'Hai', 'Ba', 'Bốn']);
  // An answer given by its text only.
  const answerByText = parseQuestionsFromText('Câu 1: Chọn đáp án đúng\nA. Một\nB. Hai\nC. Ba\nD. Bốn\nĐáp án: Ba\nGiải thích: Ba.');
  assert.equal(answerByText.parsed[0].question.correctOptionId, 'c');

  // The answer marker appended to an option's line belongs to the question, and the
  // option keeps its own text.
  const trailing = parseQuestionsFromText('Câu 1: Chọn đáp án đúng\nA. Một\nB. Huế  Đáp án: B\nC. Ba\nD. Bốn\nGiải thích: Huế.');
  assert.deepEqual(trailing.parsed[0].question.options.map(option => option.text), ['Một', 'Huế', 'Ba', 'Bốn']);
  assert.equal(trailing.parsed[0].question.correctOptionId, 'b');
  assert.equal(trailing.parsed[0].status, 'ready');

  const decoratedAnswer = parseQuestionsFromText('Câu 1: Chọn đáp án đúng\nA. Một\nB. Hai\nC. Ba\nD. Bốn ✅ Đáp án: D\nGiải thích: Bốn.');
  assert.equal(decoratedAnswer.parsed[0].question.options[3].text, 'Bốn', 'the marker and tick are not option text');
  assert.equal(decoratedAnswer.parsed[0].question.correctOptionId, 'd');

  // Ordinary options keep their text untouched (no false positives from the marker
  // stripping): a long option that contains a symbol mid-sentence.
  const plain = parseQuestionsFromText('Câu 1: Quang hợp khác hô hấp ở điểm nào?\nA. Chỉ xảy ra ban ngày\nB. Tạo chất hữu cơ và thải O2\nC. Tạo chất hữu cơ\nD. Không có ý đúng\nĐáp án: B\nGiải thích: Quang hợp tạo chất hữu cơ và thải O2.');
  assert.deepEqual(plain.parsed[0].question.options.map(option => option.text),
    ['Chỉ xảy ra ban ngày', 'Tạo chất hữu cơ và thải O2', 'Tạo chất hữu cơ', 'Không có ý đúng']);

  // Nothing to import is not an error message about a missing column.
  const empty = parseQuestionsFromText('   \n\n');
  assert.equal(empty.questions.length, 0);
  assert.equal(empty.issues.length, 0);
  assert.equal(empty.complete, false);

  console.log('Question import tests passed');
}

void run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
