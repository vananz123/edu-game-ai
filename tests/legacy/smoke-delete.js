// tests/smoke-delete.js — verify project deletion from "Dự án của tôi" (cancel + confirm paths).
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

  // --- setup: create a temp project ---
  const setup = await evalv(`(async () => {
    const g = await window.eduGame.saveGame({ title: 'SMOKE DELETE ME', subject: 'Toán', grade: '5', topic: 'Kiểm thử', template: 'quiz', description: 'Dự án tạm để kiểm tra nút xóa.', questions: [{ id:'q1', type:'multiple-choice', prompt:'1+1=?', options:[{id:'a',text:'2'},{id:'b',text:'3'}], correctOptionId:'a', explanation:'', points:100 }] });
    await refreshDb();
    navigate('my-projects');
    await new Promise(r => setTimeout(r, 300));
    return g.id;
  })()`);
  push('setup temp project created', setup, setup);

  // --- T1: button present + grouped with edit button ---
  const t1 = await evalv(`(() => {
    const btn = document.querySelector('.delete-btn[data-id="${setup}"]');
    const tools = btn?.closest('.card-tools');
    return { hasBtn: !!btn, title: btn?.title, action: btn?.dataset.action, editNextToIt: !!tools?.querySelector('[data-action="edit"]') };
  })()`);
  push('T1 delete button rendered with title', t1.hasBtn && t1.title === 'Xóa dự án' && t1.action === 'delete', JSON.stringify(t1));
  push('T1 delete button grouped next to ••• edit', t1.editNextToIt, '');

  // --- T2: cancel path (confirm=false) keeps the project ---
  const t2 = await evalv(`(async () => {
    window.confirm = () => false;
    document.querySelector('.delete-btn[data-id="${setup}"]').click();
    await new Promise(r => setTimeout(r, 400));
    const inDom = !!document.querySelector('.delete-btn[data-id="${setup}"]');
    const inState = state.db.games.some(g => g.id === '${setup}');
    const disk = (await window.eduGame.getLibrary()).games.some(g => g.id === '${setup}');
    return { inDom, inState, disk };
  })()`);
  push('T2 cancel keeps card in DOM', t2.inDom, '');
  push('T2 cancel keeps project in state + disk', t2.inState && t2.disk, JSON.stringify(t2));

  // --- T3: confirm path (confirm=true) deletes everywhere + re-renders ---
  const t3 = await evalv(`(async () => {
    window.confirm = () => true;
    document.querySelector('.delete-btn[data-id="${setup}"]').click();
    await new Promise(r => setTimeout(r, 600));
    const btnGone = !document.querySelector('.delete-btn[data-id="${setup}"]');
    const cardGone = ![...document.querySelectorAll('.card-title')].some(el => el.textContent === 'SMOKE DELETE ME');
    const inState = state.db.games.some(g => g.id === '${setup}');
    const disk = (await window.eduGame.getLibrary()).games.some(g => g.id === '${setup}');
    const toastText = document.querySelector('#toast')?.textContent || '';
    const otherCardsOk = document.querySelectorAll('.game-card').length >= 0 && !!document.querySelector('#pageContent');
    return { btnGone, cardGone, inState, disk, toastText, pageOk: otherCardsOk, page: state.page };
  })()`);
  push('T3 confirm removes card from DOM (re-render)', t3.btnGone && t3.cardGone, '');
  push('T3 confirm removes from state.db', !t3.inState, '');
  push('T3 confirm removes from disk (IPC delete)', !t3.disk, '');
  push('T3 toast "Đã xóa dự án."', t3.toastText.includes('Đã xóa dự án'), t3.toastText);
  push('T3 still on my-projects page with content', t3.pageOk && t3.page === 'my-projects', t3.page);

  // --- T4: other projects untouched ---
  const t4 = await evalv(`(() => ({ cards: document.querySelectorAll('.game-card').length, others: state.db.games.length }))()`);
  push('T4 other projects intact after delete', t4.cards === t4.others, JSON.stringify(t4));

  // --- cleanup ---
  await evalv(`(async () => {
    delete window.confirm;
    const left = state.db.games.find(g => g.title === 'SMOKE DELETE ME');
    if (left) { await window.eduGame.deleteGame(left.id); await refreshDb(); }
    navigate('home');
    return true;
  })()`);

  ws.close();
  const failed = results.filter(r => !r[1]).length;
  results.forEach(([l, p, e]) => console.log((p ? 'PASS' : 'FAIL') + ' | ' + l + (e ? '  -> ' + e : '')));
  console.log('=== DELETE-SMOKE: ' + (results.length - failed) + '/' + results.length + ' passed ===');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('DRIVER ERROR: ' + e.message); process.exit(2); });
