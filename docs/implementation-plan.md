# Implementation Plan — AI-assisted Lesson-to-Game Workflow

**Ngày lập:** 2026-10-19
**Phạm vi:** bổ sung luồng tạo trò chơi từ giáo án bằng AI local, không phá vỡ gameplay, `.egame` hay dữ liệu đang có.
**Trạng thái:** P0-P6 đã code xong (2026-10-19); P6 **chưa đạt cổng e2e với model thật** (xem §8 P6) nên còn P7. Từ 2026-10-20 có **spec tối ưu mới** (`docs/update-AI-local.txt`) → kế hoạch ở §13, trong đó **O0–O4 đã xong** (O1: chọn thể loại bằng TypeScript, 0 lượt Qwen; O2: kiểm tra chất lượng nội dung thuần TypeScript; O3: chia đoạn + truy xuất từ vựng, prompt generate ngắn hơn; O4: embedding MiniLM thật trong process riêng, cache vector, đo chất lượng/RAM); O5–O7 tiếp theo. Số liệu kiểm chứng nằm trong `docs/STATUS.md` và `docs/BENCHMARKS.md`.

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

- [x] 4 bảng mới, `lesson-store.ts`, lưu text ra file.
- [x] IPC `project:*` (+ `lesson:save-document`/`lesson:get-document`).
- [x] Test: lưu/mở/xoá; cascade; schemaVersion; dữ liệu cũ không đổi; `.egame` round-trip.
- **Gate:** test store + `npm test` cũ vẫn xanh. ✅ (2026-10-19, `tests/lesson-store.test.ts` chạy qua Electron node)

### P3 — AI transport + workflow

- [x] Rút `ai-transport.ts` khỏi `main.ts` (giữ hành vi), thêm `AbortController` + `requestId`, retry/repair 1 lần.
- [x] `lesson-prompts.ts`, `lesson-normalize.ts`, `lesson-workflow.ts`.
- [x] Test mock: JSON hợp lệ, JSON hỏng, thiếu trường, timeout, cancel, model chưa chạy.
- **Gate:** test workflow + regression `ai:*` cũ. ✅ (2026-10-19, `tests/ai-transport.test.ts` + `tests/lesson-workflow.test.ts`; CDP `ai:generate` offline + `ai:document-assist` lỗi cấu hình + `ai:cancel` 5/5, smoke62 9/9, smoke63 49/49)

### P4 — Analyze + recommend

- [x] IPC `lesson:analyze`, `lesson:recommend` (+ `lesson:get-analysis`, `lesson:recommendations` để mở lại draft).
- [x] Normalize + validate `LessonAnalysis`, `GameRecommendation` (+ kiểm tra chéo `learningObjectiveIds`).
- [x] Test mock + fixture; kiểm tra mục tiêu/mức nhận thức/uncertainties.
- **Gate:** test contracts + workflow. ✅ (2026-10-19, `tests/lesson-projects.test.ts` + mở rộng `tests/lesson-workflow.test.ts`; CDP wiring 8/8, smoke62 9/9, smoke63 49/49; **happy path với model thật để P6**)
- Ghi chú: `lesson:analyze` trả `{ analysis, project }`, `lesson:recommend` trả `{ recommendations, project }` (khác bảng §6 vốn ghi `GameRecommendation[]`) để lưu tiến độ draft; helper dựng project ở `lesson-projects.ts`.

### P5 — Wizard bước 1–4

