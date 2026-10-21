// smoke78.js — O10 diagnostic log: run a generation on this machine, then export
// one .txt the teacher can send back.
//
// Run while the app is started with:
//   EDUGAME_USER_DATA=<empty folder> EDUGAME_AI_TEST_DIR=tests/fixtures/wizard/happy \
//     electron . --remote-debugging-port=9333
//   node tests/smoke78.js
//
// The fixture answers the full 4/4 ask, so the export must contain app.start and
// generate.start/done with the real requested/found counts, must not contain the
// lesson text, and must be readable from the returned absolute path.
const fs = require('node:fs');
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
    const document = await window.eduGame.saveLessonDocument({ name: 'smoke78.txt', ext: 'txt', text, characters: text.length });
    const analysis = {
      id: 'analysis_smoke78_' + stamp, schemaVersion: 1, documentId: document.id,
      subject: 'Sinh học', grade: 7, topic: 'Quang hợp ở thực vật',
      objectives: [
        { id: 'obj_1', description: 'Nêu vai trò của ánh sáng trong quang hợp.', cognitiveLevel: 'remember' },
        { id: 'obj_2', description: 'Giải thích vì sao cây thiếu ánh sáng sẽ vàng lá.', cognitiveLevel: 'apply' }
      ],
      keyConcepts: [{ id: 'concept_1', term: 'Quang hợp', explanation: 'Tổng hợp chất hữu cơ nhờ ánh sáng.' }],
      uncertainties: [], sourceDocumentIds: [document.id], createdAt: new Date().toISOString()
    };
    await window.eduGame.saveLessonAnalysis(analysis);
    const recommendation = { gameType: 'arena', title: 'Smoke78 đủ câu', rationale: 'kiểm thử', suggestedQuestionCount: 3, suggestedDurationMinutes: 10, learningObjectiveIds: ['obj_1'], difficulty: 'trung bình' };
    const config = wizardDefaultConfig(recommendation, analysis);
    const projectId = 'project_smoke78_' + stamp;
    await window.eduGame.saveProjectDraft({
      id: projectId, schemaVersion: 1, status: 'review', step: 'generate', title: config.title,
      description: analysis.topic, tags: [], sourceName: 'smoke78.txt',
      lesson: { documentId: document.id, name: 'smoke78.txt', characters: text.length },
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
  check('T2 fixture project asks for 3 questions', Boolean(setup && setup.projectId) && setup.questionCount === 3, JSON.stringify(setup));

  const run = await must(`(async () => {
    let outcome = null;
    try { await wizardGenerateRun(); outcome = 'done'; } catch (error) { outcome = 'error: ' + (error && error.message); }
    await new Promise(r => setTimeout(r, 300));
    return {
      outcome,
      questions: wizardState.gameSnapshot && wizardState.gameSnapshot.questions ? wizardState.gameSnapshot.questions.length : 0,
      error: wizardState.error ? wizardState.error.message : ''
    };
  })()`);
  check('T3 the fixture run produced a full draft', run.outcome === 'done' && run.questions === 3 && !run.error, run.outcome + ' ' + JSON.stringify(run));

  const panel = await must(`(async () => {
    navigate('settings');
    await new Promise(r => setTimeout(r, 600));
    const section = document.querySelector('[data-diagnostics-panel]');
    const exportBtn = document.querySelector('#exportDiagnosticsBtn');
    const folderBtn = document.querySelector('#openLogFolderBtn');
    const clearBtn = document.querySelector('#clearDiagnosticsBtn');
    const info = document.querySelector('#diagnosticsInfo');
    return {
      hasPanel: Boolean(section),
      text: section ? section.textContent.replace(/\\s+/g, ' ').trim() : '',
      hasExport: Boolean(exportBtn),
      hasFolder: Boolean(folderBtn),
      hasClear: Boolean(clearBtn),
      infoText: info ? info.textContent.replace(/\\s+/g, ' ').trim() : ''
    };
  })()`);
  check('T4 settings shows the diagnostics panel', panel.hasPanel && panel.hasExport && panel.hasFolder && panel.hasClear, JSON.stringify({ hasPanel: panel.hasPanel, hasExport: panel.hasExport, hasFolder: panel.hasFolder, hasClear: panel.hasClear }));
  check('T4 the panel explains what the log does (and does not) contain',
    /Chẩn đoán AI/.test(panel.text) && /không có nội dung giáo án/.test(panel.text) && /khóa API/.test(panel.text),
    panel.text.slice(0, 180));
  check('T4 the panel reports the log folder, size and retention', /Log trên máy: \d+ tệp/.test(panel.infoText) && /14 ngày/.test(panel.infoText), panel.infoText);

  const exported = await must(`(async () => {
    document.querySelector('#exportDiagnosticsBtn').click();
    const started = Date.now();
    while (Date.now() - started < 15000) {
      const code = document.querySelector('#diagnosticsResult code');
      if (code && code.textContent.trim()) return { path: code.textContent.trim(), text: document.querySelector('#diagnosticsResult').textContent };
      await new Promise(r => setTimeout(r, 150));
    }
    return { path: '', text: document.querySelector('#diagnosticsResult').textContent };
  })()`);
  check('T5 the export button reports a saved path', Boolean(exported.path), exported.text ? exported.text.slice(0, 160) : 'no result');
  if (process.env.EDUGAME_DIAGNOSTICS_DIR) {
    const expectedFolder = require('node:path').resolve(process.env.EDUGAME_DIAGNOSTICS_DIR);
    check('T5 the bundle is saved in the easy-to-find folder', exported.path ? require('node:path').dirname(exported.path) === expectedFolder : false, exported.path);
  }

  check('T6 the exported file exists on disk', Boolean(exported.path) && fs.existsSync(exported.path), exported.path);
  let bundle = '';
  try { bundle = exported.path ? fs.readFileSync(exported.path, 'utf8') : ''; } catch (error) { bundle = ''; }
  check('T6 the bundle has the human header', /EduGame Studio — gói chẩn đoán AI/.test(bundle) && /CPU:/.test(bundle) && /Model đã cài:/.test(bundle), bundle.split('\n').slice(0, 3).join(' | '));
  check('T6 the bundle records the app start', /"event":"app.start"/.test(bundle), bundle.includes('"event":"app.start"'));
  check('T6 the bundle records generate.start', /"event":"generate.start"/.test(bundle), bundle.includes('"event":"generate.start"'));
  const doneLine = bundle.split(/\r?\n/).find(line => line.includes('"event":"generate.done"') && line.includes(setup.projectId)) || '';
  check('T6 generate.done carries the requested/found counts', /"requested":3/.test(doneLine) && /"found":3/.test(doneLine) && /"attempts":1/.test(doneLine), doneLine.slice(0, 220));
  check('T7 the log never contains lesson text', bundle.length > 0 && !bundle.includes('tổng hợp chất hữu cơ'), bundle.includes('tổng hợp chất hữu cơ'));
  check('T7 no API key material in the bundle', !/sk-[A-Za-z0-9]{8,}/.test(bundle), '');

  const folder = await must(`window.eduGame.openDiagnosticsFolder()`);
  check('T8 open-folder returns the log directory', Boolean(folder && folder.ok && folder.path), JSON.stringify(folder));

  const cleared = await must(`(async () => {
    const button = document.querySelector('#clearDiagnosticsBtn');
    const result = document.querySelector('#diagnosticsResult');
    const before = button.textContent.trim();
    button.click();
    await new Promise(r => setTimeout(r, 120));
    const armed = button.textContent.trim();
    button.click();
    const started = Date.now();
    while (Date.now() - started < 10000) {
      const text = result.textContent;
      if (/Đã xóa \\d+ tệp log/.test(text)) {
        return { before, armed, text, info: document.querySelector('#diagnosticsInfo').textContent, again: button.textContent.trim() };
      }
      await new Promise(r => setTimeout(r, 150));
    }
    return { before, armed, text: result.textContent, info: document.querySelector('#diagnosticsInfo').textContent, again: button.textContent.trim() };
  })()`);
  check('T9 clear asks for a second click before deleting', /Xóa log/.test(cleared.before) && /Bấm lần nữa/.test(cleared.armed) && /Xóa log trên máy/.test(cleared.again), JSON.stringify({ before: cleared.before, armed: cleared.armed, again: cleared.again }));
  check('T9 the second click removes the app log files', /Đã xóa \d+ tệp log/.test(cleared.text), cleared.text);
  check('T9 only the clear marker remains after deleting', /Log trên máy: 1 tệp/.test(cleared.info), cleared.info);
  let remaining = '';
  const afterClear = await must(`window.eduGame.diagnosticsInfo()`);
  try {
    for (const name of fs.readdirSync(afterClear.folder)) {
      if (/^ai-.*\.jsonl$/.test(name)) remaining += fs.readFileSync(require('node:path').join(afterClear.folder, name), 'utf8');
    }
  } catch {}
  check('T9 the deleted log really is gone', remaining.includes('diagnostics.clear') && !remaining.includes('generate.done'), remaining.slice(0, 160));

  check('T10 no uncaught renderer exceptions', uncaught.length === 0, uncaught.slice(0, 2).join(' | '));
  check('T11 no console errors', consoleErrs.length === 0, consoleErrs.slice(0, 2).join(' | '));

  const failed = results.filter(r => !r.pass);
  console.log(`\nsmoke78: ${results.length - failed.length}/${results.length} passed`);
  ws.close();
  process.exit(failed.length ? 1 : 0);
})().catch(error => {
  console.error('smoke78 crashed:', error);
  process.exit(1);
});
