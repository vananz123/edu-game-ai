/**
 * First-run setup, §4 SetupOrchestrator + §11 Failure Handling
 * (docs/archive/specs/update_AI_plan_5.txt).
 *
 * This module is the only place that *does* setup, and it is deliberately a
 * composition layer: it owns sequencing, cancellation and state persistence,
 * and delegates every side effect to the already-tested components
 * (`runtime-installer`, `model-installer`, `runtime-resolver`, `setup-state`).
 * Nothing here re-implements downloading, hashing or process management.
 *
 * Why every dependency is injected:
 *   - the failure paths that §11 asks for (no internet, checksum mismatch,
 *     interrupted download, restart mid-setup) are exactly the paths that are
 *     impossible to exercise against real 2.4 GB downloads, so they must be
 *     testable with fakes;
 *   - `main.ts` decides where files live via Electron's `app.getPath`, and
 *     `ai-core` must not import Electron.
 *
 * Guarantees:
 *   - Setup can never be marked complete unless every required step passed.
 *   - Only one setup run exists at a time; a second `start()` is refused
 *     instead of racing the first (§7 "prevent duplicate setup processes").
 *   - Cancelling stops progress events and leaves the downloaded bytes on disk
 *     so the next run resumes rather than restarts (§11 "interrupted downloads").
 *   - A model the spec pins but the verified catalog lacks is reported as an
 *     incomplete configuration, never silently substituted (§5).
 */
import type { HardwareProfile } from './hardware-detector';
import type { ModelManifestEntry } from './contracts';
import type { LlamaRuntimeInstaller } from './runtime-installer';
import type { RuntimeArtifact } from './runtime-installer';
import { RUNTIME_MANIFEST } from './runtime-manifest';
import type { RuntimeManifest, RuntimeManifestEntry } from './runtime-manifest';
import { resolveRuntime } from './runtime-resolver';
import type { RuntimeResolution } from './runtime-resolver';
import type { SetupStateStore } from './setup-state';
import { isSetupComplete } from './setup-state';
import type { SetupState, SetupStep } from './setup-state';

/** Download progress forwarded to the wizard. Never contains file contents. */
export interface SetupProgress {
  step: SetupStep;
  /** Which artifact the bytes belong to. */
  stage: 'runtime' | 'model';
  /** Model/runtime id, so the UI can label the bar. */
  itemId: string;
  receivedBytes: number;
  totalBytes: number;
  bytesPerSecond: number;
  /** Teacher-facing Vietnamese one-liner, e.g. "Đang tải model AI…". */
  message: string;
}

export type SetupFailureCode =
  | 'unsupported-hardware'
  | 'incomplete-configuration'
  | 'disk-space'
  | 'network'
  | 'download'
  | 'integrity'
  | 'startup'
  | 'smoke-test'
  | 'cancelled'
  | 'busy';

/** Thrown/returned on failure. `code` lets the wizard pick the right recovery action. */
export class SetupError extends Error {
  constructor(
    message: string,
    readonly code: SetupFailureCode,
    readonly step?: SetupStep
  ) {
    super(message);
    this.name = 'SetupError';
  }
}

/**
 * Progress callback signature shared by both installers. `ModelInstaller` passes
 * `ModelDownloadProgress`, `LlamaRuntimeInstaller` passes
 * `LocalAiDownloadProgress`; only these four fields are common to both.
 */
type InstallerProgress = {
  receivedBytes: number;
  totalBytes: number;
  bytesPerSecond: number;
};

/** The subset of `ModelInstaller` the orchestrator uses, so tests can inject a fake. */
export interface ModelInstallPort {
  install(
    manifest: ModelManifestEntry,
    onProgress?: (progress: InstallerProgress) => void,
    signal?: AbortSignal
  ): Promise<string>;
}

/** The subset of `LlamaRuntimeInstaller` the orchestrator uses. */
export interface RuntimeInstallPort {
  getExecutablePath(): Promise<string | undefined>;
  /**
   * Which backend the extracted runtime on disk actually is. Optional so
   * existing fakes keep compiling; when absent the orchestrator falls back to a
   * presence check (old behaviour).
   */
  getInstalledBackend?(): Promise<string | undefined>;
  install(
    modelId?: string,
    onProgress?: (progress: InstallerProgress) => void,
    signal?: AbortSignal
  ): Promise<string>;
  ensureSupportFiles?(): Promise<void>;
}

