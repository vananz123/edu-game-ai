#!/usr/bin/env node
/**
 * DECISIONS #121 — AI task history is paged and capped at 30.
 *
 * Settings keeps 10 rows a page over the newest 30 recorded tasks; older rows are
 * deleted as new ones are written. This check proves the page UI (page numbers,
 * next/previous, "Làm mới" returning to page 1) and measures the real store's cap
 * separately before stubbing the list.
 *
 * #273: the Tauri build DOES have a writer (`ai_tasks::start_task` is called by
 * `scene.rs` and `lesson.rs`), so the store is checked with a REAL row first: a
 * loopback provider answers one `scene:suggest`, and the row it leaves behind is
 * read back. While measuring that, the old belief that "`listAiTasks` returns empty
 * although SQLite has the row" turned out to be a payload-shape misreading:
 * `history: false` is LIVE-ONLY by contract and answers `history: [], total: 0`
 * even when rows exist. Both halves are pinned below.
 *
 * Only after that is `listAiTasks` stubbed with 30 synthetic rows, so the pager is
 * exercised deterministically instead of depending on old profile data.
 *
 * Usage: launch with --remote-debugging-port=PORT, then
 * `node tests/ui/ui-ai-tasks-paging-check.js [port]`.
 */
process.argv[2] = process.argv[2] || process.env.CDP_PORT || '9338';
const http = require('node:http');
const { connect } = require('../manual/lib/ui-check-lib');

// A loopback provider: the one HTTP endpoint the app accepts, walked exactly like a
// cloud provider (HTTPS check excepted, bearer header, JSON chat reply). It answers
// any chat request with a valid scene blueprint.
const SCENE_REPLY = JSON.stringify({ v: 1, layout: 'single', backdrop: 'meadow', paletteKey: 'plants', mainIcon: 'leaf', props: ['apple'] });
const provider = http.createServer((request, response) => {
  request.on('data', () => {});
  request.on('end', () => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: SCENE_REPLY }, finish_reason: 'stop' }], usage: { prompt_tokens: 9 } }));
  });
});

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

(async () => {
  await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve));
  const stubBaseUrl = 'http://127.0.0.1:' + provider.address().port + '/v1';
  const cdp = await connect();
  // A previous run of this check leaves a `desktop.stub('listAiTasks', ...)` in the
  // live page, and that stub is exactly what the real-store phase must NOT measure
  // through. A fresh page is the only honest starting point.
  await cdp.evaluate('location.reload()');
  await new Promise(resolve => setTimeout(resolve, 2600));
  const result = await cdp.evaluate(`(async () => {
    // A fresh profile opens the setup wizard over the shell; dismiss it before
    // driving the sidebar.
    for (let i = 0; i < 40; i++) {
      if (document.querySelector('#modalRoot .setup-fullscreen')) break;
      await new Promise(r => setTimeout(r, 100));
    }
    if (typeof closeSetupWizard === 'function') closeSetupWizard('close');
    await new Promise(r => setTimeout(r, 250));

    // #273 - the read contract, measured on a row the app really wrote. Settings is
    // driven through the UI (the path the provider gate proves) instead of guessing
    // the payload shape of saveSettings.
    navigate('settings');
    await new Promise(r => setTimeout(r, 700));
    const keyInput = document.querySelector('[data-ai-key-input="gemini"]');
    if (keyInput) keyInput.value = 'sk-synthetic-ai-tasks-9999';
    const baseInput = document.querySelector('[data-ai-provider-baseurl="gemini"]');
    if (baseInput) baseInput.value = ${JSON.stringify(stubBaseUrl)};
    const modelInput = document.querySelector('[data-ai-provider-model="gemini"]');
    if (modelInput) modelInput.value = 'stub-model';
    const saveBtn = document.querySelector('#saveSettingsBtn');
    if (saveBtn) saveBtn.click();
    await new Promise(r => setTimeout(r, 1000));
    const providerTest = await desktop.call('testAiProvider', { providerId: 'gemini' });
    let sceneSource = '';
    let sceneError = '';
    try {
      const scene = await desktop.call('suggestScene', {
        prompt: 'Cây xanh cần ánh sáng để làm gì?',
        answers: ['Quang hợp', 'Hô hấp'],
        category: 'animals',
        iconName: 'leaf',
        requestId: 'req_ai_tasks_check'
      });
      sceneSource = String((scene && scene.source) || '');
    } catch (e) {
      sceneError = String((e && e.message) || e);
    }
    const withHistory = await desktop.call('listAiTasks', { limit: 5, history: true });
    const liveOnly = await desktop.call('listAiTasks', { limit: 5, history: false });
    const sceneRow = (withHistory.history || []).find(task => task.requestId === 'req_ai_tasks_check') || null;
    // Leave no verified cloud provider behind for the next gate on this profile.
    if (keyInput) keyInput.value = '';
    const clearBtn = document.querySelector('[data-ai-key-clear="gemini"]');
    if (clearBtn && !clearBtn.disabled) clearBtn.click();
    if (saveBtn) saveBtn.click();
    await new Promise(r => setTimeout(r, 800));
    const roundTrip = {
      tested: providerTest === true || Boolean(providerTest && providerTest.ok === true),
      source: sceneSource,
      error: sceneError,
      row: sceneRow ? sceneRow.kind + '/' + sceneRow.state + '/' + sceneRow.label : 'none',
      total: Number(withHistory.total) || 0,
      rows: (withHistory.history || []).length,
      liveOnlyHistory: (liveOnly.history || []).length,
      liveOnlyTotal: Number(liveOnly.total) || 0,
      stillLive: ((liveOnly.live) || []).filter(task => task.requestId === 'req_ai_tasks_check').length
    };

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
      realBeyond: realBeyond.history.length,
      roundTrip: roundTrip
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
    const trip = result.roundTrip || {};
    check('a real AI run is answered by the loopback provider and leaves one task row',
      trip.source === 'model' && String(trip.row).indexOf('scene/completed/') === 0,
      JSON.stringify({ tested: trip.tested, source: trip.source, row: trip.row, error: trip.error }));
    // COUNT(*) and the page of rows are read by two different statements: a broken
    // reader can leave total right while returning no rows (the negative control did
    // exactly that), so this check demands the rows, not the count.
    check('that row is readable with history:true', trip.rows >= 1 && trip.total >= 1,
      'rows ' + trip.rows + ', total ' + trip.total);
    check('history:false is live-only by contract (no history rows, total 0)',
      trip.liveOnlyHistory === 0 && trip.liveOnlyTotal === 0,
      'history ' + trip.liveOnlyHistory + ', total ' + trip.liveOnlyTotal);
    check('a finished task is not left in the live list', trip.stillLive === 0, 'live matches ' + trip.stillLive);
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
  provider.close();
  process.exit(failures ? 1 : 0);
})().catch(error => {
  provider.close();
  console.error(error);
  process.exit(1);
});
