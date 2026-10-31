/**
 * DECISIONS #116 — cleaning a pasted question bank.
 *
 * The rule is "clean the edges, never the content": decorative symbols in front of a
 * label (👉, ✅, 📌, •, ▶, ※, `*`, `- `) must disappear so the label starts the line,
 * while a symbol the teacher wrote inside a prompt or an option must survive intact.
 */
import assert from 'node:assert/strict';
import {
  cleanQuestionLine,
  cleanQuestionText,
  looksLikeQuestionBankText,
  normalizeQuestionLine,
  stripLeadingSymbols
} from '../../src/services/question-text';

const BANK = `Câu 1: Thủ đô Việt Nam là gì?
A. Hà Nội
B. Huế
👉 Đáp án đúng: A
Giải thích: Hà Nội là thủ đô.

Câu 2: 2 + 2 bằng mấy?
A. 3
B. 4
✅ Đáp án: B
Giải thích: Hai cộng hai bằng bốn.`;

const PROSE = `# Bài 12: Quang hợp

I. Mục tiêu
Sau bài học, học sinh trình bày được khái niệm quang hợp và vai trò của ánh sáng đối với cây xanh.

II. Kiến thức trọng tâm
Quang hợp là quá trình thực vật sử dụng năng lượng ánh sáng để tổng hợp chất hữu cơ từ nước và CO2.

III. Hoạt động dạy học
Giáo viên giới thiệu bối cảnh và nêu vấn đề về nguồn thức ăn của thực vật trong tự nhiên.`;

async function run(): Promise<void> {
  // --- Strip the leading decoration, keep the line otherwise identical ------------
  // `stripLeadingSymbols` works on the symbol class only (emoji, arrows, math marks).
  for (const mark of ['👉', '✅', '📌', '⭐', '▶', '➜', '→']) {
    assert.ok(!stripLeadingSymbols(`${mark} Đáp án: B`).includes(mark), `strips ${mark}`);
  }
  // Punctuation glyphs (`-`, `•`, `※`, `§`, `*`) sit in front of a *label* in most
  // pasted banks; `cleanQuestionLine` removes them there and only there.
  for (const mark of ['👉', '✅', '📌', '⭐', '▶', '➜', '→', '-', '•', '※', '§', '*']) {
    assert.equal(cleanQuestionLine(`${mark} Đáp án: B`), 'Đáp án: B', `cleaned line starts with the label (${mark})`);
  }
  assert.equal(cleanQuestionLine('   ✅ Đáp án: B'), 'Đáp án: B', 'a label line sits at column 0 after cleaning');
  // A run of symbols is removed whole; the width it occupied stays (see below).
  assert.equal(stripLeadingSymbols('👉👉  Đáp án: B'), '    Đáp án: B', 'a run of symbols goes, its width stays');
  assert.equal(stripLeadingSymbols('\u00a0👉 Đáp án: B'), '   Đáp án: B', 'NBSP counts as width');
  assert.equal(cleanQuestionLine('\u00a0👉 Đáp án: B'), 'Đáp án: B', 'a label ends at column 0 after cleaning');
  // `mark + ' '`: the removed symbol leaves one column, which keeps the label where
  // it was. `cleanQuestionLine` then drops a short run before a label (see below).
  assert.equal(stripLeadingSymbols('Đáp án: B'), 'Đáp án: B', 'nothing to strip');

  // Indentation is a parser signal (a wrapped option is deeper than its label), so the
  // width must survive `stripLeadingSymbols`: `   👉 B. Hai` stays deeper than a
  // top-level `B. Hai`. `cleanQuestionLine` then puts a label at column 0, because a
  // pasted option with indent still has to be read as an option.
  assert.equal(stripLeadingSymbols('   👉 B. Hai'), '     B. Hai');
  assert.equal(stripLeadingSymbols('      👉👉 B. Hai'), '          B. Hai');
  assert.equal(cleanQuestionLine('   👉 B. Hai'), 'B. Hai');

  // Content is never touched: a symbol between words stays.
  assert.equal(cleanQuestionLine('Đáp án: 6CO2 + 6H2O → C6H12O6'), 'Đáp án: 6CO2 + 6H2O → C6H12O6');
  assert.equal(cleanQuestionLine('A. Việt Nam → châu Á'), 'A. Việt Nam → châu Á');
  assert.equal(cleanQuestionLine('Câu hỏi về 5 ★ sao?'), 'Câu hỏi về 5 ★ sao?');

  // A symbol in front of a label other than at column 0 (`… ✅ Đáp án: B`).
  assert.equal(cleanQuestionLine('👉 Giải thích: Vì sao'), 'Giải thích: Vì sao');

  // --- The gate: cleaning only a question bank, not a lesson -------------------
  assert.equal(looksLikeQuestionBankText(BANK), true, 'two questions with options is a bank');
  assert.equal(looksLikeQuestionBankText(PROSE), false, 'a lesson is not cleaned');
  assert.equal(looksLikeQuestionBankText('# Bài 12: Quang hợp\nI. Mục tiêu\nA. Nội dung'), false, 'one question is not enough');
  assert.equal(looksLikeQuestionBankText('Câu 1: Một?\nA. Một\nB. Hai'), false, 'a single question keeps its own formatting');

  // A lesson with a decorative heading keeps that heading exactly as written.
  const decoratedLesson = PROSE.replace('I. Mục tiêu', '✅ I. Mục tiêu');
  assert.equal(cleanQuestionText(decoratedLesson), decoratedLesson);
  assert.equal(cleanQuestionText(`${BANK.replace('👉 Đáp án đúng: A', 'Giải thích: Hà Nội.')}`).includes('👉'), false);

  // --- Cleaning a bank ---------------------------------------------------------
  const cleaned = cleanQuestionText(BANK);
  assert.ok(!cleaned.includes('👉'), 'the emoji is gone');
  assert.ok(!cleaned.includes('✅'), 'the check mark is gone');
  assert.match(cleaned, /^Đáp án đúng: A$/m);
  assert.match(cleaned, /^Đáp án: B$/m);
  // Nothing else changed: same number of lines, same content on the others.
  assert.deepEqual(cleaned.split('\n').length, BANK.split('\n').length);
  assert.equal(cleanQuestionText(cleaned), cleaned, 'cleaning is idempotent');

  // Entities are decoded as before, and cleaning does not interfere.
  assert.equal(normalizeQuestionLine('Vì sao&#x20;cây?'), 'Vì sao cây?');
  // Only the entities the shared decoder knows are decoded; an unknown named entity
  // stays exactly as written, so the teacher's text is never mangled.
  assert.equal(cleanQuestionLine('&#272;&#225;p &#225;n: B'), 'Đáp án: B');
  assert.equal(cleanQuestionLine('&aacute;p &aacute;n: B'), 'áp án: B');

  console.log('Question text tests passed');
}

void run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
