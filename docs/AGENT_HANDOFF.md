# Agent Handoff — Start Here

You are taking over development of **EduGame Studio v0.3**. This file is the source of truth for product intent and known status. Inspect the code before assuming that a feature is complete.

## One-sentence product description
EduGame Studio is a Windows Electron + TypeScript app that helps teachers create educational games from lesson materials, stores games locally, and lets saved games play offline; cloud AI generation is mediated by a backend so provider keys are never shipped in the desktop app.

## Read in this order
1. `AGENTS.md` — working rules.
2. `docs/PROJECT_BRIEF.md` — product goals and scope.
3. `README.md` — setup, current features, configuration.
4. `docs/ARCHITECTURE.md` — desktop/cloud design and security boundaries.
5. `docs/STATUS.md` — incomplete areas and verification status.
6. `docs/DECISIONS.md` — decisions already made.
7. `docs/ROADMAP.md` — planned sequence.

## Architecture map
- `src/main.ts`: Electron main process, local database, IPC handlers, document operations.
- `src/preload.ts`: allowlisted IPC API exposed to renderer.
- `src/index.html`: desktop window shell and ordered renderer script/style loading.
- `src/renderer/pages/`: individual screens (home, game library, creation, sessions, settings).
- `src/renderer/features/`: UI flows (document assistance, local AI, game editor/play, results).
- `src/renderer/core/`: renderer initialization, navigation, and page wiring.
- `src/renderer/styles/`: global, layout, shared components, page-specific, and responsive CSS.
- `src/renderer/shared.ts`: shared renderer state and UI helpers.
- `src/shared/types.ts`: shared contracts/types.
- `src/services/` — game-service (normalize), game-validation (4 template validators), question-import (CSV/TSV/XLSX), ai-game-normalize (AI draft normalize), ai-game-design (treasure/race builder), and the lesson-to-game workflow: lesson-contracts/lesson-types (zod), game-project-adapter (draft ⇄ `EducationalGame`), lesson-store (sidecar tables + lesson files), ai-transport (typed errors + request registry), lesson-prompts/lesson-normalize/lesson-workflow (analyze/recommend/generate), lesson-projects (wizard step machine).
- `src/game-engine/runtime.ts`: game runtime (scoring, text answers, dedupe helpers).
- `server/index.ts`: Express AI Gateway scaffold.
- `server/schema.sql`: Supabase tables/RPC for usage quotas.
- `tests/`: unit tests (runtime, AI manager, model/runtime installer, model catalog, document-assist, question-import, game-validation, ai-game-normalize, ai-game-design, lesson-contracts, game-project-adapter, ai-transport, lesson-workflow, lesson-projects, lesson-store) run by `npm test`; `tests/smoke56-63.js` are CDP UI smokes (need `electron . --remote-debugging-port=9333`); `tests/legacy/` holds older smokes kept for history.

## Do not break these invariants
1. Saved game playback works offline.
2. Game package `.egame` remains portable.
3. Renderer does not gain direct Node.js access.
4. No product-owned Gemini/OpenAI key or Supabase service-role key in desktop code or installer.
5. AI output is validated data rendered by trusted engines, not arbitrary executable code.
6. Quotas are checked server-side, not trusted from the desktop client.
7. Do not claim tests/build passed unless commands were run and results observed.

## First task for the new agent
Read the latest dated update in `docs/STATUS.md` before relying on older notes. Do not start with a large rewrite or new features. Establish the actual build/test state:

```bash
npm install
npm run check
npm test
npm start
```

Run commands in order, fix the first reproducible errors, and report exact command output/summary. If native dependencies fail on the current OS, distinguish environment/toolchain issues from application defects. On Windows, separately test:

```bash
npm run dist:win
```

Then manually verify save/reopen, `.egame` export/import, and offline gameplay.

## Current development focus
Product direction is **Offline AI V1**: local llama.cpp/Qwen is the active document-assist path. The Supabase/Gemini Gateway is a legacy scaffold and is not wired to the desktop; do not treat Gateway integration as the next task unless the product owner explicitly changes scope.

