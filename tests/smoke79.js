// smoke79.js — O10 in the packaged Windows build (`release/win-unpacked`), which is
// what a teacher actually runs from the installer on another machine.
//
// Run while the packaged app is started with:
//   $env:EDUGAME_USER_DATA='<temp>' ; $env:EDUGAME_DIAGNOSTICS_DIR='<temp>\export' ;
//   "release/win-unpacked/EduGame Studio.exe" --remote-debugging-port=9333
//   node tests/smoke79.js
//
// No model or fixture is used: this verifies that the diagnostic log is created
// inside the installed app's user data, that Settings can export one file, and
// that "Xóa log trên máy" removes the stored log after a second confirming click.
const fs = require('node:fs');
const path = require('node:path');
const PORT = 9333;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
function check(label, pass, extra) {
  results.push({ label, pass: Boolean(pass) });
  console.log((pass ? 'PASS' : 'FAIL') + ' | ' + label + (extra != null && extra !== '' ? '  -> ' + extra : ''));
}
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
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  let seq = 0;
  const pending = new Map();
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      message.error ? reject(new Error(message.error.message)) : resolve(message.result);
      return;
    }
    if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params.exceptionDetails;
      uncaught.push((details.exception && details.exception.description) || details.text || 'unknown');
    } else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      consoleErrs.push(message.params.args.map(arg => arg.value ?? arg.description ?? '').join(' '));
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
    const result = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
    if (result.exceptionDetails) return { error: (result.exceptionDetails.exception && result.exceptionDetails.exception.description) || result.exceptionDetails.text };
    return { value: result.result.value };
  }
  async function must(expr) {
    const result = await evalJs(expr, true);
    if (result.error) throw new Error('evaluate failed: ' + result.error + '\n  expr: ' + expr.slice(0, 200));
    return result.value;
  }
  await send('Page.enable');
  await send('Runtime.enable');
  await sleep(300);

  const booted = await must(`(async () => {
    const started = Date.now();
    while (Date.now() - started < 30000) {
      if (window.eduGame && typeof window.eduGame.exportDiagnostics === 'function' && document.querySelector('#pageContent')?.children.length) return true;
      await new Promise(r => setTimeout(r, 200));
    }
    return false;
  })()`);
  check('T1 packaged renderer booted with the diagnostics bridge', booted, booted);

  const panel = await must(`(async () => {
    navigate('settings');
    await new Promise(r => setTimeout(r, 700));
    return {
      section: Boolean(document.querySelector('[data-diagnostics-panel]')),
      buttons: ['#exportDiagnosticsBtn', '#openLogFolderBtn', '#clearDiagnosticsBtn'].every(selector => Boolean(document.querySelector(selector))),
      info: document.querySelector('#diagnosticsInfo') ? document.querySelector('#diagnosticsInfo').textContent.replace(/\\s+/g, ' ').trim() : ''
    };
  })()`);
  check('T2 packaged Settings shows the diagnostics panel', panel.section && panel.buttons, JSON.stringify({ section: panel.section, buttons: panel.buttons }));
  check('T2 the panel found the installed app log folder', /Log trên máy: \d+ tệp/.test(panel.info), panel.info);
  check('T2 the log folder lives in the installed app user data', /edugame-data[\\/]+logs/.test(panel.info), panel.info);

  const infoBefore = await must(`window.eduGame.diagnosticsInfo()`);
  check('T3 the packaged app wrote an app.start line', infoBefore.files >= 1 && infoBefore.bytes > 0, JSON.stringify(infoBefore));

  const exported = await must(`window.eduGame.exportDiagnostics()`);
  check('T4 packaged export returns a file path', Boolean(exported && exported.path), JSON.stringify(exported));
  check('T4 the exported file exists on disk', Boolean(exported.path) && fs.existsSync(exported.path), exported.path);
  if (process.env.EDUGAME_DIAGNOSTICS_DIR) {
    check('T4 export goes to the easy-to-find folder', path.dirname(exported.path) === path.resolve(process.env.EDUGAME_DIAGNOSTICS_DIR), path.dirname(exported.path));
  }
  let bundle = '';
  try { bundle = fs.readFileSync(exported.path, 'utf8'); } catch {}
  check('T5 the bundle has the machine header', /EduGame Studio — gói chẩn đoán AI/.test(bundle) && /Phiên bản ứng dụng: 0\.3\.0/.test(bundle), bundle.split('\n')[0]);
  check('T5 the bundle contains the packaged app start entry', /"event":"app.start"/.test(bundle) && /"fixtureMode":false/.test(bundle), bundle.includes('"event":"app.start"'));

  const cleared = await must(`(async () => {
    const button = document.querySelector('#clearDiagnosticsBtn');
    const result = document.querySelector('#diagnosticsResult');
    button.click();
    await new Promise(r => setTimeout(r, 120));
    const armed = button.textContent.trim();
    button.click();
    const started = Date.now();
    while (Date.now() - started < 10000) {
      if (/Đã xóa \\d+ tệp log/.test(result.textContent)) {
        return { armed, text: result.textContent, info: document.querySelector('#diagnosticsInfo').textContent };
      }
      await new Promise(r => setTimeout(r, 150));
    }
    return { armed, text: result.textContent, info: document.querySelector('#diagnosticsInfo').textContent };
  })()`);
  check('T6 clear needs a confirming second click', /Bấm lần nữa/.test(cleared.armed) && /Đã xóa \d+ tệp log/.test(cleared.text), JSON.stringify({ armed: cleared.armed }));
  check('T6 only the clear marker remains', /Log trên máy: 1 tệp/.test(cleared.info), cleared.info);
  const infoAfter = await must(`window.eduGame.diagnosticsInfo()`);
  check('T6 the packaged log folder is clean apart from the marker', infoAfter.files === 1, JSON.stringify(infoAfter));

  check('T7 no uncaught renderer exceptions', uncaught.length === 0, uncaught.slice(0, 2).join(' | '));
  check('T8 no console errors', consoleErrs.length === 0, consoleErrs.slice(0, 2).join(' | '));

  const failed = results.filter(r => !r.pass);
  console.log(`\nsmoke79: ${results.length - failed.length}/${results.length} passed`);
  ws.close();
  process.exit(failed.length ? 1 : 0);
})().catch(error => {
  console.error('smoke79 crashed:', error);
  process.exit(1);
});
