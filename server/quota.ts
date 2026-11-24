// server/quota.ts — dịch lỗi hạn mức thành câu nói ĐÚNG việc phải làm.
//
// Ngày 24/11 gateway trả "Không kiểm tra được hạn mức. Vui lòng thử lại sau." khi
// thật ra ba hàm RPC chưa hề tồn tại trong project (PostgREST `PGRST202`). Câu đó
// bảo giáo viên bấm lại — việc không bao giờ thành công — và bảo lập trình viên
// không có gì cả. Hai loại lỗi này phải khác nhau ở phía máy chủ.

export interface RpcError {
  code?: string;
  message?: string;
  details?: string;
}

/** Hàm RPC chưa được cài (migration chưa chạy) — không phải sự cố tạm thời. */
export function isMissingFunction(error: RpcError | null | undefined): boolean {
  if (!error) return false;
  const text = [error.code, error.message, error.details].filter(Boolean).join(' ');
  return (
    text.includes('PGRST202') ||
    /could not find the function/i.test(text) ||
    /function .* does not exist/i.test(text)
  );
}

export interface QuotaFailure {
  status: number;
  body: { error: string; code: string };
}

export function describeQuotaFailure(error: RpcError | null | undefined): QuotaFailure {
  if (isMissingFunction(error)) {
    return {
      status: 500,
      body: {
        // Nói cho người vận hành biết phải làm gì; giáo viên đọc được câu này cũng
        // hiểu là "không phải lỗi của mình" chứ không bấm lại vô ích.
        error: 'Máy chủ AI chưa được cài đặt đầy đủ (thiếu hàm hạn mức). Quản trị viên cần chạy tệp migration của máy chủ.',
        code: 'server_not_migrated',
      },
    };
  }
  return {
    status: 503,
    body: { error: 'Không kiểm tra được hạn mức. Vui lòng thử lại sau.', code: 'quota_unavailable' },
  };
}
