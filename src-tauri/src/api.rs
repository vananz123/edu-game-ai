//! Các lệnh IPC mà vỏ Tauri mở ra cho renderer.
//!
//! Giai đoạn 1 chỉ có bốn lệnh dữ liệu thật (`getLibrary`, `getSettings`,
//! `getLocalAiModels` và `appInfo`); chúng đọc/ghi trong thư mục dữ liệu riêng
//! của Tauri. Giai đoạn 3 mở thêm sáu kênh `library:*` trên `edugame.sqlite`
//! (`library.rs`). Không lệnh nào giả vờ thành công: một kênh chưa port phải báo
//! lỗi để giáo viên biết, thay vì lặng lẽ trả dữ liệu rỗng.
//!
//! Phần còn lại của hợp đồng Electron (xem `src/shared/desktop-contract.json`)
//! được đăng ký bằng `unsupported!` để renderer nhận một lỗi đọc được thay vì
//! "command not found" của Tauri. `tests/unit/tauri-contract.test.ts` so danh
//! sách dưới đây với JSON, nên thêm kênh ở preload mà quên ở đây là đỏ cổng.
//!
//! Giai đoạn 2 mở thêm hai cửa CHUNG cho façade của renderer:
//! `invoke_channel` (một kênh, có trả lời) và `send_channel` (ba kênh trình
//! chiếu, không chờ kết quả). Nhờ vậy renderer chỉ cần nói chuyện với lớp
//! desktop, không cần `edugame-bridge.js` dựng lại 92 khoá của preload Electron.
//! Hai lệnh này KHÔNG tự làm gì: mỗi kênh vẫn chạy qua bảng `dispatch()` bên
//! dưới, nên kênh chưa port vẫn trả lỗi đọc được chứ không giả vờ thành công.
//!
//! Tauri đăng ký lệnh theo TÊN HÀM, và tên hàm không được chứa `:`; nên chuỗi
//! kênh của Electron (`library:get`) đi qua đây dưới dạng THAM SỐ, không phải
//! tên lệnh. Đó là lý do duy nhất hai lệnh chung này tồn tại — mọi logic vẫn
//! nằm ở hàm riêng của từng kênh.

use serde::Serialize;
use serde_json::Value;
use tauri::AppHandle;

use crate::paths;

