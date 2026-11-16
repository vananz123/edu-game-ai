/* Illustration markup for the play surface (docs/DECISIONS.md #70, #72, #252).
 *
 * This file is the renderer's ADAPTER, not a second implementation. Since #272
 * the catalogue, the blueprint normaliser and the scene geometry live in
 * `src/shared/` only; `scripts/build-scene-runtime.js` bundles them into
 * `renderer/shared/scene-runtime.js`, loaded before this script, and everything
 * below calls `SceneRuntime`.
 *
 * The copy that used to live here drifted twice (#262 corner icons, #267
 * arrows) because a geometry change had to be written in two places, and
 * `tests/unit/scene-blueprint.test.ts` existed mostly to catch that drift. The
 * split is now:
 *
 *   shared  : vocabulary, normaliser, paint order, coordinates
 *   renderer: when to draw at all, the teacher's own picture, the <div> wrapper
 */
declare const SceneRuntime: {
  SCENE_WIDTH: number;
  SCENE_HEIGHT: number;
  DEFAULT_SCENE_ICON: string;
  SCENE_ICON_IDS: readonly string[];
  normalizeSceneBlueprint(value: unknown): any;
  sceneBlueprintFromCategory(category: unknown, iconName?: unknown): any;
  renderBlueprintSvg(blueprint: any, palette: any, options?: any): string;
  renderSceneSvg(category: string, iconName: string, palette: any, options?: any): string;
  getIllustrationPalette(category: unknown): any;
  isSceneIconId(value: unknown): boolean;
  isScenePaletteKey(value: unknown): boolean;
};

/* Category -> the icon used when a question names none. Mirrors
 * ILLUSTRATION_CATEGORY_ICONS in src/shared/illustration-registry.ts, and
 * `tests/unit/illustration-registry.test.ts` compares the two tables: this is a
 * *default per category*, not geometry, and it is read by the wizard's Step 5
 * (`WIZARD_ART_SCENE_CATEGORIES`) as a plain data table. */
const STAGE_ILLUSTRATION_CATEGORY_ICONS = {
  animals: 'paw-print', plants: 'leaf', space: 'rocket', 'human-body': 'heart-pulse',
  transport: 'car', safety: 'shield-check', environment: 'recycle', history: 'landmark',
  geography: 'map', jobs: 'briefcase', sports: 'trophy', music: 'file-music', art: 'palette',
  math: 'calculator', language: 'languages', science: 'flask-conical', technology: 'cpu',
  health: 'stethoscope', family: 'users', community: 'house', weather: 'cloud-sun',
  food: 'apple', objects: 'box', 'water-world': 'waves-horizontal'
};

const STAGE_ILLUSTRATION_FALLBACK_CATEGORY = 'language';
const STAGE_ILLUSTRATION_FALLBACK_ICON = 'book-open';

function stageIllustrationMode(game: any): string {
  const mode = game && game.gameSetup ? game.gameSetup.illustrationMode : '';
  return mode === 'manual' || mode === 'off' ? mode : 'auto';
}

// Mirrors normalizeItemAssets for just the fields the illustration needs.
function stageIllustrationIcon(item: any): string {
  const source = item && typeof item === 'object' ? item : {};
  const explicit = typeof source.iconName === 'string' ? source.iconName.trim() : '';
  if (explicit) return explicit;
  const category = typeof source.contentCategory === 'string' ? source.contentCategory.trim() : '';
  return Object.prototype.hasOwnProperty.call(STAGE_ILLUSTRATION_CATEGORY_ICONS, category)
    ? STAGE_ILLUSTRATION_CATEGORY_ICONS[category]
    : '';
}

function stageIllustrationCategory(assetId: unknown): string {
  const id = typeof assetId === 'string' ? assetId.trim() : '';
  if (!id.endsWith('-scene')) return '';
  const category = id.slice(0, -'-scene'.length);
  return SceneRuntime.isScenePaletteKey(category) ? category : '';
}

/** The blueprint gate, on the shared normaliser. Kept as a renderer name so the
 *  editor (`editor/questions.ts`) keeps working without importing anything. */
function stageNormalizeBlueprint(value: unknown): any {
  return SceneRuntime.normalizeSceneBlueprint(value);
}

/** The blueprint a category starts from — the shared generator, unchanged. */
function stageBlueprintForCategory(category: unknown, iconName?: unknown): any {
  return SceneRuntime.sceneBlueprintFromCategory(category, iconName);
}

/** Icon ids the scene vocabulary accepts, straight from the shared catalogue. */
function stageIsSceneIconId(value: unknown): boolean {
  return SceneRuntime.isSceneIconId(value);
}

/**
 * URL of the teacher's picture for `assetId`, or '' when it is not an id this app
 * produced (#124). The address (real scheme in Electron, the WebView2 host in Tauri)
 * comes from customImageUrl() in src/services/storage/custom-illustration.ts; the
 * copy lives here because this file is a classic script and that module is
 * CommonJS, so `require` is not available.
 */
function customImageSrc(assetId: unknown): string {
  const id = String(assetId || '');
  if (!/^ci-[a-f0-9]{32}$/.test(id)) return '';
  const path = '/img/' + encodeURIComponent(id);
  const shell = typeof desktopHost === 'undefined' ? 'none' : desktopHost.shell;
  return shell === 'tauri' ? 'http://edugame-file.tauri.localhost' + path : 'edugame-file:' + path;
}

