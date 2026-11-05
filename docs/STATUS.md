# Trạng thái dự án

Bàn giao mới nhất nằm ngay trong file này (3 mục gần nhất). Các bàn giao cũ được lưu ở
`docs/handoff/status/` — mỗi ngày một file, nối thêm vào cuối file của ngày đó khi cần.
Quy ước: sau mỗi việc, chèn bàn giao mới ngay dưới tiêu đề "Bàn giao gần nhất"; nếu quá 3 mục,
chuyển mục cũ nhất vào file lưu trữ đúng ngày của nó và cập nhật mục lục.

> **Tạm lệch quy ước trên nhánh `release/0.4.1` (2026-11-05, #202):** file đang có **bốn** bàn giao
> (block cũ nhất là #185, ngày 2026-11-04) và chưa dời sang `docs/handoff/status/2026-11-04.md`, vì
> chính file lưu trữ đó **đang bị luồng #189–#195 sửa dở** trong cây làm việc chính — đụng vào lúc
> này chỉ tạo thêm xung đột cho bước merge. Việc dời do người merge `release/0.4.1` → `main` thực hiện.

## Mục lục bàn giao

### 2026-11-05
- **0.4.1 lên GitHub Releases** (release `434743442`, `EduGame-Studio-Setup-0.4.1.exe` **92.496.890 B**, `latest.yml` **356 B**, tag đã dời để trỏ đúng commit dựng binary): bản phát hành **không phải** `main` HEAD mà là **snapshot của luồng #189–#195** trên nhánh `release/0.4.1`, vì chủ dự án chọn "Bao gồm luồng #189–#195"; ba regression bị chính cổng CDP trên binary bắt được rồi sửa — hòn đảo sáng `.modal` bị #191 sơn nền tối (**1,05:1** ở tiêu đề hộp Help, **3,12:1** ở `.info-box` wizard → **15,18:1** và **5,10:1** sau khi re-pin `--surface-0..3`), chip 10 px vi phạm sàn #181, và `sliders-horizontal` không có trong registry nên **không có glyph** (128 → **129** icon); hai chỗ vận hành phải học bằng đau: asset POST sang **`uploads.github.com`** chứ không phải `api.github.com` (**404**), và `latest.yml` nạp **cuối** để feed không có khoảng trống trỏ vào `.exe` chưa tồn tại — gates trên binary: unit **87/87**, `verify:css` **56/56**, typography **8/8**, chrome-icons **17/17**, dark-theme **23/23**, presentation **60/60**, offline-packaged **11/11**. **`main` vẫn chưa có code của bản đã phát hành** (#202)

### 2026-11-04
- **Trang Giới thiệu** ra đời — và nó là **cửa sổ thứ hai** (`contextIsolation` + `sandbox` + preload riêng), không phải một trang của SPA: máy trạng thái cập nhật viết **thuần** (`update-policy.ts`, 0 Electron/0 DOM/0 mạng) nên "lúc nào được phép bấm gì" test được không cần bộ cài thật; `electron-updater` đọc GitHub Releases với `autoDownload = false` và `autoInstallOnAppQuit = false`, vì một lớp học không được đổi phần mềm sau một đêm; kiểm tra **chỉ khi mở trang**, không khi khởi động — cổng `check:offline-packaged` **11/11 với 0 request** trên bản gói vừa dựng lại chứng minh điều đó; spec đòi `checkForUpdatesAndNotify()` — **không dùng**: nó tự tải và tự báo, trái luật "không tải hộ"; cổng mới `check:about-ui` **69 check** đi hết vòng đời trên Electron thật (dev-mode → offline → 404 feed → có bản mới → tải thật có % tăng dần → bộ cài nằm trên đĩa đúng số byte → lỗi muộn không đoạt lại bộ cài) — **app đã là 0.4.0 từ #185, không phải 0.3.0 như spec**, và repo chưa có release nào nên bản gói hiện báo "chưa tìm thấy bản phát hành" là **đúng** (#188)
- **Xoá một cuộc trò chuyện làm mất luôn khả năng gõ**: nút bị xoá nằm trong popover nên sau khi redraw, focus về `<body>` và popover vẫn treo — giáo viên thấy "khung chat không nhận phím". Nay cả **ba nhánh** của lượt xoá (xoá xong · giáo viên huỷ · lỗi) đều đóng popover và trả con trỏ vào ô gõ; thêm nữa **ô gõ không còn bị khoá** khi một lượt đang chạy (`disabled` + nền xám bị xoá khỏi CSS), vì trên máy CPU một câu trả lời mất vài phút và một ô không nhận gõ mà không nói lý do đúng là cảm giác đó; và một danh sách đọc lỗi **không còn im lặng thành "chưa có cuộc trò chuyện nào"** (#187)
- Khung chat hỏi giáo án trước đó chỉ gửi **4,4–9,6 %** bài học (đo: 95–206 / 2.145 ký tự) và không nói điều đó. Nay **AI đám mây và AI local chạy GPU nhận toàn bộ giáo án**, local **CPU** vẫn truy hồi nhưng **3 → 12 đoạn** và trần **3.200 → 12.000** ký tự (số của `document-assist`, không phải phỏng đoán); `gpuLayers` **thật** quyết định nhánh vì llama.cpp có thể khởi động CPU sau một lần Vulkan hỏng; mỗi lượt in **"AI đã đọc 817 / 817 ký tự (100 %) · toàn bộ giáo án, không cắt bớt"** và số liệu đó **sống qua restart** nhờ một cột `evidence_meta` + migration cộng dồn — lượt cũ không có thì **im lặng**, không bịa 100 %; store **nặn** số bẩn (`5.000/100` → `5.000/5.000`) để không in % sai; gate **87 → 95 check**, `verify:css` 44 → **46/46**, unit **76/76**, `test:native` 1/1 — **nhánh local chưa chạy llama.cpp, đúng chỉ đạo "tôi sẽ tự kiểm tra sau"** (#186)
- Logo mới (mũ tốt nghiệp trên trang sách) nối vào **exe · bộ cài · shortcut · cửa sổ · taskbar**, và sự thật kiểm kê mới thấy: app **chưa từng có icon nào**, nên mọi bề mặt đang vẽ logo Electron mà không check nào đỏ; version **0.4.0** ở bốn chỗ; `Setup-0.4.0.exe` **92.241.504 B** với **icon trích được từ chính nhị phân**, `check:offline-packaged` **11/11** trên bản gói, unit 75 → **76/76** nhờ gate mới `brand-assets` (#185)
- Bỏ dòng chữ thừa ở đầu khung chat, **khung chat 601 px / danh sách 335 px**, "Chọn giáo án" + "Tải giáo án mới" dời **vào trong khung gõ** (picker co transcript chứ không co frame: composer 245→388, scroll 401→258, frame vẫn 704), danh sách giáo án gói còn **một dòng + Xem chi tiết** — và "làm gọn" hoá ra là một **bug bố cục** khiến thẻ cao 338 px vì mỗi chữ một dòng; gate 72 → **87 check**, `verify:css` 39 → **44/44** (#184) — **đã lưu ở [docs/handoff/status/2026-11-04.md](handoff/status/2026-11-04.md)**
- Khung chat Giáo án **to lên theo số đo** (`clamp(520px, 46%, 640px)` — đo thật chat 520 / danh sách 415 px, không tràn) và **hỏi được mà không cần chọn hay tải giáo án**: một lượt không tài liệu là hợp lệ ở cả bốn tầng (renderer · main · store · service), có system prompt riêng để model **không bịa** về một bài nó chưa thấy; cổng `check:lesson-chat-ui` 59 → **72 check**, unit tầng chat lần đầu có test thuần (#183) — **đã lưu ở [docs/handoff/status/2026-11-04.md](handoff/status/2026-11-04.md)**
- Trang Giáo án thành **hai cột**: khung chat cố định 400 px bên trái (chọn nhiều giáo án, tải giáo án mới, chọn AI local hay đám mây), trả lời **kèm trích dẫn đúng nguồn**, và "Bộ câu hỏi" ra **định dạng arena** rồi bấm một nút là sang wizard ở bước hoàn tất **không gọi model lần hai**; BETA bị **xoá** chứ không đổi nhãn; cổng mới `check:lesson-chat-ui` **59 check** test luồng cloud bằng mock OpenAI loopback (#182) — **đã lưu ở [docs/handoff/status/2026-11-04.md](handoff/status/2026-11-04.md)**

### 2026-11-03
- Chữ **nhỏ và nhạt** thành hai con số có sàn: 11 px và 4,5:1 cho 16 màn hình giáo viên × 2 theme — baseline 184/538 dòng dưới ngưỡng và 124 dòng ≤ 10 px, nay **0 và 0**; `--color-muted` tự nó chỉ 3,90:1 nên một dòng token sửa được cả app; cổng mới `check:typography-ui` 8 check là phép kiểm đầu tiên đo **trạng thái hover/focus** (chữ từng biến mất đúng lúc con trỏ dừng trên nó, 1,13:1) (#181) — **đã lưu ở [docs/handoff/status/2026-11-03.md](handoff/status/2026-11-03.md)**
- Bước 2 **không cắt giáo án khi phân tích bằng AI đám mây** — hạn mức đọc là thuộc tính của nhà cung cấp, không của bài học; giao diện nói rõ đã đọc bao nhiêu ký tự và có cắt hay không; chữ hướng dẫn bước 2 giảm 27 % (#180) — **đã lưu ở [docs/handoff/status/2026-11-03.md](handoff/status/2026-11-03.md)**
- Chế độ Xây nhà: HUD "Đã xây n/m phần" rời dải ngang sang **cột phải**, màn trình diễn đặt **nhà một bên — lời giải thích một bên**; `houseTarget()` chỉ còn đo một ô DOM và sizing đọc **hộp bao của hình chiếu** (8 góc envelope) thay vì hằng số `0,78`; trên **máy chiếu** cột HUD không còn bị `wizard.css:409` ẩn sạch, và `flex-wrap: nowrap` giữ hai cột cạnh nhau ở cả hai màn (#179) — **đã lưu ở [docs/handoff/status/2026-11-03.md](handoff/status/2026-11-03.md)**
- Ghép xong thì hiện **cả hai vế** của cặp (board · SVG · máy chiếu · dòng "Đã ghép"), và một câu trả lời đúng không còn phóng nhỏ cả bầu trời 11 % rồi bỏ nhãn lại ở trời cũ (#178) — **đã lưu ở [docs/handoff/status/2026-11-03.md](handoff/status/2026-11-03.md)**
- Chòm sao tri thức: nhãn dài treo đúng trên sao + hàng dưới là lưới 12 cột có số trên sao (#174); màn kết quả **là** bầu trời 3D thay vì ảnh tĩnh (#175); sửa phép chiếu DOM phải đo theo canvas — nhãn từng lệch sao thật 34–56 px mà gate vẫn xanh (#176) — **đã lưu ở [docs/handoff/status/2026-11-03.md](handoff/status/2026-11-03.md)**
- `fitConnectionGraph` đóng khung theo **hộp bao của hình** thay vì hộp vẽ: chòm sao về giữa khung (từng lệch tới 164 px), kèm trần phóng to 1,4× để mảnh 2 sao không thành hai vòng tròn (#177) — **đã lưu ở [docs/handoff/status/2026-11-03.md](handoff/status/2026-11-03.md)**

### 2026-11-02 — #171–#173 đã lưu ở [docs/handoff/status/2026-11-02.md](handoff/status/2026-11-02.md)
- Board chòm sao bỏ hết khung xám (modal + nỉ thế giới + vòng quanh cảnh) và nổi trong khoang vũ trụ `makeCosmos`: trời gradient, 620 sao shader twinkle, 3 dải khí, quay chậm theo vòng lặp chung (#173)
- "Chòm sao tri thức" bố cục lại: MỘT khay thẻ dưới cảnh lớn (~68% vùng chơi), câu dài đọc được ngoài cảnh với một đường trỏ tới sao, cạnh chòm sao chỉ hiện khi ghép đúng; sửa lỗi chiếu theo hai khung khiến thả không trúng sao và không cạnh nào hiện (#172)
- "Chòm sao tri thức": bảng sao 3D kéo thả (7 chòm sao, `dragDirection`, ánh xạ id cũ), thay "Kết nối vật thể"; chơi toàn màn hình với cảnh là bề mặt chính; BETA gỡ bỏ (#171)

### 2026-11-01 — [docs/handoff/status/2026-11-01.md](handoff/status/2026-11-01.md)
- "Kết nối vật thể" chuyển sang BETA (chỉ nhãn, giữ hành vi) và sửa lỗi camera matrix làm hình chiếu lệch ~60 000 px (#170)
- "Kết nối vật thể" thành bề mặt 3D thật bằng Three.js: khối/vòng có chiều sâu, dây vẽ dần, camera dolly, SVG làm dự phòng (#169)
- "Kết nối vật thể": cách chơi thứ tư của Ghép cặp kiến thức — 7 mẫu dữ liệu, hình SVG thay bảng hai cột, máy chiếu có khung tĩnh (#168)
- Một cỡ 22px/700 cho mọi tiêu đề trang, bỏ dòng mô tả, `h1` kế thừa token mực — nhịp 25px, nợ light 28 → 26 (#167)
- `color-scheme` khoá theo `[data-theme]` — checkbox/popup `<select>` native hết vẽ sáng, gate dark 18 → 23 check, dịch màu cả họ select ghim màu (#166)
- Năm badge bước lên AA cả hai theme — gate đọc luôn nhánh light, 16 → 18 check, dark 0/263 dưới ngưỡng (#165)
- Dark mode cho bốn thanh chọn hàng loạt — sửa bằng bảng dịch màu, gate dark 9 → 16 check (#164)
- "Xoá đã chọn" cho trang Dự án của tôi — IPC `project:delete-many` + thanh chọn (#163)
- Bỏ brand + navbar; trạng thái llama.cpp, thông báo, toàn màn hình/trợ giúp vào sidebar (#162)
- Icon Lucide cho toàn bộ chrome, xoá trang Tổng quan, sidebar có khối "Lối tắt" (#161)
- Biến thể `dark:` nối vào `[data-theme]` — dark mode 149/223 → 5/223 chữ dưới ngưỡng AA (#160, G6)
- Năm mục Cài đặt thành năm tab; mọi utility `dark:` trong app đều chết (#159)

### 2026-10-31 — [docs/handoff/status/2026-10-31.md](handoff/status/2026-10-31.md)
- Mục AI duy nhất, chia tab "AI local" / "AI cloud"; còn năm mục accordion (#158)
- Trang Cài đặt là accordion sáu mục; sửa `ai:test-provider` đọc cache key rỗng (#157)
- `ui-wizard-structure-check` xanh 14/14 nhờ guard setup onboarding (#156)
- Nhãn "Cách chơi" (Cổ điển / Xây nhà) trên thẻ trò chơi (#155)
- Phân trang và xoá nhiều ở Thư viện trò chơi (#154)
- Bốn yêu cầu #153: bỏ ảnh theo câu, nhãn "Đấu trường tri thức", ảnh thay nhãn xám, hạ HUD Xây nhà
- Màn chơi đặt tên theo template, không theo panel còn sót (#152)
- Sửa Phase B của ui-item-assets-editor-check đo đúng trang soạn thảo
- Tách game-editor + wizard/state theo khu vực
- Tách app.css thành 13 file khu vực
- Nhóm src/services theo lesson/ai/game/storage/input
- Tách gameplay.ts thành features/games/*
- Tách lịch sử docs sang docs/handoff + .gitattributes
- Rollout pattern gameplay cho matching/treasure/race
- Hiện nhà ở màn kết quả + 4 mẫu nhà
- Mục tiêu số phần nhà theo số câu hỏi
- Đưa ngôi nhà ra trước sau mỗi câu
- Thiết kế lại Chế độ Xây nhà: mỗi câu +1/−1 phần
- Chế độ Xây nhà cho quiz
- Tổng quát hoá `makeConstruction` với tham số `parts`

### 2026-10-30 — [docs/handoff/status/2026-10-30.md](handoff/status/2026-10-30.md)
- Hệ tương tác 3D gameplay-driven: lớp animation + 5 pattern + pilot quiz/scenario
- Mở rộng 3D trang trí sang matching/treasure/race
- Skill tương tác Three.js: bundle esbuild + `window.threeGame` + pilot quiz/scenario
- Ảnh minh hoạ tự tải lên hiện trọn vẹn thay vì bị cắt
- Toàn màn hình/máy chiếu: nén mật độ ở cửa sổ thấp 1366×768
- Tinh chỉnh 5 thế giới: scenario nhận lại bảng màu quiz + trạng thái "đã chọn" theo accent
- Màn hình kết quả 5 trò chơi: màu theo thế giới + dải thẻ số liệu

### 2026-10-29 — [docs/handoff/status/2026-10-29.md](handoff/status/2026-10-29.md)
- Nhà cung cấp AI chỉ cấu hình ở Cài đặt; Step 2/Step 5 dùng nhà cung cấp đã kiểm tra
- Sửa trình chỉnh sửa Đường đua
- Thanh lưu của trình chỉnh sửa luôn hiện
- Trình chỉnh sửa trò chơi thành trang
- Ảnh minh hoạ trong trình soạn thảo (tạo thủ công)
- Tải ảnh: hàng đợi ghi + không kẹt nút + dọn ảnh
- Sửa "Tải ảnh lên" không gắn ảnh ở bước 5
- Sửa ảnh tải lên không hiện trong thẻ câu hỏi
- Câu hỏi đi cùng ảnh minh hoạ, tải ảnh từ máy
- Lịch sử kết quả: phân trang + chọn nhiều để xoá
- Giáo án: phân trang + chọn nhiều để xoá
- Tác vụ AI có phân trang, giữ 30 tác vụ
- Menu "•••" tự đóng
- Thẻ trò chơi gọn + menu 3 chấm + xoá giáo án
- Nhập gói .egame

### 2026-10-28 — [docs/handoff/status/2026-10-28.md](handoff/status/2026-10-28.md)
- Đáp án không lẫn vào câu hỏi + ngân hàng đi thẳng bước lưu
- Làm sạch ký hiệu ngân hàng câu hỏi
- Ngân hàng câu hỏi linh hoạt + gợi ý thể loại theo dữ liệu
- Sửa 14 finding review: LAN rò dữ liệu, treasure không lưu được, classifier/parser lệch
- Phân loại 4 nhóm + lớp xác nhận MiniLM + đo thời gian
- Sửa 2 lỗi CRITICAL + 3 WARNING từ code review
- Phân luồng đầu vào & chặn gọi AI thừa
- Ghép cặp kiến thức: ghép xong dừng lại, có nút "Xem kết quả"
- Kho báu: hàng đầu sân khấu flex hai bên (nhãn thế giới trái, nút Bối cảnh phải)
- Kho báu: bỏ nhãn xám "Chặng n", nút Bối cảnh & Nhiệm vụ lên trên dải nhiệm vụ
- Chơi LAN: bục vinh danh hạng 1–2–3 khi kết thúc
- Chơi LAN: nút trên thẻ thư viện + nút "Bắt đầu câu 1" cho giáo viên
- Chơi LAN: học sinh trả lời trên điện thoại
- Truy tìm kho báu: trả lại nút pop-up Bối cảnh & Nhiệm vụ

### 2026-10-27 — [docs/handoff/status/2026-10-27.md](handoff/status/2026-10-27.md)
- Truy tìm kho báu: bố cục toàn màn hình mới
- Năm thế giới trò chơi: bộ chữ đổi sang font đủ dấu tiếng Việt
- Sửa 6 lỗi tìm thấy khi review batch UI
- Bước 1 Tạo từ giáo án: Hết khựng/giật khi tích chọn cấu trúc & chuyển tab
- Thanh Navbar: Làm gọn thanh trạng thái llama.cpp & Gom nút chức năng vào menu 3 chấm
- Cải tiến trang Cài đặt ứng dụng: Bố cục trực quan & Nút Lưu sticky
- Trang Tạo trò chơi mới (thủ công): Tái thiết kế giao diện hiện đại
- Tạo từ giáo án Bước 1: Tab UI cho Cấu trúc tài liệu & Nội dung giáo án
- Tạo từ giáo án Bước 1: Tái thiết kế bố cục giao diện khoa học và hiện đại
- Nâng cấp Navbar: Tích hợp thanh trạng thái AI/llama.cpp và Trung tâm thông báo lên Navbar
- Ghép cặp kiến thức: Bổ sung hiệu ứng tia nối 2 kết quả đúng
- Đường đua tri thức: Gộp Vòng-Lượt và Các đội vào 1 hàng duy nhất
- Đường đua tri thức: Bổ sung kết quả đúng/sai khi chọn đáp án, phóng to ảnh minh họa
- Tối ưu Truy tìm kho báu: Gợi ý và kết quả đúng/sai dưới ảnh minh họa, giữ nguyên tỉ lệ khi ảnh co giãn
- Gợi ý, kết quả đúng/sai hiển thị dưới ảnh minh họa, tách biệt hoàn toàn với layout câu hỏi
- Sửa lỗi nút "Bước vào chặng tiếp theo" không hoạt động trong Bản đồ Hành trình
- Sửa lỗi không tiếp tục được, thiết kế lại Bản đồ Hành trình Full màn hình cho Kho báu
- Tối ưu Truy tìm kho báu: Ẩn/Hiện bản đồ hành trình kèm chuyển động, Modal bối cảnh & luật chơi, Phần thưởng 80-90% và 100%
- Tối ưu bố cục 5 trò chơi, hiển thị đội nhóm & điểm, xử lý lúc có/không có ảnh, hoạt ảnh chuyển động toàn màn hình
- Man hinh choi toan man hinh nhat quan

### 2026-10-26 — [docs/handoff/status/2026-10-26.md](handoff/status/2026-10-26.md)
- Anh trong game to hon + anh mac dinh khi data khong co anh
- DaisyUI: cai dat an toan + don chien tranh do uu tien + sua check do sai

### 2026-10-25 — [docs/handoff/status/2026-10-25.md](handoff/status/2026-10-25.md)
- Pha B (tiep): kho bau la man CUON theo hop dong, race da do lai
- Pha B: dong het phan tran cua man cho (treasure 0px, quiz 0px)
- Bo cuc 2 cot cho stage: sua 5/6 loi may chieu
- Pha B: pho cap luoi do UI o 2 do phan giai that
- Pha A: chan mat ban nhap khi dong cua so
- Ke hoach UI v2 va bang do kiem tra moi truong UI hien tai
- UI/UX projector pass: Presentation Mode khong ve duoc trong ban build, va co chu trinh chieu 12-16px
- CPU-vs-Vulkan: quyết định CPU-mặc-định được **xác nhận lại** bằng phép đo sạch; một bảng benchmark cũ trong docs là số sai
- Housekeeping — dọn build output và xoá `tests/tailieu/`
- Gemma 4 E2B đã được đo: chậm hơn 2B thật, và **không** phải vì CPU "chỉ chạy 33%"
- CPU is now visibly the default; catalog swapped to 2B/4B/Gemma 4; a bad runtime can no longer kill AI local
- Vulkan now really runs on the iGPU; measured **slower than CPU** on the pilot machine

### Không ghi ngày (mục cũ #70–#79, khoảng 2026-10-22/23) — [docs/handoff/status/undated-070-079.md](handoff/status/undated-070-079.md)
- Backend choice now reaches the files on disk (fixes "chose Vulkan, CPU still at 100%")
- Runtime backend is now a teacher choice (Vulkan/iGPU reachable from Settings, CPU stays the default)
- Renderer guard: build now fails on a call to an undeclared function (`@ts-nocheck` blind spot closed)
- Step 1 structure tree: TWO INTERACTION BUGS FOUND AND FIXED (checkboxes painted unticked; root row toggled everything)
- Step 1 "Chọn tệp giáo án": ROOT CAUSE FOUND AND FIXED (`ReferenceError` killed `render()`)
- Step 1 "Chọn tệp giáo án" does nothing: investigated, not reproduced in code (open)
- A parent section now really contains its subtree; analyzer hardened (#79)
- Structure tree gets its missing CSS; scope-to-prompt proven by test (#76, #77)
- Lesson structure analyzer + section selection: both suites green (#76, #77)
- Step 2 now shows the same progress as step 5: a bar, a spinner and the elapsed clock (#75)
- Step 5 crashed on load: a top-level read of a later script's binding (hotfix, #74)
- Phase B: per-item artwork you can change, and the matching-pair hole closed (#73)
- All 24 depth-stack scenes reviewed; three more visual defects fixed and gated (#72 follow-up)
- Illustrations became depth stacks, and the preview caught three defects (#72)
- Step 5 shows a real stage percentage, a spinner and a measured ETA (#71)
- Illustrations are scenes now, and the frame finally fits them (#70)
- Offline proven under a REAL network block (not just "0 requests")

### 2026-10-23 — [docs/handoff/status/2026-10-23.md](handoff/status/2026-10-23.md)
- Mật độ chữ màn chơi toàn màn hình: 122px trống là **rule CSS chết**
- Đợt 2c: xếp hạng trích đoạn bằng truy vấn thật + sửa tiền xử lý hai lần
- Sửa lỗi sau khi chạy trên 4 tài liệu thật + ngân sách `deep`
- #54 tiếp: thu hẹp trích đoạn theo từng mục khi "Tạo lại"

### 2026-10-22 — [docs/handoff/status/2026-10-22.md](handoff/status/2026-10-22.md)
- Sửa smoke-test bước 12: cài AI lần đầu thất bại dù model chạy tốt
- Chấm "điền từ / trả lời ngắn": dấu câu và dấu phẩy trong đáp án nhiều ý
- Câu nhập đáp án ngắn (≤ 5 từ) + nút "Gợi ý", và hai lỗi bố cục đo được
- Đổi toàn bộ model sang Q4_K_M, setup lần đầu không tự cài 7B
- Build lại bộ cài có wizard UI
- Lỗi giáo viên báo 22/10 — "modal giật khi tải AI", "AI không khởi chạy", "setup phải toàn màn hình"
- Wizard UI cài AI lần đầu (Đợt 4) — giáo viên đã bấm được luồng setup
- Đóng gói bộ cài có phần AI setup
- Cài đặt AI lần đầu — Đợt 3: nối vào Electron (main.ts + preload)
- Cài đặt AI lần đầu — Đợt 2: orchestrator + IPC hẹp
- Cài đặt AI lần đầu — Đợt 1: nền tảng thuần TypeScript
- Cải thiện UI/UX màn chơi game, nút "Trình chiếu" và icon điều hướng
- Bốn lỗi UI giáo viên báo: thanh menu Windows, thanh cuộn, "Đường đua" nền trắng, "Tìm kho báu" không cuộn được
- Sửa lỗi UI: nav/topbar còn hiện khi chơi game toàn màn hình

### 2026-10-21 — [docs/handoff/status/2026-10-21.md](handoff/status/2026-10-21.md)
- Presentation Mode — Trình chiếu game lên màn hình phụ/máy chiếu
- Wizard: dự đoán số mục, nút “AI gợi ý & tạo ngay”, chọn thể loại và phản hồi bước 5 (O12/O13)
- Nhật ký chẩn đoán AI (O10)
- Số luồng CPU tự động (O11)
- Xử lý AI trả thiếu mục (O9)
- update_plan_3 Đợt 3 (đợt này) — Theme, kéo thả file, toàn màn hình, đổi tên dự án
- Status bar AI local
- Nút toàn màn hình (⛶) khi trình chiếu
- Wizard bước 4/5 + thanh AI cố định khi cuộn
- Đổi thể loại sau bước 5 không còn bị chặn

### 2026-10-20 — [docs/handoff/status/2026-10-20.md](handoff/status/2026-10-20.md)
- update_plan_3 Đợt 2 — Thinking đúng spec §7/§9 + UI Task Manager
- update_plan_3 Đợt 1 — Task Manager CPU-only + verify runtime + ẩn UI GPU
- Sửa lỗi khởi chạy Qwen3.5 4B + dọn model AI khi gỡ cài đặt
- §5.2b — Hình nền, nhân vật minh họa và âm thanh cho kho báu
- `update_plan_2` — Lưu/mở lại, gameplay, chống gọi AI trùng, lịch sử kết quả, tách 3 khu vực
- §5.2 — Bản đồ hành trình + nhiệm vụ đa dạng trong kho báu
- Phân tích giáo án chạy nền + trò chơi thứ hai từ cùng giáo án
- P7 nốt — AI tạo lại từng mục trong editor, chỉ game mở từ wizard
- P7 — Dọn đường document-assist chết
- Tối ưu quy trình AI — O6: Fast/Deep thật + benchmark trước/sau
- Tối ưu quy trình AI — O5: cache phân tích/nội dung + tạo lại từng mục
- Tối ưu quy trình AI — O4: truy xuất bằng embedding MiniLM thật
- Tối ưu quy trình AI — O3: chia nhỏ giáo án + truy xuất đoạn liên quan
- Tối ưu quy trình AI — O2: kiểm tra chất lượng nội dung bằng TypeScript
- Tối ưu quy trình AI — O1: chọn thể loại bằng TypeScript, bỏ 1 lượt Qwen
- Tối ưu quy trình AI — O0: kế hoạch chờ duyệt

### 2026-10-19 — [docs/handoff/status/2026-10-19.md](handoff/status/2026-10-19.md)
- AI-assisted Lesson-to-Game — P6: sinh nội dung 5 thể loại + editor
- AI-assisted Lesson-to-Game — P5: wizard bước 1–4 + trang "Tạo trò chơi" chỉ thủ công
- AI-assisted Lesson-to-Game — P4: analyze + recommend
- AI-assisted Lesson-to-Game — P1: contracts + adapter
- AI-assisted Lesson-to-Game — P3: AI transport + workflow
- AI-assisted Lesson-to-Game — P2: storage + draft
- Editor kéo-thả (matching + race) + xem trước đường đua
- Lịch sử trước 2026-10-19
## Bàn giao gần nhất

## Handoff — **Phát hành 0.4.1** từ snapshot của luồng #189–#195: hòn đảo sáng hợp nhất với thang surface, sàn 11 px, và một glyph chưa tồn tại (2026-11-05, DECISIONS #202)

**Files changed.** Trên nhánh `release/0.4.1` trong worktree tách biệt `D:/Laptrinh/edugame-wt-041` — **cây làm việc chính của luồng #189–#195 không bị sửa file nào**. `17c3abb` (snapshot 23 file modified + 8 file untracked của luồng kia + bump + sửa mojibake): `package.json` / `package-lock.json` (hai trường version) / `server/index.ts:66` 0.4.0 → **0.4.1**, `package.json.description` viết lại UTF-8 đúng. `f5b0cfe` (ba bản sửa, 9 file, **+39/−9**): `src/renderer/styles/shell.css` (+`--surface-0..3` bảng sáng trong rule hòn đảo `.modal` và chú thích vì sao không cắt dòng của #191), `src/renderer/styles/components.css` (cùng thang cho `.ai-chat-panel`; `.info-box` + `.ai-chat-composer` bỏ hex ghim, đổi sang `var(--muted)`/`var(--text)`), `src/renderer/styles/setup-wizard.css` (thang sáng trong `.setup-fullscreen`), `src/renderer/pages/create.ts:58` + `src/renderer/features/lesson-chat.ts:278–279` (`text-[10px]` → `text-[11px]`, ba chỗ), `scripts/build-icon-registry.js` (+7 tên vào `ICON_GROUPS.chrome`, gồm `sliders-horizontal`), `src/shared/icon-registry.ts` + `src/renderer/features/icon-data.ts` (sinh lại, **128 → 129**), `tests/unit/asset-registry.test.ts:108` (`ICON_COUNT` 128 → **129**, cùng commit theo đúng docstring chống drift của nó). Docs: `DECISIONS.md` #202, `STATUS.md` (block mới + mục lục 2026-11-05), `ROADMAP.md` — **không** đụng `docs/handoff/status/*` vì file lưu trữ của 2026-11-04 đang bị luồng #189–#195 sửa dở ở cây chính; xem ghi chú lệch quy ước ở đầu file.

**Behavior.** Yêu cầu gốc, nguyên văn: *"bump và phát hành ngay"*, và khi được hỏi phạm vi: **"Bao gồm luồng #189–#195"**. Ba điều rút ra được viết thành luật chứ không chỉ thành diff. (1) **Không phát hành từ code chưa commit** — tag sẽ trỏ vào một commit không dựng ra binary; vì thế snapshot là bắt buộc, và nó sống trên **nhánh**, không trên `main`. (2) **Hòn đảo sáng phải khai báo lại mọi họ biến theo theme.** #191 thêm thang `--surface-0..3` của dark, sơn nó lên `.modal-head`/`.modal-foot`/`.modal-body`/`.info-box`/`.ai-chat-composer` trong khi `shell.css:180` vẫn giữ `.modal` cửa sổ **trắng** với mực `#172033`: giáo viên mở hộp Help thấy tiêu đề **1,05:1**, `.info-box` ở wizard **3,12:1** — đo trên binary đóng gói, không phải đoán. Chữa bằng cách re-pin `--surface-0..3` = `#ffffff/#f5f7fc/#eef1f8/#e6eaf4` ngay trong ba bề mặt tự nhận là sáng (`.modal` của `shell.css:180`, `.setup-fullscreen`, `.ai-chat-panel`) và trả mực của `.info-box`/composer về **alias** để nó lật theo ngữ cảnh; **không** xoá dòng `var(--surface-N)` của #191 vì thu bậc đậm–nhạt vẫn đúng ở nơi tối thật (toàn màn hình, `shell.css:223` đổi nền `#0b0e1a`). Sau sửa, cùng hai chỗ đó là **15,18:1** và **5,10:1**. Đây là lần thứ tư hòn đảo phải re-pin một họ biến mới (`--text` #167, `--color-*` #181, `--surface-*` #202). (3) **Publish theo thứ tự an toàn:** `api.github.com` **từ chối** POST asset (**404** — phải dùng `uploads.github.com`); release giữ draft cho tới khi `GET /releases/{id}` xác nhận đủ ba tên **và đúng số byte**; `latest.yml` nạp **cuối** để không có khoảng trống "feed trỏ vào `.exe` chưa tồn tại". Tag `v0.4.1` (mới tạo và push vài phút trước, chưa release nào tham chiếu — kiểm tra `releases/tags/v0.4.1` → **404** trước khi xoá) được **dời** từ `17c3abb` sang `f5b0cfe` để tag dựng lại đúng binary đã công bố.

**Commands run.** `npm run build` **0 lỗi** · `node tests/run-unit.js` **87/87** · `npm run verify:css` **56/56** · `npm run check:renderer-globals` **0** undefined · `npm run dist:win` → `EduGame-Studio-Setup-0.4.1.exe` **92.496.890 B** + `.blockmap` **96.263 B** + `latest.yml` **356 B**, `version: 0.4.1`. Trên binary đóng gói, mỗi cổng một instance + **profile sạch** qua `launch-packaged-041.ps1` (`EDUGAME_USER_DATA`): `check:typography-ui` **8/8** · `check:chrome-icons-ui` **17/17** · `check:dark-theme-ui` **23/23** · `check:presentation-ui` **60/60** · `check:offline-packaged` **11/11** — lần **đầu** trên profile mới chạy **9/11** vì overlay onboarding choáng mất `.game-stage`, chạy lại lần hai trên cùng instance là 11/11 (đúng loại noise đã ghi ở #183/#201, không phải regression). Kiểm `app.asar` bằng `@electron/asar`: `--surface-0..3` có mặt ở **cả ba** hòn đảo, `.info-box{background:var(--surface-1);color:var(--muted)}`, `sliders-horizontal in icon-data true`, `create.ts` còn `text-[11px]` và **hết** `text-[10px]`, utility 11 px đã vào CSS biên dịch, `app-update.yml` = `owner vananz123 / repo edu-game-ai / provider github / releaseType release`. Publish: **draft 434743442** → ba asset **201** (id `711888056` / `711888333` / `711888362`) → `PATCH {draft:false}` **200**. Xác nhận **vô danh**: `releases/latest` → `v0.4.1`, đủ ba asset; `latest.yml` tải từ URL công khai vẫn `version: 0.4.1` với sha512 `GqHMiBRx…A8ET/g==`; `HEAD` `.exe` → 302 → **200**, `Content-Length: 92496890`; `sha512` local (`1aa1cc8814…03c113fe`) khớp `latest.yml` từng byte. Tag remote sau khi dời: `git ls-remote --tags origin 'refs/tags/v0.4.1^{}'` → `f5b0cfe`.

**What remains unverified.** (1) **`quitAndInstall()` vẫn chưa lần nào được gọi** — chủ dự án không cho chạy bộ cài ở máy này, nên wizard cài đặt, registry, shortcut và "app bật lại ở bản mới" chưa có bằng chứng nào ngoài code (nợ #200 (a) giữ nguyên). (2) Nhánh **"có bản mới" chống feed thật** giờ mới **có đường đo** nhưng **chưa đo**: `tests/ui/packaged-feed-check.js` còn hard-code `info.version === '0.4.0'` (dòng 178) và `feedVersion === state.currentVersion` (dòng 220–221) — cần chế độ `available`, rồi chạy với binary 0.4.0 **trích `win-unpacked` từ bộ cài đã phát hành bằng 7zip** (không chạy installer). (3) **`main` không có code của 0.4.1** và docs của #189–#201 vẫn chưa commit, nên entry #202 này được viết trên nhánh — người merge cần coi `shell.css`/`components.css`/`setup-wizard.css`/`create.ts`/`lesson-chat.ts`/`icon-registry` phía **nhánh** là đúng vì nó là thứ đã đóng gói và đã công khai. (4) Chưa cài trên **máy sạch ngắt mạng** (P7), chưa ký Authenticode, các nhánh AI local không đo ở máy dev. (5) Chưa đo trên **1366×768 thật**.

**Next recommended task.** (1) **Merge `release/0.4.1` → `main`** (kèm bump bốn chỗ) để source của bản đã phát hành nằm ở nhánh chính, rồi commit docs #189–#201 đang treo ở cây làm việc. (2) Trả nợ (2): tổng quát hoá `packaged-feed-check.js` và đo **0.4.0 chống feed có 0.4.1** — lần đầu người dùng thật gặp hành trình cập nhật bằng nguồn thật. (3) **P7**: một máy sạch cài `Setup-0.4.1.exe`, chơi offline, bấm "Kiểm tra cập nhật".

## Handoff — Khung chat sống lại sau cú **xoá cuộc trò chuyện** (#187), và trang **Giới thiệu** có tự cập nhật từ GitHub Releases (#188)

**Files changed.** #187 — sửa `src/renderer/features/lesson-chat.ts` (+43/−5 — `closeHistoryAndRefocusComposer()` gọi ở **cả ba** nhánh của lượt xoá; `lessonChatUi.chatsError` + danh sách in lý do thay vì "chưa có cuộc trò chuyện nào"; `lessonChatSend` chỉ xoá `draft` khi khung còn đúng câu vừa gửi; bỏ `disabled` khỏi `<textarea>`), `src/renderer/styles/lesson-chat.css` (−5 — xoá luôn rule `.lesson-chat-input:disabled`, không để rule chết), `tests/ui/ui-lesson-chat-check.js` (+180/−1 — **95 → 110 check**, mục 11 + 11b). #188 — **mới**: `src/shared/about-types.ts` (103 dòng), `src/services/update/update-policy.ts` (298 — máy trạng thái **thuần**), `src/services/update/update-electron-adapter.ts` (254), `src/about/about-manager.ts` (94), `src/about/about-ipc.ts` (108), `src/about/about-preload.js` (62), `src/about/about.html` (464 — CSS/JS nhúng trong một tệp, tiếng Việt), `tests/unit/update-policy.test.ts` (235), `tests/unit/about-page.test.ts` (403 — **27 check**), `tests/ui/ui-about-check.js` (622 — **69 check**, khai báo là `npm run check:about-ui`). Sửa: `package.json` (`electron-updater ^6.8.11` vào `dependencies`, script `check:about-ui`, `copyfiles` mang `src/about/*`, `build.publish` = `github` / `vananz123` / `edu-game-ai`), `package-lock.json`, `src/main.ts` (+4 — `registerAboutIpc`/`unregisterAboutIpc`), `src/preload.ts` (+4 — `openAbout(theme)`), `src/index.html` (+2 — nút "Giới thiệu" ở sidebar), `src/renderer/core/controller.ts` (+5 — action `about-open`), `tests/unit/build-assets.test.ts` (+6 — hai asset About vào `COPIED_ASSETS`), `.gitignore` (+5 — `dev-app-update.yml`), docs: `DECISIONS.md` #187 + #188, `STATUS.md`, `ROADMAP.md`, `docs/handoff/status/2026-11-04.md` (dời bàn giao #184 ra lưu trữ).

**Behavior.** Hai yêu cầu gốc, nguyên văn: *"bug: khung chatbot khi xóa 1 cuộc trò chuyện thì không nhập chat được nữa"* và *"Act as a Senior Electron.js Developer. Help me build a fully functional 'About' page … using `electron-updater` from GitHub Releases"* (kèm đặc tả 4 mục: folder structure · main process với `autoDownload = false` + bốn sự kiện + IPC · preload `contextBridge` thành `window.aboutAPI` · renderer dashboard có badge, progress bar %, "Restart to Install", xử lý lỗi hiển thị được; *"Use Vietnamese for the user-facing text inside the about.html UI"*). **(a) #187:** nguyên nhân trực tiếp là **con trỏ**, không phải ô gõ — `render()` sau cú xoá dựng lại popover lịch sử, node thùng rác đang giữ focus biến mất cùng markup nên `activeElement` về `<body>` và popover vẫn treo; giáo viên thấy một ô gõ y hệt cũ không nhận phím. Cùng lúc còn hai chỗ nữa cũng tạo đúng cảm giác đó: `<textarea disabled>` suốt một lượt (trên máy CPU một câu trả lời mất **vài phút**, và ô từ chối gõ mà không nói lý do) và `draft = ''` **vô điều kiện** sau lượt — khi ô gõ đã mở thì chữ còn lại **là câu hỏi tiếp theo**, không phải tàn dư. Nay ô gõ luôn gõ được, chốt nằm ở `lessonChatCanSend`, nút dừng còn nguyên, và `closeHistoryAndRefocusComposer()` chạy ở **cả ba** nhánh (xoá xong · giáo viên Huỷ · lỗi) vì ba nhánh phải cho cùng một kết cục. Một chỗ nói dối lộ ra khi sửa: `lessonChatRefreshChats()` nuốt lỗi thành `[]` rồi in "Chưa có cuộc trò chuyện nào được lưu." — một kho đọc lỗi bị trình bày như "nó ăn mất lịch sử của tôi", ngay sau đúng thao tác xoá. **(b) #188:** ba chỗ làm khác đặc tả và nói thẳng ở `DECISIONS.md` — `checkForUpdatesAndNotify()` **không dùng** (nó tự tải + tự bắn thông báo, trái chính `autoDownload = false` mà spec đòi), **không kiểm tra khi khởi động** (lần kiểm tra đầu tiên xảy ra khi mở trang, vì `check:offline-packaged` đòi **0 request** và vì lời hứa offline), và bốn tên sự kiện không bridge 1-một mà là **bốn bộ lọc trên một kênh đẩy `about:state-push`** (`AppUpdater` cache `configOnDisk` + `clientPromise` cả đời process). Phần khó — *lúc nào được phép bấm gì* — nằm trong `update-policy.ts` thuần nên sáu luật test được không cần bộ cài: nguồn trỏ đúng bản đang chạy là "đã mới nhất" chứ không phải mời lên 0.4.0; một lần kiểm tra sau không xoá mất quyền cài; lỗi muộn không đoạt lại bộ cài đã tải; % một chiều và kẹp 0–100; `dev-mode` là **điều không thể** chứ không phải lỗi; nút Cài chỉ sáng khi thực sự có bộ cài. Ba khoá mà mặc định của thư viện làm sai cho một lớp học: `autoDownload = false`, **`autoInstallOnAppQuit = false`** ("tắt máy sau buổi học" không được phép thành "sáng mai phần mềm khác đi"), `allowPrerelease = false`. Cửa sổ theo khuôn Presentation Mode: `contextIsolation` + `nodeIntegration: false` + **`sandbox: true`** + preload riêng (preload sandbox chỉ được `require('electron')`, nên kênh được khai báo lại và view tự vệ bằng `bridgeFailure()`), chặn điều hướng ra ngoài, "Xem bản phát hành" chỉ mở **đúng** `https://github.com/vananz123/edu-game-ai/releases` (main kiểm tra host trước `shell.openExternal`), theme đi theo app kể cả khi cửa sổ đã mở. **Spec nói app ở 0.3.0 — thực tế đã là 0.4.0 từ #185**, mọi con số trên trang và trong test nhân theo 0.4.0. Trang không nạp `app.css` nên gate tự đo tương phản: `--ok` `#15803d` đo ra **4,49** (dưới sàn AA của #181) → đổi `#166534`, đo lại **6,38**.

**Commands run.** `npx tsc -p tsconfig.json --noEmit` 0 · `npm run check` 0 · `npm run build` 0 (tailwind + three 732 KB; `copyfiles` mang `src/about/about.html` + `about-preload.js`) · `node tests/run-unit.js` **76 → 78/78** (31,4 s, thêm `update-policy` + `about-page`) · `npm run test:native` **1/1** · `npm run verify:css` **46/46** · `npm run check:renderer-globals` 0 undefined (**930** hàm / **7.535** call site) · trên Electron thật, mỗi cổng một instance + **profile sạch** (`EDUGAME_AI_TEST_DIR` unset): `check:lesson-chat-ui` **110 PASS / 0 FAIL**, `rc=0`, "all checks passed — mock requests: probe, answer, question_set, answer, answer, answer" (instance 9362, `Temp/qoder-lc187b`) · **cổng mới `check:about-ui` 69 PASS / 0 FAIL**, `rc=0` (instance 9356, `Temp/qoder-ab188b`) với vòng đời thật: bấm thật ở sidebar mở cửa sổ thứ hai → an ninh sandbox/chặn điều hướng → 0.4.0 → `dev-mode` nói thẳng → offline (`ERR_CONNECTION_REFUSED`) → feed 404 → **có bản mới 9.9.9 và không tự tải** → tải thật với % tăng một chiều (payload bơm 100 KB/250 ms ≈ 8 s để `ProgressCallbackTransform` — tối đa **một** event/1000 ms — kịp vài nhịp giữa 0 và 100) → `update-downloaded` → nút Cài sáng **và bộ cài nằm trên đĩa đúng số byte** → luật 6 → cửa sổ đóng sạch; gate còn quét **hình dạng secret** trên DOM · anh em, instance riêng: typography **8/8** · dark-theme **23/23** (cổng riêng vì nó lật theme toàn app) · chrome-icons **16/16** · **bản đóng gói**: `npm run dist:win` 0 → `app.asar` có hai asset About, `resources/app-update.yml` trỏ GitHub, và `check:offline-packaged` **11/11 với 0 request** trên chính bản đó — #188 không phá điều ước offline.

**What remains unverified.** (1) **`quitAndInstall()` chưa lần nào được gọi** — nó cài phần mềm lên máy này, và chủ dự án đã nhiều lần yêu cầu không chạy bộ cài; gate chứng minh tới **đúng trước** bước đó (nút sáng + bộ cài trên đĩa đúng số byte), còn wizard cài thật và "app bật lại ở bản mới" **chưa có bằng chứng nào ngoài code**. (2) Nguồn cập nhật mới là **mock loopback**; repo `vananz123/edu-game-ai` **chưa có release nào**, nên bản gói hôm nay hiển thị `errorKind: 'feed'` + *"Chưa tìm thấy bản phát hành nào trên GitHub…"* — **hành vi đúng, không phải đỏ**, nhưng nghĩa là chưa một lần đi hết con đường xanh bằng nguồn thật. (3) `sha512` trong `latest.yml` chỉ chứng minh tệp **nguyên vẹn**, không chứng minh **ai phát hành**: với `provider: github` trên repo công khai, bất kỳ ai có quyền ghi repo đều đẩy được bản cập nhật về máy giáo viên; khắc phục thật là ký **Authenticode** (dịch vụ trả phí → theo AGENTS.md chưa tự ý làm). (4) `package.json.description` vẫn **mã hoá sai** (NBSP + `†`, và chính chuỗi đó thành FileDescription của exe) — chưa sửa vì cần một lần sửa một dòng có ý thức về encoding; `EDUGAME_DESCRIPTION` trong `about-types.ts` là chỗ trang này thực sự đọc. (5) Trang Giới thiệu và khung chat chưa được xem bằng mắt ở **1366×768 thật** (nợ bước sang lần thứ **mười một**). (6) #187: chưa ai bấm "Huỷ" bằng tay ở hộp xác nhận (`confirm()` native vẫn là nợ, gate phải stub nó để chạy), và "gửi câu thứ hai khi lượt trước còn chạy" mới chứng minh **không mất chữ**, chưa chứng minh **không hỏng thứ tự** khi hai lượt chồng nhau. (7) Nợ #182–#186 giữ nguyên: local chưa chạy llama.cpp, cloud mới đi mock loopback, không streaming, lịch sử 6 × 700 ký tự, chỉ dạng arena, chưa test file binary thật.

**Next recommended task.** (1) **Tạo một release 0.4.0 thật** trên GitHub (`Setup-0.4.0.exe` + `latest.yml`) rồi mở trang Giới thiệu của **bản đã cài** và bấm "Kiểm tra cập nhật": đó là lần đầu con đường xanh đi hết bằng nguồn thật, và cũng trả luôn nợ (2) của lần này lẫn nợ "chưa chạy bản đóng gói" của nhiều đời. (2) Xin ý kiến chủ dự án về **chứng thực Authenticode** (chi phí, và vì sao `sha512` chưa đủ). (3) Gỡ dòng `GH_TOKEN` vừa xuất hiện trong bản làm việc của `.env.example` (chuỗi dạng `ghp_…`, **không** nằm trong `HEAD`, **không** được commit) và đổi key đó nếu nó từng là key thật; sửa một dòng `description` trong `package.json` cho đúng tiếng Việt. (4) Thay `confirm()` native của khung chat bằng hộp xác nhận của chính app — chỗ duy nhất mà gate vẫn phải stub, và chỗ duy nhất giáo viên có thể mất một thứ mà không thấy mô tả nó là gì.

## Handoff — Khung chat đọc **toàn bộ giáo án** trên cloud và local **có GPU**; local **CPU** vẫn cắt, và mọi lượt đều nói "AI đã đọc X / Y ký tự" (2026-11-04, DECISIONS #186)

**Files changed.** Sửa: `src/services/lesson/lesson-chat.ts` (+112/−31 — **xoá** `CHAT_QUOTES_PER_DOCUMENT = 3` + `CHAT_EVIDENCE_MAX_CHARS = 3200`; mới `CHAT_RETRIEVAL_QUOTES_PER_DOCUMENT = 12`, `CHAT_LOCAL_MAX_CHARS = LOCAL_DOCUMENT_ANALYSIS_MAX_CHARS` (12.000), `CHAT_FALLBACK_CHARS_PER_DOCUMENT = 500`, `ChatEvidencePolicy` + `chatEvidencePolicyFor({providerId, localOnGpu})`, `buildChatEvidence` có nhánh `wholeDocument` + `share` chia trần đều giữa các bài + `meta`, `evidenceHeading()`, `toEvidenceBudget()` giữ `Infinity`, `runLessonChatTurn` đọc `client.providerId` và `input.localOnGpu`; docstring đầu module đổi quy tắc số một thành "chữ của giáo viên là trần của phần được đọc"), `src/shared/lesson-types.ts` (+24/−4 — `LessonChatEvidenceMeta`, `LessonChatMessage.evidence` **bắt buộc** (`null` cho dòng trước #186), `LessonChatTurnResponse` thay hai field cũ bằng `evidence`), `src/services/storage/lesson-store.ts` (+69/−2 — cột `evidence_meta TEXT` trong `lesson_chat_messages`, `PRAGMA table_info` + `ALTER TABLE … ADD COLUMN` trong `migrateSchema()`, `evidenceMetaToJson`/`evidenceMetaFromRow` **chèn** số (`totalCharacters ≥ characters`, `quotes ≥ 0`, mode lạ → `retrieval`, `trimmed` bật cưỡng bức khi thiếu chữ), user row `null`), `src/main.ts` (+19/−5 — `localRuntimeFacts()` trả thêm `localOnGpu` (try/catch → `false` = CPU), `lesson:chat-send` truyền `localOnGpu` + ghi `evidence`, summary `aiTasks` nối `· X/Y ký tự giáo án`, log `chat.turn` thêm `evidenceMode`/`evidenceTrimmed`), `src/ai-core/ai-manager.ts` (+14 — `getRuntimeFacts()` → `{backend, gpuLayers, contextSize}`), `src/renderer/features/lesson-chat.ts` (+22/−1 — `lessonChatReadsHtml()`), `src/renderer/styles/lesson-chat.css` (+15 — `.lesson-chat-reads` 12 px/`--muted`, `.is-cut` `font-weight:700`), `tests/unit/lesson-chat.test.ts` (+119/−8), `tests/unit/lesson-store.test.ts` (+50/−2), `tests/ui/ui-lesson-chat-check.js` (+37 — 87 → **95 check**), `tests/manual/verify-css.js` (+6 — 44 → **46/46**). Docs: `DECISIONS.md` #186, `STATUS.md`, `ROADMAP.md`, `docs/handoff/status/2026-11-04.md` (dời bàn giao #183 ra lưu trữ).

**Behavior.** Yêu cầu gốc, nguyên văn: *"theo đề xuất A + C nhưng thay đổi 1 phần ở AI local nếu là CPU thì cắt , còn dùng GPU thì gửi toàn bộ vì nhiều latop có GPU khỏe có thể chạy tốt. không cần test phần AI local sẽ gây mất thời gian/ tôi sẽ tự kiểm tra sau"*, sau lời phàn nàn *"phần hỏi đáp với giáo án , rất thiếu thông tin … tôi cần biết là khi thêm giáo án vào khung chat thì AI có nhận hết tài liệu đó không"*. **Đo trước khi sửa**: một giáo án 2.145 ký tự chỉ gửi **95–206 ký tự (4,4–9,6 %)** — hai hằng số hard-code, và không bề mặt nào nói ra. (1) **A** — `chatEvidencePolicyFor()` biến hạn mức thành **chính sách theo nhà cung cấp** đúng như #180 đã kết luận cho bước 2 wizard: cloud **toàn văn, không cắt** (`LESSON_PREPROCESS_NO_CUT`), local+GPU **toàn văn trong trần 12.000**, local+CPU **truy hồi trong trần 12.000**; số đoạn truy hồi **3 → 12**; trần local lấy thẳng hằng số `document-assist` đã chạy được trên llama.cpp nên nó là **giới hạn kế thừa, không phải phỏng đoán**. Chế độ toàn văn biến mỗi bài thành **một** citation `[n] (tên bài)` — hợp đồng bằng chứng **không nhân bản** (#168), nên `normalizeDraft`, mục "Nguồn trong giáo án" và marker `[n]` không cần hình dạng thứ hai; nhiều bài gắn cùng lúc thì **chia trần đều** để bài 11.000 ký tự gắn trước không ăn hết chỗ bài sau. (2) **Nhánh GPU đọc số layer thực offload**, không đọc backend giáo viên chọn: `AiRuntimeStatus` không mang thông tin phần cứng nên `AIManager.getRuntimeFacts()` expose `gpuLayers`, vì llama.cpp **có thể khởi động bằng CPU sau một lần Vulkan hỏng** và khung chat không được hứa một giáo án mà runtime không gánh nổi; mọi thất bại đều `catch` về CPU = cắt, tức an toàn theo hướng **gửi ít**. `createChatClientForProvider` luôn trả object có `providerId` nên service biết mình ở nhánh nào mà không tra lại registry. (3) **C** — `AI đã đọc 817 / 817 ký tự (100 %) · toàn bộ giáo án, không cắt bớt`, `· 12 đoạn liên quan, có cắt bớt` khi truy hồi, hậu tố "không tìm thấy đoạn khớp câu hỏi nên lấy phần đầu bài" **chỉ** cho fallback của nhánh truy hồi (#183: một lượt không gắn gì ≠ một lượt bị đọc thiếu); **đậm khi bị cắt, không đổi màu** để không phải chứng minh tương phản thêm một màu ở hai theme; một lượt **không gắn gì in rỗng**. Số liệu **được lưu**, không chỉ log: một cột JSON `evidence_meta` (thay vì bốn cột) + migration cộng dồn `ALTER TABLE … ADD COLUMN` nên kho cũ của giáo viên mở lên vẫn là kho cũ có thêm chữ; store **chèn** trước khi tin để không bao giờ in "đã đọc 5.000 / 100 ký tự", và `evidence: null` của dòng cũ render **không gì cả** thay vì bịa "100 %". (4) Model cũng được nói thẳng: heading *"Toàn bộ nội dung giáo án giáo viên đã gắn (mỗi tài liệu đánh số [n]):"* — **không** viết "có thể bị cắt nếu quá dài" cho cloud vì với cloud điều đó không đúng.

**Commands run.** `npx tsc -p tsconfig.json --noEmit` 0 · `npx tsc -p tsconfig.json` (emit) 0 · `node tests/run-unit.js` **76/76** (28,4 s) · `npm run test:native` **1/1** (1,5 s) · `npm run verify:css` **46/46** · `npm run check:renderer-globals` **929** hàm / **7.527** call site, 0 undefined · `npm run build` 0 (tailwind **932 ms**, three 732 KB) · trên Electron thật (instance cổng **9348**, **profile sạch** `Temp/qoder-lessonchat2`, `EDUGAME_AI_TEST_DIR` unset): `check:lesson-chat-ui` **95 PASS / 0 FAIL**, `rc=0`, "all checks passed — mock requests: probe, answer, question_set, answer"; tám check mới của #186 đọc **cả hai phía** — request tới endpoint thật **chứa nguyên văn cả hai giáo án** (`A=true B=true`), prompt mang heading toàn văn và **không** còn heading trích dẫn, dòng disclosure in đúng **817 / 817 (100 %)** (số trong UI được parse ngược và so với `DOC_A + DOC_B` trong harness, không so với một chuỗi nhớ sẵn), `readsTrimmed=0`, có icon `book-open`, `stored.reads` = `{817,817,2,'whole',false,false}` cho **cả hai** lượt assistant, và **sống qua `location.reload()`**; lượt không gắn giáo án thì `(none)` + `totalCharacters 0` · anh em, mỗi cổng một instance + **profile sạch**: typography **8/8** (772 dòng light / 740 dark, tệ nhất **4,74:1**) · dark-theme **23/23** (instance riêng cổng **9349** vì nó lật theme toàn app) · **đỏ do tái sử dụng profile**: chạy gate **lần hai trên cùng kho** đỏ **7** check (nhánh wizard handoff + save + cleanup) và `check:dark-theme-ui` trên instance đã đi qua chat đỏ **2** — giết Electron + xoá profile rồi chạy lại là xanh, đúng **điều kiện chạy** đã ghi ở #183, không phải regression.

**What remains unverified.** (1) **Cả hai nhánh local chưa chạy llama.cpp một lần nào**, đúng chỉ đạo *"không cần test phần AI local … tôi sẽ tự kiểm tra sau"*: `localOnGpu` chưa từng được đọc trên máy có Vulkan thật, nên **12.000 ký tự trên GPU là chính sách, chưa phải số đo** trên hardware của giáo viên — máy khoẻ thì tốt, máy hết context thì `AI_TIMEOUT`, và chỗ sửa khi đó là **một hằng số** `CHAT_LOCAL_MAX_CHARS` (đã có test giữ hình dạng số). (2) Cloud vẫn chỉ đi **mock loopback**: gate chứng minh request **chứa** toàn văn, chưa có lần nào lên Gemini/OpenAI thật để xem model **đối xử** với 12.000–30.000 ký tự ra sao; trần token từng nhà cung cấp **chưa được đối chiếu** với hạn mức mới này. (3) Ở chế độ toàn văn, "Nguồn trong giáo án" giờ chứa **cả bài** trong một `<details>` đóng — mặc định gấp nên không choáng, nhưng **chưa mở ra nhìn** với một giáo án dài thật. (4) Dòng disclosure dùng cặp `--muted`/`--panel` mà `.lesson-chat-note` đã dùng và đã qua census, nhưng node mới **không nằm trong** screens của `check:typography-ui` (nó cần một lượt chat có bằng chứng để tồn tại): tương phản của nó là **suy từ phần tử anh em**, chưa tự đo. (5) Nợ các đời trước giữ nguyên: không streaming, lịch sử 6 × 700 ký tự, chỉ dạng arena, `confirm()` native, chưa test binary thật, chưa đo **1366×768 thật** (lần thứ **mười**), `ui-draft-guard-check` **7/8**, chưa chạy `Setup-0.4.0.exe`.

**Next recommended task.** (1) **Chủ dự án tự chạy nhánh local** như đã nhận: một máy có GPU (kỳ vọng nguyên văn giáo án + dòng "AI đã đọc X / Y (100 %)") và một máy CPU (kỳ vọng truy hồi 12 đoạn + dòng **đậm** "có cắt bớt"); nếu GPU timeout thì hạ `CHAT_LOCAL_MAX_CHARS` — một dòng, có test giữ hình dạng. (2) Trả nợ (4): cho `check:typography-ui` **gửi một lượt chat có bằng chứng** rồi đo dòng disclosure để con số tương phản là tự đo. (3) Vẫn là gate thật duy nhất còn thiếu của cả dòng #182→#186: một lần cloud **thật** với key đã verify, một lượt có giáo án và một lượt không — #186 làm nội dung gửi đi **đủ**, nhưng chưa ai chứng minh model thật **dùng** đủ.

## Handoff — Logo mới cho **exe · bộ cài · shortcut · cửa sổ · taskbar**, phiên bản **0.4.0**, và bộ cài `.exe` đã đóng gói (2026-11-04, DECISIONS #185)

**Files changed.** Mới: `build/icon.png` (512×512 RGBA, 52.997 B), `src/renderer/assets/app-icon.png` (256×256 RGBA, 22.183 B), `tests/unit/brand-assets.test.ts` (~70 dòng — gate mới, tự phát hiện qua `tests/run-unit.js`), `docs/handoff/status/2026-11-04.md` (lưu bàn giao #182). Sửa: `package.json` (`version` 0.3.0 → **0.4.0**; `build.win.icon: "build/icon.png"`; `scripts.build` thêm `"src/renderer/assets/*"` vào `copyfiles`), `package-lock.json` (**hai** trường version: gốc và `packages[""]`), `server/index.ts:66` (`/health` → `'0.4.0'`), `README.md:1` (`EduGame Studio v0.4`), `src/main.ts` (+4 — `icon: path.join(__dirname, 'renderer', 'assets', 'app-icon.png')` trong `createWindow()`), `tests/unit/build-assets.test.ts` (+5 — `app-icon.png` vào `COPIED_ASSETS`). Docs: `DECISIONS.md` #185, `STATUS.md`, `ROADMAP.md`.

**Behavior.** Yêu cầu gốc, nguyên văn: *"thay đổi logo , đổi thành phiên bản v0.4.0 sau đó tạo bộ cài .exe"* (kèm ảnh mũ tốt nghiệp trên trang sách mở). (1) Kiểm kê trước khi sửa cho ra một sự thật khó tin: **app chưa từng có icon nào** — `build/` chỉ chứa `installer.nsh`, `build.win.icon` **không đặt**, không `new BrowserWindow` nào truyền `icon:`, `src/renderer` không còn ảnh thương hiệu vì #161–#162 gỡ có chủ đích — nên exe, bộ cài, shortcut, cửa sổ, taskbar đều vẽ **logo Electron** và không một check nào đỏ vì điều đó. #185 vì thế là mở một đường ống asset mới, không phải thay một asset cũ. (2) Bốn bề mặt được nối: icon exe/bộ cài/shortcut (`build/icon.png` + `win.icon`, và `installerIcon`/`uninstallerIcon` mặc định lấy theo nó), icon cửa sổ + taskbar (`BrowserWindow.icon`), metadata phiên bản, tên artefact `${version}`. Cố ý **không** nhét logo vào trong UI — #161/#162 đã trả chỗ đó cho chữ, còn cửa sổ trình chiếu `frame:false` + `skipTaskbar:true` nên vốn không có chỗ nào cho icon. (3) `node_modules` không có `sharp`/`jimp`/`pngjs`, nên resize 1024→512→256 đi qua `System.Drawing`: `HighQualityBicubic` và **`Clear(Transparent)` trước khi vẽ** (không làm thì nền đen của bitmap mới thành quầng đen quanh logo); alpha không được tin bằng mắt — đọc **IHDR** (`colorType 6`, `bitDepth 8`) và giải **IDAT** bằng `zlib` để xác nhận pixel góc alpha 0. 512 cho builder vì `.ico` cần mục 256; 256 cho icon cửa sổ. (4) Bẫy thật của cả việc này: asset renderer chỉ vào `dist/` rồi vào bộ cài qua **danh sách tường minh** trong `scripts.build`; thiếu nó thì `tsc` không lỗi, unit test không lỗi, app chạy ngon — chỉ là icon vẫn là Electron. Cùng họ lỗi với `presentation.html` mà docstring của `build-assets.test.ts` đã ghi, nên test đó giờ soi luôn `app-icon.png` và so **byte-identical** src↔dist. (5) Phiên bản ở **bốn** chỗ, trong đó lock có **hai** trường (chỉ sửa một là lock vẫn báo 0.3.0); docs lịch sử và fixture tổng hợp **cố ý giữ 0.3** vì chúng mô tả quá khứ. (6) Đỏ **vận hành** chứ không phải đỏ app: shell ở đây có sẵn `ELECTRON_RUN_AS_NODE=1` (kế thừa từ tiến trình cha) nên `EduGame Studio.exe --remote-debugging-port=9380` **thoát mã 9** với `bad option:` — exe chạy như Node và từ chối tham số Chromium; cách chạy đúng là `env -u ELECTRON_RUN_AS_NODE`.

**Commands run.** `npm run check` 0 · `npm run build` 0 (three 732 KB) · `npx tsc -p tsconfig.json` 0 rồi `node tests/run-unit.js` **75 → 76/76** (27,0 s) · `npm run test:native` **1/1** · `npm run verify:css` **44/44** · `npm run check:renderer-globals` **928** hàm / **7.517** call site, 0 undefined · `npm run dist:win` 0 → `release/EduGame-Studio-Setup-0.4.0.exe` **92.241.504 B** (+ `.blockmap` 96.139 B, sha256 `60B4CB5B…C44CCBE2`) · metadata hai nhị phân: win-unpacked `EduGame Studio.exe` **188.815.360 B** `File=0.4.0 Product=0.4.0.0` (sha256 `A8161B32…65C41E4A`), bộ cài `File=0.4.0 Product=0.4.0` · **icon trích ra từ cả hai tệp** bằng `ExtractAssociatedIcon`: PNG **32×32 RGBA 953 B**, nhìn ảnh thì đúng là mũ tốt nghiệp trên trang sách — bằng chứng duy nhất còn chấp nhận được rằng logo nằm *trong* nhị phân chứ không chỉ trong cấu hình · `@electron/asar`: `dist/src/renderer/assets/app-icon.png` **22.183 B byte-identical** với src (sha256 `7411b0a3…`), `package.json` trong gói `0.4.0`, `main.js` có dòng `icon:` · `npm run check:offline-packaged` trên `release/win-unpacked/EduGame Studio.exe` với **profile sạch** `Temp/eg-185-gate`: **11/11 PASS** (chạy từ `file://`+asar, preload tồn tại, **0 request** ra ngoài khi chơi cả năm trò, positive control của bộ đếm xanh, minh hoạ là inline SVG).

**What remains unverified.** (1) **Chưa chạy installer** — không cài phần mềm lên máy này — nên icon shortcut Start Menu/Desktop và icon của **bộ gỡ cài đặt** sau khi cài chưa được nhìn thấy bằng mắt; mới chứng minh được icon nằm trong nhị phân. (2) Ảnh chụp CDP chỉ bắt nội dung web, không bắt native chrome, nên **taskbar và thanh tiêu đề thật** chưa có ảnh; đường giải quyết asset đã chứng minh giống nhau giữa dev và gói, nhưng chưa chụp cửa sổ `npm start`. (3) Các mục `.ico` 16/48/64/128/256 do builder tự sinh chưa xem từng cái — mới chỉ mục 32×32 trích ra. (4) Bộ cài được build **trước** khi hai file test của #185 ra đời; app code như nhau nên không dựng lại, nhưng nghĩa là `0.4.0.exe` hiện tại không chứa `brand-assets.test.js`. (5) Nợ #182–#184 giữ nguyên, không cái nào #185 trả: local chưa chạy llama.cpp, cloud mới đi mock loopback, trần trích dẫn 3200, không streaming, lịch sử 6 × 700 ký tự, chỉ dạng arena, `confirm()` native, chưa test binary thật, chưa đo **1366×768 thật** (lần thứ **chín**), `ui-draft-guard-check` **7/8**.

**Next recommended task.** (1) Chạy `EduGame-Studio-Setup-0.4.0.exe` trên **máy thử** (hoặc máy giáo viên pilot) rồi xác nhận bằng mắt: icon bộ cài, shortcut, taskbar, mục "Ứng dụng" — trả nốt nợ (1)–(2) và cũng là lần đầu món nợ "chưa chạy bản đóng gói" của nhiều đời được trả trọn. (2) Nếu muốn logo xuất hiện *trong* ứng dụng (màn chờ, trang Cài đặt, tệp `.egame`) thì phải hỏi lại chủ dự án vì nó chạm quyết định #161/#162. (3) Vẫn là việc đáng làm nhất cho chất lượng thật: một tiết học **1366×768** trên hai cột trang Giáo án.


