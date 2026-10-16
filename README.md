# EduGame Studio v0.3 — TypeScript

Ứng dụng desktop Windows cho giáo viên tạo, chỉnh sửa, lưu, chia sẻ và chơi trò chơi giáo dục. v0.3 giữ lại các tính năng của v0.2, chuyển mã nguồn ứng dụng sang TypeScript, thay thư viện JSON cục bộ bằng SQLite và bổ sung khung AI Gateway cloud để triển khai gói miễn phí/trả phí.

## Tính năng trong v0.3

- Dashboard tiếng Việt, thư viện game, trình chỉnh sửa, lịch sử kết quả và cài đặt.
- Trò chơi mẫu an toàn giao thông; engine trắc nghiệm/tình huống; điểm số, giải thích và chơi lại.
- Nhập tài liệu TXT, MD, DOCX, PDF có lớp văn bản và PPTX.
- Tạo bản nháp offline theo quy tắc. Đây không phải mô hình AI; giáo viên phải rà soát đáp án.
- AI online qua endpoint tương thích OpenAI; có thể cấu hình endpoint local như Ollama.
- Dữ liệu thư viện và kết quả lưu trong SQLite trên máy; tự di trú `library.json` từ v0.2 khi khởi động lần đầu.
- Gói `.egame` để xuất/nhập qua USB; kết quả xuất CSV.
- Electron dùng `contextIsolation`, `nodeIntegration: false`, `sandbox: true` và API qua preload.
- Khóa endpoint AI cá nhân được mã hóa bằng `safeStorage` nếu hệ điều hành hỗ trợ. Không nhúng khóa bí mật của EduGame Studio vào ứng dụng.
- Cloud AI Gateway TypeScript (Express + Supabase Auth/DB + Gemini API), schema hạn mức free/plus và hạn chế tốc độ.
- Shared TypeScript contracts và cấu hình TypeScript build/test.

## Yêu cầu

- Node.js LTS (khuyến nghị 20.x hoặc 22.x)
- npm
- Windows 10/11 để đóng gói bộ cài Windows; có thể phát triển trên Linux/macOS
- Cần kết nối internet lần đầu để cài dependencies

## Chạy ứng dụng desktop

```bash
npm install
npm start
```

Kiểm tra TypeScript và chạy test:

```bash
npm run check
npm test
```

Đóng gói Windows (chạy lệnh trên Windows để tạo installer phù hợp):

```bash
npm install
npm run dist:win
```

Installer nằm trong `release/`.

## Dữ liệu cục bộ

Electron lưu dữ liệu trong thư mục `userData/edugame-data/`:

- `edugame.sqlite`: thư viện game và lịch sử kết quả.
- `settings.json`: cài đặt ứng dụng và thông tin cấu hình endpoint. API key local do người dùng tự cung cấp được mã hóa bằng Electron `safeStorage` nếu hệ điều hành hỗ trợ.
- Game có thể xuất ra `.egame` để chuyển qua USB. Sau khi đã lưu, chơi game không cần internet.

SQLite là cơ sở dữ liệu cục bộ, không phải tài khoản cloud. Không lưu khóa Gemini/OpenAI của sản phẩm trong SQLite hoặc trong bộ cài.

## Cấu hình AI trong ứng dụng

Mở **Cài đặt** và chọn chế độ online để cấu hình endpoint OpenAI-compatible:

- Ollama local: thường dùng `http://127.0.0.1:11434/v1` nếu phiên bản hỗ trợ API tương thích.
- Nhập đúng model name; API key chỉ cần nếu endpoint yêu cầu.
- Chế độ offline tạo bản nháp theo quy tắc, không gọi AI.

**Lưu ý:** cấu hình endpoint trực tiếp trong desktop hiện là đường dành cho thử nghiệm/local hoặc người dùng tự cung cấp khóa (BYOK). Khi phát hành đại trà, không yêu cầu giáo viên dùng khóa API cá nhân; hãy nối đăng nhập của ứng dụng với Cloud Gateway bên dưới và giữ provider key hoàn toàn ở backend.

## Cloud AI Gateway — bản khung cho gói miễn phí/trả phí

Backend nằm trong `server/` và được viết bằng TypeScript. Gateway:

