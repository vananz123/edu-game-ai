//! Hộp thoại tệp của tiến trình, KHÔNG chặn vòng lặp chính.
//!
//! `blocking_pick_file()`/`blocking_save_file()` của `tauri-plugin-dialog` chờ
//! trên một kênh đồng bộ trong khi `pick_file()` post một `Message::Task` lên
//! luồng chính để dựng hộp thoại. Hàm lệnh Tauri đồng bộ chạy NGAY trên luồng
//! chính, và `run_on_main_thread` từ chính luồng đó thực thi tác vụ tại chỗ —
//! nên hộp thoại được dựng bên trong lời gọi chờ, rồi cả cửa sổ đóng băng cho
//! tới khi có ai đó bấm nút: không một khung modal nào vẽ ra. Một lệnh `async`
//! chạy trên runtime của Tauri; ở đó `pick_file` xếp tác vụ THẬT xuống luồng
//! chính, luồng chính vẽ hộp thoại, và lời gọi tỉnh lại khi giáo viên chọn xong.
//!
//! KHÔNG đẩy việc của lệnh sang `spawn_blocking`: trên luồng đó
//! `AppHandle::try_state` không thấy state nào, nên mọi kênh cần thư viện (cùng
//! mọi `State` kèm vòng đời) chết ở đó thay vì trả lỗi. Hộp thoại chuyển sang
//! một luồng khác; phần đọc/ghi TỆP (không cần `AppHandle`) vẫn đi qua
//! `spawn_blocking` bằng `io`.

use std::path::PathBuf;

use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, FileDialogBuilder, FilePath};

use crate::document::fail;

/// Chạy một việc đọc/ghi tệp thuần trên luồng chặn của Tauri.
///
/// Việc được đẩy sang chỉ là đường dẫn và byte — không `AppHandle`, không state:
/// cái gì cần thư viện thì phải chờ ở đây, trên luồng của runtime.
pub(crate) async fn io<T, F>(task: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|error| fail("EG_RUNTIME", format!("luồng nền không trả được kết quả: {error}")))?
}

/// Dựng hộp thoại của `build` rồi chờ giáo viên chọn — không bao giờ chờ trên
/// luồng chính, nên cửa sổ vẫn vẽ. `None` = đóng hộp thoại mà không chọn.
///
/// `build` chỉ chạm state của plugin `dialog` (xem `AppHandle::dialog`), không
/// chạm cửa sổ native, nên chạy nó trên một luồng chặn là an toàn.
pub(crate) async fn choose<F>(app: &AppHandle, build: F) -> Option<FilePath>
where
    F: FnOnce(&AppHandle) -> FileDialogBuilder<tauri::Wry> + Send + 'static,
{
    let handle = app.clone();
    let (picked, answer) = std::sync::mpsc::channel();
    let started = tauri::async_runtime::spawn_blocking(move || {
        build(&handle).pick_file(move |path| {
            // Người nhận đã bỏ đi (lệnh bị huỷ) thì lời hứa đã chết: không ném.
            let _ = picked.send(path);
        });
    });
    // Lời gọi `pick_file` chỉ xếp tác vụ rồi trả về; lỗi của nó (không xếp được)
    // để kênh đóng và `answer` trả `Err` — đúng nghĩa "không chọn được gì".
    let _ = started.await;
    answer.recv().ok().flatten()
}

/// Mở một hộp thoại chọn tệp với tiêu đề, bộ lọc và tên gợi ý — cả bốn lệnh
/// nhập/xuất dùng chung đúng hình dạng này.
pub(crate) async fn pick(app: &AppHandle, title: &'static str, filters: &'static [(&'static str, &'static [&'static str])]) -> Option<PathBuf> {
    let chosen = choose(app, move |app| {
        let mut builder = app.dialog().file().set_title(title);
        for &(name, extensions) in filters {
            builder = builder.add_filter(name, extensions);
        }
        builder
    })
    .await?;
    to_path(chosen).ok()
}

/// Đường dẫn đã chọn dưới dạng `PathBuf`; `FilePath` không chuyển được là lỗi.
pub(crate) fn to_path(picked: FilePath) -> Result<PathBuf, String> {
    picked.into_path().map_err(|error| fail("EG_PATH", error.to_string()))
}
