# Triển khai gateway Cloud AI (#359, #360)

Tài liệu này mô tả **cách** đưa gateway lên một host thật (`worker/` trên Cloudflare, hoặc
`server/` trong Docker) để bộ cài không còn trỏ
`127.0.0.1`. Nó **không** tạo tài khoản, **không** đăng ký dịch vụ trả phí: chọn host là một
quyết định có tiền, nên nó thuộc về người vận hành (xem bảng chi phí ở dưới).

## 1. Gateway cần gì

| Biến | Vì sao | Ghi chú |
|---|---|---|
| `SUPABASE_URL` | xác thực token người dùng | công khai |
| `SUPABASE_ANON_KEY` | `auth.getUser(token)` | khoá publishable, công khai |
| `SUPABASE_SERVICE_ROLE_KEY` | đọc/ghi `usage_monthly`, `subscriptions`, `ai_usage_log` | **bí mật tuyệt đối** |
| `GEMINI_API_KEY` | gọi model | **bí mật tuyệt đối** |
| `GEMINI_MODEL` | đổi model khi nhà cung cấp bận | mặc định `gemini-3.5-flash-lite` |
| `PORT` | cổng lắng nghe | host thường tự gán |

Bốn khoá đầu **không bao giờ** đi vào binary của app. App chỉ mang `SUPABASE_URL`,
`SUPABASE_ANON_KEY` và `EDUGAME_AI_GATEWAY_URL` (xem `src-tauri/build.rs`).

## 2. Bốn cách chạy, chọn theo túi tiền

