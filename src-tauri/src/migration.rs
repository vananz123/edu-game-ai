//! Giai đoạn 4: nhập profile của bản Electron vào vỏ Tauri.
//!
//! Quyết định #251 câu 2–5: bản Tauri thay thế bản Electron trên cùng máy, nhưng
//! hai vỏ dùng hai thư mục dữ liệu khác nhau. Vì vậy lần chạy đầu của Tauri phải
//! PHÁT HIỆN profile cũ, GỢI Ý (không tự động) nhập, SAO LƯU nguồn trước, rồi mới
//! chép dữ liệu sang. Ba ràng buộc dưới đây là lý do tệp này dài hơn một lệnh
//! `copy`:
//!
//!   1. **Nguồn không đổi.** Không mở cơ sở dữ liệu nguồn bằng một kết nối đọc-
//!      ghi, không sửa, không xoá. Mọi thao tác đọc đều qua một bản sao trong
//!      `migration-work/`, và bản sao đó phải đứng yên (so kích thước + mtime
//!      trước/sau khi chép) để tránh chụp giữa lúc Electron đang ghi.
//!   2. **Bản sao lưu có thể phục hồi.** `backups/electron-*` chứa bản sao
//!      byte-copy của DB (kèm `-wal`/`-shm`), một snapshot nhất quán tạo bằng
//!      `VACUUM INTO`, toàn bộ `images/` + `lessons/`, và `settings.json` đã
//!      tước khoá bí mật. Mỗi tệp có SHA-256 trong `manifest.json`; app không mở
//!      đường nào để xoá thư mục này. `ai-local/` (model hàng GB) không chép.
//!   3. **Không báo thành công nửa vời.** Bảng được chép trong MỘT transaction
//!      theo thứ tự khoá ngoại; tệp được chép rồi đối chiếu SHA-256; cài đặt chỉ
//!      ghi khi tệp đích chưa có. `migration.json` chỉ nhận `completedAt` sau khi
//!      đối chiếu lại số dòng, id và checksum tệp. Chạy lại là `INSERT OR IGNORE`,
//!      nên lần hai thêm 0 dòng và không làm hỏng dữ liệu đã nhập.
//!
//! Khoá bí mật (`ai.providers.*.apiKeyEncrypted`, legacy `apiKeyEncrypted`/
//! `apiKey`) bị xoá khỏi MỌI bản ghi: không vào DB, status, manifest hay backup.
//! Giáo viên nhập lại khoá trong trang Cài đặt; base URL/model được giữ nguyên.

use std::collections::HashSet;
use std::fs::{self, File};
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use rusqlite::Connection;
use serde::Serialize;
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};

use crate::paths;
use crate::picker;
use crate::storage;

/// Tệp trạng thái trong thư mục dữ liệu Tauri. Tồn tại qua lần cài đè (cùng
/// `application identifier`), nên `completedAt` là thứ chặn migration chạy lần hai.
pub const STATUS_FILE: &str = "migration.json";
/// Thư mục chứa các bản sao lưu nguồn; không có kênh nào xoá nó.
pub const BACKUP_DIR: &str = "backups";
/// Thư mục làm việc tạm (bản sao DB, snapshot); dọn sau mỗi lần chạy.
const WORK_DIR: &str = "migration-work";
/// Thư mục con quen thuộc bên trong profile Electron.
const ELECTRON_DATA_SUBDIR: &str = "edugame-data";
/// Hai tên thư mục profile từng được Electron dùng. `edugame-studio` là tên thật
/// của `app.getName()` trong `package.json`; `EduGame Studio` là tên cũ đã ghi
/// trong tài liệu, giữ lại để một profile cũ vẫn được nhận.
const ELECTRON_PROFILE_DIRS: [&str; 2] = ["edugame-studio", "EduGame Studio"];
/// Biến môi trường chỉ dùng cho cổng kiểm tra / chạy thử: trỏ thẳng tới profile
/// nguồn. Bản phát hành bình thường không đặt biến này.
const SOURCE_ENV: &str = "EDUGAME_ELECTRON_PROFILE";

/// Thứ tự chép bảng: cha trước con, đúng các khoá ngoại của schema 0.5.1.
/// `INSERT OR IGNORE` + `defer_foreign_keys` vẫn cần thứ tự này để lần nhập đầu
/// không phụ thuộc vào việc SQLite hoãn kiểm tra tới COMMIT.
const COPY_ORDER: [&str; 11] = [
    "games",
    "sessions",
    "lesson_documents",
    "lesson_analyses",
    "game_recommendations",
    "game_projects",
    "lesson_chunks",
    "ai_generation_cache",
    "ai_tasks",
    "lesson_chats",
    "lesson_chat_messages",
];

/// Khoá bí mật có thể xuất hiện trong `settings.json`. So khớp theo TÊN ở mọi
/// độ sâu, nên nó bắt cả `ai.providers.openai.apiKeyEncrypted` lẫn legacy
/// `ai.apiKeyEncrypted`.
const SECRET_KEYS: [&str; 2] = ["apiKey", "apiKeyEncrypted"];

/// Chỉ một lần nhập tại một thời điểm. Hai cửa sổ (hoặc một cú bấm đôi) không
/// được cùng ghi vào một tệp SQLite.
static IMPORT_LOCK: Mutex<()> = Mutex::new(());

/// Thư mục nguồn do giáo viên chọn qua hộp thoại (giai đoạn 4). Không nhận
/// đường dẫn từ renderer: renderer chỉ gọi `migration:browse`, Rust mở hộp
/// thoại, và đường dẫn đã chọn nằm lại đây.
static CHOSEN_SOURCE: Mutex<Option<PathBuf>> = Mutex::new(None);

static UNIQUE_COUNTER: AtomicU64 = AtomicU64::new(0);

type MResult<T> = Result<T, Fail>;

/// Lỗi nội bộ có mã ổn định, phần việc, và câu tiếng Việt cho giáo viên.
#[derive(Debug, Clone)]
struct Fail {
    code: &'static str,
    part: &'static str,
    message: String,
}

impl Fail {
    fn new(code: &'static str, part: &'static str, message: impl Into<String>) -> Self {
        Self { code, part, message: message.into() }
    }

    fn issue(&self) -> Issue {
        Issue {
            code: self.code.to_string(),
            part: self.part.to_string(),
            message: self.message.clone(),
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Issue {
    code: String,
    part: String,
    message: String,
}

/// Số dòng của 11 bảng sidecar. Tên trường JSON theo camelCase để renderer đọc
/// thẳng (`lessonDocuments`), không phải tự đổi tên.
#[derive(Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Counts {
    pub games: i64,
    pub sessions: i64,
    pub lesson_documents: i64,
    pub lesson_analyses: i64,
    pub lesson_chunks: i64,
    pub game_recommendations: i64,
    pub game_projects: i64,
    pub lesson_chats: i64,
    pub lesson_chat_messages: i64,
    pub ai_generation_cache: i64,
    pub ai_tasks: i64,
}

#[derive(Clone, Copy, Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct FileSummary {
    files: u64,
    bytes: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceReport {
    path: String,
    profile_path: String,
    db_file: String,
    db_bytes: u64,
    modified_at_ms: u64,
    user_version: i64,
    tables: Vec<String>,
    counts: Counts,
    images: FileSummary,
    lessons: FileSummary,
    settings_present: bool,
    ai_local_present: bool,
    ai_local_bytes: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectReport {
    found: bool,
    already_migrated: bool,
    source_path: Option<String>,
    source: Option<SourceReport>,
    error: Option<Issue>,
    searched: Vec<String>,
    status: Option<Value>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportReport {
    ok: bool,
    status: String,
    already_migrated: bool,
    source_path: Option<String>,
    source: Option<SourceReport>,
    backup_path: Option<String>,
    started_at: u64,
    finished_at: u64,
    tables: Vec<TableCopy>,
    files: FilesReport,
    settings: SettingsReport,
    ai_local: AiLocalReport,
    warnings: Vec<String>,
    error: Option<Issue>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TableCopy {
    table: String,
    source: i64,
    inserted: i64,
    existing: i64,
}

#[derive(Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct FilesReport {
    images: CopyReport,
    lessons: CopyReport,
}

#[derive(Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct CopyReport {
    total: u64,
    copied: u64,
    existing: u64,
    bytes: u64,
    conflicts: Vec<String>,
}

#[derive(Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct SettingsReport {
    /// `imported | skipped-existing | missing | corrupt-skipped`.
    status: String,
    keys_removed: u64,
}

#[derive(Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct AiLocalReport {
    present: bool,
    bytes: u64,
    copied: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ManifestEntry {
    path: String,
    bytes: u64,
    sha256: String,
}

struct FileHash {
    bytes: u64,
    sha256: String,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn unique_stamp() -> String {
    let counter = UNIQUE_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("{}-{counter}", now_ms())
}

fn quote_ident(name: &str) -> String {
    format!("\"{}\"", name.replace('"', "\"\""))
}

/// Đường dẫn tương đối dạng `/` để manifest đọc được trên mọi nền tảng và
/// không bao giờ chứa `..` (mọi thành phần đều là `Component::Normal`).
fn rel_text(path: &Path) -> String {
    path.components()
        .filter_map(|component| match component {
            Component::Normal(value) => Some(value.to_string_lossy().into_owned()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/")
}

/// Ghép một đường dẫn tương đối vào gốc, từ chối `..`, ổ đĩa và đường dẫn tuyệt
/// đối. Dùng cho cả manifest lẫn `text_rel_path` của tài liệu: dữ liệu giáo viên
/// là dữ liệu, không được biến thành đường dẫn đọc/ghi tuỳ ý.
fn safe_join(base: &Path, relative: &str) -> Option<PathBuf> {
    let mut out = base.to_path_buf();
    let mut seen = false;
    for part in relative.split(['/', '\\']) {
        if part.is_empty() || part == "." {
            continue;
        }
        if part == ".." || part.contains(':') {
            return None;
        }
        out.push(part);
        seen = true;
    }
    if seen { Some(out) } else { None }
}

fn sha256_bytes(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}

fn sha256_file(path: &Path, part: &'static str) -> MResult<FileHash> {
    let mut file = File::open(path)
        .map_err(|error| Fail::new("EG_MIGRATION_IO", part, format!("không đọc được {}: {error}", path.display())))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    let mut bytes = 0u64;
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| Fail::new("EG_MIGRATION_IO", part, format!("không đọc được {}: {error}", path.display())))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
        bytes += read as u64;
    }
    Ok(FileHash { bytes, sha256: hex::encode(hasher.finalize()) })
}

/// Chép một tệp rồi đọc lại để so SHA-256. Không có bước này thì một đĩa đầy
/// hoặc một tệp bị khoá có thể để lại bản sao cụt mà vẫn báo "xong".
fn copy_verified(source: &Path, destination: &Path, part: &'static str) -> MResult<FileHash> {
    let hash = sha256_file(source, part)?;
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| Fail::new("EG_MIGRATION_IO", part, format!("không tạo được {}: {error}", parent.display())))?;
    }
    fs::copy(source, destination).map_err(|error| {
        Fail::new("EG_MIGRATION_IO", part, format!("không chép được {} → {}: {error}", source.display(), destination.display()))
    })?;
    let copied = sha256_file(destination, part)?;
    if copied.bytes != hash.bytes || copied.sha256 != hash.sha256 {
        let _ = fs::remove_file(destination);
        return Err(Fail::new(
            "EG_MIGRATION_CHECKSUM",
            part,
            format!("bản sao của {} không khớp SHA-256 sau khi chép", source.display()),
        ));
    }
    Ok(copied)
}

/// Mọi tệp thường dưới `root`. Bỏ qua symlink để một profile lạ không kéo tệp
/// ngoài thư mục vào bản sao lưu.
fn walk_files(root: &Path, part: &'static str) -> MResult<Vec<PathBuf>> {
    let mut files = Vec::new();
    if !root.exists() {
        return Ok(files);
    }
    let mut stack = vec![root.to_path_buf()];
    while let Some(directory) = stack.pop() {
        let entries = fs::read_dir(&directory)
            .map_err(|error| Fail::new("EG_MIGRATION_IO", part, format!("không đọc được {}: {error}", directory.display())))?;
        for entry in entries {
            let entry = entry
                .map_err(|error| Fail::new("EG_MIGRATION_IO", part, format!("không đọc được {}: {error}", directory.display())))?;
            let kind = entry
                .file_type()
                .map_err(|error| Fail::new("EG_MIGRATION_IO", part, format!("không đọc được {}: {error}", entry.path().display())))?;
            if kind.is_symlink() {
                continue;
            }
            if kind.is_dir() {
                stack.push(entry.path());
            } else if kind.is_file() {
                files.push(entry.path());
            }
        }
    }
    files.sort();
    Ok(files)
}

fn dir_summary(root: &Path, part: &'static str) -> MResult<FileSummary> {
    let mut summary = FileSummary::default();
    for file in walk_files(root, part)? {
        let metadata = fs::metadata(&file)
            .map_err(|error| Fail::new("EG_MIGRATION_IO", part, format!("không đọc được {}: {error}", file.display())))?;
        summary.files += 1;
        summary.bytes += metadata.len();
    }
    Ok(summary)
}

fn write_text(path: &Path, text: &str) -> MResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| Fail::new("EG_MIGRATION_IO", "status", format!("không tạo được {}: {error}", parent.display())))?;
    }
    let temp = path.with_file_name(format!(
        "{}.tmp-{}",
        path.file_name().map(|name| name.to_string_lossy().into_owned()).unwrap_or_else(|| "migration".to_string()),
        unique_stamp()
    ));
    fs::write(&temp, text)
        .map_err(|error| Fail::new("EG_MIGRATION_IO", "status", format!("không ghi được {}: {error}", temp.display())))?;
    fs::rename(&temp, path)
        .map_err(|error| Fail::new("EG_MIGRATION_IO", "status", format!("không thay được {}: {error}", path.display())))
}

