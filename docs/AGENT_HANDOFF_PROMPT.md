# Copy/paste prompt for a new coding agent

I am continuing an existing project named **EduGame Studio**. Please read `AGENTS.md`, `docs/AGENT_HANDOFF.md`, `docs/PROJECT_BRIEF.md`, `README.md`, `docs/ARCHITECTURE.md`, `docs/STATUS.md`, `docs/DECISIONS.md`, and `docs/ROADMAP.md` before editing code.

Your first job is to understand the repository and establish its real state, not to rewrite it. Inspect the relevant files, then run `npm install`, `npm run check`, and `npm test` if your environment allows. Report exact results and distinguish verified functionality from claims in documentation. Do not say a build or test passed unless you actually ran it.

Product direction: Windows Electron desktop app, TypeScript source, SQLite local game library/history, `.egame` portable game files, saved games must play offline. Cloud generation uses a TypeScript/Express AI Gateway, Supabase Auth/Postgres, and Gemini as the initial provider candidate. Provider secrets stay on the backend. Use fixed trusted game engines and validated structured AI output; do not execute arbitrary AI-generated code. Initial target is 1–10 teachers with free and paid tiers, but payment integration is not yet complete.

Known major gap: the Gateway is a scaffold; desktop Supabase login/session UI and end-to-end desktop cloud generation are unfinished. Windows packaging/native SQLite behavior is not yet confirmed. See `docs/STATUS.md` for more.

After baseline checks, propose a short prioritized plan. Work in small increments, preserve offline behavior and security boundaries, add tests for changes, and update `docs/STATUS.md` after each task. Do not introduce new paid services or major architecture changes without explaining the trade-offs first.
