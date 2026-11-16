# Trạng thái dự án

Bàn giao mới nhất nằm ngay trong file này (3 mục gần nhất). Các bàn giao cũ được lưu ở
`docs/handoff/status/` — mỗi ngày một file, nối thêm vào cuối file của ngày đó khi cần.
Quy ước: sau mỗi việc, chèn bàn giao mới ngay dưới tiêu đề "Bàn giao gần nhất"; nếu quá 3 mục,
chuyển mục cũ nhất vào file lưu trữ đúng ngày của nó và cập nhật mục lục.

## Mục lục bàn giao

### 2026-11-16 — #273 "`listAiTasks` trả rỗng" không phải bug: `history:false` là live-only; gate tasks 8 → 12/12
- **Kết luận:** kênh đọc `ai:tasks` **đúng**. Đo trên binary release (provider HTTP loopback trả lời một `scene:suggest` thật): `{limit:10}` ⇒ `history` 1 hàng `scene/completed`; `{limit:10, history:true}` ⇒ 1 hàng; `{limit:10, history:false}` ⇒ `history []`, `total 0`. `history:false` là **live-only theo hợp đồng** (`src-tauri/src/ai_tasks.rs`), và đúng là payload `ai-status` poll mỗi 1,2 giây vì nó chỉ cần tác vụ đang chạy. Ghi chú "nghi lỗi kênh đọc" ở lượt trước là **hiểu sai payload**, không phải lỗi sản phẩm.
- **Không sửa một dòng sản phẩm nào.** Sửa chỗ *hiểu sai*: đầu tệp `tests/ui/ui-ai-tasks-paging-check.js` từng khẳng định "bản Tauri chưa có writer cho `ai_tasks` (`start_task` không có chỗ gọi)" — sai từ lâu (`scene.rs`, `lesson.rs` đều gọi `start_task`) và chính câu đó làm giả thuyết kia nghe hợp lý. Đầu tệp giờ nói đúng, và gate **tự chạy một lượt AI thật** qua provider loopback rồi kiểm: hàng `scene/completed` được ghi & đọc lại; `history:false` không trả hàng, `total 0`; tác vụ đã xong không còn trong `live`. **8 → 12/12.**
- **Đối chứng âm (2 lượt `cargo tauri build`):** bỏ rơi hàng trong `ai_task_list` ⇒ đỏ đúng 2 chỗ (`row: none`, `rows 0, total 3`); khôi phục byte-exact (`lesson_store.rs` SHA-256 `64079e3d57bd0393…`) ⇒ **12/12**, chạy hai lượt liên tiếp đều xanh.
- **Hai lỗi trong chính cái gate, do đối chứng âm lộ ra:** (1) lượt đỏ đầu chỉ đỏ 1 chỗ vì check "đọc lại được" đo `total` — `total` là `SELECT COUNT(*)`, một câu SQL khác câu lấy hàng, nên kênh đọc hỏng vẫn để `total` đúng; check giờ đòi **số hàng**. (2) `desktop.stub('listAiTasks', …)` của lượt trước còn sống trong trang, lượt sau đo qua stub (`history 5, total 30`); gate giờ `location.reload()` trước khi đo.
- **Đã đo:** `npm run check` 52 tệp sạch (gồm `check-ui-test-syntax`) · `devPath` gỡ → build → khôi phục, SHA-256 khớp ghim (`5ae0bf649cb60325…`) · gate tasks **12/12** trên CDP 9375, hai lượt liên tiếp.
- **Chưa xác minh:** chưa duyệt màn hình bằng mắt người · `process`/`surround` vẫn chưa chạy qua model thật (lượt này chỉ chạy `single` qua model loopback) · chưa có GitHub release `v0.5.2`.
- **Việc kế tiếp:** P4 — mở rộng `check:item-assets-ui` cho từng layout, hoặc P7 (máy Windows sạch/SmartScreen/ký), hoặc một lần chạy `surround`/`process` thật nếu có khoá.

