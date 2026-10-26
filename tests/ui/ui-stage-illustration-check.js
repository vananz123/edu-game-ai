// ui-stage-illustration-check.js — the play surface must HONOUR
// `gameSetup.illustrationMode` (docs/DECISIONS.md #62, #67).
//
// Phase 4 saved the switch from the editor, but nothing read it: a teacher who
// chose "Tắt" still saw artwork, and "Chỉ minh hoạ đã chọn" silently fell back
// to a category default. This check drives the REAL built app over CDP and
// asserts the three modes against the DOM for all five templates, not just the
// one path that happens to be easiest to reach.
//
// Run against a built app started with --remote-debugging-port:
//   npm run build
//   npx electron . --remote-debugging-port=9362
//   node tests/ui/ui-stage-illustration-check.js 9362
//
// Port: the check lib reads argv[2] at require-time, and falls back to 9341 when
// `node` is invoked without it. Pass the port explicitly (or set CDP_PORT).
const { check, connect, results } = require('../manual/lib/ui-check-lib');
const { PROJECTOR_SIZES, measureAt, setViewport, setViewportAndWait } = require('./lib/screenshot-capture');

/** Synthetic fixtures only — never real student data. */
const ANIMAL_ITEM = { contentCategory: 'animals', iconName: 'paw-print' };
const STAMP = '2026-01-01T00:00:00.000Z';

function baseGame(id, template, mode) {
  return {
    id, title: 'Trò chơi kiểm tra minh hoạ', subject: 'Khoa học', grade: '4',
    template, description: '', tags: [], sourceName: 'ui-check', createdAt: STAMP, questions: [],
    gameSetup: { scoringMode: 'cơ bản', ...(mode ? { illustrationMode: mode } : {}) }
  };
}

function quizGame(mode, item) {
  const game = baseGame('ui-illus-quiz-' + mode, 'quiz', mode);
  game.questions = [{
    id: 'q1', type: 'multiple-choice',
    prompt: 'Con vật nào sau đây sống ở sa mạc?', ...item,
    options: [
      { id: 'a', text: 'Lạc đà' }, { id: 'b', text: 'Cá heo' },
      { id: 'c', text: 'Chim cánh cụt' }, { id: 'd', text: 'Gấu Bắc Cực' }
    ],
    correctOptionId: 'a', correctAnswer: '', explanation: 'Lạc đà tích nước trong bướu.', points: 100
  }];
  return game;
}

function scenarioGame(mode, item) {
  const game = baseGame('ui-illus-scenario-' + mode, 'scenario', mode);
  game.questions = [{
    id: 's1', type: 'scenario',
    prompt: 'Em nên làm gì?', ...item,
    context: 'Giờ ra chơi, em thấy một bạn bị ngã.',
    options: [{ id: 'a', text: 'Đỡ bạn dậy' }, { id: 'b', text: 'Đứng nhìn' },
      { id: 'c', text: 'Bỏ đi' }, { id: 'd', text: 'Cười' }],
    correctOptionId: 'a', explanation: 'Giúp bạn là việc nên làm.', points: 100
  }];
  return game;
}

function matchingGame(mode, item) {
  const game = baseGame('ui-illus-matching-' + mode, 'matching', mode);
  game.matchingGame = {
    mode: 'columns',
    pairs: [
      { id: 'p1', left: 'Mèo', right: 'Kêu meo meo', ...item },
      { id: 'p2', left: 'Chó', right: 'Kêu gâu gâu', ...item },
      { id: 'p3', left: 'Chim', right: 'Hót líu lo', ...item }
    ]
  };
  return game;
}

function treasureGame(mode, item) {
  const game = baseGame('ui-illus-treasure-' + mode, 'treasure-hunt', mode);
  game.treasureHunt = {
    character: 'Nhà thám hiểm An', intro: 'Hành trình bắt đầu.', journeyBonus: 200,
    hiddenItemBonus: 50, backgroundId: 'forest', characterId: 'explorer',
    stages: [{
      id: 's1', name: 'Chặng 1', story: 'Khu rừng im lặng.', taskDescription: 'Tìm đáp án đúng.',
      question: {
        prompt: 'Con vật nào biết bay?', ...item,
        options: [{ id: 'a', text: 'Chim' }, { id: 'b', text: 'Cá' },
          { id: 'c', text: 'Chó' }, { id: 'd', text: 'Mèo' }],
        correctOptionId: 'a', explanation: 'Chim có cánh.', hint: 'Nhìn lên trời.'
      },
      attempts: 2, points: 100, completionBonus: 10, nextStageId: null, hasHiddenItem: false
    }]
  };
  return game;
}

