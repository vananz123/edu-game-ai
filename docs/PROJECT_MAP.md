# Bản đồ dự án (đọc trước khi sửa)

Tài liệu này trả lời "file nào làm gì, sửa một tính năng thì mở file nào". Các
tài liệu khác vẫn cần đọc nhưng trả lời câu hỏi khác:

| Tài liệu | Trả lời |
| --- | --- |
| `README.md` | Cài đặt, chạy, đóng gói, tính năng |
| `AGENTS.md` | Quy tắc bắt buộc cho AI agent |
| `docs/ARCHITECTURE.md` | Luồng dữ liệu giữa main / renderer / AI core |
| `docs/PROJECT_MAP.md` (file này) | **Sửa X thì mở file nào** |
| `docs/DECISIONS.md` | Vì sao làm vậy (≥105 quyết định) |
| `docs/STATUS.md` | Việc gì đã xong, việc gì còn |
| `tests/README.md` | Chạy test thế nào |

## Cây thư mục

```
src/
  main.ts              Electron main process: cửa sổ, SQLite, IPC, AI runtime,
                       toàn màn hình, trình chiếu. (~2.8k dòng; xem "main.ts" bên dưới)
  preload.ts           Cầu nối an toàn: window.eduGame.<api> cho renderer
  index.html           Nạp CSS + liệt kê MỌI script renderer THEO THỨ TỰ
  shared/              Kiểu + hằng số dùng chung cho main, preload, renderer
  ai-core/             AI local (llama.cpp): tải model/runtime, đo máy, chạy server
  services/            Nghiệp vụ thuần (không DOM, không Electron):
                       tài liệu giáo án, tạo game, lưu trữ, chấm điểm, SQLite
  presentation/        Cửa sổ trình chiếu sang màn hình thứ hai
  renderer/            Toàn bộ UI chạy trong cửa sổ (script toàn cục, KHÔNG module)
    core/              render() + điều hướng trang + wirePage
    pages/             Một file cho mỗi trang (home, library, create, settings…)
    features/          Tính năng dùng nhiều trang
    features/wizard/   Luồng "Tạo từ giáo án" (bước 1→5)
    styles/app.css     CSS tay + Tailwind (xem "Thứ tự CSS" bên dưới)
  game-engine/         Runtime chạy game đã lưu (offline)
server/                Cloud AI Gateway (Express + Supabase + Gemini) — không chạy khi chơi
scripts/               Script build (icon, kiểm tra global renderer)
tests/
  run-unit.js          Runner cho `npm test` (tự tìm tests/unit/*.test.ts)
  unit/                Test logic thuần + IPC (node:assert)
  ui/                  Kiểm tra UI thật qua CDP, cần app đang chạy
  smoke/               Kịch bản end-to-end qua CDP
  manual/              Benchmark, đo đạc, công cụ một lần
  fixtures/            Dữ liệu giả lập (KHÔNG BAO GIỜ dùng dữ liệu học sinh thật)
  legacy/              Smoke cũ, không bảo trì
docs/                  Tài liệu dự án (xem bảng trên)
build/                 installer.nsh cho electron-builder
vendor/                DLL VC++ đóng gói kèm
```

## Sửa gì thì mở đâu

