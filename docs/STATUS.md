# Trạng thái dự án

Bàn giao mới nhất nằm ngay trong file này (3 mục gần nhất). Các bàn giao cũ được lưu ở
`docs/handoff/status/` — mỗi ngày một file, nối thêm vào cuối file của ngày đó khi cần.
Quy ước: sau mỗi việc, chèn bàn giao mới ngay dưới tiêu đề "Bàn giao gần nhất"; nếu quá 3 mục,
chuyển mục cũ nhất vào file lưu trữ đúng ngày của nó và cập nhật mục lục.

## Mục lục bàn giao

### 2026-10-31 — [docs/handoff/status/2026-10-31.md](handoff/status/2026-10-31.md)
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

## Handoff - Nhãn "Cách chơi" trên thẻ trò chơi (2026-10-31, DECISIONS #155)

**Files changed.**
- `src/renderer/shared.ts` (`gameCard`): thêm `playMode` + `playModeChip` — chip đầu hàng chip cho template `quiz`: `🏗 Cách chơi: Xây nhà` (hổ phách, đậm) khi `gameSetup.gameplayMode === 'house'`, `🎯 Cách chơi: Cổ điển` (xanh nhạt) cho mọi quiz còn lại (vắng key = cổ điển, theo `editorGameplayMode`); mỗi chip có `data-play-mode` + `title` giải thích.
- `tests/ui/ui-play-mode-card-check.js` (mới, 7 check): 4 game tổng hợp qua IPC thật (quiz house / quiz không đặt mode / quiz `'classic'` tường minh / matching), lọc thư viện về đúng fixture, đọc `data-play-mode` + chữ chip, kiểm matching không có chip và chip không thêm nút vào thẻ; dọn fixture cuối.
- Docs: `docs/DECISIONS.md` (#155), `docs/STATUS.md`, `docs/handoff/status/2026-10-31.md` (chuyển bàn giao #152 vào lưu trữ).
- Không đổi: dữ liệu lưu (`gameplayMode` có từ #140), editor, engine, IPC, markup/nút của thẻ.

**Behavior.** Thẻ trò chơi quiz ở Thư viện (và mục "Trò chơi gần đây" ở Tổng quan, vì dùng chung `gameCard()`) hiện thêm một chip cách chơi ngay trước chip môn học, nên giáo viên biết game đang ở Cổ điển hay Xây nhà mà không phải mở editor. Bốn thể loại khác không có chip. Ảnh chụp 1920×1080 và 1366×768: chip nằm gọn một dòng cùng môn/lớp/số câu.

**Commands run.** `npm run check` 0 · `npm run check:renderer-globals` 0 undefined (54/55 script, 762 hàm, 6.252 call site) · `npm run build` 0 · `node tests/run-unit.js` **68/68** · Electron thật, mỗi check một profile sạch: `ui-play-mode-card-check` **7/7**, `ui-library-paging-check` pass, `ui-card-menu-check` pass.

**Chưa xác minh.** Chưa bấm tay trên profile nhiều game để cảm nhận chip khi hàng chip xuống hai dòng ở cửa sổ hẹp (đã xem ảnh 1366×768, vẫn một dòng). Chưa lọc/tìm theo cách chơi; chưa hiện cách chơi ngoài thẻ. Chưa chạy installer đóng gói.

**Next task.** Roadmap `Packaged check` (cần máy sạch); các mục AI/giáo án chưa chốt thứ tự.

---

## Handoff - Phân trang và xoá nhiều ở Thư viện trò chơi (2026-10-31, DECISIONS #154)

**Files changed.**
- `src/renderer/pages/library.ts` (viết lại, 7 → ~75 dòng): `LIBRARY_PAGE_SIZE = 9` (ba hàng của lưới ba cột), `libraryCurrentPage`, `librarySelectedIds`, `libraryPagerHtml`, `librarySelectionBarHtml`, `libraryCardHtml` — thẻ game giữ nguyên `gameCard()`, chỉ bọc thêm `div` có ô tick + viền khi chọn.
- `src/renderer/core/controller.ts`: `updateLibrarySelectionUi()`; action `library-page` / `library-select` / `library-clear-selection` / `library-delete-selected`; select-all chỉ tick thẻ đang render; gõ tìm kiếm hoặc đổi thể loại đưa về trang 1.
- `src/preload.ts`: `deleteGames(ids)` → `library:delete-games`.
- `src/main.ts`: handler `library:delete-games` — id chuỗi duy nhất, từ chối lô rỗng, tối đa 500; xoá mọi hàng trong một transaction rồi mới dọn ảnh tải lên (#124), trả `{ ok, deleted, missing }`.
- `tests/ui/ui-library-paging-check.js` (mới, 12 check): 11 game tổng hợp qua IPC thật, lọc về đúng fixture (không bao giờ tick/xoá game sẵn có của giáo viên), kiểm 9 thẻ/trang, pager, chọn-tất-cả theo trang, lựa chọn sống qua trang, xoá đúng nhóm, game khác còn nguyên, IPC từ chối lô rỗng; dọn fixture cuối.
- Docs: `docs/DECISIONS.md` (#154), `docs/STATUS.md`.
- Không đổi: `library:delete-game` (xoá lẻ từ menu "•••"), `gameCard()`, markup thẻ, SQLite schema, `.egame`, trang chủ.

**Behavior.** Thư viện trò chơi chia 9 game/trang có pager (Trước / số trang / Sau) và chỉ tick được thẻ đang hiện; đã tick thì viền tím, đếm "Đã chọn N trò chơi", lựa chọn giữ khi đổi trang. Nút "🗑 Xoá đã chọn" hỏi xác nhận kèm tối đa 5 tên, xoá đúng nhóm trong một transaction, dọn ảnh không còn ai dùng, bỏ chọn và ẩn pager khi còn một trang. Gõ tìm kiếm/đổi thể loại luôn quay về trang 1.

**Commands run.** `npm run check` 0 · `npm run build` 0 · `npm run check:renderer-globals` 0 undefined (55 script, 6.194 call site) · `node tests/run-unit.js` **68/68** · Electron thật, mỗi check một instance sạch: `ui-library-paging-check` **12/12**, `ui-card-menu-check` pass, `ui-lessons-paging-check` **10/10**, `ui-results-paging-check` **11/11**.

**Chưa xác minh.** Chưa bấm tay trên profile thật nhiều game để cảm nhận bố cục 9 thẻ/trang ở 1366×768; chưa có "chọn tất cả mọi trang" và chưa có hoàn tác (lời xác nhận đã ghi rõ không thể hoàn tác, nhắc xuất `.egame` trước). Chưa chạy installer đóng gói.

**Next task.** Roadmap `Packaged check` (cần máy sạch); nếu phải sửa cả ba trang danh sách lần nữa thì gom pager thành helper dùng chung (giáo án / thư viện / lịch sử).

---

## Handoff - Bốn yêu cầu #153: bỏ ảnh theo câu, nhãn "Đấu trường tri thức", ảnh thay nhãn xám, hạ HUD Xây nhà (2026-10-31, DECISIONS #153)

**Files changed.**
- `src/shared/illustration-registry.ts`: hằng `ILLUSTRATION_NONE_ID = 'none'`; `resolveIllustration` trả `null` khi gặp sentinel (sau `normalizeItemAssets`); cập nhật chú thích `off` / bullet mới cho `'none'`.
- `src/renderer/features/game-illustration.ts`: `resolveStageIllustration` mirror đúng luật đó (unit test có guard chống lệch).
- `src/renderer/features/editor/questions.ts`: `editorItemArtHtml` thêm option `Không dùng ảnh` trong picker, badge/thumb riêng, nút **"✕ Bỏ ảnh"** (`data-editor-art-remove`, disabled khi đã bỏ), chip `🚫 Không ảnh`; `wireEditorItemArtRow` ghi sentinel `'none'` (không ghi `''`).
- `src/renderer/features/games/result-screen.ts`: `GAME_WORLDS.quiz.label` → `ĐẤU TRƯỜNG TRI THỨC` (badge đầu màn chơi + dải băng sân khấu dùng chung nguồn này).
- `src/renderer/features/games/quiz.ts` (`renderQuestion`): bỏ pill xám cho trắc nghiệm thường (giữ cho tình huống / điền từ / trả lời ngắn / đúng-sai); ảnh chỉ định của câu trong Xây nhà đặt ngang hàng bên trái ô nhà (`.house-art-row`).
- `src/renderer/styles/game-house.css`: khối `.house-art-row` / `.house-question-art` kích thước theo `vh`, thêm vào danh sách ẩn của `.is-house-showcase`; `.house-progress` có `margin-top` theo `vh` (chỉ trạng thái trước khi trả lời).
- Tests: `tests/ui/ui-editor-art-check.js` (4 check "Bỏ ảnh"), `tests/ui/ui-game-worlds-check.js` (nhãn mới + `pickedBesideSlot` + check ảnh thế chỗ pill), `tests/ui/ui-house-building-check.js` (`hudTop`/`progressBarBottom`/`houseArt`, check HUD cách thanh tiến độ ≥12px), `tests/unit/illustration-registry.test.ts` (2 test hành vi + guard lệch renderer); `tests/ui/ui-fullscreen-density-check.js` và `tests/ui/ui-stage-illustration-check.js` thêm guard đóng setup onboarding cho profile mới.
- Docs: `docs/DECISIONS.md` (#153), `docs/STATUS.md`.
- Không đổi: hợp đồng IPC, engine matching/treasure/race, `normalizeGame` (đường `.egame`), `playGame`.

**Behavior.** Giáo viên bỏ được ảnh của **một câu** mà không phải tắt ảnh cả game, và ảnh đã bỏ không bị chế độ `auto` vẽ lại. Game quiz ở toàn màn hình mang tên "ĐẤU TRƯỜNG TRI THỨC" ở badge và dải băng. Ở chế độ Xây nhà, pill xám "THỬ THÁCH KIẾN THỨC" đã bỏ; nếu câu hỏi có ảnh **giáo viên chọn** thì ảnh nằm đúng chỗ đó (ngang hàng bên trái ô nhà 3D), tranh tự động thì không. HUD "Đã xây 1/5 phần" hạ xuống: cách đáy thanh tiến độ **61px** @1920×1080 và **45px** @1366×768; ảnh đo được **324×203** và **230×144**, không tràn màn hình.

**Commands run.** `npm run check` 0 · `node tests/run-unit.js` **68/68** · `npm run build` 0 · `npm run check:renderer-globals` 0 undefined · `npm run verify:css` **17/17** · Electron thật qua CDP, mỗi check một instance sạch: `ui-game-worlds-check` **52/52**, `ui-house-building-check` **85/85**, `ui-editor-art-check` pass, `ui-stage-illustration-check` **169/169**, `ui-item-assets-editor-check` **29/29**, `ui-fullscreen-density-check` **8/8**.

**Chưa xác minh.** Chưa mở app bằng mắt để đối chiếu ảnh chụp của chủ dự án (kết luận dựa trên probe CDP + số đo). WebGL không hiện trong `Page.captureScreenshot` (chỉ thấy sàn xám ở 1366×768) — hạn chế chụp, ngôi nhà 3D được chứng minh bằng assertion toạ độ chiếu. Chưa chạy installer đóng gói. `ui-wizard-structure-check` (focus môi trường) và `ui-draft-guard-check` (thiếu model AI) vẫn đỏ do nguyên nhân có sẵn.

**Next task.** Roadmap `Packaged check` (cần máy sạch); các mục AI/giáo án chưa chốt thứ tự.




