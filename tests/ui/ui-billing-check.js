#!/usr/bin/env node
/**
 * #364 — thẻ "Gói Pro": phép đo trên ỨNG DỤNG THẬT.
 *
 * Unit test đã đo bốn nhánh câu chữ. Cổng này đo ba thứ chỉ ứng dụng thật mới trả lời được:
 *   1. kênh `account:billing` có tồn tại và trả về một TRẠNG THÁI (không phải 500, không im
 *      lặng) — tức là Rust → gateway đã nối;
 *   2. giá không bao giờ được in hai lần trong cùng một thẻ (một lỗi đã thật sự xảy ra và
 *      được sửa: hàng giá ở góc + tiêu đề cùng một con số);
 *   3. nút "Nâng cấp" chỉ xuất hiện khi máy chủ bán được thật, và bấm vào một máy chủ chưa
 *      cấu hình thì phải trả `billing_not_configured` kèm TÊN việc còn thiếu.
 *
 * Giá trị kỳ vọng lấy từ CHÍNH câu trả lời của kênh, không từ fixture trong tệp này: máy
 * chủ đã bật PayOS hay chưa là chuyện của máy chủ, không phải của cổng.
 *
 * Usage: `node tests/ui/ui-billing-check.js [port]`.
 */
process.argv[2] = process.argv[2] || process.env.CDP_PORT || '9381';

const { connect, check, results } = require('../manual/lib/ui-check-lib');

const PROBE = String.raw`(async () => {
  const call = (channel) => window.__TAURI_INTERNALS__.invoke('invoke_channel', { channel, args: [] });
  const unwrap = (reply) => (reply && reply.result !== undefined ? reply.result : reply);
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const billing = unwrap(await call('account:billing'));
  const checkout = unwrap(await call('account:checkout'));

  // Mở panel tài khoản ở trạng thái THẬT mà ứng dụng đang có.
  if (typeof openAccountPanel === 'function') openAccountPanel();
  let card = null;
  for (let i = 0; i < 50 && !card; i += 1) {
    await sleep(100);
    card = document.querySelector('[data-account-pro]');
  }
  const text = card ? card.textContent.replace(/\s+/g, ' ').trim() : '';
  const price = (billing && billing.price_vnd) || (billing && billing.priceVnd) || 0;
  const priceText = price > 0 ? price.toLocaleString('vi-VN') + 'đ' : '';
  const count = priceText ? (text.split(priceText).length - 1) : 0;
  return {
    state: card ? card.getAttribute('data-account-pro') : 'missing',
    text,
    priceText,
    priceCount: count,
    upgrade: Boolean(card && card.querySelector('[data-account-upgrade]')),
    checkoutCode: checkout && (checkout.code || ''),
    checkoutMessage: checkout && checkout.message ? String(checkout.message) : '',
    missing: billing && Array.isArray(billing.missing) ? billing.missing : [],
    configured: Boolean(billing && (billing.configured === true)),
  };
})()`;

(async () => {
  const c = await connect();
  await c.settle(600);
  const dom = await c.evaluate(PROBE);

  check('the billing channel answers with a state, not an error',
    dom && dom.state && dom.state !== 'missing',
    'state=' + (dom && dom.state));
  check('the Pro card is one of the states the product defines',
    ['unconfigured', 'free', 'active', 'loading', 'error'].includes(dom.state),
    'state=' + dom.state);

  if (dom.state === 'unconfigured') {
    check('an unconfigured server names WHICH setup is missing',
      dom.missing.length > 0, dom.missing.join(' | ') || '(không nêu tên gì)');
    check('a server that cannot sell shows no upgrade button',
      dom.upgrade === false, 'upgrade=' + dom.upgrade);
    check('the checkout channel says "not configured" instead of failing silently',
      dom.checkoutCode === 'billing_not_configured' && dom.checkoutMessage.length > 0,
      dom.checkoutCode + ' — ' + dom.checkoutMessage);
  } else if (dom.state === 'free' || dom.state === 'active') {
    check('a configured server offers the price exactly once per card',
      dom.priceCount === 1, 'price=' + dom.priceText + ' count=' + dom.priceCount);
    check('the upgrade button exists only while the price can be shown',
      dom.state === 'active' ? dom.upgrade === false : dom.upgrade === true,
      'state=' + dom.state + ' upgrade=' + dom.upgrade);
  }

  const failed = results.filter(row => !row.ok);
  console.log('\nui-billing-check: ' + (results.length - failed.length) + '/' + results.length + ' passed');
  if (failed.length) {
    for (const row of failed) console.log('FAIL  ' + row.name + ' — ' + row.detail);
    process.exit(1);
  }
  process.exit(0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
