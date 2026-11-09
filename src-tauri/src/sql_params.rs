//! Đổi tham số SQL từ JSON (JS gửi sang) thành tham số ràng buộc của `rusqlite`.
//!
//! Cầu giữa V8 nhúng (`library-ops.ts`) và SQLite chỉ nhận ba kiểu mà bảng của
//! ứng dụng dùng: chuỗi, số nguyên, và `null`. Không nhận object hay mảng —
//! `better-sqlite3` ném với đúng loại giá trị đó, và một mảng lỡ tay không được
//! phép biến thành chuỗi `"[object Object]"` rồi ghi vào `data_json`.
//!
//! Tên tham số (`@id`) là phần cố định của câu SQL, do mã nguồn Rust/TS viết;
//! giá trị là dữ liệu giáo viên, chỉ đi qua đây. Vì vậy không có đường nào ghép
//! dữ liệu vào chữ SQL.

use rusqlite::types::Value;
use serde_json::Map;

use crate::storage::DbError;

/// Đổi object `{tên: giá trị}` thành tham số có tên cho `rusqlite`.
///
/// `Vec` giữ thứ tự JSON, nhưng `rusqlite` khớp theo `@tên`, không theo vị trí.
pub fn named(params: &Map<String, serde_json::Value>) -> Result<Vec<(String, Value)>, DbError> {
    let mut named = Vec::with_capacity(params.len());
    for (name, value) in params {
        let bound = match value {
            serde_json::Value::Null => Value::Null,
            serde_json::Value::Bool(flag) => Value::Integer(i64::from(*flag)),
            serde_json::Value::Number(number) => {
                let integer = number.as_i64().ok_or_else(|| {
                    DbError::Data(format!("tham số @{name} phải là số nguyên, nhận {number}"))
                })?;
                Value::Integer(integer)
            }
            serde_json::Value::String(text) => Value::Text(text.clone()),
            serde_json::Value::Array(_) | serde_json::Value::Object(_) => {
                return Err(DbError::Data(format!(
                    "tham số @{name} phải là chuỗi, số hoặc null"
                )));
            }
        };
        named.push((name.clone(), bound));
    }
    Ok(named)
}

/// Đọc một dòng kết quả thành object JSON theo tên cột.
///
/// Blob là lỗi chứ không phải chuỗi mất dấu: bảng của ứng dụng chỉ dùng
/// TEXT/INTEGER/REAL/NULL, nên một BLOB ở đây nghĩa là ai đó đã ghi sai chỗ, và
/// renderer không được nhận một chuỗi trông giống dữ liệu thật.
pub fn row_to_json(
    row: &rusqlite::Row<'_>,
    column_count: usize,
    names: &[String],
) -> rusqlite::Result<serde_json::Value> {
    let mut object = Map::with_capacity(column_count);
    for (index, name) in names.iter().enumerate().take(column_count) {
        let value = row.get_ref(index)?;
        let json = match value {
            rusqlite::types::ValueRef::Null => serde_json::Value::Null,
            rusqlite::types::ValueRef::Integer(number) => serde_json::Value::from(number),
            rusqlite::types::ValueRef::Real(number) => serde_json::Value::from(number),
            rusqlite::types::ValueRef::Text(bytes) => {
                serde_json::Value::from(String::from_utf8_lossy(bytes).into_owned())
            }
            rusqlite::types::ValueRef::Blob(_) => {
                return Err(rusqlite::Error::InvalidColumnType(
                    index,
                    name.clone(),
                    rusqlite::types::Type::Blob,
                ));
            }
        };
        object.insert(name.clone(), json);
    }
    Ok(serde_json::Value::Object(object))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn map(value: serde_json::Value) -> Map<String, serde_json::Value> {
        value.as_object().cloned().expect("object")
    }

    #[test]
    fn passes_text_integer_and_null_through() {
        let params = named(&map(json!({ "id": "g1", "n": 3, "none": null, "flag": true }))).unwrap();
        let by_name = |wanted: &str| {
            params
                .iter()
                .find(|(name, _)| name == wanted)
                .map(|(_, value)| value.clone())
        };
        assert_eq!(by_name("id"), Some(Value::Text("g1".into())));
        assert_eq!(by_name("n"), Some(Value::Integer(3)));
        assert_eq!(by_name("none"), Some(Value::Null));
        assert_eq!(by_name("flag"), Some(Value::Integer(1)));
    }

    #[test]
    fn refuses_nested_values_instead_of_coercing_them() {
        // Ghép một object thành chuỗi là cách `data_json` bị nội dung rác ghi đè.
        let error = named(&map(json!({ "data_json": { "a": 1 } }))).unwrap_err();
        assert_eq!(error.code(), "DB_DATA_CORRUPT");
        assert!(error.to_string().contains("data_json"), "{error}");
        let error = named(&map(json!({ "h": 1.5 }))).unwrap_err();
        assert!(error.to_string().contains("số nguyên"), "{error}");
    }
}
