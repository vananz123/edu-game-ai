# Trạng thái dự án

Bàn giao mới nhất nằm ngay trong file này (3 mục gần nhất). Các bàn giao cũ được lưu ở
`docs/handoff/status/` — mỗi ngày một file, nối thêm vào cuối file của ngày đó khi cần.
Quy ước: sau mỗi việc, chèn bàn giao mới ngay dưới tiêu đề "Bàn giao gần nhất"; nếu quá 3 mục,
chuyển mục cũ nhất vào file lưu trữ đúng ngày của nó và cập nhật mục lục.

## Mục lục bàn giao

### 2026-11-01 — [docs/handoff/status/2026-11-01.md](handoff/status/2026-11-01.md)
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

## Handoff - `color-scheme` khoá theo `[data-theme]`: control native hết vẽ sáng trong theme tối (2026-11-01, DECISIONS #166)

**Files changed.**
- `src/renderer/styles/base.css`: hai rule mới **trong `@layer base`**, ngay sau khối alias `:root` — `:root { color-scheme: light; }` và `:root[data-theme="dark"] { color-scheme: dark; }`, kèm comment ghi lý do specificity. Không sửa `app.css`, không `!important`, không bỏ rule ra ngoài layer.
- `src/renderer/styles/shell.css`: một rule dịch màu cho **cả tám chuỗi `<select>` mà `components.css` ghim màu** — `[data-theme="dark"] .select, … .field select, … .editor-art-buttons select, … .wizard-art-pick select, … .treasure-stage-body select, … .race-team-row select, … .team-turn-bar select, … .correct-select select { background: var(--panel); color: var(--text); }` — đặt cạnh rule `.form-panel` của #160. `.select` (`components.css:85`, dùng cho `#templateFilter`) là chuỗi check 22 bắt được trên trang có quét; bảy chuỗi còn lại nằm ở editor + play surface, thứ mà sweep không với tới. **Hai thuộc tính, không phải ba**: bản đầu có thêm `border-color: var(--line)` và nó **đè** `dark:border-[#334155]` của `#localModelSelect` (selector chuỗi = (0,2,1) > utility `dark:` = (0,1,0)), làm check sentinel của #160 đỏ; đã bỏ, viền trả về cho markup.
- `tests/ui/ui-dark-theme-check.js` (18 → **23** check): `walkControls()` cộng thêm population control vào mỗi lượt sweep, `sweep()` trả thêm `scheme` của `:root`; ba check mới (color-scheme lật theo theme · census không rỗng và thật sự có control UA-vẽ · không còn mực tối trên nền UA); **check thứ tư** do phát hiện popup `<option>` mới là mặt hỏng thật — `walkPopupInk()` quét mọi `option` con của `select` đang visible, đọc `colorScheme` *của chính option* (property kế thừa) và mực của nó, đòi mực nằm ngược phía scheme; **check thứ năm** vì bảy chuỗi `select` ghim màu nằm ngoài các trang sweep — gate dựng một host tổng hợp, đo rồi xoá trong cùng khối đồng bộ nên dân số tương phản 263 của #164/#165 không đổi. Host dựng từ **markup thật**, không từ tên class: `.race-team-row` được tách thành `[data-team-id]` và `[data-cell-row]` (đúng hai dạng mà `features/editor/race.ts:33/:45` sinh ra), tổng cộng **9** dòng, và check 23 đếm theo sig để một chuỗi bị rơi đọc thành đỏ thay vì thành thiếu; docstring thêm đoạn #166.
- `tests/manual/verify-css.js` (28 → **32** expectation): ghim `color-scheme:light` trên `:root`, `:root[data-theme=dark]{color-scheme:dark}` và hai ghim cho họ select **sống sau minify** —Tailwind gộp rule light vào đúng khối alias nên regex bắt theo hình dạng output; ba expectation component-class phải dùng `[,{]` sau selector vì minifier **gộp mọi khối có declaration giống hệt nhau thành một danh sách selector** (rule mới bị gộp luôn với `.form-panel`).
- Không đổi: mọi file markup; `accent-color: var(--purple)` của checkbox cây wizard (`wizard.css:469`); scrollbar (`components.css:154-168` đã khai báo `::-webkit-scrollbar*` đầy đủ kèm thumb dark riêng); bốn thanh chọn của #164; chip của #165; palette sáng.

