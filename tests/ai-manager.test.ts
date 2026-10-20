import assert from 'node:assert/strict';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { AIManager, buildLlamaServerArguments, describeRuntimeExitCode } from '../src/ai-core/ai-manager';
import {
  buildGenerationOptions
} from '../src/ai-core/generation-options';
import {
  getLocalDocumentAnalysisExcerpt,
  LOCAL_DOCUMENT_ANALYSIS_MAX_CHARS,
  isAnswerSupportedByEvidence,
  selectRelevantEvidence
} from '../src/ai-core/document-assist';

const testRuntimeScript = `
const http = require('node:http');
const port = Number(process.argv[1]);
const server = http.createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end('{"ok":true}');
    return;
  }
  response.writeHead(404);
  response.end();
});
server.listen(port, '127.0.0.1');
`;

function createManager(startupTimeoutMs = 2_000): AIManager {
  return new AIManager({
    executablePath: process.execPath,
    modelPath: path.join(tmpdir(), 'fake-model.gguf'),
    modelId: 'fake-test-model',
    contextSize: 512,
    cpuThreads: 1,
    gpuLayers: 0,
    startupTimeoutMs,
    healthIntervalMs: 20,
    shutdownTimeoutMs: 1_000
  }, {
    buildArguments: (_modelPath, runtimeOptions) => [
      '-e',
      testRuntimeScript,
      String(runtimeOptions.port)
    ]
  });
}

async function run(): Promise<void> {
  const manager = createManager();
  const firstStart = manager.start();
  const secondStart = manager.start();
  assert.strictEqual(firstStart, secondStart, 'concurrent starts must share one launch');

  const ready = await firstStart;
  assert.equal(ready.state, 'READY');
  assert.equal(ready.modelId, 'fake-test-model');
  assert.match(manager.getBaseUrl(), /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.equal((await manager.start()).state, 'READY', 'starting an already-ready manager must not relaunch');

  const stopped = await manager.stop();
  assert.equal(stopped.state, 'STOPPED');
  assert.throws(() => manager.getBaseUrl(), /chưa sẵn sàng/);
  const restarted = await manager.start();
  assert.equal(restarted.state, 'READY', 'a stopped manager must be able to launch its runtime again');
  await manager.stop();

  assert.deepEqual(buildLlamaServerArguments(path.join(tmpdir(), 'fake-model.gguf'), {
    modelId: 'fake-alias-model',
    host: '127.0.0.1',
    port: 12345,
    contextSize: 512,
    cpuThreads: 2,
    gpuLayers: 0
  }), [
    '--model',
    path.join(tmpdir(), 'fake-model.gguf'),
    '--alias',
    'fake-alias-model',
    '--host',
    '127.0.0.1',
    '--port',
    '12345',
    '--ctx-size',
    '512',
    '--parallel',
    '1',
    '--ctx-checkpoints',
    '0',
    '--threads',
    '2',
    '--n-gpu-layers',
    '0'
  ]);
  assert.match(describeRuntimeExitCode(3221225477), /0xC0000005/);
  assert.match(describeRuntimeExitCode(-1073741819), /0xC0000005/);
  assert.match(describeRuntimeExitCode(3221225781), /0xC0000135/);
  assert.equal(describeRuntimeExitCode(0), '');
  assert.deepEqual(buildGenerationOptions('local', 500), {
    max_tokens: 500,
    chat_template_kwargs: { enable_thinking: false }
  });
  assert.deepEqual(buildGenerationOptions('online', 1200), { max_tokens: 1200 });
  assert.throws(() => buildGenerationOptions('local', 0), /số nguyên dương/);
  const retrievedEvidence = selectRelevantEvidence(
    'Cây xanh cần ánh sáng. Rễ hút nước từ đất. Lá hấp thụ ánh sáng.',
    'Bộ phận nào hút nước từ đất?'
  );
  assert.equal(retrievedEvidence[0], 'Rễ hút nước từ đất.');
  assert.equal(isAnswerSupportedByEvidence('Rễ hút nước', retrievedEvidence), true);
  assert.equal(isAnswerSupportedByEvidence('Lá hút nước', retrievedEvidence), false);
  assert.equal(isAnswerSupportedByEvidence('No answer found', []), false);
  const longDocument = `${'A'.repeat(15_000)}END OF DOCUMENT`;
  const excerpt = getLocalDocumentAnalysisExcerpt(longDocument);
  assert.equal(excerpt.length, LOCAL_DOCUMENT_ANALYSIS_MAX_CHARS);
  assert.ok(excerpt.startsWith('A'.repeat(8_000)));
  assert.match(excerpt, /Đã lược bớt phần giữa/);
  assert.ok(excerpt.endsWith('END OF DOCUMENT'));
  assert.equal(getLocalDocumentAnalysisExcerpt('Short document'), 'Short document');

  const failingManager = new AIManager({
    executablePath: process.execPath,
    modelPath: path.join(tmpdir(), 'fake-model.gguf'),
    modelId: 'fake-failing-model',
    contextSize: 512,
    cpuThreads: 1,
    gpuLayers: 0,
    startupTimeoutMs: 1_000,
    healthIntervalMs: 20,
    shutdownTimeoutMs: 1_000
  }, {
    buildArguments: () => ['-e', 'setTimeout(() => {}, 10000)']
  });

  await assert.rejects(failingManager.start(), /không sẵn sàng/);
  assert.equal(failingManager.getStatus().state, 'ERROR');
  await failingManager.stop();
  assert.equal(failingManager.getStatus().state, 'STOPPED');

  const diagnosticManager = new AIManager({
    executablePath: process.execPath,
    modelPath: path.join(tmpdir(), 'fake-model.gguf'),
    modelId: 'fake-diagnostic-model',
    contextSize: 512,
    cpuThreads: 1,
    gpuLayers: 0,
    startupTimeoutMs: 1_000,
    healthIntervalMs: 20,
    shutdownTimeoutMs: 1_000
  }, {
    buildArguments: () => [
      '-e',
      `process.stderr.write('unsupported model architecture: qwen3_5\\n'); process.exit(2);`
    ]
  });
  await assert.rejects(diagnosticManager.start(), /unsupported model architecture: qwen3_5/);
  await diagnosticManager.stop();

  const stdoutDiagnosticManager = new AIManager({
    executablePath: process.execPath,
    modelPath: path.join(tmpdir(), 'fake-model.gguf'),
    modelId: 'fake-stdout-diagnostic-model',
    contextSize: 512,
    cpuThreads: 1,
    gpuLayers: 0,
    startupTimeoutMs: 1_000,
    healthIntervalMs: 20,
    shutdownTimeoutMs: 1_000
  }, {
    buildArguments: () => [
      '-e',
      `process.stdout.write('stdout diagnostic: model load failed\\n'); process.exit(2);`
    ]
  });
  await assert.rejects(stdoutDiagnosticManager.start(), /stdout diagnostic: model load failed/);
  await stdoutDiagnosticManager.stop();

  assert.throws(() => new AIManager({
    executablePath: 'llama-server.exe',
    modelPath: path.join(tmpdir(), 'fake-model.gguf'),
    modelId: 'invalid-path',
    contextSize: 512,
    cpuThreads: 1,
    gpuLayers: 0
  }), /đường dẫn tuyệt đối/);

  console.log('AI manager tests passed');
}

void run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
