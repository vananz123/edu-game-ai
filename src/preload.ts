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
  deleteGames: gameIds => ipcRenderer.invoke('library:delete-games', gameIds),
  saveSession: session => ipcRenderer.invoke('library:save-session', session),
  deleteSessions: sessionIds => ipcRenderer.invoke('library:delete-sessions', sessionIds),
  saveLessonDocument: payload => ipcRenderer.invoke('lesson:save-document', payload),
  getLessonDocument: documentId => ipcRenderer.invoke('lesson:get-document', documentId),
  listLessonLibrary: () => ipcRenderer.invoke('lesson:library'),
  deleteLessonDocument: documentId => ipcRenderer.invoke('lesson:delete-document', documentId),
  deleteLessonDocuments: documentIds => ipcRenderer.invoke('lesson:delete-documents', documentIds),
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
  // #132: provider state + the real, minimal connection test. Both answer with the
  // key-free settings view; the key itself never crosses into this context.
  getAiProviders: () => ipcRenderer.invoke('ai:providers'),
  testAiProvider: payload => ipcRenderer.invoke('ai:test-provider', payload || {}),
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
  classifyLessonInput: payload => ipcRenderer.invoke('lesson:classify-input', payload),
  convertLessonDraft: payload => ipcRenderer.invoke('lesson:convert-draft', payload),
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
  importIllustration: sourcePath => ipcRenderer.invoke('files:import-illustration', sourcePath),
  deleteIllustration: imageId => ipcRenderer.invoke('files:delete-illustration', imageId),
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

  // LAN Classroom Mode API. Channels mirror LAN_CHANNELS in src/shared/lan-types.ts;
  // this file runs sandboxed and cannot import it, so the literals are repeated.
  lanStart: payload => ipcRenderer.invoke('lan:start', payload),
  lanStop: () => ipcRenderer.invoke('lan:stop'),
  lanAssignTeam: payload => ipcRenderer.invoke('lan:assign-team', payload),
  lanBegin: () => ipcRenderer.invoke('lan:begin'),
  lanNext: () => ipcRenderer.invoke('lan:next'),
  lanFinish: () => ipcRenderer.invoke('lan:finish'),
  onLanState: callback => {
    const listener = (_event, snapshot) => callback(snapshot);
    ipcRenderer.on('lan:state', listener);
    return () => ipcRenderer.removeListener('lan:state', listener);
  },
}));
