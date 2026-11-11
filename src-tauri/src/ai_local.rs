//! AI local của vỏ Tauri: danh mục đã xác minh, tải runtime/model, và
//! `llama-server` do tiến trình này quản lý.
//!
//! Bản Electron đã có đủ ba lớp (`model-catalog.ts`, `runtime-installer.ts`,
//! `model-installer.ts`, `ai-manager.ts`). Ở đây giữ đúng những bất biến quan
//! trọng nhất thay vì bê nguyên toàn bộ hệ thống:
//!
//!   - URL, kích thước byte và SHA-256 là hằng số trong mã Rust. Renderer chỉ
//!     gửi **id model**, không bao giờ gửi URL hay đường dẫn. Một id lạ bị từ
//!     chối trước khi chạm đĩa hoặc mạng.
//!   - Runtime và model chỉ được coi là "đã cài" sau khi kích thước và SHA-256
//!     khớp manifest. Gói zip runtime được giải nén vào thư mục tạm, chỉ nhận
//!     tệp phẳng `.exe`/`.dll`/`LICENSE`, rồi mới đổi tên vào vị trí thật.
//!   - Tên tệp trên đĩa do Rust dựng từ id/version, không nhận từ frontend.
//!   - `llama-server` chỉ nghe trên 127.0.0.1 với cổng trống do hệ điều hành
//!     cấp; không có cổng cố định nào bị chiếm.
//!
//! Phần này chưa port bộ máy sinh nội dung (`ai:generate`) hay wizard setup;
//! chúng vẫn báo `not-supported`. Mục tiêu của bước này là để giáo viên tải và
//! chạy được runtime local trong vỏ Tauri, với cùng danh mục mà bản Electron
//! đang dùng.

use std::{
    cmp::min,
    path::{Path, PathBuf},
    process::Stdio,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicU64, Ordering},
    },
    time::{Duration, Instant},
};

use futures_util::StreamExt;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager};
use tokio::{
    io::{AsyncRead, AsyncReadExt, AsyncWriteExt},
    process::{Child, Command},
};

use crate::paths;

/// Thư mục gốc của AI local trong dữ liệu Tauri.
const LOCAL_ROOT: &str = "ai-local";
/// Phiên bản llama.cpp đã xác minh. Giữ cùng giá trị với `runtime-manifest.ts`.
const RUNTIME_VERSION: &str = "b11681";
const RUNTIME_EXE: &str = "llama-server.exe";
const MODEL_EXTENSION: &str = ".gguf";
const HEALTH_TIMEOUT: Duration = Duration::from_secs(300);
const HEALTH_INTERVAL: Duration = Duration::from_millis(250);
/// Cùng context/parallel với `buildLlamaServerArguments` bên Electron.
const CONTEXT_SIZE: u32 = 8192;
/// `CREATE_NO_WINDOW`: llama-server là tiến trình nền, không được mở cửa sổ console.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

const RUNTIME_SUPPORT_FILES: &[&str] = &["msvcp140.dll", "vcruntime140.dll", "vcruntime140_1.dll"];

struct RuntimeSpec {
    backend: &'static str,
    download_url: &'static str,
    size_bytes: u64,
    sha256: &'static str,
}

const RUNTIME_CPU: RuntimeSpec = RuntimeSpec {
    backend: "cpu",
    download_url: "https://github.com/ggml-org/llama.cpp/releases/download/b11681/llama-b11681-bin-win-cpu-x64.zip",
    size_bytes: 19_565_747,
    sha256: "07006066db26ba20863785ec8fdd55028226c8eafcdb8db5a1484e98ebf01676",
};

const RUNTIME_VULKAN: RuntimeSpec = RuntimeSpec {
    backend: "vulkan",
    download_url: "https://github.com/ggml-org/llama.cpp/releases/download/b11681/llama-b11681-bin-win-vulkan-x64.zip",
    size_bytes: 32_209_242,
    sha256: "059a995618a5b7163c64e88d16bf395280f45cd0460c2a71b05e2aae5ada8a00",
};

const RUNTIMES: &[&RuntimeSpec] = &[&RUNTIME_CPU, &RUNTIME_VULKAN];

/// Tín hiệu hủy dùng chung giữa lệnh `setup:cancel` và các bước đang chạy.
///
/// Chỉ là một cờ nguyên tử: tải xuống, kiểm tra sức khỏe và thử nghiệm đều đọc
/// nó ở mỗi vòng lặp. Nhờ vậy hủy không cần giết task async (dễ bỏ rơi tiến
/// trình con) và byte đã tải vẫn nằm trên đĩa để lần sau tải tiếp.
#[derive(Clone, Default)]
pub(crate) struct CancelToken {
    flag: Arc<AtomicBool>,
}

impl CancelToken {
    pub(crate) fn new() -> Self {
        Self::default()
    }

    pub(crate) fn cancel(&self) {
        self.flag.store(true, Ordering::SeqCst);
    }

    pub(crate) fn is_cancelled(&self) -> bool {
        self.flag.load(Ordering::SeqCst)
    }
}

pub(crate) const CANCELLED_MESSAGE: &str = "Đã hủy cài đặt.";

/// Ngữ cảnh tiến trình riêng của wizard. Khi có ngữ cảnh này, `Progress` phát
/// `setup:progress` thay vì `ai:local-progress`; hai kênh không bị trộn.
#[derive(Clone)]
pub(crate) struct SetupProgressContext {
    pub step: &'static str,
    pub item_id: String,
    pub message: String,
}

/// Thông tin model tối thiểu mà `setup.rs` được phép thấy. Không lộ URL/SHA.
#[derive(Clone, Copy)]
pub(crate) struct SetupModel {
    pub id: &'static str,
    pub display_name: &'static str,
    pub size_bytes: u64,
}

/// Một runtime đã xác minh, đủ để dựng kế hoạch cài đặt.
#[derive(Clone, Copy)]
pub(crate) struct SetupRuntime {
    pub backend: &'static str,
    pub size_bytes: u64,
}

impl SetupRuntime {
    pub(crate) fn id(&self) -> String {
        format!(
            "llama.cpp-{RUNTIME_VERSION}-{}-win32-x64",
            self.backend
        )
    }

    pub(crate) fn display_name(&self) -> &'static str {
        if self.backend == "vulkan" {
            "llama.cpp Vulkan (Windows x64)"
        } else {
            "llama.cpp CPU (Windows x64)"
        }
    }
}

/// Ảnh chụp cấu hình máy cho preflight; không chứa đường dẫn hay thông tin ảnh.
#[derive(Clone)]
pub(crate) struct MachineSnapshot {
    pub total_ram_bytes: u64,
    pub logical_cpu_count: u32,
    pub cpu_model: String,
}

fn ensure_not_cancelled(cancel: Option<&CancelToken>) -> Result<(), String> {
    match cancel {
        Some(token) if token.is_cancelled() => Err(CANCELLED_MESSAGE.to_string()),
        _ => Ok(()),
    }
}

/// Các hàm `setup.rs` dùng, giữ bề mặt hẹp: chỉ id model/backend, không URL.
pub(crate) fn setup_model(id: &str) -> Option<SetupModel> {
    MODELS
        .iter()
        .find(|model| model.id == id.trim())
        .map(|model| SetupModel {
            id: model.id,
            display_name: model.display_name,
            size_bytes: model.size_bytes,
        })
}

pub(crate) fn recommended_model_id() -> &'static str {
    recommend_model_id(&machine_info())
}

pub(crate) fn machine_snapshot() -> MachineSnapshot {
    let machine = machine_info();
    MachineSnapshot {
        total_ram_bytes: machine.total_ram_bytes,
        logical_cpu_count: machine.logical_cpu_count,
        cpu_model: machine.cpu_model,
    }
}

pub(crate) fn setup_runtime(backend: &str) -> Option<SetupRuntime> {
    RUNTIMES
        .iter()
        .find(|runtime| runtime.backend == backend)
        .map(|runtime| SetupRuntime {
            backend: runtime.backend,
            size_bytes: runtime.size_bytes,
        })
}

pub(crate) fn requested_backend(app: &AppHandle) -> &'static str {
    wanted_backend(app)
}

pub(crate) fn installed_runtime_backend(data: &Path) -> Option<&'static str> {
    detect_installed_backend(&runtime_dir(data))
}

pub(crate) fn runtime_installed(data: &Path) -> bool {
    runtime_executable(data).is_some()
}

