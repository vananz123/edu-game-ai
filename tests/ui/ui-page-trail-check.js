#!/usr/bin/env node
/**
 * #369 — đường dẫn trang cha → trang con: "Thư viện trò chơi › Chỉnh sửa trò chơi".
 *
 * Đo trên app THẬT, bằng cú bấm thật (menu "•••" của thẻ game → "Chỉnh sửa"), không gọi
 * `editGame()` trực tiếp: cái phải chứng minh là *đường đi* mang theo trang cha, không phải
 * một hàm biết làm đúng khi được gọi đúng.
 *
 * Năm câu: (1) sáu trang cấp 1 KHÔNG có breadcrumb; (2) vào trình soạn thảo từ thư viện thì
 * đường dẫn đúng và nằm TRÊN đầu trang; (3) mắt cha là liên kết thật và bấm được; (4) mục
 * sidebar của CHA vẫn sáng khi đang ở trang con; (5) nút quay lại ghi tên trang cha thật.
 *
 * Usage: `node tests/ui/ui-page-trail-check.js [port]`.
 */
process.argv[2] = process.argv[2] || process.env.CDP_PORT || '9369';

const { connect, check, results } = require('../manual/lib/ui-check-lib');

const TRAIL = String.raw`(() => {
  const trail = document.querySelector('.page-trail');
  const nav = [...document.querySelectorAll('.nav-item[data-page]')].filter(el => el.classList.contains('active')).map(el => el.dataset.page);
  const head = document.querySelector('.editor-page-head, .page-head');
  const back = document.querySelector('[data-editor-back]');
  return {
    page: (typeof state !== 'undefined' && state.page) || '',
    hasTrail: !!trail,
    text: trail ? trail.innerText.replace(/\s+/g, ' ').trim() : '',
    // Mắt cha có hai dạng: [data-page] (điều hướng thẳng, dùng cho trang con nói chung) và
    // [data-page-trail-parent] (bản trong header trình soạn thảo, phải đi qua câu hỏi chưa-lưu).
    // Không dùng dấu huyền trong khối này: chuỗi String.raw ở trên sẽ bị đóng giữa chừng.
    parentLink: trail ? !!trail.querySelector('button[data-page], button[data-page-trail-parent]') : false,
    parentPage: trail && trail.querySelector('button[data-page], button[data-page-trail-parent]')
      ? (trail.querySelector('button[data-page], button[data-page-trail-parent]').dataset.page
        || trail.querySelector('button[data-page], button[data-page-trail-parent]').dataset.pageTrailParent)
      : '',
    currentAria: trail && trail.querySelector('[aria-current="page"]') ? trail.querySelector('[aria-current="page"]').getAttribute('aria-current') : '',
    trailTop: trail ? Math.round(trail.getBoundingClientRect().top) : -1,
    headTop: head ? Math.round(head.getBoundingClientRect().top) : -1,
    trailInHead: trail ? !!trail.closest('.editor-page-head') : false,
    trailFontSize: trail ? getComputedStyle(trail).fontSize : '',
    trailLineHeight: trail ? getComputedStyle(trail).lineHeight : '',
    h1Top: document.querySelector('.editor-page-head h1') ? Math.round(document.querySelector('.editor-page-head h1').getBoundingClientRect().top) : -1,
    backHook: (() => {
      const el = document.querySelector('[data-editor-back]');
      return el ? { tag: el.tagName, inTrail: !!el.closest('.page-trail'), page: el.dataset.pageTrailParent || '', title: el.getAttribute('title') || '', dataPage: el.dataset.page || '' } : null;
    })(),
    // Số DÒNG xếp chồng trước nội dung đầu tiên: mỗi offset top khác nhau là một dòng.
    rowsBeforeContent: (() => {
      // Mốc "nội dung bắt đầu": phần tử đầu tiên của trang KHÔNG phải header/thanh Lưu
      // (trình soạn thảo dùng ".editor-page-body, các trang khác dùng .panel).
      const skip = new Set(['editor-page-head', 'editor-save-bar', 'page-trail']);
      let content = null;
      const root = document.querySelector('#pageContent > *');
      if (root) {
        for (const child of root.children) {
          if ([...skip].some((cls) => child.classList.contains(cls))) continue;
          content = child;
          break;
        }
      }
      if (!content) content = document.querySelector('#pageContent .panel');
      if (!content) return -1;
      const limit = content.getBoundingClientRect().top;
      const rows = new Set();
      document.querySelectorAll('#pageContent .page-trail, #pageContent .editor-page-head, #pageContent .editor-save-bar').forEach((el) => {
        // Đường dẫn NẰM TRONG header là một dòng của header, không phải một dòng xếp chồng
        // riêng — đếm nó là đếm hai lần cùng một dải.
        if (el.classList.contains('page-trail') && el.closest('.editor-page-head')) return;
        const r = el.getBoundingClientRect();
        if (r.height > 0 && r.top < limit) rows.add(Math.round(r.top));
      });
      return rows.size;
    })(),
    activeNav: nav,
    backLabel: back ? back.innerText.trim() : '',
    backTitle: back ? back.getAttribute('title') : '',
  };
})()`;

