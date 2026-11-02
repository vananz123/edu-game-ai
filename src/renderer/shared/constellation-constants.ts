// @ts-nocheck -- classic renderer script; constants only, no DOM (DECISIONS #171).
/*
 * Constellation constants for the renderer.
 *
 * The renderer is plain global scripts and cannot `import` a TypeScript module,
 * so the values the setup gallery and the play surface need live here. They are
 * MIRRORS of `src/shared/constellation-templates.ts`, which stays the single
 * source of truth; `constellation-parity.test.ts` compares this file with the
 * typed module and fails the unit suite on any difference.
 *
 * Load order: this script runs BEFORE `renderer/shared.js` (index.html), because
 * the library card and the wizard read these names during their first render —
 * the same trap the connection constants documented in #168.
 */
const CONSTELLATION_VIEWBOX = { width: 1000, height: 620 };
const CONSTELLATION_STAR_MIN = 2;
const CONSTELLATION_STAR_MAX = 10;

/*
 * What a label may be before it stops being a 3D label.
 *
 * A destination side of 24 characters or fewer is drawn on the star itself; a
 * longer one becomes an HTML card outside the scene, because a caption that
 * small cannot be read from the back row (the floor is 22 CSS px per glyph and
 * the 3D layer NEVER shrinks below it — it moves to an HTML chip instead).
 */
const CONSTELLATION_SHORT_LABEL_MAX = 24;
const CONSTELLATION_LABEL_MIN_PX = 22;

const CONSTELLATION_TEMPLATE_IDS = [
  'ursa-major',
  'orion',
  'cygnus',
  'lyra',
  'taurus',
  'scorpius',
  'andromeda'
];
const DEFAULT_CONSTELLATION = 'ursa-major';
// The figure a game plays when it never chose one ("để tự động"); see
// `AUTO_CONSTELLATION` in the shared module. A game saved before #171 always
// carries an id, so this only reaches a board that was never configured.
const AUTO_CONSTELLATION = 'orion';

const CONSTELLATION_DRAG_DIRECTIONS = ['left-to-right', 'right-to-left'];
const DEFAULT_DRAG_DIRECTION = 'left-to-right';

/* Display names (DECISIONS #171). One place per name: the play surface, the
 * wizard, the editor and the library card all read these, so a rename is one
 * edit and cannot leave a stray "Kết nối vật thể" behind. */
const CONSTELLATION_GAME_NAME = 'Chòm sao tri thức';
const CONSTELLATION_DRAG_LABELS = {
  'left-to-right': 'Trái → phải (sao giữ nghĩa gốc, thẻ kéo giữ nghĩa nối)',
  'right-to-left': 'Phải → trái (sao giữ nghĩa nối, thẻ kéo giữ nghĩa gốc)'
};
