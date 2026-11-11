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
| 4. Tests và công cụ | Đang thực thi nhóm B/C | Đã xóa 14 file chết (5 `tests/legacy/`, 5 smoke bám hook `EDUGAME_AI_TEST_DIR` đã bị gỡ, 4 check `*-packaged-*` drives electron-updater/app.asar); viết lại `launch-app.ps1` mở binary Tauri qua `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` — `launch:ui` còn dùng được. 20 smoke + ~50 ui check còn lại cần map/port theo bảng bên dưới. |
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
| **PORT (còn lại)** | ~48 phép kiểm: ~23 chỉ cần launcher mới; ~25 có payload gọi `window.eduGame` phải chuyển sang façade `desktop.*` | 15 CDP-era cần map hành vi vào Rust/Tauri gate trước khi xóa | 4 (`install-local-model`, `real-ai-e2e`, `real-ai-status`, `scene-preview`) | 0 | ps1 P7 giữ, chờ số máy sạch |
| **KEEP-AS-IS** | `tauri-webview-check.js`; `ui/lib/screenshot-capture.js` (6 consumer, 5 đang KEEP/PORT); `manual/lib/ui-check-lib.js` | 5 còn lại chờ rà | ~14 (benchmarks/probes/`lan-smoke`/`lan-qr-verify`/`tiny-cdp`/`verify-css`; 6 script tailieu fail-ENOENT **giữ theo chính sách** §`tests/tailieu` README) | — | — |

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
  151 passed, 0 failed

npm test
  95/95 suites passed

npm run check:renderer-globals
  passed; 73/75 scripts scanned, no undefined globals

npm run check:embedded
  passed; embedded bundle 6125.3 KiB

npm run tauri:check
  passed; release binary built; WebView2 checks 51/51,
  second phase 10/10, migration 12/12

npm run build:tauri
  passed; embedded bundle 6125.3 KiB, 203 frontend files

git diff --check
  passed
```

`npm test` in cảnh báo `EPERM` khi dọn `dist\server\index.js`; test/build vẫn hoàn tất thành công. Vì đây là artifact do build sinh ra, cần kiểm tra riêng trên máy sạch nếu cảnh báo tiếp tục. `npm run tauri:check` là cổng kiểm tra/build, không chứng minh installer đã cài đặt sạch trên máy chưa có môi trường phát triển.

## Việc còn lại — thứ tự đề xuất

1. Rà soát chính xác các file Electron còn sót bằng tìm kiếm source/docs và kiểm tra từng consumer. Xóa hoặc chuyển vào `tests/legacy/` những smoke/packaging scripts không còn đường chạy; giữ fixture hoặc hướng dẫn lịch sử có giá trị nhưng ghi rõ trạng thái.
2. Sửa các tham chiếu Electron còn sót trong README/active docs nếu tìm được; không xóa dữ liệu/profile Electron của người dùng.
3. Chạy lại `npm run check`, `npm test`, `npm run check:renderer-globals`, `npm run check:embedded`, Rust tests và `npm run tauri:check` sau mọi thay đổi mã.
4. Trên Windows sạch/VM: tạo installer, cài mới, khởi chạy, tạo/lưu/mở game, xuất/nhập `.egame`, kiểm tra trình chiếu và gameplay offline; sau đó kiểm tra nâng cấp và gỡ cài đặt không xóa profile người dùng.
5. Chỉ đánh dấu hoàn tất toàn bộ khi bước 1–4 có kết quả và handoff ghi rõ môi trường kiểm thử.

## Lưu ý bảo toàn

- Không xóa/migrate đè SQLite hiện có nếu chưa có backup và xác nhận luồng migration.
- Không xóa profile Electron cũ; wizard Tauri phải nhập có chủ đích và giữ nguyên nguồn.
- Không đưa Node.js vào renderer hoặc thực thi JavaScript/HTML sinh từ model.
- Không tuyên bố installer/upgrade/uninstall đã được kiểm chứng chỉ từ việc build release thành công.
