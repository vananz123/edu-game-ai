import assert from 'node:assert/strict';
import { QWEN_LOCAL_MODELS } from '../../src/ai-core/model-catalog';
import { CPU_X64_RUNTIME, VULKAN_X64_RUNTIME, type RuntimeBackend, type RuntimeManifest, type RuntimeManifestEntry } from '../../src/ai-core/runtime-manifest';
import { resolveRuntime } from '../../src/ai-core/runtime-resolver';
import { SETUP_CHANNELS, readSetupRequest, registerSetupIpc } from '../../src/ai-core/setup-ipc';
import type { SetupIpcEvent } from '../../src/ai-core/setup-ipc';
import { SetupOrchestrator } from '../../src/ai-core/setup-orchestrator';
import { createHarness, hardwareProfile, runtimeEntry } from '../helpers/setup-fake';

/**
 * Teacher-selectable runtime backend (`ai.runtimeBackend`).
 *
 * The Vulkan build already existed and was verified; what did not exist was any
 * way to *choose* it. These assertions pin the three things that make the choice
 * real rather than cosmetic:
 *
 *   1. the resolver honours an explicit `vulkan` request and falls back with a
 *      reason when the manifest cannot serve it;
 *   2. setup installs the build that was chosen, so re-running the wizard does
 *      not silently revert to CPU;
 *   3. the renderer still cannot pick the backend through IPC — the choice is
 *      trusted only when it comes from saved settings in the main process.
 */

function createFakeIpcMain() {
  const handlers = new Map<string, (event: SetupIpcEvent, payload?: unknown) => unknown>();
  return {
    handlers,
    ipcMain: {
      handle(channel: string, handler: (event: SetupIpcEvent, payload?: unknown) => unknown) {
        handlers.set(channel, handler);
      },
      removeHandler(channel: string) {
        handlers.delete(channel);
      }
    }
  };
}

const fakeSender = () => ({ sender: { isDestroyed: () => false, send: () => {} } }) as SetupIpcEvent;

const manifestOf = (entries: RuntimeManifestEntry[]): RuntimeManifest =>
  ({ schemaVersion: 1, releaseVersion: 'test', entries });

const ok = (result: ReturnType<typeof resolveRuntime>) => {
  assert.equal(result.status, 'ok', 'expected a resolved runtime');
  return result as Extract<ReturnType<typeof resolveRuntime>, { status: 'ok' }>;
};

