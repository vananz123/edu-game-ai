// @ts-nocheck -- matching game: columns, memory and categorize boards, connectors, results (split from features/gameplay.ts, DECISIONS #147).
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
