/* Built-in illustration set for game items (docs/DECISIONS.md #62, #67).
 *
 * Why a fixed set and not generated images: the lesson plan may come from a
 * model, and AGENTS.md forbids executing arbitrary model output. Every
 * illustration here is a pure inline SVG built from the existing icon registry
 * plus a category palette, so a saved game stays fully offline, `.egame` files
 * carry no image payload, and an unknown id can only ever mean "draw nothing".
 *
 * `resolveIllustration()` is the ONE place the teacher's
 * `gameSetup.illustrationMode` switch is honoured. Like everything in
 * `asset-validation.ts` it is TOTAL: it never throws and returns `null` when
 * nothing should be drawn, so a corrupt game cannot break a lesson.
 */

import {
  ILLUSTRATION_MODES,
  normalizeIllustrationMode,
  normalizeItemAssets,
  type IllustrationMode,
  type ItemAssetInput,
} from './asset-validation';
import { getCategoryIcon, getCategoryLabel, normalizeContentCategory } from './content-categories';
import { renderBlueprintSvg, renderSceneSvg } from './illustration-scene';
import { normalizeSceneBlueprint, type SceneBlueprint } from './scene-blueprint';

export { ILLUSTRATION_MODES, normalizeIllustrationMode, type IllustrationMode };

/** Palette used for the generated backdrop behind the item's icon. */
export interface IllustrationPalette {
  /** Outer glow / halo colour. */
  glow: string;
  /** Soft card fill. */
  fill: string;
  /** Contrasting stroke for the icon itself. */
  ink: string;
  /** Backdrop sky band (docs/DECISIONS.md #70). Defaults to `fill`. */
  sky?: string;
  /** Ground band the subject stands on. Defaults to a darkened `fill`. */
  ground?: string;
  /**
   * Second hue, the WARM one (#278): props, the sun and anything that should
   * read as "a thing nearby, in a different material". Every palette used to be
   * one hue family, so a scene was a monochrome wash — the reference picture a
   * teacher sent had a blue car, an orange pot and a green plant on cream, i.e.
   * four hues. This is the smallest change that buys that.
   */
  warm?: string;
  /**
   * Third hue, the COOL one (#278): distance and secondary accents (mountains,
   * skyline, towers, pebbles, corner icons). Real distance desaturates and
   * shifts blue; this is the palette's version of that.
   */
  cool?: string;
}

const DEFAULT_PALETTE: IllustrationPalette = Object.freeze({
  glow: '#5b6cff',
  fill: '#eceff9',
  ink: '#2b3563',
  warm: '#d79a3c',
  cool: '#6b7f99',
});

/**
 * The illustration drawn when the data carries no artwork at all
 * (docs/DECISIONS.md #89).
 *
 * Before #89 an item with no `illustrationAssetId`, no `contentCategory` and no
 * `iconName` resolved to `null`, so the play surface rendered an EMPTY
 * `.stage-col`: a 300px-wide hole beside every question of a game whose content
 * the teacher typed by hand or imported from a neutral CSV. The play surface is
 * projected, so a blank half of the screen is a defect, not a neutral default.
 *
 * The fallback is a REAL scene from the same fixed set - not a generated image,
 * not a remote asset - and it deliberately does NOT reuse a topic: `general` has
 * no palette, so it borrows `language`'s (reading/knowledge) and draws the
 * `book-open` icon. `assetId` is `<category>-scene`, so it is interchangeable
 * with any other registered illustration and needs no special-case rendering.
 */
export const DEFAULT_ILLUSTRATION_CATEGORY = 'language';
export const DEFAULT_ILLUSTRATION_ICON = 'book-open';

export const DEFAULT_ILLUSTRATION_ASSET_ID = `${DEFAULT_ILLUSTRATION_CATEGORY}-scene`;


