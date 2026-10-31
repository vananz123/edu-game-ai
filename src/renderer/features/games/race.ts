// @ts-nocheck -- race game: board, turn panel, answers, results (split from features/gameplay.ts, DECISIONS #147).
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