export interface SetupOrchestratorDependencies {
  /** Reads the persisted state written by a previous run. */
  store: SetupStateStore;
  /** Injected so tests never touch the real machine. */
  detectHardware: () => Promise<HardwareProfile>;
  /** Path of the installed llama-server, or undefined when absent. */
  getRuntimeExecutablePath: () => Promise<string | undefined>;
  createRuntimeInstaller: (entry: RuntimeManifestEntry) => RuntimeInstallPort;
  createModelInstaller: () => ModelInstallPort;
  /**
   * Starts llama-server with the explicit model and resolves with its base URL.
   * Reused from `main.ts` so setup never spawns a second kind of server.
   */
  startRuntime: (model: ModelManifestEntry) => Promise<string>;
  /** Stops the runtime when a step after startup fails, so no orphan process is left. */
  stopRuntime: () => Promise<void>;
  /** Health/generation check (§3 step 12). Resolves only if the runtime answered sanely. */
  runSmokeTest: (input: { baseUrl: string; model: ModelManifestEntry }) => Promise<void>;
  /** Free bytes in the model directory; throws or resolves undefined when unmeasurable. */
  getDiskFreeBytes: (directory: string) => Promise<number | undefined>;
  /** Where models are installed, for the disk preflight. */
  modelDirectory: string;
  /** True when the model file is present and non-empty; avoids double-counting disk usage. */
  isModelInstalled: (model: ModelManifestEntry) => Promise<boolean>;
  onProgress?: (progress: SetupProgress) => void;
  now?: () => Date;
}

/** Everything the wizard needs to render, without leaking filesystem details. */
export interface SetupStatus {
  step: SetupStep;
  complete: boolean;
  /** Set when a previous run failed; the wizard offers "Thử lại". */
  error?: { message: string; code?: string; step: SetupStep; attempts: number };
  /** Chosen runtime, once detection has run. */
  runtimeId?: string;
  backend?: string;
  modelId?: string;
  /** True while a run is active in this process. */
  running: boolean;
  hardware?: {
    platform: NodeJS.Platform;
    arch: string;
    osArch: string;
    cpuModel: string;
    logicalCpuCount: number;
    totalRamBytes: number;
    diskFreeBytes: number | undefined;
    supported: boolean;
  };
  /** Teacher-facing plan, e.g. download sizes, for the "requirements" screen. */
  plan?: SetupPlan;
  /** Set when setup refuses to start; the wizard shows it instead of a progress bar. */
  blocked?: { code: SetupFailureCode; message: string };
}

/** What setup intends to download/start. Shown before anything is downloaded. */
export interface SetupPlan {
  runtime: {
    id: string;
    displayName: string;
    downloadBytes: number;
    installed: boolean;
    usedFallback: boolean;
    fallbackReason?: string;
  };
  model: {
    id: string;
    displayName: string;
    downloadBytes: number;
    installed: boolean;
  };
  /** Total bytes setup must still download. */
  remainingBytes: number;
  /** Free disk space, or undefined when it could not be measured. */
  diskFreeBytes: number | undefined;
  /** True when `diskFreeBytes` is known to be too small. */
  enoughDiskSpace: boolean;
}

export interface SetupOptions {
  /** Verified catalog model to install. Never derived from the renderer. */
  model: ModelManifestEntry;
  manifest?: RuntimeManifest;
  /**
   * Preferred runtime backend. Defaults to the resolver default (CPU); an
   * OpenVINO request falls back to CPU with a stated reason.
   *
   * `vulkan` is accepted here because it is a real, verified entry: setup must
   * be able to *install* the GPU build a teacher asked for, otherwise the
   * choice in Settings could never take effect. The resolver still refuses to
   * hand back an entry that is not in the manifest, and falls back to CPU (with
   * a reason) when the manifest for this machine has no GPU build.
   */
  backend?: 'cpu' | 'vulkan' | 'openvino' | 'auto';
}

export class SetupOrchestrator {
  private running = false;
  private controller: AbortController | undefined;
  /** Last computed preflight, kept so `getStatus()` can explain a blocked setup. */
  private lastBlocked: { code: SetupFailureCode; message: string } | undefined;
  private lastHardware: HardwareProfile | undefined;
  private lastPlan: SetupPlan | undefined;

  constructor(private readonly dependencies: SetupOrchestratorDependencies) {}

