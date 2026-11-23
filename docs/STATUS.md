# Trạng thái dự án

Bàn giao mới nhất nằm ngay trong file này (3 mục gần nhất). Các bàn giao cũ được lưu ở
`docs/handoff/status/` — mỗi ngày một file, nối thêm vào cuối file của ngày đó khi cần.
Quy ước: sau mỗi việc, chèn bàn giao mới ngay dưới tiêu đề "Bàn giao gần nhất"; nếu quá 3 mục,
chuyển mục cũ nhất vào file lưu trữ đúng ngày của nó và cập nhật mục lục.

## Mục lục bàn giao

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

### 2026-11-24 — #317 Nhập câu hỏi: dòng nào bị bỏ thì phải NHÌN THẤY, và dán thẳng từ Excel
- Giáo viên chọn **cả hai** việc: (a) nhập câu hỏi phải **báo cáo dòng bị bỏ kèm lý do** thay vì chết ở dòng sai đầu tiên, (b) **dán thẳng** bảng từ Excel/tài liệu, không cần lưu tệp.
- **Trước #317:** `rowsToQuestions()` **throw** ở dòng hỏng đầu tiên ⇒ cả tệp mất; và khi nhập được, giáo viên đếm 12 dòng trong Excel mà chỉ thấy 11 câu, không có gì để nhìn. Đó là cùng một lỗi với #316: một cánh cửa không nói vì sao nó đóng.
- **`src/services/input/question-import.ts`:** thêm `QuestionImportReport`, `importQuestionsFromFileReport()`, `importQuestionsFromPastedText()` + `looksLikeTable()` (dòng tiêu đề có “Câu hỏi”/“question” ⇒ đọc theo hàng, còn lại ⇒ đọc theo khối như cũ), `rowsToQuestionsReport()` + `rowIssueField()`. `rowsToQuestions()` được tách `readRow()`: **có** bộ thu thì dòng hỏng thành `QuestionImportIssue` và vòng lặp chạy tiếp; **không** có thì đường cũ giữ nguyên từng chữ của thông báo. Lỗi ở mức TỆP (sai đuôi, quá trần, thiếu cột bắt buộc) vẫn throw — chưa đọc được gì thì không có gì để báo cáo.
- **Vỏ Tauri:** op `'files:parse-questions'` trong `template.js`, hàm `pub fn parse_questions` trong `document.rs` (từ chối chữ rỗng TRƯỚC khi vào V8), `#[tauri::command] parse_questions` + dòng `hand_written()` + đăng ký `generate_handler!` trong `api.rs`/`lib.rs`, thêm vào `INVOKE_CHANNELS` và vòng test kênh. Façade: `parseQuestionsText` (nhóm `files`), `src/shared/types.ts` có `QuestionImportPayload`.
- **Giao diện trình soạn thảo:** khung gấp `.editor-paste` (textarea + “Nhập câu hỏi đã dán” + “Xoá ô”) và **bảng báo cáo** `[data-editor-import-report]` đặt **trên** danh sách câu hỏi: câu dẫn “Đã nhập N câu từ …”, số dòng bị bỏ, bảng 3 cột **Vị trí / Cột / Vì sao bị bỏ** (kèm trích đoạn dòng giáo viên đã viết), tối đa 40 dòng rồi “… và N dòng nữa”. Viền trái **xanh** khi đủ, **hổ phách** khi thiếu (`data-complete="0"`).
- **Hai lỗi bắt được trong lúc làm, cả hai đều đáng ghi:**
  1. Đếm câu trùng SAU khi đã đẩy câu vào `game.questions` ⇒ “bỏ qua N câu đã có” luôn bằng **toàn bộ** số câu vừa nhập. Sửa: đếm **trước** khi đẩy.
  2. `$('[data-editor-import-report-close]', root)` ở thời điểm nối trang trả `null` (bảng chưa tồn tại), `addEventListener` ném lỗi và **giết mọi handler sau nó** — nút “Huỷ” của trình soạn thảo chết theo. Sửa: **một listener uỷ nhiệm** trên trang (bài học #309). Cổng bắt được đúng triệu chứng “cancelling returns to the library — editor”.
- **Bàn giao cho giáo viên không thấy báo cáo:** ở 1366×768 bảng nằm dưới màn hình (y=567/768 vì khung dán cao 197 px) ⇒ `showImportReport` gọi `scrollIntoView({block:'nearest'})`. Một báo cáo không nhìn thấy thì bằng không có báo cáo.
- **Kiểm chứng:** `tests/unit/question-import-report.test.ts` (suite thứ 104) — tệp 2 dòng tốt + 2 dòng hỏng ⇒ 2 câu, issue ở dòng **3** và **5** đúng cột `prompt`/`answer` kèm trích đoạn; tệp hỏng toàn bộ ⇒ 0 câu, không throw; đường chặt vẫn throw **đúng** câu cũ; lỗi mức tệp vẫn throw; bảng dán TAB ⇒ đọc theo hàng (2 câu, 1 issue ở dòng 3), chữ dán ⇒ đọc theo khối; dán rỗng ⇒ “Chưa có chữ nào để nhập”; **mọi `field` báo cáo đều có nhãn tiếng Việt** trong trình soạn thảo.
- Cổng `tests/ui/ui-question-template-check.js`: **14 → 21** — khung dán có thật (placeholder nhắc `Ctrl+V`), dán bảng 3 dòng (2 tốt + 1 sai đáp án) ⇒ danh sách **1 → 3 câu**, báo cáo hiện **trên** danh sách, `data-complete="0"`, dòng bị bỏ là **một hàng bảng** ghi “Dòng 3 / Đáp án / đáp án “Z” không khớp phương án.” + trích đoạn, ô dán được xoá sau khi nhập, đóng được.
- Đo trên binary mới (1366×768): báo cáo x=**256** rộng **990** — **cùng mép trái** với đầu mục và danh sách câu hỏi (#314 giữ nguyên); bảng rộng 961, cột “Vị trí” 148 px; trang vẫn cuộn được.
- Cổng trên binary mới: `ui-question-template-check` **21/21** · `ui-editor-art-check` pass · `ui-item-assets-editor-check` **157/157** · `ui-scene-designer-check` **84/84** · `ui-answer-mode-check` **219/219** · `ui-stage-illustration-check` **179/179** · `ui-fullscreen-check` **20/20** · `ui-game-background-check` **42/42** · `ui-library-paging-check` pass · `ui-project-selection-check` pass · `ui-presentation-check` **93/93** (phiên MỚI — chạy trong phiên đã bị cổng khác cài `window.confirm` thì đỏ vì `plugin:dialog|message`, đúng bài học #288) · `tauri:check` **56/56** + mở lại **10/10** · `cargo test --lib` **147/147** · unit **104/104** · `npm run check` pass · `check:renderer-globals` **1129 functions / 9173 call sites, 0 undefined** · `check:embedded` **6217.2 KiB**.
- Installer: **16 540 599 byte** / 24-11 **01:38** / SHA-256 `ca5a7da98267e86815ca0bf1870b6f8a25a87180d4a8424ac195f0248bd6c8f6`.
