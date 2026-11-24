// cloud.rs — gọi gateway AI của sản phẩm (`server/index.ts`) bằng TOKEN CỦA PHIÊN.
//
// Vì sao ở Rust chứ không ở JS: access token chỉ sống trong tiến trình này và trong blob
// DPAPI. Renderer gọi `cloudGenerate` và chỉ nhận lại trò chơi — không có đường nào để
// token xuất hiện trong JS (#337 cùng họ).
//
// Vì sao trả `CloudOutcome` chứ không `Result<T, String>`: UI cần phân biệt "chưa đăng
// nhập" với "hết lượt" với "máy chủ chưa cài" để hiện đúng lời mời, đúng nút. Một chuỗi
// lỗi chung là thứ khiến giáo viên bấm lại vô ích (#341 cùng họ).

use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::auth;

/// Thiếu cấu hình gateway thì phải là một trạng thái có tên, không phải panic/mặc định.
const GATEWAY_ENV: &str = "EDUGAME_AI_GATEWAY_URL";

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudRequest {
    pub text: String,
    #[serde(default)]
    pub source_name: String,
    #[serde(default = "default_question_count")]
    pub question_count: u32,
    #[serde(default = "default_template")]
    pub template: String,
    #[serde(default)]
    pub grade: String,
    #[serde(default)]
    pub subject: String,
}

fn default_question_count() -> u32 {
    8
}

fn default_template() -> String {
    "quiz".to_string()
}

#[derive(Debug, Clone, Serialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CloudOutcome {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub game: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<serde_json::Value>,
    /// Mã máy đọc được, để UI và cổng kiểm không phải so chuỗi tiếng Việt.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

impl CloudOutcome {
    fn fail(code: &str, message: &str) -> Self {
        Self { ok: false, code: Some(code.to_string()), message: Some(message.to_string()), ..Self::default() }
    }
}

/// Địa chỉ gateway: biến môi trường của tiến trình thắng giá trị nhúng lúc biên dịch.
/// Không có thì `None` — và app nói "chưa cấu hình", không tự đoán localhost.
pub fn pick_gateway(env_value: Option<&str>, embedded: Option<&str>) -> Option<String> {
    let raw = env_value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .or_else(|| embedded.map(str::trim).filter(|value| !value.is_empty()))?;
    Some(raw.trim_end_matches('/').to_string())
}

fn gateway_url() -> Option<String> {
    let env_value = std::env::var(GATEWAY_ENV).ok();
    pick_gateway(env_value.as_deref(), option_env!("EDUGAME_AI_GATEWAY_URL"))
}

/// Kiểm dữ liệu Ở MÁY trước khi gửi: một tài liệu 20 ký tự không cần đi 2 000 km để bị
/// từ chối. Cùng giới hạn với `requestSchema` của gateway (`zod`).
pub fn validate(request: &CloudRequest) -> Result<(), (&'static str, String)> {
    let length = request.text.trim().chars().count();
    if length < 40 {
        return Err(("invalid_request", format!("Bài học quá ngắn ({length} ký tự, cần ít nhất 40).")));
    }
    if length > 60_000 {
        return Err(("invalid_request", "Bài học quá dài (giới hạn 60 000 ký tự).".to_string()));
    }
    if !(3..=15).contains(&request.question_count) {
        return Err(("invalid_request", "Số câu phải từ 3 đến 15.".to_string()));
    }
    if !matches!(request.template.as_str(), "quiz" | "scenario" | "matching") {
        return Err(("invalid_request", "Thể loại phải là quiz, scenario hoặc matching.".to_string()));
    }
    Ok(())
}

/// Thân request gửi gateway. Tách ra để test khẳng định đúng TÊN TRƯỜNG mà `zod` đọc
/// (`sourceName`, `questionCount`) — sai tên là 400, không phải lỗi hiển nhiên.
pub fn request_body(request: &CloudRequest) -> serde_json::Value {
    serde_json::json!({
        "text": request.text,
        "sourceName": request.source_name,
        "questionCount": request.question_count,
        "template": request.template,
        "grade": request.grade,
        "subject": request.subject,
    })
}

