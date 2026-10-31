// ui-three-game-reactions-check.js — regression guard for the gameplay-driven 3D
// patterns wired into the quiz engine (DECISIONS #139): Destruction (a wrong
// answer shatters a block), Construction (each correct answer grows a tower) and
// Celebration (a completed game bursts confetti), plus the named-event bridge.
//
// What it proves, against a built app started with --remote-debugging-port:
//   - answering wrong   -> the destructible block reports isBroken() === true
//   - answering correct -> the construction tower's stage reaches the correct count
//   - finishing the game -> celebrate() fires and the results screen renders
//   - the named events answer:incorrect / answer:correct / game:completed are emitted
//   - scoring is untouched (0 points for the wrong answer, 100 for the correct one)
//
// Run (a fresh instance — do NOT share with ui-three-game-check.js):
//   npm run build
//   npx electron . --remote-debugging-port=9342
//   node tests/ui/ui-three-game-reactions-check.js 9342
const { check, connect, results } = require('../manual/lib/ui-check-lib');

// Synthetic content only — no real student data (AGENTS.md).
function quizGame(id) {
  const question = (n) => ({
    id: 'q' + n,
    type: 'multiple-choice',
    prompt: 'Cách nào sau đây thể hiện sự tôn trọng bạn mới trong lớp? (câu ' + n + ')',
    contentCategory: 'animals',
    iconName: 'paw-print',
    options: [
      { id: 'a', text: 'Chủ động chào hỏi và lắng nghe bạn' },
      { id: 'b', text: 'Đứng quan sát từ xa' },
      { id: 'c', text: 'Kể chuyện cười thật dài' },
      { id: 'd', text: 'Chờ giáo viên giới thiệu' }
    ],
    correctOptionId: 'a',
    correctAnswer: '',
    explanation: 'Chào hỏi chủ động là bước đầu tiên của một tình bạn mới.',
    points: 100
  });
  return JSON.stringify({
    id, title: 'Làm quen bạn mới', subject: 'Đạo đức', grade: '4',
    template: 'quiz', description: '', tags: [], sourceName: 'ui-check',
    createdAt: '2026-01-01T00:00:00.000Z',
    gameSetup: { scoringMode: 'cơ bản', illustrationMode: 'auto' },
    questions: [question(1), question(2)]
  });
}

const GAME = quizGame('ui-three-game-reactions');

/** Wrap the pattern factories + emit once; counters persist for the whole run. */
const SPY = `(() => {
  if (!window.__reactSpy) {
    const origMakeConstruction = window.threeGame.makeConstruction;
    const origMakeDestructible = window.threeGame.makeDestructible;
    const origCelebrate = window.threeGame.celebrate;
    const origEmit = window.threeGame.emit;
    const s = { constructions: [], destructibles: [], celebrate: 0, events: [] };
    window.threeGame.makeConstruction = (...a) => { const o = origMakeConstruction(...a); s.constructions.push(o); return o; };
    window.threeGame.makeDestructible = (...a) => { const o = origMakeDestructible(...a); s.destructibles.push(o); return o; };
    window.threeGame.celebrate = (...a) => { s.celebrate += 1; return origCelebrate(...a); };
    window.threeGame.emit = (ev, d) => { s.events.push(ev); return origEmit(ev, d); };
    window.__reactSpy = s;
  }
  return true;
})()`;

// Play the game and answer question 1 WRONG (option 'b').
const WRONG = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  document.querySelector('[data-play-close]')?.click();
  document.getElementById('modalRoot').innerHTML = '';
  await sleep(200);
  playGame(${GAME});
  await sleep(900);
  document.querySelector('.answer-option[data-answer="b"]').click();
  await sleep(1000);
  const d0 = window.__reactSpy.destructibles[0];
  const c0 = window.__reactSpy.constructions[0];
  return {
    available: window.threeGame.isAvailable(),
    broken: d0 ? d0.isBroken() : null,
    stage0: c0 ? c0.currentStage() : null,
    events: window.__reactSpy.events.slice(),
    answers: state.gameAnswers.length,
    q1points: state.gameAnswers[0] ? state.gameAnswers[0].points : null
  };
})()`;

// Advance to question 2 and answer it CORRECT (option 'a').
const CORRECT = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  document.getElementById('nextQuestionBtn').click();
  await sleep(900);
  document.querySelector('.answer-option[data-answer="a"]').click();
  await sleep(1000);
  const c1 = window.__reactSpy.constructions[1];
  return {
    stage1: c1 ? c1.currentStage() : null,
    answers: state.gameAnswers.length,
    q2points: state.gameAnswers[1] ? state.gameAnswers[1].points : null
  };
})()`;

// Finish the game -> results screen should celebrate.
const FINISH = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  document.getElementById('nextQuestionBtn').click();
  await sleep(1200);
  return {
    celebrate: window.__reactSpy.celebrate,
    events: window.__reactSpy.events.slice(),
    resultsScreen: Boolean(document.querySelector('.result-screen'))
  };
})()`;

(async () => {
  const ctx = await connect();
  const { evaluate } = ctx;

  await evaluate(SPY);

  console.log('\n=== three.js quiz reactions (gameplay-driven) ===');

  const wrong = await evaluate(WRONG);
  check('WebGL is available in Electron', wrong.available === true, `isAvailable=${wrong.available}`);
  check('a wrong answer shatters the destructible block', wrong.broken === true, `isBroken=${wrong.broken}`);
  check('the construction tower stays at stage 0 before any correct answer', wrong.stage0 === 0, `stage=${wrong.stage0}`);
  check('answer:incorrect is emitted', wrong.events.includes('answer:incorrect'), JSON.stringify(wrong.events));
  check('scoring unchanged on a wrong answer (0 points)', wrong.q1points === 0, `points=${wrong.q1points}`);

  const correct = await evaluate(CORRECT);
  check('a correct answer grows the tower to stage 1', correct.stage1 === 1, `stage=${correct.stage1}`);
  check('scoring unchanged on a correct answer (100 points)', correct.q2points === 100, `points=${correct.q2points}`);
  check('two answers recorded (one per question)', correct.answers === 2, `${correct.answers} answers`);

  const finish = await evaluate(FINISH);
  check('game completion triggers celebration', finish.celebrate >= 1, `${finish.celebrate} celebrate(s)`);
  check('answer:correct and game:completed are emitted',
    finish.events.includes('answer:correct') && finish.events.includes('game:completed'),
    JSON.stringify(finish.events));
  check('the results screen renders after the game', finish.resultsScreen === true);

  await evaluate(`(async () => {
    document.querySelector('[data-play-close]')?.click();
    document.getElementById('modalRoot').innerHTML = '';
    return true;
  })()`);

  const failed = results.filter(r => !r.ok);
  console.log(`\nui-three-game-reactions-check: ${results.length - failed.length}/${results.length} checks passed`);
  ctx.ws.close();
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('ERROR: ' + e.message); process.exit(1); });
