/**
 * Additive storage for the AI-assisted lesson-to-game workflow.
 *
 * This module owns four sidecar tables (`lesson_documents`, `lesson_analyses`,
 * `game_recommendations`, `game_projects`) plus the lesson text files. It never
 * touches `games`/`sessions` and never uses the whole-table `DELETE` pattern of
 * `saveDb`; every write is a targeted upsert inside a transaction.
 *
 * O3 adds a fifth sidecar table, `lesson_chunks`, caching the chunked lesson so
 * generation can retrieve a relevant slice instead of re-chunking on every run.
 */
import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { EducationalGame } from '../shared/types';
import type {
  GameConfig,
  GameDraft,
  GameProject,
  LessonAnalysis,
  LessonDocument,
  GameRecommendation
} from '../shared/lesson-types';
import type { LessonChunk } from './lesson-chunker';
import { LESSON_SCHEMA_VERSION } from '../shared/lesson-types';
import { parseGameConfig, parseGameDraft } from './lesson-contracts';
import {
  validateMatchingGame,
  validateRaceGame,
  validateScenarioGame,
  validateTreasureHuntGame
} from './game-validation';

export const LESSON_STORE_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS lesson_documents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    ext TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    characters INTEGER NOT NULL,
    text_rel_path TEXT NOT NULL,
    sha256 TEXT,
    schema_version INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS lesson_analyses (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    data_json TEXT NOT NULL,
    schema_version INTEGER NOT NULL,
    cache_key TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (document_id) REFERENCES lesson_documents(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS game_recommendations (
    id TEXT PRIMARY KEY,
    analysis_id TEXT NOT NULL,
    data_json TEXT NOT NULL,
    schema_version INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (analysis_id) REFERENCES lesson_analyses(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS game_projects (
    id TEXT PRIMARY KEY,
    game_id TEXT,
    status TEXT NOT NULL,
    step TEXT NOT NULL,
    data_json TEXT NOT NULL,
    schema_version INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_game_projects_updated_at ON game_projects(updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_lesson_analyses_document ON lesson_analyses(document_id);
  CREATE INDEX IF NOT EXISTS idx_game_recommendations_analysis ON game_recommendations(analysis_id);
  -- O3: cached chunks per document (retrieval input). Embedding columns are
  -- nullable now so O4 can fill them without another schema change.
  CREATE TABLE IF NOT EXISTS lesson_chunks (
    document_id TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    text TEXT NOT NULL,
    heading TEXT,
    char_start INTEGER NOT NULL,
    char_end INTEGER NOT NULL,
    token_count INTEGER NOT NULL DEFAULT 0,
    embedding BLOB,
    embedding_model TEXT,
    embedding_dim INTEGER,
    PRIMARY KEY (document_id, chunk_index),
    FOREIGN KEY (document_id) REFERENCES lesson_documents(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_lesson_chunks_document ON lesson_chunks(document_id);
  -- O5: generated content cache (one row per document/analysis/config/model key).
  -- Drafts are also stored on the project; this table lets a *second* generation
  -- with identical inputs reuse the content instead of calling the model again.
  CREATE TABLE IF NOT EXISTS ai_generation_cache (
    cache_key TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    game_type TEXT,
    analysis_id TEXT,
    model_id TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_ai_generation_cache_created ON ai_generation_cache(created_at DESC);
  -- update_plan_3 §8: central AI task history (queued/running/completed/failed/cancelled).
  -- Only summaries live here; full payloads stay in their own tables. Rows are
  -- history after a restart and must never be reported as still running.
  CREATE TABLE IF NOT EXISTS ai_tasks (
    task_id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    project_id TEXT,
    document_id TEXT,
    label TEXT NOT NULL,
    state TEXT NOT NULL,
    progress TEXT NOT NULL DEFAULT 'running',
    error_code TEXT,
    error_message TEXT,
    result_summary TEXT,
    started_at TEXT NOT NULL,
    finished_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_ai_tasks_request ON ai_tasks(request_id);
  CREATE INDEX IF NOT EXISTS idx_ai_tasks_started ON ai_tasks(started_at DESC);
`;

export type LessonStoreErrorCode =
  | 'STORE_SCHEMA_MISSING'
  | 'STORE_INVALID_PROJECT'
  | 'STORE_INVALID_ANALYSIS'
  | 'STORE_INVALID_RECOMMENDATION'
  | 'STORE_INVALID_DOCUMENT'
  | 'STORE_CORRUPT_JSON'
  | 'STORE_DOCUMENT_MISSING'
  | 'STORE_DOCUMENT_FILE_MISSING'
  | 'STORE_VERSION_UNSUPPORTED'
  | 'PROJECT_VERSION_UNSUPPORTED'
  | 'PROJECT_MIGRATION_MISSING'
  | 'PROJECT_SNAPSHOT_INVALID'
  | 'ANALYSIS_VERSION_UNSUPPORTED';

export class LessonStoreError extends Error {
  readonly code: LessonStoreErrorCode;
  readonly details: string[];

  constructor(code: LessonStoreErrorCode, message: string, details: string[] = []) {
    super(message);
    this.name = 'LessonStoreError';
    this.code = code;
    this.details = details;
  }
}

/** Minimal structural view of a better-sqlite3 database (keeps this module testable). */
export interface LessonStoreDatabase {
  prepare(sql: string): {
    run(...params: unknown[]): unknown;
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
  exec(sql: string): void;
  transaction<T extends (...args: never[]) => unknown>(fn: T): T;
}

export interface LessonStoreOptions {
  db: LessonStoreDatabase;
  /** Directory where lesson text files are written (`userData/lessons`). */
  lessonsDir: string;
}

export interface SaveLessonDocumentInput {
  documentId?: string;
  name: string;
  ext: string;
  sizeBytes?: number;
  text: string;
  characters?: number;
}

export interface StoredLessonDocument extends LessonDocument {
  textRelPath: string;
  sha256: string | null;
}

export interface LessonDocumentWithText extends StoredLessonDocument {
  text: string;
}

/** Browse/reopen projection for the "Giáo án" page (no text body). */
export interface LessonDocumentSummary extends StoredLessonDocument {
  sourceAvailable: boolean;
  analyses: LessonAnalysis[];
}

/** A cached chunk row (O3). */
export interface StoredLessonChunk extends LessonChunk {
  documentId: string;
  tokenCount: number;
  embeddingModel: string | null;
  embeddingDim: number | null;
}

/** O5: row shape of `ai_generation_cache`. */
export interface GenerationCacheEntry {
  cacheKey: string;
  kind: string;
  gameType: string | null;
  analysisId: string | null;
  modelId: string;
  promptVersion: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface PutGenerationCacheInput {
  cacheKey: string;
  kind?: string;
  gameType: string;
  analysisId?: string | null;
  modelId: string;
  promptVersion: string;
  payload: unknown;
}

/** update_plan_3 §8: persisted AI task history row (summaries only). */
export interface StoredAiTask {
  taskId: string;
  requestId: string;
  kind: string;
  projectId: string | null;
  documentId: string | null;
  label: string;
  state: string;
  progress: string;
  errorCode: string | null;
  errorMessage: string | null;
  resultSummary: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface SaveAiTaskInput {
  taskId: string;
  requestId: string;
  kind: string;
  projectId?: string | null;
  documentId?: string | null;
  label: string;
  state: string;
  progress?: string;
  errorCode?: string | null;
  errorMessage?: string | null;
  resultSummary?: string | null;
  startedAt: string;
  finishedAt?: string | null;
}

interface AiTaskRow {
  task_id: string;
  request_id: string;
  kind: string;
  project_id: string | null;
  document_id: string | null;
  label: string;
  state: string;
  progress: string;
  error_code: string | null;
  error_message: string | null;
  result_summary: string | null;
  started_at: string;
  finished_at: string | null;
}

interface ChunkRow {
  document_id: string;
  chunk_index: number;
  text: string;
  heading: string | null;
  char_start: number;
  char_end: number;
  token_count: number;
  embedding_model: string | null;
  embedding_dim: number | null;
}

interface DocumentRow {
  id: string;
  name: string;
  ext: string;
  size_bytes: number;
  characters: number;
  text_rel_path: string;
  sha256: string | null;
  schema_version: number;
  created_at: string;
}

interface ProjectRow {
  id: string;
  game_id: string | null;
  status: string;
  step: string;
  data_json: string;
  schema_version: number;
  created_at: string;
  updated_at: string;
}

interface AnalysisRow {
  id: string;
  document_id: string;
  data_json: string;
  schema_version: number;
  cache_key?: string | null;
  created_at: string;
  updated_at: string;
}

interface GenerationCacheRow {
  cache_key: string;
  kind: string;
  game_type: string | null;
  analysis_id: string | null;
  model_id: string;
  prompt_version: string;
  payload_json: string;
  created_at: string;
}

interface RecommendationRow {
  id: string;
  analysis_id: string;
  data_json: string;
  schema_version: number;
  created_at: string;
}

const PROJECT_STATUSES = new Set(['draft', 'review', 'ready']);
const PROJECT_STEPS = new Set(['input', 'analyze', 'recommend', 'configure', 'generate', 'edit', 'done']);

export class LessonStore {
  private readonly db: LessonStoreDatabase;
  private readonly lessonsDir: string;

  constructor(options: LessonStoreOptions) {
    if (!options || !options.db) {
      throw new LessonStoreError('STORE_SCHEMA_MISSING', 'Chưa có kết nối cơ sở dữ liệu cho kho giáo án.');
    }
    this.db = options.db;
    this.lessonsDir = options.lessonsDir;
  }

  ensureSchema(): void {
    this.db.exec(LESSON_STORE_SCHEMA_SQL);
    this.migrateSchema();
  }

  /**
   * Additive migrations for databases created before O5. `CREATE TABLE IF NOT
   * EXISTS` cannot add a column, so the analysis cache key needs an explicit
   * `ALTER TABLE`. The index is created afterwards because the DDL block runs
   * before the column exists on older databases.
   */
  private migrateSchema(): void {
    const columns = this.db.prepare('PRAGMA table_info(lesson_analyses)').all() as Array<{ name?: string }>;
    if (!columns.some(column => column && column.name === 'cache_key')) {
      this.db.exec('ALTER TABLE lesson_analyses ADD COLUMN cache_key TEXT');
    }
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_lesson_analyses_cache ON lesson_analyses(document_id, cache_key)');
  }

  // -------------------------------------------------------------------------
  // Lesson documents
  // -------------------------------------------------------------------------

  async saveDocument(input: SaveLessonDocumentInput): Promise<StoredLessonDocument> {
    assertDocumentInput(input);
    const documentId = input.documentId || newId('doc');
    const text = String(input.text ?? '');
    const ext = normalizeExt(input.ext);
    const relPath = `lessons/${documentId}.txt`;
    const relativePath = path.join('lessons', `${documentId}.txt`);
    const absolutePath = path.join(this.lessonsDir, `${documentId}.txt`);
    await fs.mkdir(this.lessonsDir, { recursive: true });
    await fs.writeFile(absolutePath, text, 'utf8');

    const existing = this.getDocumentRow(documentId);
    const createdAt = existing?.created_at || new Date().toISOString();
    const characters = Number.isFinite(input.characters) && input.characters! >= 0 ? Math.round(input.characters!) : text.length;
    const sizeBytes = Number.isFinite(input.sizeBytes) && input.sizeBytes! >= 0 ? Math.round(input.sizeBytes!) : Buffer.byteLength(text, 'utf8');
    const sha256 = createHash('sha256').update(text, 'utf8').digest('hex');

    this.db.prepare(`
      INSERT INTO lesson_documents (id,name,ext,size_bytes,characters,text_rel_path,sha256,schema_version,created_at)
      VALUES (@id,@name,@ext,@size_bytes,@characters,@text_rel_path,@sha256,@schema_version,@created_at)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name, ext=excluded.ext, size_bytes=excluded.size_bytes,
        characters=excluded.characters, text_rel_path=excluded.text_rel_path,
        sha256=excluded.sha256, schema_version=excluded.schema_version
    `).run({
      id: documentId,
      name: String(input.name),
      ext,
      size_bytes: sizeBytes,
      characters,
      text_rel_path: relPath,
      sha256,
      schema_version: LESSON_SCHEMA_VERSION,
      created_at: createdAt
    });

    return {
      id: documentId,
      schemaVersion: LESSON_SCHEMA_VERSION,
      name: String(input.name),
      ext,
      sizeBytes,
      characters,
      createdAt,
      textRelPath: relativePath.split(path.sep).join('/'),
      sha256
    };
  }

  getDocument(documentId: string): StoredLessonDocument | null {
    const row = this.getDocumentRow(documentId);
    return row ? documentFromRow(row) : null;
  }

  /**
   * Newest first, with every saved analysis attached. The source file is checked
   * here so the UI can explain a missing/unreadable file before the teacher opens
   * it; no document text is loaded.
   */
  async listDocumentLibrary(): Promise<LessonDocumentSummary[]> {
    const rows = this.db.prepare('SELECT * FROM lesson_documents ORDER BY created_at DESC').all() as DocumentRow[];
    const analysisRows = this.db.prepare('SELECT * FROM lesson_analyses ORDER BY updated_at DESC').all() as AnalysisRow[];
    const analysesByDocument = new Map<string, LessonAnalysis[]>();
    for (const row of analysisRows) {
      const list = analysesByDocument.get(row.document_id) || [];
      list.push(parseAnalysisRow(row));
      analysesByDocument.set(row.document_id, list);
    }
    const summaries: LessonDocumentSummary[] = [];
    for (const row of rows) {
      let sourceAvailable = true;
      try {
        await fs.access(path.join(this.lessonsDir, `${row.id}.txt`));
      } catch {
        sourceAvailable = false;
      }
      summaries.push({
        ...documentFromRow(row),
        sourceAvailable,
        analyses: analysesByDocument.get(row.id) || []
      });
    }
    return summaries;
  }

  async getDocumentWithText(documentId: string): Promise<LessonDocumentWithText | null> {
    const row = this.getDocumentRow(documentId);
    if (!row) return null;
    const absolutePath = path.join(this.lessonsDir, `${row.id}.txt`);
    let text: string;
    try {
      text = await fs.readFile(absolutePath, 'utf8');
    } catch {
      throw new LessonStoreError(
        'STORE_DOCUMENT_FILE_MISSING',
        `Không đọc được tệp giáo án của tài liệu ${documentId}.`,
        [absolutePath]
      );
    }
    return { ...documentFromRow(row), text };
  }

  private getDocumentRow(documentId: string): DocumentRow | undefined {
    return this.db.prepare('SELECT * FROM lesson_documents WHERE id = ?').get(documentId) as DocumentRow | undefined;
  }

  // -------------------------------------------------------------------------
  // Lesson chunks (O3)
  // -------------------------------------------------------------------------

  /** Cached chunks of a document, in document order. Empty when never chunked. */
  listChunks(documentId: string): StoredLessonChunk[] {
    if (!documentId) return [];
    const rows = this.db
      .prepare('SELECT * FROM lesson_chunks WHERE document_id = ? ORDER BY chunk_index ASC')
      .all(documentId) as ChunkRow[];
    return rows.map(chunkFromRow);
  }

  countChunks(documentId: string): number {
    if (!documentId) return 0;
    const row = this.db.prepare('SELECT COUNT(*) AS total FROM lesson_chunks WHERE document_id = ?').get(documentId) as
      | { total: number }
      | undefined;
    return row ? Number(row.total) || 0 : 0;
  }

  /**
   * Replaces every chunk of a document. Idempotent: re-chunking the same text
   * produces the same rows, and a re-import cannot leave stale chunks behind.
   */
  replaceChunks(documentId: string, chunks: LessonChunk[]): StoredLessonChunk[] {
    if (!this.getDocumentRow(documentId)) {
      throw new LessonStoreError('STORE_DOCUMENT_MISSING', `Không tìm thấy tài liệu ${documentId} để lưu đoạn.`);
    }
    const rows = (chunks || []).map((chunk, position) => {
      const text = String(chunk.text ?? '').trim();
      if (!text) {
        throw new LessonStoreError('STORE_INVALID_DOCUMENT', 'Đoạn giáo án không được để trống.');
      }
      return {
        index: Number.isFinite(chunk.index) ? Math.round(chunk.index) : position,
        text,
        heading: chunk.heading ? String(chunk.heading) : null,
        charStart: Number.isFinite(chunk.charStart) ? Math.round(chunk.charStart) : 0,
        charEnd: Number.isFinite(chunk.charEnd) ? Math.round(chunk.charEnd) : 0,
        tokenCount: text.split(/\s+/).length
      };
    });
    const write = this.db.transaction(() => {
      this.db.prepare('DELETE FROM lesson_chunks WHERE document_id = ?').run(documentId);
      const insert = this.db.prepare(`
        INSERT INTO lesson_chunks (document_id,chunk_index,text,heading,char_start,char_end,token_count)
        VALUES (@document_id,@chunk_index,@text,@heading,@char_start,@char_end,@token_count)
      `);
      rows.forEach(row =>
        insert.run({
          document_id: documentId,
          chunk_index: row.index,
          text: row.text,
          heading: row.heading,
          char_start: row.charStart,
          char_end: row.charEnd,
          token_count: row.tokenCount
        })
      );
    });
    write();
    return this.listChunks(documentId);
  }

  /**
   * Vectors cached for a document under one embedding model (O4).
   * Vectors from another model are ignored: different dimensions/models are not
   * comparable, so they must be recomputed rather than mixed.
   */
  listChunkEmbeddings(documentId: string, modelId: string): Map<number, Float32Array> {
    const vectors = new Map<number, Float32Array>();
    if (!documentId || !modelId) return vectors;
    const rows = this.db
      .prepare(
        'SELECT chunk_index, embedding, embedding_dim FROM lesson_chunks WHERE document_id = ? AND embedding_model = ? AND embedding IS NOT NULL'
      )
      .all(documentId, modelId) as Array<{ chunk_index: number; embedding: unknown; embedding_dim: number }>;
    rows.forEach(row => {
      const vector = blobToVector(row.embedding, Number(row.embedding_dim));
      if (vector) vectors.set(Number(row.chunk_index), vector);
    });
    return vectors;
  }

  /** Writes vectors for existing chunks; returns how many rows were updated. */
  saveChunkEmbeddings(documentId: string, modelId: string, dimension: number, vectors: Map<number, Float32Array>): number {
    if (!documentId || !modelId) {
      throw new LessonStoreError('STORE_INVALID_DOCUMENT', 'Thiếu thông tin để lưu vector embedding.');
    }
    const dim = Math.round(Number(dimension));
    if (!Number.isInteger(dim) || dim < 1 || dim > 4096) {
      throw new LessonStoreError('STORE_INVALID_DOCUMENT', 'Số chiều vector embedding không hợp lệ.');
    }
    if (!this.getDocumentRow(documentId)) {
      throw new LessonStoreError('STORE_DOCUMENT_MISSING', `Không tìm thấy tài liệu ${documentId} để lưu vector.`);
    }
    const update = this.db.prepare(`
      UPDATE lesson_chunks SET embedding=@embedding, embedding_model=@model, embedding_dim=@dim
      WHERE document_id=@document AND chunk_index=@index
    `);
    let updated = 0;
    // Validate every vector before touching the DB, so a bad batch cannot leave
    // half of the document embedded.
    vectors.forEach((vector, index) => {
      if (!(vector instanceof Float32Array) || vector.length !== dim) {
        throw new LessonStoreError('STORE_INVALID_DOCUMENT', `Vector của đoạn ${index} không đúng ${dim} chiều.`);
      }
    });
    const write = this.db.transaction(() => {
      vectors.forEach((vector, index) => {
        const blob = Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
        const result = update.run({ embedding: blob, model: modelId, dim, document: documentId, index }) as { changes?: number } | undefined;
        if (result && Number(result.changes) > 0) updated += 1;
      });
    });
    write();
    return updated;
  }

  /** Drops cached vectors (all models, or one) without touching the chunk text. */
  clearChunkEmbeddings(documentId: string, modelId?: string): number {
    if (!documentId) return 0;
    const result = modelId
      ? (this.db
          .prepare('UPDATE lesson_chunks SET embedding=NULL, embedding_model=NULL, embedding_dim=NULL WHERE document_id = ? AND embedding_model = ?')
          .run(documentId, modelId) as { changes?: number } | undefined)
      : (this.db
          .prepare('UPDATE lesson_chunks SET embedding=NULL, embedding_model=NULL, embedding_dim=NULL WHERE document_id = ?')
          .run(documentId) as { changes?: number } | undefined);
    return result ? Number(result.changes) || 0 : 0;
  }

  // -------------------------------------------------------------------------
  // Analyses + recommendations
  // -------------------------------------------------------------------------

  saveAnalysis(analysis: LessonAnalysis, options?: { cacheKey?: string }): LessonAnalysis {
    assertAnalysis(analysis);
    const existing = this.getAnalysisRow(analysis.id);
    const createdAt = existing?.created_at || analysis.createdAt || new Date().toISOString();
    const updatedAt = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO lesson_analyses (id,document_id,data_json,schema_version,cache_key,created_at,updated_at)
      VALUES (@id,@document_id,@data_json,@schema_version,@cache_key,@created_at,@updated_at)
      ON CONFLICT(id) DO UPDATE SET
        document_id=excluded.document_id, data_json=excluded.data_json,
        schema_version=excluded.schema_version,
        cache_key=COALESCE(excluded.cache_key, lesson_analyses.cache_key),
        updated_at=excluded.updated_at
    `).run({
      cache_key: options && options.cacheKey ? options.cacheKey : null,
      id: analysis.id,
      document_id: analysis.documentId,
      data_json: JSON.stringify({ ...analysis, createdAt }),
      schema_version: analysis.schemaVersion,
      created_at: createdAt,
      updated_at: updatedAt
    });
    return { ...analysis, createdAt };
  }

  getAnalysis(analysisId: string): LessonAnalysis | null {
    const row = this.getAnalysisRow(analysisId);
    if (!row) return null;
    return parseAnalysisRow(row);
  }

  listAnalyses(documentId: string): LessonAnalysis[] {
    const rows = this.db.prepare('SELECT * FROM lesson_analyses WHERE document_id = ? ORDER BY updated_at DESC')
      .all(documentId) as AnalysisRow[];
    return rows.map(parseAnalysisRow);
  }

  /**
   * O5 analysis cache: the newest analysis saved for this exact key. Keys are
   * built by `lesson-cache.ts` from the document hash, model, mode and prompt
   * version, so a hit means the model would see identical input. Teacher edits
   * to the stored analysis are preserved (they live in the same row).
   */
  findAnalysisByCacheKey(documentId: string, cacheKey: string): LessonAnalysis | null {
    if (!documentId || !cacheKey) return null;
    const row = this.db.prepare(
      'SELECT * FROM lesson_analyses WHERE document_id = ? AND cache_key = ? ORDER BY updated_at DESC LIMIT 1'
    ).get(documentId, cacheKey) as AnalysisRow | undefined;
    return row ? parseAnalysisRow(row) : null;
  }

  // -------------------------------------------------------------------------
  // O5: generated-content cache
  // -------------------------------------------------------------------------

  putGenerationCache(input: PutGenerationCacheInput): GenerationCacheEntry {
    if (!input || !input.cacheKey || !input.gameType || !input.modelId || !input.promptVersion) {
      throw new LessonStoreError('STORE_INVALID_ANALYSIS', 'Thiếu thông tin để lưu bộ nhớ đệm nội dung.');
    }
    const payload = input.payload && typeof input.payload === 'object' && !Array.isArray(input.payload)
      ? (input.payload as Record<string, unknown>)
      : null;
    if (!payload) {
      throw new LessonStoreError('STORE_INVALID_ANALYSIS', 'Bộ nhớ đệm nội dung phải là một đối tượng JSON.');
    }
    const createdAt = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO ai_generation_cache (cache_key,kind,game_type,analysis_id,model_id,prompt_version,payload_json,created_at)
      VALUES (@cache_key,@kind,@game_type,@analysis_id,@model_id,@prompt_version,@payload_json,@created_at)
      ON CONFLICT(cache_key) DO UPDATE SET
        kind=excluded.kind, game_type=excluded.game_type, analysis_id=excluded.analysis_id,
        model_id=excluded.model_id, prompt_version=excluded.prompt_version,
        payload_json=excluded.payload_json, created_at=excluded.created_at
    `).run({
      cache_key: input.cacheKey,
      kind: input.kind || 'draft',
      game_type: input.gameType,
      analysis_id: input.analysisId || null,
      model_id: input.modelId,
      prompt_version: input.promptVersion,
      payload_json: JSON.stringify(payload),
      created_at: createdAt
    });
    return {
      cacheKey: input.cacheKey,
      kind: input.kind || 'draft',
      gameType: input.gameType,
      analysisId: input.analysisId || null,
      modelId: input.modelId,
      promptVersion: input.promptVersion,
      payload,
      createdAt
    };
  }

  /**
   * Returns null for a missing *or* corrupt row: a broken cache must never block
   * generation, so the bad row is dropped and the caller regenerates normally.
   */
  getGenerationCache(cacheKey: string): GenerationCacheEntry | null {
    if (!cacheKey) return null;
    const row = this.db.prepare('SELECT * FROM ai_generation_cache WHERE cache_key = ?').get(cacheKey) as GenerationCacheRow | undefined;
    if (!row) return null;
    let payload: unknown;
    try {
      payload = JSON.parse(row.payload_json);
    } catch (error) {
      this.deleteGenerationCache(cacheKey);
      return null;
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      this.deleteGenerationCache(cacheKey);
      return null;
    }
    return {
      cacheKey: row.cache_key,
      kind: row.kind,
      gameType: row.game_type || null,
      analysisId: row.analysis_id || null,
      modelId: row.model_id,
      promptVersion: row.prompt_version,
      payload: payload as Record<string, unknown>,
      createdAt: row.created_at
    };
  }

  deleteGenerationCache(cacheKey: string): boolean {
    if (!cacheKey) return false;
    const result = this.db.prepare('DELETE FROM ai_generation_cache WHERE cache_key = ?').run(cacheKey) as { changes?: number };
    return Boolean(result && result.changes);
  }

  /** Keeps the newest `keep` rows; the cache is a convenience, not a record. */
  pruneGenerationCache(keep = 50): number {
    const limit = Number.isFinite(keep) && Number(keep) >= 1 ? Math.floor(Number(keep)) : 50;
    const result = this.db.prepare(`
      DELETE FROM ai_generation_cache WHERE cache_key NOT IN (
        SELECT cache_key FROM ai_generation_cache ORDER BY created_at DESC LIMIT ?
      )
    `).run(limit) as { changes?: number };
    return result ? Number(result.changes) || 0 : 0;
  }

  clearGenerationCache(): number {
    const result = this.db.prepare('DELETE FROM ai_generation_cache').run() as { changes?: number };
    return result ? Number(result.changes) || 0 : 0;
  }

  // -------------------------------------------------------------------------
  // update_plan_3 §8: central AI task history (summaries only, additive)
  // -------------------------------------------------------------------------

  saveAiTask(input: SaveAiTaskInput): StoredAiTask {
    if (!input || !input.taskId || !input.requestId || !input.kind || !input.label || !input.state || !input.startedAt) {
      throw new LessonStoreError('STORE_INVALID_ANALYSIS', 'Thiếu thông tin để lưu lịch sử tác vụ AI.');
    }
    this.db.prepare(`
      INSERT INTO ai_tasks (task_id,request_id,kind,project_id,document_id,label,state,progress,error_code,error_message,result_summary,started_at,finished_at)
      VALUES (@task_id,@request_id,@kind,@project_id,@document_id,@label,@state,@progress,@error_code,@error_message,@result_summary,@started_at,@finished_at)
      ON CONFLICT(task_id) DO UPDATE SET
        request_id=excluded.request_id, kind=excluded.kind, project_id=excluded.project_id,
        document_id=excluded.document_id, label=excluded.label, state=excluded.state,
        progress=excluded.progress, error_code=excluded.error_code, error_message=excluded.error_message,
        result_summary=excluded.result_summary, started_at=excluded.started_at, finished_at=excluded.finished_at
    `).run({
      task_id: input.taskId,
      request_id: input.requestId,
      kind: input.kind,
      project_id: input.projectId || null,
      document_id: input.documentId || null,
      label: input.label,
      state: input.state,
      progress: input.progress || 'running',
      error_code: input.errorCode || null,
      error_message: input.errorMessage || null,
      result_summary: input.resultSummary || null,
      started_at: input.startedAt,
      finished_at: input.finishedAt || null
    });
    const saved = this.getAiTask(input.taskId);
    if (!saved) throw new LessonStoreError('STORE_INVALID_ANALYSIS', `Không lưu được tác vụ AI ${input.taskId}.`);
    return saved;
  }

  getAiTask(taskId: string): StoredAiTask | null {
    if (!taskId) return null;
    const row = this.db.prepare('SELECT * FROM ai_tasks WHERE task_id = ?').get(taskId) as AiTaskRow | undefined;
    return row ? aiTaskFromRow(row) : null;
  }

  /**
   * One page of AI task history, newest first (#121). `offset` is clamped to a whole
   * row so a page number cannot produce a fractional LIMIT/OFFSET.
   */
  listAiTasks(limit = 50, offset = 0): StoredAiTask[] {
    const capped = Number.isFinite(limit) && limit >= 1 ? Math.min(200, Math.floor(limit)) : 50;
    const skip = Number.isFinite(offset) && offset > 0 ? Math.min(1e6, Math.floor(offset)) : 0;
    const rows = this.db.prepare('SELECT * FROM ai_tasks ORDER BY started_at DESC LIMIT ? OFFSET ?').all(capped, skip) as AiTaskRow[];
    return rows.map(aiTaskFromRow);
  }

  /** Number of stored AI tasks (for page counts). */
  countAiTasks(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM ai_tasks').get() as { n?: number } | undefined;
    return Number(row && row.n) || 0;
  }

  pruneAiTasks(keep = 200): number {
    const limit = Number.isFinite(keep) && Number(keep) >= 1 ? Math.floor(Number(keep)) : 200;
    const result = this.db.prepare(`
      DELETE FROM ai_tasks WHERE task_id NOT IN (
        SELECT task_id FROM ai_tasks ORDER BY started_at DESC LIMIT ?
      )
    `).run(limit) as { changes?: number };
    return result ? Number(result.changes) || 0 : 0;
  }

  saveRecommendations(analysisId: string, recommendations: GameRecommendation[]): GameRecommendation[] {
    if (!analysisId) {
      throw new LessonStoreError('STORE_INVALID_RECOMMENDATION', 'Thiếu mã phân tích cho danh sách đề xuất.');
    }
    if (!this.getAnalysisRow(analysisId)) {
      throw new LessonStoreError('STORE_INVALID_RECOMMENDATION', `Không tìm thấy phân tích ${analysisId} để lưu đề xuất.`);
    }
    recommendations.forEach(assertRecommendation);
    const replace = this.db.transaction((items: GameRecommendation[]) => {
      this.db.prepare('DELETE FROM game_recommendations WHERE analysis_id = ?').run(analysisId);
      const insert = this.db.prepare(`
        INSERT INTO game_recommendations (id,analysis_id,data_json,schema_version,created_at)
        VALUES (@id,@analysis_id,@data_json,@schema_version,@created_at)
      `);
      for (const item of items) {
        insert.run({
          id: item.id,
          analysis_id: analysisId,
          data_json: JSON.stringify(item),
          schema_version: item.schemaVersion,
          created_at: item.createdAt || new Date().toISOString()
        });
      }
    });
    replace(recommendations);
    return recommendations;
  }

  listRecommendations(analysisId: string): GameRecommendation[] {
    const rows = this.db.prepare('SELECT * FROM game_recommendations WHERE analysis_id = ? ORDER BY created_at ASC')
      .all(analysisId) as RecommendationRow[];
    return rows.map(parseRecommendationRow);
  }

  private getAnalysisRow(analysisId: string): AnalysisRow | undefined {
    return this.db.prepare('SELECT * FROM lesson_analyses WHERE id = ?').get(analysisId) as AnalysisRow | undefined;
  }

  // -------------------------------------------------------------------------
  // Projects
  // -------------------------------------------------------------------------

  saveProject(project: GameProject): GameProject {
    const validated = validateProjectForWrite(project);
    const existing = this.getProjectRow(validated.id);
    const createdAt = existing?.created_at || validated.createdAt || new Date().toISOString();
    const updatedAt = new Date().toISOString();
    const saved: GameProject = { ...validated, createdAt, updatedAt };
    this.db.prepare(`
      INSERT INTO game_projects (id,game_id,status,step,data_json,schema_version,created_at,updated_at)
      VALUES (@id,@game_id,@status,@step,@data_json,@schema_version,@created_at,@updated_at)
      ON CONFLICT(id) DO UPDATE SET
        game_id=excluded.game_id, status=excluded.status, step=excluded.step,
        data_json=excluded.data_json, schema_version=excluded.schema_version, updated_at=excluded.updated_at
    `).run({
      id: saved.id,
      game_id: saved.gameId,
      status: saved.status,
      step: saved.step,
      data_json: JSON.stringify(saved),
      schema_version: saved.schemaVersion,
      created_at: createdAt,
      updated_at: updatedAt
    });
    return saved;
  }

  getProject(projectId: string): GameProject | null {
    const row = this.getProjectRow(projectId);
    if (!row) return null;
    return parseProjectRow(row);
  }

  listProjects(): GameProject[] {
    const rows = this.db.prepare('SELECT * FROM game_projects ORDER BY updated_at DESC').all() as ProjectRow[];
    return rows.map(parseProjectRow);
  }

  deleteProject(projectId: string): boolean {
    const result = this.db.prepare('DELETE FROM game_projects WHERE id = ?').run(projectId) as { changes?: number };
    return Boolean(result && result.changes);
  }

  /**
   * Deletes a lesson document and everything derived from it (#119).
   *
   * The schema declares `ON DELETE CASCADE`, but that only fires when the connection
   * has `PRAGMA foreign_keys = ON`; deleting the parent without it would leave the
   * analyses, recommendations and chunks behind forever (invisible, but still counted
   * by retrieval). So the dependent rows are removed explicitly, in one transaction,
   * child-first. Games already saved in the library are kept: they are independent
   * rows the teacher may still want.
   *
   * `voidIO: true` skips the best-effort file removal, so the store stays synchronous
   * for tests that never created a text file.
   */
  /**
   * Deletes several lesson documents (#122). Each one goes through `deleteDocument`,
   * so the same child-first cleanup applies, and a failure on one does not silently
   * stop the others: the counts say exactly what happened.
   */
  async deleteDocuments(
    documentIds: string[],
    options: { voidIO?: boolean } = {}
  ): Promise<{ deleted: number; missing: number; failed: number }> {
    const ids = Array.isArray(documentIds) ? [...new Set(documentIds.map(id => String(id || '')).filter(Boolean))] : [];
    let deleted = 0;
    let missing = 0;
    let failed = 0;
    for (const id of ids) {
      try {
        if (await this.deleteDocument(id, options)) deleted += 1;
        else missing += 1;
      } catch {
        failed += 1;
      }
    }
    return { deleted, missing, failed };
  }

  async deleteDocument(documentId: string, options: { voidIO?: boolean } = {}): Promise<boolean> {
    const id = String(documentId || '');
    if (!id) return false;
    const analysisIds = (this.db.prepare('SELECT id FROM lesson_analyses WHERE document_id = ?').all(id) as Array<{ id: string }>)
      .map(row => row.id);
    const run = this.db.transaction((document: string, analyses: string[]) => {
      for (const analysisId of analyses) {
        this.db.prepare('DELETE FROM game_recommendations WHERE analysis_id = ?').run(analysisId);
      }
      this.db.prepare('DELETE FROM lesson_chunks WHERE document_id = ?').run(document);
      this.db.prepare('DELETE FROM lesson_analyses WHERE document_id = ?').run(document);
      const deleted = this.db.prepare('DELETE FROM lesson_documents WHERE id = ?').run(document) as { changes?: number };
      return Number(deleted && deleted.changes) || 0;
    });
    if (run(id, analysisIds) === 0) return false;
    // The text lives on disk, not in SQLite: remove it too so the source cannot be
    // half-deleted (row gone, text still readable from the data folder). Best-effort —
    // an orphan file is harmless, a half-deleted document is not. `voidIO` skips it for
    // callers that never wrote a file (a plain in-memory database in tests).
    if (!options.voidIO) {
      try {
        await fs.rm(path.join(this.lessonsDir, `${id}.txt`), { force: true });
      } catch {
        // Best-effort: the database row is the source of truth.
      }
    }
    return true;
  }

  private getProjectRow(projectId: string): ProjectRow | undefined {
    return this.db.prepare('SELECT * FROM game_projects WHERE id = ?').get(projectId) as ProjectRow | undefined;
  }
}

// ---------------------------------------------------------------------------
// Row parsing / validation
// ---------------------------------------------------------------------------

function chunkFromRow(row: ChunkRow): StoredLessonChunk {
  return {
    documentId: row.document_id,
    index: Number(row.chunk_index) || 0,
    text: row.text,
    heading: row.heading || null,
    charStart: Number(row.char_start) || 0,
    charEnd: Number(row.char_end) || 0,
    tokenCount: Number(row.token_count) || 0,
    embeddingModel: row.embedding_model || null,
    embeddingDim: row.embedding_dim === null || row.embedding_dim === undefined ? null : Number(row.embedding_dim)
  };
}

/** SQLite gives a Buffer for a BLOB; copy into an aligned Float32Array. */
function blobToVector(blob: unknown, dimension: number): Float32Array | null {
  if (!blob) return null;
  const dim = Math.round(Number(dimension));
  if (!Number.isInteger(dim) || dim < 1 || dim > 4096) return null;
  const buffer = Buffer.isBuffer(blob)
    ? blob
    : ArrayBuffer.isView(blob)
      ? Buffer.from(blob.buffer, blob.byteOffset, blob.byteLength)
      : null;
  if (!buffer || buffer.byteLength !== dim * 4) return null;
  const copy = new Uint8Array(buffer);
  return new Float32Array(copy.buffer, 0, dim);
}

function aiTaskFromRow(row: AiTaskRow): StoredAiTask {
  return {
    taskId: row.task_id,
    requestId: row.request_id,
    kind: row.kind,
    projectId: row.project_id ?? null,
    documentId: row.document_id ?? null,
    label: row.label,
    state: row.state,
    progress: row.progress,
    errorCode: row.error_code ?? null,
    errorMessage: row.error_message ?? null,
    resultSummary: row.result_summary ?? null,
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? null
  };
}

function documentFromRow(row: DocumentRow): StoredLessonDocument {
  return {
    id: row.id,
    schemaVersion: LESSON_SCHEMA_VERSION,
    name: row.name,
    ext: row.ext,
    sizeBytes: row.size_bytes,
    characters: row.characters,
    createdAt: row.created_at,
    textRelPath: row.text_rel_path,
    sha256: row.sha256 ?? null
  };
}

function parseAnalysisRow(row: AnalysisRow): LessonAnalysis {
  if (row.schema_version > LESSON_SCHEMA_VERSION) {
    throw new LessonStoreError(
      'ANALYSIS_VERSION_UNSUPPORTED',
      `Phân tích ${row.id} dùng phiên bản ${row.schema_version}; ứng dụng chỉ hỗ trợ ${LESSON_SCHEMA_VERSION}.`
    );
  }
  const analysis = parseJsonObject(row.data_json, row.id);
  assertAnalysis(analysis);
  return analysis;
}

function parseRecommendationRow(row: RecommendationRow): GameRecommendation {
  if (row.schema_version > LESSON_SCHEMA_VERSION) {
    throw new LessonStoreError(
      'STORE_VERSION_UNSUPPORTED',
      `Đề xuất ${row.id} dùng phiên bản ${row.schema_version}; ứng dụng chỉ hỗ trợ ${LESSON_SCHEMA_VERSION}.`
    );
  }
  const recommendation = parseJsonObject(row.data_json, row.id);
  assertRecommendation(recommendation);
  return recommendation;
}

function parseProjectRow(row: ProjectRow): GameProject {
  if (row.schema_version > LESSON_SCHEMA_VERSION) {
    throw new LessonStoreError(
      'PROJECT_VERSION_UNSUPPORTED',
      `Dự án ${row.id} dùng phiên bản dữ liệu ${row.schema_version}; ứng dụng chỉ hỗ trợ ${LESSON_SCHEMA_VERSION}.`
    );
  }
  if (row.schema_version < LESSON_SCHEMA_VERSION) {
    throw new LessonStoreError(
      'PROJECT_MIGRATION_MISSING',
      `Dự án ${row.id} dùng phiên bản dữ liệu cũ (${row.schema_version}) chưa có bảng chuyển đổi.`
    );
  }
  const project = parseJsonObject(row.data_json, row.id);
  return validateProjectForWrite(project);
}

function parseJsonObject(dataJson: string, id: string): Record<string, unknown> {
  try {
    const value = JSON.parse(dataJson);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('not an object');
    }
    return value as Record<string, unknown>;
  } catch {
    throw new LessonStoreError('STORE_CORRUPT_JSON', `Dữ liệu của ${id} bị hỏng và không thể đọc lại.`);
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function assertDocumentInput(input: SaveLessonDocumentInput): void {
  if (!input || typeof input !== 'object') {
    throw new LessonStoreError('STORE_INVALID_DOCUMENT', 'Thiếu dữ liệu giáo án để lưu.');
  }
  if (typeof input.name !== 'string' || !input.name.trim()) {
    throw new LessonStoreError('STORE_INVALID_DOCUMENT', 'Tài liệu cần có tên.');
  }
  if (typeof input.ext !== 'string' || !input.ext.trim()) {
    throw new LessonStoreError('STORE_INVALID_DOCUMENT', 'Tài liệu cần có phần mở rộng.');
  }
  if (typeof input.text !== 'string') {
    throw new LessonStoreError('STORE_INVALID_DOCUMENT', 'Tài liệu cần có nội dung văn bản.');
  }
}

function assertAnalysis(value: unknown): asserts value is LessonAnalysis {
  const analysis = value as LessonAnalysis | null;
  if (!analysis || typeof analysis !== 'object') {
    throw new LessonStoreError('STORE_INVALID_ANALYSIS', 'Dữ liệu phân tích không hợp lệ.');
  }
  if (analysis.schemaVersion !== LESSON_SCHEMA_VERSION) {
    throw new LessonStoreError(
      'STORE_INVALID_ANALYSIS',
      `Phân tích phải dùng schemaVersion ${LESSON_SCHEMA_VERSION}.`
    );
  }
  if (typeof analysis.id !== 'string' || !analysis.id || typeof analysis.documentId !== 'string' || !analysis.documentId) {
    throw new LessonStoreError('STORE_INVALID_ANALYSIS', 'Phân tích cần có mã và mã tài liệu.');
  }
  if (!Array.isArray(analysis.objectives) || !Array.isArray(analysis.keyConcepts) || !Array.isArray(analysis.uncertainties)) {
    throw new LessonStoreError('STORE_INVALID_ANALYSIS', 'Phân tích cần có mục tiêu, khái niệm và điểm chưa chắc chắn.');
  }
}

function assertRecommendation(value: unknown): asserts value is GameRecommendation {
  const recommendation = value as GameRecommendation | null;
  if (!recommendation || typeof recommendation !== 'object') {
    throw new LessonStoreError('STORE_INVALID_RECOMMENDATION', 'Dữ liệu đề xuất không hợp lệ.');
  }
  if (recommendation.schemaVersion !== LESSON_SCHEMA_VERSION) {
    throw new LessonStoreError(
      'STORE_INVALID_RECOMMENDATION',
      `Đề xuất phải dùng schemaVersion ${LESSON_SCHEMA_VERSION}.`
    );
  }
  if (typeof recommendation.id !== 'string' || !recommendation.id ||
      typeof recommendation.analysisId !== 'string' || !recommendation.analysisId ||
      typeof recommendation.gameType !== 'string') {
    throw new LessonStoreError('STORE_INVALID_RECOMMENDATION', 'Đề xuất cần có mã, mã phân tích và thể loại trò chơi.');
  }
}

function validateProjectForWrite(value: unknown): GameProject {
  const project = value as GameProject | null;
  if (!project || typeof project !== 'object' || Array.isArray(project)) {
    throw new LessonStoreError('STORE_INVALID_PROJECT', 'Dữ liệu dự án không hợp lệ.');
  }
  if (typeof project.id !== 'string' || !project.id) {
    throw new LessonStoreError('STORE_INVALID_PROJECT', 'Dự án cần có mã.');
  }
  if (project.schemaVersion === undefined || project.schemaVersion === null) {
    throw new LessonStoreError('PROJECT_MIGRATION_MISSING', `Dự án ${project.id} thiếu schemaVersion.`);
  }
  if (project.schemaVersion > LESSON_SCHEMA_VERSION) {
    throw new LessonStoreError(
      'PROJECT_VERSION_UNSUPPORTED',
      `Dự án ${project.id} dùng phiên bản dữ liệu ${project.schemaVersion}; ứng dụng chỉ hỗ trợ ${LESSON_SCHEMA_VERSION}.`
    );
  }
  if (project.schemaVersion < LESSON_SCHEMA_VERSION) {
    throw new LessonStoreError(
      'PROJECT_MIGRATION_MISSING',
      `Dự án ${project.id} dùng phiên bản dữ liệu cũ (${project.schemaVersion}) chưa có bảng chuyển đổi.`
    );
  }
  if (!PROJECT_STATUSES.has(String(project.status))) {
    throw new LessonStoreError('STORE_INVALID_PROJECT', `Trạng thái dự án không hợp lệ: ${String(project.status)}.`);
  }
  if (!PROJECT_STEPS.has(String(project.step))) {
    throw new LessonStoreError('STORE_INVALID_PROJECT', `Bước dự án không hợp lệ: ${String(project.step)}.`);
  }

  let config: GameConfig | null = null;
  if (project.config) {
    try {
      config = parseGameConfig(project.config);
    } catch (error) {
      throw new LessonStoreError('STORE_INVALID_PROJECT', messageOf(error));
    }
  }
  let draft: GameDraft | null = null;
  if (project.draft) {
    try {
      draft = parseGameDraft(project.draft);
    } catch (error) {
      throw new LessonStoreError('STORE_INVALID_PROJECT', messageOf(error));
    }
  }
  if (config && draft && config.gameType !== draft.gameType) {
    throw new LessonStoreError(
      'STORE_INVALID_PROJECT',
      `Cấu hình là “${config.gameType}” nhưng nội dung là “${draft.gameType}”.`
    );
  }
  if (project.gameSnapshot) {
    assertSnapshot(project.gameSnapshot, project.id);
  }

  return { ...project, config, draft };
}

function assertSnapshot(snapshot: EducationalGame, projectId: string): void {
  try {
    switch (snapshot.template) {
      case 'scenario':
        validateScenarioGame(snapshot);
        break;
      case 'matching':
        validateMatchingGame(snapshot);
        break;
      case 'treasure-hunt':
        validateTreasureHuntGame(snapshot);
        break;
      case 'race':
        validateRaceGame(snapshot);
        break;
      default:
        break;
    }
  } catch (error) {
    throw new LessonStoreError(
      'PROJECT_SNAPSHOT_INVALID',
      `Bản xem trước của dự án ${projectId} không hợp lệ: ${messageOf(error)}`,
      [messageOf(error)]
    );
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeExt(ext: string): string {
  const value = String(ext || '').trim().toLowerCase();
  if (!value) return 'txt';
  return value.startsWith('.') ? value.slice(1) : value;
}

function newId(prefix: string): string {
  try {
    return `${prefix}_${randomUUID()}`;
  } catch {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }
}
