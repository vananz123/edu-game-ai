#!/usr/bin/env node
/**
 * DECISIONS #324 — P7, phần ĐO ĐƯỢC: chơi offline thật sự không gọi mây.
 *
 * AGENTS.md: "Games that have already been saved must play offline. Cloud AI is only
 * needed to generate new content; never make gameplay depend on internet access."
 * That is a promise nobody had ever measured. This gate listens to the WebView's own
 * network stack (`Network.requestWillBeSent`) through a FULL page reload and a full
 * play-through of a saved game, and fails on any request that leaves the machine.
 *
 * What it does NOT prove: behaviour when DNS is broken (the app is not asked to make
 * a call at all), and the installer itself — that is P7's other half.
 *
 * Usage: `node tests/ui/ui-offline-play-check.js [port]`.
 */
process.argv[2] = process.argv[2] || process.env.CDP_PORT || '9345';

const PORT = process.argv[2];

const GAME = {
  id: 'offline324',
  title: 'Bài học không cần mạng',
  template: 'quiz',
  subject: 'Tự nhiên',
  grade: '4',
  description: '',
  gameSetup: { answerMode: 'instant' },
  questions: [
    { id: 'q1', type: 'multiple-choice', difficulty: 'de', prompt: 'Câu một?', explanation: 'Một.', points: 100,
      options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correctOptionId: 'a' },
    { id: 'q2', type: 'multiple-choice', difficulty: 'de', prompt: 'Câu hai?', explanation: 'Hai.', points: 100,
      options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correctOptionId: 'a' }
  ]
};

