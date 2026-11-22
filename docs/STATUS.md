# Trạng thái dự án

Bàn giao mới nhất nằm ngay trong file này (3 mục gần nhất). Các bàn giao cũ được lưu ở
`docs/handoff/status/` — mỗi ngày một file, nối thêm vào cuối file của ngày đó khi cần.
Quy ước: sau mỗi việc, chèn bàn giao mới ngay dưới tiêu đề "Bàn giao gần nhất"; nếu quá 3 mục,
chuyển mục cũ nhất vào file lưu trữ đúng ngày của nó và cập nhật mục lục.

## Mục lục bàn giao

### 2026-11-23 — #311 “Bấm Chơi ngay rồi không cuộn được”: sân khấu nuốt bánh xe
- Giáo viên: **“nút chơi ngay khi chơi không scroll được”**. Tái hiện trên app thật ở 1024×640 và 1366×768: `.modal` **có** cuộn được (`scrollHeight 866 / clientHeight 576`, `overflow:auto`) nhưng **bánh xe thật không nhích một pixel** (`modal.scrollTop = 0` sau khi lăn 400), và đáp án cuối nằm ở **868 px** trong khi cửa sổ cao **640 px** — tức là không tới được.
- **Nguyên nhân gốc:** `src/renderer/styles/game-animations.css` đặt `overscroll-behavior: contain` cho `.modal[data-player-theme] .game-stage`. Ở chế độ cửa sổ (“Chơi ngay”), sân khấu cao theo nội dung nên nó **không cuộn được** (`scrollHeight == clientHeight`, đo 723/723) — nhưng `contain` vẫn **chặn bánh xe chuyền lên hộp cuộn thật là `.modal`**. Một hộp không cuộn được mà vẫn giữ bánh xe là một cái khoá trên đường cuộn của cả trang. (Kiểm chứng rằng CDP gửi bánh xe được: cùng một phiên, lăn trên trang Thư viện ⇒ `window.scrollY` 0 → 300.)
- **Sửa:** bỏ `contain` ở mặc định (`overscroll-behavior-y: auto`), **chỉ** giữ `contain` trong `html[data-fullscreen="1"]` — nơi sân khấu mới thật sự là hộp cuộn (và `html,body{overflow:hidden}` nên không có gì để chuyền).
- **Đo lại sau khi sửa (bánh xe thật, cả hai chế độ):**

  | cỡ cửa sổ | Chơi ngay | Trình chiếu (toàn màn hình) |
  |---|---|---|
  | 1024×640 | `.modal` cuộn 290 px, đáp án cuối 825 → **535** | `.game-stage` cuộn 58 px, 651 → **593** |
  | 1280×720 | `.modal` cuộn 58 px, 664 → **606** | vừa khít, không cần cuộn (675 trong 720) |
  | 1366×768 | `.modal` cuộn 35 px, 686 → **651** | vừa khít, không cần cuộn (721 trong 768) |

- **Cổng `ui-play-surface-check`: 806 → 812** với mục `[scroll]` mở đúng chế độ **cửa sổ** (`playGame(game, {fullscreen:false})`, không dùng `OPEN` vì `OPEN` ép toàn màn hình): nội dung phải cao hơn cửa sổ · sân khấu **không** được khoá bánh xe khi nó không cuộn được · bánh xe phải làm `.modal` cuộn (`scrollTop 333`) · đáp án cuối phải tới được sau một lần lăn.
- Cổng trên bản dựng lại 01:05 (mỗi cổng một phiên sạch): play-surface **812/812** · stage **179/179** · answer-mode **219/219** · fullscreen **20/20** · `npm run check` 53 tệp · embedded khớp **6201.0 KiB**.
- Installer: **16 518 753 byte** / 15.75 MiB / 23-11 **01:05** / SHA-256 `09da7c66f8169fb28cd3512afb6763e91c326789cfbb979c8cd41bce0c32bf94`.

