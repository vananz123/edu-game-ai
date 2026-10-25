import assert from 'node:assert/strict';
import {
  QWEN_LOCAL_MODELS,
  getLocalModel,
  getLocalModelRecommendation,
  recommendLocalModelId,
  resolveBackendAttempts
} from '../../src/ai-core/model-catalog';
import { validateManifest } from '../../src/ai-core/model-installer';

assert.equal(QWEN_LOCAL_MODELS.length, 3);
assert.deepEqual(QWEN_LOCAL_MODELS.map(model => model.displayName), [
  'Qwen3.5 2B · Q4_K_M',
  'Gemma 4 E2B · Q4_K_M',
  'Qwen3.5 4B · Q4_K_M'
]);
// The weakest model stays first: several call sites use `QWEN_LOCAL_MODELS[0]`
// as the last-resort default, so reordering the catalog silently changes what a
// machine with unknown hardware would download.
assert.equal(QWEN_LOCAL_MODELS[0].id, 'qwen3.5-2b-q4_k_m');
// Qwen2.5 7B was removed from the catalog on 2026-10-25. `getLocalModel` must
// keep rejecting it instead of quietly substituting another model.
assert.throws(() => getLocalModel('qwen2.5-7b-q4_k_m'), /không nằm trong danh mục/);
for (const model of QWEN_LOCAL_MODELS) {
  validateManifest(model);
  assert.match(model.downloadUrl, /huggingface\.co\/unsloth\/(Qwen|gemma)/);
  assert.match(model.downloadUrl, /-Q4_K_M\.gguf$/);
  assert.equal(model.licenseName, 'Apache-2.0');
  // Optional Vulkan is measured slower than CPU on an integrated GPU, so no
  // catalog entry may advertise GPU offload as the recommended path.
  assert.equal(model.hardware.gpu.supported, false);
  assert.equal(model.hardware.gpu.recommendedLayers, 0);
}
const twoB = QWEN_LOCAL_MODELS.find(model => model.id === 'qwen3.5-2b-q4_k_m');
assert.equal(twoB.sizeBytes, 1280835840);
assert.equal(twoB.sha256, 'aaf42c8b7c3cab2bf3d69c355048d4a0ee9973d48f16c731c0520ee914699223');
const fourB = QWEN_LOCAL_MODELS.find(model => model.id === 'qwen3.5-4b-q4_k_m');
assert.equal(fourB.sizeBytes, 2740937888);
assert.equal(fourB.sha256, '00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4');
// Gemma 4 E2B: pinned revision + Hub LFS metadata, not a local hash.
const gemma = QWEN_LOCAL_MODELS.find(model => model.id === 'gemma-4-e2b-it-q4_k_m');
assert.ok(gemma, 'the Gemma 4 E2B entry must exist');
assert.equal(gemma.version, '0314792d7f1f');
assert.match(gemma.downloadUrl, /0314792d7f1f7e229411f620751375812bb9faf2\/gemma-4-E2B-it-Q4_K_M\.gguf$/);
assert.equal(gemma.sizeBytes, 3106738272);
assert.equal(gemma.sha256, '740185b21d22ceb83a11c3aa62ad5842ef32c70f6096d756bbee85a1e4ec34b8');
assert.equal(gemma.licenseName, 'Apache-2.0');
// First-run setup must never decide to install Gemma by itself: it has not been
// measured on pilot hardware. A teacher can still pick it in Settings → Model.
const capableMachine = { totalRamBytes: 16 * 1024 ** 3, logicalCpuCount: 8 };
assert.equal(recommendLocalModelId(capableMachine), 'qwen3.5-4b-q4_k_m');
const hugeMachine = { totalRamBytes: 64 * 1024 ** 3, logicalCpuCount: 32 };
assert.equal(recommendLocalModelId(hugeMachine), 'qwen3.5-4b-q4_k_m', 'Gemma is never auto-installed');
const constrainedMachine = { totalRamBytes: 1 * 1024 ** 3, logicalCpuCount: 1 };
assert.equal(recommendLocalModelId(constrainedMachine), 'qwen3.5-2b-q4_k_m');
assert.equal(
  getLocalModelRecommendation(QWEN_LOCAL_MODELS[0], constrainedMachine).status,
  'not-recommended'
);
const midRangeMachine = { totalRamBytes: 8 * 1024 ** 3, logicalCpuCount: 6 };
assert.equal(recommendLocalModelId(midRangeMachine), 'qwen3.5-2b-q4_k_m');
// Mid-high machine: enough RAM/CPU for 4B. First-run setup must install 4B here,
// because it uses `recommendLocalModelId()` instead of pinning the catalog's
// first entry (2B) — the regression this test guards.
const fourBMachine = { totalRamBytes: 12 * 1024 ** 3, logicalCpuCount: 8 };
assert.equal(recommendLocalModelId(fourBMachine), 'qwen3.5-4b-q4_k_m');
assert.notEqual(
  recommendLocalModelId(capableMachine),
  QWEN_LOCAL_MODELS[0].id,
  'a strong machine must not be recommended the weakest catalog model'
);
// The recommendation is also shown for Gemma in Settings, so its hardware
// numbers must place it above the 4B tier: a 64 GB machine may run it.
assert.equal(getLocalModelRecommendation(gemma, hugeMachine).status, 'recommended');
assert.equal(getLocalModelRecommendation(gemma, midRangeMachine).status, 'possible');
assert.equal(
  getLocalModelRecommendation(QWEN_LOCAL_MODELS[0], midRangeMachine).status,
  'recommended'
);
assert.equal(
  getLocalModelRecommendation(fourB, midRangeMachine).status,
  'possible'
);

// --- backend fallback must never brick local AI -----------------------------
// The launch path used to throw when the installed runtime was not the backend
// it asked for, leaving a usable CPU build unused.
assert.deepEqual(
  resolveBackendAttempts({ requestedBackends: ['cpu'], installedBackend: 'vulkan', executablePresent: true }),
  { attempts: ['cpu'], fellBackToCpu: false },
  'a normal CPU launch is untouched'
);
assert.deepEqual(
  resolveBackendAttempts({ requestedBackends: ['vulkan', 'cpu'], installedBackend: 'cpu', executablePresent: true }),
  { attempts: ['vulkan', 'cpu'], fellBackToCpu: false },
  'an explicit GPU request keeps its CPU retry'
);
const unrecognised = resolveBackendAttempts({
  requestedBackends: ['vulkan', 'cpu'],
  installedBackend: 'openvino',
  executablePresent: true
});
assert.deepEqual(unrecognised.attempts, ['vulkan', 'cpu'], 'a usable build is still attempted');
assert.deepEqual(
  resolveBackendAttempts({ requestedBackends: ['cpu'], installedBackend: 'openvino', executablePresent: true }).attempts,
  ['cpu'],
  'a CPU launch survives an unrecognised layout'
);
assert.deepEqual(
  resolveBackendAttempts({ requestedBackends: ['cpu'], installedBackend: undefined, executablePresent: false }),
  { attempts: [], fellBackToCpu: false },
  'no executable means nothing to start, and the caller must report it'
);
