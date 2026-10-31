# Bản đồ dự án (đọc trước khi sửa)

Tài liệu này trả lời "file nào làm gì, sửa một tính năng thì mở file nào". Các
tài liệu khác vẫn cần đọc nhưng trả lời câu hỏi khác:

| Tài liệu | Trả lời |
| --- | --- |
| `README.md` | Cài đặt, chạy, đóng gói, tính năng |
| `AGENTS.md` | Quy tắc bắt buộc cho AI agent |
| `docs/ARCHITECTURE.md` | Luồng dữ liệu giữa main / renderer / AI core |
| `docs/PROJECT_MAP.md` (file này) | **Sửa X thì mở file nào** |
| `docs/DECISIONS.md` | Vì sao làm vậy: tóm tắt #1–#56 + chỉ dẫn sang `docs/handoff/decisions/` cho #57–#145 |
| `docs/STATUS.md` | Việc gì đã xong: 3 bàn giao mới nhất + mục lục đầy đủ (lịch sử ở `docs/handoff/status/`) |
| `docs/handoff/` | Lịch sử bàn giao theo ngày và chi tiết quyết định cũ (chỉ đọc khi cần tra cứu) |
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
  services/            Nghiệp vụ thuần (không DOM, không Electron), chia theo khu vực:
    lesson/            giáo án → game: contracts/prompts, chunk + retrieval, preprocess,
                       structure, quality, cache, workflow, projects, item-repair, capacity
    ai/                gọi model: transport, providers, tasks, log, opencode-zen
    game/              5 thể loại: validation, normalize, adapter, .egame, draft-convert, rules
    storage/           lưu trữ: lesson-store (SQLite + file giáo án), custom-illustration
    input/             nhập liệu: phân loại đầu vào, nhập câu hỏi CSV/XLSX, chuẩn hoá câu
  presentation/        Cửa sổ trình chiếu sang màn hình thứ hai
  lan/                 Chơi LAN: máy giáo viên làm máy chủ, học sinh trả lời
                       trên điện thoại (Express + Socket.IO trong main process)
    lan-reducer.ts     Máy trạng thái THUẦN (join, trả lời, chốt câu) — test kỹ nhất
    lan-adapters.ts    Game → các "lượt" LAN, chấm điểm bằng game-engine/runtime.ts
    lan-server.ts      HTTP + Socket.IO, chỉ phục vụ trang trong lan/mobile/
    lan-ipc.ts         IPC lan:start / lan:stop / lan:assign-team / lan:state
    mobile/            Trang điện thoại (HTML/CSS/JS thuần, copyfiles chép vào dist)
  renderer/            Toàn bộ UI chạy trong cửa sổ (script toàn cục, KHÔNG module)
    core/              render() + điều hướng trang + wirePage
    pages/             Một file cho mỗi trang (home, library, create, settings…)
    features/          Tính năng dùng nhiều trang
    features/games/    Bề mặt chơi, tách theo trách nhiệm (#147): shell (vào/ra,
                       toàn màn hình), three-stage (3D), house, result-screen
                       (kết quả + trình chiếu + modal), quiz, matching, treasure, race
    features/wizard/   Luồng "Tạo từ giáo án" (bước 1→5)
    styles/app.css     Entry Tailwind + daisyUI: @import các file khu vực theo thứ tự
      base.css           token alias (:root), layer base, biến cỡ chữ/animation
      components.css     component dùng chung port từ 5 stylesheet cũ (nút, thẻ, form…)
      shell.css          topbar/sidebar cố định, dark theme, override toàn màn hình
      fullscreen.css     bố cục toàn màn hình/máy chiếu + mật độ chỗ trình chiếu
      gameplay.css       play surface: stage, đáp án, màn kết quả
      navigation.css     icon navbar
      game-race.css      bảng Đường đua
      game-animations.css chuyển động 5 trò (thanh lượt, thẻ, phân loại, cuộn stage)
      setup-wizard.css   wizard cài AI lần đầu
      wizard.css         wizard tạo từ giáo án: tiến trình, ảnh minh hoạ, cây bước 1
      game-treasure.css  kho báu: tương tác nâng cao + bản đồ hành trình
      game-worlds.css    5 thế giới trò chơi + bố cục kho báu toàn màn hình
      game-house.css     chế độ Xây nhà (#142)
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
  handoff/status/      Lịch sử bàn giao theo ngày (tách từ STATUS.md, 2026-10-31)
  handoff/decisions/   Chi tiết quyết định #57–#145 (tách từ DECISIONS.md)
build/                 installer.nsh cho electron-builder
vendor/                DLL VC++ đóng gói kèm
```

## Sửa gì thì mở đâu

| Muốn sửa | Mở |
| --- | --- |
| Tra bàn giao cũ / quyết định cũ | `docs/STATUS.md` (mục lục) → `docs/handoff/status/<ngày>.md`; `docs/DECISIONS.md` (mục lục) → `docs/handoff/decisions/` |
| Một trang (dashboard, thư viện, cài đặt…) | `src/renderer/pages/<ten>.ts` |
| Điều hướng / render trang | `src/renderer/core/render.ts`, `core/controller.ts` |
| Luồng tạo game từ giáo án | `src/renderer/pages/create-wizard.ts` + `features/wizard/*.ts` |
| Phân luồng đầu vào (giáo án / câu hỏi / dàn ý) | `src/services/input/input-classifier.ts` (quy tắc), `input/input-classifier-semantic.ts` (lớp xác nhận MiniLM), IPC `lesson:classify-input`, UI trong `features/wizard/step-input.ts` |
| Đổi thể loại không sinh lại nội dung | `src/services/game/draft-convert.ts`, IPC `lesson:convert-draft`, `wizardConvertOrDiscardForGenre` trong `features/wizard/state.ts` |
| Nhập câu hỏi soạn sẵn (CSV/XLSX/dán văn bản) | `src/services/input/question-import.ts` (`importQuestionsFromFile`, `parseQuestionsFromText`) |
| Ngân hàng câu hỏi: 7 loại câu + chấm điểm thể loại tương thích (#115) | `src/services/input/question-import.ts` (phần `readQuestionBlock`/`ParsedQuestion`), `input/question-compatibility.ts` (thuần), `input/question-text.ts` (chuẩn hoá dùng chung), UI trong `features/wizard/step-recommend.ts` |
| Làm sạch ký hiệu/emoji khi tài liệu giống ngân hàng câu hỏi (#116) | `src/services/input/question-text.ts` (`cleanQuestionLine`, `cleanQuestionText`, `looksLikeQuestionBankText`), `splitInlineQuestion` trong `input/question-import.ts` |
| Bóc tách cấu trúc tài liệu | `src/services/lesson/lesson-structure.ts` (+ `features/wizard/step-structure.ts`) |
| Năm trò chơi (quiz, tình huống, ghép cặp, kho báu, đường đua) | `src/renderer/features/games/quiz.ts`, `matching.ts`, `treasure.ts`, `race.ts`; vào/ra và toàn màn hình ở `games/shell.ts` |
| Hình minh họa trò chơi | `features/game-illustration.ts`, `features/treasure-art.ts`, `shared/illustration-*` |
| Âm thanh | `features/game-audio.ts` |
| Trình chiếu màn hình 2 | `features/presentation.ts` + `src/presentation/*` + IPC trong `main.ts` |
| Chơi LAN (học sinh trên điện thoại) | `src/lan/lan-reducer.ts` (trạng thái), `lan-adapters.ts` (điểm), `lan-server.ts` (mạng), `features/lan.ts` (màn hình giáo viên) |
| Trình sửa game | `features/game-editor.ts`, `features/setup-wizard.ts` |
| AI local (cài model, chạy llama.cpp) | `src/ai-core/*`, `features/local-ai.ts`, `features/setup-wizard.ts` |
| Prompt / schema gọi AI | `src/services/lesson/lesson-prompts.ts`, `lesson/lesson-contracts.ts`, `ai/ai-tasks.ts` |
| Nhà cung cấp AI của Step 2/Step 5, khoá theo từng nhà cung cấp, trạng thái sẵn sàng (#132) | `src/services/ai/ai-providers.ts` (registry + chọn nhà cung cấp + migration khoá), `main.ts` (`createChatClientForProvider`, `ai:test-provider`, `settings:get/save` không trả khoá), `pages/settings.ts` + `features/settings.ts` (thẻ từng nhà cung cấp), `features/wizard/state.ts` (`wizardProviderCard`/`wizardProviderPickerHtml`) |
| Lưu trữ (SQLite, `.egame`) | `src/services/storage/lesson-store.ts`, `src/services/game/game-package.ts`, `main.ts` (IPC), `preload.ts` (API) |
| Màu nền 5 thế giới trò chơi | `styles/game-worlds.css`, mục "NĂM THẾ GIỚI TRÒ CHƠI" + `GAME_WORLDS` trong `games/result-screen.ts` |
| Màn hình kết quả, trình chiếu, thi đấu đội | `features/games/result-screen.ts` |
| Lớp 3D dùng chung và thế giới theo trò | `features/three-game-interaction.ts` (API), `features/games/three-stage.ts` (mount/world/reactThree) |
| House Building Mode (kinh tế nhà, mẫu nhà) | `src/game-engine/house-build.ts` (kinh tế), `features/games/house.ts` (UI/3D) |
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

`src/renderer/styles/app.css` là entry Tailwind: `@import "tailwindcss"` + daisyUI
`@plugin`/`@theme`/`@source`, rồi `@import` 13 file khu vực (base → components →
shell → fullscreen → gameplay → navigation → game-race → game-animations →
setup-wizard → wizard → game-treasure → game-worlds → game-house). Tailwind inline
từng `@import` đúng tại chỗ, nên **thứ tự import là thứ tự cascade**: không đổi
thứ tự, không import muộn hơn vị trí cũ của một khối. Sau khi biên dịch, Tailwind
rút gọn selector (`.modal[data-player-theme]` → `[data-player-theme]`) nên **một
rule đặt sau có thể mất ưu thế** nếu selector của nó "nhẹ" hơn. Quy tắc: rule mới
đặt sau phải có ít nhất bằng số đơn vị specificity của rule cũ mà nó ghi đè.
`npm run verify:css` kiểm tra một số bất biến đã biết trên file biên dịch.

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
5. Ghi `docs/STATUS.md` (và `docs/DECISIONS.md` nếu đổi quyết định). STATUS giữ
   3 bàn giao mới nhất + mục lục; chuyển bàn giao cũ sang `docs/handoff/status/`
   đúng ngày của nó. Chi tiết quyết định cũ đã ở `docs/handoff/decisions/`.
