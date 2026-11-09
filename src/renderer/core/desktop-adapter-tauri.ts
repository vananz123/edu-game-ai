// Adapter Tauri của façade (giai đoạn 2).
//
// Vỏ Tauri KHÔNG expose `window.eduGame`: cầu `edugame-bridge.js` của giai đoạn 1
// dựng đúng bề mặt preload Electron từ `src/shared/desktop-contract.json`, nhưng
// từ giai đoạn 2 renderer đã có façade, nên bề mặt đó không cần nữa. Adapter này
// nói thẳng với `__TAURI__`:
//
//   • lời gọi giá trị → `core.invoke('invoke_channel', { channel, args })`; tên
//     lệnh và chuỗi kênh KHÔNG trùng nhau có chủ đích, xem `src-tauri/src/api.rs`;
//   • nhóm trình chiếu → `core.invoke('send_channel', { channel, args })`, vì ba
//     kênh đó bên Electron là `ipcRenderer.send` (không chờ trả lời);
//   • sự kiện → `event.listen(call, …)`, dùng đúng tên khoá của façade làm tên
//     sự kiện Tauri (`about:state-push`, `lesson:progress`, …).
//
// Giai đoạn 1 dựng `window.eduGame` bằng một cầu riêng trong gói Tauri; giai
// đoạn 2 bỏ hẳn cầu đó (`scripts/build-tauri-frontend.js` chỉ còn sinh
// `edugame-guard.js`), nên `window.eduGame` không tồn tại trong vỏ Tauri nữa.
//
// Đăng ký sự kiện: `__TAURI__.event.listen` là async. Façade cho phép hàm huỷ
// được gọi ngay (kể cả khi lần nối còn đang chờ), nên adapter đánh dấu
// `closed` và tự huỷ khi promise về muộn.


interface TauriAdapterOptions {
  /**
   * Nhóm vỏ chưa làm được. Mặc định rỗng: giai đoạn 1 chỉ thiếu các LỆNH trình
   * chiếu, nên adapter khai phần đó qua `hasChannel(call)` thay vì cấm cả nhóm —
   * nhóm còn sự kiện `onPresentationExit` dùng được.
   */
  missingGroups?: string[];
  /** Lệnh Rust khai một lời gọi có trả lời (mặc định `invoke_channel`). */
  invokeCommand?: string;
  /** Lệnh Rust khai một kênh `send` của trình chiếu (mặc định `send_channel`). */
  sendCommand?: string;
  /**
   * Vỏ đã có thân thật cho ba kênh `send` của trình chiếu chưa. Giai đoạn 2
   * chưa có → façade từ chối ba kênh đó ở cửa, không để chúng đi vào một lệnh
   * chỉ trả câu "chưa có thân".
   */
  supportsSend?: boolean;
}

/**
 * Kênh `send` (không chờ kết quả): schema đánh dấu bằng `kind: 'send'`. Đọc từ
 * `DESKTOP_CALLS` chứ không gõ tay danh sách, nên không thể lệch khỏi hợp đồng.
 */
function isSendChannel(call: string): boolean {
  const spec = DESKTOP_FACADE_SCHEMA.calls[call];
  return Boolean(spec && spec.kind === 'send');
}

/**
 * Chuỗi kênh Rust kiểm tra (`INVOKE_CHANNELS` / `SEND_CHANNELS`), không phải tên
 * khoá của façade.
 *
 * Hai tên khác nhau ở ĐÂY là cố ý: `window.eduGame` của Electron được đánh khoá
 * theo tên façade (`appInfo`), nên adapter Electron chỉ việc tra thẳng; còn
 * `dispatch()` của Rust đánh khoá theo chuỗi kênh IPC Electron (`app:info`). Gửi
 * tên façade sang Rust sẽ bị từ chối với "không thuộc hợp đồng desktop".
 */
function channelOf(call: string): string {
  const spec = DESKTOP_FACADE_SCHEMA.calls[call];
  if (spec && spec.channel) return spec.channel;
  // Lời gọi điều khiển của cổng kiểm tra: kênh riêng, không thuộc hợp đồng
  // Electron (`desktop.gate('setPackageGateTurn', n)`).
  const gate = DESKTOP_FACADE_SCHEMA.gateCalls[call];
  return gate || call;
}

function createTauriDesktopAdapter(tauriApi?: any, options?: TauriAdapterOptions): DesktopAdapter | null {
  const api = tauriApi || (typeof window === 'undefined' ? null : (window as any).__TAURI__);
  if (!api || !api.core || typeof api.core.invoke !== 'function') return null;
  if (!api.event || typeof api.event.listen !== 'function') return null;

  const invoke = api.core.invoke;
  const listen = api.event.listen;
  const invokeCommand = (options && options.invokeCommand) || 'invoke_channel';
  const sendCommand = (options && options.sendCommand) || 'send_channel';
  const supportsSend = Boolean(options && options.supportsSend);

  /** Xem `DesktopAdapter.hasChannel`: kênh nào vỏ chưa nối. */
  function hasChannel(_channel: string, call: string): boolean {
    return !isSendChannel(call) || supportsSend;
  }

  return {
    name: 'tauri',
    // Tên lệnh Rust chỉ nằm ở đây; `desktop-host` đọc lại để chẩn đoán thay vì
    // gõ lại một bản sao thứ hai có thể lệch.
    commands: { invoke: invokeCommand, send: sendCommand },
    // Lệnh `presentation:*` (gửi đi) chưa có thân thật trong api.rs; khai qua
    // `hasChannel` để façade từ chối đúng ba kênh `send` TRƯỚC ranh giới IPC,
    // trong khi nhóm trình chiếu vẫn còn sự kiện dùng được.
    missingGroups: options && Array.isArray(options.missingGroups) ? options.missingGroups.slice() : [],
    invoke(call, args) {
      // Kênh `send` bên Electron là `ipcRenderer.send` (không có kết quả);
      // `send_channel` giữ đúng ngữ nghĩa đó. Khi vỏ chưa có thân thật cho ba
      // kênh đó, façade đã từ chối ở cửa qua `hasChannel`.
      const command = isSendChannel(call) ? sendCommand : invokeCommand;
      const channel = channelOf(call);
      const payload = args.length ? { channel, args } : { channel };
      return Promise.resolve(invoke(command, payload) as Promise<unknown>);
    },
    listen(call, handler) {
      let closed = false;
      let unlisten: (() => void) | null = null;
      const armed = Promise.resolve(listen(channelOf(call), (event: { payload: unknown }) => {
        if (closed) return;
        handler(event.payload);
      }));
      armed.then(
        (stop: any) => {
          if (typeof stop !== 'function') return;
          if (closed) stop();
          else unlisten = stop;
        },
        () => { /* lỗi đăng ký: bootstrap đã kiểm tra adapter trước khi dùng */ },
      );
      return () => {
        if (closed) return;
        closed = true;
        if (unlisten) { try { unlisten(); } catch { /* vô hại */ } }
      };
    },
    // Ba kênh `send` chưa có thân thật trong vỏ → chưa nối. Façade dùng câu trả
    // lời này để từ chối `sendPresentationExit` mà không chạm IPC, và vẫn cho
    // `onPresentationExit` (cùng chuỗi kênh, nhưng là sự kiện) đi qua.
    hasChannel: hasChannel,
  };
}
