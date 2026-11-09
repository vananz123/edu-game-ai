/**
 * Nhóm `library:*` — luật lưu/xoá trò chơi và lượt chơi, viết MỘT lần.
 *
 * Bản Electron giữ luật này trong `main.ts` (các handler `ipcMain.handle`). Vỏ
 * Tauri không viết lại luật bằng Rust: `scripts/build-embedded-js.js` đóng gói
 * chính tệp này (với `game-validation.ts` và `game-fields.ts`) thành một bundle
 * CJS chạy trong V8 nhúng kèm binary, qua một cầu `store` nhỏ do Rust mở ra. Nhờ
 * vậy đường kiểm dữ liệu, cách chuẩn hoá mốc thời gian, giới hạn số id mỗi lần
 * xoá và câu lỗi tiếng Việt chỉ có một bản: sửa ở đây là cả hai vỏ cùng đổi.
 *
 * Ranh giới với vỏ (`store`):
 *   - đọc  → `store.select(sql, params)` trả mảng dòng (mỗi dòng là object);
 *   - ghi  → `store.execute(sql, params)` trả số dòng đổi;
 *   - giao dịch → `store.transaction([{sql, params}, …])` chạy từng câu trong
 *     MỘT transaction, lỗi giữa chừng thì cả lô bị huỷ.
 * Không SQL nào có một ký tự lấy từ dữ liệu giáo viên: giá trị luôn đi qua
 * `params` (Rust dựng tham số ràng buộc), chuỗi SQL chỉ chứa văn bản cố định.
 *
 * Cầu Tauri trả promise (op SQL của Rust là bất đồng bộ), nên các hàm dưới đây
 * là `async` và luôn `await` cầu. `await` một giá trị thường vẫn đúng, nên cùng
 * tệp này chạy được với cả cầu đồng bộ `better-sqlite3` của Electron.
 *
 * Luật phải khớp `main.ts`. `tests/unit/library-ops.test.ts` đọc `main.ts` và so
 * câu lỗi, giới hạn và thứ tự SQL với tệp này, nên trôi một bên là đỏ cổng.
 */
import {
  validateMatchingGame,
  validateRaceGame,
  validateScenarioGame,
  validateTreasureHuntGame
} from '../game/game-validation';
import { GAME_ROW_COLUMNS } from '../game/game-fields';
import { sampleGame } from './sample-game';

/** Cầu của vỏ; phần tên cột và câu lỗi giống nhau ở cả hai vỏ. */
export interface LibraryStore {
  select(
    sql: string,
    params: Record<string, unknown>
  ): Array<Record<string, unknown>> | Promise<Array<Record<string, unknown>>>;
  execute(sql: string, params: Record<string, unknown>): number | Promise<number>;
  transaction(
    statements: Array<{ sql: string; params: Record<string, unknown> }>
  ): number[] | Promise<number[]>;
}

/** Giới hạn số id mỗi lần xoá — cùng con số với handler của `main.ts`. */
export const DELETE_GAMES_MAX = 500;
export const DELETE_SESSIONS_MAX = 1000;

/** Giữ đúng số phiên như `upsertSessionRow` (998 cũ + phiên vừa ghi). */
const SESSION_HISTORY_LIMIT = 999;

interface GameLike {
  id?: unknown;
  title?: unknown;
  subject?: unknown;
  grade?: unknown;
  topic?: unknown;
  template?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  questions?: unknown;
  matchingGame?: { mode?: unknown; pairs?: unknown; [key: string]: unknown };
  treasureHunt?: { questions?: unknown; puzzle?: { type?: unknown }; missions?: Array<{ type?: unknown }> };
  race?: { cells?: Array<{ type?: unknown }> };
  [key: string]: unknown;
}

/** `id(prefix)` của `main.ts`: `Date.now()` base36 + 6 ký tự ngẫu nhiên. */
function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

