#!/usr/bin/env node
/**
 * DECISIONS #154 — paging and batch delete on "Thư viện trò chơi".
 *
 * Creates 11 synthetic saved games through the real IPC, then checks: 9 cards a
 * page (three rows of the three-column grid) with a pager, "select all" ticking
 * only the rendered page, the selection surviving paging, and deleting the
 * selection removing exactly those games while the others stay. The IPC also
 * refuses an empty batch. Everything it created is deleted again at the end.
 *
 * Usage: launch with --remote-debugging-port=PORT, then
 * `node tests/ui/ui-library-paging-check.js [port]`.
 */
process.argv[2] = process.argv[2] || process.env.CDP_PORT || '9338';
const { connect } = require('../manual/lib/ui-check-lib');

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

const SCENARIO = String.raw`(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  // A fresh profile opens the setup onboarding into #modalRoot a moment after the
  // window loads; it would cover the library this check measures. Canonical guard.
  for (let i = 0; i < 40; i++) { if (document.querySelector('#modalRoot .setup-fullscreen')) break; await sleep(100); }
  if (typeof closeSetupWizard === 'function') closeSetupWizard('close');
  await sleep(250);

  // Leftovers from an interrupted run would make the counts non-deterministic.
  const existing = await window.eduGame.getLibrary();
  const leftovers = (existing.games || []).filter(g => String(g.title || '').startsWith('probe-lib-'));
  if (leftovers.length) await window.eduGame.deleteGames(leftovers.map(g => g.id));
  const otherGames = (existing.games || []).length - leftovers.length;

  const runTag = Date.now().toString(36);
  const created = [];
  for (let index = 0; index < 11; index += 1) {
    const game = {
      id: 'probe-lib-' + runTag + '-' + index,
      title: 'probe-lib-' + String(index).padStart(2, '0') + ' · Trò chơi thử phân trang',
      subject: 'Kỹ năng sống', grade: '6', template: 'quiz',
      description: 'Dữ liệu tổng hợp cho check phân trang.',
      tags: [], sourceName: 'ui-check', createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
      gameSetup: { scoringMode: 'cơ bản' },
      questions: [{
        id: 'q1', type: 'multiple-choice', prompt: 'Câu hỏi thử số ' + index + '?',
        options: [{ id: 'a', text: 'Đáp án A' }, { id: 'b', text: 'Đáp án B' },
          { id: 'c', text: 'Đáp án C' }, { id: 'd', text: 'Đáp án D' }],
        correctOptionId: 'a', correctAnswer: '', explanation: 'Giải thích.', points: 100
      }]
    };
    await window.eduGame.saveGame(game);
    created.push(game);
  }
  state.db = await window.eduGame.getLibrary();
  state.libraryPage = 0;
  state.librarySelection = new Set();
  const link = [...document.querySelectorAll('[data-page]')].find(node => node.dataset.page === 'library');
  if (link) link.click();
  else navigate('library');
  await sleep(900);
  // Narrow the list to this run's fixtures: the check must never tick (and therefore
  // never delete) a game the teacher already had, and the page arithmetic stays exact
  // even on a profile that is not fresh.
  state.search = 'probe-lib-';
  render();
  await sleep(300);

  const cards = () => [...document.querySelectorAll('[data-library-item]')];
  const pagerText = () => {
    const pager = document.querySelector('[data-library-pager] span');
    return pager ? pager.textContent.replace(/\s+/g, ' ').trim() : '';
  };
  const probeCardsOnPage = () => cards().filter(card => card.dataset.libraryItem.startsWith('probe-lib-')).length;

  const totalGames = (state.db.games || []).length;
  const out = { totalGames, otherGames, created: created.length, listed: 11 };
  out.cardsOnPage1 = cards().length;
  out.probeOnPage1 = probeCardsOnPage();
  out.hasPager = Boolean(document.querySelector('[data-library-pager]'));
  out.pager = pagerText();

  const selectAll = document.querySelector('#librarySelectAll');
  if (!selectAll) return { error: 'no select-all box (page ' + (document.querySelector('h1') || {}).textContent + ')' };
  selectAll.click();
  await sleep(120);
  out.selectedAfterSelectAll = document.querySelectorAll('[data-library-item][data-selected="true"]').length;
  out.countLabel = document.querySelector('[data-library-selected-count]').textContent.trim();
  out.deleteButton = (() => {
    const button = document.querySelector('#libraryDeleteSelectedBtn');
    return button ? String(button.disabled) + '/' + button.textContent.trim() : 'missing';
  })();

  document.querySelector('#libraryNextBtn').click();
  await sleep(300);
  out.page2Pager = pagerText();
  out.page2Cards = cards().length;
  out.page2ProbeCards = probeCardsOnPage();
  out.page2Checked = cards().filter(card => card.querySelector('[data-action="library-select"]').checked).length;

  const extra = cards().find(card => card.querySelector('[data-action="library-select"]'));
  extra.querySelector('[data-action="library-select"]').click();
  await sleep(150);
  out.countAfterExtra = document.querySelector('[data-library-selected-count]').textContent.trim();
  const selectedIds = [...(state.librarySelection instanceof Set ? state.librarySelection : [])];
  out.selectedIds = selectedIds.length;
  out.probeSelected = selectedIds.filter(value => value.startsWith('probe-lib-')).length;

  // The IPC refuses an empty batch instead of silently answering "0 deleted".
  try { await window.eduGame.deleteGames([]); out.emptyBatchRejected = false; }
  catch (error) { out.emptyBatchRejected = true; }

  const realConfirm = window.confirm;
  window.confirm = () => true;
  const deleteButton = document.querySelector('#libraryDeleteSelectedBtn');
  out.deleteButtonState = deleteButton ? String(deleteButton.disabled) + '/' + deleteButton.textContent.trim() : 'missing';
  deleteButton.click();
  await sleep(1500);
  window.confirm = realConfirm;

  const after = await window.eduGame.getLibrary();
  const afterGames = after.games || [];
  out.leftProbe = afterGames.filter(g => String(g.title || '').startsWith('probe-lib-')).length;
  out.expectedLeft = 11 - out.probeSelected;
  out.gamesAfter = afterGames.length;
  out.gamesBefore = totalGames;
  out.selectionNow = state.librarySelection instanceof Set ? state.librarySelection.size : -1;
  out.stillOnPage = cards().some(card => selectedIds.includes(card.dataset.libraryItem));
  out.hasPagerAfter = Boolean(document.querySelector('[data-library-pager]'));
  const countNode = document.querySelector('[data-library-selected-count]');
  out.countReset = countNode ? countNode.textContent.trim() : '';

  const remaining = afterGames.filter(g => String(g.title || '').startsWith('probe-lib-'));
  if (remaining.length) await window.eduGame.deleteGames(remaining.map(g => g.id));
  state.librarySelection = new Set();
  state.libraryPage = 0;
  state.search = '';
  state.db = await window.eduGame.getLibrary();
  render();
  return out;
})()`;

