// #280 — the scene icons draw Microsoft Fluent Emoji art.
//
// This file guards four separate risks that a "swap the artwork" change carries:
//
// 1. COVERAGE — an id the prompt can name must have art, otherwise the AI is
//    told about a picture the engine draws as a stroke icon (or not at all).
// 2. LICENCE HYGIENE — MIT permits bundling, but not if the artwork drags in a
//    remote reference or executable markup, and not without attribution.
// 3. RUNTIME OFFLINE — nothing may be fetched; an `http` in the body would work
//    on a dev machine and fail in a classroom with no network.
// 4. ID COLLISION — SVG ids are document-global. The editor preview and the play
//    stage can show the same icon at the same time, so a duplicate id would make
//    the second copy borrow the first one's gradient.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { EMOJI_ART, EMOJI_ART_SOURCE } from '../../src/shared/emoji-art.generated';
import { SCENE_ICON_IDS } from '../../src/shared/scene-asset-catalog';
import { ICON_NODES, renderIconSvg } from '../../src/shared/icon-registry';

const ROOT = join(__dirname, '..', '..', '..');
const FORBIDDEN = ['http://', 'https://', '<script', '<image', '<foreignObject', 'xlink:href', 'javascript:'];

test('every scene icon has art, and no art is orphaned', () => {
  const artIds = Object.keys(EMOJI_ART).sort();
  assert.deepEqual(artIds, [...SCENE_ICON_IDS].sort(), 'EMOJI_ART and SCENE_ICON_IDS disagree');
  assert.equal(artIds.length, 41, 'the scene icon list is 41 ids');
  assert.match(EMOJI_ART_SOURCE, /fluentui-emoji/);
});

test('the art is offline, inert markup', () => {
  for (const id of Object.keys(EMOJI_ART)) {
    const art = EMOJI_ART[id];
    assert.ok(art.body.length > 0, `${id} has an empty body`);
    assert.match(art.viewBox, /^0 0 \d+ \d+$/, `${id} viewBox is not a plain box`);
    for (const bad of FORBIDDEN) {
      assert.equal(art.body.includes(bad), false, `${id} art contains ${bad}`);
    }
  }
});

test('every id inside the art is namespaced per icon and globally unique', () => {
  const seen = new Map<string, string>();
  for (const id of Object.keys(EMOJI_ART)) {
    const art = EMOJI_ART[id];
    const ids = [...art.body.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
    for (const inner of ids) {
      assert.ok(inner.startsWith(`e-${id}-`), `${id} leaks a bare id "${inner}"`);
      const owner = seen.get(inner);
      assert.equal(owner, undefined, `id "${inner}" appears in both ${owner} and ${id}`);
      seen.set(inner, id);
    }
    // Every reference must point at a namespaced id, never at a bare one.
    for (const ref of [...art.body.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1])) {
      assert.ok(ref.startsWith(`e-${id}-`), `${id} references a foreign id "${ref}"`);
    }
  }
});

test('the art stays small enough to ship, and renders as a stroke-free svg', () => {
  let total = 0;
  for (const id of Object.keys(EMOJI_ART)) {
    const size = EMOJI_ART[id].body.length;
    total += size;
    assert.ok(size < 8 * 1024, `${id} art is ${size} bytes, over the 8 KiB per-icon budget`);
    const svg = renderIconSvg(id, { size: 40 });
    assert.ok(svg.includes('stroke="none"'), `${id} would inherit a Lucide stroke`);
    assert.ok(svg.includes(`emoji-${id}`), `${id} lost its class hook`);
    assert.ok(svg.includes('width="40"'), `${id} ignored the requested size`);
  }
  // 41 icons of flat art. The budget is deliberately loose: it exists to catch an
  // accidental "embed the 3D PNGs" or "embed every emoji" regression, not to pin
  // an exact number that a licence-compatible art tweak would break.
  assert.ok(total < 120 * 1024, `art totals ${Math.round(total / 1024)} KiB, over the 120 KiB budget`);
});

test('the Lucide fallback is intact: scene ids still resolve as icons too', () => {
  // Ids are shared on purpose: the art is an implementation detail behind an id.
  // If a future cleanup deleted the Lucide node for `apple`, every saved game
  // still renders — but the prompt vocabulary and the editor list would point at
  // an id half the app can no longer draw.
  for (const id of SCENE_ICON_IDS) {
    assert.ok(Object.prototype.hasOwnProperty.call(ICON_NODES, id), `${id} lost its Lucide fallback`);
  }
  assert.equal(renderIconSvg('nope'), '', 'unknown names still render nothing');
  assert.ok(renderIconSvg('layout-grid').includes('lucide-layout-grid'), 'interface icons stay Lucide');
});

test('the licence is recorded next to the art, not only in a chat log', () => {
  const notices = readFileSync(join(ROOT, 'docs', 'THIRD_PARTY_NOTICES.md'), 'utf8');
  assert.match(notices, /Fluent Emoji/i);
  assert.match(notices, /MIT/);
  assert.match(notices, /Microsoft/);
  const generated = readFileSync(join(ROOT, 'src', 'shared', 'emoji-art.generated.ts'), 'utf8');
  assert.match(generated, /MIT License/, 'the generated file must carry its own attribution');
  assert.match(generated, /Microsoft/);
});
