//! Đăng nhập Google qua Supabase — Phase 1 của `docs/archive/specs/cloud-auth-plan.md`.
//!
//! Nguyên tắc của tệp này:
//!
//! * **Không nhúng Google login vào WebView.** Google chặn OAuth trong WebView nhúng
//!   từ 2021, nên luồng là PKCE + loopback: Rust mở **trình duyệt hệ thống**, giữ
//!   `code_verifier` trong RAM, và nhận callback trên một cổng `127.0.0.1` do hệ
//!   điều hành cấp.
//! * **Token không đi qua JS.** Session được DPAPI mã hoá (`secrets::protect_secret`)
//!   rồi mới ghi xuống `auth-session.json` trong thư mục dữ liệu. Renderer nhận
//!   `SessionInfo` qua một lệnh duy nhất và chỉ dùng `access_token` để gọi gateway;
//!   không có token nào nằm trong `localStorage` hay trong log.
//! * **Chưa cấu hình thì phải nói là chưa cấu hình.** `SUPABASE_URL` +
//!   `SUPABASE_ANON_KEY` đọc từ môi trường lúc chạy; thiếu một trong hai thì mọi
//!   lệnh trả lỗi tiếng Việt rõ ràng thay vì im lặng hoặc đoán URL.
//! * **Quota không tính ở đây.** Plan/credits là việc của gateway (Phase 2), nơi có
//!   `service_role`; app chỉ biết người dùng là ai.
//!
//! Luồng đầy đủ (số bước khớp plan §3.2): `auth_start_oauth` sinh PKCE + `state`,
//! bind loopback, mở browser, chờ callback, đổi code lấy token, lưu session DPAPI,
//! phát event `auth:session-changed` / `auth:logged-out` — **đúng chuỗi kênh** của
//! façade (`desktop-adapter-tauri.ts` nghe sự kiện theo `channel`, không theo một
//! tên riêng), nhờ vậy chip tài khoản tự cập nhật khi phiên đổi ở bất kỳ đường nào.

use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::sync::mpsc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter};

use crate::base64;
use crate::paths;
use crate::secrets;

/// Tệp session trong thư mục dữ liệu (nội dung là blob DPAPI, không phải JSON thô).
const SESSION_FILE: &str = "auth-session.json";
/// Đường dẫn callback mà Supabase sẽ redirect về.
pub const CALLBACK_PATH: &str = "/auth/callback";
/// Chờ giáo viên đăng nhập tối đa 5 phút rồi đóng cổng (plan §3.2 bước 3).
pub const OAUTH_TIMEOUT_SECS: u64 = 300;
/// Làm mới token trước khi hết hạn 5 phút (plan §3.3).
pub const REFRESH_MARGIN_SECS: i64 = 300;

/// Cấu hình Supabase đọc từ môi trường.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CloudConfig {
    pub base_url: String,
    pub anon_key: String,
}

/// Một thiết lập cloud: biến môi trường lúc chạy thắng giá trị đã nhúng lúc biên dịch.
///
/// Nhúng là cách DUY NHẤT để bản cài trên máy giáo viên biết cấu hình: máy đó không
/// có `.env`, không có biến môi trường, và không ai sẽ mở terminal để đặt chúng.
/// Khoá publishable là khoá công khai; `build.rs` chỉ nhúng hai tên trong danh sách
/// trắng của nó.
fn cloud_setting(var: &str, embedded: Option<&str>) -> Option<String> {
    if let Ok(value) = std::env::var(var) {
        let value = value.trim();
        if !value.is_empty() {
            return Some(value.to_string());
        }
    }
    let embedded = embedded?.trim();
    if embedded.is_empty() {
        return None;
    }
    Some(embedded.to_string())
}

impl CloudConfig {
    /// `None` = máy này chưa cấu hình Supabase; mọi lệnh auth sẽ báo đúng như vậy.
    pub fn from_env() -> Option<Self> {
        let base = cloud_setting("SUPABASE_URL", option_env!("EDUGAME_SUPABASE_URL"))?
            .trim_end_matches('/')
            .to_string();
        let key = cloud_setting("SUPABASE_ANON_KEY", option_env!("EDUGAME_SUPABASE_ANON_KEY"))?;
        if base.is_empty() || key.is_empty() {
            return None;
        }
        Some(Self { base_url: base, anon_key: key })
    }
}

/// Phiên ĐẦY ĐỦ — chỉ sống trong tiến trình Rust và trong blob DPAPI trên đĩa.
///
/// **Tên trường ở đây là ĐỊNH DẠNG LƯU TRỮ** (snake_case như bản đầu), không phải
/// giao diện IPC. Đổi nó là đổi định dạng tệp: ngày 24/11 một lần `rename_all` thêm
/// vào đây làm phiên đã lưu không đọc lại được, và `auth_status` im lặng báo "Khách".
/// Muốn đổi tên cho IPC thì đổi ở `PublicSession`.
///
/// Trường token nằm ở đây và **không** ở `PublicSession`: một kiểu duy nhất vừa để
/// lưu vừa để gửi IPC là cách chắc chắn nhất để token rò ra JS. Cổng `ui-account-check`
/// đã bắt được đúng lỗi đó (bản đầu gửi cả `access_token` cho renderer).
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct SessionInfo {
    pub user_id: String,
    pub email: String,
    pub display_name: String,
    pub avatar_url: Option<String>,
    pub access_token: String,
    pub refresh_token: String,
    /// Unix giây.
    pub expires_at: i64,
}

/// Phần của phiên mà renderer được thấy: tên, email, ảnh. Không có token, không có
/// `refresh_token`. Đây là kiểu trả về của mọi lệnh `auth:*` đi ra IPC.
#[derive(Debug, Clone, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PublicSession {
    pub user_id: String,
    pub email: String,
    pub display_name: String,
    pub avatar_url: Option<String>,
    pub expires_at: i64,
}

