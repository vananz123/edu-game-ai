// ui-house-building-check.js — regression guard for House Building Mode
// (Knowledge Arena quiz, DECISIONS #140, revised #141/#143, showcase #142,
// house models + result hero #144).
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
//     question + answers leave the stage, the house grows, the feedback banner
//     stays readable, and the house sits between the HUD and that banner without
//     pushing the stage past the visible play surface (#142);
//   • the result screen reports the house in its ACTUAL state (no auto-complete);
//   • since #144 every house model (classic/vườn/tháp/gỗ) has the same 9 stages and
//     its own measured bounds, the auto pick is stable per game id, and an explicit
//     houseStyle survives into the 3D world;
//   • the result screen shows the actual house as a 3D hero (projected into the
//     same `.house-stage-slot` the answer phase uses) with its model name;
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
function RUN(gameJson, answers) {
  const answersJson = JSON.stringify(answers);
  return `(async () => {
    const answers = ${answersJson};
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    document.querySelector('[data-play-close]')?.click();
    document.getElementById('modalRoot').innerHTML = '';
    await sleep(200);
    playGame(${gameJson});
    await sleep(700);
    const snap = [];
    const take = (label) => {
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
        houseScale: group ? group.scale.x : null,
        houseY: group ? group.position.y : null,
        emblemVisible: threeStageHandle ? threeStageHandle.emblem.visible : null,
        stageHeight: stageEl ? Math.round(stageEl.getBoundingClientRect().height) : null,
        // The showcase must stay inside the visible play surface (#142).
        stageBottom: stageEl ? Math.round(stageEl.getBoundingClientRect().bottom) : null,
        stageTop: stageEl ? Math.round(stageEl.getBoundingClientRect().top) : null,
        stageMinHeight: stageEl ? stageEl.style.minHeight : null,
        modalTop: (() => {
          const modal = document.querySelector('.modal');
          return modal ? Math.round(modal.getBoundingClientRect().top) : null;
        })(),
        modalBottom: (() => {
          const modal = document.querySelector('.modal');
          return modal ? Math.round(modal.getBoundingClientRect().bottom) : null;
        })(),
        viewportH: innerHeight,
        stagePointCenter: sp ? { x: sp.x, y: sp.y } : null,
        hudBottom: (() => {
          const hud = document.querySelector('.house-progress');
          return hud ? Math.round(hud.getBoundingClientRect().bottom) : null;
        })(),
        feedbackTop: (() => {
          const fb = document.querySelector('#answerFeedback');
          return fb ? Math.round(fb.getBoundingClientRect().top) : null;
        })(),
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
  check('house mode renders the parts progress panel', open6.progressPanel === true);
  check('a 3D house world mounts behind the stage', open6.canvas === true);
  check('the game opens with only the foundation (parts 0/6)',
    open6.parts === 0 && open6.maxParts === 6 && (open6.count || '').includes('0/6'),
    `parts=${open6.parts} max=${open6.maxParts} count=${open6.count}`);
  check('the 3D housestage shows only the foundation', open6.stage === 1, `stage=${open6.stage}`);
  check('the intro runs on the first question', open6.answersRecorded === 0);

  // --------------------------------- showcase (#142) ---------------------------------
  console.log('\n=== showcase ===');
  check('house mode reserves a house slot instead of the placeholder picture',
    open6.slot === true && open6.illustration === false,
    `slot=${open6.slot} illustration=${open6.illustration}`);
  check('house mode parks the decorative emblem', open6.emblemVisible === false,
    `emblem=${open6.emblemVisible}`);
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
    Math.abs((a1.stageBottom || 0) - (a1.modalBottom || 0)) <= 2 && a1.modalBottom <= a1.viewportH + 1,
    `stage=${a1.stageTop}..${a1.stageBottom} (${a1.stageHeight}) minH=${a1.stageMinHeight} modal=${a1.modalTop}..${a1.modalBottom} viewport=${a1.viewportH}`);
  check('the showcase house sits between the progress panel and the feedback card',
    Boolean(a1.houseBox) && a1.hudBottom != null && a1.feedbackTop != null &&
      a1.houseBox.top >= a1.hudBottom - 2 && a1.houseBox.bottom <= a1.feedbackTop + 2,
    JSON.stringify({ house: a1.houseBox, hud: a1.hudBottom, feedback: a1.feedbackTop }));
  check('the showcase banner names the correct answer',
    (a1.feedbackText || '').includes('Đáp án đúng') && (a1.feedbackText || '').includes('Chủ động chào hỏi'),
    JSON.stringify(a1.feedbackText));
  check('the "next" button is visible on the showcase', a1.nextVisible === true);

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
    Boolean(res6.houseBox) && Boolean(res6.resultSlotBox) &&
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
      emblemVisible: threeStageHandle ? threeStageHandle.emblem.visible : null
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
  check('classic mode keeps the spinning emblem and no house slot',
    classic.before.emblemVisible === true && classic.before.slot === false,
    `emblem=${classic.before.emblemVisible} slot=${classic.before.slot}`);
  check('classic mode never enters the house showcase', classic.after.showcase === false);
  check('classic mode scoring is unchanged (one answer recorded)', classic.after.answers === 1,
    `${classic.after.answers} answers`);
  check('classic mode feedback still marks green', classic.after.feedbackGood === true);
  check('classic result screen shows no house summary or hero',
    classic.res.onResults === true && classic.res.resultHouse === false &&
    classic.res.resultHero === false && classic.res.houseLayout === false,
    JSON.stringify(classic.res));

  await evaluate(`(async () => {
    document.querySelector('[data-play-close]')?.click();
    document.getElementById('modalRoot').innerHTML = '';
    return true;
  })()`);

  const failed = results.filter(r => !r.ok);
  console.log(`\nui-house-building-check: ${results.length - failed.length}/${results.length} checks passed`);
  await send('Emulation.clearDeviceMetricsOverride').catch(() => { });
  ctx.ws.close();
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('ERROR: ' + e.message); process.exit(1); });
