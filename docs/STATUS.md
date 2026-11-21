# Trạng thái dự án

Bàn giao mới nhất nằm ngay trong file này (3 mục gần nhất). Các bàn giao cũ được lưu ở
`docs/handoff/status/` — mỗi ngày một file, nối thêm vào cuối file của ngày đó khi cần.
Quy ước: sau mỗi việc, chèn bàn giao mới ngay dưới tiêu đề "Bàn giao gần nhất"; nếu quá 3 mục,
chuyển mục cũ nhất vào file lưu trữ đúng ngày của nó và cập nhật mục lục.

## Mục lục bàn giao

### 2026-11-16 — #283 script chạy "Gợi ý cảnh" với model thật (đang chờ khoá)
- Thêm `scripts/scene-suggest-live.js`: gọi **đúng prompt + đúng cổng kiểm** của app (`suggestSceneBlueprint`) với model thật, 6 câu hỏi nhắm 5 hình học (compare / process / surround / single / scenario + một ca science), in `source`, layout, id, `issues`, thời gian; `--png` render mỗi blueprint ra `.tmp-art/live-<n>.png` bằng engine thật.
- Khoá **chỉ đọc từ biến môi trường** (`GEMINI_API_KEY`, hoặc `SCENE_AI_KEY`; `SCENE_AI_BASE`/`SCENE_AI_MODEL` để đổi đích) — không ghi vào repo, không ghi `settings.json`. Không có khoá ⇒ thoát với lời nhắn, **không gọi mạng** (đã kiểm: exit 2).
- **Đang chặn:** máy này không có `GEMINI_API_KEY` trong môi trường, và profile thật `%APPDATA%/vn.edugame.studio.tauri/edugame-data/settings.json` có `ai.provider=local`, `ai.mode=online`, **không có blob khoá** ⇒ chưa chạy được lượt thật nào.
- **Chưa làm:** chưa có kết quả model thật cho `process`/`surround`; `compare` vẫn chưa thử trên câu `scenario`.

### 2026-11-16 — #282 cổng UI đo lại trên binary thật với Twemoji (790/790 · 179/179 · 157/157 · 42/42 · 55/55+10/10)
- Dựng binary v0.5.2 có Twemoji (`npm run build` + `build:tauri` + `cargo tauri build`, 5m00s, exe **56.61 MiB**) rồi chạy 5 cổng UI trên cửa sổ Tauri thật.
- **Cổng đỏ đã sửa đúng chỗ:** `ui-stage-illustration-check` đỏ 10 câu vì pin `iconClass.includes('lucide-paw-print')` — tức pin **nguồn vẽ** thay vì pin **id**. Thay bằng `carriesIcon(cls,id)` (nhận `lucide-<id>` hoặc `emoji-<id>`) và **thêm** `iconShapes > 0` (icon phải có hình thật, phép cũ không kiểm tra điều này). 169 → **179** phép đo: siết, không nới.
- **Kết quả:** play-surface **790/790** · stage-illustration **179/179** · item-assets **157/157** · game-background **42/42** · `build-tauri-release --check` **55/55 + 10/10**.
- **Bài học:** lần chạy release-gate đầu đỏ 3 câu ("không thấy shell", "tổng=1 script", "sidebar=0px") — **không phải hồi quy**, mà là lần mở đầu của exe 56.61 MiB trên profile WebView2 mới, cổng đo khi trang mới chạy xong `edugame-guard.js`. Profile ấm ⇒ xanh. Ghi vào DECISIONS #282.
- `src-tauri/tauri.conf.json` tháo dòng `devPath` để build rồi khôi phục **byte-exact** (SHA-256 `5ae0bf6…b20e`).
- **Chưa làm:** installer NSIS chưa dựng lại (setup.exe 0.5.2 vẫn là bản 16/11, trước Twemoji); chưa chạy `test:native` (lesson-store, cần Electron ABI).

