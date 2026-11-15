# Trạng thái dự án

Bàn giao mới nhất nằm ngay trong file này (3 mục gần nhất). Các bàn giao cũ được lưu ở
`docs/handoff/status/` — mỗi ngày một file, nối thêm vào cuối file của ngày đó khi cần.
Quy ước: sau mỗi việc, chèn bàn giao mới ngay dưới tiêu đề "Bàn giao gần nhất"; nếu quá 3 mục,
chuyển mục cũ nhất vào file lưu trữ đúng ngày của nó và cập nhật mục lục.

## Mục lục bàn giao

### 2026-11-16 — #268 UI `process` trong trình soạn (Kiểu + Bậc 2/Bậc 3) — cổng assets 107 → 130/130
- **Trạng thái:** Giáo viên đã chọn được bố cục quy trình: Kiểu có thêm "Quy trình nhiều bậc", hai ô `Bậc 2`/`Bậc 3` điền các bậc sau bước đầu; preview vẽ ngay dải 3 icon + 2 mũi tên. Đổi Kiểu sang quy trình là **tự chọn bậc 2** để một cú bấm ra cảnh hợp lệ (không tự nhảy về Một hình); về `single` thì `steps` bị xoá khỏi JSON.
- **Files:** `src/renderer/features/editor/questions.ts` (hằng số bậc + ô chọn + nhánh ghi blueprint + wire `change`), `tests/ui/ui-item-assets-editor-check.js` (+23 check, thêm khối lưu thật thứ hai), `docs/AI_SCENE_DIRECTOR_DESIGN.md` (§3.4 + đầu tài liệu: UI không còn "CHƯA CÓ"), `docs/DECISIONS.md` #268, `docs/ROADMAP.md`, `images/scene-267-app.png`.
- **Đã đo:** `ui-item-assets-editor-check` **130/130** trên binary release build lại (CDP 9365) · `run-unit` **99/99** (45,4 s) · `npm run check` 52 tệp UI sạch · `renderer-globals` 0 undefined (1057 hàm / 8488 lời gọi) · `check:embedded` khớp **6212,2 KiB** · installer 15,67 MiB · `devPath` gỡ → build → khôi phục, SHA-256 khớp ghim.
- **Đối chứng âm (từ chính lượt này):** gán cứng bậc 3 một id đã bị loại khỏi danh sách ⇒ 5 check đỏ và lộ ra rằng phép đo đang nói dối; giữ node `[data-editor-art]` qua một lần redraw ⇒ `sceneBlueprint` đọc ra `null`. Cả hai đã sửa trong test, không nới cổng.
- **Bằng chứng thị giác:** `images/scene-267-app.png` (chụp trong app thật) — Kiểu "Quy trình nhiều bậc", Bậc 2 = Quả táo, Bậc 3 = Cái hộp, preview 3 icon + 2 mũi tên, không cắt/không đè.
- **Học được:** `redrawEditorArtRow` **thay hẳn** node `[data-editor-art]`; giữ node đó qua một lần redraw thì mọi `select` sau đó ghi vào hư không — phải giữ **hàng câu hỏi** và query lại. Và một bài kiểm gán cứng giá trị vào `<select>` mà không kiểm option có tồn tại sẽ "xanh giả".
- **Chưa xác minh:** chưa chạy `process` qua model thật · chưa duyệt bằng mắt người · `surround` vẫn CHƯA CÓ · `ui-play-surface-check` vẫn 787/788 (lỗi giật 2px có sẵn, không liên quan).
- **Việc kế tiếp:** chạy "Gợi ý cảnh" một câu quy trình thật để xem model có chọn `process` không, hoặc `surround`, hoặc sửa lỗi giật 2px ở màn chơi.

