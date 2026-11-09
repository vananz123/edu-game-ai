//! Sáu kênh `library:*` chạy trên `edugame.sqlite`, giữ một kết nối mở cho cả
//! phiên làm việc.
//!
//! Luật lưu/xoá KHÔNG nằm ở đây — nó là `src/services/storage/library-ops.ts`,
//! chạy trong V8 nhúng (`embedded.rs`). Tệp này chỉ làm phần thuộc về vỏ:
//!
//!   • mở tệp đúng một lần rồi giữ trong state của cửa sổ (Electron cũng mở một
//!     `better-sqlite3` duy nhất ở `ensureData()`), chạy schema, và ghi trò chơi
//!     mẫu khi bảng `games` còn rỗng — đúng lần chạy đầu của Electron;
//!   • đưa tham số của từng kênh sang V8 theo đúng hình dạng mà hook của
//!     `src/preload.ts` gửi (một trò chơi, một id, một mảng id);
//!   • đổi lỗi thành câu tiếng Việt có mã, không để thông điệp V8 lộ ra;
//!   • dọn ảnh minh hoạ SAU khi dòng đã biến mất, và chỉ những ảnh không còn
//!     trò chơi hay bản nháp nào nhắc tới (cùng luật `removeUnreferencedImages`).
//!
//! VÌ SAO CÓ MỘT LUỒNG RIÊNG: `JsRuntime` của `deno_core` giữ `Rc` và con trỏ
//! tới isolate V8 — nó không `Send`, nên không đặt thẳng được vào state của Tauri
//! (`manage` đòi `Send + Sync + 'static`). Kết nối SQLite thì cũng chỉ đi theo
//! engine. Nên `Library` giữ ĐÚNG một kênh tin nhắn tới luồng sở hữu engine; mỗi
//! lệnh IPC gửi yêu cầu kèm số thứ tự và chờ câu trả lời. Mọi lệnh xếp hàng trên
//! một luồng, đúng thứ tự như `better-sqlite3` bên Electron.
//!
//! Hai op `library:seed` và `library:image-refs` KHÔNG phải kênh của renderer:
//! op đầu là lần chạy đầu, op sau là câu đọc của bước dọn ảnh. Vì vậy chúng
//! không nằm trong `CHANNELS` và không nằm trong `api::INVOKE_CHANNELS`.

use std::path::{Path, PathBuf};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::thread::JoinHandle;

use serde_json::Value;
use tauri::{AppHandle, Manager};

use crate::embedded::Embedded;
use crate::storage::{self, DbError};

/// Kênh nào dọn ảnh: hai kênh xoá trò chơi và hai kênh xoá dự án trả về id ảnh
/// mà dòng đã xoá nhắc tới (xem `deleteGame`/`deleteGames` của `library-ops.ts`
/// và `deleteProject`/`deleteProjects` của `project-ops.ts`).
pub const DELETE_GAME: &str = "library:delete-game";
pub const DELETE_GAMES: &str = "library:delete-games";
pub const DELETE_PROJECT: &str = "project:delete";
pub const DELETE_PROJECTS: &str = "project:delete-many";

/// Kênh xoá nào trả `images` để `remove_unused_images` dọn sau.
fn removes_images(channel: &str) -> bool {
    matches!(channel, DELETE_GAME | DELETE_GAMES | DELETE_PROJECT | DELETE_PROJECTS)
}

/// Một lượt gọi qua luồng của engine.
struct Job {
    channel: String,
    args: Vec<Value>,
    reply: Sender<Result<Value, DbError>>,
}

/// Cơ sở dữ liệu của giáo viên: một kết nối, một engine V8, dựng lần đầu rồi
/// dùng lại, trên một luồng riêng.
pub struct Library {
    jobs: Sender<Job>,
    images_dir: PathBuf,
    worker: Option<JoinHandle<()>>,
}

