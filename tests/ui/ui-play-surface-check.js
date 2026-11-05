// ui-play-surface-check.js — regression guard for the play screen UI.
//
// Covers three defects teachers reported:
//   1. game screen text too small / wasted space / no colour
//   2. "Trình chiếu" button broken (label clipped inside a 30x30 box)
//   3. nav icons not prominent
//
// Retrofit (docs/UI-PLAN-V2.md Phase B): the play screen is now measured at the
// two real classroom resolutions with a PNG per size, instead of at whatever
// size the OS window happened to be. Before this the check could not see a
// 1366x768-only defect at all — and 1366x768 is the commonest projector.
//
// Run against a built app started with --remote-debugging-port:
//   npm run build
//   npx electron . --remote-debugging-port=9341
//   node tests/ui/ui-play-surface-check.js 9341
const { check, connect, results } = require('../manual/lib/ui-check-lib');
const { PROJECTOR_SIZES, measureAt, setViewport, setViewportAndWait, capture } = require('./lib/screenshot-capture');

// Synthetic content only — no real student data (AGENTS.md). Long Vietnamese
// with stacked diacritics on purpose: "ế/ộ/ữ" are what clip when line-height is
// too tight for the font.
const LONG = 'Khi gặp một bạn mới trong lớp, cách nào sau đây thể hiện sự tôn trọng, giúp em kết bạn tốt hơn và giữ được thiện chí của cả hai bên?';

// Built with JSON.stringify rather than as a quoted literal: the fixture then
// contains no hand-written quoting to get wrong.
const GAME = JSON.stringify({
  id: 'ui-play-surface', title: 'Làm quen bạn mới', subject: 'Đạo đức', grade: '4',
  template: 'quiz', description: '', tags: [], sourceName: 'ui-check',
  createdAt: '2026-01-01T00:00:00.000Z',
  gameSetup: { scoringMode: 'cơ bản', illustrationMode: 'auto' },
  questions: [{
    id: 'q1', type: 'multiple-choice', prompt: LONG,
    contentCategory: 'animals', iconName: 'paw-print',
    options: [
      { id: 'a', text: 'Chủ động chào hỏi, hỏi thăm bạn một cách tự nhiên và lắng nghe' },
      { id: 'b', text: 'Đứng quan sát từ xa cho đến khi bạn ấy nói trước' },
      { id: 'c', text: 'Kể ngay một câu chuyện cười thật dài để gây chú ý' },
      { id: 'd', text: 'Chờ giáo viên giới thiệu rồi mới dám lên tiếng' }
    ],
    correctOptionId: 'a', correctAnswer: '',
    explanation: 'Chào hỏi chủ động là bước đầu tiên của một tình bạn mới.', points: 100
  }]
});

/**
 * Open the play surface at fullscreen layout.
 *
 * Uses the same entry point as the "Trình chiếu" button — `playGame(game,
 * { fullscreen: true })`. Clicking that button toggles `data-fullscreen` twice
 * (on, then off), so a click-driven open measured the NON-fullscreen layout.
 */
const OPEN = game => `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  document.querySelector('[data-play-close]')?.click();
  document.getElementById('modalRoot').innerHTML = '';
  await sleep(300);
  playGame(${game}, { fullscreen: true });
  await sleep(900);
  // The OS window may be smaller than the emulated viewport; the layout flag is
  // what the fullscreen rules key on, so pin it as well.
  document.documentElement.dataset.fullscreen = '1';
  await sleep(250);
  return {
    stage: Boolean(document.querySelector('.game-stage')),
    question: Boolean(document.querySelector('.stage-question')),
    option: Boolean(document.querySelector('.answer-option'))
  };
})()`;

/**
 * "Tìm kho báu" fixture — the template DECISIONS #85 fixed, and the only one of
 * the four play templates the play-surface check used to leave unmeasured.
 *
 * `stageCount` is a parameter on purpose. Treasure renders its journey as a
 * horizontal map whose height is driven by the node labels, and #85 made the map
 * `flex-shrink: 0` so a tall map can never be squeezed into clipping its own
 * node text — a change whose proof needs a map that is actually tall. The 6-stage
 * case is the regression guard; the 12-stage case is what tests the shrink rule
 * (12 nodes wrap the track into several rows at both projector widths).
 *
 * Mission is `multiple-choice` for every stage: that is the mechanic whose
 * options go through `#treasureMission > .answer-grid`, the grandchild selector
 * #85 documents as a trap.
 */
function treasureGame(stageCount, id, illustrationMode) {
  const stages = Array.from({ length: stageCount }, (_, i) => {
    const n = i + 1;
    return {
      id: 's' + n,
      name: 'Chặng ' + n,
      // Long enough to wrap on a projector, with stacked diacritics.
      story: ('Bối cảnh dài cho chặng ' + n + ': nhà thám hiểm phải vượt qua cánh rừng rậm và dòng sông đục ngầu. ').repeat(3),
      taskDescription: 'Nhiệm vụ của chặng ' + n + ': tìm đáp án đúng để mở khóa bản đồ.',
      question: {
        id: 'q' + n,
        prompt: LONG + ' (chặng ' + n + ')',
        options: [
          { id: 'a', text: 'Chủ động chào hỏi, hỏi thăm bạn một cách tự nhiên và lắng nghe' },
          { id: 'b', text: 'Đứng quan sát từ xa cho đến khi bạn ấy nói trước' },
          { id: 'c', text: 'Kể ngay một câu chuyện cười thật dài để gây chú ý' },
          { id: 'd', text: 'Chờ giáo viên giới thiệu rồi mới dám lên tiếng' }
        ],
        correctOptionId: 'a',
        explanation: 'Chào hỏi chủ động là bước đầu tiên của một tình bạn mới.',
        hint: 'Gợi ý cho chặng ' + n
      },
      attempts: 2,
      points: 100,
      completionBonus: 10,
      nextStageId: n < stageCount ? 's' + (n + 1) : null,
      hasHiddenItem: n === 2,
      mission: { type: 'multiple-choice' }
    };
  });
  return JSON.stringify({
    id, title: 'Tìm kho báu tri thức', subject: 'Đạo đức', grade: '4',
    template: 'treasure-hunt', description: '', tags: [], sourceName: 'ui-check',
    createdAt: '2026-01-01T00:00:00.000Z',
    questions: [],
    gameSetup: { scoringMode: 'cơ bản', illustrationMode: illustrationMode || 'auto' },
    treasureHunt: {
      character: 'Nhà thám hiểm An',
      intro: 'Hành trình dài bắt đầu từ ngôi đền cổ. ',
      journeyBonus: 200,
      hiddenItemBonus: 50,
      backgroundId: 'temple',
      characterId: 'explorer',
      stages
    }
  });
}

