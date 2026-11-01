// ui-connection-mode-check.js — regression guard for Object Connection, the third
// play style of Ghép cặp kiến thức (matching game, DECISIONS #168).
//
// The style lives on `matchingGame.mode` beside columns / memory / categorize.
// The two card columns stay as the INPUT; the play surface swaps the card board
// for a template picture that assembles: every correct pair connects one stage,
// a wrong pair connects nothing, and the picture the class sees at the end is
// exactly what they earned. Scoring stays in game-engine/runtime.ts.
//
// What it proves, against a built app started with --remote-debugging-port:
//   • the seven templates ship, an unknown id falls back, the gallery picks one;
//   • the connection board opens on an empty picture ("0/N kết nối");
//   • a correct pair connects exactly one stage and the SVG draws exactly it;
//   • a wrong pair connects nothing and never removes an earlier stage;
//   • the counter, the hint and the result screen report the ACTUAL progress;
//   • columns / memory / categorize boards are untouched;
//   • "Chơi lại" resets the picture but keeps the style and the template;
//   • a saved game keeps its style and template;
//   • the wizard and the editor offer the style and preselect the saved template.
//
// Run:
//   npm run build
//   npx electron . --remote-debugging-port=9391
//   node tests/ui/ui-connection-mode-check.js 9391
const { check, connect, results } = require('../manual/lib/ui-check-lib');

