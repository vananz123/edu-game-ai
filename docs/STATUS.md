# Trạng thái dự án

Bàn giao mới nhất nằm ngay trong file này (3 mục gần nhất). Các bàn giao cũ được lưu ở
`docs/handoff/status/` — mỗi ngày một file, nối thêm vào cuối file của ngày đó khi cần.
Quy ước: sau mỗi việc, chèn bàn giao mới ngay dưới tiêu đề "Bàn giao gần nhất"; nếu quá 3 mục,
chuyển mục cũ nhất vào file lưu trữ đúng ngày của nó và cập nhật mục lục.

## Mục lục bàn giao

### 2026-11-26 — #375 gộp "Chọn giáo án" + "Tải giáo án mới" thành một nút "+" trong khung gõ

- **Yêu cầu:** "gộp chọn giáo án và tải giáo án mới thành 1 dấu + rồi di chuyển vào trong khung chat".
- **Trước:** hai nút chữ ("Chọn giáo án", "Tải giáo án mới") chiếm trọn một hàng phía trên khung
  gõ, trong khi **cả hai đều dẫn tới cùng một bảng chọn giáo án** — hai nút cho một việc, và cả
  hai đều cách xa nơi con trỏ đang đứng.
- **Sau:** một nút tròn **30×30** `.lesson-chat-attach-btn` ở góc **dưới-trái TRONG khung gõ** (đối
  xứng với mũi tên gửi ở góc dưới-phải), icon `circle-plus`, icon-only + `aria-label="Chọn hoặc tải
  giáo án"` + `aria-expanded` (và class `is-open` khi bảng mở). Hàng chip phía trên giờ **chỉ còn
  chip**: nó trả lời "AI đang đọc gì", không phải "làm thêm bằng cách nào".
- **Một nút phải làm được việc của hai nút cũ:** bảng chọn giáo án (mở từ nút "+") **đã có** nút
  "Tải giáo án mới" — thêm vào cả trạng thái có giáo án lẫn trạng thái kho rỗng. Không có lối đó thì
  gộp nút là **giấu** mất chức năng tải tệp.
- **Chữ chừa chỗ cho cả hai nút:** textarea `padding-left: 44px` + `padding-right: 44px`.
- **Cổng mới `tests/ui/ui-lesson-chat-attach-check.js` 16/16:** composer có **đúng một** control mở
  bảng chọn; nó nằm trong khung gõ (cách mép trái **8px**, mép dưới **8px**), tròn 30×30, không chữ +
  có `aria-label`; **0** lần chữ "Chọn giáo án" và "Tải giáo án mới" trong composer khi bảng đóng;
  `padding-left 44`; hàng chip có 0 nút chọn/tải; bấm ⇒ bảng mở **phía trên** khung gõ, có
  `data-action="lesson-chat-import"`, liệt kê **5** giáo án, `aria-expanded="true"` + `is-open`;
  bấm lần nữa ⇒ đóng, vẫn đúng **một** nút.
- **Một unit test đã phải sửa theo (không phải nới):** `renderer-load-order` từng đòi
  `data-action="lesson-chat-import"` **có mặt trong HTML trang**; sau khi gộp, lối đó nằm trong bảng
  chọn nên chỉ xuất hiện khi bảng mở. Test giờ hỏi hai điều: (a) trang có nút mở bảng chọn, và
  (b) **bảng chọn đó thật sự có lối tải tệp** (`lessonChatPickerHtml()` với `showPicker = true`) —
  chỉ kiểm (a) là cho qua một cái nút mở ra bảng rỗng.
- **Kết quả đo:** `tsc` sạch · unit **118/118** · `npm run check` sạch · `verify:css` **66/66** ·
  `check:renderer-globals` 0 undefined · `check:embedded` **6 217,2 KiB** · `cargo tauri build` OK ·
  `ui-lesson-chat-send-check` **15/15** · `ui-lesson-page-check` **17/17** · `ui-motion-check` **19/19**.
