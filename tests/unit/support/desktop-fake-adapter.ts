// Adapter giả cho test hợp đồng của façade (giai đoạn 2).
//
// Mục đích: chạy `desktop.call` / `desktop.listen` mà không có vỏ nào — không
// Electron, không Tauri, không IPC. Test khai sẵn câu trả lời theo tên lời gọi,
// hoặc để đăng ký một "máy chủ" tự trả lời cho cả 92 lời gọi để kiểm tra luồng
// dữ liệu thật (kết quả → renderer, lỗi → DesktopError, sự kiện → handler).
//
// Tệp nằm dưới tests/ để không bị chép vào `dist/src/renderer` (bundle UI);
// `tsconfig` vẫn biên dịch sang `dist/tests/unit/support`.

interface FakeCall {
  call: string;
  args: unknown[];
}

interface FakeListener {
  call: string;
  handler: (payload: unknown) => void;
  closed: boolean;
}

function createFakeDesktopAdapter(options?: {
  name?: string;
  missingGroups?: string[];
  respond?: (call: string, args: unknown[]) => unknown;
}) {
  const calls: FakeCall[] = [];
  const listeners: FakeListener[] = [];
  const behaviour = options || {};

  const adapter = {
    name: behaviour.name || 'fake',
    missingGroups: behaviour.missingGroups ? behaviour.missingGroups.slice() : undefined,
    invoke(call: string, args: unknown[]) {
      calls.push({ call, args });
      if (!behaviour.respond) return Promise.resolve(undefined);
      try {
        return Promise.resolve(behaviour.respond(call, args));
      } catch (error) {
        return Promise.reject(error);
      }
    },
    listen(call: string, handler: (payload: unknown) => void) {
      const entry: FakeListener = { call, handler, closed: false };
      listeners.push(entry);
      return () => {
        entry.closed = true;
      };
    },
  };

  return {
    adapter,
    calls,
    listeners,
    /** Kênh (không phải tên lời gọi) đã được gọi, theo đúng thứ tự. */
    channels(invokeChannelOf: (call: string) => string) {
      return calls.map(entry => invokeChannelOf(entry.call));
    },
    /** Đẩy một sự kiện tới mọi đăng ký còn mở của `call`; trả về số handler nhận. */
    emit(call: string, payload: unknown) {
      let delivered = 0;
      for (const entry of listeners) {
        if (entry.call !== call || entry.closed) continue;
        entry.handler(payload);
        delivered += 1;
      }
      return delivered;
    },
    openListeners(call?: string) {
      return listeners.filter(entry => !entry.closed && (!call || entry.call === call)).length;
    },
  };
}

export { createFakeDesktopAdapter };
