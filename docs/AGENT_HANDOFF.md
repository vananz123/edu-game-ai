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
- `src/renderer.ts`, `src/index.html`, `src/styles.css`: desktop UI.
- `src/shared/types.ts`: shared contracts/types.
- `src/services/game-service.ts`: game-related service logic.
- `src/game-engine/runtime.ts`: game runtime.
- `server/index.ts`: Express AI Gateway scaffold.
- `server/schema.sql`: Supabase tables/RPC for usage quotas.
- `tests/runtime.test.ts`: current runtime test.

## Do not break these invariants
1. Saved game playback works offline.
2. Game package `.egame` remains portable.
3. Renderer does not gain direct Node.js access.
4. No product-owned Gemini/OpenAI key or Supabase service-role key in desktop code or installer.
5. AI output is validated data rendered by trusted engines, not arbitrary executable code.
6. Quotas are checked server-side, not trusted from the desktop client.
7. Do not claim tests/build passed unless commands were run and results observed.

## First task for the new agent
Do not start with a large rewrite or new features. First establish the actual build/test state:

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

## After baseline verification
Implement the next highest-priority incomplete feature: connect Supabase Auth session management in Electron to the existing Gateway `POST /v1/generate`. The desktop should send the user's short-lived access token; the Gateway validates it and enforces quotas. Never expose the Gemini key to desktop. Add integration tests before describing cloud generation as ready.

## Expected response format from the agent
- **Findings:** what code currently does, with file paths.
- **Commands run:** exact commands and pass/fail outcomes.
- **Changes made:** file-by-file summary.
- **Risks/unverified:** explicit list.
- **Next step:** one prioritized task, not a broad wish list.

If these docs conflict with actual code, report the mismatch and update the docs after confirming the code. Do not silently treat planned functionality as implemented.
