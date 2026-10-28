// ui-race-treasure-check.js — regression guard for two play-screen defects.
//
//   1. "Đường đua" (race): the team rows and turn panel were light panels
//      (#fff / #fbfbfe) nested inside the dark .game-stage and relied on the
//      stage's inherited white text, so the prompt and standings rendered
//      white-on-white on a white background. Asserts the panels are dark and
//      that no text sits on a background of similar luminance.
//   2. "Tìm kho báu" (treasure hunt) in fullscreen: the stage clipped its
//      overflow and body{overflow:hidden} killed the page scroll, so a tall
//      mission could not be scrolled at all. Asserts the stage reports real
//      scrollable overflow and that scrolling it actually reaches the bottom
//      control.
//
// Run against a built app started with --remote-debugging-port:
//   npm run build
//   $env:EDUGAME_USER_DATA="tests/.ui-check-profile"
//   npx electron . --remote-debugging-port=9341
//   node tests/ui/ui-race-treasure-check.js 9341
const { check, connect, results } = require('../manual/lib/ui-check-lib');

/** Contrast helpers, injected into the page (WCAG 2.1 ratio, 1..21). */
const CONTRAST_FN = `
  const srgb = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = a => 0.2126 * srgb(a[0]) + 0.7152 * srgb(a[1]) + 0.0722 * srgb(a[2]);
  const parse = s => (s.match(/[\\d.]+/g) || []).map(Number);
  const contrast = (fg, bg) => {
    const a = parse(fg), b = parse(bg);
    if (a.length < 3 || b.length < 3) return 21;
    const L1 = lum(a), L2 = lum(b);
    return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
  };
  // Walk up to the first ancestor with an opaque background.
  const bgOf = el => {
    let node = el;
    while (node && node !== document.documentElement) {
      const bg = getComputedStyle(node).backgroundColor;
      const a = parse(bg);
      const transparent = a.length === 4 && a[3] === 0;
      if (!transparent && a.length >= 3 && !(a.length === 4 && a[3] < 0.6)) return bg;
      node = node.parentElement;
    }
    return 'rgb(255, 255, 255)';
  };
`;


/** Race fixture: a 40-cell track (wraps to several rows, so the height cap is
    actually engaged) and three questions, so the turn panel can be opened and
    measured. A 24-cell track fits in two rows and would not test the cap. */
function raceGame() {
  return {
    id: 'ui-race-1',
    title: 'Đường đua ôn tập',
    subject: 'Toán',
    grade: 'Lớp 5',
    topic: 'Ôn tập',
    template: 'race',
    description: 'Kiểm tra giao diện đường đua',
    questions: [],
    tags: [],
    sourceName: 'ui-check',
    createdAt: new Date().toISOString(),
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
        prompt: 'Câu hỏi đường đua số ' + n + ': kết quả của phép tính là bao nhiêu?',
        options: [
          { id: 'a', text: 'Đáp án A cho câu ' + n },
          { id: 'b', text: 'Đáp án B cho câu ' + n },
          { id: 'c', text: 'Đáp án C cho câu ' + n },
          { id: 'd', text: 'Đáp án D cho câu ' + n }
        ],
        correctOptionId: 'a',
        explanation: 'Giải thích ngắn cho câu ' + n,
        difficulty: 'trung bình'
      }))
    }
  };
}

/** Treasure fixture: deliberately tall (long story, six stages) so the map and
    the mission body overflow a 768px-tall window. */
function treasureGame() {
  const stages = [1, 2, 3, 4, 5, 6].map(n => ({
    id: 's' + n,
    name: 'Chặng ' + n,
    story: ('Bối cảnh dài cho chặng ' + n + '. ').repeat(6),
    taskDescription: 'Nhiệm vụ của chặng ' + n + ': tìm đáp án đúng để mở khoá bản đồ.',
    question: {
      prompt: 'Câu hỏi kho báu số ' + n + ': hãy chọn đáp án đúng nhất.',
      options: [
        { id: 'a', text: 'Lựa chọn A' },
        { id: 'b', text: 'Lựa chọn B' },
        { id: 'c', text: 'Lựa chọn C' },
        { id: 'd', text: 'Lựa chọn D' }
      ],
      correctOptionId: 'a',
      explanation: 'Giải thích cho chặng ' + n,
      hint: 'Gợi ý cho chặng ' + n
    },
    attempts: 2,
    points: 100,
    completionBonus: 10,
    nextStageId: n < 6 ? 's' + (n + 1) : null,
    hasHiddenItem: n === 2
  }));
  return {
    id: 'ui-treasure-1',
    title: 'Tìm kho báu tri thức',
    subject: 'Toán',
    grade: 'Lớp 5',
    topic: 'Ôn tập',
    template: 'treasure-hunt',
    description: 'Kiểm tra giao diện kho báu',
    questions: [],
    tags: [],
    sourceName: 'ui-check',
    createdAt: new Date().toISOString(),
    treasureHunt: {
      character: 'Nhà thám hiểm An',
      intro: 'Hành trình dài bắt đầu từ ngôi đền cổ. '.repeat(4),
      journeyBonus: 200,
      hiddenItemBonus: 50,
      backgroundId: 'temple',
      characterId: 'explorer',
      stages
    }
  };
}


