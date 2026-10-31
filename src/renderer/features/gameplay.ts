// @ts-nocheck -- migrated legacy UI logic; new contracts are typed in src/shared/types.ts.
function playGame(game, options = {}) {
    stopPresentationMode();
    // A LAN room belongs to one playing of one game: opening another game must not
    // leave the old room answering new questions (features/lan.js).
    if (typeof lanReleaseForNewGame === 'function')
        lanReleaseForNewGame();
    state.playStartedAt = Date.now();
    state.resultSession = null;
    state.lastSummary = null;
    const wantsFullscreen = Boolean(options && options.fullscreen);
    const enterFullscreen = () => {
        if (wantsFullscreen)
            setPlayFullscreen(true);
    };
    if (game && game.template === 'matching') {
        const matching = game.matchingGame;
        if (!matching || !Array.isArray(matching.pairs) || matching.pairs.length < 2) {
            toast('Trò chơi ghép cặp chưa có dữ liệu cặp. Hãy chỉnh sửa và lưu lại.');
            return false;
        }
        state.currentGame = game;
        state.gameAnswers = [];
        state.matchingPlay = null;
        state.memoryCards = [];
        enterFullscreen();
        openMatchingPlay();
        return true;
    }
    if (game && game.template === 'treasure-hunt') {
        const hunt = game.treasureHunt;
        if (!hunt || !Array.isArray(hunt.stages) || hunt.stages.length < 1 || !hunt.stages[0]?.question) {
            toast('Hành trình chưa có chặng. Hãy chỉnh sửa và lưu lại.');
            return false;
        }
        state.currentGame = game;
        enterFullscreen();
        openTreasurePlay();
        return true;
    }
    if (game && game.template === 'race') {
        const race = game.race;
        if (!race || !Array.isArray(race.teams) || race.teams.length < 2 || !Array.isArray(race.questions) || !race.questions.length) {
            toast('Đường đua chưa đủ dữ liệu (đội hoặc câu hỏi). Hãy chỉnh sửa và lưu lại.');
            return false;
        }
        state.currentGame = game;
        enterFullscreen();
        openRacePlay();
        return true;
    }
    if (!game || !game.questions?.length) {
        toast('Trò chơi chưa có câu hỏi.');
        return false;
    }
    state.currentGame = game;
    state.gameIndex = 0;
    state.gameAnswers = [];
    state.gameStart = Date.now();
    state.answerLocked = false;
    state.scenarioSteps = 0;
    state.teamPlay = null;
    state.houseBuild = null;
    if (isHouseMode(game))
        state.houseBuild = houseCreate();
    enterFullscreen();
    if (game.gameSetup?.scoringMode === 'thi đấu đội') {
        openTeamSetup();
    }
    else {
        openPlayModal();
    }
    return true;
}
/** Read display info from the main process; null means unknown (treat as one screen). */
async function getDisplayInfo() {
    const eduGame = window.eduGame;
    if (!eduGame || typeof eduGame.getDisplays !== 'function')
        return null;
    try {
        const result = await eduGame.getDisplays();
        if (!result || !result.ok || !result.data)
            return null;
        return result.data;
    }
    catch {
        return null;
    }
}
/** True when a projector/secondary display is available. */
function hasSecondaryDisplay(data) {
    return Boolean(data && Array.isArray(data.displays) && data.displays.some((display) => !display.primary));
}
/**
 * Card-level fullscreen action:
 * - one screen: native fullscreen + the existing play modal;
 * - two or more: control the game in the main window and mirror it on the projector.
 */
