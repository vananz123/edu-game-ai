// scene-prompt-doc.test.ts — the P3 prompt must not drift from the real catalogue.
//
// The old design doc listed assets that do not exist (`garden-day`, `tree`,
// `water-drop`, `default-pastel`) and told a model to emit raw SVG. Both are
// silent failures: a model following the doc returns a blueprint that
// `normalizeSceneBlueprint` rejects, so every question renders an EMPTY scene and
// nothing throws. This test is the only thing that can see that, because a doc
// cannot typecheck.
//
// Contract: the block between SCENE-PROMPT-VOCAB:START / END lists exactly the
// ids the code knows, and the prompt block itself never asks for markup.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  SCENE_BACKDROP_IDS,
  SCENE_ICON_IDS,
  SCENE_PALETTE_KEYS,
} from '../../src/shared/scene-asset-catalog';

const DOC = readFileSync(path.join(__dirname, '..', '..', '..', 'docs', 'AI_SCENE_DIRECTOR_DESIGN.md'), 'utf8');

const START = 'SCENE-PROMPT-VOCAB:START';
const END = 'SCENE-PROMPT-VOCAB:END';

/** The delimited vocabulary block, or '' when a marker is missing.
 *  Scoped to the prompt fence: the prose of §5.1 also mentions the marker names,
 *  so searching the whole document would slice from the wrong place. */
function vocabBlock(): string {
  const prompt = promptBlock();
  const from = prompt.indexOf(START);
  const to = prompt.indexOf(END);
  if (from === -1 || to === -1 || to < from) return '';
  return prompt.slice(from + START.length, to);
}

/** Comma-separated ids that follow `key ...:` inside the vocabulary block. */
function idsFor(key: string): string[] {
  const block = vocabBlock();
  const start = block.search(new RegExp('\\b' + key + '\\b[^:]*:'));
  if (start === -1) return [];
  const tail = block.slice(start);
  const next = tail.slice(1).search(/\n(?:backdrop|paletteKey|mainIcon|subIcons)\b/);
  const section = next === -1 ? tail : tail.slice(0, next + 1);
  const body = section.slice(section.indexOf(':') + 1);
  return body
    .split(',')
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter((part) => part.length > 0);
}

/** The prompt fenced block under "### 5.2 Prompt" — the text a model will see. */
function promptBlock(): string {
  const heading = DOC.indexOf('### 5.2 Prompt');
  assert.ok(heading >= 0, 'the design doc lost its "### 5.2 Prompt" heading');
  const open = DOC.indexOf('```', heading);
  const close = DOC.indexOf('```', open + 3);
  assert.ok(open >= 0 && close > open, 'the prompt fenced block is missing');
  return DOC.slice(open + 3, close);
}

test('the prompt vocabulary block exists and is marked', () => {
  assert.ok(vocabBlock().length > 0, 'SCENE-PROMPT-VOCAB markers are missing from the design doc');
});

test('the prompt lists every backdrop the engine can draw, and nothing else', () => {
  assert.deepEqual(idsFor('backdrop').sort(), [...SCENE_BACKDROP_IDS].sort());
});

test('the prompt lists every palette key the engine can draw, and nothing else', () => {
  assert.deepEqual(idsFor('paletteKey').sort(), [...SCENE_PALETTE_KEYS].sort());
});

test('the prompt lists every allowed icon, and nothing else', () => {
  assert.deepEqual(idsFor('mainIcon').sort(), [...SCENE_ICON_IDS].sort());
});

test('sub-icons point at the same list instead of a second one that can drift', () => {
  assert.match(vocabBlock(), /subIcons[^:]*:\s*cùng danh sách trên/);
});

test('the prompt never asks a model for markup, a URL or a fixed canvas', () => {
  // A model that emits SVG would bypass every gate the product has: the
  // normaliser rejects markup, so the scene would be empty — and if markup ever
  // did get rendered, inline SVG is executable (script, onload, remote href).
  const prompt = promptBlock();
  for (const banned of ['<svg', '</svg', '<image', '<script', '<iframe', 'viewBox=', 'onload', 'http://', 'https://']) {
    assert.ok(!prompt.includes(banned), `the prompt contains "${banned}", which invites markup or network use`);
  }
  assert.match(prompt, /KHÔNG viết mã SVG/);
});

test('the prompt never names an asset that does not exist', () => {
  // These are the real names from the retired draft. A model given any of them
  // returns a blueprint whose mainIcon/backdrop is unknown -> normaliser says
  // null -> the question renders an empty column.
  const prompt = promptBlock();
  for (const ghost of ['garden-day', 'night-sky', 'lab-science', 'nature-hills', 'ocean-sea', 'default-scene', 'default-pastel', 'water-drop', 'arrow-right', 'grass-tuft']) {
    assert.ok(!prompt.includes(ghost), `the prompt still offers the non-existent id "${ghost}"`);
  }
  // `tree` and `cat` are substrings of real ids? No: neither exists as an id, and
  // both appeared in the retired draft as *examples* of icons.
  const listed = new Set(idsFor('mainIcon'));
  for (const ghost of ['tree', 'cat', 'dog', 'atom', 'flask-triangle']) {
    assert.ok(!listed.has(ghost), `"${ghost}" is offered as an icon but the engine cannot draw it`);
  }
});

test('the prompt pins the blueprint version and the only layout that exists', () => {
  const prompt = promptBlock();
  assert.match(prompt, /"v": 1/);
  assert.match(prompt, /"layout": "single"/);
  // P1/P2 will add layouts; until the engine draws them, the prompt must say so.
  for (const missing of ['compare', 'process', 'surround']) {
    assert.ok(!new RegExp('"layout": "(?:' + missing + ')"').test(prompt), `${missing} is offered but not implemented`);
  }
});
