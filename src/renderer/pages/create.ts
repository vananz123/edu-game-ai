// @ts-nocheck -- migrated legacy UI logic; new contracts are typed in src/shared/types.ts.
// P5: trang "Tạo trò chơi" chỉ tạo THỦ CÔNG (chọn thể loại, đặt luật chơi, mở
// trình chỉnh sửa rồi tự nhập câu hỏi). Mọi tính năng AI đã chuyển sang trang
// "Tạo từ giáo án" (renderCreateWizard) để dữ liệu giáo án chỉ dùng AI local.
function renderCreate() {
  const d = state.draft || {};
  const gameSetup = d.gameSetup || {};
  const setupVal = (key, fallback) => escapeHtml(String(gameSetup[key] ?? fallback));
  const scoringMode = String(gameSetup.scoringMode ?? 'tốc độ');
  const showSpeedBonus = scoringMode === 'tốc độ';
  const showDifficultyPoints = scoringMode === 'theo độ khó';
  const templateCards = [
    ['quiz','🧠','Đấu trường kiến thức','Trắc nghiệm · Tính điểm · Thi đua','Ôn tập nhanh, củng cố kiến thức, thi đua cá nhân hoặc đội nhóm.','5–10 phút'],
    ['scenario','🚦','Thử thách tình huống','Tình huống thực tế · Ra quyết định · Phản hồi','Vận dụng kiến thức giải quyết tình huống gần gũi cuộc sống.','5–15 phút'],
    ['matching','🧩','Ghép cặp kiến thức','Ghép thuật ngữ · Tìm định nghĩa · Ghi nhớ','Ghép thuật ngữ với định nghĩa, hình ảnh, ví dụ hoặc đáp án tương ứng.','3–10 phút'],
    ['treasure-hunt','🗺️','Giải mã kho báu','Giải câu đố · Mở khóa · Vượt màn','Xây dựng cốt truyện, chia bài thành chặng, tạo câu đố và manh mối.','10–20 phút'],
    ['race','🏁','Đường đua chinh phục','Đua tiến độ · Chiến thuật · Thi đấu đội','Trả lời đúng để tiến thêm ô, ô đặc biệt tăng tốc hoặc câu hỏi bonus.','10–15 phút']
  ];
  const templateDetails = {
    quiz: 'Cách chơi: Học sinh trả lời lần lượt các câu hỏi trắc nghiệm từ nội dung bài học. Cơ chế: Tính điểm theo đáp án đúng, thời gian và độ khó; có bảng xếp hạng. Phù hợp: Khởi động bài học, ôn tập cuối tiết, kiểm tra kiến thức. Thời lượng gợi ý: 5–10 phút.',
    scenario: 'Cách chơi: Đọc hoặc nghe tình huống, chọn cách xử lý phù hợp. Cơ chế: Giải thích vì sao lựa chọn đúng hoặc sai, phân tích hậu quả và cách xử lý tốt hơn. Phù hợp: Giáo dục kỹ năng sống, an toàn giao thông, môi trường, an toàn số. Thời lượng gợi ý: 5–15 phút.',
    matching: 'Cách chơi: Ghép thuật ngữ với định nghĩa, hình ảnh, ví dụ hoặc đáp án tương ứng. Cơ chế: Tính điểm theo số cặp đúng, thời gian hoàn thành và số lần thử. Phù hợp: Từ vựng, khái niệm khoa học, thuật ngữ CNTT, công thức và phân loại. Thời lượng gợi ý: 3–10 phút.',
    'treasure-hunt': 'Cách chơi: Mỗi màn là một thử thách kiến thức hoặc nhiệm vụ nhỏ; trả lời đúng để nhận chìa khóa, manh mối hoặc vật phẩm, hoàn thành đủ để mở màn tiếp theo. Phù hợp: Khoa học tự nhiên, Lịch sử, Địa lý, Tin học, STEM. Thời lượng gợi ý: 10–20 phút.',
    race: 'Cách chơi: Mỗi đội chọn nhân vật hoặc phương tiện đại diện; trả lời đúng để tiến thêm số ô tương ứng, có ô tăng tốc, câu hỏi bonus hoặc thử thách phụ. Đội về đích trước hoặc đạt mục tiêu sau số lượt quy định sẽ thắng. Thời lượng gợi ý: 10–15 phút.'
  };

  return `<div class="flex items-center justify-between gap-4 mb-6 flex-wrap pb-4 border-b border-[#f1f5f9] dark:border-[#2a324b]">
    <div>
      <div class="flex items-center gap-2 mb-1">
        <span class="d-badge d-badge-secondary d-badge-sm font-bold">THỦ CÔNG</span>
        <h1 class="text-[22px] tracking-[-0.5px] m-0 font-extrabold text-[#1e293b] dark:text-[#f1f5f9]">Tạo trò chơi mới</h1>
      </div>
      <p class="mt-1 text-[12px] text-[#64748b] dark:text-[#94a3b8] leading-relaxed m-0">
        Chọn thể loại · Thiết lập luật chơi · Tự nhập câu hỏi · Xem trước và lưu. Trang này không dùng AI.
      </p>
    </div>
    <div class="flex items-center gap-2">
      <button class="btn btn-secondary btn-small" data-page="library">← Thư viện</button>
      <button class="btn btn-primary btn-small" data-page="create-wizard">🪄 Tạo từ giáo án</button>
    </div>
  </div>

  <div class="grid grid-cols-[minmax(0,1fr)_280px] gap-5 items-start">
    <div class="flex flex-col gap-5 min-w-0">

      <!-- Chọn loại trò chơi -->
      <section class="bg-white dark:bg-[#171c32] border border-[#e2e8f0] dark:border-[#2a324b] rounded-2xl p-5">
        <div class="flex justify-between items-center mb-4">
          <div class="flex items-center gap-2">
            <span class="text-[18px]">🎮</span>
            <h3 class="text-[15px] font-bold text-[#1e293b] dark:text-[#f1f5f9] m-0">Chọn loại trò chơi</h3>
          </div>
          <span class="px-2 py-1 bg-[#f1f5f9] dark:bg-[#1e2544] rounded-lg text-[#64748b] dark:text-[#94a3b8] text-[10px] font-semibold">5 mẫu có sẵn</span>
        </div>
        <div class="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-3">
          ${templateCards.map(([id,emoji,title,short,desc,duration])=>`<button type="button" class="border rounded-xl p-4 text-left min-w-0 transition-all duration-150 cursor-pointer flex gap-3 items-start ${state.selectedTemplate===id ? 'border-[#6366f1] bg-[#f8f7ff] dark:bg-[#1e2544] dark:border-[#818cf8] shadow-[0_0_0_2px_rgba(99,102,241,0.15)]' : 'border-[#e2e8f0] dark:border-[#2a324b] bg-white dark:bg-[#171c32] hover:border-[#c7c4ff] dark:hover:border-[#4f46e5] hover:-translate-y-[1px]'}" data-template="${id}">
            <span class="text-[28px] leading-none shrink-0 mt-0.5">${emoji}</span>
            <span class="flex flex-col gap-1 min-w-0">
              <strong class="text-[13px] text-[#1e293b] dark:text-[#f1f5f9]">${title}</strong>
              <small class="text-[10px] text-[#818cf8] font-semibold">${short}</small>
              <small class="text-[11px] text-[#64748b] dark:text-[#94a3b8] leading-snug">${desc}</small>
              <em class="text-[10px] font-bold text-[#6366f1] not-italic mt-0.5">⏱ ${duration}</em>
            </span>
          </button>`).join('')}
        </div>
        <div class="text-[11px] text-[#94a3b8] dark:text-[#64748b] mt-3 leading-relaxed p-3 bg-[#f8fafc] dark:bg-[#151a30] rounded-lg border border-[#f1f5f9] dark:border-[#2a324b]">
          ${templateDetails[state.selectedTemplate] || templateDetails.quiz}
        </div>
      </section>

      <!-- Thiết lập trò chơi -->
      <section class="bg-white dark:bg-[#171c32] border border-[#e2e8f0] dark:border-[#2a324b] rounded-2xl p-5">
        <div class="flex items-center gap-2 mb-4">
          <span class="text-[18px]">⚙️</span>
          <h3 class="text-[15px] font-bold text-[#1e293b] dark:text-[#f1f5f9] m-0">Thiết lập trò chơi</h3>
        </div>

        <div class="grid grid-cols-2 gap-3 mb-3">
          <div class="field"><label class="text-[10px] font-bold text-[#475569] dark:text-[#cbd5e1] mb-1 block">TÊN TRÒ CHƠI</label><input id="gameTitle" class="w-full px-3 py-2 border border-[#cbd5e1] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1e2544] text-[#1e293b] dark:text-[#f8fafc] text-[13px] focus:outline-none focus:border-[#6366f1]" placeholder="Ví dụ: Thử thách giao thông" value="${escapeHtml(d.title||'')}"></div>
          <div class="field"><label class="text-[10px] font-bold text-[#475569] dark:text-[#cbd5e1] mb-1 block">MÔN HỌC</label><input id="gameSubject" class="w-full px-3 py-2 border border-[#cbd5e1] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1e2544] text-[#1e293b] dark:text-[#f8fafc] text-[13px] focus:outline-none focus:border-[#6366f1]" placeholder="Ví dụ: Giáo dục công dân" value="${escapeHtml(d.subject||'')}"></div>
        </div>

        <div class="grid grid-cols-2 gap-3 mb-3">
          <div class="field"><label class="text-[10px] font-bold text-[#475569] dark:text-[#cbd5e1] mb-1 block">LỚP</label><select id="gameGrade" class="w-full px-3 py-2 border border-[#cbd5e1] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1e2544] text-[#1e293b] dark:text-[#f8fafc] text-[13px] focus:outline-none focus:border-[#6366f1]"><option value="">Chọn lớp</option>${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${(d.grade||'7')==String(i+1)?'selected':''}>Lớp ${i+1}</option>`).join('')}</select></div>
          <div class="field"><label class="text-[10px] font-bold text-[#475569] dark:text-[#cbd5e1] mb-1 block">SỐ CÂU HỎI</label><select id="questionCount" class="w-full px-3 py-2 border border-[#cbd5e1] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1e2544] text-[#1e293b] dark:text-[#f8fafc] text-[13px] focus:outline-none focus:border-[#6366f1]">${[5,8,10,15].map(n=>`<option value="${n}" ${Number(d.questionCount||8)===n?'selected':''}>${n} câu</option>`).join('')}</select></div>
        </div>

        <div class="grid grid-cols-3 gap-3 mb-3">
          <div class="field"><label class="text-[10px] font-bold text-[#475569] dark:text-[#cbd5e1] mb-1 block">CHẾ ĐỘ TÍNH ĐIỂM</label><select id="setupScoringMode" class="w-full px-3 py-2 border border-[#cbd5e1] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1e2544] text-[#1e293b] dark:text-[#f8fafc] text-[13px] focus:outline-none focus:border-[#6366f1]"><option value="cơ bản" ${scoringMode==='cơ bản'?'selected':''}>Cơ bản</option><option value="tốc độ" ${scoringMode==='tốc độ'?'selected':''}>Tốc độ</option><option value="theo độ khó" ${scoringMode==='theo độ khó'?'selected':''}>Theo độ khó</option><option value="thi đấu đội" ${scoringMode==='thi đấu đội'?'selected':''}>Thi đấu đội</option><option value="luyện tập" ${scoringMode==='luyện tập'?'selected':''}>Luyện tập</option></select></div>
          <div class="field"><label class="text-[10px] font-bold text-[#475569] dark:text-[#cbd5e1] mb-1 block">ĐỘ KHÓ</label><select id="setupDifficulty" class="w-full px-3 py-2 border border-[#cbd5e1] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1e2544] text-[#1e293b] dark:text-[#f8fafc] text-[13px] focus:outline-none focus:border-[#6366f1]"><option value="dễ" ${String(gameSetup.difficulty??'trung bình')==='dễ'?'selected':''}>Dễ</option><option value="trung bình" ${String(gameSetup.difficulty??'trung bình')==='trung bình'?'selected':''}>Trung bình</option><option value="khó" ${String(gameSetup.difficulty??'trung bình')==='khó'?'selected':''}>Khó</option></select></div>
          <div class="field"><label class="text-[10px] font-bold text-[#475569] dark:text-[#cbd5e1] mb-1 block">THỜI LƯỢNG (PHÚT)</label><input id="setupDuration" class="w-full px-3 py-2 border border-[#cbd5e1] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1e2544] text-[#1e293b] dark:text-[#f8fafc] text-[13px] focus:outline-none focus:border-[#6366f1]" type="number" min="1" max="60" value="${setupVal('duration','10')}"></div>
        </div>

        <div class="grid grid-cols-3 gap-3 mb-3">
          <div class="field"><label class="text-[10px] font-bold text-[#475569] dark:text-[#cbd5e1] mb-1 block">ĐIỂM / CÂU ĐÚNG</label><input id="setupPoints" class="w-full px-3 py-2 border border-[#cbd5e1] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1e2544] text-[#1e293b] dark:text-[#f8fafc] text-[13px] focus:outline-none focus:border-[#6366f1]" type="number" min="10" max="1000" step="10" value="${setupVal('pointsPerCorrect','100')}"></div>
          <div class="field"><label class="text-[10px] font-bold text-[#475569] dark:text-[#cbd5e1] mb-1 block">PHONG CÁCH</label><select id="setupStyle" class="w-full px-3 py-2 border border-[#cbd5e1] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1e2544] text-[#1e293b] dark:text-[#f8fafc] text-[13px] focus:outline-none focus:border-[#6366f1]"><option value="giáo dục" ${String(gameSetup.style??'giáo dục')==='giáo dục'?'selected':''}>Giáo dục</option><option value="trò chơi" ${String(gameSetup.style??'giáo dục')==='trò chơi'?'selected':''}>Trò chơi</option><option value="thi đua" ${String(gameSetup.style??'giáo dục')==='thi đua'?'selected':''}>Thi đua</option></select></div>
          <div class="field"><label class="text-[10px] font-bold text-[#475569] dark:text-[#cbd5e1] mb-1 block">SỐ NGƯỜI CHƠI</label><select id="setupPlayers" class="w-full px-3 py-2 border border-[#cbd5e1] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1e2544] text-[#1e293b] dark:text-[#f8fafc] text-[13px] focus:outline-none focus:border-[#6366f1]"><option value="cá nhân" ${String(gameSetup.players??'cá nhân')==='cá nhân'?'selected':''}>Cá nhân</option><option value="đội nhóm" ${String(gameSetup.players??'cá nhân')==='đội nhóm'?'selected':''}>Đội nhóm</option></select></div>
        </div>

        <div class="grid grid-cols-3 gap-3 mb-3">
          <div class="field"><label class="text-[10px] font-bold text-[#475569] dark:text-[#cbd5e1] mb-1 block">CHẾ ĐỘ THI ĐẤU</label><select id="setupCompetition" class="w-full px-3 py-2 border border-[#cbd5e1] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1e2544] text-[#1e293b] dark:text-[#f8fafc] text-[13px] focus:outline-none focus:border-[#6366f1]"><option value="không" ${String(gameSetup.competition??'không')==='không'?'selected':''}>Không thi đua</option><option value="bảng xếp hạng" ${String(gameSetup.competition??'không')==='bảng xếp hạng'?'selected':''}>Bảng xếp hạng</option><option value="thi đấu trực tiếp" ${String(gameSetup.competition??'không')==='thi đấu trực tiếp'?'selected':''}>Thi đấu trực tiếp</option></select></div>
          <div class="field${showSpeedBonus?'':' hidden'}" id="timeBonusField"><label class="text-[10px] font-bold text-[#475569] dark:text-[#cbd5e1] mb-1 block">ĐIỂM THƯỞNG NHANH (TỐI ĐA 50)</label><input id="setupTimeBonus" class="w-full px-3 py-2 border border-[#cbd5e1] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1e2544] text-[#1e293b] dark:text-[#f8fafc] text-[13px] focus:outline-none focus:border-[#6366f1]" type="number" min="0" max="50" step="5" value="${setupVal('timeBonus','20')}"></div>
          <div class="field${showDifficultyPoints?'':' hidden'}" id="pointsEasyField"><label class="text-[10px] font-bold text-[#475569] dark:text-[#cbd5e1] mb-1 block">ĐIỂM · DỄ</label><input id="setupPointsEasy" class="w-full px-3 py-2 border border-[#cbd5e1] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1e2544] text-[#1e293b] dark:text-[#f8fafc] text-[13px] focus:outline-none focus:border-[#6366f1]" type="number" min="0" max="1000" step="10" value="${setupVal('pointsEasy','100')}"></div>
        </div>

        <div class="grid grid-cols-3 gap-3 mb-3" id="pointsDifficultyGrid">
          <div class="field" id="pointsMediumField"><label class="text-[10px] font-bold text-[#475569] dark:text-[#cbd5e1] mb-1 block">ĐIỂM · TRUNG BÌNH</label><input id="setupPointsMedium" class="w-full px-3 py-2 border border-[#cbd5e1] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1e2544] text-[#1e293b] dark:text-[#f8fafc] text-[13px] focus:outline-none focus:border-[#6366f1]" type="number" min="0" max="1000" step="10" value="${setupVal('pointsMedium','200')}"></div>
          <div class="field" id="pointsHardField"><label class="text-[10px] font-bold text-[#475569] dark:text-[#cbd5e1] mb-1 block">ĐIỂM · KHÓ</label><input id="setupPointsHard" class="w-full px-3 py-2 border border-[#cbd5e1] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1e2544] text-[#1e293b] dark:text-[#f8fafc] text-[13px] focus:outline-none focus:border-[#6366f1]" type="number" min="0" max="1000" step="10" value="${setupVal('pointsHard','300')}"></div>
        </div>

        <div class="text-[11px] text-[#64748b] dark:text-[#94a3b8] leading-relaxed p-3 bg-[#f8fafc] dark:bg-[#151a30] rounded-lg border border-[#f1f5f9] dark:border-[#2a324b]" id="scoringModeHint">${scoringModeHint(scoringMode)}</div>
        <div class="text-[10px] text-[#94a3b8] dark:text-[#64748b] mt-2 leading-relaxed">Trả lời sai không bị trừ điểm; xem lại giải thích sau mỗi câu. "Tốc độ" cộng điểm nhanh tối đa 50; "Theo độ khó" dùng bảng điểm dễ 100 · trung bình 200 · khó 300; "Luyện tập" bỏ áp lực thời gian. Giáo viên có thể sửa luật trong trình chỉnh sửa.</div>
      </section>

      <!-- Mở trình chỉnh sửa -->
      <section class="bg-white dark:bg-[#171c32] border border-[#e2e8f0] dark:border-[#2a324b] rounded-2xl p-5">
        <div class="flex items-center gap-2 mb-3">
          <span class="text-[18px]">✏️</span>
          <h3 class="text-[15px] font-bold text-[#1e293b] dark:text-[#f1f5f9] m-0">Soạn nội dung & Mở trình chỉnh sửa</h3>
          <span class="ml-auto px-2 py-0.5 bg-[#f1f5f9] dark:bg-[#1e2544] rounded text-[10px] font-semibold text-[#64748b] dark:text-[#94a3b8]">Không dùng AI</span>
        </div>
        <div class="flex gap-3 items-start bg-[#f8f7ff] dark:bg-[#1a1f3a] border border-dashed border-[#c7c4ff] dark:border-[#4f46e5] rounded-xl p-4 mb-4">
          <span class="text-[22px] shrink-0">✏</span>
          <div class="min-w-0">
            <strong class="text-[13px] text-[#1e293b] dark:text-[#f1f5f9] block mb-1">Bạn tự nhập câu hỏi, phương án và đáp án đúng</strong>
            <small class="text-[11px] text-[#64748b] dark:text-[#94a3b8] leading-relaxed block">Nhấn "Mở trình chỉnh sửa câu hỏi" để mở trình chỉnh sửa trống theo thể loại đã chọn. Không cần AI, không cần Internet.</small>
          </div>
        </div>
        <div class="flex items-center gap-3 flex-wrap">
          <button class="btn btn-primary !py-2.5 !px-5 !text-[13px] !font-bold" id="generateBtn">✦ Mở trình chỉnh sửa câu hỏi</button>
          <button class="btn btn-secondary" id="previewManualBtn">👁 Xem trước mẫu trống</button>
        </div>
        <div class="text-[10px] text-[#94a3b8] dark:text-[#64748b] mt-3 leading-relaxed">Trình chỉnh sửa mở đúng thể loại đã chọn để bạn tự nhập câu hỏi, đáp án và điểm số. Sau khi lưu, vào "Dự án của tôi" để chạy thử như học sinh, tiếp tục chỉnh sửa và xuất gói .egame chạy ngoại tuyến.</div>
      </section>

    </div>

    <!-- Sidebar -->
    <aside class="flex flex-col gap-4">
      <section class="bg-white dark:bg-[#171c32] border border-[#e2e8f0] dark:border-[#2a324b] rounded-2xl p-5">
        <h3 class="text-[14px] font-bold text-[#1e293b] dark:text-[#f1f5f9] m-0 mb-1">Quy trình thủ công</h3>
        <div class="text-[11px] text-[#94a3b8] dark:text-[#64748b] mb-4">Tự soạn nội dung, không cần AI.</div>
        <div class="flex flex-col gap-3">
          <div class="flex items-start gap-3">
            <div class="w-7 h-7 rounded-lg bg-[#eef2ff] dark:bg-[#262c55] text-[#6366f1] dark:text-[#818cf8] grid place-items-center text-[12px] font-bold shrink-0">1</div>
            <div class="min-w-0">
              <strong class="text-[12px] text-[#1e293b] dark:text-[#f1f5f9] block">Chọn thể loại</strong>
              <p class="text-[11px] text-[#64748b] dark:text-[#94a3b8] m-0 leading-snug">Chọn 1 trong 5 mẫu phù hợp với mục tiêu tiết học.</p>
            </div>
          </div>
          <div class="flex items-start gap-3">
            <div class="w-7 h-7 rounded-lg bg-[#eef2ff] dark:bg-[#262c55] text-[#6366f1] dark:text-[#818cf8] grid place-items-center text-[12px] font-bold shrink-0">2</div>
            <div class="min-w-0">
              <strong class="text-[12px] text-[#1e293b] dark:text-[#f1f5f9] block">Thiết lập luật chơi</strong>
              <p class="text-[11px] text-[#64748b] dark:text-[#94a3b8] m-0 leading-snug">Điểm số, độ khó, thời lượng, số người chơi và thi đấu.</p>
            </div>
          </div>
          <div class="flex items-start gap-3">
            <div class="w-7 h-7 rounded-lg bg-[#eef2ff] dark:bg-[#262c55] text-[#6366f1] dark:text-[#818cf8] grid place-items-center text-[12px] font-bold shrink-0">3</div>
            <div class="min-w-0">
              <strong class="text-[12px] text-[#1e293b] dark:text-[#f1f5f9] block">Tự nhập câu hỏi</strong>
              <p class="text-[11px] text-[#64748b] dark:text-[#94a3b8] m-0 leading-snug">Mở trình chỉnh sửa và điền câu hỏi, phương án, đáp án đúng, giải thích.</p>
            </div>
          </div>
          <div class="flex items-start gap-3">
            <div class="w-7 h-7 rounded-lg bg-[#eef2ff] dark:bg-[#262c55] text-[#6366f1] dark:text-[#818cf8] grid place-items-center text-[12px] font-bold shrink-0">4</div>
            <div class="min-w-0">
              <strong class="text-[12px] text-[#1e293b] dark:text-[#f1f5f9] block">Chơi và lưu kết quả</strong>
              <p class="text-[11px] text-[#64748b] dark:text-[#94a3b8] m-0 leading-snug">Game đã lưu không cần mạng, có thể xuất qua USB.</p>
            </div>
          </div>
        </div>
      </section>

      <section class="bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] rounded-2xl p-5 text-white">
        <h3 class="text-[14px] font-bold m-0 mb-1">Muốn dùng AI?</h3>
        <div class="text-[11px] text-[#e0e7ff] mb-3 leading-relaxed">AI phân tích giáo án và gợi ý trò chơi, chạy trên máy bằng llama.cpp.</div>
        <button class="bg-white text-[#6366f1] border-0 rounded-lg px-4 py-2.5 font-bold text-[12px] cursor-pointer w-full hover:bg-[#f8f7ff] transition" data-page="create-wizard">🪄 Tạo trò chơi từ giáo án</button>
      </section>

      <section class="bg-white dark:bg-[#171c32] border border-[#e2e8f0] dark:border-[#2a324b] rounded-2xl p-5">
        <h3 class="text-[13px] font-bold text-[#1e293b] dark:text-[#f1f5f9] m-0 mb-3">Trạng thái hệ thống</h3>
        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between py-1.5">
            <div class="flex items-center gap-2">
              <span class="text-[14px]">💾</span>
              <div>
                <strong class="text-[11px] text-[#1e293b] dark:text-[#f1f5f9] block">Thư viện cục bộ</strong>
                <small class="text-[10px] text-[#94a3b8]">Đang lưu trên máy này</small>
              </div>
            </div>
            <span class="px-2 py-0.5 bg-[#effaf5] dark:bg-[#132d24] text-[#16a34a] dark:text-[#4ade80] rounded text-[10px] font-semibold">Sẵn sàng</span>
          </div>
          <div class="flex items-center justify-between py-1.5">
            <div class="flex items-center gap-2">
              <span class="text-[14px]">🎮</span>
              <div>
                <strong class="text-[11px] text-[#1e293b] dark:text-[#f1f5f9] block">Game runtime</strong>
                <small class="text-[10px] text-[#94a3b8]">5 mẫu giao diện</small>
              </div>
            </div>
            <span class="px-2 py-0.5 bg-[#f1f5f9] dark:bg-[#1e2544] text-[#475569] dark:text-[#cbd5e1] rounded text-[10px] font-semibold">v1</span>
          </div>
        </div>
      </section>
    </aside>
  </div>`;
}
