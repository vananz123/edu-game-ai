// @ts-nocheck -- migrated legacy UI logic; new contracts are typed in src/shared/types.ts.

/**
 * #154: 9 games a page. The grid is three columns (`grid-cols-[repeat(3,...)]`),
 * so a page is exactly three rows of cards — the same "one page fits a screen"
 * rule as #122 (lessons) and #123 (results), kept in multiples of the grid.
 */
const LIBRARY_PAGE_SIZE = 9;

/** 1-based page the teacher is on, clamped to what the current list allows. */
function libraryCurrentPage(total, pageSize = LIBRARY_PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Number(state.libraryPage) || 0;
  return Math.min(Math.max(0, page), pages - 1);
}

/** Ids ticked for batch delete. Survives paging; drops ids that no longer exist. */
function librarySelectedIds(games) {
  const existing = new Set((Array.isArray(games) ? games : []).map(game => game.id));
  const selected = state.librarySelection instanceof Set ? state.librarySelection : new Set();
  for (const id of [...selected]) if (!existing.has(id)) selected.delete(id);
  state.librarySelection = selected;
  return selected;
}

/** Trước / số trang / Sau / "Trang X/Y · N trò chơi". Hidden when one page. */
function libraryPagerHtml(page, total, pageSize = LIBRARY_PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return '';
  const button = (label, target, disabled, id) =>
    `<button type="button" class="px-[10px] py-[6px] rounded-[7px] border border-[#e7eaf2] bg-white text-[11px] font-semibold text-[#515c72] disabled:opacity-50 disabled:cursor-not-allowed" id="${id}" data-action="library-page" data-page-index="${target}"${disabled ? ' disabled' : ''}>${label}</button>`;
  const numbers = [];
  for (let index = 0; index < pages; index += 1) {
    numbers.push(`<button type="button" class="min-w-[26px] h-[26px] rounded-[7px] border text-[11px] font-bold ${index === page ? 'border-[#6258e8] bg-[#6258e8] text-white' : 'border-[#e7eaf2] bg-white text-[#515c72] hover:border-[#c8c3ff]'}" data-action="library-page" data-page-index="${index}" aria-current="${index === page ? 'page' : 'false'}">${index + 1}</button>`);
  }
  return `<div class="flex items-center justify-between gap-[10px] mt-[14px] flex-wrap" data-library-pager>
    <span class="text-[11px] text-[#9199aa]">Trang <b>${page + 1}</b>/${pages} · ${total} trò chơi · ${pageSize} mỗi trang</span>
    <div class="flex gap-[6px] items-center">${button('← Trước', Math.max(0, page - 1), page === 0, 'libraryPrevBtn')}${numbers.join('')}${button('Sau →', Math.min(pages - 1, page + 1), page >= pages - 1, 'libraryNextBtn')}</div>
  </div>`;
}

/** The batch bar above the grid: select-all on this page, count, delete, clear. */
function librarySelectionBarHtml(pageGames, selected) {
  if (!pageGames.length) return '';
  const allOnPage = pageGames.every(game => selected.has(game.id));
  return `<div class="flex items-center justify-between gap-[12px] mb-[12px] flex-wrap bg-[#f8f7ff] border border-[#e4e0ff] rounded-[10px] px-[12px] py-[9px]" data-library-selection-bar>
    <label class="inline-flex items-center gap-[8px] text-[12px] font-semibold text-[#4c4680] cursor-pointer">
      <input type="checkbox" id="librarySelectAll" class="lesson-check"${allOnPage ? ' checked' : ''} aria-label="Chọn tất cả trò chơi trong trang">
      Chọn tất cả trang này
    </label>
    <div class="flex items-center gap-[10px] flex-wrap">
      <span class="text-[12px] text-[#5b5680]" data-library-selected-count>${selected.size ? `Đã chọn ${selected.size} trò chơi` : 'Hoặc tick từng trò chơi để xoá nhiều cùng lúc'}</span>
      <button type="button" class="border-0 rounded-[8px] px-[11px] py-[7px] font-bold text-[11px] bg-[#c33b4b] text-white hover:bg-[#a92f3e] disabled:opacity-50" id="libraryDeleteSelectedBtn" data-action="library-delete-selected"${selected.size ? '' : ' disabled'}>🗑 Xoá đã chọn${selected.size ? ` (${selected.size})` : ''}</button>
      <button type="button" class="border-0 rounded-[8px] px-[10px] py-[7px] font-semibold text-[11px] bg-transparent text-[#6b6690] hover:underline disabled:opacity-50" id="libraryClearSelectionBtn" data-action="library-clear-selection"${selected.size ? '' : ' disabled'}>Bỏ chọn</button>
    </div>
  </div>`;
}