impl Drop for Library {
    /// Đóng kênh rồi chờ luồng dọn engine (đóng kết nối, trả WAL). Chờ có giới
    /// hạn: một lượt đang chạy nốt rồi luồng tự thoát vì kênh đã đóng.
    fn drop(&mut self) {
        let (dead, _) = channel();
        let sentinel = std::mem::replace(&mut self.jobs, dead);
        drop(sentinel);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

impl Library {
    /// Đường dẫn tệp thư viện trong thư mục dữ liệu riêng của bản Tauri.
    pub fn database_path(data_dir: &Path) -> PathBuf {
        data_dir.join(storage::DB_FILE)
    }

    /// Mở thư viện trong `data_dir`: tạo thư mục, mở tệp, chạy schema, seed lần
    /// đầu — tất cả trên luồng của engine, để V8 chỉ sinh ra và sống trên một
    /// luồng.
    pub fn open(data_dir: &Path) -> Result<Library, DbError> {
        let owned = data_dir.to_path_buf();
        Self::spawn(&owned)
    }

    /// Dựng engine TRÊN luồng của nó, rồi giữ nó ở đó đến khi thư viện bị thả.
    ///
    /// `data_dir` phải sống lâu hơn `spawn`, vì luồng giữ bản sao của nó; đó là
    /// lý do `install` dùng một đường dẫn `'static` thay vì đường dẫn dựng từ
    /// `AppHandle`.
    fn spawn(data_dir: &Path) -> Result<Library, DbError> {
        std::fs::create_dir_all(data_dir)
            .map_err(|error| DbError::Io(format!("không tạo được thư mục {}: {error}", data_dir.display())))?;
        let database = Self::database_path(data_dir);
        let owned = data_dir.to_path_buf();
        let (jobs, incoming) = channel();
        let (ready, opened) = channel();
        let worker = std::thread::Builder::new()
            .name("edugame-library".into())
            .spawn(move || {
                // `deno_core` hỏi `tokio::runtime::Handle::try_current()` lúc dựng
                // isolate; không có handle mà V8 đăng một tác vụ trễ (bộ dọn bộ nhớ
                // của zod đủ để đăng) thì nó `abort()` cả tiến trình. Runtime một
                // luồng chỉ sống trên luồng này và chỉ để V8 có chỗ hẹn giờ.
                let runtime = match tokio::runtime::Builder::new_current_thread().enable_all().build() {
                    Ok(runtime) => runtime,
                    Err(error) => {
                        let _ = ready.send(Err(format!("không dựng được runtime cho V8: {error}")));
                        return;
                    }
                };
                let _guard = runtime.enter();
                match Embedded::open(database, &owned) {
                    Ok(engine) => serve(Engine(engine), &ready, &incoming),
                    Err(error) => {
                        let _ = ready.send(Err(error.to_string()));
                    }
                }
            })
            .map_err(|error| DbError::Io(format!("không mở được luồng thư viện: {error}")))?;
        match opened.recv() {
            Ok(Ok(())) => Ok(Library {
                jobs,
                images_dir: data_dir.join("images"),
                worker: Some(worker),
            }),
            Ok(Err(error)) => Err(DbError::Open(error)),
            Err(_) => Err(DbError::Open("luồng thư viện dừng khi đang mở tệp.".into())),
        }
    }

    /// Mở thư viện cho cả phiên làm việc và đặt vào state của ứng dụng.
    ///
    /// Lỗi ở đây được trả về nguyên văn để `setup` của `lib.rs` chặn cửa sổ: mở
    /// một cửa sổ mà mọi lệnh thư viện đều hỏng thì giáo viên tưởng đã mất dữ
    /// liệu.
    pub fn install(app: &AppHandle) -> Result<(), DbError> {
        let data_dir = crate::paths::data_dir(app).map_err(DbError::Io)?;
        // `data_dir` chỉ được đọc TẠI ĐÂY để dựng đường dẫn; giữ một bản `'static`
        // để luồng engine cũng có nó mà không cần vòng đời của `AppHandle`.
        let owned: &'static Path = Box::leak(data_dir.into_boxed_path());
        app.manage(Self::open(owned)?);
        Ok(())
    }

    /// Phần dùng chung của mọi kênh, không cần `AppHandle` — test gọi thẳng đây.
    pub fn run(&self, channel: &str, args: &[Value]) -> Result<Value, DbError> {
        let result = self.call(channel, args)?;
        if removes_images(channel) {
            self.remove_unused_images(&result);
        }
        Ok(result)
    }

    /// Gửi một lượt gọi sang luồng engine và chờ nó trả lời.
    fn call(&self, channel: &str, args: &[Value]) -> Result<Value, DbError> {
        let (reply, answer) = std::sync::mpsc::channel();
        self.jobs
            .send(Job {
                channel: channel.to_string(),
                args: args.to_vec(),
                reply,
            })
            .map_err(|_| DbError::Io("luồng thư viện đã dừng.".into()))?;
        answer
            .recv()
            .map_err(|_| DbError::Io("luồng thư viện không trả lời.".into()))?
    }

    /// Xoá `images/<id>.img` cho từng id mà lệnh xoá vừa trả về, trừ id còn được
    /// một trò chơi hay bản nháp khác nhắc tới. Cố ý bỏ qua lỗi: dòng đã xoá
    /// xong, một tệp ảnh mồ côi không được biến thao tác xoá thành thất bại.
    fn remove_unused_images(&self, result: &Value) {
        let Some(images) = result.get("images").and_then(Value::as_array) else {
            return;
        };
        let mut wanted: Vec<String> = Vec::with_capacity(images.len());
        for image in images {
            let Some(id) = image.as_str() else { continue };
            if !is_custom_image_id(id) || wanted.iter().any(|seen| seen == id) {
                continue;
            }
            wanted.push(id.to_string());
        }
        if wanted.is_empty() {
            return;
        }
        let still_used = self.referenced_images();
        for id in wanted {
            if still_used.iter().any(|kept| *kept == id) {
                continue;
            }
            let _ = std::fs::remove_file(self.images_dir.join(format!("{id}.img")));
        }
    }

    /// Id ảnh còn được nhắc tới bởi mọi trò chơi đã lưu và mọi bản nháp.
    ///
    /// Dòng hỏng không giữ ảnh nào: cùng cách `referencedCustomImageIds()` bỏ qua
    /// một `data_json` không đọc được.
    fn referenced_images(&self) -> Vec<String> {
        let Ok(rows) = self.call("library:image-refs", &[]) else {
            return Vec::new();
        };
        let Some(rows) = rows.as_array() else { return Vec::new() };
        let mut ids = Vec::new();
        for row in rows {
            let Some(text) = row.get("data_json").and_then(Value::as_str) else { continue };
            let Ok(payload) = serde_json::from_str::<Value>(text) else { continue };
            collect_image_ids(&payload, &mut ids);
        }
        ids
    }
}

/// Vỏ của engine trên luồng của nó. `Embedded` không `Send`, nên nó chỉ được
/// dựng trong chính luồng `serve` và không bao giờ rời khỏi đó.
struct Engine(Embedded);

/// Vòng đời của luồng engine: báo đã mở xong, rồi nhận lượt gọi tới khi kênh
/// đóng, cuối cùng thả engine (đóng kết nối, trả WAL).
fn serve(engine: Engine, ready: &Sender<Result<(), String>>, incoming: &Receiver<Job>) {
    let mut engine = engine;
    if ready.send(Ok(())).is_err() {
        return;
    }
    while let Ok(job) = incoming.recv() {
        let _ = job.reply.send(engine.0.call(&job.channel, &job.args, &now()));
    }
}

/// Chạy một kênh `library:*` với tham số renderer đã gửi.
pub fn run(app: &AppHandle, channel: &str, args: &[Value]) -> Result<Value, String> {
    let library = app
        .try_state::<Library>()
        .ok_or_else(|| "Thư viện chưa mở được: hãy khởi động lại ứng dụng.".to_string())?;
    library.run(channel, args).map_err(|error| error.to_string())
}

/// Cùng biểu thức `CUSTOM_IMAGE_ID` của `custom-illustration.ts`; id lạ không
/// bao giờ được ghép thành đường dẫn tệp.
fn is_custom_image_id(value: &str) -> bool {
    let Some(hex) = value.strip_prefix("ci-") else { return false };
    hex.len() == 32 && hex.chars().all(|c| c.is_ascii_digit() || ('a'..='f').contains(&c))
}

/// Đi theo mọi `illustrationAssetId` trong một payload, y như
/// `collectCustomImageIds` của `library-ops.ts`.
fn collect_image_ids(value: &Value, into: &mut Vec<String>) {
    match value {
        Value::Array(entries) => {
            for entry in entries {
                collect_image_ids(entry, into);
            }
        }
        Value::Object(map) => {
            for (key, entry) in map {
                if key == "illustrationAssetId" {
                    if let Some(id) = entry.as_str().filter(|id| is_custom_image_id(id)) {
                        into.push(id.to_string());
                    }
                } else {
                    collect_image_ids(entry, into);
                }
            }
        }
        _ => {}
    }
}

/// `new Date().toISOString()` bằng Rust, tính theo UTC.
pub fn now() -> String {
    let elapsed = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let days = (elapsed.as_secs() / 86_400) as i64;
    let seconds_of_day = (elapsed.as_secs() % 86_400) as u32;
    let (year, month, day) = civil_from_days(days);
    let hour = seconds_of_day / 3_600;
    let minute = (seconds_of_day % 3_600) / 60;
    let second = seconds_of_day % 60;
    format!(
        "{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.{:03}Z",
        elapsed.subsec_millis()
    )
}

/// Ngày dương lịch từ số ngày kể từ 1970-01-01 (thuật toán của Howard Hinnant).
fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let shifted = days + 719_468;
    let era = shifted.div_euclid(146_097);
    let day_of_era = shifted.rem_euclid(146_097);
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_index = (5 * day_of_year + 2) / 153;
    let day = (day_of_year - (153 * month_index + 2) / 5 + 1) as u32;
    let month = if month_index < 10 { month_index + 3 } else { month_index - 9 } as u32;
    (if month <= 2 { year + 1 } else { year }, month, day)
}

/// Đọc chuỗi `data_json` của một bảng — dùng cho test dựng dữ liệu 0.5.1.
#[cfg(test)]
pub(crate) fn raw_rows(connection: &rusqlite::Connection, table: &str) -> Vec<String> {
    let sql = format!("SELECT data_json FROM {table}");
    let mut statement = connection.prepare(&sql).expect("prepare");
    statement
        .query_map([], |row| row.get::<_, String>(0))
        .expect("query")
        .map(|row| row.expect("row"))
        .collect()
}

/// Các kênh mà `library::run` nhận — cổng Node đối chiếu với `api.rs`.
pub const CHANNELS: &[&str] = &[
    "library:get",
    "library:save-game",
    "library:delete-game",
    "library:delete-games",
    "library:save-session",
    "library:delete-sessions",
    "project:save-draft",
    "project:get",
    "project:list",
    "project:delete",
    "project:delete-many",
];

#[cfg(test)]
mod tests {
    use super::*;

