/*
 * Constellation templates (DECISIONS #171) — pure data, no DOM, no Three.js.
 *
 * "Chòm sao tri thức" replaces the connection board's picture with a real
 * constellation. The producer of the data is unchanged: the play style is still
 * `matchingGame.mode === 'connection'` and the played items are still
 * `matchingGame.pairs`. What changes is the PICTURE: instead of a schematic of
 * nodes and edges the class gets stars, and every pair they connect lights one
 * more star of a pattern they have to recognise.
 *
 * Why this module is shaped like `connection-templates.ts`:
 *
 *   - `connection-progress.ts` (and its renderer twin `connection-core.ts`) only
 *     understands a `{ id, stages[] }` template and a pair INDEX. Duplicating
 *     that logic for a second picture would create a third copy of the rules the
 *     16 275-step parity suite guards. So a constellation is RESOLVED into the
 *     same shape (`constellationTemplate(...)` → `{ nodes, edges, stages }`) and
 *     the existing progression drives it untouched.
 *   - The projection onto the board is fixed (`CONSTELLATION_VIEWBOX`), the same
 *     box the SVG fallback, the projector and the 3D layer all scale from.
 *
 * A constellation therefore declares:
 *   - `stars`: MORE points than any board can use (10+), each with a priority.
 *   - `priority`: the order in which stars are chosen — the first few always
 *     keep the pattern recognisable (the body of the figure), later ones add the
 *     smaller stars around it.
 *   - `edges`: the figure itself. Links between stars that both made the board
 *     are kept, so the shape still reads at 2 stars and at 10.
 *   - `shortest`: the handful of stars that are placed FIRST (the anchor), so a
 *     2-pair board still draws a recognisable fragment instead of its last two
 *     stars.
 *
 * Everything here is optional-with-fallback at the edges: an unknown id falls
 * back to `DEFAULT_CONSTELLATION`, never to an error (same rule as
 * `connection-templates.ts`), so a saved game from another build still opens.
 */

/** Every constellation is drawn in this box; renderers scale it. */
export const CONSTELLATION_VIEWBOX = { width: 1000, height: 620 } as const;

/** How many stars a constellation can light up. */
export const CONSTELLATION_STAR_MIN = 2;
export const CONSTELLATION_STAR_MAX = 10;

/** A destination-side label drawn inside the 3D scene instead of an HTML card. */
export const CONSTELLATION_SHORT_LABEL_MAX = 24;

/** The legibility floor (CSS px per glyph height) for a 3D label. */
export const CONSTELLATION_LABEL_MIN_PX = 22;

export type ConstellationDragDirection = 'left-to-right' | 'right-to-left';
export const CONSTELLATION_DRAG_DIRECTIONS: readonly ConstellationDragDirection[] = ['left-to-right', 'right-to-left'];
export const DEFAULT_DRAG_DIRECTION: ConstellationDragDirection = 'left-to-right';

/**
 * A star of the figure.
 *
 * `label` is a short Vietnamese caption ("sao Bắc Cực", "vai Orion") shown beside
 * the star once it is earned; it is never the lesson text. `priority` is the
 * selection order: lower wins.
 */
export interface ConstellationStar {
  id: string;
  /** `CONSTELLATION_VIEWBOX` coordinates (top-left origin). */
  x: number;
  y: number;
  /** Short caption beside the star; empty for an unnamed field star. */
  label: string;
  /** 1 = the body of the figure, 5 = a small star that only fills a long board. */
  priority: number;
  /** Visual weight: the stars a beginner must recognise are the brighter ones. */
  brightness: number;
}

export interface ConstellationEdge {
  id: string;
  from: string;
  to: string;
}

export interface ConstellationTemplate {
  id: string;
  name: string;
  description: string;
  /** Where this figure fits best, shown in the gallery. Empty when universal. */
  subjectHint: string;
  /** The season/part of the sky it belongs to, for the gallery card. */
  sky: string;
  stars: ConstellationStar[];
  edges: ConstellationEdge[];
  /**
   * The human order of the figure, which drives stage labels and the completion
   * sweep. One entry per star, in the order the pattern is usually drawn.
   */
  priority: string[];
}

/**
 * Seven real constellations. They differ in shape, direction and star count on
 * purpose: a teacher picks "a different picture", not "the same object
 * recoloured".
 */
