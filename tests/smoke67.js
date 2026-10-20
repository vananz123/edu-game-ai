// tests/smoke67.js — P6: generation + adapter + editor for ALL 5 game types.
//
// Run with the app started with EDUGAME_AI_TEST_DIR=tests/fixtures/wizard/happy
// (the model reply is canned per type; IPC → generate → adapter → validators →
// editor → library save is real). The real-model end-to-end run for one type is
// tests/smoke66.js real.
//
// For each type this builds a project with the production default-config helper,
// generates, checks the adapted snapshot shape, opens the real editor and checks
// the type-specific panel, then round-trips the game through the library.
const sleep = ms => new Promise(r => setTimeout(r, ms));

const EXPECTED = {
  arena: { template: 'quiz', panel: null },
  scenario: { template: 'scenario', panel: null },
  matching: { template: 'matching', panel: 'matchingEditor' },
  treasure: { template: 'treasure-hunt', panel: 'treasureEditor' },
  race: { template: 'race', panel: 'raceEditor' }
};

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
    window.__smokeErrors = [];
    window.addEventListener('error', event => window.__smokeErrors.push(String(event.message)));
    window.addEventListener('unhandledrejection', event => window.__smokeErrors.push(String(event.reason)));
    const out = { types: {}, errors: [] };
    const expected = ${JSON.stringify(EXPECTED)};

    const stamp = Date.now().toString(36);
    // The analysis/project rows carry a FK to lesson_documents, so create a real
    // document first (same call the wizard's step 1 makes).
    const lessonText = 'Quang hợp là quá trình thực vật tổng hợp chất hữu cơ nhờ năng lượng ánh sáng mặt trời, sử dụng diệp lục trong lục lạp. Quá trình này tạo ra oxy và tích lũy chất hữu cơ nuôi cây. Cây thiếu ánh sáng sẽ vàng lá và chậm phát triển vì quang hợp giảm mạnh.';
    const storedDocument = await window.eduGame.saveLessonDocument({ name: 'smoke67.txt', ext: 'txt', text: lessonText, characters: lessonText.length });
    const documentId = storedDocument.id;
    const analysisId = 'analysis_smoke67_' + stamp;
    const now = new Date().toISOString();
    const analysis = {
      id: analysisId,
      schemaVersion: 1,
      documentId,
      subject: 'Sinh học',
      grade: 7,
      topic: 'Quang hợp ở thực vật',
      objectives: [
        { id: 'obj_1', description: 'Nêu vai trò của ánh sáng trong quang hợp.', cognitiveLevel: 'remember' },
        { id: 'obj_2', description: 'Giải thích vì sao cây thiếu ánh sáng sẽ vàng lá.', cognitiveLevel: 'apply' }
      ],
      keyConcepts: [{ id: 'concept_1', term: 'Quang hợp', explanation: 'Tổng hợp chất hữu cơ nhờ ánh sáng.' }],
      uncertainties: [],
      sourceDocumentIds: [documentId],
      createdAt: now
    };
    out.analysisSaved = false;
    try { await window.eduGame.saveLessonAnalysis(analysis); out.analysisSaved = true; }
    catch (error) { out.errors.push('analysis: ' + (error.message || error)); }

    const types = ['arena', 'scenario', 'matching', 'treasure', 'race'];
    for (const type of types) {
      const info = { type, expectedTemplate: expected[type].template };
      try {
        // Production helper builds a schema-valid config for the type.
        const recommendation = {
          gameType: type,
          title: 'Smoke67 ' + type,
          rationale: 'kiểm thử',
          suggestedQuestionCount: type === 'treasure' ? 2 : type === 'matching' ? 4 : 3,
          suggestedDurationMinutes: 10,
          learningObjectiveIds: ['obj_1'],
          difficulty: 'trung bình'
        };
        const config = wizardDefaultConfig(recommendation, analysis);
        info.configType = config && config.gameType;

        const projectId = 'project_smoke67_' + type + '_' + stamp;
        const project = {
          id: projectId, schemaVersion: 1, status: 'review', step: 'generate',
          title: config.title, description: analysis.topic, tags: [], sourceName: 'smoke67.txt',
          lesson: { documentId, name: 'smoke67.txt', characters: 300 },
          analysisId, recommendationId: null, config, draft: null, gameSnapshot: null, gameId: null,
          createdAt: now, updatedAt: now
        };
        await window.eduGame.saveProjectDraft(project);

        const result = await window.eduGame.generateLessonDraft({ projectId, requestId: 'smoke67-' + type, mode: 'fast' });
        const game = result.game;
        info.gameId = game && game.id;
        info.template = game && game.template;
        info.storedStep = result.project.step;
        info.storedStatus = result.project.status;
        info.storedGameId = result.project.gameId;
        info.persistedSnapshot = !!(await window.eduGame.getProject(projectId)).gameSnapshot;

        // O2 — the advisory quality report comes back with the generation.
        const quality = result.quality;
        info.qualityPresent = !!quality;
        info.qualityErrors = quality ? quality.errors : -1;
        info.qualityWarnings = quality ? quality.warnings : -1;
        info.qualityFound = quality ? quality.counts.found : -1;
        info.qualityRequested = quality ? quality.counts.requested : -1;
        info.qualityCanPublish = quality ? quality.canPublish : null;
        info.context = result.context || null;

        // O5 — cache: identical inputs reuse content; "Tạo lại" bypasses it (§9).
        const cachedAgain = await window.eduGame.generateLessonDraft({ projectId, requestId: 'smoke67-cache-' + type, mode: 'fast' });
        info.cacheReuse = cachedAgain.cached === true && cachedAgain.game.title === game.title;
        const forcedAgain = await window.eduGame.generateLessonDraft({ projectId, requestId: 'smoke67-forced-' + type, mode: 'fast', regenerate: true });
        info.cacheBypassed = forcedAgain.cached === false;

        // O5 — rewrite one item; ids and every other item stay untouched (§5.5).
        const listKey = type === 'scenario' ? 'situations' : type === 'matching' ? 'pairs' : type === 'treasure' ? 'stages' : 'questions';
        const beforeItems = (forcedAgain.project.draft || {})[listKey] || [];
        const itemRegen = await window.eduGame.regenerateLessonItem({ projectId, requestId: 'smoke67-item-' + type, itemIndex: 2 });
        const afterItems = (itemRegen.project.draft || {})[listKey] || [];
        info.itemRegenIndexes = itemRegen.itemIndexes;
        info.itemRegenCountKept = beforeItems.length === afterItems.length && beforeItems.length >= 2;
        info.itemRegenIdKept = Boolean(beforeItems[1] && afterItems[1] && beforeItems[1].id === afterItems[1].id);
        info.itemRegenChanged = JSON.stringify(beforeItems[1]) !== JSON.stringify(afterItems[1]);
        info.itemRegenOthersUnchanged = JSON.stringify(beforeItems.filter((_, index) => index !== 1)) === JSON.stringify(afterItems.filter((_, index) => index !== 1));
        info.itemRegenTemplate = itemRegen.game && itemRegen.game.template;

        // Type-specific shape checks.
        if (type === 'arena' || type === 'scenario') {
          const questions = game.questions || [];
          info.contentCount = questions.length;
          info.optionsOk = questions.every(q => Array.isArray(q.options) && q.options.length >= 2);
          info.correctOk = questions.every(q => q.options.some(o => o.id === q.correctOptionId));
          info.emptyQuestionList = (game.questions || []).length === 0;
        }
        if (type === 'matching') {
          const matching = game.matchingGame || {};
          info.contentCount = (matching.pairs || []).length;
          info.optionsOk = (matching.pairs || []).every(p => p.left && p.right);
          info.correctOk = (matching.pairs || []).length >= 2;
          info.emptyQuestionList = (game.questions || []).length === 0;
        }
        if (type === 'treasure') {
          const stages = (game.treasureHunt || {}).stages || [];
          info.contentCount = stages.length;
          info.optionsOk = stages.every(s => s.question && s.question.options.length >= 2);
          info.correctOk = stages.every(s => s.question.options.some(o => o.id === s.question.correctOptionId));
          info.emptyQuestionList = stages.every(s => s.nextStageId === null) || stages.length >= 2;
        }
        if (type === 'race') {
          const race = game.race || {};
          info.contentCount = (race.questions || []).length;
          info.optionsOk = (race.teams || []).length >= 2 && race.trackLength >= 3;
          info.correctOk = (race.questions || []).every(q => q.options.some(o => o.id === q.correctOptionId));
          info.emptyQuestionList = (race.teams || []).length >= 2;
        }

        // Open the real editor and check the type-specific surface. The wizard
        // passes the project context, so quiz/scenario get per-question AI
        // regeneration; manual/library opens pass no context (DECISIONS #15).
        const aiContext = { projectId, gameType: type, itemIds: (game.questions || []).map(q => q.id) };
        const beforeAiProject = (type === 'arena' || type === 'scenario') ? await window.eduGame.getProject(projectId) : null;
        openEditor(JSON.parse(JSON.stringify(game)), true, 'smoke67', aiContext);
        await sleep(350);
        info.editorOpened = !!document.querySelector('#modalRoot .modal');
        info.aiButtons = document.querySelectorAll('#editorQuestions [data-ai-regenerate]').length;
        if (type === 'arena' || type === 'scenario') {
          const aiPosition = type === 'arena' ? 3 : 1;
          const aiButton = document.querySelector('#editorQuestions [data-ai-regenerate="' + aiPosition + '"]');
          info.aiButtonFound = !!aiButton;
          if (aiButton) {
            const previousConfirm = window.confirm;
            window.confirm = () => true;
            try {
              aiButton.click();
              for (let i = 0; i < 100; i++) {
                await sleep(200);
                if (!document.querySelector('#editorQuestions [data-ai-cancel]')) break;
              }
              const afterAiProject = await window.eduGame.getProject(projectId);
              info.aiAfterChanged = JSON.stringify((beforeAiProject.draft[listKey] || [])[aiPosition - 1])
                !== JSON.stringify((afterAiProject.draft[listKey] || [])[aiPosition - 1]);
              const row = document.querySelector('#editorQuestions .editor-question[data-question-index="' + (aiPosition - 1) + '"]');
              info.aiDomPrompt = row ? row.querySelector('[data-field="prompt"]').value : '';
              const restored = document.querySelector('#editorQuestions [data-ai-regenerate="' + aiPosition + '"]');
              info.aiRestored = !!restored && !restored.hasAttribute('data-ai-cancel')
                && /Tạo lại/.test(restored.textContent || '') && restored.disabled === false;
            } finally {
              window.confirm = previousConfirm;
            }
          }
        }
        const panelId = expected[type].panel;
        if (panelId) {
          const panel = document.getElementById(panelId);
          info.panelExists = !!panel;
          info.panelVisible = !!panel && !panel.classList.contains('hidden');
          info.questionCards = 0;
        } else {
          info.panelExists = true;
          info.panelVisible = true;
          info.questionCards = document.querySelectorAll('#editorQuestions > .editor-question').length;
        }
        const closeBtn = document.querySelector('#modalRoot .modal-close');
        if (closeBtn) closeBtn.click();
        await sleep(150);

        // Round-trip through the library (playable offline).
        await window.eduGame.saveGame(JSON.parse(JSON.stringify(game)));
        const library = await window.eduGame.getLibrary();
        info.inLibrary = (library.games || []).some(g => g.id === game.id);

        await window.eduGame.deleteGame(game.id);
        await window.eduGame.deleteProject(projectId);
        const after = await window.eduGame.getLibrary();
        info.cleanupGame = !(after.games || []).some(g => g.id === game.id);
        info.cleanupProject = !(await window.eduGame.listProjects()).some(p => p.id === projectId);
      } catch (error) {
        info.error = String((error && error.message) || error);
      }
      out.types[type] = info;
    }
    // O7: the step-5 progress list is real markup driven by state, and it must
    // not claim a repair that never happened. renderWizardStatus is the same
    // function the page calls while a generation is in flight.
    const progressFor = (stage, repaired) => {
      wizardState.busy = 'generate';
      wizardState.lessonStage = stage;
      wizardState.lessonRepaired = !!repaired;
      const host = document.createElement('div');
      host.innerHTML = renderWizardStatus();
      const nodes = Array.from(host.querySelectorAll('[data-stage]'));
      const repair = host.querySelector('[data-stage="repair"]');
      const validate = host.querySelector('[data-stage="validate"]');
      const stepHost = document.createElement('div');
      stepHost.innerHTML = renderWizardGenerate();
      return {
        stages: nodes.map(node => node.getAttribute('data-stage')),
        statuses: nodes.map(node => node.getAttribute('data-status')),
        repairSkipped: repair ? /không cần/.test(repair.textContent || '') : false,
        repairStatus: repair ? repair.getAttribute('data-status') : null,
        validateActive: validate ? validate.getAttribute('data-status') === 'active' : false,
        cancelButton: Boolean(stepHost.querySelector('[data-wizard-action="cancel"]'))
      };
    };
    out.stageUi = progressFor('validate', false);
    out.stageUi.repairNotNeeded = progressFor('ready', false).repairStatus;
    out.stageUi.repairDone = progressFor('ready', true).repairStatus;
    wizardState.busy = 'generate';
    wizardState.lessonStage = 'cached';
    const cachedHost = document.createElement('div');
    cachedHost.innerHTML = renderWizardStatus();
    out.stageUi.cachedLine = /dùng lại nội dung/.test(cachedHost.textContent || '') && cachedHost.querySelectorAll('[data-stage]').length === 0;
    wizardState.busy = '';
    wizardState.lessonStage = '';
    wizardState.lessonRepaired = false;
    out.rendererErrors = window.__smokeErrors.slice();
    return out;
  })()`);

  const results = [];
  const push = (label, ok, extra = '') => results.push([label, !!ok, String(extra)]);
  push('analysis saved for the project fixtures', run.analysisSaved === true, (run.errors || []).join(' | '));
  for (const type of ['arena', 'scenario', 'matching', 'treasure', 'race']) {
    const info = run.types[type] || {};
    const expectedTemplate = EXPECTED[type].template;
    push(`${type}: generation succeeded`, !info.error, info.error || '');
    push(`${type}: config built accepts the type`, info.configType === type, info.configType);
    push(`${type}: adapter produced the ${expectedTemplate} template`, info.template === expectedTemplate, info.template);
    push(`${type}: content adapted (n>=2)`, info.contentCount >= 2, 'n=' + info.contentCount);
    push(`${type}: adapted data is coherent`, info.optionsOk === true && info.correctOk === true);
    push(`${type}: project stored at edit/ready with snapshot`, info.storedStep === 'edit' && info.storedStatus === 'ready' && info.storedGameId === info.gameId && info.persistedSnapshot === true, info.storedStep + '/' + info.storedStatus);
    push(`${type}: quality report returned`, info.qualityPresent === true);
    push(`${type}: fixture content has no hard quality errors`, info.qualityErrors === 0 && info.qualityCanPublish === true, 'errors=' + info.qualityErrors + ' warnings=' + info.qualityWarnings);
    push(`${type}: quality counts match the generated draft`, info.qualityFound >= 2 && info.qualityFound === info.contentCount, info.qualityFound + '/' + info.contentCount + ' req=' + info.qualityRequested);
    push(`${type}: retrieved lesson chunks for the prompt`, Boolean(info.context) && info.context.chunkCount > 0 && info.context.selectedChunkCount > 0 && ['lexical-v1', 'embeddings-v1'].includes(info.context.scorer), JSON.stringify(info.context));
    push(`${type}: retrieved excerpt stays inside the prompt budget`, Boolean(info.context) && info.context.characters > 0 && info.context.characters <= 5200 && info.context.selectedChunkCount <= info.context.chunkCount, info.context && info.context.characters);
    push(`${type}: identical inputs reuse the cached draft`, info.cacheReuse === true);
    push(`${type}: "Tạo lại" bypasses the cache`, info.cacheBypassed === true);
    push(`${type}: one item regenerated, ids + others untouched`, Array.isArray(info.itemRegenIndexes) && info.itemRegenIndexes.length === 1 && info.itemRegenIndexes[0] === 2 && info.itemRegenCountKept === true && info.itemRegenIdKept === true && info.itemRegenChanged === true && info.itemRegenOthersUnchanged === true && info.itemRegenTemplate === expectedTemplate, JSON.stringify(info.itemRegenIndexes) + ' changed=' + info.itemRegenChanged + ' others=' + info.itemRegenOthersUnchanged);
    push(`${type}: editor opened`, info.editorOpened === true);
    push(`${type}: editor surface matches the type`, info.panelVisible === true && (EXPECTED[type].panel ? info.panelExists === true : info.questionCards === info.contentCount), EXPECTED[type].panel ? 'panel=' + info.panelExists : 'cards=' + info.questionCards + '/' + info.contentCount);
    push(`${type}: editor AI regenerate is scoped to wizard quiz/scenario`, type === 'arena' || type === 'scenario' ? info.aiButtons === info.contentCount : info.aiButtons === 0, 'buttons=' + info.aiButtons + '/' + info.contentCount);
    if (type === 'arena' || type === 'scenario') {
      push(`${type}: editor AI regenerates one item and restores the button`, info.aiButtonFound === true && info.aiAfterChanged === true && info.aiRestored === true && String(info.aiDomPrompt || '').length > 0, 'changed=' + info.aiAfterChanged + ' restored=' + info.aiRestored + ' prompt=' + String(info.aiDomPrompt || '').slice(0, 40));
    }
    push(`${type}: game round-trips through the library`, info.inLibrary === true);
    push(`${type}: cleanup removes game + project`, info.cleanupGame === true && info.cleanupProject === true);
  }
  const stageUi = run.stageUi || {};
  push('O7: progress lists the 5 real stages', JSON.stringify(stageUi.stages) === JSON.stringify(['retrieve', 'generate', 'validate', 'repair', 'ready']), JSON.stringify(stageUi.stages));
  push('O7: current stage highlighted, later stages pending', Array.isArray(stageUi.statuses) && stageUi.statuses[0] === 'done' && stageUi.statuses[1] === 'done' && stageUi.statuses[2] === 'active' && stageUi.statuses[3] === 'todo' && stageUi.statuses[4] === 'todo', JSON.stringify(stageUi.statuses));
  push('O7: repair marked "không cần" when no repair happened', stageUi.repairNotNeeded === 'skipped' && stageUi.validateActive === true, stageUi.repairNotNeeded);
  push('O7: repair marked done when the model had to repair', stageUi.repairDone === 'done', stageUi.repairDone);
  push('O7: generation can be cancelled from step 5', stageUi.cancelButton === true);
  push('O7: cache hit shows a reuse line, not fake stages', stageUi.cachedLine === true, String(stageUi.cachedLine));
  push('no uncaught renderer errors', (run.rendererErrors || []).length === 0, (run.rendererErrors || []).join(' | '));

  const pass = results.filter(r => r[1]).length;
  for (const [label, ok, extra] of results) console.log(`${ok ? 'PASS' : 'FAIL'} | ${label}  ${extra || ''}`);
  console.log(`\nSmoke67 (all 5 types, fixture content): ${pass}/${results.length} passed`);
  ws.close();
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error('DRIVER ERROR:', e.message); process.exit(1); });
