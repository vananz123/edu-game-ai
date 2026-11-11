//! Luồng giáo án của vỏ Tauri: ghép Rust (settings/runtime/HTTP/lưu trữ) với
//! slot V8 `EGLESSON` (`embedded/lesson-ops.ts`).
//!
//! Ranh giới, đúng như quyết định #251/#132:
//!
//!   • **Rust** sở hữu thứ không được vào WebView: API key, endpoint thật, thời
//!     gian chờ, cờ huỷ, khoá một-lượt (`AiGate`). Nó cũng đọc/ghi tài liệu,
//!     phân tích và đề xuất qua `lesson_store.rs` trên cùng kết nối SQLite của
//!     engine.
//!   • **V8** giữ nguyên luật TypeScript của Electron: dựng prompt, sửa JSON,
//!     chuẩn hoá kết quả, cache key, cắt đoạn giáo án, xếp hạng trò chơi và luật
//!     dự án. Tệp này chỉ chuyển dữ liệu đã lưu vào slot và nhận lại kết quả.
//!
//! `lesson:analyze` là lượt duy nhất chạm model. Nó chạy hai op V8: `lesson-plan`
//! (băm, cache key, phần được chọn — rẻ) rồi tra cache; chỉ khi trượt cache mới
//! lấy khoá một-lượt và gọi `lesson-analyze` (một lượt HTTP). Nhờ vậy một cache
//! hit không cần provider đang chạy và không cần `requestId` thật.

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager};

use crate::ai_http::{AiGate, AiTarget};
use crate::library;
use crate::settings;

/// Lấy chuỗi từ payload, thiếu thì rỗng — cùng cách `String(payload?.x || '')`
/// của `main.ts`.
fn text_field(payload: &Value, key: &str) -> String {
    payload
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string()
}

fn error(message: &str) -> String {
    message.to_string()
}

// ---------------------------------------------------------------------------
// Kho giáo án: `lesson-store:*` trong `lesson_store.rs`
// ---------------------------------------------------------------------------

pub fn save_document(app: &AppHandle, payload: Option<&Value>) -> Result<Value, String> {
    let document = payload.cloned().unwrap_or(Value::Null);
    library::run(app, "lesson-store:save-document", &[document])
}

pub fn get_document(app: &AppHandle, document_id: &str) -> Result<Value, String> {
    library::run(app, "lesson-store:get-document", &[json!(document_id)])
}

pub fn library_documents(app: &AppHandle) -> Result<Value, String> {
    library::run(app, "lesson-store:library", &[])
}

pub fn delete_document(app: &AppHandle, document_id: &str) -> Result<Value, String> {
    library::run(app, "lesson-store:delete-document", &[json!(document_id)])
}

pub fn delete_documents(app: &AppHandle, document_ids: Option<&Value>) -> Result<Value, String> {
    let ids = document_ids_for_delete(document_ids)?;
    library::run(app, "lesson-store:delete-documents", &[json!(ids)])
}

/// Cùng phép kiểm ở `main.ts` trước khi chạm kho: chỉ nhận chuỗi khác rỗng,
/// không xoá rỗng, và mỗi lượt tối đa 200 giáo án. Bộ đếm `deleted/missing/
/// failed` vẫn do slot V8 trả về.
fn document_ids_for_delete(input: Option<&Value>) -> Result<Vec<String>, String> {
    let ids: Vec<String> = input
        .and_then(Value::as_array)
        .map(|list| {
            list.iter()
                .filter_map(Value::as_str)
                .filter(|id| !id.is_empty())
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default();
    if ids.is_empty() {
        return Err(error("Chưa chọn giáo án nào để xoá."));
    }
    if ids.len() > 200 {
        return Err(error("Mỗi lần chỉ xoá tối đa 200 giáo án."));
    }
    Ok(ids)
}

pub fn get_analysis(app: &AppHandle, analysis_id: &str) -> Result<Value, String> {
    library::run(app, "lesson-store:get-analysis", &[json!(analysis_id)])
}

/// `lesson:save-analysis` của Electron không có tham số thứ hai; lượt phân tích
/// tự gọi op kho với `{cacheKey}` (xem `analyze_blocking`).
pub fn save_analysis(app: &AppHandle, analysis: Option<&Value>) -> Result<Value, String> {
    let analysis = analysis.cloned().unwrap_or(Value::Null);
    library::run(app, "lesson-store:save-analysis", &[analysis])
}

pub fn list_recommendations(app: &AppHandle, analysis_id: &str) -> Result<Value, String> {
    library::run(app, "lesson-store:list-recommendations", &[json!(analysis_id)])
}

// ---------------------------------------------------------------------------
// Phép đọc/chuẩn bị offline
// ---------------------------------------------------------------------------

/// `lesson:get-structure`: nhận `text` đang gõ hoặc `documentId` đã lưu.
pub fn structure(app: &AppHandle, payload: Option<&Value>) -> Result<Value, String> {
    let payload = payload.cloned().unwrap_or(Value::Null);
    let mut text = payload
        .get("text")
        .and_then(Value::as_str)
        .map(str::to_string);
    if text.is_none() {
        let document_id = text_field(&payload, "documentId");
        if !document_id.is_empty() {
            let document = get_document(app, &document_id)?;
            if document.is_null() {
                return Err(error("Không tìm thấy giáo án đã lưu. Hãy nhập lại tài liệu."));
            }
            text = Some(text_field(&document, "text"));
        }
    }
    let Some(text) = text else {
        return Err(error("Thiếu nội dung tài liệu để đọc cấu trúc."));
    };
    library::run(app, "lesson-structure", &[json!(text)])
}

/// `lesson:preview-selection`: đúng phép cắt đoạn mà `lesson:analyze` dùng.
pub fn preview(app: &AppHandle, payload: Option<&Value>) -> Result<Value, String> {
    let payload = payload.cloned().unwrap_or(Value::Null);
    library::run(app, "lesson-preview", &[payload])
}

/// `lesson:classify-input`: luật + bộ đọc câu hỏi; lớp ngữ nghĩa chưa có trong
/// vỏ Tauri nên slot báo `semantic: 'unavailable'` thay vì giả vờ.
pub fn classify(app: &AppHandle, payload: Option<&Value>) -> Result<Value, String> {
    let payload = payload.cloned().unwrap_or(Value::Null);
    library::run(app, "lesson-classify", &[payload])
}

// ---------------------------------------------------------------------------
// Phân tích
// ---------------------------------------------------------------------------

/// Chạy `lesson:analyze` trên luồng chặn riêng.
///
/// Lượt này chờ model (tới 300 s với AI local), nên không được chiếm một luồng
/// async của runtime: `ai:cancel` phải còn chỗ để chạy và bật cờ huỷ.
pub async fn analyze(app: AppHandle, payload: Option<Value>) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || analyze_blocking(&app, payload.as_ref()))
        .await
        .map_err(|failure| format!("Lượt phân tích bị dừng: {failure}"))?
}