export const CONSTELLATION_TEMPLATES: readonly ConstellationTemplate[] = [
  {
    id: 'ursa-major',
    name: 'Đại Hùng',
    description: 'Chòm Gấu Lớn: bốn sao của chiếc gáo nối với ba sao cán gáo, chỉ dần tới Bắc Cực.',
    subjectHint: 'Thiên văn · Địa lý · Định hướng',
    sky: 'Bắc bán cầu · hiển thị cả năm',
    stars: [
      { id: 'dubhe', x: 60, y: 300, label: 'Bắc Đẩu', priority: 1, brightness: 1 },
      { id: 'merak', x: 60, y: 470, label: 'Thiên Tuyền', priority: 2, brightness: 0.95 },
      { id: 'phecda', x: 500, y: 470, label: 'Thiên Cơ', priority: 3, brightness: 0.9 },
      { id: 'megrez', x: 500, y: 300, label: 'Thiên Quyền', priority: 4, brightness: 0.8 },
      { id: 'alioth', x: 960, y: 300, label: 'Ngọc Hành', priority: 5, brightness: 0.95 },
      { id: 'mizar', x: 960, y: 470, label: 'Khai Dương', priority: 6, brightness: 0.9 },
      { id: 'alkaid', x: 960, y: 140, label: 'Dao Quang', priority: 7, brightness: 0.85 },
      { id: 'talitha', x: 500, y: 140, label: 'Thượng Phụ', priority: 8, brightness: 0.55 },
      { id: 'alula', x: 300, y: 40, label: 'Hạ Phụ', priority: 9, brightness: 0.5 },
      { id: 'muscida', x: 760, y: 40, label: '', priority: 10, brightness: 0.35 }
    ],
    edges: [
      { id: 'bowl-1', from: 'dubhe', to: 'merak' },
      { id: 'bowl-2', from: 'merak', to: 'phecda' },
      { id: 'bowl-3', from: 'phecda', to: 'megrez' },
      { id: 'bowl-4', from: 'megrez', to: 'dubhe' },
      { id: 'handle-1', from: 'megrez', to: 'alioth' },
      { id: 'handle-2', from: 'alioth', to: 'mizar' },
      { id: 'handle-3', from: 'mizar', to: 'alkaid' },
      { id: 'paw-1', from: 'megrez', to: 'talitha' },
      { id: 'paw-2', from: 'alioth', to: 'alula' },
      { id: 'paw-3', from: 'alula', to: 'muscida' }
    ],
    priority: ['dubhe', 'merak', 'phecda', 'megrez', 'alioth', 'mizar', 'alkaid', 'talitha', 'alula', 'muscida']
  },
  {
    id: 'orion',
    name: 'Orion',
    description: 'Thợ Săn: ba sao thắt lưng thẳng hàng, hai vai và hai chân tạo thành chữ H quen thuộc.',
    subjectHint: 'Thiên văn · Ngữ văn (thần thoại)',
    sky: 'Xích đạo · rõ nhất về đêm mùa đông',
    stars: [
      { id: 'alnitak', x: 500, y: 250, label: 'Thắt lưng Đông', priority: 1, brightness: 0.9 },
      { id: 'alnilam', x: 200, y: 340, label: 'Thắt lưng Giữa', priority: 2, brightness: 1 },
      { id: 'mintaka', x: 800, y: 340, label: 'Thắt lưng Tây', priority: 3, brightness: 0.9 },
      { id: 'betelgeuse', x: 120, y: 120, label: 'Vai Đông', priority: 4, brightness: 1 },
      { id: 'bellatrix', x: 880, y: 120, label: 'Vai Tây', priority: 5, brightness: 0.85 },
      { id: 'saiph', x: 150, y: 560, label: 'Chân Đông', priority: 6, brightness: 0.8 },
      { id: 'rigel', x: 860, y: 560, label: 'Chân Tây', priority: 7, brightness: 1 },
      { id: 'meissa', x: 500, y: 24, label: 'Đầu', priority: 8, brightness: 0.6 },
      { id: 'thabit', x: 500, y: 430, label: '', priority: 9, brightness: 0.4 },
      { id: 'tabit', x: 900, y: 480, label: '', priority: 10, brightness: 0.35 }
    ],
    edges: [
      { id: 'belt-1', from: 'alnitak', to: 'alnilam' },
      { id: 'belt-2', from: 'alnilam', to: 'mintaka' },
      { id: 'shoulder-1', from: 'betelgeuse', to: 'alnitak' },
      { id: 'shoulder-2', from: 'bellatrix', to: 'mintaka' },
      { id: 'body-1', from: 'betelgeuse', to: 'saiph' },
      { id: 'body-2', from: 'bellatrix', to: 'rigel' },
      { id: 'head', from: 'betelgeuse', to: 'meissa' },
      { id: 'arm-1', from: 'mintaka', to: 'thabit' },
      { id: 'arm-2', from: 'saiph', to: 'tabit' }
    ],
    priority: ['alnilam', 'alnitak', 'mintaka', 'betelgeuse', 'bellatrix', 'saiph', 'rigel', 'meissa', 'thabit', 'tabit']
  },
  {
    id: 'cygnus',
    name: 'Thiên Nga',
    description: 'Con thiên nga bay dọc Ngân Hà: chữ thập dài từ đầu tới đuôi, đôi cánh xoè ngang.',
    subjectHint: 'Thiên văn · Địa lý',
    sky: 'Bắc bán cầu · mùa hạ và mùa thu',
    stars: [
      { id: 'sadr', x: 500, y: 320, label: 'Tâm Sao', priority: 1, brightness: 1 },
      { id: 'deneb', x: 500, y: 100, label: 'Sao Thiên Tân', priority: 2, brightness: 1 },
      { id: 'albireo', x: 500, y: 580, label: 'Mỏ Sao', priority: 3, brightness: 0.75 },
      { id: 'gienah', x: 60, y: 300, label: 'Cánh Tây', priority: 4, brightness: 0.85 },
      { id: 'delta', x: 940, y: 300, label: 'Cánh Đông', priority: 5, brightness: 0.9 },
      { id: 'iota', x: 940, y: 460, label: '', priority: 6, brightness: 0.45 },
      { id: 'kappa', x: 60, y: 460, label: '', priority: 7, brightness: 0.45 },
      { id: 'zeta', x: 500, y: 20, label: '', priority: 8, brightness: 0.4 },
      { id: 'eta', x: 500, y: 220, label: '', priority: 9, brightness: 0.4 },
      { id: 'xi', x: 500, y: 460, label: '', priority: 10, brightness: 0.35 }
    ],
    edges: [
      { id: 'spine-1', from: 'deneb', to: 'sadr' },
      { id: 'spine-2', from: 'sadr', to: 'albireo' },
      { id: 'wing-1', from: 'sadr', to: 'gienah' },
      { id: 'wing-2', from: 'sadr', to: 'delta' },
      { id: 'feather-1', from: 'gienah', to: 'kappa' },
      { id: 'feather-2', from: 'delta', to: 'iota' },
      { id: 'neck-1', from: 'deneb', to: 'zeta' },
      { id: 'neck-2', from: 'deneb', to: 'eta' },
      { id: 'tail', from: 'albireo', to: 'xi' }
    ],
    priority: ['sadr', 'deneb', 'albireo', 'gienah', 'delta', 'iota', 'kappa', 'zeta', 'eta', 'xi']
  },
  {
    id: 'lyra',
    name: 'Thiên Cầm',
    description: 'Cây đàn Lyre của Orpheus: một hình bình hành nhỏ và ngôi sao sáng Chức Nữ bắc lên trên.',
    subjectHint: 'Thiên văn · Ngữ văn (thần thoại) · Âm nhạc',
    sky: 'Bắc bán cầu · mùa hạ',
    stars: [
      { id: 'vega', x: 500, y: 20, label: 'Chức Nữ', priority: 1, brightness: 1 },
      { id: 'sheliak', x: 60, y: 300, label: 'Lyre Tây', priority: 2, brightness: 0.7 },
      { id: 'sulafat', x: 940, y: 300, label: 'Lyre Đông', priority: 3, brightness: 0.75 },
      { id: 'delta2', x: 60, y: 470, label: '', priority: 4, brightness: 0.5 },
      { id: 'zeta1', x: 940, y: 470, label: '', priority: 5, brightness: 0.5 },
      { id: 'aladfar', x: 60, y: 60, label: '', priority: 6, brightness: 0.4 },
      { id: 'eta', x: 940, y: 60, label: '', priority: 7, brightness: 0.4 },
      { id: 'epsilon', x: 940, y: 180, label: '', priority: 8, brightness: 0.35 },
      { id: 'theta', x: 60, y: 180, label: '', priority: 9, brightness: 0.35 },
      { id: 'kappa', x: 500, y: 470, label: '', priority: 10, brightness: 0.3 }
    ],
    edges: [
      { id: 'frame-1', from: 'vega', to: 'sheliak' },
      { id: 'frame-2', from: 'vega', to: 'sulafat' },
      { id: 'base-1', from: 'sheliak', to: 'delta2' },
      { id: 'base-2', from: 'sulafat', to: 'zeta1' },
      { id: 'base-3', from: 'delta2', to: 'zeta1' },
      { id: 'string-1', from: 'sheliak', to: 'aladfar' },
      { id: 'string-2', from: 'sulafat', to: 'eta' },
      { id: 'arm-1', from: 'aladfar', to: 'theta' },
      { id: 'arm-2', from: 'eta', to: 'epsilon' },
      { id: 'base-4', from: 'delta2', to: 'kappa' }
    ],
    priority: ['vega', 'sulafat', 'sheliak', 'delta2', 'zeta1', 'aladfar', 'eta', 'epsilon', 'theta', 'kappa']
  },
  {
    id: 'taurus',
    name: 'Kim Ngưu',
    description: 'Con bò: đầu hình chữ V với mắt Aldebaran đỏ, hai sừng vươn dài lên trời.',
    subjectHint: 'Thiên văn · Sinh học (chòm sao hoàng đạo)',
    sky: 'Xích đạo · đêm mùa đông',
    stars: [
      { id: 'aldebaran', x: 460, y: 340, label: 'Chủ Tinh', priority: 1, brightness: 1 },
      { id: 'ain', x: 20, y: 180, label: 'Mắt Tây', priority: 2, brightness: 0.7 },
      { id: 'elnath', x: 960, y: 200, label: 'Sừng Bắc', priority: 3, brightness: 0.8 },
      { id: 'prima', x: 460, y: 120, label: 'Sừng Giữa', priority: 4, brightness: 0.65 },
      { id: 'theta', x: 960, y: 400, label: '', priority: 5, brightness: 0.55 },
      { id: 'gamma', x: 540, y: 600, label: 'Sừng Đông', priority: 6, brightness: 0.75 },
      { id: 'lambda', x: 960, y: 580, label: '', priority: 7, brightness: 0.45 },
      { id: 'sigma1', x: 20, y: 340, label: '', priority: 8, brightness: 0.4 },
      { id: 'rho', x: 300, y: 500, label: '', priority: 9, brightness: 0.35 },
      { id: 'omega', x: 660, y: 40, label: '', priority: 10, brightness: 0.3 }
    ],
    edges: [
      { id: 'face-1', from: 'aldebaran', to: 'ain' },
      { id: 'face-2', from: 'ain', to: 'prima' },
      { id: 'horn-1', from: 'prima', to: 'elnath' },
      { id: 'horn-2', from: 'elnath', to: 'gamma' },
      { id: 'horn-3', from: 'gamma', to: 'omega' },
      { id: 'jaw-1', from: 'aldebaran', to: 'theta' },
      { id: 'jaw-2', from: 'theta', to: 'lambda' },
      { id: 'body-1', from: 'lambda', to: 'rho' },
      { id: 'leg', from: 'ain', to: 'sigma1' }
    ],
    priority: ['aldebaran', 'ain', 'elnath', 'prima', 'theta', 'gamma', 'lambda', 'sigma1', 'rho', 'omega']
  },
  {
    id: 'scorpius',
    name: 'Thần Nông',
    description: 'Bọ cạp: thân hình cong với ngôi sao đỏ Antares ở tim và chiếc đuôi vòng lên.',
    subjectHint: 'Thiên văn · Ngữ văn (thần thoại)',
    sky: 'Nam bán cầu · đêm mùa hạ',
    stars: [
      { id: 'antares', x: 460, y: 300, label: 'Tâm Bò Cạp', priority: 1, brightness: 1 },
      { id: 'graffias', x: 20, y: 20, label: 'Đầu', priority: 2, brightness: 0.7 },
      { id: 'dschubba', x: 20, y: 480, label: '', priority: 3, brightness: 0.6 },
      { id: 'sargas', x: 960, y: 480, label: 'Đuôi Giữa', priority: 4, brightness: 0.75 },
      { id: 'shaula', x: 520, y: 580, label: 'Ngòi Đuôi', priority: 5, brightness: 0.9 },
      { id: 'lesath', x: 960, y: 180, label: '', priority: 6, brightness: 0.5 },
      { id: 'tau', x: 460, y: 120, label: '', priority: 7, brightness: 0.5 },
      { id: 'epsilon', x: 960, y: 320, label: '', priority: 8, brightness: 0.45 },
      { id: 'acrab', x: 20, y: 600, label: '', priority: 9, brightness: 0.4 },
      { id: 'kappa', x: 960, y: 580, label: '', priority: 10, brightness: 0.35 }
    ],
    edges: [
      { id: 'head-1', from: 'acrab', to: 'graffias' },
      { id: 'head-2', from: 'graffias', to: 'dschubba' },
      { id: 'claw', from: 'dschubba', to: 'antares' },
      { id: 'body-1', from: 'antares', to: 'tau' },
      { id: 'body-2', from: 'tau', to: 'epsilon' },
      { id: 'body-3', from: 'epsilon', to: 'sargas' },
      { id: 'tail-1', from: 'sargas', to: 'shaula' },
      { id: 'tail-2', from: 'shaula', to: 'lesath' },
      { id: 'tail-3', from: 'lesath', to: 'kappa' }
    ],
    priority: ['antares', 'graffias', 'dschubba', 'sargas', 'shaula', 'lesath', 'tau', 'epsilon', 'acrab', 'kappa']
  },
  {
    id: 'andromeda',
    name: 'Tiên Nữ',
    description: 'Công chúa Andromeda trải dài thành chuỗi sao, nối vào hình vuông của Phi Mã.',
    subjectHint: 'Thiên văn · Ngữ văn (thần thoại)',
    sky: 'Bắc bán cầu · đêm mùa thu',
    stars: [
      { id: 'alpheratz', x: 60, y: 460, label: 'Góc Phi Mã', priority: 1, brightness: 0.9 },
      { id: 'delta', x: 60, y: 300, label: 'Thân', priority: 2, brightness: 0.8 },
      { id: 'mirach', x: 520, y: 300, label: 'Đai', priority: 3, brightness: 0.85 },
      { id: 'almach', x: 960, y: 300, label: 'Bàn Chân', priority: 4, brightness: 0.9 },
      { id: 'mu', x: 520, y: 460, label: '', priority: 5, brightness: 0.5 },
      { id: 'beta', x: 960, y: 40, label: '', priority: 6, brightness: 0.5 },
      { id: 'gamma', x: 60, y: 60, label: '', priority: 7, brightness: 0.45 },
      { id: 'theta', x: 500, y: 40, label: '', priority: 8, brightness: 0.4 },
      { id: 'sigma', x: 520, y: 580, label: '', priority: 9, brightness: 0.35 },
      { id: 'upsilon', x: 60, y: 580, label: '', priority: 10, brightness: 0.3 }
    ],
    edges: [
      { id: 'chain-1', from: 'alpheratz', to: 'delta' },
      { id: 'chain-2', from: 'delta', to: 'mirach' },
      { id: 'chain-3', from: 'mirach', to: 'almach' },
      { id: 'square-1', from: 'alpheratz', to: 'upsilon' },
      { id: 'square-2', from: 'upsilon', to: 'mu' },
      { id: 'square-3', from: 'mu', to: 'sigma' },
      { id: 'square-4', from: 'sigma', to: 'delta' },
      { id: 'arm-1', from: 'mirach', to: 'beta' },
      { id: 'arm-2', from: 'beta', to: 'gamma' },
      { id: 'arm-3', from: 'delta', to: 'theta' }
    ],
    priority: ['alpheratz', 'delta', 'mirach', 'almach', 'mu', 'beta', 'gamma', 'theta', 'sigma', 'upsilon']
  }
];