(async () => {
  const cdp = await connect();
  const result = await cdp.evaluate(SCENARIO);
  if (result.error) {
    check('the library page renders', false, result.error);
    console.log('\n1 check(s) failed');
    process.exit(1);
  }

  check('the grid shows at most 9 game cards per page',
    result.cardsOnPage1 === Math.min(9, result.listed),
    `${result.cardsOnPage1} of ${result.listed} listed (${result.totalGames} in the library)`);
  check('a pager shows the page count', result.hasPager && /^Trang 1\//.test(result.pager), result.pager);
  check('"select all" ticks only the rendered page',
    result.selectedAfterSelectAll === result.cardsOnPage1,
    `${result.selectedAfterSelectAll} of ${result.cardsOnPage1}`);
  check('the selection count is shown',
    new RegExp('Đã chọn ' + result.cardsOnPage1 + ' trò chơi').test(result.countLabel), result.countLabel);
  check('"Sau →" opens page 2',
    result.page2Cards === Math.max(0, result.listed - 9) && /^Trang 2\//.test(result.page2Pager),
    `${result.page2ProbeCards} probe cards of ${result.page2Cards} · ${result.page2Pager}`);
  check('a new page starts unticked', result.page2Checked === 0, String(result.page2Checked));
  check('selection survives paging',
    new RegExp('Đã chọn ' + (result.cardsOnPage1 + 1) + ' trò chơi').test(result.countAfterExtra), result.countAfterExtra);
  check('the IPC refuses an empty batch', result.emptyBatchRejected === true, String(result.emptyBatchRejected));
  check('the batch delete removed exactly the selected games',
    result.leftProbe === result.expectedLeft && result.stillOnPage === false,
    `${result.leftProbe} probe left, expected ${result.expectedLeft}; selected ${result.selectedIds}; button ${result.deleteButtonState}`);
  check('unselected games are untouched',
    result.gamesAfter === result.gamesBefore - result.selectedIds,
    `${result.gamesAfter} after, ${result.gamesBefore} before, ${result.selectedIds} selected`);
  check('the pager disappears once one page is left', result.hasPagerAfter === false, String(result.hasPagerAfter));
  check('the selection is cleared after deleting',
    result.selectionNow === 0 && /Hoặc tick/.test(result.countReset), result.countReset);

  console.log(`\n${failures ? `${failures} check(s) failed` : 'All library paging checks passed'}`);
  process.exit(failures ? 1 : 0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