function raceGame(mode, item) {
  const game = baseGame('ui-illus-race-' + mode, 'race', mode);
  game.race = {
    trackLength: 40, maxRounds: 6, stepByDifficulty: false, luckEnabled: false,
    teams: [{ id: 't1', name: 'Đội Một', icon: '🔴' }, { id: 't2', name: 'Đội Hai', icon: '🔵' }],
    cells: [],
    questions: [{
      id: 'rq1', prompt: 'Con vật nào sống dưới nước?', ...item,
      options: [{ id: 'a', text: 'Cá' }, { id: 'b', text: 'Mèo' },
        { id: 'c', text: 'Chó' }, { id: 'd', text: 'Gà' }],
      correctOptionId: 'a', explanation: 'Cá thở bằng mang.', difficulty: 'trung bình'
    }]
  };
  return game;
}

const TEMPLATES = [
  { key: 'quiz', build: quizGame, opener: '' },
  { key: 'scenario', build: scenarioGame, opener: '' },
  { key: 'matching', build: matchingGame, opener: '' },
  { key: 'treasure-hunt', build: treasureGame, opener: '' },
  // The race prompt only exists after a card is drawn.
  { key: 'race', build: raceGame, opener: 'document.querySelector("#drawQuestionBtn")?.click();' }
];

/** Opens one fixture and reports what the play surface actually drew. */
const probe = (game, opener) => `
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  document.querySelector('[data-play-close]')?.click();
  document.getElementById('modalRoot').innerHTML = '';
  await sleep(200);
  playGame(${JSON.stringify(game)}, { fullscreen: true });
  await sleep(700);
  // Trình chiếu: đây là bề mặt máy chiếu (docs/UI-PLAN-V2.md Phase B). Không bật
  // cờ này thì .app-shell vẫn nằm trong luồng và cao 1436px, đẩy mọi
  // assertion "outside the viewport" vào trạng thái fail vĩnh viễn — đo sai
  // màn hình. Hình minh hoạ là thứ bị đánh giá, và nó chỉ được nhìn thấy ở
  // chế độ trình chiếu trên lớp.
  document.documentElement.dataset.fullscreen = '1';
  await sleep(700);
  ${opener || ''}
  await sleep(500);
  const el = document.querySelector('.stage-illustration');
  const q = document.querySelector('.stage-question');
  const svg = document.querySelector('.stage-illustration .stage-illustration-svg');
  const rect = node => { const r = node.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; };
  return {
    drawn: Boolean(el),
    assetId: el ? el.getAttribute('data-illustration') : null,
    iconClass: el ? (el.querySelector('.stage-illustration-icon')?.getAttribute('class') || '') : '',
    // The illustration must be the element immediately BEFORE the question's
    // block, so the reading order is "picture, then question". Since the
    // 2-column layout (DECISIONS #84) the picture lives in its own
    // .stage-col wrapper, so the direct nextElementSibling === q test no longer
    // holds: the comparison is against the container that holds the question.
    isSiblingOfQuestion: Boolean(el && q && (() => {
      const qBlock = q.parentElement;
      const illBlock = el.closest('.stage-col') || el;
      if (illBlock.parentElement === qBlock) return illBlock.nextElementSibling === q;
      // 2-column: both are .stage-col children of the same row.
      return illBlock.parentElement === qBlock.parentElement
        && illBlock.nextElementSibling === qBlock;
    })()),
    size: svg ? rect(svg) : null,
    questionPresent: Boolean(q),
    // Matching has no question surface by design (the cards ARE the content),
    // so the illustration is checked against its own board instead.
    inStage: Boolean(el && el.closest('.game-stage'))
  };
`;