    /// Một trò chơi hợp lệ tối giản (bốn bộ kiểm của V8 phải nhận).
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

    fn library(data_dir: &Path) -> Library {
        Library::open(data_dir).expect("mở thư viện")
    }

    #[test]
    fn a_fresh_library_opens_with_the_sample_game() {
        let dir = tempfile::tempdir().expect("tempdir");
        let library = library(dir.path());
        let answer = library.run("library:get", &[]).expect("đọc thư viện");
        assert_eq!(answer["version"], 1);
        let games = answer["games"].as_array().expect("games");
        assert_eq!(games.len(), 1, "lần chạy đầu có đúng một trò chơi mẫu");
        assert_eq!(games[0]["id"], "sample-traffic-001");
        assert_eq!(games[0]["questions"].as_array().map(Vec::len), Some(5));
    }

    #[test]
    fn seeds_only_once_across_reopens() {
        let dir = tempfile::tempdir().expect("tempdir");
        {
            let library = library(dir.path());
            library.run("library:save-game", &[scenario("Bài của cô")]).expect("lưu");
        }
        let library = library(dir.path());
        let answer = library.run("library:get", &[]).expect("đọc lại");
        assert_eq!(answer["games"].as_array().map(Vec::len), Some(2), "không seed lần hai");
    }

