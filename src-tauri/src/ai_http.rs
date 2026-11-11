//! Một lượt HTTP tới nhà cung cấp AI, chạy trong Rust để API key không bao giờ
//! đi vào V8.
//!
//! TypeScript giữ nguyên toàn bộ phần dựng prompt/sửa JSON/chuẩn hoá lỗi
//! (`requestChatJson`, `classifyProviderHttpError`); ở đây chỉ có phần mà lớp
//! renderer không được phép giữ: địa chỉ thật, khoá thật, thời gian chờ, huỷ và
//! khoá một-lượt (`AiGate`). V8 gọi op đồng bộ `__eg_http` và nhận lại
//! `{ok,status,body}` hoặc một lỗi có `kind`; `ai-transport.ts` biến những lỗi
//! đó thành `[AI_*]` y như bản Electron.
//!
//! Chuyển hướng bị tắt (`Policy::none()`): một `3xx` là lỗi trạng thái, không
//! phải một lần gửi khoá sang máy chủ khác. Electron dùng `redirect:'error'` nên
//! nó ném `TypeError`; ở đây `requestChatJson` phân loại `3xx` thành lỗi nhà
//! cung cấp. Khác biệt câu chữ được ghi ở `docs/DECISIONS.md`, còn bất biến bảo
//! mật thì giữ nguyên.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde_json::{json, Value};
use tokio::sync::Notify;

/// Cờ huỷ dùng chung giữa `ai:cancel` và lượt HTTP đang chờ.
#[derive(Debug, Default)]
pub struct CancelFlag {
    cancelled: AtomicBool,
    notify: Notify,
}

impl CancelFlag {
    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
        self.notify.notify_waiters();
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }

    async fn wait(&self) {
        // Kiểm tra cờ trước khi chờ: một lần huỷ đến giữa hai bước không được
        // biến thành chờ mãi.
        while !self.is_cancelled() {
            self.notify.notified().await;
        }
    }
}

/// Đích của lượt AI hiện tại. `base_url`/`api_key` chỉ sống trong Rust; V8 chỉ
/// biết `request_id` và `mode`.
#[derive(Clone)]
pub struct AiTarget {
    pub request_id: String,
    pub base_url: String,
    pub api_key: Option<String>,
    pub mode: String,
    pub cancel: Arc<CancelFlag>,
}

struct ActiveAi {
    request_id: String,
    label: String,
    cancel: Arc<CancelFlag>,
}

/// Khoá một-lượt của mọi việc gọi model.
///
/// Hai nút khác nhau có thể cùng khởi động hai lượt sinh nội dung; llama.cpp chỉ
/// phục vụ một lượt cho ra kết quả dùng được, và hai lượt cùng lúc làm cả hai
/// chậm. Khoá này từ chối lượt thứ hai bằng `[AI_BUSY]`, đúng câu của
/// `AiSingleFlight.run` bên Electron.
#[derive(Default)]
pub struct AiGate {
    active: Mutex<Option<ActiveAi>>,
}

impl AiGate {
    pub fn begin(&self, request_id: &str, label: &str) -> Result<Arc<CancelFlag>, String> {
        let mut slot = self
            .active
            .lock()
            .map_err(|_| "[AI_CONFIG] Trạng thái hàng đợi AI bị hỏng. Hãy khởi động lại ứng dụng.".to_string())?;
        if let Some(active) = slot.as_ref() {
            let message = if active.request_id == request_id {
                format!(
                    "{label} đang chạy. Hãy đợi yêu cầu hiện tại hoàn tất hoặc huỷ nó trước khi thử lại."
                )
            } else {
                format!(
                    "AI đang xử lý “{}”. Không thể bắt đầu “{label}” cùng lúc; hãy đợi hoặc huỷ yêu cầu hiện tại.",
                    active.label
                )
            };
            return Err(format!("[AI_BUSY] {message}"));
        }
        let cancel = Arc::new(CancelFlag::default());
        *slot = Some(ActiveAi {
            request_id: request_id.to_string(),
            label: label.to_string(),
            cancel: cancel.clone(),
        });
        Ok(cancel)
    }

    pub fn finish(&self, request_id: &str) {
        if let Ok(mut slot) = self.active.lock() {
            if slot
                .as_ref()
                .map(|active| active.request_id == request_id)
                .unwrap_or(false)
            {
                *slot = None;
            }
        }
    }

    pub fn cancel(&self, request_id: &str) -> bool {
        let flag = self
            .active
            .lock()
            .ok()
            .and_then(|slot| {
                slot.as_ref()
                    .filter(|active| active.request_id == request_id)
                    .map(|active| active.cancel.clone())
            });
        match flag {
            Some(flag) => {
                flag.cancel();
                true
            }
            None => false,
        }
    }

    pub fn busy_label(&self) -> Option<String> {
        self.active
            .lock()
            .ok()
            .and_then(|slot| slot.as_ref().map(|active| active.label.clone()))
    }
}

/// Chạy một request POST JSON trên một luồng riêng.
///
/// `op_http` được gọi từ trong `block_on` của luồng engine, nên không thể tạo
/// thêm runtime trên chính luồng ấy. Luồng riêng có runtime hiện tại-thời của nó;
/// luồng engine chỉ chờ kết quả bằng kênh đồng bộ.
pub fn post_json(target: &AiTarget, body: String) -> Value {
    let target = target.clone();
    let (sender, receiver) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let _ = sender.send(run(&target, body));
    });
    receiver.recv().unwrap_or_else(|_| {
        json!({
            "ok": false,
            "kind": "connection",
            "message": "Không kết nối được AI API. Kiểm tra endpoint, kết nối mạng và chứng thư HTTPS."
        })
    })
}