async function playGameFullscreen(game) {
    if (!game)
        return playGame(game);
    const displays = await getDisplayInfo();
    if (hasSecondaryDisplay(displays)) {
        if (!playGame(game))
            return false;
        const started = await startPresentationMode();
        if (started)
            return true;
        setPlayFullscreen(true);
        toast('Không mở được trình chiếu; đã chuyển sang toàn màn hình trên màn hình chính.', 5000);
        return true;
    }
    return playGame(game, { fullscreen: true });
}
// ---------- Toàn màn hình khi trình chiếu ----------
// The native window state is authoritative: main sends it back through
// onFullscreenChanged, so the flag only reflects what really happened.
async function setPlayFullscreen(enabled) {
    try {
        const result = await window.eduGame.setFullscreen(Boolean(enabled));
        if (result && result.ok)
            return true;
    }
    catch (error) { }
    toast('Không đổi được chế độ toàn màn hình. Hãy thử lại.', 5000);
    return false;
}
if (window.eduGame && typeof window.eduGame.onFullscreenChanged === 'function') {
    window.eduGame.onFullscreenChanged((enabled) => {
        document.documentElement.dataset.fullscreen = enabled ? '1' : '0';
    });
}
// Leaving the play surface must also release the window back to normal size.
function closePlaySurface() {
    // `data-fullscreen` is updated by the main process.  Do not send a second
    // native fullscreen request for an ordinary modal close: it adds a visible
    // flicker on classroom projectors.
    if (document.documentElement.dataset.fullscreen === '1')
        setPlayFullscreen(false);
    stopPresentationMode();
    unmountThreeStage();
    $('#modalRoot').innerHTML = '';
}
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
// ---------- House Building Mode (DECISIONS #140, revised #141) ----------
// Quiz-only alternate mode: the house starts with only its foundation. Each correct
// answer adds one cube-built part; each wrong answer removes one (never below the
// foundation). Scoring stays in game-engine/runtime.ts. Classic mode (the default,
// and the only mode for the other four games) is untouched.
function isHouseMode(game) {
    const g = game || state.currentGame;
    return Boolean(g && g.template === 'quiz' && g.gameSetup && g.gameSetup.gameplayMode === 'house');
}
function houseState() {
    return state.houseBuild || houseCreate();
}
function houseProgressHtml() {
    const max = houseTargetParts(state.currentGame);
    const sum = houseSummary(houseState(), max);
    const pct = max ? Math.round(sum.parts / max * 100) : 0;
    const hint = sum.completed ? 'Ngôi nhà đã hoàn thiện! 🎉' : `Còn ${sum.remaining} phần nữa để hoàn thiện`;
    return `<div class="house-progress"><div class="house-progress-head"><span class="house-progress-title">🏗️ CHẾ ĐỘ XÂY NHÀ</span><span class="house-count">Đã xây <b>${sum.parts}</b>/${max} phần</span></div><div class="house-bar"><div class="house-bar-fill" data-progress="${pct}"></div></div><div class="house-materials">${hint}</div></div>`;
}
// The answer changes the part count and the 3D house immediately; refresh the
// panel in place so the counter and the bar move on the same beat (the panel is
// otherwise only rebuilt by renderQuestion on the next question).
function paintHouseProgress() {
    const panel = $('.house-progress');
    if (!panel)
        return;
    const max = houseTargetParts(state.currentGame);
    const sum = houseSummary(houseState(), max);
    const pct = max ? Math.round(sum.parts / max * 100) : 0;
    const count = $('.house-count', panel);
    if (count)
        count.innerHTML = `Đã xây <b>${sum.parts}</b>/${max} phần`;
    const fill = $('.house-bar-fill', panel);
    if (fill)
        fill.dataset.progress = String(pct);
    const hint = $('.house-materials', panel);
    if (hint)
        hint.textContent = sum.completed ? 'Ngôi nhà đã hoàn thiện! 🎉' : `Còn ${sum.remaining} phần nữa để hoàn thiện`;
    paintProgress(panel);
}
// The house is built from cubes (blocky, "stacked blocks") plus a big front door,
// two windows and a little decoration (tree, bush, path). Stage 0 is the foundation
// and is always visible — the "partially built" starting point. The eight buildable
// stages are added one at a time on a correct answer and removed one at a time on a
// wrong answer. How many parts a game needs is `houseTargetParts()` (the question
// count, capped at these eight stages), and `houseVisualStages()` maps a part back
// to the stage index, so a short quiz still reaches the full model (DECISIONS #143).
//
// Every style in `houseParts(style)` keeps that same nine-stage layout so the
// economy and the target mapping are style-independent; only the block model
// changes (DECISIONS #144). `houseStyleFor()` picks the model.
function houseRing(y, color, cube = 0.7, spread = 1.05) {
    const specs = [];
    const xs = [-spread, -spread / 3, spread / 3, spread];
    xs.forEach(x => {
        specs.push({ kind: 'box', w: cube, h: cube, d: cube, color, x, y, z: -cube });
        specs.push({ kind: 'box', w: cube, h: cube, d: cube, color, x, y, z: cube });
    });
    [-spread, spread].forEach(x => {
        specs.push({ kind: 'box', w: cube, h: cube, d: cube, color, x, y, z: 0 });
    });
    return specs;
}
function houseStyleForCurrentGame() {
    const game = state.currentGame;
    return houseStyleFor(game && game.gameSetup ? game.gameSetup.houseStyle : '', game && game.id);
}
// Classic: warm plaster walls, red blocky roof, brick chimney, a tree and a path.
function houseClassicParts() {
    return [
        // 0 — foundation (always present)
        [
            { kind: 'box', w: 3.1, h: 0.2, d: 2.3, color: 0x8d99ae, x: 0, y: 0.1, z: 0 }
        ],
        // 1 — bottom cube ring
        houseRing(0.55, 0xd4a373),
        // 2 — big front door
        [
            { kind: 'box', w: 0.72, h: 1.2, d: 0.16, color: 0x6b4f3a, x: 0, y: 0.8, z: 1.08 },
            { kind: 'box', w: 0.16, h: 0.16, d: 0.08, color: 0xe0b070, x: 0.22, y: 0.68, z: 1.14 }
        ],
        // 3 — second cube ring
        houseRing(1.25, 0xd4a373),
        // 4 — two windows
        [
            { kind: 'box', w: 0.5, h: 0.5, d: 0.12, color: 0xa8dadc, x: -0.6, y: 1.25, z: 1.08 },
            { kind: 'box', w: 0.5, h: 0.5, d: 0.12, color: 0xa8dadc, x: 0.6, y: 1.25, z: 1.08 }
        ],
        // 5 — third cube ring
        houseRing(1.95, 0xe6b98a),
        // 6 — blocky roof
        [
            { kind: 'box', w: 3.05, h: 0.24, d: 2.35, color: 0xc05c48, x: 0, y: 2.42, z: 0 },
            { kind: 'box', w: 2.1, h: 0.24, d: 1.5, color: 0xc05c48, x: 0, y: 2.66, z: 0 }
        ],
        // 7 — chimney
        [
            { kind: 'box', w: 0.42, h: 0.7, d: 0.42, color: 0x8d5524, x: 0.8, y: 2.75, z: -0.4 }
        ],
        // 8 — decoration: tree, bush, path
        [
            { kind: 'box', w: 0.16, h: 0.6, d: 0.16, color: 0x7f5539, x: -1.95, y: 0.4, z: 0.5 },
            { kind: 'box', w: 0.7, h: 0.7, d: 0.7, color: 0x6a994e, x: -1.95, y: 1.0, z: 0.5 },
            { kind: 'box', w: 0.42, h: 0.42, d: 0.42, color: 0x8ab17d, x: 1.75, y: 0.35, z: 0.6 },
            { kind: 'box', w: 0.9, h: 0.06, d: 0.5, color: 0xb08968, x: 0, y: 0.23, z: 1.5 }
        ]
    ];
}
// Garden cottage: cream walls, green roof, veranda and a picket fence.
function houseGardenParts() {
    const wall = 0xf2e6cc, wallLight = 0xf7efd8, green = 0x4f8a5b;
    return [
        // 0 — mossy garden foundation
        [
            { kind: 'box', w: 3.5, h: 0.2, d: 2.6, color: 0x8fae9b, x: 0, y: 0.1, z: 0 }
        ],
        // 1 — ground floor
        houseRing(0.52, wall, 0.64, 0.95),
        // 2 — teal door with a step
        [
            { kind: 'box', w: 0.64, h: 1.1, d: 0.14, color: 0x2f7d6d, x: -0.18, y: 0.74, z: 1.02 },
            { kind: 'box', w: 0.14, h: 0.14, d: 0.08, color: 0xe0b070, x: 0.06, y: 0.62, z: 1.1 },
            { kind: 'box', w: 0.9, h: 0.08, d: 0.34, color: 0xc9b99a, x: -0.18, y: 0.16, z: 1.2 }
        ],
        // 3 — upper floor
        houseRing(1.16, wallLight, 0.64, 0.95),
        // 4 — windows with green shutters
        [
            { kind: 'box', w: 0.46, h: 0.46, d: 0.12, color: 0xa8dadc, x: -0.52, y: 1.18, z: 1.02 },
            { kind: 'box', w: 0.46, h: 0.46, d: 0.12, color: 0xa8dadc, x: 0.52, y: 1.18, z: 1.02 },
            { kind: 'box', w: 0.1, h: 0.5, d: 0.1, color: green, x: -0.83, y: 1.18, z: 1.02 },
            { kind: 'box', w: 0.1, h: 0.5, d: 0.1, color: green, x: 0.83, y: 1.18, z: 1.02 }
        ],
        // 5 — veranda canopy on two posts
        [
            { kind: 'box', w: 2.1, h: 0.14, d: 0.92, color: green, x: 0, y: 1.66, z: 1.1 },
            { kind: 'box', w: 0.12, h: 0.92, d: 0.12, color: 0xe6dcc3, x: -0.88, y: 1.08, z: 1.42 },
            { kind: 'box', w: 0.12, h: 0.92, d: 0.12, color: 0xe6dcc3, x: 0.88, y: 1.08, z: 1.42 }
        ],
        // 6 — green roof, two blocky layers
        [
            { kind: 'box', w: 3.0, h: 0.24, d: 2.15, color: green, x: 0, y: 1.78, z: 0 },
            { kind: 'box', w: 1.95, h: 0.24, d: 1.45, color: 0x3f6b4a, x: 0, y: 2.02, z: 0 }
        ],
        // 7 — dormer window on the roof
        [
            { kind: 'box', w: 0.72, h: 0.5, d: 0.55, color: wallLight, x: 0.32, y: 2.16, z: 0.1 },
            { kind: 'box', w: 0.95, h: 0.14, d: 0.8, color: 0x3f6b4a, x: 0.32, y: 2.47, z: 0.1 }
        ],
        // 8 — picket fence, flowers, bush and a stone path
        [
            { kind: 'box', w: 0.08, h: 0.5, d: 0.08, color: wall, x: -2.0, y: 0.33, z: 0.9 },
            { kind: 'box', w: 0.08, h: 0.5, d: 0.08, color: wall, x: -1.7, y: 0.33, z: 1.1 },
            { kind: 'box', w: 0.08, h: 0.5, d: 0.08, color: wall, x: 1.7, y: 0.33, z: 1.1 },
            { kind: 'box', w: 0.08, h: 0.5, d: 0.08, color: wall, x: 2.0, y: 0.33, z: 0.9 },
            { kind: 'box', w: 0.18, h: 0.18, d: 0.18, color: 0xe4572e, x: -1.55, y: 0.28, z: 0.6 },
            { kind: 'box', w: 0.18, h: 0.18, d: 0.18, color: 0xe8b23a, x: -1.25, y: 0.25, z: 0.55 },
            { kind: 'box', w: 0.5, h: 0.4, d: 0.5, color: 0x6a994e, x: 1.45, y: 0.35, z: 0.55 },
            { kind: 'box', w: 0.9, h: 0.06, d: 0.5, color: 0xb08968, x: -0.18, y: 0.21, z: 1.7 }
        ]
    ];
}
// Watchtower: a narrow stone shaft, widened lookout ring, slate spire and a flag.
function houseTowerParts() {
    const stone = 0xa8b0ba, stoneDark = 0x98a2ae;
    return [
        // 0 — stone base
        [
            { kind: 'box', w: 3.0, h: 0.24, d: 2.2, color: 0x7c8794, x: 0, y: 0.12, z: 0 }
        ],
        // 1 — lower shaft
        houseRing(0.5, stone, 0.58, 0.66),
        // 2 — heavy door with lintel
        [
            { kind: 'box', w: 0.6, h: 1.02, d: 0.14, color: 0x5a4630, x: 0, y: 0.66, z: 0.72 },
            { kind: 'box', w: 0.16, h: 0.16, d: 0.08, color: 0xc9a227, x: 0.18, y: 0.6, z: 0.79 },
            { kind: 'box', w: 0.84, h: 0.14, d: 0.2, color: 0x6f7b87, x: 0, y: 1.22, z: 0.72 }
        ],
        // 3 — middle shaft
        houseRing(1.02, stoneDark, 0.58, 0.66),
        // 4 — arrow slits
        [
            { kind: 'box', w: 0.14, h: 0.42, d: 0.1, color: 0x2c3440, x: -0.38, y: 1.02, z: 0.72 },
            { kind: 'box', w: 0.14, h: 0.42, d: 0.1, color: 0x2c3440, x: 0.38, y: 1.02, z: 0.72 }
        ],
        // 5 — lookout ring, wider than the shaft
        houseRing(1.58, 0x8d98a5, 0.58, 0.95),
        // 6 — slate spire, shrinking block layers
        [
            { kind: 'box', w: 2.7, h: 0.18, d: 2.0, color: 0x4a6fa5, x: 0, y: 1.94, z: 0 },
            { kind: 'box', w: 2.0, h: 0.18, d: 1.45, color: 0x4a6fa5, x: 0, y: 2.12, z: 0 },
            { kind: 'box', w: 1.25, h: 0.18, d: 0.9, color: 0x3f5f8c, x: 0, y: 2.3, z: 0 },
            { kind: 'box', w: 0.5, h: 0.2, d: 0.4, color: 0x3f5f8c, x: 0, y: 2.49, z: 0 }
        ],
        // 7 — flag pole and pennant
        [
            { kind: 'box', w: 0.07, h: 0.55, d: 0.07, color: 0x5b6472, x: 0, y: 2.85, z: 0 },
            { kind: 'box', w: 0.48, h: 0.28, d: 0.06, color: 0xe4572e, x: 0.27, y: 3.0, z: 0 }
        ],
        // 8 — rocks and a pine
        [
            { kind: 'box', w: 0.55, h: 0.3, d: 0.55, color: 0x8a8f98, x: -1.25, y: 0.27, z: 0.55 },
            { kind: 'box', w: 0.35, h: 0.3, d: 0.35, color: 0x9aa0a8, x: -1.62, y: 0.27, z: 0.85 },
            { kind: 'box', w: 0.14, h: 0.5, d: 0.14, color: 0x7f5539, x: 1.3, y: 0.37, z: 0.5 },
            { kind: 'box', w: 0.6, h: 0.5, d: 0.6, color: 0x3f6b4a, x: 1.3, y: 0.85, z: 0.5 },
            { kind: 'box', w: 0.4, h: 0.4, d: 0.4, color: 0x4f8a5b, x: 1.3, y: 1.3, z: 0.5 }
        ]
    ];
}
// Log cabin: stacked log rings, warm windows with bars, dark green roof, pines.
function houseCabinParts() {
    const log = 0x8b5a2b, logLight = 0x9c6b3a, logTop = 0xa4713f;
    return [
        // 0 — stone footing
        [
            { kind: 'box', w: 3.2, h: 0.2, d: 2.4, color: 0x8b8d8a, x: 0, y: 0.1, z: 0 }
        ],
        // 1 — lower logs
        houseRing(0.55, logLight, 0.72, 1.05),
        // 2 — plank door with a threshold
        [
            { kind: 'box', w: 0.78, h: 1.2, d: 0.16, color: 0x5a3a22, x: 0, y: 0.82, z: 1.1 },
            { kind: 'box', w: 0.12, h: 0.12, d: 0.08, color: 0xc9a227, x: 0.24, y: 0.7, z: 1.18 },
            { kind: 'box', w: 1.0, h: 0.08, d: 0.3, color: 0x6f6f6b, x: 0, y: 0.16, z: 1.25 }
        ],
        // 3 — middle logs
        houseRing(1.3, log, 0.72, 1.05),
        // 4 — warm windows with cross bars
        [
            { kind: 'box', w: 0.5, h: 0.5, d: 0.12, color: 0xffd27f, x: -0.62, y: 1.3, z: 1.1 },
            { kind: 'box', w: 0.5, h: 0.5, d: 0.12, color: 0xffd27f, x: 0.62, y: 1.3, z: 1.1 },
            { kind: 'box', w: 0.06, h: 0.52, d: 0.14, color: 0x5a3a22, x: -0.62, y: 1.3, z: 1.12 },
            { kind: 'box', w: 0.52, h: 0.06, d: 0.14, color: 0x5a3a22, x: -0.62, y: 1.3, z: 1.12 },
            { kind: 'box', w: 0.06, h: 0.52, d: 0.14, color: 0x5a3a22, x: 0.62, y: 1.3, z: 1.12 },
            { kind: 'box', w: 0.52, h: 0.06, d: 0.14, color: 0x5a3a22, x: 0.62, y: 1.3, z: 1.12 }
        ],
        // 5 — top logs
        houseRing(2.05, logTop, 0.72, 1.05),
        // 6 — deep green roof
        [
            { kind: 'box', w: 3.15, h: 0.24, d: 2.4, color: 0x3f6b4a, x: 0, y: 2.53, z: 0 },
            { kind: 'box', w: 2.15, h: 0.24, d: 1.55, color: 0x355a3e, x: 0, y: 2.77, z: 0 }
        ],
        // 7 — stone chimney
        [
            { kind: 'box', w: 0.5, h: 0.7, d: 0.5, color: 0x7d7d7d, x: 0.9, y: 2.8, z: -0.45 }
        ],
        // 8 — pines, firewood and a trail
        [
            { kind: 'box', w: 0.16, h: 0.55, d: 0.16, color: 0x7f5539, x: -1.95, y: 0.38, z: 0.4 },
            { kind: 'box', w: 0.66, h: 0.55, d: 0.66, color: 0x355a3e, x: -1.95, y: 0.93, z: 0.4 },
            { kind: 'box', w: 0.44, h: 0.44, d: 0.44, color: 0x4f8a5b, x: -1.95, y: 1.42, z: 0.4 },
            { kind: 'box', w: 0.7, h: 0.3, d: 0.4, color: 0x6b4a2b, x: 1.75, y: 0.3, z: 0.55 },
            { kind: 'box', w: 0.9, h: 0.06, d: 0.5, color: 0xb08968, x: 0, y: 0.21, z: 1.6 }
        ]
    ];
}
function houseParts(style) {
    const id = houseStyleFor(style, '');
    if (id === 'nha-vuon') return houseGardenParts();
    if (id === 'thap-canh') return houseTowerParts();
    if (id === 'nha-go') return houseCabinParts();
    return houseClassicParts();
}
function houseMaxParts() {
    return houseParts().length - 1;
}
// How many buildable parts this game must earn. One per question, so a quiz of
// five questions is a five-part house and all-correct still finishes it; longer
// quizzes stop at the visual maximum (eight) and complete once eight net parts
// are standing (DECISIONS #143).
function houseTargetParts(game) {
    const questions = game && Array.isArray(game.questions) ? game.questions.length : 0;
    return Math.max(1, Math.min(houseMaxParts(), questions || 1));
}
// A part can cover more than one visual stage on a short quiz (five questions over
// eight stages), so the full model still appears exactly when the last part lands.
// Ceil keeps the reveal monotonic and front-loaded: the first correct answer always
// changes the house.
function houseVisualStages(parts, target) {
    const max = houseMaxParts();
    const t = Math.max(1, Math.min(max, Math.round(Number(target) || 0)));
    const p = Math.max(0, Math.min(t, Math.round(Number(parts) || 0)));
    return Math.ceil(max * p / t);
}
// Measured envelope of each model (width × height in world units). Placement sizes
// the house from the pixel box it has to fill, so the envelope must follow the
// style: the tower is narrow and tall, the cottage is low and wide (#144).
const HOUSE_BOUNDS = {
    'nha-mai-do': { w: 4.3, h: 3.2 },
    'nha-vuon': { w: 4.1, h: 2.7 },
    'thap-canh': { w: 3.5, h: 3.2 },
    'nha-go': { w: 4.4, h: 3.2 }
};
const HOUSE_SLOT_FILL = 0.92;
function houseBounds(style) {
    return HOUSE_BOUNDS[style] || HOUSE_BOUNDS['nha-mai-do'];
}
// The house is ~2.3 units deep and the camera is close, so its near corners
// project well outside the plane the target is centred on. Filling the whole
// band made the roof reach the HUD and the base slide under the banner
// (measured 1600x1000); 0.78 keeps ~10px of air on both sides.
const HOUSE_SHOWCASE_FILL = 0.78;
// The result hero has a caption directly under its slot, and garden props make the
// measured box asymmetric, so the house needs more air there than the invisible
// answer-phase slot does (#144).
const HOUSE_RESULT_FILL = 0.8;
// Screen-space target for the 3D house. The WebGL canvas covers the whole
// stage, so the only reliable way to line the house up with the DOM is to
// project the reserved slot (answer phase) or the stage centre (showcase)
// through the camera. DECISIONS #142.
function houseTarget() {
    if (!threeStageHandle || !window.threeGame || !window.threeGame.stagePoint)
        return null;
    const stage = threeStageHandle.container.getBoundingClientRect();
    if (!stage.width || !stage.height)
        return null;
    const showcase = Boolean($('.game-stage.is-house-showcase'));
    let fx, fy, widthPx, heightPx, fill;
    if (showcase) {
        // Fit the house into the band the stage actually leaves free: below the
        // score/progress HUD and above the feedback card. A long explanation
        // raises the card, and the house shrinks instead of hiding under it.
        // Measured after `.is-house-showcase` lands, so the card is already
        // anchored to the bottom.
        const hud = $('.house-progress') || $('.stage-progress') || $('.stage-top');
        const hudBox = hud ? hud.getBoundingClientRect() : null;
        const feedback = $('#answerFeedback');
        const feedbackBox = feedback ? feedback.getBoundingClientRect() : null;
        const top = hudBox && hudBox.height ? hudBox.bottom + 4 : stage.top + stage.height * 0.16;
        const bottom = feedbackBox && feedbackBox.height ? feedbackBox.top - 4 : stage.top + stage.height * 0.9;
        const bandTop = (top - stage.top) / stage.height;
        const bandBottom = (bottom - stage.top) / stage.height;
        // Never trade the measured band for a prettier guess: on short windows
        // that put the house behind the HUD or the banner. A degenerate band
        // means the card has not laid out yet; leave the house in its slot.
        if (!(bandBottom - bandTop > 0.02))
            return null;
        fx = 0.5;
        fy = (bandTop + bandBottom) / 2;
        widthPx = stage.width * 0.9;
        heightPx = (bandBottom - bandTop) * stage.height;
        fill = HOUSE_SHOWCASE_FILL;
    }
    else {
        const slot = $('.game-stage .house-stage-slot');
        if (!slot)
            return null;
        const box = slot.getBoundingClientRect();
        if (!box.width || !box.height)
            return null;
        fx = (box.left + box.width / 2 - stage.left) / stage.width;
        fy = (box.top + box.height / 2 - stage.top) / stage.height;
        widthPx = box.width;
        heightPx = box.height;
        fill = $('.result-house-hero') ? HOUSE_RESULT_FILL : HOUSE_SLOT_FILL;
    }
    const point = window.threeGame.stagePoint(threeStageHandle, fx, fy, 0);
    if (!point.pxPerUnit)
        return null;
    const bounds = (threeWorld && threeWorld.bounds) || houseBounds('nha-mai-do');
    const scale = Math.min(heightPx * fill / (bounds.h * point.pxPerUnit), widthPx * 0.92 / (bounds.w * point.pxPerUnit));
    // Part coordinates start at the ground (the foundation slab), so the group
    // origin is the house's base, not its centre. Drop the base half a house so
    // the box straddles the target instead of growing up into the stage header.
    point.y -= bounds.h / 2 * scale;
    return { point, scale };
}
function placeHouse(animate) {
    const world = threeWorld;
    const handle = threeStageHandle;
    if (!world || !world.construction || !handle || !window.threeGame)
        return;
    const target = houseTarget();
    if (!target)
        return;
    const group = world.construction.group;
    if (!animate) {
        group.position.set(target.point.x, target.point.y, target.point.z);
        group.scale.setScalar(target.scale);
        return;
    }
    const from = { x: group.position.x, y: group.position.y, scale: group.scale.x };
    window.threeGame.tween(handle, {
        from: 0,
        to: 1,
        duration: 0.55,
        ease: 'easeOutCubic',
        apply: (v) => {
            // A remount while the tween runs must not move the new world's house.
            if (threeWorld !== world || threeStageHandle !== handle)
                return;
            group.position.set(from.x + (target.point.x - from.x) * v, from.y + (target.point.y - from.y) * v, target.point.z);
            group.scale.setScalar(from.scale + (target.scale - from.scale) * v);
        }
    });
}
let houseRelayoutBound = false;
function buildHouseWorld() {
    if (!threeStageHandle || !window.threeGame)
        return;
    const world = {};
    const style = houseStyleForCurrentGame();
    const construction = window.threeGame.makeConstruction({ parts: houseParts(style) });
    window.threeGame.addObject(threeStageHandle, construction.group, 0, -0.6, -1.2);
    const target = houseTargetParts(state.currentGame);
    const parts = houseSummary(houseState(), target).parts;
    // On the very first question, pop the foundation in as a short introduction.
    const intro = state.gameAnswers.length === 0;
    construction.setStage(threeStageHandle, 1 + houseVisualStages(parts, target), { animate: intro });
    world.construction = construction;
    world.style = style;
    world.bounds = houseBounds(style);
    threeWorld = world;
    // The canvas is still 1x1 until step() runs, so the camera aspect is not
    // final this tick; place on the next two frames instead.
    requestAnimationFrame(() => requestAnimationFrame(() => {
        if (threeWorld === world)
            placeHouse(false);
    }));
    if (!houseRelayoutBound) {
        houseRelayoutBound = true;
        window.addEventListener('resize', () => {
            if (!threeWorld || !threeWorld.construction)
                return;
            // Fullscreen/projector toggles change the visible band too.
            if ($('.game-stage.is-house-showcase'))
                pinShowcaseStage();
            placeHouse(false);
        });
    }
}
// Height the play surface actually shows from the top of the stage to the
// bottom of the modal/window. Hiding the question collapses a content-sized
// stage and the feedback card then stretches it past the viewport (measured
// 957px stage vs 950px modal bottom at 1600x1000), so the showcase freezes the
// stage to the visible area instead of to its current content.
function showcaseStageHeight(stage) {
    const box = stage.getBoundingClientRect();
    const modal = $('.modal');
    const modalBox = modal ? modal.getBoundingClientRect() : null;
    const bottom = Math.min(window.innerHeight, modalBox && modalBox.bottom ? modalBox.bottom : window.innerHeight);
    return Math.max(320, Math.round(bottom - box.top));
}
function pinShowcaseStage() {
    const stage = $('.game-stage');
    if (stage)
        stage.style.minHeight = `${showcaseStageHeight(stage)}px`;
}
// After an answer the house steps forward as the achievement: the question and
// answers leave the stage, the feedback becomes a card under the house and the
// house grows into the free space (DECISIONS #142).
function showcaseHouse() {
    const stage = $('.game-stage');
    if (!stage || !threeWorld || !threeWorld.construction)
        return;
    if (!stage.classList.contains('is-house-showcase')) {
        pinShowcaseStage();
        stage.classList.add('is-house-showcase');
    }
    placeHouse(true);
}
function reactHouse(event, detail) {
    const world = threeWorld;
    const house = detail && detail.house;
    paintHouseProgress();
    if (event === 'answer:correct') {
        burstThreeStage('#34d399');
        if (world && world.construction && house)
            world.construction.setStage(threeStageHandle, 1 + houseVisualStages(house.parts, house.maxParts));
        if (house && house.completedNow && window.threeGame.celebrate)
            window.threeGame.celebrate(threeStageHandle);
    }
    else if (event === 'answer:incorrect') {
        burstThreeStage('#f87171');
        // A wrong answer removes the last-added part (shrink animation on the
        // remaining handle — no remount happens until "next").
        if (world && world.construction && house)
            world.construction.setStage(threeStageHandle, 1 + houseVisualStages(house.parts, house.maxParts));
    }
    else if (event === 'game:completed') {
        if (detail && detail.houseCompleted && window.threeGame.celebrate)
            window.threeGame.celebrate(threeStageHandle);
    }
}
// ---------- Presentation Mode ----------
let presentationRevision = 0;
let presentationStarted = false;
let presentationStarting = false;
let presentationToken = 0;
// ---------- Presentation view builders ----------
function presentationOptions(options) {
    return Array.isArray(options)
        ? options.map(option => ({ id: String(option.id ?? ''), text: String(option.text ?? '') }))
        : [];
}
function buildResultsView() {
    const game = state.currentGame;
    const summary = state.lastSummary || {};
    const template = game?.template || 'quiz';
    const points = Number(summary.points) || 0;
    const max = Number(summary.max) || 0;
    const percent = Number(summary.percent) || 0;
    const rows = [{ label: 'Điểm', value: `${points.toLocaleString('vi-VN')} / ${max.toLocaleString('vi-VN')} (${percent}%)`, highlight: true }];
    if (template === 'matching') {
        const matching = game?.matchingGame;
        const play = state.matchingPlay;
        rows.push({ label: 'Cặp đã ghép', value: `${play?.matched ?? 0}/${matching?.pairs?.length ?? 0}` });
        rows.push({ label: 'Lần sai', value: `${play?.wrong ?? 0}` });
    }
    else if (template === 'treasure-hunt') {
        const hunt = game?.treasureHunt;
        const play = state.treasurePlay;
        rows.push({ label: 'Chặng đúng', value: `${(play?.results || []).filter(result => result.correct).length}/${hunt?.stages?.length ?? 0}` });
        rows.push({ label: 'Vật phẩm ẩn', value: `${Object.keys(play?.itemsFound || {}).length}` });
    }
    else if (template === 'race') {
        const play = state.racePlay;
        const race = game?.race;
        const sorted = (play?.teams || []).slice().sort((a, b) => b.progress - a.progress || b.points - a.points);
        sorted.forEach((team, index) => {
            rows.push({
                label: `${index + 1}. ${team.icon || ''} ${team.name}`.trim(),
                value: `Ô ${team.progress}/${race?.trackLength ?? 0} · ${team.points} điểm`,
                highlight: index === 0,
            });
        });
        if (summary.winner)
            rows.push({ label: 'Đội thắng', value: summary.winner, highlight: true });
    }
    else {
        rows.push({ label: 'Số câu đúng', value: `${summary.correct ?? 0}/${summary.total ?? 0}` });
    }
    const medal = template === 'race' ? '🏁' : percent >= 80 ? '🏆' : percent >= 50 ? '🎖️' : '🌱';
    return {
        kind: 'results',
        title: template === 'race' && summary.winner
            ? `${summary.winner} chiến thắng!`
            : percent >= 80 ? 'Xuất sắc!' : percent >= 50 ? 'Làm tốt lắm!' : 'Tiếp tục cố gắng!',
        subtitle: game?.title || '',
        medal,
        scoreText: `${points.toLocaleString('vi-VN')} điểm`,
        rows,
        message: 'Trò chơi đã kết thúc.',
    };
}
function buildQuizView() {
    const game = state.currentGame;
    if (!game)
        return null;
    const questions = game.questions || [];
    const q = questions[Math.min(state.gameIndex || 0, Math.max(questions.length - 1, 0))];
    if (!q)
        return null;
    const answers = state.gameAnswers || [];
    const last = answers[answers.length - 1];
    const answered = Boolean(last && last.questionId === q.id);
    const team = state.teamPlay ? state.teamPlay.teams[state.teamPlay.turn] : null;
    return {
        kind: 'quiz',
        prompt: String(q.prompt || ''),
        context: String(q.context || ''),
        type: String(q.type || 'quiz'),
        options: presentationOptions(q.options),
        selectedOptionId: answered ? last.selectedOptionId ?? null : null,
        correctOptionId: answered ? q.correctOptionId : undefined,
        answerText: answered ? String(last.answerText ?? '') : '',
        correctAnswer: answered ? String(q.correctAnswer ?? '') : '',
        revealed: answered,
        explanation: answered ? String(q.explanation || '') : '',
        teamTurn: team ? `${team.icon || ''} ${team.name || ''}`.trim() : '',
        progressLabel: `Câu ${Math.min((state.gameIndex || 0) + 1, questions.length)} / ${questions.length}`,
    };
}
function buildMatchingView() {
    const game = state.currentGame;
    const matching = game?.matchingGame;
    const play = state.matchingPlay;
    if (!matching || !play)
        return null;
    const matchedIds = [...new Set($$('#playBody .match-card.matched, #playBody [data-category-card].matched, #playBody .memory-card.matched')
            .map(el => el.dataset.pair)
            .filter(Boolean))];
    const selected = $('#playBody .match-card.selected, #playBody [data-category-card].selected, #playBody .memory-card.flipped');
    const memoryCards = $$('#playBody .memory-card').map((el, index) => ({
        index,
        pairId: el.dataset.pair || '',
        text: el.querySelector('.memory-face')?.textContent || '?',
        matched: el.classList.contains('matched'),
        flipped: el.classList.contains('flipped'),
    }));
    const categoryGroups = $$('#playBody .group-box').map(box => ({
        name: box.dataset.group || '',
        items: $$('.group-chip', box).map(chip => chip.textContent || ''),
    }));
    return {
        kind: 'matching',
        mode: ['columns', 'memory', 'categorize'].includes(matching.mode) ? matching.mode : 'columns',
        pairs: (matching.pairs || []).map(pair => ({ id: String(pair.id), left: String(pair.left), right: String(pair.right) })),
        matchedIds,
        matched: play.matched || 0,
        total: (matching.pairs || []).length,
        wrong: play.wrong || 0,
        selectedPairId: selected ? selected.dataset.pair || null : null,
        memoryCards,
        categoryGroups,
    };
}
function buildTreasureMission(stage, missionType) {
    if (!stage)
        return undefined;
    if (missionType === 'matching') {
        return {
            type: 'matching',
            instruction: treasureMissionMeta[missionType]?.short || '',
            pairs: (stage.mission?.pairs || []).map(pair => ({ id: String(pair.id), left: String(pair.left), right: String(pair.right) })),
            matchedIds: $$('#playBody [data-match-left].matched').map(el => el.dataset.matchLeft).filter(Boolean),
        };
    }
    if (missionType === 'classification') {
        const groups = (stage.mission?.groups || []).map(group => ({ id: String(group.id), name: String(group.name) }));
        const items = (stage.mission?.items || []).map(item => {
            const el = $$('#playBody [data-class-item]').find(entry => entry.dataset.classItem === String(item.id));
            const groupEl = el?.closest('[data-class-group]');
            return { id: String(item.id), text: String(item.text), groupId: groupEl?.dataset.classGroup || '' };
        });
        return {
            type: 'classification',
            instruction: treasureMissionMeta[missionType]?.short || '',
            groups,
            items,
        };
    }
    if (missionType === 'decode') {
        const cipher = stage.mission?.cipher || treasureScrambleAnswer(stage.mission?.answer);
        return {
            type: 'decode',
            instruction: treasureMissionMeta[missionType]?.short || '',
            cipher: String(cipher || ''),
        };
    }
    return { type: 'question', options: presentationOptions(stage.question?.options) };
}
function buildTreasureView() {
    const game = state.currentGame;
    const hunt = game?.treasureHunt;
    const play = state.treasurePlay;
    if (!hunt || !play)
        return null;
    const stages = (hunt.stages || []).map((stage, index) => ({
        id: String(stage.id),
        name: String(stage.name || `Chặng ${index + 1}`),
        status: treasureNodeState(stage.id, play),
    }));
    const stage = play.stageId ? treasureStageById(play.stageId) : null;
    const missionType = stage ? treasureMissionTypeOf(stage) : '';
    const result = (play.results || []).find(entry => entry.stageId === play.stageId);
    const revealed = Boolean(result) || Boolean(play.answered);
    return {
        kind: 'treasure',
        character: String(hunt.character || ''),
        stages,
        currentStageId: play.stageId,
        stageName: stage ? String(stage.name || '') : '',
        prompt: stage ? String(stage.question?.prompt || '') : '',
        story: stage ? String(stage.story || '') : '',
        taskDescription: stage ? String(stage.taskDescription || '') : '',
        missionType,
        mission: buildTreasureMission(stage, missionType),
        options: presentationOptions(stage?.question?.options),
        selectedOptionId: play.lastSelectedOptionId || null,
        correctOptionId: revealed ? stage?.question?.correctOptionId : undefined,
        revealed,
        explanation: revealed ? String(stage?.question?.explanation || '') : '',
        earned: Number(play.earned) || 0,
        itemsFound: Object.keys(play.itemsFound || {}).length,
        totalStages: (hunt.stages || []).length,
    };
}
function buildRaceView() {
    const game = state.currentGame;
    const race = game?.race;
    const play = state.racePlay;
    if (!race || !play)
        return null;
    const active = play.teams?.[play.turn];
    return {
        kind: 'race',
        teams: (play.teams || []).map(team => ({
            id: String(team.id),
            name: String(team.name),
            icon: String(team.icon || ''),
            progress: Number(team.progress) || 1,
            points: Number(team.points) || 0,
            active: team.id === active?.id,
        })),
        trackLength: Number(race.trackLength) || 30,
        round: Number(play.round) || 1,
        maxRounds: Number(race.maxRounds) || 10,
        currentTeamName: active ? String(active.name) : '',
        currentTeamIcon: active ? String(active.icon || '') : '',
        prompt: play.currentQ ? String(play.currentQ.prompt || '') : '',
        options: presentationOptions(play.currentQ?.options),
        lastEvent: String(play.lastEvent || ''),
        winnerName: play.winnerId ? String(play.teams.find(team => team.id === play.winnerId)?.name || '') : '',
        completed: Boolean(play.over),
    };
}
function buildPresentationView(extra = {}) {
    if (!state.currentGame)
        return null;
    if (extra.isComplete || state.lastSummary)
        return buildResultsView();
    const template = state.currentGame.template || 'quiz';
    if (template === 'matching')
        return buildMatchingView();
    if (template === 'treasure-hunt')
        return buildTreasureView();
    if (template === 'race')
        return buildRaceView();
    return buildQuizView();
}
/** Build a PresentationState snapshot from current renderer state. */
function buildPresentationState(extra = {}) {
    const game = state.currentGame;
    if (!game)
        return null;
    const answers = state.gameAnswers || [];
    const last = answers[answers.length - 1];
    const score = state.lastSummary || (last ? { points: last.points, max: 0, percent: 0, correct: last.correct ? 1 : 0, total: 1 } : undefined);
    const timer = state.gameStart ? Math.max(0, Math.round((Date.now() - state.gameStart) / 1000)) : 0;
    presentationRevision += 1;
    return {
        sessionId: `sess_${state.playStartedAt || Date.now()}`,
        gameId: game.id,
        gameTitle: game.title,
        template: game.template || 'quiz',
        gameIndex: state.gameIndex,
        gameAnswers: answers.map(a => a.selectedOptionId ?? a.answerText ?? ''),
        score,
        timer,
        isComplete: extra.isComplete || false,
        revision: presentationRevision,
        view: buildPresentationView(extra),
        ...extra,
    };
}
/** Send current presentation state to an already-open presentation window. */
function sendPresentationState(extra = {}) {
    if (!presentationStarted)
        return;
    const eduGame = window.eduGame;
    if (!eduGame || typeof eduGame.sendPresentationState !== 'function')
        return;
    const payload = buildPresentationState(extra);
    if (!payload)
        return;
    eduGame.sendPresentationState(payload);
}
/** Explicitly start Presentation Mode. Never called from normal question rendering. */
async function startPresentationMode(options = {}) {
    if (presentationStarted)
        return true;
    if (presentationStarting)
        return false;
    const eduGame = window.eduGame;
    if (!eduGame || typeof eduGame.startPresentation !== 'function') {
        toast('Bản này không hỗ trợ trình chiếu.', 5000);
        return false;
    }
    if (options.requireSecondary) {
        const displays = await getDisplayInfo();
        if (!hasSecondaryDisplay(displays)) {
            toast('Chưa phát hiện màn hình phụ/máy chiếu. Dùng nút ⛶ để chơi toàn màn hình trên máy này.', 5000);
            return false;
        }
    }
    if (document.documentElement.dataset.fullscreen === '1') {
        try {
            await setPlayFullscreen(false);
        }
        catch {
            // Keep going: the presentation window is still the important part.
        }
    }
    const payload = buildPresentationState();
    if (!payload) {
        toast('Chưa có trò chơi để trình chiếu.');
        return false;
    }
    const token = ++presentationToken;
    presentationStarting = true;
    try {
        const result = await eduGame.startPresentation(payload);
        if (token !== presentationToken)
            return false;
        if (result && result.ok) {
            presentationStarted = true;
            return true;
        }
        toast((result && result.error) || 'Không mở được cửa sổ trình chiếu. Hãy kiểm tra màn hình phụ.', 5000);
        return false;
    }
    catch (error) {
        if (token === presentationToken) {
            toast(`Không mở được cửa sổ trình chiếu: ${(error && error.message) || 'lỗi không xác định'}`, 5000);
        }
        return false;
    }
    finally {
        if (token === presentationToken)
            presentationStarting = false;
    }
}
/** Stop presentation mode and reset tracking. */
function stopPresentationMode() {
    const eduGame = window.eduGame;
    presentationToken += 1;
    presentationStarting = false;
    if (eduGame && typeof eduGame.stopPresentation === 'function') {
        try {
            const result = eduGame.stopPresentation();
            if (result && typeof result.catch === 'function')
                result.catch(() => { });
        }
        catch {
            // Stopping a presentation that was never open is harmless.
        }
    }
    presentationStarted = false;
    presentationRevision = 0;
}
// ---------- G4 — player theme (chỉ áp dụng trong lúc trình chiếu game) ----------
function playerTheme() {
    const audience = state.settings?.preferences?.audience;
    return audience === 'child' || audience === 'adult' ? audience : 'teen';
}
/**
 * Mỗi engine có một "thế giới" riêng: nền, màu nhấn, kiểu chữ, hình khối và
 * nhịp chuyển động. CSS đọc các biến này trong `[data-game-world="..."]`, nên
 * thẻ chơi, khung bao ngoài và thanh tiêu đề cùng đổi theo trò chơi.
 *
 *   quiz     — phòng thi giấy kẻ ô, mực navy, nhấn hổ phách
 *   scenario — sổ tay quyết định, giấy kem, nhấn lá thông
 *   matching — bảng nỉ xanh (trò chơi trí nhớ rực rỡ)
 *   treasure — bản đồ thám hiểm da thuộc, nhấn vàng kim
 *   race     — chặng đua đêm, nhấn cam đua và xanh neon
 */
