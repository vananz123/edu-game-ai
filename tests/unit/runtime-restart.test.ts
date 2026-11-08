import assert from 'node:assert/strict';
import { decideLocalRuntimeReuse } from '../../src/ai-core/runtime-restart';

/**
 * Reusing a running local AI runtime is only safe when the running process *is*
 * the one that was asked for. It used to check the model id alone, so a teacher
 * who switched Settings to Vulkan kept getting the READY CPU process — launched
 * with `--n-gpu-layers 0` — for every later game and question, and Settings
 * still said GPU.
 *
 * The decision is pure so this whole table runs without Electron or llama.cpp.
 */

const base = {
  state: 'READY',
  runningModelId: 'qwen3.5-2b-q4_k_m',
  modelId: 'qwen3.5-2b-q4_k_m',
  runningBackend: 'cpu',
  wantedBackend: 'cpu'
};

function run() {
  // --- Same model, same backend: reuse (no needless restart) --------------
  const reused = decideLocalRuntimeReuse({ ...base });
  assert.equal(reused.action, 'reuse');
  assert.equal(reused.backend, 'cpu');

  // A missing recorded backend is not evidence of a mismatch: a runtime started
  // before the backend was tracked is reused rather than restarted on every task.
  assert.equal(decideLocalRuntimeReuse({ ...base, runningBackend: undefined }).action, 'reuse');
  assert.equal(decideLocalRuntimeReuse({ ...base, runningBackend: '' }).action, 'reuse');

  // --- Same model, different backend: restart ----------------------------
  const toGpu = decideLocalRuntimeReuse({ ...base, wantedBackend: 'vulkan' });
  assert.equal(toGpu.action, 'restart', 'a Vulkan request must not reuse the READY CPU process');
  assert.equal(toGpu.backend, 'vulkan', 'the restart must aim at the requested backend');
  assert.match(toGpu.reason, /cpu/);
  assert.match(toGpu.reason, /vulkan/);

  const backToCpu = decideLocalRuntimeReuse({
    ...base, runningBackend: 'vulkan', wantedBackend: 'cpu'
  });
  assert.equal(backToCpu.action, 'restart', 'switching back from Vulkan must restart on CPU too');

  // GPU → CPU after a failed start: the process reports cpu, the choice says
  // vulkan, so the next start tries the GPU path again instead of settling.
  const retryGpu = decideLocalRuntimeReuse({
    ...base, runningBackend: 'vulkan', wantedBackend: 'vulkan'
  });
  assert.equal(retryGpu.action, 'reuse');

  // --- A different model always restarts ---------------------------------
  const otherModel = decideLocalRuntimeReuse({ ...base, modelId: 'qwen3.5-4b-q4_k_m' });
  assert.equal(otherModel.action, 'restart');
  assert.match(otherModel.reason, /model/);

  // --- Nothing READY yet: start, never "reuse" ---------------------------
  for (const state of ['STARTING', 'STOPPED', 'ERROR', 'idle']) {
    const started = decideLocalRuntimeReuse({ ...base, state });
    assert.equal(started.action, 'start', `state ${state} must start the runtime`);
    assert.equal(started.backend, 'cpu');
  }
  assert.equal(decideLocalRuntimeReuse({ ...base, state: undefined }).action, 'start',
    'no state at all means nothing is running');

  // No manager at all (fresh app, or one stopped by the caller).
  assert.equal(decideLocalRuntimeReuse({ ...base, runningModelId: undefined }).action, 'start');

  // --- Unknown resolution falls back to CPU, and says so -----------------
  // `wantedBackend: null` is what main passes when the resolver returned
  // `unsupported`. A running process is still reused in that case: a runtime
  // that works is better than restarting into a resolution that chose nothing.
  const noResolution = decideLocalRuntimeReuse({ ...base, wantedBackend: null });
  assert.equal(noResolution.action, 'reuse', 'an unresolved backend must not restart a working runtime');
  assert.equal(noResolution.backend, 'cpu');

  const noResolutionGpu = decideLocalRuntimeReuse({
    ...base, runningBackend: 'vulkan', wantedBackend: null
  });
  assert.equal(noResolutionGpu.action, 'reuse');

  // A start with no resolution still aims at CPU (the measured default).
  const startWithout = decideLocalRuntimeReuse({ ...base, runningModelId: undefined, wantedBackend: null });
  assert.equal(startWithout.action, 'start');
  assert.equal(startWithout.backend, 'cpu');

  console.log('runtime-restart.test.ts: all assertions passed');
}

run();
