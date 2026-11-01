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
  return `<div class="flex items-center justify-between gap-[12px] mb-[12px] flex-wrap bg-[#f8f7ff] border border-[#e4e0ff] rounded-[10px] px-[12px] py-[9px]" data-project-selection-bar>
    <label class="inline-flex items-center gap-[8px] text-[12px] font-semibold text-[#4c4680] cursor-pointer">
      <input type="checkbox" id="projectSelectAll" class="lesson-check"${allOnList ? ' checked' : ''} aria-label="Chọn tất cả dự án đang hiển thị">
      Chọn tất cả danh sách này
    </label>
    <div class="flex items-center gap-[10px] flex-wrap">
      <span class="text-[12px] text-[#5b5680]" data-project-selected-count>${selected.size ? `Đã chọn ${selected.size} dự án` : 'Hoặc tick từng dự án để xoá nhiều cùng lúc'}</span>
      <button type="button" class="border-0 rounded-[8px] px-[11px] py-[7px] inline-flex items-center gap-[6px] font-bold text-[11px] bg-[#c33b4b] text-white hover:bg-[#a92f3e] disabled:opacity-50" id="projectDeleteSelectedBtn" data-action="project-delete-selected"${selected.size ? '' : ' disabled'}><span data-icon="trash" data-icon-size="13"></span> Xoá đã chọn${selected.size ? ` (${selected.size})` : ''}</button>
      <button type="button" class="border-0 rounded-[8px] px-[10px] py-[7px] font-semibold text-[11px] bg-transparent text-[#6b6690] hover:underline disabled:opacity-50" id="projectClearSelectionBtn" data-action="project-clear-selection"${selected.size ? '' : ' disabled'}>Bỏ chọn</button>
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
  return `<div class="relative min-w-0 rounded-[14px]${selected ? ' ring-2 ring-[#6258e8]' : ''}" data-project-item="${id}"${selected ? ' data-selected="true"' : ''}>
    <label class="absolute top-[10px] right-[10px] z-[3] inline-flex items-center justify-center w-[25px] h-[25px] rounded-[7px] bg-white/[90%] border border-[#e7eaf2] cursor-pointer" title="Chọn dự án này">
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
  return `<div class="flex justify-between items-start gap-[20px] mb-[25px]"><div><h1 class="text-[27px] tracking-[-0.9px] m-0 font-[780]">Dự án của tôi</h1><p class="mt-[9px] text-[#788196] text-[13px] leading-[1.6]">Nơi lưu <strong>tiến trình tạo trò chơi</strong>: giáo án nguồn, kết quả phân tích, thể loại, cấu hình và bản nháp đang làm. Trò chơi đã lưu để chơi nằm trong <strong>Thư viện trò chơi</strong>.</p></div><button class="border-0 rounded-[9px] px-[15px] py-[11px] inline-flex items-center justify-center gap-[7px] font-bold text-[12px] transition-transform duration-120 hover:-translate-y-[1px] bg-[#6258e8] text-white shadow-[0_6px_14px_#6258e82b]" data-page="create-wizard"><span data-icon="circle-plus" data-icon-size="14"></span> Tạo dự án mới</button></div>
    <div class="flex gap-[10px] items-center mb-[20px] flex-wrap"><div class="relative flex-1 min-w-[200px]"><input id="librarySearch" placeholder="Tìm theo tên dự án, giáo án, thể loại..." value="${escapeHtml(state.search || '')}" class="w-full px-[13px] py-[11px] pl-[37px] border border-line rounded-[9px] bg-white outline-0 text-[12px]"></div><span class="px-[4px] py-[7px] bg-[#f5f6fa] rounded-[5px] text-[#788196] text-[9px]">${projects === null ? 'Đang tải…' : `${filtered.length} dự án`}</span></div>
    <section class="bg-white border border-line rounded-[14px] p-[20px]">
      ${projects === null
        ? `<div class="p-[30px] text-center text-[#929bad] text-[12px]">Đang tải danh sách dự án…</div>`
        : filtered.length
          ? `${projectSelectionBarHtml(filtered, selected)}<div class="grid grid-cols-[repeat(3,minmax(0,1fr))] gap-[16px]">${filtered.map((project, index) => projectCardHtml(project, index, selected.has(project.id))).join('')}</div>`
          : `<div class="bg-white border border-dashed border-[#dfe2ed] rounded-[14px] p-[40px] text-center text-[#929bad] flex flex-col items-center justify-center"><div class="mb-[12px] text-[#aab1c3]"><span data-icon="folder-open" data-icon-size="36"></span></div><h3 class="text-[#394256] mb-[8px] mt-0">${query ? 'Không tìm thấy dự án phù hợp' : 'Chưa có dự án nào'}</h3><p class="max-w-[460px] mx-auto mb-[17px] leading-[1.7] text-[12px]">${query ? 'Thử từ khóa khác hoặc xoá bộ lọc.' : 'Một dự án lưu tiến trình từ giáo án đến bản nháp. Trò chơi đã lưu vào thư viện vẫn còn ở đó nếu bạn xoá dự án.'}</p><button class="border-0 rounded-[9px] px-[15px] py-[11px] inline-flex items-center justify-center gap-[8px] font-bold text-[12px] transition-transform duration-120 hover:-translate-y-[1px] bg-[#6258e8] text-white shadow-[0_6px_14px_#6258e82b]" data-page="create-wizard">Tạo dự án từ giáo án</button></div>`}
    </section>`;
}

