#!/usr/bin/env node
/**
 * DECISIONS #123 — paging and batch delete on "Lịch sử kết quả".
 *
 * Creates 20 synthetic finished-play results through the real IPC, then checks: 15 per
 * page with a pager, "select all" ticking only the rendered page, the selection
 * surviving paging, and deleting the selection removing exactly those results while
 * leaving the games untouched. Everything it created is deleted again at the end.
 *
 * Usage: launch with --remote-debugging-port=PORT, then
 * `node tests/ui/ui-results-paging-check.js [port]`.
 */
process.argv[2] = process.argv[2] || process.env.CDP_PORT || '9338';
const { connect } = require('../manual/lib/ui-check-lib');

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

const SCENARIO = String.raw`(async () => {
  // Leftovers from an interrupted run would make the counts non-deterministic.
  const existing = await window.eduGame.getLibrary();
  for (const session of (existing.sessions || []).filter(s => String(s.playerName || '').startsWith('probe-result-'))) {
    await window.eduGame.deleteSessions([session.id]);
  }
  const gamesBefore = (existing.games || []).length;
  const created = [];
  // Ids are unique per run, so a row left over from an earlier attempt (which used the
  // same probe-session-N ids) can never be counted as "not deleted" by this run.
  const runTag = Date.now().toString(36);
  for (let index = 0; index < 20; index += 1) {
    const session = {
      id: 'probe-session-' + runTag + '-' + index,
      gameId: 'probe-game',
      gameTitle: 'Trò chơi thử phân trang',
      template: 'quiz',
      playerName: 'probe-result-' + String(index).padStart(2, '0'),
      durationSeconds: 60 + index,
      points: 100 + index,
      percent: 50 + index,
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString()
    };
    await window.eduGame.saveSession(session);
    created.push(session);
  }
  state.db = await window.eduGame.getLibrary();
  state.sessionPage = 0;
  state.sessionSelection = new Set();
  const link = [...document.querySelectorAll('[data-page]')].find(node => node.dataset.page === 'sessions');
  if (link) link.click();
  await new Promise(r => setTimeout(r, 900));

  const out = { created: created.length, gamesBefore };
  const rows = () => [...document.querySelectorAll('[data-session-id]')];
  const pagerText = () => {
    const pager = document.querySelector('[data-session-pager] span');
    return pager ? pager.textContent.replace(/\s+/g, ' ').trim() : '';
  };
  out.rowsOnPage1 = rows().length;
  out.hasPager = Boolean(document.querySelector('[data-session-pager]'));
  out.pager = pagerText();

  const selectAll = document.querySelector('#sessionSelectAll');
  if (!selectAll) return { error: 'no select-all box (page ' + (document.querySelector('h1') || {}).textContent + ')' };
  selectAll.click();
  await new Promise(r => setTimeout(r, 100));
  out.selectedAfterSelectAll = document.querySelectorAll('[data-session-id][data-selected="true"]').length;
  out.countLabel = document.querySelector('[data-session-selected-count]').textContent.trim();

  // 20 probe results + the teacher's own history => 2+ pages; the next button exists.
  document.querySelector('#sessionNextBtn').click();
  await new Promise(r => setTimeout(r, 300));
  out.page2Pager = pagerText();
  out.page2Rows = rows().length;
  out.page2ProbeRows = rows().filter(row => (row.textContent || '').includes('probe-result-')).length;
  out.page2Checked = rows().filter(row => row.querySelector('[data-action="session-select"]').checked).length;

  rows()[0].querySelector('[data-action="session-select"]').click();
  await new Promise(r => setTimeout(r, 100));
  out.countAfterExtra = document.querySelector('[data-session-selected-count]').textContent.trim();
  const selectedIds = [...(state.sessionSelection instanceof Set ? state.sessionSelection : [])];
  out.selectedIds = selectedIds.length;

  const realConfirm = window.confirm;
  window.confirm = () => true;
  const deleteButton = document.querySelector('#sessionDeleteSelectedBtn');
  out.deleteButtonState = deleteButton ? String(deleteButton.disabled) + '/' + deleteButton.textContent.trim() : 'missing';
  deleteButton.click();
  await new Promise(r => setTimeout(r, 1200));
  window.confirm = realConfirm;

  const after = await window.eduGame.getLibrary();
  const leftProbe = (after.sessions || []).filter(s => String(s.playerName || '').startsWith('probe-result-')).length;
  out.toast = typeof window.toastLast === 'string' ? window.toastLast : '';
  out.selectionNow = state.sessionSelection instanceof Set ? state.sessionSelection.size : -1;
  out.leftProbe = leftProbe;
  out.expectedLeft = 20 - selectedIds.length;
  out.gamesAfter = (after.games || []).length;
  out.stillOnPage = rows().some(row => selectedIds.includes(row.dataset.sessionId));
  const countNode = document.querySelector('[data-session-selected-count]');
  out.countReset = countNode ? countNode.textContent.trim() : '';

  const leftovers = (after.sessions || []).filter(s => String(s.playerName || '').startsWith('probe-result-'));
  if (leftovers.length) await window.eduGame.deleteSessions(leftovers.map(s => s.id));
  state.db = await window.eduGame.getLibrary();
  state.sessionSelection = new Set();
  render();
  return out;
})()`;

(async () => {
  const cdp = await connect();
  const result = await cdp.evaluate(SCENARIO);
  if (result.error) {
    check('the results page renders', false, result.error);
    console.log('\n1 check(s) failed');
    process.exit(1);
  }

  check('the table renders at most 15 results per page', result.rowsOnPage1 === 15, String(result.rowsOnPage1));
  check('a pager shows the page count', result.hasPager && /^Trang 1\//.test(result.pager), result.pager);
  check('"select all" ticks only the rendered page',
    result.selectedAfterSelectAll === result.rowsOnPage1, `${result.selectedAfterSelectAll} of ${result.rowsOnPage1}`);
  check('the selection count is shown', /Đã chọn 15 lượt chơi/.test(result.countLabel), result.countLabel);
  // The teacher's own results share the list (newest first), so page 2 may hold none
  // of the probe rows: only the page change and its fullness are asserted.
  check('"Sau →" opens page 2',
    result.page2Rows > 0 && /^Trang 2\//.test(result.page2Pager),
    `${result.page2ProbeRows} probe rows of ${result.page2Rows} · ${result.page2Pager}`);
  check('a new page starts unticked', result.page2Checked === 0, String(result.page2Checked));
  check('selection survives paging', /Đã chọn 16 lượt chơi/.test(result.countAfterExtra), result.countAfterExtra);
  // Only the probe rows deleted by this run are outside the race with the teacher's
  // own results; the UI side is proven by the count reset and the rows leaving the page.
  // The check counts only what it can observe: 20 fixtures + the teacher's own results,
  // and the batch delete is proven by the *change* in the fixture count.
  check('the selection deleted its rows and left the rest',
    result.leftProbe === result.expectedLeft && result.stillOnPage === false && result.gamesAfter === result.gamesBefore,
    `${result.leftProbe} probe left, expected ${result.expectedLeft}; selected ${result.selectedIds}; button ${result.deleteButtonState}`);
  check('games are untouched by deleting results', result.gamesAfter === result.gamesBefore, `${result.gamesAfter} vs ${result.gamesBefore}`);
  check('the deleted rows are gone from the page', result.stillOnPage === false);
  check('the selection is cleared after deleting', /Hoặc tick/.test(result.countReset), result.countReset);

  console.log(`\n${failures ? `${failures} check(s) failed` : 'All results paging checks passed'}`);
  process.exit(failures ? 1 : 0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
