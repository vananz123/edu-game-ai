/**
 * Hai nửa của gói `.egame` mà vỏ Tauri cần, chạy trong V8 nhúng (`deno_core`).
 *
 * Bộ đọc/ghi thật là `game-package.ts` — cùng mã Electron chạy ở `files:export-game`
 * và `files:import-game`. Tệp này chỉ là cửa vào cho `template.js`:
 *
 *   • `writePackage(game)` — phần chữ của `writeGamePackage`, cộng tên tệp gợi ý
 *     mà Electron tính ngay trong `defaultPath` của hộp thoại lưu;
 *   • `readPackage(text, idFactory, savedIds)` — `readGamePackage` với nguồn id do
 *     Rust đưa sang và danh sách id trò chơi đã lưu (Rust đọc từ bảng `games`).
 *     Gói là đầu vào KHÔNG tin được: `readGamePackage` kiểm dữ liệu bằng đúng bốn
 *     bộ kiểm của lúc lưu, bỏ URL tài nguyên ngoài, và chỉ giữ id tác giả khi id đó
 *     chưa có trong thư viện — ở đây không nới lỏng bước nào.
 *
 * Không I/O, không tệp, không `node:*`: Rust mở hộp thoại và đọc/ghi tệp; tệp này
 * chỉ thấy chuỗi.
 */
import type { EducationalGame } from '../../shared/types';
import { IMPORT_GAME_MAX_BYTES, readGamePackage, writeGamePackage } from './game-package';

/** Ký tự Windows không cho phép trong tên tệp. */
const BAD_FILE_CHARS = /[\\/:*?"<>|]/g;

/** Giới hạn kích thước gói — Rust đọc từ đây thay vì gõ lại con số. */
export { IMPORT_GAME_MAX_BYTES };

/** Tên tệp gợi ý — cùng biểu thức `files:export-game` dùng cho `defaultPath`. */
export function suggestedFileName(game: EducationalGame | null | undefined): string {
  const title = String((game && game.title) || 'tro-choi').replace(BAD_FILE_CHARS, '-').slice(0, 60);
  return `${title}.egame`;
}

/** Phần chữ của một lượt xuất: đúng thứ `files:export-game` ghi xuống đĩa. */
export function writePackage(game: EducationalGame): { text: string; fileName: string } {
  return { text: writeGamePackage(game), fileName: suggestedFileName(game) };
}

/**
 * Id mới cho một trò chơi nhập vào, cùng hình `id('imported')` của `main.ts`
 * (`imported_<thời điểm base36>_<6 ký tự>`). Gốc thời điểm là tham số của lượt
 * gọi, nhưng `Date.parse` chỉ lấy được mili-giây; `nonce` (Rust đưa sang, từ đồng
 * hồ của tiến trình) thêm phần lẻ và bộ đếm, nên hai lượt trong cùng một
 * mili-giây vẫn khác nhau.
 */
function freshId(now: string, nonce: string, counter: { n: number }): string {
  const millis = Number.isFinite(Date.parse(now)) ? Date.parse(now) : Date.now();
  const tail = Math.random().toString(36).slice(2, 8).padEnd(6, '0');
  const tick = `${nonce}${counter.n}`.replace(/[^0-9a-z]/giu, '') || '0';
  return `imported_${millis.toString(36)}${tick}_${tail}`;
}

/**
 * Đọc một gói `.egame` thành trò chơi sẵn sàng lưu.
 *
 * `savedIds` là id của mọi trò chơi đang có trong thư viện: gói mang id trùng một
 * dòng đã lưu (nhập lại chính nó, hay gói chép tay) nhận id mới thay vì ghi đè.
 */
export function readPackage(text: string, now: string, nonce: string, savedIds: unknown): EducationalGame {
  const known = new Set((Array.isArray(savedIds) ? savedIds : []).filter(id => typeof id === 'string'));
  const counter = { n: 0 };
  return readGamePackage(
    text,
    () => freshId(now, String(nonce || ''), counter),
    id => known.has(id)
  );
}
