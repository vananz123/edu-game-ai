// @ts-nocheck -- classic renderer script, same style as gameplay.ts / results.ts.
/**
 * Chơi LAN (Electron renderer).
 *
 * The teacher PC hosts the room (main process: src/lan/lan-server.ts). This file
 * only draws the teacher's LAN screen and forwards two intents to main:
 * "chia đội" and "đóng phòng". It never computes points and never sends an answer,
 * so the projector and the phones cannot disagree about a score.
 *
 * Loaded after gameplay.js and results.js (see src/index.html): the LAN button is
 * added inside `bindPlayHeader()` in gameplay.ts, and the finish path uses
 * `lanCollectSessionPayload()` from here via `wireResultSession()`.
 */

const LAN_UI = {
  /** Last snapshot from main; null when no room is open. */
  snapshot: null,
  /** What the renderer asked for but main has not answered yet. */
  pending: false,
  /** Phase the panel currently draws; `null` forces a full re-render. */
  renderedState: null,
  /** The honour roll is on screen; keep it after the room itself closes. */
  showingPodium: false,
  unsubscribe: null
};

function lanBridge() {
  const bridge = window.eduGame;
  return bridge && typeof bridge.lanStart === 'function' ? bridge : null;
}

/** True when this build can host a room at all (older builds have no bridge). */
function lanAvailable() {
  return Boolean(lanBridge());
}

/**
 * The button is only drawn when main can run this game. The renderer does not
 * import src/lan/lan-adapters.ts (classic scripts share one global scope and the
 * adapter uses `require`), so support is decided by the same rule the server
 * applies: quiz/scenario always, treasure-hunt always, matching/race never.
 * A mismatch is harmless: `lan:start` refuses with a reason shown in the modal.
 */
function lanGameSupported(game) {
  if (!game) return false;
  return game.template === 'quiz' || game.template === 'scenario' || game.template === 'treasure-hunt';
}

function lanButtonHtml(game) {
  if (!lanAvailable() || !lanGameSupported(game)) return '';
  const open = Boolean(LAN_UI.snapshot);
  return `<button class="play-tool play-tool-lan${open ? ' is-open' : ''}" data-play-lan title="${open ? 'Phòng LAN đang mở' : 'Học sinh trả lời trên điện thoại qua Wi-Fi lớp'}" aria-label="Chơi LAN"><span class="play-tool-icon">${open ? '🟢' : '📱'}</span><span class="play-tool-label">${open ? 'LAN đang mở' : 'Chơi LAN'}</span></button>`;
}

/** Attach the bridge once; every window state update re-renders what is open. */
function lanEnsureSubscribed() {
  if (LAN_UI.unsubscribe || !lanBridge()) return;
  LAN_UI.unsubscribe = lanBridge().onLanState(snapshot => {
    LAN_UI.snapshot = snapshot || null;
    LAN_UI.pending = false;
    lanApplySnapshot();
  });
}

async function lanOpenRoom() {
  const game = state.currentGame;
  const bridge = lanBridge();
  // From the LAN button on a library card the play surface is opened first
  // (controller.ts action 'lan'), so `state.currentGame` is set by the time we get
  // here. Opening from an empty screen is a no-op rather than a broken room.
  if (!bridge || !game) {
    if (!game) toast('Hãy mở một trò chơi trước khi tạo phòng LAN.');
    return;
  }
  if (LAN_UI.pending) return;
  LAN_UI.pending = true;
  // A new room replaces any honour roll still on screen from the previous game.
  LAN_UI.showingPodium = false;
  LAN_UI.renderedState = null;
  // Close the play modal first? No: the teacher screen must stay usable as the
  // projector. The LAN screen is a separate modal (plan §8.5).
  lanOpenRoomModal(true);
  try {
    const result = await bridge.lanStart({ game });
    LAN_UI.pending = false;
    if (!result || !result.ok) {
      lanShowRoomError((result && result.message) || 'Không mở được phòng LAN.');
      return;
    }
    LAN_UI.snapshot = result.snapshot || null;
    lanApplySnapshot();
  } catch (error) {
    LAN_UI.pending = false;
    lanShowRoomError(`Không mở được phòng LAN: ${(error && error.message) || 'lỗi không xác định'}`);
  }
}

async function lanCloseRoom() {
  const bridge = lanBridge();
  if (!bridge) return;
  try { await bridge.lanStop(); } catch { /* closing is best effort */ }
  LAN_UI.snapshot = null;
  LAN_UI.renderedState = null;
  // Closing the room on purpose also dismisses a finished podium.
  LAN_UI.showingPodium = false;
  const root = $('#modalRoot');
  const panel = $('[data-lan-panel]', root);
  if (panel) panel.remove();
  // Put the play header button back into its idle appearance.
  lanRefreshHeaderButton();
}

