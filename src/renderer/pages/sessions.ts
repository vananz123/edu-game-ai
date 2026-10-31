// @ts-nocheck -- migrated legacy UI logic; new contracts are typed in src/shared/types.ts.
function sessionTemplateLabel(template) {
  return { quiz: 'Đấu trường', scenario: 'Tình huống', matching: 'Ghép cặp', 'treasure-hunt': 'Hành trình', treasure: 'Hành trình', race: 'Đường đua' }[template] || 'Trò chơi';
}

function sessionDuration(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  if (!value) return '—';
  return value >= 60 ? `${Math.floor(value / 60)}p ${value % 60}s` : `${value}s`;
}

/** #123: 15 results a page — the list is a table, so a page fills a screen. */
const SESSION_PAGE_SIZE = 15;

/** 1-based page the teacher is on, clamped to the current list. */
function sessionCurrentPage(total, pageSize = SESSION_PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Number(state.sessionPage) || 0;
  return Math.min(Math.max(0, page), pages - 1);
}

/** Ids ticked for batch delete. Drops ids that are no longer in the list. */
function sessionSelectedIds(sessions) {
  const existing = new Set((Array.isArray(sessions) ? sessions : []).map(session => session.id));
  const selected = state.sessionSelection instanceof Set ? state.sessionSelection : new Set();
  for (const id of [...selected]) if (!existing.has(id)) selected.delete(id);
  state.sessionSelection = selected;
  return selected;
}

/** Trước / Sau / "Trang X/Y · N lượt". Hidden when everything fits one page. */
function sessionPagerHtml(page, total, pageSize = SESSION_PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return '';
  const button = (label, target, disabled, id) =>
    `<button type="button" class="px-[10px] py-[6px] rounded-[7px] border border-[#e7eaf2] bg-white text-[11px] font-semibold text-[#515c72] disabled:opacity-50 disabled:cursor-not-allowed" id="${id}" data-action="session-page" data-page-index="${target}"${disabled ? ' disabled' : ''}>${label}</button>`;
  return `<div class="flex items-center justify-between gap-[10px] mt-[14px] flex-wrap" data-session-pager>
    <span class="text-[11px] text-[#9199aa]">Trang <b>${page + 1}</b>/${pages} · ${total} lượt chơi · ${pageSize} mỗi trang</span>
    <div class="flex gap-[6px]">${button('← Trước', Math.max(0, page - 1), page === 0, 'sessionPrevBtn')}${button('Sau →', Math.min(pages - 1, page + 1), page >= pages - 1, 'sessionNextBtn')}</div>
  </div>`;
}

/** The batch bar above the table: select-all on this page, count, delete, clear. */
function sessionSelectionBarHtml(pageSessions, selected) {
  if (!pageSessions.length) return '';
  const allOnPage = pageSessions.every(session => selected.has(session.id));
  return `<div class="flex items-center justify-between gap-[12px] mb-[10px] flex-wrap bg-[#f8f7ff] border border-[#e4e0ff] rounded-[10px] px-[12px] py-[9px]" data-session-selection-bar>
    <label class="inline-flex items-center gap-[8px] text-[12px] font-semibold text-[#4c4680] cursor-pointer">
      <input type="checkbox" id="sessionSelectAll" class="lesson-check"${allOnPage ? ' checked' : ''} aria-label="Chọn tất cả lượt chơi trong trang">
      Chọn tất cả trang này
    </label>
    <div class="flex items-center gap-[10px] flex-wrap">
      <span class="text-[12px] text-[#5b5680]" data-session-selected-count>${selected.size ? `Đã chọn ${selected.size} lượt chơi` : 'Hoặc tick từng lượt để xoá nhiều cùng lúc'}</span>
      <button type="button" class="border-0 rounded-[8px] px-[11px] py-[7px] font-bold text-[11px] text-white hover:opacity-90 disabled:opacity-50" style="background:#c33b4b" id="sessionDeleteSelectedBtn" data-action="session-delete-selected"${selected.size ? '' : ' disabled'}>🗑 Xoá đã chọn${selected.size ? ` (${selected.size})` : ''}</button>
      <button type="button" class="border-0 rounded-[8px] px-[10px] py-[7px] font-semibold text-[11px] bg-transparent text-[#6b6690] hover:underline disabled:opacity-50" id="sessionClearSelectionBtn" data-action="session-clear-selection"${selected.size ? '' : ' disabled'}>Bỏ chọn</button>
    </div>
  </div>`;
}

