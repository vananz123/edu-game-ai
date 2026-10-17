// @ts-nocheck -- migrated legacy UI logic; new contracts are typed in src/shared/types.ts.
function renderSessions() {
  const sessions = state.db.sessions;
  return `<div class="page-heading"><div><div class="eyebrow">CLASSROOM REPORTS</div><h1>Lịch sử kết quả</h1><p>Xem lại điểm số của người chơi và đội nhóm trên thiết bị này.</p></div><button class="btn btn-secondary" data-action="export-results">⇩ Xuất CSV</button></div>
    <section class="panel"><div class="section-head"><h3>Các lượt chơi gần đây</h3><span class="tag">${sessions.length} lượt</span></div>${sessions.length ? `<div class="session-row header"><span>TRÒ CHƠI</span><span>NGƯỜI CHƠI / ĐỘI</span><span>THỜI GIAN</span><span>ĐIỂM</span></div>${sessions.map(s=>`<div class="session-row"><strong>${escapeHtml(s.gameTitle||'Trò chơi')}</strong><span>${escapeHtml(s.playerName||'Người chơi')}</span><span>${fmtDateTime(s.createdAt)}</span><span class="score-pill">${Number(s.points||0)} điểm · ${Number(s.percent||0)}%</span></div>`).join('')}`:emptyState('Chưa có kết quả','Kết quả sẽ tự lưu sau khi kết thúc một lượt chơi.','Mở thư viện','library')}</section>`;
}