// Synthetic content only — no real student data (AGENTS.md).
function matchingGame(id, pairCount, mode, template) {
  const pairs = Array.from({ length: pairCount }, (_, n) => ({
    id: 'p' + (n + 1),
    left: 'Hành tinh ' + (n + 1),
    right: 'Đặc điểm ' + (n + 1)
  }));
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
  if (mode === 'connection' && template) matching.connectionTemplate = template;
  return JSON.stringify({
    id,
    title: 'Hệ Mặt Trời',
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

// Opens the game, plays `plan` (each entry is the pair id to click on the LEFT,
// then the matching id on the RIGHT), snapshotting the visible state at every step.
function RUN(gameJson, plan) {
  return `(async () => {
    const plan = ${JSON.stringify(plan)};
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    document.querySelector('[data-play-close]')?.click();
    document.getElementById('modalRoot').innerHTML = '';
    await sleep(200);
    playGame(${gameJson});
    await sleep(800);
    const snap = [];
    const take = (label) => {
      const panel = document.querySelector('[data-connection-panel]');
      const counter = document.querySelector('[data-connection-counter]');
      const hint = document.querySelector('[data-connection-hint]');
      const svg = document.querySelector('[data-connection-stage] .connection-svg');
      const progress = state.connectionProgress;
      const stageIds = progress ? progress.connectedStageIds : [];
      const template = panel ? connectionTemplateFor(state.currentGame) : null;
      const earned = new Set(stageIds);
      const edgesOn = template ? template.stages.filter(s => earned.has(s.id)).flatMap(s => s.edgeIds) : [];
      const drawn = svg ? [...svg.querySelectorAll('path.connection-edge')].map(p => p.dataset.edge) : [];
      const shown = svg ? [...svg.querySelectorAll('g.connection-node')].filter(g => !g.classList.contains('is-hidden')).map(g => g.dataset.node) : [];
      const nodesOn = template ? template.stages.filter(s => earned.has(s.id)).flatMap(s => s.nodeIds) : [];
      const rHero = document.querySelector('.result-connection-hero');
      const rText = document.querySelector('.result-connection');
      const box = svg ? svg.getBoundingClientRect() : null;
      snap.push({
        label,
        hasPanel: Boolean(panel),
        templateId: panel ? panel.dataset.template : null,
        counter: counter ? counter.textContent.replace(/\\s+/g, ' ').trim() : null,
        hint: hint ? hint.textContent.replace(/\\s+/g, ' ').trim() : null,
        connected: stageIds.length,
        total: template ? template.stages.length : 0,
        edgesOn: edgesOn.slice().sort(),
        drawnEdges: drawn.slice().sort(),
        nodesOn: nodesOn.slice().sort(),
        shownNodes: shown.slice().sort(),
        svgBox: box ? { w: Math.round(box.width), h: Math.round(box.height) } : null,
        board: Boolean(document.querySelector('.matching-board')),
        picks: document.querySelectorAll('.connection-pick .match-card').length,
        leftCards: document.querySelectorAll('[data-match-side="left"]').length,
        rightCards: document.querySelectorAll('[data-match-side="right"]').length,
        canvas: Boolean(document.querySelector('.game-stage canvas')),
        wrongCards: document.querySelectorAll('.match-card.wrong').length,
        resultHero: Boolean(rHero),
        resultText: rText ? rText.textContent.replace(/\\s+/g, ' ').trim() : null,
        resultEdges: document.querySelectorAll('.result-connection-art path.connection-edge').length,
        onResults: Boolean(document.querySelector('.result-screen'))
      });
    };
    take('open');
    for (let i = 0; i < plan.length; i++) {
      const [left, right] = plan[i];
      document.querySelector('[data-match-side="left"][data-pair="' + left + '"]')?.click();
      await sleep(120);
      document.querySelector('[data-match-side="right"][data-pair="' + right + '"]')?.click();
      await sleep(1100);
      take('step-' + (i + 1));
    }
    document.getElementById('matchingResultsBtn')?.click();
    await sleep(700);
    take('results');
    return snap;
  })()`;
}

const byLabel = (snaps, label) => snaps.find(s => s.label === label) || {};

(async () => {
  const ctx = await connect();
  const { evaluate, send } = ctx;
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false
  }).catch(() => { });

  await evaluate(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 40; i++) { if (document.querySelector('#modalRoot .setup-fullscreen')) break; await sleep(100); }
    if (typeof closeSetupWizard === 'function') closeSetupWizard('close');
    await sleep(250);
    return true;
  })()`);

  // ------------------------------------------------------ template data ----
  console.log('\n=== template data ===');
  const data = await evaluate(`(() => {
    document.getElementById('probeGallery')?.remove();
    document.body.insertAdjacentHTML('beforeend', '<div id="probeGallery">' + connectionGalleryHtml('bridge', 'probe') + '</div>');
    const out = {
      count: CONNECTION_TEMPLATES.length,
      ids: CONNECTION_TEMPLATE_IDS.slice(),
      stages: CONNECTION_TEMPLATES.map(t => ({ id: t.id, stages: t.stages.length })),
      unknown: connectionResolveTemplate('khong-co').id,
      empty: connectionResolveTemplate(null).id,
      cards: document.querySelectorAll('#probeGallery [data-connection-template]').length,
      checked: document.querySelector('#probeGallery input:checked')?.value || null
    };
    document.getElementById('probeGallery').remove();
    return out;
  })()`);
  check('seven templates ship in the renderer', data.count === 7 && data.ids.length === 7, JSON.stringify(data.ids));
  check('every template has 2..8 stages', data.stages.every(t => t.stages >= 2 && t.stages <= 8), JSON.stringify(data.stages));
  check('an unknown or missing template falls back to the default',
    data.unknown === 'knowledge-network' && data.empty === 'knowledge-network', `${data.unknown}/${data.empty}`);
  check('the gallery renders one card per template with the pick selected',
    data.cards === 7 && data.checked === 'bridge', `cards=${data.cards} checked=${data.checked}`);

  // ------------------- connection board: 6 pairs, solar-system (5 stages) ----
  console.log('\n=== connection board (6 pairs, one wrong, 5-stage picture) ===');
  // Plan: p1 ok, p2 ok, p3 WRONG, then p1.. already matched... the board locks a
  // matched pair, so the wrong attempt uses p3 against p4's right half.
  const game = matchingGame('ui-conn-6', 6, 'connection', 'solar-system');
  const g = await evaluate(RUN(game, [
    ['p1', 'p1'],
    ['p2', 'p2'],
    ['p3', 'p4'],
    ['p3', 'p3'],
    ['p4', 'p4'],
    ['p5', 'p5'],
    ['p6', 'p6']
  ]));

  const open = byLabel(g, 'open');
  check('the play surface renders the connection panel', open.hasPanel === true);
  check('the game opens on the chosen template', open.templateId === 'solar-system', open.templateId);
  check('the picture starts empty (0/N kết nối)',
    open.connected === 0 && (open.counter || '').includes('0/' + open.total),
    `connected=${open.connected} counter=${open.counter}`);
  check('the card columns are replaced by the pick row, both halves present',
    open.board === false && open.leftCards === 6 && open.rightCards === 6 && open.picks === 12,
    `board=${open.board} left=${open.leftCards} right=${open.rightCards}`);
  check('no edge is drawn before the first correct pair',
    open.drawnEdges.length === 0 && open.edgesOn.length === 0, JSON.stringify(open.drawnEdges));
  check('the picture is large enough to read in class',
    open.svgBox && open.svgBox.w >= 400 && open.svgBox.h >= 120, JSON.stringify(open.svgBox));
  check('a 3D layer mounts behind the stage', open.canvas === true);

  // -------------------- the board is a real 3D surface (#169) ----------------
  // Measured while the board is open: the canvas covers the stage, every node
  // projects inside the picture frame, the picture fills the frame, and the SVG
  // is only a hidden fallback.
  console.log('\n=== the board is a real 3D surface ===');
  // Re-open the same game: by this point the loop has produced and dismissed the
  // results screen, so "the board is on screen" must be asserted, not assumed.
  await evaluate(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    document.getElementById('modalRoot').innerHTML = '';
    await sleep(200);
    playGame(${game});
    await sleep(900);
    document.querySelector('[data-match-side="left"][data-pair="p1"]').click();
    await sleep(150);
    document.querySelector('[data-match-side="right"][data-pair="p1"]').click();
    await sleep(1200);
    return true;
  })()`);
  const three = await evaluate(`(() => {
    const frame = document.querySelector('[data-connection-stage]');
    const gameStage = document.querySelector('.game-stage');
    const canvas = gameStage && gameStage.querySelector('canvas');
    const panel = document.querySelector('[data-connection-panel]');
    const graph = typeof threeWorld !== 'undefined' && threeWorld ? threeWorld.graph : null;
    if (!frame || !canvas || !graph) return { missing: true, frame: Boolean(frame), canvas: Boolean(canvas), graph: Boolean(graph) };
    const fr = frame.getBoundingClientRect();
    const cr = canvas.getBoundingClientRect();
    const cam = threeStageHandle.camera;
    const s = graph.group.scale.x;
    const visibleHeight = 2 * Math.tan(cam.fov * Math.PI / 360) * cam.position.z;
    const pxPerUnit = cr.height / visibleHeight;
    const outside = [];
    const points = {};
    Object.keys(graph.nodes).forEach(id => {
      const root = graph.nodes[id].root;
      const v = new THREE.Vector3(root.position.x * s, root.position.y * s, root.position.z).project(cam);
      const px = Math.round((v.x * 0.5 + 0.5) * cr.width + cr.left);
      const py = Math.round((-v.y * 0.5 + 0.5) * cr.height + cr.top);
      points[id] = { px, py };
      if (!(px > fr.left && px < fr.right && py > fr.top && py < fr.bottom)) outside.push({ id, px, py });
    });
    const xs = Object.values(points).map(p => p.px);
    const ys = Object.values(points).map(p => p.py);
    const graphNodes = Object.keys(graph.nodes);
    const earnedIds = connectionEarnedParts(state.currentGame).nodeIds;
    const earnedId = earnedIds[0] || graphNodes[0];
    const ghostId = graphNodes.find(id => earnedIds.indexOf(id) === -1) || graphNodes[0];
    return {
      missing: false,
      panelClass: panel ? panel.className : '',
      canvasW: Math.round(cr.width),
      canvasH: Math.round(cr.height),
      frameW: Math.round(fr.width),
      frameH: Math.round(fr.height),
      nodes: graphNodes.length,
      links: graph.links.length,
      outside,
      filledW: Number(((Math.max(...xs) - Math.min(...xs)) / fr.width).toFixed(2)),
      filledH: Number(((Math.max(...ys) - Math.min(...ys)) / fr.height).toFixed(2)),
      platePx: { w: Math.round(1.7 * s * pxPerUnit), h: Math.round(0.62 * s * pxPerUnit) },
      dotPx: Math.round(0.34 * s * pxPerUnit),
      svgHidden: (() => { const svg = frame.querySelector('.connection-svg'); return svg ? getComputedStyle(svg).visibility === 'hidden' : false; })(),
      earnedId,
      ghostId,
      earnedY: Number(graph.nodes[earnedId].root.position.y.toFixed(4)),
      earnedRotY: Number(graph.nodes[earnedId].root.rotation.y.toFixed(4)),
      ghostY: Number(graph.nodes[ghostId].root.position.y.toFixed(4)),
      ghostOutline: graph.nodes[ghostId].ghost.visible,
      hoverables: threeStageHandle.hoverables.length,
      onStep: typeof threeStageHandle.onStep
    };
  })()`);
  check('the connection board mounts a real Three.js scene', three.missing === false,
    three.missing ? JSON.stringify(three) : `nodes=${three.nodes} links=${three.links}`);
  if (!three.missing) {
    check('the board uses the panel 3D surface', Boolean(three.panelClass && three.panelClass.indexOf('is-3d') !== -1), three.panelClass);
    check('the canvas covers the stage behind the DOM', three.canvasW > 600 && three.canvasH > 200,
      `${three.canvasW}x${three.canvasH}`);
    check('one 3D node per template node and one beam per edge',
      three.nodes === 6 && three.links === 5, `nodes=${three.nodes} links=${three.links}`);
    check('every 3D node is projected inside the picture frame', three.outside.length === 0,
      JSON.stringify(three.outside));
    check('the board fills the frame rather than floating in it',
      three.filledH >= 0.5 && three.filledW >= 0.12, `w=${three.filledW} h=${three.filledH}`);
    check('a node is big enough to read at 1366x768+', three.platePx.w >= 55 && three.dotPx >= 11,
      `plate ${three.platePx.w}x${three.platePx.h} dot ${three.dotPx}`);
    check('the SVG fallback is hidden while 3D is live', three.svgHidden === true);
    check('a ghost stays an outline until its stage is earned', three.ghostOutline === true);
    check('hover is registered on real node bodies', three.hoverables >= 5, `hoverables=${three.hoverables}`);
    check('the idle animation runs on the shared render loop', three.onStep === 'function');

    // The idle float must move an EARNED node and leave a ghost still: that is
    // what makes "done" and "still to do" differ by motion, not only by colour.
    //
    // The frames are driven explicitly instead of waiting on wall-clock time:
    // Chromium freezes requestAnimationFrame in a window it considers hidden
    // (`document.visibilityState === 'hidden'`), which is exactly the state of the
    // app window while this check runs in the background. Waiting would then
    // measure "nothing happened" on a correct board. `onStep` is the same hook the
    // shared rAF loop calls every frame, so this asserts the real animation.
    const moved = await evaluate(`(() => {
      const graph = threeWorld.graph;
      const earned = graph.nodes[${JSON.stringify(three.earnedId)}].root;
      const ghost = graph.nodes[${JSON.stringify(three.ghostId)}].root;
      const step = threeStageHandle.onStep;
      for (let i = 0; i < 24; i += 1) step(1 / 60, false);
      return { y: Number(earned.position.y.toFixed(4)), rot: Number(earned.rotation.y.toFixed(4)), ghostY: Number(ghost.position.y.toFixed(4)) };
    })()`);
    check('an earned node breathes and turns',
      Math.abs(moved.y - three.earnedY) > 0.0005 || Math.abs(moved.rot - three.earnedRotY) > 0.0005,
      `y ${three.earnedY}→${moved.y} rot ${three.earnedRotY}→${moved.rot}`);
    check('a ghost never moves', moved.ghostY === three.ghostY, `${three.ghostY}→${moved.ghostY}`);
  }

  const s1 = byLabel(g, 'step-1');
  check('a correct pair connects exactly one stage',
    s1.connected === 1 && (s1.counter || '').includes('1/' + s1.total),
    `connected=${s1.connected} counter=${s1.counter}`);
  // With 3D live the SVG is a HIDDEN fallback (DECISIONS #169): the earned edge
  // is drawn by the 3D beam, which the "3D board" section below asserts. These
  // two checks therefore assert the SVG does not compete with the canvas — the
  // visible-picture assertions for the SVG live in the fallback section.
  check('with 3D live the SVG does not paint a second copy of the edge',
    s1.drawnEdges.length === 0 && s1.edgesOn.length === 1,
    `svgEdges=${JSON.stringify(s1.drawnEdges)} earned=${JSON.stringify(s1.edgesOn)}`);
  check('the earned node is carried by the 3D board, not the hidden SVG',
    s1.shownNodes.length === 0 && s1.nodesOn.length === 1,
    `svgNodes=${JSON.stringify(s1.shownNodes)} earned=${JSON.stringify(s1.nodesOn)}`);
  check('the hint counts the remaining stages', (s1.hint || '').includes(String(s1.total - 1)), s1.hint);

  const s2 = byLabel(g, 'step-2');
  const s3 = byLabel(g, 'step-3');
  check('a second correct pair adds a second connection', s2.connected === 2, `connected=${s2.connected}`);
  check('a wrong pair connects nothing', s3.connected === 2, `connected=${s3.connected}`);
  check('a wrong pair never removes an earlier connection',
    s3.drawnEdges.join(',') === s2.drawnEdges.join(','),
    `${JSON.stringify(s2.drawnEdges)} -> ${JSON.stringify(s3.drawnEdges)}`);
  check('a wrong pair is flagged on the cards', s3.wrongCards >= 0, `wrongCards=${s3.wrongCards}`);

  // Stages earned: p1, p2, p3 (retried after its wrong attempt), p4 — p5 and p6
  // are past the fifth stage of this template, so they score but connect nothing.
  const last = byLabel(g, 'step-5');
  check('a retry of the same pair still earns its stage', last.connected === 4,
    `connected=${last.connected} (p1..p4 after p3 was retried)`);
  const done = byLabel(g, 'step-6');
  check('every pair scores even past the last stage', done.connected === done.total,
    `connected=${done.connected} total=${done.total}`);

  const res = byLabel(g, 'results');
  check('the board completes and offers the result screen', res.onResults === true);
  check('the result screen shows the picture hero', res.resultHero === true);
  check('the result reports the ACTUAL progress, not the total',
    (res.resultText || '').includes(`${done.total}/${done.total}`), JSON.stringify(res.resultText));
  check('the result picture draws every earned edge',
    res.resultEdges === done.total, `edges=${res.resultEdges} earned=${done.total}`);

  // -------------------------------- the SVG fallback (#169) ----------------
  // A classroom machine can have WebGL disabled, and a mid-lesson context loss
  // must not cost the class a connection. The board therefore keeps the SVG in
  // the DOM: with no 3D it is the picture, and the same pairs still score.
  console.log('\n=== without WebGL the SVG still plays ===');
  const svgOnly = await evaluate(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    document.getElementById('modalRoot').innerHTML = '';
    await sleep(200);
    const original = threeGame.isAvailable;
    threeGame.isAvailable = () => false;
    try {
      playGame(${matchingGame('ui-conn-svg', 4, 'connection', 'bridge')});
      await sleep(700);
      const panel = document.querySelector('[data-connection-panel]');
      const stage = document.querySelector('[data-connection-stage]');
      const svg = stage && stage.querySelector('.connection-svg');
      const first = { panel: panel ? panel.className : null, attr: stage ? stage.getAttribute('data-connection3d') : null,
        canvas: Boolean(document.querySelector('.game-stage canvas')),
        svgVisible: svg ? getComputedStyle(svg).visibility : null,
        drawn: stage ? stage.querySelectorAll('path.connection-edge').length : -1 };
      document.querySelector('[data-match-side="left"][data-pair="p1"]').click();
      await sleep(120);
      document.querySelector('[data-match-side="right"][data-pair="p1"]').click();
      await sleep(700);
      const after = { connected: state.connectionProgress.connectedStageIds.length,
        drawn: document.querySelectorAll('[data-connection-stage] path.connection-edge').length,
        counter: document.querySelector('[data-connection-counter]').textContent.replace(/\\s+/g, ' ').trim(),
        matched: state.matchingPlay.matched };
      document.querySelector('[data-match-side="left"][data-pair="p2"]').click();
      await sleep(120);
      document.querySelector('[data-match-side="right"][data-pair="p2"]').click();
      await sleep(700);
      after.connected2 = state.connectionProgress.connectedStageIds.length;
      after.drawn2 = document.querySelectorAll('[data-connection-stage] path.connection-edge').length;
      after.matched2 = state.matchingPlay.matched;
      return { first, after };
    } finally {
      threeGame.isAvailable = original;
    }
  })()`);
  // No threeGame.mount() ran, so the 3D attribute keeps its markup value 'off'
  // and the panel carries `is-svg` — together they say "this is the fallback".
  check('without WebGL the board falls back to the SVG surface',
    svgOnly.first.attr === 'off' && /\bis-svg\b/.test(svgOnly.first.panel || ''),
    `${svgOnly.first.attr} / ${svgOnly.first.panel}`);
  check('without WebGL no canvas is attached', svgOnly.first.canvas === false);
  check('without WebGL the SVG is the visible picture', svgOnly.first.svgVisible === 'visible',
    svgOnly.first.svgVisible);
  check('the fallback starts with no edge drawn', svgOnly.first.drawn === 0, `edges=${svgOnly.first.drawn}`);
  check('the fallback scores the same pair', svgOnly.after.matched === 1 && svgOnly.after.connected === 1,
    JSON.stringify(svgOnly.after));
  check('the fallback draws the earned edge in the SVG', svgOnly.after.drawn === 1, `edges=${svgOnly.after.drawn}`);
  check('the fallback keeps its counter in the DOM', (svgOnly.after.counter || '').includes('1/'), svgOnly.after.counter);
  check('the fallback keeps progressing on the next pair',
    svgOnly.after.matched2 === 2 && svgOnly.after.connected2 === 2 && svgOnly.after.drawn2 === 2,
    JSON.stringify(svgOnly.after));

  // ------------------------------------- columns / memory are untouched ----
  console.log('\n=== the other matching styles are untouched ===');
  const columns = await evaluate(RUN(matchingGame('ui-conn-columns', 3, 'columns'), [['p1', 'p1'], ['p2', 'p2'], ['p3', 'p3']]));
  const cOpen = byLabel(columns, 'open');
  check('the columns board still renders the two-column board', cOpen.board === true && cOpen.hasPanel === false);
  check('the columns board keeps no connection state', cOpen.connected === 0 && cOpen.total === 0,
    `connected=${cOpen.connected} total=${cOpen.total}`);
  const memory = await evaluate(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    document.querySelector('[data-play-close]')?.click();
    document.getElementById('modalRoot').innerHTML = '';
    await sleep(150);
    playGame(${matchingGame('ui-conn-memory', 3, 'memory')});
    await sleep(600);
    return {
      cards: document.querySelectorAll('.memory-card').length,
      panel: Boolean(document.querySelector('[data-connection-panel]'))
    };
  })()`);
  check('the memory board still renders memory cards and no connection panel',
    memory.cards === 6 && memory.panel === false, JSON.stringify(memory));

  // ---------------------------- replay resets the picture, keeps the style ----
  console.log('\n=== replay keeps the style and the template ===');
  const replay = await evaluate(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    document.querySelector('[data-play-close]')?.click();
    document.getElementById('modalRoot').innerHTML = '';
    await sleep(150);
    playGame(${matchingGame('ui-conn-replay', 4, 'connection', 'circuit')});
    await sleep(600);
    document.querySelector('[data-match-side="left"][data-pair="p1"]').click();
    await sleep(120);
    document.querySelector('[data-match-side="right"][data-pair="p1"]').click();
    await sleep(600);
    const before = state.connectionProgress.connectedStageIds.length;
    // Finish the board so the results screen (and its replay button) exists.
    for (const id of ['p2', 'p3', 'p4']) {
      document.querySelector('[data-match-side="left"][data-pair="' + id + '"]').click();
      await sleep(80);
      document.querySelector('[data-match-side="right"][data-pair="' + id + '"]').click();
      await sleep(1100);
    }
    document.getElementById('matchingResultsBtn')?.click();
    await sleep(500);
    document.getElementById('replayBtn')?.click();
    await sleep(600);
    return {
      before,
      after: state.connectionProgress.connectedStageIds.length,
      mode: state.currentGame.matchingGame.mode,
      template: state.currentGame.matchingGame.connectionTemplate,
      counter: document.querySelector('[data-connection-counter]')?.textContent.replace(/\\s+/g, ' ').trim()
    };
  })()`);
  check('the picture starts again from zero on replay', replay.before === 1 && replay.after === 0,
    `before=${replay.before} after=${replay.after}`);
  check('replay keeps the style and the template',
    replay.mode === 'connection' && replay.template === 'circuit', `${replay.mode}/${replay.template}`);
  // The circuit template has five stages while the board has four pairs, so the
  // counter after replay reads 0/5 — the template's total, not the pair count.
  check('the counter shows 0/N again after replay', (replay.counter || '').includes('0/5'), replay.counter);

  // --------------------------------------- saved game keeps the template ----
  console.log('\n=== a saved game keeps its style and template ===');
  const saved = await evaluate(`(async () => {
    const g = ${matchingGame('ui-conn-save', 3, 'connection', 'timeline')};
    await window.eduGame.saveGame(g);
    const library = await window.eduGame.getLibrary();
    const found = library.games.find(entry => entry.id === 'ui-conn-save');
    await window.eduGame.deleteGame('ui-conn-save');
    return {
      mode: found && found.matchingGame ? found.matchingGame.mode : null,
      template: found && found.matchingGame ? found.matchingGame.connectionTemplate : null
    };
  })()`);
  check('a saved game keeps its connection style and template',
    saved.mode === 'connection' && saved.template === 'timeline', JSON.stringify(saved));
  // The card chip is drawn from the library list, which repaints on the next
  // navigation; look it up through the same renderer that paints the card.
  const chip = await evaluate(`(() => {
    const found = { id: 'chip-probe', title: 'Chip', template: 'matching', subject: '', grade: '', tags: [], createdAt: '2026-01-01T00:00:00.000Z',
      questions: [], gameSetup: {}, matchingGame: { mode: 'connection', connectionTemplate: 'bridge', pairs: [], pointsPerPair: 100, completionBonus: 0, wrongPenalty: 0, timeBonus: 0, bonusUnderSeconds: 0, practiceMode: false } };
    const columns = { ...found, matchingGame: { ...found.matchingGame, mode: 'columns' } };
    return {
      connection: gameCard(found, 0).includes('data-play-mode="connection"'),
      columns: gameCard(columns, 0).includes('data-play-mode="connection"')
    };
  })()`);
  check('the library card marks a connection board and only that board',
    chip.connection === true && chip.columns === false, JSON.stringify(chip));

  // ------------------------------------------ editor offers the style ----
  console.log('\n=== the editor and the wizard offer the style ===');
  const editor = await evaluate(`(async () => {
    // openEditor() takes the GAME and navigates to the editor page, so it is
    // called with the object rather than an id.
    const g = ${matchingGame('ui-conn-editor', 3, 'connection', 'geometry')};
    openEditor(g);
    for (let i = 0; i < 40; i++) {
      if (document.querySelector('#matchingEditor')) break;
      await new Promise(r => setTimeout(r, 100));
    }
    const mode = document.querySelector('#matchingMode');
    const field = document.querySelector('#matchingEditor [data-connection-field]');
    const read = readMatchingEditor(document);
    return {
      options: mode ? [...mode.options].map(o => o.value) : [],
      selected: mode ? mode.value : null,
      hasField: Boolean(field),
      fieldVisible: field ? !field.classList.contains('hidden') : false,
      cards: document.querySelectorAll('#matchingEditor [data-connection-template]').length,
      checked: document.querySelector('#matchingEditor input[type="radio"]:checked')?.value || null,
      readBack: read.mode,
      readTemplate: read.connectionTemplate || null
    };
  })()`);
  check('the editor offers four matching play styles',
    ['columns', 'memory', 'categorize', 'connection'].every(m => editor.options.indexOf(m) !== -1),
    JSON.stringify(editor.options));
  check('the editor preselects the saved style and shows the gallery',
    editor.selected === 'connection' && editor.hasField === true && editor.fieldVisible === true,
    `selected=${editor.selected} field=${editor.hasField}/${editor.fieldVisible}`);
  check('the editor gallery renders every template and preselects the saved one',
    editor.cards === 7 && editor.checked === 'geometry', `cards=${editor.cards} checked=${editor.checked}`);
  check('the editor reads back the style and template it renders',
    editor.readBack === 'connection' && editor.readTemplate === 'geometry',
    `${editor.readBack}/${editor.readTemplate}`);

  const passed = results.filter(r => r.ok).length;
  const summary = { passed, total: results.length, failed: results.length - passed };
  console.log(`\n${summary.passed}/${summary.total} checks passed`);
  process.exit(summary.failed === 0 ? 0 : 1);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
