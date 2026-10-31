// ui-three-game-patterns-check.js — regression guard for the gameplay-driven 3D
// patterns rolled out to the games outside the quiz pilot (DECISIONS #145):
//   matching      -> Unlock (chest opens when every pair is matched)
//                    + Destructible (a wrong pair shatters a block, then resets)
//                    + Celebrate (completion confetti)
//   treasure-hunt -> Unlock (the stage chest opens on a correct answer)
//                    + Celebrate (on the final stage)
//   race          -> Construction (one tower block per correct answer)
//                    + Reactive (orb flashes green/red)
//                    + Celebrate (on the winning answer)
//
// What it proves, against a built app started with --remote-debugging-port:
//   - each game builds the expected pattern objects on mount;
//   - the DOM handlers still decide correctness (scores in this check match the
//     engine's own numbers — 3D never scores);
//   - the race board's full re-render keeps its reaction and leaves one canvas.
//
// Run (a fresh instance — do NOT share with the other three.js checks):
//   npm run build
//   npx electron . --remote-debugging-port=9342
//   node tests/ui/ui-three-game-patterns-check.js 9342
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

const MATCH_GAME = base('ui-pat-match', 'Ghép cặp từ vựng', 'Tiếng Việt', '2', 'matching', {
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

const TREASURE_GAME = base('ui-pat-treasure', 'Hành trình rừng xanh', 'Khoa học', '3', 'treasure-hunt', {
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
      attempts: 2, points: 100, completionBonus: 50, nextStageId: null
    }]
  }
});

const RACE_WIN = base('ui-pat-race-win', 'Đường đua tri thức', 'Toán', '5', 'race', {
  race: {
    trackLength: 2, maxRounds: 2, stepByDifficulty: false, luckEnabled: false,
    teams: [{ id: 't1', name: 'Đội Đỏ', icon: '🔴' }, { id: 't2', name: 'Đội Xanh', icon: '🔵' }],
    cells: [],
    questions: [{
      id: 'rq1', prompt: '2 + 2 bằng mấy?',
      options: [{ id: 'a', text: '3' }, { id: 'b', text: '4' }],
      correctOptionId: 'b', explanation: '2 + 2 = 4'
    }]
  }
});

const RACE_WRONG = base('ui-pat-race-wrong', 'Đường đua tri thức', 'Toán', '5', 'race', {
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

/** Wrap every pattern factory + celebrate/emit once; state persists for the run. */
const SPY = `(() => {
  if (!window.__patSpy) {
    const tg = window.threeGame;
    const orig = {
      makeUnlockable: tg.makeUnlockable,
      makeDestructible: tg.makeDestructible,
      makeConstruction: tg.makeConstruction,
      makeReactive: tg.makeReactive,
      celebrate: tg.celebrate,
      emit: tg.emit
    };
    const s = { unlockables: [], destructibles: [], constructions: [], reactives: [], flashes: [], celebrate: 0, events: [] };
    tg.makeUnlockable = (...a) => { const o = orig.makeUnlockable(...a); s.unlockables.push(o); return o; };
    tg.makeDestructible = (...a) => { const o = orig.makeDestructible(...a); s.destructibles.push(o); return o; };
    tg.makeConstruction = (...a) => { const o = orig.makeConstruction(...a); s.constructions.push(o); return o; };
    tg.makeReactive = (...a) => {
      const o = orig.makeReactive(...a);
      const flash = o.flash;
      o.flash = (...b) => { s.flashes.push(b[1]); return flash(...b); };
      s.reactives.push(o);
      return o;
    };
    tg.celebrate = (...a) => { s.celebrate += 1; return orig.celebrate(...a); };
    tg.emit = (ev, d) => { s.events.push(ev); return orig.emit(ev, d); };
    window.__patSpy = s;
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
  const s = window.__patSpy;
  return {
    available: window.threeGame.isAvailable(),
    chests: s.unlockables.length,
    destructibles: s.destructibles.length,
    chestOpen: s.unlockables.length ? s.unlockables[0].isOpen() : null,
    canvases: document.querySelectorAll('.game-stage canvas').length
  };
})()`;

// Wrong pair: left p1 + right p2.
const MATCH_WRONG = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  document.querySelector('.match-card[data-match-side="left"][data-pair="p1"]').click();
  document.querySelector('.match-card[data-match-side="right"][data-pair="p2"]').click();
  await sleep(200);
  const s = window.__patSpy;
  const d = s.destructibles[0];
  const brokenNow = d ? d.isBroken() : null;
  await sleep(1600);
  return {
    brokenNow,
    brokenAfterReset: d ? d.isBroken() : null,
    wrong: state.matchingPlay.wrong,
    events: s.events.slice()
  };
})()`;

// Both pairs matched correctly -> chest opens and the game celebrates.
const MATCH_COMPLETE = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  document.querySelector('.match-card[data-match-side="left"][data-pair="p1"]').click();
  document.querySelector('.match-card[data-match-side="right"][data-pair="p1"]').click();
  await sleep(700);
  document.querySelector('.match-card[data-match-side="left"][data-pair="p2"]').click();
  document.querySelector('.match-card[data-match-side="right"][data-pair="p2"]').click();
  await sleep(1800);
  const s = window.__patSpy;
  return {
    matched: state.matchingPlay.matched,
    wrong: state.matchingPlay.wrong,
    chestOpen: s.unlockables.length ? s.unlockables[0].isOpen() : null,
    celebrate: s.celebrate,
    events: s.events.slice(),
    completeBar: Boolean(document.querySelector('[data-matching-complete]'))
  };
})()`;

