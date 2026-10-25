/**
 * First-run setup, §4 HardwareDetector (docs/archive/specs/update_AI_plan_5.txt).
 *
 * The app already knew RAM and CPU count (`os.totalmem()`, `os.cpus()`), which
 * is all the model recommendation needs. First-run setup needs two extra facts
 * before it may download anything:
 *
 *   - the real OS architecture, because it decides which runtime build is
 *     allowed to run. `process.arch` is the *Electron* build's architecture,
 *     which is what actually matters for a native binary; on ARM64 Windows an
 *     x64 Electron still runs x64, so we report the process architecture and
 *     keep the OS architecture beside it for diagnostics.
 *   - free disk space in the target directory, so "not enough space" is caught
 *     before a 2.4 GB download starts rather than half way through.
 *
 * Everything here is measured, never estimated. A failure to detect a value is
 * reported as `undefined` instead of guessing, so callers can distinguish
 * "unknown" from "known to be too small" and never treat unknown as supported.
 */
import os from 'node:os';
import { statfs } from 'node:fs/promises';

export type SupportedArch = 'x64' | 'arm64';

/**
 * Which GPU, if any, is known to be present. `unknown` means "could not be
 * measured", never "no GPU" — and unknown must not be treated as usable, the
 * same rule the rest of this file follows for RAM and disk.
 */
export type GpuVendor = 'intel' | 'amd' | 'nvidia' | 'unknown';

export interface HardwareProfile {
  platform: NodeJS.Platform;
  /** Architecture of the running build — decides binary compatibility. */
  processArch: string;
  /** Architecture of the OS itself. May differ from `processArch` (e.g. x64 build on ARM64 Windows). */
  osArch: string;
  /** One of the architectures a runtime build may target, or undefined when unsupported. */
  supportedArch: SupportedArch | undefined;
  totalRamBytes: number;
  freeRamBytes: number;
  logicalCpuCount: number;
  cpuModel: string;
  /**
   * GPU vendor measured from the display adapters, used to decide whether the
   * Vulkan build is worth offering. Optional so older callers keep compiling;
   * absent or `unknown` both mean "not measured", and neither selects Vulkan.
   */
  gpuVendor?: GpuVendor;
  /** Raw adapter names, for diagnostics only. Empty when unmeasured. */
  gpuNames?: readonly string[];
  /** Free bytes in the target directory, or undefined when it cannot be measured. */
  diskFreeBytes: number | undefined;
  /** True when the platform/architecture pair can run a local runtime at all. */
  supported: boolean;
  /** Teacher-facing Vietnamese explanation, only set when `supported` is false. */
  unsupportedReason?: string;
}

export interface DetectHardwareDependencies {
  platform?: NodeJS.Platform;
  processArch?: string;
  osArch?: string;
  totalRamBytes?: number;
  freeRamBytes?: number;
  cpus?: { model: string }[];
  /** Free bytes remaining in `diskPath`. Throws or resolves undefined when unmeasurable. */
  getDiskFreeBytes?: (diskPath: string) => Promise<number | undefined>;
  /**
   * Display adapter names, e.g. from `Win32_VideoController`. Throws or
   * resolves undefined when unmeasurable, which yields `gpuVendor: 'unknown'`.
   */
  getGpuNames?: () => Promise<string[] | undefined>;
}

export const SUPPORTED_PLATFORM: NodeJS.Platform = 'win32';
export const SUPPORTED_ARCHES: readonly SupportedArch[] = ['x64', 'arm64'];

/**
 * Measured free bytes in `directory`. Same `statfs` + `bigint` approach the
 * model installer already uses for its own pre-check, so the number the wizard
 * shows and the number that gates the download cannot disagree. Returns
 * undefined when the directory does not exist yet or cannot be read: "unknown"
 * must never be reported as "plenty".
 */
export async function diskFreeBytes(directory: string): Promise<number | undefined> {
  try {
    const info = await statfs(directory, { bigint: true });
    const free = info.bavail * info.bsize;
    // Guard against a nonsense reading on exotic filesystems.
    return free >= 0n ? Number(free) : undefined;
  } catch {
    return undefined;
  }
}

/** Normalises the many ways Node spells the same architecture. */
export function normalizeArch(value: string | undefined): SupportedArch | undefined {
  const arch = String(value || '').trim().toLowerCase();
  if (arch === 'x64' || arch === 'x86_64' || arch === 'amd64') return 'x64';
  if (arch === 'arm64' || arch === 'aarch64') return 'arm64';
  return undefined;
}

