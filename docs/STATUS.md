# Trạng thái dự án

Bàn giao mới nhất nằm ngay trong file này (3 mục gần nhất). Các bàn giao cũ được lưu ở
`docs/handoff/status/` — mỗi ngày một file, nối thêm vào cuối file của ngày đó khi cần.
Quy ước: sau mỗi việc, chèn bàn giao mới ngay dưới tiêu đề "Bàn giao gần nhất"; nếu quá 3 mục,
chuyển mục cũ nhất vào file lưu trữ đúng ngày của nó và cập nhật mục lục.

## Mục lục bàn giao

### 2026-11-26 — #364 bán gói Pro trong app: giá + nút Nâng cấp + webhook đã xác minh (chưa mở bán)

- **Vì sao:** #362 cho hạn mức free là 10 lượt/kỳ 2 tuần nhưng **không có đường nào để trả tiền**.
  Nay đã có đường mua, chạy được đầu-cuối trong code, và **chưa bật bán** vì máy chủ thiếu hai thứ
  có tên (xem "Còn thiếu").
- **Luật tiền nằm MỘT chỗ:** `server/billing.ts` (hàm thuần) + `server/billing-provider.ts` (adapter
  PayOS). Express và Worker dùng chung, nên câu "99.000đ / 14 ngày / 500 credits" không thể lệch giữa
  hai máy chủ.
- **Tệp đã sửa/thêm:**
  - `server/billing.ts` (mới, ~300 dòng): `PERIOD_LIMITS` không đổi; thêm `billingConfig`,
    `orderCodeFor`, `orderExpiry`, `effectiveOrderStatus`, `nextPeriodEnd`, `applyPaidOrder`,
    `effectivePlan`, `webhookVerdict`, `payosSignData`, `signaturesEqual`, `orderMessage`.
    `ProviderId` nay có `none` — chưa cấu hình **không** được mặc định thành `fake`.
  - `server/billing-provider.ts` (mới): `payosLinkBody` (mô tả ASCII ≤25 ký tự), `payosWebhookFields`,
    `payosWebhookSignData`.
  - `server/migrations/2026-11-26-billing.sql` (mới, idempotent): `subscriptions` +`period_end`,
    `provider`, `provider_ref`, `price_vnd`, `started_at`; bảng `billing_orders` (`provider_ref`
    unique, status pending/paid/expired/failed, RLS chỉ user đọc đơn của mình); seed
    `server_config` giá/kỳ/credits.
  - `worker/billing.ts` (mới): `GET /v1/billing/status`, `POST /v1/billing/checkout`,
    `POST /v1/billing/webhook/payos` (không cần token), `POST /v1/billing/fake/pay` +
    `GET /v1/billing/fake/:code` (chỉ khi provider `fake` **và** `EDUGAME_ALLOW_FAKE_PAYMENTS=1`),
    `GET /v1/billing/done`.
  - `worker/supabase.ts`: `planOf` tôn trọng `period_end` (gói hết hạn tự về free), `BillingDb`
    (`subscriptionOf`/`saveSubscription`/`createOrder`/`orderByRef`/`latestOrder`/`markPaid` CAS/
    `billingReady`), `hmacHex` bằng WebCrypto.
  - `worker/index.ts`: gọi `handleBilling` TRƯỚC các nhánh `/v1/usage` + `/v1/generate`.
  - `src-tauri/src/billing.rs` (mới): `billing_from_json` (thuần, test được), `cloud_billing`,
    `cloud_checkout` (mở `checkoutUrl` bằng trình duyệt hệ thống). `src-tauri/src/api.rs` +
    `lib.rs`: hai kênh `account:billing`, `account:checkout`. `cloud.rs`: `gateway_url` →
    `pub`, thêm `client_for_billing`.
  - `src/renderer/features/account.ts`: thẻ "Gói Pro" trong panel Tài khoản —
    `accountMoney`, `accountDateShort`, `accountBillingState`, `accountProHtml`,
    `accountLoadBilling`, `accountStartCheckout` (mở trình duyệt rồi đọc lại 3 lần cách 4 giây).
  - `src/renderer/styles/components.css`: `+654 B` cho `.account-pro`, `.account-upgrade-btn`.
  - `tests/unit/server-billing.test.ts` (mới), `tests/unit/worker-billing.test.ts` (mới),
    `tests/unit/account-billing.test.ts` (mới), `tests/ui/ui-billing-check.js` (mới);
    `tests/unit/desktop-facade.test.ts` 105 → **107** lời gọi (`app` 17 → 19).
