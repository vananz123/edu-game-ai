// @ts-nocheck -- migrated legacy UI logic; new contracts are typed in src/shared/types.ts.
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const state = { db: { games: [], sessions: [] }, page: 'home', search: '', filter: 'all', settings: {}, draft: null, importedDoc: null, selectedTemplate: 'scenario', currentGame: null, gameIndex: 0, gameAnswers: [], gameStart: 0, answerLocked: false, lastSummary: null };
const pageNames = { home: 'Tổng quan', library: 'Thư viện trò chơi', create: 'Tạo trò chơi', sessions: 'Lịch sử kết quả', settings: 'Cài đặt' };
const icons = { quiz: '🧠', scenario: '🚦', matching: '🧩' };
const coverClasses = ['cover-purple','cover-mint','cover-orange','cover-blue','cover-pink'];
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(message, duration = 3000) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), duration); }
function fmtDate(value) { try { return new Date(value).toLocaleDateString('vi-VN', { day:'2-digit', month:'2-digit', year:'numeric' }); } catch { return '—'; } }
function fmtDateTime(value) { try { return new Date(value).toLocaleString('vi-VN', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }); } catch { return '—'; } }
function totalQuestions() { return state.db.games.reduce((n, g) => n + (g.questions?.length || 0), 0); }
function gameCard(game, index = 0) {
  const template = game.template || 'quiz';
  return `<article class="game-card">
    <div class="game-cover ${coverClasses[index % coverClasses.length]}"><div class="cover-deco"></div><div class="cover-deco two"></div><span class="game-badge">${escapeHtml(templateLabel(template))}</span><div class="cover-emoji">${icons[template] || '🎮'}</div></div>
    <div class="card-body">
      <div class="card-title-row"><div class="card-title">${escapeHtml(game.title)}</div><button class="more-btn" data-action="edit" data-id="${escapeHtml(game.id)}" title="Chỉnh sửa">•••</button></div>
      <p class="card-desc">${escapeHtml(game.description || 'Trò chơi học tập tương tác, có thể chơi ngoại tuyến.')}</p>
      <div class="meta-tags"><span class="tag">${escapeHtml(game.subject || 'Chưa phân môn')}</span><span class="tag">${game.grade ? 'Lớp ' + escapeHtml(game.grade) : 'Mọi lớp'}</span><span class="tag">${game.questions?.length || 0} câu</span></div>
      <div class="card-meta"><span>▣ ${escapeHtml(game.topic || 'Bài học')}</span><span>↻ ${fmtDate(game.updatedAt || game.createdAt)}</span></div>
      <div class="card-actions"><button class="btn btn-primary btn-small" data-action="play" data-id="${escapeHtml(game.id)}">▶ Chơi ngay</button><button class="btn btn-secondary btn-small" data-action="edit" data-id="${escapeHtml(game.id)}">Chỉnh sửa</button></div>
    </div>
  </article>`;
}
function templateLabel(template) { return ({ quiz: 'ĐẤU TRƯỜNG KIẾN THỨC', scenario: 'THỬ THÁCH TÌNH HUỐNG', matching: 'GHÉP CẶP KIẾN THỨC' })[template] || 'TRÒ CHƠI HỌC TẬP'; }
function renderHome() {
  const recent = state.db.games.slice(0, 3);
  const sessions = state.db.sessions.slice(0, 4);
  return `<div class="page-heading"><div><div class="eyebrow">WORKSPACE / OVERVIEW</div><h1>Chào mừng đến với EduGame Studio 👋</h1><p>Biến giáo án thành trải nghiệm học tập sống động — chuẩn bị một lần, sử dụng nhiều lần.</p></div><button class="btn btn-primary" data-page="create">✳ &nbsp;Tạo trò chơi mới</button></div>
    <section class="hero"><div class="hero-copy"><div class="hero-label">YOUR CLASSROOM, YOUR GAME</div><h2>Mỗi bài học là một cuộc phiêu lưu.</h2><p>Tạo trò chơi từ tài liệu, tổ chức thi đua trong lớp và lưu tất cả trên máy tính. Không cần Internet khi chơi.</p><button class="btn" data-page="create">Bắt đầu tạo game <span>→</span></button></div><div class="hero-art"><div class="hero-orbit"><div class="hero-book">✦</div></div><div class="hero-star">✧</div></div></section>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-icon purple">▦</div><div><div class="stat-label">TRÒ CHƠI ĐÃ LƯU</div><div class="stat-value">${state.db.games.length}</div><div class="stat-foot">Trong thư viện thiết bị</div></div></div>
      <div class="stat-card"><div class="stat-icon green">◉</div><div><div class="stat-label">CÂU HỎI SẴN SÀNG</div><div class="stat-value">${totalQuestions()}</div><div class="stat-foot">Có thể chơi ngoại tuyến</div></div></div>
      <div class="stat-card"><div class="stat-icon orange">♧</div><div><div class="stat-label">LƯỢT CHƠI</div><div class="stat-value">${state.db.sessions.length}</div><div class="stat-foot">Kết quả được lưu cục bộ</div></div></div>
      <div class="stat-card"><div class="stat-icon blue">⚡</div><div><div class="stat-label">CHẾ ĐỘ</div><div class="stat-value" style="font-size:18px">Offline-first</div><div class="stat-foot">AI online là tùy chọn</div></div></div>
    </div>
    <div class="section-head"><h3>Trò chơi gần đây</h3><button class="text-link" data-page="library">Xem toàn bộ thư viện →</button></div>
    ${recent.length ? `<div class="game-grid">${recent.map(gameCard).join('')}</div>` : emptyState('Chưa có trò chơi','Tạo trò chơi đầu tiên từ tài liệu hoặc nhập nội dung của bạn.','Tạo trò chơi','create')}
    <div class="two-col"><section class="panel"><h3>Hoạt động gần đây</h3><div class="panel-sub">Các lượt chơi được lưu trên thiết bị này</div>${sessions.length ? sessions.map(s => `<div class="activity-row"><div class="activity-icon">🏆</div><div class="activity-copy"><strong>${escapeHtml(s.gameTitle || 'Trò chơi')}</strong><small>${escapeHtml(s.playerName || 'Người chơi')} · ${fmtDateTime(s.createdAt)}</small></div><div class="activity-score">${Number(s.percent || 0)}%</div></div>`).join('') : `<div class="empty-state" style="padding:25px"><div class="big">◷</div><p>Chơi một trò chơi để kết quả xuất hiện ở đây.</p></div>`}</section>
      <section class="panel"><h3>Lối tắt</h3><div class="panel-sub">Các thao tác thường dùng</div><div class="quick-grid"><button class="quick-action" data-page="create"><span class="quick-icon">✳</span><span><strong>Tạo game từ giáo án</strong><small>DOCX, PDF, PPTX hoặc văn bản</small></span><span class="quick-arrow">→</span></button><button class="quick-action" data-action="import-game"><span class="quick-icon">⇧</span><span><strong>Nhập trò chơi</strong><small>Mở gói game từ USB</small></span><span class="quick-arrow">→</span></button><button class="quick-action" data-page="settings"><span class="quick-icon">⚙</span><span><strong>Cấu hình AI</strong><small>Online API hoặc Ollama local</small></span><span class="quick-arrow">→</span></button></div></section></div>`;
}
function emptyState(title, desc, button, page) { return `<div class="empty-state"><div class="big">🎮</div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(desc)}</p><button class="btn btn-primary" data-page="${page}">${escapeHtml(button)}</button></div>`; }
function renderLibrary() {
  const games = state.db.games.filter(g => (`${g.title} ${g.subject} ${g.topic} ${g.grade}`).toLowerCase().includes(state.search.toLowerCase()) && (state.filter === 'all' || g.template === state.filter));
  return `<div class="page-heading"><div><div class="eyebrow">YOUR CONTENT</div><h1>Thư viện trò chơi</h1><p>Quản lý, chỉnh sửa và khởi chạy các trò chơi đã lưu trên thiết bị.</p></div><button class="btn btn-primary" data-page="create">✳ Tạo trò chơi</button></div>
    <div class="toolbar"><div class="search-box"><input id="librarySearch" placeholder="Tìm theo tên, môn học, lớp..." value="${escapeHtml(state.search)}"></div><select class="select" id="templateFilter"><option value="all">Tất cả thể loại</option><option value="quiz" ${state.filter==='quiz'?'selected':''}>Đấu trường kiến thức</option><option value="scenario" ${state.filter==='scenario'?'selected':''}>Tình huống</option><option value="matching" ${state.filter==='matching'?'selected':''}>Ghép cặp</option></select><button class="btn btn-secondary" data-action="import-game">⇧ Nhập game</button><button class="btn btn-secondary" data-action="export-first">⇩ Xuất game</button></div>
    ${games.length ? `<div class="game-grid">${games.map(gameCard).join('')}</div>` : emptyState('Không tìm thấy trò chơi','Thử từ khóa khác hoặc tạo trò chơi mới.','Tạo trò chơi','create')}`;
}
function renderCreate() {
  const d = state.draft || {};
  return `<div class="page-heading"><div><div class="eyebrow">GAME BUILDER</div><h1>Tạo trò chơi mới</h1><p>Đưa kiến thức vào game. Bạn có thể tạo bản nháp ngoại tuyến hoặc dùng AI khi đã cấu hình.</p></div><button class="btn btn-secondary" data-page="library">← Quay lại thư viện</button></div>
    <div class="form-layout"><section class="form-panel"><h3>1. Nguồn nội dung</h3><div class="panel-sub">Nhập tài liệu hoặc dán nội dung bài học vào đây.</div>
      <div class="upload-zone"><div class="upload-icon">⇧</div><div class="upload-copy"><strong>${state.importedDoc ? escapeHtml(state.importedDoc.name) : 'Tải giáo án hoặc tài liệu'}</strong><small>${state.importedDoc ? `${state.importedDoc.characters.toLocaleString('vi-VN')} ký tự đã trích xuất` : 'Hỗ trợ DOCX, PDF có chữ, PPTX, TXT, MD'}</small></div><button class="btn btn-secondary btn-small" data-action="import-document">Chọn tệp</button></div>
      <div class="field"><label>NỘI DUNG BÀI HỌC *</label><textarea id="sourceText" placeholder="Dán nội dung giáo án, kiến thức trọng tâm, tình huống thực tế...">${escapeHtml(d.text || state.importedDoc?.text || '')}</textarea><div class="field-hint">Nội dung sẽ được xử lý trên máy trước khi gửi tới dịch vụ AI. Chế độ ngoại tuyến không gửi dữ liệu ra ngoài.</div></div>
      <div class="field-row"><div class="field"><label>Tên trò chơi</label><input id="gameTitle" placeholder="Ví dụ: Thử thách giao thông" value="${escapeHtml(d.title || '')}"></div><div class="field"><label>Môn học</label><input id="gameSubject" placeholder="Ví dụ: Giáo dục công dân" value="${escapeHtml(d.subject || '')}"></div></div>
      <div class="field-row"><div class="field"><label>Lớp</label><select id="gameGrade"><option value="">Chọn lớp</option>${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${(d.grade||'7')==String(i+1)?'selected':''}>Lớp ${i+1}</option>`).join('')}</select></div><div class="field"><label>Số câu hỏi</label><select id="questionCount">${[5,8,10,15].map(n=>`<option value="${n}" ${Number(d.questionCount||8)===n?'selected':''}>${n} câu</option>`).join('')}</select></div></div>
      <h3 style="margin-top:22px">2. Chọn thể loại trò chơi</h3><div class="panel-sub">Có thể đổi thể loại sau khi tạo.</div>
      <div class="template-options">${[['quiz','🧠','Đấu trường kiến thức','Câu hỏi nhanh, tính điểm và thi đua'],['scenario','🚦','Thử thách tình huống','Ra quyết định, giải thích hậu quả'],['matching','🧩','Ghép cặp kiến thức','Ghép thuật ngữ với định nghĩa']].map(([id,emoji,title,desc])=>`<button class="template-option ${state.selectedTemplate===id?'selected':''}" data-template="${id}"><div class="template-emoji">${emoji}</div><strong>${title}</strong><small>${desc}</small></button>`).join('')}</div>
      <div class="field"><label>CHẾ ĐỘ TẠO NỘI DUNG</label><select id="generationMode"><option value="offline" ${state.settings.ai?.mode!=='online'?'selected':''}>Ngoại tuyến — tạo bản nháp theo mẫu (cần giáo viên duyệt)</option><option value="online" ${state.settings.ai?.mode==='online'?'selected':''}>AI trực tuyến — dùng API đã cấu hình</option></select><div class="field-hint">AI local qua Ollama có thể cấu hình ở Cài đặt bằng endpoint OpenAI-compatible.</div></div>
      <div style="display:flex;gap:9px;flex-wrap:wrap"><button class="btn btn-primary" id="generateBtn">✦ Tạo bản nháp trò chơi</button><button class="btn btn-secondary" id="previewManualBtn">Tạo game từ mẫu trống</button></div>
    </section>
    <aside><section class="form-panel"><h3>Quy trình đề xuất</h3><div class="panel-sub">Đảm bảo nội dung chính xác trước giờ học.</div><div class="help-list"><div class="help-item"><div class="help-number">1</div><div><strong>Nạp tài liệu</strong><p>Trích xuất văn bản từ giáo án. Tài liệu scan cần OCR bên ngoài.</p></div></div><div class="help-item"><div class="help-number">2</div><div><strong>Tạo bản nháp</strong><p>AI online hoặc mẫu ngoại tuyến tạo cấu trúc câu hỏi.</p></div></div><div class="help-item"><div class="help-number">3</div><div><strong>Giáo viên duyệt</strong><p>Sửa câu hỏi, lựa chọn và đáp án đúng trước khi lưu.</p></div></div><div class="help-item"><div class="help-number">4</div><div><strong>Chơi và lưu kết quả</strong><p>Game đã lưu không cần mạng, có thể xuất qua USB.</p></div></div></div></section><section class="form-panel" style="margin-top:16px"><h3>Trạng thái hệ thống</h3><div class="switch-row"><div class="switch-copy"><strong>Thư viện cục bộ</strong><small>Đang lưu trên máy này</small></div><span class="tag">Sẵn sàng</span></div><div class="switch-row"><div class="switch-copy"><strong>AI online</strong><small>${state.settings.ai?.baseUrl ? escapeHtml(state.settings.ai.baseUrl) : 'Chưa kiểm tra kết nối'}</small></div><button class="text-link" data-page="settings">Cấu hình</button></div><div class="switch-row"><div class="switch-copy"><strong>Game runtime</strong><small>3 mẫu giao diện</small></div><span class="tag">v1</span></div></section></aside></div>`;
}
function renderSessions() {
  const sessions = state.db.sessions;
  return `<div class="page-heading"><div><div class="eyebrow">CLASSROOM REPORTS</div><h1>Lịch sử kết quả</h1><p>Xem lại điểm số của người chơi và đội nhóm trên thiết bị này.</p></div><button class="btn btn-secondary" data-action="export-results">⇩ Xuất CSV</button></div>
    <section class="panel"><div class="section-head"><h3>Các lượt chơi gần đây</h3><span class="tag">${sessions.length} lượt</span></div>${sessions.length ? `<div class="session-row header"><span>TRÒ CHƠI</span><span>NGƯỜI CHƠI / ĐỘI</span><span>THỜI GIAN</span><span>ĐIỂM</span></div>${sessions.map(s=>`<div class="session-row"><strong>${escapeHtml(s.gameTitle||'Trò chơi')}</strong><span>${escapeHtml(s.playerName||'Người chơi')}</span><span>${fmtDateTime(s.createdAt)}</span><span class="score-pill">${Number(s.points||0)} điểm · ${Number(s.percent||0)}%</span></div>`).join('')}`:emptyState('Chưa có kết quả','Kết quả sẽ tự lưu sau khi kết thúc một lượt chơi.','Mở thư viện','library')}</section>`;
}
function renderSettings() {
  const ai = state.settings.ai || {};
  return `<div class="page-heading"><div><div class="eyebrow">PREFERENCES & INTEGRATIONS</div><h1>Cài đặt ứng dụng</h1><p>Quản lý chế độ AI và hành vi của EduGame Studio.</p></div><button class="btn btn-primary" id="saveSettingsBtn">Lưu cài đặt</button></div>
    <div class="settings-grid"><section class="form-panel"><h3>Nhà cung cấp AI</h3><div class="panel-sub">Chọn online API hoặc dịch vụ local tương thích OpenAI.</div>
      <div class="field"><label>CHẾ ĐỘ MẶC ĐỊNH</label><select id="settingAiMode"><option value="offline" ${ai.mode!=='online'?'selected':''}>Ngoại tuyến — không gọi API</option><option value="online" ${ai.mode==='online'?'selected':''}>Online API / local endpoint</option></select></div>
      <div class="field"><label>API BASE URL</label><input id="settingBaseUrl" value="${escapeHtml(ai.baseUrl || 'http://127.0.0.1:11434/v1')}" placeholder="https://api.example.com/v1"><div class="field-hint">Ollama thường dùng http://127.0.0.1:11434/v1 nếu phiên bản hỗ trợ API tương thích OpenAI.</div></div>
      <div class="field"><label>TÊN MODEL</label><input id="settingModel" value="${escapeHtml(ai.model || 'qwen2.5:7b')}" placeholder="Tên model"></div>
      <div class="field"><label>API KEY (nếu cần)</label><input id="settingApiKey" type="password" value="${escapeHtml(ai.apiKey || '')}" placeholder="Để trống nếu endpoint không cần khóa"><div class="field-hint">Ứng dụng dùng safeStorage của Electron để mã hóa khóa khi hệ điều hành hỗ trợ. Không nên dùng khóa cá nhân nhúng sẵn trong bản phát hành.</div></div>
      <button class="btn btn-secondary" id="testAiBtn">Kiểm tra kết nối AI</button>
    </section><section class="form-panel"><h3>Dữ liệu và trải nghiệm</h3><div class="panel-sub">Thiết lập cục bộ cho lớp học.</div>
      <div class="switch-row"><div class="switch-copy"><strong>Chữ lớn khi chơi</strong><small>Ưu tiên màn hình trình chiếu</small></div><input type="checkbox" class="switch" id="settingLargeText" ${state.settings.preferences?.largeText!==false?'checked':''}></div>
      <div class="switch-row"><div class="switch-copy"><strong>Âm thanh giao diện</strong><small>Dự phòng cho phiên bản sau</small></div><input type="checkbox" class="switch" id="settingSound" ${state.settings.preferences?.sound!==false?'checked':''}></div>
      <div class="info-box" style="margin-top:18px"><strong>Quyền riêng tư</strong><br>Trò chơi và kết quả được lưu trong thư mục dữ liệu ứng dụng trên máy. Khi dùng AI online, phần nội dung bài học được gửi tới endpoint đã cấu hình. Không có đồng bộ đám mây tự động.</div>
      <div class="info-box" style="margin-top:12px"><strong>Định dạng gói</strong><br><code>.egame</code> là JSON có phiên bản schema. Chỉ nhập gói từ nguồn tin cậy; nội dung không được phép thực thi mã.</div>
      <div style="margin-top:16px"><button class="btn btn-secondary" data-action="import-game">⇧ Nhập trò chơi</button> <button class="btn btn-secondary" data-action="export-first">⇩ Xuất trò chơi</button></div>
    </section></div>`;
}
function render() {
  $('#pageCrumb').textContent = pageNames[state.page] || 'EduGame Studio';
  $$('.nav-item[data-page]').forEach(el => el.classList.toggle('active', el.dataset.page === state.page));
  $('#navGameCount').textContent = state.db.games.length;
  const renderers = { home: renderHome, library: renderLibrary, create: renderCreate, sessions: renderSessions, settings: renderSettings };
  $('#pageContent').innerHTML = (renderers[state.page] || renderHome)();
  wirePage();
}
function navigate(page) { state.page = page; render(); }
function wirePage() {
  $('#pageContent').querySelectorAll('[data-page]').forEach(el => el.addEventListener('click', () => navigate(el.dataset.page)));
  $('#pageContent').querySelectorAll('[data-action]').forEach(el => el.addEventListener('click', () => handleAction(el.dataset.action, el.dataset.id)));
  $('#pageContent').querySelectorAll('[data-template]').forEach(el => el.addEventListener('click', () => { state.selectedTemplate = el.dataset.template; render(); }));
  const search = $('#librarySearch'); if (search) search.addEventListener('input', e => { state.search = e.target.value; const pos = e.target.selectionStart; render(); const next = $('#librarySearch'); next.focus(); next.setSelectionRange(pos,pos); });
  const filter = $('#templateFilter'); if (filter) filter.addEventListener('change', e => { state.filter = e.target.value; render(); });
  $('#generateBtn')?.addEventListener('click', generateGame);
  $('#previewManualBtn')?.addEventListener('click', createBlankGame);
  $('#saveSettingsBtn')?.addEventListener('click', saveSettings);
  $('#testAiBtn')?.addEventListener('click', testAi);
}
async function handleAction(action, id) {
  try {
    if (action === 'play') playGame(findGame(id));
    if (action === 'edit') editGame(findGame(id));
    if (action === 'import-document') {
      const doc = await window.eduGame.importDocument();
      if (doc) { state.importedDoc = doc; const old = state.draft || {}; state.draft = { ...old, text: doc.text, sourceName: doc.name }; render(); toast(`Đã trích xuất ${doc.characters.toLocaleString('vi-VN')} ký tự.`); }
    }
    if (action === 'import-game') {
      const game = await window.eduGame.importGame();
      if (game) { const saved = await window.eduGame.saveGame(game); await refreshDb(); toast(`Đã nhập “${saved.title}”`); }
    }
    if (action === 'export-first') {
      const game = state.db.games[0];
      if (!game) return toast('Thư viện chưa có trò chơi để xuất.');
      const result = await window.eduGame.exportGame(game);
      if (result?.ok) toast('Đã xuất gói trò chơi.');
    }
    if (action === 'delete') {
      if (confirm('Xóa trò chơi này khỏi thư viện?')) { await window.eduGame.deleteGame(id); await refreshDb(); toast('Đã xóa trò chơi.'); }
    }
    if (action === 'export-results') exportResults();
  } catch (e) { toast(e.message || 'Đã xảy ra lỗi.'); }
}
function findGame(id) { return state.db.games.find(g => g.id === id); }
function collectDraft() {
  return {
    text: $('#sourceText')?.value || state.draft?.text || state.importedDoc?.text || '',
    title: $('#gameTitle')?.value || '',
    subject: $('#gameSubject')?.value || '',
    grade: $('#gameGrade')?.value || '',
    questionCount: $('#questionCount')?.value || '8',
    template: state.selectedTemplate,
    sourceName: state.importedDoc?.name || state.draft?.sourceName || ''
  };
}
async function generateGame() {
  const payload = collectDraft();
  if (!payload.text.trim()) return toast('Hãy nạp tài liệu hoặc dán nội dung bài học trước.');
  const button = $('#generateBtn'); button.disabled = true; button.textContent = 'Đang tạo bản nháp…';
  try {
    const mode = $('#generationMode').value;
    const settings = { ...state.settings.ai, mode };
    const result = await window.eduGame.generateGame({ ...payload, ...settings, mode });
    state.draft = { ...payload, game: result.game };
    openEditor(result.game, true, result.warning || (result.provider === 'offline-template' ? 'Bản nháp ngoại tuyến cần giáo viên kiểm tra kỹ trước khi sử dụng.' : 'AI đã tạo bản nháp. Hãy kiểm tra đáp án và nội dung trước khi lưu.'));
  } catch (e) { toast(e.message || 'Không tạo được game.'); }
  finally { if ($('#generateBtn')) { $('#generateBtn').disabled = false; $('#generateBtn').textContent = '✦ Tạo bản nháp trò chơi'; } }
}
function createBlankGame() {
  const p = collectDraft();
  const game = { id: '', title: p.title || 'Trò chơi mới', subject: p.subject, grade: p.grade, topic: '', template: p.template, description: 'Trò chơi được tạo trong EduGame Studio.', sourceName: p.sourceName, questions: [{ id:'q1', type:'multiple-choice', prompt:'Nhập câu hỏi tại đây', options:[{id:'a',text:'Phương án A'},{id:'b',text:'Phương án B'},{id:'c',text:'Phương án C'},{id:'d',text:'Phương án D'}], correctOptionId:'a', explanation:'Nhập phần giải thích đáp án.', points:100 }] };
  openEditor(game, true, 'Bạn đang chỉnh sửa một game mới. Hãy cập nhật câu hỏi và đáp án.');
}
function editGame(game) { if (!game) return; openEditor(JSON.parse(JSON.stringify(game)), false, 'Chỉnh sửa nội dung trò chơi.'); }
function openEditor(game, isNew, note = '') {
  const root = $('#modalRoot');
  root.innerHTML = `<div class="modal-backdrop"><div class="modal"><div class="modal-head"><div><h2>${isNew ? 'Duyệt và hoàn thiện trò chơi' : 'Chỉnh sửa trò chơi'}</h2><div class="small muted" style="margin-top:5px">${escapeHtml(note)}</div></div><button class="modal-close" data-close>✕</button></div><div class="modal-body">
    <div class="field-row"><div class="field"><label>TÊN TRÒ CHƠI</label><input id="editTitle" value="${escapeHtml(game.title)}"></div><div class="field"><label>THỂ LOẠI</label><select id="editTemplate">${[['quiz','Đấu trường kiến thức'],['scenario','Thử thách tình huống'],['matching','Ghép cặp kiến thức']].map(([v,l])=>`<option value="${v}" ${game.template===v?'selected':''}>${l}</option>`).join('')}</select></div></div>
    <div class="field-row"><div class="field"><label>MÔN HỌC</label><input id="editSubject" value="${escapeHtml(game.subject||'')}"></div><div class="field"><label>LỚP</label><input id="editGrade" value="${escapeHtml(game.grade||'')}"></div></div>
    <div class="field"><label>MÔ TẢ</label><input id="editDescription" value="${escapeHtml(game.description||'')}"></div>
    <div class="section-head"><h3>Câu hỏi <span class="tag">${game.questions.length}</span></h3><button class="btn btn-secondary btn-small" id="addQuestionBtn">＋ Thêm câu hỏi</button></div>
    <div id="editorQuestions">${game.questions.map((q,i)=>questionEditor(q,i)).join('')}</div>
    </div><div class="modal-foot"><button class="btn btn-secondary" data-close>Hủy</button><button class="btn btn-secondary" id="saveExportBtn">Lưu và xuất</button><button class="btn btn-primary" id="saveGameBtn">✓ Lưu vào thư viện</button></div></div></div>`;
  root.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', () => root.innerHTML = ''));
  $('#addQuestionBtn', root).addEventListener('click', () => { const i = $$('.editor-question', root).length; $('#editorQuestions', root).insertAdjacentHTML('beforeend', questionEditor({id:`q${i+1}`,prompt:'Câu hỏi mới',options:[{id:'a',text:'Phương án A'},{id:'b',text:'Phương án B'},{id:'c',text:'Phương án C'}],correctOptionId:'a',explanation:'',points:100},i)); });
  $('#saveGameBtn', root).addEventListener('click', () => saveEditedGame(game, false));
  $('#saveExportBtn', root).addEventListener('click', () => saveEditedGame(game, true));
}
function questionEditor(q, i) {
  const options = q.options || [];
  return `<div class="editor-question" data-question-index="${i}"><div class="editor-question-head"><strong>CÂU ${i+1}</strong><button class="text-link danger-text" data-remove-question>✕ Xóa câu</button></div><textarea data-field="prompt" rows="2" placeholder="Nội dung câu hỏi">${escapeHtml(q.prompt||'')}</textarea><div class="editor-options">${options.map((o,j)=>`<input data-option-id="${escapeHtml(o.id)}" value="${escapeHtml(o.text)}" placeholder="Phương án ${j+1}">`).join('')}</div><div class="correct-select"><span>Đáp án đúng:</span><select data-field="correct">${options.map((o,j)=>`<option value="${escapeHtml(o.id)}" ${o.id===q.correctOptionId?'selected':''}>${String.fromCharCode(65+j)} — ${escapeHtml(o.id)}</option>`).join('')}</select><span>Điểm</span><input data-field="points" type="number" min="0" max="1000" value="${Number(q.points)||100}" style="width:70px;margin:0;padding:6px"></div><textarea data-field="explanation" rows="2" placeholder="Giải thích đáp án">${escapeHtml(q.explanation||'')}</textarea></div>`;
}
async function saveEditedGame(original, exportAfter) {
  const root = $('#modalRoot');
  const questions = $$('.editor-question', root).map((el,i) => {
    const opts = $$('[data-option-id]', el).map(input => ({ id: input.dataset.optionId, text: input.value.trim() }));
    return { id: original.questions[i]?.id || `q${i+1}`, type: $('#editTemplate',root).value === 'scenario' ? 'scenario':'multiple-choice', prompt: $('[data-field="prompt"]',el).value.trim(), options: opts, correctOptionId: $('[data-field="correct"]',el).value, points: Number($('[data-field="points"]',el).value)||100, explanation: $('[data-field="explanation"]',el).value.trim() };
  });
  if (!$('#editTitle',root).value.trim()) return toast('Tên trò chơi không được để trống.');
  if (!questions.length || questions.some(q => !q.prompt || q.options.length < 2 || q.options.some(o => !o.text))) return toast('Mỗi câu cần nội dung và ít nhất 2 phương án đầy đủ.');
  const game = { ...original, title: $('#editTitle',root).value.trim(), template: $('#editTemplate',root).value, subject: $('#editSubject',root).value.trim(), grade: $('#editGrade',root).value.trim(), description: $('#editDescription',root).value.trim(), questions };
  try {
    const saved = await window.eduGame.saveGame(game);
    if (exportAfter) await window.eduGame.exportGame(saved);
    root.innerHTML = ''; await refreshDb(); navigate('library'); toast(`Đã lưu “${saved.title}”.`);
  } catch(e) { toast(e.message || 'Không lưu được trò chơi.'); }
}
function playGame(game) {
  if (!game || !game.questions?.length) return toast('Trò chơi chưa có câu hỏi.');
  state.currentGame = game; state.gameIndex = 0; state.gameAnswers = []; state.gameStart = Date.now(); state.answerLocked = false;
  openPlayModal();
}
function openPlayModal() {
  const root = $('#modalRoot');
  root.innerHTML = `<div class="modal-backdrop"><div class="modal" style="width:min(980px,96vw);background:#11152b;border:1px solid #303651"><div class="modal-head" style="background:#11152b;border-color:#303651;color:#fff"><div><h2>${escapeHtml(state.currentGame.title)}</h2><div class="small" style="color:#aeb5ce;margin-top:4px">CHẾ ĐỘ TRÌNH CHIẾU · NGOẠI TUYẾN</div></div><button class="modal-close" data-play-close style="background:#292f49;color:#fff">✕</button></div><div class="modal-body" id="playBody" style="padding:18px"></div></div></div>`;
  $('[data-play-close]',root).addEventListener('click', () => root.innerHTML = '');
  renderQuestion();
}
function renderQuestion() {
  const game = state.currentGame, q = game.questions[state.gameIndex], root = $('#playBody');
  if (!q) return renderResults();
  state.answerLocked = false;
  const progress = Math.round(state.gameIndex / game.questions.length * 100);
  root.innerHTML = `<div class="game-stage"><div class="stage-top"><span>${escapeHtml(game.subject || 'TRÒ CHƠI HỌC TẬP')} · ${game.grade ? 'LỚP '+escapeHtml(game.grade) : 'MỌI LỚP'}</span><span>CÂU ${state.gameIndex+1} / ${game.questions.length} &nbsp; · &nbsp; 🏆 ${state.gameAnswers.reduce((s,a)=>s+a.points,0)} điểm</span></div><div class="stage-progress"><div style="width:${progress}%"></div></div><div class="stage-center"><div class="stage-kicker">${q.type==='scenario'?'TÌNH HUỐNG THỰC TẾ':'THỬ THÁCH KIẾN THỨC'}</div><div class="stage-question">${escapeHtml(q.prompt).replace(/\n/g,'<br>')}</div><div class="answer-grid">${q.options.map((o,i)=>`<button class="answer-option" data-answer="${escapeHtml(o.id)}"><span class="letter">${String.fromCharCode(65+i)}</span><span>${escapeHtml(o.text)}</span></button>`).join('')}</div><div id="answerFeedback"></div><div class="stage-bottom"><span>⚡ Đúng nhanh trong 8 giây: +20 điểm thưởng</span><button class="btn hidden" id="nextQuestionBtn">${state.gameIndex===game.questions.length-1?'Xem kết quả':'Câu tiếp theo'} →</button></div></div></div>`;
  $$('.answer-option',root).forEach(btn => btn.addEventListener('click', () => chooseAnswer(q, btn.dataset.answer)));
}
function chooseAnswer(question, optionId) {
  if (state.answerLocked) return; state.answerLocked = true;
  const elapsed = (Date.now() - state.gameStart) / 1000;
  const correct = optionId === question.correctOptionId;
  const points = correct ? (Number(question.points)||100) + (elapsed <= 8 ? 20 : 0) : 0;
  state.gameAnswers.push({ questionId: question.id, selectedOptionId: optionId, correct, points, elapsedSeconds: elapsed });
  $$('.answer-option').forEach(btn => { btn.disabled = true; if (btn.dataset.answer === question.correctOptionId) btn.classList.add('correct'); else if (btn.dataset.answer === optionId) btn.classList.add('wrong'); });
  const feedback = $('#answerFeedback');
  feedback.className = `feedback ${correct?'good':'bad'}`;
  feedback.innerHTML = `<strong>${correct?'✓ Chính xác!':'✕ Chưa chính xác.'}</strong> ${correct?`Bạn nhận ${points} điểm.`:'Đáp án đúng đã được đánh dấu.'}<br>${escapeHtml(question.explanation || 'Hãy ôn lại nội dung bài học.')}`;
  $('#nextQuestionBtn').classList.remove('hidden');
  $('#nextQuestionBtn').onclick = () => { state.gameIndex++; state.gameStart = Date.now(); renderQuestion(); };
}
async function renderResults() {
  const game = state.currentGame;
  const points = state.gameAnswers.reduce((s,a)=>s+a.points,0);
  const max = game.questions.reduce((s,q)=>s+(Number(q.points)||100)+20,0);
  const correct = state.gameAnswers.filter(a=>a.correct).length;
  const percent = max ? Math.round(points/max*100) : 0;
  state.lastSummary = { points, max, correct, total: game.questions.length, percent };
  $('#playBody').innerHTML = `<div class="game-stage"><div class="result-screen"><div class="result-medal">${percent>=80?'🏆':percent>=50?'🎖️':'🌱'}</div><div class="stage-kicker">THỬ THÁCH HOÀN THÀNH</div><h2>${percent>=80?'Xuất sắc!':percent>=50?'Làm tốt lắm!':'Tiếp tục cố gắng!'}</h2><p>${escapeHtml(game.title)}</p><div class="result-score">${points.toLocaleString('vi-VN')} điểm</div><p>Trả lời đúng ${correct}/${game.questions.length} câu · ${percent}% điểm tối đa</p><div class="result-actions"><button class="btn btn-secondary" id="closeResultBtn">Đóng</button><button class="btn btn-secondary" id="replayBtn">↻ Chơi lại</button><button class="btn btn-primary" id="saveResultBtn">Lưu kết quả</button></div></div></div>`;
  $('#closeResultBtn').onclick = () => $('#modalRoot').innerHTML = '';
  $('#replayBtn').onclick = () => { state.gameIndex=0;state.gameAnswers=[];state.gameStart=Date.now();renderQuestion(); };
  $('#saveResultBtn').onclick = async () => {
    const playerName = prompt('Tên học sinh hoặc đội chơi:', 'Đội 1');
    if (playerName === null) return;
    await window.eduGame.saveSession({ gameId: game.id, gameTitle: game.title, playerName: playerName.trim() || 'Người chơi', ...state.lastSummary, answers: state.gameAnswers });
    await refreshDb(); toast('Đã lưu kết quả lượt chơi.');
    $('#saveResultBtn').textContent = '✓ Đã lưu'; $('#saveResultBtn').disabled = true;
  };
}
function exportResults() {
  const rows = [['Trò chơi','Người chơi','Điểm','Điểm tối đa','Phần trăm','Ngày']];
  state.db.sessions.forEach(s => rows.push([s.gameTitle,s.playerName,s.points,s.max,s.percent,s.createdAt]));
  const csv = rows.map(row=>row.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\r\n');
  const blob = new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'}), url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href=url;a.download='edugame-ket-qua.csv';a.click();URL.revokeObjectURL(url);toast('Đã xuất CSV kết quả.');
}
async function saveSettings() {
  const settings = {
    ai: { mode: $('#settingAiMode').value, baseUrl: $('#settingBaseUrl').value.trim(), model: $('#settingModel').value.trim(), apiKey: $('#settingApiKey').value },
    preferences: { largeText: $('#settingLargeText').checked, sound: $('#settingSound').checked }
  };
  await window.eduGame.saveSettings(settings); state.settings = await window.eduGame.getSettings(); toast('Đã lưu cài đặt.');
}
async function testAi() {
  const settings = { ai: { mode: $('#settingAiMode').value, baseUrl: $('#settingBaseUrl').value.trim(), model: $('#settingModel').value.trim(), apiKey: $('#settingApiKey').value } };
  await window.eduGame.saveSettings(settings); state.settings = await window.eduGame.getSettings();
  if ($('#settingAiMode').value === 'offline') return toast('Chế độ ngoại tuyến không cần kiểm tra kết nối.');
  const button = $('#testAiBtn'); button.disabled = true; button.textContent = 'Đang kiểm tra…';
  try {
    const result = await window.eduGame.generateGame({ mode:'online', baseUrl: settings.ai.baseUrl, model: settings.ai.model, apiKey: settings.ai.apiKey, text:'Bài học mẫu: Cây cần ánh sáng, nước và chất dinh dưỡng để sinh trưởng. Hãy tạo 3 câu hỏi ngắn.', questionCount:3, template:'quiz', subject:'Khoa học' });
    toast(`Kết nối AI thành công (${result.provider}).`);
  } catch(e) { toast(`Chưa kết nối được: ${e.message}`, 5000); }
  finally { button.disabled = false; button.textContent = 'Kiểm tra kết nối AI'; }
}
async function refreshDb() { state.db = await window.eduGame.getLibrary(); }
async function showHelp() {
  $('#modalRoot').innerHTML = `<div class="modal-backdrop"><div class="modal"><div class="modal-head"><h2>Bắt đầu với EduGame Studio</h2><button class="modal-close" data-close>✕</button></div><div class="modal-body"><div class="help-list"><div class="help-item"><div class="help-number">1</div><div><strong>Tạo trò chơi</strong><p>Vào Tạo trò chơi, dán nội dung hoặc nạp giáo án DOCX/PDF/PPTX/TXT. Chọn thể loại và tạo bản nháp.</p></div></div><div class="help-item"><div class="help-number">2</div><div><strong>Duyệt đáp án</strong><p>Chế độ offline tạo bản nháp theo quy tắc, không phải AI. Hãy kiểm tra kỹ từng câu trước khi lưu.</p></div></div><div class="help-item"><div class="help-number">3</div><div><strong>Chơi trong lớp</strong><p>Mở game, chọn đáp án, đọc phần giải thích rồi lưu điểm theo tên học sinh hoặc đội.</p></div></div><div class="help-item"><div class="help-number">4</div><div><strong>Dùng AI</strong><p>Vào Cài đặt để cấu hình API tương thích OpenAI hoặc endpoint local. API online có thể gửi nội dung tài liệu tới nhà cung cấp.</p></div></div></div><div class="info-box" style="margin-top:18px">Mẹo: xuất gói .egame để sao chép trò chơi sang máy khác. Sau khi nhập vào thư viện, game có thể chạy không cần Internet.</div></div></div></div>`;
  $('#modalRoot').querySelector('[data-close]').onclick = () => $('#modalRoot').innerHTML = '';
}
document.addEventListener('click', e => {
  const nav = e.target.closest('.nav-item[data-page]');
  if (nav) navigate(nav.dataset.page);
});
$('#helpBtn').addEventListener('click', showHelp);
(async function init() {
  try {
    state.db = await window.eduGame.getLibrary();
    state.settings = await window.eduGame.getSettings();
    render();
  } catch(e) { $('#pageContent').innerHTML = `<div class="empty-state"><div class="big">⚠️</div><h3>Không thể khởi tạo ứng dụng</h3><p>${escapeHtml(e.message)}</p></div>`; }
})();