function lanJoinUrl(snapshot) {
  return snapshot && snapshot.urls && snapshot.urls.length ? snapshot.urls[0] : '';
}

function lanQrHtml(url) {
  if (!url) return '';
  // QR pixels are generated locally by `lanQrMatrix` (no qrcode dependency, no
  // canvas): the classroom may have no Internet at all.
  const matrix = lanQrMatrix(url);
  if (!matrix) return '';
  const size = matrix.length;
  let path = '';
  matrix.forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      // `lanQrNewMatrix` stores `{ value, reserved }` per module, not a boolean.
      if (cell && cell.value) path += `M${colIndex} ${rowIndex}h1v1h-1z`;
    });
  });
  return `<svg class="lan-qr" viewBox="0 0 ${size} ${size}" role="img" aria-label="Mã QR vào phòng LAN" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#11152b"/></svg>`;
}

/** One team per player as the teacher sees them, grouped for the projector. */
function lanTeamBoardHtml(snapshot) {
  const players = Array.isArray(snapshot.players) ? snapshot.players : [];
  const teams = Array.isArray(snapshot.teams) ? snapshot.teams : [];
  if (!players.length) return '<p class="lan-empty">Chưa có bạn nào vào phòng. Chiếu mã QR cho cả lớp nhé.</p>';
  if (!teams.length) {
    const rows = players.map(player => `<li class="lan-player ${player.connected ? '' : 'is-offline'}"><span class="lan-player-name">${escapeHtml(player.name)}</span><span class="lan-player-meta">${player.points} điểm · đúng ${player.correct}/${player.answered}</span><span class="lan-dot" title="${player.connected ? 'Đang kết nối' : 'Mất kết nối'}"></span></li>`).join('');
    return `<ul class="lan-players">${rows}</ul>`;
  }
  const columns = teams.map(team => {
    const members = players.filter(player => player.teamId === team.id);
    const rows = members.map(player => `<li class="lan-player ${player.connected ? '' : 'is-offline'}"><span class="lan-player-name">${escapeHtml(player.name)}</span>${snapshot.teamLocked ? `<span class="lan-player-meta">${player.points}</span>` : `<span class="lan-move" role="group" aria-label="Chuyển đội">${teams.map(other => `<button type="button" class="lan-move-btn${other.id === team.id ? ' is-current' : ''}" data-lan-move="${player.id}:${other.id}" title="Chuyển sang ${escapeHtml(other.name)}">${escapeHtml(other.icon || '')}</button>`).join('')}</span>`}<span class="lan-dot" title="${player.connected ? 'Đang kết nối' : 'Mất kết nối'}"></span></li>`).join('');
    return `<div class="lan-team"><div class="lan-team-head"><span>${escapeHtml(team.icon || '👥')} ${escapeHtml(team.name)}</span><b>${members.length}</b></div><ul>${rows || '<li class="lan-empty">Chưa có bạn</li>'}</ul></div>`;
  }).join('');
  return `<div class="lan-teams">${columns}</div>`;
}

function lanRoomHtml(snapshot) {
  const url = lanJoinUrl(snapshot);
  const others = (snapshot.urls || []).slice(1);
  const players = Array.isArray(snapshot.players) ? snapshot.players : [];
  const connected = players.filter(player => player.connected).length;
  const statusLabel = `${connected}/${players.length} bạn đang kết nối`;
  return `<div class="lan-room" data-lan-room>
    ${lanRoomBarHtml(snapshot)}
    <div class="lan-invite">
      ${lanQrHtml(url)}
      <div class="lan-invite-text">
        <div class="lan-kicker">MỞ WI-FI CÙNG MẠNG VỚI MÁY GIÁO VIÊN</div>
        <p class="lan-url">Quét mã QR hoặc mở <b>${escapeHtml(url)}</b></p>
        ${others.length ? `<p class="lan-alt">Địa chỉ khác: ${others.map(other => `<code>${escapeHtml(other)}</code>`).join(' · ')}</p>` : ''}
        <p class="lan-roomcode">Mã phòng <strong>${escapeHtml(snapshot.roomCode)}</strong></p>
        <p class="lan-hint">Nếu điện thoại không vào được: mở Windows Firewall cho EduGame Studio (lần đầu Windows sẽ hỏi), hoặc kiểm tra cả hai máy đang ở cùng một Wi-Fi (không phải mạng khách/Guest).</p>
      </div>
    </div>
    <div class="lan-players-head"><span>${statusLabel}</span>${snapshot.teamLocked ? '' : '<span class="lan-note">Chọn đội cho từng bạn, hoặc để trống để chơi cá nhân.</span>'}</div>
    <div data-lan-roster>${lanTeamBoardHtml(snapshot)}</div>
    ${snapshot.scoringNote ? `<p class="lan-scoring">${escapeHtml(snapshot.scoringNote)}</p>` : ''}
    <div class="lan-actions">
      <button type="button" class="btn btn-secondary" data-lan-close>Đóng phòng LAN</button>
      <button type="button" class="btn btn-primary" data-lan-leave>Ẩn màn này, quay lại chiếu trò chơi</button>
    </div>
  </div>`;
}

