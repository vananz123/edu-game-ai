# Trạng thái dự án

Bàn giao mới nhất nằm ngay trong file này (3 mục gần nhất). Các bàn giao cũ được lưu ở
`docs/handoff/status/` — mỗi ngày một file, nối thêm vào cuối file của ngày đó khi cần.
Quy ước: sau mỗi việc, chèn bàn giao mới ngay dưới tiêu đề "Bàn giao gần nhất"; nếu quá 3 mục,
chuyển mục cũ nhất vào file lưu trữ đúng ngày của nó và cập nhật mục lục.

## Mục lục bàn giao

### 2026-11-24 — #321 Điểm của TỪNG ĐỘI cũng đếm lên (và không bao giờ hiện số âm)
- Tiếp #320 theo lựa chọn **(a)**: trong chế độ thi đấu đội, con số giáo viên thật sự nhìn là **hàng chip điểm của các đội** trên thanh sân khấu và **BẢNG XẾP HẠNG ĐỘI** ở màn kết quả — cả hai trước đây đổi số tức thì.
- **Sửa:** `teamTurnBarHtml()` và `leaderboardHtml()` gắn `data-team-score` + `data-team-key` + `data-team-target`; hàm mới `animateTeamScores(root, { reveal })` dùng lại `animateScoreChip` của #320. Thanh đội được vẽ lại **toàn bộ** mỗi câu nên “số cũ” **không đọc được từ DOM** — phải nhớ theo khoá (`chip-0..n`, `board-0..n`), và `teamPointsShown` được **xoá khi bắt đầu ván mới** (khoá theo vị trí, ván sau có thể khác đội).
- **Luật thứ ba, riêng cho đội:** lần vẽ ĐẦU TIÊN **không được leo**. Một đội đã có điểm khi thanh vừa hiện ra mà lại thấy số mình chạy lên thì đó là nói dối; màn kết quả là chỗ **duy nhất** cố ý đếm từ 0 (`reveal: true`) vì ở đó đó là màn “công bố”.
- **Cổng `ui-score-countup-check` mở rộng 8 → 18 mục, và bắt được một lỗi thật của #320:** mẫu đầu của bảng xếp hạng là **`-44`** — `requestAnimationFrame` trả *thời điểm khung hình*, có thể **sớm hơn** `performance.now()` lấy ngay trước vòng lặp, nên `t` âm ⇒ ease ra giá trị âm ⇒ bảng điểm hiện một con số game chưa từng có. Sửa: kẹp `t` cả hai đầu (`Math.min(1, Math.max(0, …))`). Thêm một mục kiểm **không mẫu nào ngoài khoảng 0..tổng**.
- **Số liệu đo được (binary mới):** chip đội `0 → 8 → 45 → 87 → 101 → 112 → 118 → 120`, đáp đúng **120** = số game ghi; bảng xếp hạng `0 → 56 → 77 → 94 → 103 → 113 → 118 → 120`, hai hàng đều đáp đúng tổng thật của đội mình, **không mẫu nào âm**; lần vẽ đầu của thanh đội là `0,0` và **không leo**.
- **Một bài học về kỳ vọng của cổng:** ván 2 câu, mỗi đội trả lời đúng một câu ⇒ **cả hai** đội cùng **120**; kỳ vọng phải đọc `state.teamPlay.teams` **sau câu cuối** rồi sắp giảm dần (bảng xếp hạng sắp theo điểm), không phải chụp trước câu cuối.
- Cổng trên binary mới: `ui-score-countup-check` **18/18** · `ui-answer-mode-check` **219/219** · `ui-stage-illustration-check` **179/179** · `ui-play-surface-check` **812/812** · `ui-fullscreen-check` **20/20** · `ui-presentation-check` **93/93** · `ui-item-assets-editor-check` **157/157** · `ui-editor-art-check` / `ui-question-template-check` / `ui-library-paging-check` / `ui-project-selection-check` pass · unit **104/104** · `check:renderer-globals` **1131 functions / 9193 call sites, 0 undefined**.
- Installer: **16 539 259 byte** / 24-11 **09:18** / SHA-256 `d3b66d12c9a222a01dadb097c3a24aa5dca5963e8d032dd84cc33ec8052eb42c`.

