#!/usr/bin/env node
/**
 * DECISIONS #161 — the chrome speaks Lucide, and "Tổng quan" is gone.
 *
 * Before #161 the chrome was hand-typed emoji. Emoji are font glyphs, not icons:
 * they render at the system font's size and baseline, ignore `currentColor`, and
 * cannot be sized — so the same "gear" looked different in the sidebar, in a
 * button and in a heading, and dark mode could not restyle any of them. Every
 * chrome glyph is now a `data-icon` hook filled by `paintUiIcons()`
 * (src/renderer/features/ui-icons.ts) from the generated registry, so the whole
 * app shares one 24x24 stroked set.
 *
 * The same change deleted the overview page and moved its two useful jobs into
 * the sidebar (`features/sidebar-shortcuts.ts`), which is why this check also
 * walks the shortcut block and the landing page.
 *
 * What it guards:
 *   - no `data-icon` hook anywhere on a management page is left blank — a blank
 *     hook means a name that is not in the registry, i.e. an icon that silently
 *     disappeared;
 *   - the sidebar, its shortcut block, page titles, section heads, buttons,
 *     empty states and card menus carry no emoji left (the game-content emoji
 *     that #161 deliberately kept are allowlisted below);
 *   - the sidebar has no "Tổng quan" entry and the app lands on the library;
 *   - the shortcut block really renders its two groups and its quick actions;
 *   - the decorative eyebrows removed with the overview page stay removed.
 *
 * Usage: launch with --remote-debugging-port=PORT, then
 *   node tests/ui/ui-chrome-icons-check.js [port]
 */
process.argv[2] = process.argv[2] || process.env.CDP_PORT || '9392';
const { connect } = require('../manual/lib/ui-check-lib');

const PAGES = ['library', 'create-wizard', 'create', 'lesson-plans', 'my-projects', 'sessions', 'settings'];

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

const SCENARIO = String.raw`(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  // Fresh-profile guard: the setup onboarding opens into #modalRoot a moment
  // after load and would replace the pages this walk measures.
  for (let i = 0; i < 40; i++) { if (document.querySelector('#modalRoot .setup-fullscreen')) break; await sleep(100); }
  if (typeof closeSetupWizard === 'function') closeSetupWizard('close');
  await sleep(250);

  // Ranges that hold the glyphs #161 replaced: arrows, misc symbols/dingbats,
  // boxed symbols, stars, and the emoji planes.
  const GLYPH = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{25A0}-\u{27BF}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}]/u;
  // #161 keeps the emoji that ARE game content — a genre's identity on a card, a
  // race effect tile, the two play-mode chips — plus typographic state marks
  // (the wizard's ✓/· progress steps), the ↔ that ties a matching pair together,
  // and arrows inside a sentence. Those are content or text, not chrome icons.
  const KEEP = new Set([...'🧠🚦🧩🗺🏁🎮🎯🏗⚡🪨🎁⚔️✓●○·↔🏠🕹']);

  const glyphs = text => [...String(text || '')].filter(ch => GLYPH.test(ch) && !KEEP.has(ch));
  const painted = node => Boolean(node) && Boolean(node.firstElementChild)
    && node.firstElementChild.classList.contains('lucide');
  const out = { startPage: state.page, pages: [], sidebar: null, shortcuts: null, unpainted: [], emoji: [] };

  const scanPage = label => {
    const scope = document.getElementById('pageContent') || document.body;
    for (const hook of document.querySelectorAll('[data-icon]')) {
      if (!painted(hook)) out.unpainted.push(label + ':' + (hook.getAttribute('data-icon') || '?'));
    }
    const slots = [
      ['.sidebar', [document.querySelector('.sidebar')]],
      ['page title', [scope.querySelector('h1')]],
      ['.section-head', Array.from(scope.querySelectorAll('.section-head'))],
      ['.btn', Array.from(scope.querySelectorAll('.btn'))],
      ['.editor-asset-chip', Array.from(scope.querySelectorAll('.editor-asset-chip'))],
      ['[role=menuitem]', Array.from(scope.querySelectorAll('[role="menuitem"]'))],
      ['.quick-action', Array.from(scope.querySelectorAll('.quick-action'))],
      ['empty state', [scope.querySelector('.border-dashed')]]
    ];
    for (const [name, list] of slots) {
      for (const node of list) {
        if (!node) continue;
        const bad = glyphs(node.textContent);
        if (bad.length) out.emoji.push({ label, slot: name, text: node.textContent.replace(/\s+/g, ' ').trim().slice(0, 40), glyphs: [...new Set(bad)].join(' ') });
      }
    }
    out.pages.push({
      label,
      hooks: document.querySelectorAll('[data-icon]').length,
      eyebrow: /MY PROJECTS|CLASSROOM REPORTS|LESSON SOURCES|LESSON → GAME/.test(scope.textContent || ''),
      headIcons: Array.from(scope.querySelectorAll('.section-head [data-icon], h1 [data-icon]')).filter(painted).length
    });
  };

  for (const page of PAGES_PLACEHOLDER) {
    navigate(page);
    await sleep(700);
    scanPage(page);
  }

  out.missingPainted = typeof paintUiIcons === 'function' ? paintUiIcons(document) : -1;

  const nav = Array.from(document.querySelectorAll('.nav-item'));
  out.sidebar = {
    items: nav.length,
    pages: nav.map(n => n.getAttribute('data-page')),
    unpainted: nav.filter(n => !painted(n.querySelector('.nav-icon'))).length,
    homeItem: nav.some(n => n.getAttribute('data-page') === 'home'),
    homeRenderer: typeof renderHome
  };

  navigate('library');
  await sleep(700);
  const block = document.querySelector('.sidebar-shortcuts');
  const items = Array.from((block || document.body).querySelectorAll('.shortcut-item'));
  out.shortcuts = {
    present: Boolean(block),
    head: block ? (block.querySelector('.shortcut-head') || {}).textContent || '' : '',
    headPainted: painted(block && block.querySelector('.shortcut-head [data-icon]')),
    labels: Array.from((block || document.body).querySelectorAll('.shortcut-label')).map(n => n.textContent.trim()),
    total: items.length,
    recent: items.filter(i => i.getAttribute('data-action') === 'play').length,
    quick: items.filter(i => i.getAttribute('data-page')).length,
    unpainted: items.filter(i => !painted(i.querySelector('.shortcut-icon'))).length,
    emptyText: block && !items.length ? String((block.querySelector('.shortcut-empty') || {}).textContent || '') : ''
  };
  const card = document.querySelector('[data-menu-toggle]');
  out.cardMenu = { present: Boolean(card), painted: painted(card && card.querySelector('[data-icon]')) };
  return out;
})()`;

