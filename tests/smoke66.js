// tests/smoke66.js — P6: generate the game content and hand it to the editor.
//
// Two modes:
//   node tests/smoke66.js real      (default) the app runs a REAL local llama.cpp
//                                   model; nothing is faked — this is the P6 gate.
//   node tests/smoke66.js fixture   the app is started with
//                                   EDUGAME_AI_TEST_DIR=tests/fixtures/wizard/happy
//                                   so the model answer is canned but every other
//                                   layer (IPC, store, adapter, validators, editor,
//                                   library save) is real.
//
// T1  wizard entry → step 1 → analyze → recommend (real or fixture model)
// T2  select + configure arena, save at step generate
// T3  "generate" is enabled now (P6 supersedes the P5 placeholder)
// T4  generate returns a validated snapshot with real content
// T5  the adapter shape is coherent (unique ids, correct answer inside options)
// T6  the project is persisted at step "edit" / status "ready" with the snapshot
// T7  the editor opens with the generated content
// T8  saving from the editor puts the game in the library (playable offline)
// T9  reopening the project restores the snapshot WITHOUT calling AI again
// T10 cleanup + no uncaught renderer errors
//
// The driver polls `window.__smokePhase` while the (long, CPU-bound) model legs run
// so a stalled or dead app is visible instead of silent.
const mode = process.argv[2] === 'fixture' ? 'fixture' : 'real';
// Real CPU inference on a 2B model is slow: allow minutes, not seconds.
const ANALYZE_MS = mode === 'fixture' ? 20000 : 900000;
const GENERATE_MS = mode === 'fixture' ? 20000 : 1800000;
const TOTAL_MS = ANALYZE_MS * 2 + GENERATE_MS + 120000;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function withTimeout(promise, ms, label) {
  let timer;
  const guard = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms); });
  try { return await Promise.race([promise, guard]); } finally { clearTimeout(timer); }
}

