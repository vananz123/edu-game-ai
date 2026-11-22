// @ts-nocheck -- migrated legacy UI logic; new contracts are typed in src/shared/types.ts.
const PROJECT_STEP_LABELS = {
  input: 'Đã nhập giáo án',
  analyze: 'Đã phân tích giáo án',
  recommend: 'Đã chọn thể loại',
  configure: 'Đã cấu hình',
  generate: 'Đã tạo bản nháp',
  edit: 'Đang chỉnh sửa',
  done: 'Đã lưu trò chơi'
};

function projectStepLabel(project) {
  if (!project) return '';
  // `status: ready` only means the content is ready for review. It is not proof
  // that the game was saved to the library; only step `done` says that.
  if (project.step === 'done') return 'Đã lưu trò chơi';
  return PROJECT_STEP_LABELS[project.step] || 'Bản nháp';
}

function projectGameSaved(project) {
  if (!project || !project.gameId || !Array.isArray(state.db.games)) return false;
  return state.db.games.some(game => game.id === project.gameId);
}

/** Ids ticked for batch delete (#163). Drops ids that no longer exist. */
function projectSelectedIds(projects) {
  const selected = state.projectSelection instanceof Set ? state.projectSelection : new Set();
  state.projectSelection = selected;
  // `state.projects` is null while the list is loading, and every refresh renders
  // that state first: pruning then would quietly drop a selection the teacher made.
  if (!Array.isArray(projects)) return selected;
  const existing = new Set(projects.map(project => project.id));
  for (const id of [...selected]) if (!existing.has(id)) selected.delete(id);
  return selected;
}

/**
 * The batch bar above the grid (#163), same shape as the library's (#154).
 * "Chọn tất cả" covers the whole list rather than a page because this page is not
 * paged — every project it shows is a project the teacher can tick.
 */
function projectSelectionBarHtml(projects, selected) {
  if (!projects.length) return '';
  const allOnList = projects.every(project => selected.has(project.id));
  return `<div class="lib-selbar" data-project-selection-bar>
    <label class="lib-selbar-all">
      <input type="checkbox" id="projectSelectAll" class="lesson-check"${allOnList ? ' checked' : ''} aria-label="Chọn tất cả dự án đang hiển thị">
      <span>Chọn tất cả danh sách này</span>
    </label>
    <div class="lib-selbar-actions">
      <span class="lib-selbar-count" data-project-selected-count>${selected.size ? `Đã chọn ${selected.size} dự án` : 'Hoặc tick từng dự án để xoá nhiều cùng lúc'}</span>
      <button type="button" class="btn btn-danger btn-small" id="projectDeleteSelectedBtn" data-action="project-delete-selected"${selected.size ? '' : ' disabled'}><span data-icon="trash" data-icon-size="13"></span> Xoá đã chọn${selected.size ? ` (${selected.size})` : ''}</button>
      <button type="button" class="lib-selbar-clear" id="projectClearSelectionBtn" data-action="project-clear-selection"${selected.size ? '' : ' disabled'}>Bỏ chọn</button>
    </div>
  </div>`;
}

/**
 * A project card plus its pick box (#163). The checkbox sits OUTSIDE `projectCard()`
 * in a wrapper, so only this page grows the selection affordance — the same split as
 * `libraryCardHtml()` (#154).
 */
function projectCardHtml(project, index, selected) {
  const id = escapeHtml(project.id);
  return `<div class="lib-item${selected ? ' is-selected' : ''}" data-project-item="${id}"${selected ? ' data-selected="true"' : ''}>
    <label class="lib-card-check" title="Chọn dự án này">
      <input type="checkbox" class="lesson-check" data-action="project-select" data-id="${id}"${selected ? ' checked' : ''} aria-label="Chọn ${escapeHtml(project.title || 'dự án')}">
    </label>
    ${projectCard(project, index)}
  </div>`;
}

