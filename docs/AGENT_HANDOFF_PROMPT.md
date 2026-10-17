# Copy/paste prompt for a new coding agent

I am continuing an existing project named **EduGame Studio**. Please read `AGENTS.md`, `docs/AGENT_HANDOFF.md`, `docs/PROJECT_BRIEF.md`, `README.md`, `docs/ARCHITECTURE.md`, `docs/STATUS.md`, `docs/DECISIONS.md`, and `docs/ROADMAP.md` before editing code.

Your first job is to understand the repository and establish its real state, not to rewrite it. Inspect the relevant files, then run `npm install`, `npm run check`, and `npm test` if your environment allows. Report exact results and distinguish verified functionality from claims in documentation. Do not say a build or test passed unless you actually ran it.

Product direction: Windows Electron desktop app, TypeScript source, SQLite local game library/history, `.egame` portable game files, saved games must play offline. The active AI path is app-managed local llama.cpp/Qwen for private document analysis, Q&A, and game generation. A separate TypeScript/Express Gateway with Supabase Auth/Postgres and Gemini exists as a prototype scaffold only; the desktop is not connected to it. Keep provider secrets on the backend if Gateway integration is explicitly brought back into scope. Use fixed trusted game engines and validated structured AI output; do not execute arbitrary AI-generated code.

Latest verified code/test status and unverified areas are in `docs/STATUS.md`. In particular, the create-game document chat can generate a replacement suggested-question set, but that newest flow still needs an interactive smoke test with an installed local model. Windows packaging/native SQLite behavior is not yet confirmed.

After baseline checks, prioritize validating the local replacement-question flow and its effect on generated games, then continue the Windows installer/persistence checklist. Work in small increments, preserve offline behavior and security boundaries, add tests for changes, and update `docs/STATUS.md` after each task. Do not introduce new paid services or major architecture changes without explaining the trade-offs first.
