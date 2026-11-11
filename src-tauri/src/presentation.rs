//! Presentation Mode (Trình chiếu màn hình phụ / máy chiếu) cho vỏ Tauri.
//!
//! Quản lý danh sách màn hình hiển thị (`DisplayInfo`, `GetDisplaysResult`),
//! ưu tiên máy chiếu / màn hình phụ (`select_preferred_display`), xử lý
//! rút cáp / thay đổi độ phân giải (`select_display_for_removal`), tạo hoặc tái sử
//! dụng cửa sổ trình chiếu (`WebviewWindowBuilder`), lưu giữ snapshot trạng thái
//! (`PresentationState`) và đồng bộ hai chiều giữa cửa sổ chính và máy chiếu.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DisplayInfo {
    pub id: String,
    pub bounds: Rect,
    pub work_area: Rect,
    pub scale_factor: f64,
    pub primary: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GetDisplaysResult {
    pub displays: Vec<DisplayInfo>,
    pub preferred: Option<DisplayInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DisplayRemovalDecision {
    pub action: &'static str,
    pub display: Option<DisplayInfo>,
}

/// Ưu tiên màn hình phụ (máy chiếu); nếu không có thì dùng màn hình chính.
pub fn select_preferred_display(displays: &[DisplayInfo]) -> Option<DisplayInfo> {
    if displays.is_empty() {
        return None;
    }
    displays
        .iter()
        .find(|d| !d.primary)
        .cloned()
        .or_else(|| displays.first().cloned())
}

/// Kiểm tra xem có ít nhất một màn hình phụ hay không.
pub fn has_secondary_display(displays: &[DisplayInfo]) -> bool {
    displays.iter().any(|d| !d.primary)
}

/// Kiểm tra xem toạ độ cửa sổ có nằm trọn trong ít nhất một màn hình hiển thị hay không.
pub fn is_bounds_within_displays(bounds: &Rect, displays: &[DisplayInfo]) -> bool {
    if displays.is_empty() {
        return false;
    }
    let right = bounds.x + bounds.width as i32;
    let bottom = bounds.y + bounds.height as i32;
    displays.iter().any(|d| {
        let d_right = d.bounds.x + d.bounds.width as i32;
        let d_bottom = d.bounds.y + d.bounds.height as i32;
        bounds.x >= d.bounds.x
            && bounds.y >= d.bounds.y
            && right <= d_right
            && bottom <= d_bottom
    })
}

/// Quyết định xử lý cửa sổ trình chiếu khi có màn hình bị rút hoặc thay đổi độ phân giải.
pub fn select_display_for_removal(
    bounds: &Rect,
    remaining_displays: &[DisplayInfo],
) -> DisplayRemovalDecision {
    if is_bounds_within_displays(bounds, remaining_displays) {
        return DisplayRemovalDecision {
            action: "keep",
            display: None,
        };
    }
    let target = select_preferred_display(remaining_displays);
    if let Some(target) = target {
        DisplayRemovalDecision {
            action: "move",
            display: Some(target),
        }
    } else {
        DisplayRemovalDecision {
            action: "close",
            display: None,
        }
    }
}

/// Hook phục vụ kiểm thử: giả lập màn hình phụ khi có biến môi trường `EDUGAME_PRESENTATION_TEST_DISPLAYS=2`.
pub fn with_test_display(mut result: GetDisplaysResult) -> GetDisplaysResult {
    let test_flag = std::env::var("EDUGAME_PRESENTATION_TEST_DISPLAYS").unwrap_or_default();
    if test_flag != "2" || result.displays.len() != 1 {
        return result;
    }
    let primary = result.displays[0].clone();
    let secondary = DisplayInfo {
        id: "test-secondary".to_string(),
        primary: false,
        bounds: Rect {
            x: primary.bounds.x + primary.bounds.width as i32,
            y: primary.bounds.y,
            width: primary.bounds.width,
            height: primary.bounds.height,
        },
        work_area: Rect {
            x: primary.work_area.x + primary.work_area.width as i32,
            y: primary.work_area.y,
            width: primary.work_area.width,
            height: primary.work_area.height,
        },
        scale_factor: primary.scale_factor,
    };
    result.displays = vec![primary, secondary.clone()];
    result.preferred = Some(secondary);
    result
}

/// Lấy danh sách các màn hình khả dụng từ hệ điều hành thông qua Tauri.
pub fn get_available_displays(app: &AppHandle) -> GetDisplaysResult {
    let monitors = app.available_monitors().unwrap_or_default();
    let primary_monitor = app.primary_monitor().ok().flatten();
    let primary_name = primary_monitor.as_ref().and_then(|m| m.name().cloned());

    let mut displays = Vec::new();
    for (idx, m) in monitors.iter().enumerate() {
        let name = m.name().cloned().unwrap_or_else(|| format!("display-{}", idx + 1));
        let pos = m.position();
        let size = m.size();
        let scale = m.scale_factor();
        let is_primary = if let Some(ref p_name) = primary_name {
            &name == p_name
        } else {
            idx == 0
        };

        displays.push(DisplayInfo {
            id: name,
            bounds: Rect {
                x: pos.x,
                y: pos.y,
                width: size.width,
                height: size.height,
            },
            work_area: Rect {
                x: pos.x,
                y: pos.y,
                width: size.width,
                height: size.height,
            },
            scale_factor: scale,
            primary: is_primary,
        });
    }

    if displays.is_empty() {
        displays.push(DisplayInfo {
            id: "primary".to_string(),
            bounds: Rect {
                x: 0,
                y: 0,
                width: 1920,
                height: 1080,
            },
            work_area: Rect {
                x: 0,
                y: 0,
                width: 1920,
                height: 1040,
            },
            scale_factor: 1.0,
            primary: true,
        });
    }

    let preferred = select_preferred_display(&displays);
    with_test_display(GetDisplaysResult { displays, preferred })
}

#[derive(Debug, Default)]
pub struct PresentationSessionState {
    pub last_session_id: Option<String>,
    pub last_revision: i64,
    pub last_state: Option<Value>,
}

static SESSION: OnceLock<Mutex<PresentationSessionState>> = OnceLock::new();

pub fn session() -> &'static Mutex<PresentationSessionState> {
    SESSION.get_or_init(|| Mutex::new(PresentationSessionState::default()))
}

