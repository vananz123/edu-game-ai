//! Kho giáo án của `lesson:*`: tài liệu, phân tích và đề xuất trò chơi.
//!
//! Bản Electron dùng `src/services/storage/lesson-store.ts` trên cùng tệp
//! `edugame.sqlite`; tệp này là bản Rust của đúng những câu SQL và đúng những
//! câu kiểm dữ liệu ấy, để dữ liệu của hai vỏ đọc lẫn nhau được và câu lỗi giáo
//! viên đọc vẫn là câu cũ. Toàn bộ chạy trên kết nối của luồng engine (xem
//! `library.rs`), không mở kết nối thứ hai.
//!
//! Văn bản giáo án nằm trên đĩa (`<data>/lessons/<id>.txt`) như bên Electron,
//! không nhét vào SQLite. `text_rel_path` trong hàng luôn là đường dẫn tương đối
//! dùng `/` để hai vỏ đọc được trên mọi hệ điều hành.

use std::path::{Path, PathBuf};

use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

use crate::storage::DbError;

/// Cùng `LESSON_SCHEMA_VERSION` của `lesson-store.ts`.
const SCHEMA_VERSION: i64 = 1;

/// Một lượt `lesson-store:*` trên luồng engine.
pub fn dispatch(
    connection: &Connection,
    data_dir: &Path,
    op: &str,
    args: &[Value],
) -> Result<Value, DbError> {
    match op {
        "save-document" => save_document(connection, data_dir, args.first().cloned().unwrap_or(Value::Null)),
        "get-document" => get_document(connection, data_dir, &string_arg(args, 0)?),
        "library" => list_library(connection, data_dir),
        "delete-document" => delete_document(connection, data_dir, &string_arg(args, 0)?),
        "delete-documents" => delete_documents(connection, data_dir, args.first()),
        "get-analysis" => get_analysis(connection, &string_arg(args, 0)?),
        "save-analysis" => save_analysis(connection, args.first().cloned().unwrap_or(Value::Null), args.get(1)),
        "find-analysis-cache" => {
            let document_id = string_arg(args, 0)?;
            let cache_key = string_arg(args, 1)?;
            find_analysis_by_cache(connection, &document_id, &cache_key)
        }
        "save-recommendations" => save_recommendations(
            connection,
            &string_arg(args, 0)?,
            args.get(1).cloned().unwrap_or(Value::Array(Vec::new())),
        ),
        "list-recommendations" => list_recommendations(connection, &string_arg(args, 0)?),
        other => Err(DbError::Schema(format!("op `lesson-store:{other}` chưa có"))),
    }
}

fn string_arg(args: &[Value], index: usize) -> Result<String, DbError> {
    Ok(args
        .get(index)
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string())
}

/// Tài liệu đã lưu — cùng hình dạng `StoredLessonDocument` của Electron.
fn document_from_row(row: &rusqlite::Row<'_>) -> Result<Value, rusqlite::Error> {
    Ok(json!({
        "id": row.get::<_, String>(0)?,
        "schemaVersion": SCHEMA_VERSION,
        "name": row.get::<_, String>(1)?,
        "ext": row.get::<_, String>(2)?,
        "sizeBytes": row.get::<_, i64>(3)?,
        "characters": row.get::<_, i64>(4)?,
        "createdAt": row.get::<_, String>(5)?,
        "textRelPath": row.get::<_, String>(6)?,
        "sha256": row.get::<_, Option<String>>(7)?,
    }))
}

const DOCUMENT_COLUMNS: &str = "id,name,ext,size_bytes,characters,created_at,text_rel_path,sha256";

