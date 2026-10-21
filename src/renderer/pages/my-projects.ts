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
  return `<div class="flex justify-between items-start gap-[20px] mb-[25px]"><div><div class="text-[10px] text-[#6258e8] font-extrabold tracking-[1.3px] uppercase mb-[8px]">MY PROJECTS</div><h1 class="text-[27px] tracking-[-0.9px] m-0 font-[780]">Dự án của tôi</h1><p class="mt-[9px] text-[#788196] text-[13px] leading-[1.6]">Nơi lưu <strong>tiến trình tạo trò chơi</strong>: giáo án nguồn, kết quả phân tích, thể loại, cấu hình và bản nháp đang làm. Trò chơi đã lưu để chơi nằm trong <strong>Thư viện trò chơi</strong>.</p></div><button class="border-0 rounded-[9px] px-[15px] py-[11px] inline-flex items-center justify-center gap-[8px] font-bold text-[12px] transition-transform duration-120 hover:-translate-y-[1px] bg-[#6258e8] text-white shadow-[0_6px_14px_#6258e82b]" data-page="create-wizard">✳ Tạo dự án mới</button></div>
    <div class="flex gap-[10px] items-center mb-[20px] flex-wrap"><div class="relative flex-1 min-w-[200px]"><input id="librarySearch" placeholder="Tìm theo tên dự án, giáo án, thể loại..." value="${escapeHtml(state.search || '')}" class="w-full px-[13px] py-[11px] pl-[37px] border border-line rounded-[9px] bg-white outline-0 text-[12px]"></div><span class="px-[4px] py-[7px] bg-[#f5f6fa] rounded-[5px] text-[#788196] text-[9px]">${projects === null ? 'Đang tải…' : `${filtered.length} dự án`}</span></div>
    <section class="bg-white border border-line rounded-[14px] p-[20px]">
      ${projects === null
        ? `<div class="p-[30px] text-center text-[#929bad] text-[12px]">Đang tải danh sách dự án…</div>`
        : filtered.length
          ? `<div class="grid grid-cols-[repeat(3,minmax(0,1fr))] gap-[16px]">${filtered.map((project, index) => projectCard(project, index)).join('')}</div>`
          : `<div class="bg-white border border-dashed border-[#dfe2ed] rounded-[14px] p-[40px] text-center text-[#929bad] flex flex-col items-center justify-center"><div class="text-[42px] mb-[12px]">📁</div><h3 class="text-[#394256] mb-[8px] mt-0">${query ? 'Không tìm thấy dự án phù hợp' : 'Chưa có dự án nào'}</h3><p class="max-w-[460px] mx-auto mb-[17px] leading-[1.7] text-[12px]">${query ? 'Thử từ khóa khác hoặc xoá bộ lọc.' : 'Một dự án lưu tiến trình từ giáo án đến bản nháp. Trò chơi đã lưu vào thư viện vẫn còn ở đó nếu bạn xoá dự án.'}</p><button class="border-0 rounded-[9px] px-[15px] py-[11px] inline-flex items-center justify-center gap-[8px] font-bold text-[12px] transition-transform duration-120 hover:-translate-y-[1px] bg-[#6258e8] text-white shadow-[0_6px_14px_#6258e82b]" data-page="create-wizard">Tạo dự án từ giáo án</button></div>`}
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
      <div class="flex justify-between gap-[8px] items-start"><div class="text-[13px] font-semibold leading-[1.4] break-words">${escapeHtml(project.title || 'Dự án chưa đặt tên')}</div><div class="flex gap-[4px]"><button class="border-0 bg-transparent text-[#6258e8] text-[12px] hover:bg-[#eeeefe] hover:rounded-[7px]" data-action="rename-project" data-id="${escapeHtml(project.id)}" title="Đổi tên dự án">✏️</button><button class="border-0 bg-transparent text-[#d84b5a] text-[12px] hover:bg-[#fff1f2] hover:rounded-[7px]" data-action="delete-project" data-id="${escapeHtml(project.id)}" title="Xóa dự án">🗑</button></div></div>
      <p class="text-[11px] text-[#8b94a6] leading-[1.6] mt-[8px] mb-[10px] min-h-[35px]">${escapeHtml(topic || 'Chưa có mô tả nội dung.')}</p>
      <div class="flex gap-[5px] flex-wrap"><span class="px-[4px] py-[7px] bg-[#f5f6fa] rounded-[5px] text-[#788196] text-[9px]">📄 ${escapeHtml(sourceName)}</span>${config.difficulty ? `<span class="px-[4px] py-[7px] bg-[#f5f6fa] rounded-[5px] text-[#788196] text-[9px]">${escapeHtml(config.difficulty)}</span>` : ''}${config.durationMinutes ? `<span class="px-[4px] py-[7px] bg-[#f5f6fa] rounded-[5px] text-[#788196] text-[9px]">${Number(config.durationMinutes)} phút</span>` : ''}</div>
      <div class="flex items-center justify-between border-t border-[#f0f1f6] pt-[12px] mt-[11px] text-[#8b94a6] text-[10px]"><span>↻ ${fmtDate(project.updatedAt || project.createdAt)}</span><span>${savedGame ? '🎮 Đã lưu trong thư viện' : 'Chưa lưu thư viện'}</span></div>
      <div class="flex gap-[8px] mt-[13px]"><button class="border-0 rounded-[9px] px-[11px] py-[8px] inline-flex items-center justify-center gap-[8px] font-bold text-[11px] transition-transform duration-120 hover:-translate-y-[1px] bg-[#6258e8] text-white shadow-[0_6px_14px_#6258e82b]" data-action="open-project" data-id="${escapeHtml(project.id)}">↻ Tiếp tục làm</button>${savedGame ? `<button class="border-0 rounded-[9px] px-[11px] py-[8px] inline-flex items-center justify-center gap-[8px] font-bold text-[11px] transition-transform duration-120 hover:-translate-y-[1px] bg-white border border-[#e7eaf2] text-[#515c72]" data-page="library">📚 Thư viện</button>` : ''}</div>
    </div>
  </article>`;
}

function projectTemplateName(gameType) {
  return { arena: 'Đấu trường', scenario: 'Tình huống', matching: 'Ghép cặp', treasure: 'Hành trình', race: 'Đường đua' }[gameType] || gameType;
}
