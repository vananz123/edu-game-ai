# Architecture Decisions

## Accepted decisions

### 1. TypeScript for application and backend
Use TypeScript as the main source language for maintainability and shared contracts. Some inherited code may temporarily use `@ts-nocheck`; remove it incrementally, not by hiding errors.

### 2. Electron for Windows desktop
Electron is the desktop shell. Keep renderer isolated from Node.js and expose only allowlisted APIs via preload/contextBridge.

### 3. SQLite for local library/history
Use SQLite on the teacher's machine for structured local data. Keep `.egame` as a portable export format. SQLite is not the cloud account database.

### 4. Offline gameplay
Saved games, scoring, explanations, history, and game assets must work without internet or a running AI process. Model installation may require internet; after a model is verified, generation should work offline.

### 5. Fixed engines, structured AI output
AI returns validated game data (for example JSON), not executable game code. The app renders it with tested game engines.

### 6. Historical v0.3 cloud AI Gateway
The existing v0.3 prototype has a Gemini Gateway scaffold. Its provider keys and Supabase service-role secrets stay on the server. This is legacy prototype behavior and is superseded for the Offline AI V1 generation path by decision 10.

### 7. Historical v0.3 Supabase choice
Use Supabase Auth and Postgres quota records to reduce initial implementation work. Reassess only if actual requirements justify changing providers.

### 8. Historical v0.3 free + paid plans
Start with server-enforced quotas. Suggested starting limits in the scaffold are Free 5 generations/month and Plus 100/month; these are test defaults, not final commercial promises. Validate AI cost and user demand before setting final pricing.

### 9. Local AI does not require third-party desktop tools
Teachers must not need to install Ollama, LM Studio, Python, Node.js, or other AI tools to use local generation. The application manages its compatible runtime and model installation.

### 10. Offline AI V1 supersedes cloud-first generation
For Offline AI V1, generation runs locally through a managed llama.cpp runtime and a verified GGUF model. Teachers do not need cloud AI accounts or provider API keys. First model installation may need internet; generation after successful verification and saved-game play must work offline. Existing BYOK and Supabase/Gemini code is retained during migration, not used as a dependency of the new offline path.

### 11. Keep the current TypeScript project structure during Phase A
Continue using the existing npm package and Electron layout. Reuse `src/shared`, `src/game-engine`, and `src/services`; add focused boundaries under `src/ai-core` rather than introducing pnpm workspaces or React without a demonstrated need. Move modules only when a later phase requires it and can preserve current behavior.

### 12. Tailwind CSS v4 (CLI, no bundler) replaces the hand-written stylesheets incrementally
Migrate the renderer styling to Tailwind CSS v4 using the standalone CLI (no bundler/PostCSS step added to the Electron build). **The 5 legacy stylesheets are imported from the entry stylesheet into `@layer components` (`@import "./layout.css" layer(components);` …) instead of being linked as separate sheets.** This is required, not cosmetic: Tailwind v4 emits utilities inside `@layer utilities`, and *any* unlayered rule outranks *every* layered rule regardless of specificity — so with the legacy sheets loaded as plain `<link>`s, utilities would silently lose everywhere a legacy rule exists. Moving legacy into `components` (which Tailwind orders before `utilities`) makes utilities win, keeps legacy as a working fallback, and lets templates migrate one group at a time instead of deleting rules in lockstep. Because the legacy UI was built against browser-default (UA) values that Tailwind's preflight resets, a temporary `@layer base` block restores those UA values with `revert`; the `components` layer still outranks `base`, so the reverts affect only genuinely UA-styled elements. Both the reachability change and the base reverts are removed together with the last legacy stylesheet (Phase 5, see ROADMAP). Verification for each phase uses the existing gates plus a CDP geometry A/B (same page with the legacy sheets layered vs. additionally appended as unlayered `<link>`s, i.e. the old behaviour) to catch cascade regressions that computed-style spot checks miss. First A/B: 0 differences across all 7 pages.

### 13. AI lesson-to-game storage is additive (sidecar tables + lesson text files)
The new AI workflow stores lessons, analyses, recommendations and drafts in four new tables (`lesson_documents`, `lesson_analyses`, `game_recommendations`, `game_projects`) created alongside `games`/`sessions`, never through `saveDb` (which deletes and rewrites every row). Lesson text is written to `userData/lessons/<id>.txt` with only a relative path plus metadata in SQLite. Drafts are typed (`GameDraft` discriminated union) and converted to `EducationalGame` by exactly one adapter (`game-project-adapter.ts`) at the save/play boundary; `EducationalGame`, `.egame` and gameplay stay unchanged. Because `better-sqlite3` is compiled for Electron's ABI, the store test runs with `tests/run-electron-node.js` (Electron binary with `ELECTRON_RUN_AS_NODE=1`) while the rest of `npm test` runs under plain Node.

### 14. One shared AI transport with typed errors and request cancellation
The local/online call-out logic lives in `src/services/ai-transport.ts` and is injected into `main.ts` through a `send` function, so the old `ai:document-assist` path and the new lesson workflow share one payload builder, one JSON reader and one set of Vietnamese error messages. Failures carry a typed `AiTransportError.code` (`AI_NOT_RUNNING`, `AI_TIMEOUT`, `AI_CANCELLED`, `AI_INVALID_JSON`, …) instead of only a message, which lets the wizard show the right recovery action. Every new workflow step registers its `requestId` in an `AiRequestRegistry`, and `ai:cancel` (plus app quit) aborts the matching `AbortController`; a teacher cancel is deliberately **not** treated as a timeout and never restarts the llama.cpp runtime.

### 15. "Tạo trò chơi" is manual-only; AI lives only in "Tạo từ giáo án"
The legacy create page is the manual authoring entry (pick one of 5 genres, set the rules, open the empty editor and type the questions). All AI assistance — document assist, cloud/local model choice, generating a draft from a document — was removed from that page and now lives only in the lesson-to-game wizard, which uses the local-only client. Rationale (owner instruction, 2026-10-19): AI must not be mixed into manual authoring, and lesson data must only be processed by local AI. The wizard's CTA replaces the create page's AI buttons on Home/Lesson-plans; the create page keeps a link to the wizard. `ai:generate-game` was already gone; the remaining dead document-assist path (`ai:document-assist`, `assistWithDocument` in preload, `features/document-assist.ts`, its index.html script and the local-AI "summarize after start" hook) was **removed in P7 on 2026-10-20** with owner approval. `ai:generate` stays because the offline template path and its smokes still use it. The `src/ai-core/document-assist.ts` helpers stay too: `lesson-prompts.ts` uses `getLocalDocumentAnalysisExcerpt`, and the rest is covered by `tests/document-assist.test.ts`. **Narrow exception (2026-10-20, owner approved):** the editor opened *from the wizard* has a per-item "Tạo lại" button for all five types (`arena`, `scenario`, `matching`, `treasure`, `race`); it is absent for manual games and library reopens. See #25.

