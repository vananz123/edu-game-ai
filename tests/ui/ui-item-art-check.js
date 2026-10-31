#!/usr/bin/env node
/**
 * DECISIONS #124 — step 5 shows each question and its picture in one card.
 *
 * A question bank is built without the model (#117), which reaches the step-5 screen
 * cheaply. The check proves: one card per question (not two parallel lists), a picture
 * and an upload button inside each card, the answers visible with the correct one
 * marked, and — after an upload through the real channel — the card showing the
 * teacher's own picture through `edugame-file:`.
 *
 * Usage: launch with --remote-debugging-port=PORT, then
 * `node tests/ui/ui-item-art-check.js [port] <path-to-a-png>`.
 */
const fs = require('fs');
process.argv[2] = process.argv[2] || process.env.CDP_PORT || '9338';
let imagePath = process.argv[3];
if (!imagePath) {
  // A 1x1 PNG written next to the check, so the default run needs no fixture file.
  const os = require('node:os');
  const path = require('node:path');
  imagePath = path.join(os.tmpdir(), 'edugame-item-art-check.png');
  fs.writeFileSync(imagePath, Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  ));
}

// The library's `check` prints; this file collects the count so it can exit non-zero.
const { connect: connectRaw } = require('../manual/lib/ui-check-lib');
const connect = async () => {
  // Both modules read the same port; the library's constant wins, so the caller's
  // argument is re-applied before it resolves it.
  process.argv[2] = process.argv[2] || process.env.CDP_PORT || '9338';
  return connectRaw();
};

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

/**
 * CDP `Runtime.evaluate` runs in the page's global scope, so a renderer function that
 * was declared with `const`/`function` in a classic script is normally visible — but
 * the app's own bundle wraps some helpers (and a reload mid-check can drop them). The
 * scenario therefore reaches the wizard only through the real page: it types into the
 * step-1 box and presses the buttons, exactly as a teacher would.
 */
const NAVIGATE = `(async () => {
  const link = [...document.querySelectorAll('[data-page]')].find(node => node.dataset.page === 'create-wizard');
  if (link) link.click();
  await new Promise(r => setTimeout(r, 600));
  return Boolean(link);
})()`;

const SCENARIO = String.raw`(async () => {
  if (typeof wizardReset === 'function') wizardReset();
  navigate('create-wizard');
  await new Promise(r => setTimeout(r, 400));
  wizardState.text = 'Câu 1: Thủ đô Việt Nam?\nA. Hà Nội\nB. Huế\nĐáp án: A\nGiải thích: Hà Nội là thủ đô.\n\nCâu 2: 2 + 2 bằng mấy?\nA. 3\nB. 4\nĐáp án: B\nGiải thích: Bằng bốn.';
  wizardState.documentName = 'item-art-check.txt';
  await wizardClassifyInput();
  wizardState.selectedGameType = 'arena';
  wizardState.importedMode = true;
  wizardState.draftOrigin = 'source';
  wizardState.step = 'recommend';
  render();
  await new Promise(r => setTimeout(r, 300));
  await wizardRecommendNext();
  await new Promise(r => setTimeout(r, 1500));

  const out = { step: wizardState.step, projectId: wizardState.projectId };
  const cards = [...document.querySelectorAll('[data-wizard-item-card]')];
  out.cards = cards.length;
  out.uploadButtons = document.querySelectorAll('[data-wizard-action="upload-art"]').length;
  out.regenerateButtons = cards.filter(card => card.querySelector('[data-wizard-action="regenerate-item"]')).length;
  out.oldSeparateLists = document.querySelectorAll('[data-wizard-draft-items], [data-wizard-art-grid]').length;
  out.prompts = cards.map(card => (card.querySelector('.wizard-item-prompt') || {}).textContent || '');
  out.answersInCards = cards.map(card => card.querySelectorAll('.wizard-item-answers li').length);
  out.correctInCards = cards.map(card => card.querySelectorAll('.wizard-item-answers li.is-correct').length);
  out.thumbsInCards = cards.filter(card => card.querySelector('.wizard-art-thumb')).length;

  // The real upload channel (the dialog is replaced by a known path for the check).
  const uploaded = await window.eduGame.importIllustration(${JSON.stringify(imagePath)});
  out.uploadedId = uploaded && uploaded.id;
  await wizardPatchItemAssets(1, { illustrationAssetId: uploaded.id });
  await new Promise(r => setTimeout(r, 500));
  const firstCard = document.querySelector('[data-wizard-item-card="1"]');
  out.cardUsesCustom = Boolean(firstCard && firstCard.querySelector('.stage-illustration.is-custom'));
  out.cardBadge = firstCard && firstCard.querySelector('.wizard-item-art-badge') ? firstCard.querySelector('.wizard-item-art-badge').textContent.trim() : '';
  out.href = firstCard && firstCard.querySelector('image') ? firstCard.querySelector('image').getAttribute('href') : '';
  // The thumbnail must actually decode, not merely point at the file: this is the
  // difference between "the card says Ảnh tự tải lên" and "the picture appears".
  out.thumbLoaded = await new Promise(resolve => {
    const probe = new Image();
    probe.onload = () => resolve('ok ' + probe.naturalWidth + 'x' + probe.naturalHeight);
    probe.onerror = () => resolve('error');
    probe.src = out.href;
    setTimeout(() => resolve('timeout'), 3000);
  });
  // Only the first card changed: the picture stays with its own question.
  const secondCard = document.querySelector('[data-wizard-item-card="2"]');
  out.secondUnchanged = Boolean(secondCard && !secondCard.querySelector('.stage-illustration.is-custom'));

  // #126: reproduce the teacher's case — step 5 with the project id lost (a project
  // opened from the list arrived without it). The project is deleted *after* the extra
  // patch below, so the patch still has a row to write to.
  const projectForCleanup = wizardState.projectId;
  wizardState.projectId = null;
  const saved = await wizardEnsureProjectSaved();
  out.orphanSuite = saved && wizardState.projectId ? 'saved' : 'failed';
  const patchedOrphan = saved
    ? await window.eduGame.patchLessonItemAssets({ projectId: wizardState.projectId, itemIndex: 1, patch: { illustrationAssetId: uploaded.id } })
    : null;
  out.orphanApplied = patchedOrphan && patchedOrphan.project && patchedOrphan.project.draft
    ? String(Boolean((patchedOrphan.project.draft.questions || [])[0].illustrationAssetId))
    : 'none';

  // Leave nothing behind: both probe projects and any picture they uploaded. The
  // fixture image is deleted by main together with the project that used it (#127), and
  // the fallback below only runs if that did not happen.
  if (window.eduGame.deleteProject) {
    for (const projectId of new Set([projectForCleanup, wizardState.projectId].filter(Boolean))) {
      try { await window.eduGame.deleteProject(projectId); } catch { /* best effort */ }
    }
  }
  try { await window.eduGame.deleteIllustration(uploaded.id); } catch { /* best effort */ }
  return out;
})()`;

