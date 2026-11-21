/* #294 free placement: a teacher may drag any drawn node, and the blueprint
 * stores a NORMALISED centre (0..1) plus a scale — never pixels, never markup.
 *
 * Two properties matter and are pinned here:
 *   1. a blueprint WITHOUT `freePos` draws exactly as before (every golden hash in
 *      illustration-registry.test.ts still passes, and this file proves the moved
 *      case is the only one that changes);
 *   2. a blueprint WITH `freePos` is clamped, layout-filtered and idempotent, so a
 *      corrupt file can never push art off the frame.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SCENE_FREE_POS_MAX_SCALE,
  SCENE_FREE_POS_MIN_SCALE,
  SCENE_BLUEPRINT_MAX_BYTES,
} from '../../src/shared/scene-asset-catalog';
import { normalizeSceneBlueprint } from '../../src/shared/scene-blueprint';
import {
  SCENE_HEIGHT,
  SCENE_WIDTH,
  SCENE_SUBJECT_SIZE,
  renderBlueprintSvg,
  sceneNodeSlots,
} from '../../src/shared/illustration-scene';
import { getIllustrationPalette } from '../../src/shared/illustration-registry';

const BASE = { v: 1, layout: 'single', backdrop: 'meadow', paletteKey: 'animals', mainIcon: 'paw-print' };
const PALETTE = getIllustrationPalette('animals');

function draw(blueprint: any): string {
  const clean = normalizeSceneBlueprint(blueprint);
  assert.ok(clean, 'blueprint should normalise');
  return renderBlueprintSvg(clean as any, PALETTE, { label: 'x', assetId: 'x', className: 'scene' });
}

test('#294 a blueprint without freePos keeps the derived geometry', () => {
  const clean = normalizeSceneBlueprint({ ...BASE }) as any;
  assert.equal(clean.freePos, undefined, 'no freePos key is invented');
  const svg = draw(BASE);
  const left = Math.round((SCENE_WIDTH - SCENE_SUBJECT_SIZE) / 2);
  assert.ok(
    svg.includes(`translate(${left}`),
    'the subject is still drawn at the derived left edge'
  );
  assert.ok(!svg.includes('scale(1)'), 'no scale transform is emitted for an untouched scene');
});

test('#294 a hand-placed subject moves and scales, and its shadow follows', () => {
  const moved = draw({ ...BASE, freePos: { subject: { x: 0.25, y: 0.4, s: 1.2 } } });
  assert.ok(moved.includes('scale(1.2)'), 'the scale is applied');
  const cx = Math.round(0.25 * SCENE_WIDTH);
  const cy = Math.round(0.4 * SCENE_HEIGHT);
  assert.ok(moved.includes(`translate(${cx} ${cy})`), 'the subject is translated to the new centre');
  // #277 all over again: a shadow left behind points at empty ground.
  const shadow = /data-scene-shadow="subject" cx="(\d+)"/.exec(moved);
  assert.ok(shadow, 'the subject still casts a shadow');
  assert.equal(Number(shadow![1]), cx, 'the shadow sits under the dragged subject');
});

test('#294 freePos is clamped, layout-filtered and idempotent', () => {
  const issues: string[] = [];
  const clean = normalizeSceneBlueprint(
    {
      ...BASE,
      freePos: {
        subject: { x: 3, y: -2, s: 99 },
        'step-2': { x: 0.5, y: 0.5, s: 1 }, // a single scene draws no steps
        'around-1': { x: 0.5, y: 0.5, s: 1 }, // ... and no ring
        prop: { x: 0.5, y: 0.5, s: 1 }, // not a key at all
        bogus: 'nope',
      },
    },
    issues
  ) as any;
  assert.ok(clean);
  assert.deepEqual(clean.freePos, { subject: { x: 1, y: 0, s: SCENE_FREE_POS_MAX_SCALE } });
  assert.ok(issues.includes('freePos'), 'refused keys are reported, not silently kept');
  const again = normalizeSceneBlueprint(clean) as any;
  assert.deepEqual(again.freePos, clean.freePos, 'normalising twice changes nothing');
});

test('#294 the scale floor holds and a bad number is dropped', () => {
  const clean = normalizeSceneBlueprint({
    ...BASE,
    freePos: { subject: { x: 0.5, y: 0.5, s: 0.01 } },
  }) as any;
  assert.equal(clean.freePos.subject.s, SCENE_FREE_POS_MIN_SCALE);
  const dropped = normalizeSceneBlueprint({
    ...BASE,
    freePos: { subject: { x: 'left', y: 0.5, s: 1 } },
  }) as any;
  assert.equal(dropped.freePos, undefined, 'a non-numeric centre drops the entry');
});

test('#294 a fully hand-placed scene still fits the size budget', () => {
  const blueprint = {
    v: 1,
    layout: 'compare',
    backdrop: 'classroom',
    paletteKey: 'math',
    mainIcon: 'calculator',
    compareIcon: 'ruler',
    compareSign: 'greater-than',
    subIcons: ['leaf', 'star'],
    props: ['apple', 'box'],
    freePos: {
      subject: { x: 0.18, y: 0.44, s: 1.25 },
      second: { x: 0.72, y: 0.44, s: 1.25 },
      sign: { x: 0.5, y: 0.42, s: 1 },
      'sub-0': { x: 0.1, y: 0.12, s: 1.1 },
      'sub-1': { x: 0.9, y: 0.12, s: 1.1 },
      'prop-0': { x: 0.08, y: 0.9, s: 1 },
      'prop-1': { x: 0.92, y: 0.9, s: 1 },
    },
  };
  const clean = normalizeSceneBlueprint(blueprint) as any;
  assert.ok(clean, 'the teacher\'s edits survive');
  const bytes = JSON.stringify(clean).length;
  assert.ok(bytes <= SCENE_BLUEPRINT_MAX_BYTES, `fully placed scene is ${bytes} bytes`);
});

test('#294 the editor handles sit where the art is, for every layout', () => {
  const single = normalizeSceneBlueprint({ ...BASE }) as any;
  const singleSlots = sceneNodeSlots(single);
  assert.deepEqual(singleSlots.map((slot) => slot.key), ['subject']);
  assert.equal(singleSlots[0].size, SCENE_SUBJECT_SIZE);
  assert.equal(singleSlots[0].scale, 1);

  const compare = normalizeSceneBlueprint({
    ...BASE,
    layout: 'compare',
    compareIcon: 'leaf',
    compareSign: 'equal',
  }) as any;
  assert.deepEqual(sceneNodeSlots(compare).map((slot) => slot.key), ['subject', 'second', 'sign']);

  const process = normalizeSceneBlueprint({ ...BASE, layout: 'process', steps: ['leaf'] }) as any;
  assert.deepEqual(sceneNodeSlots(process).map((slot) => slot.key), ['step-1', 'step-2']);

  const surround = normalizeSceneBlueprint({ ...BASE, layout: 'surround', around: ['leaf', 'star'] }) as any;
  assert.deepEqual(sceneNodeSlots(surround).map((slot) => slot.key), ['subject', 'around-1', 'around-2']);

  // A hand-placed node's handle must report the hand-placed box, not the default.
  const placed = normalizeSceneBlueprint({ ...BASE, freePos: { subject: { x: 0.3, y: 0.5, s: 1.4 } } }) as any;
  const slot = sceneNodeSlots(placed)[0];
  assert.equal(slot.scale, 1.4);
  assert.equal(slot.x, Math.round(0.3 * SCENE_WIDTH - slot.size / 2));
});
