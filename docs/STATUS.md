# Trạng thái dự án

Bàn giao mới nhất nằm ngay trong file này (3 mục gần nhất). Các bàn giao cũ được lưu ở
`docs/handoff/status/` — mỗi ngày một file, nối thêm vào cuối file của ngày đó khi cần.
Quy ước: sau mỗi việc, chèn bàn giao mới ngay dưới tiêu đề "Bàn giao gần nhất"; nếu quá 3 mục,
chuyển mục cũ nhất vào file lưu trữ đúng ngày của nó và cập nhật mục lục.

## Mục lục bàn giao

### 2026-11-24 — #341 gateway nói đúng loại lỗi: thiếu hàm RPC ≠ máy chủ bận
- Đo lại sau #340: ba hàm RPC vẫn **chưa** có trong project (`PGRST202`), nên `/v1/generate` không thể thành công. Nhưng câu trả lời cũ — *"Không kiểm tra được hạn mức. Vui lòng thử lại sau."* (503) — bảo giáo viên bấm lại một việc **không bao giờ** thành công, và không nói gì cho người vận hành.
- **`server/quota.ts` (mới):** `isMissingFunction()` nhận ba dạng của cùng nguyên nhân (`PGRST202`, "could not find the function", "does not exist"); `describeQuotaFailure()` trả **500 `server_not_migrated`** cho trường hợp thiếu cài đặt và **503 `quota_unavailable`** cho sự cố tạm thời. `server/index.ts` dùng nó và ghi mã lỗi vào log.
- **Đo trên gateway thật:** `POST /v1/generate` → **500** `{"code":"server_not_migrated","error":"Máy chủ AI chưa được cài đặt đầy đủ (thiếu hàm hạn mức). Quản trị viên cần chạy tệp migration của máy chủ."}`; log: `Quota RPC error: server_not_migrated Could not find the function public.consume_generation_quota(p_month, p_user_id) in the schema cache`.
- **Kiểm tệp migration trước khi người dán:** 12 944 B / 331 dòng, **8** dấu `$$` (chẵn), 4 hàm (`consume_generation_quota`, `handle_new_user`, `credit_cost_for`, `consume_credits`), 5 bảng, không có nháy cong (thứ hay bị Word/chat làm hỏng khi dán).
- `tsc` sạch, unit **106/106** (thêm suite `server-quota`).
- **Chưa kiểm:** `/v1/generate` → 200 vẫn cần một lần chạy SQL của người vận hành; tôi không có mật khẩu Postgres, không có Supabase CLI/PAT trong repo.

### 2026-11-24 — #340 chạy gateway thật: model mặc định đã chết, nhà cung cấp trả 503, và một hàm SQL còn thiếu
- **Đo được, không suy đoán.** Chạy `server/index.ts` với `sb_secret_` thật: `/health` → 200; `POST /v1/generate` với access token THẬT (admin `generate_link` → `verify`) đi qua được bước xác thực rồi dừng ở **bước hạn mức**. Truy nguyên: `consume_generation_quota`, `consume_credits`, `credit_cost_for` **đều không tồn tại** trong project (PostgREST `404 PGRST202`) ⇒ câu "Đã chạy migration" trước đó chỉ đúng phần **bảng**.
- **Lỗi 1 (chặn sản phẩm): model mặc định đã bị Google khai tử.** `gemini-2.5-flash-lite` (gateway) và `gemini-2.5-flash` (app) trả `404 — "This model is no longer available to new users"` trên **cả** `:generateContent` và endpoint tương thích OpenAI. Đã đổi cả hai về `gemini-3.5-flash-lite` (đo được 200 ở cả hai endpoint) và ghi lý do ngay tại dòng đổi.
- **Lỗi 2 (độ bền): nhà cung cấp trả `503 UNAVAILABLE` theo đợt** — có lúc **mọi** model 3.x đều 503, vài phút sau lại 200 với đúng yêu cầu đó. Gateway cũ bỏ cuộc sau một lượt ⇒ giáo viên nhận "Dịch vụ AI đang gặp lỗi" vì sự cố 2 giây của Google. Nay: `server/gemini.ts` (mới) thử lại tối đa 3 lượt với 400 ms / 1200 ms cho 429/5xx, **không** thử lại 4xx của mình; `tests/unit/server-gemini.test.ts` chốt hợp đồng đó.
- **Bằng chứng sống:** `requestGameJson` gọi Gemini thật cho kết quả `attempts: 2` — lượt đầu 503, lượt hai ra JSON trò chơi hợp lệ (3 câu, 3 phương án, `correctOptionId`, 100 điểm) trong 4,6 s. Cơ chế thử lại vừa cứu một request thật, không phải một giả thuyết.
- **Sửa tệp migration:** thêm khối `000b` chép `consume_generation_quota` (nguyên văn `server/schema.sql`, giữ hạn mức 5/100) để **một tệp là đủ** khi dựng project sạch — cùng lý do với khối `000` ở #335.
- `tsc` sạch, unit **105/105** (thêm suite `server-gemini`), `cargo test --lib` 170/170 (không đổi Rust).
- **Chưa kiểm:** `POST /v1/generate` → 200. Nó bị chặn bởi đúng ba hàm SQL còn thiếu, và tôi **không thể tự chạy DDL**: không có mật khẩu Postgres, không có Supabase CLI/access token trong repo. Cần một lần dán `server/migrations/2026-11-24-account-credits.sql` vào SQL Editor.

