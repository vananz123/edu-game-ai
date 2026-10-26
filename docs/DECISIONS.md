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

## #57 — Preprocessor on real teacher documents: header detection must be shape-based, and the retention loss must be stated

> **Reconstructed 2026-10-23.** The original wording of #57–#59 was lost in an accidental overwrite and is not recoverable from git (those entries were never committed). This entry was rebuilt from `docs/STATUS.md` and `docs/BENCHMARKS.md` §O6e, which are intact. Facts and numbers are sourced; prose is not the original.

Date: 2026-10-23.

**Context.** #56 shipped three gated preprocessing layers, but its numbers came from synthetic fixtures. Running L1+L2 on the four real PDFs in `tests/tailieu/` (11–29 pages, extracted with the same `pdfParse(buffer)` call `src/main.ts` uses) exposed three real bugs.

**Bug 1 — L1 was deleting real content.** The repeated-header filter only required: line ≤80 characters, appearing ≥3 times, and not matching a content pattern. Two-column PDFs repeat every table cell across pages, so genuine content was treated as a repeated page header and removed:

| File | Wrongly removed |
| --- | --- |
| Giải quyết mâu thuẫn hiệu quả | `-` (×3), `–` (×3), `mâu thuẫn.` (×3), `chọi với nhau, không hòa thuận.` (×3) |
| K6 định hướng học tập (2 cột) | `Trò chơi:` (×5), `Khám phá`, `kiến thức`, `mới`, `tập.`, `lớp:` |
| Tư duy tích cực | `-`, `–`, `Vận dụng` (×4) |
| Tư duy phản biện | `-`, `–` |

Removing a standalone bullet also glued words together. **Fix:** `isHeaderLike()` plus `SENTENCE_END` so only lines that *look* like a header/footer can be dropped, and a split bullet is re-joined onto the start of the next line instead of deleted. `LESSON_PREPROCESS_VERSION` 1 → **2**. After the fix only the true page header and the two-column table header are removed.

**Bug 2 — the L2 loss is large and must not be hidden.** Retention on real documents (`node tests/manual/measure-retention.js`):

| Document | raw | fast 12k | deep 18k | bigram recall fast | deep | content chars fast | deep |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Giải quyết mâu thuẫn (17 tr) | 26.389 | 11.989 | 17.989 | 55% | 78% | 49% | 73% |
| K6 định hướng (29 tr, 2 cột) | 33.971 | 11.988 | 17.990 | 42% | 60% | 37% | 56% |
| Tư duy tích cực (12 tr) | 19.850 | 11.995 | 17.985 | 67% | 97% | 66% | 99% |
| Tư duy phản biện (11 tr) | 19.660 | 11.960 | 17.971 | 73% | 98% | 66% | 99% |

So fast keeps **42–73%** and a real 11–29-page plan loses **27–58%**. This is still better than the previous ~8.000 + ~3.900 character cut (which split sentences and tables), but **"fewer tokens and nothing lost" must never be claimed** — the change moves *where* it cuts and improves *cleanliness*, it does not reduce loss.

**Bug 3 — a silent API trap.** Passing `{ mode: 'deep' }` (a field that does not exist on the options type) **silently** fell back to the fast budget instead of failing.

**Verification.** `npm run check` exit 0; `npm test` exit 0 (40 Node suites plus `lesson-store` through Electron).

**Unverified.** Question quality from the truncated excerpt (needs the real model — O6 gate) and real prefill seconds were not measured.


## #58 — Budget policy after #57: rank with a *real* query, never higher budgets, never unqueried ranking

> **Reconstructed 2026-10-23.** See the note on #57.

Date: 2026-10-23.

**Context.** #57 left one question open: real Vietnamese plans do not fit the 12.000-character fast budget, so what should be done?

**Options considered.**
1. **Raise the budget.** Rejected on measured grounds: at #54's ~22,6 tok/s prefill a 771-token prompt is ~36 s, so 12k characters is already ≈2,5 minutes and ×1,5 would be ≈4 minutes per analysis on the pilot machine (i5-10210U, 4C/8T). Too slow.
2. **Analyze in parts.** Deferred: it multiplies the cheapest step by 2–4 calls.
3. **Rank the excerpt with the teacher's query (chosen).** `preprocessLessonSource(..., { query })` plus `rankBlocksForQuery()` — *supervised* ranking driven by `buildRetrievalQuery()`.

