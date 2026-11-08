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
import { renderSceneSvg } from './illustration-scene';

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
}

const DEFAULT_PALETTE: IllustrationPalette = Object.freeze({
  glow: '#5b6cff',
  fill: '#eceff9',
  ink: '#2b3563',
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
 * #220: the scenes are LIGHT. The play stage is pale from #220 on, so a dark
 * plate with pale ink would be the one dark rectangle left on the board; here
 * `fill` is the card the picture sits in, `sky`/`ground` the two bands, and
 * `ink` the dark stroke of the subject — the same polarity as the stage text.
 */
const CATEGORY_PALETTES: Readonly<Record<string, IllustrationPalette>> = Object.freeze({
  animals: { glow: '#2e9e6b', fill: '#eaf7f0', ink: '#1c5f42', sky: '#e2f3ea', ground: '#d3ebdf' },
  plants: { glow: '#3f9a3f', fill: '#eef7ea', ink: '#2c6630', sky: '#e6f3e0', ground: '#d8ecce' },
  space: { glow: '#5b4bd6', fill: '#eef0fc', ink: '#3a2f92', sky: '#e7e9fa', ground: '#dcdff3' },
  'human-body': { glow: '#d1495b', fill: '#fdeff1', ink: '#96283a', sky: '#fbe6e9', ground: '#f5d6db' },
  transport: { glow: '#2f7ed8', fill: '#eaf2fb', ink: '#1d5b9c', sky: '#e2eef9', ground: '#d3e4f4' },
  safety: { glow: '#d98c2b', fill: '#fdf3e6', ink: '#8a5206', sky: '#fcedd9', ground: '#f5dfc4' },
  environment: { glow: '#2f9e8f', fill: '#e8f6f4', ink: '#1c6f64', sky: '#e0f2ef', ground: '#d0e9e5' },
  history: { glow: '#b07a3c', fill: '#f7f0e6', ink: '#7a5326', sky: '#f2e9da', ground: '#e8dcc6' },
  geography: { glow: '#3b82a8', fill: '#eaf3f7', ink: '#1f5a75', sky: '#e2eff5', ground: '#d2e5ee' },
  jobs: { glow: '#7a6bd8', fill: '#f1effc', ink: '#4b3f9c', sky: '#ebe8fa', ground: '#dfdaf3' },
  sports: { glow: '#e0742b', fill: '#fdf0e7', ink: '#9a4715', sky: '#fce9da', ground: '#f5dac4' },
  music: { glow: '#a24bc4', fill: '#f8edfc', ink: '#72258f', sky: '#f4e4fa', ground: '#ecd6f3' },
  art: { glow: '#c4497f', fill: '#fceef4', ink: '#93285a', sky: '#fae3ee', ground: '#f4d3e2' },
  math: { glow: '#3f6fd8', fill: '#ecf1fc', ink: '#24499c', sky: '#e4ebf9', ground: '#d6e0f4' },
  language: { glow: '#4c8f5a', fill: '#eff6ec', ink: '#2f6138', sky: '#e7f2e2', ground: '#d9e9d2' },
  science: { glow: '#2f9ea8', fill: '#e9f6f7', ink: '#1c6c74', sky: '#e1f2f3', ground: '#d1e8ea' },
  technology: { glow: '#4a6bd0', fill: '#edf1fc', ink: '#2b4a9e', sky: '#e5ebf9', ground: '#d7e0f4' },
  health: { glow: '#d1546b', fill: '#fdeef0', ink: '#96283a', sky: '#fbe5e8', ground: '#f5d5da' },
  family: { glow: '#c07a4a', fill: '#fbf1e9', ink: '#8a4b26', sky: '#f7e9dd', ground: '#eedccb' },
  community: { glow: '#6b7fd0', fill: '#eff2fc', ink: '#3a4b9c', sky: '#e7ebf9', ground: '#d9e0f3' },
  weather: { glow: '#4b93c9', fill: '#eaf3f9', ink: '#21608c', sky: '#e2eef7', ground: '#d2e4f0' },
  food: { glow: '#c98a2b', fill: '#fdf5e6', ink: '#8a5206', sky: '#fcefd9', ground: '#f4e2c2' },
  objects: { glow: '#8a8fa8', fill: '#f1f3f8', ink: '#464e63', sky: '#eaedf4', ground: '#dee2ec' },
  'water-world': { glow: '#2f97c9', fill: '#e8f3fa', ink: '#1a6289', sky: '#e0eef8', ground: '#cfe4f3' },
});

export function getIllustrationPalette(category: unknown): IllustrationPalette {
  const id = normalizeContentCategory(category);
  return CATEGORY_PALETTES[id] || DEFAULT_PALETTE;
}

/**
 * The ids a teacher (or the AI) may name. Deliberately derived from the
 * palettes, so adding a category cannot leave the illustration set behind.
 */
export const ILLUSTRATION_ASSET_IDS: readonly string[] = Object.freeze(
  Object.keys(CATEGORY_PALETTES).map((id) => `${id}-scene`)
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
 * - `auto`   -> the explicit pick when known, otherwise the category default.
 *               Items with NOTHING to go on (`general` and no icon) get the
 *               default illustration instead of an empty column (#89).
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
  return renderSceneSvg(resolved.category, resolved.iconName, resolved.palette, {
    label: options.label || resolved.label || '',
    assetId: resolved.assetId,
    className: 'stage-illustration-svg',
  });
}