### 16. AI test doubles are dev-only and cannot reach a packaged build
`smoke64`/`smoke65` must exercise the real IPC → workflow → store path without a local model, so `main.ts` can load canned responses from `EDUGAME_AI_TEST_DIR` (files named after the request's `responseSchema.name`, or a `__testDouble` marker that forces a typed error). This seam is guarded by `!app.isPackaged`: a packaged installer always ignores the variable and still fails with `AI_NOT_RUNNING` until a real llama.cpp model is running, so the delivered app can never fake AI. Fixture-driven results must be labelled as such in status/reports; the real-model end-to-end run remains a P6 gate.

### 17. Generation is main-side, one adapter, and the snapshot is what reopens
`lesson:generate` runs the model, validates the draft with the per-type zod schema, then converts it with the **only** adapter (`toEducationalGame`) and runs the existing per-template validators on the result. The stored project keeps `draft` + `gameSnapshot` and moves to step `edit`/status `ready`, so reopening a saved project restores the content without calling the model again. The wizard never builds `EducationalGame` itself and never receives raw model text — only validated structured data. If the adapted game fails the legacy validators, the failure is surfaced as `GENERATION_INVALID` and the teacher is told to retry or reduce the requested amount; the app never silently keeps a partially invalid game.

### 18. Real local model is the P6 gate; fixtures only prove the wiring
`tests/smoke66.js real` runs against a real llama.cpp runtime + Qwen GGUF (verified by SHA-256 at install time) and is the Definition-of-Done gate for the AI workflow. `tests/smoke66.js fixture` (and smoke64/65) exercise the same IPC/store/adapter/editor/library path with canned model replies and must be labelled as such. The runtime and model are per-machine artifacts under `userData/ai-local/` (runtime ≈ 19 MB, Qwen3.5-2B Q4_0 ≈ 1.21 GB) — they are not committed and not bundled in the installer; `tests/install-local-model.js` drives the app's own verified installer for a fresh machine.

### 19. P6 ships on fixture-verified wiring; the real-model gate is skipped by owner decision
`lesson:generate`, `applyDraft` and the wizard's real step 5 are in place and the full path (IPC → store → per-type zod → single adapter → legacy validators → editor → library → reopen without AI) is verified with canned model replies for **all five game types** (`smoke67` 52/52, `smoke66 fixture` 26/26, `smoke64` 37/37, `smoke65` 18/18 + 14/14). With the real local model only **analyze** and **recommend** completed in-app; **generate** returned a typed `[AI_TRUNCATED]` (Qwen3.5-2B Q4_0 at fast `maxTokens` 2048), and this environment force-closes the Electron window after ~1–2 minutes even when idle, so a ~7.5-minute real run cannot complete. The owner chose (2026-10-20) to skip the real e2e gate and move to the optimization spec (`docs/archive/specs/update-AI-local.txt`) instead of tuning the 2B model's token budget now. Consequence: P6 must be reported as **"wiring verified, real generation unverified"**, never as fully done, until the optimized flow's benchmark provides a real end-to-end run.

### 20. AI optimization workstream (O0–O7) is rule-first and benchmark-gated
Owner spec `docs/archive/specs/update-AI-local.txt` (2026-10-20) changes the workflow economically: Qwen is called **only** for lesson analysis and content generation. Genre recommendation becomes deterministic TypeScript (`game-recommender` + `game-type-rules`) so choosing a genre costs **0 model calls**, and ordinary config changes never re-trigger analysis or generation. Lesson text is chunked and indexed once; retrieval (MiniLM embeddings) feeds generation a short, relevant context instead of resending the raw lesson, and analysis/embeddings/generated content are cached under explicit keys (`document sha256 + model id + prompt/schema version`). Structural work (validation, scoring, flow, duplicate detection, batching, assembly) stays in TypeScript; the model never emits code. Embeddings run in a **separate** llama-server process started with `--embedding` and a MiniLM GGUF so the Qwen runtime's flags and behaviour stay untouched; vectors are stored as `BLOB` in a new sidecar table and searched by brute-force cosine (documents are hundreds of chunks, no vector DB). Per-item regeneration replaces whole-output repair when only some items fail, and "Tạo lại" always bypasses the generation cache. No parameter (batch size, token budget, quantization, retrieval threshold) is declared optimal without a benchmark on the target 16 GB / U-series CPU / integrated-GPU class machine (`tests/bench-ai.js` → `docs/BENCHMARKS.md`). As with P0, **no code is written for this workstream before the owner approves plan §13**; pedagogical correctness is never traded for speed.

### 21. Content-quality checks are advisory; they never block the editor
O2 adds `src/services/lesson-quality.ts` (pure TypeScript, no model call) and returns its report from `lesson:generate` plus a `lesson:quality` IPC for reopened drafts. The wizard shows the findings before the teacher opens the editor, but **does not disable** the editor or the library save. Rationale: structural validity is already gated twice (per-type zod, then the single adapter plus the four legacy validators on the resulting `EducationalGame`), so a remaining finding is either content quality that only a teacher can judge or a heuristic false positive (near-duplicate wording, keyword-based objective coverage). Hard-blocking on those would trap a teacher who knows better than the heuristic, and the plan's risk table explicitly rejects that. `canPublish` is therefore informational for the UI, not an enforcement point. If a future finding proves both mechanical and unambiguous, it belongs in the validators (blocking), not in this advisory layer.

### 22. Retrieval ships lexical-first, chunked lazily, and always sends real lesson text
O3 replaces the "first 6000 characters" generation context with retrieved chunks so the prompt gets shorter and more relevant, but it does **not** add a model yet: ranking is a BM25-lite scorer over Vietnamese word tokens (`lexical-v1`). The public API (`selectChunks`, `ChunkSelection.scorer`) is the seam O4 swaps to MiniLM, so the pipeline, store, IPC response and tests survive that change. Chunks are produced lazily on the first `lesson:generate` for a document and cached in the new `lesson_chunks` table (whose `embedding*` columns are already there), so analyses that never generate pay nothing and a re-import/re-chunk cannot leave stale rows. Selection ranks by score but returns chunks **in document order** with a `[Đoạn N — tiêu đề]` label, keeps a hard budget (6 chunks / 4500 chars, labels included in the reported character count), and falls back to the head of the lesson with `fallback: true` when nothing matches — a prompt must never contain zero source text. The retrieval query is built from the topic, the **teacher-selected** objectives and the key concepts only; objectives the teacher did not pick must not drag unrelated sections in. Budgets are provisional until the O6 benchmark on long real lessons; nothing here is declared optimal.

### 23. Embedding model: MiniLM multilingual Q8_0 in its own process, measured before claiming improvement
O4 adds `paraphrase-multilingual-MiniLM-L12-v2` (GGUF Q8_0, 132,438,304 byte, SHA-256 pinned in `embedding-catalog.ts`, Apache-2.0) as the retrieval model. It runs in a **second llama-server** started with `--embedding --pooling mean --embd-normalize 2` and the same llama.cpp binary, because `--embedding` changes the server contract, the model needs its own 512-token context, and restarting the embedder must never interrupt a chat generation. Vectors (384 dimensions, L2-normalised) are cached per chunk in `lesson_chunks.embedding` together with `embedding_model`/`embedding_dim`; a different model id invalidates them, and re-chunking drops them because the text they describe no longer exists. Search is brute-force cosine — a lesson has hundreds of chunks at most, so a vector database would be cost without benefit (`DECISIONS #20`).

Retrieval is **optional at runtime**: if the model, the runtime or the server is missing, `lesson:generate` catches the error and uses `lexical-v1`; the teacher still gets a game, and `context.scorer` records which scorer was used. The retrieval model is installed by the existing "Cài model" click (progress reuses the chat model id so the bar keeps moving); a failure at that step is logged and only degrades retrieval. Measured on this machine: paraphrase queries top-1 6/6 vs 3/6 for lexical, literal queries 8/10 vs 10/10 but every literal target still inside the app's 6-chunk budget, ~28 ms per generation for the query embedding, ~41 ms per chunk once (cached afterwards), embedding server peak **216 MB** next to the chat server's 2,114 MB. These numbers come from a **16-case synthetic Vietnamese set**, so the claim is "measured better on vocabulary-mismatch queries on this set", not "optimal"; the real-lesson corpus and the truncation delta remain O6. `docs/BENCHMARKS.md` holds the tables and the commands to reproduce them.

### 24. Caches are keyed on everything the model would see, and a hit never trusts old derived data
O5 adds two caches (`docs/archive/specs/update-AI-local.txt` §4, §9). The analysis key is `analysis prompt version + sha256(lesson text) + chat model id + fast/deep + source name`; the generation key is `draft prompt version + document id + analysis content fingerprint + genre + full config fingerprint + model id + fast/deep`. Hashing is done with `stableJson` (sorted keys) so semantically identical inputs cannot miss. The analysis fingerprint deliberately excludes `uncertainties`, which are shown to the teacher but never sent to the draft prompt; including them would throw away good content for an edit the model never sees. Editing the analysis invalidates content but keeps the analysis; changing genre/config/model/prompt version invalidates only content. A cache hit for analysis returns the stored row **including teacher edits** (the row keeps its key through `saveAnalysis` without a key), so re-analyzing is never automatic. A generation hit re-runs `parseGameDraft`, the single adapter and the legacy validators from the cached **draft**, not from the stored snapshot: the cache stores content, the adapter stays the only conversion boundary, and a row written by an older schema is dropped as a miss instead of blocking generation. Only the explicit buttons bypass: "Phân tích lại" sends `force: true`, "Tạo lại" sends `regenerate: true`. Cache writes are best-effort (a failed write must not fail the run) and `ai_generation_cache` is pruned to the newest 50 rows. The DB migration is additive and idempotent (`PRAGMA table_info` + `ALTER TABLE lesson_analyses ADD COLUMN cache_key`), and `main.ts` now enters the sidecar schema through `LessonStore.ensureSchema()` so old databases actually get migrated.

### 25. Per-item regeneration: the model writes content, the app keeps identity and structure; buttons live in the wizard and the wizard-originated editor
O5 implements §5.5 with `lesson-item-repair.ts` + `regenerateGameItem`: one model call per failing item, only that item plus its quality findings and the same retrieved lesson slice, and every other item stays byte-identical. Positions are **1-based** everywhere (quality report, IPC, helpers) to avoid two bases in one pipeline. The merge copies app-owned fields from the old item — `id` for arena/race/matching, `nextStageId`/`branchStageId`/`branchLabel`/`attempts` for treasure stages, situation id plus option ids remapped **positionally** for scenario (so the correct answer follows the option, and a branch target is accepted only when it points at an existing, different situation; otherwise the old link is kept). This makes a regeneration unable to orphan a sibling or create a loop even if the model invents ids. The merged draft is re-validated with `parseGameDraft`, then the adapter plus the four legacy validators run on the whole draft; if anything fails, the project is not overwritten and the error is reported as `GENERATION_INVALID`. The UI is a per-item list with a "Tạo lại" button under the quality panel in wizard step 5; since 2026-10-20 the wizard-originated editor also exposes the same IPC per row, with the typed draft + analysis + config context passed in from the wizard rather than reconstructed from the editor snapshot (see below). Generation **batching** (§5.4, several items per call) is deliberately **not** shipped in O5: the spec's own rule is that batching must be chosen by benchmark, so O6 measures it instead of assuming batching is faster. The embedding batch size is configurable (`ai.embeddingBatchSize`, 1–32, default 8) because that knob already has measurements behind it.

**2026-10-20 update — editor entry for all five types when opened from the wizard (owner approved).** `openEditor(game, isNew, note, aiContext)` receives `{ projectId, gameType, itemIds }`; each visible row maps back to its **1-based draft position by the app-owned id**, so reordering or deleting other rows cannot regenerate the wrong item, and a copied/new row (new id) gets no button. For `arena`/`scenario` the row lives in `#editorQuestions`; `matching` rows live in `#matchingPairs`, `treasure` stages in `#treasureStages`, and `race` questions in `#raceQuestions`. The call still goes through `lesson:regenerate-item` on the stored typed draft + analysis + config; only the returned item replaces that one row (then the panel's numbering/branch selects are refreshed), the project is saved by the IPC, and unsaved edits in other rows stay. The mounted wizard state is refreshed from the result so closing without saving and reopening the editor does not show a pre-regeneration snapshot. During the call the active button becomes "Huỷ" and both save buttons are disabled; closing the modal cancels the request. Manual games and library reopens get no button because they have no saved draft/analysis/config context. This is a narrow exception to the "one place" rule, not a move of generation into the editor; the snapshot is still only written by the adapter. The matching contract rejects duplicate pairs, so a regenerated pair that duplicates another one is reported as a typed error and the draft is left unchanged (the editor keeps the old row); the same validation-before-save rule applies to every type.

### 26. Fast/Deep do not use "thinking"; Deep means more context, and the prompt was shortened by measurement
O6 measured `enable_thinking` on the shipped runtime (llama.cpp b11681 + Qwen3.5-2B Q4_0) and **rejected it for this product**: `chat_template_kwargs.enable_thinking=false` is honoured even without `--jinja` (0 reasoning characters, normal JSON), but `true` produced **only reasoning and no `content`** within 900, 1,024 and 2,048 tokens - including a plain-answer prompt with no JSON schema. On a 16 GB / U-series CPU the model generates 6-11 tokens/s, so a thinking turn does not fit a usable budget. "Deep" therefore stays non-thinking and differs only in what the app controls: more retrieved lesson text (8 chunks / 6,000 characters vs 6 / 4,500) and a larger output ceiling (analysis 2,560 vs 2,048; draft 4,096 vs 2,048). The UI label was changed to match ("Kỹ (nhiều ngữ cảnh hơn)"), because calling it "thinking" would be false.

The analysis prompt now asks for at most **6 objectives / 8 concepts** with short fields (descriptions <= 25 words, `sourceExcerpt` <= 20 words) after measuring that the old 10/12 ask produced 2,041 completion tokens and that a 1,024 ceiling truncated it twice and failed. `LESSON_PROMPT_VERSIONS.analysis` was bumped to **2**: the prompt and the expected output shape changed, so old cached analyses must not be reused. The output ceiling is 2,048 (fast) / 2,560 (deep); a ceiling is not a target - the model stops when its JSON is complete, so the larger ceiling costs nothing when unused and avoids a repair round. When a transport truncation does happen, the repair turn now explicitly asks for a **shorter** answer (fewer analysis items; same draft item count but shorter text; one shorter item); without that instruction the retry reproduces the same truncated answer. This repair-only change did not bump the prompt version because the initial prompt is unchanged.

Generation **batching** (§5.4) is **not shipped** in O6 either. Measured on the same 8-question arena: one call took **141 s / 1,488 prompt tokens**, while one call per item took **456 s / 13,897 prompt tokens** for the same 8 items, so per-item generation is a repair tool, not an initial generator, and no measured reason exists yet to split an 8-item draft into batches. A batched initial generator would need its own prompt contract and a measured case (very large games) before shipping; the numbers are in `docs/BENCHMARKS.md` §6.5.

### 27. Analysis runs in the background and is observable; a second game reuses the stored analysis by id
The analysis call can take 1–2 minutes, so the wizard must not pretend that time is blocked work. `lesson:analyze` now emits `lesson:progress` at the four real boundaries (`prepare`, `generate`, `repair` only when a repair really happens, `ready`) and the UI shows them with a real elapsed clock, not a made-up percentage (the local model has no token stream). Navigating to another page leaves the request running; a topbar activity chip shows the elapsed time and returns to the analysis step. Opening a different saved draft is blocked while a run is active so a late result cannot overwrite the project that was opened in the meantime. On completion away from the wizard, the renderer shows a toast instead of force-rendering the current page.

The second-game path is a **clone around the same analysis**, not a second analysis. "Trò chơi khác từ giáo án này" creates a new project with the same `documentId`, `analysisId` and analysis/recommendations, clears config/draft/snapshot/game id, and returns to the genre step. Qwen is not called for analysis again, and the existing generation cache keys still decide whether content can be reused. Rule-based recommendations may be rebuilt if that analysis never produced a list; that is deterministic TypeScript work (0 Qwen calls). This keeps one lesson document and one analysis as the shared source of truth while allowing multiple games.

### 28. Treasure missions are optional, additive data; a missing mission is legacy multiple-choice
Treasure stages gain an optional `mission` field instead of a new `schemaVersion`, because every existing `.egame`, sidecar draft and adapter round-trip must remain valid. When `mission` is absent, the stage is exactly the old multiple-choice question (`question.options` + `correctOptionId`); `multiple-choice`/`scenario` missions reuse those fields, while `matching`, `decode` and `classification` carry their own validated payload. Structural limits stay in TypeScript contracts and the legacy validator: matching has 2–10 unique pairs with both sides filled; classification has 2–4 unique groups and 2–12 unique items whose `groupId` exists; decode has a 1–120 character answer and an optional ≤200 character cipher. The editor hides the per-item AI button for non-choice missions and the regenerate handler refuses them, because AI regeneration remains a multiple-choice/scenario repair tool; the adapter and `fromEducationalGame` copy mission data unchanged, so save/play/`.egame` round-trips survive. Quality findings for variant missions are advisory like all other quality findings, while structural validity is still gated by zod and the legacy validators; nothing about scoring or flow moves into the model.

### 29. `update_plan_2`: explicit save boundaries, upsert-only history, three separated areas, and AI single-flight
The 2026-10-20 remediation batch (`docs/archive/specs/update_plan_2.txt`) makes the existing workflow honest instead of adding a new architecture:

- **Save boundaries.** Step 5 has two explicit actions: **"Lưu tiến trình"** writes the `GameProject` through `project:save-draft`, while **"Lưu vào Thư viện trò chơi"** first saves the adapter-validated `EducationalGame` through `library:save-game`, then marks the project `step: done` / `status: ready`. Saving a game therefore never implies saving a half-finished project, and saving progress later cannot rewind a project whose game is already in the library.
- **Targeted persistence.** `library:save-game`, `library:save-session` and project saves use per-row upserts (`upsertGameRow`, `upsertSessionRow`, `LessonStore.saveProject`) instead of rewriting the whole library JSON/SQLite tables. Sessions are idempotent by session id, preserve `createdAt` on rename, and are pruned to the newest 1,000. Only **completed** result screens auto-save; abandoning mid-game writes nothing. Renaming a player updates the same row.
- **Three areas, one source of truth.** **Giáo án** lists saved lesson documents with `sourceAvailable`, nested saved analyses and a create-game action that reuses the analysis (0 Qwen calls); **Dự án của tôi** lists `GameProject` work-in-progress with step/status/source lesson and opens the wizard; **Thư viện trò chơi** lists only games that can be played offline. Deleting a project never deletes a saved game. "Hỏi đáp chuyên sâu" is a labelled, disabled placeholder — no fake AI action, no simulated answer. External `.egame` import is hidden in Home/Library/Settings for this release, but the IPC, validator, adapter and export code are retained.
- **AI single-flight belongs in the main process.** `AiSingleFlight` rejects a second AI task with `AI_BUSY` before model work starts; the renderer disables buttons as a UX layer, not as the safety mechanism. Cache hits for `lesson:generate` return without acquiring the gate. Runtime start/stop share one in-flight start promise and refuse to restart/stop while an AI task is active, so a double click cannot spawn a second llama.cpp for the same config. Locks are released in `finally` on success, failure, timeout and cancellation.
- **Scenario links are additive.** Omitted or `null` `nextSituationId` means "continue sequentially"; a deliberate ending is expressed with the new optional `GameOption.endsScenario`, not by rewriting null to an id. This keeps old drafts and new generated drafts playable without a schema bump.
- **True/false is a schema type, not a text guess.** Only `type: 'true-false'` is canonicalised to exactly two options `Đúng`/`Sai` while preserving the existing correct choice; a question whose prompt merely contains those words stays multiple-choice. A third option is a contract failure routed to repair, never silently dropped. The draft prompt now also forbids writing the answer/explicit “Đúng/Sai” verdict into the prompt, and its version is bumped to 2 so cached content from the previous wording is not reused.
- **Matching quality remains advisory.** Prompt constraints request concept–definition / cause–effect / situation–action / term–example pairs, and quality adds warnings for duplicate or generic sides, but no unbenchmarked hard semantic heuristic blocks saving or forces regeneration (consistent with #21).
- **Verification.** `npm run check` clean; `npm test` build + 25 suites; `smoke69` 19/19 (save/reopen lesson + analysis, create from analysis, project reopen, true/false UI, repeated game save keeps one row, text input readability, one auto-saved session + rename, hidden import, project delete keeps game); `smoke70` 8/8 (scenario 1/2/10 questions with one wrong answer + matching result auto-save); `persistence71` 3/3 write + 9/9 after closing/reopening the app (source, analysis, project link, game, session, and all three pages); regressions `smoke68` 44/44 (incl. treasure result auto-save), `smoke58` 26/26 (incl. standard result auto-save), `smoke67` 124/124, `smoke56` 58/58 (incl. treasure and race result auto-save). Smoke runs set `EDUGAME_USER_DATA` to an isolated profile so tests never touch teacher data. Real Qwen e2e inside the app window is now verified by `tests/real-ai-e2e.js` **19/19** on `qwen3.5-2b-q4_0` (runtime READY 14 s; analysis 63 s; 4-question generation 75 s; 0 quality errors; cancel returns `AI_CANCELLED`; overlapping analyze is blocked). The packaged `release/win-unpacked` build also passed `smoke69` 19/19. A manual Windows mouse pass and a clean-machine installer run remain unverified.

### 30. Installer preserves teacher data on uninstall

`nsis.deleteAppDataOnUninstall` is **false**. Uninstalling the app must not erase lesson sources, saved games or result history; teachers can remove their own data explicitly. This is consistent with the data-preservation rules for project/game/session writes and avoids an irreversible loss through the Windows uninstaller. The re-downloadable AI model/runtime cache is the exception and is removed by the custom uninstaller — see #32.

### 31. Treasure art and sound are small, built-in, offline assets; art fields are optional

§5.2b uses **code-drawn assets instead of image/audio files**: six inline-SVG scenes (`temple`, `forest`, `ice`, `desert`, `ocean`, `space`) and five inline-SVG avatars (`explorer`, `scientist`, `biologist`, `astronaut`, `diver`). This keeps saved games and `.egame` exports small, avoids missing-file paths after export/import, and guarantees offline play with no network or asset server. Teacher-uploaded backgrounds/audio are deliberately deferred because they need file validation, size limits, storage cleanup and export decisions; this batch does not pretend to support them.

`TreasureHuntData.backgroundId` and `characterId` are **optional additive fields**. A missing or unknown value falls back to `temple`/`explorer` at render time, so old `.egame` files, sidecar drafts and games saved before this change remain valid and do not need a `schemaVersion` bump. The editor selects and preview write these fields through the existing draft/adapter path; `game-project-adapter.ts` and the zod draft schema carry them, and the legacy validator intentionally ignores them so art cannot block saving a structurally valid game.

Sound effects are **synthesised with Web Audio** (open, correct, wrong, match, hint, item, stage, reward). There are no audio files or autoplay timers; a context is only created after a user gesture, every audio failure is swallowed so it cannot break gameplay, and the speaker button stores one global preference in `localStorage` (`edugame.player.sound`). This is a player preference, not lesson data, so it is not written into game records or `.egame` files. Verification: `tests/smoke71.js` **25/25** in both the dev build and packaged `release/win-unpacked`, regressions `smoke68` **44/44**, `smoke69` **19/19**, `smoke70` **8/8**, `smoke56` **58/58**, `smoke58` **26/26**, `npm test` 25 suites; a real screenshot of the forest scene was inspected, but the manual mouse pass and clean-machine installer run are still open. The current installer is `release/EduGame-Studio-Setup-0.3.0.exe` (92,591,130 bytes, 2026-10-20 20:32, SHA-256 `24DEF7FC9327FE901D67E2ED59729BF42045332391859A465C15B869907DE8E0`, rebuilt after `b371b66`); see #32/#33 for the uninstall and llama.cpp startup changes in that build.

### 32. Uninstall removes re-downloadable AI assets, never teacher data

The Windows uninstaller runs the custom NSIS macro `customUnInstall` in `build/installer.nsh`, which removes only `%APPDATA%\edugame-studio\edugame-data\ai-local` (with a product-name fallback path). That directory holds downloaded GGUF models and the llama.cpp runtime; both are re-downloadable and can occupy several GB. Lesson sources, the SQLite library/history, projects, sessions and settings remain untouched because `nsis.deleteAppDataOnUninstall` stays **false** (#30). The macro is scoped to `ai-local` rather than the whole profile so an uninstall cannot erase a teacher's work by accident.

Verified with a silent install + silent uninstall against a temporary install directory: a dummy `ai-local` was removed, while `edugame.sqlite` kept its exact size (753,664 bytes), `lessons/` remained, and the installer/uninstaller both returned 0. Existing installations need the new installer before their uninstaller has this behavior.

### 33. llama.cpp on Windows gets an app-local VC++ runtime and single-slot, memory-guarded startup

The official llama.cpp Windows CPU zip imports `MSVCP140.dll`, `VCRUNTIME140.dll` and `VCRUNTIME140_1.dll` but does not ship them. A missing or outdated system-wide Visual C++ redistributable can make `llama-server.exe` exit with `0xC0000005` (`3221225477`) before it prints a useful log line. The installer therefore ships Microsoft Visual C++ 2015–2022 (x64) runtime DLLs version **14.50.35719.0** as `extraResources/vc-runtime`; `LlamaRuntimeInstaller.ensureSupportFiles()` copies them beside `llama-server.exe` on install and before spawning, which also repairs runtimes downloaded by older builds. These are Microsoft redistributable files, not MIT-licensed project code; see `vendor/vc-runtime/README.md`.

The app already serialises AI work with `AiSingleFlight`, so the chat server uses `--parallel 1` instead of llama-server's multi-slot default (which multiplies KV-cache memory) and `--ctx-checkpoints 0`; the embedding server also uses `--parallel 1`. Before spawning, the main process rejects a model when total RAM is below the catalog minimum or free RAM is below model size + 768 MB, with an actionable Vietnamese message. `AIManager` captures both stdout and stderr and maps common Windows exit codes (`0xC0000005`, `0xC000001D`, `0xC0000135`, `0xC0000139`, `0xC00000FD`, `0xC0000409`) to recovery hints. This is a mitigation based on the known failure mode and measured local startup, not a claim that the second machine's root cause is proven; a retest there is required. Manual 4B startup with the new arguments reached `n_slots = 1` and `listening` on this machine, and a packaged 2B start with the VC++ DLLs removed repaired them and reached `READY`.

### 34. The teacher-facing mode names are Fast/Thinking, with the measured thinking limit stated in the UI

Spec update_plan_3 §9 asks the game-creation page to offer exactly two modes, **Fast** (default) and **Thinking**, and §7 forbids relabelling without real support. Both constraints are honoured together: the select now reads "Fast — Nhanh (mặc định)" / "Thinking — Kỹ, nhiều ngữ cảnh hơn" (same stored values `fast`/`deep`, so caches, projects and contracts are untouched), and a hint under the grid states plainly that Qwen 3.5 currently returns no usable thinking output on CPU, so the real difference is retrieved lesson context (8 chunks / 6,000 chars vs 6 / 4,500) and output ceilings (2,560/4,096 vs 2,048/2,048) — per DECISIONS #26 the app never enables `enable_thinking`. The thinking probe was re-run **with `--jinja`** on llama.cpp b11681 + Qwen3.5-2B Q4_0 (`tests/thinking-probe.js`): `enable_thinking: true` still produced only `reasoning_content` and no `content` at 900 and 2,048 tokens, while `false` answered normally — so the Jinja template does not change the verdict. As a safety net, `readAssistantContent` now recognises a reasoning-only reply and raises `AI_EMPTY` with a message that names `reasoning_content` and tells the teacher to switch to Fast, instead of the generic "AI không trả về nội dung".

### 35. The AI status bar can start llama.cpp without going through the wizard

The bar under the topbar shows two independent things: the llama.cpp runtime state and the AI task currently running. When the runtime is stopped or starting, "▶ Khởi động" opens the same local-AI modal the wizard uses (`openLocalAiModal`), so a teacher can pick a model and start it from any page; when the runtime is READY the button is replaced by "Dừng llama.cpp", which stays disabled while an AI task is running (stopping the model mid-generate would fail the task). "Huỷ AI" appears only for a live task. The red "chưa chạy" dot is hidden by default and the teacher's choice is stored in a single key `edugame.aiStatus.idleVisible`. The 2-second poll skips while the window is hidden and asks `ai:tasks` with `history: false`, so it does not read the SQLite task history; the settings page keeps receiving `{ live, history }`.

### 36. Fast/Thinking is a visible two-card choice, and progress is shown as real elapsed time plus an honest range

Step 4 of the wizard now renders the two modes as a `role="radiogroup"` of two cards (⚡ Fast / 🧠 Thinking, each with a plain-language description) instead of a `<select>`, because the mode changes how much lesson text is retrieved and how long the reply may be — a dropdown hid one of the two options and made the choice look like a minor setting. The stored values stay `fast`/`deep` (#34), so caches, projects and the draft contract are unaffected, and the honest thinking-limit hint moved into the same block. Clicking a card is handled in place: only `aria-checked`, the badge and `wizardState.config.generationMode` change, with no re-render, so a teacher does not lose typed title/topic text or the caret.

Step 5 shows `Đã chạy m:ss · dự kiến a–b phút`. The elapsed part is a real clock driven by `generationStartedAt` and it keeps running while the teacher navigates to another page, matching the existing analysis clock (one shared `wizardStartActivityClock` so only one job owns the topbar chip). The estimate is a labelled heuristic derived from the mode and the number of items (Fast 1–3 minutes, Thinking 2–5 minutes for short lessons, wider as the item count grows); the app never shows a fake percentage or a countdown it cannot honour, because the local model exposes no token stream. The AI status bar is refreshed on every `lesson:progress` event instead of waiting for its 2 s poll, maps the raw English stage ids to Vietnamese, and appends the task's elapsed time from `startedAt`.

Shell chrome is sticky so a long step does not hide the AI status: `.topbar` is `sticky top:0` (z 30), `.ai-status-bar` is `sticky top:72px` (z 20, the topbar height), and the sidebar is `sticky` at full viewport height with its own scroll. Verified by `tests/smoke75.js` **18/18** (cards, in-place switch, idle vs running clock, ticking, chip label/seconds, cleanup, `scrollY=700` with topbar at 0 / bar at 72 / sidebar at 0), `tests/smoke76.js` **11/11** (the real `wizardGenerateRun()` path against canned model fixtures: clock starts at `0:00 · dự kiến 1–3 phút`, chip reads "AI đang tạo nội dung", both are cleared when generation completes), and `tests/smoke72.js` **17/17** (mode cards, no dropdown).

The live bar was then exercised against a real model: `tests/real-ai-status.js` **22/22** on Qwen3.5-2B Q4_0 (CPU i5-10210U, isolated `EDUGAME_USER_DATA`). Runtime READY in 9–10 s, a 520-character lesson analysed in 44–63 s, four arena questions generated in 75–82 s (Fast) and 39–153 s (Thinking, so Thinking is not consistently slower on this machine). During the run the bar showed `tạo nội dung arena · đang tìm ngữ cảnh · 0:00` then `… · đang tạo nội dung · 0:03`, the step-5 clock ran `0:00 → 1:11` with "dự kiến 1–3 phút" (Fast) / "2–5 phút" (Thinking), and both the clock and chip disappeared when the draft arrived. The 1–3 / 2–5 ranges therefore cover the measured runs; Thinking sometimes finishes below its lower bound, so the range is deliberately conservative rather than a promise. One out-of-scope observation from the same sessions — Qwen 2B occasionally delivered 1 of 4 requested questions while the advisory report only warned — is handled in #37.

### 37. Under-delivery gets one retry, then exact numbers; the app never pads or fakes items

The local model sometimes returns a structurally valid draft with fewer items than the teacher configured (observed: **1 of 4** arena questions, `errors: 0`, ~39 s). Accepting that silently was dishonest, but filling the gap with invented placeholder items would be worse. Generation therefore treats `found < requested` as a repairable condition inside the shared `runStructuredStep` loop: the previous (valid) answer is kept as the assistant turn and the model is asked **once** more for the complete JSON (`buildDraftShortfallMessages`), then validated again. If both attempts are short, the fullest attempt is returned unchanged — exactly one retry, never a second, and no fabricated items.

Counts and units come from the same `requestedItemCount()` the quality report uses (`câu hỏi` / `tình huống` / `cặp ghép` / `chặng`), so the retry prompt and the UI can never disagree. The advisory warning (DECISIONS #21) stays, and step 5 now renders a `role="alert"` banner above it with `AI mới tạo found/requested`, `còn thiếu N`, and a one-click "Tạo lại cho đủ N" button. Saving remains allowed: the draft is structurally valid, and a teacher may prefer to add the missing items by hand in the editor — the banner states both options instead of blocking. The retry also means a short first answer costs one extra model pass, which the existing "Đã chạy … · dự kiến …" range still covers on this machine.

Verified by `tests/lesson-workflow.test.ts` (short → retried once with the previous answer attached and the `1/2 câu hỏi` reason; both-short → fullest attempt returned, two calls; complete → one call), `tests/smoke77.js` **11/11** (fixture answers 1 of 4: banner with `data-wizard-shortfall="1/4"`, exact text, enabled retry button, the advisory warning still listed, saving enabled, banner gone when counts match), `tests/smoke76.js` **12/12** (a complete draft shows no banner), and the full `npm test` suites.

### 38. A local diagnostic log records counts, timings and error codes — never lesson text, prompts, answers or keys

EduGame Studio is now used on machines we cannot inspect, so "AI behaved strangely" has to become a file the teacher can send back. The app writes a JSONL log to `<userData>/edugame-data/logs/ai-YYYY-MM-DD.jsonl` from `src/services/ai-log.ts`: `app.start` (version, platform/arch, Electron, CPU/RAM, catalog model ids, runtime installed, AI mode), `analyze.done` (objective/concept counts, seconds, cache), `generate.start` (game type, mode, model, requested count/unit, regenerate), `generate.attempt`, `generate.incomplete` (the exact reason and whether a retry follows), `generate.done` (requested/found, attempts, errors/warnings, seconds, `canPublish`), `generate.cached`, `*.error` (code + message truncated to 240 chars), and `runtime.start/ready/stop/error`. Analysis timing/counts were already available internally; the new `onIncomplete` callback in `runStructuredStep` is what makes the O9 retry visible without storing the draft.

**Privacy is a hard rule, not a best effort:** the log never contains lesson text, prompts, model answers or credentials. Callers pass ids/counts/durations/error facts only, and `redactValue()` additionally replaces any value whose key looks sensitive (`apiKey`, `authorization`, `token`, `secret`, `password`, `cookie`, `credential`) with `[redacted]` in case a future caller hands over a settings object. There is no upload, no sync and no telemetry endpoint; the file only leaves the machine when the teacher chooses to send it.

The log is bounded and disposable: the day file is rotated at 2 MB (rotated names and bundles carry milliseconds, so same-second work never collides), files older than 14 days are deleted on startup, and every write is wrapped so a read-only profile or a full disk cannot fail the AI feature being diagnosed. Error messages are flattened and truncated to 240 characters, and quoted fragments are replaced with `"…"` because validation messages can quote the model's own text. Settings → "Chẩn đoán AI (log)" shows the folder, file count, size and retention, and exposes three actions. "Xuất gói chẩn đoán" writes `EduGame-Studio-chan-doan-YYYYMMDD-HHmmssSSS.txt` **to the Desktop** (fallback: the log folder when the Desktop is not writable) with the human header (version/OS/CPU/RAM/models/runtime) plus the last 200 log lines, and reports the absolute path — the Desktop is where a teacher can actually find, attach and later delete the file without knowing about AppData. "Mở thư mục log" opens Explorer. "Xóa log trên máy" requires a second confirming click within 4 s (no native modal that could block the window) and deletes the app's own `ai-*.jsonl` + `diagnostics-*.txt` files; exported files on the Desktop are the teacher's and are left alone. `EDUGAME_DIAGNOSTICS_DIR` exists only so automated runs do not litter a real Desktop. This answers the open retention question for local diagnostics (14 days, local only); usage history in SQLite is unaffected.

Verified by `tests/ai-log.test.ts` (redaction of nested/secret keys, JSONL append, secret never on disk, rotation at the size cap, 14-day prune, `readRecent` ordering, bundle header/content, unique bundle names, `sanitizeLogMessage` eliding quoted generated text, and `clearAiLogs` deleting only the app's own files), `tests/lesson-workflow.test.ts` (the `onIncomplete` reason/attempt/retrying values for a short draft and `retrying:false` on the second short answer), `tests/smoke78.js` **22/22** (fixture generation 3/3, panel + three buttons + info line, export lands in the target folder, bundle contains `app.start`, `generate.start`, and the matching `generate.done` with `requested:3`/`found:3`/`attempts:1`, no lesson text, no key material, open-folder returns the log directory, two-click clear leaves only `diagnostics.clear`, no renderer errors), `tests/smoke79.js` **15/15** on the packaged `release/win-unpacked` build (the installed-app path: log under `edugame-data\logs`, `app.start` with `fixtureMode:false`, export to the target folder, two-click clear), and regression `smoke76` **12/12**, `smoke77` **11/11**, `smoke72` **17/17**.

### 39. CPU thread count stays automatic — there is no 4-vs-8 switch

A 4B model takes ~4 minutes per 12 questions on a 4-core CPU, so the obvious request was a Settings control for CPU threads ("laptops only have 4 cores"). We measured before building it, because the premise can be wrong: on the i3-10105F (4 cores / 8 threads, no GPU) with the installed Qwen3.5 4B Q4_0, 2.386-token prompt + 160-token answer, two runs with the order reversed to rule out thermal bias, `llama-server` did **18.2–18.4 prompt tok/s with 8 threads vs 14.4–15.7 with 4** (6 threads: 17.0), while decoding tied (5.4–5.6 vs 4.9–5.6, within noise). 8 threads is therefore the fast choice even on 4-core/8-thread laptops, and the 3–6 s model load was also shortest there.

The existing clamp already handles the real concern: `resolveCpuThreads(logicalCpuCount, recommendedCpuThreads)` returns `min(logical, recommendation)`, so a 4C/4T laptop gets 4 threads and can never oversubscribe, while a 4C/8T laptop gets the 8 that measured fastest. A visible 4/8 switch would mostly let teachers make the app slower and would then generate support requests about it, so no setting is exposed (and no IPC/settings schema change was made). The measurement is also consistent with the observed timings: 12 questions ≈ 1.200 output tokens ÷ ~5.5 tok/s ≈ 218 s (log: 241 s), analysis ≈ 2.400–3.000 prompt tokens ÷ ~18 tok/s + answer ≈ 198 s — a CPU-bound workload, not a bug.

Locked by `tests/runtime-threads.test.ts` (8/8→8, 4/8→4, 16/6→6, 2/8→2, 0/NaN→1, fractions floored, result always inside `1..logical`) and used by both `AIManager` and the embedding runtime in `src/main.ts` plus the model selection summary in `src/ai-core/model-installer.ts`. The behaviour is unchanged; this entry only records why, so it is not re-litigated. If teachers later report the machine is unusable *during* generation, the honest option is a separate opt-in "Giảm tải CPU" (4 threads, labelled ~15–20% slower), not a speed switch.

### 40. Generated content belongs to one genre — switching genre drops it

`lesson-store` refuses to persist a project whose `config.gameType` and `draft.gameType` disagree (`STORE_INVALID_PROJECT`, "Cấu hình là “X” nhưng nội dung là “Y”."). The guard is correct: a draft from another genre cannot be rendered or validated as the configured game. The renderer, however, used to keep `draft`/`gameSnapshot`/`gameId`/`quality` when the teacher went back to step 3 and picked a different genre, so every save path (`3→4`, `4→5`, save at step 5, start of generation) threw and the second game could never be finished. Because the save failed, the DB also kept the *old* config, so even a forced generation would have regenerated the previous genre.

Decision: content is tied to the genre the teacher chose. `wizardDiscardGeneratedContent()` clears `draft`, `gameSnapshot`, `gameId`, `quality`, `context` and the stage indicators; both genre-selection handlers call it when the picked genre differs from `draft.gameType`. When the game is already a row in the library (`state.db.games` contains `gameId`, the same test `wizardSaveCurrentProject` already used) the copy in the project is redundant and is dropped silently. An unsaved draft represents minutes of generation, so it asks once via `window.confirm` (the pattern already used by `wizardGenerateRegenerate`); declining leaves the old genre and its content untouched. If the draft already matches the picked genre (e.g. `selectedGameType` was reset by a re-analysis), nothing is discarded — only `selectedGameType` changes. `wizardBuildProject()` additionally drops a mismatched draft/snapshot/`gameId` as a last-resort guard and never writes `status: ready` for it, so a missed path can no longer block saving; the store guard stays untouched as the backstop.

Verified by `tests/smoke80.js` **17/17** (fixture): finish a scenario game, go back to step 3 via the stepper, decline the prompt (genre and draft kept), accept it (old draft/snapshot/`gameId` cleared), `3→4` saves with `config.gameType = matching`, `draft = null`, step 5 shows the empty state rather than the old content, generating matching succeeds and is stored, saving it to the library then switching to treasure drops the copy **without** a prompt, and treasure also configures/generates; no mismatched-content error, no uncaught renderer exceptions. Store behaviour is unchanged and still covered by `tests/lesson-store.test.ts:329`. Regressions: `tests/smoke76.js` **12/12**, `tests/smoke77.js` **11/11**, `npm test` (26 suites + store) all pass.

## Decisions still open
- Initial GGUF model and runtime versions, verified source/checksum/size/license, and supported Windows hardware.
- Whether/how to sync game libraries across devices.
- Retention period for usage logs and account deletion workflow.

## Chi tiết quyết định (lưu trữ)

Các mục #57–#145 được tách sang `docs/handoff/decisions/` để file này còn là mục lục đọc nhanh. Nội dung chi tiết giữ nguyên, không sửa khi tách. Quyết định mới tiếp tục ghi ngay dưới mục này; khi file vượt ~300 KB thì cắt thêm một dải số sang `docs/handoff/decisions/`.

| Dải số | Số mục | File |
| --- | --- | --- |
| #57–#89 | 33 mục | [docs/handoff/decisions/057-089.md](handoff/decisions/057-089.md) |
| #90–#105 | 16 mục | [docs/handoff/decisions/090-105.md](handoff/decisions/090-105.md) |
| #106–#145 | 40 mục | [docs/handoff/decisions/106-145.md](handoff/decisions/106-145.md) |

## #146 — STATUS/DECISIONS là mục lục; lịch sử tách sang `docs/handoff/`

**Context.** `docs/STATUS.md` đã 634 KB / 3.517 dòng (146 mục) và `docs/DECISIONS.md` 398 KB / 2.056 dòng (89 mục chi tiết). Đây là hai tài liệu agent mở đầu tiên theo `AGENTS.md`, nên mỗi lần tra cứu đều phải nạp cả lịch sử — chi phí đọc tăng dần và dễ bỏ sót mục mới ở đầu file.

**Quyết định.**
- `docs/STATUS.md` chỉ giữ **3 bàn giao mới nhất** + mục lục đầy đủ (nhóm theo ngày, mỗi mục một dòng, trỏ tới file lưu trữ). Mọi bàn giao cũ nằm ở `docs/handoff/status/<YYYY-MM-DD>.md`, nối thêm vào cuối file của đúng ngày; các mục cũ không ghi ngày (#70–#79) nằm ở `undated-070-079.md` và không suy đoán ngày.
- `docs/DECISIONS.md` giữ tóm tắt #1–#56, danh sách quyết định còn mở và bảng mục lục; chi tiết **#57–#145** nằm ở `docs/handoff/decisions/{057-089,090-105,106-145}.md`.
- Quyết định mới (#146 trở đi) ghi thẳng vào `docs/DECISIONS.md`; khi file vượt ~300 KB thì cắt thêm một dải số sang `docs/handoff/decisions/`.
- Nội dung tách giữ **nguyên văn từng block**: script tách so khớp SHA-256 từng block trước khi ghi và kiểm lại vòng tròn (đọc file lưu trữ rồi ghép lại) — 146 mục STATUS + 89 mục DECISIONS khớp đủ, không mất/không sửa ký tự nào.

**Không làm.** Không đổi tên hay đánh số lại quyết định/bàn giao cũ (tham chiếu `#142`, `#145` vẫn đúng); không gộp hai tài liệu; không chuyển sang site tài liệu.

**Verification.** Tổng byte lưu trữ + phần giữ lại khớp bản gốc (619.806 + 16.641 = 636.447 ≈ 634.490 gốc + 2 KB tiêu đề file lưu trữ); `docs/STATUS.md` còn 32 KB, `docs/DECISIONS.md` 56 KB; mục lục có đủ 146 mục trong 13 nhóm; mọi link tương đối trỏ đúng file trong `docs/handoff/`. Quy ước được ghi lại ở `docs/handoff/README.md`, `AGENTS.md` và `docs/PROJECT_MAP.md`.

## #147 — Tách `features/gameplay.ts` thành `features/games/*` (P2 restructure)

**Context.** `src/renderer/features/gameplay.ts` dài 3.270 dòng, chứa cả năm trò chơi, 3D stage, House Building Mode, màn kết quả, Presentation Mode và toàn màn hình; mọi sửa đều phải cuộn qua một file khổng lồ. Owner yêu cầu "chuẩn bị cấu trúc lại cây dự án để dể đọc code và sửa code"; đây là pha P2 của kế hoạch trong `docs/ROADMAP.md`.

**Quyết định.** Tách theo trách nhiệm, **không đổi hành vi**, renderer vẫn là script toàn cục nạp bằng `<script>`:
- `games/shell.ts` — `playGame`, display/fullscreen (`getDisplayInfo`, `hasSecondaryDisplay`, `playGameFullscreen`, `setPlayFullscreen`), `closePlaySurface`, listener click/keydown của play surface.
- `games/three-stage.ts` — mount/unmount stage, `addAnchoredObject`, thế giới 3D theo template, `reactThree`.
- `games/house.ts` — House Building Mode: tiến trình, 4 mẫu nhà, đặt nhà, phản ứng.
- `games/result-screen.ts` — builder màn kết quả 5 trò, Presentation Mode (`startPresentationMode`/`stopPresentationMode`), team setup, play modal/header, `initPresentationTracking()`.
- `games/quiz.ts` — `renderQuestion`, `chooseAnswer`, `formatClock`, `resultStatsHtml`, `renderResults`, `shuffled`.
- `games/matching.ts`, `games/treasure.ts`, `games/race.ts` — toàn bộ UI từng trò.
- `src/index.html` nạp 8 script theo thứ tự shell → three-stage → house → result-screen → quiz → matching → treasure → race, sau `three-game-interaction.js`. Mỗi file chỉ khai báo hàm/biến hoặc đăng ký listener ở top level; không file nào đọc binding của file khác lúc nạp (đúng điều `tests/unit/renderer-load-order.test.ts` canh).
- Nội dung **nguyên văn từng dòng** (CRLF): script tách sao chép đúng khoảng dòng của file gốc (bỏ dòng `sourceMappingURL=gameplay.js.map` cũ bị dán từ JS biên dịch) và kiểm SHA-256 khi ghép lại. Chỉ dòng 1 của `shell.ts` được thay bằng header `@ts-nocheck` mới.
- `tests/unit/lan-adapters.test.ts` đọc drift guard từ **toàn bộ** `src/renderer/features/games/*.ts` thay vì một file.

**Không làm.** Không đổi tên/tham số hàm toàn cục, không gộp file, không chuyển renderer sang ES module, không sửa logic tính điểm, 3D, CSS hay luồng offline/LAN.

**Verification.** `npm run build` 0 · unit **68/68** · `check:renderer-globals` 0 undefined (44/45 script, 756 hàm, 6192 call site) · `verify:css` **17/17**. Electron thật qua CDP: `ui-three-game-check` **19/19**, `ui-three-game-reactions-check` **11/11**, `ui-three-game-check-4games` **41/41** (instance sạch), `ui-three-game-patterns-check` **31/31**, `ui-house-building-check` **84/84** (instance sạch), `ui-game-worlds-check` **42/42**, `ui-play-surface-check` **156/156**, `ui-presentation-check` **60/60**, `ui-stage-illustration-check` **169/169**, `ui-matching-finish-check` **22/22**, `ui-race-treasure-check` **18/18**, `ui-lan-wiring-check` **7/7**, `ui-lan-treasure-finish-check` **5/5**, `ui-fullscreen-density-check` **8/8**, `ui-fullscreen-check` **20/20** (chỉ đạt sau khi xoá `data-setup-fullscreen="1"` còn sót trong profile mới — lỗi môi trường, không do bản tách).

## #148 — Nhóm `src/services/` thành lesson / ai / game / storage / input (P3 restructure)

**Bối cảnh.** P3 của mục "Restructure the project tree" (#146/#147): `src/services/` có 35 file phẳng, 14.040 dòng, tên file đủ rõ nhưng mở thư mục không thấy ranh giới giữa luồng giáo án, lớp gọi AI, nghiệp vụ trò chơi, lưu trữ và nhập liệu.

**Bố cục mới (35 file, không gộp/tách file nào).**
- `services/lesson/` (14) — giáo án → game: `lesson-contracts`, `lesson-prompts`, `lesson-normalize`, `lesson-chunker`, `lesson-retrieval`, `lesson-preprocess`, `lesson-structure`, `lesson-selection`, `lesson-quality`, `lesson-cache`, `lesson-workflow`, `lesson-projects`, `lesson-item-repair`, `item-capacity`.
- `services/ai/` (5) — gọi model: `ai-transport`, `ai-providers`, `ai-tasks`, `ai-log`, `opencode-zen`.
- `services/game/` (9) — trò chơi: `game-service`, `game-validation`, `game-project-adapter`, `game-package`, `ai-game-normalize`, `ai-game-design`, `game-type-rules`, `game-recommender`, `draft-convert`.
- `services/storage/` (2) — lưu trữ: `lesson-store`, `custom-illustration`.
- `services/input/` (5) — nhập liệu: `input-classifier`, `input-classifier-semantic`, `question-import`, `question-compatibility`, `question-text`.
- `ai-game-design`/`ai-game-normalize` nằm ở `game/` vì chúng dựng dữ liệu trò chơi; `custom-illustration` ở `storage/` vì nó chép ảnh vào thư mục dữ liệu; `draft-convert` ở `game/` vì nó đổi giữa các dạng draft trò chơi.

**Cách làm.** `git mv` giữ lịch sử, rồi một codemod Node resolve **mọi** specifier tương đối theo vị trí *cũ* của file gọi rồi ghi lại theo vị trí *mới* (phủ `import … from`, `require(`, `import(` trong `src/**` và `tests/**`). Không có file nào khác bị sửa ngoài dòng import/require; 7 chú thích đường dẫn trong mã được cập nhật tay. Kiểm 400 specifier tương đối: 0 không resolve được. Không đổi tên/xuất/tham số hàm, không đổi hình dạng module, không đụng `preload.ts`, IPC channel, SQLite schema, `.egame`, hay renderer.

**Sửa kèm một test hỏng sẵn.** `tests/unit/lesson-store.test.ts` (mục #121) đọc 3 trang ở offset 0/10/30 nhưng đòi hợp của chúng bằng 36 dòng — 3 trang đó chỉ phủ 26 dòng (thiếu trang offset 20). Test chưa từng chạy vì `npm test` bỏ qua `lesson-store` (cần ABI Electron, chạy bằng `npm run test:native`); lỗi có từ commit 7e5571b. Đã thêm `thirdPage = listAiTasks(10, 20)` và đưa vào phép hợp; không đổi hành vi sản phẩm.

**Verification.** `npm run check` 0 · `npm run build` 0 · unit **68/68** · `npm run test:native` **1/1** (sau khi sửa) · `check:renderer-globals` 0 undefined · `verify:css` **17/17**. Electron thật (CDP, profile tạm, fixture AI): app khởi động được với các `require` mới trong `main.ts`; `ui-input-routing-check` **52/52** (phân loại + nhập câu hỏi + wizard), `ui-lessons-paging-check` all pass (LessonStore qua IPC). `ui-classifier-outline-check` **14/15**: assertion "safety gate explains itself" cần lớp ngữ nghĩa chạy, máy này không có model MiniLM nên nhánh `semantic-unavailable` trả thông báo khác — lỗi môi trường, không liên quan P3. `ui-ai-tasks-paging-check` **6/8**: profile mới chỉ có 1 trang lịch sử (check giả định instance đã có ≥11 tác vụ); phần phân trang đã được test native phủ. `ui-item-assets-editor-check` (chụp màn hình nhiều cỡ) treo/không ổn định khi cửa sổ bị che — đúng ghi chú môi trường của #144; không dùng làm bằng chứng. File `.js` cũ trong `dist/src/services/` không xoá được vì app đang chạy giữ khoá (chỉ là artifact, build sạch lần sau sẽ hết).

**Không làm.** Không đổi hợp đồng IPC/preload, không gộp/tách file dịch vụ, không đổi logic nghiệp vụ, không sửa renderer/CSS, không đụng LAN/presentation/SQLite/`.egame`.

## #149 — Tách `app.css` thành 13 file khu vực, giữ nguyên cascade (P4 restructure)

**Bối cảnh.** `src/renderer/styles/app.css` là 4.567 dòng / 227 KB trộn đủ thứ: token, component legacy, khung ứng dụng, play surface, wizard, 5 thế giới trò chơi, xây nhà. Sửa một trò phải cuộn qua toàn bộ file. Đây là P4 của kế hoạch cấu trúc lại cây dự án (#146–#148) với nguyên tắc **chỉ di chuyển, không đổi hành vi**.

**Quyết định.** `app.css` trở thành **entry** giữ nguyên 200 dòng đầu (`@import "tailwindcss"`, daisyUI `@plugin` + theme, `@theme`, `@source`), rồi `@import` 13 file khu vực. Tailwind v4 inline từng `@import` CSS cục bộ **đúng tại vị trí**, nên chỉ cần xếp import đúng thứ tự cũ là cascade không đổi. Các mảnh là **lát cắt liên tiếp** của file gốc — không cắt giữa một block, không đổi thứ tự, không gộp các khối rời rạc:

| File | Dòng gốc | Nội dung |
| --- | --- | --- |
| `base.css` | 201–286 | token alias `:root`, `@layer base`, `motion-safe-off`, biến player theme |
| `components.css` | 287–843 | component legacy port từ 5 stylesheet cũ (nút, thẻ, form, editor, scrollbar, trang chủ, stepper wizard) |
| `shell.css` | 844–1020 | topbar/sidebar sticky, dark theme, override toàn màn hình cơ bản |
| `fullscreen.css` | 1021–1257 | override toàn màn hình dùng chung + mật độ chỗ trình chiếu |
| `gameplay.css` | 1258–1901 | play surface: stage, đáp án, màn kết quả (+ hero nhà #144) |
| `navigation.css` | 1902–2013 | icon navbar |
| `game-race.css` | 2014–2063 | bảng Đường đua |
| `game-animations.css` | 2064–2398 | thanh lượt đội, matching/memory/phân loại, cuộn stage |
| `setup-wizard.css` | 2399–2501 | wizard cài AI lần đầu |
| `wizard.css` | 2502–3002 | tiến trình AI, ảnh minh hoạ stage, cây cấu trúc bước 1 |
| `game-treasure.css` | 3003–3848 | kho báu #91, bản đồ hành trình #92 |
| `game-worlds.css` | 3849–4453 | 5 thế giới #104, bố cục kho báu toàn màn hình |
| `game-house.css` | 4454–4567 | chế độ Xây nhà #142 |

Lý do không gom đúng 5 tên trong roadmap: các khối game/kết quả nằm **rải rác** giữa các khu vực khác; muốn giữ nguyên thứ tự cascade thì mỗi file phải là một lát cắt liên tiếp. Ranh giới vì vậy men theo các section comment sẵn có (và #91/#92/#104/#142 vốn đã chia khối), đặt tên theo nội dung thật thay vì ép về 5 thư mục.

**Cách làm.** Script Node đọc bản gốc, tính độ sâu ngoặc **bỏ qua comment/chuỗi** để khẳng định mỗi mốc cắt nằm ở cấp 0, ghi từng file = banner một dòng + đúng lát cắt gốc (không sửa ký tự nào), rồi **nối lại và so SHA-256 với bản gốc**: `3a75462e…10c08e2`, 217.386 ký tự khớp tuyệt đối. Bằng chứng mạnh hơn: chạy `build:css` trước và sau khi tách, file biên dịch `dist/src/renderer/styles/app.css` **giống hệt từng byte** (`a3cf605f…4f3f40a`, 197.047 ký tự).

**Test đọc CSS nguồn được cập nhật.** Ba guard trước đây đọc trực tiếp `app.css`; sau khi tách phần lớn rule nằm ở file khác nên chúng đọc **cả thư mục** `src/renderer/styles/*.css` (sắp xếp tên, nối lại):
- `tests/unit/generation-eta.test.ts` — keyframes `spin-slow` + `.wizard-gen-spinner` + `prefers-reduced-motion` (nay ở `wizard.css`).
- `tests/unit/illustration-registry.test.ts` — `.stage-illustration` + media `max-height:760px` (nay ở `wizard.css`).
- `tests/unit/build-assets.test.ts` — thêm guard 2b: mọi `@import "./x.css"` trong entry phải tồn tại cạnh nó ở `src` **và** trong `dist`, để đổi tên file khu vực không âm thầm làm mất cả vùng CSS khỏi bản đóng gói.

`tests/manual/verify-css.js` không đổi: nó đọc file **biên dịch** `dist/.../app.css`, vẫn là một file duy nhất.

**Verification.** `npm run build` 0 · `node tests/run-unit.js` **68/68** · `npm run verify:css` **17/17** · `npm run check:renderer-globals` 0 undefined. Không chạy lại CDP UI checks vì đầu ra CSS biên dịch trùng byte với baseline — mọi rule, thứ tự và specificity không đổi.

**Không làm.** Không đổi selector, giá trị, thứ tự rule, không gộp/tách block, không thêm `<link>` mới (vẫn đúng một link `app.css`), không đổi Tailwind/daisyUI config hay `@source`. Các file khu vực không được nạp trực tiếp bởi `index.html` (không thể, vì chúng chưa qua Tailwind).

## #150 — Tách `game-editor.ts` và `wizard/state.ts` theo khu vực (P5 restructure)

**Bối cảnh.** P5 — pha cuối của kế hoạch cấu trúc lại cây dự án (#146–#149). Hai file renderer lớn nhất còn lại là `features/game-editor.ts` (1.966 dòng / 125.959 byte) và `features/wizard/state.ts` (1.752 dòng / 83.771 byte). Sửa một panel (kho báu, đường đua, nhà cung cấp AI, lưu project) phải cuộn qua cả file. Nguyên tắc giữ nguyên: **chỉ di chuyển, không đổi hành vi**; renderer là script toàn cục nạp theo thứ tự `src/index.html`.

**Quyết định — trình soạn thảo.** `features/game-editor.ts` → `features/editor/` (7 file, mỗi file một banner `@ts-nocheck` + lát cắt nguyên văn):

| File | Dòng gốc | Nội dung |
| --- | --- | --- |
| `ai.ts` | 1–231 | nút "Tạo lại câu này" (P7) + gọi `lesson:regenerate-item` |
| `page.ts` | 233–505, 844–996 | nhập câu từ tệp, mở/đóng trang, markup, nối sự kiện, **lưu** (`saveEditedGame`) |
| `questions.ts` | 507–843 | hàng câu hỏi quiz/tình huống, đáp án, ảnh từng mục, tuỳ chọn minh hoạ/cách chơi/mẫu nhà |
| `drag.ts` | 998–1001, 1007–1062 | kéo-thả đổi thứ tự (dùng chung matching + race) |
| `matching.ts` | 1064–1183 | panel ghép cặp + `toggleEditorSections` |
| `treasure.ts` | 1185–1581 | panel Kho báu tri thức + kiểm dữ liệu |
| `race.ts` | 1002–1006, 1583–1966 | panel Đường đua + hằng số hiệu ứng + xem trước + kiểm dữ liệu |

`src/index.html` thay 1 thẻ `game-editor.js` bằng 7 thẻ `editor/*.js` đúng thứ tự cũ. File gốc xoá; chỉ dòng 1 (`@ts-nocheck` cũ) được thay bằng banner của từng file, phần còn lại giữ nguyên từng byte (LF).

**Quyết định — state wizard.** `features/wizard/state.ts` → `features/wizard/state/` (5 file, CRLF giữ nguyên):

| File | Dòng gốc | Nội dung |
| --- | --- | --- |
| `core.ts` | 1–539 | `wizardSteps`, `wizardState`, metadata trò chơi, đồng hồ/ETA, thông báo, reset |
| `providers.ts` | 541–771 | nhãn/mô tả provider, thẻ chọn provider, bảng mã lỗi, danh sách lựa chọn cấu hình |
| `config.ts` | 773–1010 | `wizardDefaultConfig`, nhận dạng kiểu đầu vào, mức tương thích câu hỏi |
| `draft.ts` | 1012–1397 | ngân hàng câu hỏi đã nhận, dựng draft, origin, giới hạn số mục |
| `actions.ts` | 1399–1752 | đổi thể loại, lưu project/thư viện, mở project, mở giáo án đã lưu |

`src/index.html` nạp 5 script đúng thứ tự cũ, trước `step-structure.js`. **Không đảo thứ tự**: một số hằng số cấp cao được tính ngay lúc nạp (bài học `WIZARD_ART_SCENE_CATEGORIES`, xem test load-order).

**Cách làm.** Script Node chia theo **dải dòng chính xác**, chỉ cắt ở ranh giới khai báo cấp 0; mỗi file = banner + đúng các dải của nó; dòng trống phân cách được chèn lại khi dựng lại. Kiểm tra trước khi ghi: mỗi dải trùng bản gốc, mọi dòng không trống đều thuộc một dải, và **nối các dải theo thứ tự gốc ra đúng phần thân file gốc**: editor `29d4e236…30444e` (125.867 byte, file `eaa83ce5…9b6043`), state `b034a258…7cc0aa` (83.673 byte, file `098459d1…99d6cc`). Bản gốc sao lưu ở `%LOCALAPPDATA%\Temp` trong lúc làm; script tách giữ lại để chạy lại được.

**Test đọc nguồn được cập nhật.**
- `tests/unit/generation-eta.test.ts`: đọc cả thư mục `features/wizard/state/*.ts` thay vì một file.
- `tests/legacy/smoke-p1.js`: nạp cả thư mục `dist/src/renderer/features/editor/*.js` khi chèn editor vào trang.
- `tests/unit/renderer-load-order.test.ts`: chỉ cập nhật chú thích (`wizard/state/core.js`); test tự đọc thứ tự script từ `index.html` nên 12 script mới được phủ ngay.
- `features/game-illustration.ts`: chú thích trỏ `editor/questions.ts`.

**Verification.** `npm run build` 0 · `node tests/run-unit.js` **68/68** (gồm load-order với 12 script mới) · `npm run check:renderer-globals` 54/55 script, 756 hàm, 6.192 call site, **0 undefined** · `npm run verify:css` **17/17**. Electron thật qua CDP (instance sạch, `env -u ELECTRON_RUN_AS_NODE`, cổng 9338): `ui-editor-art-check` **11/11** (mở trang soạn thảo, chọn ảnh có sẵn/tải lên/Tự động, lưu rồi đọc lại từ kho), `ui-race-editor-check` **10/10**, `ui-race-treasure-check` **18/18**, `ui-wizard-cancel-genre-check` **8/8**. Probe CDP một lần: 34 hàm toàn cục của editor đều `typeof === 'function'`; mở editor cho matching/treasure/race, `readMatchingEditor`/`readTreasureEditor`/`readRaceEditor` + `validateTreasureData`/`validateRaceData` chạy đúng, đóng trang sạch.

**Hai check đỏ sẵn, không do đợt này.**
- `ui-item-assets-editor-check` **17/27**: 12 assertion Phase A (render → đọc → lưu thật → mở lại) đều pass; Phase B fail vì vẫn đòi `document.querySelector('.modal')`, trong khi editor đã thành **trang** `.editor-page` từ #129 — `git show 8d5562c:...game-editor.ts` đã có `class="editor-page"`, nên assertion này đỏ từ trước P5. Vì thế phần đo màn hình cũng đo trang trống (`minFont 0px`, `modalRoot` ngoài viewport).
- `ui-wizard-structure-check` **13/14**: assertion "giữ focus bàn phím" nhận `document.activeElement` = BODY. Không phải lỗi code: trên chính instance đó, gọi `focus()` vào một `<input>` cũng để `activeElement` = BODY — cửa sổ chạy từ shell nền không nhận focus cấp OS. Các assertion còn lại (cuộn, tristate, tab, cây) pass.
- `ui-draft-guard-check` **7/8**: predicate + `beforeunload` pass; bước sinh draft thật báo "Chưa có nhà cung cấp AI nào sẵn sàng" vì profile mới không có model local (`aiActiveProvider().usable === false`); không liên quan editor/state.

**Không tách.** `features/three-game-interaction.ts` (813 dòng) là **một IIFE duy nhất** xuất `window.threeGame`; chia thành nhiều script sẽ phải bỏ closure hoặc chia sẻ state qua global — đổi ranh giới module chứ không phải di chuyển file, nên để nguyên. Các bước wizard (`step-generate` 973, `step-structure` 570, `step-input` 501, `step-analysis` 496, `step-configure` 338, `step-recommend` 321) mỗi file đã là một trách nhiệm và dưới 1.000 dòng.

**Không làm.** Không đổi tên/tham số hàm toàn cục, không đổi DOM/CSS, không đổi hợp đồng IPC/preload, không đụng `three-game-interaction`, `gameplay`/`games/*`, `src/game-engine`, LAN/presentation/SQLite/`.egame`.

**Next.** (1) Sửa Phase B của `ui-item-assets-editor-check` sang `.editor-page` và đo đúng trang soạn thảo; (2) chạy lại `ui-wizard-structure-check` trong cửa sổ có focus thật để xác nhận assertion focus; (3) roadmap còn `Packaged check` (cần máy sạch) — không thuộc đợt cấu trúc cây.

## #151 — Phase B của `ui-item-assets-editor-check` đo đúng trang soạn thảo

**Bối cảnh.** Phase B (docs/UI-PLAN-V2.md) đo editor ở 1920×1080 và 1366×768. Từ #129 editor là **trang** (`.editor-page` trong `#pageContent`) chứ không còn `.modal`, nhưng check vẫn đòi `document.querySelector('.modal')` nên đỏ từ trước P5 (đối chiếu `git show 8d5562c:src/renderer/features/game-editor.ts`). Phần đo vì thế chạy trên trang trống (`minFont 0px`, `modalRoot` ngoài viewport) — chỉ số 17/27 không nói gì về editor.

**Thay đổi.**
- `tests/ui/lib/screenshot-capture.js`:
  - `assertLayout` có `pageMode`: trang thường cuộn dọc theo thiết kế, nên thay cặp "no page scroll" + "nothing outside the viewport" bằng (a) không phần tử nào tràn **ngang** (`outsideX`), (b) không hộp cuộn lồng nhau che nội dung, (c) nếu trang cao hơn viewport thì tài liệu phải **cuộn được** (`docScrollable`, để bắt lỗi shell `overflow:hidden` làm mất nội dung). Surface checks giữ nguyên 5 assertion cũ.
  - `textScopeSelector`: giới hạn mẫu font/clipping vào đúng vùng đang kiểm; chrome dùng chung (brand 8px ở sidebar) không thuộc hợp đồng mật độ của editor.
  - `measureLayout` nhận thêm tham số scope và dùng `replaceAll` — placeholder xuất hiện **hai lần trên một dòng** (`TEXT_SCOPE_SEL ? … querySelector(TEXT_SCOPE_SEL)`), `replace` chỉ thay lần đầu.
- `tests/ui/ui-item-assets-editor-check.js`:
  - Phase B chờ setup onboarding của profile mới xuất hiện rồi `closeSetupWizard('close')`: overlay đó chiếm cửa sổ (`html[data-setup-fullscreen]`) nên trước đây số đo thuộc về onboarding chứ không phải editor.
  - Assert `.editor-page` + `.editor-question`, fontFloor 9px, `pageMode`, scope `#pageContent`; đóng editor sau khi đo.
  - Hai check template đổi selector từ `#modalRoot` sang `#pageContent` (editor rời modal từ #129) — trước đó trả `count=0` dù editor render đúng.

**Kết quả.** `ui-item-assets-editor-check` **29/29** (trước 17/27). Số đo thật: 1920×1080 doc 1495px; 1366×768 doc 1509px; font nhỏ nhất 9px (`span.tag`), 0 clipped, 0 tràn ngang, 0 hộp cuộn lồng, tài liệu cuộn được; ảnh `tests/ui/shots/item-assets-editor-{1920x1080,1366x768}.png`. Regression: `ui-editor-art-check` **11/11**, unit **68/68**.

**Không đổi.** Không sửa renderer/CSS/hợp đồng IPC; caller cũ của `measureLayout` (2 tham số, `ui-presentation-check`) giữ nguyên hành vi; không đổi 5 assertion của surface checks.

**Next.** (1) `ui-wizard-structure-check` trong cửa sổ có focus thật; (2) roadmap `Packaged check` (cần máy sạch).

## #152 — Màn chơi đặt tên theo template, không theo panel còn sót

**Bối cảnh.** Ảnh chụp chế độ trình chiếu của một game quiz đang chạy Xây nhà lại hiện badge đầu trang "GHÉP CẶP KIẾN THỨC". Probe CDP trên HEAD trước khi sửa cho thấy chuỗi nhân quả:
1. game quiz mới lưu từ wizard **không** có panel nào (`matchingGame`/`treasureHunt`/`race`);
2. mở trang soạn thảo rồi đóng: `editorPageState.game` đã mọc thêm cả ba panel (default của các panel ẩn);
3. bấm Lưu: hàng trong kho có `matchingGame` với 2 cặp mặc định;
4. chơi lại: `gameWorld()` trả `"matching"` → badge "GHÉP CẶP KIẾN THỨC" dù engine thật vẫn là quiz/house (engine chọn theo `template`).

Nguyên nhân gốc nằm ở chỗ editor render cả ba panel ẩn để thầy cô đổi thể loại tại chỗ, nhưng gán default của panel **vào chính object game**, và `gameWorld()` suy thế giới từ sự tồn tại của `matchingGame` thay vì từ `template`.

**Thay đổi.**
- `src/renderer/features/editor/page.ts` (`wireEditorPage`): default của ba panel giữ trong biến cục bộ (`matchingPanel`, `treasurePanel`, `racePanel`), không gán ngược vào `game`; panel vẫn render đủ để đổi thể loại.
- `src/renderer/features/games/result-screen.ts`: `gameWorld()` chỉ xét `template`; bỏ nhánh fallback theo `matchingGame` (chú thích ghi rõ payload sót không phải bằng chứng của engine).
- `src/main.ts` (`library:save-game`): sao `stored`, xoá các panel không thuộc template **trước khi validate** (để validate của template sở hữu không thấy panel rỗng), rồi mới validate + upsert. Cách này cũng tự chữa các hàng đã lưu sai khi thầy cô lưu lại lần sau.
- Tests: `tests/ui/ui-game-worlds-check.js` thêm 4 check #152 — lưu quiz có `matchingGame` rác thì hàng lưu sạch, chơi đúng `THỬ THÁCH KIẾN THỨC` + `data-game-world='quiz'`, mở editor không thêm key, lưu từ editor chỉ còn panel của template; đồng thời thêm guard đóng setup onboarding cho profile mới. `tests/ui/ui-house-building-check.js` thêm cùng guard (trước đó vỡ `null.click` vì overlay onboarding thay `#modalRoot`).

**Kết quả.** `node tests/run-unit.js` **68/68** · `npm run check` 0 · `npm run build` 0 · `ui-game-worlds-check` **46/46** (trước 39/43) · `ui-house-building-check` **84/84** · `ui-item-assets-editor-check` **29/29** · `ui-race-editor-check` và `ui-editor-art-check` pass. Probe sau sửa: editor không thêm key, hàng lưu có `hasMatchingGame/hasTreasureHunt/hasRace = false`, `world: "quiz"`, `headerLabel: "THỬ THÁCH KIẾN THỨC"`.

**Không đổi.** `playGame` vốn đã chọn engine theo `template`; không đổi DOM/CSS/hợp đồng IPC; không đụng engine matching/treasure/race; `normalizeGame` (đường `.egame`) giữ nguyên nên file cũ vẫn mở được.

**Chưa xử lý.** Bố cục màn Xây nhà **trước khi trả lời** ở 1920×1080 còn khoảng trống lớn bên phải và `.stage-kicker` nằm sát trái, cách xa câu hỏi đang căn giữa; sau khi trả lời (`.is-house-showcase`) thì gọn và cân. Đây là thay đổi thiết kế nên chưa làm khi chưa chốt.

**Next.** Chốt với chủ dự án xem có siết bố cục Xây nhà trước khi trả lời không; nếu không, quay lại roadmap `Packaged check` / các mục AI.

## #153 — Bỏ ảnh theo từng câu, nhãn quiz mới, ảnh thay nhãn xám và hạ HUD Xây nhà

**Bối cảnh.** Bốn yêu cầu từ chủ dự án:
1. giáo viên cần **bỏ ảnh minh hoạ của riêng một câu** (trước đây chỉ tắt được cả game, hoặc để trống — mà trống thì chế độ `auto` lại tự vẽ tranh chủ đề);
2. game quiz ở chế độ Xây nhà khi mở toàn màn hình phải mang tên **"Đấu trường tri thức"**;
3. **xoá pill xám "THỬ THÁCH KIẾN THỨC"** ở đầu cột câu hỏi và **thay bằng ảnh minh hoạ nếu có**;
4. **hạ hộp HUD Xây nhà ("Đã xây 1/5 phần") xuống** theo +Y.

**Thay đổi.**
- **Bỏ ảnh theo câu.** `src/shared/illustration-registry.ts`: sentinel `ILLUSTRATION_NONE_ID = 'none'`; `resolveIllustration` trả `null` ngay sau khi normalize. Phải là sentinel riêng vì `''` nghĩa là "chưa chọn" và vẫn để `auto` tự vẽ. Renderer mirror trong `src/renderer/features/game-illustration.ts` (`resolveStageIllustration`) — unit test có guard chống lệch giữa hai bản. Editor (`features/editor/questions.ts`): nút **"✕ Bỏ ảnh"** ghi sentinel (không ghi `''`), thêm option `Không dùng ảnh` trong picker, badge/thumb riêng, chip `🚫 Không ảnh` ở danh sách mục, và nút disabled khi câu đã ở trạng thái bỏ ảnh.
- **Nhãn quiz.** `src/renderer/features/games/result-screen.ts`: `GAME_WORLDS.quiz.label` → `ĐẤU TRƯỜNG TRI THỨC`. Nhãn này là nguồn duy nhất cho cả badge đầu màn chơi (`.play-head-world`) và dải băng sân khấu (`.stage-world-tag`), nên đổi một chỗ là cả hai đổi.
- **Bỏ pill xám.** `src/renderer/features/games/quiz.ts` (`renderQuestion`): `kicker` để rỗng với trắc nghiệm thường; các loại câu đặc biệt (tình huống, điền từ, trả lời ngắn, đúng/sai) vẫn giữ nhãn vì nó nói cho học sinh biết đang trả lời kiểu gì. Nút "Gợi ý" vẫn dùng chung hàng đó khi câu có gợi ý.
- **Ảnh thay chỗ nhãn (Xây nhà).** Ảnh của câu hỏi được đặt **ngang hàng, bên trái ô giữ chỗ của nhà** (`.house-art-row`), chỉ khi ảnh là **chỉ định** (`explicit`: hình có sẵn hoặc ảnh tải lên) — tranh "tự động" không tính, nếu không mọi câu Xây nhà đều mọc thêm một cảnh mặc định. CSS `src/renderer/styles/game-house.css`: kích thước theo `vh` (`clamp(150px, 22vh, 280px)`, toàn màn hình `clamp(180px, 30vh, 360px)`).
- **Hạ HUD.** `.game-stage:not(.is-house-showcase) .house-progress` có `margin-top: clamp(12px, 2.6vh, 30px)` (toàn màn hình `clamp(18px, 4vh, 52px)`); trạng thái showcase giữ nguyên.

**Vì sao xếp ngang, không xếp trên.** Đo bằng probe CDP ở đúng hai cỡ máy chiếu:
- `%` không dùng được: `.stage-col.is-main` là flex column `align-items:center`, nên `.house-question-art` co theo nội dung và `34%` tính quanh chính nó — đo được **102×64px**.
- Xếp ảnh **trên** câu hỏi: ở 1920×1080 đẩy **6 phần tử** (đáp án + nút) ra ngoài 1080px; ở 1366×768 lưới đáp án co về **0px**.
- Xếp **ngang** bên trái ô nhà: ô nhà rộng 1784px nhưng ngôi nhà 3D chỉ chiếm ~340px giữa, nên hàng ảnh dùng chỗ trống vốn có và **không ăn thêm chiều cao**: tràn 0px ở cả hai cỡ.

**Kết quả.** Ảnh **324×203** @1920×1080 và **230×144** @1366×768, nằm bên trái ô nhà (`pickedBesideSlot`). HUD cách đáy thanh tiến độ **61px** @1920×1080 và **45px** @1366×768 (assertion đòi ≥12); trạng thái showcase vẫn gọn (50px).

**Kiểm tra.** `npm run check` 0 · `npm run build` 0 · `node tests/run-unit.js` **68/68** (illustration-registry 36 check) · `npm run check:renderer-globals` 0 undefined · `npm run verify:css` **17/17** · Electron thật qua CDP, mỗi check một instance sạch: `ui-game-worlds-check` **52/52** (39→52), `ui-house-building-check` **85/85**, `ui-editor-art-check` pass (thêm 4 check cho "Bỏ ảnh"), `ui-stage-illustration-check` **169/169** (trước 160/160 + `(could not open: quiz)`: thiếu guard nên mẫu quiz bị bỏ qua; guard đóng onboarding đã thêm, xem dưới), `ui-item-assets-editor-check` **29/29**, `ui-fullscreen-density-check` **8/8** (trước đó `FAIL không tìm thấy .stage-question …` vì cùng lý do thiếu guard).

**Không đổi.** Không đổi hợp đồng IPC, engine matching/treasure/race, `normalizeGame` (đường `.egame` cũ vẫn mở được), `playGame`. Câu không có ảnh và game không phải Xây nhà vẫn chạy đúng như trước.

**Chưa xử lý.** WebGL không hiện trong `Page.captureScreenshot` (chỉ thấy sàn xám ở 1366×768) — đây là hạn chế chụp, ngôi nhà 3D được chứng minh bằng assertion toạ độ chiếu của `ui-house-building-check`. `ui-stage-illustration-check` và `ui-fullscreen-density-check` trước đó đỏ/thiếu mẫu trên profile mới vì không có guard đóng setup onboarding; đã thêm cùng guard như #151/#152.

**Next.** Roadmap `Packaged check` (cần máy sạch); các mục AI/giáo án chưa chốt thứ tự.

## #154 — Phân trang và xoá nhiều ở Thư viện trò chơi

**Bối cảnh.** Trang Thư viện trò chơi render **toàn bộ** game đã lưu trong một lưới ba cột, không có phân trang; muốn dọn nhiều game thì phải mở menu "•••" của từng thẻ và xoá từng cái. Giáo án (#122) và Lịch sử kết quả (#123) đã có đúng mô hình "phân trang + tick nhiều + xoá một lần", nên trang thư viện được làm theo cùng khuôn thay vì phát minh cách khác.

**Thay đổi.**
- `src/renderer/pages/library.ts` (viết lại, 7 → ~75 dòng):
  - `LIBRARY_PAGE_SIZE = 9` — lưới ba cột nên một trang là đúng **ba hàng thẻ**, cùng quy tắc "một trang vừa màn hình" như #122 (12 giáo án) và #123 (15 lượt).
  - `libraryCurrentPage` (kẹp trang theo danh sách hiện tại), `librarySelectedIds` (bộ id đã tick, bỏ id không còn tồn tại), `libraryPagerHtml` (Trước / số trang / Sau + "Trang X/Y · N trò chơi · 9 mỗi trang"), `librarySelectionBarHtml` (chọn tất cả trang này, đếm, xoá, bỏ chọn).
  - `libraryCardHtml` bọc `gameCard()` trong một `div` có ô tick ở góc phải-trên và viền `ring-2` khi được chọn. **Không sửa `gameCard()`**: trang chủ dùng chung hàm này và không cần affordance chọn.
- `src/renderer/core/controller.ts`: `updateLibrarySelectionUi()` (cập nhật viền/thẻ/nút mà không render lại, giữ focus ô vừa bấm — cùng cách #122/#123); bốn action `library-page`, `library-select`, `library-clear-selection`, `library-delete-selected`; select-all `#librarySelectAll` chỉ tick thẻ đang render; gõ tìm kiếm hoặc đổi bộ lọc đều đưa về **trang 1**.
- `src/preload.ts` + `src/main.ts`: IPC mới `library:delete-games` (`deleteGames(ids)`), đối xứng `library:delete-sessions` (#123). Kiểm tra: mảng id chuỗi duy nhất, từ chối rỗng, tối đa 500 mỗi lần; xoá **tất cả hàng trong một transaction** rồi mới dọn ảnh đã tải (#124) — dọn sau khi xoá hết để ảnh dùng chung bởi hai game bị xoá cùng lượt không bị giữ lại vì hàng kia còn "trông như" đang tham chiếu. Trả `{ ok, deleted, missing }`.
- `tests/ui/ui-library-paging-check.js` (mới, 12 check): tạo 11 game tổng hợp qua IPC thật, lọc danh sách về đúng fixture đó (để check không bao giờ tick/xoá game sẵn có của giáo viên), rồi kiểm 9 thẻ/trang, pager, chọn tất cả chỉ tick trang đang xem, lựa chọn sống qua trang, xoá đúng nhóm đã chọn, game khác còn nguyên, pager biến mất khi còn một trang, IPC từ chối lô rỗng; dọn sạch fixture ở cuối.
- `preload.ts` lặp literal kênh (file chạy sandbox, không import được) — đúng quy ước ghi trong chính file.

**Kết quả.** `ui-library-paging-check` **12/12**. Log thật: "9 of 11 listed (12 in the library)" (profile mới đã có 1 game sẵn), "Trang 1/2 · 11 trò chơi · 9 mỗi trang", chọn-tất-cả 9/9, "Đã chọn 10 trò chơi" sau khi tick thêm 1 thẻ ở trang 2, xoá 10 → còn 1 probe và 2 game tổng cộng (1 sẵn có + 1 probe), lựa chọn reset. Regression: `ui-card-menu-check` pass, `ui-lessons-paging-check` và `ui-results-paging-check` pass.

**Không đổi.** `library:delete-game` (xoá lẻ từ menu "•••") giữ nguyên; `gameCard()`, markup thẻ, IPC cũ, SQLite schema, đường `.egame` không đổi. Trang chủ vẫn hiện tối đa 6 game gần đây như trước.

**Chưa xử lý.** Chưa có "chọn tất cả mọi trang" (chỉ chọn theo trang, giống #122/#123) và chưa có hoàn tác sau khi xoá — lời xác nhận đã ghi rõ không thể hoàn tác và nhắc xuất `.egame` trước.

**Next.** Roadmap `Packaged check` (cần máy sạch); cân nhắc thống nhất ba trang danh sách (giáo án / thư viện / lịch sử) vào một helper phân trang dùng chung nếu lần sau phải sửa cả ba.

## #155 — Nhãn "Cách chơi" trên thẻ trò chơi

**Bối cảnh.** Một game quiz chơi theo một trong hai cách: **Cổ điển** (trả lời câu hỏi nhận điểm) hoặc **Xây nhà** (`gameSetup.gameplayMode === 'house'`, #140). Cách chơi chỉ hiện trong editor (ô `#editGameplayMode`) và trên màn chơi; thẻ ở Thư viện trò chơi và trang Tổng quan trông giống hệt nhau, nên giáo viên phải mở editor hoặc chơi thử mới biết game nào là Xây nhà.

**Thay đổi.**
- `src/renderer/shared.ts` (`gameCard`): thêm **chip cách chơi ở đầu hàng chip** (trước môn học) cho template `quiz`:
  - `🏗 Cách chơi: Xây nhà` — nền hổ phách, chữ đậm, khi `gameSetup.gameplayMode === 'house'`.
  - `🎯 Cách chơi: Cổ điển` — nền xanh nhạt, khi `gameplayMode` vắng mặt **hoặc** `'classic'`; đúng luật `editorGameplayMode()` (vắng = cổ điển).
  - Bốn thể loại khác không có cách chơi nên **không** có chip.
- Mỗi chip mang `data-play-mode="house|classic"` (móc cho test) và `title` giải thích bằng câu chữ của option trong editor.
- Vì `gameCard()` dùng chung với trang Tổng quan, chip cũng xuất hiện ở "Trò chơi gần đây" — cùng một thẻ, không thêm đường code riêng.
- `tests/ui/ui-play-mode-card-check.js` (mới, 7 check): tạo 4 game tổng hợp qua IPC thật (quiz house, quiz không đặt `gameplayMode`, quiz `'classic'` tường minh, matching), lọc thư viện về đúng fixture rồi đọc `data-play-mode` + chữ trên chip, kiểm matching không có chip và chip không thêm nút nào vào thẻ; dọn fixture cuối.
- **Không đổi**: dữ liệu lưu (key `gameplayMode` đã có từ #140), editor, engine, hợp đồng IPC, bố cục/nút trên thẻ.

**Lựa chọn thiết kế.** Hiện nhãn cho **cả hai** cách chơi chứ không chỉ Xây nhà: câu hỏi cần trả lời là "trò chơi đó đang ở cách chơi nào", nên để trống rồi ngầm hiểu là cổ điển vẫn bắt giáo viên suy luận. Chip Xây nhà dùng màu đậm để game khác biệt nổi bật; chip Cổ điển nhạt để không tranh chỗ với môn/lớp/số câu.

**Kết quả.** `ui-play-mode-card-check` **7/7**: "🏗 Cách chơi: Xây nhà" (house), "🎯 Cách chơi: Cổ điển" (thiếu key và key tường minh), matching `data-play-mode=""`, thẻ house vẫn chỉ có `play,play-fullscreen`. Ảnh chụp 1920×1080 và 1366×768 (`tests/ui/shots/play-mode-card-*.png`) cho thấy chip nằm gọn một dòng cùng ba chip cũ. Regression: `ui-library-paging-check` và `ui-card-menu-check` pass.

**Chưa xử lý.** Chưa lọc/tìm theo cách chơi (bộ lọc thể loại giữ nguyên); chưa hiện cách chơi ở chỗ khác ngoài thẻ (ví dụ màn Dự án của tôi hay Lịch sử kết quả).

## #156 — `ui-wizard-structure-check` xanh nhờ guard setup onboarding, không phải "thiếu focus OS"

**Bối cảnh.** Check này đỏ **13/14** từ lâu; assertion "the render keeps the keyboard focus on the ticked row" thấy `activeElement = BODY` dù `document.hasFocus()` trả `true`. Kết luận cũ (bàn giao #150) là "cửa sổ chạy nền không lấy được focus OS", nên mục này bị treo lại như việc chỉ làm được trên máy có cửa sổ thật.

**Điều tra.** Probe trên profile mới: `#librarySearch.focus()`, `#wizardDocText.focus()` và checkbox `[data-wizard-section].focus()` **đều** để `activeElement = BODY`; cùng lúc `document.documentElement` mang `data-setup-fullscreen` và `.setup-fullscreen` đang mở trong `#modalRoot`. Đóng overlay bằng `closeSetupWizard('close')` thì `focus()` đặt đúng vào `librarySearch`. Nguyên nhân là **màn setup toàn màn hình ẩn `.app-shell`** (CSS theo `html[data-setup-fullscreen]`) — trang ẩn thì không nhận được focus bàn phím. `Page.bringToFront`, `Emulation.setFocusEmulationEnabled` và `WScript.Shell.AppActivate` đều không cứu được khi shell còn ẩn, nên mọi nỗ lực "ép focus OS" trước đây vô ích.

**Thay đổi.** `tests/ui/ui-wizard-structure-check.js`: thêm guard chuẩn ngay sau `connect()` (chờ `#modalRoot .setup-fullscreen`, `closeSetupWizard('close')`, chờ 250ms) như các check khác, kèm chú thích vì sao lỗi focus từng bị hiểu sai. Không đổi mã ứng dụng.

**Kết quả.** `ui-wizard-structure-check` **14/14**; chạy hai lần trên hai profile mới đều 14/14, assertion focus thấy `focused: "sec_2583"` = `expected`. `ui-draft-guard-check` vẫn **7/8** (profile mới không có nhà cung cấp AI — nguyên nhân thật, cần model/API key chứ không phải overlay).

**Chưa xử lý.** `ui-draft-guard-check` cần một nhà cung cấp AI dùng được (không đưa API key thật vào check); chưa có script chạy trọn bộ UI check bằng một lệnh.

## #157 — Trang Cài đặt là accordion sáu mục; sửa `ai:test-provider` đọc cache key rỗng

**Bối cảnh.** Yêu cầu: gom trang Cài đặt thành sáu mục — *AI local tích hợp*, *Nhà cung cấp API Key*, *Phong cách giảng dạy*, *Giao diện* (đổi tên từ "Dữ liệu và trải nghiệm"), *Tác vụ dùng AI*, *Chẩn đoán trực trặc (log)* — và khi chọn mục thì nội dung mới hiện ra. Trước đó trang này là một cuộn dài gồm các thẻ mở hết, giáo viên muốn đổi khoá API phải cuộn qua toàn bộ phần AI local.

**Thay đổi — renderer.**
- `src/renderer/pages/settings.ts`: thêm `settingsSectionHeader(id, icon, title, chipHtml, openSection)` và `SETTINGS_SECTION_IDS`. Sáu `<section data-settings-card>` giờ là header + `<div data-settings-panel id="settingsPanel-…">`; chỉ mục đang mở bỏ `hidden`, năm mục kia vẫn render đầy đủ rồi ẩn bằng class. Header là `<button>` nằm **trong** `<h3>` (nguyên tắc: `h3` không được đặt inside `button`) nên assertion cũ `panel.querySelector('h3')` vẫn đúng. Chữ "Dữ liệu và trải nghiệm" → "Giao diện", phần quyền riêng tư/`.egame` chuyển vào mục này dưới nhãn "Dữ liệu trên máy". Mỗi header mang chip trạng thái: `✓ Sẵn sàng` / `○ Chưa cài đầy đủ` (AI local), `✓ n/5 sẵn sàng` / "Chưa có nhà cung cấp sẵn sàng", giọng điệu, chủ đề sáng/tối — mục đóng vẫn tự nói được tình trạng của mình. Các nút tác vụ (`#aiTasksRefreshBtn`, `#cpuRuntimeVerifyBtn`, `#exportDiagnosticsBtn`, `#openLogFolderBtn`, `#clearDiagnosticsBtn`) vào trong panel của chính nó.
- `src/renderer/shared.ts`: `state.settingsSection = 'aiLocal'` — state UI thuần, không nằm trong `settings` nên không bao giờ được lưu.
- `src/renderer/features/settings.ts`: `wireSettingsSections()` toggle tại chỗ, **không re-render**. Lý do: `render()` dựng lại input từ `state.settings`, nên bấm sang mục khác khi đang gõ một base URL/API key chưa lưu sẽ xoá mất chữ đó. Panel cũng giữ nguyên DOM để `saveSettings()` (đọc `#settingLargeText`, `#settingSound` không guard) và `readAiProviderPatches()` (duyệt mọi `[data-ai-provider]`) tiếp tục chạy đúng với mục đang đóng. Mở mục *Tác vụ*/*Chẩn đoán* thì gọi `refreshAiTaskList()` / `refreshDiagnosticsInfo()` ngay tại chỗ.
- `src/renderer/core/controller.ts`: gọi `wireSettingsSections()` trong `wirePage()` khi `state.page === 'settings'`.
- `package.json`: script `check:settings-sections-ui`.

**Thay đổi — sửa bug thật ở main.** `ui-ai-provider-settings-check` đỏ 6/8 sau khi gom mục. Probe qua CDP cho thấy provider lưu đúng (`hasKey: true`, base URL và model đúng) nhưng main trả `AI_CONFIG` "chưa có API key". Nguyên nhân: handler `ai:test-provider` gọi `readStoredProviderKey()`, vốn chỉ đọc `settingsProvidersCache` — cache này chỉ được `createChatClientForProvider` và `recordProviderTest` nạp. Test ngay sau khi "Lưu khoá", chưa từng sinh nội dung trong process, vì thế luôn thấy cache rỗng. Trước đây bug bị che vì cả ba check provider chạy chung một instance Electron (đã sinh nội dung nên cache đã đầy); nay mỗi check một profile sạch nên nó lộ ra. Sửa: `ai:test-provider` gán `settingsProvidersCache = (settings.ai || {}).providers || {}` ngay sau khi load settings.

**Kết quả.** `npm run check` 0 · `node tests/run-unit.js` **68/68** · `npm run build` 0 · `npm run check:renderer-globals` 0 undefined (54/55 script, 764 hàm, 6.274 call site) · `npm run verify:css` **17/17**. Electron thật, mỗi check một profile sạch: `ui-settings-sections-check` (mới) **17/17** hai lần, `ui-ai-provider-settings-check` pass hết sau khi sửa main, `ui-ai-provider-key-check` pass, `ui-ai-provider-wizard-check` pass. Ảnh chụp 1366×768 cho cả ba trạng thái (AI local mở, Nhà cung cấp mở, Giao diện mở): một header mở, các header còn lại ẩn nội dung nhưng vẫn hiện chip, sidebar "Lưu thay đổi / Tóm tắt cấu hình / Liên kết nhanh" không đổi.

**Chưa xử lý.** `ui-ai-tasks-paging-check` vẫn 6/8 trên profile mới — cần ≥11 tác vụ lịch sử, không liên quan accordion (đã ghi ở bàn giao #153). Chưa có animation mở/đóng; chưa nhớ mục đã mở giữa các lần khởi động (chỉ trong một phiên).


