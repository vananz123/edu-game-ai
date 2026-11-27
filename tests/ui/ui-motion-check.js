#!/usr/bin/env node
/**
 * #370 — chuyển động khi thao tác (hover / nhấn / xuất hiện), đo trên app THẬT.
 *
 * Vì sao phải bấm bằng chuột thật (`Input.dispatchMouseEvent`): `:hover` và `:active` là
 * trạng thái do trình duyệt quyết định theo con trỏ. Gọi `el.click()` hay thêm class bằng
 * tay chỉ chứng minh được "CSS viết đúng", không chứng minh được "người dùng thấy gì".
 *
 * Sáu câu:
 *   1. hover thẻ trò chơi ⇒ thẻ nhấc lên ĐÚNG 2px và KHÔNG xê dịch bố cục;
 *   2. nhấn nút ⇒ nút chìm 1px, nhả ra ⇒ trở lại;
 *   3. menu "•••" xuất hiện có animation (không đập vào mắt) và kết thúc ở opacity 1;
 *   4. thanh "đã chọn N" có animation khi vừa xuất hiện;
 *   5. `prefers-reduced-motion: reduce` ⇒ mọi thứ đứng yên (đo cả biến và transform);
 *   6. không có hiệu ứng nào làm đổi `scrollHeight` của trang.
 *
 * Usage: `node tests/ui/ui-motion-check.js [port]`.
 */
process.argv[2] = process.argv[2] || process.env.CDP_PORT || '9375';

const { connect, check, results } = require('../manual/lib/ui-check-lib');

const STATE = String.raw`(() => {
  const card = document.querySelector('[data-game-card]');
  const cs = card ? getComputedStyle(card) : null;
  const root = getComputedStyle(document.documentElement);
  return {
    page: (typeof state !== 'undefined' && state.page) || '',
    cardTransform: cs ? cs.transform : '',
    cardTop: card ? Math.round(card.getBoundingClientRect().top * 100) / 100 : -1,
    cardTranslate: card ? getComputedStyle(card).translate : '',
    cardShadow: cs ? cs.boxShadow : '',
    // Thẻ CUỐI: chuột chưa từng ở đó, nên đây là chỗ đo "trạng thái đã sạch" mà không phụ
    // thuộc vào việc WebView2 có giữ lại :hover cũ sau một lần vẽ lại hay không.
    // (Không dùng dấu huyền trong khối String.raw này: nó sẽ đóng chuỗi giữa chừng.)
    lastCardTranslate: (() => {
      const all = document.querySelectorAll('[data-game-card]');
      return all.length ? getComputedStyle(all[all.length - 1]).translate : '';
    })(),
    hoveredCards: document.querySelectorAll('.lib-card:hover').length,
    cardTransition: cs ? cs.transitionProperty + ' ' + cs.transitionDuration : '',
    liftToken: root.getPropertyValue('--motion-lift').trim(),
    fastToken: root.getPropertyValue('--motion-fast').trim(),
    scrollHeight: document.documentElement.scrollHeight,
    docWidth: document.documentElement.scrollWidth,
  };
})()`;

/** Vị trí tâm của một phần tử, theo toạ độ viewport (CDP dùng toạ độ này). */
const CENTER = (selector) => String.raw`(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: Math.round(r.width), h: Math.round(r.height) };
})()`;

