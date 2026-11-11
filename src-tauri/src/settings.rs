//! Cài đặt AI và khoá BYOK của vỏ Tauri.
//!
//! Renderer gửi `ai.providers` dưới dạng **patch** (xem `renderer/features/settings.ts`):
//! một khoá rỗng nghĩa là giữ khoá đã lưu, `clearKey` mới là xoá, còn `apiKey`
//! chỉ đến khi giáo viên vừa gõ. Phần này giữ đúng hợp đồng đó, nhưng thay
//! `safeStorage` bằng DPAPI trong `secrets.rs`: settings trên đĩa chỉ có blob
//! `apiKeyEncrypted`, không bao giờ có `apiKey` plaintext.
//!
//! `public_view` là hình dạng duy nhất renderer được thấy: mảng provider với
//! `hasKey` + `keyMasked`, không có blob hay khoá. Danh sách provider và trạng
//! thái ở đây là bản Rust của `src/services/ai/ai-providers.ts`; nếu thêm provider
//! ở TypeScript thì phải thêm cùng lúc ở đây, nếu không Settings sẽ thiếu thẻ.

use serde_json::{json, Value};
use tauri::AppHandle;

use crate::{ai_local, paths, secrets};

struct ProviderDef {
    id: &'static str,
    label: &'static str,
    base_url: &'static str,
    model: &'static str,
    requires_key: bool,
    wizard_eligible: bool,
    note: &'static str,
}

const PROVIDERS: &[ProviderDef] = &[
    ProviderDef {
        id: "local",
        label: "AI local (llama.cpp)",
        base_url: "",
        model: "",
        requires_key: false,
        wizard_eligible: true,
        note: "Chạy trên máy này, không cần API key và không gửi giáo án đi đâu.",
    },
    ProviderDef {
        id: "gemini",
        label: "Gemini (Google)",
        base_url: "https://generativelanguage.googleapis.com/v1beta/openai",
        model: "gemini-2.5-flash",
        requires_key: true,
        wizard_eligible: true,
        note: "Điểm cuối tương thích OpenAI của Google. Cần API key của Google AI Studio.",
    },
    ProviderDef {
        id: "openai",
        label: "ChatGPT (OpenAI)",
        base_url: "https://api.openai.com/v1",
        model: "gpt-4o-mini",
        requires_key: true,
        wizard_eligible: true,
        note: "Cần API key của OpenAI; chi phí tính theo tài khoản OpenAI của bạn.",
    },
    ProviderDef {
        id: "opencode",
        label: "OpenCode Zen",
        base_url: "https://opencode.ai/zen/v1",
        model: "mimo-v2.6-flash-free",
        requires_key: false,
        wizard_eligible: false,
        note: "Chưa dùng cho luồng tạo trò chơi. Chỉ dùng cho công cụ AI cũ.",
    },
    ProviderDef {
        id: "custom",
        label: "API tương thích OpenAI (tự cấu hình)",
        base_url: "",
        model: "",
        requires_key: true,
        wizard_eligible: true,
        note: "Điểm cuối tương thích OpenAI khác (máy chủ của trường, proxy…). Dùng được cho luồng tạo trò chơi sau khi kiểm tra kết nối.",
    },
];

fn provider_def(id: &str) -> Option<&'static ProviderDef> {
    PROVIDERS.iter().find(|provider| provider.id == id)
}

pub(crate) fn default_settings() -> Value {
    json!({
        "ai": {
            "mode": "offline",
            "provider": "local",
            "providerPolicy": "auto",
            "providers": {}
        },
        "preferences": { "sound": true, "largeText": false, "theme": "system" }
    })
}

pub fn get(app: &AppHandle) -> Result<Value, String> {
    let raw = paths::read_json(app, paths::SETTINGS_FILE, default_settings())?;
    Ok(public_view_with_local(&raw, &ai_local::local_facts(app)))
}

pub fn save(app: &AppHandle, incoming: Value) -> Result<Value, String> {
    if !incoming.is_object() {
        return Err("AI_CONFIG: cài đặt gửi lên không phải một đối tượng".to_string());
    }
    let current = paths::read_json(app, paths::SETTINGS_FILE, default_settings())?;
    let merged = merge(&current, &incoming)?;
    // Chỉ ghi sau khi mọi khoá mới đã được DPAPI mã hoá. Một lỗi ở giữa không
    // được để lại settings nửa vời hay một `apiKey` plaintext.
    paths::write_json(app, paths::SETTINGS_FILE, &merged)?;
    Ok(json!({
        "ok": true,
        "settings": public_view_with_local(&merged, &ai_local::local_facts(app))
    }))
}

