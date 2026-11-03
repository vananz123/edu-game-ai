#!/usr/bin/env node
/**
 * DECISIONS #157 → #159 — Settings is one tab strip with five tabs, and the AI tab holds
 * two nested tabs.
 *
 * The page used to be six long blocks stacked on top of each other, then an accordion
 * (#157), then a tab page (#159): Nhà cung cấp AI, Phong cách, Giao diện, Tác vụ and
 * Chẩn đoán, and the AI panel splits into "AI local" (model on this machine) and
 * "AI cloud" (API providers). This check pins the behaviour the rest of the app depends on:
 *   - exactly one tab open at a time, AI first, local sub-tab first; there is no
 *     "all collapsed" state any more;
 *   - every panel stays in the DOM while hidden, because `saveSettings` reads
 *     `#settingLargeText`/`#settingSound` and `readAiProviderPatches` walks
 *     `[data-ai-provider]` — hiding must never mean removing;
 *   - `aria-controls`/`id` really link each tab to its panel, since that is the only
 *     handle `wireSettingsTabStrip` has to find the panel to show;
 *   - switching tab or sub-tab never loses what was typed but not saved;
 *   - the task list and diagnostics info still load while their tab is hidden;
 *   - the open tab and the selected sub-tab survive a save and a page change;
 *   - the new tab markup is legible in dark mode, where `dark:` utilities do not fire.
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
const TAB_LABELS = ['Nhà cung cấp AI', 'Phong cách', 'Giao diện', 'Tác vụ', 'Chẩn đoán'];
const PANEL_TITLES = ['Nhà cung cấp AI', 'Phong cách giảng dạy', 'Giao diện', 'Tác vụ dùng AI', 'Chẩn đoán trực trặc (log)'];
const SCENARIO = String.raw`(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  // A fresh profile opens the setup onboarding into #modalRoot a moment after the
  // window loads; it would replace the settings page this check drives. Canonical guard.
  for (let i = 0; i < 40; i++) { if (document.querySelector('#modalRoot .setup-fullscreen')) break; await sleep(100); }
  if (typeof closeSetupWizard === 'function') closeSetupWizard('close');
  await sleep(250);

  const tab = id => document.querySelector('[data-settings-section="' + id + '"]');
  const panel = id => document.querySelector('[data-settings-panel="' + id + '"]');
  const panelShown = id => Boolean(panel(id)) && !panel(id).classList.contains('hidden');
  const visiblePanels = () => [...document.querySelectorAll('[data-settings-panel]')]
    .filter(node => !node.classList.contains('hidden'))
    .map(node => node.dataset.settingsPanel);
  const selectedTabs = () => [...document.querySelectorAll('[data-settings-section]')]
    .filter(node => node.getAttribute('aria-selected') === 'true')
    .map(node => node.dataset.settingsSection);
  const aiTab = id => document.querySelector('[data-ai-tab="' + id + '"]');
  const aiPanelShown = id => {
    const node = document.querySelector('[data-ai-tabpanel="' + id + '"]');
    return Boolean(node) && !node.classList.contains('hidden');
  };
  const shownAiPanels = () => [...document.querySelectorAll('[data-ai-tabpanel]')]
    .filter(node => !node.classList.contains('hidden'))
    .map(node => node.dataset.aiTabpanel);
  // Page-side copy of the tab order: the scenario runs in the renderer, so it cannot read
  // the Node-side constant below.
  const IDS = ['ai', 'teaching', 'interface', 'tasks', 'diagnostics'];

  // One assertion ends on the diagnostics tab and the open tab is remembered in state for
  // the life of the page, so a second run on the same instance would start where the last one
  // stopped and "the first visit" would no longer be the default. Put it back first.
  state.settingsSection = 'ai';
  state.settingsAiTab = 'local';
  render();

  navigate('settings');
  await sleep(800);

  const out = {};
  const tabs = [...document.querySelectorAll('[data-settings-section]')];
  out.ids = tabs.map(node => node.dataset.settingsSection);
  out.tabTexts = tabs.map(node => node.textContent.replace(/\s+/g, ' ').trim());
  out.defaultVisible = visiblePanels();
  out.defaultSelected = selectedTabs();
  out.panelCount = document.querySelectorAll('[data-settings-panel]').length;
  // The wiring resolves a panel through aria-controls only, so a broken link would make
  // clicking that tab hide everything instead of switching.
  out.controlsResolve = tabs.every(node => Boolean(document.getElementById(node.getAttribute('aria-controls'))));
  out.tabRoles = tabs.map(node => node.getAttribute('role')).join(',');
  out.tabpanelCount = document.querySelectorAll('[role="tabpanel"]').length;
  out.labelsResolve = [...document.querySelectorAll('[role="tabpanel"]')].every(node => {
    const owner = document.getElementById(node.getAttribute('aria-labelledby') || '');
    return owner && (owner.dataset.settingsSection || owner.dataset.aiTab);
  });
  out.panelTitles = IDS.map(id => (panel(id)?.querySelector('h3')?.textContent || '').replace(/\s+/g, ' ').trim());
  out.controlsPresent = {
    largeText: Boolean(document.querySelector('#settingLargeText')),
    sound: Boolean(document.querySelector('#settingSound')),
    runtimeBackend: Boolean(document.querySelector('#localRuntimeBackendSelect')),
    aiTaskList: Boolean(document.querySelector('#aiTaskList')),
    diagnosticsInfo: Boolean(document.querySelector('#diagnosticsInfo'))
  };
  const prefs = state.settings.preferences || {};
  out.themeLabel = prefs.theme === 'dark' ? 'Tối' : prefs.theme === 'system' ? 'Hệ thống' : 'Sáng';
  out.tone = (prefs.teachingStyle || {}).tone || 'thân thiện';
  out.aiTabText = tab('ai').textContent;
  out.interfaceTabText = tab('interface').textContent;
  out.teachingTabText = tab('teaching').textContent;
  out.panelHeaderChips = (panel('ai').querySelector('h3').parentElement.textContent || '').replace(/\s+/g, ' ').trim();
  // #161: chrome icons are Lucide nodes painted into [data-icon] hooks. The hooks carry
  // no text any more, so a tab label is only "complete" once every hook under it holds an
  // <svg> — an unknown icon id would leave a blank chip that the old emoji never did.
  out.iconHooks = [...document.querySelectorAll('[data-icon]')].length;
  out.unpaintedIcons = [...document.querySelectorAll('[data-icon]')]
    .filter(node => !node.querySelector('svg.lucide')).map(node => node.dataset.icon).join(',');
  out.aiTabIcons = [...tab('ai').querySelectorAll('[data-icon]')].map(node => node.dataset.icon).join(',');

  // ── the AI panel: two nested tabs, one visible at a time, both present in the DOM ──
  out.aiTabIds = [...document.querySelectorAll('[data-ai-tab]')].map(node => node.dataset.aiTab);
  out.aiTabLabels = [...document.querySelectorAll('[data-ai-tab]')].map(node => node.textContent.trim());
  out.aiTabSelected = [...document.querySelectorAll('[data-ai-tab]')]
    .filter(node => node.getAttribute('aria-selected') === 'true')
    .map(node => node.dataset.aiTab);
  out.defaultAiPanels = shownAiPanels();
  out.cardsWhileLocal = document.querySelectorAll('[data-ai-provider]').length;
  out.cardIds = [...document.querySelectorAll('[data-ai-provider]')].map(node => node.dataset.aiProvider).join(',');
  out.localControlsWhileLocal = {
    modelSelect: Boolean(document.querySelector('#localModelSelect')),
    installBtn: Boolean(document.querySelector('#installLocalModelBtn'))
  };

  aiTab('cloud').click();
  await sleep(200);
  out.afterCloudClick = {
    panels: visiblePanels(),          // the AI tab itself must stay selected
    aiPanels: shownAiPanels(),
    selected: [...document.querySelectorAll('[data-ai-tab]')]
      .filter(node => node.getAttribute('aria-selected') === 'true')
      .map(node => node.dataset.aiTab),
    aiTabState: state.settingsAiTab,
    cards: document.querySelectorAll('[data-ai-provider]').length,
    localHidden: !aiPanelShown('local'),
    modelSelectStillThere: Boolean(document.querySelector('#localModelSelect'))
  };

  // A value typed but not saved must survive moving between sub-tabs *and* between tabs —
  // neither is allowed to re-render (that would rebuild the form from state.settings and
  // silently drop it).
  const base = document.querySelector('[data-ai-provider-baseurl="gemini"]');
  const originalBase = base ? base.value : '';
  if (base) base.value = 'http://127.0.0.1:9/v1';
  aiTab('local').click();
  await sleep(120);
  aiTab('cloud').click();
  await sleep(120);
  out.survivedTabSwitch = base ? base.value === 'http://127.0.0.1:9/v1' : false;
  tab('teaching').click();
  await sleep(150);
  out.leftSection = { panel: visiblePanels(), aiTabState: state.settingsAiTab };
  tab('ai').click();
  await sleep(150);
  out.survivedSectionSwitch = base ? base.value === 'http://127.0.0.1:9/v1' : false;
  out.aiPanelAfterReturning = shownAiPanels();

  // Only the selected tab is in the tab order, so the arrow keys are the keyboard path.
  aiTab('local').focus();
  aiTab('local').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  await sleep(150);
  out.arrowMoved = {
    focused: document.activeElement === aiTab('cloud'),
    aiPanels: shownAiPanels(),
    localTabIndex: aiTab('local').tabIndex,
    cloudTabIndex: aiTab('cloud').tabIndex
  };

  // The same keyboard path on the main strip: interface -> tasks.
  tab('interface').click();
  await sleep(150);
  tab('interface').focus();
  tab('interface').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  await sleep(900);
  out.sectionArrowMoved = {
    focused: document.activeElement === tab('tasks'),
    visible: visiblePanels(),
    state: state.settingsSection,
    taskList: ((document.querySelector('#aiTaskList') || {}).textContent || '').replace(/\s+/g, ' ').trim()
  };

  // A control inside a hidden panel is still saved: "Chữ lớn khi chơi" lives in Giao diện.
  out.interfaceHiddenBeforeSave = !panelShown('interface');
  const largeText = document.querySelector('#settingLargeText');
  const originalLargeText = largeText ? largeText.checked : true;
  out.expectedLargeText = !originalLargeText;
  if (largeText) largeText.checked = out.expectedLargeText;
  document.querySelector('#saveSettingsBtn').click();
  await sleep(1300);
  out.savedLargeText = ((await window.eduGame.getSettings()).preferences || {}).largeText;
  out.sectionAfterSave = state.settingsSection;
  out.visibleAfterSave = visiblePanels();
  out.tabAfterSave = { state: state.settingsAiTab, panels: shownAiPanels() };
  // Put the profile back the way it was found (fresh profiles default to true).
  const largeTextAfter = document.querySelector('#settingLargeText');
  if (largeTextAfter) largeTextAfter.checked = originalLargeText;
  document.querySelector('#saveSettingsBtn').click();
  await sleep(1100);

  // The loaders ran while their panels were hidden.
  out.diagnosticsInfoText = ((document.querySelector('#diagnosticsInfo') || {}).textContent || '').replace(/\s+/g, ' ').trim();
  out.diagnosticsHiddenNow = !panelShown('diagnostics');

  tab('diagnostics').click();
  await sleep(900);
  out.diagnosticsVisible = panelShown('diagnostics');
  out.diagnosticsListAfterOpen = ((document.querySelector('#diagnosticsInfo') || {}).textContent || '').replace(/\s+/g, ' ').trim();

  // There is no collapsed state to fall into: the open tab stays open.
  tab('diagnostics').click();
  await sleep(150);
  out.reclickKeeps = { visible: visiblePanels(), state: state.settingsSection };

  // Leaving the page and coming back keeps the teacher on the same tab.
  navigate('library');
  await sleep(180);
  navigate('settings');
  await sleep(700);
  out.afterReturn = visiblePanels();

  // Dark mode. The Tailwind dark-variant utilities never fire in this app (the toolchain
  // compiles that variant under prefers-color-scheme while the theme is applied as
  // [data-theme="dark"]), so a heading that hard-codes a light-theme ink comes out
  // near-black on a near-black card. The panel heading must inherit the card's own colour,
  // and the strip rule must be re-coloured by the hand-written selector.
  const savedTheme = (state.settings.preferences || {}).theme || 'light';
  const probePanel = document.querySelector('[data-settings-panel="diagnostics"]');
  applyTheme('dark');
  await sleep(300);
  out.darkProbe = {
    heading: getComputedStyle(probePanel.querySelector('h3')).color,
    cardInk: getComputedStyle(probePanel).color,
    stripRule: getComputedStyle(document.querySelector('.settings-tablist')).borderBottomColor,
    tabInk: getComputedStyle(document.querySelector('[data-settings-section="ai"]')).color
  };
  applyTheme(savedTheme);
  await sleep(200);

  return out;
})()`;

(async () => {
  const cdp = await connect();
  const out = await cdp.evaluate(SCENARIO);

  check('five tabs in the asked-for order', out.ids.join(',') === SECTIONS.join(','), out.ids.join(','));
  check('each tab is a role=tab wired to a real panel',
    out.tabRoles === 'tab,tab,tab,tab,tab' && out.controlsResolve === true && out.labelsResolve === true,
    `${out.tabRoles} / controls ${out.controlsResolve} / labels ${out.labelsResolve}`);
  check('the tab labels stay short and the panel headings carry the full titles',
    TAB_LABELS.every((label, index) => String(out.tabTexts[index] || '').includes(label))
      && PANEL_TITLES.every((title, index) => String(out.panelTitles[index] || '').includes(title)),
    `${out.tabTexts.join(' | ')} // ${out.panelTitles.join(' | ')}`);
  check('one tab is open on the first visit and it is the AI tab',
    out.defaultVisible.join(',') === 'ai' && out.defaultSelected.join(',') === 'ai'
      && out.panelCount === 5 && out.tabpanelCount === 7,
    `${out.defaultVisible.join(',')} / ${out.defaultSelected.join(',')} / panels ${out.panelCount} / tabpanels ${out.tabpanelCount}`);
  check('every panel body stays in the DOM while hidden',
    Object.values(out.controlsPresent).every(Boolean), JSON.stringify(out.controlsPresent));
  check('the AI tab carries one compact chip per sub-tab and the panel header spells them out',
    /monitor/.test(out.aiTabIcons) && /cloud/.test(out.aiTabIcons) && /Sẵn sàng|API key/.test(out.panelHeaderChips),
    `${out.aiTabIcons} // ${out.panelHeaderChips.slice(0, 80)}`);
  check('every chrome icon hook on the settings page is painted with a Lucide svg',
    out.iconHooks > 0 && out.unpaintedIcons === '', `${out.iconHooks} hooks / blank: ${out.unpaintedIcons}`);
  check('a hidden tab still shows its own state in the label',
    out.interfaceTabText.includes(out.themeLabel) && out.teachingTabText.includes(out.tone),
    `theme ${out.themeLabel} / tone ${out.tone}`);

  check('the AI panel holds exactly the two asked-for sub-tabs',
    out.aiTabIds.join(',') === 'local,cloud' && /AI local/.test(out.aiTabLabels[0]) && /AI cloud/.test(out.aiTabLabels[1]),
    `${out.aiTabIds.join(',')} / ${out.aiTabLabels.join(' | ')}`);
  check('AI local is the sub-tab shown on the first visit',
    out.aiTabSelected.join(',') === 'local' && out.defaultAiPanels.join(',') === 'local',
    `${out.aiTabSelected.join(',')} / ${out.defaultAiPanels.join(',')}`);
  check('the cloud sub-tab hides nothing: provider cards are rendered while it is off-screen',
    out.cardsWhileLocal === 4 && !out.cardIds.split(',').includes('local'),
    `${out.cardsWhileLocal} / ${out.cardIds}`);

  check('switching to AI cloud shows the providers and keeps the AI tab selected',
    out.afterCloudClick.panels.join(',') === 'ai' && out.afterCloudClick.aiPanels.join(',') === 'cloud'
      && out.afterCloudClick.selected.join(',') === 'cloud' && out.afterCloudClick.aiTabState === 'cloud'
      && out.afterCloudClick.cards === 4 && out.afterCloudClick.localHidden === true,
    JSON.stringify(out.afterCloudClick));
  check('the local sub-tab keeps its controls while off-screen',
    out.afterCloudClick.modelSelectStillThere === true && Object.values(out.localControlsWhileLocal).every(Boolean),
    JSON.stringify(out.afterCloudClick.modelSelectStillThere) + ' / ' + JSON.stringify(out.localControlsWhileLocal));

  check('typing then switching sub-tabs keeps the unsaved value', out.survivedTabSwitch === true, String(out.survivedTabSwitch));
  check('the selected sub-tab survives leaving and reopening its tab',
    out.leftSection.panel.join(',') === 'teaching' && out.leftSection.aiTabState === 'cloud'
      && out.survivedSectionSwitch === true && out.aiPanelAfterReturning.join(',') === 'cloud',
    JSON.stringify(out.leftSection) + ' / ' + out.aiPanelAfterReturning.join(','));
  check('the arrow keys move sub-tab selection and focus',
    out.arrowMoved.focused === true && out.arrowMoved.aiPanels.join(',') === 'cloud'
      && out.arrowMoved.localTabIndex === -1 && out.arrowMoved.cloudTabIndex === 0,
    JSON.stringify(out.arrowMoved));
  check('the arrow keys move between sections too',
    out.sectionArrowMoved.focused === true && out.sectionArrowMoved.visible.join(',') === 'tasks'
      && out.sectionArrowMoved.state === 'tasks'
      && /Trang \d+\/\d+|Chưa có tác vụ AI nào/.test(out.sectionArrowMoved.taskList),
    JSON.stringify({ ...out.sectionArrowMoved, taskList: out.sectionArrowMoved.taskList.slice(0, 40) }));

  check('saving reads a control inside a hidden panel',
    out.interfaceHiddenBeforeSave === true && out.savedLargeText === out.expectedLargeText,
    `${out.interfaceHiddenBeforeSave} / ${out.savedLargeText} vs ${out.expectedLargeText}`);
  check('the open tab and the selected sub-tab survive the save re-render',
    out.sectionAfterSave === 'tasks' && out.visibleAfterSave.join(',') === 'tasks'
      && out.tabAfterSave.state === 'cloud' && out.tabAfterSave.panels.join(',') === 'cloud',
    `${out.sectionAfterSave}/${out.visibleAfterSave.join(',')}/${JSON.stringify(out.tabAfterSave)}`);
  check('the diagnostics info still loads while its panel is hidden',
    out.diagnosticsHiddenNow === true && /Log trên máy|Không đọc được/.test(out.diagnosticsInfoText),
    out.diagnosticsInfoText.slice(0, 100));
  check('opening the diagnostics tab shows a refreshed summary',
    out.diagnosticsVisible === true && /Log trên máy|Không đọc được/.test(out.diagnosticsListAfterOpen),
    out.diagnosticsListAfterOpen.slice(0, 100));
  check('clicking the open tab keeps it open — no collapsed state exists',
    out.reclickKeeps.visible.join(',') === 'diagnostics' && out.reclickKeeps.state === 'diagnostics',
    JSON.stringify(out.reclickKeeps));
  check('the open tab is remembered when leaving and coming back',
    out.afterReturn.join(',') === 'diagnostics', out.afterReturn.join(','));
  check('the panel heading stays legible in dark mode — it inherits the card ink',
    out.darkProbe.heading === out.darkProbe.cardInk && out.darkProbe.heading !== 'rgb(30, 41, 59)',
    JSON.stringify(out.darkProbe));
  // #181 moved the unselected tab ink from #64748b (3,51:1 trên thẻ tối — không đạt sàn) lên
  // #9aa3bb (6,63:1), nên con số cũ ở đây không còn là mực của dark nữa.
  check('the strip rule and an unselected tab are re-coloured by [data-theme=dark]',
    out.darkProbe.stripRule === 'rgb(42, 50, 75)' && out.darkProbe.tabInk === 'rgb(154, 163, 187)',
    JSON.stringify(out.darkProbe));

  console.log(failures ? `\n${failures} check(s) failed` : '\nAll settings tab checks passed');
  cdp.ws.close();
  process.exit(failures ? 1 : 0);
})().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
