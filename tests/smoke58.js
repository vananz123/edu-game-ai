// smoke58.js — CDP smoke for §2.4 text-answer questions (true-false / điền từ / trả lời ngắn).
// Run while the app is started with --remote-debugging-port=9333.
const fs = require('node:fs');
const PORT = 9333;
const GAME_TITLE = 'SMOKE Text Qs 58';
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
  const globals = await must(`({ isTextQuestion: typeof isTextQuestion, scoreTextAnswer: typeof scoreTextAnswer })`);
  check('T0 text-answer globals usable', globals.isTextQuestion === 'function' && globals.scoreTextAnswer === 'function', JSON.stringify(globals));

  // T1 — seed a quiz mixing multiple-choice, true-false, fill-blank, short-answer (via the same IPC save path the importer feeds)
  const t1 = await must(`(async () => {
    const out = [];
    const push = (l, p, e) => out.push([l, !!p, e == null ? '' : String(e)]);
    const existing = state.db.games.find(g => g.title === ${JSON.stringify(GAME_TITLE)});
    if (existing) { await window.eduGame.deleteGame(existing.id); await refreshDb(); }
    // The editor import IPC is dialog-based; seed the parsed shape directly (same as importQuestionsFromFile output).
    const saved = await window.eduGame.saveGame({
      id: '', title: ${JSON.stringify(GAME_TITLE)}, subject: 'Khoa học', grade: '5', template: 'quiz',
      description: 'Smoke text questions', gameSetup: { timePerQuestion: 0, scoringMode: 'cơ bản', pointsEasy: 100, pointsMedium: 200, pointsHard: 300, timeBonus: 0 },
      questions: [
        { id: 'q1', type: 'multiple-choice', prompt: 'Cây xanh quang hợp nhờ chất nào?', options: [{ id: 'a', text: 'Chlorophyll' }, { id: 'b', text: 'Gỗ' }], correctOptionId: 'a', explanation: '', points: 100 },
        { id: 'q2', type: 'true-false', prompt: 'Mặt Trăng tự phát sáng?', options: [{ id: 'a', text: 'Đúng' }, { id: 'b', text: 'Sai' }], correctOptionId: 'b', explanation: '', points: 100 },
        { id: 'q3', type: 'short-answer', prompt: 'Thủ đô của Việt Nam?', options: [], correctOptionId: '', correctAnswer: 'Hà Nội', alternateAnswers: ['Hà Nội nội thành'], explanation: '', points: 100 },
        { id: 'q4', type: 'fill-in-blank', prompt: 'Cây hô hấp nhờ khí ___?', options: [], correctOptionId: '', correctAnswer: 'CO2', explanation: '', points: 100 }
      ]
    });
    await refreshDb();
    push('game saved via IPC', !!saved && saved.questions.length === 4, saved && saved.questions.map(q => q.type).join(','));
    push('text questions keep correctAnswer', saved.questions[2].correctAnswer === 'Hà Nội' && saved.questions[3].correctAnswer === 'CO2', '');
    return out;
  })()`);
  t1.forEach(r => check('T1 seed ' + r[0], r[1], r[2]));

  // T2 — play through all four question types
  const t2 = await must(`(async () => {
    const out = [];
    const push = (l, p, e) => out.push([l, !!p, e == null ? '' : String(e)]);
    const g = state.db.games.find(g => g.title === ${JSON.stringify(GAME_TITLE)});
    if (!g) { push('game found', false, 'MISSING'); return out; }
    playGame(g);
    await new Promise(r => setTimeout(r, 200));
    push('q1 MC options shown', document.querySelectorAll('.answer-option').length === 2, document.querySelectorAll('.answer-option').length);
    document.querySelector('.answer-option[data-answer="a"]').click();
    await new Promise(r => setTimeout(r, 100));
    push('q1 correct', state.gameAnswers[0].correct === true && state.gameAnswers[0].points === 100, JSON.stringify(state.gameAnswers[0]));
    document.getElementById('nextQuestionBtn').click();
    await new Promise(r => setTimeout(r, 150));
    push('q2 true-false options Đúng/Sai', [...document.querySelectorAll('.answer-option')].map(b => b.textContent).join('|').includes('Sai'), [...document.querySelectorAll('.answer-option')].map(b => b.textContent).join('|'));
    document.querySelector('.answer-option[data-answer="b"]').click();
    await new Promise(r => setTimeout(r, 100));
    push('q2 correct', state.gameAnswers[1].correct === true, JSON.stringify(state.gameAnswers[1]));
    document.getElementById('nextQuestionBtn').click();
    await new Promise(r => setTimeout(r, 150));
    push('q3 short-answer input shown', !!document.getElementById('textAnswerInput') && !document.querySelector('.answer-option'), '');
    const input = document.getElementById('textAnswerInput');
    input.value = '  hà   NỘI '; input.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('textAnswerBtn').click();
    await new Promise(r => setTimeout(r, 120));
    push('q3 diacritic/space-insensitive correct', state.gameAnswers[2].correct === true && state.gameAnswers[2].points === 100, JSON.stringify(state.gameAnswers[2]));
    const fb = document.getElementById('answerFeedback')?.textContent || '';
    push('q3 feedback shows model answer', fb.includes('Đáp án đúng') && fb.includes('Hà Nội'), fb.slice(0, 160));
    push('q3 input disabled after answer', document.getElementById('textAnswerInput').disabled === true, '');
    document.getElementById('nextQuestionBtn').click();
    await new Promise(r => setTimeout(r, 150));
    push('q4 fill-blank input shown', !!document.getElementById('textAnswerInput'), '');
    document.getElementById('textAnswerInput').value = 'oxi';
    document.getElementById('textAnswerBtn').click();
    await new Promise(r => setTimeout(r, 120));
    push('q4 wrong text answer scores 0', state.gameAnswers[3].correct === false && state.gameAnswers[3].points === 0, JSON.stringify(state.gameAnswers[3]));
    document.getElementById('nextQuestionBtn').click();
    await new Promise(r => setTimeout(r, 250));
    push('results after 4 questions', !!document.querySelector('.result-screen'), '');
    push('summary 3/4 correct', state.lastSummary.correct === 3 && state.lastSummary.points === 300, JSON.stringify(state.lastSummary));
    const saveStarted = Date.now();
    let savedSession = null;
    while (Date.now() - saveStarted < 8000) {
      savedSession = state.db.sessions.find(item => item.gameId === g.id);
      if (savedSession && /Đã tự lưu/.test(document.getElementById('resultSaveStatus')?.textContent || '')) break;
      await new Promise(r => setTimeout(r, 120));
    }
    push('standard result auto-saved one session', !!savedSession && savedSession.correct === 3 && state.db.sessions.filter(item => item.gameId === g.id).length === 1, savedSession && JSON.stringify({ id: savedSession.id, correct: savedSession.correct }));
    document.getElementById('closeResultBtn').click();
    return out;
  })()`);
  t2.forEach(r => check('T2 text-play ' + r[0], r[1], r[2]));

  // T3 — editor gates: fill-blank without an answer is rejected on save
  const t3 = await must(`(async () => {
    const out = [];
    const push = (l, p, e) => out.push([l, !!p, e == null ? '' : String(e)]);
    const g = state.db.games.find(g => g.title === ${JSON.stringify(GAME_TITLE)});
    editGame(JSON.parse(JSON.stringify(g)));
    await new Promise(r => setTimeout(r, 250));
    push('editor reopened', !!document.querySelector('#editorQuestions'), '');
    document.getElementById('addQuestionBtn').click();
    await new Promise(r => setTimeout(r, 120));
    const last = [...document.querySelectorAll('#editorQuestions .editor-question')].pop();
    const typeSelect = last.querySelector('[data-field="type"]');
    typeSelect.value = 'fill-in-blank'; typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 80));
    push('text answer field visible after type switch', last.querySelector('.text-answer-fields').classList.contains('hidden') === false, last.querySelector('.text-answer-fields').className);
    push('options hidden for fill-blank', last.querySelector('.editor-options').classList.contains('hidden') === true, last.querySelector('.editor-options').className);
    last.querySelector('[data-field="prompt"]').value = 'Câu điền từ mới';
    document.getElementById('saveGameBtn').click();
    await new Promise(r => setTimeout(r, 300));
    push('save blocked without correctAnswer', !!document.querySelector('#modalRoot .modal'), '');
    last.querySelector('[data-field="correct-answer"]').value = 'mới';
    document.getElementById('saveGameBtn').click();
    const t = Date.now();
    while (state.page !== 'library' && Date.now() - t < 6000) await new Promise(r => setTimeout(r, 100));
    push('saved after filling answer', state.page === 'library', state.page);
    const saved = state.db.games.find(g => g.title === ${JSON.stringify(GAME_TITLE)});
    push('5 questions persisted with new fill-blank', saved.questions.length === 5 && saved.questions[4].correctAnswer === 'mới', JSON.stringify(saved.questions[4]));
    return out;
  })()`);
  t3.forEach(r => check('T3 editor-gate ' + r[0], r[1], r[2]));

  // T4 — cleanup
  const t4 = await must(`(async () => {
    const out = [];
    const push = (l, p, e) => out.push([l, !!p, e == null ? '' : String(e)]);
    const g = state.db.games.find(g => g.title === ${JSON.stringify(GAME_TITLE)});
    if (g) { await window.eduGame.deleteGame(g.id); await refreshDb(); }
    push('smoke game deleted', !state.db.games.find(g => g.title === ${JSON.stringify(GAME_TITLE)}), '');
    navigate('home');
    push('home page after tests', state.page === 'home', state.page);
    return out;
  })()`);
  t4.forEach(r => check('T4-cleanup ' + r[0], r[1], r[2]));

  await sleep(500);
  console.log('\n--- PAGE ERRORS ---');
  console.log('uncaught exceptions: ' + uncaught.length);
  uncaught.forEach(e => console.log('  U: ' + String(e).slice(0, 500)));
  console.log('console.error: ' + consoleErrs.length);
  console.log('log errors: ' + logErrs.length);
  logErrs.slice(0, 20).forEach(e => console.log('  L: ' + String(e).slice(0, 300)));
  check('PAGE no uncaught JS exceptions during run', uncaught.length === 0, uncaught[0] || '0');

  const failed = results.filter(r => !r.pass).length;
  console.log('\n=== SUMMARY: ' + (results.length - failed) + '/' + results.length + ' passed, ' + failed + ' failed ===');
  fs.writeFileSync('smoke58-report.json', JSON.stringify({ results, uncaught, consoleErrs, logErrs }, null, 2));
  ws.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('DRIVER ERROR: ' + e.message); process.exit(2); });
