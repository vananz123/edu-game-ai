/**
 * Regression suite for "I chose Vulkan in Settings but the CPU still does all
 * the work".
 *
 * Root cause: every backend extracts to the *same* directory
 * (`runtime/llama.cpp-<version>`), so an installed `llama-server.exe` said
 * nothing about which build it was. Every call site therefore treated a CPU
 * install as satisfying a Vulkan request, and `--n-gpu-layers 99` was handed to
 * a binary that has no GPU code.
 *
 * These tests assert on the build that ends up on disk, not on the flags, so
 * they fail if the choice stops reaching the files again.
 */
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { detectInstalledBackend, CPU_X64_RUNTIME, VULKAN_X64_RUNTIME } from '../../src/ai-core/runtime-manifest';
import { LlamaRuntimeInstaller } from '../../src/ai-core/runtime-installer';
import { resolveBackendAttempts } from '../../src/ai-core/model-catalog';

function check(label: string, fn: () => void | Promise<void>) {
  return (async () => {
    try {
      await fn();
      console.log(`ok   ${label}`);
    } catch (error) {
      console.log(`FAIL ${label}`);
      throw error;
    }
  })();
}

// Exactly the layout found on the pilot machine that had "chosen Vulkan": the
// CPU archive's dlls and no ggml-vulkan.dll.
const CPU_LAYOUT = [
  'llama-server.exe', 'ggml.dll', 'ggml-base.dll', 'ggml-cpu.dll',
  'ggml-cpu-alderlake.dll', 'ggml-cpu-zen4.dll', 'llama.dll', 'llama-common.dll'
];
const VULKAN_LAYOUT = [
  'llama-server.exe', 'ggml.dll', 'ggml-base.dll', 'ggml-vulkan.dll',
  'ggml-cpu-haswell.dll', 'llama.dll', 'llama-common.dll'
];

// ---------------------------------------------------------------------------
// 1. Detecting the backend from the extracted file list.
// ---------------------------------------------------------------------------

async function detectionGroup() {
  await check('a CPU runtime directory is detected as cpu', () => {
    assert.equal(detectInstalledBackend(CPU_LAYOUT), 'cpu');
  });

  await check('a Vulkan runtime directory is detected as vulkan', () => {
    assert.equal(detectInstalledBackend(VULKAN_LAYOUT), 'vulkan');
  });

  await check('detection is case-insensitive', () => {
    assert.equal(detectInstalledBackend(['GGML-VULKAN.DLL']), 'vulkan');
    assert.equal(detectInstalledBackend(['GGML-CPU-X64.DLL']), 'cpu');
  });

  await check('an unrecognised layout is not guessed', () => {
    assert.equal(detectInstalledBackend([]), undefined);
    assert.equal(detectInstalledBackend(['llama-server.exe', 'libomp.dll']), undefined);
  });

  await check('a directory holding both builds is reported as vulkan, not demoted', () => {
    // Cannot come from either archive, but silently demoting the teacher's
    // choice is the worse failure of the two.
    assert.equal(detectInstalledBackend([...CPU_LAYOUT, 'ggml-vulkan.dll']), 'vulkan');
  });

  await check('the real Vulkan archive is not mistaken for CPU', () => {
    // Verified against the downloaded b11681 Vulkan archive: it ships the CPU
    // backend dlls *too* (ggml-cpu-*.dll), so a detector that matches on those
    // first would label a GPU install as cpu and cause endless reinstalling.
    const realVulkan = [
      'llama-server.exe', 'ggml.dll', 'ggml-base.dll', 'ggml-vulkan.dll',
      'ggml-cpu-haswell.dll', 'ggml-cpu-alderlake.dll', 'ggml-cpu-zen4.dll',
      'ggml-cpu-x64.dll', 'llama.dll', 'mtmd.dll'
    ];
    assert.equal(detectInstalledBackend(realVulkan), 'vulkan');
  });
}

// ---------------------------------------------------------------------------
// 2. The installer replaces a wrong-backend install instead of reusing it.
// ---------------------------------------------------------------------------

/** Builds a zip whose contents mimic a real llama.cpp archive. */
async function makeArchive(fileNames: string[]) {
  const zip = new JSZip();
  for (const name of fileNames) zip.file(name, `synthetic ${name}`);
  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  const { createHash } = await import('node:crypto');
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  return { buffer, sha256, size: buffer.byteLength };
}

