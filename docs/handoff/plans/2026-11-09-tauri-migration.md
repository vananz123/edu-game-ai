# Kế hoạch khảo sát và chuyển EduGame Studio từ Electron sang Tauri

Ngày lập: 2026-11-09; cập nhật trạng thái: 2026-11-11  
Trạng thái: **đã duyệt và đang triển khai** — giai đoạn 0–4 XONG, giai đoạn 5
xong bí mật (DPAPI + `settings:get/save`), AI local (tải runtime/model +
`llama-server` loopback), setup wizard (`setup:*`), **toàn bộ luồng giáo án**
(24 kênh `lesson:*` + `ai:cancel` gồm phân tích, sinh nội dung, chat) và
**nhóm kênh AI phụ trợ** (`ai:test-provider`, `ai:tasks`, `ai:runtime-verify`);
việc kế tiếp là các kênh còn lại (presentation, about, lan, hoặc `ai:generate`) —
`ai:generate` là kênh legacy không còn màn hình nào gọi (DECISIONS "Giai đoạn 5
(nhóm AI)").
Phạm vi: ứng dụng desktop Windows hiện tại, phiên bản nguồn 0.5.1, **bản Tauri
đầu tiên là bản thử giới hạn** (không có LAN, trình chiếu, updater; AI local đã
có phần cài/chạy, wizard lần đầu, phân tích giáo án, sinh nội dung trò chơi,
chat giáo án và probe/task manager/runtime-verify).

## 1. Mục tiêu

Chuyển vỏ desktop từ Electron sang Tauri v2, tái sử dụng tối đa giao diện và
nghiệp vụ TypeScript, đồng thời giữ các cam kết của sản phẩm:

- Game đã lưu, chấm điểm, lịch sử và gói `.egame` hoạt động khi offline.
- Không để renderer có quyền truy cập filesystem, SQLite hay tiến trình tùy ý.
- Bảo toàn dữ liệu Electron hiện có; không ghi đè hoặc xóa profile khi thử nghiệm.
- Giữ bản Electron hoạt động cho tới khi Tauri vượt qua các cổng nghiệm thu.
- Không viết lại giao diện hoặc game engine nếu chưa có lý do kỹ thuật.

Đây không chỉ là thay công cụ đóng gói. Electron hiện gom nhiều tích hợp desktop
vào `src/main.ts` và cung cấp cho renderer một API qua `src/preload.ts`; Tauri
cần thay thế cả hai bề mặt này.

> **Cập nhật 2026-11-09:** phần kiểm kê và baseline của giai đoạn 0 đã có số
> đo thật — xem [2026-11-09-tauri-phase0-survey.md](2026-11-09-tauri-phase0-survey.md)
> (82 handler, 92 khoá `window.eduGame`, 11 phụ thuộc gắn Electron/Node,
> installer 88,4 MiB, khởi động ~1,9 s, nhàn rỗi 294 MiB private / 1,41 % CPU).
> Ma trận và số đo ở đó thay cho các ước lượng trong tài liệu này.

## 2. Cơ sở khảo sát

- Dự án hiện là Electron + TypeScript, nhắm Windows; `package.json` đang ở
  phiên bản 0.5.1.
- Có khoảng 150 file TypeScript: renderer khoảng 64 file, services 38 file,
  game engine 4 file.
- Renderer là HTML/CSS và các script toàn cục có thứ tự nạp cố định; chưa dùng
  React hoặc ES modules cho renderer.
- `src/main.ts` khoảng 4.251 dòng và đăng ký khoảng 61 `ipcMain.handle`.
  `src/preload.ts` có khoảng 81 lời gọi `ipcRenderer.invoke`.
- `better-sqlite3`, Electron `safeStorage`, `electron-updater`, hộp thoại file,
  custom protocol, quản lý process AI, cửa sổ trình chiếu và server LAN đều gắn
  với Electron/Node.
- Repo chưa có `Cargo.toml` hay cấu hình Tauri; trên máy khảo sát không tìm thấy
  `cargo`, `rustc` hoặc `rustup`.
- Đây là ước lượng từ khảo sát cấu trúc, không thay thế kiểm kê API chi tiết,
  build thử hoặc đo kích thước/hiệu năng Tauri.

## 3. Kiến trúc đích đề xuất

```text
Renderer TypeScript/HTML hiện tại
        │
        ▼
EduGame desktop API (hợp đồng TypeScript ổn định)
        ├── Electron adapter — duy trì trong giai đoạn chuyển
        └── Tauri adapter — commands và events
                            │
                            ▼
                   Rust desktop services
                   ├── SQLite và file
                   ├── dialog, cửa sổ, màn hình
                   ├── AI runtime và tải model
                   ├── secrets, log, cập nhật
                   └── LAN server
```

Renderer gọi facade desktop API thay vì phụ thuộc trực tiếp vào `window.eduGame`.
Facade giữ giao diện hàm/kiểu dữ liệu đủ gần hiện trạng để chuyển theo từng nhóm.
Các lỗi native cần được trả về có cấu trúc và hiển thị rõ, không dùng kết quả
thành công giả hoặc fallback im lặng.

Tiếp tục dùng TypeScript cho logic nghiệp vụ thuần như game engine, kiểm tra và
chuẩn hóa dữ liệu, prompt và workflow. Dùng Rust cho thao tác cần quyền máy:
SQLite, file, dialog, secrets, process và tích hợp hệ điều hành. Không mặc định
đóng gói Node.js sidecar để tránh chuyển các trách nhiệm native; chỉ cân nhắc nếu
có yêu cầu tương thích cụ thể và đã đánh giá chi phí/bảo mật.

## 4. Lộ trình

### Giai đoạn 0 — Chốt phạm vi, dữ liệu và phương án quay lại

**Công việc**

1. Kiểm kê đầy đủ các API trong `preload.ts`, IPC được đăng ký tại `main.ts` và
   các module Electron riêng (`presentation`, `lan`, `about`, updater, setup).
2. Lập ma trận: API hiện tại, nơi UI gọi, dữ liệu đầu vào/đầu ra, quyền cần có,
   adapter Tauri dự kiến và test thay thế.
3. Phân loại tính năng thành: bắt buộc cho bản Tauri đầu tiên, có thể hoãn,
   hoặc cần quyết định sản phẩm.
4. Xác định đường dẫn profile Electron trên Windows, các file cần chuyển và
   chính sách backup/rollback. Dùng profile sao chép và dữ liệu tổng hợp.
5. Chốt xử lý khóa BYOK đã mã hóa, model/runtime lớn và khả năng cài song song.

**Đầu ra và cổng hoàn tất**

- Ma trận API/tính năng và danh sách dữ liệu cần bảo toàn.
- Kịch bản migration/rollback được duyệt trước khi đụng vào dữ liệu người dùng.
- Profile test tổng hợp, không chứa thông tin cá nhân của học sinh hoặc giáo viên.

### Giai đoạn 1 — Toolchain và vỏ Tauri tối thiểu

**Công việc**

1. Cài Rust toolchain và các thành phần build Windows cần thiết trên máy phát
   triển/CI; ghi lại phiên bản và cách tái tạo môi trường.
2. Thêm Tauri v2 trên nhánh thử nghiệm với application identifier, thư mục dữ
   liệu và đầu ra installer riêng với Electron.
3. Chạy UI hiện tại trong WebView2, giữ nguyên HTML, CSS và thứ tự script.
4. Xác định quy trình build frontend, dev server và frontend distribution.
5. Xác minh CSP, đường dẫn tài nguyên cục bộ, icon, kích thước cửa sổ và scaling.

**Cổng hoàn tất**

- App Tauri mở UI đóng gói cục bộ và không phụ thuộc mạng để render.
- Bản thử nghiệm không đọc/ghi profile Electron và cài song song được.
- Không có thay đổi ngoài ý muốn trong các script renderer hoặc CSS.

### Giai đoạn 2 — Tách API desktop khỏi renderer

**Trạng thái: XONG (2026-11-09, DECISIONS "Giai đoạn 2").** Façade năm tệp trong `src/renderer/core/`, `desktop.stub` cho cổng UI, `invoke_channel`/`send_channel` trong `api.rs`; cầu `edugame-bridge.js` đã gỡ khỏi gói Tauri. Cả ba cổng hoàn tất ĐẠT — xem mục "Kiểm chứng" của quyết định. Lưu ý cho người đọc lại: adapter Tauri phải gửi **chuỗi kênh hợp đồng** (`app:info`), không phải tên khoá façade (`appInfo`).

**Công việc**

1. Thiết kế facade TypeScript có hợp đồng rõ ràng cho các nhóm:
   - app info và cửa sổ;
   - thư viện game, lịch sử, giáo án và dự án;
   - file import/export và ảnh minh họa;
   - cài đặt, AI, tiến độ và hủy tác vụ;
   - chẩn đoán;
   - trình chiếu;
   - LAN;
   - cập nhật.
2. Thêm adapter Electron để facade vẫn gọi được implementation hiện tại.
3. Thêm adapter Tauri qua `invoke`/events; cho phép test facade bằng fake adapter.
4. Chuyển renderer theo nhóm chức năng, không thay tất cả lời gọi trong một lần.
5. Chốt schema payload, lỗi, cancellation, tiến độ và unsubscribe event.
6. Giới hạn Tauri capabilities theo cửa sổ/command; không cấp quyền filesystem
   tổng quát cho frontend.

**Cổng hoàn tất**

- Renderer dùng facade thay cho các lời gọi Electron trực tiếp.
- Test hợp đồng bao phủ kết quả, lỗi và luồng sự kiện.
- Electron build và hành vi hiện tại vẫn được giữ nguyên.

### Giai đoạn 3 — SQLite, file và nhập/xuất

**Trạng thái: XONG 6/6 (2026-11-10, DECISIONS "Giai đoạn 3 (1/6)"–"(6/6)").** Backend là `rusqlite` 0.41 `bundled`; `src-tauri/src/storage.rs` mở `edugame.sqlite` với WAL + `foreign_keys` và chạy đúng hai khối DDL `include_str!` từ `src/db/`, đã mở bản sao dữ liệu 0.5.1 thật (11 bảng, 14 game, 268 phiên). Sáu kênh `library:*` và năm kênh `project:*` chạy luật TypeScript **nguyên văn** trong V8 nhúng (`deno_core`, slot `EGLIBRARY`); `.egame` qua slot `EGPACKAGES`; import tài liệu/câu hỏi/ảnh + chẩn đoán qua slot `EGFILES`; hộp thoại và tệp chỉ ở Rust. Cổng hai pha trên binary release đạt **46/46 + 10/10**, gồm chơi offline trò chơi đã lưu (bước 6/6 — không thêm kênh Rust, chỉ là cổng nghiệm thu). 53 kênh còn `unsupported!` (lesson/AI/setup/presentation/about/LAN) — thuộc vòng sau, không nằm trên đường chơi offline.

**Công việc**

1. Đánh giá backend SQLite Rust/plugin theo nhu cầu transaction, migration,
   Windows build và test; chốt dependency trước khi chuyển dữ liệu.
2. Giữ schema SQLite và migration hiện hữu; triển khai thao tác game, session,
   lesson store, project và cache.
3. Chuyển user data path và thao tác file; đặt giới hạn kích thước, kiểm tra
   dữ liệu và xử lý đường dẫn an toàn phía native.
4. Chuyển dialog mở/lưu file; đọc DOCX/PDF và CSV/TSV/XLSX; import/export `.egame`.
5. Chuyển lưu/xóa ảnh minh họa và thay `edugame-file:` bằng cách phục vụ tài
   nguyên chỉ cho phép ID hợp lệ trong thư mục ứng dụng.
6. Chuyển log/chẩn đoán và thao tác mở thư mục.

**Cổng hoàn tất**

- Lưu, đóng, mở lại, sửa và xóa game/session/project hoạt động.
- `.egame` có thể xuất rồi nhập lại; gói sai/độc hại bị từ chối.
- Import tài liệu, câu hỏi, ảnh và export chẩn đoán chạy trong app Tauri.
- Chơi game đã lưu khi offline; không có request mạng trong quá trình chơi.

### Giai đoạn 4 — Migration profile Electron

**Trạng thái: XONG (2026-11-10, DECISIONS "Giai đoạn 4").** `migration.rs` phát hiện profile, chỉ mời nhập khi giáo viên bấm, sao lưu bắt buộc dưới `backups/electron-*` (DB+WAL+SHM thô, `VACUUM INTO` từ bản sao thứ hai của `db/`, ảnh/giáo án, settings đã tước khoá, manifest SHA-256), nhập bằng `ATTACH` + `INSERT OR IGNORE` theo thứ tự khoá ngoại trong một transaction, xác minh id/tệp và chạy lại 0 dòng; không chép `ai-local/`, không lưu khoá BYOK. Cổng ba pha trên binary release đạt **46/46 + 10/10 + 12/12**. Đã chạy trên **bản sao profile 0.5.1 thật** (loại `ai-local/` + sentinel): 14 game/268 phiên/36 tài liệu/17 dự án khớp, nhập **694 dòng / 3 khoá**, 6 ảnh + 36 giáo án khớp SHA-256, chạy lại **0 dòng**; installer NSIS **14,37 MiB** cài trong thư mục tạm cho cùng kết quả, cài đè lần hai `alreadyMigrated`, DB/backup/`migration.json` không đổi. Chưa bấm hộp thoại Windows thật hoặc xem modal/backup bằng mắt; installer chưa thử máy sạch/VM, chưa Authenticode, chưa máy thiếu WebView2 — xem "Chưa xác minh" của quyết định.

**Công việc**

1. Phát hiện profile Electron cũ hoặc cho phép người dùng chọn thủ công.
2. Sao lưu nguồn trước; không sửa hoặc xóa profile Electron.
3. Kiểm tra version/schema, dữ liệu SQLite, đường dẫn lesson files và ảnh trước
   khi nhập.
4. Thực hiện migration có thể chạy lại an toàn; ghi nhận kết quả và lỗi theo
   từng phần, tránh trạng thái nhập dở được báo thành công.
5. Xác minh số lượng/ID game, session, lesson, project và checksum các file.
6. Xác định riêng chính sách model/runtime: tái sử dụng sau xác minh hoặc tải lại
   khi người dùng chọn; không sao chép bắt buộc các model lớn.

**Cổng hoàn tất**

- Migration thử trên bản sao profile 0.5.1, không phải dữ liệu thật.
- Chạy lại migration không nhân đôi hoặc làm hỏng dữ liệu.
- Lỗi giữa chừng có thể khôi phục từ backup; bản nguồn không bị thay đổi.

### Giai đoạn 5 — AI local và bí mật

**Trạng thái: XONG (2026-11-10/11, DECISIONS "Giai đoạn 5 (bí mật)" + "Giai đoạn 5 (AI local)" + "Giai đoạn 5 (setup wizard)").** Phần bí mật: `src-tauri/src/secrets.rs` dùng DPAPI của Windows (`CryptProtectData`/`CryptUnprotectData` qua `windows-sys`) và lưu blob base64 ở `ai.providers.<id>.apiKeyEncrypted`; `src-tauri/src/settings.rs` gộp provider, trả view chỉ có `hasKey`/`keyMasked`, xử lý `apiKey` rỗng/`clearKey`/thay khoá và xoá kết quả test cũ. Migration vẫn tước khoá, giáo viên nhập lại. Phần AI local: `src-tauri/src/ai_local.rs` giữ catalog pin 3 model + runtime CPU/Vulkan b11681, tải HTTPS có allowlist + Range resume, kiểm kích thước/SHA-256, giải nén ZIP phẳng, cài runtime/model và chạy `llama-server` loopback với health poll/progress. Ba lệnh cài/chạy/dừng trả `{ok, models}` như Electron, `start` kèm `baseUrl` loopback; cổng release **sau khi sửa hình dạng trả về** đạt **50/50 (53/53 khi bật tải thật) + 10/10 + 12/12** (`shapeOk`, `startOk`, `stoppedOk` đều đúng). Phần setup wizard: `src-tauri/src/setup.rs` port ba lớp `setup-state.ts`/`setup-orchestrator.ts`/`setup-ipc.ts`, trạng thái bền vững ở `<data>/ai-local/setup-state.json`, preflight phần cứng/dung lượng, resume theo bước hỏng, hủy giữ byte đã tải và smoke-test sinh chữ thật; bốn kênh `setup:*` rời `unsupported!` (49 → 45). Cổng release **51/51 (56/56 khi bật tải thật) + 10/10 + 12/12**. Installer NSIS dựng từ cây cuối **16.139.500 B** (SHA-256 `2593FF55…73375`); cài mới exit 0 (exe 57.822.208 B, đủ ba DLL VC++), cài đè exit 0 không đổi hash DB/WAL/SHM, gỡ `/S` exit 0 xoá sạch thư mục cài trong thư mục tạm. **Còn mở:** `ai:generate` chưa port; Vulkan/fallback, huỷ/đổi model, khoá thật và máy sạch chưa kiểm chứng — xem "Chưa chứng minh" của các quyết định AI local + setup wizard.

### Giai đoạn 5 — Luồng giáo án

**Trạng thái: XONG toàn bộ luồng giáo án gồm phân tích, sinh nội dung và chat; và XONG nhóm kênh AI phụ trợ (2026-11-11, DECISIONS "Giai đoạn 5 (luồng giáo án)" + "Giai đoạn 5 (sinh nội dung)" + "Giai đoạn 5 (chat giáo án)" + "Giai đoạn 5 (nhóm AI)").** `src-tauri/src/lesson.rs` nối settings/runtime/HTTP/kho với slot V8 `EGLESSON` (`src-tauri/src/embedded/lesson-ops.ts`), giữ nguyên `analyzeLesson`/`requestChatJson`/`runLessonChatTurn`/prompt/schema/normalize/classifier/`lesson-projects.ts` của Electron. Mười lăm kênh phần đầu rời `unsupported!` (`lesson:save-document`, `get-document`, `library`, `delete-document`, `delete-documents`, `get-analysis`, `save-analysis`, `recommendations`, `get-structure`, `preview-selection`, `classify-input`, `analyze`, `recommend`, `capacity`, `ai:cancel`), **45 → 30**. Kế tiếp, năm kênh sinh nội dung (`lesson:convert-draft`, `quality`, `patch-item-assets`, `generate`, `regenerate-item`) chạy qua V8 + Rust cache `draft_v1_<sha>`, đưa `unsupported!` **30 → 25**. Bốn kênh chat giáo án (`lesson:chat-send`, `chats`, `chat-get`, `chat-delete`) hoàn tất, đưa `unsupported!` **25 → 21**. Cuối cùng, ba kênh phụ trợ AI (`ai:test-provider`, `ai:tasks`, `ai:runtime-verify`) hoàn tất, đưa `unsupported!` **21 → 18**. `lesson_store.rs` có kho chat SQLite, bảng cache sinh nội dung và bảng `ai_tasks`; `ai_tasks.rs` có registry bộ nhớ sống; `settings.rs` probe kết nối HTTP/DPAPI; `ai_local.rs` kiểm tra runtime llama.cpp; tiến trình có danh sách trắng 7 mốc với `op_progress`; manifest comctl32 v6 hỗ trợ cả test lib. Test Rust **133/133**, Node **99/99**, `npm run check` sạch, `check:embedded` khớp 6125,0 KiB. **Còn mở:** cổng WebView2 không gọi kênh `lesson:*`; chưa chạy model thật/BYOK thật, chưa xem wizard bằng mắt, chưa huỷ giữa HTTP thật, chưa mở tài liệu từ profile 0.5.1 sau migration; 18 kênh còn `unsupported!` (`ai:generate`, 4 `presentation:*`, 7 `about:*`, 6 `lan:*`).

**Công việc**

1. Viết Rust service tải runtime/model đã pin, kiểm tra dung lượng, checksum và
   giải nén an toàn.
2. Quản lý `llama-server.exe`: `shell`/args cố định, không nhận executable path
   tùy ý từ renderer; bind loopback; kiểm tra health; timeout, cancel, restart
   và shutdown.
3. Phát tiến độ cài đặt/tác vụ qua events Tauri có unsubscribe và giới hạn tần
   suất phù hợp.
4. Giữ manifest, version, nguồn tải, checksum và quy tắc chọn CPU/Vulkan hiện tại.
5. Thay `safeStorage` bằng cơ chế bảo vệ bí mật tương thích Windows.
6. Xử lý API key BYOK: chỉ tự migrate nếu chứng minh được giải mã/mã hóa an toàn;
   nếu không, giữ provider settings không chứa key và yêu cầu người dùng nhập
   lại. Tuyệt đối không lưu key plaintext.

**Cổng hoàn tất**

- Runtime/model sai checksum không được chạy.
- Cài, khởi động, kiểm tra, hủy và dừng runtime đúng trên Windows.
- App vẫn mở và chơi game offline khi AI chưa cài, lỗi hoặc không khả dụng.
- Không lộ key hoặc nội dung nhạy cảm trong renderer, log hay installer.

### Giai đoạn 6 — Trình chiếu, LAN và tích hợp Windows

**Công việc**

1. Chuyển cửa sổ trình chiếu, chọn màn hình, fullscreen và xử lý rút màn hình.
2. Chuyển server LAN Express/Socket.IO sang Rust/WebSocket hoặc giải pháp Tauri
   phù hợp; giữ nguyên giới hạn dữ liệu và kiểm soát kết nối.
3. Thay custom protocol ảnh và các thao tác shell/hộp thoại bằng API native an toàn.
4. Kiểm tra firewall, port, địa chỉ LAN và shutdown socket.
5. Thay `electron-updater` bằng luồng cập nhật Tauri; kiểm tra chữ ký, nguồn feed,
   phiên bản, tải xuống, cài đặt, lỗi và rollback.
6. Đánh giá ký số installer và gói cập nhật trước khi phát hành cho người dùng.

**Cổng hoàn tất**

- Trình chiếu chạy trên màn hình thứ hai; rút màn hình không để cửa sổ thất lạc.
- Điện thoại kết nối LAN và chỉ nhận dữ liệu phiên chơi đã cho phép.
- Update chỉ chạy từ nguồn tin cậy, lỗi cập nhật không làm mất app hoặc dữ liệu.
- Các tính năng được kiểm tra trên Windows thật, không chỉ unit test.

### Giai đoạn 7 — Kiểm thử tương đương và phát hành thử

**Công việc**

1. Giữ lại unit test cho logic TypeScript thuần.
2. Thay test IPC/CDP phù hợp bằng integration test command/event và UI trên app
   Tauri thật.
3. Thêm kiểm tra offline, migration, import/export, process lifecycle, LAN,
   trình chiếu và updater.
4. Build installer Tauri riêng; cài cạnh Electron; thử cài mới, nâng cấp,
   migration, rollback, gỡ cài đặt và giữ lại dữ liệu.
5. Đo kích thước installer, thời gian mở, mức dùng CPU/RAM khi nhàn rỗi và thời
   gian tác vụ AI; so sánh với Electron trên cùng máy.
6. Chạy pilot giới hạn; duy trì Electron cho tới khi có quyết định chuyển kênh
   phát hành.

**Cổng hoàn tất**

- Toàn bộ cổng nghiệm thu ở mục 5 đạt trên Windows thật.
- Có hướng dẫn migration/rollback và hỗ trợ người dùng.
- Chủ dự án chấp thuận parity, chất lượng và số đo trước khi ngừng Electron.

## 5. Cổng nghiệm thu sản phẩm

1. **Offline:** mở và chơi game đã lưu khi ngắt mạng; xác nhận không request ra
   ngoài trong lúc chơi.
2. **Lưu trữ:** lưu, đóng app, mở lại; game, lịch sử, giáo án và dự án còn nguyên.
3. **`.egame`:** xuất/nhập lại thành công; dữ liệu lỗi bị từ chối rõ ràng.
4. **Migration:** profile Electron nguồn còn nguyên; dữ liệu nhập khớp; lỗi giữa
   chừng có thể phục hồi.
5. **AI local:** tiến trình khởi động/dừng/hủy đúng; file checksum sai không chạy;
   app vẫn dùng được nếu AI lỗi.
6. **Bảo mật:** frontend không có quyền truy cập filesystem tùy ý; key không
   xuất hiện trong renderer, log hoặc installer.
7. **Windows:** trình chiếu, fullscreen, LAN, dialog, cài/gỡ cài đặt và cập nhật
   được kiểm tra trên Windows thật.
8. **Hồi quy:** unit tests TypeScript hiện hữu tiếp tục chạy; có integration tests
   thay thế cho các hành vi Electron đã chuyển.

## 6. Rủi ro và cách giảm thiểu

| Rủi ro | Tác động | Cách giảm thiểu |
|---|---|---|
| Profile người dùng và schema bị chuyển sai | Mất dữ liệu game/giáo án | Backup bất biến, migration idempotent, kiểm đếm/checksum, test bản sao |
| Key BYOK không tương thích cơ chế mã hóa mới | Mất cấu hình truy cập provider hoặc lộ key nếu xử lý sai | Không migrate dạng plaintext; yêu cầu nhập lại nếu không chuyển an toàn |
| AI runtime và model nặng, phụ thuộc Windows | Cài đặt lỗi, runtime treo hoặc không dọn process | Rust service riêng, manifest pin, timeout/cancel/shutdown, test checksum |
| Tính năng Electron không tương đương trực tiếp | Trình chiếu, updater, LAN có hồi quy | Chuyển riêng từng nhóm, xác lập test nghiệm thu trước khi thay |
| WebView2/CSP/capabilities khác Chromium của Electron | Lỗi UI hoặc tăng quyền không cần thiết | Test UI đóng gói, CSP tối thiểu, chỉ cấp capability cụ thể |
| Chuyển đổi quá rộng cùng lúc | Khó tìm nguyên nhân lỗi, ảnh hưởng bản phát hành | Giữ adapter Electron và chia giai đoạn; không gỡ Electron sớm |
| Cài đặt Tauri không nhẹ như kỳ vọng | Lợi ích sản phẩm thấp hơn chi phí chuyển | Đo installer, boot, RAM/CPU sau giai đoạn thử nghiệm; quyết định dựa trên số liệu |

## 7. Quyết định đã chốt (2026-11-09)

Chủ dự án trả lời trực tiếp; ghi lại nguyên văn lựa chọn đã chọn. Quyết định #251
trong `docs/DECISIONS.md` là bản có hiệu lực.

| # | Câu hỏi | Chốt |
|---|---|---|
| 1 | Parity hay thử giới hạn trước | **Bản thử giới hạn trước.** Vòng 1: thư viện + chơi offline + `.egame` + import tài liệu + ảnh minh hoạ + cài đặt + migration. LAN, trình chiếu, updater, AI local để vòng sau. Electron vẫn là kênh phát hành chính cho tới khi có quyết định khác. |
| 2 | Cài song song + profile riêng | **Không: thay thế luôn.** Không cài song song. Hệ quả bắt buộc: giai đoạn 4 phải giữ **bản sao lưu profile nguồn** và có đường quay lại, vì sau khi thay thế thì không còn bản chạy song song để đối chiếu; và installer Tauri phải **không** ghi đè `%APPDATA%/EduGame Studio/edugame-data` của Electron (xem 7.2). |
| 3 | Nhập profile tự động hay do giáo viên chọn | **Gợi ý, giáo viên bấm nhập.** App phát hiện và hiện số game/giáo án tìm thấy kèm nút "Nhập vào bản mới"; không tự đọc ghi. Bỏ qua được. |
| 4 | BYOK key khi không giải mã an toàn | **Yêu cầu nhập lại, không migrate.** Giữ provider/base URL/model, xoá key đã mã hoá, hiện lời nhắc. Không ghi key plaintext ở bất kỳ đâu. |
| 5 | Model/runtime AI local | **Không sao chép, tải lại.** Migration không đụng `ai-local/`. Nếu phát hiện thư mục cũ thì hỏi "Dùng lại thư mục cũ" (chỉ khi checksum khớp) hoặc tải lại. |
| 6 | LAN / trình chiếu / updater có bắt buộc vòng 1 | **Không bắt buộc cả ba.** Bản đầu cập nhật bằng cách chạy lại installer (cài đè); **chưa** có nút Kiểm tra cập nhật trong app Tauri vòng 1. |
| 7 | Tiêu chí định lượng để ngừng Electron | **Cả ba mốc hiệu năng đều bắt buộc** (installer ≤ 25 MiB, khởi động ≤ 1.200 ms, nhàn rỗi ≤ 200 MiB private). Xem 7.1. Parity **không** phải câu trả lời của câu 7 — nó vốn đã là cổng nghiệm thu mục 5 và vẫn giữ nguyên hiệu lực độc lập. |

### 7.1 Ngưỡng ngừng Electron

Đo cùng bộ công cụ đã dùng ở [báo cáo giai đoạn 0](2026-11-09-tauri-phase0-survey.md#7-cách-tái-lập-phép-đo),
trên cùng máy, cùng cách chạy nguội, cùng profile tạm:

| Chỉ số | Electron 0.5.1 (đo) | Ngưỡng bắt buộc cho Tauri | Ý nghĩa |
|---|---|---|---|
| Installer | 92.681.365 B (88,4 MiB) | **≤ 25 MiB** | Phải giảm ít nhất ~72 % |
| Khởi động (spawn → `readyState=complete`, trung vị) | 1.931 ms | **≤ 1.200 ms** | Nhanh hơn ít nhất ~38 % |
| Nhàn rỗi private bytes | 294 MiB | **≤ 200 MiB** | Giảm ít nhất ~32 % |
| Parity | — | **Không phải câu trả lời câu 7.** Parity = toàn bộ cổng nghiệm thu mục 5 đạt trên Windows thật + mọi cổng hiện có xanh trên bản Tauri; ràng buộc này có hiệu lực sẵn, không phụ thuộc lựa chọn ở đây |

Điều kiện **cần** để chuyển kênh phát hành: ba mốc hiệu năng đạt **và** cổng nghiệm
thu mục 5 (parity) đạt **và** vòng 2 (LAN + trình chiếu + updater) đã xong. Điều
kiện **đủ** để quyết định đóng dự án
Tauri: nếu **installer không xuống dưới 25 MiB** sau khi đã làm đúng kế hoạch
(mã TS tách riêng + Rust, không sidecar Node), thì lợi ích chính không đạt và
không nên tiếp tục đánh đổi bằng việc chuyển đổi.

### 7.2 Hệ quả của "thay thế luôn" (câu 2)

Vì không có bản chạy song song, các ràng buộc sau thành **bắt buộc** trong khi code:

- **Tách định danh dữ liệu.** Electron hiện dùng `appId: vn.edugame.studio`,
  `productName: "EduGame Studio"`, và dữ liệu ở `%APPDATA%/EduGame Studio/edugame-data`
  (`src/main.ts:436`). Bản Tauri **phải** dùng application identifier khác và thư
  mục dữ liệu riêng cho tới khi migration chạy xong; nếu dùng chung thư mục thì
  lần mở đầu tiên của bản Tauri sẽ ghi vào dữ liệu mà giáo viên vẫn đang dùng
  bằng Electron với một schema do tiến trình khác quản lý.
- **Sao lưu trước khi nhập.** Backup profile nguồn là bước bắt buộc, tự động, và
  không xoá được từ trong app; đường quay lại = cài lại installer Electron cũ +
  phục hồi backup.
- **Interim không có nút "Kiểm tra cập nhật" trong app Tauri.** Cài đè installer
  phải giữ dữ liệu (`deleteAppDataOnUninstall: false` như hiện tại ở
  `package.json:137`), và cài đè **không** được chạy lại migration lần hai.
- **Không có lưới an toàn để so.** Vì vậy Windows thật + pilot giới hạn là bắt
  buộc trước khi gỡ Electron khỏi kênh phát hành, không chỉ unit test.

## 8. Ước lượng và thứ tự ưu tiên

Ước lượng sơ bộ: **6–10 tuần cho một lập trình viên** đã quen TypeScript, Rust
và Windows để đạt bản Tauri có các tính năng chính. Đây chưa phải estimate đã
được kiểm chứng; cần cập nhật sau giai đoạn 1–2. Migration dữ liệu, AI runtime,
LAN và updater là các nguồn bất định lớn nhất. Chưa tính thời gian pilot và sửa
lỗi sau phản hồi người dùng.

Thứ tự ưu tiên đề xuất:

1. Tauri chạy UI hiện tại.
2. Desktop API facade và adapter.
3. SQLite, file, import/export và offline gameplay.
4. Migration profile Electron.
5. AI local và bảo vệ secrets.
6. Trình chiếu và LAN.
7. Updater, ký gói và phát hành thử.

Nếu cần có bản thử nghiệm sớm, có thể giới hạn vòng đầu vào thư viện, chỉnh sửa
game, `.egame` và offline gameplay. Không ngừng phát hành Electron cho tới khi
các tính năng còn lại có quyết định rõ ràng và các cổng nghiệm thu tương ứng
được thông qua.

## 9. Trạng thái triển khai (cập nhật 2026-11-11)

- Giai đoạn 0 XONG: kiểm kê API + baseline Electron (xem
  [2026-11-09-tauri-phase0-survey.md](2026-11-09-tauri-phase0-survey.md)); bảy
  quyết định phạm vi chốt ở #251.
- Giai đoạn 1 XONG: vỏ Tauri v2 chạy UI đóng gói; installer **2,21 MiB**, boot
  **508 ms**, nhàn rỗi **190,7 MiB** — cả ba ngưỡng #251 ĐẠT.
- Giai đoạn 2 XONG: renderer đi qua façade `desktop.*`, adapter Electron + Tauri,
  Tauri không còn cầu `window.eduGame`.
- Giai đoạn 3 XONG 6/6: SQLite, `library:*`/`project:*`, `.egame`, import tài
  liệu/câu hỏi/ảnh, chẩn đoán và chơi offline; cổng hai pha **46/46 + 10/10**.
- Giai đoạn 4 XONG: phát hiện/mời nhập profile Electron, backup bất biến, nhập
  idempotent, tước khoá BYOK; cổng ba pha **46/46 + 10/10 + 12/12**, chạy trên bản
  sao profile 0.5.1 thật và cài đè installer trong thư mục tạm.
- Giai đoạn 5 XONG bốn phần: DPAPI thay `safeStorage`, `settings:get/save` chỉ
  trả `hasKey`/`keyMasked`, BYOK nhập lại; AI local pin runtime/model + SHA-256,
  tải resume, `llama-server` loopback. Ba lệnh cài/chạy/dừng trả `{ok, models}`
  như Electron, `start` kèm `baseUrl` loopback; cổng release sau khi sửa hình
  dạng trả về **50/50 (53/53 khi bật tải thật) + 10/10 + 12/12**. Setup wizard
  `setup:*` chạy máy trạng thái bền vững + smoke-test thật, cổng **51/51 (56/56
  khi bật tải thật) + 10/10 + 12/12**; installer NSIS dựng từ cây cuối
  **16.139.500 B** cài mới/cài đè/gỡ sạch trong thư mục tạm, cài đè không đổi
  hash DB/WAL/SHM. Luồng giáo án phần đầu chạy **15 kênh `lesson:*` +
  `ai:cancel`** (kho tài liệu, cấu trúc/xem trước/phân loại, phân tích qua HTTP
  của Rust với cache key trùng Electron, đề xuất, ước lượng, dự án), `unsupported!`
  **45 → 30**; nhóm sinh nội dung chạy thêm **5 kênh `lesson:convert-draft`/
  `quality`/`patch-item-assets`/`generate`/`regenerate-item`** (cache `draft_v1_<sha>`,
  tiến trình `op_progress`, V8 giữ adapter/prompt/rules), `unsupported!` **30 → 25**;
  nhóm chat giáo án chạy thêm **4 kênh `lesson:chat-send`/`chats`/`chat-get`/`chat-delete`**
  (V8 giữ `runLessonChatTurn`, SQLite lưu turn/chat, single-flight `AiGate`),
  `unsupported!` **25 → 21**; nhóm phụ trợ AI chạy thêm **3 kênh `ai:test-provider`/
  `ai:tasks`/`ai:runtime-verify`** (probe DPAPI/timeout 30s, SQLite task/in-memory, verify runtime llama.cpp),
  `unsupported!` **21 → 18**; test Rust **133/133**, Node **99/99**, `check:embedded` khớp 6125,0 KiB.
- Chưa làm: 6 (trình chiếu/LAN), 7 (updater/ký/phát hành thử), `ai:generate`
  và các kênh presentation/about/lan. 18 kênh còn `unsupported!`; đường luồng giáo án
  mới chứng minh bằng Rust + server giả loopback, chưa chạy model thật/BYOK thật và
  cổng WebView2 chưa gọi kênh `lesson:*`.
