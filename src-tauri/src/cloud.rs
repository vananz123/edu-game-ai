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
    /// #357: khoá cho MỘT lần bấm. Rust KHÔNG sinh khoá mới khi thử lại sau 401 — khoá đi
    /// cùng thân request, nên lần thử lại vẫn là cùng một lần bấm với gateway.
    #[serde(default)]
    pub idempotency_key: Option<String>,
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
    if let Some(key) = request.idempotency_key.as_deref() {
        if !key.trim().is_empty() && !key_is_usable(key) {
            return Err((
                "invalid_request",
                "Mã của lần tạo này không hợp lệ. Hãy bấm tạo lại.".to_string(),
            ));
        }
    }
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
    let mut body = serde_json::json!({
        "text": request.text,
        "sourceName": request.source_name,
        "questionCount": request.question_count,
        "template": request.template,
        "grade": request.grade,
        "subject": request.subject,
    });
    // Chỉ gửi khi có: một trường rỗng sẽ bị gateway coi là "có khoá nhưng sai dạng".
    if let Some(key) = request.idempotency_key.as_deref().map(str::trim).filter(|k| !k.is_empty()) {
        body["idempotencyKey"] = serde_json::Value::String(key.to_string());
    }
    body
}

/// Khoá phải đúng dạng gateway chấp nhận (8–64 ký tự `[A-Za-z0-9_-]`). Kiểm Ở MÁY trước khi
/// gửi: một khoá sai dạng làm hỏng cả lần gọi mà giáo viên đã bấm.
pub fn key_is_usable(key: &str) -> bool {
    let trimmed = key.trim();
    let length = trimmed.len();
    length >= 8
        && length <= 64
        && trimmed
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
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
            // Dùng câu của máy chủ khi có: gói trả phí bị trừ bằng CREDITS, không phải bằng
            // lượt (#348), nên một câu viết sẵn ở đây sẽ nói sai đơn vị của người dùng.
            let usage = parsed.get("usage").cloned();
            let message = if message_field.is_empty() {
                "Bạn đã dùng hết lượt tạo game của tháng."
            } else {
                &message_field
            };
            let mut outcome = CloudOutcome::fail("quota_exhausted", message);
            outcome.usage = usage;
            outcome
        }
        // #357: cùng một lần bấm được gửi lại ⇒ gateway đã trả lời 409 và KHÔNG trừ lượt.
        // Câu này phải nói việc cần làm, không phải "lỗi 409".
        409 => CloudOutcome::fail(
            "duplicate_request",
            "Lần tạo này đã hoàn tất trước đó nên không trừ lượt lần hai. Mở Thư viện để xem trò chơi vừa tạo; nếu chưa thấy, hãy bấm tạo lại.",
        ),
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

/// Đồng hồ hạn mức tháng (#354) — "còn bao nhiêu", KHÔNG trừ gì.
///
/// Đây là phép ĐỌC nên nó phải trả đúng CẢ BỐN thứ cùng lúc: gói, đơn vị, đã dùng, hạn mức.
/// Thiếu đơn vị thì "còn 3" không nói được là 3 lượt hay 3 credits.
#[derive(Debug, Clone, Serialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UsageMeter {
    pub ok: bool,
    pub plan: String,
    pub status: String,
    pub month: String,
    pub unit: String,
    pub used: i64,
    pub limit: i64,
    pub cost: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

impl UsageMeter {
    fn fail(code: &str, message: &str) -> Self {
        Self { ok: false, code: Some(code.to_string()), message: Some(message.to_string()), ..Self::default() }
    }
}

fn int_field(value: &serde_json::Value, key: &str) -> i64 {
    let Some(raw) = value.get(key) else { return 0 };
    if let Some(number) = raw.as_i64() {
        return number.max(0);
    }
    raw.as_str().and_then(|text| text.trim().parse::<i64>().ok()).unwrap_or(0).max(0)
}

/// Dịch phản hồi `GET /v1/usage` thành đồng hồ. Thuần, nên test được không cần mạng.
///
/// `unit` lạ bị chuẩn hoá về `generations`: một đơn vị không đọc được không được phép đi
/// tiếp vào câu "còn N <đơn vị>".
pub fn meter_from_json(value: &serde_json::Value) -> Result<UsageMeter, String> {
    if !value.is_object() {
        return Err("phản hồi hạn mức không phải đối tượng".to_string());
    }
    let plan = value.get("plan").and_then(|item| item.as_str()).unwrap_or("");
    if plan.is_empty() {
        return Err("phản hồi hạn mức thiếu tên gói".to_string());
    }
    Ok(UsageMeter {
        ok: true,
        plan: plan.to_string(),
        status: value.get("status").and_then(|item| item.as_str()).unwrap_or("").to_string(),
        month: value.get("month").and_then(|item| item.as_str()).unwrap_or("").to_string(),
        unit: match value.get("unit").and_then(|item| item.as_str()) {
            Some("credits") => "credits".to_string(),
            _ => "generations".to_string(),
        },
        used: int_field(value, "used"),
        limit: int_field(value, "limit"),
        cost: int_field(value, "cost"),
        code: None,
        message: None,
    })
}

