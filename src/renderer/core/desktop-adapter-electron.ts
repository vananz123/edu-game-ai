// Adapter Electron của façade: bọc `window.eduGame` do `src/preload.ts` expose.
//
// Không đổi một kênh nào — façade giữ ĐÚNG 92 khoá của hợp đồng, và adapter này chỉ
// đổi tên gọi (`getLibrary`) thành khoá cầu (`getLibrary`) rồi gọi. Vì vậy bản
// Electron chạy hành vi y như trước giai đoạn 2, trong khi renderer chỉ còn một
// cửa. Cửa sổ không có cầu (`window.eduGame` vắng, ví dụ mở index.html bằng
// trình duyệt) → `null`; bootstrap báo lỗi "không thể khởi tạo" như trước.


function createElectronDesktopAdapter(bridgeName?: string): DesktopAdapter | null {
  const name = bridgeName || 'eduGame';
  const root: any = typeof window === 'undefined' ? null : window;
  const bridge = root ? root[name] : null;
  if (!bridge) return null;

  function member(call: string): any {
    const fn = bridge[call];
    return typeof fn === 'function' ? fn : null;
  }

  return {
    name: 'electron',
    invoke(call, args) {
      const fn = member(call);
      if (!fn) {
        return Promise.reject(DESKTOP_FACADE_SCHEMA.error('not-supported', call, `Cầu Electron không có lời gọi ${call}`));
      }
      return Promise.resolve(fn.apply(bridge, args));
    },
    listen(call, handler) {
      const fn = member(call);
      if (!fn) {
        throw DESKTOP_FACADE_SCHEMA.error('not-supported', call, `Cầu Electron không có sự kiện ${call}`);
      }
      const off = fn.call(bridge, handler);
      // Preload luôn trả hàm huỷ; phòng khi một bản cũ không trả, façade vẫn cần
      // một hàm vô hại để `desktop.listen` giữ đúng hợp đồng.
      return typeof off === 'function'
        ? () => { try { off(); } catch { /* vô hại */ } }
        : () => {};
    },
  };
}
