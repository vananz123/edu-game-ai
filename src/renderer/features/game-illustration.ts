// Renderer half of the illustration decision (docs/DECISIONS.md #67).
//
// Why a copy and not an import: the renderer is loaded as classic `<script>`
// tags (src/index.html) and src/shared/* compiles to CommonJS, so this file
// cannot `require` the registry. `editor/questions.ts` already carries the same
// kind of copy for the item asset fields (#65).
//
// What is duplicated, and how drift is prevented:
//   - the category -> palette table below is the only hand-maintained copy, and
//     must stay identical to CATEGORY_PALETTES in
//     src/shared/illustration-registry.ts;
//   - the category -> icon map is checked against `getCategoryIcon()` by
//     tests/unit/illustration-registry.test.ts;
//   - icon path data is NOT copied by hand - it is generated from the registry
//     into icon-data.ts by scripts/build-icon-data.js, and `npm run build`
//     fails via build:icons:check if that copy is stale.

const STAGE_ILLUSTRATION_PALETTES = {
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
  'water-world': { glow: '#2f97c9', fill: '#0f2230', ink: '#d6eef9', sky: '#123043', ground: '#081722' }
};
const STAGE_ILLUSTRATION_DEFAULT_PALETTE = { glow: '#5b6cff', fill: '#1b2140', ink: '#dfe4ff' };
/* Must match DEFAULT_ILLUSTRATION_* in src/shared/illustration-registry.ts
   (docs/DECISIONS.md #89): the scene drawn when the item carries no artwork at
   all. `language` is a real palette, so the default is an ordinary scene and
   needs no special-case rendering. */
const STAGE_ILLUSTRATION_FALLBACK_CATEGORY = 'language';
const STAGE_ILLUSTRATION_FALLBACK_ICON = 'book-open';

const STAGE_ILLUSTRATION_CATEGORY_ICONS = {
  animals: 'paw-print', plants: 'leaf', space: 'rocket', 'human-body': 'heart-pulse',
  transport: 'car', safety: 'shield-check', environment: 'recycle', history: 'landmark',
  geography: 'map', jobs: 'briefcase', sports: 'trophy', music: 'file-music', art: 'palette',
  math: 'calculator', language: 'languages', science: 'flask-conical', technology: 'cpu',
  health: 'stethoscope', family: 'users', community: 'house', weather: 'cloud-sun',
  food: 'apple', objects: 'box', 'water-world': 'waves-horizontal'
};

function stageIllustrationMode(game) {
  const mode = game && game.gameSetup ? game.gameSetup.illustrationMode : '';
  return mode === 'manual' || mode === 'off' ? mode : 'auto';
}

// Mirrors normalizeItemAssets for just the fields the illustration needs.
function stageIllustrationIcon(item) {
  const source = item && typeof item === 'object' ? item : {};
  const explicit = typeof source.iconName === 'string' ? source.iconName.trim() : '';
  if (explicit) return explicit;
  const category = typeof source.contentCategory === 'string' ? source.contentCategory.trim() : '';
  return Object.prototype.hasOwnProperty.call(STAGE_ILLUSTRATION_CATEGORY_ICONS, category)
    ? STAGE_ILLUSTRATION_CATEGORY_ICONS[category]
    : '';
}

function stageIllustrationCategory(assetId) {
  const id = typeof assetId === 'string' ? assetId.trim() : '';
  if (!id.endsWith('-scene')) return '';
  const category = id.slice(0, -'-scene'.length);
  return Object.prototype.hasOwnProperty.call(STAGE_ILLUSTRATION_PALETTES, category) ? category : '';
}

/**
 * Category -> scene composition (docs/DECISIONS.md #70, #72). Copied from
 * src/shared/illustration-scene.ts for the same reason as the palettes: this
 * file is a classic <script> and cannot import. tests/unit/illustration-registry.test.ts
 * asserts the two stay identical, including which primitive feeds which layer.
 *
 * Layer order is sky -> far -> mid -> halo -> subject -> props -> fg (#72), so
 * `sky`, `horizon`, `standing` and `fg` are paint slots, not just motifs.
 */
