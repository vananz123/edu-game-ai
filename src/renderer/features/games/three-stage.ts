// @ts-nocheck -- 3D stage: mount/unmount, anchors, per-template worlds and reactThree (split from features/gameplay.ts, DECISIONS #147).
// ---------- Three.js presentation (DECISIONS #137) ----------
// Decorative only: the 3D layer never scores and never changes answers. The DOM
// answer buttons stay the single input path; this adds a world-tinted backdrop
// and a particle burst on answer. Machines without WebGL keep the 2D surface.
let threeStageHandle = null;
let threeWorld = null;
// Race fully re-renders its board on every answer (answerRace → renderRaceBoard),
// so a burst fired on the pre-render handle would be unmounted before it shows.
// This flag carries the colour across the re-render so the fresh handle bursts.
let raceAnswerBurst = null;
// The same re-render problem applies to the race celebration: the winning
// answer repaints the board, so the confetti must fire on the fresh handle.
let raceAnswerCelebrate = false;
function unmountThreeStage() {
    if (threeStageHandle && window.threeGame)
        window.threeGame.unmount(threeStageHandle);
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
    // only fight it (DECISIONS #142).
    threeStageHandle = window.threeGame.mount(stage, { accent, emblem: !isHouseMode(state.currentGame) });
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
