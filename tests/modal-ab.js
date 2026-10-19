// modal-ab.js — G5 CDP A/B cho các màn KHÔNG nằm trong 7 trang chính của geom-ab:
// bootstrap modal, local-ai modal, play quiz (stage + results), matching, treasure,
// race play modal, toast. Method giống tests/geom-ab.js: đóng băng transitions,
// dump rect + computed style từng phần tử, so sánh 2 dump.
//
// Cách dùng (app đang mở với --remote-debugging-port=9333):
//   node tests/modal-ab.js dump <file-out.json>
//   node tests/modal-ab.js compare <before.json> <after.json>
const fs = require('node:fs');
const PORT = 9333;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function findTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const t = list.find(x => x.type === 'page' && /index\.html/.test(x.url));
      if (t) return t;
    } catch {}
    await sleep(1000);
  }
  throw new Error('No page target on CDP port ' + PORT);
}

async function connect() {
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
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  return { send, close: () => ws.close() };
}

const FREEZE_CSS = `*{transition:none!important;animation:none!important;scroll-behavior:auto!important}`;

const DUMP_EXPR = (rootSel) => `
(() => {
  let st = document.getElementById('__geomFreeze');
  if (!st) { st = document.createElement('style'); st.id = '__geomFreeze'; document.head.appendChild(st); }
  st.textContent = ${JSON.stringify(FREEZE_CSS)};
  const root = document.querySelector(${JSON.stringify(rootSel)});
  if (!root) return JSON.stringify({ error: 'no ' + ${JSON.stringify(rootSel)} });
  const els = [root, ...root.querySelectorAll('*')];
  const PROPS = ['display','position','padding','margin','gap','row-gap','column-gap','background-color','color',
    'border-top-width','border-top-style','border-top-color','border-radius','font-size','font-weight','font-style',
    'line-height','letter-spacing','text-align','text-transform','width','height','max-width','max-height','min-height','min-width',
    'box-shadow','flex-direction','flex-wrap','align-items','justify-content','align-self','grid-template-columns',
    'opacity','transform','transition','z-index','overflow','cursor','pointer-events','visibility','box-sizing'];
  const out = els.map((el, i) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const o = { i, tag: el.tagName.toLowerCase(),
      cls: el.className && el.className.baseVal !== undefined ? el.className.baseVal : String(el.className || ''),
      id: el.id || '', x: Math.round(r.x*100)/100, y: Math.round(r.y*100)/100, w: Math.round(r.width*100)/100, h: Math.round(r.height*100)/100 };
    for (const p of PROPS) o[p] = cs.getPropertyValue(p);
    return o;
  });
  return JSON.stringify({ count: els.length, els: out });
})()`;

const SECTIONS = [
  { name: 'bootstrap-modal', root: '#modalRoot', setup: `state.page='home'; render(); document.getElementById('helpBtn').click(); void 0;` },
  { name: 'local-ai-modal', root: '#modalRoot', setup: `document.getElementById('modalRoot').innerHTML=''; openLocalAiModal(); void 0;` },
  { name: 'play-quiz', root: '#modalRoot', setup: `document.getElementById('modalRoot').innerHTML='';
    state.currentGame = { id: 'g5probe', title: 'G5 probe', template: 'quiz',
      questions: [
        { id: 'q1', prompt: 'Câu hỏi số một?', type: 'mcq', options: [{ id: 'a', text: 'Đáp án A' }, { id: 'b', text: 'Đáp án B' }], correctOptionId: 'a', points: 100, explanation: 'Giải thích A.' },
        { id: 'q2', prompt: 'Câu hỏi số hai?', type: 'mcq', options: [{ id: 'a', text: 'Đáp án A' }, { id: 'b', text: 'Đáp án B' }], correctOptionId: 'b', points: 100, explanation: 'Giải thích B.' }
      ],
      gameSetup: { scoringMode: 'cơ bản' } };
    playGame(state.currentGame); void 0;` },
  { name: 'results-screen', root: '#modalRoot', setup: `document.querySelectorAll('#playBody .answer-option')[0].click();
    document.getElementById('nextQuestionBtn').click(); void 0;` },
  { name: 'matching-play', root: '#modalRoot', setup: `document.getElementById('modalRoot').innerHTML='';
    state.currentGame = { template: 'matching', matchingGame: { mode: 'columns',
      pairs: [{ id: 'p1', left: 'Trái cây', right: 'Táo' }, { id: 'p2', left: 'Rau củ', right: 'Cà rốt' }],
      practiceMode: false, wrongPenalty: 0, completionBonus: 0, timeBonus: 0 } };
    openMatchingPlay(); void 0;` },
  { name: 'treasure-play', root: '#modalRoot', setup: `document.getElementById('modalRoot').innerHTML='';
    state.currentGame = { template: 'treasure-hunt', treasureHunt: { character: 'Thám hiểm', intro: 'Bắt đầu',
      stages: [{ id: 's1', name: 'Chặng 1', points: 100, completionBonus: 50, attempts: 0,
        question: { prompt: '1+1=?', options: [{ id: 'o1', text: '2' }, { id: 'o2', text: '3' }], correctOptionId: 'o1' } }] } };
    openTreasurePlay(); void 0;` },
  { name: 'race-play', root: '#modalRoot', setup: `document.getElementById('modalRoot').innerHTML='';
    state.currentGame = { template: 'race', race: {
      teams: [{ id: 't1', name: 'Đội A', icon: 'A' }, { id: 't2', name: 'Đội B', icon: 'B' }],
      questions: [{ id: 'rq1', prompt: '1+1=?', options: [{ id: 'o1', text: '2' }, { id: 'o2', text: '3' }], correctOptionId: 'o1', points: 100 }],
      trackLength: 5, maxRounds: 3,
      cells: [{ type: 'boost', label: 'Tăng tốc' }, { type: 'penalty', label: 'Chướng ngại' }, { type: 'lucky', label: 'May mắn' }, { type: 'challenge', label: 'Thử thách' }] } };
    openRacePlay(); void 0;` },
  { name: 'toast', root: '#toast', setup: `document.getElementById('modalRoot').innerHTML=''; toast('G5 modal-ab probe'); void 0;` }
];