fn analyze_blocking(app: &AppHandle, payload: Option<&Value>) -> Result<Value, String> {
    let payload = payload.cloned().unwrap_or(Value::Null);
    let document_id = text_field(&payload, "documentId");
    if document_id.is_empty() {
        return Err(error("Thiếu mã tài liệu để phân tích."));
    }
    let request_id = text_field(&payload, "requestId");
    let document = get_document(app, &document_id)?;
    if document.is_null() {
        return Err(error("Không tìm thấy giáo án đã lưu. Hãy nhập lại tài liệu."));
    }
    let text = text_field(&document, "text");
    let name = text_field(&document, "name");
    let characters = document
        .get("characters")
        .and_then(Value::as_i64)
        .unwrap_or(0);
    let mode = if text_field(&payload, "mode") == "deep" {
        "deep"
    } else {
        "fast"
    };
    let provider_id = payload
        .get("providerId")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let local_preferred = payload
        .get("localPreferred")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    // #132: provider được chọn *trước* khi dựng cache key, vì nó là một phần của
    // key và cũng quyết định hạn mức cắt đoạn. Không usable là lỗi, không tự đổi.
    let target = settings::workflow_provider(app, provider_id, local_preferred)?;
    // `currentChatModelId()` của Electron: model AI local đang chọn, kể cả khi
    // lượt này chạy bằng provider cloud. Giữ y để cache key trùng từng byte.
    let model_id = crate::ai_local::selected_model_id(app);

    let plan = library::run(
        app,
        "lesson-plan",
        &[json!({
            "text": text,
            "name": name,
            "mode": mode,
            "providerId": target.id,
            "modelId": model_id,
            "selectedIds": payload.get("selectedIds").cloned().unwrap_or(Value::Null)
        })],
    )?;
    let cache_key = text_field(&plan, "cacheKey");
    let force = payload
        .get("force")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let mut analysis = if force {
        Value::Null
    } else {
        library::run(
            app,
            "lesson-store:find-analysis-cache",
            &[json!(document_id), json!(cache_key)],
        )?
    };
    let cached = !analysis.is_null();

    if analysis.is_null() {
        let gate = app
            .try_state::<AiGate>()
            .ok_or_else(|| error("AI_CONFIG: hàng đợi AI chưa sẵn sàng. Hãy khởi động lại ứng dụng."))?;
        let cancel = gate.begin(&request_id, "phân tích giáo án")?;
        let ai = AiTarget {
            request_id: request_id.clone(),
            base_url: target.base_url.clone(),
            api_key: target.api_key.clone(),
            mode: target.mode.clone(),
            cancel,
        };
        // `lesson:progress` nuôi danh sách bước của wizard. Electron phát
        // `prepare` trước khi chuẩn bị văn bản và `generate` đúng lúc gọi model;
        // ở đây hai bước nằm sát nhau vì phần chuẩn bị chạy trong slot V8.
        let _ = app.emit(
            "lesson:progress",
            json!({ "requestId": request_id, "stage": "prepare" }),
        );
        // `analysisId` do renderer đặt; thiếu thì `analyzeLesson` tự sinh, đúng
        // như bản Electron.
        let analysis_id = payload
            .get("analysisId")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .map(str::to_string);
        let _ = app.emit(
            "lesson:progress",
            json!({ "requestId": request_id, "stage": "generate" }),
        );
        let result = library::run_with_ai(
            app,
            "lesson-analyze",
            &[json!({
                "text": text,
                "name": name,
                "mode": mode,
                "providerId": target.id,
                "documentId": document_id,
                "requestId": request_id,
                "analysisId": analysis_id,
                "now": library::now(),
                "plan": { "selection": plan.get("selection").cloned().unwrap_or(Value::Null) },
                "target": {
                    "requestId": request_id,
                    "model": target.model,
                    "mode": target.mode
                }
            })],
            ai,
        );
        // Luôn nhả khoá, kể cả khi model lỗi hay giáo viên huỷ.
        gate.finish(&request_id);
        let value = result?;
        analysis = value.get("analysis").cloned().unwrap_or(Value::Null);
        // Cùng thứ tự Electron: lưu phân tích ngay khi model trả xong.
        library::run(
            app,
            "lesson-store:save-analysis",
            &[analysis.clone(), json!({ "cacheKey": cache_key })],
        )?;
        let _ = app.emit(
            "lesson:progress",
            json!({ "requestId": request_id, "stage": "ready" }),
        );
    }

    // Ghép vào dự án (nếu có) bằng luật `lesson-projects.ts`, rồi lưu bằng
    // `project:save-draft` — bộ kiểm Zod của Electron.
    let identity = json!({
        "documentId": document_id,
        "name": name,
        "characters": characters
    });
    let now = library::now();
    let project_id = text_field(&payload, "projectId");
    let project = if project_id.is_empty() {
        library::run(
            app,
            "lesson-project",
            &[json!({
                "action": "create",
                "document": identity,
                "analysis": analysis,
                "now": now
            })],
        )?
    } else {
        let existing = library::run(app, "project:get", &[json!(project_id)])?;
        if existing.is_null() {
            return Err(error("Không tìm thấy dự án để cập nhật kết quả phân tích."));
        }
        library::run(
            app,
            "lesson-project",
            &[json!({
                "action": "apply-analysis",
                "project": existing,
                "document": identity,
                "analysis": analysis,
                "now": now
            })],
        )?
    };
    let project = library::run(app, "project:save-draft", &[project])?;

    Ok(json!({
        "analysis": analysis,
        "project": project,
        "cached": cached,
        "sent": plan.get("sent").cloned().unwrap_or(Value::Null)
    }))
}

