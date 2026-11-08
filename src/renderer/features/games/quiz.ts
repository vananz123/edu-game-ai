// @ts-nocheck -- quiz/scenario engine UI: renderQuestion, chooseAnswer, results entry (split from features/gameplay.ts, DECISIONS #147).
function renderQuestion() {
    const game = state.currentGame, q = game.questions[state.gameIndex], root = $('#playBody');
    if (!q) {
        // Không có câu nào đang mở: màn chiếu đọc `state.answerTurn` để quyết định có
        // lộ đáp án hay không, nên phải tắt nó trước khi sang màn kết quả.
        state.answerTurn = null;
        unmountThreeStage();
        return renderResults();
    }
    unmountThreeStage();
    state.answerLocked = false;
    /* #209 task 4: MỘT câu = MỘT vòng trả lời, mở ngay khi câu hiện ra. Đây là chỗ
       đầu tiên `beginAnswerTurn` được gọi từ một vòng chơi thật (trước đây máy chỉ
       sống trong unit test và mục H của cổng). `template` bắt buộc phải truyền:
       answerModeForGame là cửa duy nhất để một bàn Ghép cặp không bao giờ nhận
       cách trả lời mới. */
    state.answerTurn = beginAnswerTurn(q, game.gameSetup, { template: game.template });
    if (game.template === 'quiz' && q.type !== 'scenario')
        state.answerTurn.explanationButton = true;
    const progress = Math.round(state.gameAnswers.length / game.questions.length * 100);
    const scoring = resolveScoring(game.gameSetup);
    /* Dải tip phải nói LUẬT ĐANG CHẠY. Với game mang token, runtime.js:11 map
       'tra-loi:…' -> 'cơ bản' (lưới an toàn), nên câu "sai không bị trừ điểm" mà giữ
       nguyên thì sẽ là một lời nói dối ngay trước mặt học sinh ở chế độ Luyện tập. */
    const scoringTip = state.answerTurn.mode !== 'legacy' ? answerModeHint(state.answerTurn.mode)
        : ({ 'cơ bản': '✓ Đúng nhận điểm cố định, sai không bị trừ điểm', 'tốc độ': `⚡ Đúng nhanh trong 8 giây: +${scoring.timeBonus} điểm thưởng`, 'theo độ khó': `⛰️ Điểm theo độ khó: dễ ${scoring.table['dễ']} · trung bình ${scoring.table['trung bình']} · khó ${scoring.table['khó']}`, 'thi đấu đội': '👥 Điểm cộng cho đội — có thể luân phiên người trả lời', 'luyện tập': '📖 Luyện tập: không áp lực thời gian — xem kỹ giải thích' })[scoring.mode] || '';
    const textQ = isTextQuestion(q);
    // #153: trắc nghiệm thường không còn pill thể loại — tên thế giới đã nằm ở
    // badge đầu màn chơi ("ĐẤU TRƯỜNG TRI THỨC") và dải băng sân khấu, nên nhãn
    // xám thứ ba chỉ lặp lại. Các loại câu đặc biệt vẫn giữ nhãn để học sinh biết
    // mình đang trả lời kiểu gì.
    const kicker = q.type === 'scenario' ? 'TÌNH HUỐNG THỰC TẾ' : q.type === 'fill-in-blank' ? 'ĐIỀN TỪ CÒN THIẾU' : q.type === 'short-answer' ? 'TRẢ LỜI NGẮN' : q.type === 'true-false' ? 'ĐÚNG HAY SAI' : '';
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
    // so the illustration is dropped and a slot reserves its screen area.
    const illusHtml = houseMode ? '' : stageIllustrationHtml(q, game, 'is-stage');
    const hasIllus = Boolean(illusHtml);
    // #153: nhà 3D chiếm ô giữ chỗ, nhưng ảnh giáo viên CHỌN cho câu hỏi vẫn được
    // hiện — đặt ngang hàng, bên trái ô nhà. Chỉ ảnh chỉ định (hình có sẵn / ảnh
    // tải lên): tranh "tự động" không phải là "câu hỏi có ảnh", nếu không mọi câu
    // Xây nhà đều mọc thêm một cảnh mặc định. Đặt ngang thay vì xếp trên để không
    // ăn chiều cao: đo ở 1920x1080, ảnh xếp trên đẩy 6 phần tử đáp án ra ngoài màn.
    const houseArt = houseMode ? resolveStageIllustration(q, game) : null;
    const houseArtOn = Boolean(houseArt && houseArt.explicit);
    const houseSlotHtml = houseMode ? '<div class="house-stage-slot" aria-hidden="true"></div>' : '';
    const houseArtHtml = houseArtOn
        ? `<div class="house-question-art">${stageIllustrationHtml(q, game, 'is-stage is-house-art')}</div>`
        : '';
    /* DECISIONS #208 (nhiệm vụ 4–5): HUD "Đã xây n/m phần" rời CỘT PHẢI (#179)
       thành DẢI NGANG ở đầu .stage-center, và banner phản hồi về lại cột chữ như
       mọi màn khác. Lý do bằng số, không phải thẩm mỹ: cột phải của #179 rộng
       273–320px nên nó ăn ngang, còn dải mỏng ~34px chỉ ăn chiều dọc — mà chiều
       dọc mới là thứ hết chỗ ở fixture dài (đo: .stage-center 534px @1366x768,
       câu hỏi dài một mình đã chiếm 254px). Cột phải đồng thời bóp câu hỏi xuống
       978/1455px, trái với "câu hỏi ở phía trên" của giáo viên.
       Dải này là con TRỰC TIẾP của .stage-center và đứng trước cột chữ, nên
       .houseTarget() không đổi và HUD đứng yên giữa hai màn (nhà lớn lên tại chỗ
       chứ không trượt ngang — giữ nguyên ý #179). */
    const houseHudHtml = houseMode ? `<div class="house-hud-strip">${houseProgressHtml()}</div>` : '';
    /* DECISIONS #208 (nhiệm vụ 2): ở Cổ điển CÓ ảnh, ảnh rời khỏi CỘT TRÁI của
       sân khấu để đứng CÙNG HÀNG với câu hỏi (hỏi trái / ảnh phải), còn lưới đáp
       án xuống hàng riêng và trải trọn bề rộng vùng chơi. Điều kiện
       `stageGame === 'quiz'` là hữu ý: "Quyết định" (scenario) đi qua cùng render
       function nhưng nằm ngoài phạm vi bố cục đã chốt, nên giữ nguyên cột trái cũ.
       `#answerFeedback` vì thế về nằm dưới lưới (như màn không có ảnh) thay vì
       dưới ảnh. */
    const classicLeadRow = stageGame === 'quiz' && !houseMode && hasIllus;
    const sideColHtml = houseMode || classicLeadRow
        ? ''
        : `<div class="stage-col stage-side-col">${illusHtml}${hasIllus ? '<div id="answerFeedback" class="feedback-under-illustration"></div>' : ''}</div>`;
    const hintButton = q.hint && !textQ ? `<button type="button" class="btn btn-secondary btn-small quiz-hint-btn" id="quizHintBtn">💡 Gợi ý</button>` : '';
    const kickerRow = kicker || hintButton
        ? `<div class="stage-kicker-row flex items-center justify-between gap-2 mb-2 flex-wrap">${kicker ? `<div class="stage-kicker d-badge d-badge-neutral">${kicker}</div>` : ''}${hintButton}</div>`
        : '';
    const contextHtml = q.context ? `<p class="scenario-context">${escapeHtml(q.context).replace(/\n/g, '<br>')}</p>` : '';
    const questionHtml = `<div class="stage-question">${escapeHtml(q.prompt).replace(/\n/g, '<br>')}</div>`;
    const answerArea = textQ
        ? `<div class="text-answer-box"><input id="textAnswerInput" placeholder="${shortAnswerPlaceholder}" autocomplete="off"><button class="btn btn-primary" id="textAnswerBtn">Trả lời</button>${q.hint ? `<button class="btn btn-secondary text-answer-hint" type="button" data-answer-hint>💡 Gợi ý</button>` : ''}</div>${q.hint ? `<div class="text-answer-hint-text hidden" id="textAnswerHint">💡 <strong>Gợi ý:</strong> ${escapeHtml(q.hint)}</div>` : ''}`
        : `<div class="answer-grid${trueFalse ? ' true-false-grid' : ''}">${q.options.map((o, i) => `<button class="answer-option" data-answer="${escapeHtml(o.id)}"><span class="letter">${optionMark(o, i)}</span><span>${escapeHtml(o.text)}</span></button>`).join('')}</div>`;
    /* DECISIONS #208 (nhiệm vụ 4): Xây nhà CÓ ảnh = "câu hỏi ở trên, ảnh bên trái
       cùng HÀNG với lưới đáp án bên phải", nên lưới không còn là con trực tiếp của
       .is-main nữa. Màn KHÔNG ảnh giữ DOM phẳng đúng như Cổ điển (lưới vẫn là
       `> .answer-grid`) vì giáo viên chốt "bốn đáp án trải ngang vùng chơi" — ở
       đó mọi rule chiều cao sẵn có tiếp tục khớp mà không phải khai lại.
       Cột trái chứa ảnh ở TRÊN và ô nhà `.house-stage-slot` ở DƯỚI: ô nhà bắt
       buộc còn (houseTarget() đo đúng hình chữ nhật đó, #142) nhưng không được
       thành một dải riêng tốn thêm 170–238px chiều dọc, vì fixture dài đã ngốn
       hết .stage-center. */
    const houseAnswerRow = houseArtOn
        ? `<div class="house-answer-row"><div class="house-lead-col">${houseArtHtml}${houseSlotHtml}</div><div class="house-answer-col">${answerArea}</div></div>`
        : '';
    // Câu hỏi luôn là khối chữ cuối trước hàng đáp án; ở màn không ảnh thì ô nhà
    // đứng ngay dưới kicker (như #179) và lưới ở dưới câu hỏi.
    const centerLeadHtml = classicLeadRow
        ? `<div class="stage-lead-row"><div class="stage-lead-text">${kickerRow}${contextHtml}${questionHtml}</div><div class="stage-col stage-side-col">${illusHtml}</div></div>`
        : `${kickerRow}${houseMode && !houseArtOn ? houseSlotHtml : ''}${contextHtml}${questionHtml}`;
    // Keep answer announcements accessible without painting a feedback banner.
    const mainFeedbackHtml = '<div id="answerFeedback" class="quiz-answer-live" role="status" aria-live="polite" aria-atomic="true"></div>';
    const nextBtnHtml = '<button class="btn hidden" id="nextQuestionBtn">Tiếp tục →</button>';
    const nextInStage = game.template === 'quiz' ? '' : nextBtnHtml;
    const nextDock = game.template === 'quiz' ? `<div id="quizNextDock" class="quiz-next-dock">${nextBtnHtml}</div>` : '';
    const stageBottomHtml = `<div class="stage-bottom"><span class="stage-tip">${scoringTip}</span>${nextInStage}</div>`;
    root.innerHTML = `<div class="game-stage${houseMode ? ' is-house-mode' : ''}${game.template === 'quiz' ? ' is-arena-quiz' : ''}" data-game="${stageGame}" data-game-world="quiz">${gameWorldLabel(stageGame)}<div class="stage-top"><span class="stage-meta">${escapeHtml(game.subject || 'TRÒ CHƠI HỌC TẬP')} · ${game.grade ? 'LỚP ' + escapeHtml(game.grade) : 'MỌI LỚP'}</span><span class="stage-meta stage-meta-right"><span class="stage-chip">${game.template === 'scenario' ? 'QUYẾT ĐỊNH' : 'CÂU'} <b>${state.gameAnswers.length + 1}</b>/${game.questions.length}</span><span class="stage-chip stage-chip-score">🏆 <b>${state.gameAnswers.reduce((s, a) => s + a.points, 0)}</b> điểm</span></span></div><div class="stage-progress"><div data-progress="${progress}"></div></div>${state.teamPlay ? teamTurnBarHtml() : ''}<div class="stage-center">${houseHudHtml}${sideColHtml}<div class="stage-col is-main">${centerLeadHtml}${houseAnswerRow || answerArea}${mainFeedbackHtml}${stageBottomHtml}</div></div>${nextDock}<div id="answerExplanationDock" class="answer-explain-dock"></div></div>`;
    paintProgress(root);
    $$('.answer-option', root).forEach(btn => btn.addEventListener('click', () => chooseAnswer(q, btn.dataset.answer)));
    const qHintBtn = $('#quizHintBtn', root);
    if (qHintBtn) {
        qHintBtn.onclick = () => {
            const fb = $('#answerFeedback', root);
            if (fb) {
                fb.textContent = `Gợi ý: ${q.hint}`;
            }
            toast(`💡 Gợi ý: ${q.hint}`, 5000);
            GameAudio.play('hint');
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
                if (fb)
                    fb.textContent = `Gợi ý: ${q.hint}`;
                toast(`💡 Gợi ý: ${q.hint}`, 5000);
                GameAudio.play('hint');
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
    /* #209 task 4: vòng trả lời của câu đang hiển thị đã mở ở renderQuestion; phép
       || dưới đây là lối dự phòng cho một màn chơi cũ chưa có vòng (một trang chưa
       gọi renderQuestion, hoặc `state.answerTurn` bị xoá giữa chừng). */
    const turn = state.answerTurn || beginAnswerTurn(question, state.currentGame?.gameSetup, { template: state.currentGame?.template });
    state.answerTurn = turn;
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
    const basePoints = questionPoints(question, resolveScoring(state.currentGame.gameSetup));
    const availablePointsBefore = answerTurnAward(turn, basePoints);
    /* Trò vẫn tự tính { correct, points }; máy chỉ THÊM khoá + phạt + khép vòng.
       `turn.rejected` là cú nhấp thứ hai sau khi vòng đã khép (nút đã tắt nhưng sự
       kiện vẫn bắn tới): phải im lặng — không trừ thêm phạt, không lật câu đã sai
       thành đúng, không cộng thêm điểm cho một lượt không tồn tại. */
    registerAnswer(turn, { correct: scored.correct, points: scored.points });
    if (turn.rejected)
        return;
    const { correct, speedBonus } = scored;
    /* ĐIỂM ghi vào bảng là `answerTurnAward(chính trò đã trả)`, KHÔNG phải
       `turn.points`: một quyết định Tình huống SAI vẫn nhận điểm rubric của nó
       (0..100) trong khi `turn.points` luôn bằng 0 khi sai — chủ dự án chốt
       "không đụng rubric". Với một đáp án đúng hai giá trị này trùng nhau
       (tests/unit/answer-flow.test.ts chốt cả hai chiều). */
    const points = answerTurnAward(turn, scored.points);
    /* Tình huống không bao giờ tô "quyết định đúng": hôm nay nó cũng không tô, và mỗi
       lựa chọn có feedback + điểm rubric riêng. Với ba mode kia, `revealCorrect` là
       khác biệt duy nhất giữa Thi đấu (lộ đáp án) và Thử thách (không lộ). */
    const revealAnswer = turn.revealCorrect && !scenario;
    // Luyện tập trả lại quyền bấm để thử lại; mọi mode khác khoá đến hết câu.
    state.answerLocked = !turn.retryAllowed;
    let teamNote = '';
    const settle = () => {
        const result = commitAnswerRecord(state.gameAnswers, turn, {
            selectedOptionId: textQ ? null : optionId,
            ...(textQ ? { answerText: String(answerText ?? '') } : {}),
            points,
            elapsedSeconds: elapsed,
            ...(scenarioScore ? { scoringBreakdown: scenarioScore.breakdown } : {})
        });
        if (!result.committed)
            return;
        // Nhà + đội đổi ĐÚNG MỘT lần cho một câu: một cú nhấp sai ở Luyện tập chưa
        // khép vòng thì không được xây thêm (hay trừ) phần nhà, không được quay lượt đội.
        if (isHouseMode(state.currentGame)) {
            const house = houseApplyAnswer(houseState(), houseTargetParts(state.currentGame), turn.correct);
            state.houseBuild = house.state;
            reactThree(turn.correct ? 'answer:correct' : 'answer:incorrect', { correct: turn.correct, points, house });
        } else {
            reactThree(turn.correct ? 'answer:correct' : 'answer:incorrect', { correct: turn.correct, points });
        }
        if (scenario)
            state.scenarioSteps = (state.scenarioSteps || 0) + 1;
        if (!state.teamPlay)
            return;
        const tp = state.teamPlay;
        const team = tp.teams[tp.turn];
        team.points += points;
        if (turn.correct)
            team.correct += 1;
        team.answered += 1;
        const nextTeam = tp.teams[(tp.turn + 1) % tp.teams.length];
        teamNote = `<br><strong>👥 ${escapeHtml(team.name)}</strong> được cộng ${points} điểm.${tp.teams.length > 1 ? ` Lượt sau: ${escapeHtml(nextTeam.name)}.` : ''}`;
        tp.turn = (tp.turn + 1) % tp.teams.length;
    };
    if (turn.finished) {
        settle();
        // Update the score immediately; the next question has not rendered yet.
        syncScoreChip();
        showQuizScoreChange(points);
    } else {
        // Sai mà còn được thử lại: phản hồi ngay cho em biết, nhưng chưa có dòng điểm,
        // chưa đổi nhà/đội và chưa được nhìn thấy đáp án.
        reactThree('answer:incorrect', { correct: false, points: 0 });
        const penalty = answerTurnAward(turn, basePoints) - availablePointsBefore;
        if (penalty < 0)
            showQuizScoreChange(penalty, 'điểm câu này');
    }
    if (textQ) {
        const input = document.getElementById('textAnswerInput');
        const submitBtn = document.getElementById('textAnswerBtn');
        if (input) {
            input.disabled = !turn.retryAllowed;
        }
        if (submitBtn)
            submitBtn.disabled = !turn.retryAllowed;
        const hintBtn = document.querySelector('[data-answer-hint]');
        if (hintBtn)
            hintBtn.disabled = !turn.retryAllowed;
    }
    $$('.answer-option').forEach(btn => {
        btn.disabled = !turn.retryAllowed;
        if (scenario) {
            if (btn.dataset.answer === optionId)
                btn.classList.add('selected');
        }
        else if (revealAnswer && btn.dataset.answer === question.correctOptionId)
            btn.classList.add('correct');
        else if (btn.dataset.answer === optionId)
            btn.classList.add('wrong');
    });
    const feedback = $('#answerFeedback');
    if (!feedback)
        return;
    const resolveNextIndex = () => {
        const next = scenario
            ? resolveScenarioTransition(selectedOption, state.gameIndex, state.currentGame.questions)
            : state.gameIndex + 1;
        return next === undefined || scenario && state.scenarioSteps >= 100
            ? state.currentGame.questions.length
            : next;
    };
    const goToNext = () => {
        if (!turn.finished) {
            /* Luyện tập mà bấm "Bỏ qua" = khép vòng từ phía trò (endAnswerTurn đúng
               việc đó): không lộ đáp án và VẪN ghi một dòng — điểm là phần trò đã kiếm
               được tới lúc đó (0 với một đáp án sai trắng, điểm rubric với một quyết định
               Tình huống nhận điểm). Thiếu lối này thì một câu quá khó chặn cả lớp mãi. */
            endAnswerTurn(turn, { skipped: true });
            settle();
        }
        state.nextQuestionIndex = resolveNextIndex();
        state.gameIndex = state.nextQuestionIndex;
        state.gameStart = Date.now();
        lanAdvanceRound();
        renderQuestion();
    };
    const wireNextButton = () => {
        state.nextQuestionIndex = resolveNextIndex();
        const next = $('#nextQuestionBtn');
        next.classList.remove('hidden');
        /* Nhãn: vòng còn mở = một lối bỏ qua, không phải "đi tiếp" (học sinh đang
           được thử lại). "Tình huống tiếp theo" chỉ đúng với Tình huống — trước #209
           Đấu trường cũng mang nhãn đó. */
        next.textContent = !turn.finished ? 'Bỏ qua câu này →'
            : state.nextQuestionIndex >= state.currentGame.questions.length ? 'Xem kết quả →'
                : state.currentGame.template === 'scenario' ? 'Tình huống tiếp theo →' : 'Câu tiếp theo →';
        next.onclick = goToNext;
    };
    if (!turn.finished) {
        // Keep the full response available to assistive technology; the visual
        // surface uses answer coloring, the score animation and the next control.
        feedback.textContent = '';
        feedback.innerHTML =
            `<strong>✕ Chưa đúng.</strong> ${textQ ? `Câu trả lời của bạn: “${escapeHtml(String(answerText ?? '').trim())}”.` : 'Đáp án vừa chọn chưa đúng.'}<br>Em được <strong>thử lại</strong>${turn.wrongAttempts > 1 ? ` (đã sai ${turn.wrongAttempts} lần)` : ''} — câu này còn <b>${answerTurnAward(turn, basePoints)}</b> điểm.${teamNote}`;
        wireNextButton();
        sendPresentationState();
        return;
    }
    const rubric = scenarioScore
        ? `<br>Điểm quyết định: ${scenarioScore.points}/100 (an toàn ${scenarioScore.breakdown.safety}/60 · giải thích ${scenarioScore.breakdown.reasoning}/25 · giảm hậu quả ${scenarioScore.breakdown.harmReduction}/15).`
        : '';
    // In house mode the showcase hides the answer grid, so the feedback must
    // name the correct option itself (DECISIONS #142).
    const correctOption = textQ ? null : question.options.find(option => option.id === question.correctOptionId);
    const answerReveal = !revealAnswer ? '' : textQ
        ? `<br><strong>Đáp án đúng:</strong> ${escapeHtml(question.correctAnswer || '')}${question.alternateAnswers?.length ? ` (hoặc: ${question.alternateAnswers.map(a => escapeHtml(a)).join(', ')})` : ''}${question.hint && !correct ? `<br><strong>💡 Gợi ý:</strong> ${escapeHtml(question.hint)}` : ''}`
        : isHouseMode(state.currentGame) && correctOption
            ? `<br><strong>Đáp án đúng:</strong> ${escapeHtml(correctOption.text)}`
            : '';
    const teacherFeedback = scenario && selectedOption?.feedback
        ? selectedOption.feedback
        : question.explanation || 'Hãy ôn lại nội dung bài học.';
    /* Khối riêng, không phải một câu trong chuỗi phản hồi: chữ phải mang đúng mực
       của thế giới (--world-ink) chứ không bị luật `.feedback strong` nhuộm đỏ/xanh. */
    const discussion = scenario && question.discussionPrompt
        ? `<div class="feedback-discussion"><strong>Thảo luận:</strong> ${escapeHtml(question.discussionPrompt)}</div>`
        : '';
    /* Giải thích của Đấu trường luôn mở từ nút nổi, gồm cả game legacy. */
    const explanationHtml = answerExplanationMarkup(turn, {
        text: teacherFeedback,
        inline: `<br>${escapeHtml(teacherFeedback)}`,
        title: scenario ? 'Giải thích quyết định' : 'Giải thích',
        prompt: String(question.prompt || '')
    });
    const penaltyLine = turn.mode === 'practice' && correct && turn.wrongAttempts > 0
        ? ` (em đã sai ${turn.wrongAttempts} lần, mỗi lần bớt 10% điểm của câu này).` : '';
    const explainDock = $('#answerExplanationDock');
    if (explainDock)
        explainDock.innerHTML = explanationHtml.startsWith('<button') ? explanationHtml : '';
    const legacyExplanation = turn.mode === 'legacy' && !turn.explanationButton ? explanationHtml : '';
    feedback.classList.toggle('good', correct);
    feedback.classList.toggle('bad', !correct);
    feedback.innerHTML = `<strong>${scenario ? 'Đã ghi nhận quyết định.' : correct ? '✓ Chính xác!' : '✕ Chưa chính xác.'}</strong> ${scenario ? `Bạn nhận ${points} điểm.` : correct ? `Bạn nhận ${points} điểm${speedBonus ? ` (gồm +${speedBonus} điểm nhanh)` : ''}.${penaltyLine}` : `${textQ ? `Câu trả lời của bạn: “${escapeHtml(String(answerText ?? '').trim())}”.` : revealAnswer ? 'Đáp án đúng đã được đánh dấu.' : 'Cách trả lời này không mở đáp án.'}`}${answerReveal}${rubric}${legacyExplanation}${discussion}${teamNote}`;
    wireNextButton();
    // The showcase fits the house after the next control is laid out (#142).
    if (isHouseMode(state.currentGame))
        showcaseHouse();
    sendPresentationState();
}
function showQuizScoreChange(points, detail = 'điểm') {
    const stage = $('.game-stage');
    if (!stage)
        return;
    document.querySelectorAll('.quiz-score-float').forEach(notice => notice.remove());
    const value = Math.round(Number(points) || 0);
    const notice = document.createElement('div');
    notice.className = `quiz-score-float${value < 0 ? ' is-loss' : value === 0 ? ' is-neutral' : ''}`;
    notice.setAttribute('role', 'status');
    notice.setAttribute('aria-live', 'polite');
    notice.textContent = value > 0 ? `+${value} ${detail}` : value < 0 ? `−${Math.abs(value)} ${detail}` : '0 điểm';
    stage.appendChild(notice);
    setTimeout(() => notice.remove(), 1800);
}
/** Tổng điểm trên thanh stage bằng đúng tổng đã ghi, thay vì trễ một câu (#213). */
function syncScoreChip() {
    const chip = document.querySelector('.stage-chip-score b');
    if (chip)
        chip.textContent = String(state.gameAnswers.reduce((s, a) => s + a.points, 0));
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
