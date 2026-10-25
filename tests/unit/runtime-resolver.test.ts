import assert from 'node:assert/strict';
import type { HardwareProfile } from '../../src/ai-core/hardware-detector';
import { CPU_X64_RUNTIME, RUNTIME_MANIFEST, VULKAN_X64_RUNTIME, type RuntimeManifest, type RuntimeManifestEntry } from '../../src/ai-core/runtime-manifest';
import { DEFAULT_RUNTIME_BACKEND, resolveRuntime } from '../../src/ai-core/runtime-resolver';

const machine = (patch: Partial<HardwareProfile> = {}): HardwareProfile => ({
  platform: 'win32',
  processArch: 'x64',
  osArch: 'x64',
  supportedArch: 'x64',
  totalRamBytes: 16 * 1024 ** 3,
  freeRamBytes: 8 * 1024 ** 3,
  logicalCpuCount: 8,
  cpuModel: 'Intel i3-10105F',
  diskFreeBytes: 100 * 1024 ** 3,
  supported: true,
  // Default fixture is a machine with no measured GPU. Individual tests opt
  // into a vendor explicitly, so the default stays the conservative case.
  gpuVendor: 'unknown',
  ...patch
});

const entry = (patch: Partial<RuntimeManifestEntry> = {}): RuntimeManifestEntry => ({ ...CPU_X64_RUNTIME, ...patch });
const manifest = (entries: RuntimeManifestEntry[]): RuntimeManifest =>
  ({ schemaVersion: 1, releaseVersion: 'test', entries });

const ok = (result: ReturnType<typeof resolveRuntime>) => {
  assert.equal(result.status, 'ok');
  return result as Extract<ReturnType<typeof resolveRuntime>, { status: 'ok' }>;
};
const unsupported = (result: ReturnType<typeof resolveRuntime>) => {
  assert.equal(result.status, 'unsupported');
  return result as Extract<ReturnType<typeof resolveRuntime>, { status: 'unsupported' }>;
};

// CPU is still the recorded default and the floor every machine falls back to.
assert.equal(DEFAULT_RUNTIME_BACKEND, 'cpu');

// --- Happy path -----------------------------------------------------------
const happy = ok(resolveRuntime(machine(), RUNTIME_MANIFEST));
assert.equal(happy.entry.id, CPU_X64_RUNTIME.id);
assert.equal(happy.entry.backend, 'cpu');
assert.equal(happy.usedFallback, false);
assert.equal(happy.requestedBackend, 'auto');
assert.deepEqual(happy.rejected, []);
// The resolver returns the manifest entry itself; it never fabricates a URL.
assert.equal(happy.entry.sha256, CPU_X64_RUNTIME.sha256);

// Explicitly asking for cpu must also succeed without a fallback notice.
assert.equal(ok(resolveRuntime(machine(), RUNTIME_MANIFEST, { backend: 'cpu' })).usedFallback, false);

// --- Unsupported hardware -------------------------------------------------
const mac = unsupported(resolveRuntime(machine({ platform: 'darwin', supported: false, supportedArch: 'arm64', unsupportedReason: 'Chỉ hỗ trợ Windows.' }), RUNTIME_MANIFEST));
assert.equal(mac.code, 'platform');
assert.match(mac.reason, /Windows/);

const noArch = unsupported(resolveRuntime(machine({ processArch: 'ia32', supportedArch: undefined, supported: false, unsupportedReason: 'Kiến trúc chưa hỗ trợ.' }), RUNTIME_MANIFEST));
assert.equal(noArch.code, 'arch');

// --- Architecture matching ------------------------------------------------
// An ARM64 build must not be offered the x64-only manifest.
const arm = unsupported(resolveRuntime(machine({ processArch: 'arm64', osArch: 'arm64', supportedArch: 'arm64' }), RUNTIME_MANIFEST));
assert.equal(arm.code, 'no-runtime');
assert.match(arm.reason, /win32 arm64/);
assert.match(arm.reason, /trò chơi đã lưu/, 'an unsupported runtime must not scare the teacher about saved games');
// Every matching x64 build is reported as rejected, so a diagnostics screen can
// explain why. Names only the reason, not a fixed list length.
assert.equal(arm.rejected.length, RUNTIME_MANIFEST.entries.length);
for (const rejected of arm.rejected) assert.equal(rejected.reason, 'Cần x64, máy chạy arm64.');

// x64 process on ARM64 Windows is emulated, so the x64 build is correct.
assert.equal(ok(resolveRuntime(machine({ processArch: 'x64', osArch: 'arm64', supportedArch: 'x64' }), RUNTIME_MANIFEST)).entry.arch, 'x64');

// Wrong platform on an otherwise matching entry.
const wrongPlatform = unsupported(resolveRuntime(machine(), manifest([entry({ platform: 'linux' })])));
assert.equal(wrongPlatform.code, 'no-runtime');
assert.deepEqual(wrongPlatform.rejected, [{ id: CPU_X64_RUNTIME.id, reason: 'Không dành cho win32.' }]);