const TREASURE_6 = treasureGame(6, 'ui-play-surface-treasure-6');
const TREASURE_12 = treasureGame(12, 'ui-play-surface-treasure-12');

/**
 * Bề rộng ảnh minh hoạ KHÔNG được tụt dưới mức này (px), đo trên bố cục trước
 * khi tối ưu: 301px @1366x768, 360px @1920x1080.
 *
 * Vì sao cần một sàn: con đường dễ nhất để "khoảng cách ≤64px" là thu nhỏ ảnh
 * cho tới khi hai khối sát nhau, và số đo thì đẹp mà bức tranh thì mất. Ảnh phải
 * giữ nguyên hoặc lớn lên.
 */
const ART_FLOOR = { 1366: 300, 1920: 360 };

/**
 * "Đường đua ôn tập" fixture — the fourth play template, and the only one #84/#85
 * never re-measured at both projector sizes (both entries record it as "not
 * verified"). Race shares the two-column block with quiz, but its left column is
 * a 40-cell track with two team rows, so its height budget is different.
 *
 * 40 cells and 6 rounds are the template's realistic classroom size; the answers
 * are the same long text the quiz fixture uses, because short options would hide
 * the very overflow this is guarding.
 */
const RACE = JSON.stringify({
  id: 'ui-play-surface-race', title: 'Đường đua ôn tập', subject: 'Đạo đức', grade: '4',
  template: 'race', description: '', tags: [], sourceName: 'ui-check',
  createdAt: '2026-01-01T00:00:00.000Z',
  questions: [],
  gameSetup: { scoringMode: 'cơ bản', illustrationMode: 'auto' },
  race: {
    trackLength: 40,
    maxRounds: 6,
    stepByDifficulty: false,
    luckEnabled: false,
    teams: [
      { id: 't1', name: 'Đội Một', icon: '🔴' },
      { id: 't2', name: 'Đội Hai', icon: '🔵' }
    ],
    cells: [
      { cell: 6, type: 'boost', label: 'Tăng tốc' },
      { cell: 11, type: 'penalty', label: 'Chướng ngại' }
    ],
    questions: [1, 2, 3].map(n => ({
      id: 'rq' + n,
      prompt: LONG,
      options: [
        { id: 'a', text: 'Chủ động chào hỏi, hỏi thăm bạn một cách tự nhiên và lắng nghe' },
        { id: 'b', text: 'Đứng quan sát từ xa cho đến khi bạn ấy nói trước' },
        { id: 'c', text: 'Kể ngay một câu chuyện cười thật dài để gây chú ý' },
        { id: 'd', text: 'Chờ giáo viên giới thiệu rồi mới dám lên tiếng' }
      ],
      correctOptionId: 'a',
      explanation: 'Chào hỏi chủ động là bước đầu tiên của một tình bạn mới.',
      difficulty: 'trung bình'
    }))
  }
});



/** Read the play-surface geometry that the teacher-facing assertions need. */
const READ = `(() => {
  const px = v => parseFloat(v) || 0;
  const rect = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom }; };
  const q = document.querySelector('.stage-question');
  const opt = document.querySelector('.answer-option');
  const grid = document.querySelector('.answer-grid');
  const present = document.querySelector('[data-play-present]');
  const label = present?.querySelector('.play-tool-label');
  const fsBtn = document.querySelector('[data-play-fullscreen]');
  const closeBtn = document.querySelector('[data-play-close]');
  const stage = document.querySelector('.game-stage');
  if (!q || !opt || !grid || !stage || !present) return { missing: true };
  return {
    viewport: { w: innerWidth, h: innerHeight },
    questionFont: px(getComputedStyle(q).fontSize),
    questionWeight: getComputedStyle(q).fontWeight,
    optionFont: px(getComputedStyle(opt).fontSize),
    optionHeight: rect(opt).h,
    optionCols: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
    contentWidth: rect(q).w,
    // Bố cục 2 cột (docs/UI-PLAN-V2.md, DECISIONS #84): ảnh nằm CẠNH câu hỏi,
    // nên bề rộng câu hỏi một mình không còn đo "không gian bị bỏ phí" — ảnh
    // chiếm 200-300px bên trái là cố ý. Đo cả khối ảnh + chữ để giữ nguyên ý
    // nghĩa gốc của assertion (màn hình máy chiếu không được để trống hai bên).
    stageCenterWidth: (() => {
      const sc = document.querySelector('.stage-center') || document.querySelector('.race-turn-row');
      return sc ? rect(sc).w : 0;
    })(),
    illustrationWidth: (() => {
      const ill = document.querySelector('.stage-illustration');
      return ill ? rect(ill).w : 0;
    })(),
    present: Object.assign({ text: present.textContent.trim(),
      overflowX: present.scrollWidth > present.clientWidth + 1 }, rect(present)),
    labelLines: label ? Math.round(rect(label).h / px(getComputedStyle(label).lineHeight || getComputedStyle(label).fontSize)) : null,
    fsBtn: fsBtn ? rect(fsBtn) : null,
    closeBtn: closeBtn ? rect(closeBtn) : null,
    stageBottom: rect(stage).bottom,
    questionColor: getComputedStyle(q).color,
    stageBackground: getComputedStyle(stage).backgroundImage !== 'none',
    docHeight: document.documentElement.scrollHeight
  };
})()`;

