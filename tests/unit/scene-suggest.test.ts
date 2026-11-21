// scene-suggest.test.ts — the "gợi ý cảnh" pipeline must never leave a question bare.
//
// The channel is not wired yet (no `scene:suggest` in Rust), but the contract it
// will have to honour is testable today with a fake model: build the prompt from
// the catalogue, extract the JSON from whatever prose surrounds it, run the same
// `normalizeSceneBlueprint` that guards SQLite, and fall back to the deterministic
// category scene when the reply cannot be drawn.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SCENE_BACKDROP_IDS,
  SCENE_BLUEPRINT_MAX_BYTES,
  SCENE_COMPARE_SIGNS,
  SCENE_ICON_IDS,
  SCENE_LAYOUT_IDS,
  SCENE_PALETTE_KEYS,
} from '../../src/shared/scene-asset-catalog';
import { sceneBlueprintFromCategory } from '../../src/shared/scene-blueprint';
import {
  SCENE_SUGGEST_MAX_INPUT_CHARS,
  SCENE_SUGGEST_MAX_REPLY_CHARS,
  buildSceneSuggestPrompt,
  extractJsonObject,
  suggestSceneBlueprint,
} from '../../src/services/ai/scene-suggest';

const QUESTION = {
  prompt: 'Con vật nào lớn hơn: kiến hay voi?',
  answers: ['Con kiến', 'Con voi'],
  category: 'animals',
  iconName: 'paw-print',
  grade: '3',
  subject: 'Tự nhiên',
};