(async () => {
  const [mode, arg1, arg2] = process.argv.slice(2);
  if (mode !== 'dump' && mode !== 'compare') {
    console.log('Usage: node tests/modal-ab.js dump <out.json> | compare <before.json> <after.json>');
    process.exit(1);
  }
  if (mode === 'compare') {
    const a = JSON.parse(fs.readFileSync(arg1, 'utf8'));
    const b = JSON.parse(fs.readFileSync(arg2, 'utf8'));
    let totalDiffs = 0, totalEls = 0;
    for (const sec of SECTIONS) {
      const A = a[sec.name], B = b[sec.name];
      const diffs = [];
      totalEls += A ? A.count : 0;
      if (!A || !B || A.count !== B.count) diffs.push({ note: `count ${A ? A.count : '∅'} → ${B ? B.count : '∅'}` });
      if (A && B) {
        const n = Math.min(A.els.length, B.els.length);
        for (let i = 0; i < n; i++) {
          const ea = A.els[i], eb = B.els[i];
          if (ea.tag !== eb.tag || ea.id !== eb.id) { diffs.push({ i, note: `identity ${ea.tag}#${ea.id} vs ${eb.tag}#${eb.id}` }); continue; }
          const keys = new Set([...Object.keys(ea), ...Object.keys(eb)]);
          for (const k of keys) {
            if (k === 'i' || k === 'cls') continue;
            if (ea[k] !== eb[k]) diffs.push({ i, el: `${ea.tag}${ea.id ? '#' + ea.id : ''}.${String(ea.cls).split(/\s+/)[0] || ''}`, key: k, a: ea[k], b: eb[k] });
          }
        }
      }
      totalDiffs += diffs.length;
      console.log(`${diffs.length === 0 ? 'OK  ' : 'DIFF'} ${sec.name}: ${A ? A.count : '?'} elements, ${diffs.length} diff(s)`);
      for (const d of diffs.slice(0, 40)) console.log('     ' + JSON.stringify(d));
      if (diffs.length > 40) console.log(`     … ${diffs.length - 40} more`);
    }
    console.log(`TOTAL: ${totalDiffs} diff(s) across ${totalEls} elements`);
    process.exit(totalDiffs === 0 ? 0 : 2);
  }
  const { send, close } = await connect();
  const out = {};
  for (const sec of SECTIONS) {
    await send('Runtime.evaluate', { expression: sec.setup, returnByValue: true });
    await sleep(sec.name === 'results-screen' ? 600 : 300);
    const res = await send('Runtime.evaluate', { expression: DUMP_EXPR(sec.root), returnByValue: true });
    if (res.exceptionDetails) throw new Error('dump failed on ' + sec.name + ': ' + JSON.stringify(res.exceptionDetails));
    out[sec.name] = JSON.parse(res.result.value);
    console.log(`dumped ${sec.name}: ${out[sec.name].count} elements`);
  }
  await send('Runtime.evaluate', { expression: `document.getElementById('modalRoot').innerHTML=''; const t=document.getElementById('toast'); t.textContent=''; t.classList.remove('show'); state.page='home'; render(); void 0;` });
  close();
  fs.writeFileSync(arg1, JSON.stringify(out));
  console.log('written ' + arg1);
})().catch(e => { console.error(e); process.exit(1); });