### 2026-11-16 — #267 `process`: dải 2–3 bậc (dữ liệu + hình + prompt; UI CHƯA CÓ) — unit 99/99, scene-blueprint 39/39
- **Trạng thái:** Layout thứ ba `process` ra đời: `mainIcon` là **bậc 1**, `steps` (tối đa 2) là các bậc sau **theo đúng thứ tự**; engine vẽ thành **dải ngang** 2–3 bậc với mũi tên giữa các khe. Prompt §5 đã dạy model `process` kèm **ví dụ JSON thật** chạy qua `normalizeSceneBlueprint` với 0 issue. **UI trình soạn chưa có** nên giáo viên chưa tự chọn được `process` — chỉ kênh AI sinh ra nó.
- **Hình học (đo bằng test):** 2 bậc x = 48/196, 3 bậc x = 16/122/228, y = 66, cạnh 76; mũi tên rộng 14 nằm giữa khe, tâm y 104; góc chỉ còn `top-left`/`top-right` (40px, y 6) vì `left`/`right` đúng chỗ bậc 1 và bậc 3; props giữ nguyên y 146.
- **Files:** `src/shared/scene-asset-catalog.ts` (`SCENE_LAYOUT_IDS`, `SCENE_PROCESS_MAX_EXTRA_STEPS`, `SCENE_PROCESS_SUB_ICON_POSITIONS`), `src/shared/scene-blueprint.ts` (kiểu `steps`, luật hạ cấp), `src/shared/illustration-scene.ts` (hằng số + `renderProcessStrip`), `src/renderer/features/game-illustration.ts` (mirror), `docs/AI_SCENE_DIRECTOR_DESIGN.md` (§3.4 mới, §5.2 từ vựng + luật 4/6/7/11 + ví dụ), `tests/unit/scene-blueprint.test.ts` (30 → 39), `tests/unit/scene-prompt-doc.test.ts` (15 → 16), `docs/DECISIONS.md` #267, `images/process-267.png`.
- **Đã đo:** `run-unit` **99/99** (44,3 s) · `scene-blueprint` **39/39** · `scene-prompt-doc` **16/16** · `npm run check` 52 tệp UI sạch · `renderer-globals` 0 undefined (1057 hàm / 8477 lời gọi) · `check:embedded` khớp **6212,2 KiB** · 24 hash vàng **không đổi** (cảnh P0 dựng từ category, không qua blueprint).
- **Đối chứng âm:** `STAGE_SCENE_PROCESS_STEP_TOP` 66→68 ở mirror ⇒ `renderer geometry differs`; bỏ `arrows.join` ở bản shared ⇒ `an arrow between stage 1-2 and 2-3`; bỏ nhánh hạ cấp ⇒ `steps=undefined must degrade`; nâng trần bước lên 3 ⇒ deep-equal sai. Tất cả khôi phục ⇒ xanh.
- **Bằng chứng thị giác:** `images/process-267.png` — 3 cảnh (2 bậc có góc; 3 bậc có 2 góc + props; 3 bậc nền sao). Mô hình thị giác: hàng bậc rõ thứ tự, mũi tên đúng chiều, không đè dải đất hay icon góc.
- **Học được:** test parity cũ chỉ so `subjects/icons/props/sign` nên **không bắt được** hình học mới — phải mở `sceneBoxes` cho `steps` và `arrows`, nếu không thì hai bản vẽ lệch nhau mà cổng vẫn xanh. Và `node tests/run-unit.js` đọc `dist/`, nên đối chứng âm sửa `.ts` mà **không chạy `tsc`** sẽ "xanh giả" (mắc lại lần này).
- **Chưa xác minh:** UI trình soạn cho `process` (chưa có) · chưa chạy `process` qua model thật · chưa duyệt bằng mắt người · `surround` vẫn CHƯA CÓ.
- **Việc kế tiếp:** UI trình soạn cho `process` (bước 3 của P2), rồi `surround` hoặc sửa lỗi giật 2px ở màn chơi.

