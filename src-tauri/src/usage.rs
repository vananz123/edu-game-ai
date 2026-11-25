// usage.rs — sổ dùng AI của CHÍNH người đang đăng nhập (#352).
//
// `ai_usage_log` đã được gateway ghi từ #351. Đọc nó từ renderer là không được: hàng
// `select` cần `Authorization: Bearer <access_token>`, và token chỉ sống trong tiến trình
// này + blob DPAPI (#337). Nên phép đọc cũng nằm ở Rust, và renderer chỉ nhận các con số.
//
// Đọc bằng **anon key** + token của phiên, KHÔNG dùng service_role: service_role bỏ qua
// RLS, nghĩa là một lỗi `user_id` sẽ cho giáo viên xem sổ của người khác. Policy
// `Users view own usage` (migration 003) là tầng thứ hai, và nó chỉ có tác dụng khi
// request đi bằng đúng token của người dùng.

use serde::Serialize;
use tauri::AppHandle;

use crate::auth;

/// Số dòng tối đa mỗi lần đọc. Sổ là để trả lời "tháng này tôi mất gì", không phải để
/// tải cả năm.
pub const MAX_ROWS: u32 = 30;
pub const DEFAULT_ROWS: u32 = 10;

/// Một dòng sổ, ở dạng renderer dùng được: đơn vị và giá đi CÙNG NHAU (#348).
#[derive(Debug, Clone, Serialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UsageRow {
    pub status: String,
    pub feature: String,
    pub cost: i64,
    pub unit: String,
    pub plan: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub questions: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    pub at: String,
}

#[derive(Debug, Clone, Serialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UsageHistory {
    pub ok: bool,
    pub rows: Vec<UsageRow>,
    /// Mã máy đọc được: `not_signed_in` | `account_not_configured` | `http_<status>` |
    /// `bad_response`. UI dịch thành câu, cổng kiểm tra bằng mã.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

impl UsageHistory {
    fn fail(code: &str, message: &str) -> Self {
        Self { ok: false, rows: Vec::new(), code: Some(code.to_string()), message: Some(message.to_string()) }
    }
}

/// Đường dẫn REST. `limit` bị kẹp ở `MAX_ROWS` phía máy này, không tin số do UI gửi.
pub fn request_path(user_id: &str, limit: u32) -> String {
    let capped = limit.clamp(1, MAX_ROWS);
    format!(
        "/rest/v1/ai_usage_log?user_id=eq.{user_id}&select=status,feature,credit_cost,completed_at,metadata&order=created_at.desc&limit={capped}"
    )
}

fn number_field(value: &serde_json::Value, key: &str) -> Option<i64> {
    let raw = value.get(key)?;
    if let Some(number) = raw.as_i64() {
        return Some(number);
    }
    raw.as_str().and_then(|text| text.trim().parse::<i64>().ok())
}

/// Dịch một hàng `ai_usage_log` thành dòng sổ. Thuần, nên test được không cần mạng.
///
/// `metadata` là `jsonb` tự do: đọc phòng thủ, thiếu thì dùng `generations` (đơn vị cũ)
/// chứ không bỏ cả dòng — một dòng không đọc được đơn vị vẫn là một lần giáo viên đã tiêu.
pub fn row_from_log(value: &serde_json::Value) -> UsageRow {
    let metadata = value.get("metadata").cloned().unwrap_or(serde_json::Value::Null);
    let unit = metadata
        .get("unit")
        .and_then(|item| item.as_str())
        .filter(|text| *text == "credits" || *text == "generations")
        .unwrap_or("generations");
    let plan = metadata.get("plan").and_then(|item| item.as_str()).unwrap_or("");
    UsageRow {
        status: value.get("status").and_then(|item| item.as_str()).unwrap_or("unknown").to_string(),
        feature: value.get("feature").and_then(|item| item.as_str()).unwrap_or("").to_string(),
        cost: number_field(value, "credit_cost").unwrap_or(0).max(0),
        unit: unit.to_string(),
        plan: plan.to_string(),
        questions: number_field(&metadata, "questions"),
        error: metadata.get("error").and_then(|item| item.as_str()).map(str::to_string),
        at: value
            .get("completed_at")
            .and_then(|item| item.as_str())
            .unwrap_or("")
            .to_string(),
    }
}

