// Real-model e2e inside the actual Electron app.
// Requires a downloaded Qwen model + llama.cpp runtime in the isolated profile.
// Usage: node tests/real-ai-e2e.js
// Optional: CDP_PORT=9336
const PORT = Number(process.env.CDP_PORT || 9336);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const results = [];
function check(label, pass, extra) {
  results.push({ label, pass: Boolean(pass), extra: extra == null ? '' : String(extra) });
  console.log((pass ? 'PASS' : 'FAIL') + ' | ' + label + (extra != null && extra !== '' ? '  -> ' + extra : ''));
}
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
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    if (closed) return reject(new Error('CDP socket closed'));
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const must = async (expression, timeoutMs = 20 * 60 * 1000) => {
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
  const booted = await must(`(async () => {
    const started = Date.now();
    while (Date.now() - started < 30000) {
      if (typeof state !== 'undefined' && window.eduGame && document.querySelector('#pageContent')?.children.length) return true;
      await new Promise(r => setTimeout(r, 200));
    }
    return false;
  })()`);
  check('T0 renderer booted', booted, booted);

  try {
    const models = await must(`(async () => {
      const result = await window.eduGame.getLocalAiModels();
      return {
        models: result.models.map(model => ({ id: model.id, friendlyName: model.friendlyName, installed: model.installed })),
        machine: { runtimeInstalled: result.machine.runtimeInstalled, runtimeState: result.machine.runtimeState, runtimeModelId: result.machine.runtimeModelId }
      };
    })()`);
    const installed = (models.models || []).filter(model => model.installed);
    check('T1 an installed local model is present', installed.length > 0, JSON.stringify(models));
    check('T1 llama.cpp runtime is installed', Boolean(models.machine && models.machine.runtimeInstalled), JSON.stringify(models.machine));
    if (!installed.length) throw new Error('No installed model in this profile. Point EDUGAME_USER_DATA at a profile with ai-local models.');
    const preferred = installed.find(model => /3\.5-2b/i.test(model.id)) || installed[0];

    const runtime = await must(`(async () => {
      const started = Date.now();
      const result = await window.eduGame.startLocalRuntime(${JSON.stringify(preferred.id)});
      return { elapsedSeconds: Math.round((Date.now() - started) / 1000), machine: result.models.machine };
    })()`, 5 * 60 * 1000);
    check('T2 llama.cpp reports READY', runtime.machine && runtime.machine.runtimeState === 'READY', JSON.stringify(runtime));
    check('T2 runtime start finished in under 5 minutes', runtime.elapsedSeconds < 300, runtime.elapsedSeconds + 's');

    const cancelled = await must(`(async () => {
      const document = await window.eduGame.saveLessonDocument({
        name: 'real-ai-cancel.txt', ext: 'txt',
        text: 'Quang hợp là quá trình cây xanh tổng hợp chất hữu cơ nhờ ánh sáng. Hô hấp giải phóng năng lượng.',
        characters: 104
      });
      const requestId = 'real-e2e-cancel-' + Date.now();
      const request = window.eduGame.analyzeLesson({ documentId: document.id, requestId, mode: 'fast', force: true });
      await new Promise(r => setTimeout(r, 1200));
      const cancel = await window.eduGame.cancelAi(requestId);
      let error = '';
      try { await request; } catch (reason) { error = String((reason && reason.message) || reason); }
      const status = await window.eduGame.getLocalRuntimeStatus();
      return { cancel, error, runtimeState: status.state };
    })()`, 2 * 60 * 1000);
    check('T2b cancel mid-analysis reports a cancellation', /AI_CANCELLED|huỷ|hủy|cancel/i.test(cancelled.error || ''), (cancelled.error || '').slice(0, 180));
    check('T2b runtime survives cancellation', cancelled.runtimeState === 'READY', JSON.stringify(cancelled));

    const analyzed = await must(`(async () => {
      window.__realAiProgress = [];
      window.__realAiUnsubscribe = window.eduGame.onLessonProgress(value => window.__realAiProgress.push(value));
      const document = await window.eduGame.saveLessonDocument({
        name: 'real-ai-e2e.txt', ext: 'txt',
        text: 'Bài học: Quang hợp ở cây xanh. Quang hợp là quá trình lá cây sử dụng nước, khí carbon dioxide và năng lượng ánh sáng để tổng hợp chất hữu cơ, đồng thời giải phóng khí oxygen. Diệp lục là sắc tố hấp thụ ánh sáng. Hô hấp tế bào phân giải chất hữu cơ, giải phóng năng lượng cho hoạt động sống và tạo ra carbon dioxide, nước. Quang hợp và hô hấp là hai quá trình có quan hệ bổ sung: quang hợp tạo chất hữu cơ và oxygen, hô hấp sử dụng chất hữu cơ và oxygen. Cây xanh có vai trò quan trọng trong việc cân bằng khí oxygen và carbon dioxide trong không khí.',
        characters: 520
      });
      const startedAt = Date.now();
      const requestId = 'real-e2e-analysis-' + Date.now();
      const first = window.eduGame.analyzeLesson({ documentId: document.id, requestId, mode: 'fast', force: true });
      await new Promise(r => setTimeout(r, 700));
      let busy = '';
      try {
        await window.eduGame.analyzeLesson({ documentId: document.id, requestId: requestId + '-second', mode: 'fast', force: true });
      } catch (error) {
        busy = String((error && error.message) || error);
      }
      const result = await first;
      window.__realAiUnsubscribe && window.__realAiUnsubscribe();
      return {
        busy,
        documentId: document.id,
        analysisId: result.analysis && result.analysis.id,
        projectId: result.project && result.project.id,
        cached: Boolean(result.cached),
        analysisSeconds: Math.round((Date.now() - startedAt) / 1000),
        objectives: (result.analysis && result.analysis.objectives || []).length,
        concepts: (result.analysis && result.analysis.keyConcepts || []).length,
        subject: result.analysis && result.analysis.subject,
        topic: result.analysis && result.analysis.topic,
        progress: window.__realAiProgress,
        analysis: result.analysis
      };
    })()`, 10 * 60 * 1000);
    check('T3 concurrent analyze is rejected by the single-flight gate', /AI_BUSY|đang chạy/i.test(analyzed.busy || ''), (analyzed.busy || '').slice(0, 180));
    check('T3 real Qwen produced objectives', analyzed.objectives > 0, JSON.stringify({ objectives: analyzed.objectives, concepts: analyzed.concepts, subject: analyzed.subject, topic: analyzed.topic }));
    check('T3 real Qwen produced key concepts', analyzed.concepts > 0, analyzed.concepts);
    check('T3 analysis was not a cache hit', analyzed.cached === false, analyzed.cached);
    check('T3 analysis finished within 10 minutes', analyzed.analysisSeconds < 600, analyzed.analysisSeconds + 's');
    const stages = (analyzed.progress || []).map(item => item.stage);
    check('T3 progress reached ready', stages.includes('ready'), JSON.stringify(stages));

    const generated = await must(`(async () => {
      const analysis = ${JSON.stringify(analyzed.analysis)};
      const project = await window.eduGame.getProject(${JSON.stringify(analyzed.projectId)});
      const config = {
        gameType: 'arena',
        title: 'Kiểm tra Qwen thật',
        subject: analysis.subject || 'Sinh học',
        grade: String(analysis.grade || 6),
        topic: analysis.topic || 'Quang hợp',
        audience: 'teen', durationMinutes: 10, difficulty: 'trung bình',
        playMode: 'individual', style: 'fun',
        focusObjectiveIds: (analysis.objectives || []).slice(0, 1).map(item => item.id),
        generationMode: 'fast', questionCount: 4,
        scoringMode: 'basic', pointsPerCorrect: 100, timeBonus: 10
      };
      const savedProject = await window.eduGame.saveProjectDraft({ ...project, config, step: 'generate', status: 'ready' });
      const requestId = 'real-e2e-generate-' + Date.now();
      const startedAt = Date.now();
      window.__realAiGenProgress = [];
      const unsubscribe = window.eduGame.onLessonProgress(value => window.__realAiGenProgress.push(value));
      const result = await window.eduGame.generateLessonDraft({ projectId: savedProject.id, mode: 'fast', requestId, regenerate: true });
      unsubscribe && unsubscribe();
      return {
        projectId: savedProject.id,
        generationSeconds: Math.round((Date.now() - startedAt) / 1000),
        gameQuestions: result.game && result.game.questions ? result.game.questions.length : 0,
        cached: Boolean(result.cached),
        qualityErrors: (result.quality && result.quality.errors || []).length,
        qualityWarnings: (result.quality && result.quality.warnings || []).length,
        progress: window.__realAiGenProgress,
        game: result.game
      };
    })()`, 12 * 60 * 1000);
    check('T4 real Qwen generated the requested question count', generated.gameQuestions === 4, JSON.stringify({ game: generated.gameQuestions, seconds: generated.generationSeconds }));
    check('T4 generation finished within 12 minutes', generated.generationSeconds < 720, generated.generationSeconds + 's');
    check('T4 generated game passed the adapter', generated.game && Array.isArray(generated.game.questions) && generated.game.questions.every(item => item.prompt), JSON.stringify({ cached: generated.cached, qualityErrors: generated.qualityErrors, qualityWarnings: generated.qualityWarnings }));
    const generationStages = (generated.progress || []).map(item => item.stage);
    check('T4 generation progress reached ready', generationStages.includes('ready'), JSON.stringify(generationStages));

    const played = await must(`(async () => {
      const saved = await window.eduGame.saveGame(${JSON.stringify(generated.game)});
      await refreshDb();
      playGame(saved);
      await new Promise(r => setTimeout(r, 400));
      const body = document.querySelector('#playBody')?.innerText || '';
      const firstQuestion = saved.questions[0];
      return { savedId: saved.id, promptVisible: body.includes(firstQuestion.prompt.slice(0, 24)), answers: document.querySelectorAll('.answer-option').length };
    })()`);
    check('T5 generated game saves and opens in the player', played.promptVisible && played.answers >= 2, JSON.stringify(played));

    const cleanup = await must(`(async () => {
      if (${JSON.stringify(generated.game && generated.game.id)}) await window.eduGame.deleteGame(${JSON.stringify(generated.game && generated.game.id)});
      if (${JSON.stringify(analyzed.projectId)}) await window.eduGame.deleteProject(${JSON.stringify(analyzed.projectId)});
      const stop = await window.eduGame.stopLocalRuntime();
      await refreshDb();
      return { runtime: stop.models && stop.models.machine && stop.models.machine.runtimeState };
    })()`);
    check('T6 runtime stopped after the run', cleanup.runtime !== 'READY', JSON.stringify(cleanup));
  } finally {
    try { await must(`window.eduGame.stopLocalRuntime()`, 60 * 1000); } catch {}
    const failed = results.filter(item => !item.pass).length;
    console.log(`\n${results.length - failed}/${results.length} checks passed`);
    ws.close();
    process.exit(failed ? 1 : 0);
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
