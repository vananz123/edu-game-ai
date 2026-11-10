// Hai module lõi Node mà `http`/`https` cần cho nhánh mạng của pdf.js.
//
// Slot nhập tài liệu đọc PDF từ byte trong bộ nhớ (`getDocument({data})`), nên
// nhánh tải PDF qua URL không bao giờ chạy. esbuild vẫn dịch các import của
// nhánh đó ở mức module, nên đây phải là một module NẠP ĐƯỢC chứ không ném lỗi
// lúc nạp — hàm nào được gọi thì ném một câu đọc được tại chỗ gọi.
function refuse(name) {
  return function () {
    throw new Error(`V8 nhúng không có module \`${name}\` — tài liệu phải được đọc vào bộ nhớ trước.`);
  };
}

export const request = refuse('http');
export const get = refuse('http');
export const createServer = refuse('http');
export const Agent = refuse('http');

export default { request, get, createServer, Agent };
