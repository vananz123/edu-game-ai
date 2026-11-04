/* Trang Giới thiệu (#188): kênh IPC + kiểu dùng chung giữa main, about-preload.js và about.html. */

/** Kênh IPC của cửa sổ Giới thiệu và bộ cập nhật tự động. */
export const ABOUT_CHANNELS = {
  /** Renderer (cửa sổ chính) xin mở cửa sổ Giới thiệu. */
  OPEN: 'about:open',
  /** Trang Giới thiệu xin thông tin ứng dụng (tên, phiên bản, tác giả…). */
  INFO: 'about:info',
  /** Trang Giới thiệu xin bản chụp máy trạng thái hiện tại. */
  STATE: 'about:state',
  /** Main đẩy mỗi khi máy trạng thái đổi. */
  STATE_PUSH: 'about:state-push',
  /** Bấm "Kiểm tra cập nhật". */
  CHECK: 'about:check',
  /** Bấm "Tải về và cập nhật". */
  DOWNLOAD: 'about:download',
  /** Bấm "Khởi động lại để cài". */
  INSTALL: 'about:install',
  /** Mở trang phát hành trên trình duyệt ngoài. */
  OPEN_RELEASES: 'about:open-releases'
} as const;

/** Trạng thái của một lượt cập nhật. `idle` = chưa kiểm tra lần nào. */
export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'error';

/**
 * Loại lỗi, quyết định câu tiếng Việt hiện ra cho giáo viên. `dev-mode` nghĩa là
 * bản đang chạy không phải bản cài đặt nên tự cập nhật không phải lỗi mà là
 * điều không thể; `feed` = không tìm thấy bản phát hành nào trên GitHub.
 */
export type UpdateErrorKind =
  | ''
  | 'dev-mode'
  | 'offline'
  | 'feed'
  | 'signature'
  | 'cancelled'
  | 'install'
  | 'unknown';

/** Bản chụp máy trạng thái, đủ để trang Giới thiệu vẽ lại mà không cần logic riêng. */
export interface UpdateState {
  phase: UpdatePhase;
  /** Phiên bản đang chạy, ví dụ `0.4.0`. */
  currentVersion: string;
  /** Phiên bản nguồn cập nhật vừa công bố; rỗng khi chưa có. */
  newVersion: string;
  /** 0..100, không bao giờ giảm khi đang tải. */
  progressPercent: number;
  transferredBytes: number;
  totalBytes: number;
  bytesPerSecond: number;
  errorKind: UpdateErrorKind;
  /** Thông điệp gốc từ electron-updater, chỉ để tra cứu — không hiện nguyên văn. */
  errorMessage: string;
  /** Mốc `Date.now()` của lần kiểm tra xong gần nhất; 0 là chưa kiểm tra. */
  lastCheckedAt: number;
  /** Mốc bắt đầu tải lần này; 0 là chưa tải. */
  downloadStartedAt: number;
}

/** Những gì trang Giới thiệu hiển thị về chính ứng dụng. */
export interface AboutAppInfo {
  name: string;
  version: string;
  description: string;
  author: string;
  license: string;
  /** `true` = chạy từ bộ cài đã đặt; `false` = đang chạy kiểu `npm start`. */
  packaged: boolean;
  electron: string;
  chrome: string;
  node: string;
  platform: string;
  arch: string;
  /** Thư mục SQLite + giáo án + game đã lưu. */
  userDataPath: string;
  releasePageUrl: string;
}

/** Kết quả của một hành động cập nhật: luôn kèm bản trạng thái mới nhất. */
export interface AboutActionResult {
  ok: boolean;
  state: UpdateState;
  error?: string;
}

/** Trang phát hành công khai — URL, không phải khoá bí mật. */
export const EDUGAME_RELEASE_PAGE_URL = 'https://github.com/vananz123/edu-game-ai/releases';

/**
 * Mô tả hiện trên trang Giới thiệu. Đây là câu chữ giao diện, không lấy từ
 * `description` của package.json: trường đó là metadata của bộ cài (đang bị mã hoá
 * sai — tiếng Việt thành chuỗi ký tự lạ) và có phần kỹ thuật không dành cho giáo viên.
 */
export const EDUGAME_DESCRIPTION = 'Ứng dụng Windows giúp giáo viên tạo, quản lý và chơi game giáo dục — game đã lưu chạy được không cần internet.';