// ---------------------------------------------------------------- treasure --
// Wrong first (attempts: 2), then correct on the same stage.
const TREASURE_WRONG = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  ${CLEAR}
  await sleep(200);
  playGame(${TREASURE_GAME});
  await sleep(900);
  const before = window.__patSpy.unlockables.length;
  document.querySelector('.answer-option[data-answer="b"]').click();
  await sleep(600);
  const s = window.__patSpy;
  const chest = s.unlockables[s.unlockables.length - 1] || null;
  return {
    chests: before,
    chestOpen: chest ? chest.isOpen() : null,
    attemptsLeft: state.treasurePlay.attemptsLeft,
    answered: state.treasurePlay.answered,
    earned: state.treasurePlay.earned
  };
})()`;

const TREASURE_CORRECT = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  document.querySelector('.answer-option[data-answer="a"]').click();
  await sleep(800);
  const s = window.__patSpy;
  return {
    chestOpen: s.unlockables.length ? s.unlockables[s.unlockables.length - 1].isOpen() : null,
    earned: state.treasurePlay.earned,
    celebrate: s.celebrate,
    events: s.events.slice()
  };
})()`;

// -------------------------------------------------------------------- race --
const RACE_WIN_OPEN = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  ${CLEAR}
  await sleep(200);
  playGame(${RACE_WIN});
  await sleep(900);
  const s = window.__patSpy;
  return {
    towerStage: s.constructions.length ? s.constructions[s.constructions.length - 1].currentStage() : null,
    reactives: s.reactives.length,
    canvases: document.querySelectorAll('.game-stage canvas').length
  };
})()`;

const RACE_WIN_ANSWER = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  document.querySelector('#drawQuestionBtn').click();
  await sleep(700);
  document.querySelector('[data-race-answer="b"]').click();
  await sleep(900);
  const s = window.__patSpy;
  return {
    towerStage: s.constructions.length ? s.constructions[s.constructions.length - 1].currentStage() : null,
    flashes: s.flashes.slice(),
    celebrate: s.celebrate,
    events: s.events.slice(),
    progress: state.racePlay.teams[0].progress,
    points: state.racePlay.teams[0].points,
    winnerId: state.racePlay.winnerId,
    canvases: document.querySelectorAll('.game-stage canvas').length
  };
})()`;

