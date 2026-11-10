//! Ảnh minh hoạ do giáo viên tải lên (quyết định #124) — phần TỆP của vỏ Tauri.
//!
//! Luật nhận ảnh (`ci-` + 32 hex, trần 8 MB, magic byte, câu lỗi) nằm ở
//! `src/services/storage/custom-illustration.ts`. Ở đây chép lại đúng các phép
//! kiểm ĐỒNG BỘ đó bằng Rust, vì chúng nằm trên đường nóng (mỗi lần ảnh được vẽ
//! trong một buổi học) và không cần V8:
//!
//!   • `files:import-illustration` — chọn ảnh, kiểm, ghi `images/<id>.img`;
//!   • `files:delete-illustration` — chỉ xoá id do module này sinh ra và không còn
//!     trò chơi/bản nháp nào nhắc tới;
//!   • giao thức `edugame-file://img/<id>` — chỉ phục vụ `<id>` hợp lệ nằm trong
//!     thư mục ảnh; mọi thứ khác là 404.
//!
//! Vì sao chép ảnh chứ không giữ đường dẫn gốc: tệp của giáo viên có thể bị đổi
//! tên, chuyển đi, hoặc nằm trên USB — và trò chơi đã lưu phải chơi được offline
//! nhiều tháng sau. Vì sao không `file://`: CSP chỉ cho `img-src 'self' data:
//! edugame-file:` (vỏ Tauri nới thêm host `http://edugame-file.tauri.localhost`
//! vì WebView2 không nạp được scheme tự đặt), nên một đường dẫn lưu trong dữ
//! liệu không đọc được gì khác.
//!
//! Chống trôi giữa hai bản: các bài test dưới chạy cùng bộ byte fixture với
//! `tests/unit/custom-illustration.test.ts`, và cổng `tauri-webview-check` đo
//! cả vòng đời trong app thật (nhập → id `ci-` → `<img>` nạp được → xoá → 404).

use std::path::{Path, PathBuf};

use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

use crate::library::Library;

/// Thư mục ảnh trong thư mục dữ liệu — cùng `CUSTOM_IMAGE_DIR` của `main.ts`.
pub const IMAGES_DIR: &str = "images";

/// 8 MB: ảnh cho máy chiếu, không phải thư viện ảnh.
pub const MAX_BYTES: u64 = 8 * 1024 * 1024;

/// Phần mở rộng nhận được, viết thường.
const EXTENSIONS: [&str; 5] = [".png", ".jpg", ".jpeg", ".webp", ".gif"];

/// Thư mục ảnh của một thư mục dữ liệu.
pub fn images_dir(data_dir: &Path) -> PathBuf {
    data_dir.join(IMAGES_DIR)
}

/// Đúng biểu thức `CUSTOM_IMAGE_ID` của `custom-illustration.ts`: `ci-` + 32 hex.
pub fn is_custom_image_id(value: &str) -> bool {
    let Some(hex) = value.strip_prefix("ci-") else { return false };
    hex.len() == 32 && hex.bytes().all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

/// Tên tệp đã lưu của một id; id không hợp lệ thì `None` (không bao giờ ghép đường dẫn).
fn file_name(id: &str) -> Option<String> {
    is_custom_image_id(id).then(|| format!("{id}.img"))
}

/// `path.extname(file).toLowerCase()` của Node, đủ cho tên tệp Windows và POSIX.
fn extension(name: &str) -> String {
    let base = name.rsplit(['/', '\\']).next().unwrap_or("");
    let Some(dot) = base.rfind('.') else { return String::new() };
    if dot + 1 >= base.len() {
        return String::new();
    }
    base[dot..].to_lowercase()
}

/// Chuỗi tiếng Việt của `CustomImageError` — giáo viên đọc đúng câu này.
fn custom_image_error(message: &str) -> String {
    message.to_string()
}

/// Một trong năm chữ ký của `custom-illustration.ts`; trả `(đuôi chuẩn, MIME)`.
///
/// Chỉ nhìn phần đầu tệp: một tệp 8 MB không cần đọc hết để biết nó là ảnh gì,
/// và giao thức phục vụ ảnh chỉ cần MIME — byte được ghi nguyên vẹn.
pub fn inspect(path: &Path, bytes: &[u8]) -> Result<(&'static str, &'static str), String> {
    let ext = extension(&path.to_string_lossy());
    if !EXTENSIONS.contains(&ext.as_str()) {
        return Err(custom_image_error("Chỉ nhận ảnh PNG, JPG, WEBP hoặc GIF."));
    }
    if bytes.is_empty() {
        return Err(custom_image_error("Tệp ảnh rỗng."));
    }
    if bytes.len() as u64 > MAX_BYTES {
        return Err(custom_image_error(&format!(
            "Ảnh lớn hơn {} MB — hãy chọn ảnh nhỏ hơn.",
            MAX_BYTES / (1024 * 1024)
        )));
    }
    match mime_of(bytes) {
        Some(mime) => Ok((canonical_extension(mime), mime)),
        None => Err(custom_image_error("Tệp không phải ảnh hợp lệ (đuôi tệp không khớp nội dung).")),
    }
}

fn canonical_extension(mime: &'static str) -> &'static str {
    match mime {
        "image/png" => ".png",
        "image/jpeg" => ".jpg",
        "image/webp" => ".webp",
        _ => ".gif",
    }
}

/// MIME từ magic byte — cùng năm chữ ký của `SIGNATURES` bên TypeScript.
pub fn mime_of(bytes: &[u8]) -> Option<&'static str> {
    if bytes.len() > 8 && bytes[0..4] == [0x89, 0x50, 0x4E, 0x47] {
        return Some("image/png");
    }
    if bytes.len() > 3 && bytes[0..3] == [0xFF, 0xD8, 0xFF] {
        return Some("image/jpeg");
    }
    if bytes.len() > 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        return Some("image/webp");
    }
    if bytes.len() > 6 && &bytes[0..3] == b"GIF" {
        return Some("image/gif");
    }
    None
}

