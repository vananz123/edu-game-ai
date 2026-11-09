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
    ops = [op_sql_select, op_sql_execute, op_sql_transaction],
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
        "SELECT data_json FROM games",
        "SELECT data_json FROM game_projects",
        "DELETE FROM games WHERE id = @id",
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
        engine.call("library:seed", &[], &crate::library::now())?;
        Ok(engine)
    }

    pub fn new(connection: Connection) -> Result<Self, DbError> {
        let shared: SharedRuntime = Rc::new(RefCell::new(RuntimeInner {
            connection,
            sql_calls: 0,
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
    }

    /// Số câu SQL đã chạy — cổng kiểm tra đối chiếu với số dòng thật.
    pub fn sql_calls(&self) -> usize {
        self.shared.borrow().sql_calls
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
            .execute_script("eg:run", format!("Promise.resolve({expression})"))
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
}