Tasknight spec (`docs/tasknight.txt`, §2–§7) core features are implemented and unit/CDP-smoke verified — see the **"tasknight — Trạng thái đã làm / chưa làm"** checklist at the top of `docs/ROADMAP.md` for the authoritative done/not-done list (AI generation for treasure/race journeys, per-question AI regeneration, and drag-drop editors remain open; online real-model end-to-end is verified via `tests/smoke60.js` 43/43, local-runtime e2e is not). Repository cleanup on 2026-10-18 removed scratch scripts/reports from the root and moved retired smokes to `tests/legacy/`.

Active workstream as of 2026-10-18: **Tailwind CSS migration + UI/UX refresh** — **complete** (G0–G5); see `docs/STATUS.md`. Rules that still apply: `app.css` is the only stylesheet (single `<link>` in `src/index.html`) — put component CSS in its `@layer components`, never re-add separate `<link>` tags, and keep the `@layer base` UA-revert block; new utilities can be added directly in markup; do not rename the selectors the smokes and renderer depend on (list in ROADMAP); UI/UX may be redesigned creatively (owner directive) but functional selectors and offline behavior must not break. `npm run build` must include `build:css` or `dist` ships without utilities. Verify with `npm run check`, `npm test` (11 suites), and the CDP smokes.

Before new features: re-run `npm run check`, `npm test`, and the current CDP smokes (`tests/smoke56-63.js`); update `docs/STATUS.md` after each task. Preserve offline behavior and security boundaries, and add tests for behavior changes.

**2026-10-19 update:** the Tailwind workstream (G0–G5) is **complete** (`app.css` is the only stylesheet; keep adding component CSS to its `@layer components`, never re-add `<link>` tags), and the last two tasknight authoring gaps — drag-drop reorder in the matching editor and the race special-cell drag-drop + visual track preview — are **done** (`tests/smoke63.js` 49/49; details in STATUS). Remaining known-open work: drag-drop **during play** (matching columns), images/audio in games, treasure map UI, per-question AI regenerate, difficulty-distribution enforcement in AI generation, and Supabase login + Gateway wiring.

**Windows packaging (verified 2026-10-19):** `npm run dist:win` now succeeds and produces `release/EduGame-Studio-Setup-0.3.0.exe`; the packaged app was launched from `release/win-unpacked` and passed `tests/smoke63.js` 49/49. Environment gotcha on this machine: electron-builder's `app-builder.exe rcedit` step downloads `winCodeSign-2.6.0`, whose macOS `.dylib` symlinks cannot be extracted without admin/Developer Mode. Workaround used: `7za x <cache>\winCodeSign\<random>.7z -o<cache>\winCodeSign\winCodeSign-2.6.0 -x!darwin -y` (using the archive from the failed attempt) so the cache is pre-populated; the build then skips the download. Do **not** commit `node_modules` edits. Real fix for other machines: enable Windows Developer Mode or run the build elevated.

