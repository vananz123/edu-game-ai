# Trạng thái dự án

Bàn giao mới nhất nằm ngay trong file này (3 mục gần nhất). Các bàn giao cũ được lưu ở
`docs/handoff/status/` — mỗi ngày một file, nối thêm vào cuối file của ngày đó khi cần.
Quy ước: sau mỗi việc, chèn bàn giao mới ngay dưới tiêu đề "Bàn giao gần nhất"; nếu quá 3 mục,
chuyển mục cũ nhất vào file lưu trữ đúng ngày của nó và cập nhật mục lục.

## Mục lục bàn giao

### 2026-11-23 — #312 Cảnh tự chỉnh sống qua tệp: xuất → nhập → sửa → lưu
- Món treo lâu nhất của “Xưởng cảnh”: **`backdrop`, `extras[]`, `freePos{}` có đi theo giáo viên sang máy khác không** — tức là qua tệp `.egame`, chứ không chỉ qua SQLite trong máy này. Trước #312 chỉ đường lưu/mở lại trong máy được chứng minh.
- **Đo trên app thật, bằng hộp thoại Windows thật** (UIAutomation, không dùng biến môi trường của cổng): dựng một trò chơi quiz có cảnh `layout: surround`, `backdrop: sea`, `paletteKey: language`, `around: [star, sun, bug]`, **3 extras** (`rocket` −15°, `butterfly` 22°, `apple`) và **6 khoá `freePos`**; xuất qua hộp thoại **Lưu**, xoá trò chơi khỏi thư viện, rồi nhập lại qua nút **Nhập** của trang Thư viện (hộp thoại **Mở**).
- **Kết quả:** `backdrop` = `sea` ✓ · `layout` = `surround` ✓ · `paletteKey` = `language` ✓ · `around` 3 mục ✓ · **`extras` 3/3** với đúng `x/y/s/r` ✓ · **`freePos` 6/6** với đúng số ✓. Khác biệt duy nhất: bộ chuẩn hoá bỏ `r: 0` của extra thứ ba (góc 0 là mặc định) và sắp lại thứ tự khoá — nghĩa giống hệt.
- **Mở tiếp bằng giao diện:** thumbnail 148 px vẽ **6 lớp**; nút **“Chỉnh cảnh”** mở xưởng với **đủ 3 extras** và **7 tay nắm** (subject + 3 around + 3 extras); bấm **Xong** rồi **Lưu vào thư viện** ⇒ vẫn `extras 3`, `freePos 6`, `backdrop sea`, `layout surround`.
- **Chơi lại bản đã nhập** (chế độ `auto`, để blueprint thắng cảnh theo lĩnh vực): `data-scene-layer` = `sky/far/mid/subject/props/fg`, và **3 `[data-scene-extra]`** mang đúng phép biến đổi đã lưu (`rotate(-15)/scale(0.82)`, `rotate(22)/scale(1.3)`, `scale(0.55)`).
- **Hai điều dễ đọc sai, đã ghi vào DECISIONS:** (1) khoá `freePos` là **1-based** cho `around-1..4` nhưng **0-based** cho `extra-0..`, `sub-0..`, `prop-0..` — thử nghiệm đầu tiên của tôi dùng `around-0` và bộ chuẩn hoá **bỏ im lặng** khoá đó; đó là hành vi ĐÚNG, nhưng rất dễ bị đọc thành “mất dữ liệu”. (2) Trò chơi nhập từ gói lưu blueprint dưới dạng **object**, còn trình soạn thảo lưu dưới dạng **chuỗi**; cả hai đều được đọc đúng (đã đo cả ba đường: chơi, xưởng cảnh, lưu lại).
- **Cổng mới:** `tauri-webview-check` **55 → 56**, thêm `xuất → nhập giữ nguyên cảnh tự chỉnh (backdrop + extras + freePos)` — xuất một gói CÓ CẢNH vào đúng tệp của cổng, nhập lại, lưu, đọc lại từ thư viện, so **SỐ** (không so chuỗi, vì `r: 0` bị bỏ và khoá bị sắp lại): `backdrop=sea, extras=3, freePos=3, lưu lại: extras=3/freePos=3`. Cổng chạy bằng `npm run tauri:check` ⇒ **56/56** + pha mở lại **10/10**.
- Không đổi mã sản phẩm: chỉ thêm một phép đo vào cổng. Installer của #311 vẫn là bản dựng mới nhất (16 518 753 byte, 23-11 01:05, `09da7c66…`).

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
- **Quét tiếp 4 mẫu trò chơi** (cùng bản dựng 01:05, bánh xe thật, lăn 4 lần × 800 px rồi đo lại **sau** khi lăn): quiz · ghép cặp · đường đua · kho báu, mỗi mẫu ở **1024×640** và **1280×720**, cả **cửa sổ** và **toàn màn hình** = **16/16 không còn phần tử nào dưới đáy** (`belowFold = 0`). Ví dụ cửa sổ 1024×640: quiz `.modal` cuộn 290 px · ghép cặp 287 px · đường đua 15 px (đuôi trang) · **kho báu 725 px** (nội dung 1300 px trong hộp 576 px); toàn màn hình thì `.game-stage` là hộp cuộn (quiz 58 · ghép cặp 105 · kho báu 70 px). Không phát hiện lỗi mới — #311 là lỗi duy nhất.
- Cổng trên bản dựng lại 01:05 (mỗi cổng một phiên sạch): play-surface **812/812** · stage **179/179** · answer-mode **219/219** · fullscreen **20/20** · `npm run check` 53 tệp · embedded khớp **6201.0 KiB**.
- Installer: **16 518 753 byte** / 15.75 MiB / 23-11 **01:05** / SHA-256 `09da7c66f8169fb28cd3512afb6763e91c326789cfbb979c8cd41bce0c32bf94`.
  - Bản dựng lại **cùng mã nguồn** (23-11 18:29, sau khi dọn cache Rust): **16 524 006 byte** / SHA-256 `8fc8e0acab8e22a8d8411be1…`. Hash khác bản 01:05 vì gói NSIS nhúng dấu thời gian — không có thay đổi mã nào giữa hai bản.

