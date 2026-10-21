// smoke77.js — under-delivery (O9): the model returns a valid but short draft.
//
// Run while the app is started with:
//   EDUGAME_USER_DATA=<empty folder> EDUGAME_AI_TEST_DIR=tests/fixtures/wizard/short \
//     electron . --remote-debugging-port=9333
//   node tests/smoke77.js
//
// The fixture answers 1 of 4 requested questions. The generator retries once
// (which returns the same short fixture), so this also covers "still short after
// the retry": the teacher must see the exact shortfall and a one-click retry,
// while saving stays allowed (DECISIONS #21).
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
      if (typeof wizardState !== 'undefined' && typeof wizardGenerateRun === 'function' && window.eduGame && document.querySelector('#pageContent')?.children.length) return true;
      await new Promise(r => setTimeout(r, 200));
    }
    return false;
  })()`);
  check('T1 renderer booted', booted, booted);

  const setup = await must(`(async () => {
    const stamp = String(Date.now());
    const text = 'Quang hợp là quá trình thực vật tổng hợp chất hữu cơ nhờ năng lượng ánh sáng mặt trời. Quá trình này tạo ra oxy và tích lũy chất hữu cơ nuôi cây.';
    const document = await window.eduGame.saveLessonDocument({ name: 'smoke77.txt', ext: 'txt', text, characters: text.length });
    const analysis = {
      id: 'analysis_smoke77_' + stamp, schemaVersion: 1, documentId: document.id,
      subject: 'Sinh học', grade: 7, topic: 'Quang hợp ở thực vật',
      objectives: [
        { id: 'obj_1', description: 'Nêu vai trò của ánh sáng trong quang hợp.', cognitiveLevel: 'remember' },
        { id: 'obj_2', description: 'Giải thích vì sao cây thiếu ánh sáng sẽ vàng lá.', cognitiveLevel: 'apply' }
      ],
      keyConcepts: [{ id: 'concept_1', term: 'Quang hợp', explanation: 'Tổng hợp chất hữu cơ nhờ ánh sáng.' }],
      uncertainties: [], sourceDocumentIds: [document.id], createdAt: new Date().toISOString()
    };
    await window.eduGame.saveLessonAnalysis(analysis);
    const recommendation = { gameType: 'arena', title: 'Smoke77 thiếu câu', rationale: 'kiểm thử', suggestedQuestionCount: 4, suggestedDurationMinutes: 10, learningObjectiveIds: ['obj_1'], difficulty: 'trung bình' };
    const config = wizardDefaultConfig(recommendation, analysis);
    const projectId = 'project_smoke77_' + stamp;
    await window.eduGame.saveProjectDraft({
      id: projectId, schemaVersion: 1, status: 'review', step: 'generate', title: config.title,
      description: analysis.topic, tags: [], sourceName: 'smoke77.txt',
      lesson: { documentId: document.id, name: 'smoke77.txt', characters: text.length },
      analysisId: analysis.id, recommendationId: null, config, draft: null, gameSnapshot: null, gameId: null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    });
    wizardState.documentId = document.id;
    wizardState.analysis = analysis;
    wizardState.analysisId = analysis.id;
    wizardState.config = config;
    wizardState.projectId = projectId;
    wizardState.gameSnapshot = null;
    wizardState.busy = '';
    wizardState.step = 'generate';
    navigate('create-wizard');
    await new Promise(r => setTimeout(r, 300));
    return { projectId, questionCount: config.questionCount };
  })()`);
  check('T2 fixture project asks for 4 questions', Boolean(setup && setup.projectId) && setup.questionCount === 4, JSON.stringify(setup));

  const run = await must(`(async () => {
    let outcome = null;
    try { await wizardGenerateRun(); outcome = 'done'; } catch (error) { outcome = 'error: ' + (error && error.message); }
    await new Promise(r => setTimeout(r, 300));
    const banner = document.querySelector('[data-wizard-shortfall]');
    const retry = banner ? banner.querySelector('[data-wizard-action="regenerate"]') : null;
    const save = document.querySelector('[data-wizard-action="save-game"]');
    const panel = document.querySelector('[data-wizard-quality]');
    return {
      outcome,
      hasSnapshot: Boolean(wizardState.gameSnapshot),
      questions: wizardState.gameSnapshot && wizardState.gameSnapshot.questions ? wizardState.gameSnapshot.questions.length : 0,
      counts: wizardState.quality && wizardState.quality.counts,
      bannerCount: banner ? banner.getAttribute('data-wizard-shortfall') : '',
      bannerRole: banner ? banner.getAttribute('role') : '',
      bannerText: banner ? banner.textContent.replace(/\\s+/g, ' ').trim() : '',
      retryEnabled: Boolean(retry) && !retry.disabled,
      retryLabel: retry ? retry.textContent.trim() : '',
      saveEnabled: Boolean(save) && !save.disabled,
      qualityText: panel ? panel.textContent.replace(/\\s+/g, ' ').trim() : '',
      error: wizardState.error ? wizardState.error.message : ''
    };
  })()`);

  check('T3 the run completed and produced a short draft', run.outcome === 'done' && run.hasSnapshot && !run.error, run.outcome + ' ' + JSON.stringify({ questions: run.questions, counts: run.counts, error: run.error }));
  check('T3 the draft really has 1 of 4 questions', run.questions === 1 && run.counts && run.counts.requested === 4 && run.counts.found === 1, JSON.stringify(run.counts));
  check('T4 a role="alert" banner shows the exact shortfall', run.bannerCount === '1/4' && run.bannerRole === 'alert' && /AI mới tạo 1\/4 câu hỏi/.test(run.bannerText) && /còn thiếu 3/.test(run.bannerText), run.bannerText);
  check('T4 the banner offers a one-click retry', run.retryEnabled && /Tạo lại cho đủ 4 câu hỏi/.test(run.retryLabel), run.retryLabel);
  check('T5 the advisory panel still lists the count warning', /Có 1\/4 câu hỏi theo cấu hình/.test(run.qualityText), run.qualityText.slice(0, 160));
  check('T5 saving stays allowed (advisory, DECISIONS #21)', run.saveEnabled, run.saveEnabled);

  const matched = await must(`(async () => {
    wizardState.quality = { ...wizardState.quality, counts: { ...wizardState.quality.counts, found: 4 } };
    navigate('create-wizard');
    await new Promise(r => setTimeout(r, 250));
    return {
      banner: Boolean(document.querySelector('[data-wizard-shortfall]')),
      hasContent: Boolean(wizardState.gameSnapshot)
    };
  })()`);
  check('T6 no banner once the counts match', !matched.banner && matched.hasContent, JSON.stringify(matched));

  check('T7 no uncaught renderer exceptions', uncaught.length === 0, uncaught.slice(0, 2).join(' | '));
  check('T8 no console errors', consoleErrs.length === 0, consoleErrs.slice(0, 2).join(' | '));

  const failed = results.filter(r => !r.pass);
  console.log(`\nsmoke77: ${results.length - failed.length}/${results.length} passed`);
  ws.close();
  process.exit(failed.length ? 1 : 0);
})().catch(error => {
  console.error('smoke77 crashed:', error);
  process.exit(1);
});
