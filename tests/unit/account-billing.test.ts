/**
 * #364 — thẻ "Gói Pro" trong panel tài khoản.
 *
 * Ba câu không được phép sai, vì mỗi câu sai đều là chuyện tiền:
 *   - giá `0đ` không bao giờ được in ra (một câu "0đ / 14 ngày" là một lời nói dối);
 *   - "chưa bật thanh toán" phải KHÁC "đang dùng Pro" và khác "chưa đọc được thông tin";
 *   - nút "Nâng cấp" chỉ tồn tại khi bán được thật, và chỉ có đúng một nút.
 *
 * Đo trên tệp ĐÃ BIÊN DỊCH (classic script, không import), nên test và app đọc cùng một
 * artefact.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const DIST = path.join(__dirname, '..', '..', '..', 'dist', 'src');

async function main() {
  const file = path.join(DIST, 'renderer', 'features', 'account.js');
  assert.ok(fs.existsSync(file), 'renderer/features/account.js must exist — run npm run build');
  const escapeHtml = value => String(value == null ? '' : value)
    .replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;');
  const context = vm.createContext({
    console,
    escapeHtml,
    // `uiIcon` trong app là một hàm vẽ SVG; ở đây chỉ cần nó trả về một chuỗi có thật để
    // phép đo không phụ thuộc vào bộ icon.
    uiIcon: (name) => '[icon:' + name + ']',
    document: { querySelector: () => null },
    desktop: { call: async () => null },
  });
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });

  const run = (code) => vm.runInContext(code, context);
  const html = (billing) => {
    context.__billing = JSON.parse(JSON.stringify(billing));
    return run('accountState.billing = __billing; accountProHtml()');
  };

  // 1. Đọc xong nhưng chưa có dữ liệu: trạng thái "đang đọc", không phải "miễn phí".
  {
    const out = html(null);
    assert.match(out, /data-account-pro="loading"/u);
    assert.equal(/Nâng cấp/u.test(out), false, 'chưa biết giá thì chưa được mời mua');
  }

  // 2. Chưa bật thanh toán: nói tên biến còn thiếu, và KHÔNG có nút mua.
  {
    const out = html({ ok: true, configured: false, missing: ['PAYOS_CLIENT_ID'], priceVnd: 99000, plan: 'free' });
    assert.match(out, /data-account-pro="unconfigured"/u);
    assert.match(out, /Chưa mở/u);
    assert.match(out, /PAYOS_CLIENT_ID/u);
    assert.equal(/data-account-upgrade/u.test(out), false, 'không được mời mua khi máy chủ chưa bán được');
  }

  // 3. Lỗi đọc: có đường thử lại, không có nút mua.
  {
    const out = html({ ok: false, code: 'network_error', message: 'Không đọc được thông tin thanh toán.' });
    assert.match(out, /data-account-pro="error"/u);
    assert.match(out, /data-account-billing-load/u);
    assert.equal(/data-account-upgrade/u.test(out), false);
  }

  // 4. Gói miễn phí: giá đúng định dạng Việt Nam, quyền lợi đúng số credits, một nút mua.
  {
    const out = html({ ok: true, configured: true, plan: 'free', priceVnd: 99000, periodDays: 14, credits: 500, order: null });
    assert.match(out, /data-account-pro="free"/u);
    assert.match(out, /99\.000đ/u, 'giá phải đọc được như người Việt đọc');
    assert.match(out, /500 credits/u);
    assert.match(out, /250 lần soạn câu hỏi/u, 'credits phải được dịch sang việc giáo viên làm');
    assert.equal((out.match(/data-account-upgrade/gu) || []).length, 1, 'đúng một nút mua');
    // "0đ" nằm trong "99.000đ" nên phải hỏi đúng câu: có một con số 0đỒNG đứng riêng không?
    assert.equal(/>0đ|[^\d]0đ /u.test(out), false, 'không được in giá 0đ');
    // Giá xuất hiện đúng MỘT lần: hai lần là hai câu nói cùng một chuyện.
    assert.equal((out.match(/99\.000đ/gu) || []).length, 1, 'giá chỉ được in một lần');
  }

  // 5. Đang có đơn chờ: nhắc đang chờ, vẫn cho mở lại (một đơn, không hai QR).
  {
    const out = html({
      ok: true, configured: true, plan: 'free', priceVnd: 99000, periodDays: 14, credits: 500,
      order: { status: 'pending', amountVnd: 99000, message: 'Đang chờ chuyển khoản 99.000đ.' },
    });
    assert.match(out, /data-account-order-pending/u);
    assert.match(out, /Đang chờ chuyển khoản/u);
    assert.equal((out.match(/data-account-upgrade/gu) || []).length, 1);
  }

  // 6. Đang là Pro: không còn nút mua, có hạn kỳ, và nói rõ là không tự trừ tiền.
  {
    const out = html({
      ok: true, configured: true, plan: 'plus', priceVnd: 99000, periodDays: 14, credits: 500,
      periodEnd: '2026-12-10T09:00:00.000Z',
    });
    assert.match(out, /data-account-pro="active"/u);
    assert.match(out, /Đang dùng gói Pro/u);
    assert.match(out, /10\/12/u, 'hạn kỳ phải hiện cho người vừa trả tiền');
    assert.match(out, /không tự trừ tiền/u);
    assert.equal(/data-account-upgrade|Nâng cấp lên Pro/u.test(out), false, 'đang Pro thì không mời mua nữa');
  }

  // 7. Giá thiếu/không đọc được: không in "0đ", chỉ hiện nhãn gói.
  {
    const out = html({ ok: true, configured: true, plan: 'free', priceVnd: 0, periodDays: 14, credits: 500 });
    assert.equal(/>0đ|[^\d]0đ /u.test(out), false, 'giá thiếu thì không in gì, không in 0đ');
    assert.match(out, /Gói Pro/u);
    assert.equal(/cho mỗi kỳ/u.test(out), false, 'không có giá thì không được mời mua bằng một con số');
  }

  // 8. Tiền tệ là hàm thuần: 99000 → '99.000đ', 0/NaN → chuỗi rỗng.
  assert.equal(run("accountMoney(99000)"), '99.000đ');
  assert.equal(run("accountMoney(0)"), '');
  assert.equal(run("accountMoney('x')"), '');
  assert.equal(run("accountDateShort('2026-12-10T09:00:00.000Z')"), '10/12');
  assert.equal(run("accountDateShort('')"), '');

  console.log('account-billing: 8 nhóm khẳng định đã qua');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

export {};
