// @ts-nocheck -- migrated legacy UI logic; new contracts are typed in src/shared/types.ts.
function playGame(game, options = {}) {
  stopPresentationMode();
  state.playStartedAt = Date.now();
  state.resultSession = null;
  state.lastSummary = null;
  const wantsFullscreen = Boolean(options && options.fullscreen);
  const enterFullscreen = () => {
    if (wantsFullscreen) setPlayFullscreen(true);
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
  state.currentGame = game; state.gameIndex = 0; state.gameAnswers = []; state.gameStart = Date.now(); state.answerLocked = false; state.scenarioSteps = 0; state.teamPlay = null;
  enterFullscreen();
  if (game.gameSetup?.scoringMode === 'thi đấu đội') {
    openTeamSetup();
  } else {
    openPlayModal();
  }
  return true;
}

/** Read display info from the main process; null means unknown (treat as one screen). */
async function getDisplayInfo() {
  const eduGame = window.eduGame;
  if (!eduGame || typeof eduGame.getDisplays !== 'function') return null;
  try {
    const result = await eduGame.getDisplays();
    if (!result || !result.ok || !result.data) return null;
    return result.data;
  } catch {
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
  if (!game) return playGame(game);
  const displays = await getDisplayInfo();
  if (hasSecondaryDisplay(displays)) {
    if (!playGame(game)) return false;
    const started = await startPresentationMode();
    if (started) return true;
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
    if (result && result.ok) return true;
  } catch (error) {}
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
  setPlayFullscreen(false);
  stopPresentationMode();
  $('#modalRoot').innerHTML = '';
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
  } else if (template === 'treasure-hunt') {
    const hunt = game?.treasureHunt;
    const play = state.treasurePlay;
    rows.push({ label: 'Chặng đúng', value: `${(play?.results || []).filter(result => result.correct).length}/${hunt?.stages?.length ?? 0}` });
    rows.push({ label: 'Vật phẩm ẩn', value: `${Object.keys(play?.itemsFound || {}).length}` });
  } else if (template === 'race') {
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
    if (summary.winner) rows.push({ label: 'Đội thắng', value: summary.winner, highlight: true });
  } else {
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
  if (!game) return null;
  const questions = game.questions || [];
  const q = questions[Math.min(state.gameIndex || 0, Math.max(questions.length - 1, 0))];
  if (!q) return null;
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
  if (!matching || !play) return null;
  const matchedIds = [...new Set(
    $$('#playBody .match-card.matched, #playBody [data-category-card].matched, #playBody .memory-card.matched')
      .map(el => el.dataset.pair)
      .filter(Boolean)
  )];
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
  if (!stage) return undefined;
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
  if (!hunt || !play) return null;
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
  if (!race || !play) return null;
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
  if (!state.currentGame) return null;
  if (extra.isComplete || state.lastSummary) return buildResultsView();
  const template = state.currentGame.template || 'quiz';
  if (template === 'matching') return buildMatchingView();
  if (template === 'treasure-hunt') return buildTreasureView();
  if (template === 'race') return buildRaceView();
  return buildQuizView();
}

/** Build a PresentationState snapshot from current renderer state. */
function buildPresentationState(extra = {}): object {
  const game = state.currentGame;
  if (!game) return null;
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
function sendPresentationState(extra = {}): void {
  if (!presentationStarted) return;
  const eduGame = window.eduGame;
  if (!eduGame || typeof eduGame.sendPresentationState !== 'function') return;
  const payload = buildPresentationState(extra);
  if (!payload) return;
  eduGame.sendPresentationState(payload);
}

/** Explicitly start Presentation Mode. Never called from normal question rendering. */
async function startPresentationMode(options = {}): Promise<boolean> {
  if (presentationStarted) return true;
  if (presentationStarting) return false;
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
    } catch {
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
    if (token !== presentationToken) return false;
    if (result && result.ok) {
      presentationStarted = true;
      return true;
    }
    toast((result && result.error) || 'Không mở được cửa sổ trình chiếu. Hãy kiểm tra màn hình phụ.', 5000);
    return false;
  } catch (error) {
    if (token === presentationToken) {
      toast(`Không mở được cửa sổ trình chiếu: ${(error && error.message) || 'lỗi không xác định'}`, 5000);
    }
    return false;
  } finally {
    if (token === presentationToken) presentationStarting = false;
  }
}

/** Stop presentation mode and reset tracking. */
function stopPresentationMode(): void {
  const eduGame = window.eduGame;
  presentationToken += 1;
  presentationStarting = false;
  if (eduGame && typeof eduGame.stopPresentation === 'function') {
    try {
      const result = eduGame.stopPresentation();
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch {
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
// Template chỉ ghi data-progress; giá trị % động gán qua style.width lúc render.
function paintProgress(scope) {
  $$('[data-progress]', scope).forEach(el => { el.style.width = `${el.dataset.progress}%`; });
}
// ---------- §2.3 Thi đấu đội (quiz/scenario) ----------
function openTeamSetup() {
  const root = $('#modalRoot');
  root.innerHTML = `<div class="modal-backdrop"><div class="modal w-[min(720px,96vw)] bg-[#11152b] border border-[#303651]" data-player-theme="${playerTheme()}"><div class="modal-head bg-[#11152b] border-[#303651] text-white"><div><h2>${escapeHtml(state.currentGame.title)}</h2><div class="small text-[#aeb5ce] mt-1">THI ĐẤU ĐỘI · CHIA ĐỘ TRƯỚC KHI BẮT ĐẦU</div></div><button class="modal-close bg-[#292f49] text-white" data-play-fullscreen>⛶</button><button class="modal-close bg-[#292f49] text-white" data-play-close>✕</button></div><div class="modal-body p-[18px]" id="playBody"></div></div></div>`;
  $('[data-play-close]', root).addEventListener('click', () => root.innerHTML = '');
  state.pendingTeams = [
    { id: 't1', name: 'Đội A', icon: '🏎️' },
    { id: 't2', name: 'Đội B', icon: '🚀' }
  ];
  renderTeamSetup();
}
function renderTeamSetup() {
  const root = $('#playBody');
  const teams = state.pendingTeams;
  root.innerHTML = `<div class="game-stage"><div class="stage-kicker">CHIA ĐỘ CHO LỚP</div><p class="small text-[#aeb5ce]">Mỗi câu hỏi cộng điểm cho đội đang tới lượt. Giáo viên có thể luân phiên người trả lời — chọn lại đội trên thanh lượt trước khi học sinh trả lời.</p>
    <div class="team-setup">${teams.map((t, i) => `<div class="team-setup-row"><input data-team-icon data-team-index="${i}" value="${escapeHtml(t.icon)}" class="w-[64px] text-center" title="Biểu tượng đội"><input data-team-name data-team-index="${i}" value="${escapeHtml(t.name)}" placeholder="Tên đội ${i + 1}"><button type="button" class="text-link danger-text" data-team-remove="${i}" ${teams.length <= 2 ? 'disabled opacity-[.35] cursor-default' : ''}>✕</button></div>`).join('')}</div>
    <div class="mt-[10px]"><button type="button" class="btn btn-secondary btn-small" id="addTeamBtn" ${teams.length >= 6 ? 'disabled' : ''}>＋ Thêm đội (tối đa 6)</button></div>
    <div class="result-actions mt-[18px]"><button type="button" class="btn btn-secondary" data-play-close2>Đóng</button><button type="button" class="btn btn-primary" id="startTeamGameBtn">🏁 Bắt đầu thi đấu</button></div></div>`;
  $$('[data-team-name]', root).forEach(el => el.addEventListener('input', () => { state.pendingTeams[Number(el.dataset.teamIndex)].name = el.value; }));
  $$('[data-team-icon]', root).forEach(el => el.addEventListener('input', () => { state.pendingTeams[Number(el.dataset.teamIndex)].icon = el.value; }));
  $$('[data-team-remove]', root).forEach(btn => btn.addEventListener('click', () => {
    if (state.pendingTeams.length <= 2) return;
    state.pendingTeams.splice(Number(btn.dataset.teamRemove), 1);
    renderTeamSetup();
  }));
  $('#addTeamBtn', root).addEventListener('click', () => {
    if (state.pendingTeams.length >= 6) return;
    const n = state.pendingTeams.length + 1;
    state.pendingTeams.push({ id: `t${n}-${Date.now().toString(36)}`, name: `Đội ${String.fromCharCode(64 + n)}`, icon: '🏁' });
    renderTeamSetup();
  });
  $('[data-play-close2]', root).addEventListener('click', () => closePlaySurface());
  $('#startTeamGameBtn', root).addEventListener('click', startTeamGame);
}
function startTeamGame() {
  const names = state.pendingTeams.map(t => t.name.trim().toLowerCase());
  if (state.pendingTeams.some(t => !t.name.trim())) return toast('Mỗi đội cần có tên.');
  if (new Set(names).size !== names.length) return toast('Tên các đội đang trùng nhau.');
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
  return `<div class="team-turn-bar"><span>👥 LƯỢT CỦA <strong>${team.icon} ${escapeHtml(team.name)}</strong> · 🏆 ${team.points} điểm</span>${tp.teams.length > 1 ? `<label class="small text-[#aeb5ce]">Giao câu này cho <select id="teamTurnSelect">${tp.teams.map((t, i) => `<option value="${i}" ${i === tp.turn ? 'selected' : ''}>${t.icon} ${escapeHtml(t.name)}</option>`).join('')}</select></label>` : ''}</div>`;
}
function leaderboardHtml() {
  const tp = state.teamPlay;
  if (!tp) return '';
  const sorted = tp.teams.slice().sort((a, b) => b.points - a.points || b.correct - a.correct);
  const medals = ['🥇', '🥈', '🥉'];
  return `<div class="leaderboard"><div class="stage-kicker">BẢNG XẾP HẠNG ĐỘI</div>${sorted.map((t, i) => `<div class="leaderboard-row ${i === 0 && t.points > 0 ? 'leader' : ''}"><span>${t.points > 0 ? (medals[i] || `#${i + 1}`) : '·'} <strong>${t.icon} ${escapeHtml(t.name)}</strong></span><span>Đúng ${t.correct}/${t.answered} câu</span><span>🏆 ${t.points} điểm</span></div>`).join('')}</div>`;
}
function bindPlayHeader(root) {
  const present = $('[data-play-present]', root);
  if (present) {
    present.addEventListener('click', () => { startPresentationMode({ requireSecondary: true }); });
  }
}

function openPlayModal() {
  const root = $('#modalRoot');
  root.innerHTML = `<div class="modal-backdrop"><div class="modal w-[min(1180px,97vw)] bg-[#11152b] border border-[#303651]" data-player-theme="${playerTheme()}"><div class="modal-head play-head bg-[#11152b] border-[#303651] text-white"><div class="play-head-title"><h2>${escapeHtml(state.currentGame.title)}</h2><div class="small text-[#aeb5ce] mt-1">CHẾ ĐỘ TRÌNH CHIẾU · NGOẠI TUYẾN</div></div><div class="play-head-actions"><button class="play-tool" data-play-fullscreen title="Toàn màn hình" aria-label="Toàn màn hình"><span class="play-tool-icon">⛶</span></button><button class="play-tool play-tool-present" data-play-present title="Trình chiếu lên máy chiếu" aria-label="Trình chiếu"><span class="play-tool-icon">📽</span><span class="play-tool-label">Trình chiếu</span></button><button class="play-tool play-tool-danger" data-play-close title="Đóng" aria-label="Đóng"><span class="play-tool-icon">✕</span></button></div></div><div class="modal-body p-[18px]" id="playBody"></div></div></div>`;
  $('[data-play-close]',root).addEventListener('click', () => root.innerHTML = '');
  bindPlayHeader(root);
  renderQuestion();
}
function renderQuestion() {
  const game = state.currentGame, q = game.questions[state.gameIndex], root = $('#playBody');
  if (!q) return renderResults();
  state.answerLocked = false;
  const progress = Math.round(state.gameAnswers.length / game.questions.length * 100);
  const scoring = resolveScoring(game.gameSetup);
  const scoringTip = ({ 'cơ bản': '✓ Đúng nhận điểm cố định, sai không bị trừ điểm', 'tốc độ': `⚡ Đúng nhanh trong 8 giây: +${scoring.timeBonus} điểm thưởng`, 'theo độ khó': `⛰️ Điểm theo độ khó: dễ ${scoring.table['dễ']} · trung bình ${scoring.table['trung bình']} · khó ${scoring.table['khó']}`, 'thi đấu đội': '👥 Điểm cộng cho đội — có thể luân phiên người trả lời', 'luyện tập': '📖 Luyện tập: không áp lực thời gian — xem kỹ giải thích' })[scoring.mode] || '';
  const textQ = isTextQuestion(q);
  const kicker = q.type==='scenario'?'TÌNH HUỐNG THỰC TẾ':q.type==='fill-in-blank'?'ĐIỀN TỪ CÒN THIẾU':q.type==='short-answer'?'TRẢ LỜI NGẮN':q.type==='true-false'?'ĐÚNG HAY SAI':'THỬ THÁCH KIẾN THỨC';
  const trueFalse = q.type === 'true-false';
  const optionMark = (option, index) => trueFalse
    ? (/^đúng\b/i.test(String(option.text || '').trim()) ? '✓' : /^sai\b/i.test(String(option.text || '').trim()) ? '✗' : String.fromCharCode(65 + index))
    : String.fromCharCode(65 + index);
  const shortAnswerPlaceholder = q.type==='fill-in-blank'?'Nhập từ hoặc cụm từ còn thiếu…':'Nhập câu trả lời ngắn (tối đa 5 từ)…';
  const answerArea = textQ
    ? `<div class="text-answer-box"><input id="textAnswerInput" placeholder="${shortAnswerPlaceholder}" autocomplete="off"><button class="btn btn-primary" id="textAnswerBtn">Trả lời</button>${q.hint?`<button class="btn btn-secondary text-answer-hint" type="button" data-answer-hint>💡 Gợi ý</button>`:''}</div>${q.hint?`<div class="text-answer-hint-text hidden" id="textAnswerHint">💡 <strong>Gợi ý:</strong> ${escapeHtml(q.hint)}</div>`:''}`
    : `<div class="answer-grid${trueFalse ? ' true-false-grid' : ''}">${q.options.map((o,i)=>`<button class="answer-option" data-answer="${escapeHtml(o.id)}"><span class="letter">${optionMark(o, i)}</span><span>${escapeHtml(o.text)}</span></button>`).join('')}</div>`;
  root.innerHTML = `<div class="game-stage"><div class="stage-top"><span class="stage-meta">${escapeHtml(game.subject || 'TRÒ CHƠI HỌC TẬP')} · ${game.grade ? 'LỚP '+escapeHtml(game.grade) : 'MỌI LỚP'}</span><span class="stage-meta stage-meta-right"><span class="stage-chip">${game.template==='scenario'?'QUYẾT ĐỊNH':'CÂU'} <b>${state.gameAnswers.length+1}</b>/${game.questions.length}</span><span class="stage-chip stage-chip-score">🏆 <b>${state.gameAnswers.reduce((s,a)=>s+a.points,0)}</b> điểm</span></span></div><div class="stage-progress"><div data-progress="${progress}"></div></div>${state.teamPlay ? teamTurnBarHtml() : ''}<div class="stage-center"><div class="stage-col">${stageIllustrationHtml(q, game, 'is-stage')}</div><div class="stage-col is-main"><div class="stage-kicker">${kicker}</div>${q.context?`<p class="scenario-context">${escapeHtml(q.context).replace(/\n/g,'<br>')}</p>`:''}<div class="stage-question">${escapeHtml(q.prompt).replace(/\n/g,'<br>')}</div>${answerArea}<div id="answerFeedback"></div><div class="stage-bottom"><span class="stage-tip">${scoringTip}</span><button class="btn hidden" id="nextQuestionBtn">Tiếp tục →</button></div></div></div></div>`;
  paintProgress(root);
  $$('.answer-option',root).forEach(btn => btn.addEventListener('click', () => chooseAnswer(q, btn.dataset.answer)));
  if (textQ) {
    const input = $('#textAnswerInput', root);
    const submit = () => { const value = input.value; if (!value.trim()) return toast('Hãy nhập câu trả lời trước.'); chooseAnswer(q, null, value); };
    $('#textAnswerBtn', root).addEventListener('click', submit);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    const hintBtn = $('[data-answer-hint]', root);
    if (hintBtn) hintBtn.addEventListener('click', () => {
      const hint = $('#textAnswerHint', root);
      if (hint) hint.classList.toggle('hidden');
      hintBtn.disabled = true;
      hintBtn.textContent = '💡 Đã mở gợi ý';
      input.focus();
    });
    input.focus();
  }
  const turnSelect = $('#teamTurnSelect', root);
  if (turnSelect) turnSelect.addEventListener('change', () => { state.teamPlay.turn = Number(turnSelect.value); renderQuestion(); });
  sendPresentationState();
}
function chooseAnswer(question, optionId, answerText) {
  if (state.answerLocked) return; state.answerLocked = true;
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
  let teamNote = '';
  if (state.teamPlay) {
    const tp = state.teamPlay;
    const team = tp.teams[tp.turn];
    team.points += points;
    if (correct) team.correct += 1;
    team.answered += 1;
    const nextTeam = tp.teams[(tp.turn + 1) % tp.teams.length];
    teamNote = `<br><strong>👥 ${escapeHtml(team.name)}</strong> được cộng ${points} điểm.${tp.teams.length > 1 ? ` Lượt sau: ${escapeHtml(nextTeam.name)}.` : ''}`;
    tp.turn = (tp.turn + 1) % tp.teams.length;
  }
  if (textQ) {
    const input = document.getElementById('textAnswerInput');
    const submitBtn = document.getElementById('textAnswerBtn');
    if (input) { input.disabled = true; }
    if (submitBtn) submitBtn.disabled = true;
    const hintBtn = document.querySelector('[data-answer-hint]');
    if (hintBtn) hintBtn.disabled = true;
  }
  $$('.answer-option').forEach(btn => {
    btn.disabled = true;
    if (scenario) {
      if (btn.dataset.answer === optionId) btn.classList.add('selected');
    } else if (btn.dataset.answer === question.correctOptionId) btn.classList.add('correct');
    else if (btn.dataset.answer === optionId) btn.classList.add('wrong');
  });
  const feedback = $('#answerFeedback');
  feedback.className = `feedback ${correct?'good':'bad'}`;
  const rubric = scenarioScore
    ? `<br>Điểm quyết định: ${points}/100 (an toàn ${scenarioScore.breakdown.safety}/60 · giải thích ${scenarioScore.breakdown.reasoning}/25 · giảm hậu quả ${scenarioScore.breakdown.harmReduction}/15).`
    : '';
  const answerReveal = textQ
    ? `<br><strong>Đáp án đúng:</strong> ${escapeHtml(question.correctAnswer || '')}${question.alternateAnswers?.length ? ` (hoặc: ${question.alternateAnswers.map(a => escapeHtml(a)).join(', ')})` : ''}${question.hint && !correct ? `<br><strong>💡 Gợi ý:</strong> ${escapeHtml(question.hint)}` : ''}`
    : '';
  const teacherFeedback = scenario && selectedOption?.feedback
    ? selectedOption.feedback
    : question.explanation || 'Hãy ôn lại nội dung bài học.';
  const discussion = scenario && question.discussionPrompt
    ? `<br><strong>Thảo luận:</strong> ${escapeHtml(question.discussionPrompt)}`
    : '';
  feedback.innerHTML = `<strong>${scenario?'Đã ghi nhận quyết định.':correct?'✓ Chính xác!':'✕ Chưa chính xác.'}</strong> ${scenario?`Bạn nhận ${points} điểm.`:correct?`Bạn nhận ${points} điểm${speedBonus?` (gồm +${speedBonus} điểm nhanh)`:''}.`:`${textQ?`Câu trả lời của bạn: “${escapeHtml(String(answerText ?? '').trim())}”.`:'Đáp án đúng đã được đánh dấu.'}`}${answerReveal}${rubric}<br>${escapeHtml(teacherFeedback)}${discussion}${teamNote}`;
  const next = scenario
    ? resolveScenarioTransition(selectedOption, state.gameIndex, state.currentGame.questions)
    : state.gameIndex + 1;
  state.nextQuestionIndex = next === undefined || scenario && state.scenarioSteps >= 100
    ? state.currentGame.questions.length
    : next;
  $('#nextQuestionBtn').classList.remove('hidden');
  $('#nextQuestionBtn').textContent = state.nextQuestionIndex >= state.currentGame.questions.length ? 'Xem kết quả →' : 'Tình huống tiếp theo →';
  $('#nextQuestionBtn').onclick = () => { state.gameIndex=state.nextQuestionIndex; state.gameStart = Date.now(); renderQuestion(); };
  sendPresentationState();
}
async function renderResults() {
  const game = state.currentGame;
  const summary = game.template === 'scenario'
    ? calculateScenarioSummary(state.gameAnswers)
    : calculateSummary(state.gameAnswers, game.questions, game.gameSetup);
  const { points, max, correct, percent } = summary;
  const ranked = state.teamPlay ? state.teamPlay.teams.slice().sort((a, b) => b.points - a.points || b.correct - a.correct) : null;
  const top = ranked ? ranked[0] : null;
  state.lastSummary = ranked
    ? { points: top.points, max, percent: max ? Math.round(top.points / max * 100) : 0, correct: top.correct, total: game.questions.length, winnerTeam: top.name }
    : summary;
  $('#playBody').innerHTML = `<div class="game-stage"><div class="result-screen"><div class="result-medal">${percent>=80?'🏆':percent>=50?'🎖️':'🌱'}</div><div class="stage-kicker">THỬ THÁCH HOÀN THÀNH</div><h2>${ranked&&top?`${top.icon} ${escapeHtml(top.name)} dẫn đầu!`:percent>=80?'Xuất sắc!':percent>=50?'Làm tốt lắm!':'Tiếp tục cố gắng!'}</h2><p>${escapeHtml(game.title)}</p><div class="result-score">${points.toLocaleString('vi-VN')} điểm</div><p>${game.template==='scenario'?`Hoàn thành ${state.gameAnswers.length} quyết định · ${percent}% điểm tối đa`:`Trả lời đúng ${correct}/${game.questions.length} câu · ${percent}% điểm tối đa`}</p>${state.teamPlay ? leaderboardHtml() : ''}<p id="resultSaveStatus" class="result-save-status">Đang tự lưu kết quả…</p><div class="result-actions"><button class="btn btn-secondary" id="closeResultBtn">Đóng</button><button class="btn btn-secondary" id="replayBtn">↻ Chơi lại</button><button class="btn btn-primary" id="saveResultBtn">Đang lưu…</button></div></div></div>`;
  $('#closeResultBtn').onclick = () => closePlaySurface();
  $('#replayBtn').onclick = () => {
    state.gameIndex=0;state.gameAnswers=[];state.gameStart=Date.now();state.scenarioSteps=0;
    state.playStartedAt=Date.now();state.resultSession=null;
    if (state.teamPlay) { state.teamPlay.teams.forEach(t => { t.points=0;t.correct=0;t.answered=0; }); state.teamPlay.turn=0; }
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
  root.innerHTML = `<div class="modal-backdrop"><div class="modal w-[min(980px,96vw)] bg-[#11152b] border border-[#303651]" data-player-theme="${playerTheme()}"><div class="modal-head bg-[#11152b] border-[#303651] text-white"><div><h2>${escapeHtml(game.title)}</h2><div class="small text-[#aeb5ce] mt-1">${modeLabel} · NGOẠI TUYẾN</div></div><button class="modal-close bg-[#292f49] text-white" data-play-fullscreen>⛶</button><button class="modal-close bg-[#292f49] text-white" data-play-present>Trình chiếu</button><button class="modal-close bg-[#292f49] text-white" data-play-close>✕</button></div><div class="modal-body p-[18px]" id="playBody"></div></div></div>`;
  $('[data-play-close]', root).addEventListener('click', () => root.innerHTML = '');
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
  if (!fb) return;
  fb.className = `feedback ${kind}`;
  fb.innerHTML = `<strong>${text}</strong>`;
}
function updateMatchingHeader() {
  const stats = $('#matchingStats');
  if (!stats) return;
  const m = state.currentGame.matchingGame, mp = state.matchingPlay;
  const elapsed = Math.max(0, Math.round((Date.now() - state.gameStart) / 1000));
  stats.textContent = `ĐÃ GHÉP ${mp.matched}/${m.pairs.length} · SAI ${mp.wrong} · ${elapsed}s · ${m.practiceMode ? '📖 Luyện tập' : '🏆 Chinh phục'}`;
  const bar = $('.stage-progress > div');
  if (bar) bar.style.width = `${Math.round(mp.matched / m.pairs.length * 100)}%`;
  sendPresentationState();
}
function renderMatchingBoard() {
  const m = state.currentGame.matchingGame;
  if (state.matchingPlay.matched >= m.pairs.length) return renderMatchingResults();
  const mode = ['columns', 'memory', 'categorize'].includes(m.mode) ? m.mode : 'columns';
  const root = $('#playBody');
  if (mode === 'memory') renderMemoryBoard(root, m);
  else if (mode === 'categorize') renderCategorizeBoard(root, m);
  else renderColumnsBoard(root, m);
}
/** Matching has no single "current item"; the game-level illustration comes
    from the first pair, which is what the plan/AI populates. Returns '' when
    the board should stay clean. */
function matchingIllustrationHtml(game) {
  const m = game && game.matchingGame;
  const first = m && Array.isArray(m.pairs) ? m.pairs[0] : null;
  return first ? stageIllustrationHtml(first, game, 'is-matching') : '';
}

function renderColumnsBoard(root, m) {
  const rights = shuffled(m.pairs);
  root.innerHTML = `<div class="game-stage">${matchingHeader()}<div class="stage-center"><div class="stage-col">${matchingIllustrationHtml(state.currentGame)}</div><div class="stage-col is-main"><div class="stage-kicker">GHÉP HAI CỘT</div><p class="field-hint">Chọn một mục ở cột A, rồi chọn mục tương ứng ở cột B.</p><div class="matching-board"><div class="matching-col">${m.pairs.map(p => `<button type="button" class="match-card" data-match-side="left" data-pair="${escapeHtml(p.id)}">${escapeHtml(p.left)}</button>`).join('')}</div><div class="matching-col">${rights.map(p => `<button type="button" class="match-card" data-match-side="right" data-pair="${escapeHtml(p.id)}">${escapeHtml(p.right)}</button>`).join('')}</div></div><div id="matchFeedback"></div></div></div>${matchingFooter(m)}</div>`;
  paintProgress(root);
  $$('.match-card', root).forEach(btn => btn.addEventListener('click', () => onColumnCardClick(btn)));
  sendPresentationState();
}
function onColumnCardClick(btn) {
  const mp = state.matchingPlay;
  if (btn.classList.contains('matched') || mp.lock) return;
  const side = btn.dataset.matchSide;
  const selector = `[data-match-side="${side}"]`;
  $$(selector).forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  if (side === 'left') mp.selectedLeft = btn; else mp.selectedRight = btn;
  sendPresentationState();
  if (mp.selectedLeft && mp.selectedRight) evaluateColumnMatch();
}
function evaluateColumnMatch() {
  const mp = state.matchingPlay;
  const left = mp.selectedLeft, right = mp.selectedRight;
  if (left.dataset.pair === right.dataset.pair) {
    left.classList.add('matched'); right.classList.add('matched');
    left.classList.remove('selected'); right.classList.remove('selected');
    mp.matched += 1;
    mp.selectedLeft = mp.selectedRight = null;
    const pair = state.currentGame.matchingGame.pairs.find(item => item.id === left.dataset.pair);
    matchingFeedback('good', pair
      ? `✓ Ghép chính xác! Hãy giải thích mối quan hệ giữa “${escapeHtml(pair.left)}” và “${escapeHtml(pair.right)}”.`
      : '✓ Ghép chính xác! Hãy giải thích vì sao hai nội dung này đi với nhau.');
    updateMatchingHeader();
    if (mp.matched >= state.currentGame.matchingGame.pairs.length) setTimeout(renderMatchingResults, 500);
  } else {
    mp.wrong += 1;
    mp.lock = true;
    left.classList.add('wrong'); right.classList.add('wrong');
    matchingFeedback('bad', '✕ Chưa đúng — thử lại.');
    setTimeout(() => {
      left.classList.remove('selected', 'wrong'); right.classList.remove('selected', 'wrong');
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
  root.innerHTML = `<div class="game-stage">${matchingHeader()}<div class="stage-center"><div class="stage-col">${matchingIllustrationHtml(state.currentGame)}</div><div class="stage-col is-main"><div class="stage-kicker">LẬT THẺ GHI NHỚ</div><p class="field-hint">Lật từng thẻ để tìm hai nội dung tương ứng.</p><div class="memory-grid">${state.memoryCards.map((c, i) => `<button type="button" class="memory-card" data-memory="${i}" data-pair="${escapeHtml(c.pair)}"><span class="memory-face">?</span></button>`).join('')}</div><div id="matchFeedback"></div></div></div>${matchingFooter(m)}</div>`;
  paintProgress(root);
  $$('.memory-card', root).forEach(btn => btn.addEventListener('click', () => onMemoryCardClick(btn)));
  sendPresentationState();
}
function onMemoryCardClick(btn) {
  const mp = state.matchingPlay;
  if (mp.lock || btn.classList.contains('matched') || btn.classList.contains('flipped')) return;
  const card = state.memoryCards[Number(btn.dataset.memory)];
  btn.classList.add('flipped');
  btn.querySelector('.memory-face').textContent = card.text;
  mp.flipped.push(btn);
  sendPresentationState();
  if (mp.flipped.length < 2) return;
  const [a, b] = mp.flipped;
  if (a.dataset.pair === b.dataset.pair) {
    a.classList.add('matched'); b.classList.add('matched');
    mp.flipped = [];
    mp.matched += 1;
    matchingFeedback('good', '✓ Tìm thấy một cặp!');
    updateMatchingHeader();
    if (mp.matched >= state.currentGame.matchingGame.pairs.length) setTimeout(renderMatchingResults, 500);
  } else {
    mp.wrong += 1;
    mp.lock = true;
    matchingFeedback('bad', '✕ Không phải một cặp — lật lại.');
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
  root.innerHTML = `<div class="game-stage">${matchingHeader()}<div class="stage-center"><div class="stage-col">${matchingIllustrationHtml(state.currentGame)}</div><div class="stage-col is-main"><div class="stage-kicker">PHÂN LOẠI KIẾN THỨC</div><p class="field-hint">Chọn một thẻ nội dung, rồi chọn đúng nhóm.</p><div class="category-cards">${state.memoryCards.map((p, i) => `<button type="button" class="match-card" data-category-card="${i}" data-pair="${escapeHtml(p.id)}">${escapeHtml(p.right)}</button>`).join('')}</div><div class="category-groups">${groups.map(g => `<div class="group-box" data-group="${escapeHtml(g)}"><strong>${escapeHtml(g)}</strong><div class="group-slots"></div></div>`).join('')}</div><div id="matchFeedback"></div></div></div>${matchingFooter(m)}</div>`;
  paintProgress(root);
  $$('[data-category-card]', root).forEach(btn => btn.addEventListener('click', () => {
    if (btn.classList.contains('matched') || state.matchingPlay.lock) return;
    $$('[data-category-card]').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    state.matchingPlay.selectedCard = btn;
    sendPresentationState();
  }));
  $$('.group-box', root).forEach(box => box.addEventListener('click', () => {
    const mp = state.matchingPlay;
    if (!mp.selectedCard || mp.lock) return;
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
      updateMatchingHeader();
      if (mp.matched >= state.currentGame.matchingGame.pairs.length) setTimeout(renderMatchingResults, 500);
    } else {
      mp.wrong += 1;
      mp.selectedCard.classList.remove('selected');
      mp.selectedCard = null;
      matchingFeedback('bad', `✕ “${pair.right}” không thuộc nhóm “${box.dataset.group}”.`);
      updateMatchingHeader();
    }
  }));
  sendPresentationState();
}
async function renderMatchingResults() {
  const game = state.currentGame, m = game.matchingGame, mp = state.matchingPlay;
  const elapsed = (Date.now() - state.gameStart) / 1000;
  const summary = calculateMatchingSummary(m.pairs.length, mp.matched, mp.wrong, elapsed, m);
  state.lastSummary = summary;
  const { points, max, percent } = summary;
  $('#playBody').innerHTML = `<div class="game-stage"><div class="result-screen"><div class="result-medal">${percent >= 80 ? '🏆' : percent >= 50 ? '🎖️' : '🌱'}</div><div class="stage-kicker">GHÉP CẶP HOÀN THÀNH</div><h2>${percent >= 80 ? 'Xuất sắc!' : percent >= 50 ? 'Ghép tốt lắm!' : 'Tiếp tục cố gắng!'}</h2><p>${escapeHtml(game.title)}</p><div class="result-score">${points.toLocaleString('vi-VN')} / ${max.toLocaleString('vi-VN')} điểm</div><p>Hoàn thành ${m.pairs.length} cặp · sai ${mp.wrong} lần · ${Math.round(elapsed)} giây · ${percent}% điểm tối đa</p><p id="resultSaveStatus" class="result-save-status">Đang tự lưu kết quả…</p><div class="result-actions"><button class="btn btn-secondary" id="closeResultBtn">Đóng</button><button class="btn btn-secondary" id="replayBtn">↻ Chơi lại</button><button class="btn btn-primary" id="saveResultBtn">Đang lưu…</button></div></div></div>`;
  $('#closeResultBtn').onclick = () => closePlaySurface();
  $('#replayBtn').onclick = () => { state.playStartedAt=Date.now();state.resultSession=null;resetMatchingPlay(); };
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
  root.innerHTML = `<div class="modal-backdrop"><div class="modal w-[min(980px,96vw)] bg-[#11152b] border border-[#303651]" data-player-theme="${playerTheme()}"><div class="modal-head bg-[#11152b] border-[#303651] text-white"><div><h2>${escapeHtml(game.title)}</h2><div class="small text-[#aeb5ce] mt-1">HÀNH TRÌNH KHÁM PHÁ · NGOẠI TUYẾN</div></div><button class="modal-close bg-[#292f49] text-white" data-play-fullscreen>⛶</button><button class="modal-close bg-[#292f49] text-white" data-play-present>Trình chiếu</button><button class="modal-close bg-[#292f49] text-white" data-play-close>✕</button></div><div class="modal-body p-[18px]" id="playBody"></div></div></div>`;
  $('[data-play-close]', root).addEventListener('click', () => root.innerHTML = '');
  bindPlayHeader(root);
  const hunt = game.treasureHunt;
  state.treasurePlay = { stageId: hunt.stages[0].id, earned: 0, results: [], itemsFound: {}, attemptsLeft: 0, steps: 0, answered: false, done: false, lastSelectedOptionId: null };
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
  if (!text) return '';
  const words = text.split(/\s+/);
  if (words.length > 1) {
    const shuffled = treasureOrder(words.map((word, index) => ({ id: String(index), word })), text).map(entry => entry.word);
    if (shuffled.join(' ') === words.join(' ')) shuffled.push(shuffled.shift());
    return shuffled.join(' ');
  }
  const chars = Array.from(text);
  if (chars.length < 2) return text;
  const shuffled = treasureOrder(chars.map((char, index) => ({ id: String(index), char })), text).map(entry => entry.char);
  if (shuffled.join('') === text) shuffled.push(shuffled.shift());
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
  if (tp.results.some(result => result.stageId === stageId && result.correct)) return 'done';
  if (tp.results.some(result => result.stageId === stageId)) return 'failed';
  if (stageId === tp.stageId) return 'current';
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
  if (!button) return;
  button.onclick = () => {
    const enabled = GameAudio.toggle();
    button.setAttribute('aria-pressed', String(enabled));
    button.setAttribute('aria-label', enabled ? 'Tắt âm thanh' : 'Bật âm thanh');
    button.setAttribute('title', enabled ? 'Tắt âm thanh' : 'Bật âm thanh');
    button.innerHTML = `${enabled ? '🔊' : '🔇'}<span>${enabled ? 'Âm thanh' : 'Đã tắt'}</span>`;
    if (enabled) GameAudio.play('toggle');
  };
}
function treasureRecordStage(stage, correct) {
  const tp = state.treasurePlay;
  if (tp.answered) return 0;
  tp.answered = true;
  const gained = correct ? (Number(stage.points) || 0) + (Number(stage.completionBonus) || 0) : 0;
  tp.earned += gained;
  tp.results.push({ stageId: stage.id, correct, points: gained });
  return gained;
}
function markTreasureMapNode(stage, correct) {
  const node = $$('.treasure-map-node', $('#playBody')).find(entry => entry.dataset.stageId === stage.id);
  if (!node) return;
  node.classList.remove('is-current', 'is-done', 'is-failed');
  node.classList.add(correct ? 'is-done' : 'is-failed');
  node.dataset.state = correct ? 'done' : 'failed';
  const dot = node.querySelector('.treasure-map-dot');
  if (dot) dot.textContent = correct ? '✓' : '✕';
}
function treasureUseAttempt(stage) {
  const tp = state.treasurePlay;
  if (tp.attemptsLeft > 0) tp.attemptsLeft -= 1;
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
  const choices = (stage.question?.options || []).map((option, index) =>
    `<button class="answer-option" data-answer="${escapeHtml(option.id)}"><span class="letter">${String.fromCharCode(65 + index)}</span><span>${escapeHtml(option.text)}</span></button>`
  ).join('');
  return `<div class="answer-grid treasure-mission-choices" data-mission="${missionType}">${choices}</div>`;
}
function bindTreasureMatching(stage) {
  const tp = state.treasurePlay;
  const root = $('#playBody');
  const status = $('#missionStatus', root);
  const leftButtons = $$('[data-match-left]', root);
  const rightButtons = $$('[data-match-right]', root);
  let selected = null;
  leftButtons.forEach(button => {
    button.onclick = () => {
      if (tp.answered || button.classList.contains('matched')) return;
      leftButtons.forEach(entry => entry.classList.remove('selected'));
      button.classList.add('selected');
      selected = button.dataset.matchLeft;
      if (status) status.textContent = `Đã chọn “${button.textContent}”. Chọn vế khớp bên phải.`;
    };
  });
  rightButtons.forEach(button => {
    button.onclick = () => {
      if (tp.answered || button.classList.contains('matched')) return;
      if (!selected) { toast('Chọn một thẻ bên trái trước.'); return; }
      const leftButton = leftButtons.find(entry => entry.dataset.matchLeft === selected);
      if (!leftButton) return;
      if (selected === button.dataset.matchRight) {
        leftButton.classList.remove('selected');
        leftButton.classList.add('matched');
        button.classList.add('matched');
        leftButton.disabled = true;
        button.disabled = true;
        selected = null;
        const matched = leftButtons.filter(entry => entry.classList.contains('matched')).length;
        GameAudio.play('match');
        if (status) status.textContent = `✓ Đã ghép ${matched}/${stage.mission.pairs.length} cặp.`;
        sendPresentationState();
        if (matched >= stage.mission.pairs.length) {
          const gained = (Number(stage.points) || 0) + (Number(stage.completionBonus) || 0);
          GameAudio.play('correct');
          treasureCompleteMission(stage, true, `<strong>✓ Đã ghép đủ ${stage.mission.pairs.length} cặp!</strong> +${gained} điểm.<br>${escapeHtml(stage.question.explanation || '')}`);
        }
      } else {
        leftButton.classList.add('wrong');
        button.classList.add('wrong');
        GameAudio.play('wrong');
        setTimeout(() => { leftButton.classList.remove('wrong'); button.classList.remove('wrong'); }, 500);
        const out = treasureUseAttempt(stage);
        const fb = $('#answerFeedback', root);
        if (out) {
          leftButtons.forEach(entry => { entry.classList.add('matched', 'revealed'); entry.disabled = true; });
          rightButtons.forEach(entry => { entry.classList.add('matched', 'revealed'); entry.disabled = true; });
          if (status) status.textContent = 'Đáp án đúng đã được mở.';
          treasureCompleteMission(stage, false, `<strong>✕ Hết lượt thử.</strong> ${stage.question.hint ? `💡 Gợi ý: ${escapeHtml(stage.question.hint)}<br>` : ''}Đáp án đúng đã được mở.<br>${escapeHtml(stage.question.explanation || '')}`);
        } else if (fb) {
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
      if (tp.answered || button.classList.contains('placed')) return;
      itemButtons.forEach(entry => entry.classList.remove('selected'));
      button.classList.add('selected');
      selected = button;
      if (status) status.textContent = `Đã chọn “${button.textContent}”. Chọn nhóm phù hợp.`;
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
      if (tp.answered || event.target.closest('[data-class-item]')) return;
      if (!selected) { toast('Chọn một mục cần phân loại trước.'); return; }
      const model = stage.mission.items.find(item => item.id === selected.dataset.classItem);
      if (model && model.groupId === group.dataset.classGroup) {
        selected.classList.remove('selected');
        selected.classList.add('placed');
        selected.disabled = true;
        group.querySelector('[data-class-slots]').appendChild(selected);
        selected = null;
        const placed = itemButtons.filter(entry => entry.classList.contains('placed')).length;
        GameAudio.play('match');
        if (status) status.textContent = `✓ Đã xếp ${placed}/${itemButtons.length} mục.`;
        sendPresentationState();
        if (placed >= itemButtons.length) {
          const gained = (Number(stage.points) || 0) + (Number(stage.completionBonus) || 0);
          GameAudio.play('correct');
          treasureCompleteMission(stage, true, `<strong>✓ Đã xếp đúng tất cả ${itemButtons.length} mục!</strong> +${gained} điểm.<br>${escapeHtml(stage.question.explanation || '')}`);
        }
      } else {
        group.classList.add('wrong');
        GameAudio.play('wrong');
        setTimeout(() => group.classList.remove('wrong'), 500);
        const out = treasureUseAttempt(stage);
        const fb = $('#answerFeedback', root);
        if (out) {
          itemButtons.forEach(entry => {
            if (entry.classList.contains('placed')) return;
            const item = stage.mission.items.find(entryItem => entryItem.id === entry.dataset.classItem);
            const target = groupButtons.find(entryGroup => entryGroup.dataset.classGroup === item?.groupId);
            if (target) target.querySelector('[data-class-slots]').appendChild(entry);
            entry.classList.add('placed', 'revealed');
            entry.disabled = true;
          });
          if (status) status.textContent = 'Đáp án đúng đã được mở.';
          treasureCompleteMission(stage, false, `<strong>✕ Hết lượt thử.</strong> ${stage.question.hint ? `💡 Gợi ý: ${escapeHtml(stage.question.hint)}<br>` : ''}Đáp án đúng đã được mở.<br>${escapeHtml(stage.question.explanation || '')}`);
        } else if (fb) {
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
  if (!input || !submit) return;
  const tryDecode = () => {
    if (tp.answered) return;
    const value = input.value.trim();
    if (!value) { toast('Hãy nhập đáp án đã giải mã.'); input.focus(); return; }
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
      if (status) status.textContent = 'Đáp án đúng đã được mở.';
      treasureCompleteMission(stage, false, `<strong>✕ Hết lượt thử.</strong> ${stage.question.hint ? `💡 Gợi ý: ${escapeHtml(stage.question.hint)}<br>` : ''}Đáp án đúng: <strong>${escapeHtml(stage.mission.answer)}</strong>.<br>${escapeHtml(stage.question.explanation || '')}`);
      return;
    }
    if (fb) {
      fb.className = 'feedback bad';
      fb.innerHTML = `<strong>✕ Chưa đúng.</strong> ${stage.attempts > 0 ? `Còn ${tp.attemptsLeft} lượt thử — hãy thử lại.` : 'Hãy thử lại.'}`;
    }
    if (status) status.textContent = 'Mật mã chưa đúng. Đọc lại gợi ý của chặng.';
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
function renderTreasureStage() {
  const hunt = state.currentGame.treasureHunt, tp = state.treasurePlay;
  const root = $('#playBody');
  if (tp.done || tp.steps >= 100 || !tp.stageId) return renderTreasureResults();
  const stage = treasureStageById(tp.stageId);
  if (!stage) return renderTreasureResults();
  tp.steps += 1;
  tp.attemptsLeft = stage.attempts || 0;
  tp.answered = false;
  const stageIndex = hunt.stages.findIndex(entry => entry.id === stage.id);
  const stageNo = stageIndex >= 0 ? stageIndex + 1 : tp.results.length + 1;
  const missionType = treasureMissionTypeOf(stage);
  const mission = treasureMissionMeta[missionType];
  const itemCount = Object.keys(tp.itemsFound).length;
  const characterId = treasureCharacterId(hunt.characterId);
  root.innerHTML = `<div class="game-stage" data-treasure-world="${treasureBackgroundId(hunt.backgroundId)}">
    <div class="stage-top"><span>HÀNH TRÌNH · ${escapeHtml(hunt.character || 'Nhà thám hiểm')}</span><span>${mission.icon} ${escapeHtml(mission.label.toUpperCase())} · CHẶNG ${stageNo}/${hunt.stages.length} · 🏆 ${tp.earned} điểm${itemCount ? ` · 🎁 ${itemCount} vật phẩm` : ''}</span></div>
    <div class="stage-progress"><div data-progress="${Math.round((stageNo - 1) / hunt.stages.length * 100)}"></div></div>
    ${treasureMapHtml(hunt, tp)}
    <div class="stage-center">
      <div class="stage-col">${stageIllustrationHtml(stage.question, state.currentGame, 'is-stage is-treasure')}</div>
      <div class="stage-col is-main">
      <div class="stage-kicker">${escapeHtml(stage.name || 'CHẶNG')}</div>
      ${tp.results.length === 0 && hunt.intro ? `<div class="treasure-storyline">${treasureAvatarHtml(characterId, 'is-small')}<p class="scenario-context">${escapeHtml(hunt.intro)}</p></div>` : ''}
      ${stage.story ? `<div class="treasure-storyline">${treasureAvatarHtml(characterId, 'is-small')}<p class="scenario-context">${escapeHtml(stage.story)}</p></div>` : ''}
      ${stage.taskDescription ? `<p class="small text-[#aeb5ce]">${escapeHtml(stage.taskDescription)}</p>` : ''}
      <div class="stage-question">${escapeHtml(stage.question.prompt).replace(/\n/g, '<br>')}</div>
      <div class="treasure-mission-badge">${mission.icon} ${escapeHtml(mission.label)} · ${escapeHtml(mission.short)}</div>
      <div id="treasureMission">${renderTreasureMissionBody(stage, missionType)}</div>
      <div id="treasureExtra">${stage.hasHiddenItem && !tp.itemsFound[stage.id] ? `<button type="button" class="btn btn-secondary btn-small mt-[10px]" id="findItemBtn">🎁 Tìm vật phẩm ẩn (+${hunt.hiddenItemBonus || 50})</button> ` : ''}${stage.question.hint ? `<button type="button" class="btn btn-secondary btn-small mt-[10px]" id="treasureHintBtn">💡 Dùng gợi ý</button>` : ''}</div>
      <div id="answerFeedback"></div>
      <div id="treasureActions"></div>
      </div>
    </div>
    <div class="stage-bottom"><span id="treasureAttemptsHint">${stage.attempts > 0 ? (tp.attemptsLeft > 0 ? `Còn ${tp.attemptsLeft} lượt thử` : 'Hết lượt thử') : 'Không giới hạn lượt thử'} · sai không bị trừ điểm</span></div>
  </div>`;
  paintProgress(root);
  bindTreasureSoundToggle(root);
  if (missionType === 'matching') bindTreasureMatching(stage);
  else if (missionType === 'classification') bindTreasureClassification(stage);
  else if (missionType === 'decode') bindTreasureDecode(stage);
  else $$('.answer-option', root).forEach(btn => btn.addEventListener('click', () => chooseTreasureAnswer(btn.dataset.answer)));
  const itemBtn = $('#findItemBtn', root);
  if (itemBtn) itemBtn.onclick = () => {
    tp.itemsFound[stage.id] = true;
    tp.earned += hunt.hiddenItemBonus || 50;
    itemBtn.remove();
    GameAudio.play('item');
    toast(`Tìm thấy vật phẩm ẩn! +${hunt.hiddenItemBonus || 50} điểm.`);
    sendPresentationState();
  };
  const hintBtn = $('#treasureHintBtn', root);
  if (hintBtn) hintBtn.onclick = () => {
    const fb = $('#answerFeedback', root);
    fb.className = 'feedback good';
    fb.innerHTML = `<strong>💡 Gợi ý:</strong> ${escapeHtml(stage.question.hint)}`;
    GameAudio.play('hint');
  };
  sendPresentationState();
}
function showTreasureChoices(stage, answeredCorrectly) {
  const tp = state.treasurePlay;
  const hasNext = stage.nextStageId && treasureStageById(stage.nextStageId);
  const canBranch = stage.branchStageId && stage.branchLabel && treasureStageById(stage.branchStageId) && stage.branchStageId !== stage.id;
  const choices = [];
  if (canBranch && hasNext) choices.push([stage.branchLabel, 'go-branch'], ['Đi tiếp →', 'go-next']);
  else if (canBranch) choices.push([stage.branchLabel + ' →', 'go-branch']);
  else if (hasNext) choices.push(['Tiếp tục →', 'go-next']);
  else choices.push(['🏠 Nhận kho báu →', 'go-end']);
  const actions = $('#treasureActions');
  if (!actions) return;
  actions.innerHTML = choices.map(([label, act], i) => `<button type="button" class="btn ${i === 0 ? 'btn-primary' : 'btn-secondary'} treasure-choice" data-choice="${act}">${escapeHtml(label)}</button>`).join(' ');
  actions.querySelectorAll('.treasure-choice').forEach(btn => {
    btn.onclick = () => {
      const choice = btn.dataset.choice;
      if (choice === 'go-branch') { GameAudio.play('stage'); tp.stageId = stage.branchStageId; renderTreasureStage(); }
      else if (choice === 'go-next') { GameAudio.play('stage'); tp.stageId = stage.nextStageId; renderTreasureStage(); }
      else { tp.done = true; renderTreasureResults(); }
    };
  });
  sendPresentationState();
}
function chooseTreasureAnswer(optionId) {
  const tp = state.treasurePlay;
  if (tp.answered) return;
  tp.lastSelectedOptionId = optionId;
  const stage = treasureStageById(tp.stageId);
  if (!stage) return;
  const root = $('#playBody');
  const correct = optionId === stage.question.correctOptionId;
  const fb = $('#answerFeedback', root);
  GameAudio.play(correct ? 'correct' : 'wrong');
  if (correct) {
    const gained = treasureRecordStage(stage, true);
    $$('.answer-option', root).forEach(btn => { btn.disabled = true; if (btn.dataset.answer === stage.question.correctOptionId) btn.classList.add('correct'); });
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
      if (btn.dataset.answer === stage.question.correctOptionId) btn.classList.add('correct');
      else if (btn.dataset.answer === optionId) btn.classList.add('wrong');
    });
    if (fb) {
      fb.className = 'feedback bad';
      fb.innerHTML = `<strong>✕ Hết lượt thử.</strong> ${stage.question.hint ? `💡 Gợi ý: ${escapeHtml(stage.question.hint)}<br>` : ''}Đáp án đúng đã được đánh dấu.<br>${escapeHtml(stage.question.explanation || '')}`;
    }
    markTreasureMapNode(stage, false);
    showTreasureChoices(stage, false);
  } else {
    $$('.answer-option', root).forEach(btn => { if (btn.dataset.answer === optionId) btn.classList.add('wrong'); });
    if (fb) {
      fb.className = 'feedback bad';
      fb.innerHTML = `<strong>✕ Chưa đúng.</strong> ${stage.attempts > 0 ? `Còn ${tp.attemptsLeft} lượt thử — hãy suy nghĩ kỹ.` : 'Thử lại với đáp án khác.'}`;
    }
  }
  sendPresentationState();
}
function renderTreasureResults() {
  const hunt = state.currentGame.treasureHunt, tp = state.treasurePlay;
  if (tp.done && tp.resultShown) return;
  const completed = tp.done;
  if (completed) {
    tp.earned += hunt.journeyBonus || 300;
    tp.done = true;
  }
  tp.resultShown = true;
  if (completed) GameAudio.play('reward');
  const itemSlots = hunt.stages.filter(stage => stage.hasHiddenItem).length;
  const max = hunt.stages.reduce((sum, stage) => sum + (Number(stage.points) || 100) + (Number(stage.completionBonus) || 200), 0)
    + (hunt.journeyBonus || 300)
    + itemSlots * (hunt.hiddenItemBonus || 50);
  const percent = max ? Math.round(tp.earned / max * 100) : 0;
  const correctCount = tp.results.filter(r => r.correct).length;
  state.lastSummary = { points: tp.earned, max, percent, correct: correctCount, total: hunt.stages.length };
  const game = state.currentGame;
  $('#playBody').innerHTML = `<div class="game-stage"><div class="result-screen"><div class="result-medal">${percent >= 80 ? '🏆' : percent >= 50 ? '🎖️' : '🌱'}</div><div class="stage-kicker">${completed ? 'HÀNH TRÌNH HOÀN THÀNH' : 'DỪNG HÀNH TRÌNH'}</div><h2>${completed ? 'Bạn đã tìm ra kho báu!' : 'Tiếp tục cố gắng!'}</h2><p>${escapeHtml(game.title)}</p><div class="result-score">${tp.earned.toLocaleString('vi-VN')} / ${max.toLocaleString('vi-VN')} điểm</div><p>Hoàn thành ${correctCount}/${hunt.stages.length} chặng${completed ? ` · Thưởng hành trình +${hunt.journeyBonus || 300}` : ''} · ${percent}% điểm tối đa</p><p id="resultSaveStatus" class="result-save-status">Đang tự lưu kết quả…</p><div class="result-actions"><button class="btn btn-secondary" id="closeResultBtn">Đóng</button><button class="btn btn-secondary" id="replayBtn">↻ Chơi lại</button><button class="btn btn-primary" id="saveResultBtn">Đang lưu…</button></div></div></div>`;
  $('#closeResultBtn').onclick = () => closePlaySurface();
  $('#replayBtn').onclick = () => { state.playStartedAt=Date.now();state.resultSession=null;openTreasurePlay(); };
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
  root.innerHTML = `<div class="modal-backdrop"><div class="modal w-[min(1040px,96vw)] bg-[#11152b] border border-[#303651]" data-player-theme="${playerTheme()}"><div class="modal-head bg-[#11152b] border-[#303651] text-white"><div><h2>${escapeHtml(game.title)}</h2><div class="small text-[#aeb5ce] mt-1">ĐƯỜNG ĐUA TRI THỨC · GIẢNG VIÊN ĐIỀU KHIỂN MÀN CHUNG</div></div><button class="modal-close bg-[#292f49] text-white" data-play-fullscreen>⛶</button><button class="modal-close bg-[#292f49] text-white" data-play-present>Trình chiếu</button><button class="modal-close bg-[#292f49] text-white" data-play-close>✕</button></div><div class="modal-body p-[18px]" id="playBody"></div></div></div>`;
  $('[data-play-close]', root).addEventListener('click', () => root.innerHTML = '');
  bindPlayHeader(root);
  const race = game.race;
  state.racePlay = {
    teams: race.teams.map(t => ({ ...t, progress: 1, points: 0 })),
    turn: 0, round: 1, currentQ: null, usedQ: [], over: false, winnerId: null, lastEvent: ''
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
  if (rp.over) return renderRaceResults();
  const root = $('#playBody');
  const cellMap = raceCellMap();
  const team = rp.teams[rp.turn];
  const track = Array.from({ length: race.trackLength }, (_, i) => i + 1);
  const standings = rp.teams.slice().sort((a, b) => b.progress - a.progress);
  root.innerHTML = `<div class="game-stage">
    <div class="stage-top"><span>VÒNG ${rp.round}/${race.maxRounds} · LƯỢT ${escapeHtml(team.name)}</span><span>${race.stepByDifficulty ? 'TIẾN THEO ĐỘ KHÓ' : 'TIẾN 1 Ô/MỌI CÂU ĐÚNG'}${race.luckEnabled ? ' · CÓ MAY MẮN' : ' · KHÔNG MAY MẮN'}</span></div>
    <div class="race-track">${track.map(n => {
      const cell = cellMap[n];
      const tokens = rp.teams.filter(t => t.progress === n).map(t => t.icon).join(' ');
      return `<div class="race-cell ${cell ? `race-cell-${cell.type}` : ''}" title="${cell ? escapeHtml(cell.label || cell.type) : ''}"><span class="race-cell-num">${n}</span>${cell ? `<span class="race-cell-icon">${RACE_CELL_ICON[cell.type] || ''}</span>` : ''}<span class="race-tokens">${tokens}</span></div>`;
    }).join('')}</div>
    <div class="race-scoreboard">${standings.map(t => `<div class="race-team-row scoreboard ${t.id === team.id ? 'active' : ''}"><span>${t.icon} <strong>${escapeHtml(t.name)}</strong></span><span>Ô ${t.progress}/${race.trackLength}</span><span>🏆 ${t.points} điểm</span></div>`).join('')}</div>
    <div id="raceTurnPanel">${raceTurnPanelHtml()}</div>
    <div id="answerFeedback">${rp.lastEvent ? `<span class="small text-[#aeb5ce]">${escapeHtml(rp.lastEvent)}</span>` : ''}</div>
  </div>`;
  const drawBtn = $('#drawQuestionBtn', root);
  if (drawBtn) drawBtn.onclick = drawRaceQuestion;
  $$('[data-race-answer]', root).forEach(btn => { btn.onclick = () => answerRace(btn.dataset.raceAnswer); });
  const noAnsBtn = $('#raceNoAnswerBtn', root);
  if (noAnsBtn) noAnsBtn.onclick = () => answerRace('__no_answer__');
  sendPresentationState();
}
function raceTurnPanelHtml() {
  const rp = state.racePlay, team = rp.teams[rp.turn];
  if (!rp.currentQ) {
    return `<div class="race-turn"><p class="small text-[#5b6478]">Lượt của <strong>${team.icon} ${escapeHtml(team.name)}</strong>. Giáo viên bốc câu hỏi, đọc cho đội, rồi chọn đáp án mà đội trả lời.</p><button type="button" class="btn btn-primary" id="drawQuestionBtn">🃏 Bốc câu hỏi</button></div>`;
  }
  const q = rp.currentQ;
  const diff = q.difficulty || 'trung bình';
  return `<div class="race-turn"><div class="race-turn-row"><div class="stage-col">${stageIllustrationHtml(q, state.currentGame, 'is-race')}</div><div class="stage-col is-main"><div class="stage-kicker">CÂU HỎI · ĐỘ KHÓ ${escapeHtml(diff.toUpperCase())}${raceStepLabel(diff)}</div><div class="stage-question">${escapeHtml(q.prompt).replace(/\n/g, '<br>')}</div>
    <div class="answer-grid">${q.options.map((o, i) => `<button class="answer-option" data-race-answer="${escapeHtml(o.id)}"><span class="letter">${String.fromCharCode(65 + i)}</span><span>${escapeHtml(o.text)}</span></button>`).join('')}</div>
    <div class="mt-[10px]"><button type="button" class="btn btn-secondary btn-small" id="raceNoAnswerBtn">Đội không trả lời được</button></div></div></div></div>`;
}
function raceStepLabel(diff) {
  const race = state.currentGame.race;
  if (!race.stepByDifficulty) return '';
  return ` · +${RACE_STEP_BY_DIFFICULTY[diff] || 1} Ô`;
}
function drawRaceQuestion() {
  const race = state.currentGame.race, rp = state.racePlay;
  if (rp.usedQ.length >= race.questions.length) rp.usedQ = [];
  const pool = race.questions.filter(q => !rp.usedQ.includes(q.id));
  const q = pool[Math.floor(Math.random() * pool.length)] || race.questions[0];
  rp.currentQ = q;
  renderRaceBoard();
}
function answerRace(optionId) {
  const race = state.currentGame.race, rp = state.racePlay;
  if (!rp.currentQ || rp.over) return;
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
      if (cell.type === 'boost') extra = 1;
      else if (cell.type === 'penalty') extra = -1;
      else if (cell.type === 'lucky' && race.luckEnabled) extra = 1;
      else if (cell.type === 'challenge') extra = 2;
      team.progress += extra;
      event += ` · ${RACE_CELL_ICON[cell.type] || ''} ô ${cell.cell}${extra ? ` ${extra > 0 ? '+' : ''}${extra}` : ''}`;
    }
    team.progress = Math.max(1, Math.min(race.trackLength, team.progress));
    if (team.progress >= race.trackLength) rp.winnerId = team.id;
  } else {
    event = `${team.name} trả lời sai → không tiến ô.`;
  }
  rp.lastEvent = event;
  rp.usedQ.push(q.id);
  rp.currentQ = null;
  if (rp.winnerId) { rp.over = true; return renderRaceBoard(); }
  rp.turn += 1;
  if (rp.turn >= rp.teams.length) {
    rp.turn = 0;
    rp.round += 1;
    if (rp.round > race.maxRounds) { rp.over = true; return renderRaceBoard(); }
  }
  renderRaceBoard();
}
function renderRaceResults() {
  const race = state.currentGame.race, rp = state.racePlay;
  const game = state.currentGame;
  const byProgress = rp.teams.slice().sort((a, b) => b.progress - a.progress || b.points - a.points);
  const winner = rp.winnerId ? rp.teams.find(t => t.id === rp.winnerId) : byProgress[0];
  const tied = byProgress.filter(t => t.progress === byProgress[0].progress).length > 1 && !rp.winnerId;
  const maxPoints = Math.max(100, race.questions.length * 100);
  const percent = Math.round(winner.progress / race.trackLength * 100);
  state.lastSummary = { points: winner.points, max: maxPoints, percent, correct: 0, total: 0, winner: winner.name };
  $('#playBody').innerHTML = `<div class="game-stage"><div class="result-screen"><div class="result-medal">${rp.winnerId ? '🏁' : '🏅'}</div><div class="stage-kicker">KẾT QUẢ ĐƯỜNG ĐUA</div><h2>${tied ? 'Về đích đồng hạng!' : `${winner.icon} ${escapeHtml(winner.name)} chiến thắng!`}</h2><p>${escapeHtml(game.title)}</p>
    <div class="race-scoreboard max-w-[460px] my-[14px] mx-auto">${byProgress.map((t, i) => `<div class="race-team-row scoreboard"><span>${i + 1}. ${t.icon} <strong>${escapeHtml(t.name)}</strong></span><span>Ô ${t.progress}/${race.trackLength}</span><span>🏆 ${t.points} điểm</span></div>`).join('')}</div>
    <p id="resultSaveStatus" class="result-save-status">Đang tự lưu kết quả…</p><div class="result-actions"><button class="btn btn-secondary" id="closeResultBtn">Đóng</button><button class="btn btn-secondary" id="replayBtn">↻ Đua lại</button><button class="btn btn-primary" id="saveResultBtn">Đang lưu…</button></div></div></div>`;
  $('#closeResultBtn').onclick = () => closePlaySurface();
  $('#replayBtn').onclick = () => { state.playStartedAt=Date.now();state.resultSession=null;openRacePlay(); };
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
  if (fsBtn) setPlayFullscreen(document.documentElement.dataset.fullscreen !== '1');
  const closeBtn = e.target && e.target.closest ? e.target.closest('[data-play-close]') : null;
  if (closeBtn) setPlayFullscreen(false);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.documentElement.dataset.fullscreen === '1') setPlayFullscreen(false);
});

/** Keep the flag in sync when the presentation window is closed outside the app. */
function initPresentationTracking() {
  const eduGame = window.eduGame;
  if (!eduGame || typeof eduGame.onPresentationExit !== 'function') return;
  eduGame.onPresentationExit(() => {
    presentationStarted = false;
    presentationStarting = false;
    presentationToken += 1;
  });
}
initPresentationTracking();