(async () => {
  const { ws, evaluate } = await connect();

  // ---------------------------------------------------------------- race ----
  const race = await evaluate(`(async () => {
    ${CONTRAST_FN}
    const game = ${JSON.stringify(raceGame())};
    const saved = await window.eduGame.saveGame(game);
    playGame(saved);
    await new Promise(r => setTimeout(r, 700));
    if (document.documentElement.dataset.fullscreen !== '1') document.querySelector('[data-play-fullscreen]')?.click();
    await new Promise(r => setTimeout(r, 900));
    document.querySelectorAll('.modal, .modal-backdrop').forEach(el =>
      el.getAnimations().forEach(a => { try { a.finish(); } catch {} }));

    // Draw a question so the turn panel renders its prompt and options.
    document.querySelector('#drawQuestionBtn')?.click();
    await new Promise(r => setTimeout(r, 600));

    const turn = document.querySelector('.race-turn');
    const row = document.querySelector('.race-team-row');
    const q = document.querySelector('.race-turn .stage-question');
    const opt = document.querySelector('.race-turn .answer-option');
    const track = document.querySelector('.race-track');
    const stage = document.querySelector('.game-stage');
    const cs = el => el ? getComputedStyle(el) : null;
    const opaque = c => { const a = parse(c); return a.length < 4 || a[3] > 0.6; };
    // "Dark surface" = low luminance, which is what makes white text legible.
    const dark = c => { const a = parse(c); return a.length >= 3 && lum(a) < 0.12; };

    return {
      viewport: { w: innerWidth, h: innerHeight },
      turnBg: cs(turn)?.backgroundColor,
      turnOpaque: opaque(cs(turn)?.backgroundColor || ''),
      turnDark: dark(cs(turn)?.backgroundColor || ''),
      rowBg: cs(row)?.backgroundColor,
      rowOpaque: opaque(cs(row)?.backgroundColor || ''),
      rowDark: dark(cs(row)?.backgroundColor || ''),
      // White-on-white is the actual defect: measure it, do not eyeball it.
      promptContrast: q ? contrast(cs(q).color, bgOf(q)) : 0,
      optionContrast: opt ? contrast(cs(opt).color, bgOf(opt)) : 0,
      rowContrast: row ? contrast(cs(row).color, bgOf(row)) : 0,
      promptFont: q ? parseFloat(cs(q).fontSize) : 0,
      questionCount: document.querySelectorAll('.race-turn .answer-option').length,
      cells: document.querySelectorAll('.race-track .race-cell').length,
      trackScrolls: track ? track.scrollHeight > track.clientHeight + 1 : false,
      trackHeight: track ? track.clientHeight : 0,
      trackCap: track ? parseFloat(cs(track).maxHeight) : 0,
      trackContent: track ? track.scrollHeight : 0,
      docHeight: document.documentElement.scrollHeight,
      promptInStage: !!(q && stage) &&
        q.getBoundingClientRect().top >= stage.getBoundingClientRect().top - 1
    };
  })()`);

  check('race: turn panel is a dark surface, not white', race.turnOpaque === true && race.turnDark === true,
    `turn bg ${race.turnBg}`);
  check('race: team rows use a dark surface too', race.rowOpaque === true && race.rowDark === true,
    `row bg ${race.rowBg} (active row is highlighted)`);
  check('race: prompt text has readable contrast (>=4.5:1)', race.promptContrast >= 4.5,
    `${race.promptContrast.toFixed(2)}:1`);
  check('race: answer options have readable contrast (>=4.5:1)', race.optionContrast >= 4.5,
    `${race.optionContrast.toFixed(2)}:1`);
  check('race: standings text has readable contrast (>=4.5:1)', race.rowContrast >= 4.5,
    `${race.rowContrast.toFixed(2)}:1`);
  check('race: prompt stays classroom-readable (>=20px)', race.promptFont >= 20, `${race.promptFont}px`);
  check('race: drawing a question shows four answers', race.questionCount === 4, `${race.questionCount} options`);
  check('race: whole 40-cell track is rendered', race.cells === 40, `${race.cells} cells`);
  // The bug was an unbounded wrap: a long track grew until the question was
  // pushed below the fold. Assert the height cap exists AND is actually
  // engaged by this fixture (content is taller than the cap).
  check('race: long track is height-capped and engages the cap',
    race.trackCap > 0 && race.trackContent > race.trackCap + 8,
    `cap ${race.trackCap}px, content ${race.trackContent}px, box ${Math.round(race.trackHeight)}px`);
  check('race: prompt is inside the visible stage', race.promptInStage === true);
  check('race: page itself does not scroll in fullscreen',
    race.docHeight <= race.viewport.h + 2, `${race.docHeight} vs ${race.viewport.h}`);

  // ------------------------------------------------------------ treasure ----
  const treasure = await evaluate(`(async () => {
    const game = ${JSON.stringify(treasureGame())};
    const saved = await window.eduGame.saveGame(game);
    document.querySelector('[data-play-close]')?.click();
    await new Promise(r => setTimeout(r, 400));
    playGame(saved);
    await new Promise(r => setTimeout(r, 800));
    if (document.documentElement.dataset.fullscreen !== '1') document.querySelector('[data-play-fullscreen]')?.click();
    await new Promise(r => setTimeout(r, 900));
    document.querySelectorAll('.modal, .modal-backdrop').forEach(el =>
      el.getAnimations().forEach(a => { try { a.finish(); } catch {} }));
    await new Promise(r => setTimeout(r, 200));

    const stage = document.querySelector('.game-stage');
    const cs = getComputedStyle(stage);
    // DECISIONS #91: the journey map is a drawer that is collapsed while the
    // teacher is answering ('is-answering' without 'is-peek-open'), so it no
    // longer contributes height on its own. Open it the way the header toggle
    // does before measuring overflow, otherwise the fixture is "tall enough" only
    // by accident of the old always-visible map.
    document.querySelector('#treasureMapToggleBtn')?.click();
    await new Promise(r => setTimeout(r, 150));
    const overflow = stage.scrollHeight - stage.clientHeight;

    // Drive it the way a teacher would: scroll the stage container itself.
    stage.scrollTop = stage.scrollHeight;
    await new Promise(r => setTimeout(r, 250));

    // The last control of a mission must become reachable after scrolling.
    // NB: #treasureActions is an empty placeholder that sits BEFORE
    // .stage-bottom in the markup (gameplay.ts:1260 vs :1262) and is only
    // filled after the answer is checked (showTreasureChoices). Measuring it
    // therefore reported the bottom of the content, not a control, and drifted
    // out of the stage as soon as the panel got tighter. .stage-bottom is the
    // real last node of a mission, so that is what must be reachable.
    const actions = document.querySelector('.stage-bottom') || document.querySelector('#treasureActions');
    const stageRect = stage.getBoundingClientRect();
    const actionsRect = actions?.getBoundingClientRect();
    return {
      viewport: { w: innerWidth, h: innerHeight },
      overflowY: cs.overflowY,
      scrollable: overflow > 8,
      overflow,
      scrollTop: stage.scrollTop,
      reachedBottom: Math.abs(stage.scrollTop - overflow) <= 4,
      actionsVisible: !!actionsRect && actionsRect.top < stageRect.bottom && actionsRect.bottom > stageRect.top,
      docHeight: document.documentElement.scrollHeight,
      mapSticky: document.querySelector('.treasure-map')
        ? getComputedStyle(document.querySelector('.treasure-map')).position : 'missing',
      panelBg: getComputedStyle(document.querySelector('.modal')).backgroundColor
    };
  })()`);

  check('treasure: stage is a scroll container', treasure.overflowY === 'auto' || treasure.overflowY === 'scroll',
    treasure.overflowY);
  // DECISIONS #105: the story is back in the pop-up, so this fixture now fits the
  // stage (measured 0px of overflow at 1366x768). The contract is not "it must
  // overflow" but "if it overflows, the stage scrolls": a tall fixture has to
  // reach its bottom, and a fitting one must stay at scrollTop 0.
  if (treasure.scrollable) {
    check('treasure: a tall fixture scrolls inside the stage', treasure.scrollTop > 0,
      `scrollTop ${Math.round(treasure.scrollTop)} of ${Math.round(treasure.overflow)}`);
  } else {
    check('treasure: a fixture that fits does not scroll the stage', treasure.scrollTop === 0,
      `scrollTop ${Math.round(treasure.scrollTop)}`);
  }
  check('treasure: can reach the bottom of a long mission', treasure.reachedBottom === true,
    `scrollTop ${Math.round(treasure.scrollTop)} of ${Math.round(treasure.overflow)}`);
  check('treasure: mission controls are reachable after scrolling', treasure.actionsVisible === true);
  check('treasure: map stays pinned while the stage scrolls', treasure.mapSticky === 'sticky', treasure.mapSticky);
  check('treasure: page itself does not double-scroll',
    treasure.docHeight <= treasure.viewport.h + 2, `${treasure.docHeight} vs ${treasure.viewport.h}`);
  check('treasure: fullscreen panel has a dark backdrop (no white flash)',
    treasure.panelBg === 'rgb(11, 14, 26)', treasure.panelBg);

  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  ws.close();
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('ERROR: ' + e.message); process.exit(1); });
