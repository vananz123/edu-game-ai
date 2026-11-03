# Trạng thái dự án

Bàn giao mới nhất nằm ngay trong file này (3 mục gần nhất). Các bàn giao cũ được lưu ở
`docs/handoff/status/` — mỗi ngày một file, nối thêm vào cuối file của ngày đó khi cần.
Quy ước: sau mỗi việc, chèn bàn giao mới ngay dưới tiêu đề "Bàn giao gần nhất"; nếu quá 3 mục,
chuyển mục cũ nhất vào file lưu trữ đúng ngày của nó và cập nhật mục lục.

## Mục lục bàn giao

### 2026-11-03
- Chòm sao tri thức: nhãn dài treo đúng trên sao + hàng dưới là lưới 12 cột có số trên sao (#174); màn kết quả **là** bầu trời 3D thay vì ảnh tĩnh (#175); sửa phép chiếu DOM phải đo theo canvas — nhãn từng lệch sao thật 34–56 px mà gate vẫn xanh (#176)
- `fitConnectionGraph` đóng khung theo **hộp bao của hình** thay vì hộp vẽ: chòm sao về giữa khung (từng lệch tới 164 px), kèm trần phóng to 1,4× để mảnh 2 sao không thành hai vòng tròn (#177)

### 2026-11-02 — #171–#172 đã lưu ở [docs/handoff/status/2026-11-02.md](handoff/status/2026-11-02.md)
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

## Handoff — Chòm sao nằm **giữa** khung: fit theo hộp bao của hình + trần phóng to (2026-11-03, DECISIONS #177)

**Files changed.** Sửa: `src/renderer/features/games/three-stage.ts` (mới `connectionFigureBox(graph)` — hộp bao tính cả **thân** sao; `CONSTELLATION_FIT_MAX_ENLARGE = 1.4`; `fitConnectionGraph()` fit theo hình thay vì theo `CONNECTION_WORLD` và dời `graph.group.position = -scale × tâm hình`; tài liệu comment cho cả ba), `tests/ui/ui-constellation-check.js` (71 → **80** check: đo `FRAMING` ở board 10 / 5 / 2 sao — tâm, `fill`, lề mỗi cạnh, `hang`, trần phóng to — và một check tâm cho màn kết quả), `docs/DECISIONS.md` #177, `docs/STATUS.md`, `docs/ROADMAP.md`, `docs/handoff/status/2026-11-02.md` (nhận bàn giao #172).

**Behavior.** Yêu cầu gốc, nguyên văn: *"sửa fitConnectionGraph cho chòm nằm giữa khung"*. `CONNECTION_WORLD` là hộp mà template được **vẽ vào**, không phải hình: Gấu Lớn trải 900 × 430 của hộp 1000 × 620 và tâm mười sao lệch 55 đơn vị, năm sao đầu Orion lệch 80 — nên mọi board thừa hưởng lề của template (đo được: orion 5 sao lệch −59 px, lyra 2 sao lệch **164 px ngang / 113 px dọc**). Nay fit theo **hộp bao của hình** (cả `radius + tube` để sao biên không bị cắt thân) và dời tâm hình về gốc world bằng `group.position = -scale × (cx, cy)` — nhân `scale` là bắt buộc vì `group.position` là offset chưa scale. Hai cần vẫn phân việc: `frameConnectionBoard()` hạ **gốc world** vào tâm khung, `fitConnectionGraph()` đưa **tâm hình** về gốc đó, không cái nào trả tiền hai lần. Trần 1,4 × fit-theo-hộp giữ mảnh 2–5 sao không bị phóng thành "hai vòng tròn" (đo: 1,26×). Kết quả ở 1366×768: orion 10 (0,−14)→(−8,−2) và hình to lên 502→593 px, orion 5 →(0,−1), orion 2 →(0,−2), ursa 10 (7,−43)→(0,−5), cygnus 10 →(0,1), lyra 2 →(0,−2); màn kết quả off (−6,−1), lề [78, 90, 77, 78]. Hệ quả ngoài dự kiến: board orion 10 sao ở 1366 treo **10/10** nhãn (trước 9/10), ở 1920 lên 9/1 (trước 8/2), khung cao 436→489 px. Một báo động giả đã loại trừ: tia "trượt cả năm sao" là do instance tích bảy handle và `mesh.matrixWorld` cũ (`[0,0,0]`), không phải do sửa — instance sạch thì `misses: []`.

**Commands run.** `npm run check` 0 · `npm run build` 0 · `node tests/run-unit.js` **74/74** (26,8 s) · `npm run check:renderer-globals` 0 undefined (883 hàm / 7.237 call site) · `npm run verify:css` **32/32** · trên Electron thật (instance sạch cổng 9390, guard stylesheet `{rules: 2355, body: rgb(244,246,251)}`): `ui-constellation-check` **80/80** — chạy **hai lần trong cùng một phiên** · `ui-connection-mode-check` **7/7** · `ui-matching-finish-check` **22/22** · `ui-three-game-check-4games` **41/41** · `ui-presentation-check` **60/60**.

**What remains unverified.** **Không có ảnh chụp lần này**: `Page.captureScreenshot` hết timeout 4 × 45 s rồi 1 × 18 s, trả "NO IMAGE (window not composited)" — mọi số đo của #177 là hình học, chưa phải pixel, và "giữa khung" theo mắt giáo viên chưa ai duyệt. Chưa chạy trên máy chiếu thật (toàn bộ là emulation Electron 33). Chưa đo FPS khi thế giới kết quả dựng lại ngay sau thế giới chơi. Lề ≥ 20 px mới chứng minh ở **thân sao**, chưa tính quầng bloom vẽ xa hơn.

**Next recommended task.** (1) Một tiết thật ở 1366×768: nhìn bằng mắt chòm đã đứng giữa khung chưa và nhãn có sát sao không (đây là lần thứ ba đề nghị việc này — nó là gate thật duy nhất còn thiếu). (2) Nếu muốn ảnh nằm giữa theo **quầng sáng** chứ không theo thân sao, đưa `bloom`/halo vào `connectionFigureBox`. (3) Nợ cũ vẫn treo: `ui-three-game-check-4games` chạy nhiều lần trong một phiên, và cửa sổ trình chiếu vẫn khung tĩnh (#168 mục 4).

## Handoff — Nhãn treo đúng sao, hàng dưới là lưới, màn kết quả là bầu trời 3D (2026-11-03, DECISIONS #174–#176)

**Files changed.** Sửa: `src/renderer/features/games/constellation.ts` (#174: `constellationLabelWidthPx/Side/CardFits`, `CONSTELLATION_LABEL_LANE = 12` + `CONSTELLATION_LABEL_MAX_PX = 190`, chia nhãn–dải, badge số `constellationMarkHotspot`, `constellationRowSlots` + `slotStyle` cho lưới 12 cột, `constellationReframeIfNeeded`; hôm nay xoá thêm một `host.innerHTML` bị ghi đè hai lần), `src/renderer/features/games/three-stage.ts` (#175: `frameConnectionBoard()` nâng camera cả trục X; #176: `connectionPixelBox()` + `updateStarAnchors()` / `updateConnectionStarPoints()` chiếu NDC theo **canvas**, % vẫn theo frame, làm tròn 3 chữ số), `src/renderer/features/games/matching.ts` (#175: `skyOnResults`, hero mang hai thuộc tính khung, `mountThreeStage()` trên màn kết quả, SVG chỉ là dự phòng), `src/renderer/features/games/connection.ts` (xoá bản sao `constellationIsShortLabel` bị shadow), `src/renderer/styles/game-constellation.css` (#174: họ `.constellation-card--hang`, `--mark`, `.constellation-card-index`, lưới hàng; #175: trả padding `.modal-body` cho màn kết quả, cao hero, mực caption; #176: nhãn treo giữ 13 px ở `max-height: 820px`), `tests/ui/ui-constellation-check.js` (52 → **71** check, thêm nhánh 3D kết quả + nhánh rời kết quả + check raycast), `docs/DECISIONS.md` #174–#176, `docs/STATUS.md`, `docs/ROADMAP.md`, `docs/handoff/status/2026-11-02.md` (mới, chứa bàn giao #171).

**Behavior.** Ba yêu cầu của giáo viên, nguyên văn: *"khi chữ khá dài thì phần chữ này bị cách xa ngôi sao…; khi chữ vượt quá và nằm ở phía dưới nó sẽ làm những chữ của những ngôi sao còn lại bị lệch và xa nhau; phần xem kết quả nên cho xem phần kết quả 3D"*. (1) Ngắn/dài giờ **đo chữ thật**, không đếm ký tự: thuật ngữ 22 ký tự ở lại trên sao, nhãn có cuống 15 px + chấm tròn kết thúc trên thân sao và không che sao. (2) Dải dưới là **lưới 12 cột**, mỗi thẻ dài chiếm tối đa 4 cột theo thứ tự trái→phải của sao nên một thẻ dài không đẩy các thẻ khác; khi hai thẻ không cùng căn được vào hai sao quá gần thì **số** nối cặp (badge trên sao = số đầu thẻ). (3) Màn kết quả của board chòm sao dựng lại **đúng thế giới 3D** vừa chơi (cùng camera, cùng `state.connectionProgress`, cạnh vẽ dần), trong một khung của chính màn đó; ảnh tĩnh chỉ còn khi máy không có WebGL. Hai lỗi bắt được nhờ ảnh chụp khi làm (3): ảnh vẽ giữa stage đè cột điểm (thiếu nâng camera X) và caption mực đêm trên trời đêm. Và một lỗi phương pháp (#176): phép chiếu DOM dùng rect của **frame** trong khi ảnh composite trên **canvas**, nên nhãn treo lệch sao thật 11–56 px ở 1366×768 và tia bắn vào điểm chiếu **trượt 3/5 sao** — gate cũ không thấy vì nó so DOM với chính hàm đặt DOM. Sau sửa: sai số 0 px, cả 5 sao đều được tia tìm ra, và năm nhãn ngắn đều treo (trước đây ba nhãn bị đày xuống dải vì các sao bị co gần nhau).

**Commands run.** `npm run build` 0 · `node tests/run-unit.js` **74/74** (26,9s) · `npm run check:renderer-globals` 0 undefined (882 hàm / 7.228 call site) · `npm run verify:css` **32/32** · trên Electron thật (instance scratch cổng 9386, dist mới): `ui-constellation-check` **71/71**, `ui-connection-mode-check` **7/7**, `ui-matching-finish-check` **22/22**, `ui-three-game-check-4games` **41/41**, `ui-presentation-check` **60/60** · ảnh chụp CDP `Page.captureScreenshot` ở 1920×1080 và 1366×768, bàn chơi + màn kết quả, cả `data-theme=light` lẫn `dark` (mực như nhau: caption `rgb(232,236,251)` ~15:1 trên trời đêm).

**What remains unverified.** Chưa chạy trên máy chiếu thật — mọi số đo là emulation trong Electron 33. Chưa đo FPS khi thế giới kết quả dựng lại ngay sau thế giới chơi. `fitConnectionGraph` vẫn đóng khung theo **gốc world** chứ không theo hộp bao của hình, nên chòm lệch tâm (Orion) nằm cao hơn tâm khung 35–64 px — chưa hỏi ý giáo viên. Tia mới chỉ chứng minh ở **tâm** sao, chưa ở biên quầng sáng. Cửa sổ trình chiếu (`presentation.html`) vẫn khung tĩnh, không 3D (#168 mục 4).

**Next recommended task.** (1) Một tiết thật ở 1366×768: nhìn bằng mắt nhãn có sát sao không, và màn kết quả 3D có cần to thêm cho cuối phòng không. (2) Nếu giáo viên muốn ảnh nằm **giữa** khung, đổi `fitConnectionGraph` sang hộp bao của hình (đã đo sẵn độ lệch 35–64 px). (3) Nợ cũ vẫn treo: `ui-three-game-check-4games` chạy nhiều lần trong một phiên.

## Handoff — Board chòm sao bỏ khung xám + khoang vũ trụ Three.js (2026-11-02 #3, DECISIONS #173)

**Files changed.** Sửa: `src/renderer/features/three-game-interaction.ts` (factory mới `(J) makeCosmos` + export trong `window.threeGame`), `src/renderer/features/games/three-stage.ts` (`buildConnectionWorld()` dựng cosmos, tắt emblem + bụi cũ, `onStep` chạy cả cosmos lẫn graph), `src/renderer/styles/game-constellation.css` (gỡ ba lớp khung qua `:has(.constellation-game-stage)` + `.is-3d`, `.modal-body` padding 0 cả ở toàn màn hình), `tests/unit/three-game-interaction.test.ts` (+3 nhóm check cosmos), `tests/ui/ui-constellation-check.js` (+7 check "the room"), `docs/DECISIONS.md` #173, `docs/STATUS.md`, `docs/ROADMAP.md`.

**Behavior.** Board "Chòm sao tri thức" không còn bất kỳ khung nào: `.modal` chuyển sang nền `rgb(3,5,13)` với viền trong suốt, thế giới Ghép cặp mất lớp nỉ + vân + viền + bo góc riêng của board, `.constellation-scene` mất gradient và vòng `1px` ôm bức hình; `.modal-body` về padding 0 nên bầu trời sát mép modal ở toàn màn hình. Bảng hai cột và bảng trí nhớ **vẫn giữ nỉ** (phạm vi khoá bằng `:has()`), và bản dự phòng không WebGL **vẫn giữ nền đêm CSS** của cảnh (khoá bằng `.is-3d`). Cosmos mới dựng trong Three.js: cầu trời `BackSide` gradient hai màu + dải sáng theo accent của thế giới, **một** `THREE.Points` 620 sao (twinkle theo `uTime`, cỡ theo device pixel), 3 dải khí cộng tính quay chậm, cả trường sao trôi 0.006 rad/s; `prefers-reduced-motion` đóng băng toàn bộ, dt kẹp 0.1 s. Đường liên kết khi kéo đúng đáp án vào sao là hành vi đã có từ #172 — #173 chỉ đo lại bằng check.

**Commands run.** `npm run check` 0 · `npm run build` 0 · `node tests/run-unit.js` **74/74** (29s) · `npm run check:renderer-globals` 0 undefined (876 hàm / 7.193 call site) · `npm run verify:css` **32/32** · trên Electron thật (cổng 9384, dist mới + `Page.reload`): `ui-constellation-check` **52/52**, `ui-connection-mode-check` **7/7**, `ui-matching-finish-check` **22/22**, `ui-three-game-check-4games` **41/41**; cổng dark chạy trên instance sạch cổng 9385: **23/23** ("All dark-theme checks passed").

**What remains unverified.** Không có ảnh chụp: `Page.captureScreenshot` trả về không có dữ liệu trên phiên này, nên "không còn khung" được xác nhận bằng computed style chứ không bằng pixel. Chưa đo FPS với 620 sao + 3 shader trên GPU tích hợp yếu, chưa thử máy chiếu thật. Cửa sổ trình chiếu vẫn SVG và **không** có cosmos (quyết định #168 mục 4 giữ nguyên). `.play-head` vẫn là dải `rgba(3,5,13,.86)` đè lên trời — chọn để chữ điều khiển đọc được, chưa hỏi ý giáo viên.

**Next recommended task.** (1) Chạy một tiết thật trên máy chiếu 1366×768 để duyệt khoang vũ trụ bằng mắt (độ sáng sao, cỡ chữ HUD trên dải mờ) và đo FPS board 10 sao. (2) Nếu giáo viên muốn cả máy chiếu có nền đêm, làm một quyết định riêng về việc nạp Three.js vào `presentation.html`. (3) Nợ cũ vẫn treo: làm `ui-three-game-check-4games` chạy được nhiều lần trong một phiên.

