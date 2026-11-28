import io

def patch(path, pairs):
    s = io.open(path, encoding='utf-8', newline='').read().replace('\r\n', '\n')
    for old, new in pairs:
        assert s.count(old) == 1, (path, old[:70], s.count(old))
        s = s.replace(old, new, 1)
    io.open(path, 'w', encoding='utf-8', newline='').write(s.replace('\n', '\r\n'))
    print('patched', path)

# 1. Bảng chọn giáo án chuyển VÀO trong `.lesson-chat-field` (bọc khung gõ) để nó nổi lên
#    ngay trên nút "+", thay vì là một khối trong composer đẩy mọi thứ xuống.
pair_move_old = '''  return `<div class="lesson-chat-composer">
    ${lessonChatAttachHtml()}
    ${lessonChatPickerHtml()}
    <div class="lesson-chat-modes" role="group" aria-label="Chế độ trả lời">'''
pair_move_new = '''  return `<div class="lesson-chat-composer">
    ${lessonChatAttachHtml()}
    <div class="lesson-chat-modes" role="group" aria-label="Chế độ trả lời">'''
assert io.open('src/renderer/features/lesson-chat.ts', encoding='utf-8', newline='').read().count('${lessonChatAttachHtml()}\n    ${lessonChatPickerHtml()}') == 1

pair_field_old = '''    <div class="lesson-chat-field">
      ${lessonChatAttachButtonHtml()}
      <textarea id="lessonChatInput"'''
pair_field_new = '''    <div class="lesson-chat-field">
      ${lessonChatAttachButtonHtml()}
      ${lessonChatPickerHtml()}
      <textarea id="lessonChatInput"'''

# 2. Đóng bảng khi bấm ra ngoài hoặc Esc — popup nổi thì phải có đường tắt, không bắt người
#    dùng đi tìm nút "Xong".
pair_wire_old = '''    lessonChatCaptureFocus();
    if (target === document.getElementById('lessonChatInput')) {'''
pair_wire_new = '''    // #376: bảng chọn giáo án giờ là một popup NỔI trên khung gõ, nên bấm ra ngoài (hoặc Esc)
    // phải đóng nó — một lớp nổi không có đường tắt là một lớp chắn tầm nhìn.
    if (lessonChatUi.showPicker || lessonChatUi.showHistory) {
      const insidePicker = target.closest('.lesson-chat-pop');
      const onToggle = target.closest('[data-action="lesson-chat-picker"], [data-action="lesson-chat-history"]');
      if (!insidePicker && !onToggle) {
        lessonChatUi.showPicker = false;
        lessonChatUi.showHistory = false;
        render();
        return;
      }
    }
    lessonChatCaptureFocus();
    if (target === document.getElementById('lessonChatInput')) {'''

patch('src/renderer/features/lesson-chat.ts', [
  (pair_move_old, pair_move_new),
  (pair_field_old, pair_field_new),
  (pair_wire_old, pair_wire_new),
  ('''function wireLessonChatDocumentOnce() {
  if (lessonChatMouseWired || typeof document === 'undefined') return;
  lessonChatMouseWired = true;''',
   '''function wireLessonChatDocumentOnce() {
  if (lessonChatMouseWired || typeof document === 'undefined') return;
  lessonChatMouseWired = true;
  // Esc đóng mọi lớp nổi của chat (bảng chọn giáo án, danh sách cuộc trò chuyện).
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (!lessonChatUi.showPicker && !lessonChatUi.showHistory) return;
    lessonChatUi.showPicker = false;
    lessonChatUi.showHistory = false;
    render();
  });'''),
])
