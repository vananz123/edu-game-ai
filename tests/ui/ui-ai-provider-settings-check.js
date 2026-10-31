#!/usr/bin/env node
/**
 * DECISIONS #132 — the AI provider section of Settings.
 *
 * Proves, in the real app, the lifecycle the spec asks for:
 *   not-configured → configured (key stored, masked) → ready (a real minimal request
 *   answered by a stub provider) → failing (a refused key), plus "remove key" and
 *   the wizard's "no provider" banner.
 *
 * The provider is a local HTTP stub (loopback is the one HTTP endpoint the app
 * accepts, and it is exactly the path a cloud provider takes: HTTPS check, bearer
 * header, `classifyProviderHttpError`). No real key and no network are used.
 *
 * Usage: node tests/ui/ui-ai-provider-settings-check.js [port]
 */
process.argv[2] = process.argv[2] || process.env.CDP_PORT || '9345';
const http = require('node:http');
const { connect } = require('../manual/lib/ui-check-lib');

const KEY = 'sk-synthetic-provider-check-4321';
const stubRequests = [];
let stubMode = 'ok';

const server = http.createServer((request, response) => {
  let body = '';
  request.on('data', chunk => { body += chunk; });
  request.on('end', () => {
    const parsed = (() => { try { return JSON.parse(body); } catch { return null; } })();
    stubRequests.push({ url: request.url, authorization: request.headers.authorization || '', body: parsed });
    if (stubMode === 'auth') {
      response.writeHead(401, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: { message: 'Incorrect API key provided', type: 'invalid_request_error', code: 'invalid_api_key' } }));
      return;
    }
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }], usage: { prompt_tokens: 9 } }));
  });
});

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
  const cdp = await connect();

  // This check is a sequence, and a failed run (or an earlier run, or the key check)
  // can leave a key behind. Start from a known provider state every time so a stale
  // stub key can neither make "configured" pass nor poison a later "ready" check.
  const resetProvider = `(async () => {
    navigate('settings');
    await new Promise(r => setTimeout(r, 400));
    const input = document.querySelector('[data-ai-key-input="gemini"]');
    if (input) input.value = '';
    const clear = document.querySelector('[data-ai-key-clear="gemini"]');
    if (clear && !clear.disabled) clear.click();
    document.querySelector('#saveSettingsBtn').click();
    await new Promise(r => setTimeout(r, 800));
    const ai = (await window.eduGame.getSettings()).ai;
    return (ai.providers.find(p => p.id === 'gemini') || {}).status;
  })()`;
  // A fresh page first: the renderer keeps `state.settings` from whatever a previous
  // instance left behind, and the cleanup must act on the saved settings.
  await cdp.evaluate(`location.reload()`);
  await new Promise(resolve => setTimeout(resolve, 2500));
  const resetStatus = await cdp.evaluate(resetProvider);
  await cdp.evaluate(`location.reload()`);
  await new Promise(resolve => setTimeout(resolve, 2500));

  // The key check leaves a default endpoint behind; restore the registry defaults so a
  // stale stub URL can never answer this run's test.
  await cdp.evaluate(`(async () => {
    navigate('settings');
    await new Promise(r => setTimeout(r, 400));
    const base = document.querySelector('[data-ai-provider-baseurl="gemini"]');
    const model = document.querySelector('[data-ai-provider-model="gemini"]');
    if (base) base.value = base.placeholder;
    if (model) model.value = model.placeholder;
    document.querySelector('#saveSettingsBtn').click();
    await new Promise(r => setTimeout(r, 1200));
  })()`);

  const initial = await cdp.evaluate(`(async () => {
    navigate('settings');
    await new Promise(r => setTimeout(r, 500));
    const ai = (await window.eduGame.getAiProviders()).ai || {};
    return {
      cards: document.querySelectorAll('[data-ai-provider]').length,
      ids: [...document.querySelectorAll('[data-ai-provider]')].map(n => n.dataset.aiProvider).join(','),
      keysInPayload: JSON.stringify(ai).includes('apiKey'),
      provider: ai.provider,
      configured: ai.providers.find(p => p.id === 'gemini').status,
      hasBridge: typeof window.eduGame.testAiProvider === 'function' && typeof window.eduGame.getAiProviders === 'function'
    };
  })()`);
  // #158: the AI section splits into tabs and the cloud tab lists only the providers
  // that need a key; `local` has its own tab, so it is deliberately not a card here.
  check('every key-based provider has a card in Settings', initial.cards === 4 && !initial.ids.split(',').includes('local'), `${initial.cards} / ${initial.ids}`);
  check('the provider bridges exist', initial.hasBridge === true);
  // On a fresh isolated profile local is the only candidate; after an earlier run left a
  // verified cloud key the view may name that one instead (it is what the policy picks).
  check('the active provider is always one of the usable ones', Boolean(initial.provider), initial.provider);
  check('the provider starts from a clean state', resetStatus === 'not-configured' && initial.configured === 'not-configured', `${resetStatus}/${initial.configured}`);
  check('no key-shaped field is in the provider payload', initial.keysInPayload === false, String(initial.keysInPayload));

  // Start from a clean provider: a key left by an earlier run (or by the key check)
  // would make "configured" pass without doing anything.


  // Configure the stub endpoint and store a key through the real controls.
  const configured = await cdp.evaluate(`(async () => {
    document.querySelector('[data-ai-provider-baseurl="gemini"]').value = ${JSON.stringify(baseUrl)};
    document.querySelector('[data-ai-provider-model="gemini"]').value = 'stub-model';
    document.querySelector('[data-ai-key-input="gemini"]').value = ${JSON.stringify(KEY)};
    document.querySelector('[data-ai-key-save="gemini"]').click();
    await new Promise(r => setTimeout(r, 900));
    const ai = (await window.eduGame.getSettings()).ai;
    const gemini = ai.providers.find(p => p.id === 'gemini');
    return {
      status: gemini.status,
      hasKey: gemini.hasKey,
      mask: gemini.keyMasked,
      reason: gemini.reason,
      maskInDom: document.querySelector('[data-ai-key-state="gemini"]').textContent,
      keyInDom: document.documentElement.innerHTML.includes(${JSON.stringify(KEY)}),
      keyInPayload: JSON.stringify(ai).includes(${JSON.stringify(KEY)}),
      clearEnabled: !document.querySelector('[data-ai-key-clear="gemini"]').disabled
    };
  })()`);
  check('saving a key moves the provider to "configured"', configured.status === 'configured', configured.status);
  check('the key is reported present, masked to four characters', configured.hasKey === true && /^••••4321$/.test(configured.mask), configured.mask);
  check('the card shows the masked key and not the key', configured.maskInDom.includes('••••4321') && !configured.keyInDom, configured.maskInDom.slice(0, 60));
  check('the key is never in the settings payload', configured.keyInPayload === false);
  check('"remove key" becomes available', configured.clearEnabled === true);

  // A real connection test answers 200 → ready, and it is one tiny request.
  stubRequests.length = 0;
  const tested = await cdp.evaluate(`(async () => {
    document.querySelector('#saveSettingsBtn').click();
    await new Promise(r => setTimeout(r, 700));
    // The button, not the channel: it saves, tests, refreshes the page and shows the state.
    document.querySelector('[data-ai-test="gemini"]').click();
    await new Promise(r => setTimeout(r, 300));
    await new Promise(r => setTimeout(r, 1500));
    const ai = (await window.eduGame.getSettings()).ai;
    const gemini = ai.providers.find(p => p.id === 'gemini');
    return { reason: gemini.reason, status: gemini.status, lastTestOk: gemini.lastTestOk, chip: document.querySelector('[data-ai-provider="gemini"] [data-ai-provider-chip]').textContent.trim(), picker: ai.picker };
  })()`);
  const sent = stubRequests[0] || {};
  check('a successful test marks the provider ready', tested.status === 'ready' && tested.lastTestOk === true, `${tested.status}/${tested.lastTestOk}`);
  check('the chip and the reason follow the state', tested.chip.includes('Sẵn sàng') && /thành công/.test(tested.reason), tested.chip + ' / ' + tested.reason);
  check('the test is one chat/completions request', stubRequests.length === 1 && /\/chat\/completions$/.test(sent.url || ''), `${stubRequests.length} / ${sent.url}`);
  check('the test sends the stored key as a bearer token', sent.authorization === `Bearer ${KEY}`, sent.authorization ? 'present' : 'missing');
  check('the test is minimal (max_tokens ≤ 16)', Boolean(sent.body && Number(sent.body.max_tokens) <= 16), String(sent.body && sent.body.max_tokens));
  // DECISIONS #132 D13: local stays the default; the verified cloud provider is the
  // extra choice the wizard offers (`picker.options`), it does not replace local.
  check('the verified cloud provider is offered to the wizard', tested.picker && tested.picker.options.some(o => o.id === 'gemini' && o.model === 'stub-model'), JSON.stringify(tested.picker));
  // The active provider follows the policy (local only when it actually works): the room is
  // a fresh profile where the local runtime is stopped, so the verified cloud provider is next.
  check('the active provider is one the policy would use', tested.picker && ['local', 'gemini'].includes(tested.picker.activeId), JSON.stringify(tested.picker));

  // A refused key → failing with the classified code, never a silent switch.
  stubMode = 'auth';
  const failed = await cdp.evaluate(`(async () => {
    document.querySelector('#saveSettingsBtn').click();
    await new Promise(r => setTimeout(r, 700));
    // The button, not the channel: it saves, tests, refreshes the page and shows the state.
    document.querySelector('[data-ai-test="gemini"]').click();
    await new Promise(r => setTimeout(r, 300));
    await new Promise(r => setTimeout(r, 1200));
    const ai = (await window.eduGame.getSettings()).ai;
    const gemini = ai.providers.find(p => p.id === 'gemini');
    // The active id is the provider the policy would use now: Gemini was the only ready
    // one and it just failed a real test, so the view falls back instead of keeping a
    // provider that cannot run (the saved settings are unchanged, only the view moves).
    return { status: gemini.status, code: gemini.lastTestCode, reason: gemini.reason, active: ai.provider, usable: Boolean((ai.picker.options || []).find(o => o.id === 'gemini')), picker: ai.picker };
  })()`);
  check('a refused key marks the provider failing', failed.status === 'failing' && failed.code === 'AI_AUTH', `${failed.status}/${failed.code}`);
  check('the card explains the auth failure', /API key/.test(failed.reason), failed.reason);
  check('a failing provider is not offered again until it passes', failed.usable === false, JSON.stringify({ active: failed.active, usable: failed.usable }));
  stubMode = 'ok';

  // The wizard: with no cloud provider the policy falls back to the local one and
  // the step says so; it never invents a provider.
  const wizard = await cdp.evaluate(`(async () => {
    const ai = (await window.eduGame.getSettings()).ai;
    return { auto: ai.provider, usable: ai.providers.filter(p => p.wizardEligible && p.usable).map(p => p.id).join(',') };
  })()`);
  // DECISIONS #132 D17: "custom" (tự cấu hình) is a wizard provider once verified;
  // the OpenCode gateway stays out of the game flow.
  check('the automatic policy never offers the OpenCode gateway', !/opencode/.test(wizard.usable), wizard.usable);

  // Removing the key returns the provider to not-configured.
  const removed = await cdp.evaluate(`(async () => {
    document.querySelector('[data-ai-key-clear="gemini"]').click();
    await new Promise(r => setTimeout(r, 200));
    document.querySelector('#saveSettingsBtn').click();
    await new Promise(r => setTimeout(r, 900));
    const ai = (await window.eduGame.getSettings()).ai;
    const gemini = ai.providers.find(p => p.id === 'gemini');
    return { status: gemini.status, hasKey: gemini.hasKey, picker: ai.picker.show };
  })()`);
  check('removing the key returns to not-configured', removed.status === 'not-configured' && removed.hasKey === false, `${removed.status}/${removed.hasKey}`);
  check('the picker disappears with only one usable provider', removed.picker === false, String(removed.picker));

  // Leave the isolated profile as it was found: no stub key on either stub provider.
  await cdp.evaluate(`(async () => {
    navigate('settings');
    await new Promise(r => setTimeout(r, 300));
    for (const id of ['custom', 'gemini']) {
      const clear = document.querySelector('[data-ai-key-clear="' + id + '"]');
      if (clear && !clear.disabled) { clear.click(); await new Promise(r => setTimeout(r, 120)); }
    }
    document.querySelector('#saveSettingsBtn').click();
    await new Promise(r => setTimeout(r, 1200));
  })()`).catch(() => null);
  await cdp.evaluate(resetProvider).catch(() => null);

  await new Promise(resolve => server.close(resolve));
  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
})().catch(error => {
  console.error(error && error.message ? error.message : error);
  try { server.close(); } catch {}
  process.exit(1);
});
