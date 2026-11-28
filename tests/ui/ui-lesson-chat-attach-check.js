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
    heights: {
      composer: composer ? Math.round(composer.getBoundingClientRect().height) : -1,
      field: field ? Math.round(field.getBoundingClientRect().height) : -1,
      frame: document.querySelector('.lesson-chat-frame') ? Math.round(document.querySelector('.lesson-chat-frame').getBoundingClientRect().height) : -1,
      buttonTop: b ? Math.round(b.top) : -1,
    },
    picker: {
      open: !!picker,
      position: picker ? getComputedStyle(picker).position : '',
      gapToButton: pickerBox && b ? Math.round(b.top - pickerBox.bottom) : -1,
      leftDelta: pickerBox && b ? Math.round(pickerBox.left - b.left) : -999,
      width: pickerBox ? Math.round(pickerBox.width) : -1,
      fieldWidth: f ? Math.round(f.width) : -1,
      animation: picker ? getComputedStyle(picker).animationName : '',
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
  // #377: popup dính vào nút "+" nên nó NẰM ĐÈ lên phần trên của khung gõ (đó là cách một menu
  // gắn vào nút hoạt động). Điều không được phép: che hai nút dưới cùng (nút "+" và mũi tên gửi).
  check('bảng nổi không che hai nút của khung gõ (đáy popup cao hơn đỉnh nút "+")',
    opened.picker.aboveField === true || opened.picker.gapToButton >= 0, 'cách đỉnh nút ' + opened.picker.gapToButton + 'px');
  check('bảng chọn có lối "Tải giáo án mới" (một nút làm được việc của hai nút cũ)',
    opened.picker.imports >= 1, String(opened.picker.imports));
  check('đang mở: aria-expanded="true" + class is-open', opened.expanded === 'true' && opened.openClass === true,
    opened.expanded + ' / is-open=' + opened.openClass);
  check('bảng chọn liệt kê giáo án trong kho', opened.picker.rows >= 1, String(opened.picker.rows));

  // #376: bảng chọn là POPUP NỔI — mở nó không được đẩy bất cứ thứ gì trong khung chat.
  check('bảng chọn là popup nổi (position: absolute, không chiếm chỗ trong luồng)',
    opened.picker.position === 'absolute', opened.picker.position);
  check('mở bảng KHÔNG xê dịch bố cục khung chat (composer/khung gõ/khung chat/nút "+" y nguyên)',
    opened.heights.composer === closed.heights.composer && opened.heights.field === closed.heights.field
      && opened.heights.frame === closed.heights.frame && opened.heights.buttonTop === closed.heights.buttonTop,
    JSON.stringify(closed.heights) + ' → ' + JSON.stringify(opened.heights));
  check('bảng nổi rộng không quá khung gõ (không đè sang cột danh sách)',
    opened.picker.width <= opened.picker.fieldWidth, opened.picker.width + ' ≤ ' + opened.picker.fieldWidth);
  check('bảng nổi có nhịp mở (eg-pop-up)', opened.picker.animation === 'eg-pop-up', opened.picker.animation);
  // #377: popup phải DÍNH vào nút "+", không phải neo vào đỉnh cả khung gõ (đo trước khi sửa: 69px).
  check('bảng nổi nằm SÁT nút "+" (cách ≤ 12px, mép trái lệch ≤ 10px so với nút)',
    opened.picker.gapToButton >= 0 && opened.picker.gapToButton <= 12 && Math.abs(opened.picker.leftDelta) <= 10,
    'cách nút ' + opened.picker.gapToButton + 'px, lệch trái ' + opened.picker.leftDelta + 'px');

  // 5a. #377 — CHỌN MỘT GIÁO ÁN KHÔNG ĐƯỢC LÀM NHÁY.
  // Trước khi sửa: mỗi lần tick gọi `render()` ⇒ 29 mutation, phần tử `.lesson-chat-pop` bị thay,
  // `eg-pop-up` chạy lại ⇒ màn hình nháy đúng lúc đang tick.
  await c.evaluate(String.raw`(() => {
    const pop = document.querySelector('.lesson-chat-field > .lesson-chat-pop');
    if (pop) pop.dataset.keepMark = 'same';
    window.__pickProbe = { mutations: 0, anims: 0 };
    window.__pickObserver = new MutationObserver((records) => { window.__pickProbe.mutations += records.length; });
    window.__pickObserver.observe(document.querySelector('#pageContent'), { childList: true, subtree: true });
    if (!window.__pickAnimWired) {
      window.__pickAnimWired = true;
      document.addEventListener('animationstart', (event) => {
        const el = event.target;
        if (el && el.classList && el.classList.contains('lesson-chat-pop') && window.__pickProbe) window.__pickProbe.anims += 1;
      }, true);
    }
    return 1;
  })()`);
  await c.evaluate(String.raw`(() => {
    const boxes = [...document.querySelectorAll('[data-lesson-chat-pick]')];
    const target = boxes.find((box) => !box.checked) || boxes[0];
    target.checked = !target.checked;
    target.dispatchEvent(new Event('change', { bubbles: true }));
    return 1;
  })()`);
  await c.settle(700);
  const picked = await c.evaluate(String.raw`(() => {
    const pop = document.querySelector('.lesson-chat-field > .lesson-chat-pop');
    return {
      samePopup: !!(pop && pop.dataset.keepMark === 'same'),
      open: !!pop,
      mutations: window.__pickProbe.mutations,
      anims: window.__pickProbe.anims,
      chips: document.querySelectorAll('[data-lesson-chat-sources] .lesson-chat-chip').length,
      hint: (document.querySelector('[data-lesson-chat-hint]') || {}).textContent || '',
      checked: [...document.querySelectorAll('[data-lesson-chat-pick]')].filter((box) => box.checked).length,
    };
  })()`);
  check('chọn một giáo án KHÔNG dựng lại popup (cùng một phần tử DOM)', picked.samePopup === true && picked.open === true, 'same=' + picked.samePopup);
  check('chọn một giáo án KHÔNG chạy lại animation nhập cảnh (không nháy)', picked.anims === 0, String(picked.anims) + ' lần animation');
  check('chọn một giáo án chỉ sửa vài chỗ, không vẽ lại cả trang (≤ 6 mutation)', picked.mutations <= 6,
    String(picked.mutations) + ' mutation (trước #377: 29)');
  check('hàng chip và câu gợi ý cập nhật đúng sau khi chọn',
    picked.chips === picked.checked && picked.hint.includes(String(picked.checked)) === true,
    'chip=' + picked.chips + ' · đã tick=' + picked.checked + ' · "' + picked.hint.slice(0, 46) + '"');

  // 5b. Esc đóng popup (một lớp nổi phải có đường tắt).
  await c.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); 1`);
  await c.settle(500);
  const viaEsc = await c.evaluate(MEASURE);
  check('Esc đóng popup', viaEsc.picker.open === false && viaEsc.expanded === 'false', 'open=' + viaEsc.picker.open + ' · expanded=' + viaEsc.expanded);

  // 5c. Bấm ra ngoài đóng popup.
  await c.evaluate(`document.querySelector('.lesson-chat-attach-btn').click(); 1`);
  await c.settle(600);
  await c.evaluate(String.raw`(() => {
    const target = document.querySelector('.lesson-chat-scroll') || document.body;
    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    return 1;
  })()`);
  await c.settle(500);
  const viaOutside = await c.evaluate(MEASURE);
  check('bấm ra ngoài đóng popup', viaOutside.picker.open === false, String(viaOutside.picker.open));

  // 6. Bấm hai lần: mở rồi đóng (một control, hai trạng thái, không có nút thứ hai xuất hiện).
  await c.evaluate(`document.querySelector('.lesson-chat-attach-btn').click(); 1`);
  await c.settle(500);
  const reopened = await c.evaluate(MEASURE);
  check('bấm lại ⇒ mở lại được (popup không bị kẹt sau khi Esc/bấm ngoài)',
    reopened.picker.open === true && reopened.pickerButtons === 1, 'open=' + reopened.picker.open);
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