**Behavior.** `applyTheme('dark')` giờ lật được cả phần Chromium **tự vẽ** — checkbox và popup `<select>` — thứ mà #160 (`dark:` utility) và #164 (bảng dịch màu) đều với tới không nổi. Đo trên `:root`: `{"light":"light","dark":"light"}` → `{"light":"light","dark":"dark"}`. Chẩn đoán cũ ("chưa khai báo `color-scheme`") sai một nửa: app có khai báo, daisyUI ghim nó vào `light` qua `:where(:root)` **trong cùng `@layer base`** (specificity 0), nên một rule `:root[data-theme="dark"]` (0,2,0) cùng layer thắng mà không cần vũ khí — ngược hẳn #164, nơi đối thủ là `shell.css` unlayered + `!important`. 15/17 control mỗi theme do app vẽ nền **không** bị đụng tới vì nền tường minh outrank `color-scheme`; đó chính là lý do phạm vi của một property toàn tài liệu lại an toàn. Thứ thật sự hỏng lại nằm **một cấp dưới bảng kiểm kê**: popup của `<select>` — danh sách `<option>` Chromium tự vẽ, `walkControls()` không quét (selector chỉ có `select, input[type=…], textarea`), và grep xác nhận **không stylesheet nào** đặt màu cho `<option>` (`base.css:62` chỉ reset `margin/padding`). Nền popup do đó là UA, còn mực *kế thừa từ select* — mà select thì đã mang mực sáng từ #160/#164 — nên trước bản sửa, nhánh dark vẽ **mực sáng trên popup nền sáng**, gần như vô hình. Hai rule này vá đúng chỗ đó mà không cần thêm dòng CSS nào cho `<option>`; bài học cho đợt sau: census control phải hỏi thêm "control này mở ra bề mặt UA nào không". Check 22 vừa chạy đã bắt được một hỏng thật nằm sau lỗ mù đó: `.select` — component class ở `components.css:85`, dùng đúng một lần cho `#templateFilter` — ghim `background:#fff; color:#5d6679` nên ở dark nó vẫn là một ô trắng (`rgb(255, 255, 255)`), và vì `<option>` không được stylesheet nào đặt màu, mực `#5d6679` (luminance 0,131) chảy thẳng vào popup nền dark mà `color-scheme` vừa lật: **chữ gần như biến mất trên chính popup mà #166 làm cho nền tối**. Probe trên các trang được quét: 46 option/theme, 12 con xấu, tất cả thuộc đúng `.select`. Nhưng `.select` chỉ là **một trong tám** chuỗi mà `grep select components.css` vạch ra, và bảy chuỗi kia (`field`, `editor-art-buttons`, `wizard-art-pick`, `treasure-stage-body`, `race-team-row`, `team-turn-bar`, `correct-select`) nằm ở editor + play surface — nơi gate không tới. Đo bằng node tổng hợp trước khi sửa: `.field select` mực `rgb(38, 48, 71)` (luminance **0,030**) trên nền `rgb(255, 255, 255)`, `.editor-art-buttons`/`.wizard-art-pick` `0,106`, `.correct-select` `0,161` và **cả ô của nó là nền UA**. Nói cách khác, nếu dừng ở `.select`, bản `color-scheme` chỉ **đổi bên** chứ không sửa: popup scheme-light + mực sáng (cũ) → popup scheme-dark + mực tối (mới). Một rule `shell.css` phủ cả tám chuỗi, **nền + mực** (viền để markup quyết định — xem Files changed); đo lại: **0/8** còn nguy hiểm, toàn bộ `box=rgb(23, 27, 46)` (= `--panel`) và `ink=rgb(232, 234, 242)` (= `--text`, luminance **0,824**), light không đổi một byte nào. Chỉ `select` được dịch chứ không `input`/`textarea` dù ba thứ chung một rule trong `components.css`: ô nhập chữ tối trên nền trắng vẫn *đọc được* (chỉ xấu), popup tối trên mực tối thì *mất chữ* — bản này sửa cái sau, cái trước để ngỏ có chủ đích.