fn write_json(path: &Path, value: &Value) -> MResult<()> {
    let text = serde_json::to_string_pretty(value)
        .map_err(|error| Fail::new("EG_MIGRATION_JSON", "status", format!("không mã hoá JSON: {error}")))?;
    write_text(path, &text)
}

/// Thư mục tạm tự dọn. Bản sao nguồn không bao giờ được để lại trong
/// `migration-work/` sau một lỗi.
struct WorkDir(PathBuf);

impl WorkDir {
    fn new(target: &Path, prefix: &str) -> MResult<Self> {
        let root = target.join(WORK_DIR);
        fs::create_dir_all(&root)
            .map_err(|error| Fail::new("EG_MIGRATION_IO", "work", format!("không tạo được {}: {error}", root.display())))?;
        let path = root.join(format!("{prefix}-{}", unique_stamp()));
        fs::create_dir_all(&path)
            .map_err(|error| Fail::new("EG_MIGRATION_IO", "work", format!("không tạo được {}: {error}", path.display())))?;
        Ok(Self(path))
    }
}

impl Drop for WorkDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

/// `edugame-data` chứa `edugame.sqlite`, hoặc chính đường dẫn đã là thư mục đó
/// (giáo viên có thể chọn `%APPDATA%/edugame-studio` hoặc `.../edugame-data`).
fn data_dir_of(path: &Path) -> Option<PathBuf> {
    if path.join(storage::DB_FILE).is_file() {
        return Some(path.to_path_buf());
    }
    let nested = path.join(ELECTRON_DATA_SUBDIR);
    if nested.join(storage::DB_FILE).is_file() {
        return Some(nested);
    }
    None
}

fn resolve_source(
    explicit: Option<PathBuf>,
    environment: Option<PathBuf>,
    appdata: &Path,
) -> (Option<PathBuf>, Vec<String>, Option<Fail>) {
    let mut searched = Vec::new();
    if let Some(path) = explicit {
        searched.push(path.display().to_string());
        return match data_dir_of(&path) {
            Some(data) => (Some(data), searched, None),
            None => (
                None,
                searched,
                Some(Fail::new(
                    "EG_MIGRATION_SOURCE",
                    "detect",
                    format!(
                        "Thư mục đã chọn không có {} (hoặc {}/{}).",
                        storage::DB_FILE,
                        ELECTRON_DATA_SUBDIR,
                        storage::DB_FILE
                    ),
                )),
            ),
        };
    }
    if let Some(path) = environment {
        searched.push(path.display().to_string());
        return match data_dir_of(&path) {
            Some(data) => (Some(data), searched, None),
            None => (
                None,
                searched,
                Some(Fail::new(
                    "EG_MIGRATION_SOURCE",
                    "detect",
                    format!("{} không phải profile EduGame Studio cũ.", path.display()),
                )),
            ),
        };
    }
    for name in ELECTRON_PROFILE_DIRS {
        let candidate = appdata.join(name).join(ELECTRON_DATA_SUBDIR);
        searched.push(candidate.display().to_string());
        if candidate.join(storage::DB_FILE).is_file() {
            return (Some(candidate), searched, None);
        }
    }
    (None, searched, None)
}

fn chosen_source() -> Option<PathBuf> {
    CHOSEN_SOURCE.lock().ok().and_then(|guard| guard.clone())
}

fn environment_source() -> Option<PathBuf> {
    std::env::var_os(SOURCE_ENV)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
}

fn db_signature(source: &Path) -> MResult<Vec<(String, u64, u128)>> {
    let mut signature = Vec::new();
    for name in [storage::DB_FILE.to_string(), format!("{}-wal", storage::DB_FILE), format!("{}-shm", storage::DB_FILE)] {
        let path = source.join(&name);
        match fs::metadata(&path) {
            Ok(metadata) => {
                let modified = metadata
                    .modified()
                    .ok()
                    .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                    .map(|duration| duration.as_nanos())
                    .unwrap_or(0);
                signature.push((name, metadata.len(), modified));
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => {
                return Err(Fail::new(
                    "EG_MIGRATION_IO",
                    "backup",
                    format!("không đọc được {}: {error}", path.display()),
                ))
            }
        }
    }
    Ok(signature)
}

/// Chép DB + WAL + SHM, chỉ chấp nhận khi bộ ba không đổi trong lúc chép. Nếu
/// Electron đang ghi, lần chép có thể rơi vào giữa một checkpoint; thử lại vài
/// lần rồi báo lỗi thay vì tạo một bản sao lưu sai.
fn copy_db_set(source: &Path, destination: &Path) -> MResult<Vec<(String, FileHash)>> {
    fs::create_dir_all(destination)
        .map_err(|error| Fail::new("EG_MIGRATION_IO", "backup", format!("không tạo được {}: {error}", destination.display())))?;
    for attempt in 0..4 {
        let before = db_signature(source)?;
        let mut copied = Vec::new();
        for name in [storage::DB_FILE.to_string(), format!("{}-wal", storage::DB_FILE), format!("{}-shm", storage::DB_FILE)] {
            let file = source.join(&name);
            if !file.is_file() {
                continue;
            }
            let hash = copy_verified(&file, &destination.join(&name), "backup")?;
            copied.push((name, hash));
        }
        let after = db_signature(source)?;
        if before == after {
            return Ok(copied);
        }
        if attempt == 3 {
            return Err(Fail::new(
                "EG_MIGRATION_SOURCE_BUSY",
                "backup",
                "Profile Electron đang được ghi liên tục. Hãy đóng bản Electron rồi thử lại.",
            ));
        }
        std::thread::sleep(Duration::from_millis(150));
    }
    unreachable!("vòng lặp luôn trả về ở lần thử cuối")
}

fn quick_check(connection: &Connection, part: &'static str) -> MResult<String> {
    let mut statement = connection
        .prepare("PRAGMA quick_check")
        .map_err(|error| Fail::new("EG_MIGRATION_DB", part, format!("không kiểm tra được cơ sở dữ liệu: {error}")))?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| Fail::new("EG_MIGRATION_DB", part, format!("không kiểm tra được cơ sở dữ liệu: {error}")))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| Fail::new("EG_MIGRATION_DB", part, format!("không kiểm tra được cơ sở dữ liệu: {error}")))?;
    Ok(rows.join("; "))
}

fn foreign_key_issues(connection: &Connection, schema: Option<&str>) -> MResult<i64> {
    let sql = match schema {
        Some(name) => format!("PRAGMA {name}.foreign_key_check"),
        None => "PRAGMA foreign_key_check".to_string(),
    };
    let mut statement = connection
        .prepare(&sql)
        .map_err(|error| Fail::new("EG_MIGRATION_DB", "verify", format!("không kiểm tra được khoá ngoại: {error}")))?;
    let mut rows = statement
        .query([])
        .map_err(|error| Fail::new("EG_MIGRATION_DB", "verify", format!("không kiểm tra được khoá ngoại: {error}")))?;
    let mut count = 0;
    while rows
        .next()
        .map_err(|error| Fail::new("EG_MIGRATION_DB", "verify", format!("không kiểm tra được khoá ngoại: {error}")))?
        .is_some()
    {
        count += 1;
    }
    Ok(count)
}

