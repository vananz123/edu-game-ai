# Current Project Status — v0.3

**Status:** Prototype / handoff build. Do not describe as production-ready.
**Last verified:** 2026-10-16 (Linux, Node.js v22.22.1, npm 9.2.0; Electron 33.2.1).

## Handoff assessment

### Architecture in the code
- The Electron main process owns the local files, SQLite database, document extraction, import/export, settings, and AI requests. It exposes named IPC operations to the renderer.
- The preload exposes a limited `window.eduGame` API through `contextBridge`; the renderer is configured without Node.js access and displays the Vietnamese desktop UI.
- The TypeScript sources are compiled to CommonJS JavaScript in `dist/` before Electron runs. SQLite stores games and play sessions under Electron `userData`; settings are a separate JSON file. On an empty games table, startup attempts to import v0.2 `library.json`, otherwise seeds a sample game.
- The separate Express Gateway validates Supabase access tokens, calls a Supabase quota RPC, and calls Gemini with a server environment key. The desktop currently does **not** sign into Supabase or call that Gateway: its online path calls a user-configured OpenAI-compatible endpoint directly.
- Saved game data and a local game runtime are intended to support offline play; this assessment did not verify the full desktop flow or offline behavior manually.

### Implemented in code, not fully verified end-to-end
- Electron UI for library, editing, creating drafts, quiz/scenario play, score explanations/replay, and session history.
- SQLite storage and first-run migration attempt; `.egame` import/export; CSV session export.
- Text extraction code for TXT, MD, DOCX, text-based PDF, and PPTX. Scanned-PDF OCR is not implemented.
- Offline rule-based draft generation and a direct OpenAI-compatible online/BYOK endpoint path. Offline drafts use fixed options and require teacher review; they are not model-generated.
- Electron security options (`contextIsolation`, `nodeIntegration: false`, `sandbox`) and a preload bridge are present in code.
- Express/Supabase/Gemini Gateway scaffold and monthly quota RPC are present, but no live cloud integration was tested.
- Matching is represented in UI labels/types, but a dedicated drag-and-drop matching interaction is not implemented.

### Verification results
- `cd edugame-studio-v0.3 && npm install` — **passed**; installed 521 packages. npm reported 20 audit findings (6 moderate, 13 high, 1 critical) and several deprecated dependencies; no audit remediation was attempted.
- Fixed Gateway quota-response typing by validating the Supabase RPC result with Zod; invalid responses now produce a logged 503 instead of an unchecked access.
- `cd edugame-studio-v0.3 && npm run check` — **passed** after the fix.
- `cd edugame-studio-v0.3 && npm test` — **passed**; TypeScript build completed and runtime assertions reported `runtime tests passed`.
- `cd edugame-studio-v0.3 && npx tsx tests/runtime.test.ts` — **passed** (`runtime tests passed`). This exercises only the scoring/summary assertions in `tests/runtime.test.ts`; it does not validate all desktop workflows.
- First `cd edugame-studio-v0.3 && npm start` — TypeScript build passed, but Electron could not load `better-sqlite3` because it had been compiled against Node ABI 127 instead of Electron's ABI 130.
- `cd edugame-studio-v0.3 && npm rebuild better-sqlite3 --build-from-source --runtime=electron --target=33.2.1 --dist-url=https://electronjs.org/headers` — **passed**.
- Retried `cd edugame-studio-v0.3 && npm start` — **Electron main and renderer processes remained running** without the native-module error. Startup on Linux is verified; the UI and in-app flows have not been manually exercised.
- `cd edugame-studio-v0.3 && npm run dist:dir` — **passed**; electron-builder produced `release/linux-unpacked` and rebuilt `better-sqlite3` for Electron 33.4.11.
- `./release/linux-unpacked/edugame-studio --user-data-dir=/tmp/edugame-studio-package-smoke` — **packaged Linux app smoke test passed**; main and renderer processes started and initialized a fresh `edugame-data/edugame.sqlite` plus `settings.json`. Temporary smoke-test data was removed afterward.
- Windows installer build, SQLite save/reopen and persistence flows, migration against real v0.2 data, `.egame` round-trip, offline play with networking disabled, Supabase authentication/quota, and Gemini calls remain **unverified**.

## Present in the codebase (verify locally)
- Electron desktop application with TypeScript source.
- Vietnamese UI, game library/editor, a traffic-safety sample, quiz/scenario runtime, score/explanation/replay flows.
- Local document extraction for supported formats, rule-based offline draft generation.
- SQLite local persistence and attempted first-run migration from v0.2 `library.json`.
- `.egame` import/export and CSV result export.
- Electron preload/IPC security pattern.
- Optional OpenAI-compatible endpoint configuration for local/BYOK experimentation.
- TypeScript/Express AI Gateway scaffold, Supabase auth validation/quota schema, Gemini provider call.

## Known incomplete areas
- Desktop Supabase login/session UI is not connected to the Gateway.
- Desktop cloud generation flow is not yet integrated end-to-end.
- Payment provider and automated subscription management are not implemented.
- Some legacy renderer/main logic may use `@ts-nocheck`; strict typing is incomplete.
- Offline rule-based drafts are not a substitute for a real model and may produce incorrect content. Teachers must review.
- Scanned PDF OCR is not implemented.
- Matching drag-and-drop and richer branching games are incomplete.
- Windows installer/native SQLite compatibility has not been confirmed by a successful Windows build in the handoff environment.

## Verification state
The earlier handoff notes said dependency installation had timed out in another environment. Here, dependency installation, type-check, build, runtime tests, Electron launch, and unpacked Linux packaging smoke test pass. Launching in development initially required rebuilding `better-sqlite3` for Electron; electron-builder rebuilt it for the packaged app. Windows packaging and end-to-end workflows are still unverified.

## First verification checklist
1. Use supported Node.js LTS and npm.
2. Run `npm install`.
3. Run `npm run check` and fix/type-report failures.
4. Run `npm test`.
5. Run `npm start` and manually verify app launch.
6. Create/save/edit/reopen a game; confirm SQLite persistence.
7. Export/import `.egame` and test play with internet disconnected.
8. Test first-run migration using a backup copy of v0.2 data.
9. On Windows, run `npm run dist:win` and test the installer on a clean account/machine.
10. Test the Gateway separately with a non-production Supabase project and test credentials.

## Next priority
1. **P1 — Verify desktop and packaging on Windows:** exercise SQLite save/reopen, v0.2 migration, `.egame` round-trip, and offline play; then run `npm run dist:win`.
2. **P2 — Finish and test cloud integration:** implement desktop Supabase session handling and call the Gateway with the user's access token; add integration tests for auth, quota, invalid AI output, and errors before treating cloud generation as ready.
3. **P3 — Add focused Gateway tests:** cover quota RPC valid/invalid responses and error handling, alongside the existing limited runtime test.