/// Dịch cả phản hồi. Không phải mảng ⇒ lỗi có tên, không phải danh sách rỗng: một sổ
/// rỗng và một phản hồi hỏng phải không được hiện giống nhau.
pub fn rows_from_body(body: &str) -> Result<Vec<UsageRow>, String> {
    let parsed: serde_json::Value =
        serde_json::from_str(body).map_err(|error| format!("không đọc được phản hồi: {error}"))?;
    let Some(items) = parsed.as_array() else {
        return Err("phản hồi không phải danh sách".to_string());
    };
    Ok(items.iter().map(row_from_log).collect())
}

/// Đọc sổ của người đang đăng nhập. Không ném lỗi: mọi nhánh hỏng thành `code` có tên,
/// vì "chưa đăng nhập" và "máy chủ chưa cài" cần hai lời mời khác nhau (#341 cùng họ).
pub async fn usage_history(app: &AppHandle, limit: u32) -> UsageHistory {
    let Some(config) = auth::CloudConfig::from_env() else {
        return UsageHistory::fail(
            "account_not_configured",
            "Máy này chưa cấu hình tài khoản cloud.",
        );
    };
    let token = match auth::access_token_for_call(app) {
        Ok(Some(token)) => token,
        Ok(None) => match auth::refresh_access_token_for_call(app).await {
            Ok(Some(token)) => token,
            Ok(None) => {
                return UsageHistory::fail("not_signed_in", "Chưa đăng nhập bằng tài khoản nào.");
            }
            Err(error) => return UsageHistory::fail("token_refresh_failed", &error),
        },
        Err(error) => return UsageHistory::fail("session_error", &error),
    };
    let Some(session) = auth::auth_get_session(app.clone()).ok().flatten() else {
        return UsageHistory::fail("not_signed_in", "Chưa đăng nhập bằng tài khoản nào.");
    };
    let user_id = session.user_id;
    if user_id.trim().is_empty() {
        return UsageHistory::fail("not_signed_in", "Phiên đăng nhập thiếu mã người dùng.");
    }

    let url = format!("{}{}", config.base_url, request_path(&user_id, limit));
    let request = reqwest::Client::new()
        .get(&url)
        .header("apikey", &config.anon_key)
        .header("Authorization", format!("Bearer {token}"))
        .header("Accept", "application/json")
        .timeout(std::time::Duration::from_secs(15));
    let response = match request.send().await {
        Ok(response) => response,
        Err(error) => {
            return UsageHistory::fail(
                "network_error",
                &format!("Không đọc được sổ dùng AI: {error}"),
            );
        }
    };
    let status = response.status().as_u16();
    let body = response.text().await.unwrap_or_default();
    if !(200..300).contains(&status) {
        return UsageHistory::fail(&format!("http_{status}"), &auth::translate_auth_error(status, &body));
    }
    match rows_from_body(&body) {
        Ok(rows) => UsageHistory { ok: true, rows, code: None, message: None },
        Err(error) => UsageHistory::fail("bad_response", &error),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_pins_user_limit_and_columns() {
        let path = request_path("u-1", 5);
        assert!(path.starts_with("/rest/v1/ai_usage_log?"));
        assert!(path.contains("user_id=eq.u-1"));
        assert!(path.contains("limit=5"));
        assert!(path.contains("order=created_at.desc"));
        // Chỉ đọc cột cần: không tải `metadata` của người khác nhiều hơn phải có.
        assert!(path.contains("select=status,feature,credit_cost,completed_at,metadata"));
    }

    #[test]
    fn path_caps_a_greedy_limit() {
        assert!(request_path("u", 9999).ends_with("limit=30"));
        assert!(request_path("u", 0).ends_with("limit=1"));
    }

    #[test]
    fn row_carries_unit_with_cost() {
        let row = row_from_log(&serde_json::json!({
            "status": "completed",
            "feature": "question_generation",
            "credit_cost": 2,
            "completed_at": "2026-11-25T04:00:00.000Z",
            "metadata": { "unit": "credits", "plan": "plus", "questions": 5 }
        }));
        assert_eq!(row.unit, "credits");
        assert_eq!(row.plan, "plus");
        assert_eq!(row.cost, 2);
        assert_eq!(row.questions, Some(5));
        assert_eq!(row.error, None);
        assert_eq!(row.at, "2026-11-25T04:00:00.000Z");
    }

    #[test]
    fn failed_row_keeps_zero_cost_and_reason() {
        let row = row_from_log(&serde_json::json!({
            "status": "failed",
            "feature": "question_generation",
            "credit_cost": 0,
            "completed_at": "2026-11-25T04:10:00.000Z",
            "metadata": { "unit": "generations", "plan": "free", "questions": 0, "error": "gemini_404" }
        }));
        assert_eq!(row.cost, 0);
        assert_eq!(row.error.as_deref(), Some("gemini_404"));
        assert_eq!(row.unit, "generations");
    }

    #[test]
    fn missing_metadata_still_yields_a_row() {
        // Một dòng cũ (hoặc metadata bị xoá) vẫn là một lần đã tiêu: không được bỏ.
        let row = row_from_log(&serde_json::json!({"status": "completed", "credit_cost": 1}));
        assert_eq!(row.unit, "generations");
        assert_eq!(row.plan, "");
        assert_eq!(row.cost, 1);
        assert_eq!(row.questions, None);
        assert_eq!(row.at, "");
    }

    #[test]
    fn unknown_unit_is_normalised_not_propagated() {
        let row = row_from_log(&serde_json::json!({
            "status": "completed", "credit_cost": 1,
            "metadata": { "unit": "bananas", "plan": "free" }
        }));
        assert_eq!(row.unit, "generations");
    }

    #[test]
    fn text_numbers_are_read() {
        // PostgREST trả số lớn dạng chuỗi; đọc cả hai để không mất giá.
        let row = row_from_log(&serde_json::json!({
            "status": "completed", "credit_cost": "2",
            "metadata": { "unit": "credits", "questions": "5" }
        }));
        assert_eq!(row.cost, 2);
        assert_eq!(row.questions, Some(5));
    }

    #[test]
    fn negative_cost_is_clamped() {
        let row = row_from_log(&serde_json::json!({"status": "completed", "credit_cost": -4}));
        assert_eq!(row.cost, 0);
    }

    #[test]
    fn body_of_objects_parses_in_order() {
        let body = r#"[{"status":"completed","credit_cost":1,"metadata":{"unit":"generations","questions":3}},{"status":"failed","credit_cost":0,"metadata":{}}]"#;
        let rows = rows_from_body(body).expect("phải đọc được");
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].status, "completed");
        assert_eq!(rows[1].status, "failed");
    }

    #[test]
    fn empty_list_is_not_an_error() {
        assert_eq!(rows_from_body("[]").expect("rỗng vẫn hợp lệ").len(), 0);
    }

    #[test]
    fn broken_body_is_a_named_error_not_an_empty_log() {
        // Sổ rỗng và phản hồi hỏng không được hiện giống nhau: một cái là "chưa tiêu gì",
        // cái kia là "không đọc được" — và giáo viên cần biết mình đang nhìn cái nào.
        assert!(rows_from_body("{\"message\":\"nope\"}").is_err());
        assert!(rows_from_body("<html>").is_err());
    }

    #[test]
    fn failure_codes_are_machine_readable() {
        let failed = UsageHistory::fail("not_signed_in", "Chưa đăng nhập.");
        assert!(!failed.ok);
        assert_eq!(failed.code.as_deref(), Some("not_signed_in"));
        assert!(failed.rows.is_empty());
        assert!(serde_json::to_string(&failed).expect("json").contains("not_signed_in"));
    }
}
