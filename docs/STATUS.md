# Trạng thái dự án

Bàn giao mới nhất nằm ngay trong file này (3 mục gần nhất). Các bàn giao cũ được lưu ở
`docs/handoff/status/` — mỗi ngày một file, nối thêm vào cuối file của ngày đó khi cần.
Quy ước: sau mỗi việc, chèn bàn giao mới ngay dưới tiêu đề "Bàn giao gần nhất"; nếu quá 3 mục,
chuyển mục cũ nhất vào file lưu trữ đúng ngày của nó và cập nhật mục lục.

## Mục lục bàn giao

### 2026-11-16 — #276 quyết định: wizard **không** tự gắn cảnh (giáo viên bấm trong trình soạn)
- **Không đổi mã.** Chốt hướng (c) trong ba hướng của #275: cảnh vẫn chỉ do giáo viên bấm "Gợi ý cảnh" trong trình soạn.
- **Lý do:** (a) gắn cảnh theo danh mục cho từng câu ⇒ mọi câu cùng chủ đề nhận cùng một khung, và **che mất** nút gợi ý thật (giáo viên tưởng thế là tốt nhất); (b) gọi model từng câu ⇒ thêm 1–3 s + phí cho một thứ không ảnh hưởng việc học, mà cảnh kém thì giáo viên vẫn phải sửa tay.
- **Giữ nguyên** cũng đúng nguyên tắc "gameplay không phụ thuộc AI": không có cảnh thì câu hỏi vẫn chơi được.
- **Đường lui đã ghi:** nếu giáo viên than phải bấm nhiều lần ⇒ làm **"gắn cảnh cho cả game"** trong trình soạn (một lượt model cho nhiều câu, có preview), không phải gắn mặc định trong wizard.
- **Đã đo:** chỉ tài liệu (`npm run check` 52 tệp sạch); không có mã nào thay đổi nên không chạy lại cổng UI.