fn merge(current: &Value, incoming: &Value) -> Result<Value, String> {
    let mut out = current.as_object().cloned().unwrap_or_default();
    let incoming_object = incoming
        .as_object()
        .ok_or_else(|| "AI_CONFIG: cài đặt gửi lên không phải đối tượng".to_string())?;
    for (key, value) in incoming_object {
        if key != "ai" {
            out.insert(key.clone(), value.clone());
        }
    }

    let current_ai = current.get("ai").and_then(Value::as_object).cloned().unwrap_or_default();
    let incoming_ai = incoming.get("ai").and_then(Value::as_object);
    let mut ai = current_ai.clone();
    if let Some(incoming_ai) = incoming_ai {
        for (key, value) in incoming_ai {
            if key != "providers" {
                ai.insert(key.clone(), value.clone());
            }
        }
    }

    let mut providers = current_ai
        .get("providers")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let patches = incoming_ai
        .and_then(|settings| settings.get("providers"))
        .and_then(Value::as_object);

    for definition in PROVIDERS {
        let mut next = providers
            .get(definition.id)
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default();
        if let Some(patch) = patches
            .and_then(|patches| patches.get(definition.id))
            .and_then(Value::as_object)
        {
            if let Some(base_url) = patch.get("baseUrl").and_then(Value::as_str) {
                next.insert(
                    "baseUrl".to_string(),
                    Value::String(base_url.trim().trim_end_matches('/').to_string()),
                );
            }
            if let Some(model) = patch.get("model").and_then(Value::as_str) {
                next.insert("model".to_string(), Value::String(model.trim().to_string()));
            }
            if let Some(enabled) = patch.get("enabled").and_then(Value::as_bool) {
                next.insert("enabled".to_string(), Value::Bool(enabled));
            }
            if patch.get("clearKey").and_then(Value::as_bool) == Some(true) {
                next.remove("apiKeyEncrypted");
            }
            let replacement = patch
                .get("apiKey")
                .and_then(Value::as_str)
                .map(str::trim)
                .unwrap_or("");
            if !replacement.is_empty() {
                // `protect_secret` trả mã AI_KEY_STORAGE_UNAVAILABLE khi DPAPI
                // không dùng được; merge hỏng trước khi ghi nên cấu hình cũ còn
                // nguyên trên đĩa (spec §4).
                next.insert(
                    "apiKeyEncrypted".to_string(),
                    Value::String(secrets::protect_secret(replacement)?),
                );
                next.remove("lastTestAt");
                next.remove("lastTestOk");
                next.remove("lastTestCode");
            }
        }
        // Dọn mọi trường plaintext còn sót từ một tệp cũ/hỏng. Blob đã mã hoá
        // nằm ở `apiKeyEncrypted` và được giữ nguyên.
        next.remove("apiKey");
        providers.insert(definition.id.to_string(), Value::Object(next));
    }

    if let Some(provider) = incoming_ai
        .and_then(|settings| settings.get("provider"))
        .and_then(Value::as_str)
        .filter(|id| provider_def(id).is_some())
    {
        ai.insert("provider".to_string(), Value::String(provider.to_string()));
    }
    ai.insert("providers".to_string(), Value::Object(providers));
    // Renderer không bao giờ được thấy khoá, và settings trên đĩa không được giữ
    // một khoá plaintext nào — kể cả khi một trang cũ gửi kèm.
    ai.remove("apiKey");
    ai.remove("apiKeyEncrypted");
    out.insert("ai".to_string(), Value::Object(ai));
    Ok(Value::Object(out))
}

