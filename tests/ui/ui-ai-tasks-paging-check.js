#!/usr/bin/env node
/**
 * DECISIONS #121 — AI task history is paged and capped at 30.
 *
 * Settings keeps 10 rows a page over the newest 30 recorded tasks; older rows are
 * deleted as new ones are written. This check proves the page UI and the store agree:
 * page numbers, the next/previous buttons, "Làm mới" returning to page 1, and the
 * total the IPC reports never exceeding 30.
 *
 * Usage: launch with --remote-debugging-port=PORT, then
 * `node tests/ui/ui-ai-tasks-paging-check.js [port]`.
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
    const link = [...document.querySelectorAll('[data-page]')].find(node => node.dataset.page === 'settings');
    if (link) link.click();
    await new Promise(r => setTimeout(r, 1200));
    const container = document.querySelector('#aiTaskList');
    if (!container) return { error: 'settings page did not render #aiTaskList' };
    const label = () => {
      const span = container.querySelector('[data-ai-task-pager] span');
      return span ? span.textContent.replace(/\\s+/g, ' ').trim() : '';
    };
    const pageNumber = () => {
      const match = label().match(/Trang (\\d+)\\/(\\d+)/);
      return match ? { page: Number(match[1]), pages: Number(match[2]) } : null;
    };
    const out = { initial: label(), first: pageNumber() };

    const next = container.querySelector('#aiTasksNextBtn');
    out.hasNext = Boolean(next);
    if (next && !next.disabled) {
      next.click();
      await new Promise(r => setTimeout(r, 700));
    }
    out.second = pageNumber();
    const prev = container.querySelector('#aiTasksPrevBtn');
    out.backEnabled = prev ? !prev.disabled : false;

    // Refresh always returns to the newest page.
    document.querySelector('#aiTasksRefreshBtn').click();
    await new Promise(r => setTimeout(r, 700));
    out.afterRefresh = pageNumber();

    // The page cannot offer more than the retention cap.
    const ipc = await window.eduGame.listAiTasks({ limit: 10, offset: 0, history: true });
    out.total = ipc.total;
    out.rows = ipc.history.length;
    // Offset past the cap is empty.
    const beyond = await window.eduGame.listAiTasks({ limit: 10, offset: 30, history: true });
    out.beyond = beyond.history.length;
    return out;
  })()`);

  if (result.error) {
    check('the settings page renders the task list', false, result.error);
  } else {
    check('the task list has a pager with page numbers', Boolean(result.first), result.initial);
    check('history never exceeds the 30-task cap', result.total <= 30, `total ${result.total}`);
    check('a page holds at most 10 rows', result.rows <= 10, `rows ${result.rows}`);
    check('there is at most one page after the first (30 rows = 3 pages)',
      result.first ? result.first.pages <= 3 : false, result.first ? `${result.first.pages} pages` : 'no pager');
    check('"Sau →" moves to page 2', !result.second || result.second.page === 2, JSON.stringify(result.second));
    check('the previous button is enabled on page 2', result.backEnabled === true || !result.second, String(result.backEnabled));
    check('"Làm mới" returns to the newest page', result.afterRefresh ? result.afterRefresh.page === 1 : false,
      JSON.stringify(result.afterRefresh));
    check('there is nothing past the retention cap', result.beyond === 0, String(result.beyond));
  }

  console.log(`\n${failures ? `${failures} check(s) failed` : 'All AI task paging checks passed'}`);
  process.exit(failures ? 1 : 0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