/**
 * Treasure two-column geometry (docs/ROADMAP.md #207, Task 1).
 *
 * The number a teacher actually sees is the void between the right edge of the
 * illustration and the left edge of the question. Measuring the *row* (the old
 * `stageCenterWidth`) cannot see it: a grid track 751px wide holding a 360px art
 * box reports the same row width as a track that hugs the art, while the first
 * one wastes 390px of projector real estate. So this probe reads the two edges
 * directly.
 *
 * `mapOpen` is part of the contract, not incidental context: the drawer is a
 * sibling of the grid, and opening it re-ran the track sizing (527.5px ->
 * 522.7px at 1366x768), so the gap has to be recorded per state.
 */
const TREASURE_GEOM = `(() => {
  const box = sel => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), left: Math.round(r.left), right: Math.round(r.right),
      y: Math.round(r.y), top: Math.round(r.top), bottom: Math.round(r.bottom),
      w: Math.round(r.width), h: Math.round(r.height) };
  };
  const stage = document.querySelector('.game-stage');
  const grid = document.querySelector('.treasure-stage-grid');
  const drawer = document.querySelector('#treasureMapDrawer');
  const map = document.querySelector('.treasure-map');
  const ill = box('.stage-illustration.is-treasure');
  const q = box('.stage-question');
  const opts = [...document.querySelectorAll('#treasureMission .answer-option')]
    .map(el => { const r = el.getBoundingClientRect(); return {
      left: Math.round(r.left), right: Math.round(r.right),
      top: Math.round(r.top), bottom: Math.round(r.bottom),
      w: Math.round(r.width), h: Math.round(r.height) }; });
  return {
    viewport: { w: innerWidth, h: innerHeight },
    ill, question: q, badge: box('.treasure-chapter-now'), mainCol: box('.treasure-stage-grid > .stage-col.is-main'),
    // Cột trái, kể cả khi KHÔNG có ảnh: "gap" ở trên vô dụng lúc đó (ill = null),
    // nên phép đo phải đọc cả display để thấy cột có thật sự bị bỏ khỏi lưới hay
    // chỉ co về 0px.
    sideCol: (() => {
      const el = document.querySelector('.treasure-illustration-col');
      if (!el) return null;
      const b = box('.treasure-illustration-col');
      b.display = getComputedStyle(el).display;
      return b;
    })(),
    hasArt: Boolean(ill),
    artTrack: grid ? Math.round(parseFloat(getComputedStyle(grid).gridTemplateColumns.split(' ')[0]) || 0) : null,
    tracks: grid ? getComputedStyle(grid).gridTemplateColumns : null,
    columnGap: grid ? Math.round(parseFloat(getComputedStyle(grid).columnGap) || 0) : null,
    gap: ill && q ? q.left - ill.right : null,
    optionCount: opts.length, options: opts,
    firstOption: opts[0] || null, lastOption: opts[opts.length - 1] || null,
    attemptsHint: box('#treasureAttemptsHint'), hintBtn: box('.treasure-hint-fab'), storyBtn: box('#treasureStoryBtn'),
    // A block the class can see is useless if the click lands on something else:
    // hit-test the three controls the teacher uses on this surface.
    controls: [['#treasureMapToggleBtn', 'map toggle'], ['.treasure-hint-fab', 'hint'], ['#treasureStoryBtn', 'story']]
      .map(([sel, name]) => {
        const el = document.querySelector(sel);
        if (!el) return { name, present: false };
        const r = el.getBoundingClientRect();
        const top = document.elementFromPoint(Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2));
        return { name, present: true, w: Math.round(r.width), h: Math.round(r.height),
          insideViewport: r.left >= -2 && r.right <= innerWidth + 2 && r.top >= -2 && r.bottom <= innerHeight + 2,
          hittable: Boolean(top) && (top === el || el.contains(top) || top.contains(el)) };
      }),
    mapOpen: drawer ? getComputedStyle(drawer).display !== 'none' : null,
    map: map ? (() => { const r = map.getBoundingClientRect(); return {
      w: Math.round(r.width), right: Math.round(r.right), h: Math.round(r.height),
      scrollW: Math.round(map.scrollWidth), clientW: Math.round(map.clientWidth) }; })() : null,
    stageScroll: stage ? {
      overflowY: Math.round(stage.scrollHeight - stage.clientHeight),
      overflowX: Math.round(stage.scrollWidth - stage.clientWidth)
    } : null,
    docHeight: document.documentElement.scrollHeight
  };
})()`;

/**
 * The gap contract. `artFloor` is the illustration width the layout may not drop
 * below: closing the void by shrinking the picture would be cheating the number,
 * which is exactly what the acceptance criteria forbid.
 */
