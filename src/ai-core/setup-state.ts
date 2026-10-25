/**
 * First-run setup, §11 "SetupState should be saved" (docs/archive/specs/
 * update_AI_plan_5.txt).
 *
 * Before this module the app had no first-run concept at all: setup was a
 * button inside a Settings modal, and every restart re-derived "is it set up?"
 * from file existence. That cannot survive a download interrupted by a reboot,
 * a crash or a closed laptop lid — the teacher loses the progress bar and has no
 * idea whether anything finished.
 *
 * This is the persistent state machine. It is deliberately:
 *   - explicit about allowed transitions, so a corrupt or hand-edited file can
 *     never move the app into a wrong step;
 *   - monotonic on `completedSteps`, so a retry never loses finished work;
 *   - tolerant on read, so a truncated JSON file degrades to "start over"
 *     instead of blocking the app forever.
 *
 * Nothing here touches the filesystem — persistence is injected, which keeps
 * the machine unit-testable without touching the teacher's real app data.
 */

export const SETUP_STEPS = [
  'idle',
  'detecting',
  'installing-runtime',
  'installing-models',
  'starting',
  'smoke-test',
  'complete'
] as const;

export type SetupStep = typeof SETUP_STEPS[number];

export interface SetupErrorDetails {
  /** Step that failed, so a retry can resume from there. */
  step: SetupStep;
  /** Teacher-facing Vietnamese message. */
  message: string;
  /** Machine-readable code, e.g. 'checksum-mismatch', 'disk-space', 'network'. */
  code?: string;
  /** ISO timestamp. */
  at: string;
  /** How many times this step has failed, to decide when to stop retrying. */
  attempts: number;
}

export interface SetupState {
  /** Bumped whenever the schema changes; a mismatch restarts setup. */
  schemaVersion: 1;
  step: SetupStep;
  /** Steps that finished successfully and must not be repeated. */
  completedSteps: SetupStep[];
  /** Backend/runtime chosen by the resolver, recorded for diagnostics and repair. */
  runtimeId?: string;
  backend?: string;
  modelId?: string;
  error?: SetupErrorDetails;
  /** ISO timestamp of the first time setup began. */
  startedAt?: string;
  /** ISO timestamp of the last successful transition. */
  updatedAt?: string;
  /** ISO timestamp set only when `step === 'complete'`. */
  completedAt?: string;
}

export const SETUP_STATE_SCHEMA_VERSION = 1 as const;

/**
 * Legal transitions. Anything not listed is rejected, which is what makes a
 * corrupted file harmless. `error` is represented by `step` staying put plus an
 * `error` field, so retrying is simply "run the same step again".
 */
const ALLOWED_TRANSITIONS: Record<SetupStep, SetupStep[]> = {
  // `idle -> complete` is deliberately absent: setup must never be marked done
  // without recording at least the steps that were verified. A machine that is
  // already fully installed still walks detecting before reporting complete.
  'idle': ['detecting'],
  'detecting': ['installing-runtime', 'installing-models', 'starting', 'smoke-test', 'complete', 'idle'],
  'installing-runtime': ['installing-models', 'starting', 'smoke-test', 'complete', 'idle'],
  'installing-models': ['starting', 'smoke-test', 'complete', 'idle'],
  'starting': ['smoke-test', 'complete', 'idle'],
  'smoke-test': ['complete', 'idle'],
  'complete': ['idle', 'detecting']
};

export function createInitialSetupState(): SetupState {
  return { schemaVersion: SETUP_STATE_SCHEMA_VERSION, step: 'idle', completedSteps: [] };
}

/** True only when setup finished cleanly. */
export function isSetupComplete(state: SetupState | undefined | null): boolean {
  return Boolean(state && state.step === 'complete' && !state.error);
}

/** True when there is unfinished work that should be resumed rather than restarted. */
export function needsSetup(state: SetupState | undefined | null): boolean {
  return !isSetupComplete(state);
}

export function canTransition(from: SetupStep, to: SetupStep): boolean {
  return (ALLOWED_TRANSITIONS[from] || []).includes(to);
}

/**
 * Parses a value read from disk. Unknown or malformed input yields a fresh
 * initial state rather than throwing: a broken setup file must never prevent
 * the app from starting, especially since saved games must still play offline.
 */