### 2026-11-17 — #310 “Tôi không xuất được game, lỗi file not found”
- Giáo viên: **“tôi không xuất được game lỗi file not found”**. Nguyên nhân gốc: `src-tauri/src/package.rs` dựng hộp thoại xuất bằng `picker::choose` → **`pick_file`**, mà `pick_file` là hộp thoại **MỞ** — nó chỉ chọn được tệp **đang có**. Đặt tên mới cho gói `.egame` rồi bấm nút là Windows trả **“File not found”**, không ghi được byte nào. Hộp thoại **LƯU** là `save_file`.
- **Sửa:** thêm `picker::choose_save` (cùng cách chống treo luồng chính như `choose`, nhưng gọi `save_file`) và lượt xuất dùng nó. Thêm `picker::saved_path`: giáo viên gõ tên **không có đuôi** thì tệp được ghi thành `.egame`, nếu không lần nhập sau bộ lọc `*.egame` không nhìn thấy tệp vừa xuất.
- **Lỗi này không cổng nào thấy được:** `tauri-webview-check` truyền đường dẫn qua biến môi trường `EDUGAME_TAURI_PACKAGE_SAVE` và **bỏ qua hộp thoại hoàn toàn**, nên 55/55 vẫn xanh trong khi giáo viên không xuất được. Vì vậy có thêm **test Rust đọc mã nguồn** `the_export_dialog_is_a_save_dialog`: lượt `export` phải gọi `choose_save` và **không** được gọi hộp thoại mở; `picker.rs` phải gọi `save_file`.
- **Chứng minh trên hộp thoại THẬT (UIAutomation, không phải suy đoán):** cửa sổ `#32770` của app có `SaveDialogLabel` *“File name:”*, *“Save as type:”*, nút `Save` (control id 1) và ô tên **đã điền sẵn “Gói kiểm 310.egame”** — đúng là hộp thoại LƯU. Đặt tên tuyệt đối qua `WM_SETTEXT` vào `Edit` id 1001 rồi `BM_CLICK` vào nút Save ⇒ tệp **618 byte** trên đĩa, `packageFormat: "edugame"`, renderer nhận `{ok:true, path:"…\export-310.egame"}`.
- **Xuất rồi NHẬP lại đúng tệp đó:** hộp thoại mở (`Edit` id 1148) → `importGame` trả `{"title":"Gói kiểm 310","id":"imported_mws3ebeh6012519000_l4xr3p"}` — vòng tròn xuất→nhập chạy trên bản dựng cuối.
- **Câu báo lỗi bằng tiếng Việt:** trước đây toast in nguyên văn lỗi của vỏ máy (tiếng Anh). `controller.ts` có `exportErrorText` ánh xạ `EG_WRITE` → *“Không ghi được tệp — hãy chọn thư mục khác (ví dụ Desktop) rồi xuất lại.”*, `EG_PATH`/`EG_PACKAGE`/`EG_RUNTIME` → câu tương ứng; hai nhánh `export-first`/`export-game` bắt lỗi riêng thay vì để rơi vào câu chung.
- Cổng trên bản dựng lại 00:07: `npm run tauri:check` **55/55** + pha mở lại **10/10** (gồm cả xuất/nhập `.egame` qua đường cổng) · unit **102/102** · `npm run check` 53 tệp · `renderer-globals` **1125 hàm/9129 chỗ gọi, 0 undefined** · `cargo test --lib` **147/147** · embedded khớp **6201.0 KiB**.
- Installer: **16 516 810 byte** / 15.75 MiB / 23-11 **00:07** / SHA-256 `bd24487f46000a40ec6656f911ecde9a31c0ab0f7152b0bfd5e4777b59ffacfe`.

