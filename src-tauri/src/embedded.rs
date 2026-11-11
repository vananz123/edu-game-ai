//! V8 nhúng: chạy chính mã TypeScript của luật lưu trữ bên trong tiến trình Rust.
//!
//! Câu hỏi đặt ra ở bước 2/6: port sáu kênh `library:*` sang Rust, hay dùng lại
//! mã đang chạy bên Electron? Port tay có nghĩa là hai bản của một luật (kiểm câu
//! hỏi, chuẩn hoá `createdAt`/`updatedAt`, giới hạn 500/1000 id) và chúng trôi ở
//! lần sửa thứ ba — đúng lỗi #152 đã từng phải vá. Nên:
//! `scripts/build-embedded-js.js` đóng gói `library-ops.ts` (cùng
//! `game-validation.ts`, `game-fields.ts`) thành một bundle CJS, tệp này nhúng
//! vào binary bằng `include_str!` và chạy trong một V8 của `deno_core`.
//!
//! Ranh giới là CỐ Ý hẹp:
//!   • JS chỉ thấy đúng ba biến toàn cục do Rust đặt trước mỗi lượt chạy
//!     (`__eg_input`, `__eg_store`, `__eg_now`) và không có
//!     `require`/`process`/`fetch` — không đường nào ra ngoài tiến trình;
//!   • mỗi câu SQL JS gửi lên phải nằm trong danh sách câu của nhóm thư viện
//!     (`is_known_sql`), và chạy bằng tham số ràng buộc (`sql_params.rs`);
//!   • lỗi luật (`throw new Error('Mỗi lần chỉ xoá…')`) vẫn đi qua promise bị
//!     từ chối, nên renderer nhận đúng câu tiếng Việt của `library-ops.ts`.
//!
//! Ba op SQL là ĐỒNG BỘ: `better-sqlite3` bên Electron cũng đồng bộ, nên luật
//! trong `library-ops.ts` đọc như một dãy lệnh. Vì op trả giá trị ngay, mọi
//! promise của lượt gọi đáp ngay trong microtask — Rust chỉ cần một khoảng chạy
//! V8 (`poll_event_loop`) để chạm tới chúng, không cần hệ thống task của
//! `deno_core` (mà `Rc` bên trong nó không đi qua được ranh giới luồng, xem
//! `library.rs`).
//!
//! Một engine sống theo kết nối: dựng V8 một lần cho mỗi tiến trình thay vì mỗi
//! lệnh IPC, và mỗi lượt gọi chỉ đặt lại ba biến toàn cục rồi gọi `__eg_run()`.

use std::cell::RefCell;
use std::rc::Rc;

use deno_core::v8;
use deno_core::{op2, JsRuntime, OpState, RuntimeOptions};
use rusqlite::Connection;
use serde_json::{json, Map, Value};

use crate::ai_http::AiTarget;
use crate::sql_params;
use crate::storage::DbError;

/// Bundle mã sinh bởi `scripts/build-embedded-js.js`; `npm test` chặn tệp này
/// lệch khỏi nguồn TypeScript (`tests/unit/tauri-embedded.test.ts`).
const BUNDLE: &str = include_str!("embedded/bundle.js");

const SCRIPT_NAME: &str = "edugame-embedded.js";

/// Trạng thái mà các op đọc: kết nối đang mở và số câu SQL đã chạy (cổng kiểm
/// tra đối chiếu). Dùng chung `Rc` giữa engine và op, nhưng engine không bao giờ
/// rời khỏi luồng sở hữu nó.
pub struct RuntimeInner {
    pub connection: Connection,
    pub sql_calls: usize,
    /// Thư mục dữ liệu của vỏ: kho giáo án dùng để đọc/ghi `lessons/<id>.txt`.
    pub data_dir: std::path::PathBuf,
    /// Đích AI của lượt đang chạy. Chỉ sống trong khoảng `call_with_ai`; V8 chỉ
    /// thấy `requestId`, không thấy URL hay khoá.
    pub ai: Option<AiTarget>,
}

pub type SharedRuntime = Rc<RefCell<RuntimeInner>>;

/// Đọc `payload` của một lời gọi `store.*` từ JS thành `{sql, params}`.
fn parse_call(payload: &str) -> Result<(String, Map<String, Value>), String> {
    let value: Value = serde_json::from_str(payload)
        .map_err(|error| format!("payload của store không phải JSON: {error}"))?;
    let sql = value
        .get("sql")
        .and_then(Value::as_str)
        .ok_or_else(|| "store.* thiếu `sql`".to_string())?
        .to_string();
    let params = value
        .get("params")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    Ok((sql, params))
}

/// Một câu đã qua cổng chặn, kèm tham số ràng buộc của nó.
type Call = (String, Vec<(String, rusqlite::types::Value)>);

/// Kiểm câu SQL và đổi tham số; `None` khi câu không thuộc nhóm thư viện.
fn prepare_call(payload: &str) -> Result<Call, String> {
    let (sql, params) = parse_call(payload)?;
    if !is_known_sql(&sql) {
        return Err(format!("SQL không thuộc nhóm thư viện: {sql}"));
    }
    let bound = sql_params::named(&params).map_err(|error| error.to_string())?;
    Ok((sql, bound))
}

