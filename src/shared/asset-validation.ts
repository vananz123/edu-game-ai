/* Asset validation for game items (docs/DECISIONS.md #60, #61, #62).
 *
 * Every function in this file is TOTAL: it never throws and never returns
 * `undefined`. That is a hard requirement, not a nicety — these run while
 * loading saved games, importing `.egame` files and rendering the play surface,
 * so a single bad value must degrade to "no icon" instead of breaking a lesson.
 *
 * Optional item metadata that flows through here:
 *   contentCategory      - what the item is about; unknown -> 'general'
 *   iconName             - a registry icon id; unknown -> '' (no icon)
 *   illustrationAssetId  - an app-owned illustration id; unknown -> null
 */

import {
  CONTENT_CATEGORY_IDS,
  DEFAULT_CONTENT_CATEGORY,
  getCategoryIcon,
  isContentCategory,
  normalizeContentCategory,
  type ContentCategory,
} from './content-categories';
import { ICON_NAMES, getIconNode, isIconName, renderIconSvg, type IconSvgOptions } from './icon-registry';

export { CONTENT_CATEGORY_IDS, DEFAULT_CONTENT_CATEGORY, normalizeContentCategory, type ContentCategory };
export { ICON_NAMES, isIconName };

/** Teacher switch for content illustrations (docs/DECISIONS.md #62). */
export type IllustrationMode = 'auto' | 'manual' | 'off';

export const ILLUSTRATION_MODES: readonly IllustrationMode[] = Object.freeze([
  'auto',
  'manual',
  'off',
]);

export function normalizeIllustrationMode(value: unknown): IllustrationMode {
  return value === 'manual' || value === 'off' ? value : 'auto';
}

/** Trims a string field; anything else becomes ''. */
function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Normalises an optional icon id. Returns '' when absent or unknown, so callers
 * can use a simple truthiness check. Never throws.
 */
export function normalizeIconName(value: unknown): string {
  const name = cleanText(value);
  return name && isIconName(name) ? name : '';
}

/**
 * Normalises an optional illustration id. Kept as an opaque string: the id space
 * belongs to the illustration registry, which decides whether it resolves.
 * Anything that is not a plain trimmed string becomes null. Never throws.
 */
export function normalizeIllustrationAssetId(value: unknown): string | null {
  const id = cleanText(value);
  return id ? id : null;
}

export interface NormalizedItemAssets {
  /** Always a valid category; `general` when nothing usable was supplied. */
  contentCategory: ContentCategory;
  /** '' when unset or unknown. */
  iconName: string;
  /** null when unset. */
  illustrationAssetId: string | null;
  /** True when the icon came from the category rather than from the item. */
  iconFromCategory: boolean;
}

export interface ItemAssetInput {
  contentCategory?: unknown;
  iconName?: unknown;
  illustrationAssetId?: unknown;
}

/**
 * Normalises the three asset fields of one item. An explicit, recognised
 * `iconName` wins; otherwise the category's default icon is used; `general`
 * intentionally has none. Never throws.
 */
export function normalizeItemAssets(input: ItemAssetInput | null | undefined): NormalizedItemAssets {
  const source = input && typeof input === 'object' ? input : {};
  const contentCategory = normalizeContentCategory(source.contentCategory);
  const explicitIcon = normalizeIconName(source.iconName);
  const categoryIcon = getCategoryIcon(contentCategory);
  const iconName = explicitIcon || (categoryIcon && isIconName(categoryIcon) ? categoryIcon : '');
  return {
    contentCategory,
    iconName,
    illustrationAssetId: normalizeIllustrationAssetId(source.illustrationAssetId),
    iconFromCategory: !explicitIcon && iconName !== '',
  };
}

/**
 * The asset fields to *persist* for one item (docs/DECISIONS.md #65).
 *
 * Same rule the project adapter uses (`itemAssetsFromDraft`): a value is only
 * written when it survived normalisation, and `general` is omitted because a
 * missing category already means `general`. Implemented here so the editor does
 * not have to hand-roll the rule and drift from the adapter.
 *
 * Never throws. Always returns a fresh object, so spreading it into an item
 * cannot alias the input.
 */
export type ItemAssetFieldsForSave = {
  contentCategory?: ContentCategory;
  iconName?: string;
  illustrationAssetId?: string;
};

