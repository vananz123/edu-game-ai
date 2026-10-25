// ui-presentation-check.js — projector readability of the SECONDARY-DISPLAY
// presentation window (src/presentation/presentation.html + features/presentation.ts).
//
// Why this exists (update_UI.txt §7.1, §7.2, §14):
// The presentation window is a SEPARATE renderer. It does not reuse
// gameplay.ts, it does not load app.css, and its own <style> block hardcodes
// font sizes. None of the measured fullscreen rules
// (`html[data-fullscreen="1"] .modal[data-player-theme] …` in app.css) can
// reach it, because its DOM root is `document.body > .presentation-root`.
// So the classroom projector can show text far smaller than the same game in
// the main window — exactly the "chữ quá nhỏ" complaint, on the surface that
// matters most.
//
// Run:
//   npm run build
//   npx electron . --remote-debugging-port=9361
//   node tests/ui/ui-presentation-check.js 9361
//
// The window is driven the way the app drives it: `syncState(state)` with a
// monotonically increasing `revision`, the same contract
// `eduGame.onPresentationState` uses (see presentation.ts:307-335).
const { check, results } = require('../manual/lib/ui-check-lib');
const { PROJECTOR_SIZES, setViewport, capture, measureLayout, findTarget, listTargets } = require('./lib/screenshot-capture');

const PORT = Number(process.argv[2] || process.env.CDP_PORT || 9361);

/** The script under test runs inside this same-origin iframe (see below). */
const IFRAME_SEL = '#pres-harness';

/**
 * Connect to a specific CDP target by URL matcher.
 * Mirrors ui-check-lib.connect() but does not hardcode index.html, because the
 * presentation window is a separate target.
 */
