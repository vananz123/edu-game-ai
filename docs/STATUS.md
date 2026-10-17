# Current Project Status — v0.3

**Status:** Prototype / handoff build. Do not describe as production-ready.
**Last verified:** 2026-10-18 — repository cleanup after import-polish task; `npm run check` + `npm test` passed (build + all 9 suites) with the cleaned tree.

## Repository cleanup + done/not-done notes (2026-10-18, resumed session)

Housekeeping before starting tasknight §7+ work (per product owner request): delete scratch files, reorganize, and document what is finished vs. open.

- **Deleted (root, all untracked/regenerable):** one-off helper scripts (`check-dist/check-lib/check-state`, `extract-docx`, `gen-smoke-p1`, `get-cbg`, `inspect-editor`, `patch-a/b/p1`, `recover-mvajtxyz`), stray outputs (`delete-*.txt`, `p1-*.txt`, `smoke58-app.log`), CDP reports (`smoke56-59-report.json`, regenerable by re-running the smokes), duplicate/broken-encoding tasknight extracts (`spec-sec4-5.txt`, `spec-sec6-7.txt`, `tasknight-extracted.txt` — canonical copy is `docs/tasknight.txt`), and empty `docs/New folder`. `docs/tasknight.docx` (source) kept.
- **Moved:** retired smokes `smoke2.js`, `smoke-p1.js`, `smoke-ui.js`, `smoke-delete.js` → `tests/legacy/` (still referenced by older STATUS entries; updated those references). Active harnesses stay at `tests/smoke56-59.js`.
- **Docs reorganized for readability:** `docs/ROADMAP.md` now opens with a **"tasknight §2–§7 — Trạng thái đã làm / chưa làm"** checklist (authoritative done/not-done list, incl. unchecked gaps: AI-generated treasure/race journeys, per-question AI regeneration, difficulty-mix enforcement, drag-drop editors, media/sound, multi-teacher profiles, real-model end-to-end, `dist:win`). `docs/AGENT_HANDOFF.md` "Current development focus" and architecture map refreshed (services list, `tests/legacy/`, current smoke entry points).
- **Kept untouched:** `docs/tasknight.docx/.txt`, `.env.example`, `release/`+`dist/` (gitignored build output), all source/tests, `.git` history. No source code changed in this task — cleanup only (the STATUS path references above are doc edits).
- **Verification:** `npm run check` + `npm test` green on the cleaned tree (9/9 suites). File deletions/moves are not code-path dependent (root scratch files were never imported; `npm test` chain references only `tests/*.test.ts`).
- **Not verified in this pass:** git working tree now shows the earlier session's modifications + this cleanup as uncommitted changes — committing is left to the product owner.
- **Next:** start the unchecked items in the ROADMAP tasknight checklist (recommended order: AI generation for §5/§6 journeys, then real-model end-to-end verification, then §7 multi-profile if desired).

## Import polish: duplicate detection + summary toast (2026-10-18, resumed session)

Follow-up to §2.4 — importing a file that repeats questions already in the game now skips the copies and reports exactly what happened.

- **Dedupe (`game-engine/runtime.ts`):** new `questionFingerprint` (normalized prompt — diacritics/whitespace-insensitive via `normalizeTextAnswer` — + question type + answer: `correctOptionId` for choice questions, `correctAnswer` for text questions, + normalized option texts) and `dedupeImportedQuestions(imported, existing)` → `{ unique, skipped }` (dedupes against existing questions *and* within the batch itself). Exported both as plain-script globals (renderer) and via `module.exports` (tests).
- **Editor (`game-editor.ts`):** the import-button flow moved into a top-level `applyImportedQuestions(root, game, imported)` — button handler is just IPC + this function. It adds only `unique` questions (ids still regenerated, render/renumber/branch-refresh unchanged) and toasts: normal → "Đã nhập N câu từ …"; with skips → "… (bỏ qua K câu trùng)"; all duplicates → "Tất cả N câu … đã trùng với câu hiện có — không thêm câu nào." (returns false); the 200-question cap now counts only questions that would actually be added. Cancelling the dialog (`null`) remains a silent no-op.
- **Structural side-effect:** `renumberQuestions`/`currentEditorQuestions`/`refreshScenarioBranches` moved out of the `openEditor` closure to top level (they only depend on globals) so `applyImportedQuestions` can use them; all existing in-closure call sites resolve to the same implementations.
- **Verification:** `npm run check` passed; `npm test` passed (build + all 9 suites; `runtime.test.ts` extended with fingerprint equality/sensitivity, batch-internal dedupe, text-answer normalization, empty-input cases). CDP smoke `tests/smoke59.js`: **21/21** — globals, seed + editor open, apply (5 canned → 2 kept / 3 skipped, ids regenerated, 4 cards, toast counts), all-duplicate re-apply, null no-op, 200-cap, cleanup; 0 uncaught. Regression: `smoke58` **25/25**, `smoke57` **37/37** (confirms the helper move broke nothing).
- **Not verified in this pass:** the native file-dialog click-through (contextBridge API is frozen — preload methods cannot be stubbed from the page, proven via probe — so the smoke drives `applyImportedQuestions` directly, the exact code the button runs after the dialog); XLSX/CSV dialog → IPC path (unit tests cover `importQuestionsFromFile` directly).
- **Next:** §3/§4 regression pass, or more polish (e.g., preview-imported-questions list before insert), or proceed to tasknight §7+.

## AI generation: true-false + fill-in-blank/short-answer (2026-10-18, resumed session)

Extends tasknight §2.5 so AI drafts are no longer multiple-choice/scenario/matching only.

