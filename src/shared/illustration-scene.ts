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
 *   sky -> far -> mid -> subject -> props -> fg
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
import type { SceneBlueprint, SceneSubIcon } from './scene-blueprint';
import { SCENE_EXTRA_SIZE, SCENE_MAX_EXTRAS, SCENE_MAX_PROPS, SCENE_MAX_SUB_ICONS, getBackdropSpec, type SceneCompareSign, type SceneSubIconPosition } from './scene-asset-catalog';

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
/** Supporting icons beside the subject; outside its 120px box (x 100..220). */
export const SCENE_SUB_ICON_SIZE = 52;
/** Ground props are smaller: set dressing, not a second subject (#259). */
export const SCENE_GROUND_PROP_SIZE = 40;
/** Horizon: the far layer sits above this, the ground band fills below it. */
export const SCENE_HORIZON = 150;

/* Ground contact (#277).
 *
 * A pale scene with no shadow reads as STICKERS ON PAPER: nothing sits on the
 * ground, so the eye cannot tell which object is nearer. One soft ellipse per
 * standing thing is the cheapest way to buy depth without a single new asset —
 * it is the one trick the hand-drawn reference uses on every object (car,
 * plant) and that this engine had nowhere.
 *
 * Every shadow is the palette INK at 10%, never black: the scenes are light by
 * decision #220, so a dark smudge would be the one dirty mark on the card.
 */
export const SCENE_SHADOW_OPACITY = 0.12;
/**
 * Shadow width as a fraction of the object's box.
 *
 * 0.34 rendered as a 246px-wide pale puddle under a 120px subject once the card
 * is scaled up (vision check on the real PNG called it "a flat puddle whose
 * lower edge crosses the ground line"). 0.24 tucks it under the feet.
 */
export const SCENE_SHADOW_WIDTH_RATIO = 0.24;
/** Shadow height as a fraction of its own width: a squashed ellipse, not a ball. */
export const SCENE_SHADOW_HEIGHT_RATIO = 0.22;
/** The surround subject's fixed top edge (#270); the shadow needs it too. */
export const SCENE_SURROUND_SUBJECT_TOP = 52;

/* Compare layout (#262): two subjects plus a sign between them.
 *
 * The 320x200 frame cannot hold two 120px subjects and the four corner icons
 * from #256: a 92px subject starting at x 42 would sit under the `top-left`
 * slot. So compare mode owns its own geometry instead of guessing:
 *
 *   y  6..46   the two corner icons (40px)  - the only spots left in compare
 *   y 50..146  subject band, subjects are LIFTED 12px to make that true
 *   y 148..176 the sign, in the 52px gap between the two subject boxes
 *   y146..186  ground props (#259), unchanged, just clear of the subject band
 */
export const SCENE_COMPARE_SUBJECT_SIZE = 92;
/** Subjects sit 12px lower so the corner band above them stays free. */
export const SCENE_COMPARE_SUBJECT_LIFT = 12;
export const SCENE_COMPARE_SUB_ICON_SIZE = 40;
export const SCENE_COMPARE_SIGN_SIZE = 24;
/** Left/right edges of the two subject boxes (92px wide, centered on 88 / 232). */
export const SCENE_COMPARE_SUBJECT_X = Object.freeze({ left: 42, right: 186 });
/** Only two corners survive compare mode; they hug the frame's top edge. */
export const SCENE_COMPARE_SUB_ICON_SLOTS: Readonly<
  Partial<Record<SceneSubIconPosition, { x: number; y: number }>>
> = Object.freeze({
  'top-left': { x: 12, y: 6 },
  'top-right': { x: SCENE_WIDTH - 12 - SCENE_COMPARE_SUB_ICON_SIZE, y: 6 },
});

/* Process layout (#267): a left-to-right sequence of two or three stages.
 *
 * Measured, not guessed. The frame is 320x200 and the ground band starts at
 * SCENE_HORIZON - 4 (the props sit at y 146..186), so the stage row has
 * y 66..142 to work with: 76px stages, which still read as "things", not dots.
 *
 *   n = 2:   x 48..124   x 196..272   arrow centred at 160
 *   n = 3:   x 16..92   x 122..198   x 228..304   arrows at 100 and 206
 *   y  6..46   the two corner icons (40px), same band as compare
 *   y 66..142  the stage row, bottom-aligned just above the ground props
 *   y146..186  ground props (#259), unchanged
 *
 * The left/right corner slots would sit exactly on stage 1 and stage 3, which is
 * why `process` only keeps the two upper corners (SCENE_PROCESS_SUB_ICON_POSITIONS).
 */
export const SCENE_PROCESS_STEP_SIZE = 76;
export const SCENE_PROCESS_STEP_TOP = 66;
export const SCENE_PROCESS_ARROW_WIDTH = 14;
/** Left edge of each stage box, per stage count. */
export const SCENE_PROCESS_STEP_X: Readonly<Record<number, readonly number[]>> = Object.freeze({
  2: Object.freeze([48, 196]),
  3: Object.freeze([16, 122, 228]),
});

/* Surround layout (#270): one subject in the middle, up to four things around it.
 *
 * Measured against the props band (y 146..186) and the frame edges:
 *
 *   subject   88px, centred: x 116..204, y 52..140
 *   ring      48px at (28,10) (244,10) (244,96) (28,96)
 *
 * The left/right ring slots sit below the subject's waist and stop 2px short of
 * the ground props; the upper slots clear the subject's head by 4px. There is no
 * corner left for a sub-icon, which is why `surround` refuses them (#270).
 */
export const SCENE_SURROUND_SUBJECT_SIZE = 88;
export const SCENE_SURROUND_ICON_SIZE = 48;
/** Left/top of each ring slot, clockwise from the top-left corner. */
export const SCENE_SURROUND_SLOT_PX: Readonly<Record<string, { x: number; y: number }>> = Object.freeze({
  'top-left': Object.freeze({ x: 28, y: 10 }),
  'top-right': Object.freeze({ x: SCENE_WIDTH - 28 - SCENE_SURROUND_ICON_SIZE, y: 10 }),
  'bottom-right': Object.freeze({ x: SCENE_WIDTH - 28 - SCENE_SURROUND_ICON_SIZE, y: 96 }),
  'bottom-left': Object.freeze({ x: 28, y: 96 }),
});

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
  /**
   * #288: the GROUND IS THE SPACE. A road surface, lane markings and the far end
   * of the street, so a traffic question is asked *on a road* instead of on a
   * lawn with a skyline behind it.
   */
  | 'road'
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
  /** #288 street furniture: a traffic light, a round road sign, a lamp post. */
  | 'traffic-light'
  | 'sign'
  | 'streetlight'
  /**
   * #290 interiors: the furniture that makes a room a room — a board on the wall,
   * pupil desks, a bookcase, a lab bench, a shop counter. Same rule as #288: the
   * layers must say *where*, and a bare horizon does not say "classroom".
   */
  | 'blackboard'
  | 'desks'
  | 'shelves'
  | 'labbench'
  | 'counter'
  /**
   * #293 the street outside a shop, and the water beside a pier. `city` was a
   * skyline plus bushes and `sea` was waves plus bubbles: neither said *where*
   * the question happens, which is the whole point of a backdrop (#288).
   */
  | 'awning'
  | 'car'
  | 'boat'
  | 'pier'
  // foreground layer
  | 'grass'
  /** Small roots/leaf sprigs at the feet: a garden, not a lawn. */
  | 'roots'
  | 'stones'
  /** Angled easel/canvas boards. */
  | 'boards'
  | 'waves'
  /** #288 road surface markings, painted in front of the subject's feet. */
  | 'zebra'
  | 'kerb'
  /**
   * #291 the back wall of a room, plus a skirting board. Interiors were flat pale
   * washes because everything in them was pastel over pastel; a wall with a
   * darker base gives the furniture something to stand against.
   */
  | 'wall'
  /** #290 interior foreground: a rack of test tubes, a shopping basket. */
  | 'rack'
  | 'basket'
  | 'none';

