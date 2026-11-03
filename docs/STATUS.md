# Trạng thái dự án

Bàn giao mới nhất nằm ngay trong file này (3 mục gần nhất). Các bàn giao cũ được lưu ở
`docs/handoff/status/` — mỗi ngày một file, nối thêm vào cuối file của ngày đó khi cần.
Quy ước: sau mỗi việc, chèn bàn giao mới ngay dưới tiêu đề "Bàn giao gần nhất"; nếu quá 3 mục,
chuyển mục cũ nhất vào file lưu trữ đúng ngày của nó và cập nhật mục lục.

## Mục lục bàn giao

### 2026-11-04
- Trang Giáo án thành **hai cột**: khung chat cố định 400 px bên trái (chọn nhiều giáo án, tải giáo án mới, chọn AI local hay đám mây), trả lời **kèm trích dẫn đúng nguồn**, và "Bộ câu hỏi" ra **định dạng arena** rồi bấm một nút là sang wizard ở bước hoàn tất **không gọi model lần hai**; BETA bị **xoá** chứ không đổi nhãn; cổng mới `check:lesson-chat-ui` **59 check** test luồng cloud bằng mock OpenAI loopback (#182)

### 2026-11-03
- Chữ **nhỏ và nhạt** thành hai con số có sàn: 11 px và 4,5:1 cho 16 màn hình giáo viên × 2 theme — baseline 184/538 dòng dưới ngưỡng và 124 dòng ≤ 10 px, nay **0 và 0**; `--color-muted` tự nó chỉ 3,90:1 nên một dòng token sửa được cả app; cổng mới `check:typography-ui` 8 check là phép kiểm đầu tiên đo **trạng thái hover/focus** (chữ từng biến mất đúng lúc con trỏ dừng trên nó, 1,13:1) (#181)
- Bước 2 **không cắt giáo án khi phân tích bằng AI đám mây** — hạn mức đọc là thuộc tính của nhà cung cấp, không của bài học; giao diện nói rõ đã đọc bao nhiêu ký tự và có cắt hay không; chữ hướng dẫn bước 2 giảm 27 % (#180)
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

## Handoff — Trang Giáo án **hai cột**: khung chat cố định gộp nhiều giáo án, trả lời kèm trích dẫn, bộ câu hỏi sang wizard không gọi model lần hai, BETA bị xoá (2026-11-04, DECISIONS #182)

**Files changed.** Mới: `src/services/lesson/lesson-chat.ts` (454 dòng — system prompt "chỉ trả lời dựa trên trích dẫn", `classifyLessonChatIntent`, `requestedQuestionCount`, thang máy trích dẫn đa tài liệu, contract `lesson_chat_answer`/`lesson_question_set`, `fallbackAnswer`), `src/renderer/features/lesson-chat.ts` (644 dòng — state + HTML + IPC của khung chat), `src/renderer/styles/lesson-chat.css` (478 dòng, chỉ token), `tests/ui/ui-lesson-chat-check.js` (637 dòng, **59 check**, khai báo trong `package.json` là `npm run check:lesson-chat-ui`). Sửa: `src/shared/lesson-types.ts` (+98: `LessonChatRole/Intent/ComposerMode/Citation/Turn/Conversation` và `draftSource` thêm nhánh `'chat-questions'`), `src/services/storage/lesson-store.ts` (+321: bảng `lesson_chats` + `lesson_chat_messages` với `ON DELETE CASCADE` và index `updated_at DESC`; `appendChatTurn` / `getLessonChat` / `listLessonChats` / `deleteLessonChats` / `getDocumentWithText`), `src/main.ts` (+145: `lesson:chat-send` — phân giải provider **trước** `aiSingleFlight` để "chưa có AI" là lỗi cấu hình chứ không phải busy, `aiTasks.start({kind:'chat'})`, luôn ghi lượt kể cả lượt lỗi, `sendLessonProgress` theo bốn stage retrieve/generate/validate/ready; `lesson:generate` nhánh A nhận thêm nguồn `chat-questions`), `src/preload.ts` (bốn hàm bridge chat), `src/index.html` (script chat nạp **trước** `pages/lesson-plans.js` + region CSS mới), `src/renderer/styles/app.css` (`@import` region), `src/renderer/core/controller.ts` (chỉ nối chat khi `state.page === 'lesson-plans'`), `src/renderer/core/bootstrap.ts` (`await lessonChatSyncWithLibrary()`), `src/renderer/pages/lesson-plans.ts` (grid hai cột, **xoá** panel BETA và `qaDocSelect`), `features/wizard/state/core.ts` (`wizardNoModelDraftSources = ['imported-questions','chat-questions']` + `wizardNoModelRunLabel`), `features/wizard/state/draft.ts` (`wizardUseImportedQuestions(gameType, provenance)`, `wizardAdoptQuestionSet(set, meta)`, `wizardChatProjectTitle`) — thay đổi thật **+82/−4**, diff hiện 465/387 vì blob cũ lưu CRLF còn `* text=auto` về LF (tiền lệ `providers.ts` #161), `step-configure.ts` + `step-generate.ts` (dòng chữ theo đúng nguồn), `tests/unit/lesson-store.test.ts` (+124), `tests/unit/renderer-load-order.test.ts` (+26), `tests/manual/verify-css.js` (+6 expectation), docs: `DECISIONS.md` #182, `STATUS.md`, `ROADMAP.md`, `docs/handoff/status/2026-11-03.md` (dời bàn giao #179 ra lưu trữ).

**Behavior.** Yêu cầu gốc, nguyên văn: *"trang Giáo án, phần hỏi đán chuyên sâu đang beta thì giờ phát triển và bỏ beta. Tôi muốn trang giáo án sẽ chia thành 2 phần, một bên sẽ là khung chatbot giống chatgpt khung này sẽ cố định bên còn lại là danh sách giáo án… cho phép tải lên giáo án mới vẫn cho phép chọn nhà cung cấp AI gồm AI local và AI đám mây, trước tiên hãy xây dựng flow cho AI đám mây và test sau đó làm flow tương tự cho AI local nhưng không test… nếu người dùng muốn tạo trò chơi hay tạo câu hỏi khi đó AI có thể trả ra dạng câu hỏi với định dạng định sẵn rồi cho phép chuyển qua chế độ tạo trò chơi. Cho phép người dùng kết hợp nhiều giáo án để hỏi, tổng hợp và tạo bộ câu hỏi."* Kết quả đo được: cột chat **400 px, `position: sticky`**, khung `704 px` trong viewport `800 px` (đáy khung `797 ≤ 800`, không tràn), transcript cuộn **trong** khung; panel BETA cũ **bị xoá** chứ không đổi nhãn; ô chọn nhà cung cấp liệt `local,gemini,openai,custom`; một cuộc trò chuyện gắn được **nhiều** giáo án (chip + picker có "Chọn tất cả", bỏ/chọn lại từng cái) và nút "Tải giáo án mới" mở `dialog.showOpenDialog` (txt/md/docx/pdf/pptx). Lượt trả lời mang **5 trích dẫn trên 2 tài liệu**, dòng gửi lên model đánh số `[n] (tên giáo án)` nên nguồn không bị nhập nhằng; intent do máy cục bộ quyết (`answer`/`question_set`, công tắc trên composer luôn thắng, `?` cuối câu được hiểu là *hỏi về bài*), không bằng một lần gọi model. "Định dạng định sẵn" là **chính contract arena** (`lesson_question_set` dùng lại `gameDraftSchema`, `normalizeDraft` padded `q1…` + `a,b,c`), nên "Tạo trò chơi (3 câu)" mở wizard ở **bước hoàn tất** với 3 thẻ câu hỏi, tag "Bộ câu hỏi từ chat", dự án lưu `draftSource='chat-questions'`, tiêu đề "Giáo án 18A … + 1 giáo án" — và **số request tới endpoint không đổi (3 → 3)**: không có lần gọi model thứ hai; bấm "Lưu vào thư viện" là trò chơi chạy offline vì nó chỉ là data. Cloud được test bằng mock OpenAI trên `127.0.0.1` — `custom` chỉ nhận `http:` cho loopback ("trong môi trường thử nghiệm"), provider phải qua **nút kiểm tra kết nối thật** mới `usable` (#132), `EDUGAME_AI_TEST_DIR` để trống vì seam fixture trả lời *trước* transport, key là chuỗi giả và renderer chỉ nhận `••••chat`. **Lỗi thật mà cổng tìm ra rồi sửa:** lượt fail vì chưa có provider bị main ném exception trước khi ghi lịch sử, còn `catch` của `lessonChatSend` gọi `lessonChatOpen` — hàm đó **xoá** `lessonChatUi.error`, nên giáo viên bấm Gửi và **không thấy gì**; nay thông báo được đặt lại sau khi đọc lịch sử và bỏ vỏ IPC bằng đúng hai regex của `wizardParseError`, thành `AI local (llama.cpp) chưa sẵn sàng: Chưa có model…`.

**Commands run.** `npm run check` 0 · `npm run build` 0 (clean + tailwind + three 732 KB) · `npm run check:renderer-globals` 0 undefined (**928** hàm / **7.521** call site) · `npx tsc -p tsconfig.json` 0 rồi `node tests/run-unit.js` **74/74** (24,5 s) · `npm run verify:css` **38/38** · `npm run test:native` **1/1** · trên Electron thật (instance cổng 9347, profile sạch `Temp/qoder-lessonchat`, `EDUGAME_AI_TEST_DIR` đã unset): `check:lesson-chat-ui` **59 PASS / 0 FAIL**, chạy hai lần — lần 1 đỏ 3 (lỗi của *chính check*: `fill()` không thay placeholder, `project.game.questions` thay bằng `project.draft.questions`, `citations` đếm cả bóng thoại user; và 1 đỏ **thật** ở source như đoạn trên), lần 2 xanh hết, mock chỉ nhận `probe, answer, question_set`, tự dọn 1 cuộc trò chuyện + 2 giáo án giả lập + 1 dự án + 1 trò chơi và trả `custom` về `not-configured` · anh em mỗi gate một instance + profile sạch: `ui-lessons-paging-check` ✓ · `ui-input-routing-check` **52/52** · `ui-wizard-structure-check` **14/14** · `ui-project-selection-check` ✓ · `ui-card-menu-check` ✓ · `ui-chrome-icons-check` **17/17** · `check:typography-ui` **8/8** (1.526 dòng / 32 lượt = +16 dòng so với #181 chính là markup chat; nhỏ nhất 11 px, tệ nhất **4,74**, hover/focus 48 nhãn tệ nhất 4,72) · `check:dark-theme-ui` **23/23** (112 `<option>`/theme) · `check:settings-sections-ui` ✓ · `ui-ai-provider-wizard-check` ✓ · `ui-library-paging-check` ✓ · `ui-ai-provider-key-check` ✓ · `ui-wizard-cancel-genre-check` **8/8** · `ui-draft-guard-check` **7/8** — đỏ **có sẵn từ #153** (cần một provider dùng được; bật cả `EDUGAME_AI_TEST_DIR` vẫn đỏ vì seam chặn *sau* khi provider đã phân giải), không do #182. Ghi chú vận hành: `ui-chrome-icons-check` báo 1 đỏ *"the app lands on the library"* khi chạy **ngay sau** `ui-project-selection-check` trên cùng instance (check trước rời trang ở `my-projects`); chạy riêng là **17/17** — đúng loại coupling đã ghi ở #161/#166.

**What remains unverified.** (1) **Luồng local chưa chạy model thật** — đúng chỉ đạo *"không test vì test AI local trên máy yếu rất mất thời gian"*; bất biến đã chứng minh chỉ là *không âm thầm rơi về cloud*, còn `json_schema` strict trên llama.cpp và chất lượng bộ câu hỏi của model nhỏ thì **chưa có bằng chứng nào ngoài code**. (2) Cloud chỉ đi qua **mock loopback**: chưa lần nào có `lesson:chat-send` thật lên Gemini/ChatGPT (đó vẫn là nợ #180 cho `lesson:analyze`). (3) Chat mới đo ở **1280×800** qua `Emulation.setDeviceMetricsOverride`; cột 400 px trên **1366×768** thật chưa đo — lần thứ **sáu** đề nghị một tiết thật. (4) Trần `CHAT_EVIDENCE_MAX_CHARS = 3200`: gắn 4–5 giáo án thì trích dẫn **bị bớt**, giáo viên không thấy dấu hiệu nào. (5) Bộ câu hỏi chỉ ra dạng **arena**; ra race/treasure/matching vẫn phải đổi thể loại ở wizard, và chưa check nào buộc "bộ câu hỏi từ chat" đi qua nhánh đó. (6) Chưa test file **binary thật** (docx/pdf/pptx) qua nút "Tải giáo án mới" — gate gọi thẳng `saveLessonDocument` với `.txt` giả lập. (7) Không streaming; lịch sử chỉ mang **6** message × 700 ký tự sang model mà không hiện cho giáo viên; chat không đổi tên/không tìm kiếm/không xuất `.egame`; xoá dùng `confirm()` native (gate không bấm nên nhánh đó chưa chạy). (8) Chưa chạy installer đóng gói — nợ nhiều đời.

**Next recommended task.** (1) Cho **AI local** một bộ câu hỏi thật: bật llama.cpp trên máy dev *của giáo viên* (không phải máy yếu này) rồi chạy `ui-lesson-chat-check` với `local` — nhánh `json_schema` strict là chỗ dễ vỡ nhất mà chưa từng đo. (2) Hiện "AI đã đọc bao nhiêu / còn bao nhiêu bị cắt" ngay trong khung chat (nợ #180 + mục 4 ở trên, giờ có thêm một chỗ nữa để hỏi). (3) Một tiết thật 1366×768 trên hai cột (lần thứ sáu). Nợ cũ vẫn treo: một lần `lesson:analyze` cloud thật với key đã verify, và check bản đóng gói.

## Handoff — Chữ **nhỏ và nhạt** là hai con số: sàn 11 px + 4,5:1 cho mọi màn giáo viên, cổng mới đo cả trạng thái rê chuột (2026-11-03, DECISIONS #181)

**Files changed.** Mới: `tests/ui/ui-typography-readability-check.js` (444 dòng, **8 check** — 16 màn × 2 theme, nền paint thật của từng dòng, `CSS.forcePseudoState` cho hover/focus, tự seed + tự dọn 5 dòng `typo-probe-`), khai báo trong `package.json` là `npm run check:typography-ui`. Sửa token: `src/renderer/styles/app.css` (`--color-muted` và `--color-neutral` `#788196` → `#5f6a7d`, kèm comment vì sao component CSS phải dùng alias `var(--muted)` chứ không dùng `var(--color-muted)`), `src/renderer/styles/base.css:22` (mới `--danger-ink: #b42318` — `#e65b68` làm **mực** chỉ 3,46:1). Sửa bảng dịch: `src/renderer/styles/shell.css` (+95 dòng — `--danger-ink: #fca5a5` trong dark; 6 dòng hex mới cho `#4b5566`/`#4f5a6e`/`#5f6a7d`/`#4f46e5`/`#9c4808`/`#dc2626`/`#b42318`/`#c33b4b`, có ghi rõ `#4338ca` **cố ý không dịch**; **3 hòn đảo sáng** `html[data-theme=dark]:not([data-fullscreen]) .modal` / `.quick-action` / `.wizard-tree`; `.nav-item.active` + `.nav-item:hover:not(.active)`; 3 rule ghim vệt `hover:bg-[#f5f6fa|#f8f7ff|#eeeefe|#fff1f2]`), `src/renderer/styles/components.css` (239 dòng: `.btn` 12→13 px, `.btn-small`/`.text-link` 11→12, `.tag` 9 px `#788196`→11 px `#4f5a6e`+600, `.field-hint` 10→12 px, `.panel-sub` 11→12 px, `.select`/`.field input` 12→13 px, họ `.editor-art-*`/`.wizard-art-*`/`.wizard-item-*`), `src/renderer/styles/navigation.css` (`.shortcut-label` 9 px 2,51:1 → 11 px 6,73:1 cùng 6 dòng họ shortcut), `setup-wizard.css`, `wizard.css`. Sửa markup: `src/index.html` (7 `.nav-item` `#717b90`→`#4b5566`, khối trạng thái AI, dropdown thông báo, thẻ offline, profile), `src/renderer/shared.ts` (timestamp 9→11 px, chip chế độ chơi 9→11 px `#c9792b`→`#9c4808`, badge ảnh bìa `#5f58b8`→`#4338ca`), `core/controller.ts:629`, `pages/{library,settings,create,lesson-plans,my-projects,sessions,create-wizard}.ts`, `features/settings.ts`, `features/wizard/step-*.ts` + `state/providers.ts`. Sửa test: `ui-dark-theme-check.js` (expectation dòng hint), `ui-settings-sections-check.js` (mực tab + **tự reset** kịch bản), `ui-ai-provider-wizard-check.js` (TEARDOWN trả page về settings thật + check mới). Docs: `DECISIONS.md` #181, `STATUS.md`, `ROADMAP.md`, `docs/handoff/status/2026-11-03.md` (dời bàn giao #178 ra lưu trữ).

**Behavior.** Yêu cầu gốc, nguyên văn: *"tôi cảm giác độ đậm của chữ rất nhỏ gây ra tình trạng khó đọc, cần làm cho chúng dễ đọc hơn"* — hai lời phàn nàn và cả hai đều đo được. Baseline **trước khi sửa**, bằng chính phép đi cây của cổng mới (12 lượt, 538 dòng chữ đọc được, đã loại run chỉ toàn ký hiệu): **184 dòng dưới 4,5:1** (136 light / 48 dark, tệ nhất **1,08:1**) và **124 dòng ≤ 10 px**. Bốn nguyên nhân có cấu trúc: (1) chưa từng có **sàn cỡ chữ** nào — không phép kiểm nào đọc `fontSize`; (2) **`--color-muted` tự nó không đạt AA** — `#788196` = 3,90:1 trên trắng, 3,61:1 trên nền `.tag`, và nó là mực phụ của cả app nên sửa một dòng ăn nhiều hơn mọi cuộc find-and-replace; (3) **bảng dịch `shell.css` có năm lỗ mù** — gradient, utility token (`bg-brand-soft`/`text-brand`: ô điều hướng đang bật đo **2,09:1**), inline `style=`, component class ghim `background:#fff`, và **mọi utility mang variant**; (4) **tấm trắng nuốt mực dark** (`.modal` 13/14 dòng Help ở 1,2:1; `.quick-action`; `.wizard-tree`). Sau: một `--color-muted` đạt AA trên **mọi** bề mặt sáng (5,46 trên trắng · ≥5,01 trên nền tint), một alias mực-báo-lỗi `--danger-ink` lật đúng trong dark và được ghim lại trong hòn đảo sáng, sáu dòng bảng dịch, **ba hòn đảo sáng** dựng theo `.setup-fullscreen` (không lật nền vì `.modal-head`/`.field input`/`.wizard-tree-badge` đều tự ghim sáng — lật nền thành mảng loang lổ; và phải viết `color:` tường minh vì body đã *tính xong* alias, kế thừa là kế thừa giá trị đã tính). Lỗi nặng nhất mà chỉ cổng mới thấy: **chữ biến mất đúng lúc con trỏ hoặc phím Tab dừng trên nó** — `hover:bg-[#f5f6fa]` là class token khác nên lọt bảng dịch trong khi mực của phần tử thì đã bị dịch, đo 1,23/1,97/1,13:1; ba rule (0,3,0)+`!important` ghim lại tông tối #160 đã chọn. Cỡ chữ: **106 khai báo `font-size` viết lại**, markup mất **56 `text-[10px]` + 19 `text-[9px]`** (grep utility <11 px giờ trả 0) đổi lấy 173 × 12 px, 21 × 13 px, 19 × 11 px. Census độc lập sau sửa: **982 dòng, 0 dưới 4,5:1, 0 ≤ 10 px, tệ nhất 4,76**.

**Commands run.** `npm run check` 0 · `npx tsc -p tsconfig.json` 0 rồi `node tests/run-unit.js` **74/74** (25,7 s) · `npm run check:renderer-globals` 0 undefined (**893** hàm / 7.298 call site) · `npm run verify:css` **32/32** sau `npm run build:css` · `npm run build` 0 · trên Electron thật: `check:typography-ui` **8/8** — 1.510 dòng / 32 lượt (771 light / 739 dark), nhỏ nhất 11 px với **179** dòng đúng sàn, tệ nhất **4,74**, **548** dòng trong 4,5–7, **48** nhãn ép hover/focus tệ nhất **4,72**, 5 dòng seed đã xoá sạch · anh em: `check:dark-theme-ui` **23/23** (instance sạch 9349) · `check:settings-sections-ui` **25/25** · `ui-ai-provider-wizard-check` **40/40** · `ui-card-menu-check` **12** · `ui-chrome-icons-check` **17** · `ui-project-selection-check` **17** · `ui-wizard-structure-check` **14/14**.

**What remains unverified.** **Sàn chỉ áp cho màn hình giáo viên**: trong mặt chơi vẫn còn chữ < 11 px (`.treasure-map-meta`/`.treasure-map-branch` 8 px, `.treasure-sound-toggle`/`.treasure-mission-badge`/`.mission-col-title` 9 px, `game-connection.css:119` 9 px) — theo tiền lệ #167 nhưng đây là chỗ *học sinh* nhìn, cần một quyết định riêng. **548/1.510 dòng nằm ở 4,5–7:1**: đạt AA, chưa AAA; đẩy nốt cần 2–3 mực không tồn tại trong bảng màu, tức quyết định palette chứ không phải một lần fix. Không thêm expectation `verify:css` nào, nên lần sửa sau **xoá một dòng bảng dịch** của #181 chỉ bị bắt khi chạy cổng CDP, không bị lint tĩnh bắt. Chưa có ảnh chụp và chưa có một tiết thật nào — mọi con số là đo trên Electron 33, còn "dễ đọc hơn" theo mắt một giáo viên cụ thể chưa ai duyệt (đây là lần thứ **năm** đề nghị). Cân nặng mới chỉ đổi ở vài chip; dòng 11 px `font-weight:400` vẫn là đáy tuyệt đối của app, và dư địa còn lại là lên 12 px hoặc đặt 500, không phải đổi màu. `font-smoothing`/`optical-sizing` không đụng tới vì chưa có bằng chứng nào trong repo rằng chúng là nguyên nhân.

**Next recommended task.** (1) Mở thử 3–4 màn hình chính trên **một tiết thật** để giáo viên xác nhận "dễ đọc hơn" (đề nghị lần thứ năm — nó là gate thật duy nhất còn thiếu của #181). (2) Hỏi rõ **mặt chơi** có theo cùng sàn 11 px không: 5 lớp còn chữ 8–9 px ở ba trò, cần quyết định kích thước riêng vì học sinh ngồi cuối phòng. (3) Nếu giáo viên vẫn thấy nhạt, bước tiếp theo là **đẩy 548 dòng 4,5–7:1 lên ≥7** bằng một palette mực mới (2–3 giá trị), việc đó nên làm một lần có kiểm soát chứ không rải rác. Nợ #180 vẫn treo: một lần `lesson:analyze` thật với key cloud đã verify.

## Handoff — Bước 2: AI đám mây **đọc trọn giáo án**, và giao diện nói rõ đã đọc bao nhiêu (2026-11-03, DECISIONS #180)

**Files changed.** Sửa: `src/services/lesson/lesson-preprocess.ts` (mới `LESSON_PREPROCESS_NO_CUT = Infinity` và `preprocessBudgetForProvider(mode, providerId)`; `preprocessLessonSource` đọc sentinel **trước** nhánh fallback `Number.isFinite` và bỏ luôn xếp hạng khối khi không có gì để bỏ, nên không viết lại dòng trống của giáo viên và không báo `rankingSavingsChars` ảo), `src/services/lesson/lesson-selection.ts` (`budgetFrom` cùng đọc sentinel trước — thiếu một trong hai chỗ là đám mây vẫn bị cắt y như cũ), `src/main.ts` (`prepareSelectionForAnalyze(text, ids, mode, providerId)`; mới `describeAnalyzeInput(...)` dựng object `sent`; `lesson:analyze` **phân giải provider trước** khi chuẩn bị phạm vi rồi dùng `preprocessBudgetForProvider` cho cả request lẫn fingerprint và trả thêm `sent` + ghi log `analyze.input`; `lesson:preview-selection` nhận `providerId` và coi thiếu = `local`; `publicSettingsView` gửi `ai.lessonAnalyzeBudget`), `src/shared/types.ts` (`sent` trong kiểu trả về của `analyzeLesson`), `src/renderer/features/wizard/step-analysis.ts` (mới `wizardAnalyzeBudgetHintHtml()` + `wizardAnalysisSentText()`; dòng "Đang đọc giáo án…" bị xoá vì progress block đã được host ở `pages/create-wizard.ts:46`; `wizardState.analysisSent` gán/xoá quanh lần chạy), `src/renderer/features/wizard/state/providers.ts` (mới `wizardAnalyzeProviderId()`; `wizardSelectProvider` đo lại preview bước 1; bốn dòng chữ ngắn lại), `src/renderer/features/wizard/state/core.ts` (`analysisSent` trong state + trong `wizardReset`), `src/renderer/features/wizard/step-structure.ts:316` (preview gửi `providerId`), `tests/unit/lesson-preprocess.test.ts` (+khối #180), `tests/unit/lesson-selection.test.ts` (+khối #180), `tests/ui/ui-ai-provider-wizard-check.js` (+6 check), `docs/DECISIONS.md` #180, `docs/STATUS.md`, `docs/ROADMAP.md`, `docs/handoff/status/2026-11-03.md` (dời bàn giao #177 ra lưu trữ).

**Behavior.** Yêu cầu gốc, nguyên văn: *"tinh giảm chữ ở trang tạo từ giáo án, bổ sung đầy đủ thông báo , ở bước 2 khi phân tích với AI đám mây thì không cần cắt bớt tài liệu"*. (1) **Không cắt nữa khi chạy đám mây**: 12.000/18.000 ký tự là cửa sổ ngữ cảnh của llama.cpp đi kèm máy, không phải thuộc tính của một bài học, nên từ nay hạn mức đọc là hàm của **nhà cung cấp sắp chạy** — local giữ nguyên từng ký tự, mọi provider khác nhận toàn bộ tài liệu đã dọn. Dùng `Infinity` thay cho một số to để "không cắt" là một sự thật code nói được chứ không phải một trần có ngày bị vượt; `budgetChars` vì thế là `number | null` và UI in "không cắt bớt" thay vì một con số bịa. Cache vẫn đúng khớp R3-#132: `selectionFingerprint` băm cả hạn mức và provider được phân giải **trước** khi soạn phạm vi, nên local↔cloud luôn phân tích lại, không bao giờ dùng lại kết quả của một lần đọc khác. (2) **Thông báo đủ**: trước khi chạy, một dòng nói luật sẽ áp (`AI local chỉ đọc 12.000 ký tự. Hãy chọn mục ở bước 1 để đúng đoạn cần.` / `AI đám mây đọc toàn bộ giáo án — không cắt bớt.`), và bài nào ngắn hơn hạn mức thì **không có dòng nào**; sau khi chạy, `sent` do **chính các hàm soạn request** đo — `AI đã đọc toàn bộ 43.180 ký tự của giáo án — không cắt.` / `AI chỉ đọc 12.000/43.180 ký tự của giáo án. Hãy chọn phần hẹp hơn hoặc dùng AI đám mây.` / `AI chỉ đọc 4.200/5.100 ký tự của phần đã chọn. 3 mục không vừa hạn mức.` — câu này nằm trong panel xem lại nên **sống lâu hơn notice** đang mờ đi, và được ghi cả vào log AI. Con số hạn mức không hard-code ở renderer. Bản xem trước bước 1 cũng hỏi theo provider, hết cảnh dọa cắt một nhát cắt không tồn tại; đổi provider là đo lại preview. (3) **Ít chữ hơn**: mười một dòng hướng dẫn được viết lại hoặc xoá, phần chữ đã tồn tại từ trước giảm **858 → 628 ký tự (−27 %)** và một dòng trùng với progress block bị xoá hẳn; 220 ký tự chữ mới là đúng hai câu sự thật ở trên.

**Commands run.** `npm run check` 0 · `npx tsc -p tsconfig.json` 0 rồi `node tests/run-unit.js` **74/74** (25,8 s) · `npm run check:renderer-globals` 0 undefined (**893** hàm / 7.298 call site) · `npm run build` 0 · trên Electron thật (instance cổng 9343, profile sạch `Temp/egame180`): `ui-ai-provider-wizard-check` **39 PASS / 0 FAIL** ("all checks passed", 6 check #180 lấy nguyên văn câu in ra màn hình), `ui-wizard-structure-check` **14/14** · **probe IPC thật** `lesson:preview-selection` với tài liệu 51.582 ký tự: `local` → 11.985, `truncated:true`, 1 warning; `gemini` → **51.582**, `truncated:false`, **0** warning; `openai` + deep → 51.582 không cắt; không nêu provider → 11.985 (đúng như hôm qua); `getSettings().ai.lessonAnalyzeBudget` = 12.000 trên profile local.

**What remains unverified.** **Không có một lần gọi model thật nào** (profile scratch không có llama.cpp chạy và không có key cloud đã kiểm tra): đường `sent`/`analyze.input` **bên trong** `lesson:analyze` chưa chạy end-to-end — nó được chứng minh bằng các hàm thuần + đơn vị + render state, và `describeAnalyzeInput` bản thân nó không có unit test riêng. Đề bài chỉ nói bước 2 nên **phía sinh nội dung (bước 5) vẫn trích ≤ 4.500/6.000/1.800 ký tự theo câu** (`lesson-retrieval.ts:45/52/58`) — chưa hỏi giáo viên có muốn "đọc trọn" khi tạo nội dung bằng đám mây không. Local mode deep vẫn cắt ở 18.000, và chưa có cách nào để giáo viên **nâng** cửa sổ local khi model của họ rộng hơn. `sent` mới hiện ở wizard, chưa ở màn Tasks/lịch sử. Cuối: các baseline `smoke66`/`bench`/`real-ai-e2e` không chạy lại (khoá cache chỉ đổi khi có `providerId` thật, và preview thiếu provider vẫn đi nhánh cũ — nhưng đó là suy luận, chưa phải đo).

**Next recommended task.** (1) Một lần `lesson:analyze` **thật** với Gemini/OpenAI đã verify, trên một giáo án dài > 12.000 ký tự: xem `analyze.input` ghi gì và câu "đã đọc" hiện ra có đúng số đó không (đây là gate thật duy nhất còn thiếu của #180). (2) Hỏi giáo viên bước 5 có theo cùng luật "đám mây không cắt" không. (3) Đưa "AI đã đọc bao nhiêu" vào màn Tasks/lịch sử, và cho local một lối tăng cửa sổ.