// ---------------------------------------------------------------------------
// Đề xuất / ước lượng
// ---------------------------------------------------------------------------

/// `lesson:recommend`: luật xếp hạng, không gọi model.
pub fn recommend(app: &AppHandle, payload: Option<&Value>) -> Result<Value, String> {
    let payload = payload.cloned().unwrap_or(Value::Null);
    let analysis_id = text_field(&payload, "analysisId");
    if analysis_id.is_empty() {
        return Err(error("Thiếu mã phân tích để gợi ý trò chơi."));
    }
    let analysis = get_analysis(app, &analysis_id)?;
    if analysis.is_null() {
        return Err(error(
            "Không tìm thấy kết quả phân tích. Hãy phân tích giáo án trước.",
        ));
    }
    let project_id = text_field(&payload, "projectId");
    let project = if project_id.is_empty() {
        Value::Null
    } else {
        library::run(app, "project:get", &[json!(project_id)])?
    };
    let mode = if text_field(&payload, "mode") == "deep" {
        "deep"
    } else {
        "fast"
    };
    let result = library::run(
        app,
        "lesson-recommend",
        &[json!({
            "analysis": analysis,
            "project": project,
            "modelId": crate::ai_local::selected_model_id(app),
            "mode": mode,
            "now": library::now()
        })],
    )?;
    let recommendations = result
        .get("recommendations")
        .cloned()
        .unwrap_or_else(|| Value::Array(Vec::new()));
    library::run(
        app,
        "lesson-store:save-recommendations",
        &[json!(analysis_id), recommendations.clone()],
    )?;
    let project = match result.get("project").filter(|value| !value.is_null()) {
        Some(project) => Some(library::run(app, "project:save-draft", &[project.clone()])?),
        None => None,
    };
    Ok(json!({ "recommendations": recommendations, "project": project }))
}

/// `lesson:capacity`: ước lượng tất định; chỉ đọc, không ghi.
pub fn capacity(app: &AppHandle, payload: Option<&Value>) -> Result<Value, String> {
    let payload = payload.cloned().unwrap_or(Value::Null);
    let project_id = text_field(&payload, "projectId");
    if project_id.is_empty() {
        return Err(error("Thiếu mã dự án để ước lượng số lượng nội dung."));
    }
    let project = library::run(app, "project:get", &[json!(project_id)])?;
    if project.is_null() {
        return Err(error("Không tìm thấy dự án. Hãy lưu dự án trước khi cấu hình."));
    }
    let analysis_id = text_field(&project, "analysisId");
    let analysis = if analysis_id.is_empty() {
        Value::Null
    } else {
        get_analysis(app, &analysis_id)?
    };
    let objective_count = analysis
        .get("objectives")
        .and_then(Value::as_array)
        .map(|items| items.len() as i64)
        .unwrap_or(0);
    let concept_count = analysis
        .get("keyConcepts")
        .and_then(Value::as_array)
        .map(|items| items.len() as i64)
        .unwrap_or(0);
    let characters = project
        .pointer("/lesson/characters")
        .and_then(Value::as_i64)
        .unwrap_or(0);
    let mode = if text_field(&payload, "mode") == "deep" {
        "deep"
    } else {
        "fast"
    };
    library::run(
        app,
        "lesson-capacity",
        &[json!({
            "gameType": text_field(&payload, "gameType"),
            "documentCharacters": characters,
            "objectiveCount": objective_count,
            "conceptCount": concept_count,
            "modelId": crate::ai_local::selected_model_id(app),
            "mode": mode
        })],
    )
}

