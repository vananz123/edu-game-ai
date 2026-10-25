// ui-play-surface-check.js — regression guard for the play screen UI.
//
// Covers three defects teachers reported:
//   1. game screen text too small / wasted space / no colour
//   2. "Trình chiếu" button broken (label clipped inside a 30x30 box)
//   3. nav icons not prominent
//
// Run against a built app started with --remote-debugging-port:
//   npm run build
//   npx electron . --remote-debugging-port=9341
//   node tests/ui/ui-play-surface-check.js 9341
const { check, connect, results } = require('../manual/lib/ui-check-lib');

(async () => {
  const { ws, evaluate } = await connect();

  // ---- play screen, question state ----
  const m = await evaluate(`(async () => {
    document.querySelector('.nav-item[data-page="library"]')?.click();
    await new Promise(r => setTimeout(r, 800));
    document.querySelector('[data-action="play"], [data-play]')?.click();
    await new Promise(r => setTimeout(r, 700));
    if (document.documentElement.dataset.fullscreen !== '1') document.querySelector('[data-play-fullscreen]')?.click();
    await new Promise(r => setTimeout(r, 900));
    // Window fullscreen was requested, but the window cannot grow past the
    // screen's work area in every environment; force the layout flag so the
    // fullscreen layout rules still apply while measuring.
    document.documentElement.dataset.fullscreen = '1';
    await new Promise(r => setTimeout(r, 300));
    // Animations are suspended while the window is backgrounded, so finish
    // them explicitly before measuring transforms/sizes.
    document.querySelectorAll('.modal, .modal-backdrop').forEach(el =>
      el.getAnimations().forEach(a => { try { a.finish(); } catch {} }));
    await new Promise(r => setTimeout(r, 200));

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
    return {
      viewport: { w: innerWidth, h: innerHeight },
      questionFont: px(getComputedStyle(q).fontSize),
      questionWeight: getComputedStyle(q).fontWeight,
      optionFont: px(getComputedStyle(opt).fontSize),
      optionHeight: rect(opt).h,
      optionCols: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
      contentWidth: rect(q).w,
      present: { text: present?.textContent.trim(),
        ...rect(present),
        overflowX: present.scrollWidth > present.clientWidth + 1 },
      labelLines: label ? Math.round(rect(label).h / px(getComputedStyle(label).lineHeight || getComputedStyle(label).fontSize)) : null,
      fsBtn: fsBtn ? rect(fsBtn) : null,
      closeBtn: closeBtn ? rect(closeBtn) : null,
      stageBottom: rect(stage).bottom,
      questionColor: getComputedStyle(q).color,
      stageBackground: getComputedStyle(stage).backgroundImage !== 'none',
      docHeight: document.documentElement.scrollHeight
    };
  })()`);

  const vw = m.viewport.w;
  check('question font >= 30px (classroom readable)', m.questionFont >= 30, `${m.questionFont}px`);
  check('question weight bold (>=700)', Number(m.questionWeight) >= 700, m.questionWeight);
  check('answer font >= 16px', m.optionFont >= 15.9, `${m.optionFont}px @ ${vw}px`);
  check('answer option height >= 56px', m.optionHeight >= 56, `${Math.round(m.optionHeight)}px`);
  check('answers stay 2 columns', m.optionCols === 2, `${m.optionCols} cols`);
  check('content uses most of the width (>=80% of viewport)',
    m.contentWidth >= vw * 0.8 && m.contentWidth <= vw, `${Math.round(m.contentWidth)}px of ${vw}px`);
  check('stage reaches near the bottom of the window', m.stageBottom >= m.viewport.h * 0.85,
    `bottom ${Math.round(m.stageBottom)} of ${m.viewport.h}`);
  check('page does not scroll in fullscreen', m.docHeight <= m.viewport.h + 2, `${m.docHeight} vs ${m.viewport.h}`);
  check('stage has a gradient background (not flat)', m.stageBackground === true);

  check('present button is content-sized, not a 30px square', m.present.w > 70, `${Math.round(m.present.w)}px wide`);
  check('present label on one line', m.labelLines === 1, `${m.labelLines} line(s)`);
  check('present label not overflowing its button', m.present.overflowX === false);
  check('present button >= 34px tall (clickable)', m.present.h >= 34, `${Math.round(m.present.h)}px`);
  check('fullscreen + close buttons >= 34px tall',
    !!m.fsBtn && !!m.closeBtn && m.fsBtn.h >= 34 && m.closeBtn.h >= 34,
    `fs ${Math.round(m.fsBtn?.h ?? 0)}px, close ${Math.round(m.closeBtn?.h ?? 0)}px`);
  check('header tools do not collide with each other',
    !!m.fsBtn && !!m.closeBtn && m.fsBtn.right <= m.present.x + 0.5 && m.present.right <= m.closeBtn.x + 0.5,
    `fs.right=${Math.round(m.fsBtn?.right ?? -1)} present.x=${Math.round(m.present.x)} present.right=${Math.round(m.present.right)} close.x=${Math.round(m.closeBtn?.x ?? -1)}`);
  check('tools sit inside the viewport', m.present.right <= vw, `right ${Math.round(m.present.right)} of ${vw}`);

  // ---- answered state ----
  const a = await evaluate(`(async () => {
    document.querySelector('.answer-option').click();
    await new Promise(r => setTimeout(r, 900));
    document.querySelectorAll('.modal, .modal-backdrop').forEach(el =>
      el.getAnimations().forEach(a => { try { a.finish(); } catch {} }));
    const px = v => parseFloat(v) || 0;
    const fb = document.querySelector('#answerFeedback');
    const next = document.querySelector('#nextQuestionBtn');
    const r = next.getBoundingClientRect();
    const body = document.querySelector('.modal-body');
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
  })()`);

  check('answer produces feedback text', a.feedbackText > 20, `${a.feedbackText} chars`);
  check('feedback font >= 13px', a.feedbackFont >= 13, `${a.feedbackFont}px`);
  check('feedback panel has a colour border', a.feedbackBorder !== '0px', a.feedbackBorder);
  check('chosen answer is visibly marked', a.marked >= 1, `${a.marked} marked`);
  check('"Tiếp tục" button is shown and clickable', a.nextVisible === true && a.nextHeight >= 34,
    `${Math.round(a.nextHeight)}px tall`);
  check('document still does not scroll after answering',
    a.docHeight <= a.viewportH + 2, `${a.docHeight} vs ${a.viewportH}`);

  // ---- nav icons ----
  const nav = await evaluate(`(async () => {
    document.querySelector('[data-play-close]')?.click();
    await new Promise(r => setTimeout(r, 500));
    const px = v => parseFloat(v) || 0;
    const icons = Array.from(document.querySelectorAll('.nav-item .nav-icon'));
    const active = document.querySelector('.nav-item.active .nav-icon');
    const inactive = document.querySelector('.nav-item:not(.active) .nav-icon');
    const cs = el => el ? getComputedStyle(el) : null;
    const solid = c => c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent';
    return {
      count: icons.length,
      w: icons[0] ? px(cs(icons[0]).width) : 0,
      h: icons[0] ? px(cs(icons[0]).height) : 0,
      activeSolid: solid(cs(active)?.backgroundColor) || cs(active)?.backgroundImage !== 'none',
      inactiveSolid: solid(cs(inactive)?.backgroundColor),
      activeDistinct: cs(active)?.backgroundImage !== cs(inactive)?.backgroundImage,
      helpDisplay: cs(document.querySelector('#helpBtn'))?.display
    };
  })()`);

  check('every nav item has an icon tile', nav.count >= 6 && nav.w > 0, `${nav.count} icons, ${nav.w}x${nav.h}`);
  check('nav icon tile >= 28px', nav.w >= 28 && nav.h >= 28, `${nav.w}x${nav.h}`);
  check('inactive nav icons have a visible tile', nav.inactiveSolid === true);
  check('active nav icon is a filled brand tile', nav.activeSolid === true && nav.activeDistinct === true);
  check('help button is a centred icon button', nav.helpDisplay === 'grid', nav.helpDisplay);

  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  ws.close();
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('ERROR: ' + e.message); process.exit(1); });
