// Hợp đồng duy nhất giữa renderer và lớp desktop (giai đoạn 2, kế hoạch Tauri).
//
// Trước giai đoạn 2, renderer gọi thẳng `window.eduGame.*` — hợp đồng đó do
// `src/preload.ts` (Electron) và cầu sinh tự động (Tauri) cung cấp. Ở đây renderer
// tự phát biểu hợp đồng của mình: tên lời gọi, tên kênh/sự kiện nó cần, nhóm chức
// năng và số đối số. File này KHÔNG gọi kênh nào; nó chỉ là dữ liệu cho
// `desktop-facade.ts` và là thứ `tests/unit/desktop-facade.test.ts` đối chiếu cả ba
// phía (renderer ↔ JSON ↔ preload/cầu Tauri).
//
// Vì sao đặt trong `renderer/` chứ `shared/`: renderer là plain global script, được
// biên dịch sang `dist/src/renderer/...` và nạp bằng `<script defer>`; `src/shared/*`
// được tiền tố `import` của chính renderer dùng (chỉ để lấy kiểu, không nạp lúc chạy).
// Đặt file ở đây để không thêm một module Node-only vào bundle của renderer.

/*
 * Tệp này KHÔNG được có câu lệnh `import`/`export` nào: nó là script cổng thường
 * trong trình duyệt, và `tsc` coi một tệp có export là module Node — bản dịch sẽ
 * mở đầu bằng `exports.DESKTOP_CALLS = …` và renderer chết với "exports is not
 * defined". Hình dạng được phát biểu bằng kiểu tại chỗ; nguồn kiểm tra là
 * `tests/unit/desktop-facade.test.ts`.
 */

/**
 * Nhóm chức năng của kế hoạch Tauri, giai đoạn 2 (thứ tự = thứ tự chuyển dần):
 * `app | data | files | ai | diagnostics | presentation | lan | update`.
 *
 * 92 lời gọi của façade dưới đây. `group` là phân nhóm chức năng;
 * Khoá trùng hệt khoá của `window.eduGame`, để khi chuyển từng tệp chỉ đổi
 * `eduGame.x(` → `desktop.call('x')(`. `group` là phân nhóm của kế hoạch;
 * `channel` là chuỗi Electron đã chốt trong `src/shared/desktop-contract.json`;
 * `kind` là `'value'` (trả dữ liệu), `'send'` (gửi đi, bên Electron là
 * `ipcRenderer.send` — ba kênh trình chiếu) hoặc `'stream'` (đẩy sự kiện, có hàm
 * huỷ).
 */
