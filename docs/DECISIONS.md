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





### 90. 5-Game Play Surface: Dynamic Layout (Illustration Present vs Absent), Gamified Team Turn Bar, and Fullscreen Motion

**Context.**
Teachers and students use the 5 game templates (Quiz/Scenario, Matching, Memory, Categorize, Treasure Hunt, and Race) primarily on classroom projectors. Feedback indicated several UX bottlenecks:
1. When illustration mode is turned `off` or data has no illustration, the 2-column layout kept a 300-440px empty column (`.stage-col:not(.is-main)`), creating an asymmetric dead gap and pushing questions to the right.
2. The team competition turn bar and score indicators lacked gamified styling inside the dark player stage.
3. Games 2-5 (Matching, Memory, Categorize, Race) lacked interactive feedback states, cards, and tokens scaled for projection.
4. Answer interactions were static, lacking classroom feedback motions (celebrate on correct, gentle shake on wrong, 3D flip on memory card).

**Decision.**
1. **Dynamic 2-column illustration collapse:** Added `:empty` and `:not(:has(.stage-illustration))` rules on `.stage-col:not(.is-main)` in both `.stage-center` and `.race-turn-row`. When no artwork is drawn, the column collapses to `display: none !important; width: 0 !important;` and `.stage-col.is-main` expands to 100% width with centered question typography. When artwork is present, the 2-column layout cleanly displays art on the left and content on the right.
2. **Gamified Team Turn Bar:** Polished `.team-turn-bar`, `.team-turn-summary`, `.team-score-list`, `.team-score-chip`, and `.team-turn-select` with glowing active team indicator (`.is-active`), gold score pill, and dark-themed dropdown selector.
3. **Motion & Feedback Animations:** Added keyframe animations (`@keyframes answer-celebrate`, `@keyframes answer-shake`, `@keyframes feedback-pop`, `@keyframes memory-flip`) with `@media (prefers-reduced-motion: reduce)` accessibility guard.
4. **Enhanced 5-Game UI Elements:** Polished matching cards (`.match-card`), memory grid & 3D card flip (`.memory-card`), categorize boxes & chips (`.group-box`, `.group-chip`), and race cell hover elevations.
5. **App-wide Fullscreen Toggle:** Added `#topbarFullscreenBtn` (`⛶`) and `F11` shortcut toggle.

**Verification.**
- `npm run check` (TypeScript): exit 0.
- `npm run check:renderer-globals`: 34 scripts, 503 declared functions, 4232 call sites — 0 undefined globals.
- `npm run verify:css`: 12/12 compiled-CSS checks passed.
- `dist/src/renderer/styles/app.css`: verified all keyframes and selectors compiled properly.
- `node dist/tests/unit/build-assets.test.js`: 4 copied assets present, all HTML references resolve.


### 91. Treasure Hunt UX: Hidden Journey Map During Answering with Reveal & Advance Motion, Context Popup Modal, and 80-90% vs 100% Rewards

**Context.**
In the Treasure Hunt ("Truy tìm kho báu") game, classroom feedback and user requests highlighted three key UX improvements:
1. When answering questions, the explorer journey map (`.treasure-map`) took up prominent vertical space at the top, pushing questions, hints, and answers downward.
2. The stage storyline and mission rules (`.treasure-context`) occupied substantial vertical space inline via `<details>`, adding cognitive load before students could focus on the puzzle.
3. Upon finishing the game, the victory screen had generic medal states without differentiated rewards matching performance (specifically, 80-99% awarding a meaningful treasure blessing/wish, and 100% awarding the ultimate "Người đỉnh nhất hôm nay" championship).

**Decision.**
1. **Dynamic Map Drawer (`.treasure-map-drawer`)**: During question answering (`!tp.answered`), the journey map is hidden by default (`.is-answering:not(.is-peek-open)`), giving full vertical prominence to the puzzle, decoding, or matching. A toggle button in `.stage-top` (`🗺️ Xem bản đồ`) allows peeking at any time. When the player answers, the drawer smoothly slides open (`.is-answered`, `@keyframes treasure-map-slide-down`) revealing the updated node. When the player clicks "Tiếp tục →", the map displays the explorer advance motion (`.treasure-map-node.is-advancing`, `@keyframes node-advance-pulse`) and plays audio before advancing.
2. **Context & Mission Rules Pop-up Modal (`openTreasureStoryModal`)**: Replaced inline `<details>` with a prominent trigger button (`📜 Bối cảnh & Nhiệm vụ chặng`). Clicking opens a backdrop modal popup containing explorer intro, stage narrative, task rules, attempts left, and completion points.
3. **Tiered Victory & Treasure Blessing Rewards**:
   - `percent === 100`: Crown medal `👑`, championship celebration card (`.treasure-reward-card.is-champion`) with golden glow, awarding the highest praise: "BẠN LÀ NGƯỜI ĐỈNH NHẤT HÔM NAY! 🏆👑".
   - `percent >= 80 && percent < 100`: Scroll medal `📜`, blessing card (`.treasure-reward-card.is-blessing`) with emerald/cyan glow, unlocking an inspiring educational wish/blessing quote from the Temple of Knowledge.
   - `percent < 80`: Encouragement card recognizing effort and inspiring another run.

**Verification.**
- `npm run check` (TypeScript `tsc --noEmit`): exit 0.
- `npm run check:renderer-globals`: 34 scripts, 504 declared functions, 4274 call sites — 0 undefined globals.
- `npm run build`: exit 0.
- `npm run verify:css`: 12/12 compiled-CSS checks passed.
- `node dist/tests/unit/build-assets.test.js`: exit 0.
- Verified compiled CSS in `dist/src/renderer/styles/app.css` for drawer, dialog, champion, and blessing classes.


### 92. Treasure Hunt: Full-Screen Journey Map View & Robust Stage Advancement

**Context.**
When playing the Treasure Hunt ("Truy tìm kho báu") game:
1. Attempting to click "Tiếp tục" threw a TypeError due to calling `.find()` on a querySelector result (`$`), causing the advance flow to freeze and fail.
2. In games where `stage.nextStageId` was null, omitted, or malformed, the game prematurely treated intermediate stages as the final stage, offering only "Nhận kho báu".
3. Cramming the journey map directly above the question after answering created awkward vertical layout contention. Users requested that upon answering, clicking "Tiếp tục" should transition to a dedicated full-screen journey map view so players clearly see the entire world map, which stage they just completed, and where the explorer is advancing to next, before clicking to enter the next challenge.

**Decision.**
1. **Fallback next stage resolution (`treasureNextStage`)**: If `stage.nextStageId` is missing, invalid, or null, automatically link to `hunt.stages[currentIndex + 1]`. Only the true final stage triggers the treasure completion.
2. **Dedicated Full-Screen Journey Map View (`renderTreasureJourneyMap`)**:
   - Question stage focus: Answering screen contains only the puzzle/question, illustration, and context modal button.
   - Post-answer action: A centered, large `[Tiếp tục: Xem bản đồ hành trình ➔]` button is displayed beneath the explanation.
   - Transition to full-screen map: Clicking transitions the entire game surface into the full journey map (`.is-journey-screen`), showing the full-width world backdrop, the entire track, the completed node marked `✓`/`✕`, and the next target node pulsing with advance motion (`.is-target-advance`).
   - Next stage preview card: Displays next stage name, task description, and mission challenge type, with a prominent primary button `[Bước vào chặng tiếp theo ➔]` (or `[🏠 Mở kho báu ngay ➔]`).
3. **Branch support (`treasureBranchStage`)**: If the current stage defines a branch, both main route and branch route buttons are presented clearly on the journey card.

**Verification.**
- `npm run check` (TypeScript): exit 0.
- `npm run check:renderer-globals`: 34 scripts, 507 declared functions, 4298 call sites — 0 undefined globals.
- `npm run build`: exit 0.
- `npm run verify:css`: 12/12 compiled-CSS checks passed.
- `dist/src/renderer/styles/app.css`: verified all journey screen, button, and advance animations.


### 93. Treasure Hunt: Hint and Feedback Positioning Directly Under Illustration

**Context.**
In Treasure Hunt ("Truy tìm kho báu"), feedback and hint messages were previously positioned in varying places or crammed under question cards, causing layout shifts. Additionally, the illustration container width constraints caused images to shrink disproportionately on smaller viewports.

**Decision.**
1. Fix illustration column width and ratio (`.stage-col:has(> .stage-illustration.is-treasure)`) with 100% width, aspect ratio 16/10, and flex-shrink 0.
2. Position `#answerFeedback` directly under the illustration inside `.stage-side-col`. When the teacher/player clicks "💡 Dùng gợi ý" or submits an answer, hint cards and correct/wrong feedback cards render neatly underneath the image.
3. Decouple feedback dimensions with an independent scrollable box (`max-height: 220px; overflow-y: auto;`) so changing image size or screen height does not distort questions or force page overflow.

**Verification.**
- `npm run check`: exit 0.
- `npm run build:css` and `npm run verify:css`: 12/12 PASS.
- Verified responsive stability across different window sizes.


### 94. Race Game: Immediate Correct/Wrong Answer Feedback and Enlarged Illustration

**Context.**
In the Race Game ("Đường đua tri thức"), when a team answered a question, the game immediately closed the question modal and advanced turns, leaving no time for teachers or students to see if the chosen answer was correct or read explanations. Additionally, the race illustration column was constrained to a small size (`clamp(200px, 16vw, 300px)`), making images hard to view on classroom projectors.

**Decision.**
1. Widen the illustration column to `clamp(280px, 24vw, 400px)` with standard 16:10 aspect ratio and 100% width.
2. In `answerRace`, retain question view upon submission:
   - Highlight the correct option in green (`.correct`) and wrong options in red (`.wrong`).
   - Disable all option buttons to prevent accidental re-submission.
   - Play positive/negative sound cues immediately.
   - Display detailed feedback card (`.race-feedback-card`) under the illustration showing right/wrong status, cells moved, points gained, and answer explanation.
   - Render a prominent primary button `[Lượt tiếp theo: Đội X ➔]` (or `[🏁 Xem kết quả cuộc đua ➔]`) allowing the teacher to manually advance the turn when ready.

**Verification.**
- `npm run check`: exit 0.
- `npm run build:css` and `npm run verify:css`: 12/12 PASS.
- Smoke tests pass.


### 95. Race Game: Unified Header Bar Combining Round-Turn and Scalable Team Scoreboard Chips

**Context.**
Previously in Race Game ("Đường đua tri thức"), the board had two separate rows/containers for status: a `.stage-top` header for round/turn info and a bottom `.race-scoreboard` taking up substantial vertical space. Teachers requested consolidating Round/Turn and Teams into a single top row, where the round and current active team occupy more horizontal space on the left, while the right side displays team chips compactly, with support for scaling to more teams (3–6+ teams) without breaking the layout or pushing track/questions off screen.

**Decision.**
1. Combine into a single top container `.race-status-bar` placed above the racetrack.
2. **Left Section (`.race-turn-indicator`)**: Takes more length (`flex: 1 1 340px; min-width: 280px`), featuring:
   - Round pill: `VÒNG X/Y`
   - Active team pill: `LƯỢT HIỆN TẠI: [Icon] [Name]`
   - Rule pill: `⚡ Tiến theo độ khó: Dễ +1, TB +2, Khó +3`
3. **Right Section (`.race-scoreboard`)**: Styled as a horizontal chip list (`display: flex; flex-direction: row; flex-wrap: wrap; justify-content: flex-end; gap: 6px 8px;`).
   - Each chip (`.race-team-row`) contains rank medal, team identity (`[Icon] [Name]`), position chip (`Ô X/Y`), and points (`🏆 PTS`).
   - Active team chip is highlighted with `.active` (purple background `#262c50`, violet border `#8b82ff`, and subtle glow).
   - If 3, 4, 5, or more teams are present, chips wrap neatly without vertical distortion or clipping.
   - Preserved exact selector `.race-scoreboard .race-team-row` and theme colors to maintain backward compatibility with all smoke tests and `verify-css.js`.

