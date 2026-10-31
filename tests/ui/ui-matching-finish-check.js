// ui-matching-finish-check.js — DECISIONS #110.
//
// Finishing "Ghép cặp kiến thức" must STOP on the board with a "Xem kết quả" button
// and must NOT reveal the score; the score (and the session save) happen only when
// the teacher presses the button. Covers all three matching modes.
//
// Run:
//   npm run build
//   powershell -ExecutionPolicy Bypass -File tests/ui/launch-app.ps1 -Port 9392
//   node tests/ui/ui-matching-finish-check.js 9392
const { connect } = require('../manual/lib/ui-check-lib');

const pairs = [
  { id: 'p1', left: 'Nhóm A', right: 'Mục A1' },
  { id: 'p2', left: 'Nhóm A', right: 'Mục A2' },
  { id: 'p3', left: 'Nhóm B', right: 'Mục B1' },
  { id: 'p4', left: 'Nhóm B', right: 'Mục B2' }
];
const game = mode => ({
  id: `match-${mode}`, title: `Ghép cặp ${mode}`, template: 'matching',
  matchingGame: { mode, pairs, wrongPenalty: 10, completionBonus: 50, timeBonus: 20, bonusUnderSeconds: 60, practiceMode: false }
});

// Anything that would reveal the score before the teacher asks for it.
const SCORE_MARKUP = /result-score|result-screen|result-medal|% điểm tối đa/;

/** Play every pair through the UI for the given mode. */
const PLAY_ALL = mode => `(async () => {
  const body = document.getElementById('playBody');
  const ids = ${JSON.stringify(pairs.map(p => p.id))};
  if ('${mode}' === 'columns') {
    for (const id of ids) {
      body.querySelector('[data-match-side="left"][data-pair="' + id + '"]').click();
      body.querySelector('[data-match-side="right"][data-pair="' + id + '"]').click();
      await new Promise(r => setTimeout(r, 120));
    }
  } else if ('${mode}' === 'memory') {
    // Flip each pair: find the two cards that carry the same data-pair.
    for (const id of ids) {
      const cards = [...body.querySelectorAll('.memory-card[data-pair="' + id + '"]')];
      cards[0].click();
      await new Promise(r => setTimeout(r, 120));
      cards[1].click();
      await new Promise(r => setTimeout(r, 700));
    }
  } else {
    // categorize: pick the card, then its group box.
    for (const id of ids) {
      const pair = ${JSON.stringify(pairs)}.find(p => p.id === id);
      const index = [...body.querySelectorAll('[data-category-card]')].findIndex(c => c.dataset.pair === id);
      body.querySelectorAll('[data-category-card]')[index].click();
      await new Promise(r => setTimeout(r, 80));
      const boxes = [...body.querySelectorAll('.group-box')];
      const target = boxes.find(box => box.dataset.group === pair.left);
      target.click();
      await new Promise(r => setTimeout(r, 150));
    }
  }
  await new Promise(r => setTimeout(r, 1200));
  const bar = body.querySelector('[data-matching-complete]');
  const btn = document.getElementById('matchingResultsBtn');
  return {
    matched: state.matchingPlay.matched,
    total: state.currentGame.matchingGame.pairs.length,
    hasBar: Boolean(bar),
    hasBtn: Boolean(btn),
    btnLabel: btn ? btn.textContent.trim() : '',
    hasBoard: Boolean(body.querySelector('.matching-board, .memory-grid, .category-cards')),
    scoreMarkup: ${SCORE_MARKUP}.test(body.innerHTML),
    bodyText: body.textContent
  };
})()`;

(async () => {
  const cdp = await connect();
  const results = [];
  const check = (name, ok, detail) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

  for (const mode of ['columns', 'memory', 'categorize']) {
    await cdp.evaluate(`(async () => {
      state.currentGame = ${JSON.stringify(game(mode))};
      playGame(state.currentGame);
      await new Promise(r => setTimeout(r, 400));
      return true;
    })()`);
    const out = await cdp.evaluate(PLAY_ALL(mode));
    check(`${mode}: all pairs matched through the UI`, out.matched === out.total, `${out.matched}/${out.total}`);
    check(`${mode}: the stopping bar appears`, out.hasBar && out.hasBtn);
    check(`${mode}: the board is still on screen`, out.hasBoard);
    check(`${mode}: NO score is shown yet`, !out.scoreMarkup, out.scoreMarkup ? 'result markup found' : '');
    check(`${mode}: the button says "Xem kết quả"`, /Xem kết quả/.test(out.btnLabel || ''), out.btnLabel);

    const after = await cdp.evaluate(`(async () => {
      document.getElementById('matchingResultsBtn').click();
      await new Promise(r => setTimeout(r, 600));
      const body = document.getElementById('playBody');
      return {
        hasResult: Boolean(body.querySelector('.result-screen')),
        score: (body.querySelector('.result-score') || {}).textContent || '',
        barGone: !body.querySelector('[data-matching-complete]')
      };
    })()`);
    check(`${mode}: clicking reveals the score`, after.hasResult && /điểm/.test(after.score), after.score.trim());
    check(`${mode}: the bar is gone after results`, after.barGone);

    await cdp.evaluate('closePlaySurface()');
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  // Re-rendering an already finished board must still stop on the button.
  const replay = await cdp.evaluate(`(async () => {
    state.currentGame = ${JSON.stringify(game('columns'))};
    playGame(state.currentGame);
    await new Promise(r => setTimeout(r, 300));
    state.matchingPlay.matched = state.currentGame.matchingGame.pairs.length;
    renderMatchingBoard();
    await new Promise(r => setTimeout(r, 250));
    const body = document.getElementById('playBody');
    return { hasBar: Boolean(body.querySelector('[data-matching-complete]')), hasResult: Boolean(body.querySelector('.result-screen')) };
  })()`);
  check('re-rendering a finished board still stops on the button', replay.hasBar && !replay.hasResult);

  await cdp.evaluate('closePlaySurface()');
  cdp.ws.close();
  const failed = results.filter(ok => !ok).length;
  console.log(`\n${results.length - failed}/${results.length} matching finish checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(error => { console.error('probe failed:', (error && error.stack) || error); process.exit(2); });