export function itemAssetFieldsForSave(input: ItemAssetInput | null | undefined): ItemAssetFieldsForSave {
  const source = input && typeof input === 'object' ? input : {};
  const contentCategory = normalizeContentCategory(source.contentCategory);
  const iconName = normalizeIconName(source.iconName);
  const illustrationAssetId = normalizeIllustrationAssetId(source.illustrationAssetId);
  return {
    ...(contentCategory !== 'general' ? { contentCategory } : {}),
    ...(iconName ? { iconName } : {}),
    ...(illustrationAssetId ? { illustrationAssetId } : {}),
  };
}

/**
 * Renders the icon for an item, falling back to the category icon and then to
 * ''. Returns '' rather than throwing for every bad input.
 */
export function renderItemIcon(
  input: ItemAssetInput | null | undefined,
  options: IconSvgOptions = {}
): string {
  const { iconName } = normalizeItemAssets(input);
  return iconName ? renderIconSvg(iconName, options) : '';
}

/** Node array for an item's icon, or null. Never throws. */
export function getItemIconNode(input: ItemAssetInput | null | undefined) {
  const { iconName } = normalizeItemAssets(input);
  return iconName ? getIconNode(iconName) : null;
}

/**
 * True when a category id is recognised. Exposed so callers can tell "teacher
 * really chose `general`" apart from "nothing was stored" without re-importing
 * the category module.
 */
export function isKnownContentCategory(value: unknown): value is ContentCategory {
  return isContentCategory(value);
}

/** The only three fields a teacher may change per item (DECISIONS #72). */
export const ITEM_ASSET_PATCH_KEYS = Object.freeze([
  'contentCategory',
  'iconName',
  'illustrationAssetId',
] as const);

export type ItemAssetPatchKey = (typeof ITEM_ASSET_PATCH_KEYS)[number];

export interface ItemAssetPatch {
  contentCategory?: unknown;
  iconName?: unknown;
  illustrationAssetId?: unknown;
}

export interface ItemAssetPatchResult {
  /** The item with *only* the patch keys replaced; every other key is untouched. */
  item: Record<string, unknown>;
  /** Normalised values that were applied, for the UI/logs. */
  applied: ItemAssetFieldsForSave;
  /** True when the patch carried at least one of the three keys. */
  changed: boolean;
}

/**
 * Applies an asset patch to one item, and nothing else (DECISIONS #72).
 *
 * This is the whole security surface of `lesson:patch-item-assets`: the patch is
 * a *whitelist*, not a merge. Keys outside `ITEM_ASSET_PATCH_KEYS` are ignored
 * even if the caller sends them, so a compromised renderer cannot rewrite a
 * prompt, an answer, an id or a link through this channel.
 *
 * `illustrationAssetId` is deliberately NOT trimmed to null when it is not a
 * known asset id: the id space belongs to the illustration registry
 * (`isIllustrationAssetId`), and keeping that decision in one place is what
 * previously let a hand-copied list invent ids that do not exist (DECISIONS #65).
 * An unknown id therefore stores as-is and resolves to "draw nothing" later.
 *
 * An absent key means "leave as is"; an empty string means "clear":
 *   - `contentCategory: ''`  -> `general` (and `general` is omitted on save)
 *   - `iconName: ''`         -> no explicit icon (category icon applies again)
 *   - `illustrationAssetId: ''` -> cleared, so `auto` falls back to the category
 */
export function applyItemAssetPatch(
  item: unknown,
  patch: ItemAssetPatch | null | undefined
): ItemAssetPatchResult {
  const source = item && typeof item === 'object' && !Array.isArray(item)
    ? (item as Record<string, unknown>)
    : {};
  const next: Record<string, unknown> = { ...source };
  const has = (key: ItemAssetPatchKey) => Boolean(patch) && typeof patch === 'object'
    && Object.prototype.hasOwnProperty.call(patch, key);

  let changed = false;
  let contentCategory: unknown;
  let iconName: unknown;
  let illustrationAssetId: unknown;

  if (has('contentCategory')) {
    contentCategory = normalizeContentCategory(patch!.contentCategory);
    next.contentCategory = contentCategory;
    changed = true;
  }
  if (has('iconName')) {
    iconName = normalizeIconName(patch!.iconName);
    next.iconName = iconName;
    changed = true;
  }
  if (has('illustrationAssetId')) {
    illustrationAssetId = normalizeIllustrationAssetId(patch!.illustrationAssetId) ?? '';
    next.illustrationAssetId = illustrationAssetId;
    changed = true;
  }

  return {
    item: next,
    applied: itemAssetFieldsForSave({
      contentCategory: has('contentCategory') ? contentCategory : source.contentCategory,
      iconName: has('iconName') ? iconName : source.iconName,
      illustrationAssetId: has('illustrationAssetId') ? illustrationAssetId : source.illustrationAssetId,
    }),
    changed,
  };
}
