// ui-three-game-check.js — regression guard for the shared Three.js presentation
// layer (DECISIONS #137) wired into the quiz engine.
//
// What it proves, against a built app started with --remote-debugging-port:
//   WebGL on  -> a pointer-transparent canvas mounts behind the stage, the
//                gameplay -> 3D bridge fires (burst on answer), and the lifecycle
//                mounts once per question and unmounts on next + close (no leak).
//   WebGL off -> the 2D surface still renders, no canvas, no crash.
//
// Run:
//   npm run build
//   npx electron . --remote-debugging-port=9341
//   node tests/ui/ui-three-game-check.js 9341
const { check, connect, results } = require('../manual/lib/ui-check-lib');

// Synthetic content only — no real student data (AGENTS.md).
function quizGame(id, questionCount) {
  const questions = Array.from({ length: questionCount }, (_, n) => ({
    id: 'q' + (n + 1),
    type: 'multiple-choice',
    prompt: 'Cách nào sau đây thể hiện sự tôn trọng bạn mới trong lớp? (câu ' + (n + 1) + ')',
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
  }));
  return JSON.stringify({
    id, title: 'Làm quen bạn mới', subject: 'Đạo đức', grade: '4',
    template: 'quiz', description: '', tags: [], sourceName: 'ui-check',
    createdAt: '2026-01-01T00:00:00.000Z',
    gameSetup: { scoringMode: 'cơ bản', illustrationMode: 'auto' },
    questions
  });
}

// Two questions so "Tiếp tục →" exercises the unmount-then-remount path.
const GAME = quizGame('ui-three-game', 2);

/** Install mount/unmount counters once; they persist for the whole run. */
const SPY = `(() => {
  if (!window.__threeSpy) {
    const origMount = window.threeGame.mount;
    const origUnmount = window.threeGame.unmount;
    const c = { mounts: 0, unmounts: 0 };
    window.threeGame.mount = (...a) => { c.mounts += 1; return origMount(...a); };
    window.threeGame.unmount = (...a) => { c.unmounts += 1; return origUnmount(...a); };
    window.__threeSpy = c;
  }
  return true;
})()`;

const OPEN = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  document.querySelector('[data-play-close]')?.click();
  document.getElementById('modalRoot').innerHTML = '';
  await sleep(200);
  playGame(${GAME});
  await sleep(900);
  const canvas = document.querySelector('.game-stage canvas');
  const cs = canvas ? getComputedStyle(canvas) : null;
  return {
    available: window.threeGame.isAvailable(),
    stage: Boolean(document.querySelector('.game-stage')),
    option: Boolean(document.querySelector('.answer-option')),
    canvas: Boolean(canvas),
    pointerEvents: cs ? cs.pointerEvents : null,
    zIndex: cs ? cs.zIndex : null,
    position: cs ? cs.position : null,
    spy: window.__threeSpy
  };
})()`;

const ANSWER = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const orig = window.threeGame.burst;
  let burstCalls = 0;
  window.threeGame.burst = (...a) => { burstCalls += 1; return orig(...a); };
  document.querySelector('.answer-option').click();
  await sleep(900);
  window.threeGame.burst = orig;
  const fb = document.querySelector('#answerFeedback');
  return {
    burstCalls,
    answers: state.gameAnswers.length,
    feedbackGood: fb ? fb.classList.contains('good') : null,
    canvas: Boolean(document.querySelector('.game-stage canvas'))
  };
})()`;

const NEXT = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  document.getElementById('nextQuestionBtn').click();
  await sleep(900);
  return {
    canvases: document.querySelectorAll('.game-stage canvas').length,
    question: Boolean(document.querySelector('.stage-question')),
    spy: window.__threeSpy
  };
})()`;

const CLOSE = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  document.querySelector('[data-play-close]')?.click();
  await sleep(500);
  return {
    canvas: Boolean(document.querySelector('.game-stage canvas')),
    modal: Boolean(document.querySelector('.modal-backdrop')),
    spy: window.__threeSpy
  };
})()`;

