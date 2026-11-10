// `jszip` cho bản `dist/jszip.min.js`.
//
// Bản `lib/` của jszip là một cây stream của Node (`stream`, `util`, `events`),
// không có trong V8 nhúng và không nên có. Bản `dist/` là bundle UMD tự chứa;
// nó chỉ dò `Buffer` và `process` để chọn nhánh I/O, nên hai thứ đó được giả
// làm ngay đây thay vì nhúng cả polyfill Node.
//
// Tất cả ba lớp dữ liệu của `dist/` đều nhận `Uint8Array`, nên các lối
// `readFile`, `concat` của `Buffer` không bao giờ chạy tới.

/** `Buffer.isBuffer` = false: mọi thứ đi qua đây là `Uint8Array`, không phải Buffer. */
export const Buffer = { isBuffer: () => false };

/** `process` giả: jszip chỉ đọc `platform` để ghi cờ UNIX/DOS của zip. */
export const process = { platform: 'win32', browser: true };
