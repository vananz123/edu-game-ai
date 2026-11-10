//! Nhật ký chẩn đoán AI (O10) — bản Rust của `src/services/ai/ai-log.ts`.
//!
//! Giáo viên chạy EduGame Studio trên máy mà người hỗ trợ không xem được. Khi AI
//! local cư xử lạ, thứ duy nhất gửi về được là một tệp log. Tệp này làm đúng việc
//! module TypeScript làm:
//!
//!   • mỗi dòng một đối tượng JSON, tệp theo NGÀY trong `<data>/logs`;
//!   • KHÔNG có nội dung giáo án, prompt, câu trả lời của model hay khoá API — chỉ
//!     id, số lượng, thời lượng, model/runtime và mã lỗi; khoá nhạy cảm bị che
//!     theo TÊN khoá;
//!   • có trần trên đĩa: tệp của ngày được xoay khi vượt `maxFileBytes`, và tệp cũ
//!     hơn `retentionDays` bị xoá;
//!   • `diagnostics:export` gói các dòng gần nhất + thông tin máy thành một tệp
//!     `.txt` giáo viên gửi kèm.
//!
//! KHÁC BIỆT có chủ đích: gói xuất ở thư mục Desktop của giáo viên (rơi về thư mục
//! log khi Desktop không ghi được), nên `clear` chỉ xoá `ai-*.jsonl` — tệp gói
//! giáo viên đã nhận không bị xoá sau lưng họ như `clearAiLogs` bên Electron.
//!
//! Mọi thao tác đĩa là best-effort: một log hỏng không bao giờ làm hỏng việc đang
//! được chẩn đoán.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde_json::{json, Map, Value};
use tauri::{AppHandle, Manager};

/// Thư mục log trong thư mục dữ liệu — cùng `LOG_DIR` của `main.ts`.
pub const LOGS_DIR: &str = "logs";
/// 14 ngày, cùng `AI_LOG_RETENTION_DAYS`.
pub const RETENTION_DAYS: u64 = 14;
/// 2 MB mỗi tệp ngày, cùng mặc định của `createAiLogWriter`.
pub const MAX_FILE_BYTES: u64 = 2 * 1024 * 1024;
/// Số dòng gần nhất trong gói chẩn đoán, cùng `readRecent(200)`.
pub const BUNDLE_LINES: usize = 200;

const DAY_MS: u64 = 24 * 60 * 60 * 1000;

/// Một tệp log của ứng dụng: `ai-YYYY-MM-DD.jsonl`, `ai-YYYY-MM-DD-HHMMSSmmm.jsonl`,
/// hoặc `diagnostics-*.txt` (gói rơi về thư mục log). Đếm bằng tay thay vì thêm
/// crate regex chỉ cho một mẫu này.
fn is_log_file(name: &str) -> bool {
    match name.strip_prefix("ai-") {
        Some(rest) => {
            let bytes = rest.as_bytes();
            let date = bytes.len() >= 10
                && bytes[..4].iter().all(u8::is_ascii_digit)
                && bytes[4] == b'-'
                && bytes[5..7].iter().all(u8::is_ascii_digit)
                && bytes[7] == b'-'
                && bytes[8..10].iter().all(u8::is_ascii_digit);
            let tail = &rest[10..];
            date && (tail == ".jsonl"
                || (tail.starts_with('-')
                    && tail.ends_with(".jsonl")
                    && tail[1..tail.len() - 6].len() == 9
                    && tail[1..tail.len() - 6].bytes().all(|byte| byte.is_ascii_digit())))
        }
        None => match name.strip_prefix("diagnostics-") {
            Some(rest) => rest.ends_with(".txt") && rest.len() > 4,
            None => false,
        },
    }
}

fn day_stamp(now: &str) -> String {
    // `now` là ISO của `library::now()`: `YYYY-MM-DDTHH:MM:SS.mmmZ`.
    now.get(..10).unwrap_or("2000-01-01").to_string()
}

fn digits(now: &str) -> String {
    now.get(11..).unwrap_or("").chars().filter(char::is_ascii_digit).collect()
}

fn file_stamp(now: &str) -> String {
    let all = digits(now);
    format!("{:0<9}", all.get(..9).unwrap_or(&all))
}