    #[test]
    fn saves_reads_edits_and_deletes_a_game() {
        let dir = tempfile::tempdir().expect("tempdir");
        let library = library(dir.path());
        let saved = library.run("library:save-game", &[scenario("An toàn giao thông")]).expect("lưu");
        let id = saved["id"].as_str().expect("id").to_string();
        assert_eq!(saved["title"], "An toàn giao thông");
        assert_eq!(saved["createdAt"].as_str(), saved["updatedAt"].as_str());

        let mut edited = saved.clone();
        edited["title"] = Value::from("An toàn giao thông (sửa)");
        let updated = library.run("library:save-game", &[edited]).expect("sửa");
        assert_eq!(updated["id"], id, "sửa giữ nguyên id");
        assert_eq!(updated["createdAt"], saved["createdAt"], "createdAt không đổi");

        let answer = library.run("library:get", &[]).expect("đọc");
        let games = answer["games"].as_array().expect("games");
        assert_eq!(games.len(), 2);
        assert_eq!(games[0]["title"], "An toàn giao thông (sửa)", "mới sửa đứng đầu");

        let removed = library.run("library:delete-game", &[Value::from(id.clone())]).expect("xoá");
        assert_eq!(removed["ok"], true);
        let answer = library.run("library:get", &[]).expect("đọc sau xoá");
        assert_eq!(answer["games"].as_array().map(Vec::len), Some(1));
    }