  /** Pure read of persisted state + last known plan; never starts anything. */
  async getStatus(): Promise<SetupStatus> {
    const state = this.dependencies.store.get();
    return {
      step: state.step,
      complete: isSetupComplete(state),
      ...(state.error ? {
        error: {
          message: state.error.message,
          ...(state.error.code ? { code: state.error.code } : {}),
          step: state.error.step,
          attempts: state.error.attempts
        }
      } : {}),
      ...(state.runtimeId ? { runtimeId: state.runtimeId } : {}),
      ...(state.backend ? { backend: state.backend } : {}),
      ...(state.modelId ? { modelId: state.modelId } : {}),
      running: this.running,
      ...(this.lastHardware ? {
        hardware: {
          platform: this.lastHardware.platform,
          arch: this.lastHardware.processArch,
          osArch: this.lastHardware.osArch,
          cpuModel: this.lastHardware.cpuModel,
          logicalCpuCount: this.lastHardware.logicalCpuCount,
          totalRamBytes: this.lastHardware.totalRamBytes,
          diskFreeBytes: this.lastHardware.diskFreeBytes,
          supported: this.lastHardware.supported
        }
      } : {}),
      ...(this.lastPlan ? { plan: this.lastPlan } : {}),
      ...(this.lastBlocked ? { blocked: this.lastBlocked } : {})
    };
  }

  /**
   * Detects hardware, resolves a runtime and checks disk space *without*
   * downloading. The wizard calls this to fill its requirements screen; every
   * refusal here is a returned value, not an exception.
   */
  async preflight(options: SetupOptions): Promise<SetupStatus> {
    const hardware = await this.dependencies.detectHardware();
    this.lastHardware = hardware;
    this.lastBlocked = undefined;
    this.lastPlan = undefined;

    const resolution = resolveRuntime(hardware, options.manifest || RUNTIME_MANIFEST, {
      ...(options.backend ? { backend: options.backend } : {})
    });
    if (resolution.status === 'unsupported') {
      // The resolver only falls back to a generic sentence when the hardware
      // profile carries no reason. Never show that to a teacher: they need to
      // know the machine is not supported *and* that saved games still work.
      const message = resolution.code === 'platform' || resolution.code === 'arch'
        ? hardware.unsupportedReason || defaultUnsupportedReason(hardware)
        : resolution.reason;
      this.lastBlocked = { code: 'unsupported-hardware', message };
      return this.getStatus();
    }

    const runtimeInstalled = Boolean(await this.dependencies.getRuntimeExecutablePath());
    // A model already on disk costs no bandwidth, so it must not count against
    // the preflight or the teacher sees a false "not enough space".
    const modelInstalled = await this.dependencies.isModelInstalled(options.model);
    const remainingBytes =
      (runtimeInstalled ? 0 : resolution.entry.sizeBytes) +
      (modelInstalled ? 0 : options.model.sizeBytes);

    const diskFreeBytes = await this.safeDiskFree();
    this.lastPlan = {
      runtime: {
        id: resolution.entry.id,
        displayName: resolution.entry.displayName,
        downloadBytes: runtimeInstalled ? 0 : resolution.entry.sizeBytes,
        installed: runtimeInstalled,
        usedFallback: resolution.usedFallback,
        ...(resolution.fallbackReason ? { fallbackReason: resolution.fallbackReason } : {})
      },
      model: {
        id: options.model.id,
        displayName: options.model.displayName,
        downloadBytes: modelInstalled ? 0 : options.model.sizeBytes,
        installed: modelInstalled
      },
      remainingBytes,
      diskFreeBytes,
      // Unknown disk space is not a refusal: the installer re-checks before
      // writing, and blocking here would strand machines we cannot measure.
      enoughDiskSpace: diskFreeBytes === undefined ? true : diskFreeBytes >= remainingBytes
    };
    if (!this.lastPlan.enoughDiskSpace) {
      this.lastBlocked = {
        code: 'disk-space',
        message: `Ổ đĩa còn ${formatGiB(diskFreeBytes)}, cần khoảng ${formatGiB(remainingBytes)} để cài AI. ` +
          'Hãy giải phóng dung lượng rồi thử lại.'
      };
    }
    return this.getStatus();
  }