const FALLBACK = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const proto = HTMLCanvasElement.prototype;
  const origGetContext = proto.getContext;
  proto.getContext = function () { return null; };
  try {
    document.querySelector('[data-play-close]')?.click();
    document.getElementById('modalRoot').innerHTML = '';
    await sleep(200);
    playGame(${GAME});
    await sleep(700);
    return {
      available: window.threeGame.isAvailable(),
      stage: Boolean(document.querySelector('.game-stage')),
      option: Boolean(document.querySelector('.answer-option')),
      canvas: Boolean(document.querySelector('.game-stage canvas'))
    };
  } finally {
    proto.getContext = origGetContext;
  }
})()`;

(async () => {
  const ctx = await connect();
  const { evaluate } = ctx;

  await evaluate(SPY);

  // ------------------------------------------------------ WebGL-on path ----
  console.log('\n=== three.js quiz (WebGL on) ===');
  const opened = await evaluate(OPEN);
  check('WebGL is available in Electron', opened.available === true, `isAvailable=${opened.available}`);
  check('play surface opened with DOM answers', Boolean(opened.stage && opened.option), JSON.stringify({ stage: opened.stage, option: opened.option }));
  check('a 3D canvas mounts behind the stage', opened.canvas === true);
  check('canvas is pointer-transparent (never blocks answers)', opened.pointerEvents === 'none', opened.pointerEvents);
  check('canvas sits at z-index 0 (behind the DOM)', opened.zIndex === '0', opened.zIndex);
  check('canvas is absolutely positioned within the stage', opened.position === 'absolute', opened.position);
  check('one mount per question', opened.spy.mounts === 1 && opened.spy.unmounts === 0,
    `mounts=${opened.spy.mounts} unmounts=${opened.spy.unmounts}`);

  const answered = await evaluate(ANSWER);
  check('answering fires the 3D burst (gameplay -> 3D bridge)', answered.burstCalls >= 1, `${answered.burstCalls} burst(s)`);
  check('scoring is unchanged (one answer recorded)', answered.answers === 1, `${answered.answers} answers`);
  check('correct answer still marks green feedback', answered.feedbackGood === true, String(answered.feedbackGood));
  check('canvas survives the answer', answered.canvas === true);

  const next = await evaluate(NEXT);
  check('second question renders', next.question === true);
  check('exactly one canvas after advancing (no leak)', next.canvases === 1, `${next.canvases} canvas(es)`);
  check('advancing unmounts the old scene then remounts', next.spy.mounts === 2 && next.spy.unmounts === 1,
    `mounts=${next.spy.mounts} unmounts=${next.spy.unmounts}`);

  const closed = await evaluate(CLOSE);
  check('closing removes the canvas', closed.canvas === false);
  check('closing unmounts the scene', closed.spy.unmounts === 2, `unmounts=${closed.spy.unmounts}`);

  // ------------------------------------------------------ WebGL-off path ----
  console.log('\n=== three.js quiz (WebGL off fallback) ===');
  const fb = await evaluate(FALLBACK);
  check('WebGL-off reports unavailable', fb.available === false, `isAvailable=${fb.available}`);
  check('2D surface still renders without WebGL', Boolean(fb.stage && fb.option), JSON.stringify({ stage: fb.stage, option: fb.option }));
  check('no canvas is attached without WebGL', fb.canvas === false);

  await evaluate(`(async () => {
    document.querySelector('[data-play-close]')?.click();
    document.getElementById('modalRoot').innerHTML = '';
    return true;
  })()`);

  const failed = results.filter(r => !r.ok);
  console.log(`\nui-three-game-check: ${results.length - failed.length}/${results.length} checks passed`);
  ctx.ws.close();
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('ERROR: ' + e.message); process.exit(1); });