const DESKTOP_CALLS = Object.freeze({
  // ── app: thông tin vỏ, cửa sổ, thiết lập lần đầu ──────────────────────────
  appInfo: { channel: 'app:info', group: 'app', kind: 'value', optional: false },
  setFullscreen: { channel: 'window:set-fullscreen', group: 'app', kind: 'value', optional: false },
  onFullscreenChanged: { channel: 'window:fullscreen-changed', group: 'app', kind: 'stream', optional: false },
  getSetupStatus: { channel: 'setup:status', group: 'app', kind: 'value', optional: false },
  preflightSetup: { channel: 'setup:preflight', group: 'app', kind: 'value', optional: false },
  startSetup: { channel: 'setup:start', group: 'app', kind: 'value', optional: false },
  cancelSetup: { channel: 'setup:cancel', group: 'app', kind: 'value', optional: false },
  onSetupProgress: { channel: 'setup:progress', group: 'app', kind: 'stream', optional: false },

  // ── data: thư viện trò chơi, lịch sử, giáo án, dự án ─────────────────────
  getLibrary: { channel: 'library:get', group: 'data', kind: 'value', optional: false },
  saveGame: { channel: 'library:save-game', group: 'data', kind: 'value', optional: false },
  deleteGame: { channel: 'library:delete-game', group: 'data', kind: 'value', optional: false },
  deleteGames: { channel: 'library:delete-games', group: 'data', kind: 'value', optional: false },
  saveSession: { channel: 'library:save-session', group: 'data', kind: 'value', optional: false },
  deleteSessions: { channel: 'library:delete-sessions', group: 'data', kind: 'value', optional: false },
  saveLessonDocument: { channel: 'lesson:save-document', group: 'data', kind: 'value', optional: false },
  getLessonDocument: { channel: 'lesson:get-document', group: 'data', kind: 'value', optional: false },
  listLessonLibrary: { channel: 'lesson:library', group: 'data', kind: 'value', optional: false },
  deleteLessonDocument: { channel: 'lesson:delete-document', group: 'data', kind: 'value', optional: false },
  deleteLessonDocuments: { channel: 'lesson:delete-documents', group: 'data', kind: 'value', optional: false },
  listLessonChats: { channel: 'lesson:chats', group: 'data', kind: 'value', optional: false },
  getLessonChat: { channel: 'lesson:chat-get', group: 'data', kind: 'value', optional: false },
  deleteLessonChats: { channel: 'lesson:chat-delete', group: 'data', kind: 'value', optional: false },
  saveProjectDraft: { channel: 'project:save-draft', group: 'data', kind: 'value', optional: false },
  getProject: { channel: 'project:get', group: 'data', kind: 'value', optional: false },
  listProjects: { channel: 'project:list', group: 'data', kind: 'value', optional: false },
  deleteProject: { channel: 'project:delete', group: 'data', kind: 'value', optional: false },
  deleteProjects: { channel: 'project:delete-many', group: 'data', kind: 'value', optional: false },

  // ── files: nhập/xuất tệp, tài liệu, câu hỏi, ảnh minh hoạ ────────────────
  importDocument: { channel: 'files:import-document', group: 'files', kind: 'value', optional: false },
  importDocumentFromPath: { channel: 'files:import-document-from-path', group: 'files', kind: 'value', optional: false },
  importQuestions: { channel: 'files:import-questions', group: 'files', kind: 'value', optional: false },
  exportGame: { channel: 'files:export-game', group: 'files', kind: 'value', optional: false },
  importGame: { channel: 'files:import-game', group: 'files', kind: 'value', optional: false },
  importIllustration: { channel: 'files:import-illustration', group: 'files', kind: 'value', optional: false },
  deleteIllustration: { channel: 'files:delete-illustration', group: 'files', kind: 'value', optional: false },

  // ── ai: cài đặt, nhà cung cấp, AI local, tiến độ, huỷ tác vụ, soạn giáo án ─
  getSettings: { channel: 'settings:get', group: 'ai', kind: 'value', optional: false },
  saveSettings: { channel: 'settings:save', group: 'ai', kind: 'value', optional: false },
  getAiProviders: { channel: 'ai:providers', group: 'ai', kind: 'value', optional: false },
  testAiProvider: { channel: 'ai:test-provider', group: 'ai', kind: 'value', optional: false },
  getLocalAiModels: { channel: 'ai:local-models', group: 'ai', kind: 'value', optional: false },
  getLocalRuntimeStatus: { channel: 'ai:local-status', group: 'ai', kind: 'value', optional: false },
  installLocalAiModel: { channel: 'ai:install-local-model', group: 'ai', kind: 'value', optional: false },
  startLocalRuntime: { channel: 'ai:start-local-runtime', group: 'ai', kind: 'value', optional: false },
  stopLocalRuntime: { channel: 'ai:stop-local-runtime', group: 'ai', kind: 'value', optional: false },
  cancelAi: { channel: 'ai:cancel', group: 'ai', kind: 'value', optional: false },
  listAiTasks: { channel: 'ai:tasks', group: 'ai', kind: 'value', optional: false },
  verifyCpuRuntime: { channel: 'ai:runtime-verify', group: 'ai', kind: 'value', optional: false },
  onLocalAiProgress: { channel: 'ai:local-progress', group: 'ai', kind: 'stream', optional: false },
  generateGame: { channel: 'ai:generate', group: 'ai', kind: 'value', optional: false },
  analyzeLesson: { channel: 'lesson:analyze', group: 'ai', kind: 'value', optional: false },
  classifyLessonInput: { channel: 'lesson:classify-input', group: 'ai', kind: 'value', optional: false },
  convertLessonDraft: { channel: 'lesson:convert-draft', group: 'ai', kind: 'value', optional: false },
  inspectLessonStructure: { channel: 'lesson:get-structure', group: 'ai', kind: 'value', optional: false },
  previewLessonSelection: { channel: 'lesson:preview-selection', group: 'ai', kind: 'value', optional: false },
  sendLessonChat: { channel: 'lesson:chat-send', group: 'ai', kind: 'value', optional: false },
  recommendGames: { channel: 'lesson:recommend', group: 'ai', kind: 'value', optional: false },
  estimateLessonCapacity: { channel: 'lesson:capacity', group: 'ai', kind: 'value', optional: false },
  getLessonAnalysis: { channel: 'lesson:get-analysis', group: 'ai', kind: 'value', optional: false },
  saveLessonAnalysis: { channel: 'lesson:save-analysis', group: 'ai', kind: 'value', optional: false },
  getLessonRecommendations: { channel: 'lesson:recommendations', group: 'ai', kind: 'value', optional: false },
  generateLessonDraft: { channel: 'lesson:generate', group: 'ai', kind: 'value', optional: false },
  regenerateLessonItem: { channel: 'lesson:regenerate-item', group: 'ai', kind: 'value', optional: false },
  checkLessonQuality: { channel: 'lesson:quality', group: 'ai', kind: 'value', optional: false },
  patchLessonItemAssets: { channel: 'lesson:patch-item-assets', group: 'ai', kind: 'value', optional: false },
  onLessonProgress: { channel: 'lesson:progress', group: 'ai', kind: 'stream', optional: false },

  // ── diagnostics: log và chẩn đoán ────────────────────────────────────────
  exportDiagnostics: { channel: 'diagnostics:export', group: 'diagnostics', kind: 'value', optional: false },
  diagnosticsInfo: { channel: 'diagnostics:info', group: 'diagnostics', kind: 'value', optional: false },
  clearDiagnostics: { channel: 'diagnostics:clear', group: 'diagnostics', kind: 'value', optional: false },
  openDiagnosticsFolder: { channel: 'diagnostics:open-folder', group: 'diagnostics', kind: 'value', optional: false },

  // ── presentation: máy chiếu (vòng 2 của #251) ────────────────────────────
  startPresentation: { channel: 'presentation:start', group: 'presentation', kind: 'value', optional: false },
  stopPresentation: { channel: 'presentation:stop', group: 'presentation', kind: 'value', optional: false },
  togglePresentation: { channel: 'presentation:toggle', group: 'presentation', kind: 'value', optional: false },
  getDisplays: { channel: 'presentation:displays', group: 'presentation', kind: 'value', optional: false },
  sendPresentationExit: { channel: 'presentation:exit', group: 'presentation', kind: 'send', optional: false },
  requestPresentationState: { channel: 'presentation:request-state', group: 'presentation', kind: 'send', optional: false },
  sendPresentationState: { channel: 'presentation:state-update', group: 'presentation', kind: 'send', optional: false },
  onPresentationState: { channel: 'presentation:state-sync', group: 'presentation', kind: 'stream', optional: false },
  onPresentationExit: { channel: 'presentation:exit', group: 'presentation', kind: 'stream', optional: false },

  // ── lan: lớp học qua mạng LAN ────────────────────────────────────────────
  lanStart: { channel: 'lan:start', group: 'lan', kind: 'value', optional: false },
  lanStop: { channel: 'lan:stop', group: 'lan', kind: 'value', optional: false },
  lanAssignTeam: { channel: 'lan:assign-team', group: 'lan', kind: 'value', optional: false },
  lanBegin: { channel: 'lan:begin', group: 'lan', kind: 'value', optional: false },
  lanNext: { channel: 'lan:next', group: 'lan', kind: 'value', optional: false },
  lanFinish: { channel: 'lan:finish', group: 'lan', kind: 'value', optional: false },
  onLanState: { channel: 'lan:state', group: 'lan', kind: 'stream', optional: false },

  // ── update: tab Giới thiệu (#188, #204) ──────────────────────────────────
  openAbout: { channel: 'about:open', group: 'update', kind: 'value', optional: false },
  aboutInfo: { channel: 'about:info', group: 'update', kind: 'value', optional: false },
  aboutState: { channel: 'about:state', group: 'update', kind: 'value', optional: false },
  aboutCheck: { channel: 'about:check', group: 'update', kind: 'value', optional: false },
  aboutDownload: { channel: 'about:download', group: 'update', kind: 'value', optional: false },
  aboutInstall: { channel: 'about:install', group: 'update', kind: 'value', optional: false },
  aboutOpenReleases: { channel: 'about:open-releases', group: 'update', kind: 'value', optional: false },
  onAboutState: { channel: 'about:state-push', group: 'update', kind: 'stream', optional: false },
});

