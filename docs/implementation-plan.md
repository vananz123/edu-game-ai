# Implementation Plan — AI-assisted Lesson-to-Game Workflow

**Ngày lập:** 2026-10-19
**Phạm vi:** bổ sung luồng tạo trò chơi từ giáo án bằng AI local, không phá vỡ gameplay, `.egame` hay dữ liệu đang có.
**Trạng thái:** Phase 0 — chờ duyệt trước khi sửa code.

---

## 0. Quyết định đã chốt với chủ dự án

1. **Điểm vào UI:** thêm trang wizard mới “Tạo từ giáo án”; trang “Tạo trò chơi” hiện tại giữ làm lối vào phụ (“Tôi đã biết muốn tạo trò chơi nào”).
2. **Lưu trữ:** sidecar + giữ `EducationalGame`. Không migration phá vỡ tương thích; `.egame` và bảng `games` giữ nguyên.
3. **Tên thể loại trong pipeline mới:** `arena | scenario | matching | treasure | race`. Repo hiện dùng `quiz | scenario | matching | treasure-hunt | race`; adapter là nơi duy nhất ánh xạ.
4. **Một adapter duy nhất** tại ranh giới lưu/chơi. Renderer và AI service không tự chuyển đổi.
5. **Phạm vi bàn giao:** theo phase, nhưng chỉ nhận hoàn thành khi đủ 5 thể loại.
6. **Verify AI thật:** P6 mới cài llama.cpp/Qwen và chạy e2e; P3–P5 dùng mock và ghi rõ “chưa verify”.

---

## 1. Kiến trúc hiện tại

### 1.1 Tiến trình và ranh giới bảo mật

- `src/main.ts` — Electron main: cửa sổ, SQLite, file dialog, trích xuất tài liệu, settings, toàn bộ request AI, quản lý runtime llama.cpp.
- `src/preload.ts` — `contextBridge` expose allowlist `window.eduGame` (28 hàm hiện tại); renderer không có Node.js.
- `src/renderer/` — TypeScript biên dịch sang JS chạy trong Chromium; không framework, render bằng template string.
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` (đã có, không đổi).

### 1.2 UI hiện tại

- Một trang duy nhất trong `#pageContent`, điều hướng bằng `state.page`.
  - `src/renderer/core/render.ts`: map `renderers = { home, library, create, 'lesson-plans', 'my-projects', sessions, settings }`.
  - `src/renderer/shared.ts`: `state` (draft, importedDoc, selectedTemplate, …) và `pageNames`.
  - `src/index.html`: sidebar với các nút `data-page`.
- `src/renderer/pages/create.ts` là **một form dài** theo 5 zone (B chọn thể loại, C nội dung, D thiết lập, E xuất bản), không có bước/ trạng thái workflow.
- `src/renderer/features/document-assist.ts` + `renderDocumentAssistResults()` trong `create.ts`: chat phân tích tài liệu, gợi ý câu hỏi, `recommendedGames` (chỉ quiz/scenario).
- `src/renderer/features/game-editor.ts`: editor đầy đủ cho 5 thể loại, đã có kéo-thả (smoke63).
- `src/renderer/features/gameplay.ts`: engine/preview cho 5 thể loại.

### 1.3 Dữ liệu và lưu trữ

- `src/shared/types.ts`:
  - `GameTemplate = 'quiz' | 'scenario' | 'matching' | 'treasure-hunt' | 'race'`.
  - `EducationalGame` gồm trường chung + `questions: GameQuestion[]` + blob tuỳ chọn `matchingGame`, `treasureHunt`, `race`, `gameSetup`.
  - `DocumentAnalysis` (summary, keyPoints, suggestedQuestions, recommendedGames).
  - `EduGameBridge` — hợp đồng preload.
- SQLite tại `userData/edugame.sqlite`, 2 bảng: `games`, `sessions`; `ensureData()` tạo bảng và seed; `readDb`/`saveDb` đọc/ghi toàn bộ.
- `.egame` = JSON `{ packageFormat, packageVersion: 1, game }`, export/import qua `files:export-game` / `files:import-game`, có validate 4 thể loại.
- Settings tại `userData/settings.json`; model/runtime tại `userData/ai-local/`.

