# Trạng thái dự án

Bàn giao mới nhất nằm ngay trong file này (3 mục gần nhất). Các bàn giao cũ được lưu ở
`docs/handoff/status/` — mỗi ngày một file, nối thêm vào cuối file của ngày đó khi cần.
Quy ước: sau mỗi việc, chèn bàn giao mới ngay dưới tiêu đề "Bàn giao gần nhất"; nếu quá 3 mục,
chuyển mục cũ nhất vào file lưu trữ đúng ngày của nó và cập nhật mục lục.

## Mục lục bàn giao

### 2026-11-15 — P1 `compare` chốt sổ: ROADMAP cập nhật + smoke-install bản 0.5.2 vào thư mục tạm
- **Trạng thái:** `docs/ROADMAP.md` ghi P1 **XONG cả 3 bước** (dữ liệu/hình/UI) kèm số đo, và mục "Còn mở" thêm hai nợ thật: `compare` chưa vào prompt §5, chưa thử trên câu `scenario`.
- **Smoke-install:** bộ cài NSIS `0.5.2` chạy `/S /D=D:\smoke262` → **exit 0**, có `edugame-studio-tauri.exe` + `uninstall.exe` + `vc-runtime`. Bản **đã cài** mở được CDP 9362 và render đúng mã mới: `layout=compare`, `Hình phải=fish`, `Dấu=greater-than`, `corners=2`, preview **2 chủ thể**. Gỡ bằng `uninstall.exe /S` → **exit 0**, thư mục sạch.
- **Học được:** lần chạy đầu `/S /D=` qua bash **treo 400 s** (không có output, `cmd //c` còn lỗi cú pháp vì tên tệp có ngoặc + khoảng trắng) — phải dùng `powershell Start-Process -Wait` thì mới thấy exit code.
- **Việc kế tiếp:** P3 bước prompt (`compare` vào §5 + `scene:suggest`).

### 2026-11-15 — #262 P1 `compare` bước 3: UI editor (Kiểu / Hình phải / Dấu), cổng thật 63 → 89/89
- **Trạng thái:** Khối minh hoạ có dòng **“Bố cục cảnh”**: `Kiểu` (Một hình / So sánh hai hình); khi so sánh hiện `Hình phải` + `Dấu` (Không dấu / Lớn hơn / Nhỏ hơn / Bằng). Ở `compare` chỉ còn **2 ô góc trên** (engine dời góc dưới lên), danh sách hình phải/props **loại sẵn** id sẽ bị normaliser bỏ. Đổi sang so sánh **tự chọn hình phải** đầu tiên chưa dùng để blueprint luôn hợp lệ; đổi về `Một hình` thì **xoá** hai trường và trả lại 4 góc.
- **Files đã đổi:** `src/renderer/features/editor/questions.ts` (`EDITOR_SCENE_SIGNS`, `EDITOR_SCENE_COMPARE_SLOTS`, khối `[data-editor-art-compare]`, writer + 3 listener), `tests/ui/ui-item-assets-editor-check.js` (+26 check), `docs/DECISIONS.md` #262 bước 3.
- **Đo được:** binary release thật, CDP 9361 — `check:item-assets-ui` **89/89** (trước 63/63). Blueprint sau lưu: `{"v":1,"layout":"compare",…,"compareIcon":"bird","compareSign":"greater-than","subIcons":[{"icon":"lightbulb","position":"top-left"}],"props":["apple","fish"]}`.
- **Duyệt thị giác (ảnh chụp từ app thật):** Kiểu = "So sánh hai hình" · Hình phải = "Cá" · Dấu = "Lớn hơn (>)"; preview có **hai hình lớn + dấu `>` ở giữa**, 2 icon góc, 2 vật thể dưới đất, không chồng, không cắt chữ.
- **Lệnh đã chạy:** `npm run build && npm run build:tauri && cargo tauri build` exit 0, installer **15,67 MiB**, `devPath` khôi phục nguyên byte (`5AE0BF64…13B20E`) · `npm run check` sạch · `node tests/run-unit.js` **98/98** (48,9 s) · `check:renderer-globals` 0 undefined (1055 hàm / 8426 lời gọi) · `check:embedded` khớp **6163,8 KiB**.
- **Chưa xác minh:** chưa thử `compare` trên câu `scenario` (bố cục tình huống #254); chưa đưa `compare` vào prompt §5 (có chủ ý).
- **Việc kế tiếp:** P3 bước prompt (`scene:suggest` + `compare` vào §5 + cổng chống trôi), hoặc P2 `process`/`surround`.

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
