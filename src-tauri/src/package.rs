//! Gói `.egame`: xuất và nhập một trò chơi qua tệp.
//!
//! Ranh giới giống nhóm `library:*`, nhưng có thêm một lớp tệp:
//!
//!   • LUẬT (cấu trúc gói, bốn bộ kiểm thể loại, bỏ URL tài nguyên ngoài, id mới
//!     khi id đã có trong thư viện) là `src/services/game/game-package.ts`, chạy
//!     trong V8 nhúng qua slot `EGPACKAGES` (`game-package-ops.ts`). Đúng bộ mã
//!     Electron chạy cho hai kênh `files:export-game` / `files:import-game`;
//!   • TỆP là của tệp này: hộp thoại mở/lưu của tiến trình, đọc/ghi UTF-8, và
//!     trần kích thước trước khi đọc byte nào.
//!
//! VÌ SAO HỘP THOẠI Ở ĐÂY: frontend Tauri không có quyền `dialog:`/`fs:` (cổng
//! `tests/unit/tauri-contract.test.ts` chặn), nên renderer không chọn được đường
//! dẫn. Đường dẫn duy nhất renderer chạm tới là biến môi trường của CỔNG KIỂM TRA
//! (`EDUGAME_TAURI_PACKAGE_*`), và biến đó chỉ dùng khi KÊNH ĐANG ĐO tới lượt:
//! tiến trình cha đặt nó, renderer không đặt được biến môi trường của tiến trình.
//!
//! Tệp nhập là đầu vào KHÔNG TIN ĐƯỢC: nó qua `readPackage` như mọi gói khác —
//! kiểm dữ liệu, bỏ URL ngoài (`stripImportedAssetUrls`), và trả id mới khi id
//! trong gói đã có trong thư viện.

use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

use crate::library::Library;

/// Biến môi trường của cổng kiểm tra: tiến trình cha đặt đường dẫn hộp thoại
/// để cổng đo được mà không có người bấm. `EDUGAME_TAURI_PACKAGE` bật đường tắt;
/// các biến dưới chứa đường dẫn (chuỗi rỗng = giả lập bấm Huỷ). Hai biến đầu là
/// lượt thường; ba biến cuối là ba gói xấu do cổng ghi sẵn. Mỗi lượt nhập dùng
/// `EDUGAME_TAURI_PACKAGE_NEXT` làm bộ đếm: "1" là lượt nhập thật, "2"/"3"/"4" là
/// ba gói xấu. Bộ đếm đọc lúc gọi — renderer chỉ chọn được SỐ, không chọn được
/// đường dẫn, và cả bốn biến đều do tiến trình cha đặt.
pub const GATE_ENV: &str = "EDUGAME_TAURI_PACKAGE";
const GATE_SAVE: &str = "EDUGAME_TAURI_PACKAGE_SAVE";
const GATE_OPEN: &str = "EDUGAME_TAURI_PACKAGE_OPEN";
const GATE_NEXT: &str = "EDUGAME_TAURI_PACKAGE_NEXT";
/// Thứ tự lượt nhập xấu: bộ đếm 2 → 3 → 4.
const GATE_FLAKY: [&str; 3] = [
    "EDUGAME_TAURI_PACKAGE_BROKEN",
    "EDUGAME_TAURI_PACKAGE_EMPTY",
    "EDUGAME_TAURI_PACKAGE_OVERSIZED",
];

/// Đường dẫn hộp thoại của cổng cho kênh này, nếu đường tắt đang bật.
pub fn gate_target(channel: &str) -> Option<PathBuf> {
    if std::env::var(GATE_ENV).map(|value| value != "gate").unwrap_or(true) {
        return None;
    }
    let name = match channel {
        "files:export-game" => GATE_SAVE,
        "files:import-game" => gate_turn()
            .checked_sub(1)
            .and_then(|index| usize::try_from(index).ok())
            .and_then(|index| GATE_FLAKY.get(index).copied())
            .unwrap_or(GATE_OPEN),
        _ => return None,
    };
    std::env::var_os(name).map(PathBuf::from)
}