/// Hình dạng renderer được thấy, với sự thật runtime AI local.
///
/// Electron lấy `localRunning`/`localModelReady` từ `localAiManager.getStatus()`
/// và `getLocalModel(...)`. Ở đây chúng đến từ `ai_local::local_facts`, nên một
/// runtime đang chạy thật mới làm provider `local` thành `ready`/`usable`.
fn public_view_with_local(settings: &Value, local: &ai_local::LocalFacts) -> Value {
    let mut view = settings.as_object().cloned().unwrap_or_default();
    let mut ai = settings.get("ai").and_then(Value::as_object).cloned().unwrap_or_default();
    let stored = ai
        .get("providers")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();

    let mut any_config = false;
    let mut resolved = Vec::with_capacity(PROVIDERS.len());
    for definition in PROVIDERS {
        let config = stored
            .get(definition.id)
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default();
        if !config.is_empty() {
            any_config = true;
        }
        let has_key = config
            .get("apiKeyEncrypted")
            .and_then(Value::as_str)
            .map(|blob| !blob.is_empty())
            .unwrap_or(false);
        let key_masked = if has_key {
            config
                .get("apiKeyEncrypted")
                .and_then(Value::as_str)
                .and_then(|blob| secrets::unprotect_secret(blob).ok())
                .map(|plaintext| secrets::mask_secret(&plaintext))
                .unwrap_or_default()
        } else {
            String::new()
        };
        let base_url = config
            .get("baseUrl")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .unwrap_or(definition.base_url)
            .trim_end_matches('/')
            .to_string();
        let model = config
            .get("model")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .unwrap_or(definition.model)
            .to_string();
        let enabled = config.get("enabled").and_then(Value::as_bool).unwrap_or(true);
        let last_test_ok = config.get("lastTestOk").and_then(Value::as_bool);
        let last_test_at = config
            .get("lastTestAt")
            .and_then(Value::as_str)
            .map(str::to_string);
        let last_test_code = config
            .get("lastTestCode")
            .and_then(Value::as_str)
            .map(str::to_string);
        let (status, reason) = provider_status(
            definition,
            has_key,
            &base_url,
            &model,
            last_test_ok,
            last_test_at.as_deref(),
            last_test_code.as_deref(),
            local,
        );
        // AI local chỉ usable khi runtime thật đang chạy; cloud chỉ usable sau một
        // lần kiểm tra thành công (đúng luật #132 §D7), không phải chỉ vì đã có key.
        let usable = definition.wizard_eligible
            && enabled
            && if definition.id == "local" {
                local.running
            } else {
                status == "ready"
            };
        resolved.push(json!({
            "id": definition.id,
            "label": definition.label,
            "note": definition.note,
            "wizardEligible": definition.wizard_eligible,
            "requiresKey": definition.requires_key,
            "status": status,
            "reason": reason,
            "hasKey": has_key,
            "keyMasked": key_masked,
            "baseUrl": base_url,
            "model": model,
            "defaultBaseUrl": definition.base_url,
            "defaultModel": definition.model,
            "lastTestAt": last_test_at,
            "lastTestOk": last_test_ok,
            "lastTestCode": last_test_code,
            "enabled": enabled,
            "usable": usable
        }));
    }

    let requested = ai
        .get("provider")
        .and_then(Value::as_str)
        .filter(|id| provider_def(id).is_some())
        .map(str::to_string);
    let requested_usable = requested
        .as_deref()
        .and_then(|id| find_provider(&resolved, id))
        .map(|provider| provider["usable"] == Value::Bool(true))
        .unwrap_or(false);
    let first_usable = resolved
        .iter()
        .find(|provider| provider["usable"] == Value::Bool(true))
        .and_then(|provider| provider.get("id"))
        .and_then(Value::as_str)
        .map(str::to_string);
    let active_id = if requested_usable {
        requested.as_deref().unwrap_or("local")
    } else if let Some(id) = first_usable.as_deref() {
        id
    } else {
        requested.as_deref().unwrap_or("local")
    };
    let active = find_provider(&resolved, active_id)
        .cloned()
        .unwrap_or_else(|| resolved[0].clone());
    let options: Vec<Value> = resolved
        .iter()
        .filter(|provider| {
            provider["usable"] == Value::Bool(true) && provider["wizardEligible"] == Value::Bool(true)
        })
        .map(|provider| {
            json!({
                "id": provider["id"],
                "label": provider["label"],
                "model": provider["model"]
            })
        })
        .collect();
    let mode = if !any_config {
        "offline"
    } else if active_id == "local" {
        "local"
    } else {
        "online"
    };

    ai.insert("provider".to_string(), Value::String(active_id.to_string()));
    if ai.get("providerPolicy").and_then(Value::as_str).is_none() {
        ai.insert("providerPolicy".to_string(), Value::String("auto".to_string()));
    }
    ai.insert("mode".to_string(), Value::String(mode.to_string()));
    ai.insert("providers".to_string(), Value::Array(resolved));
    ai.insert("hasKey".to_string(), active["hasKey"].clone());
    ai.insert("keyMasked".to_string(), active["keyMasked"].clone());
    ai.insert(
        "picker".to_string(),
        json!({
            "show": options.len() > 1,
            "options": options,
            "activeId": active_id
        }),
    );
    ai.remove("apiKey");
    ai.remove("apiKeyEncrypted");
    view.insert("ai".to_string(), Value::Object(ai));
    Value::Object(view)
}

fn find_provider<'a>(providers: &'a [Value], id: &str) -> Option<&'a Value> {
    providers
        .iter()
        .find(|provider| provider.get("id").and_then(Value::as_str) == Some(id))
}

/// Chỉ dùng trong test: hình dạng công khai với một profile chưa có runtime local.
#[cfg(test)]
fn public_view(settings: &Value) -> Value {
    public_view_with_local(settings, &ai_local::LocalFacts::default())
}

/// Đích gọi model mà `lesson.rs` dựng cho một lượt phân tích.
///
/// `base_url` và `api_key` chỉ nằm trong Rust: chúng đi thẳng vào `AiTarget`,
/// không bao giờ vào V8 hay renderer. `id` được dùng làm thành phần của cache key
/// (provider đã chọn), đúng như `analysisCacheProvider` bên Electron.
pub struct ProviderTarget {
    pub id: String,
    pub label: String,
    pub base_url: String,
    pub model: String,
    pub api_key: Option<String>,
    pub mode: String,
}

