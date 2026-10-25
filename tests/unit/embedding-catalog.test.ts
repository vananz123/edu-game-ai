import assert from 'node:assert/strict';
import { validateManifest } from '../../src/ai-core/model-installer';
import {
  EMBEDDING_MODEL_ID,
  EMBEDDING_MODELS,
  embeddingModelFileName,
  embeddingTextForChunk,
  getEmbeddingModel
} from '../../src/ai-core/embedding-catalog';
import { buildEmbeddingServerArguments, chunkTextsForEmbedding } from '../../src/ai-core/embedding-manager';

// --- catalog --------------------------------------------------------------

const model = getEmbeddingModel();
assert.equal(model.id, EMBEDDING_MODEL_ID);
assert.equal(EMBEDDING_MODELS.length, 1, 'exactly one embedding model is supported until a second one is benchmarked');
assert.equal(model.dimension, 384, 'MiniLM multilingual L12 produces 384-dimension vectors');
assert.equal(model.contextLength, 512);
assert.equal(model.pooling, 'mean');
assert.equal(model.promptPrefix, '');
assert.ok(model.sizeBytes > 0);
assert.match(model.sha256, /^[a-f0-9]{64}$/);
assert.match(model.downloadUrl, /resolve\/[a-f0-9]{40}\//, 'downloads must be pinned to a commit, not "main"');
assert.equal(model.licenseName, 'Apache-2.0');

// The manifest must satisfy the same rules as the chat models so the existing
// installer (resume + SHA-256 verification) can download it unchanged.
validateManifest(model);
assert.throws(() => getEmbeddingModel('missing-model'), /danh mục/);

// `<id>-<version>.gguf` is the naming rule of ModelInstaller.
assert.equal(embeddingModelFileName(model), `${model.id}-${model.version}.gguf`);

// --- chunk text -----------------------------------------------------------

assert.equal(embeddingTextForChunk({ heading: 'Phần 1', text: 'Quang hợp là gì?' }, model), 'Phần 1\nQuang hợp là gì?');
assert.equal(embeddingTextForChunk({ heading: '  ', text: '  Quang hợp  ' }, model), 'Quang hợp');
assert.equal(embeddingTextForChunk({ heading: null as unknown as string, text: 'Hô hấp' }, model), 'Hô hấp');
assert.equal(
  embeddingTextForChunk({ heading: 'A', text: 'B' }, { ...model, promptPrefix: 'query: ' }),
  'query: A\nB'
);

// --- server arguments -----------------------------------------------------

const runtimeOptions = {
  modelId: model.id,
  host: '127.0.0.1' as const,
  port: 9931,
  contextSize: model.contextLength,
  cpuThreads: 4,
  gpuLayers: 0
};
const args = buildEmbeddingServerArguments('C:\\models\\minilm.gguf', runtimeOptions, model.pooling);
const flagValue = (flag: string) => {
  const position = args.indexOf(flag);
  return position >= 0 ? args[position + 1] : undefined;
};
assert.equal(flagValue('--model'), 'C:\\models\\minilm.gguf');
assert.equal(flagValue('--ctx-size'), '512', 'embeddings must use the model context, not the chat context');
assert.equal(flagValue('--threads'), '4');
assert.equal(flagValue('--n-gpu-layers'), '0');
assert.equal(flagValue('--parallel'), '1');
assert.equal(flagValue('--pooling'), 'mean');
assert.equal(flagValue('--embd-normalize'), '2', 'L2 normalisation makes cosine a dot product');
assert.ok(args.includes('--embedding'), 'the second server must run in embedding-only mode');
for (const samplingFlag of ['--temp', '--top-k', '--top-p', '--repeat-penalty', '--jinja']) {
  assert.equal(args.includes(samplingFlag), false, `${samplingFlag} does not belong to an embedding server`);
}

// --- batching -------------------------------------------------------------

const items = Array.from({ length: 9 }, (_value, index) => index);
assert.deepEqual(
  chunkTextsForEmbedding(items, 8).map(batch => batch.length),
  [8, 1]
);
assert.deepEqual(chunkTextsForEmbedding([], 8), []);
assert.deepEqual(chunkTextsForEmbedding(items, 0).length, 9, 'a non-positive batch size falls back to 1');
assert.deepEqual(chunkTextsForEmbedding(items, 100).length, 1);

console.log('Embedding catalog tests passed');
