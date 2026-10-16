// @ts-nocheck -- migrated legacy UI logic; new contracts are typed in src/shared/types.ts.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('eduGame', Object.freeze({
  appInfo: () => ipcRenderer.invoke('app:info'),
  getLibrary: () => ipcRenderer.invoke('library:get'),
  saveGame: game => ipcRenderer.invoke('library:save-game', game),
  deleteGame: id => ipcRenderer.invoke('library:delete-game', id),
  saveSession: session => ipcRenderer.invoke('library:save-session', session),
  importDocument: () => ipcRenderer.invoke('files:import-document'),
  exportGame: game => ipcRenderer.invoke('files:export-game', game),
  importGame: () => ipcRenderer.invoke('files:import-game'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: settings => ipcRenderer.invoke('settings:save', settings),
  generateGame: payload => ipcRenderer.invoke('ai:generate', payload)
}));
