/**
 * Phase B — `lesson:patch-item-assets` may change one item's artwork and nothing
 * else (docs/DECISIONS.md #72).
 *
 * The channel is a write path reachable from the renderer, so the tests are
 * written adversarially: they feed the patch values a compromised renderer
 * would send (prompt rewrites, ids, links, wrong types) and assert that the only
 * keys that ever change are `contentCategory`, `iconName`, `illustrationAssetId`.
 *
 * Three separate things are pinned down here, because all three have already
 * gone wrong in this area once:
 *  1. the whitelist itself (`applyItemAssetPatch`);
 *  2. the draft-level rules (`patchDraftItemAssets`): treasure stores the
 *     artwork on the nested question, and every write is re-validated;
 *  3. **matching pairs keep their artwork at all.** The editor has written the
 *     three keys into matching pairs since #65, but `matchingPairSchema` did not
 *     declare them, so zod stripped them before the adapter saw them. A test
 *     that only exercised the adapter would still be green with that bug.
 */
import assert from 'node:assert/strict';
import { fromEducationalGame, toEducationalGame } from '../../src/services/game/game-project-adapter';
import { parseGameDraft } from '../../src/services/lesson/lesson-contracts';
import { patchDraftItemAssets, LessonItemError } from '../../src/services/lesson/lesson-item-repair';
import { applyItemAssetPatch, ITEM_ASSET_PATCH_KEYS } from '../../src/shared/asset-validation';
import type { GameConfig, GameDraft, GameProject } from '../../src/shared/lesson-types';

const ISO = '2026-01-01T00:00:00.000Z';

function configFor(draft: GameDraft): GameConfig {
  const base = {
    title: 'Trò chơi kiểm thử',
    subject: 'Toán',
    grade: 'Lớp 5',
    topic: 'Kiến thức chung',
    audience: 'child' as const,
    durationMinutes: 15,
    difficulty: 'trung bình' as const,
    playMode: 'individual' as const,
    style: 'fun' as const,
    focusObjectiveIds: [] as string[],
    generationMode: 'fast' as const
  };
  switch (draft.gameType) {
    case 'arena':
      return { ...base, gameType: 'arena', questionCount: draft.questions.length, scoringMode: 'basic', pointsPerCorrect: 100, timeBonus: 10 };
    case 'scenario':
      return { ...base, gameType: 'scenario', situationCount: draft.situations.length, scoringMode: 'quality' };
    case 'matching':
      return { ...base, gameType: 'matching', pairCount: draft.pairs.length, matchingMode: draft.mode, wrongPenalty: 0 };
    case 'treasure':
      return { ...base, gameType: 'treasure', stageCount: draft.stages.length, attemptsPerStage: 0, journeyBonus: draft.journeyBonus, hiddenItemBonus: draft.hiddenItemBonus };
    case 'race':
      return { ...base, gameType: 'race', trackLength: draft.trackLength, maxRounds: draft.maxRounds, teamCount: draft.teams.length, stepByDifficulty: draft.stepByDifficulty, luckEnabled: draft.luckEnabled };
    default:
      throw new Error('unknown draft');
  }
}



function projectFor(draft: GameDraft): GameProject {
  return {
    id: 'project-patch', schemaVersion: 1, status: 'draft', step: 'edit',
    title: 'Trò chơi kiểm thử', description: 'Mô tả kiểm thử.', tags: ['AI tạo'],
    sourceName: 'bai-giang.txt', lesson: null, analysisId: null, recommendationId: null,
    config: configFor(draft), draft, gameSnapshot: null, gameId: null,
    createdAt: ISO, updatedAt: ISO
  };
}