fn table_names(connection: &Connection, schema: Option<&str>) -> MResult<Vec<String>> {
    let sql = match schema {
        Some(name) => format!(
            "SELECT name FROM {name}.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        ),
        None => "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name".to_string(),
    };
    let mut statement = connection
        .prepare(&sql)
        .map_err(|error| Fail::new("EG_MIGRATION_DB", "detect", format!("không đọc được schema: {error}")))?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| Fail::new("EG_MIGRATION_DB", "detect", format!("không đọc được schema: {error}")))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| Fail::new("EG_MIGRATION_DB", "detect", format!("không đọc được schema: {error}")))?;
    Ok(rows)
}

fn count_table(connection: &Connection, schema: Option<&str>, table: &str) -> MResult<i64> {
    let sql = format!("SELECT COUNT(*) FROM {}.{}", schema.unwrap_or("main"), quote_ident(table));
    connection
        .query_row(&sql, [], |row| row.get(0))
        .map_err(|error| Fail::new("EG_MIGRATION_DB", "verify", format!("không đếm được bảng {table}: {error}")))
}

fn read_counts(connection: &Connection, schema: Option<&str>) -> MResult<Counts> {
    Ok(Counts {
        games: count_table(connection, schema, "games")?,
        sessions: count_table(connection, schema, "sessions")?,
        lesson_documents: count_table(connection, schema, "lesson_documents")?,
        lesson_analyses: count_table(connection, schema, "lesson_analyses")?,
        lesson_chunks: count_table(connection, schema, "lesson_chunks")?,
        game_recommendations: count_table(connection, schema, "game_recommendations")?,
        game_projects: count_table(connection, schema, "game_projects")?,
        lesson_chats: count_table(connection, schema, "lesson_chats")?,
        lesson_chat_messages: count_table(connection, schema, "lesson_chat_messages")?,
        ai_generation_cache: count_table(connection, schema, "ai_generation_cache")?,
        ai_tasks: count_table(connection, schema, "ai_tasks")?,
    })
}

struct Probe {
    counts: Counts,
    user_version: i64,
    tables: Vec<String>,
}

/// Tạo snapshot nhất quán từ bản sao DB trong `raw_dir`. Snapshot là thứ được
/// đọc tiếp: `ATTACH` + `INSERT … SELECT`, đếm dòng, đối chiếu id. Không bao giờ
/// `ATTACH` thẳng profile nguồn.
fn build_snapshot(raw_dir: &Path, snapshot: &Path) -> MResult<Probe> {
    let raw_db = raw_dir.join(storage::DB_FILE);
    if !raw_db.is_file() {
        return Err(Fail::new("EG_MIGRATION_SOURCE", "backup", "Bản sao profile thiếu edugame.sqlite."));
    }
    let connection = Connection::open(&raw_db)
        .map_err(|error| Fail::new("EG_MIGRATION_DB", "backup", format!("không mở được bản sao cơ sở dữ liệu: {error}")))?;
    connection
        .busy_timeout(Duration::from_secs(5))
        .map_err(|error| Fail::new("EG_MIGRATION_DB", "backup", format!("không đặt được thời gian chờ: {error}")))?;
    let integrity = quick_check(&connection, "backup")?;
    if integrity != "ok" {
        return Err(Fail::new(
            "EG_MIGRATION_CORRUPT",
            "backup",
            format!("Cơ sở dữ liệu cũ không qua được quick_check: {integrity}"),
        ));
    }
    // Gộp WAL vào tệp chính TRƯỚC khi VACUUM INTO. Nếu checkpoint bận, dữ liệu
    // vẫn còn trong WAL nhưng snapshot dưới đây sẽ là bản cũ — từ chối thay vì
    // âm thầm bỏ mất những lần lưu cuối.
    let checkpoint: (i64, i64, i64) = connection
        .query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
        .map_err(|error| Fail::new("EG_MIGRATION_DB", "backup", format!("không gộp được WAL: {error}")))?;
    if checkpoint.0 != 0 {
        return Err(Fail::new(
            "EG_MIGRATION_SOURCE_BUSY",
            "backup",
            "WAL của profile cũ đang bị giữ. Hãy đóng bản Electron rồi thử lại.",
        ));
    }
    if snapshot.exists() {
        fs::remove_file(snapshot)
            .map_err(|error| Fail::new("EG_MIGRATION_IO", "backup", format!("không xoá được snapshot cũ: {error}")))?;
    }
    connection
        .execute("VACUUM INTO ?1", [snapshot.to_string_lossy().as_ref()])
        .map_err(|error| Fail::new("EG_MIGRATION_DB", "backup", format!("không tạo được snapshot: {error}")))?;
    drop(connection);

    let snapshot_connection = Connection::open(snapshot)
        .map_err(|error| Fail::new("EG_MIGRATION_DB", "backup", format!("không mở được snapshot: {error}")))?;
    snapshot_connection
        .pragma_update(None, "query_only", "ON")
        .map_err(|error| Fail::new("EG_MIGRATION_DB", "backup", format!("không khoá được snapshot: {error}")))?;
    let integrity = quick_check(&snapshot_connection, "backup")?;
    if integrity != "ok" {
        return Err(Fail::new(
            "EG_MIGRATION_CORRUPT",
            "backup",
            format!("Snapshot không qua được quick_check: {integrity}"),
        ));
    }
    let tables = table_names(&snapshot_connection, None)?;
    let missing: Vec<&str> = COPY_ORDER
        .iter()
        .copied()
        .filter(|table| !tables.iter().any(|name| name == table))
        .collect();
    if !missing.is_empty() {
        return Err(Fail::new(
            "EG_MIGRATION_SCHEMA",
            "detect",
            format!("Profile cũ thiếu bảng của bản 0.5.1: {}.", missing.join(", ")),
        ));
    }
    let foreign = foreign_key_issues(&snapshot_connection, None)?;
    if foreign > 0 {
        return Err(Fail::new(
            "EG_MIGRATION_CORRUPT",
            "detect",
            format!("Profile cũ có {foreign} dòng vi phạm khoá ngoại; không nhập để tránh dữ liệu mồ côi."),
        ));
    }
    let user_version: i64 = snapshot_connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(|error| Fail::new("EG_MIGRATION_DB", "detect", format!("không đọc được user_version: {error}")))?;
    let counts = read_counts(&snapshot_connection, None)?;
    Ok(Probe { counts, user_version, tables })
}

fn source_report(data: &Path, probe: &Probe) -> MResult<SourceReport> {
    let db = data.join(storage::DB_FILE);
    let metadata = fs::metadata(&db)
        .map_err(|error| Fail::new("EG_MIGRATION_IO", "detect", format!("không đọc được {}: {error}", db.display())))?;
    let modified_at_ms = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0);
    let images = dir_summary(&data.join("images"), "detect")?;
    let lessons = dir_summary(&data.join("lessons"), "detect")?;
    let ai_local = dir_summary(&data.join("ai-local"), "detect").unwrap_or_default();
    Ok(SourceReport {
        path: data.display().to_string(),
        profile_path: data.parent().map(|parent| parent.display().to_string()).unwrap_or_default(),
        db_file: db.display().to_string(),
        db_bytes: metadata.len(),
        modified_at_ms,
        user_version: probe.user_version,
        tables: probe.tables.clone(),
        counts: probe.counts.clone(),
        images,
        lessons,
        settings_present: data.join(paths::SETTINGS_FILE).is_file(),
        ai_local_present: data.join("ai-local").exists(),
        ai_local_bytes: ai_local.bytes,
    })
}

fn probe_source(source: &Path, work: &Path) -> MResult<(SourceReport, PathBuf)> {
    let raw = work.join("raw");
    copy_db_set(source, &raw)?;
    let snapshot = work.join("snapshot.sqlite");
    let probe = build_snapshot(&raw, &snapshot)?;
    let report = source_report(source, &probe)?;
    Ok((report, snapshot))
}

fn detect_core(
    target: &Path,
    appdata: &Path,
    explicit: Option<PathBuf>,
    environment: Option<PathBuf>,
) -> DetectReport {
    let status = read_status(target);
    let (source, searched, resolve_issue) = resolve_source(explicit, environment, appdata);
    let target_db_exists = target.join(storage::DB_FILE).is_file();
    // "Đã nhập" chỉ có nghĩa khi dữ liệu đích còn đó. Nếu giáo viên xoá tay thư
    // mục dữ liệu Tauri, lần chạy sau vẫn phải được mời nhập lại.
    let already_migrated = completed_at(&status).is_some() && target_db_exists;
    let source_path = source.as_ref().map(|path| path.display().to_string());
    let status_value = if status.is_null() { None } else { Some(status) };

    if let Some(issue) = resolve_issue {
        return DetectReport {
            found: false,
            already_migrated,
            source_path,
            source: None,
            error: Some(issue.issue()),
            searched,
            status: status_value,
        };
    }
    let Some(source) = source else {
        return DetectReport {
            found: false,
            already_migrated,
            source_path: None,
            source: None,
            error: None,
            searched,
            status: status_value,
        };
    };
    if already_migrated {
        // Không chép 2 MB mỗi lần mở app chỉ để hiện một hộp thoại không bao giờ
        // hiện. Trạng thái hoàn tất đã đủ; lần nhập lại do giáo viên chủ động.
        return DetectReport {
            found: true,
            already_migrated,
            source_path,
            source: None,
            error: None,
            searched,
            status: status_value,
        };
    }
    let work = match WorkDir::new(target, "detect") {
        Ok(work) => work,
        Err(error) => {
            return DetectReport {
                found: true,
                already_migrated,
                source_path,
                source: None,
                error: Some(error.issue()),
                searched,
                status: status_value,
            }
        }
    };
    match probe_source(&source, &work.0) {
        Ok((report, _snapshot)) => DetectReport {
            found: true,
            already_migrated,
            source_path,
            source: Some(report),
            error: None,
            searched,
            status: status_value,
        },
        Err(error) => DetectReport {
            found: true,
            already_migrated,
            source_path,
            source: None,
            error: Some(error.issue()),
            searched,
            status: status_value,
        },
    }
}