**Commands run.** `npm run check` 0 · `npm run check:renderer-globals` 0 undefined (55/56 script, 774 hàm, 6.434 call site) · `npx tsc -p tsconfig.json` 0 + `npm run build:css` 0 · `npm run verify:css` **32/32** · `node tests/run-unit.js` **68/68**. Electron thật, instance riêng + profile sạch `egame-166gate2` (cổng 9361, đã `Page.reload {ignoreCache:true}` và xác minh **671** rule top-level / **2194** đệ quy + `body rgb(244, 246, 251)` trước khi chạy): `ui-dark-theme-check` **23/23** — `light → light / dark → dark`, census `24 light / 24 dark controls, 9 UA-painted (checkbox)`, `worst ink on a UA field 0.824`, sentinel #160 `#localModelSelect → rgb(51, 65, 85)` dark / `rgb(203, 213, 225)` light, check 22 `109 light / 109 dark options, all UA-painted, ink 0.161 dark-side / 0.824 light-side`, check 23 `63 synthetic selects measured in both themes, worst dark plate 0.012`, và **không số nào của #164/#165 dịch chuyển**: `0 of 263 (worst 5.71, median 11.47)`, `dark 6 chips worst 6.69 | light 6 chips worst 5.62`, `light 28 of 263 (worst 2.86)`, bốn bar `10,56/5,28/5,19/5,28` trên strip `rgb(42, 50, 75)`, chip plate `rgb(34, 37, 49)`/`rgb(41, 45, 62)`, light bars `rgb(248, 247, 255)` worst control 5,02:1, fixture `seeded 4 → còn lại 0`. Probe kiểm kê chạy lại trên instance chưa qua gate (cổng 9353): dân số **vẫn 17/17**, vẫn **0** cặp nguy hiểm. Probe bề mặt UA mà control mở ra (`tests` không lưu file này), instance 9357, 10 `<select>` trên 5 trang × 2 theme: `root color-scheme {"light":"light","dark":"dark"}`, `optCs` của option lật theo theme, mực kế thừa `rgb(30, 41, 59)` (light) / `rgb(248, 250, 252)` (dark), `optBg rgba(0, 0, 0, 0)` ở **cả hai** — popup không có nền nào khác ngoài nền UA. Sibling form-heavy trên instance **riêng chưa từng đụng gate**: `ui-race-editor-check` **All passed** · `ui-settings-sections-check` **All passed** · `ui-item-assets-editor-check` **29/29** (cổng 9357, profile `/tmp/egame-166b`) rồi `ui-wizard-structure-check` **14/14** · `ui-project-selection-check` **17/17** · `ui-card-menu-check` **12/12** (cổng 9365, profile `egame-166c` — ba check đầu của lô 9357 chết giữa chừng vì instance Electron nền bị gom lúc 17:5x, hai dòng cuối của một run như vậy là JSON error chứ không phải `FAIL`, nên không được đọc `tail` rồi kết luận xanh). Hai assertion rAF đỏ ở #165 xanh lại, và lần này **có probe kèm theo**: `{visibility:"visible", focus:false, rafTicks:1, timerTicks:10}` — tức timer đã chạy nhanh trở lại nhưng rAF vẫn ~1 tick/giây. Run chốt của gate và các run anh em ở trên là **sau** bản CSS chót (rule họ select bỏ `border-color`, số rule top-level `670 → 671`). Hai run **21/23** trước đó là đỏ thật do chính bản sửa/probe: `border-color: var(--line)` đè `dark:border-[#334155]` của sentinel #160, và host tổng hợp dựng `.race-team-row` trần mà app không vẽ. Ảnh: `tests/ui/shots/166-dark-{settings,library,create,my-projects}.png` + `166-dark-modal-help.png` (thư mục gitignore) — checkbox UA-vẽ đã tối, `.select`/`.field select` là tấm nền tối mực sáng, và `.modal` thì `<h2>` + mọi `<strong>` gần vô hình trên nền trắng trong khi `<p>` vẫn đọc được. Run đỏ cần ghi lại để lần sau không mất thì giờ: instance 9361 (profile sạch, khởi động **đúng lúc** `build:css` đang ghi `dist/src/renderer/styles/`) trả **8 đỏ** với số vô lý — strip light `rgba(0, 0, 0, 0)`, `176 of 263` offender worst `1`, `hint text` light `rgb(0, 0, 0)`. Probe khác biệt cho nguyên nhân: `document.styleSheets[0].cssRules.length` **14** trên instance đó so với **670** trên instance lành, `body` background `rgba(0, 0, 0, 0)` thay vì `rgb(244, 246, 251)` — renderer đọc file **giữa lúc đang ghi**, tức trang gần như chưa có style. `Page.reload {ignoreCache:true}` là đủ, không cần restart; từ giờ nên đếm rule + đọc `body` background trước khi tin một run nào.