/// Lệnh đã có thân thật, kèm kênh Electron mà nó phục vụ.
///
/// Tauri đăng ký lệnh theo tên hàm Rust, không theo chuỗi kênh, nên bảng này là
/// nơi duy nhất nối hai thứ đó lại. `tests/unit/tauri-contract.test.ts` đọc
/// từng dòng để chốt rằng mỗi kênh của hợp đồng có đúng một lệnh, và mọi lệnh ở
/// đây đều được `generate_handler!` trong lib.rs đăng ký.
///
/// Hai dòng `channel:*` là kênh giả của hai cửa chung giai đoạn 2: cổng kiểm tra
/// bỏ qua chúng và đối chiếu chúng với `INVOKE_CHANNELS`/`SEND_CHANNELS` thay vì
/// với preload Electron.
pub fn hand_written(command: &str) -> Option<(&'static str, &'static str)> {
    Some(match command {
        "app_info" => ("app:info", "app_info"),
        "shell_info" => ("shell:info", "shell_info"),
        "get_library" => ("library:get", "get_library"),
        // Năm kênh ghi của thư viện: hàm sinh bởi `library_channel!` ở dưới,
        // nhưng vẫn là lệnh riêng chứ không phải nhánh `unsupported!`.
        "save_game" => ("library:save-game", "save_game"),
        "delete_game" => ("library:delete-game", "delete_game"),
        "delete_games" => ("library:delete-games", "delete_games"),
        "save_session" => ("library:save-session", "save_session"),
        "delete_sessions" => ("library:delete-sessions", "delete_sessions"),
        // Năm kênh của dự án: cũng sinh bởi `library_channel!`, chạy trên cùng
        // `edugame.sqlite` và cùng engine V8 (`project-ops.ts`).
        "save_project_draft" => ("project:save-draft", "save_project_draft"),
        "get_project" => ("project:get", "get_project"),
        "list_projects" => ("project:list", "list_projects"),
        "delete_project" => ("project:delete", "delete_project"),
        "delete_projects" => ("project:delete-many", "delete_projects"),
        // Gói `.egame`: luật trong V8 (`game-package.ts`), hộp thoại và tệp ở
        // `package.rs`. Hàm nhận thêm `AppHandle` để mở hộp thoại của tiến trình.
        "export_game" => ("files:export-game", "export_game"),
        "import_game" => ("files:import-game", "import_game"),
        // Nhóm `files:*` còn lại: hộp thoại + byte ở `document.rs` (V8 đọc chữ),
        // ảnh ở `illustration.rs`. Cả ba cùng lý do nhận `AppHandle`.
        "import_document" => ("files:import-document", "import_document"),
        "import_document_from_path" => ("files:import-document-from-path", "import_document_from_path"),
        "import_questions" => ("files:import-questions", "import_questions"),
        "import_illustration" => ("files:import-illustration", "import_illustration"),
        "delete_illustration" => ("files:delete-illustration", "delete_illustration"),
        // Trình duyệt toàn màn hình: `WebviewWindow::set_fullscreen` của tiến trình.
        "set_fullscreen" => ("window:set-fullscreen", "set_fullscreen"),
        // Chẩn đoán: log JSONL trong `diagnostics.rs`; gói xuất ra Desktop của
        // giáo viên, không phải một thư mục nội bộ.
        "export_diagnostics" => ("diagnostics:export", "export_diagnostics"),
        "diagnostics_info" => ("diagnostics:info", "diagnostics_info"),
        "clear_diagnostics" => ("diagnostics:clear", "clear_diagnostics"),
        "open_diagnostics_folder" => ("diagnostics:open-folder", "open_diagnostics_folder"),
        "get_settings" => ("settings:get", "get_settings"),
        "get_local_ai_models" => ("ai:local-models", "get_local_ai_models"),
        // Giai đoạn 4: nhập profile Electron. Ba kênh KHÔNG có trong preload
        // Electron — `tests/unit/tauri-contract.test.ts` miễn trừ chúng khỏi phép
        // so với `desktop-contract.json`, và renderer chỉ gọi trên vỏ Tauri.
        "migration_detect" => ("migration:detect", "migration_detect"),
        "migration_browse" => ("migration:browse", "migration_browse"),
        "migration_import" => ("migration:import", "migration_import"),
        "invoke_channel" => ("channel:invoke", "invoke_channel"),
        "send_channel" => ("channel:send", "send_channel"),
        _ => return None,
    })
}

