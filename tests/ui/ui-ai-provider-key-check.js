#!/usr/bin/env node
/**
 * DECISIONS #132 — an API key entered in Settings never reaches the renderer again.
 *
 * The defect this check pins down: `settings:get` used to decrypt the stored key and
 * hand it to the page, and the Settings form bound it into `<input type=password
 * value=…>`, so the secret sat in `state.settings.ai.apiKey` and in the DOM.
 *
 * The check stores a synthetic key through the real Settings form, then asks for the
 * settings again and inspects the page. It never prints the key itself: only whether
 * a value is present, and the masked form the UI is allowed to show.
 *
 * Usage: launch with --remote-debugging-port=PORT, then
 * `node tests/ui/ui-ai-provider-key-check.js [port]`.
 */
process.argv[2] = process.argv[2] || process.env.CDP_PORT || '9344';
const { connect } = require('../manual/lib/ui-check-lib');

// Synthetic on purpose: never a real provider key (AGENTS.md).
const KEY = 'sk-synthetic-0123456789-keycheck';
const MASK_TAIL = 'heck';
// Injected into the page (never evaluated in Node).
const providerSelect = "ai.providers.find(p => p.id === 'gemini')";

// Remove any key an earlier run (or the other provider check) left behind, through the
// real controls, and wait until storage agrees — otherwise "not configured" passes or
// fails depending on the order the checks were run in.
const resetProviderKey = `(async () => {
  navigate('settings');
  await new Promise(r => setTimeout(r, 400));
  for (let pass = 0; pass < 2; pass += 1) {
    const clear = document.querySelector('[data-ai-key-clear="gemini"]');
    if (clear && !clear.disabled) {
      clear.click();
      await new Promise(r => setTimeout(r, 150));
    }
    document.querySelector('#saveSettingsBtn').click();
    await new Promise(r => setTimeout(r, 1200));
    const ai = (await window.eduGame.getSettings()).ai;
    if (!ai.providers.find(p => p.id === 'gemini').hasKey) break;
  }
  const ai = (await window.eduGame.getSettings()).ai;
  return ai.providers.find(p => p.id === 'gemini').hasKey === true;
})()`;

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

(async () => {
  const cdp = await connect();

  // A clean provider first: a key from an earlier run (or from the settings check) must
  // not decide whether "not configured" passes.
  // A fresh page first: the renderer restores whatever a previous instance left in
  // `state.settings`, so the cleanup must start from the saved settings, not from memory.
  await cdp.evaluate(`location.reload()`);
  await new Promise(resolve => setTimeout(resolve, 2500));
  const leftover = await cdp.evaluate(resetProviderKey);
  // Reset the page again so it reads the cleaned storage rather than its memory copy.
  await cdp.evaluate(`location.reload()`);
  await new Promise(resolve => setTimeout(resolve, 2500));
  const before = await cdp.evaluate(`(async () => {
    navigate('settings');
    await new Promise(r => setTimeout(r, 500));
    const ai = (await window.eduGame.getSettings()).ai || {};
    return { page: state.page, provider: ai.provider || '', hasKey: (${providerSelect} || {}).hasKey === true };
  })()`);
  check('the cleanup removed any earlier key', leftover === false, String(leftover));
  check('the settings page renders', before.page === 'settings', before.page);
  check('a provider is always the active one', Boolean(before.provider), before.provider);
  check('no key was stored for a cloud provider before the check', before.hasKey === false, String(before.hasKey));

  const saved = await cdp.evaluate(`(async () => {
    document.querySelector('[data-ai-key-input="gemini"]').value = ${JSON.stringify(KEY)};
    document.querySelector('[data-ai-key-save="gemini"]').click();
    await new Promise(r => setTimeout(r, 900));
    const ai = (await window.eduGame.getSettings()).ai || {};
    const provider = ((await window.eduGame.getSettings()).ai.providers || []).find(p => p.id === 'gemini');
    return {
      hasKey: (provider || {}).hasKey === true,
      apiKeyIsMissing: ai.apiKey === undefined,
      mask: (provider || {}).keyMasked || '',
      storedBlob: typeof (ai.providers && ai.providers.gemini && ai.providers.gemini.apiKeyEncrypted),
      keyInState: Boolean(state.settings.ai && state.settings.ai.apiKey),
      keyInputValue: (document.querySelector('[data-ai-key-input="gemini"]') || {}).value || '',
      domHasKey: document.documentElement.innerHTML.indexOf(${JSON.stringify(KEY)}) >= 0,
      stateJsonHasKey: JSON.stringify(state.settings).indexOf(${JSON.stringify(KEY)}) >= 0,
      cardMarsked: (document.querySelector('[data-ai-key-state="gemini"]') || {}).textContent || ''
    };
  })()`);
  check('the saved key is reported as present (hasKey)', saved.hasKey === true, String(saved.hasKey));
  check('the decrypted key is not in the settings payload', saved.apiKeyIsMissing === true, String(saved.apiKeyIsMissing));
  check('only a mask is returned', saved.mask.endsWith(MASK_TAIL) && !saved.mask.includes('synthetic'), saved.mask);
  check('the card shows the mask', saved.cardMarsked.includes(saved.mask), saved.cardMarsked.slice(0, 50));
  check('no ciphertext is sent to the renderer', saved.storedBlob === 'undefined', saved.storedBlob);
  check('the key is not in state.settings', saved.keyInState === false, String(saved.keyInState));
  check('the key input is empty after saving', saved.keyInputValue === '', saved.keyInputValue);
  check('the key is not in the DOM', saved.domHasKey === false, String(saved.domHasKey));
  check('the key is not anywhere in state.settings', saved.stateJsonHasKey === false, String(saved.stateJsonHasKey));

  // An empty key field means "keep the stored key", not "delete it".
  const kept = await cdp.evaluate(`(async () => {
    document.querySelector('[data-ai-key-input="gemini"]').value = '';
    document.querySelector('#saveSettingsBtn').click();
    await new Promise(r => setTimeout(r, 900));
    const provider = state.settings.ai.providers.find(p => p.id === 'gemini');
    return { hasKey: (provider || {}).hasKey === true, mask: (provider || {}).keyMasked || '' };
  })()`);
  check('saving with an empty key field keeps the stored key', kept.hasKey === true && kept.mask.endsWith(MASK_TAIL), `${kept.hasKey}/${kept.mask}`);

  // Removal is an explicit action (marked on the card, applied by Save), and it
  // clears the key without ever writing plaintext anywhere.
  const removed = await cdp.evaluate(`(async () => {
    const button = document.querySelector('[data-ai-key-clear="gemini"]');
    if (!button) return { found: false };
    button.click();
    await new Promise(r => setTimeout(r, 150));
    document.querySelector('#saveSettingsBtn').click();
    await new Promise(r => setTimeout(r, 900));
    const ai = (await window.eduGame.getSettings()).ai;
    const provider = state.settings.ai.providers.find(p => p.id === 'gemini');
    return { found: true, hasKey: (provider || {}).hasKey === true, mask: (provider || {}).keyMasked || '', status: (provider || {}).status };
  })()`);
  check('a "remove key" control exists', removed.found === true);
  check('removing the key clears it from storage', removed.found && removed.hasKey === false && removed.mask === '', `${removed.hasKey}/${removed.mask}`);
  check('the provider returns to not-configured', removed.status === 'not-configured', removed.status);

  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
})().catch(error => {
  console.error(error && error.message ? error.message : error);
  process.exit(1);
});
