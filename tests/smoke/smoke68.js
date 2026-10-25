// smoke68.js - CDP-driven UI smoke test for tasknight §5.2:
// journey map + per-stage missions (matching / decode / classification).
// Run while the app is started with --remote-debugging-port=9333.
// Prints PASS/FAIL lines and writes smoke68-report.json.
const fs = require('node:fs');
const PORT = 9333;
const HUNT_TITLE = 'SMOKE Hanh trinh 68';
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

  // T0 - boot + remove stale test game
  const booted = await must(`(async () => {
    const t = Date.now();
    while (Date.now() - t < 30000) {
      if (typeof state !== 'undefined' && typeof navigate === 'function' && window.eduGame && document.querySelector('#pageContent')?.children.length) {
        for (const g of state.db.games.filter(g => g.title === ${JSON.stringify(HUNT_TITLE)})) await window.eduGame.deleteGame(g.id);
        await refreshDb();
        return true;
      }
      await new Promise(r => setTimeout(r, 200));
    }
    return false;
  })()`);
  check('T0 renderer booted', booted, booted);
  const globals = await must(`({ playGame: typeof playGame, editGame: typeof editGame, map: typeof treasureMapHtml })`);
  check('T0 play/editor/map globals usable', globals.playGame === 'function' && globals.editGame === 'function' && globals.map === 'function', JSON.stringify(globals));

  // T1 - save a three-stage treasure game with three different mission types.
  const t1 = await must(`(async () => {
    const out = [];
    const push = (l, p, e) => out.push([l, !!p, e == null ? '' : String(e)]);
    const question = prompt => ({ prompt, options: [], correctOptionId: '', explanation: 'Giải thích cho chặng.', hint: 'Gợi ý cho chặng.' });
    const game = {
      id: 'smoke68-hunt',
      title: ${JSON.stringify(HUNT_TITLE)},
      subject: 'Sinh học', grade: 'Lớp 6', topic: 'Quang hợp',
      template: 'treasure-hunt', description: 'Smoke map + mission types.', questions: [],
      tags: ['SMOKE'], sourceName: 'smoke68.txt',
      treasureHunt: {
        character: 'Nhà thám hiểm', intro: 'Ba chặng, ba kiểu nhiệm vụ.', journeyBonus: 75, hiddenItemBonus: 50,
        stages: [
          {
            id: 's1', name: 'Ghép cặp kiến thức', story: 'Cánh cổng ghép cặp.', taskDescription: 'Ghép đúng hai vế.',
            question: question('Ghép quá trình với mô tả đúng.'),
            mission: { type: 'matching', pairs: [
              { id: 'p1', left: 'Quang hợp', right: 'Tổng hợp chất hữu cơ' },
              { id: 'p2', left: 'Hô hấp', right: 'Giải phóng năng lượng' }
            ] },
            attempts: 0, points: 100, completionBonus: 200, nextStageId: 's2', hasHiddenItem: false
          },
          {
            id: 's2', name: 'Giải mã từ khóa', story: 'Mật mã trên vách đá.', taskDescription: 'Sắp xếp lại mật mã.',
            question: question('Giải mã từ khóa về quá trình cây tạo chất hữu cơ.'),
            mission: { type: 'decode', answer: 'quang hợp', cipher: 'hợp quang' },
            attempts: 0, points: 100, completionBonus: 200, nextStageId: 's3', hasHiddenItem: false
          },
          {
            id: 's3', name: 'Phân loại đặc điểm', story: 'Căn phòng cuối.', taskDescription: 'Xếp mỗi đặc điểm vào đúng nhóm.',
            question: question('Phân loại các đặc điểm của thực vật và động vật.'),
            mission: { type: 'classification', groups: [
              { id: 'g1', name: 'Thực vật' }, { id: 'g2', name: 'Động vật' }
            ], items: [
              { id: 'i1', text: 'Có diệp lục', groupId: 'g1' },
              { id: 'i2', text: 'Có hệ thần kinh', groupId: 'g2' }
            ] },
            attempts: 0, points: 100, completionBonus: 200, nextStageId: null, hasHiddenItem: false
          }
        ]
      }
    };
    const saved = await window.eduGame.saveGame(game);
    await refreshDb();
    const stored = state.db.games.find(g => g.id === 'smoke68-hunt');
    push('saved game returned', !!saved && saved.id === 'smoke68-hunt', saved && saved.id);
    push('game in db', !!stored, '');
    push('stage 1 matching persisted', stored?.treasureHunt?.stages?.[0]?.mission?.type === 'matching', stored?.treasureHunt?.stages?.[0]?.mission?.type);
    push('stage 2 decode persisted', stored?.treasureHunt?.stages?.[1]?.mission?.type === 'decode', stored?.treasureHunt?.stages?.[1]?.mission?.type);
    push('stage 3 classification persisted', stored?.treasureHunt?.stages?.[2]?.mission?.type === 'classification', stored?.treasureHunt?.stages?.[2]?.mission?.type);
    const lib = await window.eduGame.getLibrary();
    push('IPC round-trip carries missions', JSON.stringify(lib).includes('"classification"') && JSON.stringify(lib).includes('"quang hợp"'), '');
    try {
      await window.eduGame.saveGame({ ...game, id: 'smoke68-invalid', treasureHunt: { ...game.treasureHunt, stages: [{ ...game.treasureHunt.stages[0], mission: { type: 'matching', pairs: [{ id: 'p1', left: 'A', right: 'B' }] } }, game.treasureHunt.stages[1], game.treasureHunt.stages[2]] } });
      push('invalid matching mission rejected', false, 'save unexpectedly succeeded');
    } catch (error) {
      push('invalid matching mission rejected', /2 đến 10 cặp/.test(String(error)), String(error).slice(0, 120));
    }
    return out;
  })()`);
  t1.forEach(r => check('T1 variant-save ' + r[0], r[1], r[2]));

  // T2 - play: map states + matching + decode + classification.
  const t2 = await must(`(async () => {
    const out = [];
    const push = (l, p, e) => out.push([l, !!p, e == null ? '' : String(e)]);
    const g = state.db.games.find(g => g.id === 'smoke68-hunt');
    if (!g) { push('hunt game found', false, 'MISSING'); return out; }
    playGame(g);
    await new Promise(r => setTimeout(r, 200));
    const nodes = () => [...document.querySelectorAll('[data-treasure-map] .treasure-map-node')];
    push('play modal open', !!document.querySelector('#playBody'), '');
    push('map rendered with 3 nodes', nodes().length === 3, nodes().length);
    push('map starts current/locked/locked', nodes().map(n => n.dataset.state).join(',') === 'current,locked,locked', nodes().map(n => n.dataset.state).join(','));
    push('mission badge shows Ghép cặp', (document.querySelector('.treasure-mission-badge')?.textContent || '').includes('Ghép cặp'), document.querySelector('.treasure-mission-badge')?.textContent);

    // Matching: one wrong pair, then both correct pairs.
    const lefts = () => [...document.querySelectorAll('[data-match-left]')];
    const rights = () => [...document.querySelectorAll('[data-match-right]')];
    const left0 = lefts()[0];
    const wrongRight = rights().find(b => b.dataset.matchRight !== left0.dataset.matchLeft);
    left0.click();
    wrongRight.click();
    await new Promise(r => setTimeout(r, 80));
    push('matching wrong feedback', (document.getElementById('answerFeedback')?.textContent || '').includes('Chưa khớp'), document.getElementById('answerFeedback')?.textContent);
    for (const left of lefts()) {
      const right = rights().find(b => b.dataset.matchRight === left.dataset.matchLeft);
      left.click();
      right.click();
      await new Promise(r => setTimeout(r, 50));
    }
    push('matching stage completed', !!document.querySelector('.treasure-choice'), document.querySelector('.treasure-choice')?.dataset.choice);
    push('stage 1 node done', nodes()[0].dataset.state === 'done', nodes()[0].dataset.state);
    document.querySelector('.treasure-choice').click();
    await new Promise(r => setTimeout(r, 150));

    // Decode: wrong then correct.
    push('stage 2 node current', nodes()[1].dataset.state === 'current', nodes().map(n => n.dataset.state).join(','));
    push('decode cipher rendered', (document.querySelector('.decode-cipher')?.textContent || '').includes('hợp quang'), document.querySelector('.decode-cipher')?.textContent);
    const decodeInput = document.getElementById('treasureDecodeInput');
    decodeInput.value = 'sai';
    document.getElementById('treasureDecodeSubmit').click();
    await new Promise(r => setTimeout(r, 80));
    push('decode wrong feedback', (document.getElementById('answerFeedback')?.textContent || '').includes('Chưa đúng'), document.getElementById('answerFeedback')?.textContent);
    decodeInput.value = '  Quang   Hợp ';
    document.getElementById('treasureDecodeSubmit').click();
    await new Promise(r => setTimeout(r, 100));
    push('decode stage completed', !!document.querySelector('.treasure-choice'), document.querySelector('.treasure-choice')?.dataset.choice);
    document.querySelector('.treasure-choice').click();
    await new Promise(r => setTimeout(r, 150));

    // Classification: one wrong group, then correct placements.
    push('stage 3 node current', nodes()[2].dataset.state === 'current', nodes().map(n => n.dataset.state).join(','));
    const items = () => [...document.querySelectorAll('[data-class-item]')];
    const groups = () => [...document.querySelectorAll('[data-class-group]')];
    const item0 = items()[0];
    const item0Group = g.treasureHunt.stages[2].mission.items.find(i => i.id === item0.dataset.classItem).groupId;
    const wrongGroup = groups().find(gr => gr.dataset.classGroup !== item0Group);
    item0.click();
    wrongGroup.click();
    await new Promise(r => setTimeout(r, 80));
    push('classification wrong feedback', (document.getElementById('answerFeedback')?.textContent || '').includes('Chưa đúng nhóm'), document.getElementById('answerFeedback')?.textContent);
    for (const item of items()) {
      if (item.classList.contains('placed')) continue;
      const model = g.treasureHunt.stages[2].mission.items.find(i => i.id === item.dataset.classItem);
      item.click();
      groups().find(gr => gr.dataset.classGroup === model.groupId).click();
      await new Promise(r => setTimeout(r, 50));
    }
    push('classification stage completed', !!document.querySelector('.treasure-choice'), document.querySelector('.treasure-choice')?.dataset.choice);
    document.querySelector('.treasure-choice').click();
    await new Promise(r => setTimeout(r, 150));
    push('treasure run finished', state.treasurePlay.done === true, JSON.stringify({ done: state.treasurePlay.done, earned: state.treasurePlay.earned }));
    const score = document.querySelector('.result-score')?.textContent || '';
    push('result score = 975 (3*300 + 75)', score.replace(/[\\s.]/g, '').includes('975'), score);
    const saveStarted = Date.now();
    let savedSession = null;
    while (Date.now() - saveStarted < 8000) {
      savedSession = state.db.sessions.find(item => item.gameId === 'smoke68-hunt');
      if (savedSession && /Đã tự lưu/.test(document.getElementById('resultSaveStatus')?.textContent || '')) break;
      await new Promise(r => setTimeout(r, 120));
    }
    const currentSessionId = state.resultSession?.id;
    push('treasure result auto-saved one session', !!savedSession && savedSession.points === 975 && !!currentSessionId && state.db.sessions.filter(item => item.id === currentSessionId).length === 1, savedSession && JSON.stringify({ id: savedSession.id, current: currentSessionId, points: savedSession.points }));
    document.getElementById('closeResultBtn').click();
    push('play modal closed', !document.querySelector('#playBody'), '');
    return out;
  })()`);
  t2.forEach(r => check('T2 variant-play ' + r[0], r[1], r[2]));

  // T3 - reopen editor, inspect all mission payloads, save an edit, then reject a blank pair.
  const t3 = await must(`(async () => {
    const out = [];
    const push = (l, p, e) => out.push([l, !!p, e == null ? '' : String(e)]);
    const g = state.db.games.find(g => g.id === 'smoke68-hunt');
    if (!g) { push('hunt game found', false, 'MISSING'); return out; }
    editGame(JSON.parse(JSON.stringify(g)));
    await new Promise(r => setTimeout(r, 250));
    const cards = [...document.querySelectorAll('#treasureStages .treasure-stage-card')];
    push('editor has 3 stage cards', cards.length === 3, cards.length);
    push('stage 1 mission selector = matching', cards[0]?.querySelector('[data-stage-mission]')?.value === 'matching', cards[0]?.querySelector('[data-stage-mission]')?.value);
    push('stage 1 has 2 pair rows', cards[0]?.querySelectorAll('[data-match-pair]').length === 2, cards[0]?.querySelectorAll('[data-match-pair]').length);
    push('stage 2 answer = quang hợp', cards[1]?.querySelector('[data-decode-answer]')?.value === 'quang hợp', cards[1]?.querySelector('[data-decode-answer]')?.value);
    push('stage 2 cipher = hợp quang', cards[1]?.querySelector('[data-decode-cipher]')?.value === 'hợp quang', cards[1]?.querySelector('[data-decode-cipher]')?.value);
    push('stage 3 has 2 groups', cards[2]?.querySelectorAll('[data-class-group-row]').length === 2, cards[2]?.querySelectorAll('[data-class-group-row]').length);
    push('stage 3 has 2 items', cards[2]?.querySelectorAll('[data-class-item-row]').length === 2, cards[2]?.querySelectorAll('[data-class-item-row]').length);
    const answer = cards[1].querySelector('[data-decode-answer]');
    answer.value = 'hô hấp';
    answer.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('saveGameBtn').click();
    const t = Date.now();
    while ((document.querySelector('#modalRoot .modal') || state.page !== 'library') && Date.now() - t < 6000) await new Promise(r => setTimeout(r, 100));
    push('edited variant saved -> library', state.page === 'library', state.page);
    const stored = state.db.games.find(g => g.id === 'smoke68-hunt');
    push('decode answer updated', stored?.treasureHunt?.stages?.[1]?.mission?.answer === 'hô hấp', stored?.treasureHunt?.stages?.[1]?.mission?.answer);
    push('matching mission preserved', stored?.treasureHunt?.stages?.[0]?.mission?.type === 'matching', stored?.treasureHunt?.stages?.[0]?.mission?.type);
    push('classification mission preserved', stored?.treasureHunt?.stages?.[2]?.mission?.type === 'classification', stored?.treasureHunt?.stages?.[2]?.mission?.type);

    editGame(JSON.parse(JSON.stringify(stored)));
    await new Promise(r => setTimeout(r, 250));
    const blankPair = document.querySelector('#treasureStages .treasure-stage-card [data-pair-right]');
    blankPair.value = '';
    blankPair.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('saveGameBtn').click();
    await new Promise(r => setTimeout(r, 400));
    push('blank pair keeps editor open', !!document.querySelector('#modalRoot .modal'), '');
    push('library answer unchanged after invalid save', state.db.games.find(g => g.id === 'smoke68-hunt')?.treasureHunt?.stages?.[1]?.mission?.answer === 'hô hấp', '');
    document.querySelector('#modalRoot [data-close]')?.click();
    await new Promise(r => setTimeout(r, 100));
    push('editor closed', !document.querySelector('#modalRoot .modal'), '');
    return out;
  })()`);
  t3.forEach(r => check('T3 variant-editor ' + r[0], r[1], r[2]));

  // T4 - cleanup
  const t4 = await must(`(async () => {
    const out = [];
    const push = (l, p, e) => out.push([l, !!p, e == null ? '' : String(e)]);
    for (const g of state.db.games.filter(g => g.title === ${JSON.stringify(HUNT_TITLE)} || g.id === 'smoke68-invalid')) {
      await window.eduGame.deleteGame(g.id);
    }
    await refreshDb();
    push('smoke games deleted', !state.db.games.some(g => g.title === ${JSON.stringify(HUNT_TITLE)} || g.id === 'smoke68-invalid'), '');
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
  consoleErrs.slice(0, 20).forEach(e => console.log('  C: ' + String(e).slice(0, 300)));
  console.log('log errors: ' + logErrs.length);
  logErrs.slice(0, 20).forEach(e => console.log('  L: ' + String(e).slice(0, 300)));
  check('PAGE no uncaught JS exceptions during run', uncaught.length === 0, uncaught[0] || '0');

  const failed = results.filter(r => !r.pass).length;
  console.log('\n=== SUMMARY: ' + (results.length - failed) + '/' + results.length + ' passed, ' + failed + ' failed ===');
  fs.writeFileSync('smoke68-report.json', JSON.stringify({ results, uncaught, consoleErrs, logErrs }, null, 2));
  ws.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('DRIVER ERROR: ' + e.message); process.exit(2); });
