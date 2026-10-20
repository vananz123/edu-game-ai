# Archive

Tài liệu đã hoàn thành hoặc chỉ còn giá trị lịch sử. **Không cập nhật** các tệp trong thư mục này; trạng thái hiện tại nằm ở `docs/STATUS.md`, kế hoạch đang mở ở `docs/ROADMAP.md` và `docs/implementation-plan.md`.

## `specs/`

- **`update-AI-local.txt`** — spec tối ưu quy trình AI (O0–O7). Đã xong 2026-10-20: cắt lượt gọi Qwen, chọn thể loại bằng TypeScript, cache phân tích/nội dung, chunk + MiniLM retrieval, tạo lại từng mục, benchmark Fast/Deep và thanh tiến trình/huỷ. Các tham chiếu trong code và docs đã trỏ về đường dẫn này.
- **`AI-assisted Lesson-to-Game Workflow.txt`** — spec P0–P7. P0–P6 đã code xong; P7 đã dọn đường `ai:document-assist` chết và làm nốt **AI tạo lại một câu trong editor** (2026-10-20, chỉ quiz/scenario khi editor mở từ wizard; matching/treasure/race vẫn tạo lại trong wizard). Còn lại duy nhất: **cổng e2e với model thật trong app**, chưa chạy được trên máy này vì cửa sổ Electron bị đóng từ bên ngoài sau ~1–2 phút. Spec được archive vì phần còn lại đã nằm trong `ROADMAP.md`/`STATUS.md`, không phải vì đã đạt 100%.

## `STATUS-history-2026-10-16-to-18.md`

Các mục `docs/STATUS.md` từ 2026-10-16 đến 2026-10-18: Tailwind G0–G5, tasknight, Windows/offline AI cũ, các lần kiểm chứng đầu tiên. Giữ để tra cứu lịch sử; `docs/STATUS.md` chỉ còn các mục từ 2026-10-19 trở đi.
