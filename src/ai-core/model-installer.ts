import { createHash } from 'node:crypto';
import { mkdir, open, rename, rm, stat, statfs } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import type {
  MachineCapabilities,
  ModelDownloadProgress,
  ModelManifestEntry,
  ModelSelectionSummary
} from './contracts';
import { fetchTrustedDownload } from './trusted-download';
import { resolveCpuThreads } from './runtime-threads';

export interface ModelInstallerOptions {
  modelDirectory: string;
  fetchModel?: typeof fetch;
  getAvailableBytes?: (directory: string) => Promise<number>;
}

export class ModelInstaller {
  private readonly fetchModel: typeof fetch;
  private readonly getAvailableBytes: (directory: string) => Promise<number>;

  constructor(private readonly options: ModelInstallerOptions) {
    if (!path.isAbsolute(options.modelDirectory)) {
      throw new Error('Thư mục mô hình phải là đường dẫn tuyệt đối do ứng dụng xác định.');
    }
    this.fetchModel = options.fetchModel ?? fetch;
    this.getAvailableBytes = options.getAvailableBytes ?? getAvailableDiskBytes;
  }

  async install(
    manifest: ModelManifestEntry,
    onProgress?: (progress: ModelDownloadProgress) => void,
    signal?: AbortSignal
  ): Promise<string> {
    validateManifest(manifest);
    if (signal?.aborted) throw new Error('Tải mô hình đã bị hủy.');

    const modelName = `${manifest.id}-${manifest.version}.gguf`;
    const destination = path.join(this.options.modelDirectory, modelName);
    const partialPath = `${destination}.part`;
    await importDirectory(this.options.modelDirectory);

    const existing = await optionalFileSize(destination);
    if (existing !== undefined && existing > 0) {
      await verifyModelFile(destination, manifest);
      return destination;
    }
    if (existing === 0) throw new Error('Tệp mô hình đã cài đặt đang rỗng; không ghi đè tự động.');

    let receivedBytes = await fileSizeOrZero(partialPath);
    if (receivedBytes > manifest.sizeBytes) {
      await rm(partialPath, { force: true });
      receivedBytes = 0;
    }
    if (receivedBytes === manifest.sizeBytes) {
      try {
        await verifyModelFile(partialPath, manifest);
      } catch (error) {
        await rm(partialPath, { force: true });
        throw error;
      }
      await rename(partialPath, destination);
      return destination;
    }

    const requiredBytes = manifest.sizeBytes - receivedBytes;
    const availableBytes = await this.getAvailableBytes(this.options.modelDirectory);
    if (availableBytes < requiredBytes) {
      throw new Error(
        `Không đủ dung lượng để cài mô hình. Cần thêm ${requiredBytes} byte, còn ${availableBytes} byte.`
      );
    }

    const url = new URL(manifest.downloadUrl);
    const headers: Record<string, string> = {};
    if (receivedBytes > 0) headers.Range = `bytes=${receivedBytes}-`;
    const response = await fetchTrustedDownload(this.fetchModel, url.toString(), {
      headers,
      signal
    });

    let append = receivedBytes > 0;
    if (append) {
      const range = response.headers.get('content-range');
      const match = range?.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
      if (response.status !== 206 || !match || Number(match[1]) !== receivedBytes ||
          Number(match[3]) !== manifest.sizeBytes) {
        if (response.status !== 200) {
          await response.body?.cancel();
          throw new Error('Máy chủ trả về phản hồi Range không hợp lệ; không thể tiếp tục tải an toàn.');
        }
        append = false;
        receivedBytes = 0;
      }
    } else if (response.status !== 200) {
      await response.body?.cancel();
      throw new Error(`Không tải được mô hình: HTTP ${response.status}.`);
    }

    if (!response.body) throw new Error('Máy chủ không trả nội dung mô hình.');
    const advertisedLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(advertisedLength) && advertisedLength > 0 &&
        receivedBytes + advertisedLength > manifest.sizeBytes) {
      await response.body.cancel();
      throw new Error('Kích thước phản hồi tải vượt quá kích thước đã khai báo trong manifest.');
    }

