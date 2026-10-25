// smoke59.js — CDP smoke for import polish: duplicate detection + summary toast.
// Run while the app is started with --remote-debugging-port=9333.
const fs = require('node:fs');
const PORT = 9333;
const GAME_TITLE = 'SMOKE Import 59';
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

  // T0 — boot + dedupe helper exposed as a plain-script global
  const booted = await must(`(async () => {
    const t = Date.now();
    while (Date.now() - t < 30000) {
      if (typeof state !== 'undefined' && typeof editGame === 'function' && window.eduGame && document.querySelector('#pageContent')?.children.length) return true;
      await new Promise(r => setTimeout(r, 200));
    }
    return false;
  })()`);
  check('T0 renderer booted', booted, booted);
  const globals = await must(`({ dedupe: typeof dedupeImportedQuestions, fingerprint: typeof questionFingerprint, apply: typeof applyImportedQuestions })`);
  check('T0 dedupe/apply globals usable', globals.dedupe === 'function' && globals.fingerprint === 'function' && globals.apply === 'function', JSON.stringify(globals));

  // T1 — seed a 2-question quiz and open the editor
  const t1 = await must(`(async () => {
    const out = [];
    const push = (l, p, e) => out.push([l, !!p, e == null ? '' : String(e)]);
    const existing = state.db.games.find(g => g.title === ${JSON.stringify(GAME_TITLE)});
    if (existing) { await window.eduGame.deleteGame(existing.id); await refreshDb(); }
    const saved = await window.eduGame.saveGame({
      id: '', title: ${JSON.stringify(GAME_TITLE)}, subject: 'Khoa học', grade: '5', template: 'quiz',
      description: 'Smoke import dedupe', gameSetup: { timePerQuestion: 0, scoringMode: 'cơ bản', pointsEasy: 100, pointsMedium: 200, pointsHard: 300, timeBonus: 0 },
      questions: [
        { id: 'q1', type: 'multiple-choice', prompt: 'Cây xanh quang hợp nhờ chất nào?', options: [{ id: 'a', text: 'Chlorophyll' }, { id: 'b', text: 'Gỗ' }], correctOptionId: 'a', explanation: '', points: 100 },
        { id: 'q2', type: 'fill-in-blank', prompt: 'Cây hô hấp nhờ khí ___?', options: [], correctOptionId: '', correctAnswer: 'CO2', explanation: '', points: 100 }
      ]
    });
    await refreshDb();
    push('game saved via IPC', !!saved && saved.questions.length === 2, saved && String(saved.questions.length));
    editGame(JSON.parse(JSON.stringify(saved)));
    await new Promise(r => setTimeout(r, 250));
    push('editor open with 2 questions', document.querySelectorAll('#editorQuestions .editor-question').length === 2, document.querySelectorAll('#editorQuestions .editor-question').length);
    return out;
  })()`);
  t1.forEach(r => check('T1 seed ' + r[0], r[1], r[2]));

  // T2 — applyImportedQuestions (the exact code the import button runs after the file dialog):
  // canned file = 1 dup of q1 (diacritic/space variant), 1 dup of q2 (text answer variant),
  // 1 dup inside the batch, 2 genuinely new.
  const t2 = await must(`(async () => {
    const out = [];
    const push = (l, p, e) => out.push([l, !!p, e == null ? '' : String(e)]);
    const holder = { questions: [
      { id: 'q1', type: 'multiple-choice', prompt: 'Cây xanh quang hợp nhờ chất nào?', options: [{ id: 'a', text: 'Chlorophyll' }, { id: 'b', text: 'Gỗ' }], correctOptionId: 'a', explanation: '', points: 100 },
      { id: 'q2', type: 'fill-in-blank', prompt: 'Cây hô hấp nhờ khí ___?', options: [], correctOptionId: '', correctAnswer: 'CO2', explanation: '', points: 100 }
    ] };
    const canned = {
      name: 'bai-hoc.csv',
      questions: [
        { id: 'x1', type: 'multiple-choice', prompt: '  cây xanh  QUANG HỢP nhờ chất nào?', options: [{ id: 'a', text: 'chlorophyll  ' }, { id: 'b', text: 'Gỗ' }], correctOptionId: 'a', explanation: '', points: 100 },
        { id: 'x2', type: 'fill-in-blank', prompt: 'Cây hô hấp nhờ khí ___?', options: [], correctOptionId: '', correctAnswer: '  co2 ', explanation: '', points: 100 },
        { id: 'x3', type: 'fill-in-blank', prompt: 'Cây hô hấp nhờ khí ___?', options: [], correctOptionId: '', correctAnswer: 'CO2', explanation: '', points: 100 },
        { id: 'x4', type: 'true-false', prompt: 'Mặt Trăng tự phát sáng?', options: [{ id: 'a', text: 'Đúng' }, { id: 'b', text: 'Sai' }], correctOptionId: 'b', explanation: '', points: 100 },
        { id: 'x5', type: 'multiple-choice', prompt: 'Nước sôi ở bao nhiêu độ C?', options: [{ id: 'a', text: '50' }, { id: 'b', text: '100' }], correctOptionId: 'b', explanation: '', points: 100 }
      ]
    };
    const added = applyImportedQuestions($('#modalRoot'), holder, canned);
    await new Promise(r => setTimeout(r, 200));
    push('apply returns true', added === true, String(added));
    push('game object gained 2 questions', holder.questions.length === 4, holder.questions.length);
    push('new question ids regenerated', holder.questions[2].id !== 'x4' && holder.questions[3].id !== 'x5', holder.questions[2].id + ',' + holder.questions[3].id);
    push('4 editor cards after import', document.querySelectorAll('#editorQuestions .editor-question').length === 4, document.querySelectorAll('#editorQuestions .editor-question').length);
    const toastText = document.getElementById('toast')?.textContent || '';
    push('toast reports skipped duplicates', toastText.includes('Đã nhập 2 câu') && toastText.includes('bỏ qua 3 câu trùng'), toastText);
    push('toast visible', document.getElementById('toast').classList.contains('show'), '');
    const again = applyImportedQuestions($('#modalRoot'), holder, canned);
    await new Promise(r => setTimeout(r, 200));
    push('all-duplicate import returns false', again === false, String(again));
    push('all-duplicate adds nothing', holder.questions.length === 4 && document.querySelectorAll('#editorQuestions .editor-question').length === 4, holder.questions.length + '/' + document.querySelectorAll('#editorQuestions .editor-question').length);
    push('all-duplicate toast', (document.getElementById('toast')?.textContent || '').includes('đã trùng với câu hiện có'), document.getElementById('toast')?.textContent);
    push('cancel (null import) is a no-op', applyImportedQuestions($('#modalRoot'), holder, null) === false, '');
    return out;
  })()`);
  t2.forEach(r => check('T2 dedupe ' + r[0], r[1], r[2]));

  // T3 — 200-question cap counts only the questions that would actually be added
  const t3 = await must(`(async () => {
    const out = [];
    const push = (l, p, e) => out.push([l, !!p, e == null ? '' : String(e)]);
    const holder = { questions: Array.from({ length: 4 }, (_, i) => ({ id: 'h' + i, type: 'multiple-choice', prompt: 'Câu hiện có ' + i + '?', options: [{ id: 'a', text: 'Một' }, { id: 'b', text: 'Hai' }], correctOptionId: 'a', explanation: '', points: 100 })) };
    const big = {
      name: 'qua-nhieu.csv',
      questions: Array.from({ length: 200 }, (_, i) => ({
        id: 'big' + i, type: 'multiple-choice', prompt: 'Câu hỏi số ' + i + ' về môi trường?',
        options: [{ id: 'a', text: 'Một' }, { id: 'b', text: 'Hai' }], correctOptionId: 'a', explanation: '', points: 100
      }))
    };
    const ok = applyImportedQuestions($('#modalRoot'), holder, big);
    await new Promise(r => setTimeout(r, 200));
    push('cap returns false', ok === false, String(ok));
    push('cap toast shown', (document.getElementById('toast')?.textContent || '').includes('tối đa 200 câu hỏi'), document.getElementById('toast')?.textContent);
    push('cap keeps game and editor unchanged', holder.questions.length === 4 && document.querySelectorAll('#editorQuestions .editor-question').length === 4, holder.questions.length + '/' + document.querySelectorAll('#editorQuestions .editor-question').length);
    return out;
  })()`);
  t3.forEach(r => check('T3 cap ' + r[0], r[1], r[2]));

  // T4 — close editor without saving, cleanup
  const t4 = await must(`(async () => {
    const out = [];
    const push = (l, p, e) => out.push([l, !!p, e == null ? '' : String(e)]);
    document.querySelector('#modalRoot .modal-close')?.click();
    await new Promise(r => setTimeout(r, 200));
    push('editor closed without saving', !document.querySelector('#editorQuestions'), '');
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
  fs.writeFileSync('smoke59-report.json', JSON.stringify({ results, uncaught, consoleErrs, logErrs }, null, 2));
  ws.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('DRIVER ERROR: ' + e.message); process.exit(2); });