/**
 * Số đối số tối đa (không tính callback) của mỗi lời gọi `value`
 * (`Record<string, number>`). Khoá vắng mặt = tối đa một đối số.
 */
const DESKTOP_ARGC = Object.freeze({
  aboutOpenReleases: 1,
  importDocumentFromPath: 1,
  installLocalAiModel: 1,
  startLocalRuntime: 1,
  cancelAi: 1,
  listAiTasks: 1,
  preflightSetup: 1,
  startSetup: 1,
  testAiProvider: 1,
  deleteGame: 1,
  deleteGames: 1,
  deleteProject: 1,
  deleteProjects: 1,
  deleteLessonDocument: 1,
  deleteLessonDocuments: 1,
  deleteLessonChats: 1,
  deleteIllustration: 1,
  getLessonDocument: 1,
  getLessonAnalysis: 1,
  getLessonRecommendations: 1,
  getLessonChat: 1,
  getProject: 1,
  saveGame: 1,
  saveSession: 1,
  saveLessonDocument: 1,
  saveLessonAnalysis: 1,
  saveProjectDraft: 1,
  saveSettings: 1,
  exportGame: 1,
  importIllustration: 1,
  setFullscreen: 1,
  analyzeLesson: 1,
  classifyLessonInput: 1,
  convertLessonDraft: 1,
  inspectLessonStructure: 1,
  previewLessonSelection: 1,
  sendLessonChat: 1,
  recommendGames: 1,
  estimateLessonCapacity: 1,
  generateGame: 1,
  generateLessonDraft: 1,
  regenerateLessonItem: 1,
  checkLessonQuality: 1,
  patchLessonItemAssets: 1,
  startPresentation: 1,
  togglePresentation: 1,
  sendPresentationExit: 1,
  sendPresentationState: 1,
  lanStart: 1,
  lanAssignTeam: 1,
});

