// smoke56.js — CDP-driven UI smoke test for tasknight §5 treasure-hunt + §6 race.
// Run while the app is started with --remote-debugging-port=9333.
// Prints PASS/FAIL lines and writes smoke56-report.json.
const fs = require('node:fs');
const PORT = 9333;
const HUNT_TITLE = 'SMOKE Kho bau 56';
const RACE_TITLE = 'SMOKE Duong dua 56';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const results = [];
function check(label, pass, extra) {
  results.push({ label, pass: Boolean(pass), extra: extra == null ? '' : String(extra) });
  console.log((pass ? 'PASS' : 'FAIL') + ' | ' + label + (extra != null && extra !== '' ? '  -> ' + extra : ''));
}
const uncaught = [], consoleErrs = [], logErrs = [];

async function findTarget() {
  for (let i = 0; i < 90; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const t = list.find(x => x.type === 'page' && /index\.html/.test(x.url));
      if (t) return t;
    } catch {}
    await sleep(1000);
  }
  throw new Error('No page target on CDP port ' + PORT + ' after 90s');
}

(async () => {
  const target = await findTarget();
  console.log('TARGET: ' + target.url);
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
  let seq = 0;
  const pending = new Map();
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(m.error.message)) : resolve(m.result);
      return;
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      uncaught.push((d.exception && d.exception.description) || d.text || 'unknown');
    } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      consoleErrs.push(m.params.args.map(a => a.value ?? a.description ?? '').join(' '));
    } else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
      logErrs.push(m.params.entry.text);
    }
  });
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evalJs(expression, awaitPromise = false) {
    const r = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
    if (r.exceptionDetails) return { error: (r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text };
    return { value: r.result.value };
  }
  async function must(expr) {
    const r = await evalJs(expr, true);
    if (r.error) throw new Error('evaluate failed: ' + r.error + '\n  expr: ' + expr.slice(0, 200));
    return r.value;
  }

  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
  await sleep(300);

  // T0 — boot
  const booted = await must(`(async () => {
    const t = Date.now();
    while (Date.now() - t < 30000) {
      if (typeof state !== 'undefined' && typeof navigate === 'function' && window.eduGame && document.querySelector('#pageContent')?.children.length) return true;
      await new Promise(r => setTimeout(r, 200));
    }
    return false;
  })()`);
  check('T0 renderer booted', booted, booted);
  const globals = await must(`({
    playGame: typeof playGame,
    editGame: typeof editGame,
    treasurePlay: typeof state.treasurePlay !== 'undefined',
    racePlay: typeof state.racePlay !== 'undefined'
  })`);
  check('T0 play/editor globals usable', globals.playGame === 'function' && globals.editGame === 'function' && globals.treasurePlay && globals.racePlay, JSON.stringify(globals));

  // T1 — treasure editor: blank game, panel visible, save with custom journeyBonus
  const t1 = await must(`(async () => {
    const out = [];
    const push = (l, p, e) => out.push([l, !!p, e == null ? '' : String(e)]);
    navigate('create');
    await new Promise(r => setTimeout(r, 200));
    document.querySelector('[data-template="treasure-hunt"]')?.click();
    await new Promise(r => setTimeout(r, 200));
    push('template selected', state.selectedTemplate === 'treasure-hunt', state.selectedTemplate);
    document.getElementById('gameTitle').value = ${JSON.stringify(HUNT_TITLE)};
    document.getElementById('gameSubject').value = 'Khoa học';
    document.getElementById('previewManualBtn').click();
    await new Promise(r => setTimeout(r, 300));
    push('editor modal opened', !!document.querySelector('#modalRoot .modal'), '');
    const hunt = document.getElementById('treasureEditor');
    push('treasure editor panel exists', !!hunt, '');
    push('treasure panel visible', hunt && !hunt.classList.contains('hidden'), hunt && hunt.className);
    push('race panel hidden', document.getElementById('raceEditor')?.classList.contains('hidden'), '');
    push('matching panel hidden', document.getElementById('matchingEditor')?.classList.contains('hidden'), '');
    const stageCount = document.querySelectorAll('#treasureStages .treasure-stage-card').length;
    push('sample stages >= 2', stageCount >= 2, stageCount);
    const jb = document.getElementById('treasureJourneyBonus');
    jb.value = '350'; jb.dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('saveGameBtn').click();
    const t = Date.now();
    while (state.page !== 'library' && Date.now() - t < 6000) await new Promise(r => setTimeout(r, 100));
    push('saved -> library', state.page === 'library', state.page);
    const g = state.db.games.find(g => g.title === ${JSON.stringify(HUNT_TITLE)});
    push('game in db', !!g, '');
    if (g) {
      push('treasureHunt persisted', !!g.treasureHunt, '');
      push('journeyBonus = 350', g.treasureHunt && g.treasureHunt.journeyBonus === 350, g.treasureHunt && g.treasureHunt.journeyBonus);
      push('stages >= 2', g.treasureHunt && g.treasureHunt.stages.length >= 2, g.treasureHunt && g.treasureHunt.stages.length);
      const lib = await window.eduGame.getLibrary();
      push('IPC round-trip carries treasureHunt', JSON.stringify(lib).includes('"treasureHunt"'), '');
    }
    return out;
  })()`);
  t1.forEach(r => check('T1 treasure-editor ' + r[0], r[1], r[2]));

  // T2 — treasure play: wrong attempt, correct, hidden item, ending, results 2*300+350 (+50 item)
  const t2 = await must(`(async () => {
    const out = [];
    const push = (l, p, e) => out.push([l, !!p, e == null ? '' : String(e)]);
    const g = state.db.games.find(g => g.title === ${JSON.stringify(HUNT_TITLE)});
    if (!g) { push('hunt game found', false, 'MISSING'); return out; }
    playGame(g);
    await new Promise(r => setTimeout(r, 200));
    push('play modal open', !!document.querySelector('#playBody'), '');
    push('stage header shows HÀNH TRÌNH', (document.querySelector('.stage-top')?.textContent || '').includes('HÀNH TRÌNH'), document.querySelector('.stage-top')?.textContent);
    const stages = g.treasureHunt.stages;
    // wrong attempt on stage 1 — pick a DOM button that is not the correct answer
    const s1 = stages[0];
    const btns = [...document.querySelectorAll('.answer-option')];
    const wrongBtn = btns.find(b => b.dataset.answer !== s1.question.correctOptionId);
    push('debug: stageId/correct/wrongBtn', state.treasurePlay.stageId === s1.id && !!wrongBtn, JSON.stringify({ playStage: state.treasurePlay.stageId, savedId: s1.id, correct: s1.question.correctOptionId, domAnswers: btns.map(b => b.dataset.answer) }));
    wrongBtn.click();
    await new Promise(r => setTimeout(r, 80));
    let fb = document.getElementById('answerFeedback')?.textContent || '';
    push('wrong feedback shown', fb.includes('Chưa đúng'), fb.slice(0, 100));
    // hidden item pickup on stage 1
    const itemBtn = document.getElementById('findItemBtn');
    push('hidden item button on stage 1', !!itemBtn, '');
    if (itemBtn) { itemBtn.click(); await new Promise(r => setTimeout(r, 50)); }
    push('item counted', Object.keys(state.treasurePlay.itemsFound).length === 1, JSON.stringify(state.treasurePlay.itemsFound));
    // correct answers through all stages
    let guard = 0;
    while (!state.treasurePlay.done && guard < 10) {
      guard += 1;
      const cur = stages.find(s => s.id === state.treasurePlay.stageId);
      document.querySelector('.answer-option[data-answer="' + cur.question.correctOptionId + '"]').click();
      await new Promise(r => setTimeout(r, 120));
      const choice = document.querySelector('.treasure-choice');
      push('stage choice shown after correct (step ' + guard + ')', !!choice, choice && choice.dataset.choice);
      if (!choice) break;
      choice.click();
      await new Promise(r => setTimeout(r, 150));
    }
    push('treasure run finished', state.treasurePlay.done === true, JSON.stringify({ done: state.treasurePlay.done, earned: state.treasurePlay.earned }));
    const score = document.querySelector('.result-score')?.textContent || '';
    const expected = stages.length * 300 + 350 + 50;
    push('result score = ' + expected + ' (stages+bonus+item)', score.replace(/[\\s.]/g, '').includes(String(expected)), score);
    const kicker = document.querySelector('.stage-kicker')?.textContent || '';
    push('completion kicker', kicker.includes('HOÀN THÀNH'), kicker);
    const saveStarted = Date.now();
    let savedSession = null;
    while (Date.now() - saveStarted < 8000) {
      savedSession = state.db.sessions.find(item => item.gameId === g.id);
      if (savedSession && /Đã tự lưu/.test(document.getElementById('resultSaveStatus')?.textContent || '')) break;
      await new Promise(r => setTimeout(r, 120));
    }
    push('treasure result auto-saved one session', !!savedSession && savedSession.points === expected && state.db.sessions.filter(item => item.gameId === g.id).length === 1, savedSession && JSON.stringify({ points: savedSession.points, expected }));
    document.getElementById('closeResultBtn').click();
    push('play modal closed', !document.querySelector('#playBody'), '');
    return out;
  })()`);
  t2.forEach(r => check('T2 treasure-play ' + r[0], r[1], r[2]));

  // T3 — treasure validation gate in editor: journeyBonus 20000 rejected
  const t3 = await must(`(async () => {
    const out = [];
    const push = (l, p, e) => out.push([l, !!p, e == null ? '' : String(e)]);
    const g = state.db.games.find(g => g.title === ${JSON.stringify(HUNT_TITLE)});
    if (!g) { push('hunt game found', false, 'MISSING'); return out; }
    editGame(JSON.parse(JSON.stringify(g)));
    await new Promise(r => setTimeout(r, 250));
    push('editor reopened', !!document.getElementById('treasureEditor'), '');
    const jb = document.getElementById('treasureJourneyBonus');
    jb.value = '20000'; jb.dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('saveGameBtn').click();
    await new Promise(r => setTimeout(r, 400));
    push('modal still open after invalid save', !!document.querySelector('#modalRoot .modal'), '');
    push('library game unchanged', state.db.games.find(g => g.title === ${JSON.stringify(HUNT_TITLE)})?.treasureHunt?.journeyBonus === 350, '');
    document.querySelector('#modalRoot [data-close]')?.click();
    await new Promise(r => setTimeout(r, 100));
    push('modal closed', !document.querySelector('#modalRoot .modal'), '');
    return out;
  })()`);
  t3.forEach(r => check('T3 treasure-validation ' + r[0], r[1], r[2]));

  // T4 — race editor: blank game, panel, short track, save
  const t4 = await must(`(async () => {
    const out = [];
    const push = (l, p, e) => out.push([l, !!p, e == null ? '' : String(e)]);
    navigate('create');
    await new Promise(r => setTimeout(r, 200));
    document.querySelector('[data-template="race"]')?.click();
    await new Promise(r => setTimeout(r, 200));
    document.getElementById('gameTitle').value = ${JSON.stringify(RACE_TITLE)};
    document.getElementById('previewManualBtn').click();
    await new Promise(r => setTimeout(r, 300));
    const race = document.getElementById('raceEditor');
    push('race panel exists and visible', !!race && !race.classList.contains('hidden'), race && race.className);
    push('treasure panel hidden', document.getElementById('treasureEditor')?.classList.contains('hidden'), '');
    push('team rows >= 2', document.querySelectorAll('#raceTeams .race-team-row').length >= 2, document.querySelectorAll('#raceTeams .race-team-row').length);
    const tl = document.getElementById('raceTrackLength');
    tl.value = '3'; tl.dispatchEvent(new Event('change', { bubbles: true }));
    const cellNum = document.querySelector('#raceCells [data-cell-number]');
    cellNum.value = '2'; cellNum.dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('saveGameBtn').click();
    const t = Date.now();
    while (state.page !== 'library' && Date.now() - t < 6000) await new Promise(r => setTimeout(r, 100));
    push('saved -> library', state.page === 'library', state.page);
    const g = state.db.games.find(g => g.title === ${JSON.stringify(RACE_TITLE)});
    push('race game in db', !!g, '');
    if (g) {
      push('race persisted trackLength=3', g.race && g.race.trackLength === 3, g.race && g.race.trackLength);
      push('teams >= 2', g.race && g.race.teams.length >= 2, g.race && g.race.teams.length);
      push('cell moved to 2', g.race && g.race.cells.some(c => c.cell === 2), JSON.stringify(g.race && g.race.cells));
    }
    return out;
  })()`);
  t4.forEach(r => check('T4 race-editor ' + r[0], r[1], r[2]));

  // T5 — race play: board, draw, correct answer wins by difficulty step (+2 -> ô 3)
  const t5 = await must(`(async () => {
    const out = [];
    const push = (l, p, e) => out.push([l, !!p, e == null ? '' : String(e)]);
    const g = state.db.games.find(g => g.title === ${JSON.stringify(RACE_TITLE)});
    if (!g) { push('race game found', false, 'MISSING'); return out; }
    playGame(g);
    await new Promise(r => setTimeout(r, 200));
    push('board modal open', !!document.querySelector('#playBody'), '');
    push('track has 3 cells', document.querySelectorAll('.race-cell').length === 3, document.querySelectorAll('.race-cell').length);
    push('scoreboard has 2 teams', document.querySelectorAll('.race-scoreboard .race-team-row').length === 2, document.querySelectorAll('.race-scoreboard .race-team-row').length);
    const draw = document.getElementById('drawQuestionBtn');
    push('draw button for first team', !!draw, draw && draw.textContent.trim());
    draw.click();
    await new Promise(r => setTimeout(r, 150));
    push('question shown', !!document.querySelector('.race-turn .stage-question'), document.querySelector('.race-turn .stage-kicker')?.textContent);
    const q = g.race.questions[0];
    document.querySelector('[data-race-answer="' + q.correctOptionId + '"]').click();
    await new Promise(r => setTimeout(r, 150));
    push('team1 won (progress 1+2=3 >= 3)', state.racePlay.winnerId === state.racePlay.teams[0].id, JSON.stringify(state.racePlay.teams.map(t => ({ n: t.name, p: t.progress, pts: t.points }))));
    push('game over', state.racePlay.over === true, '');
    const h2 = document.querySelector('.result-screen h2')?.textContent || '';
    push('winner banner names team1', h2.includes(state.racePlay.teams[0].name), h2);
    const saveStarted = Date.now();
    let savedSession = null;
    while (Date.now() - saveStarted < 8000) {
      savedSession = state.db.sessions.find(item => item.gameId === g.id);
      if (savedSession && /Đã tự lưu/.test(document.getElementById('resultSaveStatus')?.textContent || '')) break;
      await new Promise(r => setTimeout(r, 120));
    }
    push('race result auto-saved one session', !!savedSession && state.db.sessions.filter(item => item.gameId === g.id).length === 1, savedSession && JSON.stringify({ id: savedSession.id, player: savedSession.playerName, points: savedSession.points }));
    document.getElementById('closeResultBtn').click();
    push('play modal closed', !document.querySelector('#playBody'), '');
    return out;
  })()`);
  t5.forEach(r => check('T5 race-play ' + r[0], r[1], r[2]));

  // T6 — race validation gate: one team left -> save rejected
  const t6 = await must(`(async () => {
    const out = [];
    const push = (l, p, e) => out.push([l, !!p, e == null ? '' : String(e)]);
    const g = state.db.games.find(g => g.title === ${JSON.stringify(RACE_TITLE)});
    if (!g) { push('race game found', false, 'MISSING'); return out; }
    editGame(JSON.parse(JSON.stringify(g)));
    await new Promise(r => setTimeout(r, 250));
    push('editor reopened', !!document.getElementById('raceEditor'), '');
    document.querySelector('#raceTeams [data-team-remove]').click();
    await new Promise(r => setTimeout(r, 80));
    push('only 1 team row left', document.querySelectorAll('#raceTeams .race-team-row').length === 1, document.querySelectorAll('#raceTeams .race-team-row').length);
    document.getElementById('saveGameBtn').click();
    await new Promise(r => setTimeout(r, 400));
    push('modal still open after invalid save', !!document.querySelector('#modalRoot .modal'), '');
    push('library game unchanged (2 teams)', state.db.games.find(g => g.title === ${JSON.stringify(RACE_TITLE)})?.race?.teams?.length === 2, '');
    document.querySelector('#modalRoot [data-close]')?.click();
    await new Promise(r => setTimeout(r, 100));
    push('modal closed', !document.querySelector('#modalRoot .modal'), '');
    return out;
  })()`);
  t6.forEach(r => check('T6 race-validation ' + r[0], r[1], r[2]));

  // T7 — cleanup
  const t7 = await must(`(async () => {
    const out = [];
    const push = (l, p, e) => out.push([l, !!p, e == null ? '' : String(e)]);
    for (const title of [${JSON.stringify(HUNT_TITLE)}, ${JSON.stringify(RACE_TITLE)}]) {
      const g = state.db.games.find(g => g.title === title);
      if (g) { await window.eduGame.deleteGame(g.id); await refreshDb(); }
    }
    push('smoke games deleted', !state.db.games.find(g => g.title === ${JSON.stringify(HUNT_TITLE)} || g.title === ${JSON.stringify(RACE_TITLE)}), '');
    navigate('home');
    push('home page after tests', state.page === 'home', state.page);
    return out;
  })()`);
  t7.forEach(r => check('T7-cleanup ' + r[0], r[1], r[2]));

  await sleep(500);
  console.log('\n--- PAGE ERRORS ---');
  console.log('uncaught exceptions: ' + uncaught.length);
  uncaught.forEach(e => console.log('  U: ' + String(e).slice(0, 500)));
  console.log('console.error: ' + consoleErrs.length);
  consoleErrs.slice(0, 20).forEach(e => console.log('  C: ' + String(e).slice(0, 300)));
  console.log('log errors: ' + logErrs.length);
  logErrs.slice(0, 20).forEach(e => console.log('  L: ' + String(e).slice(0, 300)));
  check('PAGE no uncaught JS exceptions during run', uncaught.length === 0, uncaught[0] || '0');

  const failed = results.filter(r => !r.pass).length;
  console.log('\n=== SUMMARY: ' + (results.length - failed) + '/' + results.length + ' passed, ' + failed + ' failed ===');
  fs.writeFileSync('smoke56-report.json', JSON.stringify({ results, uncaught, consoleErrs, logErrs }, null, 2));
  ws.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('DRIVER ERROR: ' + e.message); process.exit(2); });
