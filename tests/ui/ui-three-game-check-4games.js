// ui-three-game-check-4games.js — regression guard for the shared Three.js
// presentation layer (DECISIONS #137) rolled out to matching, treasure-hunt and
// race (DECISIONS #138). The quiz path is covered separately by
// ui-three-game-check.js; scenario inherits the quiz engine and needs no test.
//
// What it proves, against a built app started with --remote-debugging-port:
//   WebGL on  -> each game mounts a pointer-transparent canvas behind its
//                `.game-stage`, a correct answer/correct match fires the burst,
//                scoring is unchanged, and the canvas is unmounted on close
//                (no leak across re-renders).
//   WebGL off -> the 2D surface still renders, no canvas, no crash.
//
// Run:
//   npm run build
//   npx electron . --remote-debugging-port=9341
//   node tests/ui/ui-three-game-check-4games.js 9341
const { check, connect, results } = require('../manual/lib/ui-check-lib');

// Synthetic content only — no real student data (AGENTS.md).
function base(id, title, subject, grade, template, extra) {
  return JSON.stringify(Object.assign({
    id, title, subject, grade, template,
    description: '', tags: [], sourceName: 'ui-check',
    createdAt: '2026-01-01T00:00:00.000Z',
    gameSetup: { scoringMode: 'cơ bản', illustrationMode: 'auto' }
  }, extra));
}

const MATCH_GAME = base('ui-match', 'Ghép cặp từ vựng', 'Tiếng Việt', '2', 'matching', {
  matchingGame: {
    mode: 'columns',
    pairs: [
      { id: 'p1', left: 'Chó', right: 'Sủa gâu gâu' },
      { id: 'p2', left: 'Mèo', right: 'Kêu meo meo' }
    ],
    pointsPerPair: 100, completionBonus: 50, wrongPenalty: 0,
    timeBonus: 0, bonusUnderSeconds: 0, practiceMode: false
  }
});

const TREASURE_GAME = base('ui-treasure', 'Hành trình rừng xanh', 'Khoa học', '3', 'treasure-hunt', {
  treasureHunt: {
    character: 'Nhà thám hiểm', intro: '', journeyBonus: 100, hiddenItemBonus: 50,
    backgroundId: 'forest', characterId: 'explorer',
    stages: [{
      id: 's1', name: 'Rừng rậm', story: '', taskDescription: '',
      question: {
        prompt: 'Loài nào sống dưới nước?',
        options: [{ id: 'a', text: 'Cá' }, { id: 'b', text: 'Chim' }],
        correctOptionId: 'a', explanation: 'Cá sống dưới nước.', hint: ''
      },
      attempts: 0, points: 100, completionBonus: 50, nextStageId: null
    }]
  }
});

const RACE_GAME = base('ui-race', 'Đường đua tri thức', 'Toán', '5', 'race', {
  race: {
    trackLength: 8, maxRounds: 2, stepByDifficulty: false, luckEnabled: false,
    teams: [{ id: 't1', name: 'Đội Đỏ', icon: '🔴' }, { id: 't2', name: 'Đội Xanh', icon: '🔵' }],
    cells: [],
    questions: [{
      id: 'rq1', prompt: '2 + 2 bằng mấy?',
      options: [{ id: 'a', text: '3' }, { id: 'b', text: '4' }],
      correctOptionId: 'b', explanation: '2 + 2 = 4'
    }]
  }
});

/** Install mount/unmount/burst counters once; they persist for the whole run. */
const SPY = `(() => {
  if (!window.__threeSpy) {
    const origMount = window.threeGame.mount;
    const origUnmount = window.threeGame.unmount;
    const origBurst = window.threeGame.burst;
    const c = { mounts: 0, unmounts: 0, bursts: 0 };
    window.threeGame.mount = (...a) => { c.mounts += 1; return origMount(...a); };
    window.threeGame.unmount = (...a) => { c.unmounts += 1; return origUnmount(...a); };
    window.threeGame.burst = (...a) => { c.bursts += 1; return origBurst(...a); };
    window.__threeSpy = c;
  }
  return true;
})()`;

const CLEAR = `document.querySelector('[data-play-close]')?.click();
  document.getElementById('modalRoot').innerHTML = '';`;

