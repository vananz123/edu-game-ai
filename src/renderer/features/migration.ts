// Giai đoạn 4: gợi ý nhập dữ liệu của bản Electron khi giáo viên mở vỏ Tauri lần
// đầu. Tệp này CHỈ chạy trên vỏ Tauri: `desktopHost.shell` khác `tauri` thì
// `offerElectronMigrationImport()` trả về ngay, không đọc đĩa, không mở modal.
//
// Luồng có chủ đích:
//   1. `detect` chỉ ĐỌC. Không có dữ liệu cũ thì im lặng; giáo viên không phải
//      đóng một hộp thoại "không tìm thấy gì".
//   2. Giáo viên bấm "Nhập vào bản mới" thì Rust mới tạo bản sao lưu rồi nhập.
//      "Để sau" chỉ đóng modal — lần mở sau sẽ hỏi lại (chưa có kênh lưu quyết
//      định bỏ qua; xem docs/DECISIONS.md mục Giai đoạn 4).
//   3. Thành công thì KHÔNG tự tải lại: giáo viên đọc số dòng đã nhập và đường dẫn
//      bản sao lưu, rồi bấm "Mở lại ứng dụng". Nhờ vậy một lần nhập lỗi không bị
//      che bởi một vòng `location.reload()`.
//
// Không có khoá API nào trong DOM: báo cáo từ Rust đã tước khoá; ở đây chỉ hiện
// số khoá đã bỏ để giáo viên biết phải nhập lại.

// @ts-nocheck -- renderer legacy dùng script toàn cục; hợp đồng desktop đã có kiểu riêng.

interface MigrationView {
  phase: 'offer' | 'importing' | 'done' | 'failed';
  detect: any;
  report: any;
  message?: string;
}

let migrationView: MigrationView | null = null;
let migrationOffered = false;