/// Bản Rust của `chooseProvider` (`src/services/ai/ai-providers.ts`).
///
/// - `requested` thắng nếu nó là provider hợp lệ và đang usable; không usable là
///   lỗi, không lặng lẽ đổi sang provider khác.
/// - `localPreferred` (nút “AI trên máy”) chỉ chấp nhận runtime local đang chạy.
/// - Không có yêu cầu: `local → gemini → openai`, rồi `custom`; `opencode` không
///   bao giờ được chọn.
pub fn workflow_provider(
    app: &AppHandle,
    requested: Option<&str>,
    local_preferred: bool,
) -> Result<ProviderTarget, String> {
    let raw = paths::read_json(app, paths::SETTINGS_FILE, default_settings())?;
    let local = ai_local::local_facts(app);
    let view = public_view_with_local(&raw, &local);
    let providers = view
        .pointer("/ai/providers")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let requested = requested.map(str::trim).unwrap_or("");
    let chosen = if !requested.is_empty() {
        let Some(definition) = provider_def(requested) else {
            return Err(
                "[AI_NO_PROVIDER] Nhà cung cấp AI không tồn tại trong ứng dụng.".to_string(),
            );
        };
        let Some(found) = find_provider(&providers, requested).cloned() else {
            return Err(format!(
                "[AI_NO_PROVIDER] {} không có trong danh sách nhà cung cấp của ứng dụng.",
                definition.label
            ));
        };
        if !definition.wizard_eligible {
            return Err(format!(
                "[AI_PROVIDER_NOT_ELIGIBLE] {} chưa dùng được cho luồng tạo trò chơi. Hãy chọn AI local, Gemini hoặc ChatGPT trong Cài đặt AI.",
                definition.label
            ));
        }
        if found["usable"] != Value::Bool(true) {
            let reason = found["reason"].as_str().unwrap_or("Chưa cấu hình.");
            return Err(format!(
                "[AI_PROVIDER_NOT_READY] {} chưa sẵn sàng: {reason}",
                definition.label
            ));
        }
        found
    } else if local_preferred {
        let usable = find_provider(&providers, "local")
            .map(|provider| provider["usable"] == Value::Bool(true))
            .unwrap_or(false);
        if !usable {
            return Err("[AI_NOT_RUNNING] AI local chưa chạy. Hãy nhấn “Tổng hợp với AI trên máy” để mở cửa sổ AI local · llama.cpp, chọn model đã tải đầy đủ rồi nhấn “Bắt đầu chạy”, hoặc dùng nút phân tích bằng AI ngoài.".to_string());
        }
        find_provider(&providers, "local")
            .cloned()
            .expect("provider local luôn có trong danh sách")
    } else {
        let auto = ["local", "gemini", "openai"]
            .iter()
            .find_map(|id| {
                find_provider(&providers, id)
                    .filter(|provider| provider["usable"] == Value::Bool(true))
                    .cloned()
            })
            .or_else(|| {
                find_provider(&providers, "custom")
                    .filter(|provider| provider["usable"] == Value::Bool(true))
                    .cloned()
            });
        match auto {
            Some(provider) => provider,
            None => {
                return Err("[AI_NO_PROVIDER] Chưa có nhà cung cấp AI nào sẵn sàng. Hãy chạy AI local hoặc thêm API key của Gemini hoặc ChatGPT trong Cài đặt AI.".to_string())
            }
        }
    };

    let id = chosen["id"].as_str().unwrap_or("local").to_string();
    let label = chosen["label"].as_str().unwrap_or("").to_string();
    if id == "local" {
        let base_url = local.base_url.clone().ok_or_else(|| {
            "[AI_NOT_RUNNING] AI local chưa chạy. Hãy nhấn “Tổng hợp với AI trên máy” để mở cửa sổ AI local · llama.cpp, chọn model đã tải đầy đủ rồi nhấn “Bắt đầu chạy”, hoặc dùng nút phân tích bằng AI ngoài.".to_string()
        })?;
        return Ok(ProviderTarget {
            id,
            label,
            base_url,
            model: ai_local::selected_model_id(app),
            api_key: None,
            mode: "local".to_string(),
        });
    }

    let base_url = chosen["baseUrl"]
        .as_str()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            format!(
                "[AI_CONFIG] {label} chưa có điểm cuối (base URL). Hãy nhập trong Cài đặt AI."
            )
        })?
        .to_string();
    let model = chosen["model"]
        .as_str()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            format!("[AI_CONFIG] {label} chưa có tên model. Hãy nhập trong Cài đặt AI.")
        })?
        .to_string();
    let api_key = raw
        .pointer(&format!("/ai/providers/{id}/apiKeyEncrypted"))
        .and_then(Value::as_str)
        .filter(|blob| !blob.is_empty())
        .map(|blob| {
            secrets::unprotect_secret(blob).map_err(|_| {
                format!(
                    "[AI_CONFIG] Không đọc được API key đã lưu của {label}. Hãy nhập lại API key trong Cài đặt AI."
                )
            })
        })
        .transpose()?;
    Ok(ProviderTarget {
        id,
        label,
        base_url,
        model,
        api_key,
        mode: "online".to_string(),
    })
}

pub(crate) fn record_provider_test(
    app: &AppHandle,
    provider_id: &str,
    ok: bool,
    code: Option<&str>,
) -> Result<(), String> {
    let mut raw = paths::read_json(app, paths::SETTINGS_FILE, default_settings())?;
    let ai = raw.get_mut("ai").and_then(Value::as_object_mut);
    let Some(ai) = ai else { return Ok(()); };
    let providers = ai.entry("providers").or_insert_with(|| json!({})).as_object_mut();
    let Some(providers) = providers else { return Ok(()); };
    let entry = providers.entry(provider_id).or_insert_with(|| json!({})).as_object_mut();
    let Some(entry) = entry else { return Ok(()); };

    entry.insert("lastTestAt".to_string(), Value::String(crate::library::now()));
    entry.insert("lastTestOk".to_string(), Value::Bool(ok));
    if ok {
        entry.remove("lastTestCode");
    } else {
        entry.insert("lastTestCode".to_string(), Value::String(code.unwrap_or("UNKNOWN").to_string()));
    }

    paths::write_json(app, paths::SETTINGS_FILE, &raw)
}

