// ui-house-building-check.js — regression guard for House Building Mode
// (Knowledge Arena quiz, DECISIONS #140, revised #141/#143, showcase #142,
// house models + result hero #144, side HUD column #179, one-column stage + HUD
// strip #208).
//
// The house is a stack of cubes: an always-present foundation (stage 0) plus eight
// buildable stages (3 cube rings, a big front door, 2 windows, a blocky roof,
// a chimney, garden decoration). Each correct answer builds ONE part; each wrong
// answer removes ONE part and never goes below the foundation.
// Since #143 the game's part target follows the quiz length (question count, capped
// at the eight visual stages), and a part reveals one or more visual stages so a
// short quiz still reaches the full model. Scoring stays in game-engine/runtime.ts.
//
// What it proves, against a built app started with --remote-debugging-port:
//   • the house is cubes + door/windows/roof/chimney/decoration (shape of houseParts());
//   • on open the game introduces the house with only its foundation (parts 0);
//   • a correct answer builds exactly one part and the next question follows;
//   • a wrong answer removes exactly one part, floored at the foundation;
//   • the progress panel and the 3D stage stay in lockstep with the part count;
//   • the target follows the question count: 5 questions → 5/5, 8 questions → 8/8,
//     all correct finishes the house on the last answer;
//   • after every answer the house is pulled to the front (`.is-house-showcase`):
//     question + answers leave the stage, the house grows without sliding sideways,
//     and the stage stays inside the visible play surface (#142);
//   • since #208 the stage is ONE column in both phases: a thin "Đã xây n/m phần"
//     HUD STRIP across the top, then the question, then the house slot and the
//     explanation card in the same column — asserted against the projected 3D box,
//     so the house can never overlap the text it shares the stage with, and the
//     HUD can never take a column away from the answers (#179's right column cost
//     273–320 px of width while width is not what ran out);
//   • the result screen reports the house in its ACTUAL state (no auto-complete);
//   • since #144 every house model (classic/vườn/tháp/gỗ) has the same 9 stages and
//     its own measured bounds, the auto pick is stable per game id, and an explicit
//     houseStyle survives into the 3D world;
//   • the result screen shows the actual house as a 3D hero (projected into the
//     same `.house-stage-slot` the answer phase uses) with its model name;
//   • since #179 every model's PROJECTED silhouette fits the slot it was sized for,
//     at four models × two viewport sizes (the old footprint math let a deep model
//     draw past its card);
//   • since #208 html[data-fullscreen="1"] keeps the HUD strip AND the explanation
//     card visible and full-width in the main column: the projector rule that hides
//     side columns without an illustration can no longer swallow them (they moved
//     out of the side column), and the strip must not re-introduce a column beside
//     the answers;
//   • classic mode renders no house UI and keeps house state null (unchanged).
//
// Run:
//   npm run build
//   npx electron . --remote-debugging-port=9341
//   node tests/ui/ui-house-building-check.js 9341
const { check, connect, results } = require('../manual/lib/ui-check-lib');

// Synthetic content only — no real student data (AGENTS.md).
function quizGame(id, questionCount, gameplayMode, houseStyle) {
  const questions = Array.from({ length: questionCount }, (_, n) => ({
    id: 'q' + (n + 1),
    type: 'multiple-choice',
    prompt: 'Cách nào sau đây thể hiện sự tôn trọng bạn mới trong lớp? (câu ' + (n + 1) + ')',
    contentCategory: 'animals',
    iconName: 'paw-print',
    options: [
      { id: 'a', text: 'Chủ động chào hỏi và lắng nghe bạn' },
      { id: 'b', text: 'Đứng quan sát từ xa' },
      { id: 'c', text: 'Kể chuyện cười thật dài' },
      { id: 'd', text: 'Chờ giáo viên giới thiệu' }
    ],
    correctOptionId: 'a',
    correctAnswer: '',
    explanation: 'Chào hỏi chủ động là bước đầu tiên của một tình bạn mới.',
    points: 100
  }));
  const setup = { scoringMode: 'cơ bản', illustrationMode: 'auto' };
  if (gameplayMode === 'house') setup.gameplayMode = 'house';
  if (houseStyle) setup.houseStyle = houseStyle;
  return JSON.stringify({
    id, title: 'Làm quen bạn mới', subject: 'Đạo đức', grade: '4',
    template: 'quiz', description: '', tags: [], sourceName: 'ui-check',
    createdAt: '2026-01-01T00:00:00.000Z',
    gameSetup: setup,
    questions
  });
}