const STAGE_ILLUSTRATION_SCENES = {
  animals: { sky: 'sun', horizon: 'hills', standing: 'trees', fg: 'grass', subjectY: 88 },
  plants: { sky: 'sun', horizon: 'hills', standing: 'bushes', fg: 'roots', subjectY: 88 },
  space: { sky: 'stars', horizon: 'mountains', standing: 'none', fg: 'stones', subjectY: 84 },
  'human-body': { sky: 'rays', horizon: 'line', standing: 'none', fg: 'stones', subjectY: 84 },
  transport: { sky: 'clouds', horizon: 'skyline', standing: 'towers', fg: 'stones', subjectY: 88 },
  safety: { sky: 'sun', horizon: 'skyline', standing: 'tools', fg: 'stones', subjectY: 88 },
  environment: { sky: 'clouds', horizon: 'mountains', standing: 'trees', fg: 'grass', subjectY: 88 },
  history: { sky: 'sun', horizon: 'mountains', standing: 'books', fg: 'stones', subjectY: 88 },
  geography: { sky: 'clouds', horizon: 'mountains', standing: 'trees', fg: 'grass', subjectY: 88 },
  jobs: { sky: 'clouds', horizon: 'skyline', standing: 'towers', fg: 'stones', subjectY: 88 },
  sports: { sky: 'sun', horizon: 'hills', standing: 'none', fg: 'grass', subjectY: 88 },
  music: { sky: 'rays', horizon: 'line', standing: 'none', fg: 'stones', subjectY: 84 },
  art: { sky: 'rays', horizon: 'line', standing: 'books', fg: 'boards', subjectY: 86 },
  math: { sky: 'clouds', horizon: 'line', standing: 'graph', fg: 'stones', subjectY: 86 },
  language: { sky: 'clouds', horizon: 'line', standing: 'books', fg: 'stones', subjectY: 86 },
  science: { sky: 'rays', horizon: 'line', standing: 'graph', fg: 'stones', subjectY: 86 },
  technology: { sky: 'clouds', horizon: 'line', standing: 'graph', fg: 'stones', subjectY: 86 },
  health: { sky: 'sun', horizon: 'line', standing: 'none', fg: 'grass', subjectY: 86 },
  family: { sky: 'sun', horizon: 'skyline', standing: 'trees', fg: 'grass', subjectY: 88 },
  community: { sky: 'clouds', horizon: 'skyline', standing: 'towers', fg: 'stones', subjectY: 88 },
  weather: { sky: 'clouds', horizon: 'hills', standing: 'none', fg: 'grass', subjectY: 86 },
  food: { sky: 'sun', horizon: 'hills', standing: 'bushes', fg: 'roots', subjectY: 88 },
  objects: { sky: 'clouds', horizon: 'line', standing: 'books', fg: 'stones', subjectY: 86 },
  'water-world': { sky: 'moon', horizon: 'sea', standing: 'none', fg: 'waves', subjectY: 84 }
};

const STAGE_ILLUSTRATION_DEFAULT_SCENE = {
  sky: 'clouds', horizon: 'hills', standing: 'none', fg: 'stones', subjectY: 88
};

/** Subject icon size in the 320x200 frame; matches SCENE_SUBJECT_SIZE (#72). */
const STAGE_ILLUSTRATION_SUBJECT_SIZE = 120;
/** Horizon line; matches SCENE_HORIZON. */
const STAGE_ILLUSTRATION_HORIZON = 150;

function stageSceneSpec(category) {
  return Object.prototype.hasOwnProperty.call(STAGE_ILLUSTRATION_SCENES, category)
    ? STAGE_ILLUSTRATION_SCENES[category]
    : STAGE_ILLUSTRATION_DEFAULT_SCENE;
}

