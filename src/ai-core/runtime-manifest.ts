/**
 * First-run setup, §4 RuntimeResolver / §13.3 runtime manifest
 * (docs/archive/specs/update_AI_plan_5.txt).
 *
 * Until now the llama.cpp build was a single hardcoded constant
 * (`LLAMA_CPP_RUNTIME`), which is enough when there is only one possible
 * runtime but gives a resolver nothing to choose between. This module turns
 * that constant into a *versioned, listable manifest* with the dimensions a
 * resolver needs (platform, arch, backend), while keeping the verified
 * constant as the single source of truth for URL/size/SHA-256.
 *
 * Rules taken from the spec:
 *   - Only verified artifacts may appear. Every entry here reuses the URL,
 *     byte size and SHA-256 that were already verified and are already covered
 *     by `runtime-installer` tests. Nothing is invented.
 *   - `backend` exists so a GPU build can be added as data, without touching
 *     the resolver. One OpenVINO entry is *not* shipped: §12 forbids claiming it
 *     is faster without measurement, and there is no measured or verified
 *     OpenVINO artifact in this repository. Vulkan *is* shipped because the CPU
 *     prefill limit was measured (docs/BENCHMARKS.md O6b) and the iGPU path was
 *     confirmed on the pilot hardware.
 *   - Adding a new runtime = adding an object here plus its test, never
 *     constructing a URL from the hardware profile.
 */
import type { SupportedArch } from './hardware-detector';
import { LLAMA_CPP_RUNTIME, LLAMA_CPP_VULKAN_RUNTIME } from './model-catalog';
import type { RuntimeArtifact } from './runtime-installer';

/**
 * `vulkan` runs the same llama.cpp release with GPU offload through Vulkan,
 * which covers Intel/AMD integrated GPUs (they share system RAM, so no VRAM
 * requirement). `openvino` remains declarable but no entry ships for it.
 */
export type RuntimeBackend = 'cpu' | 'vulkan' | 'openvino';

export interface RuntimeManifestEntry extends RuntimeArtifact {
  /** Stable identifier, also used for the install directory name. */
  id: string;
  backend: RuntimeBackend;
  platform: NodeJS.Platform;
  arch: SupportedArch;
  /** Human-facing label shown in the setup wizard. */
  displayName: string;
  /**
   * True only once the build has passed compatibility tests on this project's
   * hardware set. The resolver refuses to auto-select an unverified entry.
   */
  verified: boolean;
  /** Teacher-facing note, e.g. why a backend is not offered. */
  note?: string;
}

export interface RuntimeManifest {
  /** Manifest format version — bumped when the schema itself changes. */
  schemaVersion: 1;
  /** llama.cpp release series shared by the entries. */
  releaseVersion: string;
  entries: readonly RuntimeManifestEntry[];
}

/**
 * The verified Windows x64 CPU build. Values come from `LLAMA_CPP_RUNTIME`
 * rather than being repeated, so the manifest and the installer can never drift
 * apart.
 */
export const CPU_X64_RUNTIME: RuntimeManifestEntry = {
  id: `llama.cpp-${LLAMA_CPP_RUNTIME.version}-cpu-win32-x64`,
  backend: 'cpu',
  platform: 'win32',
  arch: 'x64',
  displayName: 'llama.cpp CPU (Windows x64)',
  verified: true,
  ...LLAMA_CPP_RUNTIME
};

/**
 * The Vulkan build of the same release.
 *
 * `verified: true` means the artifact downloads, checksums and *runs* on the
 * pilot Intel UHD machine — all layers confirmed on `Vulkan0`. It does NOT mean
 * it is faster: measured prefill was slightly slower than CPU on that hardware
 * (docs/BENCHMARKS.md), so the resolver does not auto-select it. It is reachable
 * by asking for `backend: 'vulkan'` explicitly.
 */
