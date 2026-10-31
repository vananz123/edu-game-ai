#!/usr/bin/env node
/**
 * DECISIONS #157 — Settings is an accordion of six sections.
 *
 * The page used to be six long blocks stacked on top of each other. It now groups
 * them as AI local tích hợp, Nhà cung cấp API Key, Phong cách giảng dạy, Giao diện,
 * Tác vụ dùng AI and Chẩn đoán trực trặc (log), and selecting a header reveals that
 * section. This check pins the behaviour the rest of the app depends on:
 *   - one section open at a time, AI local first;
 *   - every body stays in the DOM while collapsed, because `saveSettings` reads
 *     `#settingLargeText`/`#settingSound` and `readAiProviderPatches` walks
 *     `[data-ai-provider]` — hiding must never mean removing;
 *   - selecting another section never loses what was typed but not saved;
 *   - the task list and diagnostics info still load while their section is closed;
 *   - the open section survives a save and a page change.
 *
 * Usage: launch with --remote-debugging-port=PORT, then
 * `node tests/ui/ui-settings-sections-check.js [port]`.
 */
process.argv[2] = process.argv[2] || process.env.CDP_PORT || '9348';
const { connect } = require('../manual/lib/ui-check-lib');

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

const SECTIONS = ['aiLocal', 'providers', 'teaching', 'interface', 'tasks', 'diagnostics'];
const TITLES = ['AI local tích hợp', 'Nhà cung cấp API Key', 'Phong cách giảng dạy', 'Giao diện', 'Tác vụ dùng AI', 'Chẩn đoán trực trặc (log)'];

const SCENARIO = String.raw`(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  // A fresh profile opens the setup onboarding into #modalRoot a moment after the
  // window loads; it would replace the settings page this check drives. Canonical guard.
  for (let i = 0; i < 40; i++) { if (document.querySelector('#modalRoot .setup-fullscreen')) break; await sleep(100); }
  if (typeof closeSetupWizard === 'function') closeSetupWizard('close');
  await sleep(250);

  const header = id => document.querySelector('[data-settings-section="' + id + '"]');
  const panelVisible = id => {
    const panel = document.querySelector('[data-settings-panel="' + id + '"]');
    return Boolean(panel) && !panel.classList.contains('hidden');
  };
  const visiblePanels = () => [...document.querySelectorAll('[data-settings-panel]')]
    .filter(panel => !panel.classList.contains('hidden'))
    .map(panel => panel.dataset.settingsPanel);
  const expandedSections = () => [...document.querySelectorAll('[data-settings-section]')]
    .filter(node => node.getAttribute('aria-expanded') === 'true')
    .map(node => node.dataset.settingsSection);

  navigate('settings');
  await sleep(800);

  const out = {};
  const headers = [...document.querySelectorAll('[data-settings-section]')];
  out.ids = headers.map(node => node.dataset.settingsSection);
  out.texts = headers.map(node => node.textContent.replace(/\s+/g, ' ').trim());
  out.defaultVisible = visiblePanels();
  out.defaultExpanded = expandedSections();
  out.panelCount = document.querySelectorAll('[data-settings-panel]').length;
  out.controlsPresent = {
    largeText: Boolean(document.querySelector('#settingLargeText')),
    sound: Boolean(document.querySelector('#settingSound')),
    runtimeBackend: Boolean(document.querySelector('#localRuntimeBackendSelect')),
    aiTaskList: Boolean(document.querySelector('#aiTaskList')),
    diagnosticsInfo: Boolean(document.querySelector('#diagnosticsInfo'))
  };
  out.providerCards = document.querySelectorAll('[data-ai-provider]').length;
  const theme = (state.settings.preferences && state.settings.preferences.theme) || 'light';
  out.themeLabel = theme === 'dark' ? 'Tối' : theme === 'system' ? 'Theo hệ thống' : 'Sáng';
  out.providerHeaderText = (header('providers') || {}).textContent || '';
  out.interfaceHeaderText = (header('interface') || {}).textContent || '';

  // Selecting another section closes the previous one.
  header('providers').click();
  await sleep(250);
  out.afterProviders = {
    visible: visiblePanels(),
    expanded: expandedSections(),
    stateValue: state.settingsSection,
    cards: document.querySelectorAll('[data-ai-provider]').length
  };

  // A value typed but not saved must survive moving between sections (no re-render —
  // a re-render would rebuild the form from state.settings and drop it).
  const base = document.querySelector('[data-ai-provider-baseurl="gemini"]');
  const originalBase = base ? base.value : '';
  if (base) base.value = 'http://127.0.0.1:9/v1';
  header('teaching').click();
  await sleep(150);
  header('providers').click();
  await sleep(150);
  out.unsavedSurvived = base ? base.value === 'http://127.0.0.1:9/v1' : false;
  if (base) base.value = originalBase;

  // A control inside a closed section is still saved: "Chữ lớn khi chơi" lives in Giao diện.
  out.interfaceHiddenBeforeSave = !panelVisible('interface');
  const largeText = document.querySelector('#settingLargeText');
  const originalLargeText = largeText ? largeText.checked : true;
  out.expectedLargeText = !originalLargeText;
  if (largeText) largeText.checked = out.expectedLargeText;
  document.querySelector('#saveSettingsBtn').click();
  await sleep(1300);
  out.savedLargeText = ((await window.eduGame.getSettings()).preferences || {}).largeText;
  out.sectionAfterSave = state.settingsSection;
  out.providersOpenAfterSave = panelVisible('providers');
  // Put the profile back the way it was found (fresh profiles default to true).
  const largeTextAfter = document.querySelector('#settingLargeText');
  if (largeTextAfter) largeTextAfter.checked = originalLargeText;
  document.querySelector('#saveSettingsBtn').click();
  await sleep(1100);

  // The loaders still ran while their sections were closed.
  out.taskListText = ((document.querySelector('#aiTaskList') || {}).textContent || '').replace(/\s+/g, ' ').trim();
  out.diagnosticsInfoText = ((document.querySelector('#diagnosticsInfo') || {}).textContent || '').replace(/\s+/g, ' ').trim();
  out.tasksHiddenNow = !panelVisible('tasks');

  // Opening the task section re-reads the list.
  header('tasks').click();
  await sleep(900);
  out.tasksVisible = panelVisible('tasks');
  out.taskListAfterOpen = ((document.querySelector('#aiTaskList') || {}).textContent || '').replace(/\s+/g, ' ').trim();

  // Clicking the open header collapses it.
  header('tasks').click();
  await sleep(150);
  out.collapsedVisible = visiblePanels();
  out.collapsedState = state.settingsSection;

  // Leaving the page and coming back keeps the teacher on the same section.
  header('interface').click();
  await sleep(120);
  navigate('home');
  await sleep(180);
  navigate('settings');
  await sleep(700);
  out.afterReturn = visiblePanels();

  return out;
})()`;

