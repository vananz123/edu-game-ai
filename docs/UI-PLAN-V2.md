# UI/UX Plan v2 — from the projector to the teacher's desk

**Basis:** `docs/archive/specs/update_UI.txt` (15 sections, 6 phases), current code at `1b5f63b` (clean tree), and measurements re-taken today rather than recalled.

**Principle:** every phase names the check that can fail. If a phase cannot be verified, that is stated before the work starts, not after.

---

## Where we actually are

The spec's Phase 5 (projector) is done for the presentation surface. Phases 2, 3, 4 are untouched, and **Phase 5 for the main-window gameplay surface is untouched** — those are different surfaces.

Measured today, not recalled:

| Fact | Value | How measured |
|---|---|---|
| Presentation surface (separate renderer) | min font ≥20px, no clipping, no scroll at 1920×1080 + 1366×768 | `ui-presentation-check` 60/60 |
| Main-window gameplay text | **no fixed viewport, no screenshot** — 27 DOM assertions at whatever size the window happens to be | read `ui-play-surface-check.js` |
| Checks using the screenshot rig | **1 of 13** (`ui-presentation-check` only) | grep `setDeviceMetricsOverride`/`captureScreenshot` across `tests/ui` |
| Inline hex colours in renderer TS | **749** (`treasure-art.ts` 151, `game-illustration.ts` 123, `presentation.ts` 93, `lesson-plans.ts` 65, `my-projects.ts` 44, `gameplay.ts` 41, …) | regex count |
| Design tokens declared | 10 (`--color-*` in `app.css`) | — |
| `beforeunload` / `will-prevent-unload` | **zero occurrences in the repo** | grep |

**The single most important finding:** the projector work taught us the method — pin a viewport, measure, screenshot — and that method has been applied to exactly **one of thirteen** UI checks, on the surface that is *not* where teachers spend their time. The main gameplay surface is still verified by an assertion style that made the 12px bug possible in the first place.

---

## The ordering, and why it is not the spec's ordering

The spec lists Phase 2 (design system) → 3 (workflow) → 4 (games) → 5 (projector) → 6 (verify). I am **not** following that order, for three measured reasons:

1. **Phase 5 is half done, and the done half is the less-used surface.** Finishing it first is cheap now (the rig exists) and expensive later (the code moves under you during Phases 3–4).
2. **Phase 2's "design system" work is 749 hexes.** Doing that before the per-game layout work means touching the same files twice, and re-litigating colours on screens whose layout is about to change.
3. **The one real data-loss bug is not in the spec's phases at all.** §4 asks to "prevent accidental data loss" and §12 repeats it; there is no guard anywhere. That outranks any visual change.

So: **reliability → instrument → finish projector → per-game → tokens → workflow.** Tokens move later precisely because they are mechanical and safest last, when layouts have settled.

---

## Phase A — Unsaved-work protection (do first: it is data loss, not polish) — **DONE**

**Status: implemented and verified 2026-10-25.** See `docs/DECISIONS.md` #82 and the `STATUS.md` entry of the same date.

**Why first:** a teacher can spend several minutes generating a game, close the window, and lose it with no warning. §4 "Prevent accidental data loss when navigating, editing, or closing dialogs" and §12 "Teachers do not lose data because of navigation or UI errors" both require a guard; grep says there is none.

**Scope as built**
- Renderer: `beforeunload` in `bootstrap.ts`, gated by a new `wizardHasUnsavedDraft()` in `state.ts` that is defined as *draft exists and not already in the library*, reusing the existing `wizardGameSavedToLibrary()`. One notion of dirty, as planned.
- Main process: `will-prevent-unload` on the `BrowserWindow` in `src/main.ts`, showing a "stay / discard" dialogue. The decision was extracted to `src/ai-core/unload-guard.ts` so it is unit-testable.
- The guard stands down once the draft is in the library — implemented and asserted.

**Check that can fail:** `tests/ui/ui-draft-guard-check.js` (10 checks, written first and observed failing), plus `tests/unit/unload-guard.test.ts` for the predicate/close truth table.

**Traps that were real, now recorded**
- `beforeunload` in Electron does not block close on its own — confirmed. The main-process half is required.
- **The polarity is inverted between the two events.** In the renderer, `preventDefault()` keeps the work; in `will-prevent-unload`, `preventDefault()` *discards* it and lets the window close. The first implementation had this backwards. The unit test now pins it and was proven to fail when flipped.
- Ignoring `will-prevent-unload` unconditionally traps the teacher in a window that can never close, so the dialogue needs a reachable "discard" path (`defaultId`/`cancelId` both 0 = stay).

