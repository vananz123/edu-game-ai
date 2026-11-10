// `path` cho nhánh Node của pdf.js/mammoth chỉ cần TÁCH chuỗi, không chạm đĩa.
//
// Chỉ ba hàm mà nhánh nạp module gọi tới (`dirname`, `basename`, `join`); hàm
// nào chưa viết thì đây không phải chỗ để đoán — thiếu là lỗi lúc nạp, và test
// Rust của slot EGFILES mở tệp thật nên lỗi đó không lọt qua.
export function basename(value) {
  const text = String(value || '');
  const parts = text.split(/[\\/]/);
  return parts[parts.length - 1] || '';
}

export function dirname(value) {
  const text = String(value || '');
  const cut = text.search(/[\\/][^\\/]*$/);
  return cut < 0 ? '.' : text.slice(0, cut) || '/';
}

export function join(...parts) {
  return parts.filter(part => part !== '').join('/').replace(/\/{2,}/g, '/');
}

export function extname(value) {
  const base = basename(value);
  const dot = base.lastIndexOf('.');
  return dot <= 0 ? '' : base.slice(dot);
}

export default { basename, dirname, join, extname };
