# Bản đồ dự án (đọc trước khi sửa)

Tài liệu này trả lời "file nào làm gì, sửa một tính năng thì mở file nào". Các
tài liệu khác vẫn cần đọc nhưng trả lời câu hỏi khác:

| Tài liệu | Trả lời |
| --- | --- |
| `README.md` | Cài đặt, chạy, đóng gói, tính năng |
| `AGENTS.md` | Quy tắc bắt buộc cho AI agent |
| `docs/ARCHITECTURE.md` | Luồng dữ liệu giữa Tauri / renderer / AI core |
| `docs/PROJECT_MAP.md` (file này) | **Sửa X thì mở file nào** |
| `docs/DECISIONS.md` | Vì sao làm vậy: tóm tắt #1–#56 + chỉ dẫn sang `docs/handoff/decisions/` cho #57–#145 |
| `docs/STATUS.md` | Việc gì đã xong: 3 bàn giao mới nhất + mục lục đầy đủ (lịch sử ở `docs/handoff/status/`) |
| `docs/handoff/` | Lịch sử bàn giao theo ngày và chi tiết quyết định cũ (chỉ đọc khi cần tra cứu) |
| `tests/README.md` | Chạy test thế nào |

## Cây thư mục

```
src/
  index.html           Nạp CSS + liệt kê MỌI script renderer THEO THỨ TỰ
  shared/              Kiểu + hằng số dùng chung cho renderer và nghiệp vụ
  ai-core/             Helpers TypeScript/catalog cũ; desktop Tauri chạy AI local
                       trong `src-tauri/src/ai_local.rs` và `setup.rs`
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
    pages/             Một file cho mỗi trang (library, create, create-wizard,
                       settings…). Trang "Tổng quan" đã xoá ở #161 — thư viện là
                       trang đích, hai việc nó làm thay nằm trong sidebar.
    features/          Tính năng dùng nhiều trang
      ui-icons.ts      Icon Lucide cho chrome: uiIcon() + paintUiIcons() (#161)
      ai-status.ts     Thanh trạng thái llama.cpp + menu, khối thông báo trong sidebar (#162)
      icon-data.ts     do scripts/build-icon-data.js sinh từ shared/icon-registry.ts
      sidebar-shortcuts.ts  Khối "Lối tắt" dưới sidebar: games gần đây + 2 nút nhanh
    features/games/    Bề mặt chơi, tách theo trách nhiệm (#147): shell (vào/ra,
                       toàn màn hình), three-stage (3D), house, result-screen
                       (kết quả + trình chiếu + modal), quiz, matching, treasure, race;
                       connection (gallery/preview chòm sao, khung template) +
                       constellation (bảng chòm sao kéo thả: khay duy nhất, câu
                       dài ngoài cảnh, đường trỏ tới sao, #171/#172)
    features/wizard/   Luồng "Tạo từ giáo án" (bước 1→5)
    features/wizard/state/  State + hành động dùng chung, tách theo khu vực (#150):
                       core (state, đồng hồ/ETA), providers, config, draft, actions
    features/editor/   Trình soạn thảo game, tách theo khu vực (#150): ai (tạo lại
                       mục), page (nhập/mở/đóng/lưu), questions, drag, matching,
                       treasure, race
    styles/app.css     Entry Tailwind + daisyUI: @import các file khu vực theo thứ tự
      base.css           token alias (:root), layer base, biến cỡ chữ/animation
      components.css     component dùng chung port từ 5 stylesheet cũ (nút, thẻ, form…)
      shell.css          sidebar cố định, dark theme, override toàn màn hình (#162 bỏ topbar)
      fullscreen.css     bố cục toàn màn hình/máy chiếu + mật độ chỗ trình chiếu
      gameplay.css       play surface: stage, đáp án, màn kết quả
      navigation.css     icon navbar + khối trạng thái AI/thông báo đầu sidebar (#162)
      game-race.css      bảng Đường đua
      game-animations.css chuyển động 5 trò (thanh lượt, thẻ, phân loại, cuộn stage)
      setup-wizard.css   wizard cài AI lần đầu
      wizard.css         wizard tạo từ giáo án: tiến trình, ảnh minh hoạ, cây bước 1
      game-treasure.css  kho báu: tương tác nâng cao + bản đồ hành trình
      game-worlds.css    5 thế giới trò chơi + bố cục kho báu toàn màn hình
      game-house.css     chế độ Xây nhà (#142)
      game-connection.css khung chung + gallery/preview của chòm sao (#168)
      game-constellation.css bảng chòm sao: HUD một dòng, cảnh lớn, hàng câu dài,
                          MỘT khay thẻ đáp án, đường trỏ, dự phòng (#171, bố cục lại #172)
  game-engine/         Runtime chạy game đã lưu (offline)
src-tauri/             Vỏ Tauri v2 (Rust): api.rs hợp đồng command + dispatch,
                       storage/library/project/package/embedded, settings.rs +
                       secrets.rs (DPAPI), migration.rs, ai_local.rs, setup.rs,
                       lesson.rs + lesson_store.rs, ai_http.rs, presentation.rs,
                       lan.rs, diagnostics/picker/illustration
server/                Cloud AI Gateway (Express + Supabase + Gemini) — không chạy khi chơi
scripts/               Script build (icon, kiểm tra global renderer):
                       build-icon-registry.js tải bộ Lucide về `shared/icon-registry.ts`,
                       build-icon-data.js sinh `renderer/features/icon-data.ts` từ registry
                       (`--check` là cổng phát hiện file sinh bị cũ)
tests/
  run-unit.js          Runner cho `npm test` (tự tìm tests/unit/*.test.ts)
  unit/                Test logic thuần + façade/command contract (node:assert)
  ui/                  Tauri WebView gate và một số kiểm tra CDP cũ
  smoke/               Smoke CDP Electron lịch sử, chưa phải Tauri acceptance
  manual/              Benchmark, đo đạc, công cụ một lần
  fixtures/            Dữ liệu giả lập (KHÔNG BAO GIỜ dùng dữ liệu học sinh thật)
  legacy/              Smoke cũ, không bảo trì
docs/                  Tài liệu dự án (xem bảng trên)
  handoff/status/      Lịch sử bàn giao theo ngày (tách từ STATUS.md, 2026-10-31)
  handoff/decisions/   Chi tiết quyết định #57–#145 (tách từ DECISIONS.md)
build/                 Tauri/NSIS installer hooks (nếu có)
vendor/                DLL VC++ đóng gói kèm
```