const arenaDraft = parseGameDraft({
  gameType: 'arena',
  schemaVersion: 1,
  questions: [
    {
      id: 'q1', type: 'multiple-choice', prompt: 'Con mèo kêu thế nào?',
      options: [{ id: 'a', text: 'Meo' }, { id: 'b', text: 'Gâu' }],
      correctOptionId: 'a', explanation: 'Mèo kêu meo.', difficulty: 'dễ', points: 100,
      contentCategory: 'animals', iconName: 'paw-print'
    },
    {
      id: 'q2', type: 'multiple-choice', prompt: 'Con chó kêu thế nào?',
      options: [{ id: 'a', text: 'Meo' }, { id: 'b', text: 'Gâu' }],
      correctOptionId: 'b', explanation: 'Chó sủa gâu gâu.', difficulty: 'dễ', points: 100
    }
  ]
}) as Extract<GameDraft, { gameType: 'arena' }>;

const matchingDraft = parseGameDraft({
  gameType: 'matching',
  schemaVersion: 1,
  mode: 'columns',
  pairs: [
    { id: 'p1', left: 'Mèo', right: 'Con vật kêu meo' },
    { id: 'p2', left: 'Cây', right: 'Thực vật có lá' }
  ],
  pointsPerPair: 100, completionBonus: 0, wrongPenalty: 0, timeBonus: 0,
  bonusUnderSeconds: 0, practiceMode: false
}) as Extract<GameDraft, { gameType: 'matching' }>;

const treasureDraft = parseGameDraft({
  gameType: 'treasure',
  schemaVersion: 1,
  character: 'Nhà thám hiểm',
  intro: 'Hành trình ngắn.',
  journeyBonus: 300,
  hiddenItemBonus: 100,
  stages: [
    {
      id: 'st1', name: 'Cổng', story: 'Một câu đố.', taskDescription: 'Trả lời đúng.',
      question: {
        prompt: 'Cây cần gì để quang hợp?',
        options: [{ id: 'a', text: 'Ánh sáng' }, { id: 'b', text: 'Bóng tối' }],
        correctOptionId: 'a', explanation: 'Quang hợp cần ánh sáng.', hint: 'Nghĩ tới mặt trời.'
      },
      attempts: 3, points: 100, completionBonus: 0, nextStageId: null
    },
    {
      id: 'st2', name: 'Kho báu', story: 'Câu đố cuối.', taskDescription: 'Mở kho báu.',
      question: {
        prompt: 'Thực vật thải ra khí gì?',
        options: [{ id: 'a', text: 'Oxy' }, { id: 'b', text: 'Nitơ' }],
        correctOptionId: 'a', explanation: 'Thực vật thải oxy.', hint: 'Khí ta thở.'
      },
      attempts: 2, points: 150, completionBonus: 0, nextStageId: null
    }
  ]
}) as Extract<GameDraft, { gameType: 'treasure' }>;

/** The item at a 1-based position, as the plain object the patch works on. */
function itemOf(draft: GameDraft, position: number): Record<string, unknown> {
  const key = draft.gameType === 'scenario' ? 'situations'
    : draft.gameType === 'matching' ? 'pairs'
      : draft.gameType === 'treasure' ? 'stages' : 'questions';
  const list = (draft as unknown as Record<string, Array<Record<string, unknown>>>)[key];
  return list[position - 1];
}

