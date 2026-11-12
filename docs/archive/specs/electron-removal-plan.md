# Kế hoạch loại bỏ Electron — trạng thái và phần còn lại

> Cập nhật sau khi đối chiếu mã nguồn và các cổng kiểm tra gần nhất. Đây không còn là kế hoạch "chưa thực hiện": lõi ứng dụng đã chuyển sang Tauri v2. Chỉ đánh dấu hoàn tất những gì đã có bằng chứng; không xem cổng build là nghiệm thu installer sạch.

## Mục tiêu

- Ứng dụng Windows chạy bằng Tauri v2, renderer TypeScript và backend Rust.
- Không còn Electron runtime, preload, IPC, dependency hoặc hướng dẫn Electron trong luồng sản phẩm đang hoạt động.
- Giữ nguyên SQLite, `.egame`, dữ liệu offline, gameplay ngoại tuyến và các tính năng Tauri đã port.
- Xóa/đánh dấu lịch sử Electron còn sót lại sau khi xác định không có người dùng hoặc kiểm thử nào phụ thuộc.

## Trạng thái theo giai đoạn

| Giai đoạn | Trạng thái | Bằng chứng / việc còn lại |
|---|---|---|
| 1. Backend Electron | Hoàn tất | `src/main.ts`, `src/preload.ts` và các handler IPC Electron đã được thay bằng Rust/Tauri. Storage, settings, AI local, setup, lesson, LAN và trình chiếu có implementation Rust tương ứng. |
| 2. Adapter renderer | Hoàn tất | Renderer dùng desktop façade và adapter Tauri; HTML trình chiếu nạp adapter Tauri. Kiểm tra contract không còn channel chưa hỗ trợ trong bộ contract hiện hành. |
| 3. Dependency/build | Hoàn tất | Manifest và lockfile không còn Electron, electron-builder, electron-updater hay better-sqlite3; build frontend và release đi qua scripts Tauri. |
| 4. Tests và công cụ | Đang thực thi nhóm B/C | Đã xóa 14 file chết (5 `tests/legacy/`, 5 smoke bám hook `EDUGAME_AI_TEST_DIR` đã bị gỡ, 4 check `*-packaged-*` drives electron-updater/app.asar); viết lại `launch-app.ps1` mở binary Tauri qua `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` — `launch:ui` còn dùng được. Sau batch 2 (tiếp 7): 48/48 check ui cần port đã port, 0 lời gọi payload `window.eduGame` trong `tests/ui`; còn 15 smoke + 4 script manual + nhóm D cần map/retire theo bảng bên dưới. |
| 5. Tài liệu và phát hành | Đang hoàn tất | README, Architecture, Project Map và Agent Handoff đã được cập nhật theo Tauri. Tiếp tục tìm các chỉ dẫn Electron còn lại ở docs hiện hành; giữ mô tả Electron chỉ trong lịch sử/migration. Chưa nghiệm thu bộ cài trên máy Windows sạch. |

## Các thay đổi đã hoàn tất trong lần tiếp tục gần nhất

- Sửa Rust storage test để không tham chiếu `src/main.ts` đã xóa.
- Chuyển trang trình chiếu sang adapter Tauri; Rust quản lý cửa sổ phụ và chọn màn hình.
- Sửa build frontend lấy channel từ `desktop-facade-schema.ts`, thay vì JSON contract Electron đã xóa.
- Cập nhật test renderer, asset, façade và runner để phản ánh Tauri; loại test lesson-store Electron cũ vì storage thuộc Rust.
- Đồng bộ `package-lock.json`; tái tạo embedded JavaScript bundle.
- Cập nhật tài liệu kiến trúc, bản đồ file, README, handoff và kế hoạch này.

## Kế hoạch dọn file còn lại

> Phạm vi lượt này là lập kế hoạch, chưa xóa file. Mọi mục bên dưới cần đối chiếu `git status`, caller/reference và các gate trước khi thực hiện. Không gom xóa theo tên có chữ `electron`: một số file đó là bộ nhập profile cũ hoặc dữ liệu kiểm thử cần bảo toàn.

### A. Đã bị loại khỏi worktree — không làm lại

Các file sau đang được xóa/đã xóa trong thay đổi migration hiện tại; khi thực thi kế hoạch, xác nhận trạng thái rồi bỏ qua nếu đã vắng mặt:

- Electron host/bridge: `src/main.ts`, `src/preload.ts`, `src/renderer/core/desktop-adapter-electron.ts`.
- IPC/update/window Electron: `src/about/about-ipc.ts`, `src/lan/lan-ipc.ts`, `src/presentation/presentation-ipc.ts`, `src/presentation/presentation-preload.js`, `src/presentation/presentation-manager.ts`, `src/presentation/display-manager.ts`, `src/services/update/update-electron-adapter.ts`.
- Contract/build Electron: `src/shared/desktop-contract.json`, `scripts/build-desktop-contract.js`, `scripts/dev.js`, `scripts/measure-boot.js`, `scripts/measure-idle-poll.js`.
- Test Electron-only: `tests/manual/run-electron-node.js`, `tests/unit/boot-lazy-requires.test.ts`, `tests/unit/desktop-contract.test.ts`, `tests/unit/lesson-store.test.ts`, `tests/unit/renderer-facade-only.test.ts`, `tests/unit/runtime-backend-choice.test.ts`.

