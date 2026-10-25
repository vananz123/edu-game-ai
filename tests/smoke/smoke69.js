// smoke69.js - CDP smoke for update_plan_2 groups A/B/G + three-area UI.
// Run while the app is started with --remote-debugging-port=9334.
const fs = require('node:fs');
const PORT = 9334;
const RUN_ID = Date.now().toString(36);
const DOC_NAME = `smoke69-giao-an-${RUN_ID}.txt`;
const ANALYSIS_ID = `analysis_smoke69_${RUN_ID}`;
const GAME_ID = `smoke69-game-${RUN_ID}`;
const SCENARIO_ID = `smoke69-scenario-${RUN_ID}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
function check(label, pass, extra) {
  results.push({ label, pass: Boolean(pass), extra: extra == null ? '' : String(extra) });
  console.log((pass ? 'PASS' : 'FAIL') + ' | ' + label + (extra != null && extra !== '' ? '  -> ' + extra : ''));
}
const uncaught = [], consoleErrs = [], logErrs = [];

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
    } else if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
      logErrs.push(message.params.entry.text);
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
  await send('Log.enable');
  await sleep(300);

  const booted = await must(`(async () => {
    const started = Date.now();
    while (Date.now() - started < 30000) {
      if (typeof state !== 'undefined' && typeof navigate === 'function' && window.eduGame && document.querySelector('#pageContent')?.children.length) return true;
      await new Promise(r => setTimeout(r, 200));
    }
    return false;
  })()`);
  check('T0 renderer booted', booted, booted);

  // T1 - save a lesson source + analysis and browse/reopen it without AI.
  const setup = await must(`(async () => {
    const document = await window.eduGame.saveLessonDocument({
      name: ${JSON.stringify(DOC_NAME)}, ext: 'txt',
      text: 'Quang hợp là quá trình cây xanh tổng hợp chất hữu cơ nhờ ánh sáng. Hô hấp giải phóng năng lượng.',
      characters: 104
    });
    const analysis = {
      id: ${JSON.stringify(ANALYSIS_ID)}, schemaVersion: 1, documentId: document.id,
      subject: 'Sinh học', grade: 6, topic: 'Quang hợp và hô hấp',
      objectives: [{ id: 'o1', description: 'Phân biệt quang hợp và hô hấp.' }],
      keyConcepts: [{ id: 'k1', term: 'Quang hợp', explanation: 'Tổng hợp chất hữu cơ nhờ ánh sáng.' }],
      uncertainties: [], sourceDocumentIds: [document.id], createdAt: new Date().toISOString()
    };
    await window.eduGame.saveLessonAnalysis(analysis);
    return { document, analysis };
  })()`);
  check('T1 lesson source saved', Boolean(setup && setup.document && setup.document.id), setup && setup.document && setup.document.id);
  check('T1 analysis saved', Boolean(setup && setup.analysis && setup.analysis.id), setup && setup.analysis && setup.analysis.id);

  await must(`(async () => {
    navigate('lesson-plans');
    const started = Date.now();
    while (Date.now() - started < 10000 && !Array.isArray(state.lessonLibrary)) await new Promise(r => setTimeout(r, 100));
    await new Promise(r => setTimeout(r, 250));
    return true;
  })()`);
  const lessonPage = await must(`({
    hasDoc: !!Array.from(document.querySelectorAll('[data-lesson-id]')).find(el => el.textContent.includes(${JSON.stringify(DOC_NAME)})),
    hasAnalysis: !!Array.from(document.querySelectorAll('[data-lesson-id]')).find(el => el.textContent.includes('Quang hợp và hô hấp')),
    hasAnalysisLabel: document.body.innerText.includes('KẾT QUẢ PHÂN TÍCH'),
    hasDeepResearch: document.body.innerText.includes('Hỏi đáp chuyên sâu') && document.body.innerText.toLowerCase().includes('chưa khả dụng'),
    createButton: !!document.querySelector('[data-action="create-from-lesson"]')
  })`);
  check('T1 Giáo án lists saved source', lessonPage.hasDoc, JSON.stringify(lessonPage));
  check('T1 Giáo án shows saved analysis', lessonPage.hasAnalysis && lessonPage.hasAnalysisLabel, JSON.stringify(lessonPage));
  check('T1 deep Q&A placeholder is inert', lessonPage.hasDeepResearch, JSON.stringify(lessonPage));
  check('T1 create-game-from-lesson action exists', lessonPage.createButton, '');

  // T2 - start a new game from cached analysis; project appears in Dự án của tôi.
  await must(`(async () => {
    const button = Array.from(document.querySelectorAll('[data-action="create-from-lesson"]')).find(el => el.closest('[data-lesson-id]')?.textContent.includes(${JSON.stringify(DOC_NAME)}));
    if (button) button.click();
    const started = Date.now();
    while (Date.now() - started < 15000) {
      if (state.page === 'create-wizard' && wizardState.step === 'recommend' && !wizardState.busy && wizardState.projectId) return true;
      await new Promise(r => setTimeout(r, 150));
    }
    return false;
  })()`);
  const wizardFromLesson = await must(`({ step: wizardState.step, analysisId: wizardState.analysisId, projectId: wizardState.projectId, busy: wizardState.busy })`);
  check('T2 create-from-lesson reuses analysis and opens category step', wizardFromLesson.step === 'recommend' && wizardFromLesson.analysisId === ANALYSIS_ID, JSON.stringify(wizardFromLesson));

  await must(`(async () => {
    navigate('my-projects');
    const started = Date.now();
    while (Date.now() - started < 10000 && !Array.isArray(state.projects)) await new Promise(r => setTimeout(r, 100));
    await new Promise(r => setTimeout(r, 250));
    return true;
  })()`);
  const projectPage = await must(`({
    count: Array.isArray(state.projects) ? state.projects.length : -1,
    cards: document.querySelectorAll('[data-action="open-project"]').length,
    hasProject: !!Array.from(document.querySelectorAll('[data-action="open-project"]')).find(el => el.dataset.id === wizardState.projectId),
    noLibraryConfusion: document.body.innerText.includes('Trò chơi đã lưu để chơi nằm trong') || document.body.innerText.includes('Thư viện trò chơi')
  })`);
  check('T2 Dự án của tôi lists GameProject row', projectPage.count >= 1 && projectPage.cards >= 1 && projectPage.hasProject, JSON.stringify(projectPage));
  check('T2 project page explains separation from library', projectPage.noLibraryConfusion, '');

  const reopened = await must(`(async () => {
    const button = Array.from(document.querySelectorAll('[data-action="open-project"]')).find(el => el.dataset.id === wizardState.projectId);
    const projectId = wizardState.projectId;
    if (button) button.click();
    const started = Date.now();
    while (Date.now() - started < 15000) {
      if (state.page === 'create-wizard' && !wizardState.busy && wizardState.projectId === projectId && wizardState.analysisId === ${JSON.stringify(ANALYSIS_ID)}) return true;
      await new Promise(r => setTimeout(r, 150));
    }
    return false;
  })()`);
  check('T2 saved project reopens with lesson analysis', reopened, reopened);

  // T3 - play a two-question arena: true/false + text input, then auto-save result.
  const game = await must(`(async () => {
    const game = {
      id: ${JSON.stringify(GAME_ID)}, title: 'SMOKE 69 Đấu trường', subject: 'Sinh học', grade: 'Lớp 6', topic: 'Quang hợp',
      template: 'quiz', description: 'Smoke true/false, text input, result history.', tags: ['SMOKE'], sourceName: ${JSON.stringify(DOC_NAME)},
      gameSetup: { difficulty: 'trung bình', duration: '10', scoringMode: 'cơ bản', players: 'cá nhân', pointsPerCorrect: '100', timeBonus: '5', style: 'trò chơi' },
      questions: [
        { id: 'q1', type: 'true-false', prompt: 'Quang hợp tổng hợp chất hữu cơ nhờ ánh sáng.', options: [{ id: 'a', text: 'Đúng' }, { id: 'b', text: 'Sai' }], correctOptionId: 'a', explanation: 'Đúng.', points: 100 },
        { id: 'q2', type: 'fill-in-blank', prompt: 'Quá trình cây tạo chất hữu cơ gọi là ...', options: [], correctOptionId: '', correctAnswer: 'quang hợp', alternateAnswers: ['quang hop'], explanation: 'Quang hợp.', points: 100 }
      ]
    };
    const saved = await window.eduGame.saveGame(game);
    await window.eduGame.saveGame(game);
    await window.eduGame.saveGame(game);
    const library = await window.eduGame.getLibrary();
    await refreshDb();
    playGame(saved);
    await new Promise(r => setTimeout(r, 300));
    const grid = document.querySelector('.answer-grid');
    return { saved: saved.id, gameRows: library.games.filter(item => item.id === game.id).length, trueFalseClass: grid && grid.classList.contains('true-false-grid'), marks: Array.from(document.querySelectorAll('.answer-option .letter')).map(el => el.textContent) };
  })()`);
  check('T3 true/false renders two explicit choices', game.trueFalseClass === true && game.marks.join('') === '✓✗', JSON.stringify(game));
  check('T3 repeated game save keeps one row', game.gameRows === 1, JSON.stringify({ gameRows: game.gameRows }));

  const textStyle = await must(`(async () => {
    document.querySelector('.answer-option[data-answer="a"]').click();
    document.querySelector('#nextQuestionBtn').click();
    await new Promise(r => setTimeout(r, 250));
    const input = document.querySelector('#textAnswerInput');
    if (!input) return { missing: true };
    const style = getComputedStyle(input);
    return { color: style.color, background: style.backgroundColor, caret: style.caretColor, focused: document.activeElement === input };
  })()`);
  const readable = textStyle && !textStyle.missing && textStyle.color !== 'rgb(255, 255, 255)' && textStyle.background !== 'rgba(0, 0, 0, 0)' && textStyle.caret !== 'auto';
  check('T3 arena text input is readable/focused', readable, JSON.stringify(textStyle));

  const autoSaved = await must(`(async () => {
    window.prompt = () => 'Học sinh A';
    const before = state.db.sessions.filter(s => s.gameId === ${JSON.stringify(GAME_ID)}).length;
    const input = document.querySelector('#textAnswerInput');
    input.value = 'quang hợp';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#textAnswerBtn').click();
    document.querySelector('#nextQuestionBtn').click();
    const started = Date.now();
    while (Date.now() - started < 10000) {
      const rows = state.db.sessions.filter(s => s.gameId === ${JSON.stringify(GAME_ID)});
      const status = document.querySelector('#resultSaveStatus');
      if (rows.length === 1 && status && /Đã tự lưu/.test(status.textContent)) {
        const id = rows[0].id;
        document.querySelector('#saveResultBtn').click();
        await new Promise(r => setTimeout(r, 800));
        const after = state.db.sessions.filter(s => s.gameId === ${JSON.stringify(GAME_ID)});
        return { before, id, afterCount: after.length, sameId: after[0] && after[0].id === id, player: after[0] && after[0].playerName, status: status.textContent };
      }
      await new Promise(r => setTimeout(r, 200));
    }
    return { before, timeout: true };
  })()`);
  check('T3 result auto-saves exactly one session', autoSaved && autoSaved.afterCount === 1 && autoSaved.sameId === true, JSON.stringify(autoSaved));
  check('T3 rename updates the same session', autoSaved && autoSaved.player === 'Học sinh A', JSON.stringify(autoSaved));

  await must(`(async () => { navigate('sessions'); await new Promise(r => setTimeout(r, 250)); return true; })()`);
  const history = await must(`({ text: document.querySelector('#pageContent').innerText, rows: state.db.sessions.filter(s => s.gameId === ${JSON.stringify(GAME_ID)}).length })`);
  check('T3 result history displays actual session', history.rows === 1 && history.text.includes('Học sinh A'), JSON.stringify({ rows: history.rows, hasGame: history.text.includes('SMOKE 69') }));

  // T4 - external .egame import is hidden on every page; project deletion keeps library game.
  const importEntries = await must(`(async () => {
    navigate('home'); await new Promise(r => setTimeout(r, 100)); const home = document.querySelectorAll('[data-action="import-game"]').length;
    navigate('library'); await new Promise(r => setTimeout(r, 100)); const library = document.querySelectorAll('[data-action="import-game"]').length;
    navigate('settings'); await new Promise(r => setTimeout(r, 100)); const settings = document.querySelectorAll('[data-action="import-game"]').length;
    return { home, library, settings };
  })()`);
  check('T4 .egame import entries hidden', importEntries.home === 0 && importEntries.library === 0 && importEntries.settings === 0, JSON.stringify(importEntries));

  const preserved = await must(`(async () => {
    const projectId = ${JSON.stringify(wizardFromLesson.projectId || '')};
    await window.eduGame.deleteProject(projectId);
    const library = await window.eduGame.getLibrary();
    return { projectId, gameStillThere: library.games.some(g => g.id === ${JSON.stringify(GAME_ID)}) };
  })()`);
  check('T4 deleting project keeps saved library game', preserved.gameStillThere === true, JSON.stringify(preserved));
  await must(`(async () => {
    await window.eduGame.deleteGame(${JSON.stringify(GAME_ID)});
    await window.eduGame.deleteGame(${JSON.stringify(SCENARIO_ID)});
    await refreshDb();
    return true;
  })()`);

  const report = { port: PORT, results, uncaught, consoleErrs, logErrs };
  fs.writeFileSync('smoke69-report.json', JSON.stringify(report, null, 2));
  const failed = results.filter(item => !item.pass).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  if (uncaught.length || consoleErrs.length || logErrs.length) {
    console.log('Renderer errors:', JSON.stringify({ uncaught, consoleErrs, logErrs }, null, 2));
  }
  ws.close();
  process.exit(failed ? 1 : 0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