    let writtenBytes = receivedBytes;
    const startedAt = Date.now();
    let file: Awaited<ReturnType<typeof open>>;
    try {
      file = await open(partialPath, append ? 'a' : 'w');
    } catch (error) {
      await response.body.cancel().catch(() => undefined);
      throw error;
    }
    try {
      const reader = response.body.getReader();
      try {
        while (true) {
          if (signal?.aborted) throw new Error('Tải mô hình đã bị hủy.');
          const { done, value } = await reader.read();
          if (done) break;
          writtenBytes += value.byteLength;
          if (writtenBytes > manifest.sizeBytes) {
            throw new Error('Kích thước tải vượt quá kích thước đã khai báo trong manifest.');
          }
          await file.write(value);
          const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 0.001);
          onProgress?.({
            receivedBytes: writtenBytes,
            totalBytes: manifest.sizeBytes,
            bytesPerSecond: Math.round((writtenBytes - receivedBytes) / elapsedSeconds),
            canResume: response.status === 206 || response.headers.get('accept-ranges')?.toLowerCase() === 'bytes'
          });
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      await response.body.cancel().catch(() => undefined);
      throw error;
    } finally {
      await file.close();
    }

    if (writtenBytes !== manifest.sizeBytes) {
      throw new Error(`Tải mô hình chưa hoàn tất: nhận ${writtenBytes}/${manifest.sizeBytes} byte.`);
    }
    try {
      await verifyModelFile(partialPath, manifest);
    } catch (error) {
      await rm(partialPath, { force: true });
      throw error;
    }
    await rename(partialPath, destination);
    return destination;
  }
}

export async function verifyModelFile(filePath: string, manifest: ModelManifestEntry): Promise<void> {
  validateManifest(manifest);
  const fileInfo = await importFileStats(filePath);
  if (fileInfo.size !== manifest.sizeBytes) {
    throw new Error(`Kích thước mô hình không khớp: nhận ${fileInfo.size}, cần ${manifest.sizeBytes} byte.`);
  }

  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  const actualHash = hash.digest('hex');
  if (actualHash.toLowerCase() !== manifest.sha256.toLowerCase()) {
    throw new Error('SHA-256 mô hình không khớp manifest.');
  }
}

export function summarizeModelSelection(
  manifest: ModelManifestEntry,
  machine: MachineCapabilities
): ModelSelectionSummary {
  validateManifest(manifest);
  if (!Number.isFinite(machine.totalRamBytes) || machine.totalRamBytes < 0 ||
      !Number.isInteger(machine.logicalCpuCount) || machine.logicalCpuCount < 1) {
    throw new Error('Thông tin cấu hình máy không hợp lệ.');
  }
  const profile = manifest.hardware;
  const memory = machine.totalRamBytes < profile.minimumRamBytes
    ? 'insufficient'
    : machine.totalRamBytes < profile.recommendedRamBytes
      ? 'below-recommended'
      : 'recommended';

  let gpu: ModelSelectionSummary['gpu']['status'] = 'not-supported';
  let gpuLayers = 0;
  if (profile.gpu.supported) {
    if (!machine.gpu) {
      gpu = profile.gpu.required ? 'below-recommended' : 'not-detected';
    } else if (profile.gpu.estimatedVramBytes !== undefined &&
        machine.gpu.vramBytes !== undefined &&
        machine.gpu.vramBytes < profile.gpu.estimatedVramBytes) {
      gpu = 'below-recommended';
    } else {
      gpu = 'recommended';
      gpuLayers = profile.gpu.recommendedLayers;
    }
  }

  const performanceReference = profile.performanceBenchmark
    ? `${profile.performanceBenchmark.tokensPerSecond} token/s tham chiếu trên ${profile.performanceBenchmark.hardware}; ` +
      `không phải cam kết tốc độ trên máy này. Chi tiết: ${profile.performanceBenchmark.sourceUrl}`
    : 'Chưa có benchmark hiệu năng đã xác minh cho mô hình này.';

  return {
    modelName: manifest.displayName,
    downloadSizeBytes: manifest.sizeBytes,
    licenseName: manifest.licenseName,
    licenseUrl: manifest.licenseUrl,
    memory: {
      status: memory,
      machineRamBytes: machine.totalRamBytes,
      minimumRamBytes: profile.minimumRamBytes,
      recommendedRamBytes: profile.recommendedRamBytes
    },
    cpu: {
      logicalCpuCount: machine.logicalCpuCount,
      recommendedThreads: profile.recommendedCpuThreads
    },
    cpuThreads: resolveCpuThreads(machine.logicalCpuCount, profile.recommendedCpuThreads),
    gpu: {
      status: gpu,
      ...(machine.gpu ? { machineName: machine.gpu.name } : {}),
      ...(machine.gpu?.vramBytes !== undefined ? { machineVramBytes: machine.gpu.vramBytes } : {}),
      ...(profile.gpu.estimatedVramBytes !== undefined
        ? { recommendedVramBytes: profile.gpu.estimatedVramBytes }
        : {}),
      supported: profile.gpu.supported,
      required: profile.gpu.required
    },
    gpuLayers,
    supportedLanguages: [...profile.supportedLanguages],
    expectedResult: profile.expectedResult,
    ...(profile.performanceBenchmark ? { performanceBenchmark: profile.performanceBenchmark } : {}),
    performanceReference
  };
}