(async () => {
  const cdp = await connect();
  const out = await cdp.evaluate(SCENARIO.replace('PAGES_PLACEHOLDER', JSON.stringify(PAGES)));

  check(`the walk visited every management page (${PAGES.length})`, out.pages.length === PAGES.length,
    out.pages.map(p => p.label).join(','));
  check('every chrome icon on those pages was painted from the registry', out.unpainted.length === 0,
    [...new Set(out.unpainted)].slice(0, 8).join(' | ') || 'none blank');
  check('paintUiIcons() finds no unknown icon id in the live DOM', out.missingPainted === 0, `missing=${out.missingPainted}`);
  check('no emoji survives in the chrome slots', out.emoji.length === 0,
    out.emoji.slice(0, 6).map(e => `${e.label} ${e.slot} "${e.text}" → ${e.glyphs}`).join(' | ') || 'clean');

  check('the sidebar dropped "Tổng quan" and keeps one entry per page',
    out.sidebar.homeItem === false && out.sidebar.pages.includes('library') && out.sidebar.items === out.sidebar.pages.length,
    JSON.stringify(out.sidebar.pages));
  check('every sidebar entry carries a painted Lucide icon', out.sidebar.unpainted === 0, `unpainted=${out.sidebar.unpainted}`);
  check('the overview renderer is really gone', out.sidebar.homeRenderer === 'undefined', `typeof renderHome=${out.sidebar.homeRenderer}`);
  check('the app lands on the library', out.startPage === 'library', out.startPage);
  check('the decorative eyebrows removed with the overview page stay removed',
    out.pages.every(p => !p.eyebrow), out.pages.filter(p => p.eyebrow).map(p => p.label).join(','));

  check('the shortcut block renders under the nav', out.shortcuts.present && /Lối tắt/.test(out.shortcuts.head),
    JSON.stringify({ present: out.shortcuts.present, head: out.shortcuts.head }));
  check('its Lucide header icon is painted', out.shortcuts.headPainted === true);
  check('it holds the two groups the overview page was actually for',
    out.shortcuts.labels.includes('Gần đây') && out.shortcuts.labels.includes('Thao tác nhanh'), out.shortcuts.labels.join(','));
  check('the two quick actions navigate and stay inside the sidebar',
    out.shortcuts.quick === 2 && out.shortcuts.unpainted === 0,
    `quick=${out.shortcuts.quick} unpainted=${out.shortcuts.unpainted}`);
  check('recent games are capped at three', out.shortcuts.recent <= 3,
    out.shortcuts.recent ? `recent=${out.shortcuts.recent}` : `empty: ${out.shortcuts.emptyText.slice(0, 40)}`);
  check('the library card menu uses a Lucide toggle', out.cardMenu.present && out.cardMenu.painted,
    JSON.stringify(out.cardMenu));

  console.log(`\n${failures ? `${failures} check(s) failed` : 'All chrome icon checks passed'}`);
  process.exit(failures ? 1 : 0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