/** Build (or update) the teacher's LAN panel. No-op when main has no room. */
function lanApplySnapshot() {
  const snapshot = LAN_UI.snapshot;
  lanRefreshHeaderButton();
  if (!snapshot) {
    // The room closed. Keep the honour roll if it is on screen: finishing a game
    // stops the server, and wiping the podium the teacher is reading would hide the
    // whole point of the end screen.
    if (LAN_UI.showingPodium && $('[data-lan-podium]')) return;
    const panel = $('[data-lan-panel]');
    if (panel) panel.remove();
    return;
  }
  const root = $('#modalRoot');
  let panel = $('[data-lan-panel]', root);
  if (!panel) panel = lanOpenRoomModal(false);
  if (!panel) return;
  if (snapshot.state === 'finished') {
    lanFinishRoomPanel(snapshot);
    return;
  }
  const body = $('[data-lan-body]', panel);
  if (!body) return;
  // Rebuilding the whole room on every snapshot would drop a half-finished team
  // click, so the QR/roster is drawn once and only the top bar is swapped when the
  // room moves between lobby and playing.
  const room = $('[data-lan-room]', body);
  if (room && LAN_UI.renderedState === snapshot.state) {
    const bar = $('[data-lan-startbar]', body) || $('[data-lan-progress]', body);
    const fresh = lanRoomBarHtml(snapshot);
    if (bar) bar.outerHTML = fresh;
    else lanUpdateAnsweredChip(snapshot);
  } else {
    body.innerHTML = lanRoomHtml(snapshot);
  }
  LAN_UI.renderedState = snapshot.state;
}

/** Same phase: keep the roster fresh without touching the buttons being clicked. */
function lanUpdateAnsweredChip(snapshot) {
  const players = Array.isArray(snapshot.players) ? snapshot.players : [];
  const chip = $('#lanAnsweredChip');
  if (chip) chip.textContent = `${snapshot.answeredCount}/${players.length} em đã trả lời`;
  lanRefreshRoster(snapshot);
}

/** Replace only the player lists, so team buttons keep their exact DOM nodes. */
function lanRefreshRoster(snapshot) {
  const host = $('[data-lan-roster]');
  if (!host) return;
  host.innerHTML = lanTeamBoardHtml(snapshot);
}

/** The bar above the QR: "Bắt đầu câu 1" in the lobby, progress while playing. */
function lanRoomBarHtml(snapshot) {
  const players = Array.isArray(snapshot.players) ? snapshot.players : [];
  const connected = players.filter(player => player.connected).length;
  if (snapshot.state === 'lobby') {
    return `<div class="lan-startbar" data-lan-startbar>
        <div class="lan-startbar-text"><strong>${connected ? `${connected} bạn đã sẵn sàng` : 'Chưa có bạn nào vào phòng'}</strong><span>Chiếu mã QR hoặc đọc mã phòng cho cả lớp, rồi bấm để mở câu 1. Điện thoại sẽ chuyển sang câu hỏi ngay.</span></div>
        <button type="button" class="btn btn-primary lan-start-btn" data-lan-begin ${connected ? '' : 'disabled title="Ít nhất một bạn phải vào phòng"'}>▶ Bắt đầu câu 1 (${snapshot.roundCount} câu)</button>
      </div>`;
  }
  return `<div class="lan-progress" data-lan-progress><span class="lan-kicker">ĐANG CHƠI</span><strong>${escapeHtml(snapshot.kicker || '')}</strong><span id="lanAnsweredChip">${snapshot.answeredCount}/${players.length} em đã trả lời</span><span class="lan-note">Bấm "Tiếp tục →" trên màn chiếu để chuyển câu cho cả lớp.</span></div>`;
}

function lanRefreshHeaderButton() {
  $$('[data-play-lan]').forEach(button => {
    const game = state.currentGame;
    const html = lanButtonHtml(game);
    if (!html) { button.remove(); return; }
    const template = document.createElement('template');
    template.innerHTML = html.trim();
    const fresh = template.content.firstElementChild;
    fresh.addEventListener('click', lanOpenRoom);
    button.replaceWith(fresh);
  });
}

