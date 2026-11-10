// `url` cho những đoạn cần `url.parse` mà vẫn nằm trong bundle.
//
// Chỗ gọi duy nhất còn sống là `require("url")` của UMD trong
// `jszip/dist/jszip.min.js`: esbuild dịch nó thành import và không có cách nào
// bỏ đoạn đó đi. Đoạn đó chỉ chạy khi có người đọc tệp qua đường dẫn, không phải
// đường `loadAsync(Uint8Array)` mà slot nhập tài liệu dùng — nên một `parse`
// trả về `null` là đủ để bundle nạp được mà không mở một cửa đọc tệp nào.
export function parse() {
  return null;
}

export const URL = globalThis.URL;

export default { parse, URL };