- **Đo được:**
  - `npx tsc -p tsconfig.json` sạch · `node tests/run-unit.js` **114/114** (billing: 8 + 6 + 8 nhóm
    khẳng định) · `npm run check` sạch · `verify:css` **61/61** · `check:renderer-globals`
    **1 188 hàm / 9 628 điểm gọi / 0 undefined** · `cargo test --lib billing` **4/4**.
  - Worker deploy thật: bundle **804 213 B**, **0** `node:` import, upload `200 success=true`
    etag `87d4d080…`, `/health` = `0.5.6`.
  - Live đo bằng token thật: `/v1/usage` **200** `{"plan":"free","used":5,"limit":10}`
    (không hỏng vì billing) · `/v1/billing/status` **200** với
    `configured:false`, `provider:"none"`, `missing:["EDUGAME_BILLING_PROVIDER",
    "chạy migration server/migrations/2026-11-26-billing.sql"]` · không token ⇒ **401**.
  - Trên bản `.exe` vừa dựng: `account:billing` trả đúng trạng thái trên (Rust → gateway nối được),
    `account:checkout` trả `billing_not_configured` + tên việc còn thiếu;
    `ui-billing-check` **5/5**, `ui-account-check` **23/23**.
  - Ảnh chụp panel: giá **chỉ hiện một lần** (đã sửa lỗi in giá hai lần ở hàng góc + tiêu đề), nút
    "Nâng cấp lên Pro" full-width, không cắt chữ trong thẻ.
- **Một lỗi thật đã tự gây ra và đã sửa:** deploy đầu tiên làm `/v1/usage` trả **503 cho mọi người**
  vì `planOf` đọc cột `period_end` chưa tồn tại. Nay `planOf` và `subscriptionOf` lùi về hình dạng cũ
  khi gặp cột thiếu — một tính năng chưa bật không được phép làm hỏng việc đọc hạn mức.
- **Còn thiếu (chưa mở bán được):** (1) chạy `server/migrations/2026-11-26-billing.sql` trên Supabase;
  (2) khai `PAYOS_CLIENT_ID`/`PAYOS_API_KEY`/`PAYOS_CHECKSUM_KEY` + `EDUGAME_BILLING_PROVIDER=payos`
  (+ `EDUGAME_PUBLIC_URL`) trên Worker rồi deploy lại. **Chưa đo được** đường mua thật (tạo đơn →
  chuyển khoản → gói lên Pro) vì thiếu hai thứ trên; phần đó là fixture/unit test, không phải bằng
  chứng thật.
- **Bổ sung cùng ngày — hai script để bật bán không phải nhớ gì:**
  `scripts/check-billing.js` (`npm run check:billing`) hỏi máy chủ **đang chạy** bốn câu theo đúng
  thứ tự việc (migration → cấu hình → giá/kỳ/credits → `checkoutUrl` khi thêm `--checkout`), in tên
  việc còn thiếu và thoát `1`; `scripts/deploy-worker.js` (`npm run deploy:worker`) bundle + PUT +
  secret, tự khai biến thanh toán từ `.env` khi có, và **từ chối** `--allow-fake` trên script
  `ai-gateway`. Đo: deploy lại cho **cùng etag** `87d4d080…` (bundle tất định), `check:billing`
  đỏ đúng 3 mục và nêu đúng hai việc (migration + `EDUGAME_BILLING_PROVIDER`).
