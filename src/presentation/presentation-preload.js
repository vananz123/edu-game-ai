/* Presentation window preload script: restricted API for the presentation renderer. */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('eduGame', Object.freeze({
  onPresentationState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('presentation:state-sync', listener);
    return () => ipcRenderer.removeListener('presentation:state-sync', listener);
  },
  onPresentationExit: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('presentation:exit', listener);
    return () => ipcRenderer.removeListener('presentation:exit', listener);
  },
  sendPresentationExit: (payload) => ipcRenderer.send('presentation:exit', payload || {}),
  requestPresentationState: () => ipcRenderer.send('presentation:request-state'),
  sendPresentationState: state => ipcRenderer.send('presentation:state-update', state),
}));