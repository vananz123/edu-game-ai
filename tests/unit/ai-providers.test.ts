/**
 * DECISIONS #132 — the provider registry (pure, no Electron).
 *
 * The registry is the one place that answers "may this provider be used for a
 * game right now, and which one is chosen": the lifecycle the spec asks for
 * (not configured → configured → ready → failing), the automatic order, and the
 * rule that an explicit choice is never silently replaced.
 */
import assert from 'node:assert/strict';
import {
  AI_PROVIDERS,
  AUTO_PROVIDER_ORDER,
  chooseProvider,
  errorLabel,
  getProviderDefinition,
  maskApiKey,
  migrateLegacyAiSettings,
  resolveProviderState,
  type AiSettingsShape,
  toPublicProviderView
} from '../../src/services/ai-providers';

function registryShape(): void {
  assert.equal(AI_PROVIDERS.length, 5, 'five providers are declared');
  const eligible = AI_PROVIDERS.filter(provider => provider.wizardEligible).map(provider => provider.id);
  // DECISIONS #132 D17: a verified custom endpoint is a real choice too.
  assert.equal(eligible.join(','), 'local,gemini,openai,custom', `wizard providers are ${eligible.join(',')}`);
  assert.equal(AUTO_PROVIDER_ORDER.join(','), 'local,gemini,openai', 'the preferred order is local → gemini → openai');
  assert.equal(getProviderDefinition('gemini')?.requiresKey, true, 'Gemini needs a key');
  assert.equal(getProviderDefinition('local')?.requiresKey, false, 'local needs no key');
  assert.equal(getProviderDefinition('custom')?.wizardEligible, true, 'a tested custom endpoint may be used');
  assert.equal(getProviderDefinition('custom')?.requiresKey, true, 'a custom endpoint needs its key');
  assert.equal(getProviderDefinition('nope'), null, 'an unknown id has no definition');
  assert.ok(errorLabel('AI_AUTH').length > 5, 'error labels are human');
}

type Settings = Parameters<typeof resolveProviderState>[0]['settings'];

function gemini(stored: Record<string, unknown>, extra: Partial<Parameters<typeof resolveProviderState>[0]> = {}) {
  const resolved = resolveProviderState({ settings: { providers: { gemini: stored } } as Settings, ...extra });
  return resolved.find(provider => provider.id === 'gemini')!;
}

