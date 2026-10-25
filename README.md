# EduGame Studio v0.3 — TypeScript

Ứng dụng desktop Windows cho giáo viên tạo, chỉnh sửa, lưu, chia sẻ và chơi trò chơi giáo dục. v0.3 giữ lại các tính năng của v0.2, chuyển mã nguồn ứng dụng sang TypeScript, thay thư viện JSON cục bộ bằng SQLite và bổ sung khung AI Gateway cloud. Đã tích hợp thử nghiệm AI local llama.cpp cho Windows x64 CPU, gồm hỏi đáp/tóm tắt tài liệu và tạo game từ nội dung đã phân tích.

## Hướng Offline AI V1

- Ứng dụng tự tải và quản lý bản llama.cpp CPU x64 đã ghim phiên bản, kiểm tra kích thước/SHA-256, giải nén vào thư mục dữ liệu riêng và khởi chạy bằng AIManager. Không yêu cầu cài Ollama, LM Studio, llama.cpp hay công cụ nào khác.
- Có ba lựa chọn GGUF Q4_0: Qwen3.5 2B (~1.21 GB), Qwen3.5 4B (~2.58 GB) và Qwen2.5 7B (~4.44 GB, nguồn bartowski). URL theo revision cố định, kích thước và SHA-256 được khai báo trong `src/ai-core/model-catalog.ts`; giấy phép model là Apache-2.0.
- Model và runtime được lưu trong thư mục dữ liệu ứng dụng, không trong bộ cài/Program Files. Nếu model đúng kích thước đã có, ứng dụng xác minh SHA-256 rồi dùng lại, không tải lại. Tải lần đầu cần Internet; sau khi cài, hỏi đáp, tóm tắt và tạo game chạy trên máy.
- Màn hình tạo game hiển thị dung lượng, license, RAM máy, luồng CPU, ước tính RAM và kết quả mong đợi. Các ước tính RAM/kết quả không phải cam kết hiệu năng; runtime hiện dùng CPU, chưa bật GPU.
- `AIManager` giữ một tiến trình, bind loopback, chờ health check và dừng khi thoát ứng dụng. Model download có resume HTTP Range; runtime tải một lần và được xác minh SHA-256 trước khi giải nén.
- Đây là tích hợp prototype: chưa kiểm chứng trải nghiệm suy luận trên mọi máy, độ chính xác đầu ra cần giáo viên duyệt; Windows x64 CPU là nền tảng được hỗ trợ hiện tại.
- BYOK/OpenAI-compatible và Gateway Supabase/Gemini là hành vi prototype v0.3 hiện có, chưa bị xóa trong bước chuyển tiếp; chúng không thuộc đường AI offline mục tiêu.

## Tính năng trong v0.3

- Dashboard tiếng Việt, thư viện game, trình chỉnh sửa, lịch sử kết quả và cài đặt.
- Trò chơi mẫu an toàn giao thông; engine trắc nghiệm/tình huống; điểm số, giải thích và chơi lại.
- Trình sửa tình huống hỗ trợ bối cảnh, phản hồi theo từng hành động, nhánh tiếp theo/kết thúc, câu hỏi thảo luận và thang điểm mỗi quyết định 0–60 an toàn + 0–25 giải thích + 0–15 giảm hậu quả. Runtime ghi điểm theo lộ trình người chơi thực sự đi qua; giáo viên cấu hình điểm từng hành động.
- Nhập tài liệu TXT, MD, DOCX, PDF có lớp văn bản và PPTX.
- Luồng AI local llama.cpp: tóm tắt/rút ý, câu hỏi mẫu, gợi ý quiz/tình huống và hỏi đáp tài liệu kèm căn cứ trích dẫn. Kết quả phân tích được đưa vào prompt tạo game; giáo viên cần rà soát trước khi lưu.
- Tạo bản nháp offline theo quy tắc. Đây không phải mô hình AI; giáo viên phải rà soát đáp án.
- API online tương thích OpenAI vẫn là tùy chọn riêng do người dùng cấu hình; Gateway Gemini là scaffold riêng, chưa được desktop gọi.
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

Trong **Tạo trò chơi**, chọn chế độ:

- **Mẫu ngoại tuyến:** không gọi mô hình; tạo bản nháp theo quy tắc.
- **AI local tích hợp:** chọn Qwen3.5 0.8B, 2B hoặc 4B và bấm tải/cài. Ứng dụng tải llama.cpp và model, tự xác minh checksum và chỉ tải model chưa có/hỏng. Chế độ hiện dùng CPU, không gọi endpoint Ollama.
- **AI đám mây:** chọn ChatGPT (OpenAI), Gemini (Google) hoặc endpoint HTTPS tương thích OpenAI trong Cài đặt; API key do người dùng cung cấp.

