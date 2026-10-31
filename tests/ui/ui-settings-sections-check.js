#!/usr/bin/env node
/**
 * DECISIONS #157 + #158 — Settings is an accordion of five sections, and the AI one
 * holds two tabs.
 *
 * The page used to be six long blocks stacked on top of each other. It now groups them
 * as Nhà cung cấp AI, Phong cách giảng dạy, Giao diện, Tác vụ dùng AI and Chẩn đoán
 * trực trặc (log); selecting a header reveals that section, and the AI section splits
 * into "AI local" (model on this machine) and "AI cloud" (API providers). This check
 * pins the behaviour the rest of the app depends on:
 *   - one section open at a time, AI first, local tab first;
 *   - every body stays in the DOM while collapsed or hidden behind a tab, because
 *     `saveSettings` reads `#settingLargeText`/`#settingSound` and
 *     `readAiProviderPatches` walks `[data-ai-provider]` — hiding must never mean
 *     removing;
 *   - switching section or tab never loses what was typed but not saved;
 *   - the task list and diagnostics info still load while their section is closed;
 *   - the open section and the selected tab survive a save and a page change.
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

const SECTIONS = ['ai', 'teaching', 'interface', 'tasks', 'diagnostics'];
const TITLES = ['Nhà cung cấp AI', 'Phong cách giảng dạy', 'Giao diện', 'Tác vụ dùng AI', 'Chẩn đoán trực trặc (log)'];

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
  const tabOf = id => document.querySelector('[data-ai-tab="' + id + '"]');
  const tabPanelShown = id => {
    const panel = document.querySelector('[data-ai-tabpanel="' + id + '"]');
    return Boolean(panel) && !panel.classList.contains('hidden');
  };
  const shownTabs = () => [...document.querySelectorAll('[data-ai-tabpanel]')]
    .filter(panel => !panel.classList.contains('hidden'))
    .map(panel => panel.dataset.aiTabpanel);

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
  const theme = (state.settings.preferences && state.settings.preferences.theme) || 'light';
  out.themeLabel = theme === 'dark' ? 'Tối' : theme === 'system' ? 'Theo hệ thống' : 'Sáng';
  out.aiHeaderText = (header('ai') || {}).textContent || '';
  out.interfaceHeaderText = (header('interface') || {}).textContent || '';

  // ── the AI section: two tabs, one visible at a time, both present in the DOM ──
  out.tabIds = [...document.querySelectorAll('[data-ai-tab]')].map(node => node.dataset.aiTab);
  out.tabLabels = [...document.querySelectorAll('[data-ai-tab]')].map(node => node.textContent.trim());
  out.tabSelected = [...document.querySelectorAll('[data-ai-tab]')]
    .filter(node => node.getAttribute('aria-selected') === 'true')
    .map(node => node.dataset.aiTab);
  out.defaultTabPanels = shownTabs();
  out.cardsWhileLocal = document.querySelectorAll('[data-ai-provider]').length;
  out.cardIds = [...document.querySelectorAll('[data-ai-provider]')].map(node => node.dataset.aiProvider).join(',');
  out.localControlsWhileLocal = {
    modelSelect: Boolean(document.querySelector('#localModelSelect')),
    installBtn: Boolean(document.querySelector('#installLocalModelBtn'))
  };

  tabOf('cloud').click();
  await sleep(200);
  out.afterCloudClick = {
    panels: visiblePanels(),          // the section itself must stay open
    tabs: shownTabs(),
    selected: [...document.querySelectorAll('[data-ai-tab]')]
      .filter(node => node.getAttribute('aria-selected') === 'true')
      .map(node => node.dataset.aiTab),
    tabState: state.settingsAiTab,
    cards: document.querySelectorAll('[data-ai-provider]').length,
    localHidden: !tabPanelShown('local'),
    modelSelectStillThere: Boolean(document.querySelector('#localModelSelect'))
  };

  // A value typed but not saved must survive moving between tabs *and* between
  // sections — neither is allowed to re-render (that would rebuild the form from
  // state.settings and silently drop it).
  const base = document.querySelector('[data-ai-provider-baseurl="gemini"]');
  const originalBase = base ? base.value : '';
  if (base) base.value = 'http://127.0.0.1:9/v1';
  tabOf('local').click();
  await sleep(120);
  tabOf('cloud').click();
  await sleep(120);
  out.survivedTabSwitch = base ? base.value === 'http://127.0.0.1:9/v1' : false;
  header('teaching').click();
  await sleep(150);
  out.tabAfterLeavingSection = { tabState: state.settingsAiTab, cloudPanel: tabPanelShown('cloud') };
  header('ai').click();
  await sleep(150);
  out.survivedSectionSwitch = base ? base.value === 'http://127.0.0.1:9/v1' : false;
  out.tabPanelAfterReturning = shownTabs();
  if (base) base.value = originalBase;

  // Only the selected tab is in the tab order, so the arrow keys are the keyboard path.
  tabOf('local').focus();
  tabOf('local').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  await sleep(150);
  out.arrowMoved = {
    focused: document.activeElement === tabOf('cloud'),
    tabs: shownTabs(),
    localTabIndex: tabOf('local').tabIndex,
    cloudTabIndex: tabOf('cloud').tabIndex
  };

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
  out.aiOpenAfterSave = panelVisible('ai');
  out.tabAfterSave = { state: state.settingsAiTab, panels: shownTabs() };
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

  check('five section headers in the asked-for order', out.ids.join(',') === SECTIONS.join(','), out.ids.join(','));
  check('each header carries its title',
    TITLES.every((title, index) => String(out.texts[index] || '').includes(title)),
    out.texts.join(' | ').slice(0, 240));
  check('the AI section is open on the first visit',
    out.defaultVisible.length === 1 && out.defaultVisible[0] === 'ai' && out.defaultExpanded.join(',') === 'ai',
    `${out.defaultVisible.join(',')} / ${out.defaultExpanded.join(',')}`);
  check('every section body stays in the DOM while collapsed', out.panelCount === 5, String(out.panelCount));
  check('the controls saveSettings reads are present while collapsed',
    Object.values(out.controlsPresent).every(Boolean), JSON.stringify(out.controlsPresent));
  check('the closed AI header carries one chip per tab',
    /🤖/.test(out.aiHeaderText) && /☁️/.test(out.aiHeaderText), out.aiHeaderText.slice(0, 90));
  check('the closed sections still show a state chip',
    out.interfaceHeaderText.includes(out.themeLabel), `theme ${out.themeLabel} / ${out.interfaceHeaderText.slice(0, 70)}`);

  check('the AI section holds exactly the two asked-for tabs',
    out.tabIds.join(',') === 'local,cloud' && /AI local/.test(out.tabLabels[0]) && /AI cloud/.test(out.tabLabels[1]),
    `${out.tabIds.join(',')} / ${out.tabLabels.join(' | ')}`);
  check('AI local is the tab shown on the first visit',
    out.tabSelected.join(',') === 'local' && out.defaultTabPanels.join(',') === 'local',
    `${out.tabSelected.join(',')} / ${out.defaultTabPanels.join(',')}`);
  check('the cloud tab hides nothing: provider cards are rendered while it is off-screen',
    out.cardsWhileLocal === 4 && !out.cardIds.split(',').includes('local'),
    `${out.cardsWhileLocal} / ${out.cardIds}`);

  check('switching to AI cloud shows the providers and keeps the section open',
    out.afterCloudClick.panels.join(',') === 'ai' && out.afterCloudClick.tabs.join(',') === 'cloud'
      && out.afterCloudClick.selected.join(',') === 'cloud' && out.afterCloudClick.tabState === 'cloud'
      && out.afterCloudClick.cards === 4 && out.afterCloudClick.localHidden === true,
    JSON.stringify(out.afterCloudClick));
  check('the local tab keeps its controls while off-screen',
    out.afterCloudClick.modelSelectStillThere === true && Object.values(out.localControlsWhileLocal).every(Boolean),
    JSON.stringify(out.afterCloudClick.modelSelectStillThere) + ' / ' + JSON.stringify(out.localControlsWhileLocal));

  check('typing then switching tabs keeps the unsaved value', out.survivedTabSwitch === true, String(out.survivedTabSwitch));
  check('the selected tab survives leaving and reopening the section',
    out.tabAfterLeavingSection.tabState === 'cloud' && out.survivedSectionSwitch === true
      && out.tabPanelAfterReturning.join(',') === 'cloud',
    JSON.stringify(out.tabAfterLeavingSection) + ' / ' + out.tabPanelAfterReturning.join(','));
  check('the arrow keys move tab selection and focus',
    out.arrowMoved.focused === true && out.arrowMoved.tabs.join(',') === 'cloud'
      && out.arrowMoved.localTabIndex === -1 && out.arrowMoved.cloudTabIndex === 0,
    JSON.stringify(out.arrowMoved));

  check('saving reads a control inside a closed section',
    out.interfaceHiddenBeforeSave === true && out.savedLargeText === out.expectedLargeText,
    `${out.interfaceHiddenBeforeSave} / ${out.savedLargeText} vs ${out.expectedLargeText}`);
  check('the open section and the selected tab survive the save re-render',
    out.sectionAfterSave === 'ai' && out.aiOpenAfterSave === true && out.tabAfterSave.state === 'cloud'
      && out.tabAfterSave.panels.join(',') === 'cloud',
    `${out.sectionAfterSave}/${out.aiOpenAfterSave}/${JSON.stringify(out.tabAfterSave)}`);
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