(async () => {
  const cdp = await connect();
  const result = await cdp.evaluate(SCENARIO);
  check('step 5 is reached from the bank', result.step === 'generate', result.step);
  check('one card per question', result.cards === 2, String(result.cards));
  check('the old two separate lists are gone', result.oldSeparateLists === 0, String(result.oldSeparateLists));
  check('every card has its own picture and upload button',
    result.uploadButtons === result.cards && result.thumbsInCards === result.cards,
    `${result.uploadButtons} upload / ${result.thumbsInCards} thumbs of ${result.cards}`);
  check('every card can regenerate its own question', result.regenerateButtons === result.cards, String(result.regenerateButtons));
  check('the questions are inside their cards', result.prompts.length === 2 && /Thủ đô/.test(result.prompts[0]) && /2 \+ 2/.test(result.prompts[1]), result.prompts.join(' | '));
  check('each card shows its answers with the correct one marked',
    result.answersInCards.join(',') === '2,2' && result.correctInCards.join(',') === '1,1',
    `${result.answersInCards.join(',')} answers / ${result.correctInCards.join(',')} correct`);
  check('an uploaded picture is saved on the item', Boolean(result.uploadedId) && result.cardUsesCustom, `${result.uploadedId} / ${result.cardUsesCustom}`);
  check('the card label says the picture is the teacher\'s', /Ảnh tự tải lên/.test(result.cardBadge), result.cardBadge);
  check('the card loads it through edugame-file:', result.href.startsWith('edugame-file://img/' + result.uploadedId), result.href);
  check('the card picture actually loads', /^ok /.test(result.thumbLoaded || ''), result.thumbLoaded);
  check('the picture stays with its own question', result.secondUnchanged === true);
  // #126: the real report — step 5 reached with no `projectId` in the wizard state. The
  // picture must still be saved (the project is saved first) instead of silently doing
  // nothing behind a toast.
  check('an upload on step 5 with no saved project still works',
    result.orphanSuite === 'saved' && result.orphanApplied === 'true',
    `${result.orphanSuite} / ${result.orphanApplied}`);

  console.log(`\n${failures ? `${failures} check(s) failed` : 'All item art checks passed'}`);
  process.exit(failures ? 1 : 0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