export const CONSTELLATION_TEMPLATE_IDS = CONSTELLATION_TEMPLATES.map(template => template.id);

/** Used whenever an id is unknown. Never an error. */
export const DEFAULT_CONSTELLATION: string = CONSTELLATION_TEMPLATES[0].id;

/**
 * The figure a game plays when it never chose one ("để tự động" in the setup).
 *
 * A game saved before #171 always carries an id (its old picture is mapped), so
 * this only reaches a game created without a choice — including every game that
 * did not opt into the constellation board at all, whose pairs are ordinary
 * "left ↔ right" rows. Orion is the figure a classroom recognises first.
 */
export const AUTO_CONSTELLATION: string = 'orion';

/**
 * Short captions for a star, for the SVG thumbnail and the projector list.
 * "Bắc Đẩu 1" … "Sao 10": four characters keeps ten labels inside a thumbnail,
 * and the caption is only ever a hint — the lesson text stays in the DOM.
 */
export function constellationStarCaption(star: ConstellationStar, index: number): string {
  const label = String((star && star.label) || '');
  return label ? `${label} ${index + 1}` : `Sao ${index + 1}`;
}

/**
 * Old connection-template ids → the constellation that looks closest to them
 * (DECISIONS #171). A game saved before this change opens on a recognisable
 * figure instead of an arbitrary one; nothing is rewritten on disk.
 *
 * `solar-system` is the default picture of the old mode (a bright centre with
 * objects around it), so it maps to Orion, the figure a classroom recognises
 * first.
 */
