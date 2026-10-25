import assert from 'node:assert/strict';
import {
  AiTaskManager,
  isAiTaskTerminal,
  type AiTaskState
} from '../../src/services/ai-tasks';

async function main(): Promise<void> {
  const terminal: AiTaskState[] = ['completed', 'failed', 'cancelled'];
  for (const state of terminal) assert.equal(isAiTaskTerminal(state), true);
  assert.equal(isAiTaskTerminal('queued'), false);
  assert.equal(isAiTaskTerminal('running'), false);

  const manager = new AiTaskManager();
  const started = manager.start({
    requestId: 'req-1',
    kind: 'analyze',
    projectId: 'project-1',
    documentId: 'doc-1',
    label: 'phân tích giáo án'
  });
  assert.equal(started.state, 'running');
  assert.equal(started.kind, 'analyze');
  assert.equal(started.projectId, 'project-1');
  assert.ok(started.taskId.length > 0);
  assert.ok(started.startedAt.length > 0);
  assert.equal(started.finishedAt, null);

  assert.throws(() => manager.start({ requestId: 'req-1', kind: 'generate', label: 'trùng' }), /đang được theo dõi/);

  const progressed = manager.progress(started.taskId, 'generate');
  assert.equal(progressed?.progress, 'generate');
  assert.equal(manager.getByRequest('req-1')?.taskId, started.taskId);
  assert.equal(manager.active().length, 1);

  const done = manager.complete(started.taskId, '3 mục tiêu');
  assert.equal(done?.state, 'completed');
  assert.equal(done?.resultSummary, '3 mục tiêu');
  assert.ok(done?.finishedAt);
  assert.equal(manager.active().length, 0);
  // Terminal rows never move again.
  assert.equal(manager.progress(started.taskId, 'repair')?.state, 'completed');
  assert.equal(manager.cancel(started.taskId)?.state, 'completed');

  const failed = manager.start({ requestId: 'req-2', kind: 'generate', label: 'sinh' });
  const failedRow = manager.fail(failed.taskId, 'AI_TIMEOUT', 'hết giờ');
  assert.equal(failedRow?.state, 'failed');
  assert.equal(failedRow?.errorCode, 'AI_TIMEOUT');

  const cancelled = manager.start({ requestId: 'req-3', kind: 'qa', label: 'hỏi' });
  const cancelledRow = manager.cancel(cancelled.taskId);
  assert.equal(cancelledRow?.state, 'cancelled');
  assert.equal(cancelledRow?.errorCode, 'AI_CANCELLED');

  assert.equal(manager.list(2).length, 2);

  console.log('AI tasks tests passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
