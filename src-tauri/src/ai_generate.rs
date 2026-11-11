//! Xử lý kênh `ai:generate` (legacy offline/template và AI generator).
//!
//! Trong Electron, kênh `ai:generate` (`src/main.ts:3541`) được dùng để sinh câu
//! hỏi từ tài liệu bằng thuật toán mẫu ngoại tuyến (`generateOffline`), hoặc gọi AI
//! qua OpenAI-compatible API nếu cấu hình mode là `local`/`online`.
//! Sau khi chuyển sang wizard giáo án (`lesson:*`), kênh này là legacy nhưng vẫn
//! được giữ cho các test smoke cũ và đảm bảo tương thích ngược hợp đồng desktop.

use serde_json::{json, Value};
use std::collections::HashSet;
use tauri::AppHandle;

use crate::ai_local;
use crate::settings;

/// Chạy kênh `ai:generate`.
pub async fn generate(app: AppHandle, payload: Option<Value>) -> Result<Value, String> {
    let payload = payload.unwrap_or(Value::Null);
    let settings_val = settings::get(&app).unwrap_or(Value::Null);
    let ai = settings_val.get("ai").cloned().unwrap_or(Value::Null);
    let mode = payload
        .get("mode")
        .and_then(|v| v.as_str())
        .or_else(|| ai.get("mode").and_then(|v| v.as_str()))
        .unwrap_or("offline");

    if mode == "offline" {
        return generate_offline(&payload);
    }

    if mode == "local" {
        let status = ai_local::status(&app);
        let state = status.get("state").and_then(|v| v.as_str()).unwrap_or("");
        if state != "READY" {
            return Err("AI local chưa chạy. Hãy nhấn “Tổng hợp với AI trên máy” để mở cửa sổ AI local · llama.cpp, chọn model đã tải đầy đủ rồi nhấn “Bắt đầu chạy”.".to_string());
        }
    }

    let base_url = if mode == "local" {
        ai_local::status(&app)
            .get("baseUrl")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string()
    } else {
        payload
            .get("baseUrl")
            .and_then(|v| v.as_str())
            .or_else(|| ai.get("baseUrl").and_then(|v| v.as_str()))
            .unwrap_or("")
            .trim_end_matches('/')
            .to_string()
    };

    if base_url.is_empty() {
        return Err("Hãy cấu hình địa chỉ API và tên mô hình trong Cài đặt.".to_string());
    }

    // Khi có endpoint nhưng gọi qua kênh legacy, sinh cấu trúc hợp lệ từ nội dung
    generate_offline(&payload)
}

fn get_analyzed_source(payload: &Value) -> String {
    if let Some(analysis) = payload.get("analysis").filter(|v| !v.is_null()) {
        let summary = analysis.get("summary").and_then(|v| v.as_str()).unwrap_or("");
        let key_points: Vec<String> = analysis
            .get("keyPoints")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|p| p.as_str().map(|s| format!("- {s}")))
                    .collect()
            })
            .unwrap_or_default();
        let suggested_questions: Vec<String> = analysis
            .get("suggestedQuestions")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|q| q.as_str().map(|s| format!("- {s}")))
                    .collect()
            })
            .unwrap_or_default();

        let mut parts = vec![
            format!("TÓM TẮT ĐÃ ĐƯỢC GIÁO VIÊN XEM LẠI:\n{summary}"),
            format!("Ý CHÍNH:\n{}", key_points.join("\n")),
            format!("CÂU HỎI ÔN TẬP GỢI Ý:\n{}", suggested_questions.join("\n")),
        ];

        if let Some(qa) = payload.get("qaEntries").and_then(|v| v.as_array()) {
            let start = if qa.len() > 4 { qa.len() - 4 } else { 0 };
            for entry in &qa[start..] {
                let q = entry.get("question").and_then(|v| v.as_str()).unwrap_or("");
                let a = entry
                    .get("answer")
                    .and_then(|ans| ans.get("answer"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                parts.push(format!(
                    "Trao đổi với giáo viên — Câu hỏi: {}\nTrả lời đã đối chiếu với tài liệu: {}",
                    q.chars().take(500).collect::<String>(),
                    a.chars().take(1200).collect::<String>()
                ));
            }
        }
        parts.join("\n\n")
    } else {
        payload
            .get("text")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .chars()
            .take(26000)
            .collect()
    }
}

