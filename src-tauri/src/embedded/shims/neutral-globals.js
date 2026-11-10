// Đầu bundle của slot nhập tài liệu — chèn TRƯỚC mã bundle CJS.
//
// Bundle CJS cần một hàm `require`; CHỈ nhánh shim `neutral-globals.js` được
// chèn vào đầu bundle (các slot khác không có hàm này, và esbuild báo lỗi nếu
// một lời gọi `require` còn sót lại — đúng điều muốn biết lúc dựng).
//
// Bản gốc chỉ báo lỗi có tên gói. `scripts/build-embedded-js.js` thay hai lời gọi
// `module` / `node:crypto` bằng `__eg_require(...)`, và `template.js` cài
// `globalThis.__eg_require` (chỉ có hai cầu ấy) một lần khi nạp snippet.
//
// Tệp này được NỐI NGUYÊN VĂN vào đầu bundle (một script thường, không qua
// esbuild), nên ở đây không được có câu `export` hay `import`: câu `export
// default` của bản trước làm V8 nhúng ném `Unexpected token 'export'` ngay lúc
// nạp bundle — lỗi chỉ hiện ở test Rust, không ở cổng dựng Node.
function require(name) {
  throw new Error(`V8 nhúng không có module \`${name}\`.`);
}
