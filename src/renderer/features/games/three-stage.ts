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
    // A scene animation still in flight (a card flying to its star) must not
    // keep a frame loop of its own alive after the board is gone.
    if (threeWorld && threeWorld.frameRaf) {
        cancelAnimationFrame(threeWorld.frameRaf);
        threeWorld.frameRaf = 0;
    }
    document.querySelectorAll('.constellation-fly').forEach(node => node.remove());
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
    const handle = threeStageHandle;
    const gameStage = document.querySelector('.game-stage');
    const frame = document.querySelector('[data-connection-stage]') || gameStage;
    if (!handle || !gameStage) return;
    const frameRect = frame.getBoundingClientRect();
    const stageRect = gameStage.getBoundingClientRect();
    if (!frameRect.width || !stageRect.width || !stageRect.height) return;
    // Visible world height at the camera's REST distance, from its own fov — the
    // same projection `stagePoint()` uses, so the two cannot disagree. The rest
    // distance is used, not the live one: a landing push or a replay dolly must
    // move the eye, never resize the picture.
    const visibleHeight = 2 * Math.tan((handle.camera.fov * Math.PI) / 360) * CONNECTION_CAMERA_Z;
    const visibleWidth = visibleHeight * (stageRect.width / stageRect.height);
    // Put the world origin on the frame's centre. The camera looks down -z, so a
    // frame ABOVE the stage centre needs a camera BELOW the origin: the sign is
    // `frameOffset` straight, not negated. Getting this wrong lands the whole
    // picture one frame-height too low, which is exactly what v1 of this function
    // did (measured, not guessed).
    const frameOffset = (frameRect.top + frameRect.height / 2) - (stageRect.top + stageRect.height / 2);
    handle.camera.position.y = frameOffset * (visibleHeight / stageRect.height);
    // The picture is framed for the WHOLE CANVAS, because that is where the
    // fitted span is computed from. Tell the layer, so its render loop does not
    // put the camera back to the frame ratio on its next resize pass.
    if (window.threeGame.fixAspect) window.threeGame.fixAspect(handle, stageRect.width / stageRect.height);
    // The camera is NOT a child of the scene, so three.js only refreshes its
    // matrixWorld inside render(). Anything that projects before the next painted
    // frame — `stagePoint()`, the anchored props, and this function's own callers —
    // would otherwise use the PREVIOUS camera position. Measured live: without
    // this line every node projected ~60 000 px off-screen until a frame ran, and
    // in a throttled window that frame may never come.
    handle.camera.updateMatrixWorld(true);
    fitConnectionGraph();
}

/**
 * Scale the picture into its frame, and centre it on that frame.
 *
 * Split out of `frameConnectionBoard` so the ANCHOR pass can guarantee the fit
 * even when it runs before any framing timer (a hidden window does not fire the
 * deferred pass promptly). The group is a child of the scene at z = 0, so its
 * own position is the lever that moves the picture inside the stage.
 */
function fitConnectionGraph() {
    const handle = threeStageHandle;
    const graph = threeWorld && threeWorld.graph;
    const boardFrame = document.querySelector('[data-connection-stage]');
    const gameStage = document.querySelector('.game-stage');
    if (!handle || !graph || !gameStage || !boardFrame) return;
    const frameRect = boardFrame.getBoundingClientRect();
    const stageRect = gameStage.getBoundingClientRect();
    if (!frameRect.width || !stageRect.width || !stageRect.height) return;
    const visibleHeight = 2 * Math.tan((handle.camera.fov * Math.PI) / 360) * CONNECTION_CAMERA_Z;
    const visibleWidth = visibleHeight * (stageRect.width / stageRect.height);
    // Fit the picture into the frame with a margin: the glow reaches past the
    // star centres, and the eye reads a picture better with air around it.
    const frameWorldWidth = (frameRect.width / stageRect.width) * visibleWidth;
    const frameWorldHeight = (frameRect.height / stageRect.height) * visibleHeight;
    const scale = Math.max(0.3, Math.min(frameWorldWidth / CONNECTION_WORLD.width, frameWorldHeight / CONNECTION_WORLD.height) * 0.9);
    graph.setFitScale(scale);
    // The picture is centred on the WORLD ORIGIN, and `frameConnectionBoard` puts
    // that origin on the frame's centre through the camera. Offsetting the group
    // by the frame as well moved the picture twice (measured: the stars hung
    // ~10 % of the stage below the frame, and every drop target was off).
    graph.group.position.set(0, 0, 0);
}