### 2026-11-15 — #266 màu cho cảnh + người trong cảnh (3 icon người, chủ thể dùng màu nhấn) — unit 99/99, assets 107/107
- **Trạng thái:** Cảnh minh hoạ không còn là sơ đồ một màu: **chủ thể và icon góc vẽ bằng màu nhấn của bảng màu** (`glow`) thay cho mực (`ink`); chủ thể thứ hai khi so sánh giữ `ink` nên hai hình khác màu nhau. Thêm **3 dòng người** vào từ vựng: `user` (Một người), `graduation-cap` (Học sinh), `hard-hat` (Người lao động) — dùng được ở chủ thể, hình so sánh, 4 góc và 2 ô đất.
- **Files:** `src/shared/illustration-scene.ts`, `src/renderer/features/game-illustration.ts` (mirror), `src/shared/scene-asset-catalog.ts`, `src/renderer/features/editor/questions.ts` (nhãn), `docs/AI_SCENE_DIRECTOR_DESIGN.md` (§4.2 + khối từ vựng §5.2), `tests/unit/{scene-blueprint,illustration-registry}.test.ts`, `tests/ui/ui-play-surface-check.js` (ngưỡng 28 → 26px cho khớp quyết định), `docs/DECISIONS.md` #266.
- **Đã đo:** `run-unit` **99/99** (54,4 s) · `ui-item-assets-editor-check` **107/107** trên binary release build lại · `check` 52 tệp UI sạch · `renderer-globals` 0 undefined · `check:embedded` khớp **6210,7 KiB** · **24 hash vàng lấy lại có chủ đích** (độ dài byte không đổi nên chỉ hash bắt được) · `devPath` gỡ → build → khôi phục, SHA-256 khớp ghim.
- **Đối chứng âm:** bỏ dòng 3 icon người khỏi `scene-asset-catalog` ⇒ `scene-blueprint` đỏ đúng chỗ (`user must be in the shared whitelist`), khôi phục ⇒ xanh.
- **Bằng chứng thị giác:** `images/color-266.png` (3 cảnh dựng bằng `renderBlueprintSvg`) và `images/scene-266-app.png` (chụp **trong app thật**: người + mũ tốt nghiệp + dấu `>`, sách ở góc, táo trên đất). Màu đo trong DOM: `#6b7fd0` (nhấn) và `#3a4b9c` (mực).
- **Học được:** một tên icon phải đi qua **4 nơi** (catalog, mirror renderer, nhãn editor, tài liệu prompt) — thiếu một nơi là cổng đỏ; và `node tests/run-unit.js` chạy `dist/`, nên sửa test mà quên `tsc` sẽ thấy lỗi "không có thật" (lại mắc lần nữa trong lượt này).
- **Chưa xác minh:** chưa duyệt bằng mắt người · `ui-play-surface-check` **787/788** — ở 1920×1080 trả lời **đúng** làm ô đáp án đầu dịch xuống **2px** (lỗi giật bố cục có sẵn, không do màu cảnh) · chưa thử 2 vật trên cùng một bên đất.
- **Việc kế tiếp:** P2 `process`/`surround` (chứng minh bằng toạ độ, không cần model), rồi sửa lỗi giật 2px ở màn chơi.

### 2026-11-15 — #265 kênh `scene:suggest` + nút "Gợi ý cảnh": lần chạy model THẬT đầu tiên (1047 ms) — 107/107 — bản đầy đủ: [docs/handoff/status/2026-11-15.md](handoff/status/2026-11-15.md).
### 2026-11-15 — #264 đường ống gợi ý cảnh (thuần TS, model tiêm, luôn có fallback) — bản đầy đủ: [docs/handoff/status/2026-11-15.md](handoff/status/2026-11-15.md).
### 2026-11-15 — #263 P3 bước prompt: `compare` vào §5 + ví dụ mẫu chạy qua cổng dữ liệu thật — bản đầy đủ: [docs/handoff/status/2026-11-15.md](handoff/status/2026-11-15.md).

### 2026-11-15 — P1 `compare` chốt sổ: ROADMAP cập nhật + smoke-install bản 0.5.2 vào thư mục tạm — bản đầy đủ: [docs/handoff/status/2026-11-15.md](handoff/status/2026-11-15.md).

### 2026-11-15 — #262 P1 `compare` bước 3: UI editor (Kiểu / Hình phải / Dấu), cổng thật 63 → 89/89 — bản đầy đủ: [docs/handoff/status/2026-11-15.md](handoff/status/2026-11-15.md).

### 2026-11-15 — #262 P1 `compare` bước 2: VẼ hai chủ thể + dấu (10 nền), test toạ độ hai hộp — bản đầy đủ: [docs/handoff/status/2026-11-15.md](handoff/status/2026-11-15.md).

### 2026-11-15 — #262 P1 `compare` bước 1: dữ liệu + chuẩn hoá (chưa vẽ) — bản đầy đủ: [docs/handoff/status/2026-11-15.md](handoff/status/2026-11-15.md).

### 2026-11-15 — #260 UI 2 ô props + cổng 63/63 — Bản lưu trữ: [docs/handoff/status/2026-11-15.md](handoff/status/2026-11-15.md).

### 2026-11-15 — #258 cổng chống backtick + #259 `props[]` — Bản lưu trữ: [docs/handoff/status/2026-11-15.md](handoff/status/2026-11-15.md).

### 2026-11-15 — #257 UI chọn 4 góc cho giáo viên (trước đó chỉ JSON/AI đặt được) — Bản lưu trữ: [docs/handoff/status/2026-11-15.md](handoff/status/2026-11-15.md).

### 2026-11-15 — #252–#256, phát hành 0.5.2, `tauri:check` xanh lần đầu, giao diện dày — Bản lưu trữ: [docs/handoff/status/2026-11-15.md](handoff/status/2026-11-15.md).

