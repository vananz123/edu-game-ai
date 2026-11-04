# Trạng thái dự án

Bàn giao mới nhất nằm ngay trong file này (3 mục gần nhất). Các bàn giao cũ được lưu ở
`docs/handoff/status/` — mỗi ngày một file, nối thêm vào cuối file của ngày đó khi cần.
Quy ước: sau mỗi việc, chèn bàn giao mới ngay dưới tiêu đề "Bàn giao gần nhất"; nếu quá 3 mục,
chuyển mục cũ nhất vào file lưu trữ đúng ngày của nó và cập nhật mục lục.

## Mục lục bàn giao

### 2026-11-04
- Bỏ dòng chữ thừa ở đầu khung chat, **khung chat 601 px / danh sách 335 px**, "Chọn giáo án" + "Tải giáo án mới" dời **vào trong khung gõ** (picker co transcript chứ không co frame: composer 245→388, scroll 401→258, frame vẫn 704), danh sách giáo án gói còn **một dòng + Xem chi tiết** — và "làm gọn" hoá ra là một **bug bố cục** khiến thẻ cao 338 px vì mỗi chữ một dòng; gate 72 → **87 check**, `verify:css` 39 → **44/44** (#184)
- Khung chat Giáo án **to lên theo số đo** (`clamp(520px, 46%, 640px)` — đo thật chat 520 / danh sách 415 px, không tràn) và **hỏi được mà không cần chọn hay tải giáo án**: một lượt không tài liệu là hợp lệ ở cả bốn tầng (renderer · main · store · service), có system prompt riêng để model **không bịa** về một bài nó chưa thấy; cổng `check:lesson-chat-ui` 59 → **72 check**, unit tầng chat lần đầu có test thuần (#183)
- Trang Giáo án thành **hai cột**: khung chat cố định 400 px bên trái (chọn nhiều giáo án, tải giáo án mới, chọn AI local hay đám mây), trả lời **kèm trích dẫn đúng nguồn**, và "Bộ câu hỏi" ra **định dạng arena** rồi bấm một nút là sang wizard ở bước hoàn tất **không gọi model lần hai**; BETA bị **xoá** chứ không đổi nhãn; cổng mới `check:lesson-chat-ui` **59 check** test luồng cloud bằng mock OpenAI loopback (#182)

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

## Handoff — Bỏ dòng chữ thừa ở đầu khung chat, **nới khung theo số đo mới**, chuyển chọn/tải giáo án **vào khung gõ**, gói danh sách giáo án còn **một dòng + Xem chi tiết** (2026-11-04, DECISIONS #184)

**Files changed.** Sửa: `src/renderer/features/lesson-chat.ts` (+15/−25 — xoá `lessonChatScopeText()` + `lessonChatProviderLabel()` + `<small data-lesson-chat-subtitle>`; `lessonChatSourcesHtml()` → `lessonChatAttachHtml()` và khối đó thành **dòng đầu tiên** của `.lesson-chat-composer`; note "chưa gắn giáo án" dời từ một span trong băng nguồn sang `title` của nút "Chọn giáo án"; empty-state viết lại), `src/renderer/styles/lesson-chat.css` (+59/−23 — `clamp(520px,46%,640px)` → **`clamp(600px, 63%, 900px)`**, breakpoint 1240 → `clamp(540px,58%,700px)`, ngưỡng xếp chồng **1100 → 1180 px**, mới `.lesson-chat-attach` (flex, wrap, gap 6), `.lesson-chat-composer .lesson-chat-pop{margin:0;max-height:230px}`, `.lesson-chat-input{min-height:96px;max-height:300px}`, họ `.lesson-card-more*`), `src/renderer/pages/lesson-plans.ts` (+44/−26 — `lessonLibraryCard` bỏ hàng `flex items-start justify-between … flex-wrap` để **xếp chồng** tên → meta → nút trong `min-w-0 flex-1`, thêm `<details class="lesson-card-more">` gói chủ đề + các lần phân tích + `lessonAnalysisLists(latest)`), `tests/ui/ui-lesson-chat-check.js` (+281/−15 — **72 → 87 check**: head không còn subtitle, attach + picker nằm trong composer/frame, bất biến "picker co transcript chứ không co frame", `max-height:230px`, dải cột mới, mục 10 mới `LESSON_CARD`/`CARD_CLOSED_AGAIN` đo thẻ gấp–mở–gấp lại, cộng check chống "xanh rỗng" *the analysed card was read, not skipped*), `tests/manual/verify-css.js` (+22/−7 — viết lại 2 pin theo số mới, thêm 5 pin). Docs: `DECISIONS.md` #184, `STATUS.md`, `ROADMAP.md`, `docs/handoff/status/2026-11-03.md` (dời bàn giao #181 ra lưu trữ).

**Behavior.** Yêu cầu gốc, nguyên văn: *"xóa "Hỏi 1 giáo án · bằng API tương thích OpenAI (tự cấu hình)" phần này , tăng khung chatbot thêm nữa , di chuyển tính năng chọn giáo án , tải giáo án vào bên trong khung gõ chat . Bên danh sách giáo án làm gọn thông tin thêm nút xem chi tiết."* (1) Head còn **57 px** và không còn node subtitle nào; hai hàm chỉ để dựng dòng đó bị xoá theo, không để lại code chết. Thông tin không mất mà **dời chỗ**: provider đã chọn hiện dưới ô gõ, còn "Hỏi N giáo án" thì chip tên từng bài nói cụ thể hơn. Gate bắt **cả hai** dấu hiệu (node vắng mặt *và* những từ đó vắng mặt trong `innerText`). (2) Cột chat **601 px**, danh sách **335 px**, không tràn, khung **704 px** đáy **797 ≤ viewport 800**; ô nhập 78→**96 px**. Nới được là vì hai việc dồn lại: composer mang thêm hàng gắn giáo án nên cần bề rộng, và danh sách đã gói gọn nên nhịn được cột hẹp hơn — hai vế của cùng một yêu cầu, tự đỡ nhau. (3) Hàng chip + "Chọn giáo án" + "Tải giáo án mới" là **dòng đầu của khung gõ** (đo 569×135 px), popover picker cũng vào trong composer; khung cao cố định nên **transcript** mới là chỗ co: **composer 245→388 px, scroll 401→258 px, frame vẫn 704 px** — gate gọi bất biến đó bằng tên. Lý do không phải thẩm mỹ: #183 chứng minh lượt không giáo án là hợp lệ, nên "lượt này đọc gì" phải thấy được đúng lúc đang soạn. (4) "Làm gọn" hoá ra là **bug bố cục**: hàng nút `basis auto` 147 px + `min-w-0 flex-1` ép khối tên xuống **29 px** với tên tệp dài → thẻ cao **338 px vì mỗi chữ một dòng** (đúng nợ #183 (5) "chưa đo xem thẻ có xuống dòng xấu không"). Xếp chồng thì tên nhận hết 186 px: **156 px** thẻ chưa phân tích, **219 px** thẻ đã phân tích gấp, **645 px** khi mở, `spill: []` cả ba trạng thái. Phần phân tích vào `<details>` — và ba thứ phải tắt để "gọn" đo được bằng số: marker UA của `<summary>` (`display:block` + `list-style:none` + `::-webkit-details-marker{display:none}`, vì không utility Tailwind nào với tới pseudo), caret quay bằng CSS `[open]` (gate phải tắt transition trước khi đọc `getComputedStyle`, cửa sổ bị che thì hoạt ảnh không chạy và phép đọc là ma trận của t=0), và nội dung `<details>` đóng **rời khỏi `innerText`** — chính là thứ làm "gọn" thành số đo, cũng chính là mở ra xanh rỗng khi `.app-shell` bị `visibility:hidden`, nên có check chặn đọc được 137/451 ký tự.

**Commands run.** `npm run check` 0 · `npm run build` 0 (tailwind 803 ms, three 732 KB) · `npx tsc -p tsconfig.json` 0 rồi `node tests/run-unit.js` **75/75** (25,5 s) · `npm run test:native` **1/1** · `npm run verify:css` **39 → 44/44** · `npm run check:renderer-globals` 0 undefined (**928** hàm / **7.517** call site) · trên Electron thật (instance cổng 9347, **profile sạch** `Temp/qoder-184gate4`, `EDUGAME_AI_TEST_DIR` unset): `check:lesson-chat-ui` **87 PASS / 0 FAIL**, `rc=0`, "all checks passed — mock requests: probe, answer, question_set, answer", tự dọn 2 cuộc trò chuyện + 2 giáo án + 1 dự án + 1 trò chơi và trả `custom` về `not-configured` · anh em, mỗi cổng một instance + profile sạch: typography **8/8** · settings-sections **25/25** · project-selection **17/17** · chrome-icons **17/17** · dark-theme **23/23** (instance riêng 9349 vì nó lật theme toàn app) · **bốn ảnh chụp** `tests/ui/shots/lesson-chat-184-{light,dark,card-open,picker}.png` (1280×800, `Emulation.setDeviceMetricsOverride` + `capture()` có timeout race, không xin OS focus).

**What remains unverified.** (1) Vẫn **chưa một lần đo trên 1366×768 thật**, và #184 thêm hai con số chưa đo: `clamp(540px,58%,700px)` của breakpoint 1240 và ngưỡng xếp chồng **1180 px** — lần thứ **tám** đề nghị một tiết học thật. (2) Cột danh sách từ 415 px xuống **335 px**: thẻ gọn đã, nhưng phần phân tích mở ra cao **645 px** nên một cột ngắn buộc cuộn dọc; chưa đo với **8–10 giáo án thật** (gate chỉ có 2). (3) `Xem chi tiết` chỉ hiện khi giáo án **có** phân tích — đúng ý nhưng chưa ai duyệt bằng mắt; tệp chưa phân tích vẫn hai hàng nút, không có gì để mở. (4) Composer đóng ở **245 px**: chưa đo "chỗ gõ còn lại bao nhiêu" cho một câu hỏi dài trên màn 768 px. (5) Info "bằng nhà cung cấp nào" không còn ở đầu khung, chỉ đọc được từ select dưới ô gõ. (6) Nợ #182/#183 giữ nguyên, không cái nào #184 trả: local chưa chạy llama.cpp, cloud mới đi mock loopback, trần trích dẫn 3200, không streaming, lịch sử 6 × 700 ký tự, chỉ dạng arena, `confirm()` native, chưa test binary thật, chưa chạy installer đóng gói.

**Next recommended task.** (1) Cho gate một kho **8–10 giáo án** với tên dài/ngắn lẫn lộn và phân tích nhiều lần — đó là chỗ duy nhất chứng minh "danh sách gọn" ở quy mô thật, và cũng là cách duy nhất bắt được cuộn dọc của thẻ 645 px. (2) Đo **1366×768 thật** (lần thứ tám) hoặc cho giáo viên **kéo** phân chia hai cột, vì mọi con số hiện tại là clamp do máy chọn, chưa số nào do mắt giáo viên. (3) Vẫn là gate thật còn thiếu của cả dòng #182–#184: một lần `lesson:chat-send` cloud thật với key đã verify, một lượt có giáo án và một lượt không.

## Handoff — Khung chat Giáo án **rộng theo số đo** và hỏi được khi **không gắn giáo án** nào (2026-11-04, DECISIONS #183)

**Files changed.** Mới: `tests/unit/lesson-chat.test.ts` (277 dòng — lần đầu tầng service của chat có test thuần, khai báo tự động qua `tests/run-unit.js`, không cần sửa `package.json`). Sửa: `src/renderer/styles/lesson-chat.css` (+18/−13 — `grid-template-columns` thành `clamp(520px, 46%, 640px)`, breakpoint 1240 thành `clamp(440px, 42%, 520px)`, khung `min-height` 560, bóng thoại 92 % + 11/13 px padding + mực 13 px (cả `.lesson-chat-bubble`/`.lesson-chat-set-q`/`.lesson-chat-input`), chip tên 260 px, popover picker 320 px, ô nhập 78→240 px), `src/services/lesson/lesson-chat.ts` (+72/−25 — `UNGROUNDED_ANSWER_SYSTEM_PROMPT` + `UNGROUNDED_QUESTION_SET_SYSTEM_PROMPT`, `grounded` trong `LessonChatTurnResult`, `buildChatAnswerPrompt`/`buildQuestionSetPrompt` nhận `grounded` và chia sẻ một hằng số `format` duy nhất cho contract arena, `buildChatEvidence` sửa `fallback` thành `citations.length === 0 && documents.length > 0`, `questionSetReply(..., grounded)` + `fallbackAnswer(..., grounded)`), `src/main.ts` (+14/−5 — `lesson:chat-send` không còn ném "Chọn ít nhất một giáo án để hỏi.", lỗi "không đọc được giáo án" chỉ còn khi `documentIds.length` khác 0, `documentId: null`, nhãn "Hỏi không gắn giáo án", summary "· không gắn giáo án"), `src/renderer/features/lesson-chat.ts` (+32/−17 — `lessonChatIsGrounded()` + `lessonChatScopeText()`, bỏ chốt trong `lessonChatCanSend`/`lessonChatSend`, nhãn stage "Đang chuẩn bị câu hỏi…", hint/subtitle/empty-state/note lỗi mới), `src/services/storage/lesson-store.ts` (+2/−3 — `appendChatTurn` nhận `[]`), `src/shared/lesson-types.ts` (+7/−1 — `grounded` trong response, docstring `documentIds`), `tests/ui/ui-lesson-chat-check.js` (+124/−11 — 59 → **72 check**: dải rộng hai cột + máy phát hiện tràn + composer ink, mục 9 mới `UNGROUNDED_TURN` 10 check, `CLEANUP` xoá theo **danh sách chat** thay vì một id), `tests/unit/lesson-store.test.ts` (+29/−3), `tests/manual/verify-css.js` (+7/−1). Docs: `DECISIONS.md` #183, `STATUS.md`, `ROADMAP.md`, `docs/handoff/status/2026-11-03.md` (dời bàn giao #180 ra lưu trữ).

**Behavior.** Yêu cầu gốc, nguyên văn: *"1. tăng kích thước của khung chatbot , 2. có thể chat mà không cần tải hoặc chọn tài liệu"*. (1) Cột chat từ `minmax(360px, 400px)` lên **`clamp(520px, 46%, 640px)`**: sàn 520 là câu trả lời cho đúng lời phàn nàn (400 px là đáy tuyệt đối nên chật ở mọi màn), 46 % vì cột px cứng không biết mình ở màn nào, trần 640 vì cột danh sách cũng cần chỗ — đo thật **chat 520 px · danh sách 415 px · không tràn ngang · khung 704 px với đáy 797 ≤ viewport 800 · mực ô nhập 13 px**; bóng thoại rộng 92 % và chữ 13 px vì đây là bề mặt chữ dài nhất app, cao hơn sàn đọc 11 px của #181. Rộng hơn chỉ là nửa việc, nên gate assert **hai hướng** và có một máy phát hiện tràn thật (mọi node trong cột danh sách vượt `listRect.right + 1` là đỏ). (2) Một lượt **không gắn giáo án** giờ hợp lệ ở **cả bốn tầng**: renderer bỏ chốt `docIds.length > 0`, main không ném exception và ghi `documentId: null` + nhãn "Hỏi không gắn giáo án", store lưu `document_ids = "[]"`, service có **hai system prompt riêng** — vì bảo model "chỉ được trả lời dựa trên các đoạn trích dẫn" khi không có trích dẫn nào là mời nó từ chối hoặc **bịa về một tài liệu nó chưa thấy**. Cờ `grounded` tính bằng `documents.length > 0` chứ không phải `citations.length > 0`: một giáo án có thật nhưng lạc đề vẫn tham gia lượt (mảnh fallback được gửi), còn không gắn gì thì không gửi gì — nên `evidenceFallback` không còn nói dối "bài của bạn bị đọc thiếu". `questionSetReply` thêm dòng "không có giáo án kèm theo, hãy đối chiếu với bài trước khi cho học sinh chơi", `fallbackAnswer` có nhánh ba, và bộ câu hỏi **vẫn đi qua đúng một contract arena** (khối `format` tách thành hằng số dùng chung, không có hợp đồng thứ hai — bài học #168). Giao diện không hứa đọc một bài không tồn tại: stage label "Đang chuẩn bị câu hỏi…", subtitle "Không gắn giáo án · trả lời bằng kiến thức chung · bằng `<provider>`", hint "Cứ hỏi thẳng — không cần chọn hay tải giáo án nào cả.", empty state "Cứ hỏi, không cần mở giáo án". Gate chứng minh bằng chứng cứ vật chất: **0** dòng nguồn trong bóng thoại, `documentIds === []`, citations `[0]`, **`3 -> 4`** request tới mock (lượt đi thật), và *"the earlier grounded conversation kept its two lessons"* — cuộc trò chuyện có trích dẫn không bị cuộc trò chuyện tự do kéo xuống.

**Commands run.** `npm run check` 0 · `npm run build` 0 (tailwind 840 ms, three 732 KB) · `npx tsc -p tsconfig.json` 0 rồi `node tests/run-unit.js` **75/75** (25,6 s) · `npm run test:native` **1/1** · `npm run verify:css` **39/39** · `npm run check:renderer-globals` 0 undefined (**930** hàm / **7.526** call site) · trên Electron thật (instance cổng 9352, **profile sạch** `Temp/qoder-lc183a`, `EDUGAME_AI_TEST_DIR` unset): `check:lesson-chat-ui` **72 PASS / 0 FAIL**, `rc=0`, "all checks passed — mock requests: probe, answer, question_set, answer"; đã **giết Electron + xoá profile** sau khi lần chạy thứ hai trên cùng profile đỏ **7** check (nhiễm profile, không phải regression) · anh em, mỗi cổng một instance + profile sạch: typography **8/8** · input-routing **52/52** · wizard-structure **14/14** · ai-provider-wizard **40/40** · settings-sections **25/25** · chrome-icons **17/17** (cổng 9353) · dark-theme **23/23** (cổng 9354, instance riêng vì nó lật theme toàn app) · **ảnh chụp** `tests/ui/shots/lesson-chat-183-frame.png` qua `Emulation.setDeviceMetricsOverride(1280×800)` + `capture()` có timeout race, không xin OS focus.

**What remains unverified.** (1) **Chưa lần nào đo trên 1366×768 thật** — mọi số đo là 1280×800 emulation, `clamp(440px, 42%, 520px)` của breakpoint 1240 chưa có số đo nào; lần thứ **bảy** đề nghị một tiết học thật. (2) Lượt không giáo án mới chỉ chứng minh là **thành thật**, chưa chứng minh là **đúng**: mock trả lời thành thật *vì prompt thành thật*, còn model thật có tự bịa "theo giáo án của bạn" không thì chưa có bằng chứng ngoài code. (3) **Luồng local vẫn chưa chạy llama.cpp** (đúng chỉ đạo của chủ dự án ở #182), nên `json_schema` strict trên model nhỏ chưa đo — cả cho lượt ungrounded. (4) Cloud chỉ đi mock loopback: chưa một lần `lesson:chat-send` thật lên Gemini/ChatGPT. (5) Lịch sử chat **không phân biệt** cuộc trò chuyện có trích dẫn và cuộc tự do — không badge nào trong danh sách. (6) Ở 1280 cột danh sách còn 415 px: máy phát hiện tràn chỉ bắt **tràn ngang**, chưa kiểm thẻ giáo án xuống dòng xấu. (7) Nợ #182 giữ nguyên: trần trích dẫn 3200, không streaming, lịch sử 6 × 700 ký tự, chỉ dạng arena, `confirm()` native, chưa test file binary thật. (8) `documentId: null` khiến bộ lọc theo giáo án ở màn **Tasks** không hiện lượt này — chưa hỏi là lỗi hay đúng ý. (9) Chưa chạy installer đóng gói — nợ nhiều đời.

**Next recommended task.** (1) Một **lần cloud thật** cho khung chat: `lesson:chat-send` lên Gemini/OpenAI với key đã verify, một lượt có giáo án và một lượt không — đó là gate thật duy nhất còn thiếu của #183 (nó trả luôn nợ #180). (2) Thêm **badge "không gắn giáo án"** vào danh sách lịch sử để hai loại cuộc trò chuyện phân biệt được từ ngoài (nợ 5). (3) Đo hai cột trên **1366×768 thật** — hoặc cho phép giáo viên **kéo** phân chia hai cột, vì mọi con số hiện tại là clamp do em chọn, chưa phải do mắt giáo viên. Nợ cũ vẫn treo: luồng local chạy thật, `ui-draft-guard-check` 7/8 (cần một provider dùng được), và bản đóng gói.

## Handoff — Trang Giáo án **hai cột**: khung chat cố định gộp nhiều giáo án, trả lời kèm trích dẫn, bộ câu hỏi sang wizard không gọi model lần hai, BETA bị xoá (2026-11-04, DECISIONS #182)

**Files changed.** Mới: `src/services/lesson/lesson-chat.ts` (454 dòng — system prompt "chỉ trả lời dựa trên trích dẫn", `classifyLessonChatIntent`, `requestedQuestionCount`, thang máy trích dẫn đa tài liệu, contract `lesson_chat_answer`/`lesson_question_set`, `fallbackAnswer`), `src/renderer/features/lesson-chat.ts` (644 dòng — state + HTML + IPC của khung chat), `src/renderer/styles/lesson-chat.css` (478 dòng, chỉ token), `tests/ui/ui-lesson-chat-check.js` (637 dòng, **59 check**, khai báo trong `package.json` là `npm run check:lesson-chat-ui`). Sửa: `src/shared/lesson-types.ts` (+98: `LessonChatRole/Intent/ComposerMode/Citation/Turn/Conversation` và `draftSource` thêm nhánh `'chat-questions'`), `src/services/storage/lesson-store.ts` (+321: bảng `lesson_chats` + `lesson_chat_messages` với `ON DELETE CASCADE` và index `updated_at DESC`; `appendChatTurn` / `getLessonChat` / `listLessonChats` / `deleteLessonChats` / `getDocumentWithText`), `src/main.ts` (+145: `lesson:chat-send` — phân giải provider **trước** `aiSingleFlight` để "chưa có AI" là lỗi cấu hình chứ không phải busy, `aiTasks.start({kind:'chat'})`, luôn ghi lượt kể cả lượt lỗi, `sendLessonProgress` theo bốn stage retrieve/generate/validate/ready; `lesson:generate` nhánh A nhận thêm nguồn `chat-questions`), `src/preload.ts` (bốn hàm bridge chat), `src/index.html` (script chat nạp **trước** `pages/lesson-plans.js` + region CSS mới), `src/renderer/styles/app.css` (`@import` region), `src/renderer/core/controller.ts` (chỉ nối chat khi `state.page === 'lesson-plans'`), `src/renderer/core/bootstrap.ts` (`await lessonChatSyncWithLibrary()`), `src/renderer/pages/lesson-plans.ts` (grid hai cột, **xoá** panel BETA và `qaDocSelect`), `features/wizard/state/core.ts` (`wizardNoModelDraftSources = ['imported-questions','chat-questions']` + `wizardNoModelRunLabel`), `features/wizard/state/draft.ts` (`wizardUseImportedQuestions(gameType, provenance)`, `wizardAdoptQuestionSet(set, meta)`, `wizardChatProjectTitle`) — thay đổi thật **+82/−4**, diff hiện 465/387 vì blob cũ lưu CRLF còn `* text=auto` về LF (tiền lệ `providers.ts` #161), `step-configure.ts` + `step-generate.ts` (dòng chữ theo đúng nguồn), `tests/unit/lesson-store.test.ts` (+124), `tests/unit/renderer-load-order.test.ts` (+26), `tests/manual/verify-css.js` (+6 expectation), docs: `DECISIONS.md` #182, `STATUS.md`, `ROADMAP.md`, `docs/handoff/status/2026-11-03.md` (dời bàn giao #179 ra lưu trữ).

**Behavior.** Yêu cầu gốc, nguyên văn: *"trang Giáo án, phần hỏi đán chuyên sâu đang beta thì giờ phát triển và bỏ beta. Tôi muốn trang giáo án sẽ chia thành 2 phần, một bên sẽ là khung chatbot giống chatgpt khung này sẽ cố định bên còn lại là danh sách giáo án… cho phép tải lên giáo án mới vẫn cho phép chọn nhà cung cấp AI gồm AI local và AI đám mây, trước tiên hãy xây dựng flow cho AI đám mây và test sau đó làm flow tương tự cho AI local nhưng không test… nếu người dùng muốn tạo trò chơi hay tạo câu hỏi khi đó AI có thể trả ra dạng câu hỏi với định dạng định sẵn rồi cho phép chuyển qua chế độ tạo trò chơi. Cho phép người dùng kết hợp nhiều giáo án để hỏi, tổng hợp và tạo bộ câu hỏi."* Kết quả đo được: cột chat **400 px, `position: sticky`**, khung `704 px` trong viewport `800 px` (đáy khung `797 ≤ 800`, không tràn), transcript cuộn **trong** khung; panel BETA cũ **bị xoá** chứ không đổi nhãn; ô chọn nhà cung cấp liệt `local,gemini,openai,custom`; một cuộc trò chuyện gắn được **nhiều** giáo án (chip + picker có "Chọn tất cả", bỏ/chọn lại từng cái) và nút "Tải giáo án mới" mở `dialog.showOpenDialog` (txt/md/docx/pdf/pptx). Lượt trả lời mang **5 trích dẫn trên 2 tài liệu**, dòng gửi lên model đánh số `[n] (tên giáo án)` nên nguồn không bị nhập nhằng; intent do máy cục bộ quyết (`answer`/`question_set`, công tắc trên composer luôn thắng, `?` cuối câu được hiểu là *hỏi về bài*), không bằng một lần gọi model. "Định dạng định sẵn" là **chính contract arena** (`lesson_question_set` dùng lại `gameDraftSchema`, `normalizeDraft` padded `q1…` + `a,b,c`), nên "Tạo trò chơi (3 câu)" mở wizard ở **bước hoàn tất** với 3 thẻ câu hỏi, tag "Bộ câu hỏi từ chat", dự án lưu `draftSource='chat-questions'`, tiêu đề "Giáo án 18A … + 1 giáo án" — và **số request tới endpoint không đổi (3 → 3)**: không có lần gọi model thứ hai; bấm "Lưu vào thư viện" là trò chơi chạy offline vì nó chỉ là data. Cloud được test bằng mock OpenAI trên `127.0.0.1` — `custom` chỉ nhận `http:` cho loopback ("trong môi trường thử nghiệm"), provider phải qua **nút kiểm tra kết nối thật** mới `usable` (#132), `EDUGAME_AI_TEST_DIR` để trống vì seam fixture trả lời *trước* transport, key là chuỗi giả và renderer chỉ nhận `••••chat`. **Lỗi thật mà cổng tìm ra rồi sửa:** lượt fail vì chưa có provider bị main ném exception trước khi ghi lịch sử, còn `catch` của `lessonChatSend` gọi `lessonChatOpen` — hàm đó **xoá** `lessonChatUi.error`, nên giáo viên bấm Gửi và **không thấy gì**; nay thông báo được đặt lại sau khi đọc lịch sử và bỏ vỏ IPC bằng đúng hai regex của `wizardParseError`, thành `AI local (llama.cpp) chưa sẵn sàng: Chưa có model…`.

**Commands run.** `npm run check` 0 · `npm run build` 0 (clean + tailwind + three 732 KB) · `npm run check:renderer-globals` 0 undefined (**928** hàm / **7.521** call site) · `npx tsc -p tsconfig.json` 0 rồi `node tests/run-unit.js` **74/74** (24,5 s) · `npm run verify:css` **38/38** · `npm run test:native` **1/1** · trên Electron thật (instance cổng 9347, profile sạch `Temp/qoder-lessonchat`, `EDUGAME_AI_TEST_DIR` đã unset): `check:lesson-chat-ui` **59 PASS / 0 FAIL**, chạy hai lần — lần 1 đỏ 3 (lỗi của *chính check*: `fill()` không thay placeholder, `project.game.questions` thay bằng `project.draft.questions`, `citations` đếm cả bóng thoại user; và 1 đỏ **thật** ở source như đoạn trên), lần 2 xanh hết, mock chỉ nhận `probe, answer, question_set`, tự dọn 1 cuộc trò chuyện + 2 giáo án giả lập + 1 dự án + 1 trò chơi và trả `custom` về `not-configured` · anh em mỗi gate một instance + profile sạch: `ui-lessons-paging-check` ✓ · `ui-input-routing-check` **52/52** · `ui-wizard-structure-check` **14/14** · `ui-project-selection-check` ✓ · `ui-card-menu-check` ✓ · `ui-chrome-icons-check` **17/17** · `check:typography-ui` **8/8** (1.526 dòng / 32 lượt = +16 dòng so với #181 chính là markup chat; nhỏ nhất 11 px, tệ nhất **4,74**, hover/focus 48 nhãn tệ nhất 4,72) · `check:dark-theme-ui` **23/23** (112 `<option>`/theme) · `check:settings-sections-ui` ✓ · `ui-ai-provider-wizard-check` ✓ · `ui-library-paging-check` ✓ · `ui-ai-provider-key-check` ✓ · `ui-wizard-cancel-genre-check` **8/8** · `ui-draft-guard-check` **7/8** — đỏ **có sẵn từ #153** (cần một provider dùng được; bật cả `EDUGAME_AI_TEST_DIR` vẫn đỏ vì seam chặn *sau* khi provider đã phân giải), không do #182. Ghi chú vận hành: `ui-chrome-icons-check` báo 1 đỏ *"the app lands on the library"* khi chạy **ngay sau** `ui-project-selection-check` trên cùng instance (check trước rời trang ở `my-projects`); chạy riêng là **17/17** — đúng loại coupling đã ghi ở #161/#166.

**What remains unverified.** (1) **Luồng local chưa chạy model thật** — đúng chỉ đạo *"không test vì test AI local trên máy yếu rất mất thời gian"*; bất biến đã chứng minh chỉ là *không âm thầm rơi về cloud*, còn `json_schema` strict trên llama.cpp và chất lượng bộ câu hỏi của model nhỏ thì **chưa có bằng chứng nào ngoài code**. (2) Cloud chỉ đi qua **mock loopback**: chưa lần nào có `lesson:chat-send` thật lên Gemini/ChatGPT (đó vẫn là nợ #180 cho `lesson:analyze`). (3) Chat mới đo ở **1280×800** qua `Emulation.setDeviceMetricsOverride`; cột 400 px trên **1366×768** thật chưa đo — lần thứ **sáu** đề nghị một tiết thật. (4) Trần `CHAT_EVIDENCE_MAX_CHARS = 3200`: gắn 4–5 giáo án thì trích dẫn **bị bớt**, giáo viên không thấy dấu hiệu nào. (5) Bộ câu hỏi chỉ ra dạng **arena**; ra race/treasure/matching vẫn phải đổi thể loại ở wizard, và chưa check nào buộc "bộ câu hỏi từ chat" đi qua nhánh đó. (6) Chưa test file **binary thật** (docx/pdf/pptx) qua nút "Tải giáo án mới" — gate gọi thẳng `saveLessonDocument` với `.txt` giả lập. (7) Không streaming; lịch sử chỉ mang **6** message × 700 ký tự sang model mà không hiện cho giáo viên; chat không đổi tên/không tìm kiếm/không xuất `.egame`; xoá dùng `confirm()` native (gate không bấm nên nhánh đó chưa chạy). (8) Chưa chạy installer đóng gói — nợ nhiều đời.

**Next recommended task.** (1) Cho **AI local** một bộ câu hỏi thật: bật llama.cpp trên máy dev *của giáo viên* (không phải máy yếu này) rồi chạy `ui-lesson-chat-check` với `local` — nhánh `json_schema` strict là chỗ dễ vỡ nhất mà chưa từng đo. (2) Hiện "AI đã đọc bao nhiêu / còn bao nhiêu bị cắt" ngay trong khung chat (nợ #180 + mục 4 ở trên, giờ có thêm một chỗ nữa để hỏi). (3) Một tiết thật 1366×768 trên hai cột (lần thứ sáu). Nợ cũ vẫn treo: một lần `lesson:analyze` cloud thật với key đã verify, và check bản đóng gói.