**Decision.**
- Selection order is `fits` → `ranked-query` → `head-tail`. A query that matches nothing **falls back to head+tail** rather than sending an arbitrary excerpt.
- `lesson:analyze` behaviour is **unchanged**: it has no query, so it stays on head+tail.
- `LESSON_PREPROCESS_RANKING_ENABLED` stays `false`. Unsupervised L3 still waits on the O6 gate (#56); only the query-driven path ships.
- `LESSON_PREPROCESS_VERSION` stays **2**.
- Separate real fix: `analyzeLesson` previously preprocessed **twice** (once to log metrics, once for the prompt). It now builds `prepared` once and passes it to `buildLessonAnalysisPrompt({ prepared })`.

**Measured** (`node tests/manual/measure-query-ranking.js`, 4 real PDFs, fast 12.000-character budget, queries taken from the middle third that head+tail discards — a synthetic and therefore *optimistic* query):

| Document (chars after L1) | bigram recall head+tail / ranked / ranked-query | query sentences kept (of 2) |
| --- | --- | --- |
| Kỹ năng sống, 17 tr (24.663) | 55% / 53% / 53% | 0/2 / 2/2 / **2/2** |
| Định hướng AI, 29 tr, 2 cột (31.861) | 42% / 48% / 48% | 0/2 / 0/2 / **0/2** |
| Tư duy tích cực, 12 tr (18.238) | 67% / 72% / 67% | 0/2 / 2/2 / **2/2** |
| Tư duy phản biện, 11 tr (18.184) | 73% / 73% / 74% | 0/2 / 2/2 / **2/2** |

**How this must be described.** head+tail keeps **0/2** queried sentences in **all four** documents; ranking keeps **2/2** in **3/4**. Overall bigram recall is essentially unchanged (it sometimes drops 2 points) — expected, because ranking selects for the *question* and therefore discards more of the unqueried middle. So L3 must be described as **"keeps the part the question targets"**, never as **"keeps more content"**.

**The one failure is diagnosed, not a scoring bug.** `diagnose-query-ranking.js` shows the queried sentence sits in a 1.186-character block, but the two-column document has **7** blocks with `blockValue() === Infinity` (tables / question lists) that consume the whole 12k **before** the unprotected block is reached. That is a deliberate trade (never drop a question list), so the lever is the **budget** or the priority of `Infinity` blocks — not the scoring formula.

**Verification.** `npm run check` exit 0; `npm test` exit 0 (41 Node suites plus `lesson-store` through Electron; `lesson-preprocess: ok`).

**Unverified.** Generated question quality (O6 gate); no product caller passes `query` yet, so the prefill benefit is unmeasured; real teacher queries will be harder than the synthetic ones above.


## #59 — Fullscreen play surface: the "122px dead strip" was a **dead CSS rule**, and the density check measured the wrong edge

> **Reconstructed 2026-10-23.** See the note on #57. The measured table and the list of rejected alternatives are reproduced from `docs/BENCHMARKS.md` §U1 and `docs/STATUS.md`.

Date: 2026-10-23.

**Symptom.** In presentation mode the play surface left a 122px empty strip under the answer grid and used only 1120px of the available width, even though the fullscreen CSS set `max-width: none`.

**Root cause.** The fullscreen rule for `.stage-center` was written as `html[data-fullscreen="1"] html …`. There is no `<html>` nested inside `<html>`, so the selector **never matched**. `max-width: none` and the larger `gap` inside it had never applied, while the normal rule's **1120px** cap and `align-self: center` stayed in force.

**Fix (all in `src/renderer/styles/app.css`).**
- The fullscreen `.stage-center` rule was rewritten with a **single** `html`, placed *after* the normal rule so equal specificity wins by order: `display:flex; flex-direction:column; justify-content:flex-start; flex:1 1 auto; align-self:stretch; min-height:0; max-width:none; min-width:0`.
- `.game-stage` under fullscreen became an explicit `display:flex; flex-direction:column` (it was `display:grid` with `align-content:center`). A flex column gives `.stage-center` the real leftover height; the grid's `minmax(0,1fr)` row was sized by the item's content, with `align-content:center` adding 74px above and below.
- `.stage-center > .answer-grid` gets `flex:1 1 auto` plus `grid-auto-rows: minmax(min-content, 1fr)`: leftover height goes into taller answer buttons, and the `min-content` floor guarantees the last line of an answer is never clipped. `min-height: min-content` on `.answer-option` makes that floor explicit.
- Answer font `2.9vh + 0.5vw` → `3.2vh + 0.5vw` (and the `max-height:800px` floor `2.5vh` → `2.9vh`) so buttons use the reclaimed height. The three duplicate `gap: clamp(8px, 1.4vh, 16px)` rules on `.stage-center` were raised to `1.6vh`/`18px`; the copies are kept because Tailwind's `@layer` output order is not something this fix should depend on.
- Removed a stray `.ZZPlaceholder{}` inserted mid-rule in `.stage-question`, which split it in two and turned half its declarations into an invalid block.

**Rejected alternatives.** `grid-auto-rows: minmax(0, 1fr)` clipped 3px at 1366×705; plain `auto` brought the 112px strip back; making `.stage-center` a one-column grid collapsed `auto` rows to 0px under overflow and broke the "Tìm kho báu" fixture.

**Measured after the fix** (same machine, same fixture, 1280×721).

| Metric | before | after |
| --- | --- | --- |
| Question | 45.3px / 1120px | 45.3px / 1189px (93% of width) |
| Answer | 25.7px, 115px tall | **28.6px**, 174px tall |
| Grid | 1120px, 2 cols | 1189px, 2 cols |
| Empty area of stage | 49.0% | **27.9%** |
| Free space below content | 122px | **12px** (39px of it is the `Tiếp tục` bar, inside `.stage-center`) |
| `ui-fullscreen-density-check` | 7/9 | **9/9** |

**Edge cases.** A long question (6 lines) with 4 long answers, via CDP device-metrics override at 1280×720 / 1024×600 / 1366×705 / 1920×1010: 0 clipped answers and no page scroll at every size; the stage self-scrolls (by design) when content genuinely does not fit, as at 1024×600.

**Harness corrections made with this fix.** `tests/ui/ui-fullscreen-density-check.js` measured "space under the answers" from the *answer grid* downward, which counted the `Tiếp tục` bar as empty space; it now measures to the last **visible** child of `.stage-center` and prints the gap directly under the grid separately. `tests/ui/ui-race-treasure-check.js` was left unchanged — its treasure fixture fails to save (`questions: []`), which throws before any of this work is involved.

**Verification.** `npm run build` exit 0; `npm run check` exit 0.

**Unverified.** No visual check by a person on a projector; only the synthetic fixtures above. `ui-play-surface-check.js` (27 checks, unrelated to this area) errors at its first frame on an unmodified build too, so it was not used as evidence either way.


## #60 — Content categories are an additive, optional field; `general` is a value, not an error

Date: 2026-10-23.

**Context.** `docs/archive/specs/update_plan_6.txt` asks for one *content category* per game item so icons and illustrations can be chosen per topic. Before this, no such field existed anywhere: `GameQuestion`, `MatchingPair`, the five draft schemas in `lesson-contracts.ts`, and every `.egame` already written by teachers carried no category at all. So this is new schema, not an extension of an existing one.

**Decision.** A new field `contentCategory` is added to game items as an **optional, additive** property:
- It is never required. A missing or unknown value normalises to `general`; that is not a validation error and must never fail a generation, a save, or an import.
- Saved games without it keep working unchanged, and the field is only written when something actually chose a value.
- 24 topic categories plus `general`. The list is **topic-shaped** (Động vật, Thực vật, Không gian, …), not subject-shaped, because the assets it drives are topical — a cat illustration illustrates "Động vật", not "Tiếng Việt".
- Category → illustration/icon mapping is done **in TypeScript**, never by asking a model for a path or a file name.

**Naming.** The field is `contentCategory`, not `category`. `category` is already taken three separate ways in this codebase and reusing the word would be ambiguous: the wizard's "category step" (game-type recommendation), `PresentationCategoryGroup` (the `categorize` matching-mode groups), and `GameType` itself.

**Unverified.** No teacher has reviewed the 24-category list yet; the ids are chosen to match primary-school Vietnamese topics and can still be renamed before any release ships them.

## #61 — Content icons are inline SVG nodes in a committed TypeScript registry, not an npm dependency

Date: 2026-10-23.

**Context.** No icon library was installed — `dependencies` is supabase, better-sqlite3, express, jszip, mammoth, pdf-parse, zod and nothing else, and `node_modules` has no icon package. The renderer is loaded as plain `<script>` tags with no bundler, so an ESM import of an icon package is not even available to it. #31 had already chosen code-drawn inline SVG over asset files so `.egame` export/import can never point at a missing file; `treasure-art.ts` is the working precedent.

**Decision.**
- Icons are `[tag, attrs][]` node arrays compiled into `src/shared/icon-registry.ts`, rendered by `renderIconSvg()` which emits a self-contained `<svg viewBox="0 0 24 24">` string.
- The nodes are extracted **once** from `lucide@1.61.0` (ISC licence, attribution kept in the file header) by `scripts/build-icon-registry.js`. The generator's output is committed; it never runs during `build`, and Lucide is **not** added to `dependencies` or `devDependencies`.
- Consequence: the packaged app carries no icon runtime, the renderer needs no module loader, and nothing is fetched from the network — preserving #31 and the offline gameplay rule (#4).
- The registry is total: `getIconNode()` returns `null` for an unknown name and never throws. A bad name degrades to "no icon", never to a broken screen.

**Unverified.** The 60 names are a proposal. Each must be confirmed present in 1.61.0 by the generator before any "60 icons" claim is made; the generator fails loudly and lists substitutions when a name is absent.

## #62 — Illustrations are referenced by app-owned `assetId` only; a missing asset degrades, never throws

Date: 2026-10-23.

**Context.** `update_plan_6` requires local SVG illustrations per category and forbids storing fake paths to files that do not exist. That rules out both "the model returns a file path" and "the registry references an asset that may be absent".

**Decision.**
- Items store `illustrationAssetId`, an opaque id resolved through `illustration-registry.ts`. No model output ever becomes a path, a URL, or a file name.
- Resolution is total. An unknown, missing, or disabled id yields "no illustration"; it never throws and never renders a broken image.
- Selection is **deterministic** (`pickIllustrationForCategory(category, seed)` hashed from the item id), so the same game always shows the same art and nothing flickers between renders.
- The teacher can switch illustration rendering off (Tự động / Chọn thủ công / Tắt). Turning it off affects decorative content art only; functional UI icons are unaffected.
- Teacher-uploaded artwork stays deferred under #31's reasoning — validation, size, cleanup and export rules are a separate piece of work.

**Unverified.** The starter illustration set is deliberately small. No "24 categories of art" claim is made until the assets actually exist in the registry.

## #63 — Per-item asset fields are lenient optional strings; zod must be asked for the *input* JSON schema

Date: 2026-10-23.

**Context.** `update_plan_6` Phase 2 threads `contentCategory` / `iconName` / `illustrationAssetId` through every item shape (`GameQuestion`, `RaceQuestion`, `TreasureStageQuestion`, `ArenaChoiceQuestion`, `ArenaTextQuestion`, `ScenarioSituation`, plus the drafts). Two guarantees had to hold at once: a legacy `.egame` file with none of these fields must still open, and an AI draft with a wrong-typed or unknown value must not be rejected wholesale. Adding the fields nearly broke constrained decoding, which is why this is written down.

**Decision.**
- The fields are **optional, lenient strings, not enums**. An unknown category/icon degrades in the adapter (`general` / no icon) instead of failing validation. Nothing here is worth refusing a saved lesson or an entire draft over (#60, #61, #62).
- `illustrationAssetId` is a plain string, **not nullable**. `nullable()` emits `"type": ["string","null"]`, which llama.cpp's `response_format` subset does not accept. An empty string already means "cleared", so no information is lost.
- Do **not** use `.isOptional()` to build these. In zod v4 it crashes `discriminatedUnion` with *"Cannot read properties of undefined (reading 'values')"*, and the arena question schema is a discriminated union. `z.preprocess(...)` + `.optional()` gives the same leniency safely.
- `safeJsonSchema()` must call `z.toJSONSchema(schema, { io: 'input' })`. Two reasons: `response_format` describes what the *model* must emit, so the input side is the correct projection; and zod v4 throws *"Transforms cannot be represented in JSON Schema"* for **any** `.trim()` / `.transform()` by default.

**Regression this caught.** `safeJsonSchema` swallowed its own exception and returned `null`, and nothing asserted otherwise. Once transforms were involved, the constrained-decoding schema silently disappeared for the game templates — colour would still parse, so a whole suite of "it works" was possible while `response_format` was empty. `tests/unit/lesson-workflow.test.ts` is what surfaced it. Two follow-ups are expected of future changes here: keep the assertion that `responseSchema` reaches the model call, and treat a `null` JSON schema as a failure, not a fallback.

## #64 — The model is *invited* to fill the item asset keys and the app fills the gap; the model never chooses art

Date: 2026-10-23.

**Context.** Phase 3 had to put the new keys in front of the model. The risk is asymmetric: `contentCategory` and `iconName` are decoration, while the questions themselves are the product. On the pilot CPU every extra output token is paid for on a 2B model, and a model that is *forced* to emit a category will sometimes invent one (`"động-vật"`), which the adapter then has to discard anyway.

**Decision.**
- The draft **and** item-regeneration prompts list the **real** 24 ids from `CONTENT_CATEGORY_IDS` (never a hand-copied list, so the prompt cannot drift from the validator) and state explicitly that the keys may be **omitted** if the model is unsure. Omitting is never an error.
- **`illustrationAssetId` is not offered to the model.** Illustration choice is deterministic in the app (`pickIllustrationForCategory`, #62); letting the model pick an id could only produce art that contradicts the category, and costs tokens to say so.
- `fillMissingContentCategories` (`lesson-workflow.ts`) runs inside `generateGameDraft`'s `validate`, i.e. the single choke point shared by the app and `bench-ai.js`. It fills `inferContentCategory(item text…, analysis.topic)` **only** when the field is missing or blank, **never overwrites** a value the model returned (even an unknown one — normalising is the adapter's job, #60, and two layers disagreeing about the raw draft is worse than one wrong category), and **never throws**.
- `LESSON_PROMPT_VERSIONS.draft` 2 → 3 so content produced under the old wording is not reused from the cache (O5).

**Unverified.** No llama-server and no `.gguf` exist on the development machine, so `bench-ai.js` was not re-run: the token/latency cost of the extra line is **unmeasured**, and it is not yet known whether the model actually emits either field. The app-side fill is what makes the feature work regardless; the prompt is an optimisation that still needs a real lesson run to justify.


## #65 — The editor keeps item asset keys in hidden inputs, not in a JS map

Date: 2026-10-23.

**Context.** `saveEditedGame` rebuilds every item object **field by field** from the DOM (`id`, `prompt`, `points`, `explanation`, …). Anything not represented in the DOM is therefore deleted on the first save — silently, and with no error to notice. Phase 2 made the keys survive load/export; without Phase 4 the first trip through the editor would have erased them again.

**Decision.**
- Each item row renders three hidden inputs (`data-field="contentCategory"`, `iconName`, `illustrationAssetId`), the same pattern already used for `data-option-id`. Rendered in all five templates: arena/scenario cards, matching pairs, treasure stages, race questions.
- `readEditorItemAssets(scope)` is the single reader; the editor never touches the raw field values anywhere else. It returns `{}` for a row with no asset inputs, so spreading it cannot invent fields.
- A value is persisted **only** if it survived normalisation, and `general` is omitted because a missing category already means general. This is `itemAssetFieldsForSave` (`src/shared/asset-validation.ts`), deliberately mirroring `itemAssetsFromDraft` in the project adapter so the two cannot disagree.
- The renderer is loaded as **classic `<script>` tags** (`src/index.html`) and cannot import `src/shared/*`, which compiles to CommonJS. The editor therefore holds **local copies** of the category-id list, the icon-id set and the labels. They only drive display and a defensive blank-out; **the main process re-validates on save**, so a copy drifting can only hide a chip, never corrupt data. This was a real trap: a hand-written first draft of these lists invented 20 categories that do not exist and 47 icon ids that the registry does not contain.
- The "Minh họa" choice is game-level and stored in `gameSetup.illustrationMode` (`auto` | `manual` | `off`), because `GameSetup` already round-trips through the project adapter unchanged and has a string index signature. Applied once at the top of `saveEditedGame` rather than in each of the four template branches. An unrecognised or absent value reads as `auto`, so every existing saved game keeps working untouched.

**Verification.** The DOM half cannot run in Node (no DOM, and the renderer has no test harness), so it is verified by driving the **real renderer** over the Chrome DevTools Protocol instead — see **#66**. In short: `tests/ui/ui-item-assets-editor-check.js` passes **13/13** against a built app, including a real save read back from the on-disk store. The one gap left is the **packaged NSIS install** (only the dev build was exercised). Phase 5 must still consume `illustrationMode` when rendering; nothing reads it yet beyond saving it.

## #66 — The editor's DOM half is tested over CDP against the real app, not in Node

Date: 2026-10-23.

**Context.** #65 added DOM-mutating code (`editorAssetFieldsHtml` / `readEditorItemAssets`) that no unit test can reach: the renderer is classic `<script>` tags with no module system, so there is nothing to `require`. A throwaway `vm` string check during development was not reproducible, and the previously recorded "click through in the packaged build" step named a file (`tests/smoke/smoke82.js`) that does not exist. The risk being guarded is nasty and silent: a template that forgets the hidden inputs **deletes the teacher's metadata on the first save** without any error.

**Decision.**
- New check `tests/ui/ui-item-assets-editor-check.js`, built on the existing `tests/manual/lib/ui-check-lib.js` CDP helper (the same one `ui-fullscreen-density-check` uses), added as `npm run check:item-assets-ui`. It launches against a **built** app, so it tests the compiled renderer, not a mock.
- It asserts behaviour, not implementation: render→read returns all three keys; `general` and unknown icon ids are dropped; quiz and matching both render the inputs; **a real save read back through `window.eduGame.getLibrary()` still has all three keys and `illustrationMode`**; and a legacy game gains none.
- Persistence is read back **through IPC from the store**, not from a JS variable, because the bug class is "the value survived in memory but never reached disk".
- Two setup traps are recorded here because both produced misleading red/green results: (1) `state.db` is only refreshed by `refreshDb()`, so a game saved via `window.eduGame.saveGame` is **not** in `state.db` and a lookup by title yields `undefined` (prefer `getLibrary()` for assertions); (2) the item test values must be **real** ids from `src/shared/icon-registry.ts` (e.g. `paw-print`, not `paw`) — a fake id is blanked at render time by design, which looks like a lost key but is correct behaviour.
- `ui-check-lib` reads the port from `argv[2]` **or** `CDP_PORT`; under `node -e` or `npm run` the argv form does not work, so set `CDP_PORT`.

**Unverified.** Only the **dev build** was exercised, not the packaged NSIS installer. `treasure-hunt` and `race` are covered by code review plus `item-assets-editor.test.ts` (adapter round-trip) but are not yet driven through the CDP check.




## #67 — Illustrations are a fixed, generated set, and `illustrationMode` is honoured in exactly one place

**Date.** 2026-10-23

**Context.** Phase 4 saved `gameSetup.illustrationMode` (`auto` / `manual` / `off`) but **nothing read it**, so a teacher choosing "Tắt" still saw artwork and "Chọn thủ công" silently fell back to a category default. Phase 5 had to make the switch real and put something visible on the play surface. Three constraints shaped it: saved games must play **offline**, `.egame` files must not grow image payloads, and AGENTS.md forbids executing or trusting model output — so "generate an image" was never an option.

**Decision.**
- **A fixed set, not generated art.** `src/shared/illustration-registry.ts` defines 24 illustrations, each a pure inline SVG composed from an existing `icon-registry` icon plus a per-category palette. No binary assets, no network, nothing model-authored. An unknown id can only ever mean "draw nothing".
- **One resolver owns the switch.** `resolveIllustration()` is the only consumer of `illustrationMode`. `off` → `null`, always (the item is not even inspected). `manual` → **only** an explicitly picked, resolvable illustration; a missing pick stays empty, because inventing one would break the promise the mode makes. `auto` → the pick, else the category default. Unknown/absent mode → `auto`, so games saved before #65 render exactly as they did. Like `asset-validation.ts`, it is **total**: hostile input yields `null`, never an exception.
- **`.stage-illustration` is a sibling immediately before `.stage-question`** in arena/scenario, treasure-hunt and race, and sits inside `.stage-center` for the three matching boards. Matching has **no** `.stage-question` by design (the cards are the content), so it takes the game-level illustration from the first pair instead of forcing a question surface that does not exist.
- **Height is a hard ceiling.** The density rules (#59) require the question and answers to fill most of the stage, so the illustration is capped (~132px, smaller for treasure and race, `clamp`ed) and is **dropped entirely under `max-height: 760px`** rather than squeezing the answer grid. `ui-fullscreen-density-check` stays **9/9**.
- **Icon data is generated into the renderer.** `src/renderer/*` is loaded as classic `<script>` tags and cannot import `src/shared/*` (CommonJS). `scripts/build-icon-data.js` writes `src/renderer/features/icon-data.ts` from the registry; `npm run build` regenerates it (bootstrapping a placeholder so `tsc` can resolve `getIconNode`) and then runs `build:icons:check`, which **fails the build** if the committed copy drifts.

**Trap found the hard way (do not repeat).** The first attempt exposed `getIconNode` from the **preload** by `require`-ing `../shared/icon-registry`. The preload runs with `sandbox: true`, where only `require('electron')` is permitted: the `require` threw, **the entire preload aborted, and `window.eduGame` disappeared** — breaking every IPC feature in the app, not just icons. The build stayed green and the UI still rendered, so the only signal was `typeof window.eduGame === 'undefined'` over CDP. Verified by stashing the change: the bridge reappeared as an `object`. **Never `require` a local module from the preload.**

**Verification.** `npm run check` exit 0; `npm test` exit 0 (includes the new `illustration-registry` suite, 15 checks). `tests/ui/ui-stage-illustration-check.js` on a live built Electron app over CDP: **44/44** — all five templates × `auto` / `off` (nothing drawn even with a pick) / `manual` without a pick (nothing invented) / `manual` with a pick (exactly that one) / legacy game with no mode (behaves as `auto`), plus size and real-icon assertions. `ui-fullscreen-density-check` **9/9**. The drift guard was proven by tampering with `icon-data.ts` (exit 1) and restoring it (exit 0).

**Known-preexisting failures, not caused by this change.** `ui-race-treasure-check` reports **1 FAIL** (`treasure: mission controls are reachable after scrolling`); it reproduces with the illustration **removed entirely by CSS**, which is the proof it is not this work. `ui-fullscreen-check` (14/16) and `ui-play-surface-check` (26/27) likewise fail on unrelated assertions. These are tracked for Phase 6, not hidden. **Baseline recorded on 2026-10-23 for future sessions: do not re-investigate these three suites as regressions of Phases 4–5 — the counts above are the expected state of this checkout.**

**Unverified.** Only the **dev build**; the packaged NSIS installer has not been run. Phase 3's benchmark is still blocked (no `llama-server` / `.gguf` on this machine).


## #68 — The offline promise is verified on the packaged app by a request-counting check with a mandatory positive control

The offline claim ("saved games play without a network") was the one part of Phases 4–5 that had only ever been exercised on a dev build. `tests/ui/offline-packaged-check.js` now closes that gap: it runs against `release/win-unpacked`, plays one synthetic game per template, and counts every outbound request it can observe (fetch, XHR, WebSocket, `sendBeacon`, and remote `src`/`href` in the stage) while doing so.

- **The count must count.** A check that reports `0` is worthless unless something proves the counter is live, so the runner fires one deliberately failing request at the end and **fails the whole run if the wrapper did not see it**. This is not ceremony: the first working version of the check recorded nothing at all and still passed every other assertion. Two distinct bugs were hidden behind the `0`.
- **`EDUGAME_USER_DATA` is the only way to get a clean profile.** `src/main.ts` pins `app.setPath('userData', process.env.EDUGAME_USER_DATA)`, so `--user-data-dir` is ignored. Restarting the exe "fresh" silently reused the previous profile, which reused the same renderer document, which kept prototypes patched by the previous run. Hours went into chasing a `window.fetch` that was already somebody else's wrapper. **Any CDP check that patches globals needs a fresh `EDUGAME_USER_DATA` per run.**
- **A positive control must call the wrapper, never the saved original.** `origFetch.call(window, url)` bypasses the wrapper by construction and therefore always looks blind. The control must go through `window.fetch` (i.e. the thing being validated), not around it.
- **Never `await` a request to an unreachable host in these checks.** The promise may never settle; the wrapper's synchronous observation is the signal worth asserting, and the response is irrelevant. Use a reserved-TLD host (`example.invalid`) and don't await it.
- **What this check does *not* cover, on purpose.** It drives `playGame` with synthetic objects rather than importing a real `.egame`, so the import/export round-trip and the NSIS installer are still unverified for these phases. Recorded in `docs/STATUS.md` rather than implied.

**Verification.** `npm run dist:dir` exit 0; the packaged asar contains `dist/src/renderer/features/icon-data.js`, `game-illustration.js`, `dist/src/shared/illustration-registry.js`, `dist/src/preload.js`, `dist/src/main.js`. Against that exe over CDP: `offline-packaged-check` **11/11** (reproduced on two ports with two fresh profiles), `ui-stage-illustration-check` **44/44**, `grading-packaged-check` **7/7**. Zero outbound requests; `illustrationMode: 'off'` still draws nothing; all five templates draw inline SVG.

## #69 — Offline is proven against a *blocked* network, and local 2B generation is not yet reliable

#68 proved `attempts === 0`. That is a claim about what the app *did*, not about what it could have done: if the counter had a blind spot, a passing run and a broken app would look identical. #69 removes that ambiguity by making the internet genuinely unreachable at the process level and re-running everything.

- **Block without admin rights: `--proxy-server=127.0.0.1:9`.** A `netsh`/firewall block needs elevation, which a normal session does not have. Pointing Chromium's proxy at a closed port makes every http(s) request fail for the whole app while leaving loopback (`127.0.0.1:57952`, where `llama-server` listens) untouched — which is exactly the boundary we want to test, since gameplay and local AI are loopback-only by design.
- **Prove the block before trusting anything measured under it.** The first assertion in every such run must be that a *real host* fails from inside the app. Measured: `fetch('https://huggingface.co/')` → `Failed to fetch` in **2 025 ms**. Without this line the "11/11, attempts=0" below would prove nothing.
- **`--host-resolver-rules` is not a substitute here** — it logged `Failed parsing rule: MAP` and never applied. Do not assume it silently worked; the proxy did the blocking. Verify block effectiveness by measuring, never by passing the flag.
- **Loopback must stay reachable.** A firewall rule that blocks everything would also kill `llama-server` and produce a false "offline broken" verdict. The proxy approach is preferred precisely because it is *app-to-internet*, not *app-to-anything*.
- **Installed models are never re-downloaded.** `installLocalAiModel()` on an already-present file ran for ~100 s and returned `installOk: true` — that time is the SHA-256 of the 1,2 GB `.gguf`, not a transfer (`model-installer.ts` verifies then `return`s before any `fetch`; `runtime-installer.ts` does the same for `llama-server`). A future reader seeing "100 s to install" must not conclude it re-downloaded.
- **The honesty finding: `qwen3.5-2b-q4_k_m` passed the game schema 3 times out of 10.** Ten identical offline requests produced **3 valid games** and **7 rejections** by `gameDraftSchema.safeParse` (`thiếu correctOptionId …`), each attempt costing 34–42 s. The validator is behaving correctly — it refused to hand a teacher a malformed game — but the pass rate is unacceptable for the primary flow. **Do not claim local generation is reliable on the 2B model.** The §O6 6/6 result covers the *analysis* prompt, which is a different and easier task; the two numbers are not interchangeable.
- **How to measure this again.** Ten attempts, packaged build, network blocked, fresh profile — then count `generateOk` vs validator rejections. Anything less than ten attempts cannot distinguish "generally works" from "works sometimes", and a single lucky run is exactly how a 30% success rate gets written down as a success.

**Verification.** Packaged exe + `--proxy-server=127.0.0.1:9` + fresh `EDUGAME_USER_DATA`: block proven (2 025 ms `Failed to fetch`); `offline-packaged-check` **11/11** with a live positive control; boot `bootRequests: 0`; `installOk: true` (~100 s, verify only); `startLocalRuntime` → `READY`; generation **3/10**. No product code changed.

## #70 — An "illustration" is a composed scene, and its box geometry is part of the feature

**Problem.** Each of the 24 illustrations rendered **one 72px Lucide icon inside a 320×200 frame** — about 5% coverage. On the play surface it read as a floating icon on a coloured rectangle, not as a picture. Teachers would not recognise that as artwork.

**Decision.** An illustration is now a *scene*: `src/shared/illustration-scene.ts` owns `SCENE_WIDTH/HEIGHT` (320×200), `SCENE_SUBJECT_SIZE` (72 → **168**), a `SceneSpec` per category (motif + `subjectY`) and `renderSceneSvg()`, which layers **sky → ground → motif → halo → subject**. Eleven motifs cover the 24 categories. `illustration-registry.ts` gained optional `sky`/`ground` palette entries (a distinct hex pair per category) and delegates to `renderSceneSvg()`. `src/renderer/features/game-illustration.ts` is a classic script that cannot import, so it mirrors the scene table, motif builder and palettes and rebuilds `stageIllustrationHtml()` with the same layer order; a unit test compares the two copies so they cannot drift.

**The geometry is the hard part, and it bit twice.**

- **Trap 1 — a width the box cannot honour.** `width: min(320px, 46%)` with a *separate* clamped `height` let the SVG paint outside its box and cover the question, answers and CTAs. No assertion caught it: the CSS was valid and every check was green. Only screenshotting the real play surface showed it. Fix: `aspect-ratio: 16 / 10` + `max-width` + `max-height`, so the box shrinks to whatever both constraints allow.
- **Trap 2 — a `height` without a `width`.** Three pre-existing fullscreen rules set `height: clamp(...)` alone. With `aspect-ratio`, a height-only rule leaves the width free, so the box became a shape the 16:10 scene could not fill; `preserveAspectRatio: meet` letterboxed it and the ground band read as *clipped*. Any `.stage-illustration` rule must set width and let height follow.
- **Trap 3 — `display: none` under a media query.** A `@media (max-height: 760px)` block removed the illustration outright on 1366×768 laptops. This is why the very first measurement of this surface reported a 150×94 frame: **the scene was not squashed, it was hidden.** Short windows now scale it down instead.

**What the measurements actually said.** Probing the real play surface at 720px tall: hiding the scene left the lowest answer at 524px, showing it at 200px moved it to 687px against a 683px viewport — so a 200px scene costs ~210px and can push an answer off-screen. That was measured before the CSS traps above were fixed, so it over-states the cost; after the fix the same surface reports `stageOverflow: 0`, `pageOverflow: 0` and all four answers visible with the scene at its authored **320×200** in fullscreen, 320×200 in the windowed panel, and a reduced width on short windows. The rule that matters is therefore "size by width, never shrink the scene below 320px wide unless the window forbids it", not a hard pixel cap picked by hand.

**Guard against recurrence.** `tests/unit/illustration-registry.test.ts` reads `app.css` raw and fails if any `.stage-illustration` rule sets height without width, or if the short-window block hides the illustration. **Both guards were proven to fail on the reverted rule** (exit 1), not merely to pass on the fixed one.

**Consequence for string tests.** Assertions cannot see a bad picture. A cloud motif painted behind `cloud-sun` and waves behind `waves-horizontal` passed every check; only a rendered PNG found them. All 24 scenes were reviewed by eye through Electron `capturePage`, and motif mismatches were corrected (environment trees → hills, language clouds → none, weather clouds → sparkles, water-world waves → hills, tree motif redrawn).

**Method note.** Two earlier probes in this task returned confident but *false* readings — `closest('.stage')` was `null` so the comparison silently measured nothing, and a stateful `display: none` left over from a previous probe made every later sweep read `0x0`. A measurement that returns the same number for both conditions is broken, not reassuring. Check the counter before trusting the count.

**Verification.** `npm test` exit 0 (**25/25** illustration checks), `npx tsc --noEmit` clean, `npm run build` exit 0, `check:stage-illustration-ui` **44/44**, `ui-fullscreen-density-check` **9/9**, play surface screenshotted and read at 320×200 with all four answers on screen.


## #71 — Step-5 progress is a stage counter; the ETA is measured, never invented

**Problem.** Step 5 showed five stage labels, a `⏳` glyph and an elapsed clock. On a slow machine the single "Tạo nội dung trò chơi" stage can run for minutes with nothing moving, so the run reads as frozen. The file's own comment refused a percentage because the model has no token stream — correct for a *timer-based* percentage, but it also blocked the one number the UI can honestly show.

**Decision.** Three different things, kept deliberately separate:

1. **Percentage = stage counter.** `generationProgressFraction()` maps the stage reported by the main process (`lesson:progress`) to `1/5 … 5/5`. It never advances on a timer, so it cannot claim progress that did not happen. `ready` is hard-coded to 100% so a skipped repair stage cannot leave the bar stuck at 80%.
2. **ETA = measured baseline.** `ai_tasks` already stores `started_at`/`finished_at` per generation, so the remaining time is derived from this machine's own finished runs (median of the last 50, excluding the in-flight row which has no `finished_at`). The median is used instead of the mean so one abandoned six-hour run cannot inflate every later estimate. Samples under 1 s or over 3 h are discarded as clock skew. **With no samples the UI prints "Đang chạy…" — it never shows a made-up number.** Past the learned total it says "Đã lâu hơn lần tạo trước" instead of a countdown that never reaches zero.
3. **Spinner = the only indeterminate element.** The running stage gets an 11px stroke-only SVG ring (`aria-hidden`), so it needs no image asset and inherits the text colour. `prefers-reduced-motion` stops both the spin and the bar transition.

**Why the maths exists twice.** The renderer is a flat set of classic `<script>` tags — nothing in `src/renderer` imports `src/shared`, and there is no bundler. A shared module therefore *cannot* be reached at runtime. The pure maths lives in `src/shared/generation-eta.ts` (imported by the test) and is mirrored in `wizard/state.ts` (what actually runs). `tests/unit/generation-eta.test.ts` asserts the renderer's constants, median index and fraction formula against the tested module, and was **proven to fail** (exit 1, `ngưỡng mẫu tối thiểu trong renderer bị lệch`) when the threshold was changed from 1000 to 2000.

**Chosen over the alternatives.** A CSS-only indeterminate bar was rejected: five real stages are reported, so a bar with no position would throw away information the main process already has. A per-stage weighted ETA was rejected: only the *total* is persisted, so weights would be another invented number.

**Trap found while working.** PowerShell rendered the Vietnamese source as mojibake, which looked like a corrupted file. It was not: a byte-level scan over all 93 `src` files found exactly **one** corrupted file (`app.css`, 11 comment lines) and every `.ts` file clean — the console code page was the problem, not the repository. Do not "fix" Vietnamese text on the strength of terminal output; check code points.

**Verification.** `npx tsc --noEmit` clean; `npm run build` exit 0; `generation-eta: ok`; `npm test` exit 0 (whole suite); drift guard proven to fail on injected skew. **Not verified:** the spinner, bar and ETA have not been seen on a real run — a live generation needs the local model, and no screenshot was taken. Visual review is still owed before this can be called done.

## #72 — An illustration is a depth stack, not one motif (the second rewrite of #70)

**Problem.** #70 replaced a 72px icon with a 168px icon plus *one* backdrop motif. Rendered at 320×200 that is still a big icon on a coloured card: the subject covers ~84% of the height, so there is no room for anything to be behind it or in front of it, and "animals" and "jobs" differ only in hue and in one decoration. The scene demonstrates the *noun*, never a *place*.

**Decision.** Seven painted layers, in this order:

```
sky → far → mid → halo → subject → props → fg
```

and four paint slots on `SceneSpec`: `sky`, `horizon`, `standing`, `fg`, plus `subjectY`. `standing` feeds both `mid` and `props` on purpose — one choice of environment ("this looks like a street / a meadow / a lab") should not have to be made twice, and a category with nothing to put beside the subject gets no `props` layer rather than a filler object.

`SCENE_SUBJECT_SIZE` 168 → **120** and `SCENE_HORIZON` = 150. The subject is now ~36% of the height: still the focal point, but it stands *in* a place. `fg` (grass, stones, waves) is what sells the depth — it overlaps the subject's feet. `line` was added as a bare-horizon far layer for interior/abstract categories, because without any horizon the subject floats even when it has a foreground.

**What the preview caught that no assertion could.** `tests/manual/scene-preview.js` renders the *shipped* renderer (`dist/`) into a 320×200 node and saves a PNG via CDP. Three defects were only visible there:

1. The ground band ran through the middle of the icon — the subject read as "cut in half". Fixed by raising the horizon to 150 and keeping every `subjectY` ≤ 92; now pinned by a geometry test.
2. `stones` were wide flat ellipses that read as smudges. Redrawn as small pebbles.
3. `books` were two floating bars that read as a slider. Redrawn as a stack with three spines.

The lesson repeats #70 and is the reason Phase A is previewed before scaling: **a scene can pass every string test and still be ugly.** Tests were added for the *rules* the previews taught (subject below the horizon, every scene has a foreground, layer order, no layer repeating the subject) — but the previews remain the only check for "does it look like anything".

**Mirroring to the renderer.** `game-illustration.ts` cannot import `illustration-scene.ts` (classic `<script>`), so the layer renderers are copied. Drift is guarded by: scene table equality, `STAGE_ILLUSTRATION_SUBJECT_SIZE`/`STAGE_ILLUSTRATION_HORIZON` equality, and "every `data-scene-primitive` the renderer can emit exists in the shared composer". The horizon guard was **proven to fail** (`AssertionError: horizon in the renderer drifted`) by changing only the renderer's 150 → 160.

**Full review of all 24 (follow-up).** Rendering the other 18 scenes found five more defects, every one of them invisible to string assertions:

4. `stones` sat at `foot + 10/12`, i.e. 2–4px below a 200px canvas, and read as a **grey bar clipped at the bottom edge** (`art`, `language`, `history`).
5. `props` and `fg` were both pinned to the frame edges, so in `art` the easel boards painted **over** the book stack — an unreadable tangle of bars in the corner.
6. `graph` was moved to the mid layer but `math` still asked for it as `horizon`; `renderFar()` returned `''` and the scene **silently lost its whole backdrop** while still emitting valid SVG.
7. `plants`/`food`: the first `roots` shape curled back on itself (**a caterpillar**) and `bushes` straddled the horizon (**a floating cloud**).
8. `art` had only one depth cue; `fg: 'stones'` became `fg: 'boards'`.

**Two rules the review turned into tests.** (a) `props` and `fg` occupy disjoint horizontal spans — every primitive's `[min,max]` at the ground line is tabulated and checked for all 24 scenes. (b) Every primitive named in a scene table must be one *the layer receiving it* can draw; `graph`-as-horizon passed 30 checks because an unknown primitive renders as empty string rather than as an error. `fg` now lives inside x 84..244 and the frame edges belong to `props`, which is what makes rule (a) possible.

**Not done.** The 24 scenes were authored and now all reviewed in preview form; the play surface itself is still unrendered with the stack. Whether a scene is *recognisable* to a teacher remains a judgement call no test makes.

## #73 — Changing an item's artwork is a whitelisted write, and matching pairs were silently losing it

**Problem (two, and the second is the interesting one).**

1. A teacher could see one illustration per item on the play surface but had **no way to change it**. The editor's `contentCategory` / `iconName` / `illustrationAssetId` inputs are hidden and only carry what the model produced, so the only path to different artwork was regenerating the item — a model call that also rewrites the text.
2. **Matching pairs lost their artwork entirely.** The editor has written the three asset keys into matching pairs since #65, but `matchingPairSchema` never declared them, and zod strips unknown keys silently. So the fields were written, validated away, and the adapter then read nothing. Nothing failed: the pair just had no picture.

**Traps hit and recorded.**

- **A declared "fallback icon" is not the icon that gets drawn.** `resolvedFor()` prefers the *category's* icon, so the first version of the default quietly rendered `languages` while the constant said `book-open`. Caught by a unit assertion, fixed by passing the icon explicitly. If a future default wants its category's own icon, say so in the constant instead of adding a second rule.
- **`ui-fullscreen-density-check`'s "≥62% of the stage" assertion had to be removed, not repaired.** It measures the `question..answer-grid` rectangle with `offsetWidth`/`offsetHeight`, so it cannot see the illustration. At 1280×720 (the OS window that check runs in) the layout is one column and the illustration sits *above* the question, which is why it read ~48% "empty" on a screen with no visible gap. Two repairs were attempted and both were **proven meaningless by negative control** (shrink the art to 200px, squeeze the question, pad the text column — the number did not move): taking the block's top edge from the first child mixes `getBoundingClientRect()` on the row with `offsetTop` on a `position: sticky` stage, and dropping the illustration from the measurement on purpose removes the very content teachers pay to see. The check is now **8/8** with the two assertions that measure what a teacher sees directly (`no >90px gap under the answers`, `no page scroll`). Measuring the whole content block of the two-column layout properly is a separate task, recorded in `docs/STATUS.md`.
- **Rebuilding `dist/` while the app is running wedges the CDP session**, and a stray `electron`/`node` process keeps port 9341 answering so the next check hangs with no output. Kill both before every relaunch — this bit twice in this session.
- **PowerShell mangles nested quotes in `node -e`**, which silently truncated a control script into something that ran different code than intended (and produced a false "negative control passed"). Write a temp `.js` file for any multi-token probe; the inline form only works for trivial expressions.

**Verification.** `npm run check` exit 0. `npm test` exit 0 (`illustration-registry` **33** checks, up from 31: the default scene, its renderability, and a renderer/shared drift guard on the two constants). Live Electron over CDP: `ui-stage-illustration-check` **169/169** (was 94 — added default-scene assertions × 5 templates and projector runs of the default), `ui-play-surface-check` **156/156**, `ui-fullscreen-density-check` **8/8**, `ui-race-treasure-check` **19/19**. Stage overflow stayed **0** on every template at both resolutions, which is what makes the larger art safe. Screenshots reviewed at 1366×768 and 1920×1080 for quiz, matching, treasure and race.

**Still unverified / open.** Whether the bigger picture *looks* right is a judgement no assertion makes — the screenshots were reviewed and accepted, but no teacher has seen them. `ui-race-treasure-check` still inherits the OS window size (pre-existing, see #87). The "content covers the stage" property has lost its guard until a correct measurement exists (above).


**Decision.**

- `matchingPairSchema` now spreads `itemAssetFieldsSchema`; `MatchingPairDraft` / `MatchingPair` extend `ItemAssetFields`; the adapter maps both directions; `padDraftAssetKeys` covers `matching`. A test round-trips a pair through `parseGameDraft` → adapter, which is the check that would have caught the hole (a test exercising only the adapter stays green with it).
- New IPC **`lesson:patch-item-assets`** with `applyItemAssetPatch()` (`src/shared/asset-validation.ts`) as its whole security surface. The patch is a **whitelist over `ITEM_ASSET_PATCH_KEYS`** — `contentCategory`, `iconName`, `illustrationAssetId` — not a merge: keys outside it are ignored even when sent, so a compromised renderer cannot rewrite a prompt, an id, an answer or a link through this channel. Absent key = leave as is; `''` = clear.
- **No AI on this path.** It never touches the model, so changing artwork costs nothing and works with the runtime stopped.
- `patchDraftItemAssets()` owns the two draft-level rules: a **treasure item is its nested `question`** (the stage carries the story, the artwork belongs to the question the student answers — patching the stage would write a value no renderer reads), and **every write is re-parsed** by `parseGameDraft`, so a patch cannot introduce a value the schema would have rejected.
- Step 5 gained `wizardIllustrationGrid()`: a card per item showing the **real play-surface SVG** from `stageIllustrationHtml()`, not a stand-in, plus a one-at-a-time "Đổi" popover with two `<select>`s (asset, content category). The grid header states the active `illustrationMode`, so the `manual` mode that produces no picture is honest ("mục chưa chọn sẽ không có hình khi chơi") instead of looking broken.

**Cleared means absent, and that is not a detail.** `tolerantText` maps `''` → `undefined` on re-parse, and both the adapter and the UI read *absent* as "no pick". The tests assert the measured behaviour (`undefined` after the round-trip) rather than `''`; asserting `''` would pin a value nothing else in the app ever sees. `contentCategory: ''` is different — `general` is a real category, so it survives as itself.

**Trap for the next person touching `step-generate.ts`.** `generation-eta.test.ts` scans that file with `/^\s*\['([a-z]+)', '[^']*'\]/gm` and asserts the hits are exactly the five MỤC 5 stages. The artwork picker first listed its 25 categories as `['animals', 'Động vật']` pairs, which **silently joined that match** and turned the checklist assertion into a comparison against category ids. The labels are now a plain object (`WIZARD_ART_CATEGORY_LABELS`) so they cannot match, and a comment says why. This is the third time in #72/#73 that a string-scraping test was broken by an innocuous-looking literal rather than by the feature.

## #74 — A classic script may not touch another script's binding at top level (step 5 crashed on load)

**Problem.** Step 5 threw **"Cannot access '…' before initialization"** the moment it was opened, and the page died before painting. Introduced by #73's artwork grid, which added this to `step-generate.ts`:

```ts
const WIZARD_ART_SCENE_CATEGORIES = WIZARD_ART_CATEGORIES
  .map(([id]) => id)
  .filter(id => Object.prototype.hasOwnProperty.call(STAGE_ILLUSTRATION_CATEGORY_ICONS, id));
```

`STAGE_ILLUSTRATION_CATEGORY_ICONS` is declared by `renderer/features/game-illustration.js`, which `index.html` loads at line 94. `step-generate.js` is loaded at line 80 — **fourteen `<script>` tags earlier**. A top-level statement runs as its own script loads, so it read a `const` that still sat in its temporal dead zone in the shared global lexical environment. The result is not `undefined`, it is a hard `ReferenceError` that stops that script, and every later reference to it fails too.

**Decision.** Anything in the renderer that depends on a binding owned by a *later* script must be **computed on first use, never at top level**. `wizardArtSceneCategories()` builds the list lazily behind `wizardArtSceneCategoriesCache`, and guards with `typeof … === 'object'` so a missing registry degrades to "no scene-backed categories" instead of throwing again.

**Why the existing gates missed it.** `tsc` reports exit 0: the renderer is checked with `strict: false`, all files share one global scope, and TypeScript models no script order — the cross-file dead-zone read is perfectly type-correct. `npm test` was green because every renderer test reads the source **as text** and asserts on strings; none of them *executes* it. `npm run build` and `npm run build:css` are both happy. Only the browser's loader knew.

**The guard.** `tests/unit/renderer-load-order.test.ts` parses `index.html`, evaluates every renderer script in listed order inside **one shared `vm` context** with a minimal DOM stub (`bootstrap.js` excluded — it needs real nodes), and then calls the step-5 functions with real arguments, asserting real output. It also pins the very load order that caused the bug, with a comment saying to revisit the guard if that order ever changes. Proven to fail by re-injecting the old top-level `const` into `dist/`: `AssertionError: renderer/features/wizard/step-generate.js threw while loading: STAGE_ILLUSTRATION_CATEGORY_ICONS is not defined`.

**Lesson, and it is the fourth of its kind.** #72/#73 kept finding that string-scraping tests prove *shape*, never *execution*. This one proves the page boots. A renderer change is not verified until something has run it.




## #75 — Step 2 shows the same progress as step 5, and a finished run keeps its total time

**Problem.** Step 5 (content generation) had three honest progress signals since #71: a stage-based bar, a spinner, and a ticking elapsed clock. Step 2 (analysis) — which runs the same kind of long local model call — had none of them: a still `⏳` glyph, no bar, no percentage, and an elapsed line reading "Đã chờ 0:12 · thường mất 1–2 phút", where "thường mất 1–2 phút" was a **hard-coded guess** that contradicted the real number printed next to it. Worse, when either run finished, the clock vanished with the panel, so the teacher never learned how long the job actually took.

**Decision.** Step 2 reuses step 5's vocabulary instead of getting a parallel one.

1. **Same markup, same classes.** `renderWizardAnalysisProgress()` now emits the `wizard-gen-progress` / `-fill` / `-meta` panel, `role="progressbar"` with its own `aria-label` ("Tiến trình phân tích"), and the **same** `WIZARD_GENERATION_SPINNER` const declared once in `step-generate.ts`. The CSS comment was updated rather than duplicated: one look for one kind of job.
2. **The percentage is a stage counter, never a timer** — `analysisProgressFraction()` maps the main process's `prepare → generate → repair → ready` to 25/50/75/100 %, `ready` hard-coded to 100 % so a skipped repair stage cannot strand the bar at 75 %, and `cached` → 0 because a cache hit runs no stages at all (it now renders "dùng lại kết quả phân tích trước đó, không gọi AI" instead).
3. **No ETA for step 2, on purpose.** The #71 baseline is built from `ai_tasks` rows filtered to `kind === 'generate-lesson'`; analysis rows are a different kind with a different duration profile. Rather than widen the filter and mix two populations into one median, the line reads "Đang chạy…" — the same honest fallback #71 uses when no samples exist. The old constant is deleted.
4. **A finished run freezes its total.** `wizardStopActivityClock({ finished: true })` stores the real span in `analysisFinishedMs` / `generationFinishedMs`; step 2 prints `⏱ Tổng thời gian phân tích: m:ss` above the review form and step 5 prints its own total after the draft. Only a run that truly finished freezes: cancellation, failure, and a cache hit store nothing, so the UI can never show a duration for work that was thrown away. `formatStopwatch` returns `''` for a non-positive span, so the line is *omitted* rather than printed as `0:00` — the difference between "no data" and "instant".

**Chosen over the alternatives.** A separate `wizard-analysis-progress` CSS block was rejected: two identical stylesheets drift silently, and the `generation-eta` test already has to police one duplicated copy of the maths. A real ETA for step 2 was rejected as invented — there is no measured baseline for that kind, and #71's whole point was that the UI may not claim a number it did not measure. Persisting the frozen total in `ai_tasks` instead of renderer state was rejected as out of scope: it would need a schema/migration change for a display-only convenience.

**Duplication, and the guard for it.** `src/shared/generation-eta.ts` cannot be imported by the renderer (flat classic scripts, no bundler — the constraint recorded in #71), so `WIZARD_ANALYSIS_STAGES_ORDER`, `wizardAnalysisProgressFraction` and `wizardFormatStopwatch` are mirrored in `wizard/state.ts`. `tests/unit/generation-eta.test.ts` asserts the renderer's stage order equals `ANALYSIS_STAGE_ORDER`, scrapes the step-2 checklist for the same four ids, checks 25/50/75/100/0, and pins `formatStopwatch`'s shapes. `tests/unit/renderer-load-order.test.ts` executes the real `renderWizardAnalysisProgress()` inside the shared `vm` context — which is what catches the failure mode #74 recorded: step 2 now reaches a binding declared in another script, and a load-order mistake there would be a `ReferenceError` on the page, not a compile error.

**Traps found while working.**
1. **A guard that matched a comment.** The first drift check was `doesNotMatch(/thường mất 1–2 phút/)` over the renderer sources — and it *failed* not because the guess survived, but because a comment quoting the removed string did. The assertion now targets the code the renderer actually returns (`/Đã chờ/`), and the comment was reworded so the guard cannot be satisfied or broken by prose.
2. **Stale state between probes.** A `vm` probe asserting "no `finished`, no total" passed the *previous* probe's frozen value. Each probe now resets `analysisFinishedMs` first. The same class of bug — a cache-branch probe taken while `busy` was `''` — was also caught by the first run.
3. Both guards were **proven to fail** by injecting the fault into `dist/` (a non-existent spinner binding → `ReferenceError`, exit 1) and then restoring it.

**Verification.** `npx tsc --noEmit` exit 0; `npm run build` exit 0; `generation-eta: ok`; `renderer-load-order: 32 scripts loaded` exit 0; `npm test` exit 0 (whole suite). **Not verified:** nothing has been seen in a running Electron window — the bar, the spinner and both total lines are asserted at string/render level only. A live analysis (needs the local model) is still required, as is a `prefers-reduced-motion` check that has been owed since #71.

## #77 — The structure contract: what a section is, and what an id means

Source: `docs/archive/specs/update_AI_plan_7.txt` §3.2, §3.4, §4.2, §5.1, §5.2, §10.1. The analyzer is the only thing standing between a teacher's document and "the AI read text I excluded", so its output is a contract, not a best guess.

**What the tree may say.**

1. **Never invent a title (§3.2).** A node's title is the *source line* at its `charStart` (whitespace collapsed, trailing colon trimmed). The document title line is a real line, so it is a heading like any other. An attempt to add a synthetic "Mở đầu tài liệu" wrapper for the text before the first heading was written and then **removed**: it invented a name the document never had, and it made `headingsFound` disagree with the visible tree.
2. **Offsets, not copies.** `id = sec_<charStart>` into the normalized source, so no node carries a second copy of the text and ranges cannot drift from it. The exception is a heading at offset 0, which is `sec_0h`: `sec_0` is the document root, and the collision made `resolveSelection(['sec_0'])` resolve to the root and return **empty text** for a lesson whose first line is already its heading (found by `lesson-selection.test.ts`, 2026-10-24). `resolveSelection` also refuses the root id outright instead of dropping it silently.
3. **A parent covers its whole subtree.** Ranges nest on purpose: ticking "III. Tiến trình dạy học" must send "Hoạt động 1" and "Hoạt động 2". Only *sibling* sections must never overlap, and the last one must reach the end of the document, or its final paragraph is unselectable.
4. **Numbering alone is not a heading (§10.1).** A block that opens with a run of `1, 2, 3…` is a list, and no line inside it is a heading however title-like. A single-word numbered line ("4. Bỏ rác") is a list item unless it uses a Roman numeral.
5. **Uncertainty is shown, never hidden (§3.4).** An inferred heading is `confidence: 'low'` and counted in `lowConfidence`, so the wizard can badge it. A page header repeated on every page is dropped. A title that *immediately* repeats itself is a page break and is merged into one section, but a repeat separated by its own body is a second, real section — collapsing those removed every "Hoạt động 1" after the first in a real lesson (measured 2026-10-24).
6. **Never throws (§3.5).** Any failure returns one whole-document node plus a reason; under 80 characters the reason is `no_text`, so an image-only PDF is *reported*, not treated as an empty document.

**What the selection adds on top.** Un-ticked text is never sent (§4.2/§5.1). An ancestor that was not ticked contributes **its heading line plus one real sentence of its own body** (§5.2), capped — and never a line that is itself a heading or a table row, because such a line belongs to a sibling, which was exactly the leak the tests caught. A section that only partly fits the budget is reported in **both** `partialIds` and `omitted`: §5.4 forbids discarding content to meet a size target *silently*, so a shortened section must appear in the omission panel as well.

**Verification.** `tests/unit/lesson-structure.test.ts` and `tests/unit/lesson-selection.test.ts`, both registered in `npm test`; `npm test` exit 0 on 2026-10-24. **Not verified:** the analyzer has not been run against real `pdf-parse`/`mammoth` output inside the app — it is tested on synthetic fixtures shaped like that output, plus one real Vietnamese lesson plan during development.

## #76 — The character budget stays authoritative in both modes; a selection narrows, never widens

**Decision (owner, 2026-10-24).** A teacher's selection changes **which** text is sent, never **how much** may be sent: the analysis budget stays **12 000 characters (fast)** and **18 000 (deep)**, exactly as `lesson-preprocess` defines them. `SELECTION_BUDGET_CEILING_CHARS` is pinned to `LESSON_PREPROCESS_BUDGET_FAST` by a test, so raising it is a deliberate one-line change with a failing test, not a quiet constant.

**The limitation, in plain words (the owner asked for this to be written down).** Ticking more sections **cannot** make more content fit. If a teacher selects four sections that add up to 20 000 characters in fast mode, the fourth is **not** sent in full: it is cut at a line boundary, and every dropped or shortened section is listed in the omission panel and in `warnings`. The wizard must therefore show the budget next to the size estimate *before* the run, so the teacher narrows the selection on purpose instead of discovering a cut afterwards. Deep mode is the intended escape hatch (18 000), not a bigger selection.

**Backward compatibility.** With no selection, `selectionFingerprint` is `null`, so the analysis cache key is **byte-identical** to today's, and the whole-document path still routes through `preprocessLessonSource`. `smoke66`, the `bench` harness and `real-ai-e2e` keep their baselines as long as nobody ticks anything.

## #78 — A new step is not done until its classes are styled and asserted; a test must be shown to fail

**Context (2026-10-24).** `step-structure.ts` (449 lines) shipped emitting eleven `wizard-tree-*` classes. `src/renderer/styles/app.css` contained **zero** rules for any of them: no test and no smoke looks at whether a class is styled, and Tailwind v4 only generates utilities it finds in markup, so nothing complained. The step would have opened with a flat, unindented list, no expand/collapse affordance, character counts touching titles, and a preview with collapsed whitespace. In the same session, the handoff note asserted four "unverified" items that were already implemented — the import path, the cache fingerprint, the sliced call and this very step — because the note described the plan rather than the call chain.

**Decision.**

1. **Behaviour that a teacher sees needs a style rule *and* a check that the rule survived the build.** The tree's rules are now verified in the **minified** `dist` stylesheet, not only in the source, because `tailwindcss --minify` is a separate step (`build:css`) that `npm run check` never runs.
2. **`prefers-reduced-motion` is per step, not global.** Each animated surface declares its own reduced-motion rule next to its styles (`setup-progress`, `wizard-gen-progress`, now `wizard-tree`). A teacher who enabled it must still see the correct *state*, only without the motion.
3. **No meaning may be carried by colour alone**, and `indeterminate` cannot be styled by CSS. The tri-state therefore also marks the title with `.is-partial`, and the low-confidence badge carries a border as well as a background.
4. **A regression test must be demonstrated to fail.** The new zero-model-call/prompt-scope test was run against deliberately broken emitted JS (`preparedSelection` forced to `null`) and failed with the leaked table row, then passed again once restored. A test whose failure mode was never observed is treated as unverified, the same way an unrun test is.
5. **Trust the call chain, not the handoff prose.** Before marking a phase open or closed, follow the actual caller path (IPC handler → service → helper). `getLocalDocumentAnalysisExcerpt` is the standing example: it looks like a live bypass but has had no product caller since O6d, and its old test in `ai-manager.test.ts` keeps it alive.

## #79 — A section's range must contain its whole subtree, and an overlap test must only compare non-ancestors

**Context (2026-10-25).** `lesson-structure.ts` gave each section the end of *the next heading in document order*. For a sibling that is correct; for a **parent** it is wrong — "III. TIẾN TRÌNH DẠY HỌC" ended where "Hoạt động 1" began, measured `[261,285)` instead of `[261,455)`. Ticking the parent therefore sent its title and nothing else, and its activities were reachable only one at a time. The same defect existed on the extractor shape (no blank lines), `[183,210)` instead of `[183,374)`, which is what a real PDF/DOCX upload produces — so §5.1's "a parent selection includes its subsections" was not actually true for real input.

**Decision.**

1. **One pass computes both nesting and extent** (`headingRanges`). A new heading closes every open heading at the same or deeper level **and extends every still-open ancestor** at the same time; whatever is left open at the end extends to `sourceLength`. Consequences relied on by the tests: a parent starts strictly before its first child, every child lies strictly inside its parent's range, no two non-ancestor sections overlap, and the last section reaches the end of the source.
2. **Overlap is a property of sections, not of the flattened node list.** Because ranges nest on purpose, an "all nodes must not overlap" assertion is simply the wrong invariant and rejects correct output. The tests compare `root.children` in order, and separately assert containment for a parent and its children.
3. **Extending only the innermost open heading is not enough** — it was tried first because it looked minimal, and it left the parent ending exactly at its first child's start. Recorded because the failing assertions ("sections overlap", "a sibling section leaked in") pointed at the *selection* layer while the defect was in range computation; the message named the symptom's location, not the cause.
4. **Fixtures must look like real extractor output.** `lesson-selection.test.ts` now uses the exactly-one-`\n`-per-line shape of `pdf-parse`/`mammoth`, because the blank-line version was hiding the extractor regression behind a friendlier layout.

**Verification.** `npx tsc --noEmit` exit 0; `npm run build` exit 0; `lesson-structure` and `lesson-selection` both `ok`; `npm test` exit 0; `npm run verify:css` 12/12. Ranges measured by probe on both fixtures (values in `docs/STATUS.md`). **Not verified:** no test drives real `pdf-parse`/`mammoth` output through the analyzer, and nothing has been seen in an Electron window.


## #80 — CPU stays the only default backend, a runtime mismatch is never fatal, and Gemma 4 is manual-only

**Problem.** Three separate ways the local-AI path could disappoint a teacher: (1) the Settings page offered the Vulkan build as an equal-looking choice even though it measured **~2.3× slower than CPU** on the pilot hardware; (2) `startLocalRuntimeUnlocked()` **threw** when the backend on disk after an install disagreed with the one requested, so a single wrong detection left local AI unusable while a working `llama-server.exe` sat on disk; (3) the catalog's third tier was Qwen2.5 **7B** — 4.7 GB, slow on CPU, and only reachable by hand.

**Decision.**
1. **CPU is the presented default, the GPU build is "advanced".** `DEFAULT_RUNTIME_BACKEND` was already `'cpu'`, so this is a UI contract, not a behaviour change: the selector lives inside a collapsed `<details>` ("Tùy chọn nâng cao: dùng GPU tích hợp"), opens only if Vulkan is already saved, and its labels state the measured trade-off instead of promising speed. No string may claim Vulkan accelerates anything.
2. **A backend mismatch degrades, it does not throw.** `resolveBackendAttempts()` (pure, unit-tested) decides the attempt list: fatal **only** when there is no executable, because `install()` has already verified the archive's size and SHA-256 before extracting — so a wrong layout means "unrecognised build", not "corrupt download". Everything else continues on CPU and logs `runtime.backend-swap-failed`.
3. **Catalog is 2B / Gemma 4 E2B / 4B; auto-install is 2B / 4B.** Gemma 4 E2B (Apache-2.0, rev `0314792d7f1f`) is selectable but never auto-selected, and every fallback that used to be "the strongest model" — `recommendLocalModelId()`'s last resort and `SETUP_DEFAULT_MODEL_ID` — is now the **weakest** (2B). Rationale: an unknown machine must never be handed a 2.7–4.7 GB download by an accident of code, and an unmeasured model must never become someone's first run.
4. **A removed model is refused, not remapped.** `getLocalModel('qwen2.5-7b-q4_k_m')` throws. Silently installing a different model when a stale id is requested would change the teacher's content without telling them.

**Consequences (accepted).** A teacher who used 7B keeps the file on disk but must pick 2B/4B/Gemma once. `item-capacity` loses its 7-item tier (4B + Thinking still reaches the hard cap of 7). Gemma 4 enables thinking by default and `buildGenerationOptions()` sends a Qwen-style `chat_template_kwargs.enable_thinking=false`; whether that is enough for Gemma is **unmeasured** and only affects teachers who opt in.

**Verification.** `npm run check` exit 0; `npm test` exit 0 (`model-catalog`, `item-capacity`, `setup-ipc`, `setup-wizard-ui`, `runtime-backend-install` all updated and passing). Gemma 4 E2B was later downloaded and run with `b11681` on the pilot machine: it loads, but it is **slower than 2B** (8.4 vs 11.1 tok/s decoding, pp1024 not finishing in 200 s), spends **~80% of all 8 threads** while decoding, runs **worse on Vulkan** (5.0 tok/s), and returns `[Start thinking]` inside a short window — the thinking risk above is now measured, not hypothetical (`docs/BENCHMARKS.md`). **Not verified:** Gemma content quality, real-lesson prefill through `llama-server`, the new Settings layout in a real window, and the 2B Vulkan/CPU comparison.

## #81 — Presentation Mode is a separate renderer, so projector sizing must be fixed there too; and a build asset is only real if a test opens the built file

**Context.** The UI/UX pass (`docs/archive/specs/update_UI.txt` §7, §14) targets the classroom projector, and `app.css` already carries measured fullscreen rules (`html[data-fullscreen="1"] .modal[data-player-theme] …`, `clamp()` floors documented against a real 1280×721 window). An audit before changing anything found two things that made all of that unreachable.

**Finding 1 — the projector path was never the path being optimized.** Presentation Mode is not the game modal in a bigger window. It is `src/presentation/presentation.html`, a separate `BrowserWindow` (`frame:false`, `fullscreen:true`, `sandbox:true`) that loads **only** `renderer/features/presentation.js` and injects its own `<style>`. Its DOM root is `document.body > .presentation-root`, not `.modal[data-player-theme]`, so **not one** fullscreen rule in `app.css` applies — `presentation-root` had **0** matches in `app.css`. Its text floors were hardcoded and as low as **12px** (race cells) and **15–16px** (badges, chips, score rows): the smallest text on the classroom projector belonged to the surface written last.

**Finding 2 — Presentation Mode did not exist in a built app.** `npm run build` is `tsc` (emits only `.js`/`.js.map`) plus an explicit `copyfiles` list. `src/presentation/presentation.html` and `presentation-preload.js` were **not on that list**, and electron-builder ships `dist/**`, so every built/packaged app 404'd the page (`net::ERR_FILE_NOT_FOUND`). `docs/STATUS.md` recorded "package.json (copy presentation-preload.js vào dist)" as done; it was not, and `tsc` cannot notice a file it never reads.



**Chosen.**
1. Add both presentation assets to the `build` `copyfiles` list.
2. Raise every hardcoded floor in `presentation.ts` to ≥20px and fix the layout defects the measurements exposed: root pinned to the viewport with the body scrolling instead of the page; 2-column answers kept down to 1000px (1366px used to fall to 1 column, making a 4-answer quiz 871px tall in a 768px frame and cutting option D off-screen entirely); `line-height` raised for stacked Vietnamese diacritics; and `.explanation` — which had **no** `font-size` and inherited `app.css`'s 14px body, measuring 18.4px — given a floor plus an inheritable root size.
3. Assert it numerically **and visually**: `tests/ui/ui-presentation-check.js` drives the real `presentation.js` over the real DOM root at 1920×1080 and 1366×768 for all five views, asserting minimum computed font ≥20px, no clipped text, nothing outside the viewport, no page scroll, no inner scroller hiding content, and no question/answer overlap — writing a PNG per case as human evidence.
4. Guard the asset bug in `npm test` with `tests/unit/build-assets.test.ts`: every copied asset must exist in `dist/` byte-identical, and both HTML pages' own references must resolve from `dist/`.

**Rejected.** (a) "Fix it in `app.css`" — it cannot reach that page at all; (b) making `presentation.ts` import shared CSS — it is a classic script loaded by a bare `<script>` with no bundler (the #71 constraint), and the copy pattern already exists; (c) shrinking text so race fits at 1366×768 — the floor is the whole point, so the *track and scoreboard* were made denser instead (single-line score rows, fluid cells); (d) a golden-image diff baseline — the build machine's fonts differ from a projector's, so byte comparison would fail for reasons that are not defects. The PNGs are evidence for a human; the numbers are the gate.


**Trap — driving a second renderer from CDP is not like driving the first.** `window.eduGame` in the presentation page is a `contextBridge` object: `Object.isFrozen() === true` and its descriptor is non-writable **and** non-configurable, so it cannot be stubbed in place; `Target.createTarget` is unimplemented in Electron ("Not supported"); `window.open()` to a `file://` URL from a `file://` page is blocked; and `Page.addScriptToEvaluateOnNewDocument` registered on the `index.html` session does **not** fire for the new document, because `/json/list` yields a different target. What works is a same-origin **iframe** inside the presentation document: its `window` is writable, the real script is fetched and evaluated into it, and measurement/screenshots read `frame.contentDocument`. Only the IPC layer is faked; the DOM root, the script and its `<style>` are production's.

**Trap — a failing assertion that was measuring the wrong node.** `ui-race-treasure-check.js` started failing as the panel got tighter. Bisecting `presentation.ts` and every token first produced **contradictory** results, so the geometry was read directly instead: the check measured `#treasureActions`, an **empty placeholder that sits *before* `.stage-bottom`** in the markup (`gameplay.ts:1260` vs `:1262`) and is only filled after the answer is checked (`showTreasureChoices`). It was reporting the bottom of the *content*, not a control, and drifted out of the stage as soon as the stage ended earlier. After scrolling to the bottom, `.stage-bottom` was inside the stage (`visibleInStage: true`) while the placeholder sat at `top 729` past the stage's `bottom 707`. The assertion now targets `.stage-bottom`, the real last node; 19/19.

**Verification.** `npm run build` exit 0 with both presentation files in `dist/`; `build-assets.test.ts` exit 0 and **proven to fail** by removing `presentation.html` from `dist/` (exit 1, `build did not emit …`); `npm run check` exit 0; `npm test` exit 0; `npm run verify:css` 12/12; `check:renderer-globals` no undefined globals; `ui-presentation-check` **60/60** (was 40/50 before the fix); `ui-fullscreen-density-check` 9/9; `ui-fullscreen-check` 16/16; `ui-race-treasure-check` 19/19. **Not verified:** real projector brightness, contrast in a lit room, and physical viewing distance — device-metrics emulation reproduces 1920×1080 and 1366×768 exactly but says nothing about how a bulb renders them; also unverified is the real presentation window's z-order/alwaysOnTop behaviour, since the harness runs the page in an iframe of the main window.

## #82 — A draft guard must be two-sided, must stand down once saved, and has inverted polarity in main

**Finding — silent total loss, sitting in no spec phase.** `beforeunload` and `will-prevent-unload` had **0** occurrences repo-wide. A teacher could spend minutes generating a game, close the window, and lose all of it with no prompt: `wizardState.draft` lived only in memory and nothing persisted it. The v2 UI plan (`docs/UI-PLAN-V2.md`) promoted this to Phase A ahead of the spec's Phase 2–3–4–5 order precisely because data loss was not covered by any existing phase.

**Chosen.**
1. **Two-sided, because the renderer half alone cannot stop a close.** `bootstrap.ts` cancels `beforeunload`; Chromium relays that to main as `will-prevent-unload`, and only main can actually hold the window open. A `beforeunload` handler on its own is ignored by Electron's window close.
2. **`wizardHasUnsavedDraft()` owns the decision** (`state.ts`): draft present **and not** already in the library. Games already in the library must close silently — otherwise a teacher who followed the workflow cannot quit the app.
3. **Window close only, not in-wizard navigation.** Returning to step 2 re-analyses and discards content, but that path already asks through `wizardConfirmGenreChange`; adding a second gate there would double-prompt for one decision.
4. **Extracted `unloadMayProceed()` into `src/ai-core/unload-guard.ts`** so the truth table is unit-testable without Electron, following the `ai-core/*` convention rather than leaving logic inline in `main.ts`.

**Trap — the polarity is inverted between the two events, and getting it wrong is silent either way.**
- Renderer `beforeunload`: *calling* `preventDefault()` **keeps** the work (cancels the close).
- Main `will-prevent-unload`: *calling* `preventDefault()` **discards** the work (ignores the renderer's handler and lets the window unload); leaving the event alone keeps it open.

The first implementation in this session had it backwards and would have closed the window on "Ở lại" while appearing correct. `electron.d.ts` (Electron 33) is the authority and was read directly rather than recalled. `tests/unit/unload-guard.test.ts` now pins the table; it was **proven to fail** by flipping `unloadMayProceed` to `=== 'stay'` (exit 1, `actual: true, expected: false`).

**Trap — the dialogue must be reachable.** Ignoring `will-prevent-unload` unconditionally would trap the teacher in a window that can never be closed. Buttons are `['Ở lại', 'Đóng và bỏ nội dung']` with `defaultId: 0` **and** `cancelId: 0`, so Escape, the window X, and a dismissed dialogue all resolve to "stay".

**Rejected.** (a) A custom in-app modal instead of the OS dialogue — it would have to be re-rendered during a close it is trying to block; (b) persisting the draft to SQLite automatically so nothing is ever "unsaved" — a much larger behaviour change, and silently resurrecting half-generated content is its own surprise; (c) guarding on any typed text — wizard text is recoverable from the project row, while a generated draft is not, so that would nag about the wrong thing.

**Verification.** Check written **before** the fix and observed failing (`hasPredicate:false`, exit 1). Then `ui-draft-guard-check.js` **10/10** on a real app (predicate truth table, listener wiring, real generation → dirty, close blocked, save → close allowed), re-run **10/10** after the refactor. `npm run check` exit 0; `npm test` exit 0 including `renderer-load-order: 33 scripts` and the globals check (34 scripts, 4221 call sites). Real-window proof: with an unsaved draft set, `WM_CLOSE` was posted twice and the app was **still running** 4s later — the dialogue held the close. **Not verified:** actually clicking "Đóng và bỏ nội dung" and watching the app exit; `Alt+F4` while in F11 fullscreen.



## #83 — A projector check must pin the viewport and name the offender; a probe that counts unrendered elements manufactures its own failures

**Finding — the old checks could not have caught a projector bug.** `ui-play-surface-check.js` measured whatever window size the app happened to open at, took no screenshot, and asserted only gameplay semantics. A layout that fits a 1536-wide window and pushes the answers off a 1366×768 board scores identically. Phase B of `docs/UI-PLAN-V2.md` asked for fixed viewports plus PNGs; doing it produced **six real defects on the first run** (311px of `treasure-hunt` board past the bottom edge at 1366×768, with every answer option off-screen).

**Chosen.**
1. **One shared `measureAt(ctx, size, opts)`** in `tests/ui/lib/screenshot-capture.js` — pin viewport, wait for it to actually land, settle, measure, capture PNG, then apply the same five assertions. Each check supplies only what differs (`fontFloor`, `innerScrollAreas`, an optional overlap pair). Layout rules cannot drift between checks if there is one implementation.
2. **`setViewportAndWait()` polls `innerWidth`/`innerHeight`** until the emulated size is live before measuring. Without it a 1920×1080 run reported six elements outside a **1366×768** viewport: the size-change had been requested but not applied. A measurement taken during the transition describes neither size, and the resulting failure is indistinguishable from a real one.
3. **`inScroller()` is scoped to panel selectors (`.modal`, `.modal-body`, `.modal-card`, `.drawer`, `.panel`) and explicitly excludes `.game-stage` descendants.** A form that scrolls inside a modal is by design and must not be reported. A game board that scrolls is the defect — the whole surface exists to be projected. Excusing *any* scrollbar silently forgives the thing being tested.
4. **Font floors are measured from the shipped CSS, never invented.** `.tag` 9px, `.treasure-map-meta` 8px, the play status line 10px, stage chips 11px. Asserting an aspirational 14px across the board failed on correct design (14 of 94 illustration checks) and would have trained the team to ignore the report — the exact failure mode a guard must not have. Projector-critical text (answer content) is guarded separately at its real size (~16px) rather than being pulled up by a generic floor.
5. **A failure names the worst offender** — `{"tag":"div","cls":"game-stage","text":"HÀNH TRÌNH…","box":[212,136,1143,1079],"pastBy":311}`. A bare count ("24 elements outside") sends the next person hunting; the element, its text, its box and the overflow distance are the diagnosis.
6. **Real product defects stay red.** 2 play-surface and 4 illustration assertions fail and must keep failing until the layout is fixed. Adjusting a threshold to reach green would delete the only evidence these bugs exist.

**Trap — `offsetParent` is not "is visible".** Chromium keeps layout boxes for `display:none` subtrees, so the original probe measured app-shell ghosts that no teacher can see and produced a font-floor failure naming an 8px sidebar label in a hidden shell. A probe counting unrendered elements manufactures its own failures. `checkVisibility()` is the correct predicate; the probe now uses it.

**Trap — backticks inside a template literal.** The measurement script is injected as a template literal, so a backtick in a comment terminates it. `node --check` passes and the failure only appears at runtime against a live app. The checks now assert the body contains zero backticks (`(body.match(/\`/g) || []).length === 0`).

**Rejected.** (a) A per-check layout implementation — duplicates the five rules three times and guarantees drift; (b) asserting a universal 14px floor — see 4, it fails correct design; (c) letting the layout checks gzip on ambient window size with a screenshot for humans only — a screenshot nobody diffs catches nothing, and the numbers are what make the regression assertable; (d) visual diffing against golden images — a much larger commitment (baseline churn on every intended style change) for a first pass that numeric assertions already served.

**Verification.** `npm test` exit 0. Live app on an isolated profile: `ui-play-surface-check` **78/80**, `ui-stage-illustration-check` **90/94**, `ui-item-assets-editor-check` **27/27**, every failure traced to a concrete product layout defect (treasure-hunt 311px @1366 and 93px @1920, race 116px, scenario 25px, quiz answers C/D 52px past a 768px viewport). 16 PNGs produced in `tests/ui/shots/`. The illustration floor was first set to an invented 14px, observed failing 14 assertions on correct design, then re-derived from `src/renderer/styles/app.css` before the final run — that correction is itself recorded here so the next person does not repeat it. **Not verified:** the "Trình chiếu" button wrapping to two lines at 1366×768 is visible in the screenshot but is caught by no assertion; aesthetic quality still needs a human looking at the PNGs.


## #85 — The answer grid absorbs the stage's spare height, and gives it back when feedback arrives; treasure's map stops being 66px of empty padding

**Finding — three separate dead bands, all measured, none of them the guess on record.** #84 closed the horizontal waste; the *vertical* budget was still misallocated, and #84's note said the remaining treasure cost was "the map plus the storyline". Measured on the live app (4-option quiz fixture at both projector sizes, idle **and** answered):

| | 1366×768 | 1920×1080 |
|---|---|---|
| `.stage-center` height available | 594px | 887px |
| content actually used | ends at 611 of 737 → **149px dead** | ends at 663 → **224px dead** |
| question → answers gap | **0px** (both blocks started at y=337) | **0px** |
| answer option height | 123px | **150px, pinned by the `16vh` cap** |
| treasure `.treasure-map` box | 190px for **124px of content** | same |

The map figure is the important one: `min-height: 190px` was bought for a long journey (many nodes), but with one stage the box held a 38px head and an 86px track and **66px of empty padding**. That empty band, not the storyline, was the single largest block of waste on the 768px board.

**Chosen.**
1. **The answer grid is the height sink.** `.stage-col.is-main > .answer-grid { flex: 1 1 auto; grid-auto-rows: minmax(min-content, 1fr) }` hands the leftover to the grid and splits it across rows. The `min-content` floor keeps the rule from #59 ("the last line of an answer is never clipped") intact. Measured: 1920 option rows 150 → **301px**, ending exactly at the stage bottom.
2. **The column must claim the height first.** `.stage-center` sets `align-items: flex-start` for the two-column row — correct for the artwork, wrong for the text column, which then sized to content (585px of 887px). **`align-self: stretch` alone did not fix it**: `.stage-center` wraps, so both columns sit on one flex line whose cross-size is content-sized, and stretch only reaches that line. The column needed `height: 100%`. Confirmed by measurement, not by reading the spec.
3. **…but only on screens that have spare height.** `height: 100%` on treasure *regressed* it 60 → **140px**, because the column was then locked to `.stage-center` and could no longer grow the stage. Guarded with `:not(:has(> .treasure-storyline)):not(:has(> #treasureMission))`.
4. **Feedback takes the height back.** `.stage-col.is-main:has(> #answerFeedback:not(:empty)) > .answer-grid { flex: 0 1 auto; grid-auto-rows: min-content }` plus `min-height: 0` on its options. Measured in the answered state: options 123 → **78px**, `scrollHeight 74 = clientHeight 74` (nothing clipped), stage overflow **21 → 0**. Before answering, the `12vh` floor stands — that is when the options are the only thing on screen.
5. **The map is as tall as its content.** `min-height: auto; height: auto; flex-shrink: 0`. The `flex-shrink` is required: as a flex item of `.game-stage` the map was being compressed to 120px for 143px of content and `overflow: hidden` silently **clipped the node's `Trắc nghiệm` label**.
6. **`preserveAspectRatio: slice` → `meet`** on all six treasure backdrops (`treasure-art.ts`). With `viewBox="0 0 1200 420"` and `slice`, a 1800×149 box draws the art 1800×**630**, centred, so its background `<rect>` sat at **y = −74** — the exact element `ui-stage-illustration-check` reported as "outside the viewport". `.treasure-backdrop svg { object-fit: cover }` was dead code: `object-fit` does not apply to inline SVG.
7. **The treasure column is not given a blanket `row-gap`.** Tried it; treasure has **10** children that each carry their own margins, so 10 extra gaps added ~125px (60 → **168px**). The gap is now one `margin-top` on the answer grid.

**Rejected.** (a) shrinking the SVG to buy height (#84 d, restated: the artwork becomes unreadable while the answers still do not fit); (b) removing the question→answer gap to save 16px — the gap measured **0px**, there was nothing to remove, and the fix is to *add* one; (c) hiding the map on short boards — it is the template's defining element and #84 e rejected the same shortcut; (d) `overflow: visible` on the map to stop clipping — the node label then drew **outside the map's border**, over the question column; (e) a blanket `row-gap` (see 7); (f) adding a check for the two-line "Trình chiếu" wrap — `ui-play-surface-check` already asserts `labelLines === 1` and passes at both sizes, so the two-line label seen in a treasure screenshot is that template's own header, not the shared tool button.

**Trap — a selector that "looks right" and matches nothing.** Treasure renders its options through `#treasureMission`, so its grid is a **grandchild**: `.is-main > #treasureMission > .answer-grid`. The first version used `.is-main:has(> #treasureMission) > .answer-grid`, which matched nothing and moved overflow by 1px (88 → 87) — easily mistaken for "the fix does not work". Verify a new rule against `el.matches()` in the live DOM, not by reading it.

**Trap — PowerShell rewrote the file's line endings.** A bulk `-replace` on `treasure-art.ts` silently converted CRLF → LF (git flagged it). Restored byte-for-byte; the final diff is 6 lines with no BOM.

**Verification.** `npm run check` exit 0. `npm test` exit 0, `check-renderer-undefined-globals: 34 scripts, 502 declared functions, 4221 call sites — no undefined globals`. Live app on one port, sequential: `ui-play-surface-check` **82/82** (answered state at both sizes reports `outside 0`, `scrolls false`, `clipped 0`), `ui-stage-illustration-check` **94/94** (baseline was 90/94, mid-fix 92/94 — both treasure failures are now gone), `ui-item-assets-editor-check` **21/27**, identical to the unmodified baseline recorded in #84. Measured overflow after the change: quiz **0/0**, treasure **0/0** (311px and 93px when Phase B first ran). **CORRECTION (same day): the treasure `0/0` was wrong and is retracted — see #86.** It came from a throwaway probe with a minimal fixture (one short story, no `taskDescription`, no hint); a realistic fixture overflows, and treasure's stage is now documented as a scroll container rather than as fitting with no overflow. Screenshots are the ones the checks produce themselves; `play-surface-answered-1366x768.png` shows a 3-line question, multi-line answers, the feedback panel and the next button all inside 768px. **Not verified:** real projector hardware; the treasure map with a **long** journey (10+ nodes) at 1366×768 — the fixtures use one stage, so `flex-shrink: 0` on a tall map is reasoned, not measured; and `race`, which shares the two-column block but was not re-measured after this change.

## #84 — The illustration moves beside the question on wide projector screens; one column stays the default below 1180px

**Finding — the scarce axis was spent on the abundant one.** At 1366×768 the `.game-stage` needed 750px inside 683px, so every answer option sat below the fold (#83 recorded the 311px overflow). The cause was not "too much content": `.stage-question` was a single 1255px-wide column that only needed four lines, leaving ~1000px of horizontal room unused, while the 320×200 SVG spent **200px of the 683px vertical budget**. Vertical space is what the classroom projector lacks; horizontal space is what it has.

**Chosen.** Two columns above 1180px, one column below it — the old layout is the default, not the fallback.
1. **Measured before building.** The layout was simulated in the live DOM (`flex-direction: row`, illustration to the left) and the overflow re-measured rather than estimated: 1366×768 **67 → 0**, 1440×900 **15 → 0**, 1920×1080 0 → 0. The text column stayed 987–1517px wide, so nothing was cramped to buy the space.
2. **`display: contents` is the one-column default.** `.stage-center > .stage-col { display: contents }` makes the wrapper vanish from the box tree, so every child is still a direct flex item of `.stage-center` and the original layout is preserved **to the pixel** wherever the media query does not apply.
3. **The DOM is wrapped, because CSS alone cannot do it.** `.stage-center` holds 5–11 separate children, and a flex row turns *each* child into its own column. Tried first: `flex: 1 1 0` on every text child, which produced a 174px-wide question 1294px tall — **684px of overflow, ten times worse than the bug being fixed**. It was reverted, and `gameplay.ts` (5 call sites) plus the race turn now wrap artwork and text in `.stage-col` / `.stage-col.is-main`.
4. **Explicit `px` width for the illustration, never a percentage.** The shipped rule is `width: min(320px, 46%)`, and 46% is of the *container*. Inside a narrow column that collapses the box and letterboxes the 320×200 scene — the same failure #70 recorded at ~150×94. The 2-column rule sets `clamp(200px, 16vw, 300px)`, and the treasure variant a smaller `clamp(170px, 13vw, 240px)`, because treasure also spends vertical space on its map and storyline.
5. **Flex with wrapping, never grid.** #59 records an `auto` row collapsing to 0 when the stage overflows (`#treasureActions` measured at 0px). Flex keeps every child in flow at its natural height.
6. **`html[data-fullscreen="1"] #modalRoot { position: fixed }`.** Separate, pre-existing bug found while validating: `.app-shell` keeps laying out at 1436px while `visibility: hidden`, which pushed the in-flow `#modalRoot` to `top: 1436` — entirely below a 768px viewport. `overflow: hidden` on `html`/`body` clips the scrollbar but does not stop the offset. `#modalRoot` only ever contains `.modal-backdrop`, already `position: fixed`, so taking it out of flow fixes the cause instead of the symptom.



**Trap — the assertion measures what the design intends, and the design changed.** "Content uses most of the width (>=80% of viewport)" measured `.stage-question` alone. Under two columns that reads 1023px of 1366px (75%) and fails — not because space is wasted, but because 219px went to the artwork on purpose. The assertion now measures the whole content block (artwork + text) and a **new** assertion guards that the text column itself stays above 50% of the viewport, so the original intent survives instead of being deleted.

**Trap — a check that opens the game without fullscreen cannot make viewport assertions.** `ui-stage-illustration-check.js` opened every fixture with `playGame(game)`, so `.app-shell` stayed in flow at 1436px and every "nothing outside the viewport" assertion failed permanently. The check now passes `{ fullscreen: true }` (the illustration is judged on the projector surface, which is where it is seen): a layout assertion is only meaningful on the surface it claims to describe.

**Rejected.** (a) CSS-only with `flex: 1 1 0` — measured 684px of overflow, strictly worse (see 3); (b) `grid-template-columns` for the row — repeats the #59 collapse; (c) shrinking the SVG's height/`max-height` — the artwork becomes unreadable on a projector while the answers still do not fit, and #70/#81 already treat a squashed scene as a defect; (d) collapsing the treasure map to make room — the map is the template's defining element; (e) two columns at every width — on narrow screens the text column drops under ~560px and the question wraps to a word per line, so the 1180px media query keeps the old layout where it was correct.

**Verification.** `npm run check` exit 0. `npm test` exit 0, including `check-renderer-undefined-globals: 34 scripts, 502 declared functions, 4221 call sites — no undefined globals` (necessary: the DOM changed in `gameplay.ts`). Live app, one port, sequential: `ui-play-surface-check` **82/82** (was 78/80; `outside 0` in all four measurements at both sizes), `ui-stage-illustration-check` **92/94** (was 90/94), `ui-item-assets-editor-check` **21/27**. Screenshot `tests/ui/shots/stage-2col-quiz-1366x768.png` shows the artwork left and the question with all four answers right, nothing below the fold. One-column fallback confirmed by measurement: 1179×768 and 1024×700 both still report `flex-direction: column`. **Not verified:** `treasure-hunt` still overflowed by **124px** at 1366×768 and 55px at 1920×1080 at the time of this change — improved from 311px but not fixed, because `.treasure-map` kept `min-height: 190px` plus the storyline above the question; left red on purpose, and **closed by #85**, which measured the map's real content (124px inside a 190px box) and brought both sizes to **0px**. `ui-item-assets-editor-check` reported **21/27**, which an A/B stash run showed is **identical on unmodified code**, so it is not a regression — the **27/27** recorded in #83 does not reproduce and is treated as a mis-recorded figure, not a target.
---

## #86 — Treasure is a *scrollable* stage by contract; the guard must measure each column against its own container, not against the viewport

**Context.** #85 closed `treasure-hunt` at "0px overflow" and #85/#84 both recorded `race` as "not re-measured". Both statements were re-tested and one of them was false.

**Finding 1 — the "treasure 0/0" was a fixture artifact, now retracted.** It came from a throwaway probe (`tmp-tr-budget.js`) using a minimal game: one short story, no `taskDescription`, no hint button. This check's own realistic fixture — story 273 chars where the schema allows 1600, plus `taskDescription`, four long answers and a hint — needs **~656px** of column inside a **662px** stage that also carries the **133px** map. `ui-race-treasure-check`'s own treasure fixture (546-char story) overflows **150px** at 1366×768. Overflow at 1366×768 is **~237–355px** and at 1920×1080 **~56px**. No CSS removes that without deleting content the teacher wrote.

**Finding 2 — one genuine defect underneath, fixed.** With the story tall enough, `.stage-center` was compressed to **415px** while its child column needed **656px** (measured: `center h=415 / col h=656 / col exceeds center by 241px`). The column's overflow spilled **241px** past the center's bottom edge; because the spilled area sits outside the scroll container's own box, it can **never** be scrolled to, and the map's node label was clipped. Fix: `html[data-fullscreen="1"] .modal[data-player-theme] .stage-center:has(> .stage-col.is-main > #treasureMission) { flex-shrink: 0 }`. This removes only the ability to *compress* (the same lesson as #85 note 3) and does not lock a height.

**Chosen — the contract is "reachable", not "zero overflow".** A treasure stage at 1366×768 legitimately scrolls: (1) the stage is the scroll container; (2) the page itself never double-scrolls (`docHeight == viewport`); (3) every answer, the bottom control and the whole journey are reachable; (4) the map is never squashed (`flex-shrink: 0`); (5) **no column spills past its own scroll container**. The check that enforces this lives in `ui-play-surface-check.js` and runs per fixture (6-stage and 12-stage) at both projector sizes.

**Chosen — `race` is NOT scrollable.** A 40-cell track + 4 long answers fits exactly: measured **overflow 0px**, `docH 768/768` and `1080/1080`, 40 cells and 4 answers rendered. It is now asserted by the same check (`innerScrollAreas: 0`, same as quiz), which closes the "race not verified" note in #84 and #85.

**Rejected.** (a) "Zero overflow" as the treasure contract — it is unreachable without cutting content, and asserting it would have to be watered down to pass, which is worse than not asserting it; (b) `assertLayout`'s `outsideCount` as the guard — **measured to be wrong here**: 10 elements are legitimately outside the scroll box at `scrollTop: 0` when the layout is perfect, so the assertion fires on correct layouts and is unusable for a scroll container; (c) comparing children against `.game-stage`'s `scrollHeight` — also wrong, because the *inflated column* is what grows `scrollHeight`, so the spill disappears from the comparison (this variant reported **0 stranded in the broken state**); (d) adding a `row-gap` or shrinking the map to buy height — rejected in #85 already.

**Trap — a regression guard must be proven by re-introducing the bug.** Two earlier versions of this assertion passed **126/126 on broken code**. They were only caught by A/B: set `flex-shrink: 0 → 1`, rebuild, relaunch, run. The shipped version reports **126/130** when broken (`stage-col is-main` spilling **359px** past a **415px** box at 1366×768, **63px** past **692px** at 1920×1080) and **130/130** when fixed. Any future check for this area owes the same two-sided proof.

**Trap — editing a backtick inside a template literal.** The injected in-page script is a template literal; a comment containing `` `overflow: visible` `` closed it early and produced `SyntaxError: missing ) after argument list` at the *outer* file, not at the string. Use `node --check` before running any check whose `evaluate` payload was edited.

**Trap — rebuilding CSS under a live app wedges it.** `npm run build:css` while the app is open left the CDP connection answering `/json/version` but never replying to commands; the symptom is a check that hangs *after* its first measurement with no timeout. It is not the product: an unmodified check (`ui-stage-illustration-check`) hangs on the same instance and passes on a fresh launch. Always stop the app, rebuild, relaunch.

**Verification.** `npm run check` exit 0. `npm test` exit 0 (`check-renderer-undefined-globals: 34 scripts, 502 declared functions, 4221 call sites — no undefined globals`). One live app, sequential: `ui-play-surface-check` **156/156** (was 126/126 before race was added), `ui-race-treasure-check` **19/19**, `ui-stage-illustration-check` **94/94**, `ui-fullscreen-density-check` **7/9** (the 2 failures are the pre-existing 1280px width assertions, unchanged), `ui-item-assets-editor-check` **21/27** (unmodified baseline). Negative control: `flex-shrink: 1` → `ui-play-surface-check` **126/130**, exit 1. Screenshots `play-surface-race-1920x1080.png` and `play-surface-race-1366x768.png` show the 40-cell track and all four answers with nothing below the fold. **Not verified:** real projector hardware (all measurement is via `Emulation.setDeviceMetricsOverride`); and the *feel* of scrolling a treasure stage during a lesson — the check proves reachability, not that a teacher finds it acceptable.
---

## #87 — daisyUI 5 is adopted as a **prefixed, theme-mapped, component-only** plugin; it supplies decoration, never layout

**Context.** The five play surfaces (quiz, scenario, matching, treasure-hunt, race) were styled by ~560 lines of hand-written rules that had accumulated override on override. The teacher-visible symptom was "cramped on the projector, answer text too small" — and the question was whether a component library would fix it.

**Finding — a library would NOT have fixed it, and that mattered for the choice.** The cramped layout was a **specificity war inside `app.css`**, not missing components: `html[data-fullscreen="1"] .modal[data-player-theme] .answer-option` was declared **6 times** and `.stage-center` **8 times**, each later block existing only to beat an earlier one; the losing `@media (max-height:800px)` rule set the answer font to `clamp(15px, 1.25vw, 18px)`. Adding `d-card` classes to that markup would have changed nothing at all. The CSS consolidation was therefore done **first** and separately (#88) so that "the library did not help" could never be confused with "the library was not really installed".

**Chosen — four independent safety locks, each blocking one kind of damage.**
1. **`prefix: "d-"`.** `app.css` already uses `.btn` in 61 places. Without a prefix, daisyUI's `.btn` would silently restyle every button in the application.
2. **`themes: false` + a custom `edugame` theme.** All 35 built-in themes are disabled and one theme maps daisyUI's colour variables onto the app's own 10 design tokens (`--color-brand` → `--color-primary`, `--color-panel` → `--color-base-100`, …), so components arrive already on-brand. `--depth: 0` and `--noise: 0` keep them flat, matching the existing visual language. A built-in theme was rejected because it drags in its own `--color-base-100` (a grey that fights `--color-canvas #f4f6fb`) and a heavy shadow model that conflicts with `--shadow-card`.
3. **`include:` an explicit component list.** Only the 12 components actually under consideration are compiled.
4. **`exclude: rootcolor, rootscrollgutter, rootscrolllock, scrollbar, svg`.** These are daisyUI's *global* base styles. `rootcolor` would set `background`/`color` on `:root`; `rootscrollgutter` would add `scrollbar-gutter` to `:root` and shift every width the layout checks measure.

**Trap — `root:` does not scope the theme block.** `root: "#modalRoot"` was tried and **removed**: it changes the selector of `@plugin "daisyui"`, but `@plugin "daisyui/theme"` always emits `:where(:root), :root:has(input.theme-controller…), [data-theme=edugame]` regardless. Grepping the build output confirmed the selector, with no `#modalRoot`. This is harmless rather than a problem — `:where()` carries zero specificity and the block only *adds* `--color-base-*`/`--color-primary` variables under names the app does not use (`--bg`, `--panel`, `--purple`…), while `rootcolor` is excluded so no `background`/`color` lands on `:root`. It is recorded here so the next person does not spend time re-trying `root:`.

**Trap — daisyUI classes are generated on demand, so "installed" ≠ "available".** With the plugin configured but no `d-` class in any scanned file, the build emitted **zero** `d-` rules (`d-card` computed `border-radius: 0`, `d-badge` `display: inline`), while the theme variables *were* present and resolving. Components must therefore be registered with `@source inline(...)` (see #88), which also turns the `include:` list into a contract that can be checked.

**Verification.** `npm run build:css` exit 0 after each step. **A/B proof of no visual change:** build CSS with the plugin and without it, diff the two outputs — the first **103,272 characters are byte-identical**, and the only difference at all was a single unused `@keyframes progress` (53 chars). One live app, sequential: `ui-play-surface-check` **156/156**, `ui-stage-illustration-check` **94/94**, `ui-race-treasure-check` **19/19**, `ui-fullscreen-density-check` **7/9** at that point (its 2 failures pre-existing, closed in #88). Library research rejected shadcn/Headless UI (require React; this renderer is vanilla TS + `innerHTML`), Flowbite (needs its own JS plugin) and Bootstrap (conflicts with Tailwind). **Not verified:** no DaisyUI component is yet used on a real screen — this decision installs and proves the plumbing only; adoption is E6, and until it happens the CSS cost (~6.5 kB) buys nothing.

**Rollback.** Delete the two `@plugin` blocks and the `@source inline(...)` lines; nothing else references the library, and no markup was changed.

---

## #88 — The play-surface CSS is consolidated to one definition per selector, and the density check measures the two-column row

**Context.** #87 established that the projector layout was cramped by an override war rather than by missing components. This entry is the actual fix, plus the traps it surfaced.

**Finding — the duplicate counts, measured.** In `app.css` before this change: `.answer-option` under fullscreen was defined **6 times** (lines 939/974/1101/1368/1397/1610), `.answer-grid` **2 times**, `.stage-center` **8 times**. Several blocks carried comments explaining *why they existed* — e.g. "khai lại NGAY SAU quy tắc thường… vì ở đây bản khai báo sau sẽ thắng" — the signature of an override war. The 1280px numbers the teacher reported (question 31.7px, grid 1040px = 81%, answers 16px tall) trace directly to these chains.

**Chosen — one definition per selector, and nothing left to override.** The six `answer-option` blocks and both `answer-grid` blocks became one block plus one `@media`; each deleted block is replaced by a comment naming the line numbers it used to occupy, so "why is there only one now" is answered in place. Treasure keeps its `flex-shrink: 0` as a `:has()` rule. The single surviving exception is `max-width: 100%` for the fullscreen answer grid, which *must* sit after the base grid rule to beat its `1040px` cap — documented inline as an exception with a reason, not as another layer of history.

**Trap — collapsing overrides must keep the value of the copy that WINS, not the first one found.** Two separate regressions came from this, both caught by existing checks:
  - Taking `2.5vh` from an earlier `@media` block made the answer font smaller than the winning `2.9vh + 0.6vw`; treasure then overflowed **88px @1920×1080** and **362–373px @1366×768**, `ui-play-surface-check` **152/156**.
  - Taking `padding: … calc(clamp(12px, 2.2vh, 26px) + 4px)` from block 939 instead of the winning `clamp(12px, 1.8vh, 22px)` from block 1368 made every answer option **10px taller**; `.stage-bottom` was pushed **14px** below the viewport, `ui-stage-illustration-check` **93/94**.
  The rule is mechanical: for each property, work out which matching declaration is last in source order and carry *that* value across.

**Trap — Tailwind v4 deletes a rule whose attribute-value selector references a value it cannot see in the markup.** Replacing `:has(> .stage-col.is-main > #treasureMission)` with `.game-stage[data-game="treasure"]` looked strictly better (an explicit contract instead of a descendant probe), but the value is built dynamically (`data-game="${stageGame}"` in `gameplay.ts`), never appears verbatim in a scanned file, and Tailwind **dropped the whole rule**. Measured: the source had 2 `data-game` rules, the build emitted 1 — the survivor being `:not([data-game=treasure])`, which survived only because a `:not()` of an unseen value still matches everything. Treasure lost `flex-shrink: 0` (same 88px / 362px overflow). Both selectors were reverted to `:has()`. The `data-game` attributes themselves were kept — a useful explicit marker — they are just not safe to *select* on without adding the value to `@source inline(...)`.

**Chosen — `@source inline(...)` for the adopted daisyUI components.** `d-card`, `d-badge`, `d-progress`, `d-steps`, `d-step`, `d-stat`, `d-avatar`, `d-timeline*`, `d-alert*`, `d-divider`, `d-join*`, `d-indicator*` are listed with brace expansion. Before this the build emitted **no** `d-` rules at all (proved in the live app: `d-card` radius `0px`, `d-badge` transparent). After it, `d-card` computes `display: flex` / `border-radius: 16px` (the `--radius-box` from the `edugame` theme) and `d-badge` `display: flex` / `padding: 0 11px`. CSS cost: ~119.5 kB → ~126.1 kB minified (~6.5 kB).

**Trap — `ui-fullscreen-density-check` had been measuring the wrong thing since #84, and its two red assertions were being recorded as "pre-existing failures".** The check asserts "content ≥ 86% of the window width" but measured `.stage-question` alone. Since #84 the play surface is **two columns** above 1180px, with the artwork column holding a deliberate `clamp(200px, 16vw, 300px)`; the text column is therefore **956 of 1280px = 74.7%** and can never reach 86%, however correct the CSS is. Measured proof that nothing is wasted: the whole row is **1189 of 1280px = 92.9%**, and the illustration accounts for exactly the 205px difference. #84 had already hit this exact trap and fixed `ui-play-surface-check` — it simply missed this check, so the two failures sat there looking like a product bug. Fixed by measuring the content **row** and adding a **new** assertion that the text column keeps ≥50% of the window, so #84's original intent survives instead of being deleted.

**Verification.** `npm run check` exit 0. `npm test` exit 0 (`check-renderer-undefined-globals: 34 scripts, 502 declared functions, 4221 call sites — no undefined globals`). One live app, sequential: `ui-play-surface-check` **156/156**, `ui-stage-illustration-check` **94/94**, `ui-race-treasure-check` **19/19**, `ui-fullscreen-density-check` **9/9** (was 7/9). Each regression above was found by those checks and fixed, not waved through.

**Negative control for the new width assertion.** Cap `.stage-center` and `.answer-grid` at `1040px` in the live DOM and re-run the same measurement expression: the row drops **1189 → 1040px** against a 1101px threshold, so the assertion goes red on exactly the bug it claims to catch; the text-column guard stays green (807px > 640px), confirming the two assertions measure different things rather than duplicating one another.

**Not verified / known-bad, recorded honestly.**
- Real projector hardware — all measurement is via `Emulation.setDeviceMetricsOverride`.
- No screenshot was reviewed for the daisyUI components: they are registered and compute correct styles, but no screen uses them yet, so "does it look right" is unanswered.
- `ui-race-treasure-check` reports **16/19** when the OS window is **1920×1080** instead of a 1366×768 projector: the 40-cell track fits in 121px and never engages its height cap, and the treasure fixture has nothing left to scroll. This is **identical on unmodified HEAD** — proved by stashing the CSS, rebuilding, relaunching and re-running — so it is a fixture that inherits the OS window instead of setting its own viewport, not a regression from this work. The proper fix is for that check to call `Emulation.setDeviceMetricsOverride`, as the other three do. **Confirmed still true in #89:** with the CSS changed substantially, that suite is **19/19** at the default 1366×768 window and still **16/19** at 1920×1080, reproducing the same two failures — so the diagnosis holds and it is not a regression from #87–#89 either.


## #89 — The game's picture is bigger, and data with no artwork gets a default scene

**Date.** 2026-10-26

**Context.** A teacher asked for two things after #87/#88: *"cho ảnh ở trò chơi to thêm"* and *"khi không có ảnh trong data thì tự động hiển thị ảnh mặc định"*. Measuring the built app first (1366×768 and 1920×1080 over CDP) showed both were real, plus a third defect nobody had named:

| surface | before 1366×768 | before 1920×1080 |
|---|---|---|
| quiz / scenario / matching | 219×137 | 300×188 |
| treasure-hunt | 178×111 | 240×150 |
| race | 219×137 | 300×188 |
| item with no category and no icon | **empty column** | **empty column** |

219×137 is the size of a card, not of a picture on a projector, and the text column beside it had hundreds of spare pixels. Separately: `resolveIllustration()` returned `null` when an item carried no `illustrationAssetId`, no `contentCategory` and no `iconName`, so `gameplay.ts` rendered an **empty `.stage-col`**. That is what a hand-typed game and a neutral CSV import produce, and the empty column was still 300px wide — a hole in the middle of a projected screen.

**Decision.**

1. **One ceiling, raised everywhere, never a height on its own.** The base rule went from `min(320px, 46%)` to `min(420px, 46%)` and `max-height` was removed; height follows `aspect-ratio: 16/10` as #70 requires. 420px is the stop line: the scene is authored at 16px-icon scale, so ~2.1× is where the subject stroke starts thickening faster than the layer detail and the art reads as a scaled-up icon.
2. **The two-column column width moved with it** — `clamp(200px, 16vw, 300px)` → `clamp(300px, 28vw, 440px)`. Treasure and race keep their relative priority (they still owe vertical space to a map / a track) but move on the same scale: `clamp(240px, 22vw, 360px)` and `min(280px, 24%)`.
3. **The short-window media query is also the one-column rule**, which is why it mattered most. The two-column layout only starts at `min-width: 1180px` of `.stage-center`, so a 1366×768 projector fell through to `min(320px, 34%)` and drew the scene at **199×124 — smaller than before the two-column work**. It now uses `min(420px, 46%, 46.4vh)`: width-capped *and* height-capped inside the `min()` list (222px tall at 768), which is what the old `max-height: 200px` protected, without reintroducing the #70 aspect-ratio trap.
4. **A fixed default, not a generated image.** `DEFAULT_ILLUSTRATION_CATEGORY = 'language'`, `DEFAULT_ILLUSTRATION_ICON = 'book-open'`, `DEFAULT_ILLUSTRATION_ASSET_ID = 'language-scene'`. `resolveIllustration()` returns it for `auto` when nothing else resolves, and `ResolvedIllustration.isDefault` lets callers tell it apart. Rendering needs **no special case**: it is an ordinary registered scene with a real palette. `general` deliberately is *not* the vehicle — it has no palette, so drawing it would mean inventing one.
5. **The teacher's switch still wins.** `off` returns `null` before anything is inspected, and `manual` still never invents artwork — the default is not "artwork the teacher did not pick", it is the picture the product shows in the mode that promises one. Both are asserted for all five templates.

**What this deliberately does NOT do.** It adds no teacher-uploaded image, no cover-image field and no raster asset. `.egame` files still carry no image payload, games still play offline, and nothing is model-generated — the default is one of the 24 existing scenes. Uploads stay deferred under #31's reasoning.

**Traps hit and recorded.**

- **A declared "fallback icon" is not the icon that gets drawn.** `resolvedFor()` in the renderer prefers *the category's own* icon whenever a category is known, so simply passing the default category through it produced `graduation-cap` (the icon of `language`) instead of the declared `book-open`. The default was invisible in the resolved data until `resolvedFor()` took an explicit `iconName` argument. **Rule: a constant that names an icon must be the constant that reaches the DOM, and the only way to know is to assert the rendered `class` list, not the resolver's return value.**
- **Two copies of the fallback constants can drift silently.** `src/shared/illustration-registry.ts` cannot be `import`ed by the renderer (load-order, #74), so `game-illustration.ts` holds its own copy. A regex drift-guard unit test now pins the renderer's literals to the shared ones; it fails on any edit to one side only.
- **A test can encode the bug as the contract.** One existing assertion in `illustration-registry.test.ts` locked in "no category, no icon -> `null`". It was green and it was the defect. **Rule: when changing intended behaviour, grep the tests for the old behaviour before assuming the suite will tell you.**
- **The 62%-of-stage assertion was measuring a rectangle the illustration is not inside.** It measured `question..answer-grid` via `offsetWidth`/`offsetHeight`; at 1280×720 the layout is one column and the art sits *above* the question, so the number could not see it. Two repair attempts were each disproved by negative control (shrink the art to 200px / squeeze the question / pad the text column — the number did not move). Removed rather than left as a guard that can never fail. **Rule: before trusting a layout number, break the layout on purpose and confirm the number changes.**
- **Rebuilding `dist/` while the app is running wedges port 9341.** The old renderer keeps the CDP socket and the next check hangs after a handful of lines with no error. Kill `electron` *and* `node` before relaunching.
- **A long check in Windows PowerShell can stall its own stdout.** A correct 169-step run (`exit 0`, 169/169) produced no streaming output past line 5. Redirecting to a file with `Start-Process -RedirectStandardOutput` and polling the file size is the reliable way to watch it. Do not conclude the check is hung from a silent console.
- **PowerShell mangles nested quotes in `node -e`.** Multi-token probes go in a temp `.js` file.

**Verification.** `npm run check` exit 0. `node dist/tests/unit/illustration-registry.test.js` — **33** checks (was 31; 2 new for the default scene, 1 drift guard). `npm test` exit 0. Live app via CDP, all after killing `electron`/`node` and relaunching on the fresh `dist/`: `ui-stage-illustration-check` **169/169** (was 94 — five new default-scene assertions × 5 templates, run at 1366×768 and 1920×1080), `ui-play-surface-check` **156/156**, `ui-fullscreen-density-check` **8/8**, `ui-race-treasure-check` **19/19**. Measured sizes and `stage overflow = 0` at both resolutions are in the table above and were re-read from the live DOM, not inferred from the CSS. Screenshots `tests/ui/shots/illustration-{quiz,matching,treasure-hunt,race,scenario}-{1366x768,1920x1080}.png` were captured and looked at, plus a `-default-` variant per template (`illustration-<template>-default-<size>.png`, 20 files) which is the no-artwork fixture and therefore the direct evidence for the default scene.

**Still unverified / open.**
- **Nobody has judged whether bigger is better.** Screenshots were reviewed by me and accepted; no teacher has seen them. That is the one acceptance criterion this change cannot test.
- **The property that lost its guard is unmeasured.** "The two-column content block uses the stage's height" is now checked only indirectly (no >90px gap under the answers, no page scroll). A correct measurement of the whole content block is a separate task, written into `docs/STATUS.md`.
- **`ui-race-treasure-check` still inherits the OS window size** (see #87). `19/19` at the default 1366×768 window, `16/19` at 1920×1080 — reproduced identically with this CSS in place, so it is a fixture, not a regression.
- **Real projector hardware** — every size above comes from `Emulation.setDeviceMetricsOverride`.
- **No teacher-uploaded images** — deferred under #31. The "default illustration" is a fixed scene, not the teacher's own picture.