struct Backup {
    dir: PathBuf,
    snapshot: PathBuf,
    report: SourceReport,
    images: Vec<ManifestEntry>,
    lessons: Vec<ManifestEntry>,
    source_manifest: Vec<ManifestEntry>,
    settings: Option<Value>,
    settings_status: String,
    keys_removed: u64,
    warnings: Vec<String>,
}

/// Xoá mọi khoá bí mật ở mọi độ sâu. Trả về số khoá đã xoá (để báo cho giáo
/// viên biết họ cần nhập lại bao nhiêu). Không bao giờ ghi giá trị bí mật ra
/// status/manifest/log.
fn strip_secrets(value: &mut Value) -> u64 {
    match value {
        Value::Object(map) => {
            let mut removed = 0;
            let keys: Vec<String> = map.keys().cloned().collect();
            for key in keys {
                if SECRET_KEYS.contains(&key.as_str()) {
                    if let Some(old) = map.remove(&key) {
                        let empty = old.is_null() || old.as_str().is_some_and(str::is_empty);
                        if !empty {
                            removed += 1;
                        }
                    }
                } else if let Some(child) = map.get_mut(&key) {
                    removed += strip_secrets(child);
                }
            }
            // Hai trường HIỂN THỊ của trang Cài đặt. Giữ lại nhưng luôn nói "chưa
            // có khoá", nếu không giao diện sẽ tưởng provider đã sẵn sàng.
            if map.contains_key("hasKey") {
                map.insert("hasKey".to_string(), Value::Bool(false));
            }
            if map.contains_key("keyMasked") {
                map.insert("keyMasked".to_string(), Value::String(String::new()));
            }
            removed
        }
        Value::Array(items) => items.iter_mut().map(strip_secrets).sum(),
        _ => 0,
    }
}

/// Dựng bản sao lưu hoàn chỉnh trong `migration-work/`, kiểm tra từng tệp, rồi
/// đổi tên nguyên thư mục vào `backups/`. Chỉ khi hàm này trả về `Ok` thì bước
/// ghi vào dữ liệu Tauri mới được phép bắt đầu.
fn create_backup(source: &Path, target: &Path) -> MResult<Backup> {
    let work = WorkDir::new(target, "backup")?;
    let raw = work.0.join("db");
    let copied = copy_db_set(source, &raw)?;
    // `build_snapshot` checkpoint WAL và để SQLite dọn `-wal`/`-shm`. Nếu mở
    // thẳng `raw/` thì bản backup sẽ mất hai tệp vừa được ghi vào manifest —
    // đúng lỗi gặp trên profile 0.5.1 thật có WAL rỗng. Vì vậy snapshot đọc từ
    // một bản sao thứ hai; `raw/` vẫn là byte-copy nguyên trạng để phục hồi.
    let snapshot_raw = work.0.join("snapshot-db");
    copy_db_set(&raw, &snapshot_raw)?;
    // Tên snapshot trong bản sao lưu là `edugame.sqlite` (chép đè là phục hồi
    // được), khác `db/edugame.sqlite` là bản byte-copy nguyên trạng.
    let snapshot = work.0.join(storage::DB_FILE);
    let probe = build_snapshot(&snapshot_raw, &snapshot)?;
    fs::remove_dir_all(&snapshot_raw)
        .map_err(|error| Fail::new("EG_MIGRATION_IO", "backup", format!("không dọn được bản sao tạm: {error}")))?;
    let report = source_report(source, &probe)?;

    let mut manifest = Vec::new();
    let mut source_manifest = Vec::new();
    for (name, hash) in &copied {
        manifest.push(ManifestEntry {
            path: format!("db/{name}"),
            bytes: hash.bytes,
            sha256: hash.sha256.clone(),
        });
        source_manifest.push(ManifestEntry {
            path: name.clone(),
            bytes: hash.bytes,
            sha256: hash.sha256.clone(),
        });
    }
    let snapshot_hash = sha256_file(&snapshot, "backup")?;
    manifest.push(ManifestEntry {
        path: "edugame.sqlite".to_string(),
        bytes: snapshot_hash.bytes,
        sha256: snapshot_hash.sha256.clone(),
    });

    let mut images = Vec::new();
    let mut lessons = Vec::new();
    for folder in ["images", "lessons"] {
        let files = walk_files(&source.join(folder), "backup")?;
        for file in files {
            let relative = file
                .strip_prefix(source)
                .map_err(|_| Fail::new("EG_MIGRATION_IO", "backup", "tệp nằm ngoài profile nguồn."))?;
            let relative = rel_text(relative);
            let hash = copy_verified(&file, &work.0.join(&relative), "backup")?;
            let entry = ManifestEntry { path: relative, bytes: hash.bytes, sha256: hash.sha256 };
            manifest.push(entry.clone());
            source_manifest.push(entry.clone());
            if folder == "images" {
                images.push(entry);
            } else {
                lessons.push(entry);
            }
        }
    }

    let mut settings = None;
    let mut settings_status = "missing".to_string();
    let mut keys_removed = 0;
    let mut warnings = Vec::new();
    let settings_path = source.join(paths::SETTINGS_FILE);
    if settings_path.is_file() {
        match fs::read_to_string(&settings_path) {
            Ok(text) => {
                source_manifest.push(ManifestEntry {
                    path: paths::SETTINGS_FILE.to_string(),
                    bytes: text.len() as u64,
                    sha256: sha256_bytes(text.as_bytes()),
                });
                match serde_json::from_str::<Value>(&text) {
                    Ok(mut value) => {
                        keys_removed = strip_secrets(&mut value);
                        let sanitized = work.0.join(paths::SETTINGS_FILE);
                        write_json(&sanitized, &value)?;
                        let hash = sha256_file(&sanitized, "backup")?;
                        manifest.push(ManifestEntry {
                            path: paths::SETTINGS_FILE.to_string(),
                            bytes: hash.bytes,
                            sha256: hash.sha256,
                        });
                        settings = Some(value);
                        settings_status = "imported".to_string();
                    }
                    Err(error) => {
                        settings_status = "corrupt-skipped".to_string();
                        warnings.push(format!(
                            "settings.json của bản cũ không đọc được ({error}); cài đặt AI sẽ phải nhập lại."
                        ));
                    }
                }
            }
            Err(error) => {
                settings_status = "corrupt-skipped".to_string();
                warnings.push(format!(
                    "Không đọc được settings.json của bản cũ ({error}); cài đặt AI sẽ phải nhập lại."
                ));
            }
        }
    }

    let manifest_value = json!({
        "format": 1,
        "createdAt": now_ms(),
        "sourcePath": source.display().to_string(),
        "note": "Bản sao lưu profile Electron trước khi nhập vào vỏ Tauri. Không có khoá API nào trong tệp này; settings.json đã được tước khoá.",
        "excluded": ["ai-local/", "logs/"],
        "settings": { "sanitized": true, "status": settings_status, "keysRemoved": keys_removed },
        "counts": report.counts,
        "source": source_manifest,
        "files": manifest,
    });
    write_json(&work.0.join("manifest.json"), &manifest_value)?;

    let backups = target.join(BACKUP_DIR);
    fs::create_dir_all(&backups)
        .map_err(|error| Fail::new("EG_MIGRATION_IO", "backup", format!("không tạo được {}: {error}", backups.display())))?;
    let final_dir = backups.join(format!("electron-{}", unique_stamp()));
    // `work` là guard: sau khi đổi tên, Drop chỉ cố xoá đường dẫn cũ (không còn).
    fs::rename(&work.0, &final_dir)
        .map_err(|error| Fail::new("EG_MIGRATION_IO", "backup", format!("không chốt được bản sao lưu: {error}")))?;

    Ok(Backup {
        snapshot: final_dir.join("edugame.sqlite"),
        dir: final_dir,
        report,
        images,
        lessons,
        source_manifest,
        settings,
        settings_status,
        keys_removed,
        warnings,
    })
}

#[derive(Clone)]
struct Column {
    name: String,
    pk: i64,
}

fn table_columns(connection: &Connection, schema: Option<&str>, table: &str) -> MResult<Vec<Column>> {
    let sql = match schema {
        Some(name) => format!("PRAGMA {name}.table_info({})", quote_ident(table)),
        None => format!("PRAGMA table_info({})", quote_ident(table)),
    };
    let mut statement = connection
        .prepare(&sql)
        .map_err(|error| Fail::new("EG_MIGRATION_DB", "database", format!("không đọc được cột của {table}: {error}")))?;
    let columns = statement
        .query_map([], |row| {
            Ok(Column {
                name: row.get(1)?,
                pk: row.get(5)?,
            })
        })
        .map_err(|error| Fail::new("EG_MIGRATION_DB", "database", format!("không đọc được cột của {table}: {error}")))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| Fail::new("EG_MIGRATION_DB", "database", format!("không đọc được cột của {table}: {error}")))?;
    Ok(columns)
}

fn attach(connection: &Connection, path: &Path, name: &str) -> MResult<()> {
    // SQLite TẠO MỚI một tệp rỗng khi ATTACH vào đường dẫn không tồn tại. Kiểm
    // trước để một snapshot thiếu không biến thành "nhập 0 dòng thành công".
    if !path.is_file() {
        return Err(Fail::new(
            "EG_MIGRATION_BACKUP",
            "database",
            format!("Bản sao lưu thiếu tệp cơ sở dữ liệu: {}", path.display()),
        ));
    }
    connection
        .execute(&format!("ATTACH DATABASE ?1 AS {name}"), [path.to_string_lossy().as_ref()])
        .map_err(|error| Fail::new("EG_MIGRATION_DB", "database", format!("không gắn được snapshot: {error}")))?;
    Ok(())
}

fn detach(connection: &Connection, name: &str) {
    let _ = connection.execute_batch(&format!("DETACH DATABASE {name}"));
}

