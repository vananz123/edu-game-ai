import assert from 'node:assert/strict';
import {
  SETUP_STATE_SCHEMA_VERSION,
  SetupStateStore,
  canTransition,
  createInitialSetupState,
  isSetupComplete,
  needsSetup,
  parseSetupState
} from '../../src/ai-core/setup-state';

// --- Initial state --------------------------------------------------------
const initial = createInitialSetupState();
assert.equal(initial.step, 'idle');
assert.deepEqual(initial.completedSteps, []);
assert.equal(isSetupComplete(initial), false, 'a fresh install is not set up');
assert.equal(needsSetup(initial), true);
assert.equal(isSetupComplete(undefined), false, 'missing state must gate setup');
assert.equal(isSetupComplete(null), false);
assert.equal(needsSetup(undefined), true);

// --- Transition table -----------------------------------------------------
assert.equal(canTransition('idle', 'detecting'), true);
assert.equal(canTransition('detecting', 'installing-runtime'), true);
assert.equal(canTransition('installing-runtime', 'installing-models'), true);
assert.equal(canTransition('installing-models', 'smoke-test'), true);
assert.equal(canTransition('smoke-test', 'complete'), true);
assert.equal(canTransition('complete', 'detecting'), true, 're-running setup must be possible');

// Skipping ahead, or going backwards without resetting, is refused.
assert.equal(canTransition('idle', 'complete'), false, 'setup cannot be complete without verifying any step');
assert.equal(canTransition('idle', 'installing-models'), false);
assert.equal(canTransition('detecting', 'complete'), true, 'an already-installed machine may finish right after detecting');
assert.equal(canTransition('complete', 'installing-runtime'), false);
assert.equal(canTransition('smoke-test', 'installing-runtime'), false);

// --- Parsing: malformed input degrades to "start over", never throws ------
for (const bad of [null, undefined, 0, '', 'nope', [], {}, { step: 'complete' }, { schemaVersion: 999, step: 'complete', completedSteps: [] }]) {
  const parsed = parseSetupState(bad);
  assert.equal(parsed.step, 'idle', `malformed state ${JSON.stringify(bad)} must reset to idle`);
  assert.deepEqual(parsed.completedSteps, []);
}
assert.equal(parseSetupState({ schemaVersion: 1, step: 'không-có-bước-này' }).step, 'idle');

// Unknown completed steps are dropped rather than trusted.
const cleaned = parseSetupState({
  schemaVersion: 1,
  step: 'installing-models',
  completedSteps: ['detecting', 'installing-runtime', 'complete', 'idle', 'bịa-ra']
});
assert.deepEqual(cleaned.completedSteps, ['detecting', 'installing-runtime'], 'only real, unfinished steps survive');
assert.equal(cleaned.step, 'installing-models');

// A "complete" state that still carries an error is contradictory: trust the
// error so setup is retried instead of silently unlocking the app.
const contradictory = parseSetupState({
  schemaVersion: 1,
  step: 'complete',
  completedSteps: ['detecting'],
  completedAt: new Date().toISOString(),
  error: { step: 'starting', message: 'llama-server thoát với mã 1', at: new Date().toISOString(), attempts: 2 }
});
assert.equal(contradictory.step, 'starting');
assert.equal(contradictory.completedAt, undefined);
assert.equal(isSetupComplete(contradictory), false, 'an errored setup must not unlock the app');

// Options round-trip.
const roundTrip = parseSetupState({
  schemaVersion: SETUP_STATE_SCHEMA_VERSION,
  step: 'installing-models',
  completedSteps: ['detecting', 'installing-runtime'],
  runtimeId: 'llama.cpp-b11681-cpu-win32-x64',
  backend: 'cpu',
  modelId: 'qwen3.5-4b-q4_k_m',
  startedAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:05:00.000Z'
});
assert.equal(roundTrip.runtimeId, 'llama.cpp-b11681-cpu-win32-x64');
assert.equal(roundTrip.backend, 'cpu');
assert.equal(roundTrip.modelId, 'qwen3.5-4b-q4_k_m');
assert.equal(roundTrip.startedAt, '2026-01-01T00:00:00.000Z');

