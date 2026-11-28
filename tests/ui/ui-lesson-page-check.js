#!/usr/bin/env node
/**
 * #373 — trang Giáo án: bỏ hàng tiêu đề "Giáo án", khung chat choán hết chiều cao, và KHÔNG có
 * gì di chuyển khi cuộn.
 *
 * Chủ dự án: "tôi cần xóa chữ giáo án đi và là khung chat full, để khi scroll chúng không di
 * chuyển".
 *
 * Bốn câu, đo bằng số:
 *   1. Không còn `<h1>` "Giáo án" trong nội dung trang;
 *   2. Trang KHÔNG cuộn: `document.scrollingElement.scrollHeight` = chiều cao cửa sổ;
 *   3. Khung chat KHÔNG đổi hình chữ nhật: cuộn cửa sổ (không ăn) và cuộn danh sách 300px ⇒
 *      `top`/`height` của khung y nguyên (trước #373: đỉnh 63px → 14px ở lần cuộn đầu);
 *   4. Danh sách bên phải là thứ DUY NHẤT cuộn (overflow auto, scrollHeight > clientHeight),
 *      và hai hành động của hàng tiêu đề đã chuyển vào header khung chat (không mất nút nào).
 *
 * Đo thêm ở 1024px: hai cột xếp chồng, khung chat cao theo nội dung và TRANG CUỘN LẠI ĐƯỢC —
 * khoá chiều cao ở đó sẽ giấu mất danh sách.
 *
 * Usage: `node tests/ui/ui-lesson-page-check.js [port]`.
 */
process.argv[2] = process.argv[2] || process.env.CDP_PORT || '9386';

const { connect, check, results } = require('../manual/lib/ui-check-lib');

const MEASURE = String.raw`(() => {
  const pc = document.querySelector('#pageContent');
  const frame = document.querySelector('.lesson-chat-frame');
  const list = document.querySelector('.lesson-list-col');
  const col = document.querySelector('.lesson-two-col');
  const box = (el) => (el ? { top: Math.round(el.getBoundingClientRect().top), h: Math.round(el.getBoundingClientRect().height), w: Math.round(el.getBoundingClientRect().width) } : null);
  return {
    pageAttr: pc ? pc.dataset.page || '' : '',
    h1Count: pc ? pc.querySelectorAll('h1').length : -1,
    firstText: pc ? pc.innerText.replace(/\s+/g, ' ').trim().slice(0, 24) : '',
    docH: document.documentElement.scrollHeight,
    winH: window.innerHeight,
    scrollY: window.scrollY,
    frame: box(frame),
    list: box(list),
    columns: col ? getComputedStyle(col).gridTemplateColumns : '',
    pcOverflow: pc ? getComputedStyle(pc).overflowY : '',
    listScroll: list ? { h: list.clientHeight, sh: list.scrollHeight, overflow: getComputedStyle(list).overflowY, top: list.scrollTop } : null,
    empty: (() => {
      const el = document.querySelector('[data-lesson-chat-empty]');
      if (!el) return null;
      const heading = el.querySelector('strong');
      const text = el.innerText.replace(/\s+/g, ' ').trim();
      return { heading: heading ? heading.innerText.trim() : '', text };
    })(),
    headButtons: [...document.querySelectorAll('.lesson-chat-head-actions button')].map((b) => ({
      text: (b.innerText || '').replace(/\s+/g, ' ').trim(),
      action: b.dataset.action || '',
      page: b.dataset.page || '',
    })),
  };
})()`;