function assertTreasureGap(g, tag, artFloor) {
  if (!g || g.gap === null) {
    check(`[${tag}] treasure geometry measurable`, false, 'illustration or question missing');
    return;
  }
  check(`[${tag}] illustration -> question gap <= 64px`, g.gap <= 64,
    `${g.gap}px at ${g.viewport.w}x${g.viewport.h} (art ${g.ill.w}px in a ${g.artTrack}px track, column-gap ${g.columnGap}px)`);
  check(`[${tag}] gap is real separation, not overlap`, g.gap >= 0, `${g.gap}px`);
  check(`[${tag}] illustration not shrunk to win the number (>= ${artFloor}px)`,
    g.ill.w >= artFloor, `${g.ill.w}px wide, ${g.ill.h}px tall`);
  check(`[${tag}] answers still all rendered`, g.optionCount === 4, `${g.optionCount} options`);
  // Everything that must be readable from the back of the room sits in one
  // horizontal band: no sideways escape and no overlap between the two columns.
  const vw = g.viewport.w;
  const edges = [['illustration', g.ill], ['chapter badge', g.badge], ['question', g.question],
    ['first answer', g.firstOption], ['last answer', g.lastOption]];
  const outside = edges.filter(([, b]) => b && (b.left < -2 || b.right > vw + 2)).map(([n, b]) => `${n} ${b.left}..${b.right}`);
  check(`[${tag}] no key block escapes the viewport sideways`, outside.length === 0, outside.join(' | '));
  const collides = g.ill && g.mainCol && g.mainCol.left < g.ill.right - 0.5;
  check(`[${tag}] text column starts right of the picture`, !collides,
    collides ? `main.col.left=${g.mainCol.left} < ill.right=${g.ill.right}` : `ill.right=${g.ill.right} main.col.left=${g.mainCol.left}`);
  check(`[${tag}] page never double-scrolls`, g.docHeight <= g.viewport.h + 2,
    `${g.docHeight} vs ${g.viewport.h}`);
  // The map may scroll inside itself, but must not drag the whole stage sideways.
  check(`[${tag}] stage never scrolls horizontally`, g.stageScroll.overflowX <= 2,
    `stage overflowX ${g.stageScroll.overflowX}px, map ${g.map ? g.map.scrollW + '/' + g.map.clientW : 'n/a'}`);
  const blocked = (g.controls || []).filter(c => c.present && (!c.insideViewport || !c.hittable));
  check(`[${tag}] map/hint/story controls stay visible and clickable`, blocked.length === 0,
    blocked.map(c => `${c.name}: ${c.insideViewport ? 'covered' : 'off-screen'}`).join(' | ')
      || (g.controls || []).filter(c => c.present).map(c => c.name).join(', '));
}

/**
 * Opening/closing the drawer may not move the blocks the class is looking at.
 *
 * `axes: 'x'` is for the OPEN comparison: the drawer sits above the grid, so
 * opening it legitimately pushes the whole block DOWN — that is not a jump. What
 * must not change is the horizontal seam between the picture and the question.
 * The re-closed comparison uses 'xy' and demands the original position back.
 */
function assertTreasureStability(before, after, tag, axes = 'xy') {
  if (!before || !after || !before.ill || !after.ill) return;
  const moved = [];
  for (const key of ['ill', 'question', 'badge', 'mainCol']) {
    const a = before[key], b = after[key];
    if (!a || !b) { moved.push(`${key} disappeared`); continue; }
    const dx = Math.abs(a.left - b.left);
    const dy = axes === 'xy' ? Math.abs(a.top - b.top) : 0;
    if (dx > 2 || dy > 2) moved.push(`${key} ${a.left},${a.top} -> ${b.left},${b.top}`);
  }
  const what = axes === 'xy'
    ? 'closed -> open -> closed leaves the blocks in place'
    : 'opening the map does not shift the columns sideways';
  check(`[${tag}] ${what}`, moved.length === 0,
    moved.join(' | ') || `gap ${before.gap}px -> ${after.gap}px`);
  check(`[${tag}] gap survives the map toggle`, Math.abs(before.gap - after.gap) <= 4,
    `${before.gap}px vs ${after.gap}px`);
}

/** Open or close the journey drawer the way a teacher does: the header button. */
const TOGGLE_MAP = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  document.querySelector('#treasureMapToggleBtn')?.click();
  await sleep(400);
  const btn = document.querySelector('#treasureMapToggleBtn');
  return { label: btn ? btn.textContent.trim() : null,
    expanded: btn ? btn.getAttribute('aria-expanded') : null };
})()`;

/** Answer the first question and read the feedback state. */
const ANSWER = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  document.querySelector('.answer-option').click();
  await sleep(900);
  document.querySelectorAll('.modal, .modal-backdrop').forEach(el =>
    el.getAnimations().forEach(a => { try { a.finish(); } catch {} }));
  await sleep(150);
  const px = v => parseFloat(v) || 0;
  const fb = document.querySelector('#answerFeedback');
  const next = document.querySelector('#nextQuestionBtn');
  const body = document.querySelector('.modal-body');
  if (!fb || !next || !body) return { missing: true };
  const r = next.getBoundingClientRect();
  return {
    feedbackFont: px(getComputedStyle(fb).fontSize),
    feedbackText: fb.textContent.trim().length,
    feedbackBorder: getComputedStyle(fb).borderTopWidth,
    nextVisible: !next.classList.contains('hidden'),
    nextHeight: r.height,
    marked: document.querySelectorAll('.answer-option.selected, .answer-option.correct, .answer-option.wrong').length,
    bodyScrolls: body.scrollHeight > body.clientHeight + 1,
    docHeight: document.documentElement.scrollHeight,
    viewportH: innerHeight
  };
})()`;

