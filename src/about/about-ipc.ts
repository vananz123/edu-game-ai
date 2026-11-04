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

/*
 * P0 đo khởi động: `electron-updater` (kèm `app-builder-bin`, `js-yaml`, zipfile…) tốn
 * ~123 ms `require` — chiếm ~8 % thời gian mở app — trong khi giáo viên chỉ mở trang
 * Giới thiệu vài lần mỗi tuần. Module adapter vì vậy nạp ở lần *dùng đầu tiên* chứ không
 * phải lúc đăng ký IPC; `registerAboutIpc()` chỉ còn gán handler.
 */
type UpdaterAdapter = typeof import('../services/update/update-electron-adapter');

/** Hủy đăng ký đẩy trạng thái khi ứng dụng thoát. */
let detachStateBridge: (() => void) | null = null;
/** Tùy chọn `initUpdater` do main.ts truyền xuống, giữ lại để dùng khi adapter nạp. */
let initOptions: { log?: (level: 'info' | 'warn' | 'error', event: string, data?: Record<string, unknown>) => void } | null = null;
let adapter: UpdaterAdapter | null = null;

/** Nạp `update-electron-adapter` (một lần) và khởi động updater ngay lúc đó. */
function updater(): UpdaterAdapter {
  if (adapter) return adapter;
  adapter = require('../services/update/update-electron-adapter') as UpdaterAdapter;
  const sink = initOptions && initOptions.log;
  adapter.initUpdater({
    releasePageUrl: EDUGAME_RELEASE_PAGE_URL,
    log: (level, message) => {
      if (!sink) return;
      const normalized = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info';
      sink(normalized, 'updater.event', { message: String(message).slice(0, 400) });
    }
  });
  // Cầu nối đẩy trạng thái chỉ có ý nghĩa khi updater đã sống; gắn ở đây nghĩa là
  // sự kiện đầu tiên (update-available/error) không bị rơi trước khi trang kịp nghe.
  if (!detachStateBridge) detachStateBridge = adapter.onUpdateState(broadcastToWindows);
  return adapter;
}

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
  initOptions = options || null;

  // Trang Giới thiệu mở ra là kiểm tra luôn: giáo viên vào trang này chính vì
  // muốn biết "đã có bản mới chưa", và chờ thêm một cái bấm nữa chỉ tạo cảm giác
  // trang đứng. Ngược lại, không kiểm tra khi khởi động — giờ vào lớp phải offline.
  ipcMain.handle(ABOUT_CHANNELS.OPEN, (_event, theme?: string) => {
    openAboutWindow({ theme: theme === 'dark' ? 'dark' : 'light' });
    const adapter = updater();
    // Không `await` ở đây: một nguồn cập nhật chậm (timeout mạng hàng chục giây) mà
    // chặn lời gọi này thì nút "Giới thiệu" trong sidebar có vẻ không ăn — đúng kiểu
    // "bấm không thấy gì" mà giáo viên vừa báo ở khung chat (#187).
    void adapter.requestUpdateCheck();
    return { ok: true, state: adapter.getUpdateState() };
  });

  ipcMain.handle(ABOUT_CHANNELS.INFO, (): AboutAppInfo => updater().readAppInfo());
  ipcMain.handle(ABOUT_CHANNELS.STATE, () => updater().getUpdateState());
  ipcMain.handle(ABOUT_CHANNELS.CHECK, () => updater().requestUpdateCheck());
  ipcMain.handle(ABOUT_CHANNELS.DOWNLOAD, () => updater().requestUpdateDownload());
  ipcMain.handle(ABOUT_CHANNELS.INSTALL, () => updater().requestUpdateInstall());
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