interface PreparedGame {
  game: GameLike;
  columns: Record<string, string>;
  dataJson: string;
}

function text(value: unknown): string {
  return value === undefined || value === null ? '' : String(value);
}

/**
 * Thu gọn danh sách id: chỉ chuỗi khác rỗng, bỏ trùng, giữ thứ tự. `main.ts`
 * làm đúng vậy trước khi đếm giới hạn — lọc sau khi đếm thì một lô toàn id
 * trùng vẫn bị từ chối.
 */
function uniqueIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  for (const entry of value) {
    if (typeof entry === 'string' && entry && ids.indexOf(entry) < 0) ids.push(entry);
  }
  return ids;
}

function prepareGame(game: GameLike, now: string): PreparedGame {
  // Một bảng mỗi màn hình (editor dựng cả ba panel ẩn để giáo viên đổi thể loại
  // tại chỗ). Bảng của thể loại khác không thuộc trò chơi này; bỏ TRƯỚC khi
  // kiểm dữ liệu, và cũng nhờ vậy sửa được dòng đã lưu từ trước bản vá (#152).
  if (game.template !== 'matching') delete game.matchingGame;
  if (game.template !== 'treasure-hunt') delete game.treasureHunt;
  if (game.template !== 'race') delete game.race;
  validateScenarioGame(game as never);
  validateMatchingGame(game as never);
  validateTreasureHuntGame(game as never);
  validateRaceGame(game as never);

  game.id = game.id || newId('game');
  game.updatedAt = now;
  game.createdAt = game.createdAt || now;

  const columns: Record<string, string> = { createdAt: String(game.createdAt), updatedAt: now };
  for (const { column, field, fallback } of GAME_ROW_COLUMNS) {
    const raw = game[field];
    if (field === 'id') columns[column] = text(raw || game.id);
    else columns[column] = text(raw || (fallback === 'now' ? now : fallback));
  }
  return { game, columns, dataJson: JSON.stringify(game) };
}

async function insertGame(store: LibraryStore, prepared: PreparedGame, now: string): Promise<void> {
  const { columns, dataJson } = prepared;
  await store.execute(
    `INSERT INTO games (id,title,subject,grade,topic,template,created_at,updated_at,data_json)
     VALUES (@id,@title,@subject,@grade,@topic,@template,@created_at,@updated_at,@data_json)
     ON CONFLICT(id) DO UPDATE SET
       title=excluded.title, subject=excluded.subject, grade=excluded.grade,
       topic=excluded.topic, template=excluded.template,
       updated_at=excluded.updated_at, data_json=excluded.data_json`,
    {
      id: columns.id,
      title: columns.title,
      subject: columns.subject,
      grade: columns.grade,
      topic: columns.topic,
      template: columns.template,
      created_at: columns.createdAt,
      updated_at: columns.updatedAt || now,
      data_json: dataJson
    }
  );
}

function sessionParams(session: GameLike, now: string, existing: string | null) {
  const sessionId = text(session.id || newId('session'));
  const createdAt = text(session.createdAt || existing || now);
  const stored = { ...session, id: sessionId, createdAt };
  return { sessionId, createdAt, stored, dataJson: JSON.stringify(stored) };
}

export async function getLibraryPayload(
  store: LibraryStore
): Promise<{ version: 1; games: unknown[]; sessions: unknown[] }> {
  const gameRows = await store.select('SELECT data_json FROM games ORDER BY updated_at DESC', {});
  const sessionRows = await store.select(
    'SELECT data_json FROM sessions ORDER BY created_at DESC LIMIT 1000',
    {}
  );
  return {
    version: 1,
    games: gameRows.map(row => JSON.parse(String(row.data_json))),
    sessions: sessionRows.map(row => JSON.parse(String(row.data_json)))
  };
}

/**
 * `library:save-game`: kiểm → chuẩn hoá → ghi một dòng. Ghi MỘT dòng thay vì
 * đọc cả thư viện rồi ghi lại để một lượt ghi phiên chạy song song không bị mất.
 */