/**
 * Category -> palette. Low saturation so a projected slide still reads as
 * text-first. Categories absent here use `DEFAULT_PALETTE`; that is
 * intentional, not an oversight.
 *
 * #278: each row carries THREE hues, not one. `glow` is the subject's, `warm`
 * is the props' (a second material: orange/coral/gold), `cool` is distance
 * (mountains, skyline, pebbles, corner icons). One hue per palette was the real
 * reason a finished scene still read as a diagram: the reference picture a
 * teacher sent has a blue car, an orange pot and a green plant on cream.
 *
 * #220: the scenes are LIGHT. The play stage is pale from #220 on, so a dark
 * plate with pale ink would be the one dark rectangle left on the board; here
 * `fill` is the card the picture sits in, `sky`/`ground` the two bands, and
 * `ink` the dark stroke of the subject — the same polarity as the stage text.
 */
const CATEGORY_PALETTES: Readonly<Record<string, IllustrationPalette>> = Object.freeze({
  animals: { glow: '#2e9e6b', fill: '#eaf7f0', ink: '#1c5f42', sky: '#e2f3ea', ground: '#d3ebdf', warm: '#d79a3c', cool: '#4a8b8a' },
  plants: { glow: '#3f9a3f', fill: '#eef7ea', ink: '#2c6630', sky: '#e6f3e0', ground: '#d8ecce', warm: '#cfa63e', cool: '#5e8a5a' },
  space: { glow: '#5b4bd6', fill: '#eef0fc', ink: '#3a2f92', sky: '#e7e9fa', ground: '#dcdff3', warm: '#d1698f', cool: '#5a63a8' },
  'human-body': { glow: '#c33f52', fill: '#fdeff1', ink: '#96283a', sky: '#f2b4bd', ground: '#e7949f', warm: '#d9643f', cool: '#7a4a56' },
  transport: { glow: '#2f7ed8', fill: '#eaf2fb', ink: '#1d5b9c', sky: '#e2eef9', ground: '#d3e4f4', warm: '#dd7a5b', cool: '#6b7f99' },
  safety: { glow: '#d98c2b', fill: '#fdf3e6', ink: '#8a5206', sky: '#fcedd9', ground: '#f5dfc4', warm: '#cfa63e', cool: '#6b7f99' },
  environment: { glow: '#2f9e8f', fill: '#e8f6f4', ink: '#1c6f64', sky: '#e0f2ef', ground: '#d0e9e5', warm: '#d79a3c', cool: '#4a8b8a' },
  history: { glow: '#b07a3c', fill: '#f7f0e6', ink: '#7a5326', sky: '#f2e9da', ground: '#e8dcc6', warm: '#cfa63e', cool: '#6b7f99' },
  geography: { glow: '#3b82a8', fill: '#eaf3f7', ink: '#1f5a75', sky: '#e2eff5', ground: '#d2e5ee', warm: '#dd7a5b', cool: '#4a8b8a' },
  jobs: { glow: '#7a6bd8', fill: '#f1effc', ink: '#4b3f9c', sky: '#ebe8fa', ground: '#dfdaf3', warm: '#dd7a5b', cool: '#5a63a8' },
  sports: { glow: '#e0742b', fill: '#fdf0e7', ink: '#9a4715', sky: '#fce9da', ground: '#f5dac4', warm: '#cfa63e', cool: '#6b7f99' },
  music: { glow: '#a24bc4', fill: '#f8edfc', ink: '#72258f', sky: '#f4e4fa', ground: '#ecd6f3', warm: '#d79a3c', cool: '#5a63a8' },
  art: { glow: '#c4497f', fill: '#fceef4', ink: '#93285a', sky: '#fae3ee', ground: '#f4d3e2', warm: '#cfa63e', cool: '#6b7f99' },
  math: { glow: '#2f5fd0', fill: '#ecf1fc', ink: '#24499c', sky: '#a9c3ee', ground: '#8fb0e6', warm: '#e0613c', cool: '#3f4b93' },
  language: { glow: '#3f8a4c', fill: '#eff6ec', ink: '#2f6138', sky: '#a9d19a', ground: '#8bbc79', warm: '#c98a2b', cool: '#3a6f52' },
  science: { glow: '#1f8f9a', fill: '#e9f6f7', ink: '#1c6c74', sky: '#9fd2d6', ground: '#7fbfc5', warm: '#e0613c', cool: '#2c6b70' },
  technology: { glow: '#3f5ecb', fill: '#edf1fc', ink: '#2b4a9e', sky: '#a6c0ee', ground: '#8cade6', warm: '#e0613c', cool: '#3f4b93' },
  health: { glow: '#c53f57', fill: '#fdeef0', ink: '#96283a', sky: '#f2aab6', ground: '#e88a9c', warm: '#c98a2b', cool: '#7a4a56' },
  family: { glow: '#c07a4a', fill: '#fbf1e9', ink: '#8a4b26', sky: '#f7e9dd', ground: '#eedccb', warm: '#cfa63e', cool: '#6b7f99' },
  community: { glow: '#6b7fd0', fill: '#eff2fc', ink: '#3a4b9c', sky: '#e7ebf9', ground: '#d9e0f3', warm: '#d79a3c', cool: '#5a63a8' },
  weather: { glow: '#4b93c9', fill: '#eaf3f9', ink: '#21608c', sky: '#e2eef7', ground: '#d2e4f0', warm: '#cfa63e', cool: '#6b7f99' },
  food: { glow: '#b87a1f', fill: '#fdf5e6', ink: '#8a5206', sky: '#f3d094', ground: '#e8b969', warm: '#d9643f', cool: '#6a6f42' },
  objects: { glow: '#8a8fa8', fill: '#f1f3f8', ink: '#464e63', sky: '#eaedf4', ground: '#dee2ec', warm: '#dd7a5b', cool: '#6b7f99' },
  'water-world': { glow: '#2f97c9', fill: '#e8f3fa', ink: '#1a6289', sky: '#e0eef8', ground: '#cfe4f3', warm: '#dd7a5b', cool: '#4a8b8a' },
});

