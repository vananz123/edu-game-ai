// @ts-nocheck -- renderer feature; contracts it reads are typed in src/shared/lesson-types.ts.
//
// Khung chatbot của trang Giáo án (#182).
//
// Một cuộc trò chuyện đọc từ 0..n giáo án đã lưu: có giáo án thì trả lời kèm trích
// dẫn, không có giáo án nào thì trả lời bằng kiến thức chung và nói rõ điều đó
// (#183). Khi giáo viên hỏi kiểu "tạo bộ câu hỏi" thì kết quả là ĐÚNG định dạng draft
// của trò chơi (ArenaDraft) — cùng cấu trúc mà bước "duyệt nội dung" vẫn đọc.
// Vì vậy bộ câu hỏi không cần một hợp đồng mới: nó đi thẳng vào con đường
// `draftSource` đã có (không gọi model lần nữa).
//
// Provider: `providerId` rỗng nghĩa là "để main chọn theo chính sách"; danh sách
// lấy từ `settings.ai.providers` (main sở hữu, renderer không bao giờ thấy key).

/**
 * Trạng thái riêng của khung chat. Not persisted: the transcript lives in SQLite
 * (`lesson_chats`), this object only holds what the teacher has typed but not sent
 * and which panels are open.
 */
const lessonChatUi = {
  chatId: '',
  chat: null,
  chats: null,
  draft: '',
  mode: 'auto',
  questionCount: 5,
  docIds: [],
  providerId: '',
  sending: false,
  stage: '',
  error: '',
  showPicker: false,
  showHistory: false,
  pendingQuestion: '',
  requestId: '',
  scrollTop: null,
  pinned: true,
  focusComposer: false,
  lastTurn: null
};

const LESSON_CHAT_MODES = [
  { id: 'auto', label: 'Tự động', icon: 'sparkles' },
  { id: 'answer', label: 'Trả lời', icon: 'message-square' },
  { id: 'question_set', label: 'Bộ câu hỏi', icon: 'list-checks' }
];

const LESSON_CHAT_STAGE_LABELS = {
  retrieve: 'Đang đọc giáo án…',
  generate: 'AI đang viết…',
  validate: 'Đang kiểm tra định dạng…',
  repair: 'Đang sửa lại kết quả…',
  ready: 'Đã xong.'
};

function lessonChatStageLabel(stage) {
  if (stage === 'retrieve' && !lessonChatIsGrounded()) return 'Đang chuẩn bị câu hỏi…';
  return LESSON_CHAT_STAGE_LABELS[String(stage || '')] || 'Đang trả lời…';
}

/**
 * Called after the lesson library (re)loads (#182).
 *
 * Dangling ids are dropped — a lesson deleted from the batch bar or another page
 * must not stay attached — and an empty chat opens with the first lesson so the
 * frame is usable without an extra click. The conversation list is read here once
 * instead of on every render.
 */
async function lessonChatSyncWithLibrary() {
  const library = Array.isArray(state.lessonLibrary) ? state.lessonLibrary : [];
  const existing = new Set(library.map(document => document && document.id).filter(Boolean));
  lessonChatUi.docIds = lessonChatUi.docIds.filter(id => existing.has(id));
  if (!lessonChatUi.docIds.length && !lessonChatUi.chatId && library.length) {
    lessonChatUi.docIds = [library[0].id];
  }
  await lessonChatRefreshChats();
}

/** Giáo án đang được chat đọc, theo đúng thứ tự đã chọn. */
function lessonChatDocuments() {
  const library = Array.isArray(state.lessonLibrary) ? state.lessonLibrary : [];
  return lessonChatUi.docIds
    .map(id => library.find(document => document && document.id === id))
    .filter(Boolean);
}

/**
 * Nhà cung cấp giáo viên có thể chọn. Main đã lọc sẵn `wizardEligible`; ở đây giữ
 * cả provider chưa sẵn sàng để lỗi trả về là lỗi thật ("AI local chưa chạy") thay
 * vì âm thầm chạy trên nhà cung cấp khác.
 */
function lessonChatProviderOptions() {
  const list = typeof aiProviderList === 'function' ? aiProviderList() : [];
  return list.filter(provider => provider && provider.wizardEligible);
}