/**
 * Picks the architecture a runtime build must target. The process
 * architecture wins: a native executable is loaded into this process's address
 * space, so an x64 build on ARM64 Windows must use the x64 runtime (Windows
 * runs it under emulation), never the arm64 one.
 */
export function resolveBuildArch(processArch: string | undefined, osArch: string | undefined): SupportedArch | undefined {
  const fromProcess = normalizeArch(processArch);
  if (fromProcess) return fromProcess;
  return normalizeArch(osArch);
}

export async function detectHardware(
  diskPath: string,
  dependencies: DetectHardwareDependencies = {}
): Promise<HardwareProfile> {
  const platform = dependencies.platform ?? process.platform;
  const processArch = dependencies.processArch ?? process.arch;
  const osArch = dependencies.osArch ?? process.arch;
  const totalRamBytes = dependencies.totalRamBytes ?? safeTotalRam();
  const freeRamBytes = dependencies.freeRamBytes ?? safeFreeRam();
  const cpus = dependencies.cpus ?? safeCpus();
  const logicalCpuCount = Math.max(1, cpus.length);
  const cpuModel = cpus.find(cpu => cpu && cpu.model)?.model || 'Không nhận diện được tên CPU';
  const supportedArch = resolveBuildArch(processArch, osArch);

  let diskFreeBytes: number | undefined;
  if (dependencies.getDiskFreeBytes) {
    try {
      diskFreeBytes = await dependencies.getDiskFreeBytes(diskPath);
    } catch {
      diskFreeBytes = undefined;
    }
  }

  const unsupportedReason = platform !== SUPPORTED_PLATFORM
    ? 'AI local hiện chỉ hỗ trợ Windows. Trên hệ điều hành khác, các trò chơi đã lưu vẫn mở được nhưng không tạo nội dung mới bằng AI local.'
    : supportedArch ? undefined
    : `Kiến trúc máy (${processArch}) chưa có bản AI local đã xác minh. Cần Windows x64 hoặc ARM64. ` +
      'Các trò chơi đã lưu vẫn mở được; chỉ phần tạo nội dung mới bằng AI local cần bản này.';

  const gpuNames = await safeGpuNames(dependencies);

  return {
    platform,
    processArch,
    osArch,
    supportedArch,
    totalRamBytes,
    freeRamBytes,
    logicalCpuCount,
    cpuModel,
    diskFreeBytes,
    supported: platform === SUPPORTED_PLATFORM && supportedArch !== undefined,
    gpuVendor: classifyGpuVendor(gpuNames),
    gpuNames: gpuNames || [],
    ...(unsupportedReason ? { unsupportedReason } : {})
  };
}

async function safeGpuNames(dependencies: DetectHardwareDependencies): Promise<string[] | undefined> {
  if (!dependencies.getGpuNames) return undefined;
  try {
    const names = await dependencies.getGpuNames();
    if (!Array.isArray(names)) return undefined;
    return names.filter(name => typeof name === 'string' && name.trim()).map(name => name.trim());
  } catch {
    return undefined;
  }
}

/**
 * Maps adapter names to a vendor that Vulkan offload is known to work on.
 *
 * Virtual display adapters (Parsec, RDP, Spacedesk…) are skipped: they report a
 * name but cannot run compute, so a machine with only virtual adapters plus an
 * Intel iGPU must still resolve to Intel. NVIDIA is classified but never
 * auto-selected — the CUDA build is not shipped in this release.
 */
export function classifyGpuVendor(names: readonly string[] | undefined): GpuVendor {
  if (!names || names.length === 0) return 'unknown';
  const real = names.filter(name => !VIRTUAL_ADAPTER_PATTERN.test(name));
  const candidates = real.length ? real : names;
  const joined = candidates.join(' ').toLowerCase();
  if (/\b(intel|iris|uhd graphics|hd graphics)\b/.test(joined)) return 'intel';
  if (/\b(nvidia|geforce|quadro|rtx)\b/.test(joined)) return 'nvidia';
  if (/\b(amd|radeon|advanced micro devices)\b/.test(joined)) return 'amd';
  return 'unknown';
}

const VIRTUAL_ADAPTER_PATTERN =
  /parsec|virtual|remote|basic display|spacedesk|citrix|vmware|hyper-v|microsoft basic/i;

function safeTotalRam(): number {
  try {
    const value = os.totalmem();
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function safeFreeRam(): number {
  try {
    const value = os.freemem();
    return Number.isFinite(value) && value >= 0 ? value : 0;
  } catch {
    return 0;
  }
}

function safeCpus(): { model: string }[] {
  try {
    return os.cpus() || [];
  } catch {
    return [];
  }
}
