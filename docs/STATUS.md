# Trạng thái dự án

Bàn giao mới nhất nằm ngay trong file này (3 mục gần nhất). Các bàn giao cũ được lưu ở
`docs/handoff/status/` — mỗi ngày một file, nối thêm vào cuối file của ngày đó khi cần.
Quy ước: sau mỗi việc, chèn bàn giao mới ngay dưới tiêu đề "Bàn giao gần nhất"; nếu quá 3 mục,
chuyển mục cũ nhất vào file lưu trữ đúng ngày của nó và cập nhật mục lục.

## Mục lục bàn giao

### 2026-11-15 — #260 UI cho `props`: 2 ô “Đất trái / Đất phải”, khép vòng #259
- **Trạng thái:** Khối minh hoạ trong editor có thêm hàng **“Vật thể đứng ở mặt đất”** với 2 ô `Đất trái` / `Đất phải`, cùng cơ chế ghi với 4 góc. Danh sách **loại sẵn** chủ thể và các icon đã dùng ở góc, vì normaliser sẽ bỏ chúng — thà không cho chọn còn hơn cho chọn rồi im lặng mất.
- **Files đã đổi:** `src/renderer/features/editor/questions.ts` (khối `[data-editor-art-props]`, `propsHtml`, `applyEditorSceneSlots` ghi cả `props`, wire `change`) · `tests/ui/ui-item-assets-editor-check.js` (**+9 check**) · `docs/STATUS.md`, `docs/DECISIONS.md`.
- **Hành vi:** Chọn prop → blueprint + preview + lần lưu đổi ngay; xoá prop chỉ bỏ prop đó, giữ 4 góc và chủ thể. CSS dùng lại `.editor-art-slots` nên không thêm khai báo mới.
- **Lệnh đã chạy:** `npm run check` sạch (tsc + 52 tệp UI biên dịch được) · `check:renderer-globals` 1054 hàm / 8398 call site, 0 undefined · `node tests/run-unit.js` **98/98** (48,9 s) · `check:embedded` khớp **6162,6 KiB** · **build + app thật:** tạm bỏ `devPath` → `npm run build && npm run build:tauri && cargo tauri build` (exit 0, installer 15,66 MiB) → khôi phục **nguyên byte** (`5AE0BF64…13B20E`) · `ui-item-assets-editor-check` trên binary đó: **63/63**, blueprint sau lưu = `…"subIcons":[{"icon":"lightbulb","position":"top-left"}],"props":["apple","fish"]`.
- **Duyệt thị giác (mô hình nhìn ảnh):** preview có **chủ thể paw-print ở giữa**, `leaf` bên trái, `lightbulb` góc trên trái, **táo và cá ở hai góc dưới — nhỏ và mờ hơn rõ rệt**, **không che chủ thể**; các ô chọn hiển thị đúng “Lá cây / Bóng đèn / — trống — / — trống —” và “Quả táo / Cá”.
- **Chưa xác minh:** Chưa thử `props` trên **game đã lưu từ trước** (blueprint không có `props`) trong app thật — unit test đã phủ. Chưa chạy lại `ui-play-surface-check` (chỉ đổi editor). Chưa thử hai prop cùng một phía bị đổi thứ tự (engine gán trái trước, phải sau theo ý nghĩa).
- **Việc kế tiếp:** P1 `compare` (hai chủ thể + dấu so sánh) — hạng mục lớn tiếp theo; hoặc trả nợ `docs/STATUS.md` (nay **10** bàn giao, quy ước 3).

