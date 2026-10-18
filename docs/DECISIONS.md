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

### 11. Keep the current TypeScript project structure during Phase A
Continue using the existing npm package and Electron layout. Reuse `src/shared`, `src/game-engine`, and `src/services`; add focused boundaries under `src/ai-core` rather than introducing pnpm workspaces or React without a demonstrated need. Move modules only when a later phase requires it and can preserve current behavior.

### 12. Tailwind CSS v4 (CLI, no bundler) replaces the hand-written stylesheets incrementally
Migrate the renderer styling to Tailwind CSS v4 using the standalone CLI (no bundler/PostCSS step added to the Electron build). The entry stylesheet (`src/renderer/styles/app.css`) is linked *after* the 5 legacy stylesheets so utilities win the cascade while migration is in progress. Because the legacy UI was built against browser-default (UA) values that Tailwind's preflight resets, a temporary `@layer base` block restores those UA values with `revert`; since every legacy rule is unlayered it still takes precedence, so the reverts affect only genuinely UA-styled elements. That block is removed together with the last legacy stylesheet (Phase 5, see ROADMAP). Verification for each phase uses the existing gates plus a CDP geometry diff (CSS on vs off) to catch layout regressions that computed-style spot checks miss.

## Decisions still open
- Initial GGUF model and runtime versions, verified source/checksum/size/license, and supported Windows hardware.
- Whether/how to sync game libraries across devices.
- Retention period for usage logs and account deletion workflow.
