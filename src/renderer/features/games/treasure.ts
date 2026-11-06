// @ts-nocheck -- treasure hunt: stage rendering, missions, journey map, results (split from features/gameplay.ts, DECISIONS #147).
// ---------- §5 Hành trình giải mã kho báu ----------
function openTreasurePlay() {
    const root = $('#modalRoot');
    const game = state.currentGame;
    root.innerHTML = playModalHtml('treasure', 'w-[min(980px,96vw)]', game.title, 'HÀNH TRÌNH KHÁM PHÁ · NGOẠI TUYẾN');
    bindPlayHeader(root);
    const hunt = game.treasureHunt;
    state.treasurePlay = { stageId: hunt.stages[0].id, earned: 0, results: [], itemsFound: {}, attemptsLeft: 0, steps: 0, answered: false, done: false, answerTurn: null, lastSelectedOptionId: null, storySeen: false };
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
    /* MỘT chặng = MỘT dòng điểm, và con số ghi vào là `turn.points` chứ không phải số
       trong dữ liệu chặng: đó chính là "điểm chặng + thưởng hoàn thành, sau khi Luyện
       tập trừ 10% ĐIỂM CHẶNG cho mỗi lần sai" (thưởng không nằm trong cơ số phạt — điều
       chủ dự án chốt ở #209). `commitAnswerRecord` chặn trùng theo vòng VÀ theo
       `stage.id` (máy giữ nó ở khóa `questionId`), nên một chặng không bao giờ xuất hiện
       hai lần trên bảng điểm kể cả khi học sinh nhấp đúp. */
    const turn = tp.answerTurn;
    const gained = Math.max(0, Number(turn && turn.points) || 0);
    tp.earned += gained;
    commitAnswerRecord(tp.results, turn, { stageId: stage.id, name: String(stage.name || '') });
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
    // Trước #209 dải này chỉ được viết khi chặng CÓ giới hạn lượt; từ giờ nó luôn nói
    // lại LUẬT ĐANG CHẠY, nên một chặng không giới hạn cũng cần vẽ lại (chữ "sai không
    // bị trừ điểm" mà để nguyên thì sai ở chế độ Luyện tập).
    if (hint)
        hint.textContent = treasureAttemptsText(stage);
    return out;
}
/** Số lượt chặng này còn được trả lời, TÍNH SAU cú thử mà `treasureUseAttempt` vừa đếm. */
function treasureTriesLeft(stage) {
    // `stage.attempts === 0` trong dữ liệu nghĩa là KHÔNG giới hạn, nên truyền Infinity
    // chứ không truyền thiếu: chính ngân sách này là thứ bật chế độ "thử lại" của một
    // game cũ (xem `beginAnswerTurn`), và ở Luyện tập nó là thứ khép vòng khi cạn lượt.
    return stage.attempts > 0 ? state.treasurePlay.attemptsLeft : Infinity;
}
/* MỘT lần thử ở một chặng: trò tính đúng/sai và số điểm chặng sẽ trả, máy trả lời ba câu
   hỏi còn lại — vòng đã khép chưa, còn được thử nữa không, có được mở đáp án không. Cạn
   lượt là trò tự khép vòng phía mình (`endAnswerTurn`) vì giới hạn đó thuộc về dữ liệu
   chặng chứ không thuộc về chế độ; và cũng chính `endAnswerTurn` áp luật lộ đáp án. */
function treasureTry(stage, correct) {
    const turn = state.treasurePlay.answerTurn;
    const paid = (Number(stage.points) || 0) + (Number(stage.completionBonus) || 0);
    const out = correct ? false : treasureUseAttempt(stage);
    registerAnswer(turn, { correct, points: correct ? paid : 0 }, { attemptsLeft: treasureTriesLeft(stage) });
    if (out)
        endAnswerTurn(turn);
    return turn;
}
/* Dải dưới màn chặng. Trước #209 nó hứa "sai không bị trừ điểm" với MỌI chặng — ở chế
   độ Luyện tập đó là lời nói dối, còn ở Thi đấu/Thử thách thì chữ "Còn N lượt thử" cũng
   nói sai luôn, vì hai chế độ đó chỉ có MỘT lượt trả lời. */