async function connectTo(matcher) {
  const target = await findTarget(PORT, matcher);
  if (!target) {
    const found = (await listTargets(PORT)).map(t => t.url).join('\n  ');
    throw new Error(`no target matching ${matcher} on port ${PORT}. Pages:\n  ` + found);
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
  let id = 0;
  const pend = new Map();
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  });
  const send = (method, params = {}) => new Promise((r, j) => {
    const i = ++id;
    const timer = setTimeout(() => {
      pend.delete(i);
      j(new Error(`CDP timeout after 15s: ${method}`));
    }, 15000);
    pend.set(i, (m) => { clearTimeout(timer); r(m); });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const evaluate = async expression => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval error');
    return r.result?.result?.value;
  };
  await send('Runtime.enable');
  await send('Page.enable');
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
    sessionId: 'pres-check', gameId: 'pres-check-game',
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
        missionType: 'multiple-choice',
        stages: [
          // Statuses are exactly what gameplay.ts:931 treasureNodeState() emits:
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



// Drive the window through the SAME contract the app uses: presentation.ts:341
// calls initPresentation(), which subscribes via eduGame.onPresentationState
// and renders whatever state arrives (syncState -> renderPresentation).
//
// The real api cannot be patched: window.eduGame is exposed by Electron's
// contextBridge and is deep-frozen (isFrozen true), and because this tab was
// navigated from index.html it still carries the MAIN preload, whose
// onPresentationState is wired to a different IPC channel. So the presentation
// script is re-executed here with a recording api, and states are pushed through
// the captured subscriber. The script body, the DOM root (document.body >
// .presentation-root) and its own inline <style> are exactly production's.
const RERUN_WITH_RECORDING_API = `
  (async () => {
    // window.eduGame is non-configurable (contextBridge), so it cannot be
    // shadowed in this window. Run the presentation script inside a same-origin
    // iframe instead: that document has a fresh, writable window where the
    // recording api can be installed before the script executes. The document
    // root, the script's own inline <style>, and every selector are identical.
    const src = await (await fetch(SCRIPT_URL)).text();
    const frame = document.createElement('iframe');
    frame.id = 'pres-harness';
    frame.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;border:0;margin:0';
    document.body.innerHTML = '';
    document.body.style.margin = '0';
    document.body.appendChild(frame);

    const w = frame.contentWindow;
    const listeners = [];
    w.eduGame = {
      onPresentationState: (cb) => { listeners.push(cb); return () => {}; },
      onPresentationExit: () => {},
      requestPresentationState: () => {},
      sendPresentationExit: () => {},
      sendPresentationState: () => {}
    };
    // The script decides presentation mode from location.search.
    w.history.replaceState(null, '', '?presentation=1&session=pres-check');
    w.eval(src);

    if (!listeners.length) return { ok: false, reason: 'script did not subscribe' };
    window.__presPush = (state) => listeners.forEach(fn => fn(state));
    return { ok: true, listeners: listeners.length };
  })()
`;

// Push one state exactly once the page has subscribed.
function pushState(kind, revision) {
  return `
    (async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      if (typeof window.__presPush !== 'function') {
        return { ok: false, reason: 'no onPresentationState subscriber' };
      }
      window.__presPush(${JSON.stringify(stateFor(kind, revision))});
      await sleep(450);
      return { ok: true };
    })()
  `;
}

(async () => {
  const KINDS = ['quiz', 'matching', 'treasure', 'race', 'results'];
  let revision = 1;

  // Recover from a previous interrupted run that left the tab on the
  // presentation page: find any page target and send it back to index.html.
  const anyPage = await findTarget(PORT, /.*/);
  if (!anyPage) throw new Error(`no CDP page targets on port ${PORT}`);
  let main;
  if (/index\.html/.test(anyPage.url)) {
    main = await connectTo(/index\.html/);
  } else {
    const indexUrl = anyPage.url.replace(/presentation[\/\\]presentation\.html.*$/, 'index.html');
    const tmp = await connectTo(/presentation\.html/);
    await tmp.send('Page.enable');
    await tmp.send('Page.navigate', { url: indexUrl });
    await new Promise(r => setTimeout(r, 2500));
    try { tmp.ws.close(); } catch {}
    main = await connectTo(/index\.html/);
  }

  // The real presentation window is a frameless, fullscreen BrowserWindow
  // created by the main process (presentation-manager.ts:40-56) and loaded with
  // loadURL to src/presentation/presentation.html. Its scripts cannot be
  // reproduced by window.open() (blocked from file://) and Electron's CDP has
  // no Target.createTarget, so the page is navigated into this tab as a
  // top-level document: same URL, same document.body > .presentation-root, and
  // sized with device metrics to the exact projector resolution.
  const presPath = 'presentation/presentation.html?presentation=1&session=pres-check';
  const presUrl = main.target.url.replace(/index\.html.*$/, presPath);

  await main.send('Page.enable');
  const nav = await main.send('Page.navigate', { url: presUrl });
  if (nav?.result?.errorText) throw new Error('navigate to presentation failed: ' + nav.result.errorText);
  await new Promise(r => setTimeout(r, 2000));

  const pres = await connectTo(/presentation\.html/);
  console.log('presentation page: ' + pres.target.url);
  const scriptUrl = new URL('../renderer/features/presentation.js', pres.target.url).href;
  const rerun = await pres.evaluate(RERUN_WITH_RECORDING_API.replace('SCRIPT_URL', JSON.stringify(scriptUrl)));
  console.log('re-ran presentation.js with recording api: ' + JSON.stringify(rerun));
  if (!rerun || !rerun.ok) throw new Error('presentation.js did not subscribe: ' + JSON.stringify(rerun));

  for (const size of PROJECTOR_SIZES) {
    await setViewport(pres.send, size);
    console.log(`\n=== presentation @ ${size.label} ===`);
    for (const kind of KINDS) {
      const pushed = await pres.evaluate(pushState(kind, ++revision));
      if (!pushed || !pushed.ok) {
        check(`${size.label} ${kind}: presentation rendered`, false, pushed && pushed.reason);
        continue;
      }
      const m = await measureLayout(pres.evaluate, IFRAME_SEL);
      const shot = await capture(pres.send, `presentation-${kind}-${size.label}`);
      const file = shot.file || ('(no image: ' + shot.error + ')');
      console.log(`  ${kind.padEnd(9)} minFont ${m.minFont.toFixed(0)}px  clipped ${m.clippedCount}  outside ${m.outsideCount}  scrolls ${m.scrolls}  -> ${file}`);

      // §7.2: the smallest text on a projector screen must still be readable
      // from the back of a classroom. 20px is the floor already enforced for
      // answers in the main window (ui-fullscreen-density-check.js:127).
      check(`${size.label} ${kind}: smallest text >= 20px`, m.minFont >= 20,
        `${m.minFont.toFixed(1)}px` + (m.smallest ? ` (${m.smallest.tag}.${m.smallest.cls} "${m.smallest.text}")` : ''));
      check(`${size.label} ${kind}: no clipped text`, m.clippedCount === 0,
        m.clippedCount ? JSON.stringify(m.clipped[0]) : '');
      check(`${size.label} ${kind}: nothing outside the viewport`, m.outsideCount === 0, String(m.outsideCount));
      check(`${size.label} ${kind}: no page scroll`, !m.scrolls, `${m.docHeight} vs ${size.height}`);
      check(`${size.label} ${kind}: no inner scroll area hides content`,
        m.innerScrollers.length === 0, m.innerScrollers.join(', '));
      check(`${size.label} ${kind}: question and answers do not overlap`, !m.questionAnswerOverlap);
      if (process.env.DIAG_HOLD && process.env.DIAG_HOLD === `${size.label}:${kind}`) {
        await new Promise(r => setTimeout(r, 25000));
      }
    }
  }

  await setViewport(pres.send, null);
  try { pres.ws.close(); } catch {}
  // The tab now shows the presentation page instead of the app. Leave it on
  // index.html so the running app is not left in a strange state.
  try { await main.send('Page.navigate', { url: main.target.url }); } catch {}
  const failed = results.filter(r => !r.ok);
  console.log(`\nui-presentation-check: ${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('ERROR: ' + e.message); process.exit(1); });