### 1.4 AI hiện tại

- `src/ai-core/ai-manager.ts`: spawn `llama-server.exe` (`shell: false`), port loopback ngẫu nhiên, health check, timeout, restart sau timeout.
- `src/ai-core/model-catalog.ts`, `model-installer.ts`, `runtime-installer.ts`: model pin + SHA-256, tải có resume, cài dưới `userData`.
- `src/ai-core/document-assist.ts`: tiện ích offline (cắt 12k ký tự, chọn evidence, dedupe câu hỏi).
- `src/main.ts`:
  - `ai:document-assist` → `buildDocumentAnalysisPrompt` → `requestJsonFromCompatibleApi` → zod `documentAnalysisSchema`.
  - `ai:generate` → `buildPrompt` → strict `json_schema` khi local → `gameDraftSchema` → `normalizeAiGameService` → `EducationalGame`.
  - `generateOffline` tạo bản nháp theo quy tắc, không gọi model.
- `src/services/ai-game-normalize.ts`, `ai-game-design.ts`: chuẩn hoá output AI và dựng `treasureHunt`/`race`.
- Validator runtime: `src/services/game-validation.ts` (`validateScenarioGame`, `validateMatchingGame`, `validateTreasureHuntGame`, `validateRaceGame`).

### 1.5 Test hiện có

- `npm test` = build + 11 suite node (`tests/*.test.ts`), trong đó có `document-assist`, `question-import`, `game-validation`, `ai-game-normalize`, `ai-game-design`.
- CDP smoke `tests/smoke56–63.js` (Electron mở với `--remote-debugging-port=9333`).
- A/B CSS: `tests/geom-ab.js`, `tests/modal-ab.js`.

---

## 2. Thành phần tái sử dụng

| Nhu cầu | Tái sử dụng | Ghi chú |
|---|---|---|
| Mở/đọc giáo án | `files:import-document` (`main.ts`) | Đã hỗ trợ TXT/MD/DOCX/PDF/PPTX, dialog do main mở, cắt 120k ký tự. Bổ sung metadata + lưu bản gốc. |
| Cắt ngữ cảnh local | `getLocalDocumentAnalysisExcerpt` | 12k ký tự, có marker “đã lược bớt”. |
| Gọi model | `requestJsonFromCompatibleApi`, `fetchAiEndpoint`, `ensureLocalRuntime`, `AIManager` | Sẽ rút phần dùng chung ra `services/ai-transport.ts`, giữ nguyên hành vi. |
| Phân tích tài liệu | `ai:document-assist` + zod schema | Dùng làm nền, mở rộng schema mới cho `LessonAnalysis`. |
| Sinh nội dung | `buildPrompt`, `gameDraftSchema`, `normalizeAiGame`, `buildTreasureHunt`, `buildRaceData`, `generateOffline` | Tái dùng prompt/chuẩn hoá hiện có; bổ sung prompt theo thể loại mới. |
| Validate | 4 validator trong `game-validation.ts` | Chạy lại sau adapter như lớp bảo vệ thứ hai. |
| Gameplay/preview | `gameplay.ts` | Không đổi; game sau adapter vẫn là `EducationalGame`. |
| Editor | `game-editor.ts` | Không đổi; mở bằng `openEditor(game, …)`. |
| Lưu/chơi | bảng `games`, `.egame`, `library:save-game`, `files:export-game` | Không đổi format, không đổi IPC hiện có. |
| Test | 11 suite + smoke56–63 | Lưới hồi quy bắt buộc chạy lại mỗi phase. |
| Validation thư viện | `zod@4` đã có trong dependencies | Không thêm dependency mới. |

### 2.1 Báo cáo tái sử dụng theo 10 yêu cầu

