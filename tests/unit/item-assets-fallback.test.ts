/**
 * Phase 3 — `contentCategory` is filled by the app when the model omits it
 * (docs/DECISIONS.md #63).
 *
 * The draft prompt asks for the field but explicitly allows omitting it, so the
 * two failure modes worth pinning down are:
 *  - the model omits it  -> the app must fill it, not leave it blank;
 *  - the model returns it -> the app must NOT overwrite it, even when the value
 *    disagrees with what `inferContentCategory` would have guessed. A model that
 *    knows the lesson is about animals must win over a keyword heuristic.
 *
 * This goes through `generateGameDraft` (not the helper directly) so the wiring
 * inside `validate` is covered: wrapping the wrong step, or forgetting to pass
 * the analysis, would leave every assertion below on `general`.
 */
import assert from 'node:assert/strict';
import { AiRequestRegistry } from '../../src/services/ai/ai-transport';
import { generateGameDraft, type LessonChatClient, type LessonChatRequest } from '../../src/services/lesson/lesson-workflow';
import { normalizeAnalysis } from '../../src/services/lesson/lesson-normalize';
import type { GameConfig, GameDraft, LessonAnalysis } from '../../src/shared/lesson-types';

type ArenaDraft = Extract<GameDraft, { gameType: 'arena' }>;

const ISO = '2026-01-01T00:00:00.000Z';

const analysis: LessonAnalysis = normalizeAnalysis(
  {
    subject: 'Tự nhiên và Xã hội',
    grade: 2,
    topic: 'Động vật quanh em',
    objectives: [{ description: 'Kể tên các con vật quen thuộc.', cognitiveLevel: 'remember' }],
    keyConcepts: [{ term: 'Vật nuôi', explanation: 'Con vật gần gũi trong nhà.' }],
    uncertainties: []
  },
  { id: 'a1', documentId: 'd1', createdAt: ISO, sourceDocumentIds: ['d1'] }
);

const arenaConfig: GameConfig = {
  gameType: 'arena',
  title: 'Động vật quanh em',
  subject: 'Tự nhiên và Xã hội',
  grade: 'Lớp 2',
  topic: 'Động vật quanh em',
  audience: 'child',
  durationMinutes: 10,
  difficulty: 'dễ',
  playMode: 'individual',
  style: 'fun',
  focusObjectiveIds: [],
  generationMode: 'fast',
  questionCount: 2,
  scoringMode: 'basic',
  pointsPerCorrect: 100,
  timeBonus: 10
};

class MockClient implements LessonChatClient {
  readonly calls: LessonChatRequest[] = [];
  constructor(private readonly value: unknown) {}
  async chatJson(request: LessonChatRequest): Promise<unknown> {
    this.calls.push(request);
    return this.value;
  }
}

async function draftFrom(content: unknown): Promise<{ draft: ArenaDraft; client: MockClient }> {
  const client = new MockClient(content);
  const draft = await generateGameDraft({
    client,
    registry: new AiRequestRegistry(),
    requestId: 'req-fallback',
    gameType: 'arena',
    config: arenaConfig,
    analysis
  });
  assert.equal(draft.gameType, 'arena', 'the workflow returns the arena draft it was asked for');
  return { draft: draft as ArenaDraft, client };
}

const question = (id: string, prompt: string) => ({
  id,
  type: 'multiple-choice',
  prompt,
  options: [{ id: 'a', text: 'Có' }, { id: 'b', text: 'Không' }],
  correctOptionId: 'a',
  explanation: 'Theo bài học.',
  difficulty: 'dễ',
  points: 100
});

async function main(): Promise<void> {
  // --- The model omits the field: the app fills it -------------------------
  {
    const { draft, client } = await draftFrom({
      gameType: 'arena',
      questions: [question('q1', 'Con mèo kêu thế nào?'), question('q2', 'Con chó có mấy chân?')]
    });
    assert.equal(client.calls.length, 1, 'one model call, no retry caused by the asset fields');
    assert.equal(draft.questions.length, 2, 'nothing is dropped when the key is missing');
    for (const item of draft.questions) {
      assert.equal(item.contentCategory, 'animals', `"${item.prompt}" is inferred as animals, got ${item.contentCategory}`);
      assert.equal(item.iconName, undefined, 'the app does not invent an icon');
      assert.equal(item.illustrationAssetId, undefined, 'the app does not invent an illustration');
    }
  }

  // --- The model returns the field: it must win ----------------------------
  {
    const { draft } = await draftFrom({
      gameType: 'arena',
      questions: [
        // "mèo"/"chó" would infer `animals`; the model says sports. Keep sports.
        { ...question('q1', 'Con mèo chạy nhanh như thế nào?'), contentCategory: 'sports', iconName: 'trophy' },
        question('q2', 'Con chó có mấy chân?')
      ]
    });
    assert.equal(draft.questions[0].contentCategory, 'sports', 'an explicit model value is never overwritten by inference');
    assert.equal(draft.questions[0].iconName, 'trophy', 'an explicit icon is kept');
    assert.equal(draft.questions[1].contentCategory, 'animals', 'the omitted item is still filled');
  }

  // --- A model value outside the list is kept as-is ------------------------
  // Normalising is the adapter's job (#60); doing it here would hide a model
  // that ignores the list and make the two layers disagree about the raw draft.
  {
    const { draft } = await draftFrom({
      gameType: 'arena',
      questions: [{ ...question('q1', 'Con mèo kêu thế nào?'), contentCategory: 'not-a-category' }]
    });
    assert.equal(draft.questions[0].contentCategory, 'not-a-category', 'an unknown category is not silently rewritten at this layer');
  }

  // --- An empty string counts as omitted -----------------------------------
  {
    const { draft } = await draftFrom({
      gameType: 'arena',
      questions: [{ ...question('q1', 'Con mèo kêu thế nào?'), contentCategory: '   ' }]
    });
    assert.equal(draft.questions[0].contentCategory, 'animals', 'a blank category is treated as missing');
  }

  console.log('item-assets-fallback tests passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