// ---------------------------------------------------------------- matching --
const MATCH_OPEN = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  ${CLEAR}
  await sleep(200);
  playGame(${MATCH_GAME});
  await sleep(900);
  const canvas = document.querySelector('.game-stage canvas');
  const cs = canvas ? getComputedStyle(canvas) : null;
  return {
    available: window.threeGame.isAvailable(),
    stage: Boolean(document.querySelector('.game-stage')),
    card: Boolean(document.querySelector('.match-card')),
    canvas: Boolean(canvas),
    pointerEvents: cs ? cs.pointerEvents : null,
    zIndex: cs ? cs.zIndex : null,
    position: cs ? cs.position : null,
    spy: window.__threeSpy
  };
})()`;

const MATCH_CORRECT = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const burstsBefore = window.__threeSpy.bursts;
  document.querySelector('.match-card[data-match-side="left"][data-pair="p1"]').click();
  document.querySelector('.match-card[data-match-side="right"][data-pair="p1"]').click();
  await sleep(700);
  return {
    matched: state.matchingPlay.matched,
    wrong: state.matchingPlay.wrong,
    bursts: window.__threeSpy.bursts - burstsBefore,
    leftMatched: document.querySelector('.match-card[data-match-side="left"][data-pair="p1"]').classList.contains('matched'),
    canvas: Boolean(document.querySelector('.game-stage canvas'))
  };
})()`;

// ---------------------------------------------------------------- treasure --
const TREASURE_OPEN = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  ${CLEAR}
  await sleep(200);
  playGame(${TREASURE_GAME});
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

const TREASURE_CORRECT = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const burstsBefore = window.__threeSpy.bursts;
  document.querySelector('.answer-option[data-answer="a"]').click();
  await sleep(700);
  return {
    answered: state.treasurePlay.answered,
    earned: state.treasurePlay.earned,
    bursts: window.__threeSpy.bursts - burstsBefore,
    correctMarked: document.querySelector('.answer-option[data-answer="a"]').classList.contains('correct'),
    canvas: Boolean(document.querySelector('.game-stage canvas'))
  };
})()`;

// -------------------------------------------------------------------- race --
const RACE_OPEN = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  ${CLEAR}
  await sleep(200);
  playGame(${RACE_GAME});
  await sleep(900);
  const canvas = document.querySelector('.game-stage canvas');
  const cs = canvas ? getComputedStyle(canvas) : null;
  return {
    available: window.threeGame.isAvailable(),
    stage: Boolean(document.querySelector('.game-stage')),
    drawBtn: Boolean(document.querySelector('#drawQuestionBtn')),
    canvas: Boolean(canvas),
    pointerEvents: cs ? cs.pointerEvents : null,
    zIndex: cs ? cs.zIndex : null,
    position: cs ? cs.position : null,
    spy: window.__threeSpy
  };
})()`;