1. `EducationalGame`, `.egame`, gameplay: **giữ nguyên** — không sửa file gameplay, không đổi `packageVersion`.
2. Đã khảo sát DB: chỉ có `games`, `sessions`; **không có** bảng giáo án/phân tích/dự án → cần thêm mới, không có bảng tương đương để tái dùng.
3. Bảng mới cho giáo án nguồn, phân tích, đề xuất, bản nháp — chi tiết §3.
4. Discriminated union + zod riêng cho 5 thể loại — chi tiết §4.
5. Một adapter `game-project-adapter.ts` — chi tiết §5.
6. `schemaVersion` + validate trước khi lưu + lỗi chuyển đổi có mã — §5.4.
7. Draft lưu/mở/sửa không cần AI lại — §3.3.
8. Không sửa `.egame`; có test round-trip và fixture dữ liệu cũ — §8.
9. Unit test adapter/validation/store/tương thích — §8.
10. Báo cáo này là điểm tích hợp an toàn; code chỉ bắt đầu sau khi được duyệt.

---

## 3. Lưu trữ (sidecar, additive)

### 3.1 Bảng mới

```sql
CREATE TABLE IF NOT EXISTS lesson_documents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  ext TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  characters INTEGER NOT NULL,
  text_rel_path TEXT NOT NULL,
  sha256 TEXT,
  schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lesson_analyses (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  data_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES lesson_documents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS game_recommendations (
  id TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL,
  data_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (analysis_id) REFERENCES lesson_analyses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS game_projects (
  id TEXT PRIMARY KEY,
  game_id TEXT,
  status TEXT NOT NULL,           -- draft | review | ready
  step TEXT NOT NULL,             -- input | analyze | recommend | configure | generate | edit | done
  data_json TEXT NOT NULL,        -- GameProject (draft typed + gameSnapshot)
  schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_game_projects_updated_at ON game_projects(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_lesson_analyses_document ON lesson_analyses(document_id);
```

- **Không** đụng `games`, `sessions`, `readDb`, `saveDb`.
- CRUD riêng trong `src/services/lesson-store.ts` (prepared statements, transaction), tránh pattern `DELETE` toàn bộ của `saveDb`.
- Tệp giáo án: `userData/lessons/<id>.txt`; DB lưu `text_rel_path` (tương đối), renderer chỉ thấy id.
- Xoá document → cascade analysis/recommendation; project giữ snapshot độc lập.

### 3.2 `GameProject`

```ts
interface GameProject {
  id: string;
  schemaVersion: 1;
  status: 'draft' | 'review' | 'ready';
  step: WorkflowStep;
  lesson: { documentId: string; name: string; characters: number } | null;
  analysisId: string | null;
  recommendationId: string | null;
  config: GameConfig | null;
  draft: GameDraft | null;          // discriminated union
  gameSnapshot: EducationalGame | null; // kết quả adapter, dùng cho editor
  gameId: string | null;           // sau khi lưu vào thư viện
  createdAt: string;
  updatedAt: string;
}
```

- `gameSnapshot` là nguồn để **mở lại editor không cần AI**.
- Khi giáo viên sửa trong editor và lưu: lưu `games` như hiện tại, đồng thời `project:save-draft` cập nhật `gameSnapshot` + `gameId`.
- Nếu snapshot thiếu/lỗi schema: trả lỗi `PROJECT_SNAPSHOT_INVALID`, không tự sửa.

### 3.3 Vòng đời draft

1. Mỗi bước chuyển (input → analyze → recommend → configure → generate) tự lưu project.
2. Đóng app giữa chừng → mở lại, `project:list` hiện draft; `project:get` khôi phục đúng bước.
3. Mở lại ở bước `edit` → mở editor từ `gameSnapshot`, không gọi AI.
4. AI lỗi → project giữ nguyên dữ liệu đã có, `step` không tụt, cho retry.

---

## 4. Data contracts (discriminated union)

File mới `src/shared/lesson-types.ts`:

