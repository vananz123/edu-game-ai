// @ts-nocheck -- migrated legacy UI logic; new contracts are typed in src/shared/types.ts.
async function refreshDb() { state.db = await window.eduGame.getLibrary(); }

/**
 * Loads the project list independently from the game library. `state.projects =
 * null` means "loading", which is different from an empty list and prevents the
 * page from flashing a false empty state.
 */
async function refreshProjectsPage() {
  state.projects = null;
  if (state.page === 'my-projects') render();
  try {
    const projects = await window.eduGame.listProjects();
    state.projects = Array.isArray(projects) ? projects : [];
  } catch (error) {
    state.projects = [];
    toast(`Không tải được danh sách dự án: ${(error && error.message) || 'lỗi không xác định'}`);
  }
  if (state.page === 'my-projects') render();
}

async function refreshLessonLibraryPage() {
  state.lessonLibrary = null;
  if (state.page === 'lesson-plans') render();
  try {
    const documents = await window.eduGame.listLessonLibrary();
    state.lessonLibrary = Array.isArray(documents) ? documents : [];
  } catch (error) {
    state.lessonLibrary = [];
    toast(`Không tải được kho giáo án: ${(error && error.message) || 'lỗi không xác định'}`);
  }
  if (state.page === 'lesson-plans') render();
}
async function showHelp() {
  $('#modalRoot').innerHTML = `<div class="modal-backdrop"><div class="modal"><div class="modal-head"><h2>Bắt đầu với EduGame Studio</h2><button class="modal-close" data-close>✕</button></div><div class="modal-body"><div class="help-list"><div class="help-item"><div class="help-number">1</div><div><strong>Tạo trò chơi</strong><p>Vào Tạo trò chơi, dán nội dung hoặc nạp giáo án DOCX/PDF/PPTX/TXT. Chọn thể loại và tạo bản nháp.</p></div></div><div class="help-item"><div class="help-number">2</div><div><strong>Duyệt đáp án</strong><p>Chế độ offline tạo bản nháp theo quy tắc, không phải AI. Hãy kiểm tra kỹ từng câu trước khi lưu.</p></div></div><div class="help-item"><div class="help-number">3</div><div><strong>Chơi trong lớp</strong><p>Mở game, chọn đáp án, đọc phần giải thích rồi lưu điểm theo tên học sinh hoặc đội.</p></div></div><div class="help-item"><div class="help-number">4</div><div><strong>Dùng AI</strong><p>Vào Cài đặt để cấu hình API tương thích OpenAI hoặc endpoint local. API online có thể gửi nội dung tài liệu tới nhà cung cấp.</p></div></div></div><div class="info-box mt-[18px]">Mẹo: xuất gói .egame để sao chép trò chơi sang máy khác. Sau khi nhập vào thư viện, game có thể chạy không cần Internet.</div></div></div></div>`;
  $('#modalRoot').querySelector('[data-close]').onclick = () => $('#modalRoot').innerHTML = '';
}
document.addEventListener('click', e => {
  const activity = e.target.closest('[data-global-ai-activity]');
  if (activity) {
    if (wizardState.busy === 'analyze') {
      wizardState.step = 'analyze';
      navigate('create-wizard');
    }
    return;
  }
  const nav = e.target.closest('.nav-item[data-page]');
  if (nav) navigate(nav.dataset.page);
});
$('#helpBtn').addEventListener('click', showHelp);
(async function init() {
  try {
    state.db = await window.eduGame.getLibrary();
    state.settings = await window.eduGame.getSettings();
    const localAi = await window.eduGame.getLocalAiModels();
    state.localAiModels = localAi.models;
    state.localAiMachine = localAi.machine;
    render();
  } catch(e) { $('#pageContent').innerHTML = `<div class="empty-state"><div class="big">⚠️</div><h3>Không thể khởi tạo ứng dụng</h3><p>${escapeHtml(e.message)}</p></div>`; }
})();
