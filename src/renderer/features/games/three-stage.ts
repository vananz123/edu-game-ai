// @ts-nocheck -- 3D stage: mount/unmount, anchors, per-template worlds and reactThree (split from features/gameplay.ts, DECISIONS #147).
// ---------- Three.js presentation (DECISIONS #137) ----------
// Decorative only: the 3D layer never scores and never changes answers. The DOM
// answer buttons stay the single input path; this adds a world-tinted backdrop
// and a particle burst on answer. Machines without WebGL keep the 2D surface.
let threeStageHandle = null;
let threeWorld = null;
// World accent of the stage, captured at mount so the pattern factories (which
// may run in a test with no document) still tint their props consistently.
let stageAccent = '#6d7cf0';
// Race fully re-renders its board on every answer (answerRace → renderRaceBoard),
// so a burst fired on the pre-render handle would be unmounted before it shows.
// This flag carries the colour across the re-render so the fresh handle bursts.
let raceAnswerBurst = null;
// The same re-render problem applies to the race celebration: the winning
// answer repaints the board, so the confetti must fire on the fresh handle.
let raceAnswerCelebrate = false;
function unmountThreeStage() {
    // The connection board listens for resizes to reframe itself; the listener
    // dies with the world, otherwise a closed game keeps a reference and every
    // later resize would measure a frame that no longer exists.
    if (threeWorld && threeWorld.onResize) {
        window.removeEventListener('resize', threeWorld.onResize);
        threeWorld.onResize = null;
    }
    if (threeWorld && threeWorld.frameRaf) {
        cancelAnimationFrame(threeWorld.frameRaf);
        threeWorld.frameRaf = 0;
    }
    // Deferred glow/dolly steps must not run against a disposed world.
    if (threeWorld) {
        (threeWorld.timers || []).forEach(id => window.clearTimeout(id));
        threeWorld.timers = [];
    }
    if (threeStageHandle && window.threeGame) {
        // The connection board may still hold a pending glow/dolly timer. Those
        // callbacks all check `threeStageHandle`, so clearing it below is enough
        // — and the node graph disposes its own geometry through unmount().
        threeStageHandle.onStep = null;
        window.threeGame.unmount(threeStageHandle);
    }
    threeStageHandle = null;
    threeWorld = null;
}
function mountThreeStage(stage, opts = {}) {
    if (!stage || !window.threeGame || !window.threeGame.isAvailable())
        return;
    unmountThreeStage();
    let accent = '#6d7cf0';
    try {
        const css = getComputedStyle(stage).getPropertyValue('--world-accent');
        if (css && css.trim())
            accent = css.trim();
    }
    catch (err) { /* keep the default accent */ }
    // The house owns the stage centre in house mode; the spinning emblem would
    // only fight it (DECISIONS #142). The connection board also parks it — its
    // own 3D picture is the subject (DECISIONS #169).
    const boardMode = isConnectionBoard(state.currentGame);
    threeStageHandle = window.threeGame.mount(stage, { accent, emblem: !isHouseMode(state.currentGame) && !boardMode });
    // Kept for the factories that cannot read CSS themselves (they are also used
    // in unit tests with no document): the connection graph tints its nodes.
    stageAccent = accent;
    const template = state.currentGame && state.currentGame.template;
    if (opts.world !== false && isHouseMode(state.currentGame))
        buildHouseWorld();
    else if (opts.world !== false && (template === 'quiz' || template === 'scenario'))
        buildThreeWorld();
    else if (opts.world !== false && template === 'matching')
        buildMatchingWorld();
    else if (opts.world !== false && template === 'treasure-hunt')
        buildTreasureWorld();
    else if (opts.world !== false && template === 'race')
        buildRaceWorld();
}
function burstThreeStage(color) {
    if (threeStageHandle && window.threeGame)
        window.threeGame.burst(threeStageHandle, { color });
}
/** The stage's world accent, captured at mount (CSS custom property). */
function readWorldAccent() {
    return stageAccent || '#6d7cf0';
}
// Place a prop at a screen FRACTION of the stage (0..1, origin top-left) rather
// than a fixed world coordinate. The stage aspect flips between the compact
// preview (narrow, tall) and fullscreen (wide, short): a world x that reads as
// "outer margin" in one lands in the middle of the answer grid in the other.
// `anchor` re-projects every frame, so the spot survives the asynchronous
// native-fullscreen resize that happens after the surface is first rendered.
function addAnchoredObject(object, fx, fy, z = -1) {
    window.threeGame.addObject(threeStageHandle, object, 0, 0, z);
    window.threeGame.anchor(threeStageHandle, object, fx, fy, z);
}
// The quiz/scenario "game world" (DECISIONS #139): a construction tower
// (bottom-left) that grows one block per correct answer and a destructible block
// (top-right) that shatters on a wrong one. Built fresh on each question so the
// tower reflects the running correct count. Presentation only — it reads
// state.gameAnswers but never scores or changes answers.
function buildThreeWorld() {
    if (!threeStageHandle || !window.threeGame)
        return;
    const world = {};
    const game = state.currentGame;
    const total = game && game.questions && game.questions.length ? game.questions.length : 1;
    const construction = window.threeGame.makeConstruction({ steps: total, color: '#34d399', blockSize: 0.7 });
    window.threeGame.addObject(threeStageHandle, construction.group, -6.2, -2.8, -1);
    construction.setStage(threeStageHandle, state.gameAnswers.reduce((s, a) => s + (a.correct ? 1 : 0), 0), { animate: false });
    world.construction = construction;
    const destructible = window.threeGame.makeDestructible({ color: '#f87171', size: 1.1 });
    window.threeGame.addObject(threeStageHandle, destructible.group, 6.2, 2.6, -1);
    world.destructible = destructible;
    threeWorld = world;
}
// Matching (DECISIONS #145): the chest is the "unlock" reward and opens when the
// last pair is matched; a destructible block shatters on a wrong pair and resets
// itself on a timer so the next wrong attempt can break it again. The board is
// only re-rendered on open, so this world lives for the whole game.
function buildMatchingWorld() {
    if (!threeStageHandle || !window.threeGame)
        return;
    // #168: a connection board already shows the picture as SVG; this world adds
    // only the spark at the node that just joined. See buildConnectionWorld().
    if (isConnectionBoard(state.currentGame)) {
        buildConnectionWorld();
        return;
    }
    const world = {};
    // The board is centred, so the outer right margin is empty in BOTH layouts;
    // the left margin is taken by the emblem, and the bottom by feedback+answers.
    const unlockable = window.threeGame.makeUnlockable({ color: '#e9b95b' });
    addAnchoredObject(unlockable.group, 0.93, 0.47);
    world.unlockable = unlockable;
    const destructible = window.threeGame.makeDestructible({ color: '#f87171', size: 1.1 });
    addAnchoredObject(destructible.group, 0.93, 0.32);
    world.destructible = destructible;
    threeWorld = world;
}
function reactMatching(event, detail) {
    const world = threeWorld;
    // #168: on a connection board the picture is the star; 3D only adds a spark
    // at the node that just joined, so the card rewards are skipped.
    if (isConnectionBoard(state.currentGame)) {
        reactConnectionBoard(event, detail);
        return;
    }
    if (event === 'match:correct') {
        burstThreeStage('#34d399');
    }
    else if (event === 'match:incorrect') {
        burstThreeStage('#f87171');
        if (world && world.destructible) {
            world.destructible.shatter(threeStageHandle);
            window.threeGame.effect(threeStageHandle, () => { }, 1.3, () => world.destructible.reset());
        }
    }
    else if (event === 'game:completed') {
        if (world && world.unlockable)
            world.unlockable.open(threeStageHandle);
        if (window.threeGame.celebrate)
            window.threeGame.celebrate(threeStageHandle);
    }
}
/*
 * Object Connection on a matching board (DECISIONS #168, rebuilt as a 3D surface
 * in #169).
 *
 * The picture IS the game surface now: `makeNodeGraph` turns the template into
 * real 3D nodes and beams, the camera leans in when a link lands, and the two
 * pick rows stay DOM below it (3D renders and animates, the DOM carries the
 * information). No geometry carries a caption — the template's labels are
 * authored Vietnamese text and canvas text would be unreadable on a projector at
 * the sizes this board takes, so the DOM keeps every word.
 *
 * Only when the shared layer has no WebGL does `connection.ts` fall back to the
 * SVG. Both surfaces are fed by the same `state.connectionProgress`, so a class
 * that loses the GPU mid-lesson keeps playing without losing a connection.
 */