/// `ATTACH` snapshot rồi `INSERT OR IGNORE … SELECT` cho từng bảng trong MỘT
/// transaction. Không đụng tới profile nguồn: mọi thứ đọc từ snapshot trong
/// bản sao lưu.
fn merge_database(snapshot: &Path, target_db: &Path) -> MResult<Vec<TableCopy>> {
    let connection = storage::open(target_db)
        .map_err(|error| Fail::new(error.code(), "database", error.to_string()))?;
    storage::ensure_schema(&connection).map_err(|error| Fail::new(error.code(), "database", error.to_string()))?;
    if foreign_key_issues(&connection, None)? > 0 {
        return Err(Fail::new(
            "EG_MIGRATION_TARGET_CORRUPT",
            "database",
            "Dữ liệu Tauri hiện có vi phạm khoá ngoại; dừng trước khi nhập thêm.",
        ));
    }
    attach(&connection, snapshot, "src")?;
    let before_tables = table_names(&connection, Some("src"))?;
    let missing: Vec<&str> = COPY_ORDER
        .iter()
        .copied()
        .filter(|table| !before_tables.iter().any(|name| name == table))
        .collect();
    if !missing.is_empty() {
        detach(&connection, "src");
        return Err(Fail::new(
            "EG_MIGRATION_SCHEMA",
            "database",
            format!("Snapshot thiếu bảng: {}.", missing.join(", ")),
        ));
    }

    connection
        .execute_batch("BEGIN IMMEDIATE")
        .map_err(|error| Fail::new("EG_MIGRATION_DB", "database", format!("không bắt đầu được transaction: {error}")))?;
    connection
        .execute_batch("PRAGMA defer_foreign_keys = ON")
        .map_err(|error| Fail::new("EG_MIGRATION_DB", "database", format!("không hoãn được kiểm tra khoá ngoại: {error}")))?;

    let outcome = (|| -> MResult<Vec<TableCopy>> {
        let mut tables = Vec::new();
        for table in COPY_ORDER {
            let source_columns = table_columns(&connection, Some("src"), table)?;
            let target_columns = table_columns(&connection, Some("main"), table)?;
            if source_columns.is_empty() {
                return Err(Fail::new(
                    "EG_MIGRATION_SCHEMA",
                    "database",
                    format!("Bảng {table} không có cột nào trong snapshot."),
                ));
            }
            let target_names: HashSet<&str> = target_columns.iter().map(|column| column.name.as_str()).collect();
            let unknown: Vec<&str> = source_columns
                .iter()
                .map(|column| column.name.as_str())
                .filter(|name| !target_names.contains(name))
                .collect();
            if !unknown.is_empty() {
                return Err(Fail::new(
                    "EG_MIGRATION_SCHEMA",
                    "database",
                    format!("Bảng {table} của bản cũ có cột mà bản mới chưa biết: {}.", unknown.join(", ")),
                ));
            }
            // Cột đích không có trong nguồn (nếu có) nhận DEFAULT/NULL. Schema
            // 0.5.1 chỉ thêm cột nullable, nên không có dữ liệu NOT NULL bị mất.
            let columns = source_columns.iter().map(|column| quote_ident(&column.name)).collect::<Vec<_>>();
            let list = columns.join(", ");
            let source_count = count_table(&connection, Some("src"), table)?;
            let sql = format!(
                "INSERT OR IGNORE INTO main.{table} ({list}) SELECT {list} FROM src.{table}",
                table = quote_ident(table)
            );
            connection
                .execute(&sql, [])
                .map_err(|error| Fail::new("EG_MIGRATION_SQL", "database", format!("không nhập được bảng {table}: {error}")))?;
            let inserted = connection.changes() as i64;
            tables.push(TableCopy {
                table: table.to_string(),
                source: source_count,
                inserted,
                existing: source_count.saturating_sub(inserted),
            });
        }
        Ok(tables)
    })();

    let result = match outcome {
        Ok(tables) => {
            connection
                .execute_batch("COMMIT")
                .map_err(|error| Fail::new("EG_MIGRATION_DB", "database", format!("không chốt được transaction: {error}")))?;
            Ok(tables)
        }
        Err(error) => {
            let _ = connection.execute_batch("ROLLBACK");
            Err(error)
        }
    };
    detach(&connection, "src");
    if result.is_ok() && foreign_key_issues(&connection, None)? > 0 {
        return Err(Fail::new(
            "EG_MIGRATION_FK",
            "database",
            "Sau khi nhập, dữ liệu Tauri có dòng vi phạm khoá ngoại.",
        ));
    }
    result
}

/// Đối chiếu mọi id nguồn có mặt ở đích. Đếm số dòng là chưa đủ: `INSERT OR
/// IGNORE` có thể bỏ một dòng vì trùng một ràng buộc khác, và khi đó bảng đích
/// vẫn "đủ số" nhưng thiếu đúng dòng giáo viên cần.
fn verify_rows(snapshot: &Path, target_db: &Path) -> MResult<()> {
    let connection = storage::open(target_db)
        .map_err(|error| Fail::new(error.code(), "verify", error.to_string()))?;
    attach(&connection, snapshot, "verify")?;
    let result = (|| -> MResult<()> {
        for table in COPY_ORDER {
            let columns = table_columns(&connection, Some("verify"), table)?;
            let primary: Vec<&Column> = columns.iter().filter(|column| column.pk > 0).collect();
            if primary.is_empty() {
                return Err(Fail::new(
                    "EG_MIGRATION_SCHEMA",
                    "verify",
                    format!("Bảng {table} không có khoá chính để đối chiếu."),
                ));
            }
            let name = quote_ident(table);
            let condition = primary
                .iter()
                .map(|column| {
                    let column = quote_ident(&column.name);
                    format!("main.{name}.{column} = verify.{name}.{column}")
                })
                .collect::<Vec<_>>()
                .join(" AND ");
            let sql = format!(
                "SELECT COUNT(*) FROM verify.{name} WHERE NOT EXISTS (SELECT 1 FROM main.{name} WHERE {condition})"
            );
            let missing: i64 = connection
                .query_row(&sql, [], |row| row.get(0))
                .map_err(|error| Fail::new("EG_MIGRATION_VERIFY", "verify", format!("không đối chiếu được bảng {table}: {error}")))?;
            if missing > 0 {
                return Err(Fail::new(
                    "EG_MIGRATION_ROWS_MISSING",
                    "verify",
                    format!("Thiếu {missing} dòng của bảng {table} sau khi nhập."),
                ));
            }
        }
        Ok(())
    })();
    detach(&connection, "verify");
    result
}

/// Mỗi dòng `lesson_documents` phải có tệp trong `lessons/`, và nếu dòng có
/// `sha256` thì tệp phải khớp. Đây là phần "checksum tệp" của cổng hoàn tất.
fn verify_lesson_files(target: &Path) -> MResult<()> {
    let connection = storage::open(&target.join(storage::DB_FILE))
        .map_err(|error| Fail::new(error.code(), "verify", error.to_string()))?;
    let mut statement = connection
        .prepare("SELECT id, text_rel_path, sha256 FROM lesson_documents")
        .map_err(|error| Fail::new("EG_MIGRATION_VERIFY", "verify", format!("không đọc được tài liệu: {error}")))?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
            ))
        })
        .map_err(|error| Fail::new("EG_MIGRATION_VERIFY", "verify", format!("không đọc được tài liệu: {error}")))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| Fail::new("EG_MIGRATION_VERIFY", "verify", format!("không đọc được tài liệu: {error}")))?;
    for (id, relative, expected) in rows {
        if !(relative.starts_with("lessons/") || relative.starts_with("lessons\\")) {
            return Err(Fail::new(
                "EG_MIGRATION_VERIFY",
                "verify",
                format!("Tài liệu {id} trỏ ra ngoài thư mục lessons/: {relative}"),
            ));
        }
        let Some(path) = safe_join(target, &relative) else {
            return Err(Fail::new(
                "EG_MIGRATION_VERIFY",
                "verify",
                format!("Tài liệu {id} có đường dẫn không hợp lệ: {relative}"),
            ));
        };
        if !path.is_file() {
            return Err(Fail::new(
                "EG_MIGRATION_VERIFY",
                "verify",
                format!("Thiếu tệp của tài liệu {id}: {relative}"),
            ));
        }
        if let Some(expected) = expected {
            let actual = sha256_file(&path, "verify")?;
            if actual.sha256 != expected {
                return Err(Fail::new(
                    "EG_MIGRATION_VERIFY",
                    "verify",
                    format!("Tệp của tài liệu {id} không khớp SHA-256 trong cơ sở dữ liệu."),
                ));
            }
        }
    }
    Ok(())
}

fn copy_entries(entries: &[ManifestEntry], backup: &Path, target: &Path) -> MResult<CopyReport> {
    let mut report = CopyReport::default();
    for entry in entries {
        report.total += 1;
        let source = safe_join(backup, &entry.path)
            .ok_or_else(|| Fail::new("EG_MIGRATION_IO", "files", format!("đường dẫn lạ trong manifest: {}", entry.path)))?;
        let destination = safe_join(target, &entry.path)
            .ok_or_else(|| Fail::new("EG_MIGRATION_IO", "files", format!("đường dẫn lạ trong manifest: {}", entry.path)))?;
        // Bản sao lưu phải khớp manifest TRƯỚC khi được dùng làm nguồn lần hai.
        let backup_hash = sha256_file(&source, "files")?;
        if backup_hash.bytes != entry.bytes || backup_hash.sha256 != entry.sha256 {
            return Err(Fail::new(
                "EG_MIGRATION_BACKUP",
                "files",
                format!("Bản sao lưu của {} đã bị thay đổi sau khi tạo.", entry.path),
            ));
        }
        if destination.exists() {
            if destination.is_file() {
                let existing = sha256_file(&destination, "files")?;
                if existing.sha256 == entry.sha256 {
                    report.existing += 1;
                } else {
                    // Bản mới thắng: giáo viên có thể đã sửa đúng tệp này trong
                    // Tauri. Ghi nhận để báo cáo, không ghi đè.
                    report.conflicts.push(entry.path.clone());
                }
            } else {
                report.conflicts.push(entry.path.clone());
            }
            continue;
        }
        let copied = copy_verified(&source, &destination, "files")?;
        if copied.sha256 != entry.sha256 {
            return Err(Fail::new(
                "EG_MIGRATION_CHECKSUM",
                "files",
                format!("Tệp {} không khớp SHA-256 sau khi chép sang dữ liệu mới.", entry.path),
            ));
        }
        report.copied += 1;
        report.bytes += copied.bytes;
    }
    Ok(report)
}

