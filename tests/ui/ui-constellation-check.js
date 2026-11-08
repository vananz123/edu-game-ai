// ui-constellation-check.js — regression guard for "Chòm sao tri thức"
// (DECISIONS #171, recomposed in #172, label geometry re-cut in #174,
// both halves of a joined pair shown in #178).
//
// WHAT IT PROVES, against a built app started with --remote-debugging-port:
//   • the layout: ONE tray of answer cards, a large scene, no second answer list;
//   • correct / wrong drops through the real drag path, and tap/keyboard placement;
//   • the constellation edges stay hidden until a match, then reveal one by one;
//   • a term-sized side HANGS on its own star (centred, clear of the star's body,
//     stem and dot landing on it) and a long one moves to the readable row under
//     the scene with ONE pointer line — placed in its star's grid column and
//     numbered on the star, so the pairing survives a crowded sky (#174);
//   • five pairs, the completion flow, the 3D RESULT sky (framed inside the result
//     hero, disposed by both exits — DECISIONS #175) and the projector view;
//   • an old saved picture id still opens and still plays;
//   • a JOINED pair shows BOTH halves — the star's own term and the answer that
//     was dropped on it, as a second line of the same card, on the board, in the
//     no-WebGL SVG and in the projector view — and answering never rescales the
//     sky, so a two-line card stays centred on its star (#178);
//   • the fitted FIGURE is centred in its frame, fills it, and is capped so a
//     two-star fragment does not become two enormous circles (#177);
//   • the 16:9 classroom size: the scene keeps its share of the play area, the
//     labels stay on their stars, and no label covers one;
//   • the board's text is projector-sized: a 15 px floor for a star label, a row
//     card and the answer line of a joined pair, 16 px in the tray (#219) — the
//     old floors were 13/12/13 and measured 10–13 px on a 1366x768 projector;
//   • the bigger type does not cost the sky its room: the status line now sits in
//     the feedback lane's headroom instead of stacking under the scene, so the
//     ten-star board still measures the same 239 px of scene at 1366x768, and
//     every star is labelled exactly once — hung on the star when the star has a
//     lane, in the numbered row when it does not (#219);
//   • a WRONG attempt says WHAT was wrong and paints it: the feedback names both
//     halves and the penalty, the tray card and the star's own label (or its row
//     card and number) carry `.is-wrong` for the length of the lock, and the mark
//     is gone once the board repaints (#219 — measured `0` visible marks before).
//
// DETERMINISM: the window is a BACKGROUND window, so requestAnimationFrame is
// frozen. Nothing here waits on an animation: frames are advanced through
// `threeStageHandle.onStep`, the card flight has a wall-clock deadline, and every
// other wait is a DOM gate. Each section opens its own game and asserts state, so
// the file can run repeatedly in one app launch.
//
// Run:
//   npm run build
//   npx electron . --remote-debugging-port=9391
//   node tests/ui/ui-constellation-check.js 9391
const { check, connect, results } = require('../manual/lib/ui-check-lib');

// Synthetic content only — no real student data (AGENTS.md).
const ORION = ['alnilam', 'alnitak', 'mintaka', 'betelgeuse', 'bellatrix', 'saiph', 'rigel', 'meissa', 'thabit', 'tabit'];
const LONG_LABEL = 'Một định nghĩa rất dài để buộc thẻ câu phải nằm ngoài cảnh ba chiều và vẫn đọc được';
const LONG_LABELS = [
  LONG_LABEL,
  'Hô hấp tế bào giải phóng năng lượng từ glucose cho mọi hoạt động sống của cây',
  'Trao đổi khí qua khí khổng diễn ra cả ban ngày lẫn ban đêm theo nồng độ'
];
// 22 characters: a TERM under the readability floor (`CONSTELLATION_SHORT_LABEL_MAX`
// = 24) and over the ~16 characters the pre-#174 estimate allowed beside a star.
const MID_LABEL = 'diệp lục và carotenoit';

function matchingGame(id, pairCount, mode, options) {
  const opts = options || {};
  // The side that reaches a star is pair.left on a left-to-right board and
  // pair.right on a right-to-left one, so the long text goes there.
  const longOnRight = opts.direction === 'right-to-left';
  const pairs = Array.from({ length: pairCount }, (_, n) => {
    const pairId = opts.starIds ? opts.starIds[n] : 'p' + (n + 1);
    const left = 'Khái niệm ' + (n + 1);
    const right = 'Định nghĩa ' + (n + 1);
    if (opts.midFirst && n === 0) return longOnRight ? { id: pairId, left, right: MID_LABEL } : { id: pairId, left: MID_LABEL, right };
    if (!opts.longFirst || n !== 0) return { id: pairId, left, right };
    return longOnRight ? { id: pairId, left, right: LONG_LABEL } : { id: pairId, left: LONG_LABEL, right };
  });
  const matching = {
    mode: mode || 'columns',
    pairs,
    pointsPerPair: 100,
    completionBonus: 200,
    wrongPenalty: 0,
    timeBonus: 0,
    bonusUnderSeconds: 0,
    practiceMode: false
  };
  if (mode === 'connection') {
    matching.connectionTemplate = opts.template || 'orion';
    if (opts.direction) matching.dragDirection = opts.direction;
  }
  return JSON.stringify({
    id,
    title: 'Chòm sao thử',
    subject: 'Khoa học',
    grade: '7',
    template: 'matching',
    description: '',
    tags: [],
    sourceName: 'ui-check',
    createdAt: '2026-01-01T00:00:00.000Z',
    questions: [],
    matchingGame: matching
  });
}

/** Close whatever is playing and open `gameJson`, waiting for the scene. */
function OPEN(gameJson) {
  return `(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    document.getElementById('closeResultBtn')?.click();
    document.querySelector('[data-play-close]')?.click();
    document.getElementById('modalRoot').innerHTML = '';
    await sleep(350);
    playGame(${gameJson}, { fullscreen: true });
    for (let i = 0; i < 60; i++) {
      if (document.querySelector('[data-constellation-scene]') || document.querySelector('.matching-board') || document.querySelector('.memory-card')) break;
      await sleep(100);
    }
    for (let i = 0; i < 60; i++) {
      if (document.querySelector('.game-stage canvas') || document.querySelector('[data-constellation-scene][data-connection3d="off"]')) break;
      await sleep(100);
    }
    await sleep(300);
    return true;
  })()`;
}

/** The state of the board, as data. */
const snapshot = () => `JSON.stringify({
  board: state.currentGame && state.currentGame.id,
  connected: state.connectionProgress ? state.connectionProgress.connectedStageIds.slice() : [],
  lit: [...document.querySelectorAll('[data-star-card].is-lit, [data-question-card].is-lit')].map(el => el.dataset.starCard || el.dataset.questionCard),
  answers: [...document.querySelectorAll('[data-answer-card]')].map(el => ({ id: el.dataset.answerCard, text: el.textContent.trim() })),
  sceneCards: [...document.querySelectorAll('[data-star-card]')].map(el => ({ id: el.dataset.starCard, text: el.textContent.trim() })),
  questionCards: [...document.querySelectorAll('[data-question-card]')].map(el => ({ id: el.dataset.questionCard, text: el.textContent.trim() })),
  pointers: document.querySelectorAll('[data-constellation-pointers] path').length,
  edges: threeWorld && threeWorld.graph ? threeWorld.graph.links.map(l => l.drawn ? 1 : 0).join('') : 'n/a',
  matched: state.matchingPlay ? state.matchingPlay.matched : -1,
  wrong: state.matchingPlay ? state.matchingPlay.wrong : -1,
  hud: (document.querySelector('[data-constellation-count]') || {}).textContent || ''
})`;