- **Một mâu thuẫn về TIỀN đã sửa:** `PERIOD_LIMITS.plus` là **100** trong khi thẻ Pro bán
  **500 credits/kỳ** — khách trả 99.000đ sẽ đọc "Còn 100/100 credits". Nay `plus = 500` (đơn vị
  credits, 2 credits/lượt), đúng bằng `plan_pro_monthly_credits` trong DB và bằng giá đã bán;
  `server-quota.test.ts` đổi theo. Trần free vẫn **10 lượt**.
- **#366 — thêm cổng thứ hai VNPay, cùng luật tiền:** `server/billing-provider.ts` có
  `vnpayEncode` (urlencode kiểu PHP: dấu cách → `+`), `vnpaySignData`, `vnpayCheckoutUrl`,
  `vnpaySignatureOk` (so sánh không thoát sớm), `vnpayTime` (giờ VN `yyyyMMddHHmmss`),
  `vnpayWebhookFields`; `worker/billing.ts` thêm `GET|POST /v1/billing/webhook/vnpay` trả **RspCode
  của VNPay** (`00/01/02/04/97/99`) chứ không dùng mã HTTP của ta, và nhánh checkout **dựng URL
  tại chỗ** (không gọi API nên bước tạo đơn không hỏng vì "nhà cung cấp bảo trì").
  `hmacHexWith('SHA-512'|'SHA-256')` để PayOS và VNPay dùng chung một hàm.
- **Ba cái bẫy của VNPay đã đo được:** (1) chữ ký phải ký trên giá trị **đã encode** (ký trên giá
  trị thô thì mọi đơn có dấu cách đều bị từ chối); (2) `vnp_Amount` là tiền **× 100** — quên là bán
  99.000đ với giá 990đ, và test soát đúng `9900000`; (3) **chỉ `ResponseCode` VÀ `TransactionStatus`
  cùng `00`** mới mở gói (`00` + `02` là đã huỷ). Test `server-billing-vnpay` **8 nhóm** chạy qua
  `handle()` thật: IPN tốt → `00` + gói `plus`; gửi lại → `02`; chữ ký sai → `97` và **không** mở;
  sai tiền → `04`; đơn lạ → `01`; huỷ → `00` nhưng không mở; thiếu khoá → `99`.
- **Chi phí/điều kiện, nói trước:** VNPay cần **hợp đồng merchant** (thường phải là pháp nhân +
  website được duyệt) — chậm hơn PayOS (cá nhân/hộ KD chỉ cần CCCD, ~5 phút). Vì vậy PayOS vẫn là
  cổng mặc định để mở bán trước; VNPay là lựa chọn khi đã có pháp nhân.
- **#367 — ba con số trong đường tiền phải đến từ ĐÚNG nguồn:** (a) số ngày trao khi tiền về lấy
  từ `period_days` **của đơn** (số ngày đã bán), không lấy cấu hình lúc webhook tới — admin đổi
  14 → 7 ngày trong khi một đơn cũ còn chờ là chuyện có thật, và người đã trả 14 ngày không được
  nhận 7; đơn cũ không có số ngày thì lùi về cấu hình; (b) `period_days` được thêm vào
  `ORDER_COLUMNS` và hằng đó **được export để test đọc** — thiếu cột trong SELECT thì mọi đơn đọc
  về 0 và bug (a) quay lại âm thầm; (c) `/v1/billing/status` quảng cáo hạn mức **đang áp** từ
  `server_config.quota_pro_monthly_credits` (thêm `BillingDb.proCredits()`), env chỉ là lùi khi
  đọc lỗi hoặc giá trị 0 — trước đó thẻ ghi 500 của env trong khi engine áp con số khác.
  `tests/unit/worker-billing-sold.test.ts` (mới, **6 nhóm**): đơn bán 14 ngày + cấu hình 7 ⇒ trao
  **14**; đơn không có số ngày ⇒ 7; DB nói 800 ⇒ thẻ ghi **800**; đọc lỗi ⇒ 500; DB 0 ⇒ 500.
