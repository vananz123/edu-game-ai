/* #297 — the picture workshop: an object the teacher ADDS, and a node she TURNS.
 *
 * Two new optional parts of the blueprint, both proved total and idempotent here:
 *   - `freePos[key].r` — rotation in degrees, clamped to ±180;
 *   - `extras[]`       — objects with no layout slot: icon + centre + scale + angle.
 *
 * The property that matters for old data: a blueprint WITHOUT either key draws
 * exactly the bytes it always drew (the golden hashes in
 * illustration-registry.test.ts are untouched by this change), and adding an extra
 * never changes the layout.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SCENE_BLUEPRINT_MAX_BYTES,
  SCENE_EXTRA_SIZE,
  SCENE_FREE_POS_MAX_ROTATION,
  SCENE_MAX_EXTRAS,
} from '../../src/shared/scene-asset-catalog';
import { normalizeSceneBlueprint } from '../../src/shared/scene-blueprint';
import { renderBlueprintSvg, sceneNodeSlots } from '../../src/shared/illustration-scene';
import { getIllustrationPalette } from '../../src/shared/illustration-registry';

const BASE = {
  v: 1,
  layout: 'single',
  backdrop: 'meadow',
  paletteKey: 'animals',
  mainIcon: 'paw-print',
};
const PALETTE = getIllustrationPalette('animals');

function draw(blueprint: any): string {
  const clean = normalizeSceneBlueprint(blueprint);
  assert.ok(clean, 'blueprint should normalise');
  return renderBlueprintSvg(clean as any, PALETTE, { label: 'x', assetId: 'x', className: 'scene' });
}

test('#297 a rotation is clamped, rounded and idempotent', () => {
  const clean = normalizeSceneBlueprint({
    ...BASE,
    freePos: { subject: { x: 0.5, y: 0.5, s: 1, r: 900 } },
  }) as any;
  assert.equal(clean.freePos.subject.r, SCENE_FREE_POS_MAX_ROTATION);
  const straight = normalizeSceneBlueprint({
    ...BASE,
    freePos: { subject: { x: 0.5, y: 0.5, s: 1, r: 0 } },
  }) as any;
  assert.equal(straight.freePos.subject.r, undefined, 'a zero angle is not stored');
  const again = normalizeSceneBlueprint(clean) as any;
  assert.deepEqual(again.freePos, clean.freePos);
});

test('#297 a turned subject really turns in the SVG', () => {
  const svg = draw({ ...BASE, freePos: { subject: { x: 0.5, y: 0.5, s: 1, r: -30 } } });
  assert.ok(svg.includes('rotate(-30)'), 'the group carries the angle');
  const upright = draw({ ...BASE, freePos: { subject: { x: 0.5, y: 0.5, s: 1 } } });
  assert.ok(!upright.includes('rotate('), 'no rotation transform without an angle');
});

test('#297 an added object is stored, drawn and counted', () => {
  const clean = normalizeSceneBlueprint({
    ...BASE,
    extras: [{ icon: 'leaf', x: 0.24, y: 0.7, s: 1.2, r: 15 }],
  }) as any;
  assert.equal(clean.extras.length, 1);
  assert.deepEqual(clean.extras[0], { icon: 'leaf', x: 0.24, y: 0.7, s: 1.2, r: 15 });
  assert.equal(clean.layout, 'single', 'an added object never changes the layout');
  const svg = draw(clean);
  assert.ok(svg.includes('data-scene-extra="0"'), 'the object is drawn');
  assert.ok(svg.includes('stage-illustration-extra'), 'with its own class');
  const slot = sceneNodeSlots(clean).filter((item: any) => item.key === 'extra-0')[0];
  assert.ok(slot, 'the editor gets a handle for it');
  assert.equal(slot.size, SCENE_EXTRA_SIZE);
  assert.equal(slot.rotation, 15);
});

test('#297 bad objects are dropped, not drawn half-way', () => {
  const issues: string[] = [];
  const clean = normalizeSceneBlueprint(
    {
      ...BASE,
      extras: [
        { icon: 'not-an-icon', x: 0.5, y: 0.5, s: 1 },
        { icon: 'leaf', x: 'left', y: 0.5, s: 1 },
        'nope',
        { icon: 'star', x: 2, y: -1, s: 99 },
      ],
    },
    issues
  ) as any;
  assert.equal(clean.extras.length, 1, 'only the drawable one survives');
  assert.deepEqual(clean.extras[0], { icon: 'star', x: 1, y: 0, s: 1.6 });
  assert.ok(issues.includes('extras'), 'the refusal is reported');
});

test('#297 the number of added objects is capped', () => {
  const many = Array.from({ length: SCENE_MAX_EXTRAS + 4 }, (_v, index) => ({
    icon: 'leaf',
    x: 0.1 + index * 0.05,
    y: 0.5,
    s: 1,
  }));
  const clean = normalizeSceneBlueprint({ ...BASE, extras: many }) as any;
  assert.equal(clean.extras.length, SCENE_MAX_EXTRAS);
  // and the free-position keys follow the objects that survived
  const keys = sceneNodeSlots(clean).map((slot: any) => slot.key);
  assert.ok(keys.includes(`extra-${SCENE_MAX_EXTRAS - 1}`));
  assert.ok(!keys.includes(`extra-${SCENE_MAX_EXTRAS}`));
});

test('#297 a hand-built scene still fits the stored budget', () => {
  const blueprint = {
    ...BASE,
    layout: 'compare',
    compareIcon: 'ruler',
    compareSign: 'greater-than',
    subIcons: [{ icon: 'leaf', position: 'top-left' }],
    props: ['apple'],
    extras: Array.from({ length: SCENE_MAX_EXTRAS }, (_v, index) => ({
      icon: 'leaf',
      x: 0.1 + index * 0.12,
      y: 0.8,
      s: 1.1,
      r: 10,
    })),
    freePos: {
      subject: { x: 0.2, y: 0.45, s: 1.2, r: -10 },
      second: { x: 0.75, y: 0.45, s: 1.2, r: 10 },
    },
  };
  const clean = normalizeSceneBlueprint(blueprint) as any;
  const bytes = JSON.stringify(clean).length;
  assert.ok(bytes <= SCENE_BLUEPRINT_MAX_BYTES, `hand-built scene is ${bytes} bytes`);
});