const LOCAL_HOSTS = [/^https?:\/\/tauri\.localhost\//i, /^https?:\/\/127\.0\.0\.1[:/]/i, /^https?:\/\/localhost[:/]/i];
const LOCAL_SCHEMES = /^(file|data|blob|about|devtools|ws|wss|chrome|edge):/i;

const isExternal = url => !LOCAL_SCHEMES.test(url) && !LOCAL_HOSTS.some(rx => rx.test(url));

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

(async () => {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const target = list.find(x => x.type === 'page' && (/index\.html/.test(x.url) || /^https?:\/\/tauri\.localhost\/?$/.test(x.url)));
  if (!target) throw new Error('không tìm thấy trang ứng dụng trên cổng ' + PORT);

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  let id = 0;
  const pending = new Map();
  const requests = [];
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
      return;
    }
    if (message.method === 'Network.requestWillBeSent') {
      const url = String(message.params.request.url || '');
      requests.push({ url, type: message.params.type, external: isExternal(url) });
    }
  });
  const send = (method, params = {}) => new Promise(resolve => {
    const callId = ++id;
    pending.set(callId, resolve);
    ws.send(JSON.stringify({ id: callId, method, params }));
  });
  const evaluate = async expression => {
    const reply = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (reply.result?.exceptionDetails) {
      throw new Error(reply.result.exceptionDetails.exception?.description || 'eval error');
    }
    return reply.result?.result?.value;
  };
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  await send('Network.enable');
  await send('Page.enable');

  // ── A cold page load, with the network listener already armed ────────────────
  requests.length = 0;
  await send('Page.reload', { ignoreCache: false });
  await sleep(3500);
  const bootRequests = requests.slice();
  const bootExternal = bootRequests.filter(entry => entry.external);

  check('the app boots without a page error', await evaluate('document.readyState') === 'complete');
  check('no request leaves the machine while the app starts',
    bootExternal.length === 0,
    bootExternal.length ? bootExternal.map(entry => entry.url).slice(0, 3).join(' ') : `${bootRequests.length} yêu cầu, tất cả đều cục bộ`);

  // ── A full play-through of a saved game ─────────────────────────────────────
  await evaluate(`(async () => {
    for (let i = 0; i < 40; i++) {
      if (document.querySelector('#modalRoot .setup-fullscreen')) break;
      await new Promise(r => setTimeout(r, 100));
    }
    if (typeof closeSetupWizard === 'function') closeSetupWizard('close');
    await new Promise(r => setTimeout(r, 200));
    if (typeof closeGame === 'function') { try { closeGame(); } catch (e) { void e; } }
    await new Promise(r => setTimeout(r, 300));
    try { await desktop.call('deleteGame', ${JSON.stringify(GAME.id)}); } catch (e) { void e; }
    await desktop.call('saveGame', ${JSON.stringify(GAME)});
    return true;
  })()`);
  await sleep(600);

  const saved = await evaluate(`(async () => {
    const library = await desktop.call('getLibrary');
    const found = (library.games || []).find(game => game.id === ${JSON.stringify(GAME.id)});
    return found ? { id: found.id, questions: (found.questions || []).length } : null;
  })()`);
  check('the game is really saved on disk before it is played',
    Boolean(saved) && saved.questions === 2, saved ? `${saved.id}, ${saved.questions} câu` : 'không lưu được');

  requests.length = 0;
  const play = await evaluate(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const library = await desktop.call('getLibrary');
    const game = (library.games || []).find(item => item.id === ${JSON.stringify(GAME.id)});
    if (!game) return { error: 'không thấy game trong thư viện' };
    playGame(game, { fullscreen: false });
    await sleep(700);
    const out = { steps: [] };
    for (let question = 0; question < 2; question += 1) {
      const option = document.querySelector('.answer-option[data-answer="a"]');
      if (!option) { out.steps.push('no option at ' + question); break; }
      option.click();
      await sleep(500);
      out.steps.push(document.querySelector('.stage-chip-score b') ? document.querySelector('.stage-chip-score b').textContent : '?');
      const next = document.querySelector('#nextQuestionBtn');
      if (!next) { out.steps.push('no next at ' + question); break; }
      next.click();
      await sleep(700);
    }
    out.finished = Boolean(document.querySelector('.result-screen'));
    out.score = document.querySelector('.result-score .result-value, .result-stat-value') ? document.querySelector('.result-stat-value').textContent : '';
    return out;
  })()`);
  await sleep(800);
  const playRequests = requests.slice();
  const playExternal = playRequests.filter(entry => entry.external);

  check('a saved game really plays through to the result screen',
    Boolean(play) && play.finished === true, play ? `${play.steps.join(' → ')} | kết quả: ${play.finished}` : 'không chạy được');
  check('nothing leaves the machine while a saved game is played',
    playExternal.length === 0,
    playExternal.length ? playExternal.map(entry => entry.url).slice(0, 3).join(' ') : `${playRequests.length} yêu cầu, tất cả đều cục bộ`);

  const hosts = [...new Set(requests.filter(entry => entry.external).map(entry => {
    try { return new URL(entry.url).host; } catch { return entry.url; }
  }))];
  check('no cloud host was contacted at all during play', hosts.length === 0, hosts.join(', ') || '(không có)');

  await evaluate(`(async () => { try { await desktop.call('deleteGame', ${JSON.stringify(GAME.id)}); } catch (e) { void e; } return true; })()`);

  // ── Canary: prove the listener is not simply deaf ───────────────────────────
  // A gate that cannot fail proves nothing (#322: the first memory-flip gate passed
  // 8/8 on a broken card). The canary asks for a host that can never resolve
  // (RFC 2606 `.invalid`), so no data goes anywhere, but the request event MUST be
  // seen — otherwise every "no request left the machine" above is meaningless.
  requests.length = 0;
  await evaluate(`fetch('https://offline-canary.invalid/probe').catch(() => 'blocked')`);
  await sleep(1200);
  const canary = requests.filter(entry => entry.external);
  check('the listener really sees an outside request when one is made (canary)',
    canary.length > 0, canary.length ? canary[0].url : 'không thấy gì — cổng này đang điếc');

  const failed = results.filter(entry => !entry.ok).length;
  console.log('');
  console.log(failed === 0
    ? `ui-offline-play-check: ${results.length}/${results.length} passed`
    : `${failed} check(s) failed`);
  ws.close();
  process.exit(failed === 0 ? 0 : 1);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
