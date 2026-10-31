/**
 * Phase 5 — the play surface must honour `gameSetup.illustrationMode`
 * (docs/DECISIONS.md #62, #67).
 *
 * `illustrationMode` was saved by the editor (#65) but nothing consumed it, so a
 * teacher choosing "Tắt" still saw artwork. These tests pin the rules of
 * `resolveIllustration`, the single place the switch is honoured:
 *  - `off`    -> never draws, whatever the item says;
 *  - `manual` -> draws ONLY an illustration the teacher explicitly picked;
 *  - `auto`   -> the explicit pick, else the category default;
 *  - unknown / absent mode -> `auto`, so every game saved before #65 renders
 *    exactly as it did.
 * They also pin totality (never throws on hostile input) and that the artwork
 * is self-contained inline SVG, never a remote image.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_ILLUSTRATION_ASSET_ID,
  DEFAULT_ILLUSTRATION_CATEGORY,
  DEFAULT_ILLUSTRATION_ICON,
  ILLUSTRATION_ASSET_IDS,
  ILLUSTRATION_NONE_ID,
  getIllustrationPalette,
  isIllustrationAssetId,
  resolveIllustration,
  renderIllustrationSvg,
} from '../../src/shared/illustration-registry';
import { renderIconSvg } from '../../src/shared/icon-registry';
import { getCategoryIcon } from '../../src/shared/content-categories';
import { SCENE_HORIZON, SCENE_SUBJECT_SIZE, getSceneSpec, renderSceneSvg } from '../../src/shared/illustration-scene';

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

const ANIMAL = { contentCategory: 'animals', iconName: 'paw-print' };
const PICKED = { contentCategory: 'animals', iconName: 'paw-print', illustrationAssetId: 'space-scene' };

// --- mode: off -------------------------------------------------------------

test('off never draws, even with a picked illustration', () => {
  assert.equal(resolveIllustration({ ...PICKED, mode: 'off' }), null);
  assert.equal(resolveIllustration({ ...ANIMAL, mode: 'off' }), null);
});

// --- per-item opt-out (#153) -----------------------------------------------

test('the per-item opt-out draws nothing in every mode', () => {
  // "✕ Bỏ ảnh" in the editor writes this sentinel. '' would let `auto` invent the
  // topic picture again, which is the opposite of removing it.
  for (const mode of ['auto', 'manual', 'off', undefined, 'banana']) {
    assert.equal(resolveIllustration({ ...ANIMAL, illustrationAssetId: ILLUSTRATION_NONE_ID, mode }), null, String(mode));
    assert.equal(resolveIllustration({ contentCategory: 'general', illustrationAssetId: ILLUSTRATION_NONE_ID, mode }), null, String(mode));
  }
});

test('the opt-out is not an asset id and does not disturb the picked ones', () => {
  assert.equal(isIllustrationAssetId(ILLUSTRATION_NONE_ID), false);
  assert.equal(ILLUSTRATION_ASSET_IDS.includes(ILLUSTRATION_NONE_ID), false);
  assert.equal(resolveIllustration({ ...PICKED, mode: 'auto' })!.assetId, 'space-scene');
  // Clearing back to '' restores the auto behaviour the reset button promises.
  assert.ok(resolveIllustration({ ...ANIMAL, illustrationAssetId: '', mode: 'auto' }));
});

// --- mode: manual ----------------------------------------------------------

test('manual draws the picked illustration', () => {
  const resolved = resolveIllustration({ ...PICKED, mode: 'manual' });
  assert.ok(resolved);
  assert.equal(resolved!.assetId, 'space-scene');
  assert.equal(resolved!.category, 'space');
  assert.equal(resolved!.explicit, true);
});

test('manual does NOT invent an illustration from the category', () => {
  // This is the whole point of the mode: no picking, no artwork.
  assert.equal(resolveIllustration({ ...ANIMAL, mode: 'manual' }), null);
});

test('manual still draws an earlier explicit pick that it can resolve', () => {
  const resolved = resolveIllustration({ contentCategory: 'general', iconName: '', illustrationAssetId: 'food-scene', mode: 'manual' });
  assert.equal(resolved!.category, 'food');
});

// --- mode: auto ------------------------------------------------------------

test('auto prefers the picked illustration over the category', () => {
  const resolved = resolveIllustration({ ...PICKED, mode: 'auto' });
  assert.equal(resolved!.assetId, 'space-scene');
  assert.equal(resolved!.explicit, true);
});

test('auto falls back to the category illustration', () => {
  const resolved = resolveIllustration({ ...ANIMAL, mode: 'auto' });
  assert.equal(resolved!.assetId, 'animals-scene');
  assert.equal(resolved!.iconName, 'paw-print');
  assert.equal(resolved!.explicit, false);
});

test('auto draws the default scene for an item that carries no artwork at all', () => {
  // #89: this used to resolve to null, which left an EMPTY column on the play
  // surface. A blank half of a projected screen is a defect, so `auto` now
  // draws a real scene from the same fixed set.
  const resolved = resolveIllustration({ mode: 'auto' });
  assert.ok(resolved, 'an item with no artwork must still get a picture in auto');
  assert.equal(resolved!.assetId, DEFAULT_ILLUSTRATION_ASSET_ID);
  assert.equal(resolved!.category, DEFAULT_ILLUSTRATION_CATEGORY);
  assert.equal(resolved!.iconName, DEFAULT_ILLUSTRATION_ICON);
  assert.equal(resolved!.isDefault, true, 'callers must be able to tell it is the default');
  assert.equal(resolved!.explicit, false, 'the default is never the teacher\'s pick');

  // `general` and "no fields at all" are the same case: the default.
  const general = resolveIllustration({ contentCategory: 'general', mode: 'auto' });
  assert.equal(general!.assetId, DEFAULT_ILLUSTRATION_ASSET_ID);
  assert.equal(general!.isDefault, true);
});

test('the default illustration is a registered, renderable scene', () => {
  // It must not be a special case in the renderer: same id shape, same palette,
  // same scene composer as every other illustration.
  assert.ok(ILLUSTRATION_ASSET_IDS.includes(DEFAULT_ILLUSTRATION_ASSET_ID));
  assert.equal(DEFAULT_ILLUSTRATION_ASSET_ID, `${DEFAULT_ILLUSTRATION_CATEGORY}-scene`);
  assert.notEqual(DEFAULT_ILLUSTRATION_CATEGORY, 'general', 'general has no palette to draw with');
  assert.ok(getCategoryIcon(DEFAULT_ILLUSTRATION_CATEGORY), 'the fallback category must have a palette icon');
  assert.doesNotMatch(renderIllustrationSvg(resolveIllustration({ mode: 'auto' })), /<img|href="http/);
});

test('an unknown mode behaves as auto, so old games render unchanged', () => {
  const legacy = resolveIllustration(ANIMAL); // no mode at all
  assert.equal(legacy!.assetId, 'animals-scene');
  assert.equal(resolveIllustration({ ...ANIMAL, mode: 'banana' })!.assetId, 'animals-scene');
  assert.equal(resolveIllustration({ ...ANIMAL, mode: null })!.assetId, 'animals-scene');
});

test('allow:false suppresses the illustration', () => {
  assert.equal(resolveIllustration({ ...ANIMAL, mode: 'auto', allow: false }), null);
});

// --- totality --------------------------------------------------------------

test('hostile input never throws and always returns null', () => {
  const hostile: unknown[] = [null, undefined, 0, '', 'text', [], true, { contentCategory: 42 }, { iconName: {} }];
  for (const input of hostile) {
    assert.doesNotThrow(() => resolveIllustration(input as never));
  }
  assert.equal(resolveIllustration(null), null);
  assert.equal(resolveIllustration(undefined), null);
  assert.equal(resolveIllustration('nope' as never), null);
});

test('an unknown illustration id is not trusted', () => {
  assert.equal(resolveIllustration({ ...ANIMAL, illustrationAssetId: 'no-such-scene', mode: 'manual' }), null);
  assert.equal(isIllustrationAssetId('no-such-scene'), false);
  assert.ok(ILLUSTRATION_ASSET_IDS.length > 20);
});

// --- rendering -------------------------------------------------------------

test('the svg carries the resolved asset id and stays self-contained', () => {
  const svg = renderIllustrationSvg(resolveIllustration({ ...ANIMAL, mode: 'auto' }));
  assert.match(svg, /^<svg /);
  assert.match(svg, /data-illustration="animals-scene"/);
  assert.match(svg, /<\/svg>$/);
  assert.doesNotMatch(svg, /<img|href="http/, 'must be inline art, never a remote image');
});

test('nothing to draw renders an empty string, not a broken box', () => {
  assert.equal(renderIllustrationSvg(null), '');
  assert.equal(renderIllustrationSvg(undefined), '');
});

test('every category that resolves also renders', () => {
  for (const assetId of ILLUSTRATION_ASSET_IDS) {
    const svg = renderIllustrationSvg(resolveIllustration({ illustrationAssetId: assetId, mode: 'auto' }));
    assert.ok(svg.length > 0, `${assetId} resolved but rendered nothing`);
  }
});

test('the icon inside the illustration is a real registry icon', () => {
  const resolved = resolveIllustration({ ...ANIMAL, mode: 'auto' })!;
  assert.ok(renderIconSvg(resolved.iconName, { size: 72 }).length > 0);
});

// --- renderer drift guard --------------------------------------------------
// src/renderer/features/game-illustration.ts cannot import this module (classic
// <script>), so it keeps its own tables. These assertions are what keep the copy
// honest: without them a palette or icon edit here would silently desync the
// play surface from the shared contract.
const RENDERER_SOURCE = readFileSync(
  // Compiled to dist/tests/unit/, so the repo root is three levels up.
  require('node:path').join(__dirname, '..', '..', '..', 'src', 'renderer', 'features', 'game-illustration.ts'),
  'utf8'
);

test('the renderer default illustration matches the shared registry', () => {
  // #89: the renderer cannot import the registry, so it carries its own copy of
  // the fallback. If they disagree, the shared contract and the play surface
  // draw different pictures for the same "no artwork" item - exactly the drift
  // class that #67 had to fix with a data generator. A regex is enough here
  // because the values are two string literals.
  const category = /const STAGE_ILLUSTRATION_FALLBACK_CATEGORY = '([a-z-]+)';/.exec(RENDERER_SOURCE);
  const icon = /const STAGE_ILLUSTRATION_FALLBACK_ICON = '([a-z-]+)';/.exec(RENDERER_SOURCE);
  assert.ok(category, 'the renderer fallback category is missing');
  assert.ok(icon, 'the renderer fallback icon is missing');
  assert.equal(category![1], DEFAULT_ILLUSTRATION_CATEGORY);
  assert.equal(icon![1], DEFAULT_ILLUSTRATION_ICON);
});

test('the renderer honours the same per-item opt-out (#153)', () => {
  // The play surface resolves through its own copy, so a sentinel handled only
  // here would still draw a picture in class. The literal must match the export.
  const guard = new RegExp(`illustrationAssetId\\.trim\\(\\) === '${ILLUSTRATION_NONE_ID}'`);
  assert.ok(guard.test(RENDERER_SOURCE), 'resolveStageIllustration does not check the opt-out sentinel');
});

/** Extracts the object literal of a `const NAME = { ... };` from renderer source. */
function constBody(constName: string): string {
  const start = RENDERER_SOURCE.indexOf(`const ${constName} = {`);
  assert.ok(start >= 0, `${constName} is missing from the renderer copy`);
  const end = RENDERER_SOURCE.indexOf('\n};', start);
  return RENDERER_SOURCE.slice(start, end === -1 ? undefined : end);
}

