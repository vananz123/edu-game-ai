// @ts-nocheck -- migrated legacy UI logic; new contracts are typed in src/shared/types.ts.
function renderSettings() {
  const ai = state.settings.ai || {};
  const teachingStyle = state.settings.preferences?.teachingStyle || {};
  const tone = String(teachingStyle.tone || 'thân thiện');
  const humor = String(teachingStyle.humor || 'vừa phải');
  const visualStyle = String(teachingStyle.visualStyle || 'hiện đại sinh động');
  const audience = ['child', 'adult'].includes(state.settings.preferences?.audience) ? state.settings.preferences.audience : 'teen';
  const cloud = getCloudProviderConfig(ai);
  const machine = state.localAiMachine || {};
  const selectedLocalModelId = ai.localModelId || machine.recommendedModelId || state.localAiModels[0]?.id || '';
  const selectedLocalModel = state.localAiModels.find(model => model.id === selectedLocalModelId);
  const recommendedLocalModel = state.localAiModels.find(model => model.id === machine.recommendedModelId);
  // update_plan_3 §4: CPU-only release — never show VRAM/GPU offload in the UI.
  const gpuDescription = 'Bản CPU-only: AI local chạy hoàn toàn trên CPU, không dùng GPU.';
  const modelStatus = selectedLocalModel
    ? selectedLocalModel.installed
      ? machine.runtimeInstalled ? 'Model và runtime đã sẵn sàng trên máy.' : 'Model đã có; runtime sẽ được cài khi bạn bắt đầu dùng AI local.'
      : 'Model chưa được tải. Nhấn nút bên dưới để tải và xác minh.'
    : 'Đang nạp danh sách model AI local…';

  return `<div class="flex justify-between items-start gap-[20px] mb-[25px]"><div><div class="text-[10px] text-[#6258e8] font-extrabold tracking-[1.3px] uppercase mb-[8px]">PREFERENCES & INTEGRATIONS</div><h1 class="text-[27px] tracking-[-0.9px] m-0 font-[780]">Cài đặt ứng dụng</h1><p class="mt-[9px] text-[#788196] text-[13px] leading-[1.6]">Quản lý AI local tích hợp, nhà cung cấp AI tùy chọn và trải nghiệm ứng dụng.</p></div><button class="border-0 rounded-[9px] px-[15px] py-[11px] inline-flex items-center justify-center gap-[8px] font-bold text-[12px] transition-transform duration-120 hover:-translate-y-[1px] bg-[#6258e8] text-white shadow-[0_6px_14px_#6258e82b]" id="saveSettingsBtn">Lưu cài đặt</button></div>
    <section class="bg-white border border-line rounded-[14px] p-[23px]"><div class="flex justify-between items-start"><div><h3 class="text-[14px] m-0 mb-[5px]">AI local tích hợp</h3><div class="text-[11px] text-[#9199aa] mb-[17px]">Cài và chọn model Qwen chạy cùng llama.cpp ngay trong ứng dụng. Model và runtime được lưu trong dữ liệu ứng dụng trên máy này.</div></div><span class="inline-block px-[4px] py-[7px] bg-[#f5f6fa] rounded-[5px] text-[#788196] text-[9px] ${selectedLocalModel?.installed && machine.runtimeInstalled ? 'ready' : ''}">${selectedLocalModel?.installed && machine.runtimeInstalled ? 'Sẵn sàng' : 'Chưa cài đầy đủ'}</span></div>
      ${machine.runtimeSupported === false ? '<div class="bg-white border border-line rounded-[14px] p-[23px]"><strong>Chưa hỗ trợ cấu hình này</strong><p class="mt-[4px]">Runtime AI local tích hợp hiện chỉ hỗ trợ Windows x64.</p></div>' : ''}
      ${state.localAiModels.length ? `<div class="grid gap-[18px]"><div>
        <div class="field"><label class="block text-[11px] font-bold mb-[4px]">MODEL ĐANG CHỌN</label><select id="localModelSelect">${state.localAiModels.map(model=>`<option value="${escapeHtml(model.id)}" ${model.id===selectedLocalModelId?'selected':''}>${escapeHtml(model.displayName)} · ${formatBytes(model.sizeBytes)}${model.id===machine.recommendedModelId?' · Đề xuất':''}${model.installed?' · Đã cài':''}</option>`).join('')}</select><div class="text-[11px] text-[#8d96a8] mt-[4px]">Model được chọn sẽ dùng chung ở đây và trong màn hình Tạo trò chơi.</div></div>
        ${selectedLocalModel ? `<div class="local-ai-model-summary"><strong>${escapeHtml(selectedLocalModel.displayName)}</strong><span>${modelStatus}</span><span>Đánh giá máy: ${escapeHtml(selectedLocalModel.recommendationReason)}</span><span>RAM ${formatBytes(machine.totalRamBytes || 0)} · cần tối thiểu ${formatBytes(selectedLocalModel.minimumRamBytes)}, khuyến nghị ${formatBytes(selectedLocalModel.recommendedRamBytes)}</span><span>${selectedLocalModel.memoryStatus==='insufficient'?'RAM thấp hơn mức tối thiểu; model có thể không chạy ổn định.':selectedLocalModel.memoryStatus==='below-recommended'?'RAM thấp hơn mức khuyến nghị.':'RAM đạt mức khuyến nghị.'}</span></div>` : ''}
        <div class="flex items-center gap-[12px] mt-[14px]"><button class="border-0 rounded-[9px] px-[15px] py-[11px] inline-flex items-center justify-center gap-[8px] font-bold text-[12px] transition-transform duration-120 hover:-translate-y-[1px] bg-white border border-[#e7eaf2] text-[#515c72]" id="installLocalModelBtn" ${machine.runtimeSupported===false?'disabled':''}>${selectedLocalModel?.installed&&machine.runtimeInstalled?'Xác minh model và runtime':'Tải / xác minh model và runtime'}</button><span id="localAiProgress" class="text-[11px] text-[#8d96a8]">${selectedLocalModel?.installed&&machine.runtimeInstalled?'Model và runtime đã được xác minh.':'Tải model lần đầu cần Internet; sau khi cài, AI local có thể chạy ngoại tuyến.'}</span></div>
      </div><div class="local-ai-machine"><strong>Cấu hình máy</strong><span><b>CPU:</b> ${escapeHtml(machine.cpuModel || 'Không nhận diện được')} · ${machine.logicalCpuCount || 0} luồng logic</span><span><b>RAM:</b> ${formatBytes(machine.totalRamBytes || 0)}</span><span><b>GPU:</b> ${escapeHtml(gpuDescription)}</span><span><b>Model đề xuất:</b> ${escapeHtml(recommendedLocalModel?.displayName || 'Chưa có đề xuất')}</span><small>Runtime hiện dùng CPU; thông tin GPU chỉ để tham khảo. Model AI có thể tạo nội dung chưa chính xác, hãy kiểm tra trước khi sử dụng trong lớp.</small></div></div>` : '<p>Đang nạp danh sách model AI local…</p>'}
    </section>
    <!-- update_plan_3 §8: task manager — what ran, what is running, what failed; history survives restart. -->
    <section class="bg-white border border-line rounded-[14px] p-[23px] mt-[18px]">
      <div class="flex justify-between items-start">
        <div>
          <h3 class="text-[14px] m-0 mb-[5px]">Tác vụ AI</h3>
          <div class="text-[11px] text-[#9199aa] mb-[17px]">Các tác vụ phân tích giáo án, sinh nội dung và tạo lại mục bằng AI local. Lịch sử được lưu trên máy và khôi phục khi mở lại ứng dụng (mục đã khôi phục không còn “đang chạy”).</div>
        </div>
        <div class="flex gap-[8px] shrink-0">
          <button class="border-0 rounded-[9px] px-[15px] py-[11px] inline-flex items-center justify-center gap-[8px] font-bold text-[12px] transition-transform duration-120 hover:-translate-y-[1px] bg-white border border-[#e7eaf2] text-[#515c72]" id="aiTasksRefreshBtn">Làm mới</button>
          <button class="border-0 rounded-[9px] px-[15px] py-[11px] inline-flex items-center justify-center gap-[8px] font-bold text-[12px] transition-transform duration-120 hover:-translate-y-[1px] bg-white border border-[#e7eaf2] text-[#515c72]" id="cpuRuntimeVerifyBtn">Xác minh runtime CPU</button>
        </div>
      </div>
      <div id="cpuVerifyResult" class="hidden bg-[#f8f9fc] border border-line rounded-[10px] p-[14px] text-[12px] mb-[14px]"></div>
      <div id="aiTaskList" class="grid gap-[8px]"><div class="text-[11px] text-[#9199aa]">Đang tải danh sách tác vụ…</div></div>
    </section>
    <!-- O10: diagnostic log — reproduce on another machine, export one file, send it back. -->
    <section class="bg-white border border-line rounded-[14px] p-[23px] mt-[18px]" data-diagnostics-panel>
      <div class="flex justify-between items-start">
        <div>
          <h3 class="text-[14px] m-0 mb-[5px]">Chẩn đoán AI (log)</h3>
          <div class="text-[11px] text-[#9199aa] mb-[9px]">Ứng dụng tự ghi lại thời gian chạy, model, số mục đã tạo, số lần thử lại và lỗi — kể cả khi chạy bằng bộ cài trên máy khác. Log chỉ chứa id, số lượng, thời gian và mã lỗi; không có nội dung giáo án, câu trả lời của AI hay khóa API. Khi cần gửi cho người hỗ trợ, bấm “Xuất gói chẩn đoán”: tệp .txt được lưu trên Desktop để dễ tìm, gửi và xóa.</div>
          <div id="diagnosticsInfo" class="text-[11px] text-[#8d96a8] mb-[12px]">Đang đọc thư mục log…</div>
        </div>
        <div class="flex gap-[8px] shrink-0">
          <button class="border-0 rounded-[9px] px-[15px] py-[11px] inline-flex items-center justify-center gap-[8px] font-bold text-[12px] transition-transform duration-120 hover:-translate-y-[1px] bg-white border border-[#e7eaf2] text-[#515c72]" id="exportDiagnosticsBtn">Xuất gói chẩn đoán</button>
          <button class="border-0 rounded-[9px] px-[15px] py-[11px] inline-flex items-center justify-center gap-[8px] font-bold text-[12px] transition-transform duration-120 hover:-translate-y-[1px] bg-white border border-[#e7eaf2] text-[#515c72]" id="openLogFolderBtn">Mở thư mục log</button>
          <button class="border-0 rounded-[9px] px-[15px] py-[11px] inline-flex items-center justify-center gap-[8px] font-bold text-[12px] transition-transform duration-120 hover:-translate-y-[1px] bg-white border border-[#e7eaf2] text-[#b3261e]" id="clearDiagnosticsBtn">Xóa log trên máy</button>
        </div>
      </div>
      <div id="diagnosticsResult" class="hidden bg-[#f8f9fc] border border-line rounded-[10px] p-[14px] text-[12px] break-all"></div>
    </section>
    <div class="grid gap-[18px]">
    <div class="grid gap-[18px]"><section class="bg-white border border-line rounded-[14px] p-[23px]"><h3 class="text-[14px] m-0 mb-[5px]">Nhà cung cấp AI</h3><div class="text-[11px] text-[#9199aa] mb-[17px]">Cấu hình AI local hoặc nhà cung cấp đám mây dùng trong Tạo trò chơi.</div>
      <div class="field"><label>CHẾ ĐỘ MẶC ĐỊNH</label><select id="settingAiMode"><option value="offline" ${(!ai.mode || ai.mode==='offline')?'selected':''}>Mẫu ngoại tuyến — không gọi API</option><option value="local" ${ai.mode==='local'?'selected':''}>AI local tích hợp — llama.cpp</option><option value="online" ${ai.mode==='online'?'selected':''}>AI đám mây — ChatGPT/Gemini/OpenCode</option></select><div class="field-hint">Model local dùng chung với màn hình Tạo trò chơi. AI đám mây dùng nhà cung cấp đang chọn bên dưới.</div></div>
      <div class="field"><label>NHÀ CUNG CẤP AI ĐÁM MÂY</label><select id="settingCloudProvider"><option value="openai" ${cloud.provider==='openai'?'selected':''}>ChatGPT (OpenAI)</option><option value="gemini" ${cloud.provider==='gemini'?'selected':''}>Gemini (Google)</option><option value="opencode" ${cloud.provider==='opencode'?'selected':''}>OpenCode Zen — model miễn phí</option><option value="custom" ${cloud.provider==='custom'?'selected':''}>API tùy chỉnh tương thích OpenAI</option></select><div class="field-hint">OpenCode Zen dùng model miễn phí của opencode.ai; ứng dụng tự đọc khóa OpenCode đã đăng nhập trên máy này nếu ô khóa để trống.</div></div>
      <div class="field"><label>API BASE URL</label><input id="settingBaseUrl" value="${escapeHtml(cloud.baseUrl)}" placeholder="https://api.openai.com/v1"><div class="field-hint">Tự điền theo ChatGPT hoặc Gemini; endpoint online yêu cầu HTTPS.</div></div>
      <div class="field"><label>TÊN MODEL</label><input id="settingModel" value="${escapeHtml(cloud.model)}" placeholder="Tên model API"></div>
      <div class="field"><label>API KEY</label><input id="settingApiKey" type="password" value="${escapeHtml(ai.apiKey || '')}" placeholder="${cloud.provider==='opencode' ? 'Để trống nếu máy đã đăng nhập OpenCode' : 'Nhập khóa của nhà cung cấp đã chọn'}"><div class="field-hint">${cloud.provider==='opencode' ? 'OpenCode Zen: để trống ô khóa nếu bạn đã đăng nhập OpenCode trên máy này — ứng dụng tự đọc khóa cục bộ, không lưu sang nơi khác.' : 'Khóa hiện tại dùng cho nhà cung cấp được chọn. Đổi nhà cung cấp sẽ xóa khóa trên biểu mẫu để tránh gửi nhầm khóa.'}</div></div>
      <button class="border-0 rounded-[9px] px-[15px] py-[11px] inline-flex items-center justify-center gap-[8px] font-bold text-[12px] transition-transform duration-120 hover:-translate-y-[1px] bg-white border border-[#e7eaf2] text-[#515c72]" id="testAiBtn">Kiểm tra kết nối AI</button>
    </section>
<section class="bg-white border border-line rounded-[14px] p-[23px]"><h3 class="text-[14px] m-0 mb-[5px]">Phong cách giảng dạy của tôi</h3><div class="text-[11px] text-[#9199aa] mb-[17px]">Thiết lập một lần cho giáo viên; AI dùng làm mặc định cho những trò chơi mới (mục 7 yêu cầu sản phẩm).</div>
      <div class="field"><label>GIỌNG ĐIỆU</label><select id="settingStyleTone"><option value="trang trọng" ${tone==='trang trọng'?'selected':''}>Trang trọng</option><option value="thân thiện" ${tone==='thân thiện'?'selected':''}>Thân thiện</option><option value="dí dỏm" ${tone==='dí dỏm'?'selected':''}>Dí dỏm</option><option value="truyền cảm hứng" ${tone==='truyền cảm hứng'?'selected':''}>Truyền cảm hứng</option></select></div>
      <div class="field"><label>MỨC ĐỘ HÀI HƯỚC</label><select id="settingStyleHumor"><option value="không hài hước" ${humor==='không hài hước'?'selected':''}>Không hài hước</option><option value="vừa phải" ${humor==='vừa phải'?'selected':''}>Vừa phải</option><option value="nhiều hình ảnh vui nhộn" ${humor==='nhiều hình ảnh vui nhộn'?'selected':''}>Nhiều hình ảnh vui nhộn</option></select></div>
      <div class="field"><label>VÍ DỤ &amp; TÌNH HUỐNG YÊU THÍCH</label><input id="settingStyleExamples" value="${escapeHtml(teachingStyle.examples || '')}" placeholder="VD: tình huống giao thông ở nông thôn, câu chuyện lớp học"></div>
      <div class="field"><label>PHONG CÁCH MỸ THUẬT</label><select id="settingVisualStyle"><option value="hiện đại sinh động" ${visualStyle==='hiện đại sinh động'?'selected':''}>Hiện đại sinh động</option><option value="hoạt hình vẽ tay" ${visualStyle==='hoạt hình vẽ tay'?'selected':''}>Hoạt hình vẽ tay</option><option value="khoa học viễn tưởng" ${visualStyle==='khoa học viễn tưởng'?'selected':''}>Khoa học viễn tưởng</option><option value="cổ tích cổ điển" ${visualStyle==='cổ tích cổ điển'?'selected':''}>Cổ tích, cổ điển</option></select></div>
      <div class="field"><label>GHI CHÚ CHO AI</label><textarea id="settingStyleNotes" rows="2" placeholder="VD: ngắn gọn, ưu tiên ví dụ địa phương, không dùng thuật ngữ khó">${escapeHtml(teachingStyle.notes || '')}</textarea></div>
      <div class="field-hint">Phong cách áp dụng khi tạo trò chơi mới bằng AI local hoặc đám mây; model AI chọn ở mục Nhà cung cấp AI. Chế độ ngoại tuyến không gọi AI nên không dùng phong cách này.</div>
    </section>
<section class="bg-white border border-line rounded-[14px] p-[23px]"><h3 class="text-[14px] m-0 mb-[5px]">Dữ liệu và trải nghiệm</h3><div class="text-[11px] text-[#9199aa] mb-[17px]">Thiết lập cục bộ cho lớp học.</div>
      <div class="flex gap-[12px] items-center mb-[4px]"><div class="switch-copy"><strong>Chữ lớn khi chơi</strong><small>Ưu tiên màn hình trình chiếu</small></div><input type="checkbox" class="switch" id="settingLargeText" ${state.settings.preferences?.largeText!==false?'checked':''}></div>
      <div class="flex gap-[12px] items-center mb-[4px]"><div class="switch-copy"><strong>Âm thanh giao diện</strong><small>Dự phòng cho phiên bản sau</small></div><input type="checkbox" class="switch" id="settingSound" ${state.settings.preferences?.sound!==false?'checked':''}></div>
      <div class="field mt-[10px]"><label>GIAO DIỆN</label><select id="settingTheme"><option value="light" ${state.settings.preferences?.theme==='light'||!state.settings.preferences?.theme?'selected':''}>Sáng</option><option value="dark" ${state.settings.preferences?.theme==='dark'?'selected':''}>Tối</option><option value="system" ${state.settings.preferences?.theme==='system'?'selected':''}>Theo hệ thống</option></select><div class="field-hint">Áp dụng cho toàn bộ ứng dụng.</div></div>
      <div class="field mt-[10px]"><label>ĐỐI TƯỢNG NGƯỜI CHƠI KHI TRÌNH CHIẾU</label><select id="settingAudience"><option value="child" ${audience==='child'?'selected':''}>Trẻ em · chữ to, bo tròn, chuyển động rõ</option><option value="teen" ${audience==='teen'?'selected':''}>Học sinh · mặc định</option><option value="adult" ${audience==='adult'?'selected':''}>Người lớn · tiết chế</option></select><div class="field-hint">Chỉ áp dụng trong lúc trình chiếu game, đọc ngay khi mở màn chơi.</div></div>
      <div class="bg-white border border-line rounded-[14px] p-[23px] mt-[18px]"><strong>Quyền riêng tư</strong><br>Trò chơi, kết quả, model và runtime AI local được lưu trong dữ liệu ứng dụng trên máy. AI local tích hợp xử lý trên máy; khi tải model lần đầu cần Internet. Khi dùng AI online, nội dung bài học được gửi tới nhà cung cấp tại endpoint bạn cấu hình. Không có đồng bộ đám mây tự động.</div>
      <div class="bg-white border border-line rounded-[14px] p-[23px] mt-[12px]"><strong>Định dạng gói</strong><br><code>.egame</code> là JSON có phiên bản schema. Chỉ nhập gói từ nguồn tin cậy; nội dung không được phép thực thi mã.</div>
      <div class="mt-[16px]"><button class="border-0 rounded-[9px] px-[15px] py-[11px] inline-flex items-center justify-center gap-[8px] font-bold text-[12px] transition-transform duration-120 hover:-translate-y-[1px] bg-white border border-[#e7eaf2] text-[#515c72]" data-action="export-first">⇩ Xuất trò chơi</button></div>
    </section></div>`;
}