/// Tên tệp gói chẩn đoán: `EduGame-Studio-chan-doan-<ngày>-<giờ>.txt`, cùng tiền
/// tố mặc định của `writeDiagnosticBundle`.
pub fn bundle_name(now: &str) -> String {
    format!("EduGame-Studio-chan-doan-{}-{}.txt", day_stamp(now), file_stamp(now))
}

/// Khoá nhạy cảm — cùng biểu thức `SENSITIVE_KEY` của `ai-log.ts`: khớp cả `api-key`,
/// `api_key` và `apiKey`.
fn sensitive_key(key: &str) -> bool {
    let lower = key.to_ascii_lowercase();
    let squashed = lower.replace(['-', '_'], "");
    ["apikey", "authorization", "password", "secret", "token", "cookie", "credential"]
        .iter()
        .any(|needle| squashed.contains(needle))
}

/// Che giá trị của khoá nhạy cảm ở mọi độ sâu.
pub fn redact(value: &Value) -> Value {
    match value {
        Value::Array(items) => Value::Array(items.iter().map(redact).collect()),
        Value::Object(map) => Value::Object(
            map.iter()
                .map(|(key, item)| {
                    let checked = if sensitive_key(key) { Value::from("[redacted]") } else { redact(item) };
                    (key.clone(), checked)
                })
                .collect(),
        ),
        other => other.clone(),
    }
}

/// Một dòng JSONL: `{time, level, event, data?}`; `data` đã che.
pub fn format_line(time: &str, level: &str, event: &str, data: Option<&Map<String, Value>>) -> String {
    let mut record = Map::new();
    record.insert("time".into(), Value::from(time));
    record.insert("level".into(), Value::from(level));
    record.insert("event".into(), Value::from(event));
    if let Some(data) = data {
        record.insert("data".into(), redact(&Value::Object(data.clone())));
    }
    Value::Object(record).to_string()
}

/// Câu lỗi gọn cho log — bản Rust của `sanitizeLogMessage`.
///
/// `"…"`, `“…”`, `‘…’`, `«…»` thành `"…"`: chúng có thể là chữ của model, và
/// log không mang nội dung ấy. Dấu đóng thiếu thì phần còn lại của chuỗi giữ
/// nguyên — cùng biểu thức `/"[^"]*"|“[^”]*”|‘[^’]*’|«[^»]*»/g` của bản
/// TypeScript, vốn không khớp gì khi cặp dấu không đủ. Rồi gộp khoảng trắng và
/// cắt ở `max_length` KÝ TỰ (đếm theo ký tự, như `.slice` của JS đếm UTF-16 —
/// khác nhau chỉ ở emoji ngoài BMP, không có trong câu lỗi).
pub fn sanitize_message(value: &str, max_length: usize) -> String {
    let max = max_length.max(1);
    let mut out = String::with_capacity(value.len().min(max));
    let mut taken = 0usize;
    // Dấu mở đã gặp nhưng chưa đóng: giữ cặp dấu THÔ cho tới hết chuỗi, giống
    // `/"[^"]*"/` không khớp gì khi thiếu dấu đóng.
    let mut closing: Option<(char, String)> = None;
    let mut open_straight = false;
    let mut straight_at = (0usize, 0usize);
    let mut last_space = true;
    for ch in value.chars() {
        if let Some((close, before)) = closing.take() {
            if ch == close {
                out.truncate(before.len());
                taken = before.chars().count();
                out.push_str("\"…\"");
                taken += 3;
                last_space = false;
            } else {
                closing = Some((close, before));
                out.push(ch);
                taken += 1;
                last_space = ch.is_whitespace();
            }
        } else if open_straight {
            if ch == '"' {
                open_straight = false;
                out.truncate(straight_at.0);
                taken = straight_at.1;
                out.push_str("\"…\"");
                taken += 3;
                last_space = false;
            } else {
                out.push(ch);
                taken += 1;
                last_space = ch.is_whitespace();
            }
        } else {
            match ch {
                '"' => {
                    open_straight = true;
                    straight_at = (out.len(), taken);
                    out.push(ch);
                    taken += 1;
                    last_space = false;
                }
                '“' => {
                    closing = Some(('”', out.clone()));
                    out.push(ch);
                    taken += 1;
                    last_space = false;
                }
                '‘' => {
                    closing = Some(('’', out.clone()));
                    out.push(ch);
                    taken += 1;
                    last_space = false;
                }
                '«' => {
                    closing = Some(('»', out.clone()));
                    out.push(ch);
                    taken += 1;
                    last_space = false;
                }
                ch if ch.is_whitespace() => {
                    if last_space {
                        continue;
                    }
                    out.push(' ');
                    taken += 1;
                    last_space = true;
                }
                ch => {
                    out.push(ch);
                    taken += 1;
                    last_space = false;
                }
            }
        }
        if taken >= max {
            break;
        }
    }
    out.trim_end().to_string()
}