  /**
   * Runs setup to completion, resuming from whatever the persisted state
   * recorded. Rejected with `SetupError` and the state marked failed on any
   * problem; never returns a "complete" status unless every step passed.
   */
  async start(options: SetupOptions): Promise<SetupStatus> {
    if (this.running) {
      throw new SetupError('Quá trình cài đặt AI đang chạy. Vui lòng chờ hoàn tất.', 'busy');
    }
    this.running = true;
    this.controller = new AbortController();
    const signal = this.controller.signal;
    let baseUrl: string | undefined;
    let started = false;

    try {
      // Preflight is authoritative: it also refreshes the plan shown by the UI.
      const status = await this.preflight(options);
      if (status.blocked) {
        throw new SetupError(status.blocked.message, status.blocked.code);
      }
      const plan = this.lastPlan as SetupPlan;
      const resolution = resolveRuntime(
        this.lastHardware as HardwareProfile,
        options.manifest || RUNTIME_MANIFEST,
        { ...(options.backend ? { backend: options.backend } : {}) }
      );
      if (resolution.status !== 'ok') {
        throw new SetupError(resolution.reason, 'unsupported-hardware', 'detecting');
      }

      // Resume, do not restart. The state machine only moves forward, so a
      // run interrupted at `installing-models` must continue from there; the
      // preflight already re-verified hardware, runtime and disk, so redoing
      // `detecting` is redundant anyway.
      // Repairing the app-local DLLs is unconditional: an install from an older
      // build can have llama-server without them, and skipping the runtime step
      // would otherwise leave that broken install in place.
      if (plan.runtime.installed) {
        await this.dependencies.createRuntimeInstaller(resolution.entry).ensureSupportFiles?.();
      }

      const resumeFrom = this.resumePoint();
      if (!resumeFrom) {
        this.emit({ step: 'complete', message: 'AI local đã được cài đặt sẵn.' });
        return this.getStatus();
      }

      const ordered: SetupStep[] = ['detecting', 'installing-runtime', 'installing-models', 'starting', 'smoke-test'];
      for (const step of ordered.slice(ordered.indexOf(resumeFrom))) {
        // Skip work only when it is *both* recorded as done and physically
        // present: a state file can be ahead of the disk if the user deleted a
        // file, and `install()` re-verifies rather than trusting the record.
        if (step === 'installing-runtime' && plan.runtime.installed) continue;
        if (step === 'installing-models' && plan.model.installed) continue;
        await this.step(step, {
          model: options.model,
          signal,
          ...(step === 'installing-runtime' ? { entry: resolution.entry } : {}),
          ...(step === 'starting' ? { onStarted: (url: string) => { baseUrl = url; started = true; } } : {}),
          ...(step === 'smoke-test' ? { baseUrl } : {})
        });
      }

      const finalState = await this.dependencies.store.transitionTo('complete', {
        modelId: options.model.id,
        backend: resolution.entry.backend
      });
      if (!isSetupComplete(finalState)) {
        throw new SetupError('Không thể xác nhận hoàn tất cài đặt.', 'smoke-test', 'smoke-test');
      }
      this.emit({ step: 'complete', message: 'Đã cài đặt xong AI local.' });
      return this.getStatus();
    } catch (error) {
      const failure = toSetupError(error, signal);
      const step = failure.step || currentStep(this.dependencies.store.get());
      // A half-started server must not outlive a failed setup.
      if (started) {
        await this.dependencies.stopRuntime().catch(() => undefined);
        started = false;
      }
      // 'busy' is the caller's mistake, not a setup failure, so it must not
      // overwrite a good state.
      if (failure.code !== 'busy') {
        await this.dependencies.store.fail({ message: failure.message, code: failure.code, step });
      }
      throw failure;
    } finally {
      this.running = false;
      this.controller = undefined;
    }
  }

  /** Emits a byte-level progress event while an artifact downloads. */
  private emitBytes(step: SetupStep, stage: 'runtime' | 'model', itemId: string, message: string) {
    return (progress: InstallerProgress) => {
      this.dependencies.onProgress?.({
        step,
        stage,
        itemId,
        receivedBytes: progress.receivedBytes,
        totalBytes: progress.totalBytes,
        bytesPerSecond: progress.bytesPerSecond,
        message
      });
    };
  }

  /** Waits for in-flight progress to stop after an abort so the UI settles. */
  private assertNotAborted(signal: AbortSignal): void {
    if (signal.aborted) throw new SetupError('Đã hủy cài đặt.', 'cancelled');
  }