/**
 * Sky layer, copied from renderSky() in src/shared/illustration-scene.ts.
 * Every primitive uses fixed coordinates: the editor and the play surface must
 * draw the same picture, and a saved scene must never change between runs.
 */
function stageSkySvg(primitive, palette) {
  const ink = escapeHtml(palette.ink);
  const glow = escapeHtml(palette.glow);
  if (primitive === 'sun') {
    return '<g data-scene-primitive="sun">' +
      '<circle cx="268" cy="42" r="27" fill="' + glow + '" opacity="0.16"/>' +
      '<circle cx="268" cy="42" r="15" fill="' + glow + '" opacity="0.34"/></g>';
  }
  if (primitive === 'moon') {
    return '<g data-scene-primitive="moon" fill="' + ink + '" opacity="0.5">' +
      '<path d="M276 26a20 20 0 1 0 14 34 24 24 0 0 1-14-34z"/></g>';
  }
  if (primitive === 'rays') {
    return '<g data-scene-primitive="rays" stroke="' + glow + '" stroke-width="1.6" opacity="0.3" stroke-linecap="round">' +
      '<path d="M28 30l10 10M56 22l5 13M20 58l13 5"/>' +
      '<path d="M292 112l-10 10M264 120l-5 13M300 84l-13 5"/></g>';
  }
  if (primitive === 'stars') {
    return '<g data-scene-primitive="stars" fill="' + ink + '" opacity="0.46">' +
      '<circle cx="42" cy="30" r="2.3"/><circle cx="86" cy="20" r="1.6"/><circle cx="132" cy="40" r="1.9"/>' +
      '<circle cx="188" cy="24" r="2.5"/><circle cx="246" cy="36" r="1.7"/><circle cx="286" cy="66" r="2.1"/>' +
      '<circle cx="30" cy="86" r="1.5"/><circle cx="122" cy="70" r="1.4"/><circle cx="268" cy="104" r="1.8"/></g>';
  }
  if (primitive === 'clouds') {
    return '<g data-scene-primitive="clouds" fill="' + ink + '" opacity="0.08">' +
      '<ellipse cx="66" cy="44" rx="38" ry="16"/><ellipse cx="96" cy="38" rx="26" ry="18"/>' +
      '<ellipse cx="256" cy="58" rx="32" ry="13"/><ellipse cx="234" cy="53" rx="21" ry="15"/></g>';
  }
  return '';
}

/**
 * Far layer (the horizon), copied from renderFar(). Low contrast on purpose:
 * it has to read as distance, not as an object competing with the subject.
 */
function stageFarSvg(primitive, palette) {
  const ink = escapeHtml(palette.ink);
  const glow = escapeHtml(palette.glow);
  const horizon = STAGE_ILLUSTRATION_HORIZON;
  if (primitive === 'hills') {
    return '<g data-scene-primitive="hills" fill="' + glow + '" opacity="0.14">' +
      '<path d="M-12 ' + (horizon + 14) + 'q58-52 118-6 28 22 64-14t162-16v80H-12z"/></g>';
  }
  if (primitive === 'mountains') {
    return '<g data-scene-primitive="mountains" fill="' + ink + '" opacity="0.1">' +
      '<path d="M-10 ' + (horizon + 6) + 'L54 52l40 62 30-26 44 52z"/>' +
      '<path d="M168 ' + (horizon + 6) + 'L228 66l34 50 26-20 44 42z" opacity="0.75"/></g>';
  }
  if (primitive === 'skyline') {
    return '<g data-scene-primitive="skyline" fill="' + ink + '" opacity="0.11">' +
      '<rect x="10" y="94" width="26" height="52" rx="2"/><rect x="42" y="72" width="20" height="74" rx="2"/>' +
      '<rect x="68" y="104" width="24" height="42" rx="2"/><rect x="230" y="98" width="22" height="48" rx="2"/>' +
      '<rect x="258" y="78" width="18" height="68" rx="2"/><rect x="282" y="108" width="26" height="38" rx="2"/></g>';
  }
  if (primitive === 'sea') {
    return '<g data-scene-primitive="sea">' +
      '<rect x="0" y="' + horizon + '" width="320" height="' + (200 - horizon) + '" fill="' + glow + '" opacity="0.12"/>' +
      '<path d="M0 ' + horizon + 'h320" stroke="' + ink + '" stroke-width="1.4" opacity="0.22"/></g>';
  }
  if (primitive === 'line') {
    return '<g data-scene-primitive="line">' +
      '<path d="M0 ' + horizon + 'h320" stroke="' + ink + '" stroke-width="1.2" opacity="0.16"/></g>';
  }
  return '';
}

