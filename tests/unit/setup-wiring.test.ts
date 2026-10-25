/**
 * Guards the seam between `main.ts` and `ai-core/setup-orchestrator.ts`.
 *
 * `main.ts` is plain CommonJS wiring with no unit tests, so a renamed export or
 * a changed dependency signature would only surface when a teacher runs the
 * wizard for the first time. This test rebuilds the same dependency object
 * `main.ts` passes (same keys, same call shapes) against the real orchestrator,
 * using fakes only for I/O that needs a machine or the network.
 *
 * It deliberately does NOT import `main.ts`: that file needs Electron, a window
 * and the user data directory. Instead it pins the contract both sides share —
 * if `SetupOrchestratorDependencies` gains, loses or renames a member, this
 * file stops compiling and the wiring in `main.ts` is known to be stale.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { ModelInstaller } from '../../src/ai-core/model-installer';
import { QWEN_LOCAL_MODELS } from '../../src/ai-core/model-catalog';
import { CPU_X64_RUNTIME } from '../../src/ai-core/runtime-manifest';
import { LlamaRuntimeInstaller } from '../../src/ai-core/runtime-installer';
import { SetupOrchestrator } from '../../src/ai-core/setup-orchestrator';
import type { SetupOrchestratorDependencies } from '../../src/ai-core/setup-orchestrator';
import { createInitialSetupState, parseSetupState, SetupStateStore } from '../../src/ai-core/setup-state';
import { buildGenerationOptions } from '../../src/ai-core/generation-options';
import { buildChatRequestBody, readAssistantContent } from '../../src/services/ai-transport';
import { SETUP_CHANNELS } from '../../src/ai-core/setup-ipc';
import type { ModelManifestEntry } from '../../src/ai-core/contracts';
import { createHarness, SYNTHETIC_MODEL } from '../helpers/setup-fake';

/**
 * Any real download fails loudly instead of touching the network. Wiring tests
 * assert sequencing, never transfer bytes; a 2.4 GB fetch in CI would be a bug.
 */
const offlineFetch = (async () => {
  throw new Error('WIRING_TEST_NETWORK_FORBIDDEN');
}) as unknown as typeof fetch;

/**
 * Mirrors the object literal in `main.ts` -> `ensureSetupOrchestrator()`.
 * The parameter type is the real dependency interface, so any drift in either
 * direction is a compile error rather than a runtime surprise.
 */
function buildMainLikeDependencies(options: {
  store: SetupStateStore;
  modelDirectory: string;
  runtimeDirectory: string;
  calls: string[];
  /** Simulates a restart after the model was already downloaded. */
  modelInstalled?: boolean;
}): SetupOrchestratorDependencies {
  return {
    store: options.store,
    detectHardware: async () => {
      options.calls.push('detectHardware');
      return createHarness().dependencies.detectHardware();
    },
    getRuntimeExecutablePath: async () => {
      options.calls.push('getRuntimeExecutablePath');
      return 'C:/fake/runtime/llama-server.exe';
    },
    // The real installer, so the "no verified runtime for this arch" guard in
    // its constructor is part of what this test checks.
    createRuntimeInstaller: () => {
      options.calls.push('createRuntimeInstaller');
      return new LlamaRuntimeInstaller({
        runtimeDirectory: options.runtimeDirectory,
        runtimeArtifact: CPU_X64_RUNTIME,
        platform: 'win32',
        arch: 'x64',
        fetchRuntime: offlineFetch
      });
    },
    // The real class, so its absolute-path and manifest guards are exercised.
    // `fetchModel` is replaced so preflight never downloads the 2.4 GB model;
    // main.ts omits it and therefore uses the global fetch.
    createModelInstaller: () => {
      options.calls.push('createModelInstaller');
      return new ModelInstaller({
        modelDirectory: options.modelDirectory,
        fetchModel: offlineFetch
      });
    },
    startRuntime: async model => {
      options.calls.push(`startRuntime:${model.id}`);
      return 'http://127.0.0.1:1234';
    },
    stopRuntime: async () => { options.calls.push('stopRuntime'); },
    runSmokeTest: async (input: { baseUrl: string; model: ModelManifestEntry }) => {
      options.calls.push(`runSmokeTest:${input.baseUrl}`);
    },
    getDiskFreeBytes: async () => {
      options.calls.push('getDiskFreeBytes');
      return 100 * 1024 ** 3;
    },
    modelDirectory: options.modelDirectory,
    isModelInstalled: async model => {
      options.calls.push(`isModelInstalled:${model.id}`);
      return options.modelInstalled ?? false;
    },
    onProgress: () => undefined
  };
}