/**
 * What to draw for one question, or null for nothing.
 *
 * Order of precedence (unchanged since #124/#153/#252): teacher's own picture ->
 * explicit scene pick -> "Bỏ ảnh" -> blueprint -> icon + category -> default.
 */
function resolveStageIllustration(item: any, game: any): any {
  const mode = stageIllustrationMode(game);
  if (mode === 'off') return null;
  const source = item && typeof item === 'object' ? item : {};
  // #153: the teacher's per-question opt-out ("✕ Bỏ ảnh"). '' means "no explicit
  // pick" and still lets auto invent artwork, so removing a picture needs its own
  // sentinel — mirrors ILLUSTRATION_NONE_ID in src/shared/illustration-registry.ts.
  if (typeof source.illustrationAssetId === 'string' && source.illustrationAssetId.trim() === 'none') return null;
  // #124: a teacher-uploaded picture wins, and it wins in `manual` mode too — picking a
  // picture is itself the explicit choice. `off` still draws nothing, as set.
  if (typeof source.illustrationAssetId === 'string' && /^ci-[a-f0-9]{32}$/u.test(source.illustrationAssetId)) {
    return { assetId: source.illustrationAssetId, category: 'custom', iconName: '', explicit: true, custom: true };
  }
  const explicit = stageIllustrationCategory(source.illustrationAssetId);
  if (explicit) {
    return { assetId: explicit + '-scene', category: explicit, iconName: STAGE_ILLUSTRATION_CATEGORY_ICONS[explicit], explicit: true };
  }
  // `manual` never invents artwork: only a picked illustration is allowed.
  if (mode === 'manual') return null;
  // #252: a valid blueprint outranks the category default but sits below an
  // explicit pick and below "Bỏ ảnh", both handled above.
  const blueprint = stageNormalizeBlueprint(source.sceneBlueprint);
  if (blueprint) {
    return {
      assetId: blueprint.paletteKey + '-scene',
      category: blueprint.paletteKey,
      iconName: blueprint.mainIcon,
      explicit: false,
      blueprint: blueprint
    };
  }
  const iconName = stageIllustrationIcon(source);
  if (iconName) {
    const own = typeof source.contentCategory === 'string' ? source.contentCategory.trim() : '';
    if (Object.prototype.hasOwnProperty.call(STAGE_ILLUSTRATION_CATEGORY_ICONS, own)) {
      return { assetId: own + '-scene', category: own, iconName: iconName, explicit: false };
    }
  }
  /* Nothing to go on -> the default scene instead of an empty column (#89).
     Mirrors the last line of resolveIllustration() in the shared registry. */
  return {
    assetId: STAGE_ILLUSTRATION_FALLBACK_CATEGORY + '-scene',
    category: STAGE_ILLUSTRATION_FALLBACK_CATEGORY,
    iconName: STAGE_ILLUSTRATION_FALLBACK_ICON,
    explicit: false
  };
}

/**
 * `<div class="stage-illustration">` markup, or '' when nothing should be
 * drawn. Always '' for `off`, so the sibling node simply disappears and the
 * question keeps the full column - no empty box, no layout shift.
 *
 * The picture itself comes from SceneRuntime: `renderBlueprintSvg` for a stored
 * blueprint, `renderSceneSvg` for a category scene. Both return '' when the
 * subject icon is unknown, which is what keeps a broken id from drawing half a
 * scene.
 */
function stageIllustrationHtml(item: any, game: any, extraClass?: string): string {
  const resolved = resolveStageIllustration(item, game);
  if (!resolved) return '';
  const frameClass = 'stage-illustration' + (extraClass ? ' ' + extraClass : '');
  if (resolved.custom) {
    // #124: the teacher's own picture, framed like a built-in scene so the layout does
    // not change between the two. Besides `self`/`data:` the CSP allows only the
    // `edugame-file:` scheme, which serves nothing outside the app's image folder;
    // under Tauri that scheme is reached through a WebView2 host (customImageSrc).
    // `meet` (contain) not `slice`: an uploaded picture can be portrait, square or
    // panorama, and `slice` cropped it to the fixed 16:10 frame (a portrait photo lost
    // top and bottom). `meet` shows the whole picture, letterboxed on `.is-custom`.
    const src = customImageSrc(resolved.assetId);
    if (!src) return '';
    const cls = frameClass + ' is-custom';
    return `<div class="${cls}" data-illustration="${escapeHtml(resolved.assetId)}" aria-hidden="true">` +
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200" preserveAspectRatio="xMidYMid meet" class="stage-illustration-svg" aria-hidden="true" focusable="false">` +
      `<image href="${escapeHtml(src)}" x="0" y="0" width="320" height="200" preserveAspectRatio="xMidYMid meet"/>` +
      `</svg></div>`;
  }
  const palette = SceneRuntime.getIllustrationPalette(resolved.category);
  const options = { className: 'stage-illustration-svg' };
  const svg = resolved.blueprint
    ? SceneRuntime.renderBlueprintSvg(resolved.blueprint, palette, options)
    : SceneRuntime.renderSceneSvg(resolved.category, resolved.iconName, palette, options);
  if (!svg) return '';
  return `<div class="${frameClass}" data-illustration="${escapeHtml(resolved.assetId)}" aria-hidden="true">${svg}</div>`;
}