async function run() {
  // --- 1. Resolver: an explicit Vulkan request is honoured ---------------
  const gpuMachine = hardwareProfile({ gpuVendor: 'intel', gpuNames: ['Intel(R) UHD Graphics'] });

  // The choice that did not exist before: teacher asks for Vulkan, machine has
  // an Intel iGPU, the manifest ships a verified Vulkan build.
  const vulkan = ok(resolveRuntime(gpuMachine, manifestOf([CPU_X64_RUNTIME, VULKAN_X64_RUNTIME]), { backend: 'vulkan' }));
  assert.equal(vulkan.entry.backend, 'vulkan', 'an explicit vulkan request must select the GPU build');
  assert.equal(vulkan.entry.id, VULKAN_X64_RUNTIME.id);
  assert.equal(vulkan.usedFallback, false);
  assert.equal(vulkan.requestedBackend, 'vulkan');

  // 'auto' must keep the measured default even when a GPU is present — the
  // selector adds a choice, it does not change the recommendation.
  const auto = ok(resolveRuntime(gpuMachine, manifestOf([CPU_X64_RUNTIME, VULKAN_X64_RUNTIME])));
  assert.equal(auto.entry.backend, 'cpu', "'auto' must not start selecting Vulkan on an iGPU");
  assert.equal(auto.usedFallback, false);

  // No Vulkan build for this machine: CPU is used and the teacher is told why,
  // instead of the request being silently ignored.
  const noGpuBuild = ok(resolveRuntime(gpuMachine, manifestOf([CPU_X64_RUNTIME]), { backend: 'vulkan' }));
  assert.equal(noGpuBuild.entry.backend, 'cpu');
  assert.equal(noGpuBuild.usedFallback, true, 'a Vulkan request with no GPU build must report a fallback');
  assert.match(String(noGpuBuild.fallbackReason), /Vulkan/);
  assert.match(String(noGpuBuild.fallbackReason), /CPU/);

  // An unverified Vulkan entry must still be refused: the selector must not
  // become a way to install something the project never validated.
  const unverifiedGpu = runtimeEntry({ id: 'gpu-unverified', backend: 'vulkan', platform: 'win32', arch: 'x64', verified: false });
  const refused = ok(resolveRuntime(gpuMachine, manifestOf([CPU_X64_RUNTIME, unverifiedGpu]), { backend: 'vulkan' }));
  assert.equal(refused.entry.backend, 'cpu', 'an unverified GPU build must never be installed from a preference');
  assert.equal(refused.usedFallback, true);


  // --- 2. Setup installs the chosen build --------------------------------
  // Re-running setup used to build options with no backend at all, so a teacher
  // running Vulkan would silently get the CPU zip on the next wizard run.
  {
    const harness = createHarness();
    const orchestrator = new SetupOrchestrator(harness.dependencies);
    const { handlers, ipcMain } = createFakeIpcMain();
    registerSetupIpc({
      orchestrator,
      ipcMain,
      defaultModelId: QWEN_LOCAL_MODELS[0].id,
      defaultBackend: 'vulkan',
      setProgressSink: () => {}
    });

    const status = await handlers.get(SETUP_CHANNELS.preflight)!(fakeSender(), {}) as {
      plan?: { runtime: { id: string; displayName: string; usedFallback: boolean } };
    };
    // `preflight` reports the decision through the plan (top-level `backend` is
    // only persisted once a run starts), so the plan is what must show Vulkan.
    assert.equal(status.plan?.runtime.id, VULKAN_X64_RUNTIME.id,
      'preflight must plan the Vulkan artifact the teacher chose, not the CPU zip');
    assert.equal(status.plan?.runtime.displayName, VULKAN_X64_RUNTIME.displayName);
    assert.equal(status.plan?.runtime.usedFallback, false);
  }

  // The default (no `defaultBackend`) keeps the old behaviour exactly, so a
  // settings file written before this option existed still installs CPU.
  {
    const harness = createHarness();
    const orchestrator = new SetupOrchestrator(harness.dependencies);
    const { handlers, ipcMain } = createFakeIpcMain();
    registerSetupIpc({
      orchestrator,
      ipcMain,
      defaultModelId: QWEN_LOCAL_MODELS[0].id,
      setProgressSink: () => {}
    });

    const status = await handlers.get(SETUP_CHANNELS.preflight)!(fakeSender(), {}) as {
      plan?: { runtime: { id: string } };
    };
    assert.equal(status.plan?.runtime.id, CPU_X64_RUNTIME.id,
      'without a saved preference setup must keep installing the CPU build');
  }

  // `defaultBackend` is resolved per request, like `defaultModelId`: a teacher
  // who changes the choice must not have to restart the app for setup to see it.
  {
    const harness = createHarness();
    const orchestrator = new SetupOrchestrator(harness.dependencies);
    const { handlers, ipcMain } = createFakeIpcMain();
    let backend: RuntimeBackend | 'auto' = 'cpu';
    registerSetupIpc({
      orchestrator,
      ipcMain,
      defaultModelId: QWEN_LOCAL_MODELS[0].id,
      defaultBackend: async () => backend,
      setProgressSink: () => {}
    });

    const preflight = handlers.get(SETUP_CHANNELS.preflight)!;
    const planned = async () => ((await preflight(fakeSender(), {}) as { plan?: { runtime: { id: string } } }).plan?.runtime.id);
    assert.equal(await planned(), CPU_X64_RUNTIME.id);
    backend = 'vulkan';
    assert.equal(await planned(), VULKAN_X64_RUNTIME.id,
      'a changed preference must be picked up by the next setup request');
  }

  // --- 3. The renderer still cannot choose the backend -------------------
  // Trust model: the choice comes from saved settings read by the host. A
  // payload that tries to smuggle `backend` is still stripped, so an injected
  // script cannot force a download the teacher did not ask for.
  assert.deepEqual(readSetupRequest({ modelId: 'qwen3.5-2b-q4_k_m', backend: 'vulkan' }),
    { modelId: 'qwen3.5-2b-q4_k_m' }, 'a renderer-supplied backend must be ignored');

  {
    const harness = createHarness();
    const orchestrator = new SetupOrchestrator(harness.dependencies);
    const { handlers, ipcMain } = createFakeIpcMain();
    registerSetupIpc({
      orchestrator,
      ipcMain,
      defaultModelId: QWEN_LOCAL_MODELS[0].id,
      // The host says CPU; the payload claims Vulkan.
      defaultBackend: 'cpu',
      setProgressSink: () => {}
    });

    const status = await handlers.get(SETUP_CHANNELS.preflight)!(fakeSender(), { backend: 'vulkan' }) as {
      plan?: { runtime: { id: string } };
    };
    assert.equal(status.plan?.runtime.id, CPU_X64_RUNTIME.id,
      'the saved preference wins over a renderer-supplied backend');
  }

  console.log('runtime-backend-choice.test.ts: all assertions passed');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