/// Kênh mà `invoke_channel` phục vụ: một kênh có trả lời, đi qua `dispatch()`.
///
/// Lời gọi được façade gửi nguyên văn từ `desktop-contract.json`
/// (`desktop.call('library:get', …)` → `invoke('invoke_channel', {channel:
/// 'library:get', args})`). Vì vậy đây là cửa DUY NHẤT mà renderer dùng cho
/// nhóm "có trả lời"; kênh lạ bị từ chối ngay tại đây thay vì rơi xuống một
/// nhánh `_` nào đó.
const INVOKE_CHANNELS: &[&str] = &[
    "app:info",
    "window:set-fullscreen",
    "library:get",
    "library:save-game",
    "library:delete-game",
    "library:delete-games",
    "library:save-session",
    "library:delete-sessions",
    "lesson:save-document",
    "lesson:get-document",
    "lesson:library",
    "lesson:delete-document",
    "lesson:delete-documents",
    "project:save-draft",
    "project:get",
    "project:list",
    "project:delete",
    "project:delete-many",
    "files:import-document",
    "files:import-document-from-path",
    "files:import-questions",
    "files:export-game",
    "files:import-game",
    // Không thuộc hợp đồng Electron: chỉ cổng kiểm tra gọi, và `package.rs` từ
    // chối khi `EDUGAME_TAURI_PACKAGE` không bật.
    "package:gate-turn",
    // Cùng kiểu, cho hai hộp thoại nhập: `document.rs` từ chối khi
    // `EDUGAME_TAURI_FILES` chưa bật.
    "files:gate-turn",
    "files:import-illustration",
    "files:delete-illustration",
    "settings:get",
    "settings:save",
    "ai:providers",
    "ai:test-provider",
    "ai:local-models",
    "ai:local-status",
    "ai:install-local-model",
    "ai:start-local-runtime",
    "ai:stop-local-runtime",
    "ai:cancel",
    "ai:tasks",
    "ai:runtime-verify",
    "ai:generate",
    "setup:status",
    "setup:preflight",
    "setup:start",
    "setup:cancel",
    "diagnostics:export",
    "diagnostics:info",
    "diagnostics:clear",
    "diagnostics:open-folder",
    "lesson:analyze",
    "lesson:classify-input",
    "lesson:convert-draft",
    "lesson:get-structure",
    "lesson:preview-selection",
    "lesson:chat-send",
    "lesson:chats",
    "lesson:chat-get",
    "lesson:chat-delete",
    "lesson:recommend",
    "lesson:capacity",
    "lesson:get-analysis",
    "lesson:save-analysis",
    "lesson:recommendations",
    "lesson:generate",
    "lesson:regenerate-item",
    "lesson:quality",
    "lesson:patch-item-assets",
    "presentation:start",
    "presentation:stop",
    "presentation:toggle",
    "presentation:displays",
    "about:open",
    "about:info",
    "about:state",
    "about:check",
    "about:download",
    "about:install",
    "about:open-releases",
    // Giai đoạn 4: chỉ vỏ Tauri có ba kênh này; renderer Electron bỏ qua chúng.
    "migration:detect",
    "migration:browse",
    "migration:import",
    "lan:start",
    "lan:stop",
    "lan:assign-team",
    "lan:begin",
    "lan:next",
    "lan:finish",
];

/// Ba kênh `send` của trình chiếu. Bên Electron chúng là `ipcRenderer.send`
/// (không có kết quả); ở vỏ Tauri chúng đi qua `send_channel`, trả `null` cho
/// lời hứa của façade nhưng không đợi ai. Tách khỏi `INVOKE_CHANNELS` để một
/// kênh lỡ nằm ở cả hai bên bị từ chối, chứ không im lặng chạy hai lần.
const SEND_CHANNELS: &[&str] = &[
    "presentation:request-state",
    "presentation:exit",
    "presentation:state-update",
];