- **Đo được lần đầu: TOÀN BỘ vòng tiền trên gateway THẬT.** Migration đã chạy trên Supabase
  (`billing_orders` có, `subscriptions.period_end` có, ba khoá `plan_pro_*` đã seed), nên
  `missing` chỉ còn `["EDUGAME_BILLING_PROVIDER"]`. Dựng một script staging
  `ai-gateway-fake` (`--script ai-gateway-fake --allow-fake --var EDUGAME_BILLING_PROVIDER=fake`)
  rồi chạy cả vòng bằng token giáo viên thật: `status` → `configured:true` · `checkout` **200**,
  99.000đ · `fake/pay` → `applied:true, plan:"plus", periodEnd:"2026-12-10T13:48:16Z"` (đúng
  **14 ngày** từ 26/11) · `/v1/billing/status` → `plan:"plus", order:"paid"` · `/v1/usage` →
  **`unit:"credits", limit:500, cost:2`** (lần đầu tiên thấy một tài khoản ở dạng Pro) · trả lần
  hai → `applied:false`, `periodEnd` **không** đổi. Dọn: PATCH `subscriptions` về free +
  `period_end:null`, DELETE đơn, rồi đọc lại: `plan:"free"`, `unit:"generations"`, `limit:10`,
  `used:5` — **đã trả về nguyên trạng**.
- **Script staging đã bị XOÁ ngay sau khi đo** (`DELETE …/scripts/ai-gateway-fake` ⇒ 200, URL trả
  404). Lý do: nó ghi vào **cùng DB production**, nên một URL `fake` công khai là một cửa mở Pro
  miễn phí cho bất kỳ ai có token — đo xong thì cửa phải đóng, và đã kiểm tra là đã đóng.
- **`scripts/deploy-worker.js` có thêm `--var NAME=VALUE`** (lặp được): biến của riêng lần deploy
  đó, và **thắng** `.env` — nhờ vậy một script staging khai được `fake` kể cả khi `.env` đang nói
  `payos`. Không có nó thì phải bấm dashboard cho mỗi lần đo.
- **Tiếp theo:** chạy migration + khai biến của cổng đã chọn, rồi
  `node --env-file=.env scripts/check-billing.js --checkout` và một đơn 99.000đ thật (sandbox trước),
  cuối cùng chụp lại thẻ Pro ở trạng thái `active`.

### 2026-11-26 — #363 phát hành v0.5.6 (asset công khai đã trỏ gateway thật)
- **Bốn nguồn phiên bản + hai gateway cùng nhảy lên 0.5.6:** `package.json`/`package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `GET /health` của `server/index.ts`, `DEFAULT_VERSION` của `worker/index.ts` (và binding `GATEWAY_VERSION` khi upload) + test `worker-gateway` theo `0.5.6`.
- **Worker deploy lại trước khi dựng bộ cài** (nếu không `check:pilot` so sai bản): bundle 783 009 B, `0` import `node:`, upload `200 success=true` etag `470d59613f1d…`, `smoke:gateway --expect-version 0.5.6 --pilot` **4/4**.
- **Chuỗi dựng:** `tsc` sạch · unit **111/111** · `npm run build` · `verify:css` **61/61** · `build:tauri` **6 217,2 KiB** · `check:embedded` khớp · `check:pilot` **hai dòng OK** (*"gateway đang chạy là edugame-ai-gateway 0.5.6 (200)"*, URL trong 57 919 KiB exe) · `cargo tauri build`.
- **Bộ cài:** `EduGame Studio (Tauri)_0.5.6_x64-setup.exe` — **16 379 656 B**, SHA-256 `9c922f3d706ca021236046e5cfeef9969d0ea8f6db34f5e9c402a97caf863b6b`.
- **Đo bằng cách CÀI THẬT** (`/S` ⇒ `exit=0`): registry `DisplayVersion 0.5.6`, `InstallLocation D:\Temp\eg-install-check`, exe 59 308 544 B; chạy với `EDUGAME_AI_GATEWAY_URL`/`SUPABASE_URL`/`SUPABASE_ANON_KEY` **bị bóc khỏi env** ⇒ `url=http://tauri.localhost/`, **`app:info.version = 0.5.6`**, `auth:status loggedIn=true`, **`account:quota ⇒ {"ok":true,"plan":"free","month":"2026-11-19","unit":"generations","used":5,"limit":10,"cost":1}`** — tức bản phát hành đọc hạn mức 10 lượt/kỳ 2 tuần qua Worker thật.
- **Cổng trên bản đã cài:** `ui-account-check` **23/23** · `ui-editor-cloud-check` **14/14** · `ui-offline-play-check` **7/7**.
- **Phát hành:** `POST /releases` ⇒ **201**, release id **459275416**, tag `v0.5.6`; upload asset ⇒ **201**, asset id **795431144**, **16 379 656 B**; **GitHub tự báo `digest sha256:9c922f3d…` khớp đúng tệp đã dựng** (so bằng API, không bằng niềm tin).
- **Chưa kiểm / nói rõ:**
  - Chưa thấy **tài khoản Pro thật**; nhánh Pro chỉ đo bằng fixture.
  - **Chưa quan sát một lần chuyển kỳ thật** (03/12); luật kỳ 14 ngày mới chỉ có unit test + tính tay.
  - 5 mục P7 (SmartScreen "Unknown publisher", thời gian cài bằng tay, hiệu ứng đếm/so le bằng mắt, một ván offline thật, một máy **không** có WebView2) vẫn cần một người ngồi trước máy Windows sạch.
  - Tài khoản thử đang ở **5/10 lượt** của kỳ `2026-11-19`.