// --- Verification gate ----------------------------------------------------
// An unverified build must never be installed automatically.
const unverified = unsupported(resolveRuntime(machine(), manifest([entry({ verified: false })])));
assert.equal(unverified.code, 'no-verified-runtime');
assert.match(unverified.reason, /chưa qua kiểm thử/);

// A verified entry still wins when an unverified one also matches.
assert.equal(
  ok(resolveRuntime(machine(), manifest([entry({ id: 'unverified-one', verified: false }), CPU_X64_RUNTIME]))).entry.id,
  CPU_X64_RUNTIME.id
);

// --- Structural validation before download --------------------------------
// A malformed entry must be rejected by the resolver, not by the downloader.
const badChecksum = unsupported(resolveRuntime(machine(), manifest([entry({ sha256: 'deadbeef' })])));
assert.equal(badChecksum.code, 'no-runtime');
assert.equal(badChecksum.rejected.length, 1);
assert.match(badChecksum.rejected[0].reason, /SHA-256/);

// --- Backend selection and fallback --------------------------------------
// Requesting OpenVINO today must fall back to the verified CPU build *and say so*.
const openvinoFallback = ok(resolveRuntime(machine(), RUNTIME_MANIFEST, { backend: 'openvino' }));
assert.equal(openvinoFallback.entry.backend, 'cpu');
assert.equal(openvinoFallback.usedFallback, true);
assert.equal(openvinoFallback.requestedBackend, 'openvino');
assert.match(String(openvinoFallback.fallbackReason), /openvino/);
assert.match(String(openvinoFallback.fallbackReason), /CPU/);

// Once a verified OpenVINO entry exists the resolver prefers it, proving the
// manifest is the only thing that needs to change to enable a backend.
const withOpenvino = manifest([
  CPU_X64_RUNTIME,
  entry({ id: 'llama.cpp-openvino-win32-x64', backend: 'openvino', downloadUrl: 'https://example.com/ov.zip' })
]);
const ov = ok(resolveRuntime(machine(), withOpenvino, { backend: 'openvino' }));
assert.equal(ov.entry.backend, 'openvino');
assert.equal(ov.usedFallback, false);
// ...but 'auto' does not pick OpenVINO: it is unmeasured, so 'auto' stays on the
// CPU default rather than silently switching backends.
assert.equal(ok(resolveRuntime(machine(), withOpenvino)).entry.backend, 'cpu');

// An unverified OpenVINO entry must not be selected even when requested.
const unverifiedOv = ok(resolveRuntime(machine(), manifest([
  CPU_X64_RUNTIME,
  entry({ id: 'ov-unverified', backend: 'openvino', verified: false, downloadUrl: 'https://example.com/ov.zip' })
]), { backend: 'openvino' }));
assert.equal(unverifiedOv.entry.backend, 'cpu');
assert.equal(unverifiedOv.usedFallback, true);

// Requesting a backend that does not exist, with only an OpenVINO entry
// available (verified), still succeeds — proving selection is driven purely by
// the manifest.
const ovOnly = ok(resolveRuntime(machine(), manifest([
  entry({ id: 'ov-only', backend: 'openvino', downloadUrl: 'https://example.com/ov.zip' })
]), { backend: 'openvino' }));
assert.equal(ovOnly.entry.id, 'ov-only');
assert.equal(ovOnly.usedFallback, false);

// Non-CPU requested, and the only matching entry is unverified: refuse rather
// than install something unexpected. This is the real "no fallback" case.
const noUsable = unsupported(resolveRuntime(machine(), manifest([
  entry({ id: 'ov-unverified-only', backend: 'openvino', verified: false, downloadUrl: 'https://example.com/ov.zip' })
])));
assert.equal(noUsable.code, 'no-verified-runtime');

// Requesting a backend that no entry offers at all, when a different verified
// backend exists, is still fine (CPU), and says so.
assert.equal(ok(resolveRuntime(machine(), RUNTIME_MANIFEST, { backend: 'openvino' })).usedFallback, true);

// --- Vulkan (GPU) selection ----------------------------------------------
// MEASURED NEGATIVE RESULT: on the pilot Intel UHD iGPU the Vulkan build was
// slower than the CPU build measured binary-vs-binary — 2.76 vs 4.91-5.42
// tok/s decode, 0.40-0.75 vs 10.7-13.0 tok/s prefill, see docs/BENCHMARKS.md.
// So 'auto' must stay on CPU even when a usable GPU is present — that is the
// whole point of the default, and these assertions guard it against silent
// reversal.
for (const gpuVendor of ['intel', 'amd', 'nvidia', 'unknown', undefined] as const) {
  const auto = ok(resolveRuntime(machine({ gpuVendor }), RUNTIME_MANIFEST));
  assert.equal(auto.entry.backend, 'cpu', `${String(gpuVendor)} must keep 'auto' on CPU`);
  assert.equal(auto.usedFallback, false, 'an expected CPU choice is not a fallback');
  assert.equal(auto.requestedBackend, 'auto');
}
// With the shipped manifest, even an explicit Vulkan request resolves to the
// real GPU entry (proving the backend is reachable, just not automatic).
const explicitGpu = ok(resolveRuntime(machine({ gpuVendor: 'intel' }), RUNTIME_MANIFEST, { backend: 'vulkan' }));
assert.equal(explicitGpu.entry.backend, 'vulkan');
assert.equal(explicitGpu.entry.id, VULKAN_X64_RUNTIME.id);
assert.equal(explicitGpu.usedFallback, false);
assert.equal(explicitGpu.entry.sha256, VULKAN_X64_RUNTIME.sha256);

