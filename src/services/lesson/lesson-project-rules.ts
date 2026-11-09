/**
 * Luật của một bản nháp dự án (`game_projects`), viết MỘT lần cho cả hai vỏ.
 *
 * Bản Electron giữ luật này trong `lesson-store.ts`. Vỏ Tauri không chép lại
 * sang TypeScript thứ hai hay sang Rust: `scripts/build-embedded-js.js` đóng gói
 * tệp này vào bundle V8 nhúng, nên câu kiểm dữ liệu, hai mã lỗi phiên bản và
 * câu "Cấu hình là … nhưng nội dung là …" chỉ có một bản. Chép là hai bản cùng
 * một luật, và bản thứ hai sẽ trôi ở lần sửa thứ ba — đúng lỗi #152 đã phải vá.
 *
 * Tệp này có hai nửa, đúng hai chỗ mà `lesson-store.ts` dùng luật:
 *   - `validateProjectForWrite` — kiểm TRƯỚC khi ghi (kể cả đọc lại từ đĩa);
 *   - `parseProjectRow` — đọc một dòng `game_projects` thành `GameProject`.
 * Phần SQL (`INSERT … ON CONFLICT`, `DELETE`) không nằm ở đây: câu lệnh là hình
 * dạng của cầu, không phải luật. `lesson-store.ts` và `library-ops`/`project-ops`
 * đều phải dùng ĐÚNG câu SQL đó, và cổng `tauri-embedded` so hai bản.
 *
 * Ngoài `zod` (qua `lesson-contracts.ts`), tệp chỉ phụ thuộc module thuần: không
 * `node:*`, không đồng hồ, không I/O — điều kiện để bundle chạy trong V8 nhúng.
 */
import type { GameConfig, GameDraft, GameProject, GameProjectStatus, WorkflowStep } from '../../shared/lesson-types';
import { LESSON_SCHEMA_VERSION } from '../../shared/lesson-types';
import type { EducationalGame } from '../../shared/types';
import { parseGameConfig, parseGameDraft } from './lesson-contracts';
import {
  validateMatchingGame,
  validateRaceGame,
  validateScenarioGame,
  validateTreasureHuntGame
} from '../game/game-validation';

/** Lỗi luật mang mã: vỏ đổi mã thành lỗi của mình, renderer đọc câu tiếng Việt. */
export class ProjectRuleError extends Error {
  readonly code: string;
  readonly details: string[];

  constructor(code: string, message: string, details: string[] = []) {
    super(message);
    this.name = 'ProjectRuleError';
    this.code = code;
    this.details = details;
  }
}

/** Một dòng `game_projects` như nó nằm trong SQLite. */
export interface GameProjectRow {
  id: string;
  game_id: string | null;
  status: string;
  step: string;
  data_json: string;
  schema_version: number;
  created_at: string;
  updated_at: string;
}

/** Đúng các giá trị `GameProjectStatus`/`WorkflowStep` mà `validateProjectForWrite` nhận. */
export const PROJECT_STATUSES: ReadonlySet<GameProjectStatus> = new Set(['draft', 'review', 'ready']);
export const PROJECT_STEPS: ReadonlySet<WorkflowStep> = new Set([
  'input',
  'analyze',
  'recommend',
  'configure',
  'generate',
  'edit',
  'done'
]);

/** Câu SQL ghi một dòng, dùng chung cho `LessonStore.saveProject` và cầu Tauri. */
export const PROJECT_UPSERT_SQL = `
      INSERT INTO game_projects (id,game_id,status,step,data_json,schema_version,created_at,updated_at)
      VALUES (@id,@game_id,@status,@step,@data_json,@schema_version,@created_at,@updated_at)
      ON CONFLICT(id) DO UPDATE SET
        game_id=excluded.game_id, status=excluded.status, step=excluded.step,
        data_json=excluded.data_json, schema_version=excluded.schema_version, updated_at=excluded.updated_at
    `;

/** Ba câu đọc/xoá: cùng cột, cùng thứ tự với `LessonStore` bên Electron. */
export const PROJECT_SELECT_ROW_SQL = 'SELECT * FROM game_projects WHERE id = @id';
export const PROJECT_SELECT_ALL_SQL = 'SELECT * FROM game_projects ORDER BY updated_at DESC';
export const PROJECT_DELETE_SQL = 'DELETE FROM game_projects WHERE id = @id';

/**
 * Kiểm một `GameProject` trước khi ghi, và trả bản đã chuẩn hoá `config`/`draft`
 * qua bộ phân tích của `lesson-contracts.ts`. Không sửa `id`, `createdAt` hay
 * `status`: sửa dữ liệu giáo viên là việc của người gọi, ở đây chỉ từ chối.
 */
