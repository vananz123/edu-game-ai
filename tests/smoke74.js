// smoke74.js - CDP smoke for the gameplay fullscreen (⛶) button.
//
// Regression: ipcMain.handle('window:set-fullscreen') used to be nested inside
// the files:import-game handler, so IPC calls failed until a game had been
// imported, and a second import tried to register the handler twice.
//
// The Windows fullscreen transition takes a moment, so state checks poll the
// flag that main sends back (window:fullscreen-changed) instead of a fixed wait.
//
// Run while the app is started with:
//   EDUGAME_USER_DATA=<empty folder> electron . --remote-debugging-port=9333
const PORT = 9333;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
function check(label, pass, extra) { results.push({ label, pass: Boolean(pass) }); console.log((pass ? 'PASS' : 'FAIL') + ' | ' + label + (extra != null && extra !== '' ? '  -> ' + extra : '')); }
const uncaught = [], consoleErrs = [];

async function findTarget() {
  for (let i = 0; i < 90; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const target = list.find(x => x.type === 'page' && /index\.html/.test(x.url));
      if (target) return target;
    } catch {}
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
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      message.error ? reject(new Error(message.error.message)) : resolve(message.result);
      return;
    }
    if (message.method === 'Runtime.exceptionThrown') {
      const d = message.params.exceptionDetails;
      uncaught.push((d.exception && d.exception.description) || d.text || 'unknown');
    } else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      consoleErrs.push(message.params.args.map(a => a.value ?? a.description ?? '').join(' '));
    }
  });
  function send(method, params = {}) { return new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); }); }
  async function evalJs(expression, awaitPromise = false) {
    const result = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
    if (result.exceptionDetails) return { error: (result.exceptionDetails.exception && result.exceptionDetails.exception.description) || result.exceptionDetails.text };
    return { value: result.result.value };
  }
  async function must(expr) { const result = await evalJs(expr, true); if (result.error) throw new Error('evaluate failed: ' + result.error + '\n  expr: ' + expr.slice(0, 200)); return result.value; }
  async function waitFor(expr, timeout = 9000, step = 250) {
    const start = Date.now();
    let last = null;
    while (Date.now() - start < timeout) {
      last = await must(expr);
      if (last) return last;
      await sleep(step);
    }
    return last;
  }
  const fullscreenFlag = `(() => document.documentElement.dataset.fullscreen || '')()`;

  await send('Page.enable');
  await send('Runtime.enable');
  await sleep(300);

  const booted = await must(`(async () => { const s=Date.now(); while(Date.now()-s<30000){ if(typeof state!=='undefined' && typeof playGame==='function' && window.eduGame && document.querySelector('#pageContent')?.children.length) return true; await new Promise(r=>setTimeout(r,200)); } return false; })()`);
  check('T1 renderer booted', booted);
  check('T2 setFullscreen is exposed on the bridge', (await must(`typeof window.eduGame.setFullscreen`)) === 'function');
  check('T3 status listener is exposed on the bridge', (await must(`typeof window.eduGame.onFullscreenChanged`)) === 'function');

  const baseline = JSON.parse(await must(`JSON.stringify({ innerW: window.innerWidth, innerH: window.innerHeight, screenW: screen.width, screenH: screen.height })`));

  // Core regression: works on a fresh profile with no game imported.
  const enter = await must(`window.eduGame.setFullscreen(true).then(r => JSON.stringify(r)).catch(e => 'ERROR: ' + e.message)`);
  check('T4 fullscreen IPC works before importing a game', enter === '{"ok":true}', enter);
  const enteredFlag = await waitFor(`${fullscreenFlag} === '1'`);
  check('T5 main reports the entered state to the renderer', enteredFlag, 'flag=' + (await must(fullscreenFlag)));
  await sleep(250);
  const full = JSON.parse(await must(`JSON.stringify({ innerW: window.innerWidth, innerH: window.innerHeight, screenW: screen.width })`));
  check('T6 window really grew to fullscreen', full.innerW >= full.screenW - 2 || full.innerW > baseline.innerW + 8, JSON.stringify({ before: baseline.innerW, after: full.innerW, screenW: full.screenW }));

  const exit = await must(`window.eduGame.setFullscreen(false).then(r => JSON.stringify(r)).catch(e => 'ERROR: ' + e.message)`);
  check('T7 leaving fullscreen IPC works', exit === '{"ok":true}', exit);
  const leftFlag = await waitFor(`${fullscreenFlag} === '0'`);
  check('T8 main reports the left state to the renderer', leftFlag, 'flag=' + (await must(fullscreenFlag)));
  const restored = await waitFor(`window.innerWidth <= ${baseline.innerW + 2}`);
  check('T9 window restored to normal width', restored, 'innerW=' + (await must('window.innerWidth')));

  // ⛶ button wiring (a fake button exercises the delegated listener without
  // opening a real game).
  await must(`(() => {
    const btn = document.createElement('button');
    btn.id = 'smoke74Fullscreen';
    btn.setAttribute('data-play-fullscreen', '');
    document.body.appendChild(btn);
    btn.click();
  })()`);
  const clickFlag = await waitFor(`${fullscreenFlag} === '1'`);
  check('T10 ⛶ button enters presentation fullscreen', clickFlag, 'flag=' + (await must(fullscreenFlag)));

  // Escape leaves the presentation.
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  const escFlag = await waitFor(`${fullscreenFlag} === '0'`);
  check('T11 Escape leaves fullscreen', escFlag, 'flag=' + (await must(fullscreenFlag)));
  const escRestored = await waitFor(`window.innerWidth <= ${baseline.innerW + 2}`);
  check('T12 Escape restores the window width', escRestored, 'innerW=' + (await must('window.innerWidth')));

  // Closing the play surface (result screens / setup) must also restore size.
  await must(`document.querySelector('#smoke74Fullscreen').click()`);
  await waitFor(`${fullscreenFlag} === '1'`);
  await must(`(() => { document.querySelector('#modalRoot').innerHTML = '<div id="smoke74Surface">x</div>'; closePlaySurface(); })()`);
  const closedFlag = await waitFor(`${fullscreenFlag} === '0'`);
  const closedModal = await waitFor(`document.querySelector('#modalRoot').children.length === 0`);
  const closedWidth = await waitFor(`window.innerWidth <= ${baseline.innerW + 2}`);
  check('T13 closing the play surface restores the window', closedFlag && closedModal && closedWidth, JSON.stringify({ flag: await must(fullscreenFlag), modalEmpty: closedModal, innerW: await must('window.innerWidth') }));
  await must(`document.querySelector('#smoke74Fullscreen').remove()`);

  check('T14 no uncaught renderer exceptions', uncaught.length === 0, uncaught.slice(0, 2).join(' | '));
  check('T15 no console errors', consoleErrs.length === 0, consoleErrs.slice(0, 2).join(' | '));

  const failed = results.filter(r => !r.pass);
  console.log(`\nsmoke74: ${results.length - failed.length}/${results.length} passed`);
  ws.close();
  process.exit(failed.length ? 1 : 0);
})().catch(error => { console.error('smoke74 crashed:', error); process.exit(1); });
