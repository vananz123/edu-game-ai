# Trạng thái dự án

Bàn giao mới nhất nằm ngay trong file này (3 mục gần nhất). Các bàn giao cũ được lưu ở
`docs/handoff/status/` — mỗi ngày một file, nối thêm vào cuối file của ngày đó khi cần.
Quy ước: sau mỗi việc, chèn bàn giao mới ngay dưới tiêu đề "Bàn giao gần nhất"; nếu quá 3 mục,
chuyển mục cũ nhất vào file lưu trữ đúng ngày của nó và cập nhật mục lục.

## Mục lục bàn giao

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

### 2026-11-23 — #316 “Không có mẫu thì nhập CSV/XLSX thế nào?” — nút Tải tệp mẫu
- Giáo viên: **“chức năng nhập csv/xlsx tuy nhiên nếu không có mẫu thì làm thế nào người dùng nhập được”**. Đúng: nút duy nhất trong trình soạn thảo là **“Nhập CSV/XLSX”**, nó mở hộp thoại mở tệp cho một định dạng chưa ai đưa cho giáo viên. Không có tệp ⇒ không có đường vào.
- **Thêm:** `src/shared/question-template.ts` — nguồn duy nhất của tệp mẫu (`QUESTION_TEMPLATE_COLUMNS`, `QUESTION_TEMPLATE_ROWS`, `questionTemplateCsv()`, `QUESTION_TEMPLATE_FILE_NAME = 'mau-cau-hoi-edugame.csv'`). Bản mirror cho renderer ở `src/renderer/shared/question-template.ts` (renderer là script toàn cục, không `import`), nạp trong `src/index.html` **trước** `features/editor/page.js`.
- **Tệp mẫu là tệp mà bộ nhập THẬT SỰ đọc được:** dòng tiêu đề 10 cột (Câu hỏi, Dạng câu hỏi, Phương án A–D, Đáp án, Giải thích, Điểm, Độ khó) + **4 dòng ví dụ, mỗi dòng một dạng trò chơi chơi được**: trắc nghiệm, đúng/sai, điền từ, trả lời ngắn. Dấu `;` (Excel tiếng Việt), UTF-8 **BOM** + **CRLF** để Excel mở không lỗi font. Ô nhiều đáp án (`hướng đông;đông`) được bọc ngoặc kép nên vẫn là MỘT ô.
- **Giao diện:** nút **“Tải tệp mẫu”** đặt **trước** “Nhập CSV/XLSX” (giáo viên chưa có tệp đọc thấy trước), thêm một dòng `#editorImportHint`: “Chưa có tệp? Bấm **Tải tệp mẫu** — tệp CSV mở bằng Excel, có sẵn 4 dòng ví dụ… Điền tiếp bên dưới rồi bấm **Nhập CSV/XLSX**. Tối đa 100 câu mỗi tệp…”. Nút tải bằng Blob + `<a download>` (cùng cách trang Lịch sử kết quả xuất CSV), báo `toast`.
- **Kiểm chứng vòng tròn (điều quan trọng nhất):** `tests/unit/question-template.test.ts` đưa **chính chuỗi CSV xuất ra** vào `importQuestionsFromFile` và đòi ra **4 câu** đúng dạng, đúng đáp án (`A`, `Đúng`, `hướng đông` + `đông`, `Hà Nội`), đúng điểm/độ khó; đồng thời so bản renderer với bản shared **từng byte**. Bản nháp đầu tiên đã đỏ đúng chỗ: ô `"hướng đông;đông"` bị bọc ngoặc kép **hai lần** ⇒ bộ đọc trả về `"hướng đông` — sửa bằng cách để dữ liệu thô và cho hàm CSV tự bọc.
- Cổng mới `tests/ui/ui-question-template-check.js` (**14/14**): nút tồn tại + đứng trước + dòng gợi ý hiện thật; bấm nút ⇒ bắt được **đúng 1 blob** `text/csv`, tên `mau-cau-hoi-edugame.csv`, **BOM đọc từ BYTE** (`Blob.text()` nuốt BOM nên đọc chữ luôn trả "không"), 5 dòng, 10 cột, 4 dạng câu, mỗi dòng đủ 10 ô khi tách **tôn trọng ngoặc kép**, tiếng Việt không lỗi font.
- Cổng khác trên binary mới: `ui-editor-art-check` **pass** · `ui-item-assets-editor-check` **157/157** · `ui-answer-mode-check` **219/219** · `ui-scene-designer-check` **84/84** · unit **103/103** (thêm 1 suite) · `check:renderer-globals` **1127 functions / 9139 call sites, 0 undefined**.
- Đo bố cục: dải đầu mục vẫn cao **49 px** ở 1366 và 1920, ba nút nằm **một hàng** (1366: x=952/1065/1201), dòng gợi ý cao 36 px.
- Installer: **16 526 905 byte** / 23-11 **23:24** / SHA-256 `883b91fd34de7093913a9d9b8e7dcc4f8033538fc35f3be3ba05cf9a8596be1b`.

### 2026-11-23 — #315 Khối ảnh trong thẻ câu hỏi không còn dán sát mép thẻ
- Giáo viên: **“tính năng chỉnh sửa phần giao diện hiển thị ảnh nó sát quá”**. Đo trên bản build: thẻ câu hỏi x=**256**, hình thu nhỏ x=**257** — cách mép **1 px**, và vì thẻ có `overflow:hidden` + bo góc 14 px nên góc vuông của ảnh bị cắt cụt. Khoảng hình → nút chỉ **12 px**.
- **Nguyên nhân:** khối ảnh `.editor-item-art` là **con trực tiếp** của `.editor-question` (thẻ `padding:0`), và lần chỉnh #303 đã đặt `margin:0;padding:0;border:0` cho khối này. Các con khác của thẻ (ô câu hỏi, phương án, `correct-select`) đều thụt 12 px, riêng khối ảnh thì không.
- **Sửa (chỉ CSS, không đổi markup, không đổi selector):** `.editor-item-art{margin:0 12px 12px;padding:10px 11px;gap:16px}` — thụt vào đúng 12 px như các con khác, đệm 10/11 px bên trong, khoảng hình → nút 16 px.
- **Đo lại trên bundle thật (không phải CSS tiêm):**

  | khổ | mép thẻ | hình → mép trái thẻ | hình → nút | kích thước hình |
  |---|---|---|---|---|
  | 1366×768 | 256 | **24 px** | **16 px** | 148×93 |
  | 1920×1080 | 460 | **24 px** | **16 px** | 300×188 |
  | 2560×1440 | 780 | **24 px** | **16 px** | 300×188 |

  (24 = 12 lề + 11 đệm + 1 viền thẻ.) Mô hình thị giác trên ảnh chụp 1366: *“small but visible margin inside its rounded mint-green frame … roughly 16 px of horizontal space … comfortably spaced rather than cramped”*.
- Cổng trên binary mới: `ui-editor-art-check` **pass** · `ui-item-assets-editor-check` **157/157** · `ui-scene-designer-check` **84/84** · `ui-stage-illustration-check` **179/179** · `ui-answer-mode-check` **219/219**.
- Installer: **16 530 770 byte** / 23-11 **22:52** / SHA-256 `41343f34195e832ff734dfc92684ce31d105591a3bdc34a72949f53a679ea745`.