export async function saveGame(store: LibraryStore, input: unknown, now: string): Promise<unknown> {
  const game = input && typeof input === 'object' ? (input as GameLike) : null;
  if (!game || typeof game.title !== 'string' || !Array.isArray(game.questions)) {
    throw new Error('Dữ liệu trò chơi không hợp lệ.');
  }
  const prepared = prepareGame(game, now);
  await insertGame(store, prepared, now);
  return prepared.game;
}

/**
 * #124: xoá một trò chơi đã lưu. Trả danh sách id ảnh minh hoạ mà dòng đó nhắc
 * tới để vỏ dọn tệp SAU khi dòng đã biến mất — lúc đó "còn được dùng" mới đúng
 * nghĩa "còn được chỗ khác nhắc tới". Xoá id không tồn tại vẫn trả `ok: true`.
 */
export async function deleteGame(
  store: LibraryStore,
  gameId: unknown
): Promise<{ ok: true; images: string[] }> {
  const id = text(gameId);
  const rows = await store.select('SELECT data_json FROM games WHERE id = @id', { id });
  let images: string[] = [];
  if (rows.length) {
    try {
      images = collectCustomImageIds(JSON.parse(String(rows[0].data_json)));
    } catch {
      // Dòng hỏng thì không có ảnh nào đáng dọn.
    }
  }
  await store.execute('DELETE FROM games WHERE id = @id', { id });
  return { ok: true, images };
}

/**
 * #154: xoá nhiều trò chơi. Các dòng đi trước trong MỘT transaction, ảnh dọn sau
 * — ảnh dùng chung bởi hai trò chơi trong cùng lô không bị giữ lại chỉ vì dòng
 * kia vẫn còn đó trong lúc dọn.
 */
export async function deleteGames(
  store: LibraryStore,
  gameIds: unknown
): Promise<{ ok: boolean; deleted: number; missing: number; images: string[] }> {
  const ids = uniqueIds(gameIds);
  if (!ids.length) throw new Error('Chưa chọn trò chơi nào để xoá.');
  if (ids.length > DELETE_GAMES_MAX) throw new Error(`Mỗi lần chỉ xoá tối đa ${DELETE_GAMES_MAX} trò chơi.`);

  const images: string[] = [];
  const find = 'SELECT data_json FROM games WHERE id = @id';
  const remove = 'DELETE FROM games WHERE id = @id';
  // Đọc `data_json` theo đúng thứ tự id, rồi mới mở transaction.
  const plan: Array<{ id: string; rows: Array<Record<string, unknown>> }> = [];
  for (const id of ids) plan.push({ id, rows: await store.select(find, { id }) });
  for (const { rows } of plan) {
    if (!rows.length) continue;
    try {
      images.push(...collectCustomImageIds(JSON.parse(String(rows[0].data_json))));
    } catch {
      // Dòng hỏng thì không có ảnh nào đáng dọn.
    }
  }
  // Chỉ câu DELETE đi trong transaction: lượt ghi phiên chạy song song không thể
  // chen giữa hai lần đọc `data_json` và hai lần xoá của cùng lô này.
  const counts = await store.transaction(plan.map(({ id }) => ({ sql: remove, params: { id } })));
  const deleted = counts.reduce((sum, count) => sum + Number(count || 0), 0);
  return { ok: deleted > 0, deleted, missing: ids.length - deleted, images };
}

/**
 * `library:save-session`: id sinh MỘT lần cho mỗi lượt chơi, nên hiện kết quả
 * hai lần hoặc đổi tên người chơi chỉ sửa đúng dòng cũ. Sau đó tỉa lịch sử về
 * giới hạn, nhưng KHÔNG tỉa dòng vừa ghi — đổi tên một phiên cũ không được làm
 * nó biến mất.
 */