### 2026-11-24 — #339 đăng nhập Google THẬT trên bản đóng gói không có biến môi trường (đóng khe cuối của #338)
- Chạy `edugame-studio-tauri.exe` với `SUPABASE*`/`GEMINI*` đã xoá khỏi môi trường và profile WebView2 sạch ⇒ bấm đăng nhập ⇒ **`loggedIn: true`** (`xathiennghiep@gmail.com`) sau **56 s**, chip đổi sang `member` không reload, promise của lệnh trả `oke`. Log OAuth chỉ có **đúng một** callback được chấp nhận. Khe "blind chưa đăng nhập" của #338 đã đóng.
- Mở lại tiến trình mới (cùng profile, không biến môi trường): phiên đọc lại từ DPAPI ⇒ `loggedIn: true` ngay lúc mở. Cổng `ui-account-check` ở chế độ `EDUGAME_ACCOUNT_BLIND=1` và trạng thái **member**: **16/16**.
- Tệp phiên vẫn chỉ có khoá `cipher` (blob 2504 kí tự), **không** có chuỗi token nào: đúng lời hứa của #335, đo lại trên bản mới.
- **Chẩn đoán sai của tôi, ghi lại:** trong lúc dò cổng loopback tôi tự gọi `?code=ma-gia…` khi một lượt đăng nhập thật đang chờ ⇒ app thử đổi **hai** mã trên cùng một lượt, Supabase trả `404 invalid flow state, no valid flow state found`, và tôi suýt kết luận "exchange hỏng". Lượt chạy sạch sau đó thành công ở lần đầu. Xem DECISIONS #339.
- **Sửa một câu thông báo sai đường:** nhánh 404 nói "Máy chủ đăng nhập không tìm thấy (kiểm tra SUPABASE_URL)" — đó là chỉ dẫn cho lập trình viên, còn ca thật là mã đã dùng/hết hạn. Nay: "Máy chủ đăng nhập không nhận phiên này (mã đăng nhập có thể đã dùng hoặc đã hết hạn). Thử đăng nhập lại." Test `auth_errors_are_translated_with_the_server_detail` có thêm đúng ca 404 đo được.
- `cargo test --lib` **170/170**, `cargo tauri build` OK. Máy đang ở trạng thái **đã đăng nhập**.

