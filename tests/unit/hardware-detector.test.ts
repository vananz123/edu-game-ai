import assert from 'node:assert/strict';
import { classifyGpuVendor, detectHardware, diskFreeBytes, normalizeArch, resolveBuildArch } from '../../src/ai-core/hardware-detector';

// Architecture normalisation: Node reports the same architecture under several
// spellings depending on the toolchain, and an unrecognised value must never be
// silently treated as supported.
assert.equal(normalizeArch('x64'), 'x64');
assert.equal(normalizeArch('AMD64'), 'x64');
assert.equal(normalizeArch('x86_64'), 'x64');
assert.equal(normalizeArch('arm64'), 'arm64');
assert.equal(normalizeArch('aarch64'), 'arm64');
assert.equal(normalizeArch(' ia32 '), undefined, '32-bit x86 has no verified runtime');
assert.equal(normalizeArch('mips'), undefined);
assert.equal(normalizeArch(''), undefined);
assert.equal(normalizeArch(undefined), undefined);

// The process architecture wins over the OS architecture. An x64 Electron build
// on ARM64 Windows must install the x64 runtime (Windows emulates it), not the
// arm64 one, because llama-server is loaded into the x64 process.
assert.equal(resolveBuildArch('x64', 'arm64'), 'x64');
assert.equal(resolveBuildArch('arm64', 'x64'), 'arm64');
assert.equal(resolveBuildArch('x64', 'x64'), 'x64');
assert.equal(resolveBuildArch('ia32', 'x64'), 'x64', 'falls back to the OS arch when the process arch is unsupported');
assert.equal(resolveBuildArch('mips', 'sparc'), undefined);

const winX64 = {
  platform: 'win32' as NodeJS.Platform,
  processArch: 'x64',
  osArch: 'x64',
  totalRamBytes: 16 * 1024 ** 3,
  freeRamBytes: 8 * 1024 ** 3,
  cpus: [{ model: 'Intel(R) Core(TM) i3-10105F CPU @ 3.70GHz' }]
};

// --- GPU vendor classification -------------------------------------------
// The pilot machine is exactly this: an Intel UHD iGPU alongside a virtual
// display adapter. The virtual adapter must not prevent the iGPU being found.
assert.equal(
  classifyGpuVendor(['Intel(R) UHD Graphics', 'Parsec Virtual Display Adapter']),
  'intel',
  'a virtual adapter must not hide the real iGPU'
);
assert.equal(classifyGpuVendor(['Intel(R) UHD Graphics']), 'intel');
assert.equal(classifyGpuVendor(['Intel(R) UHD Graphics 630']), 'intel');
assert.equal(classifyGpuVendor(['Intel(R) Iris(R) Xe Graphics']), 'intel');
assert.equal(classifyGpuVendor(['AMD Radeon(TM) Graphics']), 'amd');
assert.equal(classifyGpuVendor(['AMD Radeon RX 6600']), 'amd');
assert.equal(classifyGpuVendor(['NVIDIA GeForce RTX 3050']), 'nvidia');
// Mirrored / basic display drivers alone tell us nothing usable.
assert.equal(classifyGpuVendor(['Microsoft Basic Display Adapter']), 'unknown');
assert.equal(classifyGpuVendor(['Parsec Virtual Display Adapter']), 'unknown');
// Unmeasured is 'unknown', never a guess — and never 'intel' by accident.
assert.equal(classifyGpuVendor([]), 'unknown');
assert.equal(classifyGpuVendor(undefined), 'unknown');
assert.equal(classifyGpuVendor(['Some Unlabelled Device']), 'unknown');

