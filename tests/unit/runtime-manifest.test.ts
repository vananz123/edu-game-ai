import assert from 'node:assert/strict';
import { LLAMA_CPP_RUNTIME, LLAMA_CPP_VULKAN_RUNTIME } from '../../src/ai-core/model-catalog';
import {
  CPU_X64_RUNTIME,
  RUNTIME_MANIFEST,
  VULKAN_X64_RUNTIME,
  findRuntimeEntry,
  validateRuntimeEntry
} from '../../src/ai-core/runtime-manifest';

// The manifest must not duplicate verified values: it reuses LLAMA_CPP_RUNTIME,
// so a catalog bump can never leave the manifest pointing at a stale binary.
assert.equal(CPU_X64_RUNTIME.version, LLAMA_CPP_RUNTIME.version);
assert.equal(CPU_X64_RUNTIME.downloadUrl, LLAMA_CPP_RUNTIME.downloadUrl);
assert.equal(CPU_X64_RUNTIME.sizeBytes, LLAMA_CPP_RUNTIME.sizeBytes);
assert.equal(CPU_X64_RUNTIME.sha256, LLAMA_CPP_RUNTIME.sha256);
assert.equal(CPU_X64_RUNTIME.sourceUrl, LLAMA_CPP_RUNTIME.sourceUrl);

// Same rule for the Vulkan entry: one source of truth for URL/size/digest.
assert.equal(VULKAN_X64_RUNTIME.version, LLAMA_CPP_VULKAN_RUNTIME.version);
assert.equal(VULKAN_X64_RUNTIME.downloadUrl, LLAMA_CPP_VULKAN_RUNTIME.downloadUrl);
assert.equal(VULKAN_X64_RUNTIME.sizeBytes, LLAMA_CPP_VULKAN_RUNTIME.sizeBytes);
assert.equal(VULKAN_X64_RUNTIME.sha256, LLAMA_CPP_VULKAN_RUNTIME.sha256);
assert.equal(VULKAN_X64_RUNTIME.sourceUrl, LLAMA_CPP_VULKAN_RUNTIME.sourceUrl);

// Both entries must be the same llama.cpp build, or a user would end up with
// a GPU binary and a CPU binary from different releases.
assert.equal(VULKAN_X64_RUNTIME.version, CPU_X64_RUNTIME.version, 'CPU and Vulkan must share a release');
assert.equal(VULKAN_X64_RUNTIME.sourceUrl, CPU_X64_RUNTIME.sourceUrl);
// The Vulkan zip is a different artifact: it must not alias the CPU digest.
assert.notEqual(VULKAN_X64_RUNTIME.sha256, CPU_X64_RUNTIME.sha256, 'the two builds must have different digests');

assert.equal(RUNTIME_MANIFEST.schemaVersion, 1);
assert.equal(RUNTIME_MANIFEST.releaseVersion, LLAMA_CPP_RUNTIME.version);
assert.equal(RUNTIME_MANIFEST.entries.length, 2, 'the verified CPU and Vulkan x64 builds ship');

assert.equal(CPU_X64_RUNTIME.backend, 'cpu');
assert.equal(CPU_X64_RUNTIME.platform, 'win32');
assert.equal(CPU_X64_RUNTIME.arch, 'x64');
assert.equal(CPU_X64_RUNTIME.verified, true);

assert.equal(VULKAN_X64_RUNTIME.backend, 'vulkan');
assert.equal(VULKAN_X64_RUNTIME.platform, 'win32');
assert.equal(VULKAN_X64_RUNTIME.arch, 'x64');
assert.equal(VULKAN_X64_RUNTIME.verified, true, 'Vulkan may only ship verified: the resolver auto-selects verified entries');

// Every entry, whatever its backend, must satisfy the shared invariants, and
// its id must name its own backend (the id also names the install directory).
for (const entry of RUNTIME_MANIFEST.entries) {
  validateRuntimeEntry(entry);
  assert.match(entry.id, /^llama\.cpp-b\d+-(cpu|vulkan)-win32-x64$/);
  assert.ok(entry.id.includes(`-${entry.backend}-`), `${entry.id} must name its backend`);
  assert.match(entry.downloadUrl, /^https:\/\/github\.com\/ggml-org\/llama\.cpp\//);
  assert.equal(entry.sha256.length, 64);
}

// Ids are the installer's directory names, so they must be unique.
const ids = RUNTIME_MANIFEST.entries.map(entry => entry.id);
assert.equal(new Set(ids).size, ids.length, 'runtime ids must be unique');

// Lookup is by id and must be null-safe for unknown input.
assert.equal(findRuntimeEntry(CPU_X64_RUNTIME.id), CPU_X64_RUNTIME);
assert.equal(findRuntimeEntry(VULKAN_X64_RUNTIME.id), VULKAN_X64_RUNTIME);
assert.equal(findRuntimeEntry('không-tồn-tại'), undefined);
assert.equal(findRuntimeEntry(''), undefined);

// No OpenVINO entry may exist yet: §12 requires measured evidence first, and no
// verified OpenVINO artifact is in this repository.
assert.equal(
  RUNTIME_MANIFEST.entries.some(entry => entry.backend === 'openvino'),
  false,
  'OpenVINO must not ship before it is measured and verified'
);

const clone = (patch: Record<string, unknown>) =>
  ({ ...CPU_X64_RUNTIME, ...patch }) as typeof CPU_X64_RUNTIME;

// Validation must reject anything the downloader would not be able to verify.
assert.throws(() => validateRuntimeEntry(clone({ id: '' })), /mã định danh/);
// 'vulkan' is a supported backend now, so the rejection case uses one that the
// manifest schema does not define at all (CUDA is not shipped in this release).
assert.throws(() => validateRuntimeEntry(clone({ backend: 'rocm' })), /Backend/);
assert.throws(() => validateRuntimeEntry(clone({ backend: 'cuda' })), /Backend/);
// ...and the backends that are defined must be accepted.
for (const backend of ['cpu', 'vulkan', 'openvino'] as const) {
  assert.doesNotThrow(() => validateRuntimeEntry(clone({ backend })), `${backend} must validate`);
}
assert.throws(() => validateRuntimeEntry(clone({ arch: 'ia32' })), /Kiến trúc/);
assert.throws(() => validateRuntimeEntry(clone({ sizeBytes: 0 })), /kích thước/);
assert.throws(() => validateRuntimeEntry(clone({ sizeBytes: 1.5 })), /kích thước/);
assert.throws(() => validateRuntimeEntry(clone({ sha256: 'abc' })), /SHA-256/);
assert.throws(() => validateRuntimeEntry(clone({ downloadUrl: 'http://example.com/a.zip' })), /HTTPS/);
assert.throws(() => validateRuntimeEntry(clone({ downloadUrl: 'not a url' })), /không hợp lệ/);
assert.throws(() => validateRuntimeEntry(clone({ sourceUrl: 'ftp://example.com/a' })), /HTTPS/);
assert.throws(
  () => validateRuntimeEntry(clone({ downloadUrl: 'https://user:pass@example.com/a.zip' })),
  /không được phép/,
  'credentials in a URL must be refused'
);
assert.throws(() => validateRuntimeEntry(clone({ displayName: '' })), /tên hiển thị/);

console.log('runtime-manifest.test.ts passed');
