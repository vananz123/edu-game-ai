#!/usr/bin/env node
/**
 * DECISIONS #128 — a picture per item in the manual editor.
 *
 * Opens a saved game in the editor (the same entry the library uses), checks that every
 * question row carries the picture control next to its text, drives the control (built-in
 * pick, uploaded file, "Tự động"), and then saves through the editor's own button and
 * reads the stored row back — a picture that only lives in the DOM is not "added".
 *
 * The file dialog is replaced through the renderer entry point the editor calls
 * (`editorImportIllustration`), so everything after the dialog is the real code path.
 *
 * Usage: `node tests/ui/ui-editor-art-check.js [port]`.
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

const pngPath = path.join(os.tmpdir(), 'edugame-editor-art.png');
fs.writeFileSync(pngPath, Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
));

const SCENARIO = String.raw`(async () => {
  const out = {};
  const game = await window.eduGame.saveGame({
    title: 'Kiểm tra ảnh trình soạn thảo', template: 'quiz', description: '', subject: 'Toán', grade: '4',
    gameSetup: { illustrationMode: 'auto' },
    questions: [
      { id: 'q1', type: 'multiple-choice', difficulty: 'trung bình', prompt: 'Câu một?', explanation: 'Một.', points: 100,
        options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correctOptionId: 'a' },
      { id: 'q2', type: 'multiple-choice', difficulty: 'trung bình', prompt: 'Câu hai?', explanation: 'Hai.', points: 100,
        options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correctOptionId: 'a' }
    ]
  });
  out.gameId = game.id;
  state.db = await window.eduGame.getLibrary();
  // Open the editor the way a teacher does: the library card's "Chỉnh sửa" menu item.
  navigate('library');
  await new Promise(r => setTimeout(r, 600));
  const card = [...document.querySelectorAll('article')].find(a => a.textContent.includes('Kiểm tra ảnh trình soạn thảo'));
  const toggle = card && card.querySelector('[data-menu-toggle]');
  if (toggle) toggle.click();
  await new Promise(r => setTimeout(r, 100));
  const edit = card && card.querySelector('[data-action="edit"]');
  out.editFound = Boolean(edit);
  if (edit) edit.click();
  await new Promise(r => setTimeout(r, 800));

  // The quiz list holds one row per question. The editor may also show a hidden
  // template preview (other templates), so the control is counted *inside* question
  // cards — which is exactly what the teacher must see.
  // #129: the editor is a page of the shell, not a modal over the library.
  out.isPage = state.page === 'editor' && Boolean(document.querySelector('#pageContent [data-editor-page]'));
  out.noModal = document.querySelectorAll('#modalRoot .modal-backdrop').length === 0;
  // #130: the save actions are pinned in their own bar (always on screen while the
  // question list scrolls), next to the page header.
  out.hasPageHeader = Boolean(document.querySelector('#pageContent .editor-page-head'))
    && Boolean(document.querySelector('#pageContent .editor-save-bar #saveGameBtn'));
  out.saveBarSticky = (() => {
    const bar = document.querySelector('#pageContent .editor-save-bar');
    return bar ? getComputedStyle(bar).position : 'none';
  })();
  const rows = () => [...document.querySelectorAll('#pageContent [data-editor-art]')];
  const listRows = () => [...document.querySelectorAll('#pageContent #editorQuestions [data-editor-art]')];
  out.rows = listRows().length;
  out.questions = document.querySelectorAll('#pageContent #editorQuestions .editor-question').length;
  out.thumbInRow = listRows().every(row => row.querySelector('[data-editor-art-thumb]'));
  out.uploadInRow = listRows().every(row => row.querySelector('[data-editor-art-upload]'));
  // The control must sit inside the question card, next to the prompt — not in a
  // separate list at the bottom of the modal (#124's lesson).
  out.insideQuestionCard = listRows().every(row => Boolean(row.closest('.editor-question')));
  // Question 2 starts without a picture, so "Tự động" gets its value later from the
  // upload step below (which proves the second use of a control that was redrawn).

  // 1. Built-in picture on question 1.
  const pick = listRows()[0].querySelector('[data-editor-art-pick]');
  pick.value = 'space-scene';
  pick.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(r => setTimeout(r, 150));
  out.pickField = listRows()[0].parentElement.querySelector('[data-field="illustrationAssetId"]').value;
  out.pickBadge = listRows()[0].querySelector('[data-editor-art-badge]').textContent.trim();
  out.pickThumb = Boolean(listRows()[0].querySelector('.editor-art-thumb .stage-illustration'));
  // Diagnostics: the same markup built directly from the value the redraw passes.
  const probe = document.createElement('div');
  probe.innerHTML = editorItemArtHtml({ illustrationAssetId: out.pickField, contentCategory: '' });
  out.directBadge = probe.querySelector('[data-editor-art-badge]').textContent.trim();
  out.directPreview = Boolean(probe.querySelector('.editor-art-thumb .stage-illustration'));

  // 2. Upload on question 2, through the same entry the button uses. The dialog is the
  //    only thing replaced (it cannot be driven headlessly); the picture is a real file
  //    read by main, and the patch/redraw below is the real handler.
  const realDialog = window.eduGame.importIllustration;
  window.editorImportIllustration = () => realDialog(${JSON.stringify(pngPath)});
  listRows()[1].querySelector('[data-editor-art-upload]').click();
  await new Promise(r => setTimeout(r, 1500));
  window.editorImportIllustration = () => realDialog();
  const uploadRow = () => [...document.querySelectorAll('#pageContent #editorQuestions [data-editor-art]')][1];
  out.uploadField = uploadRow().parentElement.querySelector('[data-field="illustrationAssetId"]').value;
  out.uploadBadge = uploadRow().querySelector('[data-editor-art-badge]').textContent.trim();
  out.uploadHref = (() => {
    const image = uploadRow().querySelector('image');
    return image ? image.getAttribute('href') : 'none';
  })();
  out.uploadLoads = await new Promise(resolve => {
    if (out.uploadHref === 'none') return resolve('no-href');
    const probe = new Image();
    probe.onload = () => resolve('ok ' + probe.naturalWidth + 'x' + probe.naturalHeight);
    probe.onerror = () => resolve('error');
    probe.src = out.uploadHref;
    setTimeout(() => resolve('timeout'), 3000);
  });

  // 3. "Tự động" on question 1 clears only that question. Clicked through the real
  //    handler and re-read from the live DOM: the control replaces itself, so keeping a
  //    reference to the old button would silently test a detached node.
  //    Question 1 is the target: it holds the built-in picture chosen in step 1.
  const resetButton = () => listRows()[0].querySelector('[data-editor-art-reset]');
  resetButton().click();
  await new Promise(r => setTimeout(r, 200));
  out.resetField = listRows()[0].parentElement.querySelector('[data-field="illustrationAssetId"]').value;
  out.resetOther = listRows()[1].parentElement.querySelector('[data-field="illustrationAssetId"]').value;
  out.resetBadge = listRows()[0].querySelector('[data-editor-art-badge]').textContent.trim();

  // 4. Put a built-in back on question 1, then save through the editor's own button.
  const pickAgain = listRows()[0].querySelector('[data-editor-art-pick]');
  pickAgain.value = 'space-scene';
  pickAgain.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(r => setTimeout(r, 150));
  document.querySelector('#pageContent #saveGameBtn')?.click();
  await new Promise(r => setTimeout(r, 1200));
  const after = await window.eduGame.getLibrary();
  const stored = after.games.find(g => g.id === game.id);
  out.saved1 = stored && stored.questions[0].illustrationAssetId;
  out.saved2 = stored && stored.questions[1].illustrationAssetId;
  // #129: saving leaves the editor page and lands back in the library.
  out.pageAfterSave = state.page;

  try { await window.eduGame.deleteGame(game.id); } catch (e) { void e; }
  try { await window.eduGame.deleteIllustration(out.uploadField); } catch (e) { void e; }
  state.db = await window.eduGame.getLibrary();
  if (state.page === 'editor') closeEditorPage({ cancel: true });
  return out;
})()`;

(async () => {
  const cdp = await connect();
  const result = await cdp.evaluate(SCENARIO);
  check('every question row has the picture control', result.rows === 2 && result.questions === 2, `${result.rows} controls / ${result.questions} questions`);
  check('the control is inside the question card', result.insideQuestionCard === true);
  check('it has a thumb and an upload button', result.thumbInRow === true && result.uploadInRow === true);
  check('picking a built-in picture writes the field and the thumb',
    result.pickField === 'space-scene' && result.pickThumb === true, `${result.pickField} / thumb ${result.pickThumb}`);
  check('the badge names the picked picture', /Vũ trụ/.test(result.pickBadge || ''),
    `${result.pickBadge} | direct: ${result.directBadge} | preview ${result.directPreview}`);
  check('uploading writes the picture id', Boolean(result.uploadField) && result.uploadField !== 'space-scene', result.uploadField);
  check('the uploaded picture shows and loads', /^edugame-file:\/\/img\//.test(result.uploadHref || '') && /^ok /.test(result.uploadLoads || ''),
    `${result.uploadHref} → ${result.uploadLoads}`);
  check('"Tự động" clears its own question and leaves the other alone',
    result.resetField === '' && result.resetOther === result.uploadField && /Tổng quát/.test(result.resetBadge || ''),
    `${result.resetField} / ${result.resetOther} vs ${result.uploadField} / ${result.resetBadge}`);
  check('saving keeps both pictures', result.saved1 === 'space-scene' && result.saved2 === result.uploadField,
    `${result.saved1} / ${result.saved2}`);
  check('the editor opened as a page, not a modal', result.isPage === true && result.noModal === true,
    `page ${result.isPage} / no modal ${result.noModal}`);
  check('its save actions are pinned in a bar on the page', result.hasPageHeader === true && result.saveBarSticky === 'sticky',
    `found ${result.hasPageHeader} / position ${result.saveBarSticky}`);
  check('saving returns to the library', result.pageAfterSave === 'library', result.pageAfterSave);

  console.log(`\n${failures ? `${failures} check(s) failed` : 'All editor art checks passed'}`);
  process.exit(failures ? 1 : 0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
