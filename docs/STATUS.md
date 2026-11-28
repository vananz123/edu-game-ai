# Trạng thái dự án

Bàn giao mới nhất nằm ngay trong file này (3 mục gần nhất). Các bàn giao cũ được lưu ở
`docs/handoff/status/` — mỗi ngày một file, nối thêm vào cuối file của ngày đó khi cần.
Quy ước: sau mỗi việc, chèn bàn giao mới ngay dưới tiêu đề "Bàn giao gần nhất"; nếu quá 3 mục,
chuyển mục cũ nhất vào file lưu trữ đúng ngày của nó và cập nhật mục lục.

## Mục lục bàn giao

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

### 2026-11-26 — #370 chuyển động khi thao tác (thư viện làm ví dụ)

- **Yêu cầu:** "bổ sung các hiệu ứng chuyển động khi thao tác trên ứng dụng, có thể dùng thư viện"
  + "cứ chọn vào chạy không hỏi" ⇒ tự chọn phạm vi, tự đo, không hỏi lại.
- **Tệp mới `src/renderer/styles/motion.css`** (import CUỐI trong `app.css`, nên tinh chỉnh được các
  rule cũ bằng thứ tự, không cần `!important`): 5 biến `--motion-fast 120ms` / `--motion-base 180ms`
  / `--motion-slow 260ms` / `--motion-ease` / `--motion-lift -2px` và **một chỗ duy nhất** để tắt:
  `@media (prefers-reduced-motion: reduce)` đặt các biến về 0 **và** xoá `transform`/`translate`
  của từng rule — chỉ đặt thời lượng 0 là không đủ, vì cú nhảy tức thì đúng là thứ cần tránh.
- **Nút:** nhấn ⇒ chìm 1px, nhả ⇒ nổi lại; nút chính có bóng khi hover. Trước đây `.btn` chỉ
  chuyển động màu, nên trên màn hình cảm ứng không có phản hồi nào cho cú bấm.
- **Thẻ trò chơi (thư viện + dự án):** hover ⇒ nhấc **2px** + bóng đổi; nhấn ⇒ trở về 0; thẻ đang
  được chọn thì không nhấc (viền tím đã nói "đang chọn").
  **Lỗi đo được ở đây:** đặt `transform: translateY(-2px)` khi hover **không có tác dụng** — thẻ
  còn mang `.game-card` với `animation: card-enter … both`, mà animation đã kết thúc với
  `fill-mode: both` vẫn **thắng** mọi khai báo `transform` thường (đo được `matrix(1,0,0,1,0,0)`
  dù chuột đã ở trên thẻ). Cách sửa: dùng thuộc tính biến đổi **độc lập** `translate`, nó cộng dồn
  với `transform` của animation thay vì tranh nhau — và không phải sửa animation nhập cảnh của 22
  thẻ (thứ mà các cổng khác đang đo).
- **Menu "•••"** của thẻ: xuất hiện bằng `eg-menu-pop` (mờ + nhô 4px + scale .98, 120ms), chọn bằng
  selector `[role="menu"]:not([hidden])` nên **không cần một dòng JS nào** và **không đổi `display`**
  (không có cú giật bố cục). **Thanh "đã chọn N"** trượt vào bằng `eg-selbar-in`.
- **Ô tìm kiếm + ô chọn thể loại:** viền đổi màu có nhịp khi focus/hover. **Biểu tượng sidebar** có
  nhịp riêng (vạch chỉ báo của mục đang mở đã có từ trước).
- **Cố ý KHÔNG đặt animation lên `.panel`:** bước 1 của wizard vẽ lại toàn trang sau mỗi lần gõ, nên
  mỗi lần gõ sẽ là một lần cả khối mờ đi rồi hiện lại — và vài cổng đo hình học sẽ đọc đúng lúc khối
  đang ở `translateY(6px)`.
- **Cổng mới `tests/ui/ui-motion-check.js` 19/19**, bấm bằng **chuột thật** (`Input.dispatchMouseEvent`)
  vì `:hover`/`:active` do trình duyệt quyết định theo con trỏ — `el.click()` chỉ chứng minh CSS viết
  đúng, không chứng minh người dùng thấy gì. Số đo: hover thẻ **194,67 → 192,67 px = Δ 2px**, bóng
  đổi, `scrollHeight` **1109 → 1109** và `scrollWidth` **1270 → 1270** (không xê dịch bố cục); nhấn
  nút ⇒ `matrix(…, 1)` = chìm 1px rồi trở lại, nhả chuột ra ngoài không kích hoạt nhầm; menu
  `animationName eg-menu-pop`, `opacity` kết thúc **1**; thanh chọn `eg-selbar-in`; giả lập
  `prefers-reduced-motion: reduce` (qua `Emulation.setEmulatedMedia`) ⇒ `--motion-fast 0ms`,
  `--motion-lift 0px`, hover **Δ 0px**, menu `animationName none`.
- **`verify:css` thêm 5 pin** cho bản compile (**66/66**, trước là 61): Tailwind rút `120ms` thành
  `.12s` và sẽ xoá một rule `translate` "không dùng" — pin bắt đúng hai khả năng đó.
- **Kết quả đo:** `tsc` sạch · unit **118/118** · `npm run check` sạch · `verify:css` **66/66** ·
  `check:renderer-globals` 0 undefined · `build:tauri` + `check:embedded` **6 217,2 KiB** ·
  `cargo tauri build` OK · `ui-library-stagger-check` **8/8** · `ui-page-head-check` **6/6** ·
  `ui-account-check` **23/23** · `ui-sidebar-toggle-check` **17/17** · `ui-page-trail-check` **38/38**
  (chạy trên bản dựng trước đó, cùng CSS) · ảnh `tests/ui/shots/motion-370-{rest,hover,menu}.png`.
- **Chưa đo:** cảm giác "mượt" thì không đo được bằng máy — 2px + bóng là ngưỡng tôi chọn cho khiêm
  tốn, người soát ảnh tĩnh **không nhận ra** thẻ nào đang hover (ảnh chụp không có con trỏ), nên
  việc "nhìn có thấy không" vẫn cần mắt người; chưa thử trên màn hình cảm ứng thật; chưa đo chi phí
  vẽ lại khi 22 thẻ cùng transition.
