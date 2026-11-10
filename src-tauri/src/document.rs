//! Ba kênh nhập tệp của vỏ Tauri: tài liệu (giáo án), bảng câu hỏi, và tệp
//! theo đường dẫn renderer đưa.
//!
//! Ranh giới giống nhóm `files:*` của gói `.egame`:
//!
//!   • LUẬT đọc tệp (năm định dạng của `main.ts`, bộ đọc bảng tính của
//!     `question-import.ts`) là mã TypeScript trong V8 nhúng — slot `EGFILES`,
//!     `src-tauri/src/embedded/files-ops.ts`;
//!   • TỆP là của tệp này: hộp thoại của tiến trình, đọc byte, trần kích thước
//!     trước khi đọc. Frontend Tauri không có quyền `dialog:`/`fs:`, nên đường
//!     dẫn của hộp thoại không bao giờ đi qua renderer.
//!
//! Kênh `files:import-document-from-path` nhận đường dẫn từ renderer (kéo thả)
//! đúng như bản Electron. Đó là đường DUY NHẤT ở đây mà renderer đề xuất đường
//! dẫn, nên nó kiểm phần mở rộng TRƯỚC khi mở tệp: một đường dẫn lạ không đọc
//! được byte nào. Ba đường còn lại hỏi hộp thoại của tiến trình.

use std::path::{Path, PathBuf};

use serde_json::Value;
use tauri::{AppHandle, Manager};

use crate::library::Library;

/// Đường dẫn của cổng kiểm tra cho hai hộp thoại nhập: tiến trình cha đặt, renderer
/// chỉ chọn được SỐ lượt (`files:gate-turn`), y như bộ đếm của `package.rs`.
pub const GATE_ENV: &str = "EDUGAME_TAURI_FILES";
/// Mỗi lượt sau dùng một biến đường dẫn khác; thứ tự = thứ tự bộ đếm 1..N.
const GATE_DOCUMENT_TURNS: [&str; 8] = [
    "EDUGAME_TAURI_FILES_DOCUMENT",
    "EDUGAME_TAURI_FILES_DOCUMENT_2",
    "EDUGAME_TAURI_FILES_DOCUMENT_3",
    "EDUGAME_TAURI_FILES_DOCUMENT_4",
    "EDUGAME_TAURI_FILES_DOCUMENT_5",
    "EDUGAME_TAURI_FILES_DOCUMENT_6",
    "EDUGAME_TAURI_FILES_DOCUMENT_7",
    "EDUGAME_TAURI_FILES_DOCUMENT_8",
];
/// Bảng câu hỏi: ba định dạng, rồi `.xls` bị từ chối và đường rỗng = Huỷ.
const GATE_QUESTIONS_TURNS: [&str; 5] = [
    "EDUGAME_TAURI_FILES_QUESTIONS",
    "EDUGAME_TAURI_FILES_QUESTIONS_2",
    "EDUGAME_TAURI_FILES_QUESTIONS_3",
    "EDUGAME_TAURI_FILES_QUESTIONS_4",
    "EDUGAME_TAURI_FILES_QUESTIONS_5",
];
/// Ảnh: PNG hợp lệ, đuôi lạ chứa cùng byte, "ảnh" chỉ mang tên ảnh.
const GATE_ILLUSTRATION_TURNS: [&str; 3] = [
    "EDUGAME_TAURI_FILES_ILLUSTRATION",
    "EDUGAME_TAURI_FILES_ILLUSTRATION_2",
    "EDUGAME_TAURI_FILES_ILLUSTRATION_3",
];

/// Đường dẫn renderer tối đa nhận ở kênh "theo đường dẫn": đường dài hơn thế
/// không phải tệp của người dùng.
const MAX_PATH_CHARS: usize = 4096;