export function getIllustrationPalette(category: unknown): IllustrationPalette {
  const id = normalizeContentCategory(category);
  return CATEGORY_PALETTES[id] || DEFAULT_PALETTE;
}

/**
 * Categories that own a palette (every content category except `general`).
 * Exported so `scene-asset-catalog.ts` can prove its palette-key list has not
 * drifted; the list is still derived from the palette table, never hand-written.
 */
export const ILLUSTRATION_CATEGORY_IDS: readonly string[] = Object.freeze(Object.keys(CATEGORY_PALETTES));

/**
 * The ids a teacher (or the AI) may name. Deliberately derived from the
 * palettes, so adding a category cannot leave the illustration set behind.
 */
export const ILLUSTRATION_ASSET_IDS: readonly string[] = Object.freeze(
  ILLUSTRATION_CATEGORY_IDS.map((id) => `${id}-scene`)
);

export function isIllustrationAssetId(value: unknown): value is string {
  return typeof value === 'string' && ILLUSTRATION_ASSET_IDS.includes(value);
}

/**
 * Per-item opt-out (#153): the teacher removed the picture on this one question.
 * Distinct from `''`, which means "no explicit pick" and still lets `auto` invent
 * artwork, and from the game-level `off` mode, which silences every item.
 */
export const ILLUSTRATION_NONE_ID = 'none';

/** `animals-scene` -> `animals`; anything else -> null. */
export function illustrationCategoryOf(assetId: unknown): string | null {
  if (!isIllustrationAssetId(assetId)) return null;
  return String(assetId).slice(0, -'-scene'.length);
}

export interface IllustrationRequest extends ItemAssetInput {
  /** Teacher switch, from `gameSetup.illustrationMode`. */
  mode?: unknown;
  /** False when the caller has no room; centralises the decision. */
  allow?: boolean;
}

export interface ResolvedIllustration {
  /** Always a known asset id once resolved. */
  assetId: string;
  category: string;
  /** Icon id, already validated by the registry. */
  iconName: string;
  palette: IllustrationPalette;
  /** Vietnamese label, used for the accessible name. */
  label: string;
  /** True when the teacher chose it, false when derived from the category. */
  explicit: boolean;
  /**
   * When present, draw this blueprint instead of the category's fixed scene
   * (#252). Set only in `auto` mode and only below an explicit teacher pick.
   */
  blueprint?: SceneBlueprint;
  /**
   * True when neither a pick nor a category produced this: the item carried no
   * artwork information at all and `DEFAULT_ILLUSTRATION_*` was drawn instead
   * (#89). Callers may show it differently; rendering is identical.
   */
  isDefault?: boolean;
}

