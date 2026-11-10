// `module` cho các gói CJS cần `createRequire` (mammoth, pdf-parse).
//
// `template.js` đưa một `globalThis.__eg_require` CHỈ có `node:crypto` (UUID
// cho id) thay vào chỗ `require` trong IIFE của engine. `createRequire(x)`
// trả đúng hàm đó, bất kể đường dẫn truyền vào — nên một gói gọi
// `createRequire(__filename)` vẫn chỉ với tới được thứ đã cho.
//
// `require` thứ hai là để `fileURLToPath`/`builtinModules` không làm gói nào
// chết lúc nạp; nhánh nào cần đọc tệp thật đã được bundle thay bằng bản trình
// duyệt (xem `scripts/build-embedded-js.js`).
export function createRequire() {
  return globalThis.__eg_require;
}

export const builtinModules = [];
