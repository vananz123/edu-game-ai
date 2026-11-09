//! Các lệnh IPC mà vỏ Tauri mở ra cho renderer.
//!
//! Giai đoạn 1 chỉ có bốn lệnh dữ liệu thật (`getLibrary`, `getSettings`,
//! `getLocalAiModels` và `appInfo`); chúng đọc/ghi trong thư mục dữ liệu riêng
//! của Tauri. Không lệnh nào giả vờ thành công: một kênh chưa port phải báo lỗi
//! để giáo viên biết, thay vì lặng lẽ trả dữ liệu rỗng.
//!
//! Phần còn lại của hợp đồng Electron (xem `src/shared/desktop-contract.json`)
//! được đăng ký bằng `unsupported!` để renderer nhận một lỗi đọc được thay vì
//! "command not found" của Tauri. `tests/unit/tauri-contract.test.ts` so danh
//! sách dưới đây với JSON, nên thêm kênh ở preload mà quên ở đây là đỏ cổng.
//!
//! Kênh `send` (3 kênh) không có đường tương đương trong `invoke_handler`;
//! `requestPresentationState`/`sendPresentationExit`/`sendPresentationState`
//! thuộc trình chiếu — vòng 2 theo #251 câu 1.

use serde::Serialize;
use tauri::AppHandle;

use crate::paths;

/// Lệnh đã có thân thật, kèm kênh Electron mà nó phục vụ.
///
/// Bảng này là nguồn duy nhất cho việc sinh bảng `COMMANDS` của cầu
/// `edugame-bridge.js` (`scripts/build-tauri-frontend.js` đọc đúng dòng đầu của
/// mỗi nhánh). Tauri đăng ký lệnh theo tên hàm Rust, không theo chuỗi kênh, nên
/// thiếu dòng ở đây nghĩa là cầu không gọi được lệnh dù `generate_handler!` có.
pub fn hand_written(command: &str) -> Option<(&'static str, &'static str)> {
    Some(match command {
        "app_info" => ("app:info", "app_info"),
        "shell_info" => ("shell:info", "shell_info"),
        "get_library" => ("library:get", "get_library"),
        "get_settings" => ("settings:get", "get_settings"),
        "get_local_ai_models" => ("ai:local-models", "get_local_ai_models"),
        _ => return None,
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    version: String,
    platform: &'static str,
    user_data: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellInfo {
    shell: &'static str,
    data_dir: String,
    electron_data_dir_untouched: bool,
}

#[tauri::command]
pub fn app_info(app: AppHandle) -> Result<AppInfo, String> {
    let user_data = paths::data_dir(&app)?;
    Ok(AppInfo {
        version: app.package_info().version.to_string(),
        platform: std::env::consts::OS,
        user_data: user_data.display().to_string(),
    })
}

/// Thư viện của bản Tauri: `{version, games, sessions}` đúng hình dạng `readDb()`
/// của Electron trả về. Chưa có tệp = thư viện rỗng của lần chạy đầu.
#[tauri::command]
pub fn get_library(app: AppHandle) -> Result<serde_json::Value, String> {
    paths::read_json(&app, paths::LIBRARY_FILE, empty_library())
}

fn empty_library() -> serde_json::Value {
    serde_json::json!({ "version": 1, "games": [], "sessions": [] })
}

/// Cài đặt của bản Tauri. Bản thử giai đoạn 1 chưa có trang Cài đặt đầy đủ, nên
/// chỉ trả mặc định đủ để renderer áp giao diện sáng và không thấy AI nào bật.
#[tauri::command]
pub fn get_settings(app: AppHandle) -> Result<serde_json::Value, String> {
    paths::read_json(&app, paths::SETTINGS_FILE, default_settings())
}

fn default_settings() -> serde_json::Value {
    serde_json::json!({
        "ai": {
            "mode": "offline",
            "baseUrl": "",
            "model": "",
            "provider": "local",
            "providerPolicy": "auto",
            "providers": [],
            "hasKey": false,
            "keyMasked": "",
            "picker": { "show": false, "options": [], "activeId": "local" }
        },
        "preferences": { "sound": true, "largeText": false, "theme": "system" }
    })
}

/// Danh mục AI local của bản Tauri: rỗng, và `runtimeSupported: false` để mọi
/// nút tải/chạy trong giao diện không hứa điều vỏ này chưa làm được.
#[tauri::command]
pub fn get_local_ai_models() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "models": [],
        "machine": {
            "runtimeInstalled": false,
            "runtimeState": "STOPPED",
            "runtimeSupported": false
        }
    }))
}

/// Thông tin vỏ đang chạy: renderer và cổng kiểm tra phân biệt được Tauri với
/// Electron, và biết thư mục dữ liệu nằm ở đâu.
#[tauri::command]
pub fn shell_info(app: AppHandle) -> Result<ShellInfo, String> {
    let data_dir = paths::data_dir_path(&app)?;
    Ok(ShellInfo {
        shell: "tauri",
        data_dir: data_dir.display().to_string(),
        electron_data_dir_untouched: true,
    })
}

macro_rules! unsupported {
    ($($fn_name:ident => $channel:literal),* $(,)?) => {
        $(
            #[tauri::command]
            pub fn $fn_name() -> Result<serde_json::Value, String> {
                Err(format!(
                    "Kênh `{}` chưa có trong vỏ Tauri giai đoạn 1",
                    $channel
                ))
            }
        )*
    };
}