// ---------------------------------------------------------------------------
// Bước 5–6: chuyển đổi, chất lượng, minh hoạ, tạo nội dung, tạo lại một mục
// ---------------------------------------------------------------------------

/// `lesson:convert-draft`: toàn bộ phép kiểm nằm trong slot V8 (`convertDraft`).
pub fn convert_draft(app: &AppHandle, payload: Option<&Value>) -> Result<Value, String> {
    let payload = payload.cloned().unwrap_or(Value::Null);
    library::run(app, "lesson-convert", &[payload])
}

/// `lesson:quality`: đọc dự án rồi để `checkDraftQuality` chấm. Không có dự án
/// hoặc chưa có bản nháp thì trả `null` như Electron, không phải lỗi.
pub fn quality(app: &AppHandle, payload: Option<&Value>) -> Result<Value, String> {
    let payload = payload.cloned().unwrap_or(Value::Null);
    let project_id = text_field(&payload, "projectId");
    if project_id.is_empty() {
        return Ok(Value::Null);
    }
    let project = library::run(app, "project:get", &[json!(project_id)])?;
    if project.is_null() || project.get("draft").map(Value::is_null).unwrap_or(true) {
        return Ok(Value::Null);
    }
    let analysis = analysis_of_project(app, &project)?;
    library::run(
        app,
        "lesson-quality",
        &[json!({
            "draft": project.get("draft").cloned().unwrap_or(Value::Null),
            "config": project.get("config").cloned().unwrap_or(Value::Null),
            "analysis": analysis
        })],
    )
}

/// `lesson:patch-item-assets`: chỉ ba trường minh hoạ, rồi adapter + lưu dự án.
pub fn patch_item_assets(app: &AppHandle, payload: Option<&Value>) -> Result<Value, String> {
    let payload = payload.cloned().unwrap_or(Value::Null);
    let project_id = text_field(&payload, "projectId");
    if project_id.is_empty() {
        return Err(error("Thiếu mã dự án để đổi minh hoạ."));
    }
    let patch = payload.get("patch").cloned().unwrap_or(Value::Null);
    if !patch.is_object() {
        return Err(error("Thiếu thông tin minh hoạ cần đổi."));
    }
    if !asset_patch_changed(&patch) {
        return Err(error(
            "Không có trường minh hoạ nào được gửi lên. Chỉ đổi được chủ đề, biểu tượng và hình minh hoạ.",
        ));
    }
    let project = library::run(app, "project:get", &[json!(project_id)])?;
    if project.is_null() {
        return Err(error(
            "Không tìm thấy dự án. Hãy lưu dự án trước khi đổi minh hoạ.",
        ));
    }
    if project.get("draft").map(Value::is_null).unwrap_or(true) {
        return Err(error(
            "Dự án chưa có nội dung. Hãy tạo nội dung trước khi đổi minh hoạ.",
        ));
    }
    let config = project.get("config").cloned().unwrap_or(Value::Null);
    if config.is_null() {
        return Err(error(
            "Dự án chưa có cấu hình trò chơi. Hãy hoàn tất bước cấu hình.",
        ));
    }
    let draft_type = project
        .pointer("/draft/gameType")
        .and_then(Value::as_str)
        .unwrap_or("");
    let config_type = config
        .get("gameType")
        .and_then(Value::as_str)
        .unwrap_or("");
    if draft_type != config_type {
        return Err(error(
            "[GENERATION_INVALID] Nội dung hiện tại không khớp thể loại đã chọn. Hãy tạo lại toàn bộ nội dung.",
        ));
    }
    let result = library::run(
        app,
        "lesson-patch-assets",
        &[json!({
            "project": project,
            "itemIndex": payload.get("itemIndex").cloned().unwrap_or(Value::Null),
            "patch": patch
        })],
    )?;
    let Some(saved_input) = result.get("project").cloned() else {
        return Err(error("Không lưu được dự án sau khi đổi minh hoạ."));
    };
    let saved = library::run(app, "project:save-draft", &[saved_input])?;
    let mut result = result;
    if let Some(object) = result.as_object_mut() {
        object.insert("project".to_string(), saved);
    }
    Ok(result)
}

/// Cùng `Object.prototype.hasOwnProperty` của `applyItemAssetPatch`: có ít nhất
/// một trong ba khoá, kể cả khi giá trị là `null`.
fn asset_patch_changed(patch: &Value) -> bool {
    ["contentCategory", "iconName", "illustrationAssetId"]
        .iter()
        .any(|key| patch.get(*key).is_some())
}

/// Chạy `lesson:generate` trên luồng chặn riêng, như `analyze`.
pub async fn generate(app: AppHandle, payload: Option<Value>) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || generate_blocking(&app, payload.as_ref()))
        .await
        .map_err(|failure| format!("Lượt tạo nội dung bị dừng: {failure}"))?
}

