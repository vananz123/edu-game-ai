// @ts-nocheck -- migrated legacy UI logic; new contracts are typed in src/shared/types.ts.
const { contextBridge, ipcRenderer } = require('electron');

/* NOTE: this preload runs with `sandbox: true` (src/main.ts), so it can only
   `require('electron')`. Requiring any local module here throws, the whole
   preload aborts, and `window.eduGame` silently becomes undefined - which
   breaks every IPC feature in the app. Keep all data on the IPC side. */

contextBridge.exposeInMainWorld('eduGame', Object.freeze({
  appInfo: () => ipcRenderer.invoke('app:info'),
  getLibrary: () => ipcRenderer.invoke('library:get'),
  saveGame: game => ipcRenderer.invoke('library:save-game', game),
  deleteGame: id => ipcRenderer.invoke('library:delete-game', id),
  saveSession: session => ipcRenderer.invoke('library:save-session', session),
  saveLessonDocument: payload => ipcRenderer.invoke('lesson:save-document', payload),
  getLessonDocument: documentId => ipcRenderer.invoke('lesson:get-document', documentId),
  listLessonLibrary: () => ipcRenderer.invoke('lesson:library'),
  saveProjectDraft: project => ipcRenderer.invoke('project:save-draft', project),
  getProject: projectId => ipcRenderer.invoke('project:get', projectId),
  listProjects: () => ipcRenderer.invoke('project:list'),
  deleteProject: projectId => ipcRenderer.invoke('project:delete', projectId),
  importDocument: () => ipcRenderer.invoke('files:import-document'),
  importDocumentFromPath: filePath => ipcRenderer.invoke('files:import-document-from-path', filePath),
  setFullscreen: enabled => ipcRenderer.invoke('window:set-fullscreen', enabled),
  onFullscreenChanged: callback => {
    const listener = (_event, enabled) => callback(Boolean(enabled));
    ipcRenderer.on('window:fullscreen-changed', listener);
    return () => ipcRenderer.removeListener('window:fullscreen-changed', listener);
  },
  importQuestions: () => ipcRenderer.invoke('files:import-questions'),
  exportGame: game => ipcRenderer.invoke('files:export-game', game),
  importGame: () => ipcRenderer.invoke('files:import-game'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: settings => ipcRenderer.invoke('settings:save', settings),
  getLocalAiModels: () => ipcRenderer.invoke('ai:local-models'),
  getLocalRuntimeStatus: () => ipcRenderer.invoke('ai:local-status'),
  installLocalAiModel: modelId => ipcRenderer.invoke('ai:install-local-model', modelId),
  startLocalRuntime: modelId => ipcRenderer.invoke('ai:start-local-runtime', modelId),
  stopLocalRuntime: () => ipcRenderer.invoke('ai:stop-local-runtime'),
  cancelAi: requestId => ipcRenderer.invoke('ai:cancel', requestId),
  listAiTasks: payload => ipcRenderer.invoke('ai:tasks', payload || {}),
  verifyCpuRuntime: () => ipcRenderer.invoke('ai:runtime-verify'),
  getSetupStatus: () => ipcRenderer.invoke('setup:status'),
  preflightSetup: payload => ipcRenderer.invoke('setup:preflight', payload || {}),
  startSetup: payload => ipcRenderer.invoke('setup:start', payload || {}),
  cancelSetup: () => ipcRenderer.invoke('setup:cancel'),
  onSetupProgress: callback => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('setup:progress', listener);
    return () => ipcRenderer.removeListener('setup:progress', listener);
  },
  exportDiagnostics: () => ipcRenderer.invoke('diagnostics:export'),
  diagnosticsInfo: () => ipcRenderer.invoke('diagnostics:info'),
  clearDiagnostics: () => ipcRenderer.invoke('diagnostics:clear'),
  openDiagnosticsFolder: () => ipcRenderer.invoke('diagnostics:open-folder'),
  analyzeLesson: payload => ipcRenderer.invoke('lesson:analyze', payload),
  // #76: offline document structure + selection preview. Both are pure and
  // local; neither touches a model or the network.
  inspectLessonStructure: payload => ipcRenderer.invoke('lesson:get-structure', payload),
  previewLessonSelection: payload => ipcRenderer.invoke('lesson:preview-selection', payload),
  answerLessonQuestion: payload => ipcRenderer.invoke('lesson:answer-question', payload),
  recommendGames: payload => ipcRenderer.invoke('lesson:recommend', payload),
  estimateLessonCapacity: payload => ipcRenderer.invoke('lesson:capacity', payload),
  getLessonAnalysis: analysisId => ipcRenderer.invoke('lesson:get-analysis', analysisId),
  saveLessonAnalysis: analysis => ipcRenderer.invoke('lesson:save-analysis', analysis),
  getLessonRecommendations: analysisId => ipcRenderer.invoke('lesson:recommendations', analysisId),
  generateLessonDraft: payload => ipcRenderer.invoke('lesson:generate', payload),
  regenerateLessonItem: payload => ipcRenderer.invoke('lesson:regenerate-item', payload),
  checkLessonQuality: payload => ipcRenderer.invoke('lesson:quality', payload),
  patchLessonItemAssets: payload => ipcRenderer.invoke('lesson:patch-item-assets', payload),
  onLocalAiProgress: callback => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('ai:local-progress', listener);
    return () => ipcRenderer.removeListener('ai:local-progress', listener);
  },
  onLessonProgress: callback => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('lesson:progress', listener);
    return () => ipcRenderer.removeListener('lesson:progress', listener);
  },
  generateGame: payload => ipcRenderer.invoke('ai:generate', payload),

  // Presentation Mode API
  startPresentation: state => ipcRenderer.invoke('presentation:start', state),
  stopPresentation: () => ipcRenderer.invoke('presentation:stop'),
  togglePresentation: state => ipcRenderer.invoke('presentation:toggle', state),
  getDisplays: () => ipcRenderer.invoke('presentation:displays'),
  onPresentationState: callback => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('presentation:state-sync', listener);
    return () => ipcRenderer.removeListener('presentation:state-sync', listener);
  },
  onPresentationExit: callback => {
    const listener = () => callback();
    ipcRenderer.on('presentation:exit', listener);
    return () => ipcRenderer.removeListener('presentation:exit', listener);
  },
  sendPresentationExit: payload => ipcRenderer.send('presentation:exit', payload || {}),
  requestPresentationState: () => ipcRenderer.send('presentation:request-state'),
  sendPresentationState: state => ipcRenderer.send('presentation:state-update', state),
}));