**Resolved:** window close only. The stepper-back-to-step-2 path already asks through `wizardConfirmGenreChange`; a second gate there would double-prompt for one decision.

---

## Phase B — Make the measurement method universal — **DONE**

**Status: implemented and verified 2026-10-25.** See `docs/DECISIONS.md` #83 and the `STATUS.md` entry of the same date.

**Why now:** every later phase is worthless if it cannot be measured. Right now the rig is used once, on the wrong surface.

**Scope as built**
- `measureAt(ctx, size, opts)` promoted into `tests/ui/lib/screenshot-capture.js`: pins the viewport, waits for the size to actually land, settles, measures, captures a PNG, and applies the five projector assertions. One implementation, so the rules cannot drift between checks.
- `setViewportAndWait()` polls `innerWidth`/`innerHeight` before measuring — without it a 1920×1080 run reported defects against a viewport that was still 1366×768.
- `ui-play-surface-check.js` retrofitted to **1920×1080 and 1366×768** with 4 screenshots; its 27 existing assertions kept and still green.
- `ui-stage-illustration-check.js` and `ui-item-assets-editor-check.js` given the same per-size layout pass. 16 PNGs total in `tests/ui/shots/`.
- `package.json` gained `check:play-surface-ui`, which did not exist.

**Check that can fail:** the assertion names the element, its text, its box and its overflow distance — `{"tag":"div","cls":"game-stage","pastBy":311}` — so the next regression diagnoses itself instead of being found by a teacher.

**Results:** `ui-play-surface-check` **78/80**, `ui-stage-illustration-check` **90/94**, `ui-item-assets-editor-check` **27/27**.

### Defects Phase B found — status after the vertical-budget fix (DECISIONS #84, #85)

Real projector failures, not test noise. **All six are now fixed at the cause**; the sixth had an assertion all along, which is why it never appeared in the failure list.

