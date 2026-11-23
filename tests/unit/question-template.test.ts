// @ts-nocheck -- the template must be a file the importer actually accepts (#316).
/*
 * "Nhập CSV/XLSX" needs a file with a header row. A teacher who has no file has no
 * way in, so the editor hands them a template. That template is only useful if it
 * imports, so this suite proves it by ROUND-TRIP: the CSV we ship goes straight
 * into the real importer and must come out as four questions — one of each type
 * the games can play.
 *
 * The renderer is plain global scripts and cannot `import`, so the text exists
 * twice; the third test here runs the renderer copy and fails if the two drift.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const DIST = path.join(__dirname, '..', '..', '..', 'dist', 'src');
const SHARED = require('../../src/shared/question-template');
const { importQuestionsFromFile } = require('../../src/services/input/question-import');

const csv = SHARED.questionTemplateCsv();

// 1. It is a spreadsheet Excel opens without mojibake: BOM, semicolons, CRLF.
assert.ok(csv.startsWith('\uFEFF'), 'a UTF-8 BOM keeps Excel from mangling Vietnamese');
assert.ok(csv.includes('\r\n'), 'CRLF line ends — Excel on Windows is the consumer');
const dataLines = csv.replace(/^\uFEFF/, '').trimEnd().split('\r\n');
assert.equal(dataLines[0], SHARED.QUESTION_TEMPLATE_COLUMNS.join(';'), 'header row is the documented column order');
assert.equal(dataLines.length, 1 + SHARED.QUESTION_TEMPLATE_ROWS.length);
assert.ok(SHARED.QUESTION_TEMPLATE_FILE_NAME.endsWith('.csv'), 'the teacher gets a .csv, not a mystery blob');

// 2. Round-trip: the exact bytes we ship import as four playable questions.
async function main() {
  const questions = await importQuestionsFromFile(SHARED.QUESTION_TEMPLATE_FILE_NAME, Buffer.from(csv, 'utf8'));
  assert.equal(questions.length, 4, 'one example per question type');
  assert.deepEqual(
    questions.map(question => question.type),
    ['multiple-choice', 'true-false', 'fill-in-blank', 'short-answer']
  );

  const [choice, trueFalse, fill, shortAnswer] = questions;
  assert.equal(choice.correctOptionId, 'a', 'answer "A" resolves to the first option');
  assert.deepEqual(choice.options.map(option => option.text), ['Để quang hợp', 'Để hút nước', 'Để nhả hơi nước', 'Để nở hoa']);
  assert.equal(choice.points, 100);
  assert.equal(choice.difficulty, 'dễ');
  assert.ok(choice.explanation.length > 0, 'the example teaches that an explanation is expected');

  assert.equal(trueFalse.correctOptionId, 'a', '"Đúng" resolves to option a');
  assert.deepEqual(trueFalse.options.map(option => option.text), ['Đúng', 'Sai']);

  assert.equal(fill.correctAnswer, 'hướng đông', 'the first accepted answer is the canonical one');
  assert.deepEqual(fill.alternateAnswers, ['đông'], 'a second accepted answer inside the quoted cell survives the parser');

  assert.equal(shortAnswer.correctAnswer, 'Hà Nội');
  assert.equal(shortAnswer.options.length, 0, 'a short answer has no options');

  // Nothing was dropped as an unreadable row: the template must be 100% clean.
  for (const question of questions) {
    assert.ok(question.prompt.length > 5, 'every example row has a real prompt');
    assert.ok(question.difficulty, 'every example row names a difficulty');
  }

  // 3. The renderer copy is byte-identical to the shared module.
  const context = vm.createContext({ console });
  const rendererFile = path.join(DIST, 'renderer', 'shared', 'question-template.js');
  assert.ok(fs.existsSync(rendererFile), 'renderer/shared/question-template.js must exist — run npm run build');
  vm.runInContext(fs.readFileSync(rendererFile, 'utf8'), context, { filename: rendererFile });
  const rendererCsv = vm.runInContext('questionTemplateCsv()', context);
  const rendererName = vm.runInContext('QUESTION_TEMPLATE_FILE_NAME', context);
  assert.equal(rendererCsv, csv, 'the renderer template must match the shared module byte for byte');
  assert.equal(rendererName, SHARED.QUESTION_TEMPLATE_FILE_NAME);

  // 4. The renderer copy is itself importable (not just equal as text).
  const rendererQuestions = await importQuestionsFromFile(rendererName, Buffer.from(rendererCsv, 'utf8'));
  assert.equal(rendererQuestions.length, 4);

  console.log('question-template: 4 dòng mẫu nhập được (trắc nghiệm, đúng/sai, điền từ, trả lời ngắn) — bản renderer khớp từng byte');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
