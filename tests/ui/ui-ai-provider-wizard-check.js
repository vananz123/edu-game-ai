#!/usr/bin/env node
/**
 * DECISIONS #132 — Step 2 and Step 5 use the provider configured in Settings.
 * DECISIONS #180 — step 2 also states how much of the lesson that provider reads
 * (a cloud endpoint gets the whole document; the local runtime has a budget).
 *
 * The page is given a provider view through `desktop.stub('getAiProviders')` (the
 * renderer only calls the façade now, and the gate must not depend on the network —
 * #259/#260), and
 * hai lời gọi `analyzeLesson` / `generateLessonDraft` được thay bằng hàm ghi lại
 * yêu cầu, không chạy model nào. Nothing is generated: every check is about what the
 * wizard shows and what it asks for.
 *
 * Usage: node tests/ui/ui-ai-provider-wizard-check.js [port]
 */
process.argv[2] = process.argv[2] || process.env.CDP_PORT || '9346';
const { connect } = require('../manual/lib/ui-check-lib');

const LESSON = `Bài 12: Quang hợp ở thực vật

I. Mục tiêu
Sau bài học, học sinh trình bày được khái niệm quang hợp và vai trò của ánh sáng đối với cây xanh.

II. Kiến thức trọng tâm
Quang hợp là quá trình thực vật sử dụng năng lượng ánh sáng để tổng hợp chất hữu cơ từ nước và khí cacbonic.
Diệp lục trong lá hấp thụ ánh sáng, chuyển hóa năng lượng ánh sáng thành năng lượng hóa học.`;

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

function providerView({ localRunning = true, gemini = null, openai = null } = {}) {
  const base = { note: '', wizardEligible: true, requiresKey: true, lastTestAt: null, lastTestOk: null, lastTestCode: null, enabled: true, keyMasked: '••••abcd' };
  const local = { ...base, id: 'local', label: 'AI local (llama.cpp)', requiresKey: false, status: localRunning ? 'ready' : 'configured', reason: localRunning ? 'Đang chạy trên máy này.' : 'Model đã tải nhưng chưa chạy.', hasKey: false, baseUrl: '', model: 'qwen3.5-2b-q4_k_m', usable: localRunning, defaultBaseUrl: '', defaultModel: '' };
  const gem = gemini ? { ...base, id: 'gemini', label: 'Gemini (Google)', status: 'ready', reason: 'Kiểm tra kết nối thành công.', hasKey: true, baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash', usable: true, defaultBaseUrl: '', defaultModel: '' } : { ...base, id: 'gemini', label: 'Gemini (Google)', status: 'not-configured', reason: 'Chưa có API key.', hasKey: false, baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash', usable: false, defaultBaseUrl: '', defaultModel: '' };
  const oai = openai ? { ...base, id: 'openai', label: 'ChatGPT (OpenAI)', status: 'ready', reason: 'Kiểm tra kết nối thành công.', hasKey: true, baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', usable: true, defaultBaseUrl: '', defaultModel: '' } : { ...base, id: 'openai', label: 'ChatGPT (OpenAI)', status: 'not-configured', reason: 'Chưa có API key.', hasKey: false, baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', usable: false, defaultBaseUrl: '', defaultModel: '' };
  const opencode = { ...base, id: 'opencode', label: 'OpenCode Zen', wizardEligible: false, requiresKey: false, status: 'ready', reason: 'Đã cấu hình.', hasKey: false, baseUrl: 'https://opencode.ai/zen/v1', model: 'mimo', usable: false, defaultBaseUrl: '', defaultModel: '' };
  const custom = { ...base, id: 'custom', label: 'API tương thích OpenAI', wizardEligible: false, requiresKey: false, status: 'not-configured', reason: 'Chưa có điểm cuối.', hasKey: false, baseUrl: '', model: '', usable: false, defaultBaseUrl: '', defaultModel: '' };
  const providers = [local, gem, oai, opencode, custom];
  const usable = providers.filter(p => p.usable);
  const activeId = usable.length ? usable[0].id : 'local';
  // #180: main ships the read budget with the provider view; `null` = the whole
  // lesson is sent, which is what every cloud endpoint gets.
  const lessonAnalyzeBudget = activeId === 'local' ? 12000 : null;
  return {
    id: 'override',
    ai: {
      mode: activeId === 'local' ? 'local' : 'online',
      provider: activeId,
      providerPolicy: 'auto',
      providers,
      hasKey: false,
      keyMasked: '',
      lessonAnalyzeBudget,
      picker: {
        show: usable.length > 1,
        options: usable.map(p => ({ id: p.id, label: p.label, model: p.model })),
        activeId
      }
    },
    preferences: { sound: true, largeText: true, theme: 'light', audience: 'teen' }
  };
}

