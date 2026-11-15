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
import { createHash } from 'node:crypto';
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

/** `animals: { sky: ['sun','clouds'], horizon: 'hills', standing: ['trees','bushes'], fg: ['grass'], subjectY: 88 }`. */
type ParsedScene = {
  sky: string[];
  horizon: string[];
  standing: string[];
  fg: string[];
  subjectY: number;
};

function rendererScenes(): Record<string, ParsedScene> {
  const body = constBody('STAGE_ILLUSTRATION_SCENES');
  const out: Record<string, ParsedScene> = {};
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
    out[row[1] || row[2]] = {
      sky: grab('sky'),
      horizon: grab('horizon'),
      standing: grab('standing'),
      fg: grab('fg'),
      subjectY: y ? Number(y[1]) : 0,
    };
  }
  return out;
}

test('the renderer scene table matches the shared scene composer', () => {
  const scenes = rendererScenes();
  const categories = Object.keys(scenes);
  assert.ok(categories.length >= 20, `only ${categories.length} scenes parsed from the renderer`);
  const listOf = (value: unknown): string[] =>
    Array.isArray(value) ? value.map(String) : [String(value)];
  for (const category of categories) {
    const shared = getSceneSpec(category);
    assert.deepEqual(
      {
        sky: listOf(shared.sky),
        horizon: listOf(shared.horizon),
        standing: listOf(shared.standing),
        fg: listOf(shared.fg),
        subjectY: shared.subjectY,
      },
      scenes[category],
      `${category} scene differs`
    );
  }
  // Every drawable category has a scene, so the renderer never has to guess.
  for (const id of ILLUSTRATION_ASSET_IDS) {
    assert.ok(scenes[id.slice(0, -'-scene'.length)], `${id} has no scene in the renderer`);
  }
});

test('the scene composer output is pinned so saved scenes stay stable', () => {
  // #252 split `renderSceneSvg` into `composeSceneSvg(..., subIcons = [])`.
  // That refactor alone kept all 24 scenes byte-identical.
  //
  // The hashes below were then re-taken ON PURPOSE by the stacked-layer change:
  // every layer may now hold several primitives (`sky: ['sun','clouds']`), which
  // is what makes a scene read as a place instead of one icon on a background.
  // Drawable shapes per scene went from 19-23 to 31-52 (mean 42.9).
  // Games saved before this change therefore look RICHER after an update, never
  // broken: same assets, same layout, more of them. Re-take these hashes only
  // with a visual proof, and record it in docs/DECISIONS.md.
  const golden: Record<string, string> = {
    animals: '147b4067740c5170d54a02b3a383c93c6ea8d6f75360e11de603d82770b66ef5',
    plants: '0de97ddf5b4c6f97bb0a3df587dfd8188495f396e51279c995c2c1047c7d8c39',
    space: '48cb4aedd66260ab4f3bd783327e15cff36c53e930c488afca6cd4af16363e79',
    'human-body': 'c1ad91e7629fda6ca3cbcac13b7b91fdc99a9e00e717c29f95fa8ecfc1f295d5',
    transport: 'b7ef8163f7b5176ade94f0af893171544b47fafbc2e1f5a61c6bea05a12d57c6',
    safety: 'df27d97df9aa39217cdb2a11a07b9dc410158f42b07f483f5f4930db976859f0',
    environment: '3ca1028e8d8e95aebb1f2bf80eed6dc9df66c973589ff854659dc491918d42ba',
    history: 'e47702b49d99d048ed42c13e3e5a0e973c3bb535ccddf2a7fd6e301b5cd0c2fe',
    geography: '54865b651379b034816db11083e27dd55241a61e5900c82d25c20fe6523b5a22',
    jobs: '98f8db731963dee111aa9723feea54f3d888fdb38c2d5ff5351eb7b3b52a04e3',
    sports: '7967456f876212352f7bbf47842d37714e58cccd719d58b828db77f69764ee2f',
    music: '4ba64e0592ef270b33b87763363f615630e4896b2802ed8b456e82389aded214',
    art: 'b39b3e0d1e3cc5379ae1ee7ec53519981853ff34e86d785be596b5981ac53e42',
    math: '9447f40e4f40e8b7042680c269b3c90c693e2bd0972e4f29f400de984370ea84',
    language: '46c4100f6219c186c4c1cc5c397d224329a211dbe2d9ecbc6ccdeb0fbd70db8e',
    science: '753736db712892452f922e5011a384e643974bd559d4368bfef1dc89b88a4c2b',
    technology: '85da78dc315f35d6f2b99f7c071dcc587ab34ce8898e4f8524d5cd76c8e73027',
    health: '74ca8cb7ce2ade8d9cd8563f9fff1f3ad713a7428c419c04caec8fb5ee9036c6',
    family: 'ebd5cae6a8dbedbb6c433c7f5bf8de045327ac60ca6212f4970e0c4d5f505fbf',
    community: '73bbe1edf27914acd25f64140323047e4325ce61a24e42a981a6d6750a40ebbd',
    weather: '97e52475cc2701771c65eea78584ddd8893cb90b40a004427462cb040534206c',
    food: '8410c4932ea5359aed93a97c1beaaf4be65a6eaa5035769a2159e4c175da0343',
    objects: '56acca5342fd09881833c637685f2a52d3a7a5f245c9687cb38e497ca8153fa2',
    'water-world': 'eebe03e4d27f1211136db19e57d7dda72ea9d25bca060af36f4287095277ce89',
  };
  for (const id of ILLUSTRATION_ASSET_IDS) {
    const category = id.slice(0, -'-scene'.length);
    const svg = renderSceneSvg(category, getCategoryIcon(category) || DEFAULT_ILLUSTRATION_ICON, getIllustrationPalette(category), {
      label: category,
      assetId: id,
      className: 'stage-illustration-svg',
    });
    const hash = createHash('sha256').update(svg).digest('hex');
    assert.equal(hash, golden[category], `${category} scene changed after the #252 refactor`);
  }
});