/** `animals: { glow, fill, ink, sky, ground }` -> per-category palettes. */
function rendererPalettes(): Record<
  string,
  { glow: string; fill: string; ink: string; sky: string; ground: string }
> {
  const body = constBody('STAGE_ILLUSTRATION_PALETTES');
  const out: Record<string, { glow: string; fill: string; ink: string; sky: string; ground: string }> = {};
  const re =
    /'?([a-z-]+)'?:\s*\{\s*glow:\s*'([^']+)',\s*fill:\s*'([^']+)',\s*ink:\s*'([^']+)',\s*sky:\s*'([^']+)',\s*ground:\s*'([^']+)'\s*\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) out[m[1]] = { glow: m[2], fill: m[3], ink: m[4], sky: m[5], ground: m[6] };
  return out;
}

/** `animals: 'paw-print', plants: 'leaf'` -> category to icon id. */
function rendererCategoryIcons(): Record<string, string> {
  const body = constBody('STAGE_ILLUSTRATION_CATEGORY_ICONS');
  const out: Record<string, string> = {};
  const re = /'?([a-z-]+)'?:\s*'([a-z-]+)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) out[m[1]] = m[2];
  return out;
}

test('the renderer palette table matches the shared registry', () => {
  const palettes = rendererPalettes();
  const categories = Object.keys(palettes);
  assert.ok(categories.length >= 20, `only ${categories.length} palettes parsed from the renderer`);
  for (const category of categories) {
    assert.deepEqual(getIllustrationPalette(category), palettes[category], `${category} palette differs`);
  }
  // Every category the renderer draws is a category the resolver can produce.
  for (const id of ILLUSTRATION_ASSET_IDS) {
    assert.ok(palettes[id.slice(0, -'-scene'.length)], `${id} has no palette in the renderer`);
  }
});