function lifecycle(): void {
  const notConfigured = gemini({});
  assert.equal(notConfigured.status, 'not-configured', 'no key → not-configured');
  assert.equal(notConfigured.usable, false, 'not-configured is not usable');

  const configured = gemini({ apiKeyEncrypted: 'blob', baseUrl: 'https://x/v1', model: 'm' });
  assert.equal(configured.status, 'configured', 'key + endpoint → configured');
  // Spec §3: configured-but-never-verified is never dispatched to.
  assert.equal(configured.usable, false, 'configured alone is not usable; the teacher tests once');

  const ready = gemini({ apiKeyEncrypted: 'blob', baseUrl: 'https://x/v1', model: 'm', lastTestOk: true, lastTestAt: '2026-10-29T10:00:00.000Z' });
  assert.equal(ready.status, 'ready', 'a successful test → ready');
  assert.equal(ready.usable, true, 'ready is usable');
  assert.match(ready.reason, /thành công/, `ready explains itself: ${ready.reason}`);

  const failing = gemini({ apiKeyEncrypted: 'blob', baseUrl: 'https://x/v1', model: 'm', lastTestOk: false, lastTestCode: 'AI_AUTH', lastTestAt: '2026-10-29T10:00:00.000Z' });
  assert.equal(failing.status, 'failing', 'a failed test → failing');
  assert.equal(failing.usable, false, 'failing is not usable');
  assert.match(failing.reason, /API key/, `failing names the cause: ${failing.reason}`);

  // The registry defaults each provider's endpoint/model, so only a provider with
  // no default at all (`custom`) can be missing one.
  const custom = (stored: Record<string, unknown>) => resolveProviderState({ settings: { providers: { custom: stored } } as Settings }).find(provider => provider.id === 'custom')!;
  assert.equal(custom({ apiKeyEncrypted: 'blob' }).status, 'not-configured', 'no endpoint → not-configured even with a key');
  assert.equal(gemini({ baseUrl: 'https://x/v1', model: 'm' }).status, 'not-configured', 'no key → not-configured even with an endpoint');
  assert.equal(gemini({ apiKeyEncrypted: 'blob' }).baseUrl, 'https://generativelanguage.googleapis.com/v1beta/openai', 'a missing endpoint falls back to the provider default');

  // Local readiness comes from the runtime, never from a test timestamp.
  const local = (running: boolean) => resolveProviderState({ settings: {}, localRunning: running, localModelReady: true }).find(provider => provider.id === 'local')!;
  assert.equal(local(true).status, 'ready', 'a running local runtime is ready');
  assert.equal(local(true).usable, true, 'a running local runtime is usable');
  assert.equal(local(false).status, 'configured', 'a stopped local runtime is configured, not ready');
  assert.equal(local(false).usable, false, 'a stopped local runtime is not usable');
  assert.doesNotMatch(local(false).reason, /tải model/, `a loaded-but-stopped model is described as stopped: ${local(false).reason}`);

  const disabled = gemini({ apiKeyEncrypted: 'blob', baseUrl: 'https://x/v1', model: 'm', lastTestOk: true, enabled: false });
  assert.equal(disabled.status, 'ready', 'a disabled provider keeps its verified state');
  assert.equal(disabled.usable, false, 'a disabled provider is not dispatched to');
}

function autoOrder(): void {
  const openai = { apiKeyEncrypted: 'a', baseUrl: 'https://a/v1', model: 'm', lastTestOk: true };
  const geminiReady = { apiKeyEncrypted: 'b', baseUrl: 'https://b/v1', model: 'm', lastTestOk: true };
  const both = chooseProvider({ settings: { providers: { openai, gemini: geminiReady } } as Settings });
  assert.equal(both.provider?.id, 'gemini', `Gemini beats ChatGPT when both are ready: ${both.provider?.id}`);

  const onlyOpenai = chooseProvider({ settings: { providers: { openai } } as Settings });
  assert.equal(onlyOpenai.provider?.id, 'openai', 'ChatGPT is used when it is the only ready provider');

  const withLocal = chooseProvider({ settings: { providers: { openai, gemini: geminiReady } } as Settings, localRunning: true });
  assert.equal(withLocal.provider?.id, 'local', 'local wins over any cloud provider');

  const none = chooseProvider({ settings: {} });
  assert.equal(none.provider, null, 'no ready provider → no provider');
  assert.equal(none.code, 'AI_NO_PROVIDER', 'no ready provider → AI_NO_PROVIDER');
  assert.match(none.reason, /Cài đặt AI/, `the reason points at Settings: ${none.reason}`);
}

function explicitChoice(): void {
  const openai = { apiKeyEncrypted: 'a', baseUrl: 'https://a/v1', model: 'm', lastTestOk: true };
  const asked = chooseProvider({ settings: { providers: { openai } } as Settings, requested: 'openai' });
  assert.equal(asked.provider?.id, 'openai', 'an explicit request is honoured');
  assert.equal(asked.code, null, 'an honoured request has no error code');

  const settings = {
    providers: {
      gemini: { apiKeyEncrypted: 'b', baseUrl: 'https://b/v1', model: 'm', lastTestOk: false, lastTestCode: 'AI_AUTH' },
      openai
    }
  } as Settings;
  const refused = chooseProvider({ settings, requested: 'gemini' });
  // D8: no silent switch — the requested provider is reported as not ready.
  assert.equal(refused.provider, null, 'a failing requested provider is not replaced by another');
  assert.equal(refused.code, 'AI_PROVIDER_NOT_READY', `code is AI_PROVIDER_NOT_READY, got ${refused.code}`);

  const unknown = chooseProvider({ settings, requested: 'acme' });
  assert.equal(unknown.code, 'AI_NO_PROVIDER', 'an unknown provider id is refused');
}