/** Open the LAN modal. `loading` shows a spinner while main binds the port. */
function lanOpenRoomModal(loading) {
  const root = $('#modalRoot');
  if (!root) return null;
  let panel = $('[data-lan-panel]', root);
  if (panel) return panel;
  panel = document.createElement('div');
  panel.className = 'modal-backdrop lan-backdrop';
  panel.setAttribute('data-lan-panel', '');
  panel.innerHTML = `<div class="modal lan-modal bg-[#11152b] border border-[#303651] text-white" role="dialog" aria-label="Chơi LAN"><div class="modal-head bg-[#11152b] border-[#303651]"><div><h2>📱 Chơi LAN — học sinh trả lời trên điện thoại</h2><div class="small text-[#aeb5ce] mt-1">Máy này là máy chủ của lớp. Không cần Internet, chỉ cần chung Wi-Fi.</div></div><button class="modal-close bg-[#292f49] text-white" data-lan-hide aria-label="Ẩn màn LAN">✕</button></div><div class="modal-body p-[18px]" data-lan-body>${loading ? '<p class="lan-empty">Đang mở phòng…</p>' : ''}</div></div>`;
  root.appendChild(panel);
  $('[data-lan-hide]', panel).addEventListener('click', () => panel.remove());
  panel.addEventListener('click', event => {
    const move = event.target.closest('[data-lan-move]');
    if (move) {
      const [playerId, teamId] = String(move.dataset.lanMove).split(':');
      const bridge = lanBridge();
      if (bridge) bridge.lanAssignTeam({ playerId, teamId });
      return;
    }
    const begin = event.target.closest('[data-lan-begin]');
    if (begin) {
      if (begin.disabled) return;
      lanBeginRound(begin);
      return;
    }
    if (event.target.closest('[data-lan-close]')) lanCloseRoom();
    if (event.target.closest('[data-lan-leave]')) panel.remove();
  });
  return panel;
}

/**
 * Teacher pressed "Bắt đầu câu 1". The room opens the first question, and the play
 * screen is brought up behind the panel if the room was opened from a card, so the
 * teacher is looking at the same question as the class.
 */
async function lanBeginRound(button) {
  const bridge = lanBridge();
  if (!bridge || !bridge.lanBegin) return;
  if (button) button.disabled = true;
  try {
    const result = await bridge.lanBegin();
    if (!result || !result.ok) {
      toast((result && result.message) || 'Chưa mở được câu hỏi.');
      if (button) button.disabled = false;
      return;
    }
    // From a library card the play surface may not be open yet (the card opens the
    // modal, then hosts). Render the question if the play body is empty.
    if (LAN_UI.snapshot && LAN_UI.snapshot.state === 'question' && typeof renderQuestion === 'function') {
      const body = $('#playBody');
      const showingQuestion = body && (body.querySelector('.game-stage') || body.querySelector('.result-screen'));
      if (!showingQuestion && state.currentGame && state.currentGame.questions && state.currentGame.questions.length) {
        state.gameIndex = 0;
        state.gameAnswers = [];
        state.gameStart = Date.now();
        state.answerLocked = false;
        state.scenarioSteps = 0;
        if (typeof openPlayModal === 'function') openPlayModal();
      }
    }
  } catch (error) {
    toast(`Chưa mở được câu hỏi: ${(error && error.message) || 'lỗi không xác định'}`);
    if (button) button.disabled = false;
  }
}

/**
 * The teacher advanced the play screen ("Tiếp tục →" / treasure "Tiếp tục: Xem bản
 * đồ"). Close the LAN round so phones stop accepting answers and move on. Safe to
 * call when no room is open (most lessons).
 */
function lanAdvanceRound() {
  const bridge = lanBridge();
  if (!bridge || !bridge.lanNext || !LAN_UI.snapshot) return;
  bridge.lanNext().catch(() => { /* the room may have just closed */ });
}

/**
 * The desktop game reached its results screen. End the room so the phones stop
 * answering and both screens show the honour roll.
 *
 * Needed because the play screen ends a game by many routes — treasure's "Kết thúc
 * hành trình", the last stage, a branch, race results — and only the last "next
 * round" used to close the room. Without this, a LAN treasure journey could never
 * finish (`lan:state` stayed `question`) and the podium never appeared.
 *
 * Safe to call when no room is open or the room already finished.
 */
function lanFinishRoom() {
  const bridge = lanBridge();
  if (!bridge || !bridge.lanFinish || !LAN_UI.snapshot) return;
  if (LAN_UI.snapshot.state === 'finished') return;
  bridge.lanFinish().catch(() => { /* the room may have just closed */ });
}