```ts
export type WorkflowGameType = 'arena' | 'scenario' | 'matching' | 'treasure' | 'race';
export type GenerationMode = 'fast' | 'deep';
export type CognitiveLevel = 'remember' | 'understand' | 'apply' | 'analyze';
export type WorkflowStep = 'input' | 'analyze' | 'recommend' | 'configure' | 'generate' | 'edit' | 'done';

export interface LessonDocument { id; name; ext; sizeBytes; characters; createdAt; schemaVersion: 1 }
export interface LessonObjective { id; description; cognitiveLevel; sourceExcerpt? }
export interface KeyConcept { id; term; explanation; sourceExcerpt? }
export interface LessonAnalysis {
  id; schemaVersion: 1;
  documentId; subject: string | null; grade: number | null; topic;
  objectives: LessonObjective[]; keyConcepts: KeyConcept[];
  uncertainties: string[]; sourceDocumentIds: string[]; createdAt;
}
export interface GameRecommendation {
  id; schemaVersion: 1; analysisId;
  gameType: WorkflowGameType; title; description; reason;
  learningObjectiveIds: string[];
  suggestedDurationMinutes: number; suggestedQuestionCount?: number;
}

export type GameDraft =
  | ArenaDraft | ScenarioDraft | MatchingDraft | TreasureDraft | RaceDraft;
```

Mỗi draft có `gameType` literal, `schemaVersion: 1`, và nội dung typed:

- `ArenaDraft`: `questions: ArenaQuestion[]` (prompt, options, correctOptionId, explanation, difficulty, points).
- `ScenarioDraft`: `context`, `situations: ScenarioSituation[]` (options có feedback, consequence, nextId?, score).
- `MatchingDraft`: `pairs: {id,left,right}[]`, `mode`, `pointsPerPair`, `wrongPenalty`.
- `TreasureDraft`: `character`, `intro`, `stages[]` (story, task, question, attempts, points, nextStageId).
- `RaceDraft`: `trackLength`, `maxRounds`, `teams[]`, `cells[]`, `questions[]`.

`src/services/lesson-contracts.ts` chứa zod schema + JSON-schema dùng cho `response_format` (local), validate chéo:

- ID duy nhất trong phạm vi draft.
- `correctOptionId` phải nằm trong `options`.
- Số câu/thử thách trong giới hạn cấu hình.
- Điểm/thời lượng trong khoảng cho phép.
- Treasure: chuỗi `nextStageId` không vòng lặp, stage cuối `null`.
- Race: `cell` trong `2..trackLength`, không trùng ô, type hợp lệ.

---

## 5. Adapter và tương thích

File mới `src/services/game-project-adapter.ts`:

```ts
export function toEducationalGame(project: GameProject): EducationalGame;
export function fromEducationalGame(game: EducationalGame): GameProject;
```

### 5.1 Ánh xạ thể loại

| Pipeline | `GameTemplate` |
|---|---|
| `arena` | `quiz` |
| `scenario` | `scenario` |
| `matching` | `matching` |
| `treasure` | `treasure-hunt` |
| `race` | `race` |

Ánh xạ ngược chỉ dùng khi mở game cũ trong wizard.

### 5.2 Ánh xạ nội dung

- `ArenaDraft.questions` → `GameQuestion[]` type `multiple-choice`/`true-false`/`fill-in-blank`/`short-answer`; giữ `points`, `difficulty`, `explanation`.
- `ScenarioDraft.situations` → `GameQuestion[]` type `scenario`; `feedback`, `nextQuestionId`, `scenarioScore` đi vào `GameOption`.
- `MatchingDraft` → `matchingGame: MatchingGameData`.
- `TreasureDraft` → `treasureHunt: TreasureHuntData` + `questions` (bản sao câu chặng, như generator hiện tại).
- `RaceDraft` → `race: RaceData` + `questions` type `multiple-choice` kèm `difficulty`.

### 5.3 Ranh giới

- Main process: AI JSON → normalize → zod (`GameDraft`) → `toEducationalGame` → chạy 4 validator hiện có → trả `{ project, game }`.
- Renderer chỉ nhận `project`/`game` đã validate; không tự map.
- Editor/gameplay chỉ nhận `EducationalGame` như hiện tại.

### 5.4 Lỗi và phiên bản

