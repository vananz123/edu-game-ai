// `os` cho nhánh Node của pdf.js 1.10.100 (`NodeCachingCanvasFactory`) và của
// mammoth: chúng gọi `os.cpus()` lúc nạp module để đếm nhân, không dùng kết quả
// cho việc đọc chữ. Số 0 ở đây chỉ nói "không biết": chỗ gọi chỉ so với hai
// nhân hay ít hơn và sinh tên tệp tạm bằng số ngẫu nhiên — nhánh đó không được
// slot nhập tài liệu chạy tới (nó nhận byte trong bộ nhớ, không đường tệp tạm).
export function cpus() {
  return [];
}

export function totalmem() {
  return 0;
}

export function platform() {
  return 'win32';
}

export default { cpus, totalmem, platform };
