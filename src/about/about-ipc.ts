/*
 * IPC của cửa sổ Giới thiệu + bộ cập nhật (#188). Theo khuôn
 * src/presentation/presentation-ipc.ts: main.ts chỉ gọi register/unregister, còn
 * toàn bộ kênh nằm ở đây.
 *
 * Trang Giới thiệu là cửa sổ sandbox, chỉ có `window.aboutAPI` (about-preload.js).
 * Vì vậy mọi quyết định "được bấm gì lúc này" đều đã nằm trong máy trạng thái ở
 * main; trang chỉ vẽ lại.
 */

import { BrowserWindow, ipcMain, shell } from 'electron';
import {
  ABOUT_CHANNELS,
  EDUGAME_RELEASE_PAGE_URL,
  type AboutActionResult,
  type AboutAppInfo
} from '../shared/about-types';
import { closeAboutWindow, openAboutWindow } from './about-manager';
import {
  getUpdateState,
  initUpdater,
  onUpdateState,
  readAppInfo,
  requestUpdateCheck,
  requestUpdateDownload,
  requestUpdateInstall
} from '../services/update/update-electron-adapter';

/** Hủy đăng ký đẩy trạng thái khi ứng dụng thoát. */
let detachStateBridge: (() => void) | null = null;

/**
 * `https://github.com/<chủ sở hữu>/<repo>/releases` — không hơn. Trang chỉ được
 * mở đúng một host, để một lỗi ở chuỗi cấu hình không biến nút này thành đường
 * ra trang lạ.
 */
function isAllowedReleasePage(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === 'github.com';
  } catch {
    return false;
  }
}

/** Đẩy trạng thái mới nhất vào cửa sổ Giới thiệu và cửa sổ chính. */
function broadcastToWindows(state: AboutActionResult['state']): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed() || win.webContents.isDestroyed()) continue;
    win.webContents.send(ABOUT_CHANNELS.STATE_PUSH, state);
  }
}

export function registerAboutIpc(options?: {
  log?: (level: 'info' | 'warn' | 'error', event: string, data?: Record<string, unknown>) => void;
}): void {
  initUpdater({
    releasePageUrl: EDUGAME_RELEASE_PAGE_URL,
    log: (level, message) => {
      const sink = options && options.log;
      if (!sink) return;
      const normalized = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info';
      sink(normalized, 'updater.event', { message: String(message).slice(0, 400) });
    }
  });

  // Trang Giới thiệu mở ra là kiểm tra luôn: giáo viên vào trang này chính vì
  // muốn biết "đã có bản mới chưa", và chờ thêm một cái bấm nữa chỉ tạo cảm giác
  // trang đứng. Ngược lại, không kiểm tra khi khởi động — giờ vào lớp phải offline.
  ipcMain.handle(ABOUT_CHANNELS.OPEN, (_event, theme?: string) => {
    openAboutWindow({ theme: theme === 'dark' ? 'dark' : 'light' });
    // Không `await` ở đây: một nguồn cập nhật chậm (timeout mạng hàng chục giây) mà
    // chặn lời gọi này thì nút "Giới thiệu" trong sidebar có vẻ không ăn — đúng kiểu
    // "bấm không thấy gì" mà giáo viên vừa báo ở khung chat (#187).
    void requestUpdateCheck();
    return { ok: true, state: getUpdateState() };
  });

  ipcMain.handle(ABOUT_CHANNELS.INFO, (): AboutAppInfo => readAppInfo());
  ipcMain.handle(ABOUT_CHANNELS.STATE, () => getUpdateState());
  ipcMain.handle(ABOUT_CHANNELS.CHECK, () => requestUpdateCheck());
  ipcMain.handle(ABOUT_CHANNELS.DOWNLOAD, () => requestUpdateDownload());
  ipcMain.handle(ABOUT_CHANNELS.INSTALL, () => requestUpdateInstall());
  ipcMain.handle(ABOUT_CHANNELS.OPEN_RELEASES, async (_event, url?: string) => {
    const target = String(url || EDUGAME_RELEASE_PAGE_URL);
    if (!isAllowedReleasePage(target)) return { ok: false, error: 'Địa chỉ trang phát hành không hợp lệ.' };
    try {
      await shell.openExternal(target);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: String((error && (error as Error).message) || error) };
    }
  });

  if (!detachStateBridge) detachStateBridge = onUpdateState(broadcastToWindows);
}

export function unregisterAboutIpc(): void {
  for (const channel of Object.values(ABOUT_CHANNELS)) {
    if (channel === ABOUT_CHANNELS.STATE_PUSH) continue;
    ipcMain.removeHandler(channel);
  }
  if (detachStateBridge) {
    detachStateBridge();
    detachStateBridge = null;
  }
  closeAboutWindow();
}
