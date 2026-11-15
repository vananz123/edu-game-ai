# Trạng thái dự án

Bàn giao mới nhất nằm ngay trong file này (3 mục gần nhất). Các bàn giao cũ được lưu ở
`docs/handoff/status/` — mỗi ngày một file, nối thêm vào cuối file của ngày đó khi cần.
Quy ước: sau mỗi việc, chèn bàn giao mới ngay dưới tiêu đề "Bàn giao gần nhất"; nếu quá 3 mục,
chuyển mục cũ nhất vào file lưu trữ đúng ngày của nó và cập nhật mục lục.

## Mục lục bàn giao

### 2026-11-15 — #266 màu cho cảnh + người trong cảnh (3 icon người, chủ thể dùng màu nhấn) — unit 99/99, assets 107/107
- **Trạng thái:** Cảnh minh hoạ không còn là sơ đồ một màu: **chủ thể và icon góc vẽ bằng màu nhấn của bảng màu** (`glow`) thay cho mực (`ink`); chủ thể thứ hai khi so sánh giữ `ink` nên hai hình khác màu nhau. Thêm **3 dòng người** vào từ vựng: `user` (Một người), `graduation-cap` (Học sinh), `hard-hat` (Người lao động) — dùng được ở chủ thể, hình so sánh, 4 góc và 2 ô đất.
- **Files:** `src/shared/illustration-scene.ts`, `src/renderer/features/game-illustration.ts` (mirror), `src/shared/scene-asset-catalog.ts`, `src/renderer/features/editor/questions.ts` (nhãn), `docs/AI_SCENE_DIRECTOR_DESIGN.md` (§4.2 + khối từ vựng §5.2), `tests/unit/{scene-blueprint,illustration-registry}.test.ts`, `tests/ui/ui-play-surface-check.js` (ngưỡng 28 → 26px cho khớp quyết định), `docs/DECISIONS.md` #266.
- **Đã đo:** `run-unit` **99/99** (54,4 s) · `ui-item-assets-editor-check` **107/107** trên binary release build lại · `check` 52 tệp UI sạch · `renderer-globals` 0 undefined · `check:embedded` khớp **6210,7 KiB** · **24 hash vàng lấy lại có chủ đích** (độ dài byte không đổi nên chỉ hash bắt được) · `devPath` gỡ → build → khôi phục, SHA-256 khớp ghim.
- **Đối chứng âm:** bỏ dòng 3 icon người khỏi `scene-asset-catalog` ⇒ `scene-blueprint` đỏ đúng chỗ (`user must be in the shared whitelist`), khôi phục ⇒ xanh.
- **Bằng chứng thị giác:** `images/color-266.png` (3 cảnh dựng bằng `renderBlueprintSvg`) và `images/scene-266-app.png` (chụp **trong app thật**: người + mũ tốt nghiệp + dấu `>`, sách ở góc, táo trên đất). Màu đo trong DOM: `#6b7fd0` (nhấn) và `#3a4b9c` (mực).
- **Học được:** một tên icon phải đi qua **4 nơi** (catalog, mirror renderer, nhãn editor, tài liệu prompt) — thiếu một nơi là cổng đỏ; và `node tests/run-unit.js` chạy `dist/`, nên sửa test mà quên `tsc` sẽ thấy lỗi "không có thật" (lại mắc lần nữa trong lượt này).
- **Chưa xác minh:** chưa duyệt bằng mắt người · `ui-play-surface-check` **787/788** — ở 1920×1080 trả lời **đúng** làm ô đáp án đầu dịch xuống **2px** (lỗi giật bố cục có sẵn, không do màu cảnh) · chưa thử 2 vật trên cùng một bên đất.
- **Việc kế tiếp:** P2 `process`/`surround` (chứng minh bằng toạ độ, không cần model), rồi sửa lỗi giật 2px ở màn chơi.