### 2026-11-16 — #272 xoá bản mirror trong renderer: scene code còn MỘT nguồn (esbuild bundle) — unit 99/99, 4 cổng UI xanh
- **Trạng thái:** `src/renderer/features/game-illustration.ts` từ **864 → 193 dòng**. Nó không còn tự vẽ và tự chuẩn hoá; phần shared (catalogue + normaliser + hình học) được esbuild đóng thành `renderer/shared/scene-runtime.js` (IIFE, global `SceneRuntime`, 84,2 KiB) và nạp trước nó trong `index.html`. Món nợ "hai nguồn sự thật" của AI Scene Director đã đóng: layout mới giờ chỉ cần sửa **một** chỗ, và test parity chỉ còn canh *cách nối dây*, không canh hai bản vẽ.
- **Sửa:** `src/shared/scene-runtime.ts` (barrel re-export), `scripts/build-scene-runtime.js` (`--check` để bắt bundle cũ), `package.json` (`build:scene-runtime`, `check:scene-runtime`, gắn vào `npm run build`), `src/index.html` (thẻ script trước `game-illustration.js`), adapter giữ nguyên API cũ (`stageIllustrationHtml`, `resolveStageIllustration`, `stageNormalizeBlueprint`, `stageBlueprintForCategory`, `stageIsSceneIconId`) nên 6 chỗ gọi không phải sửa.
- **Cổng đổi chiều, không nới:** 4 test cũ so hai bản sao nay kiểm (a) renderer **không được** chứa lại bảng/hằng số hình học, (b) bundle phải xuất đúng palette + scene spec của cả 24 category và đúng `SCENE_ICON_IDS`, (c) mọi primitive được bảng scene gọi tên phải có painter, (d) sandbox nạp **đúng thứ tự index.html** và phủ **cả 41 icon**.
- **Đã đo:** `run-unit` **99/99** (47,6 s) · `npm run check` 52 tệp sạch · `renderer-globals` 0 undefined (1077 hàm / 8573 lời gọi, 73/75 script) · `check:scene-runtime` khớp **82,2 KiB** · `check:embedded` khớp **6213,9 KiB** · trên binary release (CDP 9371): `ui-play-surface-check` **790/790**, `ui-item-assets-editor-check` **157/157**, `ui-stage-illustration-check` **169/169**, `ui-game-background-check` **42/42** · installer build lại được · `devPath` gỡ → build → khôi phục, SHA-256 khớp ghim.
- **Đối chứng âm:** khi `dist/src/index.html` còn cũ, `renderer-load-order` đỏ đúng `ReferenceError: SceneRuntime is not defined` ⇒ adapter không có đường vòng tự vẽ, thứ tự nạp là ràng buộc thật.
- **Học được:** bản minify **không dùng được** với `check:renderer-globals` (cổng quét khai báo hàm theo dòng); muốn minify thì phải chuyển file vào `renderer/vendor/` để được bỏ qua — tức giả vờ nó là thư viện ngoài. Chọn giữ 84 KiB không minify (+54 KiB so với bản sao) để giữ cổng đó, vì cổng đó đã bắt được lỗi thật.
- **Chưa xác minh:** chưa duyệt màn chơi bằng mắt người ở lượt này · `process`/`surround` vẫn chưa chạy qua model thật · bảng `STAGE_ILLUSTRATION_CATEGORY_ICONS` (24 dòng, category → icon mặc định) vẫn là bản sao **có chủ ý** (dữ liệu mặc định, không phải hình học) và có test so với `getCategoryIcon()` · chưa có GitHub release `v0.5.2`.
- **Việc kế tiếp:** một lần chạy "Gợi ý cảnh" thật nếu có khoá; hoặc `listAiTasks` trả rỗng sau lượt chạy (lỗi kênh đọc, cần một lượt riêng); hoặc P7 (máy Windows sạch/SmartScreen/ký).

