// `node:crypto` cho bundle chạy trong V8 nhúng.
//
// Electron dựng id ảnh bằng `crypto.randomBytes(16).toString('hex')`. Ở đây
// dùng `Math.random` — KHÔNG phải nguồn ngẫu nhiên an toàn mật mã, và không
// cần phải thế: id chỉ để không trùng với id khác, đúng như `id()` của
// `main.ts` và `UUID_FALLBACK` của `scripts/build-embedded-js.js`.
//
// `randomUUID` giữ nguyên hình dạng v4 để `library-ops.ts`/`game-service.ts`
// dựng id như bên Electron.
export function randomBytes(size) {
  const length = Math.max(0, Math.floor(Number(size) || 0));
  const bytes = new Uint8Array(length);
  for (let index = 0; index < length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  return bytes;
}

export function randomUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
    const value = Math.floor(Math.random() * 16);
    const digit = character === 'x' ? value : (value & 0x3) | 0x8;
    return digit.toString(16);
  });
}
