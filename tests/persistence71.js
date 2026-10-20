// persistence71.js - two-phase persistence smoke (close/reopen the app).
// Phase 1 writes synthetic lesson/analysis/project/game/session rows.
// Phase 2 runs in a new app process with the same profile and reads them back.
// Usage: PHASE=write node tests/persistence71.js
//        PHASE=verify node tests/persistence71.js
const fs = require('node:fs');
const PORT = Number(process.env.CDP_PORT || 9335);
const PHASE = process.env.PHASE || 'write';
const RUN_ID = process.env.PERSIST_ID || 'persist71';
const DOC_NAME = `persist71-${RUN_ID}.txt`;
const STATE_FILE = 'persistence71-state.json';
const previousState = PHASE === 'verify' ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : null;
const DOC_ID = previousState ? previousState.documentId : '';
const ANALYSIS_ID = `analysis_${RUN_ID}`;
const PROJECT_ID = `project_${RUN_ID}`;
const GAME_ID = `game_${RUN_ID}`;
const SESSION_ID = `session_${RUN_ID}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
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
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const must = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error((result.exceptionDetails.exception && result.exceptionDetails.exception.description) || result.exceptionDetails.text);
    return result.result.value;
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

  if (PHASE === 'write') {
    const written = await must(`(async () => {
      const document = await window.eduGame.saveLessonDocument({
        name: ${JSON.stringify(DOC_NAME)}, ext: 'txt',
        text: 'Quang hợp là quá trình cây xanh tổng hợp chất hữu cơ nhờ ánh sáng. Hô hấp giải phóng năng lượng.',
        characters: 104
      });
      const analysis = {
        id: ${JSON.stringify(ANALYSIS_ID)}, schemaVersion: 1, documentId: document.id,
        subject: 'Sinh học', grade: 6, topic: 'Quang hợp và hô hấp (persistence)',
        objectives: [{ id: 'o1', description: 'Phân biệt quang hợp và hô hấp.' }],
        keyConcepts: [{ id: 'k1', term: 'Quang hợp', explanation: 'Tổng hợp chất hữu cơ nhờ ánh sáng.' }],
        uncertainties: [], sourceDocumentIds: [document.id], createdAt: new Date().toISOString()
      };
      await window.eduGame.saveLessonAnalysis(analysis);
      const project = {
        id: ${JSON.stringify(PROJECT_ID)}, schemaVersion: 1, status: 'ready', step: 'generate',
        title: 'Dự án persistence 71', description: 'Kiểm tra đóng/mở ứng dụng.', sourceName: document.name,
        gameId: null, template: 'scenario',
        lesson: { documentId: document.id, name: document.name, ext: 'txt', characters: 104, sizeBytes: 0 },
        analysisId: analysis.id, recommendationId: null, config: null, draft: null, gameSnapshot: null,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      };
      await window.eduGame.saveProjectDraft(project);
      const game = {
        id: ${JSON.stringify(GAME_ID)}, title: 'Trò chơi persistence 71', subject: 'Sinh học', grade: 'Lớp 6', topic: 'Quang hợp',
        template: 'scenario', description: 'Synthetic persistence check.', tags: ['PERSIST'],
        gameSetup: { difficulty: 'trung bình', duration: '10', scoringMode: 'cơ bản', players: 'cá nhân', pointsPerCorrect: '100', timeBonus: '0', style: 'trò chơi' },
        questions: [{ id: 's1', type: 'scenario', context: 'Bối cảnh', prompt: 'Tình huống persistence?', options: [{ id: 'a', text: 'Đúng' }, { id: 'b', text: 'Sai' }], correctOptionId: 'a', explanation: 'Vì vậy.', points: 100, nextSituationId: null }]
      };
      await window.eduGame.saveGame(game);
      await window.eduGame.saveSession({
        id: ${JSON.stringify(SESSION_ID)}, gameId: game.id, gameTitle: game.title, gameTemplate: game.template,
        playerName: 'Persistence 71', points: 100, max: 100, percent: 100, correct: 1, total: 1,
        durationSeconds: 3, completedAt: new Date().toISOString(), createdAt: new Date().toISOString()
      });
      const library = await window.eduGame.getLibrary();
      return {
        documentId: document.id,
        hasGame: library.games.some(item => item.id === game.id),
        hasSession: library.sessions.some(item => item.id === ${JSON.stringify(SESSION_ID)})
      };
    })()`);
    check('T1 wrote lesson/analysis/project/game/session', written && written.hasGame && written.hasSession, JSON.stringify(written));
    fs.writeFileSync(STATE_FILE, JSON.stringify({ documentId: written && written.documentId }, null, 2));
    check('T1 document id captured for restart', Boolean(written && written.documentId), written && written.documentId);
  } else {
    const read = await must(`(async () => {
      await refreshDb();
      const document = await window.eduGame.getLessonDocument(${JSON.stringify(DOC_ID)});
      const library = await window.eduGame.listLessonLibrary();
      const projects = await window.eduGame.listProjects();
      const lessons = Array.isArray(library) ? library : (library.documents || []);
      const lesson = lessons.find(item => item.id === ${JSON.stringify(DOC_ID)});
      const project = projects.find(item => item.id === ${JSON.stringify(PROJECT_ID)});
      return {
        documentText: document && document.text || '',
        lessonFound: Boolean(lesson),
        analysisFound: Boolean(lesson && (lesson.analyses || []).some(item => item.id === ${JSON.stringify(ANALYSIS_ID)})),
        projectFound: Boolean(project),
        projectStep: project && project.step,
        projectAnalysisId: project && project.analysisId,
        hasGame: state.db.games.some(item => item.id === ${JSON.stringify(GAME_ID)}),
        hasSession: state.db.sessions.some(item => item.id === ${JSON.stringify(SESSION_ID)})
      };
    })()`);
    check('T2 lesson source survives restart', Boolean(read && read.documentText && read.lessonFound), JSON.stringify({ text: read && read.documentText.slice(0, 40), lessonFound: read && read.lessonFound }));
    check('T2 saved analysis survives restart', read && read.analysisFound, read && read.analysisFound);
    check('T2 project and its analysis link survive restart', read && read.projectFound && read.projectAnalysisId === ANALYSIS_ID, JSON.stringify({ found: read && read.projectFound, step: read && read.projectStep, analysisId: read && read.projectAnalysisId }));
    check('T2 saved game survives restart', read && read.hasGame, read && read.hasGame);
    check('T2 result session survives restart', read && read.hasSession, read && read.hasSession);
    const ui = await must(`(async () => {
      navigate('lesson-plans');
      const started = Date.now();
      while (Date.now() - started < 10000 && !Array.isArray(state.lessonLibrary)) await new Promise(r => setTimeout(r, 100));
      await new Promise(r => setTimeout(r, 250));
      const lessonPage = document.querySelector('#pageContent')?.innerText || '';
      navigate('my-projects');
      await new Promise(r => setTimeout(r, 400));
      const projectPage = document.querySelector('#pageContent')?.innerText || '';
      navigate('library');
      const libraryPage = document.querySelector('#pageContent')?.innerText || '';
      return {
        lesson: lessonPage.includes(${JSON.stringify(DOC_NAME)}) && lessonPage.includes('Quang hợp và hô hấp (persistence)'),
        project: projectPage.includes('Dự án persistence 71'),
        game: libraryPage.includes('Trò chơi persistence 71')
      };
    })()`);
    check('T2 Giáo án page renders the persisted source/analysis', ui && ui.lesson, JSON.stringify(ui));
    check('T2 Dự án page renders the persisted project', ui && ui.project, JSON.stringify(ui));
    check('T2 Library page renders the persisted game', ui && ui.game, JSON.stringify(ui));
  }

  const failed = results.filter(item => !item.pass).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  ws.close();
  process.exit(failed ? 1 : 0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
