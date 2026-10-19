// smoke61.js — G4 CDP e2e: play modal Tailwind (0 style=), data-player-theme từ
// preferences.audience, paintProgress gán style.width, CSS vars (--player-fs) áp dụng.
// Chạy khi app đang mở với --remote-debugging-port=9333:
//   node tests/smoke61.js
const PORT = 9333;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
function check(label, pass, extra) {
  results.push({ label, pass: Boolean(pass) });
  console.log((pass ? 'PASS' : 'FAIL') + ' | ' + label + (extra != null ? '  -> ' + extra : ''));
}

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
  const uncaught = [];
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(m.error.message)) : resolve(m.result);
      return;
    }
    if (m.method === 'Runtime.exceptionThrown') uncaught.push(m.params.exceptionDetails.text);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evalPage = async expression => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
    return r.result.value;
  };
  await send('Runtime.enable');
  // Chờ renderer load script xong (target index.html xuất hiện trước khi scripts chạy).
  const deadline = Date.now() + 60000;
  let ready = false;
  while (Date.now() < deadline) {
    try {
      const r = await send('Runtime.evaluate', {
        expression: "typeof state !== 'undefined' && typeof render === 'function' && typeof saveSettings === 'function' && typeof playGame === 'function'",
        returnByValue: true
      });
      if (r.result && r.result.value) { ready = true; break; }
    } catch {}
    await sleep(1000);
  }
  if (!ready) throw new Error('renderer globals not ready after 60s');
  console.log('RENDERER READY');

  // 1) Settings: select đối tượng có render không
  const s1 = await evalPage(`(()=>{
    state.page = 'settings'; render();
    return { hasSelect: !!document.getElementById('settingAudience'),
             orig: (state.settings && state.settings.preferences && state.settings.preferences.audience) || 'teen' };
  })()`);
  check('settings select #settingAudience rendered', s1.hasSelect);

  try {
    // 2) Lưu audience=child rồi chơi quiz: theme attr + CSS vars + progress paint
    const s2 = await evalPage(`(async () => {
      document.getElementById('settingAudience').value = 'child';
      await saveSettings();
      const quiz = { id: 'g4probe', title: 'G4 probe', template: 'quiz',
        questions: [
          { id: 'q1', prompt: '1+1 = ?', type: 'mcq', options: [{ id: 'a', text: '2' }, { id: 'b', text: '3' }], correctOptionId: 'a', points: 100, explanation: 'ok' },
          { id: 'q2', prompt: '2+2 = ?', type: 'mcq', options: [{ id: 'a', text: '4' }, { id: 'b', text: '5' }], correctOptionId: 'a', points: 100, explanation: 'ok' }
        ],
        gameSetup: { scoringMode: 'cơ bản' } };
      playGame(quiz);
      const modal = document.querySelector('#modalRoot .modal');
      const qEl = document.querySelector('#playBody .stage-question');
      const p0El = document.querySelector('#playBody [data-progress]');
      const out = {
        saved: state.settings.preferences.audience,
        theme: modal && modal.getAttribute('data-player-theme'),
        modalRadius: modal && getComputedStyle(modal).borderRadius,
        fs: qEl && getComputedStyle(qEl).fontSize,
        inlineLeftover: !!document.querySelector('#modalRoot [style]:not([data-progress])'),
        p0: p0El && p0El.style.width
      };
      document.querySelector('#playBody .answer-option').click();
      out.feedback = document.getElementById('answerFeedback').textContent.slice(0, 40);
      out.nextShown = !document.getElementById('nextQuestionBtn').classList.contains('hidden');
      document.getElementById('nextQuestionBtn').click();
      const p1 = document.querySelector('#playBody [data-progress]');
      out.p1 = p1 && p1.style.width;
      document.querySelector('#playBody .answer-option').click();
      document.getElementById('nextQuestionBtn').click();
      out.resultsShown = !!document.querySelector('#playBody .result-screen');
      document.getElementById('modalRoot').innerHTML = '';
      return out;
    })()`);
    check('audience=child persisted', s2.saved === 'child', s2.saved);
    check('play modal has data-player-theme="child"', s2.theme === 'child', s2.theme);
    check('modal --player-radius applied (20px)', s2.modalRadius === '20px', s2.modalRadius);
    check('stage-question --player-fs applied (27px)', s2.fs === '27px', s2.fs);
    check('no leftover template style= in modal', s2.inlineLeftover === false);
    check('paintProgress set initial width', s2.p0 === '0%', s2.p0);
    check('feedback rendered after answer', /Chính xác/.test(s2.feedback), s2.feedback);
    check('next button unhidden', s2.nextShown === true);
    check('progress painted 50% on q2', s2.p1 === '50%', s2.p1);
    check('results screen reached', s2.resultsShown === true);
    // 3) 3 modal shell còn lại có data-player-theme + render board
    const s3 = await evalPage(`(()=>{
      const shells = {};
      state.currentGame = { template: 'matching', matchingGame: { mode: 'columns',
        pairs: [{ id: 'p1', left: 'Trái', right: 'Táo' }, { id: 'p2', left: 'Phải', right: 'Chuối' }],
        practiceMode: false, wrongPenalty: 0, completionBonus: 0, timeBonus: 0 } };
      openMatchingPlay();
      shells.matching = !!document.querySelector('#modalRoot .modal[data-player-theme="child"]') && !!document.querySelector('.match-card');
      document.getElementById('modalRoot').innerHTML = '';
      state.currentGame = { template: 'treasure-hunt', treasureHunt: { character: 'Thám hiểm',
        stages: [{ id: 's1', name: 'Chặng 1', question: { prompt: '?', options: [{ id: 'o1', text: 'a' }], correctOptionId: 'o1' }, points: 100, completionBonus: 50, attempts: 0 }],
        intro: 'x' } };
      openTreasurePlay();
      shells.treasure = !!document.querySelector('#modalRoot .modal[data-player-theme="child"]') && !!document.querySelector('.answer-option');
      document.getElementById('modalRoot').innerHTML = '';
      state.currentGame = { template: 'race', race: {
        teams: [{ id: 't1', name: 'A', icon: 'A' }, { id: 't2', name: 'B', icon: 'B' }],
        questions: [{ id: 'rq1', prompt: '?', options: [{ id: 'o1', text: 'a' }], correctOptionId: 'o1', points: 100 }],
        trackLength: 5, maxRounds: 3, cells: [] } };
      openRacePlay();
      shells.race = !!document.querySelector('#modalRoot .modal[data-player-theme="child"]') && !!document.querySelector('.race-cell');
      document.getElementById('modalRoot').innerHTML = '';
      return shells;
    })()`);
    check('matching shell themed', s3.matching === true);
    check('treasure shell themed', s3.treasure === true);
    check('race shell themed', s3.race === true);

    // 4) Khôi phục teen + verify fallback
    const s4 = await evalPage(`(async () => {
      state.page = 'settings'; render();
      document.getElementById('settingAudience').value = 'teen';
      await saveSettings();
      state.currentGame = { id: 'g4probe', title: 'G4 probe', template: 'quiz',
        questions: [{ id: 'q1', prompt: '?', type: 'mcq', options: [{ id: 'a', text: 'x' }, { id: 'b', text: 'y' }], correctOptionId: 'a', points: 100, explanation: 'ok' }],
        gameSetup: { scoringMode: 'cơ bản' } };
      playGame(state.currentGame);
      const modal = document.querySelector('#modalRoot .modal');
      const theme = modal && modal.getAttribute('data-player-theme');
      const fs = getComputedStyle(document.querySelector('#playBody .stage-question')).fontSize;
      document.getElementById('modalRoot').innerHTML = '';
      state.page = 'home'; render();
      return { theme, fs, saved: state.settings.preferences.audience };
    })()`);
    check('restored audience=teen', s4.saved === 'teen', s4.saved);
    check('theme falls back to teen', s4.theme === 'teen', s4.theme);
    check('teen font size back to 24px', s4.fs === '24px', s4.fs);
  } catch (e) {
    check('probe completed without crash', false, e.message);
  }

  check('0 uncaught exceptions', uncaught.length === 0, uncaught.join(' | '));
  const failed = results.filter(r => !r.pass).length;
  console.log(`\nG4 probe: ${results.length - failed}/${results.length} passed${uncaught.length ? `, uncaught=${uncaught.length}` : ''}`);
  ws.close();
  process.exit(failed ? 1 : 0);


})();
