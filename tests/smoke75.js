// smoke75.js — CDP smoke for the wizard step-4 mode cards, the step-5 generation
// clock/estimate, and the sticky AI status bar.
//
// Run while the app is started with:
//   EDUGAME_USER_DATA=<empty folder> electron . --remote-debugging-port=9333
//   node tests/smoke75.js
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
      if (typeof state !== 'undefined' && typeof wizardState !== 'undefined' && typeof render === 'function' && document.querySelector('#pageContent')?.children.length) return true;
      await new Promise(r => setTimeout(r, 200));
    }
    return false;
  })()`);
  check('T1 renderer booted', booted, booted);

  // T2 — step 4: Fast/Thinking are two visible radio cards, not a dropdown.
  const step4 = await must(`(async () => {
    wizardState.step = 'configure';
    wizardState.busy = '';
    wizardState.config = {
      gameType: 'arena', title: 'Trò chơi thử', subject: 'Khoa học', grade: 'Lớp 4', topic: 'Nhiệt độ',
      audience: 'child', durationMinutes: 10, difficulty: 'dễ', playMode: 'individual',
      style: 'fun', focusObjectiveIds: [], generationMode: 'fast', questionCount: 4,
      scoringMode: 'basic', pointsPerCorrect: 100, timeBonus: 10
    };
    navigate('create-wizard');
    await new Promise(r => setTimeout(r, 400));
    const group = document.querySelector('.wizard-mode-choice');
    const cards = Array.from(document.querySelectorAll('[data-wizard-mode]'));
    return {
      group: Boolean(group && group.getAttribute('role') === 'radiogroup'),
      cardCount: cards.length,
      checked: cards.filter(card => card.getAttribute('aria-checked') === 'true').map(card => card.dataset.wizardMode),
      badge: document.querySelector('[data-wizard-mode-badge]')?.textContent?.trim() || '',
      selectGone: !document.querySelector('[data-wizard-config="generationMode"]')
    };
  })()`);
  check('T2 two mode cards in a radiogroup', step4.group && step4.cardCount === 2, JSON.stringify(step4));
  check('T2 Fast is selected by default and the dropdown is gone', step4.checked.join(',') === 'fast' && step4.selectGone && step4.badge === 'Fast', JSON.stringify(step4));

  // T3 — clicking Thinking updates the config in place (typed fields survive).
  const switched = await must(`(async () => {
    const title = document.querySelector('[data-wizard-config="title"]');
    title.value = 'Tên giáo viên vừa gõ';
    document.querySelector('[data-wizard-mode="deep"]').click();
    await new Promise(r => setTimeout(r, 200));
    const cards = Array.from(document.querySelectorAll('[data-wizard-mode]'));
    return {
      mode: wizardState.config.generationMode,
      titleSync: wizardState.config.title,
      titleStillOnScreen: document.querySelector('[data-wizard-config="title"]')?.value || '',
      checked: cards.filter(card => card.getAttribute('aria-checked') === 'true').map(card => card.dataset.wizardMode),
      badge: document.querySelector('[data-wizard-mode-badge]')?.textContent?.trim() || ''
    };
  })()`);
  check('T3 clicking Thinking sets config.generationMode = deep', switched.mode === 'deep', JSON.stringify(switched));
  check('T3 only the Thinking card is checked + badge follows', switched.checked.join(',') === 'deep' && switched.badge === 'Thinking', JSON.stringify(switched));
  check('T3 in-place switch keeps typed fields', switched.titleSync === 'Tên giáo viên vừa gõ' && switched.titleStillOnScreen === 'Tên giáo viên vừa gõ', JSON.stringify(switched));

  // T4 — step 5 idle: no clock is claimed before a run starts.
  const idle = await must(`(async () => {
    wizardState.step = 'generate';
    wizardState.busy = '';
    render();
    await new Promise(r => setTimeout(r, 150));
    return {
      timer: Boolean(document.querySelector('[data-wizard-generate-elapsed]')),
      chipHidden: document.getElementById('globalAiActivity')?.hidden ?? true
    };
  })()`);
  check('T4 no timer while generation is idle', !idle.timer, JSON.stringify(idle));

  // T5/T6 — simulate a running generation: elapsed clock + honest estimate, and
  // the top-bar chip follows the same run (label + seconds).
  const running = await must(`(async () => {
    wizardState.step = 'generate';
    wizardState.busy = 'generate';
    wizardState.lessonStage = 'validate';
    wizardState.lessonRepaired = true;
    render();
    wizardStartGenerationClock();
    wizardState.generationStartedAt = Date.now() - 65000;
    wizardSyncActivityClock();
    await new Promise(r => setTimeout(r, 150));
    const text = document.querySelector('[data-wizard-generate-elapsed]')?.textContent || '';
    const chip = document.getElementById('globalAiActivity');
    return {
      text,
      stage: document.querySelector('[data-wizard-progress]')?.getAttribute('data-wizard-progress') || '',
      chipHidden: chip ? chip.hidden : true,
      chipLabel: chip?.querySelector('[data-global-ai-label]')?.textContent || '',
      chipElapsed: chip?.querySelector('[data-global-ai-elapsed]')?.textContent || ''
    };
  })()`);
  check('T5 step 5 shows elapsed + estimate while generating', /Đã chạy 1:0\d · dự kiến \d+–\d+ phút/.test(running.text), running.text);
  check('T5 progress list stays on the real stage', running.stage === 'validate', running.stage);
  check('T5 top-bar chip shows "AI đang tạo nội dung" with seconds', !running.chipHidden && running.chipLabel === 'AI đang tạo nội dung' && /^1:0\d$/.test(running.chipElapsed), JSON.stringify(running));

  const before = running.text;
  await sleep(1300);
  const ticked = await must(`document.querySelector('[data-wizard-generate-elapsed]')?.textContent || ''`);
  check('T6 the elapsed clock actually ticks every second', ticked !== before, before + ' → ' + ticked);

  // T7 — stopping the run hides the chip and the timer.
  const stopped = await must(`(async () => {
    wizardStopActivityClock();
    wizardState.busy = '';
    wizardState.lessonStage = '';
    wizardState.generationStartedAt = 0;
    render();
    await new Promise(r => setTimeout(r, 150));
    return {
      timer: Boolean(document.querySelector('[data-wizard-generate-elapsed]')),
      chipHidden: document.getElementById('globalAiActivity')?.hidden ?? true
    };
  })()`);
  check('T7 stopping the run clears the timer and the chip', !stopped.timer && stopped.chipHidden, JSON.stringify(stopped));

  // T8 — the header + AI status bar stay pinned while the page scrolls.
  const sticky = await must(`(async () => {
    document.querySelector('#pageContent').style.minHeight = '2600px';
    window.scrollTo(0, 700);
    await new Promise(r => setTimeout(r, 250));
    const topbar = document.querySelector('.topbar');
    const bar = document.getElementById('aiStatusBar');
    const sidebar = document.querySelector('.sidebar');
    const rect = el => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height) }; };
    const out = {
      scrollY: Math.round(window.scrollY),
      topbarPosition: getComputedStyle(topbar).position,
      barPosition: getComputedStyle(bar).position,
      sidebarPosition: getComputedStyle(sidebar).position,
      topbar: rect(topbar),
      bar: rect(bar),
      sidebar: rect(sidebar)
    };
    window.scrollTo(0, 0);
    document.querySelector('#pageContent').style.minHeight = '';
    return out;
  })()`);
  check('T8 page really scrolled', sticky.scrollY > 100, 'scrollY=' + sticky.scrollY);
  check('T8 top bar is sticky at the top', sticky.topbarPosition === 'sticky' && sticky.topbar.top === 0, JSON.stringify(sticky.topbar));
  check('T8 AI status bar stays pinned under the header', sticky.barPosition === 'sticky' && sticky.bar.top === 72 && sticky.bar.bottom > 72, JSON.stringify(sticky.bar));
  check('T8 sidebar stays pinned too', sticky.sidebarPosition === 'sticky' && sticky.sidebar.top === 0, JSON.stringify(sticky.sidebar));

  check('T9 no uncaught renderer exceptions', uncaught.length === 0, uncaught.slice(0, 2).join(' | '));
  check('T10 no console errors', consoleErrs.length === 0, consoleErrs.slice(0, 2).join(' | '));

  const failed = results.filter(r => !r.pass);
  console.log(`\nsmoke75: ${results.length - failed.length}/${results.length} passed`);
  ws.close();
  process.exit(failed.length ? 1 : 0);
})().catch(error => {
  console.error('smoke75 crashed:', error);
  process.exit(1);
});
