#!/usr/bin/env node
/**
 * DECISIONS #316 — "Nhập CSV/XLSX" with no file to import.
 *
 * The editor could import a spreadsheet, but a teacher who has never made one had
 * no way in: the button opened a file dialog onto a format nobody had given them.
 * The page now offers "Tải tệp mẫu" and one line of text that says so.
 *
 * This gate drives the REAL button and reads the REAL blob it produces (the
 * download itself cannot be saved headlessly, so `URL.createObjectURL` is wrapped
 * to capture the bytes the browser was handed), then asserts the file is the one
 * the importer accepts: BOM, header row, `;` delimiter, four example rows.
 * The round-trip through `importQuestionsFromFile` lives in
 * `tests/unit/question-template.test.js`.
 *
 * Usage: `node tests/ui/ui-question-template-check.js [port]`.
 */
process.argv[2] = process.argv[2] || process.env.CDP_PORT || '9339';

const { connect } = require('../manual/lib/ui-check-lib');

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

const SCENARIO = String.raw`(async () => {
  const out = {};
  for (let i = 0; i < 40; i++) {
    if (document.querySelector('#modalRoot .setup-fullscreen')) break;
    await new Promise(r => setTimeout(r, 100));
  }
  if (typeof closeSetupWizard === 'function') closeSetupWizard('close');
  await new Promise(r => setTimeout(r, 250));

  const game = await desktop.call('saveGame', {
    title: 'Kiểm tra tệp mẫu CSV', template: 'quiz', description: '', subject: 'Tự nhiên', grade: '4',
    questions: [{
      id: 'q1', type: 'multiple-choice', difficulty: 'dễ', prompt: 'Câu một?', explanation: 'Một.', points: 100,
      options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correctOptionId: 'a'
    }]
  });
  state.db = await desktop.call('getLibrary');
  navigate('library');
  await new Promise(r => setTimeout(r, 600));
  const card = [...document.querySelectorAll('article')].find(a => a.textContent.includes('Kiểm tra tệp mẫu CSV'));
  const toggle = card && card.querySelector('[data-menu-toggle]');
  if (toggle) toggle.click();
  await new Promise(r => setTimeout(r, 100));
  const edit = card && card.querySelector('[data-action="edit"]');
  if (edit) edit.click();
  await new Promise(r => setTimeout(r, 900));

  const download = document.querySelector('#pageContent #downloadQuestionsTemplateBtn');
  const importBtn = document.querySelector('#pageContent #importQuestionsBtn');
  const hint = document.querySelector('#pageContent #editorImportHint');
  out.downloadFound = Boolean(download);
  out.importFound = Boolean(importBtn);
  out.downloadLabel = download ? download.textContent.trim() : '';
  // The template must stand FIRST: it is the button for the teacher who has nothing yet.
  out.order = Boolean(download && importBtn) && (download.compareDocumentPosition(importBtn) & Node.DOCUMENT_POSITION_FOLLOWING) > 0;
  // A control whose label hides the door is the same door as no control: the hint
  // names both buttons, and it is visible (not display:none / zero height).
  out.hintText = hint ? hint.textContent.replace(/\s+/g, ' ').trim() : '';
  out.hintNamesBoth = /Tải tệp mẫu/.test(out.hintText) && /Nhập CSV\/XLSX/.test(out.hintText);
  out.hintVisible = Boolean(hint) && hint.getBoundingClientRect().height > 10
    && getComputedStyle(hint).display !== 'none' && getComputedStyle(hint).visibility !== 'hidden';

  // Drive the real handler. The browser's own download is replaced at the ONE seam a
  // headless run cannot drive: the object URL. Everything else — Blob contents, the
  // <a download> name, the toast — is the production code path.
  const created = [];
  const realCreate = URL.createObjectURL;
  URL.createObjectURL = function (blob) {
    created.push(blob);
    return realCreate.call(URL, blob);
  };
  let clickedDownloadName = '';
  const realClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.download) clickedDownloadName = this.download;
    return undefined;
  };
  try {
    download.click();
    await new Promise(r => setTimeout(r, 300));
  } finally {
    URL.createObjectURL = realCreate;
    HTMLAnchorElement.prototype.click = realClick;
  }
  out.blobs = created.length;
  out.blobType = created.length ? created[0].type : '';
  // Read the BYTES. Blob.text() decodes as UTF-8 *and strips the BOM*, so a text
  // read cannot answer "did we write a BOM?" — it always answers no (#316).
  const bytes = created.length ? new Uint8Array(await created[0].arrayBuffer()) : new Uint8Array();
  out.hasBom = bytes.length > 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF;
  const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
  out.fileName = clickedDownloadName;
  const lines = text.replace(/^\uFEFF/, '').trimEnd().split('\r\n');
  out.lineCount = lines.length;
  // A quoted cell may hold the delimiter ("hướng đông;đông"), so split the way a
  // spreadsheet does: quotes protect everything between them.
  const fields = line => {
    const cells = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const character = line[i];
      if (character === '"') {
        if (quoted && line[i + 1] === '"') { cell += '"'; i += 1; } else { quoted = !quoted; }
      } else if (!quoted && character === ';') { cells.push(cell); cell = ''; } else { cell += character; }
    }
    cells.push(cell);
    return cells;
  };
  out.delimiter = fields(lines[0] || '').length;
  out.header = lines[0];
  out.types = lines.slice(1).map(line => fields(line)[1]);
  out.rowCounts = lines.slice(1).map(line => fields(line).length);
  // The multi-answer cell must be ONE quoted cell, not two columns.
  out.quotedMultiAnswer = /;"hướng đông;đông";/.test(text);
  out.noExcelMojibake = /Vì sao cây cần ánh sáng\?/.test(text) && /Thủ đô của Việt Nam/.test(text);

  // Same page, one save: the editor is unaffected by the new button.
  out.questionRows = document.querySelectorAll('#pageContent #editorQuestions .editor-question').length;

  // --- #317: dán thẳng từ Excel, và bảng báo cáo dòng bị bỏ ---------------------
  const pasteBox = document.querySelector('#pageContent [data-editor-paste]');
  const pasteText = document.querySelector('#pageContent [data-editor-paste-text]');
  const pasteBtn = document.querySelector('#pageContent [data-editor-paste-import]');
  out.pastePanel = Boolean(pasteBox && pasteText && pasteBtn);
  out.pastePlaceholder = pasteText ? pasteText.getAttribute('placeholder') || '' : '';
  if (pasteText && pasteBtn) {
    // Two good rows and one the row reader must refuse: the good rows must still land,
    // and the bad one must be NAMED in the report instead of vanishing.
    pasteText.value = [
      'Câu hỏi	Dạng câu hỏi	Phương án A	Phương án B	Đáp án',
      'Nước sôi ở bao nhiêu độ?	trắc nghiệm	90	100	B',
      'Sai đáp án?	trắc nghiệm	Một	Hai	Z',
      'Thủ đô Việt Nam?	trả lời ngắn			Hà Nội'
    ].join(String.fromCharCode(10));
    pasteBtn.click();
    await new Promise(r => setTimeout(r, 700));
  }
  out.questionsAfterPaste = document.querySelectorAll('#pageContent #editorQuestions .editor-question').length;
  const report = document.querySelector('#pageContent [data-editor-import-report]');
  out.reportShown = Boolean(report);
  out.reportComplete = report ? report.getAttribute('data-complete') : null;
  out.reportTitle = report ? report.querySelector('.editor-import-report-title').textContent.replace(/\s+/g, ' ').trim() : '';
  out.reportRows = report ? [...report.querySelectorAll('tbody tr')].map(tr => tr.textContent.replace(/\s+/g, ' ').trim()) : [];
  out.pasteCleared = Boolean(pasteText) && pasteText.value === '';
  // The report must be ABOVE the question list, where the teacher looks after importing.
  out.reportBeforeList = Boolean(report) && (report.compareDocumentPosition(document.querySelector('#pageContent #editorQuestions')) & Node.DOCUMENT_POSITION_FOLLOWING) > 0;
  if (report) {
    const closeBtn = report.querySelector('[data-editor-import-report-close]');
    if (closeBtn) closeBtn.click();
  }
  await new Promise(r => setTimeout(r, 200));
  out.reportClosed = document.querySelector('#pageContent [data-editor-import-report]') === null;
  document.querySelector('#pageContent #editorCancelBtn')?.click();
  await new Promise(r => setTimeout(r, 500));
  try { await desktop.call('deleteGame', game.id); } catch (e) { void e; }
  state.db = await desktop.call('getLibrary');
  out.pageAfter = state.page;
  return out;
})()`;

