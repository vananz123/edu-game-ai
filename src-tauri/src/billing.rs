// billing.rs — nút "Nâng cấp lên Pro" của ứng dụng (#364).
//
// Phạm vi cố ý rất hẹp, và đó là điều luật an toàn của tệp này:
//
//   * Renderer KHÔNG BAO GIỜ thấy số thẻ, mã PIN, hay khoá của nhà cung cấp. Nó chỉ thấy
//     giá, gói đang dùng, và một `checkoutUrl`.
//   * Rust không tự quyết định "đã trả tiền". Quyền lợi Pro chỉ đổi khi gateway nhận webhook
//     đã xác minh chữ ký, nên app đọc lại trạng thái thay vì tự suy ra từ việc "người dùng đã
//     đóng trình duyệt".
//   * Một cấu hình thiếu là một TRẠNG THÁI CÓ TÊN (`billing_not_configured` + danh sách biến
//     thiếu), không phải một cái nút im lặng.

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::auth;
use crate::cloud;

/// Trạng thái thanh toán mà renderer cần. Mọi trường đều có mặt để câu chữ của UI không phải
/// đoán: thiếu `priceVnd` thì không được in "0đ".
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct BillingStatus {
    pub ok: bool,
    pub configured: bool,
    pub missing: Vec<String>,
    pub provider: String,
    pub price_vnd: i64,
    pub period_days: i64,
    pub credits: i64,
    pub plan: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub period_end: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub order: Option<BillingOrder>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct BillingOrder {
    pub status: String,
    pub amount_vnd: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub checkout_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<String>,
    pub message: String,
}

impl BillingStatus {
    fn fail(code: &str, message: &str) -> Self {
        Self { ok: false, code: Some(code.to_string()), message: Some(message.to_string()), ..Self::default() }
    }
}

/// Kết quả của một lần bấm "Nâng cấp": trình duyệt đã mở, hay chưa và vì sao.
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct CheckoutOutcome {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub amount_vnd: Option<i64>,
}

fn text_of(value: &serde_json::Value, key: &str) -> String {
    value.get(key).and_then(|item| item.as_str()).unwrap_or("").to_string()
}

fn int_of(value: &serde_json::Value, key: &str) -> i64 {
    value.get(key).and_then(|item| item.as_i64()).unwrap_or(0).max(0)
}

/// Dịch `GET /v1/billing/status` thành trạng thái. Hàm thuần, nên test được không cần mạng.
pub fn billing_from_json(value: &serde_json::Value) -> Result<BillingStatus, String> {
    if !value.is_object() {
        return Err("phản hồi thanh toán không phải đối tượng".to_string());
    }
    // Một phản hồi không có `configured` là phản hồi của bản gateway cũ: nói thẳng là chưa
    // cấu hình, còn hơn để UI mời giáo viên bấm một nút không tồn tại.
    let configured = value.get("configured").and_then(|item| item.as_bool()).unwrap_or(false);
    let order = value.get("order").and_then(|item| item.as_object()).map(|_| BillingOrder {
        status: text_of(value.get("order").unwrap(), "status"),
        amount_vnd: int_of(value.get("order").unwrap(), "amountVnd"),
        checkout_url: value.get("order").unwrap().get("checkoutUrl").and_then(|item| item.as_str()).map(str::to_string),
        expires_at: value.get("order").unwrap().get("expiresAt").and_then(|item| item.as_str()).map(str::to_string),
        message: text_of(value.get("order").unwrap(), "message"),
    });
    Ok(BillingStatus {
        ok: true,
        configured,
        missing: value
            .get("missing")
            .and_then(|item| item.as_array())
            .map(|items| items.iter().filter_map(|item| item.as_str().map(str::to_string)).collect())
            .unwrap_or_default(),
        provider: text_of(value, "provider"),
        price_vnd: int_of(value, "priceVnd"),
        period_days: int_of(value, "periodDays"),
        credits: int_of(value, "credits"),
        plan: text_of(value, "plan"),
        status: text_of(value, "status"),
        period_end: value.get("periodEnd").and_then(|item| item.as_str()).map(str::to_string),
        order,
        code: None,
        message: None,
    })
}

/// `GET /v1/billing/status` bằng token của phiên. Không bao giờ ném.
pub async fn cloud_billing(app: AppHandle) -> BillingStatus {
    let Some(url) = cloud::gateway_url() else {
        return BillingStatus::fail("gateway_not_configured", "Bản cài này chưa có địa chỉ máy chủ Cloud AI.");
    };
    let token = match auth::access_token_for_call(&app) {
        Ok(Some(token)) => token,
        Ok(None) => match auth::refresh_access_token_for_call(&app).await {
            Ok(Some(token)) => token,
            Ok(None) => return BillingStatus::fail("not_signed_in", "Bạn chưa đăng nhập."),
            Err(message) => return BillingStatus::fail("not_signed_in", &message),
        },
        Err(message) => return BillingStatus::fail("session_unreadable", &message),
    };
    let response = match cloud::client_for_billing() {
        Ok(client) => {
            client.get(format!("{url}/v1/billing/status")).header("Authorization", format!("Bearer {token}")).send().await
        }
        Err(_) => {
            return BillingStatus::fail("network_error", "Không tạo được kết nối tới máy chủ thanh toán.")
        }
    };
    let response = match response {
        Ok(response) => response,
        Err(_) => return BillingStatus::fail("network_error", "Không đọc được thông tin thanh toán. Kiểm tra kết nối mạng."),
    };
    if response.status().as_u16() == 401 {
        return BillingStatus::fail("not_signed_in", "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
    }
    let status = response.status().as_u16();
    let text = response.text().await.unwrap_or_default();
    if status != 200 {
        return BillingStatus::fail("gateway_error", &format!("Máy chủ trả về {status}."));
    }
    match serde_json::from_str::<serde_json::Value>(&text).map_err(|error| error.to_string()).and_then(|value| billing_from_json(&value)) {
        Ok(mut parsed) => {
            parsed.ok = true;
            parsed
        }
        Err(message) => BillingStatus::fail("bad_response", &format!("Phản hồi thanh toán không đọc được: {message}")),
    }
}

/// Bấm "Nâng cấp": xin một đường link rồi mở bằng trình duyệt hệ thống.
///
/// Vì sao mở trình duyệt chứ không mở trong app: trang thanh toán của ngân hàng cần địa chỉ
/// thật để hiện đúng (và cần cả cookie/3DS của ngân hàng). Một iframe trong WebView2 vừa
/// không đăng nhập được, vừa khiến giáo viên phải gõ số thẻ vào cửa sổ của một ứng dụng lạ.
pub async fn cloud_checkout(app: AppHandle) -> CheckoutOutcome {
    let Some(url) = cloud::gateway_url() else {
        return CheckoutOutcome {
            ok: false,
            message: "Bản cài này chưa có địa chỉ máy chủ Cloud AI.".to_string(),
            code: Some("gateway_not_configured".to_string()),
            ..CheckoutOutcome::default()
        };
    };
    let token = match auth::access_token_for_call(&app) {
        Ok(Some(token)) => token,
        Ok(None) => match auth::refresh_access_token_for_call(&app).await {
            Ok(Some(token)) => token,
            Ok(None) => {
                return CheckoutOutcome {
                    ok: false,
                    message: "Bạn cần đăng nhập trước khi nâng cấp gói.".to_string(),
                    code: Some("not_signed_in".to_string()),
                    ..CheckoutOutcome::default()
                }
            }
            Err(message) => {
                return CheckoutOutcome {
                    ok: false,
                    message,
                    code: Some("not_signed_in".to_string()),
                    ..CheckoutOutcome::default()
                }
            }
        },
        Err(message) => {
            return CheckoutOutcome {
                ok: false,
                message,
                code: Some("session_unreadable".to_string()),
                ..CheckoutOutcome::default()
            }
        }
    };
    let request = match cloud::client_for_billing() {
        Ok(client) => {
            client
                .post(format!("{url}/v1/billing/checkout"))
                .header("Authorization", format!("Bearer {token}"))
                .header("Content-Type", "application/json")
                .body("{}".to_string())
                .send()
                .await
        }
        Err(_) => {
            return CheckoutOutcome {
                ok: false,
                message: "Không tạo được kết nối tới máy chủ thanh toán.".to_string(),
                code: Some("network_error".to_string()),
                ..CheckoutOutcome::default()
            }
        }
    };
    let response = match request {
        Ok(response) => response,
        Err(_) => {
            return CheckoutOutcome {
                ok: false,
                message: "Không kết nối được máy chủ thanh toán. Kiểm tra mạng rồi thử lại.".to_string(),
                code: Some("network_error".to_string()),
                ..CheckoutOutcome::default()
            }
        }
    };
    let status = response.status().as_u16();
    let text = response.text().await.unwrap_or_default();
    let value: serde_json::Value = serde_json::from_str(&text).unwrap_or(serde_json::Value::Null);
    if status == 503 {
        let missing = value
            .get("missing")
            .and_then(|item| item.as_array())
            .map(|items| items.iter().filter_map(|item| item.as_str()).collect::<Vec<_>>().join(", "))
            .unwrap_or_default();
        return CheckoutOutcome {
            ok: false,
            message: if missing.is_empty() {
                "Máy chủ chưa cấu hình thanh toán.".to_string()
            } else {
                format!("Máy chủ chưa cấu hình thanh toán (thiếu: {missing}).")
            },
            code: Some("billing_not_configured".to_string()),
            ..CheckoutOutcome::default()
        };
    }
    if status == 401 {
        return CheckoutOutcome {
            ok: false,
            message: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.".to_string(),
            code: Some("not_signed_in".to_string()),
            ..CheckoutOutcome::default()
        };
    }
    let checkout_url = value.get("checkoutUrl").and_then(|item| item.as_str()).unwrap_or("").to_string();
    if status != 200 || checkout_url.is_empty() {
        let message = value.get("error").and_then(|item| item.as_str()).unwrap_or("Chưa tạo được đường link thanh toán.");
        return CheckoutOutcome {
            ok: false,
            message: message.to_string(),
            code: Some(text_of(&value, "code")),
            ..CheckoutOutcome::default()
        };
    }
    if let Err(message) = auth::open_browser(&checkout_url) {
        // Link đã có nhưng không mở được: trả link để UI nói "mở tay" thay vì im lặng.
        return CheckoutOutcome {
            ok: false,
            url: Some(checkout_url),
            message: format!("Không mở được trình duyệt: {message}"),
            code: Some("browser_blocked".to_string()),
            amount_vnd: Some(int_of(&value, "amountVnd")),
        };
    }
    CheckoutOutcome {
        ok: true,
        url: Some(checkout_url),
        message: value.get("message").and_then(|item| item.as_str()).unwrap_or("Đã mở trang thanh toán trong trình duyệt.").to_string(),
        code: None,
        amount_vnd: Some(int_of(&value, "amountVnd")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn status_json() -> serde_json::Value {
        serde_json::json!({
            "ok": true,
            "configured": true,
            "missing": [],
            "provider": "payos",
            "priceVnd": 99000,
            "periodDays": 14,
            "credits": 500,
            "plan": "free",
            "status": "inactive",
            "periodEnd": null,
            "order": {
                "status": "pending",
                "amountVnd": 99000,
                "checkoutUrl": "https://pay.payos.vn/web/abc",
                "expiresAt": "2026-11-26T09:20:00.000Z",
                "message": "Đang chờ chuyển khoản 99.000đ. Gói Pro mở ngay khi tiền tới."
            }
        })
    }

    #[test]
    fn a_status_payload_is_read_field_by_field() {
        let parsed = billing_from_json(&status_json()).expect("đọc được");
        assert_eq!(parsed.price_vnd, 99_000);
        assert_eq!(parsed.period_days, 14);
        assert_eq!(parsed.credits, 500);
        assert_eq!(parsed.plan, "free");
        assert!(parsed.configured);
        let order = parsed.order.expect("có đơn");
        assert_eq!(order.status, "pending");
        assert_eq!(order.checkout_url.as_deref(), Some("https://pay.payos.vn/web/abc"));
    }

    #[test]
    fn a_gateway_without_billing_fields_is_not_treated_as_configured() {
        // Bản gateway cũ chỉ trả `{ok:true}`: phải đọc là CHƯA cấu hình, không phải "miễn phí".
        let parsed = billing_from_json(&serde_json::json!({ "ok": true })).expect("vẫn đọc được");
        assert_eq!(parsed.configured, false);
        assert_eq!(parsed.price_vnd, 0);
        assert_eq!(parsed.order, None);
    }

    #[test]
    fn a_non_object_payload_is_an_error_not_a_default() {
        assert!(billing_from_json(&serde_json::json!("ok")).is_err());
    }

    #[test]
    fn a_missing_price_is_zero_so_the_ui_cannot_print_a_wrong_number() {
        let parsed = billing_from_json(&serde_json::json!({
            "configured": true, "priceVnd": "99000", "plan": "plus"
        }))
        .expect("đọc được");
        assert_eq!(parsed.price_vnd, 0, "chuỗi không phải số: UI phải biết là chưa có giá");
    }
}
