import type { MachineCapabilities, ModelManifestEntry } from './contracts';

/*
 * Quantization: Q4_K_M for every tier (was Q4_0 until 2026-10-22).
 *
 * `sizeBytes` and `sha256` come from Hugging Face's published LFS metadata for
 * the exact revision pinned in `downloadUrl`: `sha256` is the `lfs.oid` of the
 * file, which is what `X-Linked-ETag` returns on a HEAD request. They were
 * re-read on 2026-10-22 (HTTP 200 for all three URLs) but the 1.2-4.7 GB
 * bodies were NOT downloaded and hashed locally, so the download-integrity step
 * is only proven once a real install completes.
 *
 * The Gemma 4 E2B entry was added on 2026-10-25 with the same method (Hub API
 * `size` + `lfs.oid` of revision `0314792d7f1f…`, repo not gated). Its file has
 * not been downloaded, hashed locally or run through this app's prompts yet.
 *
 * Q4_K_M files are ~5-6% larger than the old Q4_0 ones and decode slightly
 * slower on CPU-only machines, so the tier RAM minimums below are unchanged but
 * teachers on weak CPUs should expect a small speed cost. No end-to-end
 * quality/speed comparison has been measured yet. The optional Vulkan build is
 * measured slower than CPU on an integrated GPU (docs/BENCHMARKS.md), which is
 * why every entry here keeps `gpu.supported: false`.
 */
const QWEN_LICENSE = 'Apache-2.0';
/** Gemma 4 moved from the Gemma Terms of Use to Apache-2.0 (Gemma 3 was not). */
const GEMMA_LICENSE = 'Apache-2.0';

/**
 * Catalog order matters: `QWEN_LOCAL_MODELS[0]` is the last-resort default used
 * when the teacher has not chosen a model yet (`currentChatModelId`, the chat
 * request path and the setup fallback). That is why the weakest, cheapest model
 * is listed first — no code path may land a weak machine on a big download by
 * accident. `recommendLocalModelId()` does the real choosing.
 */
export const QWEN_LOCAL_MODELS: readonly ModelManifestEntry[] = [
  {
    id: 'qwen3.5-2b-q4_k_m',
    version: '31e04817b38d',
    displayName: 'Qwen3.5 2B · Q4_K_M',
    friendlyName: 'Bản Nhanh — phù hợp máy yếu',
    tagline: 'Nhanh, tự động, phù hợp máy yếu · trả lời gọn, ít tốn RAM/CPU.',
    downloadUrl: 'https://huggingface.co/unsloth/Qwen3.5-2B-GGUF/resolve/31e04817b38d226cdd13454bcc3982ebaa5a386b/Qwen3.5-2B-Q4_K_M.gguf',
    sizeBytes: 1280835840,
    sha256: 'aaf42c8b7c3cab2bf3d69c355048d4a0ee9973d48f16c731c0520ee914699223',
    sourceUrl: 'https://huggingface.co/unsloth/Qwen3.5-2B-GGUF',
    licenseName: QWEN_LICENSE,
    licenseUrl: 'https://huggingface.co/Qwen/Qwen3.5-2B/blob/main/LICENSE',
    hardware: {
      minimumRamBytes: 4 * 1024 ** 3,
      recommendedRamBytes: 8 * 1024 ** 3,
      recommendedCpuThreads: 6,
      gpu: { supported: false, required: false, recommendedLayers: 0 },
      supportedLanguages: ['Tiếng Việt', 'Tiếng Anh', 'Đa ngôn ngữ'],
      expectedResult: 'Cân bằng hơn cho tóm tắt, hỏi đáp và bộ câu hỏi theo tài liệu; tốc độ CPU phụ thuộc cấu hình máy và giáo viên cần rà soát nội dung.'
    }
  },
  {
    id: 'gemma-4-e2b-it-q4_k_m',
    version: '0314792d7f1f',
    displayName: 'Gemma 4 E2B · Q4_K_M',
    friendlyName: 'Bản Đa năng — Gemma 4 (thử nghiệm)',
    tagline: 'Model mới của Google, nhiều ngôn ngữ · đã đo: chậm hơn bản Nhanh trên CPU và có bước "suy nghĩ" trước câu trả lời, hãy thử để so sánh.',
    downloadUrl: 'https://huggingface.co/unsloth/gemma-4-E2B-it-GGUF/resolve/0314792d7f1f7e229411f620751375812bb9faf2/gemma-4-E2B-it-Q4_K_M.gguf',
    sizeBytes: 3106738272,
    sha256: '740185b21d22ceb83a11c3aa62ad5842ef32c70f6096d756bbee85a1e4ec34b8',
    sourceUrl: 'https://huggingface.co/unsloth/gemma-4-E2B-it-GGUF',
    licenseName: GEMMA_LICENSE,
    licenseUrl: 'https://ai.google.dev/gemma/docs/gemma_4_license',
    hardware: {
      minimumRamBytes: 8 * 1024 ** 3,
      recommendedRamBytes: 12 * 1024 ** 3,
      recommendedCpuThreads: 8,
      gpu: { supported: false, required: false, recommendedLayers: 0 },
      supportedLanguages: ['Tiếng Việt', 'Tiếng Anh', 'Đa ngôn ngữ'],
      expectedResult: 'Đã đo trên máy phổ thông: chậm hơn bản Nhanh ở cả đọc tài liệu lẫn sinh câu (4,65 tỉ tham số) và có thể in bước "suy nghĩ" thay vì câu trả lời khi câu ngắn; chất lượng chưa được đánh giá, giáo viên phải rà soát nội dung.'
    }
  },
  {
    id: 'qwen3.5-4b-q4_k_m',
    version: '1a02dbed1cd',
    displayName: 'Qwen3.5 4B · Q4_K_M',
    friendlyName: 'Bản Linh hoạt — nhiều lựa chọn hơn',
    tagline: 'Có thể tạo nhiều lựa chọn khác nhau, hỏi sâu hơn · cần cấu hình cao hơn bản Nhanh.',
    downloadUrl: 'https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/1a02dbed1cdfe73efc3fa519c54126befb4faf68/Qwen3.5-4B-Q4_K_M.gguf',
    sizeBytes: 2740937888,
    sha256: '00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4',
    sourceUrl: 'https://huggingface.co/unsloth/Qwen3.5-4B-GGUF',
    licenseName: QWEN_LICENSE,
    licenseUrl: 'https://huggingface.co/Qwen/Qwen3.5-4B/blob/main/LICENSE',
    hardware: {
      minimumRamBytes: 8 * 1024 ** 3,
      recommendedRamBytes: 12 * 1024 ** 3,
      recommendedCpuThreads: 8,
      gpu: { supported: false, required: false, recommendedLayers: 0 },
      supportedLanguages: ['Tiếng Việt', 'Tiếng Anh', 'Đa ngôn ngữ'],
      expectedResult: 'Thường giữ được nhiều ngữ cảnh hơn các model nhỏ khi phân tích tài liệu, đổi lại cần nhiều RAM và thời gian CPU; vẫn có thể sai và phải được giáo viên duyệt.'
    }
  }
];

