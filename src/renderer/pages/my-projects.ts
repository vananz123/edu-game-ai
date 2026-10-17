// @ts-nocheck -- migrated legacy UI logic; new contracts are typed in src/shared/types.ts.
function renderMyProjects() {
  const games = state.db.games.filter(g => !state.search || `${g.title} ${g.subject} ${g.topic}`.toLowerCase().includes(state.search.toLowerCase()));
  return `<div class="page-heading"><div><div class="eyebrow">MY PROJECTS</div><h1>Dự án của tôi</h1><p>Lưu dự án, chỉnh sửa và xuất bản trò chơi có thể chạy ngoại tuyến.</p></div><button class="btn btn-primary" data-page="create">✳ Tạo dự án mới</button></div>
    <div class="toolbar"><div class="search-box"><input id="librarySearch" placeholder="Tìm theo tên dự án, môn học..." value="${escapeHtml(state.search || '')}"></div><button class="btn btn-secondary" data-action="export-first">⇩ Xuất gói .egame</button></div>
    <section class="panel">
      ${games.length ? `<div class="game-grid">${games.map((g,i)=>projectCard(g,i)).join('')}</div>` : `<div class="empty-state" style="padding:40px"><div class="big">📁</div><h3>Chưa có dự án nào</h3><p>Tạo trò chơi mới hoặc nhập gói .egame để bắt đầu.</p></div>`}
    </section>`;
}
function projectCard(game, index = 0) {
  const template = game.template || 'quiz';
  return `<article class="game-card">
    <div class="game-cover ${['cover-purple','cover-mint','cover-orange','cover-blue','cover-pink'][index % 5]}"><div class="cover-deco"></div><div class="cover-deco two"></div><span class="game-badge">${templateLabel(template)}</span><div class="cover-emoji">${{quiz:'🧠',scenario:'🚦',matching:'🧩','treasure-hunt':'🗺️',race:'🏁'}[template] || '🎮'}</div></div>
    <div class="card-body">
      <div class="card-title-row"><div class="card-title">${escapeHtml(game.title)}</div><div class="card-tools"><button class="more-btn" data-action="edit" data-id="${escapeHtml(game.id)}" title="Chỉnh sửa">•••</button><button class="more-btn delete-btn" data-action="delete" data-id="${escapeHtml(game.id)}" title="Xóa dự án">🗑</button></div></div>
      <p class="card-desc">${escapeHtml(game.description || 'Dự án trò học tương tác, có thể chơi ngoại tuyến.')}</p>
      <div class="meta-tags"><span class="tag">${escapeHtml(game.subject || 'Chưa phân môn')}</span><span class="tag">${game.grade ? 'Lớp ' + escapeHtml(game.grade) : 'Mọi lớp'}</span><span class="tag">${game.questions?.length || 0} câu</span></div>
      <div class="card-meta"><span>▣ ${escapeHtml(game.topic || 'Bài học')}</span><span>↻ ${fmtDate(game.updatedAt || game.createdAt)}</span></div>
      <div class="card-actions"><button class="btn btn-primary btn-small" data-action="play" data-id="${escapeHtml(game.id)}">▶ Chạy thử</button><button class="btn btn-secondary btn-small" data-action="edit" data-id="${escapeHtml(game.id)}">Chỉnh sửa dự án</button><button class="btn btn-outline btn-small" data-action="export-game" data-id="${escapeHtml(game.id)}">📦 Xuất bản</button></div>
    </div>
  </article>`;
}