Không khôi phục những file này trong quá trình dọn. Các phần thay thế hiện hành gồm Rust/Tauri, `desktop-facade-schema.ts`, `tests/unit/tauri-contract.test.ts` và test Rust storage.

### B. Ưu tiên dọn — phụ thuộc Electron rõ ràng

| File hiện còn | Kế hoạch | Điều kiện trước khi xóa |
|---|---|---|
| `tests/ui/launch-app.ps1` | **ĐÃ THỰC HIỆN 2026-11-11 — không xóa mà viết lại**: mở `src-tauri/target/release/edugame-studio-tauri.exe` với `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=<port>` + `WEBVIEW2_USER_DATA_FOLDER`, chờ đúng trang `tauri.localhost` trong `/json/list` (cổng mở sớm với `about:blank` — cùng bẫy cổng gate ghi nhận). `launch:ui` giữ nguyên và dùng được. | Đã chứng minh: CDP lên sau 1 s; `ui-chrome-icons-check.js` kết nối và chạy 6 kiểm (3 PASS / 3 FAIL — 3 FAIL là việc PORT giả định preload/data cũ, không phải launcher). |
| `tests/ui/packaged-feed-check.js`, `tests/ui/packaged-install-check.js` | **ĐÃ THỰC HIỆN 2026-11-11 — xóa cùng `grading-packaged-check.js` và `offline-packaged-check.js`** (bốn file đều drive `release\win-unpacked\EduGame Studio.exe` / electron-updater / app.asar — các mục tiêu không còn tồn tại; git history giữ lại toàn bộ). | Tiêu chí còn giá trị (feed, checksum, install/update) đã chép vào mục "Update / install path" của `tests/README.md` và Giai đoạn 6 mục 5 của kế hoạch di trú. Offline play nay do `tauri:check` pha một + hai bảo đảm. |
| `tests/packaging/p7-offline-install.ps1`, `tests/packaging/P7-OFFLINE-INSTALL.md` | **SỬA KẾ HOẠCH — không thay bằng checklist mới:** script chỉ ASCII và installer-agnostic (nhận `-Installer`/`-AppExe` tham số, không API Electron nào); đã đổi ví dụ + đường mặc định sang `EduGame Studio (Tauri)_0.5.1_x64-setup.exe` / `edugame-studio-tauri.exe` và md điểm danh số 0.5.1 (16.403.858 B, SHA-256 `7AE04626…FD6E`). P7 **vẫn MỞ** cho tới khi có số máy sạch thật. | Bốn câu hỏi thật (máy sạch, SmartScreen, AV, offline) giữ nguyên giá trị; phần biện minh electron-updater viết lại theo cổng Tauri hiện hành. |

### C. Rà soát rồi mới quyết định — CDP/UI tests và smoke lịch sử

1. **`tests/smoke/smoke56.js`–`smoke81.js` (các số hiện có):** lập bảng mỗi test kiểm tra hành vi nào, cách khởi chạy, fixture nào dùng, và có test Tauri tương đương chưa. Chuyển yêu cầu còn giá trị sang `tests/ui/tauri-webview-check.js` hoặc một gate Tauri riêng; sau đó xóa các smoke Electron trùng lặp. Chỉ giữ trong `tests/legacy/` khi có giá trị tra cứu rõ ràng, không giữ nguyên một bộ không chạy được.
2. **`tests/ui/grading-packaged-check.js`, `tests/ui/offline-packaged-check.js` và các `tests/ui/ui-*.js`:** phân biệt kiểm tra logic giao diện có thể chạy với Tauri WebView2 khỏi phần phụ thuộc `file://`, `app.asar`, preload hoặc Electron CDP. Port các kiểm tra gameplay/không mạng quan trọng; retire phần chỉ kiểm chứng cấu trúc Electron.
3. **`tests/manual/`:** xét từng runner, không xóa cả thư mục. Ưu tiên rà `persistence71.js`, `real-ai-e2e.js`, `real-ai-status.js`, `install-local-model.js`, `lan-smoke.js`, `tiny-cdp.js` và `manual/lib/ui-check-lib.js`; giữ/port phép thử AI, persistence, LAN còn phù hợp, chỉ xóa harness Electron khi đã có phương án Tauri. Các benchmark/model scripts không phụ thuộc desktop tiếp tục được giữ.
4. **`tests/legacy/`:** xem `smoke-ui.js`, `smoke2.js`, `smoke60.js`, `smoke-p1.js`, `smoke-delete.js`. Xóa nếu không có giá trị ngoài git history; nếu giữ, README phải nói rõ chúng không được chạy bởi test suite và chỉ để tham khảo.
5. **Helper dùng chung:** chỉ xóa `tests/ui/lib/screenshot-capture.js` hoặc `tests/manual/lib/ui-check-lib.js` sau khi `rg` xác nhận không còn consumer cần giữ. Không xóa helper chỉ vì tên/thư mục có liên quan đến CDP.

### C1. Kết quả phân loại và hành động (2026-11-11)