| Surface | Viewport | Defect (as found) | Status |
|---|---|---|---|
| `treasure-hunt` | 1366×768 | `.game-stage` **311px** past the bottom; 24 elements clipped; **every answer option off-screen** | **fixed — 0 outside.** Sub-causes: `.treasure-map` held 190px for 124px of content (#85), the map was flex-shrunk until it clipped its own node label, and the answer options kept a `12vh` floor |
| `treasure-hunt` | 1920×1080 | `.game-stage` **93px** past the bottom | **fixed — 0 outside.** The reported `<rect>` was a `preserveAspectRatio="slice"` backdrop drawn at y = −74 |
| `race` | 1366×768 | `.game-stage` **116px** past the bottom; 13 elements | **fixed** — 0 outside |
| `scenario` | 1366×768 | `.game-stage` **25px** past the bottom | **fixed** — 0 outside |
| quiz play surface | 1366×768 | answer options C & D bottom at **820px** against a 768px viewport — **52px clipped** | **fixed** — `ui-play-surface-check` 82/82 |
| "Trình chiếu" button | 1366×768 | label wraps to **two lines** (visible in screenshot, **not asserted**) | **already asserted** — `ui-play-surface-check` asserts `labelLines === 1` and passes at both sizes; the two-line label was the *treasure* template's own header, and that header has now been measured too |

Three more defects were found *while* fixing these and are also fixed: `#modalRoot` was pushed to `top: 1436` on a 768px viewport (`.app-shell` keeps laying out at its full height under `visibility: hidden`); `ui-stage-illustration-check.js` opened its fixtures **without fullscreen**, which made every viewport assertion fail permanently against the wrong surface; and the question sat **0px** from the answers once the artwork moved beside it, which no assertion measured.


The stage also scrolls internally (`scrollHeight 715` vs `clientHeight 683`) — the old "page does not scroll" assertion missed it because the scroll happens inside the stage, not on the document.

**The fix that worked** was not the "reduce padding and illustration height" guess recorded here originally. Measured cost/benefit favoured moving the artwork **beside** the question: vertical space is what a 1366×768 board lacks, horizontal space is what it has. Fixing this by shrinking the SVG height would have made the artwork unreadable while the answers still did not fit (see #84, rejected option c).

**Remaining work for `treasure-hunt`:** the map (`min-height: 190px`, the template's defining element) and the storyline avatar rows are what is left. Either shrink the map when the viewport is short, or move the storyline into the text column.

**Cost:** test-only, no product behaviour changes. Highest leverage per hour on this list.

---

## Phase C — Finish Phase 5 properly (main-window gameplay surface)

**Why:** §7 is "one of the highest-priority requirements", and it holds today only for the presentation window. `gameplay.ts` fullscreen is a *different* surface with *different* CSS (`html[data-fullscreen="1"] .modal[data-player-theme]`) — and it is the surface teachers actually get when they press "Trình chiếu".

**Order — one game per commit, `ui-play-surface-check` + `ui-fullscreen-*-check` re-run after each:**

`matching` → `treasure` → `race` → `scenario` → `arena`

**Why that order:** `matching` is the simplest layout (no timer, no board state) so shared fixes land there first and can be trusted; `race` comes late because its 1366×768 fit problem is the hardest and needs structural change, exactly as it did on the presentation surface.

**Per game:** question prominence, answer grouping, timer/score placement, post-answer feedback, results screen, long-Vietnamese-text wrapping (§8.4, §8.5, §9, §10).

**Explicitly forbidden** (§8.3, §13 Phase 4): changing scoring, rules, turn order or mechanics for visual consistency. Each commit must show mechanics unchanged; the smoke suites are that evidence.

---

## Phase D — Design tokens (spec Phase 2), lowest-risk first

**Why late among the code phases:** mechanical and reversible, and only safe once layouts have stopped moving.

**Order by blast radius, not by count:** `game-illustration.ts` (123, pure data) → `treasure-art.ts` (151, pure data) → `shared.ts` (38) → `gameplay.ts` (41) → `presentation.ts` (93, already measured so a regression shows up immediately) → page files.

**Rule:** a token-migration commit must be **provably** a visual no-op — before/after screenshots comparable except renderer noise, all `ui-*` checks unchanged. A pixel that moves is a bug in the migration, not an improvement.

**Rejected:** a one-shot 749-hex sweep. Unreviewable, and it would hide real regressions inside cosmetic churn.

---

## Phase E — Teacher workflow (spec Phase 3) — large, needs scoping before commitment

**Why last, and deliberately unscheduled:** §4 describes nine workflow steps and §8.1–8.3 add creation, editing and configuration per game. That is the largest body of work in the spec, it touches the most state, and it needs its own plan once A–D have stabilised the surfaces it sits on. Attempting it in the same breath as the rest is how regressions ship.

Cheap things I would audit before proposing anything:
- how many steps the wizard actually has, versus the nine §4 names;
- every path where the stepper lets a teacher arrive with a missing prerequisite;
- whether the defaults are actually sensible (§4), or merely present.

---

## Not in scope, stated so nobody assumes it was done

- **Real projector validation.** Device-metrics emulation reproduces 1920×1080 and 1366×768 exactly, and says nothing about brightness, lit-room contrast or viewing distance. Every phase above inherits this limit. §14's "readable from a distance" is approximated by a font floor, not measured optically.
- **2B model benchmark re-run** — carried over, unrelated to UI.
- **Mojibake (`Ã`/`Â`) encoding bug** in `doc_*.txt`/`settings.json` — carried over, unrelated to UI, but it keeps spreading through any doc a tool rewrites. It has already contaminated `STATUS.md` and `app.css` comments. Cheap to fix; probably worth doing between phases.
- **`presentation.ts` harness fidelity:** it runs in an iframe with a faked IPC layer, so real window z-order/alwaysOnTop is unverified.

---

## Sequencing summary

| Phase | Content | Verification | Risk |
|---|---|---|---|
| **A** | Unsaved-work guard — **DONE 2026-10-25** | `ui-draft-guard-check` 10/10 + `unload-guard` unit test + real-window `WM_CLOSE` | done — inverted `will-prevent-unload` polarity caught by test |
| **B** | Make the rig universal | 4 checks gain viewports + screenshots | low — test-only |
| **C** | Main-window projector, 5 games | play-surface + fullscreen suites per commit | medium — layout, wide regression surface |
| **D** | 749 hexes → tokens | screenshot no-op proof per file | low — mechanical |
| **E** | Teacher workflow | needs its own plan | high — deferred by design |

**Recommended start: A.** It is the only item here where a teacher loses work today, it is small, and it is independent of every layout decision that follows.

If you would rather start with B, that is defensible too — but then A should not slip past the next commit, because A is the only one that is losing user data right now.