/**
 * Arity của những lời gọi KHÔNG theo quy tắc "không đối số hoặc một payload". Chỉ
 * `onPresentationExit(cb)`: không có payload nào được truyền, và façade phải gọi
 * đúng như preload (`ipcRenderer.on('presentation:exit')` không đọc đối số).
 */
const DESKTOP_ARGV = Object.freeze({
  onPresentationExit: 0,
});

/**
 * Lỗi chuẩn hoá: giữ `message` gốc của vỏ, thêm `code` và `call`.
 *
 * Hình dạng `DesktopError`:
 * - `name`: luôn `'DesktopError'`, để renderer phân biệt với lỗi lập trình;
 * - `message`: tiếng Việt, lấy nguyên văn từ vỏ (người dùng đọc);
 * - `code`: `'invalid-argument' | 'unknown-call' | 'not-supported' | 'host-error'`
 *   — renderer CHỈ được rẽ nhánh trên `code`, không trên `message`;
 * - `call`: tên lời gọi façade đã hỏng (`deleteGames`), để renderer biết đường hiển thị.
 */
function desktopError(code: any /* DesktopErrorCode */, call: string, message: string, cause?: unknown): any {
  const error = new Error(message || 'Lỗi không xác định từ lớp desktop') as any;
  error.name = 'DesktopError';
  error.code = code;
  error.call = call;
  (error as { cause?: unknown }).cause = cause;
  return error;
}