pub(crate) fn model_installed(data: &Path, model_id: &str) -> bool {
    MODELS
        .iter()
        .find(|model| model.id == model_id)
        .map(|model| {
            model_path(data, model)
                .metadata()
                .map(|meta| meta.is_file() && meta.len() == model.size_bytes)
                .unwrap_or(false)
        })
        .unwrap_or(false)
}

pub(crate) fn disk_free_bytes(directory: &Path) -> Option<u64> {
    available_bytes(directory)
}

/// Sửa thư viện VC++ của runtime đã cài mà không tải lại gói. Bản cũ có thể đã
/// có `llama-server.exe` nhưng thiếu DLL, đúng lỗi mà bước sửa chữa tồn tại để
/// tránh.
pub(crate) fn repair_support_files(app: &AppHandle, backend: &str) -> Result<(), String> {
    let data = paths::data_dir(app)?;
    let target = runtime_dir(&data);
    if detect_installed_backend(&target) == Some(runtime_spec(backend).backend)
        && runtime_executable(&data).is_some()
    {
        copy_support_files(app, &target)?;
    }
    Ok(())
}

pub(crate) async fn install_runtime_for_setup(
    app: &AppHandle,
    backend: &str,
    model_id: &str,
    cancel: &CancelToken,
    progress: &SetupProgressContext,
) -> Result<(), String> {
    let data = paths::data_dir(app)?;
    ensure_runtime(
        app,
        &data,
        backend,
        model_id,
        Some(cancel),
        Some(progress),
    )
    .await
}

pub(crate) async fn install_model_for_setup(
    app: &AppHandle,
    model_id: &str,
    cancel: &CancelToken,
    progress: &SetupProgressContext,
) -> Result<(), String> {
    let model = MODELS
        .iter()
        .find(|model| model.id == model_id)
        .ok_or_else(|| "Model AI local không nằm trong danh mục đã xác minh.".to_string())?;
    let data = paths::data_dir(app)?;
    install_model(app, &data, model, Some(cancel), Some(progress)).await
}

pub(crate) async fn start_for_setup(
    app: &AppHandle,
    model_id: &str,
    cancel: &CancelToken,
) -> Result<String, String> {
    let model = MODELS
        .iter()
        .find(|model| model.id == model_id)
        .ok_or_else(|| "Model AI local không nằm trong danh mục đã xác minh.".to_string())?;
    let state = app.state::<AiLocal>();
    let _guard = state.start.lock().await;
    start_locked(app, model, Some(cancel)).await
}

pub(crate) async fn stop_for_setup(app: &AppHandle) -> Result<(), String> {
    stop_internal(app).await
}

#[derive(Debug)]
struct ModelSpec {
    id: &'static str,
    version: &'static str,
    display_name: &'static str,
    friendly_name: &'static str,
    tagline: &'static str,
    download_url: &'static str,
    size_bytes: u64,
    sha256: &'static str,
    source_url: &'static str,
    license_name: &'static str,
    license_url: &'static str,
    minimum_ram_bytes: u64,
    recommended_ram_bytes: u64,
    recommended_cpu_threads: u32,
    supported_languages: &'static [&'static str],
    expected_result: &'static str,
}

const MODELS: &[ModelSpec] = &[
    ModelSpec {
        id: "qwen3.5-2b-q4_k_m",
        version: "31e04817b38d",
        display_name: "Qwen3.5 2B · Q4_K_M",
        friendly_name: "Bản Nhanh — phù hợp máy yếu",
        tagline: "Nhanh, tự động, phù hợp máy yếu · trả lời gọn, ít tốn RAM/CPU.",
        download_url: "https://huggingface.co/unsloth/Qwen3.5-2B-GGUF/resolve/31e04817b38d226cdd13454bcc3982ebaa5a386b/Qwen3.5-2B-Q4_K_M.gguf",
        size_bytes: 1_280_835_840,
        sha256: "aaf42c8b7c3cab2bf3d69c355048d4a0ee9973d48f16c731c0520ee914699223",
        source_url: "https://huggingface.co/unsloth/Qwen3.5-2B-GGUF",
        license_name: "Apache-2.0",
        license_url: "https://huggingface.co/Qwen/Qwen3.5-2B/blob/main/LICENSE",
        minimum_ram_bytes: 4 * 1024 * 1024 * 1024,
        recommended_ram_bytes: 8 * 1024 * 1024 * 1024,
        recommended_cpu_threads: 6,
        supported_languages: &["Tiếng Việt", "Tiếng Anh", "Đa ngôn ngữ"],
        expected_result: "Cân bằng hơn cho tóm tắt, hỏi đáp và bộ câu hỏi theo tài liệu; tốc độ CPU phụ thuộc cấu hình máy và giáo viên cần rà soát nội dung.",
    },
    ModelSpec {
        id: "gemma-4-e2b-it-q4_k_m",
        version: "0314792d7f1f",
        display_name: "Gemma 4 E2B · Q4_K_M",
        friendly_name: "Bản Đa năng — Gemma 4 (thử nghiệm)",
        tagline: "Model mới của Google, nhiều ngôn ngữ · đã đo: chậm hơn bản Nhanh trên CPU và có bước \"suy nghĩ\" trước câu trả lời, hãy thử để so sánh.",
        download_url: "https://huggingface.co/unsloth/gemma-4-E2B-it-GGUF/resolve/0314792d7f1f7e229411f620751375812bb9faf2/gemma-4-E2B-it-Q4_K_M.gguf",
        size_bytes: 3_106_738_272,
        sha256: "740185b21d22ceb83a11c3aa62ad5842ef32c70f6096d756bbee85a1e4ec34b8",
        source_url: "https://huggingface.co/unsloth/gemma-4-E2B-it-GGUF",
        license_name: "Apache-2.0",
        license_url: "https://ai.google.dev/gemma/docs/gemma_4_license",
        minimum_ram_bytes: 8 * 1024 * 1024 * 1024,
        recommended_ram_bytes: 12 * 1024 * 1024 * 1024,
        recommended_cpu_threads: 8,
        supported_languages: &["Tiếng Việt", "Tiếng Anh", "Đa ngôn ngữ"],
        expected_result: "Đã đo trên máy phổ thông: chậm hơn bản Nhanh ở cả đọc tài liệu lẫn sinh câu (4,65 tỉ tham số) và có thể in bước \"suy nghĩ\" thay vì câu trả lời khi câu ngắn; chất lượng chưa được đánh giá, giáo viên phải rà soát nội dung.",
    },
    ModelSpec {
        id: "qwen3.5-4b-q4_k_m",
        version: "1a02dbed1cd",
        display_name: "Qwen3.5 4B · Q4_K_M",
        friendly_name: "Bản Linh hoạt — nhiều lựa chọn hơn",
        tagline: "Có thể tạo nhiều lựa chọn khác nhau, hỏi sâu hơn · cần cấu hình cao hơn bản Nhanh.",
        download_url: "https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/1a02dbed1cdfe73efc3fa519c54126befb4faf68/Qwen3.5-4B-Q4_K_M.gguf",
        size_bytes: 2_740_937_888,
        sha256: "00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4",
        source_url: "https://huggingface.co/unsloth/Qwen3.5-4B-GGUF",
        license_name: "Apache-2.0",
        license_url: "https://huggingface.co/Qwen/Qwen3.5-4B/blob/main/LICENSE",
        minimum_ram_bytes: 8 * 1024 * 1024 * 1024,
        recommended_ram_bytes: 12 * 1024 * 1024 * 1024,
        recommended_cpu_threads: 8,
        supported_languages: &["Tiếng Việt", "Tiếng Anh", "Đa ngôn ngữ"],
        expected_result: "Thường giữ được nhiều ngữ cảnh hơn các model nhỏ khi phân tích tài liệu, đổi lại cần nhiều RAM và thời gian CPU; vẫn có thể sai và phải được giáo viên duyệt.",
    },
];

/// State do Tauri quản lý. `runtime` chỉ bị giữ trong lúc đọc/ghi rất ngắn,
/// không bao giờ giữ qua `.await`; nhờ vậy lệnh đồng bộ `ai:local-models` vẫn
/// đọc được trạng thái mà không cần runtime async.
#[derive(Default)]
pub struct AiLocal {
    install: tokio::sync::Mutex<()>,
    start: tokio::sync::Mutex<()>,
    runtime: Mutex<RuntimeState>,
    generation: AtomicU64,
}

struct RuntimeState {
    state: String,
    model_id: Option<String>,
    port: Option<u16>,
    backend: Option<String>,
    child: Option<Child>,
    output: Arc<Mutex<String>>,
}

impl Default for RuntimeState {
    fn default() -> Self {
        Self {
            state: "STOPPED".to_string(),
            model_id: None,
            port: None,
            backend: None,
            child: None,
            output: Arc::new(Mutex::new(String::new())),
        }
    }
}