/**
 * Mid layer, copied from renderMid(). Parked at the frame edges so the centre
 * stays clear for the subject icon.
 */
function stageMidSvg(primitive, palette) {
  const ink = escapeHtml(palette.ink);
  const glow = escapeHtml(palette.glow);
  const h = STAGE_ILLUSTRATION_HORIZON;
  if (primitive === 'trees') {
    return '<g data-scene-primitive="trees" fill="' + glow + '" opacity="0.26">' +
      '<path d="M34 ' + h + 'l-15-30h30z"/><path d="M34 ' + (h - 20) + 'l-11-23h22z"/>' +
      '<rect x="32" y="' + h + '" width="4" height="16"/>' +
      '<path d="M288 ' + (h - 4) + 'l-17-34h34z"/><path d="M288 ' + (h - 26) + 'l-12-26h24z"/>' +
      '<rect x="286" y="' + (h - 4) + '" width="4" height="18"/></g>';
  }
  if (primitive === 'bushes') {
    // Low mounds sitting ON the ground band, not floating above it.
    return '<g data-scene-primitive="bushes" fill="' + glow + '" opacity="0.24">' +
      '<ellipse cx="40" cy="' + (h + 10) + '" rx="24" ry="12"/>' +
      '<ellipse cx="64" cy="' + (h + 14) + '" rx="15" ry="9"/>' +
      '<ellipse cx="282" cy="' + (h + 10) + '" rx="24" ry="12"/>' +
      '<ellipse cx="258" cy="' + (h + 14) + '" rx="15" ry="9"/></g>';
  }
  if (primitive === 'towers') {
    return '<g data-scene-primitive="towers" fill="' + ink + '" opacity="0.13">' +
      '<rect x="24" y="' + (h - 46) + '" width="26" height="52" rx="3"/>' +
      '<rect x="58" y="' + (h - 28) + '" width="18" height="34" rx="2"/>' +
      '<rect x="270" y="' + (h - 52) + '" width="24" height="58" rx="3"/></g>';
  }
  if (primitive === 'bubbles') {
    return '<g data-scene-primitive="bubbles" fill="none" stroke="' + ink + '" stroke-width="1.5" opacity="0.3">' +
      '<circle cx="52" cy="' + (h - 30) + '" r="9"/><circle cx="80" cy="' + (h - 52) + '" r="5"/>' +
      '<circle cx="270" cy="' + (h - 26) + '" r="11"/><circle cx="244" cy="' + (h - 50) + '" r="6"/></g>';
  }
  if (primitive === 'graph') {
    // On the mid layer, not the far layer: a scene that also has `standing`
    // would otherwise draw a grid *and* props at once (see the `science` scene).
    return '<g data-scene-primitive="graph" stroke="' + ink + '" stroke-width="1" opacity="0.1">' +
      '<path d="M40 ' + (h - 70) + 'v70M40 ' + (h - 70) + 'h240M280 ' + (h - 70) + 'v70"/>' +
      '<path d="M104 ' + h + 'v-70M168 ' + h + 'v-70M232 ' + h + 'v-70"/></g>';
  }
  return '';
}