function treasureAttemptsText(stage) {
    const tp = state.treasurePlay;
    const turn = tp.answerTurn;
    if (!turn || turn.mode === 'legacy') {
        const left = stage.attempts > 0
            ? (tp.attemptsLeft > 0 ? `Còn ${tp.attemptsLeft} lượt thử` : 'Hết lượt thử')
            : 'Không giới hạn lượt thử';
        return `${left} · sai không bị trừ điểm`;
    }
    const law = answerModeHint(turn.mode);
    if (turn.retryAllowed) {
        const left = stage.attempts > 0 ? `còn ${tp.attemptsLeft} lượt thử` : 'số lượt thử không giới hạn';
        return `${law} · ${left}`;
    }
    return turn.mode === 'practice' ? `${law} · chặng này đã cạn lượt thử` : `${law} · chặng này chỉ có một lượt trả lời`;
}
/* "Lượt thử" trong hộp Bối cảnh & Nhiệm vụ cũng là một lời hứa về cách chơi, nên nó phải
   là LUẬT ĐANG CHẠY: Thi đấu và Thử thách chỉ có MỘT lượt trả lời dù chặng đặt
   `attempts` bao nhiêu, còn Luyện tập giữ đúng ngân sách lượt của chặng. */
function treasureTryLawHtml(stage, tp) {
    const turn = tp.answerTurn;
    const plain = stage.attempts > 0 ? `${stage.attempts} lượt` : 'Không giới hạn';
    if (!turn || turn.mode === 'legacy' || turn.rules.retryOnWrong)
        return `<span class="spec-chip">🎯 Lượt thử: <b>${plain}</b></span>`;
    return `<span class="spec-chip">🎯 Lượt thử: <b>1 lượt · ${answerModeLabel(turn.mode)}</b></span>`;
}
/* Dòng "+X điểm" phải là SỐ THỰC NHẬN. Với game cũ nó trùng đúng số hôm qua đang in; chỉ
   khi Luyện tập trừ phạt mới hiện thêm vì sao ít hơn và vì sao thưởng vẫn còn nguyên. */
function treasurePointsLine(stage, gained) {
    const content = Number(stage.points) || 0;
    const bonus = Number(stage.completionBonus) || 0;
    if (gained === content + bonus)
        return bonus ? `+${content} điểm câu đố · +${bonus} điểm hoàn thành chặng.` : `+${gained} điểm.`;
    const lost = content - Math.max(0, gained - bonus);
    return `+${gained} điểm (điểm chặng ${content} bị bớt ${lost} vì ${state.treasurePlay.answerTurn.wrongAttempts} lần sai — thưởng hoàn thành +${bonus} giữ nguyên).`;
}
/* "Đáp án đúng đã được mở" là một LỜI HỨA, và ba chế độ hứa ba điều khác nhau, nên nó
   không thể là một chuỗi cứng viết sẵn trong từng handler như trước #209. Nhánh lộ đáp
   án giữ đúng chữ của game cũ ("Hết lượt thử." + những gì chặng đó vẫn mở); hai nhánh
   còn lại là chữ MỚI, vì với Luyện tập cạn lượt và với Thử thách thì câu đó sai sự thật. */
function treasureFailureHead(stage, answerText) {
    const turn = state.treasurePlay.answerTurn;
    const hint = stage.question && stage.question.hint ? `💡 Gợi ý: ${escapeHtml(stage.question.hint)}<br>` : '';
    if (turn.revealCorrect)
        return `<strong>✕ Hết lượt thử.</strong> ${hint}${answerText}`;
    if (turn.mode === 'challenge')
        return `<strong>✕ Chưa đúng.</strong> ${hint}Chế độ Thử thách không mở đáp án — hãy sang chặng tiếp theo.`;
    return `<strong>✕ Chưa đúng.</strong> ${hint}Em đã dùng hết lượt thử của chặng này.`;
}
/* Dòng "thử lại" khi vòng CHƯA khép. Luyện tập phải nói SỐ ĐIỂM CÒN LẠI — đúng cái
   `answerTurnAward` vừa tính, không phải một lời hứa — vì ở Kho báu một lần sai không
   chỉ mất lượt mà còn mất 10% điểm chặng. */