export const LEGACY_CONNECTION_MAP: Record<string, string> = {
  'knowledge-network': 'ursa-major',
  bridge: 'andromeda',
  'solar-system': 'orion',
  circuit: 'scorpius',
  ecosystem: 'cygnus',
  timeline: 'taurus',
  geometry: 'lyra'
};

/** Old connection ids, for the adapter and the gallery. */
export const LEGACY_CONNECTION_TEMPLATE_IDS = Object.keys(LEGACY_CONNECTION_MAP);

/** The constellation an old connection id was mapped to (or `''`). */
export function mapLegacyTemplate(oldId: unknown): string {
  const key = typeof oldId === 'string' ? oldId.trim() : '';
  return LEGACY_CONNECTION_MAP[key] || '';
}

/**
 * Resolve a saved id. A constellation id wins, an old connection id is mapped,
 * and anything else (`null`, an id this build does not ship) falls back to the
 * default — never an error.
 *
 * ABSENT is different from unknown: a `null`/`undefined`/empty id means "this
 * game never chose a constellation", so the "để tự động" pick is used instead of
 * forcing the default figure on every game that did not opt in.
 */
export function constellationTemplate(id: unknown): ConstellationTemplate {
  const key = typeof id === 'string' ? id.trim() : '';
  if (!key) return constellationTemplate(AUTO_CONSTELLATION);
  const found = CONSTELLATION_TEMPLATES.find(template => template.id === key);
  if (found) return found;
  const mapped = mapLegacyTemplate(key);
  const legacy = mapped ? CONSTELLATION_TEMPLATES.find(template => template.id === mapped) : null;
  return legacy || CONSTELLATION_TEMPLATES[0];
}