- **New service `src/services/ai-game-normalize.ts`:** the `normalizeAiGame` step (previously inline in `main.ts`) moved to a testable service and now understands all six question types. `true-false` always gets Đúng/Sai options and maps `correctOptionId`/`correctAnswer` (`b`/`sai`/`false`/`no`/`0` → Sai, otherwise Đúng). `fill-in-blank`/`short-answer` keep `correctAnswer` + optional `alternateAnswers` with empty options/`correctOptionId: ''`; if the model omits the text answer, the question is coerced to multiple-choice when ≥2 options exist, otherwise dropped. Unknown types coerce to multiple-choice; string options are normalized; questions without usable answers are dropped, and the old "no questions" error is preserved.
- **Zod schema (local mode, `main.ts`):** question `type` enum gains the three new types; `options`/`correctOptionId` are now optional (min 0 options) and `correctAnswer` is accepted; a `superRefine` enforces text answers for fill-in/short-answer and ≥2 options + `correctOptionId` for the others.
- **JSON response schema (local strict mode):** same relaxation (`minItems: 0`, `correctAnswer` property, extended type enum, `required: ['prompt']`).
- **Prompts:** system prompt and the `buildPrompt` JSON template now document the three extra types with their field rules and ask the model to mix question styles; the local-mode validation error message mentions `correctAnswer`.
- **Verification:** `npm run check` passed; `npm test` passed (build + all 9 suites). New `tests/ai-game-normalize.test.ts` covers mixed drafts (TF mapping both directions, fill-blank with alternates, short-answer, string options, coercion/drop rules, empty-draft error) and is wired into the `npm test` chain.
- **Not verified in this pass:** end-to-end generation against a real cloud/local model (no API/model available in the harness) — only the normalize/validation layer is exercised; template=`scenario`/`matching` drafts with mixed text types at play time (engine supports them, authoring UIs target quiz).
- **Next:** handoff report; then polish items (import summary toast, duplicate-question detection) or §3/§4 regression pass.

## §2.4 text-answer question types + importer extension (2026-10-18, resumed session)

Extends tasknight §2.4 ("trắc nghiệm, đúng/sai, điền từ hoặc câu trả lời ngắn") beyond the previous multiple-choice-only import.

- **Contracts:** `QuestionType` gains `'true-false' | 'fill-in-blank' | 'short-answer'`; `GameQuestion` gains optional `correctAnswer` and `alternateAnswers` (multiple accepted texts separated by `;`).
- **Runtime scoring:** new `normalizeTextAnswer` (trim, lowercase, strip Vietnamese diacritics via NFD, collapse whitespace), `isTextQuestion`, and `scoreTextAnswer` (matches `correctAnswer` or any `alternateAnswers`; empty input never scores) exported from `runtime.ts`, with the same speed-bonus rules as multiple-choice.
- **Importer (`question-import.ts`):** new optional "Dạng câu hỏi" column (aliases: type, hình thức, loại câu hỏi, dạng…). `trắc nghiệm` keeps the A–D option flow; `đúng/sai` auto-generates Đúng/Sai options and maps Đúng/Sai/True/False/1/0 answers; `điền từ` and `trả lời ngắn` require an answer cell (alternatives via `;`) and produce empty-option questions with `correctAnswer`. Required-column check relaxed: only "Câu hỏi" + "Đáp án" are mandatory (options only for multiple-choice). Unknown types are rejected with a Vietnamese error naming the supported values.
- **Editor:** the type select (which already listed the three new types) is now fully wired — true-false shows a Đúng/Sai correct-answer select; fill-in-blank/short-answer hide the options block and show a free-text "ĐÁP ÁN ĐÚNG" input (semicolon-separated accepted answers); save builds `options`/`correctOptionId`/`correctAnswer` per type and blocks saving a text question without an answer. Copy-question preserves `correctAnswer`.
- **Play (`gameplay.ts`):** text questions render a `.text-answer-box` input + "Trả lời" button (Enter also submits, input focused, disabled after answering); results feedback reveals the model answer plus alternates; answers record `answerText`. True-false plays as a normal 2-option question. Works with the §2.3 team mode (points still routed through `chooseAnswer`).
- **Bug found & fixed via CDP smoke:** `currentEditorQuestions`/`renumberQuestions`/`refreshScenarioBranches`/`saveEditedGame` selected `$$('.editor-question', root)` across the whole modal, matching the race panel's hidden `.editor-question race-question-card` elements (always injected by `openEditor`) and crashing add/copy/type-switch/save in the quiz/scenario editor with `Cannot read properties of null (reading 'value')`. All four call sites are now scoped to `#editorQuestions`.
- **Verification:** `npm run check` passed; `npm test` passed (runtime tests cover `scoreTextAnswer` diacritic/whitespace/alternate/empty-input cases; question-import tests cover mixed-type CSV, true-false mapping, alternate answers, and rejections for bad boolean answers / missing text answers / unknown types). CDP smoke `tests/smoke58.js` (app on `--remote-debugging-port=9333`): **25/25 checks passed** — seed via IPC, full 4-type play-through (MC correct, true-false correct, short-answer `"  hà   NỘI "` matched against "Hà Nội", wrong fill-blank scored 0, summary 300/400=75%), editor gate (type switch reveals text field, save blocked without answer, save succeeds with answer, `correctAnswer` persisted), cleanup. Zero uncaught renderer exceptions (only the known benign CSP `data:text/css` notice).
- **Not verified in this pass:** the native import dialog click-through (unit tests exercise `importQuestionsFromFile` directly), XLSX rows carrying the new type column (parser is type-agnostic; only CSV/TSV were smoke-tested), scenario/matching/treasure/race templates with text-question types (engine supports them but authoring flows target quiz). AI generation emitting the new types was addressed in the section above.
- **Next:** §3/§4 regression pass, or polish items (import summary toast after editor import, duplicate-question detection within an imported file).

## §2.3 `thi đấu đội` team play + leaderboard (2026-10-18, resumed session)

Implements tasknight §2.3 "Thi đấu đội: Cộng điểm cho đội, có thể luân phiên người trả lời" and §2.1 "bảng xếp hạng" for the quiz/scenario templates (Đấu trường kiến thức).

