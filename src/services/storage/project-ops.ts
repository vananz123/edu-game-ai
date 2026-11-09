/**
 * Nhóm `project:*` — luật lưu/đọc/xoá bản nháp dự án, viết MỘT lần cho cả hai vỏ.
 *
 * Bản Electron giữ đường lưu này trong ba handler `project:*` của `main.ts` (dọn
 * ảnh rồi gọi `LessonStore`). Vỏ Tauri không viết lại luật bằng Rust:
 * `scripts/build-embedded-js.js` đóng gói chính tệp này cùng
 * `src/services/lesson/lesson-project-rules.ts` (và qua nó là
 * `lesson-contracts.ts`) thành một bundle chạy trong V8 nhúng kèm binary. Nhờ vậy
 * câu kiểm dữ liệu, hai mã lỗi phiên bản, thứ tự `updated_at DESC`, trần 200 id
 * và câu lỗi tiếng Việt chỉ có một bản: sửa ở đây là cả hai vỏ cùng đổi.
 *
 * Ranh giới với vỏ giống `library-ops.ts`:
 *   - đọc  → `store.select(sql, params)` trả mảng dòng;
 *   - ghi  → `store.execute(sql, params)` trả số dòng đổi;
 *   - giao dịch → `store.transaction([{sql, params}, …])`.
 * Không SQL nào có một ký tự lấy từ dữ liệu giáo viên: giá trị luôn đi qua
 * `params`, chuỗi SQL chỉ là văn bản cố định — `tauri-embedded` so từng câu với
 * danh sách của Rust, nên một câu mới ở đây mà quên ở đó là lỗi lúc chạy.
 *
 * Ảnh minh hoạ của bản nháp KHÔNG bị dọn ở đây. Hàm xoá chỉ trả id ảnh mà dòng
 * đã xoá nhắc tới; vỏ dọn tệp SAU khi dòng biến mất, cùng cách `library:*`.
 */
import { collectCustomImageIds, type LibraryStore } from './library-ops';
import type { GameProject } from '../../shared/lesson-types';
import {
  parseProjectRow,
  PROJECT_DELETE_SQL,
  PROJECT_SELECT_ALL_SQL,
  PROJECT_SELECT_ROW_SQL,
  PROJECT_UPSERT_SQL,
  validateProjectForWrite
} from '../lesson/lesson-project-rules';

/** Cùng con số với handler `project:delete-many` của `main.ts`. */
export const DELETE_PROJECTS_MAX = 200;

/**
 * Thu gọn danh sách id: chỉ chuỗi khác rỗng, bỏ trùng, giữ thứ tự — `main.ts`
 * lọc trước khi đếm giới hạn, nên một lô toàn id trùng vẫn được nhận.
 */
function uniqueIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  for (const entry of value) {
    if (typeof entry === 'string' && entry && ids.indexOf(entry) < 0) ids.push(entry);
  }
  return ids;
}

/** Id ảnh tải lên nhắc tới trong `data_json` của một dòng — đọc lỗi thì không có ảnh nào. */
function imageIds(dataJson: unknown): string[] {
  try {
    return collectCustomImageIds(JSON.parse(String(dataJson)));
  } catch {
    return [];
  }
}

/**
 * `project:save-draft`: kiểm → giữ `createdAt` của dòng cũ → ghi MỘT dòng.
 *
 * `LessonStore.saveProject` lấy `created_at` của dòng đang có, rồi tới
 * `createdAt` mà bản nháp mang theo, rồi mới tới lúc này; `updatedAt` luôn là
 * lúc này. Đọc trước rồi ghi, nhưng chỉ câu ghi nằm trong một lượt — đủ cho một
 * giáo viên, cùng giới hạn của `saveProject` bên Electron.
 */
export async function saveProjectDraft(store: LibraryStore, input: unknown, now: string): Promise<GameProject> {
  const validated = validateProjectForWrite(input);
  const existing = await store.select(PROJECT_SELECT_ROW_SQL, { id: validated.id });
  const createdAt = (existing.length ? String(existing[0].created_at || '') : '') || validated.createdAt || now;
  const saved: GameProject = { ...validated, createdAt, updatedAt: now };
  await store.execute(PROJECT_UPSERT_SQL, {
    id: saved.id,
    game_id: saved.gameId ?? null,
    status: saved.status,
    step: saved.step,
    data_json: JSON.stringify(saved),
    schema_version: saved.schemaVersion,
    created_at: createdAt,
    updated_at: now
  });
  return saved;
}

/** `project:get`: dòng không có thì `null`, dòng hỏng thì để lỗi luật đi ra. */
export async function getProject(store: LibraryStore, projectId: unknown): Promise<GameProject | null> {
  const id = typeof projectId === 'string' ? projectId : '';
  if (!id) return null;
  const rows = await store.select(PROJECT_SELECT_ROW_SQL, { id });
  return rows.length ? parseProjectRow(rows[0] as never) : null;
}

/** `project:list`: mới sửa đứng đầu, đúng `ORDER BY updated_at DESC`. */
export async function listProjects(store: LibraryStore): Promise<GameProject[]> {
  const rows = await store.select(PROJECT_SELECT_ALL_SQL, {});
  return rows.map(row => parseProjectRow(row as never));
}

/**
 * `project:delete`: xoá một bản nháp, trả id ảnh của nó để vỏ dọn sau. Xoá id
 * không tồn tại vẫn trả `ok: true` — nút Xoá bấm hai lần không phải lỗi.
 */
export async function deleteProject(
  store: LibraryStore,
  projectId: unknown
): Promise<{ ok: true; images: string[] }> {
  const id = typeof projectId === 'string' ? projectId : '';
  const rows = id ? await store.select(PROJECT_SELECT_ROW_SQL, { id }) : [];
  const images = rows.length ? imageIds(rows[0].data_json) : [];
  if (id) await store.execute(PROJECT_DELETE_SQL, { id });
  return { ok: true, images };
}

/**
 * `project:delete-many`: lọc → đếm giới hạn → đọc ảnh → xoá cả lô trong MỘT
 * transaction. `deleted`/`missing` đếm theo id đã gửi, nên "thiếu" là id không
 * có dòng, không phải id bị lỗi.
 */
export async function deleteProjects(
  store: LibraryStore,
  projectIds: unknown
): Promise<{ ok: boolean; deleted: number; missing: number; images: string[] }> {
  const ids = uniqueIds(projectIds);
  if (!ids.length) throw new Error('Chưa chọn dự án nào để xoá.');
  if (ids.length > DELETE_PROJECTS_MAX) throw new Error(`Mỗi lần chỉ xoá tối đa ${DELETE_PROJECTS_MAX} dự án.`);

  const images: string[] = [];
  const plan: Array<{ id: string; rows: Array<Record<string, unknown>> }> = [];
  for (const id of ids) plan.push({ id, rows: await store.select(PROJECT_SELECT_ROW_SQL, { id }) });
  for (const { rows } of plan) {
    if (rows.length) images.push(...imageIds(rows[0].data_json));
  }
  const counts = await store.transaction(plan.map(({ id }) => ({ sql: PROJECT_DELETE_SQL, params: { id } })));
  const deleted = counts.reduce((sum, count) => sum + Number(count || 0), 0);
  return { ok: deleted > 0, deleted, missing: ids.length - deleted, images };
}
