// @ts-nocheck -- result screens, presentation mode, team setup, play modal and header (split from features/gameplay.ts, DECISIONS #147).
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
    quiz: { label: 'ĐẤU TRƯỜNG TRI THỨC', symbol: '✦', kicker: 'Lớp học trên giấy' },
    scenario: { label: 'TÌNH HUỐNG THỰC TẾ', symbol: '☘', kicker: 'Sổ tay quyết định' },
    matching: { label: 'GHÉP CẶP KIẾN THỨC', symbol: '◈', kicker: 'Bảng nỉ tri thức' },
    treasure: { label: 'HÀNH TRÌNH KHÁM PHÁ', symbol: '⌖', kicker: 'Bản đồ nhà thám hiểm' },
    race: { label: 'ĐƯỜNG ĐUA TRI THỨC', symbol: '⏱', kicker: 'Đường đua về đích' }
};
/**
 * World for the current game, by template (the engine actually playing).
 *
 * Template only: a leftover `matchingGame` payload is not evidence of the matching
 * engine. Older editor saves wrote every panel's defaults onto every game, so a
 * quiz/house game carried a matching board and the header badge named the wrong
 * genre (#152).
 */
function gameWorld() {
    const template = String(state.currentGame && state.currentGame.template || '');
    if (template === 'treasure-hunt')
        return 'treasure';
    if (template === 'race')
        return 'race';
    if (template === 'matching')
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