- **Team setup gate:** when a quiz/scenario game is played with `gameSetup.scoringMode === 'thi đấu đội'`, `playGame` opens a team-setup modal before question 1 instead of the first question — 2 default teams, up to 6 (icon + name inputs, add/remove). Start is blocked on empty or duplicate names (toast, modal stays).
- **Turn rotation:** `state.teamPlay = { teams[], turn }` (added to the shared state, cleared on every non-team play). Each question shows a `.team-turn-bar` with the active team (name, icon, running points) and a teacher-selectable dropdown to re-assign the current question to any team (luân phiên). The turn auto-advances after an answer.
- **Scoring:** `chooseAnswer` adds the scored points (incl. speed/difficulty/scenario weights) to the active team, counts correct/answered per team, and appends an award line to the feedback ("Đội X được cộng Y điểm. Lượt sau: …").
- **Results & leaderboard:** renderResults shows a `.leaderboard` ranked by points (then correct count) with medals, a leader highlight, per-team correct/answered stats, and a winner banner. `lastSummary` switches to the winning team's points/correct + `winnerTeam`; percent = winner points / class max. Session save defaults the player name to the winning team. Replay keeps teams but zeroes their counters.
- **CSS:** `.team-turn-bar`, `.team-setup-row`, `.leaderboard-row`/`.leader`, `.danger-text` in `components.css`.
- **Verification:** `npm run check` passed; `npm test` passed (build + all 8 suites). CDP smoke `tests/smoke57.js` (app on `--remote-debugging-port=9333`): **37/37 checks passed** — seeded a team-mode quiz via the `library:save-game` IPC path, team setup (add 3rd team, rename, start), Q1 award to team 1 + auto turn, Q2 re-assigned via the turn select, results (winner banner, 3 leaderboard rows, leader highlight, lastSummary winner/percent), replay resets counters but keeps teams, validation gates (empty name, case-insensitive duplicate names), cleanup. Zero uncaught renderer exceptions (only the known benign CSP `data:text/css` notice).
- **Not verified in this pass:** scenario template + team mode combined (engine path is shared but only quiz was smoke-tested), >6 teams, session save prompt click-through (native `prompt()` not automatable), matching/treasure/race interplay with team mode (not applicable — those templates have their own scoring/board systems).
- **Next (superseded):** §2.4 text-answer import — implemented in the section above; its editor-scope bug fix also hardens quiz/scenario editing alongside the §5/§6 panels.

## §5 treasure-hunt + §6 race authoring + play (2026-10-18, resumed session)

Continues tasknight §5/§6 after §4 matching was finished earlier the same day.

- **Contracts:** `types.ts` gains `TreasureStageQuestion`/`TreasureStage`/`TreasureHuntData` and `RaceCellType`/`RaceTeam`/`RaceSpecialCell`/`RaceQuestion`/`RaceData`; `EducationalGame` now carries optional `treasureHunt` and `race`.
- **Validation:** new `validateTreasureHuntGame` (≥2 stages, unique stage ids, prompt/options/correct-option integrity, next/branch targets exist, branch needs a label, ≥1 ending stage, bounded attempts/points/bonuses, `journeyBonus`/`hiddenItemBonus` limits) and `validateRaceGame` (track 3–100 cells, rounds 1–50, ≥2 teams with unique ids/names, special cells valid & unique within track, ≥1 question bank entry with unique ids/valid options/difficulty, boolean rule flags). Both are required by `library:save-game` and `files:import-game` in `main.ts`.
- **Persistence:** `normalizeGame` preserves `treasureHunt` and `race` pass-through instead of dropping them (validators are the correctness gate).
- **Editor (game-editor.ts):** blank treasure/race games ship with sample data; `openEditor` injects and binds two dedicated panels; `saveEditedGame` reads them back. Treasure panel: character/intro/journey bonus/hidden-item bonus, stage cards (story, task, puzzle, options + correct radio, explanation/hint, attempts, points, completion bonus, next-stage & optional labeled branch selects, hidden-item checkbox) with add/copy/reorder/remove. Race panel: track length, max rounds, step-by-difficulty and luck flags, team rows (icon/name/reorder), special-cell rows (number/type/label), question bank cards (difficulty select, options, copy/remove).
- **Play (gameplay.ts):** treasure-hunt is a teacher/learner stage graph — per-stage attempts (0 = unlimited, wrong never subtracts points), hint reveal, hidden-item pickup (+bonus), correct answers award points + completion bonus, student picks next step when a labeled branch exists, multiple endings, journey bonus on completion, capped at 100 stages per run, results screen with points/max and session save. Race is a shared-screen classroom board — round/turn rotation across teams, random question draw from the bank (no repeats until exhausted), step 1–3 by difficulty (or fixed 1), special-cell effects on landing (boost +1, penalty −1, luck +1 when enabled, challenge +2), finish at track end or when max rounds are exhausted, standings + replay + session save.
- **CSS:** new treasure stage cards/option rows/choice buttons and race track/cells/scoreboard/turn panel styles in `components.css`.
- **Verification:** `npm run check` passed; `npm test` passed (build + all 8 suites; `game-validation.test.ts` extended with ~25 treasure/race cases plus normalize preservation).
- **Bug found & fixed via CDP smoke:** `refreshTreasureUi` rebuilt the stage "next" select from empty initial options and reset every stage to "ending" on open, so default sample hunts saved both stages as endings (`nextStageId: null`) and play offered no "Tiếp tục". `treasureStageHtml` now seeds initial options for the next/branch selects from the stage data so `refreshTreasureUi` preserves existing links.
- **CDP smoke (2026-10-18, harness `tests/smoke56.js`, app on `--remote-debugging-port=9333`):** **56/56 checks passed** — treasure editor (panel visibility, sample stages, custom journeyBonus, save + IPC round-trip), treasure play (wrong attempt feedback, hidden item, correct→choices→ending flow, results 2×300+350+50=1000), treasure validation gate (journeyBonus 20000 rejected, library unchanged), race editor (panel visibility, trackLength 3, cell moved, save), race play (3-cell board, question draw, difficulty +2 step, instant win, winner banner), race validation gate (single team rejected), cleanup. Zero uncaught renderer exceptions (only the known benign CSP `data:text/css` notice).
- **`.egame` round-trip (logic-level):** `tests/game-validation.test.ts` mirrors the `files:export-game` → `files:import-game` handler path (package wrapper → JSON round-trip → all four validators) for treasure-hunt and race, asserting `treasureHunt`/`race` survive byte-identical and that corrupted packages (single stage / single team) are rejected by the same import path. The native file dialogs themselves are not automatable in the harness.
- **Not verified in this pass:** branch-selection treasure path (no sample branch configured in the smoke game), memory/categorize interplay with §5/§6 templates, native dialog export/import click-through, race cell effects other than boost (penalty/lucky/challenge landing), >2 teams turn rotation.
- **Next (superseded):** team leaderboard for `thi đấu đội` — implemented in the §2.3 section above.

