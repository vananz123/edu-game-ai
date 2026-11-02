# Trạng thái dự án

Bàn giao mới nhất nằm ngay trong file này (3 mục gần nhất). Các bàn giao cũ được lưu ở
`docs/handoff/status/` — mỗi ngày một file, nối thêm vào cuối file của ngày đó khi cần.
Quy ước: sau mỗi việc, chèn bàn giao mới ngay dưới tiêu đề "Bàn giao gần nhất"; nếu quá 3 mục,
chuyển mục cũ nhất vào file lưu trữ đúng ngày của nó và cập nhật mục lục.

## Mục lục bàn giao

### 2026-11-02
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

## Handoff — "Chòm sao tri thức" bố cục lại: một khay, cảnh lớn, đường nối đúng (2026-11-02 #2, DECISIONS #172)

**Files changed.** Mới: không (dùng lại file của #171). Sửa: `src/renderer/features/games/constellation.ts` (viết lại bề mặt: HUD, cảnh, hàng câu dài, khay duy nhất, kéo thả/bay/không có WebGL), `src/renderer/features/games/three-stage.ts` (chiều sâu suy ra, khung chiếu theo frame, `fixAspect`, hover/drop theo frame, tia sáng khi khớp, hoàn thiện), `src/renderer/features/three-game-interaction.ts` (sao phát sáng + bloom, twinkle, cạnh `TubeGeometry` + shader draw-on, `setHot`, `setFitScale`, `id` trên entry — lỗi khiến **không cạnh nào** hiện), `src/renderer/features/games/matching.ts` (bố cục board mới, `evaluateColumnMatchWith(…, attempt)`, đóng băng template), `src/renderer/features/games/connection.ts` (template cache + freeze), `src/renderer/styles/game-constellation.css` (bố cục mới), `src/shared/constellation-templates.ts` (Orion dàn lại cho khoảng cách nhãn), `src/renderer/shared/constellation-data.ts` (mirror), `tests/unit/three-game-interaction.test.ts` (cạnh = 1 mesh, sao có bloom), `tests/ui/ui-constellation-check.js` (viết lại 45 kiểm tra), `tests/ui/ui-connection-mode-check.js` (selector mới).

**Behavior.** Board chỉ còn MỘT khay thẻ đáp án dưới cảnh; cảnh chiếm ~68% vùng chơi ở 1366×768 và giữ tỉ lệ ở 1920×1080 / 1280×720. Câu ngắn là nhãn trên sao; câu dài là thẻ đọc được ngoài cảnh với MỘT đường đứt nét ngắn tới sao. Cạnh chòm sao chỉ hiện sau khi ghép đúng (draw-on 0.55 s), sao đúng phát sáng mạnh, lỗi thì chỉ rung nhẹ và thẻ về khay. Hoàn thành thì quét sáng toàn bộ hình + mừng chung + màn kết quả cũ.

**Commands run.** `npm run check` 0 · `npm run build` 0 · `node tests/run-unit.js` **74/74** (29s) · `check:renderer-globals` 0 undefined · `verify:css` **32/32** · `ui-constellation-check <port>` **45/45** ×3 · `ui-connection-mode-check` **7/7** · `ui-matching-finish-check` **22/22** · `ui-presentation-check` **60/60** · `ui-three-game-check-4games` **41/41**.

**What remains unverified.** Chưa thử máy chiếu thật (chỉ số đo + emulation 1366×768 / 1920×1080 / 1280×720). Chưa đo FPS trên GPU tích hợp. Thẻ bay dùng Web Animations API (có hạn chót dự phòng) — chưa thử phần cứng rất cũ. Không có ảnh chụp màn hình (môi trường không đọc được ảnh).

**Next recommended task.** (1) Một tiết thật ở 1366×768 với 5 và 8 cặp để chốt cỡ chữ nhãn và số thẻ vừa khay. (2) Đo FPS board 10 sao trên máy tích hợp. (3) Chuyển sang tiếng Việt hoá nốt nhãn HUD nếu cần.

## Handoff — "Chòm sao tri thức": bảng sao 3D kéo thả + chơi toàn màn hình (2026-11-02, DECISIONS #171)

**Files changed.** Mới: `src/shared/constellation-templates.ts` (7 chòm sao × 10 sao, chọn sao, ánh xạ id cũ, `constellationTemplateShape`), `src/renderer/shared/constellation-constants.ts`, `src/renderer/shared/constellation-data.ts`, `src/renderer/constellation-core.ts` (bản sao cho môi trường classic script), `src/renderer/features/games/constellation.ts` (bề mặt chơi: thẻ, chip, kéo thả, đường nối, dự phòng không WebGL), `src/renderer/styles/game-constellation.css`, `tests/unit/constellation-{templates,parity,spacing}.test.ts`, `tests/ui/ui-constellation-check.js`. Sửa: `src/shared/connection-progress.ts` + `src/renderer/connection-core.ts` (template object có `stages` được dùng nguyên trạng), `three-stage.ts` (thế giới sao, `updateStarAnchors`, `starAtPoint`, `fitConnectionGraph`), `three-game-interaction.ts` (`kind: 'star'`, `enableDrag/dragStart/dragEnd/pick/refreshAnchors`), `connection.ts` (gallery/preview SVG của chòm sao, `constellationPairForStar/starForPair`), `matching.ts` (bảng mới, `evaluateColumnMatchWith`, "Chơi lại" mở lại bề mặt chơi, kết quả), `shared.ts` (chip thư viện, trạng thái chọn), `wizard/step-configure.ts`, `create-wizard.ts`, `editor/matching.ts`, `presentation.ts` + `presentation-types.ts` (view `constellation`), `services/game/game-project-adapter.ts`, `services/lesson/lesson-contracts.ts`, `types.ts`, `lesson-types.ts`, `shared/connection-constants.ts` (BETA = false), `src/index.html`, `app.css`; `tests/ui/ui-connection-mode-check.js` viết lại thành guard tương thích file cũ.

**Behavior.** "Kết nối vật thể" đổi tên hiển thị thành **Chòm sao tri thức** (enum vẫn `'connection'`). Bảng chơi là một chòm sao thật trên bề mặt 3D: học sinh **kéo thẻ vào đúng sao** (hoặc bấm thẻ rồi bấm sao, hoặc Enter), cặp đúng thắp sáng thêm một sao và nối thêm một đường, sai thì không thắp gì và không gỡ gì. Có `dragDirection` (trái→phải / phải→trái) quyết định vế nào nằm trên sao. Game cũ lưu id hình cũ vẫn mở (ánh xạ sang chòm sao gần nhất), id không bị ghi lại. Chế độ chơi (và toàn màn hình) giờ cho cảnh cao gần hết màn hình, cột thẻ đáp án cố định cạnh bên; nhãn sao là HTML, vế dài chuyển ra dải dưới cảnh với đường nối. Máy không có WebGL thấy dòng chòm sao tĩnh, vẫn chơi được, và được gợi ý chuyển sang Ghép hai cột cho buổi đó (không đổi file đã lưu). Máy chiếu nhận view dữ liệu `constellation` (không Three.js).

**Commands run.** `npm run check` → 0 · `npm run build` → 0 · `node tests/run-unit.js` → **74/74** (38s) · `npm run check:renderer-globals` → 0 undefined (867 hàm / 7.093 call site) · `npm run verify:css` → **32/32** · `node tests/ui/ui-constellation-check.js <port>` → **55/55**, lặp lại 3 lần đều xanh · `node tests/ui/ui-connection-mode-check.js <port>` → **7/7** · `node tests/ui/ui-three-game-check-4games.js <port>` → **41/41** (lần chạy đầu trên app mới).

**What remains unverified.** Sàn đọc 22 px và ngưỡng "một nhãn" là **giả định** đo trên bố cục 1366–1920 px, chưa thử trên máy chiếu thật. Không có ảnh chụp màn hình (chỉ có số đo hình học + CDP). Trình chiếu/LAN của board mới kiểm qua view dữ liệu, chưa qua một tiết học thật. `ui-three-game-check-4games` vẫn chỉ xanh ở lần chạy đầu mỗi phiên app (nợ cũ, đếm mount/unmount tích luỹ). Chưa chạy installer đóng gói.

**Next recommended task.** (1) Chạy thử một tiết thật trên máy chiếu 1366×768 để chốt sàn đọc nhãn (đo nhãn ngắn nhất/nhỏ nhất trong ảnh chụp thật; nếu < 22 px thì nâng `CONSTELLATION_SHORT_LABEL_MAX` xuống số ký tự vừa). (2) Đo hiệu năng khung hình board 10 sao trên máy yếu (máy chiếu phòng học). (3) Kiểm LAN/trình chiếu bằng một buổi thử có hai cửa sổ.

## Handoff - "Kết nối vật thể" chuyển sang BETA + sửa camera matrix (2026-11-01, DECISIONS #170)

**Files changed.** `src/renderer/shared/connection-constants.ts` (thêm `CONNECTION_BETA`, `CONNECTION_BETA_LABEL`, `CONNECTION_BETA_NOTE` — đặt ở script nạp sớm nhất để `shared.js` đọc được), `src/renderer/features/wizard/step-configure.ts` (option "— BETA" + nhãn + cảnh báo), `src/renderer/features/editor/matching.ts` (option `(BETA)`, nhãn `MẪU HÌNH KẾT NỐI BETA`, hint nối cảnh báo), `src/renderer/shared.ts` (chip `· BETA` + `data-beta-badge`), `src/renderer/styles/game-connection.css` (`.connection-beta`, `.connection-beta-note`), `src/renderer/features/games/three-stage.ts` (gọi `camera.updateMatrixWorld(true)` sau khi dời camera; thay pass `requestAnimationFrame` bằng `connectionLater(120)`), `src/renderer/features/three-game-interaction.ts` (`dolly`/`resetDolly` cập nhật matrix), `tests/ui/ui-connection-mode-check.js` (điều khiển khung hình qua `onStep` thay vì chờ `rAF`).

**Behavior.** Tính năng giữ nguyên hành vi; chỉ thêm nhãn BETA ở 5 bề mặt mà giáo viên ra quyết định (wizard, editor ×2, hint, thẻ thư viện) và một dòng cảnh báo "đang ở giai đoạn thử nghiệm, có thể còn thay đổi". Bỏ beta về sau chỉ cần đổi `CONNECTION_BETA` và hai nhãn literal.

**Hai lỗi thật đã sửa.** (1) **Camera matrix cũ khi chiếu.** Camera không thuộc scene nên `matrixWorld` chỉ được làm mới trong `render()`; `frameConnectionBoard()` dời camera rồi chiếu ngay bằng vị trí cũ → mỗi node ra ~60 000 px ngoài màn hình. Sau `updateMatrixWorld(true)`: node chiếu vào `(658, 639)` trong khung `(270..1312, 359..799)`. `dolly`/`resetDolly` nhận cùng bản sửa. (2) **Check phụ thuộc `rAF`**: cửa sổ ẩn làm Chromium đóng băng rAF, nên check "node đạt trôi" báo đỏ trên board đúng; nay nó gọi `onStep(1/60, false)` 24 lần và kiểm logic animation.

**Commands run.** `npm run check` 0 · `npm run build` 0 · `node tests/run-unit.js` **71/71** · `check:renderer-globals` 0 undefined (816 hàm / 6.756 call site) · `verify:css` **32/32** (thêm rule `.connection-beta*`). Electron cổng **9391**, phiên mới: `ui-connection-mode-check` **58/58** (chạy **3 lần liên tiếp** đều xanh sau bản sửa camera; trước đó lặp lại đỏ ổn định ở check chiếu node), `ui-presentation-check` **60/60**, `ui-matching-finish-check` **22/22**, `ui-play-mode-card-check` xanh (4 thẻ probe). House mode xác nhận bằng probe trực tiếp: `.house-progress` có, canvas có, không có `[data-connection-panel]`, `state.houseBuild.parts === 0`.

**Chưa xác minh.** Trong cửa sổ ẩn, `ui-house-building-check.js` **treo** (nó chờ tween rAF của nhà) và `ui-three-game-check-4games.js` chỉ đúng khi chạy lần đầu trong phiên — nợ có sẵn, đã ghi từ #169. Không có cơ chế tắt beta cho giáo viên (beta thuần là nhãn, không phải cờ Settings). Chưa có ảnh chụp nhãn BETA (model không đọc được ảnh); chưa bấm tay luồng wizard bước 4 để thấy nhãn — chỉ kiểm bằng chuỗi HTML sinh ra. Ba điểm tối ưu review nêu (SVG dựng khi 3D sống, raycast hover mỗi khung, `sprites`/`width` thừa) để nguyên.

**Next task.** Chờ kế hoạch mới từ giáo viên. Khi có, ưu tiên đáng làm trước: (a) cơ chế tắt hợp lý cho beta nếu phải thu hồi tính năng; (b) bộ UI check chạy được nhiều lần trong một phiên (snapshot bộ đếm thay vì so tuyệt đối) để chạy cả bộ một mạch; (c) ba điểm tối ưu còn treo.
