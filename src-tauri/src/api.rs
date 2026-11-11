//! Tauri command bridge for the renderer desktop façade.
//!
//! The renderer channel contract is declared in
//! `src/renderer/core/desktop-facade-schema.ts`; `invoke_channel` and
//! `send_channel` route requests through `dispatch()` below. Unknown or
//! intentionally unsupported channels return an explicit error rather than a
//! success-shaped fallback.
//!
//! Tauri registers Rust command function names, not channel strings such as
//! `library:get`, so the channel is passed as an argument and mapped to the
//! command implementation here.

use serde::Serialize;
use serde_json::Value;
use tauri::AppHandle;

use crate::paths;

/// Tauri command implementation and the renderer channel it serves.
///
/// Tauri đăng ký lệnh theo tên hàm Rust, không theo chuỗi kênh, nên bảng này là
/// nơi duy nhất nối hai thứ đó lại. `tests/unit/tauri-contract.test.ts` đọc
/// từng dòng để chốt rằng mỗi kênh của hợp đồng có đúng một lệnh, và mọi lệnh ở
/// đây đều được `generate_handler!` trong lib.rs đăng ký.
///
/// The generic bridge commands are checked against the façade's invoke/send
/// channel lists rather than treated as individual renderer channels.
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
        // Giai đoạn 5: ghi cài đặt + khoá BYOK. Khoá mới chỉ được ghi dưới dạng
        // blob DPAPI; `save_settings` hỏng trước khi ghi nếu DPAPI không dùng được.
        "save_settings" => ("settings:save", "save_settings"),
        "get_ai_providers" => ("ai:providers", "get_ai_providers"),
        "get_local_ai_models" => ("ai:local-models", "get_local_ai_models"),
        // Giai đoạn 5: AI local — tải model/runtime và quản lý llama-server.
        // Bốn kênh này không còn là `unsupported!`; renderer vẫn chỉ gửi id model.
        "get_local_runtime_status" => ("ai:local-status", "get_local_runtime_status"),
        "install_local_ai_model" => ("ai:install-local-model", "install_local_ai_model"),
        "start_local_runtime" => ("ai:start-local-runtime", "start_local_runtime"),
        "stop_local_runtime" => ("ai:stop-local-runtime", "stop_local_runtime"),
        // Giai đoạn 5: wizard cài đặt AI lần đầu. Bốn kênh này chỉ nhận id model;
        // trạng thái bền vững nằm ở `<data>/ai-local/setup-state.json`.
        "get_setup_status" => ("setup:status", "get_setup_status"),
        "preflight_setup" => ("setup:preflight", "preflight_setup"),
        "start_setup" => ("setup:start", "start_setup"),
        "cancel_setup" => ("setup:cancel", "cancel_setup"),
        // Giai đoạn 5: kho giáo án + luồng phân tích. Kho chạy SQL trên cùng kết
        // nối của engine (`lesson_store.rs`); phần luật (prompt, cache key, cắt
        // đoạn, dự án) ở slot V8 `EGLESSON`.
        "save_lesson_document" => ("lesson:save-document", "save_lesson_document"),
        "get_lesson_document" => ("lesson:get-document", "get_lesson_document"),
        "list_lesson_library" => ("lesson:library", "list_lesson_library"),
        "delete_lesson_document" => ("lesson:delete-document", "delete_lesson_document"),
        "delete_lesson_documents" => ("lesson:delete-documents", "delete_lesson_documents"),
        "analyze_lesson" => ("lesson:analyze", "analyze_lesson"),
        "classify_lesson_input" => ("lesson:classify-input", "classify_lesson_input"),
        "inspect_lesson_structure" => ("lesson:get-structure", "inspect_lesson_structure"),
        "preview_lesson_selection" => ("lesson:preview-selection", "preview_lesson_selection"),
        "recommend_games" => ("lesson:recommend", "recommend_games"),
        "estimate_lesson_capacity" => ("lesson:capacity", "estimate_lesson_capacity"),
        "get_lesson_analysis" => ("lesson:get-analysis", "get_lesson_analysis"),
        "save_lesson_analysis" => ("lesson:save-analysis", "save_lesson_analysis"),
        "get_lesson_recommendations" => ("lesson:recommendations", "get_lesson_recommendations"),
        // Bước 5–6: chuyển đổi tất định, chất lượng, minh hoạ, rồi hai lượt model.
        // Hai lượt model chạy `spawn_blocking` như `lesson:analyze` để `ai:cancel`
        // vẫn được phục vụ.
        "convert_lesson_draft" => ("lesson:convert-draft", "convert_lesson_draft"),
        "check_lesson_quality" => ("lesson:quality", "check_lesson_quality"),
        "patch_lesson_item_assets" => ("lesson:patch-item-assets", "patch_lesson_item_assets"),
        "generate_lesson_draft" => ("lesson:generate", "generate_lesson_draft"),
        "regenerate_lesson_item" => ("lesson:regenerate-item", "regenerate_lesson_item"),
        // Chat giáo án (#182)
        "send_lesson_chat" => ("lesson:chat-send", "send_lesson_chat"),
        "list_lesson_chats" => ("lesson:chats", "list_lesson_chats"),
        "get_lesson_chat" => ("lesson:chat-get", "get_lesson_chat"),
        "delete_lesson_chats" => ("lesson:chat-delete", "delete_lesson_chats"),
        // Nhóm AI bổ sung: kiểm tra kết nối provider, tác vụ và xác minh runtime
        "test_ai_provider" => ("ai:test-provider", "test_ai_provider"),
        "list_ai_tasks" => ("ai:tasks", "list_ai_tasks"),
        "verify_cpu_runtime" => ("ai:runtime-verify", "verify_cpu_runtime"),
        // Cùng `AiGate`: bật cờ huỷ của lượt đang chờ HTTP trong Rust.
        "cancel_ai" => ("ai:cancel", "cancel_ai"),
        // Tab Giới thiệu và cập nhật ứng dụng (#188, #204)
        "open_about" => ("about:open", "open_about"),
        "about_info" => ("about:info", "about_info"),
        "about_state" => ("about:state", "about_state"),
        "about_check" => ("about:check", "about_check"),
        "about_download" => ("about:download", "about_download"),
        "about_install" => ("about:install", "about_install"),
        "about_open_releases" => ("about:open-releases", "about_open_releases"),
        // Kênh legacy ai:generate
        "generate_game" => ("ai:generate", "generate_game"),
        // Nhóm kênh mạng nội bộ (LAN Classroom Mode)
        "lan_start" => ("lan:start", "lan_start"),
        "lan_stop" => ("lan:stop", "lan_stop"),
        "lan_assign_team" => ("lan:assign-team", "lan_assign_team"),
        "lan_begin" => ("lan:begin", "lan_begin"),
        "lan_next" => ("lan:next", "lan_next"),
        "lan_finish" => ("lan:finish", "lan_finish"),
        // Nhóm trình chiếu màn hình phụ / máy chiếu (presentation:*)
        "start_presentation" => ("presentation:start", "start_presentation"),
        "stop_presentation" => ("presentation:stop", "stop_presentation"),
        "toggle_presentation" => ("presentation:toggle", "toggle_presentation"),
        "get_displays" => ("presentation:displays", "get_displays"),
        // Profile migration commands are Tauri-only and are not renderer façade
        // channels; the migration wizard calls the registered commands directly.
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
/// Lời gọi được façade gửi theo `desktop-facade-schema.ts`
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
/// Kênh có thân thật thì gọi hàm thật; kênh chưa được hỗ trợ trả lỗi rõ ràng.
/// Không nhánh nào trả dữ liệu rỗng giả.
///
/// `invoke_channel` đã lọc theo `INVOKE_CHANNELS`, nên `_` ở đây không tới
/// được — nó chỉ là lưới an toàn nếu hai danh sách lệch nhau lúc sửa tay.
async fn dispatch(app: &AppHandle, channel: &str, args: &[Value]) -> Result<Value, String> {
    match channel {
        "app:info" => json(app_info(app.clone())),
        "shell:info" => json(shell_info(app.clone())),
        "library:get" => json(get_library(app.clone())),
        "settings:get" => json(get_settings(app.clone())),
        "settings:save" => match args.first() {
            Some(incoming) if incoming.is_object() => {
                json(crate::settings::save(app, incoming.clone()))
            }
            _ => Err("AI_CONFIG: thiếu đối tượng cài đặt cần lưu".to_string()),
        },
        "ai:providers" => json(get_ai_providers(app.clone())),
        "ai:local-models" => get_local_ai_models(app.clone()),
        "ai:local-status" => Ok(crate::ai_local::status(app)),
        "ai:install-local-model" => {
            crate::ai_local::install(app.clone(), args.first().cloned()).await
        }
        "ai:start-local-runtime" => {
            crate::ai_local::start(app.clone(), args.first().cloned()).await
        }
        "ai:stop-local-runtime" => crate::ai_local::stop(app.clone()).await,
        // Wizard lần đầu: cùng `args` như lệnh riêng, nên payload sai vẫn bị
        // `setup.rs` từ chối y như gọi trực tiếp.
        "setup:status" => crate::setup::status(app),
        "setup:preflight" => crate::setup::preflight(app.clone(), args.first().cloned()).await,
        "setup:start" => crate::setup::start(app.clone(), args.first().cloned()).await,
        "setup:cancel" => crate::setup::cancel(app),
        // Kho giáo án: cùng luồng engine, cùng kết nối SQLite; tham số renderer
        // giữ nguyên hình dạng preload gửi.
        "lesson:save-document" => crate::lesson::save_document(app, args.first()),
        "lesson:get-document" => crate::lesson::get_document(app, &text_arg(args, 0)),
        "lesson:library" => crate::lesson::library_documents(app),
        "lesson:delete-document" => crate::lesson::delete_document(app, &text_arg(args, 0)),
        "lesson:delete-documents" => crate::lesson::delete_documents(app, args.first()),
        // Lượt model duy nhất: chờ tới 300 s, nên chạy trên `spawn_blocking`
        // (`lesson::analyze`) để `ai:cancel` vẫn được phục vụ.
        "lesson:analyze" => crate::lesson::analyze(app.clone(), args.first().cloned()).await,
        "lesson:classify-input" => crate::lesson::classify(app, args.first()),
        "lesson:get-structure" => crate::lesson::structure(app, args.first()),
        "lesson:preview-selection" => crate::lesson::preview(app, args.first()),
        "lesson:recommend" => crate::lesson::recommend(app, args.first()),
        "lesson:capacity" => crate::lesson::capacity(app, args.first()),
        "lesson:get-analysis" => crate::lesson::get_analysis(app, &text_arg(args, 0)),
        "lesson:save-analysis" => crate::lesson::save_analysis(app, args.first()),
        "lesson:recommendations" => crate::lesson::list_recommendations(app, &text_arg(args, 0)),
        "lesson:convert-draft" => crate::lesson::convert_draft(app, args.first()),
        "lesson:quality" => crate::lesson::quality(app, args.first()),
        "lesson:patch-item-assets" => crate::lesson::patch_item_assets(app, args.first()),
        "lesson:generate" => crate::lesson::generate(app.clone(), args.first().cloned()).await,
        "lesson:regenerate-item" => {
            crate::lesson::regenerate_item(app.clone(), args.first().cloned()).await
        }
        "lesson:chat-send" => crate::lesson::send_chat(app.clone(), args.first().cloned()).await,
        "lesson:chats" => crate::lesson::list_chats(app),
        "lesson:chat-get" => crate::lesson::get_chat(app, &text_arg(args, 0)),
        "lesson:chat-delete" => crate::lesson::delete_chats(app, args.first()),
        // #132: huỷ lượt đang chờ HTTP; trả `{ok}` như `aiRequests.cancel`.
        "ai:cancel" => crate::lesson::cancel(app, &text_arg(args, 0)),
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
        "ai:test-provider" => {
            let payload = args.first().cloned().unwrap_or(Value::Null);
            crate::settings::test_provider(app.clone(), payload).await
        }
        "ai:tasks" => {
            let payload = args.first().cloned().unwrap_or(Value::Null);
            crate::ai_tasks::list_tasks(app, payload)
        }
        "ai:runtime-verify" => crate::ai_local::verify_runtime(app),
        "about:open" => crate::about::open(app.clone()).await,
        "about:info" => crate::about::info(app),
        "about:state" => crate::about::state(app),
        "about:check" => crate::about::check(app.clone()).await,
        "about:download" => crate::about::download(app),
        "about:install" => crate::about::install(app),
        "about:open-releases" => crate::about::open_releases(args.first().and_then(Value::as_str)),
        "ai:generate" => crate::ai_generate::generate(app.clone(), args.first().cloned()).await,
        "lan:start" => crate::lan::start(app.clone(), args.first().cloned()).await,
        "lan:stop" => crate::lan::stop(app.clone()).await,
        "lan:assign-team" => crate::lan::assign_team(app.clone(), args.first().cloned()).await,
        "lan:begin" => crate::lan::begin(app.clone()).await,
        "lan:next" => crate::lan::next(app.clone()).await,
        "lan:finish" => crate::lan::finish(app.clone()).await,
        "presentation:start" => crate::presentation::start(app, args.first().cloned()).await,
        "presentation:stop" => crate::presentation::stop(app, args.first().cloned()).await,
        "presentation:toggle" => crate::presentation::toggle(app, args.first().cloned()).await,
        "presentation:displays" => crate::presentation::get_displays(app),
        _ => Err(format!("Kênh `{channel}` chưa có thân trong vỏ Tauri")),
    }
}

