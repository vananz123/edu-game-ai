/*
 * Nối electron-updater (main process) với máy trạng thái thuần ở `update-policy.ts`.
 *
 * Ba quyết định không hiển nhiên, ghi lại ở đây vì chúng đổi hành vi mà giáo viên
 * cảm nhận được (#188):
 *  - `autoDownload = false`: bản mới chỉ tải khi bấm nút. Tự tải lúc đang tiết học
 *    là tự chiếm băng thông và ô đĩa mà giáo viên không biết.
 *  - `autoInstallOnAppQuit = false`: electron-updater mặc định tự cài khi ứng dụng
 *    thoát. Với lớp học thì "tắt máy sau buổi học" bỗng thành "sáng mai phần mềm
 *    khác đi"; mọi lần cài đều phải do người lớn bấm.
 *  - `allowPrerelease = false`: bản beta/alpha không được đẩy về máy giáo viên.
 *
 * Bản đang chạy kiểu `npm start` (không phải bộ cài) thì electron-updater bỏ qua
 * việc kiểm tra và `checkForUpdates()` trả về `null` — ta dịch ra trạng thái
 * `dev-mode` để trang Giới thiệu nói thẳng, thay vì để vòng "đang kiểm tra…" quay mãi.
 */

import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { autoUpdater } from 'electron-updater';
import {
  EDUGAME_DESCRIPTION,
  EDUGAME_RELEASE_PAGE_URL,
  type AboutActionResult,
  type AboutAppInfo,
  type UpdateState
} from '../../shared/about-types';
import {
  canDownloadUpdate,
  canInstallUpdate,
  createUpdateState,
  reduceUpdateState,
  type UpdateEvent
} from './update-policy';

/** Tệp electron-builder sinh ra khi chạy dev; có nó thì bản dev mới thử được feed. */
const DEV_FEED_FILE = 'dev-app-update.yml';

let state: UpdateState = createUpdateState(app.getVersion());
let initialised = false;
let checkInFlight = false;
let installRequested = false;
let releasePageUrl = EDUGAME_RELEASE_PAGE_URL;
let logSink: ((level: string, message: string) => void) | null = null;

const stateListeners = new Set<(state: UpdateState) => void>();

function log(level: string, message: string): void {
  if (logSink) {
    try {
      logSink(level, message);
      return;
    } catch {
      // Log hỏng không được làm hỏng cả bộ cập nhật.
    }
  }
  // eslint-disable-next-line no-console
  console[level === 'error' ? 'error' : 'log'](`[updater] ${message}`);
}

/** `feed dev` = repo có `dev-app-update.yml`; chỉ có tác dụng khi chưa đóng gói. */
function devFeedPresent(): boolean {
  try {
    return fs.existsSync(path.join(app.getAppPath(), DEV_FEED_FILE));
  } catch {
    return false;
  }
}

function apply(event: UpdateEvent): UpdateState {
  state = reduceUpdateState(state, event);
  broadcast();
  return state;
}

function broadcast(): void {
  for (const listener of stateListeners) {
    try {
      listener(state);
    } catch (error) {
      log('error', `state listener failed: ${(error && (error as Error).message) || error}`);
    }
  }
}