- `schemaVersion` hiện tại: **1**.
- Mở project có version > 1 → `PROJECT_VERSION_UNSUPPORTED` kèm hướng dẫn cập nhật.
- Version < 1 (tương lai) → chạy migration table; nếu không có → `PROJECT_MIGRATION_MISSING`.
- Lỗi adapter: `ADAPTER_INVALID_DRAFT`, `ADAPTER_UNKNOWN_TYPE`, `ADAPTER_VALIDATION_FAILED` — hiển thị tiếng Việt, log kỹ thuật ở main.
- Không âm thầm sửa dữ liệu sai (khác với `normalizeAiGame` hiện có, chỉ dùng cho đường AI draft).

---

## 6. IPC và preload

| Kênh mới | Đầu vào | Đầu ra |
|---|---|---|
| `lesson:save-document` | `{ documentId?, name, ext, sizeBytes, text }` | `LessonDocument` (ghi file + DB) |
| `lesson:analyze` | `{ documentId, mode, requestId }` | `LessonAnalysis` + `project` |
| `lesson:recommend` | `{ analysisId, requestId }` | `GameRecommendation[]` |
| `lesson:generate` | `{ projectId, gameType, config, generationMode, requestId }` | `{ project, game }` |
| `project:save-draft` | `{ project }` (validate ở main) | `GameProject` |
| `project:get` | `{ id }` | `GameProject` |
| `project:list` | `{}` | `GameProject[]` (metadata, không kèm text dài) |
| `ai:cancel` | `{ requestId }` | `{ ok }` |

- `files:import-document` được mở rộng trả thêm `sizeBytes`, nhưng **giữ** `{ name, text, characters }` để không phá UI cũ.
- Mọi payload validate bằng zod ở main; renderer không gửi đường dẫn file.
- Map `requestId` → `AbortController`, huỷ khi `ai:cancel` hoặc cửa sổ đóng.
- Giữ nguyên toàn bộ kênh cũ.

---

## 7. File dự kiến tạo / chỉnh sửa

### Tạo mới

```
src/shared/lesson-types.ts                 contracts typed cho workflow
src/services/lesson-contracts.ts           zod + JSON schema 5 thể loại
src/services/lesson-normalize.ts           AI JSON → LessonAnalysis/Recommendation/GameDraft
src/services/lesson-prompts.ts             analyze / recommend / generate / repair
src/services/lesson-store.ts               SQLite CRUD 4 bảng + file giáo án
src/services/game-project-adapter.ts       toEducationalGame / fromEducationalGame
src/services/lesson-workflow.ts            orchestrator + cancel + retry/repair
src/services/ai-transport.ts               rút từ main.ts (chat/completions, parse JSON)
src/renderer/pages/create-wizard.ts        khung wizard + step router
src/renderer/features/wizard/step-input.ts
src/renderer/features/wizard/step-analysis.ts
src/renderer/features/wizard/step-recommend.ts
src/renderer/features/wizard/step-configure.ts
src/renderer/features/wizard/step-generate.ts
src/renderer/features/wizard/state.ts      state riêng của wizard (không nhét vào state toàn cục)
tests/lesson-contracts.test.ts
tests/game-project-adapter.test.ts
tests/lesson-store.test.ts
tests/lesson-workflow.test.ts
tests/smoke64.js                           wizard happy path
tests/smoke65.js                           lỗi/offline/draft resume
```

### Chỉnh sửa

```
src/main.ts                    đăng ký IPC mới, tạo bảng, khởi tạo store; rút transport
src/preload.ts                 expose 8 hàm mới
src/shared/types.ts            thêm type bridge; giữ nguyên type cũ
src/renderer/shared.ts         thêm page 'create-wizard' + state wizard tối thiểu
src/renderer/core/render.ts    đăng ký renderer mới
src/index.html                 thêm nav item “Tạo từ giáo án”
src/renderer/styles/app.css    component CSS cho wizard trong @layer components
package.json                   thêm test mới vào script npm test
docs/STATUS.md, ROADMAP.md, DECISIONS.md, AGENT_HANDOFF.md
```

Không sửa: `gameplay.ts`, `game-editor.ts` (trừ điểm gọi AI regenerate ở P7), `game-validation.ts` (chỉ import), format `.egame`, bảng `games`.

---

## 8. Thứ tự triển khai và tiêu chí nghiệm thu

### P0 — Kế hoạch

