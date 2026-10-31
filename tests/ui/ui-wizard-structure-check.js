// ui-wizard-structure-check.js — step 1 structure tree: ticking a section and
// switching tabs must not make the page jump.
//
// The tree is re-rendered through `innerHTML` on every tick, so the regression
// this guards is "the view resets": the tree scroll position and the keyboard
// focus used to disappear on each click ("khựng và giật"), and switching to the
// structure tab before the debounced analyzer had run left the pane blank.
//
// Run against a built app:
//   npm run build
//   npx electron . --remote-debugging-port=9362
//   node tests/ui/ui-wizard-structure-check.js 9362
const { check, connect, results } = require('../manual/lib/ui-check-lib');

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const { ws, evaluate } = await connect();

  // A fresh profile opens the setup onboarding as a full-screen page:
  // `html[data-setup-fullscreen]` hides `.app-shell`, and a hidden page cannot take
  // keyboard focus — `focus()` leaves `activeElement` on <body>. That alone made the
  // focus assertion below fail, which was misread for a long time as "the window has
  // no OS focus". Canonical guard, same as the other UI checks.
  await evaluate(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 40; i++) { if (document.querySelector('#modalRoot .setup-fullscreen')) break; await sleep(100); }
    if (typeof closeSetupWizard === 'function') closeSetupWizard('close');
    await sleep(250);
    return true;
  })()`);

  const surface = await evaluate(`(() => ({
    capture: typeof wizardStructureCaptureView === 'function',
    restore: typeof wizardStructureRestoreView === 'function',
    sync: typeof wizardSyncStructureCheckboxes === 'function'
  }))()`);
  check(
    'the step-1 view helpers are loaded',
    surface.capture && surface.restore && surface.sync,
    JSON.stringify(surface)
  );
  if (!(surface.capture && surface.restore && surface.sync)) {
    console.log('\nStep-1 structure helpers are missing — the remaining checks cannot run.');
    console.log(`${results.filter(r => r.ok).length}/${results.length} passed`);
    process.exitCode = 1;
    ws.close();
    return;
  }

  // Build a real document in step 1, let the local analyzer run, then tick a
  // section while the tree is scrolled down.
  const probe = await evaluate(`(async () => {
    const waitFor = async (fn, ms) => { const started = Date.now(); while (Date.now() - started < (ms || 20000)) { if (fn()) return true; await new Promise(r => setTimeout(r, 100)); } return false; };
    wizardReset();
    wizardState.text = Array.from({ length: 40 }, (_, i) =>
      'PHAN ' + (i + 1) + ': NOI DUNG BAI HOC\\n' + ('Quang hop tong hop chat huu co nho nang luong anh sang mat troi. '.repeat(4))
    ).join('\\n\\n');
    wizardState.documentName = 'structure-check.txt';
    wizardState.step = 'input';
    wizardState.inputTab = 'structure';
    navigate('create-wizard');
    await wizardStructureRefresh();
    if (!wizardState.structure || !wizardState.structure.tree) return { error: 'no tree' };
    wizardState.inputTab = 'structure';
    render();
    const list = document.querySelector('[data-structure-tree]');
    const boxes = Array.from(document.querySelectorAll('[data-wizard-section]'));
    if (!list || boxes.length < 3) return { error: 'tree not rendered', boxes: boxes.length };
    list.scrollTop = Math.min(80, list.scrollHeight - list.clientHeight);
    wizardStructureCaptureView();
    const before = { scroll: list.scrollTop, depth: boxes.length };
    const target = boxes[Math.min(2, boxes.length - 1)];
    const id = target.getAttribute('data-wizard-section');
    target.click();
    // Read synchronously: this is what the render leaves behind. The focus is
    // restored one frame later (the render replaces the page); the first check
    // below waits for that frame, the scroll check must not.
    const immediateList = document.querySelector('[data-structure-tree]');
    const restoredScroll = immediateList ? immediateList.scrollTop : null;
    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
    const immediateFocus = document.activeElement;
    const restored = {
      scroll: restoredScroll,
      focusedSection: immediateFocus && immediateFocus.getAttribute ? immediateFocus.getAttribute('data-wizard-section') : null
    };
    // The debounced preview then re-renders once; the live check below confirms
    // the offset survives that render in a real window, so the test only waits
    // for it to settle before the tab checks reuse the same page.
    await new Promise(r => setTimeout(r, 1500));
    const nextList = document.querySelector('[data-structure-tree]');
    const focused = document.activeElement;
    const row = focused && focused.getAttribute ? focused.getAttribute('data-wizard-section') : null;
    return {
      before,
      restored,
      after: { scroll: nextList ? nextList.scrollTop : null, focusedSection: row },
      stillCustom: wizardState.structure.customized,
      expectedSection: id,
      error: ''
    };
  })()`);

  check('a document builds a real structure tree', !probe.error, JSON.stringify(probe));
  if (!probe.error) {
    check(
      'the render restores the tree scroll position right after the tick',
      probe.restored.scroll === probe.before.scroll,
      JSON.stringify({ before: probe.before, restored: probe.restored })
    );
    check(
      'the render keeps the keyboard focus on the ticked row',
      probe.restored.focusedSection === probe.expectedSection,
      JSON.stringify({ focused: probe.restored.focusedSection, expected: probe.expectedSection })
    );

    check('the tick is recorded as a custom scope', probe.stillCustom === true, String(probe.stillCustom));
  }

  // The tristate a browser cannot express in `outerHTML` (a child ticked under
  // two siblings renders the parent as indeterminate). Right after the click the
  // fresh DOM must already show it: this is the assertion that fails when
  // `render()` stops calling `wizardSyncStructureCheckboxes()` after `innerHTML`.
  const tristate = await evaluate(`(async () => {
    wizardReset();
    // Uppercase roman/arabic headings nested two levels — the shape the real
    // analyzer recognises (lowercase "PHAN"/"Muc" lines are prose to it).
    wizardState.text = ['I. MUC TIEU', '1.1. Kien thuc', '1.2. Ky nang', 'II. THIET BI DAY HOC', '2.1. May chieu']
      .map(heading => heading + '\\n\\n' + 'Quang hop tong hop chat huu co nho nang luong anh sang mat troi. '.repeat(3))
      .join('\\n\\n');
    wizardState.documentName = 'tristate-check.txt';
    wizardState.step = 'input';
    wizardState.inputTab = 'structure';
    navigate('create-wizard');
    await wizardStructureRefresh();
    render();
    const index = wizardStructureIndex(wizardState.structure.tree).byId;
    const inputs = Array.from(document.querySelectorAll('[data-wizard-section]'));
    const rows = inputs.map(input => ({ input, row: input.closest('.wizard-tree-node') }));
    // A leaf under a parent that also has a sibling, so ticking it must leave the
    // parent partly checked.
    const leaf = rows.find(entry => {
      const node = index.get(entry.input.getAttribute('data-wizard-section'));
      // The root row has no checkbox, so a row without one is the document.
      if (!node || node.children.length) return false;
      for (const parent of index.values()) {
        if (parent.children && parent.children.some(child => child.id === node.id) && parent.children.length > 1) return true;
      }
      return false;
    });
    if (!leaf) return { error: 'no nested section', rows: rows.length };
    const id = leaf.input.getAttribute('data-wizard-section');
    const before = { aria: leaf.row.getAttribute('aria-checked'), depth: leaf.row.getAttribute('data-depth') };
    leaf.input.click();
    const fresh = document.querySelector('[data-wizard-section="' + id + '"]');
    const indeterminate = Array.from(document.querySelectorAll('[data-wizard-section]')).filter(input => input.indeterminate);
    return {
      before,
      error: '',
      freshChecked: fresh ? fresh.checked : null,
      indeterminateCount: indeterminate.length,
      mixedAria: Array.from(document.querySelectorAll('.wizard-tree-node[aria-checked="mixed"]')).length
    };
  })()`);
  check('the tristate can be measured on a nested section box', !tristate.error, JSON.stringify(tristate));
  if (!tristate.error) {
    check(
      'a child tick leaves its parent checkbox indeterminate in the same render',
      tristate.indeterminateCount > 0,
      JSON.stringify(tristate)
    );
    check(
      'the parent row reports the partial state through aria-checked',
      tristate.mixedAria > 0,
      JSON.stringify(tristate)
    );
    check(
      'the ticked row renders unticked after the click',
      tristate.freshChecked === false,
      JSON.stringify(tristate)
    );
  }

  // The tab counters are rendered once and then patched while typing: a paste
  // must not leave "0 ký tự" on the content tab.
  const counters = await evaluate(`(async () => {
    wizardState.structure = null;
    wizardState.text = '';
    wizardState.inputTab = 'content';
    render();
    const area = document.getElementById('wizardDocText');
    area.value = 'PHAN 1: MO DAU\\n' + ('Quang hop la qua trinh tong hop chat huu co. '.repeat(4));
    area.dispatchEvent(new Event('input', { bubbles: true }));
    const span = document.querySelector('[data-wizard-input-tab="content"] [data-wizard-tab-count]');
    return { text: span ? span.textContent.trim() : null, characters: wizardState.text.trim().length };
  })()`);
  check(
    'typing updates the character counter on the content tab',
    Boolean(counters.text) && counters.text.indexOf(counters.characters.toLocaleString('vi-VN')) === 0,
    JSON.stringify(counters)
  );

  // Switching tabs must not leave the structure pane blank while the debounced
  // analyzer catches up, and the content pane must still exist for the sync.
  const tab = await evaluate(`(async () => {
    const waitFor = async (fn, ms) => { const started = Date.now(); while (Date.now() - started < (ms || 20000)) { if (fn()) return true; await new Promise(r => setTimeout(r, 100)); } return false; };
    wizardState.structure = null;
    wizardState.text = 'PHAN 1: MO DAU\\n' + ('Quang hop la qua trinh tong hop chat huu co. '.repeat(4));
    wizardState.inputTab = 'content';
    render();
    const contentTab = document.querySelector('[data-wizard-input-tab="content"]');
    const structureTab = document.querySelector('[data-wizard-input-tab="structure"]');
    contentTab.click();
    await new Promise(r => setTimeout(r, 40));
    structureTab.click();
    const pane = document.querySelector('[data-tab-pane="structure"]');
    const initial = { text: pane ? pane.textContent.trim().slice(0, 40) : '', panes: document.querySelectorAll('[data-tab-pane]').length };
    const ready = await waitFor(() => document.querySelector('[data-structure-tree]'), 20000);
    const bothVisibleMarkup = document.querySelectorAll('[data-tab-pane]').length === 2;
    const selected = document.querySelector('[data-wizard-input-tab="structure"]');
    return { ready, initial, bothVisibleMarkup, ariaSelected: selected.getAttribute('aria-selected') };
  })()`);

  check('switching to the structure tab shows a state instead of an empty pane', Boolean(tab.initial.text), JSON.stringify(tab.initial));
  check('the structure tab fills in once the local analyzer finishes', tab.ready === true, JSON.stringify(tab));
  check('both tab panes stay in the DOM', tab.bothVisibleMarkup === true, JSON.stringify(tab));
  check('the active tab reports aria-selected', tab.ariaSelected === 'true', String(tab.ariaSelected));

  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exitCode = failed.length ? 1 : 0;
  ws.close();
  await sleep(100);
})().catch(error => {
  console.error('ui-wizard-structure-check crashed:', error.message);
  process.exitCode = 1;
});

