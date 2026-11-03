# Trạng thái dự án

Bàn giao mới nhất nằm ngay trong file này (3 mục gần nhất). Các bàn giao cũ được lưu ở
`docs/handoff/status/` — mỗi ngày một file, nối thêm vào cuối file của ngày đó khi cần.
Quy ước: sau mỗi việc, chèn bàn giao mới ngay dưới tiêu đề "Bàn giao gần nhất"; nếu quá 3 mục,
chuyển mục cũ nhất vào file lưu trữ đúng ngày của nó và cập nhật mục lục.

## Mục lục bàn giao

### 2026-11-03
- Bước 2 **không cắt giáo án khi phân tích bằng AI đám mây** — hạn mức đọc là thuộc tính của nhà cung cấp, không của bài học; giao diện nói rõ đã đọc bao nhiêu ký tự và có cắt hay không; chữ hướng dẫn bước 2 giảm 27 % (#180)
- Chế độ Xây nhà: HUD "Đã xây n/m phần" rời dải ngang sang **cột phải**, màn trình diễn đặt **nhà một bên — lời giải thích một bên**; `houseTarget()` chỉ còn đo một ô DOM và sizing đọc **hộp bao của hình chiếu** (8 góc envelope) thay vì hằng số `0,78`; trên **máy chiếu** cột HUD không còn bị `wizard.css:409` ẩn sạch, và `flex-wrap: nowrap` giữ hai cột cạnh nhau ở cả hai màn (#179)
- Ghép xong thì hiện **cả hai vế** của cặp (board · SVG · máy chiếu · dòng "Đã ghép"), và một câu trả lời đúng không còn phóng nhỏ cả bầu trời 11 % rồi bỏ nhãn lại ở trời cũ (#178)
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

## Handoff — Bước 2: AI đám mây **đọc trọn giáo án**, và giao diện nói rõ đã đọc bao nhiêu (2026-11-03, DECISIONS #180)

**Files changed.** Sửa: `src/services/lesson/lesson-preprocess.ts` (mới `LESSON_PREPROCESS_NO_CUT = Infinity` và `preprocessBudgetForProvider(mode, providerId)`; `preprocessLessonSource` đọc sentinel **trước** nhánh fallback `Number.isFinite` và bỏ luôn xếp hạng khối khi không có gì để bỏ, nên không viết lại dòng trống của giáo viên và không báo `rankingSavingsChars` ảo), `src/services/lesson/lesson-selection.ts` (`budgetFrom` cùng đọc sentinel trước — thiếu một trong hai chỗ là đám mây vẫn bị cắt y như cũ), `src/main.ts` (`prepareSelectionForAnalyze(text, ids, mode, providerId)`; mới `describeAnalyzeInput(...)` dựng object `sent`; `lesson:analyze` **phân giải provider trước** khi chuẩn bị phạm vi rồi dùng `preprocessBudgetForProvider` cho cả request lẫn fingerprint và trả thêm `sent` + ghi log `analyze.input`; `lesson:preview-selection` nhận `providerId` và coi thiếu = `local`; `publicSettingsView` gửi `ai.lessonAnalyzeBudget`), `src/shared/types.ts` (`sent` trong kiểu trả về của `analyzeLesson`), `src/renderer/features/wizard/step-analysis.ts` (mới `wizardAnalyzeBudgetHintHtml()` + `wizardAnalysisSentText()`; dòng "Đang đọc giáo án…" bị xoá vì progress block đã được host ở `pages/create-wizard.ts:46`; `wizardState.analysisSent` gán/xoá quanh lần chạy), `src/renderer/features/wizard/state/providers.ts` (mới `wizardAnalyzeProviderId()`; `wizardSelectProvider` đo lại preview bước 1; bốn dòng chữ ngắn lại), `src/renderer/features/wizard/state/core.ts` (`analysisSent` trong state + trong `wizardReset`), `src/renderer/features/wizard/step-structure.ts:316` (preview gửi `providerId`), `tests/unit/lesson-preprocess.test.ts` (+khối #180), `tests/unit/lesson-selection.test.ts` (+khối #180), `tests/ui/ui-ai-provider-wizard-check.js` (+6 check), `docs/DECISIONS.md` #180, `docs/STATUS.md`, `docs/ROADMAP.md`, `docs/handoff/status/2026-11-03.md` (dời bàn giao #177 ra lưu trữ).

**Behavior.** Yêu cầu gốc, nguyên văn: *"tinh giảm chữ ở trang tạo từ giáo án, bổ sung đầy đủ thông báo , ở bước 2 khi phân tích với AI đám mây thì không cần cắt bớt tài liệu"*. (1) **Không cắt nữa khi chạy đám mây**: 12.000/18.000 ký tự là cửa sổ ngữ cảnh của llama.cpp đi kèm máy, không phải thuộc tính của một bài học, nên từ nay hạn mức đọc là hàm của **nhà cung cấp sắp chạy** — local giữ nguyên từng ký tự, mọi provider khác nhận toàn bộ tài liệu đã dọn. Dùng `Infinity` thay cho một số to để "không cắt" là một sự thật code nói được chứ không phải một trần có ngày bị vượt; `budgetChars` vì thế là `number | null` và UI in "không cắt bớt" thay vì một con số bịa. Cache vẫn đúng khớp R3-#132: `selectionFingerprint` băm cả hạn mức và provider được phân giải **trước** khi soạn phạm vi, nên local↔cloud luôn phân tích lại, không bao giờ dùng lại kết quả của một lần đọc khác. (2) **Thông báo đủ**: trước khi chạy, một dòng nói luật sẽ áp (`AI local chỉ đọc 12.000 ký tự. Hãy chọn mục ở bước 1 để đúng đoạn cần.` / `AI đám mây đọc toàn bộ giáo án — không cắt bớt.`), và bài nào ngắn hơn hạn mức thì **không có dòng nào**; sau khi chạy, `sent` do **chính các hàm soạn request** đo — `AI đã đọc toàn bộ 43.180 ký tự của giáo án — không cắt.` / `AI chỉ đọc 12.000/43.180 ký tự của giáo án. Hãy chọn phần hẹp hơn hoặc dùng AI đám mây.` / `AI chỉ đọc 4.200/5.100 ký tự của phần đã chọn. 3 mục không vừa hạn mức.` — câu này nằm trong panel xem lại nên **sống lâu hơn notice** đang mờ đi, và được ghi cả vào log AI. Con số hạn mức không hard-code ở renderer. Bản xem trước bước 1 cũng hỏi theo provider, hết cảnh dọa cắt một nhát cắt không tồn tại; đổi provider là đo lại preview. (3) **Ít chữ hơn**: mười một dòng hướng dẫn được viết lại hoặc xoá, phần chữ đã tồn tại từ trước giảm **858 → 628 ký tự (−27 %)** và một dòng trùng với progress block bị xoá hẳn; 220 ký tự chữ mới là đúng hai câu sự thật ở trên.

**Commands run.** `npm run check` 0 · `npx tsc -p tsconfig.json` 0 rồi `node tests/run-unit.js` **74/74** (25,8 s) · `npm run check:renderer-globals` 0 undefined (**893** hàm / 7.298 call site) · `npm run build` 0 · trên Electron thật (instance cổng 9343, profile sạch `Temp/egame180`): `ui-ai-provider-wizard-check` **39 PASS / 0 FAIL** ("all checks passed", 6 check #180 lấy nguyên văn câu in ra màn hình), `ui-wizard-structure-check` **14/14** · **probe IPC thật** `lesson:preview-selection` với tài liệu 51.582 ký tự: `local` → 11.985, `truncated:true`, 1 warning; `gemini` → **51.582**, `truncated:false`, **0** warning; `openai` + deep → 51.582 không cắt; không nêu provider → 11.985 (đúng như hôm qua); `getSettings().ai.lessonAnalyzeBudget` = 12.000 trên profile local.

**What remains unverified.** **Không có một lần gọi model thật nào** (profile scratch không có llama.cpp chạy và không có key cloud đã kiểm tra): đường `sent`/`analyze.input` **bên trong** `lesson:analyze` chưa chạy end-to-end — nó được chứng minh bằng các hàm thuần + đơn vị + render state, và `describeAnalyzeInput` bản thân nó không có unit test riêng. Đề bài chỉ nói bước 2 nên **phía sinh nội dung (bước 5) vẫn trích ≤ 4.500/6.000/1.800 ký tự theo câu** (`lesson-retrieval.ts:45/52/58`) — chưa hỏi giáo viên có muốn "đọc trọn" khi tạo nội dung bằng đám mây không. Local mode deep vẫn cắt ở 18.000, và chưa có cách nào để giáo viên **nâng** cửa sổ local khi model của họ rộng hơn. `sent` mới hiện ở wizard, chưa ở màn Tasks/lịch sử. Cuối: các baseline `smoke66`/`bench`/`real-ai-e2e` không chạy lại (khoá cache chỉ đổi khi có `providerId` thật, và preview thiếu provider vẫn đi nhánh cũ — nhưng đó là suy luận, chưa phải đo).

**Next recommended task.** (1) Một lần `lesson:analyze` **thật** với Gemini/OpenAI đã verify, trên một giáo án dài > 12.000 ký tự: xem `analyze.input` ghi gì và câu "đã đọc" hiện ra có đúng số đó không (đây là gate thật duy nhất còn thiếu của #180). (2) Hỏi giáo viên bước 5 có theo cùng luật "đám mây không cắt" không. (3) Đưa "AI đã đọc bao nhiêu" vào màn Tasks/lịch sử, và cho local một lối tăng cửa sổ.

## Handoff — Xây nhà: HUD sang **cột phải**, máy chiếu giữ cả hai cột, sizing theo **hộp bao hình chiếu** (2026-11-03, DECISIONS #179)

**Files changed.** Sửa: `src/renderer/features/games/quiz.ts` (sân khấu Xây nhà thành **hai cột**: `.house-side-col` mang `.house-progress` + `#answerFeedback`; câu hỏi, đáp án và ô nhà ở `.stage-col.is-main`), `src/renderer/features/games/house.ts` (`houseEnvelope(style)` đi hết 73 spec để lấy min/max ba trục thay bảng `HOUSE_BOUNDS` chép tay; `houseHullPx()` chiếu **tám góc** của envelope; `houseTarget()` bỏ hẳn nhánh "dải tự do", quy ô DOM về **pixel layout** rồi mới fit, lặp co + tịnh tiến 6 pass với ratio khống chế trong [0,25; 4], chốt giữa ô, và trả `null` thay vì một scale hỏng), `src/renderer/features/three-game-interaction.ts` (mới `stageProject(handle, x, y, z)` — nghịch đảo **giải tích** của `stagePoint`, đặt nhà không cần khung hình đã vẽ), `src/renderer/styles/game-house.css` (hai cột + **`flex-wrap: nowrap`**, ô nhà giãn hết cột trái ở màn trình diễn, bỏ trần 1120 px riêng cho Xây nhà, **hai override toàn màn hình** giữ cột HUD + thẻ giải thích), `tests/ui/ui-house-building-check.js` (108 → **118** check: 16 assert hull + 10 check máy chiếu), `docs/DECISIONS.md` #179, `docs/STATUS.md`, `docs/ROADMAP.md`, `docs/handoff/status/2026-11-03.md` (dời bàn giao #174–#176 ra file lưu trữ).

**Behavior.** Yêu cầu gốc, nguyên văn: *"quay lại đấu trường tri thức chế độ xây nhà, tinh chỉnh hud tôi gửi di chuyển qua 1 bên . Khi trả lời đúng và chỉnh qua màn , sắp xếp lại ngôi nhà 1 bên và hub giải thích 1 bên"*. Một bố cục hai cột dùng cho **cả hai** màn nên HUD không đổi chỗ khi học sinh trả lời, nhà lớn lên **tại chỗ**, và lời giải thích dài không còn ăn vào nhà vì hai thứ ở hai cột; `houseTarget()` chỉ còn đo **một** ô DOM. Hai lỗi bố cục thật bị gate cũ bỏ qua: (a) hằng số `HOUSE_SHOWCASE_FILL 0,78` đắp lên một lỗi có cấu trúc — sizing theo footprint × `pxPerUnit` khiến sân 4,08 đơn vị của `nha-vuon` vẽ ra **456 px trong ô 423 px** (1366×768) và **532 px trong ô 426 px** (1920×1080), nhà tràn ra ngoài chính thẻ của nó; (b) `wizard.css:409` ẩn **mọi** cột phụ không có `.stage-illustration` khi toàn màn hình, mà cột Xây nhà không bao giờ có ảnh ⇒ trên máy chiếu HUD và banner "✓ Chính xác!" về **0×0**, cột chữ chiếm 1255/1255 px. Thêm một lỗi mà chính check mới lộ: `flex-wrap: wrap` kế thừa từ `.stage-center` làm HUD **rơi xuống dưới sân khấu** (hàng được chia *trước khi* co), và hai hệ toạ độ px (`getBoundingClientRect` đã biến hình vs `clientWidth` layout) khiến nhà chỉ chiếm `0,92²` ô, tâm lệch 41 px. Sau sửa, 1600×1000: `scale 0,8329 → 1,9393`, hull `586..765 × 515..880` nằm trong ô `348..822 × 273..1053`, còn 197 px tới cột chữ, stage **678 px không đổi cả sáu câu**, đáy stage = đáy mặt chơi = 892. Máy chiếu 1366×768: cột HUD `1045..1319` (273 px) cạnh cột chữ 978 px, hull trình diễn `377..753 × 454..637` trong ô `47..1025 × 207..696`.

**Commands run.** `npm run build:css` (Tailwind v4.3.3, Done in 1s) · `npm run check` 0 · `npm run build` 0 (clean + tailwind + three 732 KB) · `node tests/run-unit.js` **74/74** (28,3 s) · `npm run check:renderer-globals` 0 undefined (**890** hàm / 7.275 call site) · `npm run verify:css` **32/32** · trên Electron thật (instance cổng 9342 có rAF, `Page.reload {ignoreCache}` sau mỗi lần sửa CSS): `ui-house-building-check` **118/118** — **hai lần liên tiếp trong cùng một phiên** và lần thứ **ba** sau `npm run build` sạch, 0 FAIL cả ba · anh em: `ui-stage-illustration-check` **169/169** · ảnh chụp `tests/ui/shots/house-179b-*.png`, `house-179c-showcase-full-1366x768.png` (trước sửa), `house-179d-full-before/after.png`.

**What remains unverified.** **Toàn màn hình vẫn là cờ do check đặt**, không phải cửa sổ OS thật (`data-fullscreen` chỉ main process ghi, `window.eduGame` contextBridge không stub được) — một tiết thật trên máy chiếu 1366×768 vẫn chưa ai ngồi xem, nay là **đề nghị thứ tư liên tiếp**. `flex-wrap: nowrap` đổi 277 px: cột chữ màn đọc câu hỏi co từ 1255 xuống **978 px** trên máy chiếu, chưa đo lưới đáp án ở chiều ngang nhỏ hơn (1024×768). Vòng fit 6 pass trả `null` khi không hội tụ — an toàn nhưng **im lặng**, chưa có tín hiệu nào cho giáo viên. `stageProject` giả định camera không yaw/roll. Các stage đầu của nhà trông **nhỏ và thấp** so với ô vì sizing dùng envelope của nhà hoàn chỉnh (đổi lấy một ô không nhảy kích thước — chưa hỏi giáo viên muốn nhà lớn dần không). HUD và lời giải thích nằm sau câu hỏi/đáp án trong DOM, chưa xếp lại thứ tự cho screen-reader.

**Next recommended task.** (1) Một tiết thật 1366×768 ở chế độ Xây nhà: nhìn bằng mắt HUD/cột lời giải thích trên máy chiếu và nhà ở các stage đầu (nợ từ #174, #177, #178). (2) Nợ roadmap vẫn treo: **check bản đóng gói** (installer) — chưa lần nào chạy. (3) Nợ cũ của #178 chưa có trả lời: màn kết quả 3D chòm sao có liệt kê cặp `A → B` không, và quy ước cho vế dài quá 60 ký tự trên máy chiếu.

## Handoff — Một cặp đã ghép hiện **cả hai vế**, và một câu đúng không được co cả bầu trời (2026-11-03, DECISIONS #178)

**Files changed.** Sửa: `src/renderer/features/games/constellation.ts` (`constellationStarCaptions()` trả `{label, answer}`; thẻ mang `answer`; `constellationAnswerLine` + `constellationCardAria`; `constellationLabelWidthPx/Lines/CardFits` hỏi theo **cả cặp**; `constellationCardFits(anchor, text, sides.cardText)`; paint tự đo anchor — `updateStarAnchors()` thay `connectionStarAnchors()`), `src/renderer/styles/game-constellation.css` (`.constellation-card-answer` dòng vàng có kẻ trên + `→`; `.constellation-star text.constellation-svg-answer` 20 px; ô `#matchFeedback` cố định `clamp(48px, 7.2vh, 84px)` với selector thắng `:empty !important` của nhà chung), `src/renderer/features/games/connection.ts` (`constellationSvg` vẽ dòng trả lời cho sao đã ghép, tự lật lên khi sát đáy viewBox; `refreshConnectionPanel` truyền `pairText`/`pairAnswerText`), `src/renderer/features/presentation.ts` (`.conn-answer` 22 px + lane 32 px, đảo lên khi sát đáy), `src/renderer/features/games/result-screen.ts` (`answerText` trên node, `doneLabels` đọc `A → B`), `src/shared/presentation-types.ts` (`answerText?: string`), `tests/ui/ui-constellation-check.js` (80 → **91** check, mục "a joined pair shows both halves"), `docs/DECISIONS.md` #178, `docs/STATUS.md`, `docs/ROADMAP.md`, `docs/handoff/status/2026-11-02.md` (nhận bàn giao #173).

**Behavior.** Yêu cầu gốc, nguyên văn: *"khi kéo phần A và phần B thì chữ phần B bị mất thay vào đó là chữ phần A. Tôi muốn chữ cả 2 phần đều xuất hiện để đảm bảo học sinh dễ hiểu"*. Dữ liệu và tiến độ đều đúng; **cả bốn bề mặt chỉ vẽ một vế** (`sides.starText`), nên vế vừa tìm được chưa từng hiện ra. Nay board in vế B thành **dòng riêng trong thẻ của sao** (13 px — sàn đọc #174 giữ nguyên, không hy sinh cỡ chữ để nhét chữ), SVG không WebGL và máy chiếu (22 px, sàn phòng chiếu 20 px) cùng hiện, dòng "Đã ghép" đọc `A → B`, aria đọc cả cặp. Vế B **chỉ hiện sau cú thả** — in sẵn là lộ đáp án. `constellationCardFits()` hỏi theo cả cặp nên thẻ không nhảy xuống dải đúng lúc nó sáng. Kèm một lỗi **nặng hơn cả lỗi chữ** mà check mới bắt ra: câu trả lời đúng đầu tiên **phóng nhỏ cả bầu trời 11 %** (khung 489→434 px, `getFitScale()` 2,136→1,897) và nhãn dính lại ở trời cũ (`dx −36…−55 px`), vì `#matchFeedback:empty` bị `game-treasure.css` ẩn bằng `display:none !important` rồi bật ra 45+17 px giữa cột chứa cảnh — và `constellationReframeIfNeeded()` mù hoàn toàn vì nó chỉ so chiều cao **trong một lần paint** mà feedback được ghi **trước** paint. Sửa: ô phản hồi có chỗ cố định từ đầu (`border-box` + `overflow:hidden`, một hàng "✓ Ghép chính xác!" không bao giờ tràn), và paint **đo anchor thật** thay vì đọc cache. Sau sửa: `dx = 0` với cả năm thẻ, trước **và** sau cú ghép; `fit 1,846 → 1,846`, cảnh `422 → 422 px`; thẻ đã ghép nở tại chỗ 89×26 → 110×52 px. Lần sửa đầu tiên của chính tôi (`height: clamp(...)` không `!important`) **không ăn thua** — đo lại ra y hệt, vì khai báo thua độ đặc hiệu của `!important` nhà chung.

**Commands run.** `npm run check` 0 · `npm run build` 0 · `node tests/run-unit.js` **74/74** (31,9 s) · `npm run check:renderer-globals` 0 undefined (**887** hàm / 7.258 call site) · `npm run verify:css` **32/32** · trên Electron thật (instance cổng 9391, `Page.reload {ignoreCache}`): `ui-constellation-check` **91/91** — chạy **hai lần trong cùng một phiên**, 0 FAIL cả hai · anh em: `ui-connection-mode-check` **7/7**, `ui-matching-finish-check` **22/22**, `ui-three-game-check-4games` **41/41**, `ui-presentation-check` **60/60** · `ui-dark-theme-check` **23/23** trên instance riêng cổng 9349.

**What remains unverified.** **Màn kết quả 3D vẫn không hiện chữ của cặp nào** (chỉ bầu trời + số liệu + dòng "Đã ghép" ở cột bên) — chưa hỏi giáo viên muốn danh sách cặp ở hero hay ở cột số liệu. Vế dài quá 60 ký tự bị cắt `…` trên **máy chiếu** (board thì xuống dải, máy chiếu không có dải). Thẻ hai dòng **che sao lân cận** mới chỉ đo với nội dung ngắn 5 cặp; `constellationRefitCards` là lưới an toàn chưa thử với cặp dài. Chiều cao ô phản hồi lấy từ hàng đo thật 45 px — đổi cỡ chữ feedback thì phải đổi cả ô, chưa có check nào buộc hai thứ đi cùng nhau ngoài `fit/scene`. Vẫn chưa có ảnh chụp và chưa có tiết thật trên máy chiếu 1366×768.

**Next recommended task.** (1) Hỏi giáo viên màn kết quả 3D có cần hiện danh sách cặp `A → B` không (nó là bề mặt duy nhất còn thiếu chữ sau #178). (2) Chốt quy ước cho vế dài trên máy chiếu: cắt `…`, xuống hàng, hay thu nhỏ cả cặp. (3) Nợ cũ vẫn treo: một tiết thật 1366×768, và `ui-three-game-check-4games` chạy nhiều lần trong một phiên.
