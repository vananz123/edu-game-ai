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
  fill: '#1b2140',
  ink: '#dfe4ff',
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
 */
const CATEGORY_PALETTES: Readonly<Record<string, IllustrationPalette>> = Object.freeze({
  animals: { glow: '#2e9e6b', fill: '#12291f', ink: '#d6f5e4', sky: '#16332a', ground: '#0c1d16' },
  plants: { glow: '#3f9a3f', fill: '#132714', ink: '#dcf6dc', sky: '#18301a', ground: '#0d1b0e' },
  space: { glow: '#5b4bd6', fill: '#171436', ink: '#e2dfff', sky: '#110f2b', ground: '#0a0819' },
  'human-body': { glow: '#d1495b', fill: '#2b1218', ink: '#ffdfe3', sky: '#33151c', ground: '#1e0c10' },
  transport: { glow: '#2f7ed8', fill: '#101f31', ink: '#d8e9fb', sky: '#13273d', ground: '#0a1522' },
  safety: { glow: '#d98c2b', fill: '#2c1e0d', ink: '#ffe8c7', sky: '#342410', ground: '#1e1409' },
  environment: { glow: '#2f9e8f', fill: '#0f2624', ink: '#d4f5ef', sky: '#12302d', ground: '#0a1a19' },
  history: { glow: '#b07a3c', fill: '#2a1d10', ink: '#f6e2c8', sky: '#332314', ground: '#1d140b' },
  geography: { glow: '#3b82a8', fill: '#102430', ink: '#d5edf7', sky: '#132d3b', ground: '#0b1921' },
  jobs: { glow: '#7a6bd8', fill: '#1c1730', ink: '#e6e0ff', sky: '#221c3a', ground: '#141021' },
  sports: { glow: '#e0742b', fill: '#2e1708', ink: '#ffe3cc', sky: '#381c0a', ground: '#200f06' },
  music: { glow: '#a24bc4', fill: '#23122b', ink: '#f0dbff', sky: '#2b1634', ground: '#180d1d' },
  art: { glow: '#c4497f', fill: '#2b1020', ink: '#ffdceb', sky: '#331327', ground: '#1d0b16' },
  math: { glow: '#3f6fd8', fill: '#111d33', ink: '#dbe6ff', sky: '#14233d', ground: '#0b1221' },
  language: { glow: '#4c8f5a', fill: '#132319', ink: '#dcf3e2', sky: '#172b1e', ground: '#0d1911' },
  science: { glow: '#2f9ea8', fill: '#0f2426', ink: '#d6f2f4', sky: '#122d30', ground: '#0a191b' },
  technology: { glow: '#4a6bd0', fill: '#131a2e', ink: '#dde5ff', sky: '#162039', ground: '#0c111f' },
  health: { glow: '#d1546b', fill: '#2b1218', ink: '#ffdde3', sky: '#33151c', ground: '#1d0c10' },
  family: { glow: '#c07a4a', fill: '#2a1a10', ink: '#f8e3d2', sky: '#322014', ground: '#1c110b' },
  community: { glow: '#6b7fd0', fill: '#151a2e', ink: '#e0e6ff', sky: '#192038', ground: '#0e111f' },
  weather: { glow: '#4b93c9', fill: '#10222f', ink: '#d8ecf8', sky: '#132a3a', ground: '#0b1720' },
  food: { glow: '#c98a2b', fill: '#2b1e0c', ink: '#fff0cd', sky: '#33240e', ground: '#1c140a' },
  objects: { glow: '#8a8fa8', fill: '#1a1d28', ink: '#e6e8f0', sky: '#1f2331', ground: '#12151c' },
  'water-world': { glow: '#2f97c9', fill: '#0f2230', ink: '#d6eef9', sky: '#123043', ground: '#081722' },
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

