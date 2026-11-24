# Trạng thái dự án

Bàn giao mới nhất nằm ngay trong file này (3 mục gần nhất). Các bàn giao cũ được lưu ở
`docs/handoff/status/` — mỗi ngày một file, nối thêm vào cuối file của ngày đó khi cần.
Quy ước: sau mỗi việc, chèn bàn giao mới ngay dưới tiêu đề "Bàn giao gần nhất"; nếu quá 3 mục,
chuyển mục cũ nhất vào file lưu trữ đúng ngày của nó và cập nhật mục lục.

## Mục lục bàn giao

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

### 2026-11-24 — #318 Rà kế hoạch UI/UX 20 mục: 7 mục sai sự thật, không sửa gì thêm
- Giáo viên đưa `docs/archive/specs/ui-improvement-plan.md` (kế hoạch 4 sprint, 20 mục). Trước khi sửa, **kiểm chứng từng mục** với mã và với app đang chạy — vì tài liệu không được git theo dõi và không có ngày.
- **Mục nghiêm trọng nhất của kế hoạch là SAI.** Kế hoạch nói `answer-celebrate` bị comment hỏng nên “thẻ đúng hiện không có animation nào thực sự chạy”. Đo trên app (CSSOM): **25 keyframes**, `answer-celebrate` **có mặt và chạy**; chú thích hỏng thật nhưng cái `}` thật nằm sau `*/` nên `@keyframes` vẫn đóng đúng. Chỉ dọn lại chú thích (không đổi hành vi) + ghi cảnh báo: ai xoá `*/ }` sẽ giết animation mà không có gì đỏ.
- **Hai mục khác cũng sai:** S1-3 “toast biến mất đột ngột vì DOM bị xoá” — `.toast` là **một** phần tử thường trú, JS chỉ bật/tắt `.show`, `transition:.2s` đã có nên fade-out vẫn chạy. S3-1 “animation câu hỏi chỉ chạy lần đầu” — `renderQuestion()` dựng lại `root.innerHTML` mỗi câu nên nút DOM là **mới**, animation chạy lại từ đầu. S2-5 “`.match-card.selected` scale 1.02” — thật ra không có `transform` nào, chỉ viền + nền + vòng.
- **Kết quả rà 20 mục:** 7 sai/đã-có · 6 là *thiếu tính năng* (đếm điểm, cascade màn kết quả, stagger thẻ, hướng wizard, flash ghép cặp, flip 3D) chứ không phải bug · 7 là *thay đổi thẩm mỹ* đúng như mô tả nhưng không có khiếu nại nào của giáo viên đứng sau.
- **Rủi ro cụ thể nếu làm theo kế hoạch nguyên bản:** S2-6 tăng `padding` ngang của `.btn-primary.btn-small` sẽ đụng hợp đồng #316 (ba nút phải nằm **một hàng** ở 1366: x=952/1065/1201); S2-1 tăng `h1` 17→20px đổi chiều cao dải đầu trang mà các cổng bố cục đang đo; S4-5 `translateY(-3px)` khi hover không đo được bằng cổng (con trỏ luôn ở 0,0) nên sẽ là thay đổi **không kiểm chứng được**.
- **Đã sửa:** chỉ chú thích `@keyframes answer-celebrate` trong `src/renderer/styles/game-animations.css`. Không đổi byte CSS có hiệu lực. `npm run verify:css` **61/61**.
- **Chưa làm:** 19 mục còn lại, chờ giáo viên chọn (mỗi mục là một thay đổi thẩm mỹ, không phải sửa lỗi).
