# Trạng thái dự án

Bàn giao mới nhất nằm ngay trong file này (3 mục gần nhất). Các bàn giao cũ được lưu ở
`docs/handoff/status/` — mỗi ngày một file, nối thêm vào cuối file của ngày đó khi cần.
Quy ước: sau mỗi việc, chèn bàn giao mới ngay dưới tiêu đề "Bàn giao gần nhất"; nếu quá 3 mục,
chuyển mục cũ nhất vào file lưu trữ đúng ngày của nó và cập nhật mục lục.

## Mục lục bàn giao

### 2026-11-24 — #326 Tiêu đề trang 17 → 20px, và dải đầu trang KHÔNG được nhích
- Mục **S4-1**: `.page-head h1` từ **17px** lên **20px** (`letter-spacing` −.2 → −.25px). Đây là thay đổi **thuần chữ**, nên câu hỏi thật không phải “có đẹp hơn không” mà **có xê dịch trang không**.
- **Đo TRƯỚC và SAU ở 1280×800 / 1366×768 / 1920×1080** trên cả **Thư viện** và **Dự án của tôi**: dải đầu trang **28px trước, 28px sau** — vì chiều cao dải do **cột nút bên phải** quyết định, không do tiêu đề; bề rộng nội dung **1038 / 1124 / 1280 không đổi**. Tiêu đề `20px`, cao `25px`, **1 dòng**, không chồng lên nút.
- **Cổng mới `tests/ui/ui-page-head-check.js` (6/6)**: ghim `20px`, dải `28px`, **không chồng** nút, **1 dòng**, và **hai loại trang dùng cùng hình học dải** (#314: một trang không được tự chọn bề rộng/chiều cao của riêng nó).
- Cổng trên binary mới: `ui-page-head-check` **6/6** · `ui-question-template-check` (ba nút vẫn một hàng) pass · `ui-editor-art-check` pass · `ui-item-assets-editor-check` **157/157** · `ui-library-stagger-check` **8/8** · `ui-play-surface-check` **812/812** · `ui-stage-illustration-check` **179/179** · `ui-answer-mode-check` **219/219** · `ui-presentation-check` **93/93** · `ui-result-cascade-check` **9/9** · `ui-library-paging-check` / `ui-project-selection-check` pass · unit **104/104** · `verify:css` **61/61**.
- Installer: **16 538 871 byte** / 24-11 **11:52** / SHA-256 `d39200114ed4b9f743332d439ff913b71ff5c08f79a7db90bed61a4db70c8a8f`.

### 2026-11-24 — #325 Thẻ thư viện so le khi tải (và một cổng suýt đo nhầm DOM cũ)
- Mục **S2-1** của kế hoạch — lần này **đúng**: `.lib-grid` không có animation vào nào, 9 thẻ hiện trong cùng một khung hình thành một “bức tường”.
- **Sửa** `src/renderer/styles/components.css`: `@keyframes lib-card-in` + `.lib-grid > .lib-item{animation:…both}`, delay `:nth-child(2…9)` = `0.03…0.24 s` ⇒ **thuần CSS**, không `--i` nội tuyến nên **không có gì phải đồng bộ với phân trang**; trần đúng **một trang** (`LIBRARY_PAGE_SIZE = 9`) nên thẻ cuối không chờ quá **0.24 s**; `both` giữ thẻ **ẩn trong lúc chờ**; reduced-motion tắt hẳn. Chỉ `opacity` + `6px` — các cổng đo hình học đo chính những thẻ này.
- **Cổng mới `tests/ui/ui-library-stagger-check.js` (8/8)**: delay đo được `0 0.03 … 0.24`, giữa lúc hiện thẻ 1 sáng hơn thẻ 5 ở **t = 33 ms**, kết thúc `opacity 1` + `transform none`.
- **Một cái bẫy cổng tự mắc rồi tự sửa:** bản đầu gọi `renderLibrary()` để “vẽ lại” — nhưng hàm đó **chỉ TRẢ VỀ html, không vẽ gì**, nên cổng đọc **DOM của lần tải trang** mà animation đã kết thúc từ lâu: `animationName` đúng, delay đúng, mà `opacity` luôn `1` và mục so le **đỏ trên bản đã sửa đúng**. Sửa: điều hướng **như giáo viên** — bấm `.nav-item[data-page="my-projects"]` rồi quay lại `library`. Bài học: **một cổng phải tạo ra chính cái trạng thái nó đo**, không gọi hàm render rồi tin là DOM mới.
- Cổng trên binary mới: `ui-library-stagger-check` **8/8** · `ui-library-paging-check` / `ui-project-selection-check` **pass ×2** (chạy hai lần để chắc không flake — rule có `translateY`) · `ui-play-surface-check` **812/812** · `ui-item-assets-editor-check` **157/157** · `ui-editor-art-check` pass · `ui-result-cascade-check` **9/9** · `verify:css` **61/61**.
- Installer: **16 529 171 byte** / 24-11 **10:55** / SHA-256 `782a65c26ee0947aaf594d355da6359f74e33749b5303a9a4a8e4c80786bd41e`.

### 2026-11-24 — #324 P7 nửa ĐO ĐƯỢC: chơi offline không gọi mây (và bộ cài KHÔNG có chữ ký)
- AGENTS.md hứa “game đã lưu phải chơi được offline” nhưng **chưa từng có phép đo nào**. Cổng mới `tests/ui/ui-offline-play-check.js` (**7/7**) bật `Network.requestWillBeSent` của chính WebView rồi **tải lại toàn trang** và **chơi trọn một ván đã lưu**.
- **Đo được:** khởi động = **81 yêu cầu, 0 ra ngoài máy**; chơi trọn 2 câu → màn kết quả (120 → 240 điểm) = **0 yêu cầu mạng**, **0 host đám mây**. Trò chơi đã lưu **không phụ thuộc internet** — đúng như lời hứa, giờ có bằng chứng.
- **Canary chống cổng điếc:** cổng gọi `https://offline-canary.invalid/probe` (RFC 2606, không bao giờ phân giải) và **phải** thấy nó — nếu không thì mọi “không có yêu cầu nào” ở trên vô nghĩa. Bài học #322: một cổng không thể đỏ là một cổng không chứng minh gì.
- **Nửa KHÔNG đo được (và không thể đo ở đây):** bộ cài và app trên máy Windows sạch. Đo được một phần bằng sự thật khô khan: `Get-AuthenticodeSignature` trên **cả** `…-setup.exe` và `edugame-studio-tauri.exe` trả **`NotSigned`** ⇒ trên máy lạ, SmartScreen sẽ hiện “Windows protected your PC / Unknown publisher” cho tới khi tệp có danh tiếng. Sửa được chỉ bằng **chứng chỉ ký mã trả tiền** (quyết định của bạn, không phải việc mã nguồn).
- Metadata bộ cài đã có `publisher: EduGame Studio`, Company/Product đúng; `FileDescription` vẫn là `EduGame Studio (Tauri)` — chữ “(Tauri)” là tên nội bộ, hiện trong Task Manager và Add/Remove Programs.
- Cổng: `ui-offline-play-check` **7/7** (chạy 2 lần) · `npm run check` pass (**57 tệp** trong `tests/ui`).
