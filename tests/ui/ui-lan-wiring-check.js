// ui-lan-wiring-check.js — proves LAN Classroom Mode is wired into the real app.
//
// Unit tests cover the reducer/adapters and `lan-smoke.js` covers the server; this
// check is the only one that proves the *Electron* half: main registered the IPC
// handlers, the sandboxed preload exposes `window.eduGame.lanStart`, and pressing
// "Chơi LAN" in a real play modal opens a room the teacher can see (QR + code).
//
// Run:
//   npm run build
//   powershell -ExecutionPolicy Bypass -File tests/ui/launch-app.ps1 -Port 9362
//   node tests/ui/ui-lan-wiring-check.js 9362
//
// It starts a real listening socket on the machine, then stops the room again.
const { check, connect, results } = require('../manual/lib/ui-check-lib');

const SYNTHETIC_GAME = {
  id: 'lan-check-game',
  title: 'Synthetic LAN check',
  template: 'quiz',
  subject: 'Kiểm thử',
  grade: '4',
  gameSetup: { scoringMode: 'cơ bản' },
  questions: [
    { id: 'q1', type: 'multiple-choice', prompt: 'Câu tổng hợp 1?', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correctOptionId: 'a', explanation: '', points: 100 }
  ]
};

(async () => {
  const cdp = await connect();

  check('the preload exposes the LAN bridge', await cdp.evaluate(`typeof window.eduGame.lanStart === 'function' && typeof window.eduGame.onLanState === 'function'`));

  // Open the play modal through the app's own entry point, exactly as a card does.
  // `state`/`playGame` are classic-script globals; they are reachable by name but
  // the top-level `const state` is not a property of `window`.
  const opened = await cdp.evaluate(`(() => {
    state.currentGame = ${JSON.stringify(SYNTHETIC_GAME)};
    playGame(state.currentGame);
    return Boolean(document.querySelector('[data-play-lan]'));
  })()`);
  check('the play header shows a "Chơi LAN" button for a quiz', opened);

  const started = await cdp.evaluate(`(async () => {
    const result = await window.eduGame.lanStart({ game: state.currentGame });
    if (!result || !result.ok) return { ok: false, message: result && result.message };
    // Give the 'lan:state' push a moment to render the room panel.
    await new Promise(resolve => setTimeout(resolve, 600));
    const panel = document.querySelector('[data-lan-panel]');
    return {
      ok: true,
      hasPanel: Boolean(panel),
      hasQr: Boolean(panel && panel.querySelector('.lan-qr')),
      code: panel ? (panel.querySelector('.lan-roomcode strong') || {}).textContent : '',
      url: panel ? (panel.querySelector('.lan-url b') || {}).textContent : ''
    };
  })()`);
  check('lanStart opens a room', started.ok, started.message || '');
  check('the room panel renders the QR code', started.hasPanel && started.hasQr);
  check('the room shows a 6-character code', /^[A-HJ-NP-Z2-9]{6}$/.test(String(started.code || '')), started.code);
  check('the room shows a join URL on a LAN address', /^http:\/\/\d+\.\d+\.\d+\.\d+:\d+\/\?room=/.test(String(started.url || '')), started.url);

  const stopped = await cdp.evaluate(`(async () => {
    const result = await window.eduGame.lanStop();
    await new Promise(resolve => setTimeout(resolve, 400));
    return { ok: Boolean(result && result.ok), panelGone: !document.querySelector('[data-lan-panel]') };
  })()`);
  check('lanStop closes the room and removes the panel', stopped.ok && stopped.panelGone);

  // `connect()` returns a raw WebSocket plus helpers; there is no `close()`.
  if (cdp.ws && typeof cdp.ws.close === 'function') cdp.ws.close();
  const failed = results.filter(entry => !entry.ok).length;
  console.log(`\n${results.length - failed}/${results.length} LAN wiring checks passed`);
  process.exit(failed ? 1 : 0);
})().catch(error => {
  console.error('ui-lan-wiring-check could not run:', error && error.message || error);
  console.error('Start the built app with --remote-debugging-port first (tests/ui/launch-app.ps1).');
  process.exit(2);
});
