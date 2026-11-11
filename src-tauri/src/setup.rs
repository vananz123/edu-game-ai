//! Wizard cài đặt AI local lần đầu của vỏ Tauri.
//!
//! Bản Electron đã có `setup-state.ts` (máy trạng thái bền vững),
//! `setup-orchestrator.ts` (thứ tự các bước, hủy, thử nghiệm) và `setup-ipc.ts`
//! (chỉ nhận id model). Module này port đúng ba lớp đó sang Rust, dùng lại
//! `ai_local` cho mọi thao tác đĩa/mạng/tiến trình thay vì viết lại bộ tải.
//!
//! Bất biến giữ nguyên:
//!   - Renderer chỉ gửi **id model**; không đường dẫn, URL hay backend.
//!   - Chỉ ghi `complete` sau khi tất cả bước bắt buộc đã chạy và thử nghiệm
//!     sinh nội dung thật sự trả về chữ.
//!   - Trạng thái nằm ở `<data>/ai-local/setup-state.json`, đọc khoan dung:
//!     tệp hỏng/thiếu = bắt đầu lại, không chặn mở ứng dụng.
//!   - Hủy giữ byte đã tải trên đĩa để lần sau tải tiếp.
//!
//! Phần chưa port: `ai:generate` và các màn hình Settings chi tiết. Wizard chỉ
//! cần bốn kênh `setup:*`, và chúng chạy trên cùng runtime với `ai:*`.

use std::{
    future::Future,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};

use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager};

use crate::ai_local::{
    self, CancelToken, SetupModel, SetupProgressContext, SetupRuntime, CANCELLED_MESSAGE,
};
use crate::paths;

pub const SETUP_STATE_SCHEMA_VERSION: u32 = 1;
const SETUP_STATE_FILE: &str = "setup-state.json";
const LOCAL_ROOT: &str = "ai-local";

/// Bước của wizard, đúng thứ tự và đúng tên trong `setup-state.ts`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum SetupStep {
    Idle,
    Detecting,
    InstallingRuntime,
    InstallingModels,
    Starting,
    SmokeTest,
    Complete,
}

impl SetupStep {
    const ALL: [SetupStep; 7] = [
        SetupStep::Idle,
        SetupStep::Detecting,
        SetupStep::InstallingRuntime,
        SetupStep::InstallingModels,
        SetupStep::Starting,
        SetupStep::SmokeTest,
        SetupStep::Complete,
    ];