/**
 * DECISIONS #132 D17: a tested custom endpoint is usable for the lesson workflow, while
 * the OpenCode gateway stays out (legacy tool only).
 */
function ineligibleProviders(): void {
  const settings = {
    providers: {
      opencode: { baseUrl: 'https://opencode.ai/zen/v1', model: 'm', lastTestOk: true },
      custom: { apiKeyEncrypted: 'c', baseUrl: 'https://c/v1', model: 'm', lastTestOk: true }
    }
  } as Settings;

  const requested = chooseProvider({ settings, requested: 'opencode' });
  assert.equal(requested.code, 'AI_PROVIDER_NOT_ELIGIBLE', 'asking for opencode says why it is not eligible');

  const resolved = resolveProviderState({ settings });
  assert.equal(resolved.find(provider => provider.id === 'opencode')!.usable, false, 'opencode is never usable');
  assert.equal(resolved.find(provider => provider.id === 'custom')!.usable, true, 'a verified custom endpoint is usable');

  // The preferred order still wins; custom is the fallback when nothing preferred works.
  const customOnly = chooseProvider({ settings: { providers: { custom: settings.providers!.custom } } as Settings });
  assert.equal(customOnly.provider?.id, 'custom', 'custom is chosen when it is the only verified provider');
  const both = chooseProvider({ settings: { providers: { custom: settings.providers!.custom, openai: { apiKeyEncrypted: 'a', baseUrl: 'https://a/v1', model: 'm', lastTestOk: true } } } as Settings });
  assert.equal(both.provider?.id, 'openai', 'a preferred provider is still chosen before custom');
}

/**
 * DECISIONS #132 §D13: the lesson workflow's "Phân tích bằng AI local" button is an
 * explicit local request. A running local runtime is used even when a cloud provider
 * is also ready; when local is stopped the request fails instead of quietly running
 * on the cloud provider the teacher did not press.
 */
function explicitLocalButton(): void {
  const openai = { apiKeyEncrypted: 'a', baseUrl: 'https://a/v1', model: 'm', lastTestOk: true };
  const geminiReady = { apiKeyEncrypted: 'b', baseUrl: 'https://b/v1', model: 'g', lastTestOk: true };
  const ready = { providers: { openai, gemini: geminiReady } } as Settings;

  const auto = chooseProvider({ settings: ready, localRunning: true });
  assert.equal(auto.provider?.id, 'local', 'the policy already prefers a running local runtime');

  const localStopped = chooseProvider({ settings: ready, localRunning: false, localPreferred: true });
  assert.equal(localStopped.provider, null, 'the local button never falls back to a cloud provider');
  assert.equal(localStopped.code, 'AI_NOT_RUNNING', `a stopped local runtime is AI_NOT_RUNNING, got ${localStopped.code}`);
  assert.match(localStopped.reason, /AI local chưa chạy/, 'the reason says the local runtime is not running');

  // The cloud button is a normal explicit request and is unaffected.
  const cloud = chooseProvider({ settings: ready, requested: 'gemini', localRunning: true });
  assert.equal(cloud.provider?.id, 'gemini', 'the cloud button runs on its provider even while local is running');
}

function masking(): void {
  assert.equal(maskApiKey('sk-abcdefgh1234'), '••••1234', 'the mask keeps the last four characters');
  assert.equal(maskApiKey(''), '', 'no key → no mask');
  assert.equal(maskApiKey(undefined), '', 'undefined key → no mask');
  const resolved = resolveProviderState({ settings: { providers: { gemini: { apiKeyEncrypted: 'b' } } } as Settings });
  const view = toPublicProviderView(resolved, { gemini: 'sk-secret-value-9999' });
  const entry = view.find(provider => provider.id === 'gemini')!;
  assert.equal(entry.hasKey, true, 'the view reports that a key exists');
  assert.equal(entry.keyMasked, '••••9999', 'the view carries only the mask');
  assert.ok(!JSON.stringify(view).includes('sk-secret'), 'the view never contains the key');
}