// Board geometry: a template is authored on a 1000×620 grid, so the world box
// keeps that aspect in units (10 × 6.2). The board is then scaled to FIT the
// frame, which is what decides how large the picture reads — the unit size only
// has to keep the numbers readable. The frame is wide and short (7.5:1 at
// 1366×768), so the fit is usually height-bound; the margin is deliberately
// small (0.94) because every point of it is picture that a back-row student
// cannot see. At the tightest classroom size this still yields plates of ~54 px
// and leaves room for a bowed link.
const CONNECTION_WORLD = { width: 10, height: 6.2 };
const CONNECTION_CAMERA_Z = 13;

function connectionWorldPosition(node) {
    return {
        x: (node.x / CONNECTION_VIEWBOX.width - 0.5) * CONNECTION_WORLD.width,
        y: (0.5 - node.y / CONNECTION_VIEWBOX.height) * CONNECTION_WORLD.height
    };
}

/**
 * Frame the board inside the DOM box that was reserved for it.
 *
 * The shared canvas covers the WHOLE stage (the illustration column is hidden in
 * this mode), so drawing at the world origin would put the picture in the middle
 * of the page, outside the `.connection-stage` frame the CSS sized for it. The
 * camera is therefore lifted so the world origin projects onto the frame's
 * centre, and the picture is scaled to the frame's smaller dimension. Both are
 * recomputed on every mount, so fullscreen and a window resize reframe it, and
 * nothing here is measured from a frozen projection.
 */
