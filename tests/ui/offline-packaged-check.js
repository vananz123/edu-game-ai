// offline-packaged-check.js — màn chơi + minh hoạ phải chạy được khi KHÔNG có mạng.
//
// Đây là bước nghiệm thu mà Phase 4–5 còn thiếu (docs/DECISIONS.md #67): mọi
// thứ trước đó chỉ chạy trên bản dev. Script này chạy trên app ĐÃ ĐÓNG GÓI, cài
// bộ đếm request mạng TRƯỚC khi chơi, rồi chơi cả 5 thể loại. Nếu minh hoạ hay
// màn chơi lén phụ thuộc mạng thì số request bị đếm sẽ > 0.
//
// Chạy trên app ĐÃ ĐÓNG GÓI. PHẢI dùng EDUGAME_USER_DATA mới cho mỗi lần chạy —
// src/main.ts ghim userData theo biến này (--user-data-dir bị bỏ qua), và profile
// cũ giữ lại document cũ đã bị vá prototype, khiến "bộ đếm mù" giả. Xem #68.
//
//   $env:EDUGAME_USER_DATA = "$env:TEMP\eg-$PID"
//   "release\win-unpacked\EduGame Studio.exe" --remote-debugging-port=9380
//   node tests/ui/offline-packaged-check.js 9380
const { check, connect, results } = require('../manual/lib/ui-check-lib');

(async () => {
  const { evaluate } = await connect();
  const out = await evaluate(RUNNER);
  if (!out || typeof out !== 'object') throw new Error('runner returned nothing');

  check('the app runs from the packaged build (file:// + asar)', out.packaged === true, out.packagedMsg);
  check('the preload bridge exists in the packaged build', out.bridge === true, out.bridgeMsg);
  check('no outbound request was attempted while playing', out.attempts === 0, `attempts=${out.attempts} ${out.attemptUrls}`);
  check('the network counter is proven live (positive control)', out.controlSeen === true, out.controlMsg);
  check('offline: quiz plays and draws its illustration', out.quiz === true, out.quizMsg);
  check('offline: scenario plays and draws its illustration', out.scenario === true, out.scenarioMsg);
  check('offline: matching plays and draws its illustration', out.matching === true, out.matchingMsg);
  check('offline: treasure hunt plays and draws its illustration', out.treasure === true, out.treasureMsg);
  check('offline: race plays and draws its illustration', out.race === true, out.raceMsg);
  check('offline: illustrationMode "off" still draws nothing', out.off === true, out.offMsg);
  check('every illustration is inline SVG, nothing to fetch', out.inline === true, out.inlineMsg);

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error('offline-packaged-check failed to run:', err && err.message);
  process.exit(1);
});

