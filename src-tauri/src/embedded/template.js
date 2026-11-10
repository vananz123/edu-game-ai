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

  // V8 của `deno_core` chỉ có global của ECMAScript: không `TextDecoder`,
  // `TextEncoder`, `atob`, `Buffer`, `setTimeout`. Các thư viện đọc tài liệu
  // (pdf.js, jszip, mammoth) dùng `TextDecoder`/`TextEncoder` ở nhánh chạy được
  // trong V8 nhúng, nên hai global này phải có TRƯỚC khi slot nạp.
  if (typeof TextDecoder !== 'function') {
    globalThis.TextDecoder = function TextDecoder(encoding) {
      if (String(encoding || 'utf-8').toLowerCase().replace(/^utf-?8$/u, 'utf8') !== 'utf8') {
        throw new Error('V8 nhúng chỉ giải mã được UTF-8.');
      }
      this.decode = function (bytes) {
        if (!bytes) return '';
        var text = '';
        var index = 0;
        while (index < bytes.length) {
          var lead = bytes[index];
          var length = lead < 0x80 ? 1 : lead >= 0xf0 ? 4 : lead >= 0xe0 ? 3 : lead >= 0xc0 ? 2 : 0;
          if (length === 0) {
            text += '\ufffd';
            index += 1;
            continue;
          }
          if (index + length > bytes.length) {
            text += '\ufffd';
            break;
          }
          var codePoint = length === 1 ? lead
            : length === 2 ? ((lead & 0x1f) << 6) | (bytes[index + 1] & 0x3f)
            : length === 3 ? ((lead & 0x0f) << 12) | ((bytes[index + 1] & 0x3f) << 6) | (bytes[index + 2] & 0x3f)
            : ((lead & 0x07) << 18) | ((bytes[index + 1] & 0x3f) << 12) | ((bytes[index + 2] & 0x3f) << 6) | (bytes[index + 3] & 0x3f);
          text += String.fromCodePoint(codePoint);
          index += length;
        }
        return text;
      };
    };
  }
  if (typeof TextEncoder !== 'function') {
    globalThis.TextEncoder = function TextEncoder() {
      this.encode = function (value) {
        var text = String(value == null ? '' : value);
        var bytes = [];
        for (var index = 0; index < text.length; index += 1) {
          var code = text.charCodeAt(index);
          if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) {
            var low = text.charCodeAt(index + 1);
            if (low >= 0xdc00 && low <= 0xdfff) {
              code = ((code - 0xd800) << 10) + (low - 0xdc00) + 0x10000;
              index += 1;
            }
          }
          if (code < 0x80) bytes.push(code);
          else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
          else if (code < 0x10000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
          else bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
        }
        return new Uint8Array(bytes);
      };
    };
  }

  // Lớp trình duyệt của mammoth (`browser/`) dùng một polyfill `setImmediate`
  // dựng trên `MessageChannel`/`postMessage`/`document` — không có cái nào trong
  // V8 trần. Chính polyfill ấy chỉ cần "chạy sau khi stack hiện tại rỗng", và
  // `queueMicrotask` đúng nghĩa đó. Đặt trước vì polyfill chỉ tự cài khi thiếu.
  if (typeof setImmediate !== 'function') {
    globalThis.setImmediate = function setImmediate(callback) {
      var args = Array.prototype.slice.call(arguments, 1);
      queueMicrotask(function () { callback.apply(null, args); });
      return 0;
    };
    globalThis.clearImmediate = function clearImmediate() {};
  }
  if (typeof setTimeout !== 'function') {
    globalThis.setTimeout = function setTimeout(callback, _delay) {
      var args = Array.prototype.slice.call(arguments, 2);
      queueMicrotask(function () { callback.apply(null, args); });
      return 0;
    };
    globalThis.clearTimeout = function clearTimeout() {};
    globalThis.setInterval = function setInterval() {
      throw new Error('V8 nhúng không có bộ hẹn giờ lặp: slot phải chạy xong trong một lượt.');
    };
    globalThis.clearInterval = function clearInterval() {};
  }

  // pdf.js 1.10.100 mở mỗi bundle con bằng khối tương thích
  // `if (typeof PDFJS > "u" || !PDFJS.compatibilityChecked) { … }` rồi mới
  // `typeof PDFJS>"u" && (R.PDFJS = {})`. Trên trình duyệt `PDFJS` là biến toàn
  // cục có sẵn; ở V8 trần `typeof` chạy trước dòng gán nên ném `ReferenceError`.
  // Có sẵn một đối tượng rỗng thì nhánh đầu chỉ thấy "đã cài rồi".
  if (typeof globalThis.PDFJS !== 'object' || !globalThis.PDFJS) globalThis.PDFJS = {};

  var available = {};
  /* @slot EGVALIDATE */
  /* @slot EGFIELDS */
  /* @slot EGCONTRACTS */
  /* @slot EGOPS */
  /* @slot EGPROJECTS */
  /* @slot EGPACKAGES */

  // `require` mà slot nhập tài liệu (EGFILES) còn với tới sau khi đã thay thư
  // viện bằng bản trình duyệt: `module` cho `createRequire` của mammoth và
  // `node:crypto`. Cả hai đều ném câu đọc được nếu một nhánh Node lỡ được chạy
  // — bundle dựng ra không có lời gọi `require` nào còn lại (cổng ở
  // `scripts/build-embedded-js.js` soi chính điều đó), nên đây chỉ là lưới.
  globalThis.__eg_require = function (name) {
    if (name === 'module') {
      return {
        createRequire: function () {
          return globalThis.__eg_require;
        }
      };
    }
    if (name === 'node:crypto' || name === 'crypto') {
      return {
        randomUUID: function () {
          return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (ch) {
            var n = Math.floor(Math.random() * 16);
            return (ch === 'x' ? n : (n & 3) | 8).toString(16);
          });
        }
      };
    }
    throw new Error('V8 nhúng không có module `' + String(name) + '`.');
  };

  /* @slot EGFILES */

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
  var projects = available.EGPROJECTS;
  var packages = available.EGPACKAGES;
  var files = available.EGFILES;

  /**
   * Byte của một tệp do Rust đọc, gửi sang dưới dạng chuỗi base64 (JSON không có
   * kiểu byte).
   *
   * V8 trần của `deno_core` không có `atob` lẫn `Buffer`, nên bảng giải mã nằm
   * ngay đây. Bảng chỉ 64 ký tự, giải mã theo nhóm 4 là đủ nhanh cho tệp ≤ 10 MB
   * (cùng giới hạn với `main.ts`), và `=` ở cuối là đệm, không phải byte.
   */
  var BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var BASE64_VALUES = (function () {
    var table = {};
    for (var index = 0; index < BASE64_ALPHABET.length; index += 1) {
      table[BASE64_ALPHABET.charAt(index)] = index;
    }
    return table;
  })();

  function bytesOf(base64) {
    var text = String(base64 || '');
    while (text.length % 4 !== 0) text += '=';
    var bytes = new Uint8Array((text.length / 4) * 3);
    var at = 0;
    for (var index = 0; index < text.length; index += 4) {
      var a = BASE64_VALUES[text.charAt(index)];
      var b = BASE64_VALUES[text.charAt(index + 1)];
      var c = BASE64_VALUES[text.charAt(index + 2)];
      var d = BASE64_VALUES[text.charAt(index + 3)];
      if (a === undefined || b === undefined) {
        throw new Error('Chuỗi base64 của tệp bị hỏng.');
      }
      var triple = (a << 18) | (b << 12) | ((c || 0) << 6) | (d || 0);
      bytes[at] = (triple >> 16) & 255;
      at += 1;
      if (c !== undefined) {
        bytes[at] = (triple >> 8) & 255;
        at += 1;
      }
      if (d !== undefined) {
        bytes[at] = triple & 255;
        at += 1;
      }
    }
    return bytes.subarray(0, at);
  }

  /**
   * Bộ giải mã UTF-8 — `TextDecoder` đã được cài ở đầu tệp khi V8 không có.
   * `encodeURIComponent` không cần: bảng giải mã nằm trong polyfill đó.
   */
  var decodeUtf8 = (function () {
    var decoder = new TextDecoder('utf-8');
    return function (bytes) { return decoder.decode(bytes); };
  })();

  /** Độ dài UTF-8 của một chuỗi, cùng lý do: không có `TextEncoder`. */
  function utf8Length(text) {
    return new TextEncoder().encode(String(text)).length;
  }

  /**
   * Bảng ký tự của bộ đọc bảng tính khi V8 không có `Buffer` của Node.
   *
   * `importQuestionsFromFile` nhận `Buffer` (bên Electron là `fs.readFile`) và
   * dùng đúng hai thứ của nó: `file.toString('utf8')` cho `.csv`/`.tsv` và
   * `Buffer.byteLength(text, 'utf8')` cho giới hạn của XML trong `.xlsx`. Một
   * `Uint8Array` có hai hàm đó là đủ để chính bộ đọc ấy chạy nguyên vẹn; bộ mã
   * hoá/giải mã UTF-8 còn lại là của `decodeUtf8`/`utf8Length` ở trên.
   */
  function bufferView(bytes) {
    var view = new Uint8Array(bytes);
    view.toString = function (encoding) {
      if (String(encoding || 'utf8').toLowerCase().replace(/^utf-?8$/u, 'utf8') !== 'utf8') {
        throw new Error('V8 nhúng chỉ đọc được tệp dạng UTF-8.');
      }
      return decodeUtf8(view);
    };
    return view;
  }
  var BufferShim = {
    from: function (bytes) {
      return bufferView(bytes);
    },
    byteLength: function (text) {
      return utf8Length(String(text));
    }
  };

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
    // Nhóm `project:*`: năm kênh của preload, cộng một kênh dọn ảnh.
    'project:save-draft': async function (project) { return projects.saveProjectDraft(store, project, __eg_now); },
    'project:get': async function (projectId) { return projects.getProject(store, projectId); },
    'project:list': async function () { return projects.listProjects(store); },
    'project:delete': async function (projectId) { return projects.deleteProject(store, projectId); },
    'project:delete-many': async function (projectIds) { return projects.deleteProjects(store, projectIds); },
    // Bản nháp còn nhắc tới ảnh nào — cùng câu đọc với `library:image-refs`, tách
    // tên để cổng kiểm tra biết kênh nào dọn ảnh sau một lệnh xoá dự án.
    'project:image-refs': async function () {
      return store.select('SELECT data_json FROM game_projects', {});
    },
    // Id ảnh mà mọi trò chơi đã lưu và mọi bản nháp còn nhắc tới — Rust đọc
    // trước khi dọn `images/<id>.img` sau một lệnh xoá (`removeUnusedCustomImages`).
    'library:image-refs': async function () {
      var games = await store.select('SELECT data_json FROM games', {});
      var projects = await store.select('SELECT data_json FROM game_projects', {});
      return games.concat(projects);
    },
    // Gói `.egame`: Rust mở hộp thoại và đọc/ghi tệp, slot này chỉ thấy chuỗi.
    // `package:read` nhận luôn danh sách id đã lưu để gói trùng id không đè dòng
    // thật; danh sách đọc ngay trong cùng lượt gọi, không qua Rust.
    'package:export': async function (game) { return packages.writePackage(game); },
    'package:read': async function (text, now, nonce) {
      var rows = await store.select('SELECT id FROM games', {});
      return packages.readPackage(text, now, nonce, rows.map(function (row) { return row.id; }));
    },
    'package:max-bytes': async function () { return packages.IMPORT_GAME_MAX_BYTES; },
    // Nhập tài liệu: Rust chọn tệp và đọc byte, slot này chỉ nhận tên tệp + byte.
    // Cùng năm định dạng và cùng thư viện của `main.ts`.
    'files:import-document': async function (fileName, base64) {
      return files.importDocument(fileName, bytesOf(base64));
    },
    'files:import-document-from-path': async function (fileName, base64, sizeBytes) {
      return files.importDocumentFromPath(fileName, bytesOf(base64), sizeBytes);
    },
    // Nhập bảng câu hỏi: luật đọc bảng tính của Electron (`question-import.ts`),
    // chỉ khác `Buffer` đến từ `BufferShim` ở trên.
    'files:import-questions': async function (fileName, base64) {
      var questions = await files.importQuestionsFromFile(fileName, BufferShim.from(bytesOf(base64)));
      return { name: files.baseName(fileName), questions: questions };
    },
    // Trần kích thước tệp nhập: Rust đọc con số từ đây thay vì gõ lại 10 MB.
    'files:max-bytes': async function () { return files.DOCUMENT_MAX_BYTES; },
    'files:questions-max-bytes': async function () { return files.QUESTIONS_MAX_BYTES; }
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
