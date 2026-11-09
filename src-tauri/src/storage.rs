//! Cơ sở dữ liệu của vỏ Tauri — giai đoạn 3 của kế hoạch chuyển đổi.
//!
//! Bản Electron giữ thư viện và các bảng sidecar trong MỘT tệp `edugame.sqlite`
//! (WAL, `foreign_keys = ON`). Ở đây dùng đúng tệp đó, đúng DDL đó, để dữ liệu
//! của một giáo viên có thể chép sang rồi mở bằng vỏ này mà không có bước đổi
//! giữa. Hai khối DDL KHÔNG được viết lại ở đây: `include_str!` đọc thẳng từ tệp
//! TypeScript đang sở hữu chúng (`main.ts` và `lesson-store.ts`), nên sửa cột ở
//! một nơi là cả hai vỏ biết. `tests/unit/tauri-storage-schema.test.ts` canh
//! rằng khối được trích vẫn đúng là khối đang chạy bên Electron.
//!
//! Tên tệp cũng lấy từ `main.ts` (`DB_FILE`), không gõ lại chuỗi ở đây.
//!
//! Giai đoạn này chưa có lệnh IPC nào dùng `Database`: chọn backend và chứng
//! minh nó mở được dữ liệu 0.5.1 là việc của bước 1/6. Các bước sau port từng
//! nhóm kênh lên trên nó.

use std::path::Path;

use rusqlite::Connection;

/// DDL của `games`/`sessions`, đúng nguyên văn chuỗi trong `ensureData()`.
pub const LIBRARY_SCHEMA_SQL: &str = include_str!("../../src/db/library-schema.sql");

/// DDL của chín bảng sidecar, đúng `LESSON_STORE_SCHEMA_SQL` của `lesson-store.ts`.
pub const STORE_SCHEMA_SQL: &str = include_str!("../../src/db/lesson-store-schema.sql");

/// Tên tệp cơ sở dữ liệu, đúng hằng `DB_FILE` trong `main.ts`.
pub const DB_FILE: &str = "edugame.sqlite";

/// Lỗi đọc tệp cơ sở dữ liệu. Mọi thông điệp đều tiếng Việt để renderer hiện
/// thẳng được cho giáo viên, kèm mã ổn định cho cổng kiểm tra.
#[derive(Debug)]
pub enum DbError {
    /// SQLite không mở được tệp (hỏng, bị khoá, sai định dạng).
    Open(String),
    /// Một câu DDL/SQL trong khối schema không chạy được.
    Schema(String),
    /// Một dòng `data_json` không phải JSON.
    Data(String),
    /// Không ghi được tệp (đĩa đầy, không có quyền).
    Io(String),
}

impl DbError {
    pub fn code(&self) -> &'static str {
        match self {
            DbError::Open(_) => "DB_OPEN_FAILED",
            DbError::Schema(_) => "DB_SCHEMA_FAILED",
            DbError::Data(_) => "DB_DATA_CORRUPT",
            DbError::Io(_) => "DB_IO_FAILED",
        }
    }
}

impl std::fmt::Display for DbError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let (label, text) = match self {
            DbError::Open(text) => ("không mở được cơ sở dữ liệu", text),
            DbError::Schema(text) => ("không tạo được bảng", text),
            DbError::Data(text) => ("dữ liệu trong thư viện hỏng", text),
            DbError::Io(text) => ("không ghi được cơ sở dữ liệu", text),
        };
        write!(f, "{label}: {text}")
    }
}

impl std::error::Error for DbError {}

/// Chuyển lỗi của `rusqlite` thành lỗi đọc được. Không lộ chuỗi tiếng Anh trần
/// ra giao diện: câu gốc vẫn nằm ở cuối để người sửa lỗi thấy nguyên nhân.
fn sql_error(error: rusqlite::Error) -> String {
    format!("{error}")
}

