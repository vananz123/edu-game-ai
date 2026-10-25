// smoke73.js - CDP smoke for the AI-local / llama.cpp status bar.
// Run against electron with --remote-debugging-port=9333 and an isolated
// EDUGAME_USER_DATA folder (same convention as the other smokes).
const PORT = 9333;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
function check(label, pass, extra) { results.push({ label, pass: Boolean(pass) }); console.log((pass ? 'PASS' : 'FAIL') + ' | ' + label + (extra != null && extra !== '' ? '  -> ' + extra : '')); }
const uncaught = [], consoleErrs = [];
async function findTarget() {
  for (let i = 0; i < 90; i++) {
    try { const res = await fetch(`http://127.0.0.1:${PORT}/json/list`); const list = await res.json(); const target = list.find(x => x.type === 'page' && /index\.html/.test(x.url)); if (target) return target; } catch {}
    await sleep(1000);
  }
  throw new Error('No page target on CDP port ' + PORT);
}
(async () => {
  const target = await findTarget();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  let seq = 0; const pending = new Map();
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) { const { resolve, reject } = pending.get(message.id); pending.delete(message.id); message.error ? reject(new Error(message.error.message)) : resolve(message.result); return; }
    if (message.method === 'Runtime.exceptionThrown') { const d = message.params.exceptionDetails; uncaught.push((d.exception && d.exception.description) || d.text || 'unknown'); }
    else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') { consoleErrs.push(message.params.args.map(a => a.value ?? a.description ?? '').join(' ')); }
  });
  function send(method, params = {}) { return new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); }); }
  async function evalJs(expression, awaitPromise = false) { const result = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true }); if (result.exceptionDetails) return { error: (result.exceptionDetails.exception && result.exceptionDetails.exception.description) || result.exceptionDetails.text }; return { value: result.result.value }; }
  async function must(expr) { const result = await evalJs(expr, true); if (result.error) throw new Error('evaluate failed: ' + result.error + '\n  expr: ' + expr.slice(0, 200)); return result.value; }
  await send('Page.enable'); await send('Runtime.enable'); await sleep(300);
  const booted = await must(`(async () => { const s=Date.now(); while(Date.now()-s<30000){ if(typeof state!=='undefined' && typeof navigate==='function' && window.eduGame && document.querySelector('#pageContent')?.children.length) return true; await new Promise(r=>setTimeout(r,200)); } return false; })()`);
  check('T1 renderer booted', booted);
  const hasBar = await must(`Boolean(document.querySelector('#aiStatusBar'))`);
  check('T2 status bar present', hasBar);
  const noEscapeText = await must(`!/\\x60r\\x60n/.test(document.querySelector('#aiStatusBar').textContent)`);
  check('T3 no literal escape text rendered in bar', noEscapeText);
  const duplicateIds = await must(`(() => { const ids=[...document.querySelectorAll('[id]')].map(el=>el.id); return ids.length - new Set(ids).size; })()`);
  check('T4 no duplicate element ids', duplicateIds === 0, 'duplicates=' + duplicateIds);
  const runtimeText = await must(`document.querySelector('#aiStatusRuntime')?.textContent || ''`);
  check('T5 idle runtime label present', /chưa chạy/.test(runtimeText), runtimeText);
  const dotHidden = await must(`document.querySelector('#aiStatusRuntimeDot')?.hidden === true`);
  check('T6 red idle indicator hidden by default', dotHidden);
  const startShown = await must(`(() => { const el=document.querySelector('#aiStatusStart'); return Boolean(el && !el.hidden && !el.disabled); })()`);
  check('T7 start button available while idle', startShown);
  const stopState = await must(`(() => { const el=document.querySelector('#aiStatusStop'); return Boolean(el && el.disabled); })()`);
  const cancelState = await must(`(() => { const el=document.querySelector('#aiStatusCancel'); return Boolean(el && el.disabled); })()`);
  check('T8 stop disabled while idle', stopState);
  check('T9 cancel disabled while no task', cancelState);
  // toggle idle visibility
  await must(`document.querySelector('#aiStatusToggle').click()`);
  await sleep(100);
  const dotShown = await must(`document.querySelector('#aiStatusRuntimeDot')?.hidden === false`);
  const stored = await must(`localStorage.getItem('edugame.aiStatus.idleVisible')`);
  check('T10 toggle shows red indicator', dotShown);
  check('T11 toggle persists preference in one key', stored === '1', stored);
  check('T12 toggle label updated', (await must(`document.querySelector('#aiStatusToggle')?.textContent || ''`)) === 'Ẩn khi rảnh');
  // toggle back
  await must(`document.querySelector('#aiStatusToggle').click()`);
  await sleep(100);
  const dotHiddenAgain = await must(`document.querySelector('#aiStatusRuntimeDot')?.hidden === true`);
  check('T13 toggle hides red indicator again', dotHiddenAgain);
  // start button opens the local-AI modal (model picker + "Bắt đầu chạy")
  await must(`document.querySelector('#aiStatusStart').click()`);
  await sleep(250);
  const modalText = await must(`document.querySelector('#modalRoot')?.textContent || ''`);
  check('T14 start button opens local AI modal', /Cửa sổ AI local/.test(modalText));
  await must(`(() => { const btn=document.querySelector('#modalRoot [data-close]'); if(btn) btn.click(); })()`);
  await sleep(100);
  check('T15 modal closes cleanly', (await must(`document.querySelector('#modalRoot')?.children.length || 0`)) === 0);
  check('T16 no uncaught renderer exceptions', uncaught.length === 0, uncaught.slice(0, 2).join(' | '));
  check('T17 no console errors', consoleErrs.length === 0, consoleErrs.slice(0, 2).join(' | '));
  const failed = results.filter(r => !r.pass);
  console.log(`\nsmoke73: ${results.length - failed.length}/${results.length} passed`);
  ws.close();
  process.exit(failed.length ? 1 : 0);
})().catch(error => { console.error('smoke73 crashed:', error); process.exit(1); });
