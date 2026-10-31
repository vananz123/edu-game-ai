# Interaction Patterns

Reusable Three.js interaction patterns. Each entry states its purpose, which
game it suits, and what to watch for. All go through `window.threeGame` — do not
build these with raw `THREE` calls scattered across gameplay code.

The five games and their answer handlers (source of truth — see
`src/renderer/features/gameplay.ts`; all of them call the shared
`reactThree(event, detail)` dispatcher):

| Game | Entry point | Answer handler | Shipped 3D world |
| --- | --- | --- | --- |
| quiz / scenario | `renderQuestion()` | `chooseAnswer(question, optionId, answerText)` | tower + destructible + confetti (#139) |
| quiz (house mode) | `renderQuestion()` | `chooseAnswer()` → `reactHouse()` | the house model, showcased (#140–#144) |
| matching (columns) | `renderColumnsBoard()` | `onColumnCardClick()` → `evaluateColumnMatch()` | chest + destructible + confetti (#145) |
| matching (memory) | `renderMemoryBoard()` | `onMemoryCardClick()` | chest + destructible + confetti (#145) |
| treasure-hunt | `renderTreasureStage()` | `chooseTreasureAnswer(optionId)`, `treasureCompleteMission()` | chest per stage + confetti (#145) |
| race | `raceTurnPanelHtml()` / `drawRaceQuestion()` | `answerRace(optionId)` | tower + reactive orb + confetti (#145) |

When adding a reaction, put it behind `reactThree` and branch on
`game.template`; do not call the pattern factories from a DOM handler directly.

**Where to put a prop.** Use `threeGame.anchor(handle, object, fx, fy, z)` with a
screen fraction (0..1 from the stage's top-left) instead of a fixed world x/y —
the stage is tall and narrow in the modal preview but wide and short in
fullscreen, and native fullscreen is applied after the first render, so a
one-shot `stagePoint()` would drift. `anchor` re-projects every frame. The
shipped fractions: matching unlock `(0.93, 0.47)` / destructible `(0.93, 0.32)`,
treasure chest `(0.28, 0.86)`, race tower `(0.06, 0.93)` / orb `(0.962, 0.03)`.
Race at 1366×768 fullscreen is denser than the stage: the turn card overflows and
covers the tower, so only the orb and bursts remain visible there.

---

## 1. Clickable 3D objects

**Purpose.** Turn a question's answers or a subject object into 3D shapes the
teacher/student can click, so choosing an answer feels physical.

**Suitable for.** quiz/scenario (click an answer token), treasure-hunt (tap a
chest/artifact per option), race (tap a lane).

**Implementation notes.**
- Use `threeGame.addClickableObject(handle, mesh, onClick)`, which handles
  pointer raycasting and a cursor/`:active` state for you.
- The `onClick` callback must call the game's existing answer handler (e.g.
  `chooseAnswer(question, optionId)`), never score itself.
- Keep a stable mapping from 3D object ↔ `optionId` (store `mesh.userData.optionId`).
- After the answer is locked (`state.answerLocked`), disable further clicks.

## 2. Hover and selection effects

**Purpose.** Highlight what is under the pointer so the projection surface feels
responsive.

**Suitable for.** all five games.

**Implementation notes.**
- `threeGame.addHoverEffect(handle, mesh, { scale: 1.06, emissive: '#...' })`.
- Respect `prefers-reduced-motion` (skip/soften the scale tween).
- Never use hover as the only way to convey correct/incorrect — the 2D feedback
  text (`#answerFeedback`) and `.correct`/`.wrong` classes remain authoritative.

## 3. Drag-and-drop interactions

**Purpose.** Match left/right items or sort objects into groups by dragging.

**Suitable for.** matching (columns and categorize modes).

**Implementation notes.**
- The DOM `.match-card` buttons already drive matching; a 3D drag must end by
  calling `onColumnCardClick` / the same `evaluateColumnMatch()` path, or by
  dispatching a click on the corresponding DOM card — do not re-derive the match.
- Implement drag with `pointerdown`/`pointermove`/`pointerup` on the canvas and
  raycast for the drop target; a small vertical offset while dragging reads well.
- On release, snap the object to the drop target or back to origin (no free
  physics — a simple lerp is enough).

## 4. Object rotation and inspection

**Purpose.** Show a subject (planet, animal, molecule) slowly rotating so the
question has a visual anchor.

**Suitable for.** quiz/scenario (subject in the illustration column),
treasure-hunt (artifact on the current stage).

**Implementation notes.**
- A single `mesh.rotation.y += delta * speed` in the shared render loop is enough;
  do not spin the camera.
- Reuse `game-illustration.ts` category/icon as the subject choice so the 3D
  accent stays on-theme with the 2D scene (see `gameplay-integration.md` §subject).

## 5. Reveal and unlock animations

**Purpose.** Reveal the correct answer or unlock the next stage with a small
motion (lid opening, stone sliding, box glow).

**Suitable for.** treasure-hunt (unlock a stage/artifact), matching (reveal a
matched pair).

**Implementation notes.**
- Trigger **after** the existing handler has validated the answer — reveal is a
  reaction, not a cause.
- Use `threeGame.burst()` or a tweened `scale`/`opacity`; keep duration < 700 ms
  on the projector.

## 6. Correct/incorrect answer feedback

**Purpose.** A brief 3D accent on the result (green glow / red shake) that
mirrors the DOM `.correct`/`.wrong` classes.

**Suitable for.** all five games.

**Implementation notes.**
- `chooseAnswer` already sets `.correct`/`.wrong` on `.answer-option` and writes
  `#answerFeedback`. Add a 3D shake/burst keyed off the same `correct` flag; do
  not move the "correct" decision into 3D.
- Optional: `GameAudio.play(...)` for sound (see `gameplay-integration.md` §sound).

## 7. Progress and reward animations

**Purpose.** Visualize progress (journey map filling, race board moving) or a
reward (coin, gem) with a small 3D flourish.

**Suitable for.** treasure-hunt (journey map), race (board advance), quiz (star
per correct answer).

**Implementation notes.**
- Progress bars/maps already exist in 2D; add a subtle 3D marker that follows the
  same `tp` / race state rather than a second source of truth.
- Reward animation must not delay `#nextQuestionBtn`.

## 8. Victory and defeat effects

**Purpose.** A short celebratory burst on the results screen.

**Suitable for.** all five games (results screens in
`renderResults` / `renderMatchingResults` / `renderTreasureResults` /
`renderRaceResults`).

**Implementation notes.**
- `threeGame.burst(handle, { color, count })` with a low particle count (see
  `performance-guidelines.md` §particles).
- Results screens already have a 2D medal pop (`result-medal-pop`); keep 3D as an
  additive layer and respect `prefers-reduced-motion`.

## 9. Simple interactive 3D environments

**Purpose.** A lightweight backdrop (rotating sky, floating particles) behind the
question to give depth.

**Suitable for.** treasure-hunt (its 6 backgrounds are 2D SVG in
`treasure-art.ts`), race (a lane floor).

**Implementation notes.**
- Keep to one scene with a handful of primitives; no terrain, no skybox loading.
- This is the most expensive pattern — only add it if `isAvailable()` and the
  device budget allows (see `performance-guidelines.md` §budget).

## 10. Particle and visual effects

**Purpose.** Confetti, sparks, or a burst for a correct answer / finish.

**Suitable for.** all five games (sparingly).

**Implementation notes.**
- Use `threeGame.burst()`; cap counts (≈30–60 particles), reuse `THREE.Points`
  with a shared geometry/material, and dispose on completion.
- No custom shaders, no post-processing passes.