impl SessionInfo {
    /// Bản rút gọn để gửi ra renderer.
    pub fn public(&self) -> PublicSession {
        PublicSession {
            user_id: self.user_id.clone(),
            email: self.email.clone(),
            display_name: self.display_name.clone(),
            avatar_url: self.avatar_url.clone(),
            expires_at: self.expires_at,
        }
    }
}

impl SessionInfo {
    pub fn expires_in(&self, now_secs: i64) -> i64 {
        self.expires_at - now_secs
    }

    /// Còn ít hơn `REFRESH_MARGIN_SECS` thì coi như cần làm mới.
    pub fn needs_refresh(&self, now_secs: i64) -> bool {
        self.expires_at - now_secs <= REFRESH_MARGIN_SECS
    }
}

/// Trạng thái để UI quyết định hiện "Đăng nhập" hay "Cloud AI chưa cấu hình".
///
/// `camelCase` cho khớp `AppInfo`/`ShellInfo` của api.rs: renderer đọc `loggedIn`,
/// và một tên trường lệch kiểu (snake) làm chip tài khoản nói "Khách" trong khi
/// phiên đã có — đúng lỗi mà cổng đo bắt được ngày 24/11.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthStatus {
    pub configured: bool,
    pub logged_in: bool,
    pub email: Option<String>,
    /// Tệp phiên có nhưng không đọc được (DPAPI hỏng, đổi định dạng, tệp bị sửa).
    /// Phải nói ra: im lặng coi đó là "chưa đăng nhập" là cách một giáo viên mất
    /// phiên mà không biết vì sao.
    pub problem: Option<String>,
}

pub fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// base64url không đệm — dạng duy nhất PKCE chấp nhận (RFC 7636 §A).
pub fn b64url_no_pad(bytes: &[u8]) -> String {
    base64::encode(bytes)
        .trim_end_matches('=')
        .replace('+', "-")
        .replace('/', "_")
}

/// `code_challenge = BASE64URL(SHA256(code_verifier))`, method `S256`.
pub fn code_challenge(verifier: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    b64url_no_pad(&hasher.finalize())
}

/// Chuỗi ngẫu nhiên URL-safe từ nguồn ngẫu nhiên của hệ điều hành.
pub fn random_urlsafe(byte_count: usize) -> Result<String, String> {
    let mut bytes = vec![0u8; byte_count];
    getrandom::fill(&mut bytes).map_err(|error| format!("Hệ thống không cấp được số ngẫu nhiên: {error}"))?;
    Ok(b64url_no_pad(&bytes))
}

/// `state` chống CSRF: 32 ký tự hex, đủ để không đoán được.
pub fn random_state() -> Result<String, String> {
    let mut bytes = [0u8; 16];
    getrandom::fill(&mut bytes).map_err(|error| format!("Hệ thống không cấp được số ngẫu nhiên: {error}"))?;
    Ok(hex::encode(bytes))
}

/// `code_verifier`: 32 byte ngẫu nhiên ⇒ 43 ký tự, đúng khoảng 43–128 của RFC.
pub fn new_code_verifier() -> Result<String, String> {
    random_urlsafe(32)
}

/// URL để mở trong trình duyệt hệ thống.
pub fn authorize_url(config: &CloudConfig, redirect_uri: &str, challenge: &str, state: &str) -> String {
    format!(
        "{}/auth/v1/authorize?provider=google&redirect_to={}&code_challenge={}&code_challenge_method=S256&state={}",
        config.base_url,
        percent_encode(redirect_uri),
        percent_encode(challenge),
        percent_encode(state)
    )
}

/// `code` do Google/Supabase trả về có thể chứa ký tự phải mã hoá, nên khi đọc lại
/// phải giải mã (tối thiểu: `%XX` và `+`).
pub fn percent_decode(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        match bytes[index] {
            b'%' if index + 2 < bytes.len() => {
                let hex_part = std::str::from_utf8(&bytes[index + 1..index + 3]).unwrap_or("");
                match u8::from_str_radix(hex_part, 16) {
                    Ok(value) => {
                        out.push(value);
                        index += 3;
                    }
                    Err(_) => {
                        out.push(b'%');
                        index += 1;
                    }
                }
            }
            b'+' => {
                out.push(b' ');
                index += 1;
            }
            other => {
                out.push(other);
                index += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Mã hoá một giá trị cho query string (dùng cho `redirect_to`, `challenge`, `state`).
pub fn percent_encode(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for byte in text.as_bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(*byte as char),
            other => out.push_str(&format!("%{other:02X}")),
        }
    }
    out
}

/// Kết quả đọc được từ dòng request của callback.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CallbackParams {
    pub code: String,
    pub state: String,
}

/// Kết quả đọc thô từ dòng request của callback — chưa diễn giải.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct RawCallback {
    pub is_get: bool,
    pub path_ok: bool,
    pub code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
    pub error_description: Option<String>,
}

impl RawCallback {
    /// Có ít nhất một tham số mang nghĩa ⇒ đây là phản hồi của nhà cung cấp, không
    /// phải một tab lạc.
    pub fn has_provider_payload(&self) -> bool {
        self.code.is_some() || self.state.is_some() || self.error.is_some()
    }
}

/// Quyết định một request loopback làm gì với phiên đang chờ.
#[derive(Debug, Clone, PartialEq, Eq)]
enum CallbackVerdict {
    /// Đúng `state`: kết thúc phiên chờ với `code`.
    Accepted(CallbackParams),
    /// Không phải của mình (favicon, tab mở lại, điều hướng lạc): trả lời rồi **chờ tiếp**.
    Stray,
    /// Của mình nhưng hỏng: trả lời rồi kết thúc bằng lỗi tiếng Việt.
    Rejected(String),
}