function lessonChatProviderLabel(providerId) {
  if (!providerId) return 'mặc định';
  const provider = lessonChatProviderOptions().find(item => item.id === providerId);
  return provider ? provider.label : providerId;
}

/**
 * Nhà cung cấp sẽ thực sự chạy. `providerId` rỗng nghĩa "để main chọn", nhưng select
 * phải hiện đúng cái sắp chạy — nên ô chọn luôn neo vào nhà cung cấp đang hoạt động
 * cho tới khi giáo viên bấm đổi.
 */
function lessonChatProviderSelection() {
  if (lessonChatUi.providerId) return lessonChatUi.providerId;
  const active = typeof aiActiveProvider === 'function' ? aiActiveProvider() : null;
  return active ? active.id : '';
}

/** Một dòng thay cho ô chọn khi chỉ có một (hoặc không có) nhà cung cấp. */
function lessonChatProviderStatusText(selected, options) {
  if (!options.length) return 'Chưa có nhà cung cấp AI — bật AI local hoặc thêm API trong Cài đặt.';
  const provider = options.find(item => item.id === selected) || options[0];
  return `Nhà cung cấp: ${provider.label}${provider.usable ? '' : ' (chưa sẵn sàng)'}`;
}

/**
 * #183: a turn with no lesson attached is a real request, not a half-filled form,
 * so nothing here requires `docIds`. The frame only needs something to ask.
 */
function lessonChatCanSend() {
  return !lessonChatUi.sending
    && String(lessonChatUi.draft || '').trim().length >= 3;
}

function lessonChatIsGrounded() {
  return lessonChatUi.docIds.length > 0;
}

/** Dòng nhỏ dưới tiêu đề: cuộc trò chuyện đang đọc gì, bằng nhà cung cấp nào. */
function lessonChatScopeText() {
  const provider = escapeHtml(lessonChatProviderLabel(lessonChatProviderSelection()));
  const scope = lessonChatIsGrounded()
    ? `Hỏi ${lessonChatUi.docIds.length} giáo án`
    : 'Không gắn giáo án · trả lời bằng kiến thức chung';
  return `${scope} · bằng ${provider}`;
}