/// Chân của câu SQL đưa sang `rusqlite`.
///
/// `named()` trả kiểu `Value` của chính `rusqlite` (không phải `ToSql`), nên đi
/// qua `ToSqlOutput`: chuỗi thành `Text`, số thành `Integer`, `NULL` thành
/// `Null`. Tên tham số (`@id`) do câu SQL cố định quyết định, không do dữ liệu.
fn bind(bound: &[(String, rusqlite::types::Value)]) -> Vec<Box<dyn rusqlite::ToSql + '_>> {
    bound
        .iter()
        .map(|(_, value)| {
            let output = match value {
                rusqlite::types::Value::Null => rusqlite::types::ToSqlOutput::Borrowed(
                    rusqlite::types::ValueRef::Null,
                ),
                rusqlite::types::Value::Integer(number) => rusqlite::types::ToSqlOutput::Owned(
                    rusqlite::types::Value::Integer(*number),
                ),
                rusqlite::types::Value::Real(number) => rusqlite::types::ToSqlOutput::Owned(
                    rusqlite::types::Value::Real(*number),
                ),
                rusqlite::types::Value::Text(text) => rusqlite::types::ToSqlOutput::Owned(
                    rusqlite::types::Value::Text(text.clone()),
                ),
                rusqlite::types::Value::Blob(bytes) => rusqlite::types::ToSqlOutput::Owned(
                    rusqlite::types::Value::Blob(bytes.clone()),
                ),
            };
            Box::new(output) as Box<dyn rusqlite::ToSql + '_>
        })
        .collect()
}

/// Chạy một câu `store.select`: trả mảng object theo tên cột.
fn run_select(runtime: &SharedRuntime, payload: &str) -> Result<String, String> {
    let (sql, bound) = prepare_call(payload)?;
    let mut inner = runtime.borrow_mut();
    inner.sql_calls += 1;
    let connection = &inner.connection;
    let mut statement = connection.prepare(&sql).map_err(|error| error.to_string())?;
    let names: Vec<String> = statement.column_names().into_iter().map(str::to_string).collect();
    let mut rows = statement
        .query(rusqlite::params_from_iter(bind(&bound)))
        .map_err(|error| error.to_string())?;
    let mut out = Vec::new();
    while let Some(row) = rows.next().map_err(|error| error.to_string())? {
        out.push(sql_params::row_to_json(&row, names.len(), &names).map_err(|error| error.to_string())?);
    }
    serde_json::to_string(&out).map_err(|error| error.to_string())
}

/// Chạy một câu `store.execute`; trả số dòng đổi.
fn run_execute(runtime: &SharedRuntime, payload: &str) -> Result<i64, String> {
    let (sql, bound) = prepare_call(payload)?;
    let mut inner = runtime.borrow_mut();
    inner.sql_calls += 1;
    let changed = inner
        .connection
        .execute(&sql, rusqlite::params_from_iter(bind(&bound)))
        .map_err(|error| error.to_string())?;
    Ok(changed as i64)
}

/// Chạy `store.transaction`: mọi câu trong MỘT transaction, lỗi giữa chừng thì
/// cả lô bị huỷ. Trả mảng số dòng đổi theo đúng thứ tự câu.
fn run_transaction(runtime: &SharedRuntime, payload: &str) -> Result<String, String> {
    let value: Value = serde_json::from_str(payload)
        .map_err(|error| format!("payload của store không phải JSON: {error}"))?;
    let statements = value
        .get("statements")
        .and_then(Value::as_array)
        .ok_or_else(|| "store.transaction thiếu `statements`".to_string())?;
    // Kiểm mọi câu TRƯỚC khi mở transaction: câu lạ phải là lỗi lập trình, không
    // phải một transaction mở rồi bị huỷ.
    let mut calls: Vec<Call> = Vec::with_capacity(statements.len());
    for statement in statements {
        calls.push(prepare_call(&statement.to_string())?);
    }
    let mut inner = runtime.borrow_mut();
    let transaction = inner.connection.transaction().map_err(|error| error.to_string())?;
    let mut counts = Vec::with_capacity(calls.len());
    for (sql, bound) in &calls {
        counts.push(
            transaction
                .execute(sql.as_str(), rusqlite::params_from_iter(bind(bound)))
                .map_err(|error| error.to_string())? as i64,
        );
    }
    transaction.commit().map_err(|error| error.to_string())?;
    drop(inner);
    runtime.borrow_mut().sql_calls += calls.len();
    serde_json::to_string(&counts).map_err(|error| error.to_string())
}

deno_core::extension!(
    eg,
    ops = [op_sql_select, op_sql_execute, op_sql_transaction, op_http, op_sha256],
    options = { runtime: SharedRuntime },
    state = |state, options| state.put(options.runtime),
);

// Ba op SQL chạy ngay và trả thẳng chuỗi JSON: SQLite của `rusqlite` là đồng bộ,
// và một op đồng bộ giữ được promise của cả lượt gọi đáp trong microtask — xem
// đầu tệp.
#[op2]
#[string]
fn op_sql_select(state: &mut OpState, #[string] payload: &str) -> Result<String, deno_error::JsErrorBox> {
    let runtime = state.borrow::<SharedRuntime>().clone();
    run_select(&runtime, payload).map_err(deno_error::JsErrorBox::generic)
}

#[op2(fast)]
fn op_sql_execute(state: &mut OpState, #[string] payload: &str) -> Result<f64, deno_error::JsErrorBox> {
    let runtime = state.borrow::<SharedRuntime>().clone();
    run_execute(&runtime, payload)
        .map(|changed| changed as f64)
        .map_err(deno_error::JsErrorBox::generic)
}

