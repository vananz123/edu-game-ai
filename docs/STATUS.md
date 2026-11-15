# Trạng thái dự án

Bàn giao mới nhất nằm ngay trong file này (3 mục gần nhất). Các bàn giao cũ được lưu ở
`docs/handoff/status/` — mỗi ngày một file, nối thêm vào cuối file của ngày đó khi cần.
Quy ước: sau mỗi việc, chèn bàn giao mới ngay dưới tiêu đề "Bàn giao gần nhất"; nếu quá 3 mục,
chuyển mục cũ nhất vào file lưu trữ đúng ngày của nó và cập nhật mục lục.

## Mục lục bàn giao

### 2026-11-15 — #262 P1 `compare` bước 2: VẼ hai chủ thể + dấu (10 nền), test toạ độ hai hộp
- **Trạng thái:** `layout: 'compare'` giờ ra hình thật: hai chủ thể **92px** (`x 42…134` / `186…278`, hạ 12px), dấu so sánh **24px** ở giữa (`x 148…172`) vẽ bằng `<path>`/`<rect>` không dùng `<text>`, icon góc còn **2 ô trên** (40px, `y 6…46`), props mặt đất giữ nguyên. `left`/`right` bị **dời** lên trên, không bỏ.
- **Files đã đổi:** `src/shared/illustration-scene.ts` (5 hằng số compare + `renderCompareSign` + layer `sign`), `src/shared/scene-asset-catalog.ts` (`SCENE_COMPARE_SUB_ICON_POSITIONS`), `src/shared/scene-blueprint.ts` (dời góc theo layout), `src/renderer/features/game-illustration.ts` (bản sao vẽ + chuẩn hoá), `tests/unit/scene-blueprint.test.ts` (+5 check, trong đó 1 check parity vẽ), `docs/AI_SCENE_DIRECTOR_DESIGN.md` §3.3 (bảng hình học), `docs/DECISIONS.md` #262 bước 2.
- **Đo được:** `scene-blueprint` **24 → 29** check; test hình học đọc toạ độ **từ SVG** trên **cả 10 nền** (2 hộp chủ thể không giao, dấu giữa không chạm, icon góc không chạm cả hai chủ thể, props không chạm, không cắt). Kiểm ngược: `LIFT 12 → 0` ⇒ `plain: top-left covers the main subject`; trả lại ⇒ xanh.
- **Duyệt thị giác:** ảnh chụp `msedge --headless` (.tmp-shots/compare.png) — 3 thẻ compare (forest `>`, sea `=`, classroom `<`) hai chủ thể tách rời, dấu ở giữa; thẻ single vẫn một chủ thể.
- **Lệnh đã chạy:** `npm run check` sạch · `node tests/run-unit.js` **98/98** (49,2 s) · `check:renderer-globals` 0 undefined (1055 hàm / 8426 lời gọi) · `check:embedded` khớp **6163,8 KiB**.
- **Chưa xác minh:** chưa có UI editor cho `compare`; chưa chạy trên binary thật (ảnh duyệt là SVG dựng bằng engine).
- **Việc kế tiếp:** #262 **bước 3** — UI chọn 2 chủ thể + dấu trong editor, rồi cổng `check:item-assets-ui` trên binary thật.