/**
 * Installs a fake provider view and captures the payloads of the two workflow
 * calls. The renderer only reaches the shell through `desktop`, and the façade's
 * `stub()` is meant for exactly this: substitute an answer without a model.
 */
// DECISIONS #132 D16: entering step 2 refreshes the provider view. The stub below
// answers that refresh with the scenario's view, and the render keeps it in place.
const KEEP_PROVIDER_VIEW = `(() => {
  if (window.__keepProviderView) return;
  window.__keepProviderView = true;
  const original = window.render;
  // Keep the untouched render reachable: the scenarios below replace state.settings with a
  // mock, and a sibling CDP check on this same page instance would read that mock through
  // this wrapper forever. TEARDOWN reverses exactly what is installed here.
  window.__realRender = original;
  window.render = function () {
    if (window.__providerView && window.__providerView.ai) state.settings.ai = JSON.parse(JSON.stringify(window.__providerView.ai));
    return original.apply(this, arguments);
  };
})()`;

const TEARDOWN = `(async () => {
  if (window.__realRender) window.render = window.__realRender;
  delete window.__realRender;
  delete window.__providerView;
  delete window.__providerCalls;
  ['getAiProviders', 'analyzeLesson', 'generateLessonDraft', 'regenerateLessonItem'].forEach(name => desktop.stub(name, null));
  window.__keepProviderView = false;
  state.settings = await desktop.call('getSettings');
  navigate('home');
  render();
  await new Promise(r => setTimeout(r, 250));
  return { wrapperGone: window.__providerView === undefined, provider: state.settings.ai.provider };
})()`;