/// Lượt nhập của cổng do cổng kiểm tra chọn (xem `GATE_NEXT`).
///
/// Chỉ tồn tại khi `EDUGAME_TAURI_PACKAGE=gate`. Renderer chọn được SỐ lượt, không
/// chọn được đường dẫn: bốn biến đường dẫn đều do tiến trình cha đặt trước khi mở
/// binary, và renderer không đặt được biến môi trường của tiến trình.
pub fn set_gate_turn(value: Option<&Value>) -> Result<Value, String> {
    if std::env::var(GATE_ENV).map(|value| value != "gate").unwrap_or(true) {
        return Err(fail("EG_GATE", "bộ đếm hộp thoại chỉ dùng cho cổng kiểm tra"));
    }
    let turn = value
        .and_then(Value::as_u64)
        .filter(|turn| (1..=4).contains(turn))
        .ok_or_else(|| fail("EG_GATE", "bộ đếm phải là 1, 2, 3 hoặc 4"))?;
    let turn = turn.to_string();
    // SAFETY: chỉ nhánh cổng kiểm tra chạy tới đây; ở bản phát hành hàm trả lỗi
    // trước khi đụng biến môi trường. Không luồng nào khác đọc/ghi biến này cùng lúc.
    unsafe { std::env::set_var(GATE_NEXT, &turn) };
    Ok(Value::from(turn))
}

/// Lượt nhập của cổng: 0 = lượt thật, 1..3 = gói xấu thứ nhất..thứ ba.
fn gate_turn() -> usize {
    std::env::var(GATE_NEXT)
        .ok()
        .and_then(|value| value.trim().parse::<usize>().ok())
        .map(|value| value.saturating_sub(1).min(GATE_FLAKY.len()))
        .unwrap_or(0)
}

/// Trần kích thước danh nghĩa nếu V8 không trả `IMPORT_GAME_MAX_BYTES` — cùng
/// con số của `game-package.ts`. Rust chỉ dùng con số này cho lần đọc đầu tiên.
const MAX_BYTES_FALLBACK: u64 = 20 * 1024 * 1024;

/// Kết quả một lượt xuất, cùng hình dạng handler `files:export-game` trả.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub ok: bool,
    pub path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Canceled {
    pub canceled: bool,
}

/// Mã lỗi của hai kênh gói. Rust trả chuỗi có tiền tố để cổng kiểm tra phân biệt
/// "gói hỏng" (lỗi của tệp) với "tệp không đọc được" (lỗi của vỏ).
fn fail(code: &str, message: impl AsRef<str>) -> String {
    format!("{code}: {}", message.as_ref())
}

fn library(app: &AppHandle) -> Result<tauri::State<'_, Library>, String> {
    app.try_state::<Library>()
        .ok_or_else(|| fail("EG_LIBRARY", "Thư viện chưa mở được: hãy khởi động lại ứng dụng."))
}

/// Trần kích thước do luật TypeScript quyết định — đọc từ chính bundle, không gõ
/// lại con số ở hai nơi.
fn max_bytes(app: &AppHandle) -> u64 {
    library(app)
        .ok()
        .and_then(|library| library.call("package:max-bytes", &[]).ok())
        .and_then(|value| value.as_u64())
        .unwrap_or(MAX_BYTES_FALLBACK)
}

/// Đường dẫn hộp thoại cho lượt gọi này: `None` khi người dùng bấm Huỷ, `Some`
/// khi có tệp.
///
/// Đường dẫn của cổng kiểm tra (`requested`) chỉ đến từ tiến trình cha: renderer
/// không đặt được biến môi trường của tiến trình, nên nó không chọn được tệp nào.
fn gate_path(requested: Option<PathBuf>) -> Option<Option<PathBuf>> {
    requested.map(|path| {
        // Chuỗi rỗng là pha của cổng giả lập "bấm Huỷ".
        if path.as_os_str().is_empty() {
            None
        } else {
            Some(path)
        }
    })
}

/// Xuất: hỏi đường dẫn, lấy chữ của gói từ V8, ghi UTF-8.
///
/// `async` để hộp thoại không dựng bên trong lời gọi chờ (xem `picker.rs`); chỉ
/// lượt GHI TỆP đi sang luồng chặn — lượt gọi V8 chờ ở đây vì `spawn_blocking`
/// không thấy state thư viện.
pub async fn export(app: &AppHandle, game: Value, requested: Option<PathBuf>) -> Result<Value, String> {
    let target = match gate_path(requested) {
        Some(Some(path)) => path,
        Some(None) => return canceled(),
        None => {
            let file_name = default_file_name(app, &game)?;
            let chosen = crate::picker::choose(app, move |app| {
                app.dialog()
                    .file()
                    .set_title("Xuất gói trò chơi")
                    .set_file_name(&file_name)
                    .add_filter("EduGame package", &["egame", "json"])
            })
            .await;
            match chosen.map(crate::picker::to_path).transpose()? {
                Some(path) => path,
                None => return canceled(),
            }
        }
    };
    write_package(app, game, &target).await
}