(async () => {
  const res = await fetch('http://127.0.0.1:9333/json/list');
  const target = (await res.json()).find(x => x.type === 'page' && /index\.html/.test(x.url));
  if (!target) throw new Error('no CDP target');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let socketClosed = false;
  ws.addEventListener('close', () => { socketClosed = true; });
  await new Promise((r, j) => { ws.addEventListener('open', r, { once: true }); ws.addEventListener('error', j, { once: true }); });
  let seq = 0; const pending = new Map();
  ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
  const send = (method, params = {}) => new Promise(r => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  const evalv = async expression => {
    const r = await send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression });
    if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  };
  const readPhase = async () => {
    if (socketClosed) return null;
    try {
      const value = await withTimeout(
        evalv('(function(){ try { return window.__smokePhase || null; } catch (e) { return null; } })()').catch(() => null),
        15000, 'phase poll');
      return value;
    } catch (error) {
      console.log(`  !! phase poll failed: ${error.message}`);
      return null;
    }
  };

  console.log(`smoke66 mode=${mode} (analyze<=${ANALYZE_MS / 1000}s, generate<=${GENERATE_MS / 1000}s)`);

  const script = `(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const waitFor = async (fn, ms) => { const started = Date.now(); const limit = ms || 8000; while (Date.now() - started < limit) { if (fn()) return true; await sleep(150); } return false; };
    window.__smokeErrors = [];
    window.addEventListener('error', event => window.__smokeErrors.push(String(event.message)));
    window.addEventListener('unhandledrejection', event => window.__smokeErrors.push(String(event.reason)));
    const started = Date.now();
    const phases = [];
    const setPhase = label => { window.__smokePhase = label + ' (' + Math.round((Date.now() - started) / 1000) + 's)'; phases.push(window.__smokePhase); };
    setPhase('start');
    const out = { mode: ${JSON.stringify(mode)}, phases };

    // T1 — wizard: input → analyze → recommend
    setPhase('open wizard');
    document.querySelector('.nav-item[data-page="create-wizard"]').click();
    await sleep(300);
    document.querySelector('[data-wizard-action="new"]').click();
    await sleep(200);
    const textarea = document.getElementById('wizardDocText');
    textarea.value = 'Quang hợp là quá trình thực vật tổng hợp chất hữu cơ nhờ năng lượng ánh sáng mặt trời, sử dụng diệp lục trong lục lạp. Quá trình này tạo ra oxy và thải oxy ra môi trường, đồng thời tích lũy chất hữu cơ nuôi cây. Cây thiếu ánh sáng sẽ vàng lá và chậm phát triển vì quang hợp giảm mạnh.';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('wizardDocName').value = 'smoke66-quang-hop.txt';
    document.getElementById('wizardDocName').dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('wizardNextBtn').click();
    await waitFor(() => wizardState.step === 'analyze' && !wizardState.busy);
    out.projectId = wizardState.projectId;
    out.documentId = wizardState.documentId;

    setPhase('save lesson + analyze (model)');
    out.analyzeStarted = !!document.querySelector('[data-wizard-step-body="analyze"] [data-wizard-action="analyze"]');
    document.querySelector('[data-wizard-step-body="analyze"] [data-wizard-action="analyze"]').click();
    out.analyzeOk = await waitFor(() => Boolean(wizardState.analysis) && !wizardState.busy, ${ANALYZE_MS});
    out.analyzeError = wizardState.error && wizardState.error.code;
    out.analysisId = wizardState.analysisId;
    out.analysisTopic = wizardState.analysis && wizardState.analysis.topic;
    out.analysisObjectives = wizardState.analysis ? wizardState.analysis.objectives.length : 0;

    setPhase('recommend (rules)');
    document.querySelector('[data-wizard-step-body="analyze"] [data-wizard-action="next"]').click();
    await waitFor(() => wizardState.step === 'recommend' && !wizardState.busy);
    document.querySelector('[data-wizard-action="recommend"]').click();
    out.recommendOk = await waitFor(() => wizardState.recommendations.length > 0 && !wizardState.busy, ${ANALYZE_MS});
    out.recommendError = wizardState.error && wizardState.error.code;
    out.recommendationTypes = wizardState.recommendations.map(item => item.gameType);

    // T2 — select a recommendation (the real model may not suggest arena) + configure
    setPhase('select + configure');
    const cards = [...document.querySelectorAll('[data-wizard-recommendation]')];
    out.recommendationCardCount = cards.length;
    const pickCard = cards.find(card => card.dataset.gameType === 'arena') || cards[0];
    out.pickedType = pickCard ? pickCard.dataset.gameType : null;
    if (pickCard) pickCard.querySelector('[data-wizard-action="select"]').click();
    await sleep(250);
    document.querySelector('[data-wizard-step-body="recommend"] [data-wizard-action="next"]').click();
    await waitFor(() => wizardState.step === 'configure' && !wizardState.busy);
    out.configType = wizardState.config && wizardState.config.gameType;
    const TEMPLATE_BY_TYPE = { arena: 'quiz', scenario: 'scenario', matching: 'matching', treasure: 'treasure-hunt', race: 'race' };
    out.expectedTemplate = TEMPLATE_BY_TYPE[out.configType] || null;
    const titleField = document.querySelector('[data-wizard-config="title"]');
    if (titleField) { titleField.value = 'smoke66 · Trò chơi từ giáo án'; titleField.dispatchEvent(new Event('input', { bubbles: true })); }
    const countField = document.querySelector('[data-wizard-config="questionCount"]');
    if (countField) { countField.value = '4'; countField.dispatchEvent(new Event('input', { bubbles: true })); }
    // Small models run out of tokens fast: ask for the smallest sensible amount so
    // a CPU-only 2B model can finish the JSON inside the 300 s request budget.
    const minCount = { arena: ['questionCount', '3'], scenario: ['situationCount', '2'], matching: ['pairCount', '3'], treasure: ['stageCount', '2'] }[out.configType];
    if (minCount) {
      const field = document.querySelector('[data-wizard-config="' + minCount[0] + '"]');
      if (field) { field.value = minCount[1]; field.dispatchEvent(new Event('input', { bubbles: true })); }
    }
    document.querySelector('[data-wizard-step-body="configure"] [data-wizard-action="next"]').click();
    out.configureOk = await waitFor(() => wizardState.step === 'generate' && !wizardState.busy, 15000);
    out.configureError = wizardState.error && wizardState.error.code;
    out.storedConfigTitle = (await window.eduGame.getProject(out.projectId)).config?.title;

    // T3 — the generate button is live in P6
    const generateBtn = document.getElementById('wizardGenerateBtn');
    out.generateButton = !!generateBtn;
    out.generateEnabled = generateBtn ? !generateBtn.disabled : null;

    // T4 — run the real (or canned) generation
    setPhase('generate (model)');
    if (generateBtn) generateBtn.click();
    out.generateOk = await waitFor(() => Boolean(wizardState.gameSnapshot) && !wizardState.busy, ${GENERATE_MS});
    out.generateError = wizardState.error && wizardState.error.code;
    const game = wizardState.gameSnapshot;
    out.gameId = game && game.id;
    out.template = game && game.template;
    out.gameTitle = game && game.title;
    out.questionCount = game ? (game.questions || []).length : 0;
    out.stepAfterGenerate = wizardState.step;

    // T5 — adapter coherence (type-aware: not every type uses the questions list)
    setPhase('check adapter output');
    if (game) {
      const questions = game.questions || [];
      const matching = game.matchingGame || {};
      const treasure = game.treasureHunt || {};
      const race = game.race || {};
      out.idsUnique = new Set(questions.map(q => q.id)).size === questions.length;
      out.correctInsideOptions = questions.every(q => (q.options || []).some(o => o.id === q.correctOptionId));
      out.allPrompts = questions.every(q => typeof q.prompt === 'string' && q.prompt.trim().length > 0);
      out.allExplain = questions.every(q => typeof q.explanation === 'string' && q.explanation.trim().length > 0);
      out.totalPoints = questions.reduce((sum, q) => sum + (Number(q.points) || 0), 0);
      out.bodyIsGenerate = document.querySelector('[data-wizard-step-body]')?.dataset.wizardStepBody || null;
      if (game.template === 'matching') {
        out.contentCount = (matching.pairs || []).length;
        out.coherent = (matching.pairs || []).length >= 2 && (matching.pairs || []).every(p => p.left && p.right);
      } else if (game.template === 'treasure-hunt') {
        const stages = treasure.stages || [];
        out.contentCount = stages.length;
        out.coherent = stages.length >= 2 && stages.every(s => {
          const q = s.question || {};
          return (q.options || []).length >= 2 && (q.options || []).some(o => o.id === q.correctOptionId);
        });
      } else if (game.template === 'race') {
        out.contentCount = (race.questions || []).length;
        out.coherent = (race.teams || []).length >= 2 && Number(race.trackLength) >= 3 &&
          (race.questions || []).every(q => (q.options || []).some(o => o.id === q.correctOptionId));
      } else {
        out.contentCount = questions.length;
        out.coherent = questions.length >= 1 && out.idsUnique && out.correctInsideOptions && out.allPrompts;
        if (game.template === 'scenario') out.coherent = out.coherent && questions.every(q => (q.options || []).length >= 2);
      }
    }

    // T6 — persisted project
    setPhase('check stored project');
    const stored = out.projectId ? await window.eduGame.getProject(out.projectId) : null;
    out.storedStep = stored && stored.step;
    out.storedStatus = stored && stored.status;
    out.storedGameId = stored && stored.gameId;
    out.storedSnapshotTemplate = stored && stored.gameSnapshot && stored.gameSnapshot.template;
    out.storedDraftType = stored && stored.draft && stored.draft.gameType;

    // T7 — open the editor with the generated content
    setPhase('open editor');
    document.querySelector('[data-wizard-action="open-editor"]').click();
    await sleep(400);
    const modal = document.querySelector('#modalRoot .modal');
    out.editorOpened = !!modal;
    out.editorTitle = document.getElementById('editTitle') ? document.getElementById('editTitle').value : null;
    out.editorQuestions = document.querySelectorAll('#editorQuestions > .editor-question').length;
    const panelId = { matching: 'matchingEditor', treasure: 'treasureEditor', race: 'raceEditor' }[out.configType] || null;
    if (panelId) {
      const panel = document.getElementById(panelId);
      out.editorPanel = !!panel && !panel.classList.contains('hidden');
    } else {
      out.editorPanel = out.editorQuestions === out.contentCount;
    }

    // T8 — save from the editor → library (playable offline)
    setPhase('save to library');
    const saveBtn = document.getElementById('saveGameBtn');
    out.saveButton = !!saveBtn;
    if (saveBtn) saveBtn.click();
    out.libraryHasGame = false;
    for (let i = 0; i < 60; i += 1) {
      const library = await window.eduGame.getLibrary();
      if ((library.games || []).some(g => g.id === out.gameId)) { out.libraryHasGame = true; break; }
      await sleep(250);
    }
    const libraryGame = out.libraryHasGame ? (await window.eduGame.getLibrary()).games.find(g => g.id === out.gameId) : null;
    out.libraryTemplate = libraryGame ? libraryGame.template : null;
    out.libraryQuestionCount = libraryGame ? (libraryGame.questions || []).length : 0;
    const closeBtn = document.querySelector('#modalRoot .modal-close');
    if (closeBtn) closeBtn.click();
    await sleep(200);

    // T9 — reopening the project restores everything without calling the model
    setPhase('reopen without AI');
    // Saving from the editor navigates to the library, so go back to the wizard first.
    navigate('create-wizard');
    await sleep(250);
    out.pageBeforeReopen = state.page;
    wizardReset();
    render();
    // Same entry point the sidebar uses.
    const reopenStarted = Date.now();
    await wizardOpenSaved(out.projectId);
    out.reopenMs = Date.now() - reopenStarted;
    await sleep(200);
    out.reopenStep = wizardState.step;
    out.reopenSnapshot = wizardState.gameSnapshot && wizardState.gameSnapshot.template;
    out.reopenQuestions = wizardState.gameSnapshot ? (wizardState.gameSnapshot.questions || []).length : 0;
    {
      const reopened = wizardState.gameSnapshot;
      if (reopened) {
        if (reopened.template === 'matching') out.reopenContentCount = ((reopened.matchingGame || {}).pairs || []).length;
        else if (reopened.template === 'treasure-hunt') out.reopenContentCount = ((reopened.treasureHunt || {}).stages || []).length;
        else if (reopened.template === 'race') out.reopenContentCount = ((reopened.race || {}).questions || []).length;
        else out.reopenContentCount = (reopened.questions || []).length;
      }
    }
    out.reopenBody = document.querySelector('[data-wizard-step-body]')?.dataset.wizardStepBody || null;
    out.reopenTopic = wizardState.analysis && wizardState.analysis.topic;
    out.reopenDraftType = wizardState.draft && wizardState.draft.gameType;
    out.reopenBusy = wizardState.busy;
    out.reopenHasNotice = !!document.getElementById('wizardNotice');

    // T10 — cleanup + errors
    setPhase('cleanup');
    out.rendererErrors = window.__smokeErrors.slice();
    if (out.gameId) await window.eduGame.deleteGame(out.gameId);
    if (out.projectId) await window.eduGame.deleteProject(out.projectId);
    const library = await window.eduGame.getLibrary();
    out.gameGone = !(library.games || []).some(g => g.id === out.gameId);
    const projects = await window.eduGame.listProjects();
    out.projectGone = !projects.some(p => p.id === out.projectId);
    wizardReset();
    setPhase('done');
    return out;
  })()`;

  // Start the long run WITHOUT awaiting, then report phases while it works.
  let settled = false; let failure = null; let run = null;
  evalv(script).then(value => { run = value; settled = true; }, error => { failure = error; settled = true; });

  const wallStart = Date.now();
  let lastPhase = '';
  while (!settled) {
    await sleep(4000);
    if (socketClosed) { console.error('!! CDP socket closed — the app went away mid-run'); process.exit(3); }
    const phase = await readPhase();
    if (phase && phase !== lastPhase) { lastPhase = phase; console.log(`  · ${phase}`); }
    if (Date.now() - wallStart > TOTAL_MS) { console.error(`!! driver gave up after ${Math.round((Date.now() - wallStart) / 1000)}s at: ${lastPhase || 'unknown'}`); process.exit(2); }
  }
  if (failure) throw failure;
  if (!run) throw new Error('run produced no result');

  const results = [];
  const push = (label, ok, extra = '') => results.push([label, !!ok, String(extra)]);
  push('T1 analyze completed without error', run.analyzeOk === true && !run.analyzeError, 'err=' + run.analyzeError);
  push('T1 analysis has a topic + objectives', typeof run.analysisTopic === 'string' && run.analysisTopic.length > 0 && run.analysisObjectives >= 1, run.analysisTopic + ' obj=' + run.analysisObjectives);
  push('T1 recommendations completed', run.recommendOk === true && !run.recommendError, 'err=' + run.recommendError + ' types=' + (run.recommendationTypes || []).join(','));
  push('T2 a recommendation was picked + configured', typeof run.pickedType === 'string' && run.configType === run.pickedType, 'picked=' + run.pickedType + ' config=' + run.configType);
  push('T2 configure saved and advanced', run.configureOk === true && !run.configureError, 'err=' + run.configureError);
  push('T2 teacher title edit was persisted', run.storedConfigTitle === 'smoke66 · Trò chơi từ giáo án', run.storedConfigTitle);
  push('T3 generate button is enabled in P6', run.generateButton === true && run.generateEnabled === true, 'enabled=' + run.generateEnabled);
  push('T4 generation returned a snapshot', run.generateOk === true && !run.generateError, 'err=' + run.generateError);
  push(`T4 snapshot maps ${run.configType} → ${run.expectedTemplate}`, run.template === run.expectedTemplate, run.template);
  push('T4 real model produced content', run.contentCount >= (run.configType === 'race' ? 1 : 2), 'n=' + run.contentCount);
  if (mode === 'fixture') push('T4 fixture produced exactly 3 questions', run.template !== 'quiz' || run.contentCount === 3, 'n=' + run.contentCount);
  push('T5 adapted content is coherent', run.coherent === true, 'ids=' + run.idsUnique + ' answers=' + run.correctInsideOptions + ' prompts=' + run.allPrompts);
  push('T6 project persisted at edit/ready', run.storedStep === 'edit' && run.storedStatus === 'ready', run.storedStep + '/' + run.storedStatus);
  push('T6 snapshot + draft stored on the project', run.storedGameId === run.gameId && run.storedSnapshotTemplate === run.expectedTemplate && run.storedDraftType === run.configType, run.storedGameId + ' draft=' + run.storedDraftType);
  push('T7 editor opens with the teacher title', run.editorOpened === true && run.editorTitle === 'smoke66 · Trò chơi từ giáo án', run.editorTitle);
  push('T7 editor surface matches the game type', run.editorPanel === true, 'panel=' + run.editorPanel + ' cards=' + run.editorQuestions + '/' + run.contentCount);
  push('T8 editor save puts the game in the library', run.saveButton === true && run.libraryHasGame === true);
  push('T8 library game keeps the template', run.libraryTemplate === run.expectedTemplate, run.libraryTemplate);
  push('T8 library game keeps the questions', run.template !== 'quiz' && run.template !== 'scenario' || run.libraryQuestionCount === run.contentCount, run.libraryQuestionCount + '/' + run.contentCount);
  push('T9 reopening restores the snapshot at step generate', run.reopenStep === 'generate' && run.reopenSnapshot === run.expectedTemplate && run.reopenBody === 'generate' && run.reopenDraftType === run.configType, run.reopenStep + ' body=' + run.reopenBody + ' draft=' + run.reopenDraftType);
  push('T9 reopening restores the generated content', run.reopenContentCount === run.contentCount, run.reopenContentCount + '/' + run.contentCount);
  push('T9 reopening restores the stored analysis', run.reopenTopic === run.analysisTopic, run.reopenTopic);
  push('T9 reopen is local-only (fast, model not called)', typeof run.reopenMs === 'number' && run.reopenMs < 5000 && run.reopenBusy === '', 'ms=' + run.reopenMs + ' busy=' + JSON.stringify(run.reopenBusy));
  push('T9 saved-draft notice shown on reopen', run.reopenHasNotice === true);
  push('T10 cleanup removes game + project', run.gameGone === true && run.projectGone === true);
  push('T10 no uncaught renderer errors', (run.rendererErrors || []).length === 0, (run.rendererErrors || []).join(' | '));

  const pass = results.filter(r => r[1]).length;
  for (const [label, ok, extra] of results) console.log(`${ok ? 'PASS' : 'FAIL'} | ${label}  ${extra || ''}`);
  console.log(`\nSmoke66 (${mode}): ${pass}/${results.length} passed`);
  console.log('phases: ' + (run.phases || []).join(' → '));
  ws.close();
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error('DRIVER ERROR:', e.message); process.exit(1); });