function installHarness(view, analyzeBehaviour = 'ok') {
  return `(async () => {
    // What the wizard reads (state.settings) and calls (desktop.call) is set here:
    // the façade decides every call, so stubs are enough and no model runs.
    window.__providerView = ${JSON.stringify(view)};
    window.__providerCalls = [];
    const behaviour = ${JSON.stringify(analyzeBehaviour)};
    desktop.stub('analyzeLesson', async payload => {
      window.__providerCalls.push({ kind: 'analyze', ...payload });
      if (behaviour === 'no-provider') throw new Error('[AI_NO_PROVIDER] Chưa có nhà cung cấp AI nào sẵn sàng.');
      return { analysis: { id: 'a1', topic: 'Quang hợp', subject: 'Sinh học', grade: 8, objectives: [{ id: 'o1', description: 'Mô tả quang hợp', cognitiveLevel: 'understand' }], keyConcepts: [], uncertainties: [] }, project: null, cached: false };
    });
    desktop.stub('generateLessonDraft', async payload => { window.__providerCalls.push({ kind: 'generate', ...payload }); throw new Error('[AI_CANCELLED] stop'); });
    desktop.stub('regenerateLessonItem', async payload => { window.__providerCalls.push({ kind: 'regenerate', ...payload }); throw new Error('[AI_CANCELLED] stop'); });
    // DECISIONS #132 D16: entering step 2 refreshes the provider view. Answer with this
    // scenario's view so the step shows what the harness set up, not the real profile.
    desktop.stub('getAiProviders', async () => JSON.parse(JSON.stringify(window.__providerView)));
    state.settings = JSON.parse(JSON.stringify(${JSON.stringify(view)}));
    return { provider: state.settings.ai.provider, picker: state.settings.ai.picker };
  })()`;
}
(async () => {
  const cdp = await connect();

  // 0. Default profile: only the local provider can run (no model verified here).
  const localOnly = await cdp.evaluate(`(async () => {
    navigate('create-wizard');
    await new Promise(r => setTimeout(r, 400));
    return {
      hasBridge: Boolean(DESKTOP_FACADE_SCHEMA.calls.testAiProvider),
      shell: typeof desktop !== 'undefined' ? desktop.info().adapter : 'none'
    };
  })()`);
  check('the provider calls are in the façade contract and the shell is attached',
    localOnly.hasBridge === true && localOnly.shell === 'electron', JSON.stringify(localOnly));

  // 1. Two providers ready → the small picker appears on step 2 and step 5.
  const two = await cdp.evaluate(installHarness(providerView({ gemini: true })));
  await cdp.evaluate(KEEP_PROVIDER_VIEW);
  check('two ready providers keep the policy default on local', two.provider === 'local', two.provider);
  check('the picker is offered when two providers are ready', two.picker.show === true && two.picker.options.length === 2, JSON.stringify(two.picker));
  check('OpenCode/custom are never offered to the wizard', !two.picker.options.some(option => option.id === 'opencode' || option.id === 'custom'), two.picker.options.map(o => o.id).join(','));

  const step2 = await cdp.evaluate(`(async () => {
    if (typeof wizardReset === 'function') wizardReset();
    navigate('create-wizard');
    await new Promise(r => setTimeout(r, 300));
    wizardState.text = ${JSON.stringify(LESSON)};
    wizardState.documentName = 'quang-hop.txt';
    wizardState.documentId = 'doc-provider-check';
    wizardState.step = 'analyze';
    render();
    await new Promise(r => setTimeout(r, 200));
    const button = document.getElementById('wizardAnalyzeBtn');
    const select = document.getElementById('wizardProviderSelect');
    const card = document.querySelector('[data-wizard-provider]');
    return {
      button: button ? button.textContent.trim() : '',
      select: Boolean(select),
      selectOptions: select ? [...select.options].map(o => o.value).join(',') : '',
      card: card ? card.dataset.wizardProvider : '',
      pickerBefore: wizardState.selectedProviderId,
      // #132 D13: the explicit cloud action and the sentence that explains it.
      cloudButton: (document.querySelector('[data-wizard-action="analyze-cloud"]') || {}).textContent,
      cloudProviderId: (document.querySelector('[data-wizard-action="analyze-cloud"]') || { dataset: {} }).dataset.providerId,
      cloudHint: (document.querySelector('[data-wizard-cloud-hint]') || {}).textContent || '',
      localNotice: (document.querySelector('[data-wizard-local-notice]') || {}).textContent || '',
      cloudTone: (() => { const b = document.querySelector('[data-wizard-action="analyze-cloud"]'); return b ? (b.getAttribute('class') || '') : ''; })()
    };
  })()`);
  check('the step-2 action names the provider ("Phân tích…")', /Phân tích/.test(step2.button), step2.button);
  check('the step-2 action says which provider it uses', /AI local/.test(step2.button), step2.button);
  check('step 2 shows the provider in use', step2.card === 'local', step2.card);
  check('step 2 has the compact picker with both providers', step2.select && step2.selectOptions === 'local,gemini', step2.selectOptions);
  // #132 D13: local is the default and always the first button; the cloud button is
  // an extra, explicit action that names its provider.
  check('the primary analysis button is always the local one', /Phân tích bằng AI local/.test(step2.button), step2.button);
  // D14: llama.cpp is not running in this harness, so the step shows the way to start it;
  // pressing the local button opens the AI-local window instead of a doomed run.
  check('the local button explains the launch step when AI local is not ready', /Bắt đầu chạy/.test(String(step2.localNotice)) || /Bắt đầu chạy/.test(String(step2.busyText)), String(step2.localNotice || step2.busyText));
  check('a verified cloud provider adds a second analysis button', /Phân tích/.test(String(step2.cloudButton)) && step2.cloudProviderId === 'gemini', String(step2.cloudButton));
  check('the cloud button names its provider', /Gemini/.test(String(step2.cloudButton)), String(step2.cloudButton));
  // D14: red only after a real cloud failure, never because the provider exists.
  // #181: the red moved from an inline `style="color:#dc2626"` to the `.is-alert` class
  // (an inline style is invisible to the dark translation table), so the probe reads `class`.
  check('a verified cloud button is not red by default', !/is-alert/.test(String(step2.cloudTone)), String(step2.cloudTone));
  check('the step says the cloud button leaves the machine', /Internet/.test(step2.cloudHint), step2.cloudHint.slice(0, 80));

  const step5 = await cdp.evaluate(`(async () => {
    wizardState.step = 'generate';
    wizardState.config = { gameType: 'arena', title: 'T', generationMode: 'fast' };
    wizardState.draft = null;
    wizardState.gameSnapshot = null;
    render();
    await new Promise(r => setTimeout(r, 200));
    const button = document.getElementById('wizardGenerateBtn');
    const select = document.getElementById('wizardProviderSelect');
    return { button: button ? button.textContent.trim() : '', select: Boolean(select), empty: Boolean(document.querySelector('[data-wizard-provider-empty]')) };
  })()`);
  check('the step-5 action names the provider ("Tạo nội dung…")', /Tạo nội dung/.test(step5.button), step5.button);
  check('the step-5 action says which provider it uses', /AI local/.test(step5.button), step5.button);
  check('step 5 offers the same picker', step5.select === true);
  check('step 5 is not blocked while a provider is ready', step5.empty === false);

  // 2. Picking Gemini sends `providerId` on analyze and generate.
  const picked = await cdp.evaluate(`(async () => {
    if (typeof wizardReset === 'function') wizardReset();
    state.settings = JSON.parse(JSON.stringify(window.__providerView));
    wizardState.step = 'analyze';
    wizardState.analysis = null;
    wizardState.documentId = 'doc-provider-check';
    render();
    await new Promise(r => setTimeout(r, 150));
    const select = document.getElementById('wizardProviderSelect');
    const selectOptions = select ? [...select.options].map(option => option.value).join(',') : '';
    if (!select) return { selectOptions, payload: null, emptyPayload: null, selected: null };
    select.value = 'gemini';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 150));
    const payload = wizardProviderRequestPayload();
    const explicitPayload = (wizardProviderRequestPayload('gemini') || {}).providerId || null;
    // Reset the step so the rest of the check starts from the automatic policy again.
    wizardState.selectedProviderId = '';
    return { selectOptions, payload: payload.providerId || null, explicitPayload, emptyPayload: JSON.stringify(wizardProviderRequestPayload()), selected: 'gemini' };
  })()`);
  // The picker only offers wizard-eligible providers; the chosen one travels in the
  // request payload so main can dispatch Step 2 to it (D7).
  check('the picker offers exactly the wizard providers', picked.selectOptions === 'local,gemini', picked.selectOptions);
  check('the analysis payload builds a providerId for the picker', picked.payload === 'gemini', String(picked.payload));
  check('the analysis payload is empty without a pick', picked.emptyPayload === '{}', String(picked.emptyPayload));
  check('an explicit cloud button overrides the picker in the payload', picked.explicitPayload === 'gemini', String(picked.explicitPayload));

  // 3. A single ready provider → no picker, nothing to choose.
  const single = await cdp.evaluate(installHarness(providerView({ gemini: false })));
  const singleStep = await cdp.evaluate(`(async () => {
    if (typeof wizardReset === 'function') wizardReset();
    state.settings = JSON.parse(JSON.stringify(window.__providerView));
    wizardState.step = 'analyze';
    wizardState.analysis = null;
    render();
    await new Promise(r => setTimeout(r, 150));
    return {
      select: Boolean(document.getElementById('wizardProviderSelect')),
      card: (document.querySelector('[data-wizard-provider]') || {}).dataset && document.querySelector('[data-wizard-provider]').dataset.wizardProvider,
      cloudButton: (() => { const b = document.querySelector('[data-wizard-action="analyze-cloud"]'); return b ? b.textContent : null; })(),
      cloudHint: (document.querySelector('[data-wizard-cloud-hint]') || {}).textContent || '',
      localNotice: (document.querySelector('[data-wizard-local-notice]') || {}).textContent || '',
      cloudTone: (() => { const b = document.querySelector('[data-wizard-action="analyze-cloud"]'); return b ? (b.getAttribute('class') || '') : ''; })()
    };
  })()`);
  check('one ready provider hides the picker', singleStep.select === false && single.picker.show === false);
  check('the card still names the provider in use', singleStep.card === 'local', singleStep.card);
  check('with no verified cloud provider there is no cloud button', singleStep.cloudButton === null, String(singleStep.cloudButton));
  check('the step offers the way to enable a cloud provider instead', /Cài đặt AI/.test(singleStep.cloudHint), singleStep.cloudHint.slice(0, 80));

  // 4. No provider → the banner + "Open AI Settings", and no request is made.
  const none = await cdp.evaluate(installHarness(providerView({ localRunning: false }), 'no-provider'));
  await cdp.evaluate(KEEP_PROVIDER_VIEW);
  // The page was given no usable provider above; what follows is about the render.
  const noneStep = await cdp.evaluate(`(async () => {
    if (typeof wizardReset === 'function') wizardReset();
    state.settings = JSON.parse(JSON.stringify(window.__providerView));
    window.__providerCalls.length = 0;
    wizardState.step = 'analyze';
    wizardState.analysis = null;
    wizardState.documentId = 'doc-provider-check';
    render();
    await new Promise(r => setTimeout(r, 150));
    const leaf = document.querySelector('[data-wizard-provider-empty="1"]');
    const empty = leaf ? leaf.closest('[data-wizard-provider]') : null;
    const openSettings = document.querySelector('[data-wizard-action="open-ai-settings"]');
    return { empty: Boolean(empty), found: Boolean(leaf), openSettings: Boolean(openSettings), text: empty ? empty.textContent : '', provider: state.settings.ai.provider };
  })()`);
  check('no ready provider shows the explanation banner', noneStep.empty === true && noneStep.empty === true, JSON.stringify(noneStep));
  check('the banner offers a direct way to Settings', noneStep.openSettings === true);
  check('the banner does not offer a configuration form', !/type="password"/.test(noneStep.text), 'no key field');

  const blocked = await cdp.evaluate(`(async () => {
    wizardSetError(new Error('[AI_NO_PROVIDER] Chưa có nhà cung cấp AI nào sẵn sàng.'));
    render();
    await new Promise(r => setTimeout(r, 300));
    const banner = document.getElementById('wizardError');
    return {
      code: banner ? banner.dataset.errorCode : '',
      text: banner ? banner.textContent : '',
      openSettings: Boolean(banner && banner.querySelector('[data-wizard-action="open-ai-settings"]')),
      openLocal: Boolean(banner && banner.querySelector('[data-wizard-action="open-ai"]')),
      actions: banner ? [...banner.querySelectorAll('[data-wizard-action]')].map(b => b.dataset.wizardAction).join(',') : ''
    };
  })()`);
  check('a missing provider is reported with the typed code AI_NO_PROVIDER', blocked.code === 'AI_NO_PROVIDER', `${blocked.code} / ${blocked.text.slice(0, 60)}`);
  check('the error banner links to AI Settings', blocked.openSettings === true);
  check('the error banner does not send the teacher to the local model window', blocked.openLocal === false, blocked.actions);
  check('the provider error does not fall back to a "no lesson section" message', !/cấu trúc tài liệu/.test(blocked.text), blocked.text.slice(0, 80));

  // 5. #180: how much of the lesson gets read is a property of the provider, and
  // the step says it — before the run (a budget line or none) and after it (what
  // the model really read). Pure render state here; no model is called.
  await cdp.evaluate(installHarness(providerView({ gemini: true })));
  await cdp.evaluate(KEEP_PROVIDER_VIEW);
  const readScope = await cdp.evaluate(`(async () => {
    if (typeof wizardReset === 'function') wizardReset();
    state.settings = JSON.parse(JSON.stringify(window.__providerView));
    navigate('create-wizard');
    wizardState.text = 'Nội dung bài học. '.repeat(1200);
    wizardState.documentId = 'doc-provider-check';
    wizardState.step = 'analyze';
    wizardState.analysis = null;
    wizardState.selectedProviderId = '';
    render();
    await new Promise(r => setTimeout(r, 150));
    const line = () => document.querySelector('[data-wizard-analyze-budget]');
    const localLine = line();
    const local = { kind: localLine ? localLine.dataset.wizardAnalyzeBudget : '', text: localLine ? localLine.textContent : '' };
    wizardState.selectedProviderId = 'gemini';
    render();
    await new Promise(r => setTimeout(r, 150));
    const fullLine = line();
    const cloud = { kind: fullLine ? fullLine.dataset.wizardAnalyzeBudget : '', text: fullLine ? fullLine.textContent : '' };
    // A lesson the local runtime can read whole gets no warning at all.
    wizardState.selectedProviderId = '';
    wizardState.text = 'Bài 1: Quang hợp ở thực vật.';
    render();
    await new Promise(r => setTimeout(r, 150));
    const nagged = Boolean(line());
    // Post-run: the sentence is built from what main measured, not from the UI's guess.
    wizardState.analysis = { id: 'a1', topic: 'Quang hợp', subject: 'Sinh học', grade: 8, objectives: [{ id: 'o1', description: 'Mô tả quang hợp', cognitiveLevel: 'understand' }], keyConcepts: [], uncertainties: [] };
    const readText = () => (document.querySelector('[data-wizard-analysis-sent]') || {}).textContent || '';
    wizardState.analysisSent = { provider: 'gemini', providerLabel: 'Gemini (Google)', documentChars: 43180, sentChars: 43180, pickedChars: 0, truncated: false, scoped: false, omittedSections: 0, budgetChars: null };
    render();
    await new Promise(r => setTimeout(r, 150));
    const cloudRead = readText();
    wizardState.analysisSent = { provider: 'local', providerLabel: 'AI local (llama.cpp)', documentChars: 43180, sentChars: 12000, pickedChars: 0, truncated: true, scoped: false, omittedSections: 0, budgetChars: 12000 };
    render();
    await new Promise(r => setTimeout(r, 150));
    const localRead = readText();
    wizardState.analysisSent = { provider: 'local', providerLabel: 'AI local (llama.cpp)', documentChars: 43180, sentChars: 4200, pickedChars: 5100, truncated: true, scoped: true, omittedSections: 3, budgetChars: 12000 };
    render();
    await new Promise(r => setTimeout(r, 150));
    return { local, cloud, nagged, cloudRead, localRead, scopedRead: readText() };
  })()`);
  check('#180: a local run states the budget it will cut to', readScope.local.kind === 'local' && /12\.000/.test(readScope.local.text), readScope.local.text.slice(0, 90));
  check('#180: a cloud run states that nothing is cut', readScope.cloud.kind === 'full' && /không cắt/i.test(readScope.cloud.text), readScope.cloud.text.slice(0, 90));
  check('#180: a lesson the local runtime can read whole is not warned about', readScope.nagged === false);
  check('#180: the reviewed panel reports the whole document a cloud model read', /toàn bộ 43\.180 ký tự/.test(readScope.cloudRead) && /không cắt/.test(readScope.cloudRead), readScope.cloudRead.slice(0, 120));
  check('#180: the reviewed panel reports what a local model could not read', /12\.000\/43\.180/.test(readScope.localRead), readScope.localRead.slice(0, 120));
  check('#180: a scoped run names the sections that did not fit', /3 mục không vừa hạn mức/.test(readScope.scopedRead), readScope.scopedRead.slice(0, 120));

  // Leave the page as it was found: the settings AI header reads state.settings.ai, so a
  // mock kept here makes ui-settings-sections-check fail on the next run against this
  // instance even though nothing in the app changed.
  const torn = await cdp.evaluate(TEARDOWN).catch(e => ({ error: String(e) }));
  check('the harness gives the page back its real settings', torn.wrapperGone === true && !torn.error,
    torn.error ? torn.error : JSON.stringify(torn));

  cdp.ws.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
})().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