**Chưa xác minh.** Ảnh chụp **đã có** ở cuối đợt (công thức: `Emulation.setDeviceMetricsOverride` 1280×800 + thử `Page.captureScreenshot` tới 3–4 lần với timeout 45 s, vì vài lần đầu trên compositor lạnh luôn timeout) — nên phần "nhìn bằng mắt" của #166 không còn trắng: checkbox, `.select`, `.field select`, thanh chọn và chip đều đúng như computed style nói. **Còn lại đúng một tầng chưa ai thấy: chính cái popup `<select>`** — `optBg` chỉ đo được là `rgba(0, 0, 0, 0)` (= nền UA giữ), màu Chromium thật sự vẽ khi bấm vào select chưa lấy mẫu pixel, và popup là cửa sổ native nằm ngoài tài liệu nên ảnh trang không bao giờ chứa nó. `input`/`textarea` của `.field` vẫn là ô trắng mực tối trong dark (chung rule với `.field select` ở `components.css:95`) — cố ý để lại vì chúng đọc được; các border `#e4e7f0` của họ `.field`/`.treasure-stage-body`/`.race-team-row`/`.team-turn-bar` cũng chưa dịch (nay thấy được trong ảnh: viền sáng trên nền tối, không hỏng đọc). Phase B của `ui-item-assets-editor-check` **đã chạy** (29/29, hai PNG thật) nên không còn là khoảng trống. `components.css:154-168` nói scrollbar đã app-vẽ, nhưng chưa đo lại xem `color-scheme` có đổi phần UA còn sót nào của scrollbar không. Nhóm 28 offender sáng và ring chọn thẻ `#6258e8` vẫn nguyên như #165. **Đảo tối cưỡng bức** (`.race-team-row`/`.race-turn` `components.css:329/331`, `.editor-race-preview[data-preview-theme="play"]` `:341`) vẫn không khai báo `color-scheme:dark` cho riêng mình: probe của check 23 đo node đặt trong island có mực `rgb(232, 235, 247)` trên scheme `light`. Không sửa vì nền của chúng *tự tối* nên mắt vẫn đọc được, vì một dòng `color-scheme` ở đó chạm thẳng màn chơi đang chạy, và vì markup thật không sinh ra tổ hợp đó. Chưa chạy installer đóng gói.

**Next task.** (1) **`.modal` là việc dark tiếp theo, và nay đã đủ bằng chứng để làm**: `components.css:101` ghim `background:#fff`, grep không ra rule dark nào cho `.modal`, node tổng hợp đo trong dark `bg rgb(255, 255, 255)` (luminance **1**) với mực kế thừa `rgb(232, 234, 242)` (**0,824**) — **~1,2:1**. Ảnh `166-dark-modal-help.png` chỉ rõ hơn con số: hỏng **có chọn lọc** — `<h2>` và mọi `<strong>` nhãn bước gần vô hình (kế thừa `--text` sáng), còn các `<p>` bên dưới vẫn đọc được vì mang mực tối riêng. Nước sửa đúng là cho tấm nền một cặp token (nền + mực kế thừa) như `.form-panel` của #160, không phải vá từng phần tử; `.empty-state` (`:86`) cùng trạng thái (nền trắng, mực ghim `#929bad` = 0,326). (2) Họ `select` ghim màu đã đóng ở #166, nhưng **cùng kiểu ghim đó vẫn còn cho `input`/`textarea`** (`.field`, `.treasure-stage-body`, `.race-team-row`) và cho các border `#e4e7f0` của chính họ đó — trong dark chúng là ô trắng mực tối: đọc được nhưng lệch bảng màu (trong ảnh thấy rõ). Chọn một: dịch nốt bảng `.field`, hoặc bỏ kiểu ghim màu tường minh trong `components.css` để theme tối mặc định theo token. Việc của bảng dịch màu, không phải của `color-scheme`. Lưu ý #166: đừng thêm `border-color` vào một rule chuỗi class nếu markup đã mang `dark:border-*` — rule (0,2,1) sẽ đè utility (0,1,0). (2b) Hai **đảo sáng đọc được** mà ảnh vừa lộ ra, chưa có trong bất kỳ ghi chú nào: ô sidebar đang chọn (lavender nhạt + mực tối) và các `.btn` trắng ở đầu trang Settings/Create — nợ palette, không nợ a11y, cần quyết định của người dùng. (3) Palette ba pill trạng thái để đóng 28 offender sáng (cần quyết định của người dùng). (4) `ui-wizard-structure-check` **14/14** hai đợt liên tiếp; đỏ rAF của #165 đã quy được nguyên nhân bằng probe (`rafTicks` ~1/giây khi `focus:false`) nên không còn là ẩn số — đổi kênh hẹn trong `step-structure.ts:204/:207` vẫn đụng hành vi focus thật, chưa nên làm. (5) Roadmap `Packaged check` vẫn cần máy sạch.