### 2026-11-24 — #338 cấu hình cloud nhúng lúc biên dịch: bản cài biết Supabase mà không cần biến môi trường
- **Vấn đề:** `CloudConfig::from_env()` đọc `SUPABASE_URL` / `SUPABASE_ANON_KEY` lúc chạy. Trên máy dev thì được, trên máy giáo viên thì không: ở đó không có `.env`, không có biến môi trường, và không ai mở terminal để đặt chúng. Bản cài vì thế sẽ luôn trả `configured: false` — đúng lúc cần đăng nhập nhất.
- **Cách làm:** `src-tauri/build.rs` đọc `.env` ở gốc repo (nếu có) và phát `cargo:rustc-env=EDUGAME_SUPABASE_URL|…_ANON_KEY`; `auth.rs` đọc bằng `option_env!`. **Biến môi trường lúc chạy thắng giá trị nhúng** ⇒ dev vẫn trỏ sang project khác được, không phải sửa tệp. Không có khoá thì `option_env!` là `None` và app nói "chưa cấu hình", không nhúng chuỗi rỗng.
- **Danh sách trắng, không phải danh sách đen:** `build.rs` chỉ biết hai tên. `_SERVICE_ROLE_KEY` (quyền ghi toàn bộ dữ liệu) và `GEMINI_API_KEY` (tiền API) **không** đi vào app. Test `only_the_publishable_pair_is_read_at_build_time` đọc đúng khối `const EMBEDDED` và chốt điều đó.
- **Đo được, không phải tin:** cổng `ui-account-check` có thêm chế độ `EDUGAME_ACCOUNT_BLIND=1` — launcher xoá mọi biến `SUPABASE*`/`GEMINI*` và dùng profile WebView2 sạch. Kết quả: **16/16**, trong đó `authStatus = {configured: true, loggedIn: false, problem: null}`. Đây là bằng chứng duy nhất rằng cấu hình nằm **trong binary**.
- **Bằng chứng thứ hai, trên tệp:** `grep -a -c` trên `edugame-studio-tauri.exe` → `sb_publishable_` **1**, host project **1**, `sb_secret_` **0**, `AIza` **0**, `SUPABASE_SERVICE_ROLE` **0**. Khoá công khai có mặt, khoá bí mật không.
- `cargo test --lib` **170/170** (168 + 2 mới), `cargo tauri build` OK, `check-ui-test-syntax` 63 tệp OK.
- **Chưa kiểm:** lượt đăng nhập Google **trong chế độ blind** — trình duyệt đã mở nhưng chưa có người bấm chọn tài khoản trong 5 phút của cửa sổ loopback, nên nó hết hạn. Cùng code path, cùng giá trị khoá đã đăng nhập thật thành công ở #336/#337, nhưng lần chạy "không biến môi trường" thì **chưa** đi hết.

