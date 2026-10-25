// smoke80.js — back to step 3 after finishing step 5 and pick a different genre.
//
// Regression: changing genre used to update `config` but keep the old draft, so
// `project:save-draft` was rejected by the store invariant
// (`config.gameType === draft.gameType`) and the teacher could never finish the
// second game. The wizard must now drop the old content (silently when the game
// is already in the library, after a confirm when it is not).
//
// Run while the app is started with:
//   EDUGAME_USER_DATA=<empty folder> EDUGAME_AI_TEST_DIR=tests/fixtures/wizard/happy \
//     electron . --remote-debugging-port=9333
//   node tests/smoke/smoke80.js
const PORT = 9333;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
function check(label, pass, extra) {
  results.push({ label, pass: Boolean(pass) });
  console.log((pass ? 'PASS' : 'FAIL') + ' | ' + label + (extra != null && extra !== '' ? '  -> ' + extra : ''));
}
const uncaught = [], consoleErrs = [];

async function findTarget() {
  for (let i = 0; i < 90; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const target = list.find(x => x.type === 'page' && /index\.html/.test(x.url));
      if (target) return target;
    } catch {}
    await sleep(1000);
  }
  throw new Error('No page target on CDP port ' + PORT);
}

(async () => {
  const target = await findTarget();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  let seq = 0;
  const pending = new Map();
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      message.error ? reject(new Error(message.error.message)) : resolve(message.result);
      return;
    }
    if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params.exceptionDetails;
      uncaught.push((details.exception && details.exception.description) || details.text || 'unknown');
    } else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      consoleErrs.push(message.params.args.map(arg => arg.value ?? arg.description ?? '').join(' '));
    }
  });
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evalJs(expression, awaitPromise = false) {
    const result = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
    if (result.exceptionDetails) return { error: (result.exceptionDetails.exception && result.exceptionDetails.exception.description) || result.exceptionDetails.text };
    return { value: result.result.value };
  }
  async function must(expr) {
    const result = await evalJs(expr, true);
    if (result.error) throw new Error('evaluate failed: ' + result.error + '\n  expr: ' + expr.slice(0, 200));
    return result.value;
  }
  await send('Page.enable');
  await send('Runtime.enable');
  await sleep(300);

  const booted = await must(`(async () => {
    const started = Date.now();
    while (Date.now() - started < 30000) {
      if (typeof wizardState !== 'undefined' && typeof wizardRecommendSelectType === 'function' && window.eduGame && document.querySelector('#pageContent')?.children.length) return true;
      await new Promise(r => setTimeout(r, 200));
    }
    return false;
  })()`);
  check('T1 renderer booted', booted, booted);

  // A real project at step 3, using a fixture analysis so no model is needed.
  const setup = await must(`(async () => {
    const stamp = String(Date.now());
    const text = 'Quang hợp là quá trình thực vật tổng hợp chất hữu cơ nhờ năng lượng ánh sáng mặt trời. Quá trình này tạo ra oxy và tích lũy chất hữu cơ nuôi cây.';
    const document = await window.eduGame.saveLessonDocument({ name: 'smoke80.txt', ext: 'txt', text, characters: text.length });
    const analysis = {
      id: 'analysis_smoke80_' + stamp, schemaVersion: 1, documentId: document.id,
      subject: 'Sinh học', grade: 7, topic: 'Quang hợp ở thực vật',
      objectives: [
        { id: 'obj_1', description: 'Nêu vai trò của ánh sáng trong quang hợp.', cognitiveLevel: 'remember' },
        { id: 'obj_2', description: 'Giải thích vì sao cây thiếu ánh sáng sẽ vàng lá.', cognitiveLevel: 'apply' }
      ],
      keyConcepts: [{ id: 'concept_1', term: 'Quang hợp', explanation: 'Tổng hợp chất hữu cơ nhờ ánh sáng.' }],
      uncertainties: [], sourceDocumentIds: [document.id], createdAt: new Date().toISOString()
    };
    await window.eduGame.saveLessonAnalysis(analysis);
    const projectId = 'project_smoke80_' + stamp;
    const now = new Date().toISOString();
    await window.eduGame.saveProjectDraft({
      id: projectId, schemaVersion: 1, status: 'review', step: 'recommend', title: 'Smoke80 chuyển thể loại',
      description: analysis.topic, tags: [], sourceName: 'smoke80.txt',
      lesson: { documentId: document.id, name: 'smoke80.txt', characters: text.length },
      analysisId: analysis.id, recommendationId: null, config: null, draft: null, gameSnapshot: null, gameId: null,
      createdAt: now, updatedAt: now
    });
    wizardReset();
    Object.assign(wizardState, {
      projectId,
      documentId: document.id,
      documentName: 'smoke80.txt',
      documentMeta: { characters: text.length, ext: 'txt', sizeBytes: text.length },
      text,
      analysis,
      analysisOriginal: JSON.parse(JSON.stringify(analysis)),
      analysisId: analysis.id,
      step: 'recommend'
    });
    navigate('create-wizard');
    await new Promise(r => setTimeout(r, 300));
    await wizardRecommendRun();
    return { projectId, types: wizardState.recommendations.map(item => item.gameType), step: wizardState.step };
  })()`);
  const ALL_TYPES = ['arena', 'scenario', 'matching', 'treasure', 'race'];
  const typeA = setup.types[0];
  const others = ALL_TYPES.filter(type => !setup.types.includes(type));
  const typeB = others[0];
  const typeC = others[1] || setup.types[1];
  check('T1 the rule-based recommender offered 2–3 genres', setup.types.length >= 2 && setup.types.length <= 3 && setup.step === 'recommend', JSON.stringify(setup.types));
  check('T1 two other genres are available to switch to', Boolean(typeA && typeB && typeC && typeC !== typeA && typeC !== typeB), JSON.stringify({ typeA, typeB, typeC }));

  // Finish step 5 once with genre A (fixture supplies game_draft_<type>.json).
  const first = await must(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const waitFor = async (fn, ms) => { const started = Date.now(); while (Date.now() - started < (ms || 15000)) { if (fn()) return true; await sleep(100); } return false; };
    const card = document.querySelector('[data-wizard-recommendation][data-game-type="${typeA}"] [data-wizard-action="select"]');
    if (!card) return { missing: true };
    card.click();
    await sleep(150);
    document.getElementById('wizardNextBtn').click();
    const configured = await waitFor(() => wizardState.step === 'configure' && !wizardState.busy);
    document.querySelector('[data-wizard-step-body="configure"] [data-wizard-action="next"]').click();
    const onGenerate = await waitFor(() => wizardState.step === 'generate' && !wizardState.busy);
    const generateBtn = document.getElementById('wizardGenerateBtn');
    if (!generateBtn) return { missing: 'generate button' };
    generateBtn.click();
    const generated = await waitFor(() => !wizardState.busy && Boolean(wizardState.gameSnapshot), 60000);
    return {
      configured, onGenerate, generated,
      step: wizardState.step,
      draftType: wizardState.draft && wizardState.draft.gameType,
      hasSnapshot: Boolean(wizardState.gameSnapshot),
      error: wizardState.error ? (wizardState.error.code + ': ' + wizardState.error.message) : ''
    };
  })()`);
  check('T2 step 3→4→5 with the first genre saves and generates', first.configured && first.onGenerate && first.generated && first.draftType === typeA && !first.error, JSON.stringify(first));

  // Back to step 3 like a teacher would: the stepper is clickable on every step.
  const backToStep3 = await must(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const goto = document.querySelector('[data-wizard-goto="recommend"]');
    if (goto) goto.click();
    await sleep(200);
    return { step: wizardState.step, draftType: wizardState.draft && wizardState.draft.gameType };
  })()`);
  check('T3 back navigation returns to step 3 with the draft untouched', backToStep3.step === 'recommend' && backToStep3.draftType === typeA, JSON.stringify(backToStep3));

  // Unsaved draft: declining the prompt must keep the old genre + content.
  const cancelled = await must(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    let calls = 0;
    window.confirm = () => { calls += 1; return false; };
    const button = document.querySelector('[data-wizard-action="select-type"][data-game-type="${typeB}"]');
    if (!button) return { missing: true };
    button.click();
    await sleep(200);
    return {
      calls,
      selectedType: wizardState.selectedGameType,
      configType: wizardState.config && wizardState.config.gameType,
      draftType: wizardState.draft && wizardState.draft.gameType
    };
  })()`);
  check('T3 declining the prompt keeps the first genre and its draft', cancelled.calls === 1 && cancelled.selectedType === typeA && cancelled.configType === typeA && cancelled.draftType === typeA, JSON.stringify(cancelled));

  // Accepting drops the old draft so config and draft cannot disagree.
  const accepted = await must(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    let calls = 0;
    window.confirm = () => { calls += 1; return true; };
    const button = document.querySelector('[data-wizard-action="select-type"][data-game-type="${typeB}"]');
    button.click();
    await sleep(200);
    return {
      calls,
      selectedType: wizardState.selectedGameType,
      configType: wizardState.config && wizardState.config.gameType,
      draftCleared: wizardState.draft === null,
      snapshotCleared: wizardState.gameSnapshot === null,
      gameIdCleared: !wizardState.gameId
    };
  })()`);
  check('T4 accepting the switch clears the old draft/snapshot/game pointer', accepted.calls === 1 && accepted.selectedType === typeB && accepted.configType === typeB && accepted.draftCleared && accepted.snapshotCleared && accepted.gameIdCleared, JSON.stringify(accepted));

  // Saving 3→4 used to fail here with STORE_INVALID_PROJECT.
  const savedProject = await must(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const waitFor = async (fn, ms) => { const started = Date.now(); while (Date.now() - started < (ms || 15000)) { if (fn()) return true; await sleep(100); } return false; };
    document.getElementById('wizardNextBtn').click();
    const configured = await waitFor(() => wizardState.step === 'configure' && !wizardState.busy);
    const saveError = wizardState.error ? (wizardState.error.code + ': ' + wizardState.error.message) : '';
    document.querySelector('[data-wizard-step-body="configure"] [data-wizard-action="next"]').click();
    const onGenerate = await waitFor(() => wizardState.step === 'generate' && !wizardState.busy);
    const project = await window.eduGame.getProject(wizardState.projectId);
    return {
      configured, onGenerate, saveError,
      emptyState: Boolean(document.getElementById('wizardGenerateBtn')) && !document.querySelector('[data-wizard-action="save-game"]'),
      configType: project.config && project.config.gameType,
      draft: project.draft,
      step: project.step,
      projectError: wizardState.error ? wizardState.error.message : ''
    };
  })()`);
  check('T4 3→4 saves without the mismatched-content error', savedProject.configured && !savedProject.saveError, savedProject.saveError || 'ok');
  check('T4 the stored project now holds the new genre and no draft', savedProject.configType === typeB && savedProject.draft === null, savedProject.configType + ' draft=' + JSON.stringify(savedProject.draft));
  check('T4 step 5 shows the empty state instead of the old content', savedProject.onGenerate && savedProject.emptyState && !savedProject.projectError, JSON.stringify({ onGenerate: savedProject.onGenerate, emptyState: savedProject.emptyState, projectError: savedProject.projectError }));

  // And the second game can actually be generated with the fixture.
  const second = await must(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const waitFor = async (fn, ms) => { const started = Date.now(); while (Date.now() - started < (ms || 60000)) { if (fn()) return true; await sleep(150); } return false; };
    document.getElementById('wizardGenerateBtn').click();
    const generated = await waitFor(() => !wizardState.busy && Boolean(wizardState.gameSnapshot));
    const project = await window.eduGame.getProject(wizardState.projectId);
    return {
      generated,
      draftType: wizardState.draft && wizardState.draft.gameType,
      configType: project.config && project.config.gameType,
      projectDraftType: project.draft && project.draft.gameType,
      error: wizardState.error ? (wizardState.error.code + ': ' + wizardState.error.message) : ''
    };
  })()`);
  check('T5 the second genre generates and is stored', second.generated && second.draftType === typeB && second.configType === typeB && second.projectDraftType === typeB && !second.error, JSON.stringify(second));

  // Save to the library, then switch again: this time no prompt (content is safe).
  const library = await must(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const waitFor = async (fn, ms) => { const started = Date.now(); while (Date.now() - started < (ms || 20000)) { if (fn()) return true; await sleep(150); } return false; };
    document.querySelector('[data-wizard-action="save-game"]').click();
    const saved = await waitFor(() => !wizardState.busy && wizardGameSavedToLibrary());
    return { saved, gameId: wizardState.gameId, inLibrary: wizardGameSavedToLibrary(), error: wizardState.error ? wizardState.error.message : '' };
  })()`);
  check('T6 saving to the library records the game', library.saved && library.inLibrary && !library.error, JSON.stringify({ saved: library.saved, inLibrary: library.inLibrary, error: library.error }));

  const silent = await must(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const goto = document.querySelector('[data-wizard-goto="recommend"]');
    if (goto) goto.click();
    await sleep(200);
    let calls = 0;
    window.confirm = () => { calls += 1; return false; };
    const button = document.querySelector('[data-wizard-action="select-type"][data-game-type="${typeC}"]');
    if (!button) return { missing: true };
    button.click();
    await sleep(200);
    return {
      calls,
      step: wizardState.step,
      selectedType: wizardState.selectedGameType,
      configType: wizardState.config && wizardState.config.gameType,
      draftCleared: wizardState.draft === null,
      gameIdCleared: !wizardState.gameId
    };
  })()`);
  check('T6 a game already in the library is dropped without a prompt', silent.calls === 0 && silent.step === 'recommend' && silent.selectedType === typeC && silent.configType === typeC && silent.draftCleared && silent.gameIdCleared, JSON.stringify(silent));

  // Finish the third genre too, proving the wizard is not stuck.
  const third = await must(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const waitFor = async (fn, ms) => { const started = Date.now(); while (Date.now() - started < (ms || 15000)) { if (fn()) return true; await sleep(100); } return false; };
    document.getElementById('wizardNextBtn').click();
    const configured = await waitFor(() => wizardState.step === 'configure' && !wizardState.busy);
    const saveError = wizardState.error ? (wizardState.error.code + ': ' + wizardState.error.message) : '';
    document.querySelector('[data-wizard-step-body="configure"] [data-wizard-action="next"]').click();
    await waitFor(() => wizardState.step === 'generate' && !wizardState.busy);
    document.getElementById('wizardGenerateBtn').click();
    await waitFor(() => !wizardState.busy && Boolean(wizardState.gameSnapshot), 60000);
    const project = await window.eduGame.getProject(wizardState.projectId);
    return {
      configured,
      saveError,
      configType: project.config && project.config.gameType,
      projectDraftType: project.draft && project.draft.gameType,
      error: wizardState.error ? (wizardState.error.code + ': ' + wizardState.error.message) : ''
    };
  })()`);
  check('T7 the third genre also configures, saves and generates', third.configured && !third.saveError && third.configType === typeC && third.projectDraftType === typeC && !third.error, JSON.stringify(third));

  check('T8 no mismatched-content error was ever surfaced', !/nhưng nội dung là/.test(JSON.stringify([first, savedProject, second, third])), '');
  check('T9 no uncaught renderer exceptions', uncaught.length === 0, uncaught.slice(0, 2).join(' | '));
  check('T10 no console errors', consoleErrs.length === 0, consoleErrs.slice(0, 2).join(' | '));

  const failed = results.filter(r => !r.pass);
  console.log(`\nsmoke80: ${results.length - failed.length}/${results.length} passed`);
  ws.close();
  process.exit(failed.length ? 1 : 0);
})().catch(error => {
  console.error('smoke80 crashed:', error);
  process.exit(1);
});