const RACE_WRONG_OPEN = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  ${CLEAR}
  await sleep(200);
  playGame(${RACE_WRONG});
  await sleep(900);
  document.querySelector('#drawQuestionBtn').click();
  await sleep(700);
  document.querySelector('[data-race-answer="a"]').click();
  await sleep(900);
  const s = window.__patSpy;
  return {
    towerStage: s.constructions.length ? s.constructions[s.constructions.length - 1].currentStage() : null,
    lastFlash: s.flashes.length ? s.flashes[s.flashes.length - 1] : null,
    progress: state.racePlay.teams[0].progress,
    points: state.racePlay.teams[0].points,
    canvases: document.querySelectorAll('.game-stage canvas').length
  };
})()`;

(async () => {
  const ctx = await connect();
  const { evaluate } = ctx;

  await evaluate(SPY);

  // ----------------------------------------------------------- matching ----
  console.log('\n=== matching: Unlock + Destructible + Celebrate ===');
  const mOpen = await evaluate(MATCH_OPEN);
  check('WebGL is available in Electron', mOpen.available === true, `isAvailable=${mOpen.available}`);
  check('matching builds a chest and a destructible block', mOpen.chests === 1 && mOpen.destructibles === 1,
    JSON.stringify({ chests: mOpen.chests, destructibles: mOpen.destructibles }));
  check('the chest starts sealed', mOpen.chestOpen === false, `isOpen=${mOpen.chestOpen}`);
  check('one canvas on the matching board', mOpen.canvases === 1, `${mOpen.canvases} canvas(es)`);

  const mWrong = await evaluate(MATCH_WRONG);
  check('a wrong pair shatters the destructible block', mWrong.brokenNow === true, `isBroken=${mWrong.brokenNow}`);
  check('the block resets itself for the next wrong attempt', mWrong.brokenAfterReset === false,
    `isBroken=${mWrong.brokenAfterReset}`);
  check('a wrong pair is still counted by the 2D board', mWrong.wrong === 1, `wrong=${mWrong.wrong}`);
  check('match:incorrect is emitted', mWrong.events.includes('match:incorrect'), JSON.stringify(mWrong.events));

  const mDone = await evaluate(MATCH_COMPLETE);
  check('both pairs matched with the engine unchanged', mDone.matched === 2 && mDone.wrong === 1,
    `matched=${mDone.matched} wrong=${mDone.wrong}`);
  check('the chest unlocks when every pair is matched', mDone.chestOpen === true, `isOpen=${mDone.chestOpen}`);
  check('matching completion celebrates once', mDone.celebrate >= 1, `${mDone.celebrate} celebrate(s)`);
  check('match:correct and game:completed are emitted',
    mDone.events.includes('match:correct') && mDone.events.includes('game:completed'),
    JSON.stringify(mDone.events));
  check('the completion bar is still pinned by the 2D layer', mDone.completeBar === true);

  // ---------------------------------------------------------- treasure -----
  console.log('\n=== treasure: Unlock + Celebrate ===');
  const tWrong = await evaluate(TREASURE_WRONG);
  check('the treasure stage builds one chest', tWrong.chests >= 1, `${tWrong.chests} chest(s)`);
  check('a wrong answer keeps the chest sealed', tWrong.chestOpen === false, `isOpen=${tWrong.chestOpen}`);
  check('a wrong answer only spends an attempt in the engine',
    tWrong.answered === false && tWrong.attemptsLeft === 1 && tWrong.earned === 0,
    JSON.stringify({ answered: tWrong.answered, attemptsLeft: tWrong.attemptsLeft, earned: tWrong.earned }));

  const tDone = await evaluate(TREASURE_CORRECT);
  check('a correct answer opens the stage chest', tDone.chestOpen === true, `isOpen=${tDone.chestOpen}`);
  check('treasure scoring is unchanged (100 + 50 completion)', tDone.earned === 150, `earned=${tDone.earned}`);
  check('finishing the last stage celebrates', tDone.celebrate >= 1, `${tDone.celebrate} celebrate(s)`);
  check('answer:correct and game:completed are emitted',
    tDone.events.includes('answer:correct') && tDone.events.includes('game:completed'),
    JSON.stringify(tDone.events));

  // -------------------------------------------------------------- race ----
  console.log('\n=== race: Construction + Reactive + Celebrate ===');
  const rOpen = await evaluate(RACE_WIN_OPEN);
  check('race builds a tower at stage 0 and one reactive orb',
    rOpen.towerStage === 0 && rOpen.reactives >= 1,
    JSON.stringify({ towerStage: rOpen.towerStage, reactives: rOpen.reactives }));

  const rWin = await evaluate(RACE_WIN_ANSWER);
  check('a correct answer grows the tower one block', rWin.towerStage === 1, `stage=${rWin.towerStage}`);
  check('the reactive orb flashes green', rWin.flashes.includes('correct'), JSON.stringify(rWin.flashes));
  check('the winning answer celebrates', rWin.celebrate >= 1, `${rWin.celebrate} celebrate(s)`);
  check('answer:correct and game:completed are emitted',
    rWin.events.includes('answer:correct') && rWin.events.includes('game:completed'),
    JSON.stringify(rWin.events));
  check('race scoring is unchanged (finish + 100 points)',
    rWin.progress === 2 && rWin.points === 100 && rWin.winnerId === 't1',
    JSON.stringify({ progress: rWin.progress, points: rWin.points, winner: rWin.winnerId }));
  check('exactly one canvas after the race re-render', rWin.canvases === 1, `${rWin.canvases} canvas(es)`);

  const rWrong = await evaluate(RACE_WRONG_OPEN);
  check('a wrong race answer leaves the tower at stage 0', rWrong.towerStage === 0, `stage=${rWrong.towerStage}`);
  check('the reactive orb flashes red', rWrong.lastFlash === 'incorrect', String(rWrong.lastFlash));
  check('race scoring is untouched on a wrong answer', rWrong.progress === 1 && rWrong.points === 0,
    JSON.stringify({ progress: rWrong.progress, points: rWrong.points }));
  check('exactly one canvas after the wrong answer', rWrong.canvases === 1, `${rWrong.canvases} canvas(es)`);

  await evaluate(`(async () => {
    document.querySelector('[data-play-close]')?.click();
    document.getElementById('modalRoot').innerHTML = '';
    return true;
  })()`);

  const failed = results.filter(r => !r.ok);
  console.log(`\nui-three-game-patterns-check: ${results.length - failed.length}/${results.length} checks passed`);
  ctx.ws.close();
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('ERROR: ' + e.message); process.exit(1); });