## §4 matching authoring + play (2026-10-18, resumed session)

The previous pass had started §4 (types in `types.ts`, `calculateMatchingSummary` in the runtime, and a failing unit test) and stopped mid-task; this session finished it.

- **Scoring rule settled (tasknight §4.2):** wrong attempts only cost points when the teacher sets `wrongPenalty > 0` (default 0 = no penalty); practice mode never penalizes; completion and time bonuses require all pairs matched. The stale test expectation (450 with a 10-point penalty active) was corrected to 440/98% and extra cases were added (no penalty configured, incomplete run).
- **Authoring UI:** the editor's matching template now has a dedicated panel instead of the generic question editor — pair table (column A / column B, add/remove/reorder), play-mode select (Ghép hai cột / Lật thẻ ghi nhớ / Phân loại kiến thức), and scoring config (points per pair, completion bonus, wrong penalty, time bonus + window, practice mode) persisted on `EducationalGame.matchingGame`. Blank matching games start with two sample pairs and empty questions.
- **Validation:** new `validateMatchingGame` (`src/services/game-validation.ts`) enforces ≥2 pairs, unique pair ids, non-empty cells, unique column-B texts (avoid ambiguous answers), unique column-A texts for columns/memory (categorize allows shared group labels), and bounded scoring config. Wired into `library:save-game` and `files:import-game` in `main.ts`, so `.egame` round-trips are validated too.
- **Persistence:** `normalizeGame` now normalizes and preserves `matchingGame` (mode, pairs, scoring, practiceMode) instead of dropping it.
- **Play modes** (`gameplay.ts` + new CSS in `components.css`): columns (pick A then matching B), memory (flip cards to find corresponding pairs), categorize (pick a card then its group; groups come from column-A labels). All three use `calculateMatchingSummary` for the results screen (points/max/percent, wrong attempts, elapsed time) and support replay + session save. Wrong-penalty/practice hints are shown during play.
- **Verification:** `npm run check` passed; `npm test` passed (build + all 8 suites — runtime scoring, AI manager, installers, catalog, document-assist, question-import, game-validation/normalize). Not verified in this pass: interactive Electron UI for matching authoring/play, `.egame` export/import round-trip of a matching game on-device, real touch/drag feel on target hardware.
- **Next:** §5 treasure-hunt stage editor/play with locks and endings, then §6 classroom race board and teacher controls, then team turn rotation/leaderboard.

## Requested tasknight feature continuation (2026-10-18)

- **§2.4 question import — implemented:** The editor imports `.csv`, `.tsv`, and `.xlsx` question tables (up to 100 questions per import, 10 MB per file), validates required columns, answer mapping, points, and difficulty, and appends only a wholly valid import to the editable draft. Teachers are told to review imported content before saving.
- **§3 branching scenarios — implemented:** Scenario questions now capture context, action-specific feedback, discussion prompts, weighted safety/reasoning/harm-reduction scores capped at 60/25/15, and branch destinations or explicit endings. Play follows chosen links, records visited decisions and score breakdowns, and caps each run at 100 decisions to avoid infinite cycles. Main validates graph references and rubric ranges on save and `.egame` import.
- **Remaining requested work — not implemented in this pass:** §4 matching authoring and playable modes; §5 treasure-hunt stage editor/play with locks and endings; §6 classroom race board and teacher controls; team turn rotation and leaderboard. Existing template cards or question-based behavior do not satisfy these requirements.
- **Verification:** `npm run check` and `npm test` passed; importer tests cover CSV, TSV, XLSX shared strings, and invalid answer rejection. Runtime tests cover scenario rubric clamping, path transitions and endings; validation tests cover dangling links and out-of-range scores. Interactive import/scenario editor/play were not manually exercised in Electron, and real Excel-generated workbooks were not manually verified.
- **Next:** implement §4 matching authoring and play modes (two-column match, memory cards, categorization), then continue in the requested §5 → §6 order and complete team competition.

## Local AI runtime timeout recovery (2026-10-18)

- Fixed the local AI request-timeout path: it previously stopped llama.cpp but claimed the runtime had restarted, leaving subsequent requests unable to use local AI until a manual restart.
- The timeout path now stops and restarts the same `AIManager`; restart failures are logged and shown explicitly. If the manager is unexpectedly absent, the user receives a clear instruction to start local AI again.
- Added an AI manager lifecycle assertion covering `READY → STOPPED → READY`.
- Verification: `npm run check` and `npm test` passed after this change.
- Not verified here: a real llama.cpp generation timeout/restart on-device; the automated test uses a synthetic local HTTP process.

## tasknight.docx alignment — scoring modes + teaching style (2026-10-17)

Source: `docs/tasknight.docx` (extracted plain text kept at `docs/tasknight.txt`). Spec review found the create page covered §2.4/§3.4/§4.4/§5.4/§6.4 manual+AI creation, but this pass implemented the two most bounded, high-value gaps: **§2.3 scoring modes** and **§7 "Phong cách giảng dạy của tôi"**.