#[op2]
#[string]
fn op_sql_transaction(
    state: &mut OpState,
    #[string] payload: &str,
) -> Result<String, deno_error::JsErrorBox> {
    let runtime = state.borrow::<SharedRuntime>().clone();
    run_transaction(&runtime, payload).map_err(deno_error::JsErrorBox::generic)
}

/// Một lượt HTTP tới nhà cung cấp AI. Đích (`base_url`/khoá/thời gian) nằm
/// trong `RuntimeInner.ai`, không trong payload; V8 chỉ gửi `requestId` và
/// thân JSON. Op này ĐỒNG BỘ để chuỗi promise của `requestChatJson` đáp ngay
/// trong microtask checkpoint (xem đầu tệp); nó chạy HTTP trên luồng riêng.
#[op2]
#[string]
fn op_http(state: &mut OpState, #[string] payload: &str) -> Result<String, deno_error::JsErrorBox> {
    let runtime = state.borrow::<SharedRuntime>().clone();
    let target = runtime.borrow().ai.clone();
    let Some(target) = target else {
        return Err(deno_error::JsErrorBox::generic(
            "[AI_CONFIG] Không có lượt AI nào đang mở cho HTTP.",
        ));
    };
    let value: Value = serde_json::from_str(payload)
        .map_err(|error| deno_error::JsErrorBox::generic(format!("payload HTTP không phải JSON: {error}")))?;
    let request_id = value
        .get("requestId")
        .and_then(Value::as_str)
        .unwrap_or("");
    if request_id != target.request_id {
        return Err(deno_error::JsErrorBox::generic(
            "[AI_CONFIG] Mã yêu cầu AI không khớp lượt đang chạy.",
        ));
    }
    let body = value
        .get("body")
        .and_then(Value::as_str)
        .ok_or_else(|| deno_error::JsErrorBox::generic("payload HTTP thiếu `body`"))?
        .to_string();
    let answer = crate::ai_http::post_json(&target, body);
    serde_json::to_string(&answer).map_err(|error| deno_error::JsErrorBox::generic(error.to_string()))
}

/// SHA-256 thay cho `node:crypto.createHash` trong slot giáo án. Cùng đầu ra
/// hex thường, nên khoá cache phân tích trùng từng byte với bản Electron.
#[op2]
#[string]
fn op_sha256(#[string] text: &str) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(text.as_bytes());
    hex::encode(hasher.finalize())
}

/// Câu SQL nhóm thư viện. Đây không phải "danh sách cấm DDL": mọi câu ở đây do
/// mã nguồn viết, nên cổng chặn chỉ cần đúng một điều kiện — câu lạ là lỗi lập
/// trình, không phải đường cho dữ liệu giáo viên đi qua.
pub(crate) fn is_known_sql(sql: &str) -> bool {
    const KNOWN: &[&str] = &[
        "SELECT data_json FROM games ORDER BY updated_at DESC",
        "SELECT data_json FROM sessions ORDER BY created_at DESC LIMIT 1000",
        "SELECT created_at FROM sessions WHERE id = @id",
        "SELECT data_json FROM games WHERE id = @id",
        "SELECT id FROM games ORDER BY updated_at DESC LIMIT 1",
        // Gói `.egame` đọc id của mọi dòng để id trùng không đè dòng thật.
        "SELECT id FROM games",
        "SELECT data_json FROM games",
        "SELECT data_json FROM game_projects",
        "SELECT * FROM game_projects",
        "SELECT * FROM game_projects WHERE id = @id",
        "SELECT * FROM game_projects ORDER BY updated_at DESC",
        "DELETE FROM games WHERE id = @id",
        "DELETE FROM game_projects WHERE id = @id",
        "DELETE FROM sessions WHERE id = @id",
    ];
    KNOWN.contains(&sql) || known_write(sql)
}

/// Câu ghi vốn viết nhiều dòng trong mã nguồn: so theo từng từ để thụt lề không
/// làm lệch. Phép so NGUYÊN VĂN, không phải khớp mẫu — một bảng khác hay `DELETE
/// FROM games` không kèm `WHERE` không khớp và không chạy.
fn known_write(sql: &str) -> bool {
    const KNOWN_WRITES: &[&str] = &[
        "INSERT INTO games (id,title,subject,grade,topic,template,created_at,updated_at,data_json) VALUES (@id,@title,@subject,@grade,@topic,@template,@created_at,@updated_at,@data_json) ON CONFLICT(id) DO UPDATE SET title=excluded.title, subject=excluded.subject, grade=excluded.grade, topic=excluded.topic, template=excluded.template, updated_at=excluded.updated_at, data_json=excluded.data_json",
        "INSERT INTO sessions (id,created_at,data_json) VALUES (@id,@created_at,@data_json) ON CONFLICT(id) DO UPDATE SET data_json=excluded.data_json",
        "INSERT INTO game_projects (id,game_id,status,step,data_json,schema_version,created_at,updated_at) VALUES (@id,@game_id,@status,@step,@data_json,@schema_version,@created_at,@updated_at) ON CONFLICT(id) DO UPDATE SET game_id=excluded.game_id, status=excluded.status, step=excluded.step, data_json=excluded.data_json, schema_version=excluded.schema_version, updated_at=excluded.updated_at",
        "DELETE FROM sessions WHERE id <> @id AND id NOT IN ( SELECT id FROM sessions WHERE id <> @id ORDER BY created_at DESC LIMIT 999 )",
    ];
    let squashed = sql.split_whitespace().collect::<Vec<_>>().join(" ");
    KNOWN_WRITES.contains(&squashed.as_str())
}

