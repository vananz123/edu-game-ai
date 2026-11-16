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
  ILLUSTRATION_CATEGORY_IDS,
  ILLUSTRATION_NONE_ID,
  getIllustrationPalette,
  isIllustrationAssetId,
  resolveIllustration,
  renderIllustrationSvg,
} from '../../src/shared/illustration-registry';
import { renderIconSvg } from '../../src/shared/icon-registry';
import { normalizeSceneBlueprint } from '../../src/shared/scene-blueprint';
import { renderBlueprintSvg } from '../../src/shared/illustration-scene';
import { getCategoryIcon } from '../../src/shared/content-categories';
import {
  SCENE_HEIGHT,
  SCENE_HORIZON,
  SCENE_SUBJECT_SIZE,
  SCENE_WIDTH,
  getSceneSpec,
  renderSceneSvg,
} from '../../src/shared/illustration-scene';
import { SCENE_BACKDROPS } from '../../src/shared/scene-asset-catalog';

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
  assert.ok(start >= 0, `${constName} is missing from the renderer`);
  const end = RENDERER_SOURCE.indexOf('\n};', start);
  return RENDERER_SOURCE.slice(start, end === -1 ? undefined : end);
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

test('the renderer reads palettes from the shared bundle, not a copy (#272)', () => {
  // The palette table used to be duplicated in the renderer and compared here.
  // It is gone: `renderer/shared/scene-runtime.js` IS this module, bundled, so
  // the check is now that the bundle carries every palette unchanged.
  assert.equal(
    RENDERER_SOURCE.includes('STAGE_ILLUSTRATION_PALETTES'),
    false,
    'the renderer palette copy came back — delete it and use SceneRuntime'
  );
  const runtime = require('node:vm').runInNewContext(
    `${readFileSync(
      require('node:path').join(__dirname, '..', '..', '..', 'dist', 'src', 'renderer', 'shared', 'scene-runtime.js'),
      'utf8'
    )};SceneRuntime`,
    { console }
  );
  assert.ok(runtime, 'the bundle must publish SceneRuntime');
  for (const id of ILLUSTRATION_ASSET_IDS) {
    const category = id.slice(0, -'-scene'.length);
    assert.deepEqual(
      JSON.parse(JSON.stringify(runtime.getIllustrationPalette(category))),
      JSON.parse(JSON.stringify(getIllustrationPalette(category))),
      `${category} palette differs in the bundle`
    );
  }
});

test('the renderer icon map matches getCategoryIcon()', () => {
  const icons = rendererCategoryIcons();
  assert.ok(Object.keys(icons).length >= 20, 'icon map failed to parse');
  for (const [category, icon] of Object.entries(icons)) {
    assert.equal(getCategoryIcon(category), icon, `${category} icon differs`);
  }
});

test('the renderer reads scene compositions from the shared bundle (#272)', () => {
  // Same story as the palettes: the hand-written `STAGE_ILLUSTRATION_SCENES`
  // table is gone, so there is nothing left to drift. What still has to be true
  // is that every category the app can name resolves to a real composition in
  // the bundle the renderer actually loads.
  assert.equal(
    RENDERER_SOURCE.includes('STAGE_ILLUSTRATION_SCENES'),
    false,
    'the renderer scene copy came back — delete it and use SceneRuntime'
  );
  const runtime = require('node:vm').runInNewContext(
    `${readFileSync(
      require('node:path').join(__dirname, '..', '..', '..', 'dist', 'src', 'renderer', 'shared', 'scene-runtime.js'),
      'utf8'
    )};SceneRuntime`,
    { console }
  );
  const listOf = (value: unknown): string[] =>
    Array.isArray(value) ? value.map(String) : [String(value)];
  for (const id of ILLUSTRATION_ASSET_IDS) {
    const category = id.slice(0, -'-scene'.length);
    // The bundle runs in its own vm realm, so its objects carry a different
    // `Object.prototype`/`Array.prototype`; `deepStrictEqual` compares
    // prototypes, so the values are copied through JSON before comparing.
    const bundled = JSON.parse(JSON.stringify(runtime.getSceneSpec(category)));
    const shared = getSceneSpec(category);
    assert.deepEqual(
      {
        sky: listOf(bundled.sky),
        horizon: listOf(bundled.horizon),
        standing: listOf(bundled.standing),
        fg: listOf(bundled.fg),
        subjectY: bundled.subjectY,
      },
      {
        sky: listOf(shared.sky),
        horizon: listOf(shared.horizon),
        standing: listOf(shared.standing),
        fg: listOf(shared.fg),
        subjectY: shared.subjectY,
      },
      `${category} scene differs in the bundle`
    );
  }
});

