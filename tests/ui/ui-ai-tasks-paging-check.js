#!/usr/bin/env node
/**
 * DECISIONS #121 — AI task history is paged and capped at 30.
 *
 * Settings keeps 10 rows a page over the newest 30 recorded tasks; older rows are
 * deleted as new ones are written. This check proves the page UI (page numbers,
 * next/previous, "Làm mới" returning to page 1) and measures the real store's cap
 * separately before stubbing the list.
 *
 * The Tauri build has no writer for `ai_tasks` yet (`ai_tasks::start_task` has no
 * caller), so a fresh profile is legitimately empty. Measure the real store first
 * (cap and "offset 30 is empty"), then stub `listAiTasks` with 30 synthetic rows so
 * the pager is exercised deterministically instead of depending on old profile data.
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
    // A fresh profile opens the setup wizard over the shell; dismiss it before
    // driving the sidebar.
    for (let i = 0; i < 40; i++) {
      if (document.querySelector('#modalRoot .setup-fullscreen')) break;
      await new Promise(r => setTimeout(r, 100));
    }
    if (typeof closeSetupWizard === 'function') closeSetupWizard('close');
    await new Promise(r => setTimeout(r, 250));

    // Real store first: a fresh Tauri profile has no recorded tasks, so this proves
    // the cap shape without inventing history. The pager itself then runs on a stub.
    const realFirst = await desktop.call('listAiTasks', { limit: 10, offset: 0, history: true });
    const realBeyond = await desktop.call('listAiTasks', { limit: 10, offset: 30, history: true });
    const synthetic = Array.from({ length: 30 }, (_, i) => {
      const started = new Date(Date.UTC(2026, 0, 1, 0, 0, 0) + (30 - i) * 60000).toISOString();
      const finished = new Date(Date.UTC(2026, 0, 1, 0, 0, 30) + (30 - i) * 60000).toISOString();
      return {
        taskId: 'task_synthetic_' + i,
        requestId: 'req_synthetic_' + i,
        kind: i % 2 ? 'generate' : 'analyze',
        label: 'Tác vụ tổng hợp ' + (i + 1),
        state: 'completed',
        progress: 'ready',
        startedAt: started,
        finishedAt: finished,
        resultSummary: 'Mục tiêu ' + (i + 1),
        restored: true
      };
    });
    desktop.stub('listAiTasks', payload => {
      const limit = Number(payload && payload.limit) || 10;
      const offset = Number(payload && payload.offset) || 0;
      return { live: [], history: synthetic.slice(offset, offset + limit), total: synthetic.length };
    });

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
    const out = {
      initial: label(),
      first: pageNumber(),
      realTotal: realFirst.total,
      realBeyond: realBeyond.history.length
    };

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
    const ipc = await desktop.call('listAiTasks', { limit: 10, offset: 0, history: true });
    out.total = ipc.total;
    out.rows = ipc.history.length;
    return out;
  })()`);

  if (result.error) {
    check('the settings page renders the task list', false, result.error);
  } else {
    check('the task list has a pager with page numbers', Boolean(result.first), result.initial);
    check('the real task store never exceeds the 30-task cap', result.realTotal <= 30, `real total ${result.realTotal}`);
    check('the real store has nothing past the 30-row cap', result.realBeyond === 0, `real offset 30 rows ${result.realBeyond}`);
    check('a page of the stubbed history holds at most 10 rows', result.rows <= 10, `rows ${result.rows}`);
    check('the stubbed history fills exactly three pages',
      result.first ? result.first.pages === 3 && result.total === 30 : false,
      result.first ? `${result.first.pages} pages, total ${result.total}` : 'no pager');
    check('"Sau →" moves to page 2', !result.second || result.second.page === 2, JSON.stringify(result.second));
    check('the previous button is enabled on page 2', result.backEnabled === true || !result.second, String(result.backEnabled));
    check('"Làm mới" returns to the newest page', result.afterRefresh ? result.afterRefresh.page === 1 : false,
      JSON.stringify(result.afterRefresh));
  }

  console.log(`\n${failures ? `${failures} check(s) failed` : 'All AI task paging checks passed'}`);
  process.exit(failures ? 1 : 0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
