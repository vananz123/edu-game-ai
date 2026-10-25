import { createHash } from 'node:crypto';
import { copyFile, mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import type { LocalAiDownloadProgress } from './contracts';
import { LLAMA_CPP_RUNTIME } from './model-catalog';
import { detectInstalledBackend } from './runtime-manifest';
import { fetchTrustedDownload } from './trusted-download';

/**
 * The official llama.cpp Windows CPU zip is linked against the Microsoft
 * Visual C++ runtime but does not ship it. A missing or older system copy can
 * make llama-server exit with 0xC0000005 before it prints any log line, so the
 * installer carries the redistributable DLLs app-local next to llama-server.
 */
export const RUNTIME_SUPPORT_FILES = [
  'msvcp140.dll',
  'vcruntime140.dll',
  'vcruntime140_1.dll'
] as const;

export interface RuntimeInstallerOptions {
  runtimeDirectory: string;
  /** Directory containing the app-local MSVC runtime DLLs (packaged extraResources). */
  supportFilesDirectory?: string;
  fetchRuntime?: typeof fetch;
  runtimeArtifact?: RuntimeArtifact;
  platform?: NodeJS.Platform;
  arch?: string;
}

export interface RuntimeArtifact {
  version: string;
  downloadUrl: string;
  sizeBytes: number;
  sha256: string;
  sourceUrl: string;
  /** Which build this archive is. Used to refuse reusing the wrong install. */
  backend?: string;
}

export class LlamaRuntimeInstaller {
  private readonly fetchRuntime: typeof fetch;
  private readonly runtimeArtifact: RuntimeArtifact;
  private readonly platform: NodeJS.Platform;
  private readonly arch: string;

  constructor(private readonly options: RuntimeInstallerOptions) {
    if (!path.isAbsolute(options.runtimeDirectory)) {
      throw new Error('Thư mục runtime phải là đường dẫn tuyệt đối do ứng dụng xác định.');
    }
    this.fetchRuntime = options.fetchRuntime ?? fetch;
    this.runtimeArtifact = options.runtimeArtifact ?? LLAMA_CPP_RUNTIME;
    this.platform = options.platform ?? process.platform;
    this.arch = options.arch ?? process.arch;
  }

  async getExecutablePath(): Promise<string | undefined> {
    const executablePath = path.join(this.options.runtimeDirectory, this.platform === 'win32' ? 'llama-server.exe' : 'llama-server');
    try {
      const file = await stat(executablePath);
      return file.isFile() && file.size > 0 ? executablePath : undefined;
    } catch (error) {
      if (isMissingFile(error)) return undefined;
      throw error;
    }
  }

  /**
   * Which backend the extracted runtime on disk actually is.
   *
   * The directory path is the same for every backend, so the caller cannot tell
   * a CPU install from a Vulkan one by looking at the path or at the presence
   * of `llama-server.exe`. Returns `undefined` when nothing is installed yet or
   * the layout is not recognised.
   */
  async getInstalledBackend(): Promise<string | undefined> {
    if (!(await this.getExecutablePath())) return undefined;
    let entries: string[];
    try {
      entries = await readdir(this.options.runtimeDirectory);
    } catch (error) {
      if (isMissingFile(error)) return undefined;
      throw error;
    }
    return detectInstalledBackend(entries);
  }

  /**
   * True when the directory already holds a working executable *of the backend
   * this installer would install*. "A file exists" is not enough: keeping a CPU
   * install while the caller asked for Vulkan is exactly the bug this guards.
   */
  async matchesBackend(backend: string): Promise<boolean> {
    if (!(await this.getExecutablePath())) return false;
    const installed = await this.getInstalledBackend();
    // An unrecognised layout is treated as "not a match" so it gets replaced by
    // a verified archive instead of being trusted.
    return installed === backend;
  }

  /**
   * Repairs existing installations (downloaded before the runtime DLLs were
   * bundled) and normal installs before llama-server is spawned. It is a no-op
   * when the app has no support directory, e.g. in unit tests.
   */
  async ensureSupportFiles(): Promise<void> {
    if (!this.options.supportFilesDirectory) return;
    const executablePath = await this.getExecutablePath();
    if (!executablePath) return;
    await this.copySupportFiles(path.dirname(executablePath));
  }

  private async copySupportFiles(destinationDirectory: string): Promise<void> {
    const sourceDirectory = this.options.supportFilesDirectory;
    if (!sourceDirectory) return;
    for (const fileName of RUNTIME_SUPPORT_FILES) {
      const source = path.join(sourceDirectory, fileName);
      const destination = path.join(destinationDirectory, fileName);
      let sourceInfo;
      try {
        sourceInfo = await stat(source);
      } catch (error) {
        if (isMissingFile(error)) {
          throw new Error(`Bộ cài thiếu thư viện hỗ trợ llama.cpp (${fileName}). Hãy cài lại ứng dụng.`);
        }
        throw error;
      }
      if (!sourceInfo.isFile() || sourceInfo.size <= 0) {
        throw new Error(`Thư viện hỗ trợ llama.cpp không hợp lệ (${fileName}). Hãy cài lại ứng dụng.`);
      }
      let destinationInfo;
      try {
        destinationInfo = await stat(destination);
      } catch (error) {
        if (!isMissingFile(error)) throw error;
      }
      if (destinationInfo?.isFile() && destinationInfo.size === sourceInfo.size) continue;
      try {
        await copyFile(source, destination);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Không cập nhật được thư viện hỗ trợ llama.cpp (${fileName}): ${reason}. ` +
          'Nếu llama.cpp đang chạy, hãy dừng nó rồi thử lại.'
        );
      }
    }
  }

  async install(
    modelId: string,
    onProgress?: (progress: LocalAiDownloadProgress) => void,
    signal?: AbortSignal
  ): Promise<string> {
    // Reuse an existing install only when it is the *same build*. Checking for
    // `llama-server.exe` alone kept a CPU install in place when the caller had
    // resolved (and persisted) Vulkan, so the GPU choice did nothing.
    //
    // The default artifact (`LLAMA_CPP_RUNTIME`) carries no `backend` field but
    // *is* the CPU build; without this fallback any caller that omits the field
    // would re-download over a perfectly good install.
    const wantedBackend = this.runtimeArtifact.backend || 'cpu';
    if ((await this.getInstalledBackend()) === wantedBackend) {
      const existing = await this.getExecutablePath();
      if (existing) return existing;
    }
    if (this.platform !== 'win32' || this.arch !== 'x64') {
      throw new Error('Runtime llama.cpp tự quản lý hiện được hỗ trợ trên Windows x64.');
    }
    if (signal?.aborted) throw new Error('Cài đặt llama.cpp đã bị hủy.');

    const parent = path.dirname(this.options.runtimeDirectory);
    const temporaryDirectory = `${this.options.runtimeDirectory}.installing`;
    const archivePath = path.join(parent, `llama-${this.runtimeArtifact.version}.zip.part`);
    await mkdir(parent, { recursive: true });
    await rm(temporaryDirectory, { recursive: true, force: true });
    await rm(archivePath, { force: true });

    const response = await fetchTrustedDownload(this.fetchRuntime, this.runtimeArtifact.downloadUrl, { signal });
    if (response.status !== 200 || !response.body) {
      await response.body?.cancel();
      throw new Error(`Không tải được llama.cpp: HTTP ${response.status}.`);
    }
    const contentLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > 0 &&
        contentLength !== this.runtimeArtifact.sizeBytes) {
      await response.body.cancel();
      throw new Error('Kích thước gói llama.cpp không khớp thông tin phát hành.');
    }

    const hash = createHash('sha256');
    let receivedBytes = 0;
    const startedAt = Date.now();
    const archive = await open(archivePath, 'w');
    try {
      const reader = response.body.getReader();
      try {
        while (true) {
          if (signal?.aborted) throw new Error('Cài đặt llama.cpp đã bị hủy.');
          const { done, value } = await reader.read();
          if (done) break;
          receivedBytes += value.byteLength;
          if (receivedBytes > this.runtimeArtifact.sizeBytes) {
            throw new Error('Gói llama.cpp tải về lớn hơn kích thước đã xác minh.');
          }
          hash.update(value);
          await archive.write(value);
          onProgress?.({
            stage: 'runtime',
            modelId,
            receivedBytes,
            totalBytes: this.runtimeArtifact.sizeBytes,
            bytesPerSecond: Math.round(receivedBytes / Math.max((Date.now() - startedAt) / 1000, 0.001))
          });
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      await response.body.cancel().catch(() => undefined);
      await rm(archivePath, { force: true });
      throw error;
    } finally {
      await archive.close();
    }

    const actualHash = hash.digest('hex');
    if (receivedBytes !== this.runtimeArtifact.sizeBytes ||
        actualHash !== this.runtimeArtifact.sha256) {
      await rm(archivePath, { force: true });
      throw new Error('Gói llama.cpp không vượt qua kiểm tra kích thước/SHA-256.');
    }

    try {
      const zip = await JSZip.loadAsync(await readFile(archivePath));
      await mkdir(temporaryDirectory, { recursive: true });
      let foundServer = false;
      for (const [entryName, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue;
        if (entryName.includes('\\') || entryName.startsWith('/') ||
            entryName.includes(':') || entryName.split('/').some(part => part === '..')) {
          throw new Error('Gói llama.cpp chứa đường dẫn tệp không an toàn.');
        }
        const fileName = path.posix.basename(entryName);
        if (fileName !== entryName) throw new Error('Gói llama.cpp chứa thư mục con không được hỗ trợ.');
        if (!/\.(exe|dll)$/i.test(fileName) && !/^LICENSE/i.test(fileName)) continue;
        const content = await entry.async('nodebuffer');
        await writeFile(path.join(temporaryDirectory, fileName), content, { flag: 'wx' });
        if (fileName.toLowerCase() === 'llama-server.exe') foundServer = true;
      }
      if (!foundServer) throw new Error('Trong gói llama.cpp không tìm thấy llama-server.exe.');
      await this.copySupportFiles(temporaryDirectory);
      await rm(this.options.runtimeDirectory, { recursive: true, force: true });
      await rename(temporaryDirectory, this.options.runtimeDirectory);
      return path.join(this.options.runtimeDirectory, 'llama-server.exe');
    } catch (error) {
      await rm(temporaryDirectory, { recursive: true, force: true });
      throw error;
    } finally {
      await rm(archivePath, { force: true });
    }
  }
}

function isMissingFile(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
