/**
 * "This runtime is already running — may I reuse it?" (`update_plan` §runtime).
 *
 * Before this module `startLocalRuntimeUnlocked` reused any READY manager with a
 * matching model id, and `ai:start-local-runtime` short-circuited on the same
 * pair. So a teacher who switched Settings to Vulkan while a CPU build was
 * already running kept the CPU build for the rest of the session, with no log
 * line and no on-screen sign: `--n-gpu-layers 99` only ever matters at spawn
 * time. The backend is therefore part of the identity of a running runtime, and
 * it is decided here — one pure function, one table of tests.
 */

export type LocalRuntimeReuseVerdict =
  /** Same model, same backend: reuse the process. */
  | { action: 'reuse'; backend: string }
  /** A running runtime that does not match the request; it must be stopped and spawned again. */
  | { action: 'restart'; backend: string; reason: string }
  /** Start from scratch (nothing running, or the running process is still starting/failed). */
  | { action: 'start'; backend: string; reason: string };

export interface LocalRuntimeReuseInput {
  /** `getStatus().state` of the manager that holds the child process, if any. */
  state?: string;
  /** Model id the running manager was spawned with. */
  runningModelId?: string;
  /** Model id the caller asks for. */
  modelId: string;
  /** Backend the running manager actually runs (`getRuntimeFacts().backend`). */
  runningBackend?: string;
  /**
   * Backend the resolver picked for this start. `null` means the resolution is
   * unsupported, in which case the backend is not part of the comparison.
   */
  wantedBackend: string | null;
}

export function decideLocalRuntimeReuse(input: LocalRuntimeReuseInput): LocalRuntimeReuseVerdict {
  const backend = String(input.wantedBackend || 'cpu');
  if (!input.runningModelId) return { action: 'start', backend, reason: 'nothing-running' };
  if (input.state !== 'READY') return { action: 'start', backend, reason: `runtime-${String(input.state || 'stopped').toLowerCase()}` };
  if (input.runningModelId !== input.modelId) {
    return { action: 'restart', backend, reason: `model ${input.runningModelId} --> ${input.modelId}` };
  }
  // A backend the manager did not record is not a mismatch: an unknown value
  // must not restart a working runtime on every single task.
  if (input.wantedBackend && input.runningBackend && input.runningBackend !== input.wantedBackend) {
    return { action: 'restart', backend, reason: `backend ${input.runningBackend || 'unknown'} --> ${input.wantedBackend}` };
  }
  return { action: 'reuse', backend };
}