**Verification.**
- `npm run check` (`tsc --noEmit`): exit 0.
- `npm run build:css`: exit 0.
- `npm run verify:css`: 12/12 PASS (maintains `.race-team-row` #1b2140 and `.active` #262c50).
- `npm run check:renderer-globals`: 34 scripts, 508 declared functions, 4333 call sites — 0 undefined globals.
- `npm run build`: exit 0.


### 96. Matching Game: Animated SVG Connector Beams for Matched Pairs

**Context.**
In the Matching Game ("Ghép cặp kiến thức") and the Treasure Hunt matching mission ("Nhiệm vụ ghép cặp"), when a player selected a correct pair across two columns, the cards were simply grayed out with a dashed border (`.matched`). Users requested adding a visual connection effect that physically links the two matching cards together so players and classroom audiences can clearly trace which term corresponds to which definition.

**Decision.**
1. **Dynamic SVG Canvas Overlay (`.matching-connector-canvas`)**:
   - Injected into `.matching-board` and `.treasure-match-grid` with `position: absolute; inset: 0; pointer-events: none; z-index: 10;`.
2. **Smooth Cubic Bezier Connecting Beam**:
   - Calculates exact boundary connection points between the right edge of the left card and the left edge of the right card.
   - Draws a cubic Bezier curve (`M x1 y1 C cx1 y1, cx2 y2, x2 y2`) with a glowing stroke.
   - Animated laser beam drawing using `stroke-dasharray` and `stroke-dashoffset` (`@keyframes matchingBeamDraw 0.45s`).
   - Glowing connection pins (`<circle>`) at both endpoints and a centered checkmark badge (`.matching-badge-wrap`) at the midpoint of the curve.
3. **Distinct Color Palette per Matched Pair**:
   - Utilizes `MATCH_CONNECTOR_PALETTE` (emerald, cyan, purple, amber, pink, blue, teal, orange) so multiple matched pairs each have a unique, identifiable color on the board.
   - Cards are highlighted with matching border color, glowing box-shadow, and elevated contrast (`.is-connected`).
4. **Responsive Recalculation**:
   - Integrated `ResizeObserver` and window resize listeners (`updateAllMatchingConnectors()`) so resizing the window or presentation view immediately realigns all connection lines without clipping or distortion.
5. **Immediate Audio Feedback**:
   - Plays `GameAudio.play('match')` on every successful pair and `GameAudio.play('correct')` on completing all pairs before transitioning to the results screen.

**Verification.**
- `npm run check` (`tsc --noEmit`): exit 0.
- `npm run build:css`: exit 0.
- `npm run verify:css`: 12/12 compiled-CSS checks passed.
- `npm run check:renderer-globals`: 34 scripts, 508 declared functions, 4333 call sites — 0 undefined globals.
- `npm run build`: exit 0.


### 97. Navbar Modernization: Embedding AI / llama.cpp Status Bar and System Notification Center

**Context.**
Previously, the desktop application had an independent `#aiStatusBar` rendered as a separate, full-width secondary strip immediately below `<header class="topbar">`. This took up ~40px of vertical space on every screen, pushing page content down. Furthermore, notifications were solely transient bottom toasts without a centralized place for teachers to review system events or offline readiness alerts. Users requested unifying and improving the navbar layout, moving the llama.cpp status indicator and system notifications directly up into the top navbar.

**Decision.**
1. **Unified Navbar Integration (`<header class="topbar">`)**:
   - Integrated `#aiStatusBar` directly into the top navbar between the breadcrumb (left) and action buttons (right).
   - Removed the separate secondary bar, reclaiming 36px–48px of vertical screen height for games, library cards, and wizards.
   - Styled the embedded `#aiStatusBar` as a sleek, rounded pill container with light background `#f8fafc`, soft borders, status dot, live task description, and compact action controls (`▶ Khởi động`, `Dừng`, `Huỷ AI`, `Hiện khi rảnh`).
2. **System Notification Center (`#topbarNotificationContainer`)**:
   - Added a notification bell button (`#topbarNotificationBtn`) with an unread badge counter (`#topbarNotificationBadge`).
   - Integrated a floating popover (`#topbarNotificationPopover`) displaying recent system notifications and status logs with timestamps.
   - Wired `toast(message)` to automatically log all transient notifications to the Notification Center history.
   - Provided a "Xoá tất cả" action to clear notifications.
3. **100% Backward Compatibility**:
   - Maintained all existing element IDs (`aiStatusBar`, `aiStatusRuntime`, `aiStatusRuntimeDot`, `aiStatusTask`, `aiStatusStart`, `aiStatusStop`, `aiStatusCancel`, `aiStatusToggle`, `pageCrumb`, `topbarFullscreenBtn`, `helpBtn`, `globalAiActivity`, `toast`) and data attributes.
   - Preserved compatibility with automated smoke tests (`smoke73`, `ui-fullscreen-check`) and theme switches.

**Verification.**
- `npm run check` (`tsc --noEmit`): exit 0.
- `npm run build:css`: exit 0.
- `npm run verify:css`: 12/12 compiled-CSS checks passed.
- `npm run check:renderer-globals`: 34 scripts, 511 declared functions, 4370 call sites — 0 undefined globals.
- `npm run build`: exit 0.


### 98. Lesson Wizard Step 1: Layout Modernization with Structured Upload Dropzone & Sample Injection

**Context.**
Step 1 of the "Create from lesson plan" wizard previously had a cramped and unorganized layout: a tiny, unadorned "Chọn tệp giáo án" button was placed above a plain document name input and a giant raw textarea, without visual distinction between importing a file vs pasting text. There was no instant visual feedback when a file was loaded, no one-click sample for testing, and the AI status box sat awkwardly between the textarea and primary action button.

**Decision.**
1. **Redesigned Step 1 Panel Layout (`.wizard-step-input-panel`)**:
   - **Header**: Added step badge `BƯỚC 1 / 5`, clear title, and privacy guarantee badge (`🔒 Bảo mật cục bộ · 100% Offline`).
   - **Visual File Upload Card (`.wizard-import-card`)**:
     - Empty state: Clean dropzone card with document folder icon, supported formats pills (`DOCX`, `PDF`, `PPTX`, `TXT / MD`), and prominent primary upload button `[ ⇧ Chọn tệp giáo án ]`.
     - Loaded state: Turns into a document card displaying file icon, filename, character count, file format tag, and a quick `[ ↻ Đổi tệp khác ]` button.
   - **Visual Divider**: `── HOẶC DÁN NỘI DUNG VĂN BẢN ──` clearly distinguishing the two input paths.
   - **Document Name & Textarea Editor**:
     - Name input `#wizardDocName` positioned cleanly with label `TÊN BÀI HỌC / TÀI LIỆU`.
     - Textarea toolbar with quick action button `✨ Thử giáo án mẫu` (`wizardInputInsertSample`), populating a full Biology lesson sample for immediate 1-click test runs.
     - Live length counter `#wizardDocHint` showing real-time character count and readiness state (`● Sẵn sàng phân tích` vs `○ Chưa đủ độ dài`).
   - **Local AI Status Card**:
     - Refined card layout with clear indicator dot, status message, and direct `Mở AI local` action.
   - **Action Bar**:
     - Prominent large action button `#wizardNextBtn` (`Tiếp tục: Phân tích giáo án bằng AI ➔`) and secondary button `Tôi đã biết muốn tạo trò chơi nào`.
2. **100% Backward Compatibility**:
   - Maintained all selectors and DOM IDs: `data-wizard-step-body="input"`, `#wizardDocName`, `#wizardDocText`, `#wizardDocHint`, `#wizardNextBtn`, `#wizardAiStatus`, `[data-wizard-action="import-file"]`, `[data-wizard-action="next"]`.

**Verification.**
- `npm run check` (`tsc --noEmit`): exit 0.
- `npm run build:css`: exit 0.
- `npm run verify:css`: 12/12 compiled-CSS checks passed.
- `npm run check:renderer-globals`: 34 scripts, 514 declared functions, 4401 call sites — 0 undefined globals.
- `npm run build`: exit 0.
- `node dist/tests/unit/renderer-load-order.test.js`: exit 0.
- `node dist/tests/unit/build-assets.test.js`: exit 0.


### 99. Lesson Wizard Step 1: Tab UI for Document Structure & Content, Remove Redundant AI Status Banner

**Context.**
After the Step 1 redesign (Decision #98), the AI local status banner (`wizardAiReadinessHint()`) still rendered inline in the Step 1 panel even though the same information was already available on the top navbar (Decision #97). Additionally, the document structure tree (`renderWizardStructureTree()`) was rendered below the entire Step 1 section as a separate panel, making the relationship between content input and structure preview unclear.

**Decision.**
1. **Removed the inline AI status banner from Step 1**: The `wizardAiReadinessHint()` call was removed from `renderWizardInput()`. The function definition remains because it is reused by `step-analysis.ts`.
2. **Unified 2-tab interface** replacing the separate structure panel:
   - **Tab 1 — 📑 Cấu trúc tài liệu**: Shows the document heading tree (`renderWizardStructureTree()`). When no text is loaded, displays a placeholder with a button to switch to the content tab.
   - **Tab 2 — 📝 Nội dung giáo án**: Contains `#wizardDocText` textarea, live character counter `#wizardDocHint`, readiness indicator, and `✨ Thử giáo án mẫu` quick action.
   - Tab state stored in `wizardState.inputTab` (`'structure'` | `'content'`); defaults to `'content'` when no text, auto-switches to `'structure'` after file import.
   - Inactive tab pane uses `class="hidden"` (display:none) so `#wizardDocText` stays in the DOM — smoke tests (64/65/66) and `renderer-load-order.test.ts` continue to pass.
3. **Added `wizardInputInsertSample()` function** to `step-input.ts`: Populates a full Biology lesson plan sample text (Quang hợp ở thực vật) for one-click testing, wired through `data-wizard-action="insert-sample"` in `create-wizard.ts`.
4. **Added `renderWizardStructureTabContent()` helper**: Shows a friendly empty-state when text is below minimum, otherwise delegates to `renderWizardStructureTree()`.
5. **CSS for tab styling**: `.wizard-tab-btn` with transparent background, `.wizard-tab-pane [data-structure-panel]` strips redundant borders/shadows.

**Verification.**
- `npm run check` (`tsc --noEmit`): exit 0.
- `npm run build:css`: exit 0 (Tailwind v4.3.3).
- `npm run verify:css`: 12/12 compiled-CSS checks passed.
- `npm run check:renderer-globals`: 34 scripts, 516 declared functions, 4417 call sites — 0 undefined globals.
- `npm run build`: exit 0.
- `node dist/tests/unit/renderer-load-order.test.js`: exit 0.
- `node dist/tests/unit/renderer-undefined-globals.test.js`: exit 0.
- `node dist/tests/unit/build-assets.test.js`: exit 0.




### 100. Manual Game Creator Page: Layout Modernization & Section Label Cleanup

**Context.**
The "Tạo trò chơi mới" (manual game creation) page used cryptic letter-prefixed section headers (`B · Chọn loại trò chơi`, `C · Soạn nội dung thủ công`, `D · Thiết lập trò chơi`, `E · Mở trình chỉnh sửa`) inherited from an earlier prototype. The letters were meaningless to teachers and cluttered the UI. The page also lacked dark-mode support and had inconsistent form styling compared to the modernized wizard pages.

**Decision.**
1. **Removed all letter-prefixed section headers** (`B ·`, `C ·`, `D ·`, `E ·`) — replaced with descriptive icon-prefixed headers (🎮 Chọn loại trò chơi, ⚙️ Thiết lập trò chơi, ✏️ Soạn nội dung & Mở trình chỉnh sửa).
2. **Restructured into 3 main content sections** (down from 4): template selection, game setup, and content editing/launch — in a logical top-to-bottom flow.
3. **Modernized sidebar** with numbered step guide, a gradient AI call-to-action card, and a system status panel.
4. **Unified form styling** with the wizard: rounded-2xl cards, consistent label/input styling, dark-mode variants for all elements.
5. **100% backward compatible**: All DOM IDs preserved (`#gameTitle`, `#gameSubject`, `#gameGrade`, `#questionCount`, `#generateBtn`, `#previewManualBtn`, `#scoringModeHint`, all `setup*` fields, `data-template`, `data-page`).

**Verification.**
- `npm run check` (`tsc --noEmit`): exit 0.
- `npm run build`: exit 0 (Tailwind v4.3.3).
- `npm run verify:css`: 12/12 compiled-CSS checks passed.
- `npm run check:renderer-globals`: 34 scripts, 516 declared functions, 4417 call sites — 0 undefined globals.
- `node dist/tests/unit/renderer-load-order.test.js`: exit 0.
- `node dist/tests/unit/renderer-undefined-globals.test.js`: exit 0.
- `node dist/tests/unit/build-assets.test.js`: exit 0.



### 101. Settings Page: Modern Layout Restructuring with Sticky Save Action & Configuration Summary

**Context.**
The Settings page ("Cài đặt ứng dụng", `renderSettings`) was previously organized as a long single-column sequence of raw panels. The "Lưu cài đặt" button was placed only once at the top-right header, requiring teachers to scroll all the way back up after tweaking AI providers, teaching styles, or classroom presentation preferences. Form fields lacked clear visual grouping, hierarchy, and dark-mode styling consistent with recent page modernizations.

**Decision.**
1. **Sticky Floating Sidebar with Action Card**:
   - Moved the primary `#saveSettingsBtn` into a high-visibility, sticky gradient card in the right sidebar (`sticky top-20`), ensuring teachers can click `💾 Lưu cài đặt` at any scroll position without having to hunt for the button.
   - Added a live configuration overview card in the sidebar summarizing active AI mode, teaching tone, theme, audience, and local model installation status.
   - Added quick links in the sidebar to jump directly to "Tạo trò chơi từ giáo án", "Thư viện trò chơi", and "Dự án của tôi".
2. **Modular Section Cards with Icon Titles**:
   - **🤖 AI local tích hợp**: Model selection, readiness status chip, model evaluation details, collapsible GPU advanced options, verification/reinstall actions, hardware spec summary.
   - **☁️ Nhà cung cấp AI**: AI mode switch (Offline, Local, Cloud), cloud providers (ChatGPT, Gemini, OpenCode Zen, custom), base URL, model, and API key with test connection button (`#testAiBtn`).
   - **🎨 Phong cách giảng dạy của tôi**: Tone, humor, artistic visual style, real-world examples, and guidance notes for AI generation.
   - **⚙️ Dữ liệu và trải nghiệm**: Theme switch, audience mode, large text, audio toggles, plus localized privacy & `.egame` package specs.
   - **📋 Tác vụ AI**: Task list manager with refresh and CPU runtime verification affordances.
   - **🔍 Chẩn đoán AI (log)**: Diagnostic log exporter, log folder launcher, and log clearing controls.
3. **100% Backward Compatibility**:
   - All critical DOM IDs and event bindings preserved: `#saveSettingsBtn`, `#openSetupWizardBtn`, `#installLocalModelBtn`, `#testAiBtn`, `#aiTasksRefreshBtn`, `#cpuRuntimeVerifyBtn`, `#exportDiagnosticsBtn`, `#openLogFolderBtn`, `#clearDiagnosticsBtn`, `#cpuVerifyResult`, `#aiTaskList`, `#diagnosticsResult`, `#diagnosticsInfo`, `#localAiProgress`, `#localModelSelect`, `#localRuntimeBackendSelect`, and all `setting*` inputs.

**Verification.**
- `npm run check` (`tsc --noEmit`): exit 0.
- `npm run build`: exit 0 (Tailwind v4.3.3).
- `npm run verify:css`: 12/12 compiled-CSS checks passed.
- `npm run check:renderer-globals`: 34 scripts, 516 declared functions, 4418 call sites — 0 undefined globals.
- `node dist/tests/unit/renderer-load-order.test.js`: exit 0.
- `node dist/tests/unit/renderer-undefined-globals.test.js`: exit 0.
- `node dist/tests/unit/build-assets.test.js`: exit 0.


### 102. Navbar: Compact llama.cpp Status Pill & 3-Dots Action Dropdown Menu

**Context.**
After moving the llama.cpp status bar to the top navbar in Decision #97, the bar rendered 4 full text action buttons (`▶ Khởi động`, `Dừng`, `Huỷ AI`, `Hiện khi rảnh`) plus long status text inline across a wide 580px container. This cluttered the navbar and left minimal breathing room for breadcrumbs and title navigation. The user requested compacting the llama.cpp status bar and grouping its functional buttons into a 3-dots button that reveals the actions when clicked.

**Decision.**
1. **Ultra-Compact Status Pill (`#aiStatusBar`)**:
   - Transformed the wide bar into an elegant, compact pill (height 34px) containing only the status dot (`#aiStatusRuntimeDot`), concise status label (`#aiStatusRuntime`), and the 3-dots trigger button (`#aiStatusMenuBtn`).
   - `#aiStatusTask` is hidden when idle and automatically shown with task details (`stage · mm:ss`) only when an AI task is actively running.
   - Clicking anywhere on the pill or the 3-dots button opens the action dropdown.
2. **3-Dots Action Dropdown Menu (`#aiStatusDropdown`)**:
   - Replaced the 4 scattered inline text buttons with a unified dropdown menu triggered by `#aiStatusMenuBtn` (⋮ icon):
     - `▶ Khởi động AI local` (`#aiStatusStart`) — enabled when idle.
     - `⏹ Dừng llama.cpp` (`#aiStatusStop`) — enabled when ready.
     - `✕ Huỷ tác vụ AI` (`#aiStatusCancel`) — enabled when task is active.
     - `👁 Hiện khi rảnh / Ẩn khi rảnh` (`#aiStatusToggle`) — toggles idle indicator.
     - `⚙ Cài đặt AI local…` (`#aiStatusOpenModalBtn`) — quick shortcut to open local AI configuration modal.
   - Click-outside-to-close behavior implemented cleanly, matching the notifications popover pattern.
3. **100% Backward Compatibility**:
   - Preserved all element IDs: `#aiStatusBar`, `#aiStatusRuntime`, `#aiStatusRuntimeDot`, `#aiStatusTask`, `#aiStatusStart`, `#aiStatusStop`, `#aiStatusCancel`, `#aiStatusToggle`, ensuring smoke tests (`smoke73.js`, `smoke75.js`) and status monitors continue passing 100%.

**Verification.**
- `npm run check` (`tsc --noEmit`): exit 0.
- `npm run build:css`: exit 0 (Tailwind v4.3.3).
- `npm run verify:css`: 12/12 compiled-CSS checks passed.
- `npm run check:renderer-globals`: 34 scripts, 518 declared functions, 4444 call sites — 0 undefined globals.
- `npm run build`: exit 0.
- `node dist/tests/unit/renderer-load-order.test.js`: exit 0.
- `node dist/tests/unit/renderer-undefined-globals.test.js`: exit 0.
- `node dist/tests/unit/build-assets.test.js`: exit 0.

### 103. Lesson Wizard Step 1: Stop the Structure Tree / Tabs From Jumping on Tick and Tab Switch

**Context.**
On "Tạo từ giáo án" step 1, ticking a section in "Cấu trúc tài liệu" (and switching between the structure/content tabs) felt stuck and jumpy. Three independent causes, found in this order:

1. **The tristate restore never ran.** `innerHTML` cannot express `indeterminate`, so `wizardSyncStructureCheckboxes()` existed for it — but it was called from `wireCreateWizard()`, which runs *before* `render()` replaces `#pageContent`. It restored the checkboxes of the old, about-to-be-thrown-away DOM. After the render, parents whose children are partly ticked stayed visually unchecked until an unrelated later render.
2. **The tree scrolled back to its first row** on every tick, because the whole page (not just the tree) is re-rendered and nothing stored the scroll offset.
3. **Switching to the structure tab could show a blank pane**, and the character counter on the content tab stayed at "0 ký tự" while typing, because the tabs only re-render on click.

**Decision.**
- `core/render.ts` now captures the step-1 tree/preview scroll offsets *before* `innerHTML` and re-applies the tristate *after* it (`wizardStructureCaptureView()` / `wizardSyncStructureCheckboxes()`), so the restore runs against the DOM that is on screen.
- `wizardSyncStructureCheckboxes()` is rooted at `[data-tab-pane="structure"]` (falling back to `#pageContent`) instead of `document`. The document <head> is writable, and a package test dumping a report into `document` had previously left a stale `document`-wide query throwing `HTMLCollection does not support named properties`; rooting the query keeps the sync inside the page.
- The ticked section is re-focused after the render (`wizardStructureToggle.pendingFocus`) and both scroll offsets are restored, so the row under the pointer stays put.
- Tabs: panes carry `role="tabpanel"`, buttons `role="tab"`/`aria-selected`/`aria-controls`. Both panes stay `display`-toggled (never `aria-hidden`), which keeps the tree reachable for `wizardSyncStructureCheckboxes()` and for screen readers. A pane shown before the debounced analyzer has run renders a "Đang đọc cấu trúc…" state and schedules the analysis immediately instead of staying blank.
- Typing now patches the tab counters through `wizardSyncStepInputStats()` (marker: `[data-wizard-tab-count]`) instead of waiting for the next click.
- CSS: `[data-tab-pane] [data-structure-panel]` gets `contain: layout paint` so a tick repaints only the tree box; `.wizard-tab-pane { overflow-anchor: none }` prevents the browser's scroll anchoring from dragging the page when the pane is re-created; the structure panel itself is never a containment root (`contain: layout` would make it a containing block and shift the offsets the restore reads).

**Verification.**
- `npm run check`: exit 0. `npm run build`: exit 0. `npm run verify:css`: 12/12.
- `npm run check:renderer-globals`: 34 scripts, 522 declared functions, 4484 call sites — 0 undefined globals.
- `npm test`: exit 0.
- New Electron check `node tests/ui/ui-wizard-structure-check.js <port>`: 10/10 — scroll offset and focus survive a tick, the tab counter follows typing, both panes stay in the DOM, `aria-selected` is set, and the structure tab fills in once the analyzer finishes.
- `node tests/ui/ui-draft-guard-check.js <port>`: 7/8. The one failure is the AI-generation row (no llama.cpp runtime in the check environment), not related to step 1.

**Traps for the next change.**
- Do **not** move the tristate sync back into `wireCreateWizard()`: it runs before the markup exists.
- `scrollTop` cannot be set on a pane that is `display:none`; the offset is written only while the structure pane is visible.
- `aria-hidden` on a pane would hide the tree from `wizardSyncStructureCheckboxes()`'s own visibility rules and from the UI checks; use the `hidden` class only.
**Review follow-up (same batch).**
An independent review of this uncommitted batch found six defects; all are fixed and verified:

1. `raceTurnPanelHtml()` used `race` without declaring it. The live build therefore threw `ReferenceError: race is not defined` whenever a race question was drawn, so from the second turn on the answer grid never rendered (the earlier UI check passed because it only drew once). `const race = state.currentGame.race;` is now declared in the function.
2. The treasure matching SVG was the first child of `.treasure-match-grid`; the connector canvas is now the last child so the two columns keep their positional order.
3. The journey-map redesign removed the only way to finish early. `#journeyEndBtn` and `#treasureEndBtn` now end the hunt after a confirmation and render the results.
4. `isFinalTurn` compared `rp.round >= maxRounds` before `advanceRaceTurn()` increments the round, so the last turn of the last round offered "next team" and the following click jumped to the results. It is now `lastTeam && rp.round >= race.maxRounds`.
5. `renderCreate` moved the medium/hard point fields into a grid that lost its `hidden` class, so `updateScoringVisibility()` could no longer hide them. The row has `#pointsDifficultyGrid` and the toggler drives it together with the fields.
6. The new `ui-wizard-structure-check` still passed with the post-render sync removed. It now asserts the parent's indeterminate state and `aria-checked="mixed"` right after a nested tick; re-verified by removing the call from the built bundle (10/14 instead of 14/14).

The focus restore added in #103 lands one frame late (the page is replaced during the tick), and `ui-race-treasure-check` opens the map drawer before measuring stage overflow, since the drawer is collapsed while answering.
### 104. Treasure Hunt Fullscreen Layout: Diagram Left, Story Right, Hint as a Corner FAB

**Context.** In fullscreen the treasure stage was still one column: collapsed map → question → answer grid → actions. The story (hunt.intro, stage.story, stage.taskDescription) was behind a "📜 Bối cảnh & Nhiệm vụ" pop-up, the hint was a text button inside the optional-actions row, and the previous screen's answer area (the left illustration column) was mostly empty. The teacher had to scroll and open a dialog to know what the stage was about.

**Decision.**
- Stage markup is a grid (.stage-center.treasure-stage-grid), only in \html[data-fullscreen="1"]\:
  - **left column** \.treasure-illustration-col\: the scene, then \.treasure-chapter-now\ (label "Chặng", \
 / total\, stage name). The chapter badge replaces the empty area the old exam column occupied.
  - **right column** \.stage-col.is-main\: \#treasureStoryline\ (avatar + \.scenario-context\ with intro/story/task), the mission badge, the question, \#treasureMission\, optional actions.
- The "Bối cảnh & Nhiệm vụ" pop-up trigger is removed from the stage; \openTreasureStoryModal()\ and its CSS stay (they are still reachable code and harmless), but the content now lives inline.
- Hint is \#treasureHintBtn\ as \.treasure-hint-fab\: an inline SVG bulb with \ria-label="Dùng gợi ý"\, \position: sticky; left; bottom; align-self: flex-start\ so it sits in the bottom-left corner of the stage (order 3, after \.stage-bottom\). Text is gone; the title attribute keeps the wording for hover.
- Answer rows inside \#treasureMission\ override the global fullscreen \grid-auto-rows: minmax(min-content, 1fr)\ with \uto\: the \1fr\ row can never shrink below the tallest item's min-content, so one long answer inflated all four cards (measured 194px per card at 1366×768).
- World variables are now set by \[data-game="..."]\ on the stage, not by \:has()\ on the modal. Reason: the treasure stage selects plain-\data-game\ attributes that always exist in the template, while \:has()\ selectors were fragile (a Tailwind build dropped \[data-game-world="quiz"]\ and cascades fell back to the default indigo). Scenario shares the quiz world (same engine, two setups) and keeps only its ribbon, italic context and centred question; \openPlayModal()\ passes a separate \	agWorld\ so the header badge still says "Tình huống thực tế".
- Stage items must not get \position: relative\ for decoration: on a scrolling flex container that pushes the stage's children past the clip and the whole stage slides (the regression seen when the five worlds were added).

**Verification.** \ui-race-treasure-check\ 19/19 (treasure stage still scrolls, map sticky, controls reachable, no page double-scroll); \ui-stage-illustration-check\ 169/169 (treasure scene 301×188 default, still a real scene); \ui-fullscreen-density-check\ 8/8. Measured at 1366×768: grid 520px + 704px columns, stage scrollHeight 709 vs clientHeight 657 (~50px scroll), chapter badge "Chặng 1/6 Chặng 1", hint FAB 44×44 at (65, 681), \document.documentElement.scrollHeight === 768\.

**Traps.** Do not select the stage by a dynamic \data-game\ VALUE in CSS (Tailwind v4 drops those selectors); use the structural class. Do not put \grid-auto-rows: 1fr\ back on \#treasureMission > .answer-grid\. The FAB is \sticky\, not \ixed\, so it never escapes the stage on a projector.
### 105. Treasure Hunt: Restore the "Bối cảnh & Nhiệm vụ" Pop-up Trigger

**Context.** DECISIONS #104 moved the story inline (avatar + .treasure-storyline bubble above the mission badge) and dropped the "📜 Bối cảnh & Nhiệm vụ chặng" button, so the text was always on screen. The teacher asked for the pop-up back: the inline block competed with the question and answers for height on a projector board.

**Decision.**
- enderTreasureStage() renders #treasureStoryBtn again in .stage-kicker-row (badge left, button right), guarded by hasStory = intro on the first stage, or stage.story, or stage.taskDescription. Its click opens the existing openTreasureStoryModal().
- The inline .treasure-storyline block is removed from the stage; the story is only visible inside the pop-up (.treasure-story-*, DECISIONS #91).
- Everything else from #104 stays: the fullscreen grid (scene left with the \Chặng n/N\ badge, question/answers right), the hint as a bulb FAB in the bottom-left corner, and the \#treasureMission\ answer-row fix.
- ui-race-treasure-check no longer requires overflow. With the story inside the pop-up the 6-stage fixture fits at 1366×768 (measured 0px), so the check now asserts "tall fixture scrolls to its bottom" OR "fitting fixture stays at scrollTop 0".

**Verification.** Electron probe on a 6-stage hunt at 1366×768: button present, pop-up opens with title "📜 Bối cảnh & Nhiệm vụ: Chặng 1", closes, no .treasure-storyline element, hint FAB present, \document.documentElement.scrollHeight === 768\. \ui-race-treasure-check\ 18/18, \ui-fullscreen-density-check\ 8/8.

**Traps.** Keep the pop-up CSS (it is still the only renderer of the story). If a future layout needs the story inline again, reintroduce it from openTreasureStoryModal()'s content, not from a second copy of the markup.

## #106 — Chơi LAN v1: máy giáo viên là máy chủ và là nguồn chân lý về điểm; chỉ quiz/tình huống/kho báu

**Context.** `docs/archive/specs/EduGame_Studio_LAN_Architecture_Prompt_VI.md` + kế hoạch `.kilo/plans/…lan-classroom-mode-plan.md` yêu cầu giáo viên chơi trên PC, học sinh trả lời trên điện thoại qua Wi-Fi lớp, không cần Internet. Kế hoạch có 3 câu hỏi mở (§11) chưa được trả lời; các quyết định dưới đây chốt chúng theo mặc định đã ghi trong kế hoạch §8 (v1 = chữ + emoji, không ảnh; không công bố đáp án trên điện thoại; chống trùng tên).

**Decision.**
- **Máy chủ chạy trong main process** (`src/lan/lan-server.ts`: Express 5 + Socket.IO 4), bind `0.0.0.0` trên cổng do OS chọn (port 0) và đóng khi giáo viên đóng phòng hoặc app thoát. Một phòng tại một thời điểm; mở phòng thứ hai bị từ chối với lý do rõ ràng (kế hoạch §10.5).
- **Điểm tính ở máy chủ**, bằng đúng `src/game-engine/runtime.ts` (`scoreAnswer`, `scoreTextAnswer`, `scoreScenarioDecision`) mà desktop dùng; `GameSession` không đổi schema, phiên có thêm khối `lan: { room, scoringMode, max, players[] }`.
- **Phạm vi v1:** `quiz`, `scenario` (chỉ khi mọi đáp án cùng tiến tới câu kế tiếp — nhánh rẽ bị khoá vì mỗi em sẽ đi một đường khác), `treasure-hunt` với chặng `multiple-choice`/`scenario`. `matching`, `race`, mission ghép cặp/giải mã/phân loại: nút LAN không hiện và/hoặc máy chủ từ chối kèm lý do.
- **`tốc độ` → `cơ bản` trên LAN.** Điện thoại không thể biết giáo viên đã mất bao lâu mới mở câu, nên thưởng tốc độ sẽ là đoán mò (và không công bằng giữa máy nhanh/chậm). LAN dùng điểm cơ bản và ghi chú rõ trên màn hình giáo viên. Mọi chế độ khác (`cơ bản`, `theo độ khó`, `thi đấu đội`, `luyện tập`) truyền nguyên vào runtime.
- **1 lượt trả lời/câu** (kế hoạch §8.1); điện thoại chỉ nhận "đã ghi nhận", không nhận đúng/sai; đáp án chỉ lộ ra trong snapshot sau khi giáo viên chốt câu. Mỗi câu tự chốt sau 60 giây (`LAN_ANSWER_WINDOW_MS`) để một máy treo không khoá cả lớp.
- **Chống trùng tên không phân biệt hoa/thường, gộp khoảng trắng** (không thêm hậu tố số): hậu tố làm giáo viên khó biết đó là ai trên máy chiếu. Em bị mất mạng dùng lại token để vào lại, không phải "join" lần hai.
- **Mã QR do renderer tự sinh** (`lanQrMatrix` trong `features/lan.ts`, byte mode, ECC L, version 1–10) — không thêm dependency QR, không cần canvas, không tải gì từ Internet.
- **Hình minh họa chỉ có trên máy chiếu.** Điện thoại nhận câu hỏi dạng chữ (kế hoạch §8.3); SVG minh họa được sinh lúc chạy trong renderer nên không có file tĩnh để phục vụ.

**Verification.** `npm run check`, `npm run build`, `npm test` 56/56 (gồm `lan-reducer` 18, `lan-adapters` 22, `build-assets`), `check:renderer-globals` 35 script / 0 undefined, `verify:css` 12/12; `node tests/manual/lan-smoke.js` 15/15 với socket client thật (join, trùng tên, sai phòng, trả lời 2 lần, mất mạng, chốt câu, kết thúc, đóng cổng); `tests/ui/ui-lan-wiring-check.js` 7/7 trong Electron thật (nút LAN, mở phòng, QR, mã phòng, URL LAN, đóng phòng); QR lấy từ app đang chạy được OpenCV giải mã đúng URL. Hồi quy: `ui-play-surface-check` 154/156 (2 lỗi tràn quiz có từ trước), `ui-race-treasure-check` 18/18, `ui-game-worlds-check` 43/44 (lỗi probe đã biết).

**Traps.**
- `features/lan.ts` phải nạp **sau** `gameplay.js` và `results.js` (dùng `lanButtonHtml` trong header, `lanCollectSessionPayload` khi lưu phiên) nhưng **trước** `bootstrap.js` (`lanInit()`). `check:renderer-globals` và `renderer-load-order` bắt lỗi nếu sai thứ tự.
- Không chấm điểm trong renderer hay ở điện thoại: mọi điểm phải đi qua `lan-reducer` + `lan-adapters` để máy chiếu và điện thoại không thể lệch nhau. `tests/unit/lan-adapters.test.ts` đọc thẳng `gameplay.ts` và fail nếu hằng số treasure (`points + completionBonus`, mặc định 100/200/300/50) đổi ở một bên.
- LAN v1 có 1 lượt/chặng nên điểm sai = 0; desktop vẫn nhiều lượt thử. Nếu sau này thêm lượt thử, phải sửa cả reducer và `lan-adapters`, không chỉ mobile.
- Với `strict: false`, discriminant kiểu **boolean** (`ok`) không narrow được union; `LanReduceResult` dùng `outcome: 'done' | 'refused'` vì lý do này.
- `better-sqlite3` phải build cho ABI của Electron (`npx electron-rebuild -f -w better-sqlite3`) sau khi `npm ci`; nếu không app thoát ngay với `NODE_MODULE_VERSION` khác.
- Phòng LAN mở một cổng thật: phải đóng trong `before-quit` và trên `beforeunload` của renderer, nếu không Windows giữ cổng và lần sau lại hiện hộp Firewall.

**Bổ sung (same day).** Hai lỗi sau khi thử lần đầu, ghi lại vì đây là bẫy dễ tái phạm:
- **`emit()` phải đẩy trạng thái xuống điện thoại.** Bản đầu chỉ gọi `onSnapshot` (renderer desktop), nên `mobile.js` không nhận gì và học sinh đứng ở "Chờ giáo viên bắt đầu". Nay `emit()` gửi `lan:state` cho mọi socket qua `phoneSnapshot()`: bản rút gọn **không có** `players`/điểm từng bạn/`lastResult` khi câu đang mở. Bất kỳ trạng thái mới nào thêm vào sau này phải qua `phoneSnapshot`, không gửi thẳng `LanSnapshot`.
- **Mọi bước chuyển câu phải có đường từ UI giáo viên.** `begin()`/`nextRound()` có sẵn trong server nhưng thiếu IPC nên không nút nào gọi được: màn LAN có thanh "Bắt đầu câu 1", còn việc chuyển câu do chính màn chơi điều khiển (`lanAdvanceRound()` trong `nextQuestionBtn.onclick` và nút "Tiếp tục" của kho báu), để máy chiếu và điện thoại không bao giờ lệch câu.
- Nút **📱 Chơi LAN** đặt cả trên thẻ thư viện (`gameCard`, action `'lan'` = mở game + mở phòng) và trong header màn chơi. Thẻ dùng `lanGameSupported()` (guard `typeof`, vì `shared.ts` nạp trước `features/lan.ts`).

## #107 — Kết thúc trận LAN: bục vinh danh 3 hạng, xếp hạng kiểu thi đấu, không phát huy chương cho 0 điểm

**Context.** Khi LAN bật, cả lớp trả lời cùng lúc nên giáo viên cần một màn kết thúc nói ngay ai đứng đầu. Bản LAN đầu tiên chỉ liệt kê mọi người theo điểm, không có bục, và bục là phần giáo viên thấy trên máy chiếu.

**Decision.**
- **Bục 1–2–3**: người nhất đứng **giữa** (`order: 2`) và bục cao nhất (96px / 74 / 58), huy chương 🥇🥈🥉, kèm tên, điểm, đội, "đúng a/b". Hạng 4 trở đi nằm trong danh sách ngay dưới.
- **Xếp hạng kiểu thi đấu**: điểm giảm dần → số câu đúng giảm dần → tên theo thứ tự tiếng Việt. Bằng điểm **và** bằng số câu đúng thì **đồng hạng** và dùng chung thứ hạng, số hạng **không bị nhảy** (hai bạn nhất → người kế là hạng 2, hiện 1, 1, 2 — không phải 1, 1, 3). Bằng điểm nhưng khác số câu đúng là **không** đồng hạng, để không phải tung đồng xu.
- **0 điểm không có huy chương** và bục phẳng (`.is-earned`), kể cả khi cả lớp cùng 0 điểm: một lớp học không nên bị trao huy chương vàng cho 0 điểm.
- **Không xếp hạng đội**: điểm đội dễ gây tranh cãi khi một đội đông hơn; v1 vinh danh từng học sinh, tên đội vẫn hiện kèm.
- **Bục phải sống sót sau khi phòng đóng.** `lanFinishRoomPanel()` vẽ bục rồi `lanStop()`; `onClosed` phát `lan:state = null` và màn hình xoá panel. Cờ `LAN_UI.showingPodium` giữ bục cho tới khi giáo viên bấm "Đóng" hoặc mở phòng mới. Đây là bẫy chung: **mọi màn hình kết thúc của LAN phải tự bảo vệ trước snapshot `null`**.
- Logic xếp hạng có **hai bản**: `lanRankPlayers()` (thuần, `lan-adapters.ts`, dùng cho test và phiên lưu) và `lanPodiumHtml()` (renderer, không `require` được). `tests/unit/lan-podium.test.ts` so hai bản cho cùng thứ hạng trên cùng dữ liệu — sửa luật thì sửa cả hai, test sẽ bắt nếu lệch.

**Verification.** `npm run check` 0; `node tests/run-unit.js` 58/58 (`lan-podium` 9, `lan-adapters` +8); `verify:css` 15/15 (thêm 3 invariant: grid 3 cột, bục nhất 96px, giữ gradient vàng); Electron thật: bục 3 bước với 300/200/100 → 🥇🥈🥉, cao 88>68>53px, người nhất `order:2`; trường hợp 2 bạn đồng hạng nhất + 1 bạn 0 điểm → 1,1,2 và đúng 1 huy chương bạc, không có đồng. Đo layout: đáy 3 bục thẳng hàng tại y=403, tổng rộng 1259 < viewport 1266, body không phải cuộn.

**Traps.** Đừng dùng `index + 1` làm thứ hạng khi có đồng hạng (lỗi đã mắc: ra 1, 1, 3). Đừng đặt huy chương theo vị trí DOM — DOM xếp 2, 1, 3 để bục giữa là người nhất, nên huy chương phải theo `entry.rank`. Tên học sinh là dữ liệu không tin cậy: luôn `escapeHtml`.

## #108 — Màn chơi Kho báu: bỏ nhãn xám "Chặng n", nút "Bối cảnh & Nhiệm vụ" lên trên dải nhiệm vụ

**Context.** Trên màn chơi Kho báu có hai chỗ nói cùng một điều: nhãn xám `Chặng 1` ở đầu cột chữ và huy hiệu `Chặng 1/3 · Chặng 1` dưới bức hình. Giáo viên khoanh đỏ nhãn xám và yêu cầu đưa nút mở pop-up "Bối cảnh & Nhiệm vụ chặng" lên **trên** dải `TRẮC NGHIỆM · CHẶNG 1/3 · 🏆 0 điểm`.

**Decision.**
- **Bỏ** `div.stage-kicker` trong cột chữ (nhãn xám trùng lặp). Huy hiệu chặng dưới hình và dải trên cùng giữ nguyên — chúng là nơi duy nhất báo vị trí chặng.
- Nút `#treasureStoryBtn` nằm trong `.treasure-story-row` **ngay trên** `.treasure-mission-badge`. Nội dung pop-up (`.treasure-story-*`) **không đổi** — vẫn mở đúng modal cũ.
- Khi trò chơi không có bối cảnh/nhiệm vụ thì không có nút, đúng như trước.

**Bẫy (đã mắc 2 lần khi làm việc này).** Ở chế độ **cửa sổ**, `.stage-col.is-main` là `display: contents` và `.stage-center` là **flex column căn giữa**; dải nhiệm vụ và câu hỏi được căn giữa bằng `margin: auto` hai bên. Vì vậy:
1. Một `<div>` bọc ngoài trở thành **flex item riêng** ⇒ nút bị đẩy sang lề trái (đo được x=232 trong khi dải ở x=483). Phải cho hàng cũng căn giữa (`justify-content: center`, `width: fit-content`, `margin-inline: auto`).
2. `display: contents` trên hàng làm cả nút lẫn hàng không còn hộp riêng ⇒ không đặt `margin` lên chúng. Đã dùng `display: flex` cho hàng ở cả hai chế độ.
3. Nút daisyUI có line-height lớn hơn hộp ⇒ chồng 7px lên dải; thêm `margin-bottom: 8px`.
Ở **toàn màn hình** `.treasure-stage-grid` là grid 2 cột nên hàng căn trái theo cột; cả hai chế độ đã đo khớp tim (cx) với dải.

**Verification.** `npm run check` 0; `node tests/run-unit.js` 58/58; `check:renderer-globals` 0 undefined; `verify:css` **17/17** (thêm 2 invariant: hàng căn giữa + khoảng cách 8px). Electron thật, toàn màn hình: nút ở 567–823 × 204–249, dải 567/260 ⇒ trên dải, thẳng trái với dải; pop-up vẫn mở. Cửa sổ: nút cx=624 = cx của dải = cx của câu hỏi, chồng 0px. Hồi quy: `ui-race-treasure-check` 18/18, `ui-stage-illustration-check` **169/169**.

**Traps (chung).** Không đoán phần tử từ ảnh khoanh đỏ — đo DOM thật (`getBoundingClientRect`) rồi mới sửa; ba chỗ đều có chữ "Chặng 1". Khi thêm phần tử vào cột `is-main`, luôn kiểm cả cửa sổ **và** toàn màn hình, vì hai chế độ dùng hai cơ chế layout khác nhau.

## #109 — Hàng đầu sân khấu Kho báu: nhãn thế giới bên trái, nút "Bối cảnh & Nhiệm vụ" bên phải

**Context.** Ở #108 nút "📜 Bối cảnh & Nhiệm vụ chặng" được đặt trong `.stage-col.is-main` (cột chữ). Giáo viên muốn nó nằm cùng hàng với nhãn thế giới "HÀNH TRÌNH KHÁM PHÁ": nhãn **bên trái**, nút **bên phải**.

**Decision.**
- Thay `<div class="flex">` (chỉ chứa nhãn + nút, không có `justify-content`, `flex` mặc định `row` nhưng không giãn) bằng `.treasure-head-row`: `display:flex; justify-content:space-between; align-items:center; align-self:stretch; width:100%; flex-wrap:wrap`.
- Nhãn thế giới bọc trong `.treasure-head-world` (`display:flex`, `min-width:0` để tag dài co lại thay vì đẩy nút).
- Nút nằm trong `.treasure-story-row`, chuyển **ra khỏi** `.stage-col.is-main` — hết phụ thuộc vào `display:contents` của cột đó.
- Bỏ toàn bộ rule `.treasure-story-row` / `.treasure-story-trigger` kiểu `display:contents`/`justify-content:center`/`margin-auto` của #108: chúng chỉ tồn tại vì nút nằm trong cột chữ. Nay chỉ còn `.treasure-head-row`, `.treasure-head-world`, `.treasure-story-row` đơn giản.
- `flex-wrap: wrap` giữ cho màn hẹp: khi không đủ chỗ nút xuống dòng thay vì tràn ngang.

**Verification.** `npm run check` 0; `npm run build` 0; `node tests/run-unit.js` 58/58; `check:renderer-globals` 0 undefined; `verify:css` **17/17** (2 invariant mới: `space-between` + `align-self:stretch`). Electron thật 10/10: cửa sổ → nhãn x=232 = row.x, nút right=1017 = row.right, cùng tâm dọc (202–235 vs 196–241), rộng bằng `stage-top`; toàn màn hình → x=45 / right=1221 khớp row; pop-up vẫn mở; không có bối cảnh thì nút biến mất, nhãn còn. Hồi quy: `ui-race-treasure-check` 18/18, `ui-stage-illustration-check` 169/169.

**Traps.** `align-items:center` căn theo **tâm**, nên hai phần tử cao khác nhau có `y` lệch nhau vài px — khi kiểm bằng test thì so `y + height/2`, không so `y`. `.game-stage` có padding ngang lẻ (37.98px) nên bề rộng hàng lệch ~1px so với hộp ngoài: so với sibling `.stage-top`, không so với `parent.width`. Hàng nằm trong flex column căn giữa, nếu thiếu `align-self:stretch` thì `space-between` vô nghĩa vì hàng co về độ rộng nội dung.

## #110 — Ghép cặp kiến thức: ghép xong thì DỪNG lại, chỉ hiện điểm khi bấm "Xem kết quả"

**Context.** Trước đây cặp cuối được ghép là `setTimeout(renderMatchingResults, …)` chạy sau 0.5–0.8s: bàn ghép (và các đường nối vừa vẽ) biến mất, điểm hiện ngay. Giáo viên cần một nhịp dừng để cả lớp nhìn lại các đường nối và cùng giải thích mối quan hệ giữa hai nội dung của mỗi cặp.

**Decision.**
- Ba chỗ gọi (`evaluateColumnMatch` cột, `onMemoryCardClick` lật thẻ, `onCategorizeCardClick` phân loại) và nhánh trong `renderMatchingBoard()` đổi từ `renderMatchingResults` sang **`showMatchingComplete()`**.
- `showMatchingComplete()` **không dựng lại bàn**: chỉ cập nhật header và chèn thanh `.matching-complete-bar` (`data-matching-complete`) ở đầu `.game-stage`, gồm chữ hướng dẫn + nút **"Xem kết quả →"** (`#matchingResultsBtn`). Giữ nguyên DOM để đường nối cuối cùng vẫn nhìn thấy.
- Điểm, phần trăm và **việc lưu phiên** chỉ xảy ra trong `renderMatchingResults()` (gọi `wireResultSession`), tức là sau cú bấm. Một cú ghép nhầm hay bấm nhầm không thể làm mất nhịp thảo luận.
- **Không gửi `isComplete: true`** cho máy chiếu ở màn dừng: `buildPresentationView()` đổi sang `buildResultsView()` khi có cờ đó, nên máy chiếu sẽ lộ điểm ngay. Máy chiếu tiếp tục chiếu bàn ghép đã hoàn thành.
- `renderMatchingBoard()` khi `matched >= pairs.length` cũng gọi `showMatchingComplete()` (idempotent: đã có thanh thì không thêm), để lần vẽ lại không nhảy thẳng sang bảng điểm.
- "Chơi lại" (`#replayBtn`) và `resetMatchingPlay()` đặt `matched = 0` trước khi vẽ, nên không vướng nhánh dừng.

**Verification.** `npm run check` 0; `npm run build` 0; `node tests/run-unit.js` **58/58**; `check:renderer-globals` 0 undefined; `verify:css` 17/17. Electron thật `tests/ui/ui-matching-finish-check.js` **22/22**: ở cả 3 chế độ (hai cột / lật thẻ / phân loại), ghép đủ 4/4 cặp **bằng cú bấm thật** → có thanh + nút "Xem kết quả →", bàn ghép còn nguyên, **không có markup điểm nào**; bấm nút → hiện `470 / 470 điểm`, thanh biến mất; vẽ lại bàn đã xong → vẫn dừng ở nút. Hồi quy: `ui-race-treasure-check` 18/18, `ui-play-surface-check` 154/156 (2 lỗi tràn quiz có từ trước, không liên quan).

**Traps.** Khi viết test cho luồng này, phải **bấm thẻ thật**: `playGame()` gọi `resetMatchingPlay()` nên gán `state.matchingPlay.matched` trước đó bị xoá về 0 (đã mắc khi viết probe đầu tiên). Đừng thêm `isComplete: true` vào `sendPresentationState()` của màn dừng. Nếu sau này thêm chế độ ghép mới, nhớ đổi cả nhánh `renderMatchingBoard()` và chỗ gọi khi ghép cặp cuối.

## #111 — Phân luồng đầu vào & chặn gọi AI thừa (update_quy_trinh §2–§7)

**Context.** Spec `docs/archive/specs/update_quy_trinh.txt` yêu cầu: không phân tích AI nếu tác vụ không cần suy luận, không bắt buộc gọi AI để chuẩn hóa dữ liệu có cấu trúc, không tự sửa nội dung giáo viên, đổi thể loại không sinh lại toàn bộ. Khảo sát cho thấy 3 khoảng trống: wizard luôn chạy `analyze`; `lesson:generate` **bắt buộc** `analysisId`; đổi thể loại xoá draft rồi để AI sinh lại (vì `gameType` nằm trong cache key).

**Decision.**
- **Phân loại bằng quy tắc, không LLM** (`services/input-classifier.ts`): đếm tỉ lệ *dòng thuộc khối câu hỏi* (prompt + phương án + đáp án), không phải tỉ lệ dòng prompt. Kết luận `questions` khi ≥ 2 câu trọn vẹn **và** tỉ lệ khối ≥ 0.8 **và** > 0.4; ngược lại là `lesson`. Chưa chắc chắn → `ambiguous`, và `resolveInputKind()` **luôn quy về `lesson`** (hành vi cũ), nên đoán sai không bao giờ làm mất bước phân tích.
- **Bước 1 có vùng chọn** `Tự phát hiện | Giáo án / tài liệu | Danh sách câu hỏi` + dòng "Hệ thống nhận diện: …" kèm lý do; nhãn nút Tiếp tục đổi theo nhánh.
- **Nhánh B bỏ qua `analyze` và `recommend`** (cả hai cần `LessonAnalysis`), đi thẳng tới `configure` với `analysisId = null` và draft dựng từ câu hỏi của giáo viên. `lesson:generate` thêm nhánh: không có `analysisId` **nhưng** có draft cùng thể loại với config ⇒ chuyển draft → `toEducationalGame` → validate → lưu, trả `{ source: 'imported-questions', cached: true }`, **không gọi model**.
- **Chuyển đổi cục bộ khi đổi thể loại** (`services/draft-convert.ts`): `arena ⇄ treasure ⇄ race` chuyển 1:1 (giữ nguyên câu chữ, phương án, đáp án, lời giải); `matching`/`scenario` và chiều ngược lại **không** chuyển được (cần quan hệ hai chiều / bối cảnh-hệ quả) → trả `gaps` nêu lý do. Chỉ hỏi giáo viên **một lần** khi có `gaps`; OK = dùng phần đã chuyển, Cancel = mới gọi AI sinh mới.
- **Không bịa lời giải.** Schema draft bắt buộc `explanation`; câu thiếu `Giải thích:` được báo là `issue` (`needsTeacherInput`) chứ không điền hộ (spec §4.3).
- **Không thêm hệ dữ liệu song song.** Dùng lại `GameProject.draft`, `GameQuestion`, `toEducationalGame`, `checkDraftQuality`, `aiTasks`, cache hiện có. Không đổi `buildAnalysisCacheKey` / `buildGenerationCacheKey`.
- **Ngoài phạm vi** (đã chốt): trường nguồn gốc/xác minh trong schema, UI "gốc vs AI đề xuất", nhập ảnh từ file câu hỏi.

**Verification.** `npm run check` 0 · `npm run build` 0 · `node tests/run-unit.js` **60/60** (mới: `input-classifier` 13, `draft-convert` 14) · `check:renderer-globals` **0 undefined** (35 script, 576 hàm) · `verify:css` 17/17. Electron thật, `tests/ui/ui-input-routing-check.js` **20/20**: câu hỏi soạn sẵn được nhận diện, **0 lần gọi `analyzeLesson`**, có draft 3 câu, `lesson:generate` trả `imported-questions` giữ đủ 3 câu, arena→treasure giữ 3 chặng, arena→matching bị từ chối kèm lý do, giáo án vẫn đi đường phân tích. Hồi quy: `ui-race-treasure-check` 18/18, `ui-matching-finish-check` 22/22, `ui-play-surface-check` 154/156 (2 lỗi tràn quiz có từ trước).

**Traps.**
- **`check:renderer-globals` KHÔNG bắt được lỗi gọi tên ES module từ renderer** — nó chỉ kiểm tra "hàm có được khai báo". Đã gọi `inputKindLabel()` (module) từ `step-input.ts` và app crash runtime. Renderer là script toàn cục: phải qua IPC hoặc khai báo lại cục bộ (`wizardInputKindLabel`).
- Bước 1 phân loại qua IPC `lesson:classify-input` (debounce 450ms) và **chỉ patch** khối picker (`outerHTML`), không `render()` cả trang — render lại sẽ mất con trỏ trong textarea.
- `aiTasks.start` từ chối `requestId` đã theo dõi ("đang được theo dõi"); test phải dùng id duy nhất.
- Fixture test cho `parseQuestionsFromText` phải có `Giải thích:` thì `complete` mới là `true`; thiếu dòng đó là `issue` đúng thiết kế.
- Nhánh `questions` **mặc định về arena** ở bước 4; muốn `matching`/`scenario` từ câu hỏi soạn sẵn cần nội dung khác — hệ thống báo rõ, không tự bịa.

## #112 — Sửa 2 lỗi CRITICAL + 3 WARNING từ code review

**Context.** Review `/review uncommitted` trên bản LAN + phân luồng đầu vào phát hiện 2 lỗi CRITICAL, 5 WARNING, 2 SUGGESTION. Đã sửa CRITICAL + các WARNING chính (theo lựa chọn của người dùng). Hai SUGGESTION (CSP `frame-ancestors`, dead code nhỏ) để đợt sau.

**Fixed.**
- **CRITICAL — kho báu chơi LAN không bao giờ kết thúc.** `lanAdvanceRound()` chỉ có ở nút "Câu tiếp theo" của quiz và "Tiếp tục" của kho báu. Bấm "Kết thúc hành trình", hết chặng cuối, hay chọn nhánh rẽ thì phòng vẫn `question` ⇒ học sinh không thấy kết thúc và **bục vinh danh không bao giờ hiện**. Đã thêm kênh `LAN_CHANNELS.FINISH` (`lan:finish`), `lanFinishRoom()` trong renderer, và gọi ở `renderResults`, `renderMatchingResults`, `renderTreasureResults`, cùng các nút branch/finish/end.
- **CRITICAL — Cancel ở hộp thoại đổi thể loại xoá bài của giáo viên.** `wizardConvertOrDiscardForGenre` trả **draft thể loại cũ** khi giáo viên Cancel; caller coi là "đã chuyển" và gán nó với config thể loại mới ⇒ guard stale xoá nội dung. Nay trả kết quả phân biệt `{ kind: 'converted' | 'restart' | 'cancelled' }`; caller `return` sớm khi `'cancelled'` (không đổi thể loại, không đổi draft, không đổi config).
- **WARNING — CORS phản chiếu mọi Origin.** `cors: { origin: true }` đã **kiểm chứng bằng request thật**: `Origin: http://evil.example` được trả `Access-Control-Allow-Origin: http://evil.example`. Nay `origin: false`; kiểm lại: không còn header ACAO ⇒ trình duyệt chặn cross-origin (trang phone là same-origin nên không ảnh hưởng).
- **WARNING — socket không có giới hạn tần suất.** Thêm token bucket theo socket: `lan:join`/`lan:rejoin` (6 lần, nạp 0.5/s), `lan:answer` (20 lần, nạp 4/s). Trả `too-many`; phone đã biết hiển thị lỗi.
- **WARNING — `close()` có thể treo, `before-quit` không thoát.** Thêm `httpServer.closeAllConnections()` (Node ≥18.2) trước `close()`, race 2s cho `close()` và 2.5s cho `shutdownLanForQuit()` ở `before-quit`. Bỏ `void stopLanSession('quit')` trong `unregisterLanIpc()` — nó chạy song song với teardown được await, tạo hai đường đóng và làm `lanServerIsRunning()` sai thời điểm.
- **WARNING — `wizardReset()` bỏ sót state mới** ⇒ rò `inputKind`/`importedQuestions` sang dự án mới (đi nhầm nhánh B với nội dung cũ). Đã reset cả bốn trường.
- **WARNING — `convertDraft` nhận `target` lạ.** Chuỗi lạ rơi vào nhánh `toTreasure` (đã kiểm chứng với `'constructor'`). Nay kiểm `WORKFLOW_GAME_TYPES` ở cả `main.ts` (biên IPC) và `convertDraft`, trả gap `unknown-target`.
- **WARNING — chuyển sang kho báu với 1 câu trả `complete: true`** nhưng schema cần `stages.min(2)`, nên draft lưu được rồi vỡ ở generation. Nay trả `draft: null` + gap `too-few-items` (áp cho cả `matching` < 2 cặp).

**Verification.** `npm run check` 0 · `npm run build` 0 · `node tests/run-unit.js` **60/60** (`draft-convert` 16, thêm 2 test cho target lạ và treasure 1 chặng) · `check:renderer-globals` 0 undefined (577 hàm) · `verify:css` 17/17. Electron thật: `ui-lan-treasure-finish-check` **5/5** (trước khi sửa phòng kẹt ở `question`; nay `finished` + bục hiện) · `ui-wizard-cancel-genre-check` **7/7** (Cancel giữ nguyên thể loại + 2 câu; OK vẫn chuyển arena→treasure 2 chặng) · `ui-input-routing-check` 20/20 · `ui-lan-card-start-check` 12/12 · `ui-matching-finish-check` 22/22 · `lan-smoke` 19/19 · `ui-race-treasure-check` 18/18 · `ui-play-surface-check` 154/156 (2 lỗi tràn quiz có từ trước).

**Không sửa (để đợt sau).** CSP chưa có `frame-ancestors 'none'` / header `X-Frame-Options` (clickjacking trên cùng mạng); dead code nhỏ (`LAN_UI.attachToResults`, kiểu `LanChannel`/`LAN_START_CHANNEL_RESULT` không dùng ngoài file định nghĩa).

**Traps.**
- `unregisterLanIpc()` **không** được tự đóng phòng: việc đóng nằm ở `shutdownLanForQuit()` mà `before-quit` await, sau khi đã kiểm `lanServerIsRunning()`.
- Mọi đường kết thúc trò chơi phải gọi `lanFinishRoom()`; đường nào quên thì phòng LAN sẽ treo ở `question` (đúng lỗi CRITICAL vừa sửa).
- `convertDraft` phải tôn trọng mức tối thiểu của schema (`treasure` ≥ 2 chặng, `matching` ≥ 2 cặp) — trả `complete: true` với ít hơn sẽ nổ muộn ở generation.
- Finding "lanProfileFor fail-open" và "finish không ghi lượt cuối" do sub-agent báo đã **kiểm lại và sai** — `lanProfileFor` fail-closed, `finish` chỉ bỏ qua khi `next-round` đã ghi.

## #113 — Phân loại đầu vào 4 nhóm + lớp xác nhận MiniLM + đo thời gian bước (update_quy_trinh_2)

**Context.** Spec `docs/archive/specs/update_quy_trinh_2.txt` yêu cầu phân loại theo 4 nhóm, dùng MiniLM có kiểm soát, cảnh báo Path C, và đo hiệu năng. Audit cho thấy chỉ có `lesson`/`questions`, chưa đo thời gian bước, Path C không nói AI sẽ viết gì. Quyết định với người dùng: **luôn chạy MiniLM** nhưng **quy tắc trước, MiniLM chỉ xác nhận**; không chặn giáo viên, không tự tải model.

**Decision.**
- **Nhánh `outline`** (`input-classifier.ts`): có ≥ 2 tiêu đề mục, ≤ 1 đoạn văn dài, < 2 câu hỏi, trung bình ≤ 90 ký tự/dòng. Ngưỡng là hằng số có tên (`OUTLINE_MIN_MARKERS`, `OUTLINE_MAX_PROSE_BLOCKS`, `OUTLINE_MAX_CHARS_PER_LINE`) để test chốt biên.
- **`outline` là *nhãn*, không phải đường thứ ba.** `resolveInputKind()` vẫn chỉ trả `questions | lesson`, nên dàn ý đi đường phân tích giáo án hiện có — không mở nhánh AI mới, không đụng Fast/Think.
- **MiniLM là lớp xác nhận** (`input-classifier-semantic.ts`, thuần): chỉ lật khi (1) quy tắc có độ tin cậy `< 0.8`, (2) mô hình thích nhóm khác, (3) chênh ≥ `SEMANTIC_FLIP_MARGIN = 0.08`. Ba điều kiện này là chống dao động; test có ca sát biên.
- **Cổng an toàn bắt buộc khi lật sang `questions`**: chỉ cho lật nếu `parseQuestionsFromText(text)` nhận ra **≥ 2 câu**. Lý do là lỗi đo được trong app: câu văn ngắn "Quang hợp là quá trình…" bị lật thành `questions` với **0 câu hỏi**, đủ để đẩy giáo viên vào nhánh bỏ qua phân tích mà không có gì để nhập.
- **Không dùng Qwen ở bước 2.** Chỉ `ensureEmbeddingRuntime()` (process embedding riêng, tái dùng nếu đã chạy). Lỗi/chưa cài ⇒ giữ kết quả quy tắc và trả `semantic: 'unavailable'` để UI nói đúng sự thật.
- **Cache phân loại** (`buildClassificationCacheKey`): `CLASSIFIER_VERSION` + embedding model id + sha256 văn bản + độ dài. Chỉ trong bộ nhớ (giới hạn 50) — **không thêm migration** ở đợt này.
- **Path C**: hai hộp thoại đổi thể loại nay nêu rõ AI sẽ viết thêm gì (lấy từ `gaps`), và nói nội dung gốc vẫn được giữ trước khi thay bản nháp.
- **Đo hiệu năng**: `classify.done` (mới) ghi `ruleMs`/`semanticMs`/`totalMs`; `analyze.done` và `generate.done` thêm `durationMs`; `generate.from-questions` ghi `durationMs` để so với đường AI. Log đã có redaction, test xác nhận không lộ nội dung bài học.

**Verification.** `npm run check` 0 · `npm run build` 0 · `node tests/run-unit.js` **61/61** (mới: `input-classifier-semantic` 15; `input-classifier` +6 = 19; `lesson-cache` +6 assertion) · `check:renderer-globals` 0 undefined (579 hàm) · `verify:css` 17/17.
Electron thật: `ui-classifier-outline-check` **14/14** — dàn ý ⇒ `outline`, vẫn đi đường phân tích, có thông báo §7, có lựa chọn "Dàn ý"; giáo án viết đủ không bị cảnh báo dàn ý; câu hỏi soạn sẵn vẫn "Dùng câu hỏi có sẵn"; **câu văn ngắn không bị lật** vào nhánh câu hỏi.
Đo thật trong app: phân loại lần đầu (có MiniLM) **252 ms**, lần sau (cache) **1 ms**.
Hồi quy: `ui-input-routing-check` 20/20 · `ui-wizard-cancel-genre-check` 7/7 · `ui-lan-treasure-finish-check` 5/5 · `ui-matching-finish-check` 22/22 · `ui-race-treasure-check` 18/18 · `lan-smoke` 19/19 · `ui-play-surface-check` 154/156 (2 lỗi tràn quiz có từ trước).

**Traps.**
- **`npm run check` KHÔNG bắt khai báo trùng `const` trong `src/main.ts`.** Tôi khai báo lại `analyzeStartedAt` và tsc báo sạch, nhưng app **crash ngay khi khởi động** (`Identifier ... already been declared`). `main.ts` lớn và có vùng `@ts-nocheck`; sau khi sửa phải **chạy app thật** hoặc kiểm cú pháp `dist/src/main.js`, đừng tin tsc một mình.
- Lật sang `questions` là thay đổi **có hệ quả** (bỏ qua phân tích, chuyển sang nhập câu hỏi) nên luôn kiểm bằng `parseQuestionsFromText` trước khi chấp nhận.
- `ambiguous` được "chốt" thành `lesson` ngay trong `confirmWithSemantics`, nên caller không phải gọi lại `resolveInputKind`.
- Kết quả cache trả `semanticMs: 0`; muốn có số MiniLM phải dùng văn bản mới (test dùng `Date.now()` trong nội dung).

## #114 — Sửa 14 finding từ code review (LAN + phân loại đầu vào)

**Context.** Review uncommitted trên bản LAN + phân luồng/MiniLM. 6 track (security, business logic, performance, deploy safety, duplication, dead code). Đã sửa **toàn bộ** 14 finding được chấp nhận, và **đính chính 3 finding sai**.

**Fixed.**
- **CRITICAL — Chuyển sang Kho báu không lưu được.** `toTreasure` đặt `intro`/`story`/`taskDescription` rỗng nhưng schema yêu cầu `nonEmpty`. Đo thật: `convertDraft` trả `complete: true` rồi `parseGameDraft` ném `STORE_INVALID_PROJECT`. Nay `convertDraft` từ chối target `treasure` khi nguồn không có narrative, trả gap `needs-narrative` (không bịa nội dung).
- **CRITICAL — Rò đáp án và điểm học sinh khác xuống điện thoại.** `phoneSnapshot` gửi nguyên `lastResult` (gồm `correctOptionId` + `perPlayer[]` của cả lớp) cho mọi máy khi lượt đóng. Nay gửi **theo từng người**: chỉ dòng của chính em đó, không có key.
- **WARNING — Socket chưa join vẫn nhận state.** `io.emit` cho mọi kết nối, kể cả client không có mã phòng, làm lộ `roomCode` (bí mật join duy nhất) + `prompt`. Nay có `joinedSockets` map; chỉ socket đã join nhận `lan:state`, và `roomCode` bị bỏ khỏi payload (phone lấy từ URL).
- **WARNING — Classifier và parser lệch nhau.** `Đáp án - B`, `Đáp án = B`, `Câu hỏi 1:` được classifier gọi là `questions` nhưng parser ra **0 câu**, khiến giáo viên bấm "Dùng câu hỏi có sẵn" rồi nhận "Chưa có câu hỏi nào dùng được". Nay `question-import.ts` import regex dùng chung từ `input-classifier.ts`; test mới chạy classifier rồi parser trên mọi fixture.
- **WARNING — Câu thiếu "Giải thích:" bị xoá nhưng thông báo nói ngược.** Nay câu được **giữ** (với `explanation: ''`) và báo issue; wizard chặn lưu kèm thông báo đúng ("Còn N câu chưa có Giải thích:"), không để schema nổ khó hiểu.
- **WARNING — Nhánh không-AI dựa chỉ vào `!analysisId`.** Thêm `GameProject.draftSource = 'imported-questions'` (field tuỳ chọn, zod bỏ qua nên không đổi schema lưu); `lesson:generate` chỉ bỏ qua model khi có cờ này.
- **WARNING — Phân loại chạy chồng.** Thêm `classifySeq`; kết quả cũ bị bỏ thay vì ghi đè `importedQuestions` của văn bản mới.
- **WARNING — Embed lại 12 anchor hằng số mỗi lần.** Cache vector anchor theo `model.id`.
- **SUGGESTION** — header `X-Frame-Options: DENY` + `frame-ancestors 'none'`; giới hạn `text` IPC ở 6.000 ký tự; xoá dead code (`LAN_UI.attachToResults`, `LanChannel`, `centroid`); dùng `LAN_START_CHANNEL_RESULT` trong `lan-ipc.ts`; thêm `engines.node >= 22.13`; `build.files` loại `@types/**`, `*.d.ts`, `*.map`, thư mục test khỏi asar.

**Đính chính (finding tôi kết luận SAI, không sửa code).**
- **`@types/node` thành package production KHÔNG phải lỗi lockfile.** Chuỗi `socket.io → engine.io → @types/ws → @types/node` đều là prod, nên npm bỏ `dev: true` là đúng. Rủi ro thật là typings vào asar, đã xử lý bằng `build.files` loại trừ.
- **`convertDraft` same-type passthrough không phải lỗ hổng**: caller (`wizardConvertOrDiscardForGenre`) đã chặn khi `source.gameType === target`, và renderer không tự gửi draft tuỳ ý.
- **`reconnect` token replay** hạ xuống không sửa: token 48 hex không đoán được; chỉ lộ nếu giáo viên chia sẻ URL có `?token=`.

**Verification.** `npm run check` 0 · `npm run build` 0 · `node tests/run-unit.js` **61/61** · `check:renderer-globals` 0 undefined (579 hàm) · `verify:css` 17/17 · `lan-smoke` **20/20** (thêm check "socket chưa join không nhận state").
Electron thật: `ui-classifier-outline-check` 14/14 · `ui-input-routing-check` **21/21** · `ui-wizard-cancel-genre-check` **8/8** · `ui-lan-card-start-check` 12/12 · `ui-matching-finish-check` 22/22 · `ui-lan-wiring-check` 7/7 · `ui-lan-treasure-finish-check` 5/5 · `ui-race-treasure-check` 18/18 · `ui-play-surface-check` 154/156 (2 lỗi tràn quiz có từ trước).

**Traps.**
- **Test mới "every draft the converter returns passes the store schema" bắt được 3 lỗi thật** mà test cũ bỏ sót (treasure narrative, `scenario` thiếu explanation, race thiếu đội). Giữ test này: nó kiểm bằng chính `parseGameDraft` mà `saveProject` dùng.
- **`tsc` không bắt khai báo `const` trùng trong script `@ts-nocheck`**; `tests/unit/renderer-load-order.test.js` bắt được (đã cứu lần này với `missingWhy`). Luôn chạy `npm test`, không chỉ `npm run check`.
- Khi thêm field vào `GameProject`, zod mặc định **bỏ qua field thừa**, nên field tuỳ chọn không cần migration — nhưng phải chắc store không dùng `.strict()`.
- Đổi hành vi chuyển đổi cần cập nhật cả UI check: `arena→treasure` giờ **bị từ chối có lý do**, `arena→race` là đường chuyển được.
## #115 — Ngân hàng câu hỏi linh hoạt + gợi ý thể loại theo dữ liệu thật

**Context.** Nhánh "câu hỏi soạn sẵn" (#111/#112/#114) nhận được ngân hàng A–D, câu nào thiếu đáp án/lời giải thì mất hoặc báo chung chung, thể loại luôn cố định `arena`, và câu 5–8 phương án hoặc Đúng/Sai/điền khuyết/trả lời ngắn bị hiểu sai. Đợt này **mở rộng parser** và **thêm bước chấm điểm tương thích**, không xây lại luồng.

**Quyết định.**
- **D1 — Không mở rộng `GameQuestion`.** `correctOptionId` chỉ một giá trị, `true-false` là một phát biểu. Câu nhiều đáp án (`multi-answer`) và nhiều phát biểu Đúng/Sai (`multi-tf`) được **nhận diện và đánh dấu `needs-review`**, không tách câu, không vào draft.
- **D2 — Không cắt phương án.** `answerOptionsSchema` là 2–6; câu 7–8 phương án giữ **đủ**, `status: 'incompatible'`, kèm cảnh báo "tối đa 6".
- **D3 — Parser mở rộng trong `question-import.ts`** (không parser thứ hai): nhãn A–H + `A1`/`a)`, phương án đánh số chỉ khi câu đã có ≥2 nhãn chữ, phương án nhiều dòng theo thụt lề, 7 loại câu (`multiple-choice`, `true-false`, `fill-in-blank`, `short-answer`, `multi-answer`, `multi-tf`, `matching`), ranh giới khối theo `QUESTION_BLOCK_START` và fallback nhóm-dòng-trống. Kết quả thêm `parsed: ParsedQuestion[]` (`kind`/`status`/`warnings`/`sourceLine`/`duplicateOf`); `questions`/`issues`/`complete`/`needsTeacherInput` giữ nguyên nghĩa.
- **D4 — Hai lựa chọn rõ ràng ở bước 1**: [A] "Tạo trò chơi ngay" (không AI) và [B] "Phân tích & thêm câu hỏi" (pipeline hiện có). Nút "Tiếp tục" của ngân hàng câu hỏi đi sang bước 3 (không lưu, không chuyển đổi) để giáo viên xác nhận thể loại.
- **D5 — Gợi ý thể loại bằng điểm tương thích thật** (`question-compatibility.ts`, thuần, O(N·5)): `arena` = trắc nghiệm/Đ-S/điền khuyết/trả lời ngắn; `race` = chỉ trắc nghiệm; `treasure`/`matching`/`scenario` = 0 từ câu hỏi (cần narrative/bối cảnh/quan hệ). `score = compatible*10 - needsReview*2 - incompatible`; game không phù hợp về cấu trúc chỉ **bị trừ**, không bao giờ thắng nhờ ngân hàng lớn. Không game nào dùng được ⇒ `null`, không chọn hộ.
- **Chuẩn hoá dùng chung** (`question-text.ts`): `decodeHtmlEntities` (số, thực thể có tên, `&aacute;`) và `normalizeQuestionLine` giữ **thụt lề đầu dòng** (thụt lề là tín hiệu phương án nhiều dòng; `.trim()` từng làm mất nó). Classifier và parser cùng dùng file này.
- **Regex dùng chung** trong `input-classifier.ts`: `ANSWER_LINE`/`ANSWER_VALUE_LINE` dựng từ một chuỗi hằng (không chép tay), neo theo **dòng** (bản cũ đòi `(?:^|\n)` nên gọi trên một dòng luôn sai), thêm `ĐA:`, `Đ&aacute;p &aacute;n:`; `MULTI_ANSWER_VALUE`, `PAIR_LINE`, `OPTION_NUMBER_LINE`. `OPTION_LINE` mở rộng A–H + `A1`.
- **Không bịa, không mất câu:** câu thiếu đáp án/phương án ở lại `parsed` với `needs-review` + issue; chỉ câu *chỉ thiếu lời giải* vẫn vào `questions` (giữ #114) và bị chặn lúc lưu; câu trùng giữ cả hai với `duplicateOf`.
- **Chuyển đổi (`draft-convert.ts`):** câu điền khuyết/trả lời ngắn → `race` trả gap `race-text-only` đúng nghĩa ("Đường đua chỉ nhận câu trắc nghiệm…"), câu >6 phương án trả `too-many-options`.
- **Đo:** `classify.done` thêm `parseMs`, `compatMs`; IPC `lesson:classify-input` trả thêm `compatibility` (renderer không import module ES).

**Không làm (ngoài phạm vi).** Không đổi 5 game engine, `.egame`, SQLite; không cắt phương án >6; không tách câu nhiều đáp án; không dùng MiniLM cho nhận diện câu; không đổi `game-recommender.ts`; không nhập ảnh.

**Verification.** `npm run check` 0 · `npm run build` 0 · `node tests/run-unit.js` **62/62** (thêm `question-compatibility.test.ts`; `question-import.test.ts` mở rộng 2/3/4/5/8 phương án, `A1`, chữ thường, phương án nhiều dòng, Đúng/Sai + `Đ/S:`, `multi-tf`, `multi-answer` (3 kiểu), điền khuyết, trả lời ngắn, ghép cặp, hỗn hợp 6 câu 4 loại, 5 cách viết "Đáp án", HTML entity, trùng câu, nhóm dòng trống, ngân hàng lỗi rải rác) · `check:renderer-globals` 0 undefined · `verify:css` 17/17.
Electron thật (cổng 9470): `ui-input-routing-check` **40/40** (thêm: mỗi câu có status, `compatibility` theo IPC, hai lựa chọn [A]/[B], bước 3 trước khi lưu, 5 thẻ thể loại, nhãn "Được đề xuất", đổi thể loại **không** convert/generate, tiếp tục từ bước 3 không generate, [A] vào configure không gọi `analyzeLesson`, [B] sang bước phân tích và giữ 3 câu) · `ui-classifier-outline-check` 14/14 · `ui-wizard-cancel-genre-check` 8/8 · `ui-race-treasure-check` 18/18 · `ui-play-surface-check` **154/156** (2 lỗi tràn quiz có từ trước, baseline không đổi).

**Traps.**
- **Một "2. Câu kế tiếp" sau `Đáp án:` từng bị nuốt thành phương án** làm câu kế mất phương án. Quy tắc: số chỉ là phương án khi câu đã có ≥2 nhãn chữ **và chưa gặp dòng đáp án**.
- **`.trim()` từng dòng làm mất thụt lề**, nên "phương án nhiều dòng" không thể hoạt động; giờ chỉ cắt khoảng trắng cuối dòng và đổi tab/`&nbsp;` thành dấu cách.
- **`(?:^|\n)` trong regex đáp án** không bao giờ khớp khi parser kiểm từng dòng — đã neo `^` theo dòng.
- Câu có **một** phương án + "Đáp án:" là trắc nghiệm thiếu phương án (báo `options`), **không** phải trả lời ngắn; trả lời ngắn chỉ khi có `Trả lời:`/`Nêu`/ô trống.
- Renderer là script cổng (global) — mọi trạng thái mới là **dữ liệu thuần** trong `wizardState` (`parsedQuestions`, `questionCompatibility`, `draftOrigin`, `importedMode`), tính điểm ở main và trả qua IPC.

## #116 — Làm sạch ký hiệu khi nghi ngờ là ngân hàng câu hỏi

**Context.** Ngân hàng dán từ slide có `👉 Đáp án đúng: B` và các phương án nằm cùng dòng với đề không được nhận (#115 chỉ đọc nhãn ở đầu dòng). Người dùng chốt hướng: **không** thêm regex nhận diện emoji; thay vào đó **làm sạch** nội dung khi tài liệu giống mẫu câu hỏi, rồi mới chạy quy tắc hiện có.

**Quyết định.**
- **D1 — Làm sạch theo mẫu, không theo ký tự.** Chỉ bỏ ký hiệu ở **biên**: đầu dòng và ngay trước nhãn phương án/đáp án/giải thích/trả lời. Dùng **lớp Unicode** (`\p{S}` cho emoji/đầu mũi tên, cùng `\p{P}` trong cụm ngắn trước nhãn như `-`, `•`, `※`, `§`, `*`), không có bảng emoji nào phải bảo trì.
- **D2 — Không đụng giữa nội dung.** `→` trong `6CO2 + 6H2O → C6H12O6`, `Việt Nam → châu Á`, `5 ★ sao` giữ nguyên. Chỉ vùng biên bị làm sạch.
- **D3 — Cổng theo hình dạng.** `looksLikeQuestionBankText` (dùng chính `QUESTION_START`/`OPTION_LINE`/`ANSWER_LINE`) quyết định có làm sạch hay không: một câu hoàn chỉnh (đáp án + ≥2 phương án) hoặc ≥2 dòng câu hỏi. Văn xuôi giáo án giữ nguyên định dạng, kể cả `✅ Mục tiêu`.
- **D4 — Làm sạch trước, tách sau.** `parseQuestionsFromText` làm sạch → `splitQuestionBlocks` → `splitInlineQuestion` (câu dán một dòng: cắt tại mỗi nhãn nếu có **≥2 nhãn phương án**). Guard: một `A.` lẻ trong câu không bị cắt; nhãn đáp án/giải thích chỉ cắt khi dòng đã có nhãn phương án hoặc dấu `?`.
- **D5 — Một chuỗi cho cả ba tầng.** `lesson:classify-input` (main) làm sạch **một lần** rồi đưa cùng chuỗi cho `classifyInput`, `parseQuestionsFromText`, `evaluateCompatibility`. Classifier và parser không còn mỗi bên tự làm sạch (đó là cách hai bên lệch nhau trước đây).
- **D6 — Một câu vẫn là ngân hàng.** `classifyInput` trả `questions` khi có đúng một câu hoàn chỉnh (đáp án + ≥2 phương án, không tiêu đề mục, không đoạn văn). Dòng thuộc khối câu hỏi không còn bị đếm là "đoạn văn dài" (`markBlockLines`). Nếu classifier vẫn không chắc, wizard dùng câu đã nhận diện (`wizardHasRecognizedQuestions`) để đi nhánh câu hỏi, không rơi vào lỗi "Chưa chọn phần nào trong cấu trúc tài liệu".
- **D7 — Câu chỉ thiếu lời giải vẫn dùng được.** `wizardUsableParsed` nhận câu `needs-review` nếu **mọi** cảnh báo của nó là "Giải thích"; khi lưu, wizard chặn với "Còn N câu chưa có Giải thích" (#114) thay vì báo "Chưa có câu hỏi nào dùng được".
- **D8 — HTML entity:** `decodeHtmlEntities` giải mã **lặp có giới hạn** (3 lượt) để `&#272;&aacute;p &aacute;n` (số + tên trong cùng từ) decode hết; bảng tên có đủ chữ Latin-1 và ký hiệu Word hay dùng.

**Không làm.** Không đổi schema `GameQuestion`, không đổi 5 engine, không tự sinh "Giải thích", không làm sạch nội dung văn xuôi.

**Verification.** `npm run check` 0 · `node tests/run-unit.js` **63/63** (thêm `tests/unit/question-text.test.ts`) · `check:renderer-globals` 0 undefined · `verify:css` 17/17 · Electron: `ui-input-routing-check` **49/49** (thêm: ngân hàng slide của người dùng, một câu duy nhất vẫn đi nhánh câu hỏi không gọi model), `ui-classifier-outline-check` 14/14, `ui-wizard-cancel-genre-check` 8/8, `ui-race-treasure-check` 18/18, `ui-play-surface-check` 1920×1080 toàn bộ PASS (cấu hình 1366×768 và các độ phân giải sau bị cắt do timeout khi chạy, không phải lỗi kiểm tra).

**Traps.**
- Regex nhãn phải **neo đầu dòng**; `ANSWER_LINE.test(lines.join("\n"))` chỉ khớp dòng đầu và thiếu `\n` cuối nên luôn sai — đếm **từng dòng**.
- Một `A.` trong câu văn (`… đa chiều`) khớp nhãn nếu không kiểm "đầu từ": dùng lookbehind `(?<![\p{L}\p{N}])` cho nhãn giữa dòng.
- Regex có cờ `g` giữ `lastIndex`: dùng `match`/`matchAll` trên chuỗi con thay vì `test()` lặp lại trên regex dùng chung.
- Làm sạch phải chạy **trước** khi tính độ dài/thụt lề (classifier đếm trên dòng sạch; `splitInlineQuestion` tự làm sạch dòng của nó).
## #117 — Đáp án không lẫn vào câu hỏi; ngân hàng câu hỏi tạo xong không qua AI

**Context.** Giáo viên báo: (1) hệ thống đọc dòng "Đáp án" như một phần câu hỏi/nội dung; (2) khi chọn [A] "Tạo trò chơi ngay" ở bước 3, app vẫn đi qua bước cấu hình với Fast/Thinking và nút "Tạo nội dung", trong khi đáng lẽ phải đi thẳng bước 4, ẩn hai chế độ AI và nút tiếp tục là "Lưu vào thư viện".

**Quyết định.**
- **D1 — Đáp án tách khỏi phương án.** `splitTrailingAnswer` cắt nhãn đáp án nằm sau nội dung phương án (`B. Huế  Đáp án: B`) trước khi đọc phương án; `stripTrailingAnswer` bỏ ký hiệu và nhãn thứ hai khỏi giá trị đáp án (`D ✅ Đáp án: D` → `D`).
- **D2 — Đáp án theo chữ cái có ranh giới từ.** `answerLetters` chỉ lấy nhãn đứng riêng (`(?![a-zà-ỹ])`), nên `Ba` / `Có` không bị đọc là `B` / `C`; đáp án theo nội dung (`Đáp án: Ba`) và đáp án lặp nội dung (`Đáp án đúng: C (Ba)`) giải bằng một trong hai.
- **D3 — Dòng chỉ có nội dung phương án là đáp án, nhưng chỉ khi chưa có đáp án nêu đúng phương án đó.** "Đáp án: C" rồi "Ba" không phải đáp án thứ hai.
- **D4 — Nhánh câu hỏi đi thẳng bước 4.** `wizardUseImportedQuestions` lưu dự án rồi gọi `generateLessonDraft({ localOnly: true })` để dựng game từ draft — không gọi mô hình. Kết quả: bước cấu hình (bước 3) không có thẻ Fast/Thinking cho lần chạy này (thay bằng khối "KHÔNG DÙNG AI"), nút bước 4 là **"Lưu vào thư viện"**, không có "Tạo lại nội dung"/"Trò chơi khác".
- **D5 — `localOnly` chặn đường mô hình.** `lesson:generate` với `localOnly` không có draft soạn sẵn thì báo lỗi thay vì rơi xuống nhánh AI.
- **D6 — Thể loại khác arena** dựng bằng `convertLessonDraft` từ draft đã chuyển (đúng template) thay vì dùng adapter quiz.

**Verification.** `npm run check` 0 · build 0 · unit **63/63** (thêm 5 kiểm tra #117 trong `question-import.test.ts`) · globals 0 undefined · `verify:css` 17/17 · Electron: `ui-input-routing-check` **51/51** (bước 3 dựng game không gọi analyze, sang bước hoàn tất, [A] vào bước hoàn tất, ẩn Fast/Thinking, nút "Lưu vào thư viện"), `ui-classifier-outline-check` 14/14, `ui-wizard-cancel-genre-check` 8/8, `ui-race-treasure-check` 18/18.

**Traps.**
- `contextBridge` **đóng băng** `window.eduGame`: gán đè hàm để đếm lời gọi lặng lẽ không có tác dụng (đã làm mất thời gian điều tra). Test UI phải dựa vào **kết quả** (có game, không có analysisId) chứ không bọc bridge.
- Nhánh ngân hàng phải **lưu dự án trước** khi gọi `lesson:generate`: main gắn game vào dự án đã lưu.
- Chỉ draft `gameType: arena` mới là game quiz đúng template cho đường local; các thể loại khác phải đi `convertLessonDraft`.
## #118 — Nhập gói `.egame` (không chỉ xuất)

**Context.** Thư viện có "Xuất game" nhưng không có chỗ nhập: nút/action `import-game` đã có trong `controller.ts` nhưng chỉ hiện toast "tạm thời chưa mở", và IPC `files:import-game` tự parse JSON + validate trong `main.ts` nên không kiểm thử được. Kết quả: gói `.egame` xuất ra không thể mang sang máy khác nhập lại — trái với mục tiêu "sao chép trò chơi sang máy khác" trong trợ giúp.

**Quyết định.**
- **D1 — Có lối vào thật** ở "Thư viện trò chơi" ("⇧ Nhập gói .egame" cạnh "Xuất game") và ở Cài đặt, cùng đi qua `data-action="import-game"`.
- **D2 — Luật đọc gói nằm trong `src/services/game-package.ts`** (thuần, không Electron): `readGamePackage(text, newId)`, `stripImportedAssetUrls`, `IMPORT_GAME_MAX_BYTES` (20 MB). Handler `files:import-game` chỉ mở hộp thoại, kiểm kích thước và gọi hàm này.
- **D3 — Chấp nhận cả hai hình dạng:** wrapper `{ packageFormat: 'edugame', packageVersion: 1, game }` (đúng thứ `files:export-game` ghi) và một đối tượng game trần (gói cũ).
- **D4 — Giữ đúng chuẩn khi lưu:** chạy `normalizeGame` (như editor/store), rồi 4 validator template (`validateScenarioGame`, `validateMatchingGame`, `validateTreasureHuntGame`, `validateRaceGame`) + kiểm tra câu quiz (≥2 phương án, đáp án khớp phương án, câu điền khuyết/trả lời ngắn có đáp án).
- **D5 — Giữ minh hoạ:** `normalizeGame` dựng lại câu hỏi và bỏ `illustrationAssetId`/`iconName`/`contentCategory`; `collectItemAssets` + `reattachItemAssets` gắn lại theo vị trí.
- **D6 — Mỗi lần nhập là một trò chơi mới:** id `imported-*` mới, bỏ `createdAt`/`updatedAt` của tác giả; nhập hai lần không ghi đè.
- **D7 — An toàn:** `src:`/`imageUrl`/`illustrationUrl`/… trỏ tới `http:`, `file:`, `data:` hay `//` bị **xoá hẳn** (game rơi về minh hoạ dựng sẵn); văn bản có nhắc URL thì giữ vì chỉ hiển thị. Kích thước >20 MB bị từ chối. Lỗi được trả bằng câu tiếng Việt ("Tệp .egame không phải JSON hợp lệ hoặc bị hỏng", "Gói trò chơi không hợp lệ: …"), không phải thông báo thô của JSON.parse hay validator.

**Ràng buộc phát hiện được.** `validateQuizAnswers` cần thiết vì 4 validator template không kiểm tra template `quiz` (quiz không có validator riêng).

**Verification.** `npm run check` 0 · `npm run build` 0 · `node tests/run-unit.js` **64/64** (thêm `tests/unit/game-package.test.ts`) · `check:renderer-globals` 0 undefined · `verify:css` 17/17 · Electron: nút "⇧ Nhập gói .egame" hiện ở Thư viện (kiểm qua CDP). **Chưa** tự động hoá hộp thoại chọn tệp (native dialog không điều khiển được từ CDP), nên luồng bấm nút → chọn tệp → lưu chưa có UI check.

**Traps.**
- `normalizeGame` (legacy, `@ts-nocheck`, CommonJS) **bỏ trường asset** và **sửa `correctOptionId` sai thành phương án đầu** — nếu quên, minh hoạ mất và gói lỗi được "chữa" im lặng. Test pin cả hai.
- Hộp thoại native chặn CDP `Runtime.evaluate` đang chờ: không có `await` trên `dialog.showOpenDialog` trong kịch bản kiểm thử.
## #119 — Thẻ trò chơi gọn lại, menu "•••", và xoá tài liệu giáo án

**Context.** Yêu cầu của giáo viên: (1) bỏ nút "Xuất game" ở thanh công cụ Thư viện; (2) mỗi thẻ trò chơi chỉ giữ "Chơi ngay" và "Toàn màn hình", còn **Chơi LAN, Chỉnh sửa, Xuất gói** gom vào nút **3 chấm**; (3) trang Giáo án cho **xoá tài liệu**.

**Quyết định.**
- **D1 — Thẻ chỉ còn hai hành động chính** (`play`, `play-fullscreen`). Menu "•••" (`role="menu"`, nút `data-menu-toggle`, panel `hidden`) chứa Chơi LAN (khi template LAN hỗ trợ), Chỉnh sửa, Xuất gói `.egame`, và — chỉ ở Thư viện — Xoá trò chơi (đỏ). Trang chủ dùng cùng `gameCard(g, i)` không `deletable` nên menu ở đó không có mục xoá.
- **D2 — Menu là popover, không phải `<details>`**: mở/đóng bằng `wireGameMenus` trong `controller.ts` (chỉ một menu mở tại một chỗ). Đóng khi: chọn một mục, click ra ngoài (listener document ở capture phase), Escape, hoặc đổi kích thước cửa sổ. `aria-expanded` cập nhật theo trạng thái; mục cuối "Đóng" là lối thoát bằng bàn phím.
- **D3 — Bỏ "Xuất game" ở thanh công cụ Thư viện**; xuất gói chuyển vào menu từng thẻ (và vẫn có trong Cài đặt). "Nhập gói .egame" giữ ở thanh công cụ.
- **D4 — Xoá giáo án**: `LessonStore.deleteDocument(documentId)` (đã có trong store từ trước nhưng chưa nối) được nối ra IPC `lesson:delete-document` → `window.eduGame.deleteLessonDocument`, nút "🗑 Xoá" trên mỗi thẻ giáo án. Xoá tài liệu, phân tích, gợi ý, chunks và tệp văn bản trên đĩa; **trò chơi đã lưu trong Thư viện giữ nguyên** (hộp xác nhận nói rõ), dự án đang dở của tài liệu không bị đụng tới.

**Trạng thái dữ liệu (kiểm tra).** Schema có `ON DELETE CASCADE` nhưng `lesson-store` **không** bật `PRAGMA foreign_keys`, nên store tự xoá con trước cha trong một transaction (đã có trong `deleteDocument`); không phụ thuộc vào cascade của SQLite. `deleteDocument` trả `Promise<boolean>` (giữ tương thích với `lesson-store.test.ts`), nhận tuỳ chọn `{ voidIO: true }` để test in-memory không chạm đĩa.

**Verification.** `npm run check` 0 · build 0 · `node tests/run-unit.js` **64/64** · `npm run test:native` (lesson-store) PASS · `check:renderer-globals` 0 undefined · `verify:css` 17/17 · Electron: thẻ chỉ còn `play`/`play-fullscreen` + menu chứa `lan, edit, export-game, delete`; menu mở khi bấm, đóng khi click ra ngoài; thanh công cụ không còn "Xuất game" nhưng còn "Nhập gói .egame"; mọi thẻ giáo án có nút xoá, bấm xoá → card biến mất, store không còn tài liệu, toast "Đã xoá “…”. `ui-input-routing-check` 51/51, `ui-classifier-outline-check` 14/14, `ui-wizard-cancel-genre-check` 8/8, `ui-race-treasure-check` 18/18.

**Traps.**
- `state.lessonLibrary` là **mảng** (`refreshLessonLibraryPage` gán `documents`), nhưng `lesson-plans.ts` đọc thêm dạng `.documents` — handler xoá phải xử lý cả hai, nếu không tên tài liệu là undefined và toast sai.
- `deleteLessonDocument` trả boolean, không phải `{ ok }`; toast cũ đọc `.ok` nên luôn báo "không tìm thấy" — test UI phát hiện.
- Menu popover phải ở document-level listener: listener theo trang bị gắn lại mỗi lần render và mất trạng thái khi đóng.
## #120 — Menu "•••" tự đóng khi chọn tính năng hoặc bấm ra ngoài

**Context.** #119 đã thêm menu, nhưng yêu cầu rõ hơn: menu phải **tự đóng** khi người dùng chọn một tính năng trong menu hoặc chọn bất kỳ chỗ nào khác.

**Quyết định.** Một hàm duy nhất `closeGameMenus()` (renderer/core/controller.ts) đặt `hidden` cho mọi menu và trả `aria-expanded="false"` cho mọi toggle; gọi ở mọi lối thoát:
- **Chọn một mục** — listener `[data-action]` của trang gọi `closeGameMenus()` **trước** `handleAction`, nên hành động (Chơi ngay, LAN, sửa, xuất, xoá) không để menu lơ lửng trên màn hình mới.
- **Click ra ngoài** — listener `document` ở capture phase; bỏ qua click trong `[data-game-menu-root]` (toggle tự xử lý, click trong menu do nhánh trên đóng).
- **Escape**, **cuộn trang** (`scroll` không bubble nên bắt ở capture), **đổi kích thước cửa sổ**, và **chuyển trang** (`navigate()`).
- Bấm lại "•••" vẫn đóng; chỉ một menu mở một lúc (toggle đóng hết trước khi mở menu của mình).

**Verification.** `npm run check` 0 · build 0 · globals 0 undefined · Electron: `tests/ui/ui-card-menu-check.js` **10/10** (mới, giữ lại làm hồi quy: thẻ chỉ có play/play-fullscreen, mở/đóng, click ngoài, Escape, cuộn, resize, chọn mục, chỉ một menu, đổi trang) · `ui-input-routing-check` 51/51 · unit **64/64**.

**Traps.** Listener "click ra ngoài" phải ở **document + capture**: listener gắn trên `#pageContent` bị thay mỗi lần `render()` và không thấy click ở topbar/blank area. `event.stopPropagation()` ở toggle không chặn được capture-phase listener của document, nên listener phải tự kiểm `closest('[data-game-menu-root]')`.
## #121 — Tác vụ AI: phân trang + chỉ giữ 30 tác vụ gần nhất

**Context.** Mục "Tác vụ AI" trong Cài đặt đọc tối đa 30 dòng một lần, không có phân trang, và bảng `ai_tasks` chỉ được prune thủ công (`pruneAiTasks`, mặc định 200) nên lịch sử lớn dần theo thời gian.

**Quyết định.**
- **D1 — Giữ đúng 30 tác vụ.** `AI_TASK_HISTORY_LIMIT = 30` trong `main.ts`; `recordAiTask` prune **sau mỗi lần ghi** (nên bảng không bao giờ vượt 30, kể cả khi app crash giữa phiên). `ai:tasks` cũng prune trước khi đọc để dọn bảng do bản cũ để lại.
- **D2 — Phân trang ở store**: `listAiTasks(limit, offset)` thêm `OFFSET`; `countAiTasks()` cho tổng số. IPC `ai:tasks` nhận `{ limit, offset, history }` và trả thêm `total`. `limit` bị chặn theo 30.
- **D3 — UI**: 10 dòng/trang, tối đa 3 trang; thanh điều hướng "← Trước / Sau →" + dòng "Trang X/3 · N tác vụ gần nhất (cũ hơn tự động xoá)". Nút "Làm mới" quay về trang 1. Tác vụ đang chạy (live) luôn hiện ở đầu danh sách.
- **D4 — Tự cập nhật**: khi trang Cài đặt mở, mỗi 5 giây chỉ đọc **live** (không đọc SQLite); nếu trạng thái live đổi thì quay về trang 1 và vẽ lại. Interval tự huỷ khi rời trang.

**Verification.** `npm run check` 0 · build 0 · globals 0 undefined · `npm run test:native` PASS (thêm kiểm tra phân trang 36 dòng: trang 10/10/6, không chồng lấn, offset âm = 0, quá cuối = rỗng, prune 30 xoá đúng 6 dòng cũ) · `node tests/run-unit.js` **64/64** · `verify:css` 17/17 · Electron (CDP 9491): `tests/ui/ui-ai-tasks-paging-check.js` **8/8** (mới), `ui-card-menu-check` 10/10, `ui-input-routing-check` 51/51.

**Traps.** `ai:tasks` trước đây dùng `limit` cho cả live lẫn history; live vẫn dùng `limit` nhưng history phải dùng `min(limit, 30)` — nếu không, "Làm mới" có thể xin 50 dòng lịch sử trong khi bảng chỉ còn 30. Mỗi `refreshAiTaskList` giữ một token để hai lần gọi chồng nhau không ghi đè danh sách mới bằng dữ liệu cũ.
## #122 — Trang Giáo án: phân trang + chọn nhiều để xoá

**Context.** Trang Giáo án đổ toàn bộ tài liệu vào một danh sách (máy hiện tại có 88 tài liệu) và chỉ xoá được từng tài liệu một. Kèm theo, ô chọn tài liệu ở khối "Hỏi đáp chuyên sâu" đọc `library.documents` trong khi `state.lessonLibrary` là **mảng** — ô chọn luôn rỗng (lỗi tìm thấy khi sửa trang này).

**Quyết định.**
- **D1 — Phân trang phía renderer**, 12 tài liệu/trang, có "← Trước", số trang bấm được, "Sau →", dòng "Trang X/Y · N giáo án"; bộ lọc tìm kiếm luôn đưa về trang 1. Danh sách vẫn tải toàn bộ một lần (tài liệu nằm trong SQLite, tổng nhỏ), nên không cần IPC phân trang.
- **D2 — Chọn nhiều**: mỗi thẻ có checkbox; thanh "Chọn tất cả trang này" chỉ tick các thẻ **đang hiển thị**; lựa chọn lưu trong `state.lessonSelection` (Set id) nên **không mất khi sang trang**; "Bỏ chọn" để xoá lựa chọn.
- **D3 — Xoá hàng loạt**: `LessonStore.deleteDocuments(ids)` chạy từng `deleteDocument` (dọn phân tích/gợi ý/chunks/tệp văn bản), trả `{ deleted, missing, failed }`; IPC `lesson:delete-documents` giới hạn 200 id/lần. Hộp xác nhận liệt kê tên (tối đa 5) và số phân tích sẽ mất, kèm câu "Trò chơi đã lưu trong Thư viện vẫn được giữ lại".
- **D4 — Không render lại khi tick**: `updateLessonSelectionUi` cập nhật thẻ/bộ đếm/nút mà không vẽ lại danh sách, để checkbox vừa bấm giữ focus. Chỉ hành động xoá/chuyển trang/tìm mới vẽ lại.
- **D5 — Reset khi tải lại danh sách**: `refreshLessonLibraryPage` đưa về trang 1 và xoá lựa chọn, nên id của lần tải trước không thể bị xoá nhầm.
- **D6 — Sửa lỗi ô chọn Hỏi đáp** (`library.documents` → `library`) và tách id ô tìm kiếm (`#lessonSearch` thay vì dùng chung `#librarySearch`).

**Verification.** `npm run check` 0 · build 0 · globals 0 undefined · `verify:css` 17/17 · Electron (CDP 9492): `tests/ui/ui-lessons-paging-check.js` **10/10** (mới: 12/trang, pager, chọn-trang, đếm, sang trang, giữ lựa chọn, xoá đúng 13 tài liệu đã chọn, xoá khỏi trang, reset lựa chọn) · `ui-card-menu-check` 10/10 · `ui-ai-tasks-paging-check` 8/8 · `ui-input-routing-check` 51/51.

**Traps.**
- `data-selected` chỉ có trên thẻ **của trang hiện tại**; test/đoạn mã đọc "đã chọn" phải lấy từ `state.lessonSelection`, không phải DOM.
- `node tests/run-unit.js` (toàn bộ) **bỏ qua** suite `lesson-store` (cần Electron ABI); chạy riêng bằng `npm run test:native`. Trong môi trường hiện tại lệnh đó dừng/timeout, nên phần test `lesson-store` của đợt này **chưa xác nhận được** — xem STATUS.
## #123 — Lịch sử kết quả: phân trang + chọn nhiều để xoá

**Context.** "Làm tương tự bên trang lịch sử kết quả": trang này đổ toàn bộ lượt chơi vào một bảng và không có cách xoá kết quả. Máy hiện tại có 91 lượt.

**Quyết định.**
- **D1 — Phân trang 15 lượt/trang** (bảng, nên nhiều hơn lưới thẻ), "← Trước / Sau →" + "Trang X/Y · N lượt chơi". Phân trang phía renderer vì `state.db.sessions` đã có toàn bộ (main đọc tối đa 1000 dòng).
- **D2 — Chọn nhiều**: checkbox mỗi dòng (cột riêng để không làm xô lệch bảng), "Chọn tất cả trang này" chỉ tick dòng đang hiện, lựa chọn lưu trong `state.sessionSelection` nên giữ khi sang trang; bộ đếm + nút "Xoá đã chọn (N)" và "Bỏ chọn" cập nhật qua `updateSessionSelectionUi` mà không vẽ lại bảng.
- **D3 — Xoá**: IPC mới `library:delete-sessions` (tối đa 1000 id/lần) xoá theo `id` trong một transaction của `better-sqlite3`; trả `{ ok, deleted, missing }`. **Không** đụng bảng `games`, giáo án hay kết quả khác; hộp xác nhận nói rõ "không thể khôi phục, trò chơi và giáo án vẫn được giữ nguyên".
- **D4 — Reset khi không còn trong danh sách**: `sessionSelectedIds` loại id không còn tồn tại, nên lựa chọn cũ không tồn tại sau khi xoá/tải lại.

**Verification.** `npm run check` 0 · build 0 · globals 0 undefined · `verify:css` 17/17 · Electron (CDP 9494): `tests/ui/ui-results-paging-check.js` **11/11** (mới: 15/trang, pager, chọn trang, đếm, sang trang, giữ lựa chọn, xoá đúng 16 lượt, trò chơi không đổi, dòng biến mất, reset) · `ui-lessons-paging-check` 10/10 · `ui-card-menu-check` 10/10 · `ui-ai-tasks-paging-check` 8/8 · `ui-input-routing-check` 51/51.

**Traps.**
- `better-sqlite3` transaction phải **đồng bộ**: `Array.reduce` với `run()` đôi khi trả giá trị không phải số trong lúc đang `preparing`; dùng vòng `for` và tạo statement bên trong transaction để kết quả luôn là số.
- `window.eduGame` bị **đóng băng** (contextBridge): không thể bọc `deleteSessions` để đếm. Kiểm thử phải dựa vào kết quả (số dòng còn lại, dòng rời trang).
- Fixture UI phải dùng **id riêng mỗi lần chạy**: id cố định `probe-session-N` từ lần chạy trước bị tính nhầm là "chưa xoá".
## #124 — Bước 5: câu hỏi và ảnh minh hoạ trong cùng một thẻ, tải ảnh từ máy

**Context.** Bước 5 hiển thị hai danh sách song song ("Từng mục" và "Minh hoạ từng mục") nên giáo viên phải tự ghép câu hỏi với ảnh theo thứ tự; và chỉ chọn được hình có sẵn, không tải được ảnh của mình. Yêu cầu: cho tải ảnh ngoài vào, và câu hỏi phải đi cùng ảnh.

**Quyết định.**
- **D1 — Một thẻ cho một câu** (`wizardItemCardsPanel`): đề bài, các phương án (đáp án đúng tô xanh), ảnh 16:10 ngay cạnh, nhãn nguồn ảnh ("Tự động" / tên chủ đề / "Ảnh tự tải lên"), và các nút của chính mục đó: **📷 Tải ảnh lên**, **🖼 Đổi hình có sẵn**, **Tự động**, **🔄 Tạo lại câu**. Hai danh sách cũ bị bỏ; dưới 640px thẻ xếp dọc, ảnh ở trên.
- **D2 — Ảnh do giáo viên tải được **copy vào thư mục dữ liệu** của app (`edugame-data/images/<id>.img`), chỉ lưu **id mờ** (`ci-` + 32 hex) trên mục. Lý do: tệp gốc có thể bị đổi tên/xoá/ở USB, mà trò chơi phải chơi offline sau này; và không lưu đường dẫn người dùng vào dự án.
- **D3 — Máy chủ ảnh riêng `edugame-file://`** (đăng ký privileged trước `whenReady`): chỉ phục vụ id đúng định dạng trong thư mục ảnh, kiểm tra đường dẫn nằm trong thư mục, MIME đọc lại từ **nội dung**. CSP thêm `edugame-file:` vào `img-src`; `file://` **không** được phép.
- **D4 — Kiểm tra tệp**: đuôi PNG/JPG/WEBP/GIF **và** magic bytes (tệp `.exe` đổi tên bị từ chối), ≤ 8 MB, lỗi báo câu tiếng Việt. Ghi ảnh dùng chính `lesson:patch-item-assets` (whitelist 3 trường asset) — đường ghi draft không mới.
- **D5 — `resolveStageIllustration`**: id `ci-…` thắng, kể cả ở chế độ `manual` (tải ảnh là lựa chọn rõ ràng); chế độ `off` vẫn không vẽ gì. `wizardArtSelectedAsset` giữ id tải lên (trước khi sửa, nó bỏ id lạ nên thẻ ghi "Ảnh tự tải lên" nhưng vẽ hình mặc định).
- **D6 — Dọn ảnh**: xoá trò chơi xoá các ảnh nó dùng **nếu** không trò chơi/draft nào khác còn trỏ tới; `files:delete-illustration` cho phép xoá một id hợp lệ.

**Verification.** `npm run check` 0 · build 0 · `node tests/run-unit.js` **65/65** (thêm `custom-illustration.test.ts`) · globals 0 undefined · `verify:css` 17/17 · Electron (CDP 9497–9499): `ui-item-art-check.js` **11/11** (mới) · `ui-input-routing-check` 51/51 · `ui-card-menu-check` 10/10 · `ui-lessons-paging-check` 10/10 · `ui-results-paging-check` 11/11 · `ui-ai-tasks-paging-check` 8/8. Bằng chứng riêng: tải PNG thật → `<img src="edugame-file://img/ci-…">` **load ok 1x1**; tệp giả `.png` bị từ chối "Tệp không phải ảnh hợp lệ"; id lạ / `..%2F` trả lỗi; sau khi chạy check, thư mục ảnh trống.

**Traps.**
- `fetch()` trên `edugame-file:` bị chặn (đúng thiết kế) — kiểm tra phải dùng `<img>`, không dùng fetch.
- Id tải lên **không** phải `*-scene`; mọi helper lọc theo `wizardArtSceneCategories()` sẽ âm thầm bỏ nó. Đã sửa `wizardArtSelectedAsset`; nếu thêm helper mới, phải nhận `ci-` như một asset.
- Việc thay hai danh sách bằng một khối đã **xoá mất** các helper `wizardArt*` nằm giữa; `check:renderer-globals` phát hiện 14 call site chưa khai báo — đây là lý do phải chạy check này sau mỗi lần thay khối lớn.
- Hộp thoại chọn tệp native không điều khiển được từ CDP; `files:import-illustration` nhận thêm tham số đường dẫn (cùng mọi kiểm tra) để kiểm thử được. Đây không phải đường tắt tin cậy.
## #125 — Ảnh vừa tải lên không hiện: vẽ lại thumbnail + sửa chẩn đoán

**Context.** Báo cáo "tôi tải ảnh lên rồi nhưng ảnh minh hoạ không thay đổi theo". Điều tra trên bản dựng thật, ba điểm được kiểm độc lập:
1. `lesson:patch-item-assets` lưu đúng `illustrationAssetId = ci-…` vào draft và game;
2. `resolveStageIllustration` trả `custom: true` và màn chơi (`#modalRoot .stage-illustration`) vẽ `<image href="edugame-file://img/ci-…">` **load được** (`ok 1x1`);
3. protocol từ chối id lạ và `..%2F`.

Vì vậy dữ liệu và đường hiển thị đúng; phần còn lại là **paint**: thumbnail trong thẻ được dựng lại ngay khi `patch` trả về, trước khi `<image>` kịp tải, và Chromium giữ khung cũ đến lần vẽ sau. Khi giáo viên nhìn vào thẻ thì vẫn thấy ảnh trước.

**Quyết định.**
- **D1 — Vẽ lại thumbnail sau khi gán ảnh**: `wizardRepaintArtThumbs()` gỡ rồi gắn lại `href` của mọi `<image>` tự tải trong thẻ, gọi ngay sau patch và thêm một lần sau 700 ms (đĩa chậm). Chỉ chạy khi đang ở bước 5.
- **D2 — Bài học chẩn đoán**: probe đầu tiên báo "màn chơi không có ảnh" vì tìm `.stage-illustration` trong `#pageContent`, trong khi màn chơi là **modal** ở `#modalRoot`. Không sửa code vì chẩn đoán sai, nhưng ghi lại để lần sau không kết luận vội.
- **D3 — Harness**: `tests/manual/lib/ui-check-lib.js` retry **một lần** khi evaluate đầu tiên sau khởi động trả `x is not defined` cho global có thật (race lúc classic script đăng ký global). Lỗi khác vẫn ném ngay, nên không che lỗi thật.
- **D4 — Test nắm đúng triệu chứng**: `ui-item-art-check` thêm kiểm tra ảnh trong thẻ **load được** (`new Image().onload`), không chỉ đúng URL; đây là khác biệt giữa "thẻ ghi Ảnh tự tải lên" và "ảnh hiện ra".

**Verification.** `npm run check` 0 · build 0 · globals 0 undefined · `node tests/run-unit.js` **65/65** · Electron (CDP 9501, khởi động lạnh): `ui-item-art-check` **12/12** (thêm "card picture actually loads — ok 1x1"), `ui-input-routing-check` 51/51, `ui-card-menu-check` 10/10, `ui-lessons-paging-check` 10/10, `ui-results-paging-check` 11/11, `ui-ai-tasks-paging-check` 8/8. Sau khi chạy, thư mục ảnh trống (test tự dọn).

**Traps.**
- Màn chơi là modal trong `#modalRoot`; selector chỉ trong `#pageContent` luôn trả "không có ảnh".
- `wizardArtThumb` → `wizardArtPreviewItem` → `wizardArtSelectedAsset`: nếu helper lọc bỏ id không phải `*-scene`, ảnh tự tải biến mất khỏi thumbnail trong khi nhãn vẫn nói có ảnh (đã sửa ở #124, test #125 khóa lại).
## #126 — "Tải ảnh lên" không gắn ảnh: dự án chưa được lưu khi vào bước 5

**Context.** Giáo viên báo vẫn không thấy ảnh đổi. Đối chiếu dữ liệu thật trên máy:
- tệp đã tải nằm trong `edugame-data/images/ci-83dfe8….img`, 522 KB, 1914×1078, **load được** qua `edugame-file:`;
- nhưng **không** dự án nào (và không trò chơi nào) chứa id đó — tức là patch chưa từng được ghi.

Sau đó tái hiện bằng chính dự án của giáo viên (`project_mvt0853g_mpxoew`, bước `generate`): thẻ hiện "Tự động", không có `<image>`, `wizardState.projectId` **null**, `item1.illustrationAssetId` không có. Gọi thẳng `lesson:patch-item-assets` với projectId đó thì **lưu đúng ngay**. Vậy lỗi nằm ở renderer: `wizardPatchItemAssets` thấy `projectId` rỗng và dừng, chỉ hiện một **toast** "Hãy lưu dự án trước khi đổi minh hoạ" — toast tự tắt, giáo viên thấy "đã tải" mà ảnh không đổi.

**Nguyên nhân gốc.** Bước 5 cần một dự án đã lưu; một dự án mở lại từ danh sách đến bước 5 mà `projectId` không được khôi phục, nên điều kiện tiên quyết "có projectId" âm thầm sai. Đây là lỗi dữ liệu ở renderer, không phải lỗi tải ảnh (#124/#125).

**Quyết định.**
- **D1 — Tự lưu trước khi ghi ảnh** (`wizardEnsureProjectSaved`): nếu thiếu `projectId` mà đã có `config` + `draft`, lưu dự án ở bước hiện tại rồi mới patch. Điều kiện tiên quyết được làm đúng thay vì để giáo viên tự tìm ra.
- **D2 — Lỗi phải đọc được**: nếu không lưu được, dừng **trước khi** mở hộp thoại chọn ảnh và báo trong banner của wizard ("Chưa lưu được dự án nên chưa tải được ảnh…"), không dùng toast.
- **D3 — Test tái hiện đúng báo cáo**: `ui-item-art-check` thêm bước đặt `wizardState.projectId = null` rồi `wizardEnsureProjectSaved()` + patch, khẳng định ảnh được gắn.
- **D4 — Harness**: retry "x is not defined" lên tối đa 3 lần cách nhau 700 ms (khởi động lạnh hay mất lần evaluate đầu).

**Verification.** `npm run check` 0 · build 0 · globals 0 undefined · `node tests/run-unit.js` **65/65** · `verify:css` 17/17 · Electron (CDP 9503): `ui-item-art-check` **13/13** — gồm "an upload on step 5 with no saved project still works — saved / true" · `ui-input-routing-check` 51/51 · `ui-card-menu-check` 10/10. Đối chiếu dự án thật của giáo viên: thẻ hiện **"Ảnh tự tải lên"**, `edugame-file://img/ci-83dfe8…`, ảnh **load ok 1914×1078**.

**Traps.**
- Toast là kênh báo lỗi dở cho thao tác ảnh: nó biến mất trước khi giáo viên bấm lại, và trạng thái "ảnh không đổi" trông giống lỗi tải ảnh. Dùng banner.
- Kiểm tra dự án thật nhanh nhất: tìm `ci-[a-f0-9]{32}` trong `data_json` của `game_projects`/`games`; id có trong thư mục ảnh nhưng không có trong dự án = patch chưa chạy (lỗi renderer), ngược lại = lỗi hiển thị.
## #127 — Tải ảnh: hàng đợi ghi, không kẹt nút, dọn ảnh đúng chỗ

**Context.** Sau #124–#126 vẫn báo "chưa hoạt động". Đọc lại code đường bấm nút thấy ba lỗi thật, độc lập với việc lưu/ảnh:
1. `wizardUploadArt` và `wizardPatchItemAssets` dùng chung một cờ `artBusy`; nếu hộp thoại native treo/bị đóng bất thường hoặc bước lưu trước lỗi, cờ có đường **không được reset**, và mọi lần bấm sau bị `if (artBusy) return` — nút trông như "chết".
2. Hai lần bấm nhanh chạy song song (mỗi lần một `patch` riêng); kết quả nào về sau ghi đè, không phải lần bấm sau.
3. `files:delete-illustration` xoá theo id mà **không kiểm tra đang được dùng** — "Tự động" ở một câu có thể xoá ảnh của câu khác.

**Quyết định.**
- **D1 — Một hàng đợi ghi** (`wizardQueueArtTask`, `wizardApplyItemPatch`): mọi thao tác ảnh (chọn hình có sẵn, Tự động, tải lên) xếp hàng và chạy lần lượt; cờ `artBusy` được đặt và **luôn nhả trong `finally`**, chỉ lần ghi cuối mới nhả (đếm `wizardArtWriteSeq`) để nút không bị mở khoá giữa hai thao tác.
- **D2 — Chọn ảnh trước, ghi sau**: hộp thoại chạy khi `artBusy` được đặt nhưng chưa có thao tác ghi nào; huỷ hộp thoại → nhả cờ, không đổi gì. Lỗi đọc/lưu → nhả cờ và báo banner.
- **D3 — Điểm nối để kiểm thử**: `wizardImportIllustration()` là hàm bọc duy nhất mở hộp thoại, nên test thay được hộp thoại mà vẫn chạy toàn bộ chuỗi thật (patch → dự án → thẻ → ảnh).
- **D4 — Không xoá ảnh đang dùng**: `files:delete-illustration` trả `{ ok: false, inUse: true }` nếu bất kỳ game/project nào còn trỏ tới id.
- **D5 — Dọn ảnh**: xoá dự án xoá ảnh của nó (`removeProjectImages`); đổi ảnh/xoá hình của một câu xoá ảnh cũ nếu không còn ai dùng; xoá trò chơi giữ hành vi cũ. Hàm thu thập id dùng chung (`collectCustomImageIds`, `referencedCustomImageIds`, `removeUnreferencedImages`).
- **D6 — Tạo lại câu** cũng đi qua `wizardEnsureProjectSaved`, không còn toast "Hãy lưu dự án trước…".

**Verification.** `npm run check` 0 · build 0 · globals 0 undefined · `node tests/run-unit.js` **65/65** · `verify:css` 17/17 · Electron (CDP 9507): `tests/ui/ui-art-upload-flow-check.js` **10/10** (mới) — huỷ hộp thoại không đổi gì và nút mở lại, tải vào đúng câu, **lần tải thứ hai chạy ngay sau lần thứ nhất vẫn được ghi**, cờ nhả, thẻ trỏ `edugame-file://…` và **ảnh load ok 1x1**, ảnh đang dùng **không xoá được**, "Tự động" chỉ xoá của câu đó · `ui-item-art-check` 13/13 · `ui-input-routing-check` 51/51 · `ui-card-menu-check` 10/10.

**Traps.**
- Một cờ "đang bận" đặt trước `await` đầu tiên phải có `finally`; nếu không, một hộp thoại treo làm chết cả màn hình nhưng không có lỗi nào hiện ra.
- Test bằng cách bọc `window.eduGame` **không** chạy: contextBridge đóng băng. Cần một hàm bọc trong renderer (D3).
## #128 — Ảnh minh hoạ trong "Tạo trò chơi (thủ công)"

**Context.** Bước 5 của luồng "Tạo từ giáo án" có ảnh cho từng câu (#124–#127), nhưng trình soạn thảo của luồng **thủ công** chỉ giữ `illustrationAssetId` trong input ẩn: trò chơi tạo thủ công không có chỗ chọn ảnh, và sửa một trò đã lưu thì ảnh không đổi được từ UI.

**Quyết định.**
- **D1 — Cùng một mẫu điều khiển**: mỗi câu hỏi (quiz/scenario), mỗi câu Đường đua, mỗi chặng Kho báu có khung xem trước (dùng chính `stageIllustrationHtml` nên thấy đúng như khi chơi), nhãn nguồn ("Ảnh tự tải lên" / "Hình có sẵn: …" / "Theo chủ đề: …"), nút **📷 Tải ảnh lên**, chọn hình có sẵn theo chủ đề, **↺ Tự động**. Đặt **trong thẻ câu hỏi**, ngay dưới đề bài.
- **D2 — Một nguồn sự thật**: điều khiển ghi vào input ẩn `illustrationAssetId` mà `readEditorItemAssets` đã đọc khi lưu; khung xem trước đọc lại từ chính input đó (`editorItemArtValue`). Không có giá trị "hiển thị" song song.
- **D3 — Sự kiện riêng `art-change`** cho ô chọn: handler `change` của danh sách câu hỏi bắt đầu bằng `if (!target.matches('[data-field="type"]')) return;` và khung phương án `stopPropagation`, nên một listener `change` dùng chung không tới được điều khiển.
- **D4 — Mỗi lần vẽ lại phải gắn lại**: điều khiển thay chính nó sau mỗi thay đổi; `data-art-bound` chỉ đánh dấu node hiện tại và **không** chép sang node mới, node mới được gắn handler ngay. (Chép cờ "đã gắn" là lỗi khiến mọi cú bấm thứ hai bị bỏ qua.)
- **D5 — Điểm nối hộp thoại**: `editorImportIllustration()` là hàm duy nhất mở hộp thoại, để kiểm thử thay hộp thoại mà vẫn chạy toàn bộ chuỗi thật.

**Verification.** `npm run check` 0 · build 0 · globals 0 undefined · unit **65/65** · `verify:css` 17/17 · Electron (CDP 9517, bản dựng sạch): `tests/ui/ui-editor-art-check.js` **9/9** (mới) — mỗi câu một điều khiển trong thẻ, chọn hình có sẵn → input + nhãn + ảnh, **tải ảnh thật** → id + `edugame-file:` + **ảnh load ok 1x1**, "Tự động" xoá đúng câu đó và để yên câu kia, **Lưu** xong đọc lại DB có đủ hai ảnh · `ui-item-art-check` 13/13 · `ui-art-upload-flow-check` 10/10 · `ui-input-routing-check` 51/51 · `ui-card-menu-check` 10/10.

**Traps.**
- `saveEditedGame` đọc từng trường và `readEditorItemAssets(el)` đã có sẵn — đừng thêm đường lưu thứ hai cho ảnh.
- Điều khiển tự thay node: handler phải lấy hàng bằng `closest()` trên chính node đang được bấm, không dùng biến closure của node cũ.
- Khi bấm tự động trong kiểm thử, đọc lại hàng từ DOM sau mỗi lần bấm — node đã bị thay.
## #129 — Trình chỉnh sửa trò chơi là một trang, không phải modal

**Context.** Trình soạn thảo mở trong `#modalRoot` (backdrop + hộp thoại). Với một màn hình giáo viên làm việc nhiều phút, modal gây ba vấn đề: che mất Thư viện, có đường đóng (X/backdrop) làm mất nội dung đang gõ, và nền phía sau vẫn cuộn được — cảm giác như pop-up hơn là nơi làm việc.

**Quyết định.**
- **D1 — `state.page === 'editor'`**: `renderEditorPage()` được thêm vào `renderers` trong `core/render.ts`, tiêu đề trang trong `pageNames`. `openEditor`/`editGame` giữ nguyên tên nên mọi nơi gọi (thẻ Thư viện, wizard, luồng tạo mới) không cần sửa.
- **D2 — Khung trang**: `.editor-page` (max-width 1180) với **header dính** (← Thư viện · tiêu đề · Hủy / Lưu và xuất / Lưu vào thư viện) và `.editor-page-body` giữ padding cũ, nên toàn bộ binding trường giữ nguyên.
- **D3 — Rời trang**: nút quay lại/Hủy hỏi xác nhận ("Thay đổi chưa lưu sẽ mất") rồi `closeEditorPage({ cancel })` — huỷ cả yêu cầu AI đang chờ. Lưu thành công xoá `editorPageState` **trước** khi `navigate('library')`.
- **D4 — Trang không có trò chơi** (vào thẳng bằng điều hướng hoặc trò đã bị xoá) hiện trạng thái rỗng với nút về Thư viện, thay vì một trình soạn thảo trên hư không.

**Lỗi phát hiện khi chuyển (đã sửa).** `saveEditedGame` và hàm AI theo mục vẫn tra `$('#modalRoot')` — host rỗng — nên bấm Lưu đọc không có gì và **quay về không báo lỗi**; các nhánh lưu còn `root.innerHTML = ''` (xoá cả `#pageContent`) trước `navigate`. Nay cả hai đi qua `editorPageRoot()` và chỉ xoá `editorPageState`.

**Verification.** `npm run check` 0 · build 0 · globals 0 undefined · unit **65/65** · `verify:css` 17/17 · Electron (CDP 9522): `ui-editor-art-check` **12/12** — thêm "mở dưới dạng trang, không modal", "hành động lưu ở header trang", "Lưu xong về Thư viện" · `ui-item-art-check` 13/13 · `ui-art-upload-flow-check` 10/10 · `ui-input-routing-check` 51/51 · `ui-wizard-cancel-genre-check` 8/8 · `ui-card-menu-check` 10/10 · `ui-race-treasure-check` 18/18.

**Traps.** Khi chuyển một modal thành trang, phải rà **mọi** `$('#modalRoot')` trong module — một chỗ còn sót sẽ đọc host rỗng và thất bại im lặng. Test "saving keeps both pictures" bắt được đúng lỗi này.
## #130 — Thanh lưu của trình chỉnh sửa luôn hiện khi cuộn

**Context.** Giáo viên muốn nút Hủy / Lưu và xuất / Lưu vào thư viện luôn nhìn thấy khi cuộn, giống nút "Lưu cài đặt" sticky ở trang Cài đặt (#129 đã đưa trình chỉnh sửa về dạng trang).

**Quyết định.**
- **D1 — Thanh riêng, dính dưới topbar**: `.editor-save-bar{position:sticky; top:68px}` chứa cả ba nút và dòng gợi ý; header trang chỉ còn nút "← Thư viện" + tiêu đề. Vùng cuộn là document, nên `sticky` neo theo `top:68px` (chiều cao topbar).
- **D2 — `#pageContent` có class `editor-active`** để bỏ padding trên của trang editor, thanh dính sát topbar thay vì hở 30px.
- **D3 — Báo trạng thái**: dòng gợi ý đổi sang "Bấm “Lưu vào thư viện”…" khi có thao tác (`input`/`change`/bấm nút). Rời trang chỉ hỏi xác nhận khi thanh đang ở trạng thái đó.

**Lỗi phát hiện khi chuyển từ modal sang trang (đã sửa).**
1. `renderEditorPage` ghi vào DOM rồi trả `undefined` — shell lại gán `#pageContent.innerHTML = undefined` → trang trắng. Nay nó **trả markup** (`editorPageHtml`) và shell gán.
2. Phép gán `innerHTML = renderer()` chạy renderer **trước** khi gán; renderer `create` mở trang editor là side effect, nên markup cũ ghi đè trang vừa mở. Nay shell gọi renderer trước, kiểm `state.page`, rồi mới gán.
3. Các binding trường (`#saveGameBtn`, `#editTitle`…) vẫn nằm cuối hàm tạo markup nên chạy khi markup **chưa** vào DOM → nút Lưu không có handler. Nay chuyển sang `wireEditorPage(root)` gọi từ `wirePage()` sau khi chèn markup.
4. `.modal-body` không còn tồn tại → `insertAdjacentHTML` ném lỗi và làm chết trang editor của 3 thể loại khác; nay dùng `.editor-page-body` có kiểm tra null.

**Verification (bản dựng sạch).** `ui-editor-art-check` **12/12** (gồm "save actions pinned in a bar — sticky", "saving returns to the library") · `ui-item-art-check` 13/13 · `ui-art-upload-flow-check` 10/10 · `ui-input-routing-check` 51/51 · `ui-wizard-cancel-genre-check` 8/8 · `ui-card-menu-check` 10/10 · `ui-race-treasure-check` 18/18 · `ui-lessons-paging-check` 10/10 · `ui-results-paging-check` 11/11 · `ui-ai-tasks-paging-check` 8/8 · `ui-classifier-outline-check` 14/14 · unit **65/65** · globals 0 undefined · `verify:css` 17/17 · `npm run check` 0 · build 0. Đo trực tiếp: cuộn 12 671 px, thanh ở `top 68px`, ba nút trong khung nhìn; cả 5 thể loại mở được trang editor.

**Traps.** Khi một renderer tạo trang khác như side effect (`create` → `editor`), **không** dùng `innerHTML = renderer()`: gọi trước, kiểm `state.page`, rồi gán. Binding của field phải chạy **sau** khi markup vào DOM (hợp đồng chung của `wirePage`).
## #131 — Trình chỉnh sửa Đường đua: chữ đội, xoá hiệu ứng, tải ảnh

**Context.** Ba lỗi giáo viên báo ở chế độ chỉnh sửa của "Đường đua chinh phục": (1) tên đội màu trắng trùng nền không thấy; (2) kéo hiệu ứng vào ô xem trước được nhưng không xoá được; (3) nút tải ảnh ở câu hỏi đường đua không hoạt động.

**Nguyên nhân & sửa.**
- **(1) Trùng màu**: hàng đội trong editor dùng lại class `.race-team-row` của **màn chơi** (nền `#1b2140`, chữ `#e8ebf7`), trong khi input bên trong nền trắng → chữ trắng trên nền trắng. Nay `.race-team-row[data-team-id]` và `[data-cell-row]` (chỉ tồn tại trong editor) có nền trắng, chữ `#394256`, viền `--line`. Thêm một **ô chọn màu** cho mỗi đội (`data-team-color`, `EDITOR_TEAM_COLORS`) và lưu `color` khi đọc dữ liệu — trước đây editor không hề lưu `color` nên mọi đội dùng màu mặc định.
- **(2) Không xoá được**: hiệu ứng chỉ xoá được bằng nút ✕ ở danh sách phía dưới. Nay **bấm vào ô có hiệu ứng trên đường đua là xoá** (và ô 1 báo rõ "vạch xuất phát"); danh sách và bộ đếm cập nhật theo.
- **(3) Tải ảnh không chạy**: `wireEditorItemArt(root)` chạy khi trang được gắn, nhưng các panel `.editor-page-body` (Đường đua / Kho báu) được **chèn sau** đó, và câu hỏi đường đua thêm/nhân bản cũng vậy — các điều khiển ảnh mới không có listener. Nay gắn lại sau mỗi lần chèn (panel template, "Thêm câu hỏi", "Nhân bản").

**Verification.** `node tests/ui/ui-race-editor-check.js` **10/10** (mới) — hàng đội nền sáng/chữ tối, có ô chọn màu và **màu lưu đúng `#7c3aed`**; xoá hiệu ứng trên ô 4 (2 → 1 hàng); tải ảnh thật vào câu hỏi đường đua → thẻ "Ảnh tự tải lên" và **ảnh lưu cùng trò**; lưu xong về Thư viện · `ui-editor-art-check` 12/12 · `ui-item-art-check` 13/13 · `ui-race-treasure-check` 18/18 · `ui-input-routing-check` 51/51 · unit **65/65** · globals 0 undefined · `verify:css` 17/17 · `npm run check` 0 · build 0.

**Traps.** Khi một khối HTML được chèn **sau** lúc trang đã được wire (`insertAdjacentHTML` trong panel ẩn, nút "thêm"), các điều khiển trong khối đó **không có listener** — phải gọi lại hàm wire cho node vừa chèn. Đừng dùng chung class giữa màn chơi (nền tối) và editor (nền sáng); chỉ dùng selector hẹp hơn (`[data-team-id]`).

## #132 — Nhà cung cấp AI cấu hình ở Cài đặt; Step 2/Step 5 không còn chỉ dùng AI local

**Context.** Đối chiếu mã theo `docs/archive/specs/update_AI_provider.txt`: luồng tạo trò chơi (Step 2 `lesson:analyze`, Step 5 `lesson:generate`, tạo lại một mục, hỏi đáp) đi qua **một** hàm `createLessonChatClient()` chỉ nói chuyện với llama.cpp local. Gemini/OpenAI/OpenCode chỉ tồn tại ở pipeline `ai:generate` cũ và ở form Cài đặt; nút "Kiểm tra kết nối AI" lại gọi `ai:generate` (một lần tạo trò chơi đầy đủ) và gửi khoá **từ renderer**. `settings:get` giải mã khoá rồi trả về renderer, form hiển thị nó trong `input type=password`.

**Quyết định.**
- **D1 — Registry ở main, một nguồn duy nhất.** `src/services/ai-providers.ts` (thuần, không I/O): 5 nhà cung cấp `local`, `gemini`, `openai`, `opencode`, `custom`; `local/gemini/openai` có `wizardEligible: true`, `opencode/custom` **không** (UI Cài đặt ghi "Chưa dùng cho luồng tạo trò chơi"). Renderer không import module này: main gửi bảng qua `settings:get`/`ai:providers`. `cloudProviderPresets`/`getCloudProviderConfig`/`applyCloudProvider` trong `renderer/shared.ts` đã bị xoá.
- **D2 — Renderer không bao giờ nhận khoá.** `settings:get`/`settings:save`/`ai:providers` trả **cùng một** view không khoá: `ai.providers[]` với `hasKey`, `keyMasked` (`••••abcd`), `status`, `reason`, `lastTestAt/Ok/Code`, `baseUrl`, `model`, `defaultBaseUrl/Model`, `usable`; không có `apiKey` và không có `apiKeyEncrypted`. Ô khoá luôn trống; gõ vào = thay khoá; "Xoá khoá" đánh dấu trên thẻ và chỉ thực hiện khi bấm "Lưu cài đặt". `settings:save` chỉ nhận `providers[id] = { apiKey?, clearKey?, baseUrl?, model?, enabled? }` và bỏ mọi khoá khác; khoá rỗng = **giữ** khoá cũ.
- **D3 — Khoá theo nhà cung cấp + migration một chiều.** `ai.providers[id].apiKeyEncrypted` (vẫn `safeStorage`). `migrateLegacyAiSettings` chuyển `ai.apiKeyEncrypted` (và `baseUrl`/`model`/`cloudProvider` đi kèm) sang `providers[provider]`, đặt `provider`/`providerPolicy: 'auto'`, xoá trường cũ; chạy **một lần** (gọi lại = `changed: false`), ghi bằng `writeJson`. Nếu `safeStorage` không khả dụng mà có khoá mới: **không lưu gì**, trả `AI_KEY_STORAGE_UNAVAILABLE` (trước đây ghi rỗng, mất khoá không báo).
- **D4 — Vòng đời trạng thái.** `not-configured` → `configured` (có khoá + điểm cuối + model) → `ready` (lần kiểm tra **thật** gần nhất thành công) → `failing` (request thật vừa lỗi, lưu `lastTestCode`). `usable` **chỉ** khi `ready` (với `local`: runtime đang READY) và `enabled !== false`. "Đã cấu hình nhưng chưa kiểm tra" **không** được dùng tự động — spec §3: một lần kiểm tra thành công không bảo đảm lần sau, và chưa kiểm tra thì chưa có gì để tin.
- **D5 — Một client cho cả luồng.** `createChatClientForProvider(requestedId)` trả đúng interface cũ `chatJson({ messages, maxTokens, responseSchema, signal })`; prompt, schema, `aiSingleFlight`, `aiRequests` giữ nguyên. Bốn chỗ gọi (`lesson:analyze`, `lesson:generate`, `lesson:regenerate-item`, `lesson:answer-question`) dùng client này; client được chọn **trước** khi chiếm single-flight để lỗi "chưa có nhà cung cấp" không giống một lần chạy model hỏng.
- **D6 — Chọn nhà cung cấp.** Chính sách `auto`: `local` → `gemini` → `openai`, chỉ nhà cung cấp `usable`. `providerId` do wizard chọn luôn thắng **nếu** dùng được; nếu không → lỗi `AI_PROVIDER_NOT_READY`/`AI_PROVIDER_NOT_ELIGIBLE`, **không** tự đổi (D8 của spec). Bước 2 và bước 5 hiện thẻ "Dùng …", tên nhà cung cấp trên nút và select nhỏ **chỉ khi** có ≥2 nhà cung cấp sẵn sàng. Không có nhà cung cấp: thẻ vàng + "Mở Cài đặt AI"; lỗi loại này ở banner cũng chỉ mở Cài đặt, không mở cửa sổ AI local.
- **D14 — Bước 1 một nút "Tiếp tục"; bước 2 mở AI local khi cần; nút AI ngoài tự xuất hiện; đỏ chỉ khi lỗi thật.** (a) Nút tiến của bước 1 luôn là "Tiếp tục ➔"; nhánh đi (dùng câu hỏi có sẵn hay phân tích giáo án) viết trong dòng gợi ý ngay dưới nút thay vì trong nhãn nút. (b) Bấm "✦ Phân tích bằng AI local" khi model local chưa tải hoặc llama.cpp chưa chạy thì **không** chạy phân tích: bước 2 hiện một dòng đỏ ngắn ("chưa có model" / "đã có model nhưng chưa chạy"), và cú bấm mở cửa sổ AI local để giáo viên chọn model và bấm "Bắt đầu chạy"; phần chạy do giáo viên tự thực hiện, ứng dụng không tự khởi động. (c) Nếu trong Cài đặt đã có AI ngoài (Gemini/ChatGPT) **đã kiểm tra kết nối thành công**, bước 2 tự thêm nút "☁ Phân tích bằng AI (Gemini)"/"… (ChatGPT)" bên cạnh nút AI local, kèm một dòng cho biết giáo án sẽ được gửi qua Internet. (d) Nút AI ngoài **không** bao giờ đỏ chỉ vì tồn tại; nó chỉ chuyển đỏ sau khi một lượt phân tích bằng chính nhà cung cấp đó **thất bại thật** (không tính huỷ), và trở lại bình thường ngay khi một lượt sau thành công; lý do lỗi vẫn nằm ở banner lỗi phía trên.
- **D18 — Thẻ trò chơi: chỉ "Chơi ngay" và "Toàn màn hình" ở ngoài, mọi thứ khác trong menu "•••".** Ngoài menu, thẻ chỉ có **Chơi ngay** và **Toàn màn hình**; nút **•••** mở menu (`role="menu"`) gồm đúng **Chơi LAN, Chỉnh sửa, Xuất game, Xoá** (Xoá chỉ ở thư viện). Thẻ trước đây bị sinh thiếu menu này (mất nút Chỉnh sửa/Xoá và cả menu), nên `ui-card-menu-check` không chạy được; nay markup khớp với `wireGameMenus()` (toggle `data-menu-toggle`, menu `role="menu"` có `hidden`) và khớp bộ đóng menu ở `bootstrap.ts` — quan trọng: toggle nằm trong phần tử mang `data-game-menu-root`, nếu thiếu thì listener "click ra ngoài" chạy ở capture đóng menu ngay trước khi toggle kịp mở lại (triệu chứng: bấm lần hai không đóng). Chơi LAN có trên **mọi** thẻ (trước đây chỉ một số thể loại), vì menu là nơi duy nhất chứa nó.
- **D17 — "API tương thích OpenAI (tự cấu hình)" dùng được cho luồng tạo trò chơi sau khi kiểm tra kết nối.** Trước đây `custom` bị loại khỏi wizard, nên giáo viên dùng gateway trường/proxy (không phải Gemini/ChatGPT) thấy "kiểm tra kết nối thành công" nhưng bước 2 không có nút nào — mà thông báo còn nói "chưa kiểm tra", sai sự thật. Nay: `custom` có `wizardEligible: true`, **bắt buộc khoá** như các nhà cung cấp đám mây khác, và chỉ `usable` khi lần kiểm tra thật gần nhất thành công. Chính sách tự động vẫn ưu tiên local → Gemini → ChatGPT; `custom` chỉ được chọn khi giáo viên chọn nó hoặc khi nó là nhà cung cấp đã kiểm tra duy nhất. Nút ghi "☁ Phân tích bằng AI (AI ngoài)". `opencode` **vẫn** ngoài luồng (công cụ cũ). Dòng gợi ý ở bước 2 và lý do trong Cài đặt nói đúng đã quan sát: kiểm tra thất bại / chưa kiểm tra / đã kiểm tra nhưng không dùng được.
- **D16 — Nút dừng llama.cpp luôn có và luôn trả lời; nút AI ngoài dựa trên trạng thái thật.** (a) Thanh trạng thái trước đây giữ trạng thái cũ khi trang Settings/bài giảng vẽ lỗi (render ném lỗi trước khi thanh được làm mới), nên nút dừng bị ẩn/khóa. Nay: `render()` bọc từng bước (vẽ trang, nối trang) để một trang hỏng không làm mất thanh; nút "Dừng" **luôn hiện, luôn bấm được**, tự đọc lại trạng thái runtime trước khi làm gì, và nói rõ khi không có gì để dừng hoặc khi main từ chối (kèm lý do); nút "Bắt đầu" cũng đọc lại trạng thái trước. `ai:stop-local-runtime` không còn từ chối khi single-flight đang chạy trên **đám mây** (chỉ chặn khi chính AI local đang chạy). (b) Step 2 tự làm mới view nhà cung cấp khi được mở (một lần, không lặp), nên AI ngoài vừa kiểm tra trong Cài đặt hiện ngay nút "☁ Phân tích bằng AI (Gemini/ChatGPT)"; nút chỉ xuất hiện khi `wizardEligible && usable` và nhãn cũ không còn ghi "AI (AI local)". (c) Khi chưa có nút, dòng gợi ý nói đúng điều đã quan sát: kiểm tra thất bại / chưa kiểm tra / view chưa cập nhật. (d) "Lưu khoá" ghi nhận yêu cầu đang lưu; "Kiểm tra kết nối" chờ yêu cầu đó xong rồi mới chạy, nên không còn kiểm tra bằng khoá cũ (AI_AUTH oan).
- **D15 — Menu "•••" của thanh llama.cpp sống qua mọi lần render lại và mở được khi llama.cpp đang chạy.** Ba lỗi cộng dồn: (a) click vào nút thừa hưởng cả handler của thanh, `stopPropagation` không cứu được vì document listener chạy ở capture trước đó — nay chỉ còn một đường mở menu, trạng thái đọc từ DOM (`menuIsOpen`), không có biến `open` riêng để lệch; (b) thân trang tự render lại (mỗi tick của bước 1) sau click, thay luôn thanh trên navbar, nên menu vừa mở lại biến mất — listener document chạy ở capture, khi click nằm trong `#aiStatusContainer` thì gọi `ensureWired()` trước, và `ensureWired` so **đúng node** (`wiredNodes`) chứ không dựa vào cờ `dataset` (innerHTML giữ nguyên `data-*` nên node mới bị coi là "đã gắn"); (c) `init()` chạy một lần nên các nút mới không có listener — mỗi lần `render`/click/refresh tự gắn lại nút còn thiếu. Click ra ngoài (bubble, không capture) và Escape vẫn đóng menu; click lên thanh khi menu đang mở cũng đóng (bấm ra ngoài menu).
- **D13 — AI local là mặc định; AI ngoài là nút thứ hai, chỉ khi đã kiểm tra.** Tạo trò chơi từ giáo án mặc định chạy và cấu hình AI local: nút chính ở bước 2 luôn là "✦ Phân tích bằng AI local" và gửi `providerId: 'local', localPreferred: true` — khi AI local đang chạy nó được dùng kể cả lúc Gemini/ChatGPT cũng `ready` (chính sách `auto` vốn đã đặt local trước, nhưng nay nút nói rõ ý định), khi AI local chưa chạy thì báo `AI_NOT_RUNNING`, **không** âm thầm chạy trên đám mây. Nếu giáo viên đã cấu hình AI ngoài trong Cài đặt **và** nhà cung cấp đó đã qua kiểm tra kết nối, bước 2 hiện thêm nút phụ "☁ Phân tích bằng …" (`data-wizard-action="analyze-cloud"`), kèm một dòng nói rõ giáo án sẽ được gửi qua Internet. Chưa kiểm tra kết nối thì **không** có nút: chỉ hiện lời mời mở Cài đặt AI (đã nhập khoá nhưng chưa kiểm tra → nói đúng như vậy).
- **Hệ quả của D13.** (a) `chooseProvider` thêm `localPreferred` (nút AI local); chính sách `auto` và view `publicSettingsView` không đổi. (b) Cache và khoá single-flight của phân tích/draft mang thêm id nhà cung cấp, nên bản nháp làm bằng AI ngoài không bị dùng lại khi giáo viên quay về AI local (`buildGenerationCacheKey` thêm `provider`). (c) Bấm nút AI ngoài ghi lựa chọn đó vào `wizardState.selectedProviderId`, nên thẻ "Dùng …", tiến trình và các request sau (tạo lại một mục, bước 5) nói đúng nhà cung cấp.
- **D11 — Hook `ai:health` chỉ tồn tại trong bản thử.** Trước đây cổng là `!app.isPackaged`; một bản build chưa đóng gói (kênh dev, bản `--dir`) vẫn có `isPackaged === false`, nên bất kỳ trang nào nạp trong đó cũng gọi được kênh dùng khoá đã lưu và phát sinh request tính tiền. Nay cổng là `!app.isPackaged && process.env.EDUGAME_AI_TEST_DIR`, cùng công tắc với fixture `loadLessonTestFixture`; bản sản phẩm không bao giờ đăng ký kênh này.
- **D12 — View nói đúng nhà cung cấp sẽ dùng, không phải nhà cung cấp đang chọn trong Cài đặt.** `publicSettingsView` gọi đúng `chooseProvider` như request (chọn tay → chính sách `auto`), nên `ai.provider` trong view là nhà cung cấp chạy được **bây giờ** (local đang chạy là mặc định, theo D13; local dừng thì view nói nhà cung cấp khác đã kiểm tra, không nói AI local đã dừng). Trong wizard, `aiActiveProvider()` ưu tiên lựa chọn của giáo viên (`wizardState.selectedProviderId`) khi lựa chọn đó `usable`, nên thẻ "Dùng …" và nút không còn nói một nhà cung cấp khác với request. Một tham chiếu cục bộ bị dùng trước khi khai báo trong `publicSettingsView` đã được sửa trong cùng đợt (không để lỗi TDZ tiềm ẩn).
- **D7 — Test kết nối độc lập** (`ai:test-provider`, spec §4): **một** request thật tối thiểu (`max_tokens: 8`, "Trả lời đúng một từ: OK" — local trả JSON nhỏ qua `chatJson({ textResponse: true })`), timeout 30 s, `Bearer` khoá đã giải mã trong main; ghi `lastTestAt/Ok/Code`. Không test tự động khi khởi động, không test mỗi bước wizard. UI nói rõ "Kiểm tra gửi một yêu cầu thật rất nhỏ (tối đa 8 token)".
- **D8 — Phân loại lỗi cloud** (`classifyProviderHttpError` trong `ai-transport.ts`): 401/403 → `AI_AUTH`; 402, `insufficient_quota`, `billing`, "exceeded your current quota" → `AI_QUOTA` (cả khi OpenAI trả 429); 404 hoặc 400 kèm "model … does not exist" → `AI_MODEL_NOT_FOUND`; 429 → `AI_RATE_LIMIT`; còn lại → `AI_PROVIDER_HTTP` (mã riêng, **không** phải `AI_HTTP` của runtime local, để thông báo cloud không bao giờ đọc thành "AI local báo lỗi"); mất mạng → `AI_CONNECTION`; hết giờ → `AI_TIMEOUT`. Thân lỗi của nhà cung cấp **không** được chép vào thông báo (có thể chứa khoá).
- **D9 — Cache phân tích có `provider`.** `buildAnalysisCacheKey` thêm `provider` (thêm ở cuối, rỗng khi thiếu để không đổi ngữ nghĩa cũ); `lesson:analyze` truyền kết quả `chooseProvider` (**đúng nhà cung cấp sẽ chạy**, kể cả chọn tay hay chính sách bỏ qua local đã dừng), mặc định `local`. Đổi nhà cung cấp ⇒ phân tích lại **một** lần, không dùng nhầm cache của nhà cung cấp khác (R3).
- **D10 — `ai:generate` cũ giữ nguyên** cho tương thích (nút test không còn gọi nó); nó đọc khoá đã migrated từ `providers[cloudProvider]`. Ứng dụng không còn trang nào gọi kênh này.

**Không làm.** Không thêm nhà cung cấp mới (Anthropic/Azure), không đổi prompt/schema của Step 2/Step 5, không đổi engine/`.egame`/SQLite, không dùng keychain ngoài `safeStorage`, không tự kiểm tra kết nối khi khởi động.

**Verification.** `npm run check` 0 · `npm run build` 0 · `node tests/run-unit.js` **66/66** (thêm `tests/unit/ai-providers.test.ts`; `ai-transport.test.ts` thêm phân loại 401/403/402/429/`insufficient_quota`/404/"model does not exist"/500, đuôi lỗi không lộ khoá, `TypeError` → `AI_CONNECTION`, timeout; `lesson-cache.test.ts` thêm provider trong khoá) · `check:renderer-globals` 0 undefined (654 hàm) · `verify:css` 17/17.
Electron thật, profile cách ly `EDUGAME_USER_DATA` (CDP 9344): `ui-ai-provider-key-check` **16/16** (khoá không có trong payload/DOM/`state.settings`, chỉ `••••heck`, lưu rỗng = giữ khoá, "Xoá khoá" đưa về `not-configured`), `ui-ai-provider-settings-check` **23/23** (5 thẻ; `not-configured → configured` có mask; test thật qua stub loopback: **1** request `/chat/completions`, `Bearer` khoá, `max_tokens: 8` → `ready`; 401 → `failing`/`AI_AUTH`, không tự đổi nhà cung cấp; xoá khoá → `not-configured`), `ui-ai-provider-wizard-check` **20/20** (nút bước 2/5 mang tên nhà cung cấp, select chỉ có `local,gemini` khi cả hai sẵn sàng, `providerId` trong payload khi chọn, một nhà cung cấp thì ẩn select, không có nhà cung cấp: thẻ + "Mở Cài đặt AI" và banner `AI_NO_PROVIDER` chỉ mở Cài đặt), `ui-input-routing-check` 51/51, `ui-classifier-outline-check` 13/14 (lỗi `semanticNote` có từ #118, không liên quan), `ui-wizard-cancel-genre-check` 8/8, `ui-race-treasure-check` 18/18, `ui-item-art-check` toàn bộ, `ui-race-editor-check` toàn bộ. `npm run test:native` **không chạy được**: `better-sqlite3` là ABI 130 (Electron) còn `node` 22 là 127 ⇒ lỗi tải module, không phải lỗi test.
`ui-editor-art-check` 1 lỗi ("no modal") và `ui-card-menu-check` lỗi `dataset`: profile cách ly mới chưa có bám màn hình từ trước; `ls src/renderer/shared.ts` vẫn render nút `data-action="edit"` (không phải `data-menu-toggle`) — chưa đối chứng trên profile sạch để kết luận, **coi như chưa xác minh** cho hai check này.

**Traps.**
- **`window.eduGame` do contextBridge đặt là frozen/unwritable** — gán lại bị bỏ qua, `defineProperty` ném "Cannot redefine property". Check UI phải lái qua `state.settings`/hàm thật, hoặc `new Proxy(window.eduGame, …)` (đọc qua Proxy được, gán thì không).
- **`settings:save` trả `{ ok, settings }`**; renderer dùng `result.settings` thay vì gọi lại `getSettings()` ngay — kiểm tra này từng cho kết quả cũ trong cùng một tick.
- **Lưu khoá phải gửi kèm base URL/model đang gõ** (`readAiProviderPatches()`), nếu không, `saveSettings` của lần lưu khoá ghi đè về giá trị cũ và làm mất thay đổi vừa gõ.
- **Thay khoá xoá `lastTest*`** — một trạng thái "ready" cũ không được phép nói về khoá mới.
- **`state.settings.ai.provider` có thể rỗng trên profile mới**; view luôn điền nhà cung cấp đầu tiên dùng được, nhưng `applyCloudProvider` cũ từng giữ `mode: 'online'` cho mọi nhà cung cấp — nay `mode` chịu hình theo provider đang chọn.

## #133 — Màn hình kết quả 5 trò chơi: cùng một "thế giới" màu + dải thẻ số liệu

**Context.** Sau DECISIONS #104, mỗi engine đã có bảng biến `--world-*` riêng (quiz `#f2b24a`, matching `#ffd86b`, treasure `#e9b95b`, race `#ff8a3d`) gắn qua `.game-stage[data-game="…"]`, nhưng bốn màn hình kết quả (`renderResults`, `renderMatchingResults`, `renderTreasureResults`, `renderRaceResults`) vẫn là khối chữ thuần: điểm số nhuộm tím cứng `#a9a3ff`, không có số liệu phụ, không có chuyển động. Giáo viên chiếu lên máy chiếu thấy màn kết quả "đứt" khỏi không gian trò chơi vừa chơi.

**Quyết định.**
- **D1 — Màu điểm theo thế giới.** `.result-score` đổi `color` từ `#a9a3ff` sang `var(--world-accent, #a9a3ff)` kèm `text-shadow` bằng `--world-accent-soft`. Biến đã được khai trên `.game-stage[data-game="…"]` (kết quả nằm trong stage đó), nên không cần bảng biến mới; fallback giữ tím cũ cho mọi stage chưa có world (ví dụ team setup của template lạ).
- **D2 — Dải thẻ số liệu `.result-stats`.** Mỗi màn kết quả thêm một hàng thẻ (`resultStatsHtml(stats)` + `.result-stat` icon/value/label) ngay dưới dòng "…% điểm tối đa", trên leaderboard/reward box. Giá trị theo từng trò: quiz/scenario (câu đúng, thời gian, % điểm tối đa), matching (cặp đã ghép, lần sai, thời gian, %), treasure (chặng hoàn thành, vật phẩm ẩn — chỉ khi có chặng giấu vật phẩm, thời gian, %), race (ô về đích, vòng đấu, số đội). Thời gian định dạng `mm:ss` qua `formatClock()`.
- **D3 — Bổ sung `data-game-world="matching"` + `gameWorldLabel('matching')`** cho stage kết quả ghép cặp (trước đây stage kết quả matching chỉ có `data-game="matching"`, thiếu ribbon thế giới so với 3 trò còn lại).
- **D4 — Chuyển động nhẹ.** `result-medal-pop` (huân chương phóng to) và `result-stat-in` (thẻ trượt lên, stagger 50 ms) — đều bị tắt trong `prefers-reduced-motion: reduce`.

**Không làm.** Không đổi văn bản/nhãn bị smoke test khoá (`.result-score` vẫn chứa "điểm", `.stage-kicker` vẫn "…HOÀN THÀNH", `#resultSaveStatus` vẫn "Đang tự lưu…/Đã tự lưu…", `.leaderboard-row`, `#closeResultBtn`/`#replayBtn`/`#saveResultBtn`); không đổi luồng tính điểm/session (markup chỉ thêm thẻ, không sửa logic `calculateSummary`/`wireResultSession`); không đụng kết quả của cửa sổ trình chiếu (`presentation.ts` tự style, không dùng `.result-screen`).

**Verification.** `npm run check` 0 · `npm test` build + **66/66** unit · `check:renderer-globals` 0 undefined · `verify:css` 17/17. Electron thật (CDP 9333, profile cách ly `EDUGAME_USER_DATA`): probe trực tiếp 4 màn kết quả — `.result-screen`/`.result-stat` (quiz 3, matching 4, treasure 4 gồm "Vật phẩm ẩn", race 3)/nút đủ, `data-game-world` đúng từng trò, `getComputedStyle(.result-score).color` = accent đúng thế giới (`rgb(242,178,74)` quiz · `rgb(255,216,107)` matching · `rgb(233,185,91)` treasure); team-quiz: 3 thẻ + `.leaderboard` 3 dòng + `.leaderboard-row.leader` + `h2` "Sao đỏ dẫn đầu!" + `lastSummary.winnerTeam`. **Chưa xác minh:** `smoke56/57/68` bị hỏng từ trước do smoke dùng `.treasure-choice` trong khi luồng kho báu hiện tại render `#treasureContinueBtn` (tên đã đổi ở một đợt chưa bàn giao) — không liên quan đợt này; chưa xem bằng mắt thật trên máy chiếu/phụ.

## #134 — Tinh chỉnh 5 thế giới: scenario nhận lại bảng màu quiz; trạng thái "đã chọn" theo accent

**Context.** DECISIONS #87/#104 quy định scenario **dùng chung** nền/mực/nhấn với quiz (cùng engine trắc nghiệm, chỉ khác cách trình bày), và mỗi thế giới được nhuộm qua `.game-stage[data-game="…"]`. Nhưng khi một câu scenario render thì `stageGame = 'scenario'` (gameplay.ts `renderQuestion`), nên stage mang `data-game="scenario"` — selector bảng màu quiz viết là `.game-stage[data-game="quiz"]`, **không** khớp. Hệ quả: sân khấu scenario rơi về tím mặc định (`--world-stage-bg` dự phòng) và `--world-accent` **rỗng** (kicker/ribbon về lavender `#b3adff`). `ui-game-worlds-check` từng ghi đây là "lỗi probe" (43/44) trong khi thực ra probe đã chỉ đúng lỗi thật. Ngoài ra trạng thái "Đã ghi nhận quyết định" (`.answer-option.selected`, gameplay.ts `chooseAnswer`) còn nhuộm tím cứng `#a9a3ff`.

**Quyết định.**
- **D1 — Scenario kế thừa bảng màu quiz bằng cách thêm vào nhóm selector.** `.game-stage[data-game="quiz"], .game-stage[data-game="scenario"] { … }` — một khối biến, không nhân bản. Giá trị `scenario` đã xuất hiện nguyên văn trong mã nguồn (các selector `.game-stage[data-game="scenario"] .scenario-context/.stage-question`), nên không vi phạm bẫy Tailwind v4 "loại selector có giá trị không xuất hiện nguyên văn". Không tạo bảng biến riêng cho scenario (giữ "cùng engine = cùng thế giới").
- **D2 — Ô quyết định đã chọn theo accent.** `.answer-option.selected` đổi `border-color` sang `var(--world-card-selected-border, #a9a3ff)`, `background` sang `var(--world-card-selected-bg, …)` (biến "đã chọn" đã có sẵn trong từng bảng thế giới, dùng chung với thẻ ghép cặp), và thêm `box-shadow: 0 0 0 2px var(--world-accent-soft, …)` làm viền sáng. Màu đúng/sai (xanh/đỏ) giữ nguyên vì an toàn cho người mù màu.
- **D3 — Check không so hai mục cùng thế giới.** `ui-game-worlds-check` so sánh theo cặp "khác nền/khác accent"; cặp quiz–scenario giờ **đúng là giống hệt nhau** (cùng thế giới), nên vòng lặp bỏ qua khi `GAMES[i].world === GAMES[j].world`.

**Không làm.** Không đổi ribbon/label scenario (☘ "TÌNH HUỐNG THỰC TẾ · Sổ tay quyết định"), không đổi khung tình huống nghiêng/câu hỏi canh giữa, không tạo bảng biến `--world-*` riêng cho scenario, không đổi 4 thế giới còn lại, không đổi bất biến `verify:css`.

**Verification.** `npm run check` 0 · `npm run build` 0 · `node tests/run-unit.js` **66/66** · `verify:css` **17/17** · `check:renderer-globals` 0 undefined. Electron thật CDP 9341, profile cách ly `EDUGAME_USER_DATA=%TEMP%\edugame-worlds-133`: `ui-game-worlds-check` **42/42** (từ 43/44 — lỗi scenario thiếu bảng màu đã hết); probe trực tiếp: stage scenario `--world-accent` = `#f2b24a`, nền quiz, kicker `rgb(242,178,74)`; `.answer-option.selected` border = `rgb(242,178,74)` + glow `rgba(242,178,74,.16)`. `ui-play-surface-check` 154/156 (2 lỗi tràn quiz 1366×768 có từ trước).

## #135 — Toàn màn hình/máy chiếu ở cửa sổ thấp (1366×768): hạ cỡ đáp án + câu hỏi, không hạ sàn

**Context.** `ui-play-surface-check` báo tràn ở quiz 1366×768: câu hỏi 48px trong cột chữ hẹp (308px) quấn 4 dòng ≈ 258px, cộng 2 hàng đáp án (30px, mỗi đáp án 4 dòng) đẩy hàng đáp án dưới tràn 93px ra ngoài viewport. Các check toàn màn hình khoá sàn chữ tối thiểu (`ui-fullscreen-density-check`: câu hỏi ≥34px, đáp án ≥20px, đáp án cao ≥64px, nội dung chiếm ≥86%), nên không thể đơn thuần "thu nhỏ" mà phải hạ **vừa đủ** để vẫn trên sàn.

**Quyết định.**
- **D1 — Khối riêng cho cửa sổ thấp.** Trong `@media (max-height: 800px)`, `.answer-option` ở toàn màn hình hạ xuống `clamp(18px, 1.9vh + 0.55vw, 23px)` (đáp án 4 dòng → 3 dòng), `min-height: clamp(56px, 9vh, 96px)`, padding co lại; `.stage-center` gap `clamp(8px, 1.6vh, 18px)`. Ảnh minh hoạ KHÔNG bị thu nhỏ (đúng #89: minh hoạ là thứ được trình chiếu).
- **D2 — Câu hỏi hạ riêng.** `.stage-question` ở toàn màn hình cửa sổ thấp xuống `clamp(34px, 3.7vh + 0.7vw, 46px)` — vẫn trên sàn 34px — trả lại chiều cao cho lưới đáp án.
- **D3 — Chỉ nhắm cửa sổ thấp.** Ở độ phân giải trình chiếu thật (1920×1080, 1280×720) không có `max-height: 800px` nào kích hoạt, nên các cỡ chữ projector lớn giữ nguyên; chỉ laptop 768px cao mới được nén lại.

**Không làm.** Không hạ sàn 20px/34px của `ui-fullscreen-density-check`, không đổi markup/`verify:css`, không đổi cỡ chữ ở mọi cửa sổ (chỉ `@media (max-height: 800px)`), không chạm race-turn (selector riêng `.race-turn .stage-question` độ đặc hiệu 0,5,1 thắng khối này).

**Verification.** `ui-fullscreen-density-check` **8/8** · `ui-play-surface-check` **156/156** · `ui-race-treasure-check` **18/18** · `verify:css` **17/17** · `ui-stage-illustration-check` exit 0. Đã chẩn đoán một lỗi tưởng chừng do thay đổi này gây ra (`ui-race-treasure-check` 17/18: "long track cap 200px, content 121px") — thực ra là `Emulation.setDeviceMetricsOverride` 1920×1080 bị rò rỉ từ check trước, không phải lỗi CSS (probe lại ở 1280×720 cho cap 144px / content 182px = pass; race-turn thắng nhờ độ đặc hiệu).

## #136 — Ảnh minh hoạ tự tải lên: `meet` (vừa khít, letterbox) thay cho `slice` (cắt tràn)

**Context.** Ảnh giáo viên tự tải lên (`illustrationAssetId` khớp `^ci-[a-f0-9]{32}$`) được vẽ vào khung cố định 320×200 (16:10) qua `<image preserveAspectRatio="xMidYMid slice">` — `slice` phóng ảnh cho phủ kín khung rồi **cắt** phần thừa. Ảnh dọc (portrait), vuông hoặc panorama đều mất phần trên/dưới hoặc hai bên; đúng trường hợp người dùng báo "tỉ lệ ảnh không hợp lý" ở trò truy tìm kho báu (cùng cơ chế dùng cho cả 5 trò).

**Quyết định.** Đổi cả hai `preserveAspectRatio` (thẻ `<svg>` ngoài lẫn `<image>` trong) từ `slice` sang **`meet`** — ảnh được co đều vừa khít khung 16:10, phần thừa thành **viền nền** `.stage-illustration.is-custom { background:#eef0f7 }` (letterbox), hiển thị trọn vẹn ảnh thay vì cắt. Nhất quán với tiền lệ đã có trong dự án: hình nền kho báu (`treasure-art.ts`, `.treasure-backdrop`) cũng đổi `slice`→`meet` với cùng lý do — `object-fit` không có tác dụng trên `<svg>` nội tuyến, phép co giãn do `preserveAspectRatio` của chính SVG quyết định. `slice` chỉ đúng khi ảnh là nền trang trí phủ kín; ảnh nội dung của giáo viên phải hiện trọn.

**Không làm.** Không đổi khung 16:10 (bố cục toàn màn hình và `ui-play-surface-check` phụ thuộc tỉ lệ này), không đổi ảnh nền built-in (đã `meet` sẵn, không có `image`), không đổi đường dẫn `edugame-file://img/<id>` hay xác thực backend.

**Verification.** `npm run build` 0 (bản `dist/src/renderer/features/game-illustration.js` còn 3 `xMidYMid meet`, 0 `slice`) · `verify:css` **17/17** (đổi thuần TS) · `check:renderer-globals` 0 undefined · Electron thật CDP 9341: `ui-item-art-check` toàn bộ pass (kênh tải ảnh thật `importIllustration` + `.stage-illustration.is-custom` + href `edugame-file://img/…`), `ui-stage-illustration-check` **169/169** (chạy trên profile sạch; chạy chung phiên sau `ui-item-art-check` sẽ lệch vì trạng thái ảnh `ci-…` rò rỉ — không phải lỗi thay đổi). Probe trực tiếp ảnh dọc 240×480 vào trò kho báu trình chiếu 1920×1080/1366×768: khung 360×225/301×188 (16:10), ảnh hiện trọn (nửa trên đỏ, nửa dưới xanh, viền trắng) với thanh nền xám hai bên — không còn bị cắt.

## #137 — Skill tương tác Three.js: bundle esbuild IIFE + lớp dùng chung `window.threeGame` + pilot trang trí quiz/scenario

**Context.** Spec `uu.txt` yêu cầu một "Three.js Game Interaction Skill": xem xét dự án + 5 thể loại trò chơi, tạo skill (SKILL.md + 3 references), cài lớp Three.js tái sử dụng nhỏ nhất, áp tương tác 3D nhẹ cho cả 5 trò, giữ nguyên gameplay/tính điểm/LAN/offline và có fallback 2D. Nguyên tắc cuối của spec: *"Dùng Three.js làm cho trò chơi hiện có thêm tương tác, không biến EduGame Studio thành nền tảng phát triển game 3D phức tạp."* Hai ràng buộc dự án: renderer là **plain global classic scripts (không ES modules)**, và CSP `script-src 'self'` — trong khi Three.js r160+ **chỉ** phát hành ESM (không còn bản UMD). Phạm vi được thu hẹp theo lựa chọn của chủ dự án: **Skill + lớp dùng chung + 1 game mẫu** (quiz — tự kế thừa sang scenario vì dùng chung engine trắc nghiệm).

**Quyết định.**
- **D1 — Nạp bằng bundle esbuild IIFE.** `three@0.187.0` (runtime dep) + `esbuild@^0.28.2` (devDep). `scripts/build-three.js` bundle `node_modules/three/build/three.module.js` → `dist/src/renderer/vendor/three.global.js` (IIFE, `--global-name=THREE`, `--minify`, `--target=es2022`, ~732 KB), gắn vào chuỗi build qua `build:three`. Nạp bằng `<script>` trong `src/index.html` trước `gameplay.js`. Không bao giờ dùng CDN (CSP `script-src 'self'`).
- **D2 — Checker globals bỏ qua thư mục vendor.** Bundle minified sinh **586** cảnh báo "undefined function" giả trong `check:renderer-globals` (scanner neo theo dòng không thấy khai báo hàm nằm giữa dòng của file minified). `scripts/check-renderer-undefined-globals.js` bỏ qua tiền tố `renderer/vendor/`. Global `THREE` vẫn là trách nhiệm của renderer — load-order test và runtime kiểm tra nó.
- **D3 — Lớp dùng chung `window.threeGame`** (`src/renderer/features/three-game-interaction.ts`, IIFE + `// @ts-nocheck`), **cố ý không biết gì về tính điểm**. 7 phương thức: `isAvailable()` (có `THREE` + probe WebGL context), `mount(container, {accent, count})` → canvas full-bleed `position:absolute; inset:0; z-index:0; pointer-events:none` (thuần trang trí, nằm dưới DOM nhờ `.game-stage[data-game-world] > * { z-index: 1 }`), `unmount`, `setPaused`, `burst`, `addHoverEffect`, `addClickableObject`. Một vòng rAF cho mỗi handle; dispose đầy đủ khi unmount; `mount` trả `null` khi lỗi (fallback = 2D DOM).
- **D4 — Pilot quiz/scenario = nền trang trí + burst khi trả lời.** `gameplay.ts`: `mountThreeStage($('.game-stage', root))` ở cuối `renderQuestion` (đọc `--world-accent` để nhuộm màu), `unmountThreeStage()` ở đầu `renderQuestion` + `closePlaySurface` (đường ra duy nhất), `burstThreeStage('#34d399' | '#f87171')` ngay sau khi tính điểm trong `chooseAnswer`. 3D không chấm điểm, không đổi đáp án; nút đáp án DOM vẫn là đường nhập duy nhất. Scenario kế thừa tự động (dùng chung `renderQuestion`/`chooseAnswer`).

**Không làm.** Không nối click/hover 3D vào pilot (`addClickableObject`/`addHoverEffect` tồn tại và được unit-test, nhưng **cố ý không** gắn để tránh nhân đôi nút đáp án 2D / thêm độ phức tạp 3D không cần thiết — đúng nguyên tắc cuối của spec); không áp 3D cho treasure/race/matching trong đợt này (việc tương lai, dùng skill); không thêm physics/shader/model loader/CDN; không đổi `src/game-engine/runtime.ts` (tính điểm), LAN, presentation, SQLite, `.egame`.

**Verification.** `npm run check` 0 · `npm run build` 0 · `node tests/run-unit.js` **67/67** (thêm `tests/unit/three-game-interaction.test.ts`: API surface + fallback khi không có WebGL) · `check:renderer-globals` 0 undefined (36/37 script được quét, vendor bị bỏ qua) · `verify:css` **17/17**. Electron thật CDP 9361: `ui-three-game-check` **19/19** (WebGL khả dụng; canvas mount đúng `pointer-events:none`/`z-index:0`/`position:absolute`; burst nổ khi trả lời; tính điểm không đổi — `state.gameAnswers` = 1; vòng đời mount/unmount đúng 2 mount/2 unmount; fallback khi tắt WebGL = 2D DOM, không có canvas). Ảnh chụp `tests/ui/shots/three-quiz-backdrop.png` xác nhận emblem torus-knot hổ phách hiển thị thật.

## #138 — Skill Three.js: mở rộng 3D trang trí (backdrop + burst) sang matching, treasure-hunt và race

**Context.** DECISIONS #137 hoàn thành pilot quiz/scenario (lớp `window.threeGame` + nền trang trí + burst khi trả lời). Chủ dự án chọn mở rộng cùng cơ chế sang 4 trò còn lại ("Mở rộng 3D sang 4 trò còn lại"); scenario không cần thêm gì vì dùng chung engine `renderQuestion`/`chooseAnswer` với quiz. Nguyên tắc cuối của spec giữ nguyên: 3D chỉ trang trí, không chấm điểm, không đổi đáp án, fallback 2D khi không có WebGL.

**Quyết định.**
- **D1 — Cùng một lớp, cùng một mẫu.** Mỗi game chỉ thêm hai thứ: `mountThreeStage($('.game-stage', root))` ở cuối hàm render bàn chơi và `unmountThreeStage()` ở đầu hàm render màn kết quả (đường ra). Burst nổ ngay sau `GameAudio.play(...)` đúng/sai trong các handler trả lời hiện có — 3D phản ứng theo quyết định đúng/sai của gameplay, không tự quyết định.
- **D2 — Matching (3 chế độ).** `mountThreeStage` trong `renderColumnsBoard`/`renderMemoryBoard`/`renderCategorizeBoard`; `unmountThreeStage` ở đầu `renderMatchingResults`; burst xanh `#34d399` khi ghép đúng (`evaluateColumnMatch`/`onMemoryCardClick`/`renderCategorizeBoard` nhóm đúng) và đỏ `#f87171` khi sai. Điểm vẫn do `state.matchingPlay.matched/wrong` quản lý.
- **D3 — Treasure-hunt.** `mountThreeStage` trong `renderTreasureStage` và `renderTreasureJourneyMap`; `unmountThreeStage` ở đầu `renderTreasureResults`; burst xanh/đỏ trong `chooseTreasureAnswer` (sau `GameAudio.play`) và `treasureCompleteMission`. Điểm vẫn do `state.treasurePlay.earned` (qua `treasureRecordStage`).
- **D4 — Race (điểm đặc biệt về vòng đời).** `renderRaceBoard` **render lại toàn bộ** bàn sau mỗi câu trả lời (`answerRace` → `renderRaceBoard`), nên burst nổ trên handle cũ sẽ bị unmount ngay trước khi kịp hiển thị. Thêm biến mô-đun `raceAnswerBurst`: `answerRace` ghi màu (`#34d399`/`#f87171`) **trước** khi gọi `renderRaceBoard`, và `renderRaceBoard` (cuối hàm, sau `mountThreeStage`) nếu thấy `raceAnswerBurst` thì `burstThreeStage(...)` rồi xoá cờ. `unmountThreeStage` ở đầu `renderRaceResults`. Điểm vẫn do `state.racePlay.teams[].progress/points`.

**Không làm.** Không nối click/hover 3D (`addClickableObject`/`addHoverEffect` vẫn chỉ unit-test, không gắn — tránh nhân đôi nút đáp án 2D); không đổi `src/game-engine/runtime.ts`, LAN, presentation, SQLite, `.egame`, pipeline sinh câu hỏi; không thêm physics/shader/model loader/CDN; không đổi bất biến `verify:css`.

**Verification.** `npm run check` 0 · `npm run build` 0 · `node tests/run-unit.js` **67/67** · `check:renderer-globals` 0 undefined · `verify:css` **17/17**. Electron thật CDP 9341 (profile sạch): `ui-three-game-check` **19/19** (quiz không hồi quy) và `ui-three-game-check-4games` **41/41** — mỗi trò matching/treasure/race: WebGL khả dụng, canvas mount đúng `pointer-events:none`/`z-index:0`/`position:absolute`, burst nổ khi trả lời đúng, **tính điểm không đổi** (matching `matched=1/wrong=0`; treasure `answered=true/earned=150`; race `progress=2/points=100`), đúng 1 canvas sau mỗi lần render lại (không rò rỉ), unmount khi đóng; fallback tắt WebGL = 2D surface còn nguyên, không có canvas.

## #139 — Hệ tương tác 3D "gameplay-driven": lớp animation dùng chung + 5 pattern factory + pilot quiz/scenario

**Context.** Spec mới "Gameplay-Driven 3D Interaction System – EduGame Studio": 5 pattern tương tác (A Destruction — vỡ/biến mất khi đúng; B Unlock — mở cửa/rương khi hoàn thành; C Construction — xây dần theo mốc điểm, **không bao giờ** đổi tính điểm; D Reactive — phản hồi pointer/hover/đúng-sai khác nhau; E Celebration — confetti khi hoàn thành), hệ event dùng chung với tên khái niệm (`answer:selected/correct/incorrect`, `score:updated`, `challenge:completed`, `round:completed`, `game:completed`), cấu hình animation/cường độ, tái dùng tài nguyên Three.js, fallback 2D, giữ LAN — và nguyên tắc cuối: *"học sinh cảm thấy hành động của mình làm thay đổi thế giới trò chơi."* Chủ dự án chọn **pattern map đề xuất** (quiz/scenario = Destructible + Construction + Celebrate; matching = Unlock + Destructible + Celebrate; treasure = Unlock + Celebrate; race = Construction + Reactive + Celebrate) và **tuần tự có điểm dừng xem lại**: hạ lớp dùng chung + unit test trước → tích hợp **một** game (quiz) end-to-end với CDP check → **dừng để xem lại** trước khi mở rộng matching/treasure/race.

**Quyết định.**
- **D1 — Animation manager trong lớp dùng chung.** `tween(handle, {target, path|apply, from, to, duration, ease, onComplete})` (nội suy số hoặc object có `.lerp`/`.clone`, `path` dạng `'rotation.x'`, `apply(value, progress)` ưu tiên hơn `path`) và `effect(handle, update, ttl, onDone)` (update mỗi frame cho đến khi hết `ttl`, `onDone` gọi một lần). Handle thêm `tweens[]`/`effects[]`, được xử lý trong `step()` ngay trước lần render. Dispose không đổi.
- **D2 — 5 pattern factory trả về `{group, ...}` dispose được.** `makeDestructible({color,size,fragments})` (cụm khối vỡ tung nhờ gravity trong effect, `shatter(handle,onDone)`/`reset()`); `makeUnlockable({color})` (rương đế+nắp, `open(handle,onDone)` xoay nắp qua tween); `makeConstruction({steps,color,blockSize})` (chồng khối, `setStage(handle,n,{animate})` pop-in/out, `currentStage()`); `makeReactive({color,size})` (khối đa diện flash xanh/đỏ + scale-pop, `flash(handle,'correct'|'wrong')`); `celebrate(handle,{count})` (burst nhiều màu so le + emblem pop). Thêm `addObject(handle,obj,x,y,z)` để `gameplay.ts` **không** phải chạm vào `handle.scene` (scene vẫn là nội bộ của lớp).
- **D3 — Event registry giới hạn trong 3D.** `on(event, handler)`/`emit(event, detail)` (mỗi handler bọc try/catch). **Không** tạo bus toàn app mới — renderer vốn không có pub/sub, "kiến trúc event hiện có" là các lời gọi trực tiếp; registry này chỉ là kênh danh nghĩa cho các listener 3D, còn gameplay vẫn gọi thẳng.
- **D4 — Pilot quiz/scenario.** `buildThreeWorld()` dựng **tháp xây dựng** (dưới-trái, số bậc = số câu, `setStage(..., animate:false)` theo số câu đã đúng) và **khối phá huỷ** (trên-phải) — chỉ gọi khi `template === 'quiz'|'scenario'` (4 trò kia vẫn dùng backdrop+burst của #138). `reactThree(event, detail)` là **một** điểm nối gameplay→3D: phát `emit(event)` rồi điều khiển thế giới (`answer:correct` → burst xanh + tăng bậc tháp; `answer:incorrect` → burst đỏ + `shatter`; `game:completed` → `celebrate`). `chooseAnswer` gọi `reactThree(correct ? 'answer:correct' : 'answer:incorrect')` **sau** `state.gameAnswers.push` để số bậc tháp tính đủ câu vừa trả lời. `renderResults` mount backdrop riêng (`{world:false}`) + `reactThree('game:completed')`. 3D chỉ đọc `state.gameAnswers` để vẽ, **không chấm điểm, không đổi đáp án**.

**Không làm.** Chưa mở rộng sang matching/treasure/race (theo tuần tự có điểm dừng); không tái cài `scoreAnswer`/`scoreTextAnswer`/`scoreScenarioDecision`; không ghi vào `state.gameAnswers`/`state.answerLocked`/team từ lớp 3D; không thêm bus pub/sub toàn app; không đổi `src/game-engine/runtime.ts`, LAN, presentation, SQLite, `.egame`; không đổi bất biến `verify:css`.

**Verification.** `npm run check` 0 · `npm run build` 0 · `node tests/run-unit.js` **67/67** (mở rộng `tests/unit/three-game-interaction.test.ts`: API surface đủ 16 phương thức + `makeConstruction({steps})` sinh đúng số khối + `makeDestructible`/`makeUnlockable`/`makeReactive` sinh hình học thật + mọi action no-op trên handle null + `on/emit` truyền detail và handler ném lỗi không làm gãy `emit`) · `check:renderer-globals` 0 undefined · `verify:css` **17/17**. Electron thật CDP 9342 (instance sạch, `unset ELECTRON_RUN_AS_NODE`): `ui-three-game-reactions-check` **11/11** — trả lời sai → `isBroken()===true` + `answer:incorrect`; trả lời đúng → tháp `currentStage()===1` + `answer:correct`; hoàn thành → `celebrate>=1` + `game:completed` + màn kết quả render; **tính điểm không đổi** (sai 0 điểm, đúng 100 điểm, 2 câu = 2 bản ghi). Không hồi quy: `ui-three-game-check` **19/19**, `ui-three-game-check-4games` **41/41**. Ảnh chụp thật xác nhận emblem torus-knot + khối đỏ (destructible) + hạt hiển thị; tháp xanh xác nhận qua `currentStage()` trong CDP.

## #140 — Chế độ Xây nhà (House Building Mode) cho quiz

**Context.** Spec `docs/archive/specs/tttt.txt` ("Enhance EduGame Studio Games with Meaningful Three.js Interactions"): thêm một chế độ chơi mới **Chế độ Xây nhà** cho riêng quiz (Knowledge Arena), kế thừa hệ 3D gameplay-driven của #139. Yêu cầu cốt lõi: khởi đầu là **nhà đã xây một phần** (móng + tường cơ bản, không phải nền đất trống); mỗi câu đúng cấp **điểm xây dựng/vật liệu** (tích luỹ, bền vững); **4 mốc** (1 hoàn thiện tường, 2 mái, 3 cửa+cửa sổ, 4 vườn+trang trí); ngưỡng mốc **thích ứng số câu** để quiz ngắn vẫn thấy tiến triển; màn kết quả hiện nhà ở **đúng trạng thái thật** (không tự hoàn thiện); **streak bonus** (2 câu đúng liên tiếp → bonus vật liệu/tăng tốc; sai reset streak; sai **không** xoá vật liệu đã kiếm; không yêu cầu chuỗi dài); điểm xây dựng (bền vững) và streak (tạm thời) **tách biệt**. §7: tái dùng flow câu hỏi/tính điểm/timer/cài đặt/màn kết quả hiện có; tách trạng thái gameplay khỏi render; progression tất định và test được; xử lý init/loop/resize/cleanup; tối ưu máy lớp học; không asset 3D cloud/AI; không rewrite lớn; **Classic Mode không đổi**. §9 bước 1: thêm chọn mode; 2: logic xây dựng+streak; 3: nối event gameplay→Three.js; 4: tích hợp nhà 3D vào UI; 5: màn kết quả hiện nhà cuối; 6: test cả hai mode.

**Quyết định.**
- **D1 — Kinh tế xây dựng thuần, tách biệt khỏi render lẫn tính điểm.** Module mới `src/game-engine/house-build.ts` (`// @ts-nocheck`, plain functions + `module.exports` như `runtime.ts`) chỉ quản lý **kinh tế xây dựng**: `houseCreate()` (`{materials, streak, correct}`), `houseMilestoneThresholds(totalQuestions)` (4 ngưỡng tăng nghiêm ngặt `[ceil(t*0.25), ceil(t*0.5), ceil(t*0.75), t]`, mốc cuối = số câu nên đạt được khi trả lời đúng hết hoặc sớm hơn nhờ bonus), `houseMilestone(materials, thresholds)`, `houseApplyAnswer(state, totalQuestions, correct)` (đúng: +1 vật liệu + streak+1, mỗi 2 câu đúng liên tiếp +1 bonus; sai: streak=0, **không** trừ vật liệu), `houseSummary(...)`. Tính điểm vẫn qua `runtime.ts` nguyên vẹn.
- **D2 — Chọn mode qua `gameSetup.gameplayMode`.** `ArenaConfig` thêm `gameplayMode?: 'classic' | 'house'`; vắng mặt = `'classic'` (tương thích ngược — game đã lưu không đổi). `game-editor.ts` thêm `<select id="editGameplayMode">` (chỉ hiện khi `template === 'quiz'`), `wizard/step-configure.ts` thêm select CÁCH CHƠI cho arena, `game-project-adapter.ts` ánh xạ hai chiều. Chế độ bị **khoá vào quiz** (`isHouseMode` = `template === 'quiz' && gameplayMode === 'house'`); 4 trò kia và scenario không đụng.
- **D3 — `makeConstruction` tổng quát hoá bằng `parts`.** Thêm tuỳ chọn `parts`: mảng stage, mỗi stage = danh sách primitive (`kind: 'box'|'roof'|'cylinder'` + `w/h/d/r/color/x/y/z`); mỗi stage gom vào một `stageGroup` (hiện/ẩn bằng scale tween như cũ); `blocks` phẳng; `steps` = số stage. **Bỏ `parts` = hành vi cũ nguyên vẹn** (chồng N khối đều) — không hồi quy cho `buildThreeWorld()`.
- **D4 — Tích hợp gameplay.ts qua `houseParts()` + `reactHouse`.** 5 stage: `[0]` móng+tường cơ bản (nhà "đã xây một phần", luôn hiện), `[1]` hoàn thiện tường, `[2]` mái (slab phẳng + ống khói), `[3]` cửa+cửa sổ, `[4]` vườn (cây/trụ/hàng rào). `mountThreeStage` gọi `buildHouseWorld()` khi house mode (thay cho `buildThreeWorld()`), dựng bằng `makeConstruction({parts})` rồi `addObject(handle, group, 0, -0.6, -1.2)` + `setStage(handle, 1 + milestone, {animate:false})`. `reactThree` nếu house mode chuyển sang `reactHouse(event, detail)`: đúng → burst xanh + `setStage(1+milestone)` (+ burst vàng nếu streak bonus) + `celebrate` khi hoàn thành; sai → burst đỏ; `game:completed` → `celebrate` nếu hoàn thành. `chooseAnswer` gọi `houseApplyAnswer(...)` rồi `reactThree(...)` (kèm `house` vào detail); `renderQuestion` chèn `houseProgressHtml()` (chip 4 mốc + streak 🔥 + vật liệu) sau `.stage-progress`; `renderResults` thêm dòng `.result-house` hiện đúng trạng thái thật.

**Không làm.** Không đổi 4 game còn lại, scenario, `src/game-engine/runtime.ts`, LAN, presentation, SQLite, `.egame`; không thêm asset 3D cloud/AI (toàn primitive); không yêu cầu chuỗi dài (streak chỉ 2 liên tiếp); không tự hoàn thiện nhà khi kết thúc; không đổi bất biến `verify:css`; không rewrite lớn (thêm module mới + chèn nhỏ vào file hiện có).

**Verification.** `npm run build` 0 · `node tests/run-unit.js` **68/68** (thêm `tests/unit/house-build.test.ts`: ngưỡng thích ứng, streak bonus +1, sai reset streak nhưng giữ vật liệu, ánh xạ mốc, pointsToNext) · `check:renderer-globals` 0 undefined (37/38 script, 728 hàm, 5998 call site) · `verify:css` **17/17**. Electron thật CDP 9341 (instance sạch, `unset ELECTRON_RUN_AS_NODE`): `ui-house-building-check` **26/26** — nhà 3D mount sau stage; 1 câu đúng = +1 vật liệu/streak 1; 2 câu liên tiếp = bonus (+1) mở mốc 2; sai = reset streak giữ nguyên vật liệu; ngưỡng thích ứng (quiz 4 câu: 1 câu đúng mở mốc 1; quiz 6 câu thì không); màn kết quả hiện đúng trạng thái thật (4/4 có 🎉, 1/4 không 🎉); Classic không đổi (không `.house-progress`, không `.result-house`, tính điểm nguyên). Không hồi quy: `ui-three-game-check` **19/19**, `ui-three-game-reactions-check` **11/11**.

## #141 — Thiết kế lại Chế độ Xây nhà: mỗi câu +1/−1 phần (thay kinh tế mốc/streak của #140)

**Context.** Sau khi #140 lên, chủ dự án yêu cầu đổi hẳn trải nghiệm: khi mở game, ngôi nhà **có móng sẵn** phải hiện lên như lời giới thiệu; mỗi câu **đúng** xây thêm **đúng 1 phần** rồi mới sang câu tiếp theo; mỗi câu **sai** **xoá đúng 1 phần** (không bao giờ dưới móng); ngôi nhà chỉ gồm các **khối lập phương xếp lên nhau**, thêm cửa lớn, hai cửa sổ và một chút trang trí. Mô hình "vật liệu bền vững + streak + 4 mốc" của #140 bị thay thế: tiến triển giờ **theo từng câu**, không còn streak, không còn ngưỡng mốc.

**Quyết định.**
- **D1 — Kinh tế theo phần, thuần và tất định.** `src/game-engine/house-build.ts` rút gọn còn `houseCreate()` → `{ parts, correct, wrong }`; `houseApplyAnswer(state, maxParts, correct)` → `{ state, parts, prev, maxParts, grew, shrank, completed, completedNow }` (đúng +1, cap ở `maxParts`; sai −1, sàn 0); `houseSummary(state, maxParts)` → `{ parts, maxParts, correct, wrong, completed, remaining }`. Bỏ `HOUSE_MILESTONE_COUNT` / `houseMilestoneThresholds` / `houseMilestone`. Không đụng `runtime.ts`.
- **D2 — Nhà = chồng khối lập phương + cửa/sổ/mái/trang trí.** `houseParts()` trả 8 stage: `[0]` móng (luôn hiện — "điểm bắt đầu đã xây một phần"); `[1]`/`[3]`/`[5]` ba vòng, mỗi vòng 10 khối lập phương 0,7; `[2]` cửa lớn + tay nắm; `[4]` hai cửa sổ; `[6]` mái phẳng 2 lớp + ống khói; `[7]` trang trí (cây, bụi, lối đi). `houseMaxParts()` = 7 phần xây được.
- **D3 — Mỗi câu cập nhật cả 3D lẫn UI ngay.** `buildHouseWorld()` đặt `setStage(1 + parts)`; ở câu đầu `animate: true` để móng "pop" lên như giới thiệu, các lần mount sau `animate: false`. `chooseAnswer` cập nhật `state.houseBuild` rồi `reactThree(..., { house })`; `reactHouse` gọi `paintHouseProgress()` **trước** để thanh đếm nhảy cùng nhịp với 3D, rồi burst xanh/đỏ + `setStage(1 + parts)` (đúng: phần mới pop-in; sai: phần vừa xây co lại biến mất) và `celebrate` chỉ khi `completedNow`.
- **D4 — Thanh tiến độ thay chip mốc.** `houseProgressHtml()` → `.house-progress` với "Đã xây N/7 phần", thanh `data-progress`, gợi ý "Còn X phần nữa" / "Ngôi nhà đã hoàn thiện! 🎉"; `paintHouseProgress()` cập nhật tại chỗ (không rebuild DOM) và dùng lại `paintProgress`. `.result-house` hiện `N/7 phần` + `Đã hoàn thiện 🎉`/`Còn dang dở` — vẫn là trạng thái thật, không tự hoàn thiện.
- **D5 — Classic và 4 trò khác không đổi.** `isHouseMode` vẫn chỉ `template === 'quiz' && gameplayMode === 'house'`; phần chọn mode ở editor/wizard/adapter giữ nguyên từ #140.

**Không làm.** Không đổi `runtime.ts`, LAN, presentation, SQLite, `.egame`; không còn streak/bonus/mốc; không thêm asset 3D ngoài primitive; không đổi 4 trò khác/scenario.

**Verification.** `npm run build` 0 · `node tests/run-unit.js` **68/68** (`tests/unit/house-build.test.ts` viết lại: +1 mỗi câu đúng, −1 mỗi câu sai, sàn 0, cap `maxParts`, `completedNow` chỉ đúng lúc chạm cap) · `check:renderer-globals` 0 undefined (37/38 script) · `verify:css` **17/17**. Electron thật CDP 9341 (instance sạch, `unset ELECTRON_RUN_AS_NODE`): `ui-house-building-check` **41/41** — hình dạng nhà (móng + 7 phần, vòng 10 khối 0,7, cửa lớn, 2 cửa sổ, mái+ống khói, cây); mở game chỉ có móng (0/7, stage 1); đúng +1 phần (stage +1, thanh 1/7); sai −1 phần (stage −1, thanh về 1/7); 7 câu đúng → 7/7 + 🎉; toàn sai → 0/7 (sàn móng); Classic không đổi. Không hồi quy: `ui-three-game-check` **19/19**, `ui-three-game-reactions-check` **11/11**.

## #142 — Đưa ngôi nhà ra trước sau mỗi câu (House Showcase)

**Context.** Chủ dự án gửi ảnh mẫu "House-Building Victory in the Sky" và yêu cầu: *"cần đưa ngôi nhà ra trước cho học sinh xem thành quả"*. Trước #142, sau khi trả lời, ngôi nhà 3D vẫn nằm trong khe 3D nhỏ phía sau câu hỏi, chỉ nhích lên một phần nhỏ nên học sinh khó thấy thành quả; ảnh mẫu còn cho thấy bố cục mong muốn: ngôi nhà là **nhân vật chính** giữa sân khấu, HUD tiến độ ở trên, một thẻ phản hồi lớn ở dưới.

**Quyết định.**
- **D1 — Showcase sau mỗi câu, không đổi luồng chơi.** `chooseAnswer` (chỉ house mode) gọi `showcaseHouse()` **sau khi** feedback và nút "Tiếp tục" đã vào DOM (đo bố cục thật, không đo thẻ rỗng). Hàm này gắn `.is-house-showcase` lên `.game-stage`; CSS ẩn câu hỏi/đáp án/kicker/context/gợi ý/khe nhà, biến `.stage-center` thành một cột dồn xuống đáy, feedback thành thẻ lớn 760px và nút "Tiếp tục" nằm dưới thẻ. Ngôi nhà 3D tween 0,55 s ra giữa khoảng trống. Câu tiếp theo render lại `.game-stage` nên mọi thứ tự trở lại bình thường; không đổi `state`, không đổi tính điểm, không đổi luồng `answerLocked`/`nextQuestionBtn`.
- **D2 — Khe 3D giữ chỗ trong lúc hỏi.** Bỏ ảnh minh hoạ giả trong house mode, thay bằng `.house-stage-slot` (cao `clamp(110px,16vh,160px)`, `pointer-events:none`) để ngôi nhà (móng hoặc phần đã xây) luôn hiện đúng chỗ thay vì nhảy lung tung giữa các câu. `houseTarget()` chiếu tâm khe qua camera bằng `stagePoint` rồi đặt nhóm 3D theo **pixel**, nên mọi kích thước cửa sổ đều khớp.
- **D3 — Lớp dùng chung có thêm `stagePoint` + tuỳ chọn `emblem`.** `threeGame.stagePoint(handle, fx, fy, z)` đổi toạ độ màn hình (0..1) sang toạ độ thế giới trên mặt phẳng z, trả kèm `pxPerUnit` để caller đặt vật thể theo pixel; `mount(..., { emblem: false })` ẩn emblem trang trí để nó không tranh chỗ với nhà. Không thêm API nào khác, không đụng vòng đời mount/unmount.
- **D4 — Đặt nhà theo dải trống đo được, không đoán.** Khi showcase, `houseTarget()` đo dải từ **đáy thẻ tiến độ** (`.house-progress`) đến **đỉnh thẻ phản hồi** (`#answerFeedback`), chừa 4px mỗi đầu, rồi fit nhà vào dải đó. Hệ số lấp đầy là **0,78** (không phải 1): nhà sâu ~2,3 đơn vị và camera gần nên các góc gần của khối chiếu ra ngoài mặt phẳng tâm; đo thực tế ở 1600×1000 cho thấy fill 0,94 làm mái chạm HUD và chân nhà chui dưới thẻ (+40px), còn 0,78 giữ ~10px không khí hai phía. **Không** dùng dải dự phòng 0,3..0,68 khi dải đo được nhỏ — chính dải dự phòng đó gây đè lên HUD ở cửa sổ thấp; nếu dải không đo được (thẻ chưa layout) thì giữ nhà ở khe, không đoán.
- **D5 — Sân khấu bị ghim vào vùng nhìn thấy, không phải chiều cao nội dung.** Ẩn câu hỏi làm `.game-stage` co lại và thẻ phản hồi làm nó phình quá viewport (đo 957px so với đáy modal 950px ở 1600×1000). `showcaseStageHeight()` ghim `min-height` = `min(đáy modal, đáy cửa sổ) − đỉnh stage`, và ghim lại khi resize/fullscreen (vì chiều cao viewport đổi). Nhờ vậy nút "Tiếp tục" luôn nằm trong màn hình và canvas không đổi kích thước giữa animation.
- **D6 — HUD gọn trong showcase, feedback nêu đáp án đúng.** `.house-progress` trong showcase bỏ dòng gợi ý và thu padding (85px → 50px) để nhường chiều cao cho nhà, vẫn đủ "Đã xây N/7 phần" + thanh tiến độ như ảnh mẫu. Trắc nghiệm: banner thêm "Đáp án đúng: …" (chỉ house mode) để học sinh thấy thành quả đi kèm lời giải thích. Màn kết quả mount với `{ world: !house }` — house mode không vẽ nhà 3D sau chữ kết quả (đã có dòng `.result-house`), classic không đổi.

**Không làm.** Không đổi `game-engine/runtime.ts`/`house-build.ts`, 4 trò khác, scenario, LAN, presentation, SQLite, `.egame`; không thêm asset/ảnh/đảo bay/trời mây (ảnh mẫu chỉ là tham chiếu bố cục — toàn bộ cảnh vẫn là primitive); không đổi vòng đời mount/unmount; không biến 3D thành nơi chấm điểm.

**Verification.** `npm run build` 0 · `node tests/run-unit.js` **68/68** · `check:renderer-globals` 0 undefined (37/38 script, 734 hàm, 6062 call site) · `verify:css` **17/17**. Electron thật CDP 9341 (instance sạch, `unset ELECTRON_RUN_AS_NODE`): `ui-house-building-check` **57/57** — thêm các kiểm tra hình học: `.is-house-showcase` xuất hiện sau mỗi câu; câu hỏi/đáp án ẩn; khe nhà thay ảnh minh hoạ; emblem bị park; tâm stage chiếu đúng gốc toạ độ; nhà phóng to >1,4× khe; **stage phủ đúng vùng nhìn thấy** (`stageBottom == modalBottom`); **hộp 3D chiếu thật (8 góc AABB) nằm giữa đáy HUD và đỉnh thẻ phản hồi**; banner nêu đáp án đúng; "Tiếp tục" hiện; câu sau khôi phục câu hỏi + khe + tỉ lệ cũ; sai cũng showcase; Classic không bao giờ showcase. Không hồi quy: `ui-three-game-check` **19/19**, `ui-three-game-reactions-check` **11/11**, `ui-presentation-check` **60/60**, `ui-play-surface-check` **156/156**, `ui-stage-illustration-check` **169/169**, `ui-game-worlds-check` **42/42**. Ảnh chụp 1600×1000 (`1-question`, `2-showcase-1part`, `3-showcase-complete`, `4-showcase-fullscreen`, `5-results`) và 1266×683 xác nhận bố cục; ở chiều cao 683px (cửa sổ tối thiểu trên màn 1280×720) nhà buộc phải nhỏ vì thẻ phản hồi chiếm chỗ — không đè lên HUD/banner, nhưng đây là giới hạn không gian chứ không phải kích thước mục tiêu.

## #143 — Mục tiêu số phần nhà theo số câu hỏi

**Context.** Chủ dự án đề nghị: *"có lẽ nên cho chọn số lượng câu hỏi ví dụ: 5 và 8 câu để hoàn thành ngôi nhà hoặc 1 cơ chế linh hoạt giúp số lượng nào cũng có thể hoàn thành được ngôi nhà khi trả lời đúng tất cả câu hỏi"*. Số câu hỏi đã chọn được từ trước (wizard `questionCount` 1–30, editor nhập CSV/thêm câu), nhưng nhà cố định 7 phần nên quiz 5 câu **không bao giờ** hoàn thiện được (tối đa 5/7), còn quiz 8 câu hoàn thiện ở câu 7 và câu 8 không xây gì. Mục tiêu: mọi độ dài quiz đều có thể hoàn thiện nhà khi trả lời đúng tất cả.

**Quyết định.**
- **D1 — Mục tiêu phần = số câu hỏi (tối đa số stage của nhà).** `houseTargetParts(game)` = `min(8, questions.length)`, tối thiểu 1. Kinh tế giữ nguyên #141: câu đúng **+1 phần**, câu sai **−1 phần** (sàn móng, không âm). Hệ quả: quiz ≤ 8 câu hoàn thiện **đúng ở câu cuối** khi đúng hết; quiz dài hơn hoàn thiện sau **8 phần ròng** và giữ nguyên trạng thái hoàn thiện cho các câu còn lại. Không có phần lẻ, không đổi công thức +1/−1.
- **D2 — Tách ống khói thành phần xây thứ 8.** `houseParts()` trước đây gộp mái + ống khói ở stage 6; nay stage 6 = hai tấm mái, stage 7 = ống khói, stage 8 = trang trí (cây/bụi/lối đi). Nhà có **móng + 8 stage xây được** (`houseMaxParts()` = 8, tổng 9 stage với móng). Nhờ đó quiz mặc định 8 câu hoàn thiện đúng câu 8, một phần một stage.
- **D3 — Chia stage 3D theo mục tiêu, không thêm bớt hình học.** `houseVisualStages(parts, target)` = `ceil(8 × parts / target)` (kẹp 0..8). `setStage(1 + visualStages)`: quiz 5 câu → mỗi phần hiện 1–2 stage (stage 3→5→6→8→9 theo phần 1..5); quiz 8 câu → mỗi phần đúng 1 stage (stage 2→3→…→9). Nhà đạt **đủ 8 stage đúng lúc chạm mục tiêu** (5/5 hay 8/8 đều là ngôi nhà đầy đủ). Phép ceil đơn điệu và dồn về đầu nên câu đúng đầu tiên **luôn** làm nhà thay đổi; câu sai gỡ đúng nhóm vừa hiện (1–2 stage). Không remount, không đổi `makeConstruction`.
- **D4 — Mọi nơi hiển thị dùng mục tiêu động.** `.house-progress` ("Đã xây N/5", "N/8"), thanh phần trăm, gợi ý "Còn X phần", `.result-house` và điều kiện `completedNow` đều lấy `houseTargetParts`; `paintHouseProgress()` cập nhật tại chỗ như cũ. Editor thêm câu giải thích "Ngôi nhà chia đều theo số câu hỏi (tối đa 8 phần): trả lời đúng tất cả sẽ hoàn thiện"; wizard đổi nhãn "Xây nhà 3D (theo số câu)".
- **D5 — Không đụng chấm điểm và các chế độ khác.** `runtime.ts`, Classic mode, 4 trò còn lại, scenario, LAN/presentation/SQLite/`.egame` giữ nguyên. Game đã lưu tự nhận hành vi mới vì mục tiêu suy ra từ số câu thực tế của game (không cần migration).

**Không làm.** Không cho chọn tay "số phần nhà" tách khỏi số câu; không thêm preset 5/8 câu riêng (đã có ô SỐ CÂU HỎI); không chia phần lẻ/điểm vật liệu; không tự hoàn thiện nhà khi hết câu nếu còn thiếu phần; không đổi công thức +1/−1 của #141; không thêm asset 3D.

**Verification.** `npm run build` 0 · `node tests/run-unit.js` **68/68** (`house-build.test.ts` thêm: mục tiêu 5 → 5 câu đúng hoàn thiện, mục tiêu 8 → 8 câu đúng hoàn thiện, 4/5 chưa hoàn thiện, mục tiêu 1 hoàn thiện sau 1 câu, mục tiêu kẹp ≥1) · `check:renderer-globals` 0 undefined (37/38 script, **736** hàm, **6071** call site) · `verify:css` **17/17**. Electron thật CDP 9341 (instance sạch, `unset ELECTRON_RUN_AS_NODE`): `ui-house-building-check` **67/67** — hình dạng móng + 8 phần (9 stage); quiz 6 câu: mục tiêu 6, 4/6 dang dở, stage 3→4→3→4→5→7 theo phần; **quiz 5 câu: 5/5 hoàn thiện đúng câu 5, stage đủ 9**; **quiz 8 câu: 8/8 hoàn thiện đúng câu 8, mỗi phần 1 stage**; quiz 3 câu toàn sai: 0/3; Classic không đổi. Không hồi quy: `ui-three-game-check` **19/19**, `ui-three-game-reactions-check` **11/11**, `ui-game-worlds-check` **42/42**, `ui-presentation-check` **60/60**, `ui-play-surface-check` **156/156**, `ui-stage-illustration-check` **169/169**, `ui-three-game-check-4games` **41/41**. Ảnh chụp 1600×1000 (`house-shots-143`: 5 câu ở 1/5, 3/5, 5/5; 8 câu ở 8/8; màn kết quả) xác nhận nhà đầy đủ ở 5/5 và 8/8, nằm giữa HUD và thẻ phản hồi.

## #144 — Hiện thành quả nhà ở màn kết quả + 4 mẫu nhà

**Context.** Chủ dự án yêu cầu: *"cho hiển thị thành quả ngôi nhà ở phần kết quả trò chơi. Bổ sung nhiều mẫu nhà khác nhau tăng tính đa dạng"*. #142 cố ý để màn kết quả **chỉ có chữ** (`.result-house`), nên học sinh không thấy thành quả 3D khi kết thúc; đồng thời chỉ có một ngôi nhà duy nhất nên mọi game trông giống nhau. Cần đưa nhà thật trở lại màn kết quả mà không làm màn hình cao hơn, và thêm nhiều mẫu để giáo viên chọn hoặc để hệ thống tự phân bổ.

**Quyết định.**
- **D1 — Hero 3D tái dùng khe của gameplay.** `renderResults()` (house mode) dựng `.result-screen.is-house-result` thành grid 2 cột: trái `.result-house-hero` chứa `.house-stage-slot` + `.result-house` + `.result-house-style`; phải `.result-summary` giữ nguyên điểm/thống kê/nút. Vì hero dùng đúng `.house-stage-slot`, `houseTarget()` và `placeHouse()` không cần code mới; `mountThreeStage` dựng lại thế giới từ `state.gameAnswers` nên nhà hiện đúng số phần cuối. Dưới 980px xếp một cột. Classic không đổi (vẫn backdrop trang trí, không hero).
- **D2 — Fill riêng cho hero.** Đo thực tế ở 1600×1000 với fill 0,92 của khe trả lời: hộp 3D tràn ~31px sang trái và 16px xuống dưới, chạm dòng caption. Thêm `HOUSE_RESULT_FILL = 0.8` chỉ cho `.result-house-hero` (khe trả lời vẫn 0,92); hộp nhà lọt trong slot (đo lại 284..642 × 420..687 so với slot 280..706 × 377..697). Không đổi công thức project/scale, chỉ đổi hệ số lấp đầy theo ngữ cảnh.
- **D3 — Bốn mẫu dùng chung hợp đồng 9 stage.** `houseParts(style)` điều phối `nha-mai-do` (giữ nguyên hình #141/#143 từng byte để test hình dạng cũ vẫn đúng), `nha-vuon`, `thap-canh`, `nha-go`; mỗi mẫu vẫn là móng + 8 stage xây, nên kinh tế +1/−1 và `houseVisualStages` độc lập với mẫu. Mỗi mẫu có bao hình đo riêng trong `HOUSE_BOUNDS` (`w`×`h`) để `houseTarget()` co giãn/đặt đúng; bỏ `HOUSE_WORLD_W/H` cố định.
- **D4 — Chọn mẫu lưu ở `gameSetup.houseStyle`, auto ổn định.** `ArenaConfig.houseStyle?: 'auto' | HouseStyle` (quiz-only). `houseStyleFor(style, seed)`: id hợp lệ thắng; ngược lại băm `game.id` (`hash*31 + charCode`) chọn một trong 4 mẫu ⇒ cùng một game luôn cùng nhà khi mở lại, các game khác nhau có thể khác nhà; seed rỗng → `nha-mai-do`. Editor thêm select `#editHouseStyle` (chỉ quiz, lưu/xoá qua `withEditorHouseStyle`), wizard thêm "MẪU NHÀ 3D (XÂY NHÀ)", adapter ánh xạ hai chiều và bỏ giá trị lạ từ dữ liệu cũ.
- **D5 — Sửa lỗi schema làm rơi trường cấu hình.** Arena `gameConfigSchema` (Zod) trước đó không khai báo `gameplayMode`/`houseStyle`; vì `z.object` mặc định strip key lạ, `parseGameConfig` sẽ nuốt cả hai trước khi `gameSetupFor` đọc. Thêm hai trường optional vào schema và có unit test giữ-trường + từ chối giá trị lạ. Không đổi hành vi config cũ (vắng mặt vẫn hợp lệ).

**Không làm.** Không đổi kinh tế/mục tiêu nhà (#141/#143), scoring, 4 trò khác, scenario, LAN/presentation/SQLite/`.egame`; không thêm asset/ảnh/texture ngoài primitive; không cho giáo viên chỉnh tay hình học từng mẫu; không đổi API `window.threeGame`.

**Verification.** `npm run build` 0 (EPERM khi dọn `dist/server/index.js` do app đang chạy) · `node tests/run-unit.js` **68/68** (registry/auto/explicit; parse giữ `gameplayMode`+`houseStyle`; adapter round trip + loại style lạ) · `check:renderer-globals` 0 undefined (37/38 script, **747** hàm, **6119** call site) · `verify:css` **17/17**. Electron thật CDP 9341: `ui-house-building-check` **84/84** — 4 mẫu đủ 9 stage/8 phần xây và hình khác nhau, bounds riêng (tháp hẹp hơn nhà gỗ, nhà vườn thấp hơn nhà mái đỏ), auto ổn định và khác nhau giữa `ui-house-5`/`ui-house-8`, `auto` ≡ id lạ, seed rỗng → mái đỏ; override `thap-canh` vào đúng world + caption; hero 2 cột, slot ≥200px, nhà đúng stage cuối, caption "Mẫu: …" khớp mẫu 3D, AABB nằm trong slot; classic không có hero. Không hồi quy: `ui-three-game-check` **19/19**, `ui-three-game-reactions-check` **11/11**, `ui-game-worlds-check` **42/42**, `ui-presentation-check` **60/60**, `ui-play-surface-check` **156/156**, `ui-stage-illustration-check` **169/169**, `ui-three-game-check-4games` **41/41**. Ảnh chụp 1600×1000: `tests/ui/shots/house-result-nha-mai-do.png`, `-nha-vuon`, `-thap-canh`, `-nha-go` — cả 4 mẫu hoàn thiện, không đè caption/tổng kết.

## #145 — Rollout pattern gameplay sang matching / treasure / race

**Context.** Mục roadmap còn mở của #139/#144: pattern mới chỉ được lái ở quiz/scenario. Cần đưa `makeUnlockable`/`makeDestructible`/`makeReactive`/`makeConstruction`/`celebrate` vào 3 trò còn lại qua đúng một dispatcher, giữ 2D là nguồn quyết định đúng/sai và không đụng chấm điểm (`game-engine/runtime.ts`).

**Quyết định.**
- **D1 — Mỗi trò một thế giới 3D riêng.** `mountThreeStage()` dựng `buildMatchingWorld()` / `buildTreasureWorld()` / `buildRaceWorld()` theo `game.template`, đặt cùng chỗ với thế giới quiz (trái-dưới cho object "tiến độ", phải-trên cho object "phản hồi") để không đổi bố cục DOM.
- **D1b — Đặt theo phân số màn hình, không theo toạ độ thế giới (sửa sau khi soi ảnh chụp).** Toạ độ thế giới cố định không dùng được cho 3 mẫu này: bố cục compact (modal hẹp, cao, có khi cuộn) và fullscreen (rộng, thấp ở 1366×768) khác nhau quá xa, nên một cặp `x/y` đọc là "lề ngoài" ở mẫu này lại rơi giữa lưới đáp án ở mẫu kia. Thêm `threeGame.anchor(handle, object, fx, fy, z)` giữ vật thể ở phân số màn hình `0..1` (gốc trái-trên) và **chiếu lại mỗi frame trong `step()`**, vì native fullscreen được main process áp dụng bất đồng bộ sau khi surface đã render; camera cũng lấy `aspect` ngay trong `mount()` để `stagePoint()` gọi đồng bộ sau mount không lệch trục ngang. `gameplay.ts` dùng helper `addAnchoredObject()`: matching đặt rương/khối ở lề phải (0.93, 0.47/0.32) — lề phải trống ở cả hai mẫu, lề trái đã có emblem; treasure đặt rương ở dải trống dưới thẻ đáp án (0.28, 0.86); race đặt tháp ở dải trống dưới thẻ lượt chơi (0.06, 0.93) và cầu ở dải trên thanh trạng thái (0.962, 0.03) — race là bảng dày nhất nên **ở 1366×768 fullscreen thẻ lượt chơi đã tràn stage** (giới hạn mật độ có từ trước), tháp bị khuất sau thẻ ở cỡ đó; phản ứng vẫn thấy qua cầu + burst/confetti. Vật thể vẫn tỉ lệ theo chiều cao stage (world unit), nên ở modal cao chúng có thể nằm dưới vùng nhìn cho tới khi cuộn — chấp nhận vì modal là bản xem trước.
- **D2 — Pattern theo trò.** Matching: **Unlock** (rương mở khi ghép đủ cặp) + **Destructible** (khối vỡ khi ghép sai) + **Celebrate** (hoàn thành hiện thanh chờ kết quả). Treasure: **Unlock** (rương của chặng mở khi trả lời đúng) + **Celebrate** (chặng cuối). Race: **Construction** (tháp cao thêm 1 khối mỗi câu đúng) + **Reactive** (quả cầu chớp xanh/đỏ mỗi câu) + **Celebrate** (câu trả lời ấn định đội thắng). Quiz/scenario và house mode giữ nguyên.
- **D3 — Một dispatcher, event theo trò.** `reactThree(event, detail)` phát `threeGame.emit` rồi rẽ nhánh theo template; matching dùng `match:correct`/`match:incorrect`, treasure/race dùng `answer:correct`/`answer:incorrect`, `game:completed` cho cả ba. Các handler (`evaluateColumnMatch`, `onMemoryCardClick`, nhánh phân loại, `chooseTreasureAnswer`, `treasureCompleteMission`, `answerRace`) thay `burstThreeStage` trực tiếp bằng `reactThree` — không tự chấm điểm, không đổi DOM feedback.
- **D4 — Khối vỡ tự hồi để ghép sai lặp lại được.** `makeDestructible.shatter()` chỉ chạy một lần cho tới khi `reset()`; sau khi vỡ, một `threeGame.effect(..., 1.3s)` gọi `reset()` để lần ghép sai sau vẫn thấy hiệu ứng. Rương `open()` giữ tính one-shot.
- **D5 — Race sống qua lần vẽ lại toàn bảng.** Bảng đua repaint sau mỗi câu, nên tháp được dựng lại từ `state.racePlay.correctCount` (bộ đếm **chỉ để trình diễn**, khởi tạo 0 trong `openRacePlay`), dựng ở `count-1` rồi `setStage(count)` để khối mới nảy vào; phản ứng và confetti đi theo `raceAnswerBurst`/`raceAnswerCelebrate` sang handle mới, y như cơ chế burst của #138.
- **D6 — Không đổi giao diện.** Không thêm markup/CSS; 3D vẫn nằm sau `.game-stage` với `pointer-events: none`. Không đổi `window.threeGame`, `runtime.ts`, house mode, LAN/presentation/SQLite/`.egame`.

**Không làm.** Không thêm clickable/hover 3D cho 3 trò (giữ nguyên kết luận của #138/#139 là DOM là đường nhập duy nhất); không cho rương mở dần theo từng cặp; không thêm hiệu ứng ở màn kết quả (đã unmount trước khi render); không đổi thứ tự mount hay số canvas.

**Verification.** `npm run build` 0 · `node tests/run-unit.js` **68/68** · `check:renderer-globals` 0 undefined (37/38 script, **756** hàm, **6192** call site) · `verify:css` **17/17**. Electron thật CDP (mỗi nhóm một instance sạch, `env -u ELECTRON_RUN_AS_NODE`): `ui-three-game-patterns-check` **31/31** — matching dựng đúng 1 rương + 1 khối, ghép sai làm khối vỡ rồi tự hồi, ghép đủ 2 cặp mở rương + celebrate + phát `match:correct`/`game:completed`, thanh chờ kết quả vẫn do 2D giữ; treasure trả lời sai chỉ mất 1 lượt (rương kín, earned 0), trả lời đúng mở rương, cộng đúng 150 điểm, chặng cuối celebrate; race tháp 0 → 1 khối, cầu chớp xanh khi đúng/đỏ khi sai, câu ấn định thắng celebrate, điểm/ô đua không đổi (2 ô, 100 điểm), luôn đúng 1 canvas sau mỗi lần repaint. Không hồi quy: `ui-three-game-check` **19/19**, `ui-three-game-reactions-check` **11/11**, `ui-three-game-check-4games` **41/41**, `ui-house-building-check` **84/84**, `ui-game-worlds-check` **42/42**, `ui-presentation-check` **60/60**, `ui-play-surface-check` **156/156**, `ui-stage-illustration-check` **169/169**. Ảnh chụp fullscreen 1920×1080 + 1366×768 với fixture thật (`tests/ui/shots/probe-fs-*`, `race-fix-*`): matching/treasure sạch chữ, race thấy cầu ở cả hai cỡ và tháp ở 1920 (1366 tháp khuất sau thẻ lượt chơi — ghi ở D1b).