test('the renderer subject size and horizon match the shared composer', () => {
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
  // A layer may stack several primitives (#252 follow-up), so every assertion
  // here reads the whole stack instead of a single name.
  const listOf = (value: unknown): string[] =>
    Array.isArray(value) ? value.map(String) : [String(value)];
  for (const assetId of ILLUSTRATION_ASSET_IDS) {
    const category = assetId.slice(0, -'-scene'.length);
    const icon = String(getCategoryIcon(category));
    const spec = getSceneSpec(category);
    const sky = listOf(spec.sky);
    const horizon = listOf(spec.horizon);
    const standing = listOf(spec.standing);
    const fg = listOf(spec.fg);
    assert.ok(sky.length > 0 && !sky.includes('none'), `${assetId}: no sky layer, so the scene has no background`);
    assert.ok(
      horizon.length > 0 && !horizon.includes('none'),
      `${assetId}: no horizon layer, so the subject floats`
    );
    assert.ok(
      standing.some((p) => p !== 'none') || fg.some((p) => p !== 'none'),
      `${assetId}: neither a mid nor a foreground layer; this is a flat card again`
    );
    assert.ok(fg.length > 0 && !fg.includes('none'), `${assetId}: no foreground layer, so the subject floats above the ground`);
    const clash = sky.flatMap((p) => SUBJECT_SKY_CLASH[p] || []);
    assert.ok(
      !clash.includes(icon),
      `${assetId}: sky layer '${sky.join('+')}' repeats the subject icon '${icon}', so the scene reads as a duplicate`
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
  const listOf = (value: unknown): string[] =>
    Array.isArray(value) ? value.map(String) : [String(value)];
  for (const assetId of ILLUSTRATION_ASSET_IDS) {
    const category = assetId.slice(0, -'-scene'.length);
    const spec = getSceneSpec(category);
    // Stacked layers: every standing primitive must clear every fg primitive.
    for (const standingName of listOf(spec.standing)) {
      for (const fgName of listOf(spec.fg)) {
        const props = PRIMITIVE_SPANS[standingName] || [];
        const fg = PRIMITIVE_SPANS[fgName] || [];
        for (const p of props) {
          for (const f of fg) {
            assert.ok(
              overlaps(p, f) <= 0,
              `${assetId}: props '${standingName}' [${p}] collides with fg '${fgName}' [${f}]`
            );
          }
        }
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
      const raw = spec[slot as keyof typeof spec];
      const names = Array.isArray(raw) ? raw.map(String) : [String(raw)];
      for (const value of names) {
        if (value === 'none') continue;
        const ok = allowed.includes(value) || (slot === 'standing' && propsFromStanding.includes(value));
        assert.ok(ok, `${assetId}: ${slot} uses '${value}', which that layer cannot draw`);
      }
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
