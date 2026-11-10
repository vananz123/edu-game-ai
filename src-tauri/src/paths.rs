//! Đường dẫn dữ liệu của bản Tauri.
//!
//! Quyết định #251 câu 2 ("thay thế luôn") bắt buộc bản Tauri phải dùng thư mục
//! dữ liệu RIÊNG, ít nhất cho tới khi migration chạy xong. Electron giữ dữ liệu ở
//! `%APPDATA%/edugame-studio/edugame-data`; ghi vào đó từ một tiến trình khác
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

/// Tệp cài đặt (JSON) của bản Tauri.
///
/// Thư viện KHÔNG còn nằm ở đây: từ giai đoạn 3 nó là `edugame.sqlite` trong
/// cùng thư mục (`storage::DB_FILE`, mở bởi `library::open`). Cài đặt vẫn là
/// một tệp JSON riêng vì chưa có bảng nào cho nó trong schema 0.5.1.
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
    // Cổng kiểm tra chạy trên binary release thật, nên không thể dùng một bản
    // dựng riêng để đổi thư mục. Chỉ khi tiến trình cha đặt CẢ HAI biến
    // `EDUGAME_TAURI_GATE=1` và `EDUGAME_TAURI_DATA_DIR=<thư mục tạm>` thì mới
    // chuyển hướng; một biến đơn lẻ (hoặc biến do giáo viên lỡ đặt) bị bỏ qua.
    // Nhờ vậy cổng không bao giờ ghi vào `%APPDATA%/vn.edugame.studio.tauri`
    // của máy đang dùng để kiểm.
    if let Some(dir) = gate_data_dir() {
        return Ok(dir);
    }
    let base = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("không xác định được thư mục dữ liệu: {error}"))?;
    Ok(base.join(DATA_SUBDIR))
}

/// Thư mục dữ liệu của cổng kiểm tra, chỉ có khi cả hai biến môi trường hợp lệ.
fn gate_data_dir() -> Option<PathBuf> {
    if std::env::var("EDUGAME_TAURI_GATE").ok().as_deref() != Some("1") {
        return None;
    }
    let value = std::env::var_os("EDUGAME_TAURI_DATA_DIR")?;
    if value.is_empty() {
        return None;
    }
    Some(PathBuf::from(value))
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
        // Electron dùng `%APPDATA%/edugame-studio/edugame-data`. Nếu ai đó đổi
        // identifier thành "edugame-studio" thì bản Tauri sẽ ghi vào đúng thư mục
        // của Electron — test này chỉ chốt phần tên thư mục con; phía identifier
        // do `tauri.conf.json` và cổng kiểm tra Node giữ.
        assert_eq!(DATA_SUBDIR, "edugame-data");
    }
}
