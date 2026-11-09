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
//! Tệp này chỉ giữ phần mở/khoá/tạo bảng và các kiểu lỗi dùng chung. Câu SQL
//! của thư viện nằm ở `library.rs`, bộ chuyển tham số ở `sql_params.rs`.

use std::path::Path;

use rusqlite::Connection;

/// DDL của `games`/`sessions`, đúng nguyên văn chuỗi trong `ensureData()`.
pub const LIBRARY_SCHEMA_SQL: &str = include_str!("../../src/db/library-schema.sql");

/// DDL của chín bảng sidecar, đúng `LESSON_STORE_SCHEMA_SQL` của `lesson-store.ts`.
pub const STORE_SCHEMA_SQL: &str = include_str!("../../src/db/lesson-store-schema.sql");

/// Tên tệp cơ sở dữ liệu, đúng hằng `DB_FILE` trong `main.ts`.
pub const DB_FILE: &str = "edugame.sqlite";

/// Lỗi đọc/ghi cơ sở dữ liệu. Mọi thông điệp đều tiếng Việt để renderer hiện
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
    /// Dữ liệu của giáo viên không qua được luật của chính ứng dụng.
    Invalid(String),
}

impl DbError {
    pub fn code(&self) -> &'static str {
        match self {
            DbError::Open(_) => "DB_OPEN_FAILED",
            DbError::Schema(_) => "DB_SCHEMA_FAILED",
            DbError::Data(_) => "DB_DATA_CORRUPT",
            DbError::Io(_) => "DB_IO_FAILED",
            DbError::Invalid(_) => "DB_INVALID_INPUT",
        }
    }
}

impl std::fmt::Display for DbError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let (label, text) = match self {
            DbError::Open(text) => ("không mở được cơ sở dữ liệu", text),
            DbError::Schema(text) => ("không chạy được câu SQL của thư viện", text),
            DbError::Data(text) => ("dữ liệu trong thư viện hỏng", text),
            DbError::Io(text) => ("không ghi được cơ sở dữ liệu", text),
            // Câu lỗi của luật (ví dụ "Mỗi lần chỉ xoá tối đa 500 trò chơi.")
            // được giáo viên đọc nguyên văn; thêm tiền tố kỹ thuật là lạc đề.
            DbError::Invalid(text) => return write!(f, "{text}"),
        };
        write!(f, "{label}: {text}")
    }
}

impl std::error::Error for DbError {}

/// Chuyển lỗi của `rusqlite` thành lỗi đọc được. Không lộ chuỗi tiếng Anh trần
/// ra giao diện: câu gốc vẫn nằm ở cuối để người sửa lỗi thấy nguyên nhân.
pub(crate) fn sql_text(error: rusqlite::Error) -> String {
    format!("{error}")
}

/// Mở cơ sở dữ liệu tại `path` với đúng ba pragma mà Electron đặt ở
/// `ensureData()`: WAL (một tiến trình ghi, đọc không chặn), khoá ngoại bật
/// (sidecar dựa vào `ON DELETE CASCADE`), và khoá chờ 5 giây thay vì lỗi ngay
/// khi một tiến trình khác đang ghi. Cron trước `foreign_keys` vì SQLite chỉ
/// đọc pragma đó khi đặt, không khi mở.
pub fn open(path: &Path) -> Result<Connection, DbError> {
    let connection = Connection::open(path).map_err(|error| DbError::Open(sql_text(error)))?;
    connection
        .pragma_update(None, "journal_mode", "WAL")
        .map_err(|error| DbError::Open(sql_text(error)))?;
    connection
        .pragma_update(None, "foreign_keys", "ON")
        .map_err(|error| DbError::Open(sql_text(error)))?;
    connection
        .busy_timeout(std::time::Duration::from_secs(5))
        .map_err(|error| DbError::Open(sql_text(error)))?;
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
        .map_err(|error| DbError::Schema(sql_text(error)))?;
    connection
        .execute_batch(STORE_SCHEMA_SQL)
        .map_err(|error| DbError::Schema(sql_text(error)))?;
    add_column_if_missing(connection, "lesson_analyses", "cache_key", "TEXT")?;
    connection
        .execute_batch(
            "CREATE INDEX IF NOT EXISTS idx_lesson_analyses_cache ON lesson_analyses(document_id, cache_key)",
        )
        .map_err(|error| DbError::Schema(sql_text(error)))?;
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
        .map_err(|error| DbError::Schema(sql_text(error)))?;
    let mut names = prepared
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|error| DbError::Schema(sql_text(error)))?;
    let exists = names
        .any(|name| name.is_ok_and(|name| name == column));
    if exists {
        return Ok(());
    }
    let alter = format!("ALTER TABLE {table} ADD COLUMN {column} {kind}");
    connection
        .execute_batch(&alter)
        .map_err(|error| DbError::Schema(sql_text(error)))
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    /// Tệp mới trong thư mục tạm, đã có đủ hai khối schema. Không chạm thư mục
    /// dữ liệu thật; tên người trong dữ liệu thử đều là giả.
    pub(crate) fn fresh() -> (tempfile::TempDir, Connection) {
        let dir = tempfile::tempdir().expect("tempdir");
        let connection = open(&dir.path().join(DB_FILE)).expect("mở");
        ensure_schema(&connection).expect("schema");
        (dir, connection)
    }

    #[test]
    fn opens_a_fresh_file_with_both_schemas_and_the_electron_pragmas() {
        let (_dir, connection) = fresh();
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
    }

    #[test]
    fn creating_the_schema_twice_is_harmless() {
        let (_dir, connection) = fresh();
        ensure_schema(&connection).expect("chạy schema lần hai");
        let indexes: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name IN ('idx_games_updated_at','idx_sessions_created_at','idx_lesson_analyses_cache')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(indexes, 3);
    }

    #[test]
    fn cascades_delete_documents_to_their_analyses() {
        // `foreign_keys = ON` là điều kiện của `ON DELETE CASCADE`; test này
        // chứng minh pragma thật sự có tác dụng chứ không chỉ được đặt.
        let (_dir, connection) = fresh();
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
    fn every_error_code_is_stable() {
        // Cổng UI và renderer dựa vào mã; đổi mã là đổi hợp đồng. Lỗi luật
        // `Invalid` không có tiền tố: renderer hiện thẳng câu của nó.
        assert_eq!(DbError::Open(String::new()).code(), "DB_OPEN_FAILED");
        assert_eq!(DbError::Schema(String::new()).code(), "DB_SCHEMA_FAILED");
        assert_eq!(DbError::Data(String::new()).code(), "DB_DATA_CORRUPT");
        assert_eq!(DbError::Io(String::new()).code(), "DB_IO_FAILED");
        assert_eq!(DbError::Invalid(String::new()).code(), "DB_INVALID_INPUT");
        assert_eq!(
            DbError::Invalid("Mỗi lần chỉ xoá tối đa 500 trò chơi.".into()).to_string(),
            "Mỗi lần chỉ xoá tối đa 500 trò chơi."
        );
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
