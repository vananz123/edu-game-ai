# Trạng thái dự án

Bàn giao mới nhất nằm ngay trong file này (3 mục gần nhất). Các bàn giao cũ được lưu ở
`docs/handoff/status/` — mỗi ngày một file, nối thêm vào cuối file của ngày đó khi cần.
Quy ước: sau mỗi việc, chèn bàn giao mới ngay dưới tiêu đề "Bàn giao gần nhất"; nếu quá 3 mục,
chuyển mục cũ nhất vào file lưu trữ đúng ngày của nó và cập nhật mục lục.

## Mục lục bàn giao

### 2026-10-31 — [docs/handoff/status/2026-10-31.md](handoff/status/2026-10-31.md)
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

## Handoff - Tách gameplay.ts thành features/games/* (2026-10-31, DECISIONS #147)

**Files changed.**
- `src/renderer/features/games/` (mới, 8 file): `shell.ts` (`playGame`, display/fullscreen, `closePlaySurface`, listener click/keydown của play surface), `three-stage.ts` (mount/unmount, `addAnchoredObject`, thế giới 3D theo template, `reactThree`), `house.ts` (House Building Mode), `result-screen.ts` (màn kết quả, Presentation Mode, team setup, play modal/header, `initPresentationTracking()`), `quiz.ts`, `matching.ts`, `treasure.ts`, `race.ts` (UI từng trò).
- `src/renderer/features/gameplay.ts` (3.270 dòng) đã xoá; nội dung được chuyển **nguyên văn từng dòng** (CRLF 3.269 dòng, bỏ dòng `sourceMappingURL=gameplay.js.map` cũ bị dán từ JS biên dịch; chỉ dòng 1 của `shell.ts` thay bằng header `@ts-nocheck` mới). Script tách kiểm SHA-256 lúc ghép lại và đọc lại file đã ghi.
- `src/index.html`: thay 1 thẻ `gameplay.js` bằng 8 thẻ `features/games/*.js` theo thứ tự shell → three-stage → house → result-screen → quiz → matching → treasure → race (sau `three-game-interaction.js`).
- `tests/unit/lan-adapters.test.ts`: drift guard đọc toàn bộ `src/renderer/features/games/*.ts` thay vì một file; đổi tên test cho đúng.
- `src/lan/lan-adapters.ts`, `tests/ui/ui-presentation-check.js`, `tests/ui/ui-race-treasure-check.js`: chỉ cập nhật chú thích trỏ file mới.
- Docs: `docs/DECISIONS.md` (#147), `docs/ROADMAP.md` (P2 xong, P3 kế tiếp), `docs/PROJECT_MAP.md` (cây `features/games/` + 4 dòng bảng "sửa gì mở đâu"), `.kilo/skills/threejs-game-interaction/` (SKILL.md + 2 reference: bảng "Where the code lives").
- Không đổi: logic tính điểm `game-engine/runtime.ts`, `three-game-interaction.ts`, CSS, wizard/editor, LAN/presentation/SQLite/`.egame`, tên và tham số mọi hàm toàn cục.

**Behavior.** Không đổi hành vi. Renderer vẫn là script toàn cục; mỗi file chỉ khai báo hàm/biến hoặc đăng ký listener ở top level, không file nào đọc binding của file khác lúc nạp. Sửa một trò giờ chỉ mở đúng file của trò đó (kho báu ~880 dòng thay vì 3.269), còn vào/ra và toàn màn hình ở `shell.ts`, 3D ở `three-stage.ts`, kết quả/trình chiếu ở `result-screen.ts`.

**Commands run.** `npm run build` 0 (chỉ cảnh báo EPERM khi dọn `dist/server/index.js` do app đang chạy) · `node tests/run-unit.js` **68/68** · `npm run check:renderer-globals` 0 undefined (44/45 script, 756 hàm, 6192 call site) · `npm run verify:css` **17/17**. Electron thật CDP (mỗi nhóm cần instance sạch, `env -u ELECTRON_RUN_AS_NODE`, cổng 9361/9337): `ui-three-game-check` **19/19**, `ui-three-game-reactions-check` **11/11**, `ui-three-game-check-4games` **41/41**, `ui-three-game-patterns-check` **31/31**, `ui-house-building-check` **84/84**, `ui-game-worlds-check` **42/42**, `ui-play-surface-check` **156/156**, `ui-presentation-check` **60/60**, `ui-stage-illustration-check` **169/169**, `ui-matching-finish-check` **22/22**, `ui-race-treasure-check` **18/18**, `ui-lan-wiring-check` **7/7**, `ui-lan-treasure-finish-check` **5/5**, `ui-fullscreen-density-check` **8/8**, `ui-fullscreen-check` **20/20**.

**Chưa xác minh.** Chưa chơi tay trọn một ván mỗi trò sau khi tách (mới chạy check CDP); chưa xem trên máy chiếu/màn hình phụ thật; chưa chạy installer đóng gói. `ui-three-game-check-4games` lần đầu chỉ 36/41 khi dùng lại instance đã bị check khác probe (bộ đếm mount/burst tích luỹ) — chạy lại trên instance sạch đạt 41/41. `ui-fullscreen-check` chỉ đạt 20/20 sau khi xoá `data-setup-fullscreen="1"` còn sót trong profile mới (17/20 trước đó, lỗi môi trường: setup state giữ `visibility:hidden` trên `.app-shell`), chưa sửa nguyên nhân gốc.

**Next task.** P3 — nhóm `src/services/` theo giáo án / AI / trò chơi / lưu trữ / nhập liệu, chỉ di chuyển file và sửa import (không đổi hợp đồng IPC); sau đó P4 tách `app.css`.

---

## Handoff - Tách lịch sử docs sang docs/handoff + .gitattributes (2026-10-31, DECISIONS #146)

**Files changed.**
- `docs/STATUS.md`: 3.517 dòng / 634 KB → **249 dòng / 32 KB**; giữ 3 bàn giao mới nhất + mục lục đầy đủ theo ngày.
- `docs/handoff/status/*.md` (13 file, 619.806 byte): 12 file theo ngày + `undated-070-079.md` (17 mục #70–#79 không ghi ngày trong tiêu đề — không suy đoán ngày); bàn giao mới nối thêm vào cuối file đúng ngày.
- `docs/DECISIONS.md`: 2.056 dòng / 398 KB → **~56 KB**; giữ tóm tắt #1–#56, danh sách quyết định còn mở, bảng mục lục `#57–#145`; quyết định mới (#146+) ghi trực tiếp vào file này.
- `docs/handoff/decisions/{057-089,090-105,106-145}.md`: 33 + 16 + 40 mục chi tiết.
- `docs/handoff/README.md` (mới): quy ước chèn bàn giao (giữ 3 mục inline, nối mục cũ vào `status/<ngày>.md`, cập nhật mục lục) và ngưỡng cắt decisions (~300 KB).
- `docs/PROJECT_MAP.md`: cây thư mục có `handoff/status/` + `handoff/decisions/`; thêm dòng "Tra bàn giao cũ / quyết định cũ"; bước đọc đầu phiên đổi sang quy ước rolling.
- `AGENTS.md`: mục "Required handoff after each task" ghi quy ước mới.
- `docs/ROADMAP.md`: thêm mục "Restructure the project tree" với 5 pha P1–P5; P1 đánh dấu xong, P2 là việc kế tiếp.
- `.gitattributes` (mới): `* text=auto` + khai báo binary cho png/jpg/jpeg/ico/dll/exe/zip/sqlite; **chưa** chạy renormalize toàn kho (theo chú thích trong file, tránh commit nhiễu).
- Cùng đợt push: `.env.example` bỏ dòng `API_KEY=rv_...` (không dùng trong code, chưa từng vào git history); `.gitignore` bỏ phần nháp agent (`.kilo/worktrees/`, `plans/`, `agents/`, `agent-manager.json`), vẫn theo dõi `.kilo/skills/`.
- Không đổi: mã ứng dụng, `src/index.html`, CSS, tests, LAN/presentation/SQLite/`.egame`.

**Behavior.** Không đổi hành vi ứng dụng — chỉ tài liệu và cấu hình git. Mỗi phiên agent giờ đọc `docs/STATUS.md` ~32 KB thay vì 634 KB; toàn bộ 146 bàn giao cũ và 89 mục quyết định chi tiết vẫn tra được qua mục lục (không mất, không sửa ký tự nào). `.env.example` chỉ còn placeholder, không còn khoá thật.

**Commands run.** Script tách (Node, đọc bản gốc sao lưu ở `%LOCALAPPDATA%\Temp`) so khớp **SHA-256 từng block** trước/sau và parse lại vòng tròn: 146 mục STATUS + 89 mục DECISIONS khớp nguyên văn; tổng byte lưu trữ + phần giữ lại khớp bản gốc (+~2 KB tiêu đề file lưu trữ). `npm run build` 0 · `node tests/run-unit.js` **68/68** · `npm run check:renderer-globals` 0 undefined (37/38 script, 756 hàm, 6192 call site) · `npm run verify:css` **17/17**. `git grep`/`git log --all -S "rv_L2glwIz"` rỗng — khoá trong `.env.example` chưa từng vào history.

**Chưa xác minh.** Mới kiểm link mục lục bằng script (mỗi ngày trỏ đúng file trong `docs/handoff/`), chưa bấm từng link trong trình xem markdown; việc tách file mới kiểm bằng hash nội dung, chưa đọc lại toàn bộ 620 KB bằng mắt. Chưa chạy `git add --renormalize` (cố ý) nên `.gitattributes` chưa có tác dụng hồi tố. Các check UI không chạy lại trong đợt này vì không sửa mã.

**Next task.** P2 — tách `src/renderer/features/gameplay.ts` (3.269 dòng) thành `features/games/*` theo ranh giới đo được (stage/house/shell/quiz/matching/treasure/race), thêm `<script>` đúng thứ tự trong `src/index.html` và cập nhật `tests/unit/renderer-load-order.test.ts`.

---

## Handoff - Rollout pattern gameplay cho matching/treasure/race (2026-10-31, DECISIONS #145)

**Files changed.**
- `src/renderer/features/gameplay.ts`: thêm `buildMatchingWorld()`/`reactMatching()`, `buildTreasureWorld()`/`reactTreasure()`, `buildRaceWorld()`/`reactRace()`; `mountThreeStage()` chọn thế giới theo `game.template`; `reactThree()` phát event rồi rẽ nhánh theo template (quiz/scenario/house giữ nguyên). Thay `burstThreeStage` trực tiếp bằng `reactThree` trong `evaluateColumnMatch`, `onMemoryCardClick`, nhánh phân loại, `chooseTreasureAnswer`, `treasureCompleteMission`, `answerRace`; `showMatchingComplete` phát `game:completed`. Thêm `state.racePlay.correctCount` (chỉ trình diễn) và `raceAnswerCelebrate`; `renderRaceBoard()` chuyển phản ứng/confetti sang handle mới sau repaint.
- `src/renderer/features/three-game-interaction.ts`: camera lấy aspect ngay trong `mount()` (trước đây chờ frame đầu, nên `stagePoint()` gọi đồng bộ sau mount bị sai trục ngang); thêm `threeGame.anchor(handle, object, fx, fy, z)` giữ vật thể ở một **phân số màn hình** của stage và chiếu lại mỗi frame trong `step()`, để vật thể sống qua lần đổi kích thước fullscreen đến sau (native fullscreen áp dụng bất đồng bộ).
- `src/renderer/features/gameplay.ts` (đặt vật thể): helper `addAnchoredObject()` dùng `stagePoint` + `anchor` thay toạ độ thế giới cố định — matching: rương (0.93, 0.47) + khối vỡ (0.93, 0.32) ở lề phải; treasure: rương (0.28, 0.86) ở dải trống dưới thẻ đáp án; race: tháp (0.06, 0.93, `blockSize` 0.7) ở dải trống dưới thẻ lượt chơi, cầu (0.962, 0.03, size 0.4) ở dải trên thanh trạng thái.
- `tests/ui/ui-three-game-patterns-check.js` (mới): 31 assertion cho 3 trò (rương/khối/hồi, mở rương khi đủ cặp, treasure sai chỉ mất lượt rồi đúng mở rương + 150 điểm + chặng cuối celebrate, race tháp 0→1, cầu chớp xanh/đỏ, thắng celebrate, điểm/ô đua và số canvas không đổi).
- `tests/unit/three-game-interaction.test.ts`: danh sách API bắt buộc thêm `stagePoint`, `anchor`; kiểm null-safety cho cả hai.
- `docs/DECISIONS.md` (#145), `docs/ROADMAP.md` (đánh dấu xong mục rollout), `.kilo/skills/threejs-game-interaction/` (SKILL.md + references/gameplay-integration.md + interaction-patterns.md).
- Không đổi: `game-engine/runtime.ts`, house mode/quiz, scenario, editor/wizard/adapter, `src/index.html`, CSS, LAN/presentation/SQLite/`.egame`.

**Behavior.** Ba trò ngoài quiz giờ có pattern 3D riêng, cùng một dispatcher: **matching** có rương mở khi ghép đủ cặp, khối vỡ khi ghép sai (tự hồi sau 1,3 s để lần sai sau vẫn thấy) và confetti khi hoàn thành; **treasure** có rương của từng chặng mở khi trả lời đúng, chặng cuối có confetti; **race** có tháp cao thêm 1 khối mỗi câu đúng, quả cầu chớp xanh/đỏ mỗi câu và confetti ở câu ấn định đội thắng. Bảng đua vẽ lại toàn bộ sau mỗi câu nên tháp/phản ứng/confetti được chuyển sang handle mới. Đúng/sai vẫn do 2D quyết định; điểm, số cặp, số ô đua không đổi; mỗi màn vẫn đúng 1 canvas.

**Commands run.** `npm run build` 0 · `node tests/run-unit.js` **68/68** · `npm run check:renderer-globals` 0 undefined (37/38 script, **756** hàm, **6192** call site) · `npm run verify:css` **17/17**. Electron thật CDP (mỗi nhóm check một instance sạch, `env -u ELECTRON_RUN_AS_NODE`): `ui-three-game-patterns-check` **31/31**. Không hồi quy: `ui-three-game-check` **19/19**, `ui-three-game-reactions-check` **11/11**, `ui-three-game-check-4games` **41/41**, `ui-house-building-check` **84/84**, `ui-game-worlds-check` **42/42**, `ui-presentation-check` **60/60**, `ui-play-surface-check` **156/156**, `ui-stage-illustration-check` **169/169**.

**Kiểm bằng mắt (ảnh chụp CDP, fixture thật, `tests/ui/shots/`).** Fullscreen 1920×1080 và 1366×768: matching — rương + mảnh khối vỡ nằm ở lề phải, không đè chữ; treasure — rương mở ở dải trống dưới thẻ đáp án (1920); race — cầu nằm ở dải trên thanh trạng thái, thấy ở cả hai cỡ; tháp đứng trong dải trống dưới thẻ lượt chơi ở 1920×1080. Điểm kiểm bằng `elementsFromPoint` xác nhận các điểm đặt chỉ trúng `.game-stage`/`#playBody` (không có card che) tại 1920×1080 và 1366×768 fullscreen.

**Chưa xác minh.** Ở race fullscreen **1366×768** thẻ lượt chơi đã tràn stage (giới hạn mật độ có từ trước, chưa thuộc #145), nên **tháp bị khuất sau thẻ** ở cỡ này; phản ứng vẫn thấy qua cầu chớp + burst/confetti, còn tháp chỉ thấy ở 1920×1080. Trong modal cửa sổ cao (race/matching/treasure ở 1366) canvas cao hơn màn hình nên vật thể phân số có thể nằm dưới vùng nhìn khi chưa cuộn — chưa kiểm bằng mắt từng vị trí cuộn. Chưa xem trên máy chiếu/màn hình phụ thật; chưa đo FPS máy cấu hình thấp khi có 3 object 3D cùng lúc; chưa chơi hết một ván race nhiều vòng để thấy tháp đầy; chưa bấm tay qua LAN/presentation; chưa build/install NSIS. Lưu ý: `ui-three-game-patterns-check` và các check đếm mount/spy cần **instance Electron mới** mỗi lần chạy; `ui-house-building-check` nhạy thời gian — lần chạy trên instance vừa bị probe/check khác dùng có thể trượt layout, chạy lại trên instance sạch cho 84/84.

**Next task.** Mục roadmap còn mở duy nhất của phần Three.js là **Packaged check** (`npm run dist:win` + cài trên máy sạch, đo ảnh hưởng bundle 732 KB, xem trên máy chiếu/máy yếu) — cần môi trường cài đặt thật. Ngoài phần Three.js, các mục còn mở trong roadmap thuộc mảng AI/giáo án (phân bổ độ khó, slicing O6, GGUF runtime) và các mục nhỏ của tasknight.

