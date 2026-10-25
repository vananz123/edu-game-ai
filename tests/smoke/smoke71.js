// smoke71.js - CDP smoke test for §5.2b: treasure backgrounds, avatars and sound.
// Run while the app is started with --remote-debugging-port=9333.
const fs = require('node:fs');
const PORT = 9333;
const TITLE = 'SMOKE Ban do 71';
const LEGACY_TITLE = 'SMOKE Ban do 71 cu';
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

  const booted = await must(`(async () => {
    const t = Date.now();
    while (Date.now() - t < 30000) {
      if (typeof state !== 'undefined' && typeof playGame === 'function' && window.eduGame && document.querySelector('#pageContent')?.children.length) {
        for (const g of state.db.games.filter(g => g.title === ${JSON.stringify(TITLE)} || g.title === ${JSON.stringify(LEGACY_TITLE)})) await window.eduGame.deleteGame(g.id);
        await refreshDb();
        return true;
      }
      await new Promise(r => setTimeout(r, 200));
    }
    return false;
  })()`);
  check('T0 renderer booted', booted, booted);

  const t1 = await must(`(async () => {
    const out = [];
    const push = (l, p, e) => out.push([l, !!p, e == null ? '' : String(e)]);
    const q = (prompt) => ({ prompt, options: [{id:'a',text:'Đáp án A'},{id:'b',text:'Đáp án B'}], correctOptionId:'a', explanation:'Giải thích.', hint:'Gợi ý.' });
    const stages = [
      { id:'s1', name:'Cổng rừng', story:'Bạn bước vào khu rừng.', taskDescription:'Chọn đáp án đúng.', question:q('Câu hỏi một?'), attempts:0, points:100, completionBonus:200, nextStageId:'s2', hasHiddenItem:false },
      { id:'s2', name:'Kho báu', story:'Kho báu đã mở.', taskDescription:'Chọn đáp án đúng.', question:q('Câu hỏi hai?'), attempts:0, points:100, completionBonus:200, nextStageId:null, hasHiddenItem:false }
    ];
    const art = await window.eduGame.saveGame({
      id:'smoke71-art', title:${JSON.stringify(TITLE)}, subject:'Sinh học', grade:'Lớp 6', topic:'Rừng',
      template:'treasure-hunt', description:'Smoke art.', questions:[], tags:['SMOKE'], sourceName:'smoke71.txt',
      treasureHunt:{ character:'Nhà thám hiểm', intro:'Một hành trình nhiều màu sắc.', journeyBonus:75, hiddenItemBonus:50, backgroundId:'forest', characterId:'scientist', stages }
    });
    const legacy = await window.eduGame.saveGame({
      id:'smoke71-legacy', title:${JSON.stringify(LEGACY_TITLE)}, subject:'Sinh học', grade:'Lớp 6', topic:'Rừng',
      template:'treasure-hunt', description:'Legacy art fallback.', questions:[], tags:['SMOKE'], sourceName:'smoke71.txt',
      treasureHunt:{ character:'Nhà thám hiểm', intro:'Dữ liệu cũ.', journeyBonus:75, hiddenItemBonus:50, stages }
    });
    await refreshDb();
    const stored = state.db.games.find(g => g.id === art.id);
    const old = state.db.games.find(g => g.id === legacy.id);
    push('art fields persisted', stored?.treasureHunt?.backgroundId === 'forest' && stored?.treasureHunt?.characterId === 'scientist', JSON.stringify(stored?.treasureHunt && { backgroundId: stored.treasureHunt.backgroundId, characterId: stored.treasureHunt.characterId }));
    push('legacy omits art fields', old?.treasureHunt?.backgroundId === undefined && old?.treasureHunt?.characterId === undefined, JSON.stringify(old?.treasureHunt && { backgroundId: old.treasureHunt.backgroundId, characterId: old.treasureHunt.characterId }));
    return out;
  })()`);
  t1.forEach(r => check('T1 art-save ' + r[0], r[1], r[2]));

  const t2 = await must(`(async () => {
    const out = [];
    const push = (l, p, e) => out.push([l, !!p, e == null ? '' : String(e)]);
    document.querySelector('#modalRoot').innerHTML = '';
    playGame(state.db.games.find(g => g.id === 'smoke71-art'));
    await new Promise(r => setTimeout(r, 300));
    const map = document.querySelector('[data-treasure-map]');
    push('map has forest background', map?.dataset.background === 'forest', map?.dataset.background);
    push('background SVG is rendered', !!map?.querySelector('.treasure-backdrop svg'));
    push('character SVG is rendered', map?.dataset.character === 'scientist' && !!map?.querySelector('.treasure-map-hero .treasure-avatar svg'));
    push('story uses the character avatar', !!document.querySelector('.treasure-storyline .treasure-avatar[data-character="scientist"]'));
    const sound = map?.querySelector('[data-treasure-sound]');
    push('sound toggle is on by default', sound?.getAttribute('aria-pressed') === 'true', sound?.getAttribute('aria-pressed'));
    GameAudio.setEnabled(true);
    sound?.click();
    const off = GameAudio.isEnabled() === false && sound?.getAttribute('aria-pressed') === 'false' && (() => { try { return localStorage.getItem('edugame.player.sound'); } catch { return ''; } })() === 'off';
    push('sound toggle mutes and persists', off, JSON.stringify({ enabled: GameAudio.isEnabled(), pressed: sound?.getAttribute('aria-pressed') }));
    sound?.click();
    push('sound toggle unmutes', GameAudio.isEnabled() === true && sound?.getAttribute('aria-pressed') === 'true');
    window.__smokeSounds = [];
    const originalPlay = GameAudio.play;
    GameAudio.play = name => window.__smokeSounds.push(name);
    document.querySelector('.answer-option[data-answer="a"]')?.click();
    const afterCorrect = window.__smokeSounds.slice();
    document.querySelector('.treasure-choice')?.click();
    const afterNext = window.__smokeSounds.slice();
    GameAudio.play = originalPlay;
    push('correct answer emits correct sound', afterCorrect.includes('correct'), JSON.stringify(afterCorrect));
    push('stage transition emits stage sound', afterNext.includes('stage'), JSON.stringify(afterNext));
    push('theme survives stage transition', document.querySelector('[data-treasure-map]')?.dataset.background === 'forest');
    document.querySelector('#modalRoot').innerHTML = '';
    playGame(state.db.games.find(g => g.id === 'smoke71-legacy'));
    await new Promise(r => setTimeout(r, 300));
    const oldMap = document.querySelector('[data-treasure-map]');
    push('legacy game falls back to temple', oldMap?.dataset.background === 'temple', oldMap?.dataset.background);
    push('legacy game falls back to explorer', oldMap?.dataset.character === 'explorer', oldMap?.dataset.character);
    document.querySelector('#modalRoot').innerHTML = '';
    return out;
  })()`);
  t2.forEach(r => check('T2 art-play ' + r[0], r[1], r[2]));

  const t3 = await must(`(async () => {
    const out = [];
    const push = (l, p, e) => out.push([l, !!p, e == null ? '' : String(e)]);
    document.querySelector('#modalRoot').innerHTML = '';
    editGame(state.db.games.find(g => g.id === 'smoke71-art'));
    await new Promise(r => setTimeout(r, 200));
    const bg = document.querySelector('#treasureBackground');
    const ch = document.querySelector('#treasureCharacterStyle');
    push('editor restores background', bg?.value === 'forest', bg?.value);
    push('editor restores character', ch?.value === 'scientist', ch?.value);
    push('editor preview matches saved art', document.querySelector('[data-treasure-preview]')?.dataset.previewBackground === 'forest' && document.querySelector('[data-treasure-preview]')?.dataset.previewCharacter === 'scientist');
    if (bg && ch) {
      bg.value = 'space'; bg.dispatchEvent(new Event('change', { bubbles: true }));
      ch.value = 'astronaut'; ch.dispatchEvent(new Event('change', { bubbles: true }));
    }
    push('editor preview follows selects', document.querySelector('[data-treasure-preview]')?.dataset.previewBackground === 'space' && document.querySelector('[data-treasure-preview]')?.dataset.previewCharacter === 'astronaut', JSON.stringify({ bg: document.querySelector('[data-treasure-preview]')?.dataset.previewBackground, ch: document.querySelector('[data-treasure-preview]')?.dataset.previewCharacter }));
    document.querySelector('#saveGameBtn')?.click();
    await new Promise(r => setTimeout(r, 600));
    const stored = state.db.games.find(g => g.id === 'smoke71-art');
    push('editor saves background', stored?.treasureHunt?.backgroundId === 'space', stored?.treasureHunt?.backgroundId);
    push('editor saves character', stored?.treasureHunt?.characterId === 'astronaut', stored?.treasureHunt?.characterId);
    return out;
  })()`);
  t3.forEach(r => check('T3 art-editor ' + r[0], r[1], r[2]));

  const t4 = await must(`(async () => {
    document.querySelector('#modalRoot').innerHTML = '';
    for (const g of state.db.games.filter(g => g.title === ${JSON.stringify(TITLE)} || g.title === ${JSON.stringify(LEGACY_TITLE)})) await window.eduGame.deleteGame(g.id);
    await refreshDb();
    return { remaining: state.db.games.filter(g => g.title === ${JSON.stringify(TITLE)} || g.title === ${JSON.stringify(LEGACY_TITLE)}).length };
  })()`);
  check('T4 cleanup removed smoke games', t4.remaining === 0, JSON.stringify(t4));

  await sleep(300);
  check('PAGE no uncaught JS exceptions', uncaught.length === 0, uncaught[0] || '0');
  check('PAGE no console errors', consoleErrs.length === 0, consoleErrs[0] || '0');
  check('PAGE no log errors', logErrs.length === 0, logErrs[0] || '0');

  fs.writeFileSync('smoke71-report.json', JSON.stringify({ generatedAt: new Date().toISOString(), results, uncaught, consoleErrs, logErrs }, null, 2));
  const failed = results.filter(r => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  ws.close();
  process.exit(failed ? 1 : 0);
})().catch(err => {
  console.error(err);
  fs.writeFileSync('smoke71-report.json', JSON.stringify({ generatedAt: new Date().toISOString(), results, uncaught, consoleErrs, logErrs, fatal: String(err) }, null, 2));
  process.exit(1);
});