### 2026-11-16 — #275 `lesson:patch-item-assets` nhận `sceneBlueprint` (+ sửa schema draft nuốt khoá này)
- **Vấn đề:** kênh ghi minh hoạ duy nhất của wizard allowlist đúng **ba khoá chuỗi**, nên cảnh không có đường đi qua wizard — giáo viên soạn bằng wizard không bao giờ có cảnh dù engine đã vẽ được 4 bố cục.
- **Sửa 1 (`src/shared/asset-validation.ts`):** `ITEM_ASSET_PATCH_KEYS` thêm `sceneBlueprint` — giá trị **object** duy nhất trong allowlist; cổng là `normalizeSceneBlueprint` (đúng cổng lưu + nhập `.egame`), thứ bị từ chối thì **xoá khoá** chứ không lưu rác; `null`/`''`/`v` sai đều là "xoá". Kết quả trả thêm `sceneBlueprint` **ngoài** `applied` (vì `applied` là hợp đồng chuỗi của đường lưu).
- **Sửa 2 (`src/services/lesson/lesson-contracts.ts`):** `parseGameDraft` **nuốt** khoá này — `itemAssetFieldsSchema` chỉ khai ba chuỗi nên zod strip trước khi adapter thấy. Sửa bằng **gom rồi gắn lại theo vị trí** (cơ chế `game-package.ts` dùng khi nhập `.egame`), **không** mở schema, vì cùng object đó mô tả thứ model phải trả lời: bảo model sinh blueprint là quyết định sản phẩm riêng, chưa đưa ra.
- **Đúng lớp lỗi #65** (schema matching strip khoá minh hoạ): test mới khẳng định blueprint phải sống qua `parseGameDraft` **và** tới `toEducationalGame`. Đối chứng âm: bỏ phần gắn lại ⇒ đỏ đúng `the scene survives the draft re-parse`; khôi phục ⇒ xanh.
- **Đã đo:** `run-unit` **99/99** (47,6 s) · `npm run check` 52 tệp sạch · `renderer-globals` 0 undefined (1077 hàm/8573 lời gọi) · `check:embedded` khớp **6285,1 KiB** · `check:scene-runtime` khớp 82,3 KiB · binary build lại · trên binary release (CDP 9376): `ui-item-assets-editor-check` **157/157** · `devPath` gỡ → build → khôi phục, SHA khớp ghim.
- **Còn hở, cố ý:** kênh đã nhận cảnh nhưng **chưa ai gửi** — model không sinh `sceneBlueprint`, và "Gợi ý cảnh" chỉ có trong trình soạn. Cần một quyết định sản phẩm (xem DECISIONS #275 cuối bài).
- **Chưa xác minh:** chưa có người duyệt bằng mắt · `process`/`surround` chưa do model thật chọn · chưa có GitHub release `v0.5.2` · P7 còn mở.
- **Việc kế tiếp:** chọn cách wizard gắn cảnh — (a) tự gắn **theo danh mục, offline** cho từng câu vừa sinh, (b) gọi model từng câu (token + chậm), (c) giữ nguyên như hiện nay.

### 2026-11-16 — #274 đo `.egame` thật trên bộ game lớn: **333,9 byte/câu** trên đĩa; cổng release 51 → 55/55
- **Số đo (binary release, 40 câu, xuất hai lần qua đúng cửa renderer):** không cảnh **17 507 byte** → có cảnh **30 839 byte (30,1 KiB)** ⇒ **333,9 byte/câu** trên đĩa cho một blueprint 109–163 byte gọn. Chênh lệch vì `writeGamePackage` ghi JSON **thụt lề 2 dấu cách**: object 134 byte gọn thành ~334 byte trên đĩa.
- **Hệ quả cho tài liệu:** con số "~120–180 byte/câu" trong `AI_SCENE_DIRECTOR_DESIGN.md` §1 đúng cho **JSON gọn** (thứ đi vào SQLite), **không** mô tả tệp `.egame`; đơn vị đúng cho một lời hứa về tệp là byte trên đĩa.
- **Cổng mới (4 check trong `tests/ui/tauri-webview-check.js`, 51 → 55/55, pha hai 10/10):** hai lượt xuất đều `{ok, path}` và cỡ phải tăng; blueprint phải **có thật trong tệp** (`"layout":"surround"`, `"around":[`, `"layout":"process"` sau khi bỏ khoảng trắng); một cảnh **>0 và <400** byte/câu; tệp **<64 KiB**.
- **Đối chứng âm:** cho `sizeRunner` không gắn blueprint ⇒ đỏ đúng 3 chỗ (hai lượt cùng cỡ `17510 → 17507`, tệp không có `around`, `0,0 byte/câu`); khôi phục byte-exact (`85f33c1a319f1680…`) ⇒ 55/55.
- **Ba lỗi trong chính cái cổng, lộ ra ở lượt chạy đầu và đã sửa:** (1) đọc tệp *sau* lượt xuất thứ hai nên bị ghi đè; (2) so `"around":[` trên tệp thụt lề (có dấu cách sau dấu hai chấm) nên luôn sai — giờ bỏ mọi khoảng trắng trước khi so; (3) ngân sách 200 byte lấy từ JSON gọn trong khi phép đo là byte trên đĩa ⇒ đỏ giả, ngân sách phải cùng đơn vị với phép đo.
- **Đã đo:** `node scripts/build-tauri-release.js --check` **55/55** + pha hai **10/10** (ba lượt: xanh → đỏ có chủ đích → xanh) · `npm run check` 52 tệp sạch · `devPath` gỡ → build → khôi phục, SHA-256 khớp ghim.
- **Chưa xác minh:** chưa có người duyệt bằng mắt cho màn chơi/các bố cục · `process`/`surround` vẫn chưa qua model thật · blueprint chưa đi qua đường wizard (`lesson:patch-item-assets` vẫn allowlist 3 khoá) · chưa có GitHub release `v0.5.2` · P7 (Windows sạch/SmartScreen/ký) còn mở.
- **Việc kế tiếp:** P4 còn hai mục — (a) ma trận duyệt thị giác từng bố cục (cần người), (b) mở `lesson:patch-item-assets` cho `sceneBlueprint` để wizard sinh được cảnh; hoặc P7.

### 2026-11-16 — #273 "`listAiTasks` trả rỗng" không phải bug: `history:false` là live-only — bản đầy đủ: [docs/handoff/status/2026-11-16.md](handoff/status/2026-11-16.md).
### 2026-11-16 — #272 xoá bản mirror trong renderer: scene code còn MỘT nguồn (esbuild bundle) — bản đầy đủ: [docs/handoff/status/2026-11-16.md](handoff/status/2026-11-16.md).
### 2026-11-16 — #271 "lỗi giật 2px" ở màn chơi: hoá ra là `:hover`, và cổng đo nhầm chỗ — bản đầy đủ: [docs/handoff/status/2026-11-16.md](handoff/status/2026-11-16.md).
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