### 2026-11-26 — #362 hạn mức free thành 10 lượt / kỳ 2 tuần; chip tài khoản cố định ở sidebar; panel Tài khoản mới
- **Kỳ hạn mức giờ là 14 NGÀY, không phải tháng dương lịch.** `server/quota.ts`: `PERIOD_DAYS = 14`, `PERIOD_LIMITS = { free: 10, plus: 100 }`, và `usagePeriod(at)` chia trục thời gian thành các kỳ 14 ngày **tuyệt đối** kể từ 1970-01-01 UTC, trả `{key, start, end}`. `key` là ngày bắt đầu kỳ và **được ghi vào `usage_monthly.month`** (cột `text`) ⇒ **không cần migration**, không có trạng thái "lần dùng đầu" cho từng người, và không bị lệch do tháng 28/30/31 ngày. `server/index.ts` (2 chỗ) và `worker/index.ts` (`monthNow()`) nay lấy khoá từ `usagePeriod().key`; chữ "hạn mức tháng này" đổi thành "hạn mức kỳ này".
- **Free = 10 lượt / kỳ**, Plus = 100. Đo bằng node: `PERIOD_LIMITS={"free":10,"plus":100}`; 26/11 và 02/12 cùng một kỳ; 03/12 mở kỳ mới. Cổng: `tests/unit/server-quota.test.ts` thêm `periodChecks()` (kỳ đúng 14 ngày, không chồng lấn, cùng khoá trong kỳ, trần 10/100); `worker-gateway.test.ts` đổi 5 → 10 ở 4 chỗ.
- **Chip tài khoản cố định ở đáy sidebar, và nói GÓI trước tiên** (`src/renderer/features/account.ts` + `src/index.html`): avatar chữ cái, tên, **badge `FREE`/`PRO`** (`[data-account-plan]`), dòng hai `Còn 10/10 lượt`, thanh mét 4px, chevron; `chip.dataset.state` (`member|guest|unconfigured`) và `chip.dataset.plan`. Đã đăng nhập thì `refreshAccount()` **đọc luôn** `account:quota` (phép đọc, không trừ) để chip có số **trước khi** bấm vào; `accountLoadQuota()` vẽ lại cả panel lẫn chip nên hai chỗ không lệch số.
- **Panel Tài khoản vẽ lại hoàn toàn:** khách thấy thẻ mời đăng nhập (3 quyền lợi, có dòng "10 lượt miễn phí mỗi kỳ 2 tuần", nút Google, ghi chú Khách); thành viên thấy hero avatar lớn + tên + badge gói, **thẻ hạn mức** (nhãn `GÓI CỦA BẠN`, tên gói, "Còn 10/10 lượt tạo game (kỳ 2 tuần)", mét lớn, "Mỗi lần soạn câu hỏi: 1 lượt · đã dùng 0/10 · kỳ 19/11 – 02/12"), 3 trạng thái loading/lỗi/ready, nút Kiểm tra Cloud AI + Đăng xuất, sổ dùng AI, ghi chú dữ liệu ở trên máy.
- **CSS mới trong `components.css`** cho toàn bộ khối trên, gồm `html[data-theme="dark"]`, `[data-tone="low"|"pro"|"free"]`, và biến thể `.account-meter-lg`.
- **Hai lỗi bố cục do ảnh chụp + số đo bắt được (đã sửa):** (1) avatar `<img>` từ googleusercontent **không tải được trong WebView2**, để lại biểu tượng ảnh vỡ giữa khuôn mặt tài khoản ⇒ bỏ hẳn `<img>`, chỉ dùng chữ cái; (2) ở cửa sổ cao 700px, sidebar có `scrollHeight 730 > 700` nên **thẻ tài khoản bị cắt 18px ở đáy** và dòng hạn mức bị cắt chữ ⇒ sidebar thành flex column, `.sidebar-shortcuts` co lại và tự cuộn, câu trên chip rút còn `Còn 10/10 lượt`, kỳ ghi ở `title` + panel. Đo lại: `scrollHeight 700 = 700`, chip `bottom 688 < 700`, chữ không cắt (`scrollWidth == width`).
- **Đo THẬT qua worker đã deploy lại:** upload bundle mới `200 success=true`; `smoke:gateway --pilot` **4/4**; `GET /v1/usage` từ app đã cài ⇒ **`{"ok":true,"plan":"free","month":"2026-11-19","unit":"generations","used":0,"limit":10,"cost":1}`** — đúng kỳ 14 ngày, đúng trần 10.
- **Cổng trên bản cài mới** (`/S` ⇒ `exit=0`): `ui-account-check` **23/23** · `ui-editor-cloud-check` **14/14** · `ui-wizard-cloud-check` **21/21 member LIVE** (một lượt Cloud AI thật) · `ui-cloud-generate-check` **9/9** (lần đầu `provider_unavailable`, đúng cơn 503 bình thường của Gemini, lần hai 9/9) · `ui-offline-play-check` **7/7** · `tsc` sạch · unit **111/111** · `npm run check` sạch · `verify:css` **61/61** · `build:tauri` **6 217,2 KiB** · `check:embedded` khớp · `check:pilot` **OK** · `cargo tauri build`. Installer **16 381 012 B · SHA-256 `870e1f5a71903da04aafef5b…`**.
- **Ba cổng được sửa để đo đúng cái mới, không phải để dễ hơn:** `ui-account-check` nay hỏi chip **gói gì** + **còn bao nhiêu** khi đã đăng nhập (khách vẫn phải có câu trạng thái); `ui-wizard-cloud-check`/`ui-editor-cloud-check` đổi fixture 5 → 10 lượt; vòng thử lại của nhánh LIVE **không dừng ở lỗi nhà cung cấp** nữa mà chỉ dừng khi ứng dụng từ chối tại chỗ (bài ngắn / hết lượt / chưa đăng nhập) — trước đó một cơn 400/503 của Gemini bị đọc thành "wizard hỏng", và số lần thử thì bị in cứng là 3.
- **Chưa kiểm / nói rõ:**
  - Chưa từng thấy **một tài khoản Pro thật** trong bản cài này; nhánh Pro chỉ được đo bằng fixture (`Gói Plus`, `Còn 2/500 credits`, badge gradient).
  - **Chưa quan sát một lần chuyển kỳ thật** (03/12); logic kỳ mới chỉ được đo bằng unit test + tính tay.
  - Dòng `usage_monthly` cũ với khoá `2026-11` (tháng dương lịch) vẫn còn trong DB — vô hại nhưng là rác.
  - Phiên bản app **vẫn 0.5.5**; asset v0.5.5 trên GitHub vẫn trỏ `127.0.0.1` ⇒ **đừng đưa cho giáo viên**; muốn phát bản này phải cắt **v0.5.6** (cần bạn nói `go`).