(async () => {
  const c = await connect();
  await c.settle(1000);

  // Thời lượng đã phân giải, tính bằng mili giây: Tailwind rút gọn `120ms` thành `.12s`,
  // nên so chuỗi là so một chi tiết của bản build chứ không phải so lời hứa.
  const ms = (value) => {
    const text = String(value || '').trim();
    const n = Number.parseFloat(text) || 0;
    return /ms$/u.test(text) ? n : n * 1000;
  };

  // Đứng ở thư viện — nơi chủ dự án nêu làm ví dụ.
  await c.evaluate(`document.querySelector('.nav-item[data-page="library"]').click(); 1`);
  await c.settle(900);

  const before = await c.evaluate(STATE);
  check('đang ở thư viện và có ít nhất một thẻ trò chơi', before.page === 'library' && before.cardTransform !== '', before.page + ' / transform=' + before.cardTransform);
  check('biến chuyển động có mặt (--motion-fast, --motion-lift)', ms(before.fastToken) === 120 && before.liftToken === '-2px', before.fastToken + ' (' + ms(before.fastToken) + 'ms) / ' + before.liftToken);
  check('thẻ có transition (không đổi tức thì)', /translate/u.test(before.cardTransition) && !/^0s/u.test(before.cardTransition), before.cardTransition);

  // 1. HOVER — chuột thật đi vào tâm thẻ.
  const cardAt = await c.evaluate(CENTER('[data-game-card]'));
  check('đo được vị trí thẻ', cardAt && cardAt.w > 100 && cardAt.h > 100, JSON.stringify(cardAt));
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5, button: 'none', pointerType: 'mouse' });
  await c.settle(300);
  const away = await c.evaluate(STATE);
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cardAt.x, y: cardAt.y, button: 'none', pointerType: 'mouse' });
  await c.settle(400);
  const hovered = await c.evaluate(STATE);
  // matrix(a, b, c, d, tx, ty) — chỉ đọc ty, đó là con số đã hứa.
  const ty = (value) => {
    const m = /matrix\(([^)]+)\)/u.exec(value || '');
    return m ? Number(m[1].split(',')[5]) : 0;
  };
  // Đo HÌNH CHỮ NHẬT ĐÃ VẼ, không đo tên thuộc tính: câu hứa là "thẻ nhấc lên 2px",
  // và `transform` + `translate` + animation cùng cộng lại mới ra kết quả đó.
  check('chuột thật đang ở trên thẻ', hovered.hoveredCards > 0, String(hovered.hoveredCards));
  check('hover thẻ ⇒ nhấc lên đúng 2px', Math.round((away.cardTop - hovered.cardTop) * 100) / 100 === 2,
    away.cardTop + ' → ' + hovered.cardTop + ' (Δ ' + Math.round((away.cardTop - hovered.cardTop) * 100) / 100 + 'px)');
  // Nhấc 2px một mình là chưa đủ thấy; bóng phải đổi theo, nếu không hiệu ứng chỉ là "thẻ
  // nhảy một chút" mà không nói được "cái này đang được trỏ tới".
  check('hover thẻ ⇒ bóng đổi (không chỉ đổi vị trí)', hovered.cardShadow !== away.cardShadow,
    away.cardShadow + ' → ' + hovered.cardShadow);
  check('hover thẻ KHÔNG xê dịch bố cục', hovered.scrollHeight === away.scrollHeight && hovered.docWidth === away.docWidth,
    away.scrollHeight + ' → ' + hovered.scrollHeight + ' / ' + away.docWidth + ' → ' + hovered.docWidth);

  // 2. NHẤN nút — giữ chuột rồi mới đo, rồi nhả ra ngoài để không kích hoạt cú bấm.
  const btnAt = await c.evaluate(CENTER('[data-game-card] .btn, [data-game-card] .lib-card-play'));
  check('đo được vị trí nút trên thẻ', btnAt && btnAt.w > 40, JSON.stringify(btnAt));
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: btnAt.x, y: btnAt.y, button: 'left', clickCount: 1, pointerType: 'mouse' });
  await c.settle(220);
  const pressedTy = await c.evaluate(String.raw`(() => {
    const el = document.querySelector('[data-game-card] .btn, [data-game-card] .lib-card-play');
    const cs = el ? getComputedStyle(el) : null;
    return { transform: cs ? cs.transform : '', transition: cs ? cs.transitionProperty : '' };
  })()`);
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5, button: 'left', pointerType: 'mouse' });
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 5, y: 5, button: 'left', clickCount: 1, pointerType: 'mouse' });
  await c.settle(300);
  check('nhấn nút ⇒ chìm 1px', Math.round(ty(pressedTy.transform)) === 1, pressedTy.transform);
  check('nút có transition cho transform', /transform/u.test(pressedTy.transition), pressedTy.transition);
  const afterRelease = await c.evaluate(STATE);
  check('nhả chuột ra ngoài ⇒ vẫn ở thư viện (không kích hoạt nhầm)', afterRelease.page === 'library', afterRelease.page);

  // 3. MENU "•••" — animation xuất hiện, không phải bật/tắt tức thì.
  const menuAt = await c.evaluate(CENTER('[data-game-card] [data-menu-toggle]'));
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: menuAt.x, y: menuAt.y, button: 'none', pointerType: 'mouse' });
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: menuAt.x, y: menuAt.y, button: 'left', clickCount: 1, pointerType: 'mouse' });
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: menuAt.x, y: menuAt.y, button: 'left', clickCount: 1, pointerType: 'mouse' });
  await c.settle(60);
  const menuAnim = await c.evaluate(String.raw`(() => {
    const menu = document.querySelector('[data-game-menu-root] [role="menu"]:not([hidden])');
    if (!menu) return null;
    const cs = getComputedStyle(menu);
    return { name: cs.animationName, duration: cs.animationDuration, opacity: cs.opacity };
  })()`);
  check('menu "•••" có animation khi mở', !!menuAnim && menuAnim.name === 'eg-menu-pop', JSON.stringify(menuAnim));
  await c.settle(400);
  const menuSettled = await c.evaluate(String.raw`(() => {
    const menu = document.querySelector('[data-game-menu-root] [role="menu"]:not([hidden])');
    return menu ? Number(getComputedStyle(menu).opacity) : -1;
  })()`);
  check('menu kết thúc ở opacity 1 (không bị kẹt giữa animation)', menuSettled === 1, String(menuSettled));
  await c.evaluate(`document.body.click(); 1`);
  await c.settle(250);

  // 4. THANH "đã chọn N" xuất hiện có animation.
  await c.evaluate(String.raw`(() => {
    const box = document.querySelector('[data-action="library-select"]');
    if (box) box.click();
    return 1;
  })()`);
  await c.settle(80);
  const selBar = await c.evaluate(String.raw`(() => {
    const bar = document.querySelector('.lib-selbar');
    if (!bar) return null;
    const cs = getComputedStyle(bar);
    return { name: cs.animationName, duration: cs.animationDuration };
  })()`);
  check('thanh "đã chọn N" có animation khi xuất hiện', !!selBar && selBar.name === 'eg-selbar-in', JSON.stringify(selBar));
  await c.evaluate(String.raw`(() => {
    const box = document.querySelector('[data-action="library-select"]');
    if (box && box.checked) box.click();
    return 1;
  })()`);
  await c.settle(300);

  // 5. REDUCED MOTION — đo bằng cách trình duyệt thật sự giả lập media feature.
  await c.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await c.settle(200);
  const reducedTokens = await c.evaluate(STATE);
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cardAt.x, y: cardAt.y, button: 'none', pointerType: 'mouse' });
  await c.settle(400);
  const reducedHover = await c.evaluate(STATE);
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5, button: 'none', pointerType: 'mouse' });
  await c.settle(250);
  check('reduce ⇒ --motion-fast = 0ms, --motion-lift = 0px', ms(reducedTokens.fastToken) === 0 && reducedTokens.liftToken === '0px',
    reducedTokens.fastToken + ' (' + ms(reducedTokens.fastToken) + 'ms) / ' + reducedTokens.liftToken);
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cardAt.x, y: cardAt.y, button: 'none', pointerType: 'mouse' });
  await c.settle(300);
  check('reduce ⇒ hover KHÔNG nhấc thẻ', Math.round((away.cardTop - reducedHover.cardTop) * 100) / 100 === 0,
    away.cardTop + ' → ' + reducedHover.cardTop);
  const reducedMenu = await c.evaluate(String.raw`(() => {
    const toggle = document.querySelector('[data-game-card] [data-menu-toggle]');
    if (toggle) toggle.click();
    const menu = document.querySelector('[data-game-menu-root] [role="menu"]:not([hidden])');
    if (!menu) return { name: 'không mở được', duration: '' };
    const cs = getComputedStyle(menu);
    return { name: cs.animationName, duration: cs.animationDuration };
  })()`);
  check('reduce ⇒ menu mở KHÔNG animation', reducedMenu.name === 'none', JSON.stringify(reducedMenu));
  await c.evaluate(`document.body.click(); 1`);
  await c.send('Emulation.setEmulatedMedia', { features: [] });
  await c.settle(300);

  // Dọn trạng thái: về thư viện, không chọn gì, không mở menu.
  await c.evaluate(`document.querySelector('.nav-item[data-page="library"]').click(); 1`);
  await c.settle(600);
  // Dùng `translate` chứ không dùng `top` của hình chữ nhật: rời trang rồi quay lại là một
  // lần vẽ lại (cuộn về đầu), nên toạ độ tuyệt đối đổi dù thẻ không hề nhấc. Đại lượng đo
  // đúng câu hỏi "thẻ còn nhấc không" là `translate` của chính nó.
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5, button: 'none', pointerType: 'mouse' });
  await c.settle(300);
  const cleaned = await c.evaluate(STATE);
  check('dọn sạch: về thư viện, không thẻ nào còn nhấc',
    cleaned.page === 'library' && (cleaned.lastCardTranslate === 'none' || /^0px( 0px)?$/u.test(cleaned.lastCardTranslate)),
    cleaned.page + ' / translate thẻ cuối=' + cleaned.lastCardTranslate);

  const failed = results.filter((row) => !row.ok).length;
  console.log('\nui-motion-check: ' + (results.length - failed) + '/' + results.length + ' passed');
  process.exit(failed ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
