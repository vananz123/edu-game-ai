use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter};

pub const EDUGAME_DESCRIPTION: &str =
    "Ứng dụng Windows giúp giáo viên tạo, quản lý và chơi game giáo dục — game đã lưu chạy được không cần internet.";
pub const EDUGAME_RELEASE_PAGE_URL: &str =
    "https://github.com/vananz123/edu-game-ai/releases";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UpdateState {
    pub phase: String,
    pub current_version: String,
    pub new_version: String,
    pub progress_percent: f64,
    pub transferred_bytes: u64,
    pub total_bytes: u64,
    pub bytes_per_second: u64,
    pub error_kind: String,
    pub error_message: String,
    pub last_checked_at: u64,
    pub download_started_at: u64,
}

static CURRENT_STATE: OnceLock<Mutex<UpdateState>> = OnceLock::new();

fn initial_state() -> UpdateState {
    let is_dev = cfg!(debug_assertions);
    let current_version = env!("CARGO_PKG_VERSION").to_string();
    if is_dev {
        UpdateState {
            phase: "error".into(),
            current_version,
            new_version: "".into(),
            progress_percent: 0.0,
            transferred_bytes: 0,
            total_bytes: 0,
            bytes_per_second: 0,
            error_kind: "dev-mode".into(),
            error_message: "Bản bạn đang chạy không phải bộ cài đặt (nó chạy từ mã nguồn), nên không thể tự cập nhật. Hãy tải bộ cài .exe từ trang phát hành và cài bình thường.".into(),
            last_checked_at: 0,
            download_started_at: 0,
        }
    } else {
        UpdateState {
            phase: "idle".into(),
            current_version,
            new_version: "".into(),
            progress_percent: 0.0,
            transferred_bytes: 0,
            total_bytes: 0,
            bytes_per_second: 0,
            error_kind: "".into(),
            error_message: "".into(),
            last_checked_at: 0,
            download_started_at: 0,
        }
    }
}

fn state_mutex() -> &'static Mutex<UpdateState> {
    CURRENT_STATE.get_or_init(|| Mutex::new(initial_state()))
}

pub fn parse_version(s: &str) -> Option<(u64, u64, u64)> {
    let clean = s.trim().trim_start_matches(|c| c == 'v' || c == 'V');
    let mut parts = clean.split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next()?.parse().ok()?;
    let patch = parts.next().unwrap_or("0").split('-').next()?.parse().ok()?;
    Some((major, minor, patch))
}

pub fn is_newer_version(candidate: &str, current: &str) -> bool {
    match (parse_version(candidate), parse_version(current)) {
        (Some(c), Some(cur)) => c > cur,
        _ => false,
    }
}

pub async fn open(app: AppHandle) -> Result<Value, String> {
    let current_state = {
        let guard = state_mutex().lock().map_err(|_| "khoá bận".to_string())?;
        serde_json::to_value(&*guard).map_err(|e| e.to_string())?
    };
    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        let _ = check(app_clone).await;
    });
    Ok(json!({ "ok": true, "state": current_state }))
}

pub fn info(app: &AppHandle) -> Result<Value, String> {
    let current_version = env!("CARGO_PKG_VERSION");
    let is_packaged = !cfg!(debug_assertions);
    let user_data = crate::paths::data_dir(app)?.display().to_string();
    Ok(json!({
        "name": "EduGame Studio",
        "version": current_version,
        "description": EDUGAME_DESCRIPTION,
        "author": "EduGame Studio",
        "license": "MIT",
        "packaged": is_packaged,
        "electron": "",
        "chrome": "WebView2",
        "node": "",
        "platform": "win32",
        "arch": "x64",
        "userDataPath": user_data,
        "releasePageUrl": EDUGAME_RELEASE_PAGE_URL,
    }))
}

pub fn state(_app: &AppHandle) -> Result<Value, String> {
    let guard = state_mutex().lock().map_err(|_| "khoá bận".to_string())?;
    serde_json::to_value(&*guard).map_err(|e| e.to_string())
}

