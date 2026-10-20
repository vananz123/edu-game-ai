import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import JSZip from 'jszip';
import { LlamaRuntimeInstaller } from '../src/ai-core/runtime-installer';
import { fetchTrustedDownload } from '../src/ai-core/trusted-download';

async function run(): Promise<void> {
  const zip = new JSZip();
  zip.file('llama-server.exe', Buffer.from('fake llama server'));
  zip.file('ggml.dll', Buffer.from('fake ggml library'));
  zip.file('README.md', 'not needed by the runtime');
  const archiveBytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const server = createServer((request, response) => {
    response.writeHead(200, { 'content-length': String(archiveBytes.length) });
    response.end(archiveBytes);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  const root = await mkdtemp(path.join(tmpdir(), 'edugame-llama-runtime-test-'));

  try {
    const artifact = {
      version: 'test-runtime',
      downloadUrl: `http://127.0.0.1:${address.port}/runtime.zip`,
      sizeBytes: archiveBytes.length,
      sha256: createHash('sha256').update(archiveBytes).digest('hex'),
      sourceUrl: 'https://github.com/ggml-org/llama.cpp/releases/tag/test'
    };
    const supportDirectory = path.join(root, 'vc-runtime');
    await mkdir(supportDirectory, { recursive: true });
    for (const fileName of ['msvcp140.dll', 'vcruntime140.dll', 'vcruntime140_1.dll']) {
      await writeFile(path.join(supportDirectory, fileName), `fake ${fileName}`);
    }
    const installer = new LlamaRuntimeInstaller({
      runtimeDirectory: path.join(root, 'runtime'),
      supportFilesDirectory: supportDirectory,
      runtimeArtifact: artifact,
      platform: 'win32',
      arch: 'x64'
    });
    const executablePath = await installer.install('qwen-test');
    assert.equal(path.basename(executablePath), 'llama-server.exe');
    assert.equal((await readFile(executablePath)).toString(), 'fake llama server');
    assert.equal((await readFile(path.join(root, 'runtime', 'ggml.dll'))).toString(), 'fake ggml library');
    await assert.rejects(stat(path.join(root, 'runtime', 'README.md')), { code: 'ENOENT' });
    assert.equal(await installer.getExecutablePath(), executablePath);
    for (const fileName of ['msvcp140.dll', 'vcruntime140.dll', 'vcruntime140_1.dll']) {
      assert.equal((await readFile(path.join(root, 'runtime', fileName))).toString(), `fake ${fileName}`);
    }

    // Upgrading an existing runtime must repair a missing support DLL without
    // downloading the whole llama.cpp archive again.
    await rm(path.join(root, 'runtime', 'msvcp140.dll'));
    await installer.ensureSupportFiles();
    assert.equal((await readFile(path.join(root, 'runtime', 'msvcp140.dll'))).toString(), 'fake msvcp140.dll');

    const redirectCalls: string[] = [];
    const redirected = await fetchTrustedDownload(async input => {
      const url = String(input);
      redirectCalls.push(url);
      return redirectCalls.length === 1
        ? new Response(null, { status: 302, headers: { location: 'https://release-assets.githubusercontent.com/runtime.zip' } })
        : new Response('ok', { status: 200 });
    }, 'https://github.com/ggml-org/llama.cpp/releases/download/b/runtime.zip');
    assert.equal(await redirected.text(), 'ok');
    assert.equal(redirectCalls.length, 2);
    await assert.rejects(fetchTrustedDownload(async () =>
      new Response(null, { status: 302, headers: { location: 'https://evil.example/runtime.zip' } }),
    'https://github.com/ggml-org/llama.cpp/releases/download/b/runtime.zip'), /URL tải hoặc chuyển hướng/);

    const badInstaller = new LlamaRuntimeInstaller({
      runtimeDirectory: path.join(root, 'bad-runtime'),
      runtimeArtifact: { ...artifact, sha256: '0'.repeat(64) },
      platform: 'win32',
      arch: 'x64'
    });
    await assert.rejects(badInstaller.install('qwen-test'), /SHA-256/);
    await assert.rejects(stat(path.join(root, 'bad-runtime', 'llama-server.exe')), { code: 'ENOENT' });
    console.log('Runtime installer tests passed');
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(root, { recursive: true, force: true });
  }
}

void run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
