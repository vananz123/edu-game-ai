// smoke72.js — CDP smoke for update_plan_3 Đợt 2: AI task manager UI +
// CPU-only runtime verification on the settings page, and the Fast/Thinking
// mode labels on wizard step 4 (update_plan_3 §8/§4/§9).
//
// Run while the app is started with:
//   EDUGAME_USER_DATA=<empty folder> electron . --remote-debugging-port=9333
//   node tests/smoke/smoke72.js
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

  // T1 — renderer booted.
  const booted = await must(`(async () => {
    const started = Date.now();
    while (Date.now() - started < 30000) {
      if (typeof state !== 'undefined' && typeof navigate === 'function' && window.eduGame && document.querySelector('#pageContent')?.children.length) return true;
      await new Promise(r => setTimeout(r, 200));
    }
    return false;
  })()`);
  check('T1 renderer booted', booted, booted);

  // T2 — settings page renders the task manager section; list loaded (not stuck).
  await must(`(async () => {
    navigate('settings');
    const started = Date.now();
    while (Date.now() - started < 10000 && !document.querySelector('#aiTaskList')) await new Promise(r => setTimeout(r, 100));
    while (Date.now() - started < 10000 && document.querySelector('#aiTaskList')?.textContent.includes('Đang tải')) await new Promise(r => setTimeout(r, 100));
    return true;
  })()`);
  const taskPanel = await must(`({
    section: !!document.querySelector('#aiTaskList'),
    refreshBtn: !!document.querySelector('#aiTasksRefreshBtn'),
    verifyBtn: !!document.querySelector('#cpuRuntimeVerifyBtn'),
    listText: (document.querySelector('#aiTaskList')?.textContent || '').slice(0, 200)
  })`);
  check('T2 task manager section renders', taskPanel.section && taskPanel.refreshBtn && taskPanel.verifyBtn, JSON.stringify(taskPanel));
  check('T2 list is loaded (no placeholder)', !taskPanel.listText.includes('Đang tải'), taskPanel.listText);

  // T3 — ai:tasks returns live+history arrays; restored history is never "running".
  const taskIpc = await must(`(async () => {
    const result = await window.eduGame.listAiTasks({ limit: 10 });
    return {
      arrays: Array.isArray(result.live) && Array.isArray(result.history),
      historyRestored: result.history.every(row => row.restored === true)
    };
  })()`);
  check('T3 ai:tasks returns { live, history } arrays', taskIpc.arrays, JSON.stringify(taskIpc));
  check('T3 restored rows are never faked as running', taskIpc.historyRestored, JSON.stringify(taskIpc));

  // T4 — clicking "Xác minh runtime CPU" fills the measured facts panel.
  await must(`(async () => {
    document.querySelector('#cpuRuntimeVerifyBtn').click();
    const started = Date.now();
    while (Date.now() - started < 15000 && !(document.querySelector('#cpuVerifyResult')?.textContent || '').includes('Backend')) await new Promise(r => setTimeout(r, 150));
    return true;
  })()`);
  const verifyBox = await must(`(document.querySelector('#cpuVerifyResult')?.textContent || '')`);
  check('T4 runtime verify panel shows backend', verifyBox.includes('Backend'), verifyBox.slice(0, 160));
  check('T4 runtime verify shows CPU-only args', verifyBox.includes('--n-gpu-layers 0'), verifyBox.slice(0, 240));
  check('T4 runtime verify reports GPU markers honestly', verifyBox.includes('Tệp gợi ý backend GPU'), verifyBox.slice(0, 300));

  // T5 — refresh button keeps the list rendered without errors.
  await must(`(async () => {
    document.querySelector('#aiTasksRefreshBtn').click();
    await new Promise(r => setTimeout(r, 600));
    return true;
  })()`);
  const afterRefresh = await must(`Boolean(document.querySelector('#aiTaskList')?.children.length)`);
  check('T5 refresh keeps task list rendered', afterRefresh, afterRefresh);

  // T6 — wizard step 4 shows the two honest modes Fast/Thinking (§9) as visible
  // choices (not a dropdown) and no "Phân tích chuyên sâu" option.
  const modeLabels = await must(`(async () => {
    if (typeof wizardState === 'undefined' || typeof render !== 'function') return { error: 'wizard missing' };
    wizardState.step = 'configure';
    wizardState.config = wizardState.config || {
      gameType: 'arena', title: 'Trò chơi thử', subject: 'Khoa học', grade: 'Lớp 4', topic: 'Nhiệt độ',
      audience: 'child', durationMinutes: 10, difficulty: 'dễ', playMode: 'individual',
      style: 'fun', focusObjectiveIds: [], generationMode: 'fast', questionCount: 4,
      scoringMode: 'basic', pointsPerCorrect: 100, timeBonus: 10
    };
    navigate('create-wizard');
    await new Promise(r => setTimeout(r, 300));
    const group = document.querySelector('.wizard-mode-choice');
    const cards = Array.from(document.querySelectorAll('[data-wizard-mode]')).map(node => ({
      mode: node.dataset.wizardMode,
      label: (node.textContent || '').replace(/\\s+/g, ' ').trim(),
      checked: node.getAttribute('aria-checked')
    }));
    return {
      cards,
      radiogroup: Boolean(group && group.getAttribute('role') === 'radiogroup'),
      checkedCount: cards.filter(card => card.checked === 'true').length,
      selectGone: !document.querySelector('[data-wizard-config="generationMode"]'),
      fastLabeling: cards.some(card => card.mode === 'fast' && /Fast/.test(card.label)),
      deepLabeling: cards.some(card => card.mode === 'deep' && /Thinking/.test(card.label)),
      honestHint: (document.body.innerText || '').includes('chưa trả nội dung suy luận'),
      noDeepResearch: !(document.body.innerText || '').includes('Phân tích chuyên sâu')
    };
  })()`);
  check('T6 wizard offers Fast option', modeLabels.fastLabeling, JSON.stringify(modeLabels.cards || modeLabels));
  check('T6 wizard offers Thinking (deep) option', modeLabels.deepLabeling, JSON.stringify(modeLabels.cards || modeLabels));
  check('T6 mode is a radiogroup with exactly one checked', modeLabels.radiogroup && modeLabels.checkedCount === 1, JSON.stringify(modeLabels));
  check('T6 generationMode is no longer a dropdown', modeLabels.selectGone, JSON.stringify(modeLabels));
  check('T6 honest thinking-limit hint present', modeLabels.honestHint, JSON.stringify(modeLabels));
  check('T6 no "Phân tích chuyên sâu" on game-creation page', modeLabels.noDeepResearch, JSON.stringify(modeLabels));

  check('T7 no uncaught renderer exceptions', uncaught.length === 0, uncaught.slice(0, 2).join(' | '));
  check('T7 no console errors', consoleErrs.length === 0, consoleErrs.slice(0, 2).join(' | '));

  const failed = results.filter(r => !r.pass);
  console.log(`\nsmoke72: ${results.length - failed.length}/${results.length} passed`);
  ws.close();
  process.exit(failed.length ? 1 : 0);
})().catch(error => {
  console.error('smoke72 crashed:', error);
  process.exit(1);
});
