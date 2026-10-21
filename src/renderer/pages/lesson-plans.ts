// @ts-nocheck -- migrated legacy UI logic; new contracts are typed in src/shared/types.ts.
function lessonExtLabel(ext) {
  return String(ext || 'txt').toUpperCase();
}

function lessonExtTone(ext) {
  const value = String(ext || '').toLowerCase();
  if (value === 'pdf') return 'bg-[#fff0f1] text-[#d84b5a]';
  if (value === 'docx' || value === 'doc') return 'bg-[#edf2ff] text-[#4565c9]';
  if (value === 'pptx' || value === 'ppt') return 'bg-[#fff4e9] text-[#c9792b]';
  return 'bg-[#eef9f3] text-[#21845c]';
}

function renderLessonPlans() {
  const query = String(state.search || '').trim().toLowerCase();
  const library = Array.isArray(state.lessonLibrary) ? state.lessonLibrary : null;
  const docs = (library || []).filter(document => {
    if (!query) return true;
    const latest = document.analyses && document.analyses[0];
    return [
      document.name,
      latest && latest.topic,
      latest && latest.subject,
      latest && latest.grade ? `lớp ${latest.grade}` : ''
    ].filter(Boolean).join(' ').toLowerCase().includes(query);
  });
  return `<div class="flex justify-between items-start gap-[20px] mb-[25px]"><div><div class="text-[10px] text-[#6258e8] font-extrabold tracking-[1.3px] uppercase mb-[8px]">LESSON SOURCES</div><h1 class="text-[27px] tracking-[-0.9px] m-0 font-[780]">Giáo án</h1><p class="mt-[9px] text-[#788196] text-[13px] leading-[1.6]">Kho <strong>tài liệu nguồn và kết quả phân tích</strong>. Mở lại một giáo án để xem phân tích cũ hoặc tạo thêm trò chơi khác mà không phải phân tích lại.</p></div><div class="flex gap-[8px] flex-wrap"><button class="border-0 rounded-[9px] px-[15px] py-[11px] inline-flex items-center justify-center gap-[8px] font-bold text-[12px] transition-transform duration-120 hover:-translate-y-[1px] bg-white border border-[#e7eaf2] text-[#515c72]" data-action="import-document">⇧ Nhập giáo án từ tệp</button><button class="border-0 rounded-[9px] px-[15px] py-[11px] inline-flex items-center justify-center gap-[8px] font-bold text-[12px] transition-transform duration-120 hover:-translate-y-[1px] bg-[#6258e8] text-white shadow-[0_6px_14px_#6258e82b]" data-page="create-wizard">✳ Tạo dự án mới</button></div></div>
    <div class="flex gap-[10px] items-center mb-[20px] flex-wrap"><div class="relative flex-1 min-w-[200px]"><input id="librarySearch" placeholder="Tìm theo tên tệp, chủ đề, môn, lớp..." value="${escapeHtml(state.search || '')}" class="w-full px-[13px] py-[11px] pl-[37px] border border-line rounded-[9px] bg-white outline-0 text-[12px]"></div><span class="px-[4px] py-[7px] bg-[#f5f6fa] rounded-[5px] text-[#788196] text-[9px]">${library === null ? 'Đang tải…' : `${docs.length} giáo án`}</span></div>
    <div id="lessonDropzone" class="mb-[16px] border-2 border-dashed border-[#dfe2ed] rounded-[12px] p-[18px] text-center text-[#788196] text-[12px] transition-colors" ondragover="event.preventDefault(); this.classList.add('border-[#6258e8]','bg-[#f4f3ff]')" ondragleave="this.classList.remove('border-[#6258e8]','bg-[#f4f3ff]')" ondrop="handleLessonDrop(event)">Kéo thả tệp giáo án (TXT, MD, DOCX, PDF, PPTX) vào đây</div>
    <section class="bg-white border border-line rounded-[14px] p-[20px]">
      <div class="flex items-center justify-between gap-[12px] mb-[14px]"><div><h3 class="text-[14px] m-0 tracking-[-0.2px]">Tài liệu của tôi</h3><p class="text-[11px] text-[#8b94a6] mt-[4px] mb-0">Tệp nguồn được lưu trên máy. Mở lại để xem kết quả phân tích hoặc tạo trò chơi mới.</p></div><span class="px-[4px] py-[7px] bg-[#f5f6fa] rounded-[5px] text-[#788196] text-[9px]">${library === null ? 'Đang tải…' : `${docs.length} tệp`}</span></div>
      ${library === null
        ? `<div class="p-[30px] text-center text-[#929bad] text-[12px]">Đang tải kho giáo án…</div>`
        : docs.length
          ? `<div class="flex flex-col gap-[12px]">${docs.map(document => lessonLibraryCard(document)).join('')}</div>`
          : `<div class="bg-white border border-dashed border-[#dfe2ed] rounded-[14px] p-[40px] text-center text-[#929bad] flex flex-col items-center justify-center"><div class="text-[42px] mb-[12px]">📄</div><h3 class="text-[#394256] mb-[8px] mt-0">${query ? 'Không tìm thấy giáo án phù hợp' : 'Chưa có giáo án nào'}</h3><p class="max-w-[470px] mx-auto mb-[17px] leading-[1.7] text-[12px]">${query ? 'Thử từ khóa khác hoặc xoá bộ lọc.' : 'Nhập tệp DOCX, PDF, PPTX hoặc TXT để lưu tài liệu nguồn. Kết quả phân tích sẽ được giữ lại để dùng cho nhiều trò chơi.'}</p><button class="border-0 rounded-[9px] px-[15px] py-[11px] inline-flex items-center justify-center gap-[8px] font-bold text-[12px] transition-transform duration-120 hover:-translate-y-[1px] bg-white border border-[#e7eaf2] text-[#515c72]" data-action="import-document">⇧ Nhập giáo án đầu tiên</button></div>`}
    </section>
    <section class="bg-[linear-gradient(135deg,#f8f7ff,#efedff)] border border-[#e4e0ff] rounded-[14px] p-[20px] mt-[18px]">
      <div class="flex items-start gap-[14px]">
        <div class="w-[42px] h-[42px] rounded-[11px] bg-white grid place-items-center text-[20px] shrink-0">💬</div>
        <div class="min-w-0 flex-1">
          <div class="text-[9px] font-extrabold tracking-[1.1px] text-[#8b84d8] mb-[5px]">NGHIÊN CỨU &amp; HỎI ĐÁP CHUYÊN SÂU</div>
          <div class="flex items-center gap-[8px] flex-wrap"><h3 class="text-[14px] m-0 tracking-[-0.2px]">Hỏi đáp chuyên sâu</h3><span class="px-[4px] py-[7px] bg-white text-[#6258e8] rounded-[5px] text-[9px] font-bold">BETA</span></div>
          <p class="text-[12px] text-[#6f7890] leading-[1.7] mt-[7px] mb-[10px]">Hỏi trực tiếp trên nội dung giáo án đã lưu, kèm trích dẫn nguồn. Ưu tiên AI Local; nếu chưa chạy được thì vẫn trả về đoạn liên quan.</p>
          <div class="flex gap-[8px] flex-wrap mb-[8px]">
            <select id="qaDocSelect" class="px-[10px] py-[8px] border border-line rounded-[9px] text-[12px] bg-white min-w-[220px]">${(library && library.documents || []).map(d => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name || 'Tài liệu')}</option>`).join('')}</select>
            <input id="qaQuestion" class="flex-1 min-w-[220px] px-[10px] py-[8px] border border-line rounded-[9px] text-[12px]" placeholder="Nhập câu hỏi về giáo án...">
            <button class="border-0 rounded-[9px] px-[12px] py-[9px] inline-flex items-center gap-[7px] font-bold text-[11px] bg-[#6258e8] text-white" data-action="qa-ask">Hỏi</button>
          </div>
          <div id="qaAnswer" class="text-[12px] text-[#394256] leading-[1.7] bg-white rounded-[10px] border border-[#e4e0ff] p-[12px] hidden"></div>
        </div>
      </div>
    </section>`;
}

function lessonAnalysisDetails(analysis) {
  const objectives = Array.isArray(analysis && analysis.objectives) ? analysis.objectives : [];
  const concepts = Array.isArray(analysis && analysis.keyConcepts) ? analysis.keyConcepts : [];
  if (!objectives.length && !concepts.length) return '';
  return `<details class="mt-[8px] text-[10px] text-[#6f7890]">
    <summary class="cursor-pointer select-none text-[#6258e8] font-semibold">Xem mục tiêu &amp; kiến thức trọng tâm</summary>
    <div class="mt-[7px] grid gap-[8px]">
      ${objectives.length ? `<div><div class="font-bold text-[#596175] mb-[3px]">Mục tiêu</div><ul class="m-0 pl-[17px] leading-[1.65]">${objectives.slice(0, 8).map(item => `<li>${escapeHtml(item.description || '')}</li>`).join('')}</ul></div>` : ''}
      ${concepts.length ? `<div><div class="font-bold text-[#596175] mb-[3px]">Kiến thức trọng tâm</div><ul class="m-0 pl-[17px] leading-[1.65]">${concepts.slice(0, 10).map(item => `<li><strong>${escapeHtml(item.term || '')}</strong>${item.explanation ? ` — ${escapeHtml(item.explanation)}` : ''}</li>`).join('')}</ul></div>` : ''}
    </div>
  </details>`;
}

function lessonLibraryCard(document) {
  const analyses = Array.isArray(document.analyses) ? document.analyses : [];
  const latest = analyses[0] || null;
  const available = document.sourceAvailable !== false;
  const objectiveCount = latest && Array.isArray(latest.objectives) ? latest.objectives.length : 0;
  const conceptCount = latest && Array.isArray(latest.keyConcepts) ? latest.keyConcepts.length : 0;
  const meta = [
    lessonExtLabel(document.ext),
    `${Number(document.characters || 0).toLocaleString('vi-VN')} ký tự`,
    fmtDate(document.createdAt)
  ];
  return `<article class="border border-line rounded-[12px] p-[15px] flex gap-[14px] items-start" data-lesson-id="${escapeHtml(document.id)}">
    <div class="w-[46px] h-[46px] rounded-[11px] grid place-items-center text-[12px] font-extrabold shrink-0 ${lessonExtTone(document.ext)}">${escapeHtml(lessonExtLabel(document.ext))}</div>
    <div class="min-w-0 flex-1">
      <div class="flex items-start justify-between gap-[12px] flex-wrap">
        <div class="min-w-0"><h3 class="text-[13px] m-0 tracking-[-0.1px] break-words">${escapeHtml(document.name || 'Giáo án chưa đặt tên')}</h3><div class="flex gap-[5px] flex-wrap mt-[7px]">${meta.map(value => `<span class="px-[4px] py-[6px] bg-[#f5f6fa] rounded-[5px] text-[#788196] text-[9px]">${escapeHtml(value)}</span>`).join('')}${available ? '<span class="px-[4px] py-[6px] bg-[#edf9f2] text-[#2f8b57] rounded-[5px] text-[9px] font-bold">Sẵn sàng</span>' : '<span class="px-[4px] py-[6px] bg-[#fff1f2] text-[#d84b5a] rounded-[5px] text-[9px] font-bold">Thiếu tệp nguồn</span>'}</div></div>
        <div class="flex gap-[7px] flex-wrap">
          ${latest && available ? `<button class="border-0 rounded-[9px] px-[11px] py-[8px] inline-flex items-center justify-center gap-[8px] font-bold text-[11px] transition-transform duration-120 hover:-translate-y-[1px] bg-[#6258e8] text-white shadow-[0_6px_14px_#6258e82b]" data-action="create-from-lesson" data-id="${escapeHtml(document.id)}" data-analysis="${escapeHtml(latest.id)}">✳ Tạo trò chơi</button>` : ''}
          ${available ? `<button class="border-0 rounded-[9px] px-[11px] py-[8px] inline-flex items-center justify-center gap-[8px] font-bold text-[11px] transition-transform duration-120 hover:-translate-y-[1px] bg-white border border-[#e7eaf2] text-[#515c72]" data-action="open-lesson" data-id="${escapeHtml(document.id)}"${latest ? ` data-analysis="${escapeHtml(latest.id)}"` : ''}>↻ Mở lại</button>` : ''}
        </div>
      </div>
      ${latest
        ? `<div class="mt-[11px] pt-[11px] border-t border-[#f0f1f6]"><div class="text-[9px] font-extrabold tracking-[1.1px] text-[#9aa1b1] mb-[5px]">KẾT QUẢ PHÂN TÍCH</div><div class="text-[11px] text-[#596175] leading-[1.6]"><strong class="text-[#394256]">${escapeHtml(latest.topic || 'Chưa có chủ đề')}</strong>${latest.subject ? ` · ${escapeHtml(latest.subject)}` : ''}${latest.grade ? ` · Lớp ${escapeHtml(String(latest.grade))}` : ''} · ${objectiveCount} mục tiêu · ${conceptCount} khái niệm</div><div class="flex gap-[5px] flex-wrap mt-[7px]">${analyses.slice(0, 4).map((analysis, index) => `<button class="border border-[#e8e9f2] bg-white rounded-[5px] px-[7px] py-[5px] text-[9px] text-[#707a90] hover:border-[#c8c3ff] hover:text-[#6258e8]" ${available ? `data-action="open-lesson" data-id="${escapeHtml(document.id)}" data-analysis="${escapeHtml(analysis.id)}"` : 'disabled'} title="Mở phân tích ${escapeHtml(fmtDateTime(analysis.createdAt))}">${index === 0 ? 'Mới nhất' : fmtDate(analysis.createdAt)}</button>`).join('')}${analyses.length > 4 ? `<span class="text-[9px] text-[#98a0b0] px-[4px] py-[5px]">+${analyses.length - 4}</span>` : ''}</div></div>`
        : `<div class="mt-[11px] pt-[11px] border-t border-[#f0f1f6] text-[11px] text-[#929bad]">Chưa phân tích. Mở giáo án trong trình tạo để phân tích bằng AI local.</div>`}
      ${latest ? lessonAnalysisDetails(latest) : ''}
    </div>
  </article>`;
}
