// smoke70.js - CDP smoke for scenario sequencing (Group E).
// Run while the app is started with --remote-debugging-port=9334.
// Verifies 1, 2 and 10-question runs, one wrong answer, continuous advancement,
// and the final summary. Uses synthetic data only.
const fs = require('node:fs');
const PORT = 9334;
const RUN_ID = Date.now().toString(36);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
function check(label, pass, extra) {
  results.push({ label, pass: Boolean(pass), extra: extra == null ? '' : String(extra) });
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
    if (result.exceptionDetails) throw new Error((result.exceptionDetails.exception && result.exceptionDetails.exception.description) || result.exceptionDetails.text);
    return result.result.value;
  }
  await send('Runtime.enable');
  const booted = await must(`(async () => {
    const started = Date.now();
    while (Date.now() - started < 30000) {
      if (typeof state !== 'undefined' && typeof playGame === 'function' && window.eduGame && document.querySelector('#pageContent')?.children.length) return true;
      await new Promise(r => setTimeout(r, 200));
    }
    return false;
  })()`);
  check('T0 renderer booted', booted, booted);

  for (const count of [1, 2, 10]) {
    const run = await must(`(async () => {
      const id = 'smoke70-scenario-' + ${JSON.stringify(RUN_ID)} + '-${count}';
      const game = {
        id, title: 'SMOKE 70 Tình huống ${count}', subject: 'Sinh học', grade: 'Lớp 6', topic: 'Quang hợp',
        template: 'scenario', description: 'Smoke scenario sequencing.', tags: ['SMOKE'],
        gameSetup: { difficulty: 'trung bình', duration: '10', scoringMode: 'cơ bản', players: 'cá nhân', pointsPerCorrect: '100', timeBonus: '0', style: 'trò chơi' },
        questions: Array.from({ length: ${count} }, (_, index) => ({
          id: 's' + (index + 1), type: 'scenario', context: 'Bối cảnh ' + (index + 1), prompt: 'Tình huống số ' + (index + 1),
          options: [{ id: 'a', text: 'Cách an toàn' }, { id: 'b', text: 'Cách rủi ro' }],
          correctOptionId: 'a', explanation: 'Giải thích ' + (index + 1), points: 100, nextSituationId: null
        }))
      };
      const saved = await window.eduGame.saveGame(game);
      playGame(saved);
      await new Promise(r => setTimeout(r, 200));
      const seen = [];
      for (let index = 0; index < ${count}; index++) {
        seen.push(document.querySelector('.stage-question')?.textContent || '');
        const expected = 'Tình huống số ' + (index + 1);
        if (seen[seen.length - 1] !== expected) break;
        const answer = index === 1 ? 'b' : 'a';
        const option = document.querySelector('.answer-option[data-answer="' + answer + '"]');
        const next = document.querySelector('#nextQuestionBtn');
        if (!option || !next) break;
        option.click();
        next.click();
        await new Promise(r => setTimeout(r, 140));
      }
      await new Promise(r => setTimeout(r, 450));
      const summary = state.lastSummary || {};
      const resultText = document.querySelector('#playBody')?.innerText || '';
      await window.eduGame.deleteGame(id);
      await refreshDb();
      return {
        seen,
        answerCount: state.gameAnswers.length,
        correct: state.gameAnswers.map(item => item.correct),
        points: summary.points,
        max: summary.max,
        percent: summary.percent,
        resultText: resultText.slice(0, 220)
      };
    })()`);
    const expectedSeen = Array.from({ length: count }, (_, index) => `Tình huống số ${index + 1}`);
    const expectedCorrect = Array.from({ length: count }, (_, index) => index !== 1);
    const pass = run
      && JSON.stringify(run.seen) === JSON.stringify(expectedSeen)
      && run.answerCount === count
      && JSON.stringify(run.correct) === JSON.stringify(expectedCorrect)
      && /THỬ THÁCH HOÀN THÀNH|HOÀN THÀNH/i.test(run.resultText);
    check(`T1 ${count}-question scenario advances continuously`, pass, JSON.stringify({ seen: run && run.seen, correct: run && run.correct, result: run && run.resultText.slice(0, 80) }));
    const expectedPoints = (count - (count > 1 ? 1 : 0)) * 100;
    check(`T1 ${count}-question scenario summary is accurate`, run && run.points === expectedPoints && run.max === count * 100, JSON.stringify({ points: run && run.points, max: run && run.max, percent: run && run.percent }));
  }

  // T2 - matching (columns) reaches its result screen and auto-saves one session.
  const matching = await must(`(async () => {
    const id = 'smoke70-matching-' + ${JSON.stringify(RUN_ID)};
    const game = {
      id, title: 'SMOKE 70 Ghép cặp', subject: 'Sinh học', grade: 'Lớp 6', topic: 'Quang hợp',
      template: 'matching', description: 'Smoke matching result.', tags: ['SMOKE'], questions: [],
      matchingGame: {
        mode: 'columns', practiceMode: false, wrongPenalty: 0, completionBonus: 0,
        pairs: [
          { id: 'p1', left: 'Quang hợp', right: 'Tổng hợp chất hữu cơ' },
          { id: 'p2', left: 'Hô hấp', right: 'Giải phóng năng lượng' }
        ]
      }
    };
    const saved = await window.eduGame.saveGame(game);
    playGame(saved);
    await new Promise(r => setTimeout(r, 200));
    for (const pair of game.matchingGame.pairs) {
      document.querySelector('.match-card[data-match-side="left"][data-pair="' + pair.id + '"]').click();
      document.querySelector('.match-card[data-match-side="right"][data-pair="' + pair.id + '"]').click();
      await new Promise(r => setTimeout(r, 120));
    }
    const started = Date.now();
    let rows = [];
    let status = '';
    while (Date.now() - started < 8000) {
      rows = state.db.sessions.filter(item => item.gameId === id);
      status = document.querySelector('#resultSaveStatus')?.textContent || '';
      if (rows.length === 1 && /Đã tự lưu/.test(status)) break;
      await new Promise(r => setTimeout(r, 150));
    }
    const text = document.querySelector('#playBody')?.innerText || '';
    await window.eduGame.deleteGame(id);
    await refreshDb();
    return { completed: /GHÉP CẶP HOÀN THÀNH/.test(text), rows: rows.length, status };
  })()`);
  check('T2 matching result auto-saves one session', matching && matching.completed && matching.rows === 1 && /Đã tự lưu/.test(matching.status), JSON.stringify(matching));

  const report = { port: PORT, results };
  fs.writeFileSync('smoke70-report.json', JSON.stringify(report, null, 2));
  const failed = results.filter(item => !item.pass).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  ws.close();
  process.exit(failed ? 1 : 0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