function lessonChatRequestId() {
  return `chat-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
}

/**
 * `render()` thay toàn bộ `#pageContent` bằng chuỗi HTML mới, nên vị trí cuộn của
 * khung chat phải được đọc TRƯỚC khi chuỗi được dựng (lúc DOM cũ còn sống) — cùng
 * cách `wizardStructureCaptureView()` giữ cuộn ở cây cấu trúc.
 */
function lessonChatCaptureScroll() {
  const box = document.getElementById('lessonChatScroll');
  if (!box) return;
  const distance = box.scrollHeight - box.scrollTop - box.clientHeight;
  lessonChatUi.pinned = distance < 48;
  lessonChatUi.scrollTop = lessonChatUi.pinned ? null : box.scrollTop;
}

function lessonChatRestoreScroll() {
  const box = document.getElementById('lessonChatScroll');
  if (!box) return;
  box.scrollTop = lessonChatUi.pinned ? box.scrollHeight : (Number(lessonChatUi.scrollTop) || 0);
}

// ---------------------------------------------------------------------------
// Markup
// ---------------------------------------------------------------------------

function lessonChatHeadHtml() {
  const title = lessonChatUi.chat && lessonChatUi.chat.title ? lessonChatUi.chat.title : 'Cuộc trò chuyện mới';
  const chats = Array.isArray(lessonChatUi.chats) ? lessonChatUi.chats.length : 0;
  return `<div class="lesson-chat-head">
    <span class="lesson-chat-avatar"><span data-icon="bot" data-icon-size="17"></span></span>
    <div class="lesson-chat-title">
      <strong>${escapeHtml(title)}</strong>
      <small data-lesson-chat-subtitle>${lessonChatScopeText()}</small>
    </div>
    <div class="lesson-chat-head-actions">
      <button type="button" class="lesson-chat-mode" data-action="lesson-chat-history" aria-pressed="${lessonChatUi.showHistory ? 'true' : 'false'}" title="Cuộc trò chuyện trước (${chats})"><span data-icon="list" data-icon-size="13"></span> ${chats}</button>
      <button type="button" class="lesson-chat-mode" data-action="lesson-chat-new" title="Bắt đầu cuộc trò chuyện mới"><span data-icon="plus" data-icon-size="13"></span> Mới</button>
    </div>
  </div>`;
}

function lessonChatSourcesHtml() {
  const docs = lessonChatDocuments();
  const chips = docs.map(document =>
    `<span class="lesson-chat-chip"><span title="${escapeHtml(document.name || '')}">${escapeHtml(document.name || 'Giáo án')}</span><button type="button" class="lesson-chat-mode" data-action="lesson-chat-remove-doc" data-id="${escapeHtml(document.id)}" aria-label="Bỏ ${escapeHtml(document.name || 'giáo án')} khỏi cuộc trò chuyện"><span data-icon="x" data-icon-size="12"></span></button></span>`
  ).join('');
  return `<div class="lesson-chat-sources" data-lesson-chat-sources>
    ${docs.length ? chips : '<span class="lesson-chat-empty-sources">Không gắn giáo án — AI trả lời bằng kiến thức chung. Chọn giáo án để có trích dẫn.</span>'}
    <button type="button" class="lesson-chat-mode" data-action="lesson-chat-picker" aria-pressed="${lessonChatUi.showPicker ? 'true' : 'false'}"><span data-icon="circle-plus" data-icon-size="13"></span> Chọn giáo án</button>
    <button type="button" class="lesson-chat-mode" data-action="lesson-chat-import"><span data-icon="upload" data-icon-size="13"></span> Tải giáo án mới</button>
  </div>`;
}

function lessonChatPickerHtml() {
  if (!lessonChatUi.showPicker) return '';
  const library = Array.isArray(state.lessonLibrary) ? state.lessonLibrary : [];
  if (!library.length) {
    return `<div class="lesson-chat-pop"><h4>Chọn giáo án</h4><div class="lesson-chat-empty-sources">Kho chưa có giáo án nào. Bấm "Tải giáo án mới" để nhập một tệp.</div></div>`;
  }
  const rows = library.map(document =>
    `<label class="lesson-chat-pick"><input type="checkbox" class="lesson-check" data-lesson-chat-pick data-id="${escapeHtml(document.id)}"${lessonChatUi.docIds.includes(document.id) ? ' checked' : ''}><span title="${escapeHtml(document.name || '')}">${escapeHtml(document.name || 'Giáo án')}</span></label>`
  ).join('');
  return `<div class="lesson-chat-pop" data-lesson-chat-picker>
    <h4>Chọn giáo án để cùng đọc (${library.length})</h4>
    ${rows}
    <div class="lesson-chat-set-actions">
      <button type="button" class="lesson-chat-mode" data-action="lesson-chat-pick-all" data-id="all">Chọn tất cả</button>
      <button type="button" class="lesson-chat-mode" data-action="lesson-chat-pick-all" data-id="none">Bỏ chọn</button>
      <button type="button" class="btn btn-primary btn-small" data-action="lesson-chat-picker-close">Xong</button>
    </div>
  </div>`;
}

function lessonChatHistoryHtml() {
  if (!lessonChatUi.showHistory) return '';
  const chats = Array.isArray(lessonChatUi.chats) ? lessonChatUi.chats : [];
  const rows = chats.map(chat =>
    `<div class="lesson-chat-history-item">
      <button type="button" data-action="lesson-chat-open" data-id="${escapeHtml(chat.id)}" title="${escapeHtml(chat.title || '')}">${escapeHtml(chat.title || 'Cuộc trò chuyện')} · ${Number(chat.messageCount) / 2} lượt</button>
      <button type="button" class="lesson-chat-mode" data-action="lesson-chat-delete" data-id="${escapeHtml(chat.id)}" aria-label="Xoá cuộc trò chuyện ${escapeHtml(chat.title || '')}"><span data-icon="trash" data-icon-size="12"></span></button>
    </div>`
  ).join('');
  return `<div class="lesson-chat-pop" data-lesson-chat-history>
    <h4>Cuộc trò chuyện trước</h4>
    ${rows || '<div class="lesson-chat-empty-sources">Chưa có cuộc trò chuyện nào được lưu.</div>'}
  </div>`;
}

function lessonChatQuestionSetHtml(draft) {
  const questions = Array.isArray(draft && draft.questions) ? draft.questions : [];
  if (!questions.length) return '';
  const items = questions.map((question, index) => {
    const options = Array.isArray(question.options) ? question.options : [];
    const optionLines = options.map(option =>
      `<div class="lesson-chat-set-opt${option.id === question.correctOptionId ? ' is-correct' : ''}">${escapeHtml(String(option.text || ''))}</div>`
    ).join('');
    const answer = options.length ? optionLines : `<div class="lesson-chat-set-opt is-correct">${escapeHtml(String(question.correctAnswer || ''))}</div>`;
    return `<div class="lesson-chat-set-item">
      <div class="lesson-chat-set-q">${index + 1}. ${escapeHtml(String(question.prompt || ''))}</div>
      ${answer}
      <div class="lesson-chat-set-meta">${escapeHtml(String(question.difficulty || ''))}${question.points ? ` · ${Number(question.points)} điểm` : ''}${question.explanation ? ` · ${escapeHtml(String(question.explanation))}` : ''}</div>
    </div>`;
  }).join('');
  return `<div class="lesson-chat-set" data-lesson-chat-set>
    ${items}
    <div class="lesson-chat-set-actions">
      <button type="button" class="btn btn-primary btn-small" data-action="lesson-chat-game" data-lesson-chat-game="${questions.length}"><span data-icon="wand-sparkles" data-icon-size="13"></span> Tạo trò chơi (${questions.length} câu)</button>
    </div>
  </div>`;
}

function lessonChatCitationsHtml(citations) {
  const list = Array.isArray(citations) ? citations.filter(citation => citation && citation.quote) : [];
  if (!list.length) return '';
  return `<details class="lesson-chat-evidence"><summary>Nguồn trong giáo án (${list.length} đoạn)</summary><ol>${list
    .map(citation => `<li><strong>${escapeHtml(citation.documentName || 'Giáo án')}</strong> — ${escapeHtml(citation.quote)}</li>`)
    .join('')}</ol></details>`;
}

function lessonChatMessageHtml(message) {
  const isUser = message.role === 'user';
  return `<div class="lesson-chat-row${isUser ? ' is-user' : ''}" data-lesson-chat-message="${escapeHtml(message.id || '')}">
    <div class="lesson-chat-bubble${message.errorCode ? ' is-error' : ''}"${message.errorCode ? ' data-lesson-chat-error="1"' : ''}>${escapeHtml(message.text || '')}${
      isUser ? ''
        : `${lessonChatCitationsHtml(message.citations)}${lessonChatQuestionSetHtml(message.questionSet)}`
    }</div>
  </div>`;
}

function lessonChatPendingHtml() {
  if (!lessonChatUi.sending && !lessonChatUi.error) return '';
  const pending = lessonChatUi.pendingQuestion
    ? `<div class="lesson-chat-row is-user"><div class="lesson-chat-bubble">${escapeHtml(lessonChatUi.pendingQuestion)}</div></div>`
    : '';
  const working = lessonChatUi.sending
    ? `<div class="lesson-chat-row"><div class="lesson-chat-bubble" data-lesson-chat-working><span data-icon="loader" data-icon-size="13" data-icon-class="animate-spin"></span> ${escapeHtml(lessonChatStageLabel(lessonChatUi.stage))}</div></div>`
    : '';
  const error = !lessonChatUi.sending && lessonChatUi.error
    ? `<div class="lesson-chat-row"><div class="lesson-chat-bubble is-error" data-lesson-chat-error="1">${escapeHtml(lessonChatUi.error)}<div class="lesson-chat-note">${lessonChatIsGrounded() ? 'Giáo án vẫn còn nguyên; hãy thử lại hoặc đổi nhà cung cấp.' : 'Hãy thử lại hoặc đổi nhà cung cấp.'}</div></div></div>`
    : '';
  return pending + working + error;
}

function lessonChatTranscriptHtml() {
  const messages = lessonChatUi.chat && Array.isArray(lessonChatUi.chat.messages)
    ? lessonChatUi.chat.messages
    : [];
  if (!messages.length && !lessonChatUi.sending && !lessonChatUi.error) {
    return `<div class="lesson-chat-empty" data-lesson-chat-empty>
      <strong>Cứ hỏi, không cần mở giáo án</strong>
      Hỏi thẳng một câu là AI trả lời. Chọn một hay nhiều giáo án ở trên nếu muốn câu trả
      lời kèm trích dẫn đúng bài. Muốn có bộ câu hỏi, cứ hỏi "tạo 8 câu hỏi về bài này" —
      kết quả hiện theo đúng định dạng của trò chơi, kèm nút <b>Tạo trò chơi</b>.
    </div>`;
  }
  return `${messages.map(message => lessonChatMessageHtml(message)).join('')}${lessonChatPendingHtml()}`;
}

function lessonChatComposerHtml() {
  const options = lessonChatProviderOptions();
  const selected = lessonChatProviderSelection();
  const countField = lessonChatUi.mode === 'question_set'
    ? `<label class="lesson-chat-count">Số câu hỏi<input type="number" id="lessonChatCount" min="1" max="30" step="1" value="${clampQuestionCountUi(lessonChatUi.questionCount)}"${lessonChatUi.sending ? ' disabled' : ''}></label>`
    : '';
  return `<div class="lesson-chat-composer">
    <div class="lesson-chat-modes" role="group" aria-label="Chế độ trả lời">
      ${LESSON_CHAT_MODES.map(mode =>
        `<button type="button" class="lesson-chat-mode${lessonChatUi.mode === mode.id ? ' is-active' : ''}" data-action="lesson-chat-mode" data-id="${mode.id}" aria-pressed="${lessonChatUi.mode === mode.id ? 'true' : 'false'}"><span data-icon="${mode.icon}" data-icon-size="12"></span> ${mode.label}</button>`
      ).join('')}
    </div>
    <textarea id="lessonChatInput" class="lesson-chat-input" placeholder="${lessonChatUi.mode === 'question_set' ? 'Ví dụ: tạo 8 câu hỏi trắc nghiệm về quang hợp' : 'Ví dụ: Mục tiêu của bài này là gì?'}" ${lessonChatUi.sending ? 'disabled' : ''}>${escapeHtml(lessonChatUi.draft)}</textarea>
    <div class="lesson-chat-foot">
      ${options.length > 1
        ? `<select id="lessonChatProvider" class="lesson-chat-provider" aria-label="Nhà cung cấp AI">${options.map(provider =>
            `<option value="${escapeHtml(provider.id)}"${provider.id === selected ? ' selected' : ''}>${escapeHtml(provider.label)}${provider.usable ? '' : ' (chưa sẵn sàng)'}${provider.model ? ` · ${escapeHtml(provider.model)}` : ''}</option>`
          ).join('')}</select>`
        : `<span class="lesson-chat-status" data-lesson-chat-provider>${escapeHtml(lessonChatProviderStatusText(selected, options))}</span>`}
      ${countField}
      ${lessonChatUi.sending
        ? `<button type="button" class="btn btn-secondary btn-small" data-action="lesson-chat-stop"><span data-icon="square" data-icon-size="13"></span> Dừng</button>`
        : `<button type="button" class="btn btn-primary btn-small" data-action="lesson-chat-send" data-lesson-chat-send${lessonChatCanSend() ? '' : ' disabled'}>Gửi</button>`}
    </div>
    <small class="lesson-chat-status" data-lesson-chat-hint>${lessonChatUi.docIds.length ? '' : 'Cứ hỏi thẳng — không cần chọn hay tải giáo án nào cả.'}</small>
  </div>`;
}

function clampQuestionCountUi(value) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return 5;
  return Math.min(30, Math.max(1, number));
}

