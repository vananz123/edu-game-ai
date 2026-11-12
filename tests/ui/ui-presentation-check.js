// Chạy trên instance Tauri riêng: node tests/ui/ui-presentation-check.js <CDP port>.
const { check, results } = require('../manual/lib/ui-check-lib');
const { PROJECTOR_SIZES, setViewportAndWait, capture, measureLayout, findTarget, listTargets } = require('./lib/screenshot-capture');

const PORT = Number(process.argv[2] || process.env.CDP_PORT || 9361);
const SESSION_ID = 'pres-check-' + Date.now();
const PRESENTATION_URL = /\/presentation\/presentation\.html(?:\?|$)/;
const runtimeErrors = [];
const styleErrors = [];

async function waitFor(read, description, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  do {
    const value = await read();
    if (value) return value;
    await new Promise(r => setTimeout(r, 80));
  } while (Date.now() < deadline);
  throw new Error('Timed out: ' + description);
}

async function connectTo(matcher) {
  const target = await waitFor(() => findTarget(PORT, matcher), 'CDP target ' + matcher);
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
  let id = 0;
  const pend = new Map();
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.method === 'Runtime.exceptionThrown') runtimeErrors.push(m.params.exceptionDetails);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') runtimeErrors.push(m.params.args);
    if (m.method === 'Log.entryAdded' && m.params.entry.source === 'security' && /style-src/.test(m.params.entry.text)) styleErrors.push(m.params.entry.text);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  });
  const send = (method, params = {}) => new Promise((r, j) => {
    const i = ++id;
    const timer = setTimeout(() => {
      pend.delete(i);
      j(new Error(`CDP timeout after 15s: ${method}`));
    }, 15000);
    pend.set(i, (m) => { clearTimeout(timer); m.error ? j(new Error(method + ': ' + m.error.message)) : r(m); });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const evaluate = async expression => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval error');
    return r.result?.result?.value;
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Log.enable');
  return { ws, send, evaluate, target };
}

// Synthetic classroom content — no real student data (AGENTS.md).
// Long Vietnamese with stacked diacritics on purpose: "ế/ộ/ữ" are what clip
// when line-height is too tight for the font.
const LONG_PROMPT = 'Khi gặp một bạn mới trong lớp, cách nào sau đây thể hiện sự tôn trọng, giúp em kết bạn tốt hơn và giữ được thiện chí của cả hai bên trong suốt năm học?';
const OPTIONS = [
  { id: 'a', text: 'Chủ động chào hỏi, hỏi thăm bạn một cách tự nhiên và lắng nghe' },
  { id: 'b', text: 'Đứng quan sát từ xa cho đến khi bạn ấy nói trước' },
  { id: 'c', text: 'Kể ngay một câu chuyện cười thật dài để gây chú ý' },
  { id: 'd', text: 'Chờ giáo viên giới thiệu rồi mới dám lên tiếng' }
];

function mapTemplate(kind) {
  return kind === 'treasure' ? 'treasure-hunt' : kind === 'quiz' ? 'quiz' : kind;
}

function baseState(kind, revision) {
  return {
    sessionId: SESSION_ID, gameId: 'pres-check-game',
    gameTitle: 'Ôn tập kỹ năng sống lớp 6', template: mapTemplate(kind),
    gameIndex: 0, gameAnswers: [], isComplete: false, revision,
    timer: 45,
    score: { points: 300, max: 500, percent: 60, correct: 3, total: 5 }
  };
}
function stateFor(kind, revision) {
  const base = baseState(kind, revision);
  if (kind === 'quiz') {
    return {
      ...base,
      view: { kind: 'quiz', prompt: LONG_PROMPT, options: OPTIONS, revealed: false, progressLabel: 'Câu 3 / 5' }
    };
  }
  if (kind === 'matching') {
    return {
      ...base,
      view: {
        kind: 'matching', mode: 'columns', matched: 1, total: 4, wrong: 0,
        matchedIds: ['p1'], selectedPairId: null,
        pairs: [
          { id: 'p1', left: 'Tôn trọng', right: 'Lắng nghe khi bạn nói' },
          { id: 'p2', left: 'Hợp tác', right: 'Cùng nhau hoàn thành nhiệm vụ' },
          { id: 'p3', left: 'Chia sẻ', right: 'Giúp bạn khi bạn gặp khó khăn' },
          { id: 'p4', left: 'Trung thực', right: 'Nói thật dù có thể bị phạt' }
        ]
      }
    };
  }
  if (kind === 'treasure') {
    return {
      ...base,
      view: {
        kind: 'treasure', character: 'explorer', currentStageId: 's2',
        stageName: 'Chặng 2 — Kỹ năng lắng nghe',
        prompt: LONG_PROMPT, story: 'Nhà thám hiểm bước vào ngôi đền tri thức.',
        missionType: 'question',
        mission: { type: 'question' },
        stages: [
          // Statuses are exactly what treasureNodeState() in
          // renderer/features/games/treasure.ts emits:
          // done | failed | current | locked. Anything else renders unstyled.
          { id: 's1', name: 'Chặng 1', status: 'done' },
          { id: 's2', name: 'Chặng 2', status: 'current' },
          { id: 's3', name: 'Chặng 3', status: 'locked' },
          { id: 's4', name: 'Chặng 4', status: 'locked' }
        ],
        options: OPTIONS, selectedOptionId: null, correctOptionId: 'a', revealed: false,
        earned: 100, itemsFound: 1, totalStages: 4
      }
    };
  }
  if (kind === 'race') {
    return {
      ...base,
      view: {
        kind: 'race', trackLength: 12, round: 4, maxRounds: 10,
        currentTeamName: 'Đội Sao', currentTeamIcon: '⭐', prompt: LONG_PROMPT,
        options: OPTIONS, lastEvent: 'Đội Sao vượt lên dẫn đầu', completed: false,
        teams: [
          { id: 't1', name: 'Đội Sao', icon: '⭐', progress: 7, points: 300, active: true },
          { id: 't2', name: 'Đội Mặt Trời', icon: '☀️', progress: 5, points: 250 },
          { id: 't3', name: 'Đội Biển', icon: '🌊', progress: 4, points: 200 }
        ]
      }
    };
  }
  return {
    ...base, isComplete: true,
    view: {
      kind: 'results', title: 'Hoàn thành trò chơi', subtitle: 'Ôn tập kỹ năng sống lớp 6',
      medal: '🏆', scoreText: '300 / 500 điểm',
      rows: [
        { label: 'Đội Sao', value: '300 điểm', highlight: true },
        { label: 'Đội Mặt Trời', value: '250 điểm' },
        { label: 'Đội Biển', value: '200 điểm' }
      ],
      message: 'Các em đã hoàn thành tốt phần ôn tập hôm nay.'
    }
  };
}



async function call(ctx, name, ...args) {
  return ctx.evaluate(`desktop.call(${[name, ...args].map(x => JSON.stringify(x)).join(',')})`);
}

async function waitForQuiz(ctx) {
  return waitFor(() => ctx.evaluate(`document.querySelector('.prompt')?.textContent === ${JSON.stringify(LONG_PROMPT)} && document.querySelectorAll('.option').length === 4`), 'initial snapshot renders without a test push');
}

async function observeState(ctx, revision) {
  await ctx.evaluate(`(() => {
    window.__presProbe = { count: 0, state: null };
    desktop.listen('onPresentationState', state => {
      window.__presProbe.count++;
      window.__presProbe.state = state;
    });
    return true;
  })()`);
  await call(ctx, 'requestPresentationState');
  await waitFor(() => ctx.evaluate(`window.__presProbe.state?.revision === ${revision}`), 'snapshot subscription');
}

(async () => {
  const KINDS = ['quiz', 'matching', 'treasure', 'race', 'results'];
  let revision = 1;
  let pres;
  let started = false;
  const main = await connectTo(/^https?:\/\/tauri\.localhost\/(?:index\.html)?$/);
  try {
    await waitFor(() => main.evaluate(`typeof desktop !== 'undefined' && desktop.info().adapter === 'tauri'`), 'main facade');
    if (await findTarget(PORT, PRESENTATION_URL)) throw new Error('Use an isolated instance without an active presentation');
    const displays = await call(main, 'getDisplays');
    check('Rust reports an available display', displays.ok && displays.data.displays.length > 0);
    started = true;
    const opened = await call(main, 'startPresentation', stateFor('quiz', revision));
    check('startPresentation succeeds', opened.ok && opened.data.sessionId === SESSION_ID, JSON.stringify(opened));
    pres = await connectTo(PRESENTATION_URL);
    check('presentation is a separate CDP target', pres.target.id !== main.target.id, pres.target.url);
    await waitForQuiz(pres);
    check('initial snapshot arrives through the production subscription', true);
    check('real top-level Tauri renderer, no iframe harness', await pres.evaluate(`desktop.info().adapter === 'tauri' && !!document.querySelector('body > .presentation-root') && !document.querySelector('iframe')`));
    check('static presentation CSS has an active Tauri nonce', await pres.evaluate(`(() => {
      const style = document.querySelector('head style');
      return !!style?.nonce && !!style.sheet && !document.querySelector('body style')
        && getComputedStyle(document.querySelector('.presentation-root')).fontSize === '20px';
    })()`));
    await observeState(pres, revision);

    const reused = await call(main, 'startPresentation', stateFor('quiz', ++revision));
    await waitFor(() => pres.evaluate(`window.__presProbe.state?.revision === ${revision}`), 'reused window state');
    const targets = (await listTargets(PORT)).filter(t => PRESENTATION_URL.test(t.url));
    check('starting again reuses the same window', reused.ok && targets.length === 1 && targets[0].id === pres.target.id);

    for (const size of PROJECTOR_SIZES) {
      await setViewportAndWait(pres, size);
      console.log(`\n=== presentation @ ${size.label} ===`);
      for (const kind of KINDS) {
        const state = stateFor(kind, ++revision);
        await call(main, 'sendPresentationState', state);
        await waitFor(() => pres.evaluate(`window.__presProbe.state?.revision === ${revision}`), 'state-update round trip');
        const content = await pres.evaluate(`(() => {
          const q = document.querySelector('.prompt');
          const grid = document.querySelector('.options');
          const a = q?.getBoundingClientRect(), b = grid?.getBoundingClientRect();
          return {
            prompt: q?.textContent,
            options: [...document.querySelectorAll('.option > span:last-child')].map(el => el.textContent),
            matching: document.querySelectorAll('.match-card').length,
            results: document.querySelectorAll('.result-row').length,
            overlap: a && b ? a.bottom > b.top + 2 && b.bottom > a.top + 2 && a.right > b.left + 2 && b.right > a.left + 2 : null
          };
        })()`);
        const hasQuestion = ['quiz', 'treasure', 'race'].includes(kind);
        check(`${size.label} ${kind}: expected content is rendered`, hasQuestion
          ? content.prompt === LONG_PROMPT && JSON.stringify(content.options) === JSON.stringify(OPTIONS.map(o => o.text))
          : kind === 'matching' ? content.matching === 8 : content.results === 3, JSON.stringify(content));
        const m = await measureLayout(pres.evaluate);
        const shot = await capture(pres.send, `presentation-tauri-${kind}-${size.label}`);
        check(`${size.label} ${kind}: screenshot captured`, Boolean(shot.file), shot.file || shot.error);
        check(`${size.label} ${kind}: smallest text >= 20px`, m.minFont >= 20,
          `${m.minFont.toFixed(1)}px` + (m.smallest ? ` (${m.smallest.tag}.${m.smallest.cls} "${m.smallest.text}")` : ''));
        check(`${size.label} ${kind}: no clipped text`, m.clippedCount === 0, JSON.stringify(m.clipped));
        check(`${size.label} ${kind}: nothing outside the viewport`, m.outsideCount === 0, JSON.stringify(m.outside));
        check(`${size.label} ${kind}: no page scroll`, !m.scrolls, `${m.docHeight} vs ${size.height}`);
        check(`${size.label} ${kind}: no inner scroll area hides content`, m.innerScrollers.length === 0, m.innerScrollers.join(', '));
        if (hasQuestion) check(`${size.label} ${kind}: question and answers do not overlap`, content.overlap === false);
      }
    }

    for (const invalid of [
      { ...stateFor('quiz', revision - 1), gameTitle: 'STALE MUST NOT RENDER' },
      { ...stateFor('quiz', revision + 100), sessionId: SESSION_ID + '-other', gameTitle: 'FOREIGN MUST NOT RENDER' },
    ]) {
      await call(main, 'sendPresentationState', invalid);
      const count = await pres.evaluate('window.__presProbe.count');
      await call(pres, 'requestPresentationState');
      await waitFor(() => pres.evaluate(`window.__presProbe.count > ${count}`), 'snapshot after rejected update');
      check('stale/foreign update cannot replace the snapshot', await pres.evaluate(`window.__presProbe.state.revision === ${revision} && window.__presProbe.state.sessionId === ${JSON.stringify(SESSION_ID)} && document.querySelectorAll('.result-row').length === 3`), invalid.gameTitle);
    }

    await pres.evaluate('window.__presBeforeReload = true');
    await pres.send('Page.reload', { ignoreCache: true });
    await waitFor(() => pres.evaluate(`!window.__presBeforeReload && document.querySelectorAll('.result-row').length === 3`), 'snapshot in a new document after reload');
    check('reloaded presentation requests and renders the stored snapshot', true);
    await setViewportAndWait(pres, null);
    await pres.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await waitFor(async () => !(await findTarget(PORT, PRESENTATION_URL)), 'Escape closes presentation');
    pres.ws.close();
    pres = null;
    check('Escape closes the real presentation window', true);

    await call(main, 'startPresentation', stateFor('quiz', 1));
    pres = await connectTo(PRESENTATION_URL);
    await waitForQuiz(pres);
    check('reopening starts a fresh revision sequence', true);
    const button = await pres.evaluate(`(() => { const r = document.querySelector('#presentationExitBtn').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    await pres.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...button, button: 'left', clickCount: 1 });
    await pres.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...button, button: 'left', clickCount: 1 });
    await waitFor(async () => !(await findTarget(PORT, PRESENTATION_URL)), 'exit button closes presentation');
    pres.ws.close();
    pres = null;
    check('exit button closes the real presentation window', true);
    await call(main, 'startPresentation', stateFor('quiz', 1));
    pres = await connectTo(PRESENTATION_URL);
    await waitForQuiz(pres);
    await call(main, 'stopPresentation');
    await waitFor(async () => !(await findTarget(PORT, PRESENTATION_URL)), 'main stops presentation');
    pres.ws.close();
    pres = null;
    check('main can stop the real presentation window', true);
    check('main target survives unchanged', (await listTargets(PORT)).some(t => t.id === main.target.id && t.url === main.target.url));
    check('no renderer exceptions or console errors', runtimeErrors.length === 0, JSON.stringify(runtimeErrors));
    check('no stylesheet CSP violations', styleErrors.length === 0, JSON.stringify(styleErrors));
  } finally {
    if (pres?.ws.readyState === WebSocket.OPEN) await setViewportAndWait(pres, null).catch(() => {});
    if (started) {
      await call(main, 'stopPresentation');
      await waitFor(async () => !(await findTarget(PORT, PRESENTATION_URL)), 'presentation cleanup');
    }
    pres?.ws.close();
    main.ws.close();
  }
  const failed = results.filter(r => !r.ok);
  console.log(`\nui-presentation-check: ${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('ERROR: ' + e.message); process.exit(1); });
