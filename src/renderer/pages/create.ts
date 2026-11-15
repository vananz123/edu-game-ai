// @ts-nocheck -- migrated legacy UI logic; new contracts are typed in src/shared/types.ts.
// P5: trang "Tạo trò chơi" chỉ tạo THỦ CÔNG (chọn thể loại, đặt luật chơi, mở
// trình chỉnh sửa rồi tự nhập câu hỏi). Mọi tính năng AI đã chuyển sang trang
// "Tạo từ giáo án" (renderCreateWizard) để dữ liệu giáo án chỉ dùng AI local.
function renderCreate() {
  const d = state.draft || {};
  const gameSetup = d.gameSetup || {};
  const setupVal = (key, fallback) => escapeHtml(String(gameSetup[key] ?? fallback));
  // #209: this page now picks the ANSWER law, not the scoring law. #223 dropped the
  // "Giữ hành vi hiện tại" entry, so a draft saved before it always opens on "Thi đấu" —
  // the law it already played by — and is saved as that token.
  const storedScoring = String(gameSetup.scoringMode ?? '');
  const answerMode = answerModeKey(gameSetup);
  const scoringMode = answerMode === 'legacy' ? ANSWER_MODE_COMPETITIVE : ANSWER_MODE_VALUES[answerMode];
  const answerModeChoices = answerModeOptions();
  const answerModeSelected = scoringMode;
  const showSpeedBonus = scoringMode === 'tốc độ';
  const showDifficultyPoints = scoringMode === 'theo độ khó';
  const templateCards = [
    ['quiz','🧠','Đấu trường kiến thức','Trắc nghiệm · Tính điểm · Thi đua','Ôn tập nhanh, củng cố kiến thức, thi đua cá nhân hoặc đội nhóm.','5–10 phút','Khởi động & Ôn tập'],
    ['scenario','🚦','Thử thách tình huống','Tình huống thực tế · Ra quyết định · Phản hồi','Vận dụng kiến thức giải quyết tình huống gần gũi cuộc sống.','5–15 phút','Kỹ năng thực tế'],
    ['matching','🧩','Ghép cặp kiến thức','Ghép thuật ngữ · Tìm định nghĩa · Ghi nhớ','Ghép thuật ngữ với định nghĩa, hình ảnh, ví dụ hoặc đáp án tương ứng.','3–10 phút','Thuật ngữ & Ghi nhớ'],
    ['treasure-hunt','🗺️','Giải mã kho báu','Giải câu đố · Mở khóa · Vượt màn','Xây dựng cốt truyện, chia bài thành chặng, tạo câu đố và manh mối.','10–20 phút','Khám phá chủ đề'],
    ['race','🏁','Đường đua chinh phục','Đua tiến độ · Chiến thuật · Thi đấu đội','Trả lời đúng để tiến thêm ô, ô đặc biệt tăng tốc hoặc câu hỏi bonus.','10–15 phút','Thi đấu đồng đội']
  ];
  const templateDetails = {
    quiz: 'Trả lời lần lượt các câu trắc nghiệm theo nội dung bài học; điểm tính theo đáp án đúng, thời gian và độ khó, có bảng xếp hạng. Hợp: khởi động, ôn tập cuối tiết, kiểm tra kiến thức.',
    scenario: 'Đọc hoặc nghe tình huống rồi chọn cách xử lý; có giải thích vì sao đúng/sai và cách làm tốt hơn. Hợp: kỹ năng sống, an toàn giao thông, môi trường, an toàn số.',
    matching: 'Ghép thuật ngữ với định nghĩa, hình ảnh hoặc ví dụ tương ứng; điểm theo số cặp đúng và thời gian hoàn thành. Hợp: từ vựng, khái niệm khoa học, thuật ngữ CNTT.',
    'treasure-hunt': 'Mỗi màn là một thử thách; trả lời đúng để nhận chìa khóa hoặc manh mối, đủ điều kiện thì mở màn tiếp theo. Hợp: Khoa học tự nhiên, Lịch sử, Địa lý, STEM.',
    race: 'Mỗi đội chọn nhân vật; trả lời đúng để tiến thêm ô, có ô tăng tốc và câu hỏi bonus. Đội về đích trước thắng. Hợp: thi đấu đồng đội.'
  };

  return `<div class="page-head">
    <div class="page-head-title">
      <h1>Tạo trò chơi mới</h1>
      <span class="d-badge d-badge-secondary d-badge-sm font-bold">Thủ công</span>
    </div>
    <div class="page-head-actions">
      <button class="btn btn-secondary btn-small" data-page="library"><span data-icon="arrow-left" data-icon-size="14"></span> Thư viện</button>
      <button class="btn btn-primary btn-small" data-page="create-wizard"><span data-icon="wand-sparkles" data-icon-size="14"></span> Tạo từ giáo án</button>
    </div>
  </div>

  <div class="grid grid-cols-[minmax(0,1fr)_260px] gap-3 items-start">
    <div class="flex flex-col gap-3 min-w-0">

      <!-- Chọn loại trò chơi -->
      <section class="bg-white dark:bg-[#171c32] border border-[#e2e8f0] dark:border-[#2a324b] rounded-xl p-4">
        <div class="flex justify-between items-center mb-3">
          <div class="flex items-center gap-2">
            <span class="text-[#4f46e5] dark:text-[#818cf8]" data-icon="shapes" data-icon-size="17"></span>
            <h3 class="text-[15px] font-bold text-[#1e293b] dark:text-[#f1f5f9] m-0">Chọn loại trò chơi</h3>
          </div>
          <span class="px-2 py-1 bg-[#f1f5f9] dark:bg-[#1e2544] rounded-lg text-[#4f5a6e] dark:text-[#94a3b8] text-[12px] font-semibold">5 mẫu có sẵn</span>
        </div>
        <div class="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-2.5">
          ${templateCards.map(([id,emoji,title,short,desc,duration,purpose])=>`<button type="button" class="border rounded-xl p-3 text-left min-w-0 transition-colors duration-150 cursor-pointer flex gap-2.5 items-start ${state.selectedTemplate===id ? 'border-[#6366f1] bg-[#f8f7ff] dark:bg-[#1e2544] dark:border-[#818cf8] shadow-[0_0_0_2px_rgba(99,102,241,0.15)]' : 'border-[#e2e8f0] dark:border-[#2a324b] bg-white dark:bg-[#171c32] hover:border-[#c7c4ff] dark:hover:border-[#4f46e5]'}" data-template="${id}">
            <span class="text-[26px] leading-none shrink-0 mt-0.5">${emoji}</span>
            <span class="flex flex-col gap-1 min-w-0">
              <div class="flex items-center justify-between gap-1 flex-wrap">
                <strong class="text-[13px] text-[#1e293b] dark:text-[#f1f5f9]">${title}</strong>
                <span class="px-1.5 py-0.5 rounded text-[11px] font-bold bg-[#eef2ff] dark:bg-[#252c4a] text-[#4f46e5] dark:text-[#a5b4fc]">${purpose}</span>
              </div>
              <small class="text-[12px] text-[#4f46e5] font-semibold">${short}</small>
              <small class="text-[12px] text-[#4f5a6e] dark:text-[#94a3b8] leading-snug">${desc}</small>
              <em class="text-[12px] font-bold text-[#4f46e5] not-italic mt-0.5">⏱ ${duration}</em>
            </span>
          </button>`).join('')}
        </div>
        <div class="text-[12px] text-[#4f5a6e] dark:text-[#94a3b8] mt-2.5 leading-relaxed p-2.5 bg-[#f8fafc] dark:bg-[#151a30] rounded-lg border border-[#f1f5f9] dark:border-[#2a324b]">
          ${templateDetails[state.selectedTemplate] || templateDetails.quiz}
        </div>
      </section>

      <!-- Thiết lập trò chơi -->
      <section class="bg-white dark:bg-[#171c32] border border-[#e2e8f0] dark:border-[#2a324b] rounded-xl p-4">
        <div class="flex items-center gap-2 mb-3">
          <span class="text-[#4f46e5] dark:text-[#818cf8]" data-icon="settings" data-icon-size="17"></span>
          <h3 class="text-[15px] font-bold text-[#1e293b] dark:text-[#f1f5f9] m-0">Thiết lập trò chơi</h3>
        </div>

        <div class="grid grid-cols-2 gap-3 mb-3">
          <div class="field"><label class="text-[12px] font-bold text-[#475569] dark:text-[#cbd5e1] mb-1 block">Tên trò chơi</label><input id="gameTitle" class="w-full px-3 py-2 border border-[#cbd5e1] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1e2544] text-[#1e293b] dark:text-[#f8fafc] text-[13px] focus:outline-none focus:border-[#6366f1]" placeholder="Ví dụ: Thử thách giao thông" value="${escapeHtml(d.title||'')}"></div>
          <div class="field"><label class="text-[12px] font-bold text-[#475569] dark:text-[#cbd5e1] mb-1 block">Môn học</label><input id="gameSubject" class="w-full px-3 py-2 border border-[#cbd5e1] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1e2544] text-[#1e293b] dark:text-[#f8fafc] text-[13px] focus:outline-none focus:border-[#6366f1]" placeholder="Ví dụ: Giáo dục công dân" value="${escapeHtml(d.subject||'')}"></div>
        </div>

        <div class="grid grid-cols-2 gap-3 mb-3">
          <div class="field"><label class="text-[12px] font-bold text-[#475569] dark:text-[#cbd5e1] mb-1 block">Lớp</label><select id="gameGrade" class="w-full px-3 py-2 border border-[#cbd5e1] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1e2544] text-[#1e293b] dark:text-[#f8fafc] text-[13px] focus:outline-none focus:border-[#6366f1]"><option value="">Chọn lớp</option>${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${(d.grade||'7')==String(i+1)?'selected':''}>Lớp ${i+1}</option>`).join('')}</select></div>
          <div class="field"><label class="text-[12px] font-bold text-[#475569] dark:text-[#cbd5e1] mb-1 block">Số câu hỏi</label><select id="questionCount" class="w-full px-3 py-2 border border-[#cbd5e1] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1e2544] text-[#1e293b] dark:text-[#f8fafc] text-[13px] focus:outline-none focus:border-[#6366f1]">${[5,8,10,15].map(n=>`<option value="${n}" ${Number(d.questionCount||8)===n?'selected':''}>${n} câu</option>`).join('')}</select></div>
        </div>

        <details class="create-advanced-options border border-[#e2e8f0] dark:border-[#2a324b] rounded-xl bg-[#f8fafc] dark:bg-[#151a30] p-3 text-[#1e293b] dark:text-[#f1f5f9] transition-all">
          <summary class="cursor-pointer text-[12px] font-bold text-[#4f46e5] dark:text-[#818cf8] flex items-center justify-between select-none list-none">
            <span class="flex items-center gap-2">
              <span data-icon="sliders-horizontal" data-icon-size="14"></span>
              Tùy chọn nâng cao (Luật chơi, tính điểm, thi đấu)
            </span>
            <span class="text-[11px] text-[#5f6a7d] dark:text-[#94a3b8] font-normal">Bấm để mở rộng / thu gọn ▾</span>
          </summary>
          <div class="mt-3 pt-3 border-t border-[#e2e8f0] dark:border-[#2a324b] flex flex-col gap-3">
            <div class="grid grid-cols-3 gap-3">
              <div class="field"><label class="text-[12px] font-bold text-[#475569] dark:text-[#cbd5e1] mb-1 block">Cách trả lời</label><select id="setupScoringMode" class="w-full px-3 py-2 border border-[#cbd5e1] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1e2544] text-[#1e293b] dark:text-[#f8fafc] text-[13px] focus:outline-none focus:border-[#6366f1]">${answerModeChoices.map(choice => `<option value="${choice.value}" ${answerModeSelected===choice.value?'selected':''}>${escapeHtml(choice.label)}</option>`).join('')}</select></div>
              <div class="field"><label class="text-[12px] font-bold text-[#475569] dark:text-[#cbd5e1] mb-1 block">Độ khó</label><select id="setupDifficulty" class="w-full px-3 py-2 border border-[#cbd5e1] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1e2544] text-[#1e293b] dark:text-[#f8fafc] text-[13px] focus:outline-none focus:border-[#6366f1]"><option value="dễ" ${String(gameSetup.difficulty??'trung bình')==='dễ'?'selected':''}>Dễ</option><option value="trung bình" ${String(gameSetup.difficulty??'trung bình')==='trung bình'?'selected':''}>Trung bình</option><option value="khó" ${String(gameSetup.difficulty??'trung bình')==='khó'?'selected':''}>Khó</option></select></div>
              <div class="field"><label class="text-[12px] font-bold text-[#475569] dark:text-[#cbd5e1] mb-1 block">Thời lượng (phút)</label><input id="setupDuration" class="w-full px-3 py-2 border border-[#cbd5e1] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1e2544] text-[#1e293b] dark:text-[#f8fafc] text-[13px] focus:outline-none focus:border-[#6366f1]" type="number" min="1" max="60" value="${setupVal('duration','10')}"></div>
            </div>

            <div class="grid grid-cols-3 gap-3">
              <div class="field"><label class="text-[12px] font-bold text-[#475569] dark:text-[#cbd5e1] mb-1 block">Điểm / câu đúng</label><input id="setupPoints" class="w-full px-3 py-2 border border-[#cbd5e1] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1e2544] text-[#1e293b] dark:text-[#f8fafc] text-[13px] focus:outline-none focus:border-[#6366f1]" type="number" min="10" max="1000" step="10" value="${setupVal('pointsPerCorrect','100')}"></div>
              <div class="field"><label class="text-[12px] font-bold text-[#475569] dark:text-[#cbd5e1] mb-1 block">Phong cách</label><select id="setupStyle" class="w-full px-3 py-2 border border-[#cbd5e1] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1e2544] text-[#1e293b] dark:text-[#f8fafc] text-[13px] focus:outline-none focus:border-[#6366f1]"><option value="giáo dục" ${String(gameSetup.style??'giáo dục')==='giáo dục'?'selected':''}>Giáo dục</option><option value="trò chơi" ${String(gameSetup.style??'giáo dục')==='trò chơi'?'selected':''}>Trò chơi</option><option value="thi đua" ${String(gameSetup.style??'giáo dục')==='thi đua'?'selected':''}>Thi đua</option></select></div>
              <div class="field"><label class="text-[12px] font-bold text-[#475569] dark:text-[#cbd5e1] mb-1 block">Số người chơi</label><select id="setupPlayers" class="w-full px-3 py-2 border border-[#cbd5e1] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1e2544] text-[#1e293b] dark:text-[#f8fafc] text-[13px] focus:outline-none focus:border-[#6366f1]"><option value="cá nhân" ${String(gameSetup.players??'cá nhân')==='cá nhân'?'selected':''}>Cá nhân</option><option value="đội nhóm" ${String(gameSetup.players??'cá nhân')==='đội nhóm'?'selected':''}>Đội nhóm</option></select></div>
            </div>

            <div class="grid grid-cols-3 gap-3">
              <div class="field"><label class="text-[12px] font-bold text-[#475569] dark:text-[#cbd5e1] mb-1 block">Chế độ thi đấu</label><select id="setupCompetition" class="w-full px-3 py-2 border border-[#cbd5e1] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1e2544] text-[#1e293b] dark:text-[#f8fafc] text-[13px] focus:outline-none focus:border-[#6366f1]"><option value="không" ${String(gameSetup.competition??'không')==='không'?'selected':''}>Không thi đua</option><option value="bảng xếp hạng" ${String(gameSetup.competition??'không')==='bảng xếp hạng'?'selected':''}>Bảng xếp hạng</option><option value="thi đấu trực tiếp" ${String(gameSetup.competition??'không')==='thi đấu trực tiếp'?'selected':''}>Thi đấu trực tiếp</option></select></div>
              <div class="field${showSpeedBonus?'':' hidden'}" id="timeBonusField"><label class="text-[12px] font-bold text-[#475569] dark:text-[#cbd5e1] mb-1 block">Điểm thưởng nhanh (tối đa 50)</label><input id="setupTimeBonus" class="w-full px-3 py-2 border border-[#cbd5e1] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1e2544] text-[#1e293b] dark:text-[#f8fafc] text-[13px] focus:outline-none focus:border-[#6366f1]" type="number" min="0" max="50" step="5" value="${setupVal('timeBonus','20')}"></div>
              <div class="field${showDifficultyPoints?'':' hidden'}" id="pointsEasyField"><label class="text-[12px] font-bold text-[#475569] dark:text-[#cbd5e1] mb-1 block">Điểm · Dễ</label><input id="setupPointsEasy" class="w-full px-3 py-2 border border-[#cbd5e1] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1e2544] text-[#1e293b] dark:text-[#f8fafc] text-[13px] focus:outline-none focus:border-[#6366f1]" type="number" min="0" max="1000" step="10" value="${setupVal('pointsEasy','100')}"></div>
            </div>

            <div class="grid grid-cols-3 gap-3" id="pointsDifficultyGrid">
              <div class="field" id="pointsMediumField"><label class="text-[12px] font-bold text-[#475569] dark:text-[#cbd5e1] mb-1 block">Điểm · Trung bình</label><input id="setupPointsMedium" class="w-full px-3 py-2 border border-[#cbd5e1] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1e2544] text-[#1e293b] dark:text-[#f8fafc] text-[13px] focus:outline-none focus:border-[#6366f1]" type="number" min="0" max="1000" step="10" value="${setupVal('pointsMedium','200')}"></div>
              <div class="field" id="pointsHardField"><label class="text-[12px] font-bold text-[#475569] dark:text-[#cbd5e1] mb-1 block">Điểm · Khó</label><input id="setupPointsHard" class="w-full px-3 py-2 border border-[#cbd5e1] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1e2544] text-[#1e293b] dark:text-[#f8fafc] text-[13px] focus:outline-none focus:border-[#6366f1]" type="number" min="0" max="1000" step="10" value="${setupVal('pointsHard','300')}"></div>
            </div>

            <div class="text-[12px] text-[#4f5a6e] dark:text-[#94a3b8] leading-relaxed p-3 bg-white dark:bg-[#1a1f3a] rounded-lg border border-[#f1f5f9] dark:border-[#2a324b]" id="scoringModeHint">${answerModeHint(answerMode)}</div>
            <div class="text-[12px] text-[#4f5a6e] dark:text-[#94a3b8] leading-relaxed" title="Dùng chung một trường lưu với Chế độ tính điểm cũ. Điểm mỗi câu lấy từ Điểm / câu đúng hoặc điểm riêng của câu. Giải thích hiện qua nút Giải thích sau khi câu kết thúc. Game tạo trước đây mở với Thi đấu — đúng luật nó đã chơi — và lưu lại theo cách trả lời đó.">"Cách trả lời" thay cho "Chế độ tính điểm" cũ; game cũ mở với "Thi đấu".</div>
          </div>
        </details>
      </section>

      <!-- Mở trình chỉnh sửa -->
      <section class="bg-white dark:bg-[#171c32] border border-[#e2e8f0] dark:border-[#2a324b] rounded-xl p-4">
        <div class="flex items-center gap-2 mb-2.5">
          <span class="text-[#4f46e5] dark:text-[#818cf8]" data-icon="pencil" data-icon-size="17"></span>
          <h3 class="text-[15px] font-bold text-[#1e293b] dark:text-[#f1f5f9] m-0">Soạn nội dung & Mở trình chỉnh sửa</h3>
          <span class="ml-auto px-2 py-0.5 bg-[#f1f5f9] dark:bg-[#1e2544] rounded text-[12px] font-semibold text-[#4f5a6e] dark:text-[#94a3b8]">Không dùng AI</span>
        </div>
        <div class="flex gap-3 items-start bg-[#f8f7ff] dark:bg-[#1a1f3a] border border-dashed border-[#c7c4ff] dark:border-[#4f46e5] rounded-xl p-3 mb-3">
          <span class="shrink-0 text-[#5f6a7d]" data-icon="info" data-icon-size="18"></span>
          <div class="min-w-0">
            <strong class="text-[13px] text-[#1e293b] dark:text-[#f1f5f9] block mb-1">Bạn tự nhập câu hỏi, phương án và đáp án đúng</strong>
            <small class="text-[12px] text-[#4f5a6e] dark:text-[#94a3b8] leading-relaxed block">Trình chỉnh sửa mở trống theo thể loại đã chọn. Không cần AI, không cần Internet.</small>
          </div>
        </div>
        <div class="flex items-center gap-3 flex-wrap">
          <button class="btn btn-primary !py-2 !px-4 !text-[13px] !font-bold" id="generateBtn"><span data-icon="pencil" data-icon-size="15"></span> Mở trình chỉnh sửa câu hỏi</button>
          <button class="btn btn-secondary" id="previewManualBtn"><span data-icon="eye" data-icon-size="14"></span> Xem trước mẫu trống</button>
        </div>
        <div class="text-[12px] text-[#4f5a6e] dark:text-[#94a3b8] mt-2.5 leading-relaxed" title="Sau khi lưu, vào Dự án của tôi để chạy thử như học sinh, tiếp tục chỉnh sửa và xuất gói .egame chạy ngoại tuyến.">Lưu xong, vào "Dự án của tôi" để chạy thử, chỉnh sửa tiếp hoặc xuất gói .egame ngoại tuyến.</div>
      </section>

    </div>

    <!-- Sidebar -->
    <aside class="flex flex-col gap-3">
      <section class="bg-white dark:bg-[#171c32] border border-[#e2e8f0] dark:border-[#2a324b] rounded-xl p-4">
        <h3 class="text-[14px] font-bold text-[#1e293b] dark:text-[#f1f5f9] m-0 mb-1">Quy trình thủ công</h3>
        <div class="text-[12px] text-[#4f5a6e] dark:text-[#94a3b8] mb-3">Tự soạn nội dung, không cần AI.</div>
        <div class="flex flex-col gap-2">
          <div class="flex items-center gap-2.5" title="Chọn 1 trong 5 mẫu phù hợp với mục tiêu tiết học.">
            <div class="w-6 h-6 rounded-md bg-[#eef2ff] dark:bg-[#262c55] text-[#4f46e5] dark:text-[#a5b4fc] grid place-items-center text-[12px] font-bold shrink-0">1</div>
            <strong class="text-[12px] text-[#1e293b] dark:text-[#f1f5f9] min-w-0">Chọn thể loại</strong>
          </div>
          <div class="flex items-center gap-2.5" title="Điểm số, độ khó, thời lượng, số người chơi và thi đấu.">
            <div class="w-6 h-6 rounded-md bg-[#eef2ff] dark:bg-[#262c55] text-[#4f46e5] dark:text-[#a5b4fc] grid place-items-center text-[12px] font-bold shrink-0">2</div>
            <strong class="text-[12px] text-[#1e293b] dark:text-[#f1f5f9] min-w-0">Thiết lập luật chơi</strong>
          </div>
          <div class="flex items-center gap-2.5" title="Mở trình chỉnh sửa và điền câu hỏi, phương án, đáp án đúng, giải thích.">
            <div class="w-6 h-6 rounded-md bg-[#eef2ff] dark:bg-[#262c55] text-[#4f46e5] dark:text-[#a5b4fc] grid place-items-center text-[12px] font-bold shrink-0">3</div>
            <strong class="text-[12px] text-[#1e293b] dark:text-[#f1f5f9] min-w-0">Tự nhập câu hỏi</strong>
          </div>
          <div class="flex items-center gap-2.5" title="Game đã lưu không cần mạng, có thể xuất qua USB.">
            <div class="w-6 h-6 rounded-md bg-[#eef2ff] dark:bg-[#262c55] text-[#4f46e5] dark:text-[#a5b4fc] grid place-items-center text-[12px] font-bold shrink-0">4</div>
            <strong class="text-[12px] text-[#1e293b] dark:text-[#f1f5f9] min-w-0">Chơi và lưu kết quả</strong>
          </div>
        </div>
      </section>

      <section class="bg-[#f8f7ff] border border-[#e4e0ff] rounded-xl p-4">
        <h3 class="text-[13px] font-bold text-[#1e293b] m-0 mb-1">Muốn dùng AI?</h3>
        <div class="text-[12px] text-[#5f6a7d] mb-3 leading-relaxed">AI phân tích giáo án và gợi ý trò chơi, chạy trên máy bằng llama.cpp.</div>
        <button class="btn btn-primary btn-small w-full" data-page="create-wizard"><span data-icon="wand-sparkles" data-icon-size="14"></span> Tạo trò chơi từ giáo án</button>
      </section>

      <section class="bg-white dark:bg-[#171c32] border border-[#e2e8f0] dark:border-[#2a324b] rounded-xl p-4">
        <h3 class="text-[13px] font-bold text-[#1e293b] dark:text-[#f1f5f9] m-0 mb-3">Trạng thái hệ thống</h3>
        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between py-1.5">
            <div class="flex items-center gap-2">
              <span class="text-[#5f6a7d]" data-icon="save" data-icon-size="15"></span>
              <div>
                <strong class="text-[12px] text-[#1e293b] dark:text-[#f1f5f9] block">Thư viện cục bộ</strong>
                <small class="text-[12px] text-[#5a6478]">Đang lưu trên máy này</small>
              </div>
            </div>
            <span class="px-2 py-0.5 bg-[#effaf5] dark:bg-[#132d24] text-[#0f7b5c] dark:text-[#4ade80] rounded text-[12px] font-semibold">Sẵn sàng</span>
          </div>
          <div class="flex items-center justify-between py-1.5">
            <div class="flex items-center gap-2">
              <span class="text-[#5f6a7d]" data-icon="play" data-icon-size="15"></span>
              <div>
                <strong class="text-[12px] text-[#1e293b] dark:text-[#f1f5f9] block">Game runtime</strong>
                <small class="text-[12px] text-[#5a6478]">5 mẫu giao diện</small>
              </div>
            </div>
            <span class="px-2 py-0.5 bg-[#f1f5f9] dark:bg-[#1e2544] text-[#475569] dark:text-[#cbd5e1] rounded text-[12px] font-semibold">v1</span>
          </div>
        </div>
      </section>
    </aside>
  </div>`;
}
