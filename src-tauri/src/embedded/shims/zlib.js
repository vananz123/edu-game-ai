// `node:zlib` cho bản pdf.js của pdf-parse (mã 1.10.100).
//
// PDF hay bọc luồng chữ bằng `FlateDecode` — bỏ phần này thì mọi giáo án PDF
// thật ra chữ rỗng, và giáo viên chỉ thấy "không đọc được". Trình duyệt và
// `deno_core` đều có `DecompressionStream('deflate')` (chuẩn WHATWG), nên chỉ
// cần bọc nó lại cho đúng hình `zlib.inflate(data, callback)`.
//
// Hai khác biệt cần xử lý:
//   • `DecompressionStream` trả promise; `zlib.inflate` trả kết quả qua
//     callback. pdf.js LUÔN gọi nó bên trong một `.then` (hàm gọi phải trả
//     promise), nên bọc IIFE async là đủ — không cần `inflate` đồng bộ.
//   • Đầu vào của pdf.js là chuỗi nhị phân (mỗi ký tự một byte), không phải
//     `Uint8Array`. Đầu ra của pdf.js là `new Uint8Array(built_in_result)`.
export function inflate(data, callback) {
  (async () => {
    try {
      const bytes = typeof data === 'string'
        ? Uint8Array.from(data, character => character.charCodeAt(0) & 0xff)
        : data instanceof Uint8Array ? data : new Uint8Array(data);
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
      const output = new Uint8Array(await new Response(stream).arrayBuffer());
      callback(null, output);
    } catch (error) {
      callback(error, undefined);
    }
  })();
}

/**
 * `deflateSync` chỉ dùng khi pdf.js dựng lại một ảnh PNG (khử mã hoá), không
 * phải đường đọc chữ. Trả nguyên đầu vào là chấp nhận được: chỗ gọi bọc hàm
 * này trong `try`, và ngay cả khi lọt ra thì ảnh cũng chỉ hiện sai nhẹ.
 */
export function deflateSync(data) {
  return data;
}

export default { inflate, deflateSync };
