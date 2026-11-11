//! Vỏ Tauri v2 của EduGame Studio — giai đoạn 1 của kế hoạch chuyển đổi.
//!
//! Giai đoạn 1 chỉ chạy UI đã đóng gói sẵn trong WebView2 với HTML/CSS/thứ tự
//! script y như bản Electron, trong một định danh ứng dụng và thư mục dữ liệu
//! riêng (quyết định #251 câu 2). Không đọc, không ghi profile Electron.
//!
//! Giai đoạn 3 mở `edugame.sqlite` một lần trong `setup` (`library::install`) và
//! giữ kết nối trong state của ứng dụng; mọi kênh `library:*` chạy trên đó. Nhóm
//! nhập tệp ảnh dùng giao thức `edugame-file:` thay cho `protocol.handle` của
//! Electron — cùng một kho ảnh, cùng luật chỉ phục vụ id do app sinh ra.

pub mod ai_local;
pub mod api;
pub mod base64;
pub mod diagnostics;
pub mod document;
pub mod embedded;
pub mod illustration;
pub mod library;
pub mod migration;
pub mod package;
pub mod paths;
pub mod picker;
pub mod secrets;
pub mod settings;
pub mod setup;
pub mod sql_params;
pub mod storage;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        // Hộp thoại mở/lưu của gói `.egame`. Plugin chỉ được Rust gọi
        // (`AppHandle::dialog()`); frontend không có quyền `dialog:*` nào.
        .plugin(tauri_plugin_dialog::init())
        // Ảnh minh hoạ: `edugame-file://img/<id>` đọc đúng một tệp `<id>.img`
        // trong `<data>/images`. Cùng CSP với bản Electron (`img-src` cho phép
        // `edugame-file:`), và không tệp nào khác trên đĩa đọc được từ trang.
        .register_uri_scheme_protocol("edugame-file", |ctx, request| {
            let bytes = ctx
                .app_handle()
                .try_state::<library::Library>()
                .and_then(|library| illustration::read_image(&library.images_dir(), request.uri().path()));
            match bytes {
                Some(image) => tauri::http::Response::builder()
                    .status(200)
                    .header(tauri::http::header::CONTENT_TYPE, image.mime)
                    .header(tauri::http::header::CACHE_CONTROL, "no-cache")
                    .body(image.bytes)
                    .unwrap_or_else(|_| not_found()),
                None => not_found(),
            }
        })
        .setup(|app| {
            // Không mở được thư viện thì dừng hẳn: một cửa sổ mà mọi lệnh lưu/xoá
            // đều hỏng sẽ khiến giáo viên tưởng đã mất dữ liệu.
            library::Library::install(app.handle()).map_err(|error| Box::<dyn std::error::Error>::from(error.to_string()))?;
            // Log chẩn đoán mở sau thư viện: thư mục log nằm cùng thư mục dữ liệu,
            // và một dòng `app.start` lỗi thư mục không được chặn cửa sổ.
            diagnostics::Logs::install(app.handle()).map_err(|error| Box::<dyn std::error::Error>::from(error))?;
            // AI local: danh mục/tải model và tiến trình llama-server do vỏ này
            // quản lý. State rỗng cho tới lần tải/khởi động đầu tiên.
            app.manage(ai_local::AiLocal::default());
            // Wizard cài đặt lần đầu: trạng thái bền vững ở `setup.rs`, khóa
            // chạy/cờ hủy/cache kế hoạch ở đây.
            app.manage(setup::Setup::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            api::app_info,
            api::shell_info,
            // Giai đoạn 2: hai cửa chung cho façade renderer (xem api.rs đầu tệp).
            api::invoke_channel,
            api::send_channel,
            api::get_library,
            api::get_settings,
            api::get_local_ai_models,
            api::set_fullscreen,
            api::save_game,
            api::delete_game,
            api::delete_games,
            api::save_session,
            api::delete_sessions,
            api::save_lesson_document,
            api::get_lesson_document,
            api::list_lesson_library,
            api::delete_lesson_document,
            api::delete_lesson_documents,
            api::save_project_draft,
            api::get_project,
            api::list_projects,
            api::delete_project,
            api::delete_projects,
            api::import_document,
            api::import_document_from_path,
            api::import_questions,
            api::export_game,
            api::import_game,
            // Giai đoạn 4: phát hiện / chọn tay / nhập profile Electron. Ba kênh
            // này không thuộc preload Electron; chỉ façade Tauri gọi.
            api::migration_detect,
            api::migration_browse,
            api::migration_import,
            api::save_settings,
            api::get_ai_providers,
            api::test_ai_provider,
            api::get_local_runtime_status,
            api::install_local_ai_model,
            api::start_local_runtime,
            api::stop_local_runtime,
            api::cancel_ai,
            api::list_ai_tasks,
            api::verify_cpu_runtime,
            api::get_setup_status,
            api::preflight_setup,
            api::start_setup,
            api::cancel_setup,
            api::export_diagnostics,
            api::diagnostics_info,
            api::clear_diagnostics,
            api::open_diagnostics_folder,
            api::analyze_lesson,
            api::classify_lesson_input,
            api::convert_lesson_draft,
            api::inspect_lesson_structure,
            api::preview_lesson_selection,
            api::send_lesson_chat,
            api::list_lesson_chats,
            api::get_lesson_chat,
            api::delete_lesson_chats,
            api::recommend_games,
            api::estimate_lesson_capacity,
            api::get_lesson_analysis,
            api::save_lesson_analysis,
            api::get_lesson_recommendations,
            api::generate_lesson_draft,
            api::regenerate_lesson_item,
            api::check_lesson_quality,
            api::patch_lesson_item_assets,
            api::import_illustration,
            api::delete_illustration,
            api::generate_game,
            api::start_presentation,
            api::stop_presentation,
            api::toggle_presentation,
            api::get_displays,
            api::open_about,
            api::about_info,
            api::about_state,
            api::about_check,
            api::about_download,
            api::about_install,
            api::about_open_releases,
            api::lan_start,
            api::lan_stop,
            api::lan_assign_team,
            api::lan_begin,
            api::lan_next,
            api::lan_finish,
        ])
        .run(tauri::generate_context!())
        .expect("không khởi động được vỏ Tauri");
}

/// Câu trả lời của mọi đường dẫn `edugame-file:` không được phục vụ — cùng câu
/// "Not found" của handler bên `main.ts`.
fn not_found() -> tauri::http::Response<Vec<u8>> {
    tauri::http::Response::builder()
        .status(tauri::http::StatusCode::NOT_FOUND)
        .header(tauri::http::header::CONTENT_TYPE, "text/plain")
        .body(b"Not found".to_vec())
        .expect("câu trả lời 404 dựng được")
}
