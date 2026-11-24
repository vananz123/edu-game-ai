# Trạng thái dự án

Bàn giao mới nhất nằm ngay trong file này (3 mục gần nhất). Các bàn giao cũ được lưu ở
`docs/handoff/status/` — mỗi ngày một file, nối thêm vào cuối file của ngày đó khi cần.
Quy ước: sau mỗi việc, chèn bàn giao mới ngay dưới tiêu đề "Bàn giao gần nhất"; nếu quá 3 mục,
chuyển mục cũ nhất vào file lưu trữ đúng ngày của nó và cập nhật mục lục.

## Mục lục bàn giao

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

### 2026-11-24 — #323 Bảng xếp hạng đội hiện từ HẠNG CUỐI lên NHÀ VÔ ĐỊCH
- Mục **S3-3** (“màn kết quả hiện ra cùng lúc”) đúng **một nửa**: huy hiệu đã `result-medal-pop`, ba thẻ số đã so le `0 / .05 / .1 s` từ trước — **hai nửa đó đã có, không phải thiếu**. Thiếu đúng **hàng của bảng xếp hạng đội**: cả 3 hàng hiện cùng một nhịp, nên cả lớp thấy thứ hạng trước khi giáo viên kịp nói câu nào.
- **Sửa** `src/renderer/styles/components.css`: `@keyframes leaderboard-row-in` + `.leaderboard-row{animation:…both}`, delay theo **`:nth-last-child(2…6)`** ⇒ chạy **ngược từ hạng cuối lên nhất**, đúng cho 2–6 đội mà **không cần JS**; `both` giữ hàng **ẩn trong lúc chờ**; reduced-motion tắt hẳn.
- **Cổng mới `tests/ui/ui-result-cascade-check.js` (9/9)**, chạy 3 đội thật qua hộp chia đội: ghim luôn hai nửa ĐÃ CÓ (huy hiệu pop, ba thẻ số delay tăng dần) để tuyên bố của kế hoạch **mãi sai**; đo hàng mới: `leaderboard-row-in` trên cả 3 hàng, delay **`0.18 / 0.09 / 0`** (hàng đầu = hạng nhất ⇒ nhất đáp **sau cùng**), và **giữa lúc hiện hàng cuối sáng hơn hàng nhất** ở `t=114ms` — bằng chứng so le thật, không chỉ đọc delay đã khai.
- Trước khi sửa cổng **đỏ đúng 3 mục** (`none none none`, delay `0 0 0`, không mẫu nào lệch) — red-first, không phải cổng trang trí.
- Cổng trên binary mới: `ui-result-cascade-check` **9/9** · `ui-score-countup-check` **18/18** · `ui-answer-mode-check` **219/219** · `ui-memory-flip-check` **9/9** · `ui-matching-finish-check` **22/22** · `ui-play-surface-check` **812/812** · `ui-presentation-check` **93/93** · `ui-stage-illustration-check` **179/179** · unit **104/104** · `verify:css` **61/61**.
- Installer: **16 532 514 byte** / 24-11 **10:20** / SHA-256 `e0069f9fd565333cf8bda51e51fd15a0fee79ad49461875d084b1a12c80542ff`.
