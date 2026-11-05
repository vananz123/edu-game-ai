// @ts-nocheck -- race game: board, turn panel, answers, results (split from features/gameplay.ts, DECISIONS #147).
// ---------- §6 Đường đua tri thức ----------
const RACE_STEP_BY_DIFFICULTY = { 'dễ': 1, 'trung bình': 2, 'khó': 3 };
const RACE_CELL_ICON = { boost: '⚡', penalty: '🪨', lucky: '🎁', challenge: '⚔️' };
/* Số ô MỘT câu đúng được tiến khi trò chạy theo một trong ba "Cách trả lời" (#209).
   Chủ dự án chốt: "Bỏ hẳn [thưởng tốc độ], đường đua dùng MỘT SỐ BƯỚC CỐ ĐỊNH". */
const RACE_FIXED_STEPS = 1;
function openRacePlay() {
    const root = $('#modalRoot');
    const game = state.currentGame;
    root.innerHTML = playModalHtml('race', 'w-[min(1040px,96vw)]', game.title, 'ĐƯỜNG ĐUA TRI THỨC · GIẢNG VIÊN ĐIỀU KHIỂN MÀN CHUNG');
    bindPlayHeader(root);
    const race = game.race;
    state.racePlay = {
        teams: race.teams.map(t => ({ ...t, progress: 1, points: 0 })),
        turn: 0, round: 1, currentQ: null, usedQ: [], over: false, winnerId: null, lastEvent: '',
        // #209 task 6: the ONE answer turn of the team currently at the wheel.
        answerTurn: null,
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
/* ĐIỂM NỘI DUNG của một câu Đường đua: vừa là số trò trả khi đúng, vừa là TRẦN duy nhất
   Luyện tập được phép trừ. Giữ nguyên `|| 100` của luật cũ để một câu thiếu `points`
   không đổi điểm chỉ vì #209 — nếu trần khác số trả thì phạt sẽ trừ vào chỗ không có
   điểm nào (xem answer-flow.ts: practicePenalty lấy chính trần này). */
function raceContentPoints(q) {
    return Number(q && q.points) || 100;
}
/* MỘT lượt = MỘT vòng trả lời, mở ở ĐÚNG nơi bốc câu hỏi (một nguồn, như renderQuestion
   của Đấu trường và renderTreasureStage của Kho báu). `attemptsLeft: 1` là lời khai của
   trò: Đường đua cho MỘT lượt mỗi câu kể cả game cũ, nên 'legacy' ở đây KHÔNG bật thử lại
   (answer-flow.ts:42 chỉ bật khi ngân sách lớn hơn 1) — bất biến #209: game đã lưu chơi
   y như hôm qua. */
function raceOpenTurn(q) {
    const game = state.currentGame;
    state.racePlay.answerTurn = beginAnswerTurn({ id: q.id, points: raceContentPoints(q) },
        game.gameSetup, {
            template: game.template,
            maxPoints: raceContentPoints(q),
            attemptsLeft: 1
        });
    return state.racePlay.answerTurn;
}
/* Số ô tiến cho MỘT câu đúng. Khi trò chạy một trong ba cách trả lời thì LUÔN là
   RACE_FIXED_STEPS: "Tiến theo độ khó" là phần thưởng biến thiên, đúng thứ chủ dự án bỏ
   khỏi Đường đua. Nó chỉ còn là luật của game chưa từng đổi cách trả lời ('legacy'), vì
   #209 cấm đổi hành vi của game đã lưu. Ô đặc biệt trên bàn cờ là DỮ LIỆU chặng chứ không
   phải phần thưởng cho một đáp án, nên đứng ngoài quy tắc này. */
function raceStepsForTurn(turn, q) {
    if (turn && turn.mode !== 'legacy')
        return RACE_FIXED_STEPS;
    const race = state.currentGame.race;
    if (!race.stepByDifficulty)
        return 1;
    return RACE_STEP_BY_DIFFICULTY[(q && q.difficulty) || 'trung bình'] || 1;
}
/** Số điểm câu này còn nhận được SAU những lần sai đã rồi (Luyện tập). */
function raceRemainingPoints(turn, q) {
    return answerTurnAward(turn, raceContentPoints(q));
}
/* Dải luật đầu màn. #209 task 4/5 đã chốt: chữ trên màn phải nói LUẬT ĐANG CHẠY, vì
   "Tiến theo độ khó" in ra trong khi bàn đua đang đi một số bước cố định là một lời hứa
   sai ngay trước mặt cả lớp. */
function raceRulePillText(turn) {
    const race = state.currentGame.race;
    const luck = race.luckEnabled ? ' · 🎁 Ô may mắn' : '';
    // Chưa có vòng nào là chưa có câu nào, nhưng DẢI LUẬT thì đã in ra rồi: hỏi luật của
    // chính trò chơi thay vì in nhãn cũ — một game đã đổi sang cách trả lời mà dữ liệu còn
    // `stepByDifficulty` sẽ hứa "Tiến theo độ khó" suốt cả nhịp giữa hai lượt.
    const mode = turn ? turn.mode : answerModeForGame(state.currentGame);
    if (mode === 'legacy') {
        return `${race.stepByDifficulty ? '⚡ Tiến theo độ khó' : '🎯 Tiến 1 ô/câu đúng'}${luck}`;
    }
    return `🎯 Tiến ${RACE_FIXED_STEPS} ô/câu đúng · ${answerModeHint(mode)}${luck}`;
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
        <span class="race-rule-pill">${raceRulePillText(rp.answerTurn)}</span>
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
    if (!rp.currentQ) {
        return `<div class="race-turn"><p class="small text-[#aeb5ce] text-base mb-3">Lượt của <strong>${team.icon} ${escapeHtml(team.name)}</strong>. Bấm nút bên dưới để bốc câu hỏi cho đội.</p><button type="button" class="btn btn-primary btn-large" id="drawQuestionBtn">🃏 Bốc câu hỏi cho ${escapeHtml(team.name)}</button></div>`;
    }
    const q = rp.currentQ;
    const diff = q.difficulty || 'trung bình';
    const turn = rp.answerTurn;
    const illusHtml = stageIllustrationHtml(q, state.currentGame, 'is-race');
    const hasIllus = Boolean(illusHtml);
    /* `rp.answered` từ #209 nghĩa là VÒNG ĐÃ KHÉP, không còn là "đội đã bấm một lần".
       Ở Luyện tập một cú sai không khép vòng, nên lưới vẫn bấm được và chưa có điểm nào
       vào bảng — đó là toàn bộ khác biệt giữa luật cũ và chế độ mới. */
    const closed = rp.answered;
    const correct = closed && rp.selectedOptionId === q.correctOptionId;
    const retrying = Boolean(turn) && !closed && turn.wrongAttempts > 0;
    /* Lộ đáp án và lời giải là LUẬT chứ không phải trang trí (answerRules +
       explanationAllowed). Trước #209 khối sai luôn in "Đáp án đúng: X" + giải thích;
       Thử thách cấm cả hai, Thi đấu giữ nguyên như hôm qua. */
    const reveal = Boolean(turn && turn.revealCorrect);
    const explain = Boolean(turn && turn.explanationAvailable);
    const lastTeam = rp.turn + 1 >= rp.teams.length;
    const nextTurn = (rp.turn + 1) % rp.teams.length;
    const nextTeam = rp.teams[nextTurn];
    // The finish is decided *after* this turn is closed: the round only becomes
    // `maxRounds + 1` in `advanceRaceTurn()`, which then renders the results. This
    // label must predict that, otherwise the last turn offers "next team" and the
    // following click jumps to the result without the teacher expecting it.
    const isFinalTurn = Boolean(rp.winnerId) || (lastTeam && rp.round >= state.currentGame.race.maxRounds);
    let feedbackHtml = '';
    if (correct) {
        feedbackHtml = `<div class="feedback good">
        <div class="flex items-center gap-2 mb-1.5">
          <span class="d-badge d-badge-success d-badge-sm font-bold">✓ CHÍNH XÁC</span>
          <b class="text-emerald-300">${team.icon} ${escapeHtml(team.name)}</b>
        </div>
        <p class="text-[14px] text-emerald-100 font-semibold mb-1">${escapeHtml(rp.lastEvent)}</p>
        ${explain && q.explanation ? `<div class="mt-2 text-[13px] text-[#a3b8cc] border-t border-[#2d4a3e] pt-1.5">${escapeHtml(q.explanation)}</div>` : ''}
      </div>`;
    }
    else if (closed) {
        const correctOpt = reveal ? q.options.find(o => o.id === q.correctOptionId) : null;
        feedbackHtml = `<div class="feedback bad">
        <div class="flex items-center gap-2 mb-1.5">
          <span class="d-badge d-badge-error d-badge-sm font-bold">✕ CHƯA CHÍNH XÁC</span>
          <b class="text-rose-300">${team.icon} ${escapeHtml(team.name)}</b>
        </div>
        <p class="text-[14px] text-rose-100 font-semibold mb-1">${escapeHtml(rp.lastEvent)}</p>
        ${correctOpt ? `<p class="text-[13px] text-amber-200 mt-1"><strong>Đáp án đúng:</strong> ${escapeHtml(correctOpt.text)}</p>` : ''}
        ${explain && q.explanation ? `<div class="mt-2 text-[13px] text-[#a3b8cc] border-t border-[#4a2630] pt-1.5">${escapeHtml(q.explanation)}</div>` : ''}
      </div>`;
    }
    else if (retrying) {
        /* Vòng còn mở: đội được bấm lại. Khối này KHÔNG được tiết lộ đáp án (Luật Luyện
           tập giữ kín đáp án cho tới khi đúng hoặc bỏ qua) và nói rõ câu này còn lại bao
           nhiêu điểm — số thật do máy trả, không phải một lời hứa. */
        feedbackHtml = `<div class="feedback bad">
        <div class="flex items-center gap-2 mb-1.5">
          <span class="d-badge d-badge-neutral d-badge-sm font-bold">↻ CÒN ĐƯỢC THỬ LẠI</span>
          <b class="text-rose-300">${team.icon} ${escapeHtml(team.name)}</b>
        </div>
        <p class="text-[14px] text-rose-100 font-semibold mb-1">${escapeHtml(rp.lastEvent)}</p>
      </div>`;
    }
    return `<div class="race-turn"><div class="race-turn-row">
    <div class="stage-col stage-side-col">
      ${illusHtml}
      ${hasIllus ? `<div id="raceSideFeedback" class="feedback-under-illustration">${feedbackHtml}</div>` : ''}
    </div>
    <div class="stage-col is-main">
      <div class="stage-kicker d-badge d-badge-neutral mb-2">CÂU HỎI · ĐỘ KHÓ ${escapeHtml(diff.toUpperCase())}${raceStepLabel(turn, q)} · LƯỢT: ${team.icon} ${escapeHtml(team.name)}</div>
      <div class="stage-question mb-4">${escapeHtml(q.prompt).replace(/\n/g, '<br>')}</div>
      <div class="answer-grid">
        ${q.options.map((o, i) => {
        let extraClass = '';
        if (closed || retrying) {
            if (reveal && o.id === q.correctOptionId)
                extraClass = ' correct';
            else if (o.id === rp.selectedOptionId)
                extraClass = ' wrong';
        }
        return `<button class="answer-option${extraClass}" data-race-answer="${escapeHtml(o.id)}" ${closed ? 'disabled' : ''}><span class="letter">${String.fromCharCode(65 + i)}</span><span>${escapeHtml(o.text)}</span></button>`;
    }).join('')}
      </div>
      ${!closed ? `<div class="mt-3"><button type="button" class="btn btn-secondary btn-small" id="raceNoAnswerBtn">Đội không trả lời được</button></div>` : ''}
      ${!hasIllus && feedbackHtml ? `<div id="raceSideFeedback" class="mt-3">${feedbackHtml}</div>` : ''}
      ${closed ? `
        <div class="mt-4 flex items-center justify-start">
          <button type="button" class="btn btn-primary btn-large race-continue-btn" id="raceContinueBtn">
            ${isFinalTurn ? '🏁 Xem kết quả cuộc đua ➔' : `Lượt tiếp theo: ${nextTeam.icon} ${escapeHtml(nextTeam.name)} ➔`}
          </button>
        </div>
      ` : ''}
    </div>
  </div></div>`;
}
/* Nhãn "+N Ô" cạnh độ khó. Trước #209 nó in ra CHỈ khi bật "Tiến theo độ khó"; nay nó
   phải nói số ô lượt này THẬT SỰ được tiến — chữ "+3 Ô" trong khi bàn đua đang đi một
   bước cố định đúng là thứ task 4/5 đã cấm ở dải tip. */
function raceStepLabel(turn, q) {
    if ((!turn || turn.mode === 'legacy') && !state.currentGame.race.stepByDifficulty)
        return '';
    return ` · +${raceStepsForTurn(turn, q)} Ô`;
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
    /* VÒNG TRẢ LỜI MỞ Ở ĐÚNG ĐÂY — cùng một chỗ với câu sẽ được vẽ, như renderQuestion
       của Đấu trường và renderTreasureStage của Kho báu. Mở vòng ở nơi thứ hai cho cùng
       một câu là tự gây ra hai vòng, và hai vòng thì một cú bấm có thể thành hai lần
       cộng điểm. */
    raceOpenTurn(q);
    renderRaceBoard();
}
function answerRace(optionId) {
    const race = state.currentGame.race, rp = state.racePlay;
    if (!rp.currentQ || rp.over || rp.answered)
        return;
    const q = rp.currentQ;
    const team = rp.teams[rp.turn];
    // Lưới dự phòng cho một màn chưa có vòng (đúng khuôn `state.answerTurn ||` của quiz.ts:164).
    const turn = rp.answerTurn || raceOpenTurn(q);
    const skipped = optionId === '__no_answer__';
    const correct = !skipped && optionId === q.correctOptionId;
    if (skipped) {
        /* "Đội không trả lời được" = khép vòng TỪ PHÍA TRÒ, không phải ghi một đáp án
           sai: không lộ đáp án, không phạt thêm cho một cú chưa thử, và ở Luyện tập đó là
           lối thoát duy nhất khi một câu quá khó chặn cả bàn đua (xem #209 task 4). */
        endAnswerTurn(turn, { skipped: true });
    }
    else {
        /* Trò vẫn tự tính đúng/sai và số điểm nội dung sẽ trả; máy chỉ THÊM khoá, phạt
           và quyết định vòng khép hay chưa. */
        registerAnswer(turn, { correct, points: correct ? raceContentPoints(q) : 0 });
        if (turn.rejected)
            return;
    }
    if (!turn.finished) {
        /* Luyện tập, vòng còn mở: KHÔNG cộng điểm, KHÔNG tiến ô, KHÔNG loại câu khỏi ngân
           hàng, KHÔNG vẽ đáp án đúng. Đội chỉ được biết câu này còn lại bao nhiêu điểm. */
        rp.selectedOptionId = optionId;
        rp.lastEvent = `${team.name} trả lời chưa đúng → còn được thử lại, câu này chỉ còn ${raceRemainingPoints(turn, q)} điểm.`;
        raceAnswerBurst = '#f87171';
        GameAudio.play('wrong');
        renderRaceBoard();
        return;
    }
    rp.selectedOptionId = optionId;
    rp.answered = true;
    rp.usedQ.push(q.id);
    /* ĐIỂM vào bảng là `turn.points`: registerAnswer đã trừ phạt Luyện tập ngay trong
       máy. Khác quiz — đấu trường phải dùng answerTurnAward vì một quyết định Tình huống
       SAI vẫn nhận điểm rubric; Đường đua không trả điểm cho một đáp án sai, nên
       turn.points CHÍNH LÀ số đội được cộng (và bằng 0 khi sai hoặc bỏ qua). */
    const award = Math.max(0, Number(turn.points) || 0);
    const ceiling = raceContentPoints(q);
    const steps = raceStepsForTurn(turn, q);
    team.points += award;
    let event;
    if (skipped)
        event = `${team.name} không trả lời được → không tiến ô.`;
    else if (!turn.correct)
        event = `${team.name} trả lời sai → không tiến ô.`;
    else {
        event = `${team.name} trả lời đúng → +${steps} ô`;
        if (turn.wrongAttempts > 0)
            event += ` · nhận ${award}/${ceiling} điểm (bớt ${ceiling - award} vì ${turn.wrongAttempts} lần sai)`;
        team.progress += steps;
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
        // Nhà 3D của màn đua đếm SỐ LƯỢT ĐÚNG, nên đúng MỘT lần cho một vòng đã khép.
        rp.correctCount = (rp.correctCount || 0) + 1;
        GameAudio.play('correct');
    }
    if (!turn.correct)
        GameAudio.play('wrong');
    rp.lastEvent = event;
    raceAnswerBurst = turn.correct ? '#34d399' : '#f87171';
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
    /* Vòng cũ khép lại cùng câu cũ: để nó sống thêm một nhịp là để lộ đáp án của câu
       trước ngay khi đội mới chưa bốc gì. */
    rp.answerTurn = null;
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