/// Mã lỗi ở đầu câu: cổng kiểm tra và façade renderer phân biệt lỗi của tệp
/// (`EG_FILE*`) với lỗi luật đọc (`EG_DOCUMENT`) và lỗi của vỏ (`EG_LIBRARY`).
pub(crate) fn fail(code: &str, message: impl AsRef<str>) -> String {
    format!("{code}: {}", message.as_ref())
}

fn library(app: &AppHandle) -> Result<tauri::State<'_, Library>, String> {
    app.try_state::<Library>()
        .ok_or_else(|| fail("EG_LIBRARY", "Thư viện chưa mở được: hãy khởi động lại ứng dụng."))
}

/// Đường dẫn hộp thoại của cổng cho lượt đếm `turn` (1-based). Chỉ có giá trị khi
/// `EDUGAME_TAURI_FILES=gate`; bản phát hành luôn trả `None`.
pub fn gate_target(turn: u64, names: &[&str]) -> Option<PathBuf> {
    if std::env::var(GATE_ENV).map(|value| value != "gate").unwrap_or(true) {
        return None;
    }
    let index = usize::try_from(turn.checked_sub(1)?).ok()?;
    let name = names.get(index)?;
    std::env::var_os(name).map(PathBuf::from)
}

/// Đặt bộ đếm lượt hộp thoại — chỉ cổng kiểm tra gọi. Renderer chọn được SỐ,
/// không chọn được đường dẫn (mọi biến đường dẫn do tiến trình cha đặt).
pub fn set_gate_turn(value: Option<&Value>) -> Result<Value, String> {
    if std::env::var(GATE_ENV).map(|value| value != "gate").unwrap_or(true) {
        return Err(fail("EG_GATE", "bộ đếm hộp thoại chỉ dùng cho cổng kiểm tra"));
    }
    let turn = value
        .and_then(Value::as_u64)
        .filter(|turn| (1..=16).contains(turn))
        .ok_or_else(|| fail("EG_GATE", "bộ đếm phải là số từ 1 tới 16"))?;
    let turn = turn.to_string();
    // SAFETY: chỉ nhánh cổng kiểm tra chạy tới đây; ở bản phát hành hàm trả lỗi
    // trước khi đụng biến môi trường. Không luồng nào khác đọc/ghi biến này cùng lúc.
    unsafe { std::env::set_var("EDUGAME_TAURI_FILES_NEXT", &turn) };
    Ok(Value::from(turn))
}

fn gate_turn() -> u64 {
    std::env::var("EDUGAME_TAURI_FILES_NEXT")
        .ok()
        .and_then(|value| value.trim().parse::<u64>().ok())
        .unwrap_or(1)
}

/// Phần mở rộng thường hoá, có dấu chấm; `""` khi tên không có dấu chấm.
fn extension(value: &str) -> String {
    let name = value.rsplit(['/', '\\']).next().unwrap_or("");
    match name.rfind('.') {
        Some(dot) if dot + 1 < name.len() && !name[dot + 1..].contains('.') => name[dot..].to_lowercase(),
        _ => String::new(),
    }
}

/// Năm định dạng của `main.ts`; cùng danh sách với `SUPPORTED` của `files-ops.ts`.
fn is_supported_document(path: &Path) -> bool {
    let ext = extension(&path.to_string_lossy());
    ext == ".txt" || ext == ".md" || ext == ".docx" || ext == ".pdf" || ext == ".pptx"
}

fn is_supported_questions(path: &Path) -> bool {
    matches!(extension(&path.to_string_lossy()).as_str(), ".csv" | ".tsv" | ".xlsx")
}