/** True only for a constellation id this build ships. */
export function isConstellationId(id: unknown): boolean {
  return typeof id === 'string' && CONSTELLATION_TEMPLATE_IDS.indexOf(id) !== -1;
}

/**
 * True when the id names anything this build can play: a constellation, or an
 * old connection template (which is mapped). The adapter stores both, so a file
 * written by the previous build is preserved rather than silently rewritten.
 */
export function isConstellationTemplateId(id: unknown): boolean {
  return isConstellationId(id) || mapLegacyTemplate(id) !== '';
}

/** A drag direction from outside → a valid one (default `left-to-right`). */
export function resolveDragDirection(value: unknown): ConstellationDragDirection {
  return value === 'right-to-left' ? 'right-to-left' : DEFAULT_DRAG_DIRECTION;
}

/**
 * Pick the stars a board of `n` pairs lights up.
 *
 * - The first `min(n, stars)` entries of `priority` win, so the figure is drawn
 *   from its body outward and stays recognisable at 2 stars.
 * - Stars are returned in `priority` order and every id is used once.
 * - `n` is clamped to `CONSTELLATION_STAR_MAX`; a constellation never has fewer
 *   than `CONSTELLATION_STAR_MIN` stars, so `n < 2` still returns a playable
 *   fragment for a 1-pair board (the progression then spreads its one stage).
 */
