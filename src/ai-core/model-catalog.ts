import type { MachineCapabilities, ModelManifestEntry } from './contracts';

const QWEN_LICENSE = 'Apache-2.0';

export const QWEN_LOCAL_MODELS: readonly ModelManifestEntry[] = [
  {
    id: 'qwen3.5-2b-q4_0',
    version: '31e04817b38d',
    displayName: 'Qwen3.5 2B · Q4_0',
    friendlyName: 'Bản Nhanh — phù hợp máy yếu',
    tagline: 'Nhanh, tự động, phù hợp máy yếu · trả lời gọn, ít tốn RAM/CPU.',
    downloadUrl: 'https://huggingface.co/unsloth/Qwen3.5-2B-GGUF/resolve/31e04817b38d226cdd13454bcc3982ebaa5a386b/Qwen3.5-2B-Q4_0.gguf',
    sizeBytes: 1214873856,
    sha256: 'cd70221bebaee0503e0f6717e174250cd7825aa88438b3aabec9ad55731d9bb1',
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
    id: 'qwen3.5-4b-q4_0',
    version: '1a02dbed1cd',
    displayName: 'Qwen3.5 4B · Q4_0',
    friendlyName: 'Bản Linh hoạt — nhiều lựa chọn hơn',
    tagline: 'Có thể tạo nhiều lựa chọn khác nhau, hỏi sâu hơn · cần cấu hình cao hơn bản Nhanh.',
    downloadUrl: 'https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/1a02dbed1cdfe73efc3fa519c54126befb4faf68/Qwen3.5-4B-Q4_0.gguf',
    sizeBytes: 2583221408,
    sha256: '298fcb5fe7a77ccc79745ae24751560c5ac56874caff4bb39b1f2055bd72b8bb',
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
  },
  {
    id: 'qwen2.5-7b-q4_0',
    version: '9e3ee5dac408',
    displayName: 'Qwen2.5 7B · Q4_0',
    friendlyName: 'Bản Chuyên sâu — phân tích tài liệu',
    tagline: 'Phân tích, hỏi đáp và tổng hợp tài liệu tốt nhất · yêu cầu cấu hình mạnh, chạy chậm hơn.',
    downloadUrl: 'https://huggingface.co/bartowski/Qwen2.5-7B-Instruct-GGUF/resolve/9e3ee5dac4088da4ba0daeaed3307ad0a79fce4b/Qwen2.5-7B-Instruct-Q4_0.gguf',
    sizeBytes: 4444121600,
    sha256: '08a87f62e92ab5043837959fc3d15cafb94dc202fc9128ce771bc37525025aed',
    sourceUrl: 'https://huggingface.co/bartowski/Qwen2.5-7B-Instruct-GGUF',
    licenseName: QWEN_LICENSE,
    licenseUrl: 'https://huggingface.co/Qwen/Qwen2.5-7B-Instruct/blob/main/LICENSE',
    hardware: {
      minimumRamBytes: 12 * 1024 ** 3,
      recommendedRamBytes: 16 * 1024 ** 3,
      recommendedCpuThreads: 8,
      gpu: { supported: false, required: false, recommendedLayers: 0 },
      supportedLanguages: ['Tiếng Việt', 'Tiếng Anh', 'Đa ngôn ngữ'],
      expectedResult: 'Model lớn nhất trong danh mục: thường cho tóm tắt, hỏi đáp và bộ câu hỏi bám tài liệu tốt hơn; cần RAM và thời gian CPU nhiều nhất, giáo viên vẫn phải duyệt nội dung.'
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

export function getLocalModel(id: string): ModelManifestEntry {
  const model = QWEN_LOCAL_MODELS.find(entry => entry.id === id);
  if (!model) throw new Error('Model AI local không nằm trong danh mục đã xác minh.');
  return model;
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

export function recommendLocalModelId(machine: MachineCapabilities): string {
  const models = [...QWEN_LOCAL_MODELS].reverse();
  return models.find(model =>
    getLocalModelRecommendation(model, machine).status === 'recommended'
  )?.id ?? models.find(model =>
    getLocalModelRecommendation(model, machine).status === 'possible'
  )?.id ?? QWEN_LOCAL_MODELS[0].id;
}

function formatMemory(bytes: number): string {
  return `${(bytes / 1024 ** 3).toLocaleString('vi-VN', { maximumFractionDigits: 0 })} GB`;
}
