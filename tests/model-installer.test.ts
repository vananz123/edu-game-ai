import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import {
  ModelInstaller,
  summarizeModelSelection,
  validateManifest
} from '../src/ai-core/model-installer';
import type { ModelManifestEntry } from '../src/ai-core/contracts';

const modelBytes = Buffer.from('fake gguf model bytes for installer tests');
const modelHash = createHash('sha256').update(modelBytes).digest('hex');

function createManifest(downloadUrl: string): ModelManifestEntry {
  return {
    id: 'test-model',
    version: '1.0.0',
    displayName: 'Local installer test model',
    friendlyName: 'Bản kiểm thử',
    tagline: 'Model dùng cho kiểm thử cài đặt.',
    downloadUrl,
    sizeBytes: modelBytes.byteLength,
    sha256: modelHash,
    sourceUrl: 'https://models.example.test/model',
    licenseName: 'Test license',
    licenseUrl: 'https://models.example.test/license',
    hardware: {
      minimumRamBytes: 4 * 1024 ** 3,
      recommendedRamBytes: 8 * 1024 ** 3,
      recommendedCpuThreads: 6,
      gpu: {
        supported: true,
        required: false,
        recommendedLayers: 12,
        estimatedVramBytes: 2 * 1024 ** 3
      },
      supportedLanguages: ['vi', 'en'],
      expectedResult: 'Tạo bản nháp trắc nghiệm tiếng Việt; giáo viên cần rà soát độ chính xác.',
      performanceBenchmark: {
        tokensPerSecond: 18,
        hardware: 'Reference GPU',
        method: 'Prompt and generation settings described in benchmark',
        sourceUrl: 'https://models.example.test/benchmark'
      }
    }
  };
}

function respondWithModel(
  request: IncomingMessage,
  response: ServerResponse,
  supportRanges: boolean,
  counter: { rangeRequests: number }
): void {
  const rangeHeader = request.headers.range;
  if (supportRanges && rangeHeader?.startsWith('bytes=')) {
    counter.rangeRequests += 1;
    const start = Number(rangeHeader.slice('bytes='.length, -1));
    response.writeHead(206, {
      'accept-ranges': 'bytes',
      'content-range': `bytes ${start}-${modelBytes.length - 1}/${modelBytes.length}`,
      'content-length': String(modelBytes.length - start)
    });
    response.end(modelBytes.subarray(start));
    return;
  }
  response.writeHead(200, {
    'accept-ranges': supportRanges ? 'bytes' : 'none',
    'content-length': String(modelBytes.length)
  });
  response.end(modelBytes);
}

async function withModelServer(
  action: (url: string, counter: { rangeRequests: number }) => Promise<void>,
  supportRanges = true
): Promise<void> {
  const counter = { rangeRequests: 0 };
  const server = createServer((request, response) =>
    respondWithModel(request, response, supportRanges, counter));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  try {
    await action(`http://127.0.0.1:${address.port}/model.gguf`, counter);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve()));
  }
}

