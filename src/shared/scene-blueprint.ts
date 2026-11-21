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
  SCENE_COMPARE_SUB_ICON_POSITIONS,
  SCENE_FREE_POS_MAX_SCALE,
  SCENE_FREE_POS_MIN_SCALE,
  SCENE_MAX_PROPS,
  SCENE_MAX_SUB_ICONS,
  SCENE_PROCESS_MAX_EXTRA_STEPS,
  SCENE_SURROUND_MAX_ICONS,
  SCENE_PROCESS_SUB_ICON_POSITIONS,
  SCENE_SUB_ICON_POSITIONS,
  getBackdropSpec,
  isSceneBackdropId,
  isSceneCompareSign,
  isSceneIconId,
  isSceneLayoutId,
  isScenePaletteKey,
  sceneBackdropForCategory,
  type SceneCompareSign,
  type SceneLayoutId,
  type SceneSubIconPosition,
} from './scene-asset-catalog';

export type SceneBlueprintLayout = SceneLayoutId;

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
  /** A key of `SCENE_ICON_IDS` — the thing the question is about. In a
   * `compare` scene this is the **left** subject. */
  mainIcon: string;
  /** `compare` only (#262): the right subject, a key of `SCENE_ICON_IDS`. */
  compareIcon?: string;
  /** `compare` only (#262): the sign between the subjects, or nothing. */
  compareSign?: SceneCompareSign;
  /** `process` only (#267): stages 2..3, left to right. `mainIcon` is stage 1. */
  steps?: string[];
  /** `surround` only (#270): up to four things around the subject, in ring order. */
  around?: string[];
  /** Up to four keys of `SCENE_ICON_IDS`, each in its own corner. */
  subIcons?: SceneSubIcon[];
  /** Up to two keys of `SCENE_ICON_IDS` standing on the ground (#259). */
  props?: string[];
  /**
   * #294 hand-placed nodes. Key is one of `SCENE_FREE_POS_KEYS` (`subject`,
   * `second`, `sign`, `sub-0..3`, `prop-0..1`, `step-1..3`, `around-1..4`); the
   * value is a NORMALISED centre `x`,`y` (0..1 of the scene box) plus a scale.
   * Absent means "derive the position from the layout", so an old `.egame` and a
   * model reply keep drawing exactly as before.
   */
  freePos?: Record<string, { x: number; y: number; s: number }>;
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
 *   - `layout: 'compare'` (#262) needs a valid, different `compareIcon`; if it is
 *     missing/unknown/equal to the subject the scene degrades to `single`;
 *     `compareSign` is optional and an unknown sign is simply dropped; both
 *     fields are removed from a `single` blueprint;
 *   - unknown `backdrop` -> `plain`, unknown `paletteKey` -> `language`;
 *   - `subIcons`: accepts the P0 form (`"leaf"`) and the `#256` form
 *     (`{icon, position}`); invalid, duplicate and the main icon are dropped, a
 *     taken/unknown position falls back to the first free corner, then the list
 *     is capped at `SCENE_MAX_SUB_ICONS` (4); in `compare` only `top-left` and
 *     `top-right` exist, so the lower corners are moved up (#262);
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
  if (!isSceneLayoutId(raw.layout)) {
    issues.push('layout');
    return null;
  }

  const mainIcon = typeof raw.mainIcon === 'string' ? raw.mainIcon.trim() : '';
  if (!isSceneIconId(mainIcon)) {
    issues.push('icon');
    return null;
  }

  // #262 — `compare` asks for a second subject; a sign is optional. A missing,
  // unknown or equal second subject degrades to `single` (the picture still
  // shows the thing the question is about) instead of dropping the whole scene.
  let layout: SceneBlueprintLayout = raw.layout;
  let compareIcon = '';
  let compareSign: SceneCompareSign | undefined;
  if (layout === 'compare') {
    const wantedSecond = typeof raw.compareIcon === 'string' ? raw.compareIcon.trim() : '';
    if (!isSceneIconId(wantedSecond) || wantedSecond === mainIcon) {
      issues.push('compareIcon');
      layout = 'single';
    } else {
      compareIcon = wantedSecond;
      const wantedSign = typeof raw.compareSign === 'string' ? raw.compareSign.trim() : '';
      if (isSceneCompareSign(wantedSign)) {
        compareSign = wantedSign;
      } else if (wantedSign) {
        issues.push('compareSign');
      }
    }
  } else if (raw.compareIcon !== undefined || raw.compareSign !== undefined) {
    // Kept out of `single` on purpose: a stored scene must not carry fields the
    // engine would ignore, or equality checks between two saves start to lie.
    issues.push('compare');
  }

  // #267 — `process` is a sequence, so it needs stages. The same rule as
  // `compare`: a sequence that lost a stage is not worth showing as a sequence,
  // so it degrades to the single picture instead of drawing a broken strip.
  const steps: string[] = [];
  if (layout === 'process') {
    const wanted: unknown[] = Array.isArray(raw.steps) ? (raw.steps as unknown[]) : [];
    for (const entry of wanted) {
      const asObject = isPlainObject(entry);
      const icon = asObject
        ? typeof entry.icon === 'string'
          ? entry.icon.trim()
          : ''
        : typeof entry === 'string'
          ? entry.trim()
          : '';
      if (!isSceneIconId(icon) || icon === mainIcon || steps.includes(icon)) {
        issues.push('steps');
        continue;
      }
      if (steps.length >= SCENE_PROCESS_MAX_EXTRA_STEPS) {
        issues.push('steps');
        continue;
      }
      steps.push(icon);
    }
    if (!steps.length) {
      issues.push('steps');
      layout = 'single';
    }
  } else if (raw.steps !== undefined) {
    issues.push('steps');
  }

  /* #270 — `surround` is a ring with the subject in the middle. The data carries
     only the ORDER of the items: the engine owns the four coordinates, so two
     saves of the same scene can never disagree about where a thing stands.
     Same degradation rule as compare/process: a ring with nothing in it is not a
     ring, so the scene falls back to the single picture. */
  const around: string[] = [];
  if (layout === 'surround') {
    const wanted: unknown[] = Array.isArray(raw.around) ? (raw.around as unknown[]) : [];
    for (const entry of wanted) {
      const asObject = isPlainObject(entry);
      const icon = asObject
        ? typeof entry.icon === 'string'
          ? entry.icon.trim()
          : ''
        : typeof entry === 'string'
          ? entry.trim()
          : '';
      if (!isSceneIconId(icon) || icon === mainIcon || around.includes(icon)) {
        issues.push('around');
        continue;
      }
      if (around.length >= SCENE_SURROUND_MAX_ICONS) {
        issues.push('around');
        continue;
      }
      around.push(icon);
    }
    if (!around.length) {
      issues.push('around');
      layout = 'single';
    }
  } else if (raw.around !== undefined) {
    issues.push('around');
  }

  const subjects = [
    mainIcon,
    ...(compareIcon ? [compareIcon] : []),
    ...(layout === 'process' ? steps : []),
    ...(layout === 'surround' ? around : []),
  ];
  /* Compare and process keep only the two upper corners; the rest are moved
     there. `surround` keeps NONE: all four corners hold the ring (#270), so a
     sub-icon would land on a ring item. The icons are dropped with an issue
     rather than silently moved into the subject's feet. */
  const allowedPositions: readonly SceneSubIconPosition[] =
    layout === 'compare'
      ? SCENE_COMPARE_SUB_ICON_POSITIONS
      : layout === 'process'
        ? SCENE_PROCESS_SUB_ICON_POSITIONS
        : layout === 'surround'
          ? []
          : SCENE_SUB_ICON_POSITIONS;

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
        // #270: `surround` has no corner left for a sub-icon, so they are refused
        // here instead of being pushed with an undefined position.
        if (!allowedPositions.length) {
          issues.push('subIcons');
          continue;
        }
        const asObject = isPlainObject(entry);
        const icon = asObject
          ? typeof entry.icon === 'string'
            ? entry.icon.trim()
            : ''
          : typeof entry === 'string'
            ? entry.trim()
            : '';
        if (!isSceneIconId(icon) || subjects.includes(icon) || subIcons.some((sub) => sub.icon === icon)) {
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
        if (allowedPositions.includes(wanted as SceneSubIconPosition) && !subIcons.some((sub) => sub.position === wanted)) {
          position = wanted as SceneSubIconPosition;
        } else {
          if (wanted) issues.push('subIcons');
          position = allowedPositions.find(
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
          subjects.includes(icon) ||
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

  /* #294: hand-placed nodes. Only keys this layout can actually draw are kept —
     a `step-3` on a `single` scene would be a position for something that is not
     there — and every number is clamped, so a corrupt file cannot push a node
     off the frame. */
  const freePos: Record<string, { x: number; y: number; s: number }> = {};
  if (isPlainObject(raw.freePos)) {
    const allowed = allowedFreePosKeys(layout, subIcons.length, props.length, steps.length, around.length);
    for (const key of Object.keys(raw.freePos as Record<string, unknown>)) {
      if (!allowed.includes(key)) {
        issues.push('freePos');
        continue;
      }
      const entry = (raw.freePos as Record<string, unknown>)[key];
      if (!isPlainObject(entry)) {
        issues.push('freePos');
        continue;
      }
      const x = Number(entry.x);
      const y = Number(entry.y);
      const s = entry.s === undefined ? 1 : Number(entry.s);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(s)) {
        issues.push('freePos');
        continue;
      }
      freePos[key] = {
        x: round3(Math.min(1, Math.max(0, x))),
        y: round3(Math.min(1, Math.max(0, y))),
        s: round3(Math.min(SCENE_FREE_POS_MAX_SCALE, Math.max(SCENE_FREE_POS_MIN_SCALE, s))),
      };
    }
  }

  return {
    v: SCENE_BLUEPRINT_VERSION,
    layout,
    backdrop,
    paletteKey,
    mainIcon,
    ...(compareIcon ? { compareIcon } : {}),
    ...(compareSign ? { compareSign } : {}),
    ...(layout === 'process' && steps.length ? { steps } : {}),
    ...(layout === 'surround' && around.length ? { around } : {}),
    ...(subIcons.length ? { subIcons } : {}),
    ...(props.length ? { props } : {}),
    ...(Object.keys(freePos).length ? { freePos } : {}),
  };
}

/** Keys a given layout can draw, in editor order (#294). */
function allowedFreePosKeys(
  layout: SceneBlueprintLayout,
  subCount: number,
  propCount: number,
  stepCount: number,
  aroundCount: number
): string[] {
  const keys = ['subject'];
  for (let i = 0; i < subCount; i += 1) keys.push(`sub-${i}`);
  for (let i = 0; i < propCount; i += 1) keys.push(`prop-${i}`);
  if (layout === 'compare') keys.push('second', 'sign');
  if (layout === 'process') for (let i = 1; i <= stepCount; i += 1) keys.push(`step-${i}`);
  if (layout === 'surround') for (let i = 1; i <= aroundCount; i += 1) keys.push(`around-${i}`);
  return keys;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
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
