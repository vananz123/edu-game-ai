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
  'hills', 'mountains', 'skyline', 'sea', 'line',
  'trees', 'bushes', 'towers', 'bubbles', 'graph',
  'books', 'flasks', 'tools',
  'grass', 'roots', 'stones', 'boards', 'waves', 'none',
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
  assert.equal(SCENE_BACKDROP_IDS.length, 10, 'P0 ships ten named places');
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

test('the icon whitelist is concrete, unique and registered', () => {
  assert.equal(new Set(SCENE_ICON_IDS).size, SCENE_ICON_IDS.length, 'duplicate icon ids');
  for (const name of SCENE_ICON_IDS) {
    assert.ok(ICON_NAMES.includes(name), `${name} is not a registry icon`);
    assert.ok(isIconName(name));
    assert.equal(isSceneIconId(name), true);
  }
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

// --- renderer drift guard --------------------------------------------------
const RENDERER_SOURCE = readFileSync(
  path.join(__dirname, '..', '..', '..', 'src', 'renderer', 'features', 'game-illustration.ts'),
  'utf8'
);

function rendererObjectBody(name: string): string {
  const start = RENDERER_SOURCE.indexOf(`const ${name} = {`);
  assert.ok(start >= 0, `${name} is missing from the renderer`);
  const end = RENDERER_SOURCE.indexOf('\n};', start);
  return RENDERER_SOURCE.slice(start, end === -1 ? undefined : end);
}

test('the renderer backdrop table matches the shared catalog', () => {
  const body = rendererObjectBody('STAGE_SCENE_BACKDROPS');
  type Parsed = { sky: string[]; horizon: string[]; standing: string[]; fg: string[]; subjectY: number };
  const parsed: Record<string, Parsed> = {};
  const names = (text: string): string[] => [...text.matchAll(/'([a-z]+)'/g)].map((x) => x[1]);
  // Parse one table row at a time; a layer is a single name or a bracketed list.
  for (const line of body.split('\n')) {
    const row = /^\s*(?:'([a-z-]+)'|([a-z-]+)):\s*\{(.*)\}\s*,?\s*$/.exec(line);
    if (!row) continue;
    const entry = row[3];
    const grab = (slot: string): string[] => {
      const mm = new RegExp(slot + ":\\s*(\\[[^\\]]*\\]|'[a-z]+')").exec(entry);
      return mm ? names(mm[1]) : [];
    };
    const y = /subjectY:\s*(\d+)/.exec(entry);
    parsed[row[1] || row[2]] = {
      sky: grab('sky'),
      horizon: grab('horizon'),
      standing: grab('standing'),
      fg: grab('fg'),
      subjectY: y ? Number(y[1]) : 0,
    };
  }
  const listOf = (value: unknown): string[] =>
    Array.isArray(value) ? value.map(String) : [String(value)];
  const expected: Record<string, Parsed> = {};
  for (const [id, spec] of Object.entries(SCENE_BACKDROPS)) {
    expected[id] = {
      sky: listOf(spec.sky),
      horizon: listOf(spec.horizon),
      standing: listOf(spec.standing),
      fg: listOf(spec.fg),
      subjectY: spec.subjectY,
    };
  }
  assert.deepEqual(parsed, expected);
});

test('the renderer icon whitelist matches the shared catalog', () => {
  const body = RENDERER_SOURCE.slice(
    RENDERER_SOURCE.indexOf('const STAGE_SCENE_ICON_IDS = ['),
    RENDERER_SOURCE.indexOf('];', RENDERER_SOURCE.indexOf('const STAGE_SCENE_ICON_IDS = ['))
  );
  const parsed = [...body.matchAll(/'([a-z0-9-]+)'/g)].map((match) => match[1]);
  assert.deepEqual(parsed, [...SCENE_ICON_IDS]);
});

console.log(`\n${passed} scene-catalog checks passed.`);
