#!/usr/bin/env node
// ui-lan-card-start-check.js — the two gaps reported after the first LAN build.
//
//   1. Only LAN-capable games offer "📱 Chơi LAN" on their library card.
//   2. The teacher has a visible start control, and pressing it moves a connected
//      phone from "Chờ giáo viên bắt đầu" to the first question — and the play
//      screen's own "Tiếp tục →" moves the phones to the next one.
//
// Run:
//   npm run build:tauri
//   powershell -ExecutionPolicy Bypass -File tests/ui/launch-app.ps1 -Port 9375
//   node tests/ui/ui-lan-card-start-check.js 9375
//
// Synthetic games only (AGENTS.md). Uses the Rust server's native WebSocket
// protocol over the real room URL (see tests/manual/lib/lan-phone.js).
const { check, connect, results } = require('../manual/lib/ui-check-lib');
const { openPhone } = require('../manual/lib/lan-phone');

const GAMES = [
  {
    id: 't-quiz', title: 'Quiz LAN', template: 'quiz', gameSetup: { scoringMode: 'cơ bản' },
    questions: [
      { id: 'q1', type: 'multiple-choice', prompt: 'Câu 1?', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correctOptionId: 'a', explanation: '', points: 100 },
      { id: 'q2', type: 'multiple-choice', prompt: 'Câu 2?', options: [{ id: 'a', text: 'A' }], correctOptionId: 'a', explanation: '', points: 100 }
    ]
  },
  {
    id: 't-match', title: 'Ghép cặp', template: 'matching',
    matchingGame: { mode: 'columns', pairs: [{ id: 'p1', left: 'A', right: 'B' }, { id: 'p2', left: 'C', right: 'D' }], pointsPerPair: 100 }
  },
  {
    id: 't-treasure', title: 'Kho báu', template: 'treasure-hunt',
    treasureHunt: {
      character: 'explorer', intro: '', journeyBonus: 300, hiddenItemBonus: 50,
      stages: [{
        id: 's1', name: 'C1', story: '', taskDescription: '',
        question: { prompt: 'Chặng 1?', options: [{ id: 'a', text: 'A' }], correctOptionId: 'a', explanation: '', hint: '' },
        attempts: 1, points: 100, completionBonus: 50, nextStageId: null
      }]
    }
  }
];

