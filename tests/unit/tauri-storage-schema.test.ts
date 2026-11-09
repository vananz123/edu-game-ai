/**
 * Giai đoạn 3 bước 1/6 — SQL mà vỏ Tauri chạy phải là SQL đang chạy bên Electron.
 *
 * `src-tauri/src/storage.rs` không viết lại DDL: nó `include_str!` hai tệp
 * `.sql` dưới `src/db/`. Hai tệp đó là BẢN SAO của hai khối SQL nằm trong
 * `main.ts` (`ensureData`) và `lesson-store.ts` (`LESSON_STORE_SCHEMA_SQL`).
 * Hai bản sao chỉ an toàn khi mỗi cột, mỗi khoá, mỗi index khớp nguyên văn —
 * lệch một cột là dữ liệu chép từ máy Electron sang máy Tauri mất dữ liệu.
 *
 * Phép so dưới đây không so từng chữ trắng mà so CHỮ KÝ cấu trúc: `(cột, kiểu,
 * not null, default)` của từng bảng và danh sách index. Nhờ vậy comment, thứ tự
 * dòng trắng hay tên tham số tên không làm đỏ cổng, còn một cột bị đổi kiểu,
 * mất `DEFAULT` hay bị thêm/bớt thì đỏ ngay.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function findRepoRoot(start: string): string {
  let current = start;
  for (let depth = 0; depth < 6; depth += 1) {
    if (fs.existsSync(path.join(current, 'package.json'))) return current;
    current = path.dirname(current);
  }
  throw new Error(`không tìm thấy gốc repo từ ${start}`);
}

const root = findRepoRoot(__dirname);
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), 'utf8');

/**
 * Bỏ comment `--` và gộp mọi khoảng trắng/xuống dòng thành một dấu cách.
 *
 * Phải bỏ comment TRƯỚC khi gộp dòng: comment nằm giữa danh sách cột (như
 * `evidence_meta` bên `lesson-store.ts`) mà gộp trước thì phần chữ sau `--`
 * dính vào cột sau nó và regex tách cột đọc thành tên cột rác.
 */
function normalizeSql(sql: string): string {
  return sql
    .split(/\r?\n/)
    .map(line => line.replace(/--.*$/, ''))
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Trích khối SQL nằm giữa mốc mở và mốc đóng trong một tệp nguồn. */
function sliceBetween(source: string, startMarker: string, endMarker: string, label: string): string {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `${label}: không thấy mốc mở "${startMarker}"`);
  const from = start + startMarker.length;
  const end = source.indexOf(endMarker, from);
  assert.ok(end >= 0, `${label}: không thấy mốc đóng "${endMarker}"`);
  return source.slice(from, end);
}

/**
 * Chữ ký cấu trúc của một khối DDL dạng
 * `{ tables: { games: ['id|TEXT|pk', …] }, indexes: ['idx_… ON games(…)'], others: […] }`.
 * Chỉ hiểu đúng loại SQL mà hai tệp này dùng: `CREATE TABLE IF NOT EXISTS` với
 * danh sách cột phẳng (một dòng, có thể kết thúc bằng dấu phẩy) và các ràng
 * buộc dạng `PRIMARY KEY (…)`, `UNIQUE (…)`, `FOREIGN KEY (…) REFERENCES …`.
 */
function signature(sql: string): { tables: Record<string, string[]>; indexes: string[] } {
  const text = normalizeSql(sql);
  const tables: Record<string, string[]> = {};
  const indexes: string[] = [];

  const tablePattern = /CREATE TABLE IF NOT EXISTS (\w+) \(([\s\S]*?)\);/g;
  let match: RegExpExecArray | null;
  while ((match = tablePattern.exec(text))) {
    const [, name, body] = match;
    const entries = body.split(/,(?![^(]*\))/).map(entry => entry.trim()).filter(Boolean);
    const columns: string[] = [];
    const constraints: string[] = [];
    for (const entry of entries) {
      if (/^(PRIMARY KEY|UNIQUE|FOREIGN KEY|CHECK|CONSTRAINT)\b/i.test(entry)) {
        constraints.push(entry.replace(/\s+/g, ' ').toUpperCase());
        continue;
      }
      const [columnName, ...rest] = entry.split(/\s+/);
      const upper = rest.join(' ').toUpperCase();
      const parts = [columnName, rest[0] ? rest[0].toUpperCase() : ''];
      if (/\bNOT NULL\b/.test(upper)) parts.push('NOT NULL');
      const fallback = upper.match(/\bDEFAULT (\S+)/);
      if (fallback) parts.push(`DEFAULT ${fallback[1]}`);
      if (/\bPRIMARY KEY\b/.test(upper)) parts.push('PRIMARY KEY');
      columns.push(parts.filter(Boolean).join('|'));
    }
    tables[name] = [...columns, ...constraints];
  }

  const indexPattern = /CREATE (?:UNIQUE )?INDEX IF NOT EXISTS (\w+) ON (\w+)\(([^)]*)\)/g;
  while ((match = indexPattern.exec(text))) {
    indexes.push(`${match[1]} ON ${match[2]}(${match[3].replace(/\s+/g, '')})`);
  }
  return { tables, indexes };
}