export function validateManifest(manifest: ModelManifestEntry): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(manifest.id) ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,39}$/.test(manifest.version)) {
    throw new Error('ID hoặc phiên bản mô hình không hợp lệ.');
  }
  if (!Number.isSafeInteger(manifest.sizeBytes) || manifest.sizeBytes <= 0) {
    throw new Error('Kích thước mô hình trong manifest không hợp lệ.');
  }
  if (!/^[a-f0-9]{64}$/i.test(manifest.sha256)) throw new Error('SHA-256 trong manifest không hợp lệ.');
  validateHttpUrl(manifest.downloadUrl, 'URL tải mô hình');
  validateHttpUrl(manifest.sourceUrl, 'URL nguồn mô hình');
  validateHttpUrl(manifest.licenseUrl, 'URL giấy phép');
  if (!manifest.displayName.trim() || !manifest.licenseName.trim()) {
    throw new Error('Manifest phải khai báo tên mô hình và giấy phép.');
  }
  if (!manifest.friendlyName.trim() || manifest.friendlyName.trim().length > 80) {
    throw new Error('Manifest phải khai báo tên thân thiện cho người dùng.');
  }
  if (!manifest.tagline.trim() || manifest.tagline.trim().length > 200) {
    throw new Error('Manifest phải khai báo mô tả ngắn cho người dùng.');
  }
  const hardware = manifest.hardware;
  if (!hardware || !hardware.gpu ||
      !Number.isSafeInteger(hardware.minimumRamBytes) || hardware.minimumRamBytes <= 0 ||
      !Number.isSafeInteger(hardware.recommendedRamBytes) ||
      hardware.recommendedRamBytes < hardware.minimumRamBytes ||
      !Number.isInteger(hardware.recommendedCpuThreads) || hardware.recommendedCpuThreads < 1 ||
      !Number.isInteger(hardware.gpu.recommendedLayers) || hardware.gpu.recommendedLayers < 0 ||
      (hardware.gpu.required && !hardware.gpu.supported) ||
      (hardware.gpu.estimatedVramBytes !== undefined &&
        (!Number.isSafeInteger(hardware.gpu.estimatedVramBytes) || hardware.gpu.estimatedVramBytes <= 0)) ||
      !Array.isArray(hardware.supportedLanguages) || hardware.supportedLanguages.length === 0 ||
      !hardware.expectedResult.trim()) {
    throw new Error('Manifest thiếu hồ sơ tài nguyên phần cứng hoặc thông tin kết quả mô hình hợp lệ.');
  }
  if (hardware.performanceBenchmark) {
    const benchmark = hardware.performanceBenchmark;
    if (!Number.isFinite(benchmark.tokensPerSecond) || benchmark.tokensPerSecond <= 0 ||
        !benchmark.hardware.trim() || !benchmark.method.trim()) {
      throw new Error('Thông tin benchmark trong manifest không hợp lệ.');
    }
    validateHttpUrl(benchmark.sourceUrl, 'URL benchmark');
  }
}

function validateHttpUrl(value: string, label: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} không hợp lệ.`);
  }
  const localHttp = url.protocol === 'http:' &&
    (url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]');
  if ((!localHttp && url.protocol !== 'https:') || url.username || url.password || url.hash) {
    throw new Error(`${label} phải dùng HTTPS (HTTP chỉ được phép cho localhost trong kiểm thử).`);
  }
}

async function getAvailableDiskBytes(directory: string): Promise<number> {
  const info = await statfs(directory, { bigint: true });
  return Number(info.bavail * info.bsize);
}

async function fileSizeOrZero(filePath: string): Promise<number> {
  return (await optionalFileSize(filePath)) ?? 0;
}

async function optionalFileSize(filePath: string): Promise<number | undefined> {
  try {
    return (await importFileStats(filePath)).size;
  } catch (error) {
    if (isMissingFile(error)) return undefined;
    throw error;
  }
}

async function importDirectory(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true });
}

async function importFileStats(filePath: string): Promise<{ size: number }> {
  return stat(filePath);
}

function isMissingFile(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
