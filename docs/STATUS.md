# Trạng thái dự án

Bàn giao mới nhất nằm ngay trong file này (3 mục gần nhất). Các bàn giao cũ được lưu ở
`docs/handoff/status/` — mỗi ngày một file, nối thêm vào cuối file của ngày đó khi cần.
Quy ước: sau mỗi việc, chèn bàn giao mới ngay dưới tiêu đề "Bàn giao gần nhất"; nếu quá 3 mục,
chuyển mục cũ nhất vào file lưu trữ đúng ngày của nó và cập nhật mục lục.

## Mục lục bàn giao

### 2026-11-24 — #328 Checklist P7 để cài trên máy Windows sạch
- Viết `docs/INSTALL_CHECKLIST.md`: **5 bước, 13 dòng kỳ vọng**, kèm bảng báo cáo để điền — phần duy nhất của P7 mà **máy ảo không đo được**: SmartScreen, thời gian cài, shortcut, mở lần đầu, **chơi offline thật** (rút Wi-Fi), gỡ cài và **dữ liệu giáo viên còn nguyên**.
- Mọi con số trong checklist đều lấy từ phép đo thật, không phải ước lượng: installer **16 538 871 byte / 11:52 / `d3920011…`** (có lệnh `Get-FileHash` để tự kiểm trước khi cài); **2 trò mẫu** trên bản sạch (đo ở #327); **9 thẻ** một trang thư viện; thư mục dữ liệu `%APPDATA%\vn.edugame.studio.tauri\edugame-data` (`DATA_SUBDIR = "edugame-data"` trong `src-tauri/src/paths.rs`); `installMode: currentUser` ⇒ không UAC.
- Ghi rõ điều **đã biết trước** để khỏi báo nhầm là lỗi: bộ cài **không ký số** ⇒ SmartScreen sẽ cảnh báo “Unknown publisher” (#324).
- Thêm một dòng vào bảng tài liệu của `docs/PROJECT_MAP.md` để lần sau tìm thấy.
- Không đổi mã sản phẩm, không dựng lại installer.

### 2026-11-24 — #327 Chạy TOÀN BỘ cổng trên một bản cài TRINH NGUYÊN (và bắt được một cổng ăn theo phiên cũ)
- Chưa từng có lượt nào chạy cổng trên **máy sạch giả lập**: lần này app khởi động với `EDUGAME_TAURI_GATE=1` + `EDUGAME_TAURI_DATA_DIR` là thư mục **rỗng mới** + `WEBVIEW2_USER_DATA_FOLDER` **rỗng mới** — đúng trạng thái một giáo viên thấy sau khi cài, chỉ thiếu chính bộ cài.
- **Kết quả: 15 cổng xanh trên bản trinh nguyên.** `ui-page-head-check` 6/6 · `ui-offline-play-check` 7/7 · `ui-library-stagger-check` 8/8 · `ui-question-template-check` pass · `ui-editor-art-check` pass · `ui-library-paging-check` pass · `ui-project-selection-check` pass · `ui-item-assets-editor-check` 157/157 · `ui-score-countup-check` 18/18 · `ui-memory-flip-check` 9/9 · `ui-matching-finish-check` 22/22 · `ui-play-surface-check` 812/812 · `ui-stage-illustration-check` 179/179 · `ui-presentation-check` 93/93 · `ui-answer-mode-check` 219/219 · `ui-result-cascade-check` 9/9 · `ui-fullscreen-check` **20/20 hai phiên liền**.
- **Một cổng ĐỎ, và nó đỏ vì chính nó:** `ui-library-stagger-check` chỉ thấy **2 thẻ** trên bản trinh nguyên (2 game mẫu của lần chạy đầu). Nguyên nhân: nó lưu 9 game qua kênh `saveGame` — kênh đó ghi **xuống đĩa**, còn `state.db` của renderer **không tự tải lại**; trên profile ấm 9 thẻ hiện ra nhờ trạng thái còn lại từ các lượt trước. Sửa: `await refreshDb()` sau khi lưu. Xanh **8/8** trên bản trinh nguyên.
- Bài học: **một cổng ăn theo phiên cũ không chứng minh gì về máy sạch** — và nếu chỉ chạy cổng trên profile ấm thì lỗi này không bao giờ lộ.
- Không đổi một dòng mã sản phẩm nào trong lượt này; chỉ sửa cổng và ghi lại.

### 2026-11-24 — #326 Tiêu đề trang 17 → 20px, và dải đầu trang KHÔNG được nhích
- Mục **S4-1**: `.page-head h1` từ **17px** lên **20px** (`letter-spacing` −.2 → −.25px). Đây là thay đổi **thuần chữ**, nên câu hỏi thật không phải “có đẹp hơn không” mà **có xê dịch trang không**.
- **Đo TRƯỚC và SAU ở 1280×800 / 1366×768 / 1920×1080** trên cả **Thư viện** và **Dự án của tôi**: dải đầu trang **28px trước, 28px sau** — vì chiều cao dải do **cột nút bên phải** quyết định, không do tiêu đề; bề rộng nội dung **1038 / 1124 / 1280 không đổi**. Tiêu đề `20px`, cao `25px`, **1 dòng**, không chồng lên nút.
- **Cổng mới `tests/ui/ui-page-head-check.js` (6/6)**: ghim `20px`, dải `28px`, **không chồng** nút, **1 dòng**, và **hai loại trang dùng cùng hình học dải** (#314: một trang không được tự chọn bề rộng/chiều cao của riêng nó).
- Cổng trên binary mới: `ui-page-head-check` **6/6** · `ui-question-template-check` (ba nút vẫn một hàng) pass · `ui-editor-art-check` pass · `ui-item-assets-editor-check` **157/157** · `ui-library-stagger-check` **8/8** · `ui-play-surface-check` **812/812** · `ui-stage-illustration-check` **179/179** · `ui-answer-mode-check` **219/219** · `ui-presentation-check` **93/93** · `ui-result-cascade-check` **9/9** · `ui-library-paging-check` / `ui-project-selection-check` pass · unit **104/104** · `verify:css` **61/61**.
- Installer: **16 538 871 byte** / 24-11 **11:52** / SHA-256 `d39200114ed4b9f743332d439ff913b71ff5c08f79a7db90bed61a4db70c8a8f`.