fn json<T: Serialize>(value: Result<T, String>) -> Result<Value, String> {
    value.and_then(|inner| serde_json::to_value(inner).map_err(|error| error.to_string()))
}

/// Tham số chuỗi của kênh (`lesson:get-document`, `ai:cancel`, …). Thiếu hoặc
/// sai kiểu thành chuỗi rỗng, đúng cách `String(payload || '')` của preload.
fn text_arg(args: &[Value], index: usize) -> String {
    args.get(index)
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string()
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
/// Ba kênh này không chờ kết quả: chuyển tới handler của module presentation
/// để đồng bộ snapshot và vòng đời cửa sổ trình chiếu.
#[tauri::command]
pub async fn send_channel(
    app: AppHandle,
    channel: String,
    args: Option<Vec<Value>>,
) -> Result<Value, String> {
    if !SEND_CHANNELS.contains(&channel.as_str()) {
        return Err(format!("Kênh `{channel}` không phải kênh gửi của trình chiếu"));
    }
    match channel.as_str() {
        "presentation:request-state" => {
            crate::presentation::handle_request_state(&app);
            Ok(Value::Null)
        }
        "presentation:state-update" => {
            if let Some(state) = args.and_then(|a| a.into_iter().next()) {
                crate::presentation::handle_state_update(&app, state);
            }
            Ok(Value::Null)
        }
        "presentation:exit" => {
            let payload = args.and_then(|a| a.into_iter().next());
            crate::presentation::handle_exit(&app, payload);
            Ok(Value::Null)
        }
        _ => Err(format!("Kênh `{channel}` chưa có thân trong vỏ Tauri")),
    }
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
    use tauri::{Emitter, Manager};
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
    let _ = app.emit("window:fullscreen-changed", wanted);
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

/// Cài đặt của bản Tauri, đã chuyển sang hình dạng renderer được thấy:
/// `ai.providers` là mảng, không có blob/khoá. Phần lưu và trộn nằm ở
/// `settings.rs`; khoá mới đi qua DPAPI trong `secrets.rs`.
#[tauri::command]
pub fn get_settings(app: AppHandle) -> Result<serde_json::Value, String> {
    crate::settings::get(&app)
}

/// Giáo viên lưu cài đặt AI. Chỉ nhận một đối tượng; provider nào có `apiKey`
/// mới sẽ được mã hoá trước khi ghi, `clearKey` xoá khoá, còn khoá rỗng giữ
/// nguyên khoá đã lưu (xem `settings.rs`).
#[tauri::command]
pub fn save_settings(app: AppHandle, incoming: Value) -> Result<serde_json::Value, String> {
    crate::settings::save(&app, incoming)
}

/// Registry provider + trạng thái hiện tại cho trang Cài đặt và wizard. Cùng
/// hình dạng với `settings:get` như bản Electron.
#[tauri::command]
pub fn get_ai_providers(app: AppHandle) -> Result<serde_json::Value, String> {
    crate::settings::get(&app)
}

/// Danh mục AI local thật: runtime/model đã tải, cấu hình máy, model đề xuất và
/// trạng thái tiến trình. Không nhận tham số nào từ renderer; URL/SHA-256 nằm
/// trong `ai_local.rs`.
#[tauri::command]
pub fn get_local_ai_models(app: AppHandle) -> Result<serde_json::Value, String> {
    crate::ai_local::catalog(&app)
}

/// Tải runtime (nếu thiếu/sai backend) và model, xác minh SHA-256 rồi ghi lựa
/// chọn `ai.mode = "local"` vào settings. Chỉ nhận id model thuộc danh mục.
#[tauri::command]
pub async fn install_local_ai_model(
    app: AppHandle,
    model_id: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    crate::ai_local::install(app, model_id).await
}

/// Trạng thái tiến trình llama-server (`STOPPED`/`STARTING`/`READY`/`ERROR`).
#[tauri::command]
pub fn get_local_runtime_status(app: AppHandle) -> Result<serde_json::Value, String> {
    Ok(crate::ai_local::status(&app))
}

/// Khởi động llama-server trên cổng loopback trống, chờ `/health`, và hạ xuống
/// CPU nếu backend Vulkan đã chọn không lên được.
#[tauri::command]
pub async fn start_local_runtime(
    app: AppHandle,
    model_id: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    crate::ai_local::start(app, model_id).await
}

/// Dừng tiến trình llama-server đang chạy (nếu có).
#[tauri::command]
pub async fn stop_local_runtime(app: AppHandle) -> Result<serde_json::Value, String> {
    crate::ai_local::stop(app).await
}

/// Wizard AI lần đầu: chỉ đọc trạng thái đã lưu và kế hoạch của lần dò gần nhất.
#[tauri::command]
pub fn get_setup_status(app: AppHandle) -> Result<serde_json::Value, String> {
    crate::setup::status(&app)
}

/// Dò phần cứng/dung lượng và chọn runtime; lỗi trả `blocked`, không reject.
#[tauri::command]
pub async fn preflight_setup(
    app: AppHandle,
    request: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    crate::setup::preflight(app, request).await
}

/// Chạy hoặc tiếp tục wizard; lỗi của quá trình trả về trong status.
#[tauri::command]
pub async fn start_setup(
    app: AppHandle,
    request: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    crate::setup::start(app, request).await
}

/// Đặt cờ hủy cho lượt đang chạy; byte đã tải được giữ để tải tiếp.
#[tauri::command]
pub fn cancel_setup(app: AppHandle) -> Result<serde_json::Value, String> {
    crate::setup::cancel(&app)
}

/// Lưu tài liệu giáo án (văn bản đã trích xuất + metadata). Luật kiểm nằm ở
/// `lesson_store.rs`, cùng câu lỗi với `lesson-store.ts` của Electron.
#[tauri::command]
pub fn save_lesson_document(
    app: AppHandle,
    payload: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    crate::lesson::save_document(&app, payload.as_ref())
}

/// Đọc một tài liệu kèm văn bản; `null` khi id không tồn tại.
#[tauri::command]
pub fn get_lesson_document(
    app: AppHandle,
    document_id: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let id = document_id
        .as_ref()
        .and_then(serde_json::Value::as_str)
        .unwrap_or("");
    crate::lesson::get_document(&app, id)
}

/// Toàn bộ thư viện giáo án (không kèm văn bản).
#[tauri::command]
pub fn list_lesson_library(app: AppHandle) -> Result<serde_json::Value, String> {
    crate::lesson::library_documents(&app)
}

/// Xoá một tài liệu và tệp `.txt` đi kèm.
#[tauri::command]
pub fn delete_lesson_document(
    app: AppHandle,
    document_id: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let id = document_id
        .as_ref()
        .and_then(serde_json::Value::as_str)
        .unwrap_or("");
    crate::lesson::delete_document(&app, id)
}

/// Xoá nhiều tài liệu trong một lượt; trả số dòng đã xoá và id thiếu.
#[tauri::command]
pub fn delete_lesson_documents(
    app: AppHandle,
    document_ids: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    crate::lesson::delete_documents(&app, document_ids.as_ref())
}

/// Phân tích giáo án: chọn provider, tra cache, gọi model một lần, lưu kết quả
/// và ghép vào dự án. Đây là lệnh duy nhất chờ model, nên là `async`.
#[tauri::command]
pub async fn analyze_lesson(
    app: AppHandle,
    payload: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    crate::lesson::analyze(app, payload).await
}

/// Phân loại đầu vào (câu hỏi / giáo án / văn bản) bằng luật offline.
#[tauri::command]
pub fn classify_lesson_input(
    app: AppHandle,
    payload: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    crate::lesson::classify(&app, payload.as_ref())
}

/// Cây mục lục offline của bước 1, từ `text` hoặc `documentId`.
#[tauri::command]
pub fn inspect_lesson_structure(
    app: AppHandle,
    payload: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    crate::lesson::structure(&app, payload.as_ref())
}

/// Bản xem trước phần giáo án sẽ gửi — cùng phép cắt đoạn với lượt phân tích.
#[tauri::command]
pub fn preview_lesson_selection(
    app: AppHandle,
    payload: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    crate::lesson::preview(&app, payload.as_ref())
}

/// Gợi ý thể loại trò chơi từ kết quả phân tích (luật, không gọi model).
#[tauri::command]
pub fn recommend_games(
    app: AppHandle,
    payload: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    crate::lesson::recommend(&app, payload.as_ref())
}

/// Ước lượng số lượng nội dung mà dự án + phân tích + model có thể chống đỡ.
#[tauri::command]
pub fn estimate_lesson_capacity(
    app: AppHandle,
    payload: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    crate::lesson::capacity(&app, payload.as_ref())
}

/// Đọc một kết quả phân tích đã lưu.
#[tauri::command]
pub fn get_lesson_analysis(
    app: AppHandle,
    analysis_id: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let id = analysis_id
        .as_ref()
        .and_then(serde_json::Value::as_str)
        .unwrap_or("");
    crate::lesson::get_analysis(&app, id)
}

/// Lưu kết quả phân tích (đường của renderer, không kèm cache key).
#[tauri::command]
pub fn save_lesson_analysis(
    app: AppHandle,
    analysis: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    crate::lesson::save_analysis(&app, analysis.as_ref())
}

/// Danh sách đề xuất đã lưu cho một phân tích.
#[tauri::command]
pub fn get_lesson_recommendations(
    app: AppHandle,
    analysis_id: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let id = analysis_id
        .as_ref()
        .and_then(serde_json::Value::as_str)
        .unwrap_or("");
    crate::lesson::list_recommendations(&app, id)
}

/// Chuyển một bản nháp sang thể loại đích (`convertDraft`, không gọi model).
#[tauri::command]
pub fn convert_lesson_draft(
    app: AppHandle,
    payload: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    crate::lesson::convert_draft(&app, payload.as_ref())
}

/// Báo cáo chất lượng tư vấn của bản nháp đang lưu; `null` khi chưa có nháp.
#[tauri::command]
pub fn check_lesson_quality(
    app: AppHandle,
    payload: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    crate::lesson::quality(&app, payload.as_ref())
}

/// Đổi đúng ba trường minh hoạ của một mục, không gọi AI.
#[tauri::command]
pub fn patch_lesson_item_assets(
    app: AppHandle,
    payload: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    crate::lesson::patch_item_assets(&app, payload.as_ref())
}

/// Tạo toàn bộ nội dung của dự án: cache hit không gọi model, cache miss chờ
/// tới 300 s nên phải chạy ngoài luồng async.
#[tauri::command]
pub async fn generate_lesson_draft(
    app: AppHandle,
    payload: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    crate::lesson::generate(app, payload).await
}

/// Tạo lại đúng các mục được chọn; luôn gọi model (không dùng cache).
#[tauri::command]
pub async fn regenerate_lesson_item(
    app: AppHandle,
    payload: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    crate::lesson::regenerate_item(app, payload).await
}

/// Lượt hỏi đáp giáo án (`lesson:chat-send`, #182).
#[tauri::command]
pub async fn send_lesson_chat(
    app: AppHandle,
    payload: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    crate::lesson::send_chat(app, payload).await
}

#[tauri::command]
pub fn list_lesson_chats(app: AppHandle) -> Result<serde_json::Value, String> {
    crate::lesson::list_chats(&app)
}

#[tauri::command]
pub fn get_lesson_chat(app: AppHandle, chat_id: &str) -> Result<serde_json::Value, String> {
    crate::lesson::get_chat(&app, chat_id)
}

#[tauri::command]
pub fn delete_lesson_chats(
    app: AppHandle,
    chat_ids: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    crate::lesson::delete_chats(&app, chat_ids.as_ref())
}

/// Huỷ lượt AI đang chờ. Trả `{ok}`: `false` khi không có lượt nào mang
/// `requestId` đó, đúng `aiRequests.cancel` của Electron.
#[tauri::command]
pub fn cancel_ai(
    app: AppHandle,
    request_id: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let id = request_id
        .as_ref()
        .and_then(serde_json::Value::as_str)
        .unwrap_or("");
    crate::lesson::cancel(&app, id)
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

/// Kiểm tra kết nối tới nhà cung cấp AI.
#[tauri::command]
pub async fn test_ai_provider(
    app: AppHandle,
    payload: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    crate::settings::test_provider(app, payload.unwrap_or(serde_json::Value::Null)).await
}

/// Danh sách tác vụ AI đang chạy và lịch sử.
#[tauri::command]
pub fn list_ai_tasks(
    app: AppHandle,
    payload: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    crate::ai_tasks::list_tasks(&app, payload.unwrap_or(serde_json::Value::Null))
}

/// Xác minh runtime CPU/Vulkan hiện có trên máy.
#[tauri::command]
pub fn verify_cpu_runtime(app: AppHandle) -> Result<serde_json::Value, String> {
    crate::ai_local::verify_runtime(&app)
}

#[tauri::command]
pub async fn open_about(app: AppHandle) -> Result<serde_json::Value, String> {
    crate::about::open(app).await
}

#[tauri::command]
pub fn about_info(app: AppHandle) -> Result<serde_json::Value, String> {
    crate::about::info(&app)
}

#[tauri::command]
pub fn about_state(app: AppHandle) -> Result<serde_json::Value, String> {
    crate::about::state(&app)
}

#[tauri::command]
pub async fn about_check(app: AppHandle) -> Result<serde_json::Value, String> {
    crate::about::check(app).await
}

#[tauri::command]
pub fn about_download(app: AppHandle) -> Result<serde_json::Value, String> {
    crate::about::download(&app)
}

#[tauri::command]
pub fn about_install(app: AppHandle) -> Result<serde_json::Value, String> {
    crate::about::install(&app)
}

#[tauri::command]
pub fn about_open_releases(url: Option<String>) -> Result<serde_json::Value, String> {
    crate::about::open_releases(url.as_deref())
}

#[tauri::command]
pub async fn generate_game(app: AppHandle, payload: Option<Value>) -> Result<Value, String> {
    crate::ai_generate::generate(app, payload).await
}

#[tauri::command]
pub async fn lan_start(app: AppHandle, payload: Option<Value>) -> Result<Value, String> {
    crate::lan::start(app, payload).await
}

#[tauri::command]
pub async fn lan_stop(app: AppHandle) -> Result<Value, String> {
    crate::lan::stop(app).await
}

#[tauri::command]
pub async fn lan_assign_team(app: AppHandle, payload: Option<Value>) -> Result<Value, String> {
    crate::lan::assign_team(app, payload).await
}

#[tauri::command]
pub async fn lan_begin(app: AppHandle) -> Result<Value, String> {
    crate::lan::begin(app).await
}

#[tauri::command]
pub async fn lan_next(app: AppHandle) -> Result<Value, String> {
    crate::lan::next(app).await
}

#[tauri::command]
pub async fn lan_finish(app: AppHandle) -> Result<Value, String> {
    crate::lan::finish(app).await
}

#[tauri::command]
pub async fn start_presentation(app: AppHandle, payload: Option<Value>) -> Result<Value, String> {
    crate::presentation::start(&app, payload).await
}

#[tauri::command]
pub async fn stop_presentation(app: AppHandle, payload: Option<Value>) -> Result<Value, String> {
    crate::presentation::stop(&app, payload).await
}

#[tauri::command]
pub async fn toggle_presentation(app: AppHandle, payload: Option<Value>) -> Result<Value, String> {
    crate::presentation::toggle(&app, payload).await
}

#[tauri::command]
pub async fn get_displays(app: AppHandle) -> Result<Value, String> {
    crate::presentation::get_displays(&app)
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

// The current renderer contract is implemented; keep the explicit error macro
// available for future channels that have not yet been ported.
unsupported! {}

#[cfg(test)]
mod tests {
    // Danh sách tên lệnh được sinh lại từ chính file này, nên test ở đây chỉ chốt
    // những bất biến đơn giản; đối chiếu với JSON nằm ở cổng Node.
    #[test]
    fn invoke_channel_rejects_unknown_channel() {
        assert!(!super::INVOKE_CHANNELS.contains(&"unknown:dummy"));
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
        let value = crate::settings::default_settings();
        // Bootstrap đọc `preferences.theme` trước lần render đầu tiên.
        assert_eq!(value["preferences"]["theme"], "system");
        assert_eq!(value["ai"]["mode"], "offline");
        assert!(value["ai"]["providers"].is_object());
    }

    #[test]
    fn hand_written_commands_are_exported_for_the_gate() {
        // Cổng Node chỉ biết tên lệnh qua bảng này; lệch tên ở đây nghĩa là
        // `generate_handler!` đăng ký một lệnh mà không kênh nào gọi tới.
        assert_eq!(super::hand_written("get_library"), Some(("library:get", "get_library")));
        assert_eq!(super::hand_written("shell_info"), Some(("shell:info", "shell_info")));
        assert_eq!(super::hand_written("lan_start"), Some(("lan:start", "lan_start")));
        assert_eq!(super::hand_written("generate_game"), Some(("ai:generate", "generate_game")));
        assert_eq!(super::hand_written("start_presentation"), Some(("presentation:start", "start_presentation")));
        assert_eq!(super::hand_written("unknown_command"), None);
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
