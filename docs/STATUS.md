# Trạng thái dự án

Bàn giao mới nhất nằm ngay trong file này (3 mục gần nhất). Các bàn giao cũ được lưu ở
`docs/handoff/status/` — mỗi ngày một file, nối thêm vào cuối file của ngày đó khi cần.
Quy ước: sau mỗi việc, chèn bàn giao mới ngay dưới tiêu đề "Bàn giao gần nhất"; nếu quá 3 mục,
chuyển mục cũ nhất vào file lưu trữ đúng ngày của nó và cập nhật mục lục.

## Mục lục bàn giao

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

### 2026-11-26 — #372 dọn nhãn thừa trong Cài đặt, nhất là phần nhà cung cấp AI

- **Yêu cầu:** "loại bỏ những label không cần thiết gây loạn trong trang cài đặt, đặc biệt là phần
  nhà cung cấp AI".
- **Đếm được trước khi sửa (nguồn gây rối):**
  1. Tab "Nhà cung cấp AI" mang **hai chip nhỏ** (`○` và `0/4`) nói lại đúng hai chip đầy đủ trong
     header panel cách đó ~40 px; "0/4" là con số **không có nhãn**.
  2. Dòng footnote "Kiểm tra gửi một yêu cầu thật rất nhỏ (tối đa 8 token)…" giống nhau ở **cả bốn**
     thẻ ⇒ bốn dòng chữ nói cùng một điều.
  3. Dòng "lý do" của thẻ chưa cấu hình luôn là "Chưa có API key." — đúng câu chip ngay cạnh đã nói.
  4. OpenCode nhắc "Chưa dùng cho luồng tạo trò chơi" **hai lần** (badge + câu đầu của ghi chú).
  5. "Chưa lưu khoá." là câu thứ ba trong cùng thẻ nói "chưa có khoá".
  6. Thẻ model local nói về RAM **ba lần**: "Đánh giá máy: RAM đạt…", dòng số liệu RAM, và dòng
     "✓ RAM đạt mức khuyến nghị.".
  7. Dải "Cho trò chơi mới" có **bốn chip tên nhà cung cấp** lặp lại đúng tiêu đề bốn thẻ bên dưới.
- **Đã bỏ:** (1) chip trên nhãn tab — trạng thái vẫn còn nguyên **bằng chữ** trong header panel;
  (2) toàn bộ footnote 8 token; (3) dòng lý do **chỉ khi** trạng thái là `not-configured` (lý do của
  trạng thái khác thường — đang lỗi, đã cấu hình nhưng chưa kiểm tra — **vẫn giữ**, vì lúc đó nó là
  dữ kiện); (4) câu trùng trong ghi chú OpenCode; (5) "Chưa lưu khoá." khi chưa có khoá (khi **đã**
  có khoá thì dòng này là thông tin thật, nên giữ); (6) dòng RAM thứ ba — nhưng **giữ** cảnh báo đỏ
  "RAM thấp hơn mức tối thiểu" vì đó là cảnh báo, không phải câu lặp; (7) bốn chip tên.
- **Không mất thông tin (đây là điều cổng phải chứng minh):** vẫn đủ **bốn** nhà cung cấp, mỗi thẻ
  đúng **một** chip trạng thái, header panel vẫn **hai** chip (AI local + cloud), chip của hai tab
  "Phong cách"/"Giao diện" vẫn còn, lý do của thẻ OpenCode vẫn còn.
