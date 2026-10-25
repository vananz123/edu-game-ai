import assert from 'node:assert/strict';
import { SetupOrchestrator, toSetupError } from '../../src/ai-core/setup-orchestrator';
import { SetupError } from '../../src/ai-core/setup-orchestrator';
import { RUNTIME_MANIFEST } from '../../src/ai-core/runtime-manifest';
import {
  SYNTHETIC_MODEL,
  createHarness,
  hardwareProfile,
  runtimeEntry
} from '../helpers/setup-fake';
import type { SetupState } from '../../src/ai-core/setup-state';

const options = { model: SYNTHETIC_MODEL };

async function run() {
  // --- Happy path ---------------------------------------------------------
  {
    const harness = createHarness();
    const orchestrator = new SetupOrchestrator(harness.dependencies);
    const status = await orchestrator.start(options);

    assert.equal(status.complete, true, 'all steps passing must finish setup');
    assert.equal(status.step, 'complete');
    assert.equal(status.modelId, SYNTHETIC_MODEL.id);
    assert.equal(status.backend, 'cpu');
    assert.equal(harness.runtime.calls.install, 1, 'runtime must be installed once');
    assert.equal(harness.model.calls.install, 1, 'model must be installed once');
    assert.equal(harness.events.started, 1);
    assert.equal(harness.events.smokeTests, 1, 'setup must not finish without a smoke test');
    assert.equal(harness.events.stopped, 0, 'a successful run must not stop the runtime');

    // Every step is recorded, so a repair can tell what already succeeded.
    const saved = harness.saved.value as SetupState;
    for (const step of ['detecting', 'installing-runtime', 'installing-models', 'starting', 'smoke-test', 'complete']) {
      assert.ok(saved.completedSteps.includes(step as never), `completedSteps must include ${step}`);
    }
    assert.ok(saved.completedAt, 'completedAt must be persisted');
    assert.equal(orchestrator.isRunning(), false, 'the run lock must be released');
  }

  // --- Smoke test failure must never complete ------------------------------
  {
    const harness = createHarness({
      runSmokeTest: async () => { throw new Error('Model trả về nội dung không hợp lệ.'); }
    });
    const orchestrator = new SetupOrchestrator(harness.dependencies);
    await assert.rejects(orchestrator.start(options), (error: unknown) => {
      assert.ok(error instanceof SetupError);
      assert.equal(error.code, 'smoke-test');
      return true;
    });
    const status = await orchestrator.getStatus();
    assert.equal(status.complete, false, 'a failed smoke test must not report complete');
    assert.equal(status.step, 'smoke-test', 'the failed step is where a retry resumes');
    assert.equal(harness.events.stopped, 1, 'the half-started runtime must be stopped');
    assert.ok(status.error, 'the failure must be persisted for the wizard');
  }

  // --- Resume after a crash ------------------------------------------------
  // Simulates a restart right after the runtime finished but while the model was
  // still downloading. The runtime step must not run again; the model step must,
  // because the file is not on disk yet — state alone must never be trusted.
  {
    const harness = createHarness({
      runtimeInstalled: true,
      modelInstalled: false,
      initial: {
        schemaVersion: 1,
        step: 'installing-models',
        completedSteps: ['detecting', 'installing-runtime']
      }
    });
    const orchestrator = new SetupOrchestrator(harness.dependencies);
    const status = await orchestrator.start(options);
    assert.equal(status.complete, true);
    assert.equal(harness.runtime.calls.install, 0, 'an installed runtime must not be re-downloaded');
    assert.equal(harness.runtime.calls.supportFiles, 1, 'resume still repairs the app-local DLLs');
    assert.equal(harness.model.calls.install, 1, 'the missing model must be downloaded on resume');
    assert.equal(harness.events.started, 1, 'resume must still start the runtime');
    assert.equal(harness.events.smokeTests, 1);
  }

  // A model already on disk is not downloaded again.
  {
    const harness = createHarness({ runtimeInstalled: true, modelInstalled: true });
    const orchestrator = new SetupOrchestrator(harness.dependencies);
    const status = await orchestrator.start(options);
    assert.equal(status.complete, true);
    assert.equal(harness.model.calls.install, 0, 'a verified model on disk must not be re-downloaded');
    assert.equal(status.plan?.remainingBytes, 0);
  }

  // Running setup again on a completed machine does no work and stays complete.
  {
    const harness = createHarness();
    const orchestrator = new SetupOrchestrator(harness.dependencies);
    await orchestrator.start(options);
    const again = await orchestrator.start(options);
    assert.equal(again.complete, true);
    assert.equal(harness.events.started, 1, 'a completed setup must not restart the runtime');
  }

  // --- Cancellation --------------------------------------------------------
  // A cancel that arrives while the model is downloading must reach the
  // installer through the AbortSignal, stop the run and never complete — while
  // keeping the verified runtime step so the next attempt resumes.
  {
    const harness = createHarness();
    const orchestrator = new SetupOrchestrator(harness.dependencies);
    let sawCancelledSignal = false;
    harness.dependencies.createModelInstaller = () => ({
      async install(_manifest, onProgress, signal) {
        onProgress?.({ receivedBytes: 1_000, totalBytes: 4_000, bytesPerSecond: 10 });
        orchestrator.cancel();
        sawCancelledSignal = Boolean(signal?.aborted);
        throw new Error('Tải mô hình đã bị hủy.');
      }
    });

    await assert.rejects(orchestrator.start(options), (error: unknown) => {
      assert.ok(error instanceof SetupError);
      assert.equal(error.code, 'cancelled', 'a cancelled run is not a download failure');
      return true;
    });
    assert.equal(sawCancelledSignal, true, 'cancel() must abort the signal the installer sees');
    const status = await orchestrator.getStatus();
    assert.equal(status.complete, false, 'a cancelled run must not report complete');
    assert.equal(orchestrator.isRunning(), false, 'the run lock must be released after cancel');
    assert.ok((harness.saved.value as SetupState).completedSteps.includes('installing-runtime'),
      'work finished before the cancel must be preserved for resume');
  }

  // Cancelling when nothing is running is a harmless no-op.
  {
    const harness = createHarness();
    const orchestrator = new SetupOrchestrator(harness.dependencies);
    orchestrator.cancel();
    assert.equal(orchestrator.isRunning(), false);
    assert.equal((await orchestrator.getStatus()).complete, false);
  }

  // --- Duplicate setup is refused -----------------------------------------
  // §7: two concurrent runs would fight over the same files.
  {
    const harness = createHarness();
    const orchestrator = new SetupOrchestrator(harness.dependencies);
    let releaseSmoke: (() => void) | undefined;
    harness.dependencies.runSmokeTest = () => new Promise<void>(resolve => { releaseSmoke = resolve; });

    const first = orchestrator.start(options);
    // Let the first run reach the smoke test before the second attempt starts.
    while (!releaseSmoke) await new Promise(resolve => setTimeout(resolve, 0));

    await assert.rejects(orchestrator.start(options), (error: unknown) => {
      assert.ok(error instanceof SetupError);
      assert.equal(error.code, 'busy');
      return true;
    });
    assert.equal(orchestrator.isRunning(), true, 'the first run must still own the lock');
    assert.ok(releaseSmoke);
    releaseSmoke();
    assert.equal((await first).complete, true, 'the first run must finish normally');
    // A refusal must not have marked the successful run as failed.
    assert.equal((await orchestrator.getStatus()).error, undefined);
  }

  // --- Failure classification (§11) ---------------------------------------
  {
    const networkError = Object.assign(new Error('fetch failed'), { code: 'ENOTFOUND' });
    const harness = createHarness({ model: { failWith: networkError } });
    const orchestrator = new SetupOrchestrator(harness.dependencies);
    await assert.rejects(orchestrator.start(options), (error: unknown) => {
      assert.ok(error instanceof SetupError);
      assert.equal(error.code, 'network', 'a DNS failure is a network problem, not corruption');
      assert.equal(error.step, 'installing-models');
      return true;
    });
    assert.equal((await orchestrator.getStatus()).complete, false);
    // The runtime already succeeded, so resume must not repeat it.
    const saved = harness.saved.value as SetupState;
    assert.ok(saved.completedSteps.includes('installing-runtime'));
    assert.equal(saved.error?.attempts, 1);
  }
  {
    const harness = createHarness({
      runtime: { failWith: new Error('Gói llama.cpp không vượt qua kiểm tra kích thước/SHA-256.') }
    });
    const orchestrator = new SetupOrchestrator(harness.dependencies);
    await assert.rejects(orchestrator.start(options), (error: unknown) => {
      assert.ok(error instanceof SetupError);
      assert.equal(error.code, 'integrity');
      assert.equal(error.step, 'installing-runtime');
      return true;
    });
    assert.equal(harness.model.calls.install, 0, 'a corrupt runtime must stop setup before the model');
  }

  // --- Disk space is checked before downloading ---------------------------
  {
    const harness = createHarness({ diskFreeBytes: 5_000 });
    const orchestrator = new SetupOrchestrator(harness.dependencies);
    const preflight = await orchestrator.preflight(options);
    assert.equal(preflight.plan?.enoughDiskSpace, false);
    assert.equal(preflight.blocked?.code, 'disk-space');
    await assert.rejects(orchestrator.start(options), (error: unknown) => {
      assert.ok(error instanceof SetupError);
      assert.equal(error.code, 'disk-space');
      return true;
    });
    assert.equal(harness.runtime.calls.install, 0, 'nothing may download without disk space');
    assert.equal(harness.model.calls.install, 0);
  }

  // An unmeasurable disk is not a refusal; the installer re-checks.
  {
    const harness = createHarness({ diskFreeBytes: null });
    const orchestrator = new SetupOrchestrator(harness.dependencies);
    const preflight = await orchestrator.preflight(options);
    assert.equal(preflight.blocked, undefined, 'unknown disk space must not block setup');
    assert.equal(preflight.plan?.diskFreeBytes, undefined);
  }

  // --- Unsupported hardware must never download ---------------------------
  // An unsupported architecture on Windows: the message must explain the
  // limitation *and* reassure that saved games still work offline.
  {
    const harness = createHarness({
      hardware: hardwareProfile({ supported: false, supportedArch: undefined, processArch: 'ia32', osArch: 'ia32' })
    });
    const orchestrator = new SetupOrchestrator(harness.dependencies);
    const preflight = await orchestrator.preflight(options);
    assert.equal(preflight.blocked?.code, 'unsupported-hardware');
    assert.ok(/trò chơi đã lưu vẫn mở được/.test(preflight.blocked?.message || ''),
      'the message must reassure that saved games still work offline');
    assert.equal(harness.runtime.calls.install, 0, 'unsupported hardware must not download');
    assert.equal(harness.model.calls.install, 0);
  }

  // A non-Windows platform is also refused, not attempted.
  {
    const harness = createHarness({
      hardware: hardwareProfile({ supported: false, supportedArch: undefined, platform: 'linux' })
    });
    const orchestrator = new SetupOrchestrator(harness.dependencies);
    const preflight = await orchestrator.preflight(options);
    assert.equal(preflight.blocked?.code, 'unsupported-hardware');
    assert.ok(/Windows/.test(preflight.blocked?.message || ''));
    assert.equal(harness.runtime.calls.install, 0);
  }

  // --- A requested backend that is unavailable falls back to CPU -----------
  // §4/§11: OpenVINO must never be assumed; the fallback reason is reported.
  {
    const harness = createHarness();
    const orchestrator = new SetupOrchestrator(harness.dependencies);
    const preflight = await orchestrator.preflight({ ...options, backend: 'openvino' });
    assert.equal(preflight.blocked, undefined, 'a missing OpenVINO build must not block setup');
    assert.equal(preflight.plan?.runtime.usedFallback, true);
    assert.ok(/CPU/.test(preflight.plan?.runtime.fallbackReason || ''),
      'the teacher must be told the CPU fallback was used');
  }

  return 'setup-orchestrator tests passed';
}

void run().then(
  message => console.log(message),
  error => {
    console.error(error);
    process.exitCode = 1;
  }
);