function resolvedFor(
  category: string,
  fallbackIcon: string,
  explicit: boolean,
  isDefault = false,
  iconName?: string
): ResolvedIllustration {
  return {
    assetId: `${category}-scene`,
    category,
    iconName: iconName || getCategoryIcon(category) || fallbackIcon,
    palette: getIllustrationPalette(category),
    label: getCategoryLabel(category),
    explicit,
    isDefault,
  };
}

function resolvedForBlueprint(blueprint: SceneBlueprint): ResolvedIllustration {
  const category = blueprint.paletteKey;
  return {
    assetId: `${category}-scene`,
    category,
    iconName: blueprint.mainIcon,
    palette: getIllustrationPalette(category),
    label: getCategoryLabel(category),
    explicit: false,
    blueprint,
  };
}

/**
 * Decides whether and what to draw for one item. Never throws.
 *
 * - `off`    -> null, always. Nothing is computed. This is the game-level way to
 *               get no picture on the play surface now that #89 added a default.
 * - `illustrationAssetId: 'none'` -> null, whatever the mode (#153). The teacher
 *               removed the picture on this item only; `auto` must not invent one.
 * - `manual` -> only an illustration the teacher explicitly picked. Missing
 *               means null: the mode promises "don't invent artwork", so
 *               falling back to the category would break that promise.
 * - explicit pick -> that scene. It sits ABOVE a blueprint on purpose: the AI
 *               (or "Cảnh thử") must never overwrite a teacher's choice.
 * - `auto`   -> the explicit pick, else a valid blueprint (#252), else the
 *               category default. Items with NOTHING to go on (`general` and
 *               no icon) get the default illustration instead of an empty
 *               column (#89).
 * - unknown mode -> treated as `auto` (matches `normalizeIllustrationMode`).
 */
export function resolveIllustration(request: IllustrationRequest | null | undefined): ResolvedIllustration | null {
  if (!request || typeof request !== 'object') return null;
  if (request.allow === false) return null;
  const mode = normalizeIllustrationMode(request.mode);
  if (mode === 'off') return null;

  const assets = normalizeItemAssets(request);
  if (assets.illustrationAssetId === ILLUSTRATION_NONE_ID) return null;
  const explicitCategory = illustrationCategoryOf(assets.illustrationAssetId);
  if (explicitCategory) return resolvedFor(explicitCategory, assets.iconName, true);

  // `manual` never invents artwork, so an explicit pick is the only path above.
  if (mode === 'manual') return null;

  // auto: a generated blueprint outranks the category's own icon, but never the
  // teacher's explicit pick / opt-out handled above.
  if (assets.sceneBlueprint) return resolvedForBlueprint(assets.sceneBlueprint);

  // auto: the category's own icon / illustration.
  if (assets.iconName) return resolvedFor(assets.contentCategory, assets.iconName, false);

  // auto with nothing at all -> the default scene, never a blank column (#89).
  // The icon is passed explicitly: `resolvedFor` normally prefers the category's
  // own icon, which here would draw `languages` and silently ignore the
  // fallback icon this file declares.
  return resolvedFor(DEFAULT_ILLUSTRATION_CATEGORY, DEFAULT_ILLUSTRATION_ICON, false, true, DEFAULT_ILLUSTRATION_ICON);
}

export interface IllustrationSvgOptions {
  /** Icon size in px. Default 72. */
  size?: number;
  /** Accessible label override. */
  label?: string;
}

/**
 * Self-contained `<svg>` for a resolved illustration, or '' when there is
 * nothing to draw. Delegates to the scene composer (#70) so the artwork stays
 * on-brand and identical between the editor and the play surface.
 */
export function renderIllustrationSvg(
  resolved: ResolvedIllustration | null | undefined,
  options: IllustrationSvgOptions = {}
): string {
  if (!resolved) return '';
  if (resolved.blueprint) {
    return renderBlueprintSvg(resolved.blueprint, resolved.palette, {
      label: options.label || resolved.label || '',
      assetId: resolved.assetId,
      className: 'stage-illustration-svg',
    });
  }
  return renderSceneSvg(resolved.category, resolved.iconName, resolved.palette, {
    label: options.label || resolved.label || '',
    assetId: resolved.assetId,
    className: 'stage-illustration-svg',
  });
}