export function parseSetupState(raw: unknown): SetupState {
  if (!raw || typeof raw !== 'object') return createInitialSetupState();
  const value = raw as Partial<SetupState>;
  if (value.schemaVersion !== SETUP_STATE_SCHEMA_VERSION) return createInitialSetupState();
  const step = SETUP_STEPS.includes(value.step as SetupStep) ? value.step as SetupStep : undefined;
  if (!step) return createInitialSetupState();

  const declared = Array.isArray(value.completedSteps) ? value.completedSteps : [];
  const completedSteps = SETUP_STEPS.filter(candidate =>
    candidate !== 'idle' && candidate !== 'complete' && declared.includes(candidate)
  );

  const error = parseError(value.error);
  const state: SetupState = {
    schemaVersion: SETUP_STATE_SCHEMA_VERSION,
    step,
    completedSteps
  };
  if (typeof value.runtimeId === 'string' && value.runtimeId) state.runtimeId = value.runtimeId;
  if (typeof value.backend === 'string' && value.backend) state.backend = value.backend;
  if (typeof value.modelId === 'string' && value.modelId) state.modelId = value.modelId;
  if (isIsoDate(value.startedAt)) state.startedAt = value.startedAt;
  if (isIsoDate(value.updatedAt)) state.updatedAt = value.updatedAt;
  if (isIsoDate(value.completedAt)) state.completedAt = value.completedAt;
  if (error) state.error = error;

  // A state that claims "complete" but carries an error is contradictory; trust
  // the error and send it back to the failed step so setup is retried.
  if (step === 'complete' && error) {
    state.step = error.step;
    delete state.completedAt;
  }
  return state;
}

function parseError(raw: unknown): SetupErrorDetails | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const value = raw as Partial<SetupErrorDetails>;
  if (!SETUP_STEPS.includes(value.step as SetupStep)) return undefined;
  if (typeof value.message !== 'string' || !value.message) return undefined;
  const attempts = Number.isSafeInteger(value.attempts) && (value.attempts as number) > 0
    ? value.attempts as number
    : 1;
  return {
    step: value.step as SetupStep,
    message: value.message,
    ...(typeof value.code === 'string' && value.code ? { code: value.code } : {}),
    at: isIsoDate(value.at) ? value.at : new Date().toISOString(),
    attempts
  };
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

/**
 * State container. Each mutation validates the transition, then persists via
 * the injected writer so the caller controls where the file lives.
 */
export class SetupStateStore {
  private state: SetupState;
  private readonly write: (state: SetupState) => Promise<void>;
  private readonly now: () => Date;

  constructor(
    initial: SetupState,
    write: (state: SetupState) => Promise<void>,
    now: () => Date = () => new Date()
  ) {
    this.state = parseSetupState(initial);
    this.write = write;
    this.now = now;
  }

  get(): SetupState {
    return { ...this.state, completedSteps: [...this.state.completedSteps] };
  }

  /**
   * Moves to `step`. Repeating the current step is allowed and clears any
   * previous error, which is exactly what a "Retry" button needs.
   */
  async transitionTo(
    step: SetupStep,
    details: { runtimeId?: string; backend?: string; modelId?: string } = {}
  ): Promise<SetupState> {
    if (step !== this.state.step && !canTransition(this.state.step, step)) {
      throw new Error(`Không thể chuyển bước cài đặt từ "${this.state.step}" sang "${step}".`);
    }
    const timestamp = this.now().toISOString();
    const completedSteps = this.state.completedSteps.includes(step)
      ? this.state.completedSteps
      : [...this.state.completedSteps, step];

    this.state = {
      ...this.state,
      step,
      completedSteps,
      startedAt: this.state.startedAt || timestamp,
      updatedAt: timestamp,
      ...(details.runtimeId ? { runtimeId: details.runtimeId } : {}),
      ...(details.backend ? { backend: details.backend } : {}),
      ...(details.modelId ? { modelId: details.modelId } : {})
    };
    delete this.state.error;
    if (step === 'complete') this.state.completedAt = timestamp;
    else delete this.state.completedAt;
    await this.persist();
    return this.get();
  }

  /**
   * Records a failure without moving the step, so the teacher can retry the same
   * step and `completedSteps` keeps everything that already finished.
   */
  async fail(error: { message: string; code?: string; step?: SetupStep }): Promise<SetupState> {
    const timestamp = this.now().toISOString();
    const step = error.step || (this.state.step === 'idle' ? 'detecting' : this.state.step);
    const previous = this.state.error && this.state.error.step === step ? this.state.error.attempts : 0;
    this.state = {
      ...this.state,
      error: {
        step,
        message: error.message,
        ...(error.code ? { code: error.code } : {}),
        at: timestamp,
        attempts: previous + 1
      },
      updatedAt: timestamp
    };
    delete this.state.completedAt;
    await this.persist();
    return this.get();
  }

  /** Restarts from scratch, e.g. after the teacher presses "Cài đặt lại". */
  async reset(): Promise<SetupState> {
    this.state = createInitialSetupState();
    await this.persist();
    return this.get();
  }

  private async persist(): Promise<void> {
    await this.write(this.get());
  }
}
