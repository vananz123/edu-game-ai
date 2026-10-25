// tests/install-local-model.js — one-off installer helper (NOT a regression smoke).
//
// Downloads + SHA-256-verifies the bundled llama.cpp runtime and a Qwen GGUF by
// calling the app's own IPC (`ai:install-local-model`), then starts the runtime
// (`ai:start-local-runtime`). Progress is streamed through `ai:local-progress`.
//
// Usage (app must be open with --remote-debugging-port=9333):
//   node tests/manual/install-local-model.js [modelId]        # default qwen3.5-2b-q4_k_m
//   node tests/manual/install-local-model.js qwen3.5-2b-q4_k_m status
const modelId = process.argv[2] || 'qwen3.5-2b-q4_k_m';
const mode = process.argv[3] || 'install';
const sleep = ms => new Promise(r => setTimeout(r, ms));

function mb(bytes) { return (bytes / 1024 / 1024).toFixed(1) + ' MB'; }

(async () => {
  const res = await fetch('http://127.0.0.1:9333/json/list');
  const target = (await res.json()).find(x => x.type === 'page' && /index\.html/.test(x.url));
  if (!target) throw new Error('no CDP target — is the app running on 9333?');
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

  // Report the current machine/model view first.
  const before = await evalv(`(async () => {
    const state = await window.eduGame.getLocalAiModels();
    const status = await window.eduGame.getLocalRuntimeStatus();
    return {
      runtimeInstalled: state.runtimeInstalled,
      recommendedModelId: state.recommendedModelId,
      models: (state.models || []).map(m => ({ id: m.id, installed: !!m.installed, sizeBytes: m.sizeBytes })),
      status
    };
  })()`);
  console.log('machine:', JSON.stringify(before, null, 2));

  if (mode === 'status') { ws.close(); return; }

  // Kick the install WITHOUT awaiting it, so we can poll progress on the same socket.
  await evalv(`(() => {
    window.__install = { state: 'running', progress: null };
    window.eduGame.onLocalAiProgress(p => { window.__install.progress = p; });
    window.eduGame.installLocalAiModel(${JSON.stringify(modelId)})
      .then(models => { window.__install.state = 'done'; window.__install.models = models; })
      .catch(e => { window.__install.state = 'error'; window.__install.error = String((e && e.message) || e); });
    return true;
  })()`);

  console.log(`installing ${modelId} …`);
  let last = '';
  for (let i = 0; i < 3600; i += 1) {
    await sleep(5000);
    const st = await evalv(`(() => {
      const s = window.__install || {};
      const p = s.progress;
      return { state: s.state, error: s.error || null,
        stage: p && p.stage, modelId: p && p.modelId,
        got: p && p.receivedBytes, total: p && p.totalBytes, bps: p && p.bytesPerSecond };
    })()`);
    const line = `${st.stage || '-'} ${st.got || 0}/${st.total || 0} (${mb(st.got || 0)} / ${mb(st.total || 0)}) ${st.bps ? mb(st.bps) + '/s' : ''}`;
    if (line !== last) { console.log('  ' + line); last = line; }
    if (st.state === 'done') { console.log(`install done: ${modelId}`); break; }
    if (st.state === 'error') { console.error(`install FAILED: ${st.error}`); process.exitCode = 1; break; }
  }

  if (mode === 'install-only') { ws.close(); return; }

  console.log('starting llama.cpp runtime …');
  const started = await evalv(`window.eduGame.startLocalRuntime(${JSON.stringify(modelId)}).then(r => ({ ok: true, baseUrl: r.baseUrl })).catch(e => ({ ok: false, error: String((e && e.message) || e) }))`);
  console.log('start result:', JSON.stringify(started));
  const after = await evalv(`window.eduGame.getLocalRuntimeStatus()`);
  console.log('runtime status:', JSON.stringify(after));
  if (!started.ok) process.exitCode = 1;
  ws.close();
})().catch(error => { console.error('DRIVER ERROR:', error.message); process.exitCode = 1; });
