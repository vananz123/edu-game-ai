// real-ai-status.js — real-model run that calibrates the wizard step-5 estimate
// and verifies the AI status bar while a real generation is in flight.
//
// Requires a profile with an installed Qwen model + llama.cpp runtime:
//   EDUGAME_USER_DATA=<profile with edugame-data/ai-local> \
//   electron . --remote-debugging-port=9336
//   node tests/real-ai-status.js
//
// Optional: CDP_PORT=9336, REAL_MODEL_ID=qwen3.5-2b-q4_0
const PORT = Number(process.env.CDP_PORT || 9336);
const MODEL_ID = process.env.REAL_MODEL_ID || 'qwen3.5-2b-q4_0';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const results = [];
function check(label, pass, extra) {
  results.push({ label, pass: Boolean(pass), extra: extra == null ? '' : String(extra) });
  console.log((pass ? 'PASS' : 'FAIL') + ' | ' + label + (extra != null && extra !== '' ? '  -> ' + extra : ''));
}
const uncaught = [];
const consoleErrs = [];

async function findTarget() {
  for (let index = 0; index < 90; index++) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await response.json();
      const target = list.find(item => item.type === 'page' && /index\.html/.test(item.url));
      if (target) return target;
    } catch {}
    await sleep(1000);
  }
  throw new Error('No CDP page on port ' + PORT);
}