function lanShowRoomError(message) {
  const panel = lanOpenRoomModal(false);
  const body = panel && $('[data-lan-body]', panel);
  if (!body) { toast(message); return; }
  body.innerHTML = `<p class="lan-error" role="alert">${escapeHtml(message)}</p><div class="lan-actions"><button type="button" class="btn btn-secondary" data-lan-close>Đóng</button><button type="button" class="btn btn-primary" data-lan-retry>Thử lại</button></div>`;
  const retry = $('[data-lan-retry]', body);
  if (retry) retry.addEventListener('click', () => { panel.remove(); lanOpenRoom(); });
  const close = $('[data-lan-close]', body);
  if (close) close.addEventListener('click', () => panel.remove());
}

/**
 * Medal for a rank. `earned` is false when nobody scored, so a class with a single
 * pupil who got nothing is not handed a gold medal.
 */
function lanMedalFor(rank, earned) {
  if (!earned) return '';
  return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '';
}

/**
 * Honour roll at the end of a LAN game: the podium (top three) then the rest.
 *
 * Mirrors `lanRankPlayers()` in `src/lan/lan-adapters.ts` (that module cannot be
 * loaded here: this is a classic script with no `require`). Ranking rules, kept in
 * sync by `tests/unit/lan-adapters.test.ts`:
 *   points desc -> correct desc -> Vietnamese name order; equal points *and* equal
 *   correct answers share a rank (1, 1, 2); a pupil with no points gets no medal.
 */
function lanPodiumHtml(snapshot) {
  const players = (snapshot && Array.isArray(snapshot.players)) ? snapshot.players : [];
  if (!players.length) return '';
  const teams = Array.isArray(snapshot.teams) ? snapshot.teams : [];
  const teamName = id => (teams.find(team => team.id === id) || {}).name || '';
  const sorted = players.slice().sort((a, b) => (b.points || 0) - (a.points || 0) || (b.correct || 0) - (a.correct || 0) || String(a.name).localeCompare(String(b.name), 'vi'));

  let rank = 0;
  let previous = null;
  const ranked = sorted.map(player => {
    const same = previous && previous.points === (player.points || 0) && previous.correct === (player.correct || 0);
    if (!same) rank = previous ? rank + 1 : 1;
    previous = { points: player.points || 0, correct: player.correct || 0 };
    return { player, rank, tie: false };
  });
  ranked.forEach((entry, index) => {
    if (ranked[index + 1] && ranked[index + 1].rank === entry.rank) entry.tie = true;
    if (ranked[index - 1] && ranked[index - 1].rank === entry.rank) entry.tie = true;
  });

  const top = ranked.slice(0, 3);
  const rest = ranked.slice(3);
  // Visual podium order: second, first, third, so the winner stands in the middle.
  const order = [1, 0, 2];
  const podium = order
    .map(position => top[position])
    .filter(Boolean)
    .map(entry => {
      const earned = entry.player.points > 0;
      return `<div class="lan-podium-step is-rank-${Math.min(entry.rank, 3)}${earned ? ' is-earned' : ''}" data-lan-podium="${entry.rank}">
        <div class="lan-podium-medal" aria-hidden="true">${lanMedalFor(entry.rank, earned)}</div>
        <div class="lan-podium-name">${escapeHtml(entry.player.name)}${entry.tie ? ' <span class="lan-podium-tie">đồng hạng</span>' : ''}</div>
        <div class="lan-podium-points">${entry.player.points} điểm</div>
        <div class="lan-podium-meta">${teamName(entry.player.teamId) ? escapeHtml(teamName(entry.player.teamId)) + ' · ' : ''}đúng ${entry.player.correct}/${entry.player.answered}</div>
        <div class="lan-podium-block"><span>${entry.rank}</span></div>
      </div>`;
    })
    .join('');
  const restHtml = rest.length
    ? `<ul class="lan-ranking lan-ranking-rest">${rest.map(entry => `<li><span>${entry.rank}. ${escapeHtml(entry.player.name)}</span><span>${entry.player.points} điểm · đúng ${entry.player.correct}/${entry.player.answered}</span></li>`).join('')}</ul>`
    : '';
  return `<div class="lan-podium-wrap" data-lan-podium-wrap><div class="lan-kicker">VINH DANH NGƯỜI CHƠI XUẤT SẮC</div><div class="lan-podium">${podium}</div>${restHtml}</div>`;
}

/**
 * The teacher finished the LAN game on the projector. Stop the room and attach the
 * per-pupil result block to the session that `renderResults()` is about to save.
 */
