// @ts-nocheck -- quiz/scenario engine UI: renderQuestion, chooseAnswer, results entry (split from features/gameplay.ts, DECISIONS #147).
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