### Implemented this pass
- **§2.3 scoring modes (Zone D)** — new `CHẾ ĐỘ TÍNH ĐIỂM` select with the five documented modes (`cơ bản`, `tốc độ`, `theo độ khó`, `thi đấu đội`, `luyện tập`); difficulty points table (defaults dễ 100 · trung bình 200 · khó 300) visible only for `theo độ khó`; speed bonus capped at 50 and visible only for `tốc độ`; dynamic mode hint via `scoringModeHint` (`shared.ts`) updated by `updateScoringVisibility` (`controller.ts`). `collectDraft` persists `scoringMode`, `pointsEasy/Medium/Hard` and clamps `timeBonus` to 0–50.
- **Scoring engine** — `src/game-engine/runtime.ts` now exports `resolveScoring(gameSetup)`, `questionPoints(question, scoring)` and mode-aware `scoreAnswer`/`calculateSummary` via optional parameters; games without `gameSetup` keep the previous behavior (default `tốc độ`, +20 ≤ 8s). `index.html` loads `game-engine/runtime.js` before `gameplay.js`; the play flow and results screen use these functions instead of inline math, and the stage tip/feedback text reflect the active mode.
- **Persistence** — `gameSetup` flows draft → generated/blank game → `normalizeGame` → library (`EducationalGame.gameSetup` in `types.ts`); per-question `difficulty` (dễ/trung bình/khó) added to `GameQuestion`, editable in the question editor, kept by `normalizeGame`.
- **AI prompt** — `buildPrompt` appends the chosen scoring mode (including the difficulty points table) and the teacher style profile; `ai:generate` reads `settings.preferences.teachingStyle`. Zod schema, strict JSON schema, and `normalizeAiGame` accept optional per-question `difficulty`.
- **§7 Phong cách giảng dạy của tôi** — new settings panel (giọng điệu, mức độ hài hước, ví dụ/tình huống, phong cách mỹ thuật, ghi chú cho AI) stored at `preferences.teachingStyle`; `saveSettings` now spreads existing preferences, and `testAi` includes `preferences` so a connection test no longer wipes them (the settings IPC replaces the whole file).

### Verification (2026-10-17)
- `npm run check` — **passed**; `npm test` — **passed** (build + all 6 suites; `tests/runtime.test.ts` extended with 5-mode scoring, timeBonus clamp, difficulty table/custom table, max-points per mode, and legacy-default cases).
- Structural splice verification (33 checks, ad-hoc script): section/div balance in `create.ts` (9/9, 84/84) and `settings.ts` (4/4, 39/39), all new element ids, dist script tags resolve, prompt injection points — **all passed**.
- Live UI smoke (2026-10-17, Electron + CDP; harness kept at `tests/legacy/smoke-ui.js` + `tests/legacy/smoke2.js`): app launched with `--remote-debugging-port=9333`; **78/78 checks passed** — renderer boot (runtime.js loaded, scoring globals usable), Zone D mode switching (dynamic hints, visibility, draft collection for all 5 modes, timeBonus clamp 999→50 / −5→0), legacy game without `gameSetup` keeps the old +20 speed default, blank-game creation with `theo độ khó` (custom 111/222/333 table + question difficulty `khó`) persisted through the `library:get` IPC round-trip, play-through scoring 333 pts with no speed bonus (difficulty mode) and 140 = 100+40 with “+40 điểm nhanh” (speed mode), results screens, §7 panel save/re-render refill/full restore. **5/5** targeted checks confirmed `testAi` in offline mode keeps `preferences.teachingStyle` (regression guard). Zero uncaught renderer exceptions; main process log clean except a benign CSP notice from the pre-existing empty `@import url('data:text/css,')` in `global.css`.
- Not verified in this pass: AI actually emitting `difficulty` with installed models; end-to-end `.egame` export/import round-trip of `gameSetup` (plain library IPC round-trip IS verified).

### Still missing vs tasknight.docx (large items, next sessions)
- §2.4 question import from file/spreadsheet; §3.2–3.3 branching scenarios + weighted 60/25/15 scoring; §4 matching game modes and drag-and-drop interaction; §5 journey/stage (chặng) editor with unlock rules and multiple endings; §6 race board editor + teacher shared-screen control; team rotation/leaderboard flows for `thi đấu đội` (the mode currently affects scoring only).
- Suggested next task: pick the next spec gap — §4 matching interactions is the smallest remaining (the suggested Zone D + play-through smoke test is now done via the automated CDP run; re-run with `tests/legacy/smoke-ui.js` after starting the app with `--remote-debugging-port=9333`).


## Dự án của tôi — delete project (2026-10-17)

- Added a 🗑 **Xóa dự án** button to each project card on **Dự án của tôi**, grouped with the ••• edit button inside a new `.card-tools` container (avoids crowding the 3-button action row). It reuses the existing `data-action="delete"` → `window.eduGame.deleteGame` → `library:delete-game` IPC path, which previously had no UI trigger anywhere.
- Hardened the shared handler in `controller.ts`: the confirm dialog now names the project and warns the delete is permanent (suggests exporting `.egame` first), and the handler calls `render()` after `refreshDb()` so the card disappears immediately instead of waiting for navigation.
- New styles in `components.css`: `.card-tools`, `.more-btn.delete-btn` (red icon, hover tint).
- Verified live (2026-10-17, Electron + CDP, harness `tests/legacy/smoke-delete.js`): **11/11 checks passed** — button rendered with correct title/action next to edit; cancel path keeps the project in DOM/state/disk; confirm path removes it from all three, shows toast `Đã xóa dự án.`, re-renders in place, and leaves other projects untouched (6 cards = 6 games). `npm run check` and `npm test` (build + 6 suites) passed afterwards.



## Manual 2B E2E (2026-10-17, headless harness mirroring `src/main.ts`)

