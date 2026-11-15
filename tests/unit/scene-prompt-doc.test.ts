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
  SCENE_BLUEPRINT_MAX_BYTES,
  SCENE_BACKDROP_IDS,
  SCENE_COMPARE_SIGNS,
  SCENE_COMPARE_SUB_ICON_POSITIONS,
  SCENE_ICON_IDS,
  SCENE_LAYOUT_IDS,
  SCENE_PALETTE_KEYS,
  SCENE_SUB_ICON_POSITIONS,
} from '../../src/shared/scene-asset-catalog';
import { normalizeSceneBlueprint } from '../../src/shared/scene-blueprint';

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
  const next = tail
    .slice(1)
    .search(/\n(?:layout|backdrop|paletteKey|mainIcon|compareIcon|compareSign|subIcons|props)\b/);
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

test('ground props are offered from the same list and capped at two', () => {
  assert.match(vocabBlock(), /props[^:]*:\s*cùng danh sách trên/);
  assert.match(promptBlock(), /Tối đa 2 props/);
  // A prop that repeats the subject or a sub icon would be dropped by the
  // normaliser, so a model that does it loses an object silently.
  assert.match(promptBlock(), /KHÁC mọi subIcons/);
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

test('the prompt offers exactly the layouts the engine can draw', () => {
  assert.deepEqual(idsFor('layout').sort(), [...SCENE_LAYOUT_IDS].sort());
  const prompt = promptBlock();
  assert.match(prompt, /"v": 1/);
  // A layout the engine cannot draw is worse than no layout at all: the
  // normaliser drops compare-less blueprints to `single`, and any other id
  // returns null, which renders an empty column.
  assert.match(prompt, /"layout":\s*"single"/);
  assert.match(prompt, /"layout":\s*"compare"/);
  for (const missing of ['process', 'surround']) {
    assert.ok(!new RegExp('"layout":\\s*"' + missing + '"').test(prompt), `${missing} is offered but not implemented`);
  }
});

test('the prompt offers exactly the comparison signs the engine can draw', () => {
  assert.deepEqual(idsFor('compareSign').sort(), [...SCENE_COMPARE_SIGNS].sort());
  // The sign is an id, never a glyph: the engine draws > < = with paths, so a
  // model that sends ">" or "larger" is rejected.
  const prompt = promptBlock();
  assert.match(prompt, /"compareSign":\s*"greater-than"/);
});

test('the second subject points at the icon list and must differ from the first', () => {
  assert.match(vocabBlock(), /compareIcon[^:]*:\s*cùng danh sách trên/);
  // The normaliser drops a compareIcon equal to mainIcon and degrades the whole
  // scene to `single`, so the prompt has to say it out loud.
  const block = vocabBlock();
  const line = block.slice(block.indexOf('compareIcon'), block.indexOf('compareSign'));
  assert.match(line, /khác mainIcon/);
});

test('compare restricts corner icons to the corners the engine actually keeps', () => {
  const block = vocabBlock();
  // In compare the two upper corners hold the two subjects' heads only, and the
  // normaliser MOVES left/right up. Telling a model it may use them would waste
  // an object on a silent re-layout.
  for (const kept of SCENE_COMPARE_SUB_ICON_POSITIONS) {
    assert.ok(block.includes(kept), `the prompt does not mention the compare corner "${kept}"`);
  }
  assert.match(block, /Khi layout = compare chỉ dùng top-left và top-right/);
  // Both single-layout corners still have to be documented for `single`.
  for (const slot of SCENE_SUB_ICON_POSITIONS) {
    assert.ok(block.includes(slot), `the prompt does not mention the corner "${slot}"`);
  }
});

test('the prompt caps sub-icons lower in compare than in single', () => {
  const prompt = promptBlock();
  assert.match(prompt, /Tối đa 4 subIcons \(chỉ 2 khi layout = compare\)/);
});

/** Every balanced `{...}` object in the prompt, in order — the worked examples.
 *  They are the only JSON a model is told to imitate, so they must survive the
 *  same gate their real output goes through. */
function exampleObjects(): string[] {
  const text = promptBlock();
  const found: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        found.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return found;
}
test('every worked example in the prompt normalises into a real blueprint', () => {
  const examples = exampleObjects().filter((object) => /"v"\s*:/.test(object));
  assert.ok(examples.length >= 2, `the prompt shows only ${examples.length} worked example(s)`);
  const layouts = new Set<string>();
  for (const example of examples) {
    const issues: string[] = [];
    const blueprint = normalizeSceneBlueprint(example, issues);
    assert.ok(blueprint, `an example is not a valid blueprint (issues: ${issues.join(',')}): ${example}`);
    // Zero issues means nothing was dropped: a model imitating this example keeps
    // every object it chose. `compare`-specific degradation shows up here.
    assert.deepEqual(issues, [], `an example loses parts when normalised: ${example}`);
    assert.ok(Buffer.byteLength(example, 'utf8') <= SCENE_BLUEPRINT_MAX_BYTES, 'an example is over the byte ceiling');
    layouts.add(blueprint.layout);
  }
  assert.deepEqual([...layouts].sort(), [...SCENE_LAYOUT_IDS].sort(), 'the prompt does not show one example per layout');
});

test('the prompt never asks a model to fill in a placeholder', () => {
  // `"mainIcon": "..."` is the retired draft's habit. A model that copies it
  // produces an unknown id, the normaliser returns null, and the question shows
  // an empty frame with nothing thrown.
  assert.ok(!/"\s*(?:mainIcon|backdrop|paletteKey|compareIcon|compareSign|icon)\s*"\s*:\s*"\.\.\."/.test(promptBlock()), 'the prompt still contains a "..." placeholder');
  assert.ok(!/"\.\.\."/.test(promptBlock()), 'the prompt still contains a "..." placeholder');
});