function frameConnectionBoard() {
    const frame = document.querySelector('[data-connection-stage]');
    const gameStage = document.querySelector('.game-stage');
    const graph = threeWorld && threeWorld.graph;
    if (!frame || !gameStage || !graph || !threeStageHandle) return;
    const frameRect = frame.getBoundingClientRect();
    const stageRect = gameStage.getBoundingClientRect();
    if (!frameRect.width || !stageRect.width || !stageRect.height) return;
    const handle = threeStageHandle;
    // Visible world height at the camera's distance, from its own fov — the same
    // projection `stagePoint()` uses, so the two cannot disagree.
    const visibleHeight = 2 * Math.tan((handle.camera.fov * Math.PI) / 360) * handle.camera.position.z;
    const visibleWidth = visibleHeight * (stageRect.width / stageRect.height);
    // Put the world origin on the frame's centre. The camera looks down -z, so a
    // frame ABOVE the stage centre needs a camera BELOW the origin: the sign is
    // `frameOffset` straight, not negated. Getting this wrong lands the whole
    // picture one frame-height too low, which is exactly what v1 of this function
    // did (measured, not guessed).
    const frameOffset = (frameRect.top + frameRect.height / 2) - (stageRect.top + stageRect.height / 2);
    handle.camera.position.y = frameOffset * (visibleHeight / stageRect.height);
    // The camera is NOT a child of the scene, so three.js only refreshes its
    // matrixWorld inside render(). Anything that projects before the next painted
    // frame — `stagePoint()`, the anchored props, and this function's own callers —
    // would otherwise use the PREVIOUS camera position. Measured live: without
    // this line every node projected ~60 000 px off-screen until a frame ran, and
    // in a throttled window that frame may never come.
    handle.camera.updateMatrixWorld(true);
    // Fit the board into the frame with a margin: a bowed link reaches past the
    // node extents, and the eye reads a picture better with air around it.
    const frameWorldWidth = (frameRect.width / stageRect.width) * visibleWidth;
    const frameWorldHeight = (frameRect.height / stageRect.height) * visibleHeight;
    const scale = Math.max(0.3, Math.min(frameWorldWidth / CONNECTION_WORLD.width, frameWorldHeight / CONNECTION_WORLD.height) * 0.94);
    graph.group.scale.setScalar(scale);
}

