# Trạng thái dự án

Bàn giao mới nhất nằm ngay trong file này (3 mục gần nhất). Các bàn giao cũ được lưu ở
`docs/handoff/status/` — mỗi ngày một file, nối thêm vào cuối file của ngày đó khi cần.
Quy ước: sau mỗi việc, chèn bàn giao mới ngay dưới tiêu đề "Bàn giao gần nhất"; nếu quá 3 mục,
chuyển mục cũ nhất vào file lưu trữ đúng ngày của nó và cập nhật mục lục.

## Mục lục bàn giao

### 2026-11-17 — #303 Thiết kế lại giao diện “Chỉnh sửa trò chơi” và “Xưởng cảnh”
- Giáo viên: **“thiết kế lại giao diện phần chỉnh sửa trò chơi và chỉnh ảnh”**. Đo trước khi sửa (1366×768, ảnh `.tmp-art/editor-before.png`, `workshop-before.png`): trang sửa trò chơi dành **cả màn hình đầu** cho 7 ô cài đặt + gợi ý, **không thấy câu hỏi nào**; dải lưu là một dòng cam riêng; xưởng cảnh có **3 nhóm cuộn chồng nhau** ở cột trái, cột phải **7 thẻ rời**, thanh zoom **lơ lửng** giữa khoảng trống, nút “Xong” không nói là lưu.
- **Trang sửa trò chơi:** “Thông tin trò chơi” thành **một thẻ GẤP** (`<details>` mở bằng một cú bấm, các ô vẫn nằm trong DOM nên giá trị đọc/ghi không đổi); lưới 2 cột cho Tên/Thể loại/Môn/Lớp; đầu mục **“Câu hỏi / tình huống” dính** dưới dải lưu; mỗi câu là **thẻ có đầu thẻ** (số câu + kiểu + thao tác) và **ảnh ở cột trái, nút ở cột phải**; dải lưu gộp một hàng, gợi ý chuyển sang chữ mờ chỉ đậm khi có thay đổi. Kết quả: **câu 1 và ảnh của nó nằm trong màn hình đầu**.
- **Xưởng cảnh:** đầu trang rõ (“Xưởng cảnh” + một câu hướng dẫn + **“Xong — lưu cảnh”**); cột trái **3 nhóm có số lượng** (Bố cục 4 · Nơi diễn ra 12 · Hình mẫu 47), mỗi nhóm **tự cuộn trong chiều cao riêng** nên cả ba cùng thấy; khung vẽ đặt trên **“bàn làm việc” chấm nhẹ** với bóng đổ, ảnh là tờ giấy; thanh zoom thành **viên thuốc** ngay dưới khung; cột phải gộp thành **“Đang chọn”** + **“Thao tác”**, nút xoá có màu **đỏ**.
- **Đo lại bằng số, không bằng mắt:** `measureBase()` nay trừ **đúng phần padding của tấm nền** (đọc `getComputedStyle`) thay vì trừ 12px đoán — trước đó khung rộng hơn 2px nên **sinh thanh cuộn ngang ở 100%**, đúng thứ việc “vừa khung” phải xoá. Cổng đo **cùng đại lượng** (padding đọc từ CSS) chứ không dùng lại hằng số cũ.
- **Nền tối:** thêm khối `html[data-theme="dark"]` cho mọi bề mặt mới, dùng thang `--surface-*`. Đo bằng `getComputedStyle` (không tin mắt): `.sd-head` rgba(21,26,43,.92) · `.sd-group` `#171b2e` · tấm nền `#131829` · thẻ câu `#171b2e`.
- Cổng trên **app mới dựng lại** (CDP 9634): designer **81/81** · editor-art **pass** · item-assets **157/157** · stage **179/179** · play **790/790** · background **42/42** · answer-mode **219/219** · unit **102/102** · `npm run check` 53 tệp · `renderer-globals` **1120 hàm/9071 chỗ gọi** · scene-runtime **170.8 KiB** · embedded **6201.0 KiB**.
- Ảnh: `.tmp-art/editor-before.png` (thẻ cài đặt gấp + câu 1 có ảnh), `.tmp-art/workshop-after.png` (3 nhóm cùng thấy, khung vừa khít, zoom là viên thuốc), `.tmp-art/workshop-dark.png`.
- Installer: **16 514 382 byte** / 15.75 MiB / 22-11 **11:16** / SHA-256 `a0337c7142af6bef97986ef7ea86c8b360afec99f540a286219bed90c6a2181c`.

