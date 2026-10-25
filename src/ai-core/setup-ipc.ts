/**
 * First-run setup IPC, §8 Electron Security and Process Management
 * (docs/archive/specs/update_AI_plan_5.txt).
 *
 * Kept separate from the `ai:*` handlers in `main.ts` on purpose: those cover
 * the Settings modal (download one model on demand), while these drive the
 * first-run wizard through the persistent state machine.
 *
 * Trust model — everything the renderer sends is untrusted:
 *   - no filesystem paths, directories or URLs are ever accepted. The only
 *     input is a model id, and it must already exist in the verified catalog;
 *   - the runtime build comes from the resolver over the versioned manifest,
 *     never from the request;
 *   - progress is pushed on a dedicated channel, and the handler refuses to
 *     send to a destroyed window (closing the wizard must not throw).
 */
import type { ModelManifestEntry } from './contracts';
import { QWEN_LOCAL_MODELS } from './model-catalog';
import type { RuntimeBackend } from './runtime-manifest';
import { SetupError } from './setup-orchestrator';
import type { SetupOrchestrator, SetupOptions, SetupStatus } from './setup-orchestrator';

/** IPC channel names. Kept as constants so preload and main cannot drift. */
export const SETUP_CHANNELS = {
  status: 'setup:status',
  preflight: 'setup:preflight',
  start: 'setup:start',
  cancel: 'setup:cancel',
  progress: 'setup:progress'
} as const;

/** Minimal shape of the Electron objects used here, so this file stays testable. */
export interface SetupIpcEvent {
  sender: {
    isDestroyed(): boolean;
    send(channel: string, payload: unknown): void;
  };
}

export interface SetupIpcRegistration {
  removeHandler(channel: string): void;
}

export interface RegisterSetupIpcOptions {
  orchestrator: SetupOrchestrator;
  /** Injected `ipcMain`. */
  ipcMain: {
    handle(channel: string, handler: (event: SetupIpcEvent, payload?: unknown) => unknown): void;
    removeHandler?(channel: string): void;
  };
  /**
   * Default model used when the renderer does not pick one. A function is
   * awaited at request time, so hardware-based recommendations stay accurate
   * instead of being frozen when the IPC handlers were registered.
   */
  defaultModelId: string | (() => string | Promise<string>);
  /**
   * Backend the host wants setup to install, from the teacher's saved
   * preference. Omitted means "let the resolver decide" (CPU), so every existing
   * caller keeps its current behaviour. A function is awaited at request time
   * for the same reason as `defaultModelId`: settings can change while the app
   * runs, and setup must describe the choice in force *now*.
   */
  defaultBackend?: RuntimeBackend | 'auto' | (() => RuntimeBackend | 'auto' | Promise<RuntimeBackend | 'auto'>);
  /** Binds the progress callback once; returns the bound dependency. */
  setProgressSink(sink: (progress: unknown) => void): void;
}

/**
 * Resolves a renderer-supplied model id to a verified catalog entry.
 * An unknown id is a hard error: silently substituting a different model is
 * exactly what §5 forbids.
 */
export function resolveSetupModel(modelId: unknown, catalog: readonly ModelManifestEntry[] = QWEN_LOCAL_MODELS): ModelManifestEntry {
  const id = typeof modelId === 'string' ? modelId.trim() : '';
  if (!id) throw new Error('Thiếu mã mô hình AI để cài đặt.');
  const model = catalog.find(entry => entry.id === id);
  if (!model) throw new Error('Mô hình AI được chọn không nằm trong danh mục đã xác minh.');
  return model;
}

/** Rejects any payload that is not a plain object, so nothing exotic is parsed. */
export function readSetupRequest(payload: unknown): { modelId?: string } {
  if (payload === undefined || payload === null) return {};
  if (typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Yêu cầu cài đặt AI không hợp lệ.');
  }
  const record = payload as Record<string, unknown>;
  // Unknown keys are ignored rather than forwarded: the renderer must not be
  // able to influence directories, URLs or backend selection through extras.
  return typeof record.modelId === 'string' ? { modelId: record.modelId } : {};
}
export function registerSetupIpc(options: RegisterSetupIpcOptions): SetupIpcRegistration {
  const { orchestrator, ipcMain, defaultModelId, defaultBackend } = options;

  const buildOptions = async (payload: unknown): Promise<SetupOptions> => {
    const request = readSetupRequest(payload);
    // Resolved per request: `defaultModelId` may be a function that probes the
    // machine, and the answer must describe *this* machine now.
    const fallbackId = typeof defaultModelId === 'function' ? await defaultModelId() : defaultModelId;
    // The backend is *not* taken from the payload: a renderer must not be able
    // to choose it (see `readSetupRequest`). It comes from the saved teacher
    // preference the host resolves, so re-running setup installs the same build
    // the app actually runs instead of quietly reverting to CPU.
    const backend = typeof defaultBackend === 'function' ? await defaultBackend() : defaultBackend;
    return {
      model: resolveSetupModel(request.modelId || fallbackId),
      ...(backend && backend !== 'auto' ? { backend } : {})
    };
  };

  const safeStatus = async (): Promise<SetupStatus> => orchestrator.getStatus();

  ipcMain.handle(SETUP_CHANNELS.status, () => safeStatus());

  ipcMain.handle(SETUP_CHANNELS.preflight, async (_event, payload) => {
    try {
      return await orchestrator.preflight(await buildOptions(payload));
    } catch (error) {
      // Preflight refusals are values; a throw here would surface as a rejected
      // promise in the wizard with no explanation.
      return await safeStatus().then(status => ({
        ...status,
        blocked: {
          code: 'incomplete-configuration' as const,
          message: error instanceof Error ? error.message : String(error)
        }
      }));
    }
  });

  ipcMain.handle(SETUP_CHANNELS.start, async (event, payload) => {
    const sender = event.sender;
    options.setProgressSink(progress => {
      if (!sender.isDestroyed()) sender.send(SETUP_CHANNELS.progress, progress);
    });
    try {
      return await orchestrator.start(await buildOptions(payload));
    } catch (error) {
      // The state machine already recorded the failure; return the current
      // status so the wizard re-renders the failed step instead of only an
      // opaque rejected promise.
      if (error instanceof SetupError) return await safeStatus();
      throw error;
    }
  });

  ipcMain.handle(SETUP_CHANNELS.cancel, async () => {
    orchestrator.cancel();
    return await safeStatus();
  });

  return {
    removeHandler(channel: string) {
      ipcMain.removeHandler?.(channel);
    }
  };
}
