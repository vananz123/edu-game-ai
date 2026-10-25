// grading-packaged-check.js — chấm đáp án nhập văn bản trên app ĐÃ ĐÓNG GÓI (app.asar).
// Tái hiện đúng lỗi giáo viên báo: câu 3/6 "đặt câu hỏi" và câu 4/6 danh sách 4 ý.
//
//   "release\win-unpacked\EduGame Studio.exe" --remote-debugging-port=9352
//   node tests/ui/grading-packaged-check.js 9352
const { check, connect } = require('../manual/lib/ui-check-lib');

(async () => {
  await connect();

  const out = await checkGrading();

  check('trailing period is accepted ("Đặt câu hỏi." == "đặt câu hỏi")', out.periodOk === true, out.periodMsg);
  check('exact answer still accepted', out.exactOk === true, out.exactMsg);
  check('wrong answer still marked wrong', out.wrongOk === true, out.wrongMsg);
  check('multi-part answer accepts commas', out.commaOk === true, out.commaMsg);
  check('multi-part answer accepts semicolons', out.semicolonOk === true, out.semicolonMsg);
  check('partial multi-part answer is still wrong', out.partialOk === true, out.partialMsg);
  check('reordered multi-part answer is still wrong', out.reorderOk === true, out.reorderMsg);

  const { results } = require('../manual/lib/ui-check-lib');
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})();

async function checkGrading() {
  const { evaluate } = await connect();
  return evaluate(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const game = {
      id: 'grading-packaged-check', title: 'Chấm đáp án', subject: 'Kỹ năng sống', grade: '6',
      template: 'quiz', description: '', tags: [], sourceName: '', createdAt: new Date().toISOString(),
      gameSetup: { scoringMode: 'cơ bản' },
      questions: [
        { id: 'q3', type: 'fill-in-blank', prompt: 'Đức tính cần có khi học tập là ...', options: [], correctOptionId: '', correctAnswer: 'đặt câu hỏi', explanation: '', points: 100 },
        { id: 'q4', type: 'short-answer', prompt: 'Liệt kê 4 bí quyết tự tin', options: [], correctOptionId: '', correctAnswer: 'Mạnh dạn đặt câu hỏi; Thử lật ngược vấn đề; Trau dồi tri thức; Tự tin là chính mình', explanation: '', points: 100 }
      ]
    };
    const out = {};
    const answer = async (text) => {
      const input = document.querySelector('#textAnswerInput');
      input.value = text;
      document.querySelector('#textAnswerBtn').click();
      await sleep(280);
      const fb = document.querySelector('#answerFeedback');
      const t = fb ? fb.textContent : '';
      const ok = /chính xác/i.test(t) && !/Chưa chính xác/i.test(t);
      const next = document.querySelector('#nextQuestionBtn');
      return { ok, text: t.slice(0, 70) };
    };
    playGame(game, {});
    await sleep(400);

    let r = await answer('Đặt câu hỏi.');
    out.periodOk = r.ok; out.periodMsg = r.text;
    document.querySelector('#nextQuestionBtn').click(); await sleep(300);

    r = await answer('Mạnh dạn đặt câu hỏi, Thử lật ngược vấn đề, Trau dồi tri thức, Tự tin là chính mình');
    out.commaOk = r.ok; out.commaMsg = r.text;

    playGame(game, {});
    await sleep(400);
    document.querySelector('#textAnswerInput').value = 'ai biết';
    document.querySelector('#textAnswerBtn').click(); await sleep(280);
    out.wrongOk = /Chưa chính xác/i.test(document.querySelector('#answerFeedback').textContent);

    playGame(game, {});
    await sleep(400);
    r = await answer('đặt câu hỏi');
    out.exactOk = r.ok; out.exactMsg = r.text;
    document.querySelector('#nextQuestionBtn').click(); await sleep(300);

    r = await answer('Mạnh dạn đặt câu hỏi; Thử lật ngược vấn đề; Trau dồi tri thức; Tự tin là chính mình');
    out.semicolonOk = r.ok; out.semicolonMsg = r.text;

    playGame(game, {});
    await sleep(400);
    document.querySelector('#textAnswerInput').value = 'đặt câu hỏi'; document.querySelector('#textAnswerBtn').click(); await sleep(280);
    document.querySelector('#nextQuestionBtn').click(); await sleep(300);
    r = await answer('Mạnh dạn đặt câu hỏi, Thử lật ngược vấn đề, Trau dồi tri thức');
    out.partialOk = !r.ok; out.partialMsg = r.text;

    playGame(game, {});
    await sleep(400);
    document.querySelector('#textAnswerInput').value = 'đặt câu hỏi'; document.querySelector('#textAnswerBtn').click(); await sleep(280);
    document.querySelector('#nextQuestionBtn').click(); await sleep(300);
    r = await answer('Thử lật ngược vấn đề, Mạnh dạn đặt câu hỏi, Trau dồi tri thức, Tự tin là chính mình');
    out.reorderOk = !r.ok; out.reorderMsg = r.text;

    document.querySelector('[data-play-close]')?.click();
    return out;
  })()`);
}
