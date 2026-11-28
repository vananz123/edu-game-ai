#!/usr/bin/env node
/**
 * #375 — gộp "Chọn giáo án" + "Tải giáo án mới" thành MỘT nút "+" trong khung gõ.
 *
 * Trước: hai nút chữ chiếm trọn một hàng phía trên khung gõ, cả hai đều dẫn tới cùng một bảng
 * chọn giáo án. Yêu cầu của chủ dự án: "gộp chọn giáo án và tải giáo án mới thành 1 dấu + rồi di
 * chuyển vào trong khung chat".
 *
 * Sáu câu, đo bằng số:
 *   1. Composer có ĐÚNG MỘT control mở bảng chọn, và nó nằm trong khung gõ (góc dưới-trái, 8/8px);
 *   2. Nó là icon-only nhưng có tên đọc được, và `aria-expanded` nói trạng thái;
 *   3. Hai nhãn chữ cũ KHÔNG còn trong composer khi bảng đóng;
 *   4. Hàng chip phía trên chỉ còn chip (không còn nút chọn/tải trong đó);
 *   5. Bấm nút ⇒ bảng mở, nằm PHÍA TRÊN khung gõ, và bảng ĐÃ CÓ lối "Tải giáo án mới"
 *      (đó là điều kiện để một nút làm được việc của hai nút);
 *   6. Bấm lần nữa ⇒ đóng (một control, hai trạng thái, không có nút thứ hai xuất hiện).
 *
 * Usage: `node tests/ui/ui-lesson-chat-attach-check.js [port]`.
 */
process.argv[2] = process.argv[2] || process.env.CDP_PORT || '9389';

const { connect, check, results } = require('../manual/lib/ui-check-lib');

const MEASURE = String.raw`(() => {
  const composer = document.querySelector('.lesson-chat-composer');
  const field = document.querySelector('.lesson-chat-field');
  const input = document.querySelector('#lessonChatInput');
  const btn = composer ? composer.querySelector('.lesson-chat-attach-btn') : null;
  const pickerButtons = composer ? composer.querySelectorAll('[data-action="lesson-chat-picker"]').length : -1;
  const box = (el) => (el ? el.getBoundingClientRect() : null);
  const b = box(btn);
  const f = box(field);
  const sources = document.querySelector('[data-lesson-chat-sources]');
  const picker = document.querySelector('.lesson-chat-pop[data-lesson-chat-picker]');
  const pickerBox = box(picker);
  const text = composer ? composer.innerText.replace(/\s+/g, ' ') : '';
  const count = (needle) => text.split(needle).length - 1;
  return {
    page: (typeof state !== 'undefined' && state.page) || '',
    pickerButtons,
    hasButton: !!btn,
    inside: !!(b && f && b.left >= f.left - 1 && b.right <= f.right + 1 && b.top >= f.top - 1 && b.bottom <= f.bottom + 1),
    gapLeft: b && f ? Math.round(b.left - f.left) : -1,
    gapBottom: b && f ? Math.round(f.bottom - b.bottom) : -1,
    size: b ? { w: Math.round(b.width), h: Math.round(b.height) } : null,
    text: btn ? (btn.innerText || '').trim() : '',
    aria: btn ? btn.getAttribute('aria-label') || '' : '',
    expanded: btn ? btn.getAttribute('aria-expanded') : '',
    openClass: btn ? btn.classList.contains('is-open') : false,
    hasSvg: btn ? !!btn.querySelector('svg') : false,
    oldChoose: count('Chọn giáo án'),
    oldUpload: count('Tải giáo án mới'),
    paddingLeft: input ? Math.round(parseFloat(getComputedStyle(input).paddingLeft)) : -1,
    sources: {
      present: !!sources,
      chips: sources ? sources.querySelectorAll('.lesson-chat-chip').length : -1,
      buttons: sources ? sources.querySelectorAll('button').length : -1,
      pickerInside: sources ? sources.querySelectorAll('[data-action="lesson-chat-picker"], [data-action="lesson-chat-import"]').length : -1,
    },
    picker: {
      open: !!picker,
      aboveField: !!(pickerBox && f && pickerBox.bottom <= f.top + 2),
      imports: picker ? picker.querySelectorAll('[data-action="lesson-chat-import"]').length : -1,
      rows: picker ? picker.querySelectorAll('.lesson-chat-pick').length : -1,
    },
  };
})()`;

