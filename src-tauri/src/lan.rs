//! Phòng chơi mạng nội bộ (LAN Classroom Mode: giáo viên trên PC, học sinh trên điện thoại).
//!
//! Kênh IPC: `lan:start`, `lan:stop`, `lan:assign-team`, `lan:begin`, `lan:next`, `lan:finish`.
//! Sự kiện phát: `lan:state` (đẩy `LanSnapshot` sang renderer máy tính).
//! Máy chủ HTTP + WebSocket phục vụ điện thoại học sinh qua Wi-Fi lớp:
//!   - `GET /`            trang web học sinh (nhúng từ `src/lan/mobile/index.html`)
//!   - `GET /mobile.css`  CSS trang điện thoại
//!   - `GET /mobile.js`   JS điều khiển trang điện thoại
//!   - `GET /health`      `{"ok": true}`
//!   - `POST /join`       xác thực mã phòng trước khi mở WebSocket
//!   - `GET /ws`          WebSocket kênh hai chiều cho học sinh (`lan:join`, `lan:answer`, `lan:state`)

use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{broadcast, mpsc, Mutex};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

use crate::base64;

const HTML: &str = include_str!("../../src/lan/mobile/index.html");
const CSS: &str = include_str!("../../src/lan/mobile/mobile.css");
const JS: &str = include_str!("../../src/lan/mobile/mobile.js");

