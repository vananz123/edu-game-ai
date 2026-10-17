// @ts-nocheck -- migrated legacy UI logic; new contracts are typed in src/shared/types.ts.
function render() {
  $('#pageCrumb').textContent = pageNames[state.page] || 'EduGame Studio';
  $$('.nav-item[data-page]').forEach(el => el.classList.toggle('active', el.dataset.page === state.page));
  $('#navGameCount').textContent = state.db.games.length;
  const renderers = { home: renderHome, library: renderLibrary, create: renderCreate, 'lesson-plans': renderLessonPlans, 'my-projects': renderMyProjects, sessions: renderSessions, settings: renderSettings };
  $('#pageContent').innerHTML = (renderers[state.page] || renderHome)();
  wirePage();
}