### 2026-11-16 — #281 đổi tiếp sang Twemoji (giáo viên chọn trong 3 bộ dựng thử)
- Kích hoạt: #280 gắn Fluent Emoji, giáo viên xem ảnh nói "không, tìm thư viện mới đi". Lý do thật: Fluent **trộn nhiều cách vẽ trong một bộ**, nên 4 icon trong một khung đọc thành "4 mẩu clip art khác nhau".
- **Cách chọn:** dựng 3 bộ trên **cùng engine thật** (`renderBlueprintSvg`, cùng 4 layout + palette), xuất PNG, giáo viên chọn **số 1 = Twemoji** (CC BY 4.0, 54.5 KiB/41 icon). Loại Phosphor Duotone (vẫn là icon, nhạt ở 40px) và Phosphor Fill (khô).
- **Id không đổi** lần thứ hai: không sửa prompt, blueprint, `.egame` nào.
- **Sửa:** `scripts/fetch-emoji-art.js` viết lại cho Twemoji (`jdecked/twemoji`, `assets/svg/<codepoint>.svg`), 41 dòng id→codepoint; `docs/THIRD_PARTY_NOTICES.md` thay mục Fluent bằng Twemoji (CC BY 4.0 + nguyên văn); `renderIconSvg` chỉ đổi comment.
- **Bẫy đo được:** bản sinh đầu bọc `Object.freeze(EMOJI_ART)` ⇒ esbuild không tree-shake ⇒ 57 460 byte art nhúng vào **5 slot** bundle Rust, `check:embedded` **+287 KiB**. Bỏ freeze ⇒ về đúng **6285.1 KiB**. Bài học: hình dạng mã sinh quyết định kích thước tệp.
- **Đã chạy:** `npx tsc` sạch; `run-unit` **100/100**; `npm run check` sạch; `check:renderer-globals` 0 undefined; `check:scene-runtime` **142.6 KiB**; `check:embedded` **6285.1 KiB**; 24 hash vàng lấy lại lần 7; golden độ dài 4823→**4049**.
- **Test:** `asset-registry` thôi pin `viewBox="0 0 32 32"`, đọc viewBox từ chính art (Twemoji 36×36); test notices đòi đúng heading `## Twemoji` — đối chứng âm đổi heading ⇒ đỏ.
- **Chưa làm:** chưa chạy lại cổng UI trên binary Tauri; vision-model đang lỗi nên không có mô tả ảnh độc lập; **mới một người duyệt bằng mắt**.

### 2026-11-16 — #280 đổi thư viện ảnh: 41 icon cảnh dùng Microsoft Fluent Emoji (MIT)
- Kích hoạt: giáo viên — "có thể đổi thư viện khác, thư viện hiện tại không đủ đẹp" — sau khi #277/#278/#279 đã vét hết phần hình học/bảng màu.
- **Chọn Fluent Emoji (Flat)** vì MIT + art thiết kế cho 32px + **78 KB cho 41 icon**. Loại unDraw (cấm phân phối lại bộ, cấm tải tự động, hỏng dưới ~620px), OpenMoji (CC BY-SA), Twemoji (không có dải minh hoạ phẳng).
- **Id không đổi** — chỉ ảnh sau id đổi, nên prompt từ vựng, blueprint trong `.egame` cũ, `v:1` đều y nguyên, không migration.
- **Mới:** `scripts/fetch-emoji-art.js` (script bảo trì duy nhất dùng mạng, không nằm trong `npm run build`) → `src/shared/emoji-art.generated.ts` (78.4 KiB, 75 973 byte art); `docs/THIRD_PARTY_NOTICES.md` (MIT + ISC, kèm nguyên văn).
- **Sửa:** `shared/icon-registry.ts` rẽ hai nhánh (art màu với `stroke="none"` / Lucide như cũ); id SVG trong art được namespace `e-<icon>-<id>` để hai bản cùng icon trên một trang không mượn gradient của nhau.
- **Đã chạy:** `npx tsc` sạch; `run-unit` **100/100** (thêm `emoji-art.test.ts`); `npm run check` sạch; `check:renderer-globals` 1080 hàm/8600 call site, 0 undefined; `check:scene-runtime` khớp **163.1 KiB**; `check:embedded` **6285.1 KiB không đổi** (bundle Rust không vẽ minh hoạ); 24 hash vàng lấy lại lần 6; golden độ dài 2889→**4823**.
- **Đối chứng âm:** đổi khoá `apple` trong bản biên dịch ⇒ đỏ `EMOJI_ART and SCENE_ICON_IDS disagree`; khôi phục ⇒ xanh.
- **Chưa làm:** chưa chạy lại các cổng UI trên binary Tauri (mới render PNG thật cho cả 4 layout bằng Edge headless); vision-model gọi bộ icon là "clip art lệch phong cách" khi 4 icon cùng khung `surround`; **chưa ai duyệt bằng mắt người**.