- **Ảnh:** `tests/ui/shots/lesson-chat-attach-375.png` (composer 2×, bảng chọn đang mở),
  `lesson-page-375.png`. Người soát ảnh xác nhận đúng **một** nút "+" trong khung, hàng trên chỉ còn
  chip, và "Tải giáo án mới" chỉ còn bên trong bảng chọn.
- **Chưa đo:** chưa bấm "Tải giáo án mới" trong bảng (mở hộp thoại tệp thật của Windows); chưa thử
  chọn/bỏ chọn một giáo án qua bảng rồi hỏi AI.

### 2026-11-26 — #374 nút Gửi thành mũi tên tròn bên trong khung gõ chat

- **Yêu cầu:** "di chuyển nút gửi thành mũi tên bên trong khung chat".
- **Trước:** "Gửi" là một `.btn btn-primary btn-small` **có chữ**, nằm trong hàng `.lesson-chat-foot`
  dưới khung gõ (cạnh ô chọn nhà cung cấp) ⇒ chiếm một ô riêng cho bốn ký tự, và mắt phải đi
  xuống dưới khung gõ mới bấm được.
- **Sau:** `<div class="lesson-chat-field">` bọc textarea; nút `.lesson-chat-send` là **hình tròn
  30×30** đặt `right:8px; bottom:8px` **trong** khung, icon **`arrow-up`** (icon-only), nhãn đọc được
  ở `aria-label="Gửi câu hỏi"` + `title="Gửi (Enter)"`. Hook `data-lesson-chat-send` giữ nguyên nên
  Enter, đếm ký tự và khoá-khi-đang-gửi không phải sửa một dòng nào.
- **Chữ không chui xuống dưới nút:** textarea có `padding-right: 44px` + `padding-bottom: 12px`.
- **Bỏ tay nắm kéo-giãn của textarea** (`resize: none`): ảnh chụp 2× cho thấy tay nắm nằm **đúng
  dưới** nút gửi và bị nút che mất một nửa. Khung gõ vẫn cao 96–300px theo nội dung.
- **Nút Dừng dùng đúng chỗ đó:** khi đang trả lời, cùng hình tròn đó là `.is-stop`
  (`data-action="lesson-chat-stop"`, `aria-label="Dừng trả lời"`), nên bố cục không nhảy khi trạng
  thái đổi.
- **Cổng mới `tests/ui/ui-lesson-chat-send-check.js` 15/15:** nút nằm **hoàn toàn trong** hình chữ
  nhật của khung gõ (cách mép phải 8px, mép dưới 8px), tròn `border-radius: 50%`, **không chữ** +
  `aria-label` + có `<svg>`, hàng chân khung gõ **không còn chữ "Gửi"**, `padding-right 44px`,
  `resize none`; rỗng ⇒ `disabled`, gõ ⇒ bật, xoá ⇒ tắt lại, và bật/tắt **không đổi hình chữ nhật**
  (30×30, 8/8 ở cả hai trạng thái); trạng thái đang-trả-lời ⇒ cùng chỗ là nút Dừng.
- **Kết quả đo:** `tsc` sạch · unit **118/118** · `npm run check` sạch · `verify:css` **66/66** ·
  `check:renderer-globals` 0 undefined · `check:embedded` **6 217,2 KiB** · `cargo tauri build` OK ·
  `ui-lesson-page-check` **17/17** · `ui-motion-check` **19/19** · `ui-account-check` **23/23** ·
  `ui-settings-ai-labels-check` **12/12**.
- **Ảnh:** `tests/ui/shots/lesson-chat-send-374.png` (khung gõ 2×, có chữ) và `lesson-page-374.png`.
  Người soát ảnh xác nhận nút nằm gọn trong khung, không còn va vào tay nắm kéo-giãn.
- **Chưa đo:** chưa **bấm nút gửi để gửi một câu hỏi thật** (sẽ gọi AI thật) — mới đo trạng thái
  bật/tắt và vị trí; chưa thử nút này trên màn hình cảm ứng.

