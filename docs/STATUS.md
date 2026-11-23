# Trạng thái dự án

Bàn giao mới nhất nằm ngay trong file này (3 mục gần nhất). Các bàn giao cũ được lưu ở
`docs/handoff/status/` — mỗi ngày một file, nối thêm vào cuối file của ngày đó khi cần.
Quy ước: sau mỗi việc, chèn bàn giao mới ngay dưới tiêu đề "Bàn giao gần nhất"; nếu quá 3 mục,
chuyển mục cũ nhất vào file lưu trữ đúng ngày của nó và cập nhật mục lục.

## Mục lục bàn giao

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

### 2026-11-23 — #314 Một bề ngang cho mọi trang: trang chỉnh sửa không còn hẹp hơn thư viện
- Giáo viên: **“phần max-width không đồng bộ giữa các trang, trang chỉnh sửa lại ngắn hơn trang thư viện trò chơi”**. Đo được đúng như vậy ở **1920×1080**: `#pageContent` của cả hai trang đều 1280 px, nhưng nội dung **thư viện rộng 1232 px** (455 → 1687) còn **trang chỉnh sửa chỉ 1180 px** (481 → 1661) — hẹp hơn **52 px** và bị đẩy lệch **26 px** sang phải. Ở 1366×768 hai trang bằng nhau (1076 px) nên lỗi chỉ hiện trên màn hình rộng.
- **Nguyên nhân:** hai tầng cùng đặt trần. `#pageContent` đã có `max-w-[1280px] mx-auto` (index.html) là trần DUY NHẤT của mọi trang; riêng trang chỉnh sửa tự đặt thêm `.editor-page{max-width:1180px}` và `.editor-page-body{max-width:1200px}`, rồi cộng thêm `padding:0 20px` — nên nội dung thụt vào 20 px nữa so với thẻ thư viện.
- **Sửa (chỉ CSS, không đổi mã renderer):** `.editor-page` bỏ `max-width`; `.editor-page-body` còn `padding:0 0 40px`; `.editor-page-head` còn `padding:10px 0`. Một trang **chỉ được dùng phần đệm của `#pageContent`**, không tự chọn bề ngang.
- **Đo lại sau khi sửa (mép nội dung, không phải mép khung):**

  | trang | 1366×768 | 1920×1080 | 2560×1440 |
  |---|---|---|---|
  | Thư viện · Dự án · Giáo án · Cài đặt · Tạo trò chơi | 256 → 1332 (**1076**) | 455 → 1687 (**1232**) | 780 → 2012 (**1232**) |
  | Chỉnh sửa trò chơi | 256 → 1332 (**1076**) | 455 → 1687 (**1232**) | 775 → 2007 (**1232**) |

  Bên trong trang chỉnh sửa, dải đầu trang · thanh Lưu · thẻ cài đặt · hàng câu hỏi đều bắt đầu ở **cùng một mép** (1920: 455; 1366: 256).
- **Một chênh lệch 5 px còn lại là do thanh cuộn, không do CSS trang:** `#pageContent` canh giữa trong `.main`, nên khi trang hiện thanh cuộn (15 px) khung hẹp lại và nội dung dịch trái ~7 px (1920: thư viện 455, các trang không cuộn 460). Đã cân nhắc `scrollbar-gutter: stable` và **không thêm**: `src/renderer/styles/app.css` đã cố ý loại `rootscrollgutter` của daisyUI vì nó làm lệch bề rộng mà các cổng bố cục đo.
- Cổng trên binary mới: `ui-item-assets-editor-check` **157/157** · `ui-scene-designer-check` **84/84** · `ui-editor-art-check` **pass** · `ui-library-paging-check` **pass** · `ui-project-selection-check` **pass**.
- Installer: **16 525 891 byte** / 15.76 MiB / 23-11 **19:06** / SHA-256 `cf9b383174e88439444591e04e58c87dc233ff93ad9bab8c2d318b2fca6e3473`.