const ROOM_ALPHABET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_CODE_LEN: usize = 6;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanTeam {
    pub id: String,
    pub name: String,
    pub icon: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanPlayerSummary {
    pub id: String,
    pub name: String,
    pub team_id: String,
    pub connected: bool,
    pub points: i64,
    pub correct: usize,
    pub answered: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanPlayerRoundResult {
    pub id: String,
    pub name: String,
    pub team_id: String,
    pub score: i64,
    pub correct: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanRoundResult {
    pub label: String,
    pub prompt: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub correct_option_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub correct_answer: Option<String>,
    pub max_points: i64,
    pub answered: usize,
    pub correct_count: usize,
    pub per_player: Vec<LanPlayerRoundResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanScore {
    pub points: i64,
    pub max: i64,
    pub percent: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanOptionItem {
    pub id: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum LanPhoneInput {
    #[serde(rename = "options")]
    Options { options: Vec<LanOptionItem> },
    #[serde(rename = "text")]
    Text { placeholder: String },
    #[serde(rename = "unsupported")]
    Unsupported { reason: String },
}

#[derive(Debug, Clone)]
pub struct LanInternalRound {
    pub label: String,
    pub prompt: String,
    pub input: LanPhoneInput,
    pub max_points: i64,
    pub correct_option_id: Option<String>,
    pub correct_answer: Option<String>,
    pub alternate_answers: Vec<String>,
    pub options: Vec<LanOptionItem>,
}

#[derive(Debug, Clone)]
pub struct LanInternalPlayer {
    pub id: String,
    pub token: String,
    pub name: String,
    pub team_id: String,
    pub connected: bool,
    pub points: i64,
    pub correct: usize,
    pub answered: usize,
}

#[derive(Debug, Clone)]
pub struct LanInternalAnswer {
    pub option_id: Option<String>,
    pub answer_text: String,
    pub correct: bool,
    pub points: i64,
}

pub struct LanSessionState {
    pub phase: String, // "lobby" | "question" | "reveal" | "finished"
    pub room_code: String,
    pub urls: Vec<String>,
    pub engine: String, // "quiz" | "treasure"
    pub game_id: String,
    pub game_title: String,
    pub teams: Vec<LanTeam>,
    pub team_locked: bool,
    pub round_index: usize,
    pub round_count: usize,
    pub current_round_index: usize,
    pub last_round: i64,
    pub scoring_mode: String,
    pub scoring_note: String,
    pub input: Option<LanPhoneInput>,
    pub prompt: String,
    pub kicker: String,
    pub players: Vec<LanInternalPlayer>,
    pub answered_count: usize,
    pub last_result: Option<LanRoundResult>,
    pub score: LanScore,
    pub error: Option<String>,
    pub rounds_data: Vec<LanInternalRound>,
    pub answers: HashMap<usize, HashMap<String, LanInternalAnswer>>, // round_idx -> (player_id -> answer)
}

impl LanSessionState {
    pub fn build_snapshot(&self) -> Value {
        let players_summary: Vec<LanPlayerSummary> = self
            .players
            .iter()
            .map(|p| LanPlayerSummary {
                id: p.id.clone(),
                name: p.name.clone(),
                team_id: p.team_id.clone(),
                connected: p.connected,
                points: p.points,
                correct: p.correct,
                answered: p.answered,
            })
            .collect();

        json!({
            "state": self.phase,
            "roomCode": self.room_code,
            "urls": self.urls,
            "engine": self.engine,
            "gameId": self.game_id,
            "gameTitle": self.game_title,
            "teams": self.teams,
            "teamLocked": self.team_locked,
            "roundIndex": if self.phase == "lobby" { 0 } else { self.round_index },
            "roundCount": self.round_count,
            "currentRoundIndex": self.current_round_index,
            "lastRound": self.last_round,
            "scoringMode": self.scoring_mode,
            "scoringNote": self.scoring_note,
            "input": if self.phase == "question" { serde_json::to_value(&self.input).unwrap_or(Value::Null) } else { Value::Null },
            "prompt": if self.phase == "question" { &self.prompt } else { "" },
            "kicker": if self.phase == "question" { &self.kicker } else { "" },
            "players": players_summary,
            "answeredCount": self.answered_count,
            "lastResult": self.last_result,
            "score": self.score,
            "error": self.error
        })
    }

    pub fn phone_snapshot(&self, player_id: &str) -> Value {
        let open = self.phase == "question";
        let last = self.last_result.as_ref();
        let per_player: Vec<LanPlayerRoundResult> = last
            .map(|l| {
                l.per_player
                    .iter()
                    .filter(|p| p.id == player_id)
                    .cloned()
                    .collect()
            })
            .unwrap_or_default();

        let phone_last_result = if open || last.is_none() {
            Value::Null
        } else {
            let l = last.unwrap();
            json!({
                "label": l.label,
                "prompt": l.prompt,
                "maxPoints": l.max_points,
                "answered": l.answered,
                "correctCount": l.correct_count,
                "perPlayer": per_player,
            })
        };

        json!({
            "state": self.phase,
            "engine": self.engine,
            "gameTitle": self.game_title,
            "roundIndex": if self.phase == "lobby" { 0 } else { self.round_index },
            "roundCount": self.round_count,
            "currentRoundIndex": self.current_round_index,
            "kicker": if self.phase == "question" { &self.kicker } else { "" },
            "prompt": if self.phase == "question" { &self.prompt } else { "" },
            "input": if self.phase == "question" { serde_json::to_value(&self.input).unwrap_or(Value::Null) } else { Value::Null },
            "teams": self.teams,
            "teamLocked": self.team_locked,
            "lastResult": phone_last_result,
        })
    }
}

pub struct ActiveLanHandle {
    pub room_code: String,
    pub port: u16,
    pub urls: Vec<String>,
    pub state: Arc<Mutex<LanSessionState>>,
    pub shutdown_tx: broadcast::Sender<()>,
    pub client_senders: Arc<Mutex<HashMap<usize, (mpsc::UnboundedSender<String>, Option<String>)>>>, // conn_id -> (sender, player_id)
}

static ACTIVE_HANDLE: Mutex<Option<ActiveLanHandle>> = Mutex::const_new(None);
static NEXT_CONN_ID: AtomicUsize = AtomicUsize::new(1);

/// Danh sách địa chỉ IPv4 riêng trong mạng LAN (192.168.x.x, 10.x.x.x, 172.16-31.x.x).
pub fn lan_addresses() -> Vec<String> {
    let mut found = Vec::new();
    if let Ok(socket) = std::net::UdpSocket::bind("0.0.0.0:0") {
        if socket.connect("8.8.8.8:80").is_ok() {
            if let Ok(addr) = socket.local_addr() {
                let ip = addr.ip().to_string();
                if ip != "0.0.0.0" && ip != "127.0.0.1" {
                    found.push(ip);
                }
            }
        }
    }
    if found.is_empty() {
        found.push("127.0.0.1".to_string());
    }
    found
}

fn random_room_code() -> String {
    let mut bytes = [0u8; ROOM_CODE_LEN];
    let _ = getrandom::fill(&mut bytes);
    let mut code = String::with_capacity(ROOM_CODE_LEN);
    for b in bytes {
        code.push(ROOM_ALPHABET[(b as usize) % ROOM_ALPHABET.len()] as char);
    }
    code
}

fn random_hex(bytes_count: usize) -> String {
    let mut buf = vec![0u8; bytes_count];
    let _ = getrandom::fill(&mut buf);
    hex::encode(buf)
}

pub struct LanProfile {
    pub supported: bool,
    pub engine: String,
    pub reason: String,
}

pub fn lan_profile_for(game: &Value) -> LanProfile {
    let template = game.get("template").and_then(|v| v.as_str()).unwrap_or("");
    if template == "quiz" || template == "scenario" {
        return LanProfile {
            supported: true,
            engine: "quiz".to_string(),
            reason: String::new(),
        };
    }
    if template == "treasure-hunt" {
        let stages = game
            .get("treasureHunt")
            .and_then(|th| th.get("stages"))
            .and_then(|s| s.as_array());
        let has_playable = stages.map_or(false, |st| {
            st.iter().any(|s| {
                let m_type = s.get("missionType").and_then(|v| v.as_str()).unwrap_or("multiple-choice");
                m_type == "multiple-choice" || m_type == "scenario"
            })
        });
        if has_playable || stages.map_or(true, |st| !st.is_empty()) {
            return LanProfile {
                supported: true,
                engine: "treasure".to_string(),
                reason: String::new(),
            };
        }
    }
    LanProfile {
        supported: false,
        engine: String::new(),
        reason: "Trò chơi này chưa hỗ trợ chơi LAN.".to_string(),
    }
}

fn extract_rounds(game: &Value) -> Vec<LanInternalRound> {
    let template = game.get("template").and_then(|v| v.as_str()).unwrap_or("");
    let mut rounds = Vec::new();

    if template == "treasure-hunt" {
        if let Some(stages) = game.get("treasureHunt").and_then(|th| th.get("stages")).and_then(|v| v.as_array()) {
            for (idx, stage) in stages.iter().enumerate() {
                let name = stage.get("name").and_then(|v| v.as_str()).unwrap_or("");
                let label = if name.is_empty() { format!("Chặng {}", idx + 1) } else { name.to_string() };
                let q = stage.get("question").unwrap_or(&Value::Null);
                let prompt = q.get("prompt").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let correct_option_id = q.get("correctOptionId").and_then(|v| v.as_str()).map(|s| s.to_string());
                let correct_answer = q.get("correctAnswer").and_then(|v| v.as_str()).map(|s| s.to_string());

                let mut options = Vec::new();
                if let Some(opts) = q.get("options").and_then(|v| v.as_array()) {
                    for opt in opts {
                        let id = opt.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
                        let text = opt.get("text").and_then(|v| v.as_str()).unwrap_or("").to_string();
                        options.push(LanOptionItem { id, text });
                    }
                }

                let points = stage.get("points").and_then(|v| v.as_i64()).unwrap_or(100)
                    + stage.get("completionBonus").and_then(|v| v.as_i64()).unwrap_or(200);

                let input = if !options.is_empty() {
                    LanPhoneInput::Options { options: options.clone() }
                } else if correct_answer.is_some() {
                    LanPhoneInput::Text { placeholder: "Nhập câu trả lời".to_string() }
                } else {
                    LanPhoneInput::Unsupported { reason: "Chặng chưa hỗ trợ điện thoại".to_string() }
                };

                rounds.push(LanInternalRound {
                    label,
                    prompt,
                    input,
                    max_points: points,
                    correct_option_id,
                    correct_answer,
                    alternate_answers: Vec::new(),
                    options,
                });
            }
        }
    } else if let Some(questions) = game.get("questions").and_then(|v| v.as_array()) {
        for (idx, q) in questions.iter().enumerate() {
            let label = format!("Câu {}", idx + 1);
            let prompt = q.get("prompt").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let correct_option_id = q.get("correctOptionId").and_then(|v| v.as_str()).map(|s| s.to_string());
            let correct_answer = q.get("correctAnswer").and_then(|v| v.as_str()).map(|s| s.to_string());
            let mut alternate_answers = Vec::new();
            if let Some(alts) = q.get("alternateAnswers").and_then(|v| v.as_array()) {
                for alt in alts {
                    if let Some(s) = alt.as_str() {
                        alternate_answers.push(s.to_string());
                    }
                }
            }

            let mut options = Vec::new();
            if let Some(opts) = q.get("options").and_then(|v| v.as_array()) {
                for opt in opts {
                    let id = opt.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let text = opt.get("text").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    options.push(LanOptionItem { id, text });
                }
            }

            let points = q.get("points").and_then(|v| v.as_i64()).unwrap_or(100);
            let q_type = q.get("type").and_then(|v| v.as_str()).unwrap_or("multiple-choice");

            let input = if q_type == "fill-in-blank" || q_type == "short-answer" {
                LanPhoneInput::Text { placeholder: "Nhập câu trả lời".to_string() }
            } else if !options.is_empty() {
                LanPhoneInput::Options { options: options.clone() }
            } else {
                LanPhoneInput::Unsupported { reason: "Câu hỏi chưa hỗ trợ".to_string() }
            };

            rounds.push(LanInternalRound {
                label,
                prompt,
                input,
                max_points: points,
                correct_option_id,
                correct_answer,
                alternate_answers,
                options,
            });
        }
    }

    rounds
}

/// Bắt đầu phòng LAN.
pub async fn start(app: AppHandle, payload: Option<Value>) -> Result<Value, String> {
    let payload = payload.unwrap_or(Value::Null);
    let game = payload.get("game").filter(|v| !v.is_null());
    let Some(game) = game else {
        return Ok(json!({
            "ok": false,
            "status": "no-game",
            "message": "Chưa có trò chơi để mở LAN."
        }));
    };

    let profile = lan_profile_for(game);
    if !profile.supported {
        return Ok(json!({
            "ok": false,
            "status": "unsupported",
            "message": if profile.reason.is_empty() { "Trò chơi này chưa hỗ trợ chơi LAN." } else { &profile.reason }
        }));
    }

    let mut guard = ACTIVE_HANDLE.lock().await;
    if guard.is_some() {
        return Ok(json!({
            "ok": false,
            "status": "already-running",
            "message": "Một phòng LAN đang chạy. Hãy đóng phòng cũ trước khi mở phòng mới."
        }));
    }

    let listener = match TcpListener::bind("0.0.0.0:0").await {
        Ok(l) => l,
        Err(err) => {
            return Ok(json!({
                "ok": false,
                "status": "bind-failed",
                "message": format!("Không mở được cổng mạng: {err}. Kiểm tra kết nối Wi-Fi/LAN của máy giáo viên.")
            }));
        }
    };

    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let addrs = lan_addresses();
    let room_code = random_room_code();
    let urls: Vec<String> = addrs
        .iter()
        .map(|ip| format!("http://{ip}:{port}/?room={room_code}"))
        .collect();

    let rounds = extract_rounds(game);
    let round_count = rounds.len();
    let max_score = rounds.iter().map(|r| r.max_points).sum();

    let default_teams = vec![
        LanTeam { id: "t1".to_string(), name: "Đội Đỏ".to_string(), icon: "🔴".to_string() },
        LanTeam { id: "t2".to_string(), name: "Đội Xanh".to_string(), icon: "🔵".to_string() },
        LanTeam { id: "t3".to_string(), name: "Đội Vàng".to_string(), icon: "🟡".to_string() },
        LanTeam { id: "t4".to_string(), name: "Đội Tím".to_string(), icon: "🟣".to_string() },
    ];

    let game_id = game.get("id").and_then(|v| v.as_str()).unwrap_or("game").to_string();
    let game_title = game.get("title").and_then(|v| v.as_str()).unwrap_or("Trò chơi").to_string();

    let initial_state = LanSessionState {
        phase: "lobby".to_string(),
        room_code: room_code.clone(),
        urls: urls.clone(),
        engine: profile.engine,
        game_id,
        game_title,
        teams: default_teams,
        team_locked: false,
        round_index: 0,
        round_count,
        current_round_index: 0,
        last_round: -1,
        scoring_mode: "cơ bản".to_string(),
        scoring_note: String::new(),
        input: None,
        prompt: String::new(),
        kicker: String::new(),
        players: Vec::new(),
        answered_count: 0,
        last_result: None,
        score: LanScore { points: 0, max: max_score, percent: 0 },
        error: None,
        rounds_data: rounds,
        answers: HashMap::new(),
    };

    let snapshot = initial_state.build_snapshot();
    let (shutdown_tx, _) = broadcast::channel(1);
    let state_arc = Arc::new(Mutex::new(initial_state));
    let client_senders_arc: Arc<Mutex<HashMap<usize, (mpsc::UnboundedSender<String>, Option<String>)>>> =
        Arc::new(Mutex::new(HashMap::new()));

    *guard = Some(ActiveLanHandle {
        room_code: room_code.clone(),
        port,
        urls,
        state: Arc::clone(&state_arc),
        shutdown_tx: shutdown_tx.clone(),
        client_senders: Arc::clone(&client_senders_arc),
    });

    // Phát sự kiện cập nhật trạng thái ban đầu sang renderer
    let _ = app.emit("lan:state", &snapshot);

    // Chạy loop phục vụ HTTP + WebSocket nền
    let app_handle = app.clone();
    let shutdown_rx = shutdown_tx.subscribe();
    let room_code_for_server = room_code.clone();

    tokio::spawn(async move {
        run_server(
            listener,
            app_handle,
            state_arc,
            client_senders_arc,
            room_code_for_server,
            shutdown_rx,
        )
        .await;
    });

    Ok(json!({
        "ok": true,
        "snapshot": snapshot
    }))
}

/// Dừng phòng LAN.
pub async fn stop(app: AppHandle) -> Result<Value, String> {
    let mut guard = ACTIVE_HANDLE.lock().await;
    if let Some(active) = guard.take() {
        let _ = active.shutdown_tx.send(());
        let _ = app.emit("lan:state", &Value::Null);
    }
    Ok(json!({ "ok": true }))
}

/// Gán đội cho người chơi.
pub async fn assign_team(app: AppHandle, payload: Option<Value>) -> Result<Value, String> {
    let payload = payload.unwrap_or(Value::Null);
    let player_id = payload.get("playerId").and_then(|v| v.as_str()).unwrap_or("");
    let team_id = payload.get("teamId").and_then(|v| v.as_str()).unwrap_or("");

    let guard = ACTIVE_HANDLE.lock().await;
    let Some(active) = guard.as_ref() else {
        return Ok(json!({
            "ok": false,
            "status": "not-open",
            "message": "Phòng LAN chưa mở."
        }));
    };

    let mut st = active.state.lock().await;
    if st.team_locked {
        return Ok(json!({
            "ok": false,
            "status": "refused",
            "message": "Không thể đổi đội sau khi đã bắt đầu.",
            "snapshot": st.build_snapshot()
        }));
    }

    if let Some(p) = st.players.iter_mut().find(|p| p.id == player_id) {
        p.team_id = team_id.to_string();
    }

    let snapshot = st.build_snapshot();
    drop(st);

    let _ = app.emit("lan:state", &snapshot);
    broadcast_phone_snapshots(active).await;

    Ok(json!({
        "ok": true,
        "status": "ok",
        "message": "",
        "snapshot": snapshot
    }))
}

/// Bắt đầu câu hỏi đầu tiên.
pub async fn begin(app: AppHandle) -> Result<Value, String> {
    let guard = ACTIVE_HANDLE.lock().await;
    let Some(active) = guard.as_ref() else {
        return Ok(json!({
            "ok": false,
            "status": "not-open",
            "message": "Phòng LAN chưa mở."
        }));
    };

    let mut st = active.state.lock().await;
    st.phase = "question".to_string();
    st.team_locked = true;
    st.round_index = 1;
    st.current_round_index = 0;
    st.answered_count = 0;

    if let Some(r) = st.rounds_data.get(0).cloned() {
        st.input = Some(r.input);
        st.prompt = r.prompt;
        st.kicker = r.label;
    }

    let snapshot = st.build_snapshot();
    drop(st);

    let _ = app.emit("lan:state", &snapshot);
    broadcast_phone_snapshots(active).await;

    Ok(json!({
        "ok": true,
        "status": "ok",
        "message": "",
        "snapshot": snapshot
    }))
}

/// Chốt câu hỏi hiện tại và chuyển sang câu tiếp theo.
pub async fn next(app: AppHandle) -> Result<Value, String> {
    let guard = ACTIVE_HANDLE.lock().await;
    let Some(active) = guard.as_ref() else {
        return Ok(json!({
            "ok": false,
            "status": "not-open",
            "message": "Phòng LAN chưa mở."
        }));
    };

    let mut st = active.state.lock().await;
    let cur_idx = st.current_round_index;

    // Chốt kết quả vòng hiện tại
    if let Some(cur_round) = st.rounds_data.get(cur_idx) {
        let round_answers = st.answers.get(&cur_idx).cloned().unwrap_or_default();
        let mut per_player = Vec::new();
        let mut correct_count = 0;

        for p in &st.players {
            let ans = round_answers.get(&p.id);
            let is_corr = ans.map_or(false, |a| a.correct);
            let score = ans.map_or(0, |a| a.points);
            if is_corr {
                correct_count += 1;
            }
            per_player.push(LanPlayerRoundResult {
                id: p.id.clone(),
                name: p.name.clone(),
                team_id: p.team_id.clone(),
                score,
                correct: is_corr,
            });
        }

        st.last_result = Some(LanRoundResult {
            label: cur_round.label.clone(),
            prompt: cur_round.prompt.clone(),
            correct_option_id: cur_round.correct_option_id.clone(),
            correct_answer: cur_round.correct_answer.clone(),
            max_points: cur_round.max_points,
            answered: round_answers.len(),
            correct_count,
            per_player,
        });
        st.last_round = cur_idx as i64;
    }

    if cur_idx + 1 < st.round_count {
        st.current_round_index = cur_idx + 1;
        st.round_index = cur_idx + 2;
        st.answered_count = 0;
        st.phase = "question".to_string();
        if let Some(r) = st.rounds_data.get(st.current_round_index).cloned() {
            st.input = Some(r.input);
            st.prompt = r.prompt;
            st.kicker = r.label;
        }
    } else {
        st.phase = "finished".to_string();
        st.input = None;
    }

    let top_points = st.players.iter().map(|p| p.points).max().unwrap_or(0);
    let max = st.score.max;
    st.score.points = top_points;
    st.score.percent = if max > 0 { (top_points * 100) / max } else { 0 };

    let snapshot = st.build_snapshot();
    drop(st);

    let _ = app.emit("lan:state", &snapshot);
    broadcast_phone_snapshots(active).await;

    Ok(json!({
        "ok": true,
        "status": "ok",
        "message": "",
        "snapshot": snapshot
    }))
}

/// Kết thúc phiên chơi, tính bảng xếp hạng.
pub async fn finish(app: AppHandle) -> Result<Value, String> {
    let guard = ACTIVE_HANDLE.lock().await;
    let Some(active) = guard.as_ref() else {
        return Ok(json!({
            "ok": false,
            "status": "not-open",
            "message": "Phòng LAN chưa mở."
        }));
    };

    let mut st = active.state.lock().await;
    st.phase = "finished".to_string();
    st.input = None;

    let top_points = st.players.iter().map(|p| p.points).max().unwrap_or(0);
    let max = st.score.max;
    st.score.points = top_points;
    st.score.percent = if max > 0 { (top_points * 100) / max } else { 0 };

    let snapshot = st.build_snapshot();
    drop(st);

    let _ = app.emit("lan:state", &snapshot);
    broadcast_phone_snapshots(active).await;

    Ok(json!({
        "ok": true,
        "status": "ok",
        "message": "",
        "snapshot": snapshot
    }))
}

async fn broadcast_phone_snapshots(active: &ActiveLanHandle) {
    let st = active.state.lock().await;
    let senders = active.client_senders.lock().await;
    for (_conn_id, (tx, player_id)) in senders.iter() {
        if let Some(pid) = player_id {
            let snap = st.phone_snapshot(pid);
            let msg = json!({ "event": "lan:state", "payload": snap }).to_string();
            let _ = tx.send(msg);
        }
    }
}

// ── HTTP + RFC 6455 WebSocket Server ──────────────────────────────────────────

async fn run_server(
    listener: TcpListener,
    app: AppHandle,
    state: Arc<Mutex<LanSessionState>>,
    client_senders: Arc<Mutex<HashMap<usize, (mpsc::UnboundedSender<String>, Option<String>)>>>,
    room_code: String,
    mut shutdown: broadcast::Receiver<()>,
) {
    loop {
        tokio::select! {
            accept_res = listener.accept() => {
                let (stream, _) = match accept_res {
                    Ok(pair) => pair,
                    Err(_) => break,
                };
                let app = app.clone();
                let state = Arc::clone(&state);
                let client_senders = Arc::clone(&client_senders);
                let room_code = room_code.clone();
                tokio::spawn(async move {
                    handle_connection(stream, app, state, client_senders, room_code).await;
                });
            }
            _ = shutdown.recv() => {
                break;
            }
        }
    }
}

async fn handle_connection(
    mut stream: TcpStream,
    app: AppHandle,
    state: Arc<Mutex<LanSessionState>>,
    client_senders: Arc<Mutex<HashMap<usize, (mpsc::UnboundedSender<String>, Option<String>)>>>,
    room_code: String,
) {
    let mut buf = [0u8; 4096];
    let n = match stream.read(&mut buf).await {
        Ok(n) if n > 0 => n,
        _ => return,
    };

    let req_str = String::from_utf8_lossy(&buf[..n]);
    let mut lines = req_str.lines();
    let first_line = lines.next().unwrap_or("");
    let mut parts = first_line.split_whitespace();
    let method = parts.next().unwrap_or("GET");
    let full_path = parts.next().unwrap_or("/");
    let path = full_path.split('?').next().unwrap_or("/");

    let is_ws_upgrade = req_str.to_lowercase().contains("upgrade: websocket");

    if is_ws_upgrade && path == "/ws" {
        // Tìm Sec-WebSocket-Key
        let mut ws_key = "";
        for line in req_str.lines() {
            if line.to_lowercase().starts_with("sec-websocket-key:") {
                ws_key = line["sec-websocket-key:".len()..].trim();
                break;
            }
        }
        if ws_key.is_empty() {
            let _ = stream.write_all(b"HTTP/1.1 400 Bad Request\r\n\r\n").await;
            return;
        }

        let accept = sha1_accept_key(ws_key);
        let resp = format!(
            "HTTP/1.1 101 Switching Protocols\r\n\
            Upgrade: websocket\r\n\
            Connection: Upgrade\r\n\
            Sec-WebSocket-Accept: {accept}\r\n\r\n"
        );
        if stream.write_all(resp.as_bytes()).await.is_err() {
            return;
        }

        handle_websocket(stream, app, state, client_senders, room_code).await;
        return;
    }

    // Xử lý các route HTTP thường
    match (method, path) {
        ("GET", "/") | ("GET", "/index.html") => {
            send_http_response(&mut stream, 200, "text/html; charset=utf-8", HTML.as_bytes()).await;
        }
        ("GET", "/mobile.css") => {
            send_http_response(&mut stream, 200, "text/css; charset=utf-8", CSS.as_bytes()).await;
        }
        ("GET", "/mobile.js") => {
            send_http_response(&mut stream, 200, "application/javascript; charset=utf-8", JS.as_bytes()).await;
        }
        ("GET", "/health") => {
            send_http_response(&mut stream, 200, "application/json", b"{\"ok\":true}").await;
        }
        ("POST", "/join") => {
            let body = req_str.split("\r\n\r\n").nth(1).unwrap_or("");
            let parsed: Value = serde_json::from_str(body).unwrap_or(Value::Null);
            let entered = parsed.get("room").and_then(|v| v.as_str()).unwrap_or("").to_uppercase();
            let matches = entered == room_code;
            let res = json!({ "ok": matches }).to_string();
            send_http_response(&mut stream, 200, "application/json", res.as_bytes()).await;
        }
        _ => {
            send_http_response(&mut stream, 404, "text/plain", b"Not Found").await;
        }
    }
}

async fn send_http_response(stream: &mut TcpStream, status: u16, content_type: &str, body: &[u8]) {
    let header = format!(
        "HTTP/1.1 {status} OK\r\n\
        Content-Type: {content_type}\r\n\
        Content-Length: {}\r\n\
        Cache-Control: no-store\r\n\
        X-Frame-Options: DENY\r\n\
        X-Content-Type-Options: nosniff\r\n\
        Connection: close\r\n\r\n",
        body.len()
    );
    let _ = stream.write_all(header.as_bytes()).await;
    let _ = stream.write_all(body).await;
}

// ── WebSocket Frame Handling ─────────────────────────────────────────────────

async fn handle_websocket(
    stream: TcpStream,
    app: AppHandle,
    state: Arc<Mutex<LanSessionState>>,
    client_senders: Arc<Mutex<HashMap<usize, (mpsc::UnboundedSender<String>, Option<String>)>>>,
    room_code: String,
) {
    let conn_id = NEXT_CONN_ID.fetch_add(1, Ordering::Relaxed);
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();

    {
        let mut map = client_senders.lock().await;
        map.insert(conn_id, (tx, None));
    }

    let (mut reader, mut writer) = stream.into_split();

    // Task gửi tin nhắn xuống client qua WebSocket
    let write_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            let frame = encode_ws_text_frame(&msg);
            if writer.write_all(&frame).await.is_err() {
                break;
            }
        }
    });

    // Vòng lặp đọc frame WebSocket từ client
    let mut read_buf = Vec::new();
    loop {
        let mut temp = [0u8; 2048];
        let n = match reader.read(&mut temp).await {
            Ok(n) if n > 0 => n,
            _ => break,
        };
        read_buf.extend_from_slice(&temp[..n]);

        while !read_buf.is_empty() {
            if read_buf.len() < 2 {
                break;
            }
            let first = read_buf[0];
            let second = read_buf[1];
            let opcode = first & 0x0F;
            let masked = (second & 0x80) != 0;
            let mut payload_len = (second & 0x7F) as usize;
            let mut header_len = 2;

            if payload_len == 126 {
                if read_buf.len() < 4 {
                    break;
                }
                payload_len = u16::from_be_bytes([read_buf[2], read_buf[3]]) as usize;
                header_len = 4;
            } else if payload_len == 127 {
                if read_buf.len() < 10 {
                    break;
                }
                payload_len = u64::from_be_bytes([
                    read_buf[2], read_buf[3], read_buf[4], read_buf[5],
                    read_buf[6], read_buf[7], read_buf[8], read_buf[9],
                ]) as usize;
                header_len = 10;
            }

            let mask_len = if masked { 4 } else { 0 };
            if read_buf.len() < header_len + mask_len + payload_len {
                break;
            }

            let mask_start = header_len;
            let data_start = header_len + mask_len;
            let data_end = data_start + payload_len;

            let mask = if masked {
                Some([read_buf[mask_start], read_buf[mask_start + 1], read_buf[mask_start + 2], read_buf[mask_start + 3]])
            } else {
                None
            };

            let mut payload = read_buf[data_start..data_end].to_vec();
            if let Some(m) = mask {
                for (i, b) in payload.iter_mut().enumerate() {
                    *b ^= m[i % 4];
                }
            }

            read_buf.drain(..data_end);

            if opcode == 0x8 {
                // Đóng kết nối
                break;
            } else if opcode == 0x1 {
                // Text frame
                if let Ok(text) = String::from_utf8(payload) {
                    handle_client_message(
                        conn_id,
                        &text,
                        &app,
                        &state,
                        &client_senders,
                        &room_code,
                    )
                    .await;
                }
            }
        }
    }

    write_task.abort();

    // Dọn dẹp kết nối khi thoát
    let mut map = client_senders.lock().await;
    if let Some((_, player_id_opt)) = map.remove(&conn_id) {
        if let Some(pid) = player_id_opt {
            let mut st = state.lock().await;
            if let Some(p) = st.players.iter_mut().find(|p| p.id == pid) {
                p.connected = false;
            }
            let snapshot = st.build_snapshot();
            drop(st);
            let _ = app.emit("lan:state", &snapshot);
        }
    }
}

async fn handle_client_message(
    conn_id: usize,
    text: &str,
    app: &AppHandle,
    state: &Arc<Mutex<LanSessionState>>,
    client_senders: &Arc<Mutex<HashMap<usize, (mpsc::UnboundedSender<String>, Option<String>)>>>,
    room_code: &str,
) {
    let msg: Value = match serde_json::from_str(text) {
        Ok(v) => v,
        Err(_) => return,
    };

    let event = msg.get("event").and_then(|v| v.as_str()).unwrap_or("");
    let payload = msg.get("payload").unwrap_or(&Value::Null);

    match event {
        "lan:join" => {
            let entered_room = payload.get("room").and_then(|v| v.as_str()).unwrap_or("").trim().to_uppercase();
            let name = payload.get("name").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();

            if entered_room != room_code {
                send_to_client(client_senders, conn_id, "lan:refused", json!({
                    "status": "wrong-room",
                    "message": "Mã phòng không đúng. Hãy nhìn màn hình máy chiếu của giáo viên."
                })).await;
                return;
            }

            if name.is_empty() {
                send_to_client(client_senders, conn_id, "lan:refused", json!({
                    "status": "bad-name",
                    "message": "Hãy nhập tên của em."
                })).await;
                return;
            }

            let mut st = state.lock().await;
            if st.players.len() >= 60 {
                send_to_client(client_senders, conn_id, "lan:refused", json!({
                    "status": "room-full",
                    "message": "Lớp học đã đủ người (tối đa 60 học sinh)."
                })).await;
                return;
            }

            let player_id = format!("p_{}", random_hex(4));
            let token = random_hex(16);

            // Gán đội xoay vòng cân bằng
            let team_id = if !st.teams.is_empty() {
                let team_idx = st.players.len() % st.teams.len();
                st.teams[team_idx].id.clone()
            } else {
                "t1".to_string()
            };

            st.players.push(LanInternalPlayer {
                id: player_id.clone(),
                token: token.clone(),
                name: name.clone(),
                team_id,
                connected: true,
                points: 0,
                correct: 0,
                answered: 0,
            });

            // Ghi nhận player_id cho conn_id
            {
                let mut map = client_senders.lock().await;
                if let Some((_, pid_slot)) = map.get_mut(&conn_id) {
                    *pid_slot = Some(player_id.clone());
                }
            }

            let phone_snap = st.phone_snapshot(&player_id);
            let teacher_snap = st.build_snapshot();
            drop(st);

            send_to_client(client_senders, conn_id, "lan:joined", json!({
                "playerId": player_id,
                "token": token,
                "name": name
            })).await;

            send_to_client(client_senders, conn_id, "lan:state", phone_snap).await;
            let _ = app.emit("lan:state", &teacher_snap);
        }
        "lan:rejoin" => {
            let entered_room = payload.get("room").and_then(|v| v.as_str()).unwrap_or("").trim().to_uppercase();
            let token = payload.get("token").and_then(|v| v.as_str()).unwrap_or("");

            if entered_room != room_code {
                send_to_client(client_senders, conn_id, "lan:refused", json!({
                    "status": "wrong-room",
                    "message": "Mã phòng không khớp."
                })).await;
                return;
            }

            let mut st = state.lock().await;
            let player = st.players.iter_mut().find(|p| p.token == token);
            if let Some(p) = player {
                p.connected = true;
                let pid = p.id.clone();
                let name = p.name.clone();

                {
                    let mut map = client_senders.lock().await;
                    if let Some((_, pid_slot)) = map.get_mut(&conn_id) {
                        *pid_slot = Some(pid.clone());
                    }
                }

                let phone_snap = st.phone_snapshot(&pid);
                let teacher_snap = st.build_snapshot();
                drop(st);

                send_to_client(client_senders, conn_id, "lan:joined", json!({
                    "playerId": pid,
                    "token": token,
                    "name": name
                })).await;

                send_to_client(client_senders, conn_id, "lan:state", phone_snap).await;
                let _ = app.emit("lan:state", &teacher_snap);
            } else {
                send_to_client(client_senders, conn_id, "lan:refused", json!({
                    "status": "not-in-room",
                    "message": "Không tìm thấy phiên của em trong phòng này."
                })).await;
            }
        }
        "lan:answer" => {
            let option_id = payload.get("optionId").and_then(|v| v.as_str()).map(|s| s.to_string());
            let answer_text = payload.get("answerText").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();

            let pid_opt = {
                let map = client_senders.lock().await;
                map.get(&conn_id).and_then(|(_, p)| p.clone())
            };
            let Some(player_id) = pid_opt else {
                send_to_client(client_senders, conn_id, "lan:answer-refused", json!({
                    "status": "not-in-room",
                    "message": "Hãy vào phòng trước."
                })).await;
                return;
            };

            let mut st = state.lock().await;
            if st.phase != "question" {
                send_to_client(client_senders, conn_id, "lan:answer-refused", json!({
                    "status": "wrong-phase",
                    "message": "Câu này chưa mở hoặc đã kết thúc."
                })).await;
                return;
            }

            let cur_idx = st.current_round_index;
            let already_answered = st.answers.get(&cur_idx).map_or(false, |m| m.contains_key(&player_id));
            if already_answered {
                send_to_client(client_senders, conn_id, "lan:answer-refused", json!({
                    "status": "already-answered",
                    "message": "Em đã trả lời câu này rồi."
                })).await;
                return;
            }

            let cur_round = st.rounds_data.get(cur_idx).cloned();

            // Chấm điểm câu trả lời
            let mut correct = false;
            let mut points = 0;
            if let Some(round) = &cur_round {
                if let Some(opt_id) = &option_id {
                    if let Some(corr_opt) = &round.correct_option_id {
                        if opt_id.to_lowercase() == corr_opt.to_lowercase() {
                            correct = true;
                            points = round.max_points;
                        }
                    }
                } else if !answer_text.is_empty() {
                    let norm = answer_text.to_lowercase();
                    if let Some(corr_ans) = &round.correct_answer {
                        if norm == corr_ans.to_lowercase() {
                            correct = true;
                            points = round.max_points;
                        }
                    }
                    if !correct {
                        for alt in &round.alternate_answers {
                            if norm == alt.to_lowercase() {
                                correct = true;
                                points = round.max_points;
                                break;
                            }
                        }
                    }
                }
            }

            let round_answers = st.answers.entry(cur_idx).or_default();
            round_answers.insert(
                player_id.clone(),
                LanInternalAnswer {
                    option_id,
                    answer_text,
                    correct,
                    points,
                },
            );

            st.answered_count = round_answers.len();

            // Cập nhật điểm cho người chơi
            if let Some(p) = st.players.iter_mut().find(|p| p.id == player_id) {
                p.answered += 1;
                if correct {
                    p.correct += 1;
                    p.points += points;
                }
            }

            let teacher_snap = st.build_snapshot();
            drop(st);

            send_to_client(client_senders, conn_id, "lan:answer-ack", json!({
                "roundIndex": cur_idx
            })).await;

            let _ = app.emit("lan:state", &teacher_snap);
        }
        _ => {}
    }
}

async fn send_to_client(
    client_senders: &Arc<Mutex<HashMap<usize, (mpsc::UnboundedSender<String>, Option<String>)>>>,
    conn_id: usize,
    event: &str,
    payload: Value,
) {
    let msg = json!({ "event": event, "payload": payload }).to_string();
    let map = client_senders.lock().await;
    if let Some((tx, _)) = map.get(&conn_id) {
        let _ = tx.send(msg);
    }
}

fn encode_ws_text_frame(text: &str) -> Vec<u8> {
    let bytes = text.as_bytes();
    let len = bytes.len();
    let mut frame = Vec::new();
    frame.push(0x81); // FIN + opcode 1 (text)

    if len < 126 {
        frame.push(len as u8);
    } else if len <= 65535 {
        frame.push(126);
        frame.extend_from_slice(&(len as u16).to_be_bytes());
    } else {
        frame.push(127);
        frame.extend_from_slice(&(len as u64).to_be_bytes());
    }

    frame.extend_from_slice(bytes);
    frame
}

/// Tính Sec-WebSocket-Accept theo RFC 6455 bằng SHA-1.
pub fn sha1_accept_key(key: &str) -> String {
    let magic = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
    let combined = format!("{key}{magic}");
    let digest = sha1_digest(combined.as_bytes());
    base64::encode(&digest)
}

/// Thuật toán SHA-1 thuần (RFC 3174).
pub fn sha1_digest(data: &[u8]) -> [u8; 20] {
    let mut h: [u32; 5] = [
        0x67452301,
        0xEFCDAB89,
        0x98BADCFE,
        0x10325476,
        0xC3D2E1F0,
    ];

    let bit_len = (data.len() as u64) * 8;
    let mut msg = data.to_vec();
    msg.push(0x80);
    while (msg.len() % 64) != 56 {
        msg.push(0);
    }
    msg.extend_from_slice(&bit_len.to_be_bytes());

    for chunk in msg.chunks_exact(64) {
        let mut w = [0u32; 80];
        for (i, b) in chunk.chunks_exact(4).enumerate() {
            w[i] = u32::from_be_bytes([b[0], b[1], b[2], b[3]]);
        }
        for i in 16..80 {
            w[i] = (w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]).rotate_left(1);
        }

        let (mut a, mut b, mut c, mut d, mut e) = (h[0], h[1], h[2], h[3], h[4]);
        for (i, &item) in w.iter().enumerate() {
            let (f, k) = match i {
                0..=19 => ((b & c) | (!b & d), 0x5A827999),
                20..=39 => (b ^ c ^ d, 0x6ED9EBA1),
                40..=59 => ((b & c) | (b & d) | (c & d), 0x8F1BBCDC),
                _ => (b ^ c ^ d, 0xCA62C1D6),
            };
            let temp = a
                .rotate_left(5)
                .wrapping_add(f)
                .wrapping_add(e)
                .wrapping_add(k)
                .wrapping_add(item);
            e = d;
            d = c;
            c = b.rotate_left(30);
            b = a;
            a = temp;
        }

        h[0] = h[0].wrapping_add(a);
        h[1] = h[1].wrapping_add(b);
        h[2] = h[2].wrapping_add(c);
        h[3] = h[3].wrapping_add(d);
        h[4] = h[4].wrapping_add(e);
    }

    let mut out = [0u8; 20];
    for (i, val) in h.iter().enumerate() {
        out[i * 4..(i + 1) * 4].copy_from_slice(&val.to_be_bytes());
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rfc6455_accept_key_matches_spec_vector() {
        let client_key = "dGhlIHNhbXBsZSBub25jZQ==";
        let expected_accept = "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=";
        assert_eq!(sha1_accept_key(client_key), expected_accept);
    }

    #[test]
    fn sha1_matches_standard_rfc3174_vector() {
        let digest = sha1_digest(b"abc");
        assert_eq!(hex::encode(digest), "a9993e364706816aba3e25717850c26c9cd0d89d");
    }

    #[test]
    fn lan_profile_accepts_quiz_and_scenario() {
        let quiz = json!({ "template": "quiz" });
        let profile = lan_profile_for(&quiz);
        assert!(profile.supported);
        assert_eq!(profile.engine, "quiz");

        let scenario = json!({ "template": "scenario" });
        let p_scen = lan_profile_for(&scenario);
        assert!(p_scen.supported);

        let race = json!({ "template": "race" });
        assert!(!lan_profile_for(&race).supported);

        let matching = json!({ "template": "matching" });
        assert!(!lan_profile_for(&matching).supported);
    }

    #[test]
    fn room_code_is_six_alphanumeric_characters() {
        let code = random_room_code();
        assert_eq!(code.len(), 6);
        for ch in code.chars() {
            assert!(ROOM_ALPHABET.contains(&(ch as u8)));
        }
    }

    #[test]
    fn encode_ws_frame_correct_fin_and_payload() {
        let text = "hello";
        let frame = encode_ws_text_frame(text);
        assert_eq!(frame[0], 0x81);
        assert_eq!(frame[1], 5);
        assert_eq!(&frame[2..], b"hello");
    }
}