| Cách | Chi phí tham khảo | Khi nào hợp |
|---|---|---|
| **Cloudflare Workers** (`worker/`) | 0 (free 100k request/ngày) | khuyến nghị cho pilot: không cần máy nào, không ngủ, không phải tự lo HTTPS |
| VPS nhỏ (1 vCPU / 1 GB, Docker) | ~4–6 USD/tháng | ổn định, tự quản lý; cần HTTPS (Caddy/nginx + Let's Encrypt) |
| PaaS có free tier (Render, Fly, Railway…) | 0 → ~5–7 USD/tháng | thử nhanh; free tier thường **ngủ** sau vài phút im lặng |
| Máy của chính trường + Cloudflare Tunnel | 0 USD/tháng | pilot 1–10 giáo viên; phụ thuộc một máy bật 24/7 |

**Một điểm phải nói trước:** free tier có thể "ngủ". Lần gọi đầu tiên sau khi ngủ mất vài
chục giây, mà `reqwest` trong app chờ **120 giây** — nên nó vẫn đúng, nhưng giáo viên sẽ thấy
"đang tạo…" lâu bất thường ở lần đầu. Với pilot thật, nên dùng gói luôn thức.

## 3. Chạy trên Cloudflare Workers (không cần máy nào) — `worker/`

Bản Workers giữ **đúng hợp đồng** của `server/` và **dùng lại chính** `server/quota.ts`,
`server/usage-log.ts`, `server/gemini.ts`. Nên đơn vị bị trừ (lượt hay credits), giá một lần
gọi, và luật "một lần bấm = một dòng sổ" **không thể lệch nhau** giữa hai bản — chỉ có phần
vận chuyển HTTP là viết lại.

```bash
npx wrangler deploy -c worker/wrangler.toml                    # worker tên `ai-gateway`
npx wrangler secret put GEMINI_API_KEY -c worker/wrangler.toml
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY -c worker/wrangler.toml
```

Biến **không** bí mật (dashboard → Settings → Variables and Secrets): `SUPABASE_URL`,
`SUPABASE_ANON_KEY`, tuỳ chọn `GEMINI_MODEL`, `GATEWAY_VERSION`.

### Không có `GATEWAY_TOKEN`, và không có `ALLOWED_TABLES`

Hai thứ đó là của một gateway kiểu khác, và cả hai đều không dùng được ở đây:

- **`GATEWAY_TOKEN`**: app gửi **token đăng nhập của giáo viên** (`Authorization: Bearer`), và
  worker kiểm token đó với Supabase bằng **anon key**. Một khoá chung nhúng trong bộ cài là
  khoá công khai — ai cài cũng đọc được — nên nó không được tồn tại.
  *Đo được (#360):* worker cũ trả `401` cho một JWT Supabase **hợp lệ** trên cả ba đường, tức
  là app không thể đăng nhập qua nó dù secret có đủ.
- **`ALLOWED_TABLES`**: sản phẩm này **không lưu trò chơi trên cloud**. Trò chơi nằm ở máy
  giáo viên (SQLite + `.egame`). Gateway chỉ chạm **bốn** bảng: `subscriptions`,
  `usage_monthly`, `ai_usage_log`, `server_config`. Danh sách `lessons, questions, game_scores`
  không tồn tại và không nên tồn tại; một proxy bảng chung chính là cánh cửa lưu game lên cloud
  mà ta đang không mở.

### Giới hạn tần suất

Đặt ở tầng Cloudflare (WAF rate limit theo IP, ví dụ 30 request/phút) là đủ cho pilot. Hạn mức
**theo người** đã nằm trong dữ liệu (`usage_monthly` + CAS), nên một IP chung của trường không
làm giáo viên này tiêu lượt của giáo viên kia.

## 4. Chạy bằng Docker

```bash
docker build -t edugame-gateway .
docker run -d --name edugame-gateway -p 8787:8787 \
  -e SUPABASE_URL=… -e SUPABASE_ANON_KEY=… \
  -e SUPABASE_SERVICE_ROLE_KEY=… -e GEMINI_API_KEY=… \
  edugame-gateway
```

`Dockerfile` cài `--omit=dev`, chạy bằng `USER node`, và có `HEALTHCHECK` gọi `/health`.
`.dockerignore` **chặn `.env`** — một image có khoá bí mật là một image ai kéo cũng có quyền
ghi toàn bộ dữ liệu người dùng.

## 5. Kiểm tra gateway vừa dựng (không tiêu một lượt nào)

```bash
npm run smoke:gateway -- https://ai.example.com --expect-version 0.5.5
```

Bốn dòng, đúng bốn câu app sẽ hỏi: `/health` trả `ok` + đúng phiên bản, và `/v1/usage` cùng
`/v1/generate` **từ chối người không có token** (`401`). Cổng này **cố ý không gọi AI**: một
lần smoke test không được tiêu tiền của giáo viên. Thêm `--pilot` để buộc `https`.

## 6. Dựng bộ cài trỏ vào gateway đó

```bash
# .env chỉ dùng cho bước dựng này
EDUGAME_AI_GATEWAY_URL=https://ai.example.com
npm run build && npm run build:tauri && npm run check:embedded
npm run check:pilot            # FAIL nếu URL còn là http/localhost
(cd src-tauri && cargo tauri build)
```

`check:pilot` là cổng phát hành: nó đọc **byte của `.exe`** và từ chối nếu
- URL không phải `https`,
- URL trỏ `localhost` / `127.0.0.1` / `0.0.0.0`.

## 7. Bật bán gói Pro (#364)

Thứ tự dưới đây không phải sở thích: gateway đọc bảng đơn và cột `period_end`, nên **migration
phải chạy trước** khi khai cấu hình nhà cung cấp. Bỏ qua bước 1 thì `/v1/billing/status` trả lời
`configured:false` kèm câu *"chạy migration server/migrations/2026-11-26-billing.sql"* — nút Nâng cấp
không xuất hiện, và đó là trạng thái đúng (một máy chủ chưa bán được thì không được mời mua).

1. **Chạy migration** `server/migrations/2026-11-26-billing.sql` trong Supabase → SQL Editor.
   Idempotent: thêm cột vào `subscriptions`, tạo `billing_orders` (RLS chỉ cho người dùng đọc đơn của
   mình), seed `plan_pro_price_vnd` = 99000, `plan_pro_period_days` = 14, `plan_pro_monthly_credits` = 500.
2. **Khai biến trên Worker** (Settings → Variables and Secrets):
   `EDUGAME_BILLING_PROVIDER` = `payos`, `EDUGAME_PRO_PRICE_VND` = `99000`,
   `EDUGAME_PRO_PERIOD_DAYS` = `14`, `EDUGAME_PRO_CREDITS` = `500`,
   `EDUGAME_PUBLIC_URL` = `https://ai-gateway.dovanan-bth2017.workers.dev`, và ba secret
   `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY` (lấy ở trang merchant PayOS).
   Đặt webhook URL bên PayOS = `https://<gateway>/v1/billing/webhook/payos`.
3. **Deploy lại Worker** bằng script trong repo (nó tự khai đúng bộ binding, kể cả biến thanh
   toán đọc từ `.env`, và **không** bao giờ tự bật cờ fake):
   ```bash
   node --env-file=.env scripts/deploy-worker.js
   node --env-file=.env scripts/check-billing.js              # chỉ đọc
   node --env-file=.env scripts/check-billing.js --checkout    # tạo một đơn thật
   ```
   `check-billing` hỏi máy chủ ĐANG CHẠY, theo đúng thứ tự việc: migration đã chạy chưa → đã khai
   nhà cung cấp chưa → giá/kỳ/credits đọc được chưa → (nếu `--checkout`) có trả về `checkoutUrl`.
   Nó in ra tên việc còn thiếu, và thoát `1` khi chưa bán được — nên dùng được trong CI.
4. **Một đơn thử**: bấm "Nâng cấp lên Pro" trong panel Tài khoản → trình duyệt mở trang PayOS →
   chuyển khoản → webhook về → `/v1/billing/status` chuyển `plan:"plus"`, `periodEnd` = hôm nay + 14
   ngày, và `/v1/usage` đổi sang `unit:"credits"`, `limit:500`.

**Đừng bật `EDUGAME_ALLOW_FAKE_PAYMENTS` trên máy chủ thật.** Cờ đó mở hai đường `POST /v1/billing/fake/pay`
và `GET /v1/billing/fake/:code` để đo mà không cần tài khoản merchant; với nó, bất kỳ ai có token đều
được Pro miễn phí. Cờ chỉ có tác dụng khi provider là `fake`.

## 8. Những lỗi đã gặp khi làm việc này (để không gặp lại)

- **Chạy gateway ở máy mà quên `source .env`** ⇒ `/v1/generate` trả `503` vì thiếu cấu hình
  (`requireConfiguration`), không phải vì model hỏng.
- **Nhúng URL lúc dựng mà không kiểm** ⇒ bản cài báo `gateway_not_configured`. `check:pilot`
  và `smoke:gateway` tồn tại vì lỗi đó đã xảy ra thật (#355).
- **Nhúng nhầm gateway "gần đúng"**: một worker có `/health` trả `{"ok":true}` và có
  `/ai/generate` trông như chạy, nhưng xác thực bằng khoá chung ⇒ app nhận `401` dù giáo viên
  đã đăng nhập. Kiểm bằng `smoke:gateway` (nó đòi `service` + `version` + hai cửa `401`), không
  kiểm bằng mắt.
- **Đổi phiên bản ở ba nơi, quên nơi thứ tư** ⇒ `/health` nói `0.5.4` trong khi bộ cài là
  `0.5.5`; `smoke:gateway --expect-version` bắt được ngay.
