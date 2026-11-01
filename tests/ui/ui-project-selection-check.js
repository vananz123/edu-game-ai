#!/usr/bin/env node
/**
 * DECISIONS #163 — batch delete on "Dự án của tôi" (the #154 pattern, without paging).
 *
 * Creates 5 synthetic drafts through the real IPC, plus one draft the search term
 * does not match, then checks: the bar and the pick boxes are laid out for real,
 * "select all" ticks exactly the visible list, a refresh of the page keeps the ticks,
 * unticking one box updates the bar in place (no re-render) and clears the select-all
 * box, "Bỏ chọn" empties the selection, the IPC refuses an empty batch and reports an
 * unknown id as `missing`, and deleting the selection removes exactly those drafts
 * while the unmatched draft and every saved game stay. Everything it created is
 * deleted again at the end.
 *
 * Usage: launch with --remote-debugging-port=PORT, then
 * `node tests/ui/ui-project-selection-check.js [port]`.
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
  // window loads; it would cover the page this check measures. Canonical guard.
  for (let i = 0; i < 40; i++) { if (document.querySelector('#modalRoot .setup-fullscreen')) break; await sleep(100); }
  if (typeof closeSetupWizard === 'function') closeSetupWizard('close');
  await sleep(250);

  // Leftovers from an interrupted run would make the counts non-deterministic.
  const before = await window.eduGame.listProjects();
  const leftovers = (before || []).filter(p => String(p.title || '').startsWith('probe-proj-'));
  if (leftovers.length) await window.eduGame.deleteProjects(leftovers.map(p => p.id));

  const runTag = Date.now().toString(36);
  for (let index = 0; index < 5; index += 1) {
    await window.eduGame.saveProjectDraft({
      id: 'probe-proj-' + runTag + '-' + index,
      title: 'probe-proj-' + String(index).padStart(2, '0') + ' · Dự án thử xoá nhiều',
      description: 'Nội dung tổng hợp cho check xoá hàng loạt.',
      status: 'draft', step: ['input', 'analyze', 'recommend', 'configure', 'generate'][index % 5],
      schemaVersion: 1, sourceName: 'ui-check', createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString()
    });
  }
  // One draft the search term does NOT match: the batch delete must leave it alone, and
  // "select all" can never reach it because it only ever sees rendered cards.
  const teacherId = 'du-an-giao-vien-' + runTag;
  await window.eduGame.saveProjectDraft({
    id: teacherId,
    title: 'Tiết 12 · Vận dụng (không trùng từ khóa)',
    description: 'Dự án của giáo viên, không được phép bị xoá.',
    status: 'review', step: 'edit', schemaVersion: 1, sourceName: 'ui-check',
    createdAt: new Date().toISOString()
  });
  const otherProjects = (await window.eduGame.listProjects())
    .filter(project => !String(project.title || '').startsWith('probe-proj-')).length;

  navigate('my-projects');
  await sleep(900);
  // Narrow the list to this run's fixtures: the check must never tick (and therefore
  // never delete) a draft the teacher already had.
  state.search = 'probe-proj-';
  render();
  await sleep(300);

  const cards = () => [...document.querySelectorAll('[data-project-item]')];
  const boxes = () => cards().map(card => card.querySelector('[data-action="project-select"]'));
  const probeCards = () => cards().filter(card => card.dataset.projectItem.startsWith('probe-proj-')).length;

  const out = { otherProjects, listed: cards().length, probe: probeCards() };
  out.hasBar = Boolean(document.querySelector('[data-project-selection-bar]'));
  out.hasSelectAll = Boolean(document.querySelector('#projectSelectAll'));
  out.everyCardHasBox = boxes().length === out.listed && boxes().every(Boolean);
  out.initialCountLabel = (document.querySelector('[data-project-selected-count]') || {}).textContent?.trim() || '';
  out.initialDeleteDisabled = (document.querySelector('#projectDeleteSelectedBtn') || {}).disabled;
  // Geometry, because the bar and the pick boxes are new layout: a box pushed off the
  // right edge or a collapsed bar would still satisfy every text assertion above.
  const bar = document.querySelector('[data-project-selection-bar]');
  const barRect = bar ? bar.getBoundingClientRect() : null;
  out.barBox = barRect ? { w: Math.round(barRect.width), h: Math.round(barRect.height) } : null;
  out.boxesPlaced = boxes().map(box => {
    const r = box.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), right: Math.round(r.right) };
  });
  out.boxesVisible = out.boxesPlaced.every(r => r.w >= 10 && r.h >= 10 && r.top >= 0 && r.right <= innerWidth);

  const selectAll = document.querySelector('#projectSelectAll');
  if (!selectAll) return { error: 'no select-all box (page ' + (document.querySelector('h1') || {}).textContent + ')' };
  selectAll.click();
  await sleep(150);
  out.selectedAfterSelectAll = document.querySelectorAll('[data-project-item][data-selected="true"]').length;
  out.allBoxesChecked = boxes().every(box => box.checked);
  out.countLabel = document.querySelector('[data-project-selected-count]').textContent.trim();
  out.deleteLabel = document.querySelector('#projectDeleteSelectedBtn').textContent.replace(/\s+/g, ' ').trim();
  out.deleteDisabledAfterSelectAll = document.querySelector('#projectDeleteSelectedBtn').disabled;

  // A refresh renders the loading state (state.projects === null) before the list
  // arrives. Pruning the selection during that render would quietly undo what the
  // teacher just ticked, so it has to survive a full reload of the page.
  await refreshProjectsPage();
  await sleep(200);
  out.selectedThroughRefresh = state.projectSelection instanceof Set ? state.projectSelection.size : -1;
  out.stillTickedAfterRefresh = document.querySelectorAll('[data-project-item][data-selected="true"]').length;

  // Untick one card: the bar must follow WITHOUT re-rendering the grid, so the box the
  // teacher clicked stays the same node. A programmatic click() does not move focus in
  // Chromium, so node identity — not activeElement — is what proves "no re-render".
  const firstBox = boxes()[0];
  const untickedId = firstBox.dataset.id;
  firstBox.click();
  await sleep(150);
  out.countAfterUntick = document.querySelector('[data-project-selected-count]').textContent.trim();
  out.selectAllAfterUntick = document.querySelector('#projectSelectAll').checked;
  out.cardNodeReused = document.contains(firstBox) && firstBox.checked === false;
  const selectedIds = [...(state.projectSelection instanceof Set ? state.projectSelection : [])];
  out.selectedIds = selectedIds.length;
  out.untickedLeftOut = !selectedIds.includes(untickedId);

  // "Bỏ chọn" re-renders the page, so every node from here on is looked up again.
  document.querySelector('#projectClearSelectionBtn').click();
  await sleep(600);
  out.countAfterClear = (document.querySelector('[data-project-selected-count]') || {}).textContent?.trim() || '';
  out.selectionAfterClear = state.projectSelection instanceof Set ? state.projectSelection.size : -1;

  // Re-tick the whole list and leave one card out again, so the delete has to be exact.
  document.querySelector('#projectSelectAll').click();
  await sleep(150);
  boxes()[0].click();
  await sleep(150);
  const toDelete = [...(state.projectSelection instanceof Set ? state.projectSelection : [])];
  out.reselectedIds = toDelete.length;
  out.untickedAgainOut = !toDelete.includes(untickedId);

  // The IPC refuses an empty batch instead of silently answering "0 deleted".
  try { await window.eduGame.deleteProjects([]); out.emptyBatchRejected = false; }
  catch (error) { out.emptyBatchRejected = true; }
  // An id that is not in the store is reported, not counted as deleted.
  const ghost = await window.eduGame.deleteProjects(['probe-proj-khong-ton-tai-' + runTag]);
  out.ghostReport = ghost.deleted + '/' + ghost.missing;

  const gamesBefore = (await window.eduGame.getLibrary()).games.length;
  const realConfirm = window.confirm;
  window.confirm = () => true;
  document.querySelector('#projectDeleteSelectedBtn').click();
  await sleep(1600);
  window.confirm = realConfirm;

  const after = await window.eduGame.listProjects();
  const afterProbe = (after || []).filter(p => String(p.title || '').startsWith('probe-proj-'));
  out.leftProbe = afterProbe.length;
  out.expectedLeft = 5 - out.reselectedIds;
  out.untickedDraftSurvived = afterProbe.some(p => p.id === untickedId);
  out.teacherDraftSurvived = (after || []).some(p => p.id === teacherId);
  out.projectsAfter = (after || []).length;
  out.otherProjectsAfter = (after || []).filter(p => !String(p.title || '').startsWith('probe-proj-')).length;
  out.gamesAfter = (await window.eduGame.getLibrary()).games.length;
  out.gamesBefore = gamesBefore;
  out.selectionNow = state.projectSelection instanceof Set ? state.projectSelection.size : -1;
  const countNode = document.querySelector('[data-project-selected-count]');
  out.countReset = countNode ? countNode.textContent.trim() : '';
  out.deleteDisabledAfter = (document.querySelector('#projectDeleteSelectedBtn') || {}).disabled;

  const remaining = (after || []).filter(p => String(p.title || '').startsWith('probe-proj-'));
  if (remaining.length) await window.eduGame.deleteProjects(remaining.map(p => p.id));
  await window.eduGame.deleteProjects([teacherId]);
  state.projectSelection = new Set();
  state.search = '';
  navigate('my-projects');
  await sleep(600);
  out.probeCardsAfterCleanup = probeCards();
  return out;
})()`;

(async () => {
  const cdp = await connect();
  const result = await cdp.evaluate(SCENARIO);
  if (result.error) {
    check('the projects page renders', false, result.error);
    console.log('\n1 check(s) failed');
    process.exit(1);
  }

  check('the batch bar sits above the grid', result.hasBar && result.hasSelectAll, `${result.listed} cards`);
  check('every project card has a pick box', result.everyCardHasBox === true, `${result.probe} probe of ${result.listed}`);
  check('nothing is ticked and delete starts disabled',
    result.initialDeleteDisabled === true && /Hoặc tick/.test(result.initialCountLabel), result.initialCountLabel);
  check('the bar and the pick boxes have real geometry',
    Boolean(result.barBox) && result.barBox.w > 200 && result.barBox.h > 24
      && result.boxesVisible === true && result.boxesPlaced.length === result.listed,
    `bar ${result.barBox ? result.barBox.w + 'x' + result.barBox.h : 'none'} · boxes ${JSON.stringify(result.boxesPlaced[0])}`);
  check('"select all" ticks every visible project',
    result.selectedAfterSelectAll === result.listed && result.allBoxesChecked === true,
    `${result.selectedAfterSelectAll} of ${result.listed}`);
  check('a refresh keeps the ticks it already has',
    result.selectedThroughRefresh === result.listed && result.stillTickedAfterRefresh === result.listed,
    `${result.selectedThroughRefresh} ids kept, ${result.stillTickedAfterRefresh} cards still ringed`);
  check('the count label and the delete button follow the selection',
    new RegExp('Đã chọn ' + result.listed + ' dự án').test(result.countLabel)
      && new RegExp('\\(' + result.listed + '\\)').test(result.deleteLabel)
      && result.deleteDisabledAfterSelectAll === false,
    `${result.countLabel} · ${result.deleteLabel}`);
  check('unticking one card updates the bar without a re-render',
    new RegExp('Đã chọn ' + (result.listed - 1) + ' dự án').test(result.countAfterUntick)
      && result.cardNodeReused === true && result.untickedLeftOut === true,
    `${result.countAfterUntick} · same checkbox node kept: ${result.cardNodeReused}`);
  check('the select-all box unchecks when one card is off',
    result.selectAllAfterUntick === false, String(result.selectAllAfterUntick));
  check('"Bỏ chọn" clears the whole selection',
    result.selectionAfterClear === 0 && /Hoặc tick/.test(result.countAfterClear), result.countAfterClear);
  check('the IPC refuses an empty batch', result.emptyBatchRejected === true, String(result.emptyBatchRejected));
  check('an unknown id is reported as missing, not deleted', result.ghostReport === '0/1', result.ghostReport);
  check('the batch delete removed exactly the selected drafts',
    result.leftProbe === result.expectedLeft && result.untickedDraftSurvived === true
      && result.reselectedIds === 4 && result.untickedAgainOut === true,
    `${result.leftProbe} probe left, expected ${result.expectedLeft}; ${result.reselectedIds} ticked, the unticked draft survived: ${result.untickedDraftSurvived}`);
  check('drafts outside the search are untouched',
    result.otherProjectsAfter === result.otherProjects && result.teacherDraftSurvived === true,
    `${result.otherProjectsAfter} after, ${result.otherProjects} before; the teacher draft survived: ${result.teacherDraftSurvived}`);
  check('saved games are untouched by a draft delete',
    result.gamesAfter === result.gamesBefore, `${result.gamesAfter} games, was ${result.gamesBefore}`);
  check('the selection is cleared after deleting',
    result.selectionNow === 0 && /Hoặc tick/.test(result.countReset) && result.deleteDisabledAfter === true,
    result.countReset);
  check('the check cleaned up its own fixtures', result.probeCardsAfterCleanup === 0, String(result.probeCardsAfterCleanup));

  console.log(`\n${failures ? `${failures} check(s) failed` : 'All project selection checks passed'}`);
  process.exit(failures ? 1 : 0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
