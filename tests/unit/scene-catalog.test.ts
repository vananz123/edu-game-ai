/**
 * #252 — the fixed vocabulary a scene blueprint may use.
 *
 * The point of these checks is the safety argument: a blueprint is only ever
 * ids, every id resolves to something the renderer already draws, and the
 * renderer's hand-maintained copy cannot drift from the shared catalog.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  CATEGORY_BACKDROPS,
  DEFAULT_SCENE_BACKDROP,
  SCENE_BACKDROP_IDS,
  SCENE_BACKDROPS,
  SCENE_ICON_IDS,
  SCENE_PALETTE_KEYS,
  getBackdropSpec,
  isSceneBackdropId,
  isSceneIconId,
  isScenePaletteKey,
  sceneBackdropForCategory,
} from '../../src/shared/scene-asset-catalog';
import { CONTENT_CATEGORY_IDS, getCategoryIcon } from '../../src/shared/content-categories';
import { ILLUSTRATION_ASSET_IDS, ILLUSTRATION_CATEGORY_IDS } from '../../src/shared/illustration-registry';
import { EMOJI_ART } from '../../src/shared/emoji-art.generated';
import { ICON_NAMES, isIconName } from '../../src/shared/icon-registry';
import { SCENE_HORIZON } from '../../src/shared/illustration-scene';

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

const PRIMITIVES = new Set([
  'sun', 'moon', 'rays', 'stars', 'clouds',
  'hills', 'mountains', 'skyline', 'sea', 'line', 'road',
  'trees', 'bushes', 'towers', 'bubbles', 'graph',
  'books', 'flasks', 'tools', 'traffic-light', 'sign', 'streetlight',
  'blackboard', 'desks', 'shelves', 'labbench', 'counter',
  'grass', 'roots', 'stones', 'boards', 'waves', 'zebra', 'kerb', 'rack', 'basket', 'none',
]);

test('palette keys are exactly the 24 categories that own a palette', () => {
  assert.equal(SCENE_PALETTE_KEYS.length, 24);
  assert.deepEqual([...SCENE_PALETTE_KEYS], [...ILLUSTRATION_CATEGORY_IDS]);
  assert.deepEqual(
    [...SCENE_PALETTE_KEYS],
    CONTENT_CATEGORY_IDS.filter((id) => id !== 'general'),
    'the palette list must be every category except general, in the same order'
  );
  for (const key of SCENE_PALETTE_KEYS) {
    assert.ok(ILLUSTRATION_ASSET_IDS.includes(`${key}-scene`), `${key} has no illustration asset`);
    assert.ok(isScenePaletteKey(key));
  }
  assert.equal(isScenePaletteKey('general'), false, 'general has no palette and must be rejected');
  assert.equal(isScenePaletteKey('banana'), false);
  assert.equal(isScenePaletteKey(null), false);
});

test('every backdrop is an existing set of scene layers', () => {
  assert.ok(SCENE_BACKDROP_IDS.includes(DEFAULT_SCENE_BACKDROP));
  // P0 shipped ten; #288 added `road` — the first place whose ground is
  // infrastructure rather than scenery.
  assert.equal(SCENE_BACKDROP_IDS.length, 12, 'the catalogue ships twelve named places');
  for (const id of SCENE_BACKDROP_IDS) {
    const spec = SCENE_BACKDROPS[id];
    assert.equal(isSceneBackdropId(id), true);
    for (const slot of ['sky', 'horizon', 'standing', 'fg'] as const) {
      const value = spec[slot];
      const names = Array.isArray(value) ? value : [value];
      assert.ok(names.length > 0, `${id}.${slot} is empty`);
      for (const name of names) {
        assert.ok(PRIMITIVES.has(name), `${id}.${slot} = ${name} is not a scene primitive`);
      }
    }
    assert.ok(spec.subjectY > 70 && spec.subjectY < SCENE_HORIZON, `${id} subject is not above the horizon`);
    assert.equal(getBackdropSpec(id), spec);
  }
  assert.equal(isSceneBackdropId('castle'), false);
  assert.equal(getBackdropSpec('castle'), SCENE_BACKDROPS[DEFAULT_SCENE_BACKDROP]);
  assert.equal(getBackdropSpec(42), SCENE_BACKDROPS[DEFAULT_SCENE_BACKDROP]);
});

test('every content category maps to a known backdrop', () => {
  assert.equal(sceneBackdropForCategory('general'), DEFAULT_SCENE_BACKDROP);
  for (const id of CONTENT_CATEGORY_IDS) {
    assert.ok(isSceneBackdropId(sceneBackdropForCategory(id)), `${id} backdrop is unknown`);
  }
  assert.equal(Object.keys(CATEGORY_BACKDROPS).length, CONTENT_CATEGORY_IDS.length);
  assert.equal(isSceneBackdropId(sceneBackdropForCategory('banana')), true, 'unknown categories stay safe');
});

test('the icon whitelist is concrete, unique and drawable', () => {
  // The contract is DRAWABLE, not "registered with Lucide". Since #281 the art is
  // Twemoji and since #285 the catalogue carries concepts Lucide 1.61 has no node
  // for (`frog`, `butterfly` — checked, they are missing from that version). An id
  // with art but no Lucide node still renders on every surface, so the Lucide node
  // is a fallback, not a requirement.
  assert.equal(new Set(SCENE_ICON_IDS).size, SCENE_ICON_IDS.length, 'duplicate icon ids');
  for (const name of SCENE_ICON_IDS) {
    assert.ok(
      ICON_NAMES.includes(name) || Object.prototype.hasOwnProperty.call(EMOJI_ART, name),
      `${name} is neither a registry icon nor a scene art id`
    );
    assert.equal(isSceneIconId(name), true, `${name} is in the catalogue but isSceneIconId rejects it`);
  }
  // A typo must still fail: the catalogue set is the only gate.
  assert.equal(isSceneIconId('eggg'), false);
  for (const id of CONTENT_CATEGORY_IDS) {
    const icon = getCategoryIcon(id);
    if (!icon) continue;
    assert.ok(SCENE_ICON_IDS.includes(icon), `${id}'s icon ${icon} must be drawable in a scene`);
  }
  assert.ok(SCENE_ICON_IDS.includes('book-open'), 'the #89 fallback subject must be available');
  // Chrome icons are valid registry ids but are not subjects.
  assert.equal(isSceneIconId('chevron-down'), false);
  assert.equal(isSceneIconId('banana'), false);
  assert.equal(isSceneIconId(null), false);
});

// --- renderer wiring (#272) ------------------------------------------------
// Before #272 the renderer kept a hand-written copy of these two tables and
// these tests compared the copy with the original. The copy is gone: the
// renderer now loads `renderer/shared/scene-runtime.js`, an esbuild IIFE over
// `src/shared/scene-runtime.ts`. So the invariant changed from "the two copies
// agree" to "there is only one copy, and the generated bundle really exposes
// it" — which is strictly stronger, because a missing bundle now fails here
// instead of quietly drifting later.
const RENDERER_SOURCE = readFileSync(
  path.join(__dirname, '..', '..', '..', 'src', 'renderer', 'features', 'game-illustration.ts'),
  'utf8'
);
const BUNDLE = path.join(__dirname, '..', '..', '..', 'dist', 'src', 'renderer', 'shared', 'scene-runtime.js');

function loadSceneRuntime(): Record<string, any> {
  const vm = require('node:vm');
  const sandbox: Record<string, any> = { console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(BUNDLE, 'utf8'), sandbox);
  assert.ok(sandbox.SceneRuntime, 'the bundle must publish the SceneRuntime global');
  return sandbox.SceneRuntime;
}

test('the renderer carries no second copy of the scene tables', () => {
  for (const gone of ['STAGE_SCENE_BACKDROPS', 'STAGE_SCENE_ICON_IDS', 'STAGE_SCENE_LAYOUTS']) {
    assert.equal(
      RENDERER_SOURCE.includes(gone),
      false,
      `${gone} is back in the renderer — the vocabulary must come from SceneRuntime`
    );
  }
  assert.ok(RENDERER_SOURCE.includes('SceneRuntime.'), 'the renderer must read the shared bundle');
});

test('the bundled scene runtime exposes the same vocabulary as the catalog', () => {
  const runtime = loadSceneRuntime();
  assert.deepEqual([...runtime.SCENE_ICON_IDS], [...SCENE_ICON_IDS], 'icon ids differ in the bundle');
  for (const id of SCENE_BACKDROP_IDS) {
    const bundled = runtime.getBackdropSpec(id);
    const shared = getBackdropSpec(id);
    assert.deepEqual(
      JSON.parse(JSON.stringify(bundled)),
      JSON.parse(JSON.stringify(shared)),
      `${id} backdrop differs in the bundle`
    );
  }
  for (const value of ['castle', 'banana', '', null]) {
    assert.equal(runtime.isSceneBackdropId(value), isSceneBackdropId(value), `isSceneBackdropId(${String(value)})`);
  }
  for (const id of SCENE_ICON_IDS) {
    assert.equal(runtime.isSceneIconId(id), true, `${id} must be a scene icon in the bundle`);
  }
  assert.equal(runtime.isSceneIconId('chevron-down'), false);
});

console.log(`\n${passed} scene-catalog checks passed.`);