function buildConnectionWorld() {
    if (!threeStageHandle || !window.threeGame)
        return;
    const template = connectionTemplateFor(state.currentGame);
    const nodes = template.nodes.map(node => {
        const p = connectionWorldPosition(node);
        // A slight z jitter gives the board parallax without letting far nodes
        // drift into the near ones: ±0.28 units against a 13-unit camera.
        return { id: node.id, x: p.x, y: p.y, z: ((node.x * 7 + node.y * 13) % 5) * 0.07 - 0.14, kind: node.kind };
    });
    const links = template.edges.map(edge => ({ id: edge.id, from: edge.from, to: edge.to, bend: Number(edge.bend) * CONNECTION_WORLD.width / CONNECTION_VIEWBOX.width || 0 }));
    const graph = window.threeGame.makeNodeGraph({ nodes, links, accent: readWorldAccent() });
    window.threeGame.addObject(threeStageHandle, graph.group, 0, 0, 0);

    // The dome and the emblem belong to the decorative backdrop; a board that is
    // meant to be read is better without a rotating knot behind it.
    if (threeStageHandle.emblem) threeStageHandle.emblem.visible = false;

    threeWorld = { kind: 'connection', graph, template, burstOn: null };
    // The idle float runs on the shared render loop (one rAF for every game), so
    // an earned node breathes and a ghost does not — the picture is alive without
    // a second timer, and `prefers-reduced-motion` freezes it inside the layer.
    threeStageHandle.onStep = (dt, reduced) => graph.tick(dt, reduced);
    // Hover is the only pointer input on the board, and it reuses the layer's own
    // implementation (raycast + easing in `step()`), so there is no second input
    // path. It is registered on the node bodies only: the ghost outline must never
    // look interactive, because it cannot be clicked.
    for (const id of Object.keys(graph.nodes)) {
        const entry = graph.nodes[id];
        if (entry) window.threeGame.addHoverEffect(threeStageHandle, entry.mesh, { scale: 1.16 });
    }
    applyConnectionWorld(true);
    // Frame NOW, not on the next animation frame: Chromium throttles rAF to
    // ~200 ms in a background window, and the board must be correct even then (a
    // teacher can start a game while the projector has focus). Measured that
    // failure live: with the deferred pass only, the camera was still at its rest
    // height and every node projected outside the frame.
    frameConnectionBoard();
    // The stage can also finish laying out one frame later (the modal reaches its
    // final height after the HTML is inserted). A short timer catches that pass
    // WITHOUT depending on rAF at all, so a throttled window still converges; it
    // replaces the previous rAF pass, which never ran while throttled.
    connectionLater(() => frameConnectionBoard(), 120);
    // Fullscreen and the modal resize after the first render; reframe without
    // rebuilding the graph (the geometry is scale-independent).
    if (!threeWorld.onResize) {
        threeWorld.onResize = () => {
            if (threeWorld && threeWorld.kind === 'connection') frameConnectionBoard();
        };
        window.addEventListener('resize', threeWorld.onResize);
    }
}

/**
 * `setTimeout` that dies with the board.
 *
 * Every deferred step of the connection board — glow disposal, camera reset, the
 * staggered completion sweep — goes through here, and `unmountThreeStage()` clears
 * the whole list. Without that, closing the board, replaying, or the 800 ms
 * `showMatchingComplete` re-render leaves timers that fire against a disposed
 * handle and a disposed glow (up to 8 of them on a finished board).
 */