test('the renderer icon map matches getCategoryIcon()', () => {
  const icons = rendererCategoryIcons();
  assert.ok(Object.keys(icons).length >= 20, 'icon map failed to parse');
  for (const [category, icon] of Object.entries(icons)) {
    assert.equal(getCategoryIcon(category), icon, `${category} icon differs`);
  }
});

/** `animals: { sky: 'sun', horizon: 'hills', standing: 'trees', fg: 'grass', subjectY: 96 }`. */
function rendererScenes(): Record<
  string,
  { sky: string; horizon: string; standing: string; fg: string; subjectY: number }
> {
  const body = constBody('STAGE_ILLUSTRATION_SCENES');
  const out: Record<string, { sky: string; horizon: string; standing: string; fg: string; subjectY: number }> = {};
  const re =
    /'?([a-z-]+)'?:\s*\{\s*sky:\s*'([a-z]+)',\s*horizon:\s*'([a-z]+)',\s*standing:\s*'([a-z]+)',\s*fg:\s*'([a-z]+)',\s*subjectY:\s*(\d+)\s*\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    out[m[1]] = { sky: m[2], horizon: m[3], standing: m[4], fg: m[5], subjectY: Number(m[6]) };
  }
  return out;
}

test('the renderer scene table matches the shared scene composer', () => {
  const scenes = rendererScenes();
  const categories = Object.keys(scenes);
  assert.ok(categories.length >= 20, `only ${categories.length} scenes parsed from the renderer`);
  for (const category of categories) {
    assert.deepEqual(getSceneSpec(category), scenes[category], `${category} scene differs`);
  }
  // Every drawable category has a scene, so the renderer never has to guess.
  for (const id of ILLUSTRATION_ASSET_IDS) {
    assert.ok(scenes[id.slice(0, -'-scene'.length)], `${id} has no scene in the renderer`);
  }
});

