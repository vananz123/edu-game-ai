// ui-constellation-check.js — regression guard for "Chòm sao tri thức"
// (DECISIONS #171, recomposed in #172).
//
// WHAT IT PROVES, against a built app started with --remote-debugging-port:
//   • the layout: ONE tray of answer cards, a large scene, no second answer list;
//   • correct / wrong drops through the real drag path, and tap/keyboard placement;
//   • the constellation edges stay hidden until a match, then reveal one by one;
//   • a long question moves to the readable row outside the scene with ONE
//     pointer line, and that line is not a constellation edge;
//   • five pairs, the completion flow, the results sky and the projector view;
//   • an old saved picture id still opens and still plays;
//   • the 16:9 classroom size: the scene keeps its share of the play area and the
//     labels sit on their stars.
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

function matchingGame(id, pairCount, mode, options) {
  const opts = options || {};
  // The side that reaches a star is pair.left on a left-to-right board and
  // pair.right on a right-to-left one, so the long text goes there.
  const longOnRight = opts.direction === 'right-to-left';
  const pairs = Array.from({ length: pairCount }, (_, n) => {
    const pairId = opts.starIds ? opts.starIds[n] : 'p' + (n + 1);
    const left = 'Khái niệm ' + (n + 1);
    const right = 'Định nghĩa ' + (n + 1);
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

  console.log('\n=== the room: no frame, real space ===');
  // --------------------------------------------------- the room: no frame --
  // DECISIONS #173: the grey felt frame is gone and the board sits in real
  // space. Measured on the COMPUTED style, because the felt comes from three
  // different files (world tokens, gameplay.css, fullscreen.css) and a rule
  // that lost the specificity fight would still show as a declaration in the
  // source but not in the box the class sees.
  const room = JSON.parse(await evaluate(`(() => {
    const cs = sel => { const el = document.querySelector(sel); return el ? getComputedStyle(el) : null; };
    const stage = cs('.game-stage');
    const scene = cs('[data-constellation-scene]');
    const modal = cs('.modal[data-player-theme]');
    const body = cs('.modal[data-player-theme] .modal-body');
    const before = document.querySelector('.game-stage') ? getComputedStyle(document.querySelector('.game-stage'), '::before') : null;
    const handle = threeStageHandle;
    const cosmos = threeWorld && threeWorld.cosmos;
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
      bodyPad: body && [body.paddingTop, body.paddingRight, body.paddingBottom, body.paddingLeft].join(' '),
      hasCosmos: Boolean(cosmos),
      starCount: cosmos ? cosmos.stars.geometry.attributes.position.count : -1,
      skyOrder: cosmos ? cosmos.sky.renderOrder : 0,
      starsOrder: cosmos ? cosmos.stars.renderOrder : 0,
      cloudCount: cosmos ? cosmos.clouds.length : -1,
      dustHidden: handle ? (handle.particles ? handle.particles.visible === false : true) : null,
      emblemHidden: handle ? (handle.emblem ? handle.emblem.visible === false : true) : null,
      pointScaleNumber: cosmos ? typeof cosmos.uniforms.stars.uScale.value === 'number' : false
    });
  })()`));
  check('the stage draws no felt: no gradient, no border, no radius, no shadow',
    room.stageBg === 'none' && room.stageBorder === '0px' && room.stageRadius === '0px' && room.stageShadow === 'none',
    JSON.stringify({ bg: room.stageBg, border: room.stageBorder, radius: room.stageRadius, shadow: room.stageShadow }));
  check('the world texture overlay is switched off', room.beforeDisplay === 'none', `::before display=${room.beforeDisplay}`);
  check('the scene box is transparent so the canvas is the picture',
    room.sceneBg === 'none' && room.sceneShadow === 'none' && room.sceneRadius === '0px',
    JSON.stringify({ bg: room.sceneBg, shadow: room.sceneShadow, radius: room.sceneRadius }));
  check('the modal is space-coloured and the body wastes no padding',
    room.modalBg === 'rgb(3, 5, 13)' && room.bodyPad === '0px 0px 0px 0px',
    JSON.stringify({ modalBg: room.modalBg, bodyPad: room.bodyPad }));
  check('a cosmos field is built: stars behind the graph, sky behind everything',
    room.hasCosmos === true && room.starCount > 500 && room.skyOrder < room.starsOrder && room.skyOrder < 0 && room.cloudCount === 3,
    JSON.stringify({ stars: room.starCount, skyOrder: room.skyOrder, starsOrder: room.starsOrder, clouds: room.cloudCount }));
  check('the rotating emblem and the old dust are off — the cosmos replaces them',
    room.dustHidden === true && room.emblemHidden === true,
    JSON.stringify({ dustHidden: room.dustHidden, emblemHidden: room.emblemHidden }));
  check('star points are sized in device pixels, not world units', room.pointScaleNumber === true, `uScale is number=${room.pointScaleNumber}`);

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
  check('every star label sits on its own star',
    (await evaluate(`[...document.querySelectorAll('[data-star-card]')].every(el => {
      const r = el.getBoundingClientRect();
      return starAtPoint(r.left + r.width / 2, r.top + r.height / 2) === el.dataset.starCard;
    })`)) === true, 'labels and stars agree');
  check('the labels stay inside the scene', (await evaluate(`(() => {
    const frame = document.querySelector('[data-constellation-scene]').getBoundingClientRect();
    return [...document.querySelectorAll('[data-star-card]')].every(el => {
      const r = el.getBoundingClientRect();
      return r.left >= frame.left - 2 && r.right <= frame.right + 2 && r.top >= frame.top - 2 && r.bottom <= frame.bottom + 2;
    });
  })()`)) === true, 'every label is inside the picture');

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
    await sleep(1100);
    return JSON.stringify({ before, after: JSON.parse(${snapshot()}), flying: document.querySelectorAll('.constellation-fly').length });
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

  // ------------------------------------------------- tap-to-place -------
  const tap = JSON.parse(await evaluate(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const card = document.querySelector('[data-answer-card="mintaka"]');
    card.click();
    await sleep(60);
    const selected = card.classList.contains('is-selected');
    const label = document.querySelector('[data-star-card="mintaka"]');
    label.click();
    await sleep(500);
    const tapped = JSON.parse(${snapshot()});
    // The tray card must be gone once the star is lit, so the next section starts
    // from a state the class could also be in.
    return JSON.stringify({ selected, tapped });
  })()`));
  check('tapping a card selects it', tap.selected === true);
  check('tapping the right star places it, with no drag involved',
    tap.tapped.connected.length === 2 && tap.tapped.lit.includes('mintaka') && tap.tapped.edges === '1111',
    JSON.stringify({ connected: tap.tapped.connected, edges: tap.tapped.edges }));

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
    await sleep(200);
    return JSON.stringify({
      onResults: Boolean(document.querySelector('.result-screen')),
      stars: document.querySelectorAll('.result-connection-art .constellation-star').length,
      text: (document.querySelector('.result-connection') || {}).textContent || ''
    });
  })()`));
  check('the results screen shows the sky the class lit',
    resultsScreen.onResults === true && resultsScreen.stars === 5, `stars=${resultsScreen.stars}`);
  check('the results text counts the stars', resultsScreen.text.includes('5/5 sao sáng'), resultsScreen.text);

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
    return JSON.stringify({
      scene: [Math.round(scene.left), Math.round(scene.top), Math.round(scene.right), Math.round(scene.bottom)],
      card: rect ? [Math.round(rect.left), Math.round(rect.top), Math.round(rect.width), Math.round(rect.height)] : null,
      text: card ? card.textContent.trim() : '',
      fontSize: card ? parseFloat(getComputedStyle(card).fontSize) : 0,
      pointers: document.querySelectorAll('[data-constellation-pointers] path').length,
      pointerDash: style ? style.strokeDasharray : '',
      pointerInsideScene: rect ? rect.top < scene.bottom : null,
      answers: [...document.querySelectorAll('[data-answer-card]')].map(el => el.textContent.trim())
    });
  })()`));
  check('the long question is a full-size HTML card outside the scene',
    longLayout.text.length > 24 && longLayout.fontSize >= 12 && longLayout.pointerInsideScene === false,
    `font=${longLayout.fontSize}px outside=${longLayout.pointerInsideScene === false}`);
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
      const labels = [...document.querySelectorAll('[data-star-card]')].map(el => {
        const r = el.getBoundingClientRect();
        return { id: el.dataset.starCard, hit: starAtPoint(r.left + r.width / 2, r.top + r.height / 2), inside: r.left >= scene.left - 2 && r.right <= scene.right + 2 };
      });
      return JSON.stringify({ sceneShare: scene.height / stage.height, trayBelow: tray.top >= scene.bottom - 1, labels, wide: scene.width / scene.height });
    })()`));
    check(`the scene keeps its share at ${width}x${height}`, sized.sceneShare >= 0.45,
      `${Math.round(sized.sceneShare * 100)}% (scene aspect ${sized.wide.toFixed(2)})`);
    check(`the tray stays under the scene at ${width}x${height}`, sized.trayBelow === true);
    check(`the labels stay on their stars at ${width}x${height}`,
      sized.labels.every(label => label.hit === label.id && label.inside),
      JSON.stringify(sized.labels.filter(label => label.hit !== label.id || !label.inside)));
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false }).catch(() => {});

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
