#!/usr/bin/env node
/**
 * DECISIONS #122 — paging and batch delete on the "Giáo án" page.
 *
 * Creates 15 synthetic lesson documents through the real IPC, then checks: 12 per page
 * with a pager, "select all on this page" ticking only what is rendered, the batch bar
 * counting ticks across pages, and deleting the selection removing exactly those
 * documents. Everything it created is deleted again at the end.
 *
 * Usage: launch with --remote-debugging-port=PORT, then
 * `node tests/ui/ui-lessons-paging-check.js [port]`.
 */
process.argv[2] = process.argv[2] || process.env.CDP_PORT || '9338';
const { connect } = require('../manual/lib/ui-check-lib');

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

const SCENARIO = String.raw`(async () => {
  // Leftovers from an interrupted earlier run would make the counts non-deterministic.
  const existing = await window.eduGame.listLessonLibrary();
  for (const doc of (Array.isArray(existing) ? existing : []).filter(d => String(d.name || '').startsWith('probe-paging-'))) {
    await window.eduGame.deleteLessonDocument(doc.id);
  }
  const created = [];
  for (let index = 0; index < 15; index += 1) {
    created.push(await window.eduGame.saveLessonDocument({
      name: 'probe-paging-' + String(index).padStart(2, '0') + '.txt',
      ext: 'txt',
      text: 'Nội dung thử phân trang số ' + index + '. ' + 'x'.repeat(120),
      characters: 160,
      sizeBytes: 160
    }));
  }
  state.lessonLibrary = null;
  state.lessonPage = 0;
  state.lessonSelection = new Set();
  const link = [...document.querySelectorAll('[data-page]')].find(node => node.dataset.page === 'lesson-plans');
  if (link) link.click();
  await new Promise(r => setTimeout(r, 1200));

  const out = { created: created.length };
  const cards = () => [...document.querySelectorAll('[data-lesson-id]')];
  const pagerText = () => {
    const pager = document.querySelector('[data-lesson-pager] span');
    return pager ? pager.textContent.replace(/\s+/g, ' ').trim() : '';
  };
  out.cardsOnPage1 = cards().length;
  out.hasPager = Boolean(document.querySelector('[data-lesson-pager]'));
  out.pager = pagerText();

  // Select all on page 1 only.
  const selectAll = document.querySelector('#lessonSelectAll');
  selectAll.click();
  await new Promise(r => setTimeout(r, 100));
  out.selectedAfterSelectAll = document.querySelectorAll('[data-selected="true"]').length;
  out.countLabel = document.querySelector('[data-lesson-selected-count]').textContent.trim();

  // Page 2 holds the rest of the created lessons plus anything the teacher already
  // had, so the expected number is the created remainder (15 - 12).
  document.querySelector('#lessonNextBtn').click();
  await new Promise(r => setTimeout(r, 300));
  out.page2Pager = pagerText();
  out.page2Cards = cards().length;
  out.page2ProbeCards = cards().filter(card => (card.textContent || '').includes('probe-paging-')).length;
  out.page2Checked = cards().filter(card => card.querySelector('.lesson-check').checked).length;

  // Tick one more on page 2, then delete the whole selection for real.
  cards()[0].querySelector('.lesson-check').click();
  await new Promise(r => setTimeout(r, 100));
  out.countAfterExtra = document.querySelector('[data-lesson-selected-count]').textContent.trim();
  // The selection id list comes from the app state, not the DOM: only the current page
  // carries the data-selected marker, so page-1 picks would otherwise look lost.
  const selectedIds = [...(state.lessonSelection instanceof Set ? state.lessonSelection : [])];
  out.selectedIds = selectedIds.length;
  out.selectedOnPage = [...document.querySelectorAll('[data-selected="true"]')].length;

  const realConfirm = window.confirm;
  window.confirm = () => true;
  const deleteButton = document.querySelector('#lessonDeleteSelectedBtn');
  out.deleteButtonState = deleteButton ? String(deleteButton.disabled) + '/' + deleteButton.textContent.trim() : 'missing';
  deleteButton.click();
  await new Promise(r => setTimeout(r, 1500));
  window.confirm = realConfirm;

  const library = await window.eduGame.listLessonLibrary();
  const left = (Array.isArray(library) ? library : []).filter(doc => String(doc.name || '').startsWith('probe-paging-'));
  out.leftAfterDelete = left.length;
  out.expectedLeft = 15 - selectedIds.length;
  out.stillOnPage = cards().some(card => selectedIds.includes(card.dataset.lessonId));
  const countNode = document.querySelector('[data-lesson-selected-count]');
  out.countReset = countNode ? countNode.textContent.trim() : '';

  for (const doc of left) await window.eduGame.deleteLessonDocument(doc.id);
  state.lessonLibrary = null;
  refreshLessonLibraryPage();
  return out;
})()`;

(async () => {
  const cdp = await connect();
  const result = await cdp.evaluate(SCENARIO);

  check('the page renders at most 12 lessons per page', result.cardsOnPage1 === 12, String(result.cardsOnPage1));
  check('a pager shows the page count', result.hasPager && /^Trang 1\//.test(result.pager), result.pager);
  check('"select all" ticks only the rendered page',
    result.selectedAfterSelectAll === result.cardsOnPage1,
    `${result.selectedAfterSelectAll} of ${result.cardsOnPage1}`);
  check('the selection count is shown', /Đã chọn 12 giáo án/.test(result.countLabel), result.countLabel);
  check('"Sau →" opens page 2 with the rest of the created lessons',
    result.page2ProbeCards === 3 && /^Trang 2\//.test(result.page2Pager),
    `${result.page2ProbeCards} probe cards of ${result.page2Cards} · ${result.page2Pager}`);
  check('a new page starts unticked', result.page2Checked === 0, String(result.page2Checked));
  check('selection survives paging', /Đã chọn 13 giáo án/.test(result.countAfterExtra), result.countAfterExtra);
  check('deleting the selection removes exactly those documents',
    result.leftAfterDelete === result.expectedLeft,
    `${result.leftAfterDelete} left, expected ${result.expectedLeft}; button ${result.deleteButtonState}; selected ${result.selectedIds}`);
  check('the deleted cards are gone from the page', result.stillOnPage === false);
  check('the selection is cleared after deleting',
    /Hoặc tick/.test(result.countReset), result.countReset);

  console.log(`\n${failures ? `${failures} check(s) failed` : 'All lesson paging checks passed'}`);
  process.exit(failures ? 1 : 0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