    #[test]
    fn refuses_a_game_the_rules_reject() {
        let dir = tempfile::tempdir().expect("tempdir");
        let library = library(dir.path());
        let error = library
            .run("library:save-game", &[serde_json::json!({ "title": 7 })])
            .expect_err("tiêu đề không phải chuỗi");
        assert_eq!(error.code(), "DB_INVALID_INPUT");
        assert_eq!(error.to_string(), "Dữ liệu trò chơi không hợp lệ.");
    }

    #[test]
    fn deletes_many_games_and_reports_what_was_missing() {
        let dir = tempfile::tempdir().expect("tempdir");
        let library = library(dir.path());
        let first = library.run("library:save-game", &[scenario("Một")]).expect("lưu 1");
        let second = library.run("library:save-game", &[scenario("Hai")]).expect("lưu 2");
        let ids = serde_json::json!([first["id"], second["id"], "không-tồn-tại"]);
        let answer = library.run("library:delete-games", &[ids]).expect("xoá lô");
        assert_eq!(answer["ok"], true);
        assert_eq!(answer["deleted"], 2);
        assert_eq!(answer["missing"], 1);
    }

    #[test]
    fn refuses_an_empty_batch_with_the_electron_sentence() {
        let dir = tempfile::tempdir().expect("tempdir");
        let library = library(dir.path());
        let error = library.run("library:delete-games", &[serde_json::json!([])]).expect_err("lô rỗng");
        assert_eq!(error.code(), "DB_INVALID_INPUT");
        assert_eq!(error.to_string(), "Chưa chọn trò chơi nào để xoá.");
        let too_many = serde_json::json!((0..501).map(|n| format!("g{n}")).collect::<Vec<_>>());
        let error = library.run("library:delete-games", &[too_many]).expect_err("quá 500");
        assert_eq!(error.to_string(), "Mỗi lần chỉ xoá tối đa 500 trò chơi.");
    }