fn save_document(
    connection: &Connection,
    data_dir: &Path,
    input: Value,
) -> Result<Value, DbError> {
    let object = input.as_object().ok_or_else(|| invalid("STORE_INVALID_DOCUMENT", "Thiếu dữ liệu giáo án để lưu."))?;
    let name = object.get("name").and_then(Value::as_str).unwrap_or("");
    if name.trim().is_empty() {
        return Err(invalid("STORE_INVALID_DOCUMENT", "Tài liệu cần có tên."));
    }
    let ext = object.get("ext").and_then(Value::as_str).unwrap_or("");
    if ext.trim().is_empty() {
        return Err(invalid("STORE_INVALID_DOCUMENT", "Tài liệu cần có phần mở rộng."));
    }
    let text = object
        .get("text")
        .and_then(Value::as_str)
        .ok_or_else(|| invalid("STORE_INVALID_DOCUMENT", "Tài liệu cần có nội dung văn bản."))?;

    let document_id = object
        .get("documentId")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| format!("doc_{}", new_uuid()));
    let ext = normalize_ext(ext);
    let lessons_dir = data_dir.join("lessons");
    std::fs::create_dir_all(&lessons_dir)
        .map_err(|error| DbError::Io(format!("không tạo được thư mục giáo án: {error}")))?;
    std::fs::write(lessons_dir.join(format!("{document_id}.txt")), text)
        .map_err(|error| DbError::Io(format!("không ghi được tệp giáo án: {error}")))?;

    let created_at = connection
        .query_row(
            "SELECT created_at FROM lesson_documents WHERE id = ?1",
            params![document_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(db_error)?
        .unwrap_or_else(crate::library::now);
    let characters = number_or(object.get("characters"), text.encode_utf16().count() as i64);
    let size_bytes = number_or(object.get("sizeBytes"), text.len() as i64);
    let sha256 = sha256_hex(text);
    let text_rel_path = format!("lessons/{document_id}.txt");

    connection
        .execute(
            "INSERT INTO lesson_documents (id,name,ext,size_bytes,characters,text_rel_path,sha256,schema_version,created_at) \
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9) \
             ON CONFLICT(id) DO UPDATE SET \
               name=excluded.name, ext=excluded.ext, size_bytes=excluded.size_bytes, \
               characters=excluded.characters, text_rel_path=excluded.text_rel_path, \
               sha256=excluded.sha256, schema_version=excluded.schema_version",
            params![
                document_id,
                name,
                ext,
                size_bytes,
                characters,
                text_rel_path,
                sha256,
                SCHEMA_VERSION,
                created_at
            ],
        )
        .map_err(db_error)?;

    Ok(json!({
        "id": document_id,
        "schemaVersion": SCHEMA_VERSION,
        "name": name,
        "ext": ext,
        "sizeBytes": size_bytes,
        "characters": characters,
        "createdAt": created_at,
        "textRelPath": text_rel_path,
        "sha256": sha256,
    }))
}

fn get_document(connection: &Connection, data_dir: &Path, document_id: &str) -> Result<Value, DbError> {
    let document = connection
        .query_row(
            &format!("SELECT {DOCUMENT_COLUMNS} FROM lesson_documents WHERE id = ?1"),
            params![document_id],
            |row| document_from_row(row),
        )
        .optional()
        .map_err(db_error)?;
    let Some(mut document) = document else {
        return Ok(Value::Null);
    };
    let path = data_dir.join("lessons").join(format!("{document_id}.txt"));
    let text = std::fs::read_to_string(&path).map_err(|_| {
        invalid(
            "STORE_DOCUMENT_FILE_MISSING",
            &format!("Không đọc được tệp giáo án của tài liệu {document_id}."),
        )
    })?;
    if let Some(object) = document.as_object_mut() {
        object.insert("text".to_string(), Value::String(text));
    }
    Ok(document)
}

fn list_library(connection: &Connection, data_dir: &Path) -> Result<Value, DbError> {
    let mut documents = connection
        .prepare(&format!(
            "SELECT {DOCUMENT_COLUMNS} FROM lesson_documents ORDER BY created_at DESC"
        ))
        .map_err(db_error)?
        .query_map([], |row| document_from_row(row))
        .map_err(db_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(db_error)?;

    let mut analyses_by_document: std::collections::HashMap<String, Vec<Value>> = Default::default();
    let mut statement = connection
        .prepare("SELECT id,document_id,data_json,schema_version FROM lesson_analyses ORDER BY updated_at DESC")
        .map_err(db_error)?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)?,
            ))
        })
        .map_err(db_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(db_error)?;
    for (id, document_id, data_json, schema_version) in rows {
        let analysis = parse_analysis(&id, &data_json, schema_version)?;
        analyses_by_document.entry(document_id).or_default().push(analysis);
    }

    for document in documents.iter_mut() {
        let id = document.get("id").and_then(Value::as_str).unwrap_or("").to_string();
        let source_available = data_dir
            .join("lessons")
            .join(format!("{id}.txt"))
            .is_file();
        if let Some(object) = document.as_object_mut() {
            object.insert("sourceAvailable".to_string(), Value::Bool(source_available));
            object.insert(
                "analyses".to_string(),
                Value::Array(analyses_by_document.remove(&id).unwrap_or_default()),
            );
        }
    }
    Ok(Value::Array(documents))
}

