/* Presentation window preload script: restricted API for the presentation renderer. */

const { contextBridge, ipcRenderer } = require('electron');

// Giai đoạn 2: renderer nói với façade, nên cửa sổ này chỉ expose ĐÚNG năm kênh
// của nhóm trình chiếu — đọc `src/shared/desktop-contract.json` chứ không viết lại
// tên kênh, để schema của façade và preload không thể lệch nhau.
const CONTRACT = require('../shared/desktop-contract.json');

const HANDLERS = {
  onPresentationState: callback => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on(CONTRACT.event.onPresentationState, listener);
    return () => ipcRenderer.removeListener(CONTRACT.event.onPresentationState, listener);
  },
  onPresentationExit: callback => {
    const listener = () => callback();
    ipcRenderer.on(CONTRACT.event.onPresentationExit, listener);
    return () => ipcRenderer.removeListener(CONTRACT.event.onPresentationExit, listener);
  },
  sendPresentationExit: payload => ipcRenderer.send(CONTRACT.send.sendPresentationExit, payload || {}),
  requestPresentationState: () => ipcRenderer.send(CONTRACT.send.requestPresentationState),
  sendPresentationState: state => ipcRenderer.send(CONTRACT.send.sendPresentationState, state),
};

const api = {};
for (const [name, handler] of Object.entries(HANDLERS)) {
  if (!CONTRACT.send[name] && !CONTRACT.event[name]) {
    throw new Error(`presentation-preload: ${name} không có trong desktop-contract.json`);
  }
  api[name] = handler;
}

contextBridge.exposeInMainWorld('eduGame', Object.freeze(api));