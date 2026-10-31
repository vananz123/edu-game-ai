# Gameplay Integration

How 3D interactions connect to the existing game engine without changing its
rules, scoring, or offline behaviour. The hard rule: **existing gameplay remains
the source of truth; Three.js only presents and emits.**

## What shipped (DECISIONS #137 → #139)

The **decorative + celebratory** layer is wired across all five games:

- `mountThreeStage($('.game-stage', root))` at the end of each render entry point
  reads `--world-accent` and mounts a full-bleed, pointer-transparent canvas
  (drifting particles + a rotating torus-knot emblem) **behind** the stage DOM.
  Call sites: `renderQuestion` (quiz + scenario, shared engine), matching's
  `renderColumnsBoard`/`renderMemoryBoard`/`renderCategorizeBoard`,
  `renderTreasureStage`/`renderTreasureJourneyMap`, and `renderRaceBoard`.
- `unmountThreeStage()` runs at the top of the render entry points and at every
  results screen (`renderResults`, `renderMatchingResults`,
  `renderTreasureResults`, `renderRaceResults`) plus `closePlaySurface()` (the
  single exit path), so no handle or rAF loop leaks.
- `burstThreeStage('#34d399' | '#f87171')` fires immediately after the handler
  computes the result — `chooseAnswer`, `chooseTreasureAnswer`, `answerRace`,
  matching's `evaluateColumnMatch`/`onMemoryCardClick`/categorize — keyed off the
  same correct/incorrect flag the 2D feedback uses.
- Race is special: `renderRaceBoard` fully re-renders after every answer, so the
  module-level `raceAnswerBurst` flag carries the burst colour across the
  re-render (`answerRace` sets it before rendering; `renderRaceBoard` bursts and
  clears it after the fresh `mountThreeStage`).

### Gameplay-driven patterns (quiz/scenario pilot, DECISIONS #139)

On top of the backdrop, the shared layer now exposes reusable **pattern factories**
(`makeDestructible`, `makeUnlockable`, `makeConstruction`, `makeReactive`,
`celebrate`), a **tween/effect** animation manager, and a 3D-scoped **`on`/`emit`**
event registry. The quiz/scenario engine uses three of them:

- `buildThreeWorld()` (only when `template === 'quiz' | 'scenario'`) builds a
  **construction tower** (`makeConstruction`, bottom-left, one block per question,
  initial `setStage(handle, correctSoFar, { animate: false })`) and a
  **destructible block** (`makeDestructible`, top-right). Groups are added via
  `threeGame.addObject(handle, group, x, y, z)` — `gameplay.ts` never reaches into
  `handle.scene`.
- `reactThree(event, detail)` is the **single** gameplay → 3D dispatcher: it calls
  `threeGame.emit(event, detail)` (for any 3D listeners) then drives the world of the
  template on screen — quiz/scenario: `answer:correct` → green burst +
  `construction.setStage(handle, correctCount)`, `answer:incorrect` → red burst +
  `destructible.shatter(handle)`, `game:completed` → `celebrate(handle)`.
- `chooseAnswer` calls `reactThree(correct ? 'answer:correct' : 'answer:incorrect', ...)`
  **after** `state.gameAnswers.push`, so the tower's `correctCount` includes the
  answer just given. `renderResults` mounts a fresh backdrop with
  `mountThreeStage($('#playBody .game-stage'), { world: false })` then fires
  `reactThree('game:completed', ...)`.