### 2026-11-24 — #337 chip tài khoản + panel Google (Phase 1 có UI), và 3 lỗi thật do cổng đo bắt
- **UI:** `src/renderer/features/account.ts` (mới) — chip ở đáy sidebar (thay khối "GV / Giáo viên" tĩnh) + panel. Bốn trạng thái đo được qua `data-state`: `member · guest · unconfigured · unknown`. Chế độ **Khách là hợp lệ**: không màn hình chặn nào, thư viện vẫn vẽ 9 thẻ, game đã lưu vẫn chơi.
- **Hợp đồng:** 7 lời gọi mới trong façade (`authStatus`, `authSession`, `authSignIn`, `authRefresh`, `authSignOut` + hai `stream`: `onAuthSessionChanged`, `onAuthLoggedOut`) ⇒ 95 → **102**; `app` 8 → 15 (GROUP_COUNTS sửa kèm lý do). Năm lệnh bọc mới trong `api.rs` (`get_auth_status`, `get_auth_session`, `start_auth_oauth`, `refresh_auth_session`, `sign_out_auth`) + 5 kênh trong `INVOKE_CHANNELS`/`dispatch`.
- **Lỗi 1 (bảo mật, cổng bắt): token đi vào renderer.** `auth_get_session` serialize cả `access_token`/`refresh_token`. Sửa: kiểu riêng `PublicSession` (không có trường token) là kiểu trả về của **mọi** lệnh `auth:*`, và event `auth:session-changed` cũng chỉ phát bản rút gọn. Test Rust chốt: payload không chứa `access_token`/`refresh_token`.
- **Lỗi 2 (dữ liệu, cổng bắt): đổi tên trường của kiểu LƯU TRÊN ĐĨA.** Thêm `rename_all = "camelCase"` vào `SessionInfo` làm tệp phiên cũ (snake_case) không đọc lại được; tệ hơn, `auth_status` nuốt lỗi và báo "Khách". Sửa: `SessionInfo` giữ **snake_case = định dạng tệp** (có test `session_blob_format_stays_snake_case`), `AuthStatus` có thêm `problem` để nói ra "tệp phiên có nhưng không đọc được", UI hiện trạng thái `unknown` + nút "Xoá phiên cũ" thay vì nói dối.
- **Lỗi 3: chip không tự cập nhật khi phiên đổi ngoài panel.** Đăng nhập qua đường khác `authSignIn` thì chip vẫn ghi "Khách". Sửa: hai kênh `stream`, và Rust phát event bằng **đúng chuỗi kênh** (`auth:session-changed`, `auth:logged-out`) thay vì `auth://…`. Đo lại: đăng nhập xong chip đổi sang `member` **trong 9 s mà không reload**.
- **Cổng mới `tests/ui/ui-account-check.js` — 15/15 ở CẢ BA trạng thái thật:** `unknown` (tệp phiên camelCase cũ), `member` (đăng nhập Google thật, payload `userId,email,displayName,avatarUrl,expiresAt`), `guest` (sau khi bấm "Đăng xuất" trong panel: chip → Khách, tệp phiên **bị xoá**). Giá trị kỳ vọng lấy từ `authStatus` thật, không hard-code (#320/#321).
- Kiểm khác trên binary `cargo tauri build`: unit **104/104**, `cargo test --lib` **168/168**, `verify:css` **61/61**, `check:renderer-globals` 1144 hàm / 9286 call site / 0 undefined, `ui-page-head-check` **6/6**, `ui-library-stagger-check` **8/8**.
- **Chưa kiểm:** `npm run tauri:check` — binary do chính script đó dựng (`cargo build --release`, không qua CLI) phục vụ `http://localhost:5173/`, mà cổng chỉ nhận `index.html`/`tauri.localhost`, nên nó dừng ở "no index.html page target". Đây là khe của harness, không phải của #337; cần chạy lại với binary do `cargo tauri build` sinh ra.

### 2026-11-24 — #336 đăng nhập Google chạy THẬT (lần đầu), và hai lỗi chỉ lần chạy thật mới lộ
- Supabase project + Google provider đã bật; đo trước khi đăng nhập: `/auth/v1/settings` → `google: true`, `/auth/v1/authorize?provider=google` → **302** sang `accounts.google.com`, và **cả cổng cố định 8420 lẫn cổng ngẫu nhiên 51999** đều được allow list nhận ⇒ wildcard `http://127.0.0.1:*` đúng như đã khai.
- **Đăng nhập thật thành công**, hai lần liên tiếp: `auth_start_oauth` → trình duyệt hệ thống → callback → `auth_status` = `{configured:true, logged_in:true, email:…}` trong **8–16 s**. Phiên sống qua **khởi động lại app** (giải mã DPAPI đọc từ đĩa). `profiles` được trigger tạo tự động (có `display_name` từ Google). `auth_refresh_session` trả phiên còn hạn.
- **Lỗi 1 (chặn hoàn toàn đăng nhập): Supabase PKCE trả về `code` mà KHÔNG kèm `state`.** Cổng loopback coi "thiếu `state`" là tab lạc nên trả 204 và chờ tiếp → phiên chết sau 5 phút. Sửa: nhận `code` khi vắng `state` (ràng buộc thật là `code_verifier` trong RAM, `code` lạ không đổi được thành token); `state` **khác** vẫn bị từ chối như tín hiệu CSRF.
- **Lỗi 2: `auth_logout` ghi `null` vào `auth-session.json` thay vì xoá tệp** → sau khi đăng xuất vẫn còn dấu vết máy này từng có tài khoản. Sửa: xoá hẳn tệp (NotFound = trạng thái đích). Đo lại: sau logout **không còn tệp**.
- Đã kiểm tra tệp phiên: chỉ có khoá `cipher`, **không có `access_token` dạng rõ** trên đĩa.
- `cargo test --lib`: **165/165** (thêm 2 test: `loopback_ignores_a_callback_without_any_parameter`, `callback_verdict_only_aborts_on_our_own_error`).
- Bài học ghi ở DECISIONS: bản sửa đầu tiên dựa trên **phỏng đoán** ("request không tham số"), sai; dòng log thô ở biên mới chỉ ra `?code=` không `state`. Chẩn đoán ở biên phải **ghi lại dữ liệu thật** trước khi sửa.

### 2026-11-24 — #335 Phase 1 cloud auth: PKCE + loopback + phiên DPAPI (Rust), và migration DB
- Đọc `docs/archive/specs/cloud-auth-plan.md` (1068 dòng) rồi **đối chiếu với mã thật** trước khi viết: kế hoạch mô tả schema sai ở ba chỗ (xem DECISIONS #335) — tệp SQL mới làm theo schema thật, không theo kế hoạch.
- **`src-tauri/src/auth.rs` (mới, 800 dòng, 16 test):** PKCE `S256` (vector RFC 7636), `state` 32 hex, loopback `127.0.0.1:0` + `GET /auth/callback` (một kết nối sai `state` bị **bỏ qua**, không làm hỏng phiên), đổi `code` → token qua `POST /auth/v1/token?grant_type=pkce`, refresh token, và phiên lưu bằng **DPAPI** (`secrets::protect_secret`) xuống `auth-session.json` — test khẳng định tệp đã lưu **không chứa token rõ**.
- Năm lệnh mới trong `invoke_handler`: `auth_status`, `auth_get_session`, `auth_start_oauth`, `auth_refresh_session`, `auth_logout`; phát event `auth://session-changed` / `auth://logged-out`. Mở trình duyệt bằng `rundll32 url.dll,FileProtocolHandler` (không qua shell, nên `&` trong URL không bị hiểu là ngăn cách lệnh).
- **Chưa cấu hình thì nói thẳng:** `SUPABASE_URL` + `SUPABASE_ANON_KEY` đọc từ môi trường; thiếu một trong hai thì mọi lệnh trả câu tiếng Việt "Cloud AI chưa được cấu hình trên máy này… Bạn vẫn dùng được Local AI" thay vì im lặng. Máy này **không có** hai biến đó (`.env` chỉ có `GH_TOKEN`), nên trạng thái hiện tại là `configured: false` — đúng như phải thế.
- **`server/migrations/2026-11-24-account-credits.sql` (mới):** `profiles` + trigger idempotent, `server_config` (hạn mức/giá credits nằm ở DB, không hard-code), `ai_usage_log` (không có cột nội dung bài học), thêm `credits_used`/`credits_limit` vào `usage_monthly` **giữ nguyên** cột `generations` cũ, và `consume_credits()` có `FOR UPDATE` + chống trùng theo `idempotency_key`. `consume_generation_quota` cũ giữ nguyên để gateway hiện tại không gãy.
- `cargo test --lib`: **163/163** (147 cũ + 16 mới). Lỗi thật đã sửa trong lúc làm: `reqwest` ở đây chỉ bật `stream` nên **không có `.json()`** → gửi body bằng chuỗi; và một test của chính tôi kỳ vọng sai (`%2B` là dấu cộng, không phải dấu cách) — sửa kỳ vọng, không sửa bộ giải mã.
- **Chưa có UI.** Bước tiếp theo là `auth.ts` + trang Account (Guest mode) + đưa năm kênh này qua façade `desktop.call`; và cần quyết định **khoá Supabase đi vào bản cài bằng đường nào** (biến môi trường chỉ đúng khi chạy từ mã nguồn).

### 2026-11-24 — #334 Bản bump 0.5.3 thiếu ba chỗ đồng bộ, và một hiệu ứng bị chạy HAI lần
- Bản `02641b1` (bump 0.5.3) đổi `package.json` + `Cargo.toml` + `tauri.conf.json` nhưng **bỏ sót ba chỗ**, và mỗi chỗ đều có cổng bắt được:
  1. `package-lock.json` vẫn `0.5.2` ⇒ `brand-assets.test` đỏ (`lock.version` lệch);
  2. `server/index.ts` `/health` vẫn trả `version: '0.5.2'` ⇒ cùng test đỏ ở khẳng định thứ hai (test này đọc **ba** nguồn sự thật, không phải một);
  3. `tests/manual/verify-css.js` còn ghim `page-fade-in … opacity:.88` trong khi CSS mới bắt đầu từ `opacity:0` ⇒ `verify:css` **60/61**.
- Sửa: `npm install --package-lock-only` (lock = 0.5.3), `/health` = `0.5.3`, và cổng CSS ghim **giá trị MỚI** (`opacity:0;transform:translateY(10px)`) kèm ghi chú vì sao (0.88 ở 0.18s gần như không thấy). `verify:css` **61/61**, unit **104/104**.
- **Một lỗi thật do hai cơ chế chồng nhau:** `libraryCardHtml` được thêm `style="--i:${index % 9}"`, nhưng `--i` chỉ có tác dụng với `.game-card` (`animation-delay:calc(var(--i,0)*55ms)`) — mà `.game-card` nằm **bên trong** `.lib-item`, còn `.lib-item` đã có stagger riêng bằng `:nth-child` (#325). Kết quả: thẻ thứ 9 nhận **hai** độ trễ cộng lại (0,24s của khung + 0,44s của thẻ), phần khung (kèm ô chọn) hiện trước còn thẻ bên trong vẫn trong suốt. Bỏ `style="--i:…"`; `ui-library-stagger-check` vẫn **8/8** bằng `:nth-child` thuần CSS — đúng như #325 đã chốt.
- **Dựng lại từ target rỗng** (đã xoá 7,0 GB ở #330): `npm run build` + `build:tauri` + `build-embedded-js` + `cargo tauri build` chạy sạch — **không cần** mẹo xoá dòng 7 nữa, vì `tauri.conf.json` giờ đã dùng `devUrl` và **đã được commit** (`src-tauri/tauri.conf.json` sạch trong `git status`, hash `2d15e8e6…`).
- Installer v0.5.3 (dựng lạnh): **16 297 788 byte** / 24-11 **17:43** / SHA-256 `0ac9540000c42d77513a088d3b36c78c44dfe1f5701f31c1c8cf75f8f239afbc`.
- Cổng xanh trên binary 0.5.3: library-stagger **8/8** · match-flash **6/6** · wizard-motion **8/8** · page-head **6/6** · answer-mode **219/219** · play-surface **812/812** · result-cascade **9/9** · memory-flip **9/9** · stage **179/179** · item-assets **157/157** · question-template / editor-art / library-paging / project-selection pass · unit **104/104** · `verify:css` **61/61** · `check:renderer-globals` **1132 hàm / 9202 lời gọi, 0 undefined** · `check:embedded` khớp (6217.2 KiB).
- **Đã phát hành 0.5.3:** tag annotated **`v0.5.3`** (trỏ `5757d09`) + GitHub Release `https://github.com/vananz123/edu-game-ai/releases/tag/v0.5.3`, kèm asset `EduGame.Studio-0.5.3-x64-setup.exe` (**16 297 788 byte**, `state: uploaded`). GitHub tự tính `digest: sha256:0ac95400…f239afbc` — **khớp** byte dựng ở máy; link tải công khai trả `HTTP 200` + `Content-Length: 16297788`. Giờ có ba release công khai: v0.5.1, **v0.5.2**, **v0.5.3**.

### 2026-11-24 — #333 Phát hành v0.5.3 — UI polish hoàn chỉnh
- **Version bump:** `package.json`, `tauri.conf.json`, `Cargo.toml` → `0.5.2 → 0.5.3`.
- **Sửa breaking change tauri-build v2.7.4:** `tauri.conf.json` field `devPath` → `devUrl` (trường cũ bị loại khỏi schema v2, gây `failed to run tauri-build`).
- **Build:** `npm run build:tauri` (174 tệp, embedded 6217 KiB) → `node scripts/build-tauri-release.js` (Rust `4m53s`) → `cargo tauri build --bundles nsis` (NSIS `4m03s`).
- **Installer:** `EduGame.Studio-0.5.3-x64-setup.exe` — **16 305 958 byte** (15.55 MiB) / 24-11 **16:36** / SHA-256 `8cf145d278565056c65fc178425a839166f46ade6dec0902b5ef6c2c1ccdc212`.
- Lưu tại: `%TEMP%\edugame-release-v0.5.3\` (kèm `SHA256.txt`).
- **Nội dung v0.5.3** (từ #331–#332): page-fade rõ hơn, toast exit animation, treasurePulse mạnh hơn, game-card hover lift, library card stagger, question slide-in reset mỗi câu, search focus ring dark-mode.
- **Chưa xác minh bằng cổng UI** trên binary mới.
- **Việc tiếp theo:** tag git `v0.5.3`, đăng GitHub Release.

### 2026-11-24 — #332 S4-3: Search focus ring rõ hơn + dark-mode
- **File:** `src/renderer/styles/components.css` (1 chỗ, +4/−1 dòng).
- `.lib-search` thêm `transition` mượt; `:focus-within` border `#6258e8`, ring alpha `0x28`; dark-mode rule mới.
- Tests: **104/104** xanh.

### 2026-11-24 — #331 UI/UX: 6 cải tiến animation & readability còn lại
- Page fade `opacity 0→1`, toast exit gap 220ms, treasurePulse scale 1.12 + ring, game-card hover lift, library card stagger `--i × 55ms`, question slide-in reflow reset mỗi câu.
- Tests: **104/104** xanh.

*(#329–#330 đã archive → `docs/handoff/status/2026-11-24.md`)*