/// Đọc byte một tệp thường kèm trần kích thước. Tệp lớn hơn trần bị từ chối
/// TRƯỚC khi đọc: một tệp vài GB không được đi vào bộ nhớ để rồi bị cắt.
fn read_bytes(path: &Path, limit: u64, code: &str, unit: &str) -> Result<Vec<u8>, String> {
    let meta = std::fs::metadata(path)
        .map_err(|error| fail("EG_FILE", format!("không đọc được {}: {error}", path.display())))?;
    if !meta.is_file() {
        return Err(fail("EG_FILE", format!("{} không phải tệp thường", path.display())));
    }
    if meta.len() > limit {
        let asked = limit / (1024 * 1024);
        return Err(fail(code, format!("Tệp lớn hơn {asked} MB (trần của {unit}) — có thể đã chọn nhầm tệp.")));
    }
    std::fs::read(path).map_err(|error| fail("EG_FILE", format!("không đọc được {}: {error}", path.display())))
}

/// Đường dẫn của cổng, nếu tiến trình cha đã đặt cho lượt này. `None` ở đây
/// nghĩa là "phải hỏi hộp thoại", KHÔNG phải "người dùng Huỷ" — nên nó tách
/// thành `Option<Option<PathBuf>>`: đường rỗng của cổng là Huỷ (`Some(None)`),
/// còn không có đường nào là hỏi (`None`).
pub(crate) fn gate_path(turn: u64, names: &[&str]) -> Option<Option<PathBuf>> {
    gate_target(turn, names).map(|path| if path.as_os_str().is_empty() { None } else { Some(path) })
}

/// Hỏi hộp thoại rồi chờ giáo viên chọn. Chỉ phần "hỏi" — phần "đọc" nằm ở
/// `*_bytes`, nên test gọi thẳng nửa sau với fixture mà không cần cửa sổ.
pub(crate) async fn pick_document(app: &AppHandle) -> Option<PathBuf> {
    crate::picker::pick(
        app,
        "Chọn giáo án hoặc tài liệu",
        &[
            ("Tài liệu hỗ trợ", &["txt", "md", "docx", "pdf", "pptx"]),
            ("Tất cả tệp", &["*"]),
        ],
    )
    .await
}

pub(crate) async fn pick_questions(app: &AppHandle) -> Option<PathBuf> {
    crate::picker::pick(
        app,
        "Nhập câu hỏi từ bảng tính",
        &[("Bảng câu hỏi", &["csv", "tsv", "xlsx"])],
    )
    .await
}

pub(crate) async fn pick_illustration(app: &AppHandle) -> Option<PathBuf> {
    crate::picker::pick(
        app,
        "Chọn ảnh minh hoạ cho câu hỏi",
        &[("Ảnh (PNG, JPG, WEBP, GIF)", &["png", "jpg", "jpeg", "webp", "gif"])],
    )
    .await
}

/// `files:import-document`: chọn tệp, đọc byte, để V8 đọc chữ. `Null` = Huỷ.
///
/// `async` để hộp thoại không dựng bên trong lời gọi chờ (xem `picker.rs`). Chỉ
/// phần ĐỌC đi sang luồng chặn; lượt gọi V8 chờ ở đây, vì `spawn_blocking` không
/// thấy state thư viện.
pub async fn import_document(app: &AppHandle) -> Result<Value, String> {
    let path = match gate_path(gate_turn(), &GATE_DOCUMENT_TURNS) {
        Some(Some(path)) => path,
        Some(None) => return Ok(Value::Null),
        None => match pick_document(app).await {
            Some(path) => path,
            None => return Ok(Value::Null),
        },
    };
    let (path, bytes) = read_bytes_off_loop(path, import_limit(app, "files:max-bytes"), "tài liệu").await?;
    let library = library(app)?;
    import_bytes(&library, &path, &bytes, false)
}

/// Lấy đường dẫn + byte của một tệp người dùng: `metadata` và `read` sang luồng
/// chặn (không chạm state), còn trần kích thước do bên gọi đọc từ V8.
async fn read_bytes_off_loop(path: PathBuf, limit: u64, unit: &'static str) -> Result<(PathBuf, Vec<u8>), String> {
    let read = path.clone();
    let bytes = crate::picker::io(move || {
        let meta = std::fs::metadata(&read)
            .map_err(|error| fail("EG_FILE", format!("không đọc được {}: {error}", read.display())))?;
        if !meta.is_file() {
            return Err(fail("EG_FILE", format!("{} không phải tệp thường", read.display())));
        }
        read_bytes(&read, limit, "EG_TOO_LARGE", unit)
    })
    .await?;
    Ok((path, bytes))
}