### 2026-11-26 — #373 trang Giáo án: bỏ chữ "Giáo án", khung chat choán hết chiều cao, cuộn không di chuyển

- **Yêu cầu (nguyên văn):** "quay qua trang giáo án đi, tôi cần xóa chữ 'giáo án' đi và là khung
  chat full. để khi scroll chúng không di chuyển".
- **Đo được trước khi sửa (1366×768):** trang cao **1308 px** trong cửa sổ 768 px nên **cả trang
  cuộn**; khung chat `position: sticky` nên lần cuộn đầu tiên nó **trượt** từ đỉnh 63 px xuống 14 px
  rồi mới đứng. Mắt đọc thấy khung chat "nhảy" một lần — đó là cái phải bỏ.
- **Bỏ hàng tiêu đề:** `<div class="page-head"><h1>Giáo án</h1>…` bị xoá hẳn. Hai nút của nó
  ("Nhập giáo án từ tệp", "Tạo dự án mới") **chuyển vào header khung chat** với nhãn ngắn hơn
  ("Nhập tệp", "Dự án mới") — không mất một hành động nào, và không còn hàng 29 px chiếm chỗ.
- **Trang không cuộn, chỉ danh sách cuộn:** `#pageContent[data-page="lesson-plans"]` cao `100vh`,
  `overflow: hidden`, là flex column; `.lesson-page` (khung mới bao cả hai cột) giãn hết; khung chat
  `height: 100%`; `.lesson-list-col` là thứ **duy nhất** có `overflow-y: auto`. Vì không có gì cuộn
  ngoài danh sách, khung chat **không thể** đổi hình chữ nhật khi cuộn.
- **`render()` giờ đặt `#pageContent.dataset.page`** — CSS cần biết trang nào đang mở, và một thuộc
  tính (không phải class do JS bật/tắt) thì không thể lệch với nội dung vừa vẽ.
- **Chỉ khoá từ 1181 px:** dưới ngưỡng đó hai cột xếp chồng (media query sẵn có của #182/#184);
  khoá chiều cao ở đó sẽ **giấu mất danh sách** — hỏng nặng hơn cái đang sửa.
- **Cổng mới `tests/ui/ui-lesson-page-check.js` 17/17.** Đo được: không còn `<h1>` (0), trang
  `scrollHeight 768 = winH 768`, khung chat **716 px** (≥ 90% cửa sổ), danh sách `overflow auto`
  1213 > 716; cuộn cửa sổ 500 px ⇒ **`scrollY = 0`**; cuộn danh sách 300 px ⇒ đỉnh/chiều cao khung
  **20/716 → 20/716** (không đổi) và composer vẫn nằm trong khung; ở **1024 px** hai cột xếp chồng,
  trang cao 1434 > 768 (cuộn lại được), khung chat 453 px (không bị ép 100vh).
- **Kết quả đo:** `tsc` sạch · unit **118/118** · `npm run check` sạch · `verify:css` **66/66** ·
  `check:renderer-globals` 0 undefined · `check:embedded` **6 217,2 KiB** · `cargo tauri build` OK ·
  `ui-page-head-check` **6/6** · `ui-settings-ai-labels-check` **12/12** · `ui-account-check`
  **23/23** · `ui-motion-check` **19/19**.
- **Ảnh:** `tests/ui/shots/lesson-page-373.png` (1366×768, chụp khi danh sách ở đầu), `-dark.png`,
  `-1024.png`. Người soát ảnh xác nhận đầu danh sách **không còn bị cắt**, khung chat chạy hết chiều
  cao, composer không bị cắt.
- **Chưa đo:** chưa gửi một câu hỏi thật sau khi đổi bố cục (transcript dài ra thì `.lesson-chat-scroll`
  vẫn là vùng cuộn bên trong — đúng thiết kế, nhưng chưa đo bằng câu trả lời thật); chưa thử cửa sổ
  rất thấp (≤ 600 px cao).