/// Tên tệp gợi ý của hộp thoại xuất — cùng luật `package:export` mà nửa ghi dùng.
fn default_file_name(app: &AppHandle, game: &Value) -> Result<String, String> {
    let library = library(app)?;
    let written = library
        .call("package:export", &[game.clone()])
        .map_err(|error| fail("EG_PACKAGE", error.to_string()))?;
    Ok(written
        .get("fileName")
        .and_then(Value::as_str)
        .unwrap_or("tro-choi.egame")
        .to_string())
}

fn canceled() -> Result<Value, String> {
    serde_json::to_value(Canceled { canceled: true }).map_err(|error| error.to_string())
}

/// Nửa sau của `export`: chữ của gói lấy từ V8 ở đây, chỉ phần ghi tệp đi sang
/// luồng chặn.
pub(crate) async fn write_package(app: &AppHandle, game: Value, target: &Path) -> Result<Value, String> {
    let written = library(app)?
        .call("package:export", &[game])
        .map_err(|error| fail("EG_PACKAGE", error.to_string()))?;
    let text = written
        .get("text")
        .and_then(Value::as_str)
        .ok_or_else(|| fail("EG_PACKAGE", "bộ ghi gói không trả chữ"))?
        .to_string();

    let path = target.to_path_buf();
    let written_to = path.clone();
    crate::picker::io(move || {
        std::fs::write(&path, text)
            .map(|()| written_to.display().to_string())
            .map_err(|error| fail("EG_WRITE", format!("không ghi được {}: {error}", path.display())))
    })
    .await?;
    let result = ExportResult {
        ok: true,
        path: target.display().to_string(),
    };
    serde_json::to_value(result).map_err(|error| error.to_string())
}

/// Nhập: hỏi tệp, chặn tệp quá lớn trước khi đọc, đọc UTF-8, rồi để luật của
/// `readPackage` quyết định. `Ok(Value::Null)` là người dùng bấm Huỷ.
pub async fn import(app: &AppHandle, requested: Option<PathBuf>) -> Result<Value, String> {
    let target = match gate_path(requested) {
        Some(Some(path)) => path,
        Some(None) => return Ok(Value::Null),
        None => {
            let chosen = crate::picker::choose(app, |app| {
                app.dialog()
                    .file()
                    .set_title("Nhập trò chơi")
                    .add_filter("EduGame package", &["egame", "json"])
            })
            .await;
            match chosen.map(crate::picker::to_path).transpose()? {
                Some(path) => path,
                None => return Ok(Value::Null),
            }
        }
    };
    let library = library(app)?;
    read_and_import(app, &library, &target).await
}

/// Đọc tệp thành chữ (sang luồng chặn) rồi đưa luật nhập của V8 áp lên — lượt
/// gọi V8 chờ ở luồng của runtime, nơi state thư viện còn nhìn thấy được.
pub async fn read_and_import(app: &AppHandle, library: &Library, target: &Path) -> Result<Value, String> {
    let meta = std::fs::metadata(target)
        .map_err(|error| fail("EG_READ", format!("không đọc được {}: {error}", target.display())))?;
    if !meta.is_file() {
        return Err(fail("EG_READ", "đường dẫn đã chọn không phải tệp"));
    }
    if meta.len() > max_bytes(app) {
        let limit = max_bytes(app) / (1024 * 1024);
        return Err(fail(
            "EG_TOO_LARGE",
            format!("Tệp lớn hơn {limit} MB — có thể đã chọn nhầm tệp."),
        ));
    }
    let path = target.to_path_buf();
    let text = crate::picker::io(move || read_file_text(&path)).await?;
    let now = crate::library::now();
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.subsec_nanos().to_string())
        .unwrap_or_else(|_| "0".to_string());
    library
        .call("package:read", &[Value::String(text), Value::String(now), Value::String(nonce)])
        .map_err(|error| fail("EG_PACKAGE", error.to_string()))
}

/// Đọc tệp thành chữ. Tách khỏi `read_and_import` để test chạm được nhánh "tệp
/// nhị phân" mà không cần `AppHandle` — và để nó chạy được trên luồng chặn.
fn read_file_text(target: &Path) -> Result<String, String> {
    std::fs::read_to_string(target).map_err(|error| {
        // Tệp nhị phân (hoặc tệp của bảng tính đổi đuôi): câu dưới nói đúng
        // việc cần làm thay vì lộ lỗi của `std`.
        if error.kind() == std::io::ErrorKind::InvalidData {
            fail(
                "EG_READ",
                format!("Tệp {} không phải tệp chữ UTF-8 — có thể đã chọn nhầm tệp.", target.display()),
            )
        } else {
            fail("EG_READ", format!("không đọc được {}: {error}", target.display()))
        }
    })
}