/// Luật quan trọng nhất của loopback: chỉ một phản hồi **đúng `state`** được kết thúc
/// phiên; mọi thứ khác phải bị bỏ qua. Một tab lạc từng làm hỏng cả lần đăng nhập thật
/// (request vào đúng đường dẫn nhưng không có tham số nào).
fn callback_verdict(raw: &RawCallback, expected_state: &str) -> CallbackVerdict {
    if !raw.is_get || !raw.path_ok {
        return CallbackVerdict::Stray;
    }
    let state_matches = raw.state.as_deref() == Some(expected_state);
    if let Some(error) = &raw.error {
        // Lỗi của người khác (state khác) không được phép kết thúc phiên của mình.
        if raw.state.is_some() && !state_matches {
            return CallbackVerdict::Stray;
        }
        let detail = raw.error_description.clone().unwrap_or_default();
        return CallbackVerdict::Rejected(if detail.is_empty() {
            format!("Nhà cung cấp đăng nhập trả lỗi: {error}")
        } else {
            format!("Nhà cung cấp đăng nhập trả lỗi: {error} — {detail}")
        });
    }
    match (&raw.code, &raw.state) {
        // Supabase (GoTrue) ở luồng PKCE trả về **chỉ `code`**, không kèm `state`.
        // Chấp nhận `code` khi vắng `state`, vì thứ ràng buộc thật sự là `code_verifier`
        // chỉ nằm trong RAM của tiến trình này: một `code` lạ không đổi được thành token.
        (Some(code), None) if !code.is_empty() => CallbackVerdict::Accepted(CallbackParams {
            code: code.clone(),
            state: expected_state.to_string(),
        }),
        (Some(code), Some(_)) if !code.is_empty() && state_matches => {
            CallbackVerdict::Accepted(CallbackParams {
                code: code.clone(),
                state: expected_state.to_string(),
            })
        }
        // Đúng đường dẫn nhưng không có tham số nào: tab lạc, không phải câu trả lời.
        _ if !raw.has_provider_payload() => CallbackVerdict::Stray,
        // `state` khác: tín hiệu CSRF thật, không nhận, nhưng vẫn chờ tiếp.
        _ => CallbackVerdict::Stray,
    }
}

/// Đọc dòng request thô của loopback.
pub fn raw_callback(request_line: &str) -> RawCallback {
    let mut raw = RawCallback::default();
    let mut parts = request_line.split_whitespace();
    raw.is_get = parts.next().unwrap_or("") == "GET";
    let target = parts.next().unwrap_or("");
    let (path, query) = match target.split_once('?') {
        Some((path, query)) => (path, query),
        None => (target, ""),
    };
    raw.path_ok = path == CALLBACK_PATH;
    for pair in query.split('&').filter(|pair| !pair.is_empty()) {
        let (key, value) = match pair.split_once('=') {
            Some((key, value)) => (key, value),
            None => (pair, ""),
        };
        let value = percent_decode(value);
        match key {
            "code" => raw.code = Some(value),
            "state" => raw.state = Some(value),
            "error" => raw.error = Some(value),
            "error_description" => raw.error_description = Some(value),
            _ => {}
        }
    }
    raw
}

/// Đọc dòng request đầu tiên của loopback và trả `code`/`state`, hoặc lỗi tiếng Việt.
///
/// Chỉ chấp nhận đúng `CALLBACK_PATH`; `error`/`error_description` do nhà cung cấp
/// trả về được chuyển thành lỗi để UI nói được vì sao đăng nhập hỏng (ví dụ người
/// dùng bấm "Từ chối" ở màn hình Google).
pub fn parse_callback_request(request_line: &str) -> Result<CallbackParams, String> {
    let raw = raw_callback(request_line);
    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or("");
    let target = parts.next().unwrap_or("");
    if method != "GET" {
        return Err("Callback OAuth phải là GET.".to_string());
    }
    if !raw.path_ok {
        let path = target.split_once('?').map(|(path, _)| path).unwrap_or(target);
        return Err(format!("Callback OAuth sai đường dẫn: {path}"));
    }
    if raw.error.is_some() {
        return match callback_verdict(&raw, "") {
            CallbackVerdict::Rejected(message) => Err(message),
            _ => Err("Callback OAuth thiếu code hoặc state.".to_string()),
        };
    }
    match (raw.code, raw.state) {
        (Some(code), Some(state)) if !code.is_empty() => Ok(CallbackParams { code, state }),
        _ => Err("Callback OAuth thiếu code hoặc state.".to_string()),
    }
}

/// Mở trình duyệt hệ thống. Không dùng `cmd /C start` vì dấu `&` trong URL sẽ bị
/// shell hiểu là ngăn cách lệnh.
#[cfg(windows)]
pub fn open_browser(url: &str) -> Result<(), String> {
    std::process::Command::new("rundll32")
        .arg("url.dll,FileProtocolHandler")
        .arg(url)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Không mở được trình duyệt: {error}"))
}

#[cfg(not(windows))]
pub fn open_browser(url: &str) -> Result<(), String> {
    std::process::Command::new("xdg-open")
        .arg(url)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Không mở được trình duyệt: {error}"))
}

