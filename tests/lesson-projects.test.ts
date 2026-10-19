import assert from 'node:assert/strict';
import {
  advanceAfterRecommendations,
  advanceStep,
  applyAnalysis,
  applyDraft,
  createProjectFromAnalysis,
  WORKFLOW_STEP_ORDER
} from '../src/services/lesson-projects';
import { normalizeAnalysis } from '../src/services/lesson-normalize';
import type { GameProject } from '../src/shared/lesson-types';

const NOW = '2026-02-02T00:00:00.000Z';
const LATER = '2026-02-02T01:00:00.000Z';

const analysis = normalizeAnalysis({
  subject: 'Sinh học',
  grade: 7,
  topic: 'Quang hợp',
  objectives: [{ description: 'Nêu vai trò của ánh sáng.', cognitiveLevel: 'remember' }],
  keyConcepts: [{ term: 'Quang hợp', explanation: 'Tổng hợp chất hữu cơ nhờ ánh sáng.' }],
  uncertainties: []
}, {
  id: 'analysis_9',
  documentId: 'doc_9',
  createdAt: NOW,
  sourceDocumentIds: ['doc_9']
});

const document = { documentId: 'doc_9', name: 'quang-hop.txt', characters: 4200 };

function baseProject(overrides: Partial<GameProject> = {}): GameProject {
  return {
    ...createProjectFromAnalysis({ projectId: 'project_9', document, analysis, now: NOW }),
    ...overrides
  };
}

function main(): void {
  // --- Step ordering -------------------------------------------------------
  assert.deepEqual([...WORKFLOW_STEP_ORDER], ['input', 'analyze', 'recommend', 'configure', 'generate', 'edit', 'done']);
  assert.equal(advanceStep('input', 'recommend'), 'recommend');
  assert.equal(advanceStep('generate', 'recommend'), 'generate', 'never moves backwards');
  assert.equal(advanceStep('configure', 'configure'), 'configure');

  // --- createProjectFromAnalysis ------------------------------------------
  const created = createProjectFromAnalysis({ projectId: 'project_9', document, analysis, now: NOW });
  assert.equal(created.id, 'project_9');
  assert.equal(created.schemaVersion, 1);
  assert.equal(created.status, 'draft');
  assert.equal(created.step, 'recommend');
  assert.equal(created.title, 'Quang hợp');
  assert.equal(created.sourceName, 'quang-hop.txt');
  assert.deepEqual(created.lesson, { documentId: 'doc_9', name: 'quang-hop.txt', characters: 4200 });
  assert.equal(created.analysisId, 'analysis_9');
  assert.equal(created.recommendationId, null);
  assert.equal(created.config, null);
  assert.equal(created.draft, null);
  assert.equal(created.gameSnapshot, null);
  assert.equal(created.gameId, null);
  assert.equal(created.createdAt, NOW);
  assert.equal(created.updatedAt, NOW);

  // Falls back to the document name when the topic is empty.
  const noTopic = createProjectFromAnalysis({
    projectId: 'project_x',
    document,
    analysis: { ...analysis, topic: '' },
    now: NOW
  });
  assert.equal(noTopic.title, 'quang-hop.txt');

  // --- applyAnalysis -------------------------------------------------------
  const fromInput = applyAnalysis({ ...baseProject(), step: 'input', title: '', sourceName: '', lesson: null }, {
    document,
    analysis,
    now: LATER
  });
  assert.equal(fromInput.step, 'recommend');
  assert.equal(fromInput.title, 'Quang hợp');
  assert.equal(fromInput.sourceName, 'quang-hop.txt');
  assert.deepEqual(fromInput.lesson, { documentId: 'doc_9', name: 'quang-hop.txt', characters: 4200 });
  assert.equal(fromInput.analysisId, 'analysis_9');
  assert.equal(fromInput.updatedAt, LATER);

  const keepsTitle = applyAnalysis({ ...baseProject(), title: 'Tên giáo viên đặt', step: 'configure' }, {
    document,
    analysis,
    now: LATER
  });
  assert.equal(keepsTitle.title, 'Tên giáo viên đặt', 'teacher title is preserved');
  assert.equal(keepsTitle.step, 'configure', 're-analyzing does not regress the step');

  // --- advanceAfterRecommendations ----------------------------------------
  const afterRecommend = advanceAfterRecommendations(baseProject(), LATER);
  assert.equal(afterRecommend.step, 'configure');
  assert.equal(afterRecommend.status, 'review');
  assert.equal(afterRecommend.updatedAt, LATER);

  const alreadyReady = advanceAfterRecommendations({ ...baseProject(), status: 'ready', step: 'generate' }, LATER);
  assert.equal(alreadyReady.status, 'ready', 'ready status is not downgraded');
  assert.equal(alreadyReady.step, 'generate', 'step is not regressed');

  // --- applyDraft ---------------------------------------------------------
  const draft = {
    gameType: 'arena' as const,
    schemaVersion: 1 as const,
    questions: [{
      id: 'q1',
      type: 'multiple-choice' as const,
      prompt: 'Quang hợp tạo ra khí nào?',
      options: [{ id: 'a', text: 'Oxy' }, { id: 'b', text: 'Nitơ' }],
      correctOptionId: 'a',
      explanation: 'Quang hợp giải phóng oxy.',
      difficulty: 'trung bình' as const,
      points: 100
    }]
  };
  const game = {
    id: 'game-project_9',
    title: 'Quang hợp',
    subject: 'Sinh học',
    grade: '7',
    topic: 'Quang hợp',
    description: '',
    template: 'quiz' as const,
    questions: [],
    tags: [],
    sourceName: 'quang-hop.txt',
    createdAt: NOW
  };
  const generated = applyDraft({ ...baseProject(), status: 'review', step: 'configure' }, { draft, game, now: LATER });
  assert.equal(generated.status, 'ready');
  assert.equal(generated.step, 'edit');
  assert.equal(generated.gameId, 'game-project_9');
  assert.deepEqual(generated.draft, draft);
  assert.deepEqual(generated.gameSnapshot, game);
  assert.equal(generated.updatedAt, LATER);

  // Re-generating keeps the project identity (same id/createdAt) and replaces content.
  const regenerated = applyDraft(generated, { draft, game: { ...game, title: 'Quang hợp (lần 2)' }, now: NOW });
  assert.equal(regenerated.id, generated.id);
  assert.equal(regenerated.createdAt, generated.createdAt);
  assert.equal(regenerated.gameSnapshot.title, 'Quang hợp (lần 2)');

  console.log('Lesson projects tests passed');
}

main();
