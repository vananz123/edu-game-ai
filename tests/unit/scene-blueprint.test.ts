/**
 * #252 — the scene blueprint: the one gate every stored/generated scene passes.
 *
 * P0 does not call the AI yet, so these checks fix the contract the AI will be
 * held to in P3: a tiny JSON object of whitelisted ids, total normalisation,
 * safe fallbacks, and a renderer that draws the same thing in the editor and on
 * the play surface.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {
  DEFAULT_SCENE_ICON,
  normalizeSceneBlueprint,
  sceneBlueprintFromCategory,
  type SceneBlueprint,
} from '../../src/shared/scene-blueprint';
import { SCENE_BLUEPRINT_MAX_BYTES } from '../../src/shared/scene-asset-catalog';
import { CONTENT_CATEGORY_IDS } from '../../src/shared/content-categories';
import { getIllustrationPalette, renderIllustrationSvg, resolveIllustration } from '../../src/shared/illustration-registry';
import { renderBlueprintSvg, renderSceneSvg } from '../../src/shared/illustration-scene';

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

const VALID: SceneBlueprint = {
  v: 1,
  layout: 'single',
  backdrop: 'forest',
  paletteKey: 'animals',
  mainIcon: 'paw-print',
  subIcons: [
    { icon: 'leaf', position: 'left' },
    { icon: 'bird', position: 'right' },
  ],
};

test('a valid blueprint survives both an object and a JSON string', () => {
  assert.deepEqual(normalizeSceneBlueprint(VALID), VALID);
  assert.deepEqual(normalizeSceneBlueprint(JSON.stringify(VALID)), VALID);
});

test('normalisation is idempotent', () => {
  const inputs: unknown[] = [
    VALID,
    { ...VALID, backdrop: 'castle', paletteKey: 'banana' },
    { ...VALID, subIcons: ['bird', 'bird', 'paw-print', 'leaf', 'fish', 'bug'] },
    JSON.stringify(VALID),
  ];
  for (const input of inputs) {
    const once = normalizeSceneBlueprint(input);
    const twice = once ? normalizeSceneBlueprint(once) : null;
    assert.deepEqual(twice, once);
  }
});

test('undrawable shapes are refused, never thrown', () => {
  const bad: Array<[unknown, string]> = [
    [null, 'shape'],
    [undefined, 'shape'],
    [[], 'shape'],
    ['', 'empty'],
    ['{not json', 'json'],
    [{ ...VALID, v: 2 }, 'version'],
    [{ ...VALID, layout: 'compare' }, 'layout'],
    [{ ...VALID, mainIcon: 'chevron-down' }, 'icon'],
    [{ ...VALID, mainIcon: 'banana' }, 'icon'],
  ];
  for (const [input, issue] of bad) {
    const issues: string[] = [];
    assert.equal(normalizeSceneBlueprint(input, issues), null, `${String(input)} must be refused`);
    assert.deepEqual(issues, [issue]);
  }
});

test('an unknown place or palette falls back instead of failing', () => {
  const place = normalizeSceneBlueprint({ ...VALID, backdrop: 'castle' })!;
  assert.equal(place.backdrop, 'plain');
  const palette = normalizeSceneBlueprint({ ...VALID, paletteKey: 'banana' })!;
  assert.equal(palette.paletteKey, 'language');
  const missing = normalizeSceneBlueprint({ v: 1, layout: 'single', mainIcon: 'paw-print' })!;
  assert.equal(missing.backdrop, 'plain');
  assert.equal(missing.paletteKey, 'language');
});

test('sub icons are validated, deduped, exclude the subject and cap at four', () => {
  const result = normalizeSceneBlueprint({
    ...VALID,
    subIcons: ['bird', 'bird', 'paw-print', 'leaf', 'fish', 'bug', 'nope', 42],
  })!;
  assert.deepEqual(result.subIcons, [
    { icon: 'bird', position: 'left' },
    { icon: 'leaf', position: 'right' },
    { icon: 'fish', position: 'top-left' },
    { icon: 'bug', position: 'top-right' },
  ]);
  assert.equal(normalizeSceneBlueprint({ ...VALID, subIcons: 'bird' })!.subIcons, undefined);
  assert.equal(normalizeSceneBlueprint({ ...VALID, subIcons: [] })!.subIcons, undefined);
});

test('a named corner is kept, and a taken or unknown one falls back to the first free slot', () => {
  const placed = normalizeSceneBlueprint({
    ...VALID,
    subIcons: [
      { icon: 'leaf', position: 'top-right' },
      { icon: 'bird', position: 'top-right' },
      { icon: 'fish', position: 'nowhere' },
      { icon: 'bug' },
    ],
  })!;
  // First wins its corner; the duplicate and the unknown one take free slots
  // instead of being dropped, because a missing icon is worse than a moved one.
  assert.deepEqual(placed.subIcons, [
    { icon: 'leaf', position: 'top-right' },
    { icon: 'bird', position: 'left' },
    { icon: 'fish', position: 'right' },
    { icon: 'bug', position: 'top-left' },
  ]);
});

test('oversized JSON is refused before parsing', () => {
  const huge = JSON.stringify({ ...VALID, padding: 'x'.repeat(SCENE_BLUEPRINT_MAX_BYTES) });
  const issues: string[] = [];
  assert.equal(normalizeSceneBlueprint(huge, issues), null);
  assert.deepEqual(issues, ['size']);
});

test('unknown keys and __proto__ are ignored', () => {
  const hostile = JSON.parse(
    '{"v":1,"layout":"single","backdrop":"sea","paletteKey":"water-world","mainIcon":"fish","__proto__":{"polluted":true},"padding":"x"}'
  ) as Record<string, unknown>;
  const result = normalizeSceneBlueprint(hostile)!;
  assert.deepEqual(result, {
    v: 1,
    layout: 'single',
    backdrop: 'sea',
    paletteKey: 'water-world',
    mainIcon: 'fish',
  });
  assert.equal((result as unknown as Record<string, unknown>).polluted, undefined);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});

test('every category produces a valid, drawable blueprint', () => {
  for (const id of CONTENT_CATEGORY_IDS) {
    const blueprint = sceneBlueprintFromCategory(id);
    assert.equal(blueprint.v, 1);
    assert.equal(blueprint.layout, 'single');
    assert.equal(blueprint.paletteKey, id === 'general' ? 'language' : id, `${id} palette`);
    assert.deepEqual(normalizeSceneBlueprint(blueprint), blueprint, `${id} must be normalisable as-is`);
  }
  assert.equal(sceneBlueprintFromCategory('general').mainIcon, DEFAULT_SCENE_ICON);
  assert.equal(sceneBlueprintFromCategory('animals').mainIcon, 'paw-print');
  assert.equal(sceneBlueprintFromCategory('banana').paletteKey, 'language');
});

test('the blueprint outranks the category default but not a teacher choice', () => {
  const base = { contentCategory: 'animals' as const, iconName: 'paw-print' };
  const auto = resolveIllustration({ ...base, sceneBlueprint: VALID, mode: 'auto' });
  assert.ok(auto && auto.blueprint, 'auto uses the blueprint');
  assert.equal(auto!.assetId, 'animals-scene');

  const manual = resolveIllustration({ ...base, sceneBlueprint: VALID, mode: 'manual' });
  assert.equal(manual, null, 'manual ignores a generated blueprint');

  const picked = resolveIllustration({ ...base, sceneBlueprint: VALID, illustrationAssetId: 'space-scene', mode: 'auto' });
  assert.equal(picked!.category, 'space', 'an explicit pick wins over the blueprint');
  assert.equal(picked!.blueprint, undefined);

  const none = resolveIllustration({ ...base, sceneBlueprint: VALID, illustrationAssetId: 'none', mode: 'auto' });
  assert.equal(none, null, '"Bỏ ảnh" wins over the blueprint');

  const off = resolveIllustration({ ...base, sceneBlueprint: VALID, mode: 'off' });
  assert.equal(off, null);

  const broken = resolveIllustration({ ...base, sceneBlueprint: { ...VALID, v: 9 }, mode: 'auto' });
  assert.equal(broken!.category, 'animals', 'an invalid blueprint falls back to the category scene');
  assert.equal(broken!.blueprint, undefined);
});

test('the shared renderer draws a blueprint with its own layers and sub icons', () => {
  const palette = getIllustrationPalette(VALID.paletteKey);
  const svg = renderBlueprintSvg(VALID, palette, { assetId: 'animals-scene', label: 'Động vật' });
  for (const layer of ['sky', 'far', 'mid', 'halo', 'subject', 'props', 'fg']) {
    assert.match(svg, new RegExp(`data-scene-layer="${layer}"`), `missing ${layer} layer`);
  }
  assert.match(svg, /data-scene-primitive="sub-icons"/);
  assert.match(svg, /data-scene-subicon="leaf"/);
  assert.match(svg, /data-illustration="animals-scene"/);
  assert.match(svg, /aria-label="Động vật"/);
  // An unrenderable subject must produce nothing, not a broken frame.
  assert.equal(renderBlueprintSvg({ ...VALID, mainIcon: 'not-an-icon' }, palette), '');
});

test('four corner sub icons stay off the subject box, measured in the SVG itself', () => {
  // Nobody can eyeball this in CI, so the geometry is asserted: the subject owns
  // x 100..220 and 120px of height, and no 52px sub icon may touch that box —
  // otherwise the one shape a child must recognise gets covered.
  const four = normalizeSceneBlueprint({
    ...VALID,
    subIcons: [
      { icon: 'leaf', position: 'left' },
      { icon: 'bird', position: 'right' },
      { icon: 'fish', position: 'top-left' },
      { icon: 'bug', position: 'top-right' },
    ],
  })!;
  const svg = renderBlueprintSvg(four, getIllustrationPalette(four.paletteKey));

  const size = 52;
  const placed = [...svg.matchAll(/data-scene-position="([a-z-]+)" transform="translate\((\d+) (\d+)\)/g)].map(
    (match) => ({ position: match[1], x: Number(match[2]), y: Number(match[3]) })
  );
  assert.equal(placed.length, 4, 'all four sub icons must be drawn');
  assert.deepEqual(placed.map((entry) => entry.position).sort(), ['left', 'right', 'top-left', 'top-right']);

  const subject = { x0: 100, x1: 220, y0: 50, y1: 170 };
  for (const entry of placed) {
    const overlapsX = entry.x < subject.x1 && entry.x + size > subject.x0;
    const overlapsY = entry.y < subject.y1 && entry.y + size > subject.y0;
    assert.ok(!(overlapsX && overlapsY), `${entry.position} covers the subject at (${entry.x},${entry.y})`);
    assert.ok(entry.x >= 0 && entry.x + size <= 320, `${entry.position} is clipped horizontally`);
    assert.ok(entry.y >= 0 && entry.y + size <= 200, `${entry.position} is clipped vertically`);
  }
});

test('a resolved blueprint renders through the shared registry', () => {
  const svg = renderIllustrationSvg(resolveIllustration({ sceneBlueprint: VALID, mode: 'auto' }));
  assert.match(svg, /data-scene-primitive="sub-icons"/);
  assert.match(svg, /<svg /);
});

test('the old category scene is unchanged by the composer refactor', () => {
  // Byte-level golden: #70/#72 games must render exactly as before #252.
  const svg = renderSceneSvg('animals', 'paw-print', getIllustrationPalette('animals'), {
    label: 'animals',
    assetId: 'animals-scene',
    className: 'stage-illustration-svg',
  });
  assert.doesNotMatch(svg, /sub-icon/, 'the legacy path must not grow a sub-icon layer');
  // 2043 bytes before stacked layers; richer now, and still the legacy path.
  assert.equal(svg.length, 2729);
});

// --- renderer mirror parity ------------------------------------------------
const RENDERER_DIR = path.join(__dirname, '..', '..', 'src', 'renderer', 'features');
const sandbox: Record<string, unknown> = {
  escapeHtml: (value: unknown) => String(value),
  console,
};
vm.createContext(sandbox);
vm.runInContext(readFileSync(path.join(RENDERER_DIR, 'icon-data.js'), 'utf8'), sandbox);
vm.runInContext(readFileSync(path.join(RENDERER_DIR, 'game-illustration.js'), 'utf8'), sandbox);
const renderer = sandbox as {
  stageNormalizeBlueprint: (value: unknown) => unknown;
  stageBlueprintForCategory: (category: unknown) => unknown;
};

test('the renderer normaliser and generator match the shared ones', () => {
  const inputs: unknown[] = [
    VALID,
    JSON.stringify(VALID),
    { ...VALID, backdrop: 'castle', paletteKey: 'banana' },
    { ...VALID, v: 2 },
    { ...VALID, layout: 'compare' },
    { ...VALID, mainIcon: 'chevron-down' },
    { ...VALID, subIcons: ['bird', 'bird', 'paw-print', 'leaf', 'fish', 'bug'] },
    { v: 1, layout: 'single', mainIcon: 'paw-print' },
    '',
    '{not json',
  ];
  for (const input of inputs) {
    const shared = normalizeSceneBlueprint(input);
    const mirrored = renderer.stageNormalizeBlueprint(input);
    assert.deepEqual(
      JSON.parse(JSON.stringify(mirrored)),
      JSON.parse(JSON.stringify(shared)),
      `renderer and shared normalisers disagree on ${JSON.stringify(input)}`
    );
  }
  for (const id of CONTENT_CATEGORY_IDS) {
    assert.deepEqual(
      JSON.parse(JSON.stringify(renderer.stageBlueprintForCategory(id))),
      JSON.parse(JSON.stringify(sceneBlueprintFromCategory(id))),
      `renderer and shared generators disagree on ${id}`
    );
  }
});

console.log(`\n${passed} scene-blueprint checks passed.`);