export function validateProjectForWrite(value: unknown): GameProject {
  const project = value as GameProject | null;
  if (!project || typeof project !== 'object' || Array.isArray(project)) {
    throw new ProjectRuleError('STORE_INVALID_PROJECT', 'Dữ liệu dự án không hợp lệ.');
  }
  if (typeof project.id !== 'string' || !project.id) {
    throw new ProjectRuleError('STORE_INVALID_PROJECT', 'Dự án cần có mã.');
  }
  if (project.schemaVersion === undefined || project.schemaVersion === null) {
    throw new ProjectRuleError('PROJECT_MIGRATION_MISSING', `Dự án ${project.id} thiếu schemaVersion.`);
  }
  if (project.schemaVersion > LESSON_SCHEMA_VERSION) {
    throw new ProjectRuleError(
      'PROJECT_VERSION_UNSUPPORTED',
      `Dự án ${project.id} dùng phiên bản dữ liệu ${project.schemaVersion}; ứng dụng chỉ hỗ trợ ${LESSON_SCHEMA_VERSION}.`
    );
  }
  if (project.schemaVersion < LESSON_SCHEMA_VERSION) {
    throw new ProjectRuleError(
      'PROJECT_MIGRATION_MISSING',
      `Dự án ${project.id} dùng phiên bản dữ liệu cũ (${project.schemaVersion}) chưa có bảng chuyển đổi.`
    );
  }
  if (!PROJECT_STATUSES.has(String(project.status) as GameProjectStatus)) {
    throw new ProjectRuleError('STORE_INVALID_PROJECT', `Trạng thái dự án không hợp lệ: ${String(project.status)}.`);
  }
  if (!PROJECT_STEPS.has(String(project.step) as WorkflowStep)) {
    throw new ProjectRuleError('STORE_INVALID_PROJECT', `Bước dự án không hợp lệ: ${String(project.step)}.`);
  }

  let config: GameConfig | null = null;
  if (project.config) {
    try {
      config = parseGameConfig(project.config);
    } catch (error) {
      throw new ProjectRuleError('STORE_INVALID_PROJECT', messageOf(error));
    }
  }
  let draft: GameDraft | null = null;
  if (project.draft) {
    try {
      draft = parseGameDraft(project.draft);
    } catch (error) {
      throw new ProjectRuleError('STORE_INVALID_PROJECT', messageOf(error));
    }
  }
  if (config && draft && config.gameType !== draft.gameType) {
    throw new ProjectRuleError(
      'STORE_INVALID_PROJECT',
      `Cấu hình là “${config.gameType}” nhưng nội dung là “${draft.gameType}”.`
    );
  }
  if (project.gameSnapshot) {
    assertSnapshot(project.gameSnapshot, project.id);
  }

  return { ...project, config, draft };
}

/**
 * Đọc một dòng thành `GameProject`. Phiên bản mới hơn thì từ chối (không có bảng
 * chuyển đổi NGƯỢC), phiên bản cũ hơn cũng từ chối (chưa có bảng chuyển đổi
 * XUÔI) — cả hai đều là `throw`, không phải "đọc được một nửa".
 */
export function parseProjectRow(row: GameProjectRow): GameProject {
  if (row.schema_version > LESSON_SCHEMA_VERSION) {
    throw new ProjectRuleError(
      'PROJECT_VERSION_UNSUPPORTED',
      `Dự án ${row.id} dùng phiên bản dữ liệu ${row.schema_version}; ứng dụng chỉ hỗ trợ ${LESSON_SCHEMA_VERSION}.`
    );
  }
  if (row.schema_version < LESSON_SCHEMA_VERSION) {
    throw new ProjectRuleError(
      'PROJECT_MIGRATION_MISSING',
      `Dự án ${row.id} dùng phiên bản dữ liệu cũ (${row.schema_version}) chưa có bảng chuyển đổi.`
    );
  }
  return validateProjectForWrite(parseProjectJson(row.data_json, row.id));
}

function parseProjectJson(dataJson: string, id: string): Record<string, unknown> {
  try {
    const value = JSON.parse(dataJson);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('not an object');
    }
    return value as Record<string, unknown>;
  } catch {
    throw new ProjectRuleError('STORE_CORRUPT_JSON', `Dữ liệu của ${id} bị hỏng và không thể đọc lại.`);
  }
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
    throw new ProjectRuleError(
      'PROJECT_SNAPSHOT_INVALID',
      `Bản xem trước của dự án ${projectId} không hợp lệ: ${messageOf(error)}`,
      [messageOf(error)]
    );
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