async function run(): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'edugame-model-test-'));
  try {
    await withModelServer(async (downloadUrl, counter) => {
      const modelDirectory = path.join(root, 'fresh-install');
      const manifest = createManifest(downloadUrl);
      const progress: number[] = [];
      const installer = new ModelInstaller({
        modelDirectory,
        getAvailableBytes: async () => 1024 * 1024
      });
      const installedPath = await installer.install(manifest, (value) => progress.push(value.receivedBytes));
      assert.deepEqual(await readFile(installedPath), modelBytes);
      assert.ok(progress.length > 0);
      assert.equal(counter.rangeRequests, 0);
      assert.equal(await installer.install(manifest), installedPath, 'verified installed model should be reused');
    });

    await withModelServer(async (downloadUrl, counter) => {
      const modelDirectory = path.join(root, 'resume-install');
      await mkdir(modelDirectory, { recursive: true });
      const manifest = createManifest(downloadUrl);
      const partialPath = path.join(modelDirectory, `${manifest.id}-${manifest.version}.gguf.part`);
      const prefixLength = Math.floor(modelBytes.length / 2);
      await writeFile(partialPath, modelBytes.subarray(0, prefixLength));

      const installer = new ModelInstaller({
        modelDirectory,
        getAvailableBytes: async () => manifest.sizeBytes
      });
      const installedPath = await installer.install(manifest);
      assert.deepEqual(await readFile(installedPath), modelBytes);
      assert.equal(counter.rangeRequests, 1, 'partial download should resume with an HTTP Range request');
    });

    await withModelServer(async (downloadUrl) => {
      const modelDirectory = path.join(root, 'no-range-install');
      await mkdir(modelDirectory, { recursive: true });
      const manifest = createManifest(downloadUrl);
      const partialPath = path.join(modelDirectory, `${manifest.id}-${manifest.version}.gguf.part`);
      await writeFile(partialPath, modelBytes.subarray(0, 3));

      const installer = new ModelInstaller({
        modelDirectory,
        getAvailableBytes: async () => manifest.sizeBytes
      });
      const installedPath = await installer.install(manifest);
      assert.deepEqual(await readFile(installedPath), modelBytes, 'server without Range must restart from byte zero');
    }, false);

    await withModelServer(async (downloadUrl) => {
      const manifest = createManifest(downloadUrl);
      const modelDirectory = path.join(root, 'bad-hash-install');
      const installer = new ModelInstaller({
        modelDirectory,
        getAvailableBytes: async () => manifest.sizeBytes
      });
      await assert.rejects(
        installer.install({ ...manifest, sha256: '0'.repeat(64) }),
        /SHA-256/
      );
      await assert.rejects(
        readFile(path.join(modelDirectory, `${manifest.id}-${manifest.version}.gguf`)),
        { code: 'ENOENT' }
      );
      await assert.rejects(
        readFile(path.join(modelDirectory, `${manifest.id}-${manifest.version}.gguf.part`)),
        { code: 'ENOENT' }
      );
    });

    await withModelServer(async (downloadUrl) => {
      const manifest = createManifest(downloadUrl);
      const installer = new ModelInstaller({
        modelDirectory: path.join(root, 'low-space'),
        getAvailableBytes: async () => 1
      });
      await assert.rejects(installer.install(manifest), /Không đủ dung lượng/);
    });

    const manifest = createManifest('https://models.example.test/model.gguf');
    const noGpuSummary = summarizeModelSelection(manifest, {
      totalRamBytes: 6 * 1024 ** 3,
      logicalCpuCount: 4
    });
    assert.equal(noGpuSummary.modelName, 'Local installer test model');
    assert.equal(noGpuSummary.downloadSizeBytes, modelBytes.length);
    assert.equal(noGpuSummary.licenseName, 'Test license');
    assert.equal(noGpuSummary.memory.status, 'below-recommended');
    assert.equal(noGpuSummary.memory.machineRamBytes, 6 * 1024 ** 3);
    assert.equal(noGpuSummary.memory.minimumRamBytes, 4 * 1024 ** 3);
    assert.equal(noGpuSummary.memory.recommendedRamBytes, 8 * 1024 ** 3);
    assert.equal(noGpuSummary.cpu.logicalCpuCount, 4);
    assert.equal(noGpuSummary.cpu.recommendedThreads, 6);
    assert.equal(noGpuSummary.cpuThreads, 4);
    assert.equal(noGpuSummary.gpu.status, 'not-detected');
    assert.equal(noGpuSummary.gpu.required, false);
    assert.equal(noGpuSummary.gpu.recommendedVramBytes, 2 * 1024 ** 3);
    assert.equal(noGpuSummary.gpuLayers, 0);
    assert.deepEqual(noGpuSummary.supportedLanguages, ['vi', 'en']);
    assert.match(noGpuSummary.expectedResult, /giáo viên/);
    assert.match(noGpuSummary.performanceReference, /không phải cam kết tốc độ/);

    const compatibleGpuSummary = summarizeModelSelection(manifest, {
      totalRamBytes: 16 * 1024 ** 3,
      logicalCpuCount: 12,
      gpu: { name: 'Test GPU', vramBytes: 4 * 1024 ** 3 }
    });
    assert.equal(compatibleGpuSummary.memory.status, 'recommended');
    assert.equal(compatibleGpuSummary.cpuThreads, 6);
    assert.equal(compatibleGpuSummary.gpu.status, 'recommended');
    assert.equal(compatibleGpuSummary.gpu.machineName, 'Test GPU');
    assert.equal(compatibleGpuSummary.gpuLayers, 12);

    assert.throws(() => validateManifest({
      ...manifest,
      downloadUrl: 'http://example.com/model.gguf'
    }), /HTTPS/);

    console.log('Model installer tests passed');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

void run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