/**
 * A layer may hold one primitive or several. Stacking is why a scene stopped
 * reading as "one icon on a card": `sky: ['sun','clouds']` draws both, and
 * `standing: ['trees','bushes']` gives the middle distance depth. Before this
 * each layer held exactly one primitive, so a richer backdrop was impossible
 * without adding a new primitive kind.
 */
export type SceneLayerPrimitives = ScenePrimitive | readonly ScenePrimitive[];

export interface SceneSpec {
  /** Sky layer: what the scene sits under. */
  sky: SceneLayerPrimitives;
  /** Far layer: the horizon shape. */
  horizon: SceneLayerPrimitives;
  /** Mid layer: things standing on the ground. */
  standing: SceneLayerPrimitives;
  /** Foreground layer: what overlaps the subject's feet. */
  fg: SceneLayerPrimitives;
  /** Vertical position of the subject's centre. Grounded scenes sit higher. */
  subjectY: number;
}

/** Layer name used as `data-scene-layer`, in paint order. */
export const SCENE_LAYER_ORDER: readonly string[] = Object.freeze([
  'sky',
  'far',
  'mid',
  'subject',
  'props',
  'fg',
]);

/* Soft ground edge (#279).
 *
 * The ground used to start on a dead-straight line at SCENE_HORIZON: a 320px
 * horizontal cut, which is the strongest "this is a sticker sheet" cue left in
 * the frame. It is now a shallow rise/dip that never goes BELOW the horizon, so
 * the `line` primitive's straight horizon stroke can never leave a sliver of sky
 * between itself and the ground, and every prop anchored to SCENE_HORIZON still
 * lands on ground.
 */
export const SCENE_GROUND_RISE = 3;

/**
 * A second, darker curve at the bottom of the ground band. Two flat fills
 * stacked (sky band / ground band) is what makes a scene read as paper cut-outs;
 * one soft shade behind the foreground props is enough to say "the ground comes
 * toward the viewer".
 */
export function sceneGroundShadePath(): string {
  return `M0 178 C40 174 80 179 120 176 S200 178 240 175 S300 179 320 177 V${SCENE_HEIGHT} H0 Z`;
}

/** The ground plane from SCENE_HORIZON to the bottom edge, as a shallow curve. */
export function sceneGroundPath(): string {
  const h = SCENE_HORIZON;
  const r = SCENE_GROUND_RISE;
  return (
    `M0 ${h} C40 ${h - r} 80 ${h} 120 ${h - r + 1} S200 ${h} 240 ${h - r} S300 ${h} 320 ${h}` +
    ` V${SCENE_HEIGHT} H0 Z`
  );
}

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
  animals: { sky: ['sun', 'clouds'], horizon: 'hills', standing: ['trees', 'bushes'], fg: ['grass', 'stones'], subjectY: 88 },
  plants: { sky: ['sun', 'clouds'], horizon: 'hills', standing: ['bushes', 'trees'], fg: ['roots', 'grass'], subjectY: 88 },
  space: { sky: ['stars', 'moon'], horizon: 'mountains', standing: ['bubbles'], fg: ['stones'], subjectY: 84 },
  'human-body': { sky: ['wall', 'rays', 'clouds'], horizon: 'line', standing: ['blackboard', 'desks'], fg: ['stones'], subjectY: 84 },
  transport: { sky: ['clouds', 'sun'], horizon: 'skyline', standing: ['road', 'traffic-light', 'streetlight'], fg: ['zebra', 'kerb'], subjectY: 88 },
  safety: { sky: ['sun', 'clouds'], horizon: 'skyline', standing: ['road', 'traffic-light', 'sign'], fg: ['zebra', 'kerb'], subjectY: 88 },
  environment: { sky: ['clouds', 'sun'], horizon: ['mountains', 'hills'], standing: ['trees', 'bushes'], fg: ['grass', 'stones'], subjectY: 88 },
  history: { sky: ['sun', 'clouds'], horizon: ['mountains', 'hills'], standing: ['books', 'towers'], fg: ['stones'], subjectY: 88 },
  geography: { sky: ['clouds', 'sun'], horizon: ['mountains', 'hills'], standing: ['trees', 'bushes'], fg: ['grass', 'stones'], subjectY: 88 },
  jobs: { sky: ['clouds', 'sun'], horizon: 'skyline', standing: ['towers', 'awning', 'car'], fg: ['kerb', 'stones'], subjectY: 88 },
  sports: { sky: ['sun', 'clouds'], horizon: 'hills', standing: ['bushes'], fg: ['grass', 'stones'], subjectY: 88 },
  music: { sky: ['rays', 'clouds'], horizon: 'line', standing: 'none', fg: ['stones', 'boards'], subjectY: 84 },
  art: { sky: ['rays', 'clouds'], horizon: 'line', standing: ['books'], fg: ['boards'], subjectY: 86 },
  math: { sky: ['wall', 'rays', 'clouds'], horizon: 'line', standing: ['blackboard', 'desks', 'shelves'], fg: ['stones'], subjectY: 86 },
  language: { sky: ['wall', 'rays', 'clouds'], horizon: 'line', standing: ['blackboard', 'desks', 'shelves'], fg: ['stones'], subjectY: 86 },
  science: { sky: ['wall', 'rays', 'clouds'], horizon: 'line', standing: ['blackboard', 'labbench'], fg: ['rack'], subjectY: 86 },
  technology: { sky: ['wall', 'rays', 'clouds'], horizon: 'line', standing: ['blackboard', 'labbench'], fg: ['rack'], subjectY: 86 },
  health: { sky: ['wall', 'rays', 'clouds'], horizon: 'line', standing: ['blackboard', 'desks'], fg: ['grass', 'stones'], subjectY: 86 },
  family: { sky: ['sun', 'clouds'], horizon: 'skyline', standing: ['trees', 'bushes'], fg: ['grass', 'stones'], subjectY: 88 },
  community: { sky: ['clouds', 'sun'], horizon: 'skyline', standing: ['towers', 'awning', 'car'], fg: ['kerb', 'stones'], subjectY: 88 },
  weather: { sky: 'clouds', horizon: 'hills', standing: ['bushes', 'trees'], fg: ['grass', 'stones'], subjectY: 86 },
  food: { sky: ['wall', 'rays', 'clouds'], horizon: 'line', standing: ['shelves', 'counter'], fg: ['basket'], subjectY: 86 },
  objects: { sky: ['clouds', 'sun'], horizon: 'line', standing: ['books', 'tools'], fg: ['stones'], subjectY: 86 },
  'water-world': { sky: ['sun', 'clouds'], horizon: 'sea', standing: ['boat', 'pier'], fg: ['waves'], subjectY: 86 },
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
/** One value or a stack, normalised to a list the renderers can loop over. */
function primitivesOf(value: SceneLayerPrimitives): readonly ScenePrimitive[] {
  return Array.isArray(value) ? (value as readonly ScenePrimitive[]) : [value as ScenePrimitive];
}

