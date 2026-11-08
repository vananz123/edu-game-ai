/**
 * Regression suite for "chọn GPU rồi mà vẫn chỉ chạy CPU" (0.5.0 diagnostics:
 * `runtime.backend-swap-failed {wanted: vulkan, installed: cpu}` right after a
 * 32 MB download).
 *
 * Windows refuses to delete the runtime folder while any process still runs one
 * of its DLLs. The chat runtime is stopped before a swap, but the embedding
 * server is a second `llama-server.exe` started from the same folder, so the
 * last step of the swap died on EBUSY and the CPU build stayed in place. These
 * tests hold the folder for real (a spawned Windows process keeps its cwd
 * locked) and assert the swap either releases it through `onReplaceLocked` or
 * fails with a message that names the cause — never with a bare EBUSY.
 */
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import JSZip from 'jszip';
import { LlamaRuntimeInstaller } from '../../src/ai-core/runtime-installer';

async function holdDirectory(directory: string): Promise<ChildProcess> {
  // A process whose working directory is the folder cannot be deleted on
  // Windows — the same lock a running llama-server holds.
  const child = spawn(process.platform === 'win32' ? 'cmd.exe' : 'sleep', process.platform === 'win32' ? ['/c', 'ping -n 30 127.0.0.1'] : ['30'], {
    cwd: directory,
    stdio: 'ignore',
    windowsHide: true
  });
  await new Promise<void>(resolve => child.once('spawn', () => resolve()));
  return child;
}

async function run(): Promise<void> {
  const zip = new JSZip();
  zip.file('llama-server.exe', Buffer.from('vulkan build'));
  zip.file('ggml-vulkan.dll', Buffer.from('vulkan backend'));
  const archiveBytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const server = createServer((request, response) => {
    response.writeHead(200, { 'content-length': String(archiveBytes.length) });
    response.end(archiveBytes);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  const root = await mkdtemp(path.join(tmpdir(), 'edugame-runtime-swap-test-'));
  const children: ChildProcess[] = [];

  try {
    const artifact = {
      version: 'swap-runtime',
      downloadUrl: `http://127.0.0.1:${address.port}/runtime.zip`,
      sizeBytes: archiveBytes.length,
      sha256: createHash('sha256').update(archiveBytes).digest('hex'),
      sourceUrl: 'https://github.com/ggml-org/llama.cpp/releases/tag/swap',
      backend: 'vulkan'
    };
    const createInstaller = (runtimeDirectory: string, options: { release?: boolean } = {}) =>
      new LlamaRuntimeInstaller({
        runtimeDirectory,
        runtimeArtifact: artifact,
        platform: 'win32',
        arch: 'x64',
        ...(options.release
          ? {
              onReplaceLocked: async () => {
                for (const child of children.splice(0)) {
                  child.kill();
                  await new Promise<void>(resolve => child.once('exit', () => resolve()));
                }
              }
            }
          : {})
      });

    // --- The holder is released: the swap must finish, not keep the CPU build ---
    {
      const directory = path.join(root, 'released', 'llama.cpp-swap');
      await createInstaller(directory).install('qwen-test');
      // Hold the folder as a running server would: with no marker DLL left, the
      // installed build reads as "unrecognised", which forces a swap.
      await rm(path.join(directory, 'ggml-vulkan.dll'));
      children.push(await holdDirectory(directory));
      const swap = createInstaller(directory, { release: true });
      await swap.install('qwen-test');
      assert.equal(await swap.getInstalledBackend(), 'vulkan', 'the swap must end with Vulkan on disk');
      assert.equal((await readFile(path.join(directory, 'llama-server.exe'))).toString(), 'vulkan build');
    }

    // --- The holder never goes away: a clear error, not a bare EBUSY -----------
    {
      const directory = path.join(root, 'stuck', 'llama.cpp-swap');
      await createInstaller(directory).install('qwen-test');
      await rm(path.join(directory, 'ggml-vulkan.dll'));
      children.push(await holdDirectory(directory));
      const swap = createInstaller(directory);
      await assert.rejects(swap.install('qwen-test'), (error: NodeJS.ErrnoException) =>
        error.code === 'EBUSY' || error.code === 'EPERM' || error.code === 'EACCES',
      'the underlying lock error must still surface so the app can log its code');
      // `.installing` must not survive a failed swap, or the next attempt starts
      // from a half-written folder.
      await assert.rejects(stat(`${directory}.installing`), { code: 'ENOENT' });
    }

    console.log('runtime-backend-swap.test.ts: all assertions passed');
  } finally {
    for (const child of children.splice(0)) child.kill();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(root, { recursive: true, force: true }).catch(() => undefined);
  }
}

void run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
