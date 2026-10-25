// smoke76.js — real generation through the wizard's step-5 code path using the
// canned model fixtures (EDUGAME_AI_TEST_DIR), so the elapsed clock and the
// top-bar chip are driven by the production `wizardGenerateRun()` wiring.
//
// Run while the app is started with:
//   EDUGAME_USER_DATA=<empty folder> EDUGAME_AI_TEST_DIR=tests/fixtures/wizard/happy \
//     electron . --remote-debugging-port=9333
//   node tests/smoke/smoke76.js
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
    const document = await window.eduGame.saveLessonDocument({ name: 'smoke76.txt', ext: 'txt', text, characters: text.length });
    const analysis = {
      id: 'analysis_smoke76_' + stamp, schemaVersion: 1, documentId: document.id,
      subject: 'Sinh học', grade: 7, topic: 'Quang hợp ở thực vật',
      objectives: [
        { id: 'obj_1', description: 'Nêu vai trò của ánh sáng trong quang hợp.', cognitiveLevel: 'remember' },
        { id: 'obj_2', description: 'Giải thích vì sao cây thiếu ánh sáng sẽ vàng lá.', cognitiveLevel: 'apply' }
      ],
      keyConcepts: [{ id: 'concept_1', term: 'Quang hợp', explanation: 'Tổng hợp chất hữu cơ nhờ ánh sáng.' }],
      uncertainties: [], sourceDocumentIds: [document.id], createdAt: new Date().toISOString()
    };
    await window.eduGame.saveLessonAnalysis(analysis);
    const recommendation = { gameType: 'arena', title: 'Smoke76 Quang hợp', rationale: 'kiểm thử', suggestedQuestionCount: 3, suggestedDurationMinutes: 10, learningObjectiveIds: ['obj_1'], difficulty: 'trung bình' };
    const config = wizardDefaultConfig(recommendation, analysis);
    // The canned model returns 3 questions and this smoke is about the clock, not
    // counts; keep a deliberate manual count (the automatic floor is 4 now).
    config.questionCount = 3;
    const projectId = 'project_smoke76_' + stamp;
    await window.eduGame.saveProjectDraft({
      id: projectId, schemaVersion: 1, status: 'review', step: 'generate', title: config.title,
      description: analysis.topic, tags: [], sourceName: 'smoke76.txt',
      lesson: { documentId: document.id, name: 'smoke76.txt', characters: text.length },
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
    return { projectId, gameType: config.gameType };
  })()`);
  check('T2 fixture project created', Boolean(setup && setup.projectId), JSON.stringify(setup));

  // Start the real wizard run and sample the DOM/clock synchronously (the run
  // awaits IPC only after it has rendered the busy state).
  const during = await must(`(async () => {
    const run = wizardGenerateRun();
    const elapsed = document.querySelector('[data-wizard-generate-elapsed]');
    const chip = document.getElementById('globalAiActivity');
    const snapshot = {
      busy: wizardState.busy,
      stage: wizardState.lessonStage,
      timerText: elapsed ? elapsed.textContent : '',
      chipHidden: chip ? chip.hidden : true,
      chipLabel: chip ? (chip.querySelector('[data-global-ai-label]')?.textContent || '') : '',
      started: Boolean(wizardState.generationStartedAt)
    };
    let outcome = null;
    try { await run; outcome = 'done'; } catch (error) { outcome = 'error: ' + (error && error.message); }
    await new Promise(r => setTimeout(r, 250));
    const afterElapsed = document.querySelector('[data-wizard-generate-elapsed]');
    return {
      snapshot, outcome,
      after: {
        busy: wizardState.busy,
        stage: wizardState.lessonStage,
        started: Boolean(wizardState.generationStartedAt),
        timer: Boolean(afterElapsed),
        chipHidden: document.getElementById('globalAiActivity') ? document.getElementById('globalAiActivity').hidden : true,
        hasSnapshot: Boolean(wizardState.gameSnapshot),
        error: wizardState.error ? wizardState.error.message : '',
        notice: wizardState.notice || ''
      }
    };
  })()`);

  check('T3 run enters the generating state with a real clock', during.snapshot.busy === 'generate' && during.snapshot.started, JSON.stringify(during.snapshot));
  check('T3 the timer starts at 0:00 with the estimate', /Đã chạy 0:0\d · dự kiến \d+–\d+ phút/.test(during.snapshot.timerText), during.snapshot.timerText);
  check('T3 top-bar chip switches to "AI đang tạo nội dung"', !during.snapshot.chipHidden && during.snapshot.chipLabel === 'AI đang tạo nội dung', JSON.stringify(during.snapshot));
  check('T4 fixture generation completes', during.outcome === 'done' && during.after.hasSnapshot, during.outcome + ' ' + JSON.stringify(during.after));
  check('T4 clock stops and the timer is gone', !during.after.busy && !during.after.timer && !during.after.started, JSON.stringify(during.after));
  check('T4 chip is hidden again after the run', during.after.chipHidden, JSON.stringify(during.after));
  check('T4 no wizard error after the run', !during.after.error, during.after.error);

  const shortfallBanner = await must(`(async () => {
    const banner = document.querySelector('[data-wizard-shortfall]');
    return { banner: Boolean(banner), text: banner ? banner.textContent.trim() : '' };
  })()`);
  check('T4 a complete draft shows no shortfall banner', !shortfallBanner.banner, JSON.stringify(shortfallBanner));

  check('T5 no uncaught renderer exceptions', uncaught.length === 0, uncaught.slice(0, 2).join(' | '));
  check('T6 no console errors', consoleErrs.length === 0, consoleErrs.slice(0, 2).join(' | '));

  const failed = results.filter(r => !r.pass);
  console.log(`\nsmoke76: ${results.length - failed.length}/${results.length} passed`);
  ws.close();
  process.exit(failed.length ? 1 : 0);
})().catch(error => {
  console.error('smoke76 crashed:', error);
  process.exit(1);
});