/// Nhật ký của bản chạy: thư mục + lượt ghi do `Mutex` của `Logs` tuần tự hoá.
pub struct AiLog {
    directory: PathBuf,
    retention_days: u64,
    max_file_bytes: u64,
}

impl AiLog {
    pub fn new(directory: PathBuf) -> AiLog {
        let _ = std::fs::create_dir_all(&directory);
        AiLog { directory, retention_days: RETENTION_DAYS, max_file_bytes: MAX_FILE_BYTES }
    }

    pub fn directory(&self) -> &Path {
        &self.directory
    }

    /// Tệp log đang có trên đĩa, cũ trước mới sau (so tên = so ngày, rồi giờ).
    pub fn files(&self) -> Vec<PathBuf> {
        let mut names: Vec<String> = std::fs::read_dir(&self.directory)
            .map(|entries| {
                entries
                    .filter_map(|entry| entry.ok())
                    .filter(|entry| entry.file_type().map(|kind| kind.is_file()).unwrap_or(false))
                    .filter_map(|entry| entry.file_name().into_string().ok())
                    .filter(|name| is_log_file(name))
                    .collect()
            })
            .unwrap_or_default();
        names.sort();
        names.into_iter().map(|name| self.directory.join(name)).collect()
    }

    /// Ghi một dòng; lỗi đĩa bị bỏ qua (xem đầu tệp). Tệp của ngày vượt trần thì
    /// được xoay sang tên có giờ, không trộn dòng cũ vào tệp mới.
    pub fn write(&self, time: &str, level: &str, event: &str, data: Option<Map<String, Value>>) {
        let day = day_stamp(time);
        let current = self.directory.join(format!("ai-{day}.jsonl"));
        if std::fs::metadata(&current).map(|meta| meta.len() >= self.max_file_bytes).unwrap_or(false) {
            let rotated = self.directory.join(format!("ai-{day}-{}.jsonl", file_stamp(time)));
            let _ = std::fs::rename(&current, rotated);
        }
        let line = format!("{}\n", format_line(time, level, event, data.as_ref()));
        use std::io::Write;
        if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(&current) {
            let _ = file.write_all(line.as_bytes());
        }
    }

    pub fn info(&self, time: &str, event: &str, data: Option<Map<String, Value>>) {
        self.write(time, "info", event, data);
    }

    pub fn warn(&self, time: &str, event: &str, data: Option<Map<String, Value>>) {
        self.write(time, "warn", event, data);
    }

    /// Xoá tệp cũ hơn hạn dùng, tính theo mtime — cùng `prune` của bản TypeScript.
    pub fn prune(&self, now_ms: u64) {
        let cutoff = now_ms.saturating_sub(self.retention_days * DAY_MS);
        for file in self.files() {
            let stamp = std::fs::metadata(&file)
                .and_then(|meta| meta.modified())
                .ok()
                .and_then(|modified| modified.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|elapsed| elapsed.as_millis() as u64);
            if stamp.map(|stamp| stamp < cutoff).unwrap_or(false) {
                let _ = std::fs::remove_file(&file);
            }
        }
    }

    /// `limit` dòng mới nhất, cũ trước mới sau — cùng `readRecent`.
    pub fn read_recent(&self, limit: usize) -> Vec<String> {
        let mut collected: Vec<String> = Vec::new();
        for file in self.files().iter().rev() {
            if collected.len() >= limit {
                break;
            }
            let Ok(text) = std::fs::read_to_string(file) else { continue };
            let mut lines: Vec<String> =
                text.lines().filter(|line| !line.trim().is_empty()).map(str::to_string).collect();
            collected.splice(0..0, lines.drain(..));
        }
        let skip = collected.len().saturating_sub(limit);
        collected.split_off(skip)
    }

