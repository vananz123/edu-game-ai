# happy fixture set

Dev-only canned model replies used when `EDUGAME_AI_TEST_DIR` points here
(ignored in a packaged build, see DECISIONS #16). Files are named after the
request's `responseSchema.name`:

- `lesson_analysis.json` — valid analysis for the analyze step.
- `game_draft_<type>.json` — valid draft per genre for the generate step
  (`arena`, `scenario`, `matching`, `treasure`, `race`), so whatever genre the
  teacher picks can be generated without a model.

Since O1 there is **no** `game_recommendations.json`: genre suggestions are
rule-based and make no model call (`src/services/game-recommender.ts`), so the
recommend step never asks for a fixture.

Used by `tests/smoke64.js`, `tests/smoke66.js fixture` and `tests/smoke67.js`.
