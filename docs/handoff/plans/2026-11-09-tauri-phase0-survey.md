# Giai đoạn 0 — Kiểm kê API desktop và đo baseline Electron

Ngày đo: 2026-11-09
Phiên bản đo: 0.5.1 (mã nguồn hiện tại, `npm start` = bản dev)
Trạng thái: **khảo sát, chưa sửa mã ứng dụng**
Liên quan: [2026-11-09-tauri-migration.md](2026-11-09-tauri-migration.md) mục 4 giai đoạn 0

Mọi con số dưới đây đọc từ mã nguồn hiện tại hoặc đo trên máy này (Windows,
Electron dev instance với profile tạm). Đây là bằng chứng cho kế hoạch Tauri,
không phải kết luận kiến trúc.

## 1. Bề mặt hợp đồng hiện tại

### 1.1 Kênh IPC

| Loại | Số | Nguồn |
|---|---|---|
| `ipcMain.handle` toàn bộ `src` | **82** | 61 `main.ts` + 7 about + 6 lan + 4 setup + 4 presentation |
| `ipcMain.on` (một chiều renderer → main) | **3** | `presentation-ipc.ts:167/176/195` (request-state, state-update, exit) |
| Sự kiện main → renderer (`ipcRenderer.on` trong preload) | **8** | about/state-push, ai/local-progress, lan/state, lesson/progress, presentation/exit, presentation/state-sync, setup/progress, window/fullscreen-changed |
| Handler có nhưng không expose | **1** | `ai:health` (`src/main.ts:3525`) — rác kỹ thuật, Tauri không cần chuyển |

Namespace của 61 handler trong `main.ts`: `lesson:` 23 · `ai:` 12 · `files:` 7 ·
`library:` 6 · `project:` 5 · `diagnostics:` 4 · `settings:` 2 · `window:` 1 ·
`app:` 1.

### 1.2 API renderer: `window.eduGame`

`src/preload.ts` expose **92 khoá**: 81 `ipcRenderer.invoke`, 3 `send`, 8 hàm
đăng ký sự kiện (mỗi hàm trả về unsubscribe). Renderer gọi **75** API trong **26
tệp**; 17 API không có điểm gọi tĩnh (xem 1.3).

Phân nhóm theo kế hoạch mục 4 giai đoạn 2:

| Nhóm | API | Điểm gọi renderer | Ghi chú |
|---|---|---|---|
| App info + cửa sổ | appInfo, setFullscreen, onFullscreenChanged | 5 | `appInfo` không dùng; About đọc `about:info` |
| Thư viện + giáo án + dự án | library 6, lesson-doc 5, project 5 | 30 | Nền dữ liệu, phải có ngay bản đầu |
| File + ảnh minh hoạ | 7 | 12 | Cần dialog native + protocol ảnh |
| Cài đặt + AI + tiến độ/huỷ | settings 2, ai 11, setup 5, lesson-AI 15 | 68 | Phần lớn là `lesson:*` AI |
| Chẩn đoán | 4 | 4 | Chỉ log + mở thư mục |
| Trình chiếu | 9 | 16 | Cửa sổ phụ + chọn màn hình |
| LAN | 7 | (qua alias `bridge.lan*`) | Xem 1.3 |
| Cập nhật (About) | 8 | (qua alias `api.about*`) | Xem 1.3 |

### 1.3 Bẫy của phép đếm tĩnh

`grep` chỉ bắt được `eduGame.<tên>`. Ba nhóm dùng alias nên lần đếm đầu báo
"sai" là không dùng:

- `src/renderer/features/about-panel.ts:278,319,342,381` → `const api = window.eduGame || {}` rồi `api.aboutInfo`, `api.aboutState`, `aboutCall('aboutCheck')` (chuỗi, không phải thuộc tính).
- `src/renderer/features/lan.ts:29` → `lanBridge()` trả về `bridge` rồi `bridge.lanStart`, `bridge.lanBegin`…
- `generateGame` là **hàm nội bộ** renderer (`src/renderer/features/game-generation.ts:5`), không phải `eduGame.generateGame`.