### 2026-11-15 — #265 kênh `scene:suggest` + nút "Gợi ý cảnh": lần chạy model THẬT đầu tiên (1047 ms) — 107/107
- **Trạng thái:** Nút "Gợi ý cảnh" trong khối minh hoạ đã gọi được AI thật qua kiến trúc Tauri: kênh `scene:suggest` (V8 slot `EGSCENE` giữ luật, Rust `scene.rs` giữ khoá/endpoint), `ai_tasks` ghi `kind=scene`, renderer nhận JSON rồi vẫn đi qua `normalizeSceneBlueprint` lần nữa.
- **Files:** `src-tauri/src/embedded/scene-ops.ts`, `src-tauri/src/scene.rs`, `src-tauri/src/api.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/embedded/template.js`, `scripts/build-embedded-js.js`, `src/renderer/core/desktop-facade-schema.ts`, `src/renderer/features/editor/questions.ts`, `tests/ui/ui-item-assets-editor-check.js` (+18 check), `tests/unit/desktop-facade.test.ts` (93 → 94 lời gọi), `docs/DECISIONS.md` #265, `docs/ROADMAP.md`.
- **Đo thật với Gemini `gemini-3.5-flash-lite`:** *"Con vật nào lớn hơn: con kiến hay con voi?"* → **1047 ms**, `layout=compare`, `mainIcon=bug`, `compareIcon=paw-print`, `compareSign=less-than`, 2 chủ thể + 2 góc trong preview, không toast. *"Phân số nào lớn hơn: 3/4 hay 2/5?"* → **2569 ms**, `layout=single` (classroom/math/calculator + 2 góc), preview **30 hình**/3776 byte SVG. SQLite: `ai_tasks` có hàng `kind=scene`, `state=completed`, summary `gợi ý cảnh: model`.
- **Lệnh đã chạy:** `ui-item-assets-editor-check` **107/107** trên binary release build lại · `run-unit` **99/99** (45,7 s) · `npm run check` 52 tệp UI sạch · `renderer-globals` **0 undefined** (1056 hàm / 8460 lời gọi) · `check:embedded` khớp **6210,6 KiB**. `devPath` gỡ → build → khôi phục, SHA-256 khớp ghim `5ae0bf6…b20e`.
- **Học được:** cloud provider chỉ `usable` **sau một lần `testAiProvider` thành công** (#132 §D7) — "đã lưu khoá" ≠ "dùng được", và triệu chứng là `[AI_NO_PROVIDER]` chứ không phải lỗi mạng. Thêm một lời gọi façade làm đỏ **hai** cổng hợp đồng có sẵn (`tauri-contract`, `desktop-facade`); cách sửa là thêm lệnh Rust thật + nâng số đếm, không nới cổng.
- **Chưa xác minh:** `listAiTasks` trả rỗng ngay sau lượt chạy dù SQLite có hàng — cần một lượt riêng · chưa thử nút này trên câu `scenario` (bố cục #254) · chưa có người duyệt bằng mắt (mới qua vision-model).
- **Việc kế tiếp:** P2 `process`/`surround` (không cần model), hoặc điều tra `listAiTasks`.

### 2026-11-15 — #264 đường ống gợi ý cảnh (thuần TS, model tiêm, luôn có fallback) — 99/99
- **Trạng thái:** Thêm `src/services/ai/scene-suggest.ts`: prompt dựng **từ catalog**, trích `{…}` cân bằng (hiểu chuỗi/escape/fence), chạy `normalizeSceneBlueprint`, và **luôn trả cảnh vẽ được** — gọi lỗi / JSON hỏng / id lạ / quá dài ⇒ rơi về `sceneBlueprintFromCategory` kèm `issues`.
- **Files:** `src/services/ai/scene-suggest.ts` (mới), `tests/unit/scene-suggest.test.ts` (mới, 12 check), `docs/DECISIONS.md` #264, `docs/ROADMAP.md`, `docs/STATUS.md`.
- **Quyết định:** model **tiêm** từ ngoài (kiểm được không cần khoá/mạng) · chặn phản hồi >8000 ký tự **trước** khi parse · phân biệt `source:'fallback'` với `source:'model'` + `issues` khi `compare` bị hạ cấp (gộp lại sẽ giấu đúng lỗi #262 dựng luật để tránh).
- **Lệnh đã chạy:** `node tests/run-unit.js scene-suggest` **12/12** · `run-unit` **99/99** (44,6 s) · `npm run check` sạch (52 tệp UI) · `renderer-globals` 0 undefined · `check:embedded` khớp 6163,8 KiB.
- **Đối chứng âm (đỏ đúng chỗ):** bỏ trần 8000 ký tự ⇒ check 11 · bỏ hiểu chuỗi JSON ⇒ check 6 · bỏ nhánh fallback ⇒ check 9.
- **Học được:** ca thử ngoặc **cân nhau** trong chuỗi không phân biệt được scanner với phép đếm ký tự — phải dùng ca **lệch** thì đối chứng mới đỏ. Và sửa file bằng `python` trong heredoc tiếp tục ăn mất escape `
` hai lần; phải dùng `edit` cho các chuỗi có dấu `\`.
- **Chưa xác minh (quan trọng):** module **chưa nối vào đâu** — chưa có kênh Rust `scene:suggest`, chưa có nút "✨ Gợi ý cảnh từ nội dung", chưa ghi `ai_tasks`, **chưa chạy lần nào với model thật**. Giáo viên vẫn chỉ có "Cảnh thử".
- **Việc kế tiếp:** kênh Rust `scene:suggest` (khoá ở backend, gọi `ai_http`, ghi `ai_tasks`) + nút trong editor gọi `suggestSceneBlueprint`, rồi đo trên binary thật.

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
