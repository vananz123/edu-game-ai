// ui-classifier-outline-check.js — update_quy_trinh_2 §2/§7 (DECISIONS #113).
//
// Step 2 must recognise four input kinds, show the right message for each, and never
// claim the semantic layer ran when it did not.
//
// Run:
//   npm run build
//   powershell -ExecutionPolicy Bypass -File tests/ui/launch-app.ps1 -Port 9421
//   node tests/ui/ui-classifier-outline-check.js 9421
const { connect } = require('../manual/lib/ui-check-lib');

const LESSON = `Bài 12: Quang hợp ở thực vật

I. Mục tiêu
Sau bài học, học sinh trình bày được khái niệm quang hợp và vai trò của ánh sáng đối với cây xanh.
Học sinh phân tích được mối quan hệ giữa ánh sáng, nước và khí cacbonic trong quá trình quang hợp.

II. Kiến thức trọng tâm
Quang hợp là quá trình thực vật sử dụng năng lượng ánh sáng để tổng hợp chất hữu cơ từ nước và khí cacbonic.
Diệp lục trong lá hấp thụ ánh sáng, chuyển hóa năng lượng ánh sáng thành năng lượng hóa học.`;

const OUTLINE = `I. Mục tiêu
II. Kiến thức trọng tâm
III. Hoạt động dạy học
IV. Củng cố
V. Dặn dò`;

const QUESTIONS = `Câu 1: Thủ đô của Việt Nam là gì?
A. Hà Nội
B. Huế
Đáp án: A
Giải thích: Hà Nội là thủ đô.

Câu 2: 2 + 2 bằng mấy?
A. 3
B. 4
Đáp án: B
Giải thích: Hai cộng hai bằng bốn.`;

(async () => {
  const cdp = await connect();
  const results = [];
  const check = (name, ok, detail) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

  const ipc = await cdp.evaluate(`(async () => {
    const out = {};
    for (const [name, text] of Object.entries({
      lesson: ${JSON.stringify(LESSON)},
      outline: ${JSON.stringify(OUTLINE)},
      questions: ${JSON.stringify(QUESTIONS)}
    })) {
      const r = await window.eduGame.classifyLessonInput({ text });
      out[name] = { kind: r.kind, detected: r.classification.kind, semantic: r.semantic, note: r.semanticNote, reasons: r.classification.reasons || [] };
    }
    return out;
  })()`);

  check('a full lesson is classified as lesson', ipc.lesson.kind === 'lesson', ipc.lesson.detected);
  check('a bare outline is classified as outline', ipc.outline.detected === 'outline', ipc.outline.detected);
  check('an outline still takes the lesson path (no new AI branch)', ipc.outline.kind === 'lesson', ipc.outline.kind);
  check('a question bank is still classified as questions', ipc.questions.kind === 'questions', ipc.questions.kind);
  check('every verdict reports how it was reached', ['confirm', 'flipped', 'unavailable', 'skipped'].includes(ipc.lesson.semantic), ipc.lesson.semantic);
  check('the semantic layer is never claimed when unavailable', ipc.lesson.semantic !== 'unavailable' || /quy tắc/i.test(ipc.lesson.note || ''), `${ipc.lesson.semantic}: ${ipc.lesson.note}`);

  // Step 1 UI: the outline message and the new option.
  const ui = await cdp.evaluate(`(async () => {
    navigate('create-wizard');
    await new Promise(r => setTimeout(r, 400));
    wizardState.text = ${JSON.stringify(OUTLINE)};
    wizardState.documentName = 'dan-y.txt';
    await wizardClassifyInput();
    render();
    await new Promise(r => setTimeout(r, 300));
    const picker = document.querySelector('[data-wizard-input-kind-picker]');
    return {
      text: picker ? picker.textContent.replace(/\\s+/g, ' ') : '',
      options: picker ? [...picker.querySelectorAll('[data-wizard-input-kind]')].map(b => b.dataset.wizardInputKind) : [],
      nextLabel: (document.getElementById('wizardNextBtn') || {}).textContent || '',
      // DECISIONS #132 D14: the branch text lives under the single "Tiếp tục" button.
      nextHint: (document.querySelector('[data-wizard-next-hint]') || {}).textContent || ''
    };
  })()`);
  check('the verdict badge says "Dàn ý / khung sườn"', /Dàn ý \/ khung sườn/.test(ui.text), ui.text.slice(0, 120));
  check('the outline message tells the teacher what they can do', /chưa đủ chi tiết/i.test(ui.text) && /AI phát triển thêm/i.test(ui.text));
  check('there is an explicit outline option', ui.options.includes('outline'), ui.options.join(','));
  check('step 1 has one "Tiếp tục" button', /^Tiếp tục/.test(ui.nextLabel.trim()), ui.nextLabel.trim());
  check('an outline takes the analysis branch, not the import branch', !/câu hỏi có sẵn/.test(ui.nextHint), ui.nextHint.trim());

  // The full lesson must NOT show the outline warning.
  const lessonUi = await cdp.evaluate(`(async () => {
    wizardState.text = ${JSON.stringify(LESSON)};
    await wizardClassifyInput();
    render();
    await new Promise(r => setTimeout(r, 250));
    const picker = document.querySelector('[data-wizard-input-kind-picker]');
    return picker ? picker.textContent.replace(/\\s+/g, ' ') : '';
  })()`);
  check('a written-out lesson shows no outline warning', !/chưa đủ chi tiết/i.test(lessonUi), lessonUi.slice(0, 90));

  // The question bank must still take the AI-free path.
  const questionsUi = await cdp.evaluate(`(async () => {
    wizardState.text = ${JSON.stringify(QUESTIONS)};
    await wizardClassifyInput();
    render();
    await new Promise(r => setTimeout(r, 250));
    return {
      label: (document.getElementById('wizardNextBtn') || {}).textContent || '',
      hint: (document.querySelector('[data-wizard-next-hint]') || {}).textContent || ''
    };
  })()`);
  check('a question bank still takes the "dùng câu hỏi có sẵn" branch', /câu hỏi có sẵn/.test(questionsUi.hint), JSON.stringify(questionsUi));

  // Regression: a short prose sentence must never be "confirmed" into the AI-free
  // question path. Measured in the app before the safety gate: the semantic layer
  // flipped "Quang hợp là quá trình…" to `questions` with zero parsed questions.
  const shortFact = await cdp.evaluate(`(async () => {
    const r = await window.eduGame.classifyLessonInput({ text: 'Quang hợp là quá trình cây xanh tổng hợp chất hữu cơ.' });
    return { detected: r.classification.kind, kind: r.kind, semantic: r.semantic, note: r.semanticNote, imported: r.import ? r.import.questions.length : 0 };
  })()`);
  check('a short prose fact is never flipped into the question path', shortFact.kind !== 'questions', `${shortFact.detected} → ${shortFact.kind} (${shortFact.semantic})`);
  check('the safety gate explains itself instead of silently ignoring the model', /chưa nhận ra câu hỏi nào/i.test(shortFact.note || ''), shortFact.note);

  cdp.ws.close();
  const failed = results.filter(ok => !ok).length;
  console.log(`\n${results.length - failed}/${results.length} classifier outline checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(error => { console.error('check failed:', (error && error.stack) || error); process.exit(2); });
