/* Scene composition for illustrations (docs/DECISIONS.md #70, #72).
 *
 * Before #70 an "illustration" was one 72px Lucide icon on a flat card: about
 * 5% of the 320x200 frame, which reads as a symbol, not as a picture. A child
 * shown a paw-print learns "paw-print", not "animals".
 *
 * This module turns that into a layered scene, still pure inline SVG with no
 * network, no fonts and no external references.
 *
 * #72 replaced the single backdrop motif with a real depth stack:
 *
 *   sky -> far -> mid -> halo -> subject -> props -> fg
 *
 * Each layer is assembled from a small set of deterministic primitives, so the
 * scene has foreground and background rather than one flat decoration. The
 * subject shrank 168 -> 120 to leave room for that environment; a 168px subject
 * left no space for anything to be *in front of* or *behind* it.
 *
 * Everything is deterministic: the same category always draws the same scene,
 * so a saved game looks identical forever and `.egame` files stay comparable.
 */
import { renderIconSvg } from './icon-registry';
import type { IllustrationPalette } from './illustration-registry';

/** Canvas the scenes are authored in; matches `renderIllustrationSvg`. */
export const SCENE_WIDTH = 320;
export const SCENE_HEIGHT = 200;
/**
 * Icon size used for the scene subject. 72 before #70, 168 in #70, **120** in
 * #72. The shrink is deliberate: at 168 the subject covered the frame, so no
 * environment could be drawn around it and every scene read as one big icon on
 * a coloured card. The subject is still the focal point (about 36% of the
 * height) but now stands *in* a place.
 */
export const SCENE_SUBJECT_SIZE = 120;
/** Horizon: the far layer sits above this, the ground band fills below it. */
export const SCENE_HORIZON = 150;

/**
 * The eight deterministic primitives a scene is assembled from (#72). Fixed
 * coordinates only — no randomness — so a saved game renders byte-identically
 * on every machine and in every reuse.
 */
export type ScenePrimitive =
  // sky layer
  | 'sun'
  | 'moon'
  | 'rays'
  | 'stars'
  | 'clouds'
  // far layer
  | 'hills'
  | 'mountains'
  | 'skyline'
  | 'sea'
  /** Bare horizon: a single soft line, for interior/abstract scenes. */
  | 'line'
  // mid layer
  | 'trees'
  | 'bushes'
  | 'towers'
  | 'bubbles'
  /**
   * Faint plotting frame. It lives on the mid layer, not the far layer, so a
   * scene that also has `standing` does not draw two things at once (the
   * `science` preview showed a grid *behind* the flasks, which read as noise).
   */
  | 'graph'
  // props layer (beside the subject, never on top of it)
  | 'books'
  | 'flasks'
  | 'tools'
  // foreground layer
  | 'grass'
  /** Small roots/leaf sprigs at the feet: a garden, not a lawn. */
  | 'roots'
  | 'stones'
  /** Angled easel/canvas boards. */
  | 'boards'
  | 'waves'
  | 'none';

export interface SceneSpec {
  /** Sky layer: what the scene sits under. */
  sky: ScenePrimitive;
  /** Far layer: the horizon shape. */
  horizon: ScenePrimitive;
  /** Mid layer: things standing on the ground. */
  standing: ScenePrimitive;
  /** Foreground layer: what overlaps the subject's feet. */
  fg: ScenePrimitive;
  /** Vertical position of the subject's centre. Grounded scenes sit higher. */
  subjectY: number;
}

/** Layer name used as `data-scene-layer`, in paint order. */
export const SCENE_LAYER_ORDER: readonly string[] = Object.freeze([
  'sky',
  'far',
  'mid',
  'halo',
  'subject',
  'props',
  'fg',
]);