  private async step(step: SetupStep, context: StepContext): Promise<void> {
    this.assertNotAborted(context.signal);
    const store = this.dependencies.store;
    await store.transitionTo(step, {
      ...(context.entry ? { runtimeId: context.entry.id, backend: context.entry.backend } : {}),
      ...(context.model ? { modelId: context.model.id } : {})
    });

    try {
      await this.performStep(step, context);
    } catch (error) {
      // Attribute failures to *this* step. Without it the wizard would resume
      // from whatever step was current, which is wrong once a later step fails.
      const failure = toSetupError(error, context.signal, step);
      throw failure.step ? failure : new SetupError(failure.message, failure.code, step);
    }
  }

  private async performStep(step: SetupStep, context: StepContext): Promise<void> {
    switch (step) {
      case 'detecting': {
        // Detection already happened in preflight; reaching here means the
        // machine is supported and the plan is known.
        this.emit({ step, message: 'Đã kiểm tra cấu hình máy.' });
        return;
      }
      case 'installing-runtime': {
        const entry = context.entry;
        if (!entry) throw new SetupError('Thiếu thông tin bộ AI local cần cài.', 'incomplete-configuration', step);
        this.emit({ step, message: `Đang tải bộ AI local ${entry.displayName}…` });
        const installer = this.dependencies.createRuntimeInstaller(entry);
        // `llama-server` may already exist while the VC++ DLLs do not, which is
        // exactly the crash the support-file repair exists for. It may also be
        // the *other* backend's build: setup runs because the plan changed (e.g.
        // the teacher chose Vulkan), so an existing CPU install must be replaced.
        const installedBackend = await installer.getInstalledBackend?.();
        const alreadyRight = Boolean(await installer.getExecutablePath()) &&
          (installedBackend === undefined || installedBackend === entry.backend);
        if (alreadyRight) {
          await installer.ensureSupportFiles?.();
          return;
        }
        await installer.install(
          entry.id,
          this.emitBytes(step, 'runtime', entry.id, `Đang tải bộ AI local ${entry.displayName}…`),
          context.signal
        );
        this.assertNotAborted(context.signal);
        return;
      }
      case 'installing-models': {
        this.emit({ step, message: `Đang tải model ${context.model.displayName}…` });
        await this.dependencies.createModelInstaller().install(
          context.model,
          this.emitBytes(step, 'model', context.model.id, `Đang tải model ${context.model.displayName}…`),
          context.signal
        );
        this.assertNotAborted(context.signal);
        return;
      }
      case 'starting': {
        this.assertNotAborted(context.signal);
        this.emit({ step, message: 'Đang khởi động AI local…' });
        const baseUrl = await this.dependencies.startRuntime(context.model);
        this.assertNotAborted(context.signal);
        context.onStarted?.(baseUrl);
        return;
      }
      case 'smoke-test': {
        this.assertNotAborted(context.signal);
        if (!context.baseUrl) {
          throw new SetupError('AI local chưa khởi động nên không thể kiểm tra.', 'startup', step);
        }
        this.emit({ step, message: 'Đang kiểm tra AI local…' });
        await this.dependencies.runSmokeTest({ baseUrl: context.baseUrl, model: context.model });
        this.assertNotAborted(context.signal);
        return;
      }
      default:
        // 'idle' and 'complete' are not steps that perform work.
        return;
    }
  }

  private emit(progress: { step: SetupStep; message: string }): void {
    this.dependencies.onProgress?.({
      step: progress.step,
      stage: 'model',
      itemId: '',
      receivedBytes: 0,
      totalBytes: 0,
      bytesPerSecond: 0,
      message: progress.message
    });
  }

  isRunning(): boolean {
    return this.running;
  }

  /**
   * Cancels the active run. Downloaded bytes stay on disk so the next run
   * resumes instead of restarting.
   */
  cancel(): SetupState {
    if (this.running && this.controller) this.controller.abort();
    return this.dependencies.store.get();
  }

  private async safeDiskFree(): Promise<number | undefined> {
    try {
      return await this.dependencies.getDiskFreeBytes(this.dependencies.modelDirectory);
    } catch {
      return undefined;
    }
  }

  /**
   * The first step that still needs to run, derived from persisted state.
   * Returns undefined when setup already finished, so a second call does no work.
   */
  private resumePoint(): SetupStep | undefined {
    const state = this.dependencies.store.get();
    if (isSetupComplete(state)) return undefined;
    // A previously failed step is where the teacher's retry should continue.
    const current = state.step === 'idle' ? 'detecting' : state.error?.step || state.step;
    if (current === 'complete') return 'smoke-test';
    return current;
  }
}

