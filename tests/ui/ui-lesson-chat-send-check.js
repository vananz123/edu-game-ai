#!/usr/bin/env node
/**
 * #374 — nút gửi là MŨI TÊN TRÒN NẰM TRONG khung gõ của trang Giáo án.
 *
 * Trước: "Gửi" là một nút chữ nằm trong hàng `.lesson-chat-foot` (dưới khung gõ, cạnh ô chọn nhà
 * cung cấp) — tức là chiếm một ô riêng dù chỉ có bốn ký tự. Yêu cầu: "di chuyển nút gửi thành mũi
 * tên bên trong khung chat".
 *
 * Sáu câu, đo bằng số:
 *   1. Nút nằm HOÀN TOÀN trong hình chữ nhật của khung gõ (không đè ra ngoài viền);
 *   2. Nó là icon-only (không chữ) nhưng vẫn có tên đọc được (`aria-label`);
 *   3. Hàng chân khung gõ KHÔNG còn chữ "Gửi" (nút đã rời khỏi đó);
 *   4. Chữ trong khung gõ chừa chỗ cho nút (`padding-right` ≥ 40px) và tay nắm kéo-giãn đã bị bỏ
 *      (nó nằm đúng dưới nút — ảnh 2× cho thấy nút che mất một nửa);
 *   5. Trạng thái: rỗng ⇒ `disabled`; gõ ⇒ bật; xoá ⇒ tắt lại (cùng một nút, không nhảy vị trí);
 *   6. Khi đang trả lời, CÙNG chỗ đó là nút Dừng (`is-stop`, `data-action="lesson-chat-stop"`).
 *
 * Usage: `node tests/ui/ui-lesson-chat-send-check.js [port]`.
 */
process.argv[2] = process.argv[2] || process.env.CDP_PORT || '9388';

const { connect, check, results } = require('../manual/lib/ui-check-lib');

const MEASURE = String.raw`(() => {
  const btn = document.querySelector('[data-lesson-chat-send], .lesson-chat-send');
  const field = document.querySelector('.lesson-chat-field');
  const input = document.querySelector('#lessonChatInput');
  const foot = document.querySelector('.lesson-chat-foot');
  const box = (el) => (el ? el.getBoundingClientRect() : null);
  const b = box(btn);
  const f = box(field);
  const cs = btn ? getComputedStyle(btn) : null;
  const inputCss = input ? getComputedStyle(input) : null;
  return {
    page: (typeof state !== 'undefined' && state.page) || '',
    hasButton: !!btn,
    count: document.querySelectorAll('.lesson-chat-field .lesson-chat-send').length,
    inside: !!(b && f && b.left >= f.left - 1 && b.right <= f.right + 1 && b.top >= f.top - 1 && b.bottom <= f.bottom + 1),
    gapRight: b && f ? Math.round(f.right - b.right) : -1,
    gapBottom: b && f ? Math.round(f.bottom - b.bottom) : -1,
    size: b ? { w: Math.round(b.width), h: Math.round(b.height) } : null,
    text: btn ? (btn.innerText || '').trim() : '',
    ariaLabel: btn ? btn.getAttribute('aria-label') || '' : '',
    action: btn ? btn.dataset.action || '' : '',
    stop: btn ? btn.classList.contains('is-stop') : false,
    disabled: btn ? btn.disabled : null,
    hasSvg: btn ? !!btn.querySelector('svg') : false,
    radius: cs ? cs.borderRadius : '',
    footText: foot ? (foot.innerText || '').replace(/\s+/g, ' ').trim() : '',
    inputPaddingRight: inputCss ? Math.round(parseFloat(inputCss.paddingRight)) : -1,
    inputResize: inputCss ? inputCss.resize : '',
  };
})()`;

