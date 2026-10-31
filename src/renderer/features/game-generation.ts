// @ts-nocheck -- migrated legacy UI logic; new contracts are typed in src/shared/types.ts.
// P5: trang "Tạo trò chơi" chỉ tạo thủ công. Nút chính mở trình chỉnh sửa trống
// theo thể loại đã chọn để giáo viên tự nhập câu hỏi. Mọi luồng AI đã chuyển sang
// trang "Tạo từ giáo án" (xem features/wizard/* và services/lesson/lesson-*).
async function generateGame() {
  const button = $('#generateBtn');
  if (button) { button.disabled = true; button.textContent = 'Đang mở trình chỉnh sửa…'; }
  try {
    // createBlankGame() đã hiển thị thông báo hướng dẫn và mở trình chỉnh sửa.
    createBlankGame();
  } catch (error) {
    toast(error.message || 'Không mở được trình chỉnh sửa.');
  } finally {
    if ($('#generateBtn')) { $('#generateBtn').disabled = false; $('#generateBtn').textContent = '✦ Mở trình chỉnh sửa câu hỏi'; }
  }
}