test('the renderer subject size and horizon match the shared composer', () => {
  // These two numbers are the whole #72 layout contract (subject small enough to
  // leave room for layers, one shared horizon). A silent skew makes the editor
  // and the play surface draw different pictures from the same game.
  const size = /const STAGE_ILLUSTRATION_SUBJECT_SIZE = (\d+);/.exec(RENDERER_SOURCE);
  assert.ok(size, 'STAGE_ILLUSTRATION_SUBJECT_SIZE is missing from the renderer');
  assert.equal(Number(size![1]), SCENE_SUBJECT_SIZE, 'subject size in the renderer drifted');
  const horizon = /const STAGE_ILLUSTRATION_HORIZON = (\d+);/.exec(RENDERER_SOURCE);
  assert.ok(horizon, 'STAGE_ILLUSTRATION_HORIZON is missing from the renderer');
  assert.equal(Number(horizon![1]), SCENE_HORIZON, 'horizon in the renderer drifted');
});

test('every layer primitive the renderer knows is one the shared composer knows', () => {
  // A primitive added to one side only would render '' on the other, which is
  // invisible in a screenshot of the surface you happened to look at.
  const declared = new Set(
    (RENDERER_SOURCE.match(/data-scene-primitive="([a-z-]+)"/g) || []).map((m) =>
      m.slice('data-scene-primitive="'.length, -1)
    )
  );
  assert.ok(declared.size >= 8, `only ${declared.size} primitives found in the renderer`);
  const shared = readFileSync(
    require('node:path').join(__dirname, '..', '..', '..', 'src', 'shared', 'illustration-scene.ts'),
    'utf8'
  );
  const sharedPrimitives = new Set(
    (shared.match(/data-scene-primitive="([a-z-]+)"/g) || []).map((m) =>
      m.slice('data-scene-primitive="'.length, -1)
    )
  );
  for (const primitive of declared) {
    assert.ok(sharedPrimitives.has(primitive), `renderer draws '${primitive}' but the shared composer does not`);
  }
});