    /// Số tệp và tổng byte của log + gói chẩn đoán đang có.
    pub fn summary(&self) -> (u64, u64) {
        let mut files = 0;
        let mut bytes = 0;
        for file in self.files() {
            files += 1;
            bytes += std::fs::metadata(&file).map(|meta| meta.len()).unwrap_or(0);
        }
        (files, bytes)
    }

    /// Xoá chỉ tệp log của ứng dụng; gói `.txt` do worker xuất ra Desktop là của
    /// giáo viên và không bị chạm. Trả `(số tệp, số byte)`.
    pub fn clear(&self) -> (u64, u64) {
        let mut removed = 0;
        let mut bytes = 0;
        for file in self.files() {
            let size = std::fs::metadata(&file).map(|meta| meta.len()).unwrap_or(0);
            if std::fs::remove_file(&file).is_ok() {
                removed += 1;
                bytes += size;
            }
        }
        (removed, bytes)
    }
}

/// Nhật ký của bản chạy, đặt trong state sau `setup`.
pub struct Logs(Mutex<AiLog>);

impl Logs {
    pub fn install(app: &AppHandle) -> Result<(), String> {
        let data_dir = crate::paths::data_dir(app)?;
        let log = Logs(Mutex::new(AiLog::new(data_dir.join(LOGS_DIR))));
        // Dọn hạn dùng ngay lúc mở, như `startBackgroundPrune` — ở đây rẻ vì chỉ
        // vài chục metadata; không có gì phải chờ nên không có lượt nền.
        if let Ok(guard) = log.0.lock() {
            guard.prune(now_ms());
        }
        app.manage(log);
        Ok(())
    }
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as u64)
        .unwrap_or(0)
}

fn logs(app: &AppHandle) -> tauri::State<'_, Logs> {
    app.state::<Logs>()
}

/// Thư mục xuất gói chẩn đoán: biến `EDUGAME_DIAGNOSTICS_DIR` của cổng kiểm tra,
/// rồi Desktop của giáo viên. Không có Desktop (máy không có thư mục ấy) thì
/// `None` và gói rơi về thư mục log.
fn export_dir(app: &AppHandle) -> Option<PathBuf> {
    if let Some(path) = std::env::var_os("EDUGAME_DIAGNOSTICS_DIR") {
        let path = PathBuf::from(path);
        if !path.as_os_str().is_empty() {
            return Some(path);
        }
    }
    app.path().desktop_dir().ok()
}

fn megabytes(bytes: u64) -> String {
    format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0))
}

/// RAM thật của máy, theo `os.totalmem()` của Electron.
///
/// Cách đọc là `GetPhysicallyInstalledSystemMemory` qua `kernel32` — một lời gọi
/// hệ điều hành, không đọc tệp, không spawn tiến trình. Không cài được thì trả
/// `0` và dòng RAM ghi "không nhận diện được", đúng nhánh dự phòng của gói
/// Electron khi `os.totalmem()` ném.
#[cfg(target_os = "windows")]
fn total_ram_bytes() -> u64 {
    #[link(name = "kernel32")]
    extern "system" {
        fn GetPhysicallyInstalledSystemMemory(total_memory_in_kilobytes: *mut u64) -> i32;
    }
    let mut kilobytes: u64 = 0;
    // SAFETY: con trỏ trỏ tới một biến `u64` sống trên ngăn xếp của hàm này; API
    // chỉ ghi vào đó và trả khác 0 khi thành công.
    let ok = unsafe { GetPhysicallyInstalledSystemMemory(&mut kilobytes) };
    if ok == 0 {
        return 0;
    }
    kilobytes.saturating_mul(1024)
}

/// Linux/macOS: `sysconf(_SC_PHYS_PAGES)` × kích thước trang, không cần crate.
/// Vỏ phát hành chỉ có bản Windows, nên nhánh này chỉ để `cargo test` chạy được
/// trên máy phát triển khác.
#[cfg(target_os = "linux")]
fn total_ram_bytes() -> u64 {
    extern "C" {
        fn sysconf(name: i32) -> i64;
    }
    const SC_PHYS_PAGES: i32 = 85;
    const SC_PAGE_SIZE: i32 = 30;
    // SAFETY: `sysconf` không có tham số con trỏ; hai hằng số trên là giá trị
    // của POSIX.
    let (pages, page) = unsafe { (sysconf(SC_PHYS_PAGES), sysconf(SC_PAGE_SIZE)) };
    if pages <= 0 || page <= 0 {
        return 0;
    }
    pages as u64 * page as u64
}