Kiểm kê toàn bộ `tests/ui` (55 mục, gồm 4 packaged checks), `tests/smoke` (25),
`tests/manual` (24 gồm lib), `tests/legacy` (5), `tests/packaging` (2).

| Hành động | tests/ui | tests/smoke | tests/manual | tests/legacy | tests/packaging |
|---|---|---|---|---|---|
| **ĐÃ XÓA 2026-11-11 (14 tệp)** | 4 (`grading-/offline-packaged-check`, `packaged-feed/install-check` — drive `release\win-unpacked` + electron-updater đã bị gỡ) | 5 (`smoke64/65/67/76/77` — bám hook `EDUGAME_AI_TEST_DIR` không còn trong src) | 0 | 5 (header tự khai "RETIRED — do NOT run", zero caller) | 0 |
| **ĐÃ PORT 2026-11-11 (2 tệp)** | 1 (`launch-app.ps1` viết lại thành launcher Tauri — thay vì xóa như B1 từng dự kiến) | 0 | 0 | 0 | 1 (`P7-OFFLINE-INSTALL.md` neo lại số 0.5.1) |
| **PORT (còn lại)** | 0 (48/48 check đã port; `tauri-webview-check.js` + 2 helper KEEP) | 15 CDP-era cần map hành vi vào Rust/Tauri gate trước khi xóa | 4 (`install-local-model`, `real-ai-e2e`, `real-ai-status`, `scene-preview`) | 0 | ps1 P7 giữ, chờ số máy sạch |
| **KEEP-AS-IS** | `tauri-webview-check.js`; `ui/lib/screenshot-capture.js` (6 consumer, 5 đang KEEP/PORT); `manual/lib/ui-check-lib.js` | 5 còn lại chờ rà | ~14 (benchmarks/probes/`lan-smoke`/`lan-qr-verify`/`tiny-cdp`/`verify-css`; 6 script tailieu fail-ENOENT **giữ theo chính sách** §`tests/tailieu` README) | — | — |

Sau batch 2 (tiếp 7, 2026-11-12): 48/48 check ui cần port đã port (5 tệp ưu tiên C1, 3 LAN,
4 paging, 15 payload cuối); 0 lời gọi payload `window.eduGame` trong `tests/ui`. Còn 15 smoke,
4 script manual và nhóm D. `tests/manual/lan-smoke.js` thực chất bám server Node
`src/lan/lan-server.ts` cũ (`express`/`socket.io`) nên không còn là KEEP-AS-IS: xếp vào nhóm D,
map sang hành vi Rust hoặc retire trước khi bỏ dependency.

Quy tắc cứng rút ra: **không bao giờ xóa `tests/manual/lib/ui-check-lib.js`** (`tauri-webview-check.js`
require nó qua `connect()` đã nhận `http://tauri.localhost/`).