// Open `gameJson` and step through `answers` (one option id per question),
// snapshotting the part count, the 3D stage and the DOM at every transition.
// Returns an ordered array of snapshots (one per label).
// `opts.fullscreen` puts html[data-fullscreen="1"] on the document between the
// close click and the open, so the run plays out under the projector CSS.
//
// WARNING: the body of RUN is ONE template literal. A backtick typed inside it —
// even in a comment — silently closes the string, and the check then dies in Node
// with an error naming nothing near it (#179: "ReferenceError: body is not defined"
// from a comment about .modal-body). No backticks, no ${...} that Node must not see.
function RUN(gameJson, answers, opts) {
  const answersJson = JSON.stringify(answers);
  return `(async () => {
    const answers = ${answersJson};
    const wantFullscreen = ${Boolean(opts && opts.fullscreen)};
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    // #179: the layout assertions compare DOM rectangles with the projected 3D
    // house box, so every region the house must stay clear of is measured.
    const rect = (sel) => {
      const el = document.querySelector(sel);
      if (!el)
        return null;
      const b = el.getBoundingClientRect();
      return {
        top: Math.round(b.top), bottom: Math.round(b.bottom),
        left: Math.round(b.left), right: Math.round(b.right),
        width: Math.round(b.width), height: Math.round(b.height)
      };
    };
    // The app window is usually NOT the foreground window while a check runs, and
    // Chromium then suspends rAF: the house tween never applies (scale frozen at 1)
    // and the camera matrices go stale, so every projected rect turns to garbage
    // (measured: house box top -57114 px). Push one real frame before reading
    // geometry — the assertions then measure WHERE the house is placed, not whether
    // this machine happened to be painting.
    const frame = () => {
      const h = threeStageHandle;
      if (!h || !h.renderer || !h.camera || !h.container)
        return;
      const cw = h.container.clientWidth, ch = h.container.clientHeight;
      if (!cw || !ch)
        return;
      h.renderer.setSize(cw, ch, false);
      h.camera.aspect = cw / ch;
      h.camera.updateProjectionMatrix();
      // Place BEFORE the render: render() is what recomputes matrixWorld, so a
      // house placed after it is still measured through the previous frame's matrix
      // (measured: a 1×1 px "hull" that satisfies every containment assert vacuously).
      if (threeWorld && threeWorld.construction)
        placeHouse(false);
      h.renderer.render(h.scene, h.camera);
    };
    document.querySelector('[data-play-close]')?.click();
    document.getElementById('modalRoot').innerHTML = '';
    await sleep(200);
    // #179: the projector flag is set HERE, after the close click, not before it.
    // That click runs the [data-play-close] handler in shell.ts → setPlayFullscreen
    // (false) → the main process replies with onFullscreenChanged(false) and wipes a
    // flag set earlier (measured: flex-basis back to the windowed 232 px). The check
    // cannot stub the call away either — window.eduGame is a contextBridge object,
    // so assigning to it is silently ignored. CSS stays the thing under test.
    if (wantFullscreen) {
      document.documentElement.setAttribute('data-fullscreen', '1');
      await sleep(250);
    }
    playGame(${gameJson});
    await sleep(700);
    const snap = [];
    const take = (label) => {
      frame();
      const hb = state.houseBuild || houseCreate();
      const sum = houseSummary(hb, houseTargetParts(state.currentGame));
      const count = document.querySelector('.house-count');
      const fill = document.querySelector('.house-bar-fill');
      const ctor = threeWorld && threeWorld.construction;
      const group = ctor ? ctor.group : null;
      const rHouse = document.querySelector('.result-house');
      const rHero = document.querySelector('.result-house-hero');
      const rSlot = document.querySelector('.result-house-hero .house-stage-slot');
      const rStyleEl = document.querySelector('.result-house-style');
      const rSlotBox = rSlot ? rSlot.getBoundingClientRect() : null;
      const stageEl = document.querySelector('.game-stage');
      const qEl = document.querySelector('.stage-question');
      const ansEl = document.querySelector('.answer-grid');
      const fbEl = document.querySelector('#answerFeedback');
      const nextEl = document.getElementById('nextQuestionBtn');
      const hidden = el => !el || getComputedStyle(el).display === 'none';
      const sp = (window.threeGame && threeStageHandle)
        ? window.threeGame.stagePoint(threeStageHandle, 0.5, 0.5, 0) : null;
      snap.push({
        label,
        parts: hb.parts,
        correct: hb.correct,
        wrong: hb.wrong,
        summaryParts: sum.parts,
        maxParts: sum.maxParts,
        completed: sum.completed,
        remaining: sum.remaining,
        answersRecorded: state.gameAnswers.length,
        count: count ? count.innerText.replace(/\\s+/g, ' ').trim() : null,
        bar: fill ? fill.dataset.progress : null,
        stage: ctor ? ctor.currentStage() : null,
        progressPanel: Boolean(document.querySelector('.house-progress')),
        canvas: Boolean(document.querySelector('.game-stage canvas')),
        onResults: Boolean(document.querySelector('.result-screen')),
        resultHero: Boolean(rHero),
        resultSlot: Boolean(rSlot),
        resultLayout: (() => {
          const rs = document.querySelector('.result-screen');
          if (!rs)
            return null;
          return { houseResult: rs.classList.contains('is-house-result'), columns: getComputedStyle(rs).gridTemplateColumns };
        })(),
        resultStyle: rStyleEl ? rStyleEl.innerText.replace(/\\s+/g, ' ').trim() : null,
        resultSlotBox: rSlotBox ? {
          top: Math.round(rSlotBox.top), bottom: Math.round(rSlotBox.bottom),
          left: Math.round(rSlotBox.left), right: Math.round(rSlotBox.right)
        } : null,
        worldStyle: threeWorld && threeWorld.style ? threeWorld.style : null,
        worldStyleLabel: threeWorld && threeWorld.style && typeof houseStyleLabel === 'function'
          ? houseStyleLabel(threeWorld.style) : null,
        resultHouse: rHouse ? rHouse.innerText.replace(/\\s+/g, ' ').trim() : null,
        showcase: Boolean(document.querySelector('.game-stage.is-house-showcase')),
        questionVisible: qEl ? !hidden(qEl) : null,
        answersVisible: ansEl ? !hidden(ansEl) : null,
        slot: Boolean(document.querySelector('.house-stage-slot')),
        illustration: Boolean(document.querySelector('.stage-illustration')),
        feedbackText: fbEl ? fbEl.innerText.replace(/\\s+/g, ' ').trim() : null,
        feedbackBad: fbEl ? fbEl.classList.contains('bad') : null,
        nextVisible: nextEl ? !hidden(nextEl) : null,
        nextDock: (() => {
          const dock = document.querySelector('#quizNextDock');
          if (!dock)
            return null;
          const r = dock.getBoundingClientRect();
          const button = nextEl ? nextEl.getBoundingClientRect() : null;
          const feedback = fbEl ? fbEl.getBoundingClientRect() : null;
          return {
            position: getComputedStyle(dock).position,
            right: Math.round(document.documentElement.clientWidth - r.right),
            bottom: Math.round(innerHeight - r.bottom),
            buttonHeight: button ? Math.round(button.height) : 0,
            overlapsFeedback: Boolean(button && feedback && button.right > feedback.left
              && button.left < feedback.right && button.bottom > feedback.top && button.top < feedback.bottom)
          };
        })(),
        houseScale: group ? group.scale.x : null,
        houseY: group ? group.position.y : null,
        hasEmblem: Boolean(threeStageHandle && threeStageHandle.emblem),
        stageHeight: stageEl ? Math.round(stageEl.getBoundingClientRect().height) : null,
        // The showcase must stay inside the visible play surface (#142). The
        // bottom edge of that surface is the CONTENT box of .modal-body — the
        // modal's border box sits 18 px lower, inside its own padding (#179).
        stageBottom: stageEl ? Math.round(stageEl.getBoundingClientRect().bottom) : null,
        stageTop: stageEl ? Math.round(stageEl.getBoundingClientRect().top) : null,
        stageMinHeight: stageEl ? stageEl.style.minHeight : null,
        surfaceBottom: (() => {
          const playBody = document.querySelector('.modal-body');
          if (!playBody)
            return null;
          const pb = playBody.getBoundingClientRect();
          return Math.round(pb.bottom - (parseFloat(getComputedStyle(playBody).paddingBottom) || 0));
        })(),
        modalTop: (() => {
          const modal = document.querySelector('.modal');
          return modal ? Math.round(modal.getBoundingClientRect().top) : null;
        })(),
        modalBottom: (() => {
          const modal = document.querySelector('.modal');
          return modal ? Math.round(modal.getBoundingClientRect().bottom) : null;
        })(),
        viewportH: innerHeight,
        // The fullscreen section must know the flag was REALLY there when it
        // measured; otherwise a game open that resets it turns the section into a
        // silent re-run of the windowed layout (#179).
        fsFlag: document.documentElement.dataset.fullscreen || null,
        stagePointCenter: sp ? { x: sp.x, y: sp.y } : null,
        // #208: HUD là một DẢI ngang phía trên câu hỏi, không còn cột phải. Bốn
        // hình chữ nhật này là toàn bộ căn cứ của các assert bố cục bên dưới.
        hudBox: rect('.house-progress'),
        stripBox: rect('.game-stage .house-hud-strip'),
        questionBox: rect('.game-stage .stage-question'),
        centerBox: rect('.game-stage .stage-center'),
        mainBox: rect('.game-stage .stage-col.is-main'),
        slotBox: rect('.game-stage .house-stage-slot'),
        houseArt: Boolean(document.querySelector('.house-question-art .stage-illustration')),
        feedbackBox: rect('#answerFeedback'),
        // Project the real 3D bounds to pixels so the showcase can be checked
        // against the DOM furniture it must not cover (#142).
        houseBox: (() => {
          if (!group || !threeStageHandle || !stageEl)
            return null;
          const box = new THREE.Box3().setFromObject(group);
          if (box.isEmpty())
            return null;
          const cam = threeStageHandle.camera;
          const area = stageEl.getBoundingClientRect();
          let top = Infinity, bottom = -Infinity, left = Infinity, right = -Infinity;
          for (const x of [box.min.x, box.max.x])
            for (const y of [box.min.y, box.max.y])
              for (const z of [box.min.z, box.max.z]) {
                const v = new THREE.Vector3(x, y, z).project(cam);
                const py = area.top + (1 - v.y) / 2 * area.height;
                const px = area.left + (v.x + 1) / 2 * area.width;
                if (py < top)
                  top = py;
                if (py > bottom)
                  bottom = py;
                if (px < left)
                  left = px;
                if (px > right)
                  right = px;
              }
          return {
            top: Math.round(top), bottom: Math.round(bottom),
            left: Math.round(left), right: Math.round(right)
          };
        })()
      });
    };
    take('open');
    for (let i = 0; i < answers.length; i++) {
      document.querySelector('.answer-option[data-answer="' + answers[i] + '"]').click();
      await sleep(750);
      take('after-answer-' + (i + 1));
      const nextBtn = document.getElementById('nextQuestionBtn');
      if (nextBtn) { nextBtn.click(); await sleep(500); }
      take(i + 1 < answers.length ? 'question-' + (i + 2) : 'results');
    }
    return snap;
  })()`;
}