/**
 * A library card plus its pick box. The checkbox sits OUTSIDE `gameCard()` (which
 * the home page also uses) in a wrapper, so the card markup shared with "Trang
 * chủ" keeps exactly one shape and only the library grows a selection affordance.
 */
function libraryCardHtml(game, index, selected) {
  const id = escapeHtml(game.id);
  return `<div class="relative min-w-0 rounded-[14px]${selected ? ' ring-2 ring-[#6258e8]' : ''}" data-library-item="${id}"${selected ? ' data-selected="true"' : ''}>
    <label class="absolute top-[10px] right-[10px] z-[3] inline-flex items-center justify-center w-[25px] h-[25px] rounded-[7px] bg-white/[90%] border border-[#e7eaf2] cursor-pointer" title="Chọn trò chơi này">
      <input type="checkbox" class="lesson-check" data-action="library-select" data-id="${id}"${selected ? ' checked' : ''} aria-label="Chọn ${escapeHtml(game.title || 'trò chơi')}">
    </label>
    ${gameCard(game, index, true)}
  </div>`;
}

function renderLibrary() {
  const games = state.db.games.filter(g => (`${g.title} ${g.subject} ${g.topic} ${g.grade}`).toLowerCase().includes(state.search.toLowerCase()) && (state.filter === 'all' || g.template === state.filter));
  const selected = librarySelectedIds(state.db.games);
  const page = libraryCurrentPage(games.length);
  const pageGames = games.slice(page * LIBRARY_PAGE_SIZE, page * LIBRARY_PAGE_SIZE + LIBRARY_PAGE_SIZE);
  return `<div class="flex justify-between items-start gap-[20px] mb-[25px]"><div><div class="text-[10px] text-[#6258e8] font-extrabold tracking-[1.3px] uppercase mb-[8px]">YOUR CONTENT</div><h1 class="text-[27px] tracking-[-0.9px] m-0 font-[780]">Thư viện trò chơi</h1><p class="mt-[9px] text-[#788196] text-[13px] leading-[1.6]">Các <strong>trò chơi đã lưu</strong> để chơi và chỉnh sửa trên thiết bị. Bản nháp tạo dở nằm trong <strong>Dự án của tôi</strong>.</p></div><button class="border-0 rounded-[9px] px-[15px] py-[11px] inline-flex items-center justify-center gap-[8px] font-bold text-[12px] transition-transform duration-120 hover:-translate-y-[1px] bg-[#6258e8] text-white shadow-[0_6px_14px_#6258e82b]" data-page="create">✳ Tạo trò chơi</button></div>
    <div class="flex gap-[10px] items-center mb-[20px] flex-wrap"><div class="relative flex-1 min-w-[200px]"><input id="librarySearch" placeholder="Tìm theo tên, môn học, lớp..." value="${escapeHtml(state.search)}" class="w-full px-[13px] py-[11px] pl-[37px] border border-line rounded-[9px] bg-white outline-0 text-[12px]"></div><select class="select" id="templateFilter"><option value="all">Tất cả thể loại</option><option value="quiz" ${state.filter==='quiz'?'selected':''}>Đấu trường kiến thức</option><option value="scenario" ${state.filter==='scenario'?'selected':''}>Tình huống</option><option value="matching" ${state.filter==='matching'?'selected':''}>Ghép cặp</option><option value="treasure-hunt" ${state.filter==='treasure-hunt'?'selected':''}>Giải mã kho báu</option><option value="race" ${state.filter==='race'?'selected':''}>Đường đua chinh phục</option></select><button class="border-0 rounded-[9px] px-[15px] py-[11px] inline-flex items-center justify-center gap-[8px] font-bold text-[12px] transition-transform duration-120 hover:-translate-y-[1px] bg-white border border-[#e7eaf2] text-[#515c72]" data-action="import-game">⇧ Nhập gói .egame</button><span class="px-[4px] py-[7px] bg-[#f5f6fa] rounded-[5px] text-[#788196] text-[9px]">${games.length} trò chơi</span></div>
    ${games.length ? `${librarySelectionBarHtml(pageGames, selected)}<div class="grid grid-cols-[repeat(3,minmax(0,1fr))] gap-[16px]">${pageGames.map((g, i) => libraryCardHtml(g, page * LIBRARY_PAGE_SIZE + i, selected.has(g.id))).join('')}</div>${libraryPagerHtml(page, games.length)}` : emptyState('Không tìm thấy trò chơi','Thử từ khóa khác hoặc tạo trò chơi mới.','Tạo trò chơi','create')}`;
}
