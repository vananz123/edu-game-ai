# Trạng thái dự án

Bàn giao mới nhất nằm ngay trong file này (3 mục gần nhất). Các bàn giao cũ được lưu ở
`docs/handoff/status/` — mỗi ngày một file, nối thêm vào cuối file của ngày đó khi cần.
Quy ước: sau mỗi việc, chèn bàn giao mới ngay dưới tiêu đề "Bàn giao gần nhất"; nếu quá 3 mục,
chuyển mục cũ nhất vào file lưu trữ đúng ngày của nó và cập nhật mục lục.

## Mục lục bàn giao

### 2026-11-24 — #330 Dọn dẹp cây làm việc và cắt bản phát hành v0.5.2
- Dọn **7,0 GB** cache build Rust (`src-tauri/target/`), cùng `src-tauri/gen/`, `dist-tauri/`, `tests/ui/shots/`, `tests/manual/out/`, `tests/.ui-check-profile/`, `.tmp-cargo.log` và các profile WebView2 tạm trong `%TEMP%`. Cây làm việc còn **301 MB**.
- **Một chỗ Windows không cho xoá:** `dist/` (5,8 MB) bị một tiến trình giữ handle **không cho xoá** — ghi được, đổi tên được, `unlink` thì `Permission denied`. Đã đổi tên cả thư mục (đổi tên thư mục **được**) thành `.cache/` — tên đã nằm trong `.gitignore` (`.cache/`) nên `git status` sạch; xoá nốt sau khi khởi động lại máy.
- Giữ installer đã dựng ở #329 ra ngoài `target/` trước khi xoá: `%TEMP%\edugame-release-v0.5.2\` (kèm `SHA256.txt`).
- Không đổi mã sản phẩm. Chỉ tạo tag phát hành **`v0.5.2`** (annotated, 96 commit kể từ `v0.5.1`).

### 2026-11-24 — #329 Hai chuyển động mới: cặp thẻ VỪA GHÉP loé lên, và wizard trượt THEO HƯỚNG đi
- Mục **S3-6 (match flash)**: `@keyframes match-flash` — một **vòng sáng xanh lan ra rồi tắt** (`box-shadow` spread 0 → 9px → 0, 0.5s) trên `.match-card.matched`. Cố ý **không** đụng `transform`/`opacity`: độ mờ và màu chữ của thẻ đã ghép là chỗ hợp đồng dễ đọc bám vào.
- **Chỉ thẻ cặp đôi, không thẻ bộ nhớ**: một phần tử không chạy được hai `animation` shorthand — thêm loé vào `.memory-card.matched` sẽ **giết cú lật 3D của #322** chứ không thêm vòng sáng. Thẻ bộ nhớ đã có phần thưởng riêng là cú lật.
- Mục **S3-4 (wizard direction)**: `.wizard-step.is-forward` / `.is-back`, `wizard-step-forward` (16px → 0) và `wizard-step-back` (−16px → 0), 0.24s. Hướng do `wizardStepMotionClass()` quyết định theo chỉ số bước; **đổi bước mới trượt, gõ phím thì không** (cùng bước ⇒ không lớp nào).
- **Lớp chuyển động được gắn SAU khi render** (`wireCreateWizard`), không chỉ nhét vào chuỗi HTML: markup của trang có thể được sinh **hai lần** trong một lần render, và bản thứ hai (không có lớp) sẽ đè bản đầu — đo được đúng như vậy trước khi sửa.
- Giảm chuyển động: cả hai bị tắt trong `prefers-reduced-motion` (đo bằng cách giả lập `reduce` qua CDP).
- **Hai cổng mới:** `tests/ui/ui-match-flash-check.js` **6/6** (vòng sáng **lan rộng thật**: spread lớn nhất 8.98px; **tắt hẳn**: 0px; và bằng chứng “chỉ đổi box-shadow” đọc từ **keyframes của chính animation**) · `tests/ui/ui-wizard-motion-check.js` **8/8** (lần vẽ đầu **không** trượt; vẽ lại cùng bước **không** trượt; tiến `wizard-step-forward` với offset 16→0; lùi `wizard-step-back`, bước về đúng `input`).
- **Ba lỗi của chính cổng, đã sửa:** (1) đọc **blur** thay vì **spread** của `box-shadow` nên “đo” được vòng sáng 16px vốn là quang của thẻ; (2) tưởng `animation-name` về `none` sau khi chạy xong — nó **vẫn là `match-flash`**; (3) `getAnimations()[0]` có thể là một **transition** (`borderBottomColor`), phải chọn animation **theo tên**.
- Xanh trên binary mới: `ui-match-flash-check` **6/6 hai lần liền** · `ui-wizard-motion-check` **8/8** · `ui-memory-flip-check` **9/9** · `ui-matching-finish-check` **22/22** · `ui-answer-mode-check` **219/219** · `ui-result-cascade-check` **9/9** · `ui-play-surface-check` **812/812** · `ui-stage-illustration-check` **179/179** · `ui-item-assets-editor-check` **157/157** · `ui-presentation-check` **93/93** · `ui-question-template-check` / `ui-editor-art-check` / `ui-library-paging-check` / `ui-project-selection-check` pass · `ui-page-head-check` **6/6** · unit **104/104** · `verify:css` **61/61** · `check:renderer-globals` **1132 hàm / 9199 lời gọi, 0 undefined**.
- Installer: **16 537 073 byte** / 24-11 **13:42** / SHA-256 `5dc07146adcd862ff5302d4718030c30a5cc697e26034aa7f16ca3ffb04a6ff5`.

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