/// Id ảnh ngẫu nhiên: 16 byte từ hệ điều hành (`getrandom`), 32 chữ số hex thường.
fn new_id() -> String {
    let mut bytes = [0u8; 16];
    getrandom::fill(&mut bytes).expect("hệ điều hành không cấp được số ngẫu nhiên");
    let mut id = String::with_capacity(35);
    id.push_str("ci-");
    for byte in bytes {
        id.push_str(&format!("{byte:02x}"));
    }
    id
}

/// Thư mục ảnh của bản chạy; thiếu thư viện thì không biết đường, nên báo lỗi.
fn folder(app: &AppHandle) -> Result<PathBuf, String> {
    let library = app
        .try_state::<Library>()
        .ok_or_else(|| crate::document::fail("EG_LIBRARY", "Thư viện chưa mở được: hãy khởi động lại ứng dụng."))?;
    Ok(library.images_dir())
}

/// `files:import-illustration`: `source` là đường dẫn renderer đưa (kéo thả hoặc
/// cổng kiểm tra); rỗng thì mở hộp thoại. `Null` = người dùng Huỷ.
///
/// `async` để hộp thoại không dựng bên trong lời gọi chờ (xem `picker.rs`); phần
/// đọc/ghi ảnh đi qua `picker::off_loop`.
pub async fn import(app: &AppHandle, gate: Option<PathBuf>, source: Option<&str>) -> Result<Value, String> {
    let source = source.map(str::trim).filter(|path| !path.is_empty());
    let path = match source {
        Some(path) => PathBuf::from(path),
        None => match gate {
            // Đường rỗng của cổng = pha "bấm Huỷ".
            Some(path) if path.as_os_str().is_empty() => return Ok(Value::Null),
            Some(path) => path,
            None => match crate::document::pick_illustration(app).await {
                Some(path) => path,
                None => return Ok(Value::Null),
            },
        },
    };
    let folder = folder(app)?;
    crate::picker::io(move || import_path(&folder, &path)).await
}

