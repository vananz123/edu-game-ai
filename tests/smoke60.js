// smoke60.js — CDP e2e với model THẬT qua OpenCode Zen (online mode) của chính ứng dụng:
//   cài đặt provider opencode (key tự đọc) → phân tích tài liệu → tạo treasure-hunt & race
//   → lưu (validators của main) → chơi → dọn dẹp + khôi phục cài đặt.
// Chạy khi app đang mở với --remote-debugging-port=9333:
//   node tests/smoke60.js
const fs = require('node:fs');
const PORT = 9333;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const TITLE_TREASURE = 'SMOKE Zen 60 - Kho bau';
const TITLE_RACE = 'SMOKE Zen 60 - Duong dua';
const LESSON = `Bài học: Cây xanh và_photosynthesis_ trong chương trình Khoa học lớp 5.

Nội dung trọng tâm:
- Tế bào lá chứa chất diệp lục có màu xanh, giúp cây hấp thụ ánh sáng mặt trời.
- Quang hợp là quá trình cây dùng ánh sáng, nước và khí cacbonic để tạo ra đường (tinh bột) và thải khí oxy ra không khí.
- Khí thở đi vào lá qua các lỗ nhỏ gọi là khí khổng ở mặt dưới lá.
- Mạng mạch gỗ (gồm ống gỗ và ống rây) đưa nước từ rễ lên lá và đưa đường từ lá đi nuôi cây.
- Rễ hút nước và khoáng chất từ đất; lá là nơi diễn ra quang hợp; hoa và quả phát triển từ những bộ phận này.
- Cây xanh che nắng, giữ đất, cung cấp oxy; vì vậy cần trồng và chăm sóc cây xanh quanh nhà và ở trường học.

Câu hỏi gợi ý cho giáo viên: vì sao lá cây có màu xanh? Vì sao ngày mưa cây dễ bị úng?`;

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
    if (r.error) throw new Error('evaluate failed: ' + r.error + '\n  expr: ' + expr.slice(0, 300));
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
  check('T0 app booted', booted === true, String(booted));

  // T1 — lưu cài đặt OpenCode Zen (key để trống, main tự đọc auth.json cục bộ)
  const t1 = await must(`(async () => {
    const out = [];
    const push = (l, p, e) => out.push([l, !!p, e == null ? '' : String(e)]);
    const orig = await window.eduGame.getSettings();
    window.__smoke60OrigSettings = orig;
    const ai = { ...(orig.ai || {}), mode: 'online', cloudProvider: 'opencode', baseUrl: 'https://opencode.ai/zen/v1', model: 'mimo-v2.6-flash-free', apiKey: '' };
    await window.eduGame.saveSettings({ ai, preferences: orig.preferences || { sound: true, largeText: true } });
    state.settings = await window.eduGame.getSettings();
    push('baseUrl is zen', state.settings.ai.baseUrl === 'https://opencode.ai/zen/v1', state.settings.ai.baseUrl);
    push('model free', state.settings.ai.model === 'mimo-v2.6-flash-free', state.settings.ai.model);
    push('mode online', state.settings.ai.mode === 'online', state.settings.ai.mode);
    push('apiKey empty (main auto-reads local opencode auth.json)', !state.settings.ai.apiKey, JSON.stringify(state.settings.ai.apiKey || ''));
    return out;
  })()`);
  t1.forEach(r => check('T1 settings ' + r[0], r[1], r[2]));

  // T2 — phân tích tài liệu online (assistWithDocument → requestJsonFromCompatibleApi → Zen)
  const t2 = await must(`(async () => {
    const out = [];
    const push = (l, p, e) => out.push([l, !!p, e == null ? '' : String(e)]);
    state.page = 'create';
    state.draft = { ...(state.draft || {}), text: ${JSON.stringify(LESSON)}, mode: 'online' };
    state.selectedTemplate = 'treasure-hunt';
    render();
    await new Promise(r => setTimeout(r, 300));
    const btn = document.querySelector('#analyzeCloudDocumentBtn');
    push('analyze button exists', !!btn, btn ? 'disabled=' + btn.disabled : 'missing');
    if (btn && btn.disabled) btn.disabled = false;
    btn?.click();
    const started = Date.now();
    let lastToast = '';
    while (Date.now() - started < 260000) {
      if (state.draft?.analysis?.summary) break;
      lastToast = document.getElementById('toast')?.textContent || '';
      await new Promise(r => setTimeout(r, 1000));
    }
    const a = state.draft?.analysis;
    push('analysis.summary', a?.summary?.length >= 20, (a?.summary || lastToast || 'timeout').slice(0, 300));
    push('analysis.keyPoints>=3', (a?.keyPoints?.length || 0) >= 3, String(a?.keyPoints?.length || 0));
    push('analysis.suggestedQuestions>=3', (a?.suggestedQuestions?.length || 0) >= 3, String(a?.suggestedQuestions?.length || 0));
    return out;
  })()`);
  t2.forEach(r => check('T2 analyze ' + r[0], r[1], r[2]));

  // T3 — tạo treasure-hunt bằng model thật → trình chỉnh sửa
  const t3 = await must(`(async () => {
    const out = [];
    const push = (l, p, e) => out.push([l, !!p, e == null ? '' : String(e)]);
    state.page = 'create';
    state.selectedTemplate = 'treasure-hunt';
    render();
    await new Promise(r => setTimeout(r, 300));
    const modeSel = document.querySelector('#generationMode');
    if (modeSel && modeSel.value !== 'online') {
      modeSel.value = 'online';
      modeSel.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 300));
    }
    push('mode select online', document.querySelector('#generationMode')?.value === 'online', document.querySelector('#generationMode')?.value);
    const gen = document.querySelector('#generateBtn');
    push('generate button exists', !!gen, gen ? 'disabled=' + gen.disabled : 'missing');
    gen?.click();
    const started = Date.now();
    let lastToast = '';
    while (Date.now() - started < 300000) {
      if (document.querySelector('#saveGameBtn')) break;
      lastToast = document.getElementById('toast')?.textContent || '';
      await new Promise(r => setTimeout(r, 1000));
    }
    push('editor opened', !!document.querySelector('#saveGameBtn'), lastToast || '');
    push('template treasure-hunt', document.querySelector('#editTemplate')?.value === 'treasure-hunt', document.querySelector('#editTemplate')?.value || '');
    const stageCount = Number(document.querySelector('#treasureStageCount')?.textContent || 0);
    push('stages >= 2', stageCount >= 2, String(stageCount));
    return out;
  })()`);
  t3.forEach(r => check('T3 treasure generate ' + r[0], r[1], r[2]));

  // T4 — lưu treasure (main validate) + kiểm tra dữ liệu đã lưu
  const t4 = await must(`(async () => {
    const out = [];
    const push = (l, p, e) => out.push([l, !!p, e == null ? '' : String(e)]);
    if (!document.querySelector('#saveGameBtn')) return out;
    document.querySelector('#editTitle').value = ${JSON.stringify(TITLE_TREASURE)};
    document.querySelector('#saveGameBtn').click();
    const started = Date.now();
    let lastToast = '';
    while (Date.now() - started < 30000) {
      if (state.db.games.find(g => g.title === ${JSON.stringify(TITLE_TREASURE)})) break;
      lastToast = document.getElementById('toast')?.textContent || '';
      await new Promise(r => setTimeout(r, 500));
    }
    const g = state.db.games.find(g => g.title === ${JSON.stringify(TITLE_TREASURE)});
    push('saved to library', !!g, lastToast || '');
    if (g) {
      push('template stored', g.template === 'treasure-hunt', g.template);
      push('treasureHunt stages>=2', (g.treasureHunt?.stages?.length || 0) >= 2, String(g.treasureHunt?.stages?.length || 0));
      const ids = new Set((g.treasureHunt?.stages || []).map(s => s.id));
      const stages = g.treasureHunt?.stages || [];
      const chainOk = stages.length >= 2
        && stages.every(s => s.nextStageId == null || ids.has(s.nextStageId))
        && stages.some(s => s.nextStageId == null);
      push('stage chain valid + ending', chainOk, stages.map(s => String(s.nextStageId)).join(','));
      push('questions>=2', (g.questions?.length || 0) >= 2, String(g.questions?.length || 0));
      window.__smoke60TreasureId = g.id;
    }
    return out;
  })()`);
  t4.forEach(r => check('T4 treasure save ' + r[0], r[1], r[2]));

  // T5 — chơi treasure thật
  const t5 = await must(`(async () => {
    const out = [];
    const push = (l, p, e) => out.push([l, !!p, e == null ? '' : String(e)]);
    const g = state.db.games.find(g => g.title === ${JSON.stringify(TITLE_TREASURE)});
    if (!g) return out;
    playGame(g);
    await new Promise(r => setTimeout(r, 500));
    const top = document.querySelector('#playBody .stage-top');
    push('play modal opened', !!top, '');
    push('stage 1 shown', /CHẶNG 1\\//.test(top?.textContent || ''), (top?.textContent || '').slice(0, 120));
    push('answer options rendered', document.querySelectorAll('#playBody .answer-option').length >= 2, String(document.querySelectorAll('#playBody .answer-option').length));
    document.querySelector('#playBody .answer-option')?.click();
    const started = Date.now();
    while (Date.now() - started < 8000) {
      const fb = document.getElementById('answerFeedback');
      const actions = document.querySelector('#treasureActions .treasure-choice');
      if ((fb && fb.textContent.trim()) || actions) break;
      await new Promise(r => setTimeout(r, 300));
    }
    const fbText = (document.getElementById('answerFeedback')?.textContent || '').trim();
    const nextChoice = !!document.querySelector('#treasureActions .treasure-choice');
    push('answer feedback or next-step', !!fbText || nextChoice, fbText.slice(0, 160));
    document.querySelector('#modalRoot [data-play-close]')?.click();
    await new Promise(r => setTimeout(r, 300));
    push('play modal closed', !document.querySelector('#playBody'), '');
    return out;
  })()`);
  t5.forEach(r => check('T5 treasure play ' + r[0], r[1], r[2]));

  // T6 — tạo race bằng model thật → lưu
  const t6 = await must(`(async () => {
    const out = [];
    const push = (l, p, e) => out.push([l, !!p, e == null ? '' : String(e)]);
    state.page = 'create';
    state.selectedTemplate = 'race';
    render();
    await new Promise(r => setTimeout(r, 300));
    const modeSel = document.querySelector('#generationMode');
    if (modeSel && modeSel.value !== 'online') {
      modeSel.value = 'online';
      modeSel.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 300));
    }
    document.querySelector('#generateBtn')?.click();
    const started = Date.now();
    let lastToast = '';
    while (Date.now() - started < 300000) {
      if (document.querySelector('#saveGameBtn')) break;
      lastToast = document.getElementById('toast')?.textContent || '';
      await new Promise(r => setTimeout(r, 1000));
    }
    push('editor opened', !!document.querySelector('#saveGameBtn'), lastToast || '');
    push('template race', document.querySelector('#editTemplate')?.value === 'race', document.querySelector('#editTemplate')?.value || '');
    push('teams >= 2', Number(document.querySelector('#raceTeamCount')?.textContent || 0) >= 2, document.querySelector('#raceTeamCount')?.textContent || '0');
    push('questions >= 1', Number(document.querySelector('#raceQuestionCount')?.textContent || 0) >= 1, document.querySelector('#raceQuestionCount')?.textContent || '0');
    if (document.querySelector('#saveGameBtn')) {
      document.querySelector('#editTitle').value = ${JSON.stringify(TITLE_RACE)};
      document.querySelector('#saveGameBtn').click();
      const startedSave = Date.now();
      while (Date.now() - startedSave < 30000) {
        if (state.db.games.find(g => g.title === ${JSON.stringify(TITLE_RACE)})) break;
        lastToast = document.getElementById('toast')?.textContent || '';
        await new Promise(r => setTimeout(r, 500));
      }
      const g = state.db.games.find(g => g.title === ${JSON.stringify(TITLE_RACE)});
      push('saved to library', !!g, lastToast || '');
      if (g) {
        push('race teams>=2', (g.race?.teams?.length || 0) >= 2, String(g.race?.teams?.length || 0));
        push('trackLength 3..100', g.race?.trackLength >= 3 && g.race?.trackLength <= 100, String(g.race?.trackLength));
        push('race questions>=1', (g.race?.questions?.length || 0) >= 1, String(g.race?.questions?.length || 0));
        push('questions have difficulty', (g.race?.questions || []).every(q => ['dễ', 'trung bình', 'khó'].includes(q.difficulty)), JSON.stringify((g.race?.questions || []).map(q => q.difficulty)));
      }
    }
    return out;
  })()`);
  t6.forEach(r => check('T6 race ' + r[0], r[1], r[2]));

  // T7 — chơi race thật
  const t7 = await must(`(async () => {
    const out = [];
    const push = (l, p, e) => out.push([l, !!p, e == null ? '' : String(e)]);
    const g = state.db.games.find(g => g.title === ${JSON.stringify(TITLE_RACE)});
    if (!g) return out;
    playGame(g);
    await new Promise(r => setTimeout(r, 500));
    const top = document.querySelector('#playBody .stage-top');
    push('play modal opened', !!top, '');
    push('round 1 shown', /VÒNG 1\\//.test(top?.textContent || ''), (top?.textContent || '').slice(0, 120));
    push('track cells rendered', document.querySelectorAll('#playBody .race-cell').length === g.race.trackLength, document.querySelectorAll('#playBody .race-cell').length + '/' + g.race.trackLength);
    push('scoreboard teams>=2', document.querySelectorAll('#playBody .race-team-row').length >= 2, String(document.querySelectorAll('#playBody .race-team-row').length));
    const draw = document.querySelector('#drawQuestionBtn');
    if (draw) {
      draw.click();
      await new Promise(r => setTimeout(r, 600));
      push('question drawn', !!document.querySelector('#playBody [data-race-answer]') || !!document.querySelector('#raceNoAnswerBtn'), '');
    } else {
      push('question drawn', false, 'draw button missing: ' + (document.querySelector('#raceTurnPanel')?.textContent || '').slice(0, 120));
    }
    document.querySelector('#modalRoot [data-play-close]')?.click();
    await new Promise(r => setTimeout(r, 300));
    push('play modal closed', !document.querySelector('#playBody'), '');
    return out;
  })()`);
  t7.forEach(r => check('T7 race play ' + r[0], r[1], r[2]));

  // T8 — dọn dẹp game smoke + khôi phục cài đặt gốc
  const t8 = await must(`(async () => {
    const out = [];
    const push = (l, p, e) => out.push([l, !!p, e == null ? '' : String(e)]);
    for (const title of ${JSON.stringify([TITLE_TREASURE, TITLE_RACE])}) {
      const g = state.db.games.find(g => g.title === title);
      if (g) { await window.eduGame.deleteGame(g.id); await refreshDb(); }
    }
    push('smoke games deleted', !state.db.games.find(g => g.title === ${JSON.stringify(TITLE_TREASURE)}) && !state.db.games.find(g => g.title === ${JSON.stringify(TITLE_RACE)}), String(state.db.games.length));
    const orig = window.__smoke60OrigSettings;
    if (orig) {
      await window.eduGame.saveSettings(orig);
      state.settings = await window.eduGame.getSettings();
      push('settings restored', state.settings.ai?.mode === (orig.ai?.mode || 'offline') && state.settings.ai?.baseUrl === (orig.ai?.baseUrl || ''), (state.settings.ai?.mode || '') + '/' + (state.settings.ai?.baseUrl || ''));
    }
    navigate('home');
    push('home page', state.page === 'home', state.page);
    return out;
  })()`);
  t8.forEach(r => check('T8 cleanup ' + r[0], r[1], r[2]));

  await sleep(800);
  console.log('\n--- PAGE ERRORS ---');
  console.log('uncaught exceptions: ' + uncaught.length);
  uncaught.forEach(e => console.log('  U: ' + String(e).slice(0, 500)));
  console.log('console.error: ' + consoleErrs.length);
  consoleErrs.slice(0, 10).forEach(e => console.log('  C: ' + String(e).slice(0, 300)));
  console.log('log errors: ' + logErrs.length);
  logErrs.slice(0, 20).forEach(e => console.log('  L: ' + String(e).slice(0, 300)));
  check('PAGE no uncaught JS exceptions during run', uncaught.length === 0, uncaught[0] || '0');

  const failed = results.filter(r => !r.pass).length;
  console.log('\n=== SUMMARY: ' + (results.length - failed) + '/' + results.length + ' passed, ' + failed + ' failed ===');
  fs.writeFileSync('smoke60-report.json', JSON.stringify({ results, uncaught, consoleErrs, logErrs }, null, 2));
  ws.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('DRIVER ERROR: ' + e.message); process.exit(2); });