/// Một kênh có trả lời: gọi ĐÚNG hàm của kênh đó, không nhánh chung nào khác.
///
/// Kênh có thân thật thì gọi hàm thật; kênh còn lại gọi hàm `unsupported!` của
/// chính nó, nên câu lỗi giống hệt khi gọi bằng lệnh riêng (giai đoạn 1) hay qua
/// `invoke_channel` (giai đoạn 2). Không nhánh nào trả dữ liệu rỗng giả.
///
/// `invoke_channel` đã lọc theo `INVOKE_CHANNELS`, nên `_` ở đây không tới
/// được — nó chỉ là lưới an toàn nếu hai danh sách lệch nhau lúc sửa tay.
async fn dispatch(app: &AppHandle, channel: &str, args: &[Value]) -> Result<Value, String> {
    match channel {
        "app:info" => json(app_info(app.clone())),
        "shell:info" => json(shell_info(app.clone())),
        "library:get" => json(get_library(app.clone())),
        "settings:get" => json(get_settings(app.clone())),
        "ai:local-models" => json(get_local_ai_models()),
        // Năm kênh ghi của thư viện nhận thẳng tham số renderer gửi (một trò
        // chơi, một id, một mảng id), nên chúng đi qua `args` của cửa chung.
        "library:save-game"
        | "library:delete-game"
        | "library:delete-games"
        | "library:save-session"
        | "library:delete-sessions" => crate::library::run(app, channel, &args),
        // Nhóm `project:*` đi cùng đường: cùng luồng engine, cùng kết nối SQLite.
        "project:save-draft"
        | "project:get"
        | "project:list"
        | "project:delete"
        | "project:delete-many" => crate::library::run(app, channel, &args),
        // Hai kênh gói: tham số đầu là trò chơi (chỉ kênh xuất dùng), phần còn
        // lại nằm ở `package.rs`.
        "files:export-game" => match args.first() {
            Some(game) if !game.is_null() => crate::package::export(
                app,
                game.clone(),
                crate::package::gate_target(channel),
            )
            .await,
            _ => Err("EG_PACKAGE: thiếu trò chơi để xuất".to_string()),
        },
        "files:import-game" => crate::package::import(app, crate::package::gate_target(channel)).await,
        // Chỉ có nghĩa khi cổng kiểm tra bật (`EDUGAME_TAURI_PACKAGE=gate`): đặt
        // bộ đếm để lượt nhập sau chọn biến đường dẫn khác. `package.rs` từ chối
        // khi cổng tắt, nên bản phát hành không mở thêm đường nào.
        "package:gate-turn" => crate::package::set_gate_turn(args.first()),
        // Cùng bộ đếm cho hộp thoại nhập tài liệu / câu hỏi / ảnh.
        "files:gate-turn" => crate::document::set_gate_turn(args.first()),
        // Nhập tệp: tham số giữ nguyên hình dạng `preload.ts` gửi.
        "files:import-document" => crate::document::import_document(app).await,
        "files:import-document-from-path" => crate::document::import_document_from_path(app, args.first()),
        "files:import-questions" => crate::document::import_questions(app).await,
        // Ảnh: tham số đầu là đường dẫn TÙY CHỌN của renderer (kéo thả); rỗng thì
        // hộp thoại của tiến trình chọn.
        "files:import-illustration" => {
            crate::illustration::import(
                app,
                crate::document::illustration_gate_target(),
                args.first().and_then(Value::as_str),
            )
            .await
        }
        "files:delete-illustration" => crate::illustration::delete(app, args.first()),
        "window:set-fullscreen" => set_fullscreen(app.clone(), args.first().cloned()),
        "diagnostics:export" => crate::diagnostics::export(app),
        "diagnostics:info" => crate::diagnostics::info(app),
        "diagnostics:clear" => crate::diagnostics::clear(app),
        "diagnostics:open-folder" => crate::diagnostics::open_folder(app),
        // Giai đoạn 4: `migration.rs` tự mở bản sao lưu và transaction; không
        // tham số nào của renderer đi vào đường dẫn nguồn (hộp thoại/hằng môi
        // trường giữ đường dẫn).
        "migration:detect" => crate::migration::detect(app).await,
        "migration:browse" => crate::migration::browse(app).await,
        "migration:import" => crate::migration::import(app).await,
        _ => Err(format!("Kênh `{channel}` chưa có thân trong vỏ Tauri")),
    }
}

fn json<T: Serialize>(value: Result<T, String>) -> Result<Value, String> {
    value.and_then(|inner| serde_json::to_value(inner).map_err(|error| error.to_string()))
}