export function selectConstellationStars(template: ConstellationTemplate | string | null | undefined, count: unknown): ConstellationStar[] {
  return selectStars(resolveConstellation(template), count);
}

function selectStars(template: ConstellationTemplate, count: unknown): ConstellationStar[] {
  const byId = new Map(template.stars.map(star => [star.id, star]));
  const ordered = template.priority
    .map(id => byId.get(id))
    .filter((star): star is ConstellationStar => Boolean(star));
  // Any star the priority list forgot is appended, so the count is never short.
  for (const star of template.stars) {
    if (!ordered.some(entry => entry.id === star.id)) ordered.push(star);
  }
  // A missing count is a caller bug, not a small board: it resolves to the
  // documented minimum (`null` must be caught before `Number(null)` turns it into
  // a real 0). A real small count (0 or 1) is respected.
  const numeric = count === null || count === '' ? NaN : Number(count);
  const asked = Number.isFinite(numeric) && numeric >= 0 ? Math.max(1, Math.round(numeric)) : CONSTELLATION_STAR_MIN;
  const wanted = Math.min(CONSTELLATION_STAR_MAX, asked);
  return ordered.slice(0, Math.min(wanted, ordered.length));
}

/** The links between two stars that both made the board. */
export function selectConstellationLinks(template: ConstellationTemplate | string | null | undefined, starIds: readonly string[]): ConstellationEdge[] {
  const chosen = new Set(starIds);
  return constellationTemplate(template && typeof template === 'object' ? template.id : template).edges
    .filter(edge => chosen.has(edge.from) && chosen.has(edge.to));
}

