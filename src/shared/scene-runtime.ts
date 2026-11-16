/* Entry point for the renderer bundle (#272).
 *
 * The renderer is a set of CLASSIC scripts loaded by `src/index.html` in order,
 * so it cannot `import` — which is why `game-illustration.ts` used to be a
 * hand-maintained copy of this module plus `illustration-scene.ts`. That copy
 * drifted twice (#262 corners, #267 arrows) and every new layout had to be
 * written twice.
 *
 * `scripts/build-scene-runtime.js` bundles this barrel with esbuild into
 * `dist/src/renderer/shared/scene-runtime.js`, a single IIFE that publishes
 * `globalThis.SceneRuntime`. The renderer then calls the SAME implementation the
 * main process and the tests use, so there is one source of truth for the
 * catalogue, the normaliser and the geometry.
 *
 * Keep this file a pure re-export list: it is the renderer's view of the shared
 * scene code, and every name added here becomes a public renderer global.
 */
export {
  DEFAULT_SCENE_BACKDROP,
  DEFAULT_SCENE_PALETTE_KEY,
  SCENE_BLUEPRINT_MAX_BYTES,
  SCENE_BLUEPRINT_VERSION,
  SCENE_COMPARE_SIGNS,
  SCENE_ICON_IDS,
  SCENE_LAYOUT_IDS,
  SCENE_MAX_PROPS,
  SCENE_MAX_SUB_ICONS,
  SCENE_PROCESS_MAX_EXTRA_STEPS,
  SCENE_SURROUND_MAX_ICONS,
  getBackdropSpec,
  isSceneBackdropId,
  isSceneIconId,
  isSceneLayoutId,
  isScenePaletteKey,
  sceneBackdropForCategory,
} from './scene-asset-catalog';
export { DEFAULT_SCENE_ICON, normalizeSceneBlueprint, sceneBlueprintFromCategory } from './scene-blueprint';
export { SCENE_HEIGHT, SCENE_WIDTH, getSceneSpec, renderBlueprintSvg, renderSceneSvg } from './illustration-scene';
export { getIllustrationPalette } from './illustration-registry';
