// smoke57.js — CDP-driven UI smoke test for §2.3 "thi đấu đội" team play + leaderboard.
// Run while the app is started with --remote-debugging-port=9333.
const fs = require('node:fs');
const PORT = 9333;
const GAME_TITLE = 'SMOKE Team Play 57';
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
      if (typeof state !== 'undefined' && typeof playGame === 'function' && window.eduGame && document.querySelector('#pageContent')?.children.length) return true;
      await new Promise(r => setTimeout(r, 200));
    }
    return false;
  })()`);
  check('T0 renderer booted', booted, booted);
  const globals = await must(`({ teamPlay: typeof state.teamPlay !== 'undefined', openTeamSetup: typeof openTeamSetup })`);
  check('T0 team globals usable', globals.teamPlay && globals.openTeamSetup === 'function', JSON.stringify(globals));

  // T1 — seed a team-mode quiz through the same IPC save path
  const t1 = await must(`(async () => {
    const out = [];
    const push = (l, p, e) => out.push([l, !!p, e == null ? '' : String(e)]);
    const existing = state.db.games.find(g => g.title === ${JSON.stringify(GAME_TITLE)});
    if (existing) { await window.eduGame.deleteGame(existing.id); await refreshDb(); }
    const saved = await window.eduGame.saveGame({
      id: '', title: ${JSON.stringify(GAME_TITLE)}, subject: 'Toán', grade: '5', template: 'quiz',
      description: 'Smoke team play', gameSetup: { timePerQuestion: 0, scoringMode: 'thi đấu đội', pointsEasy: 100, pointsMedium: 200, pointsHard: 300, timeBonus: 0 },
      questions: [
        { id: 'q1', type: 'multiple-choice', prompt: '1 + 1 = ?', options: [{ id: 'a', text: '2' }, { id: 'b', text: '3' }], correctOptionId: 'a', explanation: 'Tổng 1 và 1 là 2.', points: 100 },
        { id: 'q2', type: 'multiple-choice', prompt: '2 + 2 = ?', options: [{ id: 'a', text: '5' }, { id: 'b', text: '4' }], correctOptionId: 'b', explanation: 'Tổng 2 và 2 là 4.', points: 100 }
      ]
    });
    await refreshDb();
    push('game saved via IPC', !!saved && !!saved.id, saved && saved.id);
    push('scoringMode persisted', saved && saved.gameSetup && saved.gameSetup.scoringMode === 'thi đấu đội', saved && saved.gameSetup && saved.gameSetup.scoringMode);
    return out;
  })()`);
  t1.forEach(r => check('T1 seed ' + r[0], r[1], r[2]));

  // T2 — play opens team setup instead of the first question
  const t2 = await must(`(async () => {
    const out = [];
    const push = (l, p, e) => out.push([l, !!p, e == null ? '' : String(e)]);
    const g = state.db.games.find(g => g.title === ${JSON.stringify(GAME_TITLE)});
    if (!g) { push('game found', false, 'MISSING'); return out; }
    playGame(g);
    await new Promise(r => setTimeout(r, 200));
    push('team setup modal open', !!document.getElementById('startTeamGameBtn'), '');
    push('no question yet', !document.querySelector('.answer-option'), '');
    push('two default team rows', document.querySelectorAll('.team-setup-row').length === 2, document.querySelectorAll('.team-setup-row').length);
    const nameInput = document.querySelector('[data-team-name][data-team-index="0"]');
    nameInput.value = 'Sao đỏ'; nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('addTeamBtn').click();
    await new Promise(r => setTimeout(r, 80));
    push('third team added', document.querySelectorAll('.team-setup-row').length === 3, document.querySelectorAll('.team-setup-row').length);
    document.getElementById('startTeamGameBtn').click();
    await new Promise(r => setTimeout(r, 200));
    push('question 1 visible after start', !!document.querySelector('.answer-option'), '');
    push('team turn bar shows team 1', (document.querySelector('.team-turn-bar')?.textContent || '').includes('Sao đỏ'), document.querySelector('.team-turn-bar')?.textContent);
    return out;
  })()`);
  t2.forEach(r => check('T2 team-setup ' + r[0], r[1], r[2]));

  // T3 — answers: q1 correct goes to team 1, q2 re-assigned to team 3 via the turn select
  const t3 = await must(`(async () => {
    const out = [];
    const push = (l, p, e) => out.push([l, !!p, e == null ? '' : String(e)]);
    const g = state.db.games.find(g => g.title === ${JSON.stringify(GAME_TITLE)});
    document.querySelector('.answer-option[data-answer="a"]').click();
    await new Promise(r => setTimeout(r, 120));
    const fb = document.getElementById('answerFeedback')?.textContent || '';
    push('team 1 awarded 100', state.teamPlay.teams[0].points === 100 && fb.includes('Sao đỏ') && fb.includes('100'), JSON.stringify(state.teamPlay.teams.map(t => ({ n: t.name, p: t.points }))));
    push('turn advanced to team 2', state.teamPlay.turn === 1, state.teamPlay.turn);
    document.getElementById('nextQuestionBtn').click();
    await new Promise(r => setTimeout(r, 150));
    push('question 2 shown', (document.querySelector('.stage-top')?.textContent || '').includes('CÂU 2'), document.querySelector('.stage-top')?.textContent);
    const turnSelect = document.getElementById('teamTurnSelect');
    push('turn select exists on q2', !!turnSelect, '');
    turnSelect.value = '2'; turnSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 100));
    push('turn reassigned to team 3', state.teamPlay.turn === 2, state.teamPlay.turn);
    push('turn bar shows team 3', (document.querySelector('.team-turn-bar')?.textContent || '').includes('Đội C'), document.querySelector('.team-turn-bar')?.textContent);
    document.querySelector('.answer-option[data-answer="b"]').click();
    await new Promise(r => setTimeout(r, 120));
    push('team 3 awarded 100', state.teamPlay.teams[2].points === 100 && state.teamPlay.teams[1].points === 0, JSON.stringify(state.teamPlay.teams.map(t => ({ n: t.name, p: t.points }))));
    push('team 1 correct count = 1', state.teamPlay.teams[0].correct === 1 && state.teamPlay.teams[2].correct === 1, '');
    return out;
  })()`);
  t3.forEach(r => check('T3 team-play ' + r[0], r[1], r[2]));

  // T4 — results: winner banner, leaderboard rows, lastSummary uses winner
  const t4 = await must(`(async () => {
    const out = [];
    const push = (l, p, e) => out.push([l, !!p, e == null ? '' : String(e)]);
    document.getElementById('nextQuestionBtn').click();
    await new Promise(r => setTimeout(r, 250));
    push('results screen', !!document.querySelector('.result-screen'), '');
    const h2 = document.querySelector('.result-screen h2')?.textContent || '';
    push('tie -> first ranked banner (Sao đỏ)', h2.includes('Sao đỏ'), h2);
    push('leaderboard present', !!document.querySelector('.leaderboard'), '');
    push('3 leaderboard rows', document.querySelectorAll('.leaderboard-row').length === 3, document.querySelectorAll('.leaderboard-row').length);
    push('leader row highlighted', !!document.querySelector('.leaderboard-row.leader'), '');
    push('lastSummary winnerTeam', state.lastSummary.winnerTeam === 'Sao đỏ', JSON.stringify(state.lastSummary));
    push('lastSummary points = winner points', state.lastSummary.points === 100, state.lastSummary.points);
    push('percent = 50 (100/200 max)', state.lastSummary.percent === 50, state.lastSummary.percent);
    // replay resets team points, keeps teams
    document.getElementById('replayBtn').click();
    await new Promise(r => setTimeout(r, 150));
    push('replay: question 1 again', !!document.querySelector('.answer-option') && (document.querySelector('.stage-top')?.textContent || '').includes('CÂU 1'), '');
    push('replay: team points reset', state.teamPlay.teams.every(t => t.points === 0 && t.correct === 0), JSON.stringify(state.teamPlay.teams.map(t => t.points)));
    push('replay: 3 teams kept', state.teamPlay.teams.length === 3, state.teamPlay.teams.length);
    document.querySelector('[data-play-close]').click();
    push('play modal closed', !document.querySelector('#playBody'), '');
    return out;
  })()`);
  t4.forEach(r => check('T4 team-results ' + r[0], r[1], r[2]));

  // T5 — validation gates: empty name + duplicate names
  const t5 = await must(`(async () => {
    const out = [];
    const push = (l, p, e) => out.push([l, !!p, e == null ? '' : String(e)]);
    const g = state.db.games.find(g => g.title === ${JSON.stringify(GAME_TITLE)});
    playGame(g);
    await new Promise(r => setTimeout(r, 200));
    push('setup open again', !!document.getElementById('startTeamGameBtn'), '');
    const nameInput = document.querySelector('[data-team-name][data-team-index="1"]');
    nameInput.value = '   '; nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('startTeamGameBtn').click();
    await new Promise(r => setTimeout(r, 120));
    push('empty name blocked', !!document.getElementById('startTeamGameBtn') && !document.querySelector('.answer-option'), '');
    const n0 = document.querySelector('[data-team-name][data-team-index="0"]');
    n0.value = 'Trùng'; n0.dispatchEvent(new Event('input', { bubbles: true }));
    const n1 = document.querySelector('[data-team-name][data-team-index="1"]');
    n1.value = 'trùng '; n1.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('startTeamGameBtn').click();
    await new Promise(r => setTimeout(r, 120));
    push('duplicate name blocked', !!document.getElementById('startTeamGameBtn') && !document.querySelector('.answer-option'), '');
    document.querySelector('[data-play-close2]')?.click();
    push('setup closed', !document.querySelector('#playBody'), '');
    return out;
  })()`);
  t5.forEach(r => check('T5 team-validation ' + r[0], r[1], r[2]));

  // T6 — cleanup
  const t6 = await must(`(async () => {
    const out = [];
    const push = (l, p, e) => out.push([l, !!p, e == null ? '' : String(e)]);
    const g = state.db.games.find(g => g.title === ${JSON.stringify(GAME_TITLE)});
    if (g) { await window.eduGame.deleteGame(g.id); await refreshDb(); }
    push('smoke game deleted', !state.db.games.find(g => g.title === ${JSON.stringify(GAME_TITLE)}), '');
    navigate('home');
    push('home page after tests', state.page === 'home', state.page);
    return out;
  })()`);
  t6.forEach(r => check('T6-cleanup ' + r[0], r[1], r[2]));

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
  fs.writeFileSync('smoke57-report.json', JSON.stringify({ results, uncaught, consoleErrs, logErrs }, null, 2));
  ws.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('DRIVER ERROR: ' + e.message); process.exit(2); });
