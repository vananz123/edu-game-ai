/*
 * Cửa sổ "Giới thiệu" (#188) — vòng đời window, theo đúng khuôn cửa sổ thứ hai
 * mà Presentation Mode đã dùng (src/presentation/presentation-manager.ts):
 * contextIsolation + sandbox, preload riêng, và không được điều hướng đi đâu
 * ngoài trang của chính nó.
 */

import { BrowserWindow } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let aboutWindow: BrowserWindow | null = null;

/** Preload chỉ mở `window.aboutAPI`, không phải `window.eduGame`. */
const PRELOAD_PATH = path.join(__dirname, 'about-preload.js');

/** Trang Giới thiệu nằm cạnh file này trong cả bản dev lẫn bản cài. */
const ABOUT_PAGE_PATH = path.join(__dirname, 'about.html');

/** URL file tuyệt đối của trang, dùng để chặn điều hướng. */
const ABOUT_PAGE_URL = pathToFileURL(ABOUT_PAGE_PATH).toString();

/** Chỉ trang của ta mới được phép nạp trong cửa sổ này. */
function isAboutPageUrl(target: string): boolean {
  try {
    const parsed = new URL(target);
    return parsed.protocol === 'file:'
      && `${parsed.protocol}//${parsed.host}${parsed.pathname}` === ABOUT_PAGE_URL;
  } catch {
    return false;
  }
}

/** Mở mới hoặc đưa cửa sổ đang có lên trước, đổi chủ đề nếu chủ đề đã khác. */
export function openAboutWindow(options?: { theme?: string }): BrowserWindow {
  const wanted = ABOUT_PAGE_URL + (options && options.theme === 'dark' ? '?theme=dark' : '');
  if (aboutWindow && !aboutWindow.isDestroyed()) {
    // Giáo viên bấm lại nút khi vừa đổi sang chủ đề tối thì cửa sổ đang mở phải
    // theo chủ đề mới, chứ không giữ nguyên bảng màu cũ.
    if (aboutWindow.webContents.getURL() !== wanted) aboutWindow.loadURL(wanted);
    if (aboutWindow.isMinimized()) aboutWindow.restore();
    aboutWindow.focus();
    return aboutWindow;
  }

  const win = new BrowserWindow({
    width: 820,
    height: 700,
    minWidth: 560,
    minHeight: 480,
    show: false,
    title: 'EduGame Studio — Giới thiệu',
    backgroundColor: '#f5f7fb',
    icon: path.join(__dirname, 'renderer', 'assets', 'app-icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  aboutWindow = win;

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
    if (!isAboutPageUrl(url)) event.preventDefault();
  });

  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    if (aboutWindow === win) aboutWindow = null;
  });

  // `?theme=dark` là tham số duy nhất được phép: trang đọc nó để bật bảng màu tối,
  // để cửa sổ không chói lên khi giáo viên đang dùng chủ đề tối cho máy chiếu.
  win.loadURL(wanted);
  return win;
}

export function getAboutWindow(): BrowserWindow | null {
  return aboutWindow && !aboutWindow.isDestroyed() ? aboutWindow : null;
}

export function isAboutOpen(): boolean {
  return getAboutWindow() !== null;
}

/** Đóng cửa sổ nếu đang mở (main.ts gọi khi ứng dụng thoát). */
export function closeAboutWindow(): void {
  const win = getAboutWindow();
  aboutWindow = null;
  if (win) win.destroy();
}
