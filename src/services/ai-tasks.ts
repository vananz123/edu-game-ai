/**
 * Central AI task manager (update_plan_3 §8, CPU-only).
 *
 * Owns the lifecycle of every local-model job in the main process:
 * - one stable id per task (`taskId`, renderer-supplied `requestId` maps to it),
 * - states `queued | running | completed | failed | cancelled` (never fake),
 * - started/finished timestamps, task kind, owning project, progress stage,
 * - typed error code/message for failed tasks,
 * - result summary only (full payloads stay in LessonStore, never duplicated here).
 *
 * The manager is deliberately separate from `AiSingleFlight` (which only
 * rejects overlapping model work with `AI_BUSY`) and from `AiRequestRegistry`
 * (which only owns AbortControllers for `ai:cancel`). This module records what
 * happened; those two enforce what may run right now.
 *
 * Persistence: history rows live in the `ai_tasks` sidecar table so the
 * teacher can review what ran after a restart. A row restored after restart is
 * always reported as history — the manager never claims a task is still
 * running when its process is gone (spec §8: no fake "running" after quit).
 */

export type AiTaskState = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type AiTaskKind = 'analyze' | 'generate' | 'regenerate-item' | 'qa' | 'summarize' | 'legacy';

export interface AiTaskRecord {
  taskId: string;
  requestId: string;
  kind: AiTaskKind;
  projectId: string | null;
  documentId: string | null;
  label: string;
  state: AiTaskState;
  progress: string;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
  resultSummary: string | null;
}

export interface AiTaskSnapshot extends AiTaskRecord {
  /** True when the row comes from SQLite history, not from a live task. */
  restored: boolean;
}

interface StartTaskInput {
  taskId?: string;
  requestId: string;
  kind: AiTaskKind;
  projectId?: string | null;
  documentId?: string | null;
  label: string;
}

const TERMINAL_STATES: ReadonlySet<AiTaskState> = new Set(['completed', 'failed', 'cancelled']);

export function isAiTaskTerminal(state: AiTaskState): boolean {
  return TERMINAL_STATES.has(state);
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function newAiTaskId(prefix = 'task'): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${random}`;
}

/**
 * In-memory task registry. SQLite persistence is handled by the caller
 * (`LessonStore.saveAiTask`) so this module stays unit-testable without
 * Electron or better-sqlite3.
 */
export class AiTaskManager {
  private readonly tasks = new Map<string, AiTaskRecord>();
  private readonly byRequest = new Map<string, string>();

  start(input: StartTaskInput): AiTaskRecord {
    const requestId = String(input.requestId || '').trim();
    if (!requestId) throw new Error('Thiếu mã yêu cầu AI.');
    if (this.byRequest.has(requestId)) {
      throw new Error(`Tác vụ AI ${requestId} đang được theo dõi.`);
    }
    const taskId = String(input.taskId || '').trim() || newAiTaskId('task');
    if (this.tasks.has(taskId)) throw new Error(`Tác vụ AI ${taskId} đã tồn tại.`);
    const record: AiTaskRecord = {
      taskId,
      requestId,
      kind: input.kind,
      projectId: input.projectId ?? null,
      documentId: input.documentId ?? null,
      label: String(input.label || 'Tác vụ AI'),
      state: 'running',
      progress: 'running',
      errorCode: null,
      errorMessage: null,
      startedAt: nowIso(),
      finishedAt: null,
      resultSummary: null
    };
    this.tasks.set(taskId, record);
    this.byRequest.set(requestId, taskId);
    return { ...record };
  }

  progress(taskId: string, stage: string): AiTaskRecord | null {
    const record = this.tasks.get(taskId);
    if (!record || isAiTaskTerminal(record.state)) return record ? { ...record } : null;
    record.progress = String(stage || 'running');
    return { ...record };
  }

  complete(taskId: string, summary?: string): AiTaskRecord | null {
    return this.finish(taskId, 'completed', null, null, summary ?? null);
  }

  fail(taskId: string, code: string, message: string): AiTaskRecord | null {
    return this.finish(taskId, 'failed', code, message, null);
  }

  cancel(taskId: string): AiTaskRecord | null {
    return this.finish(taskId, 'cancelled', 'AI_CANCELLED', 'Yêu cầu AI đã bị huỷ.', null);
  }

  get(taskId: string): AiTaskRecord | null {
    const record = this.tasks.get(taskId);
    return record ? { ...record } : null;
  }

  getByRequest(requestId: string): AiTaskRecord | null {
    const taskId = this.byRequest.get(String(requestId || ''));
    if (!taskId) return null;
    return this.get(taskId);
  }

  active(): AiTaskRecord[] {
    return [...this.tasks.values()]
      .filter(record => !isAiTaskTerminal(record.state))
      .map(record => ({ ...record }));
  }

  list(limit = 50): AiTaskRecord[] {
    return [...this.tasks.values()]
      .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
      .slice(0, Math.max(1, Math.min(200, Math.floor(limit) || 50)))
      .map(record => ({ ...record }));
  }

  private finish(
    taskId: string,
    state: AiTaskState,
    code: string | null,
    message: string | null,
    summary: string | null
  ): AiTaskRecord | null {
    const record = this.tasks.get(taskId);
    if (!record || isAiTaskTerminal(record.state)) return record ? { ...record } : null;
    record.state = state;
    record.errorCode = code;
    record.errorMessage = message;
    record.resultSummary = summary;
    record.finishedAt = nowIso();
    return { ...record };
  }
}