async function run(): Promise<void> {
const profile = await detectHardware('C:\\fake\\path', {
  ...winX64,
  getDiskFreeBytes: async () => 120 * 1024 ** 3
});
assert.equal(profile.supported, true, 'Windows x64 is supported');
assert.equal(profile.supportedArch, 'x64');
assert.equal(profile.logicalCpuCount, 1);
assert.equal(profile.cpuModel, 'Intel(R) Core(TM) i3-10105F CPU @ 3.70GHz');
assert.equal(profile.diskFreeBytes, 120 * 1024 ** 3);
assert.equal(profile.unsupportedReason, undefined, 'a supported machine has no excuse message');

// Unsupported platform: reported, never thrown. Saved games must still open.
const macProfile = await detectHardware('/Users/x', { ...winX64, platform: 'darwin', osArch: 'arm64', processArch: 'arm64' });
assert.equal(macProfile.supported, false);
assert.equal(macProfile.supportedArch, 'arm64', 'arm64 is a known architecture even off Windows');
assert.match(String(macProfile.unsupportedReason), /Windows/);
assert.match(String(macProfile.unsupportedReason), /trò chơi đã lưu/, 'must reassure that saved games still play');

// Unsupported architecture on Windows.
const ia32Profile = await detectHardware('C:\\x', { ...winX64, processArch: 'ia32', osArch: 'ia32' });
assert.equal(ia32Profile.supported, false);
assert.equal(ia32Profile.supportedArch, undefined);
assert.match(String(ia32Profile.unsupportedReason), /ia32/);

// A disk probe that fails must not abort detection: unknown disk space is
// reported as undefined so callers can decide (they must not assume "plenty").
const failingDisk = await detectHardware('C:\\x', {
  ...winX64,
  getDiskFreeBytes: async () => { throw new Error('statfs failed'); }
});
assert.equal(failingDisk.diskFreeBytes, undefined);
assert.equal(failingDisk.supported, true);

// GPU names are threaded through the same dependency-injection seam, and a
// probe that fails or returns nothing must degrade to 'unknown' rather than
// claiming a GPU (which would turn on Vulkan on a machine we know nothing about).
const withGpu = await detectHardware('C:\\x', {
  ...winX64,
  getGpuNames: async () => ['Intel(R) UHD Graphics', 'Parsec Virtual Display Adapter']
});
assert.equal(withGpu.gpuVendor, 'intel');
assert.deepEqual(withGpu.gpuNames, ['Intel(R) UHD Graphics', 'Parsec Virtual Display Adapter']);

const failingGpu = await detectHardware('C:\\x', {
  ...winX64,
  getGpuNames: async () => { throw new Error('wmic failed'); }
});
assert.equal(failingGpu.gpuVendor, 'unknown', 'an unreadable GPU list is unknown, never a GPU');
assert.deepEqual(failingGpu.gpuNames, []);

const emptyGpu = await detectHardware('C:\\x', { ...winX64, getGpuNames: async () => undefined });
assert.equal(emptyGpu.gpuVendor, 'unknown');

const noGpuProbe = await detectHardware('C:\\x', winX64);
assert.equal(noGpuProbe.gpuVendor, 'unknown', 'no probe means unknown');

// Garbage CPU data must not produce a zero thread count downstream.
const noCpu = await detectHardware('C:\\x', { ...winX64, cpus: [] });
assert.equal(noCpu.logicalCpuCount, 1, 'at least one logical CPU is always reported');
assert.equal(noCpu.cpuModel, 'Không nhận diện được tên CPU');

const noModel = await detectHardware('C:\\x', { ...winX64, cpus: [{ model: '' }, { model: 'AMD Ryzen 5' }] });
assert.equal(noModel.cpuModel, 'AMD Ryzen 5', 'skips CPUs with an empty model string');

// `diskFreeBytes` is a real measurement, so this is the one place the suite
// touches the filesystem: a temp directory must report a positive number, and
// a path that cannot be read must report "unknown" rather than zero or a guess.
{
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const real = await diskFreeBytes(tmpdir());
  assert.equal(typeof real, 'number', 'the temp directory must be measurable');
  assert.ok((real as number) > 0, 'free space on a real volume must be positive');

  assert.equal(await diskFreeBytes(join(tmpdir(), 'edugame-does-not-exist-9f3a', 'deeper')), undefined,
    'an unreadable path is unknown, never a number');

  const created = await mkdtemp(join(tmpdir(), 'edugame-disk-'));
  try {
    const measured = await diskFreeBytes(created);
    assert.ok(typeof measured === 'number' && measured > 0, 'a fresh directory must be measurable');
  } finally {
    await rm(created, { recursive: true, force: true });
  }
}

console.log('hardware-detector.test.ts passed');
}

void run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