(async () => {
  const cdp = await connect();
  const result = await cdp.evaluate(SCENARIO);

  check('the editor offers "Tải tệp mẫu"', result.downloadFound === true && /Tải tệp mẫu/.test(result.downloadLabel || ''),
    result.downloadLabel);
  check('it stands before "Nhập CSV/XLSX" — the teacher with no file reads it first',
    result.order === true && result.importFound === true);
  check('one line of text names both buttons', result.hintNamesBoth === true, result.hintText.slice(0, 80));
  check('that line is actually visible', result.hintVisible === true);

  check('clicking it builds one text file', result.blobs === 1 && /text\/csv/.test(result.blobType || ''),
    `${result.blobs} blob(s) ${result.blobType}`);
  check('the file is named for a teacher, not for the parser', result.fileName === 'mau-cau-hoi-edugame.csv', result.fileName);
  check('it opens in Excel as UTF-8 (BOM + CRLF)', result.hasBom === true && result.lineCount === 5,
    `bom ${result.hasBom} / ${result.lineCount} dòng`);
  check('it has the 10 columns the importer reads', result.delimiter === 10 && /^Câu hỏi;Dạng câu hỏi;/.test(result.header || ''),
    result.header);
  check('one example per question type, in the order the games play them',
    JSON.stringify(result.types) === JSON.stringify(['trắc nghiệm', 'đúng/sai', 'điền từ', 'trả lời ngắn']),
    JSON.stringify(result.types));
  check('every row has exactly 10 fields (no shifted columns)',
    Array.isArray(result.rowCounts) && result.rowCounts.length === 4 && result.rowCounts.every(count => count === 10),
    JSON.stringify(result.rowCounts));
  check('the two-answer example stays ONE quoted cell', result.quotedMultiAnswer === true);
  check('Vietnamese text survives (no mojibake)', result.noExcelMojibake === true);
  check('the question list is untouched', result.questionRows === 1, `${result.questionRows} câu`);

  // #317 — dán thẳng từ Excel + báo cáo dòng bị bỏ.
  check('there is a paste panel with a monospace box and its own button',
    result.pastePanel === true && /Ctrl\+V/.test(result.pastePlaceholder), result.pastePlaceholder.slice(0, 50));
  check('two good pasted rows become questions, the bad row does not stop the paste',
    result.questionsAfterPaste === 3, `${result.questionsAfterPaste} câu (1 + 2)`);
  check('the report names what came in', /Đã nhập 2 câu/.test(result.reportTitle || ''), result.reportTitle);
  check('the report is marked incomplete and sits above the question list',
    result.reportComplete === '0' && result.reportBeforeList === true);
  check('the skipped row is a table row naming its line, column and reason',
    result.reportRows.length === 1 && /Dòng 3/.test(result.reportRows[0]) && /Đáp án/.test(result.reportRows[0])
      && /không khớp phương án/.test(result.reportRows[0]),
    result.reportRows[0] || '(none)');
  check('the pasted text is cleared once it imported', result.pasteCleared === true);
  check('the report can be dismissed', result.reportClosed === true);
  check('cancelling returns to the library', result.pageAfter === 'library', result.pageAfter);

  console.log(`\n${failures ? `${failures} check(s) failed` : 'All question-template checks passed'}`);
  process.exit(failures ? 1 : 0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
