// tests/smoke-p1.js � verify manual Quiz creation per tasknight.docx �2.4
const fs = require('fs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  // The editor was split into src/renderer/features/editor/* (DECISIONS #150);
  // load every compiled area file back into the page as one script.
  const editorDir = 'dist/src/renderer/features/editor';
  const geSrc = fs.readdirSync(editorDir)
    .filter(name => name.endsWith('.js'))
    .sort()
    .map(name => fs.readFileSync(`${editorDir}/${name}`, 'utf8'))
    .join('\n');
  const b64 = Buffer.from(geSrc).toString('base64');
  const res = await fetch('http://127.0.0.1:9333/json/list');
  const targets = await res.json();
  const target = targets.find(x => x.type === 'page' && /index\.html/.test(x.url));
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
  try {
    await evalv(`(function(){const s=document.createElement('script');s.textContent=atob('${b64}');document.head.appendChild(s);})();`);
    await sleep(600);
    console.log('createBlankGame typeof =', await evalv('typeof createBlankGame'));
    console.log('openEditor typeof =', await evalv('typeof openEditor'));
    await evalv('createBlankGame();');
    await sleep(700);
    const q1type = await evalv(`document.querySelector('#modalRoot .editor-question')?.querySelector('[data-field="type"]')?.value || null`);
    push('P1 editor opened with a question', q1type === 'multiple-choice', q1type);

    await evalv(`(function(){const sel=document.querySelector('#modalRoot .editor-question [data-field="type"]'); sel.value='true-false'; sel.dispatchEvent(new Event('change',{bubbles:true}));})();`);
    await sleep(300);
    const afterType = await evalv(`document.querySelector('#modalRoot .editor-question [data-field="type"]').value`);
    const optsHidden = await evalv(`getComputedStyle(document.querySelector('#modalRoot .editor-question .editor-options')).display==='none'`);
    push('P1 Q1 ��ng/Sai switches options off', afterType === 'true-false' && optsHidden, `${afterType} optsHidden=${optsHidden}`);

    await evalv(`(function(){const sel=document.querySelector('#modalRoot .editor-question [data-field="type"]'); sel.value='multiple-choice'; sel.dispatchEvent(new Event('change',{bubbles:true}));})();`);
    await sleep(300);
    await evalv('document.querySelector("#modalRoot .editor-question .add-option")?.click();');
    await evalv("(function(){const last=[...document.querySelectorAll('#modalRoot .editor-question [data-option-id]')].pop(); if(last) last.value='Phương án 4';})();");
    await sleep(100);
    await sleep(300);
    const optCount = await evalv('document.querySelector("#modalRoot .editor-question").querySelectorAll("[data-option-id]").length');
    push('P1 added an option (now 4)', optCount === 4, 'optCount=' + optCount);

    await evalv('document.querySelector("#modalRoot .editor-question [data-copy-question]")?.click();');
    await sleep(400);
    const qCount = await evalv('document.querySelectorAll("#modalRoot .editor-question").length');
    push('P1 copied question (now 2)', qCount === 2, 'qCount=' + qCount);

    await evalv('document.querySelector("#saveGameBtn")?.click();');
    await sleep(800);
    const toast = await evalv('document.querySelector("#toast")?.textContent || ""');
    const inLib = await evalv('state.db.games.length');
    push('P1 saved toast + library has game', toast.includes('�� luu') && inLib >= 1, toast + ' | lib=' + inLib);

    const last = await evalv('state.db.games[state.db.games.length - 1].questions[0].type');
    push('P1 first question persisted as multiple-choice', last === 'multiple-choice', last);

    const id = await evalv('state.db.games[state.db.games.length - 1].id');
    await evalv(`(async()=>{await window.eduGame.deleteGame('${id}');await refreshDb();navigate('home');})()`);
  } finally { ws.close(); }
  const failed = results.filter(r => !r[1]).length;
  results.forEach(([l, p, e]) => console.log((p ? 'PASS' : 'FAIL') + ' | ' + l + (e ? ' -> ' + e : '')));
  console.log('=== P1-SMOKE: ' + (results.length - failed) + '/' + results.length + ' passed ===');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('DRIVER ERROR: ' + e.message); process.exit(2); });