/// Nửa sau của lượt nhập, tách ra để test gọi thẳng với fixture.
fn import_bytes(library: &Library, path: &Path, bytes: &[u8], with_size: bool) -> Result<Value, String> {
    let name = path.display().to_string();
    let encoded = crate::base64::encode(bytes);
    let op = if with_size { "files:import-document-from-path" } else { "files:import-document" };
    let mut args = vec![Value::String(name), Value::String(encoded)];
    if with_size {
        args.push(Value::from(bytes.len() as u64));
    }
    library.call(op, &args).map_err(|error| fail("EG_DOCUMENT", error.to_string()))
}

/// `files:import-document-from-path`: đường dẫn do renderer đưa (kéo thả).
///
/// Phần mở rộng bị kiểm TRƯỚC `metadata`: một đường dẫn lạ trả câu "chưa hỗ trợ"
/// giống bản Electron mà không chạm đĩa. Đường rỗng = Huỷ (`Null`), như Electron.
pub fn import_document_from_path(app: &AppHandle, file_path: Option<&Value>) -> Result<Value, String> {
    let library = library(app)?;
    let target = file_path.and_then(Value::as_str).unwrap_or("").trim();
    if target.is_empty() {
        return Ok(Value::Null);
    }
    if target.chars().count() > MAX_PATH_CHARS {
        return Err(fail("EG_PATH", "đường dẫn tệp quá dài"));
    }
    let path = PathBuf::from(target);
    if !is_supported_document(&path) {
        return Err(fail("EG_DOCUMENT", "Định dạng này chưa được hỗ trợ."));
    }
    let limit = import_limit(app, "files:max-bytes");
    let bytes = read_bytes(&path, limit, "EG_TOO_LARGE", "tài liệu")?;
    import_bytes(&library, &path, &bytes, true)
}

/// `files:import-questions`: chọn bảng tính, để V8 đọc câu hỏi.
pub async fn import_questions(app: &AppHandle) -> Result<Value, String> {
    let path = match gate_path(gate_turn(), &GATE_QUESTIONS_TURNS) {
        Some(Some(path)) => path,
        Some(None) => return Ok(Value::Null),
        None => match pick_questions(app).await {
            Some(path) => path,
            None => return Ok(Value::Null),
        },
    };
    // Đuôi tệp bị kiểm TRƯỚC khi đọc: một bảng tính ↔ tài liệu lẫn nhau không
    // được đọc thành công rồi hỏng trong V8.
    if !is_supported_questions(&path) {
        return Err(fail("EG_DOCUMENT", "Chỉ hỗ trợ tệp CSV, TSV hoặc XLSX."));
    }
    let (path, bytes) = read_bytes_off_loop(path, import_limit(app, "files:questions-max-bytes"), "bảng câu hỏi").await?;
    let encoded = crate::base64::encode(&bytes);
    library(app)?
        .call("files:import-questions", &[Value::String(path.display().to_string()), Value::String(encoded)])
        .map_err(|error| fail("EG_DOCUMENT", error.to_string()))
}

/// Trần kích thước nhập, đọc từ chính bundle (`DOCUMENT_MAX`/`QUESTIONS_MAX` của
/// `files-ops.ts` / `question-import.ts`) thay vì gõ lại 10 MB ở hai nơi.
const MAX_BYTES_FALLBACK: u64 = 10 * 1024 * 1024;

fn import_limit(app: &AppHandle, op: &str) -> u64 {
    app.try_state::<Library>()
        .and_then(|library| library.files_op(op))
        .and_then(|value| value.as_u64())
        .unwrap_or(MAX_BYTES_FALLBACK)
}