pub async fn check(app: AppHandle) -> Result<Value, String> {
    let current_version = env!("CARGO_PKG_VERSION");
    let is_dev = cfg!(debug_assertions);
    if is_dev {
        let state_val = {
            let mut guard = state_mutex().lock().map_err(|_| "khoá bận".to_string())?;
            guard.phase = "error".into();
            guard.error_kind = "dev-mode".into();
            guard.error_message = "Bản bạn đang chạy không phải bộ cài đặt (nó chạy từ mã nguồn), nên không thể tự cập nhật. Hãy tải bộ cài .exe từ trang phát hành và cài bình thường.".into();
            serde_json::to_value(&*guard).map_err(|e| e.to_string())?
        };
        let _ = app.emit("about:state-push", &state_val);
        return Ok(json!({ "ok": true, "state": state_val }));
    }

    {
        let mut guard = state_mutex().lock().map_err(|_| "khoá bận".to_string())?;
        guard.phase = "checking".into();
        guard.error_kind = "".into();
        guard.error_message = "".into();
        let _ = app.emit("about:state-push", &serde_json::to_value(&*guard).unwrap_or(Value::Null));
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .user_agent(format!("edugame-studio/{current_version}"))
        .build()
        .map_err(|e| e.to_string())?;

    let (status_res, body_text) = match client
        .get("https://api.github.com/repos/vananz123/edu-game-ai/releases/latest")
        .header(reqwest::header::ACCEPT, "application/vnd.github.v3+json")
        .send()
        .await
    {
        Ok(r) => {
            let s = r.status();
            let txt = r.text().await.unwrap_or_default();
            (Ok(s), txt)
        }
        Err(e) => (Err(e.to_string()), String::new()),
    };

    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    let state_val = {
        let mut guard = state_mutex().lock().map_err(|_| "khoá bận".to_string())?;
        guard.last_checked_at = now_ms;

        match status_res {
            Err(e) => {
                guard.phase = "error".into();
                guard.error_kind = "offline".into();
                guard.error_message = format!("Không thể kết nối đến máy chủ cập nhật: {e}");
            }
            Ok(status) if status == reqwest::StatusCode::NOT_FOUND => {
                guard.phase = "error".into();
                guard.error_kind = "feed".into();
                guard.error_message = "Không tìm thấy bản phát hành trên GitHub Releases.".into();
            }
            Ok(status) if !status.is_success() => {
                guard.phase = "error".into();
                guard.error_kind = "feed".into();
                guard.error_message = format!("Máy chủ trả mã lỗi HTTP {}.", status.as_u16());
            }
            Ok(_) => {
                let release_json: Value = serde_json::from_str(&body_text).unwrap_or(Value::Null);
                let tag_name = release_json
                    .get("tag_name")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .trim()
                    .to_string();

                if !tag_name.is_empty() && is_newer_version(&tag_name, current_version) {
                    guard.phase = "available".into();
                    guard.new_version = tag_name;
                    guard.error_kind = "".into();
                    guard.error_message = "".into();
                } else {
                    guard.phase = "up-to-date".into();
                    guard.new_version = "".into();
                    guard.error_kind = "".into();
                    guard.error_message = "".into();
                }
            }
        }
        serde_json::to_value(&*guard).map_err(|e| e.to_string())?
    };

    let _ = app.emit("about:state-push", &state_val);
    Ok(json!({ "ok": true, "state": state_val }))
}

pub fn download(_app: &AppHandle) -> Result<Value, String> {
    let guard = state_mutex().lock().map_err(|_| "khoá bận".to_string())?;
    let state_val = serde_json::to_value(&*guard).map_err(|e| e.to_string())?;
    Ok(json!({
        "ok": false,
        "error": "Tự động tải cập nhật chưa khả dụng trong bản này. Vui lòng tải bộ cài từ trang phát hành.",
        "state": state_val
    }))
}

pub fn install(_app: &AppHandle) -> Result<Value, String> {
    let guard = state_mutex().lock().map_err(|_| "khoá bận".to_string())?;
    let state_val = serde_json::to_value(&*guard).map_err(|e| e.to_string())?;
    Ok(json!({
        "ok": false,
        "error": "Tự động cài đặt chưa khả dụng trong bản này. Vui lòng chạy lại bộ cài đặt mới.",
        "state": state_val
    }))
}

pub fn open_releases(url: Option<&str>) -> Result<Value, String> {
    let target = url.unwrap_or(EDUGAME_RELEASE_PAGE_URL);
    if !target.starts_with("https://github.com/") {
        return Err("URL phát hành không hợp lệ".into());
    }
    #[cfg(target_os = "windows")]
    let _ = std::process::Command::new("cmd")
        .args(["/c", "start", "", target])
        .spawn();
    #[cfg(target_os = "macos")]
    let _ = std::process::Command::new("open").arg(target).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let _ = std::process::Command::new("xdg-open").arg(target).spawn();
    Ok(json!({ "ok": true }))
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    #[test]
    fn version_parsing_and_comparison() {
        assert_eq!(parse_version("0.5.1"), Some((0, 5, 1)));
        assert_eq!(parse_version("v0.5.2"), Some((0, 5, 2)));
        assert_eq!(parse_version("V1.0.0-rc1"), Some((1, 0, 0)));
        assert_eq!(parse_version("invalid"), None);

        assert!(is_newer_version("0.5.2", "0.5.1"));
        assert!(is_newer_version("v0.6.0", "0.5.1"));
        assert!(is_newer_version("1.0.0", "0.5.1"));
        assert!(!is_newer_version("0.5.1", "0.5.1"));
        assert!(!is_newer_version("0.5.0", "0.5.1"));
        assert!(!is_newer_version("0.4.9", "0.5.1"));
    }

    #[test]
    fn open_releases_validates_url() {
        assert!(open_releases(None).is_ok());
        assert!(open_releases(Some("https://github.com/vananz123/edu-game-ai/releases")).is_ok());
        assert!(open_releases(Some("http://insecure.com")).is_err());
        assert!(open_releases(Some("https://evil.com/releases")).is_err());
    }

    #[test]
    fn update_state_in_dev_mode() {
        let st = initial_state();
        assert_eq!(st.current_version, env!("CARGO_PKG_VERSION"));
        if cfg!(debug_assertions) {
            assert_eq!(st.phase, "error");
            assert_eq!(st.error_kind, "dev-mode");
        }
    }
}