- [x] Khảo sát repo, báo cáo tái sử dụng.
- [x] Chốt quyết định với chủ dự án.
- [x] Duyệt tài liệu này (chủ dự án "go" ngày 2026-10-19).
- **Gate:** không sửa code trước khi duyệt. ✅

### P1 — Contracts + adapter

- [x] `lesson-types.ts`, `lesson-contracts.ts`, `game-project-adapter.ts`.
- [x] Test: validate đúng/sai 5 loại; adapter 5 chiều; round-trip ổn định; lỗi version/type.
- [x] Fixture `EducationalGame` mẫu cho cả 5 template (lấy từ seed/test hiện có).
- **Gate:** `npm run check`; `node dist/tests/lesson-contracts.test.js`; `node dist/tests/game-project-adapter.test.js`. ✅ (2026-10-19)

### P2 — Storage + draft

- 4 bảng mới, `lesson-store.ts`, lưu text ra file.
- IPC `project:*`.
- Test: lưu/mở/xoá; cascade; schemaVersion; dữ liệu cũ không đổi; `.egame` round-trip.
- **Gate:** test store + `npm test` cũ vẫn xanh.

### P3 — AI transport + workflow

- Rút `ai-transport.ts` khỏi `main.ts` (giữ hành vi), thêm `AbortController` + `requestId`, retry/repair 1 lần.
- `lesson-prompts.ts`, `lesson-workflow.ts`.
- Test mock: JSON hợp lệ, JSON hỏng, thiếu trường, timeout, cancel, model chưa chạy.
- **Gate:** test workflow + regression `ai:*` cũ.

### P4 — Analyze + recommend

- IPC `lesson:analyze`, `lesson:recommend`.
- Normalize + validate `LessonAnalysis`, `GameRecommendation`.
- Test mock + fixture; kiểm tra mục tiêu/mức nhận thức/uncertainties.
- **Gate:** test contracts + workflow.

### P5 — Wizard bước 1–4

- Trang mới, nhập/paste/chọn tệp, sửa analysis, chọn 2–3 gợi ý, cấu hình theo thể loại.
- Trạng thái loading/lỗi/retry/back; giữ dữ liệu khi quay lại.
- **Gate:** `smoke64` (happy path), `smoke65` (lỗi/back), `smoke56–63` không đổi.

### P6 — Generate 5 loại + draft + editor

- `lesson:generate` cho 5 loại, fast/deep.
- Validate → adapter → `gameSnapshot` → mở editor.
- Lưu draft, mở lại ở bước edit không gọi AI.
- Cài llama.cpp/Qwen trên máy, chạy e2e thật (analyze → recommend → generate → edit → save → play).
- **Gate:** e2e local thật; `smoke64/65`; regression đầy đủ.

### P7 — Hoàn thiện

- AI regenerate một câu trong editor (chỉ gửi dữ liệu cần thiết).
- Error UX: thiếu model, runtime chưa chạy, hết RAM, JSON sai, mất kết nối, huỷ.
- `npm run check`, `npm test`, `npm run dist:win`, cập nhật docs.
- **Gate:** báo cáo đầy đủ file/thay đổi/lệnh/chưa verify.

---

## 9. Rủi ro kỹ thuật và phương án