Vậy API thật không dùng: `appInfo`, `openAbout` (đã thay bằng tab Cài đặt
#204), `togglePresentation`.

Hệ quả cho kế hoạch Tauri: phép kiểm "renderer còn gọi Electron trực tiếp
không" phải quét cả alias, không chỉ `eduGame\.`. Giai đoạn 2 nên thay alias
bằng facade có kiểu, và cổng kiểm tra phải cấm `window.eduGame` ngoài một tệp
adapter duy nhất.

### 1.4 Mật độ gọi theo tệp (top 8)

`result-screen.ts` 20 · `core/controller.ts` 19 · `presentation.ts` 18 ·
`settings.ts` 16 · `wizard/state/actions.ts` 15 · `lesson-chat.ts` 10 ·
`wizard/step-generate.ts` 9 · `games/shell.ts` 9.

## 2. Phụ thuộc gắn Electron/Node

| Phụ thuộc | Dùng ở | Cần thay bằng (Tauri) | Rủi ro |
|---|---|---|---|
| `better-sqlite3` (native ABI) | `main.ts` (`Database`), `services/storage/lesson-store.ts` | Rust SQLite (rusqlite/sqlx) cùng schema | Cao: schema + migration phải khớp từng bảng |
| `safeStorage` (DPAPI) | `main.ts:3247–3849` | DPAPI qua crate `windows`/keyring | Cao: BYOK key không được lộ; có thể phải nhập lại |
| `dialog` (open/save/messageBox) | `main.ts` 6 chỗ | Tauri dialog plugin | Trung bình: chọn file đa định dạng, filter |
| `protocol.handle('edugame-file')` | `main.ts:822` | `asset`/custom protocol có kiểm id | Trung bình: chặn đọc ngoài thư mục ảnh |
| `shell.openPath` / `openExternal` | `main.ts`, `about-ipc.ts` | Tauri opener plugin | Thấp |
| `screen` + `BrowserWindow` phụ | `presentation/display-manager.ts`, `presentation-manager.ts` | Tauri `Monitor` + cửa sổ thứ hai | Cao: rút màn hình, fullscreen |
| `express` + `socket.io` LAN | `lan/lan-server.ts:162–205` | Rust HTTP/WebSocket hoặc sidecar | Cao: gần như viết lại |
| Process `llama-server.exe` | `ai-core/ai-manager.ts:205` (`spawn`) | Rust `std::process` + health/timeout | Cao: vòng đời process |
| `electron-updater` | `services/update/update-electron-adapter.ts:21` | Tauri updater (feed + chữ ký riêng) | Cao: đổi toàn bộ kênh phát hành |
| `mammoth`, `pdf-parse`, `jszip` | `main.ts` (DOCX/PDF/`.egame`) | Rust crates hoặc giữ JS | Trung bình: thư viện Rust chưa tương đương |
| `node:child_process`, `fs`, `crypto` | khắp main | Rust std/`reqwest`/`sha2` | Thấp–trung bình |

Tổng `require` Node ở main: `child_process` 1, `better-sqlite3` 1, `crypto` 2,
`fs`/`fs/promises` 3, `path` 1, `os` 1, `perf_hooks` 1, `module` 1.

## 3. Dữ liệu phải bảo toàn

Thư mục dữ liệu: `%APPDATA%/EduGame Studio/edugame-data` (profile Electron;
`appInfo().userDataPath`). Trong đó:

| Đường dẫn | Nội dung | Migration |
|---|---|---|
| `edugame.sqlite` | game, session, lesson, project, cache, chat | Copy + kiểm schema |
| `library.json` | DB legacy thời trước SQLite | Chỉ đọc khi chưa có `.sqlite` |
| `settings.json` | cài đặt + provider; key BYOK đã mã hoá qua `safeStorage` | Không copy dạng plaintext |
| `lessons/` | tệp giáo án đã lưu | Copy + đối chiếu id |
| `images/` | ảnh minh hoạ `<id>.img` | Copy + kiểm id hợp lệ |
| `logs/` | chẩn đoán (giữ 14 ngày) | Không cần chuyển |
| `ai-local/models/`, `ai-local/runtime/` | model + `llama-server` | Không copy mặc định |

Ngoài profile: installer + `latest.yml` cũ và chữ ký — kênh cập nhật riêng.

## 4. Baseline Electron 0.5.1 (máy này)

### 4.1 Kích thước

| Hạng mục | Kích thước |
|---|---|
| Installer NSIS `EduGame-Studio-Setup-0.5.1.exe` | **92.681.365 B (88,4 MiB)** |
| Installer 0.5.0 (để so) | 92.667.619 B (88,4 MiB) |
| `win-unpacked/` tổng | **332 MiB** |
| Trong đó `EduGame Studio.exe` (Electron runtime) | **180 MiB** |
| `resources/app.asar` | **50,8 MiB** (5.399 tệp) |
| `resources/app.asar.unpacked` | 12 MiB |
| `locales/` | 41 MiB |
| Mã nguồn ứng dụng shipped (`src/` → `dist/`) | ~3 MB TS → 9,7 MB `dist` (gồm 2 MB test) |
| `node_modules/` dev (không ship trọn) | 690 MB |

Kết luận cho bản Tauri đầu tiên: **91 % khối lượng installer là Electron/Chromium**,
không phải mã sản phẩm. Nếu Tauri + WebView2 đóng gói được app.asar tương đương
thì installer phải nhỏ hơn rõ rệt — đây là chỉ số đo được để biện minh cho việc
chuyển, không phải giả định.

### 4.2 Thời gian khởi động (3 lần chạy nguội, profile tạm mới mỗi lần)

| Phần đo | Lần 1 | Lần 2 | Lần 3 |
|---|---|---|---|
| Từ `spawn` đến renderer `readyState === 'complete'` | 1.939 ms | 2.131 ms | 1.684 ms |
| `app.boot.phases.totalMs` (main process) | 1.735 ms | 1.930 ms | 1.503 ms |
| `documentLoaded` (tải + chạy toàn bộ script renderer) | 715 ms | 796 ms | 635 ms |
| Giai đoạn đến WebView/Electron sẵn sàng (`processToMainModule`) | 222 ms | 295 ms | 233 ms |
| `vendors` + `localRequires` (require của main) | 504 ms | 536 ms | 382 ms |
| `windowCreated` | 116 ms | 135 ms | 105 ms |

Trung vị ~1,93 s từ spawn đến trang xong; ~1,73 s thuộc main nội bộ. Một lần
chạy có `EDUGAME_BOOT_TRACE=1` cho thấy require đắt nhất: `zod` 106 ms,
`mammoth` (`classic/external.cjs`) ~103 ms, `jszip` 65 ms, `lesson-store` 57 ms,
`lesson-cache` 57 ms. Đây là các khoản có thể hoãn hoặc chuyển sang Rust.

### 4.3 Khi nhàn rỗi (đo sau ~9 s kể từ lúc mở; cửa sổ 22,2 s)

| Chỉ số | Giá trị |
|---|---|
| Số tiến trình con | 4 |
| Working set tổng | **475 MiB** |
| Private bytes tổng | **294 MiB** |
| CPU nhàn rỗi | **1,41 % một nhân** |

Private lớn nhất: renderer 163,6 MiB, main 76,5 MiB, GPU 39,7 MiB.

### 4.4 Giới hạn của phép đo

- Máy này, một cấu hình; chưa chạy lại để có khoảng tin cậy.
- Đo bản dev (`electron .` trên `dist`), không đo bản cài NSIS — bản cài sẽ nhỏ
  hơn một chút ở phần truy cập đĩa nhưng cùng bậc.
- Chưa đo thời gian trò chơi 3D, mở trang Giáo án hay chạy AI local (nhánh AI
  local không chạy theo chỉ đạo; xem `docs/STATUS.md`).
- Chưa có số của Tauri để so — theo đúng kế hoạch, số Tauri chỉ có sau giai đoạn 1.

## 5. Phân loại tính năng theo bản Tauri đầu tiên

**Bắt buộc** (app không dùng được nếu thiếu): thư viện + phiên chơi, chơi game
lưu sẵn khi offline, game đã có trong SQLite, `.egame` xuất/nhập, import tài
liệu (DOCX/PDF/CSV), ảnh minh hoạ, cài đặt, chẩn đoán, migration profile.

**Có thể hoãn** (app vẫn chạy, thiếu một số màn hình): wizard tạo game bằng AI,
AI local + tải model, chat Giáo án, chẩn đoán xuất gói.

**Cần quyết định sản phẩm**: LAN Classroom Mode, Trình chiếu, tự động cập nhật,
BYOK key (nhập lại hay migrate).

Ba mục "cần quyết định" đều là phụ thuộc Electron sâu nhất (LAN server viết lại
gần như toàn bộ, trình chiếu phụ thuộc `screen`/cửa sổ phụ, updater phụ thuộc
kênh phát hành). Kế hoạch mục 7 đã nêu đúng; báo cáo này xác nhận không có mục
nào trong số đó "chỉ là cấu hình".

## 6. Việc kế tiếp đề nghị

1. Chốt bảy câu hỏi ở mục 7 của kế hoạch, trước hết: bản Tauri đầu tiên có LAN +
   trình chiếu + updater hay không (nếu có, estimate 6–10 tuần là dưới thực tế).
2. Khi có quyết định, dùng ma trận mục 1.2 làm danh sách kiểm cho facade
   giai đoạn 2; mỗi nhóm chuyển trong một lần và có test hợp đồng.
3. Chỉ đo Tauri sau khi dựng được vỏ tối thiểu (giai đoạn 1), cùng bộ công cụ
   `boot-baseline` để so trực tiếp.

## 7. Cách tái lập phép đo

- Boot: script Node spawn `node_modules/electron/dist/electron.exe .` với
  `EDUGAME_USER_DATA` trỏ thư mục tạm mới, `--remote-debugging-port` riêng, chờ
  CDP target rồi chờ `document.readyState === 'complete'`; đọc
  `edugame-data/logs/*` lấy dòng `app.boot.phases`.
- Require breakdown: chạy lại với `EDUGAME_BOOT_TRACE=1`.
- RAM/CPU: PowerShell `Get-Process` trên các `electron.exe` của instance tạm, lấy
  hiệu `TotalProcessorTime` qua cửa sổ nhàn rỗi 20 s.
- Kích thước: `ls -la` installer, `du` trên `win-unpacked`.
- Không sửa mã; không dùng profile của giáo viên.