/// Chờ MỘT callback đúng `state` trên listener đã bind. Trả lỗi khi hết giờ.
///
/// Mỗi kết nối lạ (favicon, lần mở lại tab…) được trả lời rồi bỏ qua, không làm
/// hỏng phiên đang chờ.
pub fn wait_for_callback(
    listener: TcpListener,
    expected_state: &str,
    timeout: Duration,
) -> Result<CallbackParams, String> {
    let deadline = std::time::Instant::now() + timeout;
    loop {
        let remaining = deadline.saturating_duration_since(std::time::Instant::now());
        if remaining.is_zero() {
            return Err("Hết thời gian chờ đăng nhập (5 phút). Hãy thử lại.".to_string());
        }
        listener
            .set_nonblocking(true)
            .map_err(|error| format!("Không đặt được chế độ chờ cho cổng callback: {error}"))?;
        match listener.accept() {
            Ok((stream, _addr)) => {
                let _ = stream.set_nonblocking(false);
                let mut reader = BufReader::new(match stream.try_clone() {
                    Ok(clone) => clone,
                    Err(_) => continue,
                });
                let mut request_line = String::new();
                if reader.read_line(&mut request_line).is_err() {
                    continue;
                }
                    let parsed = callback_verdict(&raw_callback(request_line.trim_end()), expected_state);
                if std::env::var_os("EDUGAME_OAUTH_DEBUG").is_some() {
                    // Chỉ bật bằng biến môi trường: lúc gỡ lỗi loopback cần thấy đúng
                    // dòng request, còn máy giáo viên thì không ghi gì cả.
                    let line = format!("{:?} <- {}\n", parsed, request_line.trim_end());
                    if let Ok(mut log) = std::fs::OpenOptions::new()
                        .create(true)
                        .append(true)
                        .open(std::env::temp_dir().join("edugame-oauth-debug.log"))
                    {
                        use std::io::Write as _;
                        let _ = log.write_all(line.as_bytes());
                    }
                }
                let (status, body, result) = match parsed {
                    CallbackVerdict::Accepted(params) => (
                        "200 OK",
                        "<p>Đăng nhập thành công. Bạn có thể đóng tab này và quay lại EduGame Studio.</p>",
                        Some(Ok(params)),
                    ),
                    // Tab lạc (favicon, mở lại tab, điều hướng không tham số): trả lời rồi
                    // chờ tiếp. Đây là lỗi thật đã gặp: request không tham số từng giết
                    // cả phiên đăng nhập đang chờ.
                    CallbackVerdict::Stray => ("204 No Content", "", None),
                    CallbackVerdict::Rejected(message) => (
                        "400 Bad Request",
                        "<p>Không đọc được phản hồi đăng nhập.</p>",
                        Some(Err(message)),
                    ),
                };
                let mut stream = stream;
                let response = format!(
                    "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                );
                let _ = stream.write_all(response.as_bytes());
                let _ = stream.flush();
                if let Some(result) = result {
                    return result;
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(60));
            }
            Err(error) => return Err(format!("Cổng callback gặp lỗi: {error}")),
        }
    }
}

/// Phản hồi `POST /auth/v1/token` của Supabase (chỉ các trường được dùng).
#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
    #[serde(default)]
    refresh_token: String,
    #[serde(default)]
    expires_in: i64,
    #[serde(default)]
    user: TokenUser,
}

#[derive(Debug, Default, Deserialize)]
struct TokenUser {
    #[serde(default)]
    id: String,
    #[serde(default)]
    email: String,
    #[serde(default)]
    user_metadata: UserMetadata,
}

#[derive(Debug, Default, Deserialize)]
struct UserMetadata {
    #[serde(default)]
    full_name: String,
    #[serde(default)]
    avatar_url: Option<String>,
}

impl TokenResponse {
    fn into_session(self, now: i64) -> SessionInfo {
        let display_name = if self.user.user_metadata.full_name.trim().is_empty() {
            self.user.email.split('@').next().unwrap_or("").to_string()
        } else {
            self.user.user_metadata.full_name.trim().to_string()
        };
        SessionInfo {
            user_id: self.user.id,
            email: self.user.email,
            display_name,
            avatar_url: self.user.user_metadata.avatar_url,
            access_token: self.access_token,
            refresh_token: self.refresh_token,
            expires_at: now + self.expires_in.max(0),
        }
    }
}

/// Session được lưu dưới dạng DPAPI: tệp chỉ chứa blob, không chứa token rõ.
pub fn encode_session_blob(session: &SessionInfo) -> Result<serde_json::Value, String> {
    let plaintext = serde_json::to_string(session).map_err(|error| format!("Không đóng gói được phiên: {error}"))?;
    let cipher = secrets::protect_secret(&plaintext)?;
    Ok(serde_json::json!({ "cipher": cipher }))
}

pub fn decode_session_blob(blob: &serde_json::Value) -> Result<Option<SessionInfo>, String> {
    let cipher = match blob.get("cipher").and_then(|value| value.as_str()) {
        Some(cipher) if !cipher.is_empty() => cipher,
        _ => return Ok(None),
    };
    let plaintext = secrets::unprotect_secret(cipher)?;
    let session: SessionInfo =
        serde_json::from_str(&plaintext).map_err(|error| format!("Phiên đăng nhập đã lưu không đọc được: {error}"))?;
    Ok(Some(session))
}

fn read_session(app: &AppHandle) -> Result<Option<SessionInfo>, String> {
    let blob = paths::read_json(app, SESSION_FILE, serde_json::Value::Null)?;
    decode_session_blob(&blob)
}

fn write_session(app: &AppHandle, session: &SessionInfo) -> Result<(), String> {
    let blob = encode_session_blob(session)?;
    paths::write_json(app, SESSION_FILE, &blob)
}

fn clear_session(app: &AppHandle) -> Result<(), String> {
    // Xoá hẳn tệp, không ghi `null`: sau khi đăng xuất không nên còn dấu vết rằng máy
    // này từng có tài khoản. `NotFound` là trạng thái đích, không phải lỗi.
    let path = paths::data_dir(app)?.join(SESSION_FILE);
    match std::fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("không xoá được {}: {error}", path.display())),
    }
}

fn require_config() -> Result<CloudConfig, String> {
    CloudConfig::from_env().ok_or_else(|| {
        "Cloud AI chưa được cấu hình trên máy này (thiếu SUPABASE_URL / SUPABASE_ANON_KEY). Bạn vẫn dùng được Local AI."
            .to_string()
    })
}

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|error| format!("Không tạo được kết nối HTTPS: {error}"))
}

