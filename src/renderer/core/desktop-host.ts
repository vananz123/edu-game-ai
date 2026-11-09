// Chọn adapter theo vỏ đang chạy và nối nó vào façade.
//
// Nạp SAU `desktop-facade.js` và hai adapter, TRƯỚC mọi tệp gọi `desktop.*`.
// Không gọi mạng, không đọc tệp: chỉ nhìn `window.__TAURI__` / `window.eduGame`.
//
// ── Vỏ Tauri ──────────────────────────────────────────────────────────────
// Từ giai đoạn 2, vỏ Tauri KHÔNG dựng `window.eduGame` nữa: renderer nói thẳng
// với `__TAURI__` (cùng một renderer chạy cả hai vỏ, và một cửa gọi là mục tiêu
// của giai đoạn 2). Tên lệnh Rust là chi tiết của adapter, không phải của host:
// host chỉ chọn adapter và nối nó vào façade. Renderer không sao chép bảng lệnh
// kênh ở đây — phía Rust tự dịch (`app:info` → nhánh `app:info` của `dispatch()`
// trong `src-tauri/src/api.rs`). Thêm một kênh vì vậy chỉ đụng ba chỗ:
// preload.ts, desktop-facade-schema.ts, api.rs.
//
// ── Cửa sổ trình chiếu ────────────────────────────────────────────────────
// `presentation.html` chỉ nạp CHÍN tệp cho miền trình chiếu — bốn tệp façade
// (schema, hai adapter, façade) cộng `presentation.js` — nên không có
// `desktop-host` ở đó: `desktopCoreChooseAdapter()` là phần CHỌN adapter, tách
// khỏi phần NỐI, và cả hai cửa sổ dùng chung phép chọn đó.
//
// ── Electron ──────────────────────────────────────────────────────────────
// Preload vẫn expose `window.eduGame`; adapter chỉ bọc lại y nguyên.

interface DesktopHost {
  shell: 'electron' | 'tauri' | 'none';
  missingGroups: string[];
  /** Chỉ để chẩn đoán; `tauri` hỏi chính adapter, không gõ lại tên lệnh Rust. */
  channels: { invoke: string; send: string };
  notes?: string;
}

/**
 * Adapter của vỏ đang chạy, hoặc `null` khi không có vỏ. Phần NỐI nằm ở từng
 * cửa sổ: cửa sổ chính gọi `desktop.attach` ngay lúc nạp, cửa sổ trình chiếu nối
 * ngay trước `initPresentation()`.
 */
function desktopCoreChooseAdapter(root: any): { adapter: any; shell: 'electron' | 'tauri' } | null {
  if (!root) return null;
  if (root.__TAURI__ && root.__TAURI__.core) {
    const adoption = createTauriDesktopAdapter(root.__TAURI__, {
      // Không cấm nhóm nào: sự kiện `onPresentationExit` dùng được, và ba lệnh
      // `send` chưa port bị adapter từ chối qua `hasChannel` (supportsSend).
      missingGroups: [],
      supportsSend: false,
    });
    if (adoption) return { adapter: adoption, shell: 'tauri' };
  }
  const adoption = createElectronDesktopAdapter('eduGame');
  return adoption ? { adapter: adoption, shell: 'electron' } : null;
}

const desktopHost: DesktopHost = (function attachDesktopHost(): DesktopHost {
  const root: any = typeof window === 'undefined' ? null : window;
  const chosen = desktopCoreChooseAdapter(root);

  if (chosen && chosen.shell === 'tauri') {
    desktop.attach(chosen.adapter);
    const commands = chosen.adapter.commands || { invoke: '', send: '' };
    return {
      shell: 'tauri',
      missingGroups: (chosen.adapter.missingGroups || []).slice(),
      channels: { invoke: commands.invoke, send: commands.send },
      notes: 'renderer → __TAURI__.core.invoke; không dùng window.eduGame',
    };
  }

  if (chosen) {
    desktop.attach(chosen.adapter);
    return { shell: 'electron', missingGroups: [], channels: { invoke: 'window.eduGame', send: 'window.eduGame' } };
  }

  // Không có vỏ: giữ facade chưa nối. `desktop.call` từ chối với mã
  // `not-supported`, và bootstrap hiện đúng lỗi khởi tạo.
  return { shell: 'none', missingGroups: [], channels: { invoke: '', send: '' } };
})();