function projectCard(project, index = 0) {
  const config = project.config || {};
  const template = config.gameType ? projectTemplateName(config.gameType) : '';
  const coverGrad = ['bg-[linear-gradient(135deg,#e9e7ff,#d6d1ff)]','bg-[linear-gradient(135deg,#ddf8ed,#bdeedb)]','bg-[linear-gradient(135deg,#fff0dc,#ffd8a7)]','bg-[linear-gradient(135deg,#e0efff,#c9e1ff)]','bg-[linear-gradient(135deg,#ffe4ed,#ffc9d9)]'][index % 5];
  const icon = { arena: '🧠', scenario: '🚦', matching: '🧩', treasure: '🗺️', race: '🏁' }[config.gameType] || '🎯';
  const sourceName = (project.lesson && project.lesson.name) || project.sourceName || 'Chưa có giáo án nguồn';
  const topic = (project.description || (project.title || '')).trim();
  const savedGame = projectGameSaved(project);
  return `<article class="bg-white border border-line rounded-[14px] overflow-hidden min-w-0 transition-all duration-180 hover:-translate-y-[3px] hover:shadow-card hover:border-[#d8d5ff]">
    <div class="${coverGrad} h-[112px] relative flex items-center justify-center overflow-hidden">
      <div class="absolute [border:1px_solid_#ffffffaa] w-[120px] h-[120px] rounded-full -left-[15px] top-[35px]"></div>
      <span class="absolute top-[12px] left-[12px] bg-white/[85%] text-[#5f58b8] text-[9px] font-extrabold px-[6px] py-[8px] rounded-[6px] z-[2]">${escapeHtml(projectStepLabel(project))}</span>
      <div class="text-[46px] [filter:drop-shadow(0_7px_5px_#4c50701c)] relative z-[1]">${template ? icon : '📝'}</div>
      ${template ? `<span class="absolute bottom-[10px] right-[12px] bg-[#11152bcc] text-white text-[9px] font-bold px-[7px] py-[7px] rounded-[6px]">${escapeHtml(template)}</span>` : ''}
    </div>
    <div class="p-[15px]">
      <div class="flex justify-between gap-[8px] items-start"><div class="text-[13px] font-semibold leading-[1.4] break-words">${escapeHtml(project.title || 'Dự án chưa đặt tên')}</div><div class="flex gap-[4px]"><button class="border-0 bg-transparent text-[#6258e8] w-[26px] h-[26px] grid place-items-center hover:bg-[#eeeefe] hover:rounded-[7px]" data-action="rename-project" data-id="${escapeHtml(project.id)}" title="Đổi tên dự án"><span data-icon="pencil" data-icon-size="14"></span></button><button class="border-0 bg-transparent text-[#d84b5a] w-[26px] h-[26px] grid place-items-center hover:bg-[#fff1f2] hover:rounded-[7px]" data-action="delete-project" data-id="${escapeHtml(project.id)}" title="Xóa dự án"><span data-icon="trash" data-icon-size="14"></span></button></div></div>
      <p class="text-[11px] text-[#8b94a6] leading-[1.6] mt-[8px] mb-[10px] min-h-[35px]">${escapeHtml(topic || 'Chưa có mô tả nội dung.')}</p>
      <div class="flex gap-[5px] flex-wrap"><span class="inline-flex items-center gap-[5px] px-[4px] py-[7px] bg-[#f5f6fa] rounded-[5px] text-[#788196] text-[9px]"><span data-icon="file-text" data-icon-size="11"></span> ${escapeHtml(sourceName)}</span>${config.difficulty ? `<span class="px-[4px] py-[7px] bg-[#f5f6fa] rounded-[5px] text-[#788196] text-[9px]">${escapeHtml(config.difficulty)}</span>` : ''}${config.durationMinutes ? `<span class="px-[4px] py-[7px] bg-[#f5f6fa] rounded-[5px] text-[#788196] text-[9px]">${Number(config.durationMinutes)} phút</span>` : ''}</div>
      <div class="flex items-center justify-between border-t border-[#f0f1f6] pt-[12px] mt-[11px] text-[#8b94a6] text-[10px]"><span class="inline-flex items-center gap-[5px]"><span data-icon="clock" data-icon-size="12"></span> ${fmtDate(project.updatedAt || project.createdAt)}</span><span>${savedGame ? 'Đã lưu trong thư viện' : 'Chưa lưu thư viện'}</span></div>
      <div class="flex gap-[8px] mt-[13px]"><button class="border-0 rounded-[9px] px-[11px] py-[8px] inline-flex items-center justify-center gap-[7px] font-bold text-[11px] transition-transform duration-120 hover:-translate-y-[1px] bg-[#6258e8] text-white shadow-[0_6px_14px_#6258e82b]" data-action="open-project" data-id="${escapeHtml(project.id)}"><span data-icon="pencil" data-icon-size="13"></span> Tiếp tục làm</button>${savedGame ? `<button class="border-0 rounded-[9px] px-[11px] py-[8px] inline-flex items-center justify-center gap-[7px] font-bold text-[11px] transition-transform duration-120 hover:-translate-y-[1px] bg-white border border-[#e7eaf2] text-[#515c72]" data-page="library"><span data-icon="library" data-icon-size="13"></span> Thư viện</button>` : ''}</div>
    </div>
  </article>`;
}

function projectTemplateName(gameType) {
  return { arena: 'Đấu trường', scenario: 'Tình huống', matching: 'Ghép cặp', treasure: 'Hành trình', race: 'Đường đua' }[gameType] || gameType;
}