function migrationFormatBytes(value: number): string {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function migrationCountRows(counts: any): Array<[string, number]> {
  if (!counts) return [];
  const rows: Array<[string, number]> = [
    ['Trò chơi', counts.games],
    ['Lượt chơi đã lưu', counts.sessions],
    ['Giáo án', counts.lessonDocuments],
    ['Dự án', counts.gameProjects],
    ['Đoạn giáo án', counts.lessonChunks],
    ['Hội thoại giáo án', counts.lessonChats],
    ['Tác vụ AI', counts.aiTasks],
  ];
  return rows.filter(([, value]) => Number(value) > 0);
}

function migrationOfferHtml(view: MigrationView): string {
  const detect = view.detect || {};
  const source = detect.source;
  const rows = source ? migrationCountRows(source.counts) : [];
  const path = source ? source.path : detect.sourcePath || '';
  const images = source && source.images ? source.images : { files: 0, bytes: 0 };
  const lessons = source && source.lessons ? source.lessons : { files: 0, bytes: 0 };
  const aiLocal = source ? Number(source.aiLocalBytes) || 0 : 0;
  const error = detect.error
    ? `<div class="info-box mt-[14px] border-red-500/40 text-red-200">${uiIcon('triangle-alert', '', 16)} <strong>Chưa đọc được profile này.</strong> ${escapeHtml(detect.error.message || '')}</div>`
    : '';
  const table = rows.length
    ? `<div class="mt-[12px] rounded-lg border border-white/10 overflow-hidden"><table class="w-full text-sm"><tbody>${rows
        .map(
          ([label, value]) =>
            `<tr class="border-b border-white/8 last:border-0"><td class="py-[7px] px-[10px] muted">${escapeHtml(label)}</td><td class="py-[7px] px-[10px] text-right font-semibold">${Number(value).toLocaleString('vi-VN')}</td></tr>`,
        )
        .join('')}</tbody></table></div>`
    : '';
  return `
    <div class="modal-backdrop" data-migration-backdrop>
      <div class="modal" role="dialog" aria-modal="true" aria-label="Nhập dữ liệu từ bản cũ" data-migration-phase="offer" data-migration-source="${escapeHtml(path)}">
        <div class="modal-head">
          <div>
            <h2>Nhập dữ liệu từ bản EduGame Studio cũ</h2>
            <div class="small muted mt-[5px]">Ứng dụng tìm thấy dữ liệu của bản Electron trên máy này.</div>
          </div>
        </div>
        <div class="modal-body">
          <p class="m-[0_0_10px]">Chép thư viện trò chơi, giáo án, lượt chơi và dự án sang bản mới? Bản cũ chỉ được <strong>đọc</strong>; trước khi nhập, ứng dụng tạo một bản sao lưu đầy đủ và không tự xoá bản sao lưu đó.</p>
          ${path ? `<div class="small muted">Profile cũ: <code class="break-all">${escapeHtml(path)}</code></div>` : ''}
          ${table}
          <div class="small muted mt-[10px]">Tệp: ${images.files} ảnh (${migrationFormatBytes(images.bytes)}), ${lessons.files} tệp giáo án (${migrationFormatBytes(lessons.bytes)})${aiLocal ? ` · AI local ${migrationFormatBytes(aiLocal)}` : ''}.</div>
          <div class="info-box mt-[14px]">${uiIcon('key', '', 16)} <strong>Khoá API không được chép</strong> vì lý do an toàn. Sau khi nhập, bạn nhập lại khoá trong Cài đặt; địa chỉ API và tên model vẫn được giữ. Mô hình AI local (nếu có) không được chép — cài lại khi cần.</div>
          ${error}
        </div>
        <div class="modal-foot">
          <button class="btn btn-secondary" data-migration-action="later">Để sau</button>
          <button class="btn btn-secondary" data-migration-action="browse">${uiIcon('folder-open', '', 16)} Chọn thư mục khác</button>
          ${source ? `<button class="btn btn-primary" data-migration-action="import">Nhập vào bản mới</button>` : ''}
        </div>
      </div>
    </div>`;
}

function migrationBusyHtml(message: string): string {
  return `
    <div class="modal-backdrop" data-migration-backdrop>
      <div class="modal" role="dialog" aria-modal="true" aria-label="Đang nhập dữ liệu" data-migration-phase="importing">
        <div class="modal-head"><div><h2>Đang nhập dữ liệu</h2><div class="small muted mt-[5px]">${escapeHtml(message)}</div></div></div>
        <div class="modal-body"><p class="m-0">${uiIcon('loader-circle', 'animate-spin', 20)} Đừng đóng ứng dụng trong lúc sao lưu và nhập. Việc này chỉ chạy một lần.</p></div>
        <div class="modal-foot"><button class="btn btn-secondary" disabled>Đang xử lý…</button></div>
      </div>
    </div>`;
}

function migrationDoneHtml(report: any): string {
  const tables = Array.isArray(report.tables) ? report.tables : [];
  const inserted = tables.reduce((total: number, table: any) => total + (Number(table.inserted) || 0), 0);
  const conflicts = [report.files && report.files.images, report.files && report.files.lessons]
    .filter(Boolean)
    .reduce((total: number, files: any) => total + (Array.isArray(files.conflicts) ? files.conflicts.length : 0), 0);
  const settings = report.settings || {};
  const keys = Number(settings.keysRemoved) || 0;
  const warnings = Array.isArray(report.warnings) ? report.warnings : [];
  return `
    <div class="modal-backdrop" data-migration-backdrop>
      <div class="modal" role="dialog" aria-modal="true" aria-label="Đã nhập dữ liệu" data-migration-phase="done" data-migration-backup="${escapeHtml(report.backupPath || '')}" data-migration-inserted="${inserted}" data-migration-keys="${keys}">
        <div class="modal-head"><div><h2>Đã nhập xong dữ liệu</h2><div class="small muted mt-[5px]">Đã thêm ${inserted.toLocaleString('vi-VN')} dòng dữ liệu.</div></div></div>
        <div class="modal-body">
          <div class="info-box">${uiIcon('circle-check', '', 16)} Dữ liệu cũ đã được đối chiếu số dòng, mã giáo án và SHA-256 của từng tệp trước khi báo hoàn tất.</div>
          ${settings.status === 'skipped-existing' ? '<div class="small muted mt-[10px]">Cài đặt của bản mới đã có sẵn nên không bị ghi đè.</div>' : ''}
          ${keys > 0 ? `<div class="small muted mt-[10px]">${keys} khoá API đã được bỏ khỏi bản sao lưu và dữ liệu mới. Hãy nhập lại trong Cài đặt khi cần dùng AI.</div>` : ''}
          ${conflicts > 0 ? `<div class="small muted mt-[10px]">${conflicts} tệp đã có trong bản mới với nội dung khác nên được giữ nguyên; bản cũ vẫn nằm trong bản sao lưu.</div>` : ''}
          ${warnings.length ? `<div class="info-box mt-[10px]">${warnings.map((warning: string) => escapeHtml(warning)).join('<br>')}</div>` : ''}
          ${report.backupPath ? `<div class="small muted mt-[12px]">Bản sao lưu: <code class="break-all">${escapeHtml(report.backupPath)}</code></div>` : ''}
          <p class="small muted mt-[12px] m-0">Mở lại ứng dụng để thấy thư viện vừa nhập.</p>
        </div>
        <div class="modal-foot">
          <button class="btn btn-secondary" data-migration-action="close">Đóng</button>
          <button class="btn btn-primary" data-migration-action="reload">Mở lại ứng dụng</button>
        </div>
      </div>
    </div>`;
}

function migrationFailedHtml(view: MigrationView): string {
  const report = view.report || {};
  const error = report.error || {};
  const message = view.message || error.message || 'Không nhập được dữ liệu.';
  const code = error.code ? `<div class="small muted mt-[4px]">Mã lỗi: ${escapeHtml(String(error.code))}</div>` : '';
  const part = error.part === 'settings'
    ? '<div class="small muted mt-[8px]">Dữ liệu trò chơi và giáo án đã được nhập; chỉ phần cài đặt chưa ghi được. Thử lại sẽ không nhân đôi dữ liệu.</div>'
    : '';
  return `
    <div class="modal-backdrop" data-migration-backdrop>
      <div class="modal" role="dialog" aria-modal="true" aria-label="Nhập dữ liệu chưa xong" data-migration-phase="failed">
        <div class="modal-head"><div><h2>Chưa nhập xong dữ liệu</h2><div class="small muted mt-[5px]">Dữ liệu cũ vẫn còn nguyên; ứng dụng không báo thành công khi chưa đối chiếu xong.</div></div></div>
        <div class="modal-body">
          <div class="info-box border-red-500/40 text-red-200">${uiIcon('triangle-alert', '', 16)} ${escapeHtml(message)}</div>
          ${code}${part}
          ${report.backupPath ? `<div class="small muted mt-[12px]">Bản sao lưu đã tạo: <code class="break-all">${escapeHtml(report.backupPath)}</code></div>` : ''}
        </div>
        <div class="modal-foot">
          <button class="btn btn-secondary" data-migration-action="close">Đóng</button>
          <button class="btn btn-secondary" data-migration-action="browse">Chọn thư mục khác</button>
          <button class="btn btn-primary" data-migration-action="retry">Thử lại</button>
        </div>
      </div>
    </div>`;
}

function migrationRender(): void {
  const root = document.getElementById('modalRoot');
  if (!root || !migrationView) return;
  if (migrationView.phase === 'importing') {
    root.innerHTML = migrationBusyHtml(migrationView.message || 'Đang sao lưu profile cũ rồi nhập.');
  } else if (migrationView.phase === 'done') {
    root.innerHTML = migrationDoneHtml(migrationView.report);
  } else if (migrationView.phase === 'failed') {
    root.innerHTML = migrationFailedHtml(migrationView);
  } else {
    root.innerHTML = migrationOfferHtml(migrationView);
  }
  const backdrop = root.querySelector('[data-migration-backdrop]');
  if (backdrop) {
    backdrop.addEventListener('click', event => {
      if (event.target === backdrop && migrationView && migrationView.phase !== 'importing') {
        migrationClose();
      }
    });
  }
  root.querySelectorAll('[data-migration-action]').forEach(button => {
    button.addEventListener('click', () => {
      migrationAction((button as HTMLElement).dataset.migrationAction || '');
    });
  });
}

function migrationClose(): void {
  migrationView = null;
  const root = document.getElementById('modalRoot');
  if (root) root.innerHTML = '';
}

async function migrationBrowse(): Promise<void> {
  if (!migrationView) return;
  const previous = migrationView.detect;
  migrationView = { phase: 'importing', detect: previous, report: null, message: 'Đang mở hộp thoại chọn thư mục…' };
  migrationRender();
  try {
    const detect = await desktop.host('migrationBrowse');
    if (!detect || detect.cancelled) {
      migrationView = { phase: 'offer', detect: previous, report: null };
    } else {
      migrationView = { phase: 'offer', detect, report: null };
    }
  } catch (error) {
    migrationView = {
      phase: 'failed',
      detect: previous,
      report: null,
      message: (error && error.message) || 'Không mở được hộp thoại chọn thư mục.',
    };
  }
  migrationRender();
}

async function migrationImport(): Promise<void> {
  if (!migrationView) return;
  const detect = migrationView.detect;
  migrationView = { phase: 'importing', detect, report: null };
  migrationRender();
  try {
    const report = await desktop.host('migrationImport');
    if (report && report.ok) {
      migrationView = { phase: 'done', detect, report };
    } else {
      migrationView = { phase: 'failed', detect, report: report || null };
    }
  } catch (error) {
    migrationView = {
      phase: 'failed',
      detect,
      report: null,
      message: (error && error.message) || 'Không nhập được dữ liệu.',
    };
  }
  migrationRender();
}

function migrationAction(action: string): void {
  if (action === 'close' || action === 'later') {
    migrationClose();
    return;
  }
  if (action === 'reload') {
    window.location.reload();
    return;
  }
  if (action === 'browse') {
    migrationBrowse();
    return;
  }
  if (action === 'import' || action === 'retry') {
    migrationImport();
  }
}

/** Đang có modal nhập dữ liệu chiếm `#modalRoot`? Bootstrap dùng để không mở
 *  wizard AI đè lên lời mời nhập dữ liệu. */
function migrationPromptIsOpen(): boolean {
  return migrationView !== null;
}

/**
 * Gọi MỘT lần sau `render()` đầu tiên. Không ném lỗi: một lần dò hỏng không được
 * chặn ứng dụng vừa mở.
 */
async function offerElectronMigrationImport(): Promise<void> {
  if (migrationOffered) return;
  migrationOffered = true;
  if (typeof desktopHost === 'undefined' || !desktopHost || desktopHost.shell !== 'tauri') return;
  if (typeof desktop === 'undefined' || !desktop || typeof desktop.host !== 'function') return;
  let detect: any;
  try {
    detect = await desktop.host('migrationDetect');
  } catch {
    return;
  }
  if (!detect || detect.cancelled) return;
  // Đã nhập rồi (hoặc dữ liệu Tauri còn đó) thì không mời lại — cài đè không được
  // chạy migration lần hai.
  if (detect.alreadyMigrated) return;
  if (!detect.found && !detect.error) return;
  migrationView = { phase: 'offer', detect, report: null };
  migrationRender();
}

window.offerElectronMigrationImport = offerElectronMigrationImport;
window.migrationPromptIsOpen = migrationPromptIsOpen;