---

## Handoff - Năm badge bước cuối cùng lên AA ở cả hai theme (2026-11-01, DECISIONS #165)

**Files changed.**
- `src/renderer/pages/create.ts` (4 dòng, `:145/152/159/166`) và `src/renderer/features/wizard/step-input.ts` (1 dòng, `:69`): mực của năm con chip đổi từ `text-[#6366f1] dark:text-[#818cf8]` sang `text-[#4f46e5] dark:text-[#a5b4fc]` — cặp đã dùng ở `step-input.ts:50/:176` và `pages/settings.ts`. **Không có file CSS nào đổi**: `git diff --stat` = 3 file (2 template + 1 check), `npx tsc` + `build:css` chỉ để tái sinh `dist/`.
- `tests/ui/ui-dark-theme-check.js` (16 → **18** check): bỏ dung sai `weak.length <= 8` thành `=== 0`; row của `walk()` thêm `bg: rgb(...)` (nền *đã giải*) để chi tiết FAIL tái hiện được phép tính; check mới "every step chip clears 4.5:1 in BOTH themes" (lọc theo mặt `dark:bg-[#262c55]`, 6 phần tử); check mới "light mode keeps its known sub-4.5:1 set from growing" (`<= 32`); docstring đầu file viết lại hai gạch đầu dòng. `median()` phải khai báo trước vì TDZ.
- Không đổi: mặt nền `#eef2ff` / `#262c55` (token dùng chung, đổi là kéo theo thẻ khác và vô hiệu phép đo #164), `shell.css`, bốn thanh chọn của #164, biến thể `dark:` của #160, markup sáng còn lại của hai trang.

**Behavior.** Dark mode không còn phần tử `dark:` nào dưới 4,5:1: **5/263 → 0/263**, worst **4,47 → 5,71**, median giữ **11,47**. Năm chip đạt **6,69:1** (tối) và **5,62:1** (sáng). Con số sáng là phát hiện mới, không phải cái đã biết: `#6366f1` trên `#eef2ff` = **3,99:1**, *tệ hơn* bên tối, và chưa từng được ghi vì gate đi hết hai theme nhưng **chỉ đọc nhánh `dark`** — nhánh `light` thu thập rồi bỏ đi. Trần toán học quyết định hướng sửa: `#6366f1` đặt trên trắng tinh đã ra 4,47:1, nên mực đó không thể đạt AA trên bất kỳ mặt trắng-nhạt nào → buộc đổi **mực**, không có nước đổi nền.
- **Khác #164 ở đúng một điểm kỹ thuật**: grep xác nhận `#6366f1`/`#818cf8`/`#4f46e5`/`#a5b4fc` **không** có trong bảng dịch `shell.css`, nên `:where()` của biến thể `dark:` không gặp đối thủ và utility thắng outright — một chuỗi class là xong, không cần rule `!important` nào.
- **28 phần tử sub-4,5:1 bên sáng để lại, có chủ đích**: pill trạng thái ngữ nghĩa (`#d97706`/`#fef3c7` = 2,86:1, `#16a34a`/`#effaf5` = 3,09:1, `#788196`/`#f5f6fa` = 3,61:1) + 9 link indigo-on-white (= 4,47:1). Đóng nhóm này cần **2–3 giá trị mực chưa tồn tại ở đâu trong codebase** cho bộ pill vàng/xanh/đỏ → quyết định palette, không phải phép đo. Gate ghim thành trần `<= 32` chứ không assert sạch; bản đầu của assertion là `weakLight.length === 0` và nó **đỏ chính vì 28 offender đó** — độ đỏ đó là cách tìm ra nhóm này.

**Commands run.** `npm run check` 0 · `npm run check:renderer-globals` 0 undefined (55/56 script, 774 hàm, 6.434 call site) · `npx tsc -p tsconfig.json` 0 + `npm run build:css` 0 · `npm run verify:css` **28/28** (không thêm expectation mới — bằng chứng phạm vi thuần markup: `#4f46e5` ×7, `#a5b4fc` ×6, `#eef2ff` ×2, `#262c55` ×2 đã có sẵn trong `dist/src/renderer/styles/app.css`) · `node tests/run-unit.js` **68/68** (25,1s). Electron thật, instance riêng + profile sạch `/tmp/egame-165gate` (cổng 9349): `ui-dark-theme-check` **18/18** — `0 of 263 (worst 5.71, median 11.47)`, `dark 6 chips worst 6.69 | light 6 chips worst 5.62`, `light 28 of 263 (worst 2.86)`; bốn thanh chọn của #164 giữ nguyên số (`10,56/5,28/5,19/5,28`, strip `rgb(42, 50, 75)`, light worst control 5,02:1); fixture `seeded 4 → còn lại 0`. Anh em, instance **riêng** + profile sạch (cổng 9351): `ui-chrome-icons-check` **15/15** · `ui-classifier-outline-check` **14/15** (đỏ còn lại = cần model local, đúng baseline #161) · `ui-wizard-structure-check` **13/14** (đỏ còn lại do `requestAnimationFrame` bị đóng băng khi trang ẩn — probe `{visibility:"hidden", rafCallbacks:0, timerTicks:2}`; xem phần Chưa xác minh).

**Chưa xác minh.** Không có ảnh chụp, chưa review bằng mắt: cửa sổ vẫn bị che nên `Page.captureScreenshot` không trả lời — 5,62/6,69 là tương phản, chưa phải phán đoán "đẹp". Anh em chạy trên instance **riêng, profile sạch** (cổng 9351): `ui-chrome-icons-check` **15/15** và `ui-classifier-outline-check` **14/15** — check sau khớp đúng baseline #161 (1 đỏ là "the safety gate explains itself", cần model local mà profile sạch không có) và nó dựng lại đúng bước 1 của file tôi sửa, nên phần badge/thuật đoán nguyên lành. `ui-wizard-structure-check` **13/14**, một đỏ là "the render keeps the keyboard focus on the ticked row" — **đã chứng minh là môi trường bằng cơ chế, không phải suy đoán**: probe trên cùng instance đo `visibilityState:"hidden"` + **`rafCallbacks: 0` trong 1,2 giây**, trong khi `step-structure.ts:204/:207` hẹn `restoreFocus()` bằng `requestAnimationFrame`, và Chromium không chạy rAF cho trang ẩn. File hiện thực hiện việc đó không nằm trong diff của tôi. **Hệ quả dài hạn**: mọi assertion dựa vào rAF đều không thể xanh trên máy này lúc cửa sổ bị che — và chiều ngược cũng thật, `ui-chrome-icons-check` từng báo 1 đỏ chỉ vì chạy *sau* gate trên cùng instance (gate lật theme toàn app + seed/xoá dòng); lần chạy sạch ngay sau đó cho 15/15. Ring chọn thẻ `#6258e8` vẫn chưa có gate. Checkbox native vẫn sáng vì chưa khai báo `color-scheme`. `ui-draft-guard-check` **không chạy** đợt này (baseline #161 đã 7/8 vì cần nhà cung cấp AI). Chưa chạy installer đóng gói.

**Next task.** (1) Làm cho các assertion dựa-vào-rAF sống được trong môi trường này: hoặc cho `ui-wizard-structure-check` tự đưa cửa sổ lên trước khi đo, hoặc đổi `step-structure.ts:204/:207` sang kênh không bị đóng băng khi trang ẩn — cần quyết định vì nó đụng hành vi focus thật, không chỉ test. (2) Nếu muốn đóng nốt AA bên sáng: chọn palette cho ba pill trạng thái (vàng/xanh/xám) — cần quyết định của người dùng, đã ghim trần `<= 32` để không âm thầm xấu thêm. (3) `color-scheme` theo `[data-theme]` cho control native (nợ #164). (4) Roadmap `Packaged check` vẫn cần máy sạch.

---

## Handoff - Dark mode cho bốn thanh chọn hàng loạt, sửa bằng bảng dịch màu (2026-11-01, DECISIONS #164)

**Files changed.**
- `src/renderer/styles/shell.css`: ba mục mới trong bảng dịch `[data-theme="dark"]` (`#4c4680` → `var(--text)`, `#5b5680` và `#6b6690` → `var(--muted)`), một rule mặt strip `#2a324b !important` khoá theo bốn mốc `[data-lesson|library|project|session]-selection-bar`, một rule `bg-white/[90%]` → `rgba(255, 255, 255, .08)` cho hộp tick trên thẻ. Hai rule cuối nằm **SAU** các dòng `bg-[#f8f7ff]` / `.bg-white` vì cùng `(0,2,0)` + `!important` — thứ tự nguồn quyết định.
- `tests/ui/ui-dark-theme-check.js` (**mở rộng**, 9 → 16 check): `measureBars()` đo thẳng bốn thanh (chúng không mang class `dark:` nào nên `walk()` cũ mù), seeding một dòng tổng hợp mỗi store vì bar chỉ render khi có gì để tick rồi tự xoá, `pixelOf()` raster qua canvas 1×1 (Chromium serialize `bg-white/[90%]` thành `oklab(...)`, regex `rgb()` đọc ra `null` → phép đo "ô trắng" trước đó pass rỗng), guard setup onboarding đổi 40 vòng poll thành deadline 4s.
- `tests/manual/verify-css.js`: 24 → **28** expectation (mặt strip, lớp mờ hộp tick, hai danh sách mực).
- Không đổi: markup bốn thanh (bốn file `pages/*` giữ nguyên byte), IPC `project:delete-many` / `library:delete-*`, schema SQLite, `.egame`, biến thể `dark:` của #160, mọi rule tối khác.

**Behavior.** Ở theme tối, bốn thanh chọn hàng loạt (giáo án #122, lượt chơi #123, trò chơi #154, dự án #163) đã đọc được và vẫn là một dải riêng: nhãn "Chọn tất cả…" 10,56:1 (trước 2,02), count và "Bỏ chọn" 5,28:1 (trước 2,50 / 3,19), nút đỏ "Xoá đã chọn" giữ 5,19:1, strip `rgb(42, 50, 75)` tách khỏi thẻ `rgb(23, 27, 46)` thay vì cùng màu, hộp tick trộn ra `rgb(34, 37, 49)` / `rgb(41, 45, 62)` thay vì một ô trắng 25×25. Light mode không đổi: 4 bar vẫn `rgb(248, 247, 255)`, control yếu nhất 5,02:1 — đo lại mới biết phỏng đoán "`#6b6690` hụt AA bên sáng (4,49)" là sai, nên không có giá trị sáng nào bị sửa.

**Commands run.** `npm run check` 0 · `npm run check:renderer-globals` 0 undefined (55/56 script, 774 hàm, 6.434 call site) · `npm run build` 0 · `npm run verify:css` **28/28** · `node tests/run-unit.js` **68/68** (26,9s). Electron thật (profile sạch, cổng 9349): `ui-dark-theme-check` **16/16** — số "trước khi sửa" lấy ở lần chạy đầu trên cùng build chưa CSS: `2,02 / 2,50 / 3,19`, strip `rgb(23, 27, 46)` bằng đúng thẻ ở 3/4 trang, chip `[255, 255, 255, 230]`; không hồi quy ở bốn trang anh em chạy lần lượt trên cùng instance: `ui-project-selection-check`, `ui-library-paging-check`, `ui-lessons-paging-check`, `ui-results-paging-check`, `ui-card-menu-check` — tất cả pass.

**Chưa xác minh.** Không có ảnh chụp và chưa review bằng mắt: cửa sổ app bị che nên `Page.captureScreenshot` (kể cả `fromSurface`) không trả lời — mới có tương phản và mặt nền, chưa có phán đoán thẩm mỹ. Checkbox native vẫn vẽ sáng trong toàn app vì app chưa khai báo `color-scheme` (kể cả `.wizard-tree-node`) — không phải do #164, để nguyên vì phạm vi rộng. Ring chọn thẻ `#6258e8` mới tính tay ~3,3:1, chưa có gate. Năm badge bước 4,47:1 của #160 vẫn còn. Chưa chạy installer đóng gói.

**Next task.** (1) Đặt `color-scheme` theo `[data-theme]` để control native (checkbox, `select`, scrollbar) không còn sáng trong theme tối — cần chạy lại các check form vì nó đổi cách vẽ ở nhiều trang. (2) Gate luôn ring chọn thẻ nếu muốn đóng nốt nhóm màu của bốn trang này. (3) Roadmap `Packaged check` vẫn cần máy sạch.