    fn as_str(self) -> &'static str {
        match self {
            SetupStep::Idle => "idle",
            SetupStep::Detecting => "detecting",
            SetupStep::InstallingRuntime => "installing-runtime",
            SetupStep::InstallingModels => "installing-models",
            SetupStep::Starting => "starting",
            SetupStep::SmokeTest => "smoke-test",
            SetupStep::Complete => "complete",
        }
    }

    fn from_str(value: &str) -> Option<Self> {
        Self::ALL
            .iter()
            .copied()
            .find(|candidate| candidate.as_str() == value)
    }

    fn index(self) -> usize {
        Self::ALL
            .iter()
            .position(|candidate| *candidate == self)
            .unwrap_or(0)
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupErrorDetails {
    pub step: SetupStep,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
    pub at: String,
    pub attempts: u32,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupState {
    pub schema_version: u32,
    pub step: SetupStep,
    pub completed_steps: Vec<SetupStep>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub runtime_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub backend: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<SetupErrorDetails>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub started_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<String>,
}

fn initial_state() -> SetupState {
    SetupState {
        schema_version: SETUP_STATE_SCHEMA_VERSION,
        step: SetupStep::Idle,
        completed_steps: Vec::new(),
        runtime_id: None,
        backend: None,
        model_id: None,
        error: None,
        started_at: None,
        updated_at: None,
        completed_at: None,
    }
}

fn is_complete(state: &SetupState) -> bool {
    state.step == SetupStep::Complete && state.error.is_none()
}

fn can_transition(from: SetupStep, to: SetupStep) -> bool {
    let allowed: &[SetupStep] = match from {
        SetupStep::Idle => &[SetupStep::Detecting],
        SetupStep::Detecting => &[
            SetupStep::InstallingRuntime,
            SetupStep::InstallingModels,
            SetupStep::Starting,
            SetupStep::SmokeTest,
            SetupStep::Complete,
            SetupStep::Idle,
        ],
        SetupStep::InstallingRuntime => &[
            SetupStep::InstallingModels,
            SetupStep::Starting,
            SetupStep::SmokeTest,
            SetupStep::Complete,
            SetupStep::Idle,
        ],
        SetupStep::InstallingModels => &[
            SetupStep::Starting,
            SetupStep::SmokeTest,
            SetupStep::Complete,
            SetupStep::Idle,
        ],
        SetupStep::Starting => &[SetupStep::SmokeTest, SetupStep::Complete, SetupStep::Idle],
        SetupStep::SmokeTest => &[SetupStep::Complete, SetupStep::Idle],
        SetupStep::Complete => &[SetupStep::Idle, SetupStep::Detecting],
    };
    allowed.contains(&to)
}

fn parse_state(raw: &Value) -> SetupState {
    let Some(object) = raw.as_object() else {
        return initial_state();
    };
    if object.get("schemaVersion").and_then(Value::as_u64)
        != Some(SETUP_STATE_SCHEMA_VERSION as u64)
    {
        return initial_state();
    }
    let Some(step) = object
        .get("step")
        .and_then(Value::as_str)
        .and_then(SetupStep::from_str)
    else {
        return initial_state();
    };

    let declared: Vec<&str> = object
        .get("completedSteps")
        .and_then(Value::as_array)
        .map(|items| items.iter().filter_map(Value::as_str).collect())
        .unwrap_or_default();
    let completed_steps = SetupStep::ALL
        .iter()
        .copied()
        .filter(|candidate| {
            *candidate != SetupStep::Idle
                && *candidate != SetupStep::Complete
                && declared.contains(&candidate.as_str())
        })
        .collect();

    let error = parse_error(object.get("error"));
    let mut state = SetupState {
        schema_version: SETUP_STATE_SCHEMA_VERSION,
        step,
        completed_steps,
        runtime_id: non_empty(object.get("runtimeId")),
        backend: non_empty(object.get("backend")),
        model_id: non_empty(object.get("modelId")),
        error: error.clone(),
        started_at: iso_date(object.get("startedAt")),
        updated_at: iso_date(object.get("updatedAt")),
        completed_at: iso_date(object.get("completedAt")),
    };

    // "complete" + lỗi là mâu thuẫn; tin lỗi và lùi về bước hỏng để thử lại.
    if step == SetupStep::Complete && error.is_some() {
        state.step = error.unwrap().step;
        state.completed_at = None;
    }
    state
}

fn parse_error(raw: Option<&Value>) -> Option<SetupErrorDetails> {
    let object = raw?.as_object()?;
    let step = object
        .get("step")
        .and_then(Value::as_str)
        .and_then(SetupStep::from_str)?;
    let message = object.get("message").and_then(Value::as_str)?;
    if message.is_empty() {
        return None;
    }
    let attempts = object
        .get("attempts")
        .and_then(Value::as_u64)
        .filter(|value| *value > 0 && *value <= u32::MAX as u64)
        .map(|value| value as u32)
        .unwrap_or(1);
    Some(SetupErrorDetails {
        step,
        message: message.to_string(),
        code: non_empty(object.get("code")),
        at: iso_date(object.get("at")).unwrap_or_else(crate::library::now),
        attempts,
    })
}

fn non_empty(raw: Option<&Value>) -> Option<String> {
    raw.and_then(Value::as_str)
        .filter(|text| !text.is_empty())
        .map(str::to_string)
}

/// Đủ chặt để từ chối dữ liệu rác, đủ rộng để chấp nhận mọi mốc ISO do Rust
/// hoặc Electron ghi (`...Z`, có/không phần lẻ giây).
fn iso_date(raw: Option<&Value>) -> Option<String> {
    let text = raw.and_then(Value::as_str)?;
    if !looks_like_iso_date(text) {
        return None;
    }
    Some(text.to_string())
}

fn looks_like_iso_date(text: &str) -> bool {
    let bytes = text.as_bytes();
    if bytes.len() < 20
        || bytes[4] != b'-'
        || bytes[7] != b'-'
        || !matches!(bytes[10], b'T' | b't' | b' ')
        || bytes[13] != b':'
        || bytes[16] != b':'
    {
        return false;
    }
    let digits =
        |range: std::ops::Range<usize>| range.clone().all(|index| bytes[index].is_ascii_digit());
    if !digits(0..4)
        || !digits(5..7)
        || !digits(8..10)
        || !digits(11..13)
        || !digits(14..16)
        || !digits(17..19)
    {
        return false;
    }
    let number = |range: std::ops::Range<usize>| text[range].parse::<u32>().unwrap_or(u32::MAX);
    if !(1..=12).contains(&number(5..7))
        || !(1..=31).contains(&number(8..10))
        || number(11..13) > 23
        || number(14..16) > 59
        || number(17..19) > 59
    {
        return false;
    }
    let rest = &text[19..];
    if let Some(fraction) = rest.strip_prefix('.') {
        let consumed = fraction.bytes().take_while(u8::is_ascii_digit).count();
        if consumed == 0 {
            return false;
        }
        let suffix = &fraction[consumed..];
        return suffix == "Z" || suffix == "z" || valid_offset(suffix);
    }
    rest == "Z" || rest == "z" || valid_offset(rest)
}

fn valid_offset(text: &str) -> bool {
    let bytes = text.as_bytes();
    if bytes.len() != 6 || !matches!(bytes[0], b'+' | b'-') || bytes[3] != b':' {
        return false;
    }
    bytes[1..3].iter().all(u8::is_ascii_digit) && bytes[4..6].iter().all(u8::is_ascii_digit)
}

struct StateStore {
    path: PathBuf,
    state: SetupState,
}

impl StateStore {
    fn load(data: &Path) -> Self {
        let path = data.join(LOCAL_ROOT).join(SETUP_STATE_FILE);
        let state = std::fs::read(&path)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
            .map(|raw| parse_state(&raw))
            .unwrap_or_else(initial_state);
        Self { path, state }
    }

    fn get(&self) -> &SetupState {
        &self.state
    }

    fn transition_to(
        &mut self,
        step: SetupStep,
        details: TransitionDetails<'_>,
    ) -> Result<(), String> {
        if step != self.state.step && !can_transition(self.state.step, step) {
            return Err(format!(
                "Không thể chuyển bước cài đặt từ \"{}\" sang \"{}\".",
                self.state.step.as_str(),
                step.as_str()
            ));
        }
        let timestamp = crate::library::now();
        if !self.state.completed_steps.contains(&step) {
            self.state.completed_steps.push(step);
        }
        if self.state.started_at.is_none() {
            self.state.started_at = Some(timestamp.clone());
        }
        self.state.step = step;
        self.state.updated_at = Some(timestamp.clone());
        if let Some(runtime_id) = details.runtime_id.filter(|value| !value.is_empty()) {
            self.state.runtime_id = Some(runtime_id.to_string());
        }
        if let Some(backend) = details.backend.filter(|value| !value.is_empty()) {
            self.state.backend = Some(backend.to_string());
        }
        if let Some(model_id) = details.model_id.filter(|value| !value.is_empty()) {
            self.state.model_id = Some(model_id.to_string());
        }
        self.state.error = None;
        if step == SetupStep::Complete {
            self.state.completed_at = Some(timestamp);
        } else {
            self.state.completed_at = None;
        }
        self.persist()
    }

    fn fail(&mut self, message: &str, code: &str, step: SetupStep) -> Result<(), String> {
        let timestamp = crate::library::now();
        let previous = self
            .state
            .error
            .as_ref()
            .filter(|error| error.step == step)
            .map(|error| error.attempts)
            .unwrap_or(0);
        self.state.error = Some(SetupErrorDetails {
            step,
            message: message.to_string(),
            code: (!code.is_empty()).then(|| code.to_string()),
            at: timestamp.clone(),
            attempts: previous.saturating_add(1),
        });
        self.state.updated_at = Some(timestamp);
        self.state.completed_at = None;
        self.persist()
    }

    fn persist(&self) -> Result<(), String> {
        let Some(parent) = self.path.parent() else {
            return Err("không xác định được thư mục trạng thái cài đặt".to_string());
        };
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("không tạo được {}: {error}", parent.display()))?;
        let temporary = self.path.with_extension("json.tmp");
        let bytes = serde_json::to_vec_pretty(&self.state)
            .map_err(|error| format!("không mã hoá trạng thái cài đặt: {error}"))?;
        std::fs::write(&temporary, bytes)
            .map_err(|error| format!("không ghi được {}: {error}", temporary.display()))?;
        std::fs::rename(&temporary, &self.path)
            .map_err(|error| format!("không thay được {}: {error}", self.path.display()))
    }
}

#[derive(Default)]
struct TransitionDetails<'a> {
    runtime_id: Option<&'a str>,
    backend: Option<&'a str>,
    model_id: Option<&'a str>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct HardwareView {
    platform: String,
    arch: String,
    os_arch: String,
    cpu_model: String,
    logical_cpu_count: u32,
    total_ram_bytes: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    disk_free_bytes: Option<u64>,
    supported: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimePlan {
    id: String,
    display_name: String,
    download_bytes: u64,
    installed: bool,
    used_fallback: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    fallback_reason: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ModelPlan {
    id: String,
    display_name: String,
    download_bytes: u64,
    installed: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SetupPlan {
    runtime: RuntimePlan,
    model: ModelPlan,
    remaining_bytes: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    disk_free_bytes: Option<u64>,
    enough_disk_space: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Blocked {
    code: String,
    message: String,
}

#[derive(Clone, Default)]
struct SetupCache {
    hardware: Option<HardwareView>,
    plan: Option<SetupPlan>,
    blocked: Option<Blocked>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StatusError {
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    code: Option<String>,
    step: SetupStep,
    attempts: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SetupStatus {
    step: SetupStep,
    complete: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<StatusError>,
    #[serde(skip_serializing_if = "Option::is_none")]
    runtime_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    backend: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    model_id: Option<String>,
    running: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    hardware: Option<HardwareView>,
    #[serde(skip_serializing_if = "Option::is_none")]
    plan: Option<SetupPlan>,
    #[serde(skip_serializing_if = "Option::is_none")]
    blocked: Option<Blocked>,
}

/// State do Tauri quản lý cho wizard. Các trường dùng `Arc` để lệnh async có thể
/// giữ khóa mà không giữ `State` của Tauri qua `.await`.
#[derive(Default)]
pub struct Setup {
    run: Arc<tokio::sync::Mutex<()>>,
    running: Arc<AtomicBool>,
    cancel: Arc<Mutex<Option<CancelToken>>>,
    cache: Arc<Mutex<SetupCache>>,
}

struct RunGuard {
    running: Arc<AtomicBool>,
    cancel: Arc<Mutex<Option<CancelToken>>>,
}

impl Drop for RunGuard {
    fn drop(&mut self) {
        self.running.store(false, Ordering::SeqCst);
        if let Ok(mut slot) = self.cancel.lock() {
            *slot = None;
        }
    }
}

fn status_value(app: &AppHandle) -> Result<Value, String> {
    let data = paths::data_dir(app)?;
    let store = StateStore::load(&data);
    let setup = app.state::<Setup>();
    let cache = setup
        .cache
        .lock()
        .map_err(|_| "Trạng thái cài đặt AI bị hỏng.".to_string())?
        .clone();
    let running = setup.running.load(Ordering::SeqCst);
    serde_json::to_value(make_status(store.get(), &cache, running))
        .map_err(|error| format!("không mã hoá trạng thái cài đặt: {error}"))
}

fn make_status(state: &SetupState, cache: &SetupCache, running: bool) -> SetupStatus {
    SetupStatus {
        step: state.step,
        complete: is_complete(state),
        error: state.error.as_ref().map(|error| StatusError {
            message: error.message.clone(),
            code: error.code.clone(),
            step: error.step,
            attempts: error.attempts,
        }),
        runtime_id: state.runtime_id.clone(),
        backend: state.backend.clone(),
        model_id: state.model_id.clone(),
        running,
        hardware: cache.hardware.clone(),
        plan: cache.plan.clone(),
        blocked: cache.blocked.clone(),
    }
}

/// `setup:status` — chỉ đọc, không dò phần cứng và không tải gì.
pub fn status(app: &AppHandle) -> Result<Value, String> {
    status_value(app)
}

/// `setup:preflight` — dò cấu hình, chọn runtime và kiểm dung lượng. Mọi lỗi
/// đầu vào trả về `blocked` thay vì rejected promise, đúng `setup-ipc.ts`.
pub async fn preflight(app: AppHandle, requested: Option<Value>) -> Result<Value, String> {
    let outcome = (|| {
        let model = resolve_model(&requested)?;
        preflight_inner(&app, model)
    })();
    match outcome {
        Ok(status) => serde_json::to_value(status)
            .map_err(|error| format!("không mã hoá trạng thái cài đặt: {error}")),
        Err(message) => blocked_value(&app, &message),
    }
}

/// `setup:start` — chạy/tiếp tục wizard. Lỗi của quá trình được ghi vào state và
/// trả về status, không phải rejected promise; chỉ payload sai mới bị từ chối.
pub async fn start(app: AppHandle, requested: Option<Value>) -> Result<Value, String> {
    let model = resolve_model(&requested)?;
    let (run, running, cancel) = {
        let setup = app.state::<Setup>();
        (
            Arc::clone(&setup.run),
            Arc::clone(&setup.running),
            Arc::clone(&setup.cancel),
        )
    };
    if running.load(Ordering::SeqCst) {
        return status_value(&app);
    }
    // Một lượt khác đang giữ khóa chạy thì trả status hiện tại thay vì xếp hàng
    // chờ rồi chạy lần thứ hai ngay sau khi lượt kia xong (Electron: từ chối `busy`).
    let _guard = match run.try_lock() {
        Ok(guard) => guard,
        Err(_) => return status_value(&app),
    };
    if running.swap(true, Ordering::SeqCst) {
        return status_value(&app);
    }
    let token = CancelToken::new();
    {
        let mut slot = cancel
            .lock()
            .map_err(|_| "Trạng thái cài đặt AI bị hỏng.".to_string())?;
        *slot = Some(token.clone());
    }
    let run_guard = RunGuard { running, cancel };
    let outcome = run_setup(&app, model, &token).await;
    // Clear `running` before reading status: an `start` call that ends in a
    // failure must return `running: false`, otherwise the wizard renders a
    // spinner forever instead of its retry screen.
    drop(run_guard);
    if let Err(message) = outcome {
        // Mọi lỗi sau khi đã qua bước kiểm tra payload đều trả status, không
        // rejected promise: renderer luôn có `error` + bước để hiện lời thử lại.
        let data = paths::data_dir(&app)?;
        let mut store = StateStore::load(&data);
        let step = current_step(store.get());
        let _ = store.fail(&message, "incomplete-configuration", step);
    }
    status_value(&app)
}

/// `setup:cancel` — đặt cờ cho lượt đang chạy. Không có lượt nào là no-op.
pub fn cancel(app: &AppHandle) -> Result<Value, String> {
    let token = {
        let setup = app.state::<Setup>();
        setup
            .cancel
            .lock()
            .ok()
            .and_then(|slot| slot.as_ref().cloned())
    };
    if let Some(token) = token {
        token.cancel();
    }
    status_value(app)
}

fn blocked_value(app: &AppHandle, message: &str) -> Result<Value, String> {
    let data = paths::data_dir(app)?;
    let store = StateStore::load(&data);
    let setup = app.state::<Setup>();
    let mut cache = setup
        .cache
        .lock()
        .map_err(|_| "Trạng thái cài đặt AI bị hỏng.".to_string())?
        .clone();
    cache.blocked = Some(Blocked {
        code: "incomplete-configuration".to_string(),
        message: message.to_string(),
    });
    let running = setup.running.load(Ordering::SeqCst);
    serde_json::to_value(make_status(store.get(), &cache, running))
        .map_err(|error| format!("không mã hoá trạng thái cài đặt: {error}"))
}

fn resolve_model(requested: &Option<Value>) -> Result<SetupModel, String> {
    let request = read_request(requested)?;
    let id = match request {
        Some(id) => id,
        None => ai_local::recommended_model_id().to_string(),
    };
    let trimmed = id.trim();
    if trimmed.is_empty() {
        return Err("Thiếu mã mô hình AI để cài đặt.".to_string());
    }
    ai_local::setup_model(trimmed)
        .ok_or_else(|| "Mô hình AI được chọn không nằm trong danh mục đã xác minh.".to_string())
}

/// Đọc payload theo đúng luật `readSetupRequest`: chỉ `modelId` dạng chuỗi; mọi
/// khóa khác bị bỏ qua. Mảng/chuỗi/số là payload không hợp lệ.
fn read_request(requested: &Option<Value>) -> Result<Option<String>, String> {
    match requested {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Object(object)) => Ok(object
            .get("modelId")
            .and_then(Value::as_str)
            .map(str::to_string)),
        Some(_) => Err("Yêu cầu cài đặt AI không hợp lệ.".to_string()),
    }
}

fn preflight_inner(app: &AppHandle, model: SetupModel) -> Result<SetupStatus, String> {
    let data = paths::data_dir(app)?;
    let machine = ai_local::machine_snapshot();
    let platform = platform_name().to_string();
    let arch = process_arch().to_string();
    let os_arch = os_arch(&arch);
    let supported_arch = normalize_arch(&arch).or_else(|| normalize_arch(&os_arch));
    let supported = platform == "win32" && supported_arch.is_some();
    let unsupported_reason = if platform != "win32" {
        Some(
            "AI local hiện chỉ hỗ trợ Windows. Trên hệ điều hành khác, các trò chơi đã lưu vẫn mở được nhưng không tạo nội dung mới bằng AI local."
                .to_string(),
        )
    } else if supported_arch.is_none() {
        Some(format!(
            "Kiến trúc máy ({arch}) chưa có bản AI local đã xác minh. Cần Windows x64 hoặc ARM64. Các trò chơi đã lưu vẫn mở được; chỉ phần tạo nội dung mới bằng AI local cần bản này."
        ))
    } else {
        None
    };
    let disk_free_bytes = ai_local::disk_free_bytes(&data);
    let hardware = HardwareView {
        platform: platform.clone(),
        arch: arch.clone(),
        os_arch,
        cpu_model: machine.cpu_model,
        logical_cpu_count: machine.logical_cpu_count,
        total_ram_bytes: machine.total_ram_bytes,
        disk_free_bytes,
        supported,
    };
    let mut cache = SetupCache {
        hardware: Some(hardware.clone()),
        plan: None,
        blocked: None,
    };

    if let Some(reason) = unsupported_reason {
        cache.blocked = Some(Blocked {
            code: "unsupported-hardware".to_string(),
            message: reason,
        });
        return cache_preflight(app, cache);
    }
    if supported_arch != Some("x64") {
        cache.blocked = Some(Blocked {
            code: "unsupported-hardware".to_string(),
            message: format!(
                "Không có bản AI local đã xác minh cho {platform} {}. Các trò chơi đã lưu vẫn mở được; chỉ phần tạo nội dung mới bằng AI local cần bản này.",
                supported_arch.unwrap_or("?")
            ),
        });
        return cache_preflight(app, cache);
    }

    let requested_backend = ai_local::requested_backend(app);
    let backend = if requested_backend == "vulkan" {
        "vulkan"
    } else {
        "cpu"
    };
    let runtime = ai_local::setup_runtime(backend)
        .ok_or_else(|| "Không có bản AI local đã xác minh cho máy này.".to_string())?;
    let runtime_installed = ai_local::runtime_installed(&data);
    let model_installed = ai_local::model_installed(&data, model.id);
    let plan = compute_plan(
        model,
        runtime,
        requested_backend,
        runtime_installed,
        model_installed,
        disk_free_bytes,
    );
    if !plan.enough_disk_space {
        cache.blocked = Some(Blocked {
            code: "disk-space".to_string(),
            message: format!(
                "Ổ đĩa còn {}, cần khoảng {} để cài AI. Hãy giải phóng dung lượng rồi thử lại.",
                format_gib(plan.disk_free_bytes),
                format_gib(Some(plan.remaining_bytes))
            ),
        });
    }
    cache.plan = Some(plan);
    cache_preflight(app, cache)
}

fn cache_preflight(app: &AppHandle, cache: SetupCache) -> Result<SetupStatus, String> {
    let data = paths::data_dir(app)?;
    let store = StateStore::load(&data);
    let setup = app.state::<Setup>();
    let running = setup.running.load(Ordering::SeqCst);
    let snapshot = cache.clone();
    {
        let mut slot = setup
            .cache
            .lock()
            .map_err(|_| "Trạng thái cài đặt AI bị hỏng.".to_string())?;
        *slot = cache;
    }
    Ok(make_status(store.get(), &snapshot, running))
}

fn compute_plan(
    model: SetupModel,
    runtime: SetupRuntime,
    requested_backend: &str,
    runtime_installed: bool,
    model_installed: bool,
    disk_free_bytes: Option<u64>,
) -> SetupPlan {
    let used_fallback = requested_backend == "vulkan" && runtime.backend != "vulkan";
    let fallback_reason = used_fallback.then(|| {
        if requested_backend == "vulkan" {
            "Chưa có bản GPU (Vulkan) đã xác minh cho máy này, nên dùng bản CPU. Kết quả vẫn đúng, chỉ chậm hơn khi phân tích tài liệu dài."
                .to_string()
        } else {
            format!(
                "Chưa có bản {requested_backend} đã xác minh cho máy này, nên dùng bản CPU."
            )
        }
    });
    let remaining_bytes = (if runtime_installed {
        0
    } else {
        runtime.size_bytes
    }) + (if model_installed { 0 } else { model.size_bytes });
    SetupPlan {
        runtime: RuntimePlan {
            id: runtime.id(),
            display_name: runtime.display_name().to_string(),
            download_bytes: if runtime_installed {
                0
            } else {
                runtime.size_bytes
            },
            installed: runtime_installed,
            used_fallback,
            fallback_reason,
        },
        model: ModelPlan {
            id: model.id.to_string(),
            display_name: model.display_name.to_string(),
            download_bytes: if model_installed { 0 } else { model.size_bytes },
            installed: model_installed,
        },
        remaining_bytes,
        disk_free_bytes,
        enough_disk_space: disk_free_bytes
            .map(|free| free >= remaining_bytes)
            .unwrap_or(true),
    }
}

async fn run_setup(app: &AppHandle, model: SetupModel, token: &CancelToken) -> Result<(), String> {
    let data = paths::data_dir(app)?;
    let mut store = StateStore::load(&data);
    let status = preflight_inner(app, model)?;
    if let Some(blocked) = status.blocked {
        let step = current_step(store.get());
        store.fail(&blocked.message, &blocked.code, step)?;
        return Ok(());
    }
    let runtime = ai_local::setup_runtime(if ai_local::requested_backend(app) == "vulkan" {
        "vulkan"
    } else {
        "cpu"
    })
    .ok_or_else(|| "Không có bản AI local đã xác minh cho máy này.".to_string())?;
    let plan = status
        .plan
        .ok_or_else(|| "Không dựng được kế hoạch cài đặt AI.".to_string())?;
    let runtime_correct = ai_local::runtime_installed(&data)
        && ai_local::installed_runtime_backend(&data) == Some(runtime.backend);

    // Sửa DLL hỗ trợ của bản cài cũ ngay cả khi bỏ qua bước tải runtime.
    if plan.runtime.installed {
        ai_local::repair_support_files(app, runtime.backend)?;
    }

    let resume = match resume_point(store.get()) {
        Some(step) => step,
        None => {
            emit_progress(app, SetupStep::Complete, "AI local đã được cài đặt sẵn.");
            return Ok(());
        }
    };

    let ordered = [
        SetupStep::Detecting,
        SetupStep::InstallingRuntime,
        SetupStep::InstallingModels,
        SetupStep::Starting,
        SetupStep::SmokeTest,
    ];
    let mut base_url: Option<String> = None;
    let mut started = false;
    let mut failure: Option<(String, &'static str, SetupStep)> = None;

    for step in ordered
        .iter()
        .copied()
        .skip(resume.index().saturating_sub(1))
    {
        if token.is_cancelled() {
            failure = Some((CANCELLED_MESSAGE.to_string(), "cancelled", step));
            break;
        }
        if step == SetupStep::InstallingRuntime && plan.runtime.installed && runtime_correct {
            continue;
        }
        if step == SetupStep::InstallingModels && plan.model.installed {
            continue;
        }
        match perform_step(
            app,
            &mut store,
            model,
            runtime,
            step,
            token,
            &mut base_url,
            &mut started,
        )
        .await
        {
            Ok(()) => {}
            Err(error) => {
                failure = Some(classify_failure(error, token, step));
                break;
            }
        }
    }

    if let Some((message, code, step)) = failure {
        if started {
            let _ = ai_local::stop_for_setup(app).await;
        }
        store.fail(&message, code, step)?;
        return Ok(());
    }

    let completion = store.transition_to(
        SetupStep::Complete,
        TransitionDetails {
            runtime_id: None,
            backend: Some(runtime.backend),
            model_id: Some(model.id),
        },
    );
    if let Err(error) = completion {
        if started {
            let _ = ai_local::stop_for_setup(app).await;
        }
        store.fail(&error, "smoke-test", SetupStep::SmokeTest)?;
        return Ok(());
    }
    emit_progress(app, SetupStep::Complete, "Đã cài đặt xong AI local.");
    Ok(())
}

#[allow(clippy::too_many_arguments)]
async fn perform_step(
    app: &AppHandle,
    store: &mut StateStore,
    model: SetupModel,
    runtime: SetupRuntime,
    step: SetupStep,
    token: &CancelToken,
    base_url: &mut Option<String>,
    started: &mut bool,
) -> Result<(), String> {
    if token.is_cancelled() {
        return Err(CANCELLED_MESSAGE.to_string());
    }
    let runtime_id = (step == SetupStep::InstallingRuntime).then(|| runtime.id());
    store.transition_to(
        step,
        TransitionDetails {
            runtime_id: runtime_id.as_deref(),
            backend: (step == SetupStep::InstallingRuntime).then_some(runtime.backend),
            model_id: Some(model.id),
        },
    )?;

    match step {
        SetupStep::Detecting => {
            emit_progress(app, step, "Đã kiểm tra cấu hình máy.");
            Ok(())
        }
        SetupStep::InstallingRuntime => {
            let message = format!("Đang tải bộ AI local {}…", runtime.display_name());
            emit_progress(app, step, &message);
            let data = paths::data_dir(app)?;
            let already_right = ai_local::runtime_installed(&data)
                && ai_local::installed_runtime_backend(&data) == Some(runtime.backend);
            if already_right {
                ai_local::repair_support_files(app, runtime.backend)?;
                return Ok(());
            }
            let context = SetupProgressContext {
                step: step.as_str(),
                item_id: runtime.id(),
                message,
            };
            ai_local::install_runtime_for_setup(app, runtime.backend, model.id, token, &context)
                .await
        }
        SetupStep::InstallingModels => {
            let message = format!("Đang tải model {}…", model.display_name);
            emit_progress(app, step, &message);
            let context = SetupProgressContext {
                step: step.as_str(),
                item_id: model.id.to_string(),
                message,
            };
            ai_local::install_model_for_setup(app, model.id, token, &context).await
        }
        SetupStep::Starting => {
            emit_progress(app, step, "Đang khởi động AI local…");
            let url = ai_local::start_for_setup(app, model.id, token).await?;
            if token.is_cancelled() {
                let _ = ai_local::stop_for_setup(app).await;
                return Err(CANCELLED_MESSAGE.to_string());
            }
            *started = true;
            *base_url = Some(url);
            Ok(())
        }
        SetupStep::SmokeTest => {
            emit_progress(app, step, "Đang kiểm tra AI local…");
            // Resume after a crash/retry can land directly on `smoke-test` with
            // no live server (the previous run stopped it on failure). Start it
            // here rather than failing forever on a missing base URL.
            if base_url.is_none() {
                let url = ai_local::start_for_setup(app, model.id, token).await?;
                if token.is_cancelled() {
                    let _ = ai_local::stop_for_setup(app).await;
                    return Err(CANCELLED_MESSAGE.to_string());
                }
                *started = true;
                *base_url = Some(url);
            }
            let Some(url) = base_url.as_deref() else {
                return Err("AI local chưa khởi động nên không thể kiểm tra.".to_string());
            };
            run_smoke_test(url, token).await
        }
        SetupStep::Idle | SetupStep::Complete => Ok(()),
    }
}

fn resume_point(state: &SetupState) -> Option<SetupStep> {
    if is_complete(state) {
        return None;
    }
    let current = if state.step == SetupStep::Idle {
        SetupStep::Detecting
    } else {
        state
            .error
            .as_ref()
            .map(|error| error.step)
            .unwrap_or(state.step)
    };
    if current == SetupStep::Complete {
        Some(SetupStep::SmokeTest)
    } else {
        Some(current)
    }
}

fn current_step(state: &SetupState) -> SetupStep {
    if let Some(error) = state.error.as_ref() {
        return error.step;
    }
    if state.step == SetupStep::Idle {
        SetupStep::Detecting
    } else {
        state.step
    }
}

fn classify_failure(
    message: String,
    token: &CancelToken,
    step: SetupStep,
) -> (String, &'static str, SetupStep) {
    if token.is_cancelled() {
        return (CANCELLED_MESSAGE.to_string(), "cancelled", step);
    }
    let lower = message.to_lowercase();
    if lower.contains("sha-256") || lower.contains("checksum") || lower.contains("toàn vẹn") {
        return (
            format!("{message} Bản tải về có thể bị hỏng; hãy thử tải lại."),
            "integrity",
            step,
        );
    }
    if lower.contains("dung lượng") || lower.contains("không đủ") || lower.contains("enospc")
    {
        return (message, "disk-space", step);
    }
    if lower.contains("fetch failed")
        || lower.contains("network")
        || lower.contains("offline")
        || lower.contains("getaddrinfo")
        || lower.contains("enotfound")
        || lower.contains("econnreset")
        || lower.contains("etimedout")
        || lower.contains("econnrefused")
        || lower.contains("dns")
        || lower.contains("error sending request")
        || lower.contains("operation timed out")
    {
        return (
            "Không kết nối được để tải AI. Hãy kiểm tra mạng rồi thử lại; các phần đã tải xong sẽ được giữ nguyên."
                .to_string(),
            "network",
            step,
        );
    }
    if step == SetupStep::SmokeTest {
        return (message, "smoke-test", step);
    }
    if step == SetupStep::Starting {
        return (message, "startup", step);
    }
    if message.starts_with("Không thể chuyển bước") {
        return (message, "incomplete-configuration", step);
    }
    (message, "download", step)
}

fn emit_progress(app: &AppHandle, step: SetupStep, message: &str) {
    let _ = app.emit(
        "setup:progress",
        json!({
            "step": step,
            "stage": "model",
            "itemId": "",
            "receivedBytes": 0,
            "totalBytes": 0,
            "bytesPerSecond": 0,
            "message": message,
        }),
    );
}

async fn run_smoke_test(base_url: &str, token: &CancelToken) -> Result<(), String> {
    if token.is_cancelled() {
        return Err(CANCELLED_MESSAGE.to_string());
    }
    let base = base_url.trim_end_matches('/');
    let client = reqwest::Client::builder()
        .build()
        .map_err(|error| format!("không tạo được HTTP client: {error}"))?;

    let health_request = client
        .get(format!("{base}/health"))
        .timeout(Duration::from_secs(30));
    let health = await_with_cancel(
        async {
            health_request
                .send()
                .await
                .map_err(|error| error.to_string())
        },
        token,
    )
    .await;
    let health = match health {
        Ok(response) => response,
        Err(error) => {
            if token.is_cancelled() {
                return Err(CANCELLED_MESSAGE.to_string());
            }
            return Err(if error == CANCELLED_MESSAGE {
                CANCELLED_MESSAGE.to_string()
            } else {
                "Không kết nối được máy chủ AI local vừa khởi động.".to_string()
            });
        }
    };
    if !health.status().is_success() {
        return Err(format!(
            "Máy chủ AI local trả về trạng thái {} khi kiểm tra.",
            health.status()
        ));
    }

    let body = json!({
        "model": "local",
        "messages": [{ "role": "user", "content": "Trả lời đúng một chữ: OK" }],
        "temperature": 0,
        "stream": false,
        "max_tokens": 8,
        "chat_template_kwargs": { "enable_thinking": false }
    });
    let completion_request = client
        .post(format!("{base}/chat/completions"))
        .timeout(Duration::from_secs(120))
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .body(body.to_string());
    let completion = await_with_cancel(
        async {
            completion_request
                .send()
                .await
                .map_err(|error| error.to_string())
        },
        token,
    )
    .await;
    let completion = match completion {
        Ok(response) => response,
        Err(error) => {
            if token.is_cancelled() || error == CANCELLED_MESSAGE {
                return Err(CANCELLED_MESSAGE.to_string());
            }
            return Err("Không gửi được yêu cầu thử nghiệm tới máy chủ AI local.".to_string());
        }
    };
    if !completion.status().is_success() {
        return Err(format!(
            "Máy chủ AI local không trả lời được yêu cầu thử nghiệm (HTTP {}).",
            completion.status()
        ));
    }
    let text = completion
        .text()
        .await
        .map_err(|_| "AI local khởi động nhưng không trả về nội dung thử nghiệm.".to_string())?;
    let parsed: Value = serde_json::from_str(&text)
        .map_err(|_| "AI local khởi động nhưng không trả về nội dung thử nghiệm.".to_string())?;
    if !completion_content_ok(&parsed) {
        return Err("AI local khởi động nhưng không trả về nội dung thử nghiệm.".to_string());
    }
    if token.is_cancelled() {
        return Err(CANCELLED_MESSAGE.to_string());
    }
    Ok(())
}

fn completion_content_ok(body: &Value) -> bool {
    body.pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .map(|content| !content.trim().is_empty())
        .unwrap_or(false)
}

async fn await_with_cancel<F, T>(future: F, token: &CancelToken) -> Result<T, String>
where
    F: Future<Output = Result<T, String>>,
{
    tokio::pin!(future);
    loop {
        tokio::select! {
            result = &mut future => return result,
            _ = tokio::time::sleep(Duration::from_millis(100)) => {
                if token.is_cancelled() {
                    return Err(CANCELLED_MESSAGE.to_string());
                }
            }
        }
    }
}

fn platform_name() -> &'static str {
    match std::env::consts::OS {
        "windows" => "win32",
        "macos" => "darwin",
        other => other,
    }
}

fn process_arch() -> &'static str {
    match std::env::consts::ARCH {
        "x86_64" => "x64",
        "aarch64" => "arm64",
        other => other,
    }
}

fn os_arch(fallback: &str) -> String {
    // Trên Windows, tiến trình x64 chạy được trên Windows ARM64; biến này phản
    // ánh kiến trúc OS thật. Chuẩn hoá về cách Node gọi tên để wizard đọc được.
    let raw = std::env::var("PROCESSOR_ARCHITEW6432")
        .or_else(|_| std::env::var("PROCESSOR_ARCHITECTURE"))
        .unwrap_or_else(|_| fallback.to_string());
    normalize_arch(&raw)
        .map(str::to_string)
        .unwrap_or_else(|| raw.to_lowercase())
}

fn normalize_arch(value: &str) -> Option<&'static str> {
    match value.trim().to_ascii_lowercase().as_str() {
        "x64" | "x86_64" | "amd64" => Some("x64"),
        "arm64" | "aarch64" => Some("arm64"),
        _ => None,
    }
}

fn format_gib(bytes: Option<u64>) -> String {
    let Some(bytes) = bytes else {
        return "không xác định".to_string();
    };
    let value = bytes as f64 / (1024.0 * 1024.0 * 1024.0);
    let mut text = format!("{value:.1}");
    if text.ends_with(".0") {
        text.truncate(text.len() - 2);
    }
    text.replace('.', ",")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_data() -> tempfile::TempDir {
        tempfile::tempdir().unwrap()
    }

    #[test]
    fn allowed_transitions_match_electron_and_reject_idle_to_complete() {
        assert!(can_transition(SetupStep::Idle, SetupStep::Detecting));
        assert!(!can_transition(SetupStep::Idle, SetupStep::Complete));
        assert!(can_transition(
            SetupStep::Detecting,
            SetupStep::InstallingRuntime
        ));
        assert!(can_transition(
            SetupStep::InstallingModels,
            SetupStep::Starting
        ));
        assert!(can_transition(SetupStep::SmokeTest, SetupStep::Complete));
        assert!(can_transition(SetupStep::Complete, SetupStep::Detecting));
        assert!(!can_transition(
            SetupStep::Starting,
            SetupStep::InstallingModels
        ));
    }

    #[test]
    fn parse_state_filters_completed_steps_and_repairs_contradictions() {
        let raw = json!({
            "schemaVersion": 1,
            "step": "complete",
            "completedSteps": ["idle", "detecting", "complete", "backwards", "detecting"],
            "runtimeId": "llama.cpp-b11681-cpu-win32-x64",
            "backend": "cpu",
            "modelId": "qwen3.5-2b-q4_k_m",
            "startedAt": "2026-11-10T01:02:03.004Z",
            "updatedAt": "2026-11-10T01:02:04Z",
            "completedAt": "2026-11-10T01:02:05Z",
            "error": {
                "step": "installing-models",
                "message": "Mạng đứt",
                "code": "network",
                "at": "2026-11-10T01:02:05Z",
                "attempts": 3
            }
        });
        let state = parse_state(&raw);
        assert_eq!(state.step, SetupStep::InstallingModels);
        assert_eq!(state.completed_steps, vec![SetupStep::Detecting]);
        assert_eq!(
            state.runtime_id.as_deref(),
            Some("llama.cpp-b11681-cpu-win32-x64")
        );
        assert_eq!(state.error.as_ref().unwrap().attempts, 3);
        assert!(state.completed_at.is_none());
    }

    #[test]
    fn parse_state_degrades_corrupt_or_unknown_input_to_idle() {
        for raw in [
            Value::Null,
            json!({}),
            json!({ "schemaVersion": 2, "step": "complete", "completedSteps": [] }),
            json!({ "schemaVersion": 1, "step": "nope", "completedSteps": [] }),
        ] {
            let state = parse_state(&raw);
            assert_eq!(state.step, SetupStep::Idle);
            assert!(state.completed_steps.is_empty());
        }
    }

    #[test]
    fn state_store_resumes_failed_step_and_increments_attempts() {
        let data = temp_data();
        let mut store = StateStore::load(data.path());
        store
            .transition_to(SetupStep::Detecting, TransitionDetails::default())
            .unwrap();
        store
            .transition_to(
                SetupStep::InstallingRuntime,
                TransitionDetails {
                    runtime_id: Some("llama.cpp-b11681-cpu-win32-x64"),
                    backend: Some("cpu"),
                    model_id: Some("qwen3.5-2b-q4_k_m"),
                },
            )
            .unwrap();
        store
            .fail("Mạng đứt", "network", SetupStep::InstallingRuntime)
            .unwrap();
        store
            .fail("Mạng đứt lần nữa", "network", SetupStep::InstallingRuntime)
            .unwrap();

        let mut again = StateStore::load(data.path());
        assert_eq!(again.get().step, SetupStep::InstallingRuntime);
        assert_eq!(
            again.get().completed_steps,
            vec![SetupStep::Detecting, SetupStep::InstallingRuntime]
        );
        assert_eq!(again.get().error.as_ref().unwrap().attempts, 2);
        assert_eq!(again.get().backend.as_deref(), Some("cpu"));
        assert_eq!(
            resume_point(again.get()),
            Some(SetupStep::InstallingRuntime)
        );

        // Retry the same step clears the error but keeps completed work.
        again
            .transition_to(SetupStep::InstallingModels, TransitionDetails::default())
            .unwrap();
        assert!(again.get().error.is_none());
        assert!(again.get().completed_steps.contains(&SetupStep::Detecting));
    }

    #[test]
    fn state_store_rejects_illegal_transition() {
        let data = temp_data();
        let mut store = StateStore::load(data.path());
        let error = store
            .transition_to(SetupStep::Complete, TransitionDetails::default())
            .unwrap_err();
        assert!(error.contains("Không thể chuyển bước"));
        assert_eq!(store.get().step, SetupStep::Idle);
    }

    #[test]
    fn complete_requires_a_clean_state() {
        let mut state = initial_state();
        state.step = SetupStep::Complete;
        assert!(is_complete(&state));
        state.error = Some(SetupErrorDetails {
            step: SetupStep::SmokeTest,
            message: "lỗi".to_string(),
            code: None,
            at: crate::library::now(),
            attempts: 1,
        });
        assert!(!is_complete(&state));
    }

    #[test]
    fn plan_counts_only_missing_artifacts_and_omits_unknown_disk() {
        let model = ai_local::setup_model("qwen3.5-2b-q4_k_m").unwrap();
        let runtime = ai_local::setup_runtime("cpu").unwrap();
        let plan = compute_plan(model, runtime, "cpu", false, false, None);
        assert_eq!(plan.runtime.id, "llama.cpp-b11681-cpu-win32-x64");
        assert_eq!(plan.model.id, "qwen3.5-2b-q4_k_m");
        assert_eq!(plan.remaining_bytes, runtime.size_bytes + model.size_bytes);
        assert!(plan.enough_disk_space);
        let value = serde_json::to_value(&plan).unwrap();
        assert!(value.get("diskFreeBytes").is_none());
        assert!(value.pointer("/runtime/fallbackReason").is_none());

        let installed = compute_plan(model, runtime, "cpu", true, true, Some(10));
        assert_eq!(installed.remaining_bytes, 0);
        assert_eq!(installed.runtime.download_bytes, 0);
        assert_eq!(installed.model.download_bytes, 0);
        assert!(installed.enough_disk_space);
    }

    #[test]
    fn plan_reports_disk_shortage_and_format_is_vietnamese() {
        let model = ai_local::setup_model("qwen3.5-2b-q4_k_m").unwrap();
        let runtime = ai_local::setup_runtime("cpu").unwrap();
        let plan = compute_plan(model, runtime, "cpu", false, false, Some(1024));
        assert!(!plan.enough_disk_space);
        assert_eq!(format_gib(Some(1024 * 1024 * 1024)), "1");
        assert_eq!(format_gib(Some(3_221_225_472)), "3");
        assert_eq!(format_gib(None), "không xác định");
    }

    #[test]
    fn smoke_completion_requires_non_empty_content() {
        assert!(completion_content_ok(&json!({
            "choices": [{ "message": { "content": "OK" } }]
        })));
        assert!(!completion_content_ok(&json!({
            "choices": [{ "message": { "content": "   " } }]
        })));
        assert!(!completion_content_ok(&json!({ "choices": [] })));
    }

    #[test]
    fn iso_dates_accept_electron_and_rust_shapes() {
        assert!(looks_like_iso_date("2026-11-10T01:02:03.004Z"));
        assert!(looks_like_iso_date("2026-11-10T01:02:03Z"));
        assert!(looks_like_iso_date("2026-11-10T01:02:03+07:00"));
        assert!(!looks_like_iso_date("2026-13-10T01:02:03Z"));
        assert!(!looks_like_iso_date("not a date"));
        assert!(!looks_like_iso_date("2026-11-10"));
    }

    #[test]
    fn payload_accepts_only_plain_objects_with_string_model_id() {
        assert_eq!(read_request(&None).unwrap(), None);
        assert_eq!(read_request(&Some(Value::Null)).unwrap(), None);
        assert_eq!(
            read_request(&Some(json!({ "modelId": "qwen3.5-2b-q4_k_m" }))).unwrap(),
            Some("qwen3.5-2b-q4_k_m".to_string())
        );
        assert_eq!(read_request(&Some(json!({ "modelId": 3 }))).unwrap(), None);
        assert_eq!(
            read_request(&Some(json!({ "extra": "ignored" }))).unwrap(),
            None
        );
        assert!(read_request(&Some(json!(["x"]))).is_err());
        assert!(read_request(&Some(json!("x"))).is_err());
    }
}