(async () => {
  const cdp = await connect();
  const out = await cdp.evaluate(SCENARIO);

  check('six section headers in the asked-for order', out.ids.join(',') === SECTIONS.join(','), out.ids.join(','));
  check('each header carries its title',
    TITLES.every((title, index) => String(out.texts[index] || '').includes(title)),
    out.texts.join(' | ').slice(0, 240));
  check('the AI local section is open on the first visit',
    out.defaultVisible.length === 1 && out.defaultVisible[0] === 'aiLocal' && out.defaultExpanded.join(',') === 'aiLocal',
    `${out.defaultVisible.join(',')} / ${out.defaultExpanded.join(',')}`);
  check('every section body stays in the DOM while collapsed', out.panelCount === 6, String(out.panelCount));
  check('the controls saveSettings reads are present while collapsed',
    Object.values(out.controlsPresent).every(Boolean), JSON.stringify(out.controlsPresent));
  check('all five provider cards are rendered before the section is opened', out.providerCards === 5, String(out.providerCards));
  check('the closed sections still show a state chip',
    /sẵn sàng|Chưa có nhà cung cấp/.test(out.providerHeaderText) && out.interfaceHeaderText.includes(out.themeLabel),
    `${out.providerHeaderText.slice(0, 70)} / theme ${out.themeLabel}`);
  check('selecting a section opens it and closes the previous one',
    out.afterProviders.visible.join(',') === 'providers' && out.afterProviders.expanded.join(',') === 'providers' && out.afterProviders.stateValue === 'providers',
    JSON.stringify(out.afterProviders));
  check('provider cards stay rendered while the section is closed', out.afterProviders.cards === 5, String(out.afterProviders.cards));
  check('typing then switching sections keeps the unsaved value', out.unsavedSurvived === true, String(out.unsavedSurvived));
  check('saving reads a control inside a closed section',
    out.interfaceHiddenBeforeSave === true && out.savedLargeText === out.expectedLargeText,
    `${out.interfaceHiddenBeforeSave} / ${out.savedLargeText} vs ${out.expectedLargeText}`);
  check('the open section survives the save re-render',
    out.sectionAfterSave === 'providers' && out.providersOpenAfterSave === true,
    `${out.sectionAfterSave}/${out.providersOpenAfterSave}`);
  check('the AI task list still loads while its section is closed',
    out.tasksHiddenNow === true && /Trang \d+\/\d+|Chưa có tác vụ AI nào/.test(out.taskListText),
    out.taskListText.slice(0, 100));
  check('the diagnostics info still loads while its section is closed',
    /Log trên máy|Không đọc được/.test(out.diagnosticsInfoText), out.diagnosticsInfoText.slice(0, 100));
  check('opening the task section shows a refreshed list',
    out.tasksVisible === true && /Trang \d+\/\d+|Chưa có tác vụ AI nào/.test(out.taskListAfterOpen),
    out.taskListAfterOpen.slice(0, 100));
  check('clicking the open header collapses every section',
    out.collapsedVisible.length === 0 && out.collapsedState === '',
    `${JSON.stringify(out.collapsedVisible)} / ${out.collapsedState}`);
  check('the open section is remembered when leaving and coming back',
    out.afterReturn.join(',') === 'interface', out.afterReturn.join(','));

  console.log(failures ? `\n${failures} check(s) failed` : '\nAll settings section checks passed');
  cdp.ws.close();
  process.exit(failures ? 1 : 0);
})().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
