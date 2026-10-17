import assert from 'node:assert/strict';
import {
  QWEN_LOCAL_MODELS,
  getLocalModelRecommendation,
  recommendLocalModelId
} from '../src/ai-core/model-catalog';
import { validateManifest } from '../src/ai-core/model-installer';

assert.equal(QWEN_LOCAL_MODELS.length, 3);
assert.deepEqual(QWEN_LOCAL_MODELS.map(model => model.displayName), [
  'Qwen3.5 2B · Q4_0',
  'Qwen3.5 4B · Q4_0',
  'Qwen2.5 7B · Q4_0'
]);
for (const model of QWEN_LOCAL_MODELS) {
  validateManifest(model);
  assert.match(model.downloadUrl, /huggingface\.co\/(unsloth|bartowski)\/Qwen/);
  assert.equal(model.licenseName, 'Apache-2.0');
  assert.equal(model.hardware.gpu.supported, false);
  assert.equal(model.hardware.gpu.recommendedLayers, 0);
}
const sevenB = QWEN_LOCAL_MODELS.find(model => model.id === 'qwen2.5-7b-q4_0');
assert.equal(sevenB.sizeBytes, 4444121600);
assert.equal(sevenB.sha256, '08a87f62e92ab5043837959fc3d15cafb94dc202fc9128ce771bc37525025aed');
const capableMachine = { totalRamBytes: 16 * 1024 ** 3, logicalCpuCount: 8 };
assert.equal(recommendLocalModelId(capableMachine), 'qwen2.5-7b-q4_0');
const constrainedMachine = { totalRamBytes: 1 * 1024 ** 3, logicalCpuCount: 1 };
assert.equal(recommendLocalModelId(constrainedMachine), 'qwen3.5-2b-q4_0');
assert.equal(
  getLocalModelRecommendation(QWEN_LOCAL_MODELS[0], constrainedMachine).status,
  'not-recommended'
);
const midRangeMachine = { totalRamBytes: 8 * 1024 ** 3, logicalCpuCount: 6 };
assert.equal(recommendLocalModelId(midRangeMachine), 'qwen3.5-2b-q4_0');
assert.equal(
  getLocalModelRecommendation(QWEN_LOCAL_MODELS[0], midRangeMachine).status,
  'recommended'
);
assert.equal(
  getLocalModelRecommendation(QWEN_LOCAL_MODELS[1], midRangeMachine).status,
  'possible'
);
console.log('Model catalog tests passed');
