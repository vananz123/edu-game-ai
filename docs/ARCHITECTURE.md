# EduGame Studio — Architecture

## Desktop application

- Tauri v2 hosts the TypeScript renderer in WebView2; backend commands and system access are implemented in Rust under `src-tauri/src/`.
- Renderer scripts call the desktop façade (`src/renderer/core/desktop-facade.ts`). The Tauri adapter translates calls to `invoke_channel`/`send_channel` and events to Tauri listeners; there is no Electron main process or preload bridge.
- `src-tauri/src/api.rs` validates and dispatches renderer channels. `src-tauri/src/lib.rs` registers the commands and application state.
- SQLite stores games, sessions, lesson documents, analyses, and related workflow data in the Tauri app-data directory. `src-tauri/src/storage.rs` includes the shared SQL schema; profile migration preserves the existing Electron profile and imports supported data only after user action.
- `.egame` remains a portable game package independent of the local database.

## AI and document workflows

- Rust owns local model/runtime downloads, checksum validation, process lifecycle, loopback HTTP, setup, settings, and protected provider keys.
- Lesson analysis and recommendations reuse validated TypeScript business logic through the embedded JavaScript bundle, while Rust owns persistence and model requests.
- Online providers are user-configured. Product-owned provider secrets remain on the backend; the separate Express/Supabase/Gemini Gateway scaffold is not a dependency of gameplay.
- Generated model output is treated as data, validated against schemas, and rendered by fixed game engines. Arbitrary generated JavaScript/HTML is never executed.

## Security boundaries

- Renderer access is limited to the explicit Tauri command/event surface. The WebView uses a restrictive CSP and does not receive Node.js APIs.
- Rust validates command payloads, selects fixed executable paths, and launches the local model server without a shell. The model endpoint binds only to loopback.
- File access, settings, imports/exports, and database operations remain backend-owned. Do not expose provider keys, arbitrary filesystem access, or process arguments to renderer code.

## Offline guarantees

Saved-game playback, scoring, explanations, local history, and `.egame` import/export do not require network or an AI process. Installing a model may require internet; local generation is available after its verified runtime and model are installed.