### 2026-11-24 — #320 Điểm trên thanh sân khấu ĐẾM LÊN thay vì nhảy cóc
- Giáo viên chọn **(b)** sau #319: mục **S3-4** của kế hoạch — “điểm đội nhảy từ số cũ sang số mới ngay lập tức, giáo viên không biết đội nào vừa được thêm điểm”.
- **Nơi sửa là chỗ đã được gom từ #213:** `syncScoreChip()` là **nơi duy nhất** ghi tổng điểm lên `.stage-chip-score b`. Thêm `animateScoreChip(chip, from, to)` — 380 ms, ease-out, `requestAnimationFrame`.
- **Hai luật mà một con số động không được phá:** (1) **luôn đáp đúng con số thật** — một giá trị trung gian còn lại trên màn hình là một điểm SAI; (2) **dừng im lặng khi phần tử đã bị dựng lại** (`chip.isConnected`) — `renderQuestion()` thay `innerHTML` mỗi câu, ghi tiếp vào nút đã chết chỉ giữ một vòng lặp rAF sống. `prefers-reduced-motion` nhận thẳng con số.
- **Đo bằng cổng mới `tests/ui/ui-score-countup-check.js` (8/8)** — bấm đáp án THẬT rồi lấy mẫu chip thật mỗi ~35 ms: `0 → 20 → 46 → 62 → 82 → 93 → 106 → 112 → 118 → 120`, đơn điệu không giảm, **đáp đúng 120** (số game đã ghi), mọi mẫu là số nguyên. Nhánh reduced-motion đo thật bằng `Emulation.setEmulatedMedia` (WebView2 **có** mô phỏng được `prefers-reduced-motion`, khác `hover:none` ở #309): đọc ngay sau cú bấm đã là **120** — leo 0 bước.
- **Hai lỗi bắt được khi viết cổng:** (1) kỳ vọng “100 điểm” sai — trả lời nhanh còn được **thưởng tốc độ**, tổng thật là **120**; cổng phải so với `state.gameAnswers` chứ không với `points` trong fixture. (2) `check()` của `ui-check-lib` ghi `{name, ok}` chứ không phải `pass` — đếm sai làm báo “8 check(s) failed” trong khi chỉ 2 mục đỏ.
- **Sửa kèm một cái bẫy của cổng `ui-play-surface-check`:** mục `[zoom]` “nút ẩn cho tới khi trỏ tới” đọc `opacity` **trước** khi di chuyển con trỏ, nên nó đo **vị trí chuột thật của máy** (lần này chuột đang nằm trên hình ⇒ đỏ `opacity 1, pointer-events auto` trên bản đúng), và lần chạy thứ hai trong cùng phiên thì luôn đỏ vì chính mục đó đã dời con trỏ vào giữa hình. Thêm `Input.dispatchMouseEvent` về góc (1,1) trước khi đo ⇒ **812/812** ở cả hai lần chạy liên tiếp, không phụ thuộc chuột (bài học #271).
- Cổng trên binary mới: `ui-score-countup-check` **8/8** · `ui-play-surface-check` **812/812** · `ui-answer-mode-check` **219/219** · `ui-stage-illustration-check` **179/179** · `ui-fullscreen-check` **20/20** · `ui-presentation-check` **93/93** · `ui-item-assets-editor-check` **157/157** · `ui-editor-art-check` / `ui-question-template-check` / `ui-library-paging-check` pass · unit **104/104** · `check:renderer-globals` **1130 functions / 9186 call sites, 0 undefined**.
- Installer: **16 534 104 byte** / 24-11 **08:24** / SHA-256 `d8d354fb3727fbc9ca9ada187a3dedfe877d5613246f8a49e0aeb0ae77136475`.

### 2026-11-24 — #319 “Trình chiếu” là nút LỚN HƠN, không chỉ đổi màu
- Từ danh sách 3 lựa chọn ở #318, chọn mục **S2-4** của kế hoạch: nút **“Trình chiếu”** là hành động chính của cả màn chơi mà lại **cùng cỡ** với các nút phụ (`Chơi LAN`, toàn màn hình, đóng) — giáo viên mới không biết bấm đâu để chiếu.
- **Đo trước khi sửa (1366×768, cửa sổ):** `.play-tool` cao **38 px** cho mọi nút; “Trình chiếu” 116×38, chữ **12 px** — bằng đúng chữ của “Chơi LAN”; ba nút phụ 38×38. Nút chính chỉ khác màu, và ở khoảng cách cuối lớp thì **màu không còn là tín hiệu**, kích thước mới là.
- **Sửa (chỉ CSS, `.play-tool-present`):** `height 38 → 44 px`, `padding 0 15 → 0 20 px`, `font-size 12 → 13.5 px`, thêm vòng sáng `0 0 0 3px rgba(106,90,224,.14)` ngoài bóng đổ cũ.
- **Đo sau khi sửa (cùng ba khổ, không suy đoán):**

  | khổ | nút Trình chiếu | chữ | nhãn | dải đầu trang | thân sân khấu | trang cuộn |
  |---|---|---|---|---|---|---|
  | 1366×768 cửa sổ | **133×44** | 13.5 px | **1 dòng** | 106 px (không đổi) | 1134×552, đáy 714 | 1109 / 768 (sân khấu tự cuộn — #311) |
  | 1024×640 cửa sổ | **133×44** | 13.5 px | 1 dòng | 106 px | 947×649 | 1667 / 640 (sân khấu tự cuộn) |
  | 1024×640 toàn màn hình | **133×44** | 13.5 px | 1 dòng | **84 px (không đổi)** | đáy 626 | **640 / 640 — vừa khít, không cuộn** |
  | 1366×768 toàn màn hình | **133×44** | 13.5 px | 1 dòng | **84 px (không đổi)** | đáy 754 | **768 / 768 — vừa khít** |

  Nút lớn hơn **+16 % chiều cao, +17 px bề ngang** mà **không** làm dải đầu trang cao thêm ở bất kỳ khổ nào — nên hợp đồng #208 (1366×768 đủ 4 đáp án, không phải cuộn) vẫn nguyên. Mô hình thị giác trên ảnh chụp: *“the purple button is the main action … modestly larger than the small icon buttons … fully visible on one line and appears vertically centered … no overlap, clipping or misalignment.”*
- **Cổng:** `ui-play-surface-check` **812/812** (có điều kiện `present ≥ 34 px`, nhãn **1 dòng**, `present.w > 70` — tất cả vẫn qua) · `ui-fullscreen-check` **20/20** · `ui-stage-illustration-check` **179/179** · `ui-answer-mode-check` **219/219** · `ui-editor-art-check` pass · `npm run verify:css` **61/61**.
- **Sửa kèm một lỗi do #318 gây ra:** chú thích tôi viết ở #318 để cảnh báo về comment hỏng lại **chứa chính dấu đóng comment**, nên Tailwind đọc phần đuôi thành CSS thật và `npm run build` chết với `CssSyntaxError: Missing opening {` ở `game-animations.css:17`. Diễn đạt lại bằng chữ, không chép dấu đó. Bài học: **một comment giải thích về dấu comment không được chứa dấu đó.**
- Installer: **16 535 220 byte** / 24-11 **02:14** / SHA-256 `551887d37071e46cce0688671499fa3554d03a739aabbb6fe37c96ac6d1536d4`.