- Machine: i5-10210U 4C/8T, 16GB RAM, Win x64; runtime `llama.cpp-b11681`, model `qwen3.5-2b-q4_0` (1_214_873_856 B, SHA verified OK), `cpuThreads=6`, `ctx=8192`, loopback `127.0.0.1`.
- Run 1 (unaccented input, BEFORE fix): startup `3.2s`; B1 `27.4s`; B2 `9.3s`; B3 `34.8s`; B4 `59.4s`; total `134.0s`. B3 overlapped 3/5, B4 `correctOptionId` were English sentences (`valid=0/5`).
- Run 2 (accented input, AFTER fix — prompt + zod + json_schema + `deduplicateQuestions`): startup `2.7s`; B1 `38.4s`; B2 `6.6s`; B3 `20.0s`; B4 `87.5s`.
- B1 AFTER: GOOD — 5 keys on-topic, 5 questions all end with `?`, no hallucinated `114/110` in this run.
- B2 AFTER: GOOD — `Gặp đèn đỏ...` → `dừng trước vạch dừng, không vượt đèn đỏ`, `supported=true`, 4 evidence.
- B3 AFTER: MIXED — raw 5 items but 4/5 overlapped B1 set, so `deduplicateQuestions(0.65)` kept only 1 fresh item; correctly REJECTED as `<3 fresh` by new guard (would surface retry message in UI instead of silently replacing). Model still struggles to invent 5 distinct angles from a 5-sentence source.
- B4 AFTER: GOOD structure — `valid=5/5` (`correctOptionId` all in `a/b/c/d`, options have ids, no `TOM TAT` labels); content usable but Q3 explanation invents `có thể bị xử phạt` beyond source — teacher review still required.
- Files changed: `src/main.ts` (B3 anti-negation prompt + fresh-count guard, B1/B4 prompts, `gameDraftSchema`/`gameDraftResponseSchema`, local-only `json_schema` + zod validation, local temp 0.2 + Qwen sampling); `src/ai-core/document-assist.ts` (`deduplicateQuestions` exact+0.65 similarity + `?` filter); `tests/document-assist.test.ts` (dedup cases).
- Task 1 — model catalog 2B/4B/7B (2026-10-17): removed `qwen3.5-0.8b-q4_0`, added `qwen2.5-7b-q4_0` (bartowski revision `9e3ee5da`, `4_444_121_600 B`, SHA-256 `08a87f62…25025aed`, Apache-2.0, RAM min 12GB/recommended 16GB, 8 threads). Size verified via HF `x-linked-size` + page Xet pointer; license via `Qwen/Qwen2.5-7B-Instruct` (`license:apache-2.0`). Local 0.8B `.gguf` deleted from app data; `README/ARCHITECTURE/model-catalog.test` updated; `npm run check` + `npm test` passed. 7B file not yet downloaded — needs on-device install + latency/quality run.

## Latest handoff update (2026-10-17)

- The create-game page has separate local and cloud document-assist choices. Local uses the app-managed llama.cpp/Qwen runtime; cloud remains the direct user-configured OpenAI-compatible endpoint path. The separate Supabase/Gemini Gateway is not connected to the desktop.
- After document analysis, the chat supports follow-up questions and a dedicated **“Tạo bộ câu hỏi khác”** action. Requests such as “tạo bộ câu hỏi khác” are routed to generate a fresh set from the document instead of being treated as a literal factual question. The current set is supplied as context to discourage repeats, and the new set replaces `analysis.suggestedQuestions`; teachers can then choose to use it when generating a game.
- Ordinary Q&A returns relevant evidence with the answer. A low lexical match is exposed as `supported: false` and displayed as a teacher-review warning rather than blocking the answer. This avoids rejecting Vietnamese paraphrases, but does not guarantee factual correctness.
- Added `tests/document-assist.test.ts` for question-set request recognition and answer/evidence matching; registered it in `npm test`.
- Latest verification on 2026-10-17: `npm test` — **passed** (build and runtime, AI manager, model installer, runtime installer, model catalog, and document-assist tests); `npm run check` — **passed**.
- Not verified in this pass: interactive Electron UI, question generation with an installed local model, cloud calls with real credentials, Windows installer, persistence/import/export, and offline playback. Unit tests cover request-intent detection and matching, not end-to-end model quality.
- Suggested next task: manually exercise the “Tạo bộ câu hỏi khác” flow using installed Qwen models (0.8B/2B/4B), verify the changed set is used in the generated game, and record model-specific quality/latency; then continue the Windows installer and persistence checks.

## Document-assisted game creation

- Added a create-game workflow for document summarization, key points, reviewable sample questions, quiz/scenario recommendations, and follow-up Q&A with evidence excerpts.
- Local analysis/Q&A/game generation now use the app-managed llama.cpp server and pinned Qwen3.5 GGUF models. Online mode remains a user-configured OpenAI-compatible endpoint and sends lesson text to that provider. The desktop does not call the separate Gemini Gateway.
- AI-generated game drafts now include the reviewed analysis in their prompt; AI game generation is gated until document analysis has completed. The offline rule-based draft remains available without model calls.
- The model picker offers Qwen3.5 0.8B/2B/4B Q4_0. Download URLs are revision-pinned and sizes/SHA-256 were checked against the Hugging Face repository tree; llama.cpp Windows x64 CPU archive `b11681` size/SHA-256 were checked against the GitHub release API and the downloaded archive hash. Model/license links point to the model source and Qwen Apache-2.0 license.
- `ai:install-local-model` app-manages the runtime and model under Electron `userData`; it verifies archive/model integrity, shows download progress, reuses a present model only after checksum verification, and does not add Ollama/another system prerequisite. Download requires Internet. Runtime is currently CPU-only on Windows x64; GPU is not used.
- Before download, local model selection displays the detected CPU model/logical threads, GPU name/VRAM when available, per-model RAM/CPU suitability, and a hardware-based recommendation. The current llama.cpp package is CPU-only and does not use the detected GPU. Estimates are not a measured performance promise.
- If a document-assist action is clicked while Offline mode is selected but an installed local model is available, the create flow switches to that model and sends the request through the local runtime. llama.cpp startup errors now include the bounded stderr diagnostic so unsupported model/runtime failures are visible instead of appearing as a generic health timeout.
- Verified the installed Qwen3.5 0.8B GGUF with the app-managed llama.cpp b11681 runtime. Chat requests without Qwen's `enable_thinking: false` template option produced long `reasoning_content` and empty `message.content`, which broke document-assist parsing. Local requests now disable thinking, use Qwen's recommended non-thinking sampling parameters, and cap output tokens. Q&A retrieves question-relevant source sentences, asks the model to answer from those passages, and indicates weak lexical support for teacher review rather than rejecting all paraphrased answers.
- Added `src/ai-core/runtime-installer.ts`, pinned `src/ai-core/model-catalog.ts`, safe redirect allowlisting in `src/ai-core/trusted-download.ts`, and synthetic installer/catalog tests. Runtime is launched/health-checked by `AIManager` and stopped at application shutdown.
- `npm run check` — passed. `npm test` — passed (`runtime tests`, `AI manager tests`, `Model installer tests`, `Runtime installer tests`, `Model catalog tests`).
- No model was downloaded for this verification; the already-installed Qwen3.5 0.8B was run locally. Smoke checks confirmed JSON document summarization and a source-grounded Q&A answer against synthetic lesson text. The 0.8B model also produced an incorrect answer in an earlier unconstrained QA prompt; retrieval and evidence display reduce risk but do not replace teacher review. Broader Vietnamese document quality, alternate-question-set generation, other model sizes, and interaction on different PC hardware remain to be validated.