/**
 * Props layer, copied from renderProps(). Drawn after the subject but kept
 * outside its 120px box (x 100..220) so the icon is never covered.
 */
function stagePropsSvg(primitive, palette) {
  const ink = escapeHtml(palette.ink);
  const glow = escapeHtml(palette.glow);
  const h = STAGE_ILLUSTRATION_HORIZON;
  if (primitive === 'books') {
    return '<g data-scene-primitive="books" opacity="0.55">' +
      '<rect x="42" y="' + (h + 4) + '" width="32" height="6" rx="1.5" fill="' + glow + '"/>' +
      '<rect x="46" y="' + (h + 11) + '" width="28" height="6" rx="1.5" fill="' + ink + '"/>' +
      '<rect x="44" y="' + (h + 18) + '" width="30" height="6" rx="1.5" fill="' + glow + '"/>' +
      '<rect x="246" y="' + (h + 6) + '" width="30" height="6" rx="1.5" fill="' + ink + '"/>' +
      '<rect x="242" y="' + (h + 13) + '" width="32" height="6" rx="1.5" fill="' + glow + '"/></g>';
  }
  if (primitive === 'flasks') {
    return '<g data-scene-primitive="flasks" fill="' + glow + '" opacity="0.3">' +
      '<path d="M55 ' + (h + 2) + 'h14l2 8H53z"/><path d="M250 ' + (h + 2) + 'h16l2 8h-20z"/></g>' +
      '<g data-scene-primitive="flasks-outline" fill="none" stroke="' + ink + '" stroke-width="2" opacity="0.5" stroke-linejoin="round">' +
      '<path d="M62 ' + (h - 18) + 'v10l-9 16h18l-9-16v-10z"/>' +
      '<path d="M258 ' + (h - 22) + 'v12l-10 18h20l-10-18v-12z"/></g>';
  }
  if (primitive === 'tools') {
    return '<g data-scene-primitive="tools" fill="none" stroke="' + ink + '" stroke-width="2" opacity="0.45">' +
      '<circle cx="62" cy="' + (h - 14) + '" r="9"/><circle cx="62" cy="' + (h - 14) + '" r="3.5"/>' +
      '<circle cx="256" cy="' + (h - 26) + '" r="11"/><circle cx="256" cy="' + (h - 26) + '" r="4"/></g>';
  }
  return '';
}

/**
 * Foreground layer, copied from renderFg(). It overlaps the subject's feet, so
 * the icon stands *in* the scene instead of floating above the ground band.
 */