fn import_settings(backup: &Backup, target: &Path) -> MResult<SettingsReport> {
    let destination = target.join(paths::SETTINGS_FILE);
    if destination.exists() {
        if destination.is_file() {
            return Ok(SettingsReport {
                status: "skipped-existing".to_string(),
                keys_removed: 0,
            });
        }
        return Err(Fail::new(
            "EG_MIGRATION_SETTINGS",
            "settings",
            format!("{} đang là thư mục nên không ghi được tệp cài đặt.", destination.display()),
        ));
    }
    if let Some(value) = &backup.settings {
        write_json(&destination, value)?;
        return Ok(SettingsReport {
            status: "imported".to_string(),
            keys_removed: backup.keys_removed,
        });
    }
    Ok(SettingsReport {
        status: backup.settings_status.clone(),
        keys_removed: 0,
    })
}

/// So lại từng tệp nguồn với checksum đã ghi lúc tạo backup. Bình thường danh
/// sách rỗng; nếu Electron vẫn đang chạy và ghi tiếp, đây là cảnh báo để giáo
/// viên biết bản sao lưu (không phải dữ liệu đích) là bản đầy đủ.
fn verify_source_unchanged(backup: &Backup, source: &Path) -> Vec<String> {
    let mut changed = Vec::new();
    for entry in &backup.source_manifest {
        let Some(path) = safe_join(source, &entry.path) else {
            changed.push(entry.path.clone());
            continue;
        };
        match sha256_file(&path, "verify") {
            Ok(hash) if hash.bytes == entry.bytes && hash.sha256 == entry.sha256 => {}
            _ => changed.push(entry.path.clone()),
        }
    }
    changed
}

fn status_path(target: &Path) -> PathBuf {
    target.join(STATUS_FILE)
}

fn read_status(target: &Path) -> Value {
    fs::read_to_string(status_path(target))
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or(Value::Null)
}

fn completed_at(status: &Value) -> Option<u64> {
    status.get("completedAt").and_then(Value::as_u64)
}

fn status_object(target: &Path) -> Map<String, Value> {
    match read_status(target) {
        Value::Object(map) => map,
        _ => Map::new(),
    }
}

fn write_status(target: &Path, value: &Value) -> MResult<()> {
    write_json(&status_path(target), value)
}

fn record_attempt(
    target: &Path,
    source: Option<&Path>,
    backup: Option<&Path>,
    status: &str,
    error: Option<&Fail>,
    extra: Value,
) -> MResult<()> {
    let mut object = status_object(target);
    object.insert("format".to_string(), json!(1));
    object.insert(
        "lastAttempt".to_string(),
        json!({
            "at": now_ms(),
            "status": status,
            "source": source.map(|path| path.display().to_string()),
            "backupPath": backup.map(|path| path.display().to_string()),
            "error": error.map(Fail::issue),
        }),
    );
    if let Value::Object(extra) = extra {
        for (key, value) in extra {
            object.insert(key, value);
        }
    }
    write_status(target, &Value::Object(object))
}

fn record_success(target: &Path, extra: Value) -> MResult<()> {
    let mut object = status_object(target);
    object.insert("format".to_string(), json!(1));
    if !object.contains_key("completedAt") {
        object.insert("completedAt".to_string(), json!(now_ms()));
    }
    object.insert(
        "lastAttempt".to_string(),
        json!({ "at": now_ms(), "status": "completed" }),
    );
    if let Value::Object(extra) = extra {
        for (key, value) in extra {
            object.insert(key, value);
        }
    }
    write_status(target, &Value::Object(object))
}

fn import_core(
    target: &Path,
    appdata: &Path,
    explicit: Option<PathBuf>,
    environment: Option<PathBuf>,
) -> ImportReport {
    let started_at = now_ms();
    let mut report = ImportReport {
        ok: false,
        status: "failed".to_string(),
        already_migrated: false,
        source_path: None,
        source: None,
        backup_path: None,
        started_at,
        finished_at: started_at,
        tables: Vec::new(),
        files: FilesReport::default(),
        settings: SettingsReport::default(),
        ai_local: AiLocalReport::default(),
        warnings: Vec::new(),
        error: None,
    };
    let _guard = match IMPORT_LOCK.try_lock() {
        Ok(guard) => guard,
        Err(_) => {
            report.error = Some(
                Fail::new("EG_MIGRATION_BUSY", "import", "Một lần nhập dữ liệu khác đang chạy.").issue(),
            );
            report.finished_at = now_ms();
            return report;
        }
    };

    let status_before = read_status(target);
    report.already_migrated = completed_at(&status_before).is_some();
    let (source, searched, resolve_issue) = resolve_source(explicit, environment, appdata);
    if let Some(issue) = resolve_issue {
        report.error = Some(issue.issue());
        let _ = record_attempt(target, None, None, "failed", Some(&issue), json!({}));
        report.finished_at = now_ms();
        return report;
    }
    let Some(source) = source else {
        let issue = Fail::new(
            "EG_MIGRATION_NO_SOURCE",
            "detect",
            format!(
                "Không tìm thấy dữ liệu EduGame Studio cũ. Đã tìm: {}.",
                searched.join(", ")
            ),
        );
        report.error = Some(issue.issue());
        let _ = record_attempt(target, None, None, "failed", Some(&issue), json!({}));
        report.finished_at = now_ms();
        return report;
    };
    report.source_path = Some(source.display().to_string());

    let backup = match create_backup(&source, target) {
        Ok(backup) => backup,
        Err(error) => {
            report.error = Some(error.issue());
            let _ = record_attempt(target, Some(&source), None, "failed", Some(&error), json!({}));
            report.finished_at = now_ms();
            return report;
        }
    };
    report.source = Some(backup.report.clone());
    report.backup_path = Some(backup.dir.display().to_string());
    report.ai_local = AiLocalReport {
        present: backup.report.ai_local_present,
        bytes: backup.report.ai_local_bytes,
        copied: false,
    };
    report.warnings.extend(backup.warnings.clone());

    let outcome = (|| -> MResult<(Vec<TableCopy>, FilesReport, SettingsReport)> {
        let tables = merge_database(&backup.snapshot, &target.join(storage::DB_FILE))?;
        let images = copy_entries(&backup.images, &backup.dir, target)?;
        let lessons = copy_entries(&backup.lessons, &backup.dir, target)?;
        let settings = import_settings(&backup, target)?;
        verify_rows(&backup.snapshot, &target.join(storage::DB_FILE))?;
        verify_lesson_files(target)?;
        Ok((tables, FilesReport { images, lessons }, settings))
    })();

    match outcome {
        Ok((tables, files, settings)) => {
            report.tables = tables;
            report.files = files;
            report.settings = settings;
            let changed = verify_source_unchanged(&backup, &source);
            if !changed.is_empty() {
                report.warnings.push(format!(
                    "Profile nguồn thay đổi trong lúc nhập ({} tệp). Bản sao lưu vẫn là bản đầy đủ; đừng chạy bản Electron trong lúc nhập.",
                    changed.len()
                ));
            }
            report.ok = true;
            report.status = "completed".to_string();
            let extra = json!({
                "source": source.display().to_string(),
                "backupPath": backup.dir.display().to_string(),
                "counts": backup.report.counts,
                "tables": report.tables,
                "files": report.files,
                "settings": report.settings,
                "aiLocal": report.ai_local,
                "warnings": report.warnings,
            });
            if let Err(error) = record_success(target, extra) {
                report.warnings.push(format!(
                    "Đã nhập xong nhưng không ghi được {}: {}. Lần mở sau có thể hỏi lại.",
                    STATUS_FILE, error.message
                ));
            }
        }
        Err(error) => {
            report.error = Some(error.issue());
            let extra = json!({
                "source": source.display().to_string(),
                "backupPath": backup.dir.display().to_string(),
                "counts": backup.report.counts,
                "aiLocal": report.ai_local,
                "warnings": report.warnings,
            });
            let _ = record_attempt(target, Some(&source), Some(&backup.dir), "failed", Some(&error), extra);
        }
    }
    report.finished_at = now_ms();
    report
}

fn appdata_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .data_dir()
        .map_err(|error| format!("EG_MIGRATION_PATH: không xác định được thư mục AppData: {error}"))
}

/// Phát hiện profile cũ và (khi chưa nhập) đọc thử số dòng/tệp để gợi ý.
pub async fn detect(app: &AppHandle) -> Result<Value, String> {
    let target = paths::data_dir(app)?;
    let appdata = appdata_dir(app)?;
    let explicit = chosen_source();
    let environment = environment_source();
    picker::io(move || {
        serde_json::to_value(detect_core(&target, &appdata, explicit, environment))
            .map_err(|error| format!("EG_MIGRATION_JSON: {error}"))
    })
    .await
}

/// Chọn thủ công profile cũ. Hộp thoại do Rust mở; đường dẫn không đi qua
/// renderer, nên renderer không thể dùng kênh này để đọc thư mục tuỳ ý.
pub async fn browse(app: &AppHandle) -> Result<Value, String> {
    let Some(path) = picker::choose_folder(app, "Chọn thư mục dữ liệu EduGame Studio cũ").await else {
        return Ok(json!({ "cancelled": true }));
    };
    {
        let mut chosen = CHOSEN_SOURCE
            .lock()
            .map_err(|_| "EG_MIGRATION_LOCK: không giữ được lựa chọn thư mục.".to_string())?;
        *chosen = Some(path);
    }
    let target = paths::data_dir(app)?;
    let appdata = appdata_dir(app)?;
    let explicit = chosen_source();
    let environment = environment_source();
    let mut value = picker::io(move || {
        serde_json::to_value(detect_core(&target, &appdata, explicit, environment))
            .map_err(|error| format!("EG_MIGRATION_JSON: {error}"))
    })
    .await?;
    if let Value::Object(ref mut map) = value {
        map.insert("cancelled".to_string(), Value::Bool(false));
    }
    Ok(value)
}