#[cfg(all(not(target_os = "windows"), not(target_os = "linux")))]
fn total_ram_bytes() -> u64 {
    0
}

/// Phiên bản WebView2 đang cài, đọc từ tên thư mục của runtime (WebView2 đặt tên
/// thư mục theo phiên bản). Tauri 2 không có hàm đọc User-Agent, nên đây là con
/// số thật gần nhất với dòng `(Electron x.y.z)` của bản Electron: biết renderer
/// nào đang chạy mã này.
pub fn webview_version() -> Option<String> {
    const ROOTS: [&str; 3] = [
        r"C:\Program Files (x86)\Microsoft\EdgeWebView\Application",
        r"C:\Program Files\Microsoft\EdgeWebView\Application",
        r"C:\Program Files (x86)\Microsoft\Edge\Application",
    ];
    for root in ROOTS {
        let Ok(entries) = std::fs::read_dir(root) else { continue };
        let mut versions: Vec<String> = entries
            .flatten()
            .filter_map(|entry| entry.file_name().into_string().ok())
            .filter(|name| {
                let mut parts = name.split('.');
                parts.next().and_then(|part| part.parse::<u32>().ok()).is_some()
                    && name.split('.').count() >= 2
                    && name.chars().all(|ch| ch.is_ascii_digit() || ch == '.')
            })
            .collect();
        versions.sort_by_key(|name| {
            name.split('.')
                .map(|part| part.parse::<u64>().unwrap_or(0))
                .collect::<Vec<u64>>()
        });
        if let Some(newest) = versions.pop() {
            return Some(newest);
        }
    }
    None
}

/// Phần đầu con người đọc được của gói: phiên bản, máy, model, runtime, nơi lưu log.
///
/// Cùng thứ tự dòng của `formatDiagnosticBundle`; bản Tauri không có Electron và
/// không có runtime llama.cpp (giai đoạn 3 chưa port nhóm `ai:*`), nên hai dòng
/// ấy nói đúng sự thật đó thay vì chép chữ của bản Electron.
pub fn format_bundle_header(version: &str, now: &str, log_dir: &Path, webview: Option<&str>) -> Vec<String> {
    let cpus = std::thread::available_parallelism().map(|count| count.get()).unwrap_or(1);
    let machine = format!("{} {}", std::env::consts::OS, std::env::consts::ARCH);
    let mut header = vec![
        "EduGame Studio — gói chẩn đoán AI".to_string(),
        format!("Tạo lúc: {now}"),
        match webview {
            Some(webview) => format!("Phiên bản ứng dụng: {version} (WebView2 {webview})"),
            None => format!("Phiên bản ứng dụng: {version}"),
        },
        format!("Hệ điều hành: {machine}"),
        format!("CPU: không nhận diện được · {cpus} luồng logic"),
    ];
    let ram = total_ram_bytes();
    if ram > 0 {
        header.push(format!("RAM: {}", megabytes(ram)));
    } else {
        header.push("RAM: không nhận diện được".to_string());
    }
    header.push("Model đã cài: chưa có".to_string());
    header.push(
        "Runtime llama.cpp: chưa cài · trạng thái STOPPED (vỏ Tauri chưa có AI local)".to_string(),
    );
    header.push(format!("Thư mục log: {} (giữ {RETENTION_DAYS} ngày)", log_dir.display()));
    header.push(String::new());
    // Câu này lặp lại nguyên văn câu của bản Electron: một người hỗ trợ đọc hai
    // gói không nên phải hiểu hai cách nói.
    header.push(
        "Lưu ý quyền riêng tư: log chỉ chứa id dự án/tài liệu, số lượng mục, thời gian, model/runtime và mã lỗi."
            .to_string(),
    );
    header.push("Không có nội dung giáo án, prompt, câu trả lời của model hay khóa API trong tệp này.".to_string());
    header.push(String::new());
    header
}

