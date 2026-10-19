# fail-output fixture set

`lesson_analysis.json` is a **valid** analysis, so the analyze step can succeed
without a real model. The five `game_draft_*.json` files are `__testDouble`
markers that force a typed `AI_OUTPUT_INVALID` error when the teacher presses
"Tạo nội dung" on the generate step — one file per genre, so it works whichever
genre the rule-based recommender suggested.

`tests/smoke65.js output` uses this directory to check the AI-bad-output UX at
the generate step: typed code, friendly Vietnamese text with no raw `[CODE]`
marker, no "Mở AI local" offer for content errors, nothing stored on the
project, and the teacher's analysis edit surviving the walk back.

There is deliberately **no** `game_recommendations.json` here: since O1 the
genre-suggestion step is rule-based and consumes no model response at all
(docs/update-AI-local.txt section 3, DECISIONS #20). A stale corrupt
`game_recommendations.json` used to live here; it was removed with the same
change.