fn generate_blocking(app: &AppHandle, payload: Option<&Value>) -> Result<Value, String> {
    let payload = payload.cloned().unwrap_or(Value::Null);
    let project_id = text_field(&payload, "projectId");
    let request_id = text_field(&payload, "requestId");
    if project_id.is_empty() {
        return Err(error("Thiếu mã dự án để tạo nội dung."));
    }
    let project = library::run(app, "project:get", &[json!(project_id)])?;
    if project.is_null() {
        return Err(error(
            "Không tìm thấy dự án. Hãy lưu dự án trước khi tạo nội dung.",
        ));
    }
    let config = project.get("config").cloned().unwrap_or(Value::Null);
    if config.is_null() {
        return Err(error(
            "Dự án chưa có cấu hình trò chơi. Hãy hoàn tất bước cấu hình.",
        ));
    }
    let analysis_id = text_field(&project, "analysisId");
    let draft_source = text_field(&project, "draftSource");
    let source_draft = project
        .get("draft")
        .filter(|draft| {
            draft.get("gameType").and_then(Value::as_str)
                == config.get("gameType").and_then(Value::as_str)
        })
        .cloned();
    // Chỉ hai nguồn do giáo viên soạn mới được đi nhánh không gọi AI; một bản
    // nháp AI bị mất `analysisId` không được lặng lẽ thành trò chơi hoàn chỉnh.
    let no_model_draft = source_draft.is_some()
        && (draft_source == "imported-questions" || draft_source == "chat-questions");
    if analysis_id.is_empty() && no_model_draft {
        let from_chat = draft_source == "chat-questions";
        let _ = app.emit(
            "lesson:progress",
            json!({ "requestId": request_id, "stage": "validate" }),
        );
        let result = library::run(
            app,
            "lesson-generation-offline",
            &[json!({
                "project": project,
                "sourceDraft": source_draft,
                "fromChat": from_chat
            })],
        )?;
        let Some(saved_input) = result.get("project").cloned() else {
            return Err(error("Không lưu được dự án sau khi chuyển đổi câu hỏi."));
        };
        let saved = library::run(app, "project:save-draft", &[saved_input])?;
        let _ = app.emit(
            "lesson:progress",
            json!({ "requestId": request_id, "stage": "ready" }),
        );
        let mut result = result;
        if let Some(object) = result.as_object_mut() {
            object.insert("project".to_string(), saved);
        }
        return Ok(result);
    }
    if payload.get("localOnly").and_then(Value::as_bool) == Some(true) {
        return Err(error(
            "[GENERATION_INVALID] Chưa có nội dung soạn sẵn hợp lệ để tạo trò chơi. Hãy kiểm tra lại câu hỏi.",
        ));
    }
    if analysis_id.is_empty() {
        return Err(error("Dự án chưa có kết quả phân tích giáo án."));
    }
    let analysis = get_analysis(app, &analysis_id)?;
    if analysis.is_null() {
        return Err(error(
            "Không tìm thấy kết quả phân tích giáo án. Hãy phân tích lại.",
        ));
    }
    let deep = text_field(&payload, "mode") == "deep"
        || text_field(&config, "generationMode") == "deep";
    let mode = if deep { "deep" } else { "fast" };
    let model_id = crate::ai_local::selected_model_id(app);
    let provider_id = payload
        .get("providerId")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty());
    let key_value = library::run(
        app,
        "lesson-generation-key",
        &[json!({
            "project": project,
            "analysis": analysis,
            "modelId": model_id,
            "mode": mode,
            "providerId": provider_id
        })],
    )?;
    let cache_key = key_value.as_str().unwrap_or("").to_string();
    let regenerate = payload
        .get("regenerate")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    if !regenerate && !cache_key.is_empty() {
        let entry = library::run(
            app,
            "lesson-store:generation-cache-get",
            &[json!(cache_key)],
        )?;
        if !entry.is_null() {
            let cached = library::run(
                app,
                "lesson-generation-cache",
                &[json!({
                    "project": project,
                    "analysis": analysis,
                    "payload": entry.get("payload").cloned().unwrap_or(Value::Null)
                })],
            );
            match cached {
                Ok(result) => {
                    let Some(saved_input) = result.get("project").cloned() else {
                        return Err(error("Không lưu được dự án từ bộ nhớ đệm."));
                    };
                    let saved = library::run(app, "project:save-draft", &[saved_input])?;
                    let _ = app.emit(
                        "lesson:progress",
                        json!({ "requestId": request_id, "stage": "cached" }),
                    );
                    let mut result = result;
                    if let Some(object) = result.as_object_mut() {
                        object.insert("project".to_string(), saved);
                    }
                    return Ok(result);
                }
                Err(_) => {
                    // Hàng cache do schema/adapter cũ phải bị bỏ, không được chặn
                    // lượt tạo mới.
                    let _ = library::run(
                        app,
                        "lesson-store:generation-cache-delete",
                        &[json!(cache_key)],
                    );
                }
            }
        }
    }

    // Đọc tài liệu trước khi chiếm khoá AI: lỗi đọc kho không được để lại khoá
    // đang giữ, vì lượt sau sẽ bị `[AI_BUSY]` mãi.
    let text = project_document_text(app, &project)?;
    let target = settings::workflow_provider(app, provider_id, false)?;
    let gate = app
        .try_state::<AiGate>()
        .ok_or_else(|| error("AI_CONFIG: hàng đợi AI chưa sẵn sàng. Hãy khởi động lại ứng dụng."))?;
    let label = format!("tạo nội dung {}", text_field(&config, "gameType"));
    let cancel = gate.begin(&request_id, &label)?;
    let ai = AiTarget {
        request_id: request_id.clone(),
        base_url: target.base_url.clone(),
        api_key: target.api_key.clone(),
        mode: target.mode.clone(),
        cancel,
    };
    let result = library::run_with_ai_progress(
        app,
        "lesson-generate",
        &[json!({
            "project": project,
            "analysis": analysis,
            "text": text,
            "mode": mode,
            "requestId": request_id,
            "target": {
                "requestId": request_id,
                "model": target.model,
                "mode": target.mode
            }
        })],
        ai,
        &request_id,
    );
    // Luôn nhả khoá, kể cả khi model lỗi hay giáo viên huỷ.
    gate.finish(&request_id);
    let result = result?;
    let Some(saved_input) = result.get("project").cloned() else {
        return Err(error("Không lưu được dự án sau khi tạo nội dung."));
    };
    let saved = library::run(app, "project:save-draft", &[saved_input])?;
    // Ghi cache là best-effort: giáo viên đã chờ model xong, một lỗi cache không
    // được biến lượt tạo thành thất bại.
    if !cache_key.is_empty() {
        if let Some(draft) = result.get("draft").cloned() {
            let _ = library::run(
                app,
                "lesson-store:generation-cache-put",
                &[json!({
                    "cacheKey": cache_key,
                    "kind": "draft",
                    "gameType": text_field(&config, "gameType"),
                    "analysisId": analysis_id,
                    "modelId": model_id,
                    "promptVersion": text_field(&result, "promptVersion"),
                    "payload": {
                        "draft": draft,
                        "mode": mode,
                        "context": result.get("context").cloned().unwrap_or(Value::Null)
                    }
                })],
            );
            let _ = library::run(app, "lesson-store:generation-cache-prune", &[json!(50)]);
        }
    }
    let _ = app.emit(
        "lesson:progress",
        json!({ "requestId": request_id, "stage": "ready" }),
    );
    let mut result = result;
    if let Some(object) = result.as_object_mut() {
        object.insert("project".to_string(), saved);
    }
    Ok(result)
}