const RACE_DRAW = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  document.querySelector('#drawQuestionBtn').click();
  await sleep(700);
  return {
    answerOptions: document.querySelectorAll('[data-race-answer]').length,
    canvases: document.querySelectorAll('.game-stage canvas').length,
    spy: window.__threeSpy
  };
})()`;

const RACE_ANSWER = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const burstsBefore = window.__threeSpy.bursts;
  document.querySelector('[data-race-answer="b"]').click();
  await sleep(700);
  return {
    progress: state.racePlay.teams[0].progress,
    points: state.racePlay.teams[0].points,
    answered: state.racePlay.answered,
    bursts: window.__threeSpy.bursts - burstsBefore,
    canvases: document.querySelectorAll('.game-stage canvas').length
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

/** WebGL-off fallback: the game's 2D surface must render with no 3D canvas. */
function fallbackScript(gameJSON, surfaceSelector) {
  return `(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const proto = HTMLCanvasElement.prototype;
    const origGetContext = proto.getContext;
    proto.getContext = function () { return null; };
    try {
      ${CLEAR}
      await sleep(200);
      playGame(${gameJSON});
      await sleep(700);
      return {
        available: window.threeGame.isAvailable(),
        surface: Boolean(document.querySelector(${JSON.stringify(surfaceSelector)})),
        canvas: Boolean(document.querySelector('.game-stage canvas'))
      };
    } finally {
      proto.getContext = origGetContext;
    }
  })()`;
}

(async () => {
  const ctx = await connect();
  const { evaluate } = ctx;

  await evaluate(SPY);

  // ----------------------------------------------------------- matching ----
  console.log('\n=== matching (columns) 3D ===');
  const mOpen = await evaluate(MATCH_OPEN);
  check('WebGL is available in Electron', mOpen.available === true, `isAvailable=${mOpen.available}`);
  check('matching board opened with 2D cards', Boolean(mOpen.stage && mOpen.card), JSON.stringify({ stage: mOpen.stage, card: mOpen.card }));
  check('a 3D canvas mounts behind the board', mOpen.canvas === true);
  check('canvas is pointer-transparent (never blocks cards)', mOpen.pointerEvents === 'none', mOpen.pointerEvents);
  check('canvas sits at z-index 0 (behind the DOM)', mOpen.zIndex === '0', mOpen.zIndex);
  check('canvas is absolutely positioned within the stage', mOpen.position === 'absolute', mOpen.position);
  check('one mount on open', mOpen.spy.mounts === 1 && mOpen.spy.unmounts === 0,
    `mounts=${mOpen.spy.mounts} unmounts=${mOpen.spy.unmounts}`);

  const mCorrect = await evaluate(MATCH_CORRECT);
  check('a correct match fires the 3D burst', mCorrect.bursts >= 1, `${mCorrect.bursts} burst(s)`);
  check('matching scoring is unchanged (1 matched, 0 wrong)', mCorrect.matched === 1 && mCorrect.wrong === 0,
    `matched=${mCorrect.matched} wrong=${mCorrect.wrong}`);
  check('matched cards keep their .matched class', mCorrect.leftMatched === true);
  check('canvas survives the match', mCorrect.canvas === true);

  const mClosed = await evaluate(CLOSE);
  check('closing removes the canvas', mClosed.canvas === false);
  check('closing unmounts the scene', mClosed.spy.unmounts === 1, `unmounts=${mClosed.spy.unmounts}`);

  // ---------------------------------------------------------- treasure -----
  console.log('\n=== treasure-hunt (multiple-choice) 3D ===');
  const tOpen = await evaluate(TREASURE_OPEN);
  check('treasure stage opened with 2D answers', Boolean(tOpen.stage && tOpen.option), JSON.stringify({ stage: tOpen.stage, option: tOpen.option }));
  check('a 3D canvas mounts behind the stage', tOpen.canvas === true);
  check('canvas is pointer-transparent', tOpen.pointerEvents === 'none', tOpen.pointerEvents);
  check('canvas sits at z-index 0', tOpen.zIndex === '0', tOpen.zIndex);

  const tCorrect = await evaluate(TREASURE_CORRECT);
  check('a correct answer fires the 3D burst', tCorrect.bursts >= 1, `${tCorrect.bursts} burst(s)`);
  check('treasure scoring is unchanged (answered + earned)', tCorrect.answered === true && tCorrect.earned > 0,
    `answered=${tCorrect.answered} earned=${tCorrect.earned}`);
  check('correct answer still marks green feedback', tCorrect.correctMarked === true);
  check('canvas survives the answer', tCorrect.canvas === true);

  const tClosed = await evaluate(CLOSE);
  check('closing treasure removes the canvas', tClosed.canvas === false);

  // -------------------------------------------------------------- race ----
  console.log('\n=== race 3D ===');
  const rOpen = await evaluate(RACE_OPEN);
  check('race board opened with draw button', Boolean(rOpen.stage && rOpen.drawBtn), JSON.stringify({ stage: rOpen.stage, drawBtn: rOpen.drawBtn }));
  check('a 3D canvas mounts behind the track', rOpen.canvas === true);
  check('canvas is pointer-transparent', rOpen.pointerEvents === 'none', rOpen.pointerEvents);
  check('canvas sits at z-index 0', rOpen.zIndex === '0', rOpen.zIndex);

  const rDraw = await evaluate(RACE_DRAW);
  check('drawing a question shows 2D answer options', rDraw.answerOptions === 2, `${rDraw.answerOptions} option(s)`);
  check('exactly one canvas after drawing (no leak)', rDraw.canvases === 1, `${rDraw.canvases} canvas(es)`);

  const rAnswer = await evaluate(RACE_ANSWER);
  check('a correct answer fires the 3D burst (carried across re-render)', rAnswer.bursts >= 1, `${rAnswer.bursts} burst(s)`);
  check('race scoring is unchanged (team advanced +1 cell, +points)', rAnswer.progress === 2 && rAnswer.points >= 100,
    `progress=${rAnswer.progress} points=${rAnswer.points}`);
  check('exactly one canvas after answering (no leak)', rAnswer.canvases === 1, `${rAnswer.canvases} canvas(es)`);

  const rClosed = await evaluate(CLOSE);
  check('closing race removes the canvas', rClosed.canvas === false);

  // ------------------------------------------------------- WebGL-off ------
  console.log('\n=== WebGL-off fallback (all 3 games) ===');
  for (const [name, game, sel] of [
    ['matching', MATCH_GAME, '.match-card'],
    ['treasure', TREASURE_GAME, '.answer-option'],
    ['race', RACE_GAME, '.race-track']
  ]) {
    const fb = await evaluate(fallbackScript(game, sel));
    check(`WebGL-off ${name} reports unavailable`, fb.available === false, `isAvailable=${fb.available}`);
    check(`WebGL-off ${name} still renders its 2D surface`, fb.surface === true, `surface=${fb.surface}`);
    check(`WebGL-off ${name} attaches no canvas`, fb.canvas === false);
  }

  await evaluate(`(async () => {
    document.querySelector('[data-play-close]')?.click();
    document.getElementById('modalRoot').innerHTML = '';
    return true;
  })()`);

  const failed = results.filter(r => !r.ok);
  console.log(`\nui-three-game-check-4games: ${results.length - failed.length}/${results.length} checks passed`);
  ctx.ws.close();
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('ERROR: ' + e.message); process.exit(1); });
