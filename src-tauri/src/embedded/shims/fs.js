// `fs` cho bản Node của mammoth (`lib/fs.js` chỉ dùng để đọc/ghi ảnh trong
// tài liệu). Ở vỏ Tauri tài liệu được đọc từ bộ nhớ (`{ buffer }`), nên các
// lối này chỉ cần ném một câu đọc được thay vì một `ReferenceError` khó hiểu.
//
// `scripts/build-embedded-js.js` thay `lib/fs.js` và `lib/unzip.js` của mammoth
// bằng bản `browser/` của chính nó trước khi bundle; tệp này chỉ là lưới an
// toàn nếu một bản mammoth khác vẫn lối vào nhánh Node.
//
// pdf.js `v1.10.100` dựng nhánh tệp của nó ở cấp module:
// `fs.createWriteStream.bind(fs)` — gói CJS nên nó đọc THUỘC TÍNH TRỰC TIẾP của
// namespace, không đọc qua `default`. Vì vậy mọi khoá phải là export có tên.
const notAvailable = () => {
  throw new Error('V8 nhúng không có hệ thống tệp: tài liệu phải được đọc vào bộ nhớ trước.');
};

export const readFileSync = notAvailable;
export const writeFileSync = notAvailable;
export const createWriteStream = notAvailable;
export const promises = { readFile: notAvailable, writeFile: notAvailable };

export default { promises, readFileSync, writeFileSync, createWriteStream };