fn classify_http_error(status: u16, body: &str) -> (&'static str, String) {
    let text = body.to_ascii_lowercase();
    let model_missing = text.contains("model_not_found")
        || text.contains("model not found")
        || text.contains("does not exist")
        || text.contains("not found")
        || text.contains("unsupported model")
        || text.contains("unknown model")
        || text.contains("invalid model");

    if status == 402 || text.contains("insufficient_quota") || text.contains("billing") || text.contains("exceeded your current quota") {
        (
            "AI_QUOTA",
            "Tài khoản nhà cung cấp đã hết hạn mức hoặc chưa bật thanh toán. Hãy kiểm tra trang quản lý của nhà cung cấp.".to_string(),
        )
    } else if status == 401 || status == 403 {
        (
            "AI_AUTH",
            "API key không hợp lệ, bị thu hồi hoặc không có quyền dùng model này. Hãy nhập lại khoá trong Cài đặt.".to_string(),
        )
    } else if status == 404 || (status == 400 && model_missing) {
        (
            "AI_MODEL_NOT_FOUND",
            "Nhà cung cấp không có model này (hoặc điểm cuối sai). Hãy kiểm tra tên model và base URL trong Cài đặt.".to_string(),
        )
    } else if status == 429 {
        (
            "AI_RATE_LIMIT",
            "Nhà cung cấp đang giới hạn số yêu cầu. Hãy đợi một lát rồi thử lại.".to_string(),
        )
    } else if status >= 500 {
        (
            "AI_PROVIDER_HTTP",
            format!("Nhà cung cấp báo lỗi máy chủ (HTTP {status}). Hãy thử lại sau."),
        )
    } else if status == 400 {
        (
            "AI_PROVIDER_HTTP",
            "Nhà cung cấp từ chối yêu cầu (HTTP 400). Hãy kiểm tra model và nội dung gửi đi.".to_string(),
        )
    } else {
        (
            "AI_PROVIDER_HTTP",
            format!("Nhà cung cấp AI trả về lỗi HTTP {status}. Kiểm tra endpoint, model và cấu hình xác thực."),
        )
    }
}

async fn run_local_probe(_app: &AppHandle, local: &ai_local::LocalFacts) -> Result<(), (&'static str, String)> {
    if !local.running {
        return Err((
            "AI_NOT_RUNNING",
            "AI local chưa chạy. Hãy nhấn “Tổng hợp với AI trên máy” để mở cửa sổ AI local · llama.cpp, chọn model đã tải đầy đủ rồi nhấn “Bắt đầu chạy”.".to_string(),
        ));
    }
    let Some(base_url) = local.base_url.as_deref() else {
        return Err((
            "AI_NOT_RUNNING",
            "AI local chưa có địa chỉ kết nối hợp lệ.".to_string(),
        ));
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| ("AI_CONNECTION", format!("Không tạo được HTTP client: {e}")))?;

    let body = json!({
        "model": "local",
        "messages": [{ "role": "user", "content": "Trả lời đúng một từ: OK" }],
        "max_tokens": 16,
        "temperature": 0
    });

    let resp = client
        .post(format!("{}/chat/completions", base_url.trim_end_matches('/')))
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .body(body.to_string())
        .send()
        .await
        .map_err(|e| ("AI_CONNECTION", format!("Không kết nối được tới AI local: {e}")))?;

    if !resp.status().is_success() {
        return Err((
            "AI_CONNECTION",
            format!("AI local trả về lỗi HTTP {}.", resp.status()),
        ));
    }

    let text = resp
        .text()
        .await
        .map_err(|e| ("AI_CONNECTION", format!("Không đọc được phản hồi từ AI local: {e}")))?;

    let json: Value = serde_json::from_str(&text)
        .map_err(|e| ("AI_INVALID_JSON", format!("Không đọc được JSON từ AI local: {e}")))?;

    let content = json
        .pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();

    if content.is_empty() {
        return Err((
            "AI_EMPTY",
            "AI local nhận được yêu cầu nhưng trả về nội dung rỗng. Hãy kiểm tra model.".to_string(),
        ));
    }

    Ok(())
}