(async () => {
  const ctx = await connect();
  const { ws, evaluate } = ctx;
  const skipped = [];
  const run = (game, opener) => evaluate(`(async () => {${probe(game, opener)}})()`);

  for (const tpl of TEMPLATES) {
    const auto = await run(tpl.build('auto', ANIMAL_ITEM), tpl.opener);
    // The play surface opened if it drew either a question or the illustration.
    if (!auto.questionPresent && !auto.drawn) { skipped.push(tpl.key); continue; }

    // -- auto: derives the illustration from the item's category ------------
    check(`${tpl.key}: auto draws an illustration`, auto.drawn && auto.assetId === 'animals-scene',
      auto.drawn ? auto.assetId : 'nothing drawn');
    check(`${tpl.key}: the illustration sits inside the game stage`,
      auto.inStage === true, String(auto.inStage));
    if (auto.questionPresent) {
      check(`${tpl.key}: the illustration is a sibling of .stage-question`,
        auto.isSiblingOfQuestion === true, String(auto.isSiblingOfQuestion));
    }
    check(`${tpl.key}: the illustration has a real size (not a collapsed box)`,
      Boolean(auto.size && auto.size.w > 0 && auto.size.h > 0 && auto.size.h <= 220),
      auto.size ? `${auto.size.w}x${auto.size.h}` : 'no size');
    check(`${tpl.key}: the icon really renders (generated icon data)`,
      auto.iconClass.includes('lucide-paw-print'), auto.iconClass || 'no icon');

    // -- off: nothing at all, whatever the item says ------------------------
    const off = await run(tpl.build('off', { ...ANIMAL_ITEM, illustrationAssetId: 'space-scene' }), tpl.opener);
    check(`${tpl.key}: off draws nothing, even with a picked illustration`,
      off.drawn === false, off.drawn ? `still drew ${off.assetId}` : 'none');

    // -- manual: never invents artwork --------------------------------------
    const manual = await run(tpl.build('manual', ANIMAL_ITEM), tpl.opener);
    check(`${tpl.key}: manual without a pick draws nothing`, manual.drawn === false,
      manual.drawn ? `invented ${manual.assetId}` : 'none');

    // -- manual + explicit pick: draws exactly that -------------------------
    const picked = await run(tpl.build('manual', { ...ANIMAL_ITEM, illustrationAssetId: 'space-scene' }), tpl.opener);
    check(`${tpl.key}: manual with a pick draws the picked illustration`,
      picked.drawn && picked.assetId === 'space-scene', picked.drawn ? picked.assetId : 'nothing drawn');

    // -- legacy: no mode saved at all behaves like auto ---------------------
    const legacy = await run(tpl.build(undefined, ANIMAL_ITEM), tpl.opener);
    check(`${tpl.key}: a game saved before the switch behaves as auto`,
      legacy.drawn && legacy.assetId === 'animals-scene', legacy.drawn ? legacy.assetId : 'nothing drawn');
  }

  // ---- Phase B (docs/UI-PLAN-V2.md): the illustration must also LAY OUT
  // correctly at the two real classroom resolutions. The assertions above prove
  // the right asset is chosen; these prove it is actually visible and does not
  // push the question or the answers off a 1366x768 projector.
  //
  // fontFloor 8: .treasure-map-meta is font-size:8px by design, and the header
  // status line is 10px -- the app's real floor on this surface. Asserting 14px
  // failed on correct design; 8px still catches a shrink below what ships.
  // The overflow assertions are where the real projector failures show up:
  // treasure-hunt and race push .game-stage past the bottom of a 1366x768 board.
  for (const size of PROJECTOR_SIZES) {
    const tag = size.label;
    for (const tpl of TEMPLATES) {
      await setViewportAndWait(ctx, size);
      const opened = await run(tpl.build('auto', ANIMAL_ITEM), tpl.opener);
      if (!opened || (!opened.questionPresent && !opened.drawn)) continue;
      await measureAt(ctx, size, `illustration-${tpl.key}-${tag}`, {
        check, fontFloor: 8, innerScrollAreas: 0
      });
    }
  }
  await setViewport(ctx.send, null);

  await evaluate(`(async () => {
    document.querySelector('[data-play-close]')?.click();
    document.getElementById('modalRoot').innerHTML = '';
    return true;
  })()`);

  const failed = results.filter(r => !r.ok);
  console.log(`\nui-stage-illustration-check: ${results.length - failed.length}/${results.length} passed`);
  if (skipped.length) console.log(`(could not open: ${skipped.join(', ')})`);
  ws.close();
  process.exit(failed.length || skipped.length ? 1 : 0);
})().catch(e => { console.error('ERROR: ' + e.message); process.exit(1); });