export interface ResolvedConstellation {
  /** The chosen stars, in priority order. */
  stars: ConstellationStar[];
  /** Links whose both ends are chosen. */
  links: ConstellationEdge[];
  /** Links that exist in the figure but leave the chosen subset (not drawn). */
  pendingLinks: ConstellationEdge[];
  /** Star ids in the figure not on this board. */
  extraStars: ConstellationStar[];
}

/** Everything the surfaces need for one board, computed once. */
export function selectConstellation(template: ConstellationTemplate | string | null | undefined, pairCount: unknown): ResolvedConstellation {
  const resolved = resolveConstellation(template);
  const stars = selectStars(resolved, pairCount);
  const chosen = new Set(stars.map(star => star.id));
  const links: ConstellationEdge[] = [];
  const pendingLinks: ConstellationEdge[] = [];
  for (const edge of resolved.edges) {
    const a = chosen.has(edge.from);
    const b = chosen.has(edge.to);
    if (a && b) links.push(edge);
    else if (a || b) pendingLinks.push(edge);
  }
  const extraStars = resolved.stars.filter(star => !chosen.has(star.id));
  return { stars, links, pendingLinks, extraStars };
}

function resolveConstellation(template: ConstellationTemplate | string | null | undefined): ConstellationTemplate {
  if (template && typeof template === 'object' && Array.isArray((template as ConstellationTemplate).stars)) {
    return template as ConstellationTemplate;
  }
  return constellationTemplate(template);
}

/**
 * A constellation as the template shape the existing progression understands:
 * one stage per star. The stage ids are `star-<starId>`, which keeps them unique
 * per board and lets every surface map a stage back to a star with one split.
 *
 * This is the ONLY bridge between the new picture and `connection-progress.ts` /
 * `connection-core.ts`; the two progression modules stay untouched (DECISIONS
 * #171: no third copy of the rules).
 */
