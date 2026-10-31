#!/usr/bin/env node
/**
 * DECISIONS #119/#120 — the "•••" menu on a game card.
 *
 * The card keeps only "Chơi ngay" / "Toàn màn hình"; Chơi LAN, Chỉnh sửa, Xuất gói and
 * Xoá live in the menu. The menu must close itself whenever the teacher picks a
 * feature or clicks anywhere else: that is what this check pins.
 *
 * Usage: launch the app with --remote-debugging-port=PORT (see tests/ui/launch-app.ps1),
 * then `node tests/ui/ui-card-menu-check.js [port]`.
 */
process.argv[2] = process.argv[2] || process.env.CDP_PORT || '9338';
const { connect } = require('../manual/lib/ui-check-lib');

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

(async () => {
  const cdp = await connect();
  const result = await cdp.evaluate(`(async () => {
    // Two synthetic games so "one menu at a time" has something to compete with; both
    // are removed again before returning, so the teacher's library is untouched.
    const base = {
      template: 'quiz', description: '', subject: 'Toán', grade: '4',
      questions: [{ id: 'q1', type: 'multiple-choice', prompt: '1+1?', explanation: 'Hai.', points: 100,
        options: [{ id: 'a', text: '2' }, { id: 'b', text: '3' }], correctOptionId: 'a' }]
    };
    const first = await window.eduGame.saveGame({ ...base, title: 'Kiểm tra menu chấm' });
    const second = await window.eduGame.saveGame({ ...base, title: 'Kiểm tra menu chấm 2' });
    state.db = await window.eduGame.getLibrary();
    navigate('library');
    await new Promise(r => setTimeout(r, 400));

    const article = [...document.querySelectorAll('article')].find(a => a.textContent.includes('Kiểm tra menu chấm'));
    const toggle = article.querySelector('[data-menu-toggle]');
    const menu = document.getElementById(toggle.dataset.menuToggle);
    const open = () => !menu.hasAttribute('hidden');
    const expanded = () => toggle.getAttribute('aria-expanded') === 'true';
    const out = {};

    out.barActions = [...article.querySelectorAll(':scope > div:last-child > [data-action], :scope > div:last-child [data-action]')]
      .filter(node => !node.closest('[role="menu"]')).map(node => node.dataset.action);

    // The menu holds exactly the four secondary actions, in this order.
    out.menuActions = [...menu.querySelectorAll('[data-action]')].map(node => node.dataset.action);
    out.menuLabels = [...menu.querySelectorAll('[data-action]')].map(node => node.textContent.trim());

    toggle.click(); out.opens = open() && expanded();
    toggle.click(); out.toggleCloses = !open() && !expanded();

    toggle.click(); document.querySelector('h1').click(); out.outsideClick = !open() && !expanded();
    toggle.click(); document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); out.escape = !open();
    toggle.click(); document.dispatchEvent(new Event('scroll')); out.scroll = !open();
    toggle.click(); window.dispatchEvent(new Event('resize')); out.resize = !open();

    // Picking a feature closes the menu before the action runs.
    toggle.click();
    const realExport = window.eduGame.exportGame;
    window.eduGame.exportGame = async () => ({ canceled: true });
    menu.querySelector('[data-action="export-game"]').click();
    await new Promise(r => setTimeout(r, 150));
    window.eduGame.exportGame = realExport;
    out.itemPicked = !open() && !expanded();

    // Only one menu open at a time.
    const toggles = [...document.querySelectorAll('[data-menu-toggle]')];
    toggles[0].click();
    toggles[1].click();
    out.oneAtATime = document.querySelectorAll('[role="menu"]:not([hidden])').length === 1;

    navigate('home');
    out.closedOnNavigate = document.querySelectorAll('[role="menu"]:not([hidden])').length === 0;

    await window.eduGame.deleteGame(first.id);
    await window.eduGame.deleteGame(second.id);
    state.db = await window.eduGame.getLibrary();
    navigate('library');
    return out;
  })()`);

  check('the card shows only play and full screen outside the menu',
    /^play,play-fullscreen$/.test(result.barActions.join(',')), result.barActions.join(','));
  check('"•••" opens its menu and sets aria-expanded', result.opens === true);
  check('the menu holds Chơi LAN, Chỉnh sửa, Xuất game, Xoá in that order',
    String(result.menuActions).replace(/,/g, ',') === 'lan,edit,export-game,delete', String(result.menuActions));
  check('each menu item is labelled in Vietnamese',
    /Chơi LAN/.test(String(result.menuLabels[0])) && /Chỉnh sửa/.test(String(result.menuLabels[1]))
    && /Xuất game/.test(String(result.menuLabels[2])) && /Xoá/.test(String(result.menuLabels[3])), String(result.menuLabels).slice(0, 90));
  check('"•••" closes it again on a second click', result.toggleCloses === true);
  check('a click outside closes the menu', result.outsideClick === true);
  check('Escape closes the menu', result.escape === true);
  check('scrolling closes the menu', result.scroll === true);
  check('resizing the window closes the menu', result.resize === true);
  check('picking a menu item closes the menu', result.itemPicked === true);
  check('only one card menu is open at a time', result.oneAtATime === true);
  check('changing page leaves no menu open', result.closedOnNavigate === true);

  console.log(`\n${failures ? `${failures} check(s) failed` : 'All card-menu checks passed'}`);
  process.exit(failures ? 1 : 0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
