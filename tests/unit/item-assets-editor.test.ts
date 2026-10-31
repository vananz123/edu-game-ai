/**
 * Phase 4 — the game editor must not erase per-item asset metadata
 * (docs/DECISIONS.md #64, #65, #66).
 *
 * The editor rebuilds every item object field by field from the DOM, so a field
 * it does not read is a field it deletes. These tests pin the two halves of the
 * fix:
 *  - `itemAssetFieldsForSave` decides what is persisted (general/unknown omitted,
 *    matching `itemAssetsFromDraft` in the project adapter);
 *  - the round trip through the project adapter and JSON keeps a populated item
 *    populated, and leaves an old item without the fields exactly as it was.
 *
 * The DOM half (`readEditorItemAssets`) cannot run here: the renderer is loaded
 * as classic scripts in Electron with no DOM in Node. It is exercised against a
 * live built app over CDP by `npm run check:item-assets-ui`
 * (tests/ui/ui-item-assets-editor-check.js), which reads the saved game back
 * through the real IPC bridge.
 */
import assert from 'node:assert/strict';
import { itemAssetFieldsForSave, normalizeIllustrationMode } from '../../src/shared/asset-validation';
import { fromEducationalGame, toEducationalGame } from '../../src/services/game/game-project-adapter';
import type { EducationalGame } from '../../src/shared/types';

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

// --- what gets saved -------------------------------------------------------

test('a full item keeps all three keys', () => {
  const fields = itemAssetFieldsForSave({
    contentCategory: 'animals',
    iconName: 'paw-print',
    illustrationAssetId: 'savanna-fox',
  });
  assert.deepEqual(fields, {
    contentCategory: 'animals',
    iconName: 'paw-print',
    illustrationAssetId: 'savanna-fox',
  });
});

test('general is omitted rather than written', () => {
  const fields = itemAssetFieldsForSave({ contentCategory: 'general', iconName: '', illustrationAssetId: null });
  assert.deepEqual(fields, {}, 'a missing category already means general');
});

test('unknown category and unknown icon are dropped, not stored', () => {
  const fields = itemAssetFieldsForSave({ contentCategory: 'physics', iconName: 'Atom', illustrationAssetId: '  ' });
  assert.deepEqual(fields, {}, 'physics is not in the 25-category registry; Atom is a PascalCase Lucide name');
});

test('blank and wrong-typed input never throws and never invents fields', () => {
  for (const input of [null, undefined, {}, { contentCategory: 42, iconName: {}, illustrationAssetId: [] }]) {
    assert.deepEqual(itemAssetFieldsForSave(input as never), {});
  }
});

test('returned object does not alias its input', () => {
  const source = { contentCategory: 'math', iconName: 'calculator' };
  const fields = itemAssetFieldsForSave(source);
  fields.contentCategory = 'history';
  assert.equal(source.contentCategory, 'math', 'mutating the result must not touch the caller item');
});

test('illustration mode normalises to auto/manual/off', () => {
  assert.equal(normalizeIllustrationMode('manual'), 'manual');
  assert.equal(normalizeIllustrationMode('off'), 'off');
  assert.equal(normalizeIllustrationMode(undefined), 'auto');
  assert.equal(normalizeIllustrationMode('bogus'), 'auto');
});

// --- round trip ------------------------------------------------------------

const baseGame: EducationalGame = {
  id: 'game-assets-1',
  title: 'Động vật quanh em',
  subject: 'Tự nhiên và Xã hội',
  grade: '2',
  topic: 'Động vật',
  template: 'quiz',
  description: 'Bài ôn tập.',
  sourceName: 'Động vật quanh em.docx',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  tags: [],
  questions: [],
  gameSetup: { illustrationMode: 'manual' },
};

test('game -> project -> game keeps item assets and the illustration mode', () => {
  const game: EducationalGame = {
    ...baseGame,
    questions: [{
      id: 'q1',
      type: 'multiple-choice',
      prompt: 'Con nào kêu “gâu gâu”?',
      points: 100,
      explanation: 'Chó sủa “gâu gâu”.',
      options: [{ id: 'a', text: 'Con chó' }, { id: 'b', text: 'Con mèo' }],
      correctOptionId: 'a',
      contentCategory: 'animals',
      iconName: 'paw-print',
      illustrationAssetId: 'savanna-fox',
    }],
  };
  const reloaded = JSON.parse(JSON.stringify(toEducationalGame(fromEducationalGame(game)))) as EducationalGame;
  const q = reloaded.questions[0];
  assert.equal(q.contentCategory, 'animals');
  assert.equal(q.iconName, 'paw-print');
  assert.equal(q.illustrationAssetId, 'savanna-fox');
  assert.equal(reloaded.gameSetup?.illustrationMode, 'manual', 'the teacher choice must survive the adapter');
});

test('a legacy item without the fields round-trips without gaining them', () => {
  const game: EducationalGame = {
    ...baseGame,
    gameSetup: undefined,
    questions: [{
      id: 'q1',
      type: 'multiple-choice',
      prompt: 'Câu cũ',
      points: 100,
      explanation: 'Giải thích cũ.',
      options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }],
      correctOptionId: 'a',
    }],
  };
  const reloaded = JSON.parse(JSON.stringify(toEducationalGame(fromEducationalGame(game)))) as EducationalGame;
  const q = reloaded.questions[0] as unknown as Record<string, unknown>;
  assert.equal('contentCategory' in q, false);
  assert.equal('iconName' in q, false);
  assert.equal('illustrationAssetId' in q, false);
  assert.equal(reloaded.gameSetup?.illustrationMode, undefined, 'no mode must not be invented');
});

console.log(`\n${passed} item-asset editor round-trip checks passed.`);