async function run() {
  // ModelInstaller genuinely probes the filesystem during preflight, so use a
  // real (empty) temp directory rather than a fictional Drive path.
  const scratch = path.join(os.tmpdir(), `edugame-setup-wiring-${process.pid}`);
  const modelDirectory = path.join(scratch, 'models');
  const runtimeDirectory = path.join(scratch, 'runtime');
  await fs.mkdir(modelDirectory, { recursive: true });

  // --- Channel names match what preload.ts bridges -------------------------
  // preload.ts hard-codes these strings; a rename in setup-ipc.ts would silently
  // break every call until someone opened the wizard.
  //
  // `assert/strict` does NOT freeze string literals: assert.equal('a','b')
  // throws only because `strict` aliases equal to strictEqual. Compare the whole
  // object with deepEqual so a renamed key or value cannot slip through.
  assert.deepEqual({ ...SETUP_CHANNELS }, {
    status: 'setup:status',
    preflight: 'setup:preflight',
    start: 'setup:start',
    cancel: 'setup:cancel',
    progress: 'setup:progress'
  });

  // --- The main.ts dependency object is accepted as-is ---------------------
  {
    const calls: string[] = [];
    const harness = createHarness({ runtimeInstalled: true });
    const orchestrator = new SetupOrchestrator(buildMainLikeDependencies({
      store: harness.store,
      modelDirectory,
      runtimeDirectory,
      calls
    }));
    const status = await orchestrator.getStatus();
    assert.equal(status.complete, false, 'a fresh install must not look complete');
    assert.equal(status.step, 'idle');
  }

  // --- Preflight reaches every dependency main.ts supplies -----------------
  {
    const calls: string[] = [];
    const harness = createHarness({ runtimeInstalled: true });
    const orchestrator = new SetupOrchestrator(buildMainLikeDependencies({
      store: harness.store,
      modelDirectory,
      runtimeDirectory,
      calls
    }));
    const status = await orchestrator.preflight({ model: SYNTHETIC_MODEL });
    assert.ok(calls.includes('detectHardware'), 'preflight must detect hardware');
    assert.ok(calls.includes('getDiskFreeBytes'), 'preflight must measure free disk');
    assert.equal(status.blocked, undefined);
    // The plan must be renderable before anything is downloaded.
    assert.ok(status.plan, 'preflight must return a plan for the requirements screen');
    assert.equal(typeof status.plan.remainingBytes, 'number');
  }

  // --- A run drives startRuntime then the smoke test, in that order ---------
  {
    const calls: string[] = [];
    const harness = createHarness({ runtimeInstalled: true, modelInstalled: true });
    const orchestrator = new SetupOrchestrator(buildMainLikeDependencies({
      store: harness.store,
      modelDirectory,
      runtimeDirectory,
      modelInstalled: true,
      calls
    }));
    const status = await orchestrator.start({ model: SYNTHETIC_MODEL });
    const startIndex = calls.findIndex(entry => entry.startsWith('startRuntime:'));
    const smokeIndex = calls.findIndex(entry => entry.startsWith('runSmokeTest:'));
    assert.ok(startIndex >= 0, "setup must start the runtime through main.ts's function");
    assert.ok(smokeIndex > startIndex, 'the smoke test must run after the runtime starts');
    assert.ok(calls[smokeIndex].endsWith('http://127.0.0.1:1234'),
      'the smoke test receives the base URL that startRuntime resolved');
    assert.equal(status.complete, true);
  }

  // --- A failed smoke test stops the runtime and never says complete -------
  {
    const calls: string[] = [];
    const harness = createHarness({ runtimeInstalled: true, modelInstalled: true });
    const dependencies = buildMainLikeDependencies({
      store: harness.store,
      modelDirectory,
      runtimeDirectory,
      modelInstalled: true,
      calls
    });
    dependencies.runSmokeTest = async () => {
      calls.push('runSmokeTest:failed');
      throw new Error('AI local khởi động nhưng không trả về nội dung thử nghiệm.');
    };
    const orchestrator = new SetupOrchestrator(dependencies);
    await assert.rejects(() => orchestrator.start({ model: SYNTHETIC_MODEL }), /không trả về nội dung/);
    assert.ok(calls.includes('stopRuntime'), 'a failed smoke test must not leave llama-server running');
    const state = harness.store.get();
    assert.notEqual(state.step, 'complete');
    assert.equal(state.error.step, 'smoke-test', 'the failure must be attributed to the smoke test');
  }

  // --- ModelInstaller refuses a relative directory ------------------------
  // main.ts passes an absolute path from app.getPath(); this pins that a
  // renderer-supplied value could never reach the installer.
  {
    assert.throws(() => new ModelInstaller({ modelDirectory: 'models' }), /tuyệt đối/);
    const installer = new ModelInstaller({ modelDirectory: 'C:/fake/ai-local/models' });
    assert.equal(typeof installer.install, 'function');
  }

  // --- The persisted state file round-trips through main.ts's reader -------
  {
    const empty = createInitialSetupState();
    assert.equal(parseSetupState(empty).step, 'idle');
    assert.ok(QWEN_LOCAL_MODELS.some(model => model.id === QWEN_LOCAL_MODELS[0].id));
    // A corrupt file must degrade to "not set up", never throw at startup.
    assert.equal(parseSetupState('not json at all').step, 'idle');
  }

  // --- The smoke test must disable thinking, as measured -------------------
  // Regression (2026-10-22): runSetupSmokeTest in main.ts sent
  // { model, messages, max_tokens: 8, temperature: 0 } with NO
  // chat_template_kwargs. On llama.cpp b11681 + Qwen3.5-4B/2B the chat template
  // thinks by default, so all 8 tokens went to `reasoning_content`, `content`
  // was "" with finish_reason "length", and every first-run setup failed at
  // step 12 even though the model worked. main.ts now spreads
  // buildGenerationOptions('local', 8); this pins that those options are what
  // makes the probe answer inside 8 tokens.
  {
    const body = buildChatRequestBody({
      model: 'local',
      mode: 'local',
      temperature: 0,
      generation: buildGenerationOptions('local', 8),
      messages: [{ role: 'user', content: 'Trả lời đúng một chữ: OK' }]
    });
    assert.equal(body.max_tokens, 8);
    assert.deepEqual(body.chat_template_kwargs, { enable_thinking: false },
      'the smoke test must switch thinking off; without it the reply is empty');
    assert.equal(body.stream, undefined, 'a streaming probe would not yield one JSON body');
    // And the reader must still accept the answer that arrives.
    assert.equal(readAssistantContent({
      choices: [{ finish_reason: 'stop', message: { content: 'OK' } }]
    }), 'OK');
  }

  console.log('setup wiring tests passed');
}

void run().then(
  () => process.exit(0),
  error => {
    console.error(error);
    process.exit(1);
  }
);