/// Một engine nhúng sống theo kết nối.
///
/// `JsRuntime` không `Send`, nên `library.rs` giữ engine này trên một luồng
/// riêng và gọi vào bằng tin nhắn. Vì công khai không có `Send`/`Sync`, tệp này
/// không chạm tới kênh IPC nào.
pub struct Embedded {
    runtime: JsRuntime,
    shared: SharedRuntime,
}

impl Embedded {
    /// Mở tệp cơ sở dữ liệu `database` dưới `data_dir`, chạy schema rồi ghi trò
    /// chơi mẫu nếu bảng `games` còn rỗng — nhánh `if (gameCount === 0) …` của
    /// `ensureData()` bên Electron.
    pub fn open(database: std::path::PathBuf, data_dir: &std::path::Path) -> Result<Self, DbError> {
        std::fs::create_dir_all(data_dir)
            .map_err(|error| DbError::Io(format!("không tạo được thư mục {}: {error}", data_dir.display())))?;
        let connection = crate::storage::open(&database)?;
        crate::storage::ensure_schema(&connection)?;
        let mut engine = Self::new(connection)?;
        engine.shared.borrow_mut().data_dir = data_dir.to_path_buf();
        engine.call("library:seed", &[], &crate::library::now())?;
        Ok(engine)
    }

    pub fn new(connection: Connection) -> Result<Self, DbError> {
        let shared: SharedRuntime = Rc::new(RefCell::new(RuntimeInner {
            connection,
            sql_calls: 0,
            data_dir: std::path::PathBuf::new(),
            ai: None,
        }));
        let mut runtime = JsRuntime::new(RuntimeOptions {
            extensions: vec![eg::init(shared.clone())],
            ..Default::default()
        });
        runtime
            .execute_script(SCRIPT_NAME, BUNDLE)
            .map_err(|error| DbError::Schema(format!("nạp bundle V8: {error}")))?;
        Ok(Embedded { runtime, shared })
    }

    /// Gọi một op (`library:save-game`, …) với danh sách tham số JSON; trả giá
    /// trị JSON. Lỗi luật mà JS từ chối được giữ nguyên câu tiếng Việt của nó,
    /// vì chính nó là câu giáo viên đọc được.
    pub fn call(&mut self, op: &str, args: &[Value], now: &str) -> Result<Value, DbError> {
        self.call_with_ai(op, args, now, None)
    }

    /// Như `call`, kèm đích AI cho lượt đang chạy. `ai = None` nghĩa là slot này
    /// không được gọi `__eg_http`; op HTTP từ chối thay vì đoán một máy chủ.
    pub fn call_with_ai(
        &mut self,
        op: &str,
        args: &[Value],
        now: &str,
        ai: Option<AiTarget>,
    ) -> Result<Value, DbError> {
        self.shared.borrow_mut().ai = ai;
        let result = (|| {
            let input = json!({ "op": op, "args": args }).to_string();
            self.install(&input, now)?;
            let raw = self.eval("__eg_run()")?;
            let answer = serde_json::from_str::<Value>(&raw)
                .map_err(|error| DbError::Data(format!("V8 trả về không phải JSON ({error}): {raw}")))?;
            if answer.get("ok").and_then(Value::as_bool) == Some(true) {
                return Ok(answer.get("value").cloned().unwrap_or(Value::Null));
            }
            let message = answer
                .get("message")
                .and_then(Value::as_str)
                .unwrap_or("op không chạy được");
            Err(match answer.get("code").and_then(Value::as_str) {
                Some("EG_UNKNOWN_OP") => DbError::Schema(format!("op `{op}` chưa có trong V8 nhúng")),
                Some("EG_BAD_INPUT") => DbError::Data(message.to_string()),
                // `library-ops.ts` kiểm dữ liệu rồi ném câu tiếng Việt; câu đó đã là
                // thứ renderer hiện, nên trả nguyên văn. Lỗi V8-ngoài-luật (payload
                // hỏng, câu SQL lạ) mang tiền tố op để biết đường truy.
                Some("EG_OP_FAILED") => DbError::Invalid(message.to_string()),
                _ => DbError::Data(format!("{op}: {message}")),
            })
        })();
        self.shared.borrow_mut().ai = None;
        result
    }

    /// Số câu SQL đã chạy — cổng kiểm tra đối chiếu với số dòng thật.
    pub fn sql_calls(&self) -> usize {
        self.shared.borrow().sql_calls
    }

    /// Trạng thái dùng chung của engine. `library.rs` mượn kết nối + thư mục dữ
    /// liệu ở đây cho nhóm `lesson-store:*` (chạy SQL trực tiếp, không qua V8).
    pub fn shared(&self) -> SharedRuntime {
        self.shared.clone()
    }

    /// Gọi một op nhận byte (slot `EGFILES`): byte đi sang V8 dưới dạng chuỗi
    /// base64, vì `__eg_input` là JSON và JSON không có kiểu byte.
    pub fn call_with_bytes(&mut self, op: &str, args: Vec<Value>, now: &str) -> Result<Value, DbError> {
        self.call(op, &args, now)
    }