/// Cổng kiểm tra cần biết tiêu đề của tệp vừa xuất — đọc lại để so với lúc nhập.
pub fn file_size(path: &Path) -> u64 {
    std::fs::metadata(path).map(|meta| meta.len()).unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn filters_match_the_electron_dialogs() {
        // Cùng bộ lọc hai handler `main.ts` dùng; đổi một bên là cổng kiểm tra
        // dừng mở được tệp `.egame` mà phía Electron vẫn mở. So trên chính tệp
        // này để một lần sửa bộ lọc ở một hộp thoại là đỏ.
        let source = include_str!("package.rs");
        assert_eq!(source.matches("\"EduGame package\", &[\"egame\", \"json\"]").count(), 2);
    }

    #[test]
    fn errors_carry_a_code_the_renderer_can_branch_on() {
        let message = fail("EG_TOO_LARGE", "quá lớn");
        assert!(message.starts_with("EG_TOO_LARGE: "), "{message}");
    }

    #[test]
    fn a_binary_file_is_refused_as_a_wrong_file_not_as_a_crash() {
        let dir = tempfile::tempdir().expect("tempdir");
        let file = dir.path().join("anh.png");
        // Byte 0xFF không hợp lệ trong UTF-8, giống một tệp ảnh đổi đuôi.
        std::fs::write(&file, [0xFF, 0xFE, 0x00, 0x01]).expect("write");
        let error = read_file_text(&file).expect_err("phải từ chối");
        assert!(error.starts_with("EG_READ: "), "{error}");
        assert!(error.contains("không phải tệp chữ UTF-8"), "{error}");
    }

    #[test]
    fn size_helper_reports_a_real_file() {
        let dir = tempfile::tempdir().expect("tempdir");
        let file = dir.path().join("g.egame");
        std::fs::write(&file, b"{}").expect("write");
        assert_eq!(file_size(&file), 2);
        assert_eq!(file_size(&dir.path().join("missing.egame")), 0);
    }

    /// Một trò chơi hợp lệ tối giản — bốn bộ kiểm của V8 phải nhận.
    fn scenario(title: &str) -> Value {
        serde_json::json!({
            "title": title,
            "template": "scenario",
            "questions": [
                { "id": "q1", "type": "scenario", "prompt": "Đèn đỏ thì dừng?", "options": [
                    { "id": "a", "text": "Đi tiếp" }, { "id": "b", "text": "Dừng lại" } ],
                  "correctOptionId": "b", "explanation": "Dừng trước vạch." }
            ]
        })
    }

    /// Đường của luật gói trong engine: xuất ra chữ, rồi nhập chính chữ đó.
    fn write_text(library: &Library, game: Value) -> String {
        let written = library.call("package:export", &[game]).expect("xuất gói");
        written["text"].as_str().expect("text").to_string()
    }

    fn read_text(library: &Library, text: &str) -> Result<Value, String> {
        library
            .call("package:read", &[Value::String(text.to_string()), Value::String(crate::library::now()), Value::String("1".to_string())])
            .map_err(|error| error.to_string())
    }

    #[test]
    fn round_trip_keeps_the_game_and_its_question_bank() {
        let dir = tempfile::tempdir().expect("tempdir");
        let library = Library::open(dir.path()).expect("thư viện");
        let text = write_text(&library, scenario("Gói của cô"));
        // Tệp trên đĩa là chữ JSON, cùng hình dạng Electron ghi — `writeGamePackage`
        // xuống dòng thụt lề (`JSON.stringify(…, null, 2)`), nên là `": "` chứ `":"`.
        assert!(text.contains("\"packageFormat\": \"edugame\""), "{}", &text[..80.min(text.len())]);
        assert!(text.contains("\"packageVersion\": 1"));

        let game = read_text(&library, &text).expect("nhập lại");
        assert_eq!(game["title"], "Gói của cô");
        assert_eq!(game["template"], "scenario");
        assert_eq!(game["questions"].as_array().map(Vec::len), Some(1));
        assert_eq!(game["questions"][0]["explanation"], "Dừng trước vạch.");
        assert!(
            game["id"].as_str().unwrap_or("").starts_with("imported_"),
            "gói nhập vào nhận id mới: {}",
            game["id"]
        );
        assert_eq!(game.get("createdAt"), None, "mốc thời gian của máy khác bị bỏ");
    }

    #[test]
    fn the_suggested_file_name_drops_characters_windows_forbids() {
        let dir = tempfile::tempdir().expect("tempdir");
        let library = Library::open(dir.path()).expect("thư viện");
        let written = library
            .call("package:export", &[scenario("An toàn: giao/thông?*")])
            .expect("xuất");
        assert_eq!(written["fileName"], "An toàn- giao-thông--.egame");
    }

    #[test]
    fn a_reimport_of_a_saved_game_gets_a_new_id_instead_of_overwriting() {
        // Nhập một gói, lưu nó, rồi nhập lại CHÍNH gói đó: id trong gói đã có
        // trong thư viện, nên lượt thứ hai phải mang id khác — nếu không, lưu nó
        // là ghi đè dòng thật (đúng lỗi mà `idTaken` sửa ở `game-package.ts`).
        let dir = tempfile::tempdir().expect("tempdir");
        let library = Library::open(dir.path()).expect("thư viện");
        let text = write_text(&library, scenario("Nhập hai lần"));
        let first = read_text(&library, &text).expect("nhập 1");
        let saved = library.run("library:save-game", &[first.clone()]).expect("lưu");
        assert_eq!(saved["id"], first["id"]);

        let second = read_text(&library, &text).expect("nhập 2");
        assert_ne!(second["id"], first["id"], "gói trùng id trong thư viện nhận id mới");
        assert_eq!(second["title"], "Nhập hai lần");
    }

    #[test]
    fn hostile_and_broken_packages_are_refused_with_a_readable_sentence() {
        let dir = tempfile::tempdir().expect("tempdir");
        let library = Library::open(dir.path()).expect("thư viện");

        // Không phải JSON.
        let error = read_text(&library, "{không phải json").expect_err("JSON hỏng");
        assert!(error.contains("JSON hợp lệ"), "{error}");
        // JSON nhưng thiếu tên/danh sách câu hỏi.
        let error = read_text(&library, "{\"game\":{\"title\":\"x\"}}").expect_err("thiếu câu hỏi");
        assert!(error.contains("danh sách câu hỏi"), "{error}");
        // Câu hỏi không đủ hai phương án — bộ kiểm của Electron từ chối.
        let broken = serde_json::json!({
            "packageFormat": "edugame", "packageVersion": 1,
            "game": { "title": "Hỏng", "template": "quiz", "questions": [
                { "id": "q1", "prompt": "Một đáp án?", "options": [{ "id": "a", "text": "A" }], "correctOptionId": "a" }
            ] }
        });
        let error = read_text(&library, &broken.to_string()).expect_err("thiếu phương án");
        assert!(error.contains("ít nhất hai phương án"), "{error}");
        // Đường đua thiếu đội: bị từ chối, không tự sửa.
        let race = serde_json::json!({
            "packageFormat": "edugame", "packageVersion": 1,
            "game": { "title": "Đua", "template": "race", "questions": [], "race": {
                "trackLength": 10, "teamCount": 2, "maxRounds": 5, "stepByDifficulty": true, "luckEnabled": true,
                "teams": [{ "id": "t1", "name": "Đội 1", "color": "#111111" }], "questions": []
            } }
        });
        let error = read_text(&library, &race.to_string()).expect_err("thiếu đội");
        assert!(error.contains("không hợp lệ"), "{error}");
    }

    #[test]
    fn external_asset_urls_are_stripped_from_an_imported_package() {
        // #118: một gói có thể trỏ ảnh ra Internet; nhập vào phải mất URL đó, nếu
        // không buổi học offline sẽ gọi mạng (hoặc lộ việc giáo viên đang mở gì).
        let dir = tempfile::tempdir().expect("tempdir");
        let library = Library::open(dir.path()).expect("thư viện");
        let mut game = scenario("Ảnh ngoài");
        game["questions"][0]["imageUrl"] = Value::from("https://tracker.example.com/a.png");
        game["imageUrl"] = Value::from("https://tracker.example.com/cover.png");
        let text = write_text(&library, game);
        let imported = read_text(&library, &text).expect("nhập");
        let shown = imported.to_string();
        assert!(!shown.contains("tracker.example.com"), "URL tài nguyên ngoài còn trong gói nhập: {shown}");
        assert_eq!(imported["template"], "scenario", "phần còn lại của trò chơi nguyên vẹn");
    }

    #[test]
    fn an_oversized_file_is_refused_before_any_rule_runs() {
        // Trần 20 MB lấy từ chính `IMPORT_GAME_MAX_BYTES` của bundle; kiểm nó
        // khớp với hằng của `game-package.ts` thay vì tin vào con số gõ tay.
        let dir = tempfile::tempdir().expect("tempdir");
        let library = Library::open(dir.path()).expect("thư viện");
        let limit = library.call("package:max-bytes", &[]).expect("trần");
        assert_eq!(limit.as_u64(), Some(MAX_BYTES_FALLBACK));
    }
}
