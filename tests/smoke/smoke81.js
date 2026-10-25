// smoke81.js — O12/O13 + step 3/5 UI fixes.
//
// Covers:
//   T1 capacity endpoint + automatic count on step 4
//   T2 step-3 selection state for cards and "thể loại khác" chips
//   T3 step-5 back-to-config + visible save-progress toast
//   T4 step-2 "Tạo trò chơi ngay" waits for confirmation (no AI before it)
//   T5 long project title does not widen the project list
//   T6 race panel keeps dark text on its light cards
//
// Run with the app started with:
//   EDUGAME_USER_DATA=<empty folder> EDUGAME_AI_TEST_DIR=tests/fixtures/wizard/happy
//     electron . --remote-debugging-port=9333
//   node tests/smoke/smoke81.js
const PORT = 9333;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
function check(label, pass, extra) {
  results.push({ label, pass: Boolean(pass) });
  console.log((pass ? 'PASS' : 'FAIL') + ' | ' + label + (extra != null && extra !== '' ? '  -> ' + extra : ''));
}

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
    }
  });
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async function must(expression) {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) {
      throw new Error('evaluate failed: ' + ((result.exceptionDetails.exception && result.exceptionDetails.exception.description) || result.exceptionDetails.text) + '\n  expr: ' + expression.slice(0, 200));
    }
    return result.result.value;
  }
  await send('Page.enable');
  await send('Runtime.enable');
  await sleep(300);

  const booted = await must(`(async () => {
    const started = Date.now();
    while (Date.now() - started < 30000) {
      if (typeof wizardState !== 'undefined' && typeof wizardGenerateRun === 'function' && window.eduGame && document.querySelector('#pageContent')?.children.length) return true;
      await new Promise(r => setTimeout(r, 200));
    }
    return false;
  })()`);
  check('T0 renderer booted', booted, booted);
  if (!booted) process.exit(1);

  // -- setup: a real document + analysis + project, recommendations from the
  //    production rule-based endpoint -----------------------------------------
  const setup = await must(`(async () => {
    const stamp = String(Date.now());
    const text = 'Quang hợp là quá trình thực vật tổng hợp chất hữu cơ nhờ năng lượng ánh sáng mặt trời. Quá trình này tạo ra oxy và tích lũy chất hữu cơ nuôi cây. Cây thiếu ánh sáng sẽ vàng lá và chậm phát triển.';
    const document = await window.eduGame.saveLessonDocument({ name: 'smoke81.txt', ext: 'txt', text, characters: text.length });
    const analysis = {
      id: 'analysis_smoke81_' + stamp, schemaVersion: 1, documentId: document.id,
      subject: 'Sinh học', grade: 7, topic: 'Quang hợp ở thực vật',
      objectives: [
        { id: 'obj_1', description: 'Nêu vai trò của ánh sáng trong quang hợp.', cognitiveLevel: 'remember' },
        { id: 'obj_2', description: 'Giải thích vì sao cây thiếu ánh sáng sẽ vàng lá.', cognitiveLevel: 'apply' },
        { id: 'obj_3', description: 'Vận dụng kiến thức để chăm sóc cây trong lớp.', cognitiveLevel: 'apply' }
      ],
      keyConcepts: [
        { id: 'concept_1', term: 'Quang hợp', explanation: 'Tổng hợp chất hữu cơ nhờ ánh sáng.' },
        { id: 'concept_2', term: 'Diệp lục', explanation: 'Sắc tố hấp thụ ánh sáng.' },
        { id: 'concept_3', term: 'Oxy', explanation: 'Khí thải ra từ quang hợp.' },
        { id: 'concept_4', term: 'Chất hữu cơ', explanation: 'Nguồn dinh dưỡng của cây.' }
      ],
      uncertainties: [], sourceDocumentIds: [document.id], createdAt: new Date().toISOString()
    };
    await window.eduGame.saveLessonAnalysis(analysis);
    const rec = await window.eduGame.recommendGames({ analysisId: analysis.id, requestId: 'smoke81-rec' });
    const recommendations = rec.recommendations || [];
    const top = recommendations[0];
    const config = wizardDefaultConfig(top, analysis);
    const projectId = 'project_smoke81_' + stamp;
    const now = new Date().toISOString();
    await window.eduGame.saveProjectDraft({
      id: projectId, schemaVersion: 1, status: 'review', step: 'configure', title: config.title,
      description: analysis.topic, tags: [], sourceName: 'smoke81.txt',
      lesson: { documentId: document.id, name: 'smoke81.txt', characters: text.length },
      analysisId: analysis.id, recommendationId: top.id, config, draft: null, gameSnapshot: null, gameId: null,
      createdAt: now, updatedAt: now
    });
    wizardReset();
    wizardState.documentId = document.id;
    wizardState.documentName = 'smoke81.txt';
    wizardState.documentMeta = { characters: text.length, ext: 'txt', sizeBytes: 0 };
    wizardState.text = text;
    wizardState.analysis = analysis;
    wizardState.analysisOriginal = analysis;
    wizardState.analysisId = analysis.id;
    wizardState.recommendations = recommendations;
    wizardState.projectId = projectId;
    wizardState.createdAt = now;
    wizardState.selectedRecommendationId = top.id;
    wizardState.selectedGameType = top.gameType;
    wizardState.config = config;
    wizardState.step = 'recommend';
    wizardState.countTouched = false;
    navigate('create-wizard');
    await new Promise(r => setTimeout(r, 400));
    return {
      projectId, analysisId: analysis.id, gameType: top.gameType,
      configCount: config[config.gameType === 'matching' ? 'pairCount' : config.gameType === 'treasure' ? 'stageCount' : config.gameType === 'scenario' ? 'situationCount' : config.gameType === 'race' ? 'maxRounds' : 'questionCount'],
      recommendationCount: top.suggestedQuestionCount,
      recommendationTypes: recommendations.map(item => item.gameType)
    };
  })()`);
  check('T1 setup has recommendations and a project', Boolean(setup && setup.projectId) && setup.recommendationTypes.length >= 2, JSON.stringify(setup));

  // -- T1: capacity endpoint + automatic count in step 4 --------------------
  const capacity = await must(`(async () => {
    const estimate = await window.eduGame.estimateLessonCapacity({ projectId: '${setup.projectId}', gameType: '${setup.gameType}', mode: 'fast' });
    wizardState.step = 'configure';
    wizardState.capacity = null;
    wizardState.countTouched = false;
    navigate('create-wizard');
    const started = Date.now();
    while (Date.now() - started < 5000 && !wizardState.capacity) await new Promise(r => setTimeout(r, 100));
    const key = wizardCapacityCountKey(wizardState.config.gameType);
    const input = document.querySelector('[data-wizard-config="' + key + '"]');
    const hint = document.querySelector('[data-wizard-capacity-hint]');
    return {
      suggested: estimate.suggested,
      contentCapacity: estimate.material.contentCapacity,
      documentCharacters: estimate.material.documentCharacters,
      modelLabel: estimate.model.label,
      configAfter: Number(wizardState.config[key]),
      inputValue: input ? Number(input.value) : null,
      hintText: hint ? hint.textContent.replace(/\\s+/g, ' ').trim() : '',
      reasons: estimate.reasons.length
    };
  })()`);
  check('T1 capacity predicts 4..7 for the document', capacity.suggested >= 4 && capacity.suggested <= 7 && capacity.documentCharacters > 0, JSON.stringify(capacity));
  check('T1 step 4 applies the prediction to the count field', capacity.configAfter === capacity.suggested && capacity.inputValue === capacity.suggested, JSON.stringify(capacity));
  check('T1 the count hint explains document/model', /tài liệu/.test(capacity.hintText) && /model/.test(capacity.hintText), capacity.hintText);

  const manual = await must(`(async () => {
    const key = wizardCapacityCountKey(wizardState.config.gameType);
    const suggested = wizardState.capacity.suggested;
    const input = document.querySelector('[data-wizard-config="' + key + '"]');
    input.value = String(suggested + 2);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 100));
    const hint = document.querySelector('[data-wizard-capacity-hint]');
    const button = hint ? hint.querySelector('[data-wizard-action="use-capacity"]') : null;
    const touched = wizardState.countTouched;
    const hintText = hint ? hint.textContent.replace(/\\s+/g, ' ').trim() : '';
    if (button) button.click();
    await new Promise(r => setTimeout(r, 100));
    const after = document.querySelector('[data-wizard-config="' + key + '"]');
    return {
      key, suggested, touched, hintText,
      manualValue: suggested + 2,
      afterValue: after ? Number(after.value) : null,
      afterTouched: wizardState.countTouched
    };
  })()`);
  check('T1 a manual count is kept and offers "Dùng N"', manual.touched && /Dùng /.test(manual.hintText), JSON.stringify(manual));
  check('T1 "Dùng N" restores the automatic count', manual.afterValue === manual.suggested && manual.afterTouched === false, JSON.stringify(manual));

  // -- T2: step-3 selection state -------------------------------------------
  const selection = await must(`(async () => {
    wizardState.step = 'recommend';
    wizardState.countTouched = false;
    navigate('create-wizard');
    await new Promise(r => setTimeout(r, 250));
    const selected = wizardState.selectedGameType;
    const chipsBefore = Array.from(document.querySelectorAll('[data-wizard-action="select-type"]'));
    const chip = chipsBefore.find(item => item.dataset.gameType !== selected) || chipsBefore[0];
    const other = chip ? chip.dataset.gameType : null;
    const before = chip ? { pressed: chip.getAttribute('aria-pressed'), primary: chip.classList.contains('btn-primary'), text: chip.textContent.trim() } : null;
    if (chip) chip.click();
    await new Promise(r => setTimeout(r, 200));
    const chipsAfter = Array.from(document.querySelectorAll('[data-wizard-action="select-type"]'));
    const active = chipsAfter.find(item => item.dataset.gameType === other);
    const another = chipsAfter.find(item => item.dataset.gameType !== other);
    const label = (wizardGameMeta(other) || {}).label || '';
    const summary = document.querySelector('[data-wizard-selected-type]');
    return {
      other, before,
      selectedAfter: wizardState.selectedGameType,
      configType: wizardState.config && wizardState.config.gameType,
      activePressed: active ? active.getAttribute('aria-pressed') : null,
      activePrimary: active ? active.classList.contains('btn-primary') : false,
      activeCheck: active ? active.textContent.trim().startsWith('✓') : false,
      anotherPressed: another ? another.getAttribute('aria-pressed') : null,
      summary: summary ? summary.textContent.replace(/\\s+/g, ' ').trim() : '',
      otherLabel: label
    };
  })()`);
  check('T2 clicking "thể loại khác" visibly selects the chip', selection.selectedAfter === selection.other && selection.activePressed === 'true' && selection.activePrimary && selection.activeCheck, JSON.stringify(selection));
  check('T2 the other chips are not selected', Boolean(selection.before) && selection.before.pressed === 'false' && (selection.anotherPressed === null || selection.anotherPressed === 'false'), JSON.stringify(selection.before));
  check('T2 the page names the current genre', selection.summary.includes(selection.otherLabel), selection.summary);

  // -- T3: generate, then step-5 back + save-progress toast ------------------
  const t3 = await must(`(async () => {
    wizardState.step = 'generate';
    wizardState.busy = '';
    await wizardSaveProject('configure');
    await wizardGenerateRun();
    await new Promise(r => setTimeout(r, 300));
    const back = document.querySelector('[data-wizard-action="back"]');
    const save = document.querySelector('[data-wizard-action="save-project"]');
    const content = Boolean(wizardState.gameSnapshot);
    if (save) save.click();
    await new Promise(r => setTimeout(r, 600));
    const toastEl = document.getElementById('toast');
    const toastText = toastEl ? toastEl.textContent.trim() : '';
    const toastShown = Boolean(toastEl && toastEl.classList.contains('show'));
    const backButton = document.querySelector('[data-wizard-action="back"]');
    if (backButton) backButton.click();
    await new Promise(r => setTimeout(r, 200));
    return {
      content,
      backPresent: Boolean(back),
      toastText, toastShown,
      stepAfterBack: wizardState.step,
      busy: wizardState.busy,
      error: wizardState.error ? wizardState.error.message : ''
    };
  })()`);
  check('T3 generation produced a draft and the content state has "← Cấu hình"', t3.content && t3.backPresent && !t3.error, JSON.stringify(t3));
  check('T3 saving progress shows a visible toast', t3.toastShown && /Đã lưu tiến trình dự án/.test(t3.toastText), JSON.stringify({ toast: t3.toastText, shown: t3.toastShown }));
  check('T3 the back button returns to configuration', t3.stepAfterBack === 'configure', t3.stepAfterBack);

  const adjust = await must(`(async () => {
    const key = wizardCapacityCountKey(wizardState.config.gameType);
    wizardState.config[key] = 5;
    wizardState.countTouched = false;
    await wizardSaveProject('generate');
    await wizardAutoAdjustCount({ counts: { requested: 5, found: 4, unit: 'mục' } });
    const saved = await window.eduGame.getProject(wizardState.projectId);
    return {
      key,
      configAfter: wizardState.config[key],
      savedAfter: saved && saved.config ? saved.config[key] : null,
      qualityRequested: wizardState.quality && wizardState.quality.counts ? wizardState.quality.counts.requested : null,
      toast: document.getElementById('toast') ? document.getElementById('toast').textContent : ''
    };
  })()`);
  check('T3b an untouched automatic count follows a 4-item draft', adjust.configAfter === 4 && adjust.savedAfter === 4, JSON.stringify(adjust));
  check('T3b the adjustment is announced and re-checks quality', /tự điều chỉnh/.test(adjust.toast) && adjust.qualityRequested === 4, JSON.stringify(adjust));

  // -- T4: "Tạo trò chơi ngay" gates generation behind confirmation ----------
  const quick = await must(`(async () => {
    wizardState.step = 'analyze';
    wizardState.quick = null;
    navigate('create-wizard');
    await new Promise(r => setTimeout(r, 250));
    const before = { draft: Boolean(wizardState.draft), snapshot: Boolean(wizardState.gameSnapshot) };
    const start = document.querySelector('[data-wizard-action="quick-generate"]');
    if (start) start.click();
    const started = Date.now();
    while (Date.now() - started < 8000 && !wizardState.quick && !wizardState.error) await new Promise(r => setTimeout(r, 100));
    const panel = document.querySelector('[data-wizard-quick="ready"]');
    const afterStart = {
      quick: wizardState.quick,
      step: wizardState.step,
      busy: wizardState.busy,
      draft: Boolean(wizardState.draft),
      snapshot: Boolean(wizardState.gameSnapshot),
      panelText: panel ? panel.textContent.replace(/\\s+/g, ' ').trim() : '',
      error: wizardState.error ? wizardState.error.message : ''
    };
    const cancel = document.querySelector('[data-wizard-action="quick-cancel"]');
    if (cancel) cancel.click();
    await new Promise(r => setTimeout(r, 200));
    return {
      before, afterStart,
      quickAfterCancel: wizardState.quick,
      panelAfterCancel: Boolean(document.querySelector('[data-wizard-quick="ready"]'))
    };
  })()`);
  check('T4 the quick flow prepares a genre/count without generating', Boolean(quick.afterStart.quick) && quick.afterStart.step === 'analyze' && !quick.afterStart.busy && !quick.afterStart.error && quick.afterStart.draft === quick.before.draft && quick.afterStart.snapshot === quick.before.snapshot, JSON.stringify(quick.afterStart));
  check('T4 the confirmation card states genre, count and mode', /Sẵn sàng tạo/.test(quick.afterStart.panelText) && /Fast|Thinking/.test(quick.afterStart.panelText), quick.afterStart.panelText.slice(0, 160));
  check('T4 cancel closes the card without generating', quick.quickAfterCancel === null && !quick.panelAfterCancel, JSON.stringify(quick));

  const nextClears = await must(`(async () => {
    const start = document.querySelector('[data-wizard-action="quick-generate"]');
    if (start) start.click();
    const started = Date.now();
    while (Date.now() - started < 8000 && !wizardState.quick) await new Promise(r => setTimeout(r, 100));
    const prepared = Boolean(wizardState.quick);
    const next = document.querySelector('[data-wizard-action="next"]');
    if (next) next.click();
    await new Promise(r => setTimeout(r, 600));
    return {
      prepared,
      quick: wizardState.quick,
      step: wizardState.step,
      error: wizardState.error ? wizardState.error.message : ''
    };
  })()`);
  check('T4 “Tiếp tục” discards the pending quick card', nextClears.prepared && nextClears.quick === null && nextClears.step === 'recommend' && !nextClears.error, JSON.stringify(nextClears));

  const quickConfirmed = await must(`(async () => {
    wizardState.step = 'analyze';
    wizardState.quick = null;
    navigate('create-wizard');
    await new Promise(r => setTimeout(r, 250));
    const start = document.querySelector('[data-wizard-action="quick-generate"]');
    if (start) start.click();
    const preparedAt = Date.now();
    while (Date.now() - preparedAt < 8000 && !wizardState.quick) await new Promise(r => setTimeout(r, 100));
    const confirm = document.querySelector('[data-wizard-action="quick-confirm"]');
    if (confirm) confirm.click();
    const started = Date.now();
    while (Date.now() - started < 20000 && (wizardState.busy || wizardState.step !== 'generate' || !wizardState.gameSnapshot)) {
      await new Promise(r => setTimeout(r, 150));
    }
    return {
      step: wizardState.step,
      quick: wizardState.quick,
      hasSnapshot: Boolean(wizardState.gameSnapshot),
      template: wizardState.gameSnapshot ? wizardState.gameSnapshot.template : '',
      counts: wizardState.quality && wizardState.quality.counts ? wizardState.quality.counts : null,
      error: wizardState.error ? wizardState.error.message : '',
      busy: wizardState.busy
    };
  })()`);
  check('T4 confirming the quick card runs generation and lands on step 5', quickConfirmed.step === 'generate' && quickConfirmed.quick === null && quickConfirmed.hasSnapshot && !quickConfirmed.busy && !quickConfirmed.error, JSON.stringify(quickConfirmed));

  // -- T5: a long project title stays inside the sidebar ---------------------
  const layout = await must(`(async () => {
    wizardState.step = 'input';
    wizardState.projects = [{
      id: 'project_smoke81_long', schemaVersion: 1, status: 'draft', step: 'input',
      title: 'Dự án giáo án quang hợp ở thực vật lớp 7 với tên rất rất dài để kiểm tra bố cục '.repeat(4),
      description: '', tags: [], sourceName: '', lesson: null, analysisId: null, recommendationId: null,
      config: null, draft: null, gameSnapshot: null, gameId: null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    }];
    navigate('create-wizard');
    await new Promise(r => setTimeout(r, 300));
    const list = document.getElementById('wizardProjectList');
    const action = list ? list.querySelector('.quick-action') : null;
    const copy = action ? action.querySelector('.quick-copy') : null;
    return {
      listClient: list ? list.clientWidth : 0,
      listScroll: list ? list.scrollWidth : 0,
      actionClient: action ? action.clientWidth : 0,
      actionScroll: action ? action.scrollWidth : 0,
      copyOverflow: copy ? getComputedStyle(copy).overflow : '',
      docScroll: document.documentElement.scrollWidth,
      viewport: window.innerWidth
    };
  })()`);
  check('T5 a long project title does not widen its list', layout.listScroll <= layout.listClient + 1 && layout.actionScroll <= layout.actionClient + 1, JSON.stringify(layout));
  check('T5 the page does not gain a horizontal scrollbar', layout.docScroll <= layout.viewport + 1, JSON.stringify({ doc: layout.docScroll, viewport: layout.viewport }));

  // -- T6: race light panels keep readable dark text ------------------------
  const race = await must(`(async () => {
    wizardDiscardGeneratedContent();
    wizardState.config = wizardDefaultConfig({ gameType: 'race', title: 'Smoke79 đua', suggestedQuestionCount: 5, suggestedDurationMinutes: 10, learningObjectiveIds: ['obj_1'] }, wizardState.analysis);
    wizardState.selectedGameType = 'race';
    wizardState.selectedRecommendationId = null;
    wizardState.step = 'generate';
    await wizardSaveProject('configure');
    await wizardGenerateRun();
    await new Promise(r => setTimeout(r, 300));
    if (!wizardState.gameSnapshot || wizardState.gameSnapshot.template !== 'race') {
      return { error: 'race generation failed', template: wizardState.gameSnapshot && wizardState.gameSnapshot.template, wizardError: wizardState.error ? wizardState.error.message : '' };
    }
    state.currentGame = wizardState.gameSnapshot;
    openRacePlay();
    await new Promise(r => setTimeout(r, 100));
    const turn = document.querySelector('.race-turn');
    const row = document.querySelector('.race-team-row');
    const hint = turn ? turn.querySelector('.small') : null;
    const result = {
      turnColor: turn ? getComputedStyle(turn).color : '',
      turnBackground: turn ? getComputedStyle(turn).backgroundColor : '',
      rowColor: row ? getComputedStyle(row).color : '',
      rowBackground: row ? getComputedStyle(row).backgroundColor : '',
      hintColor: hint ? getComputedStyle(hint).color : ''
    };
    const close = document.querySelector('[data-play-close]');
    if (close) close.click();
    return result;
  })()`);
  check('T6 race generation works for the contrast check', !race.error && Boolean(race.turnColor), JSON.stringify(race));
  check('T6 race turn panel uses dark text on a light card', race.turnColor === 'rgb(43, 48, 80)' && /rgb\(25[01], 25[01], 25[0-9]\)/.test(race.turnBackground || ''), JSON.stringify(race));
  check('T6 race team rows use dark text on white', race.rowColor === 'rgb(43, 48, 80)' && (race.rowBackground === 'rgb(255, 255, 255)' || race.rowBackground === 'rgb(244, 243, 255)'), JSON.stringify(race));
  check('T6 the race hint is readable grey, not inherited lavender/white', race.hintColor === 'rgb(91, 100, 120)', race.hintColor);

  const failed = results.filter(item => !item.pass);
  console.log(`\nsmoke81: ${results.length - failed.length}/${results.length} passed`);
  ws.close();
  process.exit(failed.length ? 1 : 0);
})().catch(error => {
  console.error('smoke81 crashed:', error);
  process.exit(1);
});
