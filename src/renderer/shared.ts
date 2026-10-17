// @ts-nocheck -- migrated legacy UI logic; new contracts are typed in src/shared/types.ts.
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const state = { db: { games: [], sessions: [] }, page: 'home', search: '', filter: 'all', settings: {}, localAiModels: [], localAiMachine: {}, draft: null, importedDoc: null, selectedTemplate: 'scenario', currentGame: null, gameIndex: 0, gameAnswers: [], gameStart: 0, answerLocked: false, lastSummary: null, matchingPlay: null, memoryCards: null, treasurePlay: null, racePlay: null, teamPlay: null, pendingTeams: null };
const pageNames = { home: 'Tổng quan', library: 'Thư viện trò chơi', create: 'Tạo trò chơi', 'lesson-plans': 'Giáo án', 'my-projects': 'Dự án của tôi', sessions: 'Lịch sử kết quả', settings: 'Cài đặt' };
const icons = { quiz: '🧠', scenario: '🚦', matching: '🧩', 'treasure-hunt': '🗺️', race: '🏁' };
const coverClasses = ['cover-purple','cover-mint','cover-orange','cover-blue','cover-pink'];
const cloudProviderPresets = {
  openai: { label: 'ChatGPT', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  gemini: { label: 'Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash' },
  custom: { label: 'API tương thích OpenAI', baseUrl: '', model: '' }
};
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function getCloudProviderConfig(ai = {}) {
  const inferredProvider = String(ai.baseUrl || '').includes('googleapis.com')
    ? 'gemini'
    : String(ai.baseUrl || '').includes('api.openai.com')
      ? 'openai'
      : ai.baseUrl ? 'custom' : 'openai';
  const provider = Object.prototype.hasOwnProperty.call(cloudProviderPresets, ai.cloudProvider)
    ? ai.cloudProvider
    : inferredProvider;
  const preset = cloudProviderPresets[provider];
  return {
    provider,
    label: preset.label,
    baseUrl: ai.baseUrl || preset.baseUrl,
    model: ai.model || preset.model
  };
}
function applyCloudProvider(provider) {
  const selectedProvider = Object.prototype.hasOwnProperty.call(cloudProviderPresets, provider)
    ? provider
    : 'openai';
  const preset = cloudProviderPresets[selectedProvider];
  return {
    ...state.settings.ai,
    mode: 'online',
    cloudProvider: selectedProvider,
    baseUrl: preset.baseUrl,
    model: preset.model,
    apiKey: ''
  };
}
function toast(message, duration = 3000) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), duration); }
function fmtDate(value) { try { return new Date(value).toLocaleDateString('vi-VN', { day:'2-digit', month:'2-digit', year:'numeric' }); } catch { return '—'; } }
function fmtDateTime(value) { try { return new Date(value).toLocaleString('vi-VN', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }); } catch { return '—'; } }
function formatBytes(bytes) { return `${(bytes / 1024 ** 3).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} GB`; }
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
function templateLabel(template) { return ({ quiz: 'ĐẤU TRƯỜNG KIẾN THỨC', scenario: 'THỬ THÁCH TÌNH HUỐNG', matching: 'GHÉP CẶP KIẾN THỨC', 'treasure-hunt': 'GIẢI MÃ KHO BÁU', race: 'ĐƯỜNG ĐUA CHINH PHỤC' })[template] || 'TRÒ CHƠI HỌC TẬP'; }
function scoringModeHint(mode) {
  return ({
    'cơ bản': 'Cơ bản: đúng nhận điểm cố định, sai không có điểm.',
    'tốc độ': 'Tốc độ: trả lời đúng nhanh được cộng điểm thưởng (tối đa 50 điểm).',
    'theo độ khó': 'Theo độ khó: điểm từng câu theo bảng dưới đây (mặc định dễ 100 · trung bình 200 · khó 300).',
    'thi đấu đội': 'Thi đấu đội: điểm cộng tổng cho đội, có thể luân phiên người trả lời.',
    'luyện tập': 'Luyện tập: không áp lực thời gian, không cộng điểm tốc độ, ưu tiên giải thích và phản hồi.'
  })[mode] || 'Chọn một trong 5 chế độ tính điểm theo mục 2.3 yêu cầu sản phẩm.';
}

function emptyState(title, desc, button, page) { return `<div class="empty-state"><div class="big">🎮</div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(desc)}</p><button class="btn btn-primary" data-page="${page}">${escapeHtml(button)}</button></div>`; }