/**
 * Last-resort message when the hardware profile gives no reason. Keeps the
 * offline reassurance every other unsupported path already carries.
 */
function defaultUnsupportedReason(hardware: HardwareProfile): string {
  if (hardware.platform !== 'win32') {
    return 'AI local hiện chỉ hỗ trợ Windows. Trên hệ điều hành khác, các trò chơi đã lưu vẫn mở được ' +
      'nhưng không tạo nội dung mới bằng AI local.';
  }
  return `Kiến trúc máy (${hardware.processArch}) chưa có bản AI local đã xác minh. Cần Windows x64 hoặc ARM64. ` +
    'Các trò chơi đã lưu vẫn mở được; chỉ phần tạo nội dung mới bằng AI local cần bản này.';
}

function formatGiB(bytes: number | undefined): string {
  if (bytes === undefined) return 'không xác định';
  return `${(bytes / 1024 ** 3).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} GB`;
}

interface StepContext {
  model: ModelManifestEntry;
  signal: AbortSignal;
  /** Present only for the runtime step. */
  entry?: RuntimeManifestEntry;
  /** URL resolved by the starting step, consumed by the smoke test. */
  baseUrl?: string;
  onStarted?: (baseUrl: string) => void;
}

/** The step a failed run was in, so the wizard and resume logic agree. */
function currentStep(state: SetupState): SetupStep {
  if (state.error) return state.error.step;
  if (state.step === 'idle') return 'detecting';
  return state.step;
}

/** Network-level failures, as opposed to HTTP errors or corrupt payloads. */
const NETWORK_ERROR_CODES = new Set([
  'ENOTFOUND',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET'
]);

/**
 * Maps a thrown value onto a `SetupError` with a teacher-actionable code.
 *
 * The step decides the default code, because only the download steps can fail
 * with a checksum/network/range error. Message sniffing is therefore limited:
 * a smoke-test failure is always attributed to the smoke test (the runtime is
 * already running at step 12), so its wording can never be misread as a start,
 * network or download problem — least of all "Không khởi chạy được model …"
 * wrapping an empty generation.
 */
export function toSetupError(error: unknown, signal?: AbortSignal, step?: SetupStep): SetupError {
  if (error instanceof SetupError && error.step) return error;
  if (signal?.aborted) return new SetupError('Đã hủy cài đặt.', 'cancelled', step);

  const message = error instanceof SetupError ? error.message : error instanceof Error ? error.message : String(error);
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : '';
  const lower = message.toLowerCase();
  const baseCode = error instanceof SetupError ? error.code : undefined;

  if (NETWORK_ERROR_CODES.has(code) ||
      /fetch failed|network error|offline|no internet|getaddrinfo|enotfound|econnreset|etimedout/.test(lower)) {
    return new SetupError(
      'Không kết nối được để tải AI. Hãy kiểm tra mạng rồi thử lại; các phần đã tải xong sẽ được giữ nguyên.',
      'network',
      step
    );
  }
  if (/sha-256|checksum|không vượt qua kiểm tra|toàn vẹn/.test(lower)) {
    return new SetupError(`${message} Bản tải về có thể bị hỏng; hãy thử tải lại.`, 'integrity', step);
  }
  if (/dung lượng|ENOSPC/.test(message) || code === 'ENOSPC') {
    return new SetupError(message, 'disk-space', step);
  }
  if (/bị hủy|aborted|abort/i.test(message)) {
    return new SetupError('Đã hủy cài đặt.', 'cancelled', step);
  }
  // Step 12 is a smoke test, not a start: the runtime is already running when it
  // fails. Message sniffing would otherwise relabel it: `details.code` is e.g.
  // `AI_EMPTY`, and `Error.name` ("Error") is not a usable failure code.
  if (step === 'smoke-test') return new SetupError(message, 'smoke-test', step);
  // Scoped deliberately: a bare /start/ would also match "không khởi động",
  // "started" and unrelated words, mislabelling smoke-test failures.
  if (/khởi (chạy|động)|startup|timeout|quá thời gian/.test(lower)) {
    return new SetupError(message, 'startup', step);
  }
  if (baseCode) return new SetupError(message, baseCode, step);

  // Failures before any step is known (or during the download steps) are
  // download failures; `starting` has its own code.
  const fallback: SetupFailureCode = step === 'starting' ? 'startup' : 'download';
  return new SetupError(message || 'Cài đặt thất bại vì lỗi không xác định.', fallback, step);
}


