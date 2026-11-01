# Trạng thái dự án

Bàn giao mới nhất nằm ngay trong file này (3 mục gần nhất). Các bàn giao cũ được lưu ở
`docs/handoff/status/` — mỗi ngày một file, nối thêm vào cuối file của ngày đó khi cần.
Quy ước: sau mỗi việc, chèn bàn giao mới ngay dưới tiêu đề "Bàn giao gần nhất"; nếu quá 3 mục,
chuyển mục cũ nhất vào file lưu trữ đúng ngày của nó và cập nhật mục lục.

## Mục lục bàn giao

### 2026-11-01 — [docs/handoff/status/2026-11-01.md](handoff/status/2026-11-01.md)
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

## Handoff - "Xoá đã chọn" trong trang Dự án của tôi (2026-11-01, DECISIONS #163)

**Files changed.**
- `src/main.ts`: IPC **mới** `project:delete-many` (ngay sau `project:delete`) — khử trùng và lọc id không hợp lệ, ném lỗi khi batch rỗng, trần 200 id, mỗi id đi qua đúng đường xoá đơn (`removeProjectImages()` rồi `store.deleteProject()`), trả `{ ok, deleted, missing }` giống `library:delete-games`. `project:delete` đơn lẻ giữ nguyên.
- `src/preload.ts`: `deleteProjects: projectIds => ipcRenderer.invoke('project:delete-many', projectIds)`.
- `src/renderer/pages/my-projects.ts`: ba hàm mới `projectSelectedIds(projects)` (Set id đã tick, tỉa id không còn tồn tại), `projectSelectionBarHtml(projects, selected)` (bar `[data-project-selection-bar]`, `#projectSelectAll` "Chọn tất cả danh sách này", `[data-project-selected-count]`, `#projectDeleteSelectedBtn`, `#projectClearSelectionBtn`) và `projectCardHtml(project, index, selected)` (wrapper `[data-project-item]` + checkbox `data-action="project-select"` **ngoài** `projectCard()`). `renderMyProjects()` gọi `projectSelectedIds(projects)` và nối bar + wrapper vào nhánh lưới. `projectCard()` không đổi một byte nào.
- `src/renderer/core/controller.ts`: `updateProjectSelectionUi()` (sửa bar + viền thẻ **tại chỗ**, không `render()` nên checkbox vừa bấm vẫn là node cũ), nối `#projectSelectAll` trong `wirePage()`, và ba action `project-select` (sửa tại chỗ) / `project-clear-selection` (`render()`) / `project-delete-selected` (confirm liệt kê 5 tên đầu, toast "Đã xoá N dự án, M không còn tồn tại", rồi `refreshProjectsPage()`).
- `package.json`: script `check:project-selection-ui`.
- `tests/ui/ui-project-selection-check.js` (**mới**, 17 assertion) và script gate tương ứng; `tests/run-unit.js` không phải sửa (check mới là UI check, không phải unit).
- Docs: `docs/DECISIONS.md` (#163), `docs/STATUS.md`, `docs/handoff/status/2026-11-01.md` (chuyển bàn giao #160 vào lưu trữ).
- Không đổi: `project:delete` đơn lẻ, `deleteProject()` / `saveProject()` trong lesson store, `validateProjectForWrite()`, schema SQLite và migration, `.egame` import/export, phân tách dự án ↔ thư viện, engine trò chơi, các trang thư viện/giáo án/kết quả.

**Behavior.** Trang "Dự án của tôi" có bar xoá hàng loạt ngay trên lưới thẻ: tick từng thẻ (viền `ring-2` tím + `[data-selected="true"]`), hoặc "Chọn tất cả danh sách này" cho toàn bộ thẻ **đang hiển thị** (trang không phân trang nên phạm vi này là toàn bộ kết quả tìm kiếm), "Bỏ chọn" để làm sạch, nút "Xoá đã chọn (N)" tắt khi chưa chọn gì. `confirm()` nêu rõ chỉ xoá bản nháp tiến trình; trò chơi đã lưu trong Thư viện vẫn còn (check đo bằng `getLibrary()` trước/sau). Bar cập nhật tại chỗ nên checkbox vừa bấm vẫn là node cũ — không mất focus. Batch rỗng bị IPC từ chối thay vì lặng lẽ trả "0 đã xoá"; id không tồn tại bị báo `missing` chứ không tính là đã xoá.

**Lỗi thật tìm ra khi viết check.** `projectSelectedIds()` tỉa theo danh sách hiện có, nhưng `state.projects === null` ở mỗi lần render "đang tải" — tỉa vô điều kiện sẽ âm thầm xoá sạch lựa chọn giáo viên vừa tick khi `refreshProjectsPage()` chạy. Đã chặn bằng `if (!Array.isArray(projects)) return selected;` và chốt bằng check "a refresh keeps the ticks it already has".

**Commands run.** `npm run check` 0 · `npm run check:renderer-globals` 0 undefined (55/56 script, 774 hàm, 6.434 call site) · `npm run verify:css` **24/24** · `node tests/run-unit.js` **68/68** (26.4s) · `npx tsc -p tsconfig.json` 0 (cập nhật `dist/` để test trên app đang chạy) · `node tests/ui/ui-project-selection-check.js 9338` **17/17** trên Electron thật, profile sạch (bar đo thật 912×48, hộp tick 13×13 trong viewport) · không hồi quy ở các trang anh em, cùng instance: `ui-library-paging-check`, `ui-lessons-paging-check`, `ui-results-paging-check`, `ui-card-menu-check`, `ui-chrome-icons-check` đều "All … checks passed".

**Chưa xác minh.** Không có ảnh chụp và chưa review bằng mắt ở 1366×768 / 1920×1080: cửa sổ app bị che nên `Page.captureScreenshot` (kể cả `fromSurface`) không trả lời — mới chỉ có số đo hình học trong check. Bar mới dùng đúng bộ màu sáng của bar thư viện (#154), nên chưa có biến thể `dark:` riêng cho nó; `ui-dark-theme-check` chạy lại trên instance dùng chung các check khác nên **không tính là bằng chứng cho #163**. Chưa bấm luồng giáo viên thật với draft có ảnh đính kèm (`removeProjectImages()` dọn ảnh theo draft — hành vi kế thừa từ #127, chỉ được kiểm chứng gián tiếp qua `missing`). Trang vẫn chưa phân trang. Chưa chạy installer đóng gói.

**Next task.** (1) Nếu danh sách dự án dài thật sự, tách riêng một đợt phân trang cho trang này theo #154 (bar sẽ đổi nhãn thành "trang này"). (2) Nợ `dark:` cho hai bar chọn (thư viện + dự án) nên xử lý một lần. (3) Roadmap `Packaged check` vẫn cần máy sạch.

---

## Handoff - Bỏ brand + navbar, trạng thái llama.cpp và thông báo vào sidebar (2026-11-01, DECISIONS #162)

**Files changed.**
- `src/index.html`: xoá khối `.brand` và toàn bộ `<header class="topbar">` (breadcrumb `#pageCrumb`, `.local-pill`, `.top-avatar`); `<aside class="sidebar">` mở đầu bằng `<div class="sidebar-status" data-sidebar-status>` chứa thanh llama.cpp (nguyên `#aiStatusBar`, dropdown `#aiStatusDropdown`), chip `#globalAiActivity`, chuông `#topbarNotificationBtn` + popover `#topbarNotificationPopover`, `#topbarFullscreenBtn`, `#helpBtn`; khối ẩn ở rail hẹp (`max-compact:hidden`). Mọi `#id` và id `topbarNotification*` giữ nguyên để không phải sửa `ai-status.ts`/`shared.ts`/`bootstrap.ts`.
- `src/renderer/core/render.ts`: bỏ dòng ghi `#pageCrumb` (phần tử đã xoá; giữ lại sẽ ném lỗi mỗi lần render).
- `src/renderer/shared.ts`: xoá `pageNames` (chỉ breadcrumb dùng).
- `src/renderer/core/bootstrap.ts`: handler uỷ nhiệm click của `.sidebar` bỏ qua `[data-sidebar-status]` (nếu không, nút menu AI mang `data-action="ai-status-*"` bị `handleAction()` xử lý lần nữa); `$('#helpBtn')?.addEventListener`.
- `src/renderer/core/controller.ts`: **sửa lỗi thật** — `closeGameMenus()` chỉ đóng `[data-game-menu-root] [role="menu"]:not([hidden])`. Trước đó nó gắn thuộc tính `hidden` cho **mọi** `role="menu"` (kể cả dropdown llama.cpp, vốn quản trạng thái bằng class), và bootstrap gọi nó ở capture phase cho mọi click ngoài menu → dropdown đo 0×0 vĩnh viễn dù class đã gỡ.
- `src/renderer/styles/shell.css`: bỏ `.topbar` sticky và `.ai-status-bar{top:72px}`; chỉ còn `.app-shell>.sidebar` sticky. `setup-wizard.css`: bỏ rule ẩn `.topbar, .ai-status-bar` (đã có `.app-shell{visibility:hidden}`). `game-treasure.css`: rule tối #97 đổi tiền tố `.topbar` → `.sidebar`.
- `src/renderer/styles/navigation.css`: `.sidebar-status` (xếp dọc, gap 8), `.sidebar-status-actions` (hàng 3 nút), `.sidebar .notification-popover{position:fixed;left:12px;top:120px;width:min(320px,calc(100vw - 24px))}` để sidebar `overflow-x:hidden` không cắt popover; cập nhật chú thích ngân sách chiều cao.
- `src/renderer/styles/components.css`: `.editor-page-head` thôi sticky; `.editor-save-bar` `top:68px` → `top:0`. `src/renderer/pages/settings.ts`: aside "Lưu" `sticky top-20` → `sticky top-5`.
- Tests: `ui-chrome-icons-check` (+2 check: brand/topbar/breadcrumb biến mất; trạng thái + chuông + toàn màn hình + trợ giúp nằm trong `.sidebar`), `ui-ai-status-bar-check` (dựng lại `[data-sidebar-status]`, thêm `visible` đo rect thật 209×161, thêm check mở lại sau click ngoài), `ui-card-menu-check` (đếm menu thẻ theo `[data-game-menu-root]`), `ui-fullscreen-check` (thay topbar bằng `#aiStatusBar` + z-index sidebar), `ui-setup-fullscreen-check` (bỏ `topbarVisible`), `smoke75` (T8 đo sidebar sticky + `barInSidebar`, đóng setup onboarding trước khi đo).
- Docs: `docs/DECISIONS.md` (#162), `docs/STATUS.md`, `docs/PROJECT_MAP.md`, `docs/handoff/status/2026-11-01.md` (chuyển bàn giao #159 vào lưu trữ).
- Không đổi: schema/IPC, engine trò chơi, `.egame`, SQLite, ai-status.ts, phần nối thông báo, bố cục trang.

**Behavior.** Cửa sổ chỉ còn sidebar + vùng trang, không còn dải ngang nào. Đầu sidebar là khối trạng thái: thanh llama.cpp (bấm mở menu tùy chọn, mở đúng 209×161 tại chỗ), chip "AI đang phân tích" khi có tiến trình, một hàng chuông thông báo (popover 320px mở sang phải, không bị cắt) + toàn màn hình + trợ giúp. Sidebar vẫn sticky toàn chiều cao và cuộn trong chính nó khi cửa sổ thấp. Ở 1366×768 toàn bộ sidebar nằm trong 768px (đáy `.profile` 750) nên không có hộp cuộn nào giấu nội dung; 1920×1080 cũng vậy. Menu thẻ ••• vẫn đóng đúng như cũ, và dropdown llama.cpp không còn bị nó làm hỏng.

**Commands run.** `npm run check` 0 · `npm run check:renderer-globals` 0 undefined (55/56 script, 770 hàm, 6.387 call site) · `npm run build:icons:check` **128 icon in sync** · `npm run build` 0 · `npm run verify:css` **24/24** · `node tests/run-unit.js` **68/68**. Electron thật (profile sạch, cổng 9385; riêng check wizard dùng cổng 9333): `ui-chrome-icons-check` **17/17**, `ui-ai-status-bar-check` **14/14**, `ui-card-menu-check` **12/12**, `ui-item-assets-editor-check` **29/29**, `ui-fullscreen-check` **20/20**, `ui-settings-sections-check` pass, `ui-dark-theme-check` pass, `ui-play-surface-check` **156/156**, `ui-setup-fullscreen-check` **10/10**, `smoke75` **17/17**.

**Chưa xác minh.** Sidebar cuộn khi cửa sổ thấp hơn ~687px (máy này mở thật ở 1266×635) — hành vi có từ trước #161, không phải hồi quy #162; chưa có bản gọn riêng cho cửa sổ thấp ngoài hai mức `max-height` sẵn có. Rail hẹp <700px ẩn cả khối trạng thái. Chưa review bằng mắt từng trang trong theme tối (rule tối đã đổi tiền tố và `ui-dark-theme-check` pass, nhưng chỉ đo tương phản chữ). Chưa chạy installer đóng gói.

**Next task.** Nếu cần: một mức `@media (max-height: 700px)` siết nav để footer không phải cuộn trên laptop thấp; còn lại Roadmap `Packaged check` vẫn cần máy sạch.

---

## Handoff - Icon Lucide đồng bộ toàn chrome, xoá trang Tổng quan, sidebar có khối "Lối tắt" (2026-11-01, DECISIONS #161)

**Files changed.**
- `src/renderer/features/ui-icons.ts` (**mới**): `uiIcon(name, className, size)` trả `<svg>` Lucide đồng bộ (18px mặc định, `''` với id lạ) cho markup chèn sau render; `paintUiIcons(root)` điền các hook `<span data-icon>` trong markup do `render()` sinh ra và trong shell tĩnh, idempotent, trả về số hook không vẽ được.
- `src/renderer/features/sidebar-shortcuts.ts` (**mới**): khối "Lối tắt" — tối đa 3 trò gần đây (bấm để chơi lại) + hai nút nhanh `Tạo từ giáo án` / `Dự án của tôi`; chỉ khai báo hàm, `core/render.ts` gọi lại mỗi render.
- `src/renderer/pages/home.ts` (**xoá**); `src/renderer/core/render.ts` (bỏ `home` khỏi `renderers`, fallback `renderLibrary`, gọi `paintUiIcons(document)` sau khi gán `#pageContent`, gọi `renderSidebarShortcuts()`), `src/renderer/shared.ts` (`state.page = 'library'`, `pageNames` bỏ `Home`, xoá `totalQuestions()`, menu thẻ + empty state + meta thẻ dùng icon), `src/renderer/core/bootstrap.ts`, `src/renderer/core/controller.ts` (ba nút xoá nhiều chuyển `textContent` → `innerHTML` + `uiIcon`, nếu không hook `trash` tĩnh bị xoá sau lần bấm đầu), `src/renderer/features/game-generation.ts`.
- `src/index.html`: sidebar 7 mục không còn `home`, mọi nav dùng hook `data-icon`, `<div data-sidebar-shortcuts>`, brand `✦` → `graduation-cap`, bỏ `LEARNING GAME BUILDER` + `KHÔNG GIAN LÀM VIỆC`, topbar (thông báo / toàn màn hình / trợ giúp / menu AI local) dùng Lucide, nạp `icon-data.js` → `ui-icons.js` → `sidebar-shortcuts.js` ngay trước `core/render.js`.
- Icon chrome trong các trang: `pages/{library,my-projects,sessions,lesson-plans,settings,create,create-wizard}.ts`, `features/{editor/*,wizard/step-*,wizard/state/providers,local-ai,setup-wizard}.ts`, `src/renderer/features/icon-data.ts` (sinh lại).
- `scripts/build-icon-registry.js`: nhóm `chrome` (+68 id → **128**), danh sách tải suy ra từ `ICON_GROUPS`, dừng khi một tên nằm ở hai nhóm.
- `src/renderer/styles/{components,navigation}.css`: hook `span[data-icon]` là flex box + svg block; khối `.sidebar-shortcuts` (kèm rule tối viết tay) và hai mức `@media (max-height: 950px/860px)`.
- Tests: `tests/ui/ui-chrome-icons-check.js` (**mới**, 15 check) + script `check:chrome-icons-ui`; `tests/unit/{asset-registry,renderer-load-order,setup-wizard-ui}.test.ts`; `tests/ui/{ui-settings-sections,nav-hint,ui-card-menu,ui-dark-theme,ui-fullscreen}-check.js`; `tests/manual/{verify-css,geom-ab,modal-ab}.js`; các smoke gõ `data-page="home"`.
- Docs: `docs/DECISIONS.md` (#161), `docs/STATUS.md`, `docs/PROJECT_MAP.md`.
- Không đổi: schema/IPC, engine trò chơi, `.egame`, SQLite, emoji nội dung trò chơi, tỉ lệ bán kính/đổ bóng toàn cục.

**Behavior.** Chrome dùng một bộ Lucide 24×24 nét 2, thừa hưởng `currentColor` nên theme tối đổi màu được (emoji thì không). Trang đích là **Thư viện trò chơi**; trang Tổng quan (hero gradient, bốn thẻ số liệu, ba thẻ gần đây/hoạt động/lối tắt) không còn, và hai việc nó làm thật — chơi lại game vừa mở, bắt đầu game mới — chuyển vào khối **"Lối tắt"** dưới sidebar, hiện ở mọi trang và tự cập nhật sau khi lưu game (không cần reload). "Đơn giản giao diện" = bỏ nhãn eyebrow IN HOA (10 chỗ), badge `CÀI ĐẶT`, dòng phụ thương hiệu, uppercase ở header dropdown, siết padding brand và bỏ đổ bóng/bo góc nặng ở thẻ offline; bố cục và luồng không đổi. Ở 1366×768 sidebar vẫn vừa: hàng lối tắt bỏ dòng phụ dưới 950px, ẩn hai nút lặp nav + thẻ offline dưới 860px (903px → 834px → ~726px so với 768px).

**Commands run.** `npm run check` 0 · `npm run build:icons:check` **128 icon in sync** · `npm run check:renderer-globals` 0 undefined (55/56 script, 770 hàm, 6.387 call site) · `npm run verify:css` **24/24** · `node tests/run-unit.js` **68/68** · `npm run build` 0. Electron thật, mỗi check một profile sạch (cổng 9380): `ui-chrome-icons-check` **15/15**, `ui-settings-sections-check` **26/26**, `ui-item-assets-editor-check` **29/29**, `ui-wizard-structure-check` **14/14**, `ui-house-building-check` **85/85**, `ui-game-worlds-check` **52/52**, `ui-play-surface-check` **156/156**, `ui-stage-illustration-check` **169/169**, `ui-presentation-check` **60/60**, `ui-input-routing-check` **52/52**, `ui-dark-theme-check` **9/9**, `ui-nav-hint-check` **15/15**, `ui-card-menu-check`, `ui-library-paging-check`, `ui-lessons-paging-check`, `ui-results-paging-check`, `ui-play-mode-card-check`, `ui-race-editor-check`, `ui-editor-art-check`, `ui-art-upload-flow-check`, `ui-ai-provider-settings-check`, `ui-ai-status-bar-check`, `ui-wizard-cancel-genre-check` **8/8** — tất cả pass.

**Chưa xác minh.** Emoji nội dung trò chơi (`games/*`, `result-screen`, marker/đội/HUD trong editor, nhãn thể loại) cố ý giữ nguyên theo phạm vi đã chốt — chưa đồng bộ. Tỉ lệ bán kính/đổ bóng toàn cục chưa đụng. Đỏ môi trường/có sẵn, **không do #161** (đã probe): `ui-fullscreen-check` 3 check trên profile sạch vì wizard cài đặt đang mở và `html[data-setup-fullscreen]` ẩn `.app-shell` (probe: `setupOpen:true, shellVisibility:'hidden'`); `ui-setup-fullscreen-check` 2/9 (đã ghi từ #160); `ui-draft-guard-check` 7/8 (không có nhà cung cấp AI); `ui-ai-tasks-paging-check` 6/8 (cần ≥11 mục lịch sử); `ui-classifier-outline-check` 14/15 (không có model local); `ui-house-building-check` từng lệch ~18px nhưng **84/84** trên HEAD chưa sửa. `src/renderer/features/wizard/state/providers.ts` hiện diff cả file 232/232 vì Git xếp nó vào loại binary — thay đổi thật chỉ là ba dòng `🟢/🟡/⚠` → hook. Chưa chạy installer đóng gói.

**Next task.** (1) Sửa `ui-setup-fullscreen-check` theo markup thật của wizard (chọn action theo màn `detecting`, đợi `renderSetupWizard()` thay vì sleep) — nhỏ, tách bạch, đã ghi từ #160. (2) Nếu muốn đồng bộ nốt emoji nội dung trò chơi thì cần một đợt riêng cho engine + marker/HUD. (3) Roadmap `Packaged check` vẫn cần máy sạch.




