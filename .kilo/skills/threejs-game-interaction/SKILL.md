---
name: threejs-game-interaction
description: >-
  Guidance for adding lightweight, reusable Three.js interactions to the five
  EduGame Studio games (quiz, scenario, matching, treasure-hunt, race) without
  changing their gameplay, scoring, or offline behaviour. Use when asked to make
  a game more interactive, add 3D answer objects, drag-and-drop, reveal/unlock
  effects, or celebrations — and whenever Three.js work touches
  src/renderer/features/games/ (the play surface, split by game in DECISIONS #147).
metadata:
  category: game-interaction
---

# Three.js Game Interaction

Adds small interactive 3D elements to the existing 2D game surfaces. The rule
is always: **Three.js renders and listens; existing gameplay stays the source of
truth.** Read the three references before writing code:

- [`references/interaction-patterns.md`](references/interaction-patterns.md) — the reusable patterns and which game each fits.
- [`references/performance-guidelines.md`](references/performance-guidelines.md) — renderer/geometry lifecycle, disposal, and the 2D fallback.
- [`references/gameplay-integration.md`](references/gameplay-integration.md) — how to wire 3D events into scoring and answer validation, incl. House Building Mode.

> **House Building Mode (quiz)** is the shipped example of a *persistent*,
> answer-driven 3D interaction: a pure economy module (`src/game-engine/house-build.ts`)
> feeds `makeConstruction({ parts })` — a non-uniform cube house where every correct
> answer builds exactly one part and every wrong answer removes exactly one (floored
> at the foundation). The target is **derived from the quiz**, never fixed:
> `houseTargetParts(game) = max(1, min(8, questions.length))`, so 5 questions finish
> at `5/5`, 8 at `8/8`, and longer quizzes cap at 8. Keep the economy in its own
> module and the rendering in the shared layer; scoring (`runtime.ts`) never changes.
> After each answer the house is **showcased** (`.is-house-showcase`): the question
> leaves the stage and the house tweens into the measured gap between the parts HUD
> and the feedback card, using `threeGame.stagePoint()` to line 3D up with DOM pixels.
> The result screen shows the final house as a 3D hero next to the summary, and there
> are four selectable models (`nha-mai-do`, `nha-vuon`, `thap-canh`, `nha-go`) sharing
> the same 9-stage contract — `gameSetup.houseStyle`, absent/`auto` = a stable hash of
> the game id (DECISIONS #142/#143/#144).
>
> **Every game now has a gameplay-driven world (DECISIONS #145).** One
> `reactThree(event, detail)` dispatcher routes by `game.template`: quiz/scenario
> (tower + destructible), house (the model), matching (chest + destructible + confetti
> on all pairs), treasure-hunt (a chest per stage + confetti on the final stage) and
> race (tower + reactive orb + confetti on the winning answer). Props on the three
> new templates are placed with `threeGame.anchor(handle, object, fx, fy, z)` — a
> **screen fraction** re-projected every frame, because the stage aspect flips
> between the compact modal preview and fullscreen (and native fullscreen lands
> after the first render). Keep adding new reactions through that dispatcher — never
> call the pattern factories from a DOM handler directly, and never score in 3D.

## Responsibilities

1. **Use Three.js for lightweight interactive elements** — a rotating subject,
   clickable answer tokens, a reveal/unlock moment, a small celebration. Not a
   full 3D scene, not a world editor.
2. **Prefer the shared layer over custom code.** All 3D work goes through
   `window.threeGame` (`src/renderer/features/three-game-interaction.ts`):
   one shared renderer, one shared lifecycle. Do not create a `WebGLRenderer`
   or a `requestAnimationFrame` loop per game.
3. **Combine 3D with the existing 2D UI.** The DOM answers, scoreboard, and
   progress UI stay. 3D lives in the illustration column / stage and adds an
   interactive or celebratory layer, it does not replace the DOM.
4. **Choose interactions per game's actual gameplay.** See the pattern→game map
   in `interaction-patterns.md`. Do not force every pattern into every game.
5. **Connect visual interactions to existing game events.** A 3D click, hover,
   or drop must end up calling the same handler the 2D control already calls
   (`chooseAnswer`, `chooseTreasureAnswer`, `answerRace`, `onColumnCardClick`,
   `onMemoryCardClick`). Never re-implement scoring.
6. **Prioritize projector readability and classroom usability.** Text, answer
   state, and feedback must stay legible at 1280×720–1920×1080. 3D is an accent,
   not the information carrier.
7. **Avoid unnecessary dependencies and architecture changes.** Three.js is
   bundled to a single `window.THREE` global via `scripts/build-three.js`. Do not
   add physics engines, shader libraries, model loaders, or CDN references.

## How to apply

1. Read the target game's file under `src/renderer/features/games/` (`quiz.ts`,
   `matching.ts`, `treasure.ts`, `race.ts`; `shell.ts` owns entering/leaving) to
   find its entry point and answer handler (the map is in
   `gameplay-integration.md`).
2. Check `window.threeGame.isAvailable()` before mounting anything. If false,
   the existing 2D UI is the whole experience — return early.
3. `threeGame.mount(container, opts)` to attach a canvas, add objects, then wire
   their callbacks to the existing handler.
4. `threeGame.unmount(handle)` on question change and on `closePlaySurface()`.
5. Run `npm run check:renderer-globals` (new globals must be declared/allowlisted),
   `npm run verify:css`, and the CDP UI checks. Add a check for any new behaviour.

## Constraints (do not break)

- Renderer is **plain global scripts** (no ES modules); load order lives in
  `src/index.html` and is guarded by `tests/unit/renderer-load-order.test.ts`.
- CSP is `script-src 'self'` — Three.js must be a local bundle, never a CDN.
- Games must keep working **offline**.
- **LAN classroom mode** (`src/lan/*`, `src/renderer/features/lan.ts`) and
  **projector presentation** (`src/renderer/features/presentation.ts`) must not
  be affected.
- Scoring/validation stays in `src/game-engine/runtime.ts`.