/// Dịch phản hồi của gateway thành trạng thái có tên. Không mạng, nên test được.
pub fn outcome_from_response(status: u16, body: &str) -> CloudOutcome {
    let parsed: serde_json::Value = serde_json::from_str(body).unwrap_or(serde_json::Value::Null);
    let code_field = parsed.get("code").and_then(|value| value.as_str()).unwrap_or("");
    let message_field = parsed
        .get("error")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .to_string();
    match status {
        200 => {
            let game = parsed.get("game").cloned();
            if game.is_none() {
                return CloudOutcome::fail("bad_response", "Máy chủ trả về dữ liệu không có trò chơi.");
            }
            CloudOutcome {
                ok: true,
                game,
                provider: parsed.get("provider").and_then(|value| value.as_str()).map(str::to_string),
                usage: parsed.get("usage").cloned(),
                ..CloudOutcome::default()
            }
        }
        400 => CloudOutcome::fail("invalid_request", if message_field.is_empty() { "Dữ liệu gửi lên chưa hợp lệ." } else { &message_field }),
        401 => CloudOutcome::fail("not_signed_in", "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."),
        429 => {
            let usage = parsed.get("usage").cloned();
            let mut outcome = CloudOutcome::fail("quota_exhausted", "Bạn đã dùng hết lượt tạo game của tháng.");
            outcome.usage = usage;
            outcome
        }
        _ if code_field == "server_not_migrated" => CloudOutcome::fail(
            "server_not_migrated",
            if message_field.is_empty() { "Máy chủ AI chưa được cài đặt đầy đủ." } else { &message_field },
        ),
        502 => CloudOutcome::fail("provider_unavailable", "Dịch vụ AI đang bận. Vui lòng thử lại sau ít phút."),
        // 503 có HAI nghĩa khác nhau và người dùng phải làm hai việc khác nhau: hàng đợi
        // hạn mức bận (`quota_unavailable`, thử lại được) hay dịch vụ hỏng. Mã của
        // gateway quyết định, không phải con số 503 (#341 cùng họ).
        503 if code_field == "quota_unavailable" => {
            CloudOutcome::fail("quota_busy", "Hệ thống đang xử lý nhiều yêu cầu. Vui lòng thử lại sau vài giây.")
        }
        503 => CloudOutcome::fail("gateway_unavailable", "Máy chủ AI đang gặp sự cố. Vui lòng thử lại sau."),
        _ => CloudOutcome::fail("gateway_error", if message_field.is_empty() { "Không gọi được máy chủ AI." } else { &message_field }),
    }
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|error| format!("Không tạo được kết nối HTTPS: {error}"))
}

async fn post_generate(url: &str, token: &str, body: &serde_json::Value) -> Result<(u16, String), String> {
    let response = client()?
        // `reqwest` ở crate này chỉ bật feature `stream`, nên không có `.json()`;
        // thân đã serialize sẵn và đi kèm Content-Type tường minh.
        .post(format!("{url}/v1/generate"))
        .header("Authorization", format!("Bearer {token}"))
        .header("Content-Type", "application/json")
        .body(body.to_string())
        .send()
        .await
        .map_err(|error| format!("Không kết nối được máy chủ AI: {error}"))?;
    let status = response.status().as_u16();
    let text = response.text().await.unwrap_or_default();
    Ok((status, text))
}

