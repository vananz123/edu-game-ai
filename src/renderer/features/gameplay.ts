// @ts-nocheck -- migrated legacy UI logic; new contracts are typed in src/shared/types.ts.
function playGame(game) {
  if (game && game.template === 'matching') {
    const matching = game.matchingGame;
    if (!matching || !Array.isArray(matching.pairs) || matching.pairs.length < 2) {
      return toast('Trò chơi ghép cặp chưa có dữ liệu cặp. Hãy chỉnh sửa và lưu lại.');
    }
    state.currentGame = game;
    state.gameAnswers = [];
    state.matchingPlay = null;
    state.memoryCards = [];
    return openMatchingPlay();
  }
  if (game && game.template === 'treasure-hunt') {
    const hunt = game.treasureHunt;
    if (!hunt || !Array.isArray(hunt.stages) || hunt.stages.length < 1 || !hunt.stages[0]?.question) {
      return toast('Hành trình chưa có chặng. Hãy chỉnh sửa và lưu lại.');
    }
    state.currentGame = game;
    return openTreasurePlay();
  }
  if (game && game.template === 'race') {
    const race = game.race;
    if (!race || !Array.isArray(race.teams) || race.teams.length < 2 || !Array.isArray(race.questions) || !race.questions.length) {
      return toast('Đường đua chưa đủ dữ liệu (đội hoặc câu hỏi). Hãy chỉnh sửa và lưu lại.');
    }
    state.currentGame = game;
    return openRacePlay();
  }
  if (!game || !game.questions?.length) return toast('Trò chơi chưa có câu hỏi.');
  state.currentGame = game; state.gameIndex = 0; state.gameAnswers = []; state.gameStart = Date.now(); state.answerLocked = false; state.scenarioSteps = 0; state.teamPlay = null;
  if (game.gameSetup?.scoringMode === 'thi đấu đội') return openTeamSetup();
  openPlayModal();
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
  root.innerHTML = `<div class="modal-backdrop"><div class="modal w-[min(720px,96vw)] bg-[#11152b] border border-[#303651]" data-player-theme="${playerTheme()}"><div class="modal-head bg-[#11152b] border-[#303651] text-white"><div><h2>${escapeHtml(state.currentGame.title)}</h2><div class="small text-[#aeb5ce] mt-1">THI ĐẤU ĐỘI · CHIA ĐỘ TRƯỚC KHI BẮT ĐẦU</div></div><button class="modal-close bg-[#292f49] text-white" data-play-close>✕</button></div><div class="modal-body p-[18px]" id="playBody"></div></div></div>`;
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
  $('[data-play-close2]', root).addEventListener('click', () => $('#modalRoot').innerHTML = '');
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
function openPlayModal() {
  const root = $('#modalRoot');
  root.innerHTML = `<div class="modal-backdrop"><div class="modal w-[min(980px,96vw)] bg-[#11152b] border border-[#303651]" data-player-theme="${playerTheme()}"><div class="modal-head bg-[#11152b] border-[#303651] text-white"><div><h2>${escapeHtml(state.currentGame.title)}</h2><div class="small text-[#aeb5ce] mt-1">CHẾ ĐỘ TRÌNH CHIẾU · NGOẠI TUYẾN</div></div><button class="modal-close bg-[#292f49] text-white" data-play-close>✕</button></div><div class="modal-body p-[18px]" id="playBody"></div></div></div>`;
  $('[data-play-close]',root).addEventListener('click', () => root.innerHTML = '');
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
  const answerArea = textQ
    ? `<div class="text-answer-box"><input id="textAnswerInput" placeholder="${q.type==='fill-in-blank'?'Nhập từ hoặc cụm từ còn thiếu…':'Nhập câu trả lời của bạn…'}" autocomplete="off"><button class="btn btn-primary" id="textAnswerBtn">Trả lời</button></div>`
    : `<div class="answer-grid">${q.options.map((o,i)=>`<button class="answer-option" data-answer="${escapeHtml(o.id)}"><span class="letter">${String.fromCharCode(65+i)}</span><span>${escapeHtml(o.text)}</span></button>`).join('')}</div>`;
  root.innerHTML = `<div class="game-stage"><div class="stage-top"><span>${escapeHtml(game.subject || 'TRÒ CHƠI HỌC TẬP')} · ${game.grade ? 'LỚP '+escapeHtml(game.grade) : 'MỌI LỚP'}</span><span>${game.template==='scenario'?'QUYẾT ĐỊNH':'CÂU'} ${state.gameAnswers.length+1} / ${game.questions.length} &nbsp; · &nbsp; 🏆 ${state.gameAnswers.reduce((s,a)=>s+a.points,0)} điểm</span></div><div class="stage-progress"><div data-progress="${progress}"></div></div>${state.teamPlay ? teamTurnBarHtml() : ''}<div class="stage-center"><div class="stage-kicker">${kicker}</div>${q.context?`<p class="scenario-context">${escapeHtml(q.context).replace(/\n/g,'<br>')}</p>`:''}<div class="stage-question">${escapeHtml(q.prompt).replace(/\n/g,'<br>')}</div>${answerArea}<div id="answerFeedback"></div><div class="stage-bottom"><span>${scoringTip}</span><button class="btn hidden" id="nextQuestionBtn">Tiếp tục →</button></div></div></div>`;
  paintProgress(root);
  $$('.answer-option',root).forEach(btn => btn.addEventListener('click', () => chooseAnswer(q, btn.dataset.answer)));
  if (textQ) {
    const input = $('#textAnswerInput', root);
    const submit = () => { const value = input.value; if (!value.trim()) return toast('Hãy nhập câu trả lời trước.'); chooseAnswer(q, null, value); };
    $('#textAnswerBtn', root).addEventListener('click', submit);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    input.focus();
  }
  const turnSelect = $('#teamTurnSelect', root);
  if (turnSelect) turnSelect.addEventListener('change', () => { state.teamPlay.turn = Number(turnSelect.value); renderQuestion(); });
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
    ? `<br><strong>Đáp án đúng:</strong> ${escapeHtml(question.correctAnswer || '')}${question.alternateAnswers?.length ? ` (hoặc: ${question.alternateAnswers.map(a => escapeHtml(a)).join(', ')})` : ''}`
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
  $('#playBody').innerHTML = `<div class="game-stage"><div class="result-screen"><div class="result-medal">${percent>=80?'🏆':percent>=50?'🎖️':'🌱'}</div><div class="stage-kicker">THỬ THÁCH HOÀN THÀNH</div><h2>${ranked&&top?`${top.icon} ${escapeHtml(top.name)} dẫn đầu!`:percent>=80?'Xuất sắc!':percent>=50?'Làm tốt lắm!':'Tiếp tục cố gắng!'}</h2><p>${escapeHtml(game.title)}</p><div class="result-score">${points.toLocaleString('vi-VN')} điểm</div><p>${game.template==='scenario'?`Hoàn thành ${state.gameAnswers.length} quyết định · ${percent}% điểm tối đa`:`Trả lời đúng ${correct}/${game.questions.length} câu · ${percent}% điểm tối đa`}</p>${state.teamPlay ? leaderboardHtml() : ''}<div class="result-actions"><button class="btn btn-secondary" id="closeResultBtn">Đóng</button><button class="btn btn-secondary" id="replayBtn">↻ Chơi lại</button><button class="btn btn-primary" id="saveResultBtn">Lưu kết quả</button></div></div></div>`;
  $('#closeResultBtn').onclick = () => $('#modalRoot').innerHTML = '';
  $('#replayBtn').onclick = () => {
    state.gameIndex=0;state.gameAnswers=[];state.gameStart=Date.now();state.scenarioSteps=0;
    if (state.teamPlay) { state.teamPlay.teams.forEach(t => { t.points=0;t.correct=0;t.answered=0; }); state.teamPlay.turn=0; }
    renderQuestion();
  };
  $('#saveResultBtn').onclick = async () => {
    const playerName = prompt('Tên học sinh hoặc đội chơi:', top ? top.name : 'Đội 1');
    if (playerName === null) return;
    await window.eduGame.saveSession({ gameId: game.id, gameTitle: game.title, playerName: playerName.trim() || 'Người chơi', ...state.lastSummary, answers: state.gameAnswers });
    await refreshDb(); toast('Đã lưu kết quả lượt chơi.');
    $('#saveResultBtn').textContent = '✓ Đã lưu'; $('#saveResultBtn').disabled = true;
  };
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
  root.innerHTML = `<div class="modal-backdrop"><div class="modal w-[min(980px,96vw)] bg-[#11152b] border border-[#303651]" data-player-theme="${playerTheme()}"><div class="modal-head bg-[#11152b] border-[#303651] text-white"><div><h2>${escapeHtml(game.title)}</h2><div class="small text-[#aeb5ce] mt-1">${modeLabel} · NGOẠI TUYẾN</div></div><button class="modal-close bg-[#292f49] text-white" data-play-close>✕</button></div><div class="modal-body p-[18px]" id="playBody"></div></div></div>`;
  $('[data-play-close]', root).addEventListener('click', () => root.innerHTML = '');
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
function renderColumnsBoard(root, m) {
  const rights = shuffled(m.pairs);
  root.innerHTML = `<div class="game-stage">${matchingHeader()}<div class="stage-center"><div class="stage-kicker">GHÉP HAI CỘT</div><p class="field-hint">Chọn một mục ở cột A, rồi chọn mục tương ứng ở cột B.</p><div class="matching-board"><div class="matching-col">${m.pairs.map(p => `<button type="button" class="match-card" data-match-side="left" data-pair="${escapeHtml(p.id)}">${escapeHtml(p.left)}</button>`).join('')}</div><div class="matching-col">${rights.map(p => `<button type="button" class="match-card" data-match-side="right" data-pair="${escapeHtml(p.id)}">${escapeHtml(p.right)}</button>`).join('')}</div></div><div id="matchFeedback"></div></div>${matchingFooter(m)}</div>`;
  paintProgress(root);
  $$('.match-card', root).forEach(btn => btn.addEventListener('click', () => onColumnCardClick(btn)));
}
function onColumnCardClick(btn) {
  const mp = state.matchingPlay;
  if (btn.classList.contains('matched') || mp.lock) return;
  const side = btn.dataset.matchSide;
  const selector = `[data-match-side="${side}"]`;
  $$(selector).forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  if (side === 'left') mp.selectedLeft = btn; else mp.selectedRight = btn;
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
    matchingFeedback('good', '✓ Ghép chính xác!');
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
  root.innerHTML = `<div class="game-stage">${matchingHeader()}<div class="stage-center"><div class="stage-kicker">LẬT THẺ GHI NHỚ</div><p class="field-hint">Lật từng thẻ để tìm hai nội dung tương ứng.</p><div class="memory-grid">${state.memoryCards.map((c, i) => `<button type="button" class="memory-card" data-memory="${i}" data-pair="${escapeHtml(c.pair)}"><span class="memory-face">?</span></button>`).join('')}</div><div id="matchFeedback"></div></div>${matchingFooter(m)}</div>`;
  paintProgress(root);
  $$('.memory-card', root).forEach(btn => btn.addEventListener('click', () => onMemoryCardClick(btn)));
}
function onMemoryCardClick(btn) {
  const mp = state.matchingPlay;
  if (mp.lock || btn.classList.contains('matched') || btn.classList.contains('flipped')) return;
  const card = state.memoryCards[Number(btn.dataset.memory)];
  btn.classList.add('flipped');
  btn.querySelector('.memory-face').textContent = card.text;
  mp.flipped.push(btn);
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
  root.innerHTML = `<div class="game-stage">${matchingHeader()}<div class="stage-center"><div class="stage-kicker">PHÂN LOẠI KIẾN THỨC</div><p class="field-hint">Chọn một thẻ nội dung, rồi chọn đúng nhóm.</p><div class="category-cards">${state.memoryCards.map((p, i) => `<button type="button" class="match-card" data-category-card="${i}" data-pair="${escapeHtml(p.id)}">${escapeHtml(p.right)}</button>`).join('')}</div><div class="category-groups">${groups.map(g => `<div class="group-box" data-group="${escapeHtml(g)}"><strong>${escapeHtml(g)}</strong><div class="group-slots"></div></div>`).join('')}</div><div id="matchFeedback"></div></div>${matchingFooter(m)}</div>`;
  paintProgress(root);
  $$('[data-category-card]', root).forEach(btn => btn.addEventListener('click', () => {
    if (btn.classList.contains('matched') || state.matchingPlay.lock) return;
    $$('[data-category-card]').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    state.matchingPlay.selectedCard = btn;
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
}
async function renderMatchingResults() {
  const game = state.currentGame, m = game.matchingGame, mp = state.matchingPlay;
  const elapsed = (Date.now() - state.gameStart) / 1000;
  const summary = calculateMatchingSummary(m.pairs.length, mp.matched, mp.wrong, elapsed, m);
  state.lastSummary = summary;
  const { points, max, percent } = summary;
  $('#playBody').innerHTML = `<div class="game-stage"><div class="result-screen"><div class="result-medal">${percent >= 80 ? '🏆' : percent >= 50 ? '🎖️' : '🌱'}</div><div class="stage-kicker">GHÉP CẶP HOÀN THÀNH</div><h2>${percent >= 80 ? 'Xuất sắc!' : percent >= 50 ? 'Ghép tốt lắm!' : 'Tiếp tục cố gắng!'}</h2><p>${escapeHtml(game.title)}</p><div class="result-score">${points.toLocaleString('vi-VN')} / ${max.toLocaleString('vi-VN')} điểm</div><p>Hoàn thành ${m.pairs.length} cặp · sai ${mp.wrong} lần · ${Math.round(elapsed)} giây · ${percent}% điểm tối đa</p><div class="result-actions"><button class="btn btn-secondary" id="closeResultBtn">Đóng</button><button class="btn btn-secondary" id="replayBtn">↻ Chơi lại</button><button class="btn btn-primary" id="saveResultBtn">Lưu kết quả</button></div></div></div>`;
  $('#closeResultBtn').onclick = () => $('#modalRoot').innerHTML = '';
  $('#replayBtn').onclick = () => resetMatchingPlay();
  $('#saveResultBtn').onclick = async () => {
    const playerName = prompt('Tên học sinh hoặc đội chơi:', 'Đội 1');
    if (playerName === null) return;
    await window.eduGame.saveSession({ gameId: game.id, gameTitle: game.title, playerName: playerName.trim() || 'Người chơi', ...state.lastSummary });
    await refreshDb(); toast('Đã lưu kết quả lượt chơi.');
    $('#saveResultBtn').textContent = '✓ Đã lưu'; $('#saveResultBtn').disabled = true;
  };
}

// ---------- §5 Hành trình giải mã kho báu ----------
function openTreasurePlay() {
  const root = $('#modalRoot');
  const game = state.currentGame;
  root.innerHTML = `<div class="modal-backdrop"><div class="modal w-[min(980px,96vw)] bg-[#11152b] border border-[#303651]" data-player-theme="${playerTheme()}"><div class="modal-head bg-[#11152b] border-[#303651] text-white"><div><h2>${escapeHtml(game.title)}</h2><div class="small text-[#aeb5ce] mt-1">HÀNH TRÌNH KHÁM PHÁ · NGOẠI TUYẾN</div></div><button class="modal-close bg-[#292f49] text-white" data-play-close>✕</button></div><div class="modal-body p-[18px]" id="playBody"></div></div></div>`;
  $('[data-play-close]', root).addEventListener('click', () => root.innerHTML = '');
  const hunt = game.treasureHunt;
  state.treasurePlay = { stageId: hunt.stages[0].id, earned: 0, results: [], itemsFound: {}, attemptsLeft: 0, steps: 0, answered: false, done: false };
  renderTreasureStage();
}
function treasureStageById(id) {
  return state.currentGame.treasureHunt.stages.find(stage => stage.id === id);
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
  const stageNo = tp.results.length + 1;
  const itemCount = Object.keys(tp.itemsFound).length;
  root.innerHTML = `<div class="game-stage">
    <div class="stage-top"><span>HÀNH TRÌNH · ${escapeHtml(hunt.character || 'Nhà thám hiểm')}</span><span>CHẶNG ${stageNo}/${hunt.stages.length} · 🏆 ${tp.earned} điểm${itemCount ? ` · 🎁 ${itemCount} vật phẩm` : ''}</span></div>
    <div class="stage-progress"><div data-progress="${Math.round((stageNo - 1) / hunt.stages.length * 100)}"></div></div>
    <div class="stage-center">
      <div class="stage-kicker">${escapeHtml(stage.name || 'CHẶNG')}</div>
      ${tp.results.length === 0 && hunt.intro ? `<p class="scenario-context">${escapeHtml(hunt.intro)}</p>` : ''}
      ${stage.story ? `<p class="scenario-context">${escapeHtml(stage.story)}</p>` : ''}
      ${stage.taskDescription ? `<p class="small text-[#aeb5ce]">${escapeHtml(stage.taskDescription)}</p>` : ''}
      <div class="stage-question">${escapeHtml(stage.question.prompt).replace(/\n/g, '<br>')}</div>
      <div class="answer-grid">${stage.question.options.map((o, i) => `<button class="answer-option" data-answer="${escapeHtml(o.id)}"><span class="letter">${String.fromCharCode(65 + i)}</span><span>${escapeHtml(o.text)}</span></button>`).join('')}</div>
      <div id="treasureExtra">${stage.hasHiddenItem && !tp.itemsFound[stage.id] ? `<button type="button" class="btn btn-secondary btn-small mt-[10px]" id="findItemBtn">🎁 Tìm vật phẩm ẩn (+${hunt.hiddenItemBonus || 50})</button> ` : ''}${stage.question.hint ? `<button type="button" class="btn btn-secondary btn-small mt-[10px]" id="treasureHintBtn">💡 Dùng gợi ý</button>` : ''}</div>
      <div id="answerFeedback"></div>
      <div id="treasureActions"></div>
    </div>
    <div class="stage-bottom"><span id="treasureAttemptsHint">${stage.attempts > 0 ? (tp.attemptsLeft > 0 ? `Còn ${tp.attemptsLeft} lượt thử` : 'Hết lượt thử') : 'Không giới hạn lượt thử'} · sai không bị trừ điểm</span></div>
  </div>`;
  paintProgress(root);
  $$('.answer-option', root).forEach(btn => btn.addEventListener('click', () => chooseTreasureAnswer(btn.dataset.answer)));
  const itemBtn = $('#findItemBtn', root);
  if (itemBtn) itemBtn.onclick = () => {
    tp.itemsFound[stage.id] = true;
    tp.earned += hunt.hiddenItemBonus || 50;
    itemBtn.remove();
    toast(`Tìm thấy vật phẩm ẩn! +${hunt.hiddenItemBonus || 50} điểm.`);
  };
  const hintBtn = $('#treasureHintBtn', root);
  if (hintBtn) hintBtn.onclick = () => {
    const fb = $('#answerFeedback', root);
    fb.className = 'feedback good';
    fb.innerHTML = `<strong>💡 Gợi ý:</strong> ${escapeHtml(stage.question.hint)}`;
  };
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
      if (choice === 'go-branch') { tp.stageId = stage.branchStageId; renderTreasureStage(); }
      else if (choice === 'go-next') { tp.stageId = stage.nextStageId; renderTreasureStage(); }
      else { tp.done = true; renderTreasureResults(); }
    };
  });
}
function chooseTreasureAnswer(optionId) {
  const tp = state.treasurePlay;
  if (tp.answered) return;
  const stage = treasureStageById(tp.stageId);
  const root = $('#playBody');
  const correct = optionId === stage.question.correctOptionId;
  const fb = $('#answerFeedback', root);
  if (correct) {
    tp.answered = true;
    const gained = stage.points + stage.completionBonus;
    tp.earned += gained;
    tp.results.push({ stageId: stage.id, correct: true, points: gained });
    $$('.answer-option', root).forEach(btn => { btn.disabled = true; if (btn.dataset.answer === stage.question.correctOptionId) btn.classList.add('correct'); });
    fb.className = 'feedback good';
    fb.innerHTML = `<strong>✓ Tìm được chìa khóa!</strong> +${stage.points} điểm câu đố · +${stage.completionBonus} điểm hoàn thành chặng.<br>${escapeHtml(stage.question.explanation || '')}`;
    showTreasureChoices(stage, true);
    return;
  }
  if (tp.attemptsLeft > 0) tp.attemptsLeft -= 1;
  const out = stage.attempts > 0 && tp.attemptsLeft === 0;
  const hint = $('#treasureAttemptsHint', root);
  if (hint && stage.attempts > 0) hint.textContent = out ? 'Hết lượt thử — xem gợi ý và đáp án' : `Còn ${tp.attemptsLeft} lượt thử · sai không bị trừ điểm`;
  if (out) {
    tp.answered = true;
    tp.results.push({ stageId: stage.id, correct: false, points: 0 });
    $$('.answer-option', root).forEach(btn => {
      btn.disabled = true;
      if (btn.dataset.answer === stage.question.correctOptionId) btn.classList.add('correct');
      else if (btn.dataset.answer === optionId) btn.classList.add('wrong');
    });
    fb.className = 'feedback bad';
    fb.innerHTML = `<strong>✕ Hết lượt thử.</strong> ${stage.question.hint ? `💡 Gợi ý: ${escapeHtml(stage.question.hint)}<br>` : ''}Đáp án đúng đã được đánh dấu.<br>${escapeHtml(stage.question.explanation || '')}`;
    showTreasureChoices(stage, false);
  } else {
    $$('.answer-option', root).forEach(btn => { if (btn.dataset.answer === optionId) btn.classList.add('wrong'); });
    fb.className = 'feedback bad';
    fb.innerHTML = `<strong>✕ Chưa đúng.</strong> ${stage.attempts > 0 ? `Còn ${tp.attemptsLeft} lượt thử — hãy suy nghĩ kỹ.` : 'Thử lại với đáp án khác.'}`;
  }
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
  const itemSlots = hunt.stages.filter(stage => stage.hasHiddenItem).length;
  const max = hunt.stages.reduce((sum, stage) => sum + (Number(stage.points) || 100) + (Number(stage.completionBonus) || 200), 0)
    + (hunt.journeyBonus || 300)
    + itemSlots * (hunt.hiddenItemBonus || 50);
  const percent = max ? Math.round(tp.earned / max * 100) : 0;
  const correctCount = tp.results.filter(r => r.correct).length;
  state.lastSummary = { points: tp.earned, max, percent, correct: correctCount, total: hunt.stages.length };
  const game = state.currentGame;
  $('#playBody').innerHTML = `<div class="game-stage"><div class="result-screen"><div class="result-medal">${percent >= 80 ? '🏆' : percent >= 50 ? '🎖️' : '🌱'}</div><div class="stage-kicker">${completed ? 'HÀNH TRÌNH HOÀN THÀNH' : 'DỪNG HÀNH TRÌNH'}</div><h2>${completed ? 'Bạn đã tìm ra kho báu!' : 'Tiếp tục cố gắng!'}</h2><p>${escapeHtml(game.title)}</p><div class="result-score">${tp.earned.toLocaleString('vi-VN')} / ${max.toLocaleString('vi-VN')} điểm</div><p>Hoàn thành ${correctCount}/${hunt.stages.length} chặng${completed ? ` · Thưởng hành trình +${hunt.journeyBonus || 300}` : ''} · ${percent}% điểm tối đa</p><div class="result-actions"><button class="btn btn-secondary" id="closeResultBtn">Đóng</button><button class="btn btn-secondary" id="replayBtn">↻ Chơi lại</button><button class="btn btn-primary" id="saveResultBtn">Lưu kết quả</button></div></div></div>`;
  $('#closeResultBtn').onclick = () => $('#modalRoot').innerHTML = '';
  $('#replayBtn').onclick = () => openTreasurePlay();
  $('#saveResultBtn').onclick = async () => {
    const playerName = prompt('Tên học sinh hoặc đội chơi:', 'Nhà thám hiểm 1');
    if (playerName === null) return;
    await window.eduGame.saveSession({ gameId: game.id, gameTitle: game.title, playerName: playerName.trim() || 'Người chơi', ...state.lastSummary });
    await refreshDb(); toast('Đã lưu kết quả lượt chơi.');
    $('#saveResultBtn').textContent = '✓ Đã lưu'; $('#saveResultBtn').disabled = true;
  };
}

// ---------- §6 Đường đua tri thức ----------
const RACE_STEP_BY_DIFFICULTY = { 'dễ': 1, 'trung bình': 2, 'khó': 3 };
const RACE_CELL_ICON = { boost: '⚡', penalty: '🪨', lucky: '🎁', challenge: '⚔️' };
function openRacePlay() {
  const root = $('#modalRoot');
  const game = state.currentGame;
  root.innerHTML = `<div class="modal-backdrop"><div class="modal w-[min(1040px,96vw)] bg-[#11152b] border border-[#303651]" data-player-theme="${playerTheme()}"><div class="modal-head bg-[#11152b] border-[#303651] text-white"><div><h2>${escapeHtml(game.title)}</h2><div class="small text-[#aeb5ce] mt-1">ĐƯỜNG ĐUA TRI THỨC · GIẢNG VIÊN ĐIỀU KHIỂN MÀN CHUNG</div></div><button class="modal-close bg-[#292f49] text-white" data-play-close>✕</button></div><div class="modal-body p-[18px]" id="playBody"></div></div></div>`;
  $('[data-play-close]', root).addEventListener('click', () => root.innerHTML = '');
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
}
function raceTurnPanelHtml() {
  const rp = state.racePlay, team = rp.teams[rp.turn];
  if (!rp.currentQ) {
    return `<div class="race-turn"><p class="small text-[#aeb5ce]">Lượt của <strong>${team.icon} ${escapeHtml(team.name)}</strong>. Giáo viên bốc câu hỏi, đọc cho đội, rồi chọn đáp án mà đội trả lời.</p><button type="button" class="btn btn-primary" id="drawQuestionBtn">🃏 Bốc câu hỏi</button></div>`;
  }
  const q = rp.currentQ;
  const diff = q.difficulty || 'trung bình';
  return `<div class="race-turn"><div class="stage-kicker">CÂU HỎI · ĐỘ KHÓ ${escapeHtml(diff.toUpperCase())}${raceStepLabel(diff)}</div><div class="stage-question">${escapeHtml(q.prompt).replace(/\n/g, '<br>')}</div>
    <div class="answer-grid">${q.options.map((o, i) => `<button class="answer-option" data-race-answer="${escapeHtml(o.id)}"><span class="letter">${String.fromCharCode(65 + i)}</span><span>${escapeHtml(o.text)}</span></button>`).join('')}</div>
    <div class="mt-[10px]"><button type="button" class="btn btn-secondary btn-small" id="raceNoAnswerBtn">Đội không trả lời được</button></div></div>`;
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
    <div class="result-actions"><button class="btn btn-secondary" id="closeResultBtn">Đóng</button><button class="btn btn-secondary" id="replayBtn">↻ Đua lại</button><button class="btn btn-primary" id="saveResultBtn">Lưu kết quả</button></div></div></div>`;
  $('#closeResultBtn').onclick = () => $('#modalRoot').innerHTML = '';
  $('#replayBtn').onclick = () => openRacePlay();
  $('#saveResultBtn').onclick = async () => {
    const playerName = prompt('Ghi kết quả cho đội:', winner.name);
    if (playerName === null) return;
    await window.eduGame.saveSession({ gameId: game.id, gameTitle: game.title, playerName: playerName.trim() || winner.name, ...state.lastSummary });
    await refreshDb(); toast('Đã lưu kết quả lượt chơi.');
    $('#saveResultBtn').textContent = '✓ Đã lưu'; $('#saveResultBtn').disabled = true;
  };
}
