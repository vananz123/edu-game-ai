// @ts-nocheck -- migrated legacy UI logic; new contracts are typed in src/shared/types.ts.
function renderLessonPlans() {
  return `<div class="page-heading"><div><div class="eyebrow">LESSON PLANS</div><h1>Giáo án</h1><p>Quản lý và trích xuất nội dung từ giáo án, tài liệu giảng dạy để tạo trò chơi.</p></div><button class="btn btn-secondary" data-action="import-document">⇧ Nhập giáo án từ tệp</button><button class="btn btn-primary" data-page="create">✳ Tạo trò chơi từ giáo án</button></div>
    <section class="panel">
      <div class="section-head"><h3>Giáo án đã nhập</h3><span class="tag">${state.importedDoc ? '1 tài liệu' : 'Chưa có'}</span></div>
      ${state.importedDoc ? `<div class="lesson-card"><div class="lesson-info"><strong>${escapeHtml(state.importedDoc.name)}</strong><small>${state.importedDoc.characters.toLocaleString('vi-VN')} ký tự đã trích xuất · ${escapeHtml(state.importedDoc.name.split('.').pop() || '')}</small></div><div class="lesson-actions"><button class="btn btn-secondary btn-small" data-page="create">Dùng để tạo trò chơi</button><button class="btn btn-danger btn-small" data-action="clear-lesson">Xóa</button></div></div>` : `<div class="empty-state" style="padding:30px"><div class="big">📄</div><h3>Chưa có giáo án nào</h3><p>Nhập tệp DOCX, PDF, PPTX, TXT hoặc MD để trích xuất nội dung.</p></div>`}
    </section>
    <section class="panel">
      <h3>Hướng dẫn nhập giáo án</h3>
      <div class="help-list">
        <div class="help-item"><div class="help-number">1</div><div><strong>Chọn tệp</strong><p>Nhấn "Nhập giáo án từ tệp" và chọn DOCX, PDF (có chữ), PPTX, TXT hoặc MD.</p></div></div>
        <div class="help-item"><div class="help-number">2</div><div><strong>Trích xuất nội dung</strong><p>Hệ thống đọc văn bản, chia phần, xác định mục tiêu và kiến thức trọng tâm.</p></div></div>
        <div class="help-item"><div class="help-number">3</div><div><strong>Tạo trò chơi</strong><p>Chuyển sang trang "Tạo trò chơi", dùng nội dung giáo án làm nền tảng cho AI sinh câu hỏi.</p></div></div>
      </div>
    </section>`;
}