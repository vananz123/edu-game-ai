#!/usr/bin/env node
/**
 * The "•••" menu of the llama.cpp status bar must open when llama.cpp is running.
 *
 * Reported defect: with llama.cpp running, clicking the menu button appeared to do
 * nothing. Two causes were possible and both are pinned here:
 *  - the button click reached two toggles (its own + the bar's) and reopened→closed;
 *  - the navbar is re-rendered when the page changes, so the controls the module
 *    wired at start-up were replaced by fresh, unbound nodes.
 *
 * The check drives the real bar and a real page change; it never starts a model.
 * Usage: node tests/ui/ui-ai-status-bar-check.js [port]
 */
process.argv[2] = process.argv[2] || process.env.CDP_PORT || '9347';
const { connect } = require('../manual/lib/ui-check-lib');

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

const state = `(() => {
  const dropdown = document.getElementById('aiStatusDropdown');
  const menuBtn = document.getElementById('aiStatusMenuBtn');
  return {
    bar: Boolean(document.getElementById('aiStatusBar')),
    menuBtn: Boolean(menuBtn),
    open: dropdown ? !dropdown.classList.contains('hidden') : null,
    expanded: menuBtn ? menuBtn.getAttribute('aria-expanded') : null,
    runtime: (document.getElementById('aiStatusRuntime') || {}).textContent || ''
  };
})()`;

(async () => {
  const cdp = await connect();

  // Start from a closed menu with the bar's own state settled, whatever an earlier
  // step (or a previous run on the same instance) left behind.
  await cdp.evaluate(`(async () => {
    document.getElementById('pageContent').click();
    await new Promise(r => setTimeout(r, 50));
    if (typeof aiStatusRefresh === 'function') await aiStatusRefresh();
  })()`);

  // 1. llama.cpp shown as running, as the status bar renders it.
  const running = await cdp.evaluate(`(async () => {
    if (typeof aiStatusRefresh === 'function') await aiStatusRefresh();
    const { bar, menuBtn } = ${state};
    return { bar, menuBtn };
  })()`);
  check('the status bar exists in the navbar', running.bar === true && running.menuBtn === true);

  // 2. One click on the "•••" button opens the menu.
  const opened = await cdp.evaluate(`(async () => {
    const btn = document.getElementById('aiStatusMenuBtn');
    btn.click();
    await new Promise(r => setTimeout(r, 50));
    const afterOne = ${state};
    return afterOne;
  })()`);
  check('one click on the menu button opens the menu', opened.open === true, JSON.stringify(opened));
  check('the button reports the menu as expanded', opened.expanded === 'true', opened.expanded);

  // 3. It stays open across the 2 s status poll (the poll re-renders the bar).
  const stayed = await cdp.evaluate(`(async () => {
    await new Promise(r => setTimeout(r, 2300));
    return ${state};
  })()`);
  check('the menu stays open while the status bar polls', stayed.open === true, JSON.stringify(stayed));

  // 4. A second click closes it; a click outside also closes it.
  const closed = await cdp.evaluate(`(async () => {
    document.getElementById('aiStatusMenuBtn').click();
    await new Promise(r => setTimeout(r, 50));
    const afterSecond = ${state};
    document.getElementById('aiStatusBar').click();
    await new Promise(r => setTimeout(r, 50));
    const afterBar = ${state};
    document.body.click();
    await new Promise(r => setTimeout(r, 50));
    const afterOutside = ${state};
    return { afterSecond, afterBar, afterOutside };
  })()`);
  check('a second click closes the menu', closed.afterSecond.open === false, JSON.stringify(closed.afterSecond));
  // Clicking the bar while it is closed opens the menu. (While the menu is already open
  // the bar click is also an "outside" click, so it closes — that is the expected
  // dismissal, not the bug this check pins.)
  check('clicking the closed bar opens the menu', closed.afterBar.open === true, JSON.stringify(closed.afterBar));
  check('clicking outside closes the menu', closed.afterOutside.open === false, JSON.stringify(closed.afterOutside));

  // 5. The reported case: the top bar is re-rendered, so the bar is a new set of nodes
  //    (the shell rebuilds it on start-up and on some navigations). The whole top bar
  //    is put back from its own markup, so nothing else on the page is disturbed.
  const rerendered = await cdp.evaluate(`(async () => {
    const topbar = document.querySelector('header.topbar');
    if (!topbar) return { rebuilt: false, reason: 'no topbar' };
    const markup = topbar.outerHTML;
    topbar.outerHTML = markup;
    await new Promise(r => setTimeout(r, 100));
    if (!document.getElementById('aiStatusMenuBtn')) return { rebuilt: false, reason: 'no bar after rebuild' };
    // Close first: the menu may be open from the previous step.
    document.getElementById('pageContent').click();
    await new Promise(r => setTimeout(r, 30));
    const wasOpen = ${state}.open;
    document.getElementById('aiStatusMenuBtn').click();
    await new Promise(r => setTimeout(r, 80));
    return { rebuilt: true, wasOpen, ...${state} };
  })()`);
  check('the menu button still works after the navbar is re-rendered', rerendered.rebuilt === true && rerendered.open === true, JSON.stringify(rerendered));
  // 6. Menu actions still work on the fresh nodes: "stop" is disabled without a run,
  //    "settings" opens the AI-local window.
  const actions = await cdp.evaluate(`(async () => {
    document.body.click();
    document.getElementById('aiStatusMenuBtn').click();
    await new Promise(r => setTimeout(r, 50));
    const stop = document.getElementById('aiStatusStop');
    const openModal = document.getElementById('aiStatusOpenModalBtn');
    const stopState = { hidden: stop.hidden, disabled: stop.disabled };
    if (openModal) openModal.click();
    await new Promise(r => setTimeout(r, 400));
    const modal = document.getElementById('modalRoot');
    const opened = Boolean(modal && /AI local/i.test(modal.textContent || ''));
    return { stopState, opened, menuOpen: ${state}.open };
  })()`);
  // DECISIONS #132 D16: Stop is always offered and checks the runtime itself, so a
  // stale bar can never hide the only control the teacher needs.
  check('"stop" is available and answers even when llama.cpp is not running', actions.stopState.hidden === false && actions.stopState.disabled === false, JSON.stringify(actions.stopState));
  check('"Cài đặt AI local…" opens the AI-local window after a page change', actions.opened === true);
  check('picking a menu action closes the menu', actions.menuOpen === false, String(actions.menuOpen));
  // D16: pressing Stop when the runtime is stopped says so instead of doing nothing.
  const stopAnswer = await cdp.evaluate(`(async () => {
    document.getElementById('pageContent').click();
    document.getElementById('aiStatusStop').click();
    await new Promise(r => setTimeout(r, 700));
    return [...document.querySelectorAll('[id*="toast"], [class*="toast"]')].map(n => n.textContent.trim()).filter(Boolean).join(' | ');
  })()`);
  check('"stop" explains itself when llama.cpp is not running', /không chạy|không có gì để dừng|Đã dừng/i.test(String(stopAnswer)), String(stopAnswer).slice(0, 90));

  cdp.ws.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
})().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