fn delete_document(connection: &Connection, data_dir: &Path, document_id: &str) -> Result<Value, DbError> {
    if document_id.is_empty() {
        return Ok(Value::Bool(false));
    }
    let analysis_ids = {
        let mut statement = connection
            .prepare("SELECT id FROM lesson_analyses WHERE document_id = ?1")
            .map_err(db_error)?;
        let rows = statement
            .query_map(params![document_id], |row| row.get::<_, String>(0))
            .map_err(db_error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(db_error)?;
        rows
    };
    let transaction = connection.unchecked_transaction().map_err(db_error)?;
    for analysis_id in &analysis_ids {
        transaction
            .execute("DELETE FROM game_recommendations WHERE analysis_id = ?1", params![analysis_id])
            .map_err(db_error)?;
    }
    transaction
        .execute("DELETE FROM lesson_chunks WHERE document_id = ?1", params![document_id])
        .map_err(db_error)?;
    transaction
        .execute("DELETE FROM lesson_analyses WHERE document_id = ?1", params![document_id])
        .map_err(db_error)?;
    let removed = transaction
        .execute("DELETE FROM lesson_documents WHERE id = ?1", params![document_id])
        .map_err(db_error)?;
    transaction.commit().map_err(db_error)?;
    if removed == 0 {
        return Ok(Value::Bool(false));
    }
    // Tệp văn bản là bản sao của hàng; xoá hỏng tệp không được biến một lần xoá
    // thành công thành lỗi (Electron cũng bỏ qua lỗi tệp).
    let _ = std::fs::remove_file(data_dir.join("lessons").join(format!("{document_id}.txt")));
    Ok(Value::Bool(true))
}

fn delete_documents(connection: &Connection, data_dir: &Path, input: Option<&Value>) -> Result<Value, DbError> {
    let mut ids: Vec<String> = Vec::new();
    if let Some(list) = input.and_then(Value::as_array) {
        for value in list {
            let id = value.as_str().unwrap_or("").trim().to_string();
            if !id.is_empty() && !ids.contains(&id) {
                ids.push(id);
            }
        }
    }
    let (mut deleted, mut missing, mut failed) = (0_i64, 0_i64, 0_i64);
    for id in ids {
        match delete_document(connection, data_dir, &id) {
            Ok(Value::Bool(true)) => deleted += 1,
            Ok(_) => missing += 1,
            Err(_) => failed += 1,
        }
    }
    Ok(json!({ "deleted": deleted, "missing": missing, "failed": failed }))
}

fn get_analysis(connection: &Connection, analysis_id: &str) -> Result<Value, DbError> {
    let row = connection
        .query_row(
            "SELECT id,data_json,schema_version FROM lesson_analyses WHERE id = ?1",
            params![analysis_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, i64>(2)?)),
        )
        .optional()
        .map_err(db_error)?;
    match row {
        Some((id, data_json, version)) => parse_analysis(&id, &data_json, version),
        None => Ok(Value::Null),
    }
}

fn find_analysis_by_cache(
    connection: &Connection,
    document_id: &str,
    cache_key: &str,
) -> Result<Value, DbError> {
    if document_id.is_empty() || cache_key.is_empty() {
        return Ok(Value::Null);
    }
    let row = connection
        .query_row(
            "SELECT id,data_json,schema_version FROM lesson_analyses \
             WHERE document_id = ?1 AND cache_key = ?2 ORDER BY updated_at DESC LIMIT 1",
            params![document_id, cache_key],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, i64>(2)?)),
        )
        .optional()
        .map_err(db_error)?;
    match row {
        Some((id, data_json, version)) => parse_analysis(&id, &data_json, version),
        None => Ok(Value::Null),
    }
}

