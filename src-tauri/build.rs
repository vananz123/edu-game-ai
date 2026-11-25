/// Hai biến được phép nhúng vào binary. Chỉ hai: khoá publishable là khoá CÔNG KHAI
/// (nó nằm trong mọi request của trình duyệt tới Supabase), còn `_SERVICE_ROLE_KEY`
/// và `GEMINI_API_KEY` thì tuyệt đối không — chúng là quyền ghi toàn bộ dữ liệu và
/// tiền API. Danh sách trắng ở đây, không phải danh sách đen: thêm một tên vào là
/// một quyết định có người đọc.
const EMBEDDED: [&str; 2] = ["SUPABASE_URL", "SUPABASE_ANON_KEY"];

/// Đọc `.env` ở gốc repo (không có thì thôi). Bản cài trên máy giáo viên không có
/// `.env`, và cũng không có biến môi trường — nếu không nhúng lúc biên dịch thì
/// `auth_status` trả `configured: false` trên đúng cái máy cần đăng nhập.
fn read_dotenv() -> Vec<(String, String)> {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join(".env");
    println!("cargo:rerun-if-changed={}", path.display());
    let mut pairs = Vec::new();
    let Ok(text) = std::fs::read_to_string(&path) else { return pairs };
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') { continue; }
        let Some((key, value)) = line.split_once('=') else { continue };
        let value = value.trim().trim_matches('"').trim_matches('\'');
        if !value.is_empty() { pairs.push((key.trim().to_string(), value.to_string())); }
    }
    pairs
}

/// URL của gateway Cloud AI (#356). Khác hai biến Supabase ở chỗ **tiền tố**: biến lúc
/// chạy và biến lúc dựng đều tên `EDUGAME_AI_GATEWAY_URL`, nên nhúng thẳng tên đó thay vì
/// đi qua vòng `EDUGAME_{name}` — đi vòng thì biến lúc dựng sẽ thành `AI_GATEWAY_URL`,
/// tức hai cái tên cho một thứ, và bản cài sẽ im lặng mất Cloud AI.
///
/// Vì sao phải nhúng: `cloud.rs` đọc `option_env!("EDUGAME_AI_GATEWAY_URL")`, mà một biến
/// chỉ nằm trong môi trường của người dựng thì **không tồn tại trên máy đã cài** — đúng
/// lỗi #355 đo được (`gateway_not_configured` trên bản cài bóc hết env).
fn embed_gateway_url(dotenv: &[(String, String)]) {
    const NAME: &str = "EDUGAME_AI_GATEWAY_URL";
    println!("cargo:rerun-if-env-changed={NAME}");
    let value = std::env::var(NAME)
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .or_else(|| dotenv.iter().find(|(k, _)| k == NAME).map(|(_, v)| v.clone()));
    match value {
        Some(value) => println!("cargo:rustc-env={NAME}={}", value.trim_end_matches('/')),
        // Thiếu thì nói TO ở log dựng: bản cài này sẽ không có Cloud AI, và người dựng
        // phải biết ngay chứ không phải sau khi cài lên máy giáo viên.
        None => println!(
            "cargo:warning=EDUGAME_AI_GATEWAY_URL chưa đặt: bản dựng này KHÔNG có Cloud AI (Local AI vẫn chạy)."
        ),
    }
}

fn embed_cloud_config() {
    let dotenv = read_dotenv();
    embed_gateway_url(&dotenv);
    for name in EMBEDDED {
        // Biến môi trường của tiến trình build thắng `.env`: cho phép dựng bản thử
        // trỏ sang project Supabase khác mà không sửa tệp.
        println!("cargo:rerun-if-env-changed={name}");
        let value = std::env::var(name)
            .ok()
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty())
            .or_else(|| dotenv.iter().find(|(k, _)| k == name).map(|(_, v)| v.clone()));
        // Không có thì KHÔNG đặt biến: `option_env!` trả None, và app nói
        // "chưa cấu hình" thay vì nhúng một chuỗi rỗng.
        if let Some(value) = value {
            println!("cargo:rustc-env=EDUGAME_{name}={value}");
        }
    }
}

fn main() {
    embed_cloud_config();

    // `tauri-plugin-dialog` kéo `rfd`, mà `rfd` gọi `TaskDialogIndirect` của
    // comctl32 v6. Tauri gắn manifest mặc định của nó vào .exe ứng dụng nhưng
    // chỉ qua `rustc-link-arg-bins`, nên test executable (target lib) không có
    // manifest; Windows nạp comctl32 v5 rồi thoát với
    // STATUS_ENTRYPOINT_NOT_FOUND trước khi test đầu tiên chạy.
    //
    // Cách sửa: bảo Tauri sinh resource *không* kèm manifest (icon/version vẫn
    // còn), rồi tự gắn đúng manifest comctl32 v6 ấy cho mọi target. Bản .exe
    // ứng dụng nhận đúng nội dung manifest cũ, không thành hai resource MANIFEST
    // trùng nhau (`CVT1100: duplicate resource`).
    #[cfg(windows)]
    {
        let attributes = tauri_build::Attributes::new()
            .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest());
        tauri_build::try_build(attributes).expect("failed to run tauri-build");

        let manifest =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("windows-app-manifest.xml");
        println!("cargo:rerun-if-changed={}", manifest.display());
        println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
        println!(
            "cargo:rustc-link-arg=/MANIFESTINPUT:{}",
            manifest.display()
        );
    }

    #[cfg(not(windows))]
    tauri_build::build();
}