/** Ids listed after `key ...:` on its own line of the built prompt. */
function idsFor(prompt: string, key: string): string[] {
  const line = prompt
    .split('\n')
    .find((row) => row.startsWith(key + ' ('));
  assert.ok(line, `the built prompt has no "${key}" line`);
  return line
    .slice(line.indexOf(':') + 1)
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

test('the built prompt offers exactly the catalogue, not a copied list', () => {
  const prompt = buildSceneSuggestPrompt(QUESTION);
  assert.deepEqual(idsFor(prompt, 'backdrop').sort(), [...SCENE_BACKDROP_IDS].sort());
  assert.deepEqual(idsFor(prompt, 'paletteKey').sort(), [...SCENE_PALETTE_KEYS].sort());
  assert.deepEqual(idsFor(prompt, 'mainIcon').sort(), [...SCENE_ICON_IDS].sort());
  assert.deepEqual(idsFor(prompt, 'compareSign').sort(), [...SCENE_COMPARE_SIGNS].sort());
  assert.deepEqual(idsFor(prompt, 'layout').sort(), [...SCENE_LAYOUT_IDS].sort());
});

test('every layout the engine draws has a rule AND a worked example in the built prompt', () => {
  // #284 — the first real model run got 3/6 layouts: it emitted
  // {"layout":"process"} with no "steps" and {"layout":"single"} with four
  // subIcons, because the shipped prompt LISTED process/surround in the
  // vocabulary but never described them and only showed single/compare examples.
  // The doc had all four; the code did not. This is the test that keeps the two
  // from drifting again: a layout without a worked example is a layout a model
  // will not choose.
  const prompt = buildSceneSuggestPrompt(QUESTION);
  for (const id of SCENE_LAYOUT_IDS) {
    assert.ok(
      new RegExp('"layout":\s*"' + id + '"').test(prompt),
      `the built prompt never shows a worked example of "${id}"`
    );
  }
  assert.match(prompt, /"steps":\[/, 'process needs its steps field in an example');
  assert.match(prompt, /"around":\[/, 'surround needs its around field in an example');
  // The rule has to NAME the shape, not just allow the id.
  assert.match(prompt, /1-2 bước TIẾP THEO/);
  assert.match(prompt, /vây quanh/);
});

test('the built prompt never invites markup, a URL or a placeholder', () => {
  const prompt = buildSceneSuggestPrompt(QUESTION);
  for (const banned of ['<svg', '<script', '<image', 'onload', 'http://', 'https://']) {
    assert.ok(!prompt.includes(banned), `the built prompt contains "${banned}"`);
  }
  assert.match(prompt, /KHÔNG viết mã SVG/);
  assert.ok(!/"\.\.\."/.test(prompt.split('ĐỊNH DẠNG ĐẦU RA')[0]), 'the rules or vocabulary contain a placeholder');
});

test('the prompt carries the question, its answers and the chosen category', () => {
  const prompt = buildSceneSuggestPrompt(QUESTION);
  assert.ok(prompt.includes(QUESTION.prompt), 'the question text is missing');
  assert.ok(prompt.includes('1. Con kiến') && prompt.includes('2. Con voi'), 'the answers are missing');
  assert.ok(prompt.includes('animals'), 'the contentCategory is missing');
  assert.ok(prompt.includes('paw-print'), 'the already-chosen icon is missing');
});

test('a long question is clipped instead of crowding out the answer format', () => {
  const prompt = buildSceneSuggestPrompt({ prompt: 'x'.repeat(5000) });
  const after = prompt.slice(prompt.indexOf('CÂU HỎI CẦN MINH HOẠ\n') + 'CÂU HỎI CẦN MINH HOẠ\n'.length);
  const questionLine = after.split('\n')[0];
  assert.ok(
    questionLine.length <= SCENE_SUGGEST_MAX_INPUT_CHARS,
    `the question line is ${questionLine.length} chars, over the ${SCENE_SUGGEST_MAX_INPUT_CHARS} cap`
  );
  assert.ok(prompt.includes('ĐỊNH DẠNG ĐẦU RA'), 'clipping removed the output format');
});

test('the same question always builds the same prompt', () => {
  // ai_tasks rows are compared with the prompt that produced them; a prompt that
  // changes between two identical calls makes that comparison meaningless.
  assert.equal(buildSceneSuggestPrompt(QUESTION), buildSceneSuggestPrompt({ ...QUESTION }));
});

test('extractJsonObject finds the object through fences and prose', () => {
  const cases: Array<[string, string]> = [
    ['{"v":1}', '{"v":1}'],
    ['```json\n{"v":1,"a":"b"}\n```', '{"v":1,"a":"b"}'],
    ['Đây là JSON:\n{"v":1}\nHy vọng giúp ích.', '{"v":1}'],
    ['{"v":1, "note": "so sánh {kiến} với [voi]"}', '{"v":1, "note": "so sánh {kiến} với [voi]"}'],
    // An UNBALANCED brace inside a string is what separates a real scanner from a
    // character count: without string awareness the slice stops at the `}` in the
    // text and the blueprint is lost mid-value.
    ['{"v":1, "note": "ngoặc } trong chuỗi"}', '{"v":1, "note": "ngoặc } trong chuỗi"}'],
    ['{"v":1, "note": "mở { ngoặc"}', '{"v":1, "note": "mở { ngoặc"}'],
    ['{"v":1}{"v":2}', '{"v":1}'],
    ['{"a":{"b":1}}', '{"a":{"b":1}}'],
  ];
  for (const [input, expected] of cases) {
    assert.equal(extractJsonObject(input), expected, `failed on: ${input.slice(0, 40)}`);
  }
});

test('extractJsonObject refuses prose, truncation and stray braces', () => {
  for (const input of ['', 'không có json ở đây', '{"v":1,"mainIcon":"paw', 'xin chào } {"v":1}']) {
    assert.equal(extractJsonObject(input), null, `should have refused: ${input.slice(0, 30)}`);
  }
});

test('a good reply is used as-is, including compare', async () => {
  const reply =
    '```json\n{"v":1,"layout":"compare","backdrop":"forest","paletteKey":"animals",' +
    '"mainIcon":"paw-print","compareIcon":"fish","compareSign":"greater-than"}\n```';
  const result = await suggestSceneBlueprint(QUESTION, async () => reply);
  assert.equal(result.source, 'model');
  assert.deepEqual(result.issues, []);
  assert.equal(result.blueprint.layout, 'compare');
  assert.equal(result.blueprint.compareSign, 'greater-than');
  assert.ok(Buffer.byteLength(result.acceptedJson, 'utf8') <= SCENE_BLUEPRINT_MAX_BYTES);
});

test('an unknown icon falls back to the category scene instead of an empty frame', async () => {
  const reply = '{"v":1,"layout":"single","backdrop":"forest","paletteKey":"animals","mainIcon":"dragon"}';
  const result = await suggestSceneBlueprint(QUESTION, async () => reply);
  assert.equal(result.source, 'fallback');
  assert.ok(result.issues.length > 0, 'the rejection was not explained');
  assert.deepEqual(result.blueprint, sceneBlueprintFromCategory('animals', 'paw-print'));
});

test('prose, an empty reply and a failed call all fall back, each with its own reason', async () => {
  const prose = await suggestSceneBlueprint(QUESTION, async () => 'Xin lỗi, tôi không chắc.');
  assert.equal(prose.source, 'fallback');
  assert.ok(prose.issues.includes('no-json'));

  const empty = await suggestSceneBlueprint(QUESTION, async () => '   ');
  assert.equal(empty.source, 'fallback');
  assert.ok(empty.issues.includes('empty-reply'));

  const failed = await suggestSceneBlueprint(QUESTION, async () => {
    throw new Error('AI local chưa chạy');
  });
  assert.equal(failed.source, 'fallback');
  assert.match(failed.issues[0], /^call:AI local chưa chạy/);
});

test('an oversized reply is refused before it is parsed', async () => {
  const huge = '{"v":1,"layout":"single","backdrop":"plain","paletteKey":"math","mainIcon":"box"},' + 'x'.repeat(SCENE_SUGGEST_MAX_REPLY_CHARS);
  const result = await suggestSceneBlueprint(QUESTION, async () => huge);
  assert.equal(result.source, 'fallback');
  assert.match(result.issues[0], /^reply-too-long:/);
});

test('an unusable compare keeps the drawing but reports the degradation', async () => {
  // Missing the second subject: the normaliser drops to `single` (#262). The
  // scene still draws, so this is a model reply with issues — not a fallback —
  // and the issue list is what tells the teacher/telemetry it was degraded.
  const reply = '{"v":1,"layout":"compare","backdrop":"sea","paletteKey":"animals","mainIcon":"fish"}';
  const result = await suggestSceneBlueprint(QUESTION, async () => reply);
  assert.equal(result.source, 'model');
  assert.equal(result.blueprint.layout, 'single');
  assert.ok(result.issues.includes('compareIcon'), `issues: ${result.issues.join(',')}`);
});