### 2026-11-15 — #262 P1 `compare` bước 1: dữ liệu + chuẩn hoá (chưa vẽ)
- **Trạng thái:** Blueprint nhận `layout: 'compare'` với `compareIcon` (chủ thể phải) và `compareSign` (`greater-than`/`less-than`/`equal`). Thiếu/trùng chủ thể thứ hai → hạ về `single` (không `null`); dấu lạ → bỏ dấu; `single` mang trường compare → bị xoá.
- **Files đã đổi:** `src/shared/scene-asset-catalog.ts` (`SCENE_LAYOUT_IDS`, `SCENE_COMPARE_SIGNS`, 2 hàm kiểm), `src/shared/scene-blueprint.ts` (`compareIcon`/`compareSign`, luật hạ cấp), `src/renderer/features/game-illustration.ts` (bản sao y hệt), `tests/unit/scene-blueprint.test.ts` (+7 check, +5 input parity), `docs/AI_SCENE_DIRECTOR_DESIGN.md` (§3.3 mới + thứ tự bắt buộc).
- **Đo được:** `scene-blueprint` **17 → 24** check; blueprint compare "béo" nhất **324 byte** < 600.
- **Lệnh đã chạy:** `npm run check` sạch (tsc + 52 tệp UI) · `node tests/run-unit.js` **98/98** (46,2 s) · `check:renderer-globals` 0 undefined (1054 hàm / 8411 lời gọi) · `check:embedded` khớp **6163,8 KiB** (đã build lại).
- **Chưa xác minh:** **chưa có hình** cho `compare` — engine vẫn vẽ theo `mainIcon` nên ra ảnh một chủ thể; chưa có UI; chưa chạy trên binary thật.
- **Việc kế tiếp:** **bước 2** — vẽ hai chủ thể + dấu trên cả 10 nền, mở rộng test toạ độ cho **hai** hộp chủ thể (hiện chỉ một hộp `x 100–220, y 50–170`).

### 2026-11-15 — #260 UI cho `props`: 2 ô “Đất trái / Đất phải”, khép vòng #259
- **Trạng thái:** Khối minh hoạ trong editor có thêm hàng **“Vật thể đứng ở mặt đất”** với 2 ô `Đất trái` / `Đất phải`, cùng cơ chế ghi với 4 góc. Danh sách **loại sẵn** chủ thể và các icon đã dùng ở góc, vì normaliser sẽ bỏ chúng — thà không cho chọn còn hơn cho chọn rồi im lặng mất.
- **Files đã đổi:** `src/renderer/features/editor/questions.ts` (khối `[data-editor-art-props]`, `propsHtml`, `applyEditorSceneSlots` ghi cả `props`, wire `change`) · `tests/ui/ui-item-assets-editor-check.js` (**+9 check**) · `docs/STATUS.md`, `docs/DECISIONS.md`.
- **Hành vi:** Chọn prop → blueprint + preview + lần lưu đổi ngay; xoá prop chỉ bỏ prop đó, giữ 4 góc và chủ thể. CSS dùng lại `.editor-art-slots` nên không thêm khai báo mới.
- **Lệnh đã chạy:** `npm run check` sạch (tsc + 52 tệp UI biên dịch được) · `check:renderer-globals` 1054 hàm / 8398 call site, 0 undefined · `node tests/run-unit.js` **98/98** (48,9 s) · `check:embedded` khớp **6162,6 KiB** · **build + app thật:** tạm bỏ `devPath` → `npm run build && npm run build:tauri && cargo tauri build` (exit 0, installer 15,66 MiB) → khôi phục **nguyên byte** (`5AE0BF64…13B20E`) · `ui-item-assets-editor-check` trên binary đó: **63/63**, blueprint sau lưu = `…"subIcons":[{"icon":"lightbulb","position":"top-left"}],"props":["apple","fish"]`.
- **Duyệt thị giác (mô hình nhìn ảnh):** preview có **chủ thể paw-print ở giữa**, `leaf` bên trái, `lightbulb` góc trên trái, **táo và cá ở hai góc dưới — nhỏ và mờ hơn rõ rệt**, **không che chủ thể**; các ô chọn hiển thị đúng “Lá cây / Bóng đèn / — trống — / — trống —” và “Quả táo / Cá”.
- **Chưa xác minh:** Chưa thử `props` trên **game đã lưu từ trước** (blueprint không có `props`) trong app thật — unit test đã phủ. Chưa chạy lại `ui-play-surface-check` (chỉ đổi editor). Chưa thử hai prop cùng một phía bị đổi thứ tự (engine gán trái trước, phải sau theo ý nghĩa).
- **Việc kế tiếp:** P1 `compare` (hai chủ thể + dấu so sánh) — hạng mục lớn tiếp theo; hoặc trả nợ `docs/STATUS.md` (nay **10** bàn giao, quy ước 3).

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