/** Khung chat — cột trái của trang Giáo án (#182). */
function lessonChatPanelHtml() {
  lessonChatCaptureScroll();
  return `<aside class="lesson-chat-col" id="lessonChatCol">
    <div class="lesson-chat-frame" data-lesson-chat-frame>
      ${lessonChatHeadHtml()}
      ${lessonChatSourcesHtml()}
      ${lessonChatPickerHtml()}
      ${lessonChatHistoryHtml()}
      <div class="lesson-chat-scroll" id="lessonChatScroll" role="log" aria-live="polite">${lessonChatTranscriptHtml()}</div>
      ${lessonChatComposerHtml()}
    </div>
  </aside>`;
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

let lessonChatProgressWired = false;

function wireLessonChat() {
  const input = document.getElementById('lessonChatInput');
  if (input) {
    input.addEventListener('input', event => {
      lessonChatUi.draft = event.target.value;
      const send = document.querySelector('[data-lesson-chat-send]');
      if (send) send.disabled = !lessonChatCanSend();
    });
    // Enter = gửi, Shift+Enter = xuống dòng (đúng thói quen của một khung chat).
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        lessonChatSend();
      }
    });
    if (lessonChatUi.focusComposer) {
      lessonChatUi.focusComposer = false;
      input.focus();
      const end = input.value.length;
      try { input.setSelectionRange(end, end); } catch (error) { /* caret placement is cosmetic */ }
    }
  }
  document.querySelectorAll('#pageContent [data-lesson-chat-pick]').forEach(box => {
    box.addEventListener('change', () => {
      const id = box.dataset.id;
      if (!id) return;
      if (box.checked) {
        if (!lessonChatUi.docIds.includes(id)) lessonChatUi.docIds.push(id);
      } else {
        lessonChatUi.docIds = lessonChatUi.docIds.filter(item => item !== id);
      }
      render();
    });
  });
  const provider = document.getElementById('lessonChatProvider');
  if (provider) provider.addEventListener('change', event => {
    lessonChatUi.providerId = event.target.value || '';
    render();
  });
  const count = document.getElementById('lessonChatCount');
  if (count) count.addEventListener('change', event => {
    lessonChatUi.questionCount = clampQuestionCountUi(event.target.value);
    render();
  });
  // O7 pattern (create-wizard.ts): subscribe once, filter by requestId, and write
  // the stage into the working bubble instead of re-rendering the whole page.
  if (!lessonChatProgressWired && window.eduGame && typeof window.eduGame.onLessonProgress === 'function') {
    lessonChatProgressWired = true;
    window.eduGame.onLessonProgress(progress => {
      if (!progress || progress.requestId !== lessonChatUi.requestId) return;
      lessonChatUi.stage = String(progress.stage || '');
      const host = document.querySelector('[data-lesson-chat-working]');
      if (host) host.innerHTML = `<span data-icon="loader" data-icon-size="13" data-icon-class="animate-spin"></span> ${escapeHtml(lessonChatStageLabel(lessonChatUi.stage))}`;
      if (typeof paintUiIcons === 'function') paintUiIcons(document);
      if (typeof window.refreshAiStatusBar === 'function') window.refreshAiStatusBar();
    });
  }
  lessonChatRestoreScroll();
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** Returns true when the action belongs to the chat and was handled. */
async function lessonChatHandle(action, element) {
  const id = element && element.dataset ? element.dataset.id : '';
  if (action === 'lesson-chat-mode') {
    lessonChatUi.mode = LESSON_CHAT_MODES.some(mode => mode.id === id) ? id : 'auto';
    render();
    return true;
  }
  if (action === 'lesson-chat-picker') {
    lessonChatUi.showPicker = !lessonChatUi.showPicker;
    lessonChatUi.showHistory = false;
    render();
    return true;
  }
  if (action === 'lesson-chat-picker-close') {
    lessonChatUi.showPicker = false;
    render();
    return true;
  }
  if (action === 'lesson-chat-history') {
    lessonChatUi.showHistory = !lessonChatUi.showHistory;
    lessonChatUi.showPicker = false;
    await lessonChatRefreshChats();
    render();
    return true;
  }
  if (action === 'lesson-chat-pick-all') {
    const library = Array.isArray(state.lessonLibrary) ? state.lessonLibrary : [];
    lessonChatUi.docIds = id === 'none' ? [] : library.map(document => document.id);
    render();
    return true;
  }
  if (action === 'lesson-chat-remove-doc') {
    lessonChatUi.docIds = lessonChatUi.docIds.filter(item => item !== id);
    render();
    return true;
  }
  if (action === 'lesson-chat-import') {
    await lessonChatImportDocument();
    return true;
  }
  if (action === 'lesson-chat-new') {
    lessonChatUi.chatId = '';
    lessonChatUi.chat = null;
    lessonChatUi.draft = '';
    lessonChatUi.error = '';
    lessonChatUi.pendingQuestion = '';
    lessonChatUi.showHistory = false;
    lessonChatUi.focusComposer = true;
    render();
    return true;
  }
  if (action === 'lesson-chat-open') {
    await lessonChatOpen(id);
    return true;
  }
  if (action === 'lesson-chat-delete') {
    await lessonChatDelete(id);
    return true;
  }
  if (action === 'lesson-chat-send') {
    await lessonChatSend();
    return true;
  }
  if (action === 'lesson-chat-stop') {
    if (lessonChatUi.requestId) await window.eduGame.cancelAi(lessonChatUi.requestId);
    return true;
  }
  if (action === 'lesson-chat-game') {
    await lessonChatOpenGame();
    return true;
  }
  return false;
}