Trong trang Tạo trò chơi, chọn **Tổng hợp với AI trên máy** hoặc **Tổng hợp với AI đám mây**. Lựa chọn trên máy mở bảng llama.cpp/model dùng chung với Cài đặt; lựa chọn đám mây cho phép chọn ChatGPT, Gemini hoặc endpoint tùy chỉnh đã cấu hình. Sau khi có bản tổng hợp, giáo viên có thể tiếp tục trò chuyện (Enter để gửi, Shift+Enter để xuống dòng), yêu cầu **Tạo bộ câu hỏi khác**, rồi chọn **Dùng bộ câu hỏi gợi ý trong trò chơi** để đưa bộ hiện tại vào trò chơi. Bản tổng hợp, ý chính và tối đa bốn lượt hỏi đáp gần nhất được dùng làm nguồn khi tạo game. Trên AI local, tài liệu dài hơn 12.000 ký tự được rút gọn thành trích đoạn đầu/cuối để giảm thời gian xử lý CPU; ứng dụng sẽ thông báo khi dùng trích đoạn. Nội dung không gửi ra ngoài khi dùng AI local.

**Lưu ý:** cấu hình endpoint trực tiếp trong desktop hiện là đường dành cho thử nghiệm/local hoặc người dùng tự cung cấp khóa (BYOK). Khi phát hành đại trà, không yêu cầu giáo viên dùng khóa API cá nhân; hãy nối đăng nhập của ứng dụng với Cloud Gateway bên dưới và giữ provider key hoàn toàn ở backend.

Trong trình chỉnh sửa trò chơi, **Nhập CSV/XLSX** thêm tối đa 100 câu trắc nghiệm từ `.csv`, `.tsv` hoặc `.xlsx` vào bản nháp để giáo viên rà soát trước khi lưu. Bảng cần có các cột `Câu hỏi`, `Phương án A`, `Phương án B`, `Đáp án`; có thể thêm `Phương án C`, `Phương án D`, `Giải thích`, `Điểm`, `Độ khó`. Đáp án có thể là A/B/C/D hoặc trùng chính xác nội dung phương án. Tệp mỗi lần nhập tối đa 10 MB; nếu có dòng không hợp lệ, toàn bộ lần nhập bị từ chối để tránh thêm dữ liệu dở dang.

Với mẫu **Thử thách tình huống**, mỗi lựa chọn có thể dẫn sang tình huống khác hoặc kết thúc nhánh; mặc định tiếp tục theo thứ tự. Mỗi nhánh có phản hồi riêng và điểm rubric cấu hình theo ba tiêu chí có giới hạn 60/25/15 (tối đa 100 điểm/quyết định). Tình huống cũng có bối cảnh và câu hỏi thảo luận. Các nhánh được xác minh khi lưu/nhập gói `.egame`; lộ trình bị giới hạn tối đa 100 quyết định mỗi lượt để tránh vòng lặp vô hạn.

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
│   ├── main.ts                 # Electron main process + SQLite (~120 KB)
│   ├── preload.ts              # API IPC an toàn
│   ├── index.html              # Khung cửa sổ ứng dụng
│   ├── ai-core/                # AI local: runtime, model, manifest, cài đặt lần đầu
│   ├── presentation/           # Trình chiếu trên màn hình phụ / máy chiếu
│   ├── renderer/
│   │   ├── core/               # Điều phối trang, điều hướng, khởi tạo
│   │   ├── features/           # Tạo game, AI, wizard, biên tập, chơi, kết quả
│   │   ├── features/wizard/    # Các bước của luồng giáo án → game
│   │   ├── pages/              # Màn hình tổng quan, thư viện, tạo game...
│   │   ├── styles/             # app.css (Tailwind v4 + @layer components)
│   │   ├── setup-wizard-model.ts  # Quyết định của wizard (thuần, test bằng node)
│   │   └── shared.ts           # Trạng thái và tiện ích giao diện dùng chung
│   ├── services/               # Giáo án, AI transport, kiểm tra chất lượng, SQLite store
│   ├── shared/                 # Kiểu dữ liệu dùng chung
│   └── game-engine/runtime.ts
├── server/
│   ├── index.ts                # AI Gateway TypeScript
│   └── schema.sql              # Supabase quota schema/RPC
├── tests/                      # unit/ · ui/ · smoke/ · manual/ · fixtures/ · legacy/
│   └── README.md               # Cái nào chạy bằng `npm test`, cái nào chạy tay
├── vendor/vc-runtime/          # DLL VC++ đóng gói cùng runtime llama.cpp
├── build/installer.nsh         # Hook NSIS của electron-builder
├── docs/                       # Bàn giao, quyết định, trạng thái, kế hoạch
├── tsconfig.json
└── package.json
```

## Hướng phát triển

1. Hoàn tất TypeScript typing ở renderer/main (một số logic UI kế thừa từ v0.2 tạm dùng `@ts-nocheck`; contract dùng chung đã được định nghĩa).
2. Nối Supabase Auth vào ứng dụng desktop và tích hợp Gateway.
3. Thêm test schema game, kiểm thử prompt/đáp án, và kiểm thử migration SQLite.
4. Hoàn thiện matching kéo-thả, game phân nhánh, ảnh minh họa cặp ghép và tài sản do giáo viên tải lên (kho báu đã có hình nền/nhân vật/âm thanh dựng sẵn).
5. Kiểm thử cài đặt và inference Qwen local trên nhiều cấu hình máy, ưu tiên máy cấu hình thấp; AI local là tùy chọn, không bắt buộc để chơi game.
6. Thêm thanh toán, trang quản trị, ký số installer và quy trình hỗ trợ người dùng.