## Offline AI V1 — Phases A, B, and C

- Product direction is local-only AI generation through an app-managed llama.cpp runtime and a verified GGUF model. This supersedes cloud-first generation for the new V1 path; the existing BYOK UI and Gateway code remain legacy prototype behavior during migration.
- Repository assessment: the project already uses npm, Electron, and TypeScript, with `src/shared`, `src/game-engine`, and `src/services`. React and a pnpm workspace are not needed for Phase A and were not introduced.
- Added `src/ai-core/contracts.ts` with typed lifecycle states, runtime status, model manifest metadata, download progress, loopback runtime options, quiz input/draft shapes, and a local text-generation client contract.
- Added `src/ai-core/ai-manager.ts` with single-launch behavior, trusted absolute paths, `shell: false`, loopback-only port allocation, health-gated readiness, startup timeout, failed-start cleanup, and graceful/forced stop.
- Added `tests/ai-manager.test.ts`; the fake runtime is the current Node executable serving an ephemeral HTTP health endpoint on loopback. It checks deduplicated starts, health readiness, stop, startup failure cleanup, and path validation.
- Added `src/ai-core/model-installer.ts`: validates trusted manifest metadata, HTTPS download URLs (localhost HTTP only for development/tests), available disk space, resumable HTTP Range downloads, download progress, final byte size and SHA-256, and same-directory atomic installation. Invalid checksums are rejected and the partial file is removed.
- Added model selection summaries for detected RAM/CPU, estimated model memory needs, runtime CPU settings, expected result and license. The current packaged runtime is CPU-only; GPU is explicitly off and no speed benchmark is claimed.
- Added `tests/model-installer.test.ts` with a local fake HTTP server: fresh download, resume, no-Range fallback, low-disk rejection, hash mismatch, HTTPS enforcement, and CPU/GPU recommendation summaries.
- `npm run check` — passed; `npm test` — passed (`runtime tests passed`, `AI manager tests passed`, `Model installer tests passed`).
- Phase C is now connected to the Windows x64 desktop create-game flow. The GGUF/runtime sources and checksums are pinned and verified; the remaining validation gap is full-size model installation and real local inference on user hardware.

## Desktop hang diagnosis (2026-10-16)

- Reproduced with Chromium logging: the renderer script was emitted as CommonJS (`exports` reference) but loaded as a plain browser script, causing `Uncaught ReferenceError: exports is not defined` before the UI initialized.
- Set TypeScript `moduleDetection` to `legacy`; a clean build now emits the renderer as a browser script with no CommonJS wrapper.
- Chromium also reported that the app's inline style attributes were blocked by `style-src 'self'`. The CSP now allows inline styles while keeping `script-src 'self'`; it does not enable inline JavaScript.
- Verified the renderer document reached `readyState=complete`, rendered the application page, and a click navigated to the game library through Chromium DevTools Protocol. After the final change, `npm run check` and `npm test` passed and a clean normal `npm start` opened a responsive `EduGame Studio` window. A PDF.js `TT: undefined function: 21` warning may still appear during startup; it did not prevent the window from loading.

## Latest Windows verification (2026-10-16)

- `npm install` — **passed**; installed dependencies. npm reported 20 audit findings (6 moderate, 13 high, 1 critical). No audit remediation was attempted.
- `npm run check` — **passed**.
- `npm test` — **passed** (`runtime tests passed`).
- First `npm start` — TypeScript build passed, but Electron could not load `better-sqlite3`: the native addon was not a valid Win32 application for Electron's ABI.
- `npm run dist:win` — TypeScript build and electron-builder's native dependency rebuild completed; packaging stopped extracting `winCodeSign` because Windows denied symlink creation (`A required privilege is not held by the client`). No Windows installer or unpacked app was produced.
- A subsequent `npm start` attempt found `tsc` missing after the packaging attempt. `npm install` restored dependencies, and `npm run check` / `npm test` passed again.
- Manual `npm rebuild better-sqlite3 --build-from-source --runtime=electron --target=33.4.11 --dist-url=https://electronjs.org/headers` — **failed** during node-gyp configuration: the selected Python 3.12.4 environment has no `distutils` (`ModuleNotFoundError`). Visual Studio 2022 was detected. The options were also reported by npm as unknown CLI config.
- Follow-up launch: `npx electron-rebuild -f -w better-sqlite3` — **passed** (`Rebuild Complete`). Then `npm start` — **passed startup**; the `EduGame Studio` window appeared and the Electron process reported `Responding: True`. This verifies a Windows development launch after rebuilding the native addon; it does not verify the Windows installer or the app's interactive workflows.
- Windows UI flows, SQLite persistence, `.egame` round-trip, offline play, and installer execution remain **unverified**. The packaging and native-build failures above are environment/toolchain blockers; they do not establish that these workflows work or fail in a supported Windows build environment.

## Handoff assessment

### Architecture in the code
- The Electron main process owns the local files, SQLite database, document extraction, import/export, settings, and AI requests. It exposes named IPC operations to the renderer.
- The preload exposes a limited `window.eduGame` API through `contextBridge`; the renderer is configured without Node.js access and displays the Vietnamese desktop UI.
- The TypeScript sources are compiled to CommonJS JavaScript in `dist/` before Electron runs. SQLite stores games and play sessions under Electron `userData`; settings are a separate JSON file. On an empty games table, startup attempts to import v0.2 `library.json`, otherwise seeds a sample game.
- The separate Express Gateway validates Supabase access tokens, calls a Supabase quota RPC, and calls Gemini with a server environment key. The desktop currently does **not** sign into Supabase or call that Gateway: its online path calls a user-configured OpenAI-compatible endpoint directly.
- Saved game data and a local game runtime are intended to support offline play; this assessment did not verify the full desktop flow or offline behavior manually.

