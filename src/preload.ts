// @ts-nocheck -- migrated legacy UI logic; new contracts are typed in src/shared/types.ts.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('eduGame', Object.freeze({
  appInfo: () => ipcRenderer.invoke('app:info'),
  getLibrary: () => ipcRenderer.invoke('library:get'),
  saveGame: game => ipcRenderer.invoke('library:save-game', game),
  deleteGame: id => ipcRenderer.invoke('library:delete-game', id),
  saveSession: session => ipcRenderer.invoke('library:save-session', session),
  saveLessonDocument: payload => ipcRenderer.invoke('lesson:save-document', payload),
  getLessonDocument: documentId => ipcRenderer.invoke('lesson:get-document', documentId),
  saveProjectDraft: project => ipcRenderer.invoke('project:save-draft', project),
  getProject: projectId => ipcRenderer.invoke('project:get', projectId),
  listProjects: () => ipcRenderer.invoke('project:list'),
  deleteProject: projectId => ipcRenderer.invoke('project:delete', projectId),
  importDocument: () => ipcRenderer.invoke('files:import-document'),
  importQuestions: () => ipcRenderer.invoke('files:import-questions'),
  exportGame: game => ipcRenderer.invoke('files:export-game', game),
  importGame: () => ipcRenderer.invoke('files:import-game'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: settings => ipcRenderer.invoke('settings:save', settings),
  assistWithDocument: request => ipcRenderer.invoke('ai:document-assist', request),
  getLocalAiModels: () => ipcRenderer.invoke('ai:local-models'),
  getLocalRuntimeStatus: () => ipcRenderer.invoke('ai:local-status'),
  installLocalAiModel: modelId => ipcRenderer.invoke('ai:install-local-model', modelId),
  startLocalRuntime: modelId => ipcRenderer.invoke('ai:start-local-runtime', modelId),
  stopLocalRuntime: () => ipcRenderer.invoke('ai:stop-local-runtime'),
  cancelAi: requestId => ipcRenderer.invoke('ai:cancel', requestId),
  analyzeLesson: payload => ipcRenderer.invoke('lesson:analyze', payload),
  recommendGames: payload => ipcRenderer.invoke('lesson:recommend', payload),
  getLessonAnalysis: analysisId => ipcRenderer.invoke('lesson:get-analysis', analysisId),
  saveLessonAnalysis: analysis => ipcRenderer.invoke('lesson:save-analysis', analysis),
  getLessonRecommendations: analysisId => ipcRenderer.invoke('lesson:recommendations', analysisId),
  generateLessonDraft: payload => ipcRenderer.invoke('lesson:generate', payload),
  checkLessonQuality: payload => ipcRenderer.invoke('lesson:quality', payload),
  onLocalAiProgress: callback => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('ai:local-progress', listener);
    return () => ipcRenderer.removeListener('ai:local-progress', listener);
  },
  generateGame: payload => ipcRenderer.invoke('ai:generate', payload)
}));