/// Lời gọi đầy đủ: token → gateway → nếu 401 thì làm mới token rồi thử lại ĐÚNG một lần.
pub async fn cloud_generate(app: AppHandle, request: CloudRequest) -> CloudOutcome {
    if let Err((code, message)) = validate(&request) {
        return CloudOutcome::fail(code, &message);
    }
    let Some(url) = gateway_url() else {
        return CloudOutcome::fail(
            "gateway_not_configured",
            "Cloud AI chưa được cấu hình trên bản cài này. Bạn vẫn dùng được Local AI.",
        );
    };
    let token = match auth::access_token_for_call(&app) {
        Ok(Some(token)) => token,
        Ok(None) => match auth::refresh_access_token_for_call(&app).await {
            Ok(Some(token)) => token,
            Ok(None) => return CloudOutcome::fail("not_signed_in", "Bạn chưa đăng nhập. Đăng nhập để dùng Cloud AI."),
            Err(message) => return CloudOutcome::fail("not_signed_in", &message),
        },
        Err(message) => return CloudOutcome::fail("session_unreadable", &message),
    };
    let body = request_body(&request);
    let (status, text) = match post_generate(&url, &token, &body).await {
        Ok(result) => result,
        Err(message) => return CloudOutcome::fail("network_error", &message),
    };
    if status == 401 {
        // Token có thể bị thu hồi (đăng xuất ở máy khác, đổi mật khẩu). Làm mới một lần
        // rồi thử lại — không vòng lặp, vì vòng lặp ở đây là vòng lặp đăng nhập.
        match auth::refresh_access_token_for_call(&app).await {
            Ok(Some(fresh)) => match post_generate(&url, &fresh, &body).await {
                Ok((retry_status, retry_text)) => return outcome_from_response(retry_status, &retry_text),
                Err(message) => return CloudOutcome::fail("network_error", &message),
            },
            _ => return CloudOutcome::fail("not_signed_in", "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."),
        }
    }
    outcome_from_response(status, &text)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(text: &str) -> CloudRequest {
        CloudRequest {
            text: text.to_string(),
            source_name: "bai.txt".to_string(),
            question_count: 3,
            template: "quiz".to_string(),
            grade: "3".to_string(),
            subject: "Toán".to_string(),
        }
    }

    #[test]
    fn gateway_url_prefers_the_environment_and_never_guesses() {
        assert_eq!(pick_gateway(Some("http://127.0.0.1:8788/"), None).as_deref(), Some("http://127.0.0.1:8788"));
        assert_eq!(pick_gateway(None, Some("https://ai.example/")).as_deref(), Some("https://ai.example"));
        assert_eq!(pick_gateway(Some("   "), Some("https://ai.example")).as_deref(), Some("https://ai.example"));
        assert_eq!(pick_gateway(Some(""), Some("")), None, "không có cấu hình thì không đoán localhost");
        assert_eq!(pick_gateway(None, None), None);
    }

    #[test]
    fn a_short_lesson_is_rejected_here_not_remotely() {
        let short = validate(&request("quá ngắn"));
        assert_eq!(short.unwrap_err().0, "invalid_request");
        let ok = validate(&request(&"a".repeat(40)));
        assert!(ok.is_ok(), "đúng 40 ký tự là đủ");
        let long = validate(&request(&"a".repeat(60_001)));
        assert_eq!(long.unwrap_err().0, "invalid_request");
    }

    #[test]
    fn question_count_and_template_are_checked_before_the_network() {
        let mut two = request(&"a".repeat(60));
        two.question_count = 2;
        assert_eq!(validate(&two).unwrap_err().0, "invalid_request");
        let mut sixteen = request(&"a".repeat(60));
        sixteen.question_count = 16;
        assert_eq!(validate(&sixteen).unwrap_err().0, "invalid_request");
        let mut odd_template = request(&"a".repeat(60));
        odd_template.template = "trắc nghiệm".to_string();
        assert_eq!(validate(&odd_template).unwrap_err().0, "invalid_request");
        for template in ["quiz", "scenario", "matching"] {
            let mut ok = request(&"a".repeat(60));
            ok.template = template.to_string();
            assert!(validate(&ok).is_ok(), "{template} phải hợp lệ");
        }
    }

    #[test]
    fn the_request_body_uses_the_field_names_zod_reads() {
        let body = request_body(&request(&"a".repeat(60)));
        assert!(body.get("sourceName").is_some(), "zod đọc sourceName, không phải source_name");
        assert!(body.get("questionCount").is_some(), "zod đọc questionCount");
        assert!(body.get("source_name").is_none(), "không gửi tên snake_case");
        assert_eq!(body.get("template").and_then(|value| value.as_str()), Some("quiz"));
    }

    #[test]
    fn responses_become_named_states() {
        assert_eq!(outcome_from_response(401, "{}").code.as_deref(), Some("not_signed_in"));
        assert_eq!(outcome_from_response(429, "{}").code.as_deref(), Some("quota_exhausted"));
        assert_eq!(outcome_from_response(502, "{}").code.as_deref(), Some("provider_unavailable"));
        assert_eq!(outcome_from_response(503, "{}").code.as_deref(), Some("gateway_unavailable"));
        let busy = outcome_from_response(503, r#"{"code":"quota_unavailable"}"#);
        assert_eq!(busy.code.as_deref(), Some("quota_busy"), "hàng đợi bận không phải dịch vụ hỏng");
        let missing = outcome_from_response(500, r#"{"code":"server_not_migrated","error":"thiếu hàm"}"#);
        assert_eq!(missing.code.as_deref(), Some("server_not_migrated"));
        assert_eq!(missing.message.as_deref(), Some("thiếu hàm"));
        let bad = outcome_from_response(400, r#"{"error":"Dữ liệu đầu vào không hợp lệ."}"#);
        assert_eq!(bad.code.as_deref(), Some("invalid_request"));
        assert_eq!(bad.message.as_deref(), Some("Dữ liệu đầu vào không hợp lệ."));
        assert_eq!(outcome_from_response(418, "{}").code.as_deref(), Some("gateway_error"));
    }

    #[test]
    fn a_successful_response_returns_the_game_and_hides_nothing_else() {
        let body = r#"{"game":{"title":"T","questions":[{"id":"q1"}]},"provider":"gemini-3.5-flash-lite","usage":{"allowed":true,"used":1,"quotaLimit":5,"plan":"free"}}"#;
        let outcome = outcome_from_response(200, body);
        assert!(outcome.ok);
        assert_eq!(outcome.game.as_ref().and_then(|game| game.get("title")).and_then(|t| t.as_str()), Some("T"));
        assert_eq!(outcome.provider.as_deref(), Some("gemini-3.5-flash-lite"));
        assert_eq!(outcome.usage.as_ref().and_then(|usage| usage.get("used")).and_then(|v| v.as_u64()), Some(1));
        assert!(outcome.code.is_none(), "thành công không mang mã lỗi");
    }

    #[test]
    fn a_200_without_a_game_is_not_a_success() {
        let outcome = outcome_from_response(200, r#"{"provider":"x"}"#);
        assert!(!outcome.ok);
        assert_eq!(outcome.code.as_deref(), Some("bad_response"));
    }

    /// Payload trả về renderer không được mang token — cùng lời hứa với #337, kiểm ở đây
    /// vì đây là lời gọi duy nhất mang `Authorization` đi ra ngoài.
    #[test]
    fn the_outcome_never_carries_a_token() {
        let body = r#"{"game":{"title":"T","questions":[]},"provider":"m","usage":{},"access_token":"SECRET"}"#;
        let payload = serde_json::to_string(&outcome_from_response(200, body)).expect("serialize");
        assert!(!payload.contains("SECRET"), "{payload}");
        assert!(!payload.contains("access_token"), "{payload}");
    }
}
