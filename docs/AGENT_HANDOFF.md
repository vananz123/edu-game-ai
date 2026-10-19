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
- `src/services/` — game-service (normalize), game-validation (4 template validators), question-import (CSV/TSV/XLSX), ai-game-normalize (AI draft normalize), ai-game-design (treasure/race builder).
- `src/game-engine/runtime.ts`: game runtime (scoring, text answers, dedupe helpers).
- `server/index.ts`: Express AI Gateway scaffold.
- `server/schema.sql`: Supabase tables/RPC for usage quotas.
- `tests/`: unit tests (runtime, AI manager, model/runtime installer, model catalog, document-assist, question-import, game-validation, ai-game-normalize, ai-game-design) run by `npm test`; `tests/smoke56-59.js` are CDP UI smokes (need `electron . --remote-debugging-port=9333`); `tests/legacy/` holds older smokes kept for history.

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

**2026-10-19 update — AI-assisted Lesson-to-Game (P1–P2 done):** the approved plan for the new workflow is `docs/implementation-plan.md` (P0–P7). P1 added `src/shared/lesson-types.ts`, `src/services/lesson-contracts.ts`, `src/services/game-project-adapter.ts` (one adapter between typed drafts and `EducationalGame`). P2 added `src/services/lesson-store.ts` (4 sidecar tables + `userData/lessons/<id>.txt`) and IPC `lesson:save-document`/`lesson:get-document`/`project:save-draft`/`project:get`/`project:list`/`project:delete`. `npm test` now has **14 suites**. **Testing gotcha:** `better-sqlite3` is compiled for Electron's ABI, so SQLite tests must run through `node tests/run-electron-node.js <dist-test.js>` (sets `ELECTRON_RUN_AS_NODE=1`); running them with plain `node` fails with `NODE_MODULE_VERSION` mismatch. Do not add the new sidecar tables to `saveDb` or `games`; the workflow is local-only and never sends lesson text to cloud AI.

## Expected response format from the agent
- **Findings:** what code currently does, with file paths.
- **Commands run:** exact commands and pass/fail outcomes.
- **Changes made:** file-by-file summary.
- **Risks/unverified:** explicit list.
- **Next step:** one prioritized task, not a broad wish list.

If these docs conflict with actual code, report the mismatch and update the docs after confirming the code. Do not silently treat planned functionality as implemented.