test('each palette carries its own sky and ground band', () => {
  const palettes = rendererPalettes();
  for (const [category, palette] of Object.entries(palettes)) {
    assert.ok(/^#[0-9a-f]{6}$/i.test(palette.sky), `${category} sky is not a hex colour`);
    assert.ok(/^#[0-9a-f]{6}$/i.test(palette.ground), `${category} ground is not a hex colour`);
    assert.notEqual(palette.sky, palette.ground, `${category} sky and ground are the same band`);
  }
});

// --- scenes are scenes, not icons (#70) ------------------------------------
// Before #70 an illustration was one 72px icon on a flat card: ~5% of the
// frame. These assertions are what stop that regressing silently, since a
// too-small subject still "renders" and every older test would still pass.

test('the subject fills a real share of the frame', () => {
  // #72 lowered this from 168 to 120 on purpose: at 168 the icon covered the
  // frame and there was no room for an environment. The guard now protects the
  // band where the subject is still the focal point but the scene has depth.
  assert.ok(
    SCENE_SUBJECT_SIZE >= 110,
    `subject is ${SCENE_SUBJECT_SIZE}px of 200px tall; below ~110 the layers overwhelm it`
  );
  assert.ok(
    SCENE_SUBJECT_SIZE <= 130,
    `subject is ${SCENE_SUBJECT_SIZE}px; above ~130 it covers the frame again and the layers become backdrop noise`
  );
  const scene = renderIllustrationSvg(resolveIllustration({ ...ANIMAL, mode: 'auto' }))!;
  assert.match(scene, new RegExp(`width="${SCENE_SUBJECT_SIZE}"`), 'subject icon not drawn at the scene size');
});

test('a scene is layered, not a single icon on a card', () => {
  const scene = renderIllustrationSvg(resolveIllustration({ ...ANIMAL, mode: 'auto' }))!;
  const rects = scene.match(/<rect /g) || [];
  assert.ok(rects.length >= 3, `expected sky, ground and frame bands, got ${rects.length} rects`);
  // The backdrop must contribute geometry of its own, in more than one depth.
  const spec = getSceneSpec('animals');
  assert.ok(spec.sky && spec.horizon && spec.fg, 'animals scene lost its layered spec');
  const backdrop = renderSceneSvg('animals', 'paw-print', getIllustrationPalette('animals'), {});
  assert.ok(backdrop.includes('q58-52 118-6'), `animals far layer ${spec.horizon} drew no hills path`);
  assert.ok(backdrop.includes('data-scene-layer="fg"'), 'animals drew no foreground layer');
});

test('scenes are deterministic and stay offline', () => {
  for (const assetId of ILLUSTRATION_ASSET_IDS) {
    const a = renderIllustrationSvg(resolveIllustration({ illustrationAssetId: assetId, mode: 'auto' }));
    const b = renderIllustrationSvg(resolveIllustration({ illustrationAssetId: assetId, mode: 'auto' }));
    assert.equal(a, b, `${assetId} is not deterministic`);
    assert.doesNotMatch(a, /<image|href=|url\(|@import|<script/, `${assetId} references an external resource`);
  }
});

// Eyeballing the 24 scenes (#70) caught three that read badly: the decoration
// repeated what the icon already said (clouds behind cloud-sun, waves behind
// waves-horizontal). #72 replaced one motif with a stack of four named layers,
// so the guard now checks the stack itself: every scene must have a *depth*
// (sky + horizon + foreground) and must not put the subject's own noun behind
// it. That is still invisible to a "does it render" assertion.
const SUBJECT_SKY_CLASH: Readonly<Record<string, readonly string[]>> = Object.freeze({
  sun: ['sun', 'sun-medium', 'cloud-sun'],
  moon: ['moon', 'moon-star'],
  stars: ['star', 'sparkles', 'sparkle'],
  clouds: ['cloud'],
});

test('the subject never straddles the horizon', () => {
  // Scene preview (tests/manual/scene-preview.js) showed the first #72 draft
  // with the ground band running through the middle of the icon: the subject
  // read as "cut in half". Nothing in the SVG strings looks wrong, so the
  // geometry is asserted directly: the subject must finish above the horizon.
  const bottom = (spec: { subjectY: number }) => spec.subjectY + SCENE_SUBJECT_SIZE / 2;
  for (const assetId of ILLUSTRATION_ASSET_IDS) {
    const category = assetId.slice(0, -'-scene'.length);
    const spec = getSceneSpec(category);
    assert.ok(
      bottom(spec) <= SCENE_HORIZON,
      `${assetId}: subject ends at y=${bottom(spec)} but the horizon is ${SCENE_HORIZON}, so it is cut by the ground band`
    );
    assert.ok(
      spec.subjectY - SCENE_SUBJECT_SIZE / 2 >= 8,
      `${assetId}: subject starts at y=${spec.subjectY - SCENE_SUBJECT_SIZE / 2}, too close to the frame edge`
    );
  }
});

test('every scene has real depth, and no layer repeats the subject', () => {
  for (const assetId of ILLUSTRATION_ASSET_IDS) {
    const category = assetId.slice(0, -'-scene'.length);
    const icon = String(getCategoryIcon(category));
    const spec = getSceneSpec(category);
    assert.notEqual(spec.sky, 'none', `${assetId}: no sky layer, so the scene has no background`);
    assert.notEqual(spec.horizon, 'none', `${assetId}: no horizon layer, so the subject floats`);
    assert.ok(
      spec.fg !== 'none' || spec.standing !== 'none',
      `${assetId}: neither a mid nor a foreground layer; this is a flat card again`
    );
    assert.notEqual(spec.fg, 'none', `${assetId}: no foreground layer, so the subject floats above the ground`);
    const clash = SUBJECT_SKY_CLASH[spec.sky] || [];
    assert.ok(
      !clash.includes(icon),
      `${assetId}: sky layer '${spec.sky}' repeats the subject icon '${icon}', so the scene reads as a duplicate`
    );
  }
});

// Horizontal spans each primitive occupies at the ground line, as [min, max].
// Used to prove props and foreground never paint over each other: `art` shipped
// easel boards on top of its book stack, and the preview showed one unreadable
// tangle of bars. Strings were valid, so only this table can catch it.
const PRIMITIVE_SPANS: Record<string, [number, number][]> = {
  books: [[42, 76], [242, 278]],
  stones: [[84, 102], [116, 130], [190, 206], [222, 238]],
  roots: [[92, 118], [212, 236]],
  boards: [[88, 120], [200, 234]],
  grass: [[40, 56], [108, 124], [196, 212], [266, 282]],
};

function overlaps(a: [number, number], b: [number, number]): number {
  return Math.min(a[1], b[1]) - Math.max(a[0], b[0]);
}

test('props and foreground never paint over each other', () => {
  for (const assetId of ILLUSTRATION_ASSET_IDS) {
    const category = assetId.slice(0, -'-scene'.length);
    const spec = getSceneSpec(category);
    const props = PRIMITIVE_SPANS[spec.standing] || [];
    const fg = PRIMITIVE_SPANS[spec.fg] || [];
    for (const p of props) {
      for (const f of fg) {
        assert.ok(
          overlaps(p, f) <= 0,
          `${assetId}: props '${spec.standing}' [${p}] collides with fg '${spec.fg}' [${f}]`
        );
      }
    }
  }
});

test('every primitive in a scene table actually renders', () => {
  // `math` shipped with horizon: 'graph' after `graph` moved to the mid layer.
  // renderFar() no longer knew it, so the scene silently lost its backdrop and
  // still produced valid SVG — 30 checks passed. The table and the renderers
  // must agree on which primitive lives in which layer.
  const knownIn: Record<string, string[]> = {
    sky: ['sun', 'moon', 'rays', 'stars', 'clouds'],
    horizon: ['hills', 'mountains', 'skyline', 'sea', 'line'],
    standing: ['trees', 'bushes', 'towers', 'bubbles', 'graph'],
    fg: ['grass', 'roots', 'stones', 'boards', 'waves'],
  };
  // Props reuse the `standing` slot, so they are checked against their own list.
  const propsFromStanding = ['books', 'flasks', 'tools'];
  for (const assetId of ILLUSTRATION_ASSET_IDS) {
    const category = assetId.slice(0, -'-scene'.length);
    const spec = getSceneSpec(category);
    for (const [slot, allowed] of Object.entries(knownIn)) {
      const value = String(spec[slot as keyof typeof spec]);
      if (value === 'none') continue;
      const ok = allowed.includes(value) || (slot === 'standing' && propsFromStanding.includes(value));
      assert.ok(ok, `${assetId}: ${slot} uses '${value}', which that layer cannot draw`);
    }
  }
});

test('the rendered stack is ordered back to front', () => {
  // Paint order IS the depth. A layer emitted in the wrong place still renders,
  // so only the string order can catch it. `mid` and `props` are optional (a
  // scene with nothing standing around the subject emits neither), the rest is
  // mandatory: no sky, no horizon or no foreground means a flat card again.
  for (const assetId of ['animals-scene', 'space-scene', 'water-world-scene', 'science-scene']) {
    const svg = renderIllustrationSvg(resolveIllustration({ illustrationAssetId: assetId, mode: 'auto' }))!;
    const order = (svg.match(/data-scene-layer="([a-z]+)"/g) || []).map((m) =>
      m.slice('data-scene-layer="'.length, -1)
    );
    const mandatory = order.filter((name) => name !== 'props' && name !== 'mid');
    assert.deepEqual(mandatory, ['sky', 'far', 'halo', 'subject', 'fg'], `${assetId} layer order`);
    if (order.includes('props')) {
      assert.equal(order.indexOf('props'), order.indexOf('subject') + 1, `${assetId}: props must sit on the subject`);
    }
  }
});




// The stylesheet was split into area files (DECISIONS #149); read the whole
// directory raw (not compiled) so this guard still sees the declared rules.
const APP_CSS_DIR = require('node:path').join(__dirname, '..', '..', '..', 'src', 'renderer', 'styles');
const APP_CSS = require('node:fs').readdirSync(APP_CSS_DIR)
  .filter((name: string) => name.endsWith('.css'))
  .sort()
  .map((name: string) => readFileSync(require('node:path').join(APP_CSS_DIR, name), 'utf8'))
  .join('\n');

test('no stage-illustration rule sets height without width (aspect-ratio trap)', () => {
  // #70 trap: the scene is authored 16:10 and the box uses `aspect-ratio`. A
  // rule that sets `height` alone leaves the width free, so the box becomes a
  // shape the scene cannot fill; `preserveAspectRatio: meet` then letterboxes
  // it and the ground band reads as "clipped". Height must follow width.
  const blocks = APP_CSS.match(/[^{}]*\.stage-illustration[^{]*\{[^}]*\}/g) || [];
  assert.ok(blocks.length >= 4, `expected several .stage-illustration rules, saw ${blocks.length}`);
  for (const block of blocks) {
    const selector = block.slice(0, block.indexOf('{')).trim();
    const body = block.slice(block.indexOf('{') + 1);
    const hasHeightOnly =
      /(^|[;\s])height\s*:/.test(body) && !/(^|[;\s])(width|inline-size)\s*:/.test(body);
    assert.ok(
      !hasHeightOnly,
      `${selector.split('\n').pop()}: sets height without width, which fights aspect-ratio`
    );
  }
});

test('the play surface keeps the illustration visible on short screens', () => {
  // A `display: none` under a max-height media query silently removed every
  // scene on 1366x768 laptops - the exact size the first measurement of this
  // surface was taken at, which is why the artwork looked like a lone icon.
  const start = APP_CSS.search(/@media \(max-height:\s*760px\)/);
  assert.ok(start >= 0, 'the short-window media query is missing');
  // Slice to the matching closing brace of the at-rule.
  let depth = 0;
  let end = start;
  for (let i = APP_CSS.indexOf('{', start); i < APP_CSS.length; i++) {
    if (APP_CSS[i] === '{') depth++;
    else if (APP_CSS[i] === '}' && --depth === 0) { end = i; break; }
  }
  const shortQuery = APP_CSS.slice(start, end + 1);
  assert.ok(
    shortQuery.includes('stage-illustration'),
    'short windows should still size the illustration'
  );
  const hidden = shortQuery
    .split('}')
    .some((block) => /stage-illustration/.test(block) && /display\s*:\s*none/.test(block));
  assert.ok(!hidden, 'short windows must scale the illustration down, not hide it');
});

console.log(`\n${passed} illustration-registry checks passed.`);