- **Cổng mới `tests/ui/ui-settings-ai-labels-check.js` 12/12:** đo bằng **số lần xuất hiện** của
  từng câu (`Kiểm tra gửi một yêu cầu thật` = 0, `RAM đạt mức khuyến nghị` = 0, `Chưa lưu khoá` = 0,
  tên nhà cung cấp **ngoài** thẻ = 0) và bằng cấu trúc (chip/tab/lý do). Cổng **từ chối chạy** (exit
  2) nếu tab "Nhà cung cấp AI" không còn — vì tab đó biến mất khi máy đã cấu hình AI đủ (#305).
- **Kết quả đo:** `tsc` sạch · unit **118/118** · `npm run check` sạch · `verify:css` **66/66** ·
  `check:renderer-globals` 0 undefined · `check:embedded` **6 217,2 KiB** · `cargo tauri build` OK ·
  `ui-account-check` **23/23** · `ui-motion-check` **19/19** · `ui-page-head-check` **6/6** ·
  `ui-sidebar-toggle-check` **17/17**.
- **Ảnh:** `tests/ui/shots/settings-ai-cloud-after.png` (+ `-dark.png`) và `settings-ai-before-crop.png`
  để so trước/sau; người soát ảnh xác nhận thẻ Gemini còn **đúng một dòng chữ phụ** và đọc theo thứ
  tự tên → chip → mô tả → ba trường → ba nút.
- **Chưa đo:** chưa ai bấm qua bốn thẻ bằng tay sau khi bỏ nhãn; câu giới thiệu dài ở đầu panel và
  dải "Cho trò chơi mới" vẫn còn (cố ý — chúng không lặp lại điều gì khác, chỉ dài).

### 2026-11-26 — #371 panel Tài khoản của người CHƯA đăng nhập: chỉ một nút, và không nháy hai lần

- **Yêu cầu (nguyên văn):** "khi chưa đăng nhập thì chỉ cần hiển thị đăng nhập là đủ, kiểm tra khi
  chưa đăng nhập mở lên nó bị nháy 2 lần gây khó chịu".
- **Đo được cú "nháy 2 lần" trước khi sửa:** mở panel ⇒ `#modalRoot` bị ghi **2 lần trong 58ms**
  (`guest` @16102 rồi `guest` @16160). Nguyên nhân: `openAccountPanel()` vẽ panel rồi gọi
  `accountLoadQuota()`; với Khách lời gọi đó **chắc chắn hỏng** (không có token), và `finally` của
  nó vẽ lại panel. Mỗi lần vẽ lại là `modalRoot.innerHTML = …` ⇒ một `.modal` MỚI ⇒ `animation:
  pop-in` + backdrop `fade-in` chạy lần nữa. Người dùng thấy panel nảy hai lần.
- **Sửa 1 — không đọc thứ chắc chắn hỏng:** chỉ gọi `accountLoadQuota()` khi `accountUiState()` là
  `member`. Không có lời gọi thì không có lần vẽ lại thứ hai khi vừa mở.
- **Sửa 2 — vẽ lại không dựng lại `.modal`:** `rerenderAccountPanel()` giờ thay `innerHTML` của
  `.modal-body` (và cập nhật `data-account-panel-state`) trên **cùng phần tử** `.modal`, rồi gắn lại
  handler; chỉ khi panel mất hẳn `.modal-body` mới thay cả khối. Animation nhập cảnh vì thế chạy
  đúng **một** lần cho mỗi lần mở, còn trạng thái/hạn mức vẫn cập nhật.
- **Sửa 3 — panel Khách tối giản:** bỏ danh sách ba quyền lợi, đoạn hướng dẫn hai câu và ghi chú
  "bạn đang ở chế độ Khách". Còn: tiêu đề "Đăng nhập để soạn câu hỏi bằng Cloud AI" + nút
  "Đăng nhập với Google". Đo: panel còn **460×270 px**, đúng **1** nút, không còn `.account-perks`
  / `.account-guest-note` / hạn mức / gói Pro / lịch sử / nút đăng xuất.
- **Cổng mới `tests/ui/ui-account-guest-check.js` 17/17** (cần hồ sơ WebView2 SẠCH; nếu hồ sơ đã
  đăng nhập thì cổng thoát với mã 2 và nói "không đo được" — không cho qua rỗng). Đo bằng hai đại
  lượng khách quan thay cho "nhìn xem có nháy không": số lần `#modalRoot` bị ghi (MutationObserver)
  = **1** lúc mở và = **1** khi mở lại, số lần `animationstart` của `.modal` = **1**. Thêm 4 check
  cho cơ chế vẽ lại: cùng một phần tử DOM, **0** pop-in khi vẽ lại, thân panel đổi sang `member`
  (trạng thái dựng — dữ liệu hạn mức do unit test lo), và nút Đóng vẫn sống sau lần vẽ lại.
- **Sửa độ bền của cổng #368:** `ui-sidebar-toggle-check` từng đỏ vì sau `Page.reload` nó `settle`
  cố định 2,5s — trên bản dựng nhúng khởi động chậm hơn, `data-sidebar` còn `null` nên 3 check đỏ
  và một bước sau đó ném lỗi. Giờ có `waitForBoot(c, 10000)`: chờ **đúng thứ mình sẽ đo** (thuộc
  tính `data-sidebar` có mặt), quá hạn thì vẫn báo đỏ. Đo lại: **17/17**.
- **Kết quả đo:** `tsc` sạch · unit **118/118** · `npm run check` sạch · `verify:css` **66/66** ·
  `check:renderer-globals` 0 undefined · `check:embedded` **6 217,2 KiB** · `cargo tauri build` OK ·
  `ui-account-check` **21/21** (chế độ Khách) · `ui-account-guest-check` **17/17** ·
  `ui-sidebar-toggle-check` **17/17** · `ui-motion-check` **19/19** · `ui-page-head-check` **6/6**.
- **Ảnh:** `tests/ui/shots/account-guest-371.png` (panel Khách 460×270, phóng 2×).
- **Chưa đo:** đường **đã đăng nhập** thật (mở panel ⇒ đọc hạn mức ⇒ vẽ lại thân) chưa chạy trên
  một phiên thật — phần "vẽ lại không dựng lại modal" chỉ được đo bằng trạng thái DỰNG; cú nháy
  được đo bằng số lần ghi DOM + số animation, không phải bằng mắt trên video.
