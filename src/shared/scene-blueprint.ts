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
  SCENE_MAX_PROPS,
  SCENE_MAX_SUB_ICONS,
  SCENE_SUB_ICON_POSITIONS,
  getBackdropSpec,
  isSceneBackdropId,
  isSceneIconId,
  isScenePaletteKey,
  isSceneSubIconPosition,
  sceneBackdropForCategory,
  type SceneSubIconPosition,
} from './scene-asset-catalog';

export type SceneBlueprintLayout = 'single';

/** One supporting icon and the corner it sits in. */
export interface SceneSubIcon {
  icon: string;
  position: SceneSubIconPosition;
}

/** What a caller may hand in: a bare id (P0 shape) or `{icon, position}`. */
export type SceneSubIconInput = string | { icon?: unknown; position?: unknown };

export interface SceneBlueprint {
  /** Shape version; currently `1`. `#256` added fields without breaking it. */
  v: typeof SCENE_BLUEPRINT_VERSION;
  layout: SceneBlueprintLayout;
  /** A key of `SCENE_BACKDROPS` — the *place*. */
  backdrop: string;
  /** A palette key — the *mood*, independent of the place. */
  paletteKey: string;
  /** A key of `SCENE_ICON_IDS` — the thing the question is about. */
  mainIcon: string;
  /** Up to four keys of `SCENE_ICON_IDS`, each in its own corner. */
  subIcons?: SceneSubIcon[];
  /** Up to two keys of `SCENE_ICON_IDS` standing on the ground (#259). */
  props?: string[];
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
 *   - `subIcons`: accepts the P0 form (`"leaf"`) and the `#256` form
 *     (`{icon, position}`); invalid, duplicate and the main icon are dropped, a
 *     taken/unknown position falls back to the first free corner, then the list
 *     is capped at `SCENE_MAX_SUB_ICONS` (4);
 *   - `props` (#259): ground objects, same cleaning rules, capped at
 *     `SCENE_MAX_PROPS` (2) and never a duplicate of the subject or a sub icon;
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

  const subIcons: SceneSubIcon[] = [];
  if (raw.subIcons !== undefined) {
    if (!Array.isArray(raw.subIcons)) {
      issues.push('subIcons');
    } else {
      for (const entry of raw.subIcons as SceneSubIconInput[]) {
        const asObject = isPlainObject(entry);
        const icon = asObject
          ? typeof entry.icon === 'string'
            ? entry.icon.trim()
            : ''
          : typeof entry === 'string'
            ? entry.trim()
            : '';
        if (!isSceneIconId(icon) || icon === mainIcon || subIcons.some((sub) => sub.icon === icon)) {
          issues.push('subIcons');
          continue;
        }
        if (subIcons.length >= SCENE_MAX_SUB_ICONS) {
          issues.push('subIcons');
          continue;
        }
        // A named corner wins when it is free; otherwise the first free corner
        // is used, so a duplicate position never drops an icon a child needs.
        const wanted = asObject && typeof entry.position === 'string' ? entry.position.trim() : '';
        let position: SceneSubIconPosition;
        if (isSceneSubIconPosition(wanted) && !subIcons.some((sub) => sub.position === wanted)) {
          position = wanted;
        } else {
          if (wanted) issues.push('subIcons');
          position = SCENE_SUB_ICON_POSITIONS.find(
            (slot) => !subIcons.some((sub) => sub.position === slot)
          ) as SceneSubIconPosition;
        }
        subIcons.push({ icon, position });
      }
    }
  }

  const props: string[] = [];
  if (raw.props !== undefined) {
    if (!Array.isArray(raw.props)) {
      issues.push('props');
    } else {
      for (const entry of raw.props as unknown[]) {
        const icon = typeof entry === 'string' ? entry.trim() : '';
        if (
          !isSceneIconId(icon) ||
          icon === mainIcon ||
          props.includes(icon) ||
          subIcons.some((sub) => sub.icon === icon)
        ) {
          issues.push('props');
          continue;
        }
        if (props.length >= SCENE_MAX_PROPS) {
          issues.push('props');
          continue;
        }
        props.push(icon);
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
    ...(props.length ? { props } : {}),
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