// --- Khối thư viện: `games` + `sessions` trong `ensureData()` của main.ts ---
const mainSource = read('src', 'main.ts');
const libraryInTs = sliceBetween(
  mainSource,
  "sqlite.exec(`",
  '`);',
  'main.ts ensureData'
);
const libraryInSql = read('src', 'db', 'library-schema.sql');

// --- Khối sidecar: `LESSON_STORE_SCHEMA_SQL` của lesson-store.ts ---
const storeSource = read('src', 'services', 'storage', 'lesson-store.ts');
const storeInTs = sliceBetween(
  storeSource,
  'export const LESSON_STORE_SCHEMA_SQL = `',
  '`;',
  'lesson-store.ts LESSON_STORE_SCHEMA_SQL'
);
const storeInSql = read('src', 'db', 'lesson-store-schema.sql');

// --- Vỏ Tauri thật sự include đúng hai tệp đó ---
const storageSource = read('src-tauri', 'src', 'storage.rs');

let passed = 0;
function check(name: string, run: () => void): void {
  try {
    run();
    passed += 1;
    console.log(`ok   ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

check('storage.rs include_str! đúng hai tệp SQL trong src/db', () => {
  assert.ok(
    storageSource.includes('include_str!("../../src/db/library-schema.sql")'),
    'storage.rs phải include_str! src/db/library-schema.sql'
  );
  assert.ok(
    storageSource.includes('include_str!("../../src/db/lesson-store-schema.sql")'),
    'storage.rs phải include_str! src/db/lesson-store-schema.sql'
  );
});

check('thư viện: cùng bảng, cùng cột và cùng index với main.ts', () => {
  assert.deepEqual(signature(libraryInSql), signature(libraryInTs));
  const { tables, indexes } = signature(libraryInTs);
  assert.deepEqual(Object.keys(tables).sort(), ['games', 'sessions']);
  assert.deepEqual(indexes.sort(), [
    'idx_games_updated_at ON games(updated_at DESC)',
    'idx_sessions_created_at ON sessions(created_at DESC)'
  ].map(index => index.replace(/\s+/g, '').replace(/^(\w+)ON/, '$1 ON ')));
});

check('sidecar: cùng 9 bảng, cùng cột và cùng index với lesson-store.ts', () => {
  const fromTs = signature(storeInTs);
  const fromSql = signature(storeInSql);
  assert.deepEqual(fromSql, fromTs);
  assert.deepEqual(Object.keys(fromTs.tables).sort(), [
    'ai_generation_cache',
    'ai_tasks',
    'game_projects',
    'game_recommendations',
    'lesson_analyses',
    'lesson_chat_messages',
    'lesson_chats',
    'lesson_chunks',
    'lesson_documents'
  ]);
  // Khoá ngoại là điều kiện của `ON DELETE CASCADE`, và pragma `foreign_keys`
  // của Rust chỉ có tác dụng nếu DDL thật sự khai chúng.
  const foreignKeys = Object.values(fromTs.tables)
    .flat()
    .filter(entry => entry.startsWith('FOREIGN KEY'));
  assert.equal(foreignKeys.length, 4, `khoá ngoại: ${foreignKeys.join(' · ')}`);
});

check('sidecar: hai cột được migration bằng ALTER TABLE trong Rust cũng có trong DDL', () => {
  // `migrateSchema()` thêm hai cột cho tệp cũ. Chúng phải có sẵn trong DDL mới,
  // nếu không một tệp tạo mới sẽ thiếu cột và câu INSERT của Rust sẽ sai.
  const { tables } = signature(storeInTs);
  assert.ok(tables.lesson_analyses.some(entry => entry.startsWith('cache_key|')), 'cache_key');
  assert.ok(
    tables.lesson_chat_messages.some(entry => entry.startsWith('evidence_meta|')),
    'evidence_meta'
  );
  assert.match(storageSource, /add_column_if_missing\(connection, "lesson_analyses", "cache_key", "TEXT"\)/);
  assert.match(
    storageSource,
    /add_column_if_missing\(connection, "lesson_chat_messages", "evidence_meta", "TEXT"\)/
  );
});

check('tên tệp cơ sở dữ liệu của Rust trùng hằng DB_FILE của main.ts', () => {
  const dbFile = mainSource.match(/const DB_FILE = \(\) => path\.join\(DATA_DIR\(\), '([^']+)'\)/);
  assert.ok(dbFile, 'main.ts không còn gọi `const DB_FILE = () => path.join(DATA_DIR(), …)`');
  assert.ok(
    storageSource.includes(`pub const DB_FILE: &str = "${dbFile[1]}"`),
    `storage.rs phải khai DB_FILE = "${dbFile[1]}"`
  );
});

console.log(`\n${passed} kiểm tra schema Tauri ↔ Electron đều đạt.`);