/// `lesson:regenerate-item`: một model call cho mỗi mục, không dùng cache.
pub async fn regenerate_item(app: AppHandle, payload: Option<Value>) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || regenerate_blocking(&app, payload.as_ref()))
        .await
        .map_err(|failure| format!("Lượt tạo lại nội dung bị dừng: {failure}"))?
}

fn regenerate_blocking(app: &AppHandle, payload: Option<&Value>) -> Result<Value, String> {
    let payload = payload.cloned().unwrap_or(Value::Null);
    let project_id = text_field(&payload, "projectId");
    let request_id = text_field(&payload, "requestId");
    if project_id.is_empty() {
        return Err(error("Thiếu mã dự án để tạo lại nội dung."));
    }
    if request_id.is_empty() {
        return Err(error("Thiếu mã yêu cầu AI."));
    }
    let project = library::run(app, "project:get", &[json!(project_id)])?;
    if project.is_null() {
        return Err(error(
            "Không tìm thấy dự án. Hãy lưu dự án trước khi tạo lại nội dung.",
        ));
    }
    let config = project.get("config").cloned().unwrap_or(Value::Null);
    if config.is_null() {
        return Err(error(
            "Dự án chưa có cấu hình trò chơi. Hãy hoàn tất bước cấu hình.",
        ));
    }
    if project.get("draft").map(Value::is_null).unwrap_or(true) {
        return Err(error(
            "Dự án chưa có nội dung để tạo lại. Hãy tạo nội dung trước.",
        ));
    }
    let analysis_id = text_field(&project, "analysisId");
    if analysis_id.is_empty() {
        return Err(error("Dự án chưa có kết quả phân tích giáo án."));
    }
    let draft_type = project
        .pointer("/draft/gameType")
        .and_then(Value::as_str)
        .unwrap_or("");
    let config_type = config
        .get("gameType")
        .and_then(Value::as_str)
        .unwrap_or("");
    if draft_type != config_type {
        return Err(error(
            "[GENERATION_INVALID] Nội dung hiện tại không khớp thể loại đã chọn. Hãy tạo lại toàn bộ nội dung.",
        ));
    }
    let analysis = get_analysis(app, &analysis_id)?;
    if analysis.is_null() {
        return Err(error(
            "Không tìm thấy kết quả phân tích giáo án. Hãy phân tích lại.",
        ));
    }
    let deep = text_field(&config, "generationMode") == "deep";
    let mode = if deep { "deep" } else { "fast" };
    let provider_id = payload
        .get("providerId")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty());
    let text = project_document_text(app, &project)?;
    let target = settings::workflow_provider(app, provider_id, false)?;
    let gate = app
        .try_state::<AiGate>()
        .ok_or_else(|| error("AI_CONFIG: hàng đợi AI chưa sẵn sàng. Hãy khởi động lại ứng dụng."))?;
    let cancel = gate.begin(&request_id, "tạo lại một mục nội dung")?;
    let ai = AiTarget {
        request_id: request_id.clone(),
        base_url: target.base_url.clone(),
        api_key: target.api_key.clone(),
        mode: target.mode.clone(),
        cancel,
    };
    let result = library::run_with_ai_progress(
        app,
        "lesson-regenerate",
        &[json!({
            "project": project,
            "analysis": analysis,
            "text": text,
            "mode": mode,
            "itemIndex": payload.get("itemIndex").cloned().unwrap_or(Value::Null),
            "itemIndexes": payload.get("itemIndexes").cloned().unwrap_or(Value::Null),
            "requestId": request_id,
            "target": {
                "requestId": request_id,
                "model": target.model,
                "mode": target.mode
            }
        })],
        ai,
        &request_id,
    );
    gate.finish(&request_id);
    let result = result?;
    let Some(saved_input) = result.get("project").cloned() else {
        return Err(error("Không lưu được dự án sau khi tạo lại nội dung."));
    };
    let saved = library::run(app, "project:save-draft", &[saved_input])?;
    let mut result = result;
    if let Some(object) = result.as_object_mut() {
        object.insert("project".to_string(), saved);
    }
    Ok(result)
}

