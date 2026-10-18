// @ts-nocheck -- migrated legacy UI logic; new contracts are typed in src/shared/types.ts.
function renderSettings() {
  const ai = state.settings.ai || {};
  const teachingStyle = state.settings.preferences?.teachingStyle || {};
  const tone = String(teachingStyle.tone || 'thân thiện');
  const humor = String(teachingStyle.humor || 'vừa phải');
  const visualStyle = String(teachingStyle.visualStyle || 'hiện đại sinh động');
  const cloud = getCloudProviderConfig(ai);
  const machine = state.localAiMachine || {};
  const selectedLocalModelId = ai.localModelId || machine.recommendedModelId || state.localAiModels[0]?.id || '';
  const selectedLocalModel = state.localAiModels.find(model => model.id === selectedLocalModelId);
  const recommendedLocalModel = state.localAiModels.find(model => model.id === machine.recommendedModelId);
  const gpuDescription = machine.gpu
    ? `${machine.gpu.name}${machine.gpu.vramBytes ? ` · ${formatBytes(machine.gpu.vramBytes)} VRAM` : ''}`
    : machine.gpuDetectionStatus === 'unavailable'
      ? machine.gpuDetectionMessage || 'Không đọc được thông tin GPU.'
      : 'Không phát hiện GPU.';
  const modelStatus = selectedLocalModel
    ? selectedLocalModel.installed
      ? machine.runtimeInstalled ? 'Model và runtime đã sẵn sàng trên máy.' : 'Model đã có; runtime sẽ được cài khi bạn bắt đầu dùng AI local.'
      : 'Model chưa được tải. Nhấn nút bên dưới để tải và xác minh.'
    : 'Đang nạp danh sách model AI local…';

  return `<div class="page-heading"><div><div class="eyebrow">PREFERENCES & INTEGRATIONS</div><h1>Cài đặt ứng dụng</h1><p>Quản lý AI local tích hợp, nhà cung cấp AI tùy chọn và trải nghiệm ứng dụng.</p></div><button class="btn btn-primary" id="saveSettingsBtn">Lưu cài đặt</button></div>
    <section class="form-panel local-ai-settings-panel"><div class="local-ai-settings-heading"><div><h3>AI local tích hợp</h3><div class="panel-sub">Cài và chọn model Qwen chạy cùng llama.cpp ngay trong ứng dụng. Model và runtime được lưu trong dữ liệu ứng dụng trên máy này.</div></div><span class="local-ai-status ${selectedLocalModel?.installed && machine.runtimeInstalled ? 'ready' : ''}">${selectedLocalModel?.installed && machine.runtimeInstalled ? 'Sẵn sàng' : 'Chưa cài đầy đủ'}</span></div>
      ${machine.runtimeSupported === false ? '<div class="info-box"><strong>Chưa hỗ trợ cấu hình này</strong><p>Runtime AI local tích hợp hiện chỉ hỗ trợ Windows x64.</p></div>' : ''}
      ${state.localAiModels.length ? `<div class="local-ai-settings-grid"><div>
        <div class="field"><label>MODEL ĐANG CHỌN</label><select id="localModelSelect">${state.localAiModels.map(model=>`<option value="${escapeHtml(model.id)}" ${model.id===selectedLocalModelId?'selected':''}>${escapeHtml(model.displayName)} · ${formatBytes(model.sizeBytes)}${model.id===machine.recommendedModelId?' · Đề xuất':''}${model.installed?' · Đã cài':''}</option>`).join('')}</select><div class="field-hint">Model được chọn sẽ dùng chung ở đây và trong màn hình Tạo trò chơi.</div></div>
        ${selectedLocalModel ? `<div class="local-ai-model-summary"><strong>${escapeHtml(selectedLocalModel.displayName)}</strong><span>${modelStatus}</span><span>Đánh giá máy: ${escapeHtml(selectedLocalModel.recommendationReason)}</span><span>RAM ${formatBytes(machine.totalRamBytes || 0)} · cần tối thiểu ${formatBytes(selectedLocalModel.minimumRamBytes)}, khuyến nghị ${formatBytes(selectedLocalModel.recommendedRamBytes)}</span><span>${selectedLocalModel.memoryStatus==='insufficient'?'RAM thấp hơn mức tối thiểu; model có thể không chạy ổn định.':selectedLocalModel.memoryStatus==='below-recommended'?'RAM thấp hơn mức khuyến nghị.':'RAM đạt mức khuyến nghị.'}</span></div>` : ''}
        <div class="local-ai-install-actions"><button class="btn btn-secondary" id="installLocalModelBtn" ${machine.runtimeSupported===false?'disabled':''}>${selectedLocalModel?.installed&&machine.runtimeInstalled?'Xác minh model và runtime':'Tải / xác minh model và runtime'}</button><span id="localAiProgress" class="field-hint">${selectedLocalModel?.installed&&machine.runtimeInstalled?'Model và runtime đã được xác minh.':'Tải model lần đầu cần Internet; sau khi cài, AI local có thể chạy ngoại tuyến.'}</span></div>
      </div><div class="local-ai-machine"><strong>Cấu hình máy</strong><span><b>CPU:</b> ${escapeHtml(machine.cpuModel || 'Không nhận diện được')} · ${machine.logicalCpuCount || 0} luồng logic</span><span><b>RAM:</b> ${formatBytes(machine.totalRamBytes || 0)}</span><span><b>GPU:</b> ${escapeHtml(gpuDescription)}</span><span><b>Model đề xuất:</b> ${escapeHtml(recommendedLocalModel?.displayName || 'Chưa có đề xuất')}</span><small>Runtime hiện dùng CPU; thông tin GPU chỉ để tham khảo. Model AI có thể tạo nội dung chưa chính xác, hãy kiểm tra trước khi sử dụng trong lớp.</small></div></div>` : '<p>Đang nạp danh sách model AI local…</p>'}
    </section>
    <div class="settings-grid"><section class="form-panel"><h3>Nhà cung cấp AI</h3><div class="panel-sub">Cấu hình AI local hoặc nhà cung cấp đám mây dùng trong Tạo trò chơi.</div>
      <div class="field"><label>CHẾ ĐỘ MẶC ĐỊNH</label><select id="settingAiMode"><option value="offline" ${(!ai.mode || ai.mode==='offline')?'selected':''}>Mẫu ngoại tuyến — không gọi API</option><option value="local" ${ai.mode==='local'?'selected':''}>AI local tích hợp — llama.cpp</option><option value="online" ${ai.mode==='online'?'selected':''}>AI đám mây — ChatGPT/Gemini/OpenCode</option></select><div class="field-hint">Model local dùng chung với màn hình Tạo trò chơi. AI đám mây dùng nhà cung cấp đang chọn bên dưới.</div></div>
      <div class="field"><label>NHÀ CUNG CẤP AI ĐÁM MÂY</label><select id="settingCloudProvider"><option value="openai" ${cloud.provider==='openai'?'selected':''}>ChatGPT (OpenAI)</option><option value="gemini" ${cloud.provider==='gemini'?'selected':''}>Gemini (Google)</option><option value="opencode" ${cloud.provider==='opencode'?'selected':''}>OpenCode Zen — model miễn phí</option><option value="custom" ${cloud.provider==='custom'?'selected':''}>API tùy chỉnh tương thích OpenAI</option></select><div class="field-hint">OpenCode Zen dùng model miễn phí của opencode.ai; ứng dụng tự đọc khóa OpenCode đã đăng nhập trên máy này nếu ô khóa để trống.</div></div>
      <div class="field"><label>API BASE URL</label><input id="settingBaseUrl" value="${escapeHtml(cloud.baseUrl)}" placeholder="https://api.openai.com/v1"><div class="field-hint">Tự điền theo ChatGPT hoặc Gemini; endpoint online yêu cầu HTTPS.</div></div>
      <div class="field"><label>TÊN MODEL</label><input id="settingModel" value="${escapeHtml(cloud.model)}" placeholder="Tên model API"></div>
      <div class="field"><label>API KEY</label><input id="settingApiKey" type="password" value="${escapeHtml(ai.apiKey || '')}" placeholder="${cloud.provider==='opencode' ? 'Để trống nếu máy đã đăng nhập OpenCode' : 'Nhập khóa của nhà cung cấp đã chọn'}"><div class="field-hint">${cloud.provider==='opencode' ? 'OpenCode Zen: để trống ô khóa nếu bạn đã đăng nhập OpenCode trên máy này — ứng dụng tự đọc khóa cục bộ, không lưu sang nơi khác.' : 'Khóa hiện tại dùng cho nhà cung cấp được chọn. Đổi nhà cung cấp sẽ xóa khóa trên biểu mẫu để tránh gửi nhầm khóa.'}</div></div>
      <button class="btn btn-secondary" id="testAiBtn">Kiểm tra kết nối AI</button>
    </section>
<section class="form-panel"><h3>Phong cách giảng dạy của tôi</h3><div class="panel-sub">Thiết lập một lần cho giáo viên; AI dùng làm mặc định cho những trò chơi mới (mục 7 yêu cầu sản phẩm).</div>
      <div class="field"><label>GIỌNG ĐIỆU</label><select id="settingStyleTone"><option value="trang trọng" ${tone==='trang trọng'?'selected':''}>Trang trọng</option><option value="thân thiện" ${tone==='thân thiện'?'selected':''}>Thân thiện</option><option value="dí dỏm" ${tone==='dí dỏm'?'selected':''}>Dí dỏm</option><option value="truyền cảm hứng" ${tone==='truyền cảm hứng'?'selected':''}>Truyền cảm hứng</option></select></div>
      <div class="field"><label>MỨC ĐỘ HÀI HƯỚC</label><select id="settingStyleHumor"><option value="không hài hước" ${humor==='không hài hước'?'selected':''}>Không hài hước</option><option value="vừa phải" ${humor==='vừa phải'?'selected':''}>Vừa phải</option><option value="nhiều hình ảnh vui nhộn" ${humor==='nhiều hình ảnh vui nhộn'?'selected':''}>Nhiều hình ảnh vui nhộn</option></select></div>
      <div class="field"><label>VÍ DỤ &amp; TÌNH HUỐNG YÊU THÍCH</label><input id="settingStyleExamples" value="${escapeHtml(teachingStyle.examples || '')}" placeholder="VD: tình huống giao thông ở nông thôn, câu chuyện lớp học"></div>
      <div class="field"><label>PHONG CÁCH MỸ THUẬT</label><select id="settingVisualStyle"><option value="hiện đại sinh động" ${visualStyle==='hiện đại sinh động'?'selected':''}>Hiện đại sinh động</option><option value="hoạt hình vẽ tay" ${visualStyle==='hoạt hình vẽ tay'?'selected':''}>Hoạt hình vẽ tay</option><option value="khoa học viễn tưởng" ${visualStyle==='khoa học viễn tưởng'?'selected':''}>Khoa học viễn tưởng</option><option value="cổ tích cổ điển" ${visualStyle==='cổ tích cổ điển'?'selected':''}>Cổ tích, cổ điển</option></select></div>
      <div class="field"><label>GHI CHÚ CHO AI</label><textarea id="settingStyleNotes" rows="2" placeholder="VD: ngắn gọn, ưu tiên ví dụ địa phương, không dùng thuật ngữ khó">${escapeHtml(teachingStyle.notes || '')}</textarea></div>
      <div class="field-hint">Phong cách áp dụng khi tạo trò chơi mới bằng AI local hoặc đám mây; model AI chọn ở mục Nhà cung cấp AI. Chế độ ngoại tuyến không gọi AI nên không dùng phong cách này.</div>
    </section>
<section class="form-panel"><h3>Dữ liệu và trải nghiệm</h3><div class="panel-sub">Thiết lập cục bộ cho lớp học.</div>
      <div class="switch-row"><div class="switch-copy"><strong>Chữ lớn khi chơi</strong><small>Ưu tiên màn hình trình chiếu</small></div><input type="checkbox" class="switch" id="settingLargeText" ${state.settings.preferences?.largeText!==false?'checked':''}></div>
      <div class="switch-row"><div class="switch-copy"><strong>Âm thanh giao diện</strong><small>Dự phòng cho phiên bản sau</small></div><input type="checkbox" class="switch" id="settingSound" ${state.settings.preferences?.sound!==false?'checked':''}></div>
      <div class="info-box" style="margin-top:18px"><strong>Quyền riêng tư</strong><br>Trò chơi, kết quả, model và runtime AI local được lưu trong dữ liệu ứng dụng trên máy. AI local tích hợp xử lý trên máy; khi tải model lần đầu cần Internet. Khi dùng AI online, nội dung bài học được gửi tới nhà cung cấp tại endpoint bạn cấu hình. Không có đồng bộ đám mây tự động.</div>
      <div class="info-box" style="margin-top:12px"><strong>Định dạng gói</strong><br><code>.egame</code> là JSON có phiên bản schema. Chỉ nhập gói từ nguồn tin cậy; nội dung không được phép thực thi mã.</div>
      <div style="margin-top:16px"><button class="btn btn-secondary" data-action="import-game">⇧ Nhập trò chơi</button> <button class="btn btn-secondary" data-action="export-first">⇩ Xuất trò chơi</button></div>
    </section></div>`;
}