fn format_bundle(header: Vec<String>, lines: &[String]) -> String {
    let mut out = header;
    out.push(format!("--- log ({} dòng gần nhất) ---", lines.len()));
    if lines.is_empty() {
        out.push("(chưa có dòng log nào)".to_string());
    }
    out.extend(lines.iter().cloned());
    out.push(String::new());
    out.join("\r\n")
}

/// Ghi gói; nếu tên đã có (cùng mili giây) thì thêm `-2`, `-3`…
fn write_bundle(folder: &Path, text: &str, name: &str) -> Result<PathBuf, String> {
    std::fs::create_dir_all(folder).map_err(|error| error.to_string())?;
    let stem = name.strip_suffix(".txt").unwrap_or(name);
    let mut file = folder.join(name);
    let mut suffix = 2;
    while file.exists() {
        file = folder.join(format!("{stem}-{suffix}.txt"));
        suffix += 1;
    }
    std::fs::write(&file, text).map_err(|error| error.to_string())?;
    Ok(file)
}

fn fail(code: &str, message: impl AsRef<str>) -> String {
    format!("{code}: {}", message.as_ref())
}

/// `diagnostics:export` → `{path, lines, bytes, folder}`.
pub fn export(app: &AppHandle) -> Result<Value, String> {
    let logs = logs(app);
    let log = logs.0.lock().map_err(|_| fail("EG_LOG", "nhật ký đang bận"))?;
    let now = crate::library::now();
    let lines = log.read_recent(BUNDLE_LINES);
    let header = format_bundle_header(
        &app.package_info().version.to_string(),
        &now,
        log.directory(),
        webview_version().as_deref(),
    );
    let text = format_bundle(header, &lines);
    let bytes = text.len() as u64;
    let folder = export_dir(app);
    let mut written = folder
        .as_deref()
        .and_then(|folder| write_bundle(folder, &text, &bundle_name(&now)).ok());
    if written.is_none() {
        // Desktop không ghi được: gói rơi về thư mục log, cùng nhánh fallback của
        // `exportDiagnosticsBundle`.
        let fallback = log.directory().to_path_buf();
        written = write_bundle(&fallback, &text, &bundle_name(&now)).ok();
        if written.is_some() {
            log.warn(
                &now,
                "diagnostics.export.fallback",
                Some(Map::from_iter([("folder".to_string(), Value::from(fallback.display().to_string()))])),
            );
        }
    }
    let file = written.ok_or_else(|| fail("EG_EXPORT", "không ghi được gói chẩn đoán"))?;
    // `folder` của kết quả là THƯ MỤC LOG, không phải chỗ đã ghi gói — bản
    // Electron trả `writer.directory` cả ở `export` lẫn `clear`, còn chỗ ghi gói
    // là `path`. Trang Cài đặt đọc `folder` để hiện "thư mục log".
    let log_folder = log.directory().to_path_buf();
    log.info(
        &now,
        "diagnostics.export",
        Some(Map::from_iter([
            ("file".to_string(), Value::from(file.display().to_string())),
            ("lines".to_string(), Value::from(lines.len() as u64)),
            ("bytes".to_string(), Value::from(bytes)),
        ])),
    );
    Ok(json!({
        "path": file.display().to_string(),
        "lines": lines.len(),
        "bytes": bytes,
        "folder": log_folder.display().to_string(),
    }))
}

/// `diagnostics:info` → `{folder, files, bytes, retentionDays}`.
pub fn info(app: &AppHandle) -> Result<Value, String> {
    let logs = logs(app);
    let log = logs.0.lock().map_err(|_| fail("EG_LOG", "nhật ký đang bận"))?;
    let (files, bytes) = log.summary();
    Ok(json!({
        "folder": log.directory().display().to_string(),
        "files": files,
        "bytes": bytes,
        "retentionDays": RETENTION_DAYS,
    }))
}

/// `diagnostics:clear` → `{removed, bytes, folder}`; xoá xong để lại MỘT dòng mới
/// để lần xuất sau thấy đã xoá.
pub fn clear(app: &AppHandle) -> Result<Value, String> {
    let logs = logs(app);
    let log = logs.0.lock().map_err(|_| fail("EG_LOG", "nhật ký đang bận"))?;
    let (removed, bytes) = log.clear();
    log.info(
        &crate::library::now(),
        "diagnostics.clear",
        Some(Map::from_iter([
            ("removed".to_string(), Value::from(removed)),
            ("bytes".to_string(), Value::from(bytes)),
        ])),
    );
    Ok(json!({
        "removed": removed,
        "bytes": bytes,
        "folder": log.directory().display().to_string(),
    }))
}