// Explicit requests are honoured regardless of the detected vendor: the caller
// may be benchmarking, or may know about a GPU the detector could not read.
for (const gpuVendor of ['intel', 'amd', 'nvidia', 'unknown', undefined] as const) {
  assert.equal(
    ok(resolveRuntime(machine({ gpuVendor }), RUNTIME_MANIFEST, { backend: 'vulkan' })).entry.backend,
    'vulkan',
    `explicit vulkan must be honoured on ${String(gpuVendor)}`
  );
}

// Asking for CPU explicitly must win on an Intel GPU too, so a support script
// can always force the known-good path.
assert.equal(ok(resolveRuntime(machine({ gpuVendor: 'intel' }), RUNTIME_MANIFEST, { backend: 'cpu' })).entry.backend, 'cpu');

// Vulkan requested but the entry is unverified: fall back to CPU and say so,
// with a message a teacher can act on.
const unverifiedGpu = ok(resolveRuntime(
  machine({ gpuVendor: 'intel' }),
  manifest([CPU_X64_RUNTIME, entry({ ...VULKAN_X64_RUNTIME, verified: false })]),
  { backend: 'vulkan' }
));
assert.equal(unverifiedGpu.entry.backend, 'cpu');
assert.equal(unverifiedGpu.usedFallback, true);
assert.match(String(unverifiedGpu.fallbackReason), /CPU/);
assert.match(String(unverifiedGpu.fallbackReason), /GPU/);
assert.match(String(unverifiedGpu.fallbackReason), /chậm hơn/, 'the teacher must know the cost is speed, not correctness');

// Vulkan requested but no Vulkan entry exists at all: same story, not a refusal.
const noGpuBuild = ok(resolveRuntime(machine({ gpuVendor: 'intel' }), manifest([CPU_X64_RUNTIME]), { backend: 'vulkan' }));
assert.equal(noGpuBuild.entry.backend, 'cpu');
assert.equal(noGpuBuild.usedFallback, true);

// The Vulkan build as the only verified entry is still a valid answer for an
// explicit request — selection is driven by the manifest, not hard-coded ids.
const gpuOnly = ok(resolveRuntime(machine({ gpuVendor: 'intel' }), manifest([VULKAN_X64_RUNTIME]), { backend: 'vulkan' }));
assert.equal(gpuOnly.entry.id, VULKAN_X64_RUNTIME.id);

// A malformed Vulkan entry is rejected before download, and CPU still runs.
const badVulkan = ok(resolveRuntime(
  machine({ gpuVendor: 'intel' }),
  manifest([CPU_X64_RUNTIME, entry({ ...VULKAN_X64_RUNTIME, sha256: 'not-a-digest' })]),
  { backend: 'vulkan' }
));
assert.equal(badVulkan.entry.backend, 'cpu');
assert.equal(badVulkan.usedFallback, true);
assert.ok(badVulkan.rejected.some(item => /SHA-256/.test(item.reason)), 'the bad Vulkan digest must be reported');

// GPU hardware on an unsupported platform must still be refused by platform.
assert.equal(
  unsupported(resolveRuntime(machine({ platform: 'darwin', supported: false, gpuVendor: 'intel' }), RUNTIME_MANIFEST)).code,
  'platform'
);

// Selection must not mutate the manifest.
const beforeGpu = JSON.stringify(RUNTIME_MANIFEST);
resolveRuntime(machine({ gpuVendor: 'intel' }), RUNTIME_MANIFEST, { backend: 'vulkan' });
assert.equal(JSON.stringify(RUNTIME_MANIFEST), beforeGpu, 'GPU selection must be side-effect free');

// --- Robustness -----------------------------------------------------------
// An empty manifest is unsupported, not a crash.
assert.equal(unsupported(resolveRuntime(machine(), manifest([]))).code, 'no-runtime');

// The resolver must never mutate the manifest it was given.
const before = JSON.stringify(RUNTIME_MANIFEST);
resolveRuntime(machine(), RUNTIME_MANIFEST, { backend: 'openvino' });
assert.equal(JSON.stringify(RUNTIME_MANIFEST), before, 'resolveRuntime must be side-effect free');

console.log('runtime-resolver.test.ts passed');
