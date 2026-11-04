/*
 * Preload của cửa sổ "Giới thiệu" (#188) — only `require('electron')` is available
 * here: the window runs with `sandbox: true`, so requiring any local module would
 * abort the preload and leave `window.aboutAPI` undefined (same trap as the note
 * at the top of src/preload.ts).
 *
 * Máy trạng thái nằm ở main. Ở đây chỉ có hai loại cầu: lời gọi đi (kiểm tra, tải,
 * cài) và một kênh đẩy về (`about:state-push`) mà bốn tên sự kiện trong spec
 * (update-available / download-progress / update-downloaded / error) lọc ra từ đó.
 */

const { contextBridge, ipcRenderer } = require('electron');

const CHANNELS = {
  info: 'about:info',
  state: 'about:state',
  check: 'about:check',
  download: 'about:download',
  install: 'about:install',
  openReleases: 'about:open-releases',
  push: 'about:state-push'
};

/** Đăng ký một bộ lọc trên kênh đẩy duy nhất; trả về hàm hủy đăng ký. */
function subscribe(Phases, callback) {
  const listener = (_event, state) => {
    if (!state) return;
    if (Phases && Phases.indexOf(state.phase) === -1) return;
    callback(state);
  };
  ipcRenderer.on(CHANNELS.push, listener);
  return () => ipcRenderer.removeListener(CHANNELS.push, listener);
}

contextBridge.exposeInMainWorld('aboutAPI', Object.freeze({
  /** Tên, phiên bản, tác giả, mô tả, đường dẫn dữ liệu… để trang vẽ phần thông tin. */
  getAppInfo: () => ipcRenderer.invoke(CHANNELS.info),

  /** Bản chụp trạng thái ngay khi trang mở ra (khỏi chờ lần đẩy đầu tiên). */
  getState: () => ipcRenderer.invoke(CHANNELS.state),

  /** "Kiểm tra cập nhật". */
  checkForUpdates: () => ipcRenderer.invoke(CHANNELS.check),

  /** "Tải về và cập nhật" — main từ chối nếu trạng thái chưa cho phép. */
  startDownload: () => ipcRenderer.invoke(CHANNELS.download),

  /** "Khởi động lại để cài". */
  installAndRestart: () => ipcRenderer.invoke(CHANNELS.install),

  /** Mở trang phát hành trên trình duyệt của giáo viên. */
  openReleases: (url) => ipcRenderer.invoke(CHANNELS.openReleases, url),

  /** Kênh đầy đủ: mọi đổi pha đều đẩy về, trang Giới thiệu vẽ từ đây. */
  onUpdateState: (callback) => subscribe(null, callback),

  /** Dưới đây là bốn tên trong spec; mỗi cái chỉ bắn khi đúng pha của nó. */
  onUpdateAvailable: (callback) => subscribe(['available'], callback),
  onDownloadProgress: (callback) => subscribe(['downloading'], callback),
  onUpdateDownloaded: (callback) => subscribe(['downloaded'], callback),
  onUpdateError: (callback) => subscribe(['error'], callback)
}));