async fn request_token(
    config: &CloudConfig,
    body: serde_json::Value,
    grant: &str,
) -> Result<TokenResponse, String> {
    let url = format!("{}/auth/v1/token?grant_type={grant}", config.base_url);
    // Không dùng `.json()`: `reqwest` ở đây chỉ bật tính năng `stream`, và Cargo
    // không cần thêm `json` chỉ để nối ba dòng này — `serde_json` đã có sẵn.
    let payload = serde_json::to_string(&body)
        .map_err(|error| format!("Không đóng gói được yêu cầu đăng nhập: {error}"))?;
    let response = http_client()?
        .post(url)
        .header("apikey", &config.anon_key)
        .header("Content-Type", "application/json")
        .body(payload)
        .send()
        .await
        .map_err(|error| format!("Không kết nối được máy chủ đăng nhập: {error}"))?;

    let status = response.status();
    let text = response.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(translate_auth_error(status.as_u16(), &text));
    }
    serde_json::from_str::<TokenResponse>(&text)
        .map_err(|error| format!("Phản hồi đăng nhập không đọc được: {error}"))
}

/// Lỗi của Supabase thành câu tiếng Việt mà giáo viên hiểu được.
pub fn translate_auth_error(status: u16, body: &str) -> String {
    let detail = serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|value| {
            value
                .get("error_description")
                .or_else(|| value.get("msg"))
                .or_else(|| value.get("message"))
                .and_then(|inner| inner.as_str())
                .map(|text| text.to_string())
        })
        .unwrap_or_default();
    let base = match status {
        400 | 401 => "Phiên đăng nhập không hợp lệ hoặc đã hết hạn.",
        403 => "Tài khoản không được phép dùng Cloud AI.",
        404 => "Máy chủ đăng nhập không tìm thấy (kiểm tra SUPABASE_URL).",
        429 => "Bạn thử đăng nhập quá nhiều lần. Vui lòng chờ một phút.",
        500..=599 => "Máy chủ đăng nhập đang gặp sự cố. Thử lại sau.",
        _ => "Đăng nhập không thành công.",
    };
    if detail.is_empty() {
        base.to_string()
    } else {
        format!("{base} ({detail})")
    }
}

/// Bước 5–6 của plan: chờ callback rồi đổi `code` lấy token.
async fn exchange_code(config: &CloudConfig, code: &str, verifier: &str) -> Result<SessionInfo, String> {
    let token = request_token(
        config,
        serde_json::json!({ "auth_code": code, "code_verifier": verifier }),
        "pkce",
    )
    .await?;
    Ok(token.into_session(now_secs()))
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn auth_status(app: AppHandle) -> AuthStatus {
    let configured = CloudConfig::from_env().is_some();
    match read_session(&app) {
        Ok(Some(session)) => AuthStatus {
            configured,
            logged_in: true,
            email: Some(session.email),
            problem: None,
        },
        Ok(None) => AuthStatus { configured, logged_in: false, email: None, problem: None },
        Err(error) => AuthStatus {
            configured,
            logged_in: false,
            email: None,
            problem: Some(error),
        },
    }
}

#[tauri::command]
pub fn auth_get_session(app: AppHandle) -> Result<Option<PublicSession>, String> {
    Ok(read_session(&app)?.map(|session| session.public()))
}

#[tauri::command]
pub async fn auth_start_oauth(app: AppHandle) -> Result<PublicSession, String> {
    let config = require_config()?;
    let verifier = new_code_verifier()?;
    let challenge = code_challenge(&verifier);
    let state = random_state()?;
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|error| format!("Không mở được cổng callback cục bộ: {error}"))?;
    let port = listener
        .local_addr()
        .map_err(|error| format!("Không đọc được cổng callback: {error}"))?
        .port();
    let redirect_uri = format!("http://127.0.0.1:{port}{CALLBACK_PATH}");
    let url = authorize_url(&config, &redirect_uri, &challenge, &state);

    let (sender, receiver) = mpsc::channel::<Result<CallbackParams, String>>();
    let expected_state = state.clone();
    std::thread::spawn(move || {
        let _ = sender.send(wait_for_callback(
            listener,
            &expected_state,
            Duration::from_secs(OAUTH_TIMEOUT_SECS),
        ));
    });

    open_browser(&url)?;

    let callback = tauri::async_runtime::spawn_blocking(move || {
        receiver
            .recv_timeout(Duration::from_secs(OAUTH_TIMEOUT_SECS + 5))
            .map_err(|_| "Hết thời gian chờ đăng nhập (5 phút). Hãy thử lại.".to_string())?
    })
    .await
    .map_err(|error| format!("Luồng chờ đăng nhập gặp lỗi: {error}"))??;

    let session = exchange_code(&config, &callback.code, &verifier).await?;
    write_session(&app, &session)?;
    // Sự kiện cũng chỉ mang bản rút gọn: một `emit` với `SessionInfo` là đường thứ
    // hai để token tới JS, và nó không hiện ra trong bất kỳ kiểu trả về nào.
    let _ = app.emit("auth:session-changed", session.public());
    Ok(session.public())
}

#[tauri::command]
pub async fn auth_refresh_session(app: AppHandle) -> Result<PublicSession, String> {
    let config = require_config()?;
    let current = read_session(&app)?.ok_or_else(|| "Chưa đăng nhập.".to_string())?;
    if current.refresh_token.is_empty() {
        clear_session(&app)?;
        let _ = app.emit("auth:logged-out", serde_json::json!({ "reason": "no_refresh_token" }));
        return Err("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.".to_string());
    }
    let token = request_token(
        &config,
        serde_json::json!({ "refresh_token": current.refresh_token }),
        "refresh_token",
    )
    .await?;
    let mut session = token.into_session(now_secs());
    if session.refresh_token.is_empty() {
        session.refresh_token = current.refresh_token;
    }
    write_session(&app, &session)?;
    let _ = app.emit("auth:session-changed", session.public());
    Ok(session.public())
}