#[derive(Debug, Clone)]
struct Machine {
    total_ram_bytes: u64,
    logical_cpu_count: u32,
    cpu_model: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Recommendation {
    Recommended,
    Possible,
    NotRecommended,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum MemoryStatus {
    Insufficient,
    BelowRecommended,
    Recommended,
}

/// Danh mục + trạng thái runtime cho `ai:local-models`.
pub fn catalog(app: &AppHandle) -> Result<Value, String> {
    let data = paths::data_dir(app)?;
    let raw = paths::read_json(
        app,
        paths::SETTINGS_FILE,
        crate::settings::default_settings(),
    )?;
    let selected = raw
        .pointer("/ai/localModelId")
        .and_then(Value::as_str)
        .unwrap_or(MODELS[0].id);
    let machine = machine_info();
    let recommended = recommend_model_id(&machine);
    let (runtime_state, running_model, running_backend) = runtime_snapshot(app);
    let runtime_installed = runtime_executable(&data).is_some();

    let models = MODELS
        .iter()
        .map(|model| {
            let installed = model_path(&data, model)
                .metadata()
                .map(|meta| meta.is_file() && meta.len() == model.size_bytes)
                .unwrap_or(false);
            let memory = memory_status(&machine, model);
            let cpu_recommended = machine.logical_cpu_count >= model.recommended_cpu_threads;
            let status = recommendation_status(memory, cpu_recommended, &machine, model);
            json!({
                "id": model.id,
                "version": model.version,
                "displayName": model.display_name,
                "friendlyName": model.friendly_name,
                "tagline": model.tagline,
                "downloadUrl": model.download_url,
                "sizeBytes": model.size_bytes,
                "sha256": model.sha256,
                "sourceUrl": model.source_url,
                "licenseName": model.license_name,
                "licenseUrl": model.license_url,
                "minimumRamBytes": model.minimum_ram_bytes,
                "recommendedRamBytes": model.recommended_ram_bytes,
                "recommendedCpuThreads": model.recommended_cpu_threads,
                "cpuThreads": resolve_cpu_threads(machine.logical_cpu_count, model.recommended_cpu_threads),
                "minimumRamOk": memory != MemoryStatus::Insufficient,
                "recommendedRamOk": memory == MemoryStatus::Recommended,
                "cpuOk": cpu_recommended,
                "memoryStatus": memory_status_name(memory),
                "cpuStatus": if cpu_recommended { "recommended" } else { "limited" },
                "status": recommendation_name(status),
                "recommendationReason": recommendation_reason(memory, cpu_recommended, &machine, model),
                "installed": installed,
                "isRecommended": model.id == recommended,
                "supportedLanguages": model.supported_languages,
                "expectedResult": model.expected_result,
                "gpu": {
                    "supported": false,
                    "required": false,
                    "recommendedLayers": 0,
                },
            })
        })
        .collect::<Vec<_>>();

    Ok(json!({
        "models": models,
        "machine": {
            "totalRamBytes": machine.total_ram_bytes,
            "logicalCpuCount": machine.logical_cpu_count,
            "cpuModel": machine.cpu_model,
            "recommendedModelId": recommended,
            "selectedModelId": selected,
            "runtimeInstalled": runtime_installed,
            "runtimeState": runtime_state,
            "runtimeSupported": cfg!(all(windows, target_arch = "x86_64")),
            "runtimeBackend": running_backend,
            "runningModelId": running_model,
            "gpuDetectionStatus": "unavailable",
            "gpuDetectionMessage": "Vỏ Tauri chưa dò GPU; AI local hiện chạy trên CPU.",
        }
    }))
}

/// `{state, modelId?, message?}` — cùng hình dạng `ai:local-status` của Electron.
pub fn status(app: &AppHandle) -> Value {
    let (state, model_id, _) = runtime_snapshot(app);
    let mut value = json!({ "state": state });
    if let Some(model_id) = model_id {
        if let Some(object) = value.as_object_mut() {
            object.insert("modelId".to_string(), Value::String(model_id));
        }
    }
    value
}

fn runtime_snapshot(app: &AppHandle) -> (String, Option<String>, Option<String>) {
    let Some(state) = app.try_state::<AiLocal>() else {
        return ("STOPPED".to_string(), None, None);
    };
    let snapshot = match state.runtime.lock() {
        Ok(runtime) => (
            runtime.state.clone(),
            runtime.model_id.clone(),
            runtime.backend.clone(),
        ),
        Err(_) => ("ERROR".to_string(), None, None),
    };
    snapshot
}

/// Tải runtime (nếu chưa có đúng backend) và model, rồi ghi lựa chọn vào settings.
pub async fn install(app: AppHandle, requested: Option<Value>) -> Result<Value, String> {
    let model = model_from_value(requested)?;
    let state = app.state::<AiLocal>();
    let _guard = state.install.lock().await;
    let data = paths::data_dir(&app)?;
    let backend = wanted_backend(&app);
    ensure_runtime(&app, &data, backend, model.id, None, None).await?;
    install_model(&app, &data, &model, None, None).await?;
    mark_local_active(&app, model.id)?;
    // Cùng hình dạng `{ok, models}` với Electron: `local-ai.ts` đọc
    // `result.models.models` và `result.models.machine`, không phải catalog trần.
    Ok(json!({ "ok": true, "models": catalog(&app)? }))
}

/// Khởi động `llama-server` cho model đã tải đầy đủ. Vulkan được thử trước;
/// nếu nó không lên được thì hạ xuống CPU thay vì làm hỏng toàn bộ AI local.
pub async fn start(app: AppHandle, requested: Option<Value>) -> Result<Value, String> {
    let model = model_from_value(requested)?;
    let start_state = app.state::<AiLocal>();
    let _guard = start_state.start.lock().await;
    let base_url = start_locked(&app, &model, None).await?;
    Ok(json!({
        "ok": true,
        "baseUrl": base_url,
        "models": catalog(&app)?,
    }))
}

/// Phần thân dùng chung cho `ai:start-local-runtime` và bước `starting` của
/// wizard. `cancel` chỉ có ở wizard; luồng Settings giữ nguyên hành vi cũ.
async fn start_locked(
    app: &AppHandle,
    model: &ModelSpec,
    cancel: Option<&CancelToken>,
) -> Result<String, String> {
    ensure_not_cancelled(cancel)?;
    let data = paths::data_dir(app)?;
    if runtime_executable(&data).is_none() {
        return Err("Runtime llama.cpp chưa được cài. Hãy tải model trước.".to_string());
    }
    let model_file = model_path(&data, model);
    verify_file(&model_file, model.size_bytes, model.sha256).await?;
    ensure_not_cancelled(cancel)?;

    let requested_backend = wanted_backend(app);
    let installed_backend = detect_installed_backend(&runtime_dir(&data));
    if installed_backend != Some(requested_backend) {
        ensure_runtime(app, &data, requested_backend, model.id, cancel, None).await?;
    }

    let mut attempts = vec![requested_backend];
    if requested_backend == "vulkan" {
        attempts.push("cpu");
    }

    let mut last_error = String::new();
    for backend in attempts {
        ensure_not_cancelled(cancel)?;
        if backend != requested_backend {
            ensure_runtime(app, &data, backend, model.id, cancel, None).await?;
        }
        let executable = runtime_executable(&data)
            .ok_or_else(|| "Runtime llama.cpp chưa được cài.".to_string())?;
        match run_backend(app, model, &executable, backend, &model_file, cancel).await {
            Ok(()) => {
                if let Err(error) = ensure_not_cancelled(cancel) {
                    let _ = stop_internal(app).await;
                    return Err(error);
                }
                if let Err(error) = mark_local_active(app, model.id) {
                    let _ = stop_internal(app).await;
                    return Err(error);
                }
                let base_url = app
                    .state::<AiLocal>()
                    .runtime
                    .lock()
                    .ok()
                    .and_then(|runtime| runtime.port)
                    .map(|port| format!("http://127.0.0.1:{port}"))
                    .unwrap_or_default();
                return Ok(base_url);
            }
            Err(error) => {
                last_error = error;
                let _ = stop_internal(app).await;
            }
        }
    }

    Err(format!("Không khởi động được llama.cpp. {last_error}"))
}

/// Dừng tiến trình đang chạy và trả danh mục mới. Không có tiến trình cũng là
/// thành công — nút "Dừng" không được báo lỗi khi runtime đã tắt.
pub async fn stop(app: AppHandle) -> Result<Value, String> {
    stop_internal(&app).await?;
    let _ = app.emit(
        "ai:local-progress",
        json!({
            "stage": "stopped",
            "receivedBytes": 0,
            "totalBytes": 0,
            "bytesPerSecond": 0
        }),
    );
    Ok(json!({ "ok": true, "models": catalog(&app)? }))
}

async fn stop_internal(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<AiLocal>();
    state.generation.fetch_add(1, Ordering::SeqCst);
    let child = {
        let mut runtime = state
            .runtime
            .lock()
            .map_err(|_| "Trạng thái AI local bị hỏng.".to_string())?;
        let child = runtime.child.take();
        runtime.state = "STOPPED".to_string();
        runtime.model_id = None;
        runtime.port = None;
        runtime.backend = None;
        child
    };
    if let Some(mut child) = child {
        let _ = child.kill().await;
        let _ = child.wait().await;
    }
    Ok(())
}

fn model_from_value(requested: Option<Value>) -> Result<&'static ModelSpec, String> {
    let id = match requested {
        Some(Value::String(id)) if !id.trim().is_empty() => id,
        _ => return Err("Thiếu id model AI local.".to_string()),
    };
    MODELS
        .iter()
        .find(|model| model.id == id.trim())
        .ok_or_else(|| "Model AI local không nằm trong danh mục đã xác minh.".to_string())
}

fn wanted_backend(app: &AppHandle) -> &'static str {
    let backend = paths::read_json(
        app,
        paths::SETTINGS_FILE,
        crate::settings::default_settings(),
    )
    .ok()
    .and_then(|settings| {
        settings
            .pointer("/ai/runtimeBackend")
            .and_then(Value::as_str)
            .map(str::to_string)
    })
    .unwrap_or_else(|| "cpu".to_string());
    if backend == "vulkan" { "vulkan" } else { "cpu" }
}

