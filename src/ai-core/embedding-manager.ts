/**
 * Embedding runtime + client (O4).
 *
 * A second llama-server process, started with `--embedding --pooling mean`, is
 * used only to turn text into vectors. It never generates text and shares the
 * already-installed llama.cpp binary; the chat model keeps its own process.
 *
 * Why a separate process instead of reusing the chat runtime:
 *  - `--embedding` changes the server's whole request/response contract;
 *  - an embedding model has a different context (512) and no sampling flags;
 *  - a crash or restart of the embedder must not interrupt a chat generation.
 *
 * Requests go to the OpenAI-compatible `POST /v1/embeddings`. Vectors are L2
 * normalised by the server (`--embd-normalize 2`), so cosine similarity is a dot
 * product, but `cosineSimilarity` still divides by the norms so it stays correct
 * if that flag ever changes.
 */
import { AIManager, type AiManagerOptions } from './ai-manager';
import type { LocalAiRuntimeOptions } from './contracts';

export type EmbeddingErrorCode = 'EMBEDDING_NOT_READY' | 'EMBEDDING_HTTP' | 'EMBEDDING_INVALID_RESPONSE' | 'EMBEDDING_DIMENSION';

export class EmbeddingError extends Error {
  readonly code: EmbeddingErrorCode;

  constructor(code: EmbeddingErrorCode, message: string) {
    super(message);
    this.name = 'EmbeddingError';
    this.code = code;
  }
}

/** Arguments for a dedicated embedding server (no sampling, embeddings only). */
export function buildEmbeddingServerArguments(
  modelPath: string,
  runtimeOptions: LocalAiRuntimeOptions,
  pooling: 'mean' | 'cls' = 'mean'
): string[] {
  return [
    '--model', modelPath,
    '--alias', runtimeOptions.modelId,
    '--host', runtimeOptions.host,
    '--port', String(runtimeOptions.port),
    '--ctx-size', String(runtimeOptions.contextSize),
    '--threads', String(runtimeOptions.cpuThreads),
    '--n-gpu-layers', String(runtimeOptions.gpuLayers),
    '--embedding',
    '--pooling', pooling,
    '--embd-normalize', '2'
  ];
}

export interface EmbeddingRuntimeOptions {
  executablePath: string;
  modelPath: string;
  modelId: string;
  dimension: number;
  pooling: 'mean' | 'cls';
  contextLength: number;
  cpuThreads: number;
  startupTimeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface EmbeddingRuntime {
  readonly modelId: string;
  readonly dimension: number;
  start(): Promise<void>;
  stop(): Promise<void>;
  isReady(): boolean;
  embed(texts: string[]): Promise<Float32Array[]>;
}

interface EmbeddingResponse {
  data?: Array<{ embedding?: unknown; index?: number }>;
}

function parseVectors(payload: EmbeddingResponse, expected: number, dimension: number): Float32Array[] {
  const rows = payload && Array.isArray(payload.data) ? payload.data : null;
  if (!rows || rows.length !== expected) {
    throw new EmbeddingError(
      'EMBEDDING_INVALID_RESPONSE',
      `Máy chủ embedding trả về ${rows ? rows.length : 0}/${expected} vector.`
    );
  }
  return rows.map(row => {
    const raw = row && row.embedding;
    if (!Array.isArray(raw) || raw.length !== dimension) {
      throw new EmbeddingError(
        'EMBEDDING_DIMENSION',
        `Vector embedding không đúng ${dimension} chiều (nhận ${Array.isArray(raw) ? raw.length : 'không phải mảng'}).`
      );
    }
    const vector = new Float32Array(dimension);
    for (let position = 0; position < dimension; position += 1) {
      const value = Number(raw[position]);
      if (!Number.isFinite(value)) {
        throw new EmbeddingError('EMBEDDING_INVALID_RESPONSE', 'Vector embedding chứa giá trị không hợp lệ.');
      }
      vector[position] = value;
    }
    return vector;
  });
}

export function createEmbeddingRuntime(options: EmbeddingRuntimeOptions): EmbeddingRuntime {
  const fetcher = options.fetchImpl ?? fetch;
  const managerOptions: AiManagerOptions = {
    executablePath: options.executablePath,
    modelPath: options.modelPath,
    modelId: options.modelId,
    contextSize: options.contextLength,
    cpuThreads: options.cpuThreads,
    gpuLayers: 0,
    // A 131 MB BERT loads in well under a second on this class of machine; keep
    // the timeout short so a broken model degrades to lexical retrieval quickly.
    startupTimeoutMs: options.startupTimeoutMs ?? 60_000
  };
  const manager = new AIManager(managerOptions, {
    buildArguments: (modelPath, runtimeOptions) => buildEmbeddingServerArguments(modelPath, runtimeOptions, options.pooling)
  });

  return {
    modelId: options.modelId,
    dimension: options.dimension,
    start: async () => {
      await manager.start();
    },
    stop: async () => {
      await manager.stop();
    },
    isReady: () => manager.getStatus().state === 'READY',
    embed: async (texts: string[]) => {
      const input = (texts || []).map(text => String(text ?? ''));
      if (!input.length) return [];
      if (manager.getStatus().state !== 'READY') {
        throw new EmbeddingError('EMBEDDING_NOT_READY', 'Máy chủ embedding chưa sẵn sàng.');
      }
      const response = await fetcher(`${manager.getBaseUrl()}/v1/embeddings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: options.modelId, input }),
        signal: AbortSignal.timeout(120_000)
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new EmbeddingError(
          'EMBEDDING_HTTP',
          `Máy chủ embedding trả về HTTP ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}.`
        );
      }
      return parseVectors((await response.json()) as EmbeddingResponse, input.length, options.dimension);
    }
  };
}

/** Splits texts into fixed-size batches (measured before choosing the size, O6). */
export function chunkTextsForEmbedding<T>(items: T[], batchSize: number): T[][] {
  const size = Math.max(1, Math.round(Number(batchSize) || 1));
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}
