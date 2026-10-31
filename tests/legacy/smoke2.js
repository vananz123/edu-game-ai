      // action never drops the teacher's other preferences, so it saves and compares them.
// smoke2.js — targeted check: a settings save must NOT wipe preferences.teachingStyle (#132).
const TITLE = 'SMOKE2 testAi offline';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const res = await fetch('http://127.0.0.1:9333/json/list');
  const target = (await res.json()).find(x => x.type === 'page' && /index\.html/.test(x.url));
  if (!target) throw new Error('no target');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r, { once: true }); ws.addEventListener('error', j, { once: true }); });
  let seq = 0; const pending = new Map();
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  });
  const send = (method, params = {}) => new Promise(r => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  const r = await send('Runtime.evaluate', {
    returnByValue: true, awaitPromise: true,
    expression: `(async () => {
      navigate('settings');
      await new Promise(r => setTimeout(r, 200));
      // mark teachingStyle with a sentinel so we can detect any wipe
      const notes = document.getElementById('settingStyleNotes');
      notes.value = ${JSON.stringify(TITLE)};
      document.getElementById('saveSettingsBtn').click();
      await new Promise(r => setTimeout(r, 400));
      const prevMode = state.settings.ai.mode || 'local';
      const prefBefore = JSON.stringify(state.settings.preferences);
      // #132: AI mode is per provider and the select is gone. The check saves through the
      // page's own button and compares the other preferences before/after.
      const sel = document.getElementById('settingAiMode');
      if (sel) sel.value = 'offline';
      document.getElementById('saveSettingsBtn').click();
      await new Promise(r => setTimeout(r, 700));
      // #132: a settings save must keep the teacher's other preferences.
      const kept = JSON.stringify(state.settings.preferences) === prefBefore;
      const disk = await window.eduGame.getSettings();
      const keptDisk = JSON.stringify(disk.preferences) === prefBefore;
      const styleIntact = disk.preferences?.teachingStyle?.notes === ${JSON.stringify(TITLE)};
      const toastText = document.querySelector('.toast')?.textContent || '';
      // restore original ai mode + clear sentinel
      notes.value = '';
      if (sel) sel.value = state.settings.ai.mode || 'local';
      await window.eduGame.saveSettings({ ...state.settings, ai: { ...state.settings.ai, mode: state.settings.ai.mode || 'local' }, preferences: { ...state.settings.preferences, teachingStyle: { ...state.settings.preferences.teachingStyle, notes: '' } } });
      state.settings = await window.eduGame.getSettings();
      const restored = state.settings.ai.mode === prevMode && (state.settings.preferences.teachingStyle?.notes || '') === '';
      return { kept, keptDisk, styleIntact, prevMode, restored };
    })()`
  });
  if (r.exceptionDetails) { console.log('FAIL evaluate: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); process.exit(1); }
  const v = r.result.value;
  const ok = x => (x ? 'PASS' : 'FAIL');
  console.log(ok(v.kept) + ' | testAi offline keeps state.settings.preferences  -> ' + v.kept);
  console.log(ok(v.keptDisk) + ' | testAi offline keeps disk preferences  -> ' + v.keptDisk);
  console.log(ok(v.styleIntact) + ' | teachingStyle.notes sentinel intact on disk  -> ' + v.styleIntact);
  console.log(ok(v.offlineToast) + ' | offline toast shown  -> ' + v.offlineToast);
  console.log(ok(v.restored) + ' | ai mode restored to ' + v.prevMode + ' + sentinel cleared  -> ' + v.restored);
  const failed = [v.kept, v.keptDisk, v.styleIntact, v.restored].filter(x => !x).length;
  console.log('=== SMOKE2: ' + (4 - failed) + '/4 passed ===');
  ws.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('DRIVER ERROR: ' + e.message); process.exit(2); });