/// Đọc đồng hồ từ gateway bằng token của phiên. Không bao giờ ném: mọi nhánh hỏng thành
/// `code` có tên, vì "chưa đăng nhập" và "máy chủ chưa cài" cần hai lời mời khác nhau.
pub async fn cloud_usage(app: AppHandle) -> UsageMeter {
    let Some(url) = gateway_url() else {
        return UsageMeter::fail(
            "gateway_not_configured",
            "Cloud AI chưa được cấu hình trên bản cài này.",
        );
    };
    let token = match auth::access_token_for_call(&app) {
        Ok(Some(token)) => token,
        Ok(None) => match auth::refresh_access_token_for_call(&app).await {
            Ok(Some(token)) => token,
            Ok(None) => return UsageMeter::fail("not_signed_in", "Bạn chưa đăng nhập."),
            Err(message) => return UsageMeter::fail("not_signed_in", &message),
        },
        Err(message) => return UsageMeter::fail("session_unreadable", &message),
    };
    let response = match client() {
        Ok(client) => client,
        Err(message) => return UsageMeter::fail("network_error", &message),
    }
    .get(format!("{url}/v1/usage"))
    .header("Authorization", format!("Bearer {token}"))
    .send()
    .await;
    let response = match response {
        Ok(response) => response,
        Err(error) => return UsageMeter::fail("network_error", &format!("Không đọc được hạn mức: {error}")),
    };
    let status = response.status().as_u16();
    let text = response.text().await.unwrap_or_default();
    if status == 401 {
        return UsageMeter::fail("not_signed_in", "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
    }
    if !(200..300).contains(&status) {
        return UsageMeter::fail(&format!("http_{status}"), "Chưa đọc được hạn mức tháng này.");
    }
    let parsed: serde_json::Value = match serde_json::from_str(&text) {
        Ok(value) => value,
        Err(error) => return UsageMeter::fail("bad_response", &format!("không đọc được phản hồi: {error}")),
    };
    match meter_from_json(&parsed) {
        Ok(meter) => meter,
        Err(message) => UsageMeter::fail("bad_response", &message),
    }
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
            idempotency_key: None,
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
        // Câu của máy chủ thắng câu viết sẵn: gói trả phí bị trừ bằng credits, không phải lượt.
        let paid = outcome_from_response(
            429,
            r#"{"error":"Bạn đã dùng hết credits tạo game của tháng.","usage":{"unit":"credits"}}"#,
        );
        assert_eq!(paid.message.as_deref(), Some("Bạn đã dùng hết credits tạo game của tháng."));
        assert!(paid.usage.is_some(), "usage vẫn được chuyển tiếp để UI hiện được số còn lại");
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
    #[test]
    fn meter_carries_unit_with_the_numbers() {
        let meter = meter_from_json(&serde_json::json!({
            "plan": "plus", "status": "active", "month": "2026-11",
            "unit": "credits", "used": 4, "limit": 500, "cost": 2
        })).expect("phải đọc được");
        assert!(meter.ok);
        assert_eq!(meter.plan, "plus");
        assert_eq!(meter.unit, "credits");
        assert_eq!(meter.used, 4);
        assert_eq!(meter.limit, 500);
        assert_eq!(meter.cost, 2);
    }

    #[test]
    fn meter_normalises_an_unknown_unit() {
        let meter = meter_from_json(&serde_json::json!({ "plan": "free", "unit": "bananas" })).expect("json");
        assert_eq!(meter.unit, "generations");
    }

    #[test]
    fn meter_reads_text_numbers_and_clamps_negatives() {
        let meter = meter_from_json(&serde_json::json!({ "plan": "free", "used": "3", "limit": -5 })).expect("json");
        assert_eq!(meter.used, 3);
        assert_eq!(meter.limit, 0);
    }

    #[test]
    fn meter_without_a_plan_is_an_error_not_free() {
        // Thiếu tên gói mà đoán "free" là báo cho giáo viên trả phí rằng họ được 5 lượt.
        assert!(meter_from_json(&serde_json::json!({ "used": 1 })).is_err());
        assert!(meter_from_json(&serde_json::json!([1, 2])).is_err());
    }

    #[test]
    fn the_body_carries_the_key_of_this_click_only_when_present() {
        let mut request = request("một bài học đủ dài để không bị từ chối ở máy");
        request.idempotency_key = Some("click-abc-123".to_string());
        let body = request_body(&request);
        assert_eq!(body.get("idempotencyKey").and_then(|v| v.as_str()), Some("click-abc-123"));

        request.idempotency_key = Some("   ".to_string());
        assert!(request_body(&request).get("idempotencyKey").is_none(), "khoá rỗng không được gửi");
        request.idempotency_key = None;
        assert!(request_body(&request).get("idempotencyKey").is_none());
    }

    #[test]
    fn a_malformed_key_is_refused_here_not_remotely() {
        assert!(key_is_usable("click-abc-123"));
        assert!(key_is_usable("A1_b-2xyz"), "8 ký tự là vừa đủ");
        assert!(!key_is_usable("A1_b-2"), "6 ký tự là quá ngắn");
        assert!(!key_is_usable("ngan"), "quá ngắn");
        assert!(!key_is_usable("có dấu cách trong khoá"));
        assert!(!key_is_usable("khoá-có-dấu-tiếng-việt"));
        assert!(!key_is_usable(&"x".repeat(65)));

        let mut request = request("một bài học đủ dài để không bị từ chối ở máy");
        request.idempotency_key = Some("sai dạng!".to_string());
        assert_eq!(validate(&request).unwrap_err().0, "invalid_request");
    }

    #[test]
    fn a_repeated_click_is_a_named_state_with_a_next_step() {
        let outcome = outcome_from_response(
            409,
            "{\"code\":\"duplicate_request\",\"error\":\"đã hoàn tất\"}",
        );
        assert!(!outcome.ok);
        assert_eq!(outcome.code.as_deref(), Some("duplicate_request"));
        let message = outcome.message.unwrap_or_default();
        assert!(message.contains("Thư viện"), "phải nói việc cần làm: {message}");
        assert!(message.contains("không trừ lượt lần hai"), "phải nói về tiền: {message}");
    }

}