/// Đọc kết quả phân tích đang gắn với dự án; thiếu là `null` (chất lượng vẫn
/// chấm được, chỉ không có ngữ cảnh mục tiêu).
fn analysis_of_project(app: &AppHandle, project: &Value) -> Result<Value, String> {
    let analysis_id = text_field(project, "analysisId");
    if analysis_id.is_empty() {
        return Ok(Value::Null);
    }
    get_analysis(app, &analysis_id)
}

/// Văn bản giáo án của dự án; tài liệu đã bị xoá là chuỗi rỗng, đúng nhánh
/// `if (!document || !document.text)` của Electron.
fn project_document_text(app: &AppHandle, project: &Value) -> Result<String, String> {
    let document_id = project
        .pointer("/lesson/documentId")
        .and_then(Value::as_str)
        .unwrap_or("");
    if document_id.is_empty() {
        return Ok(String::new());
    }
    let document = get_document(app, document_id)?;
    if document.is_null() {
        return Ok(String::new());
    }
    Ok(text_field(&document, "text"))
}

// ---------------------------------------------------------------------------
// Huỷ
// ---------------------------------------------------------------------------

/// `ai:cancel`: trả `{ok}` đúng hình dạng `aiRequests.cancel` của Electron.
pub fn cancel(app: &AppHandle, request_id: &str) -> Result<Value, String> {
    let gate = app
        .try_state::<AiGate>()
        .ok_or_else(|| error("AI_CONFIG: hàng đợi AI chưa sẵn sàng. Hãy khởi động lại ứng dụng."))?;
    Ok(json!({ "ok": gate.cancel(request_id) }))
}

// ---------------------------------------------------------------------------
// Chat giáo án (#182)
// ---------------------------------------------------------------------------

pub fn list_chats(app: &AppHandle) -> Result<Value, String> {
    library::run(app, "lesson-store:list-chats", &[])
}

pub fn get_chat(app: &AppHandle, chat_id: &str) -> Result<Value, String> {
    library::run(app, "lesson-store:get-chat", &[json!(chat_id)])
}

pub fn delete_chats(app: &AppHandle, payload: Option<&Value>) -> Result<Value, String> {
    let ids = chat_ids_for_delete(payload);
    library::run(app, "lesson-store:delete-chats", &[json!(ids)])
}

fn chat_ids_for_delete(payload: Option<&Value>) -> Vec<String> {
    match payload {
        Some(Value::Array(list)) => list
            .iter()
            .filter_map(Value::as_str)
            .filter(|s| !s.trim().is_empty())
            .map(|s| s.trim().to_string())
            .collect(),
        Some(Value::String(id)) if !id.trim().is_empty() => vec![id.trim().to_string()],
        Some(val) if val.is_object() => val
            .get("chatIds")
            .and_then(Value::as_array)
            .map(|list| {
                list.iter()
                    .filter_map(Value::as_str)
                    .filter(|s| !s.trim().is_empty())
                    .map(|s| s.trim().to_string())
                    .collect()
            })
            .unwrap_or_default(),
        _ => Vec::new(),
    }
}

pub async fn send_chat(app: AppHandle, payload: Option<Value>) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || send_chat_blocking(&app, payload.as_ref()))
        .await
        .map_err(|failure| format!("Lượt hỏi giáo án bị dừng: {failure}"))?
}