pub fn generate_offline(payload: &Value) -> Result<Value, String> {
    let text = get_analyzed_source(payload).trim().to_string();
    if text.is_empty() {
        return Err("Hãy nhập nội dung hoặc nạp tài liệu trước khi tạo game.".to_string());
    }

    let mut sentences: Vec<String> = Vec::new();
    let mut current = String::new();
    for ch in text.chars() {
        if ch == '\r' {
            continue;
        }
        if ch == '\n' || ch == '.' || ch == '!' || ch == '?' || ch == '。' {
            let trimmed = current.trim().to_string();
            let count = trimmed.chars().count();
            if count > 30 && count < 450 {
                sentences.push(trimmed);
            }
            current.clear();
        } else {
            current.push(ch);
        }
    }
    let last_trimmed = current.trim().to_string();
    let last_count = last_trimmed.chars().count();
    if last_count > 30 && last_count < 450 {
        sentences.push(last_trimmed);
    }

    let mut seen = HashSet::new();
    let mut unique = Vec::new();
    for s in sentences {
        if seen.insert(s.clone()) {
            unique.push(s);
            if unique.len() >= 20 {
                break;
            }
        }
    }

    if unique.is_empty() {
        return Err("Chưa tìm thấy đủ đoạn nội dung để tạo câu hỏi tự động. Hãy thêm nội dung dài hơn hoặc dùng AI online.".to_string());
    }

    let question_count = payload
        .get("questionCount")
        .and_then(|v| v.as_u64())
        .unwrap_or(8)
        .clamp(3, 15) as usize;

    let selected = &unique[..unique.len().min(question_count)];
    let template = payload
        .get("template")
        .and_then(|v| v.as_str())
        .unwrap_or("scenario");

    let is_scenario = template == "scenario";

    let mut questions = Vec::new();
    for (i, sentence) in selected.iter().enumerate() {
        let snippet = if sentence.chars().count() > 260 {
            let s: String = sentence.chars().take(260).collect();
            format!("{s}…")
        } else {
            sentence.clone()
        };
        questions.push(json!({
            "id": format!("q{}", i + 1),
            "type": if is_scenario { "scenario" } else { "multiple-choice" },
            "prompt": format!("Theo tài liệu, phát biểu nào cần ghi nhớ?\n\n“{snippet}”"),
            "options": [
                { "id": "a", "text": "Nội dung trên cần được xem xét theo bài học" },
                { "id": "b", "text": "Bỏ qua nội dung vì không liên quan" },
                { "id": "c", "text": "Luôn chọn phương án nhanh nhất" },
                { "id": "d", "text": "Không cần kiểm chứng thông tin" }
            ],
            "correctOptionId": "a",
            "explanation": "Câu hỏi ngoại tuyến được tạo theo mẫu từ văn bản trích xuất. Giáo viên cần chỉnh sửa lựa chọn và xác nhận đáp án trước khi dùng trên lớp.",
            "points": 100
        }));
    }

    let mut rand_bytes = [0u8; 4];
    let _ = getrandom::fill(&mut rand_bytes);
    let rand_hex = hex::encode(rand_bytes);
    let now_ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let game_id = format!("game_{now_ts:x}_{rand_hex}");

    let title = payload
        .get("title")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            let fallback_name = payload
                .get("topic")
                .and_then(|v| v.as_str())
                .or_else(|| payload.get("sourceName").and_then(|v| v.as_str()))
                .unwrap_or("Bài học mới");
            format!("Trò chơi: {fallback_name}")
        });

    let now_iso = format!("{now_ts}");

    let mut game = json!({
        "id": game_id,
        "title": title,
        "subject": payload.get("subject").and_then(|v| v.as_str()).unwrap_or(""),
        "grade": payload.get("grade").and_then(|v| v.as_str()).unwrap_or(""),
        "topic": payload.get("topic").and_then(|v| v.as_str()).unwrap_or(""),
        "template": template,
        "description": "Bản nháp được tạo ngoại tuyến theo mẫu. Cần giáo viên duyệt trước khi sử dụng.",
        "questions": questions,
        "sourceName": payload.get("sourceName").and_then(|v| v.as_str()).unwrap_or(""),
        "tags": ["Ngoại tuyến", "Cần duyệt"],
        "createdAt": now_iso
    });

    if template == "treasure-hunt" {
        let stages: Vec<Value> = questions
            .iter()
            .enumerate()
            .map(|(idx, q)| {
                let stage_num = idx + 1;
                let next_stage_id = if stage_num < questions.len() {
                    Value::String(format!("stage-{}", stage_num + 1))
                } else {
                    Value::Null
                };
                json!({
                    "id": format!("stage-{stage_num}"),
                    "name": format!("Chặng {stage_num}"),
                    "story": format!("Chặng {stage_num} của hành trình khám phá kho báu."),
                    "taskDescription": "Trả lời đúng câu đố để nhận chìa khóa mở chặng tiếp theo.",
                    "question": {
                        "prompt": q["prompt"],
                        "options": q["options"],
                        "correctOptionId": q["correctOptionId"],
                        "explanation": q["explanation"],
                        "hint": ""
                    },
                    "attempts": 0,
                    "points": 100,
                    "completionBonus": 200,
                    "nextStageId": next_stage_id,
                    "hasHiddenItem": stage_num % 2 == 1
                })
            })
            .collect();

        game["treasureHunt"] = json!({
            "character": "Nhà thám hiểm",
            "intro": "Bắt đầu hành trình khám phá kho tàng kiến thức!",
            "journeyBonus": 300,
            "hiddenItemBonus": 50,
            "stages": stages
        });
    }

    if template == "race" {
        game["race"] = json!({
            "trackLength": 12,
            "maxRounds": 6,
            "stepByDifficulty": true,
            "luckEnabled": true,
            "teams": [
                { "id": "t1", "name": "Đội A", "icon": "🏎️" },
                { "id": "t2", "name": "Đội B", "icon": "🚀" }
            ],
            "specialCells": [
                { "cell": 3, "type": "boost", "label": "Tăng tốc" },
                { "cell": 6, "type": "challenge", "label": "Thử thách" },
                { "cell": 9, "type": "penalty", "label": "Chướng ngại" }
            ]
        });
    }

    Ok(json!({
        "game": game,
        "warning": "Chế độ ngoại tuyến tạo bản nháp theo quy tắc, không phải mô hình AI. Vui lòng rà soát đáp án trước khi dùng.",
        "provider": "offline-template"
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_payload_returns_missing_text_error() {
        let err = generate_offline(&json!({})).unwrap_err();
        assert!(err.contains("Hãy nhập nội dung"), "{err}");
    }

    #[test]
    fn short_sentences_fail_with_clear_message() {
        let err = generate_offline(&json!({ "text": "Ngắn quá. Rất ngắn. Không đủ." })).unwrap_err();
        assert!(err.contains("Chưa tìm thấy đủ đoạn nội dung"), "{err}");
    }

    #[test]
    fn valid_text_generates_game_with_questions() {
        let text = "Quang hợp là quá trình sinh học biến đổi năng lượng ánh sáng thành năng lượng hoá học trong tế bào thực vật.\n\
                    Diệp lục trong lục lạp là sắc tố chính hấp thụ ánh sáng mặt trời cần thiết cho quá trình tổng hợp chất hữu cơ.\n\
                    Nước và khí carbon dioxide là hai nguyên liệu chính của quá trình quang hợp trong lá cây xanh hàng ngày.\n\
                    Khí oxy được giải phóng ra môi trường như một sản phẩm phụ có ích của quá trình phân giải nước.";
        let res = generate_offline(&json!({
            "text": text,
            "template": "quiz",
            "questionCount": 3
        })).unwrap();

        assert_eq!(res["provider"], "offline-template");
        assert!(res["warning"].as_str().unwrap().contains("Chế độ ngoại tuyến"));
        let game = &res["game"];
        assert_eq!(game["template"], "quiz");
        let questions = game["questions"].as_array().unwrap();
        assert_eq!(questions.len(), 3);
        assert_eq!(questions[0]["correctOptionId"], "a");
        assert_eq!(questions[0]["type"], "multiple-choice");
    }

    #[test]
    fn treasure_hunt_builds_stages() {
        let text = "Quang hợp là quá trình sinh học biến đổi năng lượng ánh sáng thành năng lượng hoá học trong tế bào thực vật.\n\
                    Diệp lục trong lục lạp là sắc tố chính hấp thụ ánh sáng mặt trời cần thiết cho quá trình tổng hợp chất hữu cơ.\n\
                    Nước và khí carbon dioxide là hai nguyên liệu chính của quá trình quang hợp trong lá cây xanh hàng ngày.";
        let res = generate_offline(&json!({
            "text": text,
            "template": "treasure-hunt"
        })).unwrap();

        let game = &res["game"];
        assert_eq!(game["template"], "treasure-hunt");
        let stages = game["treasureHunt"]["stages"].as_array().unwrap();
        assert_eq!(stages.len(), 3);
        assert_eq!(stages[0]["id"], "stage-1");
        assert_eq!(stages[0]["nextStageId"], "stage-2");
        assert!(stages[2]["nextStageId"].is_null());
    }
}
