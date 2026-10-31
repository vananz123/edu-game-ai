#!/usr/bin/env node
/**
 * DECISIONS #127 — the upload button actually works, every time.
 *
 * Runs the *real* wizard handlers (`wizardUploadArt`, `wizardPatchItemAssets`) against a
 * real project and a real image file, with only the file dialog replaced in the
 * renderer (a native dialog cannot be driven headlessly). This covers the chain the
 * teacher uses: button → dialog → id → patch → card shows the picture, and the two ways
 * it used to look broken:
 *   1. the dialog is cancelled (nothing changes, the button must stay usable);
 *   2. a write is already queued (the next click must still work, not be swallowed).
 * Then it checks that deleting a picture in use is refused (field-clearing on one card
 * must not blank another).
 *
 * Usage: `node tests/ui/ui-art-upload-flow-check.js [port]`.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
process.argv[2] = process.argv[2] || process.env.CDP_PORT || '9338';

const { connect } = require('../manual/lib/ui-check-lib');

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

// Two distinct real PNGs, so "the same picture" cannot pass by accident.
const PNG_RED = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const pngPath = path.join(os.tmpdir(), 'edugame-art-flow-1.png');
const pngPath2 = path.join(os.tmpdir(), 'edugame-art-flow-2.png');
fs.writeFileSync(pngPath, PNG_RED);
fs.writeFileSync(pngPath2, PNG_RED);

const SCENARIO = String.raw`(async () => {
  const out = {};
  // A bank game reaches step 5 without the model (#117) and saves its project.
  if (typeof wizardReset === 'function') wizardReset();
  navigate('create-wizard');
  await new Promise(r => setTimeout(r, 500));
  wizardState.text = 'Câu 1: Thủ đô Việt Nam?\nA. Hà Nội\nB. Huế\nĐáp án: A\nGiải thích: Hà Nội là thủ đô.\n\nCâu 2: 2 + 2 bằng mấy?\nA. 3\nB. 4\nĐáp án: B\nGiải thích: Bằng bốn.';
  wizardState.documentName = 'art-flow-check.txt';
  await wizardClassifyInput();
  wizardState.selectedGameType = 'arena';
  wizardState.importedMode = true;
  wizardState.draftOrigin = 'source';
  wizardState.step = 'recommend';
  render();
  await new Promise(r => setTimeout(r, 300));
  await wizardRecommendNext();
  await new Promise(r => setTimeout(r, 1500));
  out.step = wizardState.step;
  out.projectId = wizardState.projectId;

  // The native dialog cannot be driven headlessly, and contextBridge freezes
  // window.eduGame, so the dialog is replaced at the renderer entry point instead:
  // the handlers call this function, and everything after it (patch, project, card) is
  // the real code path.
  const originalImport = window.wizardImportIllustration;
  const stub = { next: null, calls: 0 };
  window.wizardImportIllustration = async () => {
    stub.calls += 1;
    return stub.next ? stub.next() : null;
  };

  // 1. Cancelled dialog: nothing changes, the busy flag clears, buttons stay enabled.
  wizardState.error = null;
  stub.next = async () => null;
  await wizardUploadArt(1);
  await new Promise(r => setTimeout(r, 300));
  out.cancel = {
    busy: wizardState.artBusy,
    item1: (wizardState.draft.questions[0] || {}).illustrationAssetId || null,
    buttonDisabled: Boolean(document.querySelector('[data-wizard-item-card="1"] [data-wizard-action="upload-art"]').disabled)
  };

  // 2. Real upload into item 1, then into item 2 without waiting: both must land, and
  //    the second must not be swallowed by the first one's busy state.
  const fileOne = await window.eduGame.importIllustration(${JSON.stringify(pngPath)});
  const fileTwo = await window.eduGame.importIllustration(${JSON.stringify(pngPath2)});
  out.imageOne = fileOne && fileOne.id;
  out.imageTwo = fileTwo && fileTwo.id;
  let call = 0;
  stub.next = async () => (call++ === 0 ? fileOne : fileTwo);
  const first = wizardUploadArt(1);
  const second = wizardUploadArt(2);
  await Promise.all([first, second]);
  await new Promise(r => setTimeout(r, 800));
  out.upload = {
    busy: wizardState.artBusy,
    item1: (wizardState.draft.questions[0] || {}).illustrationAssetId || null,
    item2: (wizardState.draft.questions[1] || {}).illustrationAssetId || null,
    called: stub.calls
  };
  const card1 = document.querySelector('[data-wizard-item-card="1"]');
  out.card1Href = card1 && card1.querySelector('image') ? card1.querySelector('image').getAttribute('href') : 'none';
  out.card1Badge = card1 && card1.querySelector('.wizard-item-art-badge') ? card1.querySelector('.wizard-item-art-badge').textContent.trim() : 'none';
  out.card1Loads = await new Promise(resolve => {
    if (!out.card1Href || out.card1Href === 'none') return resolve('no-href');
    const probe = new Image();
    probe.onload = () => resolve('ok ' + probe.naturalWidth + 'x' + probe.naturalHeight);
    probe.onerror = () => resolve('error');
    probe.src = out.card1Href;
    setTimeout(() => resolve('timeout'), 3000);
  });

  // 3. A picture that a saved project still uses cannot be deleted from under it.
  out.deleteInUse = await window.eduGame.deleteIllustration(fileOne.id);

  // 4. "Tự động" clears only its own card.
  await wizardPatchItemAssets(2, { contentCategory: '', illustrationAssetId: '' });
  await new Promise(r => setTimeout(r, 500));
  out.reset = {
    item1: (wizardState.draft.questions[0] || {}).illustrationAssetId || null,
    item2: (wizardState.draft.questions[1] || {}).illustrationAssetId || null
  };

  window.wizardImportIllustration = originalImport;
  // Leave nothing behind.
  try { await window.eduGame.deleteProject(wizardState.projectId); } catch (e) { void e; }
  try { await window.eduGame.deleteIllustration(fileTwo.id); } catch (e) { void e; }
  return out;
})()`;

(async () => {
  const cdp = await connect();
  const result = await cdp.evaluate(SCENARIO);

  check('the bank reaches step 5 with a saved project', result.step === 'generate' && Boolean(result.projectId), `${result.step} / ${result.projectId}`);
  check('cancelling the dialog changes nothing and re-enables the button',
    result.cancel && result.cancel.busy === false && result.cancel.item1 === null && result.cancel.buttonDisabled === false,
    JSON.stringify(result.cancel));
  check('an upload is written to its own question', result.upload && result.upload.item1 === result.imageOne,
    `${result.upload && result.upload.item1} vs ${result.imageOne}`);
  check('a second upload while the first is running is not swallowed',
    result.upload && result.upload.item2 === result.imageTwo, `${result.upload && result.upload.item2} vs ${result.imageTwo}`);
  check('the busy flag clears after both writes', result.upload && result.upload.busy === false, String(result.upload && result.upload.busy));
  check('the card points at the uploaded file', result.card1Href === `edugame-file://img/${result.imageOne}`, result.card1Href);
  check('the card says the picture is the teacher\'s', /Ảnh tự tải lên/.test(result.card1Badge || ''), result.card1Badge);
  check('the card picture loads', /^ok /.test(result.card1Loads || ''), result.card1Loads);
  check('a picture in use cannot be deleted', result.deleteInUse && result.deleteInUse.ok === false && result.deleteInUse.inUse === true,
    JSON.stringify(result.deleteInUse));
  check('"Tự động" clears only its own question',
    result.reset && result.reset.item1 === result.imageOne && result.reset.item2 === null,
    JSON.stringify(result.reset));

  console.log(`\n${failures ? `${failures} check(s) failed` : 'All art upload flow checks passed'}`);
  process.exit(failures ? 1 : 0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