## Sửa gì thì mở đâu

| Muốn sửa | Mở |
| --- | --- |
| Tra bàn giao cũ / quyết định cũ | `docs/STATUS.md` (mục lục) → `docs/handoff/status/<ngày>.md`; `docs/DECISIONS.md` (mục lục) → `docs/handoff/decisions/` |
| Một trang (thư viện, tạo game, cài đặt…) | `src/renderer/pages/<ten>.ts` |
| Điều hướng / render trang | `src/renderer/core/render.ts`, `core/controller.ts` |
| Luồng tạo game từ giáo án | `src/renderer/pages/create-wizard.ts` + `features/wizard/step-*.ts` + `features/wizard/state/*.ts` |
| Phân luồng đầu vào (giáo án / câu hỏi / dàn ý) | `src/services/input/input-classifier.ts` (quy tắc), `input/input-classifier-semantic.ts` (lớp xác nhận MiniLM), IPC `lesson:classify-input`, UI trong `features/wizard/step-input.ts` |
| Đổi thể loại không sinh lại nội dung | `src/services/game/draft-convert.ts`, IPC `lesson:convert-draft`, `wizardConvertOrDiscardForGenre` trong `features/wizard/state/actions.ts` |
| Nhập câu hỏi soạn sẵn (CSV/XLSX/dán văn bản) | `src/services/input/question-import.ts` (`importQuestionsFromFile`, `parseQuestionsFromText`) |
| Ngân hàng câu hỏi: 7 loại câu + chấm điểm thể loại tương thích (#115) | `src/services/input/question-import.ts` (phần `readQuestionBlock`/`ParsedQuestion`), `input/question-compatibility.ts` (thuần), `input/question-text.ts` (chuẩn hoá dùng chung), UI trong `features/wizard/step-recommend.ts` |
| Làm sạch ký hiệu/emoji khi tài liệu giống ngân hàng câu hỏi (#116) | `src/services/input/question-text.ts` (`cleanQuestionLine`, `cleanQuestionText`, `looksLikeQuestionBankText`), `splitInlineQuestion` trong `input/question-import.ts` |
| Bóc tách cấu trúc tài liệu | `src/services/lesson/lesson-structure.ts` (+ `features/wizard/step-structure.ts`) |
| Năm trò chơi (quiz, tình huống, ghép cặp, kho báu, đường đua) | `src/renderer/features/games/quiz.ts`, `matching.ts`, `treasure.ts`, `race.ts`; vào/ra và toàn màn hình ở `games/shell.ts` |
| Khung cửa sổ: sidebar, trạng thái llama.cpp, chuông thông báo (không còn topbar) | `src/index.html` (`.sidebar` + `[data-sidebar-status]`), `styles/navigation.css` (`.sidebar-status`, popover fixed), `features/ai-status.ts`, `core/bootstrap.ts` (uỷ nhiệm click của sidebar bỏ qua khối này) |
| Icon Lucide trong chrome (sidebar, nút, tab, empty state) | `shared/icon-registry.ts` (tên + nét, do `scripts/build-icon-registry.js` tải), `features/icon-data.ts` (do `build-icon-data.js` sinh), `features/ui-icons.ts` (`uiIcon()` / `paintUiIcons()`); markup dùng `<span data-icon="tên">` |
| Hình minh họa trò chơi | `features/game-illustration.ts`, `features/treasure-art.ts`, `shared/illustration-*` |
| Âm thanh | `features/game-audio.ts` |
| Trình chiếu màn hình 2 | `features/presentation.ts` + `src/presentation/presentation.html` + `src-tauri/src/presentation.rs` |
| Chơi LAN (học sinh trên điện thoại) | `src/lan/lan-reducer.ts` (trạng thái), `lan-adapters.ts` (điểm), `lan-server.ts` (mạng), `features/lan.ts` (màn hình giáo viên) |
| Trình sửa game | `features/editor/*.ts` (tách #150: `page`, `questions`, `matching`, `treasure`, `race`, `ai`, `drag`), `features/setup-wizard.ts` |
| AI local (cài model, chạy llama.cpp) | `src-tauri/src/ai_local.rs`, `setup.rs`, `features/local-ai.ts`, `features/setup-wizard.ts` |
| Prompt / schema gọi AI | `src/services/lesson/lesson-prompts.ts`, `lesson/lesson-contracts.ts`, `ai/ai-tasks.ts` |
| Nhà cung cấp AI của Step 2/Step 5, khoá theo từng nhà cung cấp, trạng thái sẵn sàng (#132) | `src/services/ai/ai-providers.ts` (registry + chọn nhà cung cấp), `src-tauri/src/settings.rs` + `secrets.rs` (settings, DPAPI, khoá không trả ra renderer), `pages/settings.ts` + `features/settings.ts`, `features/wizard/state/providers.ts` |
| Khoá BYOK trên vỏ Tauri (DPAPI + view không khoá) | `src-tauri/src/secrets.rs` (DPAPI/base64/mask), `src-tauri/src/settings.rs` (registry provider Rust, gộp `apiKey`/`clearKey`, `settings:get/save`, `ai:providers`), `src-tauri/src/api.rs` + `lib.rs`; renderer vẫn dùng `features/settings.ts` + `pages/settings.ts` |
| AI local trên vỏ Tauri (catalog pin, tải runtime/model, `llama-server`) | `src-tauri/src/ai_local.rs` (catalog + SHA-256 + Range resume + ZIP phẳng + vòng đời/health), `src-tauri/src/setup.rs`, `src-tauri/src/{api,lib}.rs`, `src-tauri/tauri.conf.json` + `vendor/vc-runtime/`, `tests/ui/tauri-webview-check.js` |
| Wizard cài AI lần đầu trên vỏ Tauri | `src-tauri/src/setup.rs` (máy trạng thái `<data>/ai-local/setup-state.json`, preflight phần cứng/dung lượng, điều phối bước, hủy, smoke-test sinh chữ thật), `src-tauri/src/{api,lib}.rs` (bốn kênh `setup:status`/`setup:preflight`/`setup:start`/`setup:cancel`, state `Setup`), `src-tauri/src/ai_local.rs` (`*_for_setup`, `CancelToken`, `repair_support_files`); renderer vẫn là `src/renderer/features/setup-wizard.ts` + `setup-wizard-model.ts`; cổng `tests/ui/tauri-webview-check.js` (kiểm hình dạng + `setupRealChecks` khi bật `EDUGAME_TAURI_AI_INSTALL`) |
| Luồng giáo án trên vỏ Tauri (lưu tài liệu, phân tích, đề xuất, dự án) | `src-tauri/src/lesson.rs` (cầu 15 kênh, chọn provider trước cache key, hai op `lesson-plan`/`lesson-analyze`, `lesson:progress`), `src-tauri/src/embedded/lesson-ops.ts` (slot V8 giữ nguyên `analyzeLesson`/`recommendGamesForAnalysis`/`lesson-projects.ts`/classifier), `src-tauri/src/lesson_store.rs` (tài liệu + `lessons/<id>.txt`, phân tích theo `cacheKey`, đề xuất), `src-tauri/src/ai_http.rs` (`AiGate`, `CancelFlag`, `post_json` không redirect, 300 s/90 s) + `src-tauri/src/embedded.rs` (`op_http`, `op_sha256`, `call_with_ai`), `src-tauri/src/api.rs` (15 lệnh + `cancel_ai`); renderer vẫn là `pages/create-wizard.ts` + `features/wizard/*` |
| Vỏ Tauri / hợp đồng desktop | `src-tauri/src/api.rs` (dispatch và lệnh Tauri), `src-tauri/src/lib.rs` (`generate_handler!`), `src/renderer/core/desktop-facade-schema.ts`, `tests/unit/tauri-contract.test.ts` |
| Lưu trữ (SQLite, `.egame`) | `src-tauri/src/storage.rs`, `library.rs`, `lesson_store.rs`, `src/services/game/game-package.ts` |
| Màu nền 5 thế giới trò chơi | `styles/game-worlds.css`, mục "NĂM THẾ GIỚI TRÒ CHƠI" + `GAME_WORLDS` trong `games/result-screen.ts` |
| Màn hình kết quả, trình chiếu, thi đấu đội | `features/games/result-screen.ts` |
| Lớp 3D dùng chung và thế giới theo trò | `features/three-game-interaction.ts` (API), `features/games/three-stage.ts` (mount/world/reactThree) |
| House Building Mode (kinh tế nhà, mẫu nhà) | `src/game-engine/house-build.ts` (kinh tế), `features/games/house.ts` (UI/3D) |
| Chòm sao tri thức — tên mới của "Kết nối vật thể", bảng sao 3D kéo thả (#171) | `src/shared/constellation-templates.ts` (7 chòm sao × 10 sao, chọn sao, ánh xạ id cũ, `constellationTemplateShape` → dạng `{stages}` cho bộ tiến độ cũ), `features/games/constellation.ts` (chip, thẻ, kéo thả, dải câu dài, dự phòng không WebGL), `constellationPairSides`/`constellationPairForStar` trong `features/games/connection.ts`; bản global cho renderer ở `src/renderer/constellation-core.ts` + `renderer/shared/constellation-{constants,data}.ts`; bố cục toàn màn hình ở `styles/game-constellation.css` |
| Tiến độ, quy tắc "ghép đủ và không sai mới lấp chặng" (dùng chung cho mọi hình) | `src/shared/connection-progress.ts` (typed) ↔ `src/renderer/connection-core.ts` (global, chạy song song, `tests/unit/connection-parity.test.ts` đối chiếu) |
| Chiều kéo (vế nào nằm trên sao) | `MatchingGameData.dragDirection` trong `src/shared/types.ts` + `lesson-types.ts`, zod ở `services/lesson/lesson-contracts.ts`, adapter `services/game/game-project-adapter.ts`, UI ở `features/wizard/step-configure.ts` + `features/editor/matching.ts` |
| Gói cài đặt | `package.json` → `build`, `build/installer.nsh`, `vendor/` |

## Desktop command flow

Renderer API đi qua `src/renderer/core/desktop-facade.ts` và
`desktop-adapter-tauri.ts`; hợp đồng channel nằm trong
`desktop-facade-schema.ts`. Lệnh mới cần được khai báo/dispatch trong
`src-tauri/src/api.rs`, đăng ký trong `src-tauri/src/lib.rs` và có kiểm thử hợp
đồng tương ứng. Không thêm Electron main/preload.

## Thứ tự CSS (dễ gây lỗi)

`src/renderer/styles/app.css` là entry Tailwind: `@import "tailwindcss"` + daisyUI
`@plugin`/`@theme`/`@source`, rồi `@import` 13 file khu vực (base → components →
shell → fullscreen → gameplay → navigation → game-race → game-animations →
setup-wizard → wizard → game-treasure → game-worlds → game-house → game-connection). Tailwind inline
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
3. API desktop mới → façade/schema renderer + Tauri command trong
   `src-tauri/src/api.rs`/`lib.rs` + kiểm thử hợp đồng.
4. Kiểm chứng: `npm run check`, `npm test`, `npm run verify:css`,
   `npm run check:renderer-globals`; với UI thì thêm một check trong `tests/ui/`.
5. Ghi `docs/STATUS.md` (và `docs/DECISIONS.md` nếu đổi quyết định). STATUS giữ
   3 bàn giao mới nhất + mục lục; chuyển bàn giao cũ sang `docs/handoff/status/`
   đúng ngày của nó. Chi tiết quyết định cũ đã ở `docs/handoff/decisions/`.
