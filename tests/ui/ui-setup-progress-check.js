// tests/ui/ui-setup-progress-check.js — setup modal must not judder while downloading.
//
//   app launched with --remote-debugging-port=9333, then:
//   node tests/ui/ui-setup-progress-check.js
//
// Opens the first-run wizard from Settings, drives 400 synthetic
// `setup:progress` events through the real preload bridge listener (via the
// wizard's own subscription, exactly as main.ts pushes them) and counts how many
// times the modal DOM was replaced.
//
// Before the fix every event rebuilt `#modalRoot.innerHTML`; on a 1.1 GB model
// that is hundreds of rebuilds per second and the modal visibly juddered.
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
    const errors = [];
    window.addEventListener('error', event => errors.push(String(event.message)));
    const out = { errors };
    const root = document.getElementById('modalRoot');

    // The wizard subscribes to its own progress source; re-opening grabs the
    // handler the app uses for real (probe:false is the Settings path).
    await openSetupWizard({ probe: false });
    out.opened = await waitFor(() => !!document.querySelector('#modalRoot [data-setup-screen]'), 15000);
    setupWizardState.status = { ...(setupWizardState.status || {}), step: 'installing-models', running: true };
    setupWizardState.starting = false;
    setupWizardState.busy = false;
    setupWizardState.progress = { step: 'installing-models', stage: 'model', itemId: 'qwen3.5-2b-q4_k_m',
      receivedBytes: 1, totalBytes: 1214873856, bytesPerSecond: 2000000, message: 'Đang tải model AI…' };
    renderSetupWizard();
    out.screenDuringFlood = (document.querySelector('#modalRoot [data-setup-screen]') || {}).dataset?.setupScreen;

    const rendersBefore = window.setupWizardRenderCount();
    let replacements = 0;
    const observer = new MutationObserver(records => {
      for (const record of records) replacements += record.addedNodes.length;
    });
    observer.observe(root, { childList: true });
    const started = performance.now();
    const events = 400;
    // One event per frame — exactly the rate a compliant UI can absorb, and a
    // fraction of the real chunk rate, which is the point: each event used to
    // rebuild the whole modal.
    for (let i = 1; i <= events; i += 1) {
      setupWizardState.status = { ...setupWizardState.status, step: 'installing-models', running: true };
      setupWizardState.progress = { step: 'installing-models', stage: 'model', itemId: 'qwen3.5-2b-q4_k_m',
        receivedBytes: Math.round(i / events * 1214873856), totalBytes: 1214873856,
        bytesPerSecond: 2000000, message: 'Đang tải model AI…' };
      renderSetupWizard();
      await new Promise(r => requestAnimationFrame(r));
    }
    out.elapsedMs = Math.round(performance.now() - started);
    await sleep(150);
    observer.disconnect();

    out.events = events;
    out.renders = window.setupWizardRenderCount() - rendersBefore;
    out.replacements = replacements;
    out.framesAvailable = Math.max(1, Math.round(out.elapsedMs / 16));
    const bar = document.querySelector('#modalRoot .setup-progress[aria-valuenow]');
    out.ariaValueNow = bar && bar.getAttribute('aria-valuenow');
    out.percentText = (document.querySelector('#modalRoot [data-setup-live="percent"]') || {}).textContent;
    out.fillWidth = (document.querySelector('#modalRoot .setup-progress-fill') || {}).style?.width;
    closeSetupWizard('skip-ai');
    return out;
  })()`);

  const check = (label, ok, detail) => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail === undefined ? '' : ' — ' + JSON.stringify(detail)}`);
    if (!ok) process.exitCode = 1;
  };

  check('the wizard rendered a screen', run.opened === true, run.screenDuringFlood);
  check('the downloading screen was reached', run.screenDuringFlood === 'downloading', run.screenDuringFlood);
  check('400 progress events produced at most one modal rebuild per frame',
    run.renders <= run.framesAvailable, { renders: run.renders, frames: run.framesAvailable, events: run.events, elapsedMs: run.elapsedMs });
  check('the modal DOM was not replaced per event', run.replacements < 60, { replacements: run.replacements });
  check('the bar shows the newest value',
    run.ariaValueNow === '100' && run.fillWidth === '100%',
    { ariaValueNow: run.ariaValueNow, percentText: run.percentText, fillWidth: run.fillWidth });
  check('no renderer errors', run.errors.length === 0, run.errors);

  ws.close();
})().catch(error => { console.error(error); process.exit(1); });