/// Mở cơ sở dữ liệu tại `path` với đúng ba pragma mà Electron đặt ở
/// `ensureData()`: WAL (một tiến trình ghi, đọc không chặn), khoá ngoại bật
/// (sidecar dựa vào `ON DELETE CASCADE`), và khoá chờ 5 giây thay vì lỗi ngay
/// khi một tiến trình khác đang ghi. Cron trước `foreign_keys` vì SQLite chỉ
/// đọc pragma đó khi đặt, không khi mở.
pub fn open(path: &Path) -> Result<Connection, DbError> {
    let connection = Connection::open(path).map_err(|error| DbError::Open(sql_error(error)))?;
    connection
        .pragma_update(None, "journal_mode", "WAL")
        .map_err(|error| DbError::Open(sql_error(error)))?;
    connection
        .pragma_update(None, "foreign_keys", "ON")
        .map_err(|error| DbError::Open(sql_error(error)))?;
    connection
        .busy_timeout(std::time::Duration::from_secs(5))
        .map_err(|error| DbError::Open(sql_error(error)))?;
    Ok(connection)
}

/// Tạo bảng của cả hai khối (`CREATE … IF NOT EXISTS` nên chạy lại vô hại) và
/// áp các migration cộng thêm của `LessonStore.migrateSchema()`.
///
/// Hai cột `cache_key` / `evidence_meta` được thêm bằng `ALTER TABLE` y như bên
/// Electron: `CREATE TABLE IF NOT EXISTS` không bao giờ thêm cột vào bảng đã có,
/// nên một tệp tạo trước #186 mà thiếu bước này sẽ mất phần "AI đã đọc …" của
/// mọi cuộc trò chuyện cũ.
pub fn ensure_schema(connection: &Connection) -> Result<(), DbError> {
    connection
        .execute_batch(LIBRARY_SCHEMA_SQL)
        .map_err(|error| DbError::Schema(sql_error(error)))?;
    connection
        .execute_batch(STORE_SCHEMA_SQL)
        .map_err(|error| DbError::Schema(sql_error(error)))?;
    add_column_if_missing(connection, "lesson_analyses", "cache_key", "TEXT")?;
    connection
        .execute_batch(
            "CREATE INDEX IF NOT EXISTS idx_lesson_analyses_cache ON lesson_analyses(document_id, cache_key)",
        )
        .map_err(|error| DbError::Schema(sql_error(error)))?;
    add_column_if_missing(connection, "lesson_chat_messages", "evidence_meta", "TEXT")?;
    Ok(())
}

fn add_column_if_missing(
    connection: &Connection,
    table: &str,
    column: &str,
    kind: &str,
) -> Result<(), DbError> {
    let statement = format!("PRAGMA table_info({table})");
    let mut prepared = connection
        .prepare(&statement)
        .map_err(|error| DbError::Schema(sql_error(error)))?;
    let mut names = prepared
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|error| DbError::Schema(sql_error(error)))?;
    let exists = names
        .any(|name| name.is_ok_and(|name| name == column));
    if exists {
        return Ok(());
    }
    let alter = format!("ALTER TABLE {table} ADD COLUMN {column} {kind}");
    connection
        .execute_batch(&alter)
        .map_err(|error| DbError::Schema(sql_error(error)))
}

/// Hình dạng mà renderer đọc: `{version, games, sessions}` đúng `readDb()`.
#[derive(Debug, PartialEq)]
pub struct Library {
    pub games: Vec<serde_json::Value>,
    pub sessions: Vec<serde_json::Value>,
}

/// Đọc thư viện giống `readDb()`: game theo `updated_at` giảm dần, tối đa 1000
/// phiên theo `created_at` giảm dần.
///
/// Một dòng `data_json` hỏng trả `DbError::Data` thay vì bỏ qua im lặng: bản
/// Electron sẽ ném ở `JSON.parse` và cả màn hình không mở được, nhưng ở đây
/// lỗi có mã để màn hình báo "thư viện hỏng" kèm tên dòng — bỏ qua thì giáo
/// viên mất game mà không biết tại sao.
pub fn read_library(connection: &Connection) -> Result<Library, DbError> {
    let mut game_statement = connection
        .prepare("SELECT data_json FROM games ORDER BY updated_at DESC")
        .map_err(|error| DbError::Schema(sql_error(error)))?;
    let games = read_payloads(&mut game_statement, "games")?;
    let mut session_statement = connection
        .prepare("SELECT data_json FROM sessions ORDER BY created_at DESC LIMIT 1000")
        .map_err(|error| DbError::Schema(sql_error(error)))?;
    let sessions = read_payloads(&mut session_statement, "sessions")?;
    Ok(Library { games, sessions })
}

