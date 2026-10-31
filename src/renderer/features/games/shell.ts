// @ts-nocheck -- play surface entry: playGame, display/fullscreen, close and the play-surface listeners (split from features/gameplay.ts, DECISIONS #147).
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