#[tauri::command]
pub fn auth_logout(app: AppHandle) -> Result<(), String> {
    clear_session(&app)?;
    let _ = app.emit("auth:logged-out", serde_json::json!({ "reason": "logout" }));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Vector chuẩn của RFC 7636 §B: nếu hàm băm hoặc base64url sai một bit, test này đỏ.
    #[test]
    fn code_challenge_matches_the_rfc_7636_example() {
        let verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
        assert_eq!(code_challenge(verifier), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
    }

    #[test]
    fn code_verifier_is_43_url_safe_characters() {
        let verifier = new_code_verifier().expect("verifier");
        assert_eq!(verifier.len(), 43, "RFC 7636 cho phép 43–128 ký tự");
        assert!(
            verifier.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'),
            "verifier chỉ được chứa ký tự URL-safe: {verifier}"
        );
        assert_ne!(verifier, new_code_verifier().expect("verifier"), "hai lần sinh phải khác nhau");
    }

    #[test]
    fn state_is_32_hex_characters_and_random() {
        let first = random_state().expect("state");
        assert_eq!(first.len(), 32);
        assert!(first.chars().all(|c| c.is_ascii_hexdigit()));
        assert_ne!(first, random_state().expect("state"));
    }

    #[test]
    fn base64url_has_no_padding_and_no_plus_or_slash() {
        let encoded = b64url_no_pad(&[0xfb, 0xff, 0xbf]);
        assert!(!encoded.contains('='), "base64url không đệm: {encoded}");
        assert!(!encoded.contains('+') && !encoded.contains('/'), "phải là bảng url-safe: {encoded}");
    }

    #[test]
    fn authorize_url_carries_provider_pkce_and_an_encoded_redirect() {
        let config = CloudConfig {
            base_url: "https://example.supabase.co".to_string(),
            anon_key: "anon".to_string(),
        };
        let url = authorize_url(
            &config,
            "http://127.0.0.1:51234/auth/callback",
            "challenge_-value",
            "statevalue",
        );
        assert!(url.starts_with("https://example.supabase.co/auth/v1/authorize?"), "{url}");
        assert!(url.contains("provider=google"), "{url}");
        assert!(url.contains("code_challenge_method=S256"), "{url}");
        assert!(url.contains("code_challenge=challenge_-value"), "{url}");
        assert!(url.contains("state=statevalue"), "{url}");
        assert!(
            url.contains("redirect_to=http%3A%2F%2F127.0.0.1%3A51234%2Fauth%2Fcallback"),
            "redirect_to phải được mã hoá: {url}"
        );
    }

    #[test]
    fn parse_callback_reads_a_percent_encoded_code() {
        // `%2B` là dấu cộng thật, còn `+` trong query là dấu cách: mã code của
        // Supabase có thể chứa cả hai, nên phải phân biệt được.
        let params = parse_callback_request(
            "GET /auth/callback?code=ab%2Fcd%2Be+f&state=deadbeef HTTP/1.1",
        )
        .expect("callback hợp lệ");
        assert_eq!(params.code, "ab/cd+e f");
        assert_eq!(params.state, "deadbeef");
    }

    #[test]
    fn parse_callback_surfaces_the_provider_error() {
        let error = parse_callback_request(
            "GET /auth/callback?error=access_denied&error_description=User%20cancelled HTTP/1.1",
        )
        .expect_err("phải là lỗi");
        assert!(error.contains("access_denied"), "{error}");
        assert!(error.contains("User cancelled"), "{error}");
    }

    #[test]
    fn parse_callback_rejects_wrong_path_missing_code_and_non_get() {
        assert!(parse_callback_request("GET /favicon.ico HTTP/1.1").is_err());
        assert!(parse_callback_request("GET /auth/callback?state=only HTTP/1.1").is_err());
        assert!(parse_callback_request("POST /auth/callback?code=x&state=y HTTP/1.1").is_err());
        assert!(parse_callback_request("").is_err());
    }

    #[test]
    fn percent_helpers_round_trip() {
        let raw = "http://127.0.0.1:1/auth/callback?a=1&b=hai ba";
        assert_eq!(percent_decode(&percent_encode(raw)), raw);
        assert_eq!(percent_encode("a b"), "a%20b");
        assert_eq!(percent_decode("100%25"), "100%");
        assert_eq!(percent_decode("a%zz"), "a%zz", "chuỗi hỏng thì giữ nguyên, không panic");
    }

    #[test]
    fn session_refresh_window_is_measured_from_expiry() {
        let session = SessionInfo { expires_at: 1_000, ..Default::default() };
        assert!(!session.needs_refresh(1_000 - REFRESH_MARGIN_SECS - 1));
        assert!(session.needs_refresh(1_000 - REFRESH_MARGIN_SECS));
        assert!(session.needs_refresh(1_000), "đúng lúc hết hạn thì phải làm mới");
        assert_eq!(session.expires_in(700), 300);
    }

    #[test]
    fn session_blob_round_trips_through_dpapi_and_holds_no_plaintext() {
        let session = SessionInfo {
            user_id: "u-1".to_string(),
            email: "teacher@example.test".to_string(),
            display_name: "Cô Lan".to_string(),
            avatar_url: Some("https://example.test/a.png".to_string()),
            access_token: "access-token-synthetic".to_string(),
            refresh_token: "refresh-token-synthetic".to_string(),
            expires_at: 1_800,
        };
        let blob = encode_session_blob(&session).expect("mã hoá");
        let serialized = serde_json::to_string(&blob).expect("json");
        assert!(
            !serialized.contains("access-token-synthetic"),
            "tệp lưu không được chứa token rõ: {serialized}"
        );
        let decoded = decode_session_blob(&blob).expect("giải mã").expect("có phiên");
        assert_eq!(decoded, session);
    }

    /// Định dạng tệp phiên là một lời hứa với bản đang chạy: đổi tên trường ở
    /// `SessionInfo` là làm mọi phiên đã lưu không đọc lại được. Test này chốt
    /// snake_case của blob, để lần sau ai đổi tên sẽ thấy đỏ ngay.
    #[test]
    fn session_blob_format_stays_snake_case() {
        let session = SessionInfo {
            user_id: "u".to_string(),
            email: "a@b.c".to_string(),
            display_name: "Cô".to_string(),
            avatar_url: None,
            access_token: "t".to_string(),
            refresh_token: "r".to_string(),
            expires_at: 1,
        };
        let blob = encode_session_blob(&session).expect("mã hoá");
        let decoded = decode_session_blob(&blob).expect("giải mã").expect("có phiên");
        assert_eq!(decoded, session);
        // Tên trường TRƯỚC khi mã hoá — đây mới là thứ quyết định tệp đọc lại được.
        // (So sánh chuỗi cipher sau mã hoá là sai: DPAPI thêm salt ngẫu nhiên.)
        let plain = serde_json::to_string(&session).expect("json");
        assert!(plain.contains("\"access_token\""), "{plain}");
        assert!(plain.contains("\"display_name\""), "{plain}");
        assert!(!plain.contains("\"accessToken\""), "{plain}");
    }

    #[test]
    fn empty_blob_reads_as_no_session() {
        assert_eq!(decode_session_blob(&serde_json::Value::Null).expect("null"), None);
        assert_eq!(
            decode_session_blob(&serde_json::json!({ "cipher": "" })).expect("rỗng"),
            None
        );
    }

    #[test]
    fn session_display_name_falls_back_to_the_email_local_part() {
        let token = TokenResponse {
            access_token: "a".to_string(),
            refresh_token: "r".to_string(),
            expires_in: 3_600,
            user: TokenUser {
                id: "u".to_string(),
                email: "co.lan@example.test".to_string(),
                user_metadata: UserMetadata { full_name: "   ".to_string(), avatar_url: None },
            },
        };
        let session = token.into_session(100);
        assert_eq!(session.display_name, "co.lan");
        assert_eq!(session.expires_at, 3_700);
    }

    /// Thứ tự ưu tiên đo được mà không phải đặt biến môi trường của cả tiến trình
    /// (đặt biến trong test là đua với các test khác chạy song song).
    #[test]
    fn environment_overrides_the_value_embedded_at_build_time() {
        assert_eq!(
            cloud_setting("EDUGAME_TEST_UNSET_VAR", Some(" https://embedded ")).as_deref(),
            Some("https://embedded")
        );
        assert_eq!(cloud_setting("EDUGAME_TEST_UNSET_VAR", None), None);
        assert_eq!(cloud_setting("EDUGAME_TEST_UNSET_VAR", Some("   ")), None);
    }

    /// Khoá bí mật không bao giờ được nhúng. `build.rs` chỉ có danh sách trắng hai
    /// tên; test này chốt thêm ở phía đọc để lần sau ai thêm một tên vào đó thì
    /// nhìn thấy hậu quả ngay.
    #[test]
    fn only_the_publishable_pair_is_read_at_build_time() {
        // Đọc ĐÚNG danh sách trắng, không đọc cả tệp: chính tệp đó có câu giải thích
        // vì sao hai khoá bí mật không được nhúng, và câu giải thích nhắc tên chúng.
        let source = include_str!("../build.rs");
        let start = source.find("const EMBEDDED").expect("khai báo danh sách trắng");
        let end = start + source[start..].find("];").expect("kết thúc danh sách trắng");
        let list = &source[start..end];
        assert!(list.contains("SUPABASE_URL"), "{list}");
        assert!(list.contains("SUPABASE_ANON_KEY"), "{list}");
        assert!(!list.contains("SERVICE_ROLE"), "{list}");
        assert!(!list.contains("GEMINI"), "{list}");
    }

    #[test]
    fn auth_errors_are_translated_with_the_server_detail() {
        assert!(translate_auth_error(429, "{}").contains("quá nhiều lần"));
        assert!(translate_auth_error(503, "").contains("sự cố"));
        let detailed = translate_auth_error(400, "{\"error_description\":\"Token has expired\"}");
        assert!(detailed.contains("hết hạn"), "{detailed}");
        assert!(detailed.contains("Token has expired"), "{detailed}");
    }

    /// Cổng loopback thật, không mạng: một kết nối sai `state` bị bỏ qua, kết nối
    /// đúng `state` kết thúc phiên chờ. Đây là chỗ dễ hỏng nhất của cả luồng OAuth.
    #[test]
    fn loopback_ignores_a_wrong_state_and_accepts_the_right_one() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
        let port = listener.local_addr().expect("addr").port();
        let expected = "expected-state";
        let worker = std::thread::spawn(move || {
            wait_for_callback(listener, expected, Duration::from_secs(5))
        });

        let mut wrong = std::net::TcpStream::connect(("127.0.0.1", port)).expect("kết nối");
        wrong
            .write_all(b"GET /auth/callback?code=abc&state=attacker HTTP/1.1\r\nHost: x\r\n\r\n")
            .expect("ghi");
        let mut buffer = String::new();
        let mut reader = BufReader::new(wrong);
        let _ = reader.read_line(&mut buffer);
        // `state` của người khác: không nhận, cũng không kết thúc phiên chờ (204).
        assert!(buffer.contains("204"), "state sai không được là câu trả lời: {buffer}");

        let mut right = std::net::TcpStream::connect(("127.0.0.1", port)).expect("kết nối");
        right
            .write_all(b"GET /auth/callback?code=good-code&state=expected-state HTTP/1.1\r\nHost: x\r\n\r\n")
            .expect("ghi");
        let mut reply = String::new();
        let mut right_reader = BufReader::new(right);
        let _ = right_reader.read_line(&mut reply);
        assert!(reply.contains("200"), "state đúng phải được nhận: {reply}");

        let params = worker.join().expect("luồng chờ").expect("callback");
        assert_eq!(params.code, "good-code");
        assert_eq!(params.state, expected);
    }

    #[test]
    fn loopback_times_out_with_a_vietnamese_message() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
        let error =
            wait_for_callback(listener, "state", Duration::from_millis(120)).expect_err("phải hết giờ");
        assert!(error.contains("Hết thời gian"), "{error}");
    }

    /// Lỗi thật gặp ngày 24/11: một request vào **đúng** `/auth/callback` nhưng không có
    /// tham số nào (tab lạc, điều hướng lại) từng làm hỏng cả lần đăng nhập thật. Nó phải
    /// bị bỏ qua, và callback đúng đến sau đó vẫn phải được nhận.
    #[test]
    fn loopback_ignores_a_callback_without_any_parameter() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
        let port = listener.local_addr().expect("addr").port();
        let expected = "state-that-survives-a-stray-tab";
        let worker = std::thread::spawn(move || {
            wait_for_callback(listener, expected, Duration::from_secs(5))
        });

        let mut stray = std::net::TcpStream::connect(("127.0.0.1", port)).expect("kết nối");
        stray
            .write_all(b"GET /auth/callback HTTP/1.1\r\nHost: x\r\n\r\n")
            .expect("ghi");
        let mut buffer = String::new();
        let mut reader = BufReader::new(stray);
        let _ = reader.read_line(&mut buffer);
        assert!(buffer.contains("204"), "request không tham số phải bị bỏ qua: {buffer}");

        let mut right = std::net::TcpStream::connect(("127.0.0.1", port)).expect("kết nối");
        right
            .write_all(
                format!("GET /auth/callback?code=real-code&state={expected} HTTP/1.1\r\nHost: x\r\n\r\n")
                    .as_bytes(),
            )
            .expect("ghi");
        let mut reply = String::new();
        let mut right_reader = BufReader::new(right);
        let _ = right_reader.read_line(&mut reply);
        assert!(reply.contains("200"), "callback đúng vẫn phải được nhận: {reply}");

        let params = worker.join().expect("luồng chờ").expect("callback");
        assert_eq!(params.code, "real-code");
    }

    /// Token chỉ sống trong tiến trình Rust và trong blob DPAPI. Renderer nhận tên/ảnh.
    /// Cổng `ui-account-check` đọc lại cùng bất biến này từ phía JS.
    #[test]
    fn session_payload_never_contains_a_token() {
        let session = SessionInfo {
            user_id: "u1".to_string(),
            email: "co.giao@example.com".to_string(),
            display_name: "Cô Giáo".to_string(),
            avatar_url: Some("https://example.com/a.png".to_string()),
            access_token: "SECRET-ACCESS".to_string(),
            refresh_token: "SECRET-REFRESH".to_string(),
            expires_at: 1_800_000_000,
        };
        let payload = serde_json::to_string(&session.public()).expect("serialize");
        assert!(!payload.contains("SECRET-ACCESS"), "{payload}");
        assert!(!payload.contains("SECRET-REFRESH"), "{payload}");
        assert!(!payload.contains("access_token"), "{payload}");
        assert!(!payload.contains("refresh_token"), "{payload}");
        assert!(!payload.contains("accessToken"), "{payload}");
        assert!(payload.contains("\"displayName\":\"Cô Giáo\""), "{payload}");
        assert!(payload.contains("\"avatarUrl\""), "{payload}");
    }

    /// Chip tài khoản đọc `loggedIn`; tên trường lệch kiểu từng làm nó ghi "Khách"
    /// trong khi phiên đã có.
    #[test]
    fn auth_status_serializes_in_camel_case() {
        let payload = serde_json::to_string(&AuthStatus {
            configured: true,
            logged_in: true,
            email: Some("a@b.c".to_string()),
            problem: None,
        })
        .expect("serialize");
        assert!(payload.contains("\"loggedIn\":true"), "{payload}");
        assert!(!payload.contains("logged_in"), "{payload}");
    }

    #[test]
    fn callback_verdict_only_aborts_on_our_own_error() {
        let ours = raw_callback("GET /auth/callback?error=access_denied&state=s1 HTTP/1.1");
        assert_eq!(
            callback_verdict(&ours, "s1"),
            CallbackVerdict::Rejected("Nhà cung cấp đăng nhập trả lỗi: access_denied".to_string())
        );
        let theirs = raw_callback("GET /auth/callback?error=access_denied&state=other HTTP/1.1");
        assert_eq!(callback_verdict(&theirs, "s1"), CallbackVerdict::Stray);
        let bare = raw_callback("GET /auth/callback HTTP/1.1");
        assert_eq!(callback_verdict(&bare, "s1"), CallbackVerdict::Stray);
        // Supabase PKCE chỉ trả `code`: phải nhận, nếu không thì không bao giờ đăng nhập được.
        let code_only = raw_callback("GET /auth/callback?code=03c21efd-d9e9 HTTP/1.1");
        assert!(matches!(callback_verdict(&code_only, "s1"), CallbackVerdict::Accepted(_)));
        let favicon = raw_callback("GET /favicon.ico HTTP/1.1");
        assert_eq!(callback_verdict(&favicon, "s1"), CallbackVerdict::Stray);
        let ok = raw_callback("GET /auth/callback?code=c&state=s1 HTTP/1.1");
        assert!(matches!(callback_verdict(&ok, "s1"), CallbackVerdict::Accepted(_)));
    }
}

