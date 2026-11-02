// @ts-nocheck -- star spacing is a drawing contract (DECISIONS #171).
/*
 * A constellation label sits BESIDE its star. For the reading surface to work,
 * two stars must be far enough apart that one label does not cover the next.
 *
 * The numbers below are measured on a real 1366x768 board (the tightest classroom
 * size): the drawn gap is predicted as `viewBox * 0.31 + 4` px in each axis — the
 * 3D layer's scale and its hit-box padding, both read off live boards — and a
 * label is ~120 x 22 px. This test therefore guards the DATA, the same way a
 * regression test guards the rules: a star moved for a nicer shape must not bring
 * two labels on top of each other.
 */
const assert = require('node:assert/strict');
const {
  CONSTELLATION_TEMPLATES,
  CONSTELLATION_STAR_MIN,
  CONSTELLATION_STAR_MAX,
  selectConstellation
} = require('../../src/shared/constellation-templates');

const LABEL_WIDTH_PX = 122;
const LABEL_HEIGHT_PX = 22;
const drawnPx = units => units * 0.31 + 4;

let checked = 0;
for (const template of CONSTELLATION_TEMPLATES) {
  for (let pairs = CONSTELLATION_STAR_MIN; pairs <= CONSTELLATION_STAR_MAX; pairs += 1) {
    const { stars } = selectConstellation(template.id, pairs);
    for (let i = 0; i < stars.length; i += 1) {
      for (let j = i + 1; j < stars.length; j += 1) {
        const dx = Math.abs(drawnPx(stars[i].x) - drawnPx(stars[j].x));
        const dy = Math.abs(drawnPx(stars[i].y) - drawnPx(stars[j].y));
        const overlapping = dx < LABEL_WIDTH_PX && dy < LABEL_HEIGHT_PX;
        assert.equal(
          overlapping,
          false,
          `${template.id} with ${pairs} pairs: ${stars[i].id} and ${stars[j].id} are ${Math.round(dx)}x${Math.round(dy)} px apart — a label cannot fit beside both`
        );
        checked += 1;
      }
    }
  }
}
assert.ok(checked > 300, `every pair of stars was checked (${checked})`);
console.log(`constellation-spacing: ${checked} star pairs keep room for a label on a 1366px board`);