function renderSky(primitive: ScenePrimitive, palette: IllustrationPalette): string {
  const ink = esc(palette.ink);
  const glow = esc(palette.glow);
  // #278: the palette's second and third hue. Both fall back to the two hues a
  // pre-#278 caller can pass (glow/ink), so an old palette object still renders.
  const warm = esc(palette.warm || palette.glow);
  const cool = esc(palette.cool || palette.ink);
  switch (primitive) {
    case 'sun':
      return (
        `<g data-scene-primitive="sun">` +
        `<circle cx="268" cy="42" r="27" fill="${warm}" opacity="0.2"/>` +
        `<circle cx="268" cy="42" r="15" fill="${warm}" opacity="0.42"/>` +
        `</g>`
      );
    case 'moon':
      return (
        `<g data-scene-primitive="moon" fill="${ink}" opacity="0.5">` +
        `<path d="M276 26a20 20 0 1 0 14 34 24 24 0 0 1-14-34z"/>` +
        `</g>`
      );
    case 'wall':
      // (#291) Painted FIRST, under the light rays. The skirting band is the part
      // that buys contrast: it separates the wall from the floor at the horizon,
      // which is exactly where a pale interior used to melt into one wash.
      return (
        `<g data-scene-primitive="wall">` +
        `<rect x="0" y="0" width="${SCENE_WIDTH}" height="${SCENE_HORIZON}" fill="${cool}" opacity="0.26"/>` +
        `<rect x="0" y="${SCENE_HORIZON - 18}" width="${SCENE_WIDTH}" height="18" fill="${cool}" opacity="0.5"/>` +
        `<path d="M0 ${SCENE_HORIZON - 18}h${SCENE_WIDTH}" stroke="${ink}" stroke-width="1.2" opacity="0.22"/>` +
        `<path d="M0 ${SCENE_HORIZON - 0.7}h${SCENE_WIDTH}" stroke="${ink}" stroke-width="1.6" opacity="0.4"/>` +
        `<g stroke="${ink}" stroke-width="1" opacity="0.12">` +
        `<path d="M104 0v${SCENE_HORIZON - 18}"/><path d="M216 0v${SCENE_HORIZON - 18}"/>` +
        `</g></g>`
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
        `<g data-scene-primitive="clouds" fill="${cool}" opacity="0.16">` +
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
  const warm = esc(palette.warm || palette.glow);
  const cool = esc(palette.cool || palette.ink);
  switch (primitive) {
    case 'hills':
      return (
        `<g data-scene-primitive="hills" fill="${glow}" opacity="0.2">` +
        `<path d="M-12 ${SCENE_HORIZON + 14}q58-52 118-6 28 22 64-14t162-16v80H-12z"/>` +
        `</g>`
      );
    case 'mountains':
      return (
        `<g data-scene-primitive="mountains" fill="${cool}" opacity="0.24">` +
        `<path d="M-10 ${SCENE_HORIZON + 6}L54 52l40 62 30-26 44 52z"/>` +
        `<path d="M168 ${SCENE_HORIZON + 6}L228 66l34 50 26-20 44 42z" opacity="0.75"/>` +
        `</g>`
      );
    case 'skyline':
      return (
        `<g data-scene-primitive="skyline" fill="${cool}" opacity="0.26">` +
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
  const warm = esc(palette.warm || palette.glow);
  const cool = esc(palette.cool || palette.ink);
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
        `<g data-scene-primitive="towers" fill="${cool}" opacity="0.18">` +
        `<rect x="24" y="${SCENE_HORIZON - 46}" width="26" height="52" rx="3"/>` +
        `<rect x="58" y="${SCENE_HORIZON - 28}" width="18" height="34" rx="2"/>` +
        `<rect x="270" y="${SCENE_HORIZON - 52}" width="24" height="58" rx="3"/>` +
        `</g>`
      );
    case 'road':
      // (#288) Asphalt fills the whole ground band, so the scene reads as a road
      // and not as grass with a grey stripe. It is a MID-layer primitive, not a
      // far-layer one: the far layer is followed by the opaque ground fill, which
      // painted over every mark and left the road invisible until a render check
      // caught it. The lane dashes grow toward the
      // viewer (2.6 -> 4.4 px) which is what makes the surface look like it is
      // coming forward instead of lying flat like a wall.
      return (
        `<g data-scene-primitive="road">` +
        `<path d="M0 ${SCENE_HORIZON}h${SCENE_WIDTH}v${SCENE_HEIGHT - SCENE_HORIZON}H0z" fill="${cool}" opacity="0.22"/>` +
        `<path d="M0 ${SCENE_HORIZON}h${SCENE_WIDTH}" stroke="${ink}" stroke-width="1.4" opacity="0.24"/>` +
        // Lane dashes sit in the MIDDLE DISTANCE and grow toward the viewer, and
        // the road edges run down the sides. Two review rounds taught this: dashes
        // at y 188 disappeared under the kerb, then dashes at y 157..184 were
        // covered by the zebra that the fg layer paints on top. A crossing is near
        // the viewer and the centre line is further away — so the dashes belong
        // just under the horizon and the crossing must not reach them.
        `<g fill="#ffffff" opacity="0.72">` +
        `<rect x="155" y="153" width="10" height="1.8" rx="0.9"/>` +
        `<rect x="151" y="158" width="15" height="2.4" rx="1"/>` +
        `<rect x="145" y="164" width="22" height="3" rx="1.2"/>` +
        `<rect x="16" y="166" width="4" height="20" rx="2"/>` +
        `<rect x="300" y="166" width="4" height="20" rx="2"/>` +
        `</g></g>`
      );
    case 'traffic-light':
      // (#288) Post + three lamps; only the top one is lit, because a traffic
      // light showing every lamp at once is the thing children are taught to
      // read as "broken". Left edge, so the subject keeps the centre.
      return (
        `<g data-scene-primitive="traffic-light">` +
        `<rect x="25" y="86" width="4" height="${SCENE_HORIZON - 86}" rx="1.6" fill="${ink}" opacity="0.35"/>` +
        `<rect x="15" y="44" width="24" height="44" rx="5" fill="${ink}" opacity="0.28"/>` +
        `<circle cx="27" cy="54" r="5" fill="${warm}" opacity="0.95"/>` +
        `<circle cx="27" cy="66" r="5" fill="${ink}" opacity="0.16"/>` +
        `<circle cx="27" cy="78" r="5" fill="${ink}" opacity="0.16"/>` +
        `</g>`
      );
    case 'sign':
      // (#288) A round prohibitory sign on a post, right edge. The ring is the
      // warm hue and the face is a white disc: no glyph, no text.
      return (
        `<g data-scene-primitive="sign">` +
        `<rect x="293" y="106" width="4" height="${SCENE_HORIZON - 106}" rx="1.6" fill="${ink}" opacity="0.35"/>` +
        `<circle cx="295" cy="94" r="14" fill="#ffffff" opacity="0.92"/>` +
        `<circle cx="295" cy="94" r="12" fill="none" stroke="${warm}" stroke-width="4"/>` +
        `<rect x="287" y="92.4" width="16" height="3.4" rx="1.7" fill="${ink}" opacity="0.55"/>` +
        `</g>`
      );
    case 'streetlight':
      // (#288) A lamp on an arm, at the left edge behind the traffic light post.
      return (
        `<g data-scene-primitive="streetlight">` +
        `<g fill="${ink}" opacity="0.3">` +
        `<rect x="58" y="52" width="3.6" height="${SCENE_HORIZON - 52}" rx="1.6"/>` +
        `<path d="M60 52h20v3.4H60z"/>` +
        `</g>` +
        `<circle cx="79" cy="55" r="4.2" fill="${warm}" opacity="0.8"/>` +
        `</g>`
      );
    case 'awning':
      // (#293) A striped shop awning on the left edge with a shop window under
      // it. Stripes are two flat fills in palette hues — never blended.
      return (
        `<g data-scene-primitive="awning">` +
        `<rect x="10" y="86" width="76" height="52" rx="3" fill="${cool}" opacity="0.45"/>` +
        `<rect x="16" y="92" width="64" height="40" rx="2" fill="${ink}" opacity="0.28"/>` +
        `<path d="M8 86h80l-6-18H14z" fill="${warm}" opacity="0.9"/>` +
        `<g fill="#ffffff" opacity="0.55">` +
        `<path d="M22 68h10l-4 18H18z"/><path d="M44 68h10l-2 18H40z"/><path d="M66 68h10l0 18H64z"/>` +
        `</g></g>`
      );
    case 'car':
      // (#293) A car parked at the right kerb: body, two windows, two wheels.
      return (
        `<g data-scene-primitive="car">` +
        `<path d="M244 138h48l-4-14h-12l-5-9h-16l-6 9h-5z" fill="${cool}" opacity="0.85"/>` +
        `<path d="M256 124h7l4 8h-11zM267 124h9l3 8h-12z" fill="#ffffff" opacity="0.6"/>` +
        `<circle cx="254" cy="139" r="4.6" fill="${ink}" opacity="0.85"/>` +
        `<circle cx="284" cy="139" r="4.6" fill="${ink}" opacity="0.85"/>` +
        `<rect x="246" y="128" width="4" height="3" rx="1.5" fill="${warm}" opacity="0.9"/>` +
        `</g>`
      );
    case 'boat':
      // (#293) A small sailboat on the water, right of centre. The hull sits ON
      // the sea line, so the scene keeps its horizon.
      return (
        `<g data-scene-primitive="boat">` +
        `<path d="M246 ${SCENE_HORIZON - 8}h56l-10 14h-36z" fill="${cool}" opacity="0.85"/>` +
        `<path d="M273 ${SCENE_HORIZON - 46}v38" stroke="${ink}" stroke-width="2.4" opacity="0.7"/>` +
        `<path d="M275 ${SCENE_HORIZON - 44}l20 34h-20z" fill="#ffffff" opacity="0.85"/>` +
        `<path d="M271 ${SCENE_HORIZON - 40}l-16 30h16z" fill="${warm}" opacity="0.75"/>` +
        `</g>`
      );
    case 'pier':
      // (#293) A wooden jetty running out from the left edge: deck, posts, and
      // rails. Planks are one fill plus one darker stripe, not a pattern.
      return (
        `<g data-scene-primitive="pier">` +
        `<path d="M6 ${SCENE_HORIZON + 4}h104v7H6z" fill="${warm}" opacity="0.85"/>` +
        `<g fill="${ink}" opacity="0.6">` +
        `<rect x="14" y="${SCENE_HORIZON + 11}" width="5" height="22" rx="2"/>` +
        `<rect x="62" y="${SCENE_HORIZON + 11}" width="5" height="22" rx="2"/>` +
        `<rect x="104" y="${SCENE_HORIZON + 11}" width="5" height="22" rx="2"/>` +
        `</g>` +
        `<g stroke="${ink}" stroke-width="1.2" opacity="0.3"><path d="M14 ${SCENE_HORIZON + 6}h96"/></g>` +
        `</g>`
      );
    case 'blackboard':
      // (#290) The back wall of a classroom. It sits BEHIND the subject and is
      // deliberately faint: a board at full contrast would compete with the one
      // shape a child has to recognise. The two "chalk" strokes are decoration,
      // never text.
      return (
        `<g data-scene-primitive="blackboard">` +
        `<rect x="40" y="32" width="240" height="66" rx="7" fill="${ink}" opacity="0.5"/>` +
        `<rect x="48" y="40" width="224" height="50" rx="4" fill="${ink}" opacity="0.36"/>` +
        `<g stroke="#ffffff" stroke-width="2.6" stroke-linecap="round" opacity="0.82">` +
        `<path d="M62 58h86"/><path d="M62 70h58"/><path d="M206 62h44"/>` +
        `</g></g>`
      );
    case 'desks':
      // (#290) Two pupil desks in the row beside the subject, at the frame edges
      // so the centre stays clear. Legs reach the horizon, tops are at y 118.
      return (
        `<g data-scene-primitive="desks">` +
        `<g fill="${ink}" opacity="0.9">` +
        `<rect x="14" y="118" width="66" height="7" rx="2.5"/>` +
        `<rect x="20" y="125" width="5" height="27" rx="1.5" fill="${ink}" opacity="0.62"/>` +
        `<rect x="69" y="125" width="5" height="27" rx="1.5" fill="${ink}" opacity="0.62"/>` +
        `<rect x="240" y="118" width="66" height="7" rx="2.5" fill="${ink}" opacity="0.9"/>` +
        `<rect x="246" y="125" width="5" height="27" rx="1.5" fill="${ink}" opacity="0.62"/>` +
        `<rect x="295" y="125" width="5" height="27" rx="1.5" fill="${ink}" opacity="0.62"/>` +
        `</g>` +
        // one open book on each desk: a desk reads as a desk when something is on it
        `<g fill="#ffffff" opacity="0.95">` +
        `<path d="M32 117l14-2v-4l-14 2z"/><path d="M46 115l14 2v-4l-14-2z"/>` +
        `<path d="M258 115l14-2v-4l-14 2z"/><path d="M272 113l14 2v-4l-14-2z"/>` +
        `</g></g>`
      );
    case 'shelves':
      // (#290) A bookcase against the left wall: three shelves, coloured spines.
      return (
        `<g data-scene-primitive="shelves">` +
        `<rect x="4" y="86" width="50" height="64" rx="3" fill="${ink}" opacity="0.55"/>` +
        `<g stroke="#ffffff" stroke-width="2" opacity="0.4">` +
        `<path d="M4 106h50"/><path d="M4 127h50"/>` +
        `</g>` +
        `<g opacity="0.7">` +
        `<rect x="10" y="92" width="5" height="13" fill="${warm}"/>` +
        `<rect x="17" y="90" width="4" height="15" fill="${glow}"/>` +
        `<rect x="23" y="94" width="6" height="11" fill="${cool}"/>` +
        `<rect x="33" y="91" width="4" height="14" fill="${warm}"/>` +
        `<rect x="10" y="112" width="6" height="14" fill="${glow}"/>` +
        `<rect x="19" y="114" width="5" height="12" fill="${cool}"/>` +
        `<rect x="28" y="110" width="4" height="16" fill="${warm}"/>` +
        `<rect x="36" y="113" width="6" height="13" fill="${glow}"/>` +
        `</g></g>`
      );
    case 'labbench':
      // (#290) A lab bench with a flask and a rack, right edge. The bench top is
      // a solid bar so the glassware has something to stand on.
      return (
        `<g data-scene-primitive="labbench">` +
        `<rect x="226" y="116" width="92" height="7" rx="2.5" fill="${ink}" opacity="0.95"/>` +
        `<rect x="226" y="116" width="92" height="2.4" rx="1.2" fill="${warm}" opacity="0.55"/>` +
        `<rect x="232" y="123" width="5" height="29" rx="1.5" fill="${ink}" opacity="0.66"/>` +
        `<rect x="307" y="123" width="5" height="29" rx="1.5" fill="${ink}" opacity="0.66"/>` +
        `<g fill="none" stroke="${glow}" stroke-width="2.6" opacity="1">` +
        `<path d="M240 116v-10h14v10"/>` +
        `<path d="M262 116v-14h10v14"/>` +
        `</g>` +
        `<g fill="${warm}" opacity="0.95">` +
        `<rect x="243" y="108" width="8" height="8" rx="2"/>` +
        `<rect x="265" y="106" width="4" height="10" rx="2"/>` +
        `</g></g>`
      );
    case 'counter':
      // (#290) A shop counter with a till block, right edge.
      return (
        `<g data-scene-primitive="counter">` +
        `<rect x="222" y="112" width="96" height="9" rx="2.5" fill="${ink}" opacity="0.95"/>` +
        `<rect x="222" y="112" width="96" height="3" rx="1.5" fill="${warm}" opacity="0.6"/>` +
        `<rect x="228" y="121" width="84" height="31" rx="2" fill="${ink}" opacity="0.62"/>` +
        `<rect x="286" y="98" width="20" height="16" rx="3" fill="${ink}" opacity="0.8"/>` +
        `<rect x="290" y="102" width="12" height="5" rx="1.5" fill="#ffffff" opacity="0.9"/>` +
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
  const warm = esc(palette.warm || palette.glow);
  const cool = esc(palette.cool || palette.ink);
  switch (primitive) {
    case 'books':
      // A small stack with a spine edge, so it reads as books and not as two
      // floating bars. Kept out of x 100..220 (the subject box).
      return (
        `<g data-scene-primitive="books" opacity="0.75">` +
        `<rect x="42" y="${SCENE_HORIZON + 4}" width="32" height="6" rx="1.5" fill="${warm}"/>` +
        `<rect x="46" y="${SCENE_HORIZON + 11}" width="28" height="6" rx="1.5" fill="${cool}"/>` +
        `<rect x="44" y="${SCENE_HORIZON + 18}" width="30" height="6" rx="1.5" fill="${warm}"/>` +
        `<rect x="246" y="${SCENE_HORIZON + 6}" width="30" height="6" rx="1.5" fill="${cool}"/>` +
        `<rect x="242" y="${SCENE_HORIZON + 13}" width="32" height="6" rx="1.5" fill="${warm}"/>` +
        `</g>`
      );
    case 'flasks':
      return (
        `<g data-scene-primitive="flasks" fill="${warm}" opacity="0.4">` +
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
        `<g data-scene-primitive="tools" fill="none" stroke="${cool}" stroke-width="2" opacity="0.55">` +
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
  const warm = esc(palette.warm || palette.glow);
  const cool = esc(palette.cool || palette.ink);
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
        `<g data-scene-primitive="stones" fill="${cool}" opacity="0.32">` +
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
    case 'zebra':
      // (#288) A crossing in front of the subject's feet: three bands, widening
      // toward the viewer, so the stripes read as being on the road surface.
      return (
        // Painted at 0.82 and kept above the kerb band: at 0.55 over a pale
        // asphalt the stripes were invisible in the rendered frame (#288 review).
        `<g data-scene-primitive="zebra" fill="#ffffff" opacity="0.82">` +
        `<rect x="70" y="${foot + 2}" width="180" height="4" rx="1.2"/>` +
        `<rect x="60" y="${foot + 13}" width="200" height="5" rx="1.4"/>` +
        `<rect x="50" y="${foot + 24}" width="220" height="6" rx="1.6"/>` +
        `</g>`
      );
    case 'kerb':
      // (#288) The raised edge of the pavement, pinned to the bottom of the frame.
      return (
        `<g data-scene-primitive="kerb">` +
        `<rect x="0" y="${SCENE_HEIGHT - 6}" width="${SCENE_WIDTH}" height="6" fill="${cool}" opacity="0.34"/>` +
        `<path d="M0 ${SCENE_HEIGHT - 6}h${SCENE_WIDTH}" stroke="${ink}" stroke-width="1.2" opacity="0.22"/>` +
        `</g>`
      );
    case 'rack':
      // (#290) A test-tube rack at the viewer's feet, left side.
      return (
        `<g data-scene-primitive="rack">` +
        `<rect x="18" y="${foot + 8}" width="62" height="8" rx="3" fill="${ink}" opacity="0.55"/>` +
        `<g fill="${glow}" opacity="0.95">` +
        `<rect x="24" y="${foot - 8}" width="6" height="17" rx="3"/>` +
        `<rect x="34" y="${foot - 12}" width="6" height="21" rx="3"/>` +
        `<rect x="44" y="${foot - 6}" width="6" height="15" rx="3"/>` +
        `<rect x="54" y="${foot - 11}" width="6" height="20" rx="3"/>` +
        `<rect x="64" y="${foot - 5}" width="6" height="14" rx="3"/>` +
        `</g></g>`
      );
    case 'basket':
      // (#290) A shopping basket at the viewer's feet, right side.
      return (
        `<g data-scene-primitive="basket">` +
        `<path d="M236 ${foot + 4}h56l-6 18h-44z" fill="${warm}" opacity="0.7"/>` +
        `<path d="M244 ${foot + 4}q20-16 40 0" fill="none" stroke="${warm}" stroke-width="2.8" opacity="0.95"/>` +
        `<g stroke="${ink}" stroke-width="1.4" opacity="0.25">` +
        `<path d="M248 ${foot + 8}h32M246 ${foot + 13}h36"/>` +
        `</g></g>`
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
 * The four corners a sub-icon may occupy, in pixels (#256). Left/right hug the
 * horizon exactly as in P0, so an old blueprint renders the same; the upper two
 * sit above the subject and are clear of it horizontally (subject spans
 * x 100..220), so nothing covers the one shape a child has to recognise.
 */
const SCENE_SUB_ICON_SLOTS: Readonly<Record<SceneSubIconPosition, { x: number; y: number }>> = Object.freeze({
  left: { x: 28, y: SCENE_HORIZON - SCENE_SUB_ICON_SIZE - 4 },
  right: { x: SCENE_WIDTH - 28 - SCENE_SUB_ICON_SIZE, y: SCENE_HORIZON - SCENE_SUB_ICON_SIZE - 4 },
  'top-left': { x: 28, y: 22 },
  'top-right': { x: SCENE_WIDTH - 28 - SCENE_SUB_ICON_SIZE, y: 22 },
});

/**
 * Up to four supporting icons around the subject. They live in the props layer
 * (in front of the subject's box, never on top of it) so the subject stays the
 * one thing a child has to recognise.
 *
 * In compare mode (#262) only the two upper corners exist and the icons are
 * smaller (40px): the left/right slots would sit on top of a subject. A caller
 * that still passes `left`/`right` is moved to the first free upper corner
 * rather than dropped — same rule as #256.
 */
function renderSubIcons(
  subIcons: readonly SceneSubIcon[],
  palette: IllustrationPalette,
  compare: boolean,
  free: SceneFreePositions = {}
): string {
  const size = compare ? SCENE_COMPARE_SUB_ICON_SIZE : SCENE_SUB_ICON_SIZE;
  const taken: string[] = [];
  const icons = subIcons.slice(0, SCENE_MAX_SUB_ICONS).map((sub, index) => {
    const svg = renderIconSvg(sub.icon, { size, className: 'stage-illustration-subicon' });
    if (!svg) return '';
    let position: SceneSubIconPosition = sub.position;
    if (compare) {
      if (!SCENE_COMPARE_SUB_ICON_SLOTS[position] || taken.includes(position)) {
        const free = (Object.keys(SCENE_COMPARE_SUB_ICON_SLOTS) as SceneSubIconPosition[]).find(
          (slot) => !taken.includes(slot)
        );
        if (!free) return '';
        position = free;
      }
    }
    taken.push(position);
    const slot = compare
      ? SCENE_COMPARE_SUB_ICON_SLOTS[position]!
      : SCENE_SUB_ICON_SLOTS[position] || SCENE_SUB_ICON_SLOTS.left;
    return (
      `<g data-scene-subicon="${esc(sub.icon)}" data-scene-position="${esc(position)}" ` +
      `data-scene-size="${size}" ` +
      `transform="${nodeTransform(`sub-${index}`, slot.x, slot.y, size, free)}" ` +
      `color="${esc(palette.cool || palette.ink)}" opacity="0.9">${svg}</g>`
    );
  }).join('');
  return icons ? `<g data-scene-primitive="sub-icons">${icons}</g>` : '';
}

/**
 * The comparison sign (#262), drawn from fixed coordinates: no text, no font, so
 * it looks the same on every machine and cannot be affected by font fallback.
 * Unknown sign -> '' (two subjects with no sign is still a valid picture).
 */
/**
 * The surround ring (#270): up to four items in the four frame corners, drawn in
 * `ink` so the subject stays the one glowing thing a child is asked about.
 */
function renderSurroundRing(
  items: readonly string[],
  palette: IllustrationPalette,
  free: SceneFreePositions = {}
): string {
  const slots = Object.keys(SCENE_SURROUND_SLOT_PX);
  return items.map((icon, index) => {
    const slot = SCENE_SURROUND_SLOT_PX[slots[index]] || SCENE_SURROUND_SLOT_PX['top-left'];
    const svg = renderIconSvg(icon, { size: SCENE_SURROUND_ICON_SIZE, className: 'stage-illustration-subicon' });
    if (!svg) return '';
    return (
      `<g data-scene-around="${index + 1}" data-scene-position="${esc(slots[index])}" ` +
      `data-scene-size="${SCENE_SURROUND_ICON_SIZE}" transform="${nodeTransform(`around-${index + 1}`, slot.x, slot.y, SCENE_SURROUND_ICON_SIZE, free)}" ` +
      `color="${esc(palette.ink)}" opacity="0.85">${svg}</g>`
    );
  }).join('');
}

/**
 * Process strip (#267): 2-3 stages left to right, with an arrow between them.
 * Returns '' when a stage will not draw, so the caller falls back to the single
 * picture instead of showing an arrow pointing at nothing.
 */
function renderProcessStrip(
  stages: readonly string[],
  palette: IllustrationPalette,
  free: SceneFreePositions = {}
): string {
  const xs = SCENE_PROCESS_STEP_X[stages.length];
  if (!xs) return '';
  const boxes: string[] = [];
  for (let index = 0; index < stages.length; index += 1) {
    const svg = renderIconSvg(stages[index], {
      size: SCENE_PROCESS_STEP_SIZE,
      className: 'stage-illustration-icon',
    });
    if (!svg) return '';
    boxes.push(
      `<g data-scene-step="${index + 1}" data-scene-size="${SCENE_PROCESS_STEP_SIZE}" ` +
        `transform="${nodeTransform(`step-${index + 1}`, xs[index], SCENE_PROCESS_STEP_TOP, SCENE_PROCESS_STEP_SIZE, free)}" color="${esc(palette.glow)}">` +
        groundShadow('stage', SCENE_PROCESS_STEP_SIZE / 2, SCENE_PROCESS_STEP_SIZE, SCENE_PROCESS_STEP_SIZE, palette) +
        `${svg}</g>`
    );
  }
  const arrows = xs.slice(1).map((next, index) => {
    const gapStart = xs[index] + SCENE_PROCESS_STEP_SIZE;
    const x = Math.round((gapStart + next) / 2 - SCENE_PROCESS_ARROW_WIDTH / 2);
    const y = SCENE_PROCESS_STEP_TOP + Math.round(SCENE_PROCESS_STEP_SIZE / 2);
    const tip = SCENE_PROCESS_ARROW_WIDTH - 5;
    return (
      `<path data-scene-arrow="${index + 1}" d="M${x} ${y}h${tip}M${x + tip - 4} ${y - 4}l4 4-4 4" ` +
      `fill="none" stroke="${esc(palette.ink)}" stroke-width="2.2" stroke-linecap="round" ` +
      `stroke-linejoin="round" opacity="0.7"/>`
    );
  });
  return boxes.join('') + arrows.join('');
}

function renderCompareSign(sign: SceneCompareSign | undefined, palette: IllustrationPalette): string {
  const ink = esc(palette.ink);
  const stroke = `fill="none" stroke="${ink}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"`;
  const body =
    sign === 'greater-than'
      ? `<path d="M5 4 L20 12 L5 20" ${stroke}/>`
      : sign === 'less-than'
        ? `<path d="M20 4 L5 12 L20 20" ${stroke}/>`
        : sign === 'equal'
          ? `<rect x="4" y="7" width="16" height="4" rx="2" fill="${ink}"/>` +
            `<rect x="4" y="14" width="16" height="4" rx="2" fill="${ink}"/>`
          : '';
  return body ? `<g data-scene-primitive="compare-sign">${body}</g>` : '';
}

/**
 * Ground props (#259): up to two icons standing on the ground band beside the
 * subject. Smaller and flatter than a sub icon on purpose — a prop is set
 * dressing that explains the place, not a second thing to recognise — and it
 * sits inside the props layer so the foreground can overlap it.
 */
/**
 * One soft contact shadow centred on `cx`, its feet at `feetY`.
 *
 * `kind` is `subject` | `prop` | `stage` and lands in `data-scene-shadow`, so a
 * test can count shadows per role instead of counting `<ellipse>` tags (the sky
 * draws those too).
 */
function groundShadow(
  kind: 'subject' | 'prop' | 'stage',
  cx: number,
  feetY: number,
  boxSize: number,
  palette: IllustrationPalette
): string {
  const rx = Math.max(6, Math.round(boxSize * SCENE_SHADOW_WIDTH_RATIO));
  const ry = Math.max(2, Math.round(rx * SCENE_SHADOW_HEIGHT_RATIO));
  const cy = Math.min(SCENE_HEIGHT - 4, Math.round(feetY - ry * 0.4));
  return `<ellipse data-scene-shadow="${kind}" cx="${Math.round(cx)}" cy="${cy}" rx="${rx}" ry="${ry}" ` +
    `fill="${esc(palette.ink)}" opacity="${SCENE_SHADOW_OPACITY}"/>`;
}

/**
 * #297: the objects the teacher added. They are painted in the `props` layer, after
 * the scenery and after the corner icons, so a picture she dragged onto the scene
 * is never buried under a fence.
 */
function renderExtras(
  extras: readonly { icon: string; x: number; y: number; s: number; r?: number }[],
  palette: IllustrationPalette,
  free: SceneFreePositions = {}
): string {
  if (!extras.length) return '';
  return extras.slice(0, SCENE_MAX_EXTRAS).map((extra, index) => {
    const svg = renderIconSvg(extra.icon, {
      size: SCENE_EXTRA_SIZE,
      className: 'stage-illustration-extra',
    });
    if (!svg) return '';
    // The stored placement is the truth; `freePos['extra-i']` is the editor's live
    // copy of the same numbers, so a drag writes one place and draws from another.
    const placement = free[`extra-${index}`] || { x: extra.x, y: extra.y, s: extra.s, r: extra.r };
    const transform = nodeTransform(
      `extra-${index}`,
      Math.round(extra.x * SCENE_WIDTH - SCENE_EXTRA_SIZE / 2),
      Math.round(extra.y * SCENE_HEIGHT - SCENE_EXTRA_SIZE / 2),
      SCENE_EXTRA_SIZE,
      { [`extra-${index}`]: placement }
    );
    return (
      `<g data-scene-extra="${index}" data-scene-size="${SCENE_EXTRA_SIZE}" ` +
      `transform="${transform}" color="${esc(palette.ink)}">${svg}</g>`
    );
  }).join('');
}

function renderGroundProps(
  props: readonly string[],
  palette: IllustrationPalette,
  free: SceneFreePositions = {}
): string {
  const slots = [
    { x: 12, y: SCENE_HEIGHT - 14 - SCENE_GROUND_PROP_SIZE },
    { x: SCENE_WIDTH - 12 - SCENE_GROUND_PROP_SIZE, y: SCENE_HEIGHT - 14 - SCENE_GROUND_PROP_SIZE },
  ];
  const icons = props.slice(0, SCENE_MAX_PROPS).map((name, index) => {
    const svg = renderIconSvg(name, { size: SCENE_GROUND_PROP_SIZE, className: 'stage-illustration-prop' });
    if (!svg) return '';
    return (
      `<g data-scene-prop="${esc(name)}" data-scene-position="ground-${index === 0 ? 'left' : 'right'}" ` +
      `transform="${nodeTransform(`prop-${index}`, slots[index].x, slots[index].y, SCENE_GROUND_PROP_SIZE, free)}" ` +
      `color="${esc(palette.warm || palette.glow)}" opacity="0.85">` +
      groundShadow('prop', slots[index].x + SCENE_GROUND_PROP_SIZE / 2, slots[index].y + SCENE_GROUND_PROP_SIZE, SCENE_GROUND_PROP_SIZE, palette) +
      `${svg}</g>`
    );
  }).join('');
  return icons ? `<g data-scene-primitive="ground-props">${icons}</g>` : '';
}

/**
 * The one composer. `renderSceneSvg` passes an empty sub-icon list, so a game
 * saved before blueprints existed renders byte-identically (#70/#72 contract).
 */
/** #294: one hand-placed node — normalised centre (0..1) plus a scale. */
export type SceneFreePos = { x: number; y: number; s: number; r?: number };
export type SceneFreePositions = Readonly<Record<string, SceneFreePos>>;

/**
 * The transform for one scene node. Without a hand-placed entry it is the same
 * translate(left top) the engine has always emitted, so an untouched blueprint
 * draws byte-identically (#294 keeps old scenes and every golden unchanged).
 */
function nodeTransform(
  key: string,
  left: number,
  top: number,
  boxSize: number,
  free?: SceneFreePositions
): string {
  const entry = free && free[key];
  if (!entry) return `translate(${left} ${top})`;
  const cx = Math.round(entry.x * SCENE_WIDTH);
  const cy = Math.round(entry.y * SCENE_HEIGHT);
  const scale = Math.round(entry.s * 100) / 100;
  // #297: rotation happens BEFORE the scale, so a turned object still grows and
  // shrinks around its own centre instead of swinging around the frame.
  const rotation = entry.r ? ` rotate(${Math.round(entry.r)})` : '';
  return (
    `translate(${cx} ${cy})${rotation} scale(${scale}) ` +
    `translate(${-Math.round(boxSize / 2)} ${-Math.round(boxSize / 2)})`
  );
}

/** One draggable node as the EDITOR sees it: top-left px, box size, scale. */
export interface SceneNodeSlot {
  key: string;
  label: string;
  x: number;
  y: number;
  size: number;
  scale: number;
  rotation: number;
}

/**
 * Every node the current blueprint draws, with its DEFAULT geometry (or the
 * hand-placed one). Used by the editor to put a drag handle on screen and by the
 * #294 tests to prove a handle sits where the art is.
 */
export function sceneNodeSlots(blueprint: SceneBlueprint): SceneNodeSlot[] {
  if (!blueprint || typeof blueprint !== 'object') return [];
  const spec = getBackdropSpec(blueprint.backdrop);
  const free = freePositionsOf(blueprint);
  const subs = Array.isArray(blueprint.subIcons) ? blueprint.subIcons : [];
  const props = Array.isArray(blueprint.props) ? blueprint.props : [];
  const steps =
    blueprint.layout === 'process' && Array.isArray(blueprint.steps)
      ? [blueprint.mainIcon, ...blueprint.steps]
      : [];
  const around = blueprint.layout === 'surround' && Array.isArray(blueprint.around) ? blueprint.around : [];
  const isCompare = blueprint.layout === 'compare' && Boolean(blueprint.compareIcon);
  const isSurround = around.length > 0;
  const subjectSize = isSurround
    ? SCENE_SURROUND_SUBJECT_SIZE
    : isCompare
      ? SCENE_COMPARE_SUBJECT_SIZE
      : SCENE_SUBJECT_SIZE;
  const subjectY = isCompare ? spec.subjectY + SCENE_COMPARE_SUBJECT_LIFT : spec.subjectY;
  const slots: SceneNodeSlot[] = [];

  const push = (
    key: string,
    label: string,
    left: number,
    top: number,
    size: number,
    source?: SceneFreePos
  ) => {
    // #297: an added object keeps its placement in `extras[]`, not in `freePos`,
    // so its handle has to read the object itself.
    const entry = free[key] || source;
    slots.push({
      key,
      label,
      x: entry ? Math.round(entry.x * SCENE_WIDTH - size / 2) : Math.round(left),
      y: entry ? Math.round(entry.y * SCENE_HEIGHT - size / 2) : Math.round(top),
      size,
      scale: entry ? entry.s : 1,
      rotation: entry && entry.r ? entry.r : 0,
    });
  };

  if (isSurround) {
    push(
      'subject',
      'Hình chính',
      (SCENE_WIDTH - SCENE_SURROUND_SUBJECT_SIZE) / 2,
      SCENE_SURROUND_SUBJECT_TOP,
      SCENE_SURROUND_SUBJECT_SIZE
    );
  } else if (steps.length >= 2) {
    const xs = SCENE_PROCESS_STEP_X[steps.length] || [];
    steps.forEach((_icon, index) => {
      push(
        `step-${index + 1}`,
        index === 0 ? 'Bậc 1' : `Bậc ${index + 1}`,
        xs[index] || 0,
        SCENE_PROCESS_STEP_TOP,
        SCENE_PROCESS_STEP_SIZE
      );
    });
  } else if (isCompare) {
    push('subject', 'Hình trái', SCENE_COMPARE_SUBJECT_X.left, subjectY - subjectSize / 2, subjectSize);
    push('second', 'Hình phải', SCENE_COMPARE_SUBJECT_X.right, subjectY - subjectSize / 2, subjectSize);
    push(
      'sign',
      'Dấu so sánh',
      (SCENE_WIDTH - SCENE_COMPARE_SIGN_SIZE) / 2,
      subjectY - SCENE_COMPARE_SIGN_SIZE / 2,
      SCENE_COMPARE_SIGN_SIZE
    );
  } else {
    push(
      'subject',
      'Hình chính',
      (SCENE_WIDTH - SCENE_SUBJECT_SIZE) / 2,
      subjectY - subjectSize / 2,
      SCENE_SUBJECT_SIZE
    );
  }

  const subSize = isCompare || steps.length >= 2 ? SCENE_COMPARE_SUB_ICON_SIZE : SCENE_SUB_ICON_SIZE;
  subs.forEach((sub, index) => {
    const table = isCompare || steps.length >= 2 ? SCENE_COMPARE_SUB_ICON_SLOTS : SCENE_SUB_ICON_SLOTS;
    const slot = table[sub.position] || SCENE_SUB_ICON_SLOTS.left;
    push(`sub-${index}`, `Góc ${index + 1}`, slot.x, slot.y, subSize);
  });

  props.forEach((_icon, index) => {
    const left = index === 0 ? 12 : SCENE_WIDTH - 12 - SCENE_GROUND_PROP_SIZE;
    push(`prop-${index}`, `Vật ${index + 1}`, left, SCENE_HEIGHT - 14 - SCENE_GROUND_PROP_SIZE, SCENE_GROUND_PROP_SIZE);
  });

  /* #297: the objects the teacher added. They come last because they sit on top of
     the scenery in the paint order, so they are also the last handles on screen. */
  const extras = Array.isArray(blueprint.extras) ? blueprint.extras : [];
  extras.forEach((extra, index) => {
    push(
      `extra-${index}`,
      `Vật thêm ${index + 1}`,
      extra.x * SCENE_WIDTH - SCENE_EXTRA_SIZE / 2,
      extra.y * SCENE_HEIGHT - SCENE_EXTRA_SIZE / 2,
      SCENE_EXTRA_SIZE,
      extra
    );
  });

  if (isSurround) {
    const ringKeys = Object.keys(SCENE_SURROUND_SLOT_PX);
    around.forEach((_icon, index) => {
      const slot = SCENE_SURROUND_SLOT_PX[ringKeys[index]] || SCENE_SURROUND_SLOT_PX['top-left'];
      push(`around-${index + 1}`, `Vòng ${index + 1}`, slot.x, slot.y, SCENE_SURROUND_ICON_SIZE);
    });
  }

  return slots;
}

function freePositionsOf(blueprint: SceneBlueprint): SceneFreePositions {
  const raw = blueprint && (blueprint as { freePos?: unknown }).freePos;
  return raw && typeof raw === 'object' ? (raw as SceneFreePositions) : {};
}

function composeSceneSvg(
  spec: SceneSpec,
  palette: IllustrationPalette,
  subject: string,
  subIcons: readonly SceneSubIcon[],
  groundProps: readonly string[],
  options: SceneSvgOptions = {},
  compare: { second: string; sign: SceneCompareSign | undefined } | null = null,
  processStages: readonly string[] = [],
  surroundRing: readonly string[] = [],
  free: SceneFreePositions = {},
  extras: readonly { icon: string; x: number; y: number; s: number; r?: number }[] = []
): string {
  if (!subject) return '';

  // Compare mode is a different geometry, not a re-centre: see the constants
  // block above for why a 92px subject cannot keep #256's four corners.
  const isCompare = Boolean(compare);
  // #270: the ring owns the corners, so its subject is 88px and sits at a fixed
  // y (52) instead of following a backdrop's subjectY.
  const isSurround = surroundRing.length > 0;
  const subjectSize = isSurround
    ? SCENE_SURROUND_SUBJECT_SIZE
    : isCompare
      ? SCENE_COMPARE_SUBJECT_SIZE
      : SCENE_SUBJECT_SIZE;
  const subjectY = isCompare ? spec.subjectY + SCENE_COMPARE_SUBJECT_LIFT : spec.subjectY;
  let y = Math.round(subjectY - subjectSize / 2);
  const sky = palette.sky || palette.fill;
  const ground = palette.ground || darken(palette.fill);

  // #277: contact shadows for whatever stands on the ground. They are emitted with
  // the ground plane (`mid`), so the subject and every prop are always in front of
  // their own shadow no matter which layout is drawing.
  // #294: a dragged subject takes its shadow with it. A shadow left at the
  // derived position would point at empty ground (#277 all over again).
  const subjectFree = free['subject'];
  if (subjectFree) {
    y = Math.round(subjectFree.y * SCENE_HEIGHT - subjectSize / 2);
  }
  const feetY = y + subjectSize;
  // #294: a dragged subject keeps its feet inside its own shadow, so the shadow
  // centre follows the hand-placed x as well as the derived one.
  const shadowX = (derived: number): number => (subjectFree ? subjectFree.x * SCENE_WIDTH : derived);
  const subjectShadows = isSurround
    ? groundShadow('subject', shadowX(SCENE_WIDTH / 2), SCENE_SURROUND_SUBJECT_TOP + SCENE_SURROUND_SUBJECT_SIZE, SCENE_SURROUND_SUBJECT_SIZE, palette)
    : processStages.length >= 2
      ? '' // the strip draws one per stage instead
      : isCompare
        ? groundShadow('subject', shadowX(SCENE_COMPARE_SUBJECT_X.left + subjectSize / 2), feetY, subjectSize, palette) +
          groundShadow('subject', SCENE_COMPARE_SUBJECT_X.right + subjectSize / 2, feetY, subjectSize, palette)
        : groundShadow('subject', shadowX(SCENE_WIDTH / 2), feetY, subjectSize, palette);

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
      primitivesOf(spec.sky).map((p) => renderSky(p, palette)).join('')
    ) +
    layer('far',
      primitivesOf(spec.horizon).map((p) => renderFar(p, palette)).join('') +
      `<path d="${sceneGroundPath()}" fill="${esc(ground)}"/>` +
      `<path d="${sceneGroundShadePath()}" fill="${esc(palette.ink)}" opacity="0.05"/>`
    ) +
    layer('mid', primitivesOf(spec.standing).map((p) => renderMid(p, palette)).join('') + subjectShadows) +

    // #266: the subject is drawn in the palette ACCENT (`glow`), not in ink.
    // Every element used to be ink, so a scene read as one dark blue outline on
    // a pale wash; the accent is the only saturated colour a palette owns, and
    // giving it to the one thing the question is about makes the picture read
    // as a picture instead of a diagram.
    layer('subject', surroundRing.length
      ? `<g data-scene-subject="main" data-scene-size="${SCENE_SURROUND_SUBJECT_SIZE}" ` +
        `transform="${nodeTransform('subject', Math.round((SCENE_WIDTH - SCENE_SURROUND_SUBJECT_SIZE) / 2), SCENE_SURROUND_SUBJECT_TOP, SCENE_SURROUND_SUBJECT_SIZE, free)}" ` +
        `color="${esc(palette.glow)}">${subject}</g>`
      : processStages.length >= 2
      // #267: a sequence is drawn as a strip, not as one centre picture.
      ? renderProcessStrip(processStages, palette) || `<g transform="${nodeTransform('subject', Math.round((SCENE_WIDTH - SCENE_SUBJECT_SIZE) / 2), y, SCENE_SUBJECT_SIZE, free)}" color="${esc(palette.glow)}">${subject}</g>`
      : isCompare
      ? `<g data-scene-subject="main" data-scene-size="${subjectSize}" transform="${nodeTransform('subject', SCENE_COMPARE_SUBJECT_X.left, y, subjectSize, free)}" color="${esc(palette.glow)}">${subject}</g>` +
        `<g data-scene-subject="second" data-scene-size="${subjectSize}" transform="${nodeTransform('second', SCENE_COMPARE_SUBJECT_X.right, y, subjectSize, free)}" color="${esc(palette.ink)}">${compare!.second}</g>`
      : `<g transform="${nodeTransform('subject', Math.round((SCENE_WIDTH - SCENE_SUBJECT_SIZE) / 2), y, SCENE_SUBJECT_SIZE, free)}" color="${esc(palette.glow)}">${subject}</g>`) +
    layer('props', primitivesOf(spec.standing).map((p) => renderProps(p, palette)).join('') + renderGroundProps(groundProps, palette, free) + renderSurroundRing(surroundRing, palette, free) + renderSubIcons(subIcons, palette, isCompare || processStages.length >= 2, free) +renderExtras(extras, palette, free)) +
    layer('sign', isCompare
      ? `<g data-scene-sign="${esc(String(compare!.sign || ''))}" data-scene-size="${SCENE_COMPARE_SIGN_SIZE}" ` +
        `transform="${nodeTransform('sign', SCENE_WIDTH / 2 - SCENE_COMPARE_SIGN_SIZE / 2, Math.round(subjectY - SCENE_COMPARE_SIGN_SIZE / 2), SCENE_COMPARE_SIGN_SIZE, free)}" ` +
        `color="${esc(palette.ink)}">${renderCompareSign(compare!.sign, palette)}</g>`
      : '') +
    layer('fg', primitivesOf(spec.fg).map((p) => renderFg(p, palette)).join('')) +
    `</svg>`
  );
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
  const subject = renderIconSvg(iconName, { size: SCENE_SUBJECT_SIZE, className: 'stage-illustration-icon' });
  return composeSceneSvg(getSceneSpec(category), palette, subject, [], [], options);
}

/**
 * Full `<svg>` for a validated blueprint (#252). The palette is passed in
 * rather than looked up so this module never imports the registry (which
 * imports this one): the caller already has `resolved.palette`.
 *
 * Total: an unrenderable subject returns '' so the stage column simply
 * disappears instead of showing a broken frame.
 */
export function renderBlueprintSvg(
  blueprint: SceneBlueprint,
  palette: IllustrationPalette,
  options: SceneSvgOptions = {}
): string {
  if (!blueprint || typeof blueprint !== 'object') return '';
  const isCompare =
    blueprint.layout === 'compare' && typeof blueprint.compareIcon === 'string' && Boolean(blueprint.compareIcon);
  const isSurround =
    blueprint.layout === 'surround' && Array.isArray(blueprint.around) && blueprint.around.length > 0;
  const subjectSize = isSurround
    ? SCENE_SURROUND_SUBJECT_SIZE
    : isCompare
      ? SCENE_COMPARE_SUBJECT_SIZE
      : SCENE_SUBJECT_SIZE;
  const subject = renderIconSvg(blueprint.mainIcon, {
    size: subjectSize,
    className: 'stage-illustration-icon',
  });
  // A compare blueprint whose second subject will not render degrades to the
  // single layout instead of drawing half a comparison.
  const second = isCompare
    ? renderIconSvg(blueprint.compareIcon as string, {
        size: SCENE_COMPARE_SUBJECT_SIZE,
        className: 'stage-illustration-icon',
      })
    : '';
  return composeSceneSvg(
    getBackdropSpec(blueprint.backdrop),
    palette,
    subject,
    Array.isArray(blueprint.subIcons) ? blueprint.subIcons : [],
    Array.isArray(blueprint.props) ? blueprint.props : [],
    options,
    second ? { second, sign: blueprint.compareSign } : null,
    blueprint.layout === 'process' && Array.isArray(blueprint.steps)
      ? [blueprint.mainIcon, ...blueprint.steps]
      : [],
    blueprint.layout === 'surround' && Array.isArray(blueprint.around) ? blueprint.around : [],
    freePositionsOf(blueprint),
    Array.isArray(blueprint.extras) ? blueprint.extras : []
  );
}

