//! Quản lý tác vụ AI (kênh `ai:tasks`).
//!
//! Tương đương `src/services/ai/ai-tasks.ts` và handler `ai:tasks` trong `src/main.ts`:
//! - Lưu các tác vụ đang chạy trong bộ nhớ (`live`)
//! - Lưu lịch sử tác vụ vào bảng `ai_tasks` của SQLite qua `lesson-store:ai-task-*`
//! - Trả về `{ live, history, total }`

use std::sync::{Mutex, OnceLock};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::AppHandle;

use crate::library;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiTaskRecord {
    pub task_id: String,
    pub request_id: String,
    pub kind: String,
    pub project_id: Option<String>,
    pub document_id: Option<String>,
    pub label: String,
    pub state: String,
    pub progress: String,
    pub error_code: Option<String>,
    pub error_message: Option<String>,
    pub started_at: String,
    pub finished_at: Option<String>,
    pub result_summary: Option<String>,
}

#[derive(Default)]
struct LiveRegistry {
    tasks: Vec<AiTaskRecord>,
}

static LIVE_TASKS: OnceLock<Mutex<LiveRegistry>> = OnceLock::new();

fn live_registry() -> &'static Mutex<LiveRegistry> {
    LIVE_TASKS.get_or_init(|| Mutex::new(LiveRegistry::default()))
}

pub fn new_task_id(prefix: &str) -> String {
    let millis = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let rand = (millis % 10000) as u16;
    format!("{prefix}_{millis:x}_{rand:x}")
}

pub fn start_task(
    app: &AppHandle,
    request_id: &str,
    kind: &str,
    project_id: Option<String>,
    document_id: Option<String>,
    label: &str,
) -> String {
    let task_id = new_task_id("task");
    let record = AiTaskRecord {
        task_id: task_id.clone(),
        request_id: request_id.to_string(),
        kind: kind.to_string(),
        project_id,
        document_id,
        label: label.to_string(),
        state: "running".to_string(),
        progress: "running".to_string(),
        error_code: None,
        error_message: None,
        started_at: library::now(),
        finished_at: None,
        result_summary: None,
    };

    if let Ok(mut reg) = live_registry().lock() {
        reg.tasks.retain(|t| t.request_id != request_id && t.task_id != task_id);
        reg.tasks.push(record.clone());
    }

    let _ = persist_task(app, &record);
    task_id
}

pub fn progress_task(app: &AppHandle, task_id: &str, progress: &str) {
    let mut updated = None;
    if let Ok(mut reg) = live_registry().lock() {
        if let Some(t) = reg.tasks.iter_mut().find(|t| t.task_id == task_id) {
            t.progress = progress.to_string();
            updated = Some(t.clone());
        }
    }
    if let Some(record) = updated {
        let _ = persist_task(app, &record);
    }
}

pub fn complete_task(app: &AppHandle, task_id: &str, summary: Option<&str>) {
    let mut updated = None;
    if let Ok(mut reg) = live_registry().lock() {
        if let Some(t) = reg.tasks.iter_mut().find(|t| t.task_id == task_id) {
            t.state = "completed".to_string();
            t.progress = "ready".to_string();
            t.finished_at = Some(library::now());
            t.result_summary = summary.map(str::to_string);
            updated = Some(t.clone());
        }
        reg.tasks.retain(|t| t.task_id != task_id);
    }
    if let Some(record) = updated {
        let _ = persist_task(app, &record);
    }
}

pub fn fail_task(app: &AppHandle, task_id: &str, code: Option<&str>, message: Option<&str>) {
    let mut updated = None;
    if let Ok(mut reg) = live_registry().lock() {
        if let Some(t) = reg.tasks.iter_mut().find(|t| t.task_id == task_id) {
            t.state = "failed".to_string();
            t.progress = "failed".to_string();
            t.error_code = code.map(str::to_string);
            t.error_message = message.map(str::to_string);
            t.finished_at = Some(library::now());
            updated = Some(t.clone());
        }
        reg.tasks.retain(|t| t.task_id != task_id);
    }
    if let Some(record) = updated {
        let _ = persist_task(app, &record);
    }
}

pub fn cancel_task_by_request(app: &AppHandle, request_id: &str) {
    let mut updated = None;
    if let Ok(mut reg) = live_registry().lock() {
        if let Some(t) = reg.tasks.iter_mut().find(|t| t.request_id == request_id) {
            t.state = "cancelled".to_string();
            t.progress = "cancelled".to_string();
            t.finished_at = Some(library::now());
            updated = Some(t.clone());
        }
        reg.tasks.retain(|t| t.request_id != request_id);
    }
    if let Some(record) = updated {
        let _ = persist_task(app, &record);
    }
}

fn persist_task(app: &AppHandle, record: &AiTaskRecord) -> Result<Value, String> {
    let value = serde_json::to_value(record).map_err(|e| e.to_string())?;
    library::run(app, "lesson-store:ai-task-save", &[value])
}

pub fn list_tasks(app: &AppHandle, payload: Value) -> Result<Value, String> {
    let limit = payload
        .get("limit")
        .and_then(Value::as_i64)
        .unwrap_or(50)
        .clamp(1, 200) as usize;
    let include_history = payload
        .get("history")
        .and_then(Value::as_bool)
        .unwrap_or(true);

    let live_records = live_registry()
        .lock()
        .map(|reg| {
            reg.tasks
                .iter()
                .take(limit)
                .map(|t| {
                    let mut val = serde_json::to_value(t).unwrap_or(Value::Null);
                    if let Value::Object(ref mut map) = val {
                        map.insert("restored".to_string(), Value::Bool(false));
                    }
                    val
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    if !include_history {
        return Ok(json!({
            "live": live_records,
            "history": [],
            "total": 0
        }));
    }

    let result = library::run(app, "lesson-store:ai-task-list", &[payload])?;
    let history = result.get("history").cloned().unwrap_or_else(|| json!([]));
    let total = result.get("total").and_then(Value::as_i64).unwrap_or(0);

    Ok(json!({
        "live": live_records,
        "history": history,
        "total": total
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_task_id_has_expected_prefix_and_format() {
        let id1 = new_task_id("task");
        let id2 = new_task_id("task");
        assert!(id1.starts_with("task_"));
        assert!(id2.starts_with("task_"));
    }
}