function fakeDownload(archive: { buffer: Buffer; size: number }, onRequest?: () => void) {
  return (async () => {
    onRequest?.();
    return new Response(new Uint8Array(archive.buffer), {
      status: 200,
      headers: { 'content-length': String(archive.size) }
    });
  }) as unknown as typeof fetch;
}

async function installerGroup() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'egame-backend-'));
  const runtimeDirectory = path.join(root, 'runtime', 'llama.cpp-b11681');
  try {
    // A pre-existing CPU install, exactly as on the machine that reported the
    // bug: `llama-server.exe` present, but it is the CPU build.
    await mkdir(runtimeDirectory, { recursive: true });
    for (const name of CPU_LAYOUT) {
      await writeFile(path.join(runtimeDirectory, name), `synthetic ${name}`);
    }

    await check('installer reports the backend already on disk', async () => {
      const installer = new LlamaRuntimeInstaller({ runtimeDirectory, platform: 'win32', arch: 'x64' });
      assert.equal(await installer.getInstalledBackend(), 'cpu');
    });

    await check('matchesBackend rejects the CPU install when Vulkan is wanted', async () => {
      const installer = new LlamaRuntimeInstaller({ runtimeDirectory, platform: 'win32', arch: 'x64' });
      assert.equal(await installer.matchesBackend('vulkan'), false);
      assert.equal(await installer.matchesBackend('cpu'), true);
    });

    await check('installing Vulkan over a CPU install actually replaces the files', async () => {
      const archive = await makeArchive(VULKAN_LAYOUT);
      let requests = 0;
      const installer = new LlamaRuntimeInstaller({
        runtimeDirectory,
        platform: 'win32',
        arch: 'x64',
        runtimeArtifact: {
          version: VULKAN_X64_RUNTIME.version,
          downloadUrl: VULKAN_X64_RUNTIME.downloadUrl,
          sizeBytes: archive.size,
          sha256: archive.sha256,
          sourceUrl: VULKAN_X64_RUNTIME.sourceUrl,
          backend: 'vulkan'
        },
        fetchRuntime: fakeDownload(archive, () => { requests += 1; })
      });

      await installer.install('synthetic-model');

      // The download must happen. Reusing the CPU files is the reported bug.
      assert.equal(requests, 1, 'the Vulkan archive must be downloaded even though llama-server.exe existed');
      assert.equal(await installer.getInstalledBackend(), 'vulkan');
      await stat(path.join(runtimeDirectory, 'ggml-vulkan.dll'));
      // CPU-only dlls from the previous install must not survive, or the
      // directory no longer matches any verified archive.
      await assert.rejects(stat(path.join(runtimeDirectory, 'ggml-cpu-alderlake.dll')), { code: 'ENOENT' });
    });

    await check('the swap reports progress so the window does not look frozen', async () => {
      // The first fix downloaded the right archive but reported nothing, so a
      // teacher switching to Vulkan saw a motionless window and concluded the
      // setting was still being ignored.
      const archive = await makeArchive(VULKAN_LAYOUT);
      const seen: number[] = [];
      const installer = new LlamaRuntimeInstaller({
        runtimeDirectory,
        platform: 'win32',
        arch: 'x64',
        runtimeArtifact: {
          version: VULKAN_X64_RUNTIME.version,
          downloadUrl: VULKAN_X64_RUNTIME.downloadUrl,
          sizeBytes: archive.size,
          sha256: archive.sha256,
          sourceUrl: VULKAN_X64_RUNTIME.sourceUrl,
          backend: 'vulkan'
        },
        fetchRuntime: fakeDownload(archive)
      });
      // Force a real reinstall: remove the Vulkan dll, leaving a CPU install.
      await rm(path.join(runtimeDirectory, 'ggml-vulkan.dll'), { force: true });
      assert.equal(await installer.getInstalledBackend(), 'cpu', 'test setup must look like a CPU install');

      await installer.install('synthetic-model', progress => {
        seen.push(progress.receivedBytes);
        assert.equal(progress.stage, 'runtime');
        assert.equal(progress.totalBytes, archive.size);
      });

      assert.ok(seen.length > 0, 'install() must emit at least one progress event');
      assert.equal(seen[seen.length - 1], archive.size, 'the last progress event must be the full size');
    });

    await check('installing the same backend again does not re-download', async () => {
      let requests = 0;
      const installer = new LlamaRuntimeInstaller({
        runtimeDirectory,
        platform: 'win32',
        arch: 'x64',
        runtimeArtifact: {
          version: VULKAN_X64_RUNTIME.version,
          downloadUrl: VULKAN_X64_RUNTIME.downloadUrl,
          sizeBytes: 1,
          sha256: 'a'.repeat(64),
          sourceUrl: VULKAN_X64_RUNTIME.sourceUrl,
          backend: 'vulkan'
        },
        fetchRuntime: (async () => {
          requests += 1;
          throw new Error('must not download');
        }) as unknown as typeof fetch
      });
      await installer.install('synthetic-model');
      assert.equal(requests, 0);
    });

    await check('an artifact with no declared backend is treated as the CPU build', async () => {
      // `LLAMA_CPP_RUNTIME` carries no `backend` field (only the manifest entry
      // adds it). Defaulting to 'cpu' keeps the old "already installed, skip"
      // behaviour instead of re-downloading over a good install.
      let requests = 0;
      const installer = new LlamaRuntimeInstaller({
        runtimeDirectory,
        platform: 'win32',
        arch: 'x64',
        fetchRuntime: (async () => {
          requests += 1;
          throw new Error('must not download');
        }) as unknown as typeof fetch
      });
      // The directory currently holds Vulkan from the previous case, so this
      // must *not* be reused as if it were the CPU build.
      await assert.rejects(installer.install('synthetic-model'), /must not download/);
      assert.equal(requests, 1, 'a Vulkan install must not satisfy a CPU artifact');
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function main() {
  await detectionGroup();
  await installerGroup();

  await check('the manifest declares a backend on every entry (the guard depends on it)', () => {
    assert.equal(CPU_X64_RUNTIME.backend, 'cpu');
    assert.equal(VULKAN_X64_RUNTIME.backend, 'vulkan');
  });

  // -------------------------------------------------------------------------
  // 3. A post-install backend mismatch must not brick local AI.
  //
  // The launch path reads the installed backend after installing the archive
  // and used to `throw` when it disagreed with the request. With CPU as the
  // default backend that turned one bad detection into "AI local never starts",
  // even though a working `llama-server.exe` was on disk.
  // -------------------------------------------------------------------------
  await check('a backend mismatch keeps a usable runtime and falls back to CPU', () => {
    const fallback = resolveBackendAttempts({
      requestedBackends: ['vulkan', 'cpu'],
      installedBackend: 'cpu',
      executablePresent: true
    });
    assert.deepEqual(fallback.attempts, ['vulkan', 'cpu']);
    assert.equal(fallback.fellBackToCpu, false, 'a GPU request keeps its CPU retry without a warning');

    const unrecognised = resolveBackendAttempts({
      requestedBackends: ['cpu'],
      installedBackend: 'openvino',
      executablePresent: true
    });
    assert.deepEqual(unrecognised.attempts, ['cpu'], 'the launch continues on CPU instead of throwing');
    assert.equal(unrecognised.fellBackToCpu, true, 'the mismatch must be reported to the log');
  });

  await check('a missing executable is the only fatal case', () => {
    const nothing = resolveBackendAttempts({
      requestedBackends: ['vulkan', 'cpu'],
      installedBackend: undefined,
      executablePresent: false
    });
    assert.deepEqual(nothing.attempts, [], 'no executable: the caller must surface a real error');
    assert.equal(nothing.fellBackToCpu, false);
  });

  // The mismatch branch must stay reachable in real life: a Vulkan-extracted
  // directory that lost ggml-vulkan.dll is exactly what `getInstalledBackend()`
  // reports as 'cpu', and that is the case the fallback has to absorb.
  await check('a Vulkan directory without ggml-vulkan.dll is reported as a CPU build', () => {
    const leftovers = VULKAN_LAYOUT.filter(entry => entry !== 'ggml-vulkan.dll');
    assert.equal(detectInstalledBackend(leftovers), 'cpu');
  });

  console.log('runtime-backend-install.test.ts: all assertions passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