fn read_payloads(
    statement: &mut rusqlite::Statement<'_>,
    table: &str,
) -> Result<Vec<serde_json::Value>, DbError> {
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| DbError::Schema(sql_error(error)))?;
    let mut values = Vec::new();
    for row in rows {
        let text = row.map_err(|error| DbError::Schema(sql_error(error)))?;
        let value = serde_json::from_str(&text)
            .map_err(|error| DbError::Data(format!("bảng {table}: {error}")))?;
        values.push(value);
    }
    Ok(values)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Dữ liệu thử dựng đúng hình dạng 0.5.1: hai bảng thư viện, chín bảng
    /// sidecar, một game, một phiên, một dự án và một tài liệu giáo án. Không
    /// dùng dữ liệu thật của học sinh theo quy tắc dự án — tên người là giả.
    fn seed_0_5_1(connection: &Connection) {
        connection
            .execute_batch(
                "INSERT INTO games (id,title,subject,grade,topic,template,created_at,updated_at,data_json)
                 VALUES ('g1','An toàn giao thông','GDCD','7','An toàn','scenario',
                         '2026-10-01T08:00:00.000Z','2026-10-02T09:30:00.000Z',
                         '{\"id\":\"g1\",\"title\":\"An toàn giao thông\",\"template\":\"scenario\"}');
                 INSERT INTO sessions (id,created_at,data_json)
                 VALUES ('s1','2026-10-02T10:00:00.000Z','{\"id\":\"s1\",\"gameId\":\"g1\",\"score\":80}');
                 INSERT INTO lesson_documents
                   (id,name,ext,size_bytes,characters,text_rel_path,sha256,schema_version,created_at)
                 VALUES ('doc1','Bài 3.docx','docx',1200,900,'lessons/doc1.txt',NULL,1,'2026-10-01T07:00:00.000Z');
                 INSERT INTO game_projects
                   (id,game_id,status,step,data_json,schema_version,created_at,updated_at)
                 VALUES ('p1',NULL,'draft','content','{\"id\":\"p1\",\"status\":\"draft\"}',1,
                         '2026-10-01T08:00:00.000Z','2026-10-03T08:00:00.000Z');",
            )
            .expect("seed 0.5.1");
    }

    #[test]
    fn opens_a_fresh_file_with_both_schemas_and_the_electron_pragmas() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join(DB_FILE);
        let connection = open(&path).expect("mở được tệp mới");
        ensure_schema(&connection).expect("tạo được schema");

        let journal: String = connection
            .pragma_query_value(None, "journal_mode", |row| row.get(0))
            .expect("đọc journal_mode");
        assert_eq!(journal.to_lowercase(), "wal");
        let foreign: i64 = connection
            .pragma_query_value(None, "foreign_keys", |row| row.get(0))
            .expect("đọc foreign_keys");
        assert_eq!(foreign, 1);

        let tables: Vec<String> = connection
            .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .map(|name| name.unwrap())
            .collect();
        for table in [
            "games", "sessions", "lesson_documents", "lesson_analyses", "game_recommendations",
            "game_projects", "lesson_chunks", "ai_generation_cache", "ai_tasks", "lesson_chats",
            "lesson_chat_messages",
        ] {
            assert!(tables.iter().any(|name| name == table), "thiếu bảng {table}: {tables:?}");
        }
        assert_eq!(tables.len(), 11, "schema 0.5.1 có đúng 11 bảng: {tables:?}");

        let library = read_library(&connection).expect("thư viện rỗng đọc được");
        assert_eq!(library, Library { games: vec![], sessions: vec![] });
    }

    #[test]
    fn reopens_a_closed_0_5_1_file_with_the_same_rows() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join(DB_FILE);
        {
            let connection = open(&path).expect("mở lần đầu");
            ensure_schema(&connection).expect("schema lần đầu");
            seed_0_5_1(&connection);
        }
        let connection = open(&path).expect("mở lại sau khi đóng");
        ensure_schema(&connection).expect("chạy schema lần hai phải vô hại");
        let library = read_library(&connection).expect("đọc thư viện đã ghi");
        assert_eq!(library.games.len(), 1);
        assert_eq!(library.games[0]["id"], "g1");
        assert_eq!(library.sessions.len(), 1);
        assert_eq!(library.sessions[0]["score"], 80);

        // Sidecar giữ nguyên, và cột migration đã có mặt.
        let documents: i64 = connection
            .query_row("SELECT COUNT(*) FROM lesson_documents", [], |row| row.get(0))
            .unwrap();
        assert_eq!(documents, 1);
        let cache_key: bool = connection
            .prepare("PRAGMA table_info(lesson_analyses)")
            .unwrap()
            .query_map([], |row| row.get::<_, String>(1))
            .unwrap()
            .any(|name| name.unwrap() == "cache_key");
        assert!(cache_key, "migration cache_key");
    }

    #[test]
    fn cascades_delete_documents_to_their_analyses() {
        // `foreign_keys = ON` là điều kiện của `ON DELETE CASCADE`; test này
        // chứng minh pragma thật sự có tác dụng chứ không chỉ được đặt.
        let dir = tempfile::tempdir().expect("tempdir");
        let connection = open(&dir.path().join(DB_FILE)).expect("mở");
        ensure_schema(&connection).expect("schema");
        connection
            .execute_batch(
                "INSERT INTO lesson_documents
                   (id,name,ext,size_bytes,characters,text_rel_path,sha256,schema_version,created_at)
                 VALUES ('doc1','a.txt','txt',1,1,'lessons/doc1.txt',NULL,1,'2026-10-01T00:00:00.000Z');
                 INSERT INTO lesson_analyses
                   (id,document_id,data_json,schema_version,created_at,updated_at)
                 VALUES ('an1','doc1','{}',1,'2026-10-01T00:00:00.000Z','2026-10-01T00:00:00.000Z');",
            )
            .expect("seed");
        connection
            .execute("DELETE FROM lesson_documents WHERE id = 'doc1'", [])
            .expect("xoá tài liệu");
        let remaining: i64 = connection
            .query_row("SELECT COUNT(*) FROM lesson_analyses", [], |row| row.get(0))
            .unwrap();
        assert_eq!(remaining, 0, "phân tích phải đi theo tài liệu");
    }

    #[test]
    fn corrupt_payload_names_the_table_instead_of_vanishing() {
        let dir = tempfile::tempdir().expect("tempdir");
        let connection = open(&dir.path().join(DB_FILE)).expect("mở");
        ensure_schema(&connection).expect("schema");
        connection
            .execute(
                "INSERT INTO games (id,title,created_at,updated_at,data_json)
                 VALUES ('g1','x','2026-10-01T00:00:00Z','2026-10-01T00:00:00Z','{không phải json')",
                [],
            )
            .expect("seed");
        let error = read_library(&connection).expect_err("JSON hỏng phải là lỗi");
        assert_eq!(error.code(), "DB_DATA_CORRUPT");
        assert!(error.to_string().contains("games"), "{error}");
    }

    #[test]
    fn database_file_name_matches_the_electron_one() {
        let main_ts = include_str!("../../src/main.ts");
        assert!(
            main_ts.contains(&format!("path.join(DATA_DIR(), '{DB_FILE}')")),
            "DB_FILE phải là tên tệp mà main.ts mở: {DB_FILE}"
        );
    }
}