// --- SetupStateStore: persistence and resumability -------------------------
// Persistence is injected, so these tests never touch the teacher's real
// app-data folder. `written` simulates the JSON file on disk.
async function run(): Promise<void> {
const written: string[] = [];
const fixedNow = () => new Date('2026-03-04T05:06:07.000Z');
const newStore = (initialState = createInitialSetupState()) =>
  new SetupStateStore(initialState, async state => { written.push(JSON.stringify(state)); }, fixedNow);

// A full run ends "complete" and records every step in order.
const store = newStore();
await store.transitionTo('detecting');
await store.transitionTo('installing-runtime', { runtimeId: 'llama.cpp-b11681-cpu-win32-x64', backend: 'cpu' });
await store.transitionTo('installing-models', { modelId: 'qwen3.5-4b-q4_k_m' });
await store.transitionTo('starting');
await store.transitionTo('smoke-test');
const done = await store.transitionTo('complete');
assert.equal(done.step, 'complete');
assert.equal(isSetupComplete(done), true);
assert.equal(done.startedAt, '2026-03-04T05:06:07.000Z', 'startedAt is set once and kept');
assert.equal(done.completedAt, '2026-03-04T05:06:07.000Z');
assert.equal(done.runtimeId, 'llama.cpp-b11681-cpu-win32-x64', 'resolver decision is persisted for repair');
assert.equal(done.modelId, 'qwen3.5-4b-q4_k_m');
assert.equal(written.length, 6, 'every transition is persisted exactly once');

// Illegal jumps throw and leave the stored state untouched.
const guarded = newStore();
await assert.rejects(() => guarded.transitionTo('complete'), /Không thể chuyển bước/);
assert.equal(guarded.get().step, 'idle');

// An already-installed machine can finish quickly, but must still record
// that detection ran so a later repair knows what was verified.
const fastPath = newStore();
await fastPath.transitionTo('detecting');
const fastDone = await fastPath.transitionTo('complete');
assert.equal(isSetupComplete(fastDone), true);
assert.deepEqual(fastDone.completedSteps, ['detecting', 'complete']);

// --- Failure, retry and resume -------------------------------------------
// A failure keeps the step so the teacher can retry exactly there, and it does
// not discard the work that already finished.
const failing = newStore();
await failing.transitionTo('detecting');
await failing.transitionTo('installing-runtime');
const failed = await failing.fail({ message: 'Mạng bị ngắt khi đang tải.', code: 'network' });
assert.equal(failed.step, 'installing-runtime', 'step is kept for resume');
assert.equal(failed.error?.step, 'installing-runtime');
assert.equal(failed.error?.attempts, 1);
assert.equal(failed.error?.code, 'network');
assert.deepEqual(failed.completedSteps, ['detecting', 'installing-runtime']);
assert.equal(isSetupComplete(failed), false, 'a failed setup must not unlock the app');

// Failing again in the same step counts attempts; a different step restarts the count.
assert.equal((await failing.fail({ message: 'vẫn lỗi', code: 'network' })).error?.attempts, 2);
assert.equal((await failing.fail({ message: 'lỗi khác', step: 'installing-models' })).error?.attempts, 1);

// Retrying the same step clears the error and keeps accumulated progress.
const retried = await failing.transitionTo('installing-runtime');
assert.equal(retried.error, undefined, 'retry clears the previous error');
assert.deepEqual(retried.completedSteps, ['detecting', 'installing-runtime']);

// --- Resume across a restart ---------------------------------------------
// Reloading from the persisted JSON must continue where it stopped, and must
// not redo the runtime download. `drifted` is interrupted at 'installing-models'
// (e.g. the laptop was closed mid-download); the last persisted snapshot is
// what a fresh process would read.
const snapshots: string[] = [];
const drifted = new SetupStateStore(
  createInitialSetupState(),
  async state => { snapshots.push(JSON.stringify(state)); },
  fixedNow
);
await drifted.transitionTo('detecting');
await drifted.transitionTo('installing-runtime', { runtimeId: 'llama.cpp-b11681-cpu-win32-x64' });
await drifted.transitionTo('installing-models');
const persisted = JSON.parse(snapshots[snapshots.length - 1]);
const resumed = new SetupStateStore(persisted, async () => {}, fixedNow);
assert.equal(resumed.get().step, 'installing-models', 'resumes exactly where the download stopped');
assert.deepEqual(resumed.get().completedSteps, ['detecting', 'installing-runtime', 'installing-models']);
assert.equal(resumed.get().runtimeId, 'llama.cpp-b11681-cpu-win32-x64', 'the installed runtime is remembered');

const continued = await resumed.transitionTo('starting');
assert.deepEqual(continued.completedSteps, ['detecting', 'installing-runtime', 'installing-models', 'starting']);

// A failure recorded before the restart also survives the reload.
const failedReload = new SetupStateStore(
  parseSetupState({ ...JSON.parse(snapshots[snapshots.length - 1]), error: { step: 'installing-models', message: 'Mạng bị ngắt.', at: '2026-03-04T05:00:00.000Z', attempts: 3, code: 'network' } }),
  async () => {},
  fixedNow
);
assert.equal(failedReload.get().step, 'installing-models');
assert.equal(failedReload.get().error?.attempts, 3, 'attempt counters survive a restart so UI can stop offering retry');
assert.equal(isSetupComplete(failedReload.get()), false);

// --- Reset ---------------------------------------------------------------
const reset = await store.reset();
assert.equal(reset.step, 'idle');
assert.deepEqual(reset.completedSteps, []);
assert.equal(isSetupComplete(reset), false);

// get() returns a copy: mutating it must not corrupt the stored state.
const copied = store.get();
copied.completedSteps.push('complete');
copied.step = 'complete';
assert.equal(store.get().step, 'idle', 'get() must not expose internal state');

console.log('setup-state.test.ts passed');
}

void run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
