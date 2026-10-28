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
const { PROJECTOR_SIZES, measureAt, setViewport, setViewportAndWait } = require('./lib/screenshot-capture');

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
function treasureGame(stageCount, id) {
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
    gameSetup: { scoringMode: 'cơ bản', illustrationMode: 'auto' },
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
      // DECISIONS #91/#104: the journey map is a collapsed drawer while the
      // teacher is answering, so this fixture opens it through the stage control
      // before its height is measured (the same step a teacher takes).
      await evaluate("(document.querySelector('#treasureMapToggleBtn') || { click() {} }).click()");
      await new Promise(r => setTimeout(r, 150));

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
      console.log(`  ${label.padEnd(9)} overflow ${String(t.overflow).padStart(4)}px  `
        + `nodes ${t.nodes}  answers ${t.answers}  docH ${t.docHeight}/${t.viewport.h}  -> ${shot.file || '(no image)'}`);
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