/**
 * Category -> scene. Categories missing here fall back to `DEFAULT_SCENE`, so
 * adding a category to the palette table cannot leave the scenes behind.
 *
 * Judge each row by asking "could a child name the place from the layers
 * alone?" — the subject icon says *what*, the layers say *where*.
 *
 * `subjectY` is kept at or below 92 so the 120px subject ends above
 * SCENE_HORIZON (150) and only the foreground layer touches its feet. When the
 * subject straddled the horizon it read as "cut in half" — visible in the scene
 * preview but invisible to every string assertion.
 */
const SCENE_SPECS: Readonly<Record<string, SceneSpec>> = Object.freeze({
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
  'water-world': { sky: 'moon', horizon: 'sea', standing: 'none', fg: 'waves', subjectY: 84 },
});

const DEFAULT_SCENE: SceneSpec = Object.freeze({
  sky: 'clouds',
  horizon: 'hills',
  standing: 'none',
  fg: 'stones',
  subjectY: 88,
});

export function getSceneSpec(category: unknown): SceneSpec {
  return SCENE_SPECS[String(category)] || DEFAULT_SCENE;
}

function esc(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** `#123456` -> darker by scaling each channel; safe for any input. */
function darken(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(String(hex));
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const scale = (c: number) => Math.round(c * 0.62).toString(16).padStart(2, '0');
  return '#' + scale((n >> 16) & 255) + scale((n >> 8) & 255) + scale(n & 255);
}

/** Sky layer: what the scene sits under. Drawn first, so everything overlaps it. */
function renderSky(primitive: ScenePrimitive, palette: IllustrationPalette): string {
  const ink = esc(palette.ink);
  const glow = esc(palette.glow);
  switch (primitive) {
    case 'sun':
      return (
        `<g data-scene-primitive="sun">` +
        `<circle cx="268" cy="42" r="27" fill="${glow}" opacity="0.16"/>` +
        `<circle cx="268" cy="42" r="15" fill="${glow}" opacity="0.34"/>` +
        `</g>`
      );
    case 'moon':
      return (
        `<g data-scene-primitive="moon" fill="${ink}" opacity="0.5">` +
        `<path d="M276 26a20 20 0 1 0 14 34 24 24 0 0 1-14-34z"/>` +
        `</g>`
      );
    case 'rays':
      return (
        `<g data-scene-primitive="rays" stroke="${glow}" stroke-width="1.6" opacity="0.3" stroke-linecap="round">` +
        `<path d="M28 30l10 10M56 22l5 13M20 58l13 5"/>` +
        `<path d="M292 112l-10 10M264 120l-5 13M300 84l-13 5"/>` +
        `</g>`
      );
    case 'stars':
      return (
        `<g data-scene-primitive="stars" fill="${ink}" opacity="0.46">` +
        `<circle cx="42" cy="30" r="2.3"/><circle cx="86" cy="20" r="1.6"/><circle cx="132" cy="40" r="1.9"/>` +
        `<circle cx="188" cy="24" r="2.5"/><circle cx="246" cy="36" r="1.7"/><circle cx="286" cy="66" r="2.1"/>` +
        `<circle cx="30" cy="86" r="1.5"/><circle cx="122" cy="70" r="1.4"/><circle cx="268" cy="104" r="1.8"/>` +
        `</g>`
      );
    case 'clouds':
      return (
        `<g data-scene-primitive="clouds" fill="${ink}" opacity="0.08">` +
        `<ellipse cx="66" cy="44" rx="38" ry="16"/><ellipse cx="96" cy="38" rx="26" ry="18"/>` +
        `<ellipse cx="256" cy="58" rx="32" ry="13"/><ellipse cx="234" cy="53" rx="21" ry="15"/>` +
        `</g>`
      );
    default:
      return '';
  }
}

/**
 * Far layer: the horizon. Kept low-contrast so it reads as distance, never as
 * an object competing with the subject.
 */
function renderFar(primitive: ScenePrimitive, palette: IllustrationPalette): string {
  const ink = esc(palette.ink);
  const glow = esc(palette.glow);
  switch (primitive) {
    case 'hills':
      return (
        `<g data-scene-primitive="hills" fill="${glow}" opacity="0.14">` +
        `<path d="M-12 ${SCENE_HORIZON + 14}q58-52 118-6 28 22 64-14t162-16v80H-12z"/>` +
        `</g>`
      );
    case 'mountains':
      return (
        `<g data-scene-primitive="mountains" fill="${ink}" opacity="0.1">` +
        `<path d="M-10 ${SCENE_HORIZON + 6}L54 52l40 62 30-26 44 52z"/>` +
        `<path d="M168 ${SCENE_HORIZON + 6}L228 66l34 50 26-20 44 42z" opacity="0.75"/>` +
        `</g>`
      );
    case 'skyline':
      return (
        `<g data-scene-primitive="skyline" fill="${ink}" opacity="0.11">` +
        `<rect x="10" y="94" width="26" height="52" rx="2"/><rect x="42" y="72" width="20" height="74" rx="2"/>` +
        `<rect x="68" y="104" width="24" height="42" rx="2"/><rect x="230" y="98" width="22" height="48" rx="2"/>` +
        `<rect x="258" y="78" width="18" height="68" rx="2"/><rect x="282" y="108" width="26" height="38" rx="2"/>` +
        `</g>`
      );
    case 'sea':
      return (
        `<g data-scene-primitive="sea">` +
        `<rect x="0" y="${SCENE_HORIZON}" width="${SCENE_WIDTH}" height="${SCENE_HEIGHT - SCENE_HORIZON}" fill="${glow}" opacity="0.12"/>` +
        `<path d="M0 ${SCENE_HORIZON}h${SCENE_WIDTH}" stroke="${ink}" stroke-width="1.4" opacity="0.22"/>` +
        `</g>`
      );
    case 'line':
      // Bare horizon. Without it the subject has no ground plane and the whole
      // stack reads as a sticker floating on a gradient.
      return (
        `<g data-scene-primitive="line">` +
        `<path d="M0 ${SCENE_HORIZON}h${SCENE_WIDTH}" stroke="${ink}" stroke-width="1.2" opacity="0.16"/>` +
        `</g>`
      );
    default:
      return '';
  }
}

/**
 * Mid layer: things standing on the ground, behind the subject. Parked at the
 * frame edges so the centre stays clear for the icon.
 */
function renderMid(primitive: ScenePrimitive, palette: IllustrationPalette): string {
  const ink = esc(palette.ink);
  const glow = esc(palette.glow);
  switch (primitive) {
    case 'trees':
      return (
        `<g data-scene-primitive="trees" fill="${glow}" opacity="0.26">` +
        `<path d="M34 ${SCENE_HORIZON}l-15-30h30z"/><path d="M34 ${SCENE_HORIZON - 20}l-11-23h22z"/>` +
        `<rect x="32" y="${SCENE_HORIZON}" width="4" height="16"/>` +
        `<path d="M288 ${SCENE_HORIZON - 4}l-17-34h34z"/><path d="M288 ${SCENE_HORIZON - 26}l-12-26h24z"/>` +
        `<rect x="286" y="${SCENE_HORIZON - 4}" width="4" height="18"/>` +
        `</g>`
      );
    case 'bushes':
      // Low mounds sitting ON the ground band, not floating above it: when the
      // shape straddled the horizon the `plants`/`food` previews showed a
      // cloud-shaped blob hanging in mid-air.
      return (
        `<g data-scene-primitive="bushes" fill="${glow}" opacity="0.24">` +
        `<ellipse cx="40" cy="${SCENE_HORIZON + 10}" rx="24" ry="12"/>` +
        `<ellipse cx="64" cy="${SCENE_HORIZON + 14}" rx="15" ry="9"/>` +
        `<ellipse cx="282" cy="${SCENE_HORIZON + 10}" rx="24" ry="12"/>` +
        `<ellipse cx="258" cy="${SCENE_HORIZON + 14}" rx="15" ry="9"/>` +
        `</g>`
      );
    case 'towers':
      return (
        `<g data-scene-primitive="towers" fill="${ink}" opacity="0.13">` +
        `<rect x="24" y="${SCENE_HORIZON - 46}" width="26" height="52" rx="3"/>` +
        `<rect x="58" y="${SCENE_HORIZON - 28}" width="18" height="34" rx="2"/>` +
        `<rect x="270" y="${SCENE_HORIZON - 52}" width="24" height="58" rx="3"/>` +
        `</g>`
      );
    case 'bubbles':
      return (
        `<g data-scene-primitive="bubbles" fill="none" stroke="${ink}" stroke-width="1.5" opacity="0.3">` +
        `<circle cx="52" cy="${SCENE_HORIZON - 30}" r="9"/><circle cx="80" cy="${SCENE_HORIZON - 52}" r="5"/>` +
        `<circle cx="270" cy="${SCENE_HORIZON - 26}" r="11"/><circle cx="244" cy="${SCENE_HORIZON - 50}" r="6"/>` +
        `</g>`
      );
    case 'graph':
      // A faint plotting frame: "a screen / a notebook page" context without
      // drawing a second literal object that would repeat the subject icon.
      return (
        `<g data-scene-primitive="graph" stroke="${ink}" stroke-width="1" opacity="0.1">` +
        `<path d="M40 ${SCENE_HORIZON - 70}v70M40 ${SCENE_HORIZON - 70}h240M280 ${SCENE_HORIZON - 70}v70"/>` +
        `<path d="M104 ${SCENE_HORIZON}v-70M168 ${SCENE_HORIZON}v-70M232 ${SCENE_HORIZON}v-70"/>` +
        `</g>`
      );
    default:
      return '';
  }
}

/**
 * Props layer: small objects flanking the subject. Drawn AFTER the subject so
 * they read as "in front", but placed outside its 120px box (x 100..220) so
 * they never cover the icon a child is meant to recognise.
 */
function renderProps(primitive: ScenePrimitive, palette: IllustrationPalette): string {
  const ink = esc(palette.ink);
  const glow = esc(palette.glow);
  switch (primitive) {
    case 'books':
      // A small stack with a spine edge, so it reads as books and not as two
      // floating bars. Kept out of x 100..220 (the subject box).
      return (
        `<g data-scene-primitive="books" opacity="0.55">` +
        `<rect x="42" y="${SCENE_HORIZON + 4}" width="32" height="6" rx="1.5" fill="${glow}"/>` +
        `<rect x="46" y="${SCENE_HORIZON + 11}" width="28" height="6" rx="1.5" fill="${ink}"/>` +
        `<rect x="44" y="${SCENE_HORIZON + 18}" width="30" height="6" rx="1.5" fill="${glow}"/>` +
        `<rect x="246" y="${SCENE_HORIZON + 6}" width="30" height="6" rx="1.5" fill="${ink}"/>` +
        `<rect x="242" y="${SCENE_HORIZON + 13}" width="32" height="6" rx="1.5" fill="${glow}"/>` +
        `</g>`
      );
    case 'flasks':
      return (
        `<g data-scene-primitive="flasks" fill="${glow}" opacity="0.3">` +
        `<path d="M55 ${SCENE_HORIZON + 2}h14l2 8H53z"/><path d="M250 ${SCENE_HORIZON + 2}h16l2 8h-20z"/>` +
        `</g>` +
        `<g data-scene-primitive="flasks-outline" fill="none" stroke="${ink}" stroke-width="2" opacity="0.5" stroke-linejoin="round">` +
        `<path d="M62 ${SCENE_HORIZON - 18}v10l-9 16h18l-9-16v-10z"/>` +
        `<path d="M258 ${SCENE_HORIZON - 22}v12l-10 18h20l-10-18v-12z"/>` +
        `</g>`
      );
    case 'tools':
      // Generic cogs, not one trade's tool: the category spans safety, jobs and
      // technology, and the icon already says which job this is.
      return (
        `<g data-scene-primitive="tools" fill="none" stroke="${ink}" stroke-width="2" opacity="0.45">` +
        `<circle cx="62" cy="${SCENE_HORIZON - 14}" r="9"/><circle cx="62" cy="${SCENE_HORIZON - 14}" r="3.5"/>` +
        `<circle cx="256" cy="${SCENE_HORIZON - 26}" r="11"/><circle cx="256" cy="${SCENE_HORIZON - 26}" r="4"/>` +
        `</g>`
      );
    default:
      return '';
  }
}

/**
 * Foreground layer: overlaps the subject's feet so the icon is *standing* in the
 * scene instead of floating above the ground band. This layer is what makes the
 * stack read as depth rather than as a collage.
 */
function renderFg(primitive: ScenePrimitive, palette: IllustrationPalette): string {
  const ink = esc(palette.ink);
  const glow = esc(palette.glow);
  const foot = SCENE_HORIZON + 14;
  switch (primitive) {
    case 'grass':
      return (
        `<g data-scene-primitive="grass" stroke="${glow}" stroke-width="2.4" stroke-linecap="round" opacity="0.55">` +
        `<path d="M108 ${foot}v-9M116 ${foot}v-13M124 ${foot}v-7"/>` +
        `<path d="M196 ${foot}v-7M204 ${foot}v-13M212 ${foot}v-9"/>` +
        `<path d="M40 ${foot}v-8M48 ${foot}v-12M56 ${foot}v-6"/>` +
        `<path d="M266 ${foot}v-6M274 ${foot}v-12M282 ${foot}v-8"/>` +
        `</g>`
      );
    case 'stones':
      // Small rounded pebbles, not wide ellipses: at this scale a flat ellipse
      // reads as a smudge on the ground rather than an object. Their centres sit
      // at `foot`, so the whole shape is above the ground band — the first
      // version put the far pair ON the band and the `art`/`language` previews
      // showed them as a clipped grey bar at the bottom edge. They live inside
      // x 84..244, leaving the frame edges to the `props` layer.
      return (
        `<g data-scene-primitive="stones" fill="${ink}" opacity="0.26">` +
        `<path d="M84 ${foot - 2}a9 6 0 0 1 18 0z"/><path d="M116 ${foot + 2}a7 4 0 0 1 14 0z"/>` +
        `<path d="M190 ${foot + 2}a8 5 0 0 1 16 0z"/><path d="M222 ${foot - 2}a8 5 0 0 1 16 0z"/>` +
        `</g>`
      );
    case 'roots':
      // A few blades curling outward at the feet: enough to say "a garden", and
      // simple enough to survive a 320px render (the first version curled back on
      // itself and read as a caterpillar). Inside x 84..244, clear of `props`.
      return (
        `<g data-scene-primitive="roots" fill="none" stroke="${glow}" stroke-width="2.2" stroke-linecap="round" opacity="0.5">` +
        `<path d="M92 ${foot}q1-14 8-21M100 ${foot}q-2-11 2-17M108 ${foot}q3-10 10-14"/>` +
        `<path d="M228 ${foot}q-1-14-8-21M220 ${foot}q2-11-2-17M212 ${foot}q-3-10-10-14"/>` +
        `</g>`
      );
    case 'boards':
      // Two boards standing at an angle, the way an easel's canvases lean. The
      // `art` preview showed flat bars in this spot, which read as a clipped
      // UI element rather than as a place. Inside x 88..234 so they never cover
      // the book props at the frame edges.
      return (
        `<g data-scene-primitive="boards" stroke="${glow}" stroke-width="2" fill="none" opacity="0.42" stroke-linejoin="round">` +
        `<path d="M88 ${foot}l4-34h24l4 34"/>` +
        `<path d="M200 ${foot}l4-38h26l4 38"/>` +
        `</g>` +
        `<g data-scene-primitive="boards-cleat" stroke="${ink}" stroke-width="1.6" opacity="0.28">` +
        `<path d="M92 ${foot - 19}h28M204 ${foot - 21}h32"/>` +
        `</g>`
      );
    case 'waves':
      return (
        `<g data-scene-primitive="waves" fill="none" stroke="${glow}" stroke-width="2.6" opacity="0.45" stroke-linecap="round">` +
        `<path d="M0 ${foot + 8}q22-12 44 0t44 0 44 0 44 0 44 0 44 0 44 0 44 0"/>` +
        `<path d="M0 ${foot + 24}q22-12 44 0t44 0 44 0 44 0 44 0 44 0 44 0 44 0" opacity="0.6"/>` +
        `</g>`
      );
    default:
      return '';
  }
}

/** One layer, tagged so a reviewer (and the tests) can see the stack explicitly. */
function layer(name: string, content: string): string {
  return content ? `<g data-scene-layer="${name}">${content}</g>` : '';
}




export interface SceneSvgOptions {
  /** Accessible label; when absent the svg is `aria-hidden`. */
  label?: string;
  /** `data-illustration` value. */
  assetId?: string;
  /** Root `class` attribute. */
  className?: string;
}

/**
 * Full `<svg>` scene for one category, or '' when the subject icon is unknown.
 * Pure function of (category, iconName, palette): identical output every call.
 */
export function renderSceneSvg(
  category: string,
  iconName: string,
  palette: IllustrationPalette,
  options: SceneSvgOptions = {}
): string {
  const spec = getSceneSpec(category);
  const subject = renderIconSvg(iconName, { size: SCENE_SUBJECT_SIZE, className: 'stage-illustration-icon' });
  if (!subject) return '';

  const x = Math.round((SCENE_WIDTH - SCENE_SUBJECT_SIZE) / 2);
  const y = Math.round(spec.subjectY - SCENE_SUBJECT_SIZE / 2);
  const sky = palette.sky || palette.fill;
  const ground = palette.ground || darken(palette.fill);

  const attrs: string[] = [];
  if (options.assetId) attrs.push(`data-illustration="${esc(options.assetId)}"`);
  attrs.push(options.label ? `role="img" aria-label="${esc(options.label)}"` : 'aria-hidden="true"');
  const cls = options.className ? ` class="${esc(options.className)}"` : '';

  // Paint order is the whole point of #72: sky behind, foreground in front.
  // The subject sits between halo and props, so the subject is *in* the scene.
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SCENE_WIDTH} ${SCENE_HEIGHT}" ` +
    `preserveAspectRatio="xMidYMid meet"${cls} ${attrs.join(' ')} focusable="false">` +
    layer('sky',
      // Frame fills first so rounded corners are covered on every palette.
      `<rect x="0" y="0" width="${SCENE_WIDTH}" height="${SCENE_HEIGHT}" rx="26" fill="${esc(palette.fill)}"/>` +
      `<rect x="0" y="0" width="${SCENE_WIDTH}" height="${SCENE_HEIGHT}" rx="26" fill="${esc(sky)}"/>` +
      renderSky(spec.sky, palette)
    ) +
    layer('far',
      renderFar(spec.horizon, palette) +
      `<rect x="0" y="${SCENE_HORIZON}" width="${SCENE_WIDTH}" height="${SCENE_HEIGHT - SCENE_HORIZON}" fill="${esc(ground)}"/>`
    ) +
    layer('mid', renderMid(spec.standing, palette)) +
    layer('halo', `<circle cx="${SCENE_WIDTH / 2}" cy="${spec.subjectY}" r="72" fill="${esc(palette.glow)}" opacity="0.15"/>`) +
    layer('subject', `<g transform="translate(${x} ${y})" color="${esc(palette.ink)}">${subject}</g>`) +
    layer('props', renderProps(spec.standing, palette)) +
    layer('fg', renderFg(spec.fg, palette)) +
    `</svg>`
  );
}
