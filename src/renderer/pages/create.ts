// @ts-nocheck -- migrated legacy UI logic; new contracts are typed in src/shared/types.ts.
function renderCreate() {
  const d = state.draft || {};
  const selectedMode = d.mode || state.settings.ai?.mode || 'offline';
  const assistMode = d.assistMode || '';
  const machine = state.localAiMachine || {};
  const cloud = getCloudProviderConfig(state.settings.ai);
  const selectedLocalModelId = d.localModelId || state.settings.ai?.localModelId || machine.recommendedModelId || state.localAiModels[0]?.id || '';
  const selectedLocalModel = state.localAiModels.find(model => model.id === selectedLocalModelId);
  const gpuDescription = machine.gpu
    ? `${machine.gpu.name}${machine.gpu.vramBytes ? ` · ${formatBytes(machine.gpu.vramBytes)} VRAM` : ''}`
    : machine.gpuDetectionStatus === 'unavailable'
      ? machine.gpuDetectionMessage || 'Không đọc được thông tin GPU.'
      : 'Không phát hiện GPU.';
  const recommendationLabel = model => ({
    recommended: 'Phù hợp với cấu hình hiện tại',
    possible: 'Có thể chạy, nhưng có giới hạn',
    'not-recommended': 'Không khuyến nghị cấu hình này'
  })[model.recommendation] || 'Chưa đánh giá';
  const localStatus = selectedLocalModel?.installed
    ? machine.runtimeInstalled ? 'Model và llama.cpp đã có trên máy. Nhấn “Mở cửa sổ AI local · llama.cpp” để chọn model rồi nhấn “Bắt đầu chạy”.' : 'Model đã có; mở cửa sổ AI local để tải runtime llama.cpp rồi nhấn “Bắt đầu chạy”.'
    : 'Chưa tải model này. Mở cửa sổ AI local để tải và xác minh model trước khi chạy.';
  const localRuntimeLabel = machine.runtimeState === 'READY'
    ? `Đang chạy${machine.runtimeModelId ? ` · ${escapeHtml((state.localAiModels.find(model => model.id === machine.runtimeModelId)?.friendlyName) || machine.runtimeModelId)}` : ''}`
    : machine.runtimeState === 'STARTING' ? 'Đang khởi động…' : 'Chưa chạy';
  const hasSourceText = String(Object.prototype.hasOwnProperty.call(d, 'text') ? d.text : state.importedDoc?.text || '').trim().length >= 40;
  const contentSource = d.contentSource || (hasSourceText ? 'ai' : 'manual');
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
  return `<div class="page-heading"><div><div class="eyebrow">GAME BUILDER · 5 ZONES</div><h1>Tạo trò chơi mới</h1><p>B. Chọn thể loại · C. Tạo nội dung · D. Thiết lập luật chơi · E. Xem trước và xuất bản.</p></div><button class="btn btn-secondary" data-page="library">← Quay lại thư viện</button></div>
    <div class="form-layout"><div class="form-main">
      <section class="form-panel">
        <div class="section-head"><h3>B · Chọn loại trò chơi</h3><span class="tag">5 mẫu có sẵn</span></div>
        <div class="template-grid">${templateCards.map(([id,emoji,title,short,desc,duration])=>`<button type="button" class="template-card ${state.selectedTemplate===id?'selected':''}" data-template="${id}"><span class="template-emoji">${emoji}</span><span class="template-body"><strong>${title}</strong><small class="template-short">${short}</small><small class="template-desc">${desc}</small><em class="template-duration">⏱ ${duration}</em></span></button>`).join('')}</div>
        <div class="field-hint" style="margin-top:10px">${templateDetails[state.selectedTemplate] || templateDetails.quiz}</div>
      </section>      <section class="form-panel">
        <div class="section-head"><h3>C · Tạo nội dung</h3><div class="panel-sub">Thủ công · AI sinh đề · Nhập từ giáo án · Kết hợp — mọi nội dung AI tạo ra đều chỉnh sửa được.</div></div>
        <div class="source-tabs">
          <button type="button" class="source-tab ${contentSource==='manual'?'active':''}" data-source="manual">⌨ Tạo thủ công</button>
          <button type="button" class="source-tab ${contentSource==='ai'?'active':''}" data-source="ai" ${hasSourceText?'':'disabled title="Hãy nhập hoặc tải nội dung bài học trước."'}>✦ Tạo bằng AI</button>
          <button type="button" class="source-tab ${contentSource==='import'?'active':''}" data-source="import" ${state.importedDoc?'':'disabled title="Hãy nhập giáo án từ trang Giáo án trước."'}>📄 Nhập từ giáo án</button>
          <button type="button" class="source-tab ${contentSource==='combine'?'active':''}" data-source="combine" ${hasSourceText?'':'disabled title="Cần có nội dung bài học để kết hợp AI."'}>🔀 Kết hợp</button>
        </div>
        ${contentSource==='manual' ? `<div class="manual-note"><span class="manual-icon">✏</span><div><strong>Nhập tay từng câu hỏi</strong><small>Nhấn “Tạo bản nháp” ở khu vực E để mở trình chỉnh sửa trống: bạn tự nhập câu hỏi, phương án, đáp án đúng và giải thích. Không cần AI, không cần Internet.</small></div></div>` : `<div class="upload-zone"><div class="upload-icon">⇧</div><div class="upload-copy"><strong>${state.importedDoc ? escapeHtml(state.importedDoc.name) : 'Tải giáo án hoặc tài liệu'}</strong><small>${state.importedDoc ? `${state.importedDoc.characters.toLocaleString('vi-VN')} ký tự đã trích xuất` : 'Hỗ trợ DOCX, PDF có chữ, PPTX, TXT, MD'}</small></div><button class="btn btn-secondary btn-small" data-action="import-document">Chọn tệp</button></div>
        <div class="field"><label>NỘI DUNG BÀI HỌC / GIÁO ÁN *</label><textarea id="sourceText" placeholder="Dán nội dung giáo án, kiến thức trọng tâm, tình huống thực tế...">${escapeHtml(Object.prototype.hasOwnProperty.call(d,'text')?d.text:state.importedDoc?.text||'')}</textarea><div class="field-hint">${hasSourceText ? 'Đã có nội dung. Bạn có thể dùng AI để tổng hợp và sinh câu hỏi.' : 'Hãy tải tài liệu hoặc dán ít nhất 40 ký tự vào ô trên.'}</div></div>
        <div class="document-assist-actions"><button class="btn btn-secondary" id="analyzeLocalDocumentBtn" ${hasSourceText?'':'disabled title="Hãy tải tài liệu hoặc dán ít nhất 40 ký tự vào Nội dung bài học trước."'}>✦ Tổng hợp với AI trên máy</button><button class="btn btn-secondary" id="analyzeCloudDocumentBtn" ${hasSourceText?'':'disabled title="Hãy tải tài liệu hoặc dán ít nhất 40 ký tự vào Nội dung bài học trước."'}>☁ Tổng hợp với AI đám mây</button></div>
        <div class="field-hint">${hasSourceText ? 'Chọn AI trên máy để mở cửa sổ AI local · llama.cpp, hoặc chọn AI đám mây để dùng ChatGPT/Gemini. Nội dung được gửi theo cấu hình trong Cài đặt.' : 'Nút AI đang tắt vì chưa có nội dung. Bạn vẫn có thể nhập câu hỏi thủ công ở khu vực E.'}</div>`}
        <div class="field" style="margin-top:14px"><label>CHẾ ĐỘ TẠO TRÒ CHƠI</label><select id="generationMode"><option value="offline" ${selectedMode==='offline'?'selected':''}>Mẫu ngoại tuyến — không gọi mô hình AI</option><option value="local" ${selectedMode==='local'?'selected':''}>AI local tích hợp — llama.cpp và Qwen chạy trên máy</option><option value="online" ${selectedMode==='online'?'selected':''}>AI đám mây — ChatGPT/Gemini</option></select><div class="field-hint">Mẫu ngoại tuyến tạo cấu trúc câu hỏi ngay trên máy, không gửi dữ liệu ra ngoài.</div></div>
        <section class="info-box" id="localAiPanel" style="margin:12px 0 0;display:${assistMode==='local'?'block':'none'}">
          <h3>AI local tích hợp · llama.cpp</h3>
          ${machine.runtimeSupported === false ? '<p>Runtime tích hợp hiện chỉ hỗ trợ Windows x64.</p>' : ''}
          <p><strong>Model đang chọn:</strong> ${escapeHtml(selectedLocalModel ? (selectedLocalModel.friendlyName || selectedLocalModel.displayName) : 'Chưa chọn')} · <strong>Trạng thái chạy:</strong> ${escapeHtml(localRuntimeLabel)}</p>
          <p>${escapeHtml(localStatus)}</p>
          <div style="display:flex;gap:9px;flex-wrap:wrap"><button class="btn btn-secondary" id="openLocalAiModalBtn">Mở cửa sổ AI local · llama.cpp</button></div>
        </section>
        <section class="info-box cloud-ai-panel" id="cloudAiPanel" style="margin:12px 0 0;display:${assistMode==='online'?'block':'none'}">
          <h3>AI đám mây · ${escapeHtml(cloud.label)}</h3>
          <div class="field"><label>NHÀ CUNG CẤP AI</label><select id="documentCloudProvider"><option value="openai" ${cloud.provider==='openai'?'selected':''}>ChatGPT (OpenAI)</option><option value="gemini" ${cloud.provider==='gemini'?'selected':''}>Gemini (Google)</option><option value="custom" ${cloud.provider==='custom'?'selected':''}>API tùy chỉnh tương thích OpenAI</option></select></div>
          <p>Model: <strong>${escapeHtml(cloud.model || 'Chưa cấu hình')}</strong> · Endpoint: <strong>${escapeHtml(cloud.baseUrl || 'Chưa cấu hình')}</strong></p>
          <p>Nội dung tài liệu sẽ được gửi tới nhà cung cấp đã chọn. ${state.settings.ai?.apiKey ? 'API key đã được lưu.' : 'Chưa có API key; hãy cấu hình trong Cài đặt trước khi dùng.'}</p>
          <button class="btn btn-secondary btn-small" data-page="settings">Cấu hình ChatGPT / Gemini</button>
        </section>
      </section>      <section class="form-panel">
        <div class="section-head"><h3>D · Thiết lập trò chơi</h3><div class="panel-sub">Thông tin bài học, luật chơi, điểm số, độ khó, thời lượng, phong cách, người chơi và chế độ thi đấu.</div></div>
        <div class="field-row"><div class="field"><label>TÊN TRÒ CHƠI</label><input id="gameTitle" placeholder="Ví dụ: Thử thách giao thông" value="${escapeHtml(d.title||'')}"></div><div class="field"><label>MÔN HỌC</label><input id="gameSubject" placeholder="Ví dụ: Giáo dục công dân" value="${escapeHtml(d.subject||'')}"></div></div>
        <div class="field-row"><div class="field"><label>LỚP</label><select id="gameGrade"><option value="">Chọn lớp</option>${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${(d.grade||'7')==String(i+1)?'selected':''}>Lớp ${i+1}</option>`).join('')}</select></div><div class="field"><label>SỐ CÂU HỎI</label><select id="questionCount">${[5,8,10,15].map(n=>`<option value="${n}" ${Number(d.questionCount||8)===n?'selected':''}>${n} câu</option>`).join('')}</select></div></div>
        <div class="setup-grid">
          <div class="field"><label>CHẾ ĐỘ TÍNH ĐIỂM</label><select id="setupScoringMode"><option value="cơ bản" ${scoringMode==='cơ bản'?'selected':''}>Cơ bản</option><option value="tốc độ" ${scoringMode==='tốc độ'?'selected':''}>Tốc độ</option><option value="theo độ khó" ${scoringMode==='theo độ khó'?'selected':''}>Theo độ khó</option><option value="thi đấu đội" ${scoringMode==='thi đấu đội'?'selected':''}>Thi đấu đội</option><option value="luyện tập" ${scoringMode==='luyện tập'?'selected':''}>Luyện tập</option></select></div>
          <div class="field"><label>ĐỘ KHÓ</label><select id="setupDifficulty"><option value="dễ" ${String(gameSetup.difficulty??'trung bình')==='dễ'?'selected':''}>Dễ</option><option value="trung bình" ${String(gameSetup.difficulty??'trung bình')==='trung bình'?'selected':''}>Trung bình</option><option value="khó" ${String(gameSetup.difficulty??'trung bình')==='khó'?'selected':''}>Khó</option></select></div>
          <div class="field"><label>THỜI LƯỢNG (PHÚT)</label><input id="setupDuration" type="number" min="1" max="60" value="${setupVal('duration','10')}"></div>
          <div class="field"><label>ĐIỂM / CÂU ĐÚNG</label><input id="setupPoints" type="number" min="10" max="1000" step="10" value="${setupVal('pointsPerCorrect','100')}"></div>
          <div class="field" id="timeBonusField" style="display:${showSpeedBonus?'':'none'}"><label>ĐIỂM THƯỞNG NHANH (TỐI ĐA 50)</label><input id="setupTimeBonus" type="number" min="0" max="50" step="5" value="${setupVal('timeBonus','20')}"></div>
          <div class="field" id="pointsEasyField" style="display:${showDifficultyPoints?'':'none'}"><label>ĐIỂM · DỄ</label><input id="setupPointsEasy" type="number" min="0" max="1000" step="10" value="${setupVal('pointsEasy','100')}"></div>
          <div class="field" id="pointsMediumField" style="display:${showDifficultyPoints?'':'none'}"><label>ĐIỂM · TRUNG BÌNH</label><input id="setupPointsMedium" type="number" min="0" max="1000" step="10" value="${setupVal('pointsMedium','200')}"></div>
          <div class="field" id="pointsHardField" style="display:${showDifficultyPoints?'':'none'}"><label>ĐIỂM · KHÓ</label><input id="setupPointsHard" type="number" min="0" max="1000" step="10" value="${setupVal('pointsHard','300')}"></div>
          <div class="field"><label>PHONG CÁCH</label><select id="setupStyle"><option value="giáo dục" ${String(gameSetup.style??'giáo dục')==='giáo dục'?'selected':''}>Giáo dục</option><option value="trò chơi" ${String(gameSetup.style??'giáo dục')==='trò chơi'?'selected':''}>Trò chơi</option><option value="thi đua" ${String(gameSetup.style??'giáo dục')==='thi đua'?'selected':''}>Thi đua</option></select></div>
          <div class="field"><label>SỐ NGƯỜI CHƠI</label><select id="setupPlayers"><option value="cá nhân" ${String(gameSetup.players??'cá nhân')==='cá nhân'?'selected':''}>Cá nhân</option><option value="đội nhóm" ${String(gameSetup.players??'cá nhân')==='đội nhóm'?'selected':''}>Đội nhóm</option></select></div>
          <div class="field"><label>CHẾ ĐỘ THI ĐẤU</label><select id="setupCompetition"><option value="không" ${String(gameSetup.competition??'không')==='không'?'selected':''}>Không thi đua</option><option value="bảng xếp hạng" ${String(gameSetup.competition??'không')==='bảng xếp hạng'?'selected':''}>Bảng xếp hạng</option><option value="thi đấu trực tiếp" ${String(gameSetup.competition??'không')==='thi đấu trực tiếp'?'selected':''}>Thi đấu trực tiếp</option></select></div>
        </div>
        <div class="field-hint" id="scoringModeHint">${scoringModeHint(scoringMode)}</div>
        <div class="field-hint">Trả lời sai không bị trừ điểm; xem lại giải thích sau mỗi câu. “Tốc độ” cộng điểm nhanh tối đa 50; “Theo độ khó” dùng bảng điểm dễ 100 · trung bình 200 · khó 300; “Luyện tập” bỏ áp lực thời gian. Giáo viên có thể sửa luật trong trình chỉnh sửa.</div>
      </section>
      <section class="form-panel publish-panel">
        <div class="section-head"><h3>E · Xem trước và xuất bản</h3><span class="tag">Giáo viên duyệt trước khi lưu</span></div>
        <div class="publish-actions">
          <button class="btn btn-primary" id="generateBtn">${d.analysis ? '✦ Tạo trò chơi từ nội dung đã tổng hợp' : contentSource==='manual' ? '✦ Mở trình chỉnh sửa câu hỏi' : '✦ Tạo bản nháp trò chơi'}</button>
          <button class="btn btn-secondary" id="previewManualBtn">👁 Xem trước mẫu trống</button>
        </div>
        <div class="field-hint">AI chỉ là trợ lý: mọi câu hỏi, đáp án và điểm số do AI tạo đều chỉnh sửa được trong trình chỉnh sửa. Sau khi lưu, vào “Dự án của tôi” để chạy thử như học sinh, tiếp tục chỉnh sửa và xuất gói .egame chạy ngoại tuyến.</div>
      </section>
      ${assistMode ? renderDocumentAssistResults(d) : ''}
    </div>    <aside><section class="form-panel"><h3>Quy trình đề xuất</h3><div class="panel-sub">Đảm bảo nội dung chính xác trước giờ học.</div><div class="help-list"><div class="help-item"><div class="help-number">1</div><div><strong>Chọn thể loại</strong><p>Chọn 1 trong 5 mẫu phù hợp với mục tiêu tiết học.</p></div></div><div class="help-item"><div class="help-number">2</div><div><strong>Nạp tài liệu</strong><p>Trích xuất văn bản từ giáo án. Tài liệu scan cần OCR bên ngoài.</p></div></div><div class="help-item"><div class="help-number">3</div><div><strong>Giáo viên duyệt</strong><p>Sửa câu hỏi, lựa chọn và đáp án đúng trước khi lưu — kể cả nội dung AI tạo.</p></div></div><div class="help-item"><div class="help-number">4</div><div><strong>Chơi và lưu kết quả</strong><p>Game đã lưu không cần mạng, có thể xuất qua USB.</p></div></div></div></section><section class="form-panel" style="margin-top:16px"><h3>Trạng thái hệ thống</h3><div class="switch-row"><div class="switch-copy"><strong>Thư viện cục bộ</strong><small>Đang lưu trên máy này</small></div><span class="tag">Sẵn sàng</span></div><div class="switch-row"><div class="switch-copy"><strong>API AI đã cấu hình</strong><small>${state.settings.ai?.baseUrl ? escapeHtml(state.settings.ai.baseUrl) : 'Chưa cấu hình endpoint'}</small></div><button class="text-link" data-page="settings">Cấu hình</button></div><div class="switch-row"><div class="switch-copy"><strong>Game runtime</strong><small>5 mẫu giao diện</small></div><span class="tag">v1</span></div></section></aside></div>`;
}
function renderDocumentAssistResults(draft) {
  const analysis = draft.analysis;
  const answers = draft.qaEntries || [];
  const chatMode = draft.assistMode || draft.mode;
  const chatProvider = chatMode === 'online' ? getCloudProviderConfig(state.settings.ai).label : 'llama.cpp';
  return `<section class="ai-chat-panel" id="documentAssistResults" aria-label="Trò chuyện với AI về tài liệu">
    <header class="ai-chat-header"><div class="ai-chat-avatar">✦</div><div><strong>Trò chuyện với AI về tài liệu</strong><small>${analysis ? 'Đã có bản tổng hợp · Hỏi thêm hoặc tạo game từ nội dung này' : 'AI sẽ phân tích tài liệu, sau đó bạn có thể tiếp tục trao đổi'}</small></div><span class="ai-chat-mode">${escapeHtml(chatMode === 'local' ? 'Trên máy · llama.cpp' : chatProvider)}</span></header>
    <div class="ai-chat-messages" id="documentChatMessages" aria-live="polite">
      ${analysis ? `<article class="chat-message user"><div class="chat-message-avatar">GV</div><div class="chat-message-content"><strong>Tổng hợp tài liệu${draft.sourceName ? `: ${escapeHtml(draft.sourceName)}` : ''}</strong><p>Hãy rút ra nội dung trọng tâm để chuẩn bị trò chơi học tập.</p></div></article>
      <article class="chat-message assistant"><div class="chat-message-avatar">✦</div><div class="chat-message-content"><strong>Tổng hợp tài liệu</strong><p>${escapeHtml(analysis.summary)}</p><strong>Ý chính</strong><ul>${analysis.keyPoints.map(point=>`<li>${escapeHtml(point)}</li>`).join('')}</ul><strong>Câu hỏi gợi ý</strong><ol>${analysis.suggestedQuestions.map(question=>`<li>${escapeHtml(question)}</li>`).join('')}</ol><div class="suggested-question-actions"><button class="btn btn-secondary btn-small" id="useSuggestedQuestionsBtn">${draft.useSuggestedQuestions ? '✓ Đã chọn dùng bộ câu hỏi này' : 'Dùng bộ câu hỏi gợi ý trong trò chơi'}</button><button class="btn btn-secondary btn-small" id="regenerateSuggestedQuestionsBtn">↻ Tạo bộ câu hỏi khác</button></div>${analysis.recommendedGames.length ? `<strong>Gợi ý trò chơi</strong><div class="chat-game-suggestions">${analysis.recommendedGames.map(game=>`<button class="chat-suggestion ${state.selectedTemplate===game.template?'selected':''}" data-recommended-template="${game.template}"><span>${escapeHtml(game.title)}</span><small>${escapeHtml(game.reason)}</small><em>Dùng gợi ý</em></button>`).join('')}</div>` : ''}</div></article>` : `<article class="chat-message assistant"><div class="chat-message-avatar">✦</div><div class="chat-message-content"><strong>Trợ lý AI</strong><p>AI đang đọc tài liệu để chuẩn bị bản tổng hợp. Khi hoàn tất, bạn có thể trao đổi thêm và chọn dùng bộ câu hỏi gợi ý trong trò chơi.</p></div></article>`}
      ${answers.map(entry=>`<article class="chat-message user"><div class="chat-message-avatar">GV</div><div class="chat-message-content"><strong>Bạn</strong><p>${escapeHtml(entry.question)}</p></div></article><article class="chat-message assistant"><div class="chat-message-avatar">✦</div><div class="chat-message-content"><strong>Trợ lý AI</strong><p>${escapeHtml(entry.answer.answer)}</p>${entry.answer.suggestedQuestions?.length?`<ol class="chat-generated-questions">${entry.answer.suggestedQuestions.map(question=>`<li>${escapeHtml(question)}</li>`).join('')}</ol><small>Bộ câu hỏi mới đã thay danh sách gợi ý phía trên; bạn có thể chọn dùng trong trò chơi.</small>`:''}${entry.answer.supported===false?'<p class="chat-answer-warning">Câu trả lời có thể diễn đạt khác với tài liệu. Hãy đối chiếu các căn cứ bên dưới trước khi sử dụng.</p>':''}${entry.answer.evidence?.length?`<details class="chat-evidence"><summary>Căn cứ trong tài liệu</summary><ul>${entry.answer.evidence.map(item=>`<li>${escapeHtml(item)}</li>`).join('')}</ul></details>`:''}</div></article>`).join('')}
    </div>
    <form class="ai-chat-composer" id="documentChatForm"><textarea id="documentQuestion" rows="2" placeholder="${analysis ? 'Hỏi thêm về nội dung, yêu cầu làm rõ hoặc đề xuất câu hỏi trò chơi…' : 'Tổng hợp tài liệu để bắt đầu trò chuyện…'}" ${analysis ? '' : 'disabled'}>${escapeHtml(draft.qaQuestion || '')}</textarea><button class="btn btn-primary" id="askDocumentBtn" type="submit" ${analysis ? '' : 'disabled'} aria-label="Gửi câu hỏi">Gửi ↑</button><small>Enter để gửi · Shift+Enter để xuống dòng</small></form>
  </section>`;
}