fn run(target: &AiTarget, body: String) -> Value {
    let runtime = match tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
    {
        Ok(runtime) => runtime,
        Err(error) => {
            return json!({
                "ok": false,
                "kind": "connection",
                "message": format!("Không tạo được bộ chạy HTTP cho AI: {error}")
            })
        }
    };
    runtime.block_on(request(target, body))
}

async fn request(target: &AiTarget, body: String) -> Value {
    let url = format!(
        "{}/chat/completions",
        target.base_url.trim_end_matches('/')
    );
    let client = match reqwest::Client::builder()
        // Không theo chuyển hướng: `Authorization` không được đi sang máy khác.
        .redirect(reqwest::redirect::Policy::none())
        .build()
    {
        Ok(client) => client,
        Err(error) => {
            return json!({
                "ok": false,
                "kind": "connection",
                "message": format!("Không tạo được HTTP client: {error}")
            })
        }
    };

    let mut request = client
        .post(url)
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .body(body);
    if let Some(key) = target.api_key.as_deref().filter(|key| !key.is_empty()) {
        request = request.header(reqwest::header::AUTHORIZATION, format!("Bearer {key}"));
    }

    let timeout = if target.mode == "local" {
        Duration::from_secs(300)
    } else {
        Duration::from_secs(90)
    };

    tokio::select! {
        _ = target.cancel.wait() => json!({
            "ok": false,
            "kind": "cancelled",
            "message": "Yêu cầu AI đã bị huỷ."
        }),
        _ = tokio::time::sleep(timeout) => json!({
            "ok": false,
            "kind": "timeout",
            "message": "Yêu cầu AI quá thời gian chờ. Kiểm tra dịch vụ/model hoặc thử lại với tài liệu ngắn hơn."
        }),
        response = request.send() => {
            match response {
                Ok(response) => {
                    let status = response.status().as_u16();
                    match response.text().await {
                        Ok(text) => json!({ "ok": true, "status": status, "body": text }),
                        Err(error) => json!({
                            "ok": false,
                            "kind": "connection",
                            "message": format!("Không đọc được câu trả lời của AI: {error}")
                        }),
                    }
                }
                Err(error) => {
                    if error.is_timeout() {
                        json!({
                            "ok": false,
                            "kind": "timeout",
                            "message": "Yêu cầu AI quá thời gian chờ. Kiểm tra dịch vụ/model hoặc thử lại với tài liệu ngắn hơn."
                        })
                    } else {
                        json!({
                            "ok": false,
                            "kind": "connection",
                            "message": "Không kết nối được AI API. Kiểm tra endpoint, kết nối mạng và chứng thư HTTPS."
                        })
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_gate_allows_one_run_and_names_the_busy_one() {
        let gate = AiGate::default();
        let first = gate.begin("req_1", "phân tích giáo án").expect("first run");
        assert!(!first.is_cancelled());
        let same = gate
            .begin("req_1", "phân tích giáo án")
            .expect_err("cùng requestId phải bị chặn");
        assert!(same.starts_with("[AI_BUSY]"), "{same}");
        assert!(same.contains("đang chạy"), "{same}");
        let other = gate
            .begin("req_2", "tạo nội dung")
            .expect_err("lượt khác phải bị chặn");
        assert!(other.contains("AI đang xử lý"), "{other}");
        assert!(other.contains("tạo nội dung"), "{other}");

        gate.finish("req_1");
        let second = gate.begin("req_2", "tạo nội dung").expect("đã nhả khoá");
        assert!(!second.is_cancelled());
        gate.finish("req_2");
    }

    #[test]
    fn cancel_only_matches_the_active_request_and_is_sticky() {
        let gate = AiGate::default();
        assert!(!gate.cancel("req_1"), "chưa có lượt nào");
        let flag = gate.begin("req_1", "phân tích giáo án").expect("begin");
        assert!(!gate.cancel("req_2"), "sai requestId");
        assert!(!flag.is_cancelled());
        assert!(gate.cancel("req_1"));
        assert!(flag.is_cancelled(), "cờ huỷ phải được bật");
        // Huỷ lần hai vẫn đúng: lượt vẫn đang mở cho tới `finish`.
        assert!(gate.cancel("req_1"));
        assert_eq!(gate.busy_label().as_deref(), Some("phân tích giáo án"));
        gate.finish("req_1");
        assert_eq!(gate.busy_label(), None);
        assert!(!gate.cancel("req_1"));
    }

    #[test]
    fn a_pre_cancelled_http_call_returns_the_cancelled_envelope() {
        // Không cần máy chủ: cờ đã bật thì nhánh `cancel.wait()` thắng trước khi
        // request kịp nối. Đây là hình dạng mà `lesson-ops.ts` đổi thành
        // `AiCancelledError` (→ `[AI_CANCELLED]`).
        let cancel = Arc::new(CancelFlag::default());
        cancel.cancel();
        let target = AiTarget {
            request_id: "req_cancel".to_string(),
            base_url: "http://127.0.0.1:9".to_string(),
            api_key: None,
            mode: "local".to_string(),
            cancel,
        };
        let answer = post_json(&target, "{}".to_string());
        assert_eq!(answer["ok"], false);
        assert_eq!(answer["kind"], "cancelled");
    }
}
