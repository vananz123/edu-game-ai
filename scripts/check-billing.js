#!/usr/bin/env node
/**
 * #364 — "bán gói Pro được chưa?" trả lời bằng MÁY CHỦ ĐANG CHẠY, không bằng lòng tin.
 *
 * Ba câu hỏi, theo đúng thứ tự việc:
 *   1. migration đã chạy chưa (bảng `billing_orders`, cột `subscriptions.period_end`);
 *   2. nhà cung cấp thanh toán đã khai chưa (PayOS + giá/kỳ/credits);
 *   3. giáo viên có mua được không — tức `/v1/billing/checkout` có trả về một `checkoutUrl`.
 *
 * Câu 3 KHÔNG được chạy mặc định: nó tạo một đơn thật trong DB và (với PayOS) một link thật.
 * Vì vậy mặc định chỉ đọc trạng thái; muốn đo đường mua thì thêm `--checkout`.
 *
 * Cách dùng:
 *   node --env-file=.env scripts/check-billing.js             # chỉ đọc
 *   node --env-file=.env scripts/check-billing.js --checkout   # tạo một đơn thật
 *   node --env-file=.env scripts/check-billing.js --url https://... --email ...
 */
const URL_ENV = 'EDUGAME_AI_GATEWAY_URL';
const DEFAULT_BASE = 'https://ai-gateway.dovanan-bth2017.workers.dev';

function arg(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index > 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const lines = [];
let failed = 0;

function report(ok, name, detail) {
  if (!ok) failed += 1;
  lines.push((ok ? 'OK   ' : 'FAIL ') + name + (detail ? '  — ' + detail : ''));
}

/**
 * Token thật của một tài khoản thử, để đo bằng đúng đường mà ứng dụng đi (Bearer token), chứ
 * không bằng service-role key — key đó bỏ qua mọi luật RLS và sẽ làm cổng này đo một sản phẩm
 * khác với sản phẩm giáo viên dùng.
 */
async function mintToken(supabaseUrl, serviceKey, email) {
  const link = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', email }),
    redirect: 'manual',
  });
  if (!link.ok) throw new Error(`generate_link ${link.status}`);
  const body = await link.json();
  const verify = await fetch(`${supabaseUrl}/auth/v1/verify?type=magiclink&token=${body.hashed_token}`, { redirect: 'manual' });
  const location = verify.headers.get('location') || '';
  const token = new URLSearchParams(location.split('#')[1] || '').get('access_token');
  if (!token) throw new Error('không lấy được access_token từ link đăng nhập');
  return token;
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const email = arg('--email', process.env.EDUGAME_BILLING_TEST_EMAIL || 'xathiennghiep@gmail.com');
  const base = (arg('--url', process.env[URL_ENV] || DEFAULT_BASE)).replace(/\/+$/u, '');

  report(Boolean(supabaseUrl && serviceKey), 'có SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY để lấy token thử', supabaseUrl ? 'url có' : 'thiếu SUPABASE_URL');
  if (!supabaseUrl || !serviceKey) return finish();

  const health = await fetch(`${base}/health`).then(r => r.json()).catch(() => null);
  report(Boolean(health && health.ok), 'gateway trả lời /health', health ? `${health.service} ${health.version}` : 'không gọi được');
  if (!health) return finish();

  const token = await mintToken(supabaseUrl, serviceKey, email);
  const auth = { Authorization: `Bearer ${token}` };

  const statusResponse = await fetch(`${base}/v1/billing/status`, { headers: auth });
  const status = await statusResponse.json().catch(() => null);
  report(statusResponse.status === 200 && Boolean(status && status.ok), 'GET /v1/billing/status trả 200', `status=${statusResponse.status}`);
  if (!status || !status.ok) return finish();

  const missing = Array.isArray(status.missing) ? status.missing : [];
  const migrationMissing = missing.filter(item => /migration|billing_orders|period_end/iu.test(item));
  const configMissing = missing.filter(item => !migrationMissing.includes(item));

  report(status.configured === true, 'máy chủ tự khai là ĐÃ cấu hình bán được', status.configured ? 'configured=true' : 'configured=false');
  report(migrationMissing.length === 0, 'migration billing đã chạy trên database', migrationMissing.join('; ') || 'không thiếu');
  report(configMissing.length === 0, 'đã khai nhà cung cấp thanh toán', configMissing.join(', ') || `provider=${status.provider}`);
  report(Number(status.priceVnd) > 0 && Number(status.periodDays) > 0 && Number(status.credits) > 0,
    'giá / kỳ hạn / credits đọc được',
    `${status.priceVnd}đ · ${status.periodDays} ngày · ${status.credits} credits`);
  report(status.plan === 'plus' || status.plan === 'free', 'gói hiệu lực là một giá trị đã biết', `plan=${status.plan}`);

  if (process.argv.includes('--checkout')) {
    const checkoutResponse = await fetch(`${base}/v1/billing/checkout`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: '{}' });
    const checkout = await checkoutResponse.json().catch(() => null);
    const hasUrl = Boolean(checkout && typeof checkout.checkoutUrl === 'string' && checkout.checkoutUrl.startsWith('http'));
    report(checkoutResponse.status === 200 && hasUrl, 'POST /v1/billing/checkout trả một checkoutUrl',
      checkout ? `${checkoutResponse.status} ${checkout.code || ''} ${hasUrl ? checkout.checkoutUrl.slice(0, 48) + '…' : ''}` : `${checkoutResponse.status}`);
    if (hasUrl) {
      lines.push('     ↳ đơn này đang chờ trong `billing_orders`; muốn đóng nó, trả tiền thật (PayOS) hoặc xoá dòng đó.');
    }
  } else {
    lines.push('     (bỏ qua bước tạo đơn — thêm `--checkout` nếu muốn đo đường mua thật)');
  }

  finish();
}

function finish() {
  console.log(lines.join('\n'));
  if (failed > 0) {
    console.log('\ncheck-billing: CHƯA bán được (' + failed + ' mục đỏ).');
    console.log('Việc kế tiếp: docs/DEPLOY_GATEWAY.md §7 — (1) chạy server/migrations/2026-11-26-billing.sql');
    console.log('trên Supabase, (2) chọn MỘT cổng rồi khai biến của cổng đó:');
    console.log('  PayOS  : EDUGAME_BILLING_PROVIDER=payos  + PAYOS_CLIENT_ID / PAYOS_API_KEY / PAYOS_CHECKSUM_KEY');
    console.log('  VNPay  : EDUGAME_BILLING_PROVIDER=vnpay  + VNPAY_TMN_CODE / VNPAY_HASH_SECRET (/ VNPAY_URL)');
    console.log('rồi `npm run deploy:worker`.');
    process.exit(1);
  }
  console.log('\ncheck-billing: đã có thể bán gói Pro.');
  process.exit(0);
}

main().catch(error => {
  console.error('check-billing lỗi:', error && error.message ? error.message : error);
  process.exit(1);
});
