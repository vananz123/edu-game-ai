// tests/smoke65.js — P5 wizard failure/back paths (run with the app open on 9333).
//
//   node tests/smoke65.js runtime   app launched with EDUGAME_AI_TEST_DIR=tests/fixtures/wizard/fail-runtime
//   node tests/smoke65.js output    app launched with EDUGAME_AI_TEST_DIR=tests/fixtures/wizard/fail-output
//
// runtime: no model running -> AI_NOT_RUNNING banner, "Mở AI local" recovery,
//          retry stays available, back keeps the lesson text, draft keeps step.
// output:  analysis OK, recommendations return bad data -> AI_OUTPUT_INVALID,
//          friendly text (no raw [CODE]), teacher edit survives back+retry.
const mode = process.argv[2] || 'runtime';
if (mode !== 'runtime' && mode !== 'output') {
  console.error('usage: node tests/smoke65.js <runtime|output>');
  process.exit(2);
}
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
    const MODE = ${JSON.stringify(mode)};
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const waitFor = async (fn, ms) => { const started = Date.now(); const limit = ms || 8000; while (Date.now() - started < limit) { if (fn()) return true; await sleep(60); } return false; };
    window.__smokeErrors = [];
    window.addEventListener('error', event => window.__smokeErrors.push(String(event.message)));
    window.addEventListener('unhandledrejection', event => window.__smokeErrors.push(String(event.reason)));
    const out = { mode: MODE };
    const lessonText = 'Quang hợp là quá trình thực vật tổng hợp chất hữu cơ nhờ năng lượng ánh sáng. Diệp lục hấp thụ ánh sáng trong lục lạp. Cây thiếu ánh sáng sẽ vàng lá, chậm lớn và giảm năng suất.';

    // common: enter the wizard at step 1
    const navBtn = document.querySelector('.nav-item[data-page="create-wizard"]');
    if (navBtn) navBtn.click();
    await sleep(300);
    document.querySelector('#wizardRoot [data-wizard-action="new"]').click();
    await sleep(200);
    const textarea = document.getElementById('wizardDocText');
    textarea.value = lessonText;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    const nameInput = document.getElementById('wizardDocName');
    nameInput.value = 'smoke65-' + MODE + '.txt';
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('wizardNextBtn').click();
    await waitFor(() => wizardState.step === 'analyze' && !wizardState.busy);
    out.documentId = wizardState.documentId;
    out.projectId = wizardState.projectId;
    out.stepAfterInput = wizardState.step;

    if (MODE === 'runtime') {
      // T1 — analyze fails because no local model is running
      document.querySelector('[data-wizard-step-body="analyze"] [data-wizard-action="analyze"]').click();
      await waitFor(() => !!wizardState.error && !wizardState.busy);
      const banner = document.getElementById('wizardError');
      out.errorCode = banner && banner.dataset.errorCode;
      out.errorText = banner && banner.textContent;
      out.hasOpenAi = !!document.querySelector('#wizardError [data-wizard-action="open-ai"]');
      out.rawCodeLeaked = Boolean(banner && banner.textContent.includes('[AI_NOT_RUNNING]'));
      out.analysisStaysNull = wizardState.analysis === null;
      out.stepAfterFailure = wizardState.step;
      const retry = document.querySelector('[data-wizard-step-body="analyze"] [data-wizard-action="analyze"]');
      out.retryAvailable = !!retry && !retry.disabled;

      // T2 — "Mở AI local" opens the runtime window and closes
      document.querySelector('#wizardError [data-wizard-action="open-ai"]').click();
      await sleep(350);
      const modal = document.getElementById('modalRoot');
      out.modalOpened = !!modal && /llama\\.cpp/.test(modal.textContent || '');
      out.modalStartBtn = !!document.getElementById('startLocalRuntimeBtn');
      const closeBtn = modal && modal.querySelector('[data-close]');
      if (closeBtn) closeBtn.click();
      await sleep(120);
      out.modalClosed = document.getElementById('modalRoot').innerHTML === '';

      // T3 — back to input keeps the lesson text and clears the error
      document.querySelector('[data-wizard-step-body="analyze"] [data-wizard-action="back"]').click();
      await sleep(250);
      out.stepAfterBack = wizardState.step;
      out.textAfterBack = (document.getElementById('wizardDocText') || {}).value || '';
      out.errorAfterBack = wizardState.error;

      // T4 — retry, then dismiss the banner
      document.getElementById('wizardNextBtn').click();
      await waitFor(() => wizardState.step === 'analyze' && !wizardState.busy);
      document.querySelector('[data-wizard-step-body="analyze"] [data-wizard-action="analyze"]').click();
      await waitFor(() => !!wizardState.error && !wizardState.busy);
      out.retryFailedAgain = wizardState.error && wizardState.error.code;
      const dismiss = document.querySelector('#wizardError [data-wizard-action="dismiss-error"]');
      out.dismissAvailable = !!dismiss;
      if (dismiss) dismiss.click();
      await sleep(150);
      out.bannerAfterDismiss = !!document.getElementById('wizardError');

      // T5 — draft kept at the analyze step and reopening does not resurrect the error
      const stored = await window.eduGame.getProject(out.projectId);
      out.storedStep = stored && stored.step;
      out.sidebarEntry = !!document.querySelector('[data-wizard-open="' + out.projectId + '"]');
      wizardReset();
      await wizardOpenProject(out.projectId);
      render();
      await sleep(200);
      out.reopenedStep = wizardState.step;
      out.reopenedText = (wizardState.text || '').length;
      out.reopenedBanner = !!document.getElementById('wizardError');
    }

    if (MODE === 'output') {
      // T1 — analysis succeeds (fixture), teacher edits, advances
      document.querySelector('[data-wizard-step-body="analyze"] [data-wizard-action="analyze"]').click();
      await waitFor(() => !!wizardState.analysis && !wizardState.busy);
      out.analysisId = wizardState.analysisId;
      out.analysisTopic = wizardState.analysis && wizardState.analysis.topic;
      const objective = document.querySelector('[data-wizard-objective="0"][data-field="description"]');
      out.editedObjective = 'Mục tiêu đã sửa (smoke65)';
      objective.value = out.editedObjective;
      objective.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('[data-wizard-step-body="analyze"] [data-wizard-action="next"]').click();
      await waitFor(() => wizardState.step === 'recommend' && !wizardState.busy);
      out.stepAfterAnalysis = wizardState.step;
      const saved = out.analysisId ? await window.eduGame.getLessonAnalysis(out.analysisId) : null;
      out.savedObjective = saved && saved.objectives[0] && saved.objectives[0].description;

      // T2 — recommendations fail with a bad-output error
      document.querySelector('[data-wizard-step-body="recommend"] [data-wizard-action="recommend"]').click();
      await waitFor(() => !!wizardState.error && !wizardState.busy);
      const banner = document.getElementById('wizardError');
      out.errorCode = banner && banner.dataset.errorCode;
      out.errorText = banner && banner.textContent;
      out.rawCodeLeaked = Boolean(banner && banner.textContent.includes('AI_OUTPUT_INVALID'));
      out.friendlyText = Boolean(banner && banner.textContent.includes('chưa đúng cấu trúc'));
      out.hasOpenAi = !!document.querySelector('#wizardError [data-wizard-action="open-ai"]');
      out.recommendationCount = wizardState.recommendations.length;
      out.stepAfterFailure = wizardState.step;
      const retry = document.querySelector('[data-wizard-step-body="recommend"] [data-wizard-action="recommend"]');
      out.retryAvailable = !!retry && !retry.disabled;

      // T3 — back preserves the edited analysis
      document.querySelector('[data-wizard-step-body="recommend"] [data-wizard-action="back"]').click();
      await sleep(250);
      out.stepAfterBack = wizardState.step;
      const backObjective = document.querySelector('[data-wizard-objective="0"][data-field="description"]');
      out.objectiveAfterBack = backObjective && backObjective.value;

      // T4 — retry is repeatable with the same typed error
      document.querySelector('[data-wizard-step-body="analyze"] [data-wizard-action="next"]').click();
      await waitFor(() => wizardState.step === 'recommend' && !wizardState.busy);
      document.querySelector('[data-wizard-step-body="recommend"] [data-wizard-action="recommend"]').click();
      await waitFor(() => !!wizardState.error && !wizardState.busy);
      out.retryCode = wizardState.error && wizardState.error.code;
      out.recommendationCountAfterRetry = wizardState.recommendations.length;

      // T5 — the project is still at recommend and points at the edited analysis
      const stored = await window.eduGame.getProject(out.projectId);
      out.storedStep = stored && stored.step;
      out.storedAnalysisId = stored && stored.analysisId;
    }

    out.rendererErrors = window.__smokeErrors.slice();
    if (out.projectId) await window.eduGame.deleteProject(out.projectId);
    out.projectGone = out.projectId ? !(await window.eduGame.listProjects()).some(item => item.id === out.projectId) : false;
    wizardReset();
    render();
    return out;
  })()`);

  const results = [];
  const push = (label, ok, extra = '') => results.push([label, !!ok, String(extra)]);
  push('setup: step 1 saved the lesson + project', run.stepAfterInput === 'analyze' && !!run.projectId, run.stepAfterInput);
  if (mode === 'runtime') {
    push('T1 failure surfaces AI_NOT_RUNNING', run.errorCode === 'AI_NOT_RUNNING', run.errorCode);
    push('T1 banner explains the AI local runtime', /AI local chưa chạy/.test(run.errorText || ''), '');
    push('T1 raw [CODE] marker is not shown to the teacher', run.rawCodeLeaked === false);
    push('T1 offers "Mở AI local" recovery', run.hasOpenAi === true);
    push('T1 retry stays available', run.retryAvailable === true);
    push('T1 no analysis is fabricated', run.analysisStaysNull === true && run.stepAfterFailure === 'analyze');
    push('T2 AI local window opens with the runtime controls', run.modalOpened === true && run.modalStartBtn === true);
    push('T2 AI local window closes', run.modalClosed === true);
    push('T3 back returns to input with the lesson text intact', run.stepAfterBack === 'input' && run.textAfterBack.length > 100, 'len=' + run.textAfterBack.length);
    push('T3 back clears the error', run.errorAfterBack === null);
    push('T4 retry fails the same typed way (no duplicate-request error)', run.retryFailedAgain === 'AI_NOT_RUNNING', run.retryFailedAgain);
    push('T4 dismiss hides the banner', run.dismissAvailable === true && run.bannerAfterDismiss === false);
    push('T5 draft stays at the analyze step', run.storedStep === 'analyze', run.storedStep);
    push('T5 sidebar lists the draft', run.sidebarEntry === true);
    push('T5 reopen restores text and shows no stale error', run.reopenedStep === 'analyze' && run.reopenedText > 100 && run.reopenedBanner === false, 'len=' + run.reopenedText);
  } else {
    push('T1 analysis succeeds before the failure', typeof run.analysisId === 'string' && run.analysisTopic === 'Quang hợp ở thực vật', run.analysisTopic);
    push('T1 teacher edit persisted without AI', run.savedObjective === run.editedObjective, run.savedObjective);
    push('T1 analyze advances to recommend', run.stepAfterAnalysis === 'recommend');
    push('T2 recommend surfaces AI_OUTPUT_INVALID', run.errorCode === 'AI_OUTPUT_INVALID', run.errorCode);
    push('T2 friendly message (no raw [CODE])', run.friendlyText === true && run.rawCodeLeaked === false);
    push('T2 bad-output errors do not suggest opening AI local', run.hasOpenAi === false);
    push('T2 retry stays available', run.retryAvailable === true);
    push('T2 no recommendations are stored on failure', run.recommendationCount === 0 && run.stepAfterFailure === 'recommend');
    push('T3 back to analyze preserves the edited objective', run.stepAfterBack === 'analyze' && run.objectiveAfterBack === run.editedObjective, run.objectiveAfterBack);
    push('T4 retry reproduces the same typed failure', run.retryCode === 'AI_OUTPUT_INVALID' && run.recommendationCountAfterRetry === 0, run.retryCode);
    push('T5 project stays at recommend and keeps the edited analysis', run.storedStep === 'recommend' && run.storedAnalysisId === run.analysisId, run.storedStep);
  }
  push('cleanup removes the project', run.projectGone === true);
  push('no uncaught renderer errors', run.rendererErrors.length === 0, (run.rendererErrors || []).join(' | '));

  const pass = results.filter(r => r[1]).length;
  for (const [label, ok, extra] of results) console.log(`${ok ? 'PASS' : 'FAIL'} | ${label}  ${extra || ''}`);
  console.log(`\nSmoke65 (${mode}): ${pass}/${results.length} passed`);
  ws.close();
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