async function lessonChatRefreshChats() {
  try {
    lessonChatUi.chats = await window.eduGame.listLessonChats() || [];
  } catch (error) {
    lessonChatUi.chats = [];
  }
}

async function lessonChatOpen(chatId) {
  if (!chatId) return;
  try {
    const chat = await window.eduGame.getLessonChat(chatId);
    if (!chat) {
      toast('Không tìm thấy cuộc trò chuyện này.');
      await lessonChatRefreshChats();
      render();
      return;
    }
    lessonChatUi.chat = chat;
    lessonChatUi.chatId = chat.id;
    lessonChatUi.docIds = Array.isArray(chat.documentIds) ? chat.documentIds.slice() : [];
    lessonChatUi.showHistory = false;
    lessonChatUi.error = '';
    lessonChatUi.pinned = true;
    render();
  } catch (error) {
    toast(`Không mở được cuộc trò chuyện: ${(error && error.message) || 'lỗi không xác định'}`);
  }
}

async function lessonChatDelete(chatId) {
  if (!chatId) return;
  if (!confirm('Xoá cuộc trò chuyện này? Các giáo án và trò chơi đã lưu không bị xoá theo.')) return;
  try {
    const result = await window.eduGame.deleteLessonChats([chatId]);
    if (lessonChatUi.chatId === chatId) {
      lessonChatUi.chatId = '';
      lessonChatUi.chat = null;
    }
    await lessonChatRefreshChats();
    render();
    toast(result && result.deleted ? 'Đã xoá cuộc trò chuyện.' : 'Không tìm thấy cuộc trò chuyện để xoá.');
  } catch (error) {
    toast(`Không xoá được cuộc trò chuyện: ${(error && error.message) || 'lỗi không xác định'}`);
  }
}