/** Đọc package.json cho những trường chỉ có ở đó (tác giả, giấy phép). */
function readPackageField(key: 'author' | 'license', fallback: string): string {
  try {
    const raw = fs.readFileSync(path.join(app.getAppPath(), 'package.json'), 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const value = parsed?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    // `author` trong package.json cũng có dạng { name, email }.
    if (value && typeof value === 'object') {
      const name = (value as Record<string, unknown>).name;
      if (typeof name === 'string' && name.trim()) return name.trim();
    }
    return fallback;
  } catch {
    return fallback;
  }
}

export function readAppInfo(): AboutAppInfo {
  return {
    name: 'EduGame Studio',
    version: app.getVersion(),
    description: EDUGAME_DESCRIPTION,
    author: readPackageField('author', 'EduGame Studio'),
    license: readPackageField('license', 'MIT'),
    packaged: Boolean(app.isPackaged),
    electron: process.versions.electron || '',
    chrome: process.versions.chrome || '',
    node: process.versions.node || '',
    platform: process.platform,
    arch: process.arch,
    userDataPath: app.getPath('userData'),
    releasePageUrl
  };
}

export function getUpdateState(): UpdateState {
  return state;
}

/** Cho `about-ipc.ts` đăng ký đẩy trạng thái vào các cửa sổ. */
export function onUpdateState(listener: (state: UpdateState) => void): () => void {
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
}

/**
 * Đăng ký một lần cho cả đời ứng dụng. Không gọi `checkForUpdates()` ở đây: tự
 * kiểm tra lúc khởi động sẽ phát sinh request ra ngoài ngay trước giờ vào lớp,
 * trong khi cổng `check:offline-packaged` đòi 0 request khi chơi.
 */
export function initUpdater(options?: { releasePageUrl?: string; log?: (level: string, message: string) => void }): void {
  if (options && typeof options.log === 'function') logSink = options.log;
  if (options && options.releasePageUrl) releasePageUrl = options.releasePageUrl;
  if (initialised) return;
  initialised = true;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.disableWebInstaller = true;
  // electron-updater tự xác minh chữ ký Authenticode khi `publisherName` có trong
  // app-update.yml. Bản dựng chưa ký thì không khai báo publisherName: mã verification
  // bật sẵn, và `latest.yml` vẫn được kiểm sha512.
  autoUpdater.logger = {
    info: (message: unknown) => log('info', String(message)),
    warn: (message: unknown) => log('warn', String(message)),
    error: (message: unknown) => log('error', String(message)),
    debug: (message: unknown) => log('debug', String(message))
  } as never;

  state = createUpdateState(app.getVersion());

  autoUpdater.on('update-available', info => {
    log('info', `update available: ${info && info.version}`);
    apply({ type: 'update-available', version: String((info && info.version) || '') });
  });
  autoUpdater.on('update-not-available', info => {
    apply({ type: 'update-not-available', version: String((info && info.version) || '') });
  });
  autoUpdater.on('download-progress', progress => {
    apply({
      type: 'download-progress',
      percent: progress && progress.percent,
      transferred: progress && progress.transferred,
      total: progress && progress.total,
      bytesPerSecond: progress && progress.bytesPerSecond
    });
  });
  autoUpdater.on('update-downloaded', (...args: unknown[]) => {
    // electron-updater đổi chữ ký event này qua nhiều bản: có nơi là UpdateInfo,
    // có nơi là (version, releaseNotes, releaseName, releaseDate, info).
    const first = args[0];
    const version = typeof first === 'string'
      ? first
      : String((first as { version?: string } | null)?.version || state.newVersion || '');
    log('info', `update downloaded: ${version}`);
    apply({ type: 'update-downloaded', version });
  });
  autoUpdater.on('error', error => {
    const message = (error && ((error as Error).message || String(error))) || 'lỗi không xác định';
    log('error', `updater error: ${message}`);
    apply({ type: 'error', message });
  });
}

/** Một lượt kiểm tra; `checkInFlight` chặn hai lần bấm liên tiếp chất đống request. */
export async function requestUpdateCheck(): Promise<AboutActionResult> {
  if (!initialised) initUpdater();
  if (checkInFlight) return { ok: true, state };

  apply({ type: 'check-started' });
  checkInFlight = true;
  try {
    // Đọc lại mỗi lần bấm: bài kiểm tra CDP ghi `dev-app-update.yml` *sau* khi ứng
    // dụng đã khởi động, và một bản dev có feed giả phải thử được như bản cài.
    autoUpdater.forceDevUpdateConfig = !app.isPackaged && devFeedPresent();
    // `checkForUpdatesAndNotify` với autoDownload=false không bao giờ tới nhánh
    // hiện thông báo hệ thống (không có downloadPromise) — thông báo nằm ở trang
    // Giới thiệu, không chiếm màn hình lúc đang giảng.
    const result = await autoUpdater.checkForUpdatesAndNotify();
    apply(result ? { type: 'check-settled' } : { type: 'check-ignored' });
  } catch (error) {
    apply({ type: 'error', message: String((error && (error as Error).message) || error || '') });
  } finally {
    checkInFlight = false;
  }
  return { ok: state.phase !== 'error', state };
}

/** Tải bộ cài của bản mới — chỉ khi máy trạng thái cho phép. */
export async function requestUpdateDownload(): Promise<AboutActionResult> {
  if (!initialised) initUpdater();
  if (!canDownloadUpdate(state)) {
    return { ok: false, state, error: 'Không có bản cập nhật nào để tải.' };
  }
  apply({ type: 'download-started' });
  try {
    await autoUpdater.downloadUpdate();
  } catch (error) {
    apply({ type: 'error', message: String((error && (error as Error).message) || error || '') });
  }
  return { ok: state.phase !== 'error', state };
}

/**
 * Khởi động lại và chạy bộ cài đã tải. Không bảo vệ khỏi lần bấm thứ hai bằng
 * máy trạng thái (ứng dụng sắp chết), mà bằng cờ: bấm đúp là mở hai wizard cài đặt.
 */
export function requestUpdateInstall(): AboutActionResult {
  if (!initialised) initUpdater();
  if (installRequested) return { ok: true, state };
  if (!canInstallUpdate(state)) {
    return { ok: false, state, error: 'Chưa tải xong bản cập nhật nên chưa cài được.' };
  }
  installRequested = true;
  try {
    // isSilent=false: bản này là NSIS trợ giúp (oneClick:false), người dùng cần xem
    // và bấm Tiếp; wizard tự khởi động lại ứng dụng sau khi cài xong.
    autoUpdater.quitAndInstall(false, true);
  } catch (error) {
    installRequested = false;
    apply({ type: 'error', message: String((error && (error as Error).message) || error || '') });
    return { ok: false, state, error: 'Không khởi động bộ cài được.' };
  }
  return { ok: true, state };
}