fn runtime_spec(backend: &str) -> &'static RuntimeSpec {
    RUNTIMES
        .iter()
        .copied()
        .find(|runtime| runtime.backend == backend)
        .unwrap_or(&RUNTIME_CPU)
}

fn runtime_dir(data: &Path) -> PathBuf {
    data.join(LOCAL_ROOT)
        .join("runtime")
        .join(format!("llama.cpp-{RUNTIME_VERSION}"))
}

fn model_path(data: &Path, model: &ModelSpec) -> PathBuf {
    data.join(LOCAL_ROOT)
        .join("models")
        .join(format!("{}-{}{MODEL_EXTENSION}", model.id, model.version))
}

fn runtime_executable(data: &Path) -> Option<PathBuf> {
    let executable = runtime_dir(data).join(RUNTIME_EXE);
    executable
        .metadata()
        .ok()
        .filter(|meta| meta.is_file() && meta.len() > 0)
        .map(|_| executable)
}

async fn ensure_runtime(
    app: &AppHandle,
    data: &Path,
    backend: &str,
    model_id: &str,
    cancel: Option<&CancelToken>,
    setup: Option<&SetupProgressContext>,
) -> Result<(), String> {
    ensure_not_cancelled(cancel)?;
    let spec = runtime_spec(backend);
    let target = runtime_dir(data);
    if detect_installed_backend(&target) == Some(spec.backend) && runtime_executable(data).is_some()
    {
        copy_support_files(app, &target)?;
        return Ok(());
    }
    if !cfg!(all(windows, target_arch = "x86_64")) {
        return Err("Runtime llama.cpp tự quản lý hiện chỉ hỗ trợ Windows x64.".to_string());
    }

    let runtime_root = data.join(LOCAL_ROOT).join("runtime");
    tokio::fs::create_dir_all(&runtime_root)
        .await
        .map_err(|error| format!("không tạo được thư mục runtime: {error}"))?;
    let archive = runtime_root.join(format!("llama-{RUNTIME_VERSION}-{}.zip.part", spec.backend));
    let temporary = PathBuf::from(format!("{}.installing", target.display()));
    let _ = tokio::fs::remove_file(&archive).await;
    let _ = tokio::fs::remove_dir_all(&temporary).await;

    ensure_space(&runtime_root, spec.size_bytes).await?;
    let mut progress = match setup {
        Some(context) => Progress::for_setup(app, "runtime", context),
        None => Progress::new(app, "runtime", model_id),
    };
    download_verified(
        &archive,
        spec.download_url,
        spec.size_bytes,
        spec.sha256,
        false,
        &mut progress,
        cancel,
    )
    .await?;
    ensure_not_cancelled(cancel)?;

    let result = extract_runtime(&archive, &temporary);
    let result = match result {
        Ok(()) => {
            copy_support_files(app, &temporary)?;
            replace_runtime_dir(&target, &temporary).await
        }
        Err(error) => Err(error),
    };
    let _ = tokio::fs::remove_file(&archive).await;
    let _ = tokio::fs::remove_dir_all(&temporary).await;
    ensure_not_cancelled(cancel)?;
    result
}

fn extract_runtime(archive: &Path, destination: &Path) -> Result<(), String> {
    use std::io::{Read, Write};

    let file = std::fs::File::open(archive)
        .map_err(|error| format!("không mở được gói llama.cpp: {error}"))?;
    let mut zip = zip::ZipArchive::new(file)
        .map_err(|error| format!("gói llama.cpp không phải ZIP hợp lệ: {error}"))?;
    std::fs::create_dir_all(destination)
        .map_err(|error| format!("không tạo được thư mục giải nén: {error}"))?;
    let mut found_server = false;
    for index in 0..zip.len() {
        let mut entry = zip
            .by_index(index)
            .map_err(|error| format!("không đọc được mục {index} trong gói llama.cpp: {error}"))?;
        if entry.is_dir() {
            continue;
        }
        let raw_name = entry
            .name()
            .map_err(|error| {
                format!("không đọc được tên mục {index} trong gói llama.cpp: {error}")
            })?
            .to_string();
        let Some(file_name) = safe_runtime_name(&raw_name) else {
            return Err("Gói llama.cpp chứa đường dẫn tệp không an toàn.".to_string());
        };
        let lower = file_name.to_ascii_lowercase();
        if !lower.ends_with(".exe") && !lower.ends_with(".dll") && !lower.starts_with("license") {
            continue;
        }
        let mut bytes = Vec::new();
        entry
            .read_to_end(&mut bytes)
            .map_err(|error| format!("không đọc được {file_name} trong gói llama.cpp: {error}"))?;
        let output = destination.join(&file_name);
        let mut handle = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&output)
            .map_err(|error| format!("không ghi được {}: {error}", output.display()))?;
        handle
            .write_all(&bytes)
            .map_err(|error| format!("không ghi được {}: {error}", output.display()))?;
        if lower == "llama-server.exe" {
            found_server = true;
        }
    }
    if !found_server {
        return Err("Trong gói llama.cpp không tìm thấy llama-server.exe.".to_string());
    }
    Ok(())
}

/// Chỉ nhận tên phẳng. ZIP của llama.cpp đặt mọi tệp ở gốc, nên một mục có
/// thư mục con hay `..` là gói không đúng định dạng và bị từ chối nguyên gói.
fn safe_runtime_name(name: &str) -> Option<String> {
    if name.is_empty()
        || name.contains('\\')
        || name.contains(':')
        || name.starts_with('/')
        || name.split('/').any(|part| part == ".." || part.is_empty())
    {
        return None;
    }
    let path = Path::new(name);
    if path.components().count() != 1 {
        return None;
    }
    let file_name = path.file_name()?.to_str()?.to_string();
    if file_name == "." || file_name == ".." {
        return None;
    }
    Some(file_name)
}

async fn replace_runtime_dir(target: &Path, temporary: &Path) -> Result<(), String> {
    let delays = [0u64, 250, 500, 1_000, 2_000, 3_000];
    let mut last = String::new();
    for (index, delay) in delays.iter().enumerate() {
        if *delay > 0 {
            tokio::time::sleep(Duration::from_millis(*delay)).await;
        }
        let _ = tokio::fs::remove_dir_all(target).await;
        match tokio::fs::rename(temporary, target).await {
            Ok(()) => return Ok(()),
            Err(error) => {
                last = error.to_string();
                if index == delays.len() - 1 {
                    break;
                }
            }
        }
    }
    Err(format!(
        "Không thay được runtime llama.cpp ({last}). Nếu llama.cpp đang chạy, hãy dừng nó rồi thử lại."
    ))
}