async fn run_online_probe(
    _app: &AppHandle,
    definition: &ProviderDef,
    resolved: &Value,
    raw_settings: &Value,
) -> Result<(), (&'static str, String)> {
    let base_url = resolved
        .get("baseUrl")
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or("");
    let model = resolved
        .get("model")
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or("");

    if base_url.is_empty() || model.is_empty() {
        return Err((
            "AI_CONFIG",
            format!("{}: thiếu base URL hoặc tên model.", definition.label),
        ));
    }

    let parsed_url = reqwest::Url::parse(base_url).map_err(|_| {
        (
            "AI_CONFIG",
            "API Base URL không hợp lệ.".to_string(),
        )
    })?;

    let is_loopback = matches!(
        parsed_url.host_str(),
        Some("localhost" | "127.0.0.1" | "[::1]")
    );

    if parsed_url.scheme() != "https" && !(parsed_url.scheme() == "http" && is_loopback) {
        return Err((
            "AI_CONFIG",
            "API online phải dùng HTTPS.".to_string(),
        ));
    }

    let api_key = if resolved.get("hasKey") == Some(&Value::Bool(true)) {
        raw_settings
            .pointer(&format!("/ai/providers/{}/apiKeyEncrypted", definition.id))
            .and_then(Value::as_str)
            .and_then(|enc| secrets::unprotect_secret(enc).ok())
            .unwrap_or_default()
    } else {
        String::new()
    };

    if definition.requires_key && api_key.is_empty() {
        return Err((
            "AI_CONFIG",
            format!("{}: chưa có API key. Hãy nhập khoá rồi kiểm tra lại.", definition.label),
        ));
    }

    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| ("AI_NETWORK", format!("{}: không tạo được HTTP client ({e}).", definition.label)))?;

    let body = json!({
        "model": model,
        "temperature": 0,
        "max_tokens": 8,
        "messages": [{ "role": "user", "content": "Trả lời đúng một từ: OK" }]
    });

    let endpoint = format!("{}/chat/completions", base_url.trim_end_matches('/'));
    let mut req = client
        .post(&endpoint)
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .body(body.to_string());

    if !api_key.is_empty() {
        req = req.header(reqwest::header::AUTHORIZATION, format!("Bearer {api_key}"));
    }

    let resp = req.send().await.map_err(|e| {
        (
            "AI_NETWORK",
            format!("{}: không kết nối được ({e}).", definition.label),
        )
    })?;

    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        let (code, msg) = classify_http_error(status.as_u16(), &text);
        return Err((code, format!("{}: {msg}", definition.label)));
    }

    let data: Value = serde_json::from_str(&text).map_err(|e| {
        (
            "AI_INVALID_JSON",
            format!("{}: phản hồi không phải JSON hợp lệ ({e}).", definition.label),
        )
    })?;

    let content = data
        .pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();

    if content.is_empty() {
        return Err((
            "AI_EMPTY",
            format!(
                "{} nhận được yêu cầu nhưng trả về nội dung rỗng. Hãy kiểm tra model.",
                definition.label
            ),
        ));
    }

    Ok(())
}

pub async fn test_provider(app: AppHandle, payload: Value) -> Result<Value, String> {
    let provider_id = payload
        .get("providerId")
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or("");
    if provider_id.is_empty() {
        return Err("[AI_CONFIG] Thiếu mã nhà cung cấp AI.".to_string());
    }
    let Some(definition) = provider_def(provider_id) else {
        return Err("[AI_CONFIG] Nhà cung cấp AI không tồn tại.".to_string());
    };

    let started_at = std::time::Instant::now();
    let raw = paths::read_json(&app, paths::SETTINGS_FILE, default_settings())?;
    let local = ai_local::local_facts(&app);
    let view = public_view_with_local(&raw, &local);
    let resolved = view
        .pointer("/ai/providers")
        .and_then(Value::as_array)
        .and_then(|arr| find_provider(arr, provider_id))
        .cloned();

    let Some(resolved) = resolved else {
        return Err("[AI_CONFIG] Nhà cung cấp AI không tồn tại trong cấu hình.".to_string());
    };

    let model = resolved
        .get("model")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();

    let test_result = if provider_id == "local" {
        run_local_probe(&app, &local).await
    } else {
        run_online_probe(&app, definition, &resolved, &raw).await
    };

    let duration_ms = started_at.elapsed().as_millis() as u64;

    match test_result {
        Ok(()) => {
            let _ = record_provider_test(&app, provider_id, true, None);
            let updated = get(&app)?;
            let detail = if provider_id == "local" {
                "Model local trả lời được."
            } else {
                "Nhà cung cấp trả lời được yêu cầu thử nhỏ."
            };
            Ok(json!({
                "ok": true,
                "providerId": provider_id,
                "model": model,
                "durationMs": duration_ms,
                "detail": detail,
                "settings": updated
            }))
        }
        Err((code, message)) => {
            let _ = record_provider_test(&app, provider_id, false, Some(code));
            Err(format!("[{code}] {message}"))
        }
    }
}

fn provider_status(
    definition: &ProviderDef,
    has_key: bool,
    base_url: &str,
    model: &str,
    last_test_ok: Option<bool>,
    last_test_at: Option<&str>,
    last_test_code: Option<&str>,
    local: &ai_local::LocalFacts,
) -> (&'static str, String) {
    if definition.id == "local" {
        if local.running {
            return ("ready", "Đang chạy trên máy này.".to_string());
        }
        let reason = if local.model_ready {
            "Model đã tải nhưng chưa chạy. Nhấn “Bắt đầu chạy” trong cửa sổ AI local."
        } else {
            "Chưa có model. Hãy tải model trong phần AI local phía trên."
        };
        return ("configured", reason.to_string());
    }
    let configured = if definition.id == "opencode" {
        !base_url.is_empty() && !model.is_empty()
    } else {
        has_key && !base_url.is_empty() && !model.is_empty()
    };
    if !configured {
        let reason = if definition.id != "opencode" && !has_key {
            "Chưa có API key."
        } else if base_url.is_empty() {
            "Chưa có điểm cuối (base URL)."
        } else {
            "Chưa có tên model."
        };
        return ("not-configured", reason.to_string());
    }
    let when = last_test_at.map(format_short_time);
    let when = when.as_deref().unwrap_or("");
    let when = if last_test_at.is_some() { format!(" lúc {when}") } else { String::new() };
    match last_test_ok {
        Some(false) => {
            let code = last_test_code.map(error_label).unwrap_or("Lỗi chưa xác định");
            ("failing", format!("Kiểm tra gần nhất thất bại{when} ({code})."))
        }
        Some(true) => {
            let mut note = format!("Kiểm tra kết nối thành công{when}.");
            if !definition.wizard_eligible {
                note.push_str(" Chưa dùng được cho luồng tạo trò chơi.");
            }
            ("ready", note)
        }
        None => (
            "configured",
            "Đã cấu hình nhưng chưa kiểm tra kết nối.".to_string(),
        ),
    }
}