    fn install(&mut self, input: &str, now: &str) -> Result<(), DbError> {
        let now = serde_json::to_string(now).map_err(|error| DbError::Data(error.to_string()))?;
        let input = serde_json::to_string(input).map_err(|error| DbError::Data(error.to_string()))?;
        // Ba hàm ở đây trả NGUYÊN giá trị của op (`select`/`transaction` là chuỗi
        // JSON, `execute` là số). `template.js` bọc chúng thêm một lớp `store`
        // có `JSON.parse`, nên parse ở đây nữa là parse hai lần — lần thứ hai
        // nhận một object và ném "Unexpected end of JSON input".
        let script = format!(
            "globalThis.__eg_store = Object.freeze({{\
                select: (payload) => Deno.core.ops.op_sql_select(payload),\
                execute: (payload) => Deno.core.ops.op_sql_execute(payload),\
                transaction: (payload) => Deno.core.ops.op_sql_transaction(payload)\
             }});\
             globalThis.__eg_http = (payload) => Deno.core.ops.op_http(payload);\
             globalThis.__eg_sha256 = (text) => Deno.core.ops.op_sha256(text);\
             globalThis.__eg_now = {now};\
             globalThis.__eg_input = {input};"
        );
        self.runtime
            .execute_script("eg:install", script)
            .map(|_| ())
            .map_err(|error| DbError::Schema(format!("đặt biến cho V8: {error}")))
    }

