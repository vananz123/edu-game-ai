# fail-runtime fixture set

This directory intentionally contains **no** `lesson_analysis.json` or
`game_draft_*.json`.

`loadLessonTestFixture` therefore falls through to the real local-AI path, which
on a machine without a running llama.cpp model fails with `AI_NOT_RUNNING`.
`tests/smoke65.js runtime` uses this directory to verify the "AI local chưa chạy"
UX (error banner + "Mở AI local" action + retry + back preserves data).