### Implemented in code, not fully verified end-to-end
- Electron UI for library, editing, creating drafts, quiz/scenario play, score explanations/replay, and session history.
- SQLite storage and first-run migration attempt; `.egame` import/export; CSV session export.
- Text extraction code for TXT, MD, DOCX, text-based PDF, and PPTX. Scanned-PDF OCR is not implemented.
- Offline rule-based draft generation and a direct OpenAI-compatible online/BYOK endpoint path. Offline drafts use fixed options and require teacher review; they are not model-generated.
- Electron security options (`contextIsolation`, `nodeIntegration: false`, `sandbox`) and a preload bridge are present in code.
- Express/Supabase/Gemini Gateway scaffold and monthly quota RPC are present, but no live cloud integration was tested.
- Matching is represented in UI labels/types, but a dedicated drag-and-drop matching interaction is not implemented.

### Verification results
- `cd edugame-studio-v0.3 && npm install` — **passed**; installed 521 packages. npm reported 20 audit findings (6 moderate, 13 high, 1 critical) and several deprecated dependencies; no audit remediation was attempted.
- Fixed Gateway quota-response typing by validating the Supabase RPC result with Zod; invalid responses now produce a logged 503 instead of an unchecked access.
- `cd edugame-studio-v0.3 && npm run check` — **passed** after the fix.
- `cd edugame-studio-v0.3 && npm test` — **passed**; TypeScript build completed and runtime assertions reported `runtime tests passed`.
- `cd edugame-studio-v0.3 && npx tsx tests/runtime.test.ts` — **passed** (`runtime tests passed`). This exercises only the scoring/summary assertions in `tests/runtime.test.ts`; it does not validate all desktop workflows.
- First `cd edugame-studio-v0.3 && npm start` — TypeScript build passed, but Electron could not load `better-sqlite3` because it had been compiled against Node ABI 127 instead of Electron's ABI 130.
- `cd edugame-studio-v0.3 && npm rebuild better-sqlite3 --build-from-source --runtime=electron --target=33.2.1 --dist-url=https://electronjs.org/headers` — **passed**.
- Retried `cd edugame-studio-v0.3 && npm start` — **Electron main and renderer processes remained running** without the native-module error. Startup on Linux is verified; the UI and in-app flows have not been manually exercised.
- `cd edugame-studio-v0.3 && npm run dist:dir` — **passed**; electron-builder produced `release/linux-unpacked` and rebuilt `better-sqlite3` for Electron 33.4.11.
- `./release/linux-unpacked/edugame-studio --user-data-dir=/tmp/edugame-studio-package-smoke` — **packaged Linux app smoke test passed**; main and renderer processes started and initialized a fresh `edugame-data/edugame.sqlite` plus `settings.json`. Temporary smoke-test data was removed afterward.
- Windows installer build, SQLite save/reopen and persistence flows, migration against real v0.2 data, `.egame` round-trip, offline play with networking disabled, Supabase authentication/quota, and Gemini calls remain **unverified**.

## Present in the codebase (verify locally)
- Electron desktop application with TypeScript source.
- Vietnamese UI, game library/editor, a traffic-safety sample, quiz/scenario runtime, score/explanation/replay flows.
- Local document extraction for supported formats, rule-based offline draft generation.
- SQLite local persistence and attempted first-run migration from v0.2 `library.json`.
- `.egame` import/export and CSV result export.
- Electron preload/IPC security pattern.
- Optional OpenAI-compatible endpoint configuration for local/BYOK experimentation.
- TypeScript/Express AI Gateway scaffold, Supabase auth validation/quota schema, Gemini provider call.

## Known incomplete areas
- Desktop Supabase login/session UI is not connected to the Gateway.
- Desktop cloud generation flow is not yet integrated end-to-end.
- Payment provider and automated subscription management are not implemented.
- Some legacy renderer/main logic may use `@ts-nocheck`; strict typing is incomplete.
- Offline rule-based drafts are not a substitute for a real model and may produce incorrect content. Teachers must review.
- Scanned PDF OCR is not implemented.
- Matching drag-and-drop and richer branching games are incomplete.
- Windows installer/native SQLite compatibility has not been confirmed by a successful Windows build in the handoff environment.

## Verification state
The earlier handoff notes said dependency installation had timed out in another environment. Here, dependency installation, type-check, build, runtime tests, Electron launch, and unpacked Linux packaging smoke test pass. Launching in development initially required rebuilding `better-sqlite3` for Electron; electron-builder rebuilt it for the packaged app. Windows packaging and end-to-end workflows are still unverified.

## First verification checklist
1. Use supported Node.js LTS and npm.
2. Run `npm install`.
3. Run `npm run check` and fix/type-report failures.
4. Run `npm test`.
5. Run `npm start` and manually verify app launch.
6. Create/save/edit/reopen a game; confirm SQLite persistence.
7. Export/import `.egame` and test play with internet disconnected.
8. Test first-run migration using a backup copy of v0.2 data.
9. On Windows, run `npm run dist:win` and test the installer on a clean account/machine.
10. Test the Gateway separately with a non-production Supabase project and test credentials.

## Next priority
1. **P1 — Verify desktop and packaging on Windows:** exercise SQLite save/reopen, v0.2 migration, `.egame` round-trip, and offline play; then run `npm run dist:win`.
2. **P2 — Finish and test cloud integration:** implement desktop Supabase session handling and call the Gateway with the user's access token; add integration tests for auth, quota, invalid AI output, and errors before treating cloud generation as ready.
3. **P3 — Add focused Gateway tests:** cover quota RPC valid/invalid responses and error handling, alongside the existing limited runtime test.
