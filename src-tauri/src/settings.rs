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

use crate::{paths, secrets};

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
    Ok(public_view(&raw))
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
    Ok(json!({ "ok": true, "settings": public_view(&merged) }))
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

fn public_view(settings: &Value) -> Value {
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
        );
        // AI local chỉ usable khi runtime thật đang chạy; Phase 5 chưa mở runtime
        // nên cờ này luôn false. Cloud chỉ usable sau một lần kiểm tra thành công
        // (đúng luật #132 §D7), không phải chỉ vì đã có key.
        let usable = definition.wizard_eligible
            && enabled
            && if definition.id == "local" {
                false
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

fn provider_status(
    definition: &ProviderDef,
    has_key: bool,
    base_url: &str,
    model: &str,
    last_test_ok: Option<bool>,
    last_test_at: Option<&str>,
    last_test_code: Option<&str>,
) -> (&'static str, String) {
    if definition.id == "local" {
        return (
            "configured",
            "Chưa chạy AI local trong bản Tauri này.".to_string(),
        );
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
    let when = last_test_at.map(|at| format!(" lúc {at}")).unwrap_or_default();
    match last_test_ok {
        Some(false) => {
            let code = last_test_code.map(|code| format!(" ({code})")).unwrap_or_default();
            ("failing", format!("Kiểm tra gần nhất thất bại{when}{code}."))
        }
        Some(true) => ("ready", format!("Kiểm tra kết nối thành công{when}.")),
        None => (
            "configured",
            "Đã cấu hình nhưng chưa kiểm tra kết nối.".to_string(),
        ),
    }
}

#[cfg(test)]
mod tests {
    use serde_json::{json, Value};

    use super::{default_settings, merge, public_view};

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
}