### 2026-11-16 — #271 "lỗi giật 2px" ở màn chơi: hoá ra là `:hover`, cổng đo sai chỗ — 787/788 → **790/790**
- **Trạng thái:** Nợ duy nhất của màn chơi đã đóng, và **không phải bằng cách sửa CSS**: bố cục chưa từng xê dịch. Ô đáp án đầu tiên bị con trỏ chuột còn đứng trên nó (từ bước bấm trước) nên được `:hover` nhấc lên đúng 2px; sau khi trả lời, ô `disabled` ⇒ hết khớp `:hover:not(:disabled)` ⇒ trở về chỗ cũ. Cổng đo "trước" trong lúc con trỏ đứng sai chỗ, nên báo một lỗi bố cục không tồn tại.
- **Sửa:** đặt con trỏ về góc (2,2) trước khi chụp "trước", giữ nguyên dung sai ±1px (không nới), và thêm một check dùng chuột THẬT để chốt hợp đồng "rê vào thì nhấc 2px, rời ra thì về chỗ cũ" — nếu ai đổi hiệu ứng hover sau này, cổng sẽ nói đúng câu đó.
- **Files:** `tests/ui/ui-play-surface-check.js` (+2 check), `docs/DECISIONS.md` #271, `docs/ROADMAP.md`, `docs/STATUS.md`. `src/renderer/styles/gameplay.css` chỉ bị chạm để thử đối chứng rồi **khôi phục byte-identical** (SHA-256 `82ed1f2de9766485…`), nên không nằm trong diff.
- **Đã đo:** `ui-play-surface-check` **790/790** trên binary release build lại (CDP 9370) · `run-unit` **99/99** (46,0 s) · `npm run check` 52 tệp sạch · `renderer-globals` 0 undefined · `check:embedded` khớp **6213,9 KiB** · `devPath` gỡ → build → khôi phục, SHA-256 khớp ghim.
- **Đối chứng âm:** đổi `translateY(-2px)` → `-3px` rồi build lại ⇒ đỏ đúng hai chỗ (`rest 510,53 -> hover 507,53`, `rest 456,72 -> hover 453,72`; 100/102 ở phần `play`); khôi phục `-2px` ⇒ xanh. Nhờ đó chứng minh con số 2px trong báo cáo cũ **chính là** độ nhấc hover.
- **Học được:** một cổng đo bố cục mà không kiểm soát con trỏ chuột thì đang đo cả trạng thái chuột — `Input.dispatchMouseEvent` về góc trước mỗi phép đo. Và đừng chữa check đỏ bằng cách nới dung sai: đọc `transform` tại hai thời điểm rẻ hơn nhiều so với đoán phần tử nào co lại.
- **Chưa xác minh:** chưa duyệt màn chơi bằng mắt người ở lượt này (chỉ số đo + ảnh do cổng tự chụp) · `process`/`surround` vẫn chưa chạy qua model thật · chưa có GitHub release `v0.5.2`.
- **Việc kế tiếp:** gộp bản mirror `game-illustration.ts` với `src/shared/*` bằng esbuild (món nợ kỹ thuật còn lại của AI Scene Director), hoặc một lần chạy "Gợi ý cảnh" thật nếu có khoá.

### 2026-11-16 — #270 `surround`: chủ thể ở giữa + tối đa 4 vật vây quanh (4/4 layout, P2 đóng) — bản đầy đủ: [docs/handoff/status/2026-11-16.md](handoff/status/2026-11-16.md).
### 2026-11-16 — #269 kênh AI nhận `process`: cổng assets 130 → 137/137 — bản đầy đủ: [docs/handoff/status/2026-11-16.md](handoff/status/2026-11-16.md).
### 2026-11-16 — #268 UI `process` trong trình soạn (Kiểu + Bậc 2/Bậc 3) — cổng assets 107 → 130/130 — bản đầy đủ: [docs/handoff/status/2026-11-16.md](handoff/status/2026-11-16.md).
### 2026-11-16 — #267 `process`: dải 2–3 bậc (dữ liệu + hình + prompt; UI CHƯA CÓ) — unit 99/99, scene-blueprint 39/39 — bản đầy đủ: [docs/handoff/status/2026-11-16.md](handoff/status/2026-11-16.md).
### 2026-11-15 — #266 màu cho cảnh + người trong cảnh (3 icon người, chủ thể dùng màu nhấn) — unit 99/99, assets 107/107 — bản đầy đủ: [docs/handoff/status/2026-11-15.md](handoff/status/2026-11-15.md).
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