/// Nhập dữ liệu cũ. Kết quả luôn là một báo cáo có `ok`/`error`, kể cả khi lỗi:
/// giao diện cần hiện được đường dẫn bản sao lưu và phần đã hỏng.
pub async fn import(app: &AppHandle) -> Result<Value, String> {
    let target = paths::data_dir(app)?;
    let appdata = appdata_dir(app)?;
    let explicit = chosen_source();
    let environment = environment_source();
    let value = picker::io(move || {
        serde_json::to_value(import_core(&target, &appdata, explicit, environment))
            .map_err(|error| format!("EG_MIGRATION_JSON: {error}"))
    })
    .await?;
    if value.get("ok").and_then(Value::as_bool).unwrap_or(false) {
        if let Ok(mut chosen) = CHOSEN_SOURCE.lock() {
            *chosen = None;
        }
    }
    Ok(value)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;
    use tempfile::TempDir;

    fn write(path: &Path, text: &str) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(path, text).unwrap();
    }

    /// Profile 0.5.1 tổng hợp: mỗi bảng một ít dòng, hai tài liệu có tệp + sha256,
    /// hai ảnh, một tệp ai-local, và settings có đủ ba kiểu khoá bí mật.
    fn seed_source(root: &Path) -> (PathBuf, PathBuf) {
        let appdata = root.join("appdata");
        let data = appdata.join("edugame-studio").join("edugame-data");
        fs::create_dir_all(data.join("images")).unwrap();
        fs::create_dir_all(data.join("lessons")).unwrap();
        fs::create_dir_all(data.join("ai-local")).unwrap();

        let lesson_one = "Bài học một: phân số bằng nhau.";
        let lesson_two = "Bài học hai: rút gọn phân số.";
        write(&data.join("lessons/d1.txt"), lesson_one);
        write(&data.join("lessons/d2.txt"), lesson_two);
        let sha_one = sha256_bytes(lesson_one.as_bytes());
        let sha_two = sha256_bytes(lesson_two.as_bytes());

        let connection = storage::open(&data.join(storage::DB_FILE)).unwrap();
        storage::ensure_schema(&connection).unwrap();
        connection
            .execute(
                "INSERT INTO games (id,title,subject,grade,topic,template,created_at,updated_at,data_json)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
                rusqlite::params![
                    "g1", "Trò chơi một", "Toán", "4", "Phân số", "quiz",
                    "2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z", r#"{"rounds":[]}"#
                ],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO games (id,title,subject,grade,topic,template,created_at,updated_at,data_json)
                 VALUES ('g2','Trò chơi hai','Toán','4','Phân số','match','2026-01-03T00:00:00Z','2026-01-04T00:00:00Z','{}')",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO sessions (id,created_at,data_json) VALUES ('s1','2026-01-05T00:00:00Z','{\"score\":1}')",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO lesson_documents (id,name,ext,size_bytes,characters,text_rel_path,sha256,schema_version,created_at)
                 VALUES (?1,?2,'txt',?3,?4,?5,?6,1,'2026-01-06T00:00:00Z')",
                rusqlite::params!["d1", "Bài một", lesson_one.len() as i64, lesson_one.chars().count() as i64, "lessons/d1.txt", sha_one],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO lesson_documents (id,name,ext,size_bytes,characters,text_rel_path,sha256,schema_version,created_at)
                 VALUES (?1,?2,'txt',?3,?4,?5,?6,1,'2026-01-06T00:00:00Z')",
                rusqlite::params!["d2", "Bài hai", lesson_two.len() as i64, lesson_two.chars().count() as i64, "lessons/d2.txt", sha_two],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO lesson_analyses (id,document_id,data_json,schema_version,cache_key,created_at,updated_at)
                 VALUES ('a1','d1','{}',1,'cache-a1','2026-01-07T00:00:00Z','2026-01-07T00:00:00Z')",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO game_recommendations (id,analysis_id,data_json,schema_version,created_at)
                 VALUES ('r1','a1','{}',1,'2026-01-07T00:00:00Z')",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO game_projects (id,game_id,status,step,data_json,schema_version,created_at,updated_at)
                 VALUES ('p1','g1','draft','design','{}',1,'2026-01-08T00:00:00Z','2026-01-08T00:00:00Z')",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO lesson_chunks (document_id,chunk_index,text,heading,char_start,char_end,token_count)
                 VALUES ('d1',0,'phần một','Mở đầu',0,9,3), ('d1',1,'phần hai',NULL,9,18,3)",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO ai_generation_cache (cache_key,kind,game_type,analysis_id,model_id,prompt_version,payload_json,created_at)
                 VALUES ('k1','game','quiz','a1','gemini-x','v1','{}','2026-01-09T00:00:00Z')",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO ai_tasks (task_id,request_id,kind,project_id,document_id,label,state,progress,started_at)
                 VALUES ('t1','req1','generate','p1','d1','Sinh trò chơi','done','done','2026-01-09T00:00:00Z')",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO lesson_chats (id,title,document_ids,message_count,last_intent,schema_version,created_at,updated_at)
                 VALUES ('c1','Hỏi bài','[\"d1\"]',2,'ask',1,'2026-01-10T00:00:00Z','2026-01-10T00:00:00Z')",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO lesson_chat_messages (id,chat_id,position,role,text,intent,citations,provider_id,error_code,created_at)
                 VALUES ('m1','c1',0,'user','Hỏi','ask','[]','','','2026-01-10T00:00:00Z'),
                        ('m2','c1',1,'assistant','Đáp','ask','[]','openai','','2026-01-10T00:00:01Z')",
                [],
            )
            .unwrap();
        drop(connection);

        fs::write(data.join("images/ci-one.img"), b"image-one").unwrap();
        fs::write(data.join("images/ci-two.img"), b"image-two").unwrap();
        fs::write(data.join("ai-local/model.gguf"), b"model-bytes").unwrap();
        write(
            &data.join(paths::SETTINGS_FILE),
            r#"{
  "theme": "light",
  "ai": {
    "providers": {
      "openai": {
        "baseUrl": "https://example.test/v1",
        "model": "gpt-x",
        "hasKey": true,
        "keyMasked": "sk-…",
        "apiKeyEncrypted": "SK-SECRET-ONE"
      }
    },
    "apiKeyEncrypted": "SK-SECRET-TWO",
    "apiKey": "SK-SECRET-THREE"
  }
}"#,
        );
        (appdata, data)
    }

    fn seed_target(root: &Path) -> PathBuf {
        let target = root.join("tauri").join("edugame-data");
        fs::create_dir_all(&target).unwrap();
        let connection = storage::open(&target.join(storage::DB_FILE)).unwrap();
        storage::ensure_schema(&connection).unwrap();
        // Một trò chơi do bản Tauri tạo trước khi nhập: nhập phải giữ nó.
        connection
            .execute(
                "INSERT INTO games (id,title,created_at,updated_at,data_json)
                 VALUES ('target-only','Trò của bản mới','2026-02-01T00:00:00Z','2026-02-01T00:00:00Z','{}')",
                [],
            )
            .unwrap();
        drop(connection);
        target
    }

    fn hashes(root: &Path) -> BTreeMap<String, String> {
        let mut map = BTreeMap::new();
        for file in walk_files(root, "test").unwrap() {
            let relative = rel_text(file.strip_prefix(root).unwrap());
            map.insert(relative, sha256_file(&file, "test").unwrap().sha256);
        }
        map
    }

    fn target_counts(target: &Path) -> Counts {
        let connection = storage::open(&target.join(storage::DB_FILE)).unwrap();
        read_counts(&connection, None).unwrap()
    }

    fn read_json_file(path: &Path) -> Value {
        serde_json::from_str(&fs::read_to_string(path).unwrap()).unwrap()
    }

    fn contains_secret_key(value: &Value) -> bool {
        match value {
            Value::Object(map) => map.iter().any(|(key, child)| {
                SECRET_KEYS.contains(&key.as_str()) || contains_secret_key(child)
            }),
            Value::Array(items) => items.iter().any(contains_secret_key),
            _ => false,
        }
    }

    fn contains_text(value: &Value, needle: &str) -> bool {
        match value {
            Value::String(text) => text.contains(needle),
            Value::Object(map) => map.values().any(|child| contains_text(child, needle)),
            Value::Array(items) => items.iter().any(|child| contains_text(child, needle)),
            _ => false,
        }
    }

    fn any_file_contains(root: &Path, needle: &str) -> bool {
        let needle = needle.as_bytes();
        for file in walk_files(root, "test").unwrap() {
            let bytes = fs::read(&file).unwrap();
            if bytes.windows(needle.len()).any(|window| window == needle) {
                return true;
            }
        }
        false
    }

    fn verify_manifest(backup: &Path) {
        let manifest = read_json_file(&backup.join("manifest.json"));
        let files = manifest["files"].as_array().expect("manifest.files");
        assert!(!files.is_empty());
        for entry in files {
            let relative = entry["path"].as_str().unwrap();
            let path = safe_join(backup, relative).expect("đường dẫn manifest hợp lệ");
            let hash = sha256_file(&path, "test").unwrap();
            assert_eq!(hash.bytes, entry["bytes"].as_u64().unwrap(), "{relative}");
            assert_eq!(hash.sha256, entry["sha256"].as_str().unwrap(), "{relative}");
        }
    }

    #[test]
    fn detect_reads_the_source_without_touching_it() {
        let temp = TempDir::new().unwrap();
        let (appdata, data) = seed_source(temp.path());
        let target = temp.path().join("tauri").join("edugame-data");
        fs::create_dir_all(&target).unwrap();
        let before = hashes(&data);

        let report = detect_core(&target, &appdata, None, None);
        assert!(report.found);
        assert!(!report.already_migrated);
        assert!(report.error.is_none(), "{:?}", report.error);
        let source = report.source.expect("phải đọc được profile");
        assert_eq!(source.counts.games, 2);
        assert_eq!(source.counts.sessions, 1);
        assert_eq!(source.counts.lesson_documents, 2);
        assert_eq!(source.counts.lesson_analyses, 1);
        assert_eq!(source.counts.game_recommendations, 1);
        assert_eq!(source.counts.game_projects, 1);
        assert_eq!(source.counts.lesson_chunks, 2);
        assert_eq!(source.counts.lesson_chats, 1);
        assert_eq!(source.counts.lesson_chat_messages, 2);
        assert_eq!(source.counts.ai_generation_cache, 1);
        assert_eq!(source.counts.ai_tasks, 1);
        assert_eq!(source.images.files, 2);
        assert_eq!(source.lessons.files, 2);
        assert!(source.settings_present);
        assert!(source.ai_local_present);
        assert_eq!(source.user_version, 0);
        assert_eq!(before, hashes(&data));
        assert!(!target.join(STATUS_FILE).exists());
        assert!(!target.join(BACKUP_DIR).exists());
    }

    #[test]
    fn backup_keeps_raw_wal_and_shm_and_manifest_verifies() {
        let temp = TempDir::new().unwrap();
        let (_, data) = seed_source(temp.path());
        let target = seed_target(temp.path());
        // Giữ một kết nối WAL đang mở để nguồn có `-wal`/`-shm` thật, giống
        // profile Electron của giáo viên. `VACUUM INTO` trên chính `db/` sẽ làm
        // SQLite xoá hai tệp này; test chốt rằng chúng vẫn còn trong backup.
        let source_db = data.join(storage::DB_FILE);
        let connection = rusqlite::Connection::open(&source_db).unwrap();
        connection.pragma_update(None, "journal_mode", "WAL").unwrap();
        connection
            .execute_batch("CREATE TABLE gate_wal_marker (value TEXT NOT NULL); INSERT INTO gate_wal_marker VALUES ('x');")
            .unwrap();
        let wal = data.join(format!("{}-wal", storage::DB_FILE));
        let shm = data.join(format!("{}-shm", storage::DB_FILE));
        assert!(wal.is_file() && fs::metadata(&wal).unwrap().len() > 0);
        assert!(shm.is_file());

        let backup = create_backup(&data, &target).unwrap();
        assert!(backup.dir.join("db").join(format!("{}-wal", storage::DB_FILE)).is_file());
        assert!(backup.dir.join("db").join(format!("{}-shm", storage::DB_FILE)).is_file());
        verify_manifest(&backup.dir);
        drop(connection);
    }

    #[test]
    fn import_copies_rows_files_and_settings_behind_a_verified_backup() {
        let temp = TempDir::new().unwrap();
        let (appdata, data) = seed_source(temp.path());
        let target = seed_target(temp.path());
        let before = hashes(&data);

        let report = import_core(&target, &appdata, None, None);
        assert!(report.ok, "{:?}", report.error);
        assert_eq!(report.status, "completed");
        assert!(report.error.is_none());
        assert!(report.already_migrated == false);
        let inserted: BTreeMap<&str, i64> = report
            .tables
            .iter()
            .map(|table| (table.table.as_str(), table.inserted))
            .collect();
        assert_eq!(inserted["games"], 2);
        assert_eq!(inserted["sessions"], 1);
        assert_eq!(inserted["lesson_documents"], 2);
        assert_eq!(inserted["lesson_analyses"], 1);
        assert_eq!(inserted["game_recommendations"], 1);
        assert_eq!(inserted["game_projects"], 1);
        assert_eq!(inserted["lesson_chunks"], 2);
        assert_eq!(inserted["lesson_chats"], 1);
        assert_eq!(inserted["lesson_chat_messages"], 2);
        assert_eq!(inserted["ai_generation_cache"], 1);
        assert_eq!(inserted["ai_tasks"], 1);

        let counts = target_counts(&target);
        assert_eq!(counts.games, 3, "phải giữ trò chơi của bản Tauri");
        assert_eq!(counts.lesson_documents, 2);
        assert_eq!(counts.lesson_chunks, 2);
        assert!(target.join("images/ci-one.img").is_file());
        assert!(target.join("images/ci-two.img").is_file());
        assert!(target.join("lessons/d1.txt").is_file());
        assert!(target.join("lessons/d2.txt").is_file());
        assert!(!target.join("ai-local").exists(), "ai-local/ không được chép");

        let settings = read_json_file(&target.join(paths::SETTINGS_FILE));
        assert_eq!(settings["theme"], "light");
        assert_eq!(settings["ai"]["providers"]["openai"]["baseUrl"], "https://example.test/v1");
        assert_eq!(settings["ai"]["providers"]["openai"]["model"], "gpt-x");
        assert!(!contains_secret_key(&settings), "settings đích còn khoá bí mật");
        assert!(!contains_text(&settings, "SK-SECRET"), "settings đích còn giá trị bí mật");
        assert_eq!(report.settings.status, "imported");
        assert_eq!(report.settings.keys_removed, 3);

        let backup = PathBuf::from(report.backup_path.clone().expect("phải có backup"));
        assert!(backup.is_dir());
        verify_manifest(&backup);
        assert!(!any_file_contains(&backup, "SK-SECRET"), "backup còn khoá bí mật");
        let manifest = read_json_file(&backup.join("manifest.json"));
        assert_eq!(manifest["settings"]["sanitized"], true);
        assert_eq!(manifest["settings"]["keysRemoved"], 3);
        assert_eq!(manifest["excluded"][0], "ai-local/");

        let status = read_json_file(&target.join(STATUS_FILE));
        assert!(completed_at(&status).is_some());
        assert_eq!(status["lastAttempt"]["status"], "completed");
        assert_eq!(status["settings"]["status"], "imported");
        assert_eq!(status["backupPath"], backup.display().to_string());

        assert_eq!(before, hashes(&data), "profile nguồn không được đổi");
    }

    #[test]
    fn rerunning_import_inserts_zero_rows_and_keeps_the_first_backup() {
        let temp = TempDir::new().unwrap();
        let (appdata, data) = seed_source(temp.path());
        let target = seed_target(temp.path());
        let before = hashes(&data);

        let first = import_core(&target, &appdata, None, None);
        assert!(first.ok, "{:?}", first.error);
        let counts = target_counts(&target);

        let second = import_core(&target, &appdata, None, None);
        assert!(second.ok, "{:?}", second.error);
        assert!(second.already_migrated);
        assert!(
            second.tables.iter().all(|table| table.inserted == 0),
            "lần hai không được thêm dòng: {:?}",
            second.tables
        );
        assert_eq!(second.settings.status, "skipped-existing");
        assert_eq!(counts.games, target_counts(&target).games);
        assert_eq!(counts.lesson_documents, target_counts(&target).lesson_documents);

        let backups = walk_files(&target.join(BACKUP_DIR), "test").unwrap();
        let manifests = backups
            .iter()
            .filter(|path| path.file_name().is_some_and(|name| name == "manifest.json"))
            .count();
        assert_eq!(manifests, 2, "mỗi lần nhập có một bản sao lưu riêng");
        assert_eq!(before, hashes(&data));
    }

    #[test]
    fn a_settings_failure_leaves_the_backup_and_source_intact_and_retry_succeeds() {
        let temp = TempDir::new().unwrap();
        let (appdata, data) = seed_source(temp.path());
        // Tạo target trước, rồi chặn đúng bước cài đặt bằng một THƯ MỤC mang tên
        // settings.json. DB và tệp đã chép xong mới tới bước này.
        let target = seed_target(temp.path());
        fs::create_dir_all(target.join(paths::SETTINGS_FILE)).unwrap();
        let before = hashes(&data);

        let failed = import_core(&target, &appdata, None, None);
        assert!(!failed.ok);
        let error = failed.error.as_ref().expect("phải có lỗi");
        assert_eq!(error.code, "EG_MIGRATION_SETTINGS");
        assert_eq!(error.part, "settings");
        let backup = PathBuf::from(failed.backup_path.clone().expect("backup phải có trước khi ghi"));
        assert!(backup.join("manifest.json").is_file());
        let status = read_json_file(&target.join(STATUS_FILE));
        assert!(completed_at(&status).is_none(), "nhập dở không được báo hoàn tất");
        assert_eq!(status["lastAttempt"]["status"], "failed");
        assert_eq!(status["lastAttempt"]["error"]["code"], "EG_MIGRATION_SETTINGS");
        assert_eq!(target_counts(&target).games, 3);
        assert!(target.join("lessons/d1.txt").is_file());
        assert_eq!(before, hashes(&data), "lỗi không được đụng profile nguồn");

        fs::remove_dir(target.join(paths::SETTINGS_FILE)).unwrap();
        let retry = import_core(&target, &appdata, None, None);
        assert!(retry.ok, "{:?}", retry.error);
        assert!(retry.tables.iter().all(|table| table.inserted == 0));
        assert_eq!(retry.settings.status, "imported");
        assert_eq!(target_counts(&target).games, 3);
        let status = read_json_file(&target.join(STATUS_FILE));
        assert!(completed_at(&status).is_some());
        assert_eq!(before, hashes(&data));
    }

    #[test]
    fn a_corrupt_source_is_rejected_before_the_target_is_touched() {
        let temp = TempDir::new().unwrap();
        let (appdata, data) = seed_source(temp.path());
        let target = temp.path().join("tauri").join("edugame-data");
        fs::create_dir_all(&target).unwrap();
        for suffix in ["", "-wal", "-shm"] {
            let path = data.join(format!("{}{suffix}", storage::DB_FILE));
            if path.exists() {
                fs::remove_file(&path).unwrap();
            }
        }
        fs::write(data.join(storage::DB_FILE), b"not a sqlite database").unwrap();

        let detect = detect_core(&target, &appdata, None, None);
        assert!(detect.found);
        assert!(detect.error.is_some(), "phải báo profile hỏng");

        let report = import_core(&target, &appdata, None, None);
        assert!(!report.ok);
        assert!(report.error.is_some());
        assert!(!target.join(storage::DB_FILE).exists(), "chưa được tạo DB đích");
        assert!(!target.join(BACKUP_DIR).exists(), "backup dở phải bị dọn");
        let status = read_json_file(&target.join(STATUS_FILE));
        assert!(completed_at(&status).is_none());
        assert_eq!(status["lastAttempt"]["status"], "failed");
    }

    #[test]
    fn secrets_are_stripped_recursively_and_display_fields_are_reset() {
        let mut value = json!({
            "ai": {
                "providers": {
                    "openai": { "apiKeyEncrypted": "secret", "hasKey": true, "keyMasked": "sk-…" },
                    "list": [
                        { "apiKey": "secret-2", "hasKey": true, "keyMasked": "x" }
                    ]
                },
                "apiKey": null
            }
        });
        assert_eq!(strip_secrets(&mut value), 2);
        assert!(value["ai"].get("apiKey").is_none());
        assert!(value["ai"]["providers"]["openai"].get("apiKeyEncrypted").is_none());
        assert!(value["ai"]["providers"]["list"][0].get("apiKey").is_none());
        assert_eq!(value["ai"]["providers"]["openai"]["hasKey"], false);
        assert_eq!(value["ai"]["providers"]["openai"]["keyMasked"], "");
        assert!(!contains_text(&value, "secret"));
    }

    #[test]
    fn safe_join_rejects_paths_that_escape_the_root() {
        let base = Path::new("C:/data");
        assert!(safe_join(base, "images/ci-one.img").is_some());
        assert!(safe_join(base, "lessons\\d1.txt").is_some());
        assert!(safe_join(base, "../outside.txt").is_none());
        assert!(safe_join(base, "images/../../outside.txt").is_none());
        assert!(safe_join(base, "C:/Windows/win.ini").is_none());
        assert!(safe_join(base, "").is_none());
    }
}