fn copy_support_files(app: &AppHandle, destination: &Path) -> Result<(), String> {
    let Some(source) = support_directory(app) else {
        // Bản đóng gói luôn có `vc-runtime`; bản chạy thử từ repo có thể thiếu.
        // Không có thư mục hỗ trợ thì để máy dùng VC++ toàn cục, giống Electron.
        return Ok(());
    };
    std::fs::create_dir_all(destination)
        .map_err(|error| format!("không tạo được thư mục runtime: {error}"))?;
    for name in RUNTIME_SUPPORT_FILES {
        let from = source.join(name);
        let info = from.metadata().map_err(|_| {
            format!("Bộ cài thiếu thư viện hỗ trợ llama.cpp ({name}). Hãy cài lại ứng dụng.")
        })?;
        if !info.is_file() || info.len() == 0 {
            return Err(format!(
                "Thư viện hỗ trợ llama.cpp không hợp lệ ({name}). Hãy cài lại ứng dụng."
            ));
        }
        let to = destination.join(name);
        let same = to
            .metadata()
            .map(|current| current.is_file() && current.len() == info.len())
            .unwrap_or(false);
        if !same {
            std::fs::copy(&from, &to).map_err(|error| {
                format!("Không cập nhật được thư viện hỗ trợ llama.cpp ({name}): {error}.")
            })?;
        }
    }
    Ok(())
}

fn support_directory(app: &AppHandle) -> Option<PathBuf> {
    let bundled = app
        .path()
        .resource_dir()
        .ok()
        .map(|dir| dir.join("vc-runtime"));
    if let Some(dir) = bundled {
        if dir.is_dir() {
            return Some(dir);
        }
    }
    let development = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("vendor")
        .join("vc-runtime");
    development.is_dir().then_some(development)
}

async fn install_model(
    app: &AppHandle,
    data: &Path,
    model: &ModelSpec,
    cancel: Option<&CancelToken>,
    setup: Option<&SetupProgressContext>,
) -> Result<(), String> {
    ensure_not_cancelled(cancel)?;
    let directory = data.join(LOCAL_ROOT).join("models");
    tokio::fs::create_dir_all(&directory)
        .await
        .map_err(|error| format!("không tạo được thư mục model: {error}"))?;
    let destination = model_path(data, model);
    if let Ok(info) = destination.metadata() {
        if info.len() > 0 {
            verify_file(&destination, model.size_bytes, model.sha256).await?;
            return Ok(());
        }
        return Err("Tệp mô hình đã cài đặt đang rỗng; không ghi đè tự động.".to_string());
    }

    let partial = PathBuf::from(format!("{}.part", destination.display()));
    let mut received = partial.metadata().map(|info| info.len()).unwrap_or(0);
    if received > model.size_bytes {
        let _ = tokio::fs::remove_file(&partial).await;
        received = 0;
    }
    if received == model.size_bytes {
        verify_file(&partial, model.size_bytes, model.sha256).await?;
        ensure_not_cancelled(cancel)?;
        tokio::fs::rename(&partial, &destination)
            .await
            .map_err(|error| format!("không đổi tên model đã tải: {error}"))?;
        return Ok(());
    }
    ensure_space(&directory, model.size_bytes - received).await?;

    let mut progress = match setup {
        Some(context) => Progress::for_setup(app, "model", context),
        None => Progress::new(app, "model", model.id),
    };
    download_verified(
        &partial,
        model.download_url,
        model.size_bytes,
        model.sha256,
        received > 0,
        &mut progress,
        cancel,
    )
    .await?;
    ensure_not_cancelled(cancel)?;
    tokio::fs::rename(&partial, &destination)
        .await
        .map_err(|error| format!("không đổi tên model đã tải: {error}"))?;
    Ok(())
}

async fn ensure_space(directory: &Path, needed: u64) -> Result<(), String> {
    if let Some(free) = available_bytes(directory) {
        if free < needed {
            return Err(format!(
                "Không đủ dung lượng để cài AI local. Cần thêm {needed} byte, còn {free} byte."
            ));
        }
    }
    Ok(())
}

#[cfg(windows)]
fn available_bytes(directory: &Path) -> Option<u64> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;

    let mut path: Vec<u16> = directory.as_os_str().encode_wide().collect();
    if path.is_empty() {
        return None;
    }
    path.push(0);
    let mut free = 0u64;
    let ok = unsafe {
        GetDiskFreeSpaceExW(
            path.as_ptr(),
            &mut free,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        )
    };
    (ok != 0).then_some(free)
}

#[cfg(not(windows))]
fn available_bytes(_directory: &Path) -> Option<u64> {
    None
}

/// Tải một tệp và xác minh kích thước + SHA-256. Khi `resume` và tệp đích đã có
/// byte, gửi `Range` và chỉ nối khi máy chủ trả đúng `206`/`Content-Range`.
async fn download_verified(
    destination: &Path,
    url: &str,
    expected_size: u64,
    expected_sha: &str,
    resume: bool,
    progress: &mut Progress,
    cancel: Option<&CancelToken>,
) -> Result<(), String> {
    ensure_not_cancelled(cancel)?;
    let mut offset = if resume {
        destination.metadata().map(|info| info.len()).unwrap_or(0)
    } else {
        0
    };
    if offset > expected_size {
        let _ = tokio::fs::remove_file(destination).await;
        offset = 0;
    }
    let mut hasher = Sha256::new();
    if offset > 0 {
        hash_prefix(destination, offset, &mut hasher).await?;
    }
    ensure_not_cancelled(cancel)?;

    let client = download_client()?;
    let mut request = client.get(url);
    if offset > 0 {
        request = request.header(reqwest::header::RANGE, format!("bytes={offset}-"));
    }
    let response = request
        .send()
        .await
        .map_err(|error| format!("Không tải được {url}: {error}"))?;
    ensure_not_cancelled(cancel)?;
    let status = response.status();

    let mut append = offset > 0;
    if append {
        let range_ok = status == reqwest::StatusCode::PARTIAL_CONTENT
            && range_matches(
                response.headers().get(reqwest::header::CONTENT_RANGE),
                offset,
                expected_size,
            );
        if !range_ok {
            if status != reqwest::StatusCode::OK {
                return Err(
                    "Máy chủ trả về phản hồi Range không hợp lệ; không thể tiếp tục tải an toàn."
                        .to_string(),
                );
            }
            append = false;
            offset = 0;
            hasher = Sha256::new();
        }
    } else if status != reqwest::StatusCode::OK {
        return Err(format!("Không tải được tệp: HTTP {status}."));
    }

    if let Some(length) = response.content_length() {
        if offset.saturating_add(length) > expected_size {
            return Err(
                "Kích thước phản hồi tải vượt quá kích thước đã khai báo trong manifest."
                    .to_string(),
            );
        }
    }

    let mut file = if append {
        tokio::fs::OpenOptions::new()
            .append(true)
            .open(destination)
            .await
    } else {
        tokio::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(destination)
            .await
    }
    .map_err(|error| format!("không mở được {}: {error}", destination.display()))?;

    let mut written = offset;
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        ensure_not_cancelled(cancel)?;
        let chunk = chunk.map_err(|error| format!("Tải tệp bị gián đoạn: {error}"))?;
        written = written
            .checked_add(chunk.len() as u64)
            .ok_or_else(|| "Kích thước tải vượt giới hạn.".to_string())?;
        if written > expected_size {
            return Err(
                "Kích thước tải vượt quá kích thước đã khai báo trong manifest.".to_string(),
            );
        }
        file.write_all(&chunk)
            .await
            .map_err(|error| format!("không ghi được {}: {error}", destination.display()))?;
        hasher.update(&chunk);
        progress.emit(written, expected_size, false);
    }
    file.flush()
        .await
        .map_err(|error| format!("không ghi xong {}: {error}", destination.display()))?;
    drop(file);

    if written != expected_size {
        return Err(format!(
            "Tải chưa hoàn tất: nhận {written}/{expected_size} byte."
        ));
    }
    let actual = hex::encode(hasher.finalize());
    if !actual.eq_ignore_ascii_case(expected_sha) {
        let _ = tokio::fs::remove_file(destination).await;
        return Err("Tệp tải về không khớp SHA-256 trong manifest.".to_string());
    }
    progress.emit(written, expected_size, true);
    Ok(())
}

fn range_matches(value: Option<&reqwest::header::HeaderValue>, offset: u64, total: u64) -> bool {
    let Some(text) = value.and_then(|value| value.to_str().ok()) else {
        return false;
    };
    let Some(rest) = text.strip_prefix("bytes ") else {
        return false;
    };
    let Some((range, total_text)) = rest.split_once('/') else {
        return false;
    };
    let Some((start, _end)) = range.split_once('-') else {
        return false;
    };
    start.parse::<u64>().ok() == Some(offset) && total_text.parse::<u64>().ok() == Some(total)
}

