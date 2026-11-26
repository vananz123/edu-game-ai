// #368 — cổng đo ẩn/hiện thanh bên trên app THẬT.
process.argv[2] = process.argv[2] || process.env.CDP_PORT || '9368';
const { connect, check, results } = require('../manual/lib/ui-check-lib');

const PROBE = String.raw`(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const aside = document.querySelector('aside.sidebar');
  const reveal = document.querySelector('[data-sidebar-show]');
  const toggle = document.querySelector('[data-sidebar-toggle]');
  const main = document.querySelector('main.main');
  const content = document.querySelector('#pageContent');
  const rect = (el) => { const r = el.getBoundingClientRect(); return { w: Math.round(r.width), x: Math.round(r.left), top: Math.round(r.top) }; };
  return {
    state: document.documentElement.getAttribute('data-sidebar'),
    stored: (() => { try { return localStorage.getItem('edugame.sidebar'); } catch { return 'blocked'; } })(),
    asideDisplay: aside ? getComputedStyle(aside).display : 'missing',
    aside: aside ? rect(aside) : null,
    main: main ? rect(main) : null,
    content: content ? rect(content) : null,
    revealHidden: reveal ? reveal.hidden : 'missing',
    revealDisplay: reveal ? getComputedStyle(reveal).display : 'missing',
    revealRect: reveal ? rect(reveal) : null,
    toggleAria: toggle ? toggle.getAttribute('aria-expanded') : 'missing',
    sidebarStatusVisible: (() => { const el = document.querySelector('[data-sidebar-status]'); return el ? getComputedStyle(el).display !== 'none' : false; })(),
  };
})()`;

(async () => {
  const c = await connect();
  const read = () => c.evaluate(PROBE);
  await c.settle(900);

  const before = await read();

  const rows = [];
  // `check` của thư viện: một dòng PASS/FAIL cho mỗi khẳng định, `ok` là trường thật.
  const t = (name, pass, detail) => check(name, pass, detail === undefined ? '' : String(detail));

  t('thanh bên đang hiện, rộng > 180px', before.asideDisplay !== 'none' && before.aside.w > 180, JSON.stringify(before.aside));
  t('trạng thái mặc định là "shown"', before.state === 'shown' || before.state === null, String(before.state));
  t('nút "hiện thanh bên" đang bị ẩn', before.revealHidden === true && before.revealDisplay === 'none', before.revealHidden + '/' + before.revealDisplay);
  t('nút ẩn khai báo aria-expanded=true', before.toggleAria === 'true', String(before.toggleAria));
  const contentBefore = before.content.w;

  // Bấm nút ẩn THẬT trong app (không gọi hàm).
  await c.evaluate(`document.querySelector('[data-sidebar-toggle]').click(); 1`);
  await c.settle(400);
  const hidden = await read();
  t('bấm nút ẩn ⇒ thanh bên rời khỏi bố cục', hidden.asideDisplay === 'none' && hidden.aside.w === 0, JSON.stringify({ display: hidden.asideDisplay, w: hidden.aside.w }));
  t('nội dung nhận lại chỗ (rộng hơn)', hidden.content.w > contentBefore, contentBefore + ' → ' + hidden.content.w);
  t('trạng thái "hidden" + đã lưu', hidden.state === 'hidden' && hidden.stored === 'hidden', hidden.state + '/' + hidden.stored);
  t('nút "hiện thanh bên" xuất hiện', hidden.revealHidden === false && hidden.revealDisplay !== 'none', hidden.revealHidden + '/' + hidden.revealDisplay);
  t('tay nắm nằm sát mép trái, không che chữ', hidden.revealRect.x === 0 && hidden.revealRect.w <= 26, JSON.stringify(hidden.revealRect));
  t('nút ẩn cập nhật aria-expanded=false', hidden.toggleAria === 'false', String(hidden.toggleAria));

  // Bấm nút hiện.
  await c.evaluate(`document.querySelector('[data-sidebar-show]').click(); 1`);
  await c.settle(400);
  const shown = await read();
  t('bấm nút hiện ⇒ thanh bên trở lại, cùng bề rộng', shown.asideDisplay !== 'none' && shown.aside.w === before.aside.w, JSON.stringify(shown.aside));
  t('trạng thái "shown" + đã lưu', shown.state === 'shown' && shown.stored === 'shown', shown.state + '/' + shown.stored);

  // Bàn phím Ctrl+B.
  await c.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true })); 1`);
  await c.settle(400);
  const viaKey = await read();
  t('Ctrl+B ẩn được', viaKey.state === 'hidden' && viaKey.asideDisplay === 'none', viaKey.state);
  await c.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true })); 1`);
  await c.settle(400);
  const back = await read();
  t('Ctrl+B hiện lại được', back.state === 'shown' && back.aside.w === before.aside.w, back.state + ' w=' + back.aside.w);

  // Ghi nhớ qua lần nạp lại thật (Page.reload).
  await c.evaluate(`document.querySelector('[data-sidebar-toggle]').click(); 1`);
  await c.settle(300);
  await c.send('Page.reload', {});
  await c.settle(2500);
  const afterReload = await read();
  t('nạp lại app vẫn giữ trạng thái ẩn', afterReload.state === 'hidden' && afterReload.asideDisplay === 'none', afterReload.state + '/' + afterReload.asideDisplay);
  t('sau nạp lại vẫn có đường hiện', afterReload.revealHidden === false && afterReload.revealDisplay !== 'none', String(afterReload.revealHidden));

  // Trả lại trạng thái hiện cho profile này.
  await c.evaluate(`document.querySelector('[data-sidebar-show]').click(); 1`);
  await c.settle(400);
  const final = await read();
  t('dọn: trở lại "shown"', final.state === 'shown' && final.aside.w === before.aside.w, final.state + ' w=' + final.aside.w);

  const failed = results.filter((r) => !r.ok);
  for (const r of results) console.log((r.ok ? 'PASS  ' : 'FAIL  ') + r.name + (r.detail ? '  — ' + r.detail : ''));
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' kiểm tra đạt');
  process.exit(failed.length ? 1 : 0);
})().catch((error) => { console.error(error); process.exit(1); });