(async () => {
  const cdp = await connect();
  // A fresh profile opens the setup wizard over the shell; dismiss it before the
  // script drives the library and play screens.
  await cdp.evaluate(`(() => { if (typeof closeSetupWizard === 'function') closeSetupWizard('close'); return true; })()`);

  // 1. Card buttons: supported templates only.
  const cards = await cdp.evaluate(`(() => {
    const out = {};
    ${JSON.stringify(GAMES)}.forEach((game, index) => {
      const wrap = document.createElement('div');
      wrap.innerHTML = gameCard(game, index, true);
      const button = wrap.firstElementChild.querySelector('[data-action="lan"]');
      out[game.template] = { lan: Boolean(button), label: button ? button.textContent.trim() : '' };
    });
    return out;
  })()`);
  check('quiz card shows "📱 Chơi LAN"', Boolean(cards.quiz && cards.quiz.lan), cards.quiz && cards.quiz.label);
  check('treasure card shows a LAN button', Boolean(cards['treasure-hunt'] && cards['treasure-hunt'].lan));
  // #119/D18: Chơi LAN lives in every card's "•••" menu (it was a bar button for some
  // templates before). The menu is the single place, for every template.
  check('every card offers "Chơi LAN" from its menu', Boolean(cards.matching && cards.matching.lan) && /Chơi LAN/.test(cards.matching.label), cards.matching && cards.matching.label);

  // 2. The real card button on the real library page opens a room.
  //
  // Panel là lớp vỏ dựng ngay khi bấm, còn mã phòng chỉ xuất hiện sau khi main tạo
  // xong phòng. Đo trên instance lạnh: lần mở phòng ĐẦU TIÊN của một hồ sơ sạch mất
  // ~1,1 s (phòng thứ hai ~0,3 s), nên một cái chờ cố định 1,2 s là đồng xu — nó từng
  // làm chính kiểm tra này chết với "Cannot read properties of null (reading
  // 'textContent')" đúng một dòng sau ba PASS. Vì thế: hỏi cho tới khi mã phòng có,
  // rồi mới đọc, và đọc qua null-safe.
  const room = await cdp.evaluate(`(async () => {
    if (typeof state !== 'object' || !state) return { error: 'app not booted' };
    state.db = state.db || {};
    state.db.games = ${JSON.stringify(GAMES)};
    navigate('library');
    await new Promise(resolve => setTimeout(resolve, 400));
    const buttons = [...document.querySelectorAll('#pageContent [data-action="lan"]')];
    const button = buttons.find(entry => entry.dataset.id === 't-quiz');
    if (!button) return { error: 'no LAN button on the rendered library card' };
    button.click();
    const read = () => {
      const panel = document.querySelector('[data-lan-panel]');
      const start = panel && panel.querySelector('[data-lan-begin]');
      const code = panel && panel.querySelector('.lan-roomcode strong');
      const url = panel && panel.querySelector('.lan-url b');
      return {
        hasPanel: Boolean(panel),
        hasStart: Boolean(start),
        startDisabled: Boolean(start && start.disabled),
        code: code ? code.textContent : '',
        url: url ? url.textContent : ''
      };
    };
    let snapshot = read();
    for (let wait = 0; wait < 40 && !snapshot.code; wait += 1) {
      await new Promise(resolve => setTimeout(resolve, 200));
      snapshot = read();
    }
    return snapshot;
  })()`);
  check('the library card opens a LAN room', room.hasPanel, room.error || room.code);
  check('the room shows a "Bắt đầu câu 1" button', room.hasStart);
  check('start waits until a pupil joins', room.startDisabled);

  if (!room.url) {
    console.error('\ncannot continue without a room URL');
    process.exit(1);
  }

  // 3. A pupil joins over the LAN URL.
  const phone = openPhone(room.url, { room: room.code, name: 'Lan' });
  await phone.opened;
  const joined = await phone.next('lan:joined');
  check('a pupil can join over the QR URL', Boolean(joined && joined.token));
  const phoneStates = phone.states;

  await new Promise(resolve => setTimeout(resolve, 500));
  const afterJoin = await cdp.evaluate(`(() => {
    const button = document.querySelector('[data-lan-panel] [data-lan-begin]');
    return { disabled: Boolean(button && button.disabled), text: button ? button.textContent.trim() : '' };
  })()`);
  check('start becomes enabled once a pupil joins', !afterJoin.disabled, afterJoin.text);

  // 4. Press start: the panel switches to playing AND the phone gets the question.
  const started = await cdp.evaluate(`(async () => {
    document.querySelector('[data-lan-panel] [data-lan-begin]').click();
    await new Promise(resolve => setTimeout(resolve, 900));
    const panel = document.querySelector('[data-lan-panel]');
    return { progress: Boolean(panel && panel.querySelector('[data-lan-progress]')), stillStart: Boolean(panel && panel.querySelector('[data-lan-begin]')) };
  })()`);
  check('pressing start switches the panel to "ĐANG CHƠI"', started.progress && !started.stillStart);
  await new Promise(resolve => setTimeout(resolve, 400));
  const question = phoneStates.filter(entry => entry && entry.state === 'question').pop();
  check('the phone receives the question and its options', Boolean(question && question.input && question.input.options.length === 2), question ? `${question.prompt} (${question.input.options.length} options)` : 'no state pushed');
  check('the phone view never carries the answer key while open', !question || question.lastResult === null);

  // 5. The play screen's own advance moves the phones on.
  const before = phoneStates.length;
  await cdp.evaluate('(() => { state.gameIndex = 1; lanAdvanceRound(); return true; })()');
  await new Promise(resolve => setTimeout(resolve, 800));
  const next = phoneStates.slice(before).filter(entry => entry && entry.currentRoundIndex === 1).pop();
  check('advancing the play screen moves the phones to the next question', Boolean(next), next ? `round ${next.currentRoundIndex + 1}/${next.roundCount}` : 'no state pushed');

  phone.close();
  await cdp.evaluate("desktop.call('lanStop')");
  cdp.ws.close();

  const failed = results.filter(entry => !entry.ok).length;
  console.log(`\n${results.length - failed}/${results.length} LAN card/start checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(error => {
  console.error('ui-lan-card-start-check could not run:', (error && error.message) || error);
  console.error('Start the built app with --remote-debugging-port first (tests/ui/launch-app.ps1).');
  process.exit(2);
});