export const LLAMA_CPP_RUNTIME = {
  version: 'b11681',
  downloadUrl: 'https://github.com/ggml-org/llama.cpp/releases/download/b11681/llama-b11681-bin-win-cpu-x64.zip',
  sizeBytes: 19565747,
  sha256: '07006066db26ba20863785ec8fdd55028226c8eafcdb8db5a1484e98ebf01676',
  sourceUrl: 'https://github.com/ggml-org/llama.cpp/releases/tag/b11681'
} as const;

/**
 * The same llama.cpp release, built with the Vulkan backend.
 *
 * Why: the CPU build is limited by prompt prefill on the pilot hardware
 * (22.6 tok/s measured, docs/BENCHMARKS.md O6b), which is the dominant cost of
 * analyzing a long lesson plan. A Vulkan build can offload that work to an
 * integrated GPU, which shares system RAM with the CPU — so it needs no extra
 * VRAM and works on the Intel UHD parts the pilot teachers actually own.
 *
 * Size and digest are the values GitHub publishes for this asset (verified the
 * same way as the CPU entry above: the method was cross-checked against
 * `LLAMA_CPP_RUNTIME`, whose digest matches GitHub exactly).
 */
export const LLAMA_CPP_VULKAN_RUNTIME = {
  version: 'b11681',
  downloadUrl: 'https://github.com/ggml-org/llama.cpp/releases/download/b11681/llama-b11681-bin-win-vulkan-x64.zip',
  sizeBytes: 32209242,
  sha256: '059a995618a5b7163c64e88d16bf395280f45cd0460c2a71b05e2aae5ada8a00',
  sourceUrl: 'https://github.com/ggml-org/llama.cpp/releases/tag/b11681'
} as const;

export function getLocalModel(id: string): ModelManifestEntry {
  const model = QWEN_LOCAL_MODELS.find(entry => entry.id === id);
  if (!model) throw new Error('Model AI local không nằm trong danh mục đã xác minh.');
  return model;
}

/**
 * What to do when the runtime directory does not hold the backend that was
 * requested for this launch.
 *
 * Background (2026-10-25): a Vulkan archive ships `ggml-cpu-*.dll` next to
 * `ggml-vulkan.dll`, and older detection code could disagree with what had just
 * been installed. The old code threw from the launch path, so a wrong answer
 * took down local AI completely even though a usable CPU build was on disk.
 * Since CPU is the default backend, a GPU/backend mismatch must never be fatal:
 * the launch continues on CPU and the mismatch is reported instead.
 *
 * Returns the backends to try, in order. An empty list means nothing usable is
 * left and the caller must surface a real error.
 */
