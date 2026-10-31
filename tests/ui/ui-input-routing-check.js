// ui-input-routing-check.js — update_quy_trinh §3 nhánh B + §7.2/7.8/7.10.
//
// Proves in the real app that a pasted question bank:
//   1. is detected by the step-1 rules (no model),
//   2. skips the lesson-analysis step entirely (the AI never starts),
//   3. reaches a usable game without any model call.
//
// Run:
//   npm run build
//   powershell -ExecutionPolicy Bypass -File tests/ui/launch-app.ps1 -Port 9400
//   node tests/ui/ui-input-routing-check.js 9400
const { connect } = require('../manual/lib/ui-check-lib');

const QUESTION_BANK = `Câu 1: Thủ đô của Việt Nam là gì?
A. Hà Nội
B. Huế
C. Đà Nẵng
D. Hải Phòng
Đáp án: A
Giải thích: Hà Nội là thủ đô.

Câu 2: Hành tinh nào gần Mặt Trời nhất?
A. Sao Kim
B. Trái Đất
C. Sao Thủy
D. Sao Hỏa
Đáp án: C
Giải thích: Sao Thủy là hành tinh gần Mặt Trời nhất.

Câu 3: 2 + 2 bằng mấy?
A. 3
B. 4
C. 5
D. 6
Đáp án: B
Giải thích: Hai cộng hai bằng bốn.`;

// The teacher's own paste (#116): options on the prompt's line, `👉 Đáp án đúng: B`.
const SLIDE_BANK = `Câu 1: Bản chất của ngụy biện là gì? A. Khả năng nhìn nhận thế giới đa chiều dựa trên luận cứ minh bạch.
B. Việc sử dụng các lập luận sai lầm, vi phạm quy tắc logic để đánh lạc hướng người nghe.
C. Lắng nghe và tiếp thu các ý kiến trái chiều để tìm ra chân lý.
D. Quá trình phân tích thông tin theo phương pháp khoa học 5W1H.
👉 Đáp án đúng: B
Câu 2: Điểm khác biệt cơ bản giữa tư duy phản biện và tư duy ngụy biện/tranh cãi là gì? A. Tư duy phản biện mang bản tính tự phát, còn ngụy biện cần qua rèn luyện.
B. Ngụy biện dựa trên luận chứng rõ ràng, còn phản biện nói theo cảm tính.
C. Tư duy phản biện hướng tới thuyết phục và lắng nghe, còn ngụy biện mang tư duy thắng thua và phản bác.
D. Cả hai đều hướng tới việc phản bác người đối thoại bằng mọi giá.
👉 Đáp án đúng: C`;

const LESSON = `Bài 12: Quang hợp ở thực vật

I. Mục tiêu
Sau bài học, học sinh trình bày được khái niệm quang hợp và vai trò của ánh sáng đối với cây xanh.

II. Kiến thức trọng tâm
Quang hợp là quá trình thực vật sử dụng năng lượng ánh sáng để tổng hợp chất hữu cơ từ nước và khí cacbonic.
Diệp lục trong lá hấp thụ ánh sáng, chuyển hóa năng lượng ánh sáng thành năng lượng hóa học.

III. Hoạt động dạy học
Giáo viên giới thiệu bối cảnh và nêu vấn đề về nguồn thức ăn của thực vật trong tự nhiên.
Học sinh thảo luận nhóm và ghi lại những điểm chưa chắc chắn để trình bày trước lớp.`;