function renderMyProjects() {
  const query = String(state.search || '').trim().toLowerCase();
  const projects = Array.isArray(state.projects) ? state.projects : null;
  const filtered = (projects || []).filter(project => {
    if (!query) return true;
    return [
      project.title,
      project.description,
      project.sourceName,
      project.lesson && project.lesson.name,
      project.config && project.config.gameType,
      projectStepLabel(project)
    ].filter(Boolean).join(' ').toLowerCase().includes(query);
  });
  const selected = projectSelectedIds(projects);
  return `<div class="page-head"><div class="page-head-title"><h1>Dự án của tôi</h1></div><div class="page-head-actions"><button class="btn btn-primary btn-small" data-page="create-wizard"><span data-icon="circle-plus" data-icon-size="14"></span> Tạo dự án mới</button></div></div>
    <div class="lib-toolbar">
      <div class="lib-search"><span data-icon="search" data-icon-size="14"></span><input id="librarySearch" placeholder="Tìm theo tên dự án, giáo án, thể loại..." value="${escapeHtml(state.search || '')}"></div>
      <span class="lib-count">${projects === null ? 'Đang tải…' : `${filtered.length} dự án`}</span>
    </div>
    ${projects === null
      ? `<div class="lib-empty">Đang tải danh sách dự án…</div>`
      : filtered.length
        ? `${projectSelectionBarHtml(filtered, selected)}<div class="lib-grid">${filtered.map((project, index) => projectCardHtml(project, index, selected.has(project.id))).join('')}</div>`
        : `<div class="lib-empty lib-empty-dashed"><div class="lib-empty-icon"><span data-icon="folder-open" data-icon-size="26"></span></div><h3>${query ? 'Không tìm thấy dự án phù hợp' : 'Chưa có dự án nào'}</h3><p>${query ? 'Thử từ khóa khác hoặc xoá bộ lọc.' : 'Một dự án lưu tiến trình từ giáo án đến bản nháp.'}</p><button class="btn btn-primary btn-small" data-page="create-wizard">Tạo dự án từ giáo án</button></div>`}`;
}

function projectCard(project, index = 0) {
  const config = project.config || {};
  const template = config.gameType ? projectTemplateName(config.gameType) : '';
  /* #307: the same skeleton as a library card — a tinted cover with one vector glyph, a
     two-line title, one chip row, and a footer that is pinned to the bottom — so the two
     grids read as one product instead of two different ones. */
  const glyph = { arena: 'brain', scenario: 'shield-check', matching: 'layers', treasure: 'map', race: 'flag' }[config.gameType] || 'target';
  const sourceName = (project.lesson && project.lesson.name) || project.sourceName || 'Chưa có giáo án nguồn';
  const topic = (project.description || '').trim();
  const savedGame = projectGameSaved(project);
  const savedChip = savedGame
    ? '<span class="lib-chip is-ok"><span class="lib-chip-text">Đã lưu thư viện</span></span>'
    : '<span class="lib-chip"><span class="lib-chip-text">Chưa lưu thư viện</span></span>';
  return `<article class="lib-card is-project" data-project-card="${escapeHtml(project.id)}">
    <div class="lib-card-cover">
      <span class="lib-card-glyph">${uiIcon(glyph, '', 19)}</span>
      <span class="lib-card-kind">${escapeHtml(projectStepLabel(project))}</span>
      ${template ? `<span class="lib-mode-pill">${escapeHtml(template)}</span>` : ''}
    </div>
    <div class="lib-card-body">
      <div class="lib-card-head">
        <h3 class="lib-card-title">${escapeHtml(project.title || 'Dự án chưa đặt tên')}</h3>
        <div class="lib-card-tools">
          <button class="lib-card-menu" data-action="rename-project" data-id="${escapeHtml(project.id)}" title="Đổi tên dự án" aria-label="Đổi tên dự án"><span data-icon="pencil" data-icon-size="14"></span></button>
          <button class="lib-card-menu is-danger" data-action="delete-project" data-id="${escapeHtml(project.id)}" title="Xoá dự án" aria-label="Xoá dự án"><span data-icon="trash" data-icon-size="14"></span></button>
        </div>
      </div>
      <p class="lib-card-desc">${escapeHtml(topic || 'Chưa có mô tả nội dung.')}</p>
      <div class="lib-card-chips">
        <span class="lib-chip lib-chip-wide"><span data-icon="file-text" data-icon-size="11"></span> <span class="lib-chip-text">${escapeHtml(sourceName)}</span></span>
        ${config.difficulty ? `<span class="lib-chip"><span class="lib-chip-text">${escapeHtml(config.difficulty)}</span></span>` : ''}
        ${config.durationMinutes ? `<span class="lib-chip"><span class="lib-chip-text">${Number(config.durationMinutes)} phút</span></span>` : ''}
        ${savedChip}
      </div>
      <div class="lib-card-meta">
        <span class="lib-meta-item"><span data-icon="clock" data-icon-size="12"></span> ${fmtDate(project.updatedAt || project.createdAt)}</span>
      </div>
      <div class="lib-card-actions">
        <button class="btn btn-primary btn-small lib-card-play" data-action="open-project" data-id="${escapeHtml(project.id)}"><span data-icon="pencil" data-icon-size="13"></span> Tiếp tục làm</button>
        ${savedGame ? `<button class="btn btn-secondary btn-small lib-card-icon" data-page="library" title="Mở thư viện trò chơi" aria-label="Mở thư viện trò chơi"><span data-icon="library" data-icon-size="13"></span></button>` : ''}
      </div>
    </div>
  </article>`;
}

function projectTemplateName(gameType) {
  return { arena: 'Đấu trường', scenario: 'Tình huống', matching: 'Ghép cặp', treasure: 'Hành trình', race: 'Đường đua' }[gameType] || gameType;
}