    /// Chạy một biểu thức trả promise và đọc kết quả dạng chuỗi.
    ///
    /// Ba op SQL đều đồng bộ, nên promise của `__eg_run()` chỉ cần một lượt
    /// microtask checkpoint của V8 — không có I/O nào để chờ, nên không cần tới
    /// vòng sự kiện của `deno_core` hay tokio: gọi checkpoint, rồi đọc `state`
    /// của promise ra. Promise còn treo sau checkpoint là lỗi lập trình (một op
    /// đã hoá async), không phải trạng thái bình thường.
    fn eval(&mut self, expression: &str) -> Result<String, DbError> {
        let global = self
            .runtime
            .execute_script("eg:run", format!("(0, {expression})"))
            .map_err(|error| DbError::Schema(format!("chạy V8: {error}")))?;
        let runtime = &mut self.runtime;
        deno_core::scope!(scope, runtime);
        scope.perform_microtask_checkpoint();
        let value = v8::Local::new(scope, global);
        let promise = v8::Local::<v8::Promise>::try_from(value)
            .map_err(|_| DbError::Schema("__eg_run() không trả promise".to_string()))?;
        let text = |value: v8::Local<v8::Value>| {
            value
                .to_string(scope)
                .map(|text| text.to_rust_string_lossy(scope))
                .unwrap_or_else(|| "undefined".to_string())
        };
        match promise.state() {
            v8::PromiseState::Fulfilled => Ok(text(promise.result(scope))),
            v8::PromiseState::Rejected => Err(DbError::Schema(format!(
                "V8 từ chối lượt gọi: {}",
                text(promise.result(scope))
            ))),
            v8::PromiseState::Pending => Err(DbError::Schema(
                "promise của V8 còn treo sau microtask checkpoint".to_string(),
            )),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_whitelist_accepts_every_statement_the_rules_emit() {
        for sql in [
            "SELECT data_json FROM games ORDER BY updated_at DESC",
            "SELECT data_json FROM sessions ORDER BY created_at DESC LIMIT 1000",
            "SELECT created_at FROM sessions WHERE id = @id",
            "SELECT data_json FROM games WHERE id = @id",
            "SELECT id FROM games ORDER BY updated_at DESC LIMIT 1",
            "SELECT data_json FROM games",
            "SELECT data_json FROM game_projects",
            "DELETE FROM games WHERE id = @id",
            "DELETE FROM sessions WHERE id = @id",
        ] {
            assert!(is_known_sql(sql), "câu của nhóm thư viện bị từ chối: {sql}");
        }
        assert!(known_write(
            "INSERT INTO sessions (id,created_at,data_json)
            VALUES (@id,@created_at,@data_json)
            ON CONFLICT(id) DO UPDATE SET data_json=excluded.data_json"
        ));
    }

    #[test]
    fn the_whitelist_refuses_anything_else() {
        // Câu xoá cả bảng, DDL, và một câu INSERT sửa một cột khác đều không
        // thuộc nhóm thư viện. Đây là lưới chặn lỗi lập trình, không phải lớp
        // chống dữ liệu bẩn.
        for sql in [
            "DELETE FROM games",
            "DROP TABLE games",
            "SELECT data_json FROM lesson_documents",
            "SELECT data_json FROM game_projects ORDER BY updated_at DESC",
            "INSERT INTO games (id,title) VALUES (@id,@title)",
            "DELETE FROM sessions WHERE id <> @id AND id NOT IN (SELECT id FROM sessions ORDER BY created_at DESC LIMIT 999)",
        ] {
            assert!(!is_known_sql(sql), "câu lạ phải bị từ chối: {sql}");
        }
    }

    /// Một engine mở trên tệp 0.5.1 tạm — đủ để slot `EGFILES` chạy mà không cần
    /// `AppHandle` (nó không chạm SQL cho hai op dưới, nhưng `Embedded::open` vẫn
    /// cần một kết nối).
    ///
    /// Phải dựng TRONG một tokio runtime một luồng, đúng như `library::spawn` làm
    /// ở bản chạy thật: `deno_core` hỏi `Handle::try_current()` lúc dựng isolate, và
    /// thiếu handle mà V8 đăng một tác vụ trễ (nạp bundle 5 MB đủ để đăng) thì nó
    /// `abort()` cả tiến trình test.
    fn engine() -> (tempfile::TempDir, Embedded) {
        let dir = tempfile::tempdir().expect("tempdir");
        let owned = dir.path().to_path_buf();
        let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build().expect("tokio");
        let _guard = runtime.enter();
        let engine = Embedded::open(owned.join("edugame.sqlite"), &owned).expect("engine");
        (dir, engine)
    }

    fn fixture(name: &str) -> Vec<u8> {
        std::fs::read(
            std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("..")
                .join("tests")
                .join("fixtures")
                .join("tauri-import")
                .join(name),
        )
        .unwrap_or_else(|error| panic!("thiếu fixture {name}: {error}"))
    }

    fn import(engine: &mut Embedded, name: &str) -> Result<Value, DbError> {
        let bytes = crate::base64::encode(&fixture(name));
        engine.call_with_bytes(
            "files:import-document",
            vec![Value::String(name.to_string()), Value::String(bytes)],
            "2026-01-01T00:00:00.000Z",
        )
    }

    #[test]
    fn the_files_slot_reads_chua_text_inside_embedded_v8() {
        let (_dir, mut engine) = engine();
        let text = import(&mut engine, "giao-an.txt").expect("txt");
        assert_eq!(text["name"], "giao-an.txt");
        // Fixture có dấu tiếng Việt nên khẳng định này cũng đo bộ giải mã UTF-8
        // của V8 trần (không có `TextDecoder` của nền tảng).
        let body = text["text"].as_str().unwrap_or("");
        assert!(body.contains("Giáo án"), "{text}");
        assert!(body.contains("đèn xanh"), "{text}");
        let md = import(&mut engine, "giao-an.md").expect("md");
        assert!(md["characters"].as_u64().unwrap_or(0) > 0);
        // Ba định dạng còn lại đi qua ba thư viện khác nhau (mammoth + jszip,
        // pdf.js, jszip): mỗi cái là một nhánh riêng của `readDocument`.
        let docx = import(&mut engine, "bai-hoc.docx").expect("docx");
        assert!(docx["text"].as_str().unwrap_or("").contains("Hoc sinh"), "{docx}");
        let pptx = import(&mut engine, "bai-giang.pptx").expect("pptx");
        let slides = pptx["text"].as_str().unwrap_or("");
        // `Cau hoi hai` trước `Cau hoi muoi` chứng minh thứ tự sắp theo SỐ slide
        // (`slide10` không lọt lên trước `slide2` vì so chuỗi), và `&` đã được
        // giải mã từ `&amp;` của XML.
        assert!(slides.contains("Cau hoi hai & an toan"), "{pptx}");
        assert!(slides.contains("Cau hoi muoi"), "pptx mất slide 10: {pptx}");
        assert!(
            slides.find("Cau hoi hai").unwrap_or(usize::MAX) < slides.find("Cau hoi muoi").unwrap_or(0),
            "thứ tự slide sai: {pptx}"
        );
        let pdf = import(&mut engine, "giao-an.pdf").expect("pdf");
        assert!(pdf["characters"].as_u64().unwrap_or(0) > 0, "{pdf}");
    }

    #[test]
    fn a_broken_file_is_refused_with_a_sentence_not_a_hang() {
        // `Embedded::eval` chỉ chạy microtask checkpoint. Nếu một slot thật sự cần
        // vòng sự kiện (I/O bất đồng bộ) thì chỗ này héo: promise còn treo là lỗi
        // `Schema`, không phải câu lỗi có mã `DB_INVALID_INPUT`.
        let (_dir, mut engine) = engine();
        let error = import(&mut engine, "hong.pdf").expect_err("PDF hỏng");
        assert_ne!(error.code(), "DB_SCHEMA_FAILED", "slot treo sau microtask: {error}");
        let error = import(&mut engine, "bang-tinh.xls").expect_err("đuôi lạ");
        assert_eq!(error.code(), "DB_INVALID_INPUT", "xls: {error}");
        assert!(error.to_string().contains("chưa được hỗ trợ"), "{error}");
    }

    const NOW: &str = "2026-01-01T00:00:00.000Z";

    #[test]
    fn the_lesson_slot_hashes_and_plans_offline() {
        let (_dir, mut engine) = engine();
        // ASCII để `documentChars` (độ dài UTF-16 của JS) so được trực tiếp với
        // `str::len`; phần tiếng Việt đã có test riêng bên dưới.
        let text = "I. MUC TIEU\n- Neu duoc vai tro cua anh sang.\nII. NOI DUNG\n- Quang hop.";
        let input = json!({
            "text": text,
            "name": "giao-an.txt",
            "mode": "fast",
            "providerId": "local",
            "modelId": "qwen3.5-2b-q4_k_m"
        });
        let first = engine
            .call("lesson-plan", &[input.clone()], NOW)
            .expect("plan");
        let second = engine.call("lesson-plan", &[input], NOW).expect("plan again");
        assert_eq!(first["cacheKey"], second["cacheKey"], "cache key phải tất định");
        let key = first["cacheKey"].as_str().unwrap_or("");
        assert!(key.starts_with("analysis_v1_"), "{key}");
        assert_eq!(key.len(), "analysis_v1_".len() + 64, "{key}");
        // Không chọn mục nào = toàn văn, đúng nhánh `prepareWholeLessonText`.
        assert_eq!(first["selection"], Value::Null);
        assert_eq!(first["sent"]["provider"], "local");
        assert_eq!(first["sent"]["scoped"], false);
        assert_eq!(first["sent"]["documentChars"].as_i64(), Some(text.len() as i64));
        assert!(first["sent"]["budgetChars"].as_i64().unwrap_or(0) > 0);
        // #132: provider là một phần của key, nên cùng giáo án + model nhưng chạy
        // bằng provider khác phải ra key khác.
        let other = engine
            .call(
                "lesson-plan",
                &[json!({
                    "text": text,
                    "name": "giao-an.txt",
                    "mode": "fast",
                    "providerId": "gemini",
                    "modelId": "qwen3.5-2b-q4_k_m"
                })],
                NOW,
            )
            .expect("other provider");
        assert_ne!(first["cacheKey"], other["cacheKey"]);
    }

    #[test]
    fn the_lesson_slot_reads_the_structure_without_the_network() {
        let (_dir, mut engine) = engine();
        let text = "I. MUC TIEU\n- Neu duoc vai tro cua anh sang.\n\nII. NOI DUNG\n- Quang hop o thuc vat.\n";
        let tree = engine
            .call("lesson-structure", &[json!(text)], NOW)
            .expect("structure");
        assert_eq!(tree["root"]["kind"], "document", "{tree}");
        assert_eq!(tree["headingsFound"], 2, "{tree}");
        let nodes = tree["nodes"].as_array().expect("nodes");
        assert!(!nodes.is_empty(), "không đọc được mục nào: {tree}");
        assert!(
            nodes.iter().any(|node| node["title"]
                .as_str()
                .unwrap_or("")
                .to_uppercase()
                .contains("MUC TIEU")),
            "{tree}"
        );
        // Văn bản rỗng vẫn trả một cây (một nút toàn tài liệu), không ném.
        let empty = engine
            .call("lesson-structure", &[json!("")], NOW)
            .expect("empty structure");
        assert!(empty["nodes"].is_array(), "{empty}");
        assert_eq!(empty["empty"], true, "{empty}");
    }

    #[test]
    fn the_lesson_slot_classifies_with_rules_and_reports_the_missing_semantic_layer() {
        let (_dir, mut engine) = engine();
        let result = engine
            .call(
                "lesson-classify",
                &[json!({
                    "text": "Cau 1: Thu do Viet Nam la gi?\nA. Ha Noi\nB. Hue\nC. Da Nang\nD. Hai Phong"
                })],
                NOW,
            )
            .expect("classify");
        assert_eq!(result["semantic"], "unavailable", "{result}");
        assert!(
            result["semanticNote"]
                .as_str()
                .unwrap_or("")
                .contains("Bộ đọc hiểu chưa sẵn sàng"),
            "{result}"
        );
        let kind = result["kind"].as_str().unwrap_or("");
        assert!(["lesson", "questions", "outline"].contains(&kind), "{result}");
        assert!(result["classification"].is_object(), "{result}");

        // Văn bản rỗng giữ đúng `skipped` của Electron, không báo thiếu model.
        let empty = engine
            .call("lesson-classify", &[json!({ "text": "" })], NOW)
            .expect("empty classify");
        assert_eq!(empty["semantic"], "skipped", "{empty}");
        assert_eq!(empty["semanticNote"].as_str(), Some(""));
    }

    #[test]
    fn the_lesson_slot_rejects_an_unknown_game_type_with_the_electron_sentence() {
        let (_dir, mut engine) = engine();
        let error = engine
            .call("lesson-capacity", &[json!({ "gameType": "khong-co" })], NOW)
            .expect_err("thể loại lạ");
        assert_eq!(error.code(), "DB_INVALID_INPUT");
        assert!(
            error.to_string().contains("Thể loại trò chơi không hợp lệ."),
            "{error}"
        );

        let estimate = engine
            .call(
                "lesson-capacity",
                &[json!({
                    "gameType": "arena",
                    "documentCharacters": 4000,
                    "objectiveCount": 3,
                    "conceptCount": 5,
                    "modelId": "qwen3.5-2b-q4_k_m",
                    "mode": "fast"
                })],
                NOW,
            )
            .expect("capacity");
        let suggested = estimate["suggested"].as_i64().unwrap_or(0);
        assert!((4..=7).contains(&suggested), "{estimate}");
        assert_eq!(estimate["mode"], "fast");
        assert_eq!(estimate["material"]["documentCharacters"], 4000);
    }

    /// Một máy chủ OpenAI tối giản: đọc đúng một request rồi trả `content`.
    /// Trả về `(base_url, join handle)`; join handle cho ta thân request để kiểm
    /// model/prompt đã đi qua Rust chứ không bị dựng lại sai.
    fn serve_one_chat(content: &str) -> (String, std::thread::JoinHandle<String>) {
        use std::io::{Read, Write};

        let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("bind");
        let base_url = format!("http://127.0.0.1:{}", listener.local_addr().expect("addr").port());
        let body = json!({
            "id": "chatcmpl-test",
            "object": "chat.completion",
            "choices": [{
                "index": 0,
                "message": { "role": "assistant", "content": content },
                "finish_reason": "stop"
            }],
            "usage": { "prompt_tokens": 10, "completion_tokens": 20 }
        })
        .to_string();
        let handle = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept");
            let mut buffer = Vec::new();
            let mut chunk = [0_u8; 4096];
            let header_end = loop {
                let read = stream.read(&mut chunk).expect("read headers");
                assert!(read > 0, "client đóng trước khi gửi header");
                buffer.extend_from_slice(&chunk[..read]);
                if let Some(index) = buffer.windows(4).position(|window| window == b"\r\n\r\n") {
                    break index + 4;
                }
            };
            let headers = String::from_utf8_lossy(&buffer[..header_end]).to_string();
            let length = headers
                .lines()
                .find_map(|line| {
                    let (name, value) = line.split_once(':')?;
                    name.eq_ignore_ascii_case("content-length")
                        .then(|| value.trim().parse::<usize>().ok())
                        .flatten()
                })
                .unwrap_or(0);
            while buffer.len() < header_end + length {
                let read = stream.read(&mut chunk).expect("read body");
                if read == 0 {
                    break;
                }
                buffer.extend_from_slice(&chunk[..read]);
            }
            let request = String::from_utf8_lossy(&buffer[header_end..]).to_string();
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            stream.write_all(response.as_bytes()).expect("write response");
            stream.flush().expect("flush");
            request
        });
        (base_url, handle)
    }