(async () => {
  const ctx = await connect();
  const { evaluate, send } = ctx;
  await send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false }).catch(() => {});

  await evaluate(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 40; i++) { if (document.querySelector('#modalRoot .setup-fullscreen')) break; await sleep(100); }
    if (typeof closeSetupWizard === 'function') closeSetupWizard('close');
    document.getElementById('modalRoot').innerHTML = '';
    await sleep(250);
    return true;
  })()`);

  // -------------------------------------------------- constellation data ----
  console.log('\n=== constellation data ===');
  const data = await evaluate(`(() => {
    document.body.insertAdjacentHTML('beforeend', '<div id="probeGallery">' + constellationGalleryHtml('cygnus', 'probe') + '</div>');
    const out = {
      ids: CONSTELLATION_TEMPLATE_IDS.slice(),
      stars: CONSTELLATION_TEMPLATES.map(t => t.stars.length),
      unknown: constellationResolve('khong-co').id,
      legacy: constellationResolve('solar-system').id,
      galleryCards: document.querySelectorAll('#probeGallery [data-connection-template]').length,
      checked: (document.querySelector('#probeGallery input:checked') || {}).value || null
    };
    document.getElementById('probeGallery').remove();
    return JSON.stringify(out);
  })()`).then(JSON.parse);
  check('seven constellations ship in the renderer', data.ids.length === 7, JSON.stringify(data.ids));
  check('every constellation can fill the longest board', data.stars.every(n => n >= 10), JSON.stringify(data.stars));
  check('an unknown id falls back and an old picture id is mapped',
    data.unknown === 'ursa-major' && data.legacy === 'orion', `${data.unknown}/${data.legacy}`);
  check('the gallery renders one card per constellation with the pick selected',
    data.galleryCards === 7 && data.checked === 'cygnus', `cards=${data.galleryCards} checked=${data.checked}`);

  // ------------------------------------------------------ the layout ------
  console.log('\n=== the layout: one tray, a big scene ===');
  const game = matchingGame('ui-const-5', 5, 'connection', { template: 'orion', starIds: ORION.slice(0, 5), longFirst: true });
  await evaluate(OPEN(game));
  const layout = JSON.parse(await evaluate(`(() => {
    const box = sel => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; };
    const stage = box('.game-stage');
    const scene = box('[data-constellation-scene]');
    const chrome = box('.constellation-chrome');
    return JSON.stringify({
      stage, scene, chrome,
      tray: box('[data-constellation-tray]'),
      status: box('[data-constellation-status]'),
      kicker: Boolean(document.querySelector('.stage-kicker')),
      footer: Boolean(document.querySelector('.stage-bottom')),
      worldTag: Boolean(document.querySelector('.stage-world-tag')),
      secondAnswerList: document.querySelectorAll('[data-match-side]').length,
      fallbackDrawn: document.querySelectorAll('[data-constellation-scene] .constellation-link').length,
      pointerPaths: document.querySelectorAll('[data-constellation-pointers] path').length,
      edges: threeWorld.graph.links.map(l => l.drawn ? 1 : 0).join(''),
      panelCount: document.querySelectorAll('[data-constellation-panel]').length
    });
  })()`));
  check('there is exactly one answer area (no second list, no A–E pick row)',
    layout.secondAnswerList === 0 && layout.panelCount === 1, JSON.stringify({ secondAnswerList: layout.secondAnswerList }));
  check('no redundant kicker, footer or world tag',
    layout.kicker === false && layout.footer === false && layout.worldTag === false,
    JSON.stringify({ kicker: layout.kicker, footer: layout.footer, worldTag: layout.worldTag }));
  check('the scene takes the largest share of the play area',
    layout.scene[3] / layout.stage[3] >= 0.5,
    `scene=${layout.scene[3]} of stage=${layout.stage[3]} (${Math.round(layout.scene[3] / layout.stage[3] * 100)}%)`);
  check('the tray sits under the scene, across the width',
    layout.tray[1] >= layout.scene[1] + layout.scene[3] && layout.tray[2] >= layout.scene[2] * 0.9,
    `tray=${JSON.stringify(layout.tray)} scene=${JSON.stringify(layout.scene)}`);
  // The static SVG lives in the scene for the no-WebGL fallback; with 3D live it
  // is covered by the canvas, so what must be empty is the SVG's own drawing.
  check('the scene carries no constellation edge before a match',
    layout.edges === '0000' && layout.fallbackDrawn === 0,
    `edges=${layout.edges} fallback paths=${layout.fallbackDrawn}`);
  check('three-dimensional edges exist but none is drawn',
    (await evaluate(`threeWorld.graph.links.map(l => (l.tube ? (l.tube.visible ? 'v' : 'h') : 'none')).join('')`)) === 'hhhh',
    'every edge starts hidden');

  console.log('\n=== the room: a lit board, no 3D backdrop ===');
  // --------------------------------------------------- the room: no frame --
  // DECISIONS #173 removed the grey felt frame; #220 replaced the 3D cosmos
  // backdrop (#173) with a CSS day-sky board and dropped the 60 fps decorative
  // canvas, so the page runs lighter. Measured on the COMPUTED style, because the
  // felt came from three different files (world tokens, gameplay.css,
  // fullscreen.css) and a rule that lost the specificity fight would still show
  // as a declaration in the source but not in the box the class sees.
  const room = JSON.parse(await evaluate(`(() => {
    const cs = sel => { const el = document.querySelector(sel); return el ? getComputedStyle(el) : null; };
    const stage = cs('.game-stage');
    const scene = cs('[data-constellation-scene]');
    const modal = cs('.modal[data-player-theme]');
    const body = cs('.modal[data-player-theme] .modal-body');
    const before = document.querySelector('.game-stage') ? getComputedStyle(document.querySelector('.game-stage'), '::before') : null;
    const handle = threeStageHandle;
    const parse = s => { const m = String(s).match(/rgba?\\(([^)]+)\\)/); if (!m) return null;
      const p = m[1].split(/[,\\/ ]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2] }; };
    const lum = c => (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
    const modalC = modal ? parse(modal.backgroundColor) : null;
    const stageC = stage ? parse(stage.backgroundColor) : null;
    return JSON.stringify({
      stageBg: stage && stage.backgroundImage,
      stageBgColor: stage && stage.backgroundColor,
      stageBorder: stage && stage.borderTopWidth,
      stageRadius: stage && stage.borderTopLeftRadius,
      stageShadow: stage && stage.boxShadow,
      beforeDisplay: before && before.display,
      sceneBg: scene && scene.backgroundImage,
      sceneShadow: scene && scene.boxShadow,
      sceneRadius: scene && scene.borderTopLeftRadius,
      modalBg: modal && modal.backgroundColor,
      modalLum: modalC ? lum(modalC) : -1,
      stageLum: stageC ? lum(stageC) : -1,
      bodyPad: body && [body.paddingTop, body.paddingRight, body.paddingBottom, body.paddingLeft].join(' '),
      hasCosmos: Boolean(threeWorld && threeWorld.cosmos),
      hasDust: handle ? Boolean(handle.particles) : null,
      hasEmblem: handle ? Boolean(handle.emblem) : null,
      hasSky: Boolean(handle && handle.scene && handle.scene.background),
      skyIsNull: Boolean(handle && handle.scene && !handle.scene.background)
    });
  })()`));
  check('the stage draws no felt: no gradient, no border, no radius, no shadow',
    room.stageBg === 'none' && room.stageBorder === '0px' && room.stageRadius === '0px' && room.stageShadow === 'none',
    JSON.stringify({ bg: room.stageBg, border: room.stageBorder, radius: room.stageRadius, shadow: room.stageShadow }));
  check('the world texture overlay is switched off', room.beforeDisplay === 'none', `::before display=${room.beforeDisplay}`);
  // #220: the scene paints the day sky in CSS; the canvas only draws stars and
  // edges on top of it, so the scene MUST have a background and no frame echo.
  check('the scene paints the day sky and keeps its own rounded card',
    room.sceneBg !== 'none' && room.sceneRadius !== '0px',
    JSON.stringify({ bg: room.sceneBg.slice(0, 60), radius: room.sceneRadius }));
  check('the modal is a light surface and the body wastes no padding',
    room.modalLum >= 0.85 && room.bodyPad === '0px 0px 0px 0px',
    JSON.stringify({ modalBg: room.modalBg, modalLum: Number(room.modalLum.toFixed(3)), bodyPad: room.bodyPad }));
  check('no decorative 3D backdrop is built: no cosmos, no dust, no emblem',
    room.hasCosmos === false && room.hasDust === false && room.hasEmblem === false,
    JSON.stringify({ cosmos: room.hasCosmos, dust: room.hasDust, emblem: room.hasEmblem }));
  check('the 3D scene has no sky mesh — the canvas is transparent over the CSS sky',
    room.skyIsNull === true,
    JSON.stringify({ hasSky: room.hasSky, skyIsNull: room.skyIsNull }));

  // ------------------------------------------------ answers and labels ----
  const opening = JSON.parse(await evaluate(snapshot()));
  check('five pairs give five answer cards with their real text',
    opening.answers.length === 5 && opening.answers.every(a => a.text.startsWith('Định nghĩa')),
    JSON.stringify(opening.answers.map(a => a.text)));
  check('short sides sit on their stars, the long one in the question row',
    opening.sceneCards.length === 4 && opening.questionCards.length === 1 && opening.questionCards[0].id === 'alnilam',
    `scene=${JSON.stringify(opening.sceneCards.map(c => c.id))} row=${JSON.stringify(opening.questionCards.map(c => c.id))}`);
  check('exactly one pointer line, for the moved card',
    opening.pointers === 1, `pointers=${opening.pointers}`);
  check('no pointer is drawn for a card that sits on the scene',
    opening.pointers === opening.questionCards.length, `pointers=${opening.pointers} moved=${opening.questionCards.length}`);
  // DECISIONS #174: a label HANGS on its star — a 15 px stem ending in a dot ON the
  // star — and never covers it. The assertion this replaces ("the label's own
  // centre hits the star") was the bug: it proved the card sat over the star and
  // hid it, which is how the class lost the pairing.
  const hangGeometry = `(() => {
    const points = updateConnectionStarPoints();
    const read = (el, key) => {
      const r = el.getBoundingClientRect();
      const p = points[el.dataset[key]];
      if (!p) return { id: el.dataset[key], missing: true };
      const below = el.dataset.side === 'below';
      const foot = below ? r.top - 15 : r.bottom + 15;
      return { id: el.dataset[key], dx: Math.round(r.left + r.width / 2 - p.x),
        gap: Math.round(Math.abs(foot - p.y)),
        covers: p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom,
        side: el.dataset.side };
    };
    return JSON.stringify({
      labels: [...document.querySelectorAll('[data-star-card]')].map(el => read(el, 'starCard')),
      marks: [...document.querySelectorAll('[data-star-mark]')].map(el => read(el, 'starMark'))
    });
  })()`;
  const hung = JSON.parse(await evaluate(hangGeometry));
  check('every label hangs centred on its own star',
    hung.labels.length === 4 && hung.labels.every(l => l.dx === 0),
    JSON.stringify(hung.labels.map(l => [l.id, l.dx])));
  check("the label's stem lands on the star it names",
    hung.labels.every(l => l.gap <= 3), JSON.stringify(hung.labels.map(l => [l.id, l.gap])));
  check('no label covers its star',
    hung.labels.concat(hung.marks).every(l => l.covers === false),
    JSON.stringify(hung.labels.concat(hung.marks).filter(l => l.covers !== false).map(l => l.id)));
  check('a star whose question moved down wears the number its card starts with',
    hung.marks.length === 1 && hung.marks[0].id === 'alnilam' && hung.marks[0].dx === 0 && hung.marks[0].gap <= 3
      && (await evaluate(`(() => {
        const mark = document.querySelector('[data-star-mark]');
        const index = document.querySelector('[data-question-card] .constellation-card-index');
        return Boolean(mark && index && mark.textContent.trim() === index.textContent.trim());
      })()`)) === true,
    JSON.stringify({ marks: hung.marks.map(m => [m.id, m.dx, m.gap]) }));
  check('the labels stay inside the scene', (await evaluate(`(() => {
    const frame = document.querySelector('[data-constellation-scene]').getBoundingClientRect();
    return [...document.querySelectorAll('[data-star-card]')].every(el => {
      const r = el.getBoundingClientRect();
      return r.left >= frame.left - 2 && r.right <= frame.right + 2 && r.top >= frame.top - 2 && r.bottom <= frame.bottom + 2;
    });
  })()`)) === true, 'every label is inside the picture');
  // DECISIONS #176, and the guard this whole file was blind to. Every check above
  // compares a DOM box with `updateConnectionStarPoints()`, and the DOM boxes are
  // PLACED from that same function — so a projection that is wrong in a way that
  // moves the labels and the points together passes them all. A raycast is the
  // only opinion here that comes from the rendered pixels: it maps the client
  // point through the canvas, exactly as WebGL composites it. Measured before the
  // fix at 1366x768: the affine used the frame rect, and it missed all three belt
  // stars by 34–56 px while `dx` stayed 0.
  const raycastTruth = JSON.parse(await evaluate(`(() => {
    const points = updateConnectionStarPoints();
    const bodies = Object.keys(threeWorld.graph.nodes).map(id => threeWorld.graph.nodes[id].mesh).filter(Boolean);
    const misses = Object.keys(points).map(id => {
      const hit = window.threeGame.pick(threeStageHandle, points[id].x, points[id].y, { targets: bodies });
      return { id, hit: hit && hit.id };
    }).filter(entry => entry.hit !== entry.id);
    return JSON.stringify({ stars: Object.keys(points).length, misses });
  })()`));
  check('a ray at each projected star hits THAT star (pixels, not self-consistency)',
    raycastTruth.stars === 5 && raycastTruth.misses.length === 0,
    JSON.stringify(raycastTruth.misses));

  // -------------------------------------------------- a correct drop ------
  console.log('\n=== a correct drop reveals the edge ===');
  const correctDrop = JSON.parse(await evaluate(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const card = document.querySelector('[data-answer-card="alnitak"]');
    const points = updateConnectionStarPoints();
    const target = points.alnitak;
    const dt = new DataTransfer();
    card.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
    await sleep(40);
    const armed = state.drag && state.drag.answerId;
    const armedTrace = { hasCard: Boolean(card), board: state.currentGame.id, drag: Boolean(state.drag), over: state.drag && state.drag.over };
    const scene = document.querySelector('[data-constellation-scene]');
    scene.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: target.x, clientY: target.y }));
    await sleep(40);
    const hot = [...document.querySelectorAll('[data-star-card].is-hot')].map(el => el.dataset.starCard);
    const before = JSON.parse(${snapshot()});
    scene.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: target.x, clientY: target.y }));
    await sleep(900);
    return JSON.stringify({ armed, armedTrace, hot, before, after: JSON.parse(${snapshot()}) });
  })()`));
  check('a drag arms the board without scoring', correctDrop.armed === 'alnitak' && correctDrop.before.matched === 0,
    JSON.stringify({ armed: correctDrop.armed, matched: correctDrop.before.matched, trace: correctDrop.armedTrace }));
  check('the star under the card lights up before the drop', correctDrop.hot.join() === 'alnitak',
    JSON.stringify(correctDrop.hot));
  check('a correct drop lights one star and scores it',
    correctDrop.after.connected.length === 1 && correctDrop.after.matched === 1,
    JSON.stringify({ connected: correctDrop.after.connected, matched: correctDrop.after.matched }));
  check('the landed card leaves the tray and the star becomes a lit label',
    correctDrop.after.answers.length === 4 && correctDrop.after.lit.includes('alnitak'),
    `tray=${correctDrop.after.answers.length} lit=${JSON.stringify(correctDrop.after.lit)}`);
  // The figure's edge order is belt-1, belt-2, shoulder-1, shoulder-2, and a
  // stage owns every link that reaches its star — so `alnitak` reveals belt-1
  // and `mintaka` reveals belt-2 (its own schema, not the order of the drop).
  check('a constellation edge appears only for the pair that was matched',
    correctDrop.after.edges === '1010', correctDrop.after.edges);
  check('the HUD counts the star', correctDrop.after.hud.includes('1/5'), correctDrop.after.hud);

  // ---------------------------------------------------- a wrong drop ------
  console.log('\n=== a wrong drop changes nothing on the sky ===');
  const wrongDrop = JSON.parse(await evaluate(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const card = document.querySelector('[data-answer-card="mintaka"]');
    const points = updateConnectionStarPoints();
    const target = points.betelgeuse;
    const dt = new DataTransfer();
    card.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
    await sleep(30);
    const before = JSON.parse(${snapshot()});
    document.querySelector('[data-constellation-scene]').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: target.x, clientY: target.y }));
    // Sampled INSIDE the 550 ms lock: this is the window the class is looking at,
    // and before #219 it was empty of any red mark on the board.
    let marked = null;
    for (let i = 0; i < 40; i++) {
      const trayCard = document.querySelector('[data-answer-card="mintaka"]');
      const starCard = document.querySelector('[data-star-card="betelgeuse"]');
      if (trayCard && trayCard.classList.contains('is-wrong')) {
        const feedback = document.getElementById('matchFeedback');
        const cs = getComputedStyle(trayCard);
        const star = starCard ? getComputedStyle(starCard) : null;
        marked = {
          locked: Boolean(state.matchingPlay && state.matchingPlay.lock),
          trayCard: true,
          starCard: Boolean(starCard && starCard.classList.contains('is-wrong')),
          trayBorder: cs.borderTopColor,
          starBorder: star ? star.borderTopColor : '',
          text: feedback ? feedback.textContent.trim() : '',
          tone: feedback ? feedback.className : '',
          fontSize: feedback ? parseFloat(getComputedStyle(feedback).fontSize) : 0
        };
        break;
      }
      await sleep(15);
    }
    await sleep(1100);
    const leftovers = {
      any: document.querySelectorAll('.is-wrong').length,
      matched: state.matchingPlay.matched
    };
    return JSON.stringify({ before, after: JSON.parse(${snapshot()}), flying: document.querySelectorAll('.constellation-fly').length, marked, leftovers });
  })()`));
  check('a wrong drop scores a mistake', wrongDrop.after.wrong === wrongDrop.before.wrong + 1,
    `${wrongDrop.before.wrong} -> ${wrongDrop.after.wrong}`);
  check('a wrong drop lights nothing and reveals no edge',
    wrongDrop.after.connected.length === wrongDrop.before.connected.length && wrongDrop.after.edges === wrongDrop.before.edges,
    `edges ${wrongDrop.before.edges} -> ${wrongDrop.after.edges}`);
  check('a wrong drop puts the card back in the tray',
    wrongDrop.after.answers.length === wrongDrop.before.answers.length,
    `${wrongDrop.before.answers.length} -> ${wrongDrop.after.answers.length}`);
  check('nothing is left flying after the answer', wrongDrop.flying === 0, `flying=${wrongDrop.flying}`);
  // #219: the feedback is the only place the class learns WHY. It has to name the
  // card that was dropped and the star it missed — "✕ Chưa đúng — thử lại." told
  // nobody anything — and it has to be readable from the back row. The card class
  // carries a row's pair ORDER, not a star id, so the dropped one is the third
  // remaining non-long pair ("Định nghĩa 3") and the star it hit, betelgeuse,
  // stands for "Khái niệm 4" on these synthetic pairs.
  check('the wrong feedback names the card, the star and the penalty',
    Boolean(wrongDrop.marked)
      && wrongDrop.marked.text.includes('Định nghĩa 3') && wrongDrop.marked.text.includes('Chưa đúng')
      && /không thuộc sao/.test(wrongDrop.marked.text) && /không trừ điểm|điểm/.test(wrongDrop.marked.text)
      && wrongDrop.marked.text.includes('Khái niệm 4'),
    wrongDrop.marked ? wrongDrop.marked.text : 'no mark was seen during the lock');
  check('the wrong feedback is painted as bad news at 15 px or more',
    Boolean(wrongDrop.marked) && /\bbad\b/.test(wrongDrop.marked.tone || '') && wrongDrop.marked.fontSize >= 15,
    wrongDrop.marked ? `class="${wrongDrop.marked.tone}" font=${wrongDrop.marked.fontSize}px` : 'no mark');
  check('the dropped card turns red while the board is locked',
    Boolean(wrongDrop.marked) && wrongDrop.marked.trayCard === true && wrongDrop.marked.locked === true,
    JSON.stringify(wrongDrop.marked && { trayCard: wrongDrop.marked.trayCard, locked: wrongDrop.marked.locked }));
  check('the star it missed turns red too, so the pairing is visible',
    Boolean(wrongDrop.marked) && wrongDrop.marked.starCard === true,
    JSON.stringify(wrongDrop.marked && { starCard: wrongDrop.marked.starCard }));
  check('the red marks are gone once the lock releases',
    wrongDrop.leftovers.any === 0 && wrongDrop.leftovers.matched === wrongDrop.after.matched,
    JSON.stringify(wrongDrop.leftovers));

  // ------------------------------------------------- tap-to-place -------
  // `alnitak` and `mintaka` are lit by now, so this section taps bellatrix's
  // card: wrong onto mintaka first, then right onto its own star. The lesson
  // numbers are read off the board, not assumed — the card the tray draws for
  // bellatrix and the label mintaka wears are whatever the same flywheel
  // (`constellationPairSides`) produced for the drag path.
  const tap = JSON.parse(await evaluate(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const labelOf = star => {
      const el = document.querySelector('[data-star-card="' + star + '"]') || document.querySelector('[data-question-card="' + star + '"]');
      return el ? el.textContent.trim() : '';
    };
    const bellatrix = labelOf('bellatrix');
    const mintaka = labelOf('mintaka');
    // A WRONG tap first: tap-to-place is its own path into the one attempt
    // resolver, so the stamp and the named feedback have to arrive here too (#219).
    const missCard = document.querySelector('[data-answer-card="bellatrix"]');
    missCard.click();
    await sleep(60);
    document.querySelector('[data-star-card="mintaka"]').click();
    let miss = null;
    for (let i = 0; i < 40; i++) {
      const stamped = document.querySelector('[data-answer-card="bellatrix"].is-wrong');
      if (stamped) {
        const feedback = document.getElementById('matchFeedback');
        miss = {
          trayCard: true,
          missText: stamped.textContent.trim(),
          targetText: mintaka,
          starCard: Boolean(document.querySelector('[data-star-card="mintaka"].is-wrong')),
          text: feedback ? feedback.textContent.trim() : ''
        };
        break;
      }
      await sleep(15);
    }
    await sleep(1100);
    const cleared = document.querySelectorAll('.is-wrong').length;
    const before = JSON.parse(${snapshot()});
    const litBefore = before.connected;
    const edgesBefore = before.edges;
    const card = document.querySelector('[data-answer-card="bellatrix"]');
    card.click();
    await sleep(60);
    const selected = card.classList.contains('is-selected');
    const label = document.querySelector('[data-star-card="bellatrix"]');
    label.click();
    await sleep(500);
    const tapped = JSON.parse(${snapshot()});
    const good = document.getElementById('matchFeedback');
    // The tray card must be gone once the star is lit, so the next section starts
    // from a state the class could also be in.
    return JSON.stringify({
      bellatrix, mintaka, miss, cleared, selected, tapped, litBefore, edgesBefore,
      good: good ? good.textContent.trim() : ''
    });
  })()`));
  check('a wrong tap marks the card and the star it missed',
    Boolean(tap.miss) && tap.miss.trayCard === true && tap.miss.starCard === true && tap.cleared === 0,
    JSON.stringify({ miss: tap.miss, cleared: tap.cleared }));
  check('a wrong tap says the same thing a wrong drop does',
    Boolean(tap.miss) && /không thuộc sao/.test(tap.miss.text)
      && tap.miss.text.includes(tap.miss.missText) && tap.miss.text.includes(tap.miss.targetText),
    tap.miss ? tap.miss.text : 'no mark was seen during the lock');
  check('tapping a card selects it', tap.selected === true);
  // The tap adds ONE stage to whatever the board had: the earlier sections leave
  // it at two or three depending on whether the mid-term drop's own tap landed,
  // and a fixed count would make this file pass only on a fresh app.
  check('tapping the right star places it, with no drag involved',
    tap.tapped.connected.length === tap.litBefore.length + 1
      && tap.tapped.lit.includes('bellatrix')
      && tap.litBefore.indexOf('bellatrix') === -1
      // A lit stage reveals EVERY edge incident to its star, so the drawn count is
      // not the stage count (3 edges from 2 stages on Orion). The promise is only
      // that the tap grew the sky: no edge was lost, at least one appeared.
      && tap.tapped.edges.split('').filter(c => c === '1').length
        > tap.edgesBefore.split('').filter(c => c === '1').length,
    JSON.stringify({ before: tap.litBefore.length, connected: tap.tapped.connected.length, lit: tap.tapped.lit, edges: `${tap.edgesBefore} -> ${tap.tapped.edges}` }));
  // A correct attempt names the pair it just joined, so the class hears which
  // two halves now hang together (the plain board says only "✓ Ghép chính xác!").
  check('a correct placement names both halves of the pair',
    tap.good.includes('✓ Ghép chính xác') && tap.good.includes(tap.bellatrix),
    JSON.stringify({ said: tap.good, star: tap.bellatrix }));

  // ------------------------------------------------ finish the board -----
  console.log('\n=== completion ===');
  const beforeFinish = JSON.parse(await evaluate(`JSON.stringify({ connected: state.connectionProgress.connectedStageIds.slice(), tray: [...document.querySelectorAll('[data-answer-card]')].map(el => el.dataset.answerCard), matched: state.matchingPlay.matched, wrong: state.matchingPlay.wrong })`));
  const beforeFinishIds = beforeFinish.tray;
  const finish = JSON.parse(await evaluate(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    // The long question's star was never answered above (its card sits in the
    // question row), so the board is finished from what is still in the tray.
    const pending = ${JSON.stringify(beforeFinish.tray)};
    // The board locks for a moment after every attempt (its own feedback), so
    // each placement retries until the progression takes it.
    for (const id of pending) {
      for (let tries = 0; tries < 20; tries += 1) {
        const before = state.connectionProgress.connectedStageIds.length;
        placeOnStar(id, id);
        await sleep(250);
        if (state.connectionProgress.connectedStageIds.length > before) break;
      }
    }
    for (let i = 0; i < 60; i++) { if (document.querySelector('[data-matching-complete]')) break; await sleep(100); }
    const bar = Boolean(document.querySelector('[data-matching-complete]'));
    await sleep(400);
    return JSON.stringify({ bar, snap: JSON.parse(${snapshot()}) });
  })()`));
  check('the finished sky shows the completion bar', finish.bar === true);
  check('every edge of the figure is revealed when the board is complete',
    finish.snap.edges === '1111' && finish.snap.connected.length === 5,
    `edges=${finish.snap.edges} connected=${finish.snap.connected.length}`);

  const resultsScreen = JSON.parse(await evaluate(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    document.getElementById('matchingResultsBtn')?.click();
    for (let i = 0; i < 60; i++) { if (document.querySelector('.result-screen')) break; await sleep(100); }
    // The result's links draw themselves in, exactly as on the board. rAF is
    // throttled in a background window, so this waits on the STATE the reveal
    // leaves behind (every link marked drawn), not on a frame count.
    for (let i = 0; i < 60; i++) {
      const done = threeWorld && threeWorld.kind === 'connection' && threeWorld.graph
        && threeWorld.graph.links.every(link => link.drawn);
      if (done) break;
      await sleep(100);
    }
    const frame = document.querySelector('.result-connection-art[data-connection-stage]');
    const rect = frame ? frame.getBoundingClientRect() : null;
    const points = rect ? updateConnectionStarPoints() : {};
    const inside = Object.keys(points).map(id => {
      const p = points[id];
      return p.x >= rect.left - 2 && p.x <= rect.right + 2 && p.y >= rect.top - 2 && p.y <= rect.bottom + 2;
    });
    const world = threeWorld && threeWorld.kind === 'connection' ? threeWorld.graph : null;
    const xs = Object.values(points).map(p => p.x);
    const ys = Object.values(points).map(p => p.y);
    const centre = rect && xs.length ? [
      Math.round((Math.max(...xs) + Math.min(...xs)) / 2 - (rect.left + rect.width / 2)),
      Math.round((Math.max(...ys) + Math.min(...ys)) / 2 - (rect.top + rect.height / 2))
    ] : null;
    const clear = xs.length && rect ? [
      Math.round(Math.min(...xs) - rect.left), Math.round(rect.right - Math.max(...xs)),
      Math.round(Math.min(...ys) - rect.top), Math.round(rect.bottom - Math.max(...ys))
    ] : null;
    return JSON.stringify({
      onResults: Boolean(document.querySelector('.result-screen')),
      three: Boolean(window.threeGame && window.threeGame.isAvailable && window.threeGame.isAvailable()),
      live: Boolean(world),
      stars: world ? Object.keys(world.nodes).length : document.querySelectorAll('.result-connection-art .constellation-star').length,
      earned: world ? Object.keys(world.nodes).filter(id => world.nodes[id].earned).length : 0,
      drawn: world ? world.links.filter(link => link.drawn).length : 0,
      canvases: document.querySelectorAll('.game-stage > canvas').length,
      frame: rect ? [Math.round(rect.width), Math.round(rect.height)] : null,
      projected: Object.keys(points).length,
      allInside: inside.length > 0 && inside.every(Boolean),
      centre, clear,
      svgStars: document.querySelectorAll('.result-connection-art .constellation-star').length,
      text: (document.querySelector('.result-connection') || {}).textContent || ''
    });
  })()`));
  // #175: the complaint was "phần xem kết quả nên cho xem phần kết quả 3D". The
  // result is the sky the class lit, drawn by the same WebGL world the board used
  // — not a picture redrawn from the template.
  if (resultsScreen.three) {
    check('the results screen plays the 3D sky, not the static picture',
      resultsScreen.onResults === true && resultsScreen.live === true && resultsScreen.canvases === 1,
      `live=${resultsScreen.live} canvas=${resultsScreen.canvases}`);
    check('the results sky has the stars and edges the class earned',
      resultsScreen.stars === 5 && resultsScreen.earned === 5 && resultsScreen.drawn === 4,
      JSON.stringify({ stars: resultsScreen.stars, earned: resultsScreen.earned, drawn: resultsScreen.drawn }));
    check('the picture is framed INSIDE the result hero, not the old play frame',
      resultsScreen.allInside === true && resultsScreen.projected === 5 && resultsScreen.frame[0] > 100 && resultsScreen.frame[1] > 100,
      `frame=${JSON.stringify(resultsScreen.frame)} inside=${resultsScreen.allInside}`);
    check('the sky sits in the middle of the hero too (#177)',
      Math.abs(resultsScreen.centre[0]) <= 14 && Math.abs(resultsScreen.centre[1]) <= 14
        && resultsScreen.clear.every(n => n >= 24),
      `off=${JSON.stringify(resultsScreen.centre)} clear=${JSON.stringify(resultsScreen.clear)}`);
    check('no static picture is painted under the live sky', resultsScreen.svgStars === 0, `svgStars=${resultsScreen.svgStars}`);
  } else {
    check('without WebGL the results screen keeps the static sky',
      resultsScreen.onResults === true && resultsScreen.stars === 5, `stars=${resultsScreen.stars}`);
  }
  check('the results text counts the stars', resultsScreen.text.includes('5/5 sao sáng'), resultsScreen.text);

  // --------------------------------------------- leaving the results ------
  // The result mounts its own world, so both exits have to take it down again: a
  // stage left mounted keeps a renderer, a rAF loop and a resize listener alive on
  // a screen nobody is looking at.
  console.log('\n=== leaving the 3D result ===');
  const leaveResults = JSON.parse(await evaluate(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    document.getElementById('replayBtn').click();
    for (let i = 0; i < 60; i++) { if (document.querySelector('[data-constellation-scene]')) break; await sleep(100); }
    await sleep(300);
    const replay = {
      board: Boolean(document.querySelector('[data-constellation-scene]')),
      result: Boolean(document.querySelector('.result-screen')),
      live: threeWorld && threeWorld.kind === 'connection',
      earned: threeWorld && threeWorld.graph ? Object.keys(threeWorld.graph.nodes).filter(id => threeWorld.graph.nodes[id].earned).length : -1,
      canvases: document.querySelectorAll('.game-stage > canvas').length
    };
    placeOnStar('alnilam', 'alnilam');
    await sleep(700);
    const litAfterReplay = state.connectionProgress.connectedStageIds.length;
    document.querySelector('[data-play-close]').click();
    await sleep(400);
    return JSON.stringify({
      replay,
      litAfterReplay,
      closed: {
        handle: threeStageHandle === null,
        world: threeWorld === null,
        canvases: document.querySelectorAll('#playBody canvas').length,
        fly: document.querySelectorAll('.constellation-fly').length
      }
    });
  })()`));
  check('“Chơi lại” puts the playable board back with an unlit sky',
    leaveResults.replay.board === true && leaveResults.replay.result === false
      && leaveResults.replay.live === true && leaveResults.replay.earned === 0 && leaveResults.replay.canvases === 1,
    JSON.stringify(leaveResults.replay));
  check('the replayed board still plays', leaveResults.litAfterReplay === 1, `connected=${leaveResults.litAfterReplay}`);
  check('closing the game disposes the result world',
    leaveResults.closed.handle === true && leaveResults.closed.world === true && leaveResults.closed.canvases === 0,
    JSON.stringify(leaveResults.closed));

  // ------------------------------------------------ a long question ------
  console.log('\n=== a long question: readable card, one pointer ===');
  const longGame = matchingGame('ui-const-long', 5, 'connection', { template: 'orion', starIds: ORION.slice(0, 5), longFirst: true });
  await evaluate(OPEN(longGame));
  await evaluate('new Promise(r => setTimeout(r, 300))');
  const longLayout = JSON.parse(await evaluate(`(() => {
    const scene = document.querySelector('[data-constellation-scene]').getBoundingClientRect();
    const card = document.querySelector('[data-question-card]');
    const rect = card ? card.getBoundingClientRect() : null;
    const pointer = document.querySelector('[data-constellation-pointers] path');
    const style = pointer ? getComputedStyle(pointer) : null;
    const trayCard = document.querySelector('[data-answer-card]');
    return JSON.stringify({
      scene: [Math.round(scene.left), Math.round(scene.top), Math.round(scene.right), Math.round(scene.bottom)],
      card: rect ? [Math.round(rect.left), Math.round(rect.top), Math.round(rect.width), Math.round(rect.height)] : null,
      text: card ? card.textContent.trim() : '',
      fontSize: card ? parseFloat(getComputedStyle(card).fontSize) : 0,
      trayFont: trayCard ? parseFloat(getComputedStyle(trayCard).fontSize) : 0,
      cardFont: card ? parseFloat(getComputedStyle(card).fontSize) : 0,
      pointers: document.querySelectorAll('[data-constellation-pointers] path').length,
      pointerDash: style ? style.strokeDasharray : '',
      pointerInsideScene: rect ? rect.top < scene.bottom : null,
      answers: [...document.querySelectorAll('[data-answer-card]')].map(el => el.textContent.trim())
    });
  })()`));
  check('the long question is a full-size HTML card outside the scene',
    longLayout.text.length > 24 && longLayout.fontSize >= 15 && longLayout.pointerInsideScene === false,
    `font=${longLayout.fontSize}px outside=${longLayout.pointerInsideScene === false}`);
  // #219: the tray is what a hand reaches for from the back row, so its cards are
  // the largest text on the board.
  check('the tray cards are the board\'s largest text (16 px or more)',
    longLayout.trayFont >= 16, `tray=${longLayout.trayFont}px card=${longLayout.cardFont}px`);
  check('exactly one short pointer ties the long card to its star',
    longLayout.pointers === 1, `pointers=${longLayout.pointers}`);
  // "Dashed" is the browser's normalised `4px, 5px`; what matters is that the
  // stroke has a dash pattern at all (a constellation edge is solid).
  check('the pointer is styled as a pointer, not a constellation edge',
    Boolean(longLayout.pointerDash) && longLayout.pointerDash !== 'none',
    `dash=${longLayout.pointerDash}`);
  check('every answer card carries its real text, including long ones',
    longLayout.answers.length === 5 && longLayout.answers.every(text => text.length > 0),
    JSON.stringify(longLayout.answers.map(text => text.length)));

  // ---------------------------------------- a term stays on its star ------
  // The complaint #174 answers: "khi chữ khá dài thì phần chữ này bị cách xa ngôi
  // sao". A 22-character Vietnamese term is a term, and the pre-#174 estimate
  // (card ≤ 150 px) exiled it to the row under the picture.
  console.log('\n=== a mid-length term stays on its star ===');
  const midGame = matchingGame('ui-const-mid', 5, 'connection', { template: 'orion', starIds: ORION.slice(0, 5), midFirst: true });
  await evaluate(OPEN(midGame));
  await evaluate('new Promise(r => setTimeout(r, 300))');
  const mid = JSON.parse(await evaluate(`(() => {
    const label = document.querySelector('[data-star-card="alnilam"]');
    const r = label ? label.getBoundingClientRect() : null;
    const p = updateConnectionStarPoints().alnilam;
    return JSON.stringify({
      sceneCards: [...document.querySelectorAll('[data-star-card]')].map(el => el.dataset.starCard),
      rowCards: [...document.querySelectorAll('[data-question-card]')].map(el => el.dataset.questionCard),
      marks: document.querySelectorAll('[data-star-mark]').length,
      text: label ? label.textContent.trim() : '',
      fontSize: label ? parseFloat(getComputedStyle(label).fontSize) : 0,
      dx: (r && p) ? Math.round(r.left + r.width / 2 - p.x) : null
    });
  })()`));
  check('a 22-character term hangs on its star instead of being exiled to the row',
    mid.text === MID_LABEL && mid.sceneCards.indexOf('alnilam') !== -1 && mid.rowCards.length === 0 && mid.marks === 0,
    JSON.stringify({ text: mid.text, scene: mid.sceneCards, row: mid.rowCards, marks: mid.marks }));
  // #219 raised the label from 13 px to 15 px: 13 px on a 1366x768 projector is
  // the back row's blur line, and this is the text the class must READ to play.
  check('the term is centred on its star and keeps the 15 px reading floor',
    mid.dx === 0 && mid.fontSize >= 15, `dx=${mid.dx} font=${mid.fontSize}px`);

  // --------------------------------- three long questions in one band ------
  // The geometry that no placement can win: three 370 px sentences cannot all
  // centre on stars that sit 4 % apart, so the band gives up centring and the
  // NUMBER carries the pairing instead.
  console.log('\n=== three long questions: the band keeps the sky in order ===');
  const threeLong = JSON.parse(matchingGame('ui-const-3long', 5, 'connection', { template: 'orion', starIds: ORION.slice(0, 5) }));
  threeLong.matchingGame.pairs.slice(0, 3).forEach((pair, n) => { pair.left = LONG_LABELS[n]; });
  await evaluate(OPEN(JSON.stringify(threeLong)));
  await evaluate('new Promise(r => setTimeout(r, 300))');
  const band = JSON.parse(await evaluate(`(() => {
    const row = document.querySelector('[data-constellation-question-row]').getBoundingClientRect();
    const points = updateConnectionStarPoints();
    const cards = [...document.querySelectorAll('[data-question-card]')].map(el => {
      const r = el.getBoundingClientRect();
      const p = points[el.dataset.questionCard];
      return { id: el.dataset.questionCard, start: parseInt(el.style.gridColumn, 10), gridRow: parseInt(el.style.gridRow, 10),
        dx: p ? Math.round(r.left + r.width / 2 - p.x) : null,
        rect: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)],
        no: (el.querySelector('.constellation-card-index') || {}).textContent };
    });
    let overlap = false;
    for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
      const a = cards[i].rect, b = cards[j].rect;
      if (a[2] > b[0] + 1 && b[2] > a[0] + 1 && a[3] > b[1] + 1 && b[3] > a[1] + 1) overlap = true;
    }
    const paired = cards.map(c => {
      const mark = document.querySelector('[data-star-mark="' + c.id + '"]');
      return Boolean(mark && c.no && mark.textContent.trim() === String(c.no).trim());
    });
    return JSON.stringify({ column: row.width / 12, cards, overlap, paired,
      marks: [...document.querySelectorAll('[data-star-mark]')].map(el => el.dataset.starMark),
      rowH: Math.round(row.height) });
  })()`));
  check('three long questions give three row cards and three star numbers',
    band.cards.length === 3 && band.marks.length === 3, JSON.stringify({ cards: band.cards.length, marks: band.marks }));
  check('every long card carries the number its own star wears',
    band.paired.every(Boolean), JSON.stringify(band.cards.map(c => [c.id, c.no])));
  check('the band reads left to right, the way the stars do',
    band.cards.every((c, i) => Number.isFinite(c.start) && (i === 0 || band.cards[i - 1].start <= c.start)),
    JSON.stringify(band.cards.map(c => [c.id, c.start, c.gridRow])));
  check('no two long cards sit on top of each other', band.overlap === false, JSON.stringify(band.cards.map(c => c.rect)));
  check('the leftmost long card still centres on its star',
    Math.abs(band.cards[0].dx) <= band.column + 12,
    `dx=${band.cards[0].dx} column=${Math.round(band.column)}`);

  // ------------------------------ a joined pair keeps BOTH halves ---------
  // The complaint #178 answers: "khi kéo phần A và phần B thì chữ phần B bị mất,
  // thay vào đó là chữ phần A". Measured before the change: after a correct drop
  // the whole DOM held no trace of the dragged half (`vế B anywhere after:
  // false`) — the star carried only its destination side and the tray card was
  // gone, so the class could not read what it had just matched. The answer is now
  // the SECOND LINE of the same card, and it appears only once the pair is joined
  // (a board that printed both halves would hand out its answers).
  console.log('\n=== a joined pair shows both halves ===');
  const HALF_A = 'Khái niệm 1';
  const HALF_B = 'Định nghĩa 1';
  await evaluate(OPEN(matchingGame('ui-const-pair', 5, 'connection', { template: 'orion', starIds: ORION.slice(0, 5) })));
  const pairJoin = JSON.parse(await evaluate(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const card = document.querySelector('[data-star-card="alnilam"]');
    const before = { text: card.textContent.trim(), aria: card.getAttribute('aria-label') };
    const fitBefore = threeWorld.graph.getFitScale();
    const frameBefore = document.querySelector('[data-constellation-scene]').getBoundingClientRect().height;
    // The board locks for a moment after every attempt, so the placement retries
    // until the progression really takes it (the same guard the finish section uses).
    for (let tries = 0; tries < 20; tries += 1) {
      const n = state.connectionProgress.connectedStageIds.length;
      placeOnStar('alnilam', 'alnilam');
      await sleep(250);
      if (state.connectionProgress.connectedStageIds.length > n) break;
    }
    await sleep(500);
    const after = document.querySelector('[data-star-card="alnilam"]');
    const line = after.querySelector('.constellation-card-answer');
    const style = line ? getComputedStyle(line) : null;
    const rect = after.getBoundingClientRect();
    const p = updateConnectionStarPoints().alnilam;
    const view = buildConnectionView();
    const lit = view.nodes.find(node => node.id === 'alnilam');
    const dim = view.nodes.find(node => node.id === 'alnitak');
    return JSON.stringify({
      before,
      fit: [Math.round(fitBefore * 1000) / 1000, Math.round(threeWorld.graph.getFitScale() * 1000) / 1000],
      scene: [Math.round(frameBefore), Math.round(document.querySelector('[data-constellation-scene]').getBoundingClientRect().height)],
      text: after.textContent.trim(),
      aria: after.getAttribute('aria-label'),
      litClass: after.classList.contains('is-lit'),
      lineText: line ? line.textContent.trim() : '',
      lineDisplay: style ? style.display : '',
      lineFont: style ? parseFloat(style.fontSize) : 0,
      dx: p ? Math.round(rect.left + rect.width / 2 - p.x) : null,
      inside: Boolean(document.querySelector('[data-constellation-scene]').contains(after)),
      tray: [...document.querySelectorAll('[data-answer-card]')].map(el => el.textContent.trim()),
      litAnswer: lit.answerText, litLabel: lit.label, litVisible: lit.visible,
      dimAnswer: dim.answerText, dimVisible: dim.visible,
      doneLabels: view.doneLabels,
      svg: constellationSvg(connectionTemplateFor(state.currentGame), 5, state.connectionProgress, {
        pairText: id => constellationStarCaptions(state.currentGame, connectionTemplateFor(state.currentGame), id, state.connectionProgress).label,
        pairAnswerText: id => constellationStarCaptions(state.currentGame, connectionTemplateFor(state.currentGame), id, state.connectionProgress).answer
      })
    });
  })()`));
  check('an unjoined star does not give the answer away',
    pairJoin.before.text.includes(HALF_A) && !pairJoin.before.text.includes(HALF_B)
      && !pairJoin.before.aria.includes(HALF_B),
    JSON.stringify(pairJoin.before));
  check('the joined star shows BOTH halves in its own card',
    pairJoin.litClass === true && pairJoin.text.includes(HALF_A) && pairJoin.text.includes(HALF_B),
    JSON.stringify({ text: pairJoin.text }));
  check('the answer half is a line of its own and keeps the 15 px reading floor',
    pairJoin.lineText === HALF_B && pairJoin.lineDisplay === 'block' && pairJoin.lineFont >= 15,
    `display=${pairJoin.lineDisplay} font=${pairJoin.lineFont}px line="${pairJoin.lineText}"`);
  check('the two-line card is still centred on its star',
    pairJoin.dx === 0 && pairJoin.inside === true, `dx=${pairJoin.dx}`);
  // The scale is what the centring above depends on. Answering used to resize the
  // sky: the feedback line appeared in the same flex column as the scene, took
  // 55 px out of it, and `fitConnectionGraph` re-fit the whole picture 11 %
  // smaller — every star slid out from under its label (measured dx −36…−45 px).
  check('answering does not resize the sky', pairJoin.fit[0] === pairJoin.fit[1]
    && pairJoin.scene[0] === pairJoin.scene[1],
    `fit ${pairJoin.fit[0]} → ${pairJoin.fit[1]}, scene ${pairJoin.scene[0]} → ${pairJoin.scene[1]} px`);
  check('the card that was dragged is gone from the tray',
    pairJoin.tray.includes(HALF_B) === false, JSON.stringify(pairJoin.tray));
  check('a screen reader gets the whole pair, not one half',
    pairJoin.aria.includes(HALF_A) && pairJoin.aria.includes(HALF_B)
      && pairJoin.aria.includes('đã ghép'),
    pairJoin.aria);
  // The projector draws its own SVG from this data (features/presentation.ts) and
  // has no HTML card, so both halves have to travel in the view — and only for a
  // star the class actually lit.
  check('the projector view carries both halves of the pair',
    pairJoin.litLabel === HALF_A && pairJoin.litAnswer === HALF_B && pairJoin.litVisible === true,
    JSON.stringify({ label: pairJoin.litLabel, answer: pairJoin.litAnswer, visible: pairJoin.litVisible }));
  check('the projector\'s "Đã ghép" line reads destination → answer',
    pairJoin.doneLabels.length === 1 && pairJoin.doneLabels[0] === `${HALF_A} → ${HALF_B}`,
    JSON.stringify(pairJoin.doneLabels));
  check('the static sky draws the joined pair as two lines, answered stars only',
    (pairJoin.svg.match(/constellation-svg-answer/g) || []).length === 1
      && pairJoin.svg.includes(`>${HALF_B}<`) && pairJoin.svg.includes(`>${HALF_A}<`),
    JSON.stringify({ lines: (pairJoin.svg.match(/constellation-svg-answer/g) || []).length }));
  check('a star nobody has answered yet keeps one line on the static sky',
    pairJoin.dimVisible === false && pairJoin.svg.includes('>Định nghĩa 2<') === false,
    JSON.stringify({ dimVisible: pairJoin.dimVisible }));

  // ------------------------------------------------ classroom sizes ------
  console.log('\n=== classroom projection ===');
  for (const [width, height] of [[1920, 1080], [1280, 720]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }).catch(() => {});
    await evaluate(`(async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      window.dispatchEvent(new Event('resize'));
      await sleep(300);
      return true;
    })()`);
    const sized = JSON.parse(await evaluate(`(() => {
      const stage = document.querySelector('.game-stage').getBoundingClientRect();
      const scene = document.querySelector('[data-constellation-scene]').getBoundingClientRect();
      const tray = document.querySelector('[data-constellation-tray]').getBoundingClientRect();
      const points = updateConnectionStarPoints();
      const labels = [...document.querySelectorAll('[data-star-card]')].map(el => {
        const r = el.getBoundingClientRect();
        const p = points[el.dataset.starCard];
        const foot = (el.dataset.side === 'below' ? r.top - 15 : r.bottom + 15);
        return { id: el.dataset.starCard, dx: p ? Math.round(r.left + r.width / 2 - p.x) : null,
          gap: p ? Math.round(Math.abs(foot - p.y)) : null,
          covers: p ? (p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom) : null,
          inside: r.left >= scene.left - 2 && r.right <= scene.right + 2,
          font: parseFloat(getComputedStyle(el).fontSize) };
      });
      const trayCard = document.querySelector('[data-answer-card]');
      const feedback = document.getElementById('matchFeedback');
      const fb = feedback ? feedback.getBoundingClientRect() : null;
      return JSON.stringify({ sceneShare: scene.height / stage.height, trayBelow: tray.top >= scene.bottom - 1, labels, wide: scene.width / scene.height,
        trayFont: trayCard ? parseFloat(getComputedStyle(trayCard).fontSize) : 0,
        hudFont: parseFloat(getComputedStyle(document.querySelector('[data-constellation-count]')).fontSize),
        fb: fb ? { h: Math.round(fb.height), scroll: feedback.scrollHeight } : null });
    })()`));
    check(`the scene keeps its share at ${width}x${height}`, sized.sceneShare >= 0.45,
      `${Math.round(sized.sceneShare * 100)}% (scene aspect ${sized.wide.toFixed(2)})`);
    check(`the tray stays under the scene at ${width}x${height}`, sized.trayBelow === true);
    // #219: the play board's own reading floors hold at every projector size. The
    // settled layout keeps the 15 px label and the 16 px tray card even at 1280x720
    // (a slightly smaller HUD is the only allowance), and the reserved feedback box
    // still holds its text without clipping.
    check(`no board text drops below 15 px at ${width}x${height}`,
      sized.labels.every(label => label.font >= 15) && sized.trayFont >= 16 && sized.hudFont >= 12,
      JSON.stringify({ labels: sized.labels.map(l => [l.id, l.font]), tray: sized.trayFont, hud: sized.hudFont }));
    check(`the feedback box holds its text at ${width}x${height}`,
      Boolean(sized.fb) && sized.fb.scroll <= sized.fb.h,
      JSON.stringify(sized.fb));
    // The re-frame pass (#174) is what this proves at a second window size: the
    // anchors are percentages of the scene's own box, so a label that was laid
    // out before the question row took its height drifts by tens of pixels.
    check(`the labels hang centred on their stars at ${width}x${height}`,
      sized.labels.every(label => Math.abs(label.dx) <= 2 && label.gap <= 4 && label.inside),
      JSON.stringify(sized.labels.filter(label => Math.abs(label.dx) > 2 || label.gap > 4 || !label.inside)));
    check(`no label covers its star at ${width}x${height}`,
      sized.labels.every(label => label.covers === false),
      JSON.stringify(sized.labels.filter(label => label.covers !== false).map(label => label.id)));
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false }).catch(() => {});

  // ------------------------------------------------ the framing of #177 ----
  console.log('\n=== the figure is centred in its frame, not the viewbox ===');
  // `fitConnectionGraph` used to fit and centre the VIEWBOX the template is drawn
  // into, so every board carried its template's own margins: the ten stars of the
  // Great Bear fill 900×430 of a 1000×620 box and sit 55 units above its centre.
  // Measured before the change (1366×768): Orion −14 px, the Great Bear −43, a
  // five-star Orion −59, and a two-star Lyra 164 px right and 113 px up.
  const FRAMING = `(() => {
    const frame = document.querySelector('[data-constellation-stage]').getBoundingClientRect();
    const stage = document.querySelector('.game-stage').getBoundingClientRect();
    const handle = threeStageHandle;
    const visibleHeight = 2 * Math.tan(handle.camera.fov * Math.PI / 360) * CONNECTION_CAMERA_Z;
    const visibleWidth = visibleHeight * (stage.width / stage.height);
    const boxFit = Math.min((frame.width / stage.width) * visibleWidth / CONNECTION_WORLD.width,
      (frame.height / stage.height) * visibleHeight / CONNECTION_WORLD.height);
    const points = updateConnectionStarPoints();
    const xs = Object.values(points).map(p => p.x);
    const ys = Object.values(points).map(p => p.y);
    const fit = threeWorld.graph.getFitScale();
    return JSON.stringify({
      stars: Object.keys(points).length,
      off: [Math.round((Math.max(...xs) + Math.min(...xs)) / 2 - (frame.left + frame.width / 2)),
        Math.round((Math.max(...ys) + Math.min(...ys)) / 2 - (frame.top + frame.height / 2))],
      fill: Math.round(Math.max((Math.max(...xs) - Math.min(...xs)) / frame.width,
        (Math.max(...ys) - Math.min(...ys)) / frame.height) * 100) / 100,
      clear: [Math.round(Math.min(...xs) - frame.left), Math.round(frame.right - Math.max(...xs)),
        Math.round(Math.min(...ys) - frame.top), Math.round(frame.bottom - Math.max(...ys))],
      enlarge: Math.round(fit / boxFit * 100) / 100,
      hang: document.querySelectorAll('[data-star-card]').length,
      row: document.querySelectorAll('[data-question-card]').length,
      marks: document.querySelectorAll('[data-star-mark]').length
    });
  })()`;
  await evaluate(OPEN(matchingGame('ui-frame-10', 10, 'connection', { starIds: ORION })));
  const ten = JSON.parse(await evaluate(FRAMING));
  check('a full board is centred in its frame (±14 px, was −14 to −113)',
    ten.stars === 10 && Math.abs(ten.off[0]) <= 14 && Math.abs(ten.off[1]) <= 14, JSON.stringify(ten.off));
  check('the centred picture still fills its frame', ten.fill >= 0.75, JSON.stringify({ fill: ten.fill }));
  // #219 measures this at 239 px of scene at 1366×768 — the same number the board
  // gave before the type grew, because the status line moved INTO the reserved
  // feedback lane. The check states the lane it GUARANTEES (10 px) and the mark
  // clearance the drawing must keep, not the old figure: a taller board pushes the
  // stars further from the edges, a shorter one is a layout regression.
  check('no star is pushed against an edge, so its label keeps a lane',
    ten.clear.every(n => n >= 10), JSON.stringify(ten.clear));
  // Ten stars on a 260 px-tall scene cannot all wear a card: a 31 px card needs
  // ~47 px of empty lane above its star. The promise is that each star is LABELLED
  // exactly once — on the star when there is a lane, in the numbered row when there
  // is not — and that the two counts add up to the whole board.
  check('every star of a full board carries its label somewhere (on it, or in the row)',
    ten.hang + ten.row === 10 && ten.row === ten.marks,
    `hang=${ten.hang} row=${ten.row} marks=${ten.marks} of ${ten.stars}`);

  // A five-star board is the common classroom case and was the worst off-centre
  // fragment: Orion's first five stars sit 80 viewbox units above the box centre.
  await evaluate(OPEN(matchingGame('ui-frame-5', 5, 'connection', { starIds: ORION.slice(0, 5) })));
  const five = JSON.parse(await evaluate(FRAMING));
  check('a five-star fragment is centred too (was −59 px)',
    Math.abs(five.off[0]) <= 14 && Math.abs(five.off[1]) <= 14, JSON.stringify(five.off));
  check('the fragment is drawn bigger, up to the cap', five.enlarge > 1.05 && five.enlarge <= 1.41,
    `enlarge=${five.enlarge}x the box fit`);

  // The cap is what protects the smallest board: two stars of Lyra are 327 px apart
  // in a 1200 px frame, and fitting THAT box would fill the room with two circles.
  const LYRA = ['vega', 'sulafat', 'sheliak', 'delta2', 'zeta1', 'aladfar', 'eta', 'epsilon', 'theta', 'kappa'];
  await evaluate(OPEN(matchingGame('ui-frame-2', 2, 'connection', { template: 'lyra', starIds: LYRA.slice(0, 2) })));
  const two = JSON.parse(await evaluate(FRAMING));
  check('a two-star board is centred (was 164 px right, 113 px up)',
    Math.abs(two.off[0]) <= 14 && Math.abs(two.off[1]) <= 14, JSON.stringify(two.off));
  check('a two-star board is never blown up past the cap', two.enlarge <= 1.41,
    `enlarge=${two.enlarge}x the box fit`);

  // ------------------------------------------------ compatibility -------
  console.log('\n=== an old picture id still plays ===');
  const legacy = JSON.parse(matchingGame('ui-legacy', 5, 'connection', { template: 'solar-system', starIds: ORION.slice(0, 5) }));
  legacy.matchingGame.connectionTemplate = 'solar-system';
  await evaluate(OPEN(JSON.stringify(legacy)));
  const legacyOpened = JSON.parse(await evaluate(`JSON.stringify({
    saved: state.currentGame.matchingGame.connectionTemplate,
    resolved: constellationResolve(state.currentGame.matchingGame.connectionTemplate).id,
    answers: document.querySelectorAll('[data-answer-card]').length
  })`));
  check('an old game opens on the constellation its id maps to and keeps its id',
    legacyOpened.resolved === 'orion' && legacyOpened.saved === 'solar-system' && legacyOpened.answers === 5,
    JSON.stringify(legacyOpened));

  // ------------------------------------------------ other styles --------
  console.log('\n=== the other matching styles are untouched ===');
  await evaluate(OPEN(matchingGame('ui-columns', 3, 'columns')));
  const columns = JSON.parse(await evaluate(`JSON.stringify({ board: Boolean(document.querySelector('.matching-board')), scene: Boolean(document.querySelector('[data-constellation-scene]')), cards: document.querySelectorAll('[data-match-side]').length })`));
  check('the two-column board still renders and has no constellation scene',
    columns.board === true && columns.scene === false && columns.cards > 0, JSON.stringify(columns));
  await evaluate(OPEN(matchingGame('ui-memory', 3, 'memory')));
  const memory = JSON.parse(await evaluate(`JSON.stringify({ cards: document.querySelectorAll('.memory-card').length, scene: Boolean(document.querySelector('[data-constellation-scene]')) })`));
  check('the memory board still renders and has no constellation scene',
    memory.cards === 6 && memory.scene === false, JSON.stringify(memory));

  const summary = { passed: results.filter(r => r.ok).length, total: results.length };
  summary.failed = summary.total - summary.passed;
  console.log(`\n${summary.passed}/${summary.total} checks passed`);
  process.exit(summary.failed === 0 ? 0 : 1);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