export function constellationTemplateShape(template: ConstellationTemplate | string | null | undefined, pairCount: unknown): {
  id: string;
  name: string;
  description: string;
  subjectHint: string;
  nodes: Array<{ id: string; x: number; y: number; label: string; kind: 'dot' }>;
  edges: Array<{ id: string; from: string; to: string }>;
  stages: Array<{ id: string; label: string; edgeIds: string[]; nodeIds: string[] }>;
} {
  const resolved = resolveConstellation(template);
  const picked = selectConstellation(resolved, pairCount);
  const stageOf = new Map<string, string>();
  const stages = picked.stars.map((star, index) => {
    const id = constellationStageId(star.id, index);
    stageOf.set(star.id, id);
    // The first star also carries every link that reaches into the subset from
    // outside it (a "pending" link), so one star alone still shows its place in
    // the figure instead of floating with nothing around it.
    const leading = index === 0 ? picked.pendingLinks.map(edge => edge.id) : [];
    return {
      id,
      label: star.label || `Sao ${index + 1}`,
      // A COPY: the plan pushes into the template it is given, and leading would
      // otherwise stay shared between every template built from the same data.
      edgeIds: leading.slice(),
      nodeIds: [star.id]
    };
  });
  // Every drawn link is claimed by the later stage of its two ends, so it
  // appears exactly when both stars exist — and only once.
  for (const edge of picked.links) {
    const a = stageOf.get(edge.from);
    const b = stageOf.get(edge.to);
    if (!a || !b) continue;
    const owner = stages[Math.max(stages.findIndex(stage => stage.id === a), stages.findIndex(stage => stage.id === b))];
    if (owner) owner.edgeIds.push(edge.id);
  }
  return {
    id: resolved.id,
    name: resolved.name,
    description: resolved.description,
    subjectHint: resolved.subjectHint,
    nodes: picked.stars.map(star => ({ id: star.id, x: star.x, y: star.y, label: star.label, kind: 'dot' as const })),
    edges: picked.links.map(edge => ({ id: edge.id, from: edge.from, to: edge.to })),
    stages
  };
}

/** The stage id of a star: stable across boards, unique within one. */
export function constellationStageId(starId: string, index: number): string {
  return `star-${index + 1}-${starId}`;
}

/** True when the id is a simple, in-box constellation id (structural check). */
export function validateConstellation(template: any): string[] {
  const problems: string[] = [];
  const fail = (message: string) => problems.push(message);
  if (!template || typeof template !== 'object') {
    fail('template is not an object');
    return problems;
  }
  if (typeof template.id !== 'string' || !template.id) fail('missing id');
  if (typeof template.name !== 'string' || !template.name) fail('missing name');
  if (typeof template.description !== 'string') fail('missing description');
  if (typeof template.subjectHint !== 'string') fail('missing subjectHint');

  const stars = Array.isArray(template.stars) ? template.stars : [];
  const edges = Array.isArray(template.edges) ? template.edges : [];
  const priority = Array.isArray(template.priority) ? template.priority : [];
  if (stars.length < CONSTELLATION_STAR_MIN) fail(`only ${stars.length} stars (need ${CONSTELLATION_STAR_MIN})`);
  // A figure must be able to fill every board length the gallery advertises.
  if (stars.length < CONSTELLATION_STAR_MAX) fail(`only ${stars.length} stars declared (need ${CONSTELLATION_STAR_MAX} for the longest board)`);
  if (!edges.length) fail('no edges');
  if (!priority.length) fail('no priority order');

  const starIds = new Set<string>();
  for (const star of stars) {
    if (!star || typeof star.id !== 'string' || !star.id) { fail('star without id'); continue; }
    if (starIds.has(star.id)) fail(`duplicate star id ${star.id}`);
    starIds.add(star.id);
    if (typeof star.x !== 'number' || !Number.isFinite(star.x) || star.x < 0 || star.x > CONSTELLATION_VIEWBOX.width) fail(`star ${star.id} x is outside the viewBox`);
    if (typeof star.y !== 'number' || !Number.isFinite(star.y) || star.y < 0 || star.y > CONSTELLATION_VIEWBOX.height) fail(`star ${star.id} y is outside the viewBox`);
    if (typeof star.label !== 'string') fail(`star ${star.id} has no label field`);
    if (!Number.isFinite(star.priority)) fail(`star ${star.id} has no priority`);
  }

  const edgeIds = new Set<string>();
  for (const edge of edges) {
    if (!edge || typeof edge.id !== 'string' || !edge.id) { fail('edge without id'); continue; }
    if (edgeIds.has(edge.id)) fail(`duplicate edge id ${edge.id}`);
    edgeIds.add(edge.id);
    if (!starIds.has(edge.from)) fail(`edge ${edge.id} starts at an unknown star`);
    if (!starIds.has(edge.to)) fail(`edge ${edge.id} ends at an unknown star`);
    if (edge.from === edge.to) fail(`edge ${edge.id} connects a star to itself`);
  }

  const seen = new Set<string>();
  for (const id of priority) {
    if (!starIds.has(id)) fail(`priority lists unknown star ${id}`);
    if (seen.has(id)) fail(`priority lists star ${id} twice`);
    seen.add(id);
  }
  for (const id of starIds) {
    if (!seen.has(id)) fail(`star ${id} is missing from the priority order`);
  }
  return problems;
}