(async () => {
  const c = await connect();
  await c.settle(1000);
  await c.evaluate(`document.querySelector('.nav-item[data-page="lesson-plans"]').click(); 1`);
  await c.settle(1300);

  // Cổng phải DỰNG đúng trạng thái nó đo: bản nháp của khung gõ được giữ trong
  // `lessonChatUi.draft`, nên một phiên trước đó gõ dở sẽ làm "rỗng" không còn rỗng.
  await c.evaluate(String.raw`(() => {
    const input = document.querySelector('#lessonChatInput');
    if (!input) return 0;
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return 1;
  })()`);
  await c.settle(400);

  const empty = await c.evaluate(MEASURE);
  check('đang ở trang Giáo án', empty.page === 'lesson-plans', empty.page);
  check('có ĐÚNG MỘT nút gửi, và nó nằm trong khung gõ', empty.count === 1 && empty.hasButton, String(empty.count));
  check('nút nằm HOÀN TOÀN trong khung gõ (không đè ra ngoài viền)', empty.inside === true,
    'cách mép phải ' + empty.gapRight + 'px, mép dưới ' + empty.gapBottom + 'px');
  check('nút tròn 30×30 ở góc dưới-phải', empty.size && empty.size.w === 30 && empty.size.h === 30 && /50%|9999px/u.test(empty.radius),
    JSON.stringify(empty.size) + ' · ' + empty.radius);
  check('nút là icon-only nhưng vẫn có tên đọc được', empty.text === '' && empty.ariaLabel === 'Gửi câu hỏi' && empty.hasSvg === true,
    'chữ="' + empty.text + '" · aria="' + empty.ariaLabel + '" · svg=' + empty.hasSvg);
  check('hàng chân khung gõ KHÔNG còn chữ "Gửi"', !/Gửi/u.test(empty.footText), empty.footText);
  check('chữ trong khung gõ chừa chỗ cho nút (padding-right ≥ 40px)', empty.inputPaddingRight >= 40, String(empty.inputPaddingRight));
  check('tay nắm kéo-giãn của textarea đã bị bỏ (nó nằm đúng dưới nút)', empty.inputResize === 'none', empty.inputResize);
  check('rỗng ⇒ nút chưa bấm được', empty.disabled === true, String(empty.disabled));

  // 5. Trạng thái bật/tắt trên CÙNG một nút (không được đổi vị trí khi trạng thái đổi).
  await c.evaluate(String.raw`(() => {
    const input = document.querySelector('#lessonChatInput');
    input.value = 'Mục tiêu của bài này là gì?';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return 1;
  })()`);
  await c.settle(400);
  const typed = await c.evaluate(MEASURE);
  check('gõ chữ ⇒ nút bật', typed.disabled === false, String(typed.disabled));
  check('bật/tắt KHÔNG làm nút đổi hình chữ nhật',
    typed.size.w === empty.size.w && typed.size.h === empty.size.h && typed.gapRight === empty.gapRight && typed.gapBottom === empty.gapBottom,
    JSON.stringify(typed.size) + ' vs ' + JSON.stringify(empty.size));

  await c.evaluate(String.raw`(() => {
    const input = document.querySelector('#lessonChatInput');
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return 1;
  })()`);
  await c.settle(400);
  const cleared = await c.evaluate(MEASURE);
  check('xoá chữ ⇒ nút tắt lại', cleared.disabled === true, String(cleared.disabled));

  // 6. Đang trả lời: CÙNG chỗ đó là nút Dừng. (Trạng thái dựng — không gọi AI thật.)
  await c.evaluate(String.raw`(() => {
    lessonChatUi.sending = true;
    render();
    return 1;
  })()`);
  await c.settle(900);
  const sending = await c.evaluate(MEASURE);
  check('khi đang trả lời, nút trong khung trở thành nút Dừng',
    sending.hasButton === true && sending.stop === true && sending.action === 'lesson-chat-stop', sending.action + ' / is-stop=' + sending.stop);
  check('nút Dừng vẫn nằm trong khung gõ, cùng kích thước', sending.inside === true && sending.size.w === 30,
    'inside=' + sending.inside + ' · ' + JSON.stringify(sending.size));

  // Trả lại trạng thái nghỉ.
  await c.evaluate(String.raw`(() => {
    lessonChatUi.sending = false;
    render();
    return 1;
  })()`);
  await c.settle(900);
  const restored = await c.evaluate(MEASURE);
  check('trả lại trạng thái nghỉ: nút Gửi trở về chỗ cũ', restored.stop === false && restored.action === 'lesson-chat-send' && restored.inside === true,
    restored.action);

  const failed = results.filter((row) => !row.ok).length;
  console.log('\nui-lesson-chat-send-check: ' + (results.length - failed) + '/' + results.length + ' passed');
  process.exit(failed ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