export async function saveSession(store: LibraryStore, input: unknown, now: string): Promise<unknown> {
  const session: GameLike = input && typeof input === 'object' ? (input as GameLike) : {};
  const sessionId = text(session.id || newId('session'));
  const existing = await store.select('SELECT created_at FROM sessions WHERE id = @id', { id: sessionId });
  const prepared = sessionParams(
    { ...session, id: sessionId },
    now,
    existing.length ? text(existing[0].created_at) : null
  );
  await store.transaction([
    {
      sql: `INSERT INTO sessions (id,created_at,data_json)
            VALUES (@id,@created_at,@data_json)
            ON CONFLICT(id) DO UPDATE SET data_json=excluded.data_json`,
      params: { id: sessionId, created_at: prepared.createdAt, data_json: prepared.dataJson }
    },
    {
      sql: `DELETE FROM sessions WHERE id <> @id AND id NOT IN (
              SELECT id FROM sessions WHERE id <> @id ORDER BY created_at DESC LIMIT ${SESSION_HISTORY_LIMIT}
            )`,
      params: { id: sessionId }
    }
  ]);
  return prepared.stored;
}

/** #123: xoá một hoặc nhiều lượt chơi. Trò chơi và giáo án là bảng khác, không đụng. */
export async function deleteSessions(
  store: LibraryStore,
  sessionIds: unknown
): Promise<{ ok: boolean; deleted: number; missing: number }> {
  const ids = uniqueIds(sessionIds);
  if (!ids.length) throw new Error('Chưa chọn lượt chơi nào để xoá.');
  if (ids.length > DELETE_SESSIONS_MAX) throw new Error(`Mỗi lần chỉ xoá tối đa ${DELETE_SESSIONS_MAX} lượt chơi.`);
  const counts = await store.transaction(
    ids.map(id => ({ sql: 'DELETE FROM sessions WHERE id = @id', params: { id } }))
  );
  const deleted = counts.reduce((sum, count) => sum + Number(count || 0), 0);
  return { ok: deleted > 0, deleted, missing: ids.length - deleted };
}

/**
 * Luật của `library:save-game` áp lên trò chơi đã lưu, và `library:save-session`
 * áp lên lượt chơi. Hai hàm dưới đây là phần nhỏ của `upsertSessionRow` cần cho
 * cổng kiểm tra; chúng không phải API của vỏ.
 */

/** Id của ảnh tải lên nằm trong một giá trị bất kỳ (cùng cách `main.ts` đếm). */
export function collectCustomImageIds(value: unknown, into: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const entry of value) collectCustomImageIds(entry, into);
    return into;
  }
  if (!value || typeof value !== 'object') return into;
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'illustrationAssetId' && isCustomImageId(entry)) into.push(entry as string);
    else collectCustomImageIds(entry, into);
  }
  return into;
}

/** Cùng biểu thức với `CUSTOM_IMAGE_ID` của `custom-illustration.ts`. */
export function isCustomImageId(value: unknown): boolean {
  return typeof value === 'string' && /^ci-[a-f0-9]{32}$/u.test(value);
}

/**
 * Lần chạy đầu: thư viện rỗng thì ghi trò chơi mẫu, đúng nhánh
 * `if (gameCount === 0) …` của `ensureData()` bên Electron.
 *
 * Chỉ chạy khi bảng `games` đang rỗng — tệp đã có dữ liệu (kể cả dữ liệu chép
 * sang từ Electron) không bao giờ bị thêm trò chơi mẫu. Đi qua `saveGame` để
 * trò chơi mẫu phải qua đúng bộ kiểm dữ liệu như mọi trò chơi khác.
 */
export async function seedLibrary(store: LibraryStore, now: string): Promise<boolean> {
  const existing = await store.select('SELECT id FROM games ORDER BY updated_at DESC LIMIT 1', {});
  if (existing.length) return false;
  await saveGame(store, sampleGame(now), now);
  return true;
}