function lanFinishRoomPanel(snapshot) {
  const panel = lanOpenRoomModal(false);
  const body = panel && $('[data-lan-body]', panel);
  if (body) {
    body.innerHTML = `<div class="lan-finished">${lanPodiumHtml(snapshot)}<p class="lan-hint">Kết quả của từng bạn đã được ghi vào phiên chơi của trò chơi này.</p><div class="lan-actions"><button type="button" class="btn btn-primary" data-lan-hide>Đóng</button></div></div>`;
    $$('[data-lan-hide]', body).forEach(button => button.addEventListener('click', () => {
      LAN_UI.showingPodium = false;
      panel.remove();
    }));
    LAN_UI.showingPodium = true;
  }
  if (lanBridge()) lanBridge().lanStop().catch(() => {});
  LAN_UI.snapshot = null;
  lanRefreshHeaderButton();
}

/**
 * Called by `wireResultSession()` when saving a result. Returns the `lan` block for
 * the session row (or `{}`), keeping the same points/max the projector showed.
 */
function lanCollectSessionPayload() {
  const snapshot = LAN_UI.snapshot;
  if (!snapshot || !Array.isArray(snapshot.players) || !snapshot.players.length) return {};
  const teams = Array.isArray(snapshot.teams) ? snapshot.teams : [];
  const teamName = id => (teams.find(team => team.id === id) || {}).name || '';
  return {
    lan: {
      room: snapshot.roomCode,
      scoringMode: snapshot.scoringMode || '',
      max: snapshot.score ? snapshot.score.max : 0,
      players: snapshot.players.map(player => ({
        name: player.name,
        teamName: teamName(player.teamId),
        points: player.points,
        correct: player.correct,
        answered: player.answered
      }))
    }
  };
}

/**
 * Called at the top of `playGame()`. A room belongs to one playing of one game:
 * starting another game must not leave the old room answering new questions.
 */
function lanReleaseForNewGame() {
  if (!LAN_UI.snapshot) return;
  const panel = $('[data-lan-panel]');
  if (panel) panel.remove();
  if (lanBridge()) lanBridge().lanStop().catch(() => {});
  LAN_UI.snapshot = null;
}

// ---------- QR encoder (byte mode, error-correction level L, versions 1–10) ----------
/**
 * Small QR generator so the projector can show a join link without a dependency,
 * a CDN, or a canvas. Scope: byte mode, ECC level L, versions 1–10 (a LAN URL is
 * ~30 characters, which is version 3). Anything larger returns null and the panel
 * falls back to printing the URL, which the teacher can type.
 */
const LAN_QR = {
  // Version 1..10, ECC L: [total codewords, data codewords, EC codewords per block, block count]
  specs: [
    [26, 19, 7, 1], [44, 34, 10, 1], [70, 55, 15, 1], [100, 80, 20, 1], [134, 108, 26, 1],
    [172, 136, 18, 2], [196, 156, 20, 2], [242, 194, 24, 2], [292, 232, 30, 2], [346, 274, 18, 4]
  ],
  // Version 1..10, ECC L: index of the alignment-pattern centres.
  alignment: [[], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46]]
};

function lanQrMatrix(text) {
  try {
    return lanQrBuild(String(text || ''), 'L');
  } catch (error) {
    return null;
  }
}

function lanQrBuild(text, ecc) {
  const bytes = Array.from(new TextEncoder().encode(text));
  let version = 0;
  let spec = null;
  for (let candidate = 1; candidate <= 10; candidate += 1) {
    const entry = LAN_QR.specs[candidate - 1];
    const countBits = candidate < 10 ? 8 : 16;
    const needed = 4 + countBits + bytes.length * 8;
    if (needed <= entry[1] * 8) { version = candidate; spec = entry; break; }
  }
  if (!version || !spec) throw new Error('lan-qr: payload too long');
  const [totalCw, dataCw, ecPerBlock, blocks] = spec;
  const countBits = version < 10 ? 8 : 16;

  const bits = [];
  const push = (value, length) => { for (let i = length - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1); };
  push(4, 4); // byte mode
  push(bytes.length, countBits);
  bytes.forEach(byte => push(byte, 8));
  const capacity = dataCw * 8;
  push(0, Math.min(4, capacity - bits.length)); // terminator
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let pad = 0; data.length < dataCw; pad += 1) data.push(pad % 2 ? 0x11 : 0xEC);

  const ecTotal = totalCw - dataCw;
  const blocksCount = blocks;
  const dataPerBlock = Math.floor(dataCw / blocksCount);
  const ecPer = ecPerBlock || Math.floor(ecTotal / blocksCount);
  const dataBlocks = [];
  for (let index = 0; index < blocksCount; index += 1) dataBlocks.push(data.slice(index * dataPerBlock, (index + 1) * dataPerBlock));
  const eccBlocks = dataBlocks.map(block => lanQrReedSolomon(block, ecPer));
  const interleaved = [];
  for (let i = 0; i < dataPerBlock; i += 1) dataBlocks.forEach(block => { if (i < block.length) interleaved.push(block[i]); });
  for (let i = 0; i < ecPer; i += 1) eccBlocks.forEach(block => interleaved.push(block[i]));

  const size = 17 + version * 4;
  const modules = lanQrNewMatrix(size);
  lanQrDrawFunctionPatterns(modules, size, version);
  lanQrPlaceData(modules, size, interleaved);
  lanQrApplyMask(modules, size, 0);
  lanQrDrawFormatBits(modules, size);
  if (version >= 7) lanQrDrawVersionBits(modules, size, version);
  return modules;
}