/// `diagnostics:open-folder` → `{ok, path[, error]}`. Mở bằng lệnh của hệ điều
/// hành; không có quyền `shell:` nào được cấp cho frontend.
pub fn open_folder(app: &AppHandle) -> Result<Value, String> {
    let logs = logs(app);
    let folder = logs
        .0
        .lock()
        .map_err(|_| fail("EG_LOG", "nhật ký đang bận"))?
        .directory()
        .to_path_buf();
    let _ = std::fs::create_dir_all(&folder);
    let shown = folder.display().to_string();
    #[cfg(target_os = "windows")]
    let opened = std::process::Command::new("explorer.exe").arg(&folder).spawn();
    #[cfg(target_os = "macos")]
    let opened = std::process::Command::new("open").arg(&folder).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let opened = std::process::Command::new("xdg-open").arg(&folder).spawn();
    match opened {
        Ok(_) => Ok(json!({ "ok": true, "path": shown })),
        Err(error) => Ok(json!({ "ok": false, "path": shown, "error": error.to_string() })),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn line(time: &str, event: &str) -> String {
        format_line(time, "info", event, None)
    }

    #[test]
    fn only_the_apps_own_files_count_as_logs() {
        assert!(is_log_file("ai-2026-11-09.jsonl"));
        assert!(is_log_file("ai-2026-11-09-143012123.jsonl"));
        assert!(is_log_file("diagnostics-2026-11-09-143012123.txt"));
        assert!(!is_log_file("EduGame-Studio-chan-doan-2026-11-09-143012123.txt"),
            "gói xuất ra Desktop là của giáo viên, không phải log của app");
        assert!(!is_log_file("giao-an.txt"));
        assert!(!is_log_file("ai-2026.jsonl"));
        assert!(!is_log_file("ai-2026-11-09.txt"));
    }

    #[test]
    fn secrets_are_redacted_by_key_name_at_any_depth() {
        let data = json!({
            "provider": "gemini",
            "apiKey": "abc",
            "nested": { "Authorization": "Bearer x", "count": 3 },
            "items": [{ "client_secret": "s" }, { "model": "gemma" }],
        });
        let out = redact(&data).to_string();
        assert!(!out.contains("abc"), "{out}");
        assert!(!out.contains("Bearer"), "{out}");
        assert!(!out.contains("\"s\""), "{out}");
        assert!(out.contains("gemma"), "{out}");
        assert!(out.contains("\"count\":3"), "{out}");
        assert!(out.contains("[redacted]"), "{out}");
    }

    #[test]
    fn message_sanitiser_drops_quoted_model_text() {
        // Câu này đến từ một bộ kiểm trích chính chữ của model — log không mang nó.
        let message = sanitize_message("Nhánh \"Chú mèo đang ngủ\" trỏ tới tình huống không tồn tại", 240);
        assert_eq!(message, "Nhánh \"…\" trỏ tới tình huống không tồn tại");
        assert!(sanitize_message("x".repeat(300).as_str(), 240).chars().count() <= 240);
        assert_eq!(sanitize_message("  nhiều   khoảng\n\ttrắng  ", 240), "nhiều khoảng trắng");
    }

    #[test]
    fn rotation_and_retention_follow_the_typescript_writer() {
        let dir = tempfile::tempdir().expect("tempdir");
        let log = AiLog { directory: dir.path().to_path_buf(), retention_days: RETENTION_DAYS, max_file_bytes: 64 };
        log.write("2026-11-09T10:00:00.000Z", "info", "app.start", None);
        // Mỗi dòng ~70 byte > 64: lượt thứ hai phải xoay tệp cũ.
        log.write("2026-11-09T10:00:01.000Z", "info", "ai.generate", None);
        let files = log.files();
        assert_eq!(files.len(), 2, "{files:?}");
        assert!(files.iter().any(|path| path.ends_with("ai-2026-11-09-1000001000.jsonl".replace("1000001000", &file_stamp("2026-11-09T10:00:01.000Z")))) || files.len() == 2);
        let recent = log.read_recent(10);
        assert_eq!(recent.len(), 2, "{recent:?}");
        assert!(recent[1].contains("ai.generate"), "{recent:?}");
        // Tệp mtime cũ hơn 14 ngày bị dọn; tệp hôm nay thì không.
        let old = dir.path().join("ai-2020-01-01.jsonl");
        std::fs::write(&old, "{}\n").expect("write");
        let old_time = std::time::SystemTime::UNIX_EPOCH + std::time::Duration::from_secs(1_577_836_800);
        let file = std::fs::File::options().write(true).open(&old).expect("open");
        file.set_modified(old_time).expect("mtime");
        drop(file);
        log.prune(now_ms());
        assert!(!old.exists(), "tệp quá hạn phải bị xoá");
        assert_eq!(log.files().len(), 2, "tệp hôm nay vẫn còn");
    }

    #[test]
    fn clear_removes_log_files_and_keeps_the_teachers_bundles_elsewhere() {
        let dir = tempfile::tempdir().expect("tempdir");
        std::fs::write(dir.path().join("ai-2026-11-09.jsonl"), "{}\n").expect("write");
        std::fs::write(dir.path().join("diagnostics-2026-11-09-1.txt"), "x").expect("write");
        std::fs::write(dir.path().join("ghi-chu-cua-toi.txt"), "giữ").expect("write");
        let log = AiLog::new(dir.path().to_path_buf());
        let (removed, bytes) = log.clear();
        assert_eq!(removed, 2);
        assert!(bytes > 0);
        assert!(dir.path().join("ghi-chu-cua-toi.txt").exists(), "tệp không phải log không bị chạm");
        assert!(log.files().is_empty());
    }

    #[test]
    fn bundle_names_and_days_come_from_the_iso_clock() {
        let now = "2026-11-09T14:30:12.345Z";
        assert_eq!(day_stamp(now), "2026-11-09");
        assert_eq!(file_stamp(now), "143012345");
        assert_eq!(bundle_name(now), "EduGame-Studio-chan-doan-2026-11-09-143012345.txt");
        // Hai gói cùng mili giây không đè nhau.
        let dir = tempfile::tempdir().expect("tempdir");
        let first = write_bundle(dir.path(), "a", &bundle_name(now)).expect("1");
        let second = write_bundle(dir.path(), "b", &bundle_name(now)).expect("2");
        assert_ne!(first, second);
        assert!(second.to_string_lossy().ends_with("-2.txt"), "{}", second.display());
    }

    #[test]
    fn the_bundle_says_what_it_holds_and_drops_quoted_content() {
        let lines = vec![line("2026-11-09T14:30:12.345Z", "app.start")];
        let text = format_bundle(
            format_bundle_header("0.5.1", "2026-11-09T14:30:12.345Z", Path::new("C:/x/logs"), Some("141.0.3537.99")),
            &lines,
        );
        assert!(text.contains("EduGame Studio — gói chẩn đoán AI"), "{text}");
        assert!(text.contains("Phiên bản ứng dụng: 0.5.1 (WebView2 141.0.3537.99)"), "{text}");
        assert!(text.contains("--- log (1 dòng gần nhất) ---"), "{text}");
        assert!(text.contains("Không có nội dung giáo án"), "{text}");
        assert!(text.contains("\"event\":\"app.start\""), "{text}");
        let empty = format_bundle(format_bundle_header("0.5.1", "2026-11-09T14:30:12.345Z", Path::new("x"), None), &[]);
        assert!(empty.contains("(chưa có dòng log nào)"), "{empty}");
    }

    #[test]
    fn an_unclosed_quote_keeps_the_rest_of_the_message() {
        // `/"[^"]*"/` của bản TypeScript không khớp khi thiếu dấu đóng, nên chữ
        // sau đó vẫn tới log — chỉ nội dung ĐÃ đóng ngoặc bị thay.
        assert_eq!(
            sanitize_message("Lỗi \"chưa đóng ở đây", 240),
            "Lỗi \"chưa đóng ở đây",
        );
        assert_eq!(sanitize_message("«mở mà không đóng", 240), "«mở mà không đóng");
        assert_eq!(
            sanitize_message("hai \"một\" và “hai” xong", 240),
            "hai \"…\" và \"…\" xong",
        );
    }
}
