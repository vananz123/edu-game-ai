/**
 * Additive storage for the AI-assisted lesson-to-game workflow.
 *
 * This module owns four sidecar tables (`lesson_documents`, `lesson_analyses`,
 * `game_recommendations`, `game_projects`) plus the lesson text files. It never
 * touches `games`/`sessions` and never uses the whole-table `DELETE` pattern of
 * `saveDb`; every write is a targeted upsert inside a transaction.
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
  created_at: string;
  updated_at: string;
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

  async deleteDocument(documentId: string): Promise<boolean> {
    if (!documentId) return false;
    const row = this.getDocumentRow(documentId);
    if (!row) return false;
    const remove = this.db.transaction(() => {
      const analysisIds = (this.db.prepare('SELECT id FROM lesson_analyses WHERE document_id = ?')
        .all(documentId) as Array<{ id: string }>).map(item => item.id);
      const deleteRecommendation = this.db.prepare('DELETE FROM game_recommendations WHERE analysis_id = ?');
      for (const analysisId of analysisIds) deleteRecommendation.run(analysisId);
      this.db.prepare('DELETE FROM lesson_analyses WHERE document_id = ?').run(documentId);
      this.db.prepare('DELETE FROM lesson_documents WHERE id = ?').run(documentId);
    });
    remove();
    try {
      await fs.rm(path.join(this.lessonsDir, `${documentId}.txt`), { force: true });
    } catch {
      // File cleanup is best-effort; the DB row is the source of truth.
    }
    return true;
  }

  private getDocumentRow(documentId: string): DocumentRow | undefined {
    return this.db.prepare('SELECT * FROM lesson_documents WHERE id = ?').get(documentId) as DocumentRow | undefined;
  }

  // -------------------------------------------------------------------------
  // Analyses + recommendations
  // -------------------------------------------------------------------------

  saveAnalysis(analysis: LessonAnalysis): LessonAnalysis {
    assertAnalysis(analysis);
    const existing = this.getAnalysisRow(analysis.id);
    const createdAt = existing?.created_at || analysis.createdAt || new Date().toISOString();
    const updatedAt = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO lesson_analyses (id,document_id,data_json,schema_version,created_at,updated_at)
      VALUES (@id,@document_id,@data_json,@schema_version,@created_at,@updated_at)
      ON CONFLICT(id) DO UPDATE SET
        document_id=excluded.document_id, data_json=excluded.data_json,
        schema_version=excluded.schema_version, updated_at=excluded.updated_at
    `).run({
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

  private getProjectRow(projectId: string): ProjectRow | undefined {
    return this.db.prepare('SELECT * FROM game_projects WHERE id = ?').get(projectId) as ProjectRow | undefined;
  }
}

// ---------------------------------------------------------------------------
// Row parsing / validation
// ---------------------------------------------------------------------------

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