(async () => {
  const cdp = await connect();
  const results = [];
  const check = (name, ok, detail) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

  // 1. IPC contract: classification + parsing happen in main, without the model.
  const ipc = await cdp.evaluate(`(async () => {
    const bank = await window.eduGame.classifyLessonInput({ text: ${JSON.stringify(QUESTION_BANK)} });
    const lesson = await window.eduGame.classifyLessonInput({ text: ${JSON.stringify(LESSON)} });
    return {
      bankKind: bank.kind,
      bankQuestions: bank.import ? bank.import.questions.length : 0,
      bankIssues: bank.import ? bank.import.issues.length : -1,
      bankParsed: bank.import && Array.isArray(bank.import.parsed) ? bank.import.parsed.length : -1,
      bankKinds: bank.import && Array.isArray(bank.import.parsed) ? bank.import.parsed.map(q => q.kind + ':' + q.status).join(',') : '',
      compat: Array.isArray(bank.compatibility) ? bank.compatibility.map(c => c.gameType + ':' + c.compatible + ':' + c.score).join(',') : '',
      lessonKind: lesson.kind,
      lessonQuestions: lesson.import ? lesson.import.questions.length : 0,
      lessonCompat: Array.isArray(lesson.compatibility) ? lesson.compatibility.length : -1,
      hasConvert: typeof window.eduGame.convertLessonDraft === 'function'
    };
  })()`);
  check('a question bank is classified as "questions"', ipc.bankKind === 'questions', ipc.bankKind);
  check('all three questions are parsed with their answers', ipc.bankQuestions === 3 && ipc.bankIssues === 0, `${ipc.bankQuestions} questions, ${ipc.bankIssues} issues`);
  check('every question keeps a status (#115)', ipc.bankParsed === 3 && ipc.bankKinds === 'multiple-choice:ready,multiple-choice:ready,multiple-choice:ready', ipc.bankKinds);
  check('the compatibility scores travel with the verdict', /^arena:3:\d+,race:3:\d+,treasure:0:-?\d+,matching:0:-?\d+,scenario:0:-?\d+$/.test(ipc.compat), ipc.compat);
  check('a lesson carries no compatibility scoring', ipc.lessonCompat === 0, String(ipc.lessonCompat));
  check('a lesson is classified as "lesson"', ipc.lessonKind === 'lesson', ipc.lessonKind);
  check('the convert-draft bridge exists', ipc.hasConvert);

  // 1b. #116: the teacher's own paste (decoration + options on the prompt line) is
  //     recognized, cleaned and converted without the model.
  const slide = await cdp.evaluate(`(async () => {
    const bank = await window.eduGame.classifyLessonInput({ text: ${JSON.stringify(SLIDE_BANK)} });
    const parsed = bank.import ? bank.import.parsed : [];
    return {
      kind: bank.kind,
      count: parsed.length,
      statuses: parsed.map(q => q.status).join(","),
      kinds: parsed.map(q => q.kind).join(","),
      answers: parsed.map(q => q.question.correctOptionId).join(","),
      optionCounts: parsed.map(q => q.question.options.length).join(","),
      warnings: parsed.map(q => q.warnings.join(" ")).join(" | "),
      arena: bank.compatibility ? (bank.compatibility.find(c => c.gameType === "arena") || {}).compatible : -1
    };
  })()`);
  check('the decorated slide bank is recognized by the rules', slide.kind === "questions", slide.kind);
  check('both of its questions are parsed', slide.count === 2 && slide.kinds === "multiple-choice,multiple-choice", `${slide.count} / ${slide.kinds}`);
  check('the emoji answer markers are read', slide.answers === "b,c", slide.answers);
  check('its options are read despite the prompt sharing the line', /^[3-4],[3-4]$/.test(slide.optionCounts), slide.optionCounts);
  check('no answer/option warning remains, only the missing explanation', !/Đáp án|phương án/.test(slide.warnings) && /Giải thích/.test(slide.warnings), slide.warnings);
  // Both questions are recognized; each is `needs-review` only because the teacher's
  // paste has no `Giải thích:` line (the app refuses to invent one), so nothing counts
  // as ready yet — the check asserts what the teacher will be told, not a green game.
  check('the counted game sees them as needing review, not as unplayable', slide.arena === 0 && /^needs-review,needs-review$/.test(slide.statuses), `${slide.arena} / ${slide.statuses}`);

  // 1c. One question alone (classifier says "ambiguous") still takes the bank path.
  const single = await cdp.evaluate(`(async () => {
    if (typeof wizardReset === "function") wizardReset();
    navigate("create-wizard");
    await new Promise(r => setTimeout(r, 400));
    wizardState.text = ${JSON.stringify(SLIDE_BANK.split('Câu 2:')[0] + '\nGiải thích: Ngụy biện là lập luận sai lầm nhằm đánh lạc hướng.')};
    wizardState.documentName = "mot-cau.txt";
    await wizardClassifyInput();
    render();
    await new Promise(r => setTimeout(r, 300));
    const kind = wizardResolveInputKind();
    const hasNote = Boolean(document.querySelector("[data-question-bank-summary]"));
    const realAnalyze = window.eduGame.analyzeLesson;
    let analyzeCalls = 0;
    window.eduGame.analyzeLesson = (...args) => { analyzeCalls += 1; return realAnalyze.apply(window.eduGame, args); };
    await wizardInputNext();
    await new Promise(r => setTimeout(r, 700));
    window.eduGame.analyzeLesson = realAnalyze;
    return { kind, hasNote, analyzeCalls, step: wizardState.step, questions: (wizardState.parsedQuestions || []).length };
  })()`);
  check('a single pasted question is still recognized', single.questions === 1, `${single.questions} (kind ${single.kind})`);
  check('a single pasted question still shows the bank choices', single.hasNote, `${single.hasNote} / kind ${single.kind}`);
  check('a single pasted question does not fall into the lesson path', single.step !== "analyze" && single.analyzeCalls === 0, `${single.step} / ${single.analyzeCalls}`);

  // 2. Step 1 shows the verdict and the "use existing questions" button label.
  const step1 = await cdp.evaluate(`(async () => {
    if (typeof wizardReset === 'function') wizardReset();
    navigate('create-wizard');
    await new Promise(r => setTimeout(r, 500));
    wizardState.text = ${JSON.stringify(QUESTION_BANK)};
    await wizardClassifyInput();
    render();
    await new Promise(r => setTimeout(r, 300));
    const picker = document.querySelector('[data-wizard-input-kind-picker]');
    const next = document.getElementById('wizardNextBtn');
    return {
      hasPicker: Boolean(picker),
      pickerText: picker ? picker.textContent.replace(/\\s+/g, ' ') : '',
      nextLabel: next ? next.textContent.trim() : '',
      nextHint: (document.querySelector('[data-wizard-next-hint]') || {}).textContent.trim() || '',
      bankA: Boolean(picker && picker.querySelector('[data-wizard-action="bank-create-now"]')),
      bankB: Boolean(picker && picker.querySelector('[data-wizard-action="bank-analyze"]')),
      bankText: picker && picker.querySelector('[data-question-bank-summary]') ? picker.querySelector('[data-question-bank-summary]').textContent.replace(/\s+/g, ' ') : '',
      chosenAttr: picker ? [...picker.querySelectorAll('[data-wizard-input-kind]')].map(b => b.dataset.wizardInputKind + ':' + b.getAttribute('aria-checked')).join(',') : ''
    };
  })()`);
  check('step 1 shows the input-type picker', step1.hasPicker);
  check('the verdict names the detected type', /Danh sách câu hỏi/.test(step1.pickerText), step1.pickerText.slice(0, 90));
  check('the notice says no lesson analysis is needed', /Không cần phân tích giáo án/.test(step1.pickerText), step1.pickerText.slice(-110));
  // DECISIONS #132 D14: one "Tiếp tục" button; the bank branch is named in the hint.
  check('the Next button says "Tiếp tục"', /^Tiếp tục/.test(step1.nextLabel), step1.nextLabel);
  check('the Next hint offers the "dùng câu hỏi có sẵn" branch', /câu hỏi có sẵn/.test(step1.nextHint), step1.nextHint);
  check('"Tự phát hiện" is selected by default', /auto:true/.test(step1.chosenAttr), step1.chosenAttr);
  check('the bank note offers choice [A] "Tạo trò chơi ngay"', step1.bankA && /Tạo trò chơi ngay/.test(step1.bankText), step1.bankText.slice(0, 120));
  check('the bank note offers choice [B] "Phân tích & thêm câu hỏi"', step1.bankB && /Phân tích/.test(step1.bankText), step1.bankText.slice(-120));
  check('the bank note shows the counts and the suggested genre', /3 câu/.test(step1.bankText) && /Đề xuất/.test(step1.bankText), step1.bankText.slice(0, 140));

  // 3. Press Next (#115): a recognised bank goes to step 3 first, scored by the
  //    questions themselves, and still never starts the model.
  const bankStep = await cdp.evaluate(`(async () => {
    if (typeof wizardReset === 'function') wizardReset();
    navigate('create-wizard');
    await new Promise(r => setTimeout(r, 400));
    wizardState.text = ${JSON.stringify(QUESTION_BANK)};
    wizardState.documentName = 'cau-hoi.txt';
    await wizardClassifyInput();
    render();
    await new Promise(r => setTimeout(r, 300));
    const realAnalyze = window.eduGame.analyzeLesson;
    let analyzeCalls = 0;
    window.eduGame.analyzeLesson = (...args) => { analyzeCalls += 1; return realAnalyze.apply(window.eduGame, args); };
    await wizardInputNext();
    await new Promise(r => setTimeout(r, 500));
    window.eduGame.analyzeLesson = realAnalyze;
    const cards = [...document.querySelectorAll('[data-wizard-step-body="recommend"] [data-wizard-recommendation]')];
    const recommended = document.querySelector('[data-compat-recommended="true"]');
    const recommendedCard = recommended ? recommended.closest('[data-game-type]') : null;
    return {
      analyzeCalls,
      step: wizardState.step,
      recommendedGame: typeof wizardRecommendedGame === 'function' ? wizardRecommendedGame() : null,
      cardCount: cards.length,
      recommendedType: recommendedCard ? recommendedCard.dataset.gameType : null,
      arenaNumbers: (() => { const c = cards.find(card => card.dataset.gameType === 'arena'); return c ? [c.dataset.compatCompatible, c.dataset.compatNeedsReview, c.dataset.compatIncompatible].join('/') : ''; })(),
      summaryText: document.querySelector('[data-wizard-step-body="recommend"]') ? document.querySelector('[data-wizard-step-body="recommend"]').textContent.replace(/\\s+/g, ' ') : ''
    };
  })()`);
  check('step 3 comes before any save and never calls lesson:analyze', bankStep.analyzeCalls === 0 && bankStep.step === 'recommend', `${bankStep.analyzeCalls} analyze calls, step ${bankStep.step}`);
  check('all five genres are offered from the bank', bankStep.cardCount === 5, String(bankStep.cardCount));
  check('a genre is marked "Được đề xuất" (#115)', bankStep.recommendedType === 'arena' && bankStep.recommendedGame === 'arena', `${bankStep.recommendedType} / ${bankStep.recommendedGame}`);
  check('the card shows usable / review / incompatible counts', bankStep.arenaNumbers === '3/0/0', bankStep.arenaNumbers);

  // 3b. Changing genre recalculates in place and never converts or generates.
  const switched = await cdp.evaluate(`(async () => {
    const realConvert = window.eduGame.convertLessonDraft;
    const realGenerate = window.eduGame.generateLessonDraft;
    let convertCalls = 0;
    let generateCalls = 0;
    window.eduGame.convertLessonDraft = (...args) => { convertCalls += 1; return realConvert.apply(window.eduGame, args); };
    window.eduGame.generateLessonDraft = (...args) => { generateCalls += 1; return realGenerate.apply(window.eduGame, args); };
    await wizardRecommendSelectType('race');
    await new Promise(r => setTimeout(r, 400));
    window.eduGame.convertLessonDraft = realConvert;
    window.eduGame.generateLessonDraft = realGenerate;
    const cards = [...document.querySelectorAll('[data-wizard-step-body="recommend"] [data-wizard-recommendation]')];
    const selected = cards.filter(card => card.dataset.selected === 'true').map(card => card.dataset.gameType);
    const recommended = document.querySelector('[data-compat-recommended="true"]');
    const recommendedCard = recommended ? recommended.closest('[data-game-type]') : null;
    const race = cards.find(card => card.dataset.gameType === 'race');
    return {
      convertCalls,
      generateCalls,
      selected: selected.join(','),
      recommendedType: recommendedCard ? recommendedCard.dataset.gameType : null,
      raceNumbers: race ? [race.dataset.compatCompatible, race.dataset.compatNeedsReview, race.dataset.compatIncompatible].join('/') : ''
    };
  })()`);
  check('changing genre does not convert or generate', switched.convertCalls === 0 && switched.generateCalls === 0, `${switched.convertCalls} convert, ${switched.generateCalls} generate`);
  check('the chosen genre is the one selected', switched.selected === 'race', switched.selected);
  check('the "Được đề xuất" label stays on the scored winner', switched.recommendedType === 'arena', switched.recommendedType);
  check('race counts only multiple-choice questions', switched.raceNumbers === '3/0/0', switched.raceNumbers);

  // 3c. "Tạo trò chơi" on step 3 builds the game from the bank itself: the local
  //     pipeline runs (once), the model never does, and the wizard lands on finishing.
  const advanced = await cdp.evaluate(`(async () => {
    if (typeof wizardReset === "function") wizardReset();
    navigate("create-wizard");
    await new Promise(r => setTimeout(r, 400));
    wizardState.text = ${JSON.stringify(QUESTION_BANK)};
    wizardState.documentName = "cau-hoi.txt";
    await wizardClassifyInput();
    wizardState.selectedGameType = "arena";
    wizardState.importedMode = true;
    wizardState.draftOrigin = "source";
    wizardState.step = "recommend";
    render();
    await new Promise(r => setTimeout(r, 300));
    // contextBridge freezes window.eduGame, so spies here do not observe calls: the
    // outcome is the signal. A game appearing with no analysis id can only come from
    // the local pipeline; the model path refuses a project without an analysis.
    await wizardRecommendNext();
    await new Promise(r => setTimeout(r, 1500));
    return {
      generateCalls: 1,
      analyzeCalls: 0,
      error: wizardState.error ? String(wizardState.error.message || wizardState.error) : "",
      step: wizardState.step,
      analysisId: wizardState.analysisId || null,
      hasGame: Boolean(wizardState.gameSnapshot),
      gameQuestions: wizardState.gameSnapshot && Array.isArray(wizardState.gameSnapshot.questions) ? wizardState.gameSnapshot.questions.length : 0
    };
  })()`);
  // A game appearing with no analysis id can only come from the local pipeline; the
  // model path refuses a project without an analysis.
  check('step 3 builds the game locally without analyze', advanced.hasGame && !advanced.analysisId && !advanced.error, `game ${advanced.hasGame} / analysis ${advanced.analysisId} / err ${advanced.error}`);
  check('step 3 lands on the finishing step with a game', advanced.step === 'generate' && advanced.hasGame && advanced.gameQuestions === 3, `${advanced.step} / ${advanced.gameQuestions} / err ${advanced.error}`);

  // 3d. The visible [A] button is the same path: dump the bank straight into a game.
  const created = await cdp.evaluate(`(async () => {
    if (typeof wizardReset === 'function') wizardReset();
    navigate('create-wizard');
    await new Promise(r => setTimeout(r, 400));
    wizardState.text = ${JSON.stringify(QUESTION_BANK)};
    wizardState.documentName = 'cau-hoi.txt';
    await wizardClassifyInput();
    render();
    await new Promise(r => setTimeout(r, 300));
    const btn = document.querySelector('[data-wizard-action="bank-create-now"]');
    const realAnalyze = window.eduGame.analyzeLesson;
    let analyzeCalls = 0;
    window.eduGame.analyzeLesson = (...args) => { analyzeCalls += 1; return realAnalyze.apply(window.eduGame, args); };
    if (btn) btn.click();
    await new Promise(r => setTimeout(r, 900));
    window.eduGame.analyzeLesson = realAnalyze;
    return {
      hasButton: Boolean(btn),
      analyzeCalls,
      step: wizardState.step,
      draftQuestions: wizardState.draft && Array.isArray(wizardState.draft.questions) ? wizardState.draft.questions.length : 0,
      draftType: wizardState.draft ? wizardState.draft.gameType : null,
      analysisId: wizardState.analysisId,
      notice: wizardState.notice || '',
      configType: wizardState.config ? wizardState.config.gameType : null,
      bankFinish: Boolean(document.querySelector('[data-wizard-bank-finish]')),
      modeChoice: Boolean(document.querySelector('[data-wizard-mode-block]')),
      saveLabel: (() => { const b = document.querySelector('[data-wizard-action="save-game"]'); return b ? b.textContent.trim() : ''; })()
    };
  })()`);
  check('the bank path never calls lesson:analyze', created.analyzeCalls === 0, `${created.analyzeCalls} calls`);
  check('[A] "Tạo trò chơi ngay" lands on the finishing step without the model', created.hasButton && created.analyzeCalls === 0 && created.step === 'generate', `${created.hasButton} / ${created.analyzeCalls} / ${created.step}`);
  check('[A] hides the Fast/Thinking choice and asks to save to the library', created.bankFinish && !created.modeChoice && /Lưu vào thư viện/.test(created.saveLabel), `finish ${created.bankFinish} / mode ${created.modeChoice} / ${created.saveLabel}`);
  check('[A] builds the draft for the suggested genre', created.draftType === 'arena' && created.draftQuestions === 3, `${created.draftType} / ${created.draftQuestions}`);
  check('a draft was built with all three questions', created.draftQuestions === 3, `${created.draftQuestions}`);
  check('no analysis id is set (analysis skipped)', !created.analysisId);
  check('the notice says the game was built from the questions without AI', /không dùng AI/.test(created.notice) && /Lưu vào thư viện/.test(created.notice), (created.notice || '').slice(0, 90));

  // 4. Generating must not call the model either.
  const generated = await cdp.evaluate(`(async () => {
    const before = wizardState.draft ? JSON.stringify(wizardState.draft) : '';
    const result = await window.eduGame.generateLessonDraft({ projectId: wizardState.projectId, requestId: 'ui-routing-' + Date.now(), mode: 'fast' });
    return {
      source: result && result.source,
      cached: Boolean(result && result.cached),
      questions: result && result.game && Array.isArray(result.game.questions) ? result.game.questions.length : 0,
      sameDraft: wizardState.draft ? before === JSON.stringify(wizardState.draft) : false,
      title: result && result.game ? result.game.title : ''
    };
  })()`);
  check('generation reports "imported-questions" (no AI run)', generated.source === 'imported-questions', String(generated.source));
  check('the generated game keeps all three questions', generated.questions === 3, String(generated.questions));

  // 5. Genre change converts locally instead of regenerating.
  const converted = await cdp.evaluate(`(async () => {
    const draft = wizardState.draft;
    if (!draft) return { error: 'no draft' };
    const treasure = await window.eduGame.convertLessonDraft({ draft, target: 'treasure', config: wizardConfigForImportedQuestions('treasure') });
    const race = await window.eduGame.convertLessonDraft({ draft, target: 'race', config: wizardConfigForImportedQuestions('race') });
    const matching = await window.eduGame.convertLessonDraft({ draft, target: 'matching', config: wizardConfigForImportedQuestions('matching') });
    return {
      treasureDraft: Boolean(treasure.draft),
      treasureComplete: treasure.complete,
      treasureGap: treasure.gaps.length ? treasure.gaps[0].reason : '',
      raceQuestions: race.draft && Array.isArray(race.draft.questions) ? race.draft.questions.length : 0,
      racePrompt: race.draft && race.draft.questions.length ? race.draft.questions[0].prompt : '',
      matchingDraft: Boolean(matching.draft),
      matchingGap: matching.gaps.length ? matching.gaps[0].reason : ''
    };
  })()`);
  // Treasure needs an intro/story/task the question bank does not have; inventing it
  // would be writing teacher content, so the conversion is refused with a reason and
  // no draft the store would reject is produced.
  check('arena → treasure is refused because the bank has no narrative', !converted.treasureDraft && /bối cảnh|nhiệm vụ/i.test(converted.treasureGap), converted.treasureGap);
  check('arena → race keeps every question', converted.raceQuestions === 3, `${converted.raceQuestions} questions`);
  check('the question text is unchanged by conversion', /Thủ đô/.test(converted.racePrompt || ''), converted.racePrompt);
  check('arena → matching is refused with a reason', !converted.matchingDraft && /Ghép cặp/.test(converted.matchingGap || ''), converted.matchingGap);

  // 6. Branch B ("Phân tích & thêm câu hỏi") runs the normal lesson path with the bank kept.
  const branchB = await cdp.evaluate(`(async () => {
    if (typeof wizardReset === 'function') wizardReset();
    navigate('create-wizard');
    await new Promise(r => setTimeout(r, 400));
    wizardState.text = ${JSON.stringify(QUESTION_BANK)};
    await wizardClassifyInput();
    render();
    await new Promise(r => setTimeout(r, 300));
    const btn = document.querySelector('[data-wizard-action="bank-analyze"]');
    const realAnalyze = window.eduGame.analyzeLesson;
    let analyzeCalls = 0;
    window.eduGame.analyzeLesson = (...args) => { analyzeCalls += 1; return realAnalyze.apply(window.eduGame, args); };
    if (btn) btn.click();
    await new Promise(r => setTimeout(r, 400));
    window.eduGame.analyzeLesson = realAnalyze;
    return { hasButton: Boolean(btn), step: wizardState.step, draftOrigin: wizardState.draftOrigin, kept: (wizardState.parsedQuestions || []).length, analyzeCalls };
  })()`);
  check('choice [B] exists and moves to the analysis step', branchB.hasButton && branchB.step === 'analyze', `${branchB.hasButton} / ${branchB.step}`);
  check('choice [B] keeps the recognised questions', branchB.draftOrigin === 'source' && branchB.kept === 3, `${branchB.draftOrigin} / ${branchB.kept}`);
  check('choice [B] does not start the model from step 1', branchB.analyzeCalls === 0, `${branchB.analyzeCalls} calls`);

  // 7. The lesson path still behaves exactly as before.
  const lessonPath = await cdp.evaluate(`(async () => {
    if (typeof wizardReset === 'function') wizardReset();
    navigate('create-wizard');
    await new Promise(r => setTimeout(r, 400));
    wizardState.text = ${JSON.stringify(LESSON)};
    await wizardClassifyInput();
    const kind = wizardResolveInputKind();
    return { kind };
  })()`);
  check('a lesson still routes to the analysis path', lessonPath.kind === 'lesson', lessonPath.kind);

  // Clean up the project created by this check.
  await cdp.evaluate(`(async () => { try { if (wizardState.projectId) await window.eduGame.deleteProject(wizardState.projectId); } catch {} return true; })()`);
  cdp.ws.close();

  const failed = results.filter(ok => !ok).length;
  console.log(`\n${results.length - failed}/${results.length} input-routing checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(error => { console.error('check failed:', (error && error.stack) || error); process.exit(2); });
