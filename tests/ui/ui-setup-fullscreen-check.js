// tests/ui/ui-setup-fullscreen-check.js — setup must own the window, not float over it.
//
//   npx electron . --remote-debugging-port=9333   (from another terminal), then:
//   node tests/ui/ui-setup-fullscreen-check.js
//
// A teacher who can still see (and click) the dashboard behind the wizard tries
// to use the app underneath it. This measures, on the real renderer, that:
//   * `html[data-setup-fullscreen]` is set while an unfinished setup is shown;
//   * the setup surface covers the whole viewport;
//   * the app shell, topbar and AI status bar are visually hidden;
//   * the action buttons are inside the viewport (not pushed below the fold);
//   * finishing or closing the wizard gives the window back.
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

  const run = await evalv(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const waitFor = async (fn, ms) => { const started = Date.now(); while (Date.now() - started < (ms || 15000)) { if (fn()) return true; await sleep(40); } return false; };
    const out = { errors: [] };
    window.addEventListener('error', event => out.errors.push(String(event.message)));
    const rect = selector => { const el = document.querySelector(selector); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
    const visible = selector => { const el = document.querySelector(selector); if (!el) return null; const style = getComputedStyle(el); return style.visibility !== 'hidden' && style.display !== 'none'; };

    out.viewport = { w: innerWidth, h: innerHeight };

    // An unfinished install, exactly as the first-run gate shows it.
    setupWizardState.dismissed = false;
    await openSetupWizard({ probe: false });
    out.opened = await waitFor(() => !!document.querySelector('#modalRoot [data-setup-screen]'), 15000);
    await sleep(300);

    out.flag = document.documentElement.getAttribute('data-setup-fullscreen');
    out.screen = (document.querySelector('#modalRoot [data-setup-screen]') || {}).dataset?.setupScreen;
    out.surface = rect('#modalRoot .setup-fullscreen');
    out.shellVisible = visible('.app-shell');
    out.topbarVisible = visible('.topbar');
    out.statusBarVisible = visible('.ai-status-bar');
    out.primaryButton = rect('#modalRoot [data-setup-action="start"]') || rect('#modalRoot [data-setup-action="skip-ai"]');
    out.modalBackdropPresent = !!document.querySelector('#modalRoot .modal-backdrop');

    // Finishing the wizard must give the dashboard back.
    setupWizardState.status = { step: 'complete', complete: true, running: false };
    renderSetupWizard();
    await sleep(200);
    out.flagAfterComplete = document.documentElement.getAttribute('data-setup-fullscreen');
    out.shellVisibleAfterComplete = visible('.app-shell');
    setupWizardState.status = { step: 'idle', complete: false, running: false };

    closeSetupWizard('close');
    await sleep(200);
    out.flagAfterClose = document.documentElement.getAttribute('data-setup-fullscreen');
    out.shellVisibleAfterClose = visible('.app-shell');
    out.rootEmptyAfterClose = document.getElementById('modalRoot').innerHTML === '';
    return out;
  })()`);

  let failures = 0;
  const check = (name, ok, detail) => {
    if (!ok) failures += 1;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail === undefined ? '' : '  -> ' + JSON.stringify(detail)}`);
  };

  check('wizard opened', run.opened === true, run.screen);
  check('html[data-setup-fullscreen] is set while setup is pending', run.flag === '1', run.flag);
  check('no modal backdrop is drawn', run.modalBackdropPresent === false, run.modalBackdropPresent);
  check('setup surface covers the whole viewport',
    !!run.surface && run.surface.w === run.viewport.w && run.surface.h === run.viewport.h,
    { surface: run.surface, viewport: run.viewport });
  check('app shell is hidden', run.shellVisible === false, run.shellVisible);
  check('topbar is hidden', run.topbarVisible === false, run.topbarVisible);
  check('AI status bar is hidden', run.statusBarVisible === false, run.statusBarVisible);
  check('action buttons are inside the viewport',
    !!run.primaryButton && run.primaryButton.y >= 0
      && run.primaryButton.y + run.primaryButton.h <= run.viewport.h + 1,
    run.primaryButton);
  check('finishing setup gives the shell back',
    run.flagAfterComplete === null && run.shellVisibleAfterComplete === true,
    { flag: run.flagAfterComplete, shellVisible: run.shellVisibleAfterComplete });
  check('closing the wizard gives the shell back',
    run.flagAfterClose === null && run.shellVisibleAfterClose === true && run.rootEmptyAfterClose === true,
    { flag: run.flagAfterClose, shellVisible: run.shellVisibleAfterClose, empty: run.rootEmptyAfterClose });
  check('no page errors', run.errors.length === 0, run.errors);

  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(error => { console.error(error); process.exit(1); });