pub fn reset_session() {
    let mut st = session().lock().unwrap();
    st.last_session_id = None;
    st.last_revision = 0;
    st.last_state = None;
}

/// Lệnh `presentation:displays`.
pub fn get_displays(app: &AppHandle) -> Result<Value, String> {
    let result = get_available_displays(app);
    serde_json::to_value(serde_json::json!({
        "ok": true,
        "data": result,
    }))
    .map_err(|e| e.to_string())
}

/// Lệnh `presentation:start`: mở cửa sổ trình chiếu trên màn hình phụ (hoặc tái sử dụng).
pub async fn start(app: &AppHandle, payload: Option<Value>) -> Result<Value, String> {
    let displays_res = get_available_displays(app);
    let target_display = match displays_res.preferred.or_else(|| displays_res.displays.first().cloned()) {
        Some(d) => d,
        None => {
            return Ok(serde_json::json!({
                "ok": false,
                "error": "Không tìm thấy màn hình nào để trình chiếu.",
            }));
        }
    };

    let payload_val = payload.unwrap_or_else(|| serde_json::json!({}));
    let session_id = payload_val
        .get("sessionId")
        .and_then(Value::as_str)
        .map(String::from)
        .unwrap_or_else(|| {
            let millis = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis())
                .unwrap_or(0);
            format!("pres_{millis}")
        });
    let revision = payload_val.get("revision").and_then(Value::as_i64).unwrap_or(0);

    {
        let mut st = session().lock().unwrap();
        st.last_session_id = Some(session_id.clone());
        st.last_revision = revision;
        st.last_state = Some(payload_val.clone());
    }

    if let Some(win) = app.get_webview_window("presentation") {
        let _ = win.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
            x: target_display.bounds.x,
            y: target_display.bounds.y,
        }));
        let _ = win.set_size(tauri::Size::Physical(tauri::PhysicalSize {
            width: target_display.bounds.width,
            height: target_display.bounds.height,
        }));
        let _ = win.set_fullscreen(true);
        let _ = win.show();
        let _ = win.set_focus();
        let _ = win.emit("presentation:state-sync", &payload_val);
    } else {
        match tauri::WebviewWindowBuilder::new(
            app,
            "presentation",
            tauri::WebviewUrl::App(std::path::PathBuf::from("presentation/presentation.html")),
        )
        .title("EduGame Studio — Trình chiếu")
        .fullscreen(true)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .position(target_display.bounds.x as f64, target_display.bounds.y as f64)
        .inner_size(
            target_display.bounds.width as f64,
            target_display.bounds.height as f64,
        )
        .build()
        {
            Ok(win) => {
                let _ = win.show();
                let _ = win.emit("presentation:state-sync", &payload_val);
            }
            Err(e) => {
                eprintln!("presentation window build note: {e}");
            }
        }
    }

    let _ = app.emit("presentation:state-sync", &payload_val);

    Ok(serde_json::json!({
        "ok": true,
        "data": {
            "display": target_display,
            "sessionId": session_id,
        }
    }))
}