export function resolveBackendAttempts(input: {
  requestedBackends: readonly string[];
  installedBackend: string | undefined;
  executablePresent: boolean;
}): { attempts: string[]; fellBackToCpu: boolean } {
  const { requestedBackends, installedBackend, executablePresent } = input;
  // No `llama-server.exe` at all: nothing can start, so do not pretend otherwise.
  if (!executablePresent) return { attempts: [], fellBackToCpu: false };

  const wantsGpu = requestedBackends.includes('vulkan');
  // A CPU install can run GPU-free work; a recognised non-CPU install can still
  // be *tried*, because the teacher asked for it. Only an unrecognised layout is
  // treated as "assume CPU works" — that is what keeps a single bad detection
  // from bricking local AI.
  const mismatch = Boolean(installedBackend) && installedBackend !== 'cpu' && installedBackend !== 'vulkan';
  if (!mismatch) {
    return { attempts: [...requestedBackends], fellBackToCpu: false };
  }
  return {
    attempts: wantsGpu ? ['vulkan', 'cpu'] : ['cpu'],
    fellBackToCpu: true
  };
}

export function getLocalModelRecommendation(
  model: ModelManifestEntry,
  machine: MachineCapabilities
): {
  status: 'recommended' | 'possible' | 'not-recommended';
  memoryStatus: 'insufficient' | 'below-recommended' | 'recommended';
  cpuStatus: 'recommended' | 'limited';
  reason: string;
} {
  const memoryStatus = machine.totalRamBytes < model.hardware.minimumRamBytes
    ? 'insufficient'
    : machine.totalRamBytes < model.hardware.recommendedRamBytes
      ? 'below-recommended'
      : 'recommended';
  const cpuStatus = machine.logicalCpuCount >= model.hardware.recommendedCpuThreads
    ? 'recommended'
    : 'limited';
  const enoughCpuToRun = machine.logicalCpuCount >= Math.ceil(model.hardware.recommendedCpuThreads / 2);
  const status = memoryStatus === 'recommended' && cpuStatus === 'recommended'
    ? 'recommended'
    : memoryStatus !== 'insufficient' && enoughCpuToRun
      ? 'possible'
      : 'not-recommended';

  const reasons = [];
  if (memoryStatus === 'insufficient') {
    reasons.push(`RAM thấp hơn mức tối thiểu ${formatMemory(model.hardware.minimumRamBytes)}`);
  } else if (memoryStatus === 'below-recommended') {
    reasons.push(`RAM thấp hơn mức khuyến nghị ${formatMemory(model.hardware.recommendedRamBytes)}`);
  } else {
    reasons.push('RAM đáp ứng mức khuyến nghị');
  }
  if (cpuStatus === 'limited') {
    reasons.push(`CPU có ${machine.logicalCpuCount}/${model.hardware.recommendedCpuThreads} luồng khuyến nghị`);
  } else {
    reasons.push(`CPU đáp ứng ${model.hardware.recommendedCpuThreads} luồng khuyến nghị`);
  }

  return {
    status,
    memoryStatus,
    cpuStatus,
    reason: reasons.join('; ') + '.'
  };
}

/**
 * Models first-run setup may pick automatically, weakest first.
 *
 * Anything not listed here can still be selected by the teacher in Settings →
 * Model (the choice is shared with the wizard), but no code path may install it
 * on its own:
 * - Gemma 4 E2B (2.9 GB) has not been measured on pilot hardware yet, so making
 *   it the automatic pick could hand a teacher a very slow first run;
 * - the larger models cost a multi-gigabyte wait before the app can be tried.
 */
const AUTO_INSTALL_MODEL_IDS: readonly string[] = [
  'qwen3.5-2b-q4_k_m',
  'qwen3.5-4b-q4_k_m'
];

/**
 * Chosen by RAM/CPU between the auto-installable models, strongest first.
 *
 * The last resort is `QWEN_LOCAL_MODELS[0]` (2B): a machine whose RAM/CPU is
 * unknown or too weak for anything must not be handed a 2.7-2.9 GB download.
 */
export function recommendLocalModelId(machine: MachineCapabilities): string {
  const models = QWEN_LOCAL_MODELS.filter(model => AUTO_INSTALL_MODEL_IDS.includes(model.id)).reverse();
  return models.find(model =>
    getLocalModelRecommendation(model, machine).status === 'recommended'
  )?.id ?? models.find(model =>
    getLocalModelRecommendation(model, machine).status === 'possible'
  )?.id ?? QWEN_LOCAL_MODELS[0].id;
}

function formatMemory(bytes: number): string {
  return `${(bytes / 1024 ** 3).toLocaleString('vi-VN', { maximumFractionDigits: 0 })} GB`;
}
