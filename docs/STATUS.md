# Trạng thái dự án

Bàn giao mới nhất nằm ngay trong file này (3 mục gần nhất). Các bàn giao cũ được lưu ở
`docs/handoff/status/` — mỗi ngày một file, nối thêm vào cuối file của ngày đó khi cần.
Quy ước: sau mỗi việc, chèn bàn giao mới ngay dưới tiêu đề "Bàn giao gần nhất"; nếu quá 3 mục,
chuyển mục cũ nhất vào file lưu trữ đúng ngày của nó và cập nhật mục lục.

## Mục lục bàn giao

### 2026-11-01 — [docs/handoff/status/2026-11-01.md](handoff/status/2026-11-01.md)
- "Kết nối vật thể" chuyển sang BETA (chỉ nhãn, giữ hành vi) và sửa lỗi camera matrix làm hình chiếu lệch ~60 000 px (#170)`n- "Kết nối vật thể" thành bề mặt 3D thật bằng Three.js: khối/vòng có chiều sâu, dây vẽ dần, camera dolly, SVG làm dự phòng (#169)`n- "Kết nối vật thể": cách chơi thứ tư của Ghép cặp kiến thức — 7 mẫu dữ liệu, hình SVG thay bảng hai cột, máy chiếu có khung tĩnh (#168)
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

## Handoff - "Kết nối vật thể" chuyển sang BETA + sửa camera matrix (2026-11-01, DECISIONS #170)

**Files changed.** `src/renderer/shared/connection-constants.ts` (thêm `CONNECTION_BETA`, `CONNECTION_BETA_LABEL`, `CONNECTION_BETA_NOTE` — đặt ở script nạp sớm nhất để `shared.js` đọc được), `src/renderer/features/wizard/step-configure.ts` (option "— BETA" + nhãn + cảnh báo), `src/renderer/features/editor/matching.ts` (option `(BETA)`, nhãn `MẪU HÌNH KẾT NỐI BETA`, hint nối cảnh báo), `src/renderer/shared.ts` (chip `· BETA` + `data-beta-badge`), `src/renderer/styles/game-connection.css` (`.connection-beta`, `.connection-beta-note`), `src/renderer/features/games/three-stage.ts` (gọi `camera.updateMatrixWorld(true)` sau khi dời camera; thay pass `requestAnimationFrame` bằng `connectionLater(120)`), `src/renderer/features/three-game-interaction.ts` (`dolly`/`resetDolly` cập nhật matrix), `tests/ui/ui-connection-mode-check.js` (điều khiển khung hình qua `onStep` thay vì chờ `rAF`).

**Behavior.** Tính năng giữ nguyên hành vi; chỉ thêm nhãn BETA ở 5 bề mặt mà giáo viên ra quyết định (wizard, editor ×2, hint, thẻ thư viện) và một dòng cảnh báo "đang ở giai đoạn thử nghiệm, có thể còn thay đổi". Bỏ beta về sau chỉ cần đổi `CONNECTION_BETA` và hai nhãn literal.

**Hai lỗi thật đã sửa.** (1) **Camera matrix cũ khi chiếu.** Camera không thuộc scene nên `matrixWorld` chỉ được làm mới trong `render()`; `frameConnectionBoard()` dời camera rồi chiếu ngay bằng vị trí cũ → mỗi node ra ~60 000 px ngoài màn hình. Sau `updateMatrixWorld(true)`: node chiếu vào `(658, 639)` trong khung `(270..1312, 359..799)`. `dolly`/`resetDolly` nhận cùng bản sửa. (2) **Check phụ thuộc `rAF`**: cửa sổ ẩn làm Chromium đóng băng rAF, nên check "node đạt trôi" báo đỏ trên board đúng; nay nó gọi `onStep(1/60, false)` 24 lần và kiểm logic animation.

**Commands run.** `npm run check` 0 · `npm run build` 0 · `node tests/run-unit.js` **71/71** · `check:renderer-globals` 0 undefined (816 hàm / 6.756 call site) · `verify:css` **32/32** (thêm rule `.connection-beta*`). Electron cổng **9391**, phiên mới: `ui-connection-mode-check` **58/58** (chạy **3 lần liên tiếp** đều xanh sau bản sửa camera; trước đó lặp lại đỏ ổn định ở check chiếu node), `ui-presentation-check` **60/60**, `ui-matching-finish-check` **22/22**, `ui-play-mode-card-check` xanh (4 thẻ probe). House mode xác nhận bằng probe trực tiếp: `.house-progress` có, canvas có, không có `[data-connection-panel]`, `state.houseBuild.parts === 0`.

**Chưa xác minh.** Trong cửa sổ ẩn, `ui-house-building-check.js` **treo** (nó chờ tween rAF của nhà) và `ui-three-game-check-4games.js` chỉ đúng khi chạy lần đầu trong phiên — nợ có sẵn, đã ghi từ #169. Không có cơ chế tắt beta cho giáo viên (beta thuần là nhãn, không phải cờ Settings). Chưa có ảnh chụp nhãn BETA (model không đọc được ảnh); chưa bấm tay luồng wizard bước 4 để thấy nhãn — chỉ kiểm bằng chuỗi HTML sinh ra. Ba điểm tối ưu review nêu (SVG dựng khi 3D sống, raycast hover mỗi khung, `sprites`/`width` thừa) để nguyên.

**Next task.** Chờ kế hoạch mới từ giáo viên. Khi có, ưu tiên đáng làm trước: (a) cơ chế tắt hợp lý cho beta nếu phải thu hồi tính năng; (b) bộ UI check chạy được nhiều lần trong một phiên (snapshot bộ đếm thay vì so tuyệt đối) để chạy cả bộ một mạch; (c) ba điểm tối ưu còn treo.

## Handoff - "Kết nối vật thể" thành bề mặt 3D thật (2026-11-01, DECISIONS #169)

**Files changed.**
- `src/renderer/features/three-game-interaction.ts`: thêm `makeNodeGraph` (bảng 3D từ dữ liệu template, ghost → vẽ dây dần → trôi/xoay nhẹ), `makeLinkBeam`, `makeGlow`, `dolly`/`resetDolly`, `reducedMotion()`, `tween({ delay })` và hook `handle.onStep` để một world tự animate trên **vòng lặp rAF duy nhất**. API cũ không đổi; `makeNodeGraph.setEarned` giờ nhận `(handle, nodeIds, linkIds, opts)`.
- `src/renderer/features/games/three-stage.ts`: `CONNECTION_WORLD` đổi sang 10×6,2 (giữ tỉ lệ 1000×620), `frameConnectionBoard()` dời camera + scale để hình nằm gọn trong khung DOM, gọi **ngay khi mount** và lặp lại khi resize; emblem bị park; `onStep` chạy `graph.tick`; bắt đầu glow khi nối và dolly khi vào/trượt; `reactConnectionBoard` nhánh match:correct/incorrect/game:completed.
- `src/renderer/features/games/connection.ts`: `connection3dActive()` (WebGL + bề rộng + reduced-motion), `connectionEarnedParts()`, panel mang `is-3d` hay `is-svg`, SVG chỉ vẽ lại khi không có 3D. **Sửa lỗi:** điều kiện đọc `dataset.connection3d` trước đây luôn `undefined` vì attribute viết `data-connection-3d`; nay attribute là `data-connection3d`.
- `src/renderer/styles/game-connection.css`: khung 3D cao `clamp(260px, 44vh, 520px)` (fullscreen 50vh), nền tối gradient, SVG ẩn khi `is-3d`, nhánh `max-height: 820px` cho 1366×768.
- `tests/unit/three-game-interaction.test.ts`: +11 check cho `makeNodeGraph`/`makeLinkBeam`/`makeGlow`/`dolly`, gồm cấu trúc (3 root/2 link, plate/ring có 2 con, dây cong 12 đoạn, null-handle an toàn).
- `tests/ui/ui-connection-mode-check.js`: +20 check 3D và +8 check dự phòng; sửa 2 kỳ vọng SVG cũ (nay SVG ẩn khi 3D sống) và 1 kỳ vọng attr.
- `docs/DECISIONS.md` #169, `docs/PROJECT_MAP.md`.

**Behavior.** Màn chơi Kết nối vật thể giờ là một bảng 3D do Three.js vẽ: mỗi node là khối/vòng/cầu thật có chiều sâu, node chưa đạt hiện mờ, node đạt sáng lên và **dây được vẽ dần** từ đầu này sang đầu kia, camera đẩy nhẹ khi một chặng được nối, node đạt trôi/xoay nhẹ còn ghost đứng yên, hover phóng to thân node. Hình nằm **gọn trong khung** ở 1366×768, 1280×720, 1920×1069 và 1024×700. Không có WebGL thì board tự chuyển sang SVG với y nguyên luồng chơi; có WebGL thì SVG ẩn nhưng vẫn trong DOM làm lưới an toàn. Điểm vẫn do `game-engine` + `calculateMatchingSummary` quyết định.

**Commands run.** `npm run check` 0 · `npm run build` 0 · `node tests/run-unit.js` **71/71** · `check:renderer-globals` 0 undefined (**818** hàm / **6.734** call site) · `verify:css` **32/32**. Electron cổng **9391**: `ui-connection-mode-check` **58/58**, chạy 3 lần liên tiếp đều xanh (canvas >600×200, 6 node + 5 dây, **0 node ngoài khung**, phủ 60 % chiều cao khung, plate 68×25 px @1366 và 125×45 px @1920, node đạt trôi `-0.0448→-0.0371` còn ghost `0→0`, WebGL-off vẫn chấm điểm và giữ tiến độ). Hồi quy: `ui-house-building-check` **85/85**, `ui-three-game-check-4games` **41/41**, `ui-three-game-reactions-check` **11/11**, `ui-matching-finish-check` **22/22**, `ui-play-mode-card-check` xanh, `ui-presentation-check` **60/60** — mỗi cái chạy **đầu tiên** trong một phiên app mới.

**Sửa theo `/review uncommitted` (cùng ngày).** Sáu phát hiện WARNING đã xử lý: (1) quy tắc "quét nốt chặng" đếm độ dài plan nên bàn ngắn có một lần sai vẫn báo hoàn tất — nay cần mọi ô kiếm-chặng đúng **và** `missed === 0`, có test hồi quy, đo trên app: 2/4 thay vì 4/4; (2) gỡ ba field thừa trong `GameSetup` (`gameplayMode: 'connection'`, `houseStyle: string`, `connectionTemplate`); (3) mọi `setTimeout` của bảng — glow, reset camera, đợt chớp chặng cuối — nay đi qua `connectionLater()` và được `clearTimeout` trong `unmountThreeStage()` cùng `frameRaf`; (4) xoá `connectionPaint3d`, `lastEarnedNode`, `toggleEditorConnectionField`, `fillRemaining`, `connectionIsTemplateId`, `makeLinkBeam` (kèm test); (5) caption node `dot` trên máy chiếu dùng cùng quy tắc với cửa sổ giáo viên; (6) **bỏ khung trắng** của `.connection-panel` theo yêu cầu giáo viên — đo được `background: rgba(0,0,0,0)`, `border: 0`, `box-shadow: none`, `border-radius: 0`. Còn lại chưa sửa (tối ưu, không phải lỗi): SVG vẫn dựng khi 3D sống, raycast hover mỗi khung hình, `sprites`/`width` thừa trong `makeNodeGraph`.

**Chưa xác minh.** Không có ảnh chụp màn hình (model không đọc được đầu vào ảnh); mọi kết luận thị giác là phép chiếu pixel + `getBoundingClientRect`. Máy chiếu **cố ý vẫn SVG** (không nạp three.js vào cửa sổ thứ hai) — nếu muốn 3D cả trên máy chiếu, đó là việc riêng. `makeLinkBeam` có API + test nhưng board chưa dùng (đường dây đã được `makeNodeGraph` vẽ); nên xoá nếu sau này vẫn không ai gọi. **Nợ có sẵn, không do #169:** `ui-three-game-check-4games.js` so bộ đếm mount/unmount cộng dồn toàn phiên, nên chạy nó **không phải lần đầu** trong cùng app sẽ báo đỏ ở 2 check đó (tái hiện được bằng cách chạy hai lần liên tiếp). Trong lúc phát triển tôi có một lần thấy `ui-house-building-check` 84/85 khi chạy sau các check khác; chạy lại trong phiên mới thì 85/85, và tôi đã xác nhận HEAD chưa sửa cũng 85/85 — nhưng chưa tìm ra nguyên nhân gốc của trạng thái rò đó.

**Next task.** (1) Làm cho các UI check chạy được nhiều lần trong một phiên (snapshot bộ đếm trước khi mở) để cả bộ chạy liền một mạch; (2) điều tra trạng thái rò khi `ui-house-building-check` chạy sau check khác; (3) thêm check UI cho wizard bước 4 (vẫn nợ từ #168); (4) chụp ảnh 1366×768 / 1920×1080 ở máy có thể xem ảnh để duyệt thị giác bảng 3D, rồi cân nhắc `makeLinkBeam` hoặc xoá nó.

## Handoff - "Kết nối vật thể": cách chơi thứ tư của Ghép cặp kiến thức (2026-11-01, DECISIONS #168)

**Files changed.**
- Mới: `src/shared/connection-templates.ts` (7 template + `validateConnectionTemplate`, thuần), `src/shared/connection-progress.ts` (`planConnectionStages` nhận số cặp hoặc danh sách id, `applyConnectionAnswer`, `resetConnectionProgress`, `connectionSummary`, `isConnectionComplete`), `src/renderer/connection-core.ts` + `src/renderer/shared/connection-{constants,data}.ts` (bản global cho renderer script toàn cục), `src/renderer/features/games/connection.ts` (SVG dùng chung, gallery, panel, preview), `src/renderer/styles/game-connection.css`, `tests/unit/connection-{templates,progress,parity}.test.ts`, `tests/ui/ui-connection-mode-check.js`, `docs/handoff/plans/2026-11-01-object-connection.md`.
- Sửa: `src/shared/types.ts` (`MatchingMode` + `'connection'`, `MatchingGameData.connectionTemplate`), `src/shared/lesson-types.ts` (`MatchingConfig`/`MatchingDraft.connectionTemplate`), `src/services/lesson/lesson-contracts.ts` (enum + trường optional; **không** đụng arena), `src/services/game/game-validation.ts` (`MATCHING_MODES`), `src/services/game/game-project-adapter.ts` (`matchingData`/`matchingDraftFromGame`/`configFromGame`), `src/renderer/features/games/matching.ts` (`renderConnectionBoard`, nhánh trong `evaluateColumnMatch`, hero kết quả, replay), `src/renderer/features/games/three-stage.ts` (`buildConnectionWorld`, `reactConnectionBoard`), `src/renderer/features/editor/matching.ts` (option thứ tư + gallery + `readMatchingEditor`), `src/renderer/features/wizard/step-configure.ts`, `src/renderer/pages/create-wizard.ts`, `src/renderer/shared.ts` (chip + state), `src/renderer/features/games/result-screen.ts` + `src/shared/presentation-types.ts` + `src/renderer/features/presentation.ts` (view `connection`), `src/index.html`, `src/renderer/styles/app.css` (1 `@import` cuối), `tests/unit/game-project-adapter.test.ts`.

**Behavior.** Ghép cặp kiến thức có thêm CÁCH CHƠI "Kết nối vật thể" (`matchingGame.mode === 'connection'`): bảng ghép hai cột được thay bằng một hình đang dựng dần, mỗi cặp ghép đúng nối thêm một chặng, cặp sai không gỡ chặng nào, và số chặng tự chia theo số cặp (nhiều cặp hơn chặng: cặp thừa vẫn tính điểm; ít cặp hơn chặng: chặng còn lại mở khi mọi cặp đã nối đúng). Hình phản ánh đúng tiến độ thật ở màn kết quả; "Chơi lại" xoá hình nhưng giữ cách chơi + mẫu. Bảy mẫu (Mạng lưới tri thức, Xây cầu, Hệ Mặt Trời, Mạch điện, Chuỗi hệ sinh thái, Dòng thời gian, Hình học ghép) chọn ở wizard bước 4 và trình soạn thảo qua gallery có preview; thẻ thư viện có chip "🔗 Cách chơi: Kết nối vật thể"; máy chiếu nhận khung SVG tĩnh + `n/k`. Điểm số, phạt, thưởng vẫn chạy trong `game-engine` và `calculateMatchingSummary` — không có hàm vẽ nào trả điểm. Ba kiểu ghép cũ, Xây nhà, Đấu trường và 4 thể loại còn lại không đổi hành vi.
- **Một điểm chính sách phải ghi:** yêu cầu gốc viết cho "game Mảnh ghép (Puzzle)" không tồn tại trong sản phẩm; người dùng xác nhận đích là game **Ghép cặp kiến thức**. Một lượt triển khai trước đã gắn nhầm vào Đấu trường (`gameplayMode`) và đã được gỡ sạch — định nghĩa lại `gameplayMode`/`houseStyle` về đúng `'classic' | 'house'`, trả `quiz.ts`/`shell.ts`/`three-stage.ts`/`editor/page.ts`/`editor/questions.ts`/`wizard`/`shared.ts` về hành vi trước đó.

**Commands run.** `npm run check` 0 · `npm run build` 0 · `node tests/run-unit.js` **71/71** (27,3s; `connection-parity` xác nhận **16.275** bước trả lời khớp giữa bản shared và bản renderer, cả hai bản chấp nhận số cặp trần) · `npm run check:renderer-globals` 0 undefined (59/60 script, **802** hàm, **6.637** call site) · `npm run verify:css` **32/32**. Electron thật, cổng **9391**, profile sạch: `ui-connection-mode-check` **37/37** — 7 mẫu ship + fallback, board mở ở `0/5`, `board=false left=6 right=6` (bảng hai cột đã được thay), SVG `1028×200`, đúng một cạnh mỗi cặp đúng (`drawn=["e1"] expected=["e1"]`), cặp sai giữ nguyên `["e1","e2"]`, kết quả `5/5 · Đã hoàn thiện` với 5 cạnh, replay `after=0` + `counter=0/5`, game lưu giữ `connection/timeline`, editor 4 kiểu + gallery 7 thẻ + preselect `geometry` + `readMatchingEditor` đọc lại đúng. Hồi quy trên cùng app: `ui-matching-finish-check` **22/22** (columns/memory/categorize nguyên vẹn), `ui-play-mode-card-check` xanh, `ui-presentation-check` **60/60**, `ui-three-game-check-4games` **41/41**, `ui-three-game-reactions-check` **11/11**.

**Chưa xác minh.** Không có ảnh chụp màn hình chế độ mới (chỉ số đo hình học + check CDP) — nợ chung của #166/#167. Luồng **wizard bước 4** chỉ được kiểm gián tiếp (dữ liệu đi qua `parseGameConfig`, zod đã giữ `connectionTemplate`); chưa có check UI bấm "KIỂU GHÉP → Kết nối vật thể → chọn mẫu → tạo". Bốn lần đỏ đầu tiên của `ui-connection-mode-check` đều là **test đọc sớm hơn nhịp hoàn tất 800 ms** hoặc kỳ vọng sai (số stage của template thay vì số cặp, `openEditor` nhận object chứ không nhận id, `results` là mảng chứ không phải hàm) — đã sửa test, không sửa hành vi; điều này cũng cho thấy check cần chờ theo trạng thái chứ không theo đồng hồ nếu chạy trên máy chậm hơn. Một build **cũ hơn** sẽ đọc `.egame` có `mode: 'connection'` là kiểu ghép không hợp lệ (chấp nhận: file đó chỉ do build này sinh). Chưa chạy installer đóng gói.

**Next task.** (1) Thêm check UI cho wizard bước 4: chọn "Kết nối vật thể" hiện gallery, chọn mẫu, tạo nội dung, mở game và thấy đúng mẫu. (2) Chụp ảnh 1366×768 và 1920×1080 cho board + màn kết quả rồi đánh giá mật độ như #152 (hiện chỉ có `1028×200` cho SVG; chưa đo xem cột chọn cặp có đẩy đáp án ra ngoài ở 1366 hay không). (3) Nếu muốn mẫu hiện đẹp hơn trên máy chiếu: xét nạp `three.global.js` vào cửa sổ trình chiếu — cố ý chưa làm ở đợt này để giữ đúng mức phủ sóng của Xây nhà. (4) Roadmap `Packaged check` vẫn cần máy sạch.

---

## Handoff - Một cỡ chữ cho mọi tiêu đề trang: bỏ dòng mô tả, để `<h1>` kế thừa token mực (2026-11-01, DECISIONS #167)

**Files changed.** Bảy file `src/renderer/pages/*`, mỗi file chỉ đụng dòng header:
- `lesson-plans.ts:91`, `my-projects.ts:88`, `sessions.ts:83` (họ danh sách): `text-[27px] tracking-[-0.9px] m-0 font-[780]` → `text-[22px] tracking-[-0.9px] m-0 font-[700]`, và xoá `<p class="mt-[9px] text-[#788196] text-[13px] leading-[1.6]">…</p>`.
- `create-wizard.ts:90-92`: như trên, thêm `mb-[22px]` → `mb-[25px]` để trang wizard cùng nhịp với bốn trang danh sách.
- `create.ts:27-33`, `settings.ts:186-191` (họ công cụ): bỏ `<p class="text-[12px] text-[#64748b] dark:text-[#94a3b8]">`, bỏ luôn ghim màu trên `h1` (`text-[#1e293b] dark:text-[#f1f5f9]`), wrapper `mb-1` ở Settings thu về `<div>`; hàng kẻ ngang **giữ** nhưng đảo phía ôm — `pb-4 … mb-6` → `pb-[8px] … mb-[16px]` (kèm `flex-wrap` ở Create vì badge `THỦ CÔNG` đi cùng).
- `library.ts:79` là bản người dùng sửa tay, dùng làm spec chuẩn; không sửa thêm byte nào.
- Không đổi: file CSS, `tests/ui/*`, `tests/manual/verify-css.js`. `git diff --stat` = 7 file nguồn + 3 file docs, không dòng logic nào.

**Behavior.** Một bộ utility `text-[22px] tracking-[-0.9px] m-0 font-[700]` cho cả bảy tiêu đề trang, thay cho ba trường phái cũ (27px/780 + mô tả · 22px/extrabold + mô tả + kẻ · bản của người dùng). `h1` không còn ghim màu nên **kế thừa `--text`**: light `rgb(23, 32, 51)` (= `--color-ink`, sâu hơn `#1e293b` một bậc và đúng bằng mực body), dark `rgb(232, 234, 242)` — cùng cách mà `.form-panel` của #160 và bốn thanh chọn của #164 đã làm: một cặp token, theme tự lật, không `dark:` utility. Hệ quả đo được: **4** node mang `dark:text-*` rời khỏi dân số gate (`263 → 259`). Khoảng header → nội dung **25px trên cả bảy trang** (trước: 25 / 22 / 41 — hai trang công cụ thừa 16px). Đường kẻ của Create/Cài đặt nay đứng **8px trên / 16px dưới** nên nó ôm khối mình phân cách thay vì tách header ra khỏi nội dung. Ba dòng mô tả *có nội dung thật* (Settings: mỗi mục là một tab + chỉ lưu khi bấm Lưu; Create: bốn bước + "trang này không dùng AI"; Wizard: luồng giáo án → AI local → lưu) mất theo quyết định tối giản của người dùng — ghi lại ở #167 để lần sau không ai tự ý dán lại.

**Commands run.** `npm run check` 0 · `npm run check:renderer-globals` 0 undefined (55/56 script, 774 hàm, 6.434 call site) · `npm run build` 0 · `npm run verify:css` **32/32** (không thêm expectation — phạm vi thuần markup) · `node tests/run-unit.js` **68/68** (28,1s). Electron thật, instance riêng + profile sạch (cổng **9372**, đã xác minh **671** rule top-level và `body rgb(244, 246, 251)` trước khi tin số): `ui-dark-theme-check` **23/23** — dark vẫn **0/259** dưới 4,5:1, worst **5,71**, median **11,47**; ba số đó của #165/#166 không dịch một chữ số, tức bỏ 4 node `dark:` không lộ hỏng hóc mới. Nhánh light **28 → 26**. Probe độc lập tái hiện đúng `walk()` của gate rồi **kê khai từng dòng 26 offender**: Settings 16, Create 8, Wizard 2, bốn trang danh sách 0 — dân số cũng khớp (`143 + 85 + 31 = 259`), ổn định trên **hai pass liên tiếp**; hai dòng vừa xoá mang `text-[#64748b]` = **4,41:1** trên nền `rgb(244, 246, 251)`, tức chính chúng là 2 trong 28 của #165. Probe hình thể trên `#pageContent` bảy trang: mọi `h1` `22px / 700`, mực kế thừa đúng cặp, không trang nào còn `<p>` dưới tiêu đề, khoảng cách 25px. Ảnh: `tests/ui/shots/167-light-create.png`, `167-dark-settings.png` + bảy ảnh light / ba ảnh dark (thư mục gitignore) — chụp trên build **ngay trước** nước chỉnh khoảng cách. Sibling trên instance **riêng, chưa từng đụng gate** (cổng 9371, build chót, mỗi check bọc `timeout 240`): `ui-chrome-icons-check` **0 FAIL** · `ui-lessons-paging-check` **All lesson paging checks passed** · `ui-project-selection-check` **All project selection checks passed** · `ui-results-paging-check` **All results paging checks passed** · `ui-settings-sections-check` **All settings tab checks passed** · `ui-card-menu-check` **All card-menu checks passed** · `ui-library-paging-check` **All library paging checks passed** · `ui-wizard-structure-check` **13/14** (đỏ còn lại = "the render keeps the keyboard focus on the ticked row", đúng baseline rAF-when-occluded đã ghi ở #165, file `step-structure.ts` không nằm trong diff này).

**Chưa xác minh.** Khoảng cách 25px và kẻ 8/16 **chưa có ảnh** trên build chót: run chụp lại timeout cả 4 lượt (`Page.captureScreenshot`, compositor lạnh) đúng tính chất "capture là điều kiện, không phải đảm bảo" của #166 — phần đó chỉ có số đo hình học. typography thì có ảnh, nhưng ảnh là của build liền trước. Một run trung gian (sau khi xoá subtitle, trước khi sửa khoảng cách và trước `build:css`) báo light **27** với cùng dân số 259; con số đó **không tái hiện được** và danh sách kê khai chốt ở 26. Sibling check: sáu trên bảy check xanh ngay lần chạy đầu trên build chót; `ui-library-paging-check` **chạm trần 240s** ở lô đầu (và ở lô trước đó nó chạy 18 phút không in dòng nào — cùng họ với hiện tượng `requestAnimationFrame` không fire khi cửa sổ bị che, đã ghi ở #165), rồi **pass toàn bộ** khi chạy lại với trần 420s trên đúng instance đó — tức chậm, không hỏng. `ui-wizard-structure-check` **13/14** là đỏ môi trường đã có baseline, không phải hồi quy. Chưa bấm luồng giáo viên thật để xem bảy header trong ngữ cảnh sử dụng. Header của trình chỉnh sửa vẫn là một cấp chữ khác (`18px/800`, ghim `#1e293b` ở `components.css:133`) cùng `.editor-page-head`/`.editor-save-bar` ghim nền trắng — **cố ý không đụng**, xếp vào đợt `.modal` của #166. Chưa chạy installer đóng gói.

**Next task.** (1) Đợt `.modal` (kế hoạch đã ghi ở #166): cho tấm nền một cặp token nền + mực kế thừa, và nay gom thêm `.empty-state`, `.editor-page-head`, `.editor-save-bar` vì cùng một gốc — sửa lẻ từng phần tử sẽ lại bỏ sót `<h2>`/`<strong>` như ảnh `166-dark-modal-help.png` chỉ ra. (2) Nếu muốn đóng nốt 24 offender light còn lại: cần người dùng chọn mực cho ba pill trạng thái (amber 2,86 / green 3,09 / grey 3,61) và các link `#6366f1` 4,47 — không phải việc đo. (3) `input`/`textarea` của họ `.field` vẫn là ô trắng mực tối trong dark (nợ #166, đọc được nhưng lệch bảng màu). (4) Roadmap `Packaged check` vẫn cần máy sạch.

---

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





