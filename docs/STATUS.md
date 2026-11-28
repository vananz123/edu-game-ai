# Trạng thái dự án

Bàn giao mới nhất nằm ngay trong file này (3 mục gần nhất). Các bàn giao cũ được lưu ở
`docs/handoff/status/` — mỗi ngày một file, nối thêm vào cuối file của ngày đó khi cần.
Quy ước: sau mỗi việc, chèn bàn giao mới ngay dưới tiêu đề "Bàn giao gần nhất"; nếu quá 3 mục,
chuyển mục cũ nhất vào file lưu trữ đúng ngày của nó và cập nhật mục lục.

## Mục lục bàn giao

### 2026-11-26 — #378 lời mời ở khung chat rỗng: "Hỏi về giáo án của bạn"

- **Yêu cầu:** "Cứ hỏi, không cần mở giáo án … Xóa câu này đổi lại thành hỏi về giáo án".
- **Câu cũ dài 4 dòng và chỉ vào một nút KHÔNG CÒN TỒN TẠI:** nó viết "gắn giáo án bằng nút **Chọn
  giáo án** trong khung gõ", nhưng từ #375 hai nút đó đã gộp thành **một nút "＋"** — tức là lời mời
  đang dạy người dùng đi tìm một thứ không có trên màn hình.
- **Câu mới:** tiêu đề **"Hỏi về giáo án của bạn"** + hai dòng: *"Gắn giáo án bằng nút **＋** trong
  khung gõ để câu trả lời kèm trích dẫn đúng bài. Cần bộ câu hỏi thì hỏi thẳng, ví dụ "tạo 8 câu hỏi
  về bài này"."* Ngắn hơn một nửa, và chỉ vào đúng control đang có.
- **Cổng `tests/ui/ui-lesson-page-check.js` 17 → 21/21** với bốn check mới: tiêu đề đúng chữ mới;
  câu cũ **đã biến mất**; câu mời **không** nhắc "Chọn giáo án" đã bị gộp; và câu mời **có** nhắc nút
  "＋". Ba check sau là loại lỗi đã xảy ra thật: một lời mời trỏ vào control đã bị gộp thì vẫn "qua"
  mọi cổng cũ vì không cổng nào đọc nội dung câu đó.
- **Kết quả đo:** `tsc` sạch · unit **118/118** · `npm run check` sạch · `verify:css` **66/66** ·
  `check:renderer-globals` 0 undefined · `check:embedded` **6 217,2 KiB** · `cargo tauri build` OK ·
  `ui-lesson-chat-attach-check` **28/28** · `ui-lesson-chat-send-check` **15/15** · `ui-motion-check`
  **19/19** · `ui-account-check` **23/23**.
- **Ảnh:** `tests/ui/shots/lesson-empty-378.png` (toàn trang) và `-zoom.png` (khối rỗng 2×).
- **Chưa đo:** chưa hỏi thử một câu thật để thấy khối rỗng biến mất đúng lúc; độ dài câu mới chỉ đo
  bằng số dòng nhìn thấy, không đo bằng số ký tự người đọc.

### 2026-11-26 — #377 popup dính sát nút "+", và hết nháy khi chọn giáo án

- **Yêu cầu (nguyên văn):** "tôi cần phần pop up gần nút + hơn, lỗi khi chọn giáo án bị nháy".
- **Vì sao popup ở xa:** nó được neo vào **đỉnh cả khung gõ** (`bottom: calc(100% + 8px)` của
  `.lesson-chat-field`), mà khung gõ cao 99 px ⇒ đo được đáy popup cách nút **69 px**. Giờ neo vào
  chính nút: `bottom: 46px` (nút chiếm 8–38 px từ đáy khung) + `left: 4px` ⇒ **cách nút 8 px, lệch
  trái 4 px**, và không che nút "+" hay mũi tên gửi. Nhân đó thu bề rộng **460 → 380 px** và
  `max-height 320 → 300`: ở 460 px nó phủ gần kín cả khung gõ lẫn hàng chip (ảnh 2× cho thấy đúng
  thế); tên tệp đã có "…" nên hẹp hơn không mất thông tin. Che khung gõ còn **54%**.
- **Nguyên nhân cú "nháy" (đo được):** mỗi lần tick một giáo án gọi `render()` — hàm vẽ lại **toàn
  bộ trang**: **29 mutation** trong `#pageContent`, phần tử `.lesson-chat-pop` bị **thay bằng phần tử
  mới**, nên `eg-pop-up` **chạy lại** ⇒ màn hình nháy đúng lúc người dùng đang tick.
- **Sửa:** thêm `lessonChatSyncPicked()` — chỉ sửa ba thứ thật sự đổi khi tick (hàng chip, câu gợi ý
  dưới khung gõ, trạng thái nút gửi) **tại chỗ**; bảng chọn không phải vẽ lại vì ô checkbox đã tự
  đổi. Áp cho cả `lesson-chat-pick-all` ("Chọn tất cả"/"Bỏ chọn" đổi mọi ô tại chỗ) và
  `lesson-chat-remove-doc`.
- **Đo lại:** tick một giáo án ⇒ **2 mutation** (trước 29), **cùng một phần tử popup**, **0** lần
  animation nhập cảnh; hàng chip và câu gợi ý vẫn cập nhật đúng ("Đã chọn 4 giáo án…"). "Chọn tất
  cả" ⇒ 4 mutation, cùng phần tử, 0 animation, 5 chip, mọi ô đã tick.
- **Cổng `tests/ui/ui-lesson-chat-attach-check.js` lên 28/28** (+5 check): popup cách nút **≤ 12 px**
  và lệch trái **≤ 10 px**; tick một giáo án ⇒ **cùng phần tử DOM**, **0 animation**, **≤ 6
  mutation**, chip/gợi ý khớp số đã tick. Một check cũ được viết lại cho đúng câu hỏi mới: popup dính
  vào nút thì **nằm đè** lên khung gõ là đúng, điều không được phép là che hai nút dưới cùng.
- **Kết quả đo:** `tsc` sạch · unit **118/118** · `npm run check` sạch · `verify:css` **66/66** ·
  `check:renderer-globals` 0 undefined · `check:embedded` **6 217,2 KiB** · `cargo tauri build` OK ·
  `ui-lesson-chat-send-check` **15/15** · `ui-lesson-page-check` **17/17** · `ui-motion-check`
  **19/19** · `ui-account-check` **23/23**.
- **Ảnh:** `tests/ui/shots/lesson-chat-popup-377.png` (toàn trang), `-zoom.png` (2×, bản 460 px trước
  khi thu hẹp).
- **Chưa đo:** cảm giác "hết nháy" bằng mắt người trên video (chỉ đo được: cùng phần tử, 0 animation,
  2 mutation); chưa thử khi cửa sổ ≤ 500 px cao.

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
