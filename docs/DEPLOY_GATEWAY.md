# Triển khai gateway Cloud AI (#359)

Tài liệu này mô tả **cách** đưa `server/` lên một host thật để bộ cài không còn trỏ
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

## 2. Ba cách chạy, chọn theo túi tiền

| Cách | Chi phí tham khảo | Khi nào hợp |
|---|---|---|
| VPS nhỏ (1 vCPU / 1 GB, Docker) | ~4–6 USD/tháng | ổn định, tự quản lý; cần HTTPS (Caddy/nginx + Let's Encrypt) |
| PaaS có free tier (Render, Fly, Railway…) | 0 → ~5–7 USD/tháng | thử nhanh; free tier thường **ngủ** sau vài phút im lặng |
| Máy của chính trường + Cloudflare Tunnel | 0 USD/tháng | pilot 1–10 giáo viên; phụ thuộc một máy bật 24/7 |

**Một điểm phải nói trước:** free tier có thể "ngủ". Lần gọi đầu tiên sau khi ngủ mất vài
chục giây, mà `reqwest` trong app chờ **120 giây** — nên nó vẫn đúng, nhưng giáo viên sẽ thấy
"đang tạo…" lâu bất thường ở lần đầu. Với pilot thật, nên dùng gói luôn thức.

## 3. Chạy bằng Docker

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

## 4. Kiểm tra gateway vừa dựng (không tiêu một lượt nào)

```bash
npm run smoke:gateway -- https://ai.example.com --expect-version 0.5.5
```

Bốn dòng, đúng bốn câu app sẽ hỏi: `/health` trả `ok` + đúng phiên bản, và `/v1/usage` cùng
`/v1/generate` **từ chối người không có token** (`401`). Cổng này **cố ý không gọi AI**: một
lần smoke test không được tiêu tiền của giáo viên. Thêm `--pilot` để buộc `https`.

## 5. Dựng bộ cài trỏ vào gateway đó

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

## 6. Những lỗi đã gặp khi làm việc này (để không gặp lại)

- **Chạy gateway ở máy mà quên `source .env`** ⇒ `/v1/generate` trả `503` vì thiếu cấu hình
  (`requireConfiguration`), không phải vì model hỏng.
- **Nhúng URL lúc dựng mà không kiểm** ⇒ bản cài báo `gateway_not_configured`. `check:pilot`
  và `smoke:gateway` tồn tại vì lỗi đó đã xảy ra thật (#355).
- **Đổi phiên bản ở ba nơi, quên nơi thứ tư** ⇒ `/health` nói `0.5.4` trong khi bộ cài là
  `0.5.5`; `smoke:gateway --expect-version` bắt được ngay.