fn download_client() -> Result<reqwest::Client, String> {
    use reqwest::redirect::Policy;

    let policy = Policy::custom(|attempt| {
        if attempt.previous().len() >= 5 {
            return attempt.error("quá nhiều chuyển hướng khi tải AI local");
        }
        if trusted_host(attempt.url()) {
            attempt.follow()
        } else {
            attempt.error("máy chủ tải AI local không nằm trong danh sách tin cậy")
        }
    });
    reqwest::Client::builder()
        .user_agent("EduGame-Studio-Tauri/0.5.1")
        .redirect(policy)
        .build()
        .map_err(|error| format!("không tạo được HTTP client: {error}"))
}

fn trusted_host(url: &reqwest::Url) -> bool {
    if url.scheme() != "https" {
        return false;
    }
    let Some(host) = url.host_str().map(|host| host.to_ascii_lowercase()) else {
        return false;
    };
    const HOSTS: &[&str] = &[
        "huggingface.co",
        "hf.co",
        "github.com",
        "release-assets.githubusercontent.com",
        "objects.githubusercontent.com",
    ];
    HOSTS
        .iter()
        .any(|trusted| host == *trusted || host.ends_with(&format!(".{trusted}")))
}

async fn verify_file(path: &Path, expected_size: u64, expected_sha: &str) -> Result<(), String> {
    let info = path
        .metadata()
        .map_err(|error| format!("không đọc được {}: {error}", path.display()))?;
    if info.len() != expected_size {
        return Err(format!(
            "Kích thước tệp không khớp: nhận {}, cần {expected_size} byte.",
            info.len()
        ));
    }
    let mut file = tokio::fs::File::open(path)
        .await
        .map_err(|error| format!("không mở được {}: {error}", path.display()))?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 128 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .await
            .map_err(|error| format!("không đọc được {}: {error}", path.display()))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    let actual = hex::encode(hasher.finalize());
    if !actual.eq_ignore_ascii_case(expected_sha) {
        return Err("SHA-256 tệp không khớp manifest.".to_string());
    }
    Ok(())
}

async fn hash_prefix(path: &Path, limit: u64, hasher: &mut Sha256) -> Result<(), String> {
    let mut file = tokio::fs::File::open(path)
        .await
        .map_err(|error| format!("không mở được tệp tải dở: {error}"))?;
    let mut remaining = limit;
    let mut buffer = vec![0u8; 128 * 1024];
    while remaining > 0 {
        let take = min(remaining, buffer.len() as u64) as usize;
        let read = file
            .read(&mut buffer[..take])
            .await
            .map_err(|error| format!("không đọc được tệp tải dở: {error}"))?;
        if read == 0 {
            return Err("Tệp tải dở ngắn hơn kích thước đã ghi nhận.".to_string());
        }
        hasher.update(&buffer[..read]);
        remaining -= read as u64;
    }
    Ok(())
}

fn detect_installed_backend(directory: &Path) -> Option<&'static str> {
    if runtime_executable_in(directory).is_none() {
        return None;
    }
    let entries = std::fs::read_dir(directory).ok()?;
    let mut has_cpu = false;
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
        if name.starts_with("ggml-vulkan") {
            return Some("vulkan");
        }
        if name == "ggml-cpu.dll" || name.starts_with("ggml-cpu-") || name.starts_with("ggml-cpu.")
        {
            has_cpu = true;
        }
    }
    if has_cpu { Some("cpu") } else { None }
}

fn runtime_executable_in(directory: &Path) -> Option<PathBuf> {
    let executable = directory.join(RUNTIME_EXE);
    executable
        .metadata()
        .ok()
        .filter(|meta| meta.is_file() && meta.len() > 0)
        .map(|_| executable)
}

async fn run_backend(
    app: &AppHandle,
    model: &ModelSpec,
    executable: &Path,
    backend: &str,
    model_file: &Path,
    cancel: Option<&CancelToken>,
) -> Result<(), String> {
    ensure_not_cancelled(cancel)?;
    let state = app.state::<AiLocal>();
    let generation = state.generation.load(Ordering::SeqCst);
    let port = free_loopback_port()?;
    let output = Arc::new(Mutex::new(String::new()));

    {
        let mut runtime = state
            .runtime
            .lock()
            .map_err(|_| "Trạng thái AI local bị hỏng.".to_string())?;
        if let Some(mut old) = runtime.child.take() {
            let _ = old.start_kill();
        }
        runtime.state = "STARTING".to_string();
        runtime.model_id = Some(model.id.to_string());
        runtime.port = Some(port);
        runtime.backend = Some(backend.to_string());
        runtime.output = output.clone();
    }
    let _ = app.emit(
        "ai:local-progress",
        json!({
            "stage": "starting",
            "modelId": model.id,
            "receivedBytes": 0,
            "totalBytes": 0,
            "bytesPerSecond": 0
        }),
    );

    let threads = resolve_cpu_threads(
        machine_info().logical_cpu_count,
        model.recommended_cpu_threads,
    );
    let gpu_layers = if backend == "vulkan" { 99 } else { 0 };
    let mut command = Command::new(executable);
    command
        .args([
            "--model",
            &model_file.to_string_lossy(),
            "--alias",
            model.id,
            "--host",
            "127.0.0.1",
            "--port",
            &port.to_string(),
            "--ctx-size",
            &CONTEXT_SIZE.to_string(),
            "--parallel",
            "1",
            "--ctx-checkpoints",
            "0",
            "--threads",
            &threads.to_string(),
            "--n-gpu-layers",
            &gpu_layers.to_string(),
        ])
        .current_dir(executable.parent().unwrap_or_else(|| Path::new(".")))
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if backend == "vulkan" {
        command.args(["--device", "Vulkan0"]);
    }
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);

    let mut child = command
        .spawn()
        .map_err(|error| format!("không chạy được llama-server: {error}"))?;
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    {
        let mut runtime = state
            .runtime
            .lock()
            .map_err(|_| "Trạng thái AI local bị hỏng.".to_string())?;
        runtime.child = Some(child);
    }
    if let Some(stdout) = stdout {
        tokio::spawn(drain_stream(stdout, output.clone()));
    }
    if let Some(stderr) = stderr {
        tokio::spawn(drain_stream(stderr, output.clone()));
    }

    wait_for_health(app, port, generation, &output, cancel).await?;
    ensure_not_cancelled(cancel)?;

    {
        let state = app.state::<AiLocal>();
        let mut runtime = state
            .runtime
            .lock()
            .map_err(|_| "Trạng thái AI local bị hỏng.".to_string())?;
        if state.generation.load(Ordering::SeqCst) != generation || runtime.child.is_none() {
            return Err("Khởi động llama.cpp đã bị huỷ.".to_string());
        }
        runtime.state = "READY".to_string();
        runtime.port = Some(port);
    }
    spawn_exit_watch(app.clone(), generation);
    Ok(())
}

async fn wait_for_health(
    app: &AppHandle,
    port: u16,
    generation: u64,
    output: &Arc<Mutex<String>>,
    cancel: Option<&CancelToken>,
) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .map_err(|error| format!("không tạo được HTTP client: {error}"))?;
    let url = format!("http://127.0.0.1:{port}/health");
    let deadline = Instant::now() + HEALTH_TIMEOUT;
    while Instant::now() < deadline {
        ensure_not_cancelled(cancel)?;
        {
            let state = app.state::<AiLocal>();
            if state.generation.load(Ordering::SeqCst) != generation {
                return Err("Khởi động llama.cpp đã bị huỷ.".to_string());
            }
            let mut runtime = state
                .runtime
                .lock()
                .map_err(|_| "Trạng thái AI local bị hỏng.".to_string())?;
            let Some(child) = runtime.child.as_mut() else {
                return Err("llama-server đã dừng trước khi sẵn sàng.".to_string());
            };
            if let Ok(Some(status)) = child.try_wait() {
                let code = status
                    .code()
                    .map(|code| code.to_string())
                    .unwrap_or_else(|| "?".to_string());
                let tail = output_tail(output);
                return Err(format!(
                    "llama-server thoát với mã {code}{}.{tail}",
                    exit_hint(status.code())
                ));
            }
        }
        match client.get(&url).send().await {
            Ok(response) if response.status().is_success() => return Ok(()),
            _ => {}
        }
        tokio::time::sleep(HEALTH_INTERVAL).await;
    }
    Err(format!(
        "llama-server không sẵn sàng sau {} giây.{}{}",
        HEALTH_TIMEOUT.as_secs(),
        exit_hint(None),
        output_tail(output)
    ))
}

