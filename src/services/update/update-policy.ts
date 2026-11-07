/*
 * Máy trạng thái của bộ cập nhật tự động (#188) — THUẦN: không Electron, không DOM,
 * không mạng. `update-electron-adapter.ts` đưa từng kiện của electron-updater vào
 * `reduceUpdateState`, còn trang Giới thiệu chỉ vẽ bản `UpdateState` nó nhận về.
 *
 * Vì sao tách riêng: toàn bộ phần khó của tự cập nhật không nằm ở việc gọi
 * electron-updater mà ở chỗ biết *lúc nào được phép bấm gì* — một bản tải dở rồi
 * lỗi vẫn phải cho tải lại, một lần kiểm tra lại không được xoá mất nút "Khởi động
 * lại để cài", và một nguồn cập nhật trỏ đúng phiên bản đang chạy thì không phải
 * "bản mới". Những luật đó test được ở đây, không cần bộ cài thật.
 */

import type { UpdateErrorKind, UpdatePhase, UpdateState } from '../../shared/about-types';

/** Một kiện đi vào máy trạng thái. */
export type UpdateEvent =
  | { type: 'check-started' }
  /** `checkForUpdates()` trả về `null`: ứng dụng không chạy từ bộ cài. */
  | { type: 'check-ignored' }
  /** Kiểm tra xong mà không có kiện nào (nguồn lạ, thông tin thiếu). */
  | { type: 'check-settled' }
  | { type: 'update-not-available'; version?: string }
  | { type: 'update-available'; version: string }
  | { type: 'download-started' }
  | {
      type: 'download-progress';
      percent?: number;
      transferred?: number;
      total?: number;
      bytesPerSecond?: number;
    }
  | { type: 'update-downloaded'; version: string }
  | { type: 'error'; message: string }
  | { type: 'reset' };

/** Phiên bản ban đầu, chưa kiểm tra lần nào. */
export function createUpdateState(currentVersion: string): UpdateState {
  return {
    phase: 'idle',
    currentVersion: String(currentVersion || '0.0.0'),
    newVersion: '',
    progressPercent: 0,
    transferredBytes: 0,
    totalBytes: 0,
    bytesPerSecond: 0,
    errorKind: '',
    errorMessage: '',
    lastCheckedAt: 0,
    downloadStartedAt: 0
  };
}

/** `v0.4.0`, `0.4`, `0.4.0-beta.1+build.7` → các thành phần số + cờ pre-release. */
export function parseVersion(text: unknown): { major: number; minor: number; patch: number; prerelease: boolean } | null {
  const cleaned = String(text == null ? '' : text).trim().replace(/^v/i, '');
  const match = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec(cleaned);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3] || 0),
    prerelease: /[-.](?:beta|alpha|rc|dev|preview)/i.test(cleaned)
  };
}

/** -1 / 0 / 1; hai bên không so được thì trả về `null` chứ không đoán. */
export function compareVersions(candidate: unknown, current: unknown): number | null {
  const a = parseVersion(candidate);
  const b = parseVersion(current);
  if (!a || !b) return null;
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (a[key] !== b[key]) return a[key] > b[key] ? 1 : -1;
  }
  // Cùng bộ ba số: bản có hậu tố beta/alpha không bao giờ "mới hơn" bản phát hành.
  if (a.prerelease && !b.prerelease) return -1;
  if (!a.prerelease && b.prerelease) return 1;
  return 0;
}

/**
 * Có nên mời giáo viên cập nhật lên `candidate` không. Equal-or-older là `false`:
 * một nguồn cập nhật trỏ đúng phiên bản đang chạy (rất hay xảy ra khi vừa phát hành
 * 0.4.0 và máy đã cài 0.4.0) phải báo "đã mới nhất", không phải "có bản mới 0.4.0".
 */
export function isNewerVersion(candidate: unknown, current: unknown): boolean {
  return compareVersions(candidate, current) === 1;
}