### 2026-11-15 — #258 cổng chống backtick + #259 `props[]` (vật thể ở mặt đất)
- **#258 — cổng mới `scripts/check-ui-test-syntax.js`:** biên dịch **thật** cả 52 tệp `tests/ui/*.js` bằng `vm.Script` (không chạy), nên mọi lỗi cú pháp bị bắt **trước khi mở app**. Khi lỗi, nó chỉ thẳng dòng có backtick trong chú thích — cái bẫy đã hỏng cổng UI **3 lần**. Nối vào `npm run check` (`tsc && check-ui-test-syntax`), thêm `npm run check:ui-tests`. **Đã chứng minh cổng không rỗng:** tạo tệp có backtick trong chú thích → `FAIL … missing ) after argument list` + `dong 5 co dau backtick…`, `exit=1`; xoá → 52 tệp sạch.
- **#259 — `props[]` trong blueprint:** tối đa **2** icon **đứng ở mặt đất** hai bên (40px, opacity 0.55, nằm trong lớp `props` để lớp `fg` phủ lên được). Cùng luật làm sạch như `subIcons`: loại id lạ, loại trùng chủ thể **và** trùng subIcons, cắt còn 2, **idempotent**. Prompt đã có `props` + luật “tối đa 2, khác mainIcon, khác mọi subIcons”; test tài liệu kiểm tiếp.
- **Files đã đổi:** mới `scripts/check-ui-test-syntax.js` · `package.json` (`check`, `check:ui-tests`) · `src/shared/scene-asset-catalog.ts` (`SCENE_MAX_PROPS = 2`) · `src/shared/scene-blueprint.ts` (`props?: string[]` + chuẩn hoá) · `src/shared/illustration-scene.ts` (`SCENE_GROUND_PROP_SIZE = 40`, `renderGroundProps`, tham số thứ 5 của `composeSceneSvg`) · `src/renderer/features/game-illustration.ts` (mirror y hệt) · `tests/unit/scene-blueprint.test.ts` (+2 test: làm sạch và **toạ độ**, thêm ca `props` vào parity/idempotent) · `tests/unit/scene-prompt-doc.test.ts` (+1 check) · `docs/AI_SCENE_DIRECTOR_DESIGN.md` (§5.2 luật 7 + kho từ vựng, §5.3) · `src-tauri/src/embedded/bundle.js` (sinh lại).
- **Đo được:** props ở `(12,146)` và `(268,146)`, hộp 40px — **không giao** hộp chủ thể (x 100–220, y 50–170), không tràn khung 320×200; blueprint **không có** props thì không sinh nhóm `ground-props`. 24 hash vàng **không đổi**.
- **Lệnh đã chạy:** `npm run check` sạch (tsc + 52 tệp UI biên dịch được) · `node tests/run-unit.js` **98/98** (48,5 s) · `check:renderer-globals` 1054 hàm / 8398 call site, 0 undefined · `check:embedded` khớp **6162,6 KiB**.
- **Chưa xác minh:** **Chưa có UI** cho `props` (như #256 trước #257: hiện chỉ JSON/AI đặt được), nên cũng **chưa có bằng chứng thị giác** cho 2 vật thể mặt đất trên app thật. Chưa build lại binary sau #259 (lần build gần nhất là của #257). Chưa thử `props` trên game đã lưu.
- **Việc kế tiếp:** UI 2 ô `props` trong khối “Vật thể phụ ở 4 góc” (đang có sẵn code đường dẫn), rồi build lại + chạy `check:item-assets-ui` trên binary mới; sau đó P1 `compare`. `docs/STATUS.md` nay có **9** bàn giao (quy ước 3).

### 2026-11-15 — #257 UI chọn 4 góc cho giáo viên (trước đó chỉ JSON/AI đặt được)
- **Trạng thái:** Trong editor minh hoạ, khi câu hỏi **đã có blueprint** (bấm “Cảnh thử”), xuất hiện khối **“Vật thể phụ ở 4 góc”** với 4 ô chọn: `Trái dưới` / `Phải dưới` / `Trái trên` / `Phải trên`. Mỗi ô chọn một trong **38 icon vẽ được**, có **tên tiếng Việt** (`flask-conical` → “Bình thí nghiệm”), hoặc “— trống —”. Chọn xong thì blueprint + preview + nút lưu đổi ngay, giáo viên không cần biết JSON.
- **Files đã đổi:** `src/renderer/features/editor/questions.ts` (`EDITOR_SCENE_ICON_LABEL` 38 tên, `EDITOR_SCENE_SLOTS`, khối `[data-editor-art-slots]`, `applyEditorSceneSlots`, wire `change` cho từng góc) · `src/renderer/styles/components.css` (khối `.editor-art-slots` 2 cột, 1 cột dưới 640px) · `tests/ui/ui-item-assets-editor-check.js` (**+12 check**) · `docs/AI_SCENE_DIRECTOR_DESIGN.md`, `docs/STATUS.md`, `docs/DECISIONS.md`.
- **Hành vi:** 4 góc ghi vào blueprint qua **cùng** `stageNormalizeBlueprint` như lúc tải game, nên id sai/trùng chủ thể bị loại ngay tại UI, không phải chờ đến lúc chơi. Để trống một góc thì **chỉ bỏ icon đó**, giữ chủ thể. Sửa cảnh thì **xoá ảnh chủ đề đang chọn** (vì ảnh chủ đề thắng blueprint) nhưng **không** xoá dấu “Bỏ ảnh” — đó là lựa chọn của giáo viên. Thêm 1 hàm renderer ⇒ `renderer-globals` 1053 hàm / 8385 call site, 0 undefined.
- **Lệnh đã chạy:** `npm run check` sạch · `node tests/run-unit.js` **98/98** (47,2 s) · `check:embedded` khớp **6162,0 KiB** · **build + app thật:** tạm bỏ `devPath` → `npm run build && npm run build:tauri && cargo tauri build` (exit 0, installer 15,66 MiB) → khôi phục **nguyên byte** (`SHA-256 5AE0BF64…13B20E`) · trên binary release qua CDP 9361: `ui-item-assets-editor-check` **54/54** (gồm 12 check mới; blueprint sau khi lưu: `subIcons:[{"icon":"lightbulb","position":"top-left"}]`) · duyệt thị giác bằng mô hình nhìn ảnh: khối 2×2 đúng, nhãn rõ, **không cắt chữ** (xem ảnh chụp nhất thời, đã xoá).
- **Chưa xác minh:** Chưa thử kéo-thả (chỉ dropdown); chưa có ảnh chụp **có icon ở góc** được người duyệt bằng mắt — mô hình xác nhận khối chọn và preview còn trống đúng như dữ liệu. Chưa chạy lại `ui-play-surface-check` sau khi thêm UI này (chỉ đổi editor). Chưa thử với game đã lưu từ trước (blueprint dạng chuỗi) trên app thật — unit test đã phủ.
- **Việc kế tiếp:** P-B2 `props[]` (vật thể ở mặt đất) hoặc P1 `compare`. Đáng làm sớm: một cổng quét `tests/ui/*.js` để bắt **dấu backtick trong chú thích** — đây là lần thứ **3** nó làm hỏng cổng UI (lỗi cú pháp ngay khi nạp tệp). `docs/STATUS.md` nay có **8** bàn giao (quy ước 3).

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