// Phần còn lại của 78 kênh invoke trong desktop-contract.json; bốn kênh có thật
// là `app:info`, `library:get`, `settings:get`, `ai:local-models` ở trên (và
// `shell:info` không thuộc preload của Electron). Thứ tự theo preload.ts để dễ
// đối chiếu bằng mắt.
unsupported! {
    set_fullscreen => "window:set-fullscreen",
    save_game => "library:save-game",
    delete_game => "library:delete-game",
    delete_games => "library:delete-games",
    save_session => "library:save-session",
    delete_sessions => "library:delete-sessions",
    save_lesson_document => "lesson:save-document",
    get_lesson_document => "lesson:get-document",
    list_lesson_library => "lesson:library",
    delete_lesson_document => "lesson:delete-document",
    delete_lesson_documents => "lesson:delete-documents",
    save_project_draft => "project:save-draft",
    get_project => "project:get",
    list_projects => "project:list",
    delete_project => "project:delete",
    delete_projects => "project:delete-many",
    import_document => "files:import-document",
    import_document_from_path => "files:import-document-from-path",
    import_questions => "files:import-questions",
    export_game => "files:export-game",
    import_game => "files:import-game",
    save_settings => "settings:save",
    get_ai_providers => "ai:providers",
    test_ai_provider => "ai:test-provider",
    get_local_runtime_status => "ai:local-status",
    install_local_ai_model => "ai:install-local-model",
    start_local_runtime => "ai:start-local-runtime",
    stop_local_runtime => "ai:stop-local-runtime",
    cancel_ai => "ai:cancel",
    list_ai_tasks => "ai:tasks",
    verify_cpu_runtime => "ai:runtime-verify",
    get_setup_status => "setup:status",
    preflight_setup => "setup:preflight",
    start_setup => "setup:start",
    cancel_setup => "setup:cancel",
    export_diagnostics => "diagnostics:export",
    diagnostics_info => "diagnostics:info",
    clear_diagnostics => "diagnostics:clear",
    open_diagnostics_folder => "diagnostics:open-folder",
    analyze_lesson => "lesson:analyze",
    classify_lesson_input => "lesson:classify-input",
    convert_lesson_draft => "lesson:convert-draft",
    inspect_lesson_structure => "lesson:get-structure",
    preview_lesson_selection => "lesson:preview-selection",
    send_lesson_chat => "lesson:chat-send",
    list_lesson_chats => "lesson:chats",
    get_lesson_chat => "lesson:chat-get",
    delete_lesson_chats => "lesson:chat-delete",
    recommend_games => "lesson:recommend",
    estimate_lesson_capacity => "lesson:capacity",
    get_lesson_analysis => "lesson:get-analysis",
    save_lesson_analysis => "lesson:save-analysis",
    get_lesson_recommendations => "lesson:recommendations",
    generate_lesson_draft => "lesson:generate",
    regenerate_lesson_item => "lesson:regenerate-item",
    check_lesson_quality => "lesson:quality",
    patch_lesson_item_assets => "lesson:patch-item-assets",
    import_illustration => "files:import-illustration",
    delete_illustration => "files:delete-illustration",
    generate_game => "ai:generate",
    start_presentation => "presentation:start",
    stop_presentation => "presentation:stop",
    toggle_presentation => "presentation:toggle",
    get_displays => "presentation:displays",
    open_about => "about:open",
    about_info => "about:info",
    about_state => "about:state",
    about_check => "about:check",
    about_download => "about:download",
    about_install => "about:install",
    about_open_releases => "about:open-releases",
    lan_start => "lan:start",
    lan_stop => "lan:stop",
    lan_assign_team => "lan:assign-team",
    lan_begin => "lan:begin",
    lan_next => "lan:next",
    lan_finish => "lan:finish",
}

#[cfg(test)]
mod tests {
    // Danh sách tên lệnh được sinh lại từ chính file này, nên test ở đây chỉ chốt
    // những bất biến đơn giản; đối chiếu với JSON nằm ở cổng Node.
    #[test]
    fn unsupported_message_names_the_channel() {
        let text = super::about_check().unwrap_err();
        assert!(text.contains("about:check"), "{text}");
        assert!(text.contains("giai đoạn 1"), "{text}");
    }

    #[test]
    fn library_answer_has_the_electron_shape() {
        // `readDb()` của Electron trả `{version, games, sessions}`; renderer đọc
        // đúng ba khoá đó, nên thư viện rỗng của Tauri phải giống hệt.
        let value = super::empty_library();
        assert_eq!(value["version"], 1);
        assert!(value["games"].as_array().is_some_and(|list| list.is_empty()));
        assert!(value["sessions"].as_array().is_some_and(|list| list.is_empty()));
    }

    #[test]
    fn default_settings_carry_the_keys_the_shell_reads() {
        let value = super::default_settings();
        // Bootstrap đọc `preferences.theme` trước lần render đầu tiên.
        assert_eq!(value["preferences"]["theme"], "system");
        assert_eq!(value["ai"]["mode"], "offline");
        assert_eq!(value["ai"]["hasKey"], false);
    }

    #[test]
    fn hand_written_commands_are_exported_for_the_bridge() {
        // Cầu eduGame chỉ biết tên lệnh qua bảng này; lệch tên ở đây nghĩa là
        // `invoke` gọi một lệnh không tồn tại dù `generate_handler!` đã có.
        assert_eq!(super::hand_written("get_library"), Some(("library:get", "get_library")));
        assert_eq!(super::hand_written("shell_info"), Some(("shell:info", "shell_info")));
        assert_eq!(super::hand_written("about_check"), None);
    }
}