const GAME_WORLDS = {
    quiz: { label: 'THỬ THÁCH KIẾN THỨC', symbol: '✦', kicker: 'Lớp học trên giấy' },
    scenario: { label: 'TÌNH HUỐNG THỰC TẾ', symbol: '☘', kicker: 'Sổ tay quyết định' },
    matching: { label: 'GHÉP CẶP KIẾN THỨC', symbol: '◈', kicker: 'Bảng nỉ tri thức' },
    treasure: { label: 'HÀNH TRÌNH KHÁM PHÁ', symbol: '⌖', kicker: 'Bản đồ nhà thám hiểm' },
    race: { label: 'ĐƯỜNG ĐUA TRI THỨC', symbol: '⏱', kicker: 'Đường đua về đích' }
};
/** World for the current game, by template (the engine actually playing). */
function gameWorld() {
    const template = String(state.currentGame && state.currentGame.template || '');
    if (template === 'treasure-hunt')
        return 'treasure';
    if (template === 'race')
        return 'race';
    if (template === 'matching' || state.currentGame && state.currentGame.matchingGame)
        return 'matching';
    if (template === 'scenario')
        return 'scenario';
    return 'quiz';
}
/** The ribbon title that marks a world on its stage. */
function gameWorldLabel(world) {
    const meta = GAME_WORLDS[world] || GAME_WORLDS.quiz;
    return `<div class="stage-world-tag" data-world-tag="${world}"><span class="stage-world-symbol" aria-hidden="true">${meta.symbol}</span><span>${meta.label}</span><span class="stage-world-sub">${meta.kicker}</span></div>`;
}
/**
 * Modal shell for one game: the same markup as before, plus the world on the
 * panel so the header, the body and the stage share one palette.
 */
