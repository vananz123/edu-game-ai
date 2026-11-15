//! Kênh `scene:suggest` — một câu hỏi vào, một blueprint cảnh ra (#265).
//!
//! Toàn bộ LUẬT nằm ở `src-tauri/src/embedded/scene-ops.ts` + `src/services/ai/
//! scene-suggest.ts`: dựng prompt từ `scene-asset-catalog.ts`, gọi model, trích
//! khối JSON, và cho phản hồi đi qua đúng `normalizeSceneBlueprint` như dữ liệu
//! đọc từ SQLite. Không có đường nào để model chạm vào markup: nó chỉ trả dữ
//! liệu, engine đã test mới vẽ.
//!
//! Tệp này chỉ giữ phần thuộc lớp chạy — đúng khuôn `lesson::analyze`:
//!   • chọn provider qua `settings::workflow_provider` (endpoint + khoá không bao
//!     giờ đi vào V8);
//!   • `AiGate` một-lượt để `ai:cancel` huỷ được lượt đang chờ;
//!   • ghi `ai_tasks` trước khi gọi và đóng lại sau khi xong;
//!   • chạy trên `spawn_blocking`, vì đây là lượt chờ model.
use serde_json::Value;
use tauri::{AppHandle, Manager};

use crate::ai_http::{AiGate, AiTarget};
use crate::ai_tasks;
use crate::library;
use crate::settings;

fn text_field(payload: &Value, key: &str) -> String {
    payload
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string()
}

/// Chạy `scene:suggest` trên luồng chặn riêng.
pub async fn suggest(app: AppHandle, payload: Option<Value>) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || suggest_blocking(&app, payload.as_ref()))
        .await
        .map_err(|failure| format!("Lượt gợi ý cảnh bị dừng: {failure}"))?
}

fn suggest_blocking(app: &AppHandle, payload: Option<&Value>) -> Result<Value, String> {
    let payload = payload.cloned().unwrap_or(Value::Null);
    let prompt_text = text_field(&payload, "prompt");
    if prompt_text.is_empty() {
        return Err("Chưa có nội dung câu hỏi để gợi ý cảnh.".to_string());
    }

    let request_id = text_field(&payload, "requestId");
    let provider_id = payload
        .get("providerId")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let local_preferred = payload
        .get("localPreferred")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    // Cùng quy tắc `lesson:analyze`: provider chọn trước, không usable là lỗi
    // chứ không tự đổi sang provider khác sau lưng giáo viên.
    let target = settings::workflow_provider(app, provider_id.as_deref(), local_preferred)?;

    let task_id = ai_tasks::start_task(app, &request_id, "scene", None, None, "gợi ý cảnh minh hoạ");
    let gate = app.try_state::<AiGate>().ok_or_else(|| {
        "AI_CONFIG: hàng đợi AI chưa sẵn sàng. Hãy khởi động lại ứng dụng.".to_string()
    })?;
    let cancel = gate.begin(&request_id, "gợi ý cảnh minh hoạ")?;

    let ai = AiTarget {
        request_id: request_id.clone(),
        base_url: target.base_url.clone(),
        api_key: target.api_key.clone(),
        mode: target.mode.clone(),
        cancel,
    };

    let question = serde_json::json!({
        "prompt": prompt_text,
        "answers": payload.get("answers").cloned().unwrap_or(Value::Null),
        "category": payload.get("category").cloned().unwrap_or(Value::Null),
        "iconName": payload.get("iconName").cloned().unwrap_or(Value::Null),
        "subject": payload.get("subject").cloned().unwrap_or(Value::Null),
        "grade": payload.get("grade").cloned().unwrap_or(Value::Null)
    });

    let result = library::run_with_ai(
        app,
        "scene-suggest",
        &[serde_json::json!({
            "question": question,
            "target": {
                "requestId": request_id,
                "model": target.model,
                "mode": target.mode,
                "providerId": target.id
            }
        })],
        ai,
    );
    // Luôn nhả khoá, kể cả khi model lỗi hay giáo viên huỷ.
    gate.finish(&request_id);

    match result {
        Ok(value) => {
            let source = value.get("source").and_then(Value::as_str).unwrap_or("fallback");
            let summary = if source == "model" {
                "gợi ý cảnh: model"
            } else {
                "gợi ý cảnh: cảnh theo danh mục"
            };
            ai_tasks::complete_task(app, &task_id, Some(summary));
            Ok(value)
        }
        Err(message) => {
            ai_tasks::fail_task(app, &task_id, Some("AI_SCENE"), Some(&message));
            Err(message)
        }
    }
}