test('#278 every palette carries three hues, and a scene actually paints them', () => {
  // One hue family per palette was the real reason a finished scene still read
  // as a diagram. The fix is data, so the guard is data: no palette may fall
  // back to a missing `warm`/`cool`, and both must be a DIFFERENT colour from
  // the subject's `glow` (a palette with warm === glow would silently be
  // monochrome again).
  const hex = /^#[0-9a-f]{6}$/;
  for (const category of ILLUSTRATION_CATEGORY_IDS) {
    const palette = getIllustrationPalette(category);
    for (const key of ['warm', 'cool'] as const) {
      const value = palette[key];
      assert.ok(value, `${category} has no ${key}`);
      assert.match(String(value), hex, `${category}.${key} is not a hex colour`);
      assert.notEqual(value, palette.glow, `${category}.${key} repeats the subject hue`);
      assert.notEqual(value, palette.ink, `${category}.${key} repeats the ink hue`);
    }
    assert.notEqual(palette.warm, palette.cool, `${category} warm and cool are the same hue`);
  }

  // And the hues reach the picture: a single scene with props and corner icons
  // must publish at least five distinct colours, otherwise the palette data is
  // decoration nobody draws with.
  const svg = renderBlueprintSvg(
    normalizeSceneBlueprint({
      v: 1,
      layout: 'single',
      backdrop: 'meadow',
      paletteKey: 'animals',
      mainIcon: 'paw-print',
      props: ['apple', 'box'],
      subIcons: [{ icon: 'bird', position: 'top-right' }],
    })!,
    getIllustrationPalette('animals')
  );
  const hues = new Set(svg.match(/#[0-9a-f]{6}/g) || []);
  assert.ok(hues.size >= 5, `scene paints ${hues.size} distinct hues, expected 5+`);
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
  //
  // #266 re-took all 24 hashes ON PURPOSE a second time, with a screenshot in
  // docs/DECISIONS.md: the subject and the corner icons are now drawn in the
  // palette ACCENT instead of ink (#266 - colour), and three person icons joined
  // the whitelist (#266 - people, no geometry change). Byte lengths did not move
  // (same 7-char hex colours), so only the hashes pin this change.
  //
  // #278 re-took them a FOURTH time, again with rendered PNGs: every palette
  // now carries `warm` (sun, props, ground props) and `cool` (clouds, mountains,
  // skyline, towers, pebbles, corner icons) so a scene is no longer one hue.
  // #277 re-took all 24 hashes a third time, ON PURPOSE and with rendered PNGs
  // checked by eye: every standing thing now casts one soft ground-contact
  // shadow, and the far layer (clouds/hills/mountains/skyline) is less washed
  // out. This is the first change where byte LENGTH moved as well, and the
  // length assertion in scene-blueprint.test.ts pins the legacy path separately.
  const golden: Record<string, string> = {
    animals: 'e3ab4fd7ddd1eeae74b09bb361926dc14e4afe94c7a964b2cdd5357045adfc84',
    plants: '98e36c1c66819844c4ae80202b335c58d894640bbd58b1526687fb1b54ac2e33',
    space: '66c077a36fd322b51c53457b8ce624bb21b728e442a7e0d602faa3c950c35c21',
    'human-body': 'c46a978b0ad793f045b3390e1306ade85980e3741d3ba91d42022060895f8806',
    transport: '930584457955c562c8dbfec66d2fbfa2ddc0c29bf2e3d629b17441f6ffdb7c83',
    safety: '429aef26b7755930c050e931b275ebcbc2a2979e9250517bbc7421f785001e9b',
    environment: '3523f6c8d923668bcf44a05e09054186b62cb78dfa8293bfb7b1506bfb01a658',
    history: '2cf6b1bcffb8eb8c157888c4bdacdc268284cf30cd8c5e67ddd2b6f2ec720287',
    geography: '049c60331ac5ac3a0d68bb9db2c21953bf680fb26f262b653a1c1581a81a7a02',
    jobs: '7922eb53db34eb3cc35c9dd9683cfa2df18bed1d30c440ae1548f67bd23a7eac',
    sports: '76b00fd0aadfe4e067c2c28495019bf481c05be8a1c7da67c11f3687a2172cac',
    music: 'fe713cb6f2d82f1fe003f5b50022235a257254ef9d983ccddb37fa06ec5a6a52',
    art: '2c7c5a1ae6b065772133a0bc386dd02f0ceaa0329fa5b4ee151ce6f0054a605f',
    math: 'ce650ae1cdee6ecbb19216eff17543154fddff226f43d577f68331bf16f6fcaf',
    language: 'e7a20452c8966e1c7422f07a2bdb6b9e8848310359efe139cafad4084f4b5f80',
    science: '45bc9aeb3c61988ec7739e628677291860579076d3f37ee4b28aa0c6472320fd',
    technology: '78ab08eeaf094fb5c1bbbde1c5a6abde807ef4b388409e54f6f1849de10b086d',
    health: '1afa6c3a9aeb9e5a5bd1eaed8d5c79e1279da55821fd9970ad763d1525b6963f',
    family: '981d1e21aaa5ca97c9490a396e41feec5f53cbbfc73a642534e2d93665391e7d',
    community: 'eb19800907779b0db711e5b1474cd2c6b1107f8ef801b20721bcc11f703491b9',
    weather: '233fa042dc0a7a7ff02ac50d35f41e4b977dea93989193766d6a0b9a726e46aa',
    food: '9a50d22b3af61d9a79472f3da605d20e54332622c5a784455b8f0375ce7228f2',
    objects: 'c559b7c7b08dcdf55afafc40add61028f06d7e94512e569646ca1f2b9d293643',
    'water-world': '66d078bae5ee21588272ee5ce053208de5a184daa964ed54a7daaa870733a39a',
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

test('the renderer takes its geometry from the shared composer (#272)', () => {
  // These two constants used to be copied into the renderer and compared. #272
  // deleted the copy, so what is left to check is that the bundle the renderer
  // loads reports the same frame the composer does — and that the renderer no
  // longer hard-codes its own sizes (a re-added number is the drift this test
  // exists to catch).
  for (const gone of ['STAGE_ILLUSTRATION_SUBJECT_SIZE', 'STAGE_ILLUSTRATION_HORIZON', 'STAGE_SCENE_PROCESS_STEP_TOP']) {
    assert.equal(
      RENDERER_SOURCE.includes(gone),
      false,
      `${gone} is back in the renderer — geometry belongs to src/shared/illustration-scene.ts`
    );
  }
  const runtime = require('node:vm').runInNewContext(
    `${readFileSync(
      require('node:path').join(__dirname, '..', '..', '..', 'dist', 'src', 'renderer', 'shared', 'scene-runtime.js'),
      'utf8'
    )};SceneRuntime`,
    { console }
  );
  assert.equal(runtime.SCENE_WIDTH, SCENE_WIDTH);
  assert.equal(runtime.SCENE_HEIGHT, SCENE_HEIGHT);
});

test('every layer primitive the shared composer draws is one its scene table names', () => {
  // A primitive named in a scene table but handled by no painter renders '' — a
  // hole in the picture that no screenshot of the surface you happened to look
  // at would reveal. Before #272 this compared the renderer's copy against the
  // shared composer; now both sides are the same file, so the check is that the
  // composer's painter coverage matches the vocabulary its tables use.
  const shared = readFileSync(
    require('node:path').join(__dirname, '..', '..', '..', 'src', 'shared', 'illustration-scene.ts'),
    'utf8'
  );
  const painted = new Set(
    (shared.match(/data-scene-primitive="([a-z-]+)"/g) || []).map((m) =>
      m.slice('data-scene-primitive="'.length, -1)
    )
  );
  assert.ok(painted.size >= 8, `only ${painted.size} primitives painted by the composer`);
  // Every primitive any published scene/backdrop spec may name must be painted.
  const named = new Set<string>();
  for (const spec of [...Object.values(SCENE_BACKDROPS), ...ILLUSTRATION_CATEGORY_IDS.map((id) => getSceneSpec(id))]) {
    for (const slot of ['sky', 'horizon', 'standing', 'fg'] as const) {
      const value = (spec as unknown as Record<string, unknown>)[slot];
      for (const name of Array.isArray(value) ? value : [value]) {
        if (typeof name === 'string' && name !== 'none') named.add(name);
      }
    }
  }
  assert.ok(named.size >= 12, `only ${named.size} primitives named by the scene tables`);
  for (const primitive of named) {
    assert.ok(painted.has(primitive), `scene tables name '${primitive}' but the composer paints no such layer item`);
  }
});

test('each palette carries its own sky and ground band', () => {
  const palettes: Record<string, { sky?: string; ground?: string }> = {};
  for (const category of ILLUSTRATION_CATEGORY_IDS) palettes[category] = getIllustrationPalette(category);
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