/// Bản sao `formatShortTime()` trong `ai-providers.ts`: ISO UTC → "HH:mm dd/MM"
/// theo múi giờ máy. Chuỗi không parse được trả rỗng, như nguyên bản.
fn format_short_time(iso: &str) -> String {
    chrono::DateTime::parse_from_rfc3339(iso)
        .map(|at| at.with_timezone(&chrono::Local).format("%H:%M %d/%m").to_string())
        .unwrap_or_default()
}

/// Bản sao `ERROR_LABELS`/`errorLabel()` trong `ai-providers.ts` — nhãn ngắn cho
/// thẻ Cài đặt, khác thông dài của `classify_http_error` dùng ở banner.
fn error_label(code: &str) -> &'static str {
    match code {
        "AI_AUTH" => "API key không hợp lệ hoặc bị thu hồi",
        "AI_QUOTA" => "Tài khoản hết hạn mức",
        "AI_RATE_LIMIT" => "Đang bị giới hạn số yêu cầu",
        "AI_NETWORK" | "AI_CONNECTION" => "Không kết nối được tới nhà cung cấp",
        "AI_TIMEOUT" => "Nhà cung cấp phản hồi quá lâu",
        "AI_MODEL_NOT_FOUND" => "Không có model này",
        "AI_CONFIG" => "Cấu hình chưa đúng",
        "AI_KEY_STORAGE_UNAVAILABLE" => "Máy không lưu được khoá an toàn",
        "AI_INVALID_JSON" => "Nhà cung cấp trả về dữ liệu không đọc được",
        "AI_HTTP" | "AI_PROVIDER_HTTP" => "Nhà cung cấp báo lỗi",
        _ => "Lỗi chưa xác định",
    }
}

#[cfg(test)]
mod tests {
    use serde_json::{json, Value};

    use super::{classify_http_error, default_settings, merge, provider_def, provider_status, public_view};

