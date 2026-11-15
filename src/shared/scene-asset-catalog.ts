/* The fixed vocabulary a scene blueprint may use (docs/DECISIONS.md #252).
 *
 * A blueprint is JSON chosen by the AI (later) or generated from the content
 * category (P0). It never contains code, coordinates or colours: only ids from
 * the lists below. That is the whole safety argument for letting a model name a
 * picture — an unknown id can only ever mean "use a safe default".
 *
 * One catalog feeds both sides that must agree:
 *   - the prompt (P3) lists these ids so the model cannot invent one;
 *   - `normalizeSceneBlueprint()` accepts exactly these ids and replaces the rest.
 *
 * `backdrop` is deliberately separate from `paletteKey`: a scene is a *place*
 * (layers) drawn in a *mood* (colours). Keeping them independent is what lets
 * "mountains + animals palette" exist without adding drawing primitives.
 *
 * This module must stay free of `illustration-registry` imports: the scene
 * composer imports it, and the registry imports the composer.
 */
import { CONTENT_CATEGORY_IDS } from './content-categories';
import { isIconName } from './icon-registry';
import type { SceneSpec } from './illustration-scene';

/** Bumped only when the JSON shape changes incompatibly. */
export const SCENE_BLUEPRINT_VERSION = 1;

/** A blueprint carries at most two supporting icons. */
export const SCENE_MAX_SUB_ICONS = 2;

/** Rejected above this size. A valid blueprint is ~120–180 bytes. */
export const SCENE_BLUEPRINT_MAX_BYTES = 600;

/** The only layout P0 can draw. The field exists so P1/P2 can add more. */
export const SCENE_LAYOUT_IDS = Object.freeze(['single'] as const);
export type SceneLayoutId = (typeof SCENE_LAYOUT_IDS)[number];

/**
 * Named places, each one an existing `SceneSpec` (#70/#72). No new drawing
 * primitive is introduced: the renderer already knows these layers.
 *
 * `plain` is the fallback for a bad/unknown backdrop: a bare horizon, no props,
 * so the subject is still drawn in a place rather than on a floating card.
 */
export const SCENE_BACKDROPS: Readonly<Record<string, SceneSpec>> = Object.freeze({
  plain: { sky: 'none', horizon: 'line', standing: 'none', fg: 'none', subjectY: 88 },
  meadow: { sky: 'sun', horizon: 'hills', standing: 'none', fg: 'grass', subjectY: 88 },
  forest: { sky: 'clouds', horizon: 'hills', standing: 'trees', fg: 'roots', subjectY: 88 },
  mountain: { sky: 'sun', horizon: 'mountains', standing: 'trees', fg: 'stones', subjectY: 88 },
  sea: { sky: 'moon', horizon: 'sea', standing: 'none', fg: 'waves', subjectY: 84 },
  stars: { sky: 'stars', horizon: 'mountains', standing: 'none', fg: 'stones', subjectY: 84 },
  city: { sky: 'clouds', horizon: 'skyline', standing: 'towers', fg: 'stones', subjectY: 88 },
  classroom: { sky: 'rays', horizon: 'line', standing: 'books', fg: 'stones', subjectY: 86 },
  lab: { sky: 'rays', horizon: 'line', standing: 'graph', fg: 'stones', subjectY: 86 },
  studio: { sky: 'rays', horizon: 'line', standing: 'books', fg: 'boards', subjectY: 86 },
});

export const DEFAULT_SCENE_BACKDROP = 'plain';

export const SCENE_BACKDROP_IDS: readonly string[] = Object.freeze(Object.keys(SCENE_BACKDROPS));

export function isSceneBackdropId(value: unknown): value is string {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(SCENE_BACKDROPS, value);
}

/** Total: an unknown backdrop becomes the safe `plain` scene. */
export function getBackdropSpec(backdrop: unknown): SceneSpec {
  return isSceneBackdropId(backdrop) ? SCENE_BACKDROPS[backdrop] : SCENE_BACKDROPS[DEFAULT_SCENE_BACKDROP];
}

/**
 * Palette keys the blueprint may name: every content category that has a
 * palette (all of them except `general`). Derived from the shared category
 * list, not a second hand-written table.
 */
export const SCENE_PALETTE_KEYS: readonly string[] = Object.freeze(
  CONTENT_CATEGORY_IDS.filter((id) => id !== 'general')
);

export const DEFAULT_SCENE_PALETTE_KEY = 'language';

const PALETTE_KEY_SET: ReadonlySet<string> = new Set(SCENE_PALETTE_KEYS);

export function isScenePaletteKey(value: unknown): value is string {
  return typeof value === 'string' && PALETTE_KEY_SET.has(value);
}

/**
 * Icons a blueprint may use as the subject or a supporting icon.
 *
 * Deliberately a curated subset of the 129 registry icons: a question's picture
 * is a concrete thing (an animal, a tool, a plant), not chrome such as
 * `chevron-down`. `isSceneIconId` additionally checks the registry, so a typo
 * here is rejected at runtime and caught by `scene-catalog.test.ts` at build
 * time.
 */
export const SCENE_ICON_IDS: readonly string[] = Object.freeze([
  // the category icons — every category must be representable by default
  'paw-print', 'leaf', 'rocket', 'heart-pulse', 'car', 'shield-check', 'recycle',
  'landmark', 'map', 'briefcase', 'trophy', 'file-music', 'palette', 'calculator',
  'languages', 'flask-conical', 'cpu', 'stethoscope', 'users', 'house', 'cloud-sun',
  'apple', 'box', 'waves-horizontal',
  // concrete subjects that are not any category's default
  'book-open', 'lightbulb', 'star', 'clock', 'target', 'brain', 'zap', 'sparkles',
  'gift', 'pencil', 'mountain', 'fish', 'bird', 'bug',
]);

const SCENE_ICON_SET: ReadonlySet<string> = new Set(SCENE_ICON_IDS);

export function isSceneIconId(value: unknown): value is string {
  return typeof value === 'string' && SCENE_ICON_SET.has(value) && isIconName(value);
}

/**
 * Category -> the place that best matches it. Used only to build a P0 test
 * scene; the AI path (P3) chooses the backdrop itself.
 */
export const CATEGORY_BACKDROPS: Readonly<Record<string, string>> = Object.freeze({
  general: 'plain',
  animals: 'forest',
  plants: 'forest',
  space: 'stars',
  'human-body': 'classroom',
  transport: 'city',
  safety: 'city',
  environment: 'mountain',
  history: 'mountain',
  geography: 'mountain',
  jobs: 'city',
  sports: 'meadow',
  music: 'studio',
  art: 'studio',
  math: 'classroom',
  language: 'classroom',
  science: 'lab',
  technology: 'lab',
  health: 'classroom',
  family: 'meadow',
  community: 'city',
  weather: 'meadow',
  food: 'meadow',
  objects: 'classroom',
  'water-world': 'sea',
});

/** Total: an unknown category gets the safe `plain` place. */
export function sceneBackdropForCategory(category: unknown): string {
  const id = typeof category === 'string' ? category : '';
  const backdrop = Object.prototype.hasOwnProperty.call(CATEGORY_BACKDROPS, id)
    ? CATEGORY_BACKDROPS[id]
    : DEFAULT_SCENE_BACKDROP;
  return isSceneBackdropId(backdrop) ? backdrop : DEFAULT_SCENE_BACKDROP;
}
