# `short` fixtures — under-delivery (O9)

`game_draft_arena.json` answers an arena request with **1 question**, while the
smoke config asks for **4**. It is a structurally valid draft, so the old flow
accepted it silently and only added an advisory warning.

Used by `tests/smoke77.js` to check that:

- the generator retries once (`lesson-prompts.buildDraftShortfallMessages`),
  which also returns this same 1-question fixture, so the retry stays short;
- the step-5 screen shows `[data-wizard-shortfall="1/4"]` with the exact numbers,
  a one-click retry, and the existing warning in the advisory quality panel;
- saving is still allowed (DECISIONS #21) and the banner disappears when the
  counts match.

Run the app with `EDUGAME_AI_TEST_DIR=tests/fixtures/wizard/short` plus an empty
`EDUGAME_USER_DATA`, then `node tests/smoke77.js`.
