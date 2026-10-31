#!/usr/bin/env node
/**
 * DECISIONS #131 — the race game's editor after the modal → page move.
 *
 * Three reports from a teacher, all about the race template:
 *   1. team names were white on white (the editor row reused the play-surface class);
 *   2. an effect dragged onto the track preview could not be removed;
 *   3. "Tải ảnh lên" on a race question did nothing.
 *
 * The check opens a race game in the editor (new-game flow: valid data by default),
 * measures the team row's colours, removes an effect through the preview, uploads a real
 * file to a race question, saves, and reads the stored game back — the colour and the
 * picture must both survive.
 *
 * Usage: `node tests/ui/ui-race-editor-check.js [port]`.
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

const pngPath = path.join(os.tmpdir(), 'edugame-race-editor.png');
fs.writeFileSync(pngPath, Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
));

const SCENARIO = String.raw`(async () => {
  const out = {};
  navigate('create');
  await new Promise(r => setTimeout(r, 500));
  document.querySelector('#pageContent [data-template="race"]').click();
  await new Promise(r => setTimeout(r, 200));
  document.querySelector('#pageContent #previewManualBtn').click();
  await new Promise(r => setTimeout(r, 900));
  out.page = state.page;

  // 1. Team row legibility + colour picker.
  const teamRow = document.querySelector('#raceTeams .race-team-row');
  const nameInput = teamRow && teamRow.querySelector('[data-team-name]');
  out.teamBg = teamRow ? getComputedStyle(teamRow).backgroundColor : 'none';
  out.teamRaw = teamRow ? getComputedStyle(teamRow).raw : '';
  out.nameColor = nameInput ? getComputedStyle(nameInput).color : 'none';
  out.nameBg = nameInput ? getComputedStyle(nameInput).backgroundColor : 'none';
  const picker = teamRow && teamRow.querySelector('[data-team-color]');
  out.pickerValue = picker ? picker.value : 'none';
  if (picker) {
    picker.value = '#7c3aed';
    picker.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // 2. An effect can be removed from the preview by clicking its cell.
  placeRaceEffect(document.querySelector('#pageContent'), 4, 'boost');
  await new Promise(r => setTimeout(r, 200));
  out.before = document.querySelectorAll('#raceCells [data-cell-row]').length;
  const cell = document.querySelector('#raceTrackPreview [data-track-cell][data-track-num="4"]');
  out.cellMarked = Boolean(cell && /race-cell-boost/.test(cell.className));
  cell.click();
  await new Promise(r => setTimeout(r, 200));
  out.after = document.querySelectorAll('#raceCells [data-cell-row]').length;

  // 3. Picture upload on a race question (dialog replaced at the renderer entry point).
  const realDialog = window.eduGame.importIllustration;
  window.editorImportIllustration = () => realDialog(${JSON.stringify(pngPath)});
  const upload = document.querySelector('#raceQuestions [data-editor-art-upload]');
  out.hasUpload = Boolean(upload);
  upload.click();
  await new Promise(r => setTimeout(r, 1400));
  const card = document.querySelector('#raceQuestions .race-question-card');
  const field = card.querySelector('[data-field="illustrationAssetId"]');
  out.uploadedId = field ? field.value : '';
  out.badge = card.querySelector('[data-editor-art-badge]') ? card.querySelector('[data-editor-art-badge]').textContent.trim() : '';

  // 4. Save and read back.
  const realToast = window.toast;
  window.toast = () => {};
  document.querySelector('#pageContent #saveGameBtn').click();
  await new Promise(r => setTimeout(r, 1600));
  window.toast = realToast;
  const lib = await window.eduGame.getLibrary();
  const saved = lib.games.find(g => g.template === 'race' && g.race && g.race.questions
    && g.race.questions.some(q => q.illustrationAssetId === out.uploadedId));
  out.savedColor = saved ? saved.race.teams[0].color : 'none';
  out.savedImage = saved ? saved.race.questions[0].illustrationAssetId : 'none';
  out.pageAfterSave = state.page;
  if (saved) {
    await window.eduGame.deleteGame(saved.id);
    try { await window.eduGame.deleteIllustration(out.uploadedId); } catch (e) { void e; }
  }
  state.db = await window.eduGame.getLibrary();
  state.page = 'library';
  render();
  return out;
})()`;

/** Rough luminance: a light background needs dark text. */
function isDark(color) {
  const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color || '');
  if (!match) return false;
  const [r, g, b] = match.slice(1, 4).map(Number);
  return (0.299 * r + 0.587 * g + 0.114 * b) < 140;
}
function isLight(color) {
  const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color || '');
  if (!match) return false;
  const [r, g, b] = match.slice(1, 4).map(Number);
  return (0.299 * r + 0.587 * g + 0.114 * b) > 200;
}

(async () => {
  const cdp = await connect();
  const result = await cdp.evaluate(SCENARIO);

  check('the race editor opens as a page', result.page === 'editor', result.page);
  check('the team row is light, not the dark play-surface row', isLight(result.teamBg), result.teamBg);
  check('the team name is dark on a light input', isDark(result.nameColor) && isLight(result.nameBg), `${result.nameColor} on ${result.nameBg}`);
  check('each team has a colour picker', /^#[0-9a-f]{6}$/i.test(result.pickerValue || ''), result.pickerValue);
  check('the dragged effect is removed by clicking its cell',
    result.cellMarked === true && result.before === 2 && result.after === 1,
    `${result.before} → ${result.after} (marked ${result.cellMarked})`);
  check('a race question takes an uploaded picture', /^ci-[a-f0-9]{32}$/.test(result.uploadedId || ''), result.uploadedId);
  check('its card says the picture is the teacher\'s', /Ảnh tự tải lên/.test(result.badge || ''), result.badge);
  check('the teacher\'s colour is saved', result.savedColor === '#7c3aed', result.savedColor);
  check('the picture is saved with the race game', result.savedImage === result.uploadedId, result.savedImage);
  check('saving returns to the library', result.pageAfterSave === 'library', result.pageAfterSave);

  console.log(`\n${failures ? `${failures} check(s) failed` : 'All race editor checks passed'}`);
  process.exit(failures ? 1 : 0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