**2026-10-19 update — AI-assisted Lesson-to-Game (P1–P5 done):** the approved plan for the new workflow is `docs/implementation-plan.md` (P0–P7). P1 added `src/shared/lesson-types.ts`, `src/services/lesson-contracts.ts`, `src/services/game-project-adapter.ts` (one adapter between typed drafts and `EducationalGame`). P2 added `src/services/lesson-store.ts` (4 sidecar tables + `userData/lessons/<id>.txt`) and IPC `lesson:save-document`/`lesson:get-document`/`project:save-draft`/`project:get`/`project:list`/`project:delete`. P3 added `src/services/ai-transport.ts` (typed `AiTransportError`, `AiRequestRegistry`, `requestChatJson`), `lesson-prompts.ts`, `lesson-normalize.ts`, `lesson-workflow.ts` (`runStructuredStep` + `analyzeLesson`/`recommendGames`/`generateGameDraft` with one repair retry) and IPC `ai:cancel`. P4 wired the workflow into the app: `src/services/lesson-projects.ts` (step machine + `GameProject` assembly) and IPC `lesson:analyze`/`lesson:recommend`/`lesson:get-analysis`/`lesson:recommendations`, driven by a **local-only** `createLessonChatClient()` in `main.ts` (refuses with `AI_NOT_RUNNING` unless the llama.cpp runtime is READY; never falls back to cloud). `npm test` now has **17 suites**. **Testing gotchas:** (1) `better-sqlite3` is compiled for Electron's ABI, so SQLite tests must run through `node tests/run-electron-node.js <dist-test.js>` (sets `ELECTRON_RUN_AS_NODE=1`); running them with plain `node` fails with `NODE_MODULE_VERSION` mismatch. (2) The workflow is only tested with mocks so far — the analyze/recommend happy path with a real local model is P6 (real llama.cpp/Qwen not yet installed on this machine). Do not add the new sidecar tables to `saveDb` or `games`; the workflow is local-only and never sends lesson text to cloud AI.