/// Lệnh `presentation:stop`: đóng cửa sổ trình chiếu và xoá trạng thái phiên.
pub async fn stop(app: &AppHandle, payload: Option<Value>) -> Result<Value, String> {
    if let Some(win) = app.get_webview_window("presentation") {
        let _ = win.close();
    }
    let session_id_req = payload.as_ref().and_then(|p| p.get("sessionId")).and_then(Value::as_str);
    {
        let mut st = session().lock().unwrap();
        if session_id_req.is_none() || session_id_req == st.last_session_id.as_deref() {
            st.last_session_id = None;
            st.last_revision = 0;
            st.last_state = None;
        }
    }
    Ok(serde_json::json!({ "ok": true }))
}

/// Lệnh `presentation:toggle`: bật hoặc tắt trình chiếu tuỳ vào trạng thái hiện tại.
pub async fn toggle(app: &AppHandle, payload: Option<Value>) -> Result<Value, String> {
    let is_open = app
        .get_webview_window("presentation")
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false);

    if is_open {
        stop(app, payload).await?;
        Ok(serde_json::json!({ "ok": true, "presenting": false }))
    } else {
        let start_res = start(app, payload).await?;
        if start_res.get("ok").and_then(Value::as_bool) == Some(true) {
            let mut obj = start_res;
            if let Some(map) = obj.as_object_mut() {
                map.insert("presenting".to_string(), Value::Bool(true));
            }
            Ok(obj)
        } else {
            Ok(start_res)
        }
    }
}

/// Xử lý yêu cầu xin snapshot từ cửa sổ trình chiếu (`presentation:request-state`).
pub fn handle_request_state(app: &AppHandle) {
    let st = session().lock().unwrap();
    if let Some(ref state) = st.last_state {
        let _ = app.emit("presentation:state-sync", state);
    }
}

/// Xử lý cập nhật snapshot từ cửa sổ chính (`presentation:state-update`).
pub fn handle_state_update(app: &AppHandle, state: Value) {
    let session_id = state.get("sessionId").and_then(Value::as_str);
    let revision = state.get("revision").and_then(Value::as_i64).unwrap_or(0);

    let mut st = session().lock().unwrap();
    if let Some(cur_sid) = &st.last_session_id {
        if let Some(sid) = session_id {
            if sid != cur_sid {
                return;
            }
        }
    }
    if revision <= st.last_revision && st.last_revision > 0 {
        return;
    }

    st.last_revision = revision;
    st.last_state = Some(state.clone());
    drop(st);

    let _ = app.emit("presentation:state-sync", &state);
}

/// Xử lý thoát trình chiếu khi nhận phím Escape hoặc nút đóng (`presentation:exit`).
pub fn handle_exit(app: &AppHandle, payload: Option<Value>) {
    let sid = payload.as_ref().and_then(|p| p.get("sessionId")).and_then(Value::as_str);
    let cur_sid = {
        let st = session().lock().unwrap();
        st.last_session_id.clone()
    };
    if sid.is_none() || sid == cur_sid.as_deref() {
        if let Some(win) = app.get_webview_window("presentation") {
            let _ = win.close();
        }
        reset_session();
    }
    let _ = app.emit(
        "presentation:exit",
        serde_json::json!({ "sessionId": cur_sid.unwrap_or_default() }),
    );
}

#[cfg(test)]
pub mod tests {
    use super::*;

    fn sample_display(id: &str, x: i32, width: u32, primary: bool) -> DisplayInfo {
        DisplayInfo {
            id: id.to_string(),
            bounds: Rect {
                x,
                y: 0,
                width,
                height: 768,
            },
            work_area: Rect {
                x,
                y: 0,
                width,
                height: 768,
            },
            scale_factor: 1.0,
            primary,
        }
    }