### 2026-11-17 — #309 Trong game: nút phóng to ảnh minh hoạ nằm NGAY TRONG ảnh, hiện khi rê chuột
- Giáo viên: **“khi chơi game ở chế độ toàn màn hình, ở màn câu hỏi có ảnh minh họa thì hiển thị nút phóng to ảnh ngay bên trong ảnh khi rê chuột vào (hover)”**.
- **Nút là CON của khung ảnh, không phải một nút đặt cạnh ảnh.** `stageIllustrationHtml(item, game, extraClass, options)` nhận thêm tham số thứ tư: chỉ nơi chơi game truyền `{ zoom: true }`, nên khung ảnh có thêm class `is-zoomable` và một `<button class="stage-art-zoom" data-art-zoom="<assetId>">` ở góc phải–dưới (đo được: cách mép **8,8 px**). Editor và wizard **không** truyền cờ này — ở đó hàng nút ảnh đã đủ điều khiển, thêm nút phóng to lên thumbnail 148 px chỉ vướng tay.
- **Ẩn cho tới khi rê chuột, nhưng ẩn THẬT:** `opacity:0` **và** `pointer-events:none` — chỉ ẩn bằng opacity thì nút vẫn ăn cú click vào đúng chỗ đó. Đo bằng chuột thật (`Input.dispatchMouseEvent`): trước `opacity 0 / pointer-events none`, rê vào ảnh thì `opacity 1 / pointer-events auto`. Trên thiết bị cảm ứng (`@media (hover:none)`) nút **hiện sẵn** vì ở đó không có hover để chờ.
- **Bấm là mở đúng bức ảnh đang thấy, phóng to.** Lớp phóng to **sao chép chính node SVG** vừa bấm thay vì vẽ lại — vẽ lại có thể lệch palette/blueprint so với thứ trẻ đang nhìn. Đo: ảnh gốc 382×239 → khung lớn **1130×707**, **5/5 lớp cảnh** giống hệt, `role="dialog"`, lớp `position:fixed` gắn vào `document.body` (modal của game cắt `overflow` nên trong đó ảnh không thể lớn hơn khung).
- **Đóng bằng ba đường:** nút ×, bấm ra vùng tối, và **Escape**; đóng xong câu hỏi vẫn còn nguyên 4 đáp án và không còn lớp nào sót lại. Một listener uỷ nhiệm duy nhất trong `bootstrap.ts`, vì game vẽ lại toàn màn hình sau mỗi câu nên listener gắn vào nút sẽ mất ở câu sau.
- **Lỗi tự bắt được, phải đo mới thấy:** khung lớn đầu tiên dùng `aspect-ratio:16/10` **cộng** `max-height:92vh`, nên ở 1366×768 nó thành **1310×707 = 1.854** và ảnh 16:10 lọt thỏm giữa hai dải trắng (ảnh chụp: “white bands” ở hai bên). Sửa: bề rộng là **số nhỏ nhất của ba giới hạn**, quy `92vh` thành bề rộng (`calc(92vh * 1.6)`) ⇒ **1130×707 = 1.6**, hết dải trắng.
- **Cả bốn template chơi đều có nút:** quiz (`is-stage` + nhánh `is-house-art`), matching (`is-matching`), race (`is-race`), treasure (`is-stage is-treasure`). Đo tại chỗ: `{"art":true,"btn":true,"inside":true}` ở race và treasure (cả 6-chặng và 12-chặng, ở cả 1366×768 và 1920×1080); matching trả `{"art":true,"btn":true,"cover":"stage-illustration is-matching is-zoomable"}`.
- **`aria-hidden` phải nhường chỗ:** khung ảnh từng là `aria-hidden="true"` vì chỉ chứa hình trang trí; khi bên trong có một nút thật thì khung **bỏ** `aria-hidden`, còn `<svg>` giữ nguyên — hình vẫn được đọc là trang trí, nút vẫn tới được bằng bàn phím.
- Cổng `ui-play-surface-check`: **790 → 806** (mục `[zoom]` 10 check + race 2 + treasure 4). Các cổng khác trên app dựng lại: stage **179/179** · fullscreen **20/20** · answer-mode **219/219** · editor-art **pass** · item-art **pass** · unit **102/102** · `npm run check` 53 tệp · `renderer-globals` **1124 hàm/9119 chỗ gọi, 0 undefined** · embedded **6201.0 KiB**.
- **Rà màn hình lớn (2560×1440 và 1920×1080), đo trên app thật:** nút vẫn là con của ảnh, cách mép **8,8 px** (`inside:true`), vẫn ẩn (`opacity 0`) cho tới khi rê chuột rồi hiện `1`; bấm mở khung **1600×1000 = 1.6** ở 2560 (ảnh gốc 440×275) và **1590×994 = 1.6** ở 1920, **nằm gọn trong màn hình** (`fitsW/fitsH`), nút × trong tầm nhìn; đóng bằng **cú click chuột thật** vào × và bằng **Escape** đều sạch, không sót lớp nào. Ảnh: `.tmp-art/zoom-2560x1440.png`.
- **Một chỉnh nhỏ theo ảnh chụp:** ở 2560 nút × 40×40 bị mô tả là *“nhỏ so với màn hình”*, nên từ **1500 px** trở lên nút là **48×48** (đo: 2560 → 48×48, 1366 → 40×40, cả hai đều trong tầm nhìn).
- **Màn cảm ứng: CHƯA đo được.** `Emulation.setEmulatedMedia` của WebView2 **không** đổi được `(hover:none)`/`(pointer:coarse)` (`matchMedia('(hover:none)').matches` vẫn `false`), nên nhánh `@media (hover:none){ … opacity .92; pointer-events auto }` mới chỉ được đọc trong CSS, **chưa có phép đo tại chỗ** — ghi ở đây để lần sau không tưởng là đã kiểm.
- Ảnh: `.tmp-art/play-zoom-button.png` (nút trong ảnh), `play-zoom-hover.png`, `play-zoom-open.png`, `play-zoom-fullscreen.png` (lớp phóng to).
- Installer: **16 517 588 byte** / 15.75 MiB / 22-11 **22:21** / SHA-256 `371ab647114b7b8de47cf58bdcc17a5363d7c1da471bf460483978700f3d7796`.
