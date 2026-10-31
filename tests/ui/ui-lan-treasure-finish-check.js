// ui-lan-treasure-finish-check.js — DECISIONS #112 (fixes a review CRITICAL).
//
// Ending a LAN treasure journey must close the room so the projector and the phones
// show the honour roll. Before the fix only the last "next round" closed the room,
// so ending a journey left `lan:state` at 'question' forever and the podium never
// appeared.
//
// Run:
//   npm run build
//   powershell -ExecutionPolicy Bypass -File tests/ui/launch-app.ps1 -Port 9410
//   node tests/ui/ui-lan-treasure-finish-check.js 9410
const { connect } = require('../manual/lib/ui-check-lib');
const { io } = require('socket.io-client');

const stage = (id, n, next) => ({
  id, name: `Chặng ${n}`, story: 'Truyện mẫu.', taskDescription: 'Nhiệm vụ mẫu.',
  question: { prompt: `Câu hỏi ${n}?`, options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correctOptionId: 'a', explanation: '', hint: '' },
  attempts: 1, points: 100, completionBonus: 50, nextStageId: next
});
const GAME = {
  id: 'lan-treasure-end', title: 'Kho báu', template: 'treasure-hunt',
  treasureHunt: { character: 'explorer', intro: 'Mở đầu.', journeyBonus: 300, hiddenItemBonus: 50, stages: [stage('s1', 1, 's2'), stage('s2', 2, null)] }
};

const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

(async () => {
  const cdp = await connect();
  await cdp.evaluate('window.eduGame.lanStop()');
  const room = await cdp.evaluate(`(async () => {
    state.currentGame = ${JSON.stringify(GAME)};
    playGame(state.currentGame);
    await new Promise(r => setTimeout(r, 400));
    const r = await window.eduGame.lanStart({ game: state.currentGame });
    return r.ok ? { code: r.snapshot.roomCode, url: r.snapshot.urls[0] } : { error: r.message };
  })()`);
  check('a LAN treasure room opens', Boolean(room.url), room.error || room.code);
  if (!room.url) { cdp.ws.close(); process.exit(1); }

  const socket = io(new URL(room.url).origin, { transports: ['websocket'] });
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
  const states = [];
  socket.on('lan:state', snapshot => states.push(snapshot));
  socket.emit('lan:join', { room: room.code, name: 'Lan' });
  await new Promise(resolve => socket.once('lan:joined', resolve));

  await cdp.evaluate('window.eduGame.lanBegin()');
  await new Promise(r => setTimeout(r, 500));
  const afterBegin = states.filter(s => s.state === 'question').pop();
  check('the lesson starts on the first stage', Boolean(afterBegin));

  // The teacher ends the journey from the desktop (the path that used to leave the
  // room open and never show the podium).
  await cdp.evaluate(`(async () => {
    state.treasurePlay.done = true;
    renderTreasureResults();
    await new Promise(r => setTimeout(r, 900));
    return true;
  })()`);

  const finished = states.filter(s => s.state === 'finished').pop();
  check('the room reaches "finished" when the journey ends', Boolean(finished), finished ? 'state=finished' : `states seen: ${[...new Set(states.map(s => s.state))].join(',')}`);
  check('a phone sees the journey end', Boolean(finished));

  const podium = await cdp.evaluate(`(() => {
    const steps = document.querySelectorAll('[data-lan-panel] [data-lan-podium]');
    return { count: steps.length, hasPanel: Boolean(document.querySelector('[data-lan-panel]')) };
  })()`);
  check('the honour roll is on the teacher screen', podium.count > 0, `${podium.count} podium steps`);

  socket.disconnect();
  await cdp.evaluate('window.eduGame.lanStop()');
  cdp.ws.close();
  const failed = results.filter(ok => !ok).length;
  console.log(`\n${results.length - failed}/${results.length} LAN treasure finish checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(error => { console.error('probe failed:', (error && error.stack) || error); process.exit(2); });
