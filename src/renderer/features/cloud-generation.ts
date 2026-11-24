// @ts-nocheck -- script renderer toàn cục; hợp đồng kiểu nằm trong façade.
// cloud-generation.ts — xin một trò chơi từ gateway AI của sản phẩm (#344).
//
// Access token KHÔNG đi qua đây: `cloudGenerate` chạy trong Rust, đọc phiên từ DPAPI,
// gắn `Authorization` và chỉ trả về trò chơi. Renderer không có đường nào chạm token.
//
// Kết quả luôn là một đối tượng có `ok` và (khi hỏng) `code`: UI phải phân biệt
// "chưa đăng nhập" với "hết lượt" với "máy chủ chưa cài" để hiện đúng lời mời.

/** Bài mẫu để kiểm Cloud AI trên máy giáo viên. Không phải dữ liệu học sinh. */
const CLOUD_SELF_TEST_LESSON =
  'Bài học mẫu: An toàn giao thông đường bộ. Khi đi bộ trên đường không có vỉa hè, '
  + 'em đi sát mép đường bên phải. Trước khi sang đường, em dừng lại, nhìn trái, nhìn '
  + 'phải rồi mới đi. Không chơi đùa dưới lòng đường.';

async function cloudGenerateGame(request) {
  try {
    const result = await desktop.call('cloudGenerate', request || {});
    if (!result || typeof result !== 'object') {
      return { ok: false, code: 'bad_response', message: 'Máy chủ trả về dữ liệu không đọc được.' };
    }
    return result;
  } catch (error) {
    // Lỗi của chính kênh (thiếu tham số, Rust từ chối) — vẫn phải có mã để UI xử lý.
    return {
      ok: false,
      code: 'transport_error',
      message: (error && error.message) || 'Không gọi được Cloud AI.',
    };
  }
}

/** Lời kiểm ngắn cho giáo viên: dùng 1 lượt thật của tháng và nói rõ là có dùng. */
async function cloudSelfTest() {
  return cloudGenerateGame({
    text: CLOUD_SELF_TEST_LESSON,
    sourceName: 'bai-mau-an-toan-giao-thong.txt',
    questionCount: 3,
    template: 'quiz',
    grade: '3',
    subject: 'An toàn giao thông',
  });
}
