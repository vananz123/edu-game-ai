// Cổng cho `server/quota.ts`: hai loại lỗi hạn mức phải nói hai câu khác nhau.
//
// Lỗi đo được ngày 24/11: project chưa chạy migration ⇒ PostgREST `PGRST202` ⇒
// gateway trả 503 "Vui lòng thử lại sau", một chỉ dẫn không bao giờ thành công.
import assert from 'node:assert/strict';
import { describeQuotaFailure, isMissingFunction } from '../../server/quota';

// 1. Ba hàm thiếu — đúng dạng PostgREST trả về khi chưa có hàm.
const missing = {
  code: 'PGRST202',
  message: 'Could not find the function public.consume_generation_quota(p_month, p_user_id) in the schema cache',
  details: 'Searched for the function public.consume_generation_quota with parameters p_month, p_user_id',
};
assert.equal(isMissingFunction(missing), true, 'PGRST202 là thiếu hàm');
const missingFailure = describeQuotaFailure(missing);
assert.equal(missingFailure.status, 500, 'thiếu hàm không phải sự cố tạm thời ⇒ không phải 503');
assert.equal(missingFailure.body.code, 'server_not_migrated', 'mã lỗi nói được nguyên nhân');
assert.match(missingFailure.body.error, /migration/, 'câu trả lời nói được việc phải làm');
assert.ok(!/thử lại/i.test(missingFailure.body.error), 'không bảo bấm lại một việc không thể thành công');

// 2. Dạng khác của cùng nguyên nhân (Postgres nói thẳng "does not exist").
assert.equal(isMissingFunction({ message: 'function public.consume_credits(uuid) does not exist' }), true, 'does not exist cũng là thiếu hàm');

// 3. Máy chủ bận / lỗi mạng: câu cũ là đúng, và là 503.
const busy = describeQuotaFailure({ code: '08006', message: 'connection failure' });
assert.equal(busy.status, 503, 'lỗi tạm thời vẫn là 503');
assert.equal(busy.body.code, 'quota_unavailable', 'mã lỗi riêng');
assert.match(busy.body.error, /thử lại/i, 'bận thì bảo thử lại là đúng');
assert.equal(describeQuotaFailure(null).status, 503, 'không có lỗi cụ thể vẫn phải trả lời');
assert.equal(isMissingFunction(null), false, 'không có lỗi thì không phải thiếu hàm');

console.log('server-quota: 3 nhóm kiểm đã qua');