function stageFgSvg(primitive, palette) {
  const ink = escapeHtml(palette.ink);
  const glow = escapeHtml(palette.glow);
  const foot = STAGE_ILLUSTRATION_HORIZON + 14;
  if (primitive === 'grass') {
    return '<g data-scene-primitive="grass" stroke="' + glow + '" stroke-width="2.4" stroke-linecap="round" opacity="0.55">' +
      '<path d="M108 ' + foot + 'v-9M116 ' + foot + 'v-13M124 ' + foot + 'v-7"/>' +
      '<path d="M196 ' + foot + 'v-7M204 ' + foot + 'v-13M212 ' + foot + 'v-9"/>' +
      '<path d="M40 ' + foot + 'v-8M48 ' + foot + 'v-12M56 ' + foot + 'v-6"/>' +
      '<path d="M266 ' + foot + 'v-6M274 ' + foot + 'v-12M282 ' + foot + 'v-8"/></g>';
  }
  if (primitive === 'stones') {
    return '<g data-scene-primitive="stones" fill="' + ink + '" opacity="0.26">' +
      '<path d="M84 ' + (foot - 2) + 'a9 6 0 0 1 18 0z"/><path d="M116 ' + (foot + 2) + 'a7 4 0 0 1 14 0z"/>' +
      '<path d="M190 ' + (foot + 2) + 'a8 5 0 0 1 16 0z"/><path d="M222 ' + (foot - 2) + 'a8 5 0 0 1 16 0z"/></g>';
  }
  if (primitive === 'roots') {
    // Kept as simple blades: a curled shape reads as a caterpillar at this size.
    return '<g data-scene-primitive="roots" fill="none" stroke="' + glow + '" stroke-width="2.2" stroke-linecap="round" opacity="0.5">' +
      '<path d="M92 ' + foot + 'q1-14 8-21M100 ' + foot + 'q-2-11 2-17M108 ' + foot + 'q3-10 10-14"/>' +
      '<path d="M228 ' + foot + 'q-1-14-8-21M220 ' + foot + 'q2-11-2-17M212 ' + foot + 'q-3-10-10-14"/></g>';
  }
  if (primitive === 'boards') {
    return '<g data-scene-primitive="boards" stroke="' + glow + '" stroke-width="2" fill="none" opacity="0.42" stroke-linejoin="round">' +
      '<path d="M88 ' + foot + 'l4-34h24l4 34"/>' +
      '<path d="M200 ' + foot + 'l4-38h26l4 38"/></g>' +
      '<g data-scene-primitive="boards-cleat" stroke="' + ink + '" stroke-width="1.6" opacity="0.28">' +
      '<path d="M92 ' + (foot - 19) + 'h28M204 ' + (foot - 21) + 'h32"/></g>';
  }
  if (primitive === 'waves') {
    return '<g data-scene-primitive="waves" fill="none" stroke="' + glow + '" stroke-width="2.6" opacity="0.45" stroke-linecap="round">' +
      '<path d="M0 ' + (foot + 8) + 'q22-12 44 0t44 0 44 0 44 0 44 0 44 0 44 0 44 0"/>' +
      '<path d="M0 ' + (foot + 24) + 'q22-12 44 0t44 0 44 0 44 0 44 0 44 0 44 0 44 0" opacity="0.6"/></g>';
  }
  return '';
}

/** One tagged layer; same `data-scene-layer` names as the shared composer. */
function stageLayer(name, content) {
  return content ? '<g data-scene-layer="' + name + '">' + content + '</g>' : '';
}


/**
 * The resolved illustration for one item, or null when nothing should be drawn.
 * Same rules as src/shared/illustration-registry.ts:
 *   off -> null; manual -> only an explicit illustration; auto -> explicit or
 *   the category default. Never throws.
 */
