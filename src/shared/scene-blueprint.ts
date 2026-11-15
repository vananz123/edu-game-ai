/* A compact, safe description of one question illustration
 * (docs/DECISIONS.md #252).
 *
 * P0 stores and draws this; P3 will let the AI choose it. The invariants that
 * make that safe are all enforced here:
 *   - the shape is a fixed, tiny JSON object (~120–180 bytes), never markup;
 *   - every id is checked against `scene-asset-catalog.ts`;
 *   - a bad value degrades to a safe default or drops the blueprint — never
 *     throws, so a corrupt `.egame` cannot break a lesson.
 *
 * `normalizeSceneBlueprint` is TOTAL and IDEMPOTENT: normalising its own output
 * returns the same object. It is the gate main-process storage, `.egame` import
 * and (from P3) model output all pass through.
 */
import { getCategoryIcon, normalizeContentCategory } from './content-categories';
import {
  DEFAULT_SCENE_PALETTE_KEY,
  SCENE_BLUEPRINT_MAX_BYTES,
  SCENE_BLUEPRINT_VERSION,
  SCENE_MAX_SUB_ICONS,
  getBackdropSpec,
  isSceneBackdropId,
  isSceneIconId,
  isScenePaletteKey,
  sceneBackdropForCategory,
} from './scene-asset-catalog';

export type SceneBlueprintLayout = 'single';

export interface SceneBlueprint {
  /** Shape version; currently `1`. */
  v: typeof SCENE_BLUEPRINT_VERSION;
  layout: SceneBlueprintLayout;
  /** A key of `SCENE_BACKDROPS` — the *place*. */
  backdrop: string;
  /** A palette key — the *mood*, independent of the place. */
  paletteKey: string;
  /** A key of `SCENE_ICON_IDS` — the thing the question is about. */
  mainIcon: string;
  /** Up to two keys of `SCENE_ICON_IDS`, flanking the subject. */
  subIcons?: string[];
}

/** `book-open` is the default subject (same icon as #89's fallback scene). */
export const DEFAULT_SCENE_ICON = 'book-open';

function byteLength(value: string): number {
  // Blueprint JSON is ASCII (ids only); `length` is the byte count for it and
  // avoids depending on Node's Buffer inside the embedded V8 (game-package).
  return value.length;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Parses and validates anything into a blueprint, or `null` when it cannot be
 * drawn. `issues` is an optional collector for logging/tests; it never affects
 * the return value.
 *
 * Rules:
 *   - a JSON string is parsed first, so the same function serves the model
 *     (text) and `.egame` (object);
 *   - wrong `v` or `layout`, or an unknown/missing `mainIcon` -> `null`, because
 *     none of them has a safe meaning;
 *   - unknown `backdrop` -> `plain`, unknown `paletteKey` -> `language`;
 *   - `subIcons`: invalid, duplicate and the main icon are dropped, then capped
 *     at `SCENE_MAX_SUB_ICONS`;
 *   - > `SCENE_BLUEPRINT_MAX_BYTES` -> `null` (a compact blueprint is the point).
 */
export function normalizeSceneBlueprint(
  input: unknown,
  issues: string[] = []
): SceneBlueprint | null {
  let raw = input;
  if (typeof raw === 'string') {
    const text = raw.trim();
    if (!text) {
      issues.push('empty');
      return null;
    }
    if (byteLength(text) > SCENE_BLUEPRINT_MAX_BYTES) {
      issues.push('size');
      return null;
    }
    try {
      raw = JSON.parse(text) as unknown;
    } catch {
      issues.push('json');
      return null;
    }
  }
  if (!isPlainObject(raw)) {
    issues.push('shape');
    return null;
  }

  let serialized: string;
  try {
    serialized = JSON.stringify(raw);
  } catch {
    issues.push('shape');
    return null;
  }
  if (byteLength(serialized) > SCENE_BLUEPRINT_MAX_BYTES) {
    issues.push('size');
    return null;
  }

  if (raw.v !== SCENE_BLUEPRINT_VERSION) {
    issues.push('version');
    return null;
  }
  if (raw.layout !== 'single') {
    issues.push('layout');
    return null;
  }

  const mainIcon = typeof raw.mainIcon === 'string' ? raw.mainIcon.trim() : '';
  if (!isSceneIconId(mainIcon)) {
    issues.push('icon');
    return null;
  }

  let backdrop = typeof raw.backdrop === 'string' ? raw.backdrop.trim() : '';
  if (!isSceneBackdropId(backdrop)) {
    issues.push('backdrop');
    backdrop = 'plain';
  }

  let paletteKey = typeof raw.paletteKey === 'string' ? raw.paletteKey.trim() : '';
  if (!isScenePaletteKey(paletteKey)) {
    issues.push('palette');
    paletteKey = DEFAULT_SCENE_PALETTE_KEY;
  }

  const subIcons: string[] = [];
  if (raw.subIcons !== undefined) {
    if (!Array.isArray(raw.subIcons)) {
      issues.push('subIcons');
    } else {
      for (const entry of raw.subIcons) {
        const icon = typeof entry === 'string' ? entry.trim() : '';
        if (!isSceneIconId(icon) || icon === mainIcon || subIcons.includes(icon)) {
          issues.push('subIcons');
          continue;
        }
        if (subIcons.length >= SCENE_MAX_SUB_ICONS) {
          issues.push('subIcons');
          continue;
        }
        subIcons.push(icon);
      }
    }
  }

  return {
    v: SCENE_BLUEPRINT_VERSION,
    layout: 'single',
    backdrop,
    paletteKey,
    mainIcon,
    ...(subIcons.length ? { subIcons } : {}),
  };
}

/**
 * A blueprint for a content category, with no AI involved (P0's "Cảnh thử").
 * Total: unknown categories produce a `general`/`plain` scene.
 */
export function sceneBlueprintFromCategory(category: unknown, iconName?: unknown): SceneBlueprint {
  const id = normalizeContentCategory(category);
  const paletteKey = id === 'general' ? DEFAULT_SCENE_PALETTE_KEY : id;

  const explicit = typeof iconName === 'string' ? iconName.trim() : '';
  const own = getCategoryIcon(id);
  const mainIcon = isSceneIconId(explicit)
    ? explicit
    : isSceneIconId(own)
      ? own
      : DEFAULT_SCENE_ICON;

  return {
    v: SCENE_BLUEPRINT_VERSION,
    layout: 'single',
    backdrop: sceneBackdropForCategory(id),
    paletteKey,
    mainIcon,
  };
}

/** Convenience for tests and storage; never throws for a normalised blueprint. */
export function sceneBlueprintJson(blueprint: SceneBlueprint): string {
  return JSON.stringify(blueprint);
}

/** Exposed so callers/tests can assert the fallback without re-deriving it. */
export function defaultSceneBackdropSpec() {
  return getBackdropSpec('plain');
}