### 2026-11-17 — #302 “Không lưu được ảnh khi chỉnh sửa xong”: ô ẩn của câu khác bị đọc
- Giáo viên báo **“không lưu được ảnh khi chỉnh sửa xong”** sau #301. Đo tiếp thì thấy #301 chỉ đúng cho game **một câu**.
- **Nguyên nhân thật:** mọi hàm trong `questions.ts` lấy ô ẩn bằng `row.parentElement.querySelector('[data-field="sceneBlueprint"]')`. `parentElement` là **khung chứa TẤT CẢ các câu**, nên `querySelector` trả về ô của **câu 1**. Với game 3–5 câu, bấm “Chỉnh cảnh” ở câu 3 sẽ **mở ảnh của câu 1**, và khi ô nằm ngoài hàng (#300) thì chữ ghi cũng rơi vào ô của câu 1 ⇒ ảnh vừa sửa **không được lưu ở chỗ đang sửa**. Đúng câu chữ của giáo viên.
- **Sửa:** một hàm duy nhất **`editorArtField(row, selector)`** — tìm **trong chính hàng trước**, chỉ lùi về khung chứa khi ô là **anh em của hàng** (#300). Thay **12 chỗ**: `editorItemArtValue`, `applyEditorItemArt`, `applyEditorBlueprint`, `applyEditorSuggestedBlueprint`, `applyEditorSceneSlots`, `wireSceneHandles`, `readEditorItemAssets`, nút mở xưởng, nút “Gợi ý AI” (prompt + danh sách đáp án + category/icon — trước đây gửi **prompt của câu 1 và đáp án của mọi câu** cho model).
- **Tự bắt được 1 lỗi của chính bản vá:** xoá `const scope` trong `applyEditorSceneSlots` mà còn 1 chỗ dùng ⇒ `Uncaught ReferenceError: scope is not defined` (thấy khi dò DOM, không phải khi đọc code). Đã sửa và kiểm lại.
- Gate `ui-scene-designer-check` **76 → 81/81**: mục 12 mới — hai câu giữ **ô riêng** · câu 2 mở **cảnh của câu 2** (so `paletteKey`) · sửa câu 2 **không đụng** câu 1 (so chuỗi trước/sau) · câu 2 lưu được `backdrop:"market"` · **ảnh câu 1 không thành chợ**.
- Chứng minh bằng DOM thật: hai câu ⇒ `backdrops: ["forest","market"]` (trước bản vá cả hai đọc chung ô của câu 1).
- Kiểm trên app mới mở (CDP 9621–9623): designer **81/81** · item-assets **157/157** · stage **179/179** · play **790/790** · background **42/42** · AI paging **12/12** · unit **102/102** · `npm run check` 53 tệp · `renderer-globals` **1120 hàm/9064 chỗ gọi** · scene-runtime **170.8 KiB** · embedded **6201.0 KiB**.
- Installer: **16 502 693 byte** / 15.74 MiB / 22-11 **08:17** / SHA-256 `c54d2304183028abacf59644647a9b986bd04819a5a412cf89084d88602aaf88`.

### 2026-11-17 — #305 “Cài đặt AI” chỉ là màn hình lần đầu, cài xong thì ẩn
- Giáo viên: **“CÀI ĐẶT AI chỉ hiện thị lúc đầu cài đặt ứng dụng”**. Tab **Nhà cung cấp AI** chiếm tab đầu tiên trong Cài đặt ở **mọi** lần mở, kể cả khi AI đã chạy được — một tab không còn việc gì để làm, đứng trước cả “Phong cách” và “Giao diện”.
- **Luật mới (một hàm thuần của một boolean):** `settingsTabsFor(aiConfigured)` — AI đã cấu hình xong thì danh sách tab **không còn `ai`**; chưa xong thì `ai` vẫn **đứng đầu**. “Đã xong” = **AI local có model + runtime đã cài**, hoặc **một nhà cung cấp cloud đã kiểm tra kết nối thành công** (`status === 'ready'`, #132 §D7) — không phải “có khoá”, nên một khoá sai tự làm tab hiện lại.
- **Ẩn không có nghĩa là xoá** (#159): panel AI, 4 thẻ `[data-ai-provider]` và nút `#openSetupWizardBtn` **vẫn nằm trong DOM** để `readAiProviderPatches` đọc được khi lưu và để “Cài đặt lại AI từ đầu” vẫn tồn tại.
- **Đường quay lại:** khi tab bị ẩn, đầu trang Cài đặt có một dòng mảnh *“AI đã cấu hình xong nên phần cài đặt AI được ẩn. **Mở lại**”*; bấm thì tab trở lại và mở sẵn, **chỉ trong phiên đó** (`state.settingsAiReveal`) — lần sau mở app lại im lặng như mặc định.
- **Tab đang mở được kẹp lại:** nếu `state.settingsSection` đang là `ai` mà tab bị ẩn, trang rơi về tab đầu tiên còn hiện (“Phong cách”), nên không bao giờ có màn hình trống.
- **Chứng minh bằng DOM, không bằng mắt** (`.tmp-probe-305.js`): trước `['ai','teaching','interface','tasks','diagnostics','about']` → giả lập máy đã cài xong (đúng hai biến trang đọc: `model.installed` + `machine.runtimeInstalled`) → `['teaching','interface','tasks','diagnostics','about']`, dòng ghi chú hiện, trang mở “Phong cách” → bấm “Mở lại” → `ai` trở lại và đang mở, vẫn đủ **4** thẻ nhà cung cấp.
- **Cổng kiểm mới** (`tests/ui/ui-settings-sections-check.js`, +3 check): luật thuần được ghim **cả hai kết cục** trên một máy chưa cấu hình; panel/thẻ/nút cài lại vẫn trong DOM; và **ẩn thì luôn còn đường vào**. Cổng cũ giữ nguyên bằng cách tự bấm “Mở lại” nếu tab vắng mặt trước khi đo.
- Cổng trên **app mới dựng lại** (CDP 9651–9653, mỗi cổng một phiên sạch): settings-sections **pass** · ai-provider-wizard **pass** · designer **81/81** · editor-art **pass** · item-assets **157/157** · stage **179/179** · play **790/790** · background **42/42** · answer-mode **219/219** · unit **102/102** · `npm run check` 53 tệp · `renderer-globals` **1121 hàm/9079 chỗ gọi, 0 undefined** · embedded **6201.0 KiB** · scene-runtime **170.8 KiB**.
- Installer: **16 515 391 byte** / 15.75 MiB / 22-11 **15:40** / SHA-256 `cf9e111223d47d4978429fde0b6b2d9841f082f268e5e6cfcce892099153bb6e`.