/// Đường dẫn hộp thoại của ảnh minh hoạ (cùng bộ đếm với hai hộp thoại trên).
pub(crate) fn illustration_gate_target() -> Option<PathBuf> {
    gate_target(gate_turn(), &GATE_ILLUSTRATION_TURNS)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(name: &str) -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("tests")
            .join("fixtures")
            .join("tauri-import")
            .join(name)
    }

    fn library() -> (tempfile::TempDir, Library) {
        let dir = tempfile::tempdir().expect("tempdir");
        let library = Library::open(dir.path()).expect("thư viện");
        (dir, library)
    }

    #[test]
    fn extensions_are_read_like_path_extname() {
        assert_eq!(extension("C:\\Users\\cô\\Giáo án.DOCX"), ".docx");
        assert_eq!(extension("/tmp/a/b.tar.gz"), ".gz");
        assert_eq!(extension("khong-co-duoi"), "");
        assert_eq!(extension("ket-thuc-bang."), "");
        assert!(is_supported_document(Path::new("x/y/Bài.PDF")));
        assert!(!is_supported_document(Path::new("x/y/bang.xls")));
        assert!(is_supported_questions(Path::new("cau-hoi.xlsx")));
        assert!(!is_supported_questions(Path::new("cau-hoi.pdf")));
    }

    #[test]
    fn every_document_format_reaches_the_same_typescript_reader() {
        // Cùng đường `files-ops.ts` mà test của `embedded.rs` đo từng định dạng;
        // ở đây đo phần Rust: đọc byte của tệp thật rồi gửi sang V8, nhận lại
        // `{name, path, text, characters}`.
        let (_dir, library) = library();
        for name in ["giao-an.txt", "giao-an.md", "bai-hoc.docx", "bai-giang.pptx", "giao-an.pdf"] {
            let path = fixture(name);
            let bytes = std::fs::read(&path).unwrap_or_else(|error| panic!("thiếu fixture {name}: {error}"));
            let answer = import_bytes(&library, &path, &bytes, false).unwrap_or_else(|error| panic!("{name}: {error}"));
            assert_eq!(answer["name"], name, "{name}");
            assert!(answer["characters"].as_u64().unwrap_or(0) > 0, "{name}: {answer}");
        }
    }

    #[test]
    fn a_question_sheet_is_read_by_the_electron_parser_inside_v8() {
        let (_dir, library) = library();
        for name in ["cau-hoi.csv", "cau-hoi.tsv", "cau-hoi.xlsx"] {
            let path = fixture(name);
            let bytes = std::fs::read(&path).expect("fixture");
            let encoded = crate::base64::encode(&bytes);
            let answer = library
                .call("files:import-questions", &[Value::String(name.to_string()), Value::String(encoded)])
                .unwrap_or_else(|error| panic!("{name}: {error}"));
            assert_eq!(answer["name"], name, "{name}");
            let questions = answer["questions"].as_array().cloned().unwrap_or_default();
            assert!(!questions.is_empty(), "{name}: {answer}");
            assert!(questions[0]["prompt"].as_str().unwrap_or("").len() > 0, "{name}: {answer}");
        }
    }

    #[test]
    fn a_wrong_file_is_refused_with_a_sentence_the_teacher_can_read() {
        let (_dir, library) = library();
        // Đuôi lạ: luật của `files-ops.ts` trả câu của `main.ts`.
        let path = fixture("bang-tinh.xls");
        let bytes = std::fs::read(&path).expect("fixture");
        let error = import_bytes(&library, &path, &bytes, false).expect_err("xls");
        assert!(error.contains("Định dạng này chưa được hỗ trợ."), "{error}");
        // Tệp PDF hỏng: lỗi của pdf.js, không phải một lượt treo.
        let path = fixture("hong.pdf");
        let bytes = std::fs::read(&path).expect("fixture");
        let error = import_bytes(&library, &path, &bytes, false).expect_err("pdf hỏng");
        assert!(error.starts_with("EG_DOCUMENT: "), "{error}");
    }

    #[test]
    fn the_path_channel_checks_the_extension_before_touching_the_disk() {
        // Không có `AppHandle`: đường mở rộng lạ bị từ chối TRƯỚC `metadata`, nên
        // một đường dẫn không tồn tại vẫn ra câu "chưa hỗ trợ" chứ không phải lỗi
        // đọc tệp — đúng thứ tự của `files:import-document-from-path` bên Electron.
        let error = read_bytes(Path::new("khong-co-that.xls"), 1024, "EG_TOO_LARGE", "tài liệu")
            .expect_err("không tồn tại");
        assert!(error.starts_with("EG_FILE: "), "{error}");
    }

    #[test]
    fn an_oversized_file_is_refused_before_its_bytes_are_read() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("giao-an.txt");
        std::fs::write(&path, vec![b'a'; 2048]).expect("write");
        let error = read_bytes(&path, 1024, "EG_TOO_LARGE", "tài liệu").expect_err("quá lớn");
        assert!(error.starts_with("EG_TOO_LARGE: "), "{error}");
        assert!(error.contains("0 MB") || error.contains("1 MB"), "{error}");
        assert_eq!(read_bytes(&path, 4096, "EG_TOO_LARGE", "tài liệu").expect("vừa").len(), 2048);
    }

    #[test]
    fn gate_turn_one_maps_to_the_first_name_and_out_of_range_is_none() {
        // Bộ đếm 1-based: lượt 1 → tên đầu tiên. Lệch một ở đây từng khiến cổng
        // kiểm tra rơi về hộp thoại thật và treo cửa sổ, nên chốt bằng test.
        static ENV: std::sync::Mutex<()> = std::sync::Mutex::new(());
        let _guard = ENV.lock().unwrap_or_else(|error| error.into_inner());
        let names = GATE_DOCUMENT_TURNS;
        // SAFETY: `ENV` giữ mọi test khác không đọc/ghi biến môi trường cùng lúc.
        unsafe { std::env::set_var(GATE_ENV, "gate") };
        unsafe { std::env::set_var(names[0], "a.txt") };
        assert_eq!(gate_path(1, &names), Some(Some(PathBuf::from("a.txt"))));
        assert_eq!(gate_path(2, &names), None);
        assert_eq!(gate_path(0, &names), None);
        assert_eq!(gate_path(u64::MAX, &names), None);
        assert_eq!(gate_path(9, &names), None);
        // SAFETY: như trên — biến chỉ do test này đặt.
        unsafe { std::env::set_var(names[0], "") };
        assert_eq!(gate_path(1, &names), Some(None));
        unsafe { std::env::remove_var(names[0]) };
        unsafe { std::env::remove_var(GATE_ENV) };
        assert_eq!(gate_path(1, &names), None);
    }

    #[test]
    fn every_gate_turn_has_a_path_key_up_to_the_last_one_the_check_uses() {
        // Tiến trình cha đặt một biến cho MỖI lượt. Một lượt vượt bảng khoá không
        // báo lỗi mà rơi về `None` = mở hộp thoại thật, và cổng kiểm treo. Ba bảng
        // này phải khớp `filePaths` của `scripts/build-tauri-release.js`.
        assert_eq!(GATE_DOCUMENT_TURNS.len(), 8);
        assert_eq!(GATE_QUESTIONS_TURNS.len(), 5);
        assert_eq!(GATE_ILLUSTRATION_TURNS.len(), 3);
        for names in [&GATE_DOCUMENT_TURNS[..], &GATE_QUESTIONS_TURNS[..], &GATE_ILLUSTRATION_TURNS[..]] {
            for turn in 1..=names.len() as u64 {
                assert!(gate_target(turn, names).is_none(), "lượt {turn} phải có khoá trong {names:?}");
            }
        }
    }
}