### 2026-11-06 — #209 task 1+2, task 3, task 4, task 5, task 6 và task 7 đã lưu ở [docs/handoff/status/2026-11-06.md](handoff/status/2026-11-06.md)

### 2026-11-02 — #171–#173 đã lưu ở [docs/handoff/status/2026-11-02.md](handoff/status/2026-11-02.md)

### 2026-11-12 — Commit nối writer ai_tasks vào 4 đường gọi AI (f106cc0): lesson:analyze, lesson:generate, lesson:regener… — Bản lưu trữ: [docs/handoff/status/2026-11-12.md](handoff/status/2026-11-12.md).

### 2026-11-10 — Giai đoạn 3 hoàn tất: import tài liệu/câu hỏi/ảnh + chẩn đoán, rồi chơi game đã lưu khi offline trong vỏ… — Bản lưu trữ: [docs/handoff/status/2026-11-10.md](handoff/status/2026-11-10.md).

### 2026-11-09 — Kế hoạch khảo sát và chuyển EduGame Studio từ Electron sang Tauri; giai đoạn 0 kiểm kê API + baseline El… — Bản lưu trữ: [docs/handoff/status/2026-11-09.md](handoff/status/2026-11-09.md).

### 2026-11-08 — Bộ xử lý AI local: lựa chọn GPU tới được tiến trình đang chạy (#227), Phát hành 0.5.0 (#226), khối thảo … — Bản lưu trữ: [docs/handoff/status/2026-11-08.md](handoff/status/2026-11-08.md).

### 2026-11-07 — Phát hành v0.4.2, #216 và #215 — Bản lưu trữ: [docs/handoff/status/2026-11-07.md](handoff/status/2026-11-07.md).

### 2026-11-05 — Bản lưu trữ: [docs/handoff/status/2026-11-05.md](handoff/status/2026-11-05.md).

### 2026-11-04 — Bản lưu trữ: [docs/handoff/status/2026-11-04.md](handoff/status/2026-11-04.md).

### 2026-11-03 — Bản lưu trữ: [docs/handoff/status/2026-11-03.md](handoff/status/2026-11-03.md).

### 2026-11-01 — [docs/handoff/status/2026-11-01.md](handoff/status/2026-11-01.md) — Bản lưu trữ: [docs/handoff/status/2026-11-01.md](handoff/status/2026-11-01.md).

### 2026-10-31 — [docs/handoff/status/2026-10-31.md](handoff/status/2026-10-31.md) — Bản lưu trữ: [docs/handoff/status/2026-10-31.md](handoff/status/2026-10-31.md).

### 2026-10-30 — [docs/handoff/status/2026-10-30.md](handoff/status/2026-10-30.md) — Bản lưu trữ: [docs/handoff/status/2026-10-30.md](handoff/status/2026-10-30.md).

### 2026-10-29 — [docs/handoff/status/2026-10-29.md](handoff/status/2026-10-29.md) — Bản lưu trữ: [docs/handoff/status/2026-10-29.md](handoff/status/2026-10-29.md).

### 2026-10-28 — [docs/handoff/status/2026-10-28.md](handoff/status/2026-10-28.md) — Bản lưu trữ: [docs/handoff/status/2026-10-28.md](handoff/status/2026-10-28.md).

### 2026-10-27 — [docs/handoff/status/2026-10-27.md](handoff/status/2026-10-27.md) — Bản lưu trữ: [docs/handoff/status/2026-10-27.md](handoff/status/2026-10-27.md).

### 2026-10-26 — [docs/handoff/status/2026-10-26.md](handoff/status/2026-10-26.md) — Bản lưu trữ: [docs/handoff/status/2026-10-26.md](handoff/status/2026-10-26.md).

### 2026-10-25 — [docs/handoff/status/2026-10-25.md](handoff/status/2026-10-25.md) — Bản lưu trữ: [docs/handoff/status/2026-10-25.md](handoff/status/2026-10-25.md).

### Không ghi ngày (mục cũ #70–#79, khoảng 2026-10-22/23) — [docs/handoff/status/undated-070-079.md](handoff/status/undat… — Bản lưu trữ: [docs/handoff/status/undated-070-079.md](handoff/status/undated-070-079.md).

### 2026-10-23 — [docs/handoff/status/2026-10-23.md](handoff/status/2026-10-23.md) — Bản lưu trữ: [docs/handoff/status/2026-10-23.md](handoff/status/2026-10-23.md).