/**
 * Chuẩn hoá bất cứ thứ gì một vỏ ném ra thành `DesktopError`. Electron ném `Error`
 * (ipcRenderer giữ nguyên `message`); Tauri ném chuỗi hoặc Error với message là lý do.
 * Vỏ đã ném `DesktopError` thì giữ nguyên — đừng bọc hai lớp.
 */
function toDesktopError(call: string, thrown: unknown): any {
  const existing = thrown as any;
  if (existing && existing.name === 'DesktopError' && typeof existing.code === 'string') return existing;
  const message =
    typeof thrown === 'string'
      ? thrown
      : existing && typeof existing.message === 'string'
        ? existing.message
        : String(thrown);
  return desktopError('host-error', call, message, thrown);
}

/**
 * Toàn bộ bản mô tả dưới một đối tượng duy nhất. Renderer gồm các script cổng thường
 * chia nhau một phạm vi script, nên đọc một binding khai báo ở tệp khác lúc nạp là
 * luật cấm (tests/unit/renderer-load-order.test.ts) — chỉ được đọc bên trong hàm.
 *
 * `argv`: ngoại lệ của quy tắc đối số. Lời gọi `value` gửi `[]` hoặc `[payload]`;
 * `onPresentationExit` là ngoại lệ duy nhất (`[]`, không payload).
 */
const DESKTOP_FACADE_SCHEMA = Object.freeze({
  calls: DESKTOP_CALLS,
  argc: DESKTOP_ARGC,
  argv: DESKTOP_ARGV,
  /**
   * Lời gọi KHÔNG có trong preload Electron, nên không thuộc `DESKTOP_CALLS` và
   * không được `calls` kiểm: chỉ cổng kiểm tra Tauri dùng. Vỏ Tauri từ chối khi
   * biến `EDUGAME_TAURI_PACKAGE` / `EDUGAME_TAURI_FILES` chưa bật, nên bản phát
   * hành không mở đường nào (`package.rs` / `document.rs::set_gate_turn`).
   */
  gateCalls: Object.freeze({
    setPackageGateTurn: 'package:gate-turn',
    setFilesGateTurn: 'files:gate-turn',
  }),
  /**
   * Lời gọi CHỈ vỏ Tauri có, không thuộc preload Electron: Giai đoạn 4 nhập profile
   * Electron. `desktop.host()` từ chối tên không nằm ở đây, nên renderer không mượn
   * được cửa này để gọi kênh tuỳ ý. Adapter Tauri dịch tên → chuỗi kênh; adapter
   * Electron không biết ba tên này nên lời gọi hỏng (đúng ý: chỉ chạy trên Tauri).
   */
  hostCalls: Object.freeze({
    migrationDetect: 'migration:detect',
    migrationBrowse: 'migration:browse',
    migrationImport: 'migration:import',
  }),
  error: desktopError,
  toError: toDesktopError,
  callCount: Object.keys(DESKTOP_CALLS).length,
  eventCount: Object.values(DESKTOP_CALLS).filter(spec => spec.kind === 'stream').length,
});
