# Trạng thái dự án

Bàn giao mới nhất nằm ngay trong file này (3 mục gần nhất). Các bàn giao cũ được lưu ở
`docs/handoff/status/` — mỗi ngày một file, nối thêm vào cuối file của ngày đó khi cần.
Quy ước: sau mỗi việc, chèn bàn giao mới ngay dưới tiêu đề "Bàn giao gần nhất"; nếu quá 3 mục,
chuyển mục cũ nhất vào file lưu trữ đúng ngày của nó và cập nhật mục lục.

## Mục lục bàn giao

### 2026-11-26 — #376 bấm dấu "+" là bảng chọn giáo án bật lên thành POPUP NỔI

- **Yêu cầu:** "bấm vào dấu cộng thì hiện lên pop up luôn".
- **Trước:** bảng chọn giáo án là một **khối trong composer** nằm phía trên khung gõ, nên mở nó là
  **đẩy** hàng chip, hàng chế độ và khung gõ xuống — bố cục nhảy, và đầu bảng rơi đúng chỗ hàng chip
  vừa bị đẩy đi.
- **Sau:** bảng chọn được vẽ **trong** `.lesson-chat-field` (hộp bọc khung gõ) và là
  `position: absolute; bottom: calc(100% + 8px); left: 0; width: min(460px, 100%)`, có nhịp mở
  `eg-pop-up` (6px + mờ dần, 120ms), viền + bóng của một lớp nổi. Mở/đóng **không chiếm chỗ** trong
  luồng ⇒ không gì trong khung chat di chuyển.
- **Đo được (1366×768):** composer **261 → 261 px**, khung gõ **99 → 99 px**, khung chat **648 → 648
  px**, đỉnh nút "+" **556 → 556 px**; popup rộng **460 px** so với khung gõ **599 px** nên không đè
  sang cột danh sách; popup mở **lên trên** (đáy 554 ≤ đỉnh khung gõ 562).
- **Hai đường tắt cho một lớp nổi** (trước đây chỉ có nút "Xong"): `mousedown` ra ngoài
  `.lesson-chat-pop` và phím **Esc** đều đóng bảng (Esc đóng cả danh sách cuộc trò chuyện). Bấm lại
  dấu "+" vẫn mở/đóng được — đo sau khi Esc và sau khi bấm ngoài.
- **Hai lỗi hiển thị phát hiện qua ảnh 2× và sửa trong cùng việc này:**
  1. **Thanh cuộn NGANG** hiện ở đáy thẻ: `scrollWidth 484` > `clientWidth 459`. Nội dung dài đã có
     `text-overflow: ellipsis` nên chỉ cần chặn trục ngang (`overflow-x: hidden`) — trục dọc vẫn cuộn.
  2. **Tên tệp dài bị cắt ngang mép thẻ** chứ không có dấu "…": ô chữ rộng bằng nội dung nên
     `ellipsis` không bao giờ chạy. Thêm `min-width: 0` cho hàng và `flex: 1 1 auto` cho ô tên ⇒ tên
     432 px trong thẻ 459 px giờ cắt đúng bằng "…" (đo: `scrollWidth 432 > clientWidth 407`).
- **Cổng `tests/ui/ui-lesson-chat-attach-check.js` lên 23/23** (thêm 6 check): popup `position:
  absolute`; **không xê dịch bố cục** (4 số đo trước/sau bằng nhau); rộng không quá khung gõ; có
  `animationName eg-pop-up`; **Esc** đóng; **bấm ra ngoài** đóng; và mở lại được sau đó.
- **Kết quả đo:** `tsc` sạch · unit **118/118** · `npm run check` sạch · `verify:css` **66/66** ·
  `check:renderer-globals` 0 undefined · `check:embedded` **6 217,2 KiB** · `cargo tauri build` OK ·
  `ui-lesson-chat-send-check` **15/15** · `ui-lesson-page-check` **17/17** · `ui-motion-check`
  **19/19** · `ui-account-check` **23/23**.
- **Ảnh:** `tests/ui/shots/lesson-chat-popup-376.png` (toàn trang) và `-zoom.png` (popup 2×). Người
  soát ảnh xác nhận tên dài giờ cắt bằng "…", **không còn thanh cuộn ngang**, thẻ trông hoàn chỉnh.
- **Chưa đo:** chưa bấm "Tải giáo án mới" (hộp thoại tệp thật); chưa thử popup khi cửa sổ rất thấp
  (≤ 500 px cao, lúc đó `max-height: 46vh` bó thẻ lại).

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
