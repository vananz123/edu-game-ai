/**
 * #152: cột nào của bảng `games` lấy từ trường nào của trò chơi.
 *
 * Việc lưu trò chơi có ở ba chỗ: `main.ts` (Electron), `storage.rs` +
 * `embedded-template.js` (vỏ Tauri), và `saveDb()` của lần chạy đầu. Ba chỗ ghi
 * cùng một bảng, nên tên trường và giá trị mặc định phải là MỘT bảng, không phải
 * ba bản gõ tay — lệch một cột là tiêu đề trong thư viện hoặc cột `updated_at`
 * dùng cho sắp xếp biến mất.
 *
 * `created_at` không có mặt ở đây: bản ghi cũ giữ ngày tạo của nó, còn bản mới
 * lấy thời điểm lưu (xem `library-ops.ts`).
 */

/**
 * Một cột của `games` và giá trị mặc định. Giá trị mặc định gọi được như hàm
 * (`now`) nên chỗ nào cũng lấy cùng một mốc thời gian với `created_at`.
 */
export interface GameRowColumn {
  column: string;
  field: string;
  fallback: string | 'now';
}

/**
 * Thứ tự đúng như câu `INSERT INTO games (…)` của `main.ts`.
 */
export const GAME_ROW_COLUMNS: readonly GameRowColumn[] = [
  { column: 'id', field: 'id', fallback: '' },
  { column: 'title', field: 'title', fallback: 'Trò chơi chưa đặt tên' },
  { column: 'subject', field: 'subject', fallback: '' },
  { column: 'grade', field: 'grade', fallback: '' },
  { column: 'topic', field: 'topic', fallback: '' },
  { column: 'template', field: 'template', fallback: 'quiz' }
];