(async () => {
  const c = await connect();
  await c.settle(1000);
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await c.settle(600);
  await c.evaluate(`document.querySelector('.nav-item[data-page="lesson-plans"]').click(); 1`);
  await c.settle(1400);

  const wide = await c.evaluate(MEASURE);

  check('đang ở trang Giáo án và CSS biết điều đó (#pageContent[data-page])', wide.pageAttr === 'lesson-plans', wide.pageAttr);
  check('không còn <h1> "Giáo án" trong trang', wide.h1Count === 0, String(wide.h1Count));
  check('dòng đầu của trang không phải chữ "Giáo án"', !/^Giáo án/u.test(wide.firstText), wide.firstText);
  check('TRANG KHÔNG CUỘN ở 1366×768 (scrollHeight = chiều cao cửa sổ)', wide.docH === wide.winH, wide.docH + ' vs ' + wide.winH);
  check('khung chat choán hết chiều cao còn lại (≥ 90% cửa sổ)', wide.frame.h >= Math.round(wide.winH * 0.9),
    wide.frame.h + ' / ' + wide.winH);
  check('danh sách bên phải là nơi cuộn (overflow auto, nội dung dài hơn khung)',
    wide.listScroll.overflow === 'auto' && wide.listScroll.sh > wide.listScroll.h,
    wide.listScroll.overflow + ' · ' + wide.listScroll.sh + ' > ' + wide.listScroll.h);
  check('hai cột vẫn nằm cạnh nhau (không bị đổi bố cục)', wide.columns.split(' ').length === 2, wide.columns);

  // Hai hành động cũ của hàng tiêu đề đã chuyển vào header khung chat.
  const importBtn = wide.headButtons.find((b) => b.action === 'import-document');
  const projectBtn = wide.headButtons.find((b) => b.page === 'create-wizard');
  check('nút "Nhập tệp" vẫn còn (đã chuyển vào header khung chat)', !!importBtn, JSON.stringify(wide.headButtons.map((b) => b.text)));
  check('nút "Dự án mới" vẫn còn và vẫn trỏ tới create-wizard', !!projectBtn, projectBtn ? projectBtn.text : '(không thấy)');

  // 2b. #378 — lời mời ở khung chat rỗng.
  check('khung chat rỗng mời "Hỏi về giáo án của bạn"', !!wide.empty && wide.empty.heading === 'Hỏi về giáo án của bạn',
    wide.empty ? wide.empty.heading : '(không có khối rỗng)');
  check('câu mời cũ "Cứ hỏi, không cần mở giáo án" đã bị bỏ',
    !!wide.empty && !/Cứ hỏi, không cần mở giáo án/u.test(wide.empty.text), wide.empty ? wide.empty.text.slice(0, 60) : '');
  // Chỉ dẫn phải trỏ vào control ĐANG CÓ. "Chọn giáo án" là nút đã bị gộp (#375) — nhắc nó là
  // dạy người dùng đi tìm một thứ không tồn tại.
  check('câu mời không chỉ vào nút "Chọn giáo án" đã bị gộp', !!wide.empty && !/Chọn giáo án/u.test(wide.empty.text),
    wide.empty ? wide.empty.text.slice(0, 80) : '');
  check('câu mời chỉ đúng nút "＋" trong khung gõ', !!wide.empty && /＋/u.test(wide.empty.text),
    wide.empty ? wide.empty.text.slice(0, 80) : '');

  // 3. Cuộn cửa sổ: không được ăn, và khung không được dịch.
  await c.evaluate(`window.scrollTo(0, 500); 1`);
  await c.settle(500);
  const afterWindowScroll = await c.evaluate(MEASURE);
  check('cuộn cửa sổ KHÔNG làm gì (scrollY = 0)', afterWindowScroll.scrollY === 0, String(afterWindowScroll.scrollY));
  check('khung chat giữ nguyên đỉnh + chiều cao sau khi cuộn cửa sổ',
    afterWindowScroll.frame.top === wide.frame.top && afterWindowScroll.frame.h === wide.frame.h,
    wide.frame.top + '/' + wide.frame.h + ' → ' + afterWindowScroll.frame.top + '/' + afterWindowScroll.frame.h);

  // 3b. Cuộn danh sách thật: khung chat vẫn phải đứng yên.
  await c.evaluate(`(() => { const l = document.querySelector('.lesson-list-col'); l.scrollTop = 300; return l.scrollTop; })()`);
  await c.settle(600);
  const afterListScroll = await c.evaluate(MEASURE);
  check('cuộn danh sách 300px ⇒ danh sách đã cuộn thật', afterListScroll.listScroll.top > 200, String(afterListScroll.listScroll.top));
  check('cuộn danh sách KHÔNG làm khung chat di chuyển',
    afterListScroll.frame.top === wide.frame.top && afterListScroll.frame.h === wide.frame.h,
    wide.frame.top + '/' + wide.frame.h + ' → ' + afterListScroll.frame.top + '/' + afterListScroll.frame.h);
  check('ô gõ (composer) vẫn nằm trong khung chat sau khi cuộn danh sách',
    (await c.evaluate(`(() => {
      const composer = document.querySelector('.lesson-chat-composer');
      const frame = document.querySelector('.lesson-chat-frame');
      if (!composer || !frame) return false;
      const a = composer.getBoundingClientRect();
      const b = frame.getBoundingClientRect();
      return a.bottom <= b.bottom + 1 && a.bottom > b.top && a.top >= b.top;
    })()`)) === true, 'composer nằm trong khung');

  await c.evaluate(`(() => { const l = document.querySelector('.lesson-list-col'); l.scrollTop = 0; window.scrollTo(0, 0); return 1; })()`);
  await c.settle(400);

  // 4. Hẹp (1024): xếp chồng và PHẢI cuộn lại được — khoá chiều cao ở đây là giấu danh sách.
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 768, deviceScaleFactor: 1, mobile: false });
  await c.settle(900);
  const narrow = await c.evaluate(MEASURE);
  check('1024px: hai cột xếp chồng (một cột)', narrow.columns.split(' ').length === 1, narrow.columns);
  check('1024px: trang CUỘN LẠI ĐƯỢC (không khoá chiều cao khi đã xếp chồng)',
    narrow.docH > narrow.winH, narrow.docH + ' > ' + narrow.winH);
  check('1024px: khung chat cao theo nội dung, không bị ép 100vh',
    narrow.frame.h < narrow.winH, String(narrow.frame.h));

  await c.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await c.settle(600);
  await c.send('Emulation.clearDeviceMetricsOverride', {});

  const failed = results.filter((row) => !row.ok).length;
  console.log('\nui-lesson-page-check: ' + (results.length - failed) + '/' + results.length + ' passed');
  process.exit(failed ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