/** The table head, with a checkbox column matching the selection bar. */
function sessionTableHeadHtml() {
  return `<div class="grid grid-cols-[28px_1.25fr_1fr_.55fr_.65fr_.7fr] gap-[12px] items-center py-[14px] border-b border-[#f0f1f5] text-[10px] text-[#9ba2b1] font-[750]"><span aria-hidden="true"></span><span>TRÒ CHƠI</span><span>NGƯỜI CHƠI / ĐỘI</span><span>THỜI LƯỢNG</span><span>KẾT THÚC</span><span>ĐIỂM</span></div>`;
}

/** One result row; the checkbox lives in its own column so it never reflows the text. */
function sessionRowHtml(session, selected) {
  const id = escapeHtml(session.id);
  return `<div class="grid grid-cols-[28px_1.25fr_1fr_.55fr_.65fr_.7fr] gap-[12px] items-center py-[14px] border-b border-[#f0f1f5] text-[11px] last:border-b-0${selected ? ' bg-[#faf9ff]' : ''}" data-session-id="${id}"${selected ? ' data-selected="true"' : ''}>
    <label class="cursor-pointer inline-flex justify-center" title="Chọn lượt này"><input type="checkbox" class="lesson-check" data-action="session-select" data-id="${id}"${selected ? ' checked' : ''} aria-label="Chọn lượt chơi của ${escapeHtml(session.playerName || 'người chơi')}"></label>
    <div class="min-w-0"><strong class="block truncate">${escapeHtml(session.gameTitle || 'Trò chơi')}</strong><small class="text-[9px] text-[#98a0b0]">${escapeHtml(sessionTemplateLabel(session.template))}</small></div>
    <span class="truncate">${escapeHtml(session.playerName || 'Người chơi')}</span>
    <span>${sessionDuration(session.durationSeconds)}</span>
    <span>${fmtDateTime(session.completedAt || session.createdAt)}</span>
    <span class="bg-[#e7f8f0] text-[#16976d] rounded-[7px] px-[6px] py-[8px] font-extrabold justify-self-start">${Number(session.points || 0)} điểm · ${Number(session.percent || 0)}%</span>
  </div>`;
}

function renderSessions() {
  const sessions = Array.isArray(state.db.sessions) ? state.db.sessions : [];
  const selected = sessionSelectedIds(sessions);
  const page = sessionCurrentPage(sessions.length);
  const pageSessions = sessions.slice(page * SESSION_PAGE_SIZE, page * SESSION_PAGE_SIZE + SESSION_PAGE_SIZE);
  return `<div class="flex justify-between items-start gap-[20px] mb-[25px]"><div><div class="text-[10px] text-[#6258e8] font-extrabold tracking-[1.3px] uppercase mb-[8px]">CLASSROOM REPORTS</div><h1 class="text-[27px] tracking-[-0.9px] m-0 font-[780]">Lịch sử kết quả</h1><p class="mt-[9px] text-[#788196] text-[13px] leading-[1.6]">Các lượt chơi <strong>đã hoàn thành</strong> được tự lưu trên thiết bị này. Lượt bỏ dở giữa chừng không được ghi vào lịch sử.</p></div><button class="border-0 rounded-[9px] px-[15px] py-[11px] inline-flex items-center justify-center gap-[8px] font-bold text-[12px] transition-transform duration-120 hover:-translate-y-[1px] bg-white border border-[#e7eaf2] text-[#515c72]" data-action="export-results">⇩ Xuất CSV</button></div>
    <section class="bg-white border border-line rounded-[14px] p-[20px]"><div class="flex justify-between items-center mb-[14px]"><h3 class="text-[14px] m-0 tracking-[-0.2px]">Các lượt chơi gần đây</h3><span class="px-[4px] py-[7px] bg-[#f5f6fa] rounded-[5px] text-[#788196] text-[9px]">${sessions.length} lượt</span></div>${sessions.length
      ? `${sessionSelectionBarHtml(pageSessions, selected)}${sessionTableHeadHtml()}${pageSessions.map(session => sessionRowHtml(session, selected.has(session.id))).join('')}${sessionPagerHtml(page, sessions.length)}`
      : `<div class="bg-white border border-dashed border-[#dfe2ed] rounded-[14px] p-[30px] text-center text-[#929bad] flex flex-col items-center justify-center"><div class="text-[42px] mb-[12px]">◷</div><h3 class="text-[#394256] mb-[8px] mt-0">Chưa có kết quả</h3><p class="max-w-[420px] mx-auto mb-[17px] leading-[1.7] text-[12px]">Kết quả sẽ tự lưu sau khi kết thúc một lượt chơi.</p><button class="border-0 rounded-[9px] px-[15px] py-[11px] inline-flex items-center justify-center gap-[8px] font-bold text-[12px] transition-transform duration-120 hover:-translate-y-[1px] bg-[#6258e8] text-white shadow-[0_6px_14px_#6258e82b]" data-page="library">Mở thư viện</button></div>`}</section>`;
}