### 2026-11-16 — #279 bỏ quầng `halo` + mặt đất cong + bóng nhẹ cuối nền
- Kích hoạt: #277/#278 soi PNG còn đúng hai lời phê — đĩa tròn nhạt `halo` sau lưng chủ thể, và dải đất cắt ngang thẳng cứng.
- **Đã làm** (`src/shared/illustration-scene.ts`): xoá hẳn lớp `halo` khỏi `SCENE_LAYER_ORDER` và composer (tách nền giờ do **màu** #266 + **bóng** #277 lo). Mặt đất thành đường cong `sceneGroundPath()` (không bao giờ xuống dưới `SCENE_HORIZON` nên `line` không hở khe trời). Thêm `sceneGroundShadePath()` ở `ink` **5%** cho 24px cuối. Bóng tiếp đất: `SCENE_SHADOW_WIDTH_RATIO` 0.34→**0.24**, opacity 0.10→**0.12** (0.34 ở máy chiếu là "vũng nước" 246px).
- **Đã chạy:** `npx tsc` sạch; `run-unit` **99/99**; `check:scene-runtime` khớp **85.3 KiB**; `check:embedded` khớp **6285.1 KiB**; `npm run check` sạch; 24 hash vàng lấy lại lần 5; golden độ dài 2827→**2889**.
- **Test mới `#279`:** không `data-scene-layer="halo"`; `far` phải có `<path d="M0 150 C`; **không** `<rect x="0" y="150"`; đúng **một** shade `0.05`.
- **Đối chứng âm:** trả lại `<rect>` thẳng ⇒ đỏ *"the ground plane is not a curve any more"*; khôi phục ⇒ xanh.
- **Còn hở:** vision-model vẫn thấy "đường đất gần ngang, chỉ mềm hơn" — giới hạn khung phẳng 320×200, muốn hết phải vẽ phối cảnh (việc khác). **Chưa ai duyệt bằng mắt người.**

### 2026-11-16 — #278 mỗi palette ba hue (ấm/lạnh) — cảnh hết đơn sắc
- Kích hoạt: giáo viên chọn hướng "bảng màu nhiều hue" sau khi #277 chỉ chữa được "lơ lửng"; vision-model vẫn gọi cảnh là "sticker" vì **một họ hue** + prop/góc ở 0.55 cùng màu ink.
- **Dữ liệu** (`src/shared/illustration-registry.ts`): `IllustrationPalette` thêm `warm`/`cool` (tuỳ chọn). 24 hàng viết tay từ ba họ: ấm amber `#d79a3c` / coral `#dd7a5b` / gold `#cfa63e`; lạnh slate `#6b7f99` / teal `#4a8b8a` / indigo `#5a63a8`. `DEFAULT_PALETTE` cũng có hai hue này.
- **Vẽ** (`src/shared/illustration-scene.ts`): mặt trời/books/flasks/ground props → `warm`; mây/núi/skyline/towers/sỏi/icon góc → `cool`. Opacity: ground props 0.55→**0.85**, icon góc 0.78→**0.9**, books 0.55→0.75, flasks 0.3→0.4, tools 0.45→0.55. Có fallback `palette.warm || palette.glow` nên palette cũ vẫn vẽ được.
- **Đo:** cảnh `meadow` dùng **7 hue** thay vì 1 (`#eaf7f0 #e2f3ea #d79a3c #4a8b8a #2e9e6b #d3ebdf #1c5f42`); vision-model: "cohesive pastel", icon nhỏ "visible, not washed out".
- **Đã chạy:** `npx tsc` sạch; `node tests/run-unit.js` **99/99**; `npm run check` sạch; `check:scene-runtime` khớp **85.1 KiB**; `check:embedded` khớp **6285.1 KiB**; 24 hash vàng lấy lại lần 4; `scene-blueprint` golden độ dài 2828→**2827** (sun opacity 0.16→0.2).
- **Đối chứng âm:** bỏ `warm` khỏi `animals` ⇒ đỏ đúng tên `animals has no warm` (sau khi rebuild bundle); khôi phục ⇒ xanh.
- **Còn hở:** quầng `halo` (đĩa nhạt r72) và dải đất cắt ngang ở `SCENE_HORIZON` — vision-model vẫn kêu; để thành **#279** vì đụng hình học đã chốt. **Chưa ai duyệt bằng mắt người.**

### 2026-11-16 — #277 bóng tiếp đất + lớp xa bớt nhạt (chữa "dán lên giấy")
- Kích hoạt: giáo viên gửi một hình tham chiếu tự vẽ và nói "ảnh vẫn rất chán". Đo hai bên: hình tham chiếu có **3 bóng đổ**, 6 hue, 4 lớp nền; cảnh của engine có **0 bóng**, **1 họ màu**, 3 lớp.
- **Đã làm** (`src/shared/illustration-scene.ts`): `groundShadow()` → một ellipse `data-scene-shadow="subject|prop|stage"` màu `ink` **10%**, rộng 34% hộp vật, dẹt 22%. Bóng chủ thể nằm ở lớp `mid` (dưới chủ thể); bóng prop/bậc quy trình nằm **trong nhóm của chính vật đó**, trước icon. `subIcons`/vòng `surround` **không** có bóng (chúng nổi ở góc, không đứng trên đất). Lớp xa: mây 0.08→0.12, đồi 0.14→0.20, núi 0.1→0.16, skyline 0.11→0.17.
- **Hằng số mới:** `SCENE_SHADOW_OPACITY`, `SCENE_SHADOW_WIDTH_RATIO`, `SCENE_SHADOW_HEIGHT_RATIO`, `SCENE_SURROUND_SUBJECT_TOP` (52 thay cho số literal).
- **Đã chạy:** `npx tsc` sạch; `node tests/run-unit.js` **99/99** (46.2 s); 24 hash vàng lấy lại có chủ ý; `npm run build:scene-runtime` → **83.7 KiB**; `npm run check:scene-runtime` khớp; `build-embedded-js` + `check:embedded` khớp **6285.1 KiB**; `npm run check` 52 tệp sạch.
- **Đối chứng âm:** bỏ `+ subjectShadows` khỏi lớp `mid` ⇒ đỏ (2728 vs 2828 + thiếu bóng); khôi phục byte-đúng ⇒ xanh.
- **Chưa xong phần "đẹp":** vision-model vẫn gọi cảnh là "sticker dán lên giấy" vì (1) **một họ màu**, (2) prop/góc ở opacity 0.55 cùng màu ink. Đó là #278 (bảng màu nhiều hue) — bóng chỉ chữa "lơ lửng". **Chưa ai duyệt bằng mắt người.**

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
