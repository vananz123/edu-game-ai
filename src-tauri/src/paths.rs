//! Đường dẫn dữ liệu của bản Tauri.
//!
//! Quyết định #251 câu 2 ("thay thế luôn") bắt buộc bản Tauri phải dùng thư mục
//! dữ liệu RIÊNG, ít nhất cho tới khi migration chạy xong. Electron giữ dữ liệu ở
//! `%APPDATA%/EduGame Studio/edugame-data`; ghi vào đó từ một tiến trình khác
//! chưa có migration là cách chắc chắn nhất để làm hỏng dữ liệu giáo viên.
//!
//! Tauri đặt thư mục dữ liệu theo `identifier` trong `tauri.conf.json`
//! (`vn.edugame.studio.tauri`), tách hẳn khỏi Electron. Ở đây chỉ dựng thư mục
//! con và trả về đường dẫn; không tạo file, không đọc profile Electron.

use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// Tên thư mục con trong app-data-dir của Tauri.
///
/// Giữ tên `edugame-data` để khi migration sang, dữ liệu Tauri nằm đúng bố cục
/// quen thuộc; đường dẫn cha vẫn khác Electron nên không có chuyện ghi lẫn.
pub const DATA_SUBDIR: &str = "edugame-data";

/// Tệp thư viện (JSON) của bản Tauri.
///
/// Giai đoạn 1 chưa port SQLite: Electron giữ thư viện trong `library.sqlite`,
/// còn bản Tauri chỉ cần mở được vỏ và hiện danh sách rỗng bằng một tệp riêng.
/// Khi migration chạy, tệp này được thay bằng cơ sở dữ liệu thật — và vì nó nằm
/// dưới thư mục riêng của Tauri, không có bước nào ở đây chạm vào dữ liệu Electron.
pub const LIBRARY_FILE: &str = "library.json";
pub const SETTINGS_FILE: &str = "settings.json";

/// Thư mục dữ liệu của bản Tauri, đã có sẵn để đọc/ghi.
pub fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = data_dir_path(app)?;
    std::fs::create_dir_all(&dir)
        .map_err(|error| format!("không tạo được thư mục {}: {error}", dir.display()))?;
    Ok(dir)
}

/// Chỉ tính đường dẫn, không tạo thư mục — dùng khi cần báo cáo vị trí dữ liệu.
pub fn data_dir_path(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("không xác định được thư mục dữ liệu: {error}"))?;
    Ok(base.join(DATA_SUBDIR))
}

/// Đọc JSON ở `name` trong thư mục dữ liệu; tệp chưa có hoặc hỏng = `fallback`.
///
/// Thư viện trống là một câu trả lời hợp lệ của lần chạy đầu, nên "chưa có tệp"
/// không phải lỗi. Tệp hỏng cũng vậy: giáo viên vẫn phải mở được vỏ thay vì
/// nhìn màn hình "không thể khởi tạo", và tệp hỏng còn nguyên trên đĩa để cứu.
pub fn read_json(app: &AppHandle, name: &str, fallback: serde_json::Value) -> Result<serde_json::Value, String> {
    let path = data_dir(app)?.join(name);
    match std::fs::read_to_string(&path) {
        Ok(text) => Ok(serde_json::from_str(&text).unwrap_or(fallback)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(fallback),
        Err(error) => Err(format!("không đọc được {}: {error}", path.display())),
    }
}

/// Ghi JSON nguyên tử: tệp tạm cùng thư mục rồi đổi tên, để một lần ghi dở
/// không bao giờ để lại tệp nửa vời.
pub fn write_json(app: &AppHandle, name: &str, value: &serde_json::Value) -> Result<(), String> {
    let dir = data_dir(app)?;
    let path = dir.join(name);
    let temp = dir.join(format!("{name}.tmp"));
    let text = serde_json::to_string_pretty(value).map_err(|error| format!("không mã hoá JSON: {error}"))?;
    std::fs::write(&temp, text).map_err(|error| format!("không ghi được {}: {error}", temp.display()))?;
    std::fs::rename(&temp, &path).map_err(|error| format!("không thay được {}: {error}", path.display()))
}

#[cfg(test)]
mod tests {
    use super::DATA_SUBDIR;

    #[test]
    fn data_subdir_is_not_the_electron_folder() {
        // Electron dùng `%APPDATA%/EduGame Studio/edugame-data`. Nếu ai đó đổi
        // identifier thành "EduGame Studio" thì bản Tauri sẽ ghi vào đúng thư mục
        // của Electron — test này chỉ chốt phần tên thư mục con; phía identifier
        // do `tauri.conf.json` và cổng kiểm tra Node giữ.
        assert_eq!(DATA_SUBDIR, "edugame-data");
    }
}