### 2026-11-17 — #310 “Tôi không xuất được game, lỗi file not found”
- Giáo viên: **“tôi không xuất được game lỗi file not found”**. Nguyên nhân gốc: `src-tauri/src/package.rs` dựng hộp thoại xuất bằng `picker::choose` → **`pick_file`**, mà `pick_file` là hộp thoại **MỞ** — nó chỉ chọn được tệp **đang có**. Đặt tên mới cho gói `.egame` rồi bấm nút là Windows trả **“File not found”**, không ghi được byte nào. Hộp thoại **LƯU** là `save_file`.
- **Sửa:** thêm `picker::choose_save` (cùng cách chống treo luồng chính như `choose`, nhưng gọi `save_file`) và lượt xuất dùng nó. Thêm `picker::saved_path`: giáo viên gõ tên **không có đuôi** thì tệp được ghi thành `.egame`, nếu không lần nhập sau bộ lọc `*.egame` không nhìn thấy tệp vừa xuất.
- **Lỗi này không cổng nào thấy được:** `tauri-webview-check` truyền đường dẫn qua biến môi trường `EDUGAME_TAURI_PACKAGE_SAVE` và **bỏ qua hộp thoại hoàn toàn**, nên 55/55 vẫn xanh trong khi giáo viên không xuất được. Vì vậy có thêm **test Rust đọc mã nguồn** `the_export_dialog_is_a_save_dialog`: lượt `export` phải gọi `choose_save` và **không** được gọi hộp thoại mở; `picker.rs` phải gọi `save_file`.
- **Chứng minh trên hộp thoại THẬT (UIAutomation, không phải suy đoán):** cửa sổ `#32770` của app có `SaveDialogLabel` *“File name:”*, *“Save as type:”*, nút `Save` (control id 1) và ô tên **đã điền sẵn “Gói kiểm 310.egame”** — đúng là hộp thoại LƯU. Đặt tên tuyệt đối qua `WM_SETTEXT` vào `Edit` id 1001 rồi `BM_CLICK` vào nút Save ⇒ tệp **618 byte** trên đĩa, `packageFormat: "edugame"`, renderer nhận `{ok:true, path:"…\export-310.egame"}`.
- **Xuất rồi NHẬP lại đúng tệp đó:** hộp thoại mở (`Edit` id 1148) → `importGame` trả `{"title":"Gói kiểm 310","id":"imported_mws3ebeh6012519000_l4xr3p"}` — vòng tròn xuất→nhập chạy trên bản dựng cuối.
- **Câu báo lỗi bằng tiếng Việt:** trước đây toast in nguyên văn lỗi của vỏ máy (tiếng Anh). `controller.ts` có `exportErrorText` ánh xạ `EG_WRITE` → *“Không ghi được tệp — hãy chọn thư mục khác (ví dụ Desktop) rồi xuất lại.”*, `EG_PATH`/`EG_PACKAGE`/`EG_RUNTIME` → câu tương ứng; hai nhánh `export-first`/`export-game` bắt lỗi riêng thay vì để rơi vào câu chung.
- Cổng trên bản dựng lại 00:07: `npm run tauri:check` **55/55** + pha mở lại **10/10** (gồm cả xuất/nhập `.egame` qua đường cổng) · unit **102/102** · `npm run check` 53 tệp · `renderer-globals` **1125 hàm/9129 chỗ gọi, 0 undefined** · `cargo test --lib` **147/147** · embedded khớp **6201.0 KiB**.
- Installer: **16 516 810 byte** / 15.75 MiB / 23-11 **00:07** / SHA-256 `bd24487f46000a40ec6656f911ecde9a31c0ab0f7152b0bfd5e4777b59ffacfe`.