**2026-10-19 update — P5 wizard 1–4 + "Tạo trò chơi" is manual-only:** owner instruction: the legacy create page must be **manual authoring only**; AI belongs in the new lesson workflow (DECISIONS #15). Concretely:
- New page `src/renderer/pages/create-wizard.ts` (step router, stepper, error/status banners, project sidebar, delegated events in `wireCreateWizard`) + `src/renderer/features/wizard/{state,step-input,step-analysis,step-recommend,step-configure,step-generate}.ts`. Wizard state lives in `features/wizard/state.ts` (`wizardState`), **not** in global `state` (only `state.page` is added). UI is plain template strings in `// @ts-nocheck` classic scripts, matching the rest of the renderer. Step 5 `generate` is an honest `disabled` placeholder ("Sắp có · P6").
- `src/renderer/pages/create.ts` was rewritten manual-only: no content-source chips, no document textarea, no AI analyze buttons, no `#generationMode`, no local/cloud AI panels, no `renderDocumentAssistResults`. `features/game-generation.ts` now just calls `createBlankGame()` (open an empty editor for the chosen genre). Dead create-page handlers were removed from `core/controller.ts` (`[data-source]`, `#generationMode`, `#analyzeLocal/CloudDocumentBtn`, `#sourceText`, `#documentQuestion`, `#useSuggestedQuestionsBtn`, `#regenerateSuggestedQuestionsBtn`, `[data-recommended-template]`). `ai:generate-game` / `ai:document-assist` in `main.ts` are still present but unreachable from the UI (P7 cleanup decision). `tests/smoke60.js` → `tests/legacy/smoke60.js` (marked RETIRED, do not run).
- New IPC `lesson:save-analysis` (persist teacher edits to the analysis without calling AI) + bridge `saveLessonAnalysis`. `LessonWorkflowError` now embeds `[CODE] ` into `message` because Electron's IPC only serializes `message`; the renderer strips it and shows friendly Vietnamese via `wizardErrorMessages`.
- Recommendation ids are now analysis-scoped (`idPrefix: rec_<analysisId>_` in `main.ts`) because `game_recommendations.id` is a global PRIMARY KEY and the old index-based ids collided on a second lesson.
- **Test seam (dev-only):** `loadLessonTestFixture` in `main.ts` reads `EDUGAME_AI_TEST_DIR` only when `!app.isPackaged`; fixtures are named after the request `responseSchema.name` (`lesson_analysis.json`, `game_recommendations.json`) or a `__testDouble` marker forcing a typed error (DECISIONS #16). A packaged build always ignores it, so the shipped app cannot fake AI. Fixtures: `tests/fixtures/wizard/{happy,fail-output,fail-runtime}`.
- Verified: `npm run check`, `npm test` (17 suites), `smoke64` **37/37** (happy path over real IPC/store with fixture model replies), `smoke65 runtime` **18/18** + `smoke65 output` **14/14**, regression `smoke56` **56/56** (manual create → empty treasure/race editor), `smoke62` **9/9**, `smoke63` **49/49**.

**2026-10-19 update — P6 generation + editor (5 types, real local model):** the wizard's step 5 is now real. `lesson:generate` (main) loads the saved project + analysis, calls `generateGameDraft` through the local-only client, then `toEducationalGame` (the single adapter) and the legacy per-template validators before storing `draft` + `gameSnapshot` with `step: 'edit'`, `status: 'ready'` (`applyDraft` in `src/services/lesson-projects.ts`). The renderer (`src/renderer/features/wizard/step-generate.ts`) shows what the model actually produced, opens the normal editor (`openEditor`) so the teacher reviews/edits, and saves to the library to play offline. Reopening a saved project restores the snapshot and never calls the model again. New bridge method `generateLessonDraft`. Failure codes: transport/AI codes as before, plus `GENERATION_INVALID` when the adapted game fails the legacy validators (friendly text: retry or reduce the amount).

**Local AI on this machine:** runtime llama.cpp `b11681` (~19 MB) + **Qwen3.5-2B Q4_0** (~1.21 GB) are installed under `userData/ai-local/{runtime,models}` (SHA-256 verified at install). `tests/install-local-model.js [modelId] [install|install-only|status]` drives the app's own verified installer + `ai:start-local-runtime` via CDP (needed on a fresh machine; nothing is bundled in the installer and the model is never committed). `tests/smoke66.js real` is the P6 DoD gate against that real model; `tests/smoke66.js fixture` (needs `EDUGAME_AI_TEST_DIR=tests/fixtures/wizard/happy`, which now also contains `game_draft_arena.json`) proves the full wiring with a canned model reply. Note `smoke64`'s old "generate is a P6 placeholder" check was replaced by "generate button is enabled".

**P6 verification status (honest):** the fixture/wiring path is fully verified — `smoke67` **52/52** (all 5 types), `smoke66 fixture` **26/26**, `smoke64` **37/37**, `smoke65 runtime` **18/18** + `output` **14/14**, `npm test` (17 suites), `npm run check`. Against the **real** model only **analyze + recommend** completed in-app (analysis saved, topic "Quang hợp", 2 recommendations, project stored at step `generate`); **`generate` failed with a typed `[AI_TRUNCATED]`** (Qwen3.5-2B Q4_0, fast `maxTokens` 2048) — handled gracefully but the full real chain is **not verified**. **Environment gotcha:** on this machine the Electron window is closed **externally after ~1–2 minutes even when completely idle** (measured: 4 electron processes at 20 s → 0 at 120 s; log order `[app] main window closed` → `window-all-closed` → `before-quit`, and no app code calls `window.close()`/`app.quit()` besides the two standard handlers). A real analyze takes ~7.5 min, so long real-model runs cannot complete in this environment. Owner agreed to skip this gate on 2026-10-20.

**2026-10-20 — new optimization spec accepted (owner):** `docs/update-AI-local.txt` reworks the lesson→game AI flow: cut unnecessary Qwen calls, never call AI for genre choice/config, analyze once + cache, use **MiniLM** to index/retrieve lesson chunks instead of resending the whole lesson, one Qwen 3.5 model for Fast (non-thinking) / Deep (thinking) if verified, keep deterministic work in TypeScript, add **per-item regeneration**, and **benchmark** before/after on 16 GB RAM / U-series CPU / integrated GPU. Survey of the current flow + phased plan are in `docs/implementation-plan.md` §13.

## Expected response format from the agent
- **Findings:** what code currently does, with file paths.
- **Commands run:** exact commands and pass/fail outcomes.
- **Changes made:** file-by-file summary.
- **Risks/unverified:** explicit list.
- **Next step:** one prioritized task, not a broad wish list.

If these docs conflict with actual code, report the mismatch and update the docs after confirming the code. Do not silently treat planned functionality as implemented.
