# Lưu trữ bàn giao và quyết định

Thư mục này giữ phần lịch sử đã tách khỏi `docs/STATUS.md` và `docs/DECISIONS.md`
ngày 2026-10-31 (DECISIONS #146). Không sửa nội dung đã lưu trữ; chỉ nối thêm vào
file đúng ngày.

## `status/<YYYY-MM-DD>.md`

Mỗi file là các bàn giao của **ngày làm việc** đó, giữ nguyên thứ tự và nội dung.
Hiện có hai loại tên đặc biệt:

- `undated-070-079.md` — các bàn giao cũ (quyết định #70–#79) không ghi ngày
  trong tiêu đề; không suy đoán ngày.

Quy ước khi có bàn giao mới:

1. Chèn bàn giao mới ngay dưới `## Bàn giao gần nhất` trong `docs/STATUS.md`.
2. Nếu `docs/STATUS.md` có quá 3 bàn giao, chuyển bàn giao cũ nhất sang cuối file
   `status/<ngày của nó>.md` (nối thêm, không sắp xếp lại).
3. Thêm dòng vào mục lục trong `docs/STATUS.md` (đúng nhóm ngày).

## `decisions/<dải số>.md`

Chi tiết quyết định #57–#145. `docs/DECISIONS.md` giữ tóm tắt #1–#56, danh sách
quyết định còn mở và mục lục trỏ về đây. Quyết định mới (#146 trở đi) ghi trực
tiếp vào `docs/DECISIONS.md`; khi file vượt khoảng 300 KB thì cắt thêm một dải số
sang thư mục này.