const RUNNER = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const out = {};
  out.attemptUrls = '';
  const attempts = [];
  const CONTROL = 'https://example.invalid/edugame-control';
  const isRemote = u => /^(https?|wss?|ftp):/i.test(String(u || ''));

  // --- network tripwire, installed BEFORE any game is played ----------------
  const origFetch = window.fetch;
  window.fetch = function (input) {
    const u = typeof input === 'string' ? input : (input && input.url);
    if (isRemote(u)) attempts.push('fetch:' + u);
    return origFetch.apply(this, arguments);
  };
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, u) {
    if (isRemote(u)) attempts.push('xhr:' + u);
    return origOpen.apply(this, arguments);
  };
  const OrigWS = window.WebSocket;
  window.WebSocket = function (u) {
    if (isRemote(u)) attempts.push('ws:' + u);
    return new OrigWS(u);
  };
  if (navigator.sendBeacon) {
    // Bound explicitly: calling it detached from navigator throws
    // "Illegal invocation", which would break telemetry in real use.
    const origBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (u) {
      if (isRemote(u)) attempts.push('beacon:' + u);
      return origBeacon.apply(null, arguments);
    };
  }

  // --- environment facts ----------------------------------------------------
  const loc = location.href;
  out.packaged = loc.startsWith('file://');
  out.packagedMsg = loc.slice(0, 62);
  out.bridge = typeof window.eduGame === 'object' && window.eduGame !== null;
  out.bridgeMsg = 'typeof window.eduGame = ' + typeof window.eduGame;

  // --- one synthetic fixture per template ----------------------------------
  // Shapes copied from tests/ui/ui-stage-illustration-check.js, which is proven
  // 44/44 on this same build. Guessing these shapes is what made the first run
  // report "no .game-stage" on four templates.
  const opts = [
    { id: 'a', text: 'Chim' }, { id: 'b', text: 'Cá' },
    { id: 'c', text: 'Chó' }, { id: 'd', text: 'Mèo' },
  ];
  const item = { contentCategory: 'animals', iconName: 'paw-print' };
  const base = (id, template) => ({
    id, title: 'Offline ' + template, subject: 'Khoa học', grade: '4',
    template, description: '', tags: [], sourceName: 'offline-check',
    createdAt: '2026-01-01T00:00:00.000Z', questions: [],
    gameSetup: { scoringMode: 'cơ bản' },
  });

  const games = {
    quiz: Object.assign(base('off-quiz', 'quiz'), {
      questions: [{
        id: 'q1', type: 'multiple-choice', prompt: 'Con vật nào biết bay?', ...item,
        options: opts, correctOptionId: 'a', correctAnswer: '',
        explanation: 'Chim có cánh.', points: 100,
      }],
    }),
    scenario: Object.assign(base('off-sc', 'scenario'), {
      questions: [{
        id: 's1', type: 'scenario', prompt: 'Em nên làm gì?', ...item,
        context: 'Giờ ra chơi, em thấy một bạn bị ngã.',
        options: opts, correctOptionId: 'a',
        explanation: 'Giúp bạn là việc nên làm.', points: 100,
      }],
    }),
    matching: Object.assign(base('off-match', 'matching'), {
      matchingGame: {
        mode: 'columns',
        pairs: [
          { id: 'p1', left: 'Mèo', right: 'Kêu meo meo', ...item },
          { id: 'p2', left: 'Chó', right: 'Kêu gâu gâu', ...item },
        ],
      },
    }),
    'treasure-hunt': Object.assign(base('off-tr', 'treasure-hunt'), {
      treasureHunt: {
        character: 'Nhà thám hiểm An', intro: 'Hành trình bắt đầu.', journeyBonus: 200,
        hiddenItemBonus: 50, backgroundId: 'forest', characterId: 'explorer',
        stages: [{
          id: 's1', name: 'Chặng 1', story: 'Khu rừng im lặng.',
          taskDescription: 'Tìm đáp án đúng.',
          question: {
            prompt: 'Con vật nào biết bay?', ...item, options: opts,
            correctOptionId: 'a', explanation: 'Chim có cánh.', hint: 'Nhìn lên trời.',
          },
          attempts: 2, points: 100, completionBonus: 10,
          nextStageId: null, hasHiddenItem: false,
        }],
      },
    }),
    race: Object.assign(base('off-race', 'race'), {
      race: {
        trackLength: 40, maxRounds: 6, stepByDifficulty: false, luckEnabled: false,
        teams: [{ id: 't1', name: 'Đội Một', icon: '🔴' }, { id: 't2', name: 'Đội Hai', icon: '🔵' }],
        cells: [],
        questions: [{
          id: 'rq1', prompt: 'Con vật nào sống dưới nước?', ...item, options: opts,
          correctOptionId: 'a', explanation: 'Cá thở bằng mang.', difficulty: 'trung bình',
        }],
      },
    }),
  };

  // The race prompt only exists after a card is drawn.
  const openers = { race: () => document.querySelector('#drawQuestionBtn')?.click() };

  // --- play and inspect ----------------------------------------------------
  const playAndInspect = async (template, mode) => {
    const game = JSON.parse(JSON.stringify(games[template]));
    if (mode === 'off') game.gameSetup.illustrationMode = 'off';
    document.querySelector('[data-play-close]')?.click();
    document.getElementById('modalRoot').innerHTML = '';
    await sleep(250);
    playGame(game);
    await sleep(700);
    const open = openers[template];
    if (open) { open(); await sleep(500); }
    const stage = document.querySelector('.game-stage');
    const illus = document.querySelector('.stage-illustration');
    const svg = illus ? illus.querySelector('.stage-illustration-svg') : null;
    let remoteImgs = 0;
    if (stage) {
      stage.querySelectorAll('img, image').forEach(n => {
        if (isRemote(n.getAttribute('src') || n.getAttribute('href'))) remoteImgs++;
      });
    }
    const r = {
      drawn: !!(stage && illus && svg),
      stageFound: !!stage,
      remoteImgs,
      msg: !stage ? 'no .game-stage'
        : !illus ? 'no .stage-illustration'
        : !svg ? '.stage-illustration has no .stage-illustration-svg'
        : 'illustration present (inline svg)',
    };
    document.querySelector('[data-play-close]')?.click();
    document.getElementById('modalRoot').innerHTML = '';
    await sleep(350);
    return r;
  };

  let firstSvgIsInline = null;
  for (const template of Object.keys(games)) {
    const key = template === 'treasure-hunt' ? 'treasure' : template;
    let r;
    try { r = await playAndInspect(template, 'auto'); }
    catch (e) { r = { drawn: false, msg: 'threw: ' + (e && e.message), remoteImgs: 0 }; }
    out[key] = r.drawn === true;
    out[key + 'Msg'] = r.msg;
    if (r.remoteImgs) attempts.push('img:' + template);
    if (key === 'quiz' && r.drawn) firstSvgIsInline = true;
  }

  // "off" must draw nothing even though "auto" drew something for the same game.
  const offRun = await playAndInspect('quiz', 'off');
  out.off = offRun.stageFound === true && offRun.drawn === false;
  out.offMsg = offRun.msg;

  out.inline = firstSvgIsInline === true;
  out.inlineMsg = 'first illustration is an inline <svg> with no <img> to fetch';

  // --- read the tripwire ---------------------------------------------------
  await sleep(400);
  // Leftovers from earlier runs on the same page (and the control issued just
  // below) must never count as real traffic.
  const realTraffic = () => attempts.filter((u) => String(u).indexOf('edugame-control') === -1);
  performance.getEntriesByType('resource').map(e => e.name).filter(isRemote)
    .forEach(u => attempts.push('resource:' + u));
  out.attempts = realTraffic().length;
  out.attemptUrls = realTraffic().slice(0, 5).join(', ');

  // --- positive control ----------------------------------------------------
  // A zero count is worthless unless the counter is proven to count. Issue one
  // request through the WRAPPER (window.fetch, never origFetch - calling the
  // saved original bypasses the wrapper and always reports a false "blind") and
  // confirm the wrapper recorded it.
  //
  // This control earned its place: an earlier version recorded nothing for this
  // exact reason while every other check still passed.
  //
  // Measured on this machine 2026-10-24: a reserved-TLD host (example.invalid)
  // fails in ~7 ms with a TypeError, and the promise is never awaited here, so
  // the control cannot hang the run.
  try {
    window.fetch(CONTROL, { signal: AbortSignal.timeout(2000) }).catch(() => {});
  } catch (e) {
    // A synchronous throw still proves the call path was exercised.
  }
  await sleep(150); // let the wrapper record; the response is irrelevant
  const sawControl = attempts.some((u) => String(u).indexOf('edugame-control') !== -1);

  out.controlSeen = sawControl;
  out.controlMsg = sawControl
    ? 'wrapper observes an outbound fetch'
    : 'COUNTER IS BLIND - the 0 above cannot be trusted';
  out.attempts = realTraffic().length;
  out.attemptUrls = realTraffic().slice(0, 5).join(', ');
  return out;
})()`;

