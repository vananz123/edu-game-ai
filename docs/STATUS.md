# Trạng thái dự án

Bàn giao mới nhất nằm ngay trong file này (3 mục gần nhất). Các bàn giao cũ được lưu ở
`docs/handoff/status/` — mỗi ngày một file, nối thêm vào cuối file của ngày đó khi cần.
Quy ước: sau mỗi việc, chèn bàn giao mới ngay dưới tiêu đề "Bàn giao gần nhất"; nếu quá 3 mục,
chuyển mục cũ nhất vào file lưu trữ đúng ngày của nó và cập nhật mục lục.

## Mục lục bàn giao

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

### 2026-11-26 — #369 đường dẫn trang cha → trang con ("Thư viện trò chơi › Chỉnh sửa trò chơi")

- **Yêu cầu (nguyên văn):** "ví dụ thư viện trò chơi mà từ trang này tôi chỉnh sửa thì nó sẽ hiển
  thị thư viện trò chơi > chỉnh sửa".
- **Một bảng duy nhất, không phải tám tệp page.** `src/renderer/features/page-trail.ts` (script toàn
  cục mới) giữ `PAGE_TRAIL_TITLES` (tên 8 trang) + `PAGE_TRAIL_PARENTS` (`editor → library`) và bốn
  hàm thuần: `pageTrailTitle`, `pageTrailParent`, `pageTrailRoot`, `pageTrailCrumbs`, `pageTrailHtml`.
  Hiện **chỉ `editor` là trang con thật** — nó không có mục riêng trên sidebar và luôn được mở TỪ
  một trang khác; sáu trang còn lại là mục cấp 1 nên **không có breadcrumb** (một dòng "Thư viện trò
  chơi › Thư viện trò chơi" trên mọi trang là chỗ trống bị lấy mất). Lần sau thêm trang con = thêm
  một dòng vào `PAGE_TRAIL_PARENTS`.
- **Trang cha là nơi ĐÃ MỞ trang con, không phải một giá trị mặc định.** `openEditor()` đọc
  `state.page` **ngay trước** `navigate('editor')` (sau đó nó đã là `'editor'` và không còn biết
  đường về) ⇒ mở từ thư viện thì "Thư viện trò chơi › …", mở từ dự án thì "Dự án của tôi › …".
  `navigate()` xoá `state.pageParent` khi sang một trang cấp 1, nên lần mở sau không hiện breadcrumb
  của lần trước. `closeEditorPage()` và nút quay lại đi về **trang cha đó**, không còn luôn về thư viện.
- **Chèn ở một chỗ:** `core/render.ts` gọi `pageTrailHtml(state.page, state.pageParent)` ngay sau
  `pageContainer.innerHTML = html` ⇒ không sửa tệp page nào để thêm markup. Mắt cha dùng lại đúng
  hook `data-page` mà `controller.ts` đã lo, nên **không thêm đường điều hướng mới**. Mắt cuối là
  `<span aria-current="page">`, không phải liên kết (một link tới chính mình là bẫy focus).
- **Sidebar sáng mục CHA khi đang ở trang con** (`pageTrailRoot`) — trước đây vào trình soạn thảo
  thì cả sidebar tối om, không mục nào sáng.
- **Vòng 2 (sau khi chủ dự án chê "phần chỗ breadcrumb quá rối"):** đường dẫn **dời vào trong
  header trình soạn thảo**, nằm sát trên `<h1>` và **chỉ còn mắt cha**: `← Thư viện trò chơi ›`
  rồi `<h1>` hoàn tất câu. Ba kết quả đo được: (a) **bỏ hẳn nút "← Quay lại" thứ hai** — chính mắt
  cha là nút rời trang (`data-editor-back`), nên chỉ còn **một** nút rời trang; (b) số dòng xếp
  chồng trước nội dung **3 → 2** (header + thanh Lưu); (c) "Thư viện trò chơi" từ **3 lần** xuống
  **1 lần** trong 70 px đầu trang, "Chỉnh sửa trò chơi" từ **2 lần** xuống **1**.
- **Vòng 3 (chủ dự án: "breadcrumb vẫn chưa được, cần xem lại"):** nguyên nhân đo được — bản 2 kết
  thúc bằng dấu `›` **trỏ vào khoảng không** (`← Thư viện trò chơi ›` rồi hết), đọc như một liên kết
  quay lại bị cụt chứ không phải một đường dẫn. Cách sửa không phải thêm lại một mắt cuối 12px rồi
  để `<h1>` lặp cùng chữ ngay dưới (lỗi #364): **mắt cuối CHÍNH LÀ `<h1>`** — cùng một phần tử, chữ
  nhỏ của cha đứng trước, tiêu đề 18px/800 đứng sau, tất cả trên **một dòng** (cao 22 px). Kết quả
  trên app thật: `← Thư viện trò chơi › Chỉnh sửa trò chơi`, **một** `<h1>` trong trang, không dấu
  cụt, không lặp chữ, không tràn ngang ở 1366 lẫn 1024 (`hScroll: 0`).
- **Mắt cha trong header KHÔNG mang `data-page`** (mà `data-page-trail-parent` + `data-editor-back`):
  `[data-page]` là điều hướng thẳng của controller và sẽ bỏ qua câu hỏi "Rời trình chỉnh sửa? Thay
  đổi chưa lưu sẽ mất." mà `wireEditorPage` gắn cho `[data-editor-back]`. Một đường tắt về thư viện
  làm mất bài của giáo viên là đúng thứ phải tránh.
- **Đo:** `tests/unit/page-trail.test.ts` (6 nhóm, chạy trên `dist/.../page-trail.js`): 7 trang cấp 1
  không có breadcrumb + tự sáng mục của mình; `editor` mang cha thật; cha rác (`'editor'`, trang
  không tồn tại) lùi về mặc định; markup có `data-page` và `aria-current`, **không** có `data-page="editor"`;
  `childTitle` cho trình soạn thảo mới.
- **Trang cha không hard-code (đo được):** mở trình soạn thảo từ trang "Tạo trò chơi" ⇒ đường dẫn
  đổi thành `← Tạo trò chơi › Duyệt và hoàn thiện trò chơi`, và nút rời trang quay về đúng
  "Tạo trò chơi" — không phải thư viện.
- **Đo trên app thật:** `tests/ui/ui-page-trail-check.js` **38/38** — bấm thật vào sidebar 7 lần
  (không breadcrumb ở trang cấp 1, đúng 1 mục `.active`), bấm thật menu "•••" → "Chỉnh sửa" ⇒
  đường dẫn đọc `← Thư viện trò chơi ›` **không chứa** chuỗi "Chỉnh sửa trò chơi", nằm **trong**
  header (y 30, `<h1>` ở y 46), **cỡ chữ 12px / line-height 14,4px**, **2 dòng** trước nội dung,
  **một** nút rời trang và nó là mắt cha (`data-page-trail-parent="library"`, `data-page` rỗng,
  `title="Về Thư viện trò chơi"`), sidebar vẫn `["library"]`; bấm mắt cha ⇒ về thư viện và đường
  dẫn biến mất; làm lại rồi bấm `[data-editor-back]` cũng về đúng cha.
- **Đo tương phản (lỗi có sẵn bị phép đo này lộ ra):** ở dark mode tiêu đề trình soạn thảo đang là
  `#1e293b` cứng trên nền `rgb(15,18,32)` ⇒ **1,27:1**, gần như vô hình. Đã đổi sang
  `color: var(--text, #1e293b)` trong `components.css` ⇒ **15,05:1** (sáng) / **15,5:1** (tối). Chữ
  phụ của đường dẫn: mắt cha **4,76 / 6,08**, dấu `›` **5,05 / 7,76** — đạt AA 4,5 cho chữ 12px.
  Gate có 2 phép đo mới, ngưỡng đặt **theo cỡ chữ** (tiêu đề ≥ 7, chữ phụ ≥ 4,5): đòi 7 cho chữ phụ
  sẽ phải kéo nó về gần đen, tức là quay lại đúng cái rối vừa bỏ.
- **Kết quả đo:** `tsc` sạch · unit **118/118** · `npm run check` sạch · `verify:css` **61/61** ·
  `check:renderer-globals` **80/82 scripts, 1199 functions, 9679 call sites, 0 undefined** ·
  `build:tauri` + `check:embedded` **6 217,2 KiB** · `cargo tauri build` OK · `ui-page-head-check`
  **6/6** và `ui-sidebar-toggle-check` **17/17** vẫn xanh trên bản dựng mới; `ui-page-trail-check`
  cuối cùng **38/38** và `ui-account-check` **23/23**. (Một lần chạy `ui-account-check` báo 2 lỗi
  ngay sau khi gate đường dẫn vừa đóng trình soạn thảo; hai lần chạy lại sạch 23/23 và không tái
  hiện được — ghi là **chưa giải thích được**, không phải đã sửa.)
- **Ảnh:** `tests/ui/shots/page-trail-369-editor.png`, `trail-flowA.png` / `trail-dark.png` (cắt dải
  đầu trang, phóng 2×), `trail-1024.png`, `page-trail-369-top.png` + `-dark.png` ở 1366×768. Đường dẫn căn đúng cột nội dung (x 256), cao
  **14 px** sau khi bỏ mắt cuối, không tràn ngang (`hScroll: 0`), và ở **1024 px** vẫn **1 dòng**
  (không xuống hàng, không tràn).
- **Chưa đo:** đường `Dự án của tôi → trình soạn thảo` chỉ được chứng minh bằng unit test trên hàm
  thuần, **chưa bấm được trong UI** (trang dự án mở wizard chứ không mở thẳng trình soạn thảo);
  breadcrumb chưa thử với tiêu đề trang rất dài; chưa ai bấm thử bằng tay.
