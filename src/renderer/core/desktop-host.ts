// Khởi tạo adapter Tauri và nối vào façade desktop.
//
// Nạp SAU `desktop-facade.js` và `desktop-adapter-tauri.js`, TRƯỚC mọi tệp gọi `desktop.*`.
// Không gọi mạng, không đọc tệp: chỉ nhìn `window.__TAURI__`.
//
// Tên lệnh Rust là chi tiết của adapter, không phải của host: host chỉ chọn
// adapter và nối nó vào façade. Phía Rust tự dịch kênh (`app:info` → nhánh
// `app:info` của `dispatch()` trong `src-tauri/src/api.rs`).
//
// ── Cửa sổ trình chiếu ──────────────────────────────────────────────────
// `presentation.html` không nạp `desktop-host.js`; nó dùng thẳng
// `desktopCoreChooseAdapter()` trước `initPresentation()`.

interface DesktopHost {
  shell: 'tauri' | 'none';
  missingGroups: string[];
  /** Chỉ để chẩn đoán. */
  channels: { invoke: string; send: string };
  notes?: string;
}

/**
 * Khởi tạo adapter Tauri. Trả `null` khi không tìm thấy `window.__TAURI__`
 * (ví dụ mở index.html thẳng trong trình duyệt).
 */
function desktopCoreChooseAdapter(root: any): { adapter: any; shell: 'tauri' } | null {
  if (!root || !root.__TAURI__ || !root.__TAURI__.core) return null;
  const adoption = createTauriDesktopAdapter(root.__TAURI__, {
    missingGroups: [],
    supportsSend: true,
  });
  return adoption ? { adapter: adoption, shell: 'tauri' } : null;
}

const desktopHost: DesktopHost = (function attachDesktopHost(): DesktopHost {
  const root: any = typeof window === 'undefined' ? null : window;
  const chosen = desktopCoreChooseAdapter(root);

  if (chosen) {
    desktop.attach(chosen.adapter);
    const commands = chosen.adapter.commands || { invoke: '', send: '' };
    return {
      shell: 'tauri',
      missingGroups: [],
      channels: { invoke: commands.invoke, send: commands.send },
      notes: 'renderer → __TAURI__.core.invoke',
    };
  }

  // Không có vỏ: giữ façade chưa nối. `desktop.call` từ chối với mã `not-supported`.
  return { shell: 'none', missingGroups: [], channels: { invoke: '', send: '' } };
})();