function migration(): void {
  // The settings file is untyped JSON on disk; the migration is the boundary that
  // turns it into the provider shape, so the test reads it the way main will.
  const aiOf = (settings: unknown): AiSettingsShape => (settings as { ai: AiSettingsShape }).ai;
  const legacy = {
    ai: {
      mode: 'online',
      cloudProvider: 'gemini',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      model: 'gemini-2.5-flash',
      apiKeyEncrypted: 'old-blob'
    },
    preferences: { sound: true }
  };
  const first = migrateLegacyAiSettings(legacy);
  assert.equal(first.changed, true, 'a legacy key triggers the migration');
  const ai = aiOf(first.settings);
  assert.equal(ai.provider, 'gemini', 'the migrated provider is the one the key belonged to');
  assert.equal(ai.providerPolicy, 'auto', 'the policy defaults to auto');
  const stored = (ai.providers as Record<string, { apiKeyEncrypted?: string; baseUrl?: string; model?: string }>).gemini;
  assert.equal(stored.apiKeyEncrypted, 'old-blob', 'the key blob moves as-is (never decrypted here)');
  assert.match(String(stored.baseUrl), /googleapis\.com/, 'the endpoint moves with the key');
  assert.equal(stored.model, 'gemini-2.5-flash', 'the model moves with the key');
  assert.ok(!('apiKeyEncrypted' in (ai as Record<string, unknown>)), 'the legacy key field is removed');
  assert.equal((first.settings as { preferences?: { sound?: boolean } }).preferences?.sound, true, 'unrelated settings are kept');

  const second = migrateLegacyAiSettings(first.settings);
  assert.equal(second.changed, false, 'a migrated file is not migrated twice');
  const again = (aiOf(second.settings).providers as Record<string, { apiKeyEncrypted?: string }>).gemini;
  assert.equal(again.apiKeyEncrypted, 'old-blob', 'the key is not "moved" twice');

  const fresh = migrateLegacyAiSettings({ ai: { mode: 'local' } });
  assert.equal(aiOf(fresh.settings).provider, 'local', 'a fresh file starts on the local provider');
  assert.equal(aiOf(fresh.settings).providerPolicy, 'auto', 'a fresh file starts on the automatic policy');
  assert.equal(migrateLegacyAiSettings(fresh.settings).changed, false, 'the defaults are only written once');

  const view = toPublicProviderView(resolveProviderState({ settings: { providers: { openai: { apiKeyEncrypted: 'b', baseUrl: 'https://a/v1', model: 'm', lastTestOk: true } } } as Settings }), {});
  assert.ok(!JSON.stringify(view).includes('apiKeyEncrypted'), 'the public view has no ciphertext');

  // #132: the chosen provider in a view is the one the workflow would use now.
  const openaiReady = { apiKeyEncrypted: 'b', baseUrl: 'https://a/v1', model: 'm', lastTestOk: true };
  const geminiReady = { apiKeyEncrypted: 'c', baseUrl: 'https://b/v1', model: 'g', lastTestOk: true };
  const auto = chooseProvider({ settings: { providers: { openai: openaiReady, gemini: geminiReady } } as Settings });
  assert.equal(auto.provider?.id, 'gemini', 'the auto policy names Gemini over ChatGPT');
  const stoppedLocal = chooseProvider({ settings: { providers: { openai: openaiReady } } as Settings, localRunning: false, localModelReady: true });
  assert.equal(stoppedLocal.provider?.id, 'openai', 'a stopped local runtime is skipped for the view and the request alike');
}

registryShape();
lifecycle();
autoOrder();
explicitChoice();
ineligibleProviders();
explicitLocalButton();
masking();
migration();

console.log('AI provider registry tests passed');
