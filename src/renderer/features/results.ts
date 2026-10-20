// @ts-nocheck -- migrated legacy UI logic; new contracts are typed in src/shared/types.ts.
function exportResults() {
  const rows = [['Trò chơi','Người chơi','Điểm','Điểm tối đa','Phần trăm','Thời lượng (giây)','Hoàn thành lúc']];
  state.db.sessions.forEach(s => rows.push([s.gameTitle,s.playerName,s.points,s.max,s.percent,s.durationSeconds||'',s.completedAt||s.createdAt]));
  const csv = rows.map(row=>row.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\r\n');
  const blob = new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'}), url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href=url;a.download='edugame-ket-qua.csv';a.click();URL.revokeObjectURL(url);toast('Đã xuất CSV kết quả.');
}

/**
 * One completed playthrough gets one id. Auto-save and a later rename both
 * upsert that id, so rendering the result screen again or clicking save twice
 * cannot create duplicate history rows.
 */
function ensureResultSession(game) {
  const current = state.resultSession;
  if (current && current.gameId === game.id) return current;
  const now = Date.now();
  state.resultSession = {
    id: `session_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    gameId: game.id,
    gameTitle: game.title,
    template: game.template || 'quiz',
    startedAt: Number(state.playStartedAt) || Number(state.gameStart) || now,
    completedAt: now,
    playerName: '',
    saved: null,
    saving: null,
    failed: false
  };
  return state.resultSession;
}

function resultSessionPayload(game, summary, details, playerName) {
  const session = ensureResultSession(game);
  const completedAt = new Date(session.completedAt).toISOString();
  const durationSeconds = Math.max(0, Math.round((session.completedAt - session.startedAt) / 1000));
  return {
    id: session.id,
    gameId: game.id,
    gameTitle: game.title,
    template: game.template || 'quiz',
    playerName: String(playerName || '').trim() || 'Người chơi',
    points: Number(summary && summary.points) || 0,
    max: Number(summary && summary.max) || 0,
    percent: Number(summary && summary.percent) || 0,
    correct: Number(summary && summary.correct) || 0,
    total: Number(summary && summary.total) || 0,
    ...details,
    startedAt: new Date(session.startedAt).toISOString(),
    completedAt,
    durationSeconds
  };
}

async function saveResultSession(game, summary, details, playerName, options) {
  const session = ensureResultSession(game);
  if (session.saved && !(options && options.rename)) return session.saved;
  if (session.saving) return session.saving;
  const payload = resultSessionPayload(game, summary, details, playerName || session.playerName);
  session.playerName = payload.playerName;
  session.saving = window.eduGame.saveSession(payload)
    .then(async stored => {
      session.saved = stored;
      session.failed = false;
      try { await refreshDb(); } catch { /* history refresh is best effort */ }
      return stored;
    })
    .catch(error => {
      session.failed = true;
      toast(`Chưa lưu được kết quả: ${(error && error.message) || 'lỗi không xác định'}`);
      return null;
    })
    .finally(() => { session.saving = null; });
  return session.saving;
}

/**
 * Wires the standard result screen: auto-save with a neutral player label, then
 * allow the teacher/student to rename the same history row. `renderResults`
 * stays synchronous; the save runs in the background and updates the status
 * element only while the result screen is still mounted.
 */
function wireResultSession(game, summary, details, defaultName) {
  const button = document.getElementById('saveResultBtn');
  const status = document.getElementById('resultSaveStatus');
  const session = ensureResultSession(game);
  const setStatus = text => {
    const node = document.getElementById('resultSaveStatus');
    if (node) node.textContent = text;
  };
  if (button) button.disabled = true;
  saveResultSession(game, summary, details, defaultName || 'Người chơi').then(saved => {
    if (saved) {
      setStatus(`✓ Đã tự lưu kết quả lúc ${new Date().toLocaleTimeString('vi-VN')}.`);
      if (button) {
        button.disabled = false;
        button.textContent = '✎ Đổi tên người chơi';
      }
    } else {
      setStatus('Chưa lưu được kết quả. Bấm “Thử lưu lại”.');
      if (button) {
        button.disabled = false;
        button.textContent = 'Thử lưu lại';
      }
    }
  });
  if (!button) return;
  button.onclick = async () => {
    const current = ensureResultSession(game);
    const playerName = prompt('Tên học sinh hoặc đội chơi:', current.playerName || defaultName || 'Người chơi');
    if (playerName === null) return;
    button.disabled = true;
    button.textContent = 'Đang lưu…';
    const saved = await saveResultSession(game, summary, details, playerName, { rename: true });
    if (saved) {
      setStatus(`✓ Đã lưu kết quả cho “${saved.playerName}”.`);
      button.disabled = false;
      button.textContent = '✎ Đổi tên người chơi';
    } else {
      setStatus('Chưa lưu được kết quả. Bấm để thử lại.');
      button.disabled = false;
      button.textContent = 'Thử lưu lại';
    }
  };
  // Keep the status node referenced so older call sites cannot lose the binding.
  if (status) status.dataset.sessionId = session.id;
}