    /// Đi trọn đường V8 → `requestChatJson` → `__eg_http` → Rust `post_json` →
    /// máy chủ giả, rồi chuẩn hoá kết quả bằng đúng `analyzeLesson`.
    #[test]
    fn the_lesson_slot_calls_the_model_through_rust_and_normalizes_the_answer() {
        let (_dir, mut engine) = engine();
        let content = std::fs::read_to_string(
            std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("..")
                .join("tests")
                .join("fixtures")
                .join("wizard")
                .join("happy")
                .join("lesson_analysis.json"),
        )
        .expect("fixture phân tích");
        let (base_url, server) = serve_one_chat(&content);
        let result = engine
            .call_with_ai(
                "lesson-analyze",
                &[json!({
                    "text": "I. MUC TIEU\n- Neu duoc vai tro cua anh sang.\nII. NOI DUNG\n- Quang hop o thuc vat.",
                    "name": "giao-an.txt",
                    "mode": "fast",
                    "providerId": "local",
                    "documentId": "doc_test_1",
                    "requestId": "req_test_1",
                    "analysisId": "analysis_test_1",
                    "now": NOW,
                    "plan": { "selection": null },
                    "target": {
                        "requestId": "req_test_1",
                        "model": "qwen3.5-2b-q4_k_m",
                        "mode": "local"
                    }
                })],
                NOW,
                Some(AiTarget {
                    request_id: "req_test_1".to_string(),
                    base_url,
                    api_key: None,
                    mode: "local".to_string(),
                    cancel: std::sync::Arc::new(crate::ai_http::CancelFlag::default()),
                }),
            )
            .expect("analyze");
        let request = server.join().expect("server");
        assert!(request.contains("\"model\":\"qwen3.5-2b-q4_k_m\""), "{request}");
        assert!(request.contains("MUC TIEU"), "prompt thiếu giáo án: {request}");
        let analysis = &result["analysis"];
        assert_eq!(analysis["id"], "analysis_test_1");
        assert_eq!(analysis["documentId"], "doc_test_1");
        assert_eq!(analysis["subject"], "Sinh học");
        assert_eq!(analysis["topic"], "Quang hợp ở thực vật");
        assert_eq!(analysis["objectives"].as_array().map(Vec::len), Some(3));
        assert_eq!(analysis["keyConcepts"].as_array().map(Vec::len), Some(2));

        // Cùng engine: ghép phân tích vào dự án rồi lưu bằng đúng bộ kiểm Zod
        // của Electron — đường mà `lesson.rs` đi sau lượt model.
        let project = engine
            .call(
                "lesson-project",
                &[json!({
                    "action": "create",
                    "document": {
                        "documentId": "doc_test_1",
                        "name": "giao-an.txt",
                        "characters": 82
                    },
                    "analysis": analysis,
                    "now": NOW
                })],
                NOW,
            )
            .expect("lesson-project");
        assert_eq!(project["analysisId"], "analysis_test_1");
        assert_eq!(project["step"], "recommend");
        assert_eq!(project["title"], "Quang hợp ở thực vật");
        let saved = engine
            .call("project:save-draft", &[project], NOW)
            .expect("project:save-draft");
        let project_id = saved["id"].as_str().unwrap_or("");
        assert!(project_id.starts_with("project_"), "{saved}");
        let read = engine
            .call("project:get", &[json!(project_id)], NOW)
            .expect("project:get");
        assert_eq!(read["analysisId"], "analysis_test_1");
        assert_eq!(read["lesson"]["documentId"], "doc_test_1");
    }

    /// `__eg_http` chỉ sống trong một lượt `call_with_ai`; ngoài lượt đó slot
    /// không được lặng lẽ gọi một máy chủ nào.
    #[test]
    fn the_lesson_slot_cannot_reach_http_without_a_target() {
        let (_dir, mut engine) = engine();
        let error = engine
            .call(
                "lesson-analyze",
                &[json!({
                    "text": "bài",
                    "mode": "fast",
                    "providerId": "local",
                    "documentId": "doc_test_1",
                    "requestId": "req_test_1",
                    "target": {
                        "requestId": "req_test_1",
                        "model": "qwen3.5-2b-q4_k_m",
                        "mode": "local"
                    }
                })],
                NOW,
            )
            .expect_err("không có đích AI");
        assert_eq!(error.code(), "DB_INVALID_INPUT", "{error}");
        assert!(
            error.to_string().contains("AI_CONFIG") || error.to_string().contains("AI_CONNECTION"),
            "{error}"
        );
    }
}
