// @ts-nocheck -- migrated legacy UI logic; new contracts are typed in src/shared/types.ts.
function render() {
  // Step 1 of the wizard re-renders the whole page on every tick, tab switch
  // and debounced preview; keep the structure tree's scroll offsets so it does
  // not jump back to its first row.
  if (state.page === 'create-wizard' && typeof wizardStructureCaptureView === 'function') wizardStructureCaptureView();
  $('#pageCrumb').textContent = pageNames[state.page] || 'EduGame Studio';
  $$('.nav-item[data-page]').forEach(el => el.classList.toggle('active', el.dataset.page === state.page));
  $('#navGameCount').textContent = state.db.games.length;
  const renderers = { home: renderHome, library: renderLibrary, 'create-wizard': renderCreateWizard, create: renderCreate, 'lesson-plans': renderLessonPlans, 'my-projects': renderMyProjects, sessions: renderSessions, settings: renderSettings };
  $('#pageContent').innerHTML = (renderers[state.page] || renderHome)();
  wirePage();
  // `innerHTML` cannot express `indeterminate`; re-apply the derived tristate.
  if (state.page === 'create-wizard' && wizardState.step === 'input' && typeof wizardSyncStructureCheckboxes === 'function') wizardSyncStructureCheckboxes();
  if (typeof window.refreshAiStatusBar === "function") window.refreshAiStatusBar();
}