/**
 * Tải một giáo án mới ngay trong khung chat và gắn nó vào cuộc trò chuyện.
 * Cùng hai bước mà nút "Nhập giáo án từ tệp" vẫn làm (đọc tệp → lưu vào kho).
 */
async function lessonChatImportDocument() {
  try {
    const doc = await window.eduGame.importDocument();
    if (!doc) return;
    const stored = await window.eduGame.saveLessonDocument({
      name: doc.name,
      ext: (doc.name || '').split('.').pop() || 'txt',
      text: doc.text,
      characters: doc.characters,
      sizeBytes: Number(doc.sizeBytes) || 0
    });
    state.importedDoc = { ...doc, id: stored.id };
    state.lessonLibrary = null;
    await refreshLessonLibraryPage();
    if (!lessonChatUi.docIds.includes(stored.id)) lessonChatUi.docIds.push(stored.id);
    lessonChatUi.focusComposer = true;
    render();
    toast(`Đã tải “${doc.name}” vào cuộc trò chuyện.`);
  } catch (error) {
    toast(`Không tải được giáo án: ${(error && error.message) || 'lỗi không xác định'}`);
  }
}

async function lessonChatSend() {
  if (lessonChatUi.sending) return;
  const question = String(lessonChatUi.draft || '').trim();
  // #183: không còn chốt "phải chọn giáo án" ở đây — một câu hỏi trơn cũng là một
  // lượt hợp lệ, main sẽ soạn prompt "không có giáo án kèm theo".
  if (question.length < 3) {
    lessonChatUi.error = 'Câu hỏi quá ngắn.';
    render();
    return;
  }
  const requestId = lessonChatRequestId();
  lessonChatUi.sending = true;
  lessonChatUi.requestId = requestId;
  lessonChatUi.stage = 'retrieve';
  lessonChatUi.error = '';
  lessonChatUi.pendingQuestion = question;
  lessonChatUi.pinned = true;
  render();
  try {
    const turn = await window.eduGame.sendLessonChat({
      chatId: lessonChatUi.chatId || '',
      documentIds: lessonChatUi.docIds.slice(),
      question,
      providerId: lessonChatUi.providerId || '',
      requestId,
      mode: lessonChatUi.mode,
      questionCount: clampQuestionCountUi(lessonChatUi.questionCount)
    });
    lessonChatUi.chat = turn && turn.chat ? turn.chat : lessonChatUi.chat;
    lessonChatUi.chatId = (lessonChatUi.chat || {}).id || lessonChatUi.chatId;
    lessonChatUi.draft = '';
    lessonChatUi.lastTurn = turn || null;
    if (turn && turn.intent === 'question_set') lessonChatUi.mode = 'question_set';
    await lessonChatRefreshChats();
  } catch (error) {
    const raw = String((error && error.message) || error || '').trim();
    // cùng hai bước bỏ đặc trưng mà wizardParseError và trang Cài đặt đã dùng:
    // giáo viên không cần đọc "Error invoking remote method" hay tên lớp lỗi.
    const message = raw
      .replace(/^Error invoking remote method '[^']*':\s*/, '')
      .replace(/^[A-Za-z]*Error:\s*/, '')
      .trim() || 'AI không trả lời được.';
    // main lưu cả lượt lỗi vào lịch sử, nên transcript phải được đọc lại.
    if (lessonChatUi.chatId) await lessonChatOpen(lessonChatUi.chatId);
    // lessonChatOpen xoá lỗi đang hiển thị. Với lỗi cấu hình (chưa có AI nào sẵn
    // sàng) main ném ra trước khi ghi lượt, nên lịch sử không có gì để hiện —
    // phải đặt lại thông báo sau khi đọc lịch sử, nếu không giáo viên bấm Gửi
    // mà không thấy gì xảy ra.
    lessonChatUi.error = message;
  } finally {
    lessonChatUi.sending = false;
    lessonChatUi.pendingQuestion = '';
    lessonChatUi.stage = '';
    lessonChatUi.requestId = '';
    lessonChatUi.focusComposer = true;
    render();
  }
}