fn save_analysis(
    connection: &Connection,
    analysis: Value,
    options: Option<&Value>,
) -> Result<Value, DbError> {
    assert_analysis(&analysis)?;
    let id = analysis.get("id").and_then(Value::as_str).unwrap_or("").to_string();
    let document_id = analysis
        .get("documentId")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let created_at = connection
        .query_row(
            "SELECT created_at FROM lesson_analyses WHERE id = ?1",
            params![id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(db_error)?
        .or_else(|| analysis.get("createdAt").and_then(Value::as_str).map(str::to_string))
        .unwrap_or_else(crate::library::now);
    let updated_at = crate::library::now();
    let cache_key = options
        .and_then(|value| value.get("cacheKey"))
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let stored = with_created_at(&analysis, &created_at);
    let data_json = serde_json::to_string(&stored).map_err(|error| DbError::Data(error.to_string()))?;

    connection
        .execute(
            "INSERT INTO lesson_analyses (id,document_id,data_json,schema_version,cache_key,created_at,updated_at) \
             VALUES (?1,?2,?3,?4,?5,?6,?7) \
             ON CONFLICT(id) DO UPDATE SET \
               document_id=excluded.document_id, data_json=excluded.data_json, \
               schema_version=excluded.schema_version, \
               cache_key=COALESCE(excluded.cache_key, lesson_analyses.cache_key), \
               updated_at=excluded.updated_at",
            params![id, document_id, data_json, SCHEMA_VERSION, cache_key, created_at, updated_at],
        )
        .map_err(db_error)?;
    Ok(stored)
}

fn save_recommendations(
    connection: &Connection,
    analysis_id: &str,
    recommendations: Value,
) -> Result<Value, DbError> {
    if analysis_id.is_empty() {
        return Err(invalid(
            "STORE_INVALID_RECOMMENDATION",
            "Thiếu mã phân tích cho danh sách đề xuất.",
        ));
    }
    let exists = connection
        .query_row(
            "SELECT 1 FROM lesson_analyses WHERE id = ?1",
            params![analysis_id],
            |_| Ok(()),
        )
        .optional()
        .map_err(db_error)?
        .is_some();
    if !exists {
        return Err(invalid(
            "STORE_INVALID_RECOMMENDATION",
            &format!("Không tìm thấy phân tích {analysis_id} để lưu đề xuất."),
        ));
    }
    let items = recommendations.as_array().cloned().unwrap_or_default();
    for item in &items {
        assert_recommendation(item)?;
    }
    let transaction = connection.unchecked_transaction().map_err(db_error)?;
    transaction
        .execute("DELETE FROM game_recommendations WHERE analysis_id = ?1", params![analysis_id])
        .map_err(db_error)?;
    for item in &items {
        let id = item.get("id").and_then(Value::as_str).unwrap_or("");
        let created_at = item
            .get("createdAt")
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(crate::library::now);
        let data_json = serde_json::to_string(item).map_err(|error| DbError::Data(error.to_string()))?;
        transaction
            .execute(
                "INSERT INTO game_recommendations (id,analysis_id,data_json,schema_version,created_at) \
                 VALUES (?1,?2,?3,?4,?5)",
                params![id, analysis_id, data_json, SCHEMA_VERSION, created_at],
            )
            .map_err(db_error)?;
    }
    transaction.commit().map_err(db_error)?;
    Ok(Value::Array(items))
}

fn list_recommendations(connection: &Connection, analysis_id: &str) -> Result<Value, DbError> {
    let mut statement = connection
        .prepare(
            "SELECT id,data_json,schema_version FROM game_recommendations \
             WHERE analysis_id = ?1 ORDER BY created_at ASC",
        )
        .map_err(db_error)?;
    let rows = statement
        .query_map(params![analysis_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, i64>(2)?))
        })
        .map_err(db_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(db_error)?;
    let mut list = Vec::with_capacity(rows.len());
    for (id, data_json, version) in rows {
        list.push(parse_recommendation(&id, &data_json, version)?);
    }
    Ok(Value::Array(list))
}

// ---------------------------------------------------------------------------
// Kiểm dữ liệu — cùng câu chữ của `lesson-store.ts`
// ---------------------------------------------------------------------------

fn parse_analysis(id: &str, data_json: &str, version: i64) -> Result<Value, DbError> {
    if version > SCHEMA_VERSION {
        return Err(invalid(
            "ANALYSIS_VERSION_UNSUPPORTED",
            &format!("Phân tích {id} dùng phiên bản {version}; ứng dụng chỉ hỗ trợ {SCHEMA_VERSION}."),
        ));
    }
    let value = parse_object(data_json, id)?;
    assert_analysis(&value)?;
    Ok(value)
}

fn parse_recommendation(id: &str, data_json: &str, version: i64) -> Result<Value, DbError> {
    if version > SCHEMA_VERSION {
        return Err(invalid(
            "STORE_VERSION_UNSUPPORTED",
            &format!("Đề xuất {id} dùng phiên bản {version}; ứng dụng chỉ hỗ trợ {SCHEMA_VERSION}."),
        ));
    }
    let value = parse_object(data_json, id)?;
    assert_recommendation(&value)?;
    Ok(value)
}

fn parse_object(data_json: &str, id: &str) -> Result<Value, DbError> {
    match serde_json::from_str::<Value>(data_json) {
        Ok(value) if value.is_object() => Ok(value),
        _ => Err(invalid(
            "STORE_CORRUPT_JSON",
            &format!("Dữ liệu của {id} bị hỏng và không thể đọc lại."),
        )),
    }
}

fn assert_analysis(value: &Value) -> Result<(), DbError> {
    let object = value
        .as_object()
        .ok_or_else(|| invalid("STORE_INVALID_ANALYSIS", "Dữ liệu phân tích không hợp lệ."))?;
    if object.get("schemaVersion").and_then(Value::as_i64) != Some(SCHEMA_VERSION) {
        return Err(invalid(
            "STORE_INVALID_ANALYSIS",
            &format!("Phân tích phải dùng schemaVersion {SCHEMA_VERSION}."),
        ));
    }
    if object.get("id").and_then(Value::as_str).unwrap_or("").is_empty()
        || object
            .get("documentId")
            .and_then(Value::as_str)
            .unwrap_or("")
            .is_empty()
    {
        return Err(invalid(
            "STORE_INVALID_ANALYSIS",
            "Phân tích cần có mã và mã tài liệu.",
        ));
    }
    for key in ["objectives", "keyConcepts", "uncertainties"] {
        if !object.get(key).map(Value::is_array).unwrap_or(false) {
            return Err(invalid(
                "STORE_INVALID_ANALYSIS",
                "Phân tích cần có mục tiêu, khái niệm và điểm chưa chắc chắn.",
            ));
        }
    }
    Ok(())
}

fn assert_recommendation(value: &Value) -> Result<(), DbError> {
    let object = value
        .as_object()
        .ok_or_else(|| invalid("STORE_INVALID_RECOMMENDATION", "Dữ liệu đề xuất không hợp lệ."))?;
    if object.get("schemaVersion").and_then(Value::as_i64) != Some(SCHEMA_VERSION) {
        return Err(invalid(
            "STORE_INVALID_RECOMMENDATION",
            &format!("Đề xuất phải dùng schemaVersion {SCHEMA_VERSION}."),
        ));
    }
    if object.get("id").and_then(Value::as_str).unwrap_or("").is_empty()
        || object
            .get("analysisId")
            .and_then(Value::as_str)
            .unwrap_or("")
            .is_empty()
        || object
            .get("gameType")
            .and_then(Value::as_str)
            .unwrap_or("")
            .is_empty()
    {
        return Err(invalid(
            "STORE_INVALID_RECOMMENDATION",
            "Đề xuất cần có mã, mã phân tích và thể loại trò chơi.",
        ));
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Tiện ích
// ---------------------------------------------------------------------------

fn invalid(code: &str, message: &str) -> DbError {
    // Renderer đọc `[CODE]` trong câu lỗi (`wizardParseError`), nên mã đi cùng
    // câu chữ thay vì một trường riêng — IPC của Tauri chỉ chuyển chuỗi.
    DbError::Invalid(format!("[{code}] {message}"))
}

fn db_error(error: rusqlite::Error) -> DbError {
    DbError::Io(format!("truy vấn kho giáo án: {error}"))
}

fn with_created_at(value: &Value, created_at: &str) -> Value {
    let mut copy = value.clone();
    if let Some(object) = copy.as_object_mut() {
        object.insert("createdAt".to_string(), Value::String(created_at.to_string()));
    }
    copy
}

fn number_or(value: Option<&Value>, fallback: i64) -> i64 {
    value
        .and_then(Value::as_f64)
        .filter(|number| number.is_finite() && *number >= 0.0)
        .map(|number| number.round() as i64)
        .unwrap_or(fallback)
}

fn normalize_ext(ext: &str) -> String {
    let value = ext.trim().to_lowercase();
    if value.is_empty() {
        "txt".to_string()
    } else {
        value.trim_start_matches('.').to_string()
    }
}

fn sha256_hex(text: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(text.as_bytes());
    hex::encode(hasher.finalize())
}

/// UUID v4 từ nguồn ngẫu nhiên của hệ điều hành; cùng hình dạng `randomUUID`
/// của `node:crypto` mà Electron dùng cho `doc_<uuid>`.
fn new_uuid() -> String {
    let mut bytes = [0_u8; 16];
    let _ = getrandom::fill(&mut bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
        bytes[8], bytes[9], bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]
    )
}

/// Đường dẫn tuyệt đối tới tệp văn bản của một tài liệu.
pub fn text_path(data_dir: &Path, document_id: &str) -> PathBuf {
    data_dir.join("lessons").join(format!("{document_id}.txt"))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Kho thật nhưng trên bộ nhớ: cùng câu DDL mà `storage::ensure_schema`
    /// chạy, nên test bắt được lệch cột chứ không chỉ lệch hàm.
    fn store() -> (tempfile::TempDir, Connection) {
        let data = tempfile::tempdir().expect("tempdir");
        let connection = Connection::open_in_memory().expect("sqlite");
        connection
            .execute_batch(crate::storage::STORE_SCHEMA_SQL)
            .expect("lesson schema");
        (data, connection)
    }

    fn analysis(document_id: &str) -> Value {
        json!({
            "id": "analysis_test_1",
            "schemaVersion": 1,
            "documentId": document_id,
            "createdAt": "2026-01-01T00:00:00.000Z",
            "subject": "Sinh học",
            "grade": 7,
            "topic": "Quang hợp ở thực vật",
            "objectives": [
                {
                    "id": "obj_1",
                    "description": "Nêu được vai trò của ánh sáng.",
                    "cognitiveLevel": "remember"
                }
            ],
            "keyConcepts": [
                { "id": "concept_1", "term": "Quang hợp", "explanation": "Tổng hợp chất hữu cơ." }
            ],
            "uncertainties": [],
            "sourceDocumentIds": [document_id]
        })
    }

    fn recommendation(analysis_id: &str) -> Value {
        json!({
            "id": "rec_test_1",
            "schemaVersion": 1,
            "analysisId": analysis_id,
            "gameType": "arena",
            "title": "Đấu trường quang hợp",
            "createdAt": "2026-01-01T00:00:00.000Z"
        })
    }

    #[test]
    fn a_document_round_trips_through_the_lesson_file_and_the_index() {
        let (data, connection) = store();
        let text = "I. Mục tiêu\n- Nêu được vai trò của ánh sáng.\nII. Nội dung\n- Quang hợp.";
        let saved = dispatch(
            &connection,
            data.path(),
            "save-document",
            &[json!({ "name": "giao-an.txt", "ext": ".TXT", "text": text })],
        )
        .expect("save");
        let id = saved["id"].as_str().unwrap_or("").to_string();
        // Electron sinh `doc_<uuid v4>` khi payload không có documentId.
        assert!(id.starts_with("doc_"), "{saved}");
        assert_eq!(saved["ext"], "txt");
        assert_eq!(saved["characters"], text.encode_utf16().count() as i64);
        assert_eq!(
            saved["sizeBytes"],
            text.as_bytes().len() as i64,
            "sizeBytes là byte UTF-8, không phải số ký tự"
        );
        assert!(text_path(data.path(), &id).is_file(), "thiếu tệp .txt");

        let read = dispatch(&connection, data.path(), "get-document", &[json!(id.as_str())])
            .expect("get");
        assert_eq!(read["text"], text);
        assert_eq!(read["sha256"], sha256_hex(text));

        let library = dispatch(&connection, data.path(), "library", &[]).expect("library");
        let documents = library.as_array().expect("array");
        assert_eq!(documents.len(), 1);
        assert_eq!(documents[0]["id"], id);
        assert_eq!(documents[0]["sourceAvailable"], true);
        assert!(documents[0].get("text").is_none(), "thư viện không kèm văn bản");
        assert_eq!(documents[0]["analyses"], json!([]));
    }

    #[test]
    fn saving_the_same_document_id_updates_in_place_and_keeps_created_at() {
        let (data, connection) = store();
        let first = dispatch(
            &connection,
            data.path(),
            "save-document",
            &[json!({
                "documentId": "doc_fixed",
                "name": "cu.txt",
                "ext": "txt",
                "text": "bản cũ"
            })],
        )
        .expect("first");
        let second = dispatch(
            &connection,
            data.path(),
            "save-document",
            &[json!({
                "documentId": "doc_fixed",
                "name": "moi.txt",
                "ext": "txt",
                "text": "bản mới dài hơn"
            })],
        )
        .expect("second");
        assert_eq!(second["id"], "doc_fixed");
        assert_eq!(second["name"], "moi.txt");
        // `createdAt` không bị ghi đè khi hàng đã tồn tại.
        assert_eq!(second["createdAt"], first["createdAt"]);
        assert_eq!(
            std::fs::read_to_string(text_path(data.path(), "doc_fixed")).expect("text"),
            "bản mới dài hơn"
        );
        let library = dispatch(&connection, data.path(), "library", &[]).expect("library");
        assert_eq!(library.as_array().map(Vec::len), Some(1));
    }

    #[test]
    fn an_analysis_is_found_by_document_and_cache_key_then_listed_with_the_document() {
        let (data, connection) = store();
        let saved = dispatch(
            &connection,
            data.path(),
            "save-document",
            &[json!({ "documentId": "doc_1", "name": "a.txt", "ext": "txt", "text": "bài" })],
        )
        .expect("save document");
        assert_eq!(saved["id"], "doc_1");

        let value = analysis("doc_1");
        let stored = dispatch(
            &connection,
            data.path(),
            "save-analysis",
            &[value.clone(), json!({ "cacheKey": "analysis_v1_test" })],
        )
        .expect("save analysis");
        assert_eq!(stored["id"], "analysis_test_1");
        assert_eq!(stored["createdAt"], "2026-01-01T00:00:00.000Z");

        let hit = dispatch(
            &connection,
            data.path(),
            "find-analysis-cache",
            &[json!("doc_1"), json!("analysis_v1_test")],
        )
        .expect("cache hit");
        assert_eq!(hit["id"], "analysis_test_1");
        let miss = dispatch(
            &connection,
            data.path(),
            "find-analysis-cache",
            &[json!("doc_1"), json!("analysis_v1_other")],
        )
        .expect("cache miss");
        assert!(miss.is_null());
        let other_document = dispatch(
            &connection,
            data.path(),
            "find-analysis-cache",
            &[json!("doc_2"), json!("analysis_v1_test")],
        )
        .expect("other document");
        assert!(other_document.is_null(), "cache key phải gắn với tài liệu");

        let library = dispatch(&connection, data.path(), "library", &[]).expect("library");
        assert_eq!(library[0]["analyses"][0]["id"], "analysis_test_1");
    }

    #[test]
    fn recommendations_replace_the_previous_set_for_one_analysis() {
        let (data, connection) = store();
        dispatch(
            &connection,
            data.path(),
            "save-document",
            &[json!({ "documentId": "doc_1", "name": "a.txt", "ext": "txt", "text": "bài" })],
        )
        .expect("document");
        dispatch(
            &connection,
            data.path(),
            "save-analysis",
            &[analysis("doc_1"), json!({ "cacheKey": "analysis_v1_test" })],
        )
        .expect("analysis");
        dispatch(
            &connection,
            data.path(),
            "save-recommendations",
            &[json!("analysis_test_1"), json!([recommendation("analysis_test_1")])],
        )
        .expect("first set");
        let first = dispatch(
            &connection,
            data.path(),
            "list-recommendations",
            &[json!("analysis_test_1")],
        )
        .expect("list");
        assert_eq!(first.as_array().map(Vec::len), Some(1));

        let mut replaced = recommendation("analysis_test_1");
        replaced["id"] = json!("rec_test_2");
        replaced["gameType"] = json!("matching");
        dispatch(
            &connection,
            data.path(),
            "save-recommendations",
            &[json!("analysis_test_1"), json!([replaced])],
        )
        .expect("replacement");
        let second = dispatch(
            &connection,
            data.path(),
            "list-recommendations",
            &[json!("analysis_test_1")],
        )
        .expect("list again");
        assert_eq!(second.as_array().map(Vec::len), Some(1));
        assert_eq!(second[0]["id"], "rec_test_2");
        assert_eq!(second[0]["gameType"], "matching");
    }

    #[test]
    fn deleting_a_document_removes_its_file_analyses_and_recommendations() {
        let (data, connection) = store();
        dispatch(
            &connection,
            data.path(),
            "save-document",
            &[json!({ "documentId": "doc_1", "name": "a.txt", "ext": "txt", "text": "bài" })],
        )
        .expect("document");
        dispatch(
            &connection,
            data.path(),
            "save-analysis",
            &[analysis("doc_1"), json!({ "cacheKey": "analysis_v1_test" })],
        )
        .expect("analysis");
        dispatch(
            &connection,
            data.path(),
            "save-recommendations",
            &[json!("analysis_test_1"), json!([recommendation("analysis_test_1")])],
        )
        .expect("recommendations");

        let deleted = dispatch(
            &connection,
            data.path(),
            "delete-document",
            &[json!("doc_1")],
        )
        .expect("delete");
        assert_eq!(deleted, Value::Bool(true));
        assert!(!text_path(data.path(), "doc_1").exists());
        assert!(dispatch(&connection, data.path(), "library", &[])
            .expect("library")
            .as_array()
            .map(Vec::is_empty)
            .unwrap_or(false));
        assert!(dispatch(
            &connection,
            data.path(),
            "get-analysis",
            &[json!("analysis_test_1")]
        )
        .expect("analysis")
        .is_null());
        assert!(dispatch(
            &connection,
            data.path(),
            "list-recommendations",
            &[json!("analysis_test_1")]
        )
        .expect("recommendations")
        .as_array()
        .map(Vec::is_empty)
        .unwrap_or(false));
    }

    #[test]
    fn invalid_input_keeps_the_vietnamese_code_and_sentence() {
        let (data, connection) = store();
        let error = dispatch(
            &connection,
            data.path(),
            "save-document",
            &[json!({ "name": "a.txt", "ext": "txt" })],
        )
        .expect_err("thiếu văn bản");
        assert_eq!(error.code(), "DB_INVALID_INPUT");
        assert!(error.to_string().contains("[STORE_INVALID_DOCUMENT]"), "{error}");
        assert!(
            error.to_string().contains("Tài liệu cần có nội dung văn bản."),
            "{error}"
        );

        let error = dispatch(
            &connection,
            data.path(),
            "save-analysis",
            &[json!({ "id": "analysis_bad", "documentId": "doc_1" })],
        )
        .expect_err("thiếu mảng");
        assert!(
            error.to_string().contains("[STORE_INVALID_ANALYSIS]"),
            "{error}"
        );
    }
}