function lanQrNewMatrix(size) {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => ({ value: false, reserved: false })));
}

function lanQrSet(matrix, row, col, dark) {
  if (row < 0 || col < 0 || row >= matrix.length || col >= matrix.length) return;
  matrix[row][col].value = Boolean(dark);
  matrix[row][col].reserved = true;
}

function lanQrDrawFunctionPatterns(matrix, size, version) {
  const finder = (top, left) => {
    for (let row = -1; row <= 7; row += 1) {
      for (let col = -1; col <= 7; col += 1) {
        const inside = row >= 0 && row <= 6 && col >= 0 && col <= 6;
        const dark = inside && ((row === 0 || row === 6 || col === 0 || col === 6) || (row >= 2 && row <= 4 && col >= 2 && col <= 4));
        lanQrSet(matrix, top + row, left + col, dark);
      }
    }
  };
  finder(0, 0);
  finder(0, size - 7);
  finder(size - 7, 0);
  // Format-info reservation (real bits are written by lanQrDrawFormatBits). The
  // corner cell (6,6) belongs to the format strip, but (6,8) and (8,6) belong to
  // the timing patterns and are left to the timing loop below (verified against a
  // reference encoder: both are dark on every version).
  for (let i = 0; i < 9; i += 1) {
    if (i !== 6) lanQrSet(matrix, 8, i, false);
    if (i !== 6) lanQrSet(matrix, i, 8, false);
  }
  // (6,6) is the corner where both timing patterns meet: always dark.
  lanQrSet(matrix, 6, 6, true);
  for (let i = 0; i < 8; i += 1) {
    lanQrSet(matrix, 8, size - 1 - i, false);
    lanQrSet(matrix, size - 1 - i, 8, false);
  }
  lanQrSet(matrix, size - 8, 8, true); // dark module
  // Alignment patterns (never over a finder).
  const centres = LAN_QR.alignment[version] || [];
  centres.forEach(row => centres.forEach(col => {
    if ((row <= 8 && col <= 8) || (row <= 8 && col >= size - 9) || (row >= size - 9 && col <= 8)) return;
    for (let dr = -2; dr <= 2; dr += 1) {
      for (let dc = -2; dc <= 2; dc += 1) {
        const dark = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
        lanQrSet(matrix, row + dr, col + dc, dark);
      }
    }
  }));
  // Version-info area (versions >= 7).
  if (version >= 7) {
    for (let i = 0; i < 6; i += 1) {
      for (let j = 0; j < 3; j += 1) {
        lanQrSet(matrix, size - 11 + j, i, false);
        lanQrSet(matrix, i, size - 11 + j, false);
      }
    }
  }
  // Timing patterns run between the finders (columns/rows 6), including the cells
  // that touch the finder separators at index 8. (8,6) is a normal timing module;
  // (6,8) is reserved for the format strip but still shows the timing value.
  for (let i = 8; i < size - 8; i += 1) {
    if (!matrix[6][i].reserved) lanQrSet(matrix, 6, i, i % 2 === 0);
    if (!matrix[i][6].reserved) lanQrSet(matrix, i, 6, i % 2 === 0);
  }
  matrix[6][8].value = true;
}

function lanQrPlaceData(matrix, size, codewords) {
  const bits = [];
  codewords.forEach(codeword => { for (let i = 7; i >= 0; i -= 1) bits.push((codeword >>> i) & 1); });
  let index = 0;
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // skip the vertical timing column
    for (let step = 0; step < size; step += 1) {
      const row = upward ? size - 1 - step : step;
      for (let offset = 0; offset < 2; offset += 1) {
        const col = right - offset;
        const cell = matrix[row][col];
        if (cell.reserved) continue;
        cell.value = index < bits.length ? Boolean(bits[index]) : false;
        index += 1;
      }
    }
    upward = !upward;
  }
}

