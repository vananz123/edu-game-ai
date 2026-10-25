import assert from 'node:assert/strict';
import { QWEN_LOCAL_MODELS } from '../../src/ai-core/model-catalog';
import {
  SETUP_CHANNELS,
  readSetupRequest,
  registerSetupIpc,
  resolveSetupModel
} from '../../src/ai-core/setup-ipc';
import type { SetupIpcEvent } from '../../src/ai-core/setup-ipc';
import { SetupOrchestrator } from '../../src/ai-core/setup-orchestrator';
import { createHarness } from '../helpers/setup-fake';

/** Collects handlers the way Electron's ipcMain would. */
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

function createFakeSender() {
  const sent: { channel: string; payload: unknown }[] = [];
  let destroyed = false;
  const sender = {
    isDestroyed: () => destroyed,
    send: (channel: string, payload: unknown) => { sent.push({ channel, payload }); }
  };
  return { event: { sender } as SetupIpcEvent, sent, destroy: () => { destroyed = true; } };
}

async function run() {
  // --- Model id validation (§5: never substitute a model) ------------------
  assert.equal(resolveSetupModel('qwen3.5-4b-q4_k_m').id, 'qwen3.5-4b-q4_k_m');
  assert.throws(() => resolveSetupModel(''), /Thiếu mã mô hình/);
  assert.throws(() => resolveSetupModel('   '), /Thiếu mã mô hình/);
  assert.throws(() => resolveSetupModel(undefined), /Thiếu mã mô hình/);
  assert.throws(() => resolveSetupModel(42), /Thiếu mã mô hình/);
  assert.throws(() => resolveSetupModel('gpt-4'), /không nằm trong danh mục đã xác minh/,
    'an unknown model must be refused, not silently replaced');
  assert.throws(() => resolveSetupModel('../evil'), /không nằm trong danh mục đã xác minh/);

  // Every catalog id is resolvable, so the wizard cannot offer a dead option.
  for (const model of QWEN_LOCAL_MODELS) {
    assert.equal(resolveSetupModel(model.id).id, model.id);
  }
  // The removed Qwen2.5 7B id must be refused by name, not mapped to something
  // else: a stale settings file or script would otherwise install a model the
  // teacher never asked for.
  assert.throws(() => resolveSetupModel('qwen2.5-7b-q4_k_m'), /không nằm trong danh mục đã xác minh/);
  // Gemma 4 E2B is installable on request (manual choice), just never automatic.
  assert.equal(resolveSetupModel('gemma-4-e2b-it-q4_k_m').id, 'gemma-4-e2b-it-q4_k_m');

  // --- Payload hardening (§8: no paths, no URLs from the renderer) --------
  assert.deepEqual(readSetupRequest(undefined), {});
  assert.deepEqual(readSetupRequest(null), {});
  assert.deepEqual(readSetupRequest({ modelId: 'qwen3.5-2b-q4_k_m' }), { modelId: 'qwen3.5-2b-q4_k_m' });
  // Extra keys are dropped, so a renderer cannot smuggle a directory, URL or
  // backend choice into the setup run.
  assert.deepEqual(
    readSetupRequest({
      modelId: 'qwen3.5-2b-q4_k_m',
      modelDirectory: 'C:\\Windows\\System32',
      downloadUrl: 'https://evil.invalid/x.zip',
      backend: 'openvino',
      runtimeBackend: 'vulkan'

    }),
    { modelId: 'qwen3.5-2b-q4_k_m' }
  );
  assert.throws(() => readSetupRequest(['a']), /không hợp lệ/);
  assert.throws(() => readSetupRequest('model'), /không hợp lệ/);

  // --- End-to-end through the registered handlers -------------------------
  // Uses a real catalog id, because the IPC layer validates against the
  // verified catalog; the download itself is still faked.
  const catalogModelId = QWEN_LOCAL_MODELS[0].id;

  // --- The default model may be a function, resolved per request -----------
  // main.ts passes the hardware recommendation this way, so the wizard installs
  // the model that fits the machine rather than a fixed 2B. A function is needed
  // (not a value) because detection is async and must run on the real machine.
  {
    const harness = createHarness();
    const orchestrator = new SetupOrchestrator(harness.dependencies);
    const { handlers, ipcMain } = createFakeIpcMain();
    let resolutions = 0;
    registerSetupIpc({
      orchestrator,
      ipcMain,
      defaultModelId: async () => {
        resolutions += 1;
        return 'qwen3.5-4b-q4_k_m';
      },
      setProgressSink: () => {}
    });

    const preflightHandler = handlers.get(SETUP_CHANNELS.preflight)!;
    // No modelId: the recommendation must be applied.
    const preflight = await preflightHandler(createFakeSender().event, {}) as {
      plan?: { model: { id: string } };
    };
    assert.equal(preflight.plan?.model.id, 'qwen3.5-4b-q4_k_m',
      'an absent modelId must install the recommended model, not the catalog default');
    assert.equal(resolutions, 1, 'the recommendation is resolved exactly once per request');

    // An explicit id still wins: a teacher who picked a model must get that one.
    const explicit = await preflightHandler(createFakeSender().event, { modelId: catalogModelId }) as {
      plan?: { model: { id: string } };
    };
    assert.equal(explicit.plan?.model.id, catalogModelId, 'a pinned modelId must not be overridden');

    // An empty string is "not chosen", not a request to install "" — the
    // renderer sends `{}`, but an empty id must not reach `resolveSetupModel`.
    const empty = await preflightHandler(createFakeSender().event, { modelId: '' }) as {
      plan?: { model: { id: string } };
    };
    assert.equal(empty.plan?.model.id, 'qwen3.5-4b-q4_k_m', 'an empty modelId falls back to the recommendation');
  }

  {
    const harness = createHarness();
    const orchestrator = new SetupOrchestrator(harness.dependencies);
    const { handlers, ipcMain } = createFakeIpcMain();
    const registration = registerSetupIpc({
      orchestrator,
      ipcMain,
      defaultModelId: catalogModelId,
      setProgressSink: sink => {
        // Rebind the harness callback exactly as main.ts would.
        harness.dependencies.onProgress = sink as never;
      }
    });

    for (const channel of Object.values(SETUP_CHANNELS)) {
      if (channel === SETUP_CHANNELS.progress) continue;
      assert.ok(handlers.has(channel), `missing handler for ${channel}`);
    }

    const { event, sent, destroy } = createFakeSender();
    const startHandler = handlers.get(SETUP_CHANNELS.start)!;
    const started = await startHandler(event, { modelId: catalogModelId });
    assert.equal((started as { complete: boolean }).complete, true);

    // Progress must have been pushed on the dedicated channel, never inline.
    assert.ok(sent.length > 0, 'the wizard must receive progress events');
    assert.ok(sent.every(message => message.channel === SETUP_CHANNELS.progress));
    const progressPayloads = sent.map(message => message.payload) as {
      step: string;
      message: string;
      totalBytes: number;
    }[];
    assert.ok(progressPayloads.every(payload => typeof payload.message === 'string' && payload.message.length > 0),
      'every progress event must carry a teacher-facing message');
    // The wizard must be told about every step it has to render.
    const steps = new Set(progressPayloads.map(payload => payload.step));
    for (const step of ['detecting', 'installing-runtime', 'installing-models', 'starting', 'smoke-test', 'complete']) {
      assert.ok(steps.has(step), `the wizard must be told about the ${step} step`);
    }
    // Byte counters must be forwarded from the installers when they report.

    // A destroyed window must not throw when setup reports progress.
    destroy();
    const cancelHandler = handlers.get(SETUP_CHANNELS.cancel)!;
    const cancelled = await cancelHandler(event);
    assert.equal((cancelled as { running: boolean }).running, false);

    registration.removeHandler(SETUP_CHANNELS.status);
    assert.equal(handlers.has(SETUP_CHANNELS.status), false, 'handlers must be removable');
  }

  // --- Byte progress from the installers reaches the renderer -------------
  {
    const harness = createHarness({
      runtime: { emitProgress: true },
      model: { emitProgress: true }
    });
    const orchestrator = new SetupOrchestrator(harness.dependencies);
    const { handlers, ipcMain } = createFakeIpcMain();
    registerSetupIpc({
      orchestrator,
      ipcMain,
      defaultModelId: catalogModelId,
      setProgressSink: sink => { harness.dependencies.onProgress = sink as never; }
    });
    const { event, sent } = createFakeSender();
    await handlers.get(SETUP_CHANNELS.start)!(event, {});

    const byteEvents = (sent.map(message => message.payload) as {
      stage: string;
      itemId: string;
      receivedBytes: number;
      totalBytes: number;
      message: string;
    }[]).filter(payload => payload.totalBytes > 0);

    assert.ok(byteEvents.some(payload => payload.stage === 'runtime' && payload.receivedBytes === 500),
      'runtime download bytes must be forwarded');
    assert.ok(byteEvents.some(payload => payload.stage === 'model' && payload.receivedBytes === 2_000),
      'model download bytes must be forwarded');
    assert.ok(byteEvents.every(payload => payload.itemId.length > 0),
      'each byte event must say which artifact it belongs to');
    assert.ok(byteEvents.every(payload => !payload.itemId.includes('\\') && !payload.itemId.includes('/')),
      'progress must never leak filesystem paths to the renderer');
  }

  // --- A failed run returns a status, not an opaque rejection -------------
  {
    const harness = createHarness({ model: { failWith: new Error('fetch failed') } });
    const orchestrator = new SetupOrchestrator(harness.dependencies);
    const { handlers, ipcMain } = createFakeIpcMain();
    registerSetupIpc({
      orchestrator,
      ipcMain,
      defaultModelId: catalogModelId,
      setProgressSink: sink => { harness.dependencies.onProgress = sink as never; }
    });

    const { event } = createFakeSender();
    const result = await handlers.get(SETUP_CHANNELS.start)!(event, {}) as {
      complete: boolean;
      step: string;
      error?: { code?: string };
    };
    assert.equal(result.complete, false, 'a failed setup must never report complete');
    assert.equal(result.step, 'installing-models');
    assert.equal(result.error?.code, 'network');
  }

  // --- An invalid model id fails without touching the state machine ------
  {
    const harness = createHarness();
    const orchestrator = new SetupOrchestrator(harness.dependencies);
    const { handlers, ipcMain } = createFakeIpcMain();
    registerSetupIpc({
      orchestrator,
      ipcMain,
      defaultModelId: catalogModelId,
      setProgressSink: sink => { harness.dependencies.onProgress = sink as never; }
    });
    const { event } = createFakeSender();
    await assert.rejects(
      handlers.get(SETUP_CHANNELS.start)!(event, { modelId: 'not-in-catalog' }) as Promise<unknown>,
      /không nằm trong danh mục đã xác minh/
    );
    assert.equal(harness.model.calls.install, 0, 'an invalid request must not download anything');
  }

  return 'setup-ipc tests passed';
}

void run().then(
  message => console.log(message),
  error => {
    console.error(error);
    process.exitCode = 1;
  }
);