(async () => {
  const target = await findTarget();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  let closed = false;
  ws.addEventListener('close', () => { closed = true; });
  let sequence = 0;
  const pending = new Map();
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const callbacks = pending.get(message.id);
      pending.delete(message.id);
      message.error ? callbacks.reject(new Error(message.error.message)) : callbacks.resolve(message.result);
      return;
    }
    if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params.exceptionDetails;
      uncaught.push((details.exception && details.exception.description) || details.text || 'unknown');
    } else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      consoleErrs.push(message.params.args.map(arg => arg.value ?? arg.description ?? '').join(' '));
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    if (closed) return reject(new Error('CDP socket closed'));
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const must = async (expression, timeoutMs = 15 * 60 * 1000) => {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Renderer evaluation timed out after ' + timeoutMs + ' ms')), timeoutMs);
    });
    try {
      const result = await Promise.race([
        send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }),
        timeout
      ]);
      if (result.exceptionDetails) {
        throw new Error((result.exceptionDetails.exception && result.exceptionDetails.exception.description) || result.exceptionDetails.text);
      }
      return result.result.value;
    } finally {
      clearTimeout(timer);
    }
  };
  await send('Runtime.enable');
  await send('Page.enable');

  const booted = await must(`(async () => {
    const started = Date.now();
    while (Date.now() - started < 30000) {
      if (typeof state !== 'undefined' && typeof wizardGenerateRun === 'function' && window.eduGame && document.querySelector('#pageContent')?.children.length) return true;
      await new Promise(r => setTimeout(r, 200));
    }
    return false;
  })()`);
  check('T0 renderer booted', booted, booted);

  try {
    const models = await must(`(async () => {
      const result = await window.eduGame.getLocalAiModels();
      return {
        installed: result.models.filter(model => model.installed).map(model => model.id),
        runtimeInstalled: result.machine.runtimeInstalled,
        runtimeState: result.machine.runtimeState
      };
    })()`);
    check('T1 a local model is installed', models.installed.includes(MODEL_ID), JSON.stringify(models));
    check('T1 llama.cpp runtime is installed', Boolean(models.runtimeInstalled), JSON.stringify(models));

    const runtime = await must(`(async () => {
      const started = Date.now();
      const result = await window.eduGame.startLocalRuntime(${JSON.stringify(MODEL_ID)});
      return { seconds: Math.round((Date.now() - started) / 1000), machine: result.models && result.models.machine };
    })()`, 6 * 60 * 1000);
    check('T2 llama.cpp reports READY', runtime.machine && runtime.machine.runtimeState === 'READY', JSON.stringify(runtime));

    const analyzed = await must(`(async () => {
      const text = 'Bài học: Quang hợp ở cây xanh. Quang hợp là quá trình lá cây sử dụng nước, khí carbon dioxide và năng lượng ánh sáng để tổng hợp chất hữu cơ, đồng thời giải phóng khí oxygen. Diệp lục là sắc tố hấp thụ ánh sáng. Hô hấp tế bào phân giải chất hữu cơ, giải phóng năng lượng cho hoạt động sống và tạo ra carbon dioxide, nước. Quang hợp và hô hấp là hai quá trình có quan hệ bổ sung: quang hợp tạo chất hữu cơ và oxygen, hô hấp sử dụng chất hữu cơ và oxygen.';
      const document = await window.eduGame.saveLessonDocument({ name: 'real-ai-status.txt', ext: 'txt', text, characters: text.length });
      const startedAt = Date.now();
      const requestId = 'real-status-analysis-' + Date.now();
      const result = await window.eduGame.analyzeLesson({ documentId: document.id, requestId, mode: 'fast', force: true });
      return {
        documentId: document.id,
        seconds: Math.round((Date.now() - startedAt) / 1000),
        analysis: result.analysis,
        projectId: result.project.id,
        cached: Boolean(result.cached)
      };
    })()`, 10 * 60 * 1000);
    check('T3 real Qwen completed the analysis', Boolean(analyzed.analysis && analyzed.analysis.objectives && analyzed.analysis.objectives.length), JSON.stringify({ seconds: analyzed.seconds, objectives: analyzed.analysis && analyzed.analysis.objectives && analyzed.analysis.objectives.length, cached: analyzed.cached }));

    const setup = await must(`(async () => {
      const analysis = ${JSON.stringify(analyzed.analysis)};
      const project = await window.eduGame.getProject(${JSON.stringify(analyzed.projectId)});
      const recommendation = {
        gameType: 'arena', title: 'Real status bar check', rationale: 'calibration',
        suggestedQuestionCount: 4, suggestedDurationMinutes: 10,
        learningObjectiveIds: (analysis.objectives || []).slice(0, 1).map(item => item.id),
        difficulty: 'trung bình'
      };
      const config = wizardDefaultConfig(recommendation, analysis);
      const saved = await window.eduGame.saveProjectDraft({ ...project, config, draft: null, gameSnapshot: null, gameId: null, step: 'generate', status: 'ready' });
      wizardState.documentId = ${JSON.stringify(analyzed.documentId)};
      wizardState.analysis = analysis;
      wizardState.analysisId = analysis.id;
      wizardState.config = config;
      wizardState.projectId = saved.id;
      wizardState.gameSnapshot = null;
      wizardState.busy = '';
      wizardState.step = 'generate';
      navigate('create-wizard');
      await new Promise(r => setTimeout(r, 400));
      return { projectId: saved.id, config: { mode: config.generationMode, count: config.questionCount } };
    })()`);
    check('T4 wizard is on step 5 with the real analysis', Boolean(setup && setup.projectId), JSON.stringify(setup));

    const sampleRun = `async function sampleRun(options, expectedMode) {
      const samples = [];
      const startedAt = Date.now();
      const run = wizardGenerateRun(options);
      while ((wizardState.busy === 'generate' || wizardState.busy === 'save') && Date.now() - startedAt < 14 * 60 * 1000) {
        const chip = document.getElementById('globalAiActivity');
        samples.push({
          t: Date.now() - startedAt,
          busy: wizardState.busy,
          stage: wizardState.lessonStage,
          vis: document.visibilityState,
          bar: (document.getElementById('aiStatusTask')?.textContent || '').trim(),
          chipVisible: chip ? !chip.hidden : false,
          chipLabel: (chip?.querySelector('[data-global-ai-label]')?.textContent || '').trim(),
          chipElapsed: (chip?.querySelector('[data-global-ai-elapsed]')?.textContent || '').trim(),
          timer: (document.querySelector('[data-wizard-generate-elapsed]')?.textContent || '').trim()
        });
        await new Promise(r => setTimeout(r, 900));
      }
      let error = '';
      try { await run; } catch (reason) { error = String((reason && reason.message) || reason); }
      await new Promise(r => setTimeout(r, 2200));
      const stages = [];
      for (const sample of samples) if (sample.stage && !stages.includes(sample.stage)) stages.push(sample.stage);
      return {
        samples,
        stages,
        mode: expectedMode,
        seconds: Math.round((Date.now() - startedAt) / 1000),
        error,
        after: {
          busy: wizardState.busy,
          timer: Boolean(document.querySelector('[data-wizard-generate-elapsed]')),
          chipHidden: document.getElementById('globalAiActivity') ? document.getElementById('globalAiActivity').hidden : true,
          bar: (document.getElementById('aiStatusTask')?.textContent || '').trim(),
          questions: wizardState.gameSnapshot && wizardState.gameSnapshot.questions ? wizardState.gameSnapshot.questions.length : 0,
          quality: wizardState.quality ? {
            errors: wizardState.quality.errors,
            warnings: wizardState.quality.warnings,
            counts: wizardState.quality.counts,
            canPublish: wizardState.quality.canPublish
          } : null,
          notice: wizardState.notice || '',
          wizardError: wizardState.error ? wizardState.error.message : ''
        }
      };
    }`;

    await send('Page.bringToFront');
    await sleep(500);
    const fast = await must(`(async () => {
      ${sampleRun}
      return sampleRun({ regenerate: true }, 'fast');
    })()`, 15 * 60 * 1000);

    // The renderer stops polling while the window is hidden/occluded, which is
    // intended; bring it back to the foreground before asserting the idle text.
    await send('Page.bringToFront');
    await sleep(300);
    const fastSettled = await must(`(async () => {
      await new Promise(r => setTimeout(r, 2600));
      const chip = document.getElementById('globalAiActivity');
      return {
        vis: document.visibilityState,
        bar: (document.getElementById('aiStatusTask')?.textContent || '').trim(),
        timer: Boolean(document.querySelector('[data-wizard-generate-elapsed]')),
        chipHidden: chip ? chip.hidden : true
      };
    })()`, 60 * 1000);
    Object.assign(fast.after, fastSettled);

    const fastTimers = fast.samples.map(sample => sample.timer).filter(Boolean);
    const fastBars = fast.samples.map(sample => sample.bar).filter(Boolean);
    check('T5 fast run finished without a wizard error', Boolean(fast.after.questions) && !fast.after.wizardError, JSON.stringify(fast.after));
    check('T5 fast run produced at least one question', fast.after.questions >= 1, fast.after.questions);
    check('T5 quality report keeps the requested count', Boolean(fast.after.quality && fast.after.quality.counts && fast.after.quality.counts.requested === 4), JSON.stringify(fast.after.quality));
    check('T5 a short draft is warned about, not silently accepted', fast.after.questions >= 4 || Boolean(fast.after.quality && fast.after.quality.warnings >= 1), JSON.stringify({ questions: fast.after.questions, quality: fast.after.quality }))
    check('T5 step 5 showed a live timer during the run', fastTimers.some(text => /Đã chạy \d+:\d\d · dự kiến \d+–\d+ phút/.test(text)), JSON.stringify(fastTimers.slice(0, 3)));
    check('T5 fast estimate stays in the 1–3 minute band', fastTimers.every(text => /dự kiến 1–3 phút/.test(text)), JSON.stringify([...new Set(fastTimers)]));
    check('T5 status bar showed a Vietnamese stage with elapsed time', fastBars.some(text => /đang |dùng lại/.test(text) && /\d+:\d\d/.test(text)), JSON.stringify(fastBars.slice(0, 4)));
    check('T5 top-bar chip read "AI đang tạo nội dung"', fast.samples.some(sample => sample.chipVisible && sample.chipLabel === 'AI đang tạo nội dung'), JSON.stringify(fast.samples.slice(0, 3)));
    check('T5 the bar/timer were cleared afterwards', !fast.after.timer && fast.after.chipHidden && /Không có tác vụ AI/.test(fast.after.bar), JSON.stringify(fast.after));

    await send('Page.bringToFront');
    await sleep(500);
    const deep = await must(`(async () => {
      ${sampleRun}
      wizardSetGenerationMode('deep');
      return sampleRun({ regenerate: true }, 'deep');
    })()`, 20 * 60 * 1000);

    await send('Page.bringToFront');
    await sleep(300);
    const deepSettled = await must(`(async () => {
      await new Promise(r => setTimeout(r, 2600));
      const chip = document.getElementById('globalAiActivity');
      return {
        vis: document.visibilityState,
        bar: (document.getElementById('aiStatusTask')?.textContent || '').trim(),
        timer: Boolean(document.querySelector('[data-wizard-generate-elapsed]')),
        chipHidden: chip ? chip.hidden : true
      };
    })()`, 60 * 1000);
    Object.assign(deep.after, deepSettled);

    const deepTimers = deep.samples.map(sample => sample.timer).filter(Boolean);
    const deepBars = deep.samples.map(sample => sample.bar).filter(Boolean);
    check('T6 thinking run finished', Boolean(deep.after.questions) && !deep.after.wizardError, JSON.stringify(deep.after));
    check('T6 thinking estimate stays in the 2–5 minute band', deepTimers.every(text => /dự kiến 2–5 phút/.test(text)), JSON.stringify([...new Set(deepTimers)]));
    check('T6 status bar also updated during the thinking run', deepBars.some(text => /đang |dùng lại/.test(text) && /\d+:\d\d/.test(text)), JSON.stringify(deepBars.slice(0, 4)));
    const deepClocks = deepBars
      .map(text => { const match = text.match(/(\d+):(\d\d)$/); return match ? Number(match[1]) * 60 + Number(match[2]) : -1; })
      .filter(value => value >= 0);
    check('T6 the bar restarted its clock for the thinking run', deepClocks.length > 0 && deepClocks.some(value => value <= 5) && Math.max(...deepClocks) >= 20, JSON.stringify(deepClocks.slice(-6)));
    check('T6 thinking run cleared the bar again', !deep.after.timer && deep.after.chipHidden && /Không có tác vụ AI/.test(deep.after.bar), JSON.stringify(deep.after));

    check('T7 no uncaught renderer exceptions', uncaught.length === 0, uncaught.slice(0, 2).join(' | '));
    check('T8 no console errors', consoleErrs.length === 0, consoleErrs.slice(0, 2).join(' | '));

    console.log('\nMEASURED (real Qwen ' + MODEL_ID + ')');
    console.log(JSON.stringify({
      runtimeStartSeconds: runtime.seconds,
      analysisSeconds: analyzed.seconds,
      fast: { seconds: fast.seconds, questions: fast.after.questions, quality: fast.after.quality, stages: fast.stages, visibility: [...new Set(fast.samples.map(sample => sample.vis))], timerSamples: fastTimers.length, firstTimer: fastTimers[0], lastTimer: fastTimers[fastTimers.length - 1], bars: fastBars.slice(0, 4) },
      deep: { seconds: deep.seconds, questions: deep.after.questions, quality: deep.after.quality, stages: deep.stages, visibility: [...new Set(deep.samples.map(sample => sample.vis))], timerSamples: deepTimers.length, firstTimer: deepTimers[0], lastTimer: deepTimers[deepTimers.length - 1], bars: deepBars.slice(0, 4) }
    }, null, 2));
  } finally {
    try { await must('window.eduGame.stopLocalRuntime()', 60 * 1000); } catch {}
    const failed = results.filter(item => !item.pass).length;
    console.log(`\n${results.length - failed}/${results.length} checks passed`);
    ws.close();
    process.exit(failed ? 1 : 0);
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