| Rủi ro | Mức | Phương án |
|---|---|---|
| Model 2B/4B trả JSON sai/thiếu trường | Cao | strict `json_schema` khi local, max token hợp lý, repair 1 lần, sau đó báo lỗi + cho sửa tay; không tự bịa dữ liệu. |
| `main.ts` 66KB `@ts-nocheck` | Trung bình | Rút hàm theo hành vi, test hồi quy `ai:*`; không refactor ngoài phạm vi. |
| `saveDb` xoá/ghi toàn bộ | Trung bình | Bảng mới dùng CRUD riêng; không mở rộng `saveDb`. |
| Renderer state toàn cục dễ xung đột | Trung bình | Wizard giữ state riêng (`features/wizard/state.ts`), chỉ đăng ký `state.page`. |
| Giáo án dài bị cắt 12k ở local | Trung bình | Hiển thị rõ “đã lược bớt”, cho chọn đoạn/ chương; không tuyên bố phân tích toàn văn. |
| PDF scan không có text | Thấp | Giữ thông báo cần OCR ngoài; phát hiện text rỗng và chặn trước khi gọi AI. |
| 5 thể loại khác luật | Cao | Schema + validator riêng; cấu hình theo thể loại; test từng loại. |
| `.egame` bị thay đổi ngoài ý muốn | Cao | Không sửa `files:*`; test round-trip export→import; so sánh fixture. |
| Dữ liệu cũ không mở được | Trung bình | `fromEducationalGame` + test với game seed và game smoke hiện có. |
| Trùng lặp logic chuẩn hoá | Trung bình | Chỉ một adapter; `normalizeAiGame` cũ giữ cho luồng cũ, adapter mới không gọi lại. |
| Local runtime chưa verify | Cao | P6 bắt buộc e2e thật; trước đó mọi báo cáo ghi “mock, chưa verify”. |

---

## 10. Test matrix

| Loại | File | Nội dung |
|---|---|---|
| Unit | `lesson-contracts.test.ts` | zod 5 loại, case thiếu đáp án/ID trùng/ô race sai/chuỗi treasure vòng lặp |
| Unit | `game-project-adapter.test.ts` | map 5 chiều, round-trip, version lỗi, type lạ |
| Unit | `lesson-store.test.ts` | SQLite temp: CRUD, cascade, draft resume, legacy game không đổi |
| Unit | `lesson-workflow.test.ts` | mock provider: happy path, JSON hỏng + repair, timeout, cancel, model chưa chạy |
| Tương thích | trong store/adapter test | fixture `EducationalGame` 5 template; `.egame` JSON round-trip |
| CDP | `smoke64.js` | wizard happy path: nhập → analysis → chọn → cấu hình → generate → editor → save |
| CDP | `smoke65.js` | lỗi AI, back không mất dữ liệu, resume draft sau reload, AI offline vẫn mở draft |
| Regression | `smoke56–63.js` | editor/gameplay/library/Tailwind không đổi |
| Build | `npm run dist:win` | installer chứa code mới (P7) |

---

## 11. Definition of Done (map với spec)

| # | Yêu cầu | Phase |
|---|---|---|
| 1 | Nhập/tải giáo án hợp lệ | P2, P5 |
| 2 | Phân tích bằng AI local thật | P4, P6 |
| 3 | Xem lại/sửa analysis | P5 |
| 4 | Đề xuất 2–3 game | P4, P5 |
| 5 | Chọn + cấu hình 5 thể loại | P5 |
| 6 | AI sinh đúng schema thể loại | P1, P3, P6 |
| 7 | Phát hiện dữ liệu sai trước khi chơi | P1, P2 |
| 8 | Sửa tay + preview | P6 (tái dùng editor hiện có) |
| 9 | Lưu/mở lại | P2, P6 |
| 10 | Gameplay/điểm bằng TypeScript | Không đổi (đã có) |
| 11 | Không phụ thuộc AI online | Thiết kế: wizard chỉ gọi local |
| 12 | AI hỏng vẫn chơi game đã lưu | Không đổi (đã có) |
| 13 | Test/build báo cáo trung thực | Mọi phase |

---

## 12. Câu hỏi còn mở

Đã chốt: điểm vào UI, mô hình lưu trữ, phạm vi phase, thời điểm verify model thật.

Còn cần chủ dự án xác nhận khi tới phase tương ứng:

1. **P5:** nhãn UI dùng tiếng Việt (“Đấu trường kiến thức”, “Giải mã kho báu”) — mặc định có; tên kỹ thuật `arena/treasure` chỉ trong code.
2. **P6:** số câu mặc định và thời lượng mặc định cho từng thể loại (đề xuất: 8 câu / 10 phút; treasure 5 chặng; race 12 ô).
3. **P6:** có cần giới hạn cứng số lần generate/ngày ở bản pilot không (spec không yêu cầu; đề xuất chưa làm).
4. **P7:** có cần xuất kèm “nhật ký tạo bằng AI” trong `.egame` không (đề xuất không, để giữ format).
