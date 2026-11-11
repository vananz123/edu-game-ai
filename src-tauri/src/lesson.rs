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
// Huỷ
// ---------------------------------------------------------------------------

/// `ai:cancel`: trả `{ok}` đúng hình dạng `aiRequests.cancel` của Electron.
pub fn cancel(app: &AppHandle, request_id: &str) -> Result<Value, String> {
    let gate = app
        .try_state::<AiGate>()
        .ok_or_else(|| error("AI_CONFIG: hàng đợi AI chưa sẵn sàng. Hãy khởi động lại ứng dụng."))?;
    Ok(json!({ "ok": gate.cancel(request_id) }))
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
}