fn spawn_exit_watch(app: AppHandle, generation: u64) {
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(1)).await;
            let state = app.state::<AiLocal>();
            if state.generation.load(Ordering::SeqCst) != generation {
                return;
            }
            let mut runtime = match state.runtime.lock() {
                Ok(runtime) => runtime,
                Err(_) => return,
            };
            let Some(child) = runtime.child.as_mut() else {
                return;
            };
            if let Ok(Some(status)) = child.try_wait() {
                runtime.state = "ERROR".to_string();
                runtime.model_id = None;
                runtime.port = None;
                runtime.backend = None;
                runtime.child = None;
                let code = status
                    .code()
                    .map(|code| code.to_string())
                    .unwrap_or_else(|| "?".to_string());
                let tail = output_tail(&runtime.output);
                drop(runtime);
                let _ = app.emit(
                    "ai:local-progress",
                    json!({
                        "stage": "error",
                        "message": format!("llama.cpp đã thoát với mã {code}.{}", exit_hint(status.code())),
                        "detail": tail,
                        "receivedBytes": 0,
                        "totalBytes": 0,
                        "bytesPerSecond": 0
                    }),
                );
                return;
            }
        }
    });
}

fn output_tail(output: &Arc<Mutex<String>>) -> String {
    let text = match output.lock() {
        Ok(text) => text.clone(),
        Err(_) => return String::new(),
    };
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    format!("\nThông tin từ llama.cpp:\n{}", tail_chars(trimmed, 4_000))
}

/// Lấy tối đa `max_bytes` byte cuối, nhưng không cắt giữa một ký tự UTF-8.
/// Log của llama.cpp có thể chứa tiếng Việt; cắt theo byte thô sẽ panic.
fn tail_chars(text: &str, max_bytes: usize) -> &str {
    if text.len() <= max_bytes {
        return text;
    }
    let mut start = text.len() - max_bytes;
    while start < text.len() && !text.is_char_boundary(start) {
        start += 1;
    }
    &text[start..]
}

fn exit_hint(code: Option<i32>) -> &'static str {
    match code {
        Some(0) => " (tiến trình tự thoát; hãy thử lại)",
        Some(1) => " (thường do model không tải được hoặc thiếu DLL)",
        Some(2) => " (tham số dòng lệnh không hợp lệ)",
        Some(3) => " (không đủ RAM/VRAM cho model)",
        _ => "",
    }
}

async fn drain_stream<R>(mut stream: R, sink: Arc<Mutex<String>>)
where
    R: AsyncRead + Unpin + Send + 'static,
{
    let mut buffer = [0u8; 4 * 1024];
    loop {
        let read = match stream.read(&mut buffer).await {
            Ok(0) | Err(_) => break,
            Ok(read) => read,
        };
        if let Ok(mut text) = sink.lock() {
            text.push_str(&String::from_utf8_lossy(&buffer[..read]));
            if text.len() > 16_000 {
                *text = tail_chars(&text, 12_000).to_string();
            }
        }
    }
}

fn free_loopback_port() -> Result<u16, String> {
    let listener = std::net::TcpListener::bind("127.0.0.1:0")
        .map_err(|error| format!("không tìm được cổng loopback trống: {error}"))?;
    listener
        .local_addr()
        .map(|address| address.port())
        .map_err(|error| format!("không đọc được cổng loopback: {error}"))
}

fn mark_local_active(app: &AppHandle, model_id: &str) -> Result<(), String> {
    let mut settings = paths::read_json(
        app,
        paths::SETTINGS_FILE,
        crate::settings::default_settings(),
    )?;
    if !settings.is_object() {
        settings = crate::settings::default_settings();
    }
    let Some(root) = settings.as_object_mut() else {
        return Err("settings.json không phải đối tượng.".to_string());
    };
    let ai = root.entry("ai".to_string()).or_insert_with(|| json!({}));
    let Some(ai) = ai.as_object_mut() else {
        return Err("settings.ai không phải đối tượng.".to_string());
    };
    ai.insert("mode".to_string(), Value::String("local".to_string()));
    ai.insert("provider".to_string(), Value::String("local".to_string()));
    ai.insert(
        "localModelId".to_string(),
        Value::String(model_id.to_string()),
    );
    paths::write_json(app, paths::SETTINGS_FILE, &settings)
}

fn machine_info() -> Machine {
    let logical_cpu_count = std::thread::available_parallelism()
        .map(|value| value.get() as u32)
        .unwrap_or(1)
        .max(1);
    let total_ram_bytes = total_ram_bytes();
    let cpu_model = std::env::var("PROCESSOR_IDENTIFIER")
        .ok()
        .filter(|text| !text.trim().is_empty())
        .unwrap_or_else(|| "Không nhận diện được tên CPU".to_string());
    Machine {
        total_ram_bytes,
        logical_cpu_count,
        cpu_model,
    }
}

#[cfg(windows)]
fn total_ram_bytes() -> u64 {
    use windows_sys::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};
    let mut memory: MEMORYSTATUSEX = unsafe { std::mem::zeroed() };
    memory.dwLength = std::mem::size_of::<MEMORYSTATUSEX>() as u32;
    if unsafe { GlobalMemoryStatusEx(&mut memory) } != 0 {
        memory.ullTotalPhys
    } else {
        0
    }
}

#[cfg(not(windows))]
fn total_ram_bytes() -> u64 {
    0
}

fn resolve_cpu_threads(logical: u32, recommended: u32) -> u32 {
    logical.max(1).min(recommended.max(1)).max(1)
}

fn memory_status(machine: &Machine, model: &ModelSpec) -> MemoryStatus {
    if machine.total_ram_bytes < model.minimum_ram_bytes {
        MemoryStatus::Insufficient
    } else if machine.total_ram_bytes < model.recommended_ram_bytes {
        MemoryStatus::BelowRecommended
    } else {
        MemoryStatus::Recommended
    }
}

fn recommendation_status(
    memory: MemoryStatus,
    cpu_recommended: bool,
    machine: &Machine,
    model: &ModelSpec,
) -> Recommendation {
    let enough_cpu_to_run = machine.logical_cpu_count >= (model.recommended_cpu_threads + 1) / 2;
    if memory == MemoryStatus::Recommended && cpu_recommended {
        Recommendation::Recommended
    } else if memory != MemoryStatus::Insufficient && enough_cpu_to_run {
        Recommendation::Possible
    } else {
        Recommendation::NotRecommended
    }
}

fn memory_status_name(status: MemoryStatus) -> &'static str {
    match status {
        MemoryStatus::Insufficient => "insufficient",
        MemoryStatus::BelowRecommended => "below-recommended",
        MemoryStatus::Recommended => "recommended",
    }
}

fn recommendation_name(status: Recommendation) -> &'static str {
    match status {
        Recommendation::Recommended => "recommended",
        Recommendation::Possible => "possible",
        Recommendation::NotRecommended => "not-recommended",
    }
}

fn recommendation_reason(
    memory: MemoryStatus,
    cpu_recommended: bool,
    machine: &Machine,
    model: &ModelSpec,
) -> String {
    let mut reasons = Vec::new();
    match memory {
        MemoryStatus::Insufficient => reasons.push(format!(
            "RAM thấp hơn mức tối thiểu {}",
            format_memory(model.minimum_ram_bytes)
        )),
        MemoryStatus::BelowRecommended => reasons.push(format!(
            "RAM thấp hơn mức khuyến nghị {}",
            format_memory(model.recommended_ram_bytes)
        )),
        MemoryStatus::Recommended => reasons.push("RAM đáp ứng mức khuyến nghị".to_string()),
    }
    if cpu_recommended {
        reasons.push(format!(
            "CPU đáp ứng {} luồng khuyến nghị",
            model.recommended_cpu_threads
        ));
    } else {
        reasons.push(format!(
            "CPU có {}/{} luồng khuyến nghị",
            machine.logical_cpu_count, model.recommended_cpu_threads
        ));
    }
    format!("{}.", reasons.join("; "))
}

fn recommend_model_id(machine: &Machine) -> &'static str {
    // Cùng luật với `recommendLocalModelId`: chỉ tự chọn hai bản Qwen, mạnh
    // trước, rồi hạ xuống bản nhỏ nhất; Gemma không bao giờ tự tải.
    const AUTO: &[&str] = &["qwen3.5-2b-q4_k_m", "qwen3.5-4b-q4_k_m"];
    let ordered = AUTO
        .iter()
        .rev()
        .filter_map(|id| MODELS.iter().find(|model| model.id == *id));
    let mut possible = None;
    for model in ordered {
        let memory = memory_status(machine, model);
        let cpu_recommended = machine.logical_cpu_count >= model.recommended_cpu_threads;
        let status = recommendation_status(memory, cpu_recommended, machine, model);
        if status == Recommendation::Recommended {
            return model.id;
        }
        if status == Recommendation::Possible && possible.is_none() {
            possible = Some(model.id);
        }
    }
    possible.unwrap_or(MODELS[0].id)
}

