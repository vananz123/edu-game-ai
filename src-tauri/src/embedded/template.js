// Mẫu chạy trong V8 nhúng của vỏ Tauri — TỆP SINH TỰ ĐỘNG, đừng sửa tay.
//
// Nguồn: scripts/build-embedded-js.js (các khối nối từ src/services/…) và
// src-tauri/src/embedded/template.js (đoạn điều phối dưới đây). Sửa luật lưu
// trò chơi ở src/services/storage/library-ops.ts rồi chạy lại
// `node scripts/build-embedded-js.js`.
//
// Biến toàn cục do Rust đặt trước mỗi lượt chạy:
//   __eg_input  — chuỗi JSON: { op: string, args: any[] }  (duy nhất)
//   __eg_store  — cầu SQL: select(sql, params), execute(sql, params),
//                 transaction(statements); tự đóng gói JSON cho ba op của Rust
//                 (ba op đó đồng bộ, nên mỗi hàm ở đây trả giá trị ngay)
//   __eg_now    — chuỗi ISO của thời điểm xử lý lời gọi
(function () {
  'use strict';

  // Nơi `scripts/build-embedded-js.js` chèn bundle CJS của từng module TypeScript.
  var available = {};
  /* @slot EGVALIDATE */
  /* @slot EGFIELDS */
  /* @slot EGOPS */

  // Luật trong `library-ops.ts` viết theo kiểu đồng bộ (bên Electron
  // `better-sqlite3` cũng đồng bộ). Ba op của Rust cũng đồng bộ, nên cầu này
  // không thêm một lớp async nào; `await` trong các hàm dưới vẫn hợp lệ vì
  // chúng đang nằm trong `async function`.
  var store = {
    select: function (sql, params) {
      return JSON.parse(__eg_store.select(JSON.stringify({ sql: sql, params: params })));
    },
    execute: function (sql, params) {
      return __eg_store.execute(JSON.stringify({ sql: sql, params: params }));
    },
    transaction: function (statements) {
      return JSON.parse(__eg_store.transaction(JSON.stringify({ statements: statements })));
    }
  };

  var ops = available.EGOPS;

  /** Bảng op → hàm; thiếu op là lỗi của người dựng, không phải của dữ liệu. */
  var dispatch = {
    'library:get': async function () { return ops.getLibraryPayload(store); },
    'library:save-game': async function (game) { return ops.saveGame(store, game, __eg_now); },
    'library:delete-game': async function (gameId) { return ops.deleteGame(store, gameId); },
    'library:delete-games': async function (gameIds) { return ops.deleteGames(store, gameIds); },
    'library:save-session': async function (session) { return ops.saveSession(store, session, __eg_now); },
    'library:delete-sessions': async function (sessionIds) { return ops.deleteSessions(store, sessionIds); },
    // Lần chạy đầu: `library.rs` gọi op này ngay sau khi mở tệp.
    'library:seed': async function () { return ops.seedLibrary(store, __eg_now); },
    // Id ảnh mà mọi trò chơi đã lưu và mọi bản nháp còn nhắc tới — Rust đọc
    // trước khi dọn `images/<id>.img` sau một lệnh xoá (`removeUnusedCustomImages`).
    'library:image-refs': async function () {
      var games = await store.select('SELECT data_json FROM games', {});
      var projects = await store.select('SELECT data_json FROM game_projects', {});
      return games.concat(projects);
    }
  };

  globalThis.__eg_run = async function () {
    var input;
    try {
      input = JSON.parse(String(__eg_input));
    } catch (error) {
      return JSON.stringify({ ok: false, code: 'EG_BAD_INPUT', message: 'Đầu vào không phải JSON.' });
    }
    var handler = dispatch[input && input.op];
    if (!handler) {
      return JSON.stringify({ ok: false, code: 'EG_UNKNOWN_OP', message: 'Thao tác `' + String(input && input.op) + '` chưa có trong V8 nhúng.' });
    }
    try {
      var args = Array.isArray(input.args) ? input.args : [];
      return JSON.stringify({ ok: true, value: await handler.apply(null, args) });
    } catch (error) {
      // Thông điệp của hàm kiểm dữ liệu là câu giáo viên đọc được, nên Rust
      // nhận nó nguyên văn (`EG_OP_FAILED` đổi thành lỗi luật).
      var message = error && typeof error.message === 'string' && error.message ? error.message : String(error);
      return JSON.stringify({ ok: false, code: 'EG_OP_FAILED', message: message });
    }
  };
})();
