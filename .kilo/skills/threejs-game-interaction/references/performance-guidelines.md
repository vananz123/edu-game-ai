# Performance Guidelines

EduGame Studio runs on classroom computers, some low-end, and the play surface is
projected at 1280×720–1920×1080. Three.js is an accent, not a render farm. Every
rule here exists so a 3D element never becomes the reason a game stutters or a
lesson stalls.

## Renderer lifecycle

- **One shared renderer, never per game.** All games mount into the single
  `WebGLRenderer` owned by `window.threeGame` (`src/renderer/features/three-game-interaction.ts`).
  Do not `new THREE.WebGLRenderer()` in gameplay code.
- **Create lazily.** The renderer is created on the first `threeGame.mount()`
  only after `isAvailable()` succeeds. Opening the library or editor must not
  spin up WebGL.
- **Pause when inactive.** `threeGame.setPaused(handle, true)` when the stage is
  hidden, the window is blurred, or a modal covers the play surface. A paused
  handle stops its animation loop and does not render.
- **Dispose on unmount.** `threeGame.unmount(handle)` must `dispose()` every
  geometry, material, and texture it created and stop the loop. Unmount on:
  - moving to the next question / stage (`renderQuestion`, `renderTreasureStage`),
  - `closePlaySurface()`,
  - game over / results.

## Geometry and textures

- Use `THREE.BoxGeometry`, `THREE.SphereGeometry`, `THREE.CylinderGeometry` with
  low segment counts (e.g. sphere `16, 12`). No high-poly imports.
- Reuse a small set of shared materials; do not create a new material per object.
- No external model files, no texture atlases beyond tiny procedural colours.
  Colour via `material.color` / `emissive`, not image textures.

## Particles and lighting

- Cap particles at ~30–60 per `burst()`. Use one `THREE.Points` with a shared
  `BufferGeometry` and `PointsMaterial`, dispose after the animation.
- Lighting: one `AmbientLight` + at most one `DirectionalLight` for the shared
  scene. No shadows (`renderer.shadowMap` stays off), no point-light piles.
- No post-processing (no `EffectComposer`), no custom shaders, no bloom.

## Rendering budget

- Cap `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))` — on a
  4K projector this halves the fill rate at no visible loss for flat-colour
  geometry.
- Keep the canvas small (it lives in the illustration column, not fullscreen).
  Render only when something changed or animating; static scenes can skip frames.
- Respect `prefers-reduced-motion`: skip/shorten tweens, spins, and bursts.

## WebGL availability and the 2D fallback

- `threeGame.isAvailable()` probes a real `WebGLRenderingContext` once and caches
  the result. If it is false (WebGL disabled, old GPU, software rendering
  blocked), **no 3D mounts at all** and the existing 2D DOM is the whole
  experience.
- The 2D answer controls, feedback, scoreboard and results must remain fully
  functional with 3D absent — the DOM is the fallback, never the 3D canvas.
- A runtime WebGL context loss must be handled by `threeGame` (dispose and
  return to 2D) rather than throwing inside gameplay.

## Offline and packaging

- Three.js is bundled locally by `scripts/build-three.js` into
  `dist/src/renderer/vendor/three.global.js` (`window.THREE`). No CDN, no
  network fetch — games stay fully offline (project rule).
- The bundle is ~600 KB minified and ships with the installer; do not add more
  Three.js sub-modules (examples/ loaders) unless a task explicitly justifies it.
