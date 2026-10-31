// smoke-ui.js — CDP-driven UI smoke test for tasknight §2.3 + §7.
// Run while the app is started with --remote-debugging-port=9333.
// Prints PASS/FAIL lines and writes smoke-report.json.
const fs = require('node:fs');
const PORT = 9333;
const TITLE = 'SMOKE Tinh diem 2.3';
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
    if (r.error) throw new Error('evaluate failed: ' + r.error + '\n  expr: ' + expr.slice(0, 160));
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
  check('T0 renderer booted (state/navigate/eduGame/#pageContent)', booted, booted);
  const t0 = await must(`({
    runtimeScript: !!document.querySelector('script[src*="game-engine/runtime"]'),
    resolveScoring: typeof resolveScoring,
    scoreAnswer: typeof scoreAnswer,
    scoringModeHintFn: typeof scoringModeHint,
    scoringModes: typeof SCORING_MODES !== 'undefined' ? SCORING_MODES.join('|') : 'MISSING'
  })`);
  check('T0 runtime.js loaded in page', t0.runtimeScript, JSON.stringify(t0));
  check('T0 scoring globals usable', t0.resolveScoring === 'function' && t0.scoreAnswer === 'function', JSON.stringify(t0));

  // T1 — Zone D mode switching
  const t1 = await must(`(() => {
    const out = [];
    const push = (l, p, e) => out.push([l, !!p, e == null ? '' : String(e)]);
    navigate('create');
    const sel = document.getElementById('setupScoringMode');
    if (!sel) return [['zone D select exists', false, 'MISSING']];
    const opts = Array.from(sel.options).map(o => o.value);
    push('5 modes in order', JSON.stringify(opts) === JSON.stringify(['cơ bản','tốc độ','theo độ khó','thi đấu đội','luyện tập']), opts.join('|'));
    push('default mode = toc do', sel.value === 'tốc độ', sel.value);
    push('dynamic hint element', !!document.getElementById('scoringModeHint'), '');
    const modes = ['cơ bản','tốc độ','theo độ khó','thi đấu đội','luyện tập'];
    for (const m of modes) {
      sel.value = m; sel.dispatchEvent(new Event('change', { bubbles: true }));
      const hint = document.getElementById('scoringModeHint')?.textContent;
      push('hint matches mode: ' + m, hint === scoringModeHint(m), hint);
      const tb = document.getElementById('timeBonusField').style.display;
      push('timeBonus field vs mode: ' + m, m === 'tốc độ' ? tb === '' : tb === 'none', 'display=' + (tb || 'inline'));
      for (const id of ['pointsEasyField','pointsMediumField','pointsHardField']) {
        const d = document.getElementById(id).style.display;
        push(id + ' vs mode: ' + m, m === 'theo độ khó' ? d === '' : d === 'none', 'display=' + (d || 'inline'));
      }
      push('draft.gameSetup.scoringMode: ' + m, state.draft?.gameSetup?.scoringMode === m, state.draft?.gameSetup?.scoringMode);
    }
    const tb = document.getElementById('setupTimeBonus');
    tb.value = '999'; tb.dispatchEvent(new Event('change', { bubbles: true }));
    push('timeBonus clamp 999->50', state.draft.gameSetup.timeBonus === '50', state.draft.gameSetup.timeBonus);
    tb.value = '-5'; tb.dispatchEvent(new Event('change', { bubbles: true }));
    push('timeBonus clamp -5->0', state.draft.gameSetup.timeBonus === '0', state.draft.gameSetup.timeBonus);
    tb.value = '20'; tb.dispatchEvent(new Event('change', { bubbles: true }));
    return out;
  })()`);
  t1.forEach(r => check('T1 ' + r[0], r[1], r[2]));

  // T1-legacy — old game without gameSetup keeps default speed scoring (+20)
  const t1b = await must(`(async () => {
    const out = [];
    const push = (l, p, e) => out.push([l, !!p, e == null ? '' : String(e)]);
    const legacy = state.db.games.find(g => !g.gameSetup && g.questions?.length);
    if (!legacy) { push('legacy game in library (skipped if none)', true, 'SKIP'); return out; }
    playGame(legacy);
    await new Promise(r => setTimeout(r, 150));
    const tip = document.querySelector('.stage-bottom span')?.textContent || '';
    push('legacy tip = toc do +20', tip.includes('+20'), tip);
    const a0 = legacy.questions[0];
    document.querySelector('.answer-option[data-answer="' + a0.correctOptionId + '"]')?.click();
    await new Promise(r => setTimeout(r, 80));
    const fb = document.getElementById('answerFeedback')?.textContent || '';
    const a = state.gameAnswers[0];
    push('legacy correct = base+20 with speed bonus', !!(a && a.correct && a.points === (a0.points || 100) + 20 && fb.includes('điểm nhanh')), JSON.stringify({ points: a && a.points, fb: fb.slice(0, 100) }));
    document.querySelector('[data-play-close]')?.click();
    push('legacy play modal closed', !document.querySelector('#playBody'), '');
    return out;
  })()`);
  t1b.forEach(r => check('T1-legacy ' + r[0], r[1], r[2]));

  // T2 — blank game: difficulty mode + custom table + question difficulty -> save to library
  const t2 = await must(`(async () => {
    const out = [];
    const push = (l, p, e) => out.push([l, !!p, e == null ? '' : String(e)]);
    navigate('create');
    await new Promise(r => setTimeout(r, 120));
    const sel = document.getElementById('setupScoringMode');
    sel.value = 'theo độ khó'; sel.dispatchEvent(new Event('change', { bubbles: true }));
    const setNum = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); };
    setNum('setupPointsEasy', '111'); setNum('setupPointsMedium', '222'); setNum('setupPointsHard', '333');
    push('draft difficulty table 111/222/333', [state.draft.gameSetup.pointsEasy, state.draft.gameSetup.pointsMedium, state.draft.gameSetup.pointsHard].join('/') === '111/222/333', JSON.stringify(state.draft.gameSetup));
    document.getElementById('gameTitle').value = ${JSON.stringify(TITLE)};
    document.getElementById('gameSubject').value = 'Toán';
    document.getElementById('previewManualBtn').click();
    await new Promise(r => setTimeout(r, 250));
    push('editor modal opened', !!document.querySelector('#modalRoot .modal'), '');
    push('title carried to editor', document.getElementById('editTitle')?.value === ${JSON.stringify(TITLE)}, document.getElementById('editTitle')?.value);
    const qEl = document.querySelector('.editor-question');
    push('sample question present', !!qEl, '');
    const dsel = qEl && qEl.querySelector('[data-field="difficulty"]');
    push('difficulty select in question form', !!dsel, '');
    if (dsel) { dsel.value = 'khó'; dsel.dispatchEvent(new Event('change', { bubbles: true })); }
    document.getElementById('saveGameBtn').click();
    const t = Date.now();
    while (state.page !== 'library' && Date.now() - t < 6000) await new Promise(r => setTimeout(r, 100));
    push('saved -> library page', state.page === 'library', state.page);
    const saved = state.db.games.find(g => g.title === ${JSON.stringify(TITLE)});
    push('game in state.db', !!saved, '');
    if (saved) {
      push('persisted scoringMode = theo do kho', saved.gameSetup && saved.gameSetup.scoringMode === 'theo độ khó', saved.gameSetup && saved.gameSetup.scoringMode);
      push('persisted table 111/333', saved.gameSetup && saved.gameSetup.pointsEasy === '111' && saved.gameSetup.pointsHard === '333', JSON.stringify(saved.gameSetup));
      push('persisted timeBonus in 0..50', saved.gameSetup && Number(saved.gameSetup.timeBonus) >= 0 && Number(saved.gameSetup.timeBonus) <= 50, saved.gameSetup && saved.gameSetup.timeBonus);
      push('persisted question difficulty = kho', saved.questions && saved.questions[0] && saved.questions[0].difficulty === 'khó', saved.questions && saved.questions[0] && saved.questions[0].difficulty);
      const lib = await window.eduGame.getLibrary();
      const s = JSON.stringify(lib);
      push('IPC library:get round-trip carries setup+difficulty',
        s.includes(${JSON.stringify(TITLE)}) && s.includes('"scoringMode":"theo độ khó"') && s.includes('"difficulty":"khó"'), '');
    }
    return out;
  })()`);
  t2.forEach(r => check('T2 ' + r[0], r[1], r[2]));

  // T3 — play in "theo do kho": hard custom 333, no speed bonus, results screen
  const t3 = await must(`(async () => {
    const out = [];
    const push = (l, p, e) => out.push([l, !!p, e == null ? '' : String(e)]);
    const g = state.db.games.find(g => g.title === ${JSON.stringify(TITLE)});
    if (!g) { push('smoke game found for play', false, 'MISSING'); return out; }
    playGame(g);
    await new Promise(r => setTimeout(r, 150));
    const tip = document.querySelector('.stage-bottom span')?.textContent || '';
    push('tip shows custom difficulty table 111..333', tip.includes('111') && tip.includes('333'), tip);
    document.querySelector('.answer-option[data-answer="' + g.questions[0].correctOptionId + '"]').click();
    await new Promise(r => setTimeout(r, 80));
    const fb = document.getElementById('answerFeedback')?.textContent || '';
    push('feedback shows 333', fb.includes('333'), fb.slice(0, 140));
    push('feedback has NO speed bonus', !fb.includes('điểm nhanh'), fb.slice(0, 140));
    push('answer recorded points=333', state.gameAnswers[0] && state.gameAnswers[0].points === 333, JSON.stringify(state.gameAnswers[0]));
    document.getElementById('nextQuestionBtn').click();
    await new Promise(r => setTimeout(r, 400));
    const score = document.querySelector('.result-score')?.textContent || '';
    const ps = Array.from(document.querySelectorAll('.result-screen p')).map(p => p.textContent).join(' | ');
    push('result screen 333 diem', score.replace(/\\s/g, '').includes('333'), score);
    push('result summary 1/1 + 100%', ps.includes('1/1') && ps.includes('100%'), ps);
    document.getElementById('closeResultBtn').click();
    push('play modal closed', !document.querySelector('#playBody'), '');
    return out;
  })()`);
  t3.forEach(r => check('T3-difficulty-play ' + r[0], r[1], r[2]));

  // T4 — speed mode, timeBonus=40 -> 140 points incl. "+40 diem nhanh"
  const t4 = await must(`(async () => {
    const out = [];
    const push = (l, p, e) => out.push([l, !!p, e == null ? '' : String(e)]);
    const g = state.db.games.find(g => g.title === ${JSON.stringify(TITLE)});
    if (!g) { push('smoke game found', false, 'MISSING'); return out; }
    g.gameSetup.scoringMode = 'tốc độ'; g.gameSetup.timeBonus = '40';
    playGame(g);
    await new Promise(r => setTimeout(r, 150));
    const tip = document.querySelector('.stage-bottom span')?.textContent || '';
    push('speed tip shows +40', tip.includes('+40'), tip);
    document.querySelector('.answer-option[data-answer="' + g.questions[0].correctOptionId + '"]').click();
    await new Promise(r => setTimeout(r, 80));
    const fb = document.getElementById('answerFeedback')?.textContent || '';
    push('feedback 140 = 100 + 40', fb.includes('140'), fb.slice(0, 140));
    push('feedback includes +40 speed', fb.includes('+40'), fb.slice(0, 140));
    push('recorded points=140', state.gameAnswers[0] && state.gameAnswers[0].points === 140, JSON.stringify(state.gameAnswers[0]));
    document.getElementById('nextQuestionBtn').click();
    await new Promise(r => setTimeout(r, 400));
    const score = document.querySelector('.result-score')?.textContent || '';
    push('result screen 140', score.replace(/\\s/g, '').includes('140'), score);
    document.getElementById('closeResultBtn').click();
    g.gameSetup.scoringMode = 'theo độ khó'; g.gameSetup.timeBonus = '20';
    return out;
  })()`);
  t4.forEach(r => check('T4-speed-play ' + r[0], r[1], r[2]));

  // T5 — §7 teaching style: fields, save, persist, re-render refill, testAi keeps prefs, restore
  const t5 = await must(`(async () => {
    const out = [];
    const push = (l, p, e) => out.push([l, !!p, e == null ? '' : String(e)]);
    navigate('settings');
    await new Promise(r => setTimeout(r, 250));
    const ids = ['settingStyleTone','settingStyleHumor','settingStyleExamples','settingVisualStyle','settingStyleNotes'];
    const missing = ids.filter(i => !document.getElementById(i));
    push('all 5 style fields exist', missing.length === 0, missing.join(','));
    const panel = document.getElementById('settingStyleNotes')?.closest('section');
    push('panel h3 = Phong cach giang day', (panel?.querySelector('h3')?.textContent || '').includes('Phong cách giảng dạy'), panel?.querySelector('h3')?.textContent);
    push('panel hint mentions AI default', (panel?.textContent || '').includes('AI dùng làm mặc định'), '');
    const before = JSON.parse(JSON.stringify(state.settings.preferences || {}));
    const orig = ids.map(i => document.getElementById(i).value);
    document.getElementById('settingStyleTone').value = 'dí dỏm';
    document.getElementById('settingStyleHumor').value = 'nhiều hình ảnh vui nhộn';
    document.getElementById('settingStyleExamples').value = 'tình huống giao thông nông thôn';
    document.getElementById('settingVisualStyle').value = 'hoạt hình vẽ tay';
    document.getElementById('settingStyleNotes').value = 'SMOKE-NOTES-2026';
    document.getElementById('saveSettingsBtn').click();
    let t = Date.now();
    while (state.settings.preferences?.teachingStyle?.notes !== 'SMOKE-NOTES-2026' && Date.now() - t < 6000) await new Promise(r => setTimeout(r, 100));
    push('teachingStyle in state.settings', state.settings.preferences?.teachingStyle?.notes === 'SMOKE-NOTES-2026', JSON.stringify(state.settings.preferences?.teachingStyle));
    const disk = await window.eduGame.getSettings();
    push('teachingStyle persisted via settings:get', disk.preferences?.teachingStyle?.tone === 'dí dỏm' && disk.preferences?.teachingStyle?.notes === 'SMOKE-NOTES-2026', JSON.stringify(disk.preferences?.teachingStyle));
    push('preferences kept other keys', (before.teachingStyle ? true : Object.keys(state.settings.preferences || {}).length >= 1), Object.keys(state.settings.preferences || {}).join(','));
    navigate('home'); navigate('settings');
    await new Promise(r => setTimeout(r, 250));
    push('fields refilled after re-render', document.getElementById('settingStyleNotes').value === 'SMOKE-NOTES-2026' && document.getElementById('settingStyleTone').value === 'dí dỏm', '');
    if (state.settings.ai && state.settings.ai.mode === 'offline') {
      const prefBefore = JSON.stringify(state.settings.preferences);
      // #132: `state.settings.ai.mode` is what testAi() reads now (the old select is gone).
  state.settings.ai = { ...(state.settings.ai || {}), mode: 'offline' };
  await testAi();
      push('testAi keeps preferences (offline path)', JSON.stringify(state.settings.preferences) === prefBefore, '');
    } else {
      push('testAi skipped (not offline mode)', true, 'SKIP');
    }
    await window.eduGame.saveSettings({ ...state.settings, preferences: before });
    state.settings = await window.eduGame.getSettings();
    push('settings fully restored', JSON.stringify(state.settings.preferences) === JSON.stringify(before), '');
    navigate('home'); navigate('settings');
    await new Promise(r => setTimeout(r, 250));
    push('form refilled with restored values (no smoke leftovers)',
      document.getElementById('settingStyleNotes').value === ((before.teachingStyle && before.teachingStyle.notes) || '') &&
      document.getElementById('settingStyleTone').value === ((before.teachingStyle && before.teachingStyle.tone) || 'thân thiện'),
      document.getElementById('settingStyleTone').value + ' / ' + document.getElementById('settingStyleNotes').value);
    return out;
  })()`);
  t5.forEach(r => check('T5-style ' + r[0], r[1], r[2]));

  // T7 — cleanup smoke game, stay on home (app left running for manual check)
  const t7 = await must(`(async () => {
    const out = [];
    const push = (l, p, e) => out.push([l, !!p, e == null ? '' : String(e)]);
    const g = state.db.games.find(g => g.title === ${JSON.stringify(TITLE)});
    if (g) { await window.eduGame.deleteGame(g.id); await refreshDb(); }
    push('smoke game deleted', !state.db.games.find(g => g.title === ${JSON.stringify(TITLE)}), '');
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
  fs.writeFileSync('smoke-report.json', JSON.stringify({ results, uncaught, consoleErrs, logErrs }, null, 2));
  ws.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('DRIVER ERROR: ' + e.message); process.exit(2); });