function lanQrApplyMask(matrix, size, maskIndex) {
  const maskFns = [
    (row, col) => (row + col) % 2 === 0,
    (row) => row % 2 === 0,
    (row, col) => col % 3 === 0,
    (row, col) => (row + col) % 3 === 0,
    (row, col) => (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0,
    (row, col) => ((row * col) % 2) + ((row * col) % 3) === 0,
    (row, col) => (((row * col) % 2) + ((row * col) % 3)) % 2 === 0,
    (row, col) => (((row + col) % 2) + ((row * col) % 3)) % 2 === 0
  ];
  const mask = maskFns[maskIndex] || maskFns[0];
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (!matrix[row][col].reserved && mask(row, col)) matrix[row][col].value = !matrix[row][col].value;
    }
  }
}

function lanQrDrawFormatBits(matrix, size) {
  // Format info is 5 data bits (ECC level + mask) followed by a BCH(15,5) remainder,
  // then XORed with 0x5412. ECC L = 0b01, mask 0 -> 0x77C4 (QR spec Table C.1).
  const format = lanQrBch15((1 << 3) | 0);
  const bit = index => (format >>> index) & 1;
  // Top-left copy. Bit order verified against a reference encoder (spec §8.9):
  // bits 0-5 go down column 8 from row 0, bit 6 at (7,8), bit 7 at (8,8), bit 8 at
  // (8,7), then bits 9-14 continue left along row 8 from column 5 down to 0.
  for (let i = 0; i <= 5; i += 1) lanQrSet(matrix, i, 8, bit(i));
  lanQrSet(matrix, 7, 8, bit(6));
  lanQrSet(matrix, 8, 8, bit(7));
  lanQrSet(matrix, 8, 7, bit(8));
  for (let i = 9; i < 15; i += 1) lanQrSet(matrix, 8, 14 - i, bit(i));
  // Second copy: split between the top-right and bottom-left finders.
  for (let i = 0; i < 8; i += 1) lanQrSet(matrix, 8, size - 1 - i, bit(i));
  for (let i = 8; i < 15; i += 1) lanQrSet(matrix, size - 15 + i, 8, bit(i));
  lanQrSet(matrix, size - 8, 8, true); // dark module, always dark
}

/** BCH(15,5) codeword for 5 bits of format data, XOR the 0x5412 mask. */
function lanQrBch15(dataBits) {
  let value = dataBits << 10;
  for (let i = 4; i >= 0; i -= 1) {
    if ((value >>> (i + 10)) & 1) value ^= 0x537 << i;
  }
  return ((dataBits << 10) | (value & 0x3FF)) ^ 0x5412;
}

/** 18-bit version info for versions >= 7 (BCH(18,6), generator 0x1F25). */
function lanQrVersionInfo(version) {
  let value = version << 12;
  for (let i = 5; i >= 0; i -= 1) {
    if ((value >>> (i + 12)) & 1) value ^= 0x1F25 << i;
  }
  return (version << 12) | (value & 0xFFF);
}

/** Two copies of the version info, top-right and bottom-left, for versions >= 7. */
function lanQrDrawVersionBits(matrix, size, version) {
  const bits = lanQrVersionInfo(version);
  for (let i = 0; i < 18; i += 1) {
    const dark = ((bits >>> i) & 1) !== 0;
    const a = Math.floor(i / 3);
    const b = i % 3;
    lanQrSet(matrix, a, size - 11 + b, dark);
    lanQrSet(matrix, size - 11 + b, a, dark);
  }
}

/** Reed–Solomon over GF(256) with the QR polynomial 0x11D (error correction L). */
function lanQrReedSolomon(data, ecCount) {
  const exp = new Array(256);
  const log = new Array(256);
  let value = 1;
  for (let i = 0; i < 255; i += 1) {
    exp[i] = value;
    log[value] = i;
    value <<= 1;
    if (value & 0x100) value ^= 0x11D;
  }
  for (let i = 255; i < 256; i += 1) exp[i] = exp[i - 255];
  const mul = (a, b) => (a === 0 || b === 0 ? 0 : exp[(log[a] + log[b]) % 255]);
  // g(x) = (x - a^0)(x - a^1)...(x - a^(ecCount-1)); coefficients are stored lowest
  // degree first, so the new term shifts up and the old coefficients keep degree.
  let generator = [1];
  for (let i = 0; i < ecCount; i += 1) {
    const next = new Array(generator.length + 1).fill(0);
    generator.forEach((coefficient, index) => {
      next[index] ^= coefficient;
      next[index + 1] ^= mul(coefficient, exp[i]);
    });
    generator = next;
  }
  const remainder = data.concat(new Array(ecCount).fill(0));
  for (let i = 0; i < data.length; i += 1) {
    const factor = remainder[i];
    if (!factor) continue;
    for (let j = 0; j < generator.length; j += 1) remainder[i + j] ^= mul(generator[j], factor);
  }
  return remainder.slice(data.length);
}

/** Wire the LAN bridge once at boot; harmless when the bridge is missing. */
function lanInit() {
  lanEnsureSubscribed();
}