/** Close the modal and read the nav rail. */
const NAV = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  document.querySelector('[data-play-close]')?.click();
  document.documentElement.dataset.fullscreen = '0';
  await sleep(500);
  const px = v => parseFloat(v) || 0;
  const icons = Array.from(document.querySelectorAll('.nav-item .nav-icon'));
  const active = document.querySelector('.nav-item.active .nav-icon');
  const inactive = document.querySelector('.nav-item:not(.active) .nav-icon');
  if (!icons.length) return { missing: true };
  const cs = el => el ? getComputedStyle(el) : null;
  const solid = c => c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent';
  return {
    count: icons.length,
    w: px(cs(icons[0]).width),
    h: px(cs(icons[0]).height),
    activeSolid: solid(cs(active)?.backgroundColor) || cs(active)?.backgroundImage !== 'none',
    inactiveSolid: solid(cs(inactive)?.backgroundColor),
    activeDistinct: cs(active)?.backgroundImage !== cs(inactive)?.backgroundImage,
    helpDisplay: cs(document.querySelector('#helpBtn'))?.display
  };
})()`;

/** The teacher-facing assertions, unchanged from the pre-retrofit check. */
function assertPlaySurface(m, tag) {
  const vw = m.viewport.w;
  check(`[${tag}] question font >= 30px (classroom readable)`, m.questionFont >= 30, `${m.questionFont}px`);
  check(`[${tag}] question weight bold (>=700)`, Number(m.questionWeight) >= 700, m.questionWeight);
  check(`[${tag}] answer font >= 16px`, m.optionFont >= 15.9, `${m.optionFont}px @ ${vw}px`);
  check(`[${tag}] answer option height >= 56px`, m.optionHeight >= 56, `${Math.round(m.optionHeight)}px`);
  check(`[${tag}] answers stay 2 columns`, m.optionCols === 2, `${m.optionCols} cols`);
  // Đo khối nội dung TỔNG (ảnh + chữ), không chỉ riêng câu hỏi: với bố cục
  // 2 cột, câu hỏi hẹp hơn một cách cố ý vì ảnh đã chiếm cột trái.
  const usedWidth = m.stageCenterWidth || m.contentWidth;
  check(`[${tag}] content uses most of the width (>=80% of viewport)`,
    usedWidth >= vw * 0.8 && usedWidth <= vw, `${Math.round(usedWidth)}px of ${vw}px`);
  // Nhưng cột chữ vẫn phải đủ rộng để không xuống dòng từng chữ trên máy chiếu.
  check(`[${tag}] text column still readable (>=50% of viewport)`,
    m.contentWidth >= vw * 0.5, `${Math.round(m.contentWidth)}px of ${vw}px`);
  check(`[${tag}] stage reaches near the bottom of the window`, m.stageBottom >= m.viewport.h * 0.85,
    `bottom ${Math.round(m.stageBottom)} of ${m.viewport.h}`);
  check(`[${tag}] page does not scroll in fullscreen`, m.docHeight <= m.viewport.h + 2, `${m.docHeight} vs ${m.viewport.h}`);
  check(`[${tag}] stage has a gradient background (not flat)`, m.stageBackground === true);

  check(`[${tag}] present button is content-sized, not a 30px square`, m.present.w > 70, `${Math.round(m.present.w)}px wide`);
  check(`[${tag}] present label on one line`, m.labelLines === 1, `${m.labelLines} line(s)`);
  check(`[${tag}] present label not overflowing its button`, m.present.overflowX === false);
  check(`[${tag}] present button >= 34px tall (clickable)`, m.present.h >= 34, `${Math.round(m.present.h)}px`);
  check(`[${tag}] fullscreen + close buttons >= 34px tall`,
    !!m.fsBtn && !!m.closeBtn && m.fsBtn.h >= 34 && m.closeBtn.h >= 34,
    `fs ${Math.round(m.fsBtn ? m.fsBtn.h : 0)}px, close ${Math.round(m.closeBtn ? m.closeBtn.h : 0)}px`);
  check(`[${tag}] header tools do not collide with each other`,
    !!m.fsBtn && !!m.closeBtn && m.fsBtn.right <= m.present.x + 0.5 && m.present.right <= m.closeBtn.x + 0.5,
    `fs.right=${Math.round(m.fsBtn ? m.fsBtn.right : -1)} present.x=${Math.round(m.present.x)} present.right=${Math.round(m.present.right)} close.x=${Math.round(m.closeBtn ? m.closeBtn.x : -1)}`);
  check(`[${tag}] tools sit inside the viewport`, m.present.right <= vw, `right ${Math.round(m.present.right)} of ${vw}`);
}

function assertAnswered(a, tag, viewportH) {
  check(`[${tag}] answer produces feedback text`, a.feedbackText > 20, `${a.feedbackText} chars`);
  check(`[${tag}] feedback font >= 13px`, a.feedbackFont >= 13, `${a.feedbackFont}px`);
  check(`[${tag}] feedback panel has a colour border`, a.feedbackBorder !== '0px', a.feedbackBorder);
  check(`[${tag}] chosen answer is visibly marked`, a.marked >= 1, `${a.marked} marked`);
  check(`[${tag}] next button is shown and clickable`, a.nextVisible === true && a.nextHeight >= 34,
    `${Math.round(a.nextHeight)}px tall`);
  check(`[${tag}] document still does not scroll after answering`,
    a.docHeight <= viewportH + 2, `${a.docHeight} vs ${viewportH}`);
}

function assertNav(nav, tag) {
  check(`[${tag}] every nav item has an icon tile`, nav.count >= 6 && nav.w > 0, `${nav.count} icons, ${nav.w}x${nav.h}`);
  check(`[${tag}] nav icon tile >= 28px`, nav.w >= 28 && nav.h >= 28, `${nav.w}x${nav.h}`);
  check(`[${tag}] inactive nav icons have a visible tile`, nav.inactiveSolid === true);
  check(`[${tag}] active nav icon is a filled brand tile`, nav.activeSolid === true && nav.activeDistinct === true);
  check(`[${tag}] help button is a centred icon button`, nav.helpDisplay === 'grid', nav.helpDisplay);
}

(async () => {
  const ctx = await connect();
  const { evaluate } = ctx;

  for (const size of PROJECTOR_SIZES) {
    const tag = size.label;
    console.log(`\n=== play surface @ ${tag} ===`);

    // Drive the UI at the size being measured: opening the modal *before*
    // resizing would measure a layout the teacher never sees.
    await setViewportAndWait(ctx, size);
    const opened = await evaluate(OPEN(GAME));

    check(`[${tag}] play surface opened`, Boolean(opened && opened.stage && opened.question && opened.option),
      opened ? JSON.stringify(opened) : 'no result');

    // Question state, measured and photographed.
    // fontFloor 10: the smallest text painted on the play surface is the
    // `small text-[#aeb5ce]` status line (10px) plus 11px stage chips -- deliberate
    // secondary metadata, the same role as .tag (9px) and .treasure-map-meta (8px).
    // 10px is the measured contract; the ANSWER text, which is what a projector
    // audience actually reads, is guarded at 16px by assertPlaySurface below.
    const { m } = await measureAt(ctx, size, `play-surface-question-${tag}`, {
      check, fontFloor: 10, questionAnswerOverlap: 'assert', innerScrollAreas: 0
    });
    if (m && !m.missing) {
      const read = await evaluate(READ);
      if (read && !read.missing) assertPlaySurface(read, tag);
      else check(`[${tag}] play surface is readable`, false, 'selectors missing');
    } else {
      check(`[${tag}] play surface is readable`, false, 'no play surface to measure');
    }

    // Answered state, measured and photographed too: the feedback panel is the
    // block that pushed the stage off-screen in earlier bugs.
    const a = await evaluate(ANSWER);
    if (a && !a.missing) {
      assertAnswered(a, tag, m && m.viewport ? m.viewport.h : size.height);
      await measureAt(ctx, size, `play-surface-answered-${tag}`, {
        check, fontFloor: 10, questionAnswerOverlap: 'assert', innerScrollAreas: 0
      });
    } else {
      check(`[${tag}] answer feedback renders`, false, 'feedback, next button or body missing');
    }

    // Nav rail, back at normal (non-fullscreen) chrome.
    const nav = await evaluate(NAV);
    if (nav && !nav.missing) assertNav(nav, tag);
    else check(`[${tag}] nav rail renders`, false, 'no .nav-icon elements');
  }

  // ------------------------------------------------------------ treasure ----
  // "Tìm kho báu" is the one template that legitimately SCROLLS on a short
  // projector board, so it is asserted differently from quiz/race/scenario.
  //
  // Measured at 1366x768 with a realistic 6-stage fixture (story 273 chars — the
  // schema allows 1600 — plus taskDescription, 4 long answers and a hint button):
  // the text column alone needs ~656px inside a 662px stage that also carries the
  // map (133px). No amount of trimming fits that without deleting content the
  // teacher wrote, so the contract is NOT "zero overflow" but:
  //
  //   1. everything is reachable by scrolling the stage (no clipped content);
  //   2. the page itself never double-scrolls (docHeight == viewport height);
  //   3. the map is never squashed below its content (DECISIONS #85's
  //      `flex-shrink: 0`), which is what used to clip the node label.
  //
  // An earlier hand-written probe reported "treasure 0/0" here. That was wrong:
  // it used a minimal fixture (one short story, no taskDescription, no hint) and
  // therefore never exercised the height the real content costs. The numbers
  // below come from this check's fixture, which is why it lives in the check.
  for (const size of PROJECTOR_SIZES) {
    for (const [label, fixture] of [['6-stage', TREASURE_6], ['12-stage', TREASURE_12]]) {
      const tag = `${size.label} ${label}`;
      console.log(`\n=== treasure-hunt ${label} @ ${size.label} ===`);
      await setViewportAndWait(ctx, size);
      const opened = await evaluate(OPEN(fixture));
      check(`[${tag}] treasure stage opened`,
        Boolean(opened && opened.stage && opened.question && opened.option),
        opened ? JSON.stringify(opened) : 'no result');
      if (!opened || !opened.option) continue;

      // Ba trạng thái đo RIÊNG (nhiệm vụ 1 + 3): bản đồ ĐÓNG — trạng thái giáo
      // viên đang trả lời (#91/#104) — rồi MỞ, rồi ĐÓNG LẠI. Khoảng cách
      // ảnh–câu hỏi phải đạt ở cả ba, vì mở drawer từng đổi cả việc tính track
      // (527.5px -> 522.7px ở 1366x768).
      const mapClosed = await evaluate(TREASURE_GEOM);
      assertTreasureGap(mapClosed, `${tag} map closed`, ART_FLOOR[size.width]);
      const shotClosed = await capture(ctx.send, `play-surface-treasure-${label}-${size.label}-map-closed`);
      check(`[${tag}] map-closed screenshot captured`, Boolean(shotClosed.file),
        shotClosed.file || shotClosed.error);

      // DECISIONS #91/#104: the journey map is a collapsed drawer while the
      // teacher is answering, so this fixture opens it through the stage control
      // before its height is measured (the same step a teacher takes).
      const toggleOn = await evaluate(TOGGLE_MAP);
      check(`[${tag}] the stage button reports the map open`, toggleOn.expanded === 'true',
        JSON.stringify(toggleOn));
      const mapOpen = await evaluate(TREASURE_GEOM);
      assertTreasureGap(mapOpen, `${tag} map open`, ART_FLOOR[size.width]);
      // 12 chặng được phép cuộn TRONG bản đồ, không được dồn sân khấu cuộn.
      check(`[${tag}] journey map fits its own box or owns its scroll`,
        !mapOpen.map || mapOpen.map.scrollW <= mapOpen.map.clientW + 2
          || mapOpen.stageScroll.overflowX <= 2,
        mapOpen.map ? `map ${mapOpen.map.scrollW}/${mapOpen.map.clientW}, stage X ${mapOpen.stageScroll.overflowX}px` : 'no map');

      // Photograph it for humans. `assertLayout: false` because the universal
      // "nothing outside the viewport" rule is the wrong contract for a template
      // whose stage is a scroll container (see the comment block above).
      const { m, shot } = await measureAt(ctx, size, `play-surface-treasure-${label}-${size.label}`, {
        check, fontFloor: 8, assertLayout: false
      });
      check(`[${tag}] nothing is clipped inside its own box`,
        (m.clippedCount || 0) === 0, `${m.clippedCount} clipped`);

      // `m.outsideCount` is NOT usable here. The stage is a scroll container, so
      // the answers below the fold are legitimately "outside" it at scrollTop 0.
      // The real defect is a COLUMN that grew taller than its own scrollable
      // container (`.stage-center`): the column's overflow spills past the
      // center's edge and the stage's scrollHeight only counts the center, so the
      // spilled rows can never be scrolled to. Comparing a child against the
      // stage would miss it entirely — the inflated column is what grows the
      // stage. Compare each child against its own scroll container.
      // Verified by re-introducing the bug (flex-shrink: 0 -> 1): 0 -> 65 stranded.
      const stranded = await evaluate(`(async () => {
        await new Promise(r => setTimeout(r, 150));
        const containers = [...document.querySelectorAll('.stage-center, .stage-col')];
        if (!containers.length) return { missing: true };
        const bad = [];
        for (const box of containers) {
          const b = box.getBoundingClientRect();
          const cs = getComputedStyle(box);
          const scrollable = cs.overflowY === 'auto' || cs.overflowY === 'scroll';
          for (const el of box.children) {
            const r = el.getBoundingClientRect();
            if (r.width < 2 || r.height < 2) continue;
            // overflow:visible cannot clip, so spill is real and unreachable.
            const spilled = r.bottom > b.bottom + 2 || r.top < b.top - 2;
            if (spilled && !scrollable) {
              bad.push({ cls: (el.className || el.id || el.tagName).toString().slice(0, 36),
                spill: Math.round(r.bottom - b.bottom), box: Math.round(b.height) });
            }
          }
        }
        return { count: bad.length, worst: bad.slice(0, 3) };
      })()`);
      check(`[${tag}] no column spills past its scroll container`,
        !stranded.missing && stranded.count === 0,
        stranded.missing ? 'no .stage-center' : `${stranded.count} stranded, worst: ${JSON.stringify(stranded.worst)}`);


      const t = await evaluate(`(async () => {
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        const stage = document.querySelector('.game-stage');
        if (!stage) return { missing: true };
        const cs = getComputedStyle(stage);
        const overflow = stage.scrollHeight - stage.clientHeight;
        const sr = () => stage.getBoundingClientRect();
        // Scroll to the very end and check the last control is really there.
        stage.scrollTop = stage.scrollHeight;
        await sleep(250);
        const r = sr();
        const inside = el => {
          if (!el) return false;
          const b = el.getBoundingClientRect();
          return b.top >= r.top - 1 && b.bottom <= r.bottom + 1;
        };
        const opts = document.querySelectorAll('#treasureMission .answer-option');
        const map = document.querySelector('.treasure-map');
        const mapCs = map ? getComputedStyle(map) : null;
        return {
          viewport: { w: innerWidth, h: innerHeight },
          overflowY: cs.overflowY,
          overflow: Math.round(overflow),
          reachedEnd: Math.abs(stage.scrollTop - overflow) <= 4,
          bottomControlInside: inside(document.querySelector('.stage-bottom')),
          lastAnswerInside: inside(opts[opts.length - 1]),
          answers: opts.length,
          nodes: document.querySelectorAll('.treasure-map-node').length,
          mapClipped: map ? (map.scrollHeight > map.clientHeight + 2 && mapCs.overflowY !== 'visible') : null,
          mapShrink: mapCs ? mapCs.flexShrink : null,
          docHeight: document.documentElement.scrollHeight
        };
      })()`);

      if (!t || t.missing) {
        check(`[${tag}] treasure stage measured`, false, 'no .game-stage');
        continue;
      }
      check(`[${tag}] stage is the scroll container (not the page)`,
        t.overflowY === 'auto' || t.overflowY === 'scroll', t.overflowY);
      check(`[${tag}] page never double-scrolls`, t.docHeight <= t.viewport.h + 2,
        `${t.docHeight} vs ${t.viewport.h}`);
      check(`[${tag}] can scroll to the end of the stage`, t.reachedEnd === true,
        `overflow ${t.overflow}px`);
      check(`[${tag}] bottom control is reachable after scrolling`,
        t.bottomControlInside === true, `overflow ${t.overflow}px`);
      check(`[${tag}] every answer is reachable (none stranded outside)`,
        t.lastAnswerInside === true && t.answers === 4, `${t.answers} answers`);
      check(`[${tag}] map is as tall as its content (node label not clipped)`,
        t.mapClipped === false, `flex-shrink ${t.mapShrink}`);
      check(`[${tag}] map is not allowed to shrink below its content`,
        t.mapShrink === '0', `flex-shrink ${t.mapShrink}`);
      check(`[${tag}] whole journey is rendered`,
        t.nodes === (label === '6-stage' ? 6 : 12), `${t.nodes} nodes`);

      // Trạng thái thứ ba: đóng lại. Scroll về đầu trước để so với bản đo lúc
      // chưa mở (cùng scrollTop thì toạ độ mới so sánh được).
      await evaluate(`(async () => {
        const stage = document.querySelector('.game-stage');
        if (stage) stage.scrollTop = 0;
        await new Promise(r => setTimeout(r, 200));
      })()`);
      const toggleOff = await evaluate(TOGGLE_MAP);
      check(`[${tag}] the stage button reports the map closed again`, toggleOff.expanded === 'false',
        JSON.stringify(toggleOff));
      const reClosed = await evaluate(TREASURE_GEOM);
      assertTreasureGap(reClosed, `${tag} map re-closed`, ART_FLOOR[size.width]);
      assertTreasureStability(mapClosed, reClosed, `${tag} map toggle`);
      // Mở drawer có làm khối nội dung dịch không? (nhiệm vụ 3: bản đồ không được
      // đổi khoảng cách ảnh–câu hỏi.)
      assertTreasureStability(mapClosed, mapOpen, `${tag} map open`, 'x');

      // Nhiệm vụ 2, điều kiện "bố cục vẫn hợp lý khi KHÔNG có ảnh": mở lại
      // đúng màn hình đó (illustrationMode 'off') rồi đo. Không được chỉ ẩn node
      // — `:has(.stage-illustration)` vẫn khớp khi node còn trong DOM.
      const noArtOpen = await evaluate(OPEN(treasureGame(
        label === '6-stage' ? 6 : 12, 'ui-play-surface-treasure-noart-' + label, 'off')));
      check(`[${tag}] no-illustration stage opened`,
        Boolean(noArtOpen && noArtOpen.stage && noArtOpen.question && noArtOpen.option),
        noArtOpen ? JSON.stringify(noArtOpen) : 'no result');
      const na = await evaluate(TREASURE_GEOM);
      check(`[${tag}] the fixture really drew no illustration`,
        Boolean(na) && na.hasArt === false, JSON.stringify(na && { hasArt: na.hasArt, art: na.ill }));
      // wizard.css:414 ẩn cột ảnh khi không có ảnh; lưới PHẢI bỏ luôn track của
      // nó, nếu không cột chữ tự động rơi vào track thứ nhất và bị bóp đúng bề
      // rộng cột ảnh (đo được 220px trước khi sửa).
      check(`[${tag}] no-illustration leaves the empty art column no track`,
        Boolean(na) && na.sideCol && na.sideCol.w === 0,
        na && na.sideCol ? `col ${na.sideCol.w}px wide, display ${na.sideCol.display}` : JSON.stringify(na));
      check(`[${tag}] no-illustration gives the text column the full stage width`,
        Boolean(na) && na.mainCol && na.mainCol.w >= 0.85 * na.viewport.w,
        na ? `main ${na.mainCol && na.mainCol.w}px of ${na.viewport.w}px viewport ` +
          `(tracks ${na.tracks})` : 'no result');
      check(`[${tag}] no-illustration still renders all four answers`,
        Boolean(na) && na.optionCount === 4, JSON.stringify(na && { options: na.optionCount }));
      const naShot = await capture(ctx.send, `play-surface-treasure-${label}-${size.label}-no-art`);
      check(`[${tag}] no-illustration screenshot captured`, Boolean(naShot && naShot.file),
        JSON.stringify(naShot || {}));

      console.log(`  ${label.padEnd(9)} gap closed ${mapClosed.gap}px / open ${mapOpen.gap}px / re-closed ${reClosed.gap}px  `
        + `art ${mapClosed.ill.w}px in ${mapClosed.artTrack}px track  `
        + `no-art main ${na?.mainCol?.w}/${na?.viewport?.w}px  `
        + `overflow ${String(t.overflow).padStart(4)}px  nodes ${t.nodes}  answers ${t.answers}  `
        + `docH ${t.docHeight}/${t.viewport.h}  -> ${shot.file || '(no image)'}`);
    }
  }
  // ---------------------------------------------------------------- race ----
  // Race is measured under the SAME contract as quiz: nothing may be pushed out
  // of the viewport. Unlike treasure, its left column is a track and its right
  // column is the question, so a 40-cell track + 4 long answers must still fit a
  // 768px board (#84 and #85 both left this unmeasured).
  for (const size of PROJECTOR_SIZES) {
    const tag = `${size.label} race`;
    console.log(`\n=== race @ ${size.label} ===`);
    await setViewportAndWait(ctx, size);
    const opened = await evaluate(OPEN(RACE));
    check(`[${tag}] race stage opened`,
      Boolean(opened && opened.stage),
      opened ? JSON.stringify(opened) : 'no result');
    if (!opened || !opened.stage) continue;

    // Race opens on a "draw a question" panel; the question column only exists
    // after a draw. Measure the state the class actually reads from.
    const drawn = await evaluate(`(async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      const btn = document.getElementById('drawQuestionBtn');
      if (btn) btn.click();
      await sleep(600);
      return {
        question: Boolean(document.querySelector('.stage-question')),
        option: Boolean(document.querySelector('.answer-option')),
        cells: document.querySelectorAll('.race-track .race-cell').length
      };
    })()`);
    check(`[${tag}] race question can be drawn`,
      Boolean(drawn && drawn.question && drawn.option),
      drawn ? JSON.stringify(drawn) : 'no result');
    if (!drawn || !drawn.option) continue;

    const { m, shot } = await measureAt(ctx, size, `play-surface-race-${size.label}`, {
      check, fontFloor: 8, questionAnswerOverlap: 'assert', innerScrollAreas: 0
    });
    check(`[${tag}] nothing is painted outside the viewport`,
      (m.outsideCount || 0) === 0,
      m.outsideCount ? `${m.outsideCount} element(s), worst: ${JSON.stringify(m.outside[0])}` : '');

    const r = await evaluate(`(async () => {
      const stage = document.querySelector('.game-stage');
      if (!stage) return { missing: true };
      const cells = document.querySelectorAll('.race-track .race-cell');
      const opts = document.querySelectorAll('.race-stage .answer-option, .game-stage .answer-option');
      const track = document.querySelector('.race-track');
      return {
        cells: cells.length,
        answers: opts.length,
        trackRows: track ? Math.round(track.scrollHeight / Math.max(1, track.clientHeight)) : null,
        stageFits: stage.scrollHeight <= stage.clientHeight + 2,
        overflow: Math.round(stage.scrollHeight - stage.clientHeight),
        docHeight: document.documentElement.scrollHeight,
        viewportH: innerHeight
      };
    })()`);
    if (r && !r.missing) {
      check(`[${tag}] whole 40-cell track is rendered`, r.cells === 40, `${r.cells} cells`);
      check(`[${tag}] all four answers are rendered`, r.answers === 4, `${r.answers} answers`);
      check(`[${tag}] stage does not overflow (race must fit, unlike treasure)`,
        r.stageFits === true, `overflow ${r.overflow}px`);
      check(`[${tag}] page never double-scrolls`, r.docHeight <= r.viewportH + 2,
        `${r.docHeight} vs ${r.viewportH}`);
      console.log(`  race      cells ${r.cells}  answers ${r.answers}  `
        + `overflow ${r.overflow}px  docH ${r.docHeight}/${r.viewportH}  -> ${shot.file || '(no image)'}`);
    } else {
      check(`[${tag}] race stage measured`, false, 'no .game-stage');
    }
  }





  await evaluate(`(async () => {
    document.querySelector('[data-play-close]')?.click();
    document.getElementById('modalRoot').innerHTML = '';
    document.documentElement.dataset.fullscreen = '0';
    return true;
  })()`);
  await setViewport(ctx.send, null);

  const failed = results.filter(r => !r.ok);
  console.log(`\nui-play-surface-check: ${results.length - failed.length}/${results.length} checks passed`);
  ctx.ws.close();
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('ERROR: ' + e.message); process.exit(1); });

