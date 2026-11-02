// ui-connection-mode-check.js — "old games still open" after #171.
//
// This file used to drive the pre-#171 picture board (a 7-template schematic with
// a pick row of two card columns). That board is gone: #171 replaced it with the
// constellation board, and `ui-constellation-check.js` now owns every surface
// check the old file made (3D scene, SVG fallback without WebGL, chip placement,
// untouched columns/memory boards, replay, saved game, editor and wizard).
//
// What must NOT be lost, and is only true of this file, is COMPATIBILITY: a game
// saved by the old build stores one of the seven old picture ids, and it must
// still open and still score — mapped to the constellation it resembles, without
// being rewritten on disk. That is what this check proves.
//
// Run (against a built app started with --remote-debugging-port):
//   npm run build
//   npx electron . --remote-debugging-port=9393
//   node tests/ui/ui-connection-mode-check.js 9393
const { check, connect, results } = require('../manual/lib/ui-check-lib');

// Synthetic content only — no real student data (AGENTS.md).
const LEGACY_IDS = ['knowledge-network', 'bridge', 'solar-system', 'circuit', 'ecosystem', 'timeline', 'geometry'];

function legacyGame(id, template) {
  const pairs = [1, 2, 3, 4].map(n => ({ id: 'p' + n, left: 'Khái niệm ' + n, right: 'Định nghĩa ' + n }));
  return JSON.stringify({
    id,
    title: 'Trò chơi cũ',
    subject: 'Khoa học',
    grade: '7',
    template: 'matching',
    description: '',
    tags: [],
    sourceName: 'ui-check',
    createdAt: '2026-01-01T00:00:00.000Z',
    questions: [],
    matchingGame: {
      mode: 'connection',
      connectionTemplate: template,
      pairs,
      pointsPerPair: 100,
      completionBonus: 200,
      wrongPenalty: 0,
      timeBonus: 0,
      bonusUnderSeconds: 0,
      practiceMode: false
    }
  });
}

const OPEN = gameJson => `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  document.getElementById('closeResultBtn')?.click();
  document.querySelector('[data-play-close]')?.click();
  document.getElementById('modalRoot').innerHTML = '';
  await sleep(350);
  playGame(${gameJson});
  for (let i = 0; i < 60; i++) {
    if (document.querySelector('[data-constellation-panel]')) break;
    await sleep(100);
  }
  for (let i = 0; i < 60; i++) {
    if (document.querySelector('.game-stage canvas') || document.querySelector('[data-constellation-stage][data-connection3d="off"]')) break;
    await sleep(100);
  }
  await sleep(250);
  return true;
})()`;

(async () => {
  const ctx = await connect();
  const { evaluate, send } = ctx;
  await send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false }).catch(() => {});
  await evaluate(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 40; i++) { if (document.querySelector('#modalRoot .setup-fullscreen')) break; await sleep(100); }
    if (typeof closeSetupWizard === 'function') closeSetupWizard('close');
    document.getElementById('modalRoot').innerHTML = '';
    await sleep(250);
    return true;
  })()`);

  // -------------------------------------------- the old ids still resolve ----
  console.log('\n=== every old picture id still has a constellation ===');
  const mapping = await evaluate(`JSON.stringify({
    ids: ${JSON.stringify(LEGACY_IDS)}.map(id => ({ id, resolved: constellationResolve(id).id })),
    unknown: constellationResolve('khong-co').id
  })`);
  const parsed = JSON.parse(mapping);
  check('every old picture id resolves to a shipped constellation',
    parsed.ids.every(entry => entry.resolved && entry.resolved !== ''),
    JSON.stringify(parsed.ids));
  check('a name this build does not know falls back instead of failing',
    Boolean(parsed.unknown), parsed.unknown);

  // -------------------------------------------- an old game still plays ----
  console.log('\n=== an old game opens, plays and scores ===');
  const legacy = JSON.parse(legacyGame('ui-legacy-solar', 'solar-system'));
  await evaluate(OPEN(JSON.stringify(legacy)));
  const opened = JSON.parse(await evaluate(`JSON.stringify({
    board: state.currentGame.matchingGame.connectionTemplate,
    resolved: constellationResolve(state.currentGame.matchingGame.connectionTemplate).id,
    panel: Boolean(document.querySelector('[data-constellation-panel]')),
    stars: connectionTemplateFor(state.currentGame).stages.length,
    chips: document.querySelectorAll('[data-star-card]').length, answers: document.querySelectorAll('[data-answer-card]').length,
    counters: (document.querySelector('[data-connection-counter]') || {}).textContent || ''
  })`));
  check('an old game opens on the constellation its id maps to',
    opened.panel === true && opened.resolved === 'orion' && opened.stars === 4,
    JSON.stringify(opened));
  check('the saved id is not rewritten on disk',
    opened.board === 'solar-system', opened.board);
  check('the old game starts empty', opened.answers === 4 && opened.chips === 4, JSON.stringify(opened));

  const played = JSON.parse(await evaluate(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const stars = Object.keys(connectionStarAnchors());
    const first = constellationPairForStar(state.currentGame, connectionTemplateFor(state.currentGame), stars[0]);
    const ok = placeOnStar(first.id, first.id);
    await sleep(500);
    return JSON.stringify({
      star: stars[0],
      pair: first.id,
      ok,
      connected: state.connectionProgress.connectedStageIds.slice(),
      matched: state.matchingPlay.matched,
      cards: document.querySelectorAll('[data-answer-card]').length
    });
  })()`));
  check('an old game scores through the new board',
    played.connected.length === 1 && played.matched === 1 && played.cards === 3,
    JSON.stringify(played));

  // -------------------------------------------- the other styles open ----
  console.log('\n=== the other matching styles still open ===');
  await evaluate(OPEN(JSON.stringify({ ...legacy, id: 'ui-legacy-columns', matchingGame: { ...legacy.matchingGame, mode: 'columns' } })));
  const columns = JSON.parse(await evaluate(`JSON.stringify({
    board: Boolean(document.querySelector('.matching-board')),
    panel: Boolean(document.querySelector('[data-constellation-panel]'))
  })`));
  check('the two-column board is untouched', columns.board === true && columns.panel === false, JSON.stringify(columns));

  const summary = { passed: results.filter(r => r.ok).length, total: results.length };
  summary.failed = summary.total - summary.passed;
  console.log(`\n${summary.passed}/${summary.total} checks passed`);
  process.exit(summary.failed === 0 ? 0 : 1);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
