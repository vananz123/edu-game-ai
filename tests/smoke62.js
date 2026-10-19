// tests/smoke62.js — library page delete-game feature (run with the app open on port 9333).
// T1 delete button rendered on library cards (grouped with ••• edit); T2 NOT on home recent cards;
// T3 cancel path keeps the game; T4 confirm path removes it from DOM + state + persisted db.
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const res = await fetch('http://127.0.0.1:9333/json/list');
  const target = (await res.json()).find(x => x.type === 'page' && /index\.html/.test(x.url));
  if (!target) throw new Error('no CDP target');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r, { once: true }); ws.addEventListener('error', j, { once: true }); });
  let seq = 0; const pending = new Map();
  ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
  const send = (method, params = {}) => new Promise(r => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  const evalv = async expression => {
    const r = await send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression });
    if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  };
  const results = [];
  const push = (l, p, e = '') => { results.push([l, !!p, String(e)]); };

  // --- setup: temp game + land on library ---
  const setup = await evalv(`(async () => {
    const g = await window.eduGame.saveGame({ title: 'SMOKE62 DELETE ME', subject: 'Toán', grade: '5', topic: 'Kiểm thử', template: 'quiz', description: 'Trò chơi tạm để kiểm tra nút xóa ở thư viện.', questions: [{ id:'q1', type:'multiple-choice', prompt:'1+1=?', options:[{id:'a',text:'2'},{id:'b',text:'3'}], correctOptionId:'a', explanation:'', points:100 }] });
    await refreshDb();
    state.search = ''; state.filter = 'all';
    navigate('library');
    await new Promise(r => setTimeout(r, 300));
    return g.id;
  })()`);
  push('setup temp game created + library shown', setup, setup);

  // --- T1: delete button on the library card, grouped next to ••• ---
  const t1 = await evalv(`(() => {
    const btn = document.querySelector('[data-action="delete"][data-id="${setup}"]');
    const tools = btn?.parentElement;
    return { hasBtn: !!btn, title: btn?.title, action: btn?.dataset.action, editNextToIt: !!tools?.querySelector('[data-action="edit"][data-id="${setup}"]') };
  })()`);
  push('T1 delete button rendered with title', t1.hasBtn && t1.title === 'Xóa trò chơi' && t1.action === 'delete', JSON.stringify(t1));
  push('T1 delete grouped next to ••• edit', t1.editNextToIt, '');

  // --- T2: home recent cards must NOT have delete buttons ---
  const t2 = await evalv(`(async () => {
    navigate('home');
    await new Promise(r => setTimeout(r, 250));
    const count = document.querySelectorAll('[data-action="delete"]').length;
    navigate('library');
    await new Promise(r => setTimeout(r, 250));
    return count;
  })()`);
  push('T2 no delete button on home recent cards', t2 === 0, 'count=' + t2);

  // --- T3: cancel path (confirm=false) keeps the game ---
  const t3 = await evalv(`(async () => {
    window.confirm = () => false;
    document.querySelector('[data-action="delete"][data-id="${setup}"]').click();
    await new Promise(r => setTimeout(r, 400));
    return { inDom: !!document.querySelector('[data-action="delete"][data-id="${setup}"]'), inState: state.db.games.some(g => g.id === '${setup}') };
  })()`);
  push('T3 cancel keeps the game (DOM + state)', t3.inDom && t3.inState, JSON.stringify(t3));

  // --- T4: confirm path removes from DOM + state + persisted db, toast shown ---
  const t4 = await evalv(`(async () => {
    window.confirm = () => true;
    document.querySelector('[data-action="delete"][data-id="${setup}"]').click();
    await new Promise(r => setTimeout(r, 500));
    const lib = await window.eduGame.getLibrary();
    const toastEl = document.querySelector('#toast');
    return {
      goneDom: !document.querySelector('[data-action="delete"][data-id="${setup}"]'),
      goneState: !state.db.games.some(g => g.id === '${setup}'),
      goneDb: !(lib?.games || []).some(g => g.id === '${setup}'),
      toastShown: !!toastEl && toastEl.classList.contains('show') && toastEl.textContent.startsWith('Đã xóa')
    };
  })()`);
  push('T4 confirm deletes from DOM', t4.goneDom, JSON.stringify(t4));
  push('T4 confirm deletes from state.db.games', t4.goneState, '');
  push('T4 deletion persisted to db file', t4.goneDb, '');
  push('T4 toast shown', t4.toastShown, '');

  const pass = results.filter(r => r[1]).length;
  for (const [label, ok, extra] of results) console.log(`${ok ? 'PASS' : 'FAIL'} | ${label}  ${extra || ''}`);
  console.log(`\nSmoke62 (library delete): ${pass}/${results.length} passed`);
  ws.close();
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