/** Đọc message gốc của electron-updater / Chromium và phân loại, có thứ tự ưu tiên. */
export function classifyUpdateError(message: unknown): UpdateErrorKind {
  const text = String(message == null ? '' : message);
  if (!text.trim()) return 'unknown';
  if (/cancell?ed|ERR_UPDATER_CANCELED|aborted by user/i.test(text)) return 'cancelled';
  if (/not signed|INVALID_SIGNATURE|publisher|authenticode/i.test(text)) return 'signature';
  if (/no update filepath|can't quit and install|ERR_UPDATER_NO_FILE|installer|elevate|nsis|EBUSY|EPERM|EACCES/i.test(text)) return 'install';
  if (/not packed|forceDevUpdateConfig|app-update\.yml|dev mode|dev-app-update/i.test(text)) return 'dev-mode';
  if (/ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|ERR_NETWORK_CHANGED|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|getaddrinfo|offline|network|socket hang up/i.test(text)) return 'offline';
  // Phải đứng trước nhánh feed: mẫu 5\d\d ở đó khớp cả chữ "512" trong "sha512" (nợ #212).
  if (/checksum mismatch|ERR_CHECKSUM_MISMATCH/i.test(text)) return 'checksum';
  if (/404|not found|latest\.yml|Cannot find|no published|status code 4|5\d\d|Unexpected HTTP|ERR_HTTP/i.test(text)) return 'feed';
  return 'unknown';
}

/** 0..100, làm tròn, mọi giá trị rác (NaN, âm, 1e3) đều quy về dải hợp lệ. */
export function clampPercent(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(100, Math.max(0, Math.round(number)));
}

/** Đổi một kiện thành trạng thái mới; không sửa đổi `state` đưa vào. */
export function reduceUpdateState(state: UpdateState, event: UpdateEvent, now: number = Date.now()): UpdateState {
  switch (event.type) {
    case 'reset':
      return createUpdateState(state.currentVersion);

    case 'check-started':
      // Một lần kiểm tra lại không được lấy đi nút "Khởi động lại để cài": bản tải
      // xong đã nằm trên đĩa và vẫn dùng được, dù nguồn có nói gì sau đó.
      if (state.phase === 'downloaded') return { ...state, errorKind: '', errorMessage: '' };
      return {
        ...state,
        phase: 'checking',
        newVersion: '',
        errorKind: '',
        errorMessage: '',
        progressPercent: 0,
        transferredBytes: 0,
        totalBytes: 0,
        bytesPerSecond: 0,
        downloadStartedAt: 0
      };

    case 'check-ignored':
      return {
        ...state,
        phase: 'error',
        errorKind: 'dev-mode',
        errorMessage: 'update check skipped: the app is not running from an installed build',
        lastCheckedAt: now
      };

    case 'check-settled':
      // Chỉ sửa khi vẫn còn kẹt ở `checking`; mọi trạng thái đã có kết quả giữ nguyên.
      if (state.phase !== 'checking') return state;
      return {
        ...state,
        phase: 'error',
        errorKind: 'feed',
        errorMessage: 'the update feed returned no usable release info',
        lastCheckedAt: now
      };

    case 'update-not-available':
      return { ...state, phase: 'up-to-date', newVersion: '', errorKind: '', errorMessage: '', lastCheckedAt: now };

    case 'update-available': {
      if (!isNewerVersion(event.version, state.currentVersion)) {
        return { ...state, phase: 'up-to-date', newVersion: '', errorKind: '', errorMessage: '', lastCheckedAt: now };
      }
      return {
        ...state,
        phase: 'available',
        newVersion: String(event.version || ''),
        errorKind: '',
        errorMessage: '',
        progressPercent: 0,
        transferredBytes: 0,
        totalBytes: 0,
        bytesPerSecond: 0,
        lastCheckedAt: now,
        downloadStartedAt: 0
      };
    }

    case 'download-started':
      return {
        ...state,
        phase: 'downloading',
        progressPercent: 0,
        transferredBytes: 0,
        totalBytes: 0,
        bytesPerSecond: 0,
        downloadStartedAt: now,
        errorKind: '',
        errorMessage: ''
      };

    case 'download-progress': {
      // Kiện ngoài luồng tải bị bỏ qua: sau `update-downloaded` mà một gói tin
      // trễ còn kịp tới thì thanh tiến trình không được tụt về 40%.
      if (state.phase !== 'downloading') return state;
      const percent = Math.max(state.progressPercent, clampPercent(event.percent));
      return {
        ...state,
        progressPercent: percent,
        transferredBytes: Math.max(0, Number(event.transferred) || 0),
        totalBytes: Math.max(0, Number(event.total) || 0),
        bytesPerSecond: Math.max(0, Number(event.bytesPerSecond) || 0)
      };
    }

    case 'update-downloaded':
      return {
        ...state,
        phase: 'downloaded',
        newVersion: String(event.version || state.newVersion || ''),
        progressPercent: 100,
        errorKind: '',
        errorMessage: '',
        lastCheckedAt: now
      };

    case 'error': {
      const kind = classifyUpdateError(event.message);
      const message = String(event.message || '');
      // Đã tải xong thì lỗi của lần kiểm tra sau không xoá được quyền cài.
      if (state.phase === 'downloaded') return { ...state, errorMessage: message, errorKind: '' };
      return {
        ...state,
        phase: 'error',
        errorKind: kind,
        errorMessage: message,
        // Một lần tải dở mà lỗi thì thanh tiến trình phải về 0, nếu không nó ngồi
        // ở 63% mãi và giáo viên không biết nên bấm lại hay chờ.
        progressPercent: 0,
        transferredBytes: 0,
        totalBytes: 0,
        bytesPerSecond: 0,
        downloadStartedAt: 0,
        lastCheckedAt: kind === 'dev-mode' ? now : state.lastCheckedAt
      };
    }

    default:
      return state;
  }
}

/** Nút "Kiểm tra cập nhật" có dùng được không. */
export function canCheckForUpdates(state: UpdateState): boolean {
  return state.phase !== 'checking' && state.phase !== 'downloading';
}

/** Nút "Tải về và cập nhật" — chỉ khi thực sự có bản mới chưa tải. */
export function canDownloadUpdate(state: UpdateState): boolean {
  return (state.phase === 'available' || state.phase === 'error') && Boolean(state.newVersion);
}

/** Nút "Khởi động lại để cài" — chỉ khi bộ cài mới đã nằm trên đĩa. */
export function canInstallUpdate(state: UpdateState): boolean {
  return state.phase === 'downloaded' && Boolean(state.newVersion);
}

/** Còn bao lâu nữa thì tải xong, `null` khi chưa ước lượng được. */
export function estimatedSecondsLeft(state: UpdateState): number | null {
  if (state.phase !== 'downloading' || !(state.bytesPerSecond > 0)) return null;
  const remaining = state.totalBytes - state.transferredBytes;
  if (!(remaining > 0)) return null;
  return Math.round(remaining / state.bytesPerSecond);
}

/** `1,2 MB` / `640 KB` cho dòng tiến trình. */
export function formatBytes(value: unknown): string {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  const units = ['B', 'KB', 'MB', 'GB'];
  let index = 0;
  let size = bytes;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  const digits = size >= 100 || index === 0 ? 0 : 1;
  return `${size.toFixed(digits).replace('.', ',')} ${units[index]}`;
}

/** `~2 phút` / `vài giây nữa` cho ETA. */
export function formatDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return '';
  if (seconds < 20) return 'vài giây nữa';
  if (seconds < 120) return `~${Math.round(seconds)} giây nữa`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `~${minutes} phút nữa`;
  return `~${Math.round(minutes / 60)} giờ nữa`;
}

/** Nhãn ngắn cho badge — để main ghi log và trang Giới thiệu vẽ cùng một lời. */
export function phaseLabel(phase: UpdatePhase): string {
  const labels: Record<UpdatePhase, string> = {
    idle: 'chưa kiểm tra',
    checking: 'đang kiểm tra',
    'up-to-date': 'đã mới nhất',
    available: 'có bản mới',
    downloading: 'đang tải',
    downloaded: 'sẵn sàng cài',
    error: 'lỗi'
  };
  return labels[phase] || String(phase);
}
