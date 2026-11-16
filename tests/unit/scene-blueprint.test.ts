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
  sceneBlueprintJson,
  type SceneBlueprint,
} from '../../src/shared/scene-blueprint';
import { SCENE_BLUEPRINT_MAX_BYTES, SCENE_ICON_IDS } from '../../src/shared/scene-asset-catalog';
import { CONTENT_CATEGORY_IDS } from '../../src/shared/content-categories';
import { getIllustrationPalette, renderIllustrationSvg, resolveIllustration } from '../../src/shared/illustration-registry';
import { renderBlueprintSvg, renderSceneSvg } from '../../src/shared/illustration-scene';
import { renderIconSvg } from '../../src/shared/icon-registry';

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
    { ...VALID, props: ['apple', 'apple', 'paw-print', 'leaf', 'fish', 'bug', 42] },
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
    [{ ...VALID, layout: 'side-by-side' }, 'layout'],
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

test('ground props are cleaned, capped at two, and never repeat the subject or a sub icon', () => {
  const result = normalizeSceneBlueprint({
    ...VALID,
    props: ['apple', 'apple', 'paw-print', 'leaf', 'fish', 'bug', 'nope', 7],
  })!;
  // `paw-print` is the subject and `leaf` is a sub icon, so neither may come back.
  assert.deepEqual(result.props, ['apple', 'fish']);
  assert.equal(normalizeSceneBlueprint({ ...VALID, props: 'apple' })!.props, undefined);
  assert.equal(normalizeSceneBlueprint({ ...VALID, props: [] })!.props, undefined);
  // Idempotent: feeding the output back keeps exactly one copy of each.
  assert.deepEqual(normalizeSceneBlueprint(result)!.props, ['apple', 'fish']);
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
  const placed = [...svg.matchAll(/data-scene-position="([a-z-]+)"[^>]*transform="translate\((\d+) (\d+)\)/g)].map(
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

test('ground props are drawn beside the subject, never over it, and inside the frame', () => {
  const scene = normalizeSceneBlueprint({ ...VALID, subIcons: [], props: ['apple', 'fish'] })!;
  const svg = renderBlueprintSvg(scene, getIllustrationPalette(scene.paletteKey));
  assert.match(svg, /data-scene-primitive="ground-props"/);

  const placed = [...svg.matchAll(/data-scene-position="ground-(left|right)" transform="translate\((\d+) (\d+)\)/g)].map(
    (match) => ({ side: match[1], x: Number(match[2]), y: Number(match[3]) })
  );
  assert.deepEqual(placed.map((entry) => entry.side), ['left', 'right']);
  const size = 40;
  const subject = { x0: 100, x1: 220, y0: 50, y1: 170 };
  for (const entry of placed) {
    const overlapsX = entry.x < subject.x1 && entry.x + size > subject.x0;
    const overlapsY = entry.y < subject.y1 && entry.y + size > subject.y0;
    assert.ok(!(overlapsX && overlapsY), `ground-${entry.side} covers the subject at (${entry.x},${entry.y})`);
    assert.ok(entry.x >= 0 && entry.x + size <= 320, `ground-${entry.side} is clipped horizontally`);
    assert.ok(entry.y >= 0 && entry.y + size <= 200, `ground-${entry.side} is clipped vertically`);
  }
  // A blueprint without props must not grow a ground-props group.
  const plain = normalizeSceneBlueprint(VALID)!;
  assert.ok(!renderBlueprintSvg(plain, getIllustrationPalette(plain.paletteKey)).includes('ground-props'));
});

// --- #266 people: a scene about "who" must be able to show a who -------------
test('the three person icons are selectable everywhere a scene expects an icon', () => {
  for (const person of ['user', 'graduation-cap', 'hard-hat']) {
    assert.ok(SCENE_ICON_IDS.includes(person), `${person} must be in the shared whitelist`);
    const drawn = renderIconSvg(person, { size: 120, className: 'stage-illustration-icon' });
    assert.ok(drawn && drawn.includes('<'), `${person} must draw, not vanish`);
    // The knowledge worth pinning: a person is a *subject*, so it has to survive
    // the normalizer as mainIcon, as compareIcon and as a ground prop.
    const main = normalizeSceneBlueprint({ v: 1, layout: 'single', mainIcon: person })!;
    assert.equal(main.mainIcon, person, `${person} must survive as mainIcon`);
    const second = normalizeSceneBlueprint({ v: 1, layout: 'compare', mainIcon: 'book-open', compareIcon: person })!;
    assert.equal(second.compareIcon, person, `${person} must survive as compareIcon`);
    const prop = normalizeSceneBlueprint({ v: 1, layout: 'single', mainIcon: 'book-open', props: [person] })!;
    assert.deepEqual(prop.props, [person], `${person} must survive as a ground prop`);
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

// --- #262 compare: two subjects, one sign ----------------------------------
const COMPARE: SceneBlueprint = {
  v: 1,
  layout: 'compare',
  backdrop: 'forest',
  paletteKey: 'animals',
  mainIcon: 'paw-print',
  compareIcon: 'fish',
  compareSign: 'greater-than',
};

test('a compare blueprint keeps both subjects and its sign', () => {
  const issues: string[] = [];
  const scene = normalizeSceneBlueprint(COMPARE, issues)!;
  assert.equal(scene.layout, 'compare');
  assert.equal(scene.mainIcon, 'paw-print');
  assert.equal(scene.compareIcon, 'fish');
  assert.equal(scene.compareSign, 'greater-than');
  assert.deepEqual(issues, [], 'a valid compare scene must not report issues');
});

test('a compare scene without a usable second subject degrades to one subject', () => {
  for (const bad of [undefined, '', 'chevron-down', 'paw-print']) {
    const issues: string[] = [];
    const scene = normalizeSceneBlueprint({ ...COMPARE, compareIcon: bad }, issues)!;
    assert.equal(scene.layout, 'single', `compareIcon=${String(bad)} must degrade`);
    assert.equal(scene.compareIcon, undefined);
    assert.ok(issues.includes('compareIcon'), 'the fallback must be observable');
    assert.equal(scene.mainIcon, 'paw-print', 'the left subject is never lost');
  }
});

test('an unknown comparison sign is dropped, not the scene', () => {
  const issues: string[] = [];
  const scene = normalizeSceneBlueprint({ ...COMPARE, compareSign: '>>' }, issues)!;
  assert.equal(scene.layout, 'compare');
  assert.equal(scene.compareIcon, 'fish');
  assert.equal(scene.compareSign, undefined);
  assert.ok(issues.includes('compareSign'));

  const noSign = normalizeSceneBlueprint({ ...COMPARE, compareSign: undefined })!;
  assert.equal(noSign.layout, 'compare', 'two subjects with no sign is a valid picture');
  assert.equal(noSign.compareSign, undefined);
});

test('a single-layout blueprint never carries compare fields', () => {
  const issues: string[] = [];
  const scene = normalizeSceneBlueprint(
    { ...VALID, compareIcon: 'fish', compareSign: 'equal' },
    issues
  )!;
  assert.equal(scene.layout, 'single');
  assert.equal(scene.compareIcon, undefined);
  assert.equal(scene.compareSign, undefined);
  assert.ok(issues.includes('compare'), 'dropping the fields must be observable');
});

test('no extra icon may reuse either subject in a compare scene', () => {
  const scene = normalizeSceneBlueprint({
    ...COMPARE,
    subIcons: ['fish', { icon: 'paw-print', position: 'left' }, 'leaf'],
    props: ['fish', 'paw-print', 'apple'],
  })!;
  assert.deepEqual(scene.subIcons?.map((sub) => sub.icon), ['leaf']);
  assert.deepEqual(scene.props, ['apple']);
});

test('normalising a compare scene twice changes nothing', () => {
  const once = normalizeSceneBlueprint({ ...COMPARE, subIcons: ['leaf'], props: ['apple'] })!;
  assert.deepEqual(normalizeSceneBlueprint(once), once);
  assert.deepEqual(normalizeSceneBlueprint(JSON.stringify(once)), once);
});

test('the richest compare scene still fits the byte budget', () => {
  const scene = normalizeSceneBlueprint({
    ...COMPARE,
    subIcons: [
      { icon: 'leaf', position: 'left' },
      { icon: 'bird', position: 'right' },
      { icon: 'bug', position: 'top-left' },
      { icon: 'star', position: 'top-right' },
    ],
    props: ['apple', 'box'],
  })!;
  assert.equal(scene.subIcons?.length, 4);
  assert.equal(scene.props?.length, 2);
  const bytes = sceneBlueprintJson(scene).length;
  assert.ok(bytes <= SCENE_BLUEPRINT_MAX_BYTES, `compare blueprint is ${bytes} bytes`);
});

/** Pull every box a compare scene drew, from the SVG itself (#262). */
function sceneBoxes(svg: string) {
  const subjects = [...svg.matchAll(/data-scene-subject="([a-z]+)" data-scene-size="(\d+)" transform="translate\((\d+) (\d+)\)/g)].map(
    (match) => ({ name: match[1], size: Number(match[2]), x: Number(match[3]), y: Number(match[4]) })
  );
  const sign = svg.match(/data-scene-sign="([a-z-]*)" data-scene-size="(\d+)" transform="translate\((\d+) (\d+)\)/);
  const icons = [...svg.matchAll(/data-scene-position="([a-z-]+)"[^>]*data-scene-size="(\d+)"[^>]*transform="translate\((\d+) (\d+)\)/g)].map(
    (match) => ({ position: match[1], size: Number(match[2]), x: Number(match[3]), y: Number(match[4]) })
  );
  const steps = [...svg.matchAll(/data-scene-step="(\d+)" data-scene-size="(\d+)" transform="translate\((\d+) (\d+)\)/g)].map(
    (match) => ({ step: Number(match[1]), size: Number(match[2]), x: Number(match[3]), y: Number(match[4]) })
  );
  // #270: the ring is geometry too.
  const around = [...svg.matchAll(/data-scene-around="(\d+)" data-scene-position="([a-z-]+)" data-scene-size="(\d+)" transform="translate\((\d+) (\d+)\)/g)].map(
    (match) => ({ index: Number(match[1]), position: match[2], size: Number(match[3]), x: Number(match[4]), y: Number(match[5]) })
  );
  // #267: the arrows are geometry too — a parity check that ignores them would
  // pass while one composer pointed its arrow at the wrong gap.
  const arrows = [...svg.matchAll(/data-scene-arrow="(\d+)" d="M(\d+) (\d+)h(\d+)/g)].map(
    (match) => ({ index: Number(match[1]), x: Number(match[2]), y: Number(match[3]), length: Number(match[4]) })
  );
  return {
    subjects,
    steps,
    around,
    arrows,
    icons: icons.filter((entry) => entry.position.startsWith('ground-') === false),
    props: icons.filter((entry) => entry.position.startsWith('ground-')),
    sign: sign
      ? { name: sign[1], size: Number(sign[2]), x: Number(sign[3]), y: Number(sign[4]) }
      : null,
  };
}

function boxesOverlap(a: { x: number; y: number; size: number }, b: { x: number; y: number; size: number }): boolean {
  return a.x < b.x + b.size && a.x + a.size > b.x && a.y < b.y + b.size && a.y + a.size > b.y;
}

const ALL_BACKDROPS = ['plain', 'meadow', 'forest', 'mountain', 'sea', 'stars', 'city', 'classroom', 'lab', 'studio'];

test('a compare scene draws two subjects that never touch each other', () => {
  for (const backdrop of ALL_BACKDROPS) {
    const scene = normalizeSceneBlueprint({ ...COMPARE, backdrop })!;
    const svg = renderBlueprintSvg(scene, getIllustrationPalette(scene.paletteKey));
    const { subjects } = sceneBoxes(svg);
    assert.deepEqual(subjects.map((box) => box.name), ['main', 'second'], `${backdrop}: both subjects`);
    const [left, right] = subjects;
    assert.ok(left.x + left.size <= right.x, `${backdrop}: subjects touch (${left.x + left.size} vs ${right.x})`);
    for (const box of subjects) {
      assert.ok(box.x >= 0 && box.x + box.size <= 320, `${backdrop}: ${box.name} is clipped horizontally`);
      assert.ok(box.y >= 0 && box.y + box.size <= 200, `${backdrop}: ${box.name} is clipped vertically`);
    }
  }
});

test('the comparison sign sits in the gap between the subjects, above the ground', () => {
  for (const backdrop of ALL_BACKDROPS) {
    for (const sign of ['greater-than', 'less-than', 'equal', undefined] as const) {
      const scene = normalizeSceneBlueprint({ ...COMPARE, backdrop, compareSign: sign })!;
      const svg = renderBlueprintSvg(scene, getIllustrationPalette(scene.paletteKey));
      const boxes = sceneBoxes(svg);
      const [left, right] = boxes.subjects;
      assert.ok(boxes.sign, `${backdrop}/${String(sign)}: the sign group must be emitted`);
      const glyph = boxes.sign!;
      assert.ok(glyph.x >= left.x + left.size, `${backdrop}/${String(sign)}: sign overlaps the left subject`);
      assert.ok(glyph.x + glyph.size <= right.x, `${backdrop}/${String(sign)}: sign overlaps the right subject`);
      assert.ok(glyph.y >= 0 && glyph.y + glyph.size <= 200, `${backdrop}/${String(sign)}: sign is clipped`);
      // The sign is drawn from shapes only: a font could not be relied on offline.
      assert.doesNotMatch(svg, /<text[\s>]/, 'the sign must not use <text>');
      if (sign === undefined) {
        assert.ok(!svg.includes('data-scene-primitive="compare-sign"'), 'no sign means no glyph');
      } else {
        assert.ok(svg.includes('data-scene-primitive="compare-sign"'), `${sign} must draw a glyph`);
      }
    }
  }
});

test('compare keeps both corner icons clear of both subjects on every backdrop', () => {
  for (const backdrop of ALL_BACKDROPS) {
    const scene = normalizeSceneBlueprint({
      ...COMPARE,
      backdrop,
      subIcons: [
        { icon: 'leaf', position: 'left' },
        { icon: 'bird', position: 'right' },
      ],
      props: ['apple'],
    })!;
    const svg = renderBlueprintSvg(scene, getIllustrationPalette(scene.paletteKey));
    const boxes = sceneBoxes(svg);
    assert.equal(boxes.icons.length, 2, `${backdrop}: both sub icons must still be drawn`);
    // The lower corners are where a subject now stands, so they are moved up.
    assert.deepEqual(boxes.icons.map((box) => box.position).sort(), ['top-left', 'top-right']);
    for (const icon of boxes.icons) {
      for (const subject of boxes.subjects) {
        assert.ok(!boxesOverlap(icon, subject), `${backdrop}: ${icon.position} covers the ${subject.name} subject`);
      }
      for (const prop of boxes.props) {
        assert.ok(!boxesOverlap(icon, prop), `${backdrop}: ${icon.position} covers a ground prop`);
      }
      assert.ok(icon.x >= 0 && icon.x + icon.size <= 320, `${backdrop}: ${icon.position} is clipped`);
      assert.ok(icon.y >= 0 && icon.y + icon.size <= 200, `${backdrop}: ${icon.position} is clipped`);
    }
    for (const prop of boxes.props) {
      for (const subject of boxes.subjects) {
        assert.ok(!boxesOverlap(prop, subject), `${backdrop}: a ground prop covers the ${subject.name} subject`);
      }
    }
  }
});

test('a single scene is untouched by compare: one subject, no sign layer', () => {
  const single = normalizeSceneBlueprint(VALID)!;
  const svg = renderBlueprintSvg(single, getIllustrationPalette(single.paletteKey));
  assert.ok(!svg.includes('data-scene-subject='), 'the single layout keeps its old markup');
  assert.ok(!svg.includes('data-scene-layer="sign"'), 'no sign layer in single');
});

// --- #267 process: a sequence, not a second picture ------------------------
const PROCESS: SceneBlueprint = {
  v: 1,
  layout: 'process',
  backdrop: 'meadow',
  paletteKey: 'plants',
  mainIcon: 'leaf',
  steps: ['apple', 'box'],
};

test('a process scene keeps its stages in the order they were given', () => {
  const issues: string[] = [];
  const scene = normalizeSceneBlueprint(PROCESS, issues)!;
  assert.equal(scene.layout, 'process');
  assert.equal(scene.mainIcon, 'leaf', 'mainIcon is stage 1');
  assert.deepEqual(scene.steps, ['apple', 'box'], 'stage order is the meaning');
  assert.deepEqual(issues, [], 'a valid process scene must not report issues');
});

test('a process scene without stages becomes one picture, not a broken strip', () => {
  for (const bad of [undefined, [], ['dragon'], ['leaf']]) {
    const issues: string[] = [];
    const scene = normalizeSceneBlueprint({ ...PROCESS, steps: bad }, issues)!;
    assert.equal(scene.layout, 'single', `steps=${JSON.stringify(bad)} must degrade`);
    assert.equal(scene.steps, undefined);
    assert.ok(issues.includes('steps'), 'the degradation must be observable');
    assert.equal(scene.mainIcon, 'leaf', 'the first stage is never lost');
  }
});

test('one bad stage is dropped and the rest still make a sequence', () => {
  const issues: string[] = [];
  const scene = normalizeSceneBlueprint({ ...PROCESS, steps: ['apple', 'dragon', 'box'] }, issues)!;
  assert.equal(scene.layout, 'process');
  assert.deepEqual(scene.steps, ['apple', 'box']);
  assert.ok(issues.includes('steps'), 'the dropped stage must be reported');
});

test('a process scene is three stages at most', () => {
  const issues: string[] = [];
  const scene = normalizeSceneBlueprint({ ...PROCESS, steps: ['apple', 'box', 'fish', 'bug'] }, issues)!;
  assert.deepEqual(scene.steps, ['apple', 'box']);
  assert.ok(issues.includes('steps'));
});

test('a process stage cannot be repeated or be the first stage', () => {
  const scene = normalizeSceneBlueprint({ ...PROCESS, steps: ['box', 'box'] })!;
  assert.deepEqual(scene.steps, ['box']);
});

test('single must not carry stages, and process must not carry compare fields', () => {
  const single = normalizeSceneBlueprint({ ...VALID, steps: ['box'] })!;
  assert.equal(single.layout, 'single');
  assert.equal(single.steps, undefined, 'a stored scene must not carry fields the engine ignores');
  const mixed = normalizeSceneBlueprint({ ...PROCESS, compareIcon: 'fish', compareSign: 'equal' })!;
  assert.equal(mixed.layout, 'process');
  assert.equal(mixed.compareIcon, undefined);
  assert.equal(mixed.compareSign, undefined);
});

test('process moves corner icons to the two upper corners', () => {
  // The left/right slots are exactly where stage 1 and stage 3 are drawn, so the
  // normaliser moves them up instead of dropping them (#262's rule, reused).
  const scene = normalizeSceneBlueprint({
    ...PROCESS,
    subIcons: [{ icon: 'leaf', position: 'left' }, { icon: 'fish', position: 'right' }],
  }, [])!;
  const slots = (scene.subIcons || []).map((sub) => sub.position);
  assert.ok(slots.length >= 1);
  for (const slot of slots) assert.ok(['top-left', 'top-right'].includes(slot), `${slot} is not an upper corner`);
});

test('a stage is never reused as a corner icon or a ground prop', () => {
  const scene = normalizeSceneBlueprint({
    ...PROCESS,
    subIcons: [{ icon: 'apple', position: 'top-left' }],
    props: ['box', 'leaf'],
  }, [])!;
  assert.equal(scene.subIcons, undefined, 'a stage must not also sit in a corner');
  assert.equal(scene.props, undefined, 'a stage must not also stand on the ground');
});

test('process draws its stages in a measured row, above the ground props', () => {
  const boxes = (svg: string) => [
    ...svg.matchAll(/data-scene-step="(\d+)" data-scene-size="(\d+)" transform="translate\((\d+) (\d+)\)/g),
  ].map((match) => ({ step: Number(match[1]), size: Number(match[2]), x: Number(match[3]), y: Number(match[4]) }));
  const arrows = (svg: string) =>
    [...svg.matchAll(/data-scene-arrow="(\d+)" d="M(\d+) (\d+)h/g)].map((match) => ({
      index: Number(match[1]),
      x: Number(match[2]),
      y: Number(match[3]),
    }));
  const draw = (steps: string[]) =>
    renderBlueprintSvg({ ...PROCESS, steps }, getIllustrationPalette(PROCESS.paletteKey));

  const three = draw(['apple', 'box']);
  const threeSteps = boxes(three);
  assert.deepEqual(threeSteps.map((box) => box.x), [16, 122, 228], 'three stages split the width evenly');
  assert.deepEqual([...new Set(threeSteps.map((box) => box.y))], [66], 'one row, one height');
  assert.deepEqual([...new Set(threeSteps.map((box) => box.size))], [76], 'one size for every stage');
  assert.deepEqual(threeSteps.map((box) => box.step), [1, 2, 3], 'the order is the meaning');
  // Bottom must clear the ground props (y 146) and the top must clear the corner
  // band (y 6..46), or a stage would sit inside another element.
  for (const box of threeSteps) {
    assert.ok(box.y + box.size <= 146, `stage at ${box.x} overlaps the ground props`);
    assert.ok(box.y >= 50, `stage at ${box.x} climbs into the corner band`);
  }
  const threeArrows = arrows(three);
  assert.equal(threeArrows.length, 2, 'an arrow between stage 1-2 and 2-3');
  for (const arrow of threeArrows) {
    const gapStart = threeSteps[arrow.index - 1].x + 76;
    const gapEnd = threeSteps[arrow.index].x;
    assert.ok(arrow.x >= gapStart && arrow.x + 14 <= gapEnd, `arrow ${arrow.index} is not inside its gap`);
    assert.ok(arrow.y > 66 && arrow.y < 142, 'the arrow points at the middle of the row');
  }

  const two = draw(['box']);
  assert.deepEqual(boxes(two).map((box) => box.x), [48, 196], 'two stages are centred, not left-aligned');
  assert.equal(arrows(two).length, 1);

  // Corner icons hug the top of the frame in process, like compare: the left and
  // right slots would sit exactly on stage 1 and stage 3.
  const withCorners = renderBlueprintSvg(
    { ...PROCESS, steps: ['box'], subIcons: [{ icon: 'fish', position: 'top-left' }] },
    getIllustrationPalette(PROCESS.paletteKey)
  );
  const corners = sceneBoxes(withCorners).icons;
  assert.equal(corners.length, 1);
  assert.equal(corners[0].size, 40, 'process uses the smaller corner icons');
  assert.equal(corners[0].y, 6);
});

// --- #270 surround: a ring around one subject ------------------------------
const SURROUND: SceneBlueprint = {
  v: 1,
  layout: 'surround',
  backdrop: 'meadow',
  paletteKey: 'plants',
  mainIcon: 'leaf',
  around: ['apple', 'box', 'fish', 'bug'],
};

test('a surround scene keeps the ring order it was given', () => {
  const issues: string[] = [];
  const scene = normalizeSceneBlueprint(SURROUND, issues)!;
  assert.equal(scene.layout, 'surround');
  assert.equal(scene.mainIcon, 'leaf', 'the subject stays in the middle');
  assert.deepEqual(scene.around, ['apple', 'box', 'fish', 'bug'], 'ring order is the meaning');
  assert.equal(scene.subIcons, undefined);
  assert.deepEqual(issues, []);
});

test('a surround scene with an empty ring becomes one picture', () => {
  for (const bad of [undefined, [], ['dragon'], ['leaf']]) {
    const issues: string[] = [];
    const scene = normalizeSceneBlueprint({ ...SURROUND, around: bad }, issues)!;
    assert.equal(scene.layout, 'single', `around=${JSON.stringify(bad)} must degrade`);
    assert.equal(scene.around, undefined);
    assert.ok(issues.includes('around'), 'the degradation must be observable');
  }
});

test('one bad ring item is dropped and the rest still surround the subject', () => {
  const issues: string[] = [];
  const scene = normalizeSceneBlueprint({ ...SURROUND, around: ['apple', 'dragon', 'box', 'box', 'leaf'] }, issues)!;
  assert.equal(scene.layout, 'surround');
  assert.deepEqual(scene.around, ['apple', 'box'], 'unknown, duplicate and self are all dropped');
  assert.ok(issues.includes('around'));
});

test('a surround ring is four items at most', () => {
  const issues: string[] = [];
  const scene = normalizeSceneBlueprint(
    { ...SURROUND, around: ['apple', 'box', 'fish', 'bug', 'bird'] },
    issues
  )!;
  assert.deepEqual(scene.around, ['apple', 'box', 'fish', 'bug']);
  assert.ok(issues.includes('around'));
});

test('single must not carry a ring, and surround refuses corner icons', () => {
  const single = normalizeSceneBlueprint({ ...VALID, around: ['apple'] })!;
  assert.equal(single.around, undefined, 'a stored scene must not carry fields the engine ignores');
  // #270: the ring owns all four corners, so a sub-icon has nowhere to stand.
  const issues: string[] = [];
  const ring = normalizeSceneBlueprint(
    { ...SURROUND, subIcons: [{ icon: 'bird', position: 'top-left' }] },
    issues
  )!;
  assert.equal(ring.layout, 'surround');
  assert.equal(ring.subIcons, undefined, 'a sub-icon must not be pushed with no corner');
  assert.ok(issues.includes('subIcons'));
});

test('a ring item is never reused as a ground prop', () => {
  const scene = normalizeSceneBlueprint({ ...SURROUND, props: ['apple', 'leaf'] }, [])!;
  assert.equal(scene.props, undefined, 'a ring item must not also stand on the ground');
});

test('surround draws the subject in the middle and the ring in the four corners', () => {
  const ringBoxes = (svg: string) =>
    [...svg.matchAll(/data-scene-around="(\d+)" data-scene-position="([a-z-]+)" data-scene-size="(\d+)" transform="translate\((\d+) (\d+)\)/g)].map(
      (match) => ({
        index: Number(match[1]),
        position: match[2],
        size: Number(match[3]),
        x: Number(match[4]),
        y: Number(match[5]),
      })
    );
  const draw = (around: string[]) =>
    renderBlueprintSvg({ ...SURROUND, around }, getIllustrationPalette(SURROUND.paletteKey));

  const full = draw(['apple', 'box', 'fish', 'bug']);
  const ring = ringBoxes(full);
  assert.deepEqual(
    ring.map((item) => item.position),
    ['top-left', 'top-right', 'bottom-right', 'bottom-left'],
    'clockwise from the top-left corner'
  );
  assert.deepEqual(ring.map((item) => item.size), [48, 48, 48, 48]);
  assert.deepEqual(
    ring.map((item) => `${item.x},${item.y}`),
    ['28,10', '244,10', '244,96', '28,96']
  );

  const subject = sceneBoxes(full).subjects.filter((box) => box.name === 'main')[0];
  assert.equal(subject.size, 88, 'the surround subject is smaller so the ring fits');
  assert.deepEqual([subject.x, subject.y], [116, 52]);
  // Geometry must be true, not just documented: no ring item may touch the
  // subject box (x 116..204, y 52..140) or the ground props (y 146..186).
  for (const item of ring) {
    const overlapsSubject = item.x < subject.x + subject.size && item.x + item.size > subject.x &&
      item.y < subject.y + subject.size && item.y + item.size > subject.y;
    assert.ok(!overlapsSubject, `ring item ${item.position} overlaps the subject`);
    assert.ok(item.y + item.size <= 146, `ring item ${item.position} reaches the ground props`);
  }

  const three = ringBoxes(draw(['apple', 'box', 'fish']));
  assert.deepEqual(three.map((item) => item.position), ['top-left', 'top-right', 'bottom-right']);
});

// --- renderer wiring (#272) ------------------------------------------------
// Until #272 the renderer held its OWN copy of the normaliser and the drawing,
// and these tests compared the two copies. The copy is gone: `game-illustration`
// is now a thin adapter over `renderer/shared/scene-runtime.js`, the esbuild
// bundle of `src/shared/scene-runtime.ts`. So what is checked here changed from
// "the copies agree" to "the adapter wires the shared code up correctly" —
// right options, right palette, right frame — which is the only thing left that
// can be wrong.
const RENDERER_DIR = path.join(__dirname, '..', '..', 'src', 'renderer', 'features');
// __dirname is dist/tests/unit, so `../..` is dist/ — the compiled tree.
const RUNTIME_BUNDLE = path.join(__dirname, '..', '..', 'src', 'renderer', 'shared', 'scene-runtime.js');
const sandbox: Record<string, unknown> = {
  escapeHtml: (value: unknown) => String(value),
  console,
};
vm.createContext(sandbox);
// Load order mirrors `src/index.html`: icon data, then the scene runtime, then
// the adapter that reads it.
vm.runInContext(readFileSync(path.join(RENDERER_DIR, 'icon-data.js'), 'utf8'), sandbox);
vm.runInContext(readFileSync(RUNTIME_BUNDLE, 'utf8'), sandbox);
vm.runInContext(readFileSync(path.join(RENDERER_DIR, 'game-illustration.js'), 'utf8'), sandbox);
const renderer = sandbox as {
  stageNormalizeBlueprint: (value: unknown) => unknown;
  stageBlueprintForCategory: (category: unknown) => unknown;
  stageIllustrationHtml: (item: unknown, game: unknown) => string;
};

test('the renderer draws a compare scene with the same geometry as the shared one', () => {
  // Two implementations of the same picture exist for a real reason (the play
  // surface is a classic script). Parity of the *normaliser* was already checked;
  // this checks the drawing, which is where a duplicated geometry drifts.
  const cases: SceneBlueprint[] = [
    COMPARE,
    PROCESS,
    SURROUND,
    { ...SURROUND, around: ['apple'] },
    { ...SURROUND, around: ['apple', 'box'], props: ['fish'] },
    { ...PROCESS, steps: ['box'] },
    { ...PROCESS, steps: ['apple', 'box'], subIcons: [{ icon: 'fish', position: 'top-right' }], props: ['leaf'] },
    { ...COMPARE, compareSign: 'equal', subIcons: [{ icon: 'leaf', position: 'top-left' }] },
    { ...COMPARE, backdrop: 'sea', paletteKey: 'water-world', compareIcon: 'fish', mainIcon: 'waves-horizontal' },
    { ...COMPARE, compareSign: undefined, props: ['apple', 'box'] },
  ];
  for (const blueprint of cases) {
    const shared = renderBlueprintSvg(blueprint, getIllustrationPalette(blueprint.paletteKey));
    const html = renderer.stageIllustrationHtml({ sceneBlueprint: JSON.stringify(blueprint) }, {});
    assert.ok(html.includes('<svg'), 'the renderer must produce a frame');
    assert.deepEqual(
      sceneBoxes(html),
      sceneBoxes(shared),
      `renderer geometry differs for ${JSON.stringify(blueprint)}`
    );
  }
});

test('the renderer adapter draws a frame for every icon the catalogue offers', () => {
  // #272: one implementation, so this is no longer an equality test — it is the
  // coverage test that would have caught the old copy carrying a smaller icon set
  // than the shared registry (the class of bug the copy produced).
  const game = { gameSetup: { illustrationMode: 'auto' } };
  for (const icon of SCENE_ICON_IDS) {
    const html = renderer.stageIllustrationHtml({ iconName: icon, contentCategory: 'animals' }, game);
    assert.ok(html.includes('<svg'), `${icon} produced no frame`);
    assert.match(html, /^<div class="stage-illustration"/, `${icon} lost the frame wrapper`);
    assert.match(html, /data-illustration="animals-scene"/, `${icon} lost its asset id`);
  }
  // "Tắt" must still draw nothing at all: the switch lives in the adapter, so it
  // is the one rule a refactor could silently drop.
  assert.equal(
    renderer.stageIllustrationHtml({ iconName: 'leaf' }, { gameSetup: { illustrationMode: 'off' } }),
    ''
  );
  // A blueprint outranks the category icon and goes through the same composer.
  const blueprint = {
    v: 1, layout: 'surround', backdrop: 'meadow', paletteKey: 'plants',
    mainIcon: 'leaf', around: ['apple', 'box'],
  };
  const html = renderer.stageIllustrationHtml({ sceneBlueprint: JSON.stringify(blueprint) }, game);
  assert.equal((html.match(/data-scene-around=/g) || []).length, 2, 'the ring did not reach the frame');
});

test('the renderer normaliser and generator match the shared ones', () => {
  const inputs: unknown[] = [
    VALID,
    JSON.stringify(VALID),
    { ...VALID, backdrop: 'castle', paletteKey: 'banana' },
    { ...VALID, v: 2 },
    { ...VALID, layout: 'compare' },
    COMPARE,
    JSON.stringify(COMPARE),
    { ...COMPARE, compareIcon: 'paw-print' },
    { ...COMPARE, compareSign: 'banana' },
    { ...COMPARE, layout: 'side-by-side' },
    PROCESS,
    JSON.stringify(PROCESS),
    { ...PROCESS, steps: [] },
    { ...PROCESS, steps: ['apple', 'leaf', 'box', 'fish'] },
    { ...PROCESS, steps: ['dragon'] },
    { ...PROCESS, compareIcon: 'fish', compareSign: 'equal' },
    { ...PROCESS, subIcons: [{ icon: 'leaf', position: 'right' }], props: ['box'] },
    SURROUND,
    JSON.stringify(SURROUND),
    { ...SURROUND, around: [] },
    { ...SURROUND, around: ['dragon'] },
    { ...SURROUND, around: ['apple', 'box', 'fish', 'bug', 'bird'] },
    { ...SURROUND, subIcons: [{ icon: 'bird', position: 'top-left' }] },
    { ...COMPARE, subIcons: ['fish', 'leaf'] },
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