function treasureRetryNote(stage, retry, alone) {
    const tp = state.treasurePlay;
    const turn = tp.answerTurn;
    if (!turn || turn.mode === 'legacy')
        return stage.attempts > 0 ? `Còn ${tp.attemptsLeft} lượt thử — ${retry}` : alone;
    const paid = (Number(stage.points) || 0) + (Number(stage.completionBonus) || 0);
    const tries = stage.attempts > 0 ? ` · còn ${tp.attemptsLeft} lượt thử` : '';
    return `Chặng này còn ${answerTurnAward(turn, paid)} điểm${tries} — ${retry}`;
}
/* Giải thích đi qua MỘT cửa. Trước đây cả năm lời nhắn đều tự nối `explanation` vào đuôi,
   nên Thử thách sau câu sai vẫn đọc được lời giải trước cả lớp. Luật thật là
   `turn.explanationAvailable` (answer-mode.js: sau câu sai ở Thử thách là `false`).
   Task 7 (#209): cửa đó giờ là `answerExplanationMarkup` — ba chế độ mới nhận một cái
   nút, game cũ nhận lại đúng dòng `<br>` của hôm qua. */
function treasureExplanationLine(stage) {
    const turn = state.treasurePlay.answerTurn;
    const text = String((stage.question && stage.question.explanation) || '');
    return answerExplanationMarkup(turn, {
        text,
        inline: text ? `<br>${escapeHtml(text)}` : '',
        title: 'Giải thích',
        prompt: String((stage.question && stage.question.prompt) || stage.name || '')
    });
}
function treasureCompleteMission(stage, correct, message) {
    const gained = treasureRecordStage(stage, correct);
    reactThree(correct ? 'answer:correct' : 'answer:incorrect', { correct });
    if (correct && !treasureNextStage(stage) && !treasureBranchStage(stage))
        reactThree('game:completed', { stageId: stage.id });
    const fb = $('#answerFeedback', $('#playBody'));
    if (fb) {
        fb.className = `feedback ${correct ? 'good' : 'bad'}`;
        fb.innerHTML = message + treasureExplanationLine(stage);
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
                    // `treasureTry` đã tính số điểm chặng này THỰC NHẬN (sau phạt) vào
                    // `turn.points`; vẽ từ con số đó chứ không vẽ từ dữ liệu chặng.
                    const turn = treasureTry(stage, true);
                    GameAudio.play('correct');
                    treasureCompleteMission(stage, true, `<strong>✓ Đã ghép đủ ${stage.mission.pairs.length} cặp!</strong> ${treasurePointsLine(stage, turn.points)}`);
                }
            }
            else {
                leftButton.classList.add('wrong');
                button.classList.add('wrong');
                GameAudio.play('wrong');
                setTimeout(() => { leftButton.classList.remove('wrong'); button.classList.remove('wrong'); }, 500);
                const turn = treasureTry(stage, false);
                const fb = $('#answerFeedback', root);
                if (!turn.retryAllowed) {
                    if (turn.revealCorrect) {
                        leftButtons.forEach(entry => { entry.classList.add('matched', 'revealed'); entry.disabled = true; });
                        rightButtons.forEach(entry => { entry.classList.add('matched', 'revealed'); entry.disabled = true; });
                        if (status)
                            status.textContent = 'Đáp án đúng đã được mở.';
                    }
                    else {
                        /* Luyện tập cạn lượt và Thử thách: KHÔNG một thẻ nào được sơn
                           "đã ghép". Vòng đã khoá nên chỉ cần tắt buttons là hết đườngclick,
                           nhưng học sinh phải biết vì sao màn hình đứng lại. */
                        leftButtons.forEach(entry => { entry.disabled = true; entry.classList.remove('selected'); });
                        rightButtons.forEach(entry => { entry.disabled = true; });
                        if (status)
                            status.textContent = 'Chặng đã khép — đáp án không được mở.';
                    }
                    treasureCompleteMission(stage, false, treasureFailureHead(stage, 'Đáp án đúng đã được mở.'));
                }
                else if (fb) {
                    fb.className = 'feedback bad';
                    fb.innerHTML = `<strong>✕ Chưa khớp.</strong> ${treasureRetryNote(stage, 'hãy thử vế khác.', 'Hãy thử ghép lại.')}`;
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
                    const turn = treasureTry(stage, true);
                    GameAudio.play('correct');
                    treasureCompleteMission(stage, true, `<strong>✓ Đã xếp đúng tất cả ${itemButtons.length} mục!</strong> ${treasurePointsLine(stage, turn.points)}`);
                }
            }
            else {
                group.classList.add('wrong');
                GameAudio.play('wrong');
                setTimeout(() => group.classList.remove('wrong'), 500);
                const turn = treasureTry(stage, false);
                const fb = $('#answerFeedback', root);
                if (!turn.retryAllowed) {
                    if (turn.revealCorrect) {
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
                    }
                    else {
                        itemButtons.forEach(entry => {
                            if (entry.classList.contains('placed'))
                                return;
                            entry.disabled = true;
                            entry.classList.remove('selected');
                        });
                        groupButtons.forEach(entry => { entry.disabled = true; });
                        if (status)
                            status.textContent = 'Chặng đã khép — đáp án không được mở.';
                    }
                    treasureCompleteMission(stage, false, treasureFailureHead(stage, 'Đáp án đúng đã được mở.'));
                }
                else if (fb) {
                    fb.className = 'feedback bad';
                    fb.innerHTML = `<strong>✕ Chưa đúng nhóm.</strong> ${treasureRetryNote(stage, 'hãy thử nhóm khác.', 'Hãy thử lại.')}`;
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
            const turn = treasureTry(stage, true);
            input.disabled = true;
            submit.disabled = true;
            GameAudio.play('correct');
            treasureCompleteMission(stage, true, `<strong>✓ Đã giải mã chính xác!</strong> ${treasurePointsLine(stage, turn.points)}`);
            return;
        }
        GameAudio.play('wrong');
        const turn = treasureTry(stage, false);
        const fb = $('#answerFeedback', root);
        if (!turn.retryAllowed) {
            input.disabled = true;
            submit.disabled = true;
            // Dòng "Đáp án đúng: X" chỉ được phép in khi CHẾ ĐỘ cho phép lộ; với Thử
            // thách thì cả câu đó lẫn ô mật mã đều đứng nguyên.
            if (status)
                status.textContent = turn.revealCorrect ? 'Đáp án đúng đã được mở.' : 'Chặng đã khép — đáp án không được mở.';
            treasureCompleteMission(stage, false, treasureFailureHead(stage, `Đáp án đúng: <strong>${escapeHtml(stage.mission.answer)}</strong>.`));
            return;
        }
        if (fb) {
            fb.className = 'feedback bad';
            fb.innerHTML = `<strong>✕ Chưa đúng.</strong> ${treasureRetryNote(stage, 'hãy thử lại.', 'Hãy thử lại.')}`;
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
          ${treasureTryLawHtml(stage, tp)}
          <span class="spec-chip">🏆 Điểm câu đố: <b>+${Number(stage.points) || 100}</b></span>
          ${stage.completionBonus ? `<span class="spec-chip">✨ Thưởng chặng: <b>+${stage.completionBonus}</b></span>` : ''}
          ${tp.answerTurn && tp.answerTurn.mode === 'practice' ? '<span class="spec-chip">📉 Luyện tập: mỗi lần sai bớt 10% <b>điểm câu đố</b>, thưởng chặng giữ nguyên</span>' : ''}
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
    /* #209 task 5: MỘT chặng = MỘT vòng trả lời, mở ở ĐÚNG một chỗ này — cùng khuôn với
       `renderQuestion` của Đấu trường (task 4). Ba chi tiết không được đọc nhầm:
       - `question` ở đây là CHẶNG, không phải `stage.question`: khóa `questionId` phải
         là `stage.id` vì bảng điểm của Kho báu keyed theo chặng (`treasureNodeState`).
       - `maxPoints` = ĐIỂM NỘI DUNG của chặng. Thưởng hoàn thành chặng, thưởng hành
         trình và vật phẩm ẩn không được nằm trong cơ số phạt (chủ dự án: "phạt chỉ trên
         điểm nội dung"), và 0 là một cơ số hợp lệ chứ không phải "không truyền".
       - `attemptsLeft` khai ngân sách lượt của chặng. Với ba chế độ mới nó chỉ SIẾT luật
         (cạn lượt thì khép vòng); với game cũ nó CHÍNH LÀ luật thử lại của Kho báu. */
    tp.answerTurn = beginAnswerTurn({ id: stage.id, points: Number(stage.points) || 0 },
        state.currentGame.gameSetup, {
            template: state.currentGame.template,
            maxPoints: Number(stage.points) || 0,
            attemptsLeft: stage.attempts > 0 ? stage.attempts : Infinity
        });
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
    <div class="stage-bottom"><span id="treasureAttemptsHint">${treasureAttemptsText(stage)}</span></div>
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
    const turn = tp.answerTurn;
    /* Một cú nhấp sau khi vòng đã khép không được lật câu đã sai thành câu đúng và
       không được trả thêm điểm (`registerAnswer` cũng tự chối, đây là chốt phía UI). */
    if (!turn || turn.locked || turn.finished)
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
    treasureTry(stage, correct);
    if (correct) {
        const gained = treasureRecordStage(stage, true);
        $$('.answer-option', root).forEach(btn => { btn.disabled = true; if (btn.dataset.answer === stage.question.correctOptionId)
            btn.classList.add('correct'); });
        if (fb) {
            fb.className = 'feedback good';
            fb.innerHTML = `<strong>✓ Tìm được chìa khóa!</strong> ${treasurePointsLine(stage, gained)}${treasureExplanationLine(stage)}`;
        }
        markTreasureMapNode(stage, true);
        showTreasureChoices(stage, true);
        sendPresentationState();
        return;
    }
    if (!turn.retryAllowed) {
        // Chặng khép lại mà không đúng: chỉ SƠN đáp án khi chế độ cho phép lộ. Trước
        // #209 nhánh này luôn sơn, nên Thử thách sẽ tô đáp án đúng ngay trước lớp.
        treasureRecordStage(stage, false);
        $$('.answer-option', root).forEach(btn => {
            btn.disabled = true;
            if (btn.dataset.answer === optionId)
                btn.classList.add('wrong');
            else if (turn.revealCorrect && btn.dataset.answer === stage.question.correctOptionId)
                btn.classList.add('correct');
        });
        if (fb) {
            fb.className = 'feedback bad';
            fb.innerHTML = treasureFailureHead(stage, 'Đáp án đúng đã được đánh dấu.') + treasureExplanationLine(stage);
        }
        markTreasureMapNode(stage, false);
        showTreasureChoices(stage, false);
    }
    else {
        $$('.answer-option', root).forEach(btn => { if (btn.dataset.answer === optionId)
            btn.classList.add('wrong'); });
        if (fb) {
            fb.className = 'feedback bad';
            fb.innerHTML = `<strong>✕ Chưa đúng.</strong> ${treasureRetryNote(stage, 'hãy suy nghĩ kỹ.', 'Thử lại với đáp án khác.')}`;
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