function playModalHtml(world, widthClass, title, subtitle, tagWorld = world) {
    return `<div class="modal-backdrop"><div class="modal ${widthClass} bg-[#11152b] border border-[#303651]" data-player-theme="${playerTheme()}" data-game-world="${world}">${playHeaderHtml(title, subtitle, tagWorld)}<div class="modal-body p-[18px]" id="playBody"></div></div></div>`;
}
// Template chỉ ghi data-progress; giá trị % động gán qua style.width lúc render.
function paintProgress(scope) {
    $$('[data-progress]', scope).forEach(el => { el.style.width = `${el.dataset.progress}%`; });
}
// ---------- §2.3 Thi đấu đội (quiz/scenario) ----------
function openTeamSetup() {
    const root = $('#modalRoot');
    root.innerHTML = `<div class="modal-backdrop"><div class="modal w-[min(720px,96vw)] bg-[#11152b] border border-[#303651]" data-player-theme="${playerTheme()}"><div class="modal-head bg-[#11152b] border-[#303651] text-white"><div><h2>${escapeHtml(state.currentGame.title)}</h2><div class="small text-[#aeb5ce] mt-1">THI ĐẤU ĐỘI · CHIA ĐỘ TRƯỚC KHI BẮT ĐẦU</div></div><button class="modal-close bg-[#292f49] text-white" data-play-fullscreen>⛶</button><button class="modal-close bg-[#292f49] text-white" data-play-close>✕</button></div><div class="modal-body p-[18px]" id="playBody"></div></div></div>`;
    bindPlayHeader(root);
    state.pendingTeams = [
        { id: 't1', name: 'Đội A', icon: '🏎️' },
        { id: 't2', name: 'Đội B', icon: '🚀' }
    ];
    renderTeamSetup();
}
function renderTeamSetup() {
    const root = $('#playBody');
    const teams = state.pendingTeams;
    root.innerHTML = `<div class="game-stage" data-game="team-setup" data-game-world="${gameWorld()}"><div class="stage-kicker">CHIA ĐỘ CHO LỚP</div><p class="small text-[#aeb5ce]">Mỗi câu hỏi cộng điểm cho đội đang tới lượt. Giáo viên có thể luân phiên người trả lời — chọn lại đội trên thanh lượt trước khi học sinh trả lời.</p>
    <div class="team-setup">${teams.map((t, i) => `<div class="team-setup-row"><input data-team-icon data-team-index="${i}" value="${escapeHtml(t.icon)}" class="w-[64px] text-center" title="Biểu tượng đội"><input data-team-name data-team-index="${i}" value="${escapeHtml(t.name)}" placeholder="Tên đội ${i + 1}"><button type="button" class="text-link danger-text" data-team-remove="${i}" ${teams.length <= 2 ? 'disabled opacity-[.35] cursor-default' : ''}>✕</button></div>`).join('')}</div>
    <div class="mt-[10px]"><button type="button" class="btn btn-secondary btn-small" id="addTeamBtn" ${teams.length >= 6 ? 'disabled' : ''}>＋ Thêm đội (tối đa 6)</button></div>
    <div class="result-actions mt-[18px]"><button type="button" class="btn btn-secondary" data-play-close2>Đóng</button><button type="button" class="btn btn-primary" id="startTeamGameBtn">🏁 Bắt đầu thi đấu</button></div></div>`;
    $$('[data-team-name]', root).forEach(el => el.addEventListener('input', () => { state.pendingTeams[Number(el.dataset.teamIndex)].name = el.value; }));
    $$('[data-team-icon]', root).forEach(el => el.addEventListener('input', () => { state.pendingTeams[Number(el.dataset.teamIndex)].icon = el.value; }));
    $$('[data-team-remove]', root).forEach(btn => btn.addEventListener('click', () => {
        if (state.pendingTeams.length <= 2)
            return;
        state.pendingTeams.splice(Number(btn.dataset.teamRemove), 1);
        renderTeamSetup();
    }));
    $('#addTeamBtn', root).addEventListener('click', () => {
        if (state.pendingTeams.length >= 6)
            return;
        const n = state.pendingTeams.length + 1;
        state.pendingTeams.push({ id: `t${n}-${Date.now().toString(36)}`, name: `Đội ${String.fromCharCode(64 + n)}`, icon: '🏁' });
        renderTeamSetup();
    });
    $('[data-play-close2]', root).addEventListener('click', () => closePlaySurface());
    $('#startTeamGameBtn', root).addEventListener('click', startTeamGame);
}
function startTeamGame() {
    const names = state.pendingTeams.map(t => t.name.trim().toLowerCase());
    if (state.pendingTeams.some(t => !t.name.trim()))
        return toast('Mỗi đội cần có tên.');
    if (new Set(names).size !== names.length)
        return toast('Tên các đội đang trùng nhau.');
    state.teamPlay = {
        teams: state.pendingTeams.map(t => ({ id: t.id, name: t.name.trim(), icon: t.icon.trim() || '🏁', points: 0, correct: 0, answered: 0 })),
        turn: 0
    };
    state.pendingTeams = null;
    openPlayModal();
}
function teamTurnBarHtml() {
    const tp = state.teamPlay;
    const team = tp.teams[tp.turn];
    return `<div class="team-turn-bar"><div class="team-turn-summary"><span class="team-turn-label d-badge d-badge-primary d-badge-sm">👥 LƯỢT HIỆN TẠI</span><strong>${team.icon} ${escapeHtml(team.name)}</strong></div><div class="team-score-list" aria-label="Bảng điểm các đội">${tp.teams.map((t, i) => `<span class="team-score-chip ${i === tp.turn ? 'is-active' : ''}">${t.icon} ${escapeHtml(t.name)} <b>${t.points}</b></span>`).join('')}</div>${tp.teams.length > 1 ? `<label class="team-turn-select"><span>Đổi lượt:</span> <select id="teamTurnSelect">${tp.teams.map((t, i) => `<option value="${i}" ${i === tp.turn ? 'selected' : ''}>${t.icon} ${escapeHtml(t.name)}</option>`).join('')}</select></label>` : ''}</div>`;
}
function leaderboardHtml() {
    const tp = state.teamPlay;
    if (!tp)
        return '';
    const sorted = tp.teams.slice().sort((a, b) => b.points - a.points || b.correct - a.correct);
    const medals = ['🥇', '🥈', '🥉'];
    return `<div class="leaderboard"><div class="stage-kicker d-badge d-badge-neutral">BẢNG XẾP HẠNG ĐỘI</div>${sorted.map((t, i) => `<div class="leaderboard-row ${i === 0 && t.points > 0 ? 'leader' : ''}"><span>${t.points > 0 ? (medals[i] || `#${i + 1}`) : '·'} <strong>${t.icon} ${escapeHtml(t.name)}</strong></span><span>Đúng ${t.correct}/${t.answered} câu</span><span>🏆 ${t.points} điểm</span></div>`).join('')}</div>`;
}
function bindPlayHeader(root) {
    const present = $('[data-play-present]', root);
    if (present) {
        present.addEventListener('click', () => { startPresentationMode({ requireSecondary: true }); });
    }
    // Chơi LAN: one extra tool button, built by features/lan.js. It is inserted
    // before the fullscreen button so the projector action stays rightmost.
    const lanButton = $('[data-play-lan]', root);
    if (lanButton && typeof lanOpenRoom === 'function')
        lanButton.addEventListener('click', lanOpenRoom);
    const close = $('[data-play-close]', root);
    if (close)
        close.addEventListener('click', closePlaySurface);
}
/** Keep the five game engines visually and behaviourally consistent. */
function playHeaderHtml(title, subtitle, world) {
    const tag = world && GAME_WORLDS[world]
        ? `<span class="play-head-world" data-world-tag="${world}"><span aria-hidden="true">${GAME_WORLDS[world].symbol}</span> ${GAME_WORLDS[world].label}</span>`
        : '';
    // Chơi LAN (features/lan.js): quiz/scenario/treasure only, and hidden entirely
    // when the bridge is missing, so an older build shows no dead button.
    const lanButton = typeof lanButtonHtml === 'function' ? lanButtonHtml(state.currentGame) : '';
    return `<div class="modal-head play-head bg-[#11152b] border-[#303651] text-white"><div class="play-head-title">${tag}<h2>${escapeHtml(title)}</h2><div class="small text-[#aeb5ce] mt-1">${subtitle}</div></div><div class="play-head-actions"><span class="play-shortcut" aria-hidden="true">F11 toàn màn hình · Esc quay lại</span>${lanButton}<button class="play-tool" data-play-fullscreen title="Bật hoặc tắt toàn màn hình (F11)" aria-label="Bật hoặc tắt toàn màn hình"><span class="play-tool-icon">⛶</span></button><button class="play-tool play-tool-present" data-play-present title="Trình chiếu lên máy chiếu" aria-label="Trình chiếu lên máy chiếu"><span class="play-tool-icon">📽</span><span class="play-tool-label">Trình chiếu</span></button><button class="play-tool play-tool-danger" data-play-close title="Đóng trò chơi (Esc)" aria-label="Đóng trò chơi"><span class="play-tool-icon">✕</span></button></div></div>`;
}
function openPlayModal() {
    const root = $('#modalRoot');
    const world = gameWorld();
    // The header badge names the template, the palette uses the engine world: a
    // scenario game is rendered by the quiz engine ("Thử thách kiến thức" surface),
    // but its own ribbon must still say "Tình huống thực tế".
    const tagWorld = state.currentGame && state.currentGame.template === 'scenario' ? 'scenario' : world;
    root.innerHTML = playModalHtml(world, 'w-[min(1180px,97vw)]', state.currentGame.title, 'CHẾ ĐỘ TRÌNH CHIẾU · NGOẠI TUYẾN', tagWorld);
    bindPlayHeader(root);
    renderQuestion();
}
function renderQuestion() {
    const game = state.currentGame, q = game.questions[state.gameIndex], root = $('#playBody');
    if (!q) {
        unmountThreeStage();
        return renderResults();
    }
    unmountThreeStage();
    state.answerLocked = false;
    const progress = Math.round(state.gameAnswers.length / game.questions.length * 100);
    const scoring = resolveScoring(game.gameSetup);
    const scoringTip = ({ 'cơ bản': '✓ Đúng nhận điểm cố định, sai không bị trừ điểm', 'tốc độ': `⚡ Đúng nhanh trong 8 giây: +${scoring.timeBonus} điểm thưởng`, 'theo độ khó': `⛰️ Điểm theo độ khó: dễ ${scoring.table['dễ']} · trung bình ${scoring.table['trung bình']} · khó ${scoring.table['khó']}`, 'thi đấu đội': '👥 Điểm cộng cho đội — có thể luân phiên người trả lời', 'luyện tập': '📖 Luyện tập: không áp lực thời gian — xem kỹ giải thích' })[scoring.mode] || '';
    const textQ = isTextQuestion(q);
    const kicker = q.type === 'scenario' ? 'TÌNH HUỐNG THỰC TẾ' : q.type === 'fill-in-blank' ? 'ĐIỀN TỪ CÒN THIẾU' : q.type === 'short-answer' ? 'TRẢ LỜI NGẮN' : q.type === 'true-false' ? 'ĐÚNG HAY SAI' : 'THỬ THÁCH KIẾN THỨC';
    /* DECISIONS #87: quiz và scenario dùng CHUNG một render function, phân biệt
       bằng `q.type`, nên `data-game` cũng phải theo `q.type` — không theo
       `game.template`. Teacher có thể trộn câu scenario vào game quiz
       (xem kicker ở trên: nó cũng dựa vào q.type). */
    const stageGame = q.type === 'scenario' ? 'scenario' : 'quiz';
    const trueFalse = q.type === 'true-false';
    const optionMark = (option, index) => trueFalse
        ? (/^đúng\b/i.test(String(option.text || '').trim()) ? '✓' : /^sai\b/i.test(String(option.text || '').trim()) ? '✗' : String.fromCharCode(65 + index))
        : String.fromCharCode(65 + index);
    const shortAnswerPlaceholder = q.type === 'fill-in-blank' ? 'Nhập từ hoặc cụm từ còn thiếu…' : 'Nhập câu trả lời ngắn (tối đa 5 từ)…';
    const houseMode = isHouseMode(game);
    // House mode puts the 3D house where the placeholder picture used to be,
    // so the illustration is dropped and a slot reserves its screen area. With
    // no illustration the feedback renders in the main column, which the
    // showcase needs to keep it below the house (DECISIONS #142).
    const illusHtml = houseMode ? '' : stageIllustrationHtml(q, game, 'is-stage');
    const hasIllus = Boolean(illusHtml);
    const answerArea = textQ
        ? `<div class="text-answer-box"><input id="textAnswerInput" placeholder="${shortAnswerPlaceholder}" autocomplete="off"><button class="btn btn-primary" id="textAnswerBtn">Trả lời</button>${q.hint ? `<button class="btn btn-secondary text-answer-hint" type="button" data-answer-hint>💡 Gợi ý</button>` : ''}</div>${q.hint ? `<div class="text-answer-hint-text hidden" id="textAnswerHint">💡 <strong>Gợi ý:</strong> ${escapeHtml(q.hint)}</div>` : ''}`
        : `<div class="answer-grid${trueFalse ? ' true-false-grid' : ''}">${q.options.map((o, i) => `<button class="answer-option" data-answer="${escapeHtml(o.id)}"><span class="letter">${optionMark(o, i)}</span><span>${escapeHtml(o.text)}</span></button>`).join('')}</div>`;
    root.innerHTML = `<div class="game-stage" data-game="${stageGame}" data-game-world="quiz">${gameWorldLabel(stageGame)}<div class="stage-top"><span class="stage-meta">${escapeHtml(game.subject || 'TRÒ CHƠI HỌC TẬP')} · ${game.grade ? 'LỚP ' + escapeHtml(game.grade) : 'MỌI LỚP'}</span><span class="stage-meta stage-meta-right"><span class="stage-chip">${game.template === 'scenario' ? 'QUYẾT ĐỊNH' : 'CÂU'} <b>${state.gameAnswers.length + 1}</b>/${game.questions.length}</span><span class="stage-chip stage-chip-score">🏆 <b>${state.gameAnswers.reduce((s, a) => s + a.points, 0)}</b> điểm</span></span></div><div class="stage-progress"><div data-progress="${progress}"></div></div>${isHouseMode(game) ? houseProgressHtml() : ''}${state.teamPlay ? teamTurnBarHtml() : ''}<div class="stage-center"><div class="stage-col stage-side-col">${illusHtml}${hasIllus ? '<div id="answerFeedback" class="feedback-under-illustration"></div>' : ''}</div><div class="stage-col is-main"><div class="stage-kicker-row flex items-center justify-between gap-2 mb-2 flex-wrap"><div class="stage-kicker d-badge d-badge-neutral">${kicker}</div>${q.hint && !textQ ? `<button type="button" class="btn btn-secondary btn-small quiz-hint-btn" id="quizHintBtn">💡 Gợi ý</button>` : ''}</div>${houseMode ? '<div class="house-stage-slot" aria-hidden="true"></div>' : ''}${q.context ? `<p class="scenario-context">${escapeHtml(q.context).replace(/\n/g, '<br>')}</p>` : ''}<div class="stage-question">${escapeHtml(q.prompt).replace(/\n/g, '<br>')}</div>${answerArea}${!hasIllus ? '<div id="answerFeedback"></div>' : ''}<div class="stage-bottom"><span class="stage-tip">${scoringTip}</span><button class="btn hidden" id="nextQuestionBtn">Tiếp tục →</button></div></div></div></div>`;
    paintProgress(root);
    $$('.answer-option', root).forEach(btn => btn.addEventListener('click', () => chooseAnswer(q, btn.dataset.answer)));
    const qHintBtn = $('#quizHintBtn', root);
    if (qHintBtn) {
        qHintBtn.onclick = () => {
            const fb = $('#answerFeedback', root);
            if (fb) {
                fb.className = 'feedback good is-hint';
                fb.innerHTML = `<strong>💡 Gợi ý:</strong> ${escapeHtml(q.hint)}`;
                GameAudio.play('hint');
            }
            qHintBtn.disabled = true;
            qHintBtn.textContent = '💡 Đã mở gợi ý';
        };
    }
    if (textQ) {
        const input = $('#textAnswerInput', root);
        const submit = () => { const value = input.value; if (!value.trim())
            return toast('Hãy nhập câu trả lời trước.'); chooseAnswer(q, null, value); };
        $('#textAnswerBtn', root).addEventListener('click', submit);
        input.addEventListener('keydown', e => { if (e.key === 'Enter')
            submit(); });
        const hintBtn = $('[data-answer-hint]', root);
        if (hintBtn)
            hintBtn.addEventListener('click', () => {
                const fb = $('#answerFeedback', root);
                if (fb) {
                    fb.className = 'feedback good is-hint';
                    fb.innerHTML = `<strong>💡 Gợi ý:</strong> ${escapeHtml(q.hint)}`;
                    GameAudio.play('hint');
                }
                const hint = $('#textAnswerHint', root);
                if (hint)
                    hint.classList.remove('hidden');
                hintBtn.disabled = true;
                hintBtn.textContent = '💡 Đã mở gợi ý';
                input.focus();
            });
        input.focus();
    }
    const turnSelect = $('#teamTurnSelect', root);
    if (turnSelect)
        turnSelect.addEventListener('change', () => { state.teamPlay.turn = Number(turnSelect.value); renderQuestion(); });
    mountThreeStage($('.game-stage', root));
    sendPresentationState();
}
function chooseAnswer(question, optionId, answerText) {
    if (state.answerLocked)
        return;
    state.answerLocked = true;
    const elapsed = (Date.now() - state.gameStart) / 1000;
    const textQ = isTextQuestion(question);
    const selectedOption = textQ ? undefined : question.options.find(option => option.id === optionId);
    const scenario = state.currentGame.template === 'scenario' && question.type === 'scenario';
    const scenarioScore = scenario && selectedOption?.scenarioScore
        ? scoreScenarioDecision(selectedOption)
        : undefined;
    const scored = textQ
        ? scoreTextAnswer(question, answerText, elapsed, state.currentGame?.gameSetup)
        : scenarioScore
            ? { correct: question.correctOptionId === optionId, points: scenarioScore.points, speedBonus: 0 }
            : scenario
                ? { correct: question.correctOptionId === optionId, points: question.correctOptionId === optionId ? Number(question.points) || 100 : 0, speedBonus: 0 }
                : scoreAnswer(question, optionId, elapsed, state.currentGame?.gameSetup);
    const { correct, points, speedBonus } = scored;
    state.scenarioSteps = (state.scenarioSteps || 0) + (scenario ? 1 : 0);
    state.gameAnswers.push({
        questionId: question.id, selectedOptionId: textQ ? null : optionId, ...(textQ ? { answerText: String(answerText ?? '') } : {}), correct, points, elapsedSeconds: elapsed,
        ...(scenarioScore ? { scoringBreakdown: scenarioScore.breakdown } : {})
    });
    if (isHouseMode(state.currentGame)) {
        const house = houseApplyAnswer(houseState(), houseTargetParts(state.currentGame), correct);
        state.houseBuild = house.state;
        reactThree(correct ? 'answer:correct' : 'answer:incorrect', { correct, points, house });
    } else {
        reactThree(correct ? 'answer:correct' : 'answer:incorrect', { correct, points });
    }
    let teamNote = '';
    if (state.teamPlay) {
        const tp = state.teamPlay;
        const team = tp.teams[tp.turn];
        team.points += points;
        if (correct)
            team.correct += 1;
        team.answered += 1;
        const nextTeam = tp.teams[(tp.turn + 1) % tp.teams.length];
        teamNote = `<br><strong>👥 ${escapeHtml(team.name)}</strong> được cộng ${points} điểm.${tp.teams.length > 1 ? ` Lượt sau: ${escapeHtml(nextTeam.name)}.` : ''}`;
        tp.turn = (tp.turn + 1) % tp.teams.length;
    }
    if (textQ) {
        const input = document.getElementById('textAnswerInput');
        const submitBtn = document.getElementById('textAnswerBtn');
        if (input) {
            input.disabled = true;
        }
        if (submitBtn)
            submitBtn.disabled = true;
        const hintBtn = document.querySelector('[data-answer-hint]');
        if (hintBtn)
            hintBtn.disabled = true;
    }
    $$('.answer-option').forEach(btn => {
        btn.disabled = true;
        if (scenario) {
            if (btn.dataset.answer === optionId)
                btn.classList.add('selected');
        }
        else if (btn.dataset.answer === question.correctOptionId)
            btn.classList.add('correct');
        else if (btn.dataset.answer === optionId)
            btn.classList.add('wrong');
    });
    const feedback = $('#answerFeedback');
    if (!feedback)
        return;
    feedback.className = `feedback ${correct ? 'good' : 'bad'}`;
    const rubric = scenarioScore
        ? `<br>Điểm quyết định: ${points}/100 (an toàn ${scenarioScore.breakdown.safety}/60 · giải thích ${scenarioScore.breakdown.reasoning}/25 · giảm hậu quả ${scenarioScore.breakdown.harmReduction}/15).`
        : '';
    // In house mode the showcase hides the answer grid, so the feedback must
    // name the correct option itself (DECISIONS #142).
    const correctOption = textQ ? null : question.options.find(option => option.id === question.correctOptionId);
    const answerReveal = textQ
        ? `<br><strong>Đáp án đúng:</strong> ${escapeHtml(question.correctAnswer || '')}${question.alternateAnswers?.length ? ` (hoặc: ${question.alternateAnswers.map(a => escapeHtml(a)).join(', ')})` : ''}${question.hint && !correct ? `<br><strong>💡 Gợi ý:</strong> ${escapeHtml(question.hint)}` : ''}`
        : isHouseMode(state.currentGame) && correctOption
            ? `<br><strong>Đáp án đúng:</strong> ${escapeHtml(correctOption.text)}`
            : '';
    const teacherFeedback = scenario && selectedOption?.feedback
        ? selectedOption.feedback
        : question.explanation || 'Hãy ôn lại nội dung bài học.';
    const discussion = scenario && question.discussionPrompt
        ? `<br><strong>Thảo luận:</strong> ${escapeHtml(question.discussionPrompt)}`
        : '';
    feedback.innerHTML = `<strong>${scenario ? 'Đã ghi nhận quyết định.' : correct ? '✓ Chính xác!' : '✕ Chưa chính xác.'}</strong> ${scenario ? `Bạn nhận ${points} điểm.` : correct ? `Bạn nhận ${points} điểm${speedBonus ? ` (gồm +${speedBonus} điểm nhanh)` : ''}.` : `${textQ ? `Câu trả lời của bạn: “${escapeHtml(String(answerText ?? '').trim())}”.` : 'Đáp án đúng đã được đánh dấu.'}`}${answerReveal}${rubric}<br>${escapeHtml(teacherFeedback)}${discussion}${teamNote}`;
    const next = scenario
        ? resolveScenarioTransition(selectedOption, state.gameIndex, state.currentGame.questions)
        : state.gameIndex + 1;
    state.nextQuestionIndex = next === undefined || scenario && state.scenarioSteps >= 100
        ? state.currentGame.questions.length
        : next;
    $('#nextQuestionBtn').classList.remove('hidden');
    $('#nextQuestionBtn').textContent = state.nextQuestionIndex >= state.currentGame.questions.length ? 'Xem kết quả →' : 'Tình huống tiếp theo →';
    $('#nextQuestionBtn').onclick = () => { state.gameIndex = state.nextQuestionIndex; state.gameStart = Date.now(); lanAdvanceRound(); renderQuestion(); };
    // The showcase fits the house into the space the feedback card leaves, so
    // it runs after the banner and the "next" button are laid out (#142).
    if (isHouseMode(state.currentGame))
        showcaseHouse();
    sendPresentationState();
}
/** mm:ss for the result stat cards (language-neutral, compact on the projector). */
function formatClock(totalSeconds) {
    const s = Math.max(0, Math.round(totalSeconds));
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, '0')}`;
}
/** A row of stat cards shared by every result screen. Values are pre-escaped strings. */
function resultStatsHtml(stats) {
    if (!stats || !stats.length)
        return '';
    return `<div class="result-stats">${stats.map(s => `<div class="result-stat"><span class="result-stat-icon" aria-hidden="true">${s.icon}</span><span class="result-stat-value">${s.value}</span><span class="result-stat-label">${s.label}</span></div>`).join('')}</div>`;
}
async function renderResults() {
    const game = state.currentGame;
    // LAN: the game is over by definition here, so end the room. Every "results"
    // route calls this, which is why the finish hook lives here too.
    lanFinishRoom();
    const summary = game.template === 'scenario'
        ? calculateScenarioSummary(state.gameAnswers)
        : calculateSummary(state.gameAnswers, game.questions, game.gameSetup);
    const { points, max, correct, percent } = summary;
    const house = isHouseMode(game) ? houseSummary(houseState(), houseTargetParts(game)) : null;
    const ranked = state.teamPlay ? state.teamPlay.teams.slice().sort((a, b) => b.points - a.points || b.correct - a.correct) : null;
    const top = ranked ? ranked[0] : null;
    state.lastSummary = ranked
        ? { points: top.points, max, percent: max ? Math.round(top.points / max * 100) : 0, correct: top.correct, total: game.questions.length, winnerTeam: top.name }
        : summary;
    const elapsed = Date.now() - (state.playStartedAt || state.gameStart);
    const statTotal = game.template === 'scenario' ? state.gameAnswers.length : game.questions.length;
    const statCorrect = ranked && top ? top.correct : correct;
    const stats = resultStatsHtml([
        { icon: '✓', value: `${statCorrect}/${statTotal}`, label: game.template === 'scenario' ? 'Quyết định đúng' : 'Câu trả lời đúng' },
        { icon: '⏱', value: formatClock(elapsed / 1000), label: 'Thời gian' },
        { icon: '🎯', value: `${percent}%`, label: 'Điểm tối đa' }
    ]);
    const houseStyleName = house ? houseStyleLabel(houseStyleForCurrentGame()) : '';
    const houseHeroHtml = house ? `<div class="result-house-hero"><div class="house-stage-slot result-house-slot"></div><div class="result-house">🏠 Ngôi nhà: <b>${house.parts}/${house.maxParts} phần</b>${house.completed ? ' · Đã hoàn thiện 🎉' : ' · Còn dang dở'}${houseStyleName ? `<span class="result-house-style">Mẫu: ${escapeHtml(houseStyleName)}</span>` : ''}</div></div>` : '';
    const resultBodyHtml = `<div class="result-medal">${percent >= 80 ? '🏆' : percent >= 50 ? '🎖️' : '🌱'}</div><div class="stage-kicker">THỬ THÁCH HOÀN THÀNH</div><h2>${ranked && top ? `${top.icon} ${escapeHtml(top.name)} dẫn đầu!` : percent >= 80 ? 'Xuất sắc!' : percent >= 50 ? 'Làm tốt lắm!' : 'Tiếp tục cố gắng!'}</h2><p>${escapeHtml(game.title)}</p><div class="result-score">${points.toLocaleString('vi-VN')} điểm</div><p>${game.template === 'scenario' ? `Hoàn thành ${state.gameAnswers.length} quyết định · ${percent}% điểm tối đa` : `Trả lời đúng ${correct}/${game.questions.length} câu · ${percent}% điểm tối đa`}</p>${stats}${state.teamPlay ? leaderboardHtml() : ''}<p id="resultSaveStatus" class="result-save-status">Đang tự lưu kết quả…</p><div class="result-actions"><button class="btn btn-secondary" id="closeResultBtn">Đóng</button><button class="btn btn-secondary" id="replayBtn">↻ Chơi lại</button><button class="btn btn-primary" id="saveResultBtn">Đang lưu…</button></div>`;
    $('#playBody').innerHTML = `<div class="game-stage" data-game="${game.template === 'scenario' ? 'scenario' : 'quiz'}" data-game-world="quiz">${gameWorldLabel(game.template === 'scenario' ? 'scenario' : 'quiz')}<div class="result-screen${house ? ' is-house-result' : ''}">${house ? `${houseHeroHtml}<div class="result-summary">${resultBodyHtml}</div>` : resultBodyHtml}</div></div>`;
    // House mode shows the finished model on the result screen: the hero keeps a
    // `.house-stage-slot`, the same slot the answer phase uses, so buildHouseWorld()
    // projects the house (at its final part count) straight into it (DECISIONS #144).
    mountThreeStage($('#playBody .game-stage'));
    reactThree('game:completed', { correct, points, houseCompleted: house ? house.completed : false });
    $('#closeResultBtn').onclick = () => closePlaySurface();
    $('#replayBtn').onclick = () => {
        state.gameIndex = 0;
        state.gameAnswers = [];
        state.gameStart = Date.now();
        state.scenarioSteps = 0;
        state.playStartedAt = Date.now();
        state.resultSession = null;
        state.houseBuild = isHouseMode(game) ? houseCreate() : null;
        if (state.teamPlay) {
            state.teamPlay.teams.forEach(t => { t.points = 0; t.correct = 0; t.answered = 0; });
            state.teamPlay.turn = 0;
        }
        renderQuestion();
    };
    wireResultSession(game, state.lastSummary, {
        answers: state.gameAnswers,
        ...(state.teamPlay ? { teams: state.teamPlay.teams, winnerTeam: top ? top.name : '' } : {})
    }, top ? top.name : 'Người chơi');
    sendPresentationState({ isComplete: true });
}
function shuffled(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
function openMatchingPlay() {
    const root = $('#modalRoot');
    const game = state.currentGame;
    const modeLabel = ({ columns: 'GHÉP HAI CỘT', memory: 'LẬT THẺ GHI NHỚ', categorize: 'PHÂN LOẠI KIẾN THỨC' })[game.matchingGame.mode] || 'GHÉP CẶP KIẾN THỨC';
    root.innerHTML = playModalHtml('matching', 'w-[min(980px,96vw)]', game.title, `${modeLabel} · NGOẠI TUYẾN`);
    bindPlayHeader(root);
    resetMatchingPlay();
}
function resetMatchingPlay() {
    state.matchingPlay = { matched: 0, wrong: 0, selectedLeft: null, selectedRight: null, selectedCard: null, flipped: [], lock: false };
    state.gameStart = Date.now();
    renderMatchingBoard();
}
function matchingHeader() {
    const game = state.currentGame, m = game.matchingGame, mp = state.matchingPlay;
    const elapsed = Math.max(0, Math.round((Date.now() - state.gameStart) / 1000));
    const progress = Math.round(mp.matched / m.pairs.length * 100);
    return `<div class="stage-top"><span>${escapeHtml(game.subject || 'GHÉP CẶP KIẾN THỨC')} · ${game.grade ? 'LỚP ' + escapeHtml(game.grade) : 'MỌI LỚP'}</span><span id="matchingStats">ĐÃ GHÉP ${mp.matched}/${m.pairs.length} · SAI ${mp.wrong} · ${elapsed}s &nbsp; · &nbsp; ${m.practiceMode ? '📖 Luyện tập' : '🏆 Chinh phục'}</span></div><div class="stage-progress"><div data-progress="${progress}"></div></div>`;
}
function matchingFooter(m) {
    return `<div class="stage-bottom"><span>${m.practiceMode ? '📖 Luyện tập: không trừ điểm · ' : ''}${m.wrongPenalty > 0 ? `⚠️ Mỗi lần sai trừ ${m.wrongPenalty} điểm` : 'Sai không bị trừ điểm'}${m.completionBonus > 0 ? ` · Thưởng hoàn thành +${m.completionBonus}` : ''}${m.timeBonus > 0 && m.bonusUnderSeconds > 0 ? ` · nhanh dưới ${m.bonusUnderSeconds}s: +${m.timeBonus}` : ''}</span></div>`;
}
function matchingFeedback(kind, text) {
    const fb = $('#matchFeedback');
    if (!fb)
        return;
    fb.className = `feedback ${kind}`;
    fb.innerHTML = `<strong>${text}</strong>`;
}
function updateMatchingHeader() {
    const stats = $('#matchingStats');
    if (!stats)
        return;
    const m = state.currentGame.matchingGame, mp = state.matchingPlay;
    const elapsed = Math.max(0, Math.round((Date.now() - state.gameStart) / 1000));
    stats.textContent = `ĐÃ GHÉP ${mp.matched}/${m.pairs.length} · SAI ${mp.wrong} · ${elapsed}s · ${m.practiceMode ? '📖 Luyện tập' : '🏆 Chinh phục'}`;
    const bar = $('.stage-progress > div');
    if (bar)
        bar.style.width = `${Math.round(mp.matched / m.pairs.length * 100)}%`;
    sendPresentationState();
}
function renderMatchingBoard() {
    const m = state.currentGame.matchingGame;
    // Ghép xong KHÔNG tự nhảy sang bảng điểm (yêu cầu giáo viên): giữ nguyên bàn ghép
    // và chỉ hiện thanh "Đã ghép đủ" + nút "Xem kết quả". Điểm chỉ hiện khi bấm nút
    // (`showMatchingResults`) hoặc khi `showMatchingComplete` chạy sau cú ghép cuối.
    if (state.matchingPlay.matched >= m.pairs.length)
        return showMatchingComplete();
    const mode = ['columns', 'memory', 'categorize'].includes(m.mode) ? m.mode : 'columns';
    const root = $('#playBody');
    if (mode === 'memory')
        renderMemoryBoard(root, m);
    else if (mode === 'categorize')
        renderCategorizeBoard(root, m);
    else
        renderColumnsBoard(root, m);
}
/** Matching has no single "current item"; the game-level illustration comes
    from the first pair, which is what the plan/AI populates. Returns '' when
    the board should stay clean. */
function matchingIllustrationHtml(game) {
    const m = game && game.matchingGame;
    const first = m && Array.isArray(m.pairs) ? m.pairs[0] : null;
    return first ? stageIllustrationHtml(first, game, 'is-matching') : '';
}
const MATCH_CONNECTOR_PALETTE = [
    { stroke: '#10b981', glow: 'rgba(16, 185, 129, 0.55)', name: 'emerald' },
    { stroke: '#06b6d4', glow: 'rgba(6, 182, 212, 0.55)', name: 'cyan' },
    { stroke: '#a855f7', glow: 'rgba(168, 85, 247, 0.55)', name: 'purple' },
    { stroke: '#f59e0b', glow: 'rgba(245, 158, 11, 0.55)', name: 'amber' },
    { stroke: '#ec4899', glow: 'rgba(236, 72, 153, 0.55)', name: 'pink' },
    { stroke: '#3b82f6', glow: 'rgba(59, 130, 246, 0.55)', name: 'blue' },
    { stroke: '#14b8a6', glow: 'rgba(20, 184, 166, 0.55)', name: 'teal' },
    { stroke: '#f97316', glow: 'rgba(249, 115, 22, 0.55)', name: 'orange' }
];
let activeMatchingConnections = [];
let matchingResizeObserver = null;
function initMatchingConnectors(board) {
    if (!board)
        return;
    activeMatchingConnections = activeMatchingConnections.filter(c => c.board && c.board.isConnected && c.board !== board);
    let svg = board.querySelector('.matching-connector-canvas');
    if (!svg) {
        svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'matching-connector-canvas');
        svg.setAttribute('aria-hidden', 'true');
        board.prepend(svg);
    }
    else {
        svg.innerHTML = '';
    }
    if (!matchingResizeObserver && typeof ResizeObserver !== 'undefined') {
        matchingResizeObserver = new ResizeObserver(() => updateAllMatchingConnectors());
    }
    if (matchingResizeObserver) {
        try {
            matchingResizeObserver.observe(board);
        }
        catch { }
    }
    window.addEventListener('resize', updateAllMatchingConnectors);
}
function updateAllMatchingConnectors() {
    if (!activeMatchingConnections.length)
        return;
    for (const conn of activeMatchingConnections) {
        if (!conn.board?.isConnected || !conn.leftEl?.isConnected || !conn.rightEl?.isConnected)
            continue;
        const boardRect = conn.board.getBoundingClientRect();
        const leftRect = conn.leftEl.getBoundingClientRect();
        const rightRect = conn.rightEl.getBoundingClientRect();
        if (!boardRect.width || !leftRect.width || !rightRect.width)
            continue;
        const x1 = Math.round(leftRect.right - boardRect.left);
        const y1 = Math.round(leftRect.top + (leftRect.height / 2) - boardRect.top);
        const x2 = Math.round(rightRect.left - boardRect.left);
        const y2 = Math.round(rightRect.top + (rightRect.height / 2) - boardRect.top);
        const dx = Math.max(30, x2 - x1);
        const cx1 = Math.round(x1 + dx * 0.45);
        const cx2 = Math.round(x2 - dx * 0.45);
        conn.pathEl.setAttribute('d', `M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`);
        conn.leftPinEl.setAttribute('cx', String(x1));
        conn.leftPinEl.setAttribute('cy', String(y1));
        conn.rightPinEl.setAttribute('cx', String(x2));
        conn.rightPinEl.setAttribute('cy', String(y2));
        if (conn.checkBadgeEl) {
            const xMid = Math.round((x1 + x2) / 2);
            const yMid = Math.round((y1 + y2) / 2);
            conn.checkBadgeEl.setAttribute('transform', `translate(${xMid}, ${yMid})`);
        }
    }
}
function addMatchingConnection(board, leftEl, rightEl, matchIndex) {
    let svg = board.querySelector('.matching-connector-canvas');
    if (!svg) {
        initMatchingConnectors(board);
        svg = board.querySelector('.matching-connector-canvas');
    }
    if (!svg)
        return;
    const colorItem = MATCH_CONNECTOR_PALETTE[matchIndex % MATCH_CONNECTOR_PALETTE.length];
    const boardRect = board.getBoundingClientRect();
    const leftRect = leftEl.getBoundingClientRect();
    const rightRect = rightEl.getBoundingClientRect();
    const x1 = Math.round(leftRect.right - boardRect.left);
    const y1 = Math.round(leftRect.top + (leftRect.height / 2) - boardRect.top);
    const x2 = Math.round(rightRect.left - boardRect.left);
    const y2 = Math.round(rightRect.top + (rightRect.height / 2) - boardRect.top);
    const dx = Math.max(30, x2 - x1);
    const cx1 = Math.round(x1 + dx * 0.45);
    const cx2 = Math.round(x2 - dx * 0.45);
    const d = `M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`;
    const svgNS = 'http://www.w3.org/2000/svg';
    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('stroke', colorItem.stroke);
    path.setAttribute('stroke-width', '3.5');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('class', 'matching-beam');
    path.style.filter = `drop-shadow(0 0 6px ${colorItem.glow})`;
    const approxLen = Math.round(Math.hypot(x2 - x1, y2 - y1) * 1.35) + 60;
    path.style.strokeDasharray = String(approxLen);
    path.style.strokeDashoffset = String(approxLen);
    const leftPin = document.createElementNS(svgNS, 'circle');
    leftPin.setAttribute('cx', String(x1));
    leftPin.setAttribute('cy', String(y1));
    leftPin.setAttribute('r', '5.5');
    leftPin.setAttribute('fill', colorItem.stroke);
    leftPin.setAttribute('stroke', '#ffffff');
    leftPin.setAttribute('stroke-width', '2');
    leftPin.setAttribute('class', 'matching-pin-dot');
    const rightPin = document.createElementNS(svgNS, 'circle');
    rightPin.setAttribute('cx', String(x2));
    rightPin.setAttribute('cy', String(y2));
    rightPin.setAttribute('r', '5.5');
    rightPin.setAttribute('fill', colorItem.stroke);
    rightPin.setAttribute('stroke', '#ffffff');
    rightPin.setAttribute('stroke-width', '2');
    rightPin.setAttribute('class', 'matching-pin-dot');
    const checkBadge = document.createElementNS(svgNS, 'g');
    checkBadge.setAttribute('class', 'matching-badge-wrap');
    const xMid = Math.round((x1 + x2) / 2);
    const yMid = Math.round((y1 + y2) / 2);
    checkBadge.setAttribute('transform', `translate(${xMid}, ${yMid})`);
    const badgeCircle = document.createElementNS(svgNS, 'circle');
    badgeCircle.setAttribute('r', '11');
    badgeCircle.setAttribute('fill', colorItem.stroke);
    badgeCircle.style.filter = `drop-shadow(0 0 6px ${colorItem.glow})`;
    const badgeCheck = document.createElementNS(svgNS, 'path');
    badgeCheck.setAttribute('d', 'M -3.5 -0.5 L -1 2.5 L 4 -2');
    badgeCheck.setAttribute('fill', 'none');
    badgeCheck.setAttribute('stroke', '#ffffff');
    badgeCheck.setAttribute('stroke-width', '2.2');
    badgeCheck.setAttribute('stroke-linecap', 'round');
    badgeCheck.setAttribute('stroke-linejoin', 'round');
    checkBadge.appendChild(badgeCircle);
    checkBadge.appendChild(badgeCheck);
    svg.appendChild(path);
    svg.appendChild(leftPin);
    svg.appendChild(rightPin);
    svg.appendChild(checkBadge);
    leftEl.classList.add('is-connected');
    rightEl.classList.add('is-connected');
    leftEl.style.borderColor = colorItem.stroke;
    leftEl.style.boxShadow = `0 0 16px ${colorItem.glow}`;
    rightEl.style.borderColor = colorItem.stroke;
    rightEl.style.boxShadow = `0 0 16px ${colorItem.glow}`;
    activeMatchingConnections.push({
        board,
        leftEl,
        rightEl,
        colorItem,
        pathEl: path,
        leftPinEl: leftPin,
        rightPinEl: rightPin,
        checkBadgeEl: checkBadge
    });
}
function renderColumnsBoard(root, m) {
    const rights = shuffled(m.pairs);
    const illusMatchHtml = matchingIllustrationHtml(state.currentGame);
    const hasIllusMatch = Boolean(illusMatchHtml);
    root.innerHTML = `<div class="game-stage" data-game="matching" data-game-world="matching" data-match-mode="${state.currentGame.matchingGame.mode || 'columns'}">${gameWorldLabel('matching')}${matchingHeader()}<div class="stage-center"><div class="stage-col stage-side-col">${illusMatchHtml}${hasIllusMatch ? '<div id="matchFeedback" class="feedback-under-illustration"></div>' : ''}</div><div class="stage-col is-main"><div class="stage-kicker d-badge d-badge-neutral">GHÉP HAI CỘT</div><p class="field-hint">Chọn một mục ở cột A, rồi chọn mục tương ứng ở cột B.</p><div class="matching-board"><svg class="matching-connector-canvas" aria-hidden="true"></svg><div class="matching-col">${m.pairs.map(p => `<button type="button" class="match-card" data-match-side="left" data-pair="${escapeHtml(p.id)}">${escapeHtml(p.left)}</button>`).join('')}</div><div class="matching-col">${rights.map(p => `<button type="button" class="match-card" data-match-side="right" data-pair="${escapeHtml(p.id)}">${escapeHtml(p.right)}</button>`).join('')}</div></div>${!hasIllusMatch ? '<div id="matchFeedback"></div>' : ''}</div></div>${matchingFooter(m)}</div>`;
    paintProgress(root);
    const board = $('.matching-board', root);
    if (board)
        initMatchingConnectors(board);
    $$('.match-card', root).forEach(btn => btn.addEventListener('click', () => onColumnCardClick(btn)));
    mountThreeStage($('.game-stage', root));
    sendPresentationState();
}
function onColumnCardClick(btn) {
    const mp = state.matchingPlay;
    if (btn.classList.contains('matched') || mp.lock)
        return;
    const side = btn.dataset.matchSide;
    const selector = `[data-match-side="${side}"]`;
    $$(selector).forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    if (side === 'left')
        mp.selectedLeft = btn;
    else
        mp.selectedRight = btn;
    sendPresentationState();
    if (mp.selectedLeft && mp.selectedRight)
        evaluateColumnMatch();
}
function evaluateColumnMatch() {
    const mp = state.matchingPlay;
    const left = mp.selectedLeft, right = mp.selectedRight;
    if (left.dataset.pair === right.dataset.pair) {
        left.classList.add('matched');
        right.classList.add('matched');
        left.classList.remove('selected');
        right.classList.remove('selected');
        mp.matched += 1;
        const board = left.closest('.matching-board');
        if (board) {
            addMatchingConnection(board, left, right, mp.matched - 1);
        }
        GameAudio.play('match');
        reactThree('match:correct', { matched: mp.matched });
        mp.selectedLeft = mp.selectedRight = null;
        const pair = state.currentGame.matchingGame.pairs.find(item => item.id === left.dataset.pair);
        matchingFeedback('good', pair
            ? `✓ Ghép chính xác! Hãy giải thích mối quan hệ giữa “${escapeHtml(pair.left)}” và “${escapeHtml(pair.right)}”.`
            : '✓ Ghép chính xác! Hãy giải thích vì sao hai nội dung này đi với nhau.');
        updateMatchingHeader();
        if (mp.matched >= state.currentGame.matchingGame.pairs.length) {
            GameAudio.play('correct');
            setTimeout(showMatchingComplete, 800);
        }
    }
    else {
        mp.wrong += 1;
        reactThree('match:incorrect', { wrong: mp.wrong });
        mp.lock = true;
        left.classList.add('wrong');
        right.classList.add('wrong');
        matchingFeedback('bad', '✕ Chưa đúng — thử lại.');
        setTimeout(() => {
            left.classList.remove('selected', 'wrong');
            right.classList.remove('selected', 'wrong');
            mp.selectedLeft = mp.selectedRight = null;
            mp.lock = false;
            updateMatchingHeader();
        }, 550);
    }
}
function renderMemoryBoard(root, m) {
    state.memoryCards = shuffled(m.pairs.flatMap(p => [
        { pair: p.id, text: p.left },
        { pair: p.id, text: p.right }
    ]));
    root.innerHTML = `<div class="game-stage" data-game="matching" data-game-world="matching" data-match-mode="memory">${gameWorldLabel('matching')}${matchingHeader()}<div class="stage-center"><div class="stage-col">${matchingIllustrationHtml(state.currentGame)}</div><div class="stage-col is-main"><div class="stage-kicker d-badge d-badge-neutral">LẬT THẺ GHI NHỚ</div><p class="field-hint">Lật từng thẻ để tìm hai nội dung tương ứng.</p><div class="memory-grid">${state.memoryCards.map((c, i) => `<button type="button" class="memory-card" data-memory="${i}" data-pair="${escapeHtml(c.pair)}"><span class="memory-face">?</span></button>`).join('')}</div><div id="matchFeedback"></div></div></div>${matchingFooter(m)}</div>`;
    paintProgress(root);
    $$('.memory-card', root).forEach(btn => btn.addEventListener('click', () => onMemoryCardClick(btn)));
    mountThreeStage($('.game-stage', root));
    sendPresentationState();
}
function onMemoryCardClick(btn) {
    const mp = state.matchingPlay;
    if (mp.lock || btn.classList.contains('matched') || btn.classList.contains('flipped'))
        return;
    const card = state.memoryCards[Number(btn.dataset.memory)];
    btn.classList.add('flipped');
    btn.querySelector('.memory-face').textContent = card.text;
    mp.flipped.push(btn);
    sendPresentationState();
    if (mp.flipped.length < 2)
        return;
    const [a, b] = mp.flipped;
    if (a.dataset.pair === b.dataset.pair) {
        a.classList.add('matched');
        b.classList.add('matched');
        mp.flipped = [];
        mp.matched += 1;
        matchingFeedback('good', '✓ Tìm thấy một cặp!');
        reactThree('match:correct', { matched: mp.matched });
        updateMatchingHeader();
        if (mp.matched >= state.currentGame.matchingGame.pairs.length)
            setTimeout(showMatchingComplete, 500);
    }
    else {
        mp.wrong += 1;
        mp.lock = true;
        matchingFeedback('bad', '✕ Không phải một cặp — lật lại.');
        reactThree('match:incorrect', { wrong: mp.wrong });
        setTimeout(() => {
            [a, b].forEach(el => {
                el.classList.remove('flipped', 'selected');
                el.querySelector('.memory-face').textContent = '?';
            });
            mp.flipped = [];
            mp.lock = false;
            updateMatchingHeader();
        }, 750);
    }
}
function renderCategorizeBoard(root, m) {
    const groups = [...new Set(m.pairs.map(p => p.left))];
    state.memoryCards = shuffled(m.pairs);
    root.innerHTML = `<div class="game-stage" data-game="matching" data-game-world="matching" data-match-mode="categorize">${gameWorldLabel('matching')}${matchingHeader()}<div class="stage-center"><div class="stage-col">${matchingIllustrationHtml(state.currentGame)}</div><div class="stage-col is-main"><div class="stage-kicker d-badge d-badge-neutral">PHÂN LOẠI KIẾN THỨC</div><p class="field-hint">Chọn một thẻ nội dung, rồi chọn đúng nhóm.</p><div class="category-cards">${state.memoryCards.map((p, i) => `<button type="button" class="match-card" data-category-card="${i}" data-pair="${escapeHtml(p.id)}">${escapeHtml(p.right)}</button>`).join('')}</div><div class="category-groups">${groups.map(g => `<div class="group-box" data-group="${escapeHtml(g)}"><strong>${escapeHtml(g)}</strong><div class="group-slots"></div></div>`).join('')}</div><div id="matchFeedback"></div></div></div>${matchingFooter(m)}</div>`;
    paintProgress(root);
    $$('[data-category-card]', root).forEach(btn => btn.addEventListener('click', () => {
        if (btn.classList.contains('matched') || state.matchingPlay.lock)
            return;
        $$('[data-category-card]').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        state.matchingPlay.selectedCard = btn;
        sendPresentationState();
    }));
    $$('.group-box', root).forEach(box => box.addEventListener('click', () => {
        const mp = state.matchingPlay;
        if (!mp.selectedCard || mp.lock)
            return;
        const pair = state.memoryCards[Number(mp.selectedCard.dataset.categoryCard)];
        if (pair.left === box.dataset.group) {
            mp.selectedCard.classList.add('matched');
            mp.selectedCard.classList.remove('selected');
            const chip = document.createElement('div');
            chip.className = 'group-chip matched';
            chip.textContent = pair.right;
            box.querySelector('.group-slots').appendChild(chip);
            mp.selectedCard = null;
            mp.matched += 1;
            matchingFeedback('good', `✓ Đúng nhóm “${box.dataset.group}”!`);
            reactThree('match:correct', { matched: mp.matched });
            updateMatchingHeader();
            if (mp.matched >= state.currentGame.matchingGame.pairs.length)
                setTimeout(showMatchingComplete, 500);
        }
        else {
            mp.wrong += 1;
            mp.selectedCard.classList.remove('selected');
            mp.selectedCard = null;
            matchingFeedback('bad', `✕ “${pair.right}” không thuộc nhóm “${box.dataset.group}”.`);
            reactThree('match:incorrect', { wrong: mp.wrong });
            updateMatchingHeader();
        }
    }));
    mountThreeStage($('.game-stage', root));
    sendPresentationState();
}
/**
 * Màn "đã ghép đủ cặp" — dừng lại, KHÔNG hiện điểm.
 *
 * Yêu cầu giáo viên: ghép xong thì dừng để cả lớp nhìn lại các đường nối và cùng
 * giải thích mối quan hệ, rồi mới bấm "Xem kết quả". Điểm, phần trăm và việc lưu
 * phiên chơi đều nằm SAU nút này (`renderMatchingResults`), nên một lần bấm nhầm
 * không thể làm mất cơ hội thảo luận.
 */
function matchingCompleteBar() {
    const mp = state.matchingPlay;
    const total = state.currentGame.matchingGame.pairs.length;
    return `<div class="matching-complete-bar" data-matching-complete>
      <div class="matching-complete-text">
        <strong>🎉 Đã ghép đủ ${mp.matched}/${total} cặp!</strong>
        <span>Cả lớp cùng nhìn lại các đường nối và giải thích mối quan hệ giữa hai nội dung của mỗi cặp. Kết quả chỉ hiện khi bấm nút.</span>
      </div>
      <button type="button" class="btn btn-primary matching-complete-btn" id="matchingResultsBtn">Xem kết quả →</button>
    </div>`;
}

/** Bind the bar's button; safe to call when the bar is absent. */
function bindMatchingCompleteBar() {
    const btn = $('#matchingResultsBtn');
    if (btn)
        btn.onclick = () => renderMatchingResults();
}

/**
 * Called when every pair is matched. Re-renders the board so the final connection
 * is visible, then pins the completion bar above it.
 */
function showMatchingComplete() {
    if (!state.matchingPlay) return;
    const m = state.currentGame.matchingGame;
    if (state.matchingPlay.matched < m.pairs.length) return;
    // The board is already drawn at this point for column/memory/categorize: the last
    // match mutated the DOM. Only the header and the bar need updating, so the
    // connection lines the class is looking at are never redrawn away.
    updateMatchingHeader();
    const root = $('#playBody');
    const stage = root && root.querySelector('.game-stage');
    if (!stage) return;
    if (!stage.querySelector('[data-matching-complete]')) {
        stage.insertAdjacentHTML('afterbegin', matchingCompleteBar());
    }
    bindMatchingCompleteBar();
    matchingFeedback('good', 'Hoàn thành! Bấm “Xem kết quả” khi cả lớp đã sẵn sàng.');
    reactThree('game:completed', { matched: state.matchingPlay.matched });
    // Deliberately NOT `isComplete: true`: that flips the projector to the results
    // view (`buildPresentationView`), which would reveal the score the teacher just
    // asked to hold back. The projector keeps showing the finished board.
    sendPresentationState();
}
async function renderMatchingResults() {
    const game = state.currentGame, m = game.matchingGame, mp = state.matchingPlay;
    lanFinishRoom();
    unmountThreeStage();
    const elapsed = (Date.now() - state.gameStart) / 1000;
    const summary = calculateMatchingSummary(m.pairs.length, mp.matched, mp.wrong, elapsed, m);
    state.lastSummary = summary;
    const { points, max, percent } = summary;
    const stats = resultStatsHtml([
        { icon: '◈', value: `${mp.matched}/${m.pairs.length}`, label: 'Cặp đã ghép' },
        { icon: '✕', value: `${mp.wrong}`, label: 'Lần ghép sai' },
        { icon: '⏱', value: formatClock(elapsed), label: 'Thời gian' },
        { icon: '🎯', value: `${percent}%`, label: 'Điểm tối đa' }
    ]);
    $('#playBody').innerHTML = `<div class="game-stage" data-game="matching" data-game-world="matching">${gameWorldLabel('matching')}<div class="result-screen"><div class="result-medal">${percent >= 80 ? '🏆' : percent >= 50 ? '🎖️' : '🌱'}</div><div class="stage-kicker">GHÉP CẶP HOÀN THÀNH</div><h2>${percent >= 80 ? 'Xuất sắc!' : percent >= 50 ? 'Ghép tốt lắm!' : 'Tiếp tục cố gắng!'}</h2><p>${escapeHtml(game.title)}</p><div class="result-score">${points.toLocaleString('vi-VN')} / ${max.toLocaleString('vi-VN')} điểm</div><p>Hoàn thành ${m.pairs.length} cặp · sai ${mp.wrong} lần · ${Math.round(elapsed)} giây · ${percent}% điểm tối đa</p>${stats}<p id="resultSaveStatus" class="result-save-status">Đang tự lưu kết quả…</p><div class="result-actions"><button class="btn btn-secondary" id="closeResultBtn">Đóng</button><button class="btn btn-secondary" id="replayBtn">↻ Chơi lại</button><button class="btn btn-primary" id="saveResultBtn">Đang lưu…</button></div></div></div>`;
    $('#closeResultBtn').onclick = () => closePlaySurface();
    $('#replayBtn').onclick = () => { state.playStartedAt = Date.now(); state.resultSession = null; resetMatchingPlay(); };
    wireResultSession(game, state.lastSummary, {
        answers: [],
        matching: { matched: mp.matched, wrongAttempts: mp.wrong, elapsedSeconds: Math.round(elapsed) }
    }, 'Đội 1');
    sendPresentationState({ isComplete: true });
}
// ---------- §5 Hành trình giải mã kho báu ----------
function openTreasurePlay() {
    const root = $('#modalRoot');
    const game = state.currentGame;
    root.innerHTML = playModalHtml('treasure', 'w-[min(980px,96vw)]', game.title, 'HÀNH TRÌNH KHÁM PHÁ · NGOẠI TUYẾN');
    bindPlayHeader(root);
    const hunt = game.treasureHunt;
    state.treasurePlay = { stageId: hunt.stages[0].id, earned: 0, results: [], itemsFound: {}, attemptsLeft: 0, steps: 0, answered: false, done: false, lastSelectedOptionId: null, storySeen: false };
    GameAudio.play('open');
    renderTreasureStage();
}
function treasureStageById(id) {
    return state.currentGame.treasureHunt.stages.find(stage => stage.id === id);
}
function treasureHash(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}
function treasureOrder(items, seed) {
    return items
        .map((item, index) => ({ item, index, rank: treasureHash(`${seed}:${item.id}:${index}`) }))
        .sort((a, b) => a.rank - b.rank || a.index - b.index)
        .map(entry => entry.item);
}
function treasureScrambleAnswer(answer) {
    const text = String(answer || '').normalize('NFC').trim();
    if (!text)
        return '';
    const words = text.split(/\s+/);
    if (words.length > 1) {
        const shuffled = treasureOrder(words.map((word, index) => ({ id: String(index), word })), text).map(entry => entry.word);
        if (shuffled.join(' ') === words.join(' '))
            shuffled.push(shuffled.shift());
        return shuffled.join(' ');
    }
    const chars = Array.from(text);
    if (chars.length < 2)
        return text;
    const shuffled = treasureOrder(chars.map((char, index) => ({ id: String(index), char })), text).map(entry => entry.char);
    if (shuffled.join('') === text)
        shuffled.push(shuffled.shift());
    return shuffled.join('');
}
function treasureNormalizeAnswer(value) {
    return String(value || '')
        .normalize('NFC')
        .toLocaleLowerCase('vi')
        .replace(/[.,!?;:()[\]{}"'“”‘’]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
function treasureNodeState(stageId, tp) {
    if (tp.results.some(result => result.stageId === stageId && result.correct))
        return 'done';
    if (tp.results.some(result => result.stageId === stageId))
        return 'failed';
    if (stageId === tp.stageId)
        return 'current';
    return 'locked';
}
function treasureMapHtml(hunt, tp) {
    const backgroundId = treasureBackgroundId(hunt.backgroundId);
    const characterId = treasureCharacterId(hunt.characterId);
    const nodes = hunt.stages.map((stage, index) => {
        const state = treasureNodeState(stage.id, tp);
        const meta = treasureMissionMeta[treasureMissionTypeOf(stage)];
        const dot = state === 'done' ? '✓' : state === 'failed' ? '✕' : String(index + 1);
        return `<div class="treasure-map-node is-${state}" data-stage-id="${escapeHtml(stage.id)}" data-state="${state}" title="${escapeHtml(stage.name || `Chặng ${index + 1}`)} · ${escapeHtml(meta.label)}">
      <span class="treasure-map-dot">${dot}</span>
      <span class="treasure-map-name">${escapeHtml(stage.name || `Chặng ${index + 1}`)}</span>
      <span class="treasure-map-meta">${meta.icon} ${escapeHtml(meta.label)}</span>
      ${stage.branchStageId ? '<span class="treasure-map-branch">↳ nhánh phụ</span>' : ''}
      ${stage.hasHiddenItem ? '<span class="treasure-map-item" title="Có vật phẩm ẩn">🎁</span>' : ''}
    </div>`;
    }).join('');
    const soundOn = GameAudio.isEnabled();
    return `<div class="treasure-map" data-treasure-map data-background="${backgroundId}" data-character="${characterId}">
    ${treasureBackdropHtml(backgroundId)}
    <div class="treasure-map-head">
      <div class="treasure-map-hero">${treasureAvatarHtml(characterId)}<span>HÀNH TRÌNH · ${escapeHtml(hunt.character || 'Nhà thám hiểm')}</span></div>
      <div class="treasure-map-status"><span>${tp.results.length}/${hunt.stages.length} chặng</span><button type="button" class="treasure-sound-toggle" data-treasure-sound aria-pressed="${soundOn}" aria-label="${soundOn ? 'Tắt âm thanh' : 'Bật âm thanh'}" title="${soundOn ? 'Tắt âm thanh' : 'Bật âm thanh'}">${soundOn ? '🔊' : '🔇'}<span>${soundOn ? 'Âm thanh' : 'Đã tắt'}</span></button></div>
    </div>
    <div class="treasure-map-track">${nodes}</div>
  </div>`;
}
function bindTreasureSoundToggle(root) {
    const button = $('[data-treasure-sound]', root);
    if (!button)
        return;
    button.onclick = () => {
        const enabled = GameAudio.toggle();
        button.setAttribute('aria-pressed', String(enabled));
        button.setAttribute('aria-label', enabled ? 'Tắt âm thanh' : 'Bật âm thanh');
        button.setAttribute('title', enabled ? 'Tắt âm thanh' : 'Bật âm thanh');
        button.innerHTML = `${enabled ? '🔊' : '🔇'}<span>${enabled ? 'Âm thanh' : 'Đã tắt'}</span>`;
        if (enabled)
            GameAudio.play('toggle');
    };
}
function treasureRecordStage(stage, correct) {
    const tp = state.treasurePlay;
    if (tp.answered)
        return 0;
    tp.answered = true;
    const gained = correct ? (Number(stage.points) || 0) + (Number(stage.completionBonus) || 0) : 0;
    tp.earned += gained;
    tp.results.push({ stageId: stage.id, correct, points: gained });
    return gained;
}
function markTreasureMapNode(stage, correct) {
    const node = $$('.treasure-map-node', $('#playBody')).find(entry => entry.dataset.stageId === stage.id);
    if (!node)
        return;
    node.classList.remove('is-current', 'is-done', 'is-failed');
    node.classList.add(correct ? 'is-done' : 'is-failed');
    node.dataset.state = correct ? 'done' : 'failed';
    const dot = node.querySelector('.treasure-map-dot');
    if (dot)
        dot.textContent = correct ? '✓' : '✕';
}
function treasureUseAttempt(stage) {
    const tp = state.treasurePlay;
    if (tp.attemptsLeft > 0)
        tp.attemptsLeft -= 1;
    const out = stage.attempts > 0 && tp.attemptsLeft === 0;
    const hint = $('#treasureAttemptsHint', $('#playBody'));
    if (hint && stage.attempts > 0) {
        hint.textContent = out
            ? 'Hết lượt thử — xem gợi ý và đáp án'
            : `Còn ${tp.attemptsLeft} lượt thử · sai không bị trừ điểm`;
    }
    return out;
}
function treasureCompleteMission(stage, correct, message) {
    const gained = treasureRecordStage(stage, correct);
    reactThree(correct ? 'answer:correct' : 'answer:incorrect', { correct });
    if (correct && !treasureNextStage(stage) && !treasureBranchStage(stage))
        reactThree('game:completed', { stageId: stage.id });
    const fb = $('#answerFeedback', $('#playBody'));
    if (fb) {
        fb.className = `feedback ${correct ? 'good' : 'bad'}`;
        fb.innerHTML = message;
    }
    markTreasureMapNode(stage, correct);
    showTreasureChoices(stage, correct);
    return gained;
}
function renderTreasureMissionBody(stage, missionType) {
    const meta = treasureMissionMeta[missionType];
    if (missionType === 'matching') {
        const pairs = stage.mission?.pairs || [];
        const left = pairs.map(pair => `<button type="button" class="treasure-match-item" data-match-left="${escapeHtml(pair.id)}">${escapeHtml(pair.left)}</button>`).join('');
        const right = treasureOrder(pairs, `${stage.id}:right`)
            .map(pair => `<button type="button" class="treasure-match-item" data-match-right="${escapeHtml(pair.id)}">${escapeHtml(pair.right)}</button>`).join('');
        return `<div class="treasure-mission treasure-mission-matching" data-mission="matching">
      <p class="mission-instruction">${meta.icon} ${meta.short}. Chọn một thẻ bên trái rồi chọn thẻ khớp bên phải.</p>
      <div class="treasure-match-grid">
        <div class="treasure-match-col"><div class="mission-col-title">VẾ TRÁI</div>${left}</div>
        <div class="treasure-match-col"><div class="mission-col-title">VẾ PHẢI</div>${right}</div>
        <svg class="matching-connector-canvas" aria-hidden="true"></svg>
      </div>
      <div class="mission-status" id="missionStatus" role="status"></div>
    </div>`;
    }
    if (missionType === 'decode') {
        const cipher = stage.mission?.cipher || treasureScrambleAnswer(stage.mission?.answer);
        return `<div class="treasure-mission treasure-mission-decode" data-mission="decode">
      <p class="mission-instruction">${meta.icon} ${meta.short}. Dùng gợi ý của chặng để sắp xếp lại mật mã.</p>
      <div class="decode-cipher" data-cipher="${escapeHtml(cipher)}">${escapeHtml(cipher)}</div>
      <div class="decode-form"><input id="treasureDecodeInput" type="text" autocomplete="off" placeholder="Nhập đáp án đã giải mã"><button type="button" class="btn btn-primary" id="treasureDecodeSubmit">Giải mã</button></div>
      <div class="mission-status" id="missionStatus" role="status"></div>
    </div>`;
    }
    if (missionType === 'classification') {
        const groups = stage.mission?.groups || [];
        const items = stage.mission?.items || [];
        const pool = items.map(item => `<button type="button" class="treasure-class-item" data-class-item="${escapeHtml(item.id)}">${escapeHtml(item.text)}</button>`).join('');
        const columns = groups.map(group => `<div class="treasure-class-group" data-class-group="${escapeHtml(group.id)}" role="button" tabindex="0">
      <div class="treasure-class-title">${escapeHtml(group.name)}</div>
      <div class="treasure-class-slots" data-class-slots></div>
    </div>`).join('');
        return `<div class="treasure-mission treasure-mission-classification" data-mission="classification">
      <p class="mission-instruction">${meta.icon} ${meta.short}. Chọn một mục rồi chọn nhóm phù hợp.</p>
      <div class="treasure-class-pool" data-class-pool>${pool}</div>
      <div class="treasure-class-groups">${columns}</div>
      <div class="mission-status" id="missionStatus" role="status"></div>
    </div>`;
    }
    const choices = (stage.question?.options || []).map((option, index) => `<button class="answer-option" data-answer="${escapeHtml(option.id)}"><span class="letter">${String.fromCharCode(65 + index)}</span><span>${escapeHtml(option.text)}</span></button>`).join('');
    return `<div class="answer-grid treasure-mission-choices" data-mission="${missionType}">${choices}</div>`;
}
function bindTreasureMatching(stage) {
    const tp = state.treasurePlay;
    const root = $('#playBody');
    const grid = $('.treasure-match-grid', root);
    if (grid)
        initMatchingConnectors(grid);
    const status = $('#missionStatus', root);
    const leftButtons = $$('[data-match-left]', root);
    const rightButtons = $$('[data-match-right]', root);
    let selected = null;
    leftButtons.forEach(button => {
        button.onclick = () => {
            if (tp.answered || button.classList.contains('matched'))
                return;
            leftButtons.forEach(entry => entry.classList.remove('selected'));
            button.classList.add('selected');
            selected = button.dataset.matchLeft;
            if (status)
                status.textContent = `Đã chọn “${button.textContent}”. Chọn vế khớp bên phải.`;
        };
    });
    rightButtons.forEach(button => {
        button.onclick = () => {
            if (tp.answered || button.classList.contains('matched'))
                return;
            if (!selected) {
                toast('Chọn một thẻ bên trái trước.');
                return;
            }
            const leftButton = leftButtons.find(entry => entry.dataset.matchLeft === selected);
            if (!leftButton)
                return;
            if (selected === button.dataset.matchRight) {
                leftButton.classList.remove('selected');
                leftButton.classList.add('matched');
                button.classList.add('matched');
                leftButton.disabled = true;
                button.disabled = true;
                selected = null;
                const matched = leftButtons.filter(entry => entry.classList.contains('matched')).length;
                if (grid) {
                    addMatchingConnection(grid, leftButton, button, matched - 1);
                }
                GameAudio.play('match');
                if (status)
                    status.textContent = `✓ Đã ghép ${matched}/${stage.mission.pairs.length} cặp.`;
                sendPresentationState();
                if (matched >= stage.mission.pairs.length) {
                    const gained = (Number(stage.points) || 0) + (Number(stage.completionBonus) || 0);
                    GameAudio.play('correct');
                    treasureCompleteMission(stage, true, `<strong>✓ Đã ghép đủ ${stage.mission.pairs.length} cặp!</strong> +${gained} điểm.<br>${escapeHtml(stage.question.explanation || '')}`);
                }
            }
            else {
                leftButton.classList.add('wrong');
                button.classList.add('wrong');
                GameAudio.play('wrong');
                setTimeout(() => { leftButton.classList.remove('wrong'); button.classList.remove('wrong'); }, 500);
                const out = treasureUseAttempt(stage);
                const fb = $('#answerFeedback', root);
                if (out) {
                    leftButtons.forEach(entry => { entry.classList.add('matched', 'revealed'); entry.disabled = true; });
                    rightButtons.forEach(entry => { entry.classList.add('matched', 'revealed'); entry.disabled = true; });
                    if (status)
                        status.textContent = 'Đáp án đúng đã được mở.';
                    treasureCompleteMission(stage, false, `<strong>✕ Hết lượt thử.</strong> ${stage.question.hint ? `💡 Gợi ý: ${escapeHtml(stage.question.hint)}<br>` : ''}Đáp án đúng đã được mở.<br>${escapeHtml(stage.question.explanation || '')}`);
                }
                else if (fb) {
                    fb.className = 'feedback bad';
                    fb.innerHTML = `<strong>✕ Chưa khớp.</strong> ${stage.attempts > 0 ? `Còn ${tp.attemptsLeft} lượt thử — hãy thử vế khác.` : 'Hãy thử ghép lại.'}`;
                }
            }
        };
    });
}
function bindTreasureClassification(stage) {
    const tp = state.treasurePlay;
    const root = $('#playBody');
    const status = $('#missionStatus', root);
    const itemButtons = $$('[data-class-item]', root);
    const groupButtons = $$('[data-class-group]', root);
    let selected = null;
    itemButtons.forEach(button => {
        button.onclick = () => {
            if (tp.answered || button.classList.contains('placed'))
                return;
            itemButtons.forEach(entry => entry.classList.remove('selected'));
            button.classList.add('selected');
            selected = button;
            if (status)
                status.textContent = `Đã chọn “${button.textContent}”. Chọn nhóm phù hợp.`;
        };
    });
    groupButtons.forEach(group => {
        group.onkeydown = event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                group.click();
            }
        };
        group.onclick = event => {
            if (tp.answered || event.target.closest('[data-class-item]'))
                return;
            if (!selected) {
                toast('Chọn một mục cần phân loại trước.');
                return;
            }
            const model = stage.mission.items.find(item => item.id === selected.dataset.classItem);
            if (model && model.groupId === group.dataset.classGroup) {
                selected.classList.remove('selected');
                selected.classList.add('placed');
                selected.disabled = true;
                group.querySelector('[data-class-slots]').appendChild(selected);
                selected = null;
                const placed = itemButtons.filter(entry => entry.classList.contains('placed')).length;
                GameAudio.play('match');
                if (status)
                    status.textContent = `✓ Đã xếp ${placed}/${itemButtons.length} mục.`;
                sendPresentationState();
                if (placed >= itemButtons.length) {
                    const gained = (Number(stage.points) || 0) + (Number(stage.completionBonus) || 0);
                    GameAudio.play('correct');
                    treasureCompleteMission(stage, true, `<strong>✓ Đã xếp đúng tất cả ${itemButtons.length} mục!</strong> +${gained} điểm.<br>${escapeHtml(stage.question.explanation || '')}`);
                }
            }
            else {
                group.classList.add('wrong');
                GameAudio.play('wrong');
                setTimeout(() => group.classList.remove('wrong'), 500);
                const out = treasureUseAttempt(stage);
                const fb = $('#answerFeedback', root);
                if (out) {
                    itemButtons.forEach(entry => {
                        if (entry.classList.contains('placed'))
                            return;
                        const item = stage.mission.items.find(entryItem => entryItem.id === entry.dataset.classItem);
                        const target = groupButtons.find(entryGroup => entryGroup.dataset.classGroup === item?.groupId);
                        if (target)
                            target.querySelector('[data-class-slots]').appendChild(entry);
                        entry.classList.add('placed', 'revealed');
                        entry.disabled = true;
                    });
                    if (status)
                        status.textContent = 'Đáp án đúng đã được mở.';
                    treasureCompleteMission(stage, false, `<strong>✕ Hết lượt thử.</strong> ${stage.question.hint ? `💡 Gợi ý: ${escapeHtml(stage.question.hint)}<br>` : ''}Đáp án đúng đã được mở.<br>${escapeHtml(stage.question.explanation || '')}`);
                }
                else if (fb) {
                    fb.className = 'feedback bad';
                    fb.innerHTML = `<strong>✕ Chưa đúng nhóm.</strong> ${stage.attempts > 0 ? `Còn ${tp.attemptsLeft} lượt thử — hãy thử nhóm khác.` : 'Hãy thử lại.'}`;
                }
            }
        };
    });
}
function bindTreasureDecode(stage) {
    const tp = state.treasurePlay;
    const root = $('#playBody');
    const input = $('#treasureDecodeInput', root);
    const submit = $('#treasureDecodeSubmit', root);
    const status = $('#missionStatus', root);
    if (!input || !submit)
        return;
    const tryDecode = () => {
        if (tp.answered)
            return;
        const value = input.value.trim();
        if (!value) {
            toast('Hãy nhập đáp án đã giải mã.');
            input.focus();
            return;
        }
        if (treasureNormalizeAnswer(value) === treasureNormalizeAnswer(stage.mission.answer)) {
            input.disabled = true;
            submit.disabled = true;
            const gained = (Number(stage.points) || 0) + (Number(stage.completionBonus) || 0);
            GameAudio.play('correct');
            treasureCompleteMission(stage, true, `<strong>✓ Đã giải mã chính xác!</strong> +${gained} điểm.<br>${escapeHtml(stage.question.explanation || '')}`);
            return;
        }
        GameAudio.play('wrong');
        const out = treasureUseAttempt(stage);
        const fb = $('#answerFeedback', root);
        if (out) {
            input.disabled = true;
            submit.disabled = true;
            if (status)
                status.textContent = 'Đáp án đúng đã được mở.';
            treasureCompleteMission(stage, false, `<strong>✕ Hết lượt thử.</strong> ${stage.question.hint ? `💡 Gợi ý: ${escapeHtml(stage.question.hint)}<br>` : ''}Đáp án đúng: <strong>${escapeHtml(stage.mission.answer)}</strong>.<br>${escapeHtml(stage.question.explanation || '')}`);
            return;
        }
        if (fb) {
            fb.className = 'feedback bad';
            fb.innerHTML = `<strong>✕ Chưa đúng.</strong> ${stage.attempts > 0 ? `Còn ${tp.attemptsLeft} lượt thử — hãy thử lại.` : 'Hãy thử lại.'}`;
        }
        if (status)
            status.textContent = 'Mật mã chưa đúng. Đọc lại gợi ý của chặng.';
        input.select();
    };
    submit.onclick = tryDecode;
    input.onkeydown = event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            tryDecode();
        }
    };
    input.focus();
}
function openTreasureStoryModal(stage, hunt, tp) {
    const characterId = treasureCharacterId(hunt.characterId);
    const missionType = treasureMissionTypeOf(stage);
    const mission = treasureMissionMeta[missionType];
    const modalRoot = $('#modalRoot') || document.body;
    const existing = $('#treasureStoryModal');
    if (existing)
        existing.remove();
    const modal = document.createElement('div');
    modal.id = 'treasureStoryModal';
    modal.className = 'treasure-story-backdrop';
    modal.innerHTML = `<div class="treasure-story-dialog" role="dialog" aria-modal="true" aria-labelledby="storyDialogTitle">
    <div class="treasure-story-dialog-head">
      <div class="flex items-center gap-3">
        ${treasureAvatarHtml(characterId, 'is-small')}
        <div>
          <h3 id="storyDialogTitle" class="text-base font-bold text-white m-0">📜 Bối cảnh & Nhiệm vụ: ${escapeHtml(stage.name || 'Chặng khám phá')}</h3>
          <div class="text-xs text-[#aeb5ce] mt-0.5">${escapeHtml(hunt.character || 'Nhà thám hiểm')} · ${mission.icon} ${escapeHtml(mission.label)}</div>
        </div>
      </div>
      <button type="button" class="treasure-story-close-btn" id="closeStoryModalX" aria-label="Đóng">✕</button>
    </div>
    <div class="treasure-story-dialog-body">
      ${tp.results.length === 0 && hunt.intro ? `<div class="treasure-story-block">
        <div class="story-block-tag d-badge d-badge-primary d-badge-sm">KHỞI ĐẦU HÀNH TRÌNH</div>
        <p class="story-block-text">${escapeHtml(hunt.intro).replace(/\n/g, '<br>')}</p>
      </div>` : ''}
      ${stage.story ? `<div class="treasure-story-block">
        <div class="story-block-tag d-badge d-badge-neutral d-badge-sm">CỐT TRUYỆN CHẶNG</div>
        <p class="story-block-text">${escapeHtml(stage.story).replace(/\n/g, '<br>')}</p>
      </div>` : ''}
      <div class="treasure-story-block is-mission">
        <div class="story-block-tag d-badge d-badge-warning d-badge-sm">LUẬT & NHIỆM VỤ GIẢI MÃ</div>
        <div class="mission-lead"><strong>${mission.icon} ${escapeHtml(mission.label)}:</strong> ${escapeHtml(mission.short)}</div>
        ${stage.taskDescription ? `<p class="story-block-text text-[#ffe6a8] font-medium">${escapeHtml(stage.taskDescription).replace(/\n/g, '<br>')}</p>` : ''}
        <div class="mission-specs">
          <span class="spec-chip">🎯 Lượt thử: <b>${stage.attempts > 0 ? `${stage.attempts} lượt` : 'Không giới hạn'}</b></span>
          <span class="spec-chip">🏆 Điểm câu đố: <b>+${Number(stage.points) || 100}</b></span>
          ${stage.completionBonus ? `<span class="spec-chip">✨ Thưởng chặng: <b>+${stage.completionBonus}</b></span>` : ''}
        </div>
      </div>
    </div>
    <div class="treasure-story-dialog-foot">
      <button type="button" class="btn btn-primary d-btn d-btn-primary" id="confirmStoryModalBtn">Đã hiểu luật, bắt đầu giải mã! 🚀</button>
    </div>
  </div>`;
    modalRoot.appendChild(modal);
    const close = () => {
        modal.classList.add('is-closing');
        setTimeout(() => modal.remove(), 180);
    };
    const closeX = $('#closeStoryModalX', modal);
    if (closeX)
        closeX.onclick = close;
    const confirmBtn = $('#confirmStoryModalBtn', modal);
    if (confirmBtn)
        confirmBtn.onclick = close;
    modal.onclick = (e) => { if (e.target === modal)
        close(); };
}
function renderTreasureStage() {
    const hunt = state.currentGame.treasureHunt, tp = state.treasurePlay;
    const root = $('#playBody');
    if (tp.done || tp.steps >= 100 || !tp.stageId)
        return renderTreasureResults();
    const stage = treasureStageById(tp.stageId);
    if (!stage)
        return renderTreasureResults();
    tp.steps += 1;
    tp.attemptsLeft = stage.attempts || 0;
    tp.answered = false;
    const stageIndex = hunt.stages.findIndex(entry => entry.id === stage.id);
    const stageNo = stageIndex >= 0 ? stageIndex + 1 : tp.results.length + 1;
    const missionType = treasureMissionTypeOf(stage);
    const mission = treasureMissionMeta[missionType];
    const itemCount = Object.keys(tp.itemsFound).length;
    const characterId = treasureCharacterId(hunt.characterId);
    const illustrationHtml = stageIllustrationHtml(stage.question, state.currentGame, 'is-stage is-treasure');
    // Bối cảnh + nhiệm vụ sống trong pop-up "📜 Bối cảnh & Nhiệm vụ chặng" (nút ở
    // tiêu đề chặng). Bản inline đã bị bỏ theo yêu cầu: cột chữ trả lại chỗ cho
    // câu hỏi và đáp án.
    const hasStory = Boolean((tp.results.length === 0 && hunt.intro) || stage.story || stage.taskDescription);
    root.innerHTML = `<div class="game-stage" data-game="treasure" data-game-world="treasure" data-treasure-world="${treasureBackgroundId(hunt.backgroundId)}"><div class="treasure-head-row"><div class="treasure-head-world">${gameWorldLabel('treasure')}</div>${hasStory ? `<div class="treasure-story-row"><button type="button" class="btn btn-secondary btn-small treasure-story-trigger d-btn d-btn-sm d-btn-outline" id="treasureStoryBtn">${treasureAvatarHtml(characterId, 'is-small')} 📜 <span>Bối cảnh & Nhiệm vụ chặng</span></button></div>` : ''}</div>
    <div class="stage-top"><span class="stage-meta flex items-center gap-2"><span>HÀNH TRÌNH · ${escapeHtml(hunt.character || 'Nhà thám hiểm')}</span><button type="button" class="treasure-map-toggle-btn d-btn d-btn-xs d-btn-ghost text-[#b3adff]" id="treasureMapToggleBtn" title="Xem/ẩn bản đồ">🗺️ <span id="treasureMapToggleLabel">${tp.answered ? 'Bản đồ hành trình' : 'Xem bản đồ'}</span></button></span><span class="stage-meta stage-meta-right">${mission.icon} ${escapeHtml(mission.label.toUpperCase())} · CHẶNG ${stageNo}/${hunt.stages.length} · 🏆 ${tp.earned} điểm${itemCount ? ` · 🎁 ${itemCount} vật phẩm` : ''}</span></div>
    <div class="stage-progress"><div data-progress="${Math.round((stageNo - 1) / hunt.stages.length * 100)}"></div></div>
    <div class="treasure-map-drawer ${tp.answered ? 'is-answered' : 'is-answering'}" id="treasureMapDrawer">
      ${treasureMapHtml(hunt, tp)}
    </div>
    <div class="stage-center treasure-stage-grid">
      <div class="stage-col stage-side-col treasure-illustration-col">
        ${illustrationHtml}
        <div class="treasure-chapter-now" aria-live="polite">
          <span class="treasure-chapter-label">Chặng</span>
          <span class="treasure-chapter-value">${stageNo}<span class="treasure-chapter-total">/${hunt.stages.length}</span></span>
          <span class="treasure-chapter-name">${escapeHtml(stage.name || 'Chặng khám phá')}</span>
        </div>
        ${illustrationHtml ? '<div id="answerFeedback" class="feedback-under-illustration"></div>' : ''}
      </div>
      <div class="stage-col is-main">

      <div class="treasure-mission-badge d-badge d-badge-warning d-badge-lg font-bold">${mission.icon} ${escapeHtml(mission.label)} · ${escapeHtml(mission.short)}</div>
      <div class="stage-question">${escapeHtml(stage.question.prompt).replace(/\n/g, '<br>')}</div>
      <div id="treasureMission">${renderTreasureMissionBody(stage, missionType)}</div>
      <div id="treasureExtra">${stage.hasHiddenItem && !tp.itemsFound[stage.id] ? `<button type="button" class="btn btn-secondary btn-small mt-[10px]" id="findItemBtn">🎁 Tìm vật phẩm ẩn (+${hunt.hiddenItemBonus || 50})</button> ` : ''}</div>
      ${!illustrationHtml ? '<div id="answerFeedback"></div>' : ''}
      <div id="treasureActions"></div>
      </div>
    </div>
    <div class="stage-bottom"><span id="treasureAttemptsHint">${stage.attempts > 0 ? (tp.attemptsLeft > 0 ? `Còn ${tp.attemptsLeft} lượt thử` : 'Hết lượt thử') : 'Không giới hạn lượt thử'} · sai không bị trừ điểm</span></div>
    ${stage.question.hint ? `<button type="button" class="treasure-hint-fab" id="treasureHintBtn" title="Dùng gợi ý" aria-label="Dùng gợi ý"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2Z"/></svg></button>` : ''}
  </div>`;
    paintProgress(root);
    bindTreasureSoundToggle(root);
    const storyBtn = $('#treasureStoryBtn', root);
    if (storyBtn)
        storyBtn.onclick = () => openTreasureStoryModal(stage, hunt, tp);
    const mapToggleBtn = $('#treasureMapToggleBtn', root);
    if (mapToggleBtn) {
        const syncMapToggle = () => {
            const drawer = $('#treasureMapDrawer', root);
            const label = $('#treasureMapToggleLabel', root);
            if (!drawer || !label)
                return;
            // Once the stage is answered the drawer is permanently visible, so the
            // button must read "Ẩn bản đồ" — the old `is-peek-open`-only check reset
            // it to "Xem bản đồ" on every stage render even though the map was shown.
            const open = drawer.classList.contains('is-peek-open') || drawer.classList.contains('is-answered');
            label.textContent = open ? 'Ẩn bản đồ' : 'Xem bản đồ';
            mapToggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        };
        syncMapToggle();
        mapToggleBtn.onclick = () => {
            const drawer = $('#treasureMapDrawer', root);
            if (!drawer)
                return;
            drawer.classList.toggle('is-peek-open');
            syncMapToggle();
        };
    }
    if (missionType === 'matching')
        bindTreasureMatching(stage);
    else if (missionType === 'classification')
        bindTreasureClassification(stage);
    else if (missionType === 'decode')
        bindTreasureDecode(stage);
    else
        $$('.answer-option', root).forEach(btn => btn.addEventListener('click', () => chooseTreasureAnswer(btn.dataset.answer)));
    const itemBtn = $('#findItemBtn', root);
    if (itemBtn)
        itemBtn.onclick = () => {
            tp.itemsFound[stage.id] = true;
            tp.earned += hunt.hiddenItemBonus || 50;
            itemBtn.remove();
            GameAudio.play('item');
            toast(`Tìm thấy vật phẩm ẩn! +${hunt.hiddenItemBonus || 50} điểm.`);
            sendPresentationState();
        };
    const hintBtn = $('#treasureHintBtn', root);
    if (hintBtn)
        hintBtn.onclick = () => {
            const fb = $('#answerFeedback', root);
            fb.className = 'feedback good is-hint';
            fb.innerHTML = `<strong>💡 Gợi ý:</strong> ${escapeHtml(stage.question.hint)}`;
            GameAudio.play('hint');
        };
    mountThreeStage($('.game-stage', root));
    sendPresentationState();
}
function treasureNextStage(stage) {
    const hunt = state.currentGame.treasureHunt;
    if (!hunt || !Array.isArray(hunt.stages))
        return null;
    if (stage.nextStageId) {
        const found = treasureStageById(stage.nextStageId);
        if (found)
            return found;
    }
    const currentIndex = hunt.stages.findIndex(s => s.id === stage.id);
    if (currentIndex >= 0 && currentIndex < hunt.stages.length - 1) {
        return hunt.stages[currentIndex + 1];
    }
    return null;
}
function treasureBranchStage(stage) {
    if (stage.branchStageId && stage.branchLabel) {
        return treasureStageById(stage.branchStageId);
    }
    return null;
}
function renderTreasureJourneyMap(stage, answeredCorrectly) {
    const hunt = state.currentGame.treasureHunt, tp = state.treasurePlay;
    const root = $('#playBody');
    const nextStage = treasureNextStage(stage);
    const branchStage = treasureBranchStage(stage);
    const stageIndex = hunt.stages.findIndex(s => s.id === stage.id);
    const stageNo = stageIndex >= 0 ? stageIndex + 1 : tp.results.length;
    root.innerHTML = `<div class="game-stage is-journey-screen" data-game="treasure" data-game-world="treasure" data-treasure-world="${treasureBackgroundId(hunt.backgroundId)}">${gameWorldLabel('treasure')}
    <div class="stage-top">
      <span class="stage-meta flex items-center gap-2">
        <span>HÀNH TRÌNH KHÁM PHÁ · ${escapeHtml(hunt.character || 'Nhà thám hiểm')}</span>
      </span>
      <span class="stage-meta stage-meta-right flex items-center gap-2">🏆 ${tp.earned} điểm · CHẶNG ${stageNo}/${hunt.stages.length}
        <button type="button" class="d-btn d-btn-xs d-btn-ghost text-[#ffd977]" id="journeyEndBtn" title="Kết thúc hành trình ngay, không chơi tiếp các chặng còn lại">🏁 Kết thúc hành trình</button>
      </span>
    </div>

    <div class="journey-map-full-container">
      <div class="journey-map-headline">
        <h2>🗺️ BẢN ĐỒ HÀNH TRÌNH NHÀ THÁM HIỂM</h2>
        <p class="journey-map-sub">
          ${answeredCorrectly ? '✓ Bạn đã vượt qua chặng này xuất sắc!' : '✕ Chặng này chưa đạt điểm tối đa, nhưng hành trình vẫn tiếp tục!'}
        </p>
      </div>

      <div class="journey-map-frame">
        ${treasureMapHtml(hunt, tp)}
      </div>

      <div class="journey-next-stage-card">
        ${nextStage ? `
          <div class="next-stage-badge d-badge d-badge-primary font-bold">CHẶNG TIẾP THEO: ${escapeHtml(nextStage.name || 'Chặng mới')}</div>
          <div class="next-stage-desc">
            ${nextStage.taskDescription ? `<p class="next-stage-task">🎯 ${escapeHtml(nextStage.taskDescription)}</p>` : ''}
            <p class="next-stage-type">Loại thử thách: <b>${treasureMissionMeta[treasureMissionTypeOf(nextStage)].icon} ${escapeHtml(treasureMissionMeta[treasureMissionTypeOf(nextStage)].label)}</b></p>
          </div>
          <div class="journey-actions-row">
            <button type="button" class="btn btn-primary btn-large journey-btn-main" id="journeyGoNextBtn">
              Bước vào chặng tiếp theo ➔
            </button>
            ${branchStage ? `
              <button type="button" class="btn btn-secondary journey-btn-branch" id="journeyGoBranchBtn">
                ↳ Rẽ sang nhánh: ${escapeHtml(stage.branchLabel)} ➔
              </button>
            ` : ''}
          </div>
        ` : `
          <div class="next-stage-badge d-badge d-badge-warning font-bold">ĐÍCH ĐẾN CUỐI CÙNG</div>
          <div class="next-stage-desc">
            <p class="next-stage-task font-bold text-lg text-[#ffd977]">✨ Bạn đã đi qua mọi chặng của cuộc hành trình!</p>
            <p>Kho báu huyền bí đang chờ bạn mở ra.</p>
          </div>
          <div class="journey-actions-row">
            <button type="button" class="btn btn-primary btn-large journey-btn-main is-finish" id="journeyGoFinishBtn">
              🏠 Mở kho báu ngay ➔
            </button>
          </div>
        `}
      </div>
    </div>
  </div>`;
    paintProgress(root);
    bindTreasureSoundToggle(root);
    // Animate the explorer marker moving forward to next stage
    if (nextStage) {
        const nextNode = $$('.treasure-map-node', root).find(el => el.dataset.stageId === nextStage.id);
        if (nextNode) {
            setTimeout(() => {
                nextNode.classList.add('is-target-advance');
            }, 250);
        }
    }
    const goNextBtn = $('#journeyGoNextBtn', root);
    if (goNextBtn && nextStage) {
        goNextBtn.onclick = () => {
            GameAudio.play('stage');
            goNextBtn.disabled = true;
            tp.stageId = nextStage.id;
            lanAdvanceRound();
            renderTreasureStage();
        };
    }
    const goBranchBtn = $('#journeyGoBranchBtn', root);
    if (goBranchBtn && branchStage) {
        goBranchBtn.onclick = () => {
            GameAudio.play('stage');
            goBranchBtn.disabled = true;
            tp.stageId = branchStage.id;
            // LAN: a branch jumps to a different stage, so the phones must follow.
            lanAdvanceRound();
            renderTreasureStage();
        };
    }
    const goFinishBtn = $('#journeyGoFinishBtn', root);
    if (goFinishBtn) {
        goFinishBtn.onclick = () => {
            tp.done = true;
            // LAN: the journey is over — end the room so the honour roll can show.
            lanFinishRoom();
            renderTreasureResults();
        };
    }
    const endBtn = $('#journeyEndBtn', root);
    if (endBtn) {
        endBtn.onclick = () => {
            if (!window.confirm('Kết thúc hành trình ngay? Các chặng còn lại sẽ không được tính điểm.'))
                return;
            tp.done = true;
            GameAudio.play('stage');
            lanFinishRoom();
            renderTreasureResults();
        };
    }
    mountThreeStage($('.game-stage', root));
    sendPresentationState();
}
function showTreasureChoices(stage, answeredCorrectly) {
    const actions = $('#treasureActions');
    if (!actions)
        return;
    actions.innerHTML = `<div class="mt-4 flex items-center justify-center gap-2 flex-wrap">
    <button type="button" class="btn btn-primary btn-large treasure-continue-btn" id="treasureContinueBtn">
      Tiếp tục: Xem bản đồ hành trình ➔
    </button>
    <button type="button" class="btn btn-secondary btn-small" id="treasureEndBtn" title="Kết thúc hành trình ngay, không chơi tiếp các chặng còn lại">🏁 Kết thúc hành trình</button>
  </div>`;
    const continueBtn = $('#treasureContinueBtn', actions);
    if (continueBtn) {
        continueBtn.onclick = () => {
            GameAudio.play('stage');
            renderTreasureJourneyMap(stage, answeredCorrectly);
        };
    }
    const endBtn = $('#treasureEndBtn', actions);
    if (endBtn) {
        endBtn.onclick = () => {
            if (!window.confirm('Kết thúc hành trình ngay? Các chặng còn lại sẽ không được tính điểm.'))
                return;
            state.treasurePlay.done = true;
            GameAudio.play('stage');
            renderTreasureResults();
        };
    }
    sendPresentationState();
}
function chooseTreasureAnswer(optionId) {
    const tp = state.treasurePlay;
    if (tp.answered)
        return;
    tp.lastSelectedOptionId = optionId;
    const stage = treasureStageById(tp.stageId);
    if (!stage)
        return;
    const root = $('#playBody');
    const correct = optionId === stage.question.correctOptionId;
    const fb = $('#answerFeedback', root);
    GameAudio.play(correct ? 'correct' : 'wrong');
    reactThree(correct ? 'answer:correct' : 'answer:incorrect', { correct });
    if (correct && !treasureNextStage(stage) && !treasureBranchStage(stage))
        reactThree('game:completed', { stageId: stage.id });
    if (correct) {
        const gained = treasureRecordStage(stage, true);
        $$('.answer-option', root).forEach(btn => { btn.disabled = true; if (btn.dataset.answer === stage.question.correctOptionId)
            btn.classList.add('correct'); });
        if (fb) {
            fb.className = 'feedback good';
            fb.innerHTML = `<strong>✓ Tìm được chìa khóa!</strong> +${stage.points} điểm câu đố · +${stage.completionBonus} điểm hoàn thành chặng.<br>${escapeHtml(stage.question.explanation || '')}`;
        }
        markTreasureMapNode(stage, true);
        showTreasureChoices(stage, true);
        return;
    }
    const out = treasureUseAttempt(stage);
    if (out) {
        treasureRecordStage(stage, false);
        $$('.answer-option', root).forEach(btn => {
            btn.disabled = true;
            if (btn.dataset.answer === stage.question.correctOptionId)
                btn.classList.add('correct');
            else if (btn.dataset.answer === optionId)
                btn.classList.add('wrong');
        });
        if (fb) {
            fb.className = 'feedback bad';
            fb.innerHTML = `<strong>✕ Hết lượt thử.</strong> ${stage.question.hint ? `💡 Gợi ý: ${escapeHtml(stage.question.hint)}<br>` : ''}Đáp án đúng đã được đánh dấu.<br>${escapeHtml(stage.question.explanation || '')}`;
        }
        markTreasureMapNode(stage, false);
        showTreasureChoices(stage, false);
    }
    else {
        $$('.answer-option', root).forEach(btn => { if (btn.dataset.answer === optionId)
            btn.classList.add('wrong'); });
        if (fb) {
            fb.className = 'feedback bad';
            fb.innerHTML = `<strong>✕ Chưa đúng.</strong> ${stage.attempts > 0 ? `Còn ${tp.attemptsLeft} lượt thử — hãy suy nghĩ kỹ.` : 'Thử lại với đáp án khác.'}`;
        }
    }
    sendPresentationState();
}
function renderTreasureResults() {
    const hunt = state.currentGame.treasureHunt, tp = state.treasurePlay;
    unmountThreeStage();
    if (tp.done && tp.resultShown)
        return;
    // LAN: the last stage and the "end journey" button both land here.
    lanFinishRoom();
    const completed = tp.done;
    if (completed) {
        tp.earned += hunt.journeyBonus || 300;
        tp.done = true;
    }
    tp.resultShown = true;
    if (completed)
        GameAudio.play('reward');
    const itemSlots = hunt.stages.filter(stage => stage.hasHiddenItem).length;
    const max = hunt.stages.reduce((sum, stage) => sum + (Number(stage.points) || 100) + (Number(stage.completionBonus) || 200), 0)
        + (hunt.journeyBonus || 300)
        + itemSlots * (hunt.hiddenItemBonus || 50);
    const percent = max ? Math.round(tp.earned / max * 100) : 0;
    const correctCount = tp.results.filter(r => r.correct).length;
    state.lastSummary = { points: tp.earned, max, percent, correct: correctCount, total: hunt.stages.length };
    const game = state.currentGame;
    const elapsed = Date.now() - (state.playStartedAt || state.gameStart);
    const foundItems = Object.keys(tp.itemsFound || {}).length;
    const statCards = [
        { icon: '⌖', value: `${correctCount}/${hunt.stages.length}`, label: 'Chặng hoàn thành' },
        { icon: '⏱', value: formatClock(elapsed / 1000), label: 'Thời gian' },
        { icon: '🎯', value: `${percent}%`, label: 'Điểm tối đa' }
    ];
    if (itemSlots > 0)
        statCards.splice(1, 0, { icon: '🎁', value: `${foundItems}/${itemSlots}`, label: 'Vật phẩm ẩn' });
    const stats = resultStatsHtml(statCards);
    const TREASURE_BLESSINGS = [
        '🌟 "Kho báu quý giá nhất không nằm ở đích đến mà ở tri thức và sự kiên trì bạn đã tôi luyện suốt chặng đường. Chúc bạn luôn giữ vững niềm tin, không ngừng học hỏi và luôn tỏa sáng rực rỡ!" ✨🍀',
        '💎 "Mỗi câu đố bạn vượt qua là một viên ngọc sáng trong hành trang tương lai. Chúc bạn luôn tràn đầy năng lượng, đam mê khám phá và vươn tới những ước mơ cao đẹp nhất!" 🚀🌈',
        '🧭 "Người mở được kho báu là người không bao giờ bỏ cuộc trước thử thách. Chúc bạn luôn vững vàng, tự tin vào bản thân và gặt hái thật nhiều thành công xuất sắc trong học tập!" 🎓💖',
        '🌿 "Tri thức là chiếc chìa khóa vạn năng mở ra mọi cánh cửa tương lai. Chúc bạn luôn hào hứng với những điều mới lạ và mỗi ngày đều là một hành trình kỳ thú đầy niềm vui!" ☀️🎉'
    ];
    const pickedWish = TREASURE_BLESSINGS[treasureHash(game.id || 'treasure') % TREASURE_BLESSINGS.length];
    let medal = '🌱';
    let kicker = 'HÀNH TRÌNH HOÀN THÀNH';
    let headline = 'Tiếp tục cố gắng!';
    let rewardBoxHtml = '';
    if (percent === 100) {
        medal = '👑';
        kicker = 'CHIẾN TÍCH TUYỆT ĐỐI · 100% ĐIỂM SỐ';
        headline = 'BẠN LÀ NGƯỜI ĐỈNH NHẤT HÔM NAY! 🏆👑';
        rewardBoxHtml = `<div class="treasure-reward-card is-champion">
      <div class="reward-badge d-badge d-badge-warning font-bold">👑 ĐỈNH CAO TUYỆT ĐỐI · 100% ĐIỂM</div>
      <div class="reward-headline">BẠN LÀ NGƯỜI ĐỈNH NHẤT HÔM NAY!</div>
      <div class="reward-quote">
        "Tuyệt đối xuất sắc! Bạn đã chinh phục toàn bộ các chặng thử thách mà không mắc một sai sót nào. Trí tuệ và bản lĩnh của bạn chính là kho báu rực rỡ nhất hôm nay!"
      </div>
      <div class="reward-sub">🌟 Danh hiệu Nhà thám hiểm Kiệt xuất nhất hôm nay! 🌟</div>
    </div>`;
    }
    else if (percent >= 80) {
        medal = '📜';
        kicker = `KHO BÁU TRI THỨC · ${percent}% ĐIỂM SỐ`;
        headline = 'KHO BÁU TRI THỨC ĐÃ MỞ! 🎁✨';
        rewardBoxHtml = `<div class="treasure-reward-card is-blessing">
      <div class="reward-badge d-badge d-badge-primary font-bold">🎁 KHO BÁU DÀNH CHO BẠN: LỜI CHÚC Ý NGHĨA</div>
      <div class="reward-headline">LỜI CHÚC TỪ NGÔI ĐỀN TRI THỨC</div>
      <div class="reward-quote">${escapeHtml(pickedWish)}</div>
      <div class="reward-sub">Chúc mừng bạn đã xuất sắc đạt ${percent}% điểm tối đa — thành tích rất đáng tự hào!</div>
    </div>`;
    }
    else {
        medal = percent >= 50 ? '🎖️' : '🌱';
        kicker = completed ? 'HÀNH TRÌNH HOÀN THÀNH' : 'DỪNG HÀNH TRÌNH';
        headline = completed ? 'Bạn đã tìm ra kho báu!' : 'Tiếp tục cố gắng!';
        rewardBoxHtml = `<div class="treasure-reward-card is-encouragement">
      <div class="reward-quote">
        "Hành trình rất đáng khen! Hãy tiếp tục rèn luyện để đạt từ 80% điểm trở lên và mở khóa những lời chúc kho báu tuyệt vời nhé! 💪✨"
      </div>
    </div>`;
    }
    $('#playBody').innerHTML = `<div class="game-stage" data-game="treasure" data-game-world="treasure"><div class="result-screen"><div class="result-medal">${medal}</div><div class="stage-kicker d-badge d-badge-neutral">${kicker}</div><h2>${headline}</h2><p>${escapeHtml(game.title)}</p><div class="result-score">${tp.earned.toLocaleString('vi-VN')} / ${max.toLocaleString('vi-VN')} điểm</div><p>Hoàn thành ${correctCount}/${hunt.stages.length} chặng${completed ? ` · Thưởng hành trình +${hunt.journeyBonus || 300}` : ''} · ${percent}% điểm tối đa</p>${stats}${rewardBoxHtml}<p id="resultSaveStatus" class="result-save-status">Đang tự lưu kết quả…</p><div class="result-actions"><button class="btn btn-secondary" id="closeResultBtn">Đóng</button><button class="btn btn-secondary" id="replayBtn">↻ Chơi lại</button><button class="btn btn-primary" id="saveResultBtn">Đang lưu…</button></div></div></div>`;
    $('#closeResultBtn').onclick = () => closePlaySurface();
    $('#replayBtn').onclick = () => { state.playStartedAt = Date.now(); state.resultSession = null; openTreasurePlay(); };
    wireResultSession(game, state.lastSummary, {
        answers: tp.results,
        treasure: {
            completed,
            earned: tp.earned,
            results: tp.results,
            itemsFound: tp.itemsFound
        }
    }, 'Nhà thám hiểm 1');
    sendPresentationState({ isComplete: true });
}
// ---------- §6 Đường đua tri thức ----------
const RACE_STEP_BY_DIFFICULTY = { 'dễ': 1, 'trung bình': 2, 'khó': 3 };
const RACE_CELL_ICON = { boost: '⚡', penalty: '🪨', lucky: '🎁', challenge: '⚔️' };
function openRacePlay() {
    const root = $('#modalRoot');
    const game = state.currentGame;
    root.innerHTML = playModalHtml('race', 'w-[min(1040px,96vw)]', game.title, 'ĐƯỜNG ĐUA TRI THỨC · GIẢNG VIÊN ĐIỀU KHIỂN MÀN CHUNG');
    bindPlayHeader(root);
    const race = game.race;
    state.racePlay = {
        teams: race.teams.map(t => ({ ...t, progress: 1, points: 0 })),
        turn: 0, round: 1, currentQ: null, usedQ: [], over: false, winnerId: null, lastEvent: '',
        // Presentation only: how many blocks the 3D tower has grown (DECISIONS #145).
        correctCount: 0
    };
    renderRaceBoard();
}
function raceCellMap() {
    const map = {};
    (state.currentGame.race.cells || []).forEach(cell => { map[cell.cell] = cell; });
    return map;
}
function renderRaceBoard() {
    const race = state.currentGame.race, rp = state.racePlay;
    if (rp.over)
        return renderRaceResults();
    const root = $('#playBody');
    const cellMap = raceCellMap();
    const team = rp.teams[rp.turn];
    const track = Array.from({ length: race.trackLength }, (_, i) => i + 1);
    const standings = rp.teams.slice().sort((a, b) => b.progress - a.progress);
    root.innerHTML = `<div class="game-stage" data-game="race" data-game-world="race">${gameWorldLabel('race')}
    <div class="race-status-bar">
      <div class="race-turn-indicator">
        <span class="race-round-badge d-badge d-badge-primary font-bold">VÒNG ${rp.round}/${race.maxRounds}</span>
        <div class="race-active-team-pill">
          <span class="race-active-kicker">LƯỢT HIỆN TẠI:</span>
          <span class="race-active-name">${team.icon} <strong>${escapeHtml(team.name)}</strong></span>
        </div>
        <span class="race-rule-pill">${race.stepByDifficulty ? '⚡ Tiến theo độ khó' : '🎯 Tiến 1 ô/câu đúng'}${race.luckEnabled ? ' · 🎁 Ô may mắn' : ''}</span>
      </div>
      <div class="race-scoreboard" aria-label="Bảng điểm các đội">
        ${standings.map((t, idx) => `
          <div class="race-team-row scoreboard ${t.id === team.id ? 'active' : ''}" title="${escapeHtml(t.name)}: Ô ${t.progress}/${race.trackLength} · ${t.points} điểm">
            <span class="race-team-rank">${idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}</span>
            <span class="race-team-identity">${t.icon} <strong>${escapeHtml(t.name)}</strong></span>
            <span class="race-team-pos">Ô ${t.progress}/${race.trackLength}</span>
            <span class="race-team-pts">🏆 ${t.points}</span>
          </div>
        `).join('')}
      </div>
    </div>
    <div class="race-track">${track.map(n => {
        const cell = cellMap[n];
        const tokens = rp.teams.filter(t => t.progress === n).map(t => t.icon).join(' ');
        return `<div class="race-cell ${cell ? `race-cell-${cell.type}` : ''}" title="${cell ? escapeHtml(cell.label || cell.type) : ''}"><span class="race-cell-num">${n}</span>${cell ? `<span class="race-cell-icon">${RACE_CELL_ICON[cell.type] || ''}</span>` : ''}<span class="race-tokens">${tokens}</span></div>`;
    }).join('')}</div>
    <div id="raceTurnPanel">${raceTurnPanelHtml()}</div>
    <div id="answerFeedback" class="sr-only">${rp.lastEvent ? `<span class="small text-[#aeb5ce]">${escapeHtml(rp.lastEvent)}</span>` : ''}</div>
  </div>`;
    const drawBtn = $('#drawQuestionBtn', root);
    if (drawBtn)
        drawBtn.onclick = drawRaceQuestion;
    $$('[data-race-answer]', root).forEach(btn => {
        btn.onclick = () => answerRace(btn.dataset.raceAnswer);
    });
    const noAnsBtn = $('#raceNoAnswerBtn', root);
    if (noAnsBtn)
        noAnsBtn.onclick = () => answerRace('__no_answer__');
    const continueBtn = $('#raceContinueBtn', root);
    if (continueBtn)
        continueBtn.onclick = advanceRaceTurn;
    mountThreeStage($('.game-stage', root));
    if (raceAnswerBurst) {
        const reaction = raceAnswerBurst;
        raceAnswerBurst = null;
        reactThree(reaction === '#34d399' ? 'answer:correct' : 'answer:incorrect', { correct: reaction === '#34d399' });
    }
    if (raceAnswerCelebrate) {
        raceAnswerCelebrate = false;
        reactThree('game:completed', { winner: rp.winnerId });
    }
    sendPresentationState();
}
function raceTurnPanelHtml() {
    const rp = state.racePlay, team = rp.teams[rp.turn];
    const race = state.currentGame.race;
    if (!rp.currentQ) {
        return `<div class="race-turn"><p class="small text-[#aeb5ce] text-base mb-3">Lượt của <strong>${team.icon} ${escapeHtml(team.name)}</strong>. Bấm nút bên dưới để bốc câu hỏi cho đội.</p><button type="button" class="btn btn-primary btn-large" id="drawQuestionBtn">🃏 Bốc câu hỏi cho ${escapeHtml(team.name)}</button></div>`;
    }
    const q = rp.currentQ;
    const diff = q.difficulty || 'trung bình';
    const illusHtml = stageIllustrationHtml(q, state.currentGame, 'is-race');
    const hasIllus = Boolean(illusHtml);
    const correct = rp.answered && rp.selectedOptionId === q.correctOptionId;
    const lastTeam = rp.turn + 1 >= rp.teams.length;
    const nextTurn = (rp.turn + 1) % rp.teams.length;
    const nextTeam = rp.teams[nextTurn];
    // The finish is decided *after* this turn is closed: the round only becomes
    // `maxRounds + 1` in `advanceRaceTurn()`, which then renders the results. This
    // label must predict that, otherwise the last turn offers "next team" and the
    // following click jumps to the result without the teacher expecting it.
    const isFinalTurn = Boolean(rp.winnerId) || (lastTeam && rp.round >= race.maxRounds);
    let feedbackHtml = '';
    if (rp.answered) {
        if (correct) {
            feedbackHtml = `<div class="feedback good">
        <div class="flex items-center gap-2 mb-1.5">
          <span class="d-badge d-badge-success d-badge-sm font-bold">✓ CHÍNH XÁC</span>
          <b class="text-emerald-300">${team.icon} ${escapeHtml(team.name)}</b>
        </div>
        <p class="text-[14px] text-emerald-100 font-semibold mb-1">${escapeHtml(rp.lastEvent)}</p>
        ${q.explanation ? `<div class="mt-2 text-[13px] text-[#a3b8cc] border-t border-[#2d4a3e] pt-1.5">${escapeHtml(q.explanation)}</div>` : ''}
      </div>`;
        }
        else {
            const correctOpt = q.options.find(o => o.id === q.correctOptionId);
            feedbackHtml = `<div class="feedback bad">
        <div class="flex items-center gap-2 mb-1.5">
          <span class="d-badge d-badge-error d-badge-sm font-bold">✕ CHƯA CHÍNH XÁC</span>
          <b class="text-rose-300">${team.icon} ${escapeHtml(team.name)}</b>
        </div>
        <p class="text-[14px] text-rose-100 font-semibold mb-1">${escapeHtml(rp.lastEvent)}</p>
        ${correctOpt ? `<p class="text-[13px] text-amber-200 mt-1"><strong>Đáp án đúng:</strong> ${escapeHtml(correctOpt.text)}</p>` : ''}
        ${q.explanation ? `<div class="mt-2 text-[13px] text-[#a3b8cc] border-t border-[#4a2630] pt-1.5">${escapeHtml(q.explanation)}</div>` : ''}
      </div>`;
        }
    }
    return `<div class="race-turn"><div class="race-turn-row">
    <div class="stage-col stage-side-col">
      ${illusHtml}
      ${hasIllus ? `<div id="raceSideFeedback" class="feedback-under-illustration">${feedbackHtml}</div>` : ''}
    </div>
    <div class="stage-col is-main">
      <div class="stage-kicker d-badge d-badge-neutral mb-2">CÂU HỎI · ĐỘ KHÓ ${escapeHtml(diff.toUpperCase())}${raceStepLabel(diff)} · LƯỢT: ${team.icon} ${escapeHtml(team.name)}</div>
      <div class="stage-question mb-4">${escapeHtml(q.prompt).replace(/\n/g, '<br>')}</div>
      <div class="answer-grid">
        ${q.options.map((o, i) => {
        let extraClass = '';
        if (rp.answered) {
            if (o.id === q.correctOptionId)
                extraClass = ' correct';
            else if (o.id === rp.selectedOptionId)
                extraClass = ' wrong';
        }
        return `<button class="answer-option${extraClass}" data-race-answer="${escapeHtml(o.id)}" ${rp.answered ? 'disabled' : ''}><span class="letter">${String.fromCharCode(65 + i)}</span><span>${escapeHtml(o.text)}</span></button>`;
    }).join('')}
      </div>
      ${!rp.answered ? `<div class="mt-3"><button type="button" class="btn btn-secondary btn-small" id="raceNoAnswerBtn">Đội không trả lời được</button></div>` : ''}
      ${!hasIllus && feedbackHtml ? `<div id="raceSideFeedback" class="mt-3">${feedbackHtml}</div>` : ''}
      ${rp.answered ? `
        <div class="mt-4 flex items-center justify-start">
          <button type="button" class="btn btn-primary btn-large race-continue-btn" id="raceContinueBtn">
            ${isFinalTurn ? '🏁 Xem kết quả cuộc đua ➔' : `Lượt tiếp theo: ${nextTeam.icon} ${escapeHtml(nextTeam.name)} ➔`}
          </button>
        </div>
      ` : ''}
    </div>
  </div></div>`;
}
function raceStepLabel(diff) {
    const race = state.currentGame.race;
    if (!race.stepByDifficulty)
        return '';
    return ` · +${RACE_STEP_BY_DIFFICULTY[diff] || 1} Ô`;
}
function drawRaceQuestion() {
    const race = state.currentGame.race, rp = state.racePlay;
    if (rp.usedQ.length >= race.questions.length)
        rp.usedQ = [];
    const pool = race.questions.filter(q => !rp.usedQ.includes(q.id));
    const q = pool[Math.floor(Math.random() * pool.length)] || race.questions[0];
    rp.currentQ = q;
    rp.answered = false;
    rp.selectedOptionId = null;
    renderRaceBoard();
}
function answerRace(optionId) {
    const race = state.currentGame.race, rp = state.racePlay;
    if (!rp.currentQ || rp.over || rp.answered)
        return;
    const q = rp.currentQ;
    const team = rp.teams[rp.turn];
    const correct = optionId === q.correctOptionId;
    let event;
    if (correct) {
        const steps = race.stepByDifficulty ? (RACE_STEP_BY_DIFFICULTY[q.difficulty || 'trung bình'] || 1) : 1;
        team.progress += steps;
        team.points += Number(q.points) || 100;
        event = `${team.name} trả lời đúng → +${steps} ô`;
        const cell = raceCellMap()[team.progress];
        if (cell) {
            let extra = 0;
            if (cell.type === 'boost')
                extra = 1;
            else if (cell.type === 'penalty')
                extra = -1;
            else if (cell.type === 'lucky' && race.luckEnabled)
                extra = 1;
            else if (cell.type === 'challenge')
                extra = 2;
            team.progress += extra;
            event += ` · ${RACE_CELL_ICON[cell.type] || ''} ô ${cell.cell}${extra ? ` ${extra > 0 ? '+' : ''}${extra}` : ''}`;
        }
        team.progress = Math.max(1, Math.min(race.trackLength, team.progress));
        if (team.progress >= race.trackLength) {
            rp.winnerId = team.id;
            raceAnswerCelebrate = true;
        }
        rp.correctCount = (rp.correctCount || 0) + 1;
        GameAudio.play('correct');
    }
    else {
        event = optionId === '__no_answer__' ? `${team.name} không trả lời được → không tiến ô.` : `${team.name} trả lời sai → không tiến ô.`;
        GameAudio.play('wrong');
    }
    rp.lastEvent = event;
    rp.answered = true;
    rp.selectedOptionId = optionId;
    rp.usedQ.push(q.id);
    raceAnswerBurst = correct ? '#34d399' : '#f87171';
    renderRaceBoard();
}
function advanceRaceTurn() {
    const race = state.currentGame.race, rp = state.racePlay;
    if (!rp)
        return;
    GameAudio.play('stage');
    if (rp.winnerId) {
        rp.over = true;
        return renderRaceResults();
    }
    rp.turn += 1;
    if (rp.turn >= rp.teams.length) {
        rp.turn = 0;
        rp.round += 1;
        if (rp.round > race.maxRounds) {
            rp.over = true;
            return renderRaceResults();
        }
    }
    rp.currentQ = null;
    rp.answered = false;
    rp.selectedOptionId = null;
    renderRaceBoard();
}
function renderRaceResults() {
    const race = state.currentGame.race, rp = state.racePlay;
    const game = state.currentGame;
    unmountThreeStage();
    const byProgress = rp.teams.slice().sort((a, b) => b.progress - a.progress || b.points - a.points);
    const winner = rp.winnerId ? rp.teams.find(t => t.id === rp.winnerId) : byProgress[0];
    const tied = byProgress.filter(t => t.progress === byProgress[0].progress).length > 1 && !rp.winnerId;
    const maxPoints = Math.max(100, race.questions.length * 100);
    const percent = Math.round(winner.progress / race.trackLength * 100);
    state.lastSummary = { points: winner.points, max: maxPoints, percent, correct: 0, total: 0, winner: winner.name };
    const stats = resultStatsHtml([
        { icon: '🏁', value: `${winner.progress}/${race.trackLength}`, label: 'Ô về đích' },
        { icon: '🔄', value: `${rp.round}/${race.maxRounds}`, label: 'Vòng đấu' },
        { icon: '👥', value: `${rp.teams.length}`, label: 'Đội thi đấu' }
    ]);
    $('#playBody').innerHTML = `<div class="game-stage" data-game="race" data-game-world="race">${gameWorldLabel('race')}<div class="result-screen"><div class="result-medal">${rp.winnerId ? '🏁' : '🏅'}</div><div class="stage-kicker">KẾT QUẢ ĐƯỜNG ĐUA</div><h2>${tied ? 'Về đích đồng hạng!' : `${winner.icon} ${escapeHtml(winner.name)} chiến thắng!`}</h2><p>${escapeHtml(game.title)}</p>
    <div class="race-scoreboard max-w-[460px] my-[14px] mx-auto">${byProgress.map((t, i) => `<div class="race-team-row scoreboard"><span>${i + 1}. ${t.icon} <strong>${escapeHtml(t.name)}</strong></span><span>Ô ${t.progress}/${race.trackLength}</span><span>🏆 ${t.points} điểm</span></div>`).join('')}</div>
    ${stats}<p id="resultSaveStatus" class="result-save-status">Đang tự lưu kết quả…</p><div class="result-actions"><button class="btn btn-secondary" id="closeResultBtn">Đóng</button><button class="btn btn-secondary" id="replayBtn">↻ Đua lại</button><button class="btn btn-primary" id="saveResultBtn">Đang lưu…</button></div></div></div>`;
    $('#closeResultBtn').onclick = () => closePlaySurface();
    $('#replayBtn').onclick = () => { state.playStartedAt = Date.now(); state.resultSession = null; openRacePlay(); };
    wireResultSession(game, state.lastSummary, {
        answers: [],
        race: {
            teams: byProgress,
            winner: winner.name,
            tied,
            trackLength: race.trackLength,
            rounds: rp.round
        }
    }, winner.name);
    sendPresentationState({ isComplete: true });
}
document.addEventListener('click', (e) => {
    const fsBtn = e.target && e.target.closest ? e.target.closest('[data-play-fullscreen]') : null;
    if (fsBtn)
        setPlayFullscreen(document.documentElement.dataset.fullscreen !== '1');
    const closeBtn = e.target && e.target.closest ? e.target.closest('[data-play-close]') : null;
    if (closeBtn)
        setPlayFullscreen(false);
});
document.addEventListener('keydown', (e) => {
    const hasPlaySurface = Boolean($('#modalRoot')?.children.length);
    if (!hasPlaySurface)
        return;
    if (e.key === 'F11') {
        e.preventDefault();
        setPlayFullscreen(document.documentElement.dataset.fullscreen !== '1');
        return;
    }
    if (e.key !== 'Escape' || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || ''))
        return;
    e.preventDefault();
    if (document.documentElement.dataset.fullscreen === '1')
        setPlayFullscreen(false);
    else
        closePlaySurface();
});
/** Keep the flag in sync when the presentation window is closed outside the app. */
function initPresentationTracking() {
    const eduGame = window.eduGame;
    if (!eduGame || typeof eduGame.onPresentationExit !== 'function')
        return;
    eduGame.onPresentationExit(() => {
        presentationStarted = false;
        presentationStarting = false;
        presentationToken += 1;
    });
}
initPresentationTracking();
//# sourceMappingURL=gameplay.js.map