/** Bộ câu hỏi mới nhất AI trả ra trong cuộc trò chuyện này. */
function lessonChatLatestSet() {
  const messages = lessonChatUi.chat && Array.isArray(lessonChatUi.chat.messages) ? lessonChatUi.chat.messages : [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message && message.role === 'assistant' && message.questionSet) return message;
  }
  return null;
}

/**
 * "Tạo trò chơi" từ bộ câu hỏi đã duyệt: mở trình tạo ở bước hoàn tất, với draft
 * chính là bộ câu hỏi vừa lưu trong lịch sử chat. `wizardAdoptQuestionSet` dựng project
 * nháp rồi đi qua đúng pipeline "không gọi model" mà một ngân hàng câu hỏi dán tay vẫn
 * dùng (#117) — nên định dạng câu hỏi không cần thêm hợp đồng trung gian nào.
 */
async function lessonChatOpenGame() {
  const message = lessonChatLatestSet();
  if (!message || !message.questionSet) {
    toast('Chưa có bộ câu hỏi nào để chuyển sang trò chơi.');
    return;
  }
  await wizardAdoptQuestionSet(message.questionSet, {
    documentIds: lessonChatUi.docIds.slice(),
    documentNames: lessonChatDocuments().map(document => document.name).filter(Boolean),
    chatId: lessonChatUi.chatId,
    chatTitle: (lessonChatUi.chat || {}).title || '',
    providerId: message.providerId || lessonChatUi.providerId
  });
}
