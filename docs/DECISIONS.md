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
The legacy create page is the manual authoring entry (pick one of 5 genres, set the rules, open the empty editor and type the questions). All AI assistance — document assist, cloud/local model choice, generating a draft from a document — was removed from that page and now lives only in the lesson-to-game wizard, which uses the local-only client. Rationale (owner instruction, 2026-10-19): AI must not be mixed into manual authoring, and lesson data must only be processed by local AI. The wizard's CTA replaces the create page's AI buttons on Home/Lesson-plans; the create page keeps a link to the wizard. `ai:generate-game` and `ai:document-assist` in `main.ts` are kept but are no longer reachable from the UI (deletion is a P7 cleanup decision). The wizard's step-5 generation is an honest placeholder until P6 — no fabricated AI output.

### 16. AI test doubles are dev-only and cannot reach a packaged build
`smoke64`/`smoke65` must exercise the real IPC → workflow → store path without a local model, so `main.ts` can load canned responses from `EDUGAME_AI_TEST_DIR` (files named after the request's `responseSchema.name`, or a `__testDouble` marker that forces a typed error). This seam is guarded by `!app.isPackaged`: a packaged installer always ignores the variable and still fails with `AI_NOT_RUNNING` until a real llama.cpp model is running, so the delivered app can never fake AI. Fixture-driven results must be labelled as such in status/reports; the real-model end-to-end run remains a P6 gate.

## Decisions still open
- Initial GGUF model and runtime versions, verified source/checksum/size/license, and supported Windows hardware.
- Whether/how to sync game libraries across devices.
- Retention period for usage logs and account deletion workflow.
