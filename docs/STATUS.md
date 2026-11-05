# Trạng thái dự án

Bàn giao mới nhất nằm ngay trong file này (3 mục gần nhất). Các bàn giao cũ được lưu ở
`docs/handoff/status/` — mỗi ngày một file, nối thêm vào cuối file của ngày đó khi cần.
Quy ước: sau mỗi việc, chèn bàn giao mới ngay dưới tiêu đề "Bàn giao gần nhất"; nếu quá 3 mục,
chuyển mục cũ nhất vào file lưu trữ đúng ngày của nó và cập nhật mục lục.

## Mục lục bàn giao

### 2026-11-05
- **Bấm "Kiểm tra cập nhật" trên binary đã phát hành, chống feed GitHub thật**: đóng đúng hai dòng "chưa xác minh" của #200 bằng số. Cổng mới `tests/ui/packaged-feed-check.js` chạy trên `win-unpacked` dựng từ HEAD trong worktree tách biệt: **22/22 xanh** — `phase=up-to-date` sau **1.657 ms** (bấm tay lần hai **329 ms**), badge **"Ứng dụng đã mới nhất"**, note **"Bản 0.4.0 là bản mới nhất đã công bố"**, `errorKind` rỗng (trước #200 chỗ này là `feed`), `percent=0` và thanh tải ẩn nên `autoDownload=false` thể hiện ra số chứ không chỉ trong code, và phép đọc `releases/latest` **vô danh từ chính máy đó** trả `v0.4.0` khớp `currentVersion`. **Chân không điều khiển** vì `AppUpdater` cache cấu hình cả đời process nên phải dùng hai process: cất `app-update.yml` đi → `phase=error` `dev-mode` sau **3 ms** — cặp 1.657 ms / 3 ms là bằng chứng câu xanh đến từ mạng. Hai phát hiện dựng cổng: bản `--dir` **không sinh** `resources/app-update.yml` (chỉ target cài đặt mới ghi, nên muốn đo cập nhật phải `--win nsis` rồi chạy `win-unpacked`, không chạy bộ cài), và bẫy `ELECTRON_RUN_AS_NODE` kế thừa từ shell làm exe **thoát mã 9** `bad option: --remote-debugging-port` (#188 đã ghi, nay tái diễn). **Build không tái lập từng byte** — dựng lại cùng commit sau 25 phút: **92.490.696 B** so với 92.490.714 B đã phát hành (**−18 B**) và sha512 khác hoàn toàn; không phải lỗi cần sửa vì `latest.yml` ghim đúng từng byte của bản trên GitHub. Kèm hai số lần đầu có trên bản gói: `check:offline-packaged` **11/11 với 0 request** trên chính binary mang mã #196/#197/#199, và baseline mở app **1.034 ms median** (4 lượt 1.137 · 1.138 · 1.016 · 1.034; `documentLoaded` 368–436 ms — mốc "trước" cho P2 khi hết blocked). **Vẫn chưa**: một lần cài thật (nên `quitAndInstall()` vẫn chưa lần nào được gọi), và nhánh "có bản mới" chống feed thật — repo chỉ có 0.4.0 nên phải phát hành 0.4.1 mới đo được
- **GitHub Release 0.4.0 đầu tiên — và vì sao không đăng bộ cài đang nằm sẵn trên đĩa**: `release/Setup-0.4.0.exe` của #136 build lúc **16:40 ngày 04/11**, tức **trước** #187/#188 (17:52: chính trang Giới thiệu + `electron-updater` mà release này phục vụ) và trước cả bốn mục hiệu năng #196–#199 — một tag `v0.4.0` trỏ vào đó sẽ tuyên bố một binary không chứa thứ mà ghi chú phát hành mô tả. Build tại chỗ cũng không được: **20 tệp `src/` + `package.json`** của luồng #189–#195 còn modified. Nên dựng lại trong `git worktree` detached tại `5b87dfa` với `node_modules` nối bằng junction (phải gỡ bằng `fs.rmdirSync` **trước** khi xoá worktree — `rm -rf` một junction trên Windows đi xuyên vào thư mục thật). Kết quả: tag annotated `v0.4.0` đã push, release **434658977**, ba asset `latest.yml` **356 B** · `.exe` **92.490.714 B** · `.blockmap` **96.020 B**. Bốn tầng kiểm chứng, mỗi tầng một câu hỏi: *HEAD tự dựng được không* → `npm run build` 0 lỗi, unit **80/80 (32,2 s)** = đúng 87 trừ 7 suite `ui-*` chưa commit, `npm run check` 0, `check:renderer-globals` **64/65 scripts · 932 hàm / 7.547 call site**, `verify:css` **46/46**; *binary có đúng mã commit không* → `app.asar` chứa đủ marker #196 (`EDUGAME_BOOT_TRACE`, `app.boot.phases`, `lanSessionActive`), #197 (`targetPollMs`), #199 (`node:fs/promises` + `backgroundPrune` ở cả `ai-log.js` lẫn `main.js`) và `app-update.yml` trỏ đúng `vananz123/edu-game-ai`; *tệp phát hành nguyên vẹn không* → tải lại từ URL công khai, **SHA-512 giống từng byte**; *máy giáo viên vô danh đọc được feed không* → `GET /releases?per_page=1` **200** ba asset `state=uploaded`, `GET` asset `latest.yml` **302 → 200** đúng manifest. Quét **toàn bộ 99 commit** tìm chuỗi hình token: **0 kết quả**, và `.env.example` chỉ còn placeholder ⇒ nợ (h) của #188 ghi "`.env.example` có dòng `GH_TOKEN`" là **sai với hiện tại**, đã sửa. Máy đã cài 0.4.0 sẽ báo "đang dùng bản mới nhất" chứ **không** bị đẩy cập nhật (`allowDowngrade = false` + cùng version) — phần đã đo #196/#197/#199 chỉ tới tay người dùng qua **bản 0.4.1** (#200)
- **P5 đo trước khi sửa, và số đo thu hẹp chính nó**: trong bốn thao tác I/O của log chẩn đoán, **chỉ** `prune()` nằm trên đường mở app đáng bỏ khỏi tick đồng bộ — **6,52–6,54 ms** khi có 14 tệp quá hạn ở hai lần đo đầu (quét 2,0–2,4 ms + ~4,4 ms `unlinkSync`); `readRecent` 3,6–5,4 ms và bundle 1,0–1,3 ms là giá của **một cú nhấp** mà giáo viên tự gây ra và tự chờ nên **giữ đồng bộ** — đúng cái giá #198 vừa từ chối cho 1,88 ms/phiên. `prune()` sang `fs/promises` (`stat` + `unlink` **song song**) và được bắn chạy nền ngay trong `createAiLogWriter`, kèm một lời hẹn lộ ra (`backgroundPrune()`) để `diagnostics:clear` chờ đúng lượt dọn đó thay vì đoán: main process chỉ còn bị chặn **0,22–0,27 ms median** so với **2,72–3,40 ms** của **chính đường cũ, cùng máy cùng phiên** (harness ghép cặp, 9 mẫu/lần, ba lần chạy) ⇒ **−91 % = 2,5–3,1 ms**, và 6,3 ms so với hai mẫu BEFORE lấy lúc đĩa bận. ⚠️ Ngưỡng 5.000 µs **chỉ bị vượt khi đĩa bận** (max mỗi run 4,7–7,3 ms), nên quyết định đứng trên *cấu trúc* khoản tiết kiệm chứ không trên một con số vượt ngưỡng; bài học này còn làm harness đổi thiết kế vì một mẫu đơn từng in 17,0–24,2 ms cho một cửa sổ chỉ còn `mkdirSync`. **`write()` giữ nguyên 100 % đồng bộ, kể cả nhánh luân chuyển** — nó chạy mỗi dòng log, async hoá là đổi thứ tự ghi đúng lúc app chết, tức mất dòng cuối khi debug. Test cũ assert *ngay sau* `createAiLogWriter` và chỉ đúng *tình cờ* vì prune đồng bộ; nay nhánh prune là async IIFE await **chính** `backgroundPrune()`, có thêm khối khoá thứ tự với `readRecent`/`files()`/`clearAiLogs`, và tự in `SKIP` khi `dist/` còn là bản đồng bộ thay vì đỏ vì một build chưa chạy **Kế hoạch hiệu năng không còn mục nào làm được ngay: chỉ còn P2 (bị luồng #189–#195 giữ `src/index.html`) và P7 (máy pilot)** (#199)
- **P4 đo để bỏ, không đo để sửa**: `db.prepare()` được benchmark trên **chính các đường đọc của app** (11 đường, A/B/A, memo 5 dòng nằm trong harness nên không sờ source); một-shot đọc tiết kiệm **13–96 µs**, một lượt xoá giáo án **76–506 µs**, **cả một phiên 127 lần prepare = 1,87–1,83 ms và tiết kiệm 1,88–2,45 ms** — dưới cả ba ngưỡng đặt trước khi đo ⇒ **BỎ cache prepared statements**, 69 chỗ đọc thẳng giữ nguyên vì đó là phần dễ theo dõi nhất của kho dữ liệu (#198) — **đã lưu ở [docs/handoff/status/2026-11-05.md](handoff/status/2026-11-05.md)**

### 2026-11-04
- **P3**: thanh trạng thái AI không còn `setInterval(refresh, 2000)` cứng — **10 s khi nhàn rỗi, 2 s khi thật sự có việc, tắt hẳn khi cửa sổ ẩn**; nhịp do `reschedulePoll()` (chỗ duy nhất đặt hẹn giờ) suy lại từ chính `refresh()`, đo bằng CDP trên Electron thật: **3 lượt refresh/30 s thay vì 15 ⇒ −80 % IPC lúc nhàn rỗi**, gate mới 10 check (#197)
- **P0 đo thật rồi mới sửa**: thời gian mở app là **1.540–1.593 ms → median 1.195 ms (−345…−398 ms ≈ −22 %)** bằng cách kéo `mammoth` (≈118 ms), `express`+`express-rate-limit`+`socket.io` (≈190 ms) và `electron-updater` (≈123 ms) ra khỏi đường `require` lúc khởi động, theo đúng khuôn nạp trơ đã có trong repo (`game-package.ts:21`); giả thuyết của chính người làm (đoán `ensureData` + hai probe chiếm ~1,03 s) bị số đo bác bỏ — thật ra ≈52 ms + 7 ms; **P1 (`defer` cho 66 `<script>`) bị loại vì hai cổng đọc thẻ script bằng regex**, không phải vì ý kiến (#196) — **đã lưu ở [docs/handoff/status/2026-11-04.md](handoff/status/2026-11-04.md)**
- **Bàn giao của luồng UI/UX #189–#195** (bản sắc thương hiệu + nhãn Title Case + mascot Cú tốt nghiệp, Animation Tier 1 CSS thuần, elevation shadows + scrollbar + dark surface layering, ngôn ngữ sư phạm + progressive disclosure + huy hiệu tài liệu, micro-interactions + nút loading, Animation Tier 2 `canvas-confetti` offline + trượt câu hỏi + đếm điểm, và tinh chỉnh Wizard Tạo từ giáo án: bỏ ALLCAPS + gập tuỳ chọn nâng cao) — **đã lưu ở [docs/handoff/status/2026-11-04.md](handoff/status/2026-11-04.md)** (#189–#195)
- **Trang Giới thiệu** ra đời — và nó là **cửa sổ thứ hai** (`contextIsolation` + `sandbox` + preload riêng), không phải một trang của SPA: máy trạng thái cập nhật viết **thuần** (`update-policy.ts`, 0 Electron/0 DOM/0 mạng) nên "lúc nào được phép bấm gì" test được không cần bộ cài thật; `electron-updater` đọc GitHub Releases với `autoDownload = false` và `autoInstallOnAppQuit = false`, vì một lớp học không được đổi phần mềm sau một đêm; kiểm tra **chỉ khi mở trang**, không khi khởi động — cổng `check:offline-packaged` **11/11 với 0 request** trên bản gói vừa dựng lại chứng minh điều đó; spec đòi `checkForUpdatesAndNotify()` — **không dùng**: nó tự tải và tự báo, trái luật "không tải hộ"; cổng mới `check:about-ui` **69 check** đi hết vòng đời trên Electron thật (dev-mode → offline → 404 feed → có bản mới → tải thật có % tăng dần → bộ cài nằm trên đĩa đúng số byte → lỗi muộn không đoạt lại bộ cài) — **app đã là 0.4.0 từ #185, không phải 0.3.0 như spec**, và repo chưa có release nào nên bản gói hiện báo "chưa tìm thấy bản phát hành" là **đúng** (#188) — **đã lưu ở [docs/handoff/status/2026-11-04.md](handoff/status/2026-11-04.md)**
- **Xoá một cuộc trò chuyện làm mất luôn khả năng gõ**: nút bị xoá nằm trong popover nên sau khi redraw, focus về `<body>` và popover vẫn treo — giáo viên thấy "khung chat không nhận phím". Nay cả **ba nhánh** của lượt xoá (xoá xong · giáo viên huỷ · lỗi) đều đóng popover và trả con trỏ vào ô gõ; thêm nữa **ô gõ không còn bị khoá** khi một lượt đang chạy (`disabled` + nền xám bị xoá khỏi CSS), vì trên máy CPU một câu trả lời mất vài phút và một ô không nhận gõ mà không nói lý do đúng là cảm giác đó; và một danh sách đọc lỗi **không còn im lặng thành "chưa có cuộc trò chuyện nào"** (#187) — **đã lưu ở [docs/handoff/status/2026-11-04.md](handoff/status/2026-11-04.md)**
- Khung chat hỏi giáo án trước đó chỉ gửi **4,4–9,6 %** bài học (đo: 95–206 / 2.145 ký tự) và không nói điều đó. Nay **AI đám mây và AI local chạy GPU nhận toàn bộ giáo án**, local **CPU** vẫn truy hồi nhưng **3 → 12 đoạn** và trần **3.200 → 12.000** ký tự (số của `document-assist`, không phải phỏng đoán); `gpuLayers` **thật** quyết định nhánh vì llama.cpp có thể khởi động CPU sau một lần Vulkan hỏng; mỗi lượt in **"AI đã đọc 817 / 817 ký tự (100 %) · toàn bộ giáo án, không cắt bớt"** và số liệu đó **sống qua restart** nhờ một cột `evidence_meta` + migration cộng dồn — lượt cũ không có thì **im lặng**, không bịa 100 %; store **nặn** số bẩn (`5.000/100` → `5.000/5.000`) để không in % sai; gate **87 → 95 check**, `verify:css` 44 → **46/46**, unit **76/76**, `test:native` 1/1 — **nhánh local chưa chạy llama.cpp, đúng chỉ đạo "tôi sẽ tự kiểm tra sau"** (#186) — **đã lưu ở [docs/handoff/status/2026-11-04.md](handoff/status/2026-11-04.md)**
- Logo mới (mũ tốt nghiệp trên trang sách) nối vào **exe · bộ cài · shortcut · cửa sổ · taskbar**, và sự thật kiểm kê mới thấy: app **chưa từng có icon nào**, nên mọi bề mặt đang vẽ logo Electron mà không check nào đỏ; version **0.4.0** ở bốn chỗ; `Setup-0.4.0.exe` **92.241.504 B** với **icon trích được từ chính nhị phân**, `check:offline-packaged` **11/11** trên bản gói, unit 75 → **76/76** nhờ gate mới `brand-assets` (#185) — **đã lưu ở [docs/handoff/status/2026-11-04.md](handoff/status/2026-11-04.md)**
- Bỏ dòng chữ thừa ở đầu khung chat, **khung chat 601 px / danh sách 335 px**, "Chọn giáo án" + "Tải giáo án mới" dời **vào trong khung gõ** (picker co transcript chứ không co frame: composer 245→388, scroll 401→258, frame vẫn 704), danh sách giáo án gói còn **một dòng + Xem chi tiết** — và "làm gọn" hoá ra là một **bug bố cục** khiến thẻ cao 338 px vì mỗi chữ một dòng; gate 72 → **87 check**, `verify:css` 39 → **44/44** (#184) — **đã lưu ở [docs/handoff/status/2026-11-04.md](handoff/status/2026-11-04.md)**
- Khung chat Giáo án **to lên theo số đo** (`clamp(520px, 46%, 640px)` — đo thật chat 520 / danh sách 415 px, không tràn) và **hỏi được mà không cần chọn hay tải giáo án**: một lượt không tài liệu là hợp lệ ở cả bốn tầng (renderer · main · store · service), có system prompt riêng để model **không bịa** về một bài nó chưa thấy; cổng `check:lesson-chat-ui` 59 → **72 check**, unit tầng chat lần đầu có test thuần (#183) — **đã lưu ở [docs/handoff/status/2026-11-04.md](handoff/status/2026-11-04.md)**
- Trang Giáo án thành **hai cột**: khung chat cố định 400 px bên trái (chọn nhiều giáo án, tải giáo án mới, chọn AI local hay đám mây), trả lời **kèm trích dẫn đúng nguồn**, và "Bộ câu hỏi" ra **định dạng arena** rồi bấm một nút là sang wizard ở bước hoàn tất **không gọi model lần hai**; BETA bị **xoá** chứ không đổi nhãn; cổng mới `check:lesson-chat-ui` **59 check** test luồng cloud bằng mock OpenAI loopback (#182) — **đã lưu ở [docs/handoff/status/2026-11-04.md](handoff/status/2026-11-04.md)**

### 2026-11-03
- Chữ **nhỏ và nhạt** thành hai con số có sàn: 11 px và 4,5:1 cho 16 màn hình giáo viên × 2 theme — baseline 184/538 dòng dưới ngưỡng và 124 dòng ≤ 10 px, nay **0 và 0**; `--color-muted` tự nó chỉ 3,90:1 nên một dòng token sửa được cả app; cổng mới `check:typography-ui` 8 check là phép kiểm đầu tiên đo **trạng thái hover/focus** (chữ từng biến mất đúng lúc con trỏ dừng trên nó, 1,13:1) (#181) — **đã lưu ở [docs/handoff/status/2026-11-03.md](handoff/status/2026-11-03.md)**
- Bước 2 **không cắt giáo án khi phân tích bằng AI đám mây** — hạn mức đọc là thuộc tính của nhà cung cấp, không của bài học; giao diện nói rõ đã đọc bao nhiêu ký tự và có cắt hay không; chữ hướng dẫn bước 2 giảm 27 % (#180) — **đã lưu ở [docs/handoff/status/2026-11-03.md](handoff/status/2026-11-03.md)**
- Chế độ Xây nhà: HUD "Đã xây n/m phần" rời dải ngang sang **cột phải**, màn trình diễn đặt **nhà một bên — lời giải thích một bên**; `houseTarget()` chỉ còn đo một ô DOM và sizing đọc **hộp bao của hình chiếu** (8 góc envelope) thay vì hằng số `0,78`; trên **máy chiếu** cột HUD không còn bị `wizard.css:409` ẩn sạch, và `flex-wrap: nowrap` giữ hai cột cạnh nhau ở cả hai màn (#179) — **đã lưu ở [docs/handoff/status/2026-11-03.md](handoff/status/2026-11-03.md)**
- Ghép xong thì hiện **cả hai vế** của cặp (board · SVG · máy chiếu · dòng "Đã ghép"), và một câu trả lời đúng không còn phóng nhỏ cả bầu trời 11 % rồi bỏ nhãn lại ở trời cũ (#178) — **đã lưu ở [docs/handoff/status/2026-11-03.md](handoff/status/2026-11-03.md)**
- Chòm sao tri thức: nhãn dài treo đúng trên sao + hàng dưới là lưới 12 cột có số trên sao (#174); màn kết quả **là** bầu trời 3D thay vì ảnh tĩnh (#175); sửa phép chiếu DOM phải đo theo canvas — nhãn từng lệch sao thật 34–56 px mà gate vẫn xanh (#176) — **đã lưu ở [docs/handoff/status/2026-11-03.md](handoff/status/2026-11-03.md)**
- `fitConnectionGraph` đóng khung theo **hộp bao của hình** thay vì hộp vẽ: chòm sao về giữa khung (từng lệch tới 164 px), kèm trần phóng to 1,4× để mảnh 2 sao không thành hai vòng tròn (#177) — **đã lưu ở [docs/handoff/status/2026-11-03.md](handoff/status/2026-11-03.md)**

### 2026-11-02 — #171–#173 đã lưu ở [docs/handoff/status/2026-11-02.md](handoff/status/2026-11-02.md)
- Board chòm sao bỏ hết khung xám (modal + nỉ thế giới + vòng quanh cảnh) và nổi trong khoang vũ trụ `makeCosmos`: trời gradient, 620 sao shader twinkle, 3 dải khí, quay chậm theo vòng lặp chung (#173)
- "Chòm sao tri thức" bố cục lại: MỘT khay thẻ dưới cảnh lớn (~68% vùng chơi), câu dài đọc được ngoài cảnh với một đường trỏ tới sao, cạnh chòm sao chỉ hiện khi ghép đúng; sửa lỗi chiếu theo hai khung khiến thả không trúng sao và không cạnh nào hiện (#172)
- "Chòm sao tri thức": bảng sao 3D kéo thả (7 chòm sao, `dragDirection`, ánh xạ id cũ), thay "Kết nối vật thể"; chơi toàn màn hình với cảnh là bề mặt chính; BETA gỡ bỏ (#171)

### 2026-11-01 — [docs/handoff/status/2026-11-01.md](handoff/status/2026-11-01.md)
- "Kết nối vật thể" chuyển sang BETA (chỉ nhãn, giữ hành vi) và sửa lỗi camera matrix làm hình chiếu lệch ~60 000 px (#170)
- "Kết nối vật thể" thành bề mặt 3D thật bằng Three.js: khối/vòng có chiều sâu, dây vẽ dần, camera dolly, SVG làm dự phòng (#169)
- "Kết nối vật thể": cách chơi thứ tư của Ghép cặp kiến thức — 7 mẫu dữ liệu, hình SVG thay bảng hai cột, máy chiếu có khung tĩnh (#168)
- Một cỡ 22px/700 cho mọi tiêu đề trang, bỏ dòng mô tả, `h1` kế thừa token mực — nhịp 25px, nợ light 28 → 26 (#167)
- `color-scheme` khoá theo `[data-theme]` — checkbox/popup `<select>` native hết vẽ sáng, gate dark 18 → 23 check, dịch màu cả họ select ghim màu (#166)
- Năm badge bước lên AA cả hai theme — gate đọc luôn nhánh light, 16 → 18 check, dark 0/263 dưới ngưỡng (#165)
- Dark mode cho bốn thanh chọn hàng loạt — sửa bằng bảng dịch màu, gate dark 9 → 16 check (#164)
- "Xoá đã chọn" cho trang Dự án của tôi — IPC `project:delete-many` + thanh chọn (#163)
- Bỏ brand + navbar; trạng thái llama.cpp, thông báo, toàn màn hình/trợ giúp vào sidebar (#162)
- Icon Lucide cho toàn bộ chrome, xoá trang Tổng quan, sidebar có khối "Lối tắt" (#161)
- Biến thể `dark:` nối vào `[data-theme]` — dark mode 149/223 → 5/223 chữ dưới ngưỡng AA (#160, G6)
- Năm mục Cài đặt thành năm tab; mọi utility `dark:` trong app đều chết (#159)

### 2026-10-31 — [docs/handoff/status/2026-10-31.md](handoff/status/2026-10-31.md)
- Mục AI duy nhất, chia tab "AI local" / "AI cloud"; còn năm mục accordion (#158)
- Trang Cài đặt là accordion sáu mục; sửa `ai:test-provider` đọc cache key rỗng (#157)
- `ui-wizard-structure-check` xanh 14/14 nhờ guard setup onboarding (#156)
- Nhãn "Cách chơi" (Cổ điển / Xây nhà) trên thẻ trò chơi (#155)
- Phân trang và xoá nhiều ở Thư viện trò chơi (#154)
- Bốn yêu cầu #153: bỏ ảnh theo câu, nhãn "Đấu trường tri thức", ảnh thay nhãn xám, hạ HUD Xây nhà
- Màn chơi đặt tên theo template, không theo panel còn sót (#152)
- Sửa Phase B của ui-item-assets-editor-check đo đúng trang soạn thảo
- Tách game-editor + wizard/state theo khu vực
- Tách app.css thành 13 file khu vực
- Nhóm src/services theo lesson/ai/game/storage/input
- Tách gameplay.ts thành features/games/*
- Tách lịch sử docs sang docs/handoff + .gitattributes
- Rollout pattern gameplay cho matching/treasure/race
- Hiện nhà ở màn kết quả + 4 mẫu nhà
- Mục tiêu số phần nhà theo số câu hỏi
- Đưa ngôi nhà ra trước sau mỗi câu
- Thiết kế lại Chế độ Xây nhà: mỗi câu +1/−1 phần
- Chế độ Xây nhà cho quiz
- Tổng quát hoá `makeConstruction` với tham số `parts`

### 2026-10-30 — [docs/handoff/status/2026-10-30.md](handoff/status/2026-10-30.md)
- Hệ tương tác 3D gameplay-driven: lớp animation + 5 pattern + pilot quiz/scenario
- Mở rộng 3D trang trí sang matching/treasure/race
- Skill tương tác Three.js: bundle esbuild + `window.threeGame` + pilot quiz/scenario
- Ảnh minh hoạ tự tải lên hiện trọn vẹn thay vì bị cắt
- Toàn màn hình/máy chiếu: nén mật độ ở cửa sổ thấp 1366×768
- Tinh chỉnh 5 thế giới: scenario nhận lại bảng màu quiz + trạng thái "đã chọn" theo accent
- Màn hình kết quả 5 trò chơi: màu theo thế giới + dải thẻ số liệu

### 2026-10-29 — [docs/handoff/status/2026-10-29.md](handoff/status/2026-10-29.md)
- Nhà cung cấp AI chỉ cấu hình ở Cài đặt; Step 2/Step 5 dùng nhà cung cấp đã kiểm tra
- Sửa trình chỉnh sửa Đường đua
- Thanh lưu của trình chỉnh sửa luôn hiện
- Trình chỉnh sửa trò chơi thành trang
- Ảnh minh hoạ trong trình soạn thảo (tạo thủ công)
- Tải ảnh: hàng đợi ghi + không kẹt nút + dọn ảnh
- Sửa "Tải ảnh lên" không gắn ảnh ở bước 5
- Sửa ảnh tải lên không hiện trong thẻ câu hỏi
- Câu hỏi đi cùng ảnh minh hoạ, tải ảnh từ máy
- Lịch sử kết quả: phân trang + chọn nhiều để xoá
- Giáo án: phân trang + chọn nhiều để xoá
- Tác vụ AI có phân trang, giữ 30 tác vụ
- Menu "•••" tự đóng
- Thẻ trò chơi gọn + menu 3 chấm + xoá giáo án
- Nhập gói .egame

### 2026-10-28 — [docs/handoff/status/2026-10-28.md](handoff/status/2026-10-28.md)
- Đáp án không lẫn vào câu hỏi + ngân hàng đi thẳng bước lưu
- Làm sạch ký hiệu ngân hàng câu hỏi
- Ngân hàng câu hỏi linh hoạt + gợi ý thể loại theo dữ liệu
- Sửa 14 finding review: LAN rò dữ liệu, treasure không lưu được, classifier/parser lệch
- Phân loại 4 nhóm + lớp xác nhận MiniLM + đo thời gian
- Sửa 2 lỗi CRITICAL + 3 WARNING từ code review
- Phân luồng đầu vào & chặn gọi AI thừa
- Ghép cặp kiến thức: ghép xong dừng lại, có nút "Xem kết quả"
- Kho báu: hàng đầu sân khấu flex hai bên (nhãn thế giới trái, nút Bối cảnh phải)
- Kho báu: bỏ nhãn xám "Chặng n", nút Bối cảnh & Nhiệm vụ lên trên dải nhiệm vụ
- Chơi LAN: bục vinh danh hạng 1–2–3 khi kết thúc
- Chơi LAN: nút trên thẻ thư viện + nút "Bắt đầu câu 1" cho giáo viên
- Chơi LAN: học sinh trả lời trên điện thoại
- Truy tìm kho báu: trả lại nút pop-up Bối cảnh & Nhiệm vụ

### 2026-10-27 — [docs/handoff/status/2026-10-27.md](handoff/status/2026-10-27.md)
- Truy tìm kho báu: bố cục toàn màn hình mới
- Năm thế giới trò chơi: bộ chữ đổi sang font đủ dấu tiếng Việt
- Sửa 6 lỗi tìm thấy khi review batch UI
- Bước 1 Tạo từ giáo án: Hết khựng/giật khi tích chọn cấu trúc & chuyển tab
- Thanh Navbar: Làm gọn thanh trạng thái llama.cpp & Gom nút chức năng vào menu 3 chấm
- Cải tiến trang Cài đặt ứng dụng: Bố cục trực quan & Nút Lưu sticky
- Trang Tạo trò chơi mới (thủ công): Tái thiết kế giao diện hiện đại
- Tạo từ giáo án Bước 1: Tab UI cho Cấu trúc tài liệu & Nội dung giáo án
- Tạo từ giáo án Bước 1: Tái thiết kế bố cục giao diện khoa học và hiện đại
- Nâng cấp Navbar: Tích hợp thanh trạng thái AI/llama.cpp và Trung tâm thông báo lên Navbar
- Ghép cặp kiến thức: Bổ sung hiệu ứng tia nối 2 kết quả đúng
- Đường đua tri thức: Gộp Vòng-Lượt và Các đội vào 1 hàng duy nhất
- Đường đua tri thức: Bổ sung kết quả đúng/sai khi chọn đáp án, phóng to ảnh minh họa
- Tối ưu Truy tìm kho báu: Gợi ý và kết quả đúng/sai dưới ảnh minh họa, giữ nguyên tỉ lệ khi ảnh co giãn
- Gợi ý, kết quả đúng/sai hiển thị dưới ảnh minh họa, tách biệt hoàn toàn với layout câu hỏi
- Sửa lỗi nút "Bước vào chặng tiếp theo" không hoạt động trong Bản đồ Hành trình
- Sửa lỗi không tiếp tục được, thiết kế lại Bản đồ Hành trình Full màn hình cho Kho báu
- Tối ưu Truy tìm kho báu: Ẩn/Hiện bản đồ hành trình kèm chuyển động, Modal bối cảnh & luật chơi, Phần thưởng 80-90% và 100%
- Tối ưu bố cục 5 trò chơi, hiển thị đội nhóm & điểm, xử lý lúc có/không có ảnh, hoạt ảnh chuyển động toàn màn hình
- Man hinh choi toan man hinh nhat quan

### 2026-10-26 — [docs/handoff/status/2026-10-26.md](handoff/status/2026-10-26.md)
- Anh trong game to hon + anh mac dinh khi data khong co anh
- DaisyUI: cai dat an toan + don chien tranh do uu tien + sua check do sai

### 2026-10-25 — [docs/handoff/status/2026-10-25.md](handoff/status/2026-10-25.md)
- Pha B (tiep): kho bau la man CUON theo hop dong, race da do lai
- Pha B: dong het phan tran cua man cho (treasure 0px, quiz 0px)
- Bo cuc 2 cot cho stage: sua 5/6 loi may chieu
- Pha B: pho cap luoi do UI o 2 do phan giai that
- Pha A: chan mat ban nhap khi dong cua so
- Ke hoach UI v2 va bang do kiem tra moi truong UI hien tai
- UI/UX projector pass: Presentation Mode khong ve duoc trong ban build, va co chu trinh chieu 12-16px
- CPU-vs-Vulkan: quyết định CPU-mặc-định được **xác nhận lại** bằng phép đo sạch; một bảng benchmark cũ trong docs là số sai
- Housekeeping — dọn build output và xoá `tests/tailieu/`
- Gemma 4 E2B đã được đo: chậm hơn 2B thật, và **không** phải vì CPU "chỉ chạy 33%"
- CPU is now visibly the default; catalog swapped to 2B/4B/Gemma 4; a bad runtime can no longer kill AI local
- Vulkan now really runs on the iGPU; measured **slower than CPU** on the pilot machine

### Không ghi ngày (mục cũ #70–#79, khoảng 2026-10-22/23) — [docs/handoff/status/undated-070-079.md](handoff/status/undated-070-079.md)
- Backend choice now reaches the files on disk (fixes "chose Vulkan, CPU still at 100%")
- Runtime backend is now a teacher choice (Vulkan/iGPU reachable from Settings, CPU stays the default)
- Renderer guard: build now fails on a call to an undeclared function (`@ts-nocheck` blind spot closed)
- Step 1 structure tree: TWO INTERACTION BUGS FOUND AND FIXED (checkboxes painted unticked; root row toggled everything)
- Step 1 "Chọn tệp giáo án": ROOT CAUSE FOUND AND FIXED (`ReferenceError` killed `render()`)
- Step 1 "Chọn tệp giáo án" does nothing: investigated, not reproduced in code (open)
- A parent section now really contains its subtree; analyzer hardened (#79)
- Structure tree gets its missing CSS; scope-to-prompt proven by test (#76, #77)
- Lesson structure analyzer + section selection: both suites green (#76, #77)
- Step 2 now shows the same progress as step 5: a bar, a spinner and the elapsed clock (#75)
- Step 5 crashed on load: a top-level read of a later script's binding (hotfix, #74)
- Phase B: per-item artwork you can change, and the matching-pair hole closed (#73)
- All 24 depth-stack scenes reviewed; three more visual defects fixed and gated (#72 follow-up)
- Illustrations became depth stacks, and the preview caught three defects (#72)
- Step 5 shows a real stage percentage, a spinner and a measured ETA (#71)
- Illustrations are scenes now, and the frame finally fits them (#70)
- Offline proven under a REAL network block (not just "0 requests")

### 2026-10-23 — [docs/handoff/status/2026-10-23.md](handoff/status/2026-10-23.md)
- Mật độ chữ màn chơi toàn màn hình: 122px trống là **rule CSS chết**
- Đợt 2c: xếp hạng trích đoạn bằng truy vấn thật + sửa tiền xử lý hai lần
- Sửa lỗi sau khi chạy trên 4 tài liệu thật + ngân sách `deep`
- #54 tiếp: thu hẹp trích đoạn theo từng mục khi "Tạo lại"

### 2026-10-22 — [docs/handoff/status/2026-10-22.md](handoff/status/2026-10-22.md)
- Sửa smoke-test bước 12: cài AI lần đầu thất bại dù model chạy tốt
- Chấm "điền từ / trả lời ngắn": dấu câu và dấu phẩy trong đáp án nhiều ý
- Câu nhập đáp án ngắn (≤ 5 từ) + nút "Gợi ý", và hai lỗi bố cục đo được
- Đổi toàn bộ model sang Q4_K_M, setup lần đầu không tự cài 7B
- Build lại bộ cài có wizard UI
- Lỗi giáo viên báo 22/10 — "modal giật khi tải AI", "AI không khởi chạy", "setup phải toàn màn hình"
- Wizard UI cài AI lần đầu (Đợt 4) — giáo viên đã bấm được luồng setup
- Đóng gói bộ cài có phần AI setup
- Cài đặt AI lần đầu — Đợt 3: nối vào Electron (main.ts + preload)
- Cài đặt AI lần đầu — Đợt 2: orchestrator + IPC hẹp
- Cài đặt AI lần đầu — Đợt 1: nền tảng thuần TypeScript
- Cải thiện UI/UX màn chơi game, nút "Trình chiếu" và icon điều hướng
- Bốn lỗi UI giáo viên báo: thanh menu Windows, thanh cuộn, "Đường đua" nền trắng, "Tìm kho báu" không cuộn được
- Sửa lỗi UI: nav/topbar còn hiện khi chơi game toàn màn hình

### 2026-10-21 — [docs/handoff/status/2026-10-21.md](handoff/status/2026-10-21.md)
- Presentation Mode — Trình chiếu game lên màn hình phụ/máy chiếu
- Wizard: dự đoán số mục, nút “AI gợi ý & tạo ngay”, chọn thể loại và phản hồi bước 5 (O12/O13)
- Nhật ký chẩn đoán AI (O10)
- Số luồng CPU tự động (O11)
- Xử lý AI trả thiếu mục (O9)
- update_plan_3 Đợt 3 (đợt này) — Theme, kéo thả file, toàn màn hình, đổi tên dự án
- Status bar AI local
- Nút toàn màn hình (⛶) khi trình chiếu
- Wizard bước 4/5 + thanh AI cố định khi cuộn
- Đổi thể loại sau bước 5 không còn bị chặn

### 2026-10-20 — [docs/handoff/status/2026-10-20.md](handoff/status/2026-10-20.md)
- update_plan_3 Đợt 2 — Thinking đúng spec §7/§9 + UI Task Manager
- update_plan_3 Đợt 1 — Task Manager CPU-only + verify runtime + ẩn UI GPU
- Sửa lỗi khởi chạy Qwen3.5 4B + dọn model AI khi gỡ cài đặt
- §5.2b — Hình nền, nhân vật minh họa và âm thanh cho kho báu
- `update_plan_2` — Lưu/mở lại, gameplay, chống gọi AI trùng, lịch sử kết quả, tách 3 khu vực
- §5.2 — Bản đồ hành trình + nhiệm vụ đa dạng trong kho báu
- Phân tích giáo án chạy nền + trò chơi thứ hai từ cùng giáo án
- P7 nốt — AI tạo lại từng mục trong editor, chỉ game mở từ wizard
- P7 — Dọn đường document-assist chết
- Tối ưu quy trình AI — O6: Fast/Deep thật + benchmark trước/sau
- Tối ưu quy trình AI — O5: cache phân tích/nội dung + tạo lại từng mục
- Tối ưu quy trình AI — O4: truy xuất bằng embedding MiniLM thật
- Tối ưu quy trình AI — O3: chia nhỏ giáo án + truy xuất đoạn liên quan
- Tối ưu quy trình AI — O2: kiểm tra chất lượng nội dung bằng TypeScript
- Tối ưu quy trình AI — O1: chọn thể loại bằng TypeScript, bỏ 1 lượt Qwen
- Tối ưu quy trình AI — O0: kế hoạch chờ duyệt

### 2026-10-19 — [docs/handoff/status/2026-10-19.md](handoff/status/2026-10-19.md)
- AI-assisted Lesson-to-Game — P6: sinh nội dung 5 thể loại + editor
- AI-assisted Lesson-to-Game — P5: wizard bước 1–4 + trang "Tạo trò chơi" chỉ thủ công
- AI-assisted Lesson-to-Game — P4: analyze + recommend
- AI-assisted Lesson-to-Game — P1: contracts + adapter
- AI-assisted Lesson-to-Game — P3: AI transport + workflow
- AI-assisted Lesson-to-Game — P2: storage + draft
- Editor kéo-thả (matching + race) + xem trước đường đua
- Lịch sử trước 2026-10-19
## Bàn giao gần nhất

## Handoff — #201: bấm "Kiểm tra cập nhật" trên binary đã phát hành, chống feed GitHub thật (kèm chân không điều khiển và baseline mở app bản gói)

**Files changed.** Mới: `tests/ui/packaged-feed-check.js` (cổng CDP hai chế độ, **không** đăng vào `package.json` vì tệp đó thuộc luồng #189–#195 đang modified). docs: `docs/DECISIONS.md` (#201, và thêm một dòng trỏ ở cuối #200), `docs/STATUS.md` (mục lục + bàn giao này; khối #198 dời vào `docs/handoff/status/2026-11-05.md` **bằng script** — body đối chiếu khớp từng byte, chỉ tiêu đề đổi hậu tố `(#198)` → `(2026-11-05, DECISIONS #198)`, 5.507 → 5.530 ký tự), `docs/ROADMAP.md` (mục #201 + cập nhật nợ). **Không sửa một dòng source app nào** — việc này chỉ đo. Ngoài repo: không thêm release/tag mới nào; chỉ đọc API vô danh. Bản dựng lại **không** chép vào `release/` (thư mục đó phải mô tả đúng bản đã phát hành).

**Behavior.** Yêu cầu gốc, nguyên văn: *"go"* — tức làm tiếp việc được đề xuất cuối #200, và việc được chọn là đóng đúng hai dòng "chưa xác minh" của nó: **(3)** chưa một lần chạy `checkForUpdates()` của bản đóng gói chống feed thật, **(5)** mới dựng trên một máy nên chưa loại được khả năng build không tái lập. Lý do phải đứng ở giao điểm này: #188 đã đi hết vòng đời nhưng bằng nguồn giả loopback, #200 đã chứng minh hai lời gọi HTTP vô danh xanh — chưa process nào từng là *electron-updater + `app-update.yml` do electron-builder sinh + binary mang mã đã phát hành + api.github.com thật*. Cổng nối CDP theo URL (thư viện dùng chung chỉ biết `index.html`), bấm thật `[data-action="about-open"]`, chờ target `about.html`, đọc DOM + `aboutAPI.getState()` cùng lượt; **không** bấm "Tải về và cập nhật", **không** bấm "Khởi động lại để cài". Hai phát hiện về cách dựng, ghi lại cho người sau: (a) `electron-builder --dir` tạo `win-unpacked` nhưng **không ghi `resources/app-update.yml`** — chỉ target cài đặt mới ghi — nên đo cập nhật bắt buộc `--win nsis` rồi chạy tệp trong `win-unpacked`, tuyệt đối không chạy bộ cài; (b) bẫy `ELECTRON_RUN_AS_NODE` kế thừa từ shell làm `EduGame Studio.exe --remote-debugging-port=…` **thoát mã 9** với `bad option:` (#188 từng ghi), phải `Remove-Item Env:\ELECTRON_RUN_AS_NODE` trước. **Chân không điều khiển**: vì `AppUpdater` cache `configOnDisk` cả đời process, không thể đổi tệp giữa chừng, nên cổng chạy trên **hai process** — để nguyên `app-update.yml` (phải ra `up-to-date`) và đổi tên nó thành `.off` (phải ra lỗi, **không** được nói "đã mới nhất"). Cổng còn tự đọc `GET /repos/…/releases/latest` vô danh từ chính máy đo để bắt app và nguồn **khớp version**, và soi DOM theo luật "không secret trong Electron/renderer/bộ cài".

**Commands run.** Trong worktree detached `Temp/edugame-pack-041` tại HEAD `affde34` (cùng mã app với tag `v0.4.0`), `node_modules` nối junction: `npm run build` 0 · `npx electron-builder --dir --win` → `win-unpacked` **thiếu** `app-update.yml` (đo được) · `npx electron-builder --win nsis` → `resources/app-update.yml` **117 B** đúng nội dung (`provider github · vananz123/edu-game-ai · releaseType release · updaterCacheDirName edugame-studio-updater`), exe `188.815.360 B`, `app.asar` `50.738.287 B`, 4 lần `signing is skipped` (không ký). `node tests/ui/packaged-feed-check.js 9372` → **22/22 passed**: `file:` + `packaged=true` + `version=0.4.0`; `phase=up-to-date`, `errorKind=""` trong **1.657 ms**; badge "Ứng dụng đã mới nhất" tone `ok`, not spinning; note "Bản 0.4.0 là bản mới nhất đã công bố · kiểm tra lúc 08:55."; `lastCheckedAt` 1793843746058 → **1793843746319** sau cú bấm tay (lượt hai **329 ms**); `newVersion=""`, `percent=0`, `barVisible=false`, `updateVisible=false`, `installVisible=false`; Node đọc `releases/latest` → **200**, `tag_name=v0.4.0` khớp. Đổi `app-update.yml` → `.off`, process mới, `EDUGAME_FEED_EXPECT=error node tests/ui/packaged-feed-check.js 9373` → **13/13 passed**: `phase=error`, `errorKind=dev-mode`, **3 ms**, `ENOENT … app-update.yml` (cặp 1.657 ms / 3 ms = câu xanh đến từ mạng). Khôi phục tệp (117 B). `node tests/ui/offline-packaged-check.js 9374` → **11/11**, `attempts=0`, điều khiển dương "wrapper observes an outbound fetch". Marker `app.asar` (mở bằng `@electron/asar`, đường tách theo `\`): `dist/src/main.js` 228.406 B có `EDUGAME_BOOT_TRACE`/`app.boot.phases`/`lanSessionActive`/`backgroundPrune`/`node:fs/promises`; `ai-status.js` 20.827 B có `targetPollMs`/`POLL_IDLE_MS`; `ai-log.js` 11.063 B có `backgroundPrune` + `node:fs/promises` và **vẫn giữ** `appendFileSync`. Baseline mở app bản gói, đọc `app.boot.phases` trong `<userData>/edugame-data/logs/ai-2026-11-05.jsonl` qua 4 lượt khởi động: **1.137 · 1.138 · 1.016 · 1.034 ms** (ba lượt có `EDUGAME_BOOT_TRACE` → median **1.034 ms**), pha lượt cuối `processToMainModule 171 · vendors 133 · localRequires 142 · whenReady 52 · ensureData 50 · logWriter 2 · ipcRegistered 4 · windowCreated 103 · documentLoaded 368`, `topRequires` `zod 73 · objy v4/classic/external.cjs 67 · objy core/index.cjs 56 · lesson-prompts 55 · lesson-cache 55 · content-categories 52 · jszip 46 · object 40 · locales 37 · lesson-store 34 · lesson-contracts 32 · utf8 17`. **Tái lập:** bản dựng lại **92.490.696 B** và sha512 `e8b16923e3db9f7c…4b977a65` so với bản phát hành **92.490.714 B** / `9a6df1aeb22fafdd…33db4a4` → **lệch 18 B, không khớp**. `node --check` cổng mới OK, `file` xác nhận UTF-8; `git worktree list` sau dọn còn `main` + `.kilo/water-den`; junction gỡ bằng `rmdirSync` trước, `node_modules` repo chính còn nguyên **447** mục. Không chạy lại unit/`verify:css` vì không sửa source, còn worktree chung thì mã chưa commit của luồng khác sẽ khiến số không mô tả bản phát hành.

**What remains unverified.** (1) Vẫn **chưa cài** bản `.exe` nào: `quitAndInstall()` chưa lần nào được gọi (nợ #188 (a) giữ nguyên), đường registry/uninstall và SmartScreen của một bản cài thật chưa có bằng chứng. (2) Chưa thấy nhánh **"có bản mới"** chống feed thật — repo chỉ có 0.4.0 và app đang chạy 0.4.0, nên phải phát hành **0.4.1** mới đo được; #188 vẫn là bằng chứng duy nhất cho nhánh đó (trên loopback). (3) `win-unpacked` chạy trực tiếp **không** đồng nhất với bản đã cài (không qua wizard, không perMachine, không elevate). (4) Số của **một** máy, **một** trạng thái mạng; chưa mô phỏng mạng chậm/đứt giữa lượt (nhánh `offline` đã đo ở #188 nhưng với loopback). (5) Bản đóng gói **thiếu** `app-update.yml` được báo bằng câu "Bản bạn đang chạy không phải bộ cài đặt (nó chạy từ mã nguồn)" — đúng theo cơ chế electron-updater nhưng lạc cảnh với giáo viên; chưa sửa vì bản phát hành thật luôn có tệp này. (6) Chưa đo `%` CPU lúc nhàn rỗi và chưa chạy nhịp poll nhanh dưới tải llama.cpp thật (#197, theo luật dự án: không chạy đường AI local). (7) `docs/DECISIONS.md` + `docs/STATUS.md` vẫn chưa commit vì chứa cả text của luồng #189–#195. (8) Nợ cũ #182–#188 giữ nguyên.

**Next recommended task.**
1. **Bump 0.4.1 + phát hành tiếp** ngay khi luồng #189–#195 commit `src/index.html`: đây là cách duy nhất để (a) máy đã cài 0.4.0 thật sự nhận #196/#197/#199 và (b) nhánh "có bản mới" chống feed thật có số đo — chạy lại chính `packaged-feed-check.js` khi đó sẽ phải đổi kỳ vọng sang `available`.
2. **P7 trên máy pilot** cài từ `releases/tag/v0.4.0` (ngắt mạng, chơi game đã lưu, bấm "Kiểm tra cập nhật"): cổng #201 đã chứng minh phần mềm đọc feed thật đúng, phần còn lại là thiết bị của người khác.
3. **P2** — lazy `three.global.js` vẫn blocked chờ cùng tệp `src/index.html`; nay đã có mốc "trước" trên bản gói: `documentLoaded` **368–436 ms**.
4. Nợ nhỏ còn nguyên: `package.json.description` mojibake (nó thành FileDescription của exe), bốn dụng cụ đo chưa đăng vào `package.json` (`measure-boot`, `measure-idle-poll`, `bench-db-prepare`, `bench-ai-log-io`) — nay thêm `packaged-feed-check`; rotate token GitHub nếu dòng `ghp_…` từng nằm trong `.env.example` thật; ký Authenticode là quyết định của chủ dự án (trả phí).

## Handoff — GitHub Release 0.4.0 đầu tiên: dựng lại từ HEAD trong worktree tách biệt, không đăng bộ cài đang nằm sẵn trên đĩa (#200)

**Files changed.** Không sửa tệp nguồn nào của app. docs: `docs/DECISIONS.md` (#200), `docs/STATUS.md` (mục lục + bàn giao này; khối #197 dời nguyên văn từng byte vào `docs/handoff/status/2026-11-04.md`, đã đối chiếu 3.760 ký tự body + 941 ký tự "Next recommended task" khớp tuyệt đối), `docs/ROADMAP.md` (mục mới "GitHub Release 0.4.0 đầu tiên" + sửa nợ #188 (b) và (h) + P7). **Ngoài repo**: tag annotated `v0.4.0` → `5b87dfa6bb633de1e10c3bc1fe825f5728aa4d64` đã push; release **434658977**; ba asset. `release/` (gitignored) nhận ba tệp của bản mới, bản của #136 **không xoá** mà đổi tên `*.pre-perf-2026-11-04`.

**Behavior.** Yêu cầu gốc, nguyên văn: *"tạo bản Github release đi"*. Đây là việc chặn người dùng thật bị xếp ngoài kế hoạch hiệu năng từ #199: repo chưa release nào nên trang Giới thiệu của bản gói luôn báo `errorKind: 'feed'` (*"Chưa tìm thấy bản phát hành nào trên GitHub…"*, `src/about/about.html:286`). Hai lựa chọn hiển nhiên đều bị loại bằng số chứ không bằng ý kiến:
- **Đăng `release/Setup-0.4.0.exe` đang có**: tệp này build lúc **16:40 04/11** (`latest.yml releaseDate 2026-11-04T09:40:28.751Z`), trong khi #187/#188 commit **17:52** (chính trang Giới thiệu + `electron-updater` mà release phục vụ), #196 **21:45**, #197 **22:12**, #198/#199 sáng 05/11 — tag sẽ tuyên bố một binary không chứa bốn mục hiệu năng vừa đo và có thể không chứa cả con đường cập nhật. sha512 của nó (`748b3136…`) khớp manifest cũ nên về mặt kỹ thuật là "đăng được", nhưng phát hành sai bản rồi giải thích thì tệ hơn phát hành chậm.
- **Build tại chỗ**: worktree chung có 20 tệp `src/` + `package.json` modified của luồng #189–#195; `npm run dist:win` ở đó sẽ đóng băng công việc chưa commit của người khác vào một binary công khai không rút lại được.
⇒ Dựng `git worktree` detached tại `5b87dfa` (`git status` 0 dòng), `node_modules` nối bằng **junction** để khỏi `npm ci` (Electron 33.4.11 + NSIS đã có cache nên không tải gì thêm). `mklink /J` gọi từ Git Bash chết vì quoting, tạo bằng `fs.symlinkSync(…, 'junction')`; **gỡ bằng `fs.rmdirSync` trước khi xoá worktree** vì `rm -rf` một junction trên Windows đi xuyên vào thư mục thật và sẽ xoá sạch `node_modules` của repo chính (đã kiểm lại sau mỗi lần gỡ: 447 mục, `electron/package.json` còn). Repo **không có `gh` CLI**, nên release đi qua REST + curl; credential lấy từ Git Credential Manager bằng `git credential fill`, chỉ đọc độ dài (40 ký tự), không in giá trị, không ghi vào tệp nào của repo.

**Bốn tầng kiểm chứng, mỗi tầng trả lời một câu hỏi khác nhau.** (1) *Commit này tự dựng và tự xanh không* — trên worktree sạch: `npm run build` 0 lỗi, `node tests/run-unit.js` **80/80 (32,2 s)** (= 87 của bản làm việc trừ 7 suite `ui-*` chưa commit của luồng #189–#195), `npm run check` 0, `npm run check:renderer-globals` **64/65 scripts · 932 hàm / 7.547 call site — không undefined**, `npm run verify:css` **46/46** (bản làm việc là 64/66 · 938/7.583 và 56/56 — phần chênh đúng bằng việc chưa commit). (2) *Binary có đúng mã đã commit không* — mở `app.asar` bằng `@electron/asar`: `EDUGAME_BOOT_TRACE` + `app.boot.phases` + `lanSessionActive` (#196), `targetPollMs` (#197), `node:fs/promises` + `backgroundPrune` trong **cả** `ai-log.js` và `main.js` (#199), `about-ipc.js` (#187/#188), `app-update.yml` = `provider github · vananz123/edu-game-ai · releaseType release · updaterCacheDirName edugame-studio-updater`. (3) *Tệp phát hành còn nguyên vẹn không* — tải lại từ URL công khai: 92.490.714 B, SHA-512 `9a6df1aeb2…3db4a4` **giống từng byte** với manifest (`mm3xrrIvr9…`). (4) *Máy giáo viên vô danh đọc được feed không* — đúng hai lời gọi mà `electron-updater` sẽ đi, chạy **không token**: `GET /repos/…/releases?per_page=1` → **200** với ba asset `state=uploaded`; `GET` asset `latest.yml` → 302 rồi **200**, thân tệp đúng là manifest đã upload.

**Commands run.** `git worktree add --detach … HEAD` · `npm run build` (worktree) 0 · `node tests/run-unit.js` **80/80 (32,2 s)** · `npx electron-builder --win nsis` → `EduGame-Studio-Setup-0.4.0.exe` **92.490.714 B** + `.blockmap` **96.020 B** + `latest.yml` **356 B**, `better-sqlite3` rebuild cho ABI Electron, `signing is skipped` **bốn lần** (unsigned, đúng cấu hình hiện hành) · `certutil -hashfile … SHA512` khớp base64 trong manifest (giải mã `mm3xrr…` → `9a6df1ae…`) · `git tag -a v0.4.0 5b87dfa -m …` + `git push origin v0.4.0` → `[new tag]` · `POST /repos/…/releases` → **201**, id 434658977, `draft=false prerelease=false` · ba lần `POST uploads.github.com/…/assets?name=…` → **201 / 201 / 201**, size trả về 356 / 92.490.714 / 96.020 · `curl -sL` tải lại `.exe` → 200, 92.490.714 B, băm lại giống hệt · quét bí mật: `git grep -I -E 'ghp_[A-Za-z0-9]{25,}|github_pat_[A-Za-z0-9_]{25,}' $(git rev-list --all)` (99 commit) → **0 kết quả**; `git grep -In 'github_pat_' HEAD` → 0; `.env.example` in hình dạng giá trị (đã che): 5 dòng, toàn placeholder (`your_supabase…_service_role_key`, `your_gemini_api_key`), không còn dòng `GH_TOKEN` · gỡ junction + `git worktree remove --force` + xoá tệp scratch phiên này.

**What remains unverified.** (1) **Chưa cài bản `.exe` này lên máy nào** — kể cả máy dev (chủ dự án không cho chạy bộ cài ở đây); đây vẫn là việc của máy pilot (P7). (2) `quitAndInstall()` vẫn chưa lần nào được gọi (nợ #188 (a) giữ nguyên). (3) Chưa chạy `checkForUpdates()` của **bản đóng gói** chống feed thật — tầng (4) mới chứng minh đúng hai lời gọi HTTP mà thư viện sẽ đi, chưa phải một lần bấm nút trên máy thật. (4) Build **chưa ký Authenticode** → người cài thủ công gặp SmartScreen; khắc phục là trả phí, cần chủ dự án quyết (nợ #188 (c)). (5) Máy đã cài 0.4.0 **không** nhận được gì từ release này (`allowDowngrade = false` + cùng version): #196/#197/#199 chỉ tới giáo viên qua một bản **0.4.1**. (6) Mới dựng trên **một** máy nên chưa loại được khả năng build không tái lập; `sha512` chỉ nói tệp nguyên vẹn, không nói **ai** phát hành. (7) Không chạy lại các `ui-*` check trên worktree (cần Electron + instance thật, và chúng đọc `dist/` của bản làm việc). (8) Nợ cũ #182–#188 và của luồng #189–#195 giữ nguyên; `docs/DECISIONS.md` + `docs/STATUS.md` vẫn **chưa commit** vì chứa cả text của luồng #189–#195.

**Next recommended task.**
1. **Bump 0.4.1 + phát hành tiếp** ngay khi luồng #189–#195 commit `src/index.html` và các `ui-*` test — đó mới là bản mà giáo viên đang cài 0.4.0 nhận được qua nút "Kiểm tra cập nhật" (kèm phần đã đo #196/#197/#199).
2. **P7 / máy pilot**: cài `…/releases/tag/v0.4.0` trên máy sạch ngắt mạng, chơi một game đã lưu, bấm "Kiểm tra cập nhật" trên **bản đã cài** (lần đầu con đường xanh đi hết), rồi thử `quitAndInstall()`.
3. **P2** — lazy `three.global.js`: vẫn blocked vì `src/index.html` còn modified ở luồng kia.
4. Việc nhỏ còn treo: `package.json` `description` còn mojibake (nó thành FileDescription của exe — nên sửa **trước** bản 0.4.1), bốn dụng cụ đo chưa đăng vào `package.json`, và rotate token GitHub nếu chuỗi `ghp_…` từng nằm trong `.env.example` bản làm việc.

## Handoff — P5: đo I/O của log chẩn đoán; số ra là chỉ `prune()` đáng async hoá, còn `write()` phải giữ đồng bộ (#199)

**Files changed.** Sửa: `src/services/ai/ai-log.ts` (+39/−7 — `import fsp from 'node:fs/promises'`; `prune()` thành `async` với một lần `readdir` rồi `stat` + `unlink` **song song** cho các tệp khớp `LOG_FILE`, mỗi tệp một `try/catch`; `createAiLogWriter` không gọi `prune()` đồng bộ nữa mà gọi `startBackgroundPrune()` (bắn chạy nền, tự xoá lời hứa khi settle, `.catch(() => {})`); chữ ký `AiLogWriter` thành `prune(): Promise<void>` **và** `backgroundPrune(): Promise<void> | undefined`), `src/main.ts` (+3 — handler `diagnostics:clear` `await writer.backgroundPrune()` trước khi `clearAiLogs`), `tests/unit/ai-log.test.ts` (+63/−8 — nhánh prune thành async IIFE, thêm `seedPruneDir()`, thêm khối "prune chạy nền đua với `readRecent` / `files()` / `clearAiLogs`", và tự in `SKIP` khi `dist/` còn là bản đồng bộ thay vì đỏ vì một build chưa chạy). Mới: `scripts/bench-ai-log-io.js` (275 dòng dụng cụ đo, **không** đăng vào `package.json` vì file đó thuộc luồng khác). docs: `DECISIONS.md` #199, `STATUS.md`, `docs/ROADMAP.md`; `docs/handoff/status/2026-11-04.md` nhận bàn giao #196 (đúng ngày commit, 21:45) và hai dòng mục lục #196/#197 được dời về `### 2026-11-04`. **Không đụng `src/index.html`**, nên mục này không bị luồng #189–#195 chặn.

**Behavior.** Yêu cầu gốc, nguyên văn: *"tiếp tục tiến trình"* — sau #198, kế hoạch hiệu năng chỉ còn P2 (blocked) và P5. P5 đề nghị chuyển **đọc** (`readFileSync:184`) và **luân chuyển/ghi** (`writeFileSync:269`, `statSync`/`existsSync`/`unlinkSync`) sang async. Đã đo trước khi sửa:
- Ngưỡng đặt **trước khi đo**: `readRecent` ≥ 15.000 µs, `prune` lúc mở app ≥ 5.000 µs, bundle ≥ 15.000 µs. Dụng cụ dựng **thư mục log thật** (14 tệp, 11,1 MB, tệp hôm nay đầy trần `maxFileBytes` = 2 MB); tệp quá hạn seed **từ đầu, lùi mtime bằng `utimesSync`, rồi để yên** — ba cái bẫy thật: `prune()` so **mtime chứ không so tên tệp** (sai một trong hai thứ là phép đo thành rỗng mà vẫn in ra số), unlink một tệp vừa ghi không giống unlink tệp đã nằm im (lần đo đầu in ra 24,2 ms chỉ vì vừa ghi xong), và **một mẫu thì không tách được công việc thật khỏi nhiễu**: cửa sổ đo dựng writer là `hrtime` quanh một tick đồng bộ nên GC/anti-virus rơi đúng vào đó — bản async đã in 16.995,2 µs rồi 24.191,6 µs cho một cửa sổ chỉ còn `mkdirSync`. Harness nay nghỉ 3 giây (`EDUGAME_BENCH_SETTLE_MS`) rồi đo **ghép cặp**: `2N` thư mục stale, mỗi vòng i dựng writer trên `stale-new-i` và đo **đường cũ** (`mkdirSync` + `readdirSync` + 14× `statSync`/`unlinkSync`, đúng thân `prune()` ở HEAD) trên `stale-old-i`, đọc median của `N=9` mẫu.
- Bản **đồng bộ**, hai lần chạy, µs: `readRecent(200)` **5.141,0 / 3.647,8** · `readFileSync` đúng 2 MB đó (tham chiếu tách giá thành) **4.053,5 / 2.709,5** · `prune()` ấm không có gì để xoá **922,4 / 674,4** · `writeDiagnosticBundle(38 KB)` **1.303,6 / 1.042,3** · **dựng writer + `prune()` với 14 tệp quá hạn 6.519,2 / 6.539,6** (phần chỉ quét: 2.004,6 / 2.136,0). ⇒ **chỉ con số cuối chạm ngưỡng** — và nó nằm đúng trên đường mở app (`main.ts:830`, giữa hai mốc `ensureData` và `logWriter` mà #196 đã gắn máy đo); bẫy đo thứ ba bên dưới cho thấy cùng đường đó xuống 2,7–3,4 ms median khi đĩa nhàn, nên quyết định không đứng trên "vượt ngưỡng" mà trên *cấu trúc* khoản tiết kiệm.
- Nên **chỉ `prune()` đổi**. `readRecent`, `writeDiagnosticBundle`, `clearAiLogs` giữ đồng bộ: 3,6–5,4 ms và 1,0–1,3 ms là giá của **một cú nhấp** "Gói chẩn đoán"/"Xoá log" mà giáo viên tự gây ra và tự chờ — dưới ngưỡng, và cái giá phải trả (đổi signature, sửa caller, sửa test) đúng là cái giá #198 vừa từ chối cho 1,88 ms/phiên. **`write()` giữ nguyên 100 % đồng bộ, kể cả nhánh luân chuyển**: nó chạy mỗi dòng log, đổi sang async là đổi *thứ tự ghi đúng lúc app chết* — mất dòng cuối khi đang debug, điều chính kế hoạch đã nêu và phép đo không ủng hộ (nó là µs, không phải ms).
- **Sau khi sửa**, ba lần chạy **ghép cặp** (mỗi lần 9 mẫu, đường cũ và bản mới đo xen kẽ trong cùng phiên): main process lúc dựng writer **median 265,3 / 223,2 / 271,5 µs** (min 208,5 · max 788,2) — một `mkdirSync` lạnh + dựng lời hứa, không còn `stat`/`unlink` nào nằm trong đường chặn — trong khi **cùng máy, cùng phiên** đường cũ đồng bộ **median 3.073,3 / 2.719,6 / 3.402,2 µs** ⇒ **−91 %**, tức **2,50–3,13 ms** (so với hai mẫu BEFORE lấy lúc đĩa bận: **6,3 ms**). Nói thẳng phần bất lợi: **ngưỡng 5.000 µs chỉ bị vượt khi đĩa bận** — median đường cũ trong cửa sổ đã nghỉ yên là 2,7–3,4 ms, chỉ max của mỗi lần chạy (5.635,6 / 7.293,7 µs) vượt. Phần quét (2,0–2,4 ms) và phần xoá vẫn chạy, chỉ là chạy nền, và dụng cụ báo **đĩa còn 0/252** tệp quá hạn sau khi `await` lượt dọn ở cả ba lần. Sáu mẫu đơn trước đó (553,9–699,8 µs) là cùng bản chất phép đo ở lúc đĩa bận hơn; con số chính thức nay là median ghép cặp.
- Đường sửa này còn **bóc ra và sửa một lỗi test có sẵn**: assert prune *trước đây* chạy ngay sau `createAiLogWriter` và chỉ đúng **tình cờ** vì prune khi đó đồng bộ. Nay nhánh đó await chính `backgroundPrune()`.
- Về **đường đua** mà bản đầu của #199 ghi là "chưa có test": prune chạy nền giao tiếp với ba đường khác, và cả ba giờ đều có câu trả lời bằng code chứ không bằng lập luận. `writer.backgroundPrune()` **là** lời hứa của lượt dọn lúc khởi tạo (tự xoá khi settle), nên `diagnostics:clear` ở `main.ts:3309` chờ nó xong rồi mới `clearAiLogs` — hai lượt không unlink chồng nhau và số "đã xoá N" giáo viên nhìn thấy là số của một thư mục đã yên. `readRecent` an toàn vì prune xoá các tệp **cũ nhất** còn nó đọc đuôi mới nhất của mảng sắp theo tên (tên chứa ngày). `write()` ghi vào tên tệp **hôm nay**, thứ mà prune không bao giờ xoá. Tệ nhất nếu mọi giả định sụp: một tệp quá hạn còn sót tới lần mở app sau, không phải mất dữ liệu.

**Commands run.** `npm run build` 0 · `npm run check` (`tsc --noEmit`) 0 · `node tests/run-unit.js ai-log` **1/1** (thêm dòng `ok prune races readRecent, files and clearAiLogs`) · `node tests/run-unit.js` **87/87** (33,9 s — đúng con số của #198: `dist/tests/unit` có 88 file nhưng `lesson-store.test.js` bị loại vì cần ABI Electron và chạy riêng bằng `npm run test:native` **1/1**; bảy suite `ui-*.test.ts` của luồng #189–#195 đã nằm trong 87 đó từ trước, không suite nào của #199 làm đổi số) · `npm run check:renderer-globals` 0 undefined (64/66 scripts, **938** hàm / **7.583** call site) · `npm run verify:css` **56/56** · `node tests/manual/run-electron-node.js scripts/bench-ai-log-io.js` **mười ba lần**: hai lần bản **đồng bộ** (bảng BEFORE: 6.519,2 / 6.539,6 µs), bảy lần bản async một mẫu (553,9–699,8 µs, rồi **16.995,2 µs** — mẫu lạc tố cáo bẫy đo thứ ba), một lần N-mẫu chưa có tham chiếu (median 463,8 µs nhưng max **24.191,6 µs**), và **ba lần ghép cặp** cho các số chính thức (median bản mới 223,2–271,5 µs xen kẽ đường cũ 2.719,6–3.402,2 µs); mỗi lần in đủ bảng và tự nhận diện bản đang nạp (`prune()` async hay đồng bộ) ngay trong dòng kết luận · **đường SKIP của test mới được chứng minh thật**: vá `dist/src/services/ai/ai-log.js` cho mất `backgroundPrune` rồi chạy lại suite → in `SKIP prune race…` và vẫn exit 0, sau đó `npm run build` khôi phục · `node scripts/measure-boot.js 5` trên bản cuối: `logWriter` **2 ms** ở cả năm lần, median tổng **1.172 ms** (min 1.155, max 3.304 = lần đầu đĩa lạnh) so với 1.195 ms ở #196 — **không tuyên bố cải thiện**, vì hồ sơ đo không có tệp quá hạn nên phép đo này không thấy khoản tiết kiệm; số thật chỉ hiện trên máy giáo viên đã dùng hơn 14 ngày.

**What remains unverified.** (1) `clearAiLogs` đã được **chặn** bằng `await backgroundPrune()` chứ không còn là race, còn `readRecent`/`write()` an toàn theo **cấu trúc** (tên tệp chứa ngày, prune chỉ xoá tệp quá hạn, tệp hôm nay không bao giờ bị xoá) — test mới chứng minh hành vi khi đi theo đúng thứ tự đó, chưa có test nào cố tình dựng thứ tự xấu trong app thật; bằng chứng thực địa vẫn là log của một lần mở app có sẵn tệp quá hạn. (2) Số của **một** máy Windows có anti-virus, và **khoản tiết kiệm tuyệt phụ thuộc tải đĩa**: ngưỡng 5.000 µs chỉ bị vượt khi đĩa bận (median đường cũ lúc nhàn 2,7–3,4 ms, max mỗi run 4,7–7,3 ms), tỉ lệ −91 % thì ổn định cả ba lần chạy; máy không AV thì `unlinkSync` rẻ hơn nên con số ms nhỏ hơn nữa. (3) `logWriter` trên hồ sơ ấm vẫn 2 ms vì `mkdirSync` đồng bộ còn lại (cố ý: nó bảo đảm thư mục đã tồn tại cho `appendFileSync` đầu tiên). (4) Chưa đo bản `.exe` đóng gói. (5) Theo luật dự án, không chạy đường AI local: các dòng log do nhánh đó ghi ra chưa được tạo thật. (6) Nợ cũ #182–#188 giữ nguyên.

**Next recommended task.** Kế hoạch hiệu năng sau #199 **không còn mục nào làm được ngay**:
1. **P2** — lazy `three.global.js` (749.583 B = **29,5 %** JS renderer): vẫn blocked vì `src/index.html` đang modified trong worktree chung (luồng #189–#195). Khi mở khoá phải sửa `renderer-load-order.test.ts` + `check-renderer-undefined-globals.js` **cùng lúc** (hai regex khít là lý do P1 chết) và đo `documentLoaded` trước/sau bằng `node scripts/measure-boot.js 5`, không lấy số 400–800 ms của kế hoạch.
2. **P7** — mục `[~]` còn lại cần **máy pilot cài bản `.exe` thật** (kèm `quitAndInstall()`); máy này không cài được phần mềm nên không tự làm được.
3. Việc **ngoài kế hoạch** nhưng chặn người dùng thật: repo chưa có GitHub Release nào nên trang Giới thiệu luôn báo "chưa tìm thấy bản phát hành"; `.env.example` trong bản làm việc vẫn chứa `GH_TOKEN` thật (chưa rotate); `package.json` `description` còn mojibake; bốn dụng cụ đo (`measure-boot`, `measure-idle-poll`, `bench-db-prepare`, `bench-ai-log-io`) chưa đăng vào `package.json`.