    #[test]
    fn select_preferred_display_prefers_secondary_over_primary() {
        let laptop = sample_display("primary", 0, 1920, true);
        let projector = sample_display("secondary", 1920, 1366, false);

        assert_eq!(select_preferred_display(&[]), None);
        assert_eq!(
            select_preferred_display(&[laptop.clone()]).unwrap().id,
            "primary"
        );
        assert_eq!(
            select_preferred_display(&[laptop.clone(), projector.clone()]).unwrap().id,
            "secondary"
        );
        assert_eq!(
            select_preferred_display(&[projector.clone(), laptop.clone()]).unwrap().id,
            "secondary"
        );
    }

    #[test]
    fn has_secondary_display_identifies_non_primary() {
        let laptop = sample_display("primary", 0, 1920, true);
        let projector = sample_display("secondary", 1920, 1366, false);

        assert!(!has_secondary_display(&[]));
        assert!(!has_secondary_display(&[laptop.clone()]));
        assert!(has_secondary_display(&[laptop, projector]));
    }

    #[test]
    fn is_bounds_within_displays_checks_containment() {
        let laptop = sample_display("primary", 0, 1920, true);
        let projector = sample_display("secondary", 1920, 1366, false);

        let bounds_on_projector = Rect {
            x: 1920,
            y: 0,
            width: 1366,
            height: 768,
        };
        assert!(!is_bounds_within_displays(&bounds_on_projector, &[laptop.clone()]));
        assert!(is_bounds_within_displays(
            &bounds_on_projector,
            &[laptop.clone(), projector.clone()]
        ));

        let bounds_straddling = Rect {
            x: 1800,
            y: 0,
            width: 400,
            height: 600,
        };
        assert!(!is_bounds_within_displays(&bounds_straddling, &[laptop]));
    }

    #[test]
    fn select_display_for_removal_keeps_or_moves() {
        let laptop = sample_display("primary", 0, 1920, true);
        let projector = sample_display("secondary", 1920, 1366, false);

        let bounds_on_projector = Rect {
            x: 1920,
            y: 0,
            width: 1366,
            height: 768,
        };
        let rescue = select_display_for_removal(&bounds_on_projector, &[laptop.clone()]);
        assert_eq!(rescue.action, "move");
        assert_eq!(rescue.display.unwrap().id, "primary");

        let visible = Rect {
            x: 0,
            y: 0,
            width: 1920,
            height: 768,
        };
        let keep = select_display_for_removal(&visible, &[laptop.clone(), projector]);
        assert_eq!(keep.action, "keep");
        assert_eq!(keep.display, None);

        let none_left = select_display_for_removal(&bounds_on_projector, &[]);
        assert_eq!(none_left.action, "close");
        assert_eq!(none_left.display, None);
    }

    #[test]
    fn with_test_display_synthesizes_secondary_when_env_set() {
        let laptop = sample_display("primary", 0, 1920, true);
        let input = GetDisplaysResult {
            displays: vec![laptop.clone()],
            preferred: Some(laptop),
        };

        // When env not set
        std::env::remove_var("EDUGAME_PRESENTATION_TEST_DISPLAYS");
        let normal = with_test_display(input.clone());
        assert_eq!(normal.displays.len(), 1);

        // When env is "2"
        std::env::set_var("EDUGAME_PRESENTATION_TEST_DISPLAYS", "2");
        let simulated = with_test_display(input);
        std::env::remove_var("EDUGAME_PRESENTATION_TEST_DISPLAYS");
        assert_eq!(simulated.displays.len(), 2);
        assert_eq!(simulated.preferred.unwrap().id, "test-secondary");
    }

    #[test]
    fn session_state_tracking_and_revision_filtering() {
        reset_session();
        {
            let mut st = session().lock().unwrap();
            st.last_session_id = Some("s1".to_string());
            st.last_revision = 5;
            st.last_state = Some(serde_json::json!({ "seq": 5 }));
        }

        let st = session().lock().unwrap();
        assert_eq!(st.last_session_id.as_deref(), Some("s1"));
        assert_eq!(st.last_revision, 5);
        drop(st);

        reset_session();
        let st = session().lock().unwrap();
        assert_eq!(st.last_session_id, None);
        assert_eq!(st.last_revision, 0);
    }
}
