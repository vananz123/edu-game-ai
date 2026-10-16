# Roadmap

## v0.3
- Migrate Electron source to TypeScript.
- Replace JSON library storage with SQLite and migrate existing v0.2 library on first run.
- Keep offline game play and `.egame` portability.
- Add a TypeScript AI Gateway scaffold with Supabase auth validation, server-only Gemini key, and monthly free/plus quotas.

## v0.4
- Add Supabase Auth login/session management in desktop.
- Connect the desktop to `/v1/generate` using a user access token, not a provider API key.
- Add integration tests for quotas, JSON schema validation, and SQLite migration.
- Finish strict typing for main/preload/renderer and remove transitional `@ts-nocheck` comments.

## v0.5
- Add payment provider integration only after validating demand and legal/accounting requirements.
- Improve matching drag-and-drop, branching scenarios, asset handling, and accessibility.
- Test local AI setup flow and hardware compatibility; do not make local AI a prerequisite.