- [x] Trang mới, nhập/paste/chọn tệp, sửa analysis, chọn 2–3 gợi ý, cấu hình theo thể loại.
- [x] Trạng thái loading/lỗi/retry/back; giữ dữ liệu khi quay lại.
- **Gate:** `smoke64` (happy path), `smoke65` (lỗi/back), `smoke56–63` không đổi. ✅ (2026-10-19, `smoke64` **37/37**, `smoke65 runtime` **18/18** + `smoke65 output` **14/14**, regression `smoke56` **56/56**, `smoke62` **9/9**, `smoke63` **49/49**; `npm test` 17 suites)
- **Thay đổi phạm vi so với bản đầu (chủ dự án chốt 2026-10-19):** trang "Tạo trò chơi" nay **chỉ tạo thủ công**; mọi AI dời hẳn sang trang "Tạo từ giáo án" (xem DECISIONS #15). Bước 5 `generate` mới là **placeholder** (P6 điền vào).
- **Bổ sung hợp đồng P5:** IPC `lesson:save-analysis` (lưu chỉnh sửa analysis của giáo viên, không gọi AI) + bridge `saveLessonAnalysis`. `LessonWorkflowError` nhúng `[CODE]` vào `message` để renderer lấy lại mã lỗi qua IPC.
- **Ghi chú kiểm thử:** `smoke64`/`smoke65` dùng fixture cho phản hồi model (`EDUGAME_AI_TEST_DIR`, chỉ khi `!app.isPackaged` — DECISIONS #16) vì máy chưa cài model; phần còn lại (IPC/store/adapter/validate) là thật. `tests/smoke60.js` (AI trên trang tạo trò chơi) chuyển sang `tests/legacy/` và **không còn chạy**.

### P6 — Generate 5 loại + draft + editor

- [x] `lesson:generate` cho 5 loại, fast/deep (main validate → 1 adapter → `gameSnapshot`; giữ nguyên `EducationalGame`/gameplay).
- [x] Validate → adapter → `gameSnapshot` → mở editor (dùng lại `openEditor` của trình soạn thảo cũ).
- [x] Lưu draft, mở lại ở bước edit **không gọi AI** (`game_projects.gameSnapshot` + `step='edit'`).
- [~] Cài llama.cpp/Qwen trên máy (runtime + Qwen3.5-2B Q4_0, xác minh SHA-256) ✅; e2e thật analyze ✅ + recommend ✅; **generate ❌ `AI_TRUNCATED`** → e2e thật **chưa hoàn tất**.
- **Gate (chưa đạt):** phần **fixture/wiring đạt** (`smoke67` 52/52 cả 5 loại, `smoke66 fixture` 26/26, `smoke64` 37/37, `smoke65` 18/18 + 14/14, `npm run check`, `npm test` 17 suites). Phần **model thật chưa đạt**: generate dừng ở `AI_TRUNCATED`, và môi trường tự đóng cửa sổ Electron sau ~1–2 phút (kể cả khi rảnh) nên không chạy nổi một lượt real dài. Chủ dự án đã đồng ý **bỏ qua cổng này** (2026-10-20) để chuyển sang spec tối ưu (§13) — xem `docs/STATUS.md` mục P6.
- Ghi chú: nội dung AI tạo ra đi qua **hai lớp** kiểm tra — zod theo từng loại draft (`lesson-contracts`) rồi tới 4 validator cũ trên `EducationalGame` sau khi adapter (`game-validation`). Nếu lớp 2 thất bại, lỗi trả về mã `GENERATION_INVALID` để renderer hướng dẫn thử lại/giảm số lượng. `tests/smoke66.js fixture` kiểm tra toàn bộ đường dây (IPC → store → adapter → editor → thư viện) khi chỉ phản hồi của model là fixture.

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

---

## 13. Tối ưu quy trình AI (spec chủ dự án 2026-10-20)

Nguồn yêu cầu: `docs/update-AI-local.txt`. Mục tiêu: **chỉ gọi Qwen cho việc thật sự cần năng lực ngôn ngữ**, tái sử dụng mọi kết quả, không gọi AI ở bước chọn thể loại/cấu hình, không sinh lại phần đã đạt, và **đo trước/sau** trên máy mục tiêu (16 GB RAM, CPU dòng U, GPU tích hợp). Không viết lại app; giữ `EducationalGame`/`.egame`/gameplay.

### 13.1 Audit hiện trạng (đo trên Qwen3.5-2B Q4_0, CPU 8 luồng)

| # | Bước | Hiện tại | Vấn đề |
|---|---|---|---|
| 1 | Phân tích | `lesson:analyze` → `analyzeLesson` (`maxTokens` 1024/1536) gửi **12.000 ký tự** giáo án (`getLocalDocumentAnalysisExcerpt`). Lưu vào `lesson_analyses`. | Chưa có cache key: đổi cấu hình/không đổi tài liệu vẫn phân tích lại. Chưa lập chỉ mục. |
| 2 | Đề xuất thể loại | `lesson:recommend` → `recommendGames` (`maxTokens` 1024) — **một lượt Qwen chỉ để chọn 1 trong 5 thể loại** đã biết. | **Lãng phí hoàn toàn**: đây là quy tắc xác định, chuyển sang TypeScript. Đo ~67 s/lượt. |
| 3 | Cấu hình | Không gọi AI. | Đã đúng. |
| 4 | Sinh nội dung | `lesson:generate` → `generateGameDraft` (`maxTokens` 2048/4096) gửi `document.text.slice(0, 6000)` + analysis + config + schema. | Gửi lại văn bản thô thay vì đoạn kiểm thức liên quan; 2048 token không đủ cho 1 bộ 4 câu với model 2B → `AI_TRUNCATED`. |
| 5 | Sửa lỗi | `runStructuredStep` sửa **toàn bộ** output 1 lần khi JSON/schema sai. | Sửa cả bộ khi chỉ 1 câu hỏng; chưa có tạo lại từng câu. |
| 6 | Lưu trữ | 4 bảng sidecar; tài liệu ở `userData/lessons/<id>.txt` + `sha256`. | Có `sha256` nhưng **chưa dùng để cache**; chưa có bảng đoạn/embedding/kết quả sinh. |
| 7 | Embedding | **Chưa có.** `ai-manager` spawn llama-server với `--model/--ctx-size/--threads/--n-gpu-layers`, không có `--embedding`; catalog chỉ có 3 model Qwen. | Phải thêm runtime embedding riêng (MiniLM GGUF) + chọn model có chất lượng tiếng Việt **đã kiểm chứng**. |
| 8 | Fast/Deep | `buildGenerationOptions` chỉ hỗ trợ `enable_thinking: false`. | Chưa có Deep “thinking”; chưa xác minh chat template của đúng GGUF. |
| 9 | Đo lường | Không có benchmark. | Không thể chứng minh tối ưu; số liệu hiện chỉ là đo tay. |

**Số đo hiện có:** request analyze y hệt (prompt thật + `json_schema` thật) → HTTP 200, **56 s / 413 token**; đo trực tiếp 179 token / 16 s ≈ **11,1 tok/s**; `lesson:recommend` ~**67 s**; analyze trong app ~**7,5 phút** (có lượt sửa) — cao hơn hẳn 56 s, cho thấy chi phí prompt + lượt sửa là đáng kể.

### 13.2 Luồng đích

```
Nhập giáo án
  └─ (TS) chuẩn hoá + sha256            [0 lượt Qwen]
  └─ (TS) chunk + index                 [0 lượt, chỉ embedding MiniLM]
Phân tích            analyze           [1 lượt Qwen, cache theo fingerprint+model+prompt]
Chọn thể loại        rules             [0 lượt Qwen]  ← thay lesson:recommend
Cấu hình             validate (TS)     [0 lượt Qwen]
Sinh nội dung        retrieve + generate [1 lượt Qwen (+ lô nếu số lượng lớn)]
Kiểm tra             zod + validator + quality (TS) [0 lượt]
Sửa                  chỉ câu hỏng      [0–N lượt, có ngân sách]
Xem trước            editor            [0 lượt]
```

### 13.3 Module mới / sửa

**Tạo mới**

```
src/services/game-type-rules.ts      bảng năng lực 5 thể loại (mức nhận thức, dạng dữ liệu, mục tiêu)
src/services/game-recommender.ts     đề xuất 2–3 thể loại bằng quy tắc (thay lượt Qwen #2)
src/services/lesson-chunker.ts       chia giáo án theo tiêu đề/đoạn, giữ offset + sha256 từng đoạn
src/services/lesson-retrieval.ts     cosine + khử trùng lặp + giới hạn ngân sách văn bản
src/services/lesson-quality.ts       trùng lặp, đủ số lượng, phương án nhiễu, bao phủ mục tiêu (warning)
src/services/generation-batching.ts  sinh cả bộ vs theo lô 4–5 (cấu hình được)
src/ai-core/embedding-manager.ts     llama-server thứ hai với --embedding + MiniLM GGUF
src/ai-core/embedding-catalog.ts     manifest MiniLM (nguồn, sha256, dim, license, tiếng Việt)
tests/game-recommender.test.ts
tests/lesson-chunker.test.ts
tests/lesson-retrieval.test.ts
tests/lesson-quality.test.ts
tests/bench-ai.js                    harness benchmark (mục 12 của spec)
docs/BENCHMARKS.md                   kết quả trước/sau
```

**Sửa**

```
src/services/lesson-store.ts     thêm bảng chunk/embedding/cache + migration additive
src/services/lesson-prompts.ts   prompt generate chỉ nhận đoạn truy xuất (không gửi 6k thô)
src/services/lesson-workflow.ts  dùng recommender TS; tạo lại từng câu; ngân sách token
src/main.ts                      IPC index/search/regenerate-item; bỏ gọi AI ở recommend
src/ai-core/ai-manager.ts        hỗ trợ chế độ embedding (hoặc tách manager riêng)
src/ai-core/generation-options.ts thêm enable_thinking cho Deep (sau khi xác minh)
src/shared/types.ts, preload.ts  bridge mới; giữ nguyên hàm cũ
src/renderer/features/wizard/step-generate.ts  5 trạng thái tiến trình, Fast/Deep, huỷ
src/renderer/features/game-editor.ts           nút "Tạo lại câu này" (chỉ khi chỉnh sửa AI)
```

Không đụng: `gameplay.ts`, `game-validation.ts` (chỉ import), `.egame`, bảng `games`.

### 13.4 Lưu trữ bổ sung (additive)

```sql
CREATE TABLE IF NOT EXISTS lesson_chunks (
  id TEXT PRIMARY KEY, document_id TEXT NOT NULL, ordinal INTEGER NOT NULL,
  heading TEXT, text TEXT NOT NULL, char_start INTEGER, char_end INTEGER,
  sha256 TEXT NOT NULL, FOREIGN KEY (document_id) REFERENCES lesson_documents(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS lesson_chunk_embeddings (
  chunk_id TEXT NOT NULL, model_id TEXT NOT NULL, dim INTEGER NOT NULL,
  vector BLOB NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY (chunk_id, model_id),
  FOREIGN KEY (chunk_id) REFERENCES lesson_chunks(id) ON DELETE CASCADE
);
-- cache tái sử dụng
ALTER TABLE lesson_analyses ADD COLUMN cache_key TEXT;   -- sha256(text)+model+promptVersion
CREATE TABLE IF NOT EXISTS game_generation_cache (
  cache_key TEXT PRIMARY KEY, draft_json TEXT NOT NULL, created_at TEXT NOT NULL
);
```

- Cột mới thêm bằng `ALTER TABLE` có kiểm tra `PRAGMA table_info` (không phá DB cũ).
- `cache_key` rỗng với dữ liệu cũ → coi là “không cache”, phân tích lại một lần rồi điền.
- Vector lưu `BLOB` `Float32Array`; số đoạn nhỏ (hàng trăm) nên cosine quét tuyến tính là đủ, **không** thêm vector DB.

### 13.5 Phase và cổng nghiệm thu

- **O0 — Audit + kế hoạch (tài liệu này).** Cổng: chủ dự án duyệt; **không sửa code** trước khi duyệt.
- **O1 — Đề xuất thể loại bằng TypeScript.** `game-type-rules` + `game-recommender`; `lesson:recommend` giữ nguyên shape nhưng **không gọi model**; thêm `reason`/`warnings`. Test quy tắc cho 5 thể loại + dữ liệu thiếu. **Cổng:** *số lượt Qwen khi chọn thể loại = 0*; `smoke64` vẫn xanh. → **Xong 2026-10-20:** 0 lượt Qwen (hàm đồng bộ, không client), `tests/game-recommender.test.ts`, `smoke64` **39/39** + `smoke65 output` **18/18** (viết lại: lỗi AI kiểm ở bước generate), `smoke66 fixture` 26/26, `smoke67` 52/52, `smoke56/62/63` xanh, `npm test` 18 suites. Thêm hàng "Hoặc chọn thể loại khác" để giáo viên luôn chọn được cả 5 thể loại.
- **O2 — Validator chất lượng + trùng lặp.** `lesson-quality` (lỗi cứng vs cảnh báo), hiển thị ở bước xem trước. **Cổng:** unit test; không có false-positive chặn giáo viên. → **Xong 2026-10-20:** `checkDraftQuality` cho cả 5 thể loại (trùng/gần trùng câu, lựa chọn trùng, thiếu đáp án, nhiễu chung chung, tình huống không có phương án tốt nhất, cặp trùng, chuỗi chặng hỏng/vòng lặp, ô đua ngoài đường, bao phủ mục tiêu), trả kèm `lesson:generate` + IPC `lesson:quality` khi mở lại draft (0 lượt Qwen). Wizard hiện bảng lỗi/cảnh báo nhưng **không chặn** editor (DECISIONS #21) nên không thể chặn nhầm giáo viên. `tests/lesson-quality.test.ts`, `smoke66 fixture` 29/29, `smoke67` 67/67, `npm test` 19 suites; 5 fixture happy 0 lỗi/0 cảnh báo.
- **O3 — Chunk + truy xuất (chưa cần model mới).** `lesson-chunker`, `lesson-store` chunk, `lesson-retrieval` với embedder **giả lập từ vựng** để kiểm tra đường ống; prompt generate chuyển sang dùng đoạn. **Cổng:** đường ống chạy end-to-end với fixture; `AI_TRUNCATED` giảm nhờ prompt ngắn hơn (đo). → **Xong phần đường ống 2026-10-20:** `lesson-chunker` (đoạn/câu/cắt cứng, tiêu đề, offset), bảng `lesson_chunks` (có sẵn cột embedding cho O4), `lesson-retrieval` BM25-lite `lexical-v1` + `buildRetrievalQuery` theo mục tiêu trọng tâm, `lesson:generate` chỉ gửi ≤6 đoạn/4500 ký tự và trả `context`; `npm test` 21 suites, `smoke66 fixture` 32/32, `smoke67` 77/77. **Còn thiếu:** đo mức giảm `AI_TRUNCATED` và chất lượng trên giáo án dài thật — cần model + bộ thử (O4/O6).
- **O4 — MiniLM thật.** ✅ **Xong 2026-10-20:** `embedding-catalog` (manifest MiniLM đa ngôn ngữ Q8_0, URL pinned, SHA-256, 384 chiều) + `embedding-manager` (llama-server **riêng** với `--embedding --pooling mean`, `POST /v1/embeddings`, kiểm số chiều); trình cài hiện có tải + verify SHA-256 và cài kèm model chat; vector cache trong `lesson_chunks`; `selectChunksByVectors` dùng cosine sau cùng seam `selectChunks`, tự rơi về `lexical-v1` nếu thiếu model/runtime. **Cổng:** đo trên 16 câu tiếng Việt — câu diễn đạt lại trúng hạng 1 **6/6** (lexical 3/6), câu trùng từ 8/10 (lexical 10/10) nhưng mọi đoạn đích vẫn trong ngân sách 6 đoạn; RAM đỉnh server embedding **216 MB**, chat 2.114 MB → trong ngân sách 16 GB. Số liệu + lệnh chạy lại: `docs/BENCHMARKS.md`. Bộ thử tổng hợp, chưa phải giáo án dài thật (O6).
- **O5 — Cache + lô + tạo lại từng câu.** Cache analysis/generation theo `cache_key`; batching cấu hình được; IPC `lesson:regenerate-item` + nút trong editor. **Cổng:** tạo game thứ hai từ cùng giáo án **không** phân tích lại; tạo lại 1 câu không đổi các câu khác.
- **O6 — Fast/Deep + benchmark.** Xác minh `enable_thinking` trên đúng GGUF/llama.cpp; nếu không ổn định → khởi động lại cùng model với cấu hình phù hợp; chạy `tests/bench-ai.js` cho bộ giáo án, ghi `docs/BENCHMARKS.md`. **Cổng:** số liệu trước/sau + \(số lượt Qwen trung bình\).
- **O7 — UI tiến trình + hồi quy + build.** 5 trạng thái tiến trình, Fast/Deep, huỷ an toàn; `npm run check`, `npm test`, `smoke56/62/63/64/65/66/67`; `dist:win`; cập nhật docs.

### 13.6 Rủi ro mới

| Rủi ro | Mức | Phương án |
|---|---|---|
| MiniLM “có tên” nhưng truy xuất tiếng Việt kém | Cao | Bắt buộc đo trên bộ giáo án tiếng Việt trước khi chốt (spec §4.2); nếu kém → thử model khác hoặc lai BM25 từ vựng (đã có `document-assist` overlap) |
| Chạy 2 llama-server (Qwen + MiniLM) tranh RAM/CPU | Trung bình | MiniLM nhỏ, chỉ nạp khi index/retrieve; tắt khi rảnh; đo RAM đỉnh |
| `--embedding` thay đổi hành vi server hiện tại | Trung bình | Dùng **tiến trình riêng**, không sửa tham số của Qwen; test health riêng |
| Cache trả nội dung cũ khi giáo viên muốn mới | Trung bình | Cache chỉ cho analysis/embedding; generation cache **bỏ qua** khi bấm “Tạo lại”; có nút xoá cache |
| Tạo lại từng câu làm mất cân bằng độ khó/bao phủ | Trung bình | Kiểm tra chất lượng sau mỗi lần thay; cảnh báo nếu lệch |
| Quy tắc đề xuất sai/thiên lệch | Trung bình | Luôn cho giáo viên tự chọn thể loại khác (spec §3); test 5 thể loại |
| Tối ưu làm mất tính đúng đắn sư phạm | Cao | Không đánh đổi: validator chỉ chặn lỗi cơ học, nội dung không xác minh được → giáo viên duyệt |

### 13.7 Kế hoạch kiểm thử / benchmark (spec §12)

- Bộ giáo án: 6–8 tệp tiếng Việt nhiều môn/khối (`tests/fixtures/lessons/`), không dùng dữ liệu học sinh thật.
- Đo: thời gian phân tích, index, truy xuất, sinh, khởi động model, prompt tps, sinh tps, tổng click→preview, RAM/VRAM đỉnh, tỉ lệ JSON hợp lệ, tỉ lệ câu có căn cứ trong giáo án, bao phủ mục tiêu, số lượt Qwen trung bình, tỉ lệ phải tạo lại.
- So sánh: hiện tại (sau P6) vs sau O5; Fast vs Deep; sinh cả bộ vs lô 4–5.
- **Nguyên tắc:** chỉ chốt tham số khi có số đo trên máy mục tiêu; không suy đoán.

### 13.8 Cần chủ dự án chốt trước khi code O1

1. **Bỏ hẳn lượt Qwen cho đề xuất thể loại** (đề xuất: có) — đổi lại đề xuất do quy tắc sinh ra, không “thông minh” bằng model nhưng tức thời và ổn định.
2. **MiniLM cụ thể** (đề xuất: `paraphrase-multilingual-MiniLM-L12-v2` dạng GGUF, ~120 MB) — cần duyệt nguồn/sha256/license trước khi tải.
3. **Ngưỡng số câu để chuyển sang sinh theo lô** (đề xuất: bắt đầu đo ở 8 câu, chốt sau benchmark).
4. **Cache nội dung đã sinh**: có được bật mặc định không (đề xuất: bật cho “cùng giáo án + cùng cấu hình”, luôn bỏ qua khi bấm “Tạo lại”).