| Muốn sửa | Mở |
| --- | --- |
| Một trang (dashboard, thư viện, cài đặt…) | `src/renderer/pages/<ten>.ts` |
| Điều hướng / render trang | `src/renderer/core/render.ts`, `core/controller.ts` |
| Luồng tạo game từ giáo án | `src/renderer/pages/create-wizard.ts` + `features/wizard/*.ts` |
| Bóc tách cấu trúc tài liệu | `src/services/lesson-structure.ts` (+ `features/wizard/step-structure.ts`) |
| Năm trò chơi (quiz, tình huống, ghép cặp, kho báu, đường đua) | `src/renderer/features/gameplay.ts` |
| Hình minh họa trò chơi | `features/game-illustration.ts`, `features/treasure-art.ts`, `shared/illustration-*` |
| Âm thanh | `features/game-audio.ts` |
| Trình chiếu màn hình 2 | `features/presentation.ts` + `src/presentation/*` + IPC trong `main.ts` |
| Trình sửa game | `features/game-editor.ts`, `features/setup-wizard.ts` |
| AI local (cài model, chạy llama.cpp) | `src/ai-core/*`, `features/local-ai.ts`, `features/setup-wizard.ts` |
| Prompt / schema gọi AI | `src/services/lesson-prompts.ts`, `lesson-contracts.ts`, `ai-tasks.ts` |
| Lưu trữ (SQLite, `.egame`) | `src/services/lesson-store.ts`, `main.ts` (IPC), `preload.ts` (API) |
| Màu nền 5 thế giới trò chơi | `styles/app.css`, mục "NĂM THẾ GIỚI TRÒ CHƠI" + `GAME_WORLDS` trong `gameplay.ts` |
| Gói cài đặt | `package.json` → `build`, `build/installer.nsh`, `vendor/` |

## `main.ts` (2.814 dòng)

Chưa tách file vì mọi thứ là hàm toàn cục dùng chung qua `ipcMain.handle`. Khi
sửa, đi theo thứ tự này:

| Vùng (gần đúng) | Nội dung |
| --- | --- |
| Đầu file | hằng số, `readAiSettings`, `errorFacts`, ghi log |
| `ensureData`, `readDb`, `saveDb` | SQLite + migrate `library.json` |
| `createWindow` | cửa sổ chính, `contextIsolation`, `sandbox` |
| `verifyRuntime`, `ensureLocalRuntime`, `startLocalRuntimeUnlocked` | vòng đời AI local |
| `registerSetup` | IPC của trình cài AI (setup wizard) |
| `registerIpc` | **toàn bộ IPC còn lại** — thêm API mới thì thêm ở đây + `preload.ts` |
| Cuối file | `app.whenReady`, vòng đời ứng dụng |

## Thứ tự CSS (dễ gây lỗi)

`src/renderer/styles/app.css` là CSS viết tay **cộng** Tailwind: phần viết tay
dài (~4.1k dòng) nằm trên, các khối thế giới trò chơi nằm dưới cùng. Sau khi biên
dịch, Tailwind rút gọn selector (`.modal[data-player-theme]` → `[data-player-theme]`)
nên **một rule đặt sau có thể mất ưu thế** nếu selector của nó "nhẹ" hơn. Quy tắc:
rule mới đặt sau phải có ít nhất bằng số đơn vị specificity của rule cũ mà nó ghi đè.
`npm run verify:css` kiểm tra một số bất biến đã biết.

## Thứ tự script renderer (dễ gây lỗi)

Renderer **không dùng ES module**: mỗi file là một script toàn cục, hàm và biến
`let` chia sẻ giữa các file. Vì vậy:

1. Thứ tự nạp trong `src/index.html` là một phần của thiết kế. File sau dùng được
   hàm khai báo bằng `function` ở file trước (hoisting theo script).
2. Thêm file mới → thêm `<script>` đúng chỗ **và** cập nhật
   `tests/unit/renderer-load-order.test.ts` nếu có.
3. `npm run check:renderer-globals` bắt lỗi gọi hàm chưa từng được khai báo.

## Thêm một tính năng: checklist

1. Logic thuần → `src/services/` hoặc `src/shared/`, có test trong `tests/unit/`
   (runner tự tìm, không cần sửa `package.json`).
2. UI → trang trong `pages/`, phần dùng nhiều nơi trong `features/`, thêm script
   vào `index.html` theo thứ tự phụ thuộc.
3. IPC mới → `registerIpc` trong `main.ts` + `preload.ts` + kiểu trong `shared/`.
4. Kiểm chứng: `npm run check`, `npm test`, `npm run verify:css`,
   `npm run check:renderer-globals`; với UI thì thêm một check trong `tests/ui/`.
5. Ghi `docs/STATUS.md` (và `docs/DECISIONS.md` nếu đổi quyết định).