Năm phép kiểm **không được xóa trước khi có bản port** (hành vi còn giá trị, chi phí dựng lại cao):
`ui-lesson-chat-check.js` (luồng chat giáo án #182–184 end-to-end, ~1.400 dòng),
`ui-typography-readability-check.js` (sàn accessibility #181), `ui-input-routing-check.js` (dán ngân
hàng câu hỏi bỏ qua AI, §3 nhánh B), `ui-presentation-check.js` (cửa sổ máy chiếu — phải viết lại
theo mô hình cửa sổ Tauri của 39f38db), `ui-draft-guard-check.js` (chốt "giáo viên không mất dữ liệu";
hook `will-prevent-unload` Electron không còn tương đương trực tiếp).

Cổng cho từng lượt PORT: chạy launcher mới trên cổng tự chọn → chạy phép kiểm → nếu FAIL thì xác định
đó là giả định preload/data cũ hay hồi quy thật của Tauri, rồi sửa check hoặc mở issue.

### C2. Batch 1 (2026-11-11) — 21 phép kiểm ui KHÔNG có payload `window.eduGame` (chỉ cần launcher)

Chạy đủ 21/21 phép kiểm trên instance Tauri release qua launcher mới (`launch-app.ps1 -Port 9361`).
Kết quả và phân loại theo cổng C1:

| Phép kiểm | Kết quả | Phân loại / hành động |
|---|---|---|
| nav-hint, play-surface (774), game-background (42), stage-illustration (169), constellation (105), ai-status-bar, connection-mode (7), wizard-cancel-genre (8), three-game (19), three-game-4games (41), three-game-patterns (31), three-game-reactions (11), matching-finish (22), ai-provider-key | **PASS nguyên trạng** | Không sửa gì — launcher Tauri đủ. |
| ui-chrome-icons (17) | FAIL 3 → **17/17 sau sửa check** | Giả định cũ: release 0.4.2 (`2740fc2`, 2026-11-07) đã xóa nhóm "Thao tác nhanh" và nâng trần recent 3→5, check không cập nhật theo (mục ruỗng từ trước Tauri). Check mới còn phản-điều (assert `quick === 0`, label không còn "Thao tác nhanh") và đọc trần từ `SIDEBAR_RECENT_GAME_COUNT` thật. |
| ui-fullscreen (20) | FAIL do cổng cứng → **20/20** | `findTarget` nội bộ lọc `/index\.html/` (URL Electron) và bỏ qua argv/`CDP_PORT`; nay nhận cả `http://tauri.localhost/` như `ui-check-lib`, header đổi sang launcher. |
| ui-setup-progress, ui-setup-fullscreen | ECONNREFUSED → **PASS hết** | Cùng bệnh trên: hardcoded 9333, không nhận argv/`CDP_PORT`. Đã sửa + cập nhật header. |
| ui-wizard-structure (19) | Flake 1/3 lượt → **19/19 ×5** | Không phải Tauri: check chỉ chờ ĐÚNG một `requestAnimationFrame`, còn `step-structure.ts` restore focus ở frame thứ hai khi tick đi đường microtask — race vốn có, máy chậm hơn là đỏ. Check sửa thành chờ có trần (10 frame) cho đúng row được tick. |
| ui-ai-provider-settings, ui-ai-provider-wizard | FAIL 2–3 → **all passed trên binary mới** | Hai loại: (a) assert `desktop.info().adapter === 'electron'` — giả định vỏ cũ, nay chấp nhận `['electron','tauri']`; (b) **hồi quy THẬT của port Rust**: `provider_status()` trong `settings.rs` ghi note lỗi bằng mã trần `(AI_AUTH)` + ISO thô, còn nguyên bản `lastTestNote()` (ai-providers.ts) chiếu qua `ERROR_LABELS` ("API key không hợp lệ hoặc bị thu hồi") và `formatShortTime` giờ địa phương — giáo viên thấy mã máy thay vì câu giải thích. Đã sửa Rust (`chrono` đã có trong cây phụ thuộc), thêm 2 unit test Rust khóa hành vi; đo lại trên binary dựng lại: cả hai check xanh. |

Kết luận batch: 15/21 xanh nguyên trạng; 5/21 đỏ vì giả định cũ trong CHÍNH check (đã sửa check);
1/21 đỏ vì hồi quy thật trong Rust (đã sửa sản phẩm + test). Không có ô nào phải mở issue riêng.

Lưu ý vận hành rút ra khi đo: các check **chia sẻ một instance app**; check dựng wizard setup
(provider-settings/wizard) có thể để lại `state.page = 'home'` và làm đỏ ô "lands on the library"
của phép kiểm chạy sau — không phải hồi quy. Số chốt của mỗi check lấy từ lượt chạy trên instance
vừa khởi động lại; chạy lại `ui-chrome-icons-check` trên instance sạch: **17/17**.

### C3. Batch 2 (2026-11-12) — port payload `window.eduGame` sang façade `desktop.*`

Mở đầu bằng `ui-draft-guard-check.js` (một trong năm tệp "không được xóa trước khi có bản port").
Kết quả: **10/10 ×4 lượt liên tiếp** (một lượt profile mới + ba lượt profile ấm) trên binary release
qua `launch-app.ps1 -Port 9361`. Không đổi mã sản phẩm — chỉ chuyển chính check sang façade và
thay hook fixture Electron đã chết bằng cửa stub thiết kế của façade:

| Thay đổi trong check | Lý do |
|---|---|
| `window.eduGame.saveLessonDocument/saveLessonAnalysis/saveProjectDraft` → `desktop.call(...)` | Cầu preload Electron không còn; façade là đường duy nhất. |
| Thêm khối gạt setup onboarding (`closeSetupWizard('close')`) đầu phiên | Profile mới mở setup toàn màn hình đè shell; mọi check khác đều gạt. |
| Hook `EDUGAME_AI_TEST_DIR` (fixture AI trên đĩa) → `desktop.stub('generateLessonDraft', …)` trả bảng ghép cố định | Hook đĩa đã gỡ cùng Electron; `desktop.stub` là cửa designed cho UI check cần hình dạng dữ liệu thật mà không cần model (DECISIONS batch 2). |
| Chọn recommendation **bắt buộc** `matching`, bỏ fallback | Stub trả bảng ghép; recommender luật luôn liệt kê matching cho analysis này — fallback sẽ giấu lỗi thiếu matching. |
| Thêm khối dọn `deleteGame/deleteProject/deleteLessonDocument` cuối phiên | Electron chạy trong `EDUGAME_USER_DATA` riêng; Tauri dùng app-data chung nên check phải tự rút các dòng tổng hợp. |

Tệp thứ hai: `ui-lesson-chat-check.js` (luồng chat giáo án #182–184 end-to-end). Khác draft-guard,
check này KHÔNG dùng stub — nó lái vận chuyển cloud thật của Rust chống mock OpenAI loopback, nên
đo được cả đường ghi lịch sử. Lượt này tìm và sửa **1 hồi quy thật**: mọi lượt chat lưu mất
`providerId` vì `createClient` của V8 nhúng không trả provider và Rust không truyền `target.id`
(`lesson.rs` + `lesson-ops.ts`, thêm test hồi quy 3 ca). 5 FAIL còn lại là môi trường: modal mời
nhập dữ liệu Electron cũ đè `#modalRoot` chặn con trỏ thật (`Input.dispatchMouseEvent` hit-test
phần tử trên cùng), trong khi bước scripted bỏ qua hit-test nên draft-guard không thấy. Check gạt
overlay first-launch trước khối #250 và assert `#modalRoot` trống. Kết quả trên instance sạch:
**all checks passed** (`providerOfTurn=custom/[2,2]`, #250 xanh, dọn sạch cuối phiên).

Tệp thứ ba: `ui-typography-readability-check.js` (sàn accessibility #181 — census cỡ chữ +
tương phản 16 màn × 2 theme, kèm lượt `:hover`/`:focus` ép bằng `CSS.forcePseudoState`). Port
SẠCH: 22 lời gọi `window.eduGame.*` → `desktop.call(...)` theo đúng tên hợp đồng, không nới
ngưỡng 11px/4.5:1, không đổi sản phẩm. Check tự reload trang + đo computed-style (không dùng
con trỏ thật) nên không cần gạt overlay migration; không dùng stub mà seed 5 dòng tổng hợp thật
qua façade rồi tự dọn (purge prefix `typo-probe-` trước, CLEANUP sau lượt hover). Kết quả trên
instance sạch port 9362: **All typography checks passed** ngay lượt đầu (chạy lại vẫn xanh) —
1503 run/32 sweep (767 light/736 dark), nhỏ nhất 11px, tương phản xấu nhất 4.74:1 (0 dưới 4.5:1),
48 nhãn hover/focus xấu nhất 4.72:1, seeded 5 dọn sạch.

Tệp thứ tư: `ui-input-routing-check.js` (đường ngân hàng câu hỏi — luật bước 1 nhận diện câu hỏi
dán vào mà không gọi model, bỏ hẳn bước phân tích giáo án, tới trò chơi dùng được cục bộ). Port
máy móc payload `window.eduGame.*` → `desktop.call(...)` (classifyLessonInput/generateLessonDraft/
convertLessonDraft/deleteProject). **Điểm mạnh hơn bản Electron:** `contextBridge` từng đóng băng
`window.eduGame` nên monkey-patch spy không quan sát được lời gọi (`analyzeCalls===0` luôn đúng
rỗng); trên Tauri `desktop.stub` ghi đè thật nên 6 spy → stub đếm (reject nếu bị gọi) biến `===0`
thành bằng chứng THẬT. Bước 3c bỏ placeholder hardcode + comment contextBridge cũ, thay bằng stub
analyze thật (generate vẫn chạy thật — bộ phân phối cục bộ trả `source:'imported-questions'`, không
phải model). Thêm khối gạt setup onboarding chuẩn. Kết quả trên instance sạch port 9363:
**52/52 ngay lượt đầu** (chạy lại ấm vẫn 52/52) — `analyze 0` ở cả 5 khối, `convert 0 / generate 0`
khi chỉ đổi thể loại, bước 4 giữ 3 câu `source:'imported-questions'`, bước 5 treasure/matching từ
chối kèm lý do, race giữ 3 câu nguyên văn. Không đổi sản phẩm.

Tệp thứ năm: `ui-presentation-check.js` được viết lại để mở cửa sổ Tauri thật qua façade,
không điều hướng trang chính, không iframe/eval/preload giả. Giữ ma trận 5 loại nội dung ×
1920×1080/1366×768 và sàn chữ 20px; bổ sung snapshot khởi tạo không gửi bù, tái sử dụng cửa sổ,
loại revision cũ/sai phiên, reload tài liệu mới, Escape/nút thoát/stop từ cửa sổ chính.

Hai hồi quy thật được bài kiểm tra native phát hiện: (1) ACL chỉ cấp quyền cho `main`, khiến
`presentation` không nghe được sự kiện; thêm capability riêng chỉ `core:event:allow-listen` và
`core:event:allow-unlisten`. (2) Tauri cấp nonce cho CSS tĩnh nên style tạo động trong renderer
bị CSP từ chối; chuyển nguyên 147 dòng CSS sang head của HTML trình chiếu, không nới CSP.
Unit contract chốt cả hai ranh giới. Hai giả định sai trong check cũ cũng được sửa: fixture
Kho báu thiếu `mission.type:'question'` nên không có đáp án, và helper overlap không tìm `.prompt`.

Trạng thái xác minh trình chiếu: **93/93 ×2** trên hai instance mới, mỗi lượt data dir và
WebView2 profile riêng; đủ 10 ảnh, chữ nhỏ nhất 20px, không cắt/tràn/cuộn/chồng lấn, không lỗi
renderer hay CSP stylesheet. Năm tệp ưu tiên C1 đã hoàn tất; khoảng 15 check payload khác,
15 smoke và nhóm D vẫn còn. Màn hình phụ vật lý/rút cáp, installer/P7 và AI local chưa xác minh.
Khuôn `desktop.stub('generateLessonDraft')` vẫn dùng được cho các check còn lại cần bước sinh.

Ba tệp LAN còn payload — `ui-lan-wiring-check.js`, `ui-lan-card-start-check.js`,
`ui-lan-treasure-finish-check.js` — được port sang façade và WebSocket native. Server Rust
`src-tauri/src/lan.rs` chỉ nói RFC 6455 thô với frame `{ event, payload }`, không có Engine.IO
handshake, nên `socket.io-client` cũ không thể join phòng. Thêm helper
`tests/manual/lib/lan-phone.js` thay tầng điện thoại; giữ nguyên assertion bảo mật (phone không
nhận answer key) và luồng finish/podium. Kết quả trên instance mới: wiring **7/7** (9368),
card/start **12/12** (9366), treasure finish **5/5** (9367); cả ba cũng xanh trên instance ấm
9365. Không đổi sản phẩm. `tests/manual/lan-smoke.js` vẫn bám server Node
`src/lan/lan-server.ts` và `socket.io-client`; server đó không còn caller sản phẩm, nên phải
map/retire trước khi bỏ `express`/`socket.io` (nhóm D).

Bốn check paging — `ui-ai-tasks-paging-check.js`, `ui-library-paging-check.js`,
`ui-lessons-paging-check.js`, `ui-results-paging-check.js` — được port sang façade và thêm khối
gạt setup. Kết quả trên bốn instance mới: AI tasks **8/8** (9371), library **12/12** (9372),
lessons **10/10** (9373), results **12/12** (9374). Ở `ui-ai-tasks`, hồ sơ Tauri mới không có
dòng `ai_tasks` nào vì `ai_tasks::start_task` không có caller; check đo store thật trước
(total 0, offset 30 rỗng) rồi `desktop.stub('listAiTasks')` 30 dòng tổng hợp để đo phân trang
3 trang. Đây là **khoảng trống sản phẩm** cần nối writer AI task trước khi tuyên bố parity đầy
đủ. Test Rust `ai_tasks_save_list_and_prune` được mở rộng: lưu 31 dòng, xác nhận chỉ giữ 30 và
xóa dòng cũ nhất. Còn khoảng 15 check payload và 15 smoke.

### D. Soát mã TypeScript cũ — không phải đợt xóa hàng loạt

- `src/ai-core/unload-guard.ts` là ứng viên Electron-specific cần xác định behavior đóng cửa sổ nào còn được Tauri/Rust xử lý; hiện có `tests/unit/unload-guard.test.ts`, nên quyết định phải bao gồm cả test và luồng đóng cửa sổ.
- `src/ai-core/setup-ipc.ts` hiện còn channel names/helpers được renderer hoặc unit tests tham chiếu; xác định từng export. Chỉ xóa kiểu/hàm Electron đã chết; giữ hoặc chuyển helper thuần TypeScript đang được dùng.
- Không xóa `src/ai-core/` chỉ vì runtime AI đã chuyển sang Rust. Một số module là nguồn cho unit tests/catalog/validation; trước tiên lập dependency graph và xác minh nội dung nào còn được bundle, renderer hoặc test sử dụng.
- Kiểm tra `build/installer.nsh`, `vendor/`, `src-tauri/tauri.conf.json` và các asset icon/installer trước khi dọn; giữ mọi tài nguyên Tauri/NSIS còn được cấu hình sử dụng.

### E. Tài liệu và dữ liệu cần giữ

- Cập nhật `docs/PROJECT_BRIEF.md` (phạm vi đầu tiên vẫn ghi Electron) và hướng dẫn `tests/README.md` thành Tauri-first; giữ lịch sử chuyển đổi ở `docs/handoff/` và kế hoạch này.
- Giữ Rust profile importer/migration, fixture tổng hợp và mô tả `Electron` trong ngữ cảnh nhập dữ liệu cũ. Không xóa profile người dùng, thư mục app-data, SQLite, ảnh, tài liệu hay model/runtime người dùng.
- Không xóa `dist/`, `node_modules/`, screenshots, fixtures hoặc output manual theo wildcard. Tách generated/cache artifacts khỏi file nguồn và chỉ dọn file xác định được nguồn sinh/caller.

## Trình tự thực thi và cổng dừng

1. **Chốt baseline:** lưu `git status`; chạy `rg` theo tên package/API và mọi caller của từng file. Tạo bảng file → consumer → thay thế → kiểm thử; không xóa file có consumer chưa hiểu.
2. **Gỡ runner Electron:** xóa/thay `launch-app.ps1` và `launch:ui`; retire packaged updater checks; thay P7 bằng tiêu chí installer Tauri trước khi bỏ tài liệu cũ.
3. **Giữ coverage, rồi dọn smoke/manual:** map hành vi mỗi smoke vào Rust/unit/Tauri WebView gate. Xóa trùng lặp; chuyển phần lịch sử hữu ích sang `tests/legacy/` chỉ khi xác định được người dùng và cập nhật README.
4. **Rà dead code nhỏ:** chỉ xử lý `unload-guard.ts`, `setup-ipc.ts` và helper tương tự sau khi xác nhận import/call sites; mỗi nhóm có test liên quan chạy đỏ trước/sạch sau nếu phù hợp.
5. **Tài liệu và final sweep:** cập nhật Project Brief, test README, Project Map, Status/handoff; phân loại mọi kết quả `rg -i electron` thành importer/migration, lịch sử, hoặc lỗi thời cần xử lý.
6. **Xác minh sau mỗi nhóm xóa:** `npm run check`, `npm test`, `cargo test --manifest-path src-tauri\Cargo.toml --lib -- --test-threads=1`, `npm run check:renderer-globals`, `npm run check:embedded`, `npm run tauri:check`, `git diff --check`. Chạy Windows clean-VM installer/offline acceptance trước khi tuyên bố xong.

**Cổng dừng:** nếu một file được gọi từ sản phẩm, test hiện hành, build Tauri hoặc migration dữ liệu người dùng, không xóa cho đến khi thay thế đã chạy qua kiểm thử. Không sửa/xóa các staged hoặc unstaged thay đổi khác chỉ để làm sạch diff.

## Cổng xác minh gần nhất

Các kết quả dưới đây là từ lần kiểm tra mã trước khi cập nhật tài liệu này:

```text
cargo test --manifest-path src-tauri\Cargo.toml --lib -- --test-threads=1
  153 passed, 0 failed

npm test
  95/95 suites passed

npm run check:renderer-globals
  passed; 73/75 scripts scanned, no undefined globals

npm run check:embedded
  passed; embedded bundle 6125.4 KiB

npm run tauri:check
  passed; release binary built; WebView2 checks 51/51,
  second phase 10/10, migration 12/12

npm run build:tauri
  passed; embedded bundle 6125.4 KiB, 203 frontend files

git diff --check
  passed
```

`npm test` in cảnh báo `EPERM` khi dọn `dist\server\index.js`; test/build vẫn hoàn tất thành công. Vì đây là artifact do build sinh ra, cần kiểm tra riêng trên máy sạch nếu cảnh báo tiếp tục. `npm run tauri:check` là cổng kiểm tra/build, không chứng minh installer đã cài đặt sạch trên máy chưa có môi trường phát triển.

**Lượt batch 2 (tiếp, 2026-11-12).** Các cổng chạy lại lượt này: `cargo test --lib` **153/153**, `npm test` **95/95**, `check:renderer-globals` 73/75, `check:embedded` khớp 6125.4 KiB, `git diff --check` sạch, và `ui-lesson-chat-check` **all checks passed** trên instance sạch (binary release dựng lại, nhúng bundle mới). `tauri:check`/`build:tauri` trong khối trên giữ kết quả lần chạy đầy đủ trước — frontend không đổi lượt này nên không chạy lại.

**Lượt batch 2 (tiếp 2, 2026-11-12).** Port `ui-typography-readability-check` — chỉ sửa check, không đổi sản phẩm. Cổng chạy lại: `npm run check` (tsc) sạch, `npm test` **95/95** (46,6 s), `node --check` tệp check OK, `git diff --check` sạch, và `ui-typography-readability-check` **All typography checks passed** trên instance Tauri sạch vừa khởi động (port 9362, data dir + profile tạm riêng, gate env) — 1503 run/32 sweep, nhỏ nhất 11px, xấu nhất 4.74:1, 48 hover/focus xấu nhất 4.72:1, seeded 5 dọn sạch. Rust không đổi nên không chạy lại `cargo test` (batch-2 tiếp chốt 153/153 trên cùng cây); `tauri:check`/`build:tauri` không chạy lại vì frontend không đổi.

**Lượt batch 2 (tiếp 3, 2026-11-12).** Port `ui-input-routing-check` — chỉ sửa check, không đổi sản phẩm. Cổng chạy lại: `npm run check` (tsc) sạch, `npm test` **95/95** (44,1 s), `npm run check:renderer-globals` 73/75 (0 undefined), `node --check` tệp check OK, `git diff --check` sạch, và `ui-input-routing-check` **52/52 ×2** trên instance Tauri sạch vừa khởi động (port 9363, data dir + profile tạm riêng, gate env; lượt 1 lạnh, lượt 2 ấm cùng instance). Rust không đổi nên không chạy lại `cargo test` (batch-2 tiếp chốt 153/153 trên cùng cây); `tauri:check`/`build:tauri` không chạy lại vì frontend không đổi.

**Lượt batch 2 (tiếp 4, 2026-11-12).** Viết lại `ui-presentation-check` cho cửa sổ Tauri thật; sửa capability event tối thiểu và CSS tĩnh nhận nonce CSP. `node tests/ui/ui-presentation-check.js 9364` **93/93 ×2** trên hai instance mới, data/profile riêng; 5 loại × 2 viewport, nhỏ nhất 20px, không lỗi renderer/CSP stylesheet. `node --check tests/ui/ui-presentation-check.js` và `node --import tsx tests/unit/tauri-contract.test.ts` qua; `npm test` **95/95** (50,8 s), `npm run build:tauri` 203 tệp, `npm run check` sạch, `npm run check:renderer-globals` 73/75 (0 undefined), `npm run check:embedded` khớp 6125,4 KiB, `cargo test --manifest-path src-tauri/Cargo.toml --lib -- --test-threads=1` **153/153**, `npm run tauri:check` **51/51 + 10/10 mở lại + 12/12 migration** (release 56,49 MiB), `git diff --check` sạch. Màn hình phụ vật lý/rút cáp, installer/P7 và AI local thật chưa xác minh.

**Lượt batch 2 (tiếp 5, 2026-11-12).** Port ba check LAN sang façade và WebSocket native. Phát hiện server Rust chỉ nói RFC 6455 thô (`{event,payload}`), nên `socket.io-client` cũ không thể join; thêm `tests/manual/lib/lan-phone.js`. `node tests/ui/ui-lan-wiring-check.js 9368` **7/7**, `node tests/ui/ui-lan-card-start-check.js 9366` **12/12**, `node tests/ui/ui-lan-treasure-finish-check.js 9367` **5/5** — mỗi lượt trên instance mới (data dir + WebView2 profile tạm riêng, gate env); cả ba cũng xanh trên instance ấm 9365. `npm run check` sạch, `npm test` **95/95** (45,2 s), `check:renderer-globals` 73/75 (0 undefined), `check:embedded` khớp 6125,4 KiB, `cargo test --lib` **153/153**, `git diff --check` sạch. Còn ~19 check payload và 15 smoke; `tests/manual/lan-smoke.js` vẫn bám server Node/Express/Socket.IO cũ, phải map/retire trước khi bỏ dependency.

**Lượt batch 2 (tiếp 6, 2026-11-12).** Port bốn check paging sang façade và gạt setup; `ui-ai-tasks` thêm stub 30 dòng sau khi đo store thật vì `ai_tasks::start_task` chưa có caller (khoảng trống sản phẩm, không phải lỗi check). Chạy trên bốn instance mới: `ui-ai-tasks-paging-check.js 9371` **8/8**, `ui-library-paging-check.js 9372` **12/12**, `ui-lessons-paging-check.js 9373` **10/10**, `ui-results-paging-check.js 9374` **12/12**. Test Rust mở rộng `ai_tasks_save_list_and_prune` lưu 31 dòng và xác nhận prune còn 30; `cargo test --lib` **153/153**. `npm run check` sạch, `npm test` **95/95** (46,4 s), `check:renderer-globals` 73/75 (0 undefined), `check:embedded` 6125,4 KiB, `git diff --check` sạch. Còn khoảng 15 payload và 15 smoke.

**Lượt batch 2 (tiếp 7, 2026-11-12).** Port 15 check payload cuối sang façade; không đổi sản phẩm. Kết quả trên 15 instance mới (data dir + WebView2 profile riêng): `ui-fullscreen-density` **8/8**, `ui-settings-sections` all passed, `ui-classifier-outline` **15/15**, `ui-race-treasure` **18/18**, `ui-game-worlds` **52/52**, `ui-item-assets-editor` **29/29**, `ui-race-editor` all passed, `ui-card-menu` all passed, `ui-art-upload-flow` all passed, `ui-item-art` all passed, `ui-editor-art` all passed, `ui-answer-mode` **219/219** (không gạt migration trước), `ui-dark-theme` all passed, `ui-play-mode-card` all passed, `ui-project-selection` all passed. Phát hiện ba khác biệt vỏ: URL ảnh Tauri `http://edugame-file.tauri.localhost/img/<id>`, câu classifier "Bộ đọc hiểu chưa sẵn sàng — phân loại bằng quy tắc.", và overlay migration mở muộn; check nhận cả hai biểu diễn. `ui-answer-mode` dùng `connect({ evalTimeoutMs: 300000 })` vì ma trận đầy đủ >120 s; mặc định helper vẫn 120 s. `npm run check` sạch, `npm test` **95/95**, `check:renderer-globals` 73/75 (0 undefined), `check:embedded` 6125,4 KiB, `node --check` các tệp sửa + `ui-check-lib` sạch, `git diff --check` chỉ CRLF. Rust không đổi nên không chạy lại `cargo test` (HEAD trước đó 153/153); không build lại release vì chỉ sửa test. **Không còn lời gọi payload `window.eduGame` trong `tests/ui`** (chỉ comment và phép đo phủ định có chủ đích). Còn 15 smoke, 4 script manual, nhóm D và writer `ai_tasks`.

## Việc còn lại — thứ tự đề xuất

1. Map 15 smoke sang hành vi trong gate Rust rồi rà consumer nhóm D (`unload-guard.ts`, `setup-ipc.ts`, `src/lan/lan-server.ts`, `tests/manual/lan-smoke.js`). Chỉ xóa hoặc chuyển vào `tests/legacy/` những smoke/packaging scripts không còn đường chạy sau khi có bằng chứng thay thế; giữ fixture hoặc hướng dẫn lịch sử có giá trị nhưng ghi rõ trạng thái.
2. Sửa các tham chiếu Electron còn sót trong README/active docs nếu tìm được; không xóa dữ liệu/profile Electron của người dùng.
3. Chạy lại `npm run check`, `npm test`, `npm run check:renderer-globals`, `npm run check:embedded`, Rust tests và `npm run tauri:check` sau mọi thay đổi mã.
4. Trên Windows sạch/VM: tạo installer, cài mới, khởi chạy, tạo/lưu/mở game, xuất/nhập `.egame`, kiểm tra trình chiếu và gameplay offline; sau đó kiểm tra nâng cấp và gỡ cài đặt không xóa profile người dùng.
5. Chỉ đánh dấu hoàn tất toàn bộ khi bước 1–4 có kết quả và handoff ghi rõ môi trường kiểm thử.

## Lưu ý bảo toàn

- Không xóa/migrate đè SQLite hiện có nếu chưa có backup và xác nhận luồng migration.
- Không xóa profile Electron cũ; wizard Tauri phải nhập có chủ đích và giữ nguyên nguồn.
- Không đưa Node.js vào renderer hoặc thực thi JavaScript/HTML sinh từ model.
- Không tuyên bố installer/upgrade/uninstall đã được kiểm chứng chỉ từ việc build release thành công.