### 2026-10-22 — [docs/handoff/status/2026-10-22.md](handoff/status/2026-10-22.md) — Bản lưu trữ: [docs/handoff/status/2026-10-22.md](handoff/status/2026-10-22.md).

### 2026-10-21 — [docs/handoff/status/2026-10-21.md](handoff/status/2026-10-21.md) — Bản lưu trữ: [docs/handoff/status/2026-10-21.md](handoff/status/2026-10-21.md).

### 2026-10-20 — [docs/handoff/status/2026-10-20.md](handoff/status/2026-10-20.md) — Bản lưu trữ: [docs/handoff/status/2026-10-20.md](handoff/status/2026-10-20.md).

### 2026-10-19 — [docs/handoff/status/2026-10-19.md](handoff/status/2026-10-19.md) — Bản lưu trữ: [docs/handoff/status/2026-10-19.md](handoff/status/2026-10-19.md).

### Giai đoạn 3 bước 1/6 — Chốt backend SQLite của vỏ Tauri: `rusqlite` bundled, cùng tệp, cùng DDL, đã mở được dữ liệu 0… — Bản lưu trữ: [docs/handoff/status/2026-11-09.md](handoff/status/2026-11-09.md).

### Giai đoạn 2 — Tách API desktop khỏi renderer: một façade, hai adapter, Tauri không còn `window.eduGame` (2026-11-09) — Bản lưu trữ: [docs/handoff/status/2026-11-09.md](handoff/status/2026-11-09.md).

### #251 — Chốt bảy quyết định phạm vi/tiêu chí của kế hoạch Tauri (2026-11-09) — Bản lưu trữ: [docs/handoff/status/2026-11-09.md](handoff/status/2026-11-09.md).

### Giai đoạn 0 của kế hoạch Tauri: kiểm kê API desktop và đo baseline Electron 0.5.1 (2026-11-09) — Bản lưu trữ: [docs/handoff/status/2026-11-09.md](handoff/status/2026-11-09.md).

### Kế hoạch khảo sát/chuyển Electron sang Tauri (2026-11-09) — Bản lưu trữ: [docs/handoff/status/2026-11-09.md](handoff/status/2026-11-09.md).

### npm start chạy bản mới: build sạch 0.5.1 và xác minh #250 trên chính dist vừa build (2026-11-09) — Bản lưu trữ: [docs/handoff/status/2026-11-09.md](handoff/status/2026-11-09.md).

### #250 — Khung chat Giáo án: xoá cuộc trò chuyện xong vẫn gõ được, gửi xong ô nhập tự trống (2026-11-09) — Bản lưu trữ: [docs/handoff/status/2026-11-09.md](handoff/status/2026-11-09.md).

### #229 — Hỏi đáp AI local đọc nhiều hơn hẳn: ngân sách theo cửa sổ ngữ cảnh thật, lược phần giữa giáo án, và câu trả lờ… — Bản lưu trữ: [docs/handoff/status/2026-11-09.md](handoff/status/2026-11-09.md).

### #228 — CPU → Vulkan: lần thay bản không bị khóa thư mục nữa, và bỏ trạng thái "cài GPU vẫn chạy CPU" (2026-11-09) — Bản lưu trữ: [docs/handoff/status/2026-11-09.md](handoff/status/2026-11-09.md).

### #224 — Dòng "Thảo luận" của Tình huống mang mực câu hỏi; khối phản hồi dưới ảnh hết chữ trắng (2026-11-08) — Bản lưu trữ: [docs/handoff/status/2026-11-08.md](handoff/status/2026-11-08.md).

### #223 — Bỏ "Giữ hành vi hiện tại": game cũ mở ra là Thi đấu, lưu bằng token (2026-11-08) — Bản lưu trữ: [docs/handoff/status/2026-11-08.md](handoff/status/2026-11-08.md).

### #219 — Chòm sao tri thức: chữ to hơn, phản hồi đúng/sai rõ ràng (2026-11-08) — Bản lưu trữ: [docs/handoff/status/2026-11-08.md](handoff/status/2026-11-08.md).

### Đóng nợ #212 — lỗi checksum có kind riêng, đo 62/62 trên binary đóng gói (2026-11-08) — Bản lưu trữ: [docs/handoff/status/2026-11-08.md](handoff/status/2026-11-08.md).

### Chế độ dev `npm run dev` — sửa renderer thấy ngay, không cần mở lại app (2026-11-07) — Bản lưu trữ: [docs/handoff/status/2026-11-07.md](handoff/status/2026-11-07.md).