(async () => {
  const c = await connect();
  await c.settle(1000);
  await c.evaluate(`document.querySelector('.nav-item[data-page="lesson-plans"]').click(); 1`);
  await c.settle(1300);

  // Trạng thái đo phải là trạng thái đóng (một phiên trước có thể để bảng mở).
  await c.evaluate(String.raw`(() => {
    const btn = document.querySelector('.lesson-chat-attach-btn');
    if (btn && btn.getAttribute('aria-expanded') === 'true') btn.click();
    return 1;
  })()`);
  await c.settle(500);

  const closed = await c.evaluate(MEASURE);
  check('đang ở trang Giáo án', closed.page === 'lesson-plans', closed.page);
  check('composer có ĐÚNG MỘT control mở bảng chọn', closed.pickerButtons === 1, String(closed.pickerButtons));
  check('nút "+" nằm trong khung gõ, góc dưới-trái (cách mép 8px)',
    closed.inside === true && closed.gapLeft === 8 && closed.gapBottom === 8,
    'inside=' + closed.inside + ' · trái ' + closed.gapLeft + 'px · dưới ' + closed.gapBottom + 'px');
  check('nút "+" tròn 30×30', closed.size && closed.size.w === 30 && closed.size.h === 30, JSON.stringify(closed.size));
  check('nút "+" là icon-only nhưng có tên đọc được', closed.text === '' && closed.aria === 'Chọn hoặc tải giáo án' && closed.hasSvg === true,
    'chữ="' + closed.text + '" · aria="' + closed.aria + '"');
  check('đóng: aria-expanded="false" và không có class is-open', closed.expanded === 'false' && closed.openClass === false,
    closed.expanded + ' / is-open=' + closed.openClass);
  check('KHÔNG còn nhãn chữ "Chọn giáo án" trong composer', closed.oldChoose === 0, String(closed.oldChoose));
  check('KHÔNG còn nhãn chữ "Tải giáo án mới" khi bảng đóng', closed.oldUpload === 0, String(closed.oldUpload));
  check('chữ trong khung gõ chừa chỗ bên trái cho nút "+" (≥ 40px)', closed.paddingLeft >= 40, String(closed.paddingLeft));
  check('hàng chip không còn nút chọn/tải nào', closed.sources.pickerInside === 0,
    'nút trong hàng chip = ' + closed.sources.buttons + ', trong đó chọn/tải = ' + closed.sources.pickerInside);

  // 5. Bấm "+" ⇒ bảng mở phía trên khung gõ và có lối tải tệp mới.
  await c.evaluate(`document.querySelector('.lesson-chat-attach-btn').click(); 1`);
  await c.settle(700);
  const opened = await c.evaluate(MEASURE);
  check('bấm "+" ⇒ bảng chọn mở', opened.picker.open === true, String(opened.picker.open));
  check('bảng chọn nằm PHÍA TRÊN khung gõ (không che chữ đang gõ)', opened.picker.aboveField === true, String(opened.picker.aboveField));
  check('bảng chọn có lối "Tải giáo án mới" (một nút làm được việc của hai nút cũ)',
    opened.picker.imports >= 1, String(opened.picker.imports));
  check('đang mở: aria-expanded="true" + class is-open', opened.expanded === 'true' && opened.openClass === true,
    opened.expanded + ' / is-open=' + opened.openClass);
  check('bảng chọn liệt kê giáo án trong kho', opened.picker.rows >= 1, String(opened.picker.rows));

  // 6. Bấm lần nữa ⇒ đóng.
  await c.evaluate(`document.querySelector('.lesson-chat-attach-btn').click(); 1`);
  await c.settle(600);
  const again = await c.evaluate(MEASURE);
  check('bấm lần nữa ⇒ bảng đóng, không có nút thứ hai xuất hiện',
    again.picker.open === false && again.pickerButtons === 1 && again.expanded === 'false',
    'open=' + again.picker.open + ' · nút=' + again.pickerButtons);

  const failed = results.filter((row) => !row.ok).length;
  console.log('\nui-lesson-chat-attach-check: ' + (results.length - failed) + '/' + results.length + ' passed');
  process.exit(failed ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