    fn provider<'a>(view: &'a Value, id: &str) -> &'a Value {
        view["ai"]["providers"]
            .as_array()
            .expect("providers phải là mảng trong public view")
            .iter()
            .find(|provider| provider["id"] == id)
            .unwrap_or_else(|| panic!("thiếu provider {id}"))
    }

    #[test]
    fn default_public_view_lists_five_providers_and_stays_offline() {
        let view = public_view(&default_settings());
        assert_eq!(view["ai"]["mode"], "offline");
        assert_eq!(view["ai"]["provider"], "local");
        assert_eq!(view["ai"]["providers"].as_array().unwrap().len(), 5);
        assert_eq!(view["preferences"]["theme"], "system");
    }

    #[test]
    fn a_new_key_is_stored_only_as_a_dpapi_blob_and_masked() {
        let current = default_settings();
        let merged = merge(
            &current,
            &json!({
                "ai": {
                    "providers": {
                        "gemini": {
                            "baseUrl": "https://synthetic.example/v1///",
                            "model": "  synthetic-model  ",
                            "apiKey": "  synthetic-key-1234  "
                        }
                    }
                }
            }),
        )
        .expect("DPAPI phải mã hoá được trên Windows");
        let blob = merged["ai"]["providers"]["gemini"]["apiKeyEncrypted"]
            .as_str()
            .expect("phải có blob đã mã hoá")
            .to_string();
        assert!(!blob.contains("synthetic"));
        assert_eq!(merged["ai"]["providers"]["gemini"]["baseUrl"], "https://synthetic.example/v1");
        assert_eq!(merged["ai"]["providers"]["gemini"]["model"], "synthetic-model");
        assert!(merged["ai"].get("apiKeyEncrypted").is_none());
        assert!(merged["ai"]["providers"]["gemini"].get("apiKey").is_none());

        let view = public_view(&merged);
        assert_eq!(provider(&view, "gemini")["hasKey"], true);
        assert_eq!(provider(&view, "gemini")["keyMasked"], "••••1234");
        assert_eq!(provider(&view, "gemini")["status"], "configured");
        let visible = serde_json::to_string(&view).unwrap();
        assert!(!visible.contains("synthetic-key"));
        assert!(!visible.contains("apiKeyEncrypted"));
    }

    #[test]
    fn an_empty_key_keeps_the_blob_and_clear_key_removes_it() {
        let with_key = merge(
            &default_settings(),
            &json!({ "ai": { "providers": { "gemini": { "apiKey": "synthetic-keep-9999" } } } }),
        )
        .unwrap();
        let blob = with_key["ai"]["providers"]["gemini"]["apiKeyEncrypted"].clone();
        let kept = merge(
            &with_key,
            &json!({ "ai": { "providers": { "gemini": { "apiKey": "   " } } } }),
        )
        .unwrap();
        assert_eq!(kept["ai"]["providers"]["gemini"]["apiKeyEncrypted"], blob);

        let cleared = merge(
            &kept,
            &json!({ "ai": { "providers": { "gemini": { "clearKey": true } } } }),
        )
        .unwrap();
        assert!(cleared["ai"]["providers"]["gemini"].get("apiKeyEncrypted").is_none());
        let view = public_view(&cleared);
        assert_eq!(provider(&view, "gemini")["hasKey"], false);
        assert_eq!(provider(&view, "gemini")["keyMasked"], "");
    }

    #[test]
    fn replacing_a_key_invalidates_the_previous_test() {
        let current = json!({
            "ai": {
                "providers": {
                    "openai": {
                        "baseUrl": "https://synthetic.example/v1",
                        "model": "synthetic-model",
                        "apiKeyEncrypted": "old-blob",
                        "lastTestAt": "2026-11-10T00:00:00.000Z",
                        "lastTestOk": true,
                        "lastTestCode": null
                    }
                }
            }
        });
        let merged = merge(
            &current,
            &json!({ "ai": { "providers": { "openai": { "apiKey": "synthetic-new-7777" } } } }),
        )
        .unwrap();
        let openai = &merged["ai"]["providers"]["openai"];
        assert!(openai.get("lastTestAt").is_none());
        assert!(openai.get("lastTestOk").is_none());
        assert!(openai.get("lastTestCode").is_none());
        assert_ne!(openai["apiKeyEncrypted"], "old-blob");
    }

    #[test]
    fn stale_plaintext_fields_are_dropped() {
        let merged = merge(
            &default_settings(),
            &json!({
                "ai": {
                    "apiKey": "synthetic-leak",
                    "apiKeyEncrypted": "synthetic-leak",
                    "providers": {
                        "gemini": { "apiKey": "synthetic-provider-leak" }
                    }
                }
            }),
        )
        .unwrap();
        assert!(merged["ai"].get("apiKey").is_none());
        assert!(merged["ai"].get("apiKeyEncrypted").is_none());
        assert!(merged["ai"]["providers"]["gemini"].get("apiKey").is_none());
        let text = serde_json::to_string(&merged).unwrap();
        assert!(!text.contains("synthetic-leak"));
    }

    #[test]
    fn classify_http_error_categorizes_status_codes_and_bodies() {
        assert_eq!(classify_http_error(401, "").0, "AI_AUTH");
        assert_eq!(classify_http_error(403, "").0, "AI_AUTH");
        assert_eq!(classify_http_error(429, "insufficient_quota").0, "AI_QUOTA");
        assert_eq!(classify_http_error(402, "").0, "AI_QUOTA");
        assert_eq!(classify_http_error(404, "").0, "AI_MODEL_NOT_FOUND");
        assert_eq!(classify_http_error(400, "model not found").0, "AI_MODEL_NOT_FOUND");
        assert_eq!(classify_http_error(429, "too many requests").0, "AI_RATE_LIMIT");
        assert_eq!(classify_http_error(500, "internal error").0, "AI_PROVIDER_HTTP");
    }

    #[test]
    fn failing_note_uses_the_vietnamese_label_and_compact_time() {
        let facts = crate::ai_local::LocalFacts::default();
        let definition = provider_def("gemini").expect("gemini có trong registry");
        let (status, reason) = provider_status(
            definition, true, "https://synthetic.example/v1", "synthetic-model",
            Some(false), Some("2026-01-02T03:04:05.678Z"), Some("AI_AUTH"), &facts,
        );
        assert_eq!(status, "failing");
        assert!(reason.contains("API key không hợp lệ hoặc bị thu hồi"), "{reason}");
        assert!(!reason.contains("AI_AUTH"), "mã trần không được hiện ra: {reason}");
        assert!(!reason.contains("2026-01-02T"), "ISO thô không được hiện ra: {reason}");
        let at = reason.find("lúc ").expect("phải có mốc giờ");
        let stamp: Vec<char> = reason[at + "lúc ".len()..].chars().take(11).collect();
        assert!(
            stamp.len() == 11 && stamp[2] == ':' && stamp[5] == ' ' && stamp[8] == '/'
                && stamp.iter().step_by(3).take(4).all(|c| c.is_ascii_digit()),
            "mốc giờ phải là HH:mm dd/MM, nhận {stamp:?}"
        );
    }

    #[test]
    fn ready_note_flags_providers_the_game_flow_cannot_use() {
        let facts = crate::ai_local::LocalFacts::default();
        let opencode = provider_def("opencode").expect("opencode có trong registry");
        let (_, reason) = provider_status(
            opencode, false, "https://synthetic.example/v1", "synthetic-model",
            Some(true), Some("2026-01-02T03:04:05.678Z"), None, &facts,
        );
        assert!(reason.contains("Chưa dùng được cho luồng tạo trò chơi."), "{reason}");
        let gemini = provider_def("gemini").expect("gemini có trong registry");
        let (status, reason) = provider_status(
            gemini, true, "https://synthetic.example/v1", "synthetic-model",
            Some(true), Some("2026-01-02T03:04:05.678Z"), None, &facts,
        );
        assert_eq!(status, "ready");
        assert!(!reason.contains("Chưa dùng được"), "{reason}");
    }
}