/// Nửa sau của `import`, tách ra để test gọi thẳng với fixture. Nhận THƯ MỤC
/// ảnh thay vì `AppHandle`: phần này chạy trên luồng chặn, nơi state không nhìn
/// thấy.
pub(crate) fn import_path(folder: &Path, path: &Path) -> Result<Value, String> {
    let meta = std::fs::metadata(path).map_err(|error| {
        crate::document::fail("EG_FILE", format!("không đọc được {}: {error}", path.display()))
    })?;
    if !meta.is_file() {
        return Err(crate::document::fail("EG_FILE", format!("{} không phải tệp", path.display())));
    }
    if meta.len() > MAX_BYTES {
        return Err(custom_image_error(&format!(
            "Ảnh lớn hơn {} MB — hãy chọn ảnh nhỏ hơn.",
            MAX_BYTES / (1024 * 1024)
        )));
    }
    let bytes = std::fs::read(path)
        .map_err(|error| crate::document::fail("EG_FILE", format!("không đọc được {}: {error}", path.display())))?;
    // Đuôi, kích thước và magic byte đều được kiểm: một `.exe` đổi tên bị từ chối.
    let (ext, _) = inspect(path, &bytes)?;
    let id = new_id();
    let file = file_name(&id).expect("id vừa sinh đúng dạng");
    std::fs::create_dir_all(folder)
        .map_err(|error| crate::document::fail("EG_WRITE", format!("không tạo được {}: {error}", folder.display())))?;
    std::fs::write(folder.join(&file), &bytes)
        .map_err(|error| crate::document::fail("EG_WRITE", format!("không ghi được ảnh: {error}")))?;
    Ok(json!({ "id": id, "bytes": bytes.len(), "format": ext }))
}

/// `files:delete-illustration`: `{ok:false}` với id lạ (một đường dẫn không bao
/// giờ tới được đây), `{ok:false, inUse:true}` khi còn trò chơi/bản nháp nhắc
/// tới, `{ok:true}` khi đã xoá.
pub fn delete(app: &AppHandle, image_id: Option<&Value>) -> Result<Value, String> {
    let folder = folder(app)?;
    let id = image_id.and_then(Value::as_str).unwrap_or("");
    let Some(file) = file_name(id) else {
        return Ok(json!({ "ok": false }));
    };
    let library = app
        .try_state::<Library>()
        .ok_or_else(|| crate::document::fail("EG_LIBRARY", "Thư viện chưa mở được: hãy khởi động lại ứng dụng."))?;
    // #127: không bao giờ xoá ảnh mà một trò chơi đã lưu hoặc một bản nháp còn trỏ
    // tới — "Tự động" ở một thẻ không được làm trống thẻ khác.
    if library.referenced_images().iter().any(|kept| kept == id) {
        return Ok(json!({ "ok": false, "inUse": true }));
    }
    match std::fs::remove_file(folder.join(&file)) {
        Ok(()) => Ok(json!({ "ok": true })),
        // `fs.rm(…, {force: true})` của Electron không lỗi khi tệp không còn.
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(json!({ "ok": true })),
        Err(_) => Ok(json!({ "ok": false })),
    }
}

/// Kết quả phục vụ một URL `edugame-file:`: byte + MIME, hoặc `None` = 404.
pub struct ImageResponse {
    pub bytes: Vec<u8>,
    pub mime: &'static str,
}

/// Phần đường dẫn đã giải mã thành id hợp lệ, rồi đường dẫn tệp trong thư mục.
///
/// Ba lớp, đúng như handler `edugame-file` của `main.ts`: id phải do module này
/// sinh ra; đường dẫn phải nằm trong thư mục ảnh; byte phải mang chữ ký ảnh.
/// Id chỉ chứa `[a-z0-9-]`, nên đường dẫn không thể thoát khỏi thư mục — phép
/// so tiền tố là lớp thứ hai, không phải lớp duy nhất.
pub fn read_image(folder: &Path, request_path: &str) -> Option<ImageResponse> {
    let decoded = percent_decode(request_path.trim_start_matches('/'));
    let base = decoded.rsplit(['/', '\\']).next().unwrap_or("");
    let id = base.strip_suffix(".img").unwrap_or(base);
    let file = file_name(id)?;
    let target = folder.join(&file);
    let inside = std::fs::canonicalize(&target).ok()?;
    let root = std::fs::canonicalize(folder).ok()?;
    if !inside.starts_with(&root) {
        return None;
    }
    let bytes = std::fs::read(&inside).ok()?;
    let mime = mime_of(&bytes)?;
    Some(ImageResponse { bytes, mime })
}

