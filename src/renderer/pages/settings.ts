// @ts-nocheck -- migrated legacy UI logic; new contracts are typed in src/shared/types.ts.
function settingsProviderCard(provider, inputCls, labelCls, hintCls, btnSecondaryCls) {
  const chip = provider.status === 'ready'
    ? 'bg-[#effaf5] dark:bg-[#132d24] text-[#16a34a] dark:text-[#4ade80]'
    : provider.status === 'configured'
      ? 'bg-[#eef2ff] dark:bg-[#1e1b4b] text-[#4f46e5] dark:text-[#a5b4fc]'
      : provider.status === 'failing'
        ? 'bg-[#fef2f2] dark:bg-[#2d1313] text-[#dc2626] dark:text-[#fca5a5]'
        : 'bg-[#f5f6fa] dark:bg-[#1e2544] text-[#788196] dark:text-[#94a3b8]';
  // #132 D17: "verified" and "used by the lesson workflow" are different facts; a
  // provider that passed its test but is kept out of the flow must not read as merely
  // configured, or the teacher tests it again and again.
  const chipLabel = provider.status === 'ready' ? '✓ Sẵn sàng'
    : provider.status === 'configured' ? '● Đã cấu hình'
      : provider.status === 'failing' ? '⚠ Đang lỗi' : '○ Chưa cấu hình';
  const note = provider.note ? '<div class=\'mt-1 text-[10px] text-[#94a3b8]\'>' + escapeHtml(provider.note) + '</div>' : '';
  const fields = provider.id === 'local' ? '' : [
    '<div class="grid grid-cols-2 gap-2 mt-2">',
    '  <div class="field"><label class="' + labelCls + '">API BASE URL</label>',
    '<input class="' + inputCls + '" data-ai-provider-baseurl="' + escapeHtml(provider.id) + '" value="' + escapeHtml(provider.baseUrl) + '" placeholder="' + escapeHtml(provider.defaultBaseUrl || 'https://…/v1') + '"></div>',
    '  <div class="field"><label class="' + labelCls + '">TÊN MODEL</label>',
    '<input class="' + inputCls + '" data-ai-provider-model="' + escapeHtml(provider.id) + '" value="' + escapeHtml(provider.model) + '" placeholder="' + escapeHtml(provider.defaultModel || 'Tên model') + '"></div>',
    '</div>',
    '<div class="field mt-2"><label class="' + labelCls + '">API KEY</label>',
    '<input class="' + inputCls + '" type="password" autocomplete="off" data-ai-key-input="' + escapeHtml(provider.id) + '" value="" placeholder="' + escapeHtml(provider.hasKey ? 'Đã lưu khoá — gõ khoá mới để thay' : (provider.requiresKey ? 'Nhập khoá của nhà cung cấp' : 'Khoá (nếu có)')) + '">',
    '<div class="' + hintCls + ' mt-1" data-ai-key-state="' + escapeHtml(provider.id) + '">' + (provider.hasKey ? 'Đã lưu khoá (' + escapeHtml(provider.keyMasked || '••••') + ').' : 'Chưa lưu khoá.') + '</div></div>',
    '<div class="flex items-center gap-2 flex-wrap mt-2">',
    '<button class="' + btnSecondaryCls + '" data-ai-test="' + escapeHtml(provider.id) + '">🔗 Kiểm tra kết nối</button>',
    '<button class="' + btnSecondaryCls + '" data-ai-key-save="' + escapeHtml(provider.id) + '">Lưu khoá</button>',
    '<button class="' + btnSecondaryCls + '" data-ai-key-clear="' + escapeHtml(provider.id) + '"' + (provider.hasKey ? '' : ' disabled') + '>Xoá khoá</button>',
    '</div>',
    '<div class="' + hintCls + ' mt-1">Kiểm tra gửi một yêu cầu thật rất nhỏ (tối đa 8 token) tới nhà cung cấp — không phải tạo trò chơi.</div>'
  ].join('');
  const localActions = provider.id === 'local' ? [
    '<div class="flex items-center gap-2 flex-wrap mt-2">',
    '<button class="' + btnSecondaryCls + '" data-ai-test="local">🔗 Kiểm tra kết nối</button>',
    '<div class="' + hintCls + '">Kiểm tra chạy một câu hỏi ngắn trên model local đang chạy.</div>',
    '</div>'
  ].join('') : '';
  const badge = provider.wizardEligible ? '' : '<span class="ml-1.5 px-1.5 py-0.5 rounded bg-[#f5f6fa] dark:bg-[#1e2544] text-[10px] font-semibold text-[#788196] dark:text-[#94a3b8]">Chưa dùng cho luồng tạo trò chơi</span>';
  return '<div class="p-3 rounded-xl border border-[#e2e8f0] dark:border-[#2a324b]" data-ai-provider="' + escapeHtml(provider.id) + '" data-ai-provider-status="' + escapeHtml(provider.status) + '">'
    + '<div class="flex items-center justify-between gap-2 flex-wrap"><div class="min-w-0"><strong class="text-[13px] text-[#1e293b] dark:text-[#f1f5f9]">' + escapeHtml(provider.label) + '</strong>' + badge + '</div>'
    + '<span class="px-2 py-0.5 rounded text-[10px] font-semibold ' + chip + '" data-ai-provider-chip>' + chipLabel + '</span></div>'
    + '<div class="' + hintCls + ' mt-1" data-ai-provider-reason>' + escapeHtml(provider.reason || '') + '</div>'
    + note + fields + localActions + '</div>';
}

