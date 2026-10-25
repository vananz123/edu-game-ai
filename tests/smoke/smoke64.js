// tests/smoke/smoke64.js — P5 wizard happy path (run with the app open on port 9333).
// Requires the app to be launched with EDUGAME_AI_TEST_DIR pointing at
// tests/fixtures/wizard/happy. The analyze *model* response is a fixture (no
// local model on this machine), but everything else is real: IPC -> lesson
// store -> project row -> resume. Genre suggestions are rule-based since O1, so
// they come from the lesson content (no model, no fixture). Content generation is
// covered separately by tests/smoke/smoke66.js (P6), which runs against a real local model.
//
// T1  nav entry + wizard shell (5 steps, input active)
// T2  short text keeps "next" disabled
// T3  step 1 saves the lesson document + creates the project
// T4  analyze stores an editable analysis (3 objectives rendered)
// T5  teacher edit is persisted without re-running AI
// T6  recommend returns 2-3 suggestions with unique ids (rule-based, no model)
// T7  selecting a card (or another genre) seeds a type-specific config
// T8  configured project passes main-side validation and saves at step "generate"
// T9  the draft reopens from the store (AI is NOT called again)
// T10 saved-drafts sidebar lists the project
// T11 no uncaught renderer errors
const sleep = ms => new Promise(r => setTimeout(r, ms));
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
    const waitFor = async (fn, ms) => { const started = Date.now(); const limit = ms || 8000; while (Date.now() - started < limit) { if (fn()) return true; await sleep(60); } return false; };
    window.__smokeErrors = [];
    window.addEventListener('error', event => window.__smokeErrors.push(String(event.message)));
    window.addEventListener('unhandledrejection', event => window.__smokeErrors.push(String(event.reason)));
    const out = {};

    // T1 — nav entry + shell
    const navBtn = document.querySelector('.nav-item[data-page="create-wizard"]');
    out.navExists = !!navBtn;
    if (navBtn) navBtn.click();
    await sleep(350);
    out.page = state.page;
    out.steps = document.querySelectorAll('.wizard-step').length;
    out.activeStep = document.querySelector('.wizard-step[data-status="active"]')?.dataset.step || null;
    out.bodyStep = document.querySelector('[data-wizard-step-body]')?.dataset.wizardStepBody || null;

    // T2 — short text keeps next disabled
    const newBtn = document.querySelector('[data-wizard-action="new"]');
    if (newBtn) newBtn.click();
    await sleep(200);
    const textarea = document.getElementById('wizardDocText');
    textarea.value = 'quá ngắn';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    out.shortDisabled = document.getElementById('wizardNextBtn').disabled;

    // T3 — step 1
    const lessonText = 'Quang hợp là quá trình thực vật tổng hợp chất hữu cơ nhờ năng lượng ánh sáng mặt trời, sử dụng diệp lục trong lục lạp. Quá trình này tạo ra oxy và giải phóng năng lượng khi hô hấp. Cây thiếu ánh sáng sẽ vàng lá và chậm phát triển.';
    textarea.value = lessonText;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    const nameInput = document.getElementById('wizardDocName');
    nameInput.value = 'smoke64-quang-hop.txt';
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    out.longEnabled = !document.getElementById('wizardNextBtn').disabled;
    document.getElementById('wizardNextBtn').click();
    await waitFor(() => wizardState.step === 'analyze' && !wizardState.busy);
    out.stepAfterInput = wizardState.step;
    out.documentId = wizardState.documentId;
    out.projectId = wizardState.projectId;
    out.inputError = wizardState.error && wizardState.error.code;
    const doc = out.documentId ? await window.eduGame.getLessonDocument(out.documentId) : null;
    out.docTextOk = !!doc && doc.text === lessonText;
    out.docName = doc && doc.name;

    // T4 — analyze (fixture)
    const analyzeBtn = document.querySelector('[data-wizard-action="analyze"]');
    out.analyzeButton = !!analyzeBtn;
    if (analyzeBtn) analyzeBtn.click();
    await waitFor(() => !!wizardState.analysis && !wizardState.busy);
    out.analysisId = wizardState.analysisId;
    out.analysisTopic = wizardState.analysis && wizardState.analysis.topic;
    out.analysisError = wizardState.error && wizardState.error.code;
    out.objectiveRows = document.querySelectorAll('[data-wizard-objective-row]').length;
    out.conceptRows = document.querySelectorAll('[data-wizard-concept-row]').length;
    out.topicInput = document.getElementById('wizardTopic')?.value || null;

    // T5 — edit the analysis, persist, advance
    const topicInput = document.getElementById('wizardTopic');
    if (topicInput) {
      topicInput.value = 'Quang hợp (giáo viên sửa)';
      topicInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    document.querySelector('[data-wizard-step-body="analyze"] [data-wizard-action="next"]').click();
    await waitFor(() => wizardState.step === 'recommend' && !wizardState.busy);
    out.stepAfterAnalysis = wizardState.step;
    const savedAnalysis = out.analysisId ? await window.eduGame.getLessonAnalysis(out.analysisId) : null;
    out.savedTopic = savedAnalysis && savedAnalysis.topic;

    // T6 — recommend (rule-based since O1: instant, no model call)
    out.recommendButton = !!document.querySelector('[data-wizard-action="recommend"]');
    document.querySelector('[data-wizard-action="recommend"]').click();
    await waitFor(() => wizardState.recommendations.length > 0 && !wizardState.busy);
    out.recommendationCount = wizardState.recommendations.length;
    out.recommendationTypes = wizardState.recommendations.map(item => item.gameType);
    out.recommendationIdsUnique = new Set(wizardState.recommendations.map(item => item.id)).size === wizardState.recommendations.length;
    out.recommendationCards = document.querySelectorAll('[data-wizard-recommendation]').length;
    // Genres that were not suggested are still offered as chips (spec: the teacher
    // must always be able to choose any of the five genres).
    out.otherTypeChips = document.querySelectorAll('[data-wizard-action="select-type"]').length;
    out.recommendationError = wizardState.error && wizardState.error.code;

    // T7 — select the first suggestion (its type depends on the lesson content)
    const GAME_TYPE_COUNT_FIELD = { arena: 'questionCount', scenario: 'situationCount', matching: 'pairCount', treasure: 'stageCount', race: 'maxRounds' };
    const firstCard = document.querySelector('[data-wizard-recommendation]');
    out.firstCardType = firstCard && firstCard.getAttribute('data-game-type');
    if (firstCard) firstCard.querySelector('[data-wizard-action="select"]').click();
    await sleep(250);
    out.selectedType = wizardState.selectedGameType;
    out.configType = wizardState.config && wizardState.config.gameType;
    out.countKey = GAME_TYPE_COUNT_FIELD[out.configType] || 'questionCount';
    out.seededQuestionCount = wizardState.config && wizardState.config[out.countKey];
    out.nextEnabledAfterSelect = !document.getElementById('wizardNextBtn').disabled;
    document.querySelector('[data-wizard-step-body="recommend"] [data-wizard-action="next"]').click();
    await waitFor(() => wizardState.step === 'configure' && !wizardState.busy);
    out.stepAfterRecommend = wizardState.step;
    out.configFieldsRendered = document.querySelectorAll('[data-wizard-config]').length;
    out.configError = wizardState.error && wizardState.error.code;

    // T8 — edit config, save (main-side zod validation runs here)
    const titleField = document.querySelector('[data-wizard-config="title"]');
    if (titleField) titleField.value = 'Trò chơi quang hợp (bản smoke)';
    out.countEdited = false;
    const countField = document.querySelector('[data-wizard-config="' + out.countKey + '"]');
    if (countField) {
      countField.value = '6';
      countField.dispatchEvent(new Event('input', { bubbles: true }));
      out.countEdited = true;
    }
    document.querySelector('[data-wizard-step-body="configure"] [data-wizard-action="next"]').click();
    await waitFor(() => wizardState.step === 'generate' && !wizardState.busy);
    out.stepAfterConfigure = wizardState.step;
    out.configureError = wizardState.error && wizardState.error.code;
    const stored = out.projectId ? await window.eduGame.getProject(out.projectId) : null;
    out.storedStep = stored && stored.step;
    out.storedStatus = stored && stored.status;
    out.storedTitle = stored && stored.config && stored.config.title;
    out.storedQuestionCount = stored && stored.config && stored.config[out.countKey];
    out.storedRecommendationId = stored && stored.recommendationId;
    out.storedAnalysisId = stored && stored.analysisId;
    out.storedLessonDoc = stored && stored.lesson && stored.lesson.documentId;
    out.generatePlaceholder = !!document.getElementById('wizardGenerateBtn');
    out.generateDisabled = document.getElementById('wizardGenerateBtn') ? document.getElementById('wizardGenerateBtn').disabled : null;

    // T9 — reopen the draft without AI
    const beforeResume = JSON.stringify(wizardState.recommendations.map(item => item.id));
    wizardReset();
    await wizardOpenProject(out.projectId);
    out.resumedStep = wizardState.step;
    out.resumedTopic = wizardState.analysis && wizardState.analysis.topic;
    out.resumedRecommendations = wizardState.recommendations.length;
    out.resumedRecommendationIdsMatch = JSON.stringify(wizardState.recommendations.map(item => item.id)) === beforeResume;
    out.resumedQuestionCount = wizardState.config && wizardState.config[out.countKey];
    out.resumedTitle = wizardState.config && wizardState.config.title;
    out.resumedTextLength = (wizardState.text || '').length;
    out.resumedType = wizardState.selectedGameType;
    render();
    await sleep(150);
    out.resumedBody = document.querySelector('[data-wizard-step-body]')?.dataset.wizardStepBody || null;

    // T10 — sidebar lists the saved draft
    out.sidebarEntry = !!document.querySelector('[data-wizard-open="' + out.projectId + '"]');

    // T11 — cleanup + renderer errors
    out.rendererErrors = window.__smokeErrors.slice();
    await window.eduGame.deleteProject(out.projectId);
    wizardReset();
    wizardState.projectsLoaded = false;
    await wizardRefreshProjects();
    out.remainingWithId = wizardState.projects.some(item => item.id === out.projectId);
    out.remainingInDb = (await window.eduGame.listProjects()).some(item => item.id === out.projectId);
    render();
    return out;
  })()`);

  const results = [];
  const push = (label, ok, extra = '') => results.push([label, !!ok, String(extra)]);
  push('T1 nav item exists', run.navExists);
  push('T1 navigates to create-wizard', run.page === 'create-wizard', run.page);
  push('T1 five wizard steps rendered', run.steps === 5, 'steps=' + run.steps);
  push('T1 input step active on entry', run.activeStep === 'input' && run.bodyStep === 'input', run.activeStep + '/' + run.bodyStep);
  push('T2 short lesson keeps next disabled', run.shortDisabled === true);
  push('T2 long lesson enables next', run.longEnabled === true);
  push('T3 step 1 lands on analyze', run.stepAfterInput === 'analyze' && !run.inputError, run.stepAfterInput + ' err=' + run.inputError);
  push('T3 lesson document stored with full text', run.docTextOk === true && run.docName === 'smoke64-quang-hop.txt', run.docName);
  push('T3 project id created', typeof run.projectId === 'string' && run.projectId.startsWith('project_'), run.projectId);
  push('T4 analyze button shown before running', run.analyzeButton === true);
  push('T4 analysis stored via fixture', typeof run.analysisId === 'string' && !run.analysisError, 'err=' + run.analysisError);
  push('T4 analysis topic rendered', run.analysisTopic === 'Quang hợp ở thực vật' && run.topicInput === 'Quang hợp ở thực vật', run.topicInput);
  push('T4 three objectives + two concepts rendered', run.objectiveRows === 3 && run.conceptRows === 2, run.objectiveRows + '/' + run.conceptRows);
  push('T5 teacher edit persists without AI', run.savedTopic === 'Quang hợp (giáo viên sửa)', run.savedTopic);
  push('T5 analyze step advances to recommend', run.stepAfterAnalysis === 'recommend');
  push('T6 recommendations requested', run.recommendButton === true);
  push('T6 two or three recommendations returned', run.recommendationCount >= 2 && run.recommendationCount <= 3, 'n=' + run.recommendationCount + ' types=' + (run.recommendationTypes || []).join(','));
  push('T6 recommendation ids are unique', run.recommendationIdsUnique === true);
  push('T6 recommendation cards rendered', run.recommendationCards === run.recommendationCount, run.recommendationCards + '/' + run.recommendationCount);
  push('T6 rule-based suggestions need no model', !run.recommendationError, 'err=' + run.recommendationError);
  push('T7 other genres still offered', run.otherTypeChips === 5 - run.recommendationCount, 'chips=' + run.otherTypeChips + ' suggested=' + run.recommendationCount);
  push('T7 selecting the first card seeds its config', run.selectedType === run.firstCardType && run.configType === run.firstCardType, run.selectedType);
  const countInRange = typeof run.seededQuestionCount === 'number' && run.seededQuestionCount >= 3 && run.seededQuestionCount <= 30;
  push('T7 suggested item count is sane (' + run.countKey + ')', countInRange, run.countKey + '=' + run.seededQuestionCount);
  push('T7 next enabled after selecting', run.nextEnabledAfterSelect === true);
  push('T7 recommend step advances to configure', run.stepAfterRecommend === 'configure', 'err=' + run.configError);
  push('T7 type-specific config fields rendered', run.configFieldsRendered >= 8, 'fields=' + run.configFieldsRendered);
  push('T8 config passes main-side validation', run.stepAfterConfigure === 'generate' && !run.configureError, 'err=' + run.configureError);
  push('T8 project saved at generate/review', run.storedStep === 'generate' && run.storedStatus === 'review', run.storedStep + '/' + run.storedStatus);
  const storedCountOk = run.countEdited ? run.storedQuestionCount === 6 : typeof run.storedQuestionCount === 'number';
  push('T8 edited title + item count persisted', run.storedTitle === 'Trò chơi quang hợp (bản smoke)' && storedCountOk, run.storedTitle + ' ' + run.countKey + '=' + run.storedQuestionCount);
  push('T8 project links recommendation + analysis + lesson', !!run.storedRecommendationId && run.storedAnalysisId === run.analysisId && run.storedLessonDoc === run.documentId);
  push('T8 generate step shows the real P6 action', run.generatePlaceholder === true && run.generateDisabled === false, 'enabled=' + !run.generateDisabled);
  push('T9 draft reopens at generate', run.resumedStep === 'generate' && run.resumedBody === 'generate');
  push('T9 edited analysis survives reopen', run.resumedTopic === 'Quang hợp (giáo viên sửa)', run.resumedTopic);
  push('T9 recommendations restored without AI', run.resumedRecommendations === run.recommendationCount && run.resumedRecommendationIdsMatch === true, 'n=' + run.resumedRecommendations);
  const resumedCountOk = run.countEdited ? run.resumedQuestionCount === 6 : typeof run.resumedQuestionCount === 'number';
  push('T9 config + lesson text restored', resumedCountOk && run.resumedTitle === 'Trò chơi quang hợp (bản smoke)' && run.resumedTextLength > 100, run.countKey + '=' + run.resumedQuestionCount + ' len=' + run.resumedTextLength);
  push('T9 selected game type restored', run.resumedType === run.selectedType, run.resumedType);
  push('T10 saved-drafts sidebar lists the project', run.sidebarEntry === true);
  push('T10 cleanup removes the project', run.remainingWithId === false && run.remainingInDb === false);
  push('T11 no uncaught renderer errors', run.rendererErrors.length === 0, (run.rendererErrors || []).join(' | '));

  const pass = results.filter(r => r[1]).length;
  for (const [label, ok, extra] of results) console.log(`${ok ? 'PASS' : 'FAIL'} | ${label}  ${extra || ''}`);
  console.log(`\nSmoke64 (wizard happy path): ${pass}/${results.length} passed`);
  ws.close();
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
