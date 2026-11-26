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
    parentLink: trail ? !!trail.querySelector('button[data-page]') : false,
    parentPage: trail && trail.querySelector('button[data-page]') ? trail.querySelector('button[data-page]').dataset.page : '',
    currentAria: trail && trail.querySelector('[aria-current="page"]') ? trail.querySelector('[aria-current="page"]').getAttribute('aria-current') : '',
    trailTop: trail ? Math.round(trail.getBoundingClientRect().top) : -1,
    headTop: head ? Math.round(head.getBoundingClientRect().top) : -1,
    activeNav: nav,
    backLabel: back ? back.innerText.trim() : '',
    backTitle: back ? back.getAttribute('title') : '',
  };
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
  check('đường dẫn đúng: "Thư viện trò chơi › Chỉnh sửa trò chơi"', inEditor.text === 'Thư viện trò chơi › Chỉnh sửa trò chơi', inEditor.text);
  check('mắt cha là liên kết data-page="library"', inEditor.parentLink === true && inEditor.parentPage === 'library', inEditor.parentPage);
  check('mắt cuối khai báo aria-current=page', inEditor.currentAria === 'page', inEditor.currentAria);
  check('đường dẫn nằm TRÊN đầu trang', inEditor.trailTop >= 0 && inEditor.trailTop < inEditor.headTop, inEditor.trailTop + ' < ' + inEditor.headTop);
  check('sidebar vẫn sáng mục CHA (library), không mục nào khác', inEditor.activeNav.length === 1 && inEditor.activeNav[0] === 'library', JSON.stringify(inEditor.activeNav));
  // Nhãn trên mặt nút là "Quay lại" (tên trang cha đã có ở breadcrumb); đÍCH ĐẾN phải được
  // nói ra ở `title`, nếu không một nút "Quay lại" là một câu mơ hồ.
  check('nút quay lại ngắn gọn, không lặp tên trang cha', inEditor.backLabel === 'Quay lại', inEditor.backLabel);
  check('nút quay lại NÓI RÕ nó về đâu', inEditor.backTitle === 'Về Thư viện trò chơi', inEditor.backTitle);

  // 3. Bấm mắt cha ⇒ về thư viện, đường dẫn biến mất.
  await c.evaluate(`document.querySelector('.page-trail button[data-page]').click(); 1`);
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