function renderSettings() {
  const ai = state.settings.ai || {};
  const teachingStyle = state.settings.preferences?.teachingStyle || {};
  const tone = String(teachingStyle.tone || 'thân thiện');
  const humor = String(teachingStyle.humor || 'vừa phải');
  const visualStyle = String(teachingStyle.visualStyle || 'hiện đại sinh động');
  const audience = ['child', 'adult'].includes(state.settings.preferences?.audience) ? state.settings.preferences.audience : 'teen';
  // #132: key-free provider view shipped by main (`settings.ai.providers`).
  const providers = Array.isArray(ai.providers) ? ai.providers : [];
  const machine = state.localAiMachine || {};
  const selectedLocalModelId = ai.localModelId || machine.recommendedModelId || state.localAiModels[0]?.id || '';
  const selectedLocalModel = state.localAiModels.find(model => model.id === selectedLocalModelId);
  const recommendedLocalModel = state.localAiModels.find(model => model.id === machine.recommendedModelId);
  // The teacher's saved choice; anything unrecognised reads as 'auto' so an old
  // or hand-edited settings file can never leave the select without a match.
  const savedRuntimeBackend = ai.runtimeBackend === 'cpu' || ai.runtimeBackend === 'vulkan' ? ai.runtimeBackend : 'auto';
  const selectedRuntimeBackend = savedRuntimeBackend;
  // Policy: CPU is the default runtime because it measured faster than Vulkan on
  // the iGPU of the pilot hardware (docs/BENCHMARKS.md). The GPU build stays
  // available, but only behind an explicit "advanced" choice, and the hint says
  // what it costs instead of promising speed-up.
  const gpuDetected = Array.isArray(machine.gpuNames) && machine.gpuNames.length > 0;
  const runtimeBackendHint = selectedRuntimeBackend === 'vulkan'
    ? 'Tùy chọn nâng cao: AI local sẽ tải bản GPU (Vulkan) và đẩy phần đọc tài liệu sang GPU tích hợp. '
      + 'Đo trên máy phổ thông cho thấy bước đọc tài liệu dài chậm hơn CPU; hãy thử và so sánh. '
      + 'Nếu GPU không khởi động được, ứng dụng tự chuyển về CPU.'
    : selectedRuntimeBackend === 'cpu'
      ? 'AI local chỉ chạy trên CPU, không dùng GPU (nhanh nhất theo đo đạc hiện tại và ổn định nhất).'
      : 'Mặc định: CPU — nhanh nhất theo đo đạc hiện tại, không cần GPU. '
        + (gpuDetected ? 'Máy có GPU tích hợp: mở "Tùy chọn nâng cao" nếu muốn thử bản Vulkan.' : '');
  // update_plan_3 §4: CPU-first release — GPU offload is never advertised as the
  // normal path, only as an advanced experiment.
  const gpuDescription = savedRuntimeBackend === 'vulkan'
    ? 'Đang chọn bản GPU tích hợp (Vulkan) — tùy chọn nâng cao, thử nghiệm.'
    : 'AI local chạy trên CPU; GPU tích hợp chỉ dùng nếu chọn trong "Tùy chọn nâng cao".';
  const modelStatus = selectedLocalModel
    ? selectedLocalModel.installed
      ? machine.runtimeInstalled ? 'Model và runtime đã sẵn sàng trên máy.' : 'Model đã có; runtime sẽ được cài khi bạn bắt đầu dùng AI local.'
      : 'Model chưa được tải. Nhấn nút bên dưới để tải và xác minh.'
    : 'Đang nạp danh sách model AI local…';

  const inputCls = 'w-full px-3 py-2 border border-[#cbd5e1] dark:border-[#334155] rounded-lg bg-white dark:bg-[#1e2544] text-[#1e293b] dark:text-[#f8fafc] text-[13px] focus:outline-none focus:border-[#6366f1]';
  const labelCls = 'text-[10px] font-bold text-[#475569] dark:text-[#cbd5e1] mb-1 block';
  const sectionCls = 'bg-white dark:bg-[#171c32] border border-[#e2e8f0] dark:border-[#2a324b] rounded-2xl p-5';
  const hintCls = 'text-[11px] text-[#94a3b8] dark:text-[#64748b] leading-relaxed';
  const btnSecondaryCls = 'btn btn-secondary btn-small';

  return `<!-- Header -->
  <div class="flex items-center justify-between gap-4 mb-6 flex-wrap pb-4 border-b border-[#f1f5f9] dark:border-[#2a324b]">
    <div>
      <div class="flex items-center gap-2 mb-1">
        <span class="d-badge d-badge-secondary d-badge-sm font-bold">CÀI ĐẶT</span>
        <h1 class="text-[22px] tracking-[-0.5px] m-0 font-extrabold text-[#1e293b] dark:text-[#f1f5f9]">Cài đặt ứng dụng</h1>
      </div>
      <p class="mt-1 text-[12px] text-[#64748b] dark:text-[#94a3b8] leading-relaxed m-0">
        Quản lý AI local tích hợp, nhà cung cấp AI tùy chọn và trải nghiệm ứng dụng.
      </p>
    </div>
  </div>

  <div class="grid grid-cols-[minmax(0,1fr)_280px] gap-5 items-start">
    <div class="flex flex-col gap-5 min-w-0">

      <!-- ═══ AI LOCAL TÍCH HỢP ═══ -->
      <section class="${sectionCls}">
        <div class="flex justify-between items-center mb-4">
          <div class="flex items-center gap-2">
            <span class="text-[18px]">🤖</span>
            <h3 class="text-[15px] font-bold text-[#1e293b] dark:text-[#f1f5f9] m-0">AI local tích hợp</h3>
          </div>
          <span class="px-2 py-0.5 rounded text-[10px] font-semibold ${selectedLocalModel?.installed && machine.runtimeInstalled
            ? 'bg-[#effaf5] dark:bg-[#132d24] text-[#16a34a] dark:text-[#4ade80]'
            : 'bg-[#fef3c7] dark:bg-[#2d2413] text-[#d97706] dark:text-[#fbbf24]'}">${selectedLocalModel?.installed && machine.runtimeInstalled ? '✓ Sẵn sàng' : '○ Chưa cài đầy đủ'}</span>
        </div>
        <p class="${hintCls} mb-4">Cài và chọn model Qwen chạy cùng llama.cpp ngay trong ứng dụng. Model và runtime được lưu trong dữ liệu ứng dụng trên máy này.</p>

        ${machine.runtimeSupported === false ? `<div class="p-3 bg-[#fef2f2] dark:bg-[#2d1313] border border-[#fecaca] dark:border-[#4a1b1b] rounded-lg mb-4 text-[12px] text-[#b91c1c] dark:text-[#fca5a5]"><strong>Chưa hỗ trợ cấu hình này</strong> — Runtime AI local tích hợp hiện chỉ hỗ trợ Windows x64.</div>` : ''}

        ${state.localAiModels.length ? `
          <div class="grid gap-4">
            <div class="field">
              <label class="${labelCls}">MODEL ĐANG CHỌN</label>
              <select id="localModelSelect" class="${inputCls}">${state.localAiModels.map(model=>`<option value="${escapeHtml(model.id)}" ${model.id===selectedLocalModelId?'selected':''}>${escapeHtml(model.displayName)} · ${formatBytes(model.sizeBytes)}${model.id===machine.recommendedModelId?' · Đề xuất':''}${model.installed?' · Đã cài':''}</option>`).join('')}</select>
              <div class="${hintCls} mt-1">Model được chọn sẽ dùng chung ở đây và trong màn hình Tạo trò chơi.</div>
            </div>

            ${selectedLocalModel ? `
              <div class="p-3 bg-[#f8fafc] dark:bg-[#151a30] rounded-xl border border-[#f1f5f9] dark:border-[#2a324b]">
                <strong class="text-[13px] text-[#1e293b] dark:text-[#f1f5f9] block mb-2">${escapeHtml(selectedLocalModel.displayName)}</strong>
                <div class="grid gap-1.5 text-[11px] text-[#64748b] dark:text-[#94a3b8]">
                  <span>${modelStatus}</span>
                  <span>Đánh giá máy: ${escapeHtml(selectedLocalModel.recommendationReason)}</span>
                  <span>RAM ${formatBytes(machine.totalRamBytes || 0)} · cần tối thiểu ${formatBytes(selectedLocalModel.minimumRamBytes)}, khuyến nghị ${formatBytes(selectedLocalModel.recommendedRamBytes)}</span>
                  <span class="${selectedLocalModel.memoryStatus==='insufficient' ? 'text-[#dc2626]' : selectedLocalModel.memoryStatus==='below-recommended' ? 'text-[#d97706]' : 'text-[#16a34a]'}">${selectedLocalModel.memoryStatus==='insufficient'?'⚠ RAM thấp hơn mức tối thiểu; model có thể không chạy ổn định.':selectedLocalModel.memoryStatus==='below-recommended'?'⚠ RAM thấp hơn mức khuyến nghị.':'✓ RAM đạt mức khuyến nghị.'}</span>
                </div>
              </div>
            ` : ''}

            <details class="group" ${selectedRuntimeBackend==='vulkan'?'open':''}>
              <summary class="cursor-pointer text-[12px] font-semibold text-[#6366f1] dark:text-[#818cf8] hover:underline list-none flex items-center gap-1.5">
                <span class="text-[10px] transition-transform group-open:rotate-90">▶</span>
                Tùy chọn nâng cao: dùng GPU tích hợp
              </summary>
              <div class="mt-3 p-3 bg-[#f8fafc] dark:bg-[#151a30] rounded-lg border border-[#f1f5f9] dark:border-[#2a324b]">
                <p class="${hintCls} mb-3">Mặc định AI local chạy trên CPU. Chỉ mở phần này nếu muốn thử bản Vulkan và tự so tốc độ.</p>
                <div class="field">
                  <label class="${labelCls}">BỘ XỬ LÝ AI LOCAL</label>
                  <select id="localRuntimeBackendSelect" class="${inputCls}">
                    <option value="auto" ${selectedRuntimeBackend==='auto'?'selected':''}>CPU — mặc định, khuyến nghị</option>
                    <option value="cpu" ${selectedRuntimeBackend==='cpu'?'selected':''}>Chỉ CPU — ổn định nhất</option>
                    <option value="vulkan" ${selectedRuntimeBackend==='vulkan'?'selected':''}>GPU tích hợp (Vulkan) — thử nghiệm, thường chậm hơn CPU</option>
                  </select>
                  <div class="${hintCls} mt-1">${escapeHtml(runtimeBackendHint)}</div>
                </div>
              </div>
            </details>

            <div class="flex items-center gap-3 flex-wrap">
              <button class="${btnSecondaryCls}" id="installLocalModelBtn" ${machine.runtimeSupported===false?'disabled':''}>${selectedLocalModel?.installed&&machine.runtimeInstalled?'Xác minh model và runtime':'Tải / xác minh model và runtime'}</button>
              <button class="${btnSecondaryCls}" id="openSetupWizardBtn">Cài đặt lại AI từ đầu</button>
              <span id="localAiProgress" class="${hintCls}">${selectedLocalModel?.installed&&machine.runtimeInstalled?'Model và runtime đã được xác minh.':'Tải model lần đầu cần Internet; sau khi cài, AI local có thể chạy ngoại tuyến.'}</span>
            </div>

            <div class="p-3 bg-[#f8fafc] dark:bg-[#151a30] rounded-xl border border-[#f1f5f9] dark:border-[#2a324b]">
              <strong class="text-[12px] text-[#1e293b] dark:text-[#f1f5f9] block mb-2">Cấu hình máy</strong>
              <div class="grid gap-1 text-[11px] text-[#64748b] dark:text-[#94a3b8]">
                <span><b class="text-[#475569] dark:text-[#cbd5e1]">CPU:</b> ${escapeHtml(machine.cpuModel || 'Không nhận diện được')} · ${machine.logicalCpuCount || 0} luồng logic</span>
                <span><b class="text-[#475569] dark:text-[#cbd5e1]">RAM:</b> ${formatBytes(machine.totalRamBytes || 0)}</span>
                <span><b class="text-[#475569] dark:text-[#cbd5e1]">GPU:</b> ${escapeHtml(gpuDescription)}</span>
                <span><b class="text-[#475569] dark:text-[#cbd5e1]">Bộ xử lý AI đang chọn:</b> ${escapeHtml(selectedRuntimeBackend==='vulkan'?'GPU tích hợp (Vulkan) — thử nghiệm':selectedRuntimeBackend==='cpu'?'Chỉ CPU':'CPU (mặc định)')}</span>
                <span><b class="text-[#475569] dark:text-[#cbd5e1]">Model đề xuất:</b> ${escapeHtml(recommendedLocalModel?.displayName || 'Chưa có đề xuất')}</span>
              </div>
              <small class="${hintCls} block mt-2">Model AI có thể tạo nội dung chưa chính xác, hãy kiểm tra trước khi sử dụng trong lớp.</small>
            </div>
          </div>
        ` : `<p class="${hintCls}">Đang nạp danh sách model AI local…</p>`}
      </section>

      <!-- ═══ NHÀ CUNG CẤP AI (#132) ═══ -->
      <section class="${sectionCls}" id="settingAiProviders" data-ai-providers>
        <div class="flex items-center gap-2 mb-2">
          <span class="text-[18px]">☁️</span>
          <h3 class="text-[15px] font-bold text-[#1e293b] dark:text-[#f1f5f9] m-0">Nhà cung cấp AI</h3>
        </div>
        <p class="${hintCls} mb-4">Mọi cấu hình AI nằm ở đây — luồng tạo trò chơi chỉ dùng nhà cung cấp đã cấu hình sẵn. Khoá API được mã hoá bằng khoá của Windows và <b>không bao giờ</b> gửi lại vào màn hình.</p>
        ${providers.length ? `
          <div class="p-3 mb-3 bg-[#f8fafc] dark:bg-[#151a30] rounded-xl border border-[#f1f5f9] dark:border-[#2a324b]" data-ai-policy>
            <strong class="text-[12px] text-[#1e293b] dark:text-[#f1f5f9] block">Cho trò chơi mới: tự chọn nhà cung cấp sẵn sàng</strong>
            <div class="${hintCls} mt-1">Không tự đổi nhà cung cấp khi đang lỗi. Thứ tự tự động: AI local → Gemini → ChatGPT. Bước 2 và bước 5 luôn hiện nhà cung cấp đang dùng và cho chọn nếu có từ hai nhà cung cấp sẵn sàng.</div>
            <div class="flex flex-wrap gap-1.5 mt-2">${providers.filter(p => p.wizardEligible).map(p => `<span class="px-2 py-0.5 rounded text-[10px] font-semibold ${p.usable ? 'bg-[#effaf5] text-[#16a34a]' : 'bg-[#f5f6fa] text-[#788196]'}">${escapeHtml(p.label)}</span>`).join('')}</div>
          </div>
          <div class="grid gap-3">${providers.map(provider => settingsProviderCard(provider, inputCls, labelCls, hintCls, btnSecondaryCls)).join('')}</div>
        ` : `<p class="${hintCls}">Đang nạp danh sách nhà cung cấp AI…</p>`}
      </section>


      <!-- ═══ PHONG CÁCH GIẢNG DẠY ═══ -->
      <section class="${sectionCls}">
        <div class="flex items-center gap-2 mb-4">
          <span class="text-[18px]">🎨</span>
          <h3 class="text-[15px] font-bold text-[#1e293b] dark:text-[#f1f5f9] m-0">Phong cách giảng dạy của tôi</h3>
        </div>
        <p class="${hintCls} mb-4">Thiết lập một lần cho giáo viên; AI dùng làm mặc định cho những trò chơi mới.</p>

        <div class="grid gap-3">
          <div class="grid grid-cols-3 gap-3">
            <div class="field">
              <label class="${labelCls}">GIỌNG ĐIỆU</label>
              <select id="settingStyleTone" class="${inputCls}">
                <option value="trang trọng" ${tone==='trang trọng'?'selected':''}>Trang trọng</option>
                <option value="thân thiện" ${tone==='thân thiện'?'selected':''}>Thân thiện</option>
                <option value="dí dỏm" ${tone==='dí dỏm'?'selected':''}>Dí dỏm</option>
                <option value="truyền cảm hứng" ${tone==='truyền cảm hứng'?'selected':''}>Truyền cảm hứng</option>
              </select>
            </div>
            <div class="field">
              <label class="${labelCls}">MỨC ĐỘ HÀI HƯỚC</label>
              <select id="settingStyleHumor" class="${inputCls}">
                <option value="không hài hước" ${humor==='không hài hước'?'selected':''}>Không hài hước</option>
                <option value="vừa phải" ${humor==='vừa phải'?'selected':''}>Vừa phải</option>
                <option value="nhiều hình ảnh vui nhộn" ${humor==='nhiều hình ảnh vui nhộn'?'selected':''}>Nhiều hình ảnh vui nhộn</option>
              </select>
            </div>
            <div class="field">
              <label class="${labelCls}">PHONG CÁCH MỸ THUẬT</label>
              <select id="settingVisualStyle" class="${inputCls}">
                <option value="hiện đại sinh động" ${visualStyle==='hiện đại sinh động'?'selected':''}>Hiện đại sinh động</option>
                <option value="hoạt hình vẽ tay" ${visualStyle==='hoạt hình vẽ tay'?'selected':''}>Hoạt hình vẽ tay</option>
                <option value="khoa học viễn tưởng" ${visualStyle==='khoa học viễn tưởng'?'selected':''}>Khoa học viễn tưởng</option>
                <option value="cổ tích cổ điển" ${visualStyle==='cổ tích cổ điển'?'selected':''}>Cổ tích, cổ điển</option>
              </select>
            </div>
          </div>
          <div class="field">
            <label class="${labelCls}">VÍ DỤ &amp; TÌNH HUỐNG YÊU THÍCH</label>
            <input id="settingStyleExamples" class="${inputCls}" value="${escapeHtml(teachingStyle.examples || '')}" placeholder="VD: tình huống giao thông ở nông thôn, câu chuyện lớp học">
          </div>
          <div class="field">
            <label class="${labelCls}">GHI CHÚ CHO AI</label>
            <textarea id="settingStyleNotes" rows="2" class="${inputCls}" placeholder="VD: ngắn gọn, ưu tiên ví dụ địa phương, không dùng thuật ngữ khó">${escapeHtml(teachingStyle.notes || '')}</textarea>
          </div>
          <div class="${hintCls}">Phong cách áp dụng khi tạo trò chơi mới bằng AI local hoặc đám mây; model AI chọn ở mục Nhà cung cấp AI. Chế độ ngoại tuyến không gọi AI nên không dùng phong cách này.</div>
        </div>
      </section>

      <!-- ═══ DỮ LIỆU VÀ TRẢI NGHIỆM ═══ -->
      <section class="${sectionCls}">
        <div class="flex items-center gap-2 mb-4">
          <span class="text-[18px]">⚙️</span>
          <h3 class="text-[15px] font-bold text-[#1e293b] dark:text-[#f1f5f9] m-0">Dữ liệu và trải nghiệm</h3>
        </div>

        <div class="grid gap-4">
          <div class="grid grid-cols-3 gap-3">
            <div class="field">
              <label class="${labelCls}">GIAO DIỆN</label>
              <select id="settingTheme" class="${inputCls}">
                <option value="light" ${state.settings.preferences?.theme==='light'||!state.settings.preferences?.theme?'selected':''}>Sáng</option>
                <option value="dark" ${state.settings.preferences?.theme==='dark'?'selected':''}>Tối</option>
                <option value="system" ${state.settings.preferences?.theme==='system'?'selected':''}>Theo hệ thống</option>
              </select>
            </div>
            <div class="field">
              <label class="${labelCls}">ĐỐI TƯỢNG NGƯỜI CHƠI</label>
              <select id="settingAudience" class="${inputCls}">
                <option value="child" ${audience==='child'?'selected':''}>Trẻ em · chữ to, bo tròn</option>
                <option value="teen" ${audience==='teen'?'selected':''}>Học sinh · mặc định</option>
                <option value="adult" ${audience==='adult'?'selected':''}>Người lớn · tiết chế</option>
              </select>
            </div>
            <div class="flex flex-col gap-3 pt-5">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="text-[13px]">🔤</span>
                  <span class="text-[12px] font-semibold text-[#1e293b] dark:text-[#f1f5f9]">Chữ lớn khi chơi</span>
                </div>
                <input type="checkbox" class="switch" id="settingLargeText" ${state.settings.preferences?.largeText!==false?'checked':''}>
              </div>
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="text-[13px]">🔊</span>
                  <span class="text-[12px] font-semibold text-[#1e293b] dark:text-[#f1f5f9]">Âm thanh</span>
                </div>
                <input type="checkbox" class="switch" id="settingSound" ${state.settings.preferences?.sound!==false?'checked':''}>
              </div>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div class="p-3 bg-[#f8fafc] dark:bg-[#151a30] rounded-lg border border-[#f1f5f9] dark:border-[#2a324b]">
              <strong class="text-[12px] text-[#1e293b] dark:text-[#f1f5f9] block mb-1">🔒 Quyền riêng tư</strong>
              <p class="${hintCls} m-0">Trò chơi, kết quả, model và runtime AI local được lưu trong dữ liệu ứng dụng trên máy. AI local tích hợp xử lý trên máy; khi tải model lần đầu cần Internet. Khi dùng AI online, nội dung bài học được gửi tới nhà cung cấp tại endpoint bạn cấu hình. Không có đồng bộ đám mây tự động.</p>
            </div>
            <div class="p-3 bg-[#f8fafc] dark:bg-[#151a30] rounded-lg border border-[#f1f5f9] dark:border-[#2a324b]">
              <strong class="text-[12px] text-[#1e293b] dark:text-[#f1f5f9] block mb-1">📦 Định dạng gói</strong>
              <p class="${hintCls} m-0"><code class="text-[#6366f1] dark:text-[#818cf8]">.egame</code> là JSON có phiên bản schema. Chỉ nhập gói từ nguồn tin cậy; nội dung không được phép thực thi mã.</p>
              <div class="flex gap-2 mt-2 flex-wrap">
                <button class="${btnSecondaryCls}" data-action="export-first">⇩ Xuất trò chơi</button>
                <button class="${btnSecondaryCls}" data-action="import-game">⇧ Nhập gói .egame</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ═══ TÁC VỤ AI ═══ -->
      <!-- update_plan_3 §8: task manager — what ran, what is running, what failed; history survives restart. -->
      <section class="${sectionCls}">
        <div class="flex justify-between items-center mb-4">
          <div class="flex items-center gap-2">
            <span class="text-[18px]">📋</span>
            <h3 class="text-[15px] font-bold text-[#1e293b] dark:text-[#f1f5f9] m-0">Tác vụ AI</h3>
          </div>
          <div class="flex gap-2 shrink-0">
            <button class="${btnSecondaryCls}" id="aiTasksRefreshBtn">Làm mới</button>
            <button class="${btnSecondaryCls}" id="cpuRuntimeVerifyBtn">Xác minh runtime</button>
          </div>
        </div>
        <p class="${hintCls} mb-3">Các tác vụ phân tích giáo án, sinh nội dung và tạo lại mục bằng AI local. Lịch sử được lưu trên máy và khôi phục khi mở lại ứng dụng. Mỗi trang 10 tác vụ; hệ thống chỉ giữ <b>30 tác vụ gần nhất</b> và tự xoá tác vụ cũ hơn.</p>
        <div id="cpuVerifyResult" class="hidden bg-[#f8fafc] dark:bg-[#151a30] border border-[#e2e8f0] dark:border-[#2a324b] rounded-lg p-3 text-[12px] mb-3"></div>
        <div id="aiTaskList" class="grid gap-2"><div class="${hintCls}">Đang tải danh sách tác vụ…</div></div>
      </section>

      <!-- ═══ CHẨN ĐOÁN AI ═══ -->
      <!-- O10: diagnostic log — reproduce on another machine, export one file, send it back. -->
      <section class="${sectionCls}" data-diagnostics-panel>
        <div class="flex justify-between items-center mb-4">
          <div class="flex items-center gap-2">
            <span class="text-[18px]">🔍</span>
            <h3 class="text-[15px] font-bold text-[#1e293b] dark:text-[#f1f5f9] m-0">Chẩn đoán AI (log)</h3>
          </div>
          <div class="flex gap-2 shrink-0">
            <button class="${btnSecondaryCls}" id="exportDiagnosticsBtn">Xuất gói chẩn đoán</button>
            <button class="${btnSecondaryCls}" id="openLogFolderBtn">Mở thư mục log</button>
            <button class="btn btn-small border border-[#e2e8f0] dark:border-[#2a324b] text-[#dc2626] dark:text-[#fca5a5] bg-white dark:bg-[#171c32] hover:bg-[#fef2f2] text-[11px] font-semibold px-3 py-1.5 rounded-lg" id="clearDiagnosticsBtn">Xóa log</button>
          </div>
        </div>
        <p class="${hintCls} mb-2">Ứng dụng tự ghi lại thời gian chạy, model, số mục đã tạo, số lần thử lại và lỗi. Log chỉ chứa id, số lượng, thời gian và mã lỗi; không có nội dung giáo án hay khóa API.</p>
        <div id="diagnosticsInfo" class="${hintCls} mb-3">Đang đọc thư mục log…</div>
        <div id="diagnosticsResult" class="hidden bg-[#f8fafc] dark:bg-[#151a30] border border-[#e2e8f0] dark:border-[#2a324b] rounded-lg p-3 text-[12px] break-all"></div>
      </section>

    </div>

    <!-- ═══ SIDEBAR: Nút lưu sticky + tóm tắt ═══ -->
    <aside class="flex flex-col gap-4 sticky top-20">
      <!-- Nút Lưu cài đặt — sticky -->
      <section class="bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] rounded-2xl p-5 text-white">
        <h3 class="text-[14px] font-bold m-0 mb-2">Lưu thay đổi</h3>
        <p class="text-[11px] text-[#e0e7ff] mb-3 leading-relaxed m-0">Nhấn nút bên dưới để lưu toàn bộ cài đặt trên trang này.</p>
        <button class="bg-white text-[#6366f1] border-0 rounded-lg px-4 py-2.5 font-bold text-[13px] cursor-pointer w-full hover:bg-[#f8f7ff] transition shadow-[0_4px_12px_rgba(0,0,0,0.1)]" id="saveSettingsBtn">💾 Lưu cài đặt</button>
      </section>

      <!-- Tóm tắt cấu hình -->
      <section class="bg-white dark:bg-[#171c32] border border-[#e2e8f0] dark:border-[#2a324b] rounded-2xl p-5">
        <h3 class="text-[13px] font-bold text-[#1e293b] dark:text-[#f1f5f9] m-0 mb-3">Tóm tắt cấu hình</h3>
        <div class="flex flex-col gap-2.5">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-[14px]">🤖</span>
              <span class="text-[11px] text-[#475569] dark:text-[#cbd5e1]">Nhà cung cấp AI</span>
            </div>
            <span class="text-[10px] font-semibold text-[#6366f1] dark:text-[#818cf8]" data-ai-active-label>${escapeHtml((aiProviderView(ai.provider) || {}).label || 'AI local')}</span>
          </div>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-[14px]">🎨</span>
              <span class="text-[11px] text-[#475569] dark:text-[#cbd5e1]">Giọng điệu</span>
            </div>
            <span class="text-[10px] font-semibold text-[#475569] dark:text-[#cbd5e1]">${escapeHtml(tone)}</span>
          </div>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-[14px]">🖥️</span>
              <span class="text-[11px] text-[#475569] dark:text-[#cbd5e1]">Giao diện</span>
            </div>
            <span class="text-[10px] font-semibold text-[#475569] dark:text-[#cbd5e1]">${state.settings.preferences?.theme==='dark' ? 'Tối' : state.settings.preferences?.theme==='system' ? 'Hệ thống' : 'Sáng'}</span>
          </div>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-[14px]">👤</span>
              <span class="text-[11px] text-[#475569] dark:text-[#cbd5e1]">Đối tượng</span>
            </div>
            <span class="text-[10px] font-semibold text-[#475569] dark:text-[#cbd5e1]">${audience==='child' ? 'Trẻ em' : audience==='adult' ? 'Người lớn' : 'Học sinh'}</span>
          </div>
          ${selectedLocalModel ? `<div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-[14px]">📦</span>
              <span class="text-[11px] text-[#475569] dark:text-[#cbd5e1]">Model AI</span>
            </div>
            <span class="text-[10px] font-semibold ${selectedLocalModel.installed ? 'text-[#16a34a]' : 'text-[#d97706]'}">${selectedLocalModel.installed ? '✓ Đã cài' : '○ Chưa cài'}</span>
          </div>` : ''}
        </div>
      </section>

      <!-- Liên kết nhanh -->
      <section class="bg-white dark:bg-[#171c32] border border-[#e2e8f0] dark:border-[#2a324b] rounded-2xl p-5">
        <h3 class="text-[13px] font-bold text-[#1e293b] dark:text-[#f1f5f9] m-0 mb-3">Liên kết nhanh</h3>
        <div class="flex flex-col gap-2">
          <button class="text-left text-[12px] text-[#6366f1] dark:text-[#818cf8] hover:underline bg-transparent border-0 cursor-pointer p-0" data-page="create-wizard">🪄 Tạo trò chơi từ giáo án</button>
          <button class="text-left text-[12px] text-[#6366f1] dark:text-[#818cf8] hover:underline bg-transparent border-0 cursor-pointer p-0" data-page="library">📚 Thư viện trò chơi</button>
          <button class="text-left text-[12px] text-[#6366f1] dark:text-[#818cf8] hover:underline bg-transparent border-0 cursor-pointer p-0" data-page="my-projects">📁 Dự án của tôi</button>
        </div>
      </section>
    </aside>
  </div>`;
}