/**
 * The constellation scene (DECISIONS #172).
 *
 * Depth is what makes this read as a scene rather than a flat diagram, and it is
 * DERIVED, never authored: a star's z comes from its distance to the nearest
 * other star, so the outline of the figure stands forward and the interior sits
 * back. A star that is far behind is drawn larger in world units so that, after
 * perspective division, every star still has the same on-screen size — the
 * parallax reads, the figure stays legible and every drop target stays equal.
 */
function buildConnectionWorld() {
    if (!threeStageHandle || !window.threeGame)
        return;
    // #171: the board is a constellation. Its stars and links come from the SAME
    // selection the play surface uses, so the 3D scene, the SVG fallback and the
    // stage ids can never disagree about which star a pair lights.
    const template = connectionTemplateFor(state.currentGame);
    const depthOf = constellationDepths(template.nodes);
    const nodes = template.nodes.map(node => {
        const p = connectionWorldPosition(node);
        return {
            id: node.id,
            x: p.x,
            y: p.y,
            z: depthOf[node.id] || 0,
            brightness: node.brightness,
            kind: 'star'
        };
    });
    // Edges bow away from the centre of the picture, so two links that leave the
    // same star never lie on one line and the figure reads as a net rather than a
    // chain of comets. The bow is proportional to the edge length, so it never
    // overshoots a short link.
    const cx = nodes.reduce((sum, node) => sum + node.x, 0) / (nodes.length || 1);
    const cy = nodes.reduce((sum, node) => sum + node.y, 0) / (nodes.length || 1);
    const links = template.edges.map(edge => {
        const a = nodes.find(node => node.id === edge.from);
        const b = nodes.find(node => node.id === edge.to);
        if (!a || !b) return { id: edge.id, from: edge.from, to: edge.to, bend: 0 };
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const outX = (a.x + b.x) / 2 - cx;
        const outY = (a.y + b.y) / 2 - cy;
        const outLen = Math.hypot(outX, outY) || 1;
        // Signed bulge: positive when the outward normal points the same way as
        // the edge normal, so every link bows away from the middle of the figure.
        const side = Math.sign((-dy / len) * (outX / outLen) + (dx / len) * (outY / outLen)) || 1;
        return { id: edge.id, from: edge.from, to: edge.to, bend: side * len * 0.07 };
    });
    const graph = window.threeGame.makeNodeGraph({
        nodes,
        links,
        accent: readWorldAccent(),
        // `depth` scales the authored z; the authored z is already in world
        // units, so the factor is 1.
        depth: 1,
        // A star is the drop target: it has to look the same whether it is in
        // front of or behind the others.
        depthCompensated: true
    });
    window.threeGame.addObject(threeStageHandle, graph.group, 0, 0, 0);

    // The dome and the emblem belong to the decorative backdrop; a board that is
    // meant to be read is better without a rotating knot behind it.
    if (threeStageHandle.emblem) threeStageHandle.emblem.visible = false;
    // #173: the generic dust is replaced by a cosmos of its own. The drifting
    // field was tuned for a lit room — in space it competes with the board's
    // stars, which are the one thing a class has to aim at.
    if (threeStageHandle.particles) threeStageHandle.particles.visible = false;
    // The room itself, drawn by Three.js instead of a CSS panel: a gradient sky,
    // a far field of stars, two dim clouds. `gl_PointSize` is in physical pixels,
    // so the star size is scaled by the renderer's own pixel ratio — the same
    // point must be 1.4 px on a projector and crisp on a Retina laptop.
    const pixelRatio = threeStageHandle.renderer && typeof threeStageHandle.renderer.getPixelRatio === 'function'
        ? threeStageHandle.renderer.getPixelRatio()
        : 1;
    const cosmos = window.threeGame.makeCosmos({
        accent: readWorldAccent(),
        pixelScale: pixelRatio * 0.9,
        count: 620
    });
    window.threeGame.addObject(threeStageHandle, cosmos.group, 0, 0, 0);

    threeWorld = { kind: 'connection', graph, cosmos, template, burstOn: null, drag: null, syncer: null };
    // The idle motion runs on the shared render loop (one rAF for every game):
    // stars twinkle, earned ones float, the eye drifts; `prefers-reduced-motion`
    // freezes all of it inside the graph.
    threeStageHandle.onStep = (dt, reduced) => {
        cosmos.tick(dt, reduced);
        graph.tick(dt, reduced);
    };
    // Hover is the only pointer input on the board, and it reuses the layer's own
    // implementation (raycast + easing in `step()`), so there is no second input
    // path. It is registered on the star bodies only.
    for (const id of Object.keys(graph.nodes)) {
        const entry = graph.nodes[id];
        if (entry) window.threeGame.addHoverEffect(threeStageHandle, entry.mesh, { scale: 1.18 });
    }
    if (window.threeGame.enableDrag) window.threeGame.enableDrag(threeStageHandle);
    applyConnectionWorld(true);
    // Frame NOW, not on the next animation frame: Chromium throttles rAF to
    // ~200 ms in a background window, and the board must be correct even then (a
    // teacher can start a game while the projector has focus). Measured that
    // failure live: with the deferred pass only, the camera was still at its rest
    // height and every node projected outside the frame.
    frameConnectionBoard();
    // The stage can also finish laying out one frame later (the modal reaches its
    // final height after the HTML is inserted). A short timer catches that pass
    // WITHOUT depending on rAF at all, so a throttled window still converges.
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
 * Give every star of a figure a depth, from where it sits in the figure.
 *
 * The nearest neighbour decides: outline stars (far from every other star) come
 * forward, interior stars sit back, and the range stays inside ±0.4 world units,
 * which is a few percent of the camera distance — enough parallax to read as
 * depth, never enough to distort the figure. Pure data in, data out: the unit
 * test for the scene calls it without a DOM.
 */
function constellationDepths(nodes) {
    const list = Array.isArray(nodes) ? nodes : [];
    const raw = {};
    list.forEach((node, index) => {
        let nearest = Infinity;
        list.forEach((other, otherIndex) => {
            if (otherIndex === index) return;
            nearest = Math.min(nearest, Math.hypot(other.x - node.x, other.y - node.y));
        });
        raw[node.id] = Number.isFinite(nearest) ? nearest : 0;
    });
    const values = list.map(node => raw[node.id]);
    const min = Math.min.apply(null, values.concat([0]));
    const max = Math.max.apply(null, values.concat([1]));
    const span = max - min || 1;
    const out = {};
    list.forEach(node => {
        out[node.id] = 0.8 * ((raw[node.id] - min) / span) - 0.4;
    });
    return out;
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

/**
 * `requestAnimationFrame` that dies with the board.
 *
 * A scene animation still moving when the board closes must not keep a frame
 * loop alive: `unmountThreeStage()` cancels the pending handle, so a closed game
 * leaves no timer and no frame behind.
 */
function connectionFrame(fn) {
    const world = threeWorld;
    if (!world) return;
    world.frameRaf = window.requestAnimationFrame((stamp) => {
        if (!threeWorld || threeWorld !== world) return;
        world.frameRaf = 0;
        fn(stamp);
    });
}
function connectionCancelFrame() {
    const world = threeWorld;
    if (world && world.frameRaf) {
        window.cancelAnimationFrame(world.frameRaf);
        world.frameRaf = 0;
    }
}

/** Push `state.connectionProgress` into the 3D board. */
function applyConnectionWorld(animate) {
    const world = threeWorld;
    if (!world || world.kind !== 'connection' || !world.graph || !threeStageHandle) return;
    const parts = connectionEarnedParts(state.currentGame);
    world.graph.setEarned(threeStageHandle, parts.nodeIds, parts.linkIds, { animate: animate !== false });
}

// ---------- Constellation drop surface (DECISIONS #171) ----------
// The anchor of a star, in percentages of the PICTURE FRAME, captured once the
// board has been framed. The DOM labels sit on these percentages, so a label is
// at its star even when the class resizes the window: CSS re-lays out
// percentages for free, while a projected pixel would have to be recomputed
// every frame (and the shared rAF loop is throttled in a background window).
let constellationAnchors = {};

function connectionStarAnchors() {
    return constellationAnchors;
}

/**
 * Project every star onto the picture frame (percentages), plus its depth.
 *
 * Done with the same camera and the same projection `stagePoint()` uses, AFTER
 * `camera.updateMatrixWorld(true)` — the camera is not a child of the scene, so
 * without that refresh this reads the previous position (the trap documented in
 * `frameConnectionBoard`).
 */
function updateStarAnchors() {
    const world = threeWorld;
    const frame = document.querySelector('[data-constellation-stage]');
    if (!world || world.kind !== 'connection' || !world.graph || !threeStageHandle || !frame) {
        constellationAnchors = {};
        return {};
    }
    const rect = frame.getBoundingClientRect();
    if (!rect.width || !rect.height) {
        constellationAnchors = {};
        return {};
    }
    // The FRAME is the reference box, and only that: the percentages below are
    // read back against the frame (by the labels and by `starAtPoint`). The
    // shared canvas is taller than the frame, so measuring it here shifted every
    // anchor up by (canvas.top - frame.top) px and a drop missed its star.
    const box = rect;
    const handle = threeStageHandle;
    handle.camera.updateMatrixWorld(true);
    // The frame has to be fitted BEFORE projecting, or the anchors are measured
    // against a graph that is still at its default scale.
    fitConnectionGraph();
    const graph = world.graph;
    const out = {};
    for (const id of Object.keys(graph.nodes)) {
        const entry = graph.nodes[id];
        if (!entry) continue;
        // The star sits under the graph group, so its WORLD position is what the
        // screen shows (group scale, offset and the camera lift included).
        const local = entry.root.getWorldPosition(new THREE.Vector3());
        const v = local.clone().project(handle.camera);
        out[id] = {
            left: Math.round(((v.x * 0.5 + 0.5) * box.width + (box.left - rect.left)) / rect.width * 1000) / 10,
            top: Math.round(((-v.y * 0.5 + 0.5) * box.height + (box.top - rect.top)) / rect.height * 1000) / 10,
            // 0 = furthest behind, 1 = nearest: a label drawn here is nudged so a
            // near star's label never sits on a far star's body.
            depth: Math.round(((Number(entry.depth) || 0) + 0.4) / 0.8 * 100) / 100
        };
    }
    constellationAnchors = out;
    return out;
}

/** Screen (client) coordinates of every star, for the DOM connectors. */
function updateConnectionStarPoints() {
    const world = threeWorld;
    const frame = document.querySelector('[data-constellation-stage]');
    if (!world || world.kind !== 'connection' || !world.graph || !threeStageHandle || !frame) {
        return {};
    }
    const handle = threeStageHandle;
    handle.camera.updateMatrixWorld(true);
    fitConnectionGraph();
    const rect = frame.getBoundingClientRect();
    const out = {};
    for (const id of Object.keys(world.graph.nodes)) {
        const entry = world.graph.nodes[id];
        if (!entry) continue;
        const v = entry.root.getWorldPosition(new THREE.Vector3()).project(handle.camera);
        out[id] = { x: rect.left + (v.x * 0.5 + 0.5) * rect.width, y: rect.top + (-v.y * 0.5 + 0.5) * rect.height };
    }
    return out;
}

/** The star whose LABEL (chip) contains a DOM point ('' when none does). */
function connectionChipAtPoint(clientX, clientY) {
    let found = '';
    document.querySelectorAll('[data-star-chip]').forEach(el => {
        if (found) return;
        const r = el.getBoundingClientRect();
        if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) found = el.dataset.starChip || '';
    });
    return found;
}

/**
 * The star the pointer is aiming at, or '' (also with no 3D surface on screen).
 *
 * A drop is resolved in three steps, and the first one that answers wins:
 *
 *   1. the RAYCAST against the star bodies — exact, and it is what makes an aim
 *      at a star feel like a hit rather than a guess;
 *   2. the nearest star whose screen position is within a small hand radius
 *      (~26 px, never more than 3 % of the frame) — a finger is not a ray;
 *   3. nothing.
 *
 * The radius stays small on purpose: a generous one silently hands back the
 * neighbouring star, which is how a wrong answer used to look right.
 */
function starAtPoint(clientX, clientY) {
    // Resolve against the LIVE layout: the anchors and the camera are refreshed
    // here, because a drag can begin while a layout pass is still settling and a
    // hit test against the previous frame answers for a picture that has moved.
    updateStarAnchors();
    const world = threeWorld;
    if (!world || world.kind !== 'connection' || !window.threeGame || !world.graph) return '';
    if (typeof window.threeGame.pick === 'function') {
        // The BODIES, straight from the graph: `sprites` is a convenience list
        // that also exists for other games' factories, and a mesh can end up in it
        // twice (measured: a raycaster answered `null` for a star it had just hit).
        // One entry per star here, and `entry.id` is the id the layer reads.
        const bodies = [];
        Object.keys(world.graph.nodes).forEach(id => {
            const entry = world.graph.nodes[id];
            if (entry && entry.mesh) bodies.push(entry.mesh);
        });
        const hit = window.threeGame.pick(threeStageHandle, clientX, clientY, { targets: bodies });
        if (hit && hit.id) return hit.id;
    }
    const frame = document.querySelector('[data-constellation-stage]');
    if (!frame) return '';
    const rect = frame.getBoundingClientRect();
    if (!rect.width || !rect.height) return '';
    const radius = Math.max(12, Math.min(26, Math.min(rect.width, rect.height) * 0.03));
    const anchors = constellationAnchors || {};
    let best = '';
    let bestDistance = Infinity;
    Object.keys(anchors).forEach(id => {
        const x = rect.left + (anchors[id].left / 100) * rect.width;
        const y = rect.top + (anchors[id].top / 100) * rect.height;
        const d = Math.hypot(clientX - x, clientY - y);
        if (d <= radius && d < bestDistance) {
            best = id;
            bestDistance = d;
        }
    });
    return best;
}

/** The stars this board has already lit, in stage order. */
function constellationStarsEarned(game) {
    const template = connectionTemplateFor(game || state.currentGame);
    const progress = state.connectionProgress || resetConnectionProgress(template);
    const earned = new Set(progress.connectedStageIds);
    return template.stages
        .filter(stage => earned.has(stage.id))
        .map(stage => stage.nodeIds[0])
        .filter(Boolean);
}

/**
 * A glowing star travelling from a card to its target star (DECISIONS #172).
 *
 * The card leaves the tray and becomes a small comet: it starts where the
 * student let go, accelerates toward the star and shrinks as it lands, then
 * hands over to `reactConnectionBoard`'s burst. Driven by the board's own frame
 * (`connectionFrame`), so a closed board cancels it with everything else.
 */
function flyConnectorToStar(fromRect, starId, onArrive) {
    const world = threeWorld;
    const points = updateConnectionStarPoints();
    const target = points[starId];
    if (!world || !target) {
        if (typeof onArrive === 'function') onArrive();
        return;
    }
    const source = fromRect || { left: target.x, top: target.y, width: 0, height: 0 };
    const orb = document.createElement('div');
    orb.className = 'constellation-fly';
    orb.setAttribute('aria-hidden', 'true');
    document.body.appendChild(orb);
    const startX = source.left + source.width / 2;
    const startY = source.top + source.height / 2;
    const lift = Math.min(140, Math.abs(target.y - startY) * 0.5 + 40);
    const duration = 460;
    const t0 = performance.now();
    const step = (now) => {
        if (!threeWorld || threeWorld !== world) {
            orb.remove();
            return;
        }
        const t = Math.min(1, (now - t0) / duration);
        // Ease-in: the comet gathers speed as it nears its target, which reads as
        // being drawn in rather than sliding across.
        const ease = t * t;
        const x = startX + (target.x - startX) * ease;
        const y = startY + (target.y - startY) * ease - Math.sin(t * Math.PI) * lift * 0.35;
        orb.style.transform = 'translate3d(' + Math.round(x) + 'px, ' + Math.round(y) + 'px, 0) scale(' + (1 - 0.45 * t).toFixed(3) + ')';
        orb.style.opacity = String(t < 0.85 ? 1 : 1 - (t - 0.85) / 0.15);
        if (t < 1) {
            connectionFrame(step);
            return;
        }
        orb.remove();
        if (typeof onArrive === 'function') onArrive();
    };
    connectionFrame(step);
}

function reactConnectionBoard(event, detail) {
    const world = threeWorld;
    if (!world || world.kind !== 'connection') return;
    if (event === 'match:correct') {
        // The card has already been resolved; this is the PICTURE catching up.
        // The edge reveals itself inside `setEarned` (a draw-on along each
        // segment), so the only job here is the landing beat on the star.
        applyConnectionWorld(true);
        const stageId = detail && detail.connection ? detail.connection.stageId : null;
        const stage = stageId ? world.template.stages.find(entry => entry.id === stageId) : null;
        const starId = (detail && detail.starId) || (stage && stage.nodeIds.length ? stage.nodeIds[0] : null);
        const entry = starId ? world.graph.nodes[starId] : null;
        if (entry) {
            // A strong but cheap flash: two additive spheres that expand and fade.
            if (window.threeGame.makeGlow && threeStageHandle) {
                const core = window.threeGame.makeGlow({ color: '#ffe9a8', size: 0.34, duration: 0.42 });
                core.group.position.copy(entry.root.position);
                window.threeGame.addObject(threeStageHandle, core.group);
                core.pulse(threeStageHandle);
                connectionLater(() => core.dispose(), 700);
                const ring = window.threeGame.makeGlow({ color: '#f2b24a', size: 0.52, duration: 0.62 });
                ring.group.position.copy(entry.root.position);
                window.threeGame.addObject(threeStageHandle, ring.group);
                ring.pulse(threeStageHandle);
                connectionLater(() => ring.dispose(), 900);
            }
            // The star snaps into place: a quick overshoot, then rest. The
            // landing is the one moment motion is allowed to be loud.
            if (window.threeGame.tween && threeStageHandle) {
                window.threeGame.tween(threeStageHandle, {
                    target: entry.root.scale,
                    from: 1,
                    to: 1.28,
                    duration: 0.16,
                    ease: 'easeOutBack',
                    apply: value => entry.root.scale.setScalar(value)
                });
                connectionLater(() => {
                    if (!threeStageHandle || !window.threeGame.tween) return;
                    window.threeGame.tween(threeStageHandle, {
                        target: entry.root.scale,
                        from: 1.28,
                        to: 1,
                        duration: 0.3,
                        ease: 'easeOutCubic',
                        apply: value => entry.root.scale.setScalar(value)
                    });
                }, 200);
            }
        }
        burstThreeStage('#34d399');
        // Re-project AFTER the change: the newly lit star moved the picture the
        // labels sit on, and a stale anchor puts a label beside the old star.
        updateStarAnchors();
        if (window.threeGame.dolly) {
            window.threeGame.dolly(threeStageHandle, 0.9, 0.26);
            connectionLater(() => window.threeGame.resetDolly(threeStageHandle), 460);
        }
    }
    else if (event === 'match:incorrect') {
        // Quiet on purpose: a short red breath on the whole frame and one shake
        // on the star that was missed. Nothing is removed (the rules of #168
        // hold), and the tray card never left its slot.
        burstThreeStage('#f87171');
        const missedId = detail && detail.starId ? detail.starId : null;
        const missed = missedId ? world.graph.nodes[missedId] : null;
        if (missed && window.threeGame.tween && threeStageHandle) {
            const homeX = missed.root.position.x;
            window.threeGame.tween(threeStageHandle, {
                target: missed.root.position,
                path: 'x',
                from: homeX,
                to: homeX + 0.1,
                duration: 0.08,
                ease: 'easeInOut',
                onComplete: () => {
                    if (!threeStageHandle || !window.threeGame.tween) return;
                    window.threeGame.tween(threeStageHandle, {
                        target: missed.root.position,
                        path: 'x',
                        from: homeX + 0.1,
                        to: homeX,
                        duration: 0.12,
                        ease: 'easeInOut'
                    });
                }
            });
        }
    }
    else if (event === 'game:completed') {
        // The figure is whole: one sweep of light from the first star to the
        // last, a slow push in, then the shared celebration burst.
        const earned = Object.keys(world.graph.nodes || {})
            .map(id => world.graph.nodes[id])
            .filter(entry => entry && entry.earned)
            .sort((a, b) => (a.root.position.y - b.root.position.y) || (a.root.position.x - b.root.position.x));
        earned.forEach((entry, index) => {
            connectionLater(() => {
                if (!threeStageHandle || !window.threeGame || !window.threeGame.makeGlow) return;
                const glow = window.threeGame.makeGlow({ color: '#f2b24a', size: 0.4, duration: 0.6 });
                glow.group.position.copy(entry.root.position);
                window.threeGame.addObject(threeStageHandle, glow.group);
                glow.pulse(threeStageHandle);
                connectionLater(() => glow.dispose(), 900);
            }, index * 90);
        });
        if (window.threeGame.dolly) {
            window.threeGame.dolly(threeStageHandle, 1.6, 0.9);
            connectionLater(() => window.threeGame.resetDolly(threeStageHandle), 2200);
        }
        if (window.threeGame.celebrate) window.threeGame.celebrate(threeStageHandle);
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
