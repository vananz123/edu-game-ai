import os from 'node:os';
import path from 'node:path';
import type { ModelManifestEntry } from '../../src/ai-core/contracts';
import type { HardwareProfile } from '../../src/ai-core/hardware-detector';
import type {
  ModelInstallPort,
  RuntimeInstallPort,
  SetupOrchestratorDependencies,
  SetupProgress
} from '../../src/ai-core/setup-orchestrator';
import { SetupStateStore } from '../../src/ai-core/setup-state';
import type { SetupState } from '../../src/ai-core/setup-state';
import type { RuntimeManifestEntry } from '../../src/ai-core/runtime-manifest';

/**
 * Shared fakes for the setup suites. Everything here is synthetic: no test in
 * this repository may touch a real model, a real download or real teacher data.
 */

export const SYNTHETIC_MODEL: ModelManifestEntry = {
  id: 'synthetic-model-q4',
  version: 'test-rev',
  displayName: 'Mô hình thử nghiệm',
  friendlyName: 'Mô hình thử',
  tagline: 'Chỉ dùng trong kiểm thử.',
  downloadUrl: 'https://example.invalid/model.gguf',
  sizeBytes: 4_000,
  sha256: 'a'.repeat(64),
  sourceUrl: 'https://example.invalid/model',
  licenseName: 'Apache-2.0',
  licenseUrl: 'https://example.invalid/license',
  hardware: {
    minimumRamBytes: 4 * 1024 ** 3,
    recommendedRamBytes: 8 * 1024 ** 3,
    recommendedCpuThreads: 4,
    gpu: { supported: false, required: false, recommendedLayers: 0 },
    supportedLanguages: ['Tiếng Việt'],
    expectedResult: 'Kết quả thử nghiệm.'
  }
};

export function hardwareProfile(overrides: Partial<HardwareProfile> = {}): HardwareProfile {
  return {
    platform: 'win32',
    processArch: 'x64',
    osArch: 'x64',
    supportedArch: 'x64',
    totalRamBytes: 16 * 1024 ** 3,
    freeRamBytes: 8 * 1024 ** 3,
    logicalCpuCount: 8,
    cpuModel: 'CPU thử nghiệm',
    diskFreeBytes: 100 * 1024 ** 3,
    supported: true,
    ...overrides
  };
}

export function runtimeEntry(overrides: Partial<RuntimeManifestEntry> = {}): RuntimeManifestEntry {
  return {
    id: 'llama-test-cpu-x64',
    backend: 'cpu',
    platform: 'win32',
    arch: 'x64',
    displayName: 'llama.cpp CPU (thử nghiệm)',
    verified: true,
    version: 'b-test',
    downloadUrl: 'https://example.invalid/runtime.zip',
    sizeBytes: 1_000,
    sha256: 'b'.repeat(64),
    sourceUrl: 'https://example.invalid/runtime',
    ...overrides
  };
}

/** In-memory state writer; `saved` mirrors what a restart would read. */
export function createStore(initial?: SetupState) {
  const saved: { value: SetupState | undefined } = { value: initial };
  const store = new SetupStateStore(
    initial ?? { schemaVersion: 1, step: 'idle', completedSteps: [] },
    async state => {
      // Round-trip through JSON exactly like the file-backed store does, so a
      // serialisation bug cannot hide in tests.
      saved.value = JSON.parse(JSON.stringify(state)) as SetupState;
    }
  );
  return { store, saved };
}

export interface FakeInstallerBehaviour {
  /** Throws instead of completing, to exercise failure paths. */
  failWith?: Error;
  /** Emits a progress tick so byte-level forwarding can be asserted. */
  emitProgress?: boolean;
}

export function createRuntimePort(
  behaviour: FakeInstallerBehaviour & { installed?: boolean } = {}
) {
  const calls = { install: 0, supportFiles: 0 };
  let installed = behaviour.installed ?? false;
  const port: RuntimeInstallPort = {
    async getExecutablePath() {
      return installed ? 'C:\\synthetic\\llama-server.exe' : undefined;
    },
    async ensureSupportFiles() {
      calls.supportFiles += 1;
    },
    async install(_id, onProgress, signal) {
      calls.install += 1;
      if (signal?.aborted) throw new Error('Cài đặt llama.cpp đã bị hủy.');
      if (behaviour.emitProgress) {
        onProgress?.({ receivedBytes: 500, totalBytes: 1_000, bytesPerSecond: 100 });
      }
      if (behaviour.failWith) throw behaviour.failWith;
      installed = true;
      return 'C:\\synthetic\\llama-server.exe';
    }
  };
  return { port, calls, isInstalled: () => installed };
}

export function createModelPort(behaviour: FakeInstallerBehaviour = {}) {
  const calls = { install: 0, modelIds: [] as string[] };
  const port: ModelInstallPort = {
    async install(manifest, onProgress, signal) {
      calls.install += 1;
      calls.modelIds.push(manifest.id);
      if (signal?.aborted) throw new Error('Tải mô hình đã bị hủy.');
      if (behaviour.emitProgress) {
        onProgress?.({ receivedBytes: 2_000, totalBytes: 4_000, bytesPerSecond: 200 });
      }
      if (behaviour.failWith) throw behaviour.failWith;
      return path.join('C:\\synthetic', `${manifest.id}.gguf`);
    }
  };
  return { port, calls };
}

export interface HarnessOptions {
  hardware?: HardwareProfile;
  runtime?: FakeInstallerBehaviour & { installed?: boolean };
  model?: FakeInstallerBehaviour;
  /** Pre-existing state, to simulate a restart mid-setup. */
  initial?: SetupState;
  runtimeInstalled?: boolean;
  modelInstalled?: boolean;
  /** Pass `null` to simulate an unmeasurable disk. */
  diskFreeBytes?: number | null;
  startRuntime?: SetupOrchestratorDependencies['startRuntime'];
  runSmokeTest?: SetupOrchestratorDependencies['runSmokeTest'];
  stopRuntime?: SetupOrchestratorDependencies['stopRuntime'];
}

export function createHarness(options: HarnessOptions = {}) {
  const { store, saved } = createStore(options.initial);
  const progress: SetupProgress[] = [];
  const runtimeInstalled = options.runtimeInstalled ?? Boolean(options.runtime?.installed);
  const runtime = createRuntimePort({ ...options.runtime, installed: runtimeInstalled });
  const modelPort = createModelPort(options.model);
  const events = { started: 0, stopped: 0, smokeTests: 0, detected: 0 };

  const dependencies: SetupOrchestratorDependencies = {
    store,
    detectHardware: async () => {
      events.detected += 1;
      return options.hardware ?? hardwareProfile();
    },
    getRuntimeExecutablePath: async () => runtime.port.getExecutablePath(),
    createRuntimeInstaller: () => runtime.port,
    createModelInstaller: () => modelPort.port,
    startRuntime: options.startRuntime ?? (async () => {
      events.started += 1;
      return 'http://127.0.0.1:1234';
    }),
    stopRuntime: options.stopRuntime ?? (async () => { events.stopped += 1; }),
    runSmokeTest: options.runSmokeTest ?? (async () => { events.smokeTests += 1; }),
    getDiskFreeBytes: async () => {
      if (options.diskFreeBytes === null) return undefined;
      return options.diskFreeBytes ?? 100 * 1024 ** 3;
    },
    modelDirectory: path.join(os.tmpdir(), 'edugame-setup-test'),
    isModelInstalled: async () => options.modelInstalled ?? false,
    onProgress: event => progress.push(event)
  };

  return { dependencies, store, saved, progress, runtime, model: modelPort, events };
}