- Xác thực access token Supabase Auth.
- Giới hạn tốc độ, kiểm tra schema đầu vào, giới hạn kích thước tài liệu.
- Gọi Gemini API bằng `GEMINI_API_KEY` lưu ở biến môi trường backend.
- Dùng RPC trong Supabase để đếm lượt theo tháng: Free 5 lượt, Plus 100 lượt (có thể điều chỉnh trong `server/schema.sql`).
- Không lưu giáo án hay nội dung game trên backend trong luồng tạo game.

### Cấu hình backend

1. Tạo dự án Supabase và bật phương thức đăng nhập mong muốn.
2. Chạy `server/schema.sql` trong Supabase SQL Editor.
3. Tạo bản sao `.env.example` tên `.env` và điền thông tin. Không commit `.env`.
4. Cài dependencies (`npm install`), sau đó chạy `npm run server:dev`.
5. Kiểm tra `http://localhost:8787/health`.
6. Trước khi nối desktop, hoàn thành luồng đăng nhập Supabase trong Electron và gửi access token của người dùng tới `POST /v1/generate` bằng header `Authorization: Bearer <access_token>`.

**Quan trọng:** Cloud Gateway được cung cấp như khung backend v0.3, chưa được nối vào màn hình đăng nhập của desktop và chưa phải dịch vụ production đã triển khai. Không phát hành chế độ cloud cho người dùng công khai trước khi hoàn tất login, khôi phục phiên, xác thực gói Plus, kiểm thử hạn mức, HTTPS, log/monitoring và chính sách dữ liệu. `SUPABASE_SERVICE_ROLE_KEY` và `GEMINI_API_KEY` chỉ nằm trên backend.

### Các endpoint

- `GET /health` — health check.
- `POST /v1/generate` — yêu cầu access token Supabase, body JSON gồm `text`, `sourceName`, `questionCount`, `template`, `grade`, `subject`.

## Chính sách offline

- Game đã lưu, engine, chấm điểm, giải thích và lịch sử cục bộ không cần mạng.
- Nhập tài liệu từ tệp cục bộ vẫn hoạt động offline.
- Tạo nội dung mới bằng Gemini cần internet; bản nháp theo quy tắc có thể chạy offline.
- Đồng bộ/tài khoản cloud (khi hoàn thiện) cần internet.
- Không tải tài nguyên web/CDN khi chơi game.

## Giới hạn còn lại

- PDF scan chưa có OCR tích hợp.
- Bản nháp offline dựa trên quy tắc, không đảm bảo tạo được câu hỏi/đáp án đúng cho mọi tài liệu.
- Matching hiện chưa có giao diện kéo-thả riêng.
- Tích hợp cloud backend có scaffold nhưng login UI và kết nối cloud từ desktop chưa hoàn tất.
- Chưa có hệ thống thanh toán tự động; gói Plus hiện là logic hạn mức phía backend, cần kết nối quy trình thanh toán trước khi thu tiền.
- Chưa kiểm thử installer Electron/SQLite trên Windows thật trong môi trường này. Cần chạy `npm install`, `npm test`, rồi `npm run dist:win` trên Windows trước phát hành.

## Cấu trúc

```text
edugame-studio-v0.3/
├── src/
│   ├── main.ts                 # Electron main process + SQLite
│   ├── preload.ts              # API IPC an toàn
│   ├── renderer.ts             # Giao diện TypeScript
│   ├── shared/types.ts         # Kiểu dữ liệu dùng chung
│   ├── services/game-service.ts
│   ├── game-engine/runtime.ts
│   ├── index.html
│   └── styles.css
├── server/
│   ├── index.ts                # AI Gateway TypeScript
│   └── schema.sql              # Supabase quota schema/RPC
├── tests/runtime.test.ts
├── tsconfig.json
└── package.json
```

## Hướng phát triển

1. Hoàn tất TypeScript typing ở renderer/main (một số logic UI kế thừa từ v0.2 tạm dùng `@ts-nocheck`; contract dùng chung đã được định nghĩa).
2. Nối Supabase Auth vào ứng dụng desktop và tích hợp Gateway.
3. Thêm test schema game, kiểm thử prompt/đáp án, và kiểm thử migration SQLite.
4. Hoàn thiện matching kéo-thả, game phân nhánh, hình ảnh/âm thanh.
5. Kiểm thử Ollama local trên cấu hình máy yếu; AI local là tùy chọn, không bắt buộc để chơi game.
6. Thêm thanh toán, trang quản trị, ký số installer và quy trình hỗ trợ người dùng.