export const VULKAN_X64_RUNTIME: RuntimeManifestEntry = {
  id: `llama.cpp-${LLAMA_CPP_VULKAN_RUNTIME.version}-vulkan-win32-x64`,
  backend: 'vulkan',
  platform: 'win32',
  arch: 'x64',
  displayName: 'llama.cpp Vulkan (Windows x64)',
  verified: true,
  ...LLAMA_CPP_VULKAN_RUNTIME
};

export const RUNTIME_MANIFEST: RuntimeManifest = {
  schemaVersion: 1,
  releaseVersion: LLAMA_CPP_RUNTIME.version,
  entries: [CPU_X64_RUNTIME, VULKAN_X64_RUNTIME]
};

/** Returns the entry with `id`, or undefined. Never throws on unknown input. */
export function findRuntimeEntry(
  id: string,
  manifest: RuntimeManifest = RUNTIME_MANIFEST
): RuntimeManifestEntry | undefined {
  return manifest.entries.find(entry => entry.id === id);
}

/**
 * Decides which backend an *already extracted* runtime directory belongs to.
 *
 * This exists because the runtime directory path is identical for every
 * backend (`runtime/llama.cpp-<version>`), so "the executable exists" says
 * nothing about which build it is. Without this check a teacher who switched
 * to Vulkan kept running the CPU build while `--n-gpu-layers 99` was passed to
 * a binary that has no GPU code in it — the GPU setting appeared to be applied
 * and nothing was offloaded.
 *
 * The llama.cpp archives are self-describing: only the Vulkan build ships
 * `ggml-vulkan.dll`, and only the CPU build ships `ggml-cpu-*.dll`. An unknown
 * layout returns `undefined` so the caller can reinstall rather than guess.
 */
export function detectInstalledBackend(fileNames: readonly string[]): RuntimeBackend | undefined {
  const lower = fileNames.map(name => String(name).toLowerCase());
  // Vulkan wins the check order: a directory holding both cannot be produced by
  // either archive, and treating it as Vulkan is the answer that preserves the
  // teacher's choice instead of silently demoting it.
  if (lower.some(name => name.startsWith('ggml-vulkan'))) return 'vulkan';
  if (lower.some(name => /^ggml-cpu[-.]/.test(name) || name === 'ggml-cpu.dll')) return 'cpu';
  return undefined;
}

/**
 * Structural check used by tests and by the resolver before an entry is
 * allowed to be downloaded. Mirrors the invariants the installer relies on
 * (absolute HTTPS source, exact byte size, 64-hex SHA-256).
 */
export function validateRuntimeEntry(entry: RuntimeManifestEntry): void {
  if (!entry.id.trim()) throw new Error('Mục runtime thiếu mã định danh.');
  if (entry.backend !== 'cpu' && entry.backend !== 'vulkan' && entry.backend !== 'openvino') {
    throw new Error(`Backend runtime không hợp lệ: ${String(entry.backend)}.`);
  }
  if (entry.arch !== 'x64' && entry.arch !== 'arm64') {
    throw new Error(`Kiến trúc runtime không hợp lệ: ${String(entry.arch)}.`);
  }
  if (!Number.isSafeInteger(entry.sizeBytes) || entry.sizeBytes <= 0) {
    throw new Error('Mục runtime phải khai báo kích thước byte chính xác.');
  }
  if (!/^[0-9a-f]{64}$/i.test(entry.sha256)) throw new Error('Mục runtime phải khai báo SHA-256 hợp lệ.');
  for (const [label, value] of [['URL tải', entry.downloadUrl], ['URL nguồn', entry.sourceUrl]] as const) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new Error(`Mục runtime có ${label} không hợp lệ.`);
    }
    if (url.protocol !== 'https:') throw new Error(`Mục runtime phải dùng HTTPS cho ${label}.`);
    if (url.username || url.password || url.hash) {
      throw new Error(`Mục runtime có ${label} chứa thông tin không được phép.`);
    }
  }
  if (!entry.displayName.trim()) throw new Error('Mục runtime thiếu tên hiển thị.');
}