/// Cửa chung cho mọi kênh có trả lời (xem đầu tệp).
///
/// `async` để lệnh chạy trên runtime của Tauri, không trên luồng chính: kênh
/// nào mở hộp thoại (`files:*`) sẽ dựng hộp thoại thật trên luồng chính thay vì
/// dựng nó bên trong lời gọi chờ — một hộp thoại như thế không hiện ra và đóng
/// băng cả cửa sổ (xem đầu `picker.rs`). `dispatch` là hàm đồng bộ: chờ V8/SQLite
/// ở đây chỉ chiếm luồng runtime, còn hộp thoại tự chuyển việc chặn của nó sang
/// `spawn_blocking`.
///
/// Không nhận `app.get_webview_window` hay đường dẫn nào từ frontend: chỉ một
/// chuỗi kênh thuộc danh sách tĩnh, nên frontend không thể mượn cửa này để đọc
/// tệp tuỳ ý. Đó là lý do không mở quyền filesystem cho WebView.
#[tauri::command]
pub async fn invoke_channel(
    app: AppHandle,
    channel: String,
    args: Option<Vec<Value>>,
) -> Result<Value, String> {
    if !INVOKE_CHANNELS.contains(&channel.as_str()) {
        return Err(format!("Kênh `{channel}` không thuộc hợp đồng desktop"));
    }
    dispatch(&app, &channel, args.as_deref().unwrap_or_default()).await
}