function connectionLater(fn, delay) {
    const world = threeWorld;
    if (!world) return null;
    if (!world.timers) world.timers = [];
    const id = window.setTimeout(() => {
        const list = world.timers || [];
        const at = list.indexOf(id);
        if (at !== -1) list.splice(at, 1);
        fn();
    }, delay);
    world.timers.push(id);
    return id;
}

/** Push `state.connectionProgress` into the 3D board. */
function applyConnectionWorld(animate) {
    const world = threeWorld;
    if (!world || world.kind !== 'connection' || !world.graph || !threeStageHandle) return;
    const parts = connectionEarnedParts(state.currentGame);
    world.graph.setEarned(threeStageHandle, parts.nodeIds, parts.linkIds, { animate: animate !== false });
}

function reactConnectionBoard(event, detail) {
    const world = threeWorld;
    if (!world || world.kind !== 'connection') return;
    if (event === 'match:correct') {
        applyConnectionWorld(true);
        burstThreeStage('#34d399');
        // A landed stage that opens a node gets a halo exactly on that node; a
        // stage that only closes a link (bridge-4, eco-5 …) gets the burst alone.
        const stageId = detail && detail.connection ? detail.connection.stageId : null;
        const stage = stageId ? world.template.stages.find(entry => entry.id === stageId) : null;
        const firstId = stage && stage.nodeIds.length ? stage.nodeIds[0] : null;
        const entry = firstId ? world.graph.nodes[firstId] : null;
        if (entry && window.threeGame.makeGlow) {
            const glow = window.threeGame.makeGlow({ color: '#34d399', size: 0.5 });
            glow.group.position.copy(entry.root.position);
            window.threeGame.addObject(threeStageHandle, glow.group);
            glow.pulse(threeStageHandle);
            connectionLater(() => glow.dispose(), 900);
        }
        // Push in for the landing, then settle back — the whole board reads as a
        // camera move rather than a flat redraw.
        if (window.threeGame.dolly) {
            window.threeGame.dolly(threeStageHandle, 1.1, 0.28);
            connectionLater(() => window.threeGame.resetDolly(threeStageHandle), 420);
        }
    }
    else if (event === 'match:incorrect') {
        burstThreeStage('#f87171');
        if (window.threeGame.dolly) {
            window.threeGame.dolly(threeStageHandle, -0.6, 0.2);
            connectionLater(() => window.threeGame.resetDolly(threeStageHandle), 320);
        }
    }
    else if (event === 'game:completed') {
        // One sweep of colour over the finished board, then the shared burst.
        const nodes = Object.keys(world.graph.nodes || {});
        nodes.forEach((id, index) => {
            const entry = world.graph.nodes[id];
            if (!entry || !entry.earned) return;
            connectionLater(() => {
                if (!threeStageHandle || !window.threeGame || !window.threeGame.makeGlow) return;
                const glow = window.threeGame.makeGlow({ color: '#f2b24a', size: 0.42 });
                glow.group.position.copy(entry.root.position);
                window.threeGame.addObject(threeStageHandle, glow.group);
                glow.pulse(threeStageHandle);
                connectionLater(() => glow.dispose(), 900);
            }, index * 70);
        });
        if (window.threeGame.celebrate)
            window.threeGame.celebrate(threeStageHandle);
    }
}
// Treasure (DECISIONS #145): every stage gets a sealed chest; a correct answer
// opens it, a wrong one only bursts red so the stage can still be retried. Each
// stage render remounts the world, so the chest starts closed again.
function buildTreasureWorld() {
    if (!threeStageHandle || !window.threeGame)
        return;
    const world = {};
    // Below the answer cards: the one band that is empty in the projected
    // layout at both resolutions. The compact preview scrolls at 1366 (treasure
    // is the template allowed to be taller than the window), so it is not the
    // placement target here.
    const unlockable = window.threeGame.makeUnlockable({ color: '#e9b95b' });
    addAnchoredObject(unlockable.group, 0.28, 0.86);
    world.unlockable = unlockable;
    threeWorld = world;
}
function reactTreasure(event) {
    const world = threeWorld;
    if (event === 'answer:correct') {
        burstThreeStage('#34d399');
        if (world && world.unlockable)
            world.unlockable.open(threeStageHandle);
    }
    else if (event === 'answer:incorrect') {
        burstThreeStage('#f87171');
    }
    else if (event === 'game:completed') {
        if (window.threeGame.celebrate)
            window.threeGame.celebrate(threeStageHandle);
    }
}
// Race (DECISIONS #145): a tower grows one block per correct answer and an orb
// flashes green/red on every answer. The board fully re-renders on each answer,
// so the tower is rebuilt from `rp.correctCount` (minus the block the fresh
// handle is about to animate in) and the reaction is carried by `raceAnswerBurst`.
function buildRaceWorld() {
    if (!threeStageHandle || !window.threeGame || !state.racePlay)
        return;
    const world = {};
    // Race is the densest board: at 1920x1080 fullscreen the area under the turn
    // card is the only free band, so the tower stands there (bottom-left, the
    // quiz's "progress" corner). At 1366x768 the turn card already overflows the
    // stage (known density limit), so the tower sits behind it; the orb in the
    // strip above the status bar and the answer burst stay visible at both sizes.
    const total = state.currentGame && state.currentGame.race ? state.currentGame.race.questions.length : 1;
    const construction = window.threeGame.makeConstruction({ steps: Math.min(8, Math.max(1, total)), color: '#34d399', blockSize: 0.7 });
    addAnchoredObject(construction.group, 0.06, 0.93);
    const count = state.racePlay.correctCount || 0;
    const pendingCorrect = raceAnswerBurst === '#34d399';
    construction.setStage(threeStageHandle, Math.max(0, count - (pendingCorrect ? 1 : 0)), { animate: false });
    world.construction = construction;
    const reactive = window.threeGame.makeReactive({ color: '#6d7cf0', size: 0.4 });
    addAnchoredObject(reactive.group, 0.962, 0.03);
    world.reactive = reactive;
    threeWorld = world;
}
function reactRace(event) {
    const world = threeWorld;
    if (event === 'answer:correct') {
        burstThreeStage('#34d399');
        if (world && world.construction)
            world.construction.setStage(threeStageHandle, state.racePlay ? state.racePlay.correctCount : 0);
        if (world && world.reactive)
            world.reactive.flash(threeStageHandle, 'correct');
    }
    else if (event === 'answer:incorrect') {
        burstThreeStage('#f87171');
        if (world && world.reactive)
            world.reactive.flash(threeStageHandle, 'incorrect');
    }
    else if (event === 'game:completed') {
        if (window.threeGame.celebrate)
            window.threeGame.celebrate(threeStageHandle);
    }
}
// One entry point for gameplay → 3D reactions. Emits the named intent (for any
// 3D listeners) then drives the world of the game that is on screen. Scoring
// stays in the engine.
function reactThree(event, detail) {
    if (!window.threeGame || !threeStageHandle)
        return;
    window.threeGame.emit(event, detail);
    if (isHouseMode(state.currentGame)) {
        reactHouse(event, detail);
        return;
    }
    const template = state.currentGame && state.currentGame.template;
    if (template === 'matching') {
        reactMatching(event, detail);
        return;
    }
    if (template === 'treasure-hunt') {
        reactTreasure(event, detail);
        return;
    }
    if (template === 'race') {
        reactRace(event, detail);
        return;
    }
    const world = threeWorld;
    if (event === 'answer:correct') {
        burstThreeStage('#34d399');
        if (world && world.construction)
            world.construction.setStage(threeStageHandle, state.gameAnswers.reduce((s, a) => s + (a.correct ? 1 : 0), 0));
    }
    else if (event === 'answer:incorrect') {
        burstThreeStage('#f87171');
        if (world && world.destructible)
            world.destructible.shatter(threeStageHandle);
    }
    else if (event === 'game:completed') {
        if (window.threeGame.celebrate)
            window.threeGame.celebrate(threeStageHandle);
    }
}
