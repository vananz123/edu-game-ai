/**
 * First-run setup, §4 RuntimeResolver (docs/archive/specs/update_AI_plan_5.txt).
 *
 * Pure decision function: hardware profile + manifest in, one decision out. It
 * performs no I/O, reads no environment and downloads nothing, so the entire
 * decision table can be unit tested and audited.
 *
 * Guarantees:
 *   - Never constructs a URL or checksum. It only selects an entry that is
 *     already in the manifest.
 *   - Never returns an unsupported or unverified entry to be installed.
 *   - Never throws on bad input; unsupported hardware is a returned value.
 *   - Falls back to CPU when a preferred backend is unavailable, and says so.
 */
import type { HardwareProfile } from './hardware-detector';
import type { RuntimeBackend, RuntimeManifest, RuntimeManifestEntry } from './runtime-manifest';
import { validateRuntimeEntry } from './runtime-manifest';

export type RuntimeResolution =
  | {
      status: 'ok';
      entry: RuntimeManifestEntry;
      /** Backend requested by the caller (or 'auto'). */
      requestedBackend: RuntimeBackend | 'auto';
      /** True when a non-CPU backend was requested but CPU had to be used. */
      usedFallback: boolean;
      /** Teacher-facing Vietnamese explanation when `usedFallback` is true. */
      fallbackReason?: string;
      /** Entries that matched platform/arch but were rejected, for diagnostics. */
      rejected: { id: string; reason: string }[];
    }
  | {
      status: 'unsupported';
      /** Short machine-readable code, useful for tests and logs. */
      code: 'platform' | 'arch' | 'no-runtime' | 'no-verified-runtime';
      /** Teacher-facing Vietnamese explanation. */
      reason: string;
      rejected: { id: string; reason: string }[];
    };

export interface ResolveRuntimeOptions {
  /** Preferred backend; 'auto' resolves to CPU (Vulkan measured slower). */
  backend?: RuntimeBackend | 'auto';
}

/**
 * Default backend when the caller says 'auto'.
 *
 * Measured, not assumed. On the pilot machine (Intel UHD iGPU, driver
 * 27.20.100.8729) the Vulkan build is SLOWER than the CPU build on the same
 * model and prompt, measured with each build's own binary:
 *
 *   backend | prefill tok/s | decode tok/s
 *   CPU     | 10.7 - 13.0   | 4.91 - 5.42
 *   Vulkan  | 0.40 - 0.75   | 2.76
 *
 * Vulkan lost by ~2x on decode and ~20x on prompt prefill, so 'auto' must not
 * pick it. See docs/BENCHMARKS.md for the procedure; an earlier run of that
 * same document reported near-parity (~7 tok/s for both) because it measured
 * the Vulkan binary twice and labelled one run "CPU".
 *
 * Vulkan stays available and is still selected when a caller asks for it
 * explicitly, which is how it can be re-evaluated on other hardware.
 */
export const DEFAULT_RUNTIME_BACKEND: RuntimeBackend = 'cpu';

/**
 * 'auto' resolved against the hardware, before any manifest lookup.
 *
 * Integrated GPUs did not win on prefill in measurement, so an Intel/AMD
 * adapter no longer switches 'auto' to Vulkan. This function remains the single
 * place to change that decision if a future build or driver measures a win.
 */
function preferredBackendFor(_hardware: HardwareProfile, requested: RuntimeBackend | 'auto'): RuntimeBackend {
  if (requested !== 'auto') return requested;
  return DEFAULT_RUNTIME_BACKEND;
}

export function resolveRuntime(
  hardware: HardwareProfile,
  manifest: RuntimeManifest,
  options: ResolveRuntimeOptions = {}
): RuntimeResolution {
  const rejected: { id: string; reason: string }[] = [];
  const requestedBackend = options.backend || 'auto';

  if (!hardware.supported) {
    return {
      status: 'unsupported',
      code: hardware.supportedArch === undefined ? 'arch' : 'platform',
      reason: hardware.unsupportedReason || 'Cấu hình máy này chưa được hỗ trợ.',
      rejected
    };
  }

  const buildArch = hardware.supportedArch as NonNullable<HardwareProfile['supportedArch']>;

  // Structural validation first: a malformed entry must never reach the
  // downloader, even if it matches platform and architecture.
  const structurallyValid: RuntimeManifestEntry[] = [];
  for (const entry of manifest.entries) {
    try {
      validateRuntimeEntry(entry);
      structurallyValid.push(entry);
    } catch (error) {
      rejected.push({ id: String(entry?.id || '(không rõ)'), reason: describeError(error) });
    }
  }

  const matching = structurallyValid.filter(entry => {
    if (entry.platform !== hardware.platform) {
      rejected.push({ id: entry.id, reason: `Không dành cho ${hardware.platform}.` });
      return false;
    }
    if (entry.arch !== buildArch) {
      rejected.push({ id: entry.id, reason: `Cần ${entry.arch}, máy chạy ${buildArch}.` });
      return false;
    }
    return true;
  });

  if (matching.length === 0) {
    return {
      status: 'unsupported',
      code: 'no-runtime',
      reason: `Không có bản AI local đã xác minh cho ${hardware.platform} ${buildArch}. ` +
        'Các trò chơi đã lưu vẫn mở được; chỉ phần tạo nội dung mới bằng AI local cần bản này.',
      rejected
    };
  }

  const verified = matching.filter(entry => entry.verified);
  if (verified.length === 0) {
    return {
      status: 'unsupported',
      code: 'no-verified-runtime',
      reason: 'Bản AI local cho cấu hình này chưa qua kiểm thử tương thích nên chưa được cài tự động.',
      rejected: matching.map(entry => ({ id: entry.id, reason: 'Chưa được xác minh (verified=false).' }))
    };
  }

  const wanted: RuntimeBackend = preferredBackendFor(hardware, requestedBackend);
  const exact = verified.find(entry => entry.backend === wanted);
  if (exact) {
    return { status: 'ok', entry: exact, requestedBackend, usedFallback: false, rejected };
  }

  const cpu = verified.find(entry => entry.backend === 'cpu');
  if (cpu) {
    return {
      status: 'ok',
      entry: cpu,
      requestedBackend,
      usedFallback: true,
      fallbackReason: wanted === 'vulkan'
        ? 'Chưa có bản GPU (Vulkan) đã xác minh cho máy này, nên dùng bản CPU. ' +
          'Kết quả vẫn đúng, chỉ chậm hơn khi phân tích tài liệu dài.'
        : `Chưa có bản ${wanted} đã xác minh cho máy này, nên dùng bản CPU.`,
      rejected
    };
  }

  // A non-CPU backend was requested, it is unavailable, and there is no CPU
  // fallback. Refusing beats installing something unexpected.
  return {
    status: 'unsupported',
    code: 'no-verified-runtime',
    reason: `Không có bản ${wanted} dùng được và cũng không có bản CPU dự phòng cho máy này.`,
    rejected
  };
}

function describeError(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}