fn send_chat_blocking(app: &AppHandle, payload: Option<&Value>) -> Result<Value, String> {
    let payload = payload.cloned().unwrap_or(Value::Null);
    let question = text_field(&payload, "question").trim().to_string();
    if question.len() < 3 {
        return Err(error("Câu hỏi quá ngắn."));
    }
    let request_id = {
        let req = text_field(&payload, "requestId");
        if req.is_empty() {
            let millis = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis())
                .unwrap_or(0);
            format!("chat-{millis}")
        } else {
            req
        }
    };
    let requested_chat_id = text_field(&payload, "chatId");

    let document_ids: Vec<String> = payload
        .get("documentIds")
        .and_then(Value::as_array)
        .map(|list| {
            let mut set = std::collections::BTreeSet::new();
            for item in list {
                if let Some(id) = item.as_str() {
                    let trimmed = id.trim();
                    if !trimmed.is_empty() {
                        set.insert(trimmed.to_string());
                    }
                }
            }
            set.into_iter().collect()
        })
        .unwrap_or_default();

    let mut documents = Vec::new();
    for doc_id in &document_ids {
        let doc = library::run(app, "lesson-store:get-document", &[json!(doc_id)])?;
        if !doc.is_null() {
            documents.push(json!({
                "id": doc.get("id").and_then(Value::as_str).unwrap_or(doc_id),
                "name": doc.get("name").and_then(Value::as_str).unwrap_or(""),
                "text": doc.get("text").and_then(Value::as_str).unwrap_or("")
            }));
        }
    }
    if !document_ids.is_empty() && documents.is_empty() {
        return Err(error(
            "Không đọc được giáo án nào trong số đã chọn. Hãy nhập lại tài liệu.",
        ));
    }

    let history = if requested_chat_id.is_empty() {
        Vec::new()
    } else {
        let chat = library::run(app, "lesson-store:get-chat", &[json!(requested_chat_id)])?;
        chat.get("messages")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default()
    };

    let provider_id = payload
        .get("providerId")
        .and_then(Value::as_str)
        .filter(|v| !v.trim().is_empty());

    let target = settings::workflow_provider(app, provider_id, false)?;

    let gate = app
        .try_state::<AiGate>()
        .ok_or_else(|| error("AI_CONFIG: hàng đợi AI chưa sẵn sàng. Hãy khởi động lại ứng dụng."))?;
    let label = "trả lời câu hỏi về giáo án".to_string();
    let cancel = gate.begin(&request_id, &label)?;

    let _ = app.emit(
        "lesson:progress",
        json!({ "requestId": request_id, "stage": "retrieve" }),
    );

    let ai = AiTarget {
        request_id: request_id.clone(),
        base_url: target.base_url.clone(),
        api_key: target.api_key.clone(),
        mode: target.mode.clone(),
        cancel,
    };

    let facts = crate::ai_local::local_facts(app);
    let local_on_gpu = facts.backend.as_deref() == Some("vulkan");
    let context_tokens = 8192;

    let turn_result = library::run_with_ai_progress(
        app,
        "lesson-chat",
        &[json!({
            "target": {
                "requestId": request_id,
                "model": target.model,
                "mode": target.mode,
            },
            "requestId": request_id,
            "question": question,
            "documents": documents,
            "history": history,
            "mode": payload.get("mode").cloned().unwrap_or(json!("auto")),
            "questionCount": payload.get("questionCount").cloned().unwrap_or(Value::Null),
            "localOnGpu": local_on_gpu,
            "contextTokens": context_tokens,
        })],
        ai,
        &request_id,
    );

    gate.finish(&request_id);
    let turn = turn_result?;

    let append_payload = json!({
        "chatId": requested_chat_id,
        "documentIds": document_ids,
        "question": question,
        "answer": turn.get("answer").cloned().unwrap_or(Value::Null),
        "intent": turn.get("intent").cloned().unwrap_or(Value::Null),
        "citations": turn.get("citations").cloned().unwrap_or_else(|| json!([])),
        "questionSet": turn.get("questionSet").cloned().unwrap_or(Value::Null),
        "providerId": turn.get("providerId").cloned().unwrap_or(Value::Null),
        "errorCode": turn.get("errorCode").cloned().unwrap_or(Value::Null),
        "evidence": turn.get("evidence").cloned().unwrap_or(Value::Null),
    });

    let chat = library::run(app, "lesson-store:append-chat-turn", &[append_payload])?;

    let _ = app.emit(
        "lesson:progress",
        json!({ "requestId": request_id, "stage": "ready" }),
    );

    let mut response = turn;
    if let Some(obj) = response.as_object_mut() {
        obj.insert("chat".to_string(), chat);
    }
    Ok(response)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn delete_documents_mirrors_the_main_process_limits() {
        let empty = document_ids_for_delete(Some(&json!([]))).unwrap_err();
        assert_eq!(empty, "Chưa chọn giáo án nào để xoá.");
        let null = document_ids_for_delete(None).unwrap_err();
        assert_eq!(null, "Chưa chọn giáo án nào để xoá.");
        // Phần tử không phải chuỗi hoặc rỗng bị bỏ, đúng bộ lọc của `main.ts`.
        let ids = document_ids_for_delete(Some(&json!(["a", 7, "", null, "b", "a"]))).unwrap();
        assert_eq!(ids, vec!["a".to_string(), "b".to_string(), "a".to_string()]);
        // Trần 200 tính TRƯỚC khi khử trùng, giống `main.ts`.
        let too_many: Vec<String> = (0..201).map(|index| format!("doc_{index}")).collect();
        let capped = document_ids_for_delete(Some(&json!(too_many))).unwrap_err();
        assert_eq!(capped, "Mỗi lần chỉ xoá tối đa 200 giáo án.");
        let allowed: Vec<String> = (0..200).map(|index| format!("doc_{index}")).collect();
        assert_eq!(
            document_ids_for_delete(Some(&json!(allowed))).unwrap().len(),
            200
        );
    }

    #[test]
    fn chat_ids_for_delete_accepts_single_array_and_object() {
        assert_eq!(chat_ids_for_delete(None), Vec::<String>::new());
        assert_eq!(
            chat_ids_for_delete(Some(&json!("chat_1"))),
            vec!["chat_1".to_string()]
        );
        assert_eq!(
            chat_ids_for_delete(Some(&json!(["chat_1", " ", "chat_2"]))),
            vec!["chat_1".to_string(), "chat_2".to_string()]
        );
        assert_eq!(
            chat_ids_for_delete(Some(&json!({ "chatIds": ["chat_3", ""] }))),
            vec!["chat_3".to_string()]
        );
    }
}