const byLabel = (snaps, label) => snaps.find(s => s.label === label) || {};

// A projected hull that collapsed to a point (a stale `matrixWorld`, a world that
// never painted) sits inside ANY rectangle, so every containment assert below would
// pass while measuring nothing. Demand a box that actually spans pixels (#179).
const hull = (b) => Boolean(b) && b.right - b.left >= 60 && b.bottom - b.top >= 60;

// The silhouette the camera draws must stay inside the rectangle it was fitted to
// (#179). Tolerance is 2 px: the fit aims at `fill` of the slot and converges to
// under a pixel, so anything past 2 px is a model drawing outside its column.
// `minSpan` is the anti-vacuity floor: a finished house is called at 60 px, but a
// one-part house on a 768-px-tall projector legitimately draws 52 px inside a 123 px
// slot, so that phase passes its own (still 50× larger than a collapsed) floor.
const fits = (b, r, minSpan = 60) => Boolean(b) && Boolean(r) &&
  b.right - b.left >= minSpan && b.bottom - b.top >= minSpan &&
  b.left >= r.left - 2 && b.right <= r.right + 2 &&
  b.top >= r.top - 2 && b.bottom <= r.bottom + 2;

(async () => {
  const ctx = await connect();
  const { evaluate, send } = ctx;
  // Geometry checks target the presentation window (same as the screenshots),
  // not whatever the machine's screen allows, so the showcase fit is stable.
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false
  }).catch(() => { });

  // A fresh profile opens the setup onboarding into #modalRoot a moment after the
  // window loads. It replaces the play surface this check steps through, so wait
  // for it and dismiss it before the first game.
  await evaluate(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 40; i++) { if (document.querySelector('#modalRoot .setup-fullscreen')) break; await sleep(100); }
    if (typeof closeSetupWizard === 'function') closeSetupWizard('close');
    await sleep(250);
    return true;
  })()`);

  // -------------------------------------------------- House shape (cubes) ----
  console.log('\n=== house shape ===');
  const shape = await evaluate(`(() => {
    const stages = houseParts();
    const all = stages.slice(1).flat();
    const ring = stages[1] || [];
    return {
      stageCount: stages.length,
      maxParts: houseMaxParts(),
      foundationParts: stages[0].length,
      foundationKind: stages[0][0] && stages[0][0].kind,
      ringCubes: ring.length,
      ringAllUnitCubes: ring.every(s => s.kind === 'box' && s.w === 0.7 && s.h === 0.7 && s.d === 0.7),
      hasBigDoor: all.some(s => s.color === 0x6b4f3a && s.h >= 1),
      windowCount: all.filter(s => s.color === 0xa8dadc).length,
      hasRoof: all.some(s => s.color === 0xc05c48),
      hasChimney: all.some(s => s.color === 0x8d5524),
      hasTree: all.some(s => s.color === 0x6a994e)
    };
  })()`);
  check('the house has a foundation + 8 buildable parts', shape.stageCount === 9 && shape.maxParts === 8,
    `stages=${shape.stageCount} maxParts=${shape.maxParts}`);
  check('the foundation is a single slab', shape.foundationParts === 1 && shape.foundationKind === 'box');
  check('the first buildable part is a 10-cube ring', shape.ringCubes === 10 && shape.ringAllUnitCubes === true);
  check('the house has a big door', shape.hasBigDoor === true);
  check('the house has two windows', shape.windowCount === 2, `${shape.windowCount} windows`);
  check('the house has a blocky roof + chimney', shape.hasRoof === true && shape.hasChimney === true);
  check('the house has a little garden decoration', shape.hasTree === true);

  // ------------------------------------------------- House models (#144) ----
  // Four models share the same 9-stage contract (foundation + 8 buildable parts)
  // so the #143 economy is style-independent. Each has its own measured envelope.
  console.log('\n=== house models ===');
  const styles = await evaluate(`(() => {
    const ids = ['nha-mai-do', 'nha-vuon', 'thap-canh', 'nha-go'];
    const models = ids.map(id => {
      const stages = houseParts(id);
      const all = stages.slice(1).flat();
      const topY = all.map(p => (p.y || 0) + (p.h || 0));
      return {
        id,
        stageCount: stages.length,
        foundationParts: stages[0].length,
        buildableCounts: stages.slice(1).map(s => s.length),
        topY: Math.round(Math.max.apply(null, topY) * 100) / 100,
        colors: new Set(all.map(p => p.color)).size,
        boxes: all.filter(p => p.kind === 'box').length
      };
    });
    return {
      models,
      options: houseStyleOptions(),
      defaultStageCount: houseParts().length,
      auto5: houseStyleFor(undefined, 'ui-house-5'),
      auto6: houseStyleFor(undefined, 'ui-house-6'),
      auto8: houseStyleFor(undefined, 'ui-house-8'),
      autoRepeat: houseStyleFor(undefined, 'ui-house-5') === houseStyleFor(undefined, 'ui-house-5'),
      explicit: houseStyleFor('thap-canh', 'ui-house-5'),
      empty: houseStyleFor('', ''),
      unknown: houseStyleFor('khong-co', 'ui-house-5'),
      bounds: ids.map(id => Object.assign({ id }, houseBounds(id)))
    };
  })()`);
  check('there are four selectable house models', styles.options.length === 4 &&
    styles.options.map(o => o.id).join(',') === 'nha-mai-do,nha-vuon,thap-canh,nha-go' &&
    styles.options.every(o => Boolean(o.label)),
    JSON.stringify(styles.options));
  check('every model keeps the foundation + 8 buildable stages',
    styles.models.every(m => m.stageCount === 9 && m.foundationParts === 1) &&
    styles.defaultStageCount === 9,
    JSON.stringify(styles.models.map(m => [m.id, m.stageCount, m.foundationParts])));
  check('every model fills all eight buildable stages',
    styles.models.every(m => m.buildableCounts.length === 8 && m.buildableCounts.every(n => n > 0)),
    JSON.stringify(styles.models.map(m => [m.id, m.buildableCounts])));
  check('every model is a distinct multi-colour build',
    styles.models.every(m => m.topY >= 2.4 && m.colors >= 5) &&
    new Set(styles.models.map(m => m.id + ':' + m.topY + ':' + m.colors + ':' + m.boxes)).size === 4,
    JSON.stringify(styles.models.map(m => [m.id, m.topY, m.colors, m.boxes])));
  check('every model has its own placement bounds',
    styles.bounds.every(b => b.w >= 3 && b.w <= 5 && b.h >= 2.4 && b.h <= 3.4) &&
    styles.bounds.find(b => b.id === 'thap-canh').w < styles.bounds.find(b => b.id === 'nha-go').w &&
    styles.bounds.find(b => b.id === 'nha-vuon').h < styles.bounds.find(b => b.id === 'nha-mai-do').h,
    JSON.stringify(styles.bounds));
  // The showcase sizes the house on the plane the camera actually sees (front of the
  // model), so a missing or absurd `front` silently shrinks every house (#179).
  check('every model reports the near face its placement is sized from (#179)',
    styles.bounds.every(b => b.front >= 0.5 && b.front <= 2.5) &&
      new Set(styles.bounds.map(b => b.front)).size >= 2,
    JSON.stringify(styles.bounds.map(b => [b.id, b.front])));
  check('an explicit model always wins over the auto pick',
    styles.explicit === 'thap-canh', styles.explicit);
  check('the auto pick is stable for the same game and varies across games',
    styles.autoRepeat === true && styles.auto5 !== styles.auto8 &&
    styles.auto5 === styles.unknown,
    `auto5=${styles.auto5} auto8=${styles.auto8}`);
  check('an empty game id falls back to the classic red-roof house', styles.empty === 'nha-mai-do', styles.empty);

  // --------------------------- House mode, 6 questions (build + remove) ----
  // Answers a,a,b,a,a,a → parts 1,2,1,2,3,4. The wrong 3rd answer removes the
  // part the 2nd answer built; the game ends unfinished at 4/6. The part target
  // follows the quiz length (#143), and a part covers 1–2 visual stages so the
  // six-part house still reaches the full eight-stage model.
  console.log('\n=== house mode (6 questions, build + remove) ===');
  const g6 = await evaluate(RUN(quizGame('ui-house-6', 6, 'house'), ['a', 'a', 'b', 'a', 'a', 'a']));

  const open6 = byLabel(g6, 'open');
  check('the Xây nhà continue/skip popup stays hidden before the first answer',
    open6.nextVisible === false, String(open6.nextVisible));
  check('house mode renders the parts progress panel', open6.progressPanel === true);
  check('the house HUD is a full-width strip above the question (#208)',
    Boolean(open6.stripBox && open6.hudBox && open6.questionBox && open6.mainBox) &&
      open6.hudBox.left >= open6.stripBox.left - 1 && open6.hudBox.right <= open6.stripBox.right + 1 &&
      open6.stripBox.width >= open6.mainBox.width - 4 &&
      open6.stripBox.bottom <= open6.questionBox.top + 2 && open6.hudBox.width >= 200,
    JSON.stringify({ hud: open6.hudBox, strip: open6.stripBox, question: open6.questionBox, main: open6.mainBox }));
  check('the HUD strip takes no column away from the house slot (#208)',
    Boolean(open6.hudBox && open6.slotBox && open6.mainBox) &&
      open6.hudBox.bottom <= open6.slotBox.top + 1 &&
      open6.slotBox.width >= open6.mainBox.width - 4,
    JSON.stringify({ hud: open6.hudBox, slot: open6.slotBox, main: open6.mainBox }));
  check('a 3D house world mounts behind the stage', open6.canvas === true);
  check('the game opens with only the foundation (parts 0/6)',
    open6.parts === 0 && open6.maxParts === 6 && (open6.count || '').includes('0/6'),
    `parts=${open6.parts} max=${open6.maxParts} count=${open6.count}`);
  check('the 3D housestage shows only the foundation', open6.stage === 1, `stage=${open6.stage}`);
  check('the intro runs on the first question', open6.answersRecorded === 0);

  // --------------------------------- showcase (#142) ---------------------------------
  console.log('\n=== showcase ===');
  check('house mode reserves a house slot instead of the auto placeholder picture',
    open6.slot === true && open6.illustration === false && open6.houseArt === false,
    `slot=${open6.slot} illustration=${open6.illustration} houseArt=${open6.houseArt}`);
  // DECISIONS #220: the emblem is gone from the shared 3D layer, so house mode
  // cannot leak it and nothing has to park it.
  check('no decorative emblem anywhere in the 3D layer', open6.hasEmblem === false,
    `emblem=${open6.hasEmblem}`);
  check('stagePoint projects the stage centre to the world origin',
    Boolean(open6.stagePointCenter) && Math.abs(open6.stagePointCenter.x) < 0.001 && Math.abs(open6.stagePointCenter.y) < 0.001,
    JSON.stringify(open6.stagePointCenter));
  check('the house waits in its slot while the question is on screen',
    open6.houseScale > 0.3 && open6.houseScale < 1.6, `scale=${open6.houseScale}`);

  const a1 = byLabel(g6, 'after-answer-1');
  check('a correct answer builds exactly ONE part', a1.parts === 1 && a1.correct === 1, `parts=${a1.parts}`);
  check('the first part reveals the first build group (2 stages on a 6-question quiz)', a1.stage === 3, `stage=${a1.stage}`);
  check('the progress bar moves to 1/6', (a1.count || '').includes('1/6') && a1.bar === '17',
    `count=${a1.count} bar=${a1.bar}`);
  check('an answer pulls the house to the front', a1.showcase === true, `showcase=${a1.showcase}`);
  check('the house grows into the free stage space',
    a1.houseScale > open6.houseScale * 1.4,
    `scale=${a1.houseScale} (slot ${open6.houseScale})`);
  check('the showcase hides the question and the answers',
    a1.questionVisible === false && a1.answersVisible === false,
    `question=${a1.questionVisible} answers=${a1.answersVisible}`);
  check('the showcase fills the visible play surface',
    Math.abs((a1.stageBottom || 0) - (a1.surfaceBottom || 0)) <= 2 && (a1.surfaceBottom || 0) <= a1.viewportH + 1,
    `stage=${a1.stageTop}..${a1.stageBottom} (${a1.stageHeight}) surface=${a1.surfaceBottom} modal=${a1.modalTop}..${a1.modalBottom} viewport=${a1.viewportH}`);
  check('the showcase keeps the house clear of the explanation card (#208)',
    hull(a1.houseBox) && Boolean(a1.feedbackBox) && a1.feedbackBox.top >= a1.houseBox.bottom - 2,
    JSON.stringify({ house: a1.houseBox, feedback: a1.feedbackBox }));
  check('the showcase house is pinned inside its slot',
    hull(a1.houseBox) && Boolean(a1.slotBox) &&
      a1.houseBox.top >= a1.slotBox.top - 4 && a1.houseBox.bottom <= a1.slotBox.bottom + 4 &&
      a1.houseBox.left >= a1.slotBox.left - 4 && a1.houseBox.right <= a1.slotBox.right + 4,
    JSON.stringify({ house: a1.houseBox, slot: a1.slotBox }));
  check('the HUD keeps its strip position when the showcase opens',
    Boolean(a1.hudBox && open6.hudBox) && Math.abs(a1.hudBox.left - open6.hudBox.left) <= 2 &&
      a1.hudBox.width >= 200,
    JSON.stringify({ before: open6.hudBox, after: a1.hudBox }));
  // Thẻ lời giải thích bị `max-width: 1040px` của bố cục toàn màn hình khoá lại, nên
  // nó KHÔNG bao giờ trải trọn cột (1053px ở cửa sổ thường, 1271px ở máy chiếu). Điều
  // #179 thật sự cần chặn là thẻ co về một DẢI MỎNG bên cạnh nhà (cột phải 232px), vì
  // vậy ngưỡng ở đây là "còn là một dải rộng", không phải "trọn bề rộng cột".
  check('the explanation card is a wide readable band, not a side rail (#208)',
    Boolean(a1.feedbackBox && a1.mainBox) && a1.feedbackBox.width >= 0.6 * a1.mainBox.width &&
      a1.feedbackBox.height >= 40,
    JSON.stringify({ feedback: a1.feedbackBox, main: a1.mainBox }));
  check('the showcase banner names the correct answer',
    (a1.feedbackText || '').includes('Đáp án đúng') && (a1.feedbackText || '').includes('Chủ động chào hỏi'),
    JSON.stringify(a1.feedbackText));
  check('the "next" button is visible on the showcase', a1.nextVisible === true);
  check('the Xây nhà continue/skip action floats in the bottom-right corner',
    a1.nextDock?.position === 'fixed' && a1.nextDock.right >= 0 && a1.nextDock.right <= 24
      && a1.nextDock.bottom >= 0 && a1.nextDock.bottom <= 24
      && a1.nextDock.buttonHeight >= 34 && a1.nextDock.overlapsFeedback === false,
    JSON.stringify(a1.nextDock));

  const q2 = byLabel(g6, 'question-2');
  check('the new part carries into the next question', q2.parts === 1 && (q2.count || '').includes('1/6'),
    `parts=${q2.parts} count=${q2.count}`);
  check('the next question restores the question and the slot',
    q2.showcase === false && q2.questionVisible === true && q2.slot === true,
    `showcase=${q2.showcase} question=${q2.questionVisible} slot=${q2.slot}`);
  check('the house returns to its slot for the next question', q2.houseScale < 1.6, `scale=${q2.houseScale}`);

  const a2 = byLabel(g6, 'after-answer-2');
  check('a second correct answer builds a second part', a2.parts === 2 && a2.stage === 4,
    `parts=${a2.parts} stage=${a2.stage}`);

  const a3 = byLabel(g6, 'after-answer-3');
  check('a wrong answer removes exactly ONE part', a3.parts === 1, `parts=${a3.parts}`);
  check('the 3D house removes the last built group', a3.stage === 3, `stage=${a3.stage}`);
  check('the progress bar drops back to 1/6', (a3.count || '').includes('1/6') && a3.bar === '17',
    `count=${a3.count} bar=${a3.bar}`);
  check('a wrong answer is recorded as wrong', a3.wrong === 1 && a3.correct === 2,
    `correct=${a3.correct} wrong=${a3.wrong}`);
  check('a wrong answer also showcases the house',
    a3.showcase === true && a3.feedbackBad === true,
    `showcase=${a3.showcase} bad=${a3.feedbackBad}`);

  const a4 = byLabel(g6, 'after-answer-4');
  const a5 = byLabel(g6, 'after-answer-5');
  const a6 = byLabel(g6, 'after-answer-6');
  check('correct answers keep building one part at a time',
    a4.parts === 2 && a5.parts === 3 && a6.parts === 4,
    `parts=${a4.parts},${a5.parts},${a6.parts}`);
  check('the visual stages follow the part count (4 parts → 6 of 8 stages)',
    a4.stage === 4 && a5.stage === 5 && a6.stage === 7,
    `stages=${a4.stage},${a5.stage},${a6.stage}`);
  // #179: the showcase pins the stage to the rectangle it already had. Reading that
  // rectangle back from `.modal`'s own bottom made the pin feed itself — the modal
  // grew, the next pin saw more room, and the window crept (+25 px, then +56 px per
  // answer). A stable height from the second answer on is what proves the loop is
  // gone; the first answer may still settle (the feedback card joins the layout).
  check('the showcase stage height stops creeping between answers (#179)',
    [a2, a3, a4, a5, a6].every(s => Math.abs((s.stageHeight || 0) - (a2.stageHeight || 0)) <= 2),
    [a1, a2, a3, a4, a5, a6].map(s => s.stageHeight).join(','));
  check('every showcase stays inside the visible surface (#179)',
    [a1, a2, a3, a4, a5, a6].every(s => s.surfaceBottom != null
      && Math.abs((s.stageBottom || 0) - s.surfaceBottom) <= 2
      && s.surfaceBottom <= s.viewportH + 1),
    [a1, a2, a3, a4, a5, a6].map(s => `${s.stageBottom}/${s.surfaceBottom}`).join(' '));

  const res6 = byLabel(g6, 'results');
  check('the result screen shows the house in its ACTUAL state', (res6.resultHouse || '').includes('4/6 phần'),
    JSON.stringify(res6.resultHouse));
  check('an unfinished house is labelled "Còn dang dở"', (res6.resultHouse || '').includes('Còn dang dở'),
    JSON.stringify(res6.resultHouse));
  check('an unfinished house is not celebrated', !(res6.resultHouse || '').includes('🎉'),
    JSON.stringify(res6.resultHouse));

  // ------------------------------ Result hero (#144) ------------------------------
  console.log('\n=== result hero ===');
  check('the house result screen shows a 3D hero next to the summary',
    res6.resultHero === true && res6.resultSlot === true &&
    res6.resultLayout && res6.resultLayout.houseResult === true &&
    (res6.resultLayout.columns || '').split(' ').length === 2,
    JSON.stringify({ hero: res6.resultHero, slot: res6.resultSlot, layout: res6.resultLayout }));
  check('the result hero is tall enough to show the model',
    Boolean(res6.resultSlotBox) && res6.resultSlotBox.bottom - res6.resultSlotBox.top >= 200,
    JSON.stringify(res6.resultSlotBox));
  check('the result hero renders the auto-selected house at its final stage',
    res6.worldStyle === styles.auto6 && res6.stage === 7,
    `world=${res6.worldStyle} expected=${styles.auto6} stage=${res6.stage}`);
  check('the result caption names the model shown in 3D',
    res6.resultStyle === 'Mẫu: ' + res6.worldStyleLabel && Boolean(res6.worldStyleLabel),
    JSON.stringify({ caption: res6.resultStyle, style: res6.worldStyle, label: res6.worldStyleLabel }));
  check('the result house is pinned inside its hero slot',
    hull(res6.houseBox) && Boolean(res6.resultSlotBox) &&
      res6.houseBox.top >= res6.resultSlotBox.top - 4 &&
      res6.houseBox.bottom <= res6.resultSlotBox.bottom + 4 &&
      res6.houseBox.left >= res6.resultSlotBox.left - 4 &&
      res6.houseBox.right <= res6.resultSlotBox.right + 4,
    JSON.stringify({ house: res6.houseBox, slot: res6.resultSlotBox }));

  // --------------------- House mode, 5 questions (short quiz completes) ----
  // The owner's example (#143): a 5-question quiz must be able to finish the
  // house, so the target is 5 parts and each part reveals 1–2 of the 8 stages.
  console.log('\n=== house mode (5 questions, all correct → complete) ===');
  const g5 = await evaluate(RUN(quizGame('ui-house-5', 5, 'house'), ['a', 'a', 'a', 'a', 'a']));

  const open5 = byLabel(g5, 'open');
  check('a 5-question game targets a 5-part house', open5.parts === 0 && open5.maxParts === 5 &&
    (open5.count || '').includes('0/5'), `parts=${open5.parts} max=${open5.maxParts} count=${open5.count}`);
  check('an auto game builds the model its id hashes to', open5.worldStyle === styles.auto5,
    `world=${open5.worldStyle} expected=${styles.auto5}`);
  const s1 = byLabel(g5, 'after-answer-1');
  check('on a 5-question quiz one part covers two visual stages', s1.parts === 1 && s1.stage === 3,
    `parts=${s1.parts} stage=${s1.stage}`);
  const s5 = byLabel(g5, 'after-answer-5');
  check('all 5 correct answers complete the house on the last one',
    s5.parts === 5 && s5.completed === true, `parts=${s5.parts} completed=${s5.completed}`);
  check('the short-quiz house reaches the full 8-stage model', s5.stage === 9, `stage=${s5.stage}`);
  check('the 5-question progress bar reaches 100%', s5.bar === '100', `bar=${s5.bar}`);

  const res5 = byLabel(g5, 'results');
  check('the result screen shows 5/5 parts', (res5.resultHouse || '').includes('5/5 phần'),
    JSON.stringify(res5.resultHouse));
  check('a completed 5-question house is celebrated', (res5.resultHouse || '').includes('Đã hoàn thiện 🎉'),
    JSON.stringify(res5.resultHouse));

  // --------------------- House mode, 8 questions (full completion) ----
  // The other owner example: 8 questions → 8 parts, one visual stage per part,
  // finished exactly on the last answer.
  console.log('\n=== house mode (8 questions, all correct → complete) ===');
  const g8 = await evaluate(RUN(quizGame('ui-house-8', 8, 'house'), ['a', 'a', 'a', 'a', 'a', 'a', 'a', 'a']));

  const open8 = byLabel(g8, 'open');
  check('an 8-question game targets the full 8-part house', open8.parts === 0 && open8.maxParts === 8 &&
    (open8.count || '').includes('0/8'), `parts=${open8.parts} max=${open8.maxParts} count=${open8.count}`);
  const e1 = byLabel(g8, 'after-answer-1');
  check('on an 8-question quiz one part is one visual stage', e1.parts === 1 && e1.stage === 2,
    `parts=${e1.parts} stage=${e1.stage}`);
  const e7 = byLabel(g8, 'after-answer-7');
  check('seven of eight answers leave one part standing', e7.parts === 7 && e7.completed === false &&
    e7.stage === 8, `parts=${e7.parts} completed=${e7.completed} stage=${e7.stage}`);
  const e8 = byLabel(g8, 'after-answer-8');
  check('eight correct answers complete all 8 parts', e8.parts === 8 && e8.completed === true,
    `parts=${e8.parts} completed=${e8.completed}`);
  check('the full house shows every stage when complete', e8.stage === 9, `stage=${e8.stage}`);
  check('the 8-question progress bar reaches 100%', e8.bar === '100', `bar=${e8.bar}`);

  const res8 = byLabel(g8, 'results');
  check('the result screen shows 8/8 parts', (res8.resultHouse || '').includes('8/8 phần'),
    JSON.stringify(res8.resultHouse));
  check('a completed house is celebrated', (res8.resultHouse || '').includes('Đã hoàn thiện 🎉'),
    JSON.stringify(res8.resultHouse));

  // --------------------- House mode, 3 questions (wrong → floor at 0) ----
  console.log('\n=== house mode (3 questions, all wrong → foundation floor) ===');
  const g3 = await evaluate(RUN(quizGame('ui-house-3', 3, 'house'), ['b', 'b', 'b']));

  const w1 = byLabel(g3, 'after-answer-1');
  check('a wrong answer at the foundation never removes the foundation', w1.parts === 0 && w1.stage === 1,
    `parts=${w1.parts} stage=${w1.stage}`);
  const w3 = byLabel(g3, 'after-answer-3');
  check('staying on wrong answers keeps the house at the foundation', w3.parts === 0 && w3.wrong === 3,
    `parts=${w3.parts} wrong=${w3.wrong}`);
  const res3 = byLabel(g3, 'results');
  check('an all-wrong game reports 0/3 parts', (res3.resultHouse || '').includes('0/3 phần'),
    JSON.stringify(res3.resultHouse));
  check('an all-wrong game is not celebrated', !(res3.resultHouse || '').includes('🎉'),
    JSON.stringify(res3.resultHouse));

  // --------------------- Explicit model override (gameSetup.houseStyle) ----
  console.log('\n=== explicit house model ===');
  const gStyle = await evaluate(RUN(quizGame('ui-house-style', 2, 'house', 'thap-canh'), ['a', 'a']));
  const openStyle = byLabel(gStyle, 'open');
  const resStyle = byLabel(gStyle, 'results');
  check('an explicit houseStyle reaches the 3D world', openStyle.worldStyle === 'thap-canh',
    `world=${openStyle.worldStyle}`);
  check('the explicit model completes on a 2-question quiz', openStyle.maxParts === 2 &&
    byLabel(gStyle, 'after-answer-2').completed === true);
  check('the result screen captions the explicit model', (resStyle.resultStyle || '').includes('Tháp canh'),
    JSON.stringify(resStyle.resultStyle));

  // ------------------------------------------------- Classic mode unchanged ----
  console.log('\n=== classic mode (unchanged) ===');
  const classic = await evaluate(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    document.querySelector('[data-play-close]')?.click();
    document.getElementById('modalRoot').innerHTML = '';
    await sleep(200);
    playGame(${quizGame('ui-house-classic', 2, undefined)});
    await sleep(700);
    const before = {
      houseProg: Boolean(document.querySelector('.house-progress')),
      canvas: Boolean(document.querySelector('.game-stage canvas')),
      houseBuild: state.houseBuild,
      slot: Boolean(document.querySelector('.house-stage-slot')),
      hasEmblem: Boolean(threeStageHandle && threeStageHandle.emblem)
    };
    document.querySelector('.answer-option[data-answer="a"]').click();
    await sleep(450);
    const after = {
      answers: state.gameAnswers.length,
      houseProg: Boolean(document.querySelector('.house-progress')),
      houseBuild: state.houseBuild,
      feedbackGood: Boolean(document.querySelector('#answerFeedback.good')),
      showcase: Boolean(document.querySelector('.game-stage.is-house-showcase'))
    };
    document.getElementById('nextQuestionBtn').click();
    await sleep(450);
    document.querySelector('.answer-option[data-answer="a"]').click();
    await sleep(450);
    document.getElementById('nextQuestionBtn').click();
    await sleep(600);
    const res = {
      onResults: Boolean(document.querySelector('.result-screen')),
      resultHouse: Boolean(document.querySelector('.result-house')),
      resultHero: Boolean(document.querySelector('.result-house-hero')),
      houseLayout: Boolean(document.querySelector('.result-screen.is-house-result')),
      houseProg: Boolean(document.querySelector('.house-progress'))
    };
    return { before, after, res };
  })()`);

  check('classic mode shows no house panel', classic.before.houseProg === false);
  check('classic mode still mounts the 3D backdrop', classic.before.canvas === true);
  check('classic mode keeps house state untouched', classic.before.houseBuild === null,
    JSON.stringify(classic.before.houseBuild));
  check('classic mode shows no emblem (#220) and no house slot',
    classic.before.hasEmblem === false && classic.before.slot === false,
    `emblem=${classic.before.hasEmblem} slot=${classic.before.slot}`);
  check('classic mode never enters the house showcase', classic.after.showcase === false);
  check('classic mode scoring is unchanged (one answer recorded)', classic.after.answers === 1,
    `${classic.after.answers} answers`);
  check('classic mode feedback still marks green', classic.after.feedbackGood === true);
  check('classic result screen shows no house summary or hero',
    classic.res.onResults === true && classic.res.resultHouse === false &&
    classic.res.resultHero === false && classic.res.houseLayout === false,
    JSON.stringify(classic.res));

  // -------- Fullscreen / projector keeps the HUD strip + explanation (#208) --------
  // wizard.css:468 hides every .stage-col side column that has no
  // .stage-illustration once html[data-fullscreen="1"] is set. Under #179 the parts
  // HUD and the explanation card BOTH lived in the house side column, so on a
  // projector they went to 0x0. #208 moves them into the main column, which flips
  // the risk: the projector rules must now keep the strip and the card visible and
  // full-width, and must not re-introduce a column that steals width from the
  // answers. The app sets that attribute from the main process, so the check sets it
  // directly — the CSS is what is under test.
  console.log('\n=== fullscreen keeps HUD strip + explanation (#208) ===');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1366, height: 768, deviceScaleFactor: 1, mobile: false
  });
  await new Promise(r => setTimeout(r, 700));
  // RUN's third argument turns the projector flag on *inside* the run, after the
  // close click that would otherwise wipe it (see RUN). Every snapshot then carries
  // the flag it was measured with, and the first check below proves this section
  // really measured fullscreen: an earlier version of it set the attribute from the
  // outside and silently re-ran the WINDOWED layout at 232 px while reporting green.
  const fsRun = await evaluate(RUN(quizGame('ui-house-fs', 5, 'house', 'nha-mai-do'), ['a', 'a', 'a', 'a', 'a'], { fullscreen: true }));
  await evaluate(`(() => { document.documentElement.removeAttribute('data-fullscreen'); return true; })()`);
  const fsOpen = byLabel(fsRun, 'open');
  const fsAnswer = byLabel(fsRun, 'after-answer-1');
  const fsQuestion = byLabel(fsRun, 'question-2');
  check('the fullscreen flag stayed set for every measurement',
    fsRun.length > 0 && fsRun.every(s => s.fsFlag === '1'),
    JSON.stringify({ snapshots: fsRun.length, flags: fsRun.map(s => s.fsFlag) }));
  check('fullscreen keeps the house HUD strip on screen',
    fsOpen.stripBox && fsOpen.stripBox.width > 0 && fsOpen.stripBox.height > 0,
    JSON.stringify(fsOpen.stripBox));
  check('fullscreen keeps the parts HUD visible',
    fsOpen.hudBox && fsOpen.hudBox.width > 0 && fsOpen.hudBox.height > 0,
    JSON.stringify(fsOpen.hudBox));
  check('fullscreen keeps the explanation card visible',
    fsAnswer.feedbackBox && fsAnswer.feedbackBox.width > 0 && fsAnswer.feedbackBox.height > 0,
    JSON.stringify(fsAnswer.feedbackBox));
  check('fullscreen Xây nhà keeps continue/skip in the bottom-right popup',
    fsAnswer.nextDock?.position === 'fixed' && fsAnswer.nextDock.right >= 0
      && fsAnswer.nextDock.right <= 24 && fsAnswer.nextDock.bottom >= 0
      && fsAnswer.nextDock.bottom <= 24 && fsAnswer.nextDock.buttonHeight >= 34
      && fsAnswer.nextDock.overlapsFeedback === false,
    JSON.stringify(fsAnswer.nextDock));
  check('fullscreen puts the HUD strip above the house slot',
    fsOpen.hudBox && fsOpen.slotBox && fsOpen.hudBox.bottom <= fsOpen.slotBox.top + 1,
    JSON.stringify({ hud: fsOpen.hudBox, slot: fsOpen.slotBox }));
  check('fullscreen showcase house clears the explanation card',
    hull(fsAnswer.houseBox) && Boolean(fsAnswer.feedbackBox) &&
      fsAnswer.feedbackBox.top >= fsAnswer.houseBox.bottom - 2,
    JSON.stringify({ house: fsAnswer.houseBox, feedback: fsAnswer.feedbackBox }));
  check('fullscreen showcase hull stays inside its slot',
    fits(fsAnswer.houseBox, fsAnswer.slotBox),
    JSON.stringify({ house: fsAnswer.houseBox, slot: fsAnswer.slotBox }));
  check('fullscreen question hull stays inside its slot',
    fits(fsQuestion.houseBox, fsQuestion.slotBox, 40),
    JSON.stringify({ house: fsQuestion.houseBox, slot: fsQuestion.slotBox }));
  check('fullscreen showcase stays inside the visible surface',
    fsAnswer.stageBottom !== null && fsAnswer.surfaceBottom !== null &&
    fsAnswer.stageBottom <= fsAnswer.surfaceBottom + 2,
    `${fsAnswer.stageBottom}/${fsAnswer.surfaceBottom}`);
  check('fullscreen keeps the strip full-width and the card a wide band',
    fsOpen.mainBox && fsAnswer.mainBox &&
      fsOpen.hudBox.width >= fsOpen.mainBox.width - 8 &&
      fsAnswer.feedbackBox.width >= 0.6 * fsAnswer.mainBox.width &&
      fsOpen.hudBox.width > byLabel(g6, 'open').hudBox.width,
    JSON.stringify({ projectorHud: fsOpen.hudBox.width, projectorMain: fsOpen.mainBox.width, projectorFeedback: fsAnswer.feedbackBox.width, windowedHud: byLabel(g6, 'open').hudBox.width }));

  await evaluate(`(async () => {
    document.querySelector('[data-play-close]')?.click();
    document.getElementById('modalRoot').innerHTML = '';
    return true;
  })()`);
  // Sizing on footprint × pxPerUnit let a DEEP model draw wider than the rectangle
  // it was fitted to: the garden's 4,08-unit yard projected 456 px into a 423 px hero
  // slot at 1366x768 and 532 px into a 426 px slot at 1920x1080, so the house poked
  // out of its own card. The fit now measures the eight projected corners of the
  // envelope, so the assert has to measure them too — and on the three models the
  // sections above never place (they all ran the auto pick at 1600x1000).
  console.log('\n=== every model fits its slot, two sizes (#179) ===');
  for (const size of [[1366, 768], [1920, 1080]]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: size[0], height: size[1], deviceScaleFactor: 1, mobile: false
    });
    await new Promise(r => setTimeout(r, 700));
    for (const id of ['nha-mai-do', 'nha-vuon', 'thap-canh', 'nha-go']) {
      const fitted = await evaluate(RUN(
        quizGame('ui-house-fit-' + id + '-' + size[0], 5, 'house', id),
        ['a', 'a', 'a', 'a', 'a']));
      const last = byLabel(fitted, 'after-answer-5');
      const res = byLabel(fitted, 'results');
      check(`${id} showcase hull stays inside its column @${size[0]}x${size[1]}`,
        last.worldStyle === id && fits(last.houseBox, last.slotBox),
        JSON.stringify({ house: last.houseBox, slot: last.slotBox, style: last.worldStyle }));
      check(`${id} result hull stays inside its hero slot @${size[0]}x${size[1]}`,
        fits(res.houseBox, res.resultSlotBox),
        JSON.stringify({ house: res.houseBox, slot: res.resultSlotBox }));
    }
  }

  await evaluate(`(async () => {
    document.querySelector('[data-play-close]')?.click();
    document.getElementById('modalRoot').innerHTML = '';
    return true;
  })()`);

  const failed = results.filter(r => !r.ok);
  console.log(`\nui-house-building-check: ${results.length - failed.length}/${results.length} checks passed`);
  await send('Emulation.clearDeviceMetricsOverride').catch(() => { });
  ctx.ws.close();
  // `process.exit()` drops buffered stdout when the output is a redirected file,
  // which truncates the report right after the last section header. Setting the
  // code lets Node drain the writes on its own (the socket above is already closed).
  process.exitCode = failed.length ? 1 : 0;
})().catch(e => { console.error('ERROR: ' + e.message + '\n' + e.stack); process.exitCode = 1; });
