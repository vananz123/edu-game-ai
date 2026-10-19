/**
 * Embedding model catalog (O4 of docs/update-AI-local.txt).
 *
 * One small multilingual sentence-embedding model is enough to rank lesson
 * chunks by meaning instead of shared words. It runs in a **separate**
 * llama-server process started with `--embedding`, so the chat model's flags,
 * context and quantisation stay untouched (DECISIONS #20).
 *
 * Every field here is verifiable: pinned commit URL, exact byte size, SHA-256 of
 * the file and the licence of the upstream model. The manifest intentionally
 * keeps the same shape as `ModelManifestEntry` so the existing, already-tested
 * `ModelInstaller` (resume + verify) downloads it; the extra fields describe how
 * to talk to the model.
 */
import type { ModelManifestEntry } from './contracts';

export interface EmbeddingModelManifest extends ModelManifestEntry {
  /** Vector length this model produces. */
  dimension: number;
  /** Context window the GGUF was converted with. */
  contextLength: number;
  /** Pooling used by the server (`--pooling`). */
  pooling: 'mean' | 'cls';
  /** Prefix required before each text; empty for MiniLM. */
  promptPrefix: string;
}

export const EMBEDDING_MODEL_ID = 'minilm-multilingual-l12-v2-q8_0';

export const EMBEDDING_MODELS: readonly EmbeddingModelManifest[] = [
  {
    id: EMBEDDING_MODEL_ID,
    version: 'a964c09982b6',
    displayName: 'MiniLM Multilingual L12 v2 · Q8_0',
    friendlyName: 'Bộ đọc hiểu giáo án (đa ngôn ngữ)',
    tagline: 'Chuyển đoạn giáo án thành vector 384 chiều để tìm đúng phần liên quan; không sinh chữ.',
    downloadUrl:
      'https://huggingface.co/mykor/paraphrase-multilingual-MiniLM-L12-v2.gguf/resolve/a964c09982b6e28b13646d5f9860b8a04f4182c4/paraphrase-multilingual-MiniLM-L12-118M-v2-Q8_0.gguf',
    sizeBytes: 132438304,
    sha256: '1bcc1fd3f65d1269f8e733218d77ac5a479796fade0e87257606c2c4f2854662',
    sourceUrl: 'https://huggingface.co/mykor/paraphrase-multilingual-MiniLM-L12-v2.gguf',
    licenseName: 'Apache-2.0',
    licenseUrl:
      'https://huggingface.co/mykor/paraphrase-multilingual-MiniLM-L12-v2.gguf/blob/main/README.md',
    hardware: {
      minimumRamBytes: 2 * 1024 ** 3,
      recommendedRamBytes: 4 * 1024 ** 3,
      recommendedCpuThreads: 4,
      gpu: { supported: false, required: false, recommendedLayers: 0 },
      supportedLanguages: ['Tiếng Việt', 'Tiếng Anh', 'Đa ngôn ngữ'],
      expectedResult:
        'Chỉ dùng để xếp hạng đoạn giáo án theo mức liên quan. Không sinh nội dung, không thay thế model Qwen, và không gửi dữ liệu ra ngoài.'
    },
    dimension: 384,
    contextLength: 512,
    pooling: 'mean',
    promptPrefix: ''
  }
];

export function getEmbeddingModel(id: string = EMBEDDING_MODEL_ID): EmbeddingModelManifest {
  const model = EMBEDDING_MODELS.find(entry => entry.id === id);
  if (!model) throw new Error('Model embedding không nằm trong danh mục đã xác minh.');
  return model;
}

/** Same naming rule as `ModelInstaller` (`<id>-<version>.gguf`). */
export function embeddingModelFileName(model: EmbeddingModelManifest): string {
  return `${model.id}-${model.version}.gguf`;
}

/** Text sent to the model: heading first, then the chunk body. */
export function embeddingTextForChunk(chunk: { heading?: string | null; text: string }, model: EmbeddingModelManifest): string {
  const heading = chunk.heading ? String(chunk.heading).trim() : '';
  const body = String(chunk.text || '').trim();
  const joined = heading ? `${heading}\n${body}` : body;
  return `${model.promptPrefix}${joined}`;
}