/// `decodeURIComponent` của JavaScript, đủ cho đường dẫn (UTF-8, `%XX`).
fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[index + 1..index + 3]).ok();
            if let Some(byte) = hex.and_then(|hex| u8::from_str_radix(hex, 16).ok()) {
                out.push(byte);
                index += 3;
                continue;
            }
        }
        out.push(bytes[index]);
        index += 1;
    }
    String::from_utf8(out).unwrap_or_else(|_| value.to_string())
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

    #[test]
    fn ids_have_the_exact_shape_the_renderer_accepts() {
        let id = new_id();
        assert!(is_custom_image_id(&id), "{id}");
        assert_eq!(id.len(), 35);
        assert!(!is_custom_image_id("ci-ABCDEF0123456789ABCDEF0123456789"), "hex phải thường");
        assert!(!is_custom_image_id("ci-0123"));
        assert!(!is_custom_image_id("../../edugame.sqlite"));
        assert!(file_name("../x").is_none(), "đường dẫn không bao giờ được ghép từ id lạ");
        assert_ne!(new_id(), new_id(), "hai lượt phải khác nhau");
    }

    #[test]
    fn a_real_png_is_accepted_and_a_renamed_one_is_not() {
        let bytes = std::fs::read(fixture("anh-minh-hoa.png")).expect("fixture");
        let (ext, mime) = inspect(Path::new("C:\\x\\Anh.PNG"), &bytes).expect("png");
        assert_eq!((ext, mime), (".png", "image/png"));
        // Cùng byte nhưng đuôi lạ: từ chối trước khi soi nội dung.
        let error = inspect(Path::new("anh-minh-hoa.exe"), &bytes).expect_err("exe");
        assert!(error.contains("Chỉ nhận ảnh PNG, JPG, WEBP hoặc GIF."), "{error}");
        // Đuôi ảnh nhưng nội dung không phải ảnh: đúng câu của `inspectCustomImage`.
        let error = inspect(Path::new("anh-gia.png"), b"MZ khong phai anh").expect_err("giả");
        assert!(error.contains("không phải ảnh hợp lệ"), "{error}");
        let error = inspect(Path::new("rong.png"), b"").expect_err("rỗng");
        assert!(error.contains("Tệp ảnh rỗng."), "{error}");
    }

    #[test]
    fn jpeg_and_gif_spell_their_canonical_extension() {
        let jpeg = [0xFF, 0xD8, 0xFF, 0xE0, 0, 0, 0, 0, 0];
        assert_eq!(inspect(Path::new("a.jpeg"), &jpeg).expect("jpeg").0, ".jpg");
        let gif = b"GIF89a....";
        assert_eq!(inspect(Path::new("a.gif"), &gif[..]).expect("gif").0, ".gif");
        let webp = b"RIFF____WEBPVP8 ";
        assert_eq!(mime_of(webp), Some("image/webp"));
    }

    #[test]
    fn the_protocol_serves_only_valid_ids_inside_the_folder() {
        let dir = tempfile::tempdir().expect("tempdir");
        let folder = dir.path().join(IMAGES_DIR);
        std::fs::create_dir_all(&folder).expect("mkdir");
        let id = new_id();
        std::fs::write(folder.join(format!("{id}.img")), std::fs::read(fixture("anh-minh-hoa.png")).expect("fixture")).expect("write");
        // Đường dẫn đã giải mã và chưa giải mã đều ra cùng một ảnh.
        let plain = read_image(&folder, &format!("img/{id}")).expect("id hợp lệ");
        assert_eq!(plain.mime, "image/png");
        let encoded = read_image(&folder, &format!("/img/{}", id.replace('-', "%2D"))).expect("id mã hoá");
        assert_eq!(encoded.mime, "image/png");
        // Mọi thứ khác là 404: id lạ, đường dẫn thoát thư mục, tệp ngoài thư mục ảnh.
        assert!(read_image(&folder, "img/..%2F..%2Fedugame.sqlite").is_none());
        assert!(read_image(&folder, "img/khong-phai-id").is_none());
        assert!(read_image(&folder, &format!("img/{}", "ci-00000000000000000000000000000000")).is_none());
        // Tệp có TÊN đúng nhưng nội dung không phải ảnh cũng không được phục vụ.
        let fake = new_id();
        std::fs::write(folder.join(format!("{fake}.img")), b"khong phai anh").expect("write");
        assert!(read_image(&folder, &format!("img/{fake}")).is_none());
    }

    #[test]
    fn percent_decoding_matches_decode_uri_component_on_paths() {
        assert_eq!(percent_decode("img%2Dci"), "img-ci");
        assert_eq!(percent_decode("a%20b"), "a b");
        assert_eq!(percent_decode("100%"), "100%", "phần trăm lẻ giữ nguyên");
        assert_eq!(percent_decode("%zz"), "%zz", "hex hỏng giữ nguyên");
    }
}