fn format_memory(bytes: u64) -> String {
    let gb = bytes as f64 / (1024.0 * 1024.0 * 1024.0);
    format!("{} GB", gb.round() as u64)
}

struct Progress {
    app: AppHandle,
    stage: &'static str,
    item_id: String,
    setup_step: Option<&'static str>,
    setup_message: Option<String>,
    started: Instant,
    last: Instant,
}

impl Progress {
    fn new(app: &AppHandle, stage: &'static str, item_id: &str) -> Self {
        let now = Instant::now();
        Self {
            app: app.clone(),
            stage,
            item_id: item_id.to_string(),
            setup_step: None,
            setup_message: None,
            started: now,
            last: now,
        }
    }

    fn for_setup(
        app: &AppHandle,
        stage: &'static str,
        context: &SetupProgressContext,
    ) -> Self {
        let now = Instant::now();
        Self {
            app: app.clone(),
            stage,
            item_id: context.item_id.clone(),
            setup_step: Some(context.step),
            setup_message: Some(context.message.clone()),
            started: now,
            last: now,
        }
    }

    fn emit(&mut self, received: u64, total: u64, force: bool) {
        if !force && received < total && self.last.elapsed() < Duration::from_millis(200) {
            return;
        }
        self.last = Instant::now();
        let elapsed = self.started.elapsed().as_secs_f64().max(0.001);
        let bytes_per_second = (received as f64 / elapsed).round() as u64;
        let (channel, payload) = match self.setup_step {
            Some(step) => (
                "setup:progress",
                json!({
                    "step": step,
                    "stage": self.stage,
                    "itemId": self.item_id,
                    "receivedBytes": received,
                    "totalBytes": total,
                    "bytesPerSecond": bytes_per_second,
                    "message": self.setup_message.clone().unwrap_or_default(),
                }),
            ),
            None => (
                "ai:local-progress",
                json!({
                    "stage": self.stage,
                    "modelId": self.item_id,
                    "receivedBytes": received,
                    "totalBytes": total,
                    "bytesPerSecond": bytes_per_second,
                }),
            ),
        };
        let _ = self.app.emit(channel, payload);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_constants_are_well_formed() {
        for model in MODELS {
            assert!(!model.id.is_empty());
            assert!(
                model
                    .id
                    .chars()
                    .all(|ch| ch.is_ascii_alphanumeric() || "._-".contains(ch))
            );
            assert!(!model.version.is_empty());
            assert!(model.size_bytes > 0);
            assert_eq!(model.sha256.len(), 64);
            assert!(model.sha256.chars().all(|ch| ch.is_ascii_hexdigit()));
            assert!(model.download_url.starts_with("https://"));
            assert!(model.source_url.starts_with("https://"));
            assert!(model.minimum_ram_bytes > 0);
            assert!(model.recommended_ram_bytes >= model.minimum_ram_bytes);
            assert!(model.recommended_cpu_threads >= 1);
            assert!(!model.supported_languages.is_empty());
        }
        for runtime in RUNTIMES {
            assert!(runtime.download_url.starts_with("https://"));
            assert!(runtime.size_bytes > 0);
            assert_eq!(runtime.sha256.len(), 64);
            assert!(runtime.sha256.chars().all(|ch| ch.is_ascii_hexdigit()));
            assert!(runtime_spec(runtime.backend).backend == runtime.backend);
        }
        assert_eq!(RUNTIME_CPU.backend, "cpu");
        assert_eq!(RUNTIME_VULKAN.backend, "vulkan");
    }

    #[test]
    fn safe_runtime_names_reject_traversal_and_subdirectories() {
        assert_eq!(
            safe_runtime_name("llama-server.exe").as_deref(),
            Some("llama-server.exe")
        );
        assert_eq!(
            safe_runtime_name("ggml-cpu.dll").as_deref(),
            Some("ggml-cpu.dll")
        );
        for bad in [
            "../x.exe", "a/b.exe", "a\\b.dll", "/x.exe", "C:x.exe", ".", "..", "",
        ] {
            assert!(safe_runtime_name(bad).is_none(), "phải từ chối {bad:?}");
        }
    }

    #[test]
    fn cpu_threads_are_clamped_to_recommendation_and_at_least_one() {
        assert_eq!(resolve_cpu_threads(8, 6), 6);
        assert_eq!(resolve_cpu_threads(4, 8), 4);
        assert_eq!(resolve_cpu_threads(1, 8), 1);
        assert_eq!(resolve_cpu_threads(0, 0), 1);
    }

    #[test]
    fn recommendation_never_picks_gemma_and_prefers_small_model_for_low_ram() {
        let weak = Machine {
            total_ram_bytes: 3 * 1024 * 1024 * 1024,
            logical_cpu_count: 2,
            cpu_model: "test".to_string(),
        };
        assert_eq!(recommend_model_id(&weak), "qwen3.5-2b-q4_k_m");
        let strong = Machine {
            total_ram_bytes: 16 * 1024 * 1024 * 1024,
            logical_cpu_count: 8,
            cpu_model: "test".to_string(),
        };
        assert_eq!(recommend_model_id(&strong), "qwen3.5-4b-q4_k_m");
    }

    #[test]
    fn unknown_model_id_is_refused_before_any_io() {
        let error = model_from_value(Some(Value::String("not-a-model".to_string()))).unwrap_err();
        assert!(error.contains("danh mục"));
        assert!(model_from_value(None).is_err());
    }

    #[test]
    fn backend_detection_uses_archive_layout() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(detect_installed_backend(dir.path()), None);
        std::fs::write(dir.path().join(RUNTIME_EXE), b"x").unwrap();
        assert_eq!(detect_installed_backend(dir.path()), None);
        std::fs::write(dir.path().join("ggml-cpu-haswell.dll"), b"x").unwrap();
        assert_eq!(detect_installed_backend(dir.path()), Some("cpu"));
        std::fs::write(dir.path().join("ggml-vulkan.dll"), b"x").unwrap();
        assert_eq!(detect_installed_backend(dir.path()), Some("vulkan"));
    }

    #[test]
    fn range_response_must_match_offset_and_total() {
        let value = reqwest::header::HeaderValue::from_static("bytes 12-20/100");
        assert!(range_matches(Some(&value), 12, 100));
        assert!(!range_matches(Some(&value), 11, 100));
        assert!(!range_matches(Some(&value), 12, 101));
        assert!(!range_matches(None, 12, 100));
    }

    #[test]
    fn tail_chars_never_splits_a_utf8_character() {
        let text = "ế".repeat(5);
        for max in 0..text.len() {
            let tail = tail_chars(&text, max);
            assert!(tail.is_char_boundary(0));
            assert!(text.ends_with(tail));
            assert!(tail.chars().all(|ch| ch == 'ế'));
        }
        assert_eq!(tail_chars("abc", 10), "abc");
    }

    #[test]
    fn cancel_token_is_shared_and_sticky() {
        let token = CancelToken::new();
        let clone = token.clone();
        assert!(!token.is_cancelled());
        clone.cancel();
        assert!(token.is_cancelled());
        assert!(ensure_not_cancelled(Some(&token)).is_err());
        assert!(ensure_not_cancelled(None).is_ok());
    }

    #[test]
    fn setup_model_and_runtime_views_hide_download_details() {
        let model = setup_model("qwen3.5-2b-q4_k_m").unwrap();
        assert_eq!(model.display_name, "Qwen3.5 2B · Q4_K_M");
        assert_eq!(model.size_bytes, 1_280_835_840);
        assert!(setup_model("not-a-model").is_none());
        let cpu = setup_runtime("cpu").unwrap();
        let vulkan = setup_runtime("vulkan").unwrap();
        assert_eq!(cpu.id(), "llama.cpp-b11681-cpu-win32-x64");
        assert_eq!(vulkan.id(), "llama.cpp-b11681-vulkan-win32-x64");
        assert_eq!(cpu.display_name(), "llama.cpp CPU (Windows x64)");
        assert_eq!(
            vulkan.display_name(),
            "llama.cpp Vulkan (Windows x64)"
        );
        assert!(setup_runtime("openvino").is_none());
    }
}