    #[test]
    fn session_ids_are_generated_once_and_history_is_bounded() {
        let dir = tempfile::tempdir().expect("tempdir");
        let library = library(dir.path());
        let saved = library
            .run("library:save-session", &[serde_json::json!({ "gameId": "g1", "score": 80 })])
            .expect("lưu phiên");
        let id = saved["id"].as_str().expect("id").to_string();
        let mut renamed = saved.clone();
        renamed["playerName"] = Value::from("Bạn A");
        let again = library
            .run("library:save-session", &[renamed])
            .expect("đổi tên người chơi");
        assert_eq!(again["id"], id, "cùng phiên, không thêm dòng");
        assert_eq!(again["createdAt"], saved["createdAt"]);

        let answer = library.run("library:get", &[]).expect("đọc");
        let sessions = answer["sessions"].as_array().expect("sessions");
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0]["playerName"], "Bạn A");
    }

    #[test]
    fn deletes_sessions_without_touching_games() {
        let dir = tempfile::tempdir().expect("tempdir");
        let library = library(dir.path());
        let session = library
            .run("library:save-session", &[serde_json::json!({ "gameId": "g1" })])
            .expect("lưu phiên");
        let answer = library
            .run("library:delete-sessions", &[serde_json::json!([session["id"]])])
            .expect("xoá phiên");
        assert_eq!(answer["deleted"], 1);
        let library_now = library.run("library:get", &[]).expect("đọc");
        assert_eq!(library_now["sessions"].as_array().map(Vec::len), Some(0));
        assert_eq!(library_now["games"].as_array().map(Vec::len), Some(1), "trò chơi còn nguyên");
    }

    #[test]
    fn removes_only_images_nothing_else_references() {
        let dir = tempfile::tempdir().expect("tempdir");
        let images = dir.path().join("images");
        std::fs::create_dir_all(&images).expect("thư mục ảnh");
        let shared = format!("ci-{}", "a".repeat(32));
        let lonely = format!("ci-{}", "b".repeat(32));
        for id in [&shared, &lonely] {
            std::fs::write(images.join(format!("{id}.img")), b"png").expect("ghi ảnh");
        }
        let library = library(dir.path());
        let game_with = |title: &str, id: &str| {
            let mut game = scenario(title);
            game["questions"][0]["illustrationAssetId"] = Value::from(id);
            game
        };
        let keep = library
            .run("library:save-game", &[game_with("Giữ ảnh", &shared)])
            .expect("lưu 1");
        let drop = library
            .run("library:save-game", &[game_with("Xoá ảnh", &shared)])
            .expect("lưu 2");
        let alone = library
            .run("library:save-game", &[game_with("Một mình", &lonely)])
            .expect("lưu 3");

        library
            .run("library:delete-game", &[drop["id"].clone()])
            .expect("xoá game dùng chung ảnh");
        assert!(images.join(format!("{shared}.img")).exists(), "ảnh còn trò chơi khác dùng");

        library
            .run("library:delete-game", &[alone["id"].clone()])
            .expect("xoá game riêng");
        assert!(!images.join(format!("{lonely}.img")).exists(), "ảnh không ai dùng phải biến mất");

        library
            .run("library:delete-game", &[keep["id"].clone()])
            .expect("xoá game cuối");
        assert!(!images.join(format!("{shared}.img")).exists(), "ảnh hết người dùng phải biến mất");
    }

    #[test]
    fn ignores_image_ids_that_could_escape_the_folder() {
        let dir = tempfile::tempdir().expect("tempdir");
        let library = library(dir.path());
        let mut game = scenario("Hình lạ");
        game["questions"][0]["illustrationAssetId"] = Value::from("ci-../../edugame.sqlite");
        let saved = library.run("library:save-game", &[game]).expect("lưu");
        // Id lạ không qua biểu thức `ci-` + 32 hex, nên không hình nào bị dọn và
        // tệp cơ sở dữ liệu còn nguyên.
        library.run("library:delete-game", &[saved["id"].clone()]).expect("xoá");
        assert!(Library::database_path(dir.path()).exists());
    }

    #[test]
    fn image_id_helpers_match_the_typescript_ones() {
        assert!(is_custom_image_id(&format!("ci-{}", "0123456789abcdef".repeat(2))));
        assert!(!is_custom_image_id("ci-0123"));
        assert!(!is_custom_image_id("ci-0123456789ABCDEF0123456789ABCDEF"));
        let mut ids = Vec::new();
        collect_image_ids(
            &serde_json::json!({ "a": [{ "illustrationAssetId": "ci-00000000000000000000000000000001" }],
                                 "b": { "illustrationAssetId": "không-phải" } }),
            &mut ids,
        );
        assert_eq!(ids, vec!["ci-00000000000000000000000000000001".to_string()]);
    }

    #[test]
    fn timestamps_look_like_to_iso_string() {
        let stamp = now();
        assert_eq!(stamp.len(), 24, "{stamp}");
        assert!(stamp.ends_with('Z'));
        assert_eq!(&stamp[4..5], "-");
        assert_eq!(civil_from_days(0), (1970, 1, 1));
        assert_eq!(civil_from_days(19_723), (2024, 1, 1));
    }

    #[test]
    fn a_copied_0_5_1_file_keeps_its_rows_and_gains_no_sample() {
        let dir = tempfile::tempdir().expect("tempdir");
        {
            // Dựng tệp 0.5.1 ngay trong thư mục dữ liệu sẽ mở, rồi đóng kết nối
            // để `Library::open` đọc lại từ đĩa.
            let connection = crate::storage::open(&dir.path().join(crate::storage::DB_FILE)).expect("mở");
            crate::storage::ensure_schema(&connection).expect("schema");
            assert!(raw_rows(&connection, "games").is_empty());
            connection
                .execute(
                    "INSERT INTO games (id,title,created_at,updated_at,data_json)
                     VALUES ('g1','Của cô giáo','2026-10-01T00:00:00.000Z','2026-10-02T00:00:00.000Z',
                             '{\"id\":\"g1\",\"title\":\"Của cô giáo\",\"template\":\"scenario\",\"questions\":[]}')",
                    [],
                )
                .expect("seed 0.5.1");
        }
        let library = library(dir.path());
        let answer = library.run("library:get", &[]).expect("đọc");
        let games = answer["games"].as_array().expect("games");
        assert_eq!(games.len(), 1, "tệp đã có dữ liệu không bị seed");
        assert_eq!(games[0]["id"], "g1");
    }

    /// Một bản nháp tối giản: chỉ những trường mà `validateProjectForWrite` bắt.
    fn draft(id: &str, title: &str) -> Value {
        serde_json::json!({
            "id": id,
            "schemaVersion": 1,
            "status": "draft",
            "step": "input",
            "title": title,
            "description": "",
            "tags": [],
            "sourceName": "",
            "lesson": Value::Null,
            "analysisId": Value::Null,
            "recommendationId": Value::Null,
            "config": Value::Null,
            "draft": Value::Null,
            "gameSnapshot": Value::Null,
            "gameId": Value::Null,
            "createdAt": "2026-01-01T00:00:00.000Z",
            "updatedAt": "2026-01-01T00:00:00.000Z"
        })
    }

    #[test]
    fn saves_lists_and_reads_a_project_with_electron_rules() {
        let dir = tempfile::tempdir().expect("tempdir");
        let library = library(dir.path());
        let saved = library
            .run("project:save-draft", &[draft("p1", "Bản nháp đầu")])
            .expect("lưu dự án");
        assert_eq!(saved["id"], "p1");
        assert_eq!(saved["createdAt"], "2026-01-01T00:00:00.000Z", "createdAt của bản nháp được giữ");
        assert_ne!(saved["updatedAt"], "2026-01-01T00:00:00.000Z", "updatedAt là lúc ghi");

        let listed = library.run("project:list", &[]).expect("liệt kê");
        assert_eq!(listed.as_array().map(Vec::len), Some(1));
        assert_eq!(listed[0]["title"], "Bản nháp đầu");

        let one = library.run("project:get", &[Value::from("p1")]).expect("đọc một");
        assert_eq!(one["step"], "input");
        assert!(library.run("project:get", &[Value::from("không-có")]).expect("đọc thiếu").is_null());
    }

    #[test]
    fn editing_a_project_keeps_created_at_and_moves_it_first() {
        let dir = tempfile::tempdir().expect("tempdir");
        let library = library(dir.path());
        let first = library.run("project:save-draft", &[draft("p1", "Một")]).expect("lưu 1");
        library.run("project:save-draft", &[draft("p2", "Hai")]).expect("lưu 2");

        let mut edited = draft("p1", "Một (sửa)");
        edited["createdAt"] = Value::from("2026-05-05T00:00:00.000Z");
        let updated = library.run("project:save-draft", &[edited]).expect("sửa");
        assert_eq!(updated["createdAt"], first["createdAt"], "dòng cũ giữ created_at của nó");

        let listed = library.run("project:list", &[]).expect("liệt kê");
        let listed = listed.as_array().expect("mảng");
        assert_eq!(listed.len(), 2, "sửa không thêm dòng");
        assert_eq!(listed[0]["title"], "Một (sửa)", "mới sửa đứng đầu");
    }

    #[test]
    fn refuses_a_project_the_electron_rules_reject() {
        let dir = tempfile::tempdir().expect("tempdir");
        let library = library(dir.path());
        let mut broken = draft("p1", "Sai");
        broken["status"] = Value::from("đang-làm");
        let error = library.run("project:save-draft", &[broken]).expect_err("trạng thái lạ");
        assert_eq!(error.code(), "DB_INVALID_INPUT");
        assert_eq!(error.to_string(), "Trạng thái dự án không hợp lệ: đang-làm.");

        let mut newer = draft("p2", "Mới hơn");
        newer["schemaVersion"] = Value::from(99);
        let error = library.run("project:save-draft", &[newer]).expect_err("phiên bản mới hơn");
        assert!(error.to_string().contains("ứng dụng chỉ hỗ trợ 1"), "{}", error);
    }

    #[test]
    fn deletes_projects_one_by_one_and_in_a_batch() {
        let dir = tempfile::tempdir().expect("tempdir");
        let library = library(dir.path());
        for id in ["p1", "p2", "p3"] {
            library.run("project:save-draft", &[draft(id, id)]).expect("lưu");
        }
        let single = library.run("project:delete", &[Value::from("p3")]).expect("xoá một");
        assert_eq!(single["ok"], true);
        assert!(library.run("project:get", &[Value::from("p3")]).expect("đọc").is_null());

        let batch = library
            .run("project:delete-many", &[serde_json::json!(["p1", "p1", "", "không-có"])])
            .expect("xoá lô");
        assert_eq!(batch["deleted"], 1, "id trùng và id rỗng bị lọc trước");
        assert_eq!(batch["missing"], 1);
        assert_eq!(library.run("project:list", &[]).expect("liệt kê").as_array().map(Vec::len), Some(1));
    }

    #[test]
    fn refuses_project_batches_with_the_electron_sentences() {
        let dir = tempfile::tempdir().expect("tempdir");
        let library = library(dir.path());
        let error = library.run("project:delete-many", &[serde_json::json!([])]).expect_err("lô rỗng");
        assert_eq!(error.to_string(), "Chưa chọn dự án nào để xoá.");
        let too_many = serde_json::json!((0..201).map(|n| format!("p{n}")).collect::<Vec<_>>());
        let error = library.run("project:delete-many", &[too_many]).expect_err("quá 200");
        assert_eq!(error.to_string(), "Mỗi lần chỉ xoá tối đa 200 dự án.");
    }

    #[test]
    fn deleting_a_project_removes_only_the_images_nothing_else_keeps() {
        let dir = tempfile::tempdir().expect("tempdir");
        let images = dir.path().join("images");
        std::fs::create_dir_all(&images).expect("thư mục ảnh");
        let shared = format!("ci-{}", "c".repeat(32));
        let lonely = format!("ci-{}", "d".repeat(32));
        for id in [&shared, &lonely] {
            std::fs::write(images.join(format!("{id}.img")), b"png").expect("ghi ảnh");
        }
        let library = library(dir.path());
        let with_image = |id: &str, image: &str| {
            let mut project = draft(id, id);
            project["gameSnapshot"] = serde_json::json!({
                "title": id, "template": "scenario",
                "questions": [{ "id": "q1", "type": "scenario", "prompt": "Hỏi?", "illustrationAssetId": image,
                                "options": [{ "id": "a", "text": "A" }, { "id": "b", "text": "B" }],
                                "correctOptionId": "a", "explanation": "Vì thế." }]
            });
            project
        };
        let kept = library.run("project:save-draft", &[with_image("p1", &shared)]).expect("lưu 1");
        let dropped = library.run("project:save-draft", &[with_image("p2", &shared)]).expect("lưu 2");
        library.run("project:save-draft", &[with_image("p3", &lonely)]).expect("lưu 3");
        assert_eq!(kept["id"], "p1");
        assert_eq!(dropped["id"], "p2");

        library.run("project:delete", &[Value::from("p2")]).expect("xoá dự án dùng chung ảnh");
        assert!(images.join(format!("{shared}.img")).exists(), "ảnh còn bản nháp khác dùng");

        library.run("project:delete-many", &[serde_json::json!(["p1", "p3"])]).expect("xoá lô");
        assert!(!images.join(format!("{shared}.img")).exists(), "ảnh hết người dùng phải biến mất");
        assert!(!images.join(format!("{lonely}.img")).exists(), "ảnh riêng của bản nháp cũng vậy");
        assert_eq!(library.run("project:list", &[]).expect("liệt kê").as_array().map(Vec::len), Some(0));
    }

    #[test]
    fn a_saved_project_survives_closing_and_reopening() {
        let dir = tempfile::tempdir().expect("tempdir");
        {
            let library = library(dir.path());
            library.run("project:save-draft", &[draft("p1", "Còn đây")]).expect("lưu");
        }
        let library = library(dir.path());
        let listed = library.run("project:list", &[]).expect("đọc lại");
        assert_eq!(listed.as_array().map(Vec::len), Some(1), "dự án sống qua lần đóng");
        assert_eq!(listed[0]["title"], "Còn đây");
    }
}