/// Cửa chung cho ba kênh `send` của trình chiếu.
///
/// Ba kênh đó chưa có nhánh thật trong vỏ này (giai đoạn 2 theo #251 câu 1),
/// nên chúng trả lỗi — renderer biết trình chiếu chưa chạy thay vì tưởng đã gửi.
/// Không nhận `AppHandle` vì chưa nhánh nào cần cửa sổ; thêm khi có thân thật.
#[tauri::command]
pub fn send_channel(channel: String) -> Result<Value, String> {
    if !SEND_CHANNELS.contains(&channel.as_str()) {
        return Err(format!("Kênh `{channel}` không phải kênh gửi của trình chiếu"));
    }
    Err(format!("Kênh `{channel}` chưa có thân trong vỏ Tauri giai đoạn 2"))
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
/// của Electron trả về. Câu đọc chạy trong V8 nhúng trên kết nối đang mở
/// (`library.rs`), nên hình dạng dữ liệu đến từ đúng `library-ops.ts` mà
/// Electron dùng — không phải một bản viết lại bằng Rust.
#[tauri::command]
pub fn get_library(app: AppHandle) -> Result<serde_json::Value, String> {
    crate::library::run(&app, "library:get", &[])
}

/// Bốn kênh ghi của thư viện, một tham số đúng như hook của `preload.ts` gửi.
/// Thân thật nằm ở `library.rs` → V8 nhúng; các lệnh ở đây chỉ để hợp đồng
/// Electron có đúng một lệnh cho mỗi kênh (`tests/unit/tauri-contract.test.ts`).
macro_rules! library_channel {
    ($($fn_name:ident($arg:ident: $kind:ty) => $channel:literal),* $(,)?;
     $($no_arg:ident() => $no_arg_channel:literal),* $(,)?) => {
        $(
            #[tauri::command]
            pub fn $fn_name(app: AppHandle, $arg: $kind) -> Result<serde_json::Value, String> {
                crate::library::run(&app, $channel, &[serde_json::to_value($arg).map_err(|error| error.to_string())?])
            }
        )*
        $(
            /// Kênh không nhận tham số: preload gọi `ipcRenderer.invoke(kênh)` trần.
            #[tauri::command]
            pub fn $no_arg(app: AppHandle) -> Result<serde_json::Value, String> {
                crate::library::run(&app, $no_arg_channel, &[])
            }
        )*
    };
}

library_channel! {
    save_game(game: serde_json::Value) => "library:save-game",
    delete_game(game_id: String) => "library:delete-game",
    delete_games(game_ids: Vec<String>) => "library:delete-games",
    save_session(session: serde_json::Value) => "library:save-session",
    delete_sessions(session_ids: Vec<String>) => "library:delete-sessions",
    // Nhóm `project:*`: tham số đúng như `saveProjectDraft`/`getProject`/… của
    // `preload.ts` gửi — một bản nháp, một id (chuỗi rỗng cũng hợp lệ), một mảng
    // id. Bước kiểm dữ liệu nằm ở `lesson-project-rules.ts`, không ở đây.
    save_project_draft(project: serde_json::Value) => "project:save-draft",
    get_project(project_id: String) => "project:get",
    delete_project(project_id: String) => "project:delete",
    delete_projects(project_ids: Vec<String>) => "project:delete-many";
    list_projects() => "project:list",
}

/// Hai kênh gói nhận tham số đúng như hook của `preload.ts` gửi
/// (`exportGame: game => …`, `importGame: () => …`) nhưng đi qua `package.rs`
/// thay vì engine của thư viện, vì chúng còn mở hộp thoại của tiến trình.
#[tauri::command]
pub async fn export_game(app: AppHandle, game: serde_json::Value) -> Result<serde_json::Value, String> {
    crate::package::export(&app, game, crate::package::gate_target("files:export-game")).await
}

#[tauri::command]
pub async fn import_game(app: AppHandle) -> Result<serde_json::Value, String> {
    crate::package::import(&app, crate::package::gate_target("files:import-game")).await
}

/// Ba lệnh Giai đoạn 4 (nhập profile Electron). Chúng `async` vì `migration.rs`
/// đẩy việc chép/đọc SQLite sang luồng chặn; hộp thoại chọn thư mục cũng cần
/// runtime của Tauri (xem đầu `picker.rs`). Không nhận tham số đường dẫn từ
/// renderer.
#[tauri::command]
pub async fn migration_detect(app: AppHandle) -> Result<serde_json::Value, String> {
    crate::migration::detect(&app).await
}

#[tauri::command]
pub async fn migration_browse(app: AppHandle) -> Result<serde_json::Value, String> {
    crate::migration::browse(&app).await
}

#[tauri::command]
pub async fn migration_import(app: AppHandle) -> Result<serde_json::Value, String> {
    crate::migration::import(&app).await
}

/// Ba kênh nhập tệp có hộp thoại của tiến trình. Renderer không có quyền
/// `dialog:`/`fs:`, nên nó không chọn được tệp nào — nó chỉ nhận kết quả.
///
/// `async` là điều kiện để hộp thoại hiện ra: xem đầu `picker.rs`.
#[tauri::command]
pub async fn import_document(app: AppHandle) -> Result<serde_json::Value, String> {
    crate::document::import_document(&app).await
}

/// Đường DUY NHẤT renderer đề xuất đường dẫn (kéo thả). `document.rs` kiểm phần
/// mở rộng trước khi chạm đĩa và từ chối tệp quá trần.
#[tauri::command]
pub fn import_document_from_path(
    app: AppHandle,
    file_path: Option<Value>,
) -> Result<serde_json::Value, String> {
    crate::document::import_document_from_path(&app, file_path.as_ref())
}

#[tauri::command]
pub async fn import_questions(app: AppHandle) -> Result<serde_json::Value, String> {
    crate::document::import_questions(&app).await
}

#[tauri::command]
pub async fn import_illustration(
    app: AppHandle,
    source_path: Option<String>,
) -> Result<serde_json::Value, String> {
    crate::illustration::import(
        &app,
        crate::document::illustration_gate_target(),
        source_path.as_deref(),
    )
    .await
}

#[tauri::command]
pub fn delete_illustration(app: AppHandle, image_id: Option<Value>) -> Result<serde_json::Value, String> {
    crate::illustration::delete(&app, image_id.as_ref())
}

/// `window:set-fullscreen` → `{ok}`. Electron trả `{ok:false}` khi cửa sổ đã bị
/// huỷ; ở đây cửa sổ thiếu cũng cùng câu trả lời, không ném.
#[tauri::command]
pub fn set_fullscreen(app: AppHandle, enabled: Option<Value>) -> Result<serde_json::Value, String> {
    use tauri::Manager;
    let wanted = match enabled {
        Some(Value::Bool(flag)) => flag,
        Some(Value::Null) | None => false,
        // `Boolean(x)` của JavaScript: mọi giá trị khác bool đều là `true`.
        Some(_) => true,
    };
    let Some(window) = app.get_webview_window("main") else {
        return Ok(serde_json::json!({ "ok": false }));
    };
    window
        .set_fullscreen(wanted)
        .map_err(|error| format!("EG_WINDOW: không đổi được chế độ toàn màn hình: {error}"))?;
    Ok(serde_json::json!({ "ok": true }))
}

/// Bốn kênh chẩn đoán: log JSONL trong `<data>/logs`, cùng thư mục
/// `LOG_DIR()` của `main.ts`.
#[tauri::command]
pub fn export_diagnostics(app: AppHandle) -> Result<serde_json::Value, String> {
    crate::diagnostics::export(&app)
}

#[tauri::command]
pub fn diagnostics_info(app: AppHandle) -> Result<serde_json::Value, String> {
    crate::diagnostics::info(&app)
}

#[tauri::command]
pub fn clear_diagnostics(app: AppHandle) -> Result<serde_json::Value, String> {
    crate::diagnostics::clear(&app)
}

#[tauri::command]
pub fn open_diagnostics_folder(app: AppHandle) -> Result<serde_json::Value, String> {
    crate::diagnostics::open_folder(&app)
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

// Phần còn lại của các kênh invoke trong desktop-contract.json; các kênh có thật
// là `app:info`, `library:get`, `settings:get`, `ai:local-models` ở trên, sáu
// `library:*` và năm `project:*` qua `library_channel!` (và `shell:info` không
// thuộc preload của Electron). Thứ tự theo preload.ts để dễ đối chiếu bằng mắt.
unsupported! {
    save_lesson_document => "lesson:save-document",
    get_lesson_document => "lesson:get-document",
    list_lesson_library => "lesson:library",
    delete_lesson_document => "lesson:delete-document",
    delete_lesson_documents => "lesson:delete-documents",
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
    fn library_answers_shape_comes_from_the_typescript_rules() {
        // `library.rs` chạy `getLibraryPayload()` của `library-ops.ts`, nên hình
        // dạng `{version, games, sessions}` có test riêng ở đó. Ở đây chỉ chốt
        // rằng `get_library` đi qua engine chứ không còn đọc `library.json` của
        // giai đoạn 1. Phép so trên chính tệp này phải ghép chuỗi, nếu không
        // câu assert tự khớp với chính nó.
        let source = include_str!("api.rs");
        assert!(source.contains("crate::library::run(&app, \"library:get\", &[])"));
        let legacy = ["paths::", "LIBRARY", "_FILE"].concat();
        assert!(!source.contains(&legacy));
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
    fn hand_written_commands_are_exported_for_the_gate() {
        // Cổng Node chỉ biết tên lệnh qua bảng này; lệch tên ở đây nghĩa là
        // `generate_handler!` đăng ký một lệnh mà không kênh nào gọi tới.
        assert_eq!(super::hand_written("get_library"), Some(("library:get", "get_library")));
        assert_eq!(super::hand_written("shell_info"), Some(("shell:info", "shell_info")));
        assert_eq!(super::hand_written("about_check"), None);
    }

    #[test]
    fn channel_lists_do_not_overlap_and_cover_the_real_bodies() {
        // Hai cửa chung lọc theo hai danh sách tĩnh. Một kênh nằm ở cả hai bên
        // nghĩa là cùng một chuỗi chạy hai đường; ba kênh khởi động vắng mặt
        // nghĩa là renderer báo "không thuộc hợp đồng desktop" ngay lần đầu mở.
        for channel in super::INVOKE_CHANNELS {
            assert!(!super::SEND_CHANNELS.contains(channel), "{channel} nằm ở cả hai danh sách");
        }
        for channel in ["app:info", "library:get", "settings:get", "ai:local-models"] {
            assert!(super::INVOKE_CHANNELS.contains(&channel), "{channel} thiếu trong INVOKE_CHANNELS");
        }
        assert_eq!(super::SEND_CHANNELS.len(), 3);
    }
}