**The other three games use the same dispatcher (DECISIONS #145).**
`mountThreeStage()` builds a per-template world: matching (`buildMatchingWorld` —
chest bottom-left, destructible block top-right), treasure (`buildTreasureWorld` —
one sealed chest per stage) and race (`buildRaceWorld` — tower bottom-left, reactive
orb top-right). Their props are placed by **screen fraction**, not world
coordinates, via `addAnchoredObject(object, fx, fy, z)` →
`threeGame.addObject(...)` + `threeGame.anchor(handle, object, fx, fy, z)` (see
"Project, do not guess" below: the stage aspect flips between the compact modal
preview and fullscreen, so a fixed world x that is "outer margin" in one lands
mid-grid in the other). Fractions used: matching unlock `(0.93, 0.47)` and
destructible `(0.93, 0.32)` (right margin free at both sizes); treasure chest
`(0.28, 0.86)`; race tower `(0.06, 0.93)` with `blockSize: 0.7` and orb
`(0.962, 0.03)` with `size: 0.4`. At 1366×768 fullscreen the race turn card already
overflows the stage (known density limit), so the tower sits behind it while the
top-strip orb and the bursts stay visible; at 1920×1080 the tower stands in the
free band under the turn card. The DOM handlers replace their old
`burstThreeStage` calls with `reactThree`:

| Game | Event | 3D reaction |
| --- | --- | --- |
| matching | `match:correct` / `match:incorrect` | green/red burst; wrong shatters the block, reset after 1.3 s |
| matching | `game:completed` (from `showMatchingComplete`) | chest `open()` + `celebrate()` |
| treasure | `answer:correct` / `answer:incorrect` | green/red burst; correct opens the stage chest |
| treasure | `game:completed` (last stage) | `celebrate()` |
| race | `answer:correct` / `answer:incorrect` | tower `setStage(correctCount)` + orb flash green/red |
| race | `game:completed` (winning answer) | `celebrate()` |

The race board repaints completely after every answer, so the tower is rebuilt from
the presentation-only `state.racePlay.correctCount` (minus the block about to
animate in) and the reaction/celebration are carried across the repaint by
`raceAnswerBurst` / `raceAnswerCelebrate` — same trick as #138's burst flag. Never
move a scoring decision into these handlers: `evaluateColumnMatch`,
`onMemoryCardClick`, `treasureCompleteMission`/`chooseTreasureAnswer` and
`answerRace` stay authoritative, and `game-engine/runtime.ts` is untouched.

`addClickableObject` / `addHoverEffect` exist and are unit-tested, but the
rollout **deliberately does not wire them**: duplicating the 2D answer buttons as
3D meshes would add complexity the spec explicitly warns against. The click/hover
pattern below is the recipe for a future opt-in.

### House Building Mode (quiz, DECISIONS #140, redesigned in #141, target scaled in #143, models + result hero in #144)

A second gameplay mode for the quiz only — `gameSetup.gameplayMode === 'house'`
(absent = `'classic'`, backward compatible). The construction economy is a **pure
module** `src/game-engine/house-build.ts` (same `// @ts-nocheck` + plain functions
+ `module.exports` pattern as `runtime.ts`), deliberately ignorant of both
rendering and scoring:

- `houseCreate()` → `{ parts, correct, wrong }` — a fresh game starts with only
  the foundation (`parts: 0`).
- `houseApplyAnswer(state, maxParts, correct)` → `{ state, parts, prev, maxParts,
  grew, shrank, completed, completedNow }` — a correct answer builds **exactly one
  part** (capped at `maxParts`), a wrong answer removes **exactly one** (floored at
  0, i.e. the foundation is never removed). No streak, no bonus, no thresholds.
- `houseSummary(state, maxParts)` → the read-only snapshot the UI and result
  screen render (`parts`, `maxParts`, `completed`, `remaining`).

**The target comes from the quiz, not a constant (DECISIONS #143).** Owner ask:
"cho chọn số lượng câu hỏi … hoặc 1 cơ chế linh hoạt giúp số lượng nào cũng có thể
hoàn thành được ngôi nhà khi trả lời đúng tất cả câu hỏi". `gameplay.ts` derives it:

```ts
function houseTargetParts(game) {
    const questions = game && Array.isArray(game.questions) ? game.questions.length : 0;
    return Math.max(1, Math.min(houseMaxParts(), questions || 1));
}
```

so a 5-question quiz completes at `5/5`, an 8-question quiz at `8/8`, and longer
quizzes cap at the model's eight parts. Because the economy is a strict +1/−1, a
perfect run always lands exactly on the target and any wrong answer leaves the
house unfinished — no adaptive catch-up that would let a late right answer finish
a house the student mostly skipped.

Rendering stays in `gameplay.ts` + the shared layer: `buildHouseWorld()` calls
`makeConstruction({ parts: houseParts(style) })` — the `parts` option is an array of
stages, each a list of primitive specs (`kind: 'box'|'roof'|'cylinder'` +
`w/h/d/r/color/x/y/z`). Every model keeps the same contract: stage `0` is the
foundation (always visible) and stages `1..8` are the **eight** buildable parts
(roof and chimney are separate stages so an 8-question quiz has one part per
question), so `houseMaxParts() === 8` and the target math is style-independent.

**Four models (DECISIONS #144).** `houseParts(style)` dispatches to
`houseClassicParts()` (`nha-mai-do` — the original red-roof cube house, kept
byte-identical for the shape tests), `houseGardenParts()` (`nha-vuon` — cream
walls, teal door + shutters, veranda, green roof, fence/flower/path),
`houseTowerParts()` (`thap-canh` — stone base, narrow shaft, arrow slits, lookout
ring, slate spire, pennant) and `houseCabinParts()` (`nha-go` — log rings, warm
cross-bar windows, mossy green roof, stone chimney, pines). `houseParts()` with no
argument stays the classic house. The registry is in `house-build.ts`:
`HOUSE_STYLE_IDS`, `houseStyleOptions()` (id + Vietnamese label for the wizard and
editor), `houseStyleLabel(style)`, and `houseStyleFor(style, seed)` — an explicit
valid id wins, anything else hashes the game id (`hash * 31 + charCode`) into the
four models, so one quiz always shows the same house while different games vary;
an empty seed picks `nha-mai-do`. The style is stored as
`gameSetup.houseStyle?: 'auto' | HouseStyle` (quiz only) and round-trips through
editor, wizard and adapter. Each model has its own measured envelope
(`HOUSE_BOUNDS[style] = { w, h }`); `houseTarget()` must size and drop the group
with `bounds.h`/`bounds.w` of the current style, never one global constant.

The 3D must not reveal more than the parts earned, so a part target below 8 is
mapped cumulatively:

```ts
function houseVisualStages(parts, target) {
    const max = houseMaxParts();                        // 8
    const t = Math.max(1, Math.min(max, Math.round(Number(target) || 0)));
    const p = Math.max(0, Math.min(t, Math.round(Number(parts) || 0)));
    return Math.ceil(max * p / t);                      // 0..8
}
```

`setStage(handle, 1 + houseVisualStages(parts, target))` then shows the matching
number of stages, so a 5-part target grows the house in visible steps (2 → 4 → 5 →
7 → 8 stages, i.e. 3D stages 3 → 5 → 6 → 8 → 9) instead of jumps, and only
`parts === target` shows all nine stages.
On the first question the foundation pops in as an intro (`animate: true`).
`reactThree` routes house-mode events to `reactHouse`, which refreshes the
`.house-progress` panel in place (so the bar moves on the same beat), bursts
green/red, animates the part in or out, and celebrates only when `completedNow`.
Scoring is untouched — `runtime.ts` never learns about the house. Verified by
`tests/ui/ui-house-building-check.js` (**84/84**, including a 5-question perfect
run, an 8-question perfect run, a 4/6 unfinished run, an all-wrong run, all four
models, auto-stability and the result hero) and `tests/unit/house-build.test.ts`.

#### Showcase after each answer (DECISIONS #142)

The house is the achievement, so after every answer it becomes the stage centre:
`chooseAnswer` calls `showcaseHouse()` **after** the feedback banner and the
"next" button are in the DOM, which adds `.is-house-showcase` to `.game-stage`.
CSS hides the question/answers/kicker/context/hint/slot and pins the feedback
card + next button to the bottom; `placeHouse(true)` tweens the 3D house out of
its reserved slot into the empty band (0.55 s).

- **The canvas sits under the DOM.** `.game-stage[data-game-world] > *` is
  `z-index: 1` inside an `isolation` context, while the canvas is inline
  `z-index: 0`. A showcase must therefore *hide* DOM content; raising the canvas
  does not work.
- **Project, do not guess.** `threeGame.stagePoint(handle, fx, fy, z)` maps a
  screen fraction (origin top-left) to a world point on plane `z` and returns
  `pxPerUnit`, so the caller sizes the house in pixels:
  `scale = min(heightPx * fill / (bounds.h * pxPerUnit), widthPx * 0.92 /
  (bounds.w * pxPerUnit))` where `bounds = houseBounds(style)`; then drop the
  group by `bounds.h / 2 * scale` because part coordinates grow from the base.
  The result hero uses `HOUSE_RESULT_FILL = 0.8` (its caption sits directly under
  the slot and garden props make the measured box asymmetric); the answer-phase
  slot uses `HOUSE_SLOT_FILL = 0.92`.
- **Anchor to a fraction, do not freeze a projection (DECISIONS #145, D1b).**
  When a prop only needs to sit at a point (no pixel-sized fitting), use
  `threeGame.anchor(handle, object, fx, fy, z)`: it stores `{ object, fx, fy, z }`
  on the handle and `step()` re-projects it **every frame**, so the prop keeps its
  place when the stage resizes — including native fullscreen, which is applied
  *after* the surface is first rendered. Do not call `stagePoint()` once and leave
  the result in `object.position`; that silently drifts on any resize. The camera
  aspect is now set inside `mount()` (not deferred to `step()`), so a synchronous
  `stagePoint()` right after `mount()` is already correct horizontally; the house's
  double-rAF placement is retained because its *measured band* still needs the
  stage to finish laying out.
- **Measure the band, do not reuse a constant.** The free band runs from the
  parts HUD's bottom to the feedback card's top (4 px inset). Use fill **≈0.78**,
  not 1: the model is ~2.3 units deep and near corners project outside the
  centre plane (measured at 1600×1000: fill 0.94 put the roof on the HUD and the
  base 35 px under the banner; 0.78 leaves ~10 px). If the measured band is
  degenerate, leave the house where it is — a fixed fallback band will overlap
  the HUD on short windows.
- **Pin the stage to the visible surface.** Hiding the question collapses a
  content-sized stage; the feedback card then stretches it past the modal
  (957 px vs 950 px). `showcaseStageHeight()` sets
  `min-height = min(modal bottom, window bottom) − stage top`, and the resize
  listener re-pins it for F11/fullscreen.
- **Results show the achievement as a hero (DECISIONS #144).** House mode
  `renderResults` renders `.result-screen.is-house-result` as a two-column grid:
  left = `.result-house-hero` with a `.house-stage-slot` (the same projection
  target as the answer phase, so `houseTarget()` needs no new code) + the
  `.result-house` caption and model name; right = `.result-summary` with the
  score/stats/actions. It stacks to one column under 980px. The world is rebuilt
  by `mountThreeStage` from `state.gameAnswers`, so the hero shows the house at
  its actual final part count. Classic results keep the decorative backdrop.
- **Park the emblem.** `mount(container, { emblem: false })` hides the decorative
  torus knot in house mode so it cannot fight the house for the same space.
- The CDP guard projects the real `Box3` (8 corners) to pixels and asserts the
  house sits between the HUD and the feedback card, that `stageBottom ===
  modalBottom`, and that on the result screen the hero's box stays inside its
  `.result-house-hero .house-stage-slot` — use that pattern for any future
  "3D must line up with DOM" feature.

## The split of responsibilities

| Layer | Owns | Must never do |
| --- | --- | --- |
| `src/game-engine/runtime.ts` | Scoring: `scoreAnswer`, `scoreTextAnswer`, `scoreScenarioDecision`, `calculateSummary`, `resolveScoring`, `questionPoints`. | Touch the DOM or WebGL. |
| `src/renderer/features/gameplay.ts` | The play flow: `renderQuestion`, `chooseAnswer`, `chooseTreasureAnswer`, `answerRace`, matching/treasure/race handlers, `state` (answers, lock, teams). | Delegate scoring to 3D. |
| `three-game-interaction.ts` (`window.threeGame`) | Renderer lifecycle, raycasting, tweens/effects, pattern factories, particles, pointer input, named-event registry. | Validate answers, change `state.gameAnswers`, decide correct/wrong. |

## Event flow (one direction)

```
user gesture on 3D object
        │  threeGame.addClickableObject callback
        ▼
existing gameplay handler: chooseAnswer(question, optionId)
        │  (sets state.answerLocked, scores via game-engine/runtime.ts,
        │   pushes state.gameAnswers, marks .correct/.wrong, shows feedback)
        ▼
2D DOM feedback + (optional) 3D reaction (shake/burst keyed off the same result)
```

A 3D interaction **emits the same intent** the 2D control already emits. It never
computes points. Example for quiz (the click pattern — shipped games stop at the
backdrop + burst above):

```ts
// inside renderQuestion, after the DOM is built and only if threeGame.isAvailable()
const handle = threeGame.mount(illustrationColumn, { world: gameWorld() });
options.forEach(option => {
  const mesh = /* one small shape per option */;
  threeGame.addClickableObject(handle, mesh, () => {
    chooseAnswer(question, option.id);          // same call the 2D button makes
  });
});
```

## State synchronisation

- Read `state.answerLocked` before handling any 3D click; if locked, ignore.
- Read `state.gameIndex` / `state.currentGame` only to decide what to render —
  never to mutate.
- The shared layer holds no gameplay state of its own beyond transient visual
  state (rotation angle, tween progress, particle age). On `unmount` that state
  dies with the handle.

## Cleanup contract

- Before mounting a new question/stage, `threeGame.unmount()` the previous
  handle. Call sites: top of `renderQuestion()`, top of `renderTreasureStage()`
  and the four results screens (`renderResults`, `renderMatchingResults`,
  `renderTreasureResults`, `renderRaceResults`), plus `closePlaySurface()`.
- `closePlaySurface()` (`gameplay.ts` ~:131) is the single "leave the play
  surface" path — unmount there so closing a game never leaks a renderer or a
  `requestAnimationFrame` loop.
- Unmount must also run when the game ends (before results render) and when the
  user answers (the answer-locked state stops interaction; unmount can be
  deferred to the next transition if a small reveal animation must finish).

## Subject / art reuse

- The 2D illustration system is `src/renderer/features/game-illustration.ts`
  (`stageIllustrationHtml`), with treasure backgrounds/characters in
  `treasure-art.ts`. Pick the 3D subject from the same category/icon the 2D scene
  uses so the 3D accent stays on-theme. Do not build a parallel art registry.
- If the item carries a teacher-uploaded picture (`illustrationAssetId` matching
  `^ci-[a-f0-9]{32}$`), the 2D picture is the subject — do not cover it with 3D.

## Sound

- Sound lives in `src/renderer/features/game-audio.ts` (`GameAudio.play(...)`,
  `isEnabled`, `toggle`). A 3D correct/incorrect reaction may call
  `GameAudio.play(...)` but must respect `GameAudio.isEnabled()` (the teacher's
  sound toggle) — the treasure hunt already does this via `bindTreasureSoundToggle`.

## What not to do

- Do not reimplement `scoreAnswer` / `scoreTextAnswer` / `scoreScenarioDecision`.
- Do not write to `state.gameAnswers`, `state.answerLocked`, `state.teamPlay`,
  `tp`/`race` state from the 3D layer.
- Do not bypass the handler and directly call `renderResults` / `sendPresentationState`.
- Do not add a second renderer or animation loop per game.
- Do not change `src/lan/*`, `src/renderer/features/lan.ts`, or
  `src/renderer/features/presentation.ts` — LAN scoring already reuses
  `game-engine/runtime.ts` and must keep matching the renderer's scoring.

## Testing

- Add a CDP UI check (see `tests/ui/`) for each new interaction: assert the 3D
  gesture ends up in `state.gameAnswers` with the same points as the 2D path, and
  that with WebGL disabled the 2D DOM still plays and scores identically.
- `npm run check:renderer-globals` must stay clean (new globals `THREE` and
  `threeGame` need to be declared/allowlisted).
- `npm run verify:css` must stay green (3D adds no CSS invariants).