function resolveStageIllustration(item, game) {
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
 * Declared by the generated icon-data.ts, which loads first via index.html.
 * tsc compiles each file in isolation, so a global provided by a sibling
 * classic script must be declared here to stay type-checked.
 */
declare function getIconNode(name: unknown): ReadonlyArray<readonly [string, Readonly<Record<string, string>>]> | null;

/**
 * Renders an icon as an `<svg>` string from the generated icon data, or '' when
 * the id is unknown. Same attributes and 24x24 viewBox as `renderIconSvg` in
 * src/shared/icon-registry.ts; the renderer cannot import it, so the data is
 * generated at build time (scripts/build-icon-data.js) and cannot drift.
 */
function stageIconSvg(name, size, className) {
  const nodes = typeof getIconNode === 'function' ? getIconNode(name) : null;
  if (!Array.isArray(nodes) || !nodes.length) return '';
  const px = typeof size === 'number' && size > 0 ? Math.round(size) : 24;
  const body = nodes.map(function (node) {
    const tag = node[0];
    const attrs = node[1] || {};
    const rendered = Object.keys(attrs).map(function (key) {
      return key + '="' + String(attrs[key]).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') + '"';
    }).join(' ');
    return '<' + tag + ' ' + rendered + '/>';
  }).join('');
  const classes = 'lucide lucide-' + name + (className ? ' ' + className : '');
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + px + '" height="' + px + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="' + classes + '" aria-hidden="true" focusable="false">' + body + '</svg>';
}

/**
 * `<div class="stage-illustration">` markup, or '' when nothing should be
 * drawn. Always '' for `off`, so the sibling node simply disappears and the
 * question keeps the full column - no empty box, no layout shift.
 *
 * Layers match renderSceneSvg() in src/shared/illustration-scene.ts (#72):
 * sky -> far -> mid -> halo -> subject -> props -> fg.
 */
function stageIllustrationHtml(item, game, extraClass) {
  const resolved = resolveStageIllustration(item, game);
  if (!resolved) return '';
  if (resolved.custom) {
    // #124: the teacher's own picture, framed like a built-in scene so the layout does
    // not change between the two. `edugame-file:` is the only source CSP allows besides
    // `self`/`data:`; the protocol serves nothing outside the app's image folder.
    // `meet` (contain) not `slice`: an uploaded picture can be portrait, square or
    // panorama, and `slice` cropped it to the fixed 16:10 frame (a portrait photo lost
    // top and bottom). `meet` shows the whole picture, letterboxed on `.is-custom`.
    const cls = 'stage-illustration is-custom' + (extraClass ? ' ' + extraClass : '');
    const src = `edugame-file://img/${encodeURIComponent(resolved.assetId)}`;
    return `<div class="${cls}" data-illustration="${escapeHtml(resolved.assetId)}" aria-hidden="true">` +
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200" preserveAspectRatio="xMidYMid meet" class="stage-illustration-svg" aria-hidden="true" focusable="false">` +
      `<image href="${escapeHtml(src)}" x="0" y="0" width="320" height="200" preserveAspectRatio="xMidYMid meet"/>` +
      `</svg></div>`;
  }
  const icon = stageIconSvg(resolved.iconName, STAGE_ILLUSTRATION_SUBJECT_SIZE, 'stage-illustration-icon');
  if (!icon) return '';
  const palette = STAGE_ILLUSTRATION_PALETTES[resolved.category] || STAGE_ILLUSTRATION_DEFAULT_PALETTE;
  const spec = stageSceneSpec(resolved.category);
  const sky = palette.sky || palette.fill;
  const ground = palette.ground || palette.fill;
  const x = Math.round((320 - STAGE_ILLUSTRATION_SUBJECT_SIZE) / 2);
  const y = Math.round(spec.subjectY - STAGE_ILLUSTRATION_SUBJECT_SIZE / 2);
  const cls = 'stage-illustration' + (extraClass ? ' ' + extraClass : '');
  return `<div class="${cls}" data-illustration="${escapeHtml(resolved.assetId)}" aria-hidden="true">` +
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200" preserveAspectRatio="xMidYMid meet" class="stage-illustration-svg" aria-hidden="true" focusable="false">` +
    stageLayer('sky', `<rect x="0" y="0" width="320" height="200" rx="26" fill="${escapeHtml(palette.fill)}"/>` +
      `<rect x="0" y="0" width="320" height="200" rx="26" fill="${escapeHtml(sky)}"/>` +
      stageSkySvg(spec.sky, palette)) +
    stageLayer('far', stageFarSvg(spec.horizon, palette) +
      `<rect x="0" y="${STAGE_ILLUSTRATION_HORIZON}" width="320" height="${200 - STAGE_ILLUSTRATION_HORIZON}" fill="${escapeHtml(ground)}"/>`) +
    stageLayer('mid', stageMidSvg(spec.standing, palette)) +
    stageLayer('halo', `<circle cx="160" cy="${spec.subjectY}" r="72" fill="${escapeHtml(palette.glow)}" opacity="0.15"/>`) +
    stageLayer('subject', `<g transform="translate(${x} ${y})" color="${escapeHtml(palette.ink)}">${icon}</g>`) +
    stageLayer('props', stagePropsSvg(spec.standing, palette)) +
    stageLayer('fg', stageFgSvg(spec.fg, palette)) +
    `</svg></div>`;
}