// Tương phản (WCAG) của chữ trên nền thật — đo, không đoán. Ngưỡng 7:1 vì đây là chữ phải
// đọc để biết mình đang ở đâu, và vì bản sửa #369 làm màu tiêu đề đi qua token.
const CONTRAST = String.raw`(() => {
  const parse = (s) => s.match(/[\d.]+/g).map(Number);
  const lum = (c) => { const [r, g, b] = c.slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const la = lum(parse(a)); const lb = lum(parse(b)); const hi = Math.max(la, lb); const lo = Math.min(la, lb); return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100; };
  const bgOf = (el) => { let n = el; while (n) { const bg = getComputedStyle(n).backgroundColor; if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg; n = n.parentElement; } return 'rgb(255, 255, 255)'; };
  const at = (sel) => { const el = document.querySelector(sel); if (!el) return null; const cs = getComputedStyle(el); return ratio(cs.color, bgOf(el)); };
  return { h1: at('.editor-page-head h1'), link: at('.page-trail.is-head .page-trail-link'), sep: at('.page-trail.is-head .page-trail-sep') };
})()`;

(async () => {
  const c = await connect();
  await c.settle(1000);

  // 1. Sáu trang cấp 1: không breadcrumb (bấm thật vào sidebar).
  for (const page of ['create-wizard', 'create', 'lesson-plans', 'my-projects', 'sessions', 'settings', 'library']) {
    await c.evaluate(`document.querySelector('.nav-item[data-page="${page}"]').click(); 1`);
    await c.settle(600);
    const m = await c.evaluate(TRAIL);
    check(`trang cấp 1 "${page}" không có đường dẫn`, m.hasTrail === false && m.text === '', m.text || '(không có)');
    check(`trang cấp 1 "${page}" sáng đúng mục sidebar`, m.activeNav.length === 1 && m.activeNav[0] === page, JSON.stringify(m.activeNav));
  }

  // 2. Vào trình soạn thảo bằng cú bấm thật trên thẻ game.
  await c.evaluate(`document.querySelector('.nav-item[data-page="library"]').click(); 1`);
  await c.settle(900);
  const opened = await c.evaluate(String.raw`(() => {
    const card = document.querySelector('[data-game-card]');
    if (!card) return { error: 'không có thẻ game nào' };
    const toggle = card.querySelector('[data-menu-toggle]');
    toggle.click();
    const edit = card.querySelector('[data-action="edit"]');
    if (!edit) return { error: 'thẻ game không có mục Chỉnh sửa' };
    edit.click();
    return { clicked: true, gameId: card.dataset.gameCard };
  })()`);
  check('mở được trình soạn thảo từ thẻ game', opened.clicked === true, JSON.stringify(opened));
  await c.settle(1200);
  const inEditor = await c.evaluate(TRAIL);
  check('đang ở trang trình soạn thảo', inEditor.page === 'editor', inEditor.page);
  check('có đường dẫn', inEditor.hasTrail === true, inEditor.text);
  // Đường dẫn trong header chỉ nói ĐƯỜNG VỀ; mắt cuối là <h1> ngay dưới, nên tên trang đang
  // mở không được xuất hiện hai lần trong 20 px.
  check('đường dẫn đọc là "← Thư viện trò chơi ›", không lặp tên trang đang mở', inEditor.text === '← Thư viện trò chơi ›', inEditor.text);
  check('không còn từ "Chỉnh sửa trò chơi" trong đường dẫn', inEditor.text.indexOf('Chỉnh sửa trò chơi') === -1, inEditor.text);
  check('đường dẫn nằm TRONG header, ngay trên <h1>', inEditor.trailInHead === true && inEditor.trailTop < inEditor.h1Top, inEditor.trailTop + ' < ' + inEditor.h1Top);
  check('cỡ chữ đường dẫn = 12px (không nhỏ hơn sàn 11px của #208)', inEditor.trailFontSize === '12px', inEditor.trailFontSize + ' / lh ' + inEditor.trailLineHeight);
  // Chỉ còn HAI dòng trước nội dung (header + thanh Lưu); trước #369b là ba (thêm dòng
  // breadcrumb riêng). Đây là con số đo được của việc "bớt rối", không phải cảm nhận.
  check('chỉ còn 2 dòng xếp chồng trước nội dung (header + thanh Lưu)', inEditor.rowsBeforeContent === 2, String(inEditor.rowsBeforeContent));
  check('chỉ còn MỘT nút rời trang, và nó chính là mắt cha', inEditor.backHook !== null && inEditor.backHook.inTrail === true, JSON.stringify(inEditor.backHook));
  check('mắt cha trỏ về library qua data-page-trail-parent', inEditor.parentLink === true && inEditor.parentPage === 'library', inEditor.parentPage);
  // Mắt cha KHÔNG được là `data-page`: `[data-page]` là điều hướng thẳng của controller và sẽ
  // bỏ qua câu hỏi "thay đổi chưa lưu sẽ mất" mà wireEditorPage gắn cho [data-editor-back].
  check('mắt cha không dùng data-page (để câu hỏi chưa-lưu vẫn được hỏi)', !inEditor.backHook.dataPage, inEditor.backHook.dataPage || '(không có)');
  check('mắt cha NÓI RÕ nó về đâu', inEditor.backHook.title === 'Về Thư viện trò chơi', inEditor.backHook.title);
  check('sidebar vẫn sáng mục CHA (library), không mục nào khác', inEditor.activeNav.length === 1 && inEditor.activeNav[0] === 'library', JSON.stringify(inEditor.activeNav));

  // 2b. Tương phản chữ ở CẢ HAI theme (dark mode từng làm tiêu đề gần như vô hình: 1,27:1).
  const lightContrast = await c.evaluate(CONTRAST);
  // Ngưỡng theo CỠ CHỮ, không theo một con số chung: tiêu đề 18px/800 phải đạt 7:1; mắt cha và
  // dấu › là chữ phụ 12px, chuẩn AA là 4,5:1 — đòi 7:1 ở đây sẽ phải kéo chúng về gần đen và
  // làm chúng tranh chỗ với tiêu đề, tức là quay lại đúng cái rối vừa bỏ.
  check('tương phản SÁNG: tiêu đề ≥ 7, chữ phụ ≥ 4,5',
    lightContrast.h1 >= 7 && lightContrast.link >= 4.5 && lightContrast.sep >= 4.5, JSON.stringify(lightContrast));
  await c.evaluate(`document.documentElement.setAttribute('data-theme','dark'); 1`);
  await c.settle(600);
  const darkContrast = await c.evaluate(CONTRAST);
  check('tương phản TỐI: tiêu đề ≥ 7, chữ phụ ≥ 4,5 — không còn màu hard-code',
    darkContrast.h1 >= 7 && darkContrast.link >= 4.5 && darkContrast.sep >= 4.5, JSON.stringify(darkContrast));
  await c.evaluate(`document.documentElement.setAttribute('data-theme','light'); 1`);
  await c.settle(500);

  // 3. Bấm mắt cha ⇒ về thư viện, đường dẫn biến mất.
  await c.evaluate(`document.querySelector('.page-trail [data-page-trail-parent]').click(); 1`);
  await c.settle(900);
  const back = await c.evaluate(TRAIL);
  check('bấm mắt cha quay về thư viện', back.page === 'library' && back.hasTrail === false, back.page + ' trail=' + back.hasTrail);

  // 4. Nút quay lại trong trình soạn thảo cũng phải về đúng cha.
  const again = await c.evaluate(String.raw`(() => {
    const card = document.querySelector('[data-game-card]');
    if (!card) return false;
    card.querySelector('[data-menu-toggle]').click();
    const edit = card.querySelector('[data-action="edit"]');
    if (!edit) return false;
    edit.click();
    return true;
  })()`);
  check('mở lại trình soạn thảo được', again === true, String(again));
  await c.settle(1200);
  await c.evaluate(`document.querySelector('[data-editor-back]').click(); 1`);
  await c.settle(900);
  const afterBack = await c.evaluate(TRAIL);
  check('nút quay lại trong trình soạn thảo về đúng trang cha', afterBack.page === 'library' && afterBack.hasTrail === false, afterBack.page);

  const failed = results.filter((row) => !row.ok).length;
  console.log('\nui-page-trail-check: ' + (results.length - failed) + '/' + results.length + ' passed');
  process.exit(failed ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
