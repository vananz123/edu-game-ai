# Trạng thái dự án

Bàn giao mới nhất nằm ngay trong file này (3 mục gần nhất). Các bàn giao cũ được lưu ở
`docs/handoff/status/` — mỗi ngày một file, nối thêm vào cuối file của ngày đó khi cần.
Quy ước: sau mỗi việc, chèn bàn giao mới ngay dưới tiêu đề "Bàn giao gần nhất"; nếu quá 3 mục,
chuyển mục cũ nhất vào file lưu trữ đúng ngày của nó và cập nhật mục lục.

## Mục lục bàn giao

### 2026-10-31 — [docs/handoff/status/2026-10-31.md](handoff/status/2026-10-31.md)
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

## Handoff - Tách game-editor + wizard/state theo khu vực (2026-10-31, DECISIONS #150)

**Files changed.**
- `src/renderer/features/editor/` (mới, 7 file): `ai.ts` (AI tạo lại từng mục), `page.ts` (nhập câu từ tệp, mở/đóng trang, markup, nối sự kiện, `saveEditedGame`), `questions.ts` (sửa câu hỏi), `drag.ts` (dựng thẻ kéo-thả dùng chung), `matching.ts`, `treasure.ts`, `race.ts`. `src/renderer/features/game-editor.ts` (1.966 dòng) đã xoá; nội dung chuyển **nguyên văn từng dòng** — chỉ dòng 1 của mỗi file thay bằng banner `@ts-nocheck` mới.
- `src/renderer/features/wizard/state/` (mới, 5 file): `core.ts` (state dùng chung, đồng hồ/ETA, reset), `providers.ts`, `config.ts` (cấu hình sinh nội dung), `draft.ts` (đọc/ghi bản nháp), `actions.ts` (chuyển bản nháp → dự án). `src/renderer/features/wizard/state.ts` (1.752 dòng) đã xoá, chuyển nguyên văn (giữ CRLF).
- `src/index.html`: thay 1 thẻ `game-editor.js` bằng 7 thẻ `features/editor/*.js` (AI → page → questions → drag → matching → treasure → race) và 1 thẻ `state.js` bằng 5 thẻ `features/wizard/state/*.js` (core → providers → config → draft → actions), kèm chú thích thứ tự nạp.
- `tests/legacy/smoke-p1.js`: đọc và nối mọi file `dist/src/renderer/features/editor/*.js` đã sắp xếp thay vì một file.
- `tests/unit/generation-eta.test.ts`: nguồn `STATE_SRC` là toàn bộ `wizard/state/*.ts` đã sắp xếp; `tests/unit/renderer-load-order.test.ts` chỉ đổi chú thích.
- Chỉ đổi chú thích trỏ đường dẫn mới: `src/renderer/features/game-illustration.ts`, `src/renderer/features/wizard/state/core.ts`.
- Docs: `docs/DECISIONS.md` (#150, kèm bảng khoảng dòng gốc và hash), `docs/ROADMAP.md` (P1–P5 xong), `docs/PROJECT_MAP.md` (cây `editor/` + `wizard/state/` và 4 dòng bảng), `docs/AGENT_HANDOFF.md`.
- Không đổi: tên/tham số mọi hàm toàn cục, logic soạn thảo và wizard, `three-game-interaction.ts`, các bước wizard, CSS, LAN/presentation/SQLite/`.egame`.

**Behavior.** Không đổi hành vi. Ghép lại 7 lát cắt editor cho đúng file gốc từng byte (SHA-256 `eaa83ce5…9b6043`, 125.959 B; phần thân bỏ dòng 1 `29d4e236…30444e`) và 5 lát cắt wizard state cũng vậy (`098459d1…99d6cc`, 83.771 B; thân `b034a258…7cc0aa`) — cách tách kiểm từng lát là substring thật, mọi dòng không thuộc lát đều rỗng, rồi so hash bản ghép. Sửa trình soạn thảo giờ mở đúng file vùng đó (kho báu ~400 dòng thay vì 1.966), sửa dòng state wizard mở đúng nhóm chức năng thay vì 1.752 dòng. Renderer vẫn là script toàn cục; không file mới nào đọc binding của file khác lúc nạp.

**Commands run.** `npm run build` 0 · `node tests/run-unit.js` **68/68** (gồm load-order với 55 script) · `npm run check:renderer-globals` 54/55 script, 756 hàm, 6.192 call site — **0 undefined** · `npm run verify:css` **17/17**. Electron thật qua CDP (mỗi nhóm instance sạch, cổng 9338): `ui-editor-art-check` **11/11**, `ui-race-editor-check` **10/10**, `ui-race-treasure-check` **18/18**, `ui-wizard-cancel-genre-check` **8/8**, `ui-wizard-structure-check` **13/14**, `ui-draft-guard-check` **7/8**, `ui-item-assets-editor-check` **17/27**. Thêm một probe một lần: 34 hàm toàn cục của editor/wizard state đều tồn tại và matching/treasure/race đọc + validate được.

**Chưa xác minh.** Ba check CDP đỏ đều do nguyên nhân có sẵn, không do đợt tách: `ui-wizard-structure-check` hỏng ở assertion giữ focus bàn phím (cửa sổ chạy nền không lấy được focus OS — probe cho thấy `input.focus()` vẫn để `activeElement` là BODY); `ui-draft-guard-check` hỏng ở E2E sinh nội dung vì profile mới không có nhà cung cấp AI usable ("Chưa có model"); `ui-item-assets-editor-check` Phase B còn chờ `.modal` trong khi editor đã thành trang `.editor-page` từ #129 (đã đối chiếu bản `8d5562c:game-editor.ts`, 12 assertion Phase A đều pass). Chưa bấm tay trọn một luồng tạo game → sửa từng mục trong editor; chưa chạy installer đóng gói. Cố ý **không tách** `three-game-interaction.ts` (một IIFE exposing `window.threeGame` — tách sẽ phá ranh giới module chứ không chỉ là chia file) và các bước wizard (mỗi file < 1.000 dòng, một trách nhiệm).

**Next task.** Roadmap còn `Packaged check` (cần môi trường cài sạch) và các mục AI/giáo án — chưa chốt thứ tự. Việc nhỏ nên làm trước khi chạy lại bộ UI: cập nhật Phase B của `ui-item-assets-editor-check` sang `.editor-page` để check này hết đỏ giả.

---

## Handoff - Tách app.css thành 13 file khu vực (2026-10-31, DECISIONS #149)

**Files changed.**
- `src/renderer/styles/app.css`: 4.567 dòng → **216 dòng**, chỉ còn phần đầu Tailwind (`@import "tailwindcss"`, daisyUI `@plugin` + theme, `@theme`, `@source`) và `@import` 13 file khu vực theo thứ tự cascade.
- 13 file mới (mỗi file = banner 1 dòng + **đúng lát cắt gốc**, không sửa ký tự): `base.css` (201–286), `components.css` (287–843), `shell.css` (844–1020), `fullscreen.css` (1021–1257), `gameplay.css` (1258–1901), `navigation.css` (1902–2013), `game-race.css` (2014–2063), `game-animations.css` (2064–2398), `setup-wizard.css` (2399–2501), `wizard.css` (2502–3002), `game-treasure.css` (3003–3848), `game-worlds.css` (3849–4453), `game-house.css` (4454–4567).
- `tests/unit/generation-eta.test.ts`, `tests/unit/illustration-registry.test.ts`: đọc cả thư mục `src/renderer/styles/*.css` thay vì riêng `app.css` (rule cần kiểm nay nằm ở `wizard.css`).
- `tests/unit/build-assets.test.ts`: thêm guard 2b — mọi `@import "./x.css"` của entry phải tồn tại ở `src` và trong `dist`.
- `src/index.html`: chỉ cập nhật chú thích (vẫn đúng một `<link rel="stylesheet" href="renderer/styles/app.css">`).
- Docs: `docs/DECISIONS.md` (#149), `docs/ROADMAP.md` (P4 xong, P5 kế tiếp), `docs/PROJECT_MAP.md` (cây styles + mục "Thứ tự CSS"), `docs/AGENT_HANDOFF.md`.
- Không đổi: selector, giá trị, thứ tự rule, Tailwind/daisyUI config, `@source`, `verify-css.js`, JS/TS ngoài 3 test trên.

**Behavior.** Không đổi hành vi. Tailwind v4 inline từng `@import` cục bộ đúng tại vị trí, nên nối 13 file theo đúng thứ tự import cho lại **đúng file gốc từng byte** (SHA-256 `3a75462e…10c08e2`, 217.386 ký tự). Bằng chứng mạnh hơn: `build:css` trước và sau khi tách cho file biên dịch **giống hệt từng byte** (`a3cf605f…4f3f40a`, 197.047 ký tự) — mọi rule, specificity và thứ tự cascade giữ nguyên. Sửa CSS một trò giờ chỉ mở đúng file của vùng đó (kho báu ~847 dòng thay vì 4.567).

**Commands run.** `npm run build` 0 (three bundle 732 KB như cũ) · `node tests/run-unit.js` **68/68** · `npm run verify:css` **17/17** · `npm run check:renderer-globals` 0 undefined (44/45 script, 756 hàm, 6192 call site). Kiểm riêng: so SHA-256 bản nối lại với bản gốc, và so file CSS biên dịch với baseline chụp trước khi tách — cả hai trùng khớp.

**Chưa xác minh.** Không chạy lại các check CDP UI trong đợt này: đầu ra CSS biên dịch trùng byte với baseline nên không có gì để UI kiểm thêm. Chưa mở app bằng mắt sau khi tách (chỉ chạy build + test tĩnh) — nếu muốn chắc chắn về đường nạp, mở app và xem một màn chơi là đủ. Bản sao các file khu vực trong `dist/.../styles/` không được nạp (chỉ entry biên dịch được dùng), giữ lại do `copyfiles "*"`; vô hại.

**Next task.** P5 — tách các file lớn còn lại (`features/game-editor.ts`, `features/three-game-interaction.ts`, các bước wizard) — chỉ bắt đầu khi P1–P4 đã ổn định như hiện tại.

---

## Handoff - Nhóm src/services theo lesson/ai/game/storage/input (2026-10-31, DECISIONS #148)

**Files changed.**
- `src/services/`: **35 file chuyển bằng `git mv`** (giữ lịch sử), nội dung từng file nguyên văn — chỉ đổi các dòng `import`/`require`/`import()`. Không còn file `.ts` nào ở cấp `src/services/`:
  - `lesson/` (14): `lesson-contracts`, `lesson-prompts`, `lesson-chunker`, `lesson-retrieval`, `lesson-preprocess`, `lesson-structure`, `lesson-selection`, `lesson-quality`, `lesson-cache`, `lesson-workflow`, `lesson-projects`, `lesson-item-repair`, `lesson-normalize`, `item-capacity`.
  - `ai/` (5): `ai-transport`, `ai-providers`, `ai-tasks`, `ai-log`, `opencode-zen`.
  - `game/` (9): `game-schema`-nhóm 5 thể loại (`game-validation`, `game-normalize`, `game-project-adapter`), `game-package` (`.egame`), `draft-convert`, `game-type-rules`, `game-recommender`, `ai-game-design`.
  - `storage/` (2): `lesson-store` (SQLite + file giáo án), `custom-illustration`.
  - `input/` (5): `input-classifier`, `input-kind`-nhóm (`sanitize`/`question-import`/`question-compatibility`/`question-text`).
- `src/main.ts`, `src/shared/types.ts`: chỉ đổi specifier (require tĩnh và `import(...)` trong type).
- 5 file renderer chỉ đổi **chú thích** trỏ đường dẫn mới: `features/game-generation.ts`, `features/wizard/{state,step-input,step-structure}.ts`, `shared.ts`.
- `tests/unit/*.test.ts` **37 file**: chỉ đổi specifier import; riêng `lesson-store.test.ts` sửa thêm một assertion phân trang **hỏng sẵn** (xem bên dưới).
- Docs: `docs/DECISIONS.md` (#148), `docs/ROADMAP.md` (P3 xong, P4 kế tiếp), `docs/PROJECT_MAP.md` (cây services + 7 dòng bảng "sửa gì mở đâu"), `docs/AGENT_HANDOFF.md`.
- Không đổi: hợp đồng IPC/preload, `src/index.html`, CSS, `src/game-engine`, `three-game-interaction`, wizard/editor logic, LAN/presentation/SQLite/`.egame`, tên và tham số hàm.

**Behavior.** Không đổi hành vi. Codemod resolve specifier theo vị trí cũ của file đang sửa (kể cả file đã `git mv`) rồi viết lại tương đối theo vị trí mới — **400 specifier, 0 không giải được**; giữ nguyên kiểu không có đuôi `.ts` như trước. Chỉ di chuyển + sửa import, đúng phạm vi P3 (không đụng hợp đồng IPC), nên app chạy y như trước; cây `src/services/` giờ chia theo khu vực, mở đúng thư mục là thấy hết file liên quan.

**Commands run.** `npm run check` 0 · `npm run build` 0 (chỉ cảnh báo EPERM khi dọn `dist/server/index.js` do app đang chạy) · `node tests/run-unit.js` **68/68** · `npm run test:native` **1/1** · `npm run check:renderer-globals` 0 undefined (44/45 script, 756 hàm, 6192 call site) · `npm run verify:css` **17/17**. Electron thật qua CDP: app khởi động được với require mới ở main process; `ui-input-routing-check` **52/52**, `ui-lessons-paging-check` toàn bộ pass.

**Sửa một test hỏng sẵn.** `tests/unit/lesson-store.test.ts` (mục #121) đọc 3 trang ở offset 0/10/30 nhưng assert hợp của chúng có 36 dòng — thực tế chỉ lấy 26 (thiếu trang offset 20). Test này chưa từng chạy vì `npm test` loại `lesson-store` (better-sqlite3 build cho ABI Electron, phải chạy `npm run test:native`). Thêm `thirdPage` offset 20 và đưa vào `seen`; không đổi logic store.

**Chưa xác minh.** Chưa bấm tay trọn một luồng giáo án → game sau khi đổi cây (mới chạy check CDP + unit). `dist/src/services/` còn bản `.js` phẳng cũ do `clean` bị EPERM khi app đang mở; không file nào import đường dẫn cũ (đã kiểm `dist/src/main.js`), sẽ tự mất khi build sạch lúc app đóng. `ui-classifier-outline-check` **14/15** — assertion chờ nhánh MiniLM, máy này thiếu model nên rơi vào fallback (lỗi môi trường, không liên quan P3). `ui-ai-tasks-paging-check` **6/8** — profile mới chỉ có 1 trang lịch sử, check giả định sẵn ≥11 tác vụ; phân trang đã được kiểm bằng `test:native`. `ui-item-assets-editor-check` không dùng được làm bằng chứng ở đây (chụp màn hình treo khi cửa sổ bị che, xem #144).

**Next task.** P4 — tách `src/renderer/styles/app.css` theo khu vực (base / components / games / results / responsive), giữ `verify:css` **17/17**; sau đó P5 (các file lớn còn lại) chỉ khi P4 ổn định.