function main(): void {
  // ---------------------------------------------------------------------------
  // 1. The whitelist: only three keys, ever
  // ---------------------------------------------------------------------------
  {
    const before = JSON.parse(JSON.stringify(arenaDraft.questions[0]));
    const patched = patchDraftItemAssets(arenaDraft, 1, {
      contentCategory: 'sports',
      illustrationAssetId: 'space-scene',
      // Everything below is what a malicious or buggy renderer might add.
      prompt: 'ĐÁP ÁN ĐÃ BỊ ĐỔI',
      id: 'hijacked',
      correctOptionId: 'b',
      points: 9999,
      explanation: 'rewritten',
      options: [{ id: 'a', text: 'x' }, { id: 'b', text: 'y' }]
    } as never);
    const after = itemOf(patched, 1);
    assert.equal(after.prompt, before.prompt, 'a patch cannot rewrite the question text');
    assert.equal(after.id, 'q1', 'a patch cannot change the item id');
    assert.equal(after.correctOptionId, 'a', 'a patch cannot change the correct answer');
    assert.equal(after.points, 100, 'a patch cannot change the score');
    assert.equal(after.explanation, before.explanation, 'a patch cannot rewrite the explanation');
    assert.deepEqual(after.options, before.options, 'a patch cannot replace the options');
    assert.equal(after.contentCategory, 'sports', 'the whitelisted category is applied');
    assert.equal(after.illustrationAssetId, 'space-scene', 'the whitelisted illustration is applied');
    assert.equal(after.iconName, 'paw-print', 'an absent key keeps the existing value');
    assert.deepEqual(
      [...ITEM_ASSET_PATCH_KEYS],
      ['contentCategory', 'iconName', 'illustrationAssetId'],
      'exactly three keys are patchable'
    );
    for (const key of ['prompt', 'id', 'correctOptionId', 'points', 'explanation', 'options']) {
      assert.deepEqual(after[key], before[key], `"${key}" is outside the whitelist and must never change`);
    }
  }

  // ---------------------------------------------------------------------------
  // 2. Empty strings clear; junk degrades instead of throwing
  // ---------------------------------------------------------------------------
  {
    const cleared = patchDraftItemAssets(arenaDraft, 1, { illustrationAssetId: '', iconName: '', contentCategory: '' });
    const item = itemOf(cleared, 1);
    // Measured against `parseGameDraft` rather than assumed:
    //   illustrationAssetId / iconName: '' -> the key is dropped (`tolerantText`),
    //     and the adapter + UI treat "absent" as "no pick", so absence IS the
    //     cleared state. Pinning '' here would assert a value nothing else sees.
    //   contentCategory: 'general' is a real category and survives as itself.
    assert.equal(item.illustrationAssetId, undefined, 'an empty id clears the pick (the schema drops the key)');
    assert.equal(item.iconName, undefined, 'an empty icon clears the explicit icon');
    assert.equal(item.contentCategory, 'general', 'an empty category is stored as `general`, never an error');
    const clearedGame = toEducationalGame(projectFor(cleared)) as unknown as {
      questions: Array<Record<string, unknown>>;
    };
    assert.equal(
      clearedGame.questions[0].illustrationAssetId,
      undefined,
      'a cleared pick survives the adapter as "no artwork" (not as a stale id)'
    );

    const unknown = patchDraftItemAssets(arenaDraft, 1, { contentCategory: 'not-a-category', iconName: 'not-an-icon' });
    const unknownItem = itemOf(unknown, 1);
    assert.equal(unknownItem.contentCategory, 'general', 'an unknown category degrades to general');
    assert.equal(unknownItem.iconName, undefined, 'an unknown icon degrades to no icon (the key is dropped)');
    assert.deepEqual(
      toEducationalGame(projectFor(unknown)).questions[0].iconName,
      undefined,
      'and the adapter agrees: an unknown icon never reaches the play surface'
    );

    const junk = applyItemAssetPatch({ id: 'x' }, { contentCategory: 42, iconName: {}, illustrationAssetId: [] });
    assert.equal(junk.item.contentCategory, 'general', 'non-string values degrade, they never throw');
    assert.equal(junk.changed, true, 'the keys were present, so the call is a write');
    const empty = applyItemAssetPatch({ id: 'x' }, {});
    assert.equal(empty.changed, false, 'a patch with no whitelisted key is not a write');
  }

  // ---------------------------------------------------------------------------
  // 3. Positions: 1-based, valid only inside the item list
  // ---------------------------------------------------------------------------
  {
    assert.throws(
      () => patchDraftItemAssets(arenaDraft, 3, { contentCategory: 'math' }),
      (error: unknown) => error instanceof LessonItemError && error.code === 'ITEM_INDEX_INVALID',
      'an out-of-range position is rejected instead of writing the last item'
    );
    assert.throws(
      () => patchDraftItemAssets(arenaDraft, 0, { contentCategory: 'math' }),
      (error: unknown) => error instanceof LessonItemError && error.code === 'ITEM_INDEX_INVALID',
      'position 0 is rejected (positions are 1-based everywhere)'
    );
  }

  // ---------------------------------------------------------------------------
  // 4. Treasure: the artwork belongs to the nested question
  // ---------------------------------------------------------------------------
  {
    const patched = patchDraftItemAssets(treasureDraft, 2, { illustrationAssetId: 'plants-scene' });
    const stage = itemOf(patched, 2);
    const question = stage.question as Record<string, unknown>;
    assert.equal(question.illustrationAssetId, 'plants-scene', 'the pick lands on the question the renderer reads');
    assert.equal(stage.illustrationAssetId, undefined, 'the stage itself must not grow an artwork key');
    assert.equal(stage.story, 'Câu đố cuối.', 'the story is untouched');
    assert.equal(stage.nextStageId, null, 'the chain is untouched');
    assert.equal(stage.attempts, 2, 'the attempt budget is untouched');
    // And it survives the adapter, which is what the play surface reads.
    const game = toEducationalGame({ ...projectFor(patched), draft: patched });
    assert.equal(game.treasureHunt?.stages[1].question.illustrationAssetId, 'plants-scene', 'the adapter carries it to the game');
    assert.deepEqual(itemOf(patched, 1).question, itemOf(treasureDraft, 1).question, 'the other stage question is byte-identical');
  }

  // ---------------------------------------------------------------------------
  // 5. Matching pairs keep artwork (regression: the schema used to strip it)
  // ---------------------------------------------------------------------------
  {
    const patched = patchDraftItemAssets(matchingDraft, 1, { contentCategory: 'animals', illustrationAssetId: 'animals-scene' });
    const pair = itemOf(patched, 1);
    assert.equal(pair.contentCategory, 'animals', 'the draft pair keeps its category');
    assert.equal(pair.illustrationAssetId, 'animals-scene', 'the draft pair keeps its illustration');
    assert.equal(pair.left, 'Mèo', 'the pair text is untouched');

    const game = toEducationalGame({ ...projectFor(patched), draft: patched });
    const gamePair = game.matchingGame?.pairs[0];
    assert.equal(gamePair?.illustrationAssetId, 'animals-scene', 'the adapter keeps the pair illustration in the game');
    assert.equal(gamePair?.contentCategory, 'animals', 'the adapter keeps the pair category in the game');

    const back = fromEducationalGame(game).draft as Extract<GameDraft, { gameType: 'matching' }>;
    assert.equal(back.pairs[0].illustrationAssetId, 'animals-scene', 'game -> draft round trip keeps it');
    assert.equal(back.pairs[1].illustrationAssetId, undefined, 'the untargeted pair gains nothing');
    assert.equal(back.pairs[1].left, 'Cây', 'and its text is unchanged');
  }

  // ---------------------------------------------------------------------------
  // 6. Only the targeted item changes; the rest of the draft is byte-stable
  // ---------------------------------------------------------------------------
  {
    const patched = patchDraftItemAssets(arenaDraft, 1, { contentCategory: 'sports' });
    assert.deepEqual(itemOf(patched, 2), itemOf(arenaDraft, 2), 'the other item is byte-identical');
    const withoutPatched = JSON.parse(JSON.stringify(patched)) as Record<string, unknown[]>;
    const original = JSON.parse(JSON.stringify(arenaDraft)) as Record<string, unknown[]>;
    withoutPatched.questions.splice(0, 1);
    original.questions.splice(0, 1);
    assert.deepEqual(withoutPatched, original, 'nothing outside the targeted item changed');
    assert.equal(withoutPatched.questions.length, 1, 'exactly one item was removed from each copy');
  }

  console.log('item-assets-patch tests passed');
}

main